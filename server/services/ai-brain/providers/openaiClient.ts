/**
 * OpenAI Client - GPT-4 Provider for AI Orchestra
 * 
 * Completes the Trinity: Gemini (Operations) + Claude (Analysis) + GPT-4 (Creative/Strategic)
 * 
 * Model Tiers:
 * - GPT-4o: Best overall, multi-modal, fast
 * - GPT-4-turbo: Complex reasoning, longer context
 * - GPT-4o-mini: Fast, cheap for simple tasks
 * - GPT-3.5-turbo: Cheapest, grunt work
 */

import OpenAI from 'openai';
import { aiCreditGateway } from '../../billing/aiCreditGateway';
import { aiMeteringService } from '../../billing/aiMeteringService';
import { createLogger } from '../../../lib/logger';
const log = createLogger('openaiClient');

export type OpenAIModelId = 
  | 'gpt-4o'
  | 'gpt-4-turbo'
  | 'gpt-4o-mini'
  | 'gpt-3.5-turbo';

export interface OpenAIModelConfig {
  modelId: OpenAIModelId;
  maxTokens: number;
  costPer1kInputTokens: number;
  costPer1kOutputTokens: number;
  capabilities: string[];
  tier: 'worker' | 'operations' | 'strategic';
}

export const OPENAI_MODELS: Record<OpenAIModelId, OpenAIModelConfig> = {
  'gpt-4o': {
    modelId: 'gpt-4o',
    maxTokens: 128000,
    costPer1kInputTokens: 0.005,
    costPer1kOutputTokens: 0.015,
    capabilities: ['text', 'creative', 'sales', 'analysis', 'vision'],
    tier: 'strategic',
  },
  'gpt-4-turbo': {
    modelId: 'gpt-4-turbo',
    maxTokens: 128000,
    costPer1kInputTokens: 0.01,
    costPer1kOutputTokens: 0.03,
    capabilities: ['text', 'creative', 'sales', 'proposals', 'complex'],
    tier: 'strategic',
  },
  'gpt-4o-mini': {
    modelId: 'gpt-4o-mini',
    maxTokens: 128000,
    costPer1kInputTokens: 0.00015,
    costPer1kOutputTokens: 0.0006,
    capabilities: ['text', 'formatting', 'simple', 'chat'],
    tier: 'worker',
  },
  'gpt-3.5-turbo': {
    modelId: 'gpt-3.5-turbo',
    maxTokens: 16384,
    costPer1kInputTokens: 0.0005,
    costPer1kOutputTokens: 0.0015,
    capabilities: ['text', 'formatting', 'simple'],
    tier: 'worker',
  },
};

export interface OpenAIRequest {
  prompt: string;
  systemPrompt?: string;
  modelId?: OpenAIModelId;
  maxTokens?: number;
  temperature?: number;
  context?: Record<string, any>;
}

export interface OpenAIResponse {
  content: string;
  modelId: OpenAIModelId;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  latencyMs: number;
  finishReason: string;
}

export interface ModelHealth {
  modelId: OpenAIModelId;
  isHealthy: boolean;
  lastError?: string;
  lastErrorAt?: Date;
  avgLatencyMs: number;
  successRate: number;
  requestCount: number;
  errorCount: number;
}

class OpenAIClient {
  private client: OpenAI | null = null;
  private healthStatus: Map<OpenAIModelId, ModelHealth> = new Map();
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 1000;

  constructor() {
    this.initializeClient();
    this.initializeHealthTracking();
  }

