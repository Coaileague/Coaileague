/**
 * Claude Verification Service - Claude QA for Trinity's decisions
 * 
 * For critical operations (payroll, invoices, compliance), Claude reviews
 * Trinity's proposed actions before execution, providing a safety net.
 */

import { aiCreditGateway } from '../../billing/aiCreditGateway';
import { aiActionLogger, type AIActionContext } from './aiActionLogger';
import { type ConfidenceScore, type TrinityOperation } from './trinityConfidenceScorer';
import { createLogger } from '../../../lib/logger';
const log = createLogger('claudeVerificationService');

export interface VerificationRequest {
  operation: TrinityOperation;
  trinityConfidence: ConfidenceScore;
  trinityProposedAction: any;
  context: AIActionContext;
}

export interface VerificationResult {
  approved: boolean;
  boostedConfidence: number;
  criticalIssues: string[];
  suggestedModifications: any | null;
  rejectionReason: string | null;
  reasoning: string;
  creditsUsed: number;
}

class ClaudeVerificationService {
  private getApiKey(): string {
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Claude API key not configured');
    }
    return apiKey;
  }

  isAvailable(): boolean {
    return !!(process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY);
  }

  async verify(params: VerificationRequest): Promise<VerificationResult> {
    const startTime = Date.now();
    if (!this.isAvailable()) {
      log.warn('[ClaudeVerificationService] Claude API key not configured, skipping verification');
      return {
        approved: false,
        boostedConfidence: 0,
        criticalIssues: ['Claude verification service not configured'],
        suggestedModifications: null,
        rejectionReason: 'Claude API key not configured - verification unavailable',
        reasoning: 'Claude verification service is not available. Configure CLAUDE_API_KEY or ANTHROPIC_API_KEY to enable.',
        creditsUsed: 0,
      };
    }
    const apiKey = this.getApiKey();
    const featureKey = 'claude_verification';
    const creditsForVerification = 15;

    const preAuth = await aiCreditGateway.preAuthorize(
      params.context.workspaceId,
      params.context.userId,
      featureKey
    );
    if (!preAuth.authorized) {
      throw new Error(preAuth.reason || 'Insufficient credits for Claude verification');
    }

    try {
      const systemPrompt = this.buildVerificationPrompt(params);

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: JSON.stringify({
              operation_type: params.operation.type,
              trinity_confidence: params.trinityConfidence.score,
              trinity_concerns: params.trinityConfidence.concerns,
              edge_cases: params.trinityConfidence.edgeCases,
              proposed_action: params.trinityProposedAction,
            }, null, 2),
          }],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Claude verification API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const verificationText = data.content?.[0]?.text || '';
      const verification = this.parseVerificationResponse(verificationText);
      const creditsUsed = creditsForVerification;

      await aiCreditGateway.finalizeBilling(
        params.context.workspaceId,
        params.context.userId,
        featureKey,
        creditsUsed
      );

      await aiActionLogger.logVerification({
        context: params.context,
        operationType: params.operation.type,
        trinityConfidenceScore: params.trinityConfidence.score,
        verification: {
          result: verification.approved 
            ? (verification.suggestedModifications ? 'approved_with_modifications' : 'approved')
            : 'rejected',
          notes: verification.reasoning,
        },
        requestData: {
          operationType: params.operation.type,
          trinityConfidence: params.trinityConfidence,
        },
        responseData: verification,
        metrics: {
          creditsUsed,
          durationMs: Date.now() - startTime,
          confidenceScore: params.trinityConfidence.score,
        },
      });

      return {
        ...verification,
        creditsUsed,
      };
    } catch (error: any) {
      log.error('[ClaudeVerificationService] Verification failed:', error);

      return {
        approved: false,
        boostedConfidence: 0,
        criticalIssues: ['Verification service error'],
        suggestedModifications: null,
        rejectionReason: `Verification failed: ${(error instanceof Error ? error.message : String(error))}`,
        reasoning: 'Could not complete Claude verification - defaulting to rejection for safety',
        creditsUsed: 0,
      };
    }
  }

  private buildVerificationPrompt(params: VerificationRequest): string {
    return `You are Claude, acting as a verification layer for Trinity (your AI partner).

YOUR ROLE: Quality Assurance & Reasoning Validator

Trinity is about to execute: ${params.operation.type}

Trinity's confidence level: ${params.trinityConfidence.score}/100

Trinity's concerns:
${params.trinityConfidence.concerns.map(c => `- ${c}`).join('\n') || '- None reported'}

Edge cases Trinity detected:
${params.trinityConfidence.edgeCases.map(e => `- ${e}`).join('\n') || '- None detected'}

YOUR TASK:
1. Review Trinity's proposed action for logical errors
2. Check for edge cases Trinity might have missed
3. Verify calculations are correct (especially financial)
4. Ensure compliance/regulatory requirements are met
5. Assess if action is reasonable given the context

RESPOND WITH JSON ONLY:
{
  "approved": true,
  "boosted_confidence": 95,
  "critical_issues": [],
  "suggested_modifications": null,
  "rejection_reason": null,
  "reasoning": "Brief explanation of your decision"
}

VERIFICATION CRITERIA:
✅ APPROVE if:
- Calculations appear correct
- No regulatory violations detected
- Edge cases properly handled
- Risk is acceptable

❌ REJECT if:
- Mathematical errors detected
- Compliance issues found
- Critical edge case overlooked
- Unacceptable risk

⚠️ APPROVE WITH MODIFICATIONS if:
- Generally correct but needs minor adjustments
- Better approach available
- Can improve accuracy

Remember: You're the final check before Trinity executes. Be thorough but efficient.
Trinity trusts your reasoning - don't let errors through.`;
  }

  private parseVerificationResponse(text: string): Omit<VerificationResult, 'creditsUsed'> {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in verification response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        approved: parsed.approved === true,
        boostedConfidence: typeof parsed.boosted_confidence === 'number' ? parsed.boosted_confidence : 0,
        criticalIssues: Array.isArray(parsed.critical_issues) ? parsed.critical_issues : [],
        suggestedModifications: parsed.suggested_modifications || null,
        rejectionReason: parsed.rejection_reason || null,
        reasoning: parsed.reasoning || '',
      };
    } catch (error) {
      log.error('[ClaudeVerificationService] Failed to parse verification response:', text);

      return {
        approved: false,
        boostedConfidence: 0,
        criticalIssues: ['Failed to parse verification response'],
        suggestedModifications: null,
        rejectionReason: 'Verification parsing error',
        reasoning: 'Could not parse Claude verification response - defaulting to rejection for safety',
      };
    }
  }
}

export const claudeVerificationService = new ClaudeVerificationService();
