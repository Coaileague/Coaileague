import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { meteredGemini } from '../billing/meteredGeminiClient';
import { platformEventBus } from '../platformEventBus';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityVelocityEngine');

interface CacheEntry {
  value: any;
  expiresAt: number;
  accessCount: number;
}

class AgentCache {
  private cache: Map<string, CacheEntry> = new Map();
  private hits: number = 0;
  private misses: number = 0;
  private ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      this.misses++;
      if (entry) this.cache.delete(key);
      return null;
    }
    entry.accessCount++;
    this.hits++;
    return entry.value;
  }

  set(key: string, value: any): void {
    if (this.cache.size >= 1000) {
      const oldest = [...this.cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
      if (oldest) this.cache.delete(oldest[0]);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs, accessCount: 1 });
  }

  getStats(): { size: number; hitRate: number } {
    const total = this.hits + this.misses;
    return { size: this.cache.size, hitRate: total > 0 ? this.hits / total : 0 };
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

export interface VelocitySubTask {
  id: string;
  agent: string;
  instruction: string;
  priority: number;
  dependencies?: string[];
}

export interface VelocityAgentResult {
  agent: string;
  status: 'completed' | 'failed' | 'needs_review';
  confidence: number;
  data: any;
  recommendation?: string;
  timeMs: number;
  cached: boolean;
  error?: string;
}

export interface VelocityExecutionResult {
  status: 'success' | 'partial' | 'failed';
  totalTimeMs: number;
  parallelConcurrency: number;
  finalSynthesis: string;
  agentDetails: VelocityAgentResult[];
  failedAgents: string[];
  cachedAgents: string[];
  needsReviewAgents: string[];
}

export interface VelocityConfig {
  maxConcurrency: number;
  cacheEnabled: boolean;
  cacheTtlMs: number;
  confidenceThreshold: number;
  timeoutMs: number;
  streamingEnabled: boolean;
}

const DEFAULT_CONFIG: VelocityConfig = {
  maxConcurrency: 5,
  cacheEnabled: true,
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
  confidenceThreshold: 0.70,
  timeoutMs: 30000,
  streamingEnabled: true,
};


export class TrinityVelocityEngine extends EventEmitter {
  private cache: AgentCache;
  private config: VelocityConfig;
  private activeSemaphore: number = 0;
  private pendingQueue: Array<() => Promise<void>> = [];

  constructor(apiKey: string, config: Partial<VelocityConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new AgentCache(this.config.cacheTtlMs);
    
    log.info('[TrinityVelocity] Engine initialized with config:', {
      maxConcurrency: this.config.maxConcurrency,
      cacheEnabled: this.config.cacheEnabled,
      confidenceThreshold: this.config.confidenceThreshold,
    });
  }

  async orchestrate(
    userTask: string,
    context: {
      userId: string;
      workspaceId: string;
      availableAgents: string[];
    }
  ): Promise<VelocityExecutionResult> {
    const startTime = Date.now();
    
    this.emit('orchestration_started', {
      task: userTask,
      timestamp: new Date().toISOString(),
    });

    try {
      // STEP 1: DECOMPOSITION (The Map)
      this.emit('phase_started', { phase: 'decomposition' });
      const plan = await this.decomposeTask(userTask, context.availableAgents, context.workspaceId, context.userId);
      this.emit('phase_completed', { 
        phase: 'decomposition', 
        subtaskCount: plan.subtasks.length 
      });

      // STEP 2: PARALLEL EXECUTION
      this.emit('phase_started', { 
        phase: 'execution', 
        agentCount: plan.subtasks.length 
      });
      
      const agentPromises = plan.subtasks.map(task =>
        this.executeWithRateLimit(task, context)
      );

      // Use Promise.allSettled for fail-safe execution
      const results = await Promise.allSettled(agentPromises);
      
      // Process results with fail-safe handler
      const { validResults, failedAgents } = this.processResults(results, plan.subtasks);
      
      this.emit('phase_completed', { 
        phase: 'execution',
        successCount: validResults.length,
        failedCount: failedAgents.length,
      });

      // STEP 3: CONSOLIDATION (The Reduce)
      this.emit('phase_started', { phase: 'consolidation' });
      const synthesis = await this.consolidateResults(userTask, validResults, context.workspaceId, context.userId);
      this.emit('phase_completed', { phase: 'consolidation' });

      // Build final output
      const totalTimeMs = Date.now() - startTime;
      const cachedAgents = validResults.filter(r => r.cached).map(r => r.agent);
      const needsReviewAgents = validResults
        .filter(r => r.confidence < this.config.confidenceThreshold)
        .map(r => r.agent);

      // Mark low-confidence results
      validResults.forEach(r => {
        if (r.confidence < this.config.confidenceThreshold) {
          r.status = 'needs_review';
        }
      });

      const result: VelocityExecutionResult = {
        status: failedAgents.length === 0 ? 'success' : 
                validResults.length > 0 ? 'partial' : 'failed',
        totalTimeMs,
        parallelConcurrency: this.config.maxConcurrency,
        finalSynthesis: synthesis,
        agentDetails: validResults,
        failedAgents,
        cachedAgents,
        needsReviewAgents,
      };

      this.emit('orchestration_completed', {
        status: result.status,
        totalTimeMs,
        agentCount: plan.subtasks.length,
        successCount: validResults.length,
        failedCount: failedAgents.length,
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit('orchestration_failed', { error: errorMessage });
      platformEventBus.publish({
        type: 'orchestration_failed',
        category: 'automation',
        title: 'Trinity Velocity Orchestration Failed',
        description: errorMessage,
        workspaceId: context.workspaceId,
        metadata: { userId: context.userId, task: userTask, error: errorMessage },
      }).catch((err) => log.warn('[trinityVelocityEngine] Fire-and-forget failed:', err));
      
      return {
        status: 'failed',
        totalTimeMs: Date.now() - startTime,
        parallelConcurrency: this.config.maxConcurrency,
        finalSynthesis: `Orchestration failed: ${errorMessage}`,
        agentDetails: [],
        failedAgents: ['orchestrator'],
        cachedAgents: [],
        needsReviewAgents: [],
      };
    }
  }

  private async decomposeTask(
    userTask: string,
    availableAgents: string[],
    workspaceId: string,
    userId: string
  ): Promise<{ subtasks: VelocitySubTask[] }> {
    const decompositionPrompt = `You are the Dispatcher for Trinity AI. Break this task into independent sub-tasks that can be executed in parallel by specialized agents.

Available agents: ${availableAgents.join(', ')}

User Task: ${userTask}

Rules:
1. Create independent sub-tasks that don't depend on each other
2. Assign each task to the most appropriate agent
3. Set priority 1-10 (10 = highest)
4. Keep instructions clear and actionable

Return a JSON object with a "subtasks" array.`;

    try {
      const result = await meteredGemini.generate({
        workspaceId,
        userId,
        featureKey: 'ai_trinity_orchestrator',
        prompt: decompositionPrompt,
        model: 'gemini-2.5-flash',
        temperature: 0.3,
        maxOutputTokens: 1024
      });

      if (!result.success) {
        log.error('[TrinityVelocity] Decomposition failed:', result.error);
        return {
          subtasks: [{
            id: 'fallback-1',
            agent: 'general',
            instruction: userTask,
            priority: 5,
          }],
        };
      }

      const text = result.text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(parsed.subtasks)) {
          return { subtasks: [] };
        }
        return parsed;
      }

      return { subtasks: [] };
    } catch (error) {
      log.error('[TrinityVelocity] Decomposition failed:', error);
      // Fallback: single general task
      return {
        subtasks: [{
          id: 'fallback-1',
          agent: 'general',
          instruction: userTask,
          priority: 5,
        }],
      };
    }
  }

  private async executeWithRateLimit(
    task: VelocitySubTask,
    context: { userId: string; workspaceId: string }
  ): Promise<VelocityAgentResult> {
    // Wait for semaphore slot
    await this.acquireSemaphore();

    try {
      return await this.executeAgent(task, context);
    } finally {
      this.releaseSemaphore();
    }
  }

  private acquireSemaphore(): Promise<void> {
    return new Promise((resolve) => {
      if (this.activeSemaphore < this.config.maxConcurrency) {
        this.activeSemaphore++;
        resolve();
      } else {
        this.pendingQueue.push(async () => {
          this.activeSemaphore++;
          resolve();
        });
      }
    });
  }

  private releaseSemaphore(): void {
    this.activeSemaphore--;
    if (this.pendingQueue.length > 0) {
      const next = this.pendingQueue.shift();
      if (next) next();
    }
  }

  private async executeAgent(
    task: VelocitySubTask,
    context: { userId: string; workspaceId: string }
  ): Promise<VelocityAgentResult> {
    const startTime = Date.now();

    // Check cache first
    const cacheKey = this.generateCacheKey(task.agent, task.instruction);
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.emit('agent_completed', {
          agent: task.agent,
          cached: true,
          timeMs: Date.now() - startTime,
        });
        
        return {
          agent: task.agent,
          status: 'completed',
          confidence: cached.confidence,
          data: cached.data,
          recommendation: cached.recommendation,
          timeMs: Date.now() - startTime,
          cached: true,
        };
      }
    }

    this.emit('agent_started', { agent: task.agent, taskId: task.id });

    try {
      const agentPrompt = `You are ${task.agent} agent. Execute this task and provide results.

Task: ${task.instruction}

Context:
- User ID: ${context.userId}
- Workspace: ${context.workspaceId}

Provide your response as JSON with: confidence (0.0-1.0), data (object), and recommendation (string).`;

      const result = await meteredGemini.generate({
        workspaceId: context.workspaceId,
        userId: context.userId,
        featureKey: 'ai_trinity_agent',
        prompt: agentPrompt,
        model: 'gemini-2.5-flash',
        temperature: 0.5,
        maxOutputTokens: 1024
      });

      if (!result.success) {
        throw new Error(result.error || 'Agent execution failed');
      }

      const text = result.text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { confidence: 0.8, data: {}, recommendation: text };

      const agentResult: VelocityAgentResult = {
        agent: task.agent,
        status: 'completed',
        confidence: parsed.confidence || 0.8,
        data: parsed.data || {},
        recommendation: parsed.recommendation,
        timeMs: Date.now() - startTime,
        cached: false,
      };

      // Cache the result
      if (this.config.cacheEnabled) {
        this.cache.set(cacheKey, {
          confidence: agentResult.confidence,
          data: agentResult.data,
          recommendation: agentResult.recommendation,
        });
      }

      this.emit('agent_completed', {
        agent: task.agent,
        cached: false,
        timeMs: agentResult.timeMs,
        confidence: agentResult.confidence,
      });

      return agentResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.emit('agent_failed', {
        agent: task.agent,
        error: errorMessage,
        timeMs: Date.now() - startTime,
      });

      return {
        agent: task.agent,
        status: 'failed',
        confidence: 0,
        data: {},
        timeMs: Date.now() - startTime,
        cached: false,
        error: errorMessage,
      };
    }
  }

  private processResults(
    results: PromiseSettledResult<VelocityAgentResult>[],
    subtasks: VelocitySubTask[]
  ): { validResults: VelocityAgentResult[]; failedAgents: string[] } {
    const validResults: VelocityAgentResult[] = [];
    const failedAgents: string[] = [];

    results.forEach((result, index) => {
      const task = subtasks[index];
      
      if (result.status === 'fulfilled') {
        if (result.value.status === 'failed') {
          failedAgents.push(task.agent);
        }
        validResults.push(result.value);
      } else {
        failedAgents.push(task.agent);
        validResults.push({
          agent: task.agent,
          status: 'failed',
          confidence: 0,
          data: {},
          timeMs: 0,
          cached: false,
          error: result.reason?.message || 'Promise rejected',
        });
      }
    });

    return { validResults, failedAgents };
  }

  private async consolidateResults(
    originalTask: string,
    results: VelocityAgentResult[],
    workspaceId: string,
    userId: string
  ): Promise<string> {
    const successfulResults = results.filter(r => r.status !== 'failed');
    
    if (successfulResults.length === 0) {
      return 'No successful agent executions to consolidate.';
    }

    const consolidationPrompt = `You are Trinity AI consolidating results from multiple specialized agents.

Original User Task: ${originalTask}

Agent Results:
${successfulResults.map(r => `
### ${r.agent} Agent (Confidence: ${(r.confidence * 100).toFixed(0)}%)
${r.status === 'needs_review' ? '⚠️ NEEDS_REVIEW: Low confidence result' : ''}
Data: ${JSON.stringify(r.data, null, 2)}
Recommendation: ${r.recommendation || 'None'}
`).join('\n')}

Synthesize these results into a coherent, actionable response for the user. Use Markdown formatting. Return as JSON with: synthesis (string), keyInsights (array), actionItems (array).`;

    try {
      const result = await meteredGemini.generate({
        workspaceId,
        userId,
        featureKey: 'ai_trinity_orchestrator',
        prompt: consolidationPrompt,
        model: 'gemini-2.5-flash',
        temperature: 0.5,
        maxOutputTokens: 2048
      });

      if (!result.success) {
        log.error('[TrinityVelocity] Consolidation failed:', result.error);
        return successfulResults
          .map(r => `**${r.agent}**: ${r.recommendation || JSON.stringify(r.data)}`)
          .join('\n\n');
      }

      const text = result.text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Format the synthesis with insights
        let synthesis = parsed.synthesis || '';
        
        if (parsed.keyInsights?.length > 0) {
          synthesis += '\n\n**Key Insights:**\n';
          parsed.keyInsights.forEach((insight: string) => {
            synthesis += `- ${insight}\n`;
          });
        }

        if (parsed.actionItems?.length > 0) {
          synthesis += '\n\n**Action Items:**\n';
          parsed.actionItems.forEach((item: string, i: number) => {
            synthesis += `${i + 1}. ${item}\n`;
          });
        }

        return synthesis;
      }

      return text;
    } catch (error) {
      log.error('[TrinityVelocity] Consolidation failed:', error);
      // Fallback: simple concatenation
      return successfulResults
        .map(r => `**${r.agent}**: ${r.recommendation || JSON.stringify(r.data)}`)
        .join('\n\n');
    }
  }

  private generateCacheKey(agent: string, instruction: string): string {
    const content = `${agent}:${instruction}`;
    return createHash('sha256').update(content).digest('hex');
  }

  getConfig(): VelocityConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<VelocityConfig>): void {
    this.config = { ...this.config, ...updates };
    log.info('[TrinityVelocity] Config updated:', updates);
  }

  getCacheStats(): { size: number; hitRate: number } {
    return this.cache.getStats();
  }

  clearCache(): void {
    this.cache.clear();
    log.info('[TrinityVelocity] Cache cleared');
  }
}

let velocityEngineInstance: TrinityVelocityEngine | null = null;

export function getTrinityVelocityEngine(): TrinityVelocityEngine {
  if (!velocityEngineInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }
    velocityEngineInstance = new TrinityVelocityEngine(apiKey);
  }
  return velocityEngineInstance;
}
