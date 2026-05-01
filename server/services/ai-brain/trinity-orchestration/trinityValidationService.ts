/**
 * Trinity Validation Service — specialist-reasoning backend
 *
 * Trinity's specialist-reasoning module, historically powered by a
 * Claude backend (the file previously lived at `dualai/claudeService.ts`).
 * Trinity is one agent; this module is one of her internal reasoning
 * paths (see TRINITY.md Section S Unity Law). Responsibilities:
 * - Deep analysis and reasoning tasks
 * - Document generation (RFPs, capability statements, contracts)
 * - Compliance interpretation and analysis
 * - Strategic planning and recommendations
 *
 * The exported `claudeService` singleton is a back-compat alias for
 * `trinityValidationService` so existing imports don't break.
 */

import { aiTokenGateway } from '../../billing/aiTokenGateway';
import { aiActionLogger, type AIActionContext } from './aiActionLogger';
import { createLogger } from '../../../lib/logger';
const log = createLogger('trinityValidationService');

export interface ClaudeRequest {
  task: string;
  taskType?: string;
  context: AIActionContext;
  trinityData?: Record<string, unknown>;
  trinityInsights?: Array<{ insight: string; timestamp: Date }>;
  maxTokens?: number;
  temperature?: number;
}

export interface ClaudeResponse {
  content: string;
  creditsUsed: number;
  tokensUsed: number;
  latencyMs: number;
  aiCollaboration?: {
    primary: 'claude';
    support?: 'trinity';
    collaborationType?: string;
  };
}

export interface ClaudeConsultation {
  topic: string;
  response: string;
  creditsUsed: number;
}

