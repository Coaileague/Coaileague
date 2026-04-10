/**
 * AI Orchestra Service - Multi-Model AI Orchestration
 * 
 * "Trinity" = 3 AI models working together:
 * - Gemini (Operations): Scheduling, monitoring, payroll, real-time ops
 * - Claude (Analysis): Complex reasoning, compliance, RFPs, contracts
 * - GPT-4 (Creative): Proposals, sales, creative writing, strategic
 * 
 * Features:
 * - Intelligent task routing based on task type
 * - Fallback chains: If model A fails → try model B → try model C → human
 * - Confidence scoring to trigger fallbacks
 * - Credit-based billing with Stripe auto top-off
 * - Full 7-step orchestration logging
 */

import { db } from '../../db';
import {
  aiModels,
  aiTaskTypes,
  aiTaskQueue,
  aiUsageEvents,
  aiModelHealth,
  aiCreditSettings,
} from '@shared/schema';
import { eq, and, sql, desc, asc } from 'drizzle-orm';
import { openaiClient, type OpenAIResponse } from './providers/openaiClient';
import { geminiClient } from './providers/geminiClient';
import { claudeService } from './dualai/claudeService';
import { resilientAIGateway } from './providers/resilientAIGateway';
import { AiModel, AiTaskType } from '@shared/schema';
import { premiumFeatureGating } from '../premiumFeatureGating';
import { metaCognitionService } from './metaCognitionService';
import { createLogger } from '../../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../billing/billingConstants';
const log = createLogger('aiOrchestraService');

export type AIProvider = 'openai' | 'anthropic' | 'google';
export type ModelTier = 'worker' | 'operations' | 'strategic';

export interface TaskRequest {
  workspaceId: string;
  userId?: string;
  taskType: string;
  input: Record<string, any>;
  context?: Record<string, any>;
  priority?: number;
  forceProvider?: AIProvider;
  forceModelId?: string;
}

export interface TaskResult {
  success: boolean;
  taskId: string;
  output?: Record<string, any>;
  content?: string;
  confidenceScore?: number;
  modelUsed: string;
  provider: AIProvider;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  attempts: number;
  fallbacksUsed: string[];
  error?: string;
}

export interface ConfidenceScore {
  overall: number;
  completeness: number;
  relevance: number;
  consistency: number;
  uncertainty: number;
}

export interface ModelHealthStatus {
  modelId: string;
  provider: AIProvider;
  isHealthy: boolean;
  avgLatencyMs: number;
  successRate: number;
  errorCount1h: number;
  status: 'healthy' | 'degraded' | 'down' | 'rate_limited';
}

