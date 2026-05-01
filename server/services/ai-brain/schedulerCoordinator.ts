/**
 * SchedulerCoordinator - Cross-agent coordination and scheduling
 * 
 * Provides:
 * - Agent prioritization and backoff
 * - Cross-agent mutex/locking
 * - Task delegation between Gemini/Trinity/HelpAI
 * - Rate limiting and throttling
 * - Scheduled task orchestration
 */

import crypto from 'crypto';
import { workflowLedger, WorkflowContext } from './workflowLedger';
import { commitmentManager } from './commitmentManager';
import { realTimeBridge } from './realTimeBridge';
import { contextResolver, ResolvedContext } from './contextResolver';
import { aiBrainEvents } from './internalEventEmitter';
import { createLogger } from '../../lib/logger';
const log = createLogger('schedulerCoordinator');

export type AgentType = 'gemini' | 'trinity' | 'helpai' | 'automation' | 'scheduler';

export interface AgentTask {
  id: string;
  agentType: AgentType;
  actionId: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  context: ResolvedContext;
  params: Record<string, unknown>;
  scheduledFor?: Date;
  maxWaitMs?: number;
}

export interface AgentConfig {
  maxConcurrent: number;
  rateLimit: number;
  rateLimitWindowMs: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
}

const DEFAULT_AGENT_CONFIG: Record<AgentType, AgentConfig> = {
  gemini: {
    maxConcurrent: 5,
    rateLimit: 60,
    rateLimitWindowMs: 60000,
    backoffMultiplier: 2,
    maxBackoffMs: 30000,
  },
  trinity: {
    maxConcurrent: 1,
    rateLimit: 30,
    rateLimitWindowMs: 60000,
    backoffMultiplier: 1.5,
    maxBackoffMs: 10000,
  },
  helpai: {
    maxConcurrent: 10,
    rateLimit: 100,
    rateLimitWindowMs: 60000,
    backoffMultiplier: 2,
    maxBackoffMs: 20000,
  },
  automation: {
    maxConcurrent: 20,
    rateLimit: 200,
    rateLimitWindowMs: 60000,
    backoffMultiplier: 2,
    maxBackoffMs: 60000,
  },
  scheduler: {
    maxConcurrent: 5,
    rateLimit: 50,
    rateLimitWindowMs: 60000,
    backoffMultiplier: 2,
    maxBackoffMs: 120000,
  },
};

class SchedulerCoordinatorService {
  private static instance: SchedulerCoordinatorService;
  private agentConfigs: Map<AgentType, AgentConfig> = new Map();
  private taskQueues: Map<AgentType, AgentTask[]> = new Map();
  private activeTasks: Map<AgentType, Set<string>> = new Map();
  private rateLimitCounters: Map<AgentType, { count: number; resetAt: number }> = new Map();
  private backoffState: Map<AgentType, { delay: number; until: number }> = new Map();
  private processInterval: NodeJS.Timeout | null = null;

  private constructor() {
    for (const [agent, config] of Object.entries(DEFAULT_AGENT_CONFIG)) {
      this.agentConfigs.set(agent as AgentType, config);
      this.taskQueues.set(agent as AgentType, []);
      this.activeTasks.set(agent as AgentType, new Set());
      this.rateLimitCounters.set(agent as AgentType, { count: 0, resetAt: Date.now() + config.rateLimitWindowMs });
      this.backoffState.set(agent as AgentType, { delay: 0, until: 0 });
    }
  }

  static getInstance(): SchedulerCoordinatorService {
    if (!SchedulerCoordinatorService.instance) {
      SchedulerCoordinatorService.instance = new SchedulerCoordinatorService();
    }
    return SchedulerCoordinatorService.instance;
  }

  start() {
    if (this.processInterval) return;

    this.processInterval = setInterval(() => {
      this.processQueues();
    }, 100);

    log.info('[SchedulerCoordinator] Started task processing');
  }

  stop() {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    log.info('[SchedulerCoordinator] Stopped task processing');
  }