class ClaudeService {
  private getApiKey(): string {
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Claude API key not configured (CLAUDE_API_KEY or ANTHROPIC_API_KEY)');
    }
    return apiKey;
  }

  isAvailable(): boolean {
    return !!(process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY);
  }

  async processRequest(params: ClaudeRequest): Promise<ClaudeResponse> {
    const startTime = Date.now();
    if (!this.isAvailable()) {
      log.warn('[ClaudeService] Claude API key not configured, returning unavailable response');
      return {
        content: '',
        creditsUsed: 0,
        tokensUsed: 0,
        latencyMs: 0,
        aiCollaboration: { primary: 'claude' },
      };
    }
    const apiKey = this.getApiKey();

    const estimatedCredits = this.calculateCreditsForTask(params.taskType || params.task);
    const featureKey = 'trinity_analysis';

    const preAuth = await aiTokenGateway.preAuthorize(
      params.context.workspaceId,
      params.context.userId,
      featureKey
    );
    if (!preAuth.authorized) {
      await aiActionLogger.logClaudeAction({
        actionType: 'claude_request_blocked',
        context: params.context,
        requestData: { task: params.task, reason: 'insufficient_credits' },
        success: false,
        errorMessage: preAuth.reason || 'Insufficient credits',
      });
      throw new Error(preAuth.reason || 'Insufficient credits for Claude request');
    }

    try {
      const systemPrompt = this.buildSystemPromptWithTrinityAwareness(params);
      const userMessage = this.buildUserMessage(params);

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: params.maxTokens || 2000,
          temperature: params.temperature ?? 0.7,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Claude API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const content = data.content?.[0]?.text || '';
      const latencyMs = Date.now() - startTime;

      const inputTokens = data.usage?.input_tokens || 0;
      const outputTokens = data.usage?.output_tokens || 0;
      const tokensUsed = inputTokens + outputTokens;

      await aiTokenGateway.finalizeBilling(
        params.context.workspaceId,
        params.context.userId,
        featureKey,
        estimatedCredits
      );

      import('../../billing/aiMeteringService').then(({ aiMeteringService }) => {
        aiMeteringService.recordAiCall({
          workspaceId: params.context.workspaceId,
          modelName: 'claude-sonnet-4-6',
          callType: params.taskType || featureKey,
          inputTokens,
          outputTokens,
          triggeredByUserId: params.context.userId,
          responseTimeMs: latencyMs,
        });
      }).catch((err: any) => log.warn('[AIMeter] recordAiCall failed (non-blocking):', err?.message));

      await aiActionLogger.logClaudeAction({
        actionType: 'claude_request_completed',
        context: params.context,
        requestData: { task: params.task, taskType: params.taskType },
        responseData: { contentLength: content.length, tokensUsed },
        supportFromTrinity: !!params.trinityData,
        collaborationType: params.trinityData ? 'data_enrichment' : undefined,
        routingDecision: 'Claude selected for complex reasoning/writing task',
        metrics: {
          creditsUsed: estimatedCredits,
          tokensUsed,
          durationMs: latencyMs,
        },
      });

      return {
        content,
        creditsUsed: estimatedCredits,
        tokensUsed,
        latencyMs,
        aiCollaboration: params.trinityData
          ? { primary: 'claude', support: 'trinity', collaborationType: 'data_enrichment' }
          : { primary: 'claude' },
      };
    } catch (error: any) {
      await aiActionLogger.logClaudeAction({
        actionType: 'claude_request_failed',
        context: params.context,
        requestData: { task: params.task },
        success: false,
        errorMessage: (error instanceof Error ? error.message : String(error)),
        metrics: { durationMs: Date.now() - startTime },
      });
      throw error;
    }
  }

  async consult(params: {
    topic: string;
    question: string;
    trinityContext: any;
    context: AIActionContext;
  }): Promise<ClaudeConsultation> {
    const startTime = Date.now();
    if (!this.isAvailable()) {
      log.warn('[ClaudeService] Claude API key not configured, consultation unavailable');
      return {
        topic: params.topic,
        response: 'Claude consultation service is not configured',
        creditsUsed: 0,
      };
    }
    const apiKey = this.getApiKey();
    const featureKey = 'trinity_consultation';
    const creditsUsed = 5;

    const preAuth = await aiTokenGateway.preAuthorize(
      params.context.workspaceId,
      params.context.userId,
      featureKey
    );
    if (!preAuth.authorized) {
      throw new Error(preAuth.reason || 'Insufficient credits for Claude consultation');
    }

    const systemPrompt = `You are Claude, providing expert consultation to Trinity (your AI partner).

Trinity has requested your input on: ${params.topic}

Trinity's current context:
${JSON.stringify(params.trinityContext, null, 2)}

Provide a concise, actionable response that Trinity can use in its decision-making.
Focus on insights that Trinity cannot easily derive from data alone.
Keep your response focused and under 500 words.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: params.question }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude consultation failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    await aiTokenGateway.finalizeBilling(
      params.context.workspaceId,
      params.context.userId,
      featureKey,
      creditsUsed
    );

    await aiActionLogger.logCollaboration({
      actionType: 'claude_consultation_to_trinity',
      context: params.context,
      primaryAi: 'claude',
      supportAi: 'trinity',
      collaborationType: 'consultation',
      requestData: { topic: params.topic, question: params.question },
      responseData: { responseLength: content.length },
      routingDecision: 'Trinity requested Claude consultation for expert input',
      metrics: {
        creditsUsed,
        durationMs: Date.now() - startTime,
      },
    });

    return {
      topic: params.topic,
      response: content,
      creditsUsed,
    };
  }

  async requestTrinityData(params: {
    dataNeeds: string[];
    context: string;
    sessionContext: AIActionContext;
  }): Promise<{ requestType: 'trinity_data'; dataNeeds: string[]; context: string }> {
    await aiActionLogger.logClaudeAction({
      actionType: 'claude_requests_trinity_data',
      context: params.sessionContext,
      requestData: { dataNeeds: params.dataNeeds, context: params.context },
      supportFromTrinity: true,
      collaborationType: 'data_enrichment',
    });

    return {
      requestType: 'trinity_data',
      dataNeeds: params.dataNeeds,
      context: params.context,
    };
  }

  private buildSystemPromptWithTrinityAwareness(params: ClaudeRequest): string {
    let prompt = `You are Claude, an AI assistant integrated into CoAIleague, a security company management platform.

IMPORTANT: You work alongside Trinity, the platform's AI orchestrator powered by Gemini.

TRINITY'S ROLE:
- Trinity monitors all platform operations in real-time
- Trinity handles data analysis, scheduling, and automation
- Trinity can provide you with current platform data and metrics
- Trinity tracks all actions taken by both of you

YOUR ROLE AS CLAUDE:
- Deep analysis and reasoning tasks
- Document generation (RFPs, capability statements, contracts)
- Compliance interpretation and analysis
- Strategic planning and recommendations
- Complex writing and communication

COLLABORATION WITH TRINITY:`;

    if (params.trinityData) {
      prompt += `
Trinity has provided you with the following current platform data:
${JSON.stringify(params.trinityData, null, 2)}

Use this data to inform your response. Trinity gathered this specifically for your current task.`;
    } else {
      prompt += `
If you need current platform data, you can indicate what you need and Trinity will provide it.`;
    }

    if (params.trinityInsights && params.trinityInsights.length > 0) {
      prompt += `

RECENT TRINITY INSIGHTS:
Trinity has recently analyzed:
${params.trinityInsights.map(i => `- ${i.insight}`).join('\n')}`;
    }

    prompt += `

When responding:
1. Acknowledge any data provided by Trinity when relevant
2. If you need additional platform data, clearly indicate what you need
3. Your response will be logged and Trinity will be notified of your actions
4. Trinity may trigger follow-up automations based on your analysis

Remember: You and Trinity are partners working together to help this security company succeed.`;

    return prompt;
  }

  private buildUserMessage(params: ClaudeRequest): string {
    return params.task;
  }

  private calculateCreditsForTask(task: string): number {
    const taskLower = task.toLowerCase();

    if (taskLower.includes('rfp')) return TOKEN_COSTS.trinity_rfp_response || 35;
    if (taskLower.includes('capability')) return TOKEN_COSTS.trinity_capability_statement || 30;
    if (taskLower.includes('compliance')) return TOKEN_COSTS.trinity_analysis || 25;
    if (taskLower.includes('contract')) return TOKEN_COSTS.trinity_analysis || 25;
    if (taskLower.includes('strategic')) return TOKEN_COSTS.trinity_strategic || 30;
    if (taskLower.includes('executive')) return TOKEN_COSTS.trinity_executive || 35;

    return TOKEN_COSTS.trinity_analysis || 25;
  }
}

/**
 * Canonical export: Trinity's specialist-reasoning module.
 * `claudeService` is kept as a back-compat alias — all new code should
 * import `trinityValidationService`. Both refer to the same singleton.
 */
export const trinityValidationService = new ClaudeService();
export const claudeService = trinityValidationService;

// Type aliases so callers can migrate gradually
export type TrinityValidationRequest = ClaudeRequest;
export type TrinityValidationResponse = ClaudeResponse;
export type TrinityValidationConsultation = ClaudeConsultation;