class AIOrchestrationService {
  private modelCache: Map<string, AiModel> = new Map();
  private taskTypeCache: Map<string, AiTaskType> = new Map();
  private fallbackChainCache: Map<string, string[]> = new Map();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      await this.seedModels();
      await this.seedTaskTypes();
      await this.loadCaches();
      this.initialized = true;
      log.info('[AIOrchestra] Initialized with 3 providers: Gemini, Claude, GPT-4');
    } catch (error) {
      log.error('[AIOrchestra] Initialization failed:', error);
    }
  }

  private async seedModels(): Promise<void> {
    const models = [
      { modelName: 'gpt-3.5-turbo', provider: 'openai' as const, tier: 'worker' as const, costPer1kInputTokens: '0.0005', costPer1kOutputTokens: '0.0015', capabilities: ['text', 'formatting', 'simple'] },
      { modelName: 'gpt-4o-mini', provider: 'openai' as const, tier: 'worker' as const, costPer1kInputTokens: '0.00015', costPer1kOutputTokens: '0.0006', capabilities: ['text', 'formatting', 'simple', 'chat'] },
      { modelName: 'gemini-2.5-flash', provider: 'google' as const, tier: 'operations' as const, costPer1kInputTokens: '0.000075', costPer1kOutputTokens: '0.0003', capabilities: ['text', 'operations', 'scheduling', 'realtime'] },
      { modelName: 'gemini-2.5-pro', provider: 'google' as const, tier: 'operations' as const, costPer1kInputTokens: '0.00125', costPer1kOutputTokens: '0.005', capabilities: ['text', 'operations', 'analysis', 'complex'] },
      { modelName: 'claude-3-5-sonnet', provider: 'anthropic' as const, tier: 'strategic' as const, costPer1kInputTokens: '0.003', costPer1kOutputTokens: '0.015', capabilities: ['text', 'reasoning', 'compliance', 'rfp', 'analysis'] },
      { modelName: 'claude-3-opus', provider: 'anthropic' as const, tier: 'strategic' as const, costPer1kInputTokens: '0.015', costPer1kOutputTokens: '0.075', capabilities: ['text', 'reasoning', 'strategic', 'complex'] },
      { modelName: 'gpt-4-turbo', provider: 'openai' as const, tier: 'strategic' as const, costPer1kInputTokens: '0.01', costPer1kOutputTokens: '0.03', capabilities: ['text', 'creative', 'sales', 'proposals'] },
      { modelName: 'gpt-4o', provider: 'openai' as const, tier: 'strategic' as const, costPer1kInputTokens: '0.005', costPer1kOutputTokens: '0.015', capabilities: ['text', 'creative', 'sales', 'analysis'] },
    ];

    for (const model of models) {
      try {
        await db.insert(aiModels)
          // @ts-expect-error — TS migration: fix in refactoring sprint
          .values({
            workspaceId: PLATFORM_WORKSPACE_ID,
            ...model,
            maxTokens: 4096,
            rateLimitRpm: 60,
            isActive: true,
          })
          .onConflictDoNothing();
      } catch (error) {
        // Ignore duplicates
      }
    }
  }

  private async seedTaskTypes(): Promise<void> {
    const taskTypes = [
      { taskType: 'format_data', description: 'Basic data formatting', tier: 'worker' as const, requiredCapabilities: ['text', 'formatting'], isPremiumFeature: false, creditCost: 0 },
      { taskType: 'parse_email', description: 'Extract info from emails', tier: 'worker' as const, requiredCapabilities: ['text', 'simple'], isPremiumFeature: false, creditCost: 0 },
      { taskType: 'basic_chat', description: 'Simple chat responses', tier: 'worker' as const, requiredCapabilities: ['text', 'chat'], isPremiumFeature: false, creditCost: 0 },
      { taskType: 'schedule_optimization', description: 'Optimize schedules', tier: 'operations' as const, requiredCapabilities: ['operations', 'scheduling'], isPremiumFeature: false, creditCost: 0 },
      { taskType: 'guard_matching', description: 'Match guards to shifts', tier: 'operations' as const, requiredCapabilities: ['operations', 'scheduling'], isPremiumFeature: false, creditCost: 0 },
      { taskType: 'payroll_calc', description: 'Calculate payroll', tier: 'operations' as const, requiredCapabilities: ['operations', 'analysis'], isPremiumFeature: false, creditCost: 0 },
      { taskType: 'rfp_generation', description: 'Generate RFP responses', tier: 'strategic' as const, requiredCapabilities: ['reasoning', 'rfp', 'compliance'], isPremiumFeature: true, creditCost: 50 },
      { taskType: 'contract_review', description: 'Review contracts', tier: 'strategic' as const, requiredCapabilities: ['reasoning', 'compliance'], isPremiumFeature: true, creditCost: 30 },
      { taskType: 'proposal_creation', description: 'Create proposals', tier: 'strategic' as const, requiredCapabilities: ['creative', 'sales', 'proposals'], isPremiumFeature: true, creditCost: 35 },
      { taskType: 'compliance_report', description: 'Generate compliance reports', tier: 'strategic' as const, requiredCapabilities: ['reasoning', 'compliance'], isPremiumFeature: false, creditCost: 25 },
      { taskType: 'sales_strategy', description: 'Develop sales approach', tier: 'strategic' as const, requiredCapabilities: ['strategic', 'sales'], isPremiumFeature: true, creditCost: 40 },
      { taskType: 'failure_analysis', description: 'Analyze AI failures', tier: 'strategic' as const, requiredCapabilities: ['reasoning', 'analysis'], isPremiumFeature: false, creditCost: 20 },
    ];

    for (const taskType of taskTypes) {
      try {
        await db.insert(aiTaskTypes)
          // @ts-expect-error — TS migration: fix in refactoring sprint
          .values({
            workspaceId: PLATFORM_WORKSPACE_ID,
            ...taskType,
            avgInputTokens: 500,
            avgOutputTokens: 1000,
            timeoutSeconds: 30,
            maxRetries: 3,
            requiresHumanReview: false,
          })
          .onConflictDoNothing();
      } catch (error) {
        // Ignore duplicates
      }
    }
  }

  private async loadCaches(): Promise<void> {
    const models = await db.select().from(aiModels).where(eq(aiModels.isActive, true));
    for (const model of models) {
      this.modelCache.set(model.id, model);
      this.modelCache.set(model.modelName, model);
    }

    const types = await db.select().from(aiTaskTypes);
    for (const type of types) {
      this.taskTypeCache.set(type.id, type);
      this.taskTypeCache.set(type.taskType, type);
    }
  }

  async executeTask(request: TaskRequest): Promise<TaskResult> {
    await this.initialize();

    const taskType = this.taskTypeCache.get(request.taskType);
    if (!taskType) {
      throw new Error(`Unknown task type: ${request.taskType}`);
    }

    if (taskType.isPremiumFeature) {
      const accessResult = await premiumFeatureGating.checkAccess(
        request.workspaceId,
        request.taskType,
        request.userId
      );
      
      if (!accessResult.allowed) {
        return {
          success: false,
          taskId: '',
          modelUsed: '',
          provider: 'google',
          cost: 0,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
          attempts: 0,
          fallbacksUsed: [],
          error: accessResult.reason,
        };
      }
    }

    const [queueEntry] = await db.insert(aiTaskQueue)
      .values({
        workspaceId: request.workspaceId,
        taskTypeId: taskType.id,
        inputPayload: request.input,
        context: request.context,
        priority: request.priority || 5,
        status: 'pending',
        maxAttempts: taskType.maxRetries || 3,
        userId: request.userId,
      })
      .returning();

    const fallbackChain = await this.buildFallbackChain(taskType);
    let result: TaskResult | null = null;
    const fallbacksUsed: string[] = [];
    let attempts = 0;

    for (const modelId of fallbackChain) {
      attempts++;
      const model = this.modelCache.get(modelId);
      if (!model) continue;

      const healthStatus = await this.getModelHealth(model.id);
      if (healthStatus && !healthStatus.isHealthy) {
        log.info(`[AIOrchestra] Skipping unhealthy model ${model.modelName}`);
        fallbacksUsed.push(model.modelName);
        continue;
      }

      try {
        await db.update(aiTaskQueue)
          .set({
            status: 'processing',
            assignedModelId: model.id,
            currentAttempt: attempts,
            startedAt: new Date(),
          })
          .where(eq(aiTaskQueue.id, queueEntry.id));

        result = await this.callModel(model, request, queueEntry.id, attempts);

        if (result.confidenceScore && result.confidenceScore < 0.7) {
          log.info(`[AIOrchestra] Low confidence (${result.confidenceScore}), trying fallback`);
          fallbacksUsed.push(model.modelName);
          continue;
        }

        await db.update(aiTaskQueue)
          .set({
            status: 'completed',
            outputPayload: result.output,
            confidenceScore: result.confidenceScore?.toString(),
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            totalCost: result.cost.toString(),
            completedAt: new Date(),
          })
          .where(eq(aiTaskQueue.id, queueEntry.id));

        await this.chargeCredits(request.workspaceId, result.cost, queueEntry.id, model.id);

        result.taskId = queueEntry.id;
        result.attempts = attempts;
        result.fallbacksUsed = fallbacksUsed;
        return result;

      } catch (error: any) {
        log.error(`[AIOrchestra] Model ${model.modelName} failed:`, (error instanceof Error ? error.message : String(error)));
        
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(aiExecutionLog).values({
          taskId: queueEntry.id,
          workspaceId: request.workspaceId,
          modelId: model.id,
          attemptNumber: attempts,
          promptSent: JSON.stringify(request.input).substring(0, 10000),
          status: 'failed',
          errorMessage: (error instanceof Error ? error.message : String(error)),
          latencyMs: 0,
        });

        await this.updateModelHealth(model.id, false, (error instanceof Error ? error.message : String(error)));
        fallbacksUsed.push(model.modelName);
      }
    }

    await db.update(aiTaskQueue)
      .set({
        status: 'escalated',
        errorMessage: 'All models failed, escalated to human review',
      })
      .where(eq(aiTaskQueue.id, queueEntry.id));

    return {
      success: false,
      taskId: queueEntry.id,
      modelUsed: '',
      provider: 'google',
      cost: 0,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      attempts,
      fallbacksUsed,
      error: 'All AI models failed, task escalated to human review',
    };
  }

  private async callModel(
    model: AiModel,
    request: TaskRequest,
    taskId: string,
    attemptNumber: number
  ): Promise<TaskResult> {
    const startTime = Date.now();
    let response: { content: string; inputTokens: number; outputTokens: number; cost: number };

    const prompt = this.buildPrompt(request);

    try {
      switch (model.provider) {
        case 'openai':
          const openaiResult = await openaiClient.generate({
            prompt,
            modelId: model.modelName as any,
            systemPrompt: 'You are an AI assistant for a workforce management platform. Be precise, professional, and helpful.',
          });
          response = {
            content: openaiResult.content,
            inputTokens: openaiResult.inputTokens,
            outputTokens: openaiResult.outputTokens,
            cost: openaiResult.cost,
          };
          break;

        case 'anthropic':
          const claudeResult = await claudeService.processRequest({
            task: prompt,
            taskType: request.taskType as any,
            context: { sessionId: taskId, workspaceId: request.workspaceId, userId: request.userId, task: prompt },
          });
          response = {
            content: claudeResult.content,
            inputTokens: claudeResult.tokensUsed || 0,
            outputTokens: 0,
            cost: claudeResult.creditsUsed * 0.001,
          };
          break;

        case 'google':
        default:
          const geminiResult = await resilientAIGateway.callWithFallback({
            prompt,
            domain: request.taskType,
            workspaceId: request.workspaceId,
            userId: request.userId,
          });
          response = {
            content: geminiResult.content,
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
          };
          break;
      }

      const latencyMs = Date.now() - startTime;
      const confidenceScore = this.calculateConfidence(response.content, request);

      // @ts-expect-error — TS migration: fix in refactoring sprint
      await db.insert(aiExecutionLog).values({
        taskId,
        workspaceId: request.workspaceId,
        modelId: model.id,
        attemptNumber,
        promptSent: prompt.substring(0, 10000),
        responseReceived: response.content.substring(0, 10000),
        confidenceScore: confidenceScore.overall.toString(),
        latencyMs,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cost: response.cost.toString(),
        status: 'success',
        completedAt: new Date(),
      });

      await this.updateModelHealth(model.id, true, undefined, latencyMs);

      return {
        success: true,
        taskId,
        output: { result: response.content },
        content: response.content,
        confidenceScore: confidenceScore.overall,
        modelUsed: model.modelName,
        provider: model.provider as AIProvider,
        cost: response.cost,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        latencyMs,
        attempts: attemptNumber,
        fallbacksUsed: [],
      };
    } catch (error) {
      throw error;
    }
  }

  private buildPrompt(request: TaskRequest): string {
    const parts: string[] = [];
    
    if (request.context) {
      parts.push(`Context: ${JSON.stringify(request.context)}`);
    }
    
    parts.push(`Task Type: ${request.taskType}`);
    parts.push(`Input: ${JSON.stringify(request.input)}`);
    parts.push('Please provide a precise and helpful response.');

    return parts.join('\n\n');
  }

  private async buildFallbackChain(taskType: AiTaskType): Promise<string[]> {
    const cacheKey = taskType.id;
    if (this.fallbackChainCache.has(cacheKey)) {
      return this.fallbackChainCache.get(cacheKey)!;
    }

    const chains = await db.select()
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .from(aiFallbackChains)
      .where(and(
        // @ts-expect-error — TS migration: fix in refactoring sprint
        eq(aiFallbackChains.taskTypeId, taskType.id),
        // @ts-expect-error — TS migration: fix in refactoring sprint
        eq(aiFallbackChains.isActive, true)
      ))
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .orderBy(asc(aiFallbackChains.sequenceOrder));

    if (chains.length > 0) {
      const modelIds = chains.map(c => c.modelId);
      this.fallbackChainCache.set(cacheKey, modelIds);
      return modelIds;
    }

    const defaultChain = await this.buildDefaultFallbackChain(taskType.tier);
    this.fallbackChainCache.set(cacheKey, defaultChain);
    return defaultChain;
  }

  private async buildDefaultFallbackChain(tier: string): Promise<string[]> {
    const tierOrder = {
      'strategic': ['anthropic', 'openai', 'google'],
      'operations': ['google', 'openai', 'anthropic'],
      'worker': ['openai', 'google', 'anthropic'],
    };

    const providers = tierOrder[tier as keyof typeof tierOrder] || tierOrder.worker;
    const chain: string[] = [];

    for (const provider of providers) {
      const models = await db.select()
        .from(aiModels)
        .where(and(
          eq(aiModels.provider, provider as any),
          eq(aiModels.isActive, true)
        ));
      
      for (const model of models) {
        chain.push(model.id);
      }
    }

    return chain;
  }

  private calculateConfidence(response: string, request: TaskRequest): ConfidenceScore {
    const scores: ConfidenceScore = {
      overall: 0,
      completeness: 0,
      relevance: 0,
      consistency: 0,
      uncertainty: 0,
    };

    const responseLength = response.length;
    scores.completeness = Math.min(1, responseLength / 500);

    const inputWords = JSON.stringify(request.input).toLowerCase().split(/\s+/);
    const responseWords = response.toLowerCase().split(/\s+/);
    const matchingWords = inputWords.filter(w => responseWords.includes(w)).length;
    scores.relevance = Math.min(1, matchingWords / Math.max(inputWords.length, 1));

    const uncertainPhrases = ['i think', 'maybe', 'possibly', 'not sure', 'uncertain'];
    const lowerResponse = response.toLowerCase();
    let uncertaintyCount = 0;
    for (const phrase of uncertainPhrases) {
      if (lowerResponse.includes(phrase)) uncertaintyCount++;
    }
    scores.uncertainty = Math.max(0, 1 - (uncertaintyCount * 0.2));

    scores.consistency = (scores.completeness + scores.relevance + scores.uncertainty) / 3;

    scores.overall = (
      scores.completeness * 0.25 +
      scores.relevance * 0.25 +
      scores.consistency * 0.25 +
      scores.uncertainty * 0.25
    );

    return scores;
  }

  private async chargeCredits(
    workspaceId: string,
    cost: number,
    taskId: string,
    modelId: string
  ): Promise<void> {
    if (cost <= 0) return;

    try {
      // workspace_credits / credit_transactions tables dropped (Phase 16) — skip DB writes
      await db.insert(aiUsageEvents).values({
        workspaceId,
        featureKey: 'ai_orchestra_execution',
        usageType: 'api_call',
        usageAmount: Math.abs(cost).toString(),
        usageUnit: 'credits',
        totalCost: cost.toString(),
        activityType: 'ai_task_usage',
        metadata: { transactionType: 'usage', taskId, modelId, cost, description: 'AI task execution' },
      });

      await this.checkAutoTopoff(workspaceId);
    } catch (error) {
      log.error('[AIOrchestra] Failed to charge credits:', error);
    }
  }

  private async checkAutoTopoff(_workspaceId: string): Promise<void> {
    // workspace_credits table dropped (Phase 16) — no-op
  }

  private async getModelHealth(modelId: string): Promise<ModelHealthStatus | null> {
    try {
      const [health] = await db.select()
        .from(aiModelHealth)
        .where(eq(aiModelHealth.modelId, modelId));

      if (!health) return null;

      const model = this.modelCache.get(modelId);
      
      return {
        modelId,
        provider: model?.provider as AIProvider || 'google',
        isHealthy: health.isHealthy ?? true,
        avgLatencyMs: health.avgLatency24hMs ?? 0,
        successRate: parseFloat(health.successRate24h?.toString() || '1'),
        errorCount1h: health.errorCount1h ?? 0,
        status: (health as any).status || 'healthy',
      };
    } catch (error) {
      return null;
    }
  }

  private async updateModelHealth(
    modelId: string,
    success: boolean,
    errorMessage?: string,
    latencyMs?: number
  ): Promise<void> {
    try {
      const [existing] = await db.select()
        .from(aiModelHealth)
        .where(eq(aiModelHealth.modelId, modelId));

      if (existing) {
        const updates: any = { updatedAt: new Date() };
        
        if (success) {
          updates.lastSuccessAt = new Date();
          if (latencyMs) {
            updates.currentLatencyMs = latencyMs;
          }
        } else {
          updates.errorCount1h = sql`${aiModelHealth.errorCount1h} + 1`;
          updates.lastErrorMessage = errorMessage;
          updates.lastErrorAt = new Date();
        }

        await db.update(aiModelHealth)
          .set(updates)
          .where(eq(aiModelHealth.modelId, modelId));
      } else {
        await db.insert(aiModelHealth).values({
          // @ts-expect-error — TS migration: fix in refactoring sprint
          workspaceId: 'system',
          modelId,
          isHealthy: success,
          currentLatencyMs: latencyMs,
          errorCount1h: success ? 0 : 1,
          lastErrorMessage: errorMessage,
          lastErrorAt: success ? undefined : new Date(),
          lastSuccessAt: success ? new Date() : undefined,
          status: success ? 'healthy' : 'degraded',
        });
      }
    } catch (error) {
      log.error('[AIOrchestra] Failed to update model health:', error);
    }
  }

  async getUsageReport(workspaceId: string, startDate: Date, endDate: Date): Promise<{
    totalTasks: number;
    totalCost: number;
    totalTokens: number;
    byModel: Record<string, { tasks: number; cost: number; tokens: number }>;
    byTaskType: Record<string, { tasks: number; cost: number }>;
  }> {
    const tasks = await db.select()
      .from(aiTaskQueue)
      .where(and(
        eq(aiTaskQueue.workspaceId, workspaceId),
        eq(aiTaskQueue.status, 'completed')
      ));

    const byModel: Record<string, { tasks: number; cost: number; tokens: number }> = {};
    const byTaskType: Record<string, { tasks: number; cost: number }> = {};
    let totalCost = 0;
    let totalTokens = 0;

    for (const task of tasks) {
      const model = task.assignedModelId ? this.modelCache.get(task.assignedModelId) : null;
      const taskType = this.taskTypeCache.get(task.taskTypeId);
      const cost = parseFloat(task.totalCost?.toString() || '0');
      const tokens = (task.inputTokens || 0) + (task.outputTokens || 0);

      totalCost += cost;
      totalTokens += tokens;

      if (model) {
        if (!byModel[model.modelName]) {
          byModel[model.modelName] = { tasks: 0, cost: 0, tokens: 0 };
        }
        byModel[model.modelName].tasks++;
        byModel[model.modelName].cost += cost;
        byModel[model.modelName].tokens += tokens;
      }

      if (taskType) {
        if (!byTaskType[taskType.taskType]) {
          byTaskType[taskType.taskType] = { tasks: 0, cost: 0 };
        }
        byTaskType[taskType.taskType].tasks++;
        byTaskType[taskType.taskType].cost += cost;
      }
    }

    return {
      totalTasks: tasks.length,
      totalCost,
      totalTokens,
      byModel,
      byTaskType,
    };
  }

  async getAllModelHealth(): Promise<ModelHealthStatus[]> {
    const healthRecords = await db.select()
      .from(aiModelHealth)
      .leftJoin(aiModels, eq(aiModelHealth.modelId, aiModels.id));

    return healthRecords.map(r => ({
      modelId: r.ai_model_health.modelId,
      provider: (r.ai_models?.provider as AIProvider) || 'google',
      isHealthy: r.ai_model_health.isHealthy ?? true,
      avgLatencyMs: r.ai_model_health.avgLatency24hMs ?? 0,
      successRate: parseFloat(r.ai_model_health.successRate24h?.toString() || '1'),
      errorCount1h: r.ai_model_health.errorCount1h ?? 0,
      status: (r.ai_model_health.status as any) || 'healthy',
    }));
  }
}