  async enqueue(task: AgentTask): Promise<string> {
    const queue = this.taskQueues.get(task.agentType);
    if (!queue) {
      throw new Error(`Unknown agent type: ${task.agentType}`);
    }

    task.id = task.id || `${task.agentType}-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;

    const insertIndex = queue.findIndex(t => 
      this.getPriorityValue(t.priority) < this.getPriorityValue(task.priority)
    );

    if (insertIndex === -1) {
      queue.push(task);
    } else {
      queue.splice(insertIndex, 0, task);
    }

    log.info(`[SchedulerCoordinator] Enqueued task ${task.id} for ${task.agentType} (priority: ${task.priority})`);

    return task.id;
  }

  private getPriorityValue(priority: AgentTask['priority']): number {
    const values = { urgent: 4, high: 3, normal: 2, low: 1 };
    return values[priority];
  }

  private async processQueues() {
    for (const agentType of this.agentConfigs.keys()) {
      await this.processAgentQueue(agentType);
    }
  }

  private async processAgentQueue(agentType: AgentType) {
    const config = this.agentConfigs.get(agentType)!;
    const queue = this.taskQueues.get(agentType)!;
    const active = this.activeTasks.get(agentType)!;
    const backoff = this.backoffState.get(agentType)!;

    if (Date.now() < backoff.until) {
      return;
    }

    if (active.size >= config.maxConcurrent) {
      return;
    }

    if (!this.checkRateLimit(agentType)) {
      return;
    }

    const taskIndex = queue.findIndex(task => {
      if (task.scheduledFor && new Date(task.scheduledFor) > new Date()) {
        return false;
      }
      return true;
    });

    if (taskIndex === -1) {
      return;
    }

    const task = queue.splice(taskIndex, 1)[0];
    active.add(task.id);

    this.incrementRateLimit(agentType);

    this.executeTask(task).finally(() => {
      active.delete(task.id);
    });
  }

  private checkRateLimit(agentType: AgentType): boolean {
    const config = this.agentConfigs.get(agentType)!;
    const counter = this.rateLimitCounters.get(agentType)!;

    if (Date.now() > counter.resetAt) {
      counter.count = 0;
      counter.resetAt = Date.now() + config.rateLimitWindowMs;
    }

    return counter.count < config.rateLimit;
  }

  private incrementRateLimit(agentType: AgentType) {
    const counter = this.rateLimitCounters.get(agentType)!;
    counter.count++;
  }

  private async executeTask(task: AgentTask): Promise<void> {
    const startTime = Date.now();

    try {
      const run = await workflowLedger.createRun(
        task.actionId,
        this.getCategoryFromAction(task.actionId),
        {
          source: task.agentType === 'gemini' ? 'helpai' : 
                  task.agentType === 'trinity' ? 'trinity' :
                  task.agentType === 'scheduler' ? 'scheduler' : 'automation',
          workspaceId: task.context.workspaceId,
          userId: task.context.userId,
        },
        task.params
      );

      await workflowLedger.startRun(run.id);

      aiBrainEvents.emit('execute_action', {
        runId: run.id,
        actionId: task.actionId,
        params: task.params,
        context: task.context,
      });

      this.resetBackoff(task.agentType);

    } catch (error) {
      log.error(`[SchedulerCoordinator] Task ${task.id} failed:`, error);
      this.applyBackoff(task.agentType);
    }
  }

  private getCategoryFromAction(actionId: string): string {
    const parts = actionId.split('.');
    return parts[0] || 'general';
  }

  private applyBackoff(agentType: AgentType) {
    const config = this.agentConfigs.get(agentType)!;
    const backoff = this.backoffState.get(agentType)!;

    backoff.delay = Math.min(
      backoff.delay === 0 ? 1000 : backoff.delay * config.backoffMultiplier,
      config.maxBackoffMs
    );
    backoff.until = Date.now() + backoff.delay;

    log.info(`[SchedulerCoordinator] Applied ${backoff.delay}ms backoff to ${agentType}`);
  }

  private resetBackoff(agentType: AgentType) {
    const backoff = this.backoffState.get(agentType)!;
    backoff.delay = 0;
    backoff.until = 0;
  }

  async delegate(
    fromAgent: AgentType,
    toAgent: AgentType,
    actionId: string,
    params: Record<string, unknown>,
    context: ResolvedContext,
    options?: { priority?: AgentTask['priority']; waitForResult?: boolean }
  ): Promise<string> {
    log.info(`[SchedulerCoordinator] Delegating from ${fromAgent} to ${toAgent}: ${actionId}`);

    const task: AgentTask = {
      id: `delegate-${fromAgent}-${toAgent}-${Date.now()}`,
      agentType: toAgent,
      actionId,
      priority: options?.priority || 'normal',
      context,
      params: {
        ...params,
        _delegatedFrom: fromAgent,
      },
    };

    return this.enqueue(task);
  }

  async requestMutex(
    agentType: AgentType,
    resourceType: string,
    resourceId: string,
    context: ResolvedContext,
    timeoutMs: number = 30000
  ): Promise<{ acquired: boolean; lockId?: string }> {
    const lock = await commitmentManager.acquireLock(
      {
        workspaceId: context.workspaceId,
        userId: context.userId,
      },
      `${agentType}:${resourceType}`,
      resourceId,
      { expiresInMs: timeoutMs }
    );

    if (lock) {
      return { acquired: true, lockId: lock.id };
    }

    return { acquired: false };
  }

  async releaseMutex(lockId: string): Promise<boolean> {
    return commitmentManager.releaseLock(lockId);
  }

  getQueueStats(): Record<AgentType, { queued: number; active: number; rateLimitRemaining: number }> {
    const stats: Record<AgentType, { queued: number; active: number; rateLimitRemaining: number }> = {} as any;

    for (const agentType of this.agentConfigs.keys()) {
      const config = this.agentConfigs.get(agentType)!;
      const queue = this.taskQueues.get(agentType)!;
      const active = this.activeTasks.get(agentType)!;
      const counter = this.rateLimitCounters.get(agentType)!;

      stats[agentType] = {
        queued: queue.length,
        active: active.size,
        rateLimitRemaining: Math.max(0, config.rateLimit - counter.count),
      };
    }

    return stats;
  }

  updateAgentConfig(agentType: AgentType, config: Partial<AgentConfig>) {
    const current = this.agentConfigs.get(agentType);
    if (current) {
      this.agentConfigs.set(agentType, { ...current, ...config });
    }
  }

  clearQueue(agentType: AgentType): number {
    const queue = this.taskQueues.get(agentType);
    if (!queue) return 0;

    const count = queue.length;
    queue.length = 0;
    return count;
  }
}

export const schedulerCoordinator = SchedulerCoordinatorService.getInstance();
