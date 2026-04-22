/**
 * TRINITY MODEL ROUTER — Role-Based Failover (No Single Point of Failure)
 *
 * Architecture:
 *   - Every role has a ranked chain of models
 *   - If model #1 fails, #2 takes over automatically — zero downtime
 *   - Per-model cooldowns prevent hammering dead APIs (exponential backoff)
 *   - Health check loop auto-restores recovered models
 *   - Financial math NEVER uses AI (deterministic code handles payroll/invoicing)
 *   - All usage tracked to ai_token_usage with role + wasFailover + durationMs
 *
 * Roles:
 *   orchestrator  — planning, reasoning, deciding what tools to use
 *   executor      — routine tasks, formatting, simple generation
 *   judge         — complex decisions, quality review, compliance analysis
 *   writer        — emails, proposals, reports, persuasive content
 *   analyzer      — document scanning, incident analysis, pattern detection
 *
 * Chain priorities (highest = first tried):
 *   orchestrator: gemini_pro → claude_sonnet → gpt4o
 *   executor:     gemini_flash → gpt4o_mini → claude_haiku
 *   judge:        claude_sonnet → gemini_pro → gpt4o
 *   writer:       claude_sonnet → gpt4o → gemini_pro
 *   analyzer:     claude_sonnet → gemini_pro → gpt4o
 */

import { db } from '../../../db';
import { sql } from 'drizzle-orm';
import { trinityAiUsageLog } from '@shared/schema/domains/trinity/extended';
import { platformEventBus } from '../../platformEventBus';
import { aiMeteringService } from '../../billing/aiMeteringService';
import { createLogger } from '../../../lib/logger';

const log = createLogger('ModelRouter');

export type ModelRole = 'orchestrator' | 'executor' | 'judge' | 'writer' | 'analyzer';

export type ModelName =
  | 'gemini_pro'
  | 'gemini_flash'
  | 'claude_sonnet'
  | 'claude_haiku'
  | 'gpt4o'
  | 'gpt4o_mini';

interface ModelConfig {
  name: ModelName;
  provider: 'google' | 'anthropic' | 'openai';
  modelId: string;
  apiKeyEnvVar: string;
  maxTokens: number;
  costPer1kInputUsd: number;
  costPer1kOutputUsd: number;
  timeoutMs: number;
  consecutiveFailures: number;
  cooldownUntil: Date | null;
  isAvailable: boolean;
  lastFailureAt: Date | null;
  totalCalls: number;
  totalFailures: number;
}

export interface ModelRouterRequest {
  role: ModelRole;
  systemPrompt: string;
  userPrompt: string;
  workspaceId: string;
  userId?: string;
  featureKey?: string;
  maxTokens?: number;
  preferredModel?: ModelName;
}

export interface ModelRouterResponse {
  content: string;
  modelUsed: ModelName;
  provider: 'google' | 'anthropic' | 'openai';
  role: ModelRole;
  wasFailover: boolean;
  primaryModel: ModelName;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  rawCostUsd: number;
}

const ROLE_CHAINS: Record<ModelRole, ModelName[]> = {
  orchestrator: ['gemini_pro', 'claude_sonnet', 'gpt4o'],
  executor:     ['gemini_flash', 'gpt4o_mini', 'claude_haiku'],
  judge:        ['claude_sonnet', 'gemini_pro', 'gpt4o'],
  writer:       ['claude_sonnet', 'gpt4o', 'gemini_pro'],
  analyzer:     ['claude_sonnet', 'gemini_pro', 'gpt4o'],
};

const COOLDOWN_THRESHOLDS = [
  { failures: 3,  cooldownMs: 5 * 60 * 1000 },
  { failures: 5,  cooldownMs: 30 * 60 * 1000 },
  { failures: 10, cooldownMs: 2 * 60 * 60 * 1000 },
];

const HEALTH_CHECK_INTERVAL_MS = 60 * 1000;

