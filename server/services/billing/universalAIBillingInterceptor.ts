/**
 * UNIVERSAL AI BILLING INTERCEPTOR
 * =================================
 * ZERO TOKEN LOSS ENFORCEMENT (Feb 2026)
 * 
 * This interceptor ensures every OpenAI call across the platform is tracked and billed.
 * Routes ALL billing through the single aiCreditGateway for consistent enforcement.
 * 
 * CALL FLOW:
 * Service → getMeteredOpenAICompletion() → aiCreditGateway.preAuthorize()
 *         → OpenAI API call → aiCreditGateway.finalizeBilling()
 * 
 * No direct creditManager calls. No bypass. No silent failures.
 */

import { createLogger } from '../../lib/logger';
import OpenAI from 'openai';
import { aiCreditGateway } from './aiCreditGateway';

const log = createLogger('universalAIBillingInterceptor');
let _openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('No OpenAI API key configured');
    }
    _openaiClient = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
    });
  }
  return _openaiClient;
}

export interface MeteredOpenAIRequest {
  workspaceId?: string;
  userId?: string;
  featureKey: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface MeteredOpenAIResponse {
  success: boolean;
  content: string;
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  creditsCharged: number;
  model: string;
  error?: string;
  blocked?: boolean;
}

/**
 * METERED OpenAI completion - the ONLY way to call OpenAI with billing enforcement.
 * Routes through aiCreditGateway for consistent billing.
 * 
 * Accepts optional workspaceId - if missing, cost is tracked to PLATFORM_COST_CENTER.
 * Callers do NOT need to handle billing separately - this function handles everything.
 */
export async function getMeteredOpenAICompletion(
  request: MeteredOpenAIRequest
): Promise<MeteredOpenAIResponse> {
  const {
    workspaceId,
    userId = 'system',
    featureKey,
    messages,
    model = 'gpt-4o-mini',
    maxTokens = 1000,
    temperature = 0.7,
    jsonMode = false,
  } = request;

  const effectiveWorkspaceId = workspaceId || undefined;

  const authResult = await aiCreditGateway.preAuthorize(effectiveWorkspaceId, userId, featureKey);
  if (!authResult.authorized) {
    log.warn(`[BillingGate] BLOCKED OpenAI ${featureKey}: ${authResult.reason}`);
    return {
      success: false,
      content: '',
      tokensUsed: 0,
      inputTokens: 0,
      outputTokens: 0,
      creditsCharged: 0,
      model,
      blocked: true,
      error: authResult.reason,
    };
  }

  const startTime = Date.now();

  let client: OpenAI;
  try {
    client = getOpenAIClient();
  } catch (e) {
    log.warn('[UniversalAIBilling] OpenAI not configured, skipping intercepted call');
    return {
      success: false,
      content: '',
      tokensUsed: 0,
      inputTokens: 0,
      outputTokens: 0,
      creditsCharged: 0,
      model,
      error: 'OpenAI service not configured',
    };
  }

  try {
    const completionParams: any = {
      model,
      messages,
      max_completion_tokens: maxTokens,
      temperature,
    };

    if (jsonMode) {
      completionParams.response_format = { type: 'json_object' };
    }

    const response = await Promise.race([
      client.chat.completions.create(completionParams), // withGpt
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OpenAI API timeout after 30000ms')), 30000)
      )
    ]);

    const content = response.choices[0]?.message?.content || '';
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const tokensUsed = inputTokens + outputTokens;
    const latencyMs = Date.now() - startTime;

    await aiCreditGateway.finalizeBilling(
      effectiveWorkspaceId,
      userId,
      featureKey,
      tokensUsed,
      { model, inputTokens, outputTokens, latencyMs, provider: 'openai' }
    );

    log.info(`[BillingGate] OpenAI ${featureKey}: ${tokensUsed} tokens, ${latencyMs}ms, workspace=${effectiveWorkspaceId || 'PLATFORM'}`);

    return {
      success: true,
      content,
      tokensUsed,
      inputTokens,
      outputTokens,
      creditsCharged: authResult.classification.creditCost,
      model,
    };
  } catch (error: any) {
    log.error(`[BillingGate] OpenAI ${featureKey} FAILED: ${(error instanceof Error ? error.message : String(error))}`);

    return {
      success: false,
      content: '',
      tokensUsed: 0,
      inputTokens: 0,
      outputTokens: 0,
      creditsCharged: 0,
      model,
      error: (error instanceof Error ? error.message : String(error)),
    };
  }
}
