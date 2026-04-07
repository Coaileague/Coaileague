/**
 * AUTOSCHEDULER AUDIT TRACKER™ - AI Grievance Summarization
 * 
 * AI analyzes employee grievances/disputes and provides:
 * - Summary of the dispute
 * - Recommendation (approve/reject/needs_review/escalate)
 * - Confidence score
 * - Key factors considered
 * 
 * Human managers make final decision with AI insight.
 */

import { getMeteredOpenAICompletion } from './billing/universalAIBillingInterceptor';
import { platformEventBus } from './platformEventBus';
import { createLogger } from '../lib/logger';
const log = createLogger('disputeAI');


export interface DisputeAnalysis {
  summary: string;
  recommendation: 'approve' | 'reject' | 'needs_review' | 'escalate';
  confidenceScore: number; // 0.00-1.00
  analysisFactors: string[];
  model: string;
}

/**
 * Analyze a dispute/grievance using AI
 */
export async function analyzeDispute(
  disputeTitle: string,
  disputeReason: string,
  disputeType: string,
  requestedOutcome: string | null,
  evidence: string[] | null,
  targetContext?: {
    targetType: string;
    targetData?: any; // Review data, report data, etc.
  },
  billingContext?: {
    workspaceId: string;
    userId?: string;
  }
): Promise<DisputeAnalysis> {
  try {
    // Build context for AI
    const evidenceText = evidence && evidence.length > 0
      ? `\n\nSupporting Evidence URLs:\n${evidence.join('\n')}`
      : '';

    const outcomeText = requestedOutcome
      ? `\n\nRequested Outcome: ${requestedOutcome}`
      : '';

    const targetText = targetContext?.targetData
      ? `\n\nOriginal ${targetContext.targetType} Data: ${JSON.stringify(targetContext.targetData, null, 2)}`
      : '';

    const prompt = `You are an AI assistant helping HR managers review employee grievances/disputes. Analyze the following dispute and provide a summary, recommendation, and key factors.

**Dispute Type**: ${disputeType}
**Title**: ${disputeTitle}

**Employee's Reason for Filing**:
${disputeReason}${evidenceText}${outcomeText}${targetText}

Please analyze this dispute and respond with a JSON object containing:
1. "summary": A concise 2-3 sentence summary of the dispute
2. "recommendation": One of: "approve" (employee is clearly right), "reject" (dispute lacks merit), "needs_review" (requires human judgment), or "escalate" (involves legal/compliance issues)
3. "confidenceScore": A number between 0.00 and 1.00 indicating your confidence in the recommendation
4. "analysisFactors": An array of 3-5 key factors you considered (e.g., "Employee provided specific dates and times", "Manager notes corroborate employee's account", "No supporting evidence provided", "Potential FLSA violation")

Consider:
- Labor law compliance (FLSA, OSHA, state laws)
- Fairness and consistency
- Available evidence
- Severity of the issue
- Potential legal implications

Respond ONLY with valid JSON, no other text.`;

    if (!billingContext?.workspaceId) {
      throw new Error('Workspace ID required for dispute AI analysis - cannot process unbilled operations');
    }
    const wsId = billingContext.workspaceId;
    const result = await getMeteredOpenAICompletion({
      workspaceId: wsId,
      userId: billingContext?.userId,
      featureKey: 'disputeai_analysis',
      messages: [
        {
          role: 'system',
          content: 'You are an expert HR compliance advisor analyzing employee grievances. Respond only with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 1000,
      jsonMode: true,
    });

    if (!result.success) {
      if (result.blocked) {
        throw new Error(`Insufficient credits for dispute analysis: ${result.error}`);
      }
      throw new Error(`AI analysis failed: ${result.error}`);
    }

    log.info(`[DisputeAI] Billed ${result.tokensUsed} tokens to workspace ${wsId}`);

    const responseText = result.content?.trim() || '{}';
    
    // Parse AI response
    let aiResponse: any;
    try {
      aiResponse = JSON.parse(responseText);
    } catch (parseError) {
      // Fallback if JSON parsing fails
      log.error('Failed to parse AI response:', responseText);
      return {
        summary: 'AI analysis unavailable - manual review required',
        recommendation: 'needs_review',
        confidenceScore: 0,
        analysisFactors: ['AI processing error - human review required'],
        model: 'gpt-4-turbo'
      };
    }

    // Validate and sanitize AI response
    const disputeResult: DisputeAnalysis = {
      summary: aiResponse.summary || 'No summary provided',
      recommendation: ['approve', 'reject', 'needs_review', 'escalate'].includes(aiResponse.recommendation)
        ? aiResponse.recommendation
        : 'needs_review',
      confidenceScore: Math.min(Math.max(parseFloat(aiResponse.confidenceScore) || 0, 0), 1),
      analysisFactors: Array.isArray(aiResponse.analysisFactors)
        ? aiResponse.analysisFactors.slice(0, 10)
        : ['AI analysis completed'],
      model: 'gpt-4-turbo'
    };

    if (billingContext?.workspaceId) {
      platformEventBus.publish({
        type: 'dispute_analyzed',
        category: 'workforce',
        title: 'Dispute AI Analysis Completed',
        description: `AI analyzed dispute "${disputeTitle}" — recommendation: ${disputeResult.recommendation} (confidence: ${Math.round(disputeResult.confidenceScore * 100)}%)`,
        workspaceId: billingContext.workspaceId,
        metadata: { disputeType, recommendation: disputeResult.recommendation, confidenceScore: disputeResult.confidenceScore },
      });
    }

    return disputeResult;

  } catch (error: any) {
    log.error('Error analyzing dispute with AI:', error);
    
    // Return fallback analysis
    return {
      summary: 'AI analysis unavailable - manual review required',
      recommendation: 'needs_review',
      confidenceScore: 0,
      analysisFactors: ['AI service error - human review required'],
      model: 'gpt-4-turbo'
    };
  }
}

/**
 * Detect labor law compliance category from dispute content
 */
export function detectComplianceCategory(
  disputeReason: string,
  disputeType: string
): {
  category: string | null;
  regulatoryReference: string | null;
} {
  const reasonLower = disputeReason.toLowerCase();

  // FLSA - Fair Labor Standards Act
  if (reasonLower.includes('overtime') || 
      reasonLower.includes('minimum wage') ||
      reasonLower.includes('unpaid') ||
      reasonLower.includes('off the clock')) {
    return {
      category: 'flsa',
      regulatoryReference: 'FLSA §207 (Overtime)'
    };
  }

  // Payday laws
  if (reasonLower.includes('late paycheck') ||
      reasonLower.includes('missing wages') ||
      reasonLower.includes('payroll error') ||
      reasonLower.includes('final paycheck')) {
    return {
      category: 'payday_law',
      regulatoryReference: 'State Payday Law'
    };
  }

  // OSHA - Safety violations
  if (reasonLower.includes('unsafe') ||
      reasonLower.includes('safety') ||
      reasonLower.includes('injury') ||
      reasonLower.includes('hazard')) {
    return {
      category: 'osha',
      regulatoryReference: 'OSHA Safety Standards'
    };
  }

  // Unemployment eligibility
  if (reasonLower.includes('termination') ||
      reasonLower.includes('unemployment') ||
      reasonLower.includes('wrongful') ||
      reasonLower.includes('fired')) {
    return {
      category: 'unemployment',
      regulatoryReference: 'State Unemployment Law'
    };
  }

  // General labor law
  if (reasonLower.includes('break') ||
      reasonLower.includes('meal period') ||
      reasonLower.includes('rest period') ||
      reasonLower.includes('discrimination') ||
      reasonLower.includes('retaliation')) {
    return {
      category: 'labor_law',
      regulatoryReference: 'DOL Labor Standards'
    };
  }

  return {
    category: null,
    regulatoryReference: null
  };
}