  private initializeClient(): void {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
      log.info('[OpenAI] Client initialized');
    } else {
      log.warn('[OpenAI] No API key found - OpenAI features disabled');
    }
  }

  private initializeHealthTracking(): void {
    for (const modelId of Object.keys(OPENAI_MODELS) as OpenAIModelId[]) {
      this.healthStatus.set(modelId, {
        modelId,
        isHealthy: true,
        avgLatencyMs: 0,
        successRate: 1.0,
        requestCount: 0,
        errorCount: 0,
      });
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async generate(request: OpenAIRequest): Promise<OpenAIResponse> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized - missing API key');
    }

    const modelId = request.modelId || 'gpt-4o-mini';
    const modelConfig = OPENAI_MODELS[modelId];
    const startTime = Date.now();
    const workspaceId = request.context?.workspaceId;
    const userId = request.context?.userId;
    const featureKey = request.context?.featureKey || 'ai_general';

    const preAuth = await aiCreditGateway.preAuthorize(workspaceId, userId, featureKey);
    if (!preAuth.authorized) {
      throw new Error(preAuth.reason || 'Insufficient credits for OpenAI request');
    }

    try {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      
      if (request.systemPrompt) {
        messages.push({ role: 'system', content: request.systemPrompt });
      }
      
      messages.push({ role: 'user', content: request.prompt });

      const completion = await this.client.chat.completions.create({ // withGpt
        model: modelId,
        messages,
        max_tokens: request.maxTokens || modelConfig.maxTokens,
        temperature: request.temperature ?? 0.7,
      }, { signal: AbortSignal.timeout(30000) });

      const latencyMs = Date.now() - startTime;
      const choice = completion.choices[0];
      const usage = completion.usage;

      const inputTokens = usage?.prompt_tokens || 0;
      const outputTokens = usage?.completion_tokens || 0;
      const cost = this.calculateCost(modelId, inputTokens, outputTokens);

      this.recordSuccess(modelId, latencyMs);

      await aiCreditGateway.finalizeBilling(workspaceId, userId, featureKey, inputTokens + outputTokens, {
        inputTokens,
        outputTokens,
        model: modelId,
      });

      if (workspaceId && (inputTokens + outputTokens) > 0) {
        aiMeteringService.recordAiCall({
          workspaceId,
          modelName: modelId,
          callType: featureKey,
          inputTokens,
          outputTokens,
          triggeredByUserId: userId,
        }).catch((e: Error) => log.error('[OpenAI] Token metering error:', e.message));
      }

      return {
        content: choice?.message?.content || '',
        modelId,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        cost,
        latencyMs,
        finishReason: choice?.finish_reason || 'unknown',
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      this.recordError(modelId, (error instanceof Error ? error.message : String(error)), latencyMs);
      throw error;
    }
  }

  async generateWithRetry(request: OpenAIRequest, maxRetries?: number): Promise<OpenAIResponse> {
    const retries = maxRetries ?? this.MAX_RETRIES;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.generate(request);
      } catch (error: any) {
        lastError = error;
        log.warn(`[OpenAI] Attempt ${attempt}/${retries} failed:`, (error instanceof Error ? error.message : String(error)));
        
        if (attempt < retries) {
          await this.delay(this.RETRY_DELAY_MS * attempt);
        }
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }

  calculateCost(modelId: OpenAIModelId, inputTokens: number, outputTokens: number): number {
    const config = OPENAI_MODELS[modelId];
    const inputCost = (inputTokens / 1000) * config.costPer1kInputTokens;
    const outputCost = (outputTokens / 1000) * config.costPer1kOutputTokens;
    return inputCost + outputCost;
  }

  private recordSuccess(modelId: OpenAIModelId, latencyMs: number): void {
    const health = this.healthStatus.get(modelId);
    if (!health) return;

    health.requestCount++;
    health.avgLatencyMs = (health.avgLatencyMs * 0.9) + (latencyMs * 0.1);
    health.successRate = (health.requestCount - health.errorCount) / health.requestCount;
    health.isHealthy = health.successRate > 0.7;
  }

  private recordError(modelId: OpenAIModelId, error: string, latencyMs: number): void {
    const health = this.healthStatus.get(modelId);
    if (!health) return;

    health.requestCount++;
    health.errorCount++;
    health.lastError = error;
    health.lastErrorAt = new Date();
    health.avgLatencyMs = (health.avgLatencyMs * 0.9) + (latencyMs * 0.1);
    health.successRate = (health.requestCount - health.errorCount) / health.requestCount;
    health.isHealthy = health.successRate > 0.7;
  }

  getHealthStatus(): Record<OpenAIModelId, ModelHealth> {
    const status: Record<string, ModelHealth> = {};
    for (const [modelId, health] of this.healthStatus) {
      status[modelId] = { ...health };
    }
    return status as Record<OpenAIModelId, ModelHealth>;
  }

  isModelHealthy(modelId: OpenAIModelId): boolean {
    const health = this.healthStatus.get(modelId);
    return health?.isHealthy ?? false;
  }

  getModelConfig(modelId: OpenAIModelId): OpenAIModelConfig {
    return OPENAI_MODELS[modelId];
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    if (!this.client) {
      return { healthy: false, latencyMs: 0, error: 'Client not initialized' };
    }

    const startTime = Date.now();
    try {
      await this.generate({
        prompt: 'Say "OK"',
        modelId: 'gpt-4o-mini',
        maxTokens: 5,
      });
      return { healthy: true, latencyMs: Date.now() - startTime };
    } catch (error: any) {
      return { healthy: false, latencyMs: Date.now() - startTime, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const openaiClient = new OpenAIClient();

export async function generateWithOpenAI(request: OpenAIRequest): Promise<OpenAIResponse> {
  return openaiClient.generateWithRetry(request);
}

export function isOpenAIAvailable(): boolean {
  return openaiClient.isAvailable();
}

export function getOpenAIHealth(): Record<OpenAIModelId, ModelHealth> {
  return openaiClient.getHealthStatus();
}