class ModelRouter {
  private models: Map<ModelName, ModelConfig>;
  private healthInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.models = new Map([
      ['gemini_pro', {
        name: 'gemini_pro', provider: 'google',
        modelId: 'gemini-2.5-pro',
        apiKeyEnvVar: 'GEMINI_API_KEY',
        maxTokens: 8192,
        costPer1kInputUsd: 0.00125, costPer1kOutputUsd: 0.005,
        timeoutMs: 30000,
        consecutiveFailures: 0, cooldownUntil: null, isAvailable: true,
        lastFailureAt: null, totalCalls: 0, totalFailures: 0,
      }],
      ['gemini_flash', {
        name: 'gemini_flash', provider: 'google',
        modelId: 'gemini-2.5-flash-lite',
        apiKeyEnvVar: 'GEMINI_API_KEY',
        maxTokens: 4096,
        costPer1kInputUsd: 0.0000001, costPer1kOutputUsd: 0.0000004,
        timeoutMs: 15000,
        consecutiveFailures: 0, cooldownUntil: null, isAvailable: true,
        lastFailureAt: null, totalCalls: 0, totalFailures: 0,
      }],
      ['claude_sonnet', {
        name: 'claude_sonnet', provider: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        apiKeyEnvVar: 'ANTHROPIC_API_KEY',
        maxTokens: 8192,
        costPer1kInputUsd: 0.003, costPer1kOutputUsd: 0.015,
        timeoutMs: 30000,
        consecutiveFailures: 0, cooldownUntil: null, isAvailable: true,
        lastFailureAt: null, totalCalls: 0, totalFailures: 0,
      }],
      ['claude_haiku', {
        name: 'claude_haiku', provider: 'anthropic',
        modelId: 'claude-3-5-haiku-20241022',
        apiKeyEnvVar: 'ANTHROPIC_API_KEY',
        maxTokens: 4096,
        costPer1kInputUsd: 0.00025, costPer1kOutputUsd: 0.00125,
        timeoutMs: 10000,
        consecutiveFailures: 0, cooldownUntil: null, isAvailable: true,
        lastFailureAt: null, totalCalls: 0, totalFailures: 0,
      }],
      ['gpt4o', {
        name: 'gpt4o', provider: 'openai',
        modelId: 'gpt-4o',
        apiKeyEnvVar: 'OPENAI_API_KEY',
        maxTokens: 4096,
        costPer1kInputUsd: 0.0025, costPer1kOutputUsd: 0.01,
        timeoutMs: 30000,
        consecutiveFailures: 0, cooldownUntil: null, isAvailable: true,
        lastFailureAt: null, totalCalls: 0, totalFailures: 0,
      }],
      ['gpt4o_mini', {
        name: 'gpt4o_mini', provider: 'openai',
        modelId: 'gpt-4o-mini',
        apiKeyEnvVar: 'OPENAI_API_KEY',
        maxTokens: 4096,
        costPer1kInputUsd: 0.00015, costPer1kOutputUsd: 0.0006,
        timeoutMs: 15000,
        consecutiveFailures: 0, cooldownUntil: null, isAvailable: true,
        lastFailureAt: null, totalCalls: 0, totalFailures: 0,
      }],
    ]);