export const aiOrchestrationService = new AIOrchestrationService();

export async function executeAITask(request: TaskRequest): Promise<TaskResult> {
  return aiOrchestrationService.executeTask(request);
}

export async function getAIUsageReport(workspaceId: string, startDate: Date, endDate: Date) {
  return aiOrchestrationService.getUsageReport(workspaceId, startDate, endDate);
}

export async function getAIModelHealth() {
  return aiOrchestrationService.getAllModelHealth();
}

// Meta-cognition exports
export { metaCognitionService };

export async function executeWithMetaCognition(
  request: TaskRequest
): Promise<{ taskResult: TaskResult; metaCognition?: any }> {
  const taskResult = await aiOrchestrationService.executeTask(request);
  
  // Convert task result to model response format for meta-cognition
  if (taskResult.success && taskResult.content) {
    const modelResponse = {
      modelId: taskResult.taskId,
      modelName: taskResult.modelUsed,
      provider: taskResult.provider,
      response: taskResult.content,
      confidence: taskResult.confidenceScore || 0.8,
      executionTimeMs: taskResult.latencyMs,
      tokensUsed: taskResult.inputTokens + taskResult.outputTokens
    };

    const metaCognitionResult = await metaCognitionService.executeMetaCognition(
      JSON.stringify(request.input),
      request.taskType,
      [modelResponse],
      taskResult.taskId,
      request.workspaceId
    );

    return {
      taskResult,
      metaCognition: metaCognitionResult
    };
  }

  return { taskResult };
}