    this.startHealthLoop();
  }

  async route(params: ModelRouterRequest): Promise<ModelRouterResponse> {
    let chain = [...ROLE_CHAINS[params.role]];

    if (params.preferredModel && this.models.has(params.preferredModel)) {
      chain = [params.preferredModel, ...chain.filter(m => m !== params.preferredModel)];
    }

    const primaryModel = chain[0];
    let lastError: Error | null = null;

    for (const modelName of chain) {
      const model = this.models.get(modelName)!;

      if (!process.env[model.apiKeyEnvVar]) {
        continue;
      }

      if (this.isInCooldown(model)) {
        log.info(`[ModelRouter] ${modelName} in cooldown until ${model.cooldownUntil?.toISOString()}, skipping`);
        continue;
      }

      const startTime = Date.now();

      try {
        log.info(`[ModelRouter] role=${params.role} attempting ${modelName}`);

        const raw = await this.callModel(model, params.systemPrompt, params.userPrompt, params.maxTokens);
        const latencyMs = Date.now() - startTime;

        this.recordSuccess(model);

        const wasFailover = modelName !== primaryModel;
        const rawCostUsd = this.calcCost(model, raw.inputTokens, raw.outputTokens);

        await this.trackUsage({
          workspaceId: params.workspaceId,
          userId: params.userId,
          provider: model.provider,
          modelId: model.modelId,
          featureKey: params.featureKey || `trinity_${params.role}`,
          role: params.role,
          inputTokens: raw.inputTokens,
          outputTokens: raw.outputTokens,
          rawCostUsd,
          wasFailover,
          durationMs: latencyMs,
        });

        return {
          content: raw.content,
          modelUsed: modelName,
          provider: model.provider,
          role: params.role,
          wasFailover,
          primaryModel,
          latencyMs,
          inputTokens: raw.inputTokens,
          outputTokens: raw.outputTokens,
          rawCostUsd,
        };

      } catch (err: any) {
        lastError = err;
        log.error(`[ModelRouter] ${modelName} failed: ${(err instanceof Error ? err.message : String(err))}`);
        this.recordFailure(model, (err instanceof Error ? err.message : String(err)));
      }
    }

    await this.notifyAllDown(params.role);
    throw new Error(
      `[ModelRouter] All models unavailable for role=${params.role}. ` +
      `Last error: ${lastError?.message}. ` +
      `AI features will resume automatically when a provider recovers.`
    );
  }

  private isInCooldown(model: ModelConfig): boolean {
    if (!model.cooldownUntil) return false;
    if (new Date() >= model.cooldownUntil) {
      model.cooldownUntil = null;
      model.consecutiveFailures = 0;
      return false;
    }
    return true;
  }

  private recordSuccess(model: ModelConfig) {
    model.consecutiveFailures = 0;
    model.isAvailable = true;
    model.cooldownUntil = null;
    model.totalCalls++;
  }

  private recordFailure(model: ModelConfig, errorMsg: string) {
    model.consecutiveFailures++;
    model.totalFailures++;
    model.totalCalls++;
    model.lastFailureAt = new Date();
    model.isAvailable = false;

    for (const { failures, cooldownMs } of [...COOLDOWN_THRESHOLDS].reverse()) {
      if (model.consecutiveFailures >= failures) {
        model.cooldownUntil = new Date(Date.now() + cooldownMs);
        log.warn(
          `[ModelRouter] ${model.name} placed in ${cooldownMs / 60000}min cooldown ` +
          `after ${model.consecutiveFailures} failures`
        );
        if (model.consecutiveFailures >= 10) {
          this.notifyOutage(model, errorMsg);
        }
        break;
      }
    }
  }

  private async callModel(
    model: ModelConfig,
    systemPrompt: string,
    userPrompt: string,
    maxTokens?: number
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), model.timeoutMs);
    try {
      switch (model.provider) {
        case 'google':
          return await this.callGemini(model, systemPrompt, userPrompt, maxTokens, controller.signal);
        case 'anthropic':
          return await this.callClaude(model, systemPrompt, userPrompt, maxTokens, controller.signal);
        case 'openai':
          return await this.callOpenAI(model, systemPrompt, userPrompt, maxTokens, controller.signal);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private async callGemini(
    model: ModelConfig,
    systemPrompt: string,
    userPrompt: string,
    maxTokens?: number,
    signal?: AbortSignal
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env[model.apiKeyEnvVar]!);
    const genModel = genAI.getGenerativeModel({
      model: model.modelId,
      systemInstruction: systemPrompt,
      generationConfig: { maxOutputTokens: maxTokens || model.maxTokens },
    });

    const result = await genModel.generateContent(userPrompt); // withGemini
    const response = result.response;
    const content = response.text();
    const usage = response.usageMetadata;

    return {
      content,
      inputTokens: usage?.promptTokenCount || 0,
      outputTokens: usage?.candidatesTokenCount || 0,
    };
  }

  private async callClaude(
    model: ModelConfig,
    systemPrompt: string,
    userPrompt: string,
    maxTokens?: number,
    signal?: AbortSignal
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    const apiKey = process.env[model.apiKeyEnvVar]!;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model.modelId,
        max_tokens: maxTokens || model.maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: signal ?? AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic ${response.status}: ${err}`);
    }

    const data = await response.json();
    return {
      content: data.content?.[0]?.text || '',
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
    };
  }

  private async callOpenAI(
    model: ModelConfig,
    systemPrompt: string,
    userPrompt: string,
    maxTokens?: number,
    signal?: AbortSignal
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env[model.apiKeyEnvVar]}`,
      },
      body: JSON.stringify({
        model: model.modelId,
        max_tokens: maxTokens || model.maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI ${response.status}: ${err}`);
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    };
  }

  private calcCost(model: ModelConfig, inputTokens: number, outputTokens: number): number {
    return (
      (inputTokens / 1000) * model.costPer1kInputUsd +
      (outputTokens / 1000) * model.costPer1kOutputUsd
    );
  }

  private async trackUsage(params: {
    workspaceId: string;
    userId?: string;
    provider: string;
    modelId: string;
    featureKey: string;
    role: string;
    inputTokens: number;
    outputTokens: number;
    rawCostUsd: number;
    wasFailover: boolean;
    durationMs: number;
  }): Promise<void> {
    try {
      // Converted to Drizzle ORM
      await db.insert(trinityAiUsageLog).values({
        workspaceId: params.workspaceId,
        userId: params.userId || null,
        modelUsed: params.modelId,
        modelTier: params.role,
        callType: params.featureKey,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        totalTokens: params.inputTokens + params.outputTokens,
        costBasisUsd: params.rawCostUsd.toFixed(6),
        markupRate: '1.2',
        billedAmountUsd: (params.rawCostUsd * 1.2).toFixed(6),
        creditsDeducted: 0,
        responseTimeMs: params.durationMs,
        calledAt: sql`now()`,
      });
      aiMeteringService.recordAiCall({
        workspaceId: params.workspaceId,
        workspaceTier: undefined,
        modelName: params.modelId,
        callType: params.featureKey || `trinity_${params.role}`,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        triggeredByUserId: params.userId,
      });
    } catch (err: any) {
      log.warn('[ModelRouter] Failed to track usage:', (err instanceof Error ? err.message : String(err)));
    }
  }

  private notifyOutage(model: ModelConfig, error: string) {
    platformEventBus.publish({
      type: 'ai_error',
      category: 'error',
      title: `AI Model Outage: ${model.name}`,
      description: `${model.name} (${model.provider}) has failed ${model.consecutiveFailures} times. Last error: ${error}`,
      metadata: { alertCategory: 'ai_model_outage', severity: 'high', provider: model.provider, failures: model.consecutiveFailures },
    }).catch((err) => log.warn('[modelRouter] Fire-and-forget failed:', err));
  }

  private async notifyAllDown(role: ModelRole) {
    log.error(`[ModelRouter] ALL MODELS DOWN for role=${role}`);
    platformEventBus.publish({
      type: 'ai_error',
      category: 'error',
      title: `All AI Models Down — Role: ${role}`,
      description: `Every model in the ${role} chain is unavailable. Platform continues in manual mode. Health checks will restore AI automatically.`,
      metadata: { alertCategory: 'ai_all_models_down', severity: 'critical', role },
    }).catch((err) => log.warn('[modelRouter] Fire-and-forget failed:', err));
  }

  async healthCheck(): Promise<{ model: string; status: string; cooldownUntil?: string }[]> {
    const report: { model: string; status: string; cooldownUntil?: string }[] = [];

    for (const [name, model] of this.models) {
      if (!process.env[model.apiKeyEnvVar]) {
        report.push({ model: name, status: 'no_api_key' });
        continue;
      }

      if (model.cooldownUntil && new Date() < model.cooldownUntil) {
        report.push({ model: name, status: 'cooldown', cooldownUntil: model.cooldownUntil.toISOString() });
        continue;
      }

      try {
        await this.callModel(model, 'You are a health check assistant.', 'Respond with OK only.', 5);
        model.isAvailable = true;
        model.consecutiveFailures = 0;
        model.cooldownUntil = null;
        report.push({ model: name, status: 'healthy' });
        log.info(`[ModelRouter] Health check: ${name} is healthy`);
      } catch (err: any) {
        report.push({ model: name, status: 'unhealthy' });
        log.warn(`[ModelRouter] Health check: ${name} unhealthy — ${(err instanceof Error ? err.message : String(err))}`);
      }
    }

    return report;
  }

  getModelStatus(): Record<ModelName, {
    isAvailable: boolean;
    consecutiveFailures: number;
    cooldownUntil: string | null;
    totalCalls: number;
    totalFailures: number;
  }> {
    const out: any = {};
    for (const [name, m] of this.models) {
      out[name] = {
        isAvailable: m.isAvailable,
        consecutiveFailures: m.consecutiveFailures,
        cooldownUntil: m.cooldownUntil?.toISOString() || null,
        totalCalls: m.totalCalls,
        totalFailures: m.totalFailures,
      };
    }
    return out;
  }

  getChainForRole(role: ModelRole): ModelName[] {
    return ROLE_CHAINS[role];
  }

  private startHealthLoop() {
    if (this.healthInterval) clearInterval(this.healthInterval);
    this.healthInterval = setInterval(async () => {
      try {
        const cooledDown = [...this.models.values()].filter(
          m => m.cooldownUntil && new Date() >= m.cooldownUntil
        );
        if (cooledDown.length > 0) {
          log.info(`[ModelRouter] Health check — testing ${cooledDown.length} recovered model(s)`);
          await this.healthCheck();
        }
      } catch (error: any) {
        log.warn('[ModelRouter] Health loop error (will retry):', error?.message || 'unknown');
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  shutdown() {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
  }
}

export const modelRouter = new ModelRouter();

export async function routeByRole(params: ModelRouterRequest): Promise<ModelRouterResponse> {
  return modelRouter.route(params);
}

export function getModelRouterStatus() {
  return modelRouter.getModelStatus();
}

export function getChainForRole(role: ModelRole) {
  return modelRouter.getChainForRole(role);
}

// ─── Explicit Tier Matrix ─────────────────────────────────────────────────────
// Canonical mapping of complexity tier → preferred model per agent.
// This is the single source of truth referenced by the triad orchestrator
// and the complexity-aware routing layer.
//
//   Agent      | low          | medium       | high
//   -----------|--------------|--------------|-------------
//   GPT        | gpt4o_mini   | gpt4o        | gpt4o
//   Gemini     | gemini_flash  | gemini_pro   | gemini_pro
//   Claude     | claude_haiku | claude_haiku | claude_sonnet
//
// Budget conservative mode (>90% soft cap) caps effective tier at 'medium'.
// Premium tiers cost more — billed to tenant monthly invoice, never interrupted.

export const TRINITY_TIER_MATRIX = {
  gpt: {
    low:    'gpt4o_mini'    as ModelName,
    medium: 'gpt4o'         as ModelName,
    high:   'gpt4o'         as ModelName,
  },
  gemini: {
    low:    'gemini_flash'  as ModelName,
    medium: 'gemini_pro'    as ModelName,
    high:   'gemini_pro'    as ModelName,
  },
  claude: {
    low:    'claude_haiku'  as ModelName,
    medium: 'claude_haiku'  as ModelName,
    high:   'claude_sonnet' as ModelName,
  },
} as const satisfies Record<string, Record<'low' | 'medium' | 'high', ModelName>>;

export type TriadAgent = keyof typeof TRINITY_TIER_MATRIX;
export type TierLevel = 'low' | 'medium' | 'high';

export function getTriadTierMatrix() {
  return TRINITY_TIER_MATRIX;
}

