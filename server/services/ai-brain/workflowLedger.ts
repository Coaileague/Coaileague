/**
 * WorkflowLedger - Persistent workflow tracking and management
 * 
 * Provides:
 * - Durable workflow run storage
 * - Step-by-step execution tracking
 * - SLA monitoring and alerting
 * - Resume/retry capabilities
 * - Cross-agent coordination
 */

import { db } from '../../db';
import { 
  orchestrationRuns, 
  orchestrationRunSteps,
  workflowArtifacts,
  InsertOrchestrationRun,
  InsertOrchestrationRunStep,
  InsertWorkflowArtifact,
  OrchestrationRun,
  OrchestrationRunStep,
  WorkflowArtifact
} from '@shared/schema';
import { eq, and, desc, gte, lte, inArray, sql, isNull } from 'drizzle-orm';
import { aiBrainEvents } from './internalEventEmitter';

export type RunStatus = 'queued' | 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled' | 'rolled_back';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface WorkflowContext {
  workspaceId?: string;
  userId?: string;
  source: 'helpai' | 'trinity' | 'automation' | 'api' | 'scheduler';
  parentRunId?: string;
}

export interface RunMetrics {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  averageDurationMs: number;
  slaComplianceRate: number;
}

class WorkflowLedgerService {
  private static instance: WorkflowLedgerService;

  private constructor() {}

  static getInstance(): WorkflowLedgerService {
    if (!WorkflowLedgerService.instance) {
      WorkflowLedgerService.instance = new WorkflowLedgerService();
    }
    return WorkflowLedgerService.instance;
  }

  async createRun(
    actionId: string,
    category: string,
    context: WorkflowContext,
    params?: Record<string, any>,
    options?: { slaThresholdMs?: number; maxRetries?: number; requiresApproval?: boolean }
  ): Promise<OrchestrationRun> {
    const [run] = await db.insert(orchestrationRuns).values({
      actionId,
      category,
      source: context.source,
      workspaceId: context.workspaceId,
      userId: context.userId,
      parentRunId: context.parentRunId,
      status: 'queued',
      inputParams: params,
      slaThresholdMs: options?.slaThresholdMs || 30000,
      maxRetries: options?.maxRetries || 3,
      requiresApproval: options?.requiresApproval || false,
    }).returning();

    aiBrainEvents.emit('workflow_created', {
      runId: run.id,
      actionId,
      category,
      source: context.source,
      workspaceId: context.workspaceId,
    });

    console.log(`[WorkflowLedger] Created run ${run.id} for ${actionId}`);
    return run;
  }

  async startRun(runId: string): Promise<OrchestrationRun | undefined> {
    const [run] = await db.update(orchestrationRuns)
      .set({ 
        status: 'running', 
        startedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(orchestrationRuns.id, runId))
      .returning();

    if (run) {
      aiBrainEvents.emit('workflow_started', { runId, actionId: run.actionId });
    }

    return run;
  }

  async completeRun(runId: string, result?: Record<string, any>): Promise<OrchestrationRun | undefined> {
    const now = new Date();
    const [existingRun] = await db.select().from(orchestrationRuns).where(eq(orchestrationRuns.id, runId));
    
    if (!existingRun) return undefined;

    const durationMs = existingRun.startedAt 
      ? now.getTime() - new Date(existingRun.startedAt).getTime() 
      : 0;
    const slaMet = durationMs <= (existingRun.slaThresholdMs || 30000);

    const [run] = await db.update(orchestrationRuns)
      .set({
        status: 'completed',
        completedAt: now,
        durationMs,
        slaMet,
        outputResult: result,
        updatedAt: now
      })
      .where(eq(orchestrationRuns.id, runId))
      .returning();

    if (run) {
      aiBrainEvents.emit('workflow_completed', { 
        runId, 
        actionId: run.actionId,
        durationMs,
        slaMet,
        result 
      });
    }

    console.log(`[WorkflowLedger] Completed run ${runId} in ${durationMs}ms (SLA: ${slaMet ? 'met' : 'missed'})`);
    return run;
  }

  async failRun(runId: string, error: Error | string): Promise<OrchestrationRun | undefined> {
    const now = new Date();
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    const [existingRun] = await db.select().from(orchestrationRuns).where(eq(orchestrationRuns.id, runId));
    
    if (!existingRun) return undefined;

    const durationMs = existingRun.startedAt 
      ? now.getTime() - new Date(existingRun.startedAt).getTime() 
      : 0;

    const newRetryCount = (existingRun.retryCount || 0) + 1;
    const canRetry = newRetryCount < (existingRun.maxRetries || 3);

    const [run] = await db.update(orchestrationRuns)
      .set({
        status: canRetry ? 'queued' : 'failed',
        completedAt: canRetry ? undefined : now,
        durationMs,
        slaMet: false,
        errorMessage,
        errorStack,
        retryCount: newRetryCount,
        updatedAt: now
      })
      .where(eq(orchestrationRuns.id, runId))
      .returning();

    if (run) {
      aiBrainEvents.emit(canRetry ? 'workflow_retrying' : 'workflow_failed', { 
        runId, 
        actionId: run.actionId,
        error: errorMessage,
        retryCount: newRetryCount
      });
    }

    console.log(`[WorkflowLedger] ${canRetry ? 'Retrying' : 'Failed'} run ${runId}: ${errorMessage}`);
    return run;
  }

  async cancelRun(runId: string, reason?: string): Promise<OrchestrationRun | undefined> {
    const [run] = await db.update(orchestrationRuns)
      .set({
        status: 'cancelled',
        completedAt: new Date(),
        errorMessage: reason || 'Cancelled by user',
        updatedAt: new Date()
      })
      .where(eq(orchestrationRuns.id, runId))
      .returning();

    if (run) {
      aiBrainEvents.emit('workflow_cancelled', { runId, actionId: run.actionId, reason });
    }

    return run;
  }

  async approveRun(runId: string, approvedBy: string): Promise<OrchestrationRun | undefined> {
    const [run] = await db.update(orchestrationRuns)
      .set({
        status: 'running',
        approvedBy,
        approvedAt: new Date(),
        updatedAt: new Date()
      })
      .where(and(
        eq(orchestrationRuns.id, runId),
        eq(orchestrationRuns.status, 'awaiting_approval')
      ))
      .returning();

    if (run) {
      aiBrainEvents.emit('workflow_approved', { runId, actionId: run.actionId, approvedBy });
    }

    return run;
  }

  async addStep(runId: string, step: Omit<InsertOrchestrationRunStep, 'runId'>): Promise<OrchestrationRunStep> {
    const [newStep] = await db.insert(orchestrationRunSteps).values({
      ...step,
      runId
    }).returning();

    return newStep;
  }

  async updateStepStatus(stepId: string, status: StepStatus, data?: { output?: any; error?: string }): Promise<OrchestrationRunStep | undefined> {
    const now = new Date();
    const updateData: any = { status };

    if (status === 'running') {
      updateData.startedAt = now;
    } else if (status === 'completed' || status === 'failed') {
      const [existingStep] = await db.select().from(orchestrationRunSteps).where(eq(orchestrationRunSteps.id, stepId));
      if (existingStep?.startedAt) {
        updateData.durationMs = now.getTime() - new Date(existingStep.startedAt).getTime();
      }
      updateData.completedAt = now;
    }

    if (data?.output) updateData.outputData = data.output;
    if (data?.error) updateData.errorMessage = data.error;

    const [step] = await db.update(orchestrationRunSteps)
      .set(updateData)
      .where(eq(orchestrationRunSteps.id, stepId))
      .returning();

    return step;
  }

  async addArtifact(artifact: InsertWorkflowArtifact): Promise<WorkflowArtifact> {
    const [newArtifact] = await db.insert(workflowArtifacts).values(artifact).returning();
    return newArtifact;
  }

  async getRun(runId: string): Promise<OrchestrationRun | undefined> {
    const [run] = await db.select().from(orchestrationRuns).where(eq(orchestrationRuns.id, runId));
    return run;
  }

  async getRunWithSteps(runId: string): Promise<{ run: OrchestrationRun; steps: OrchestrationRunStep[] } | undefined> {
    const [run] = await db.select().from(orchestrationRuns).where(eq(orchestrationRuns.id, runId));
    if (!run) return undefined;

    const steps = await db.select()
      .from(orchestrationRunSteps)
      .where(eq(orchestrationRunSteps.runId, runId))
      .orderBy(orchestrationRunSteps.stepNumber);

    return { run, steps };
  }

  async getRecentRuns(options?: {
    workspaceId?: string;
    category?: string;
    status?: RunStatus;
    source?: string;
    limit?: number;
  }): Promise<OrchestrationRun[]> {
    const conditions = [];
    
    if (options?.workspaceId) {
      conditions.push(eq(orchestrationRuns.workspaceId, options.workspaceId));
    }
    if (options?.category) {
      conditions.push(eq(orchestrationRuns.category, options.category));
    }
    if (options?.status) {
      conditions.push(eq(orchestrationRuns.status, options.status));
    }
    if (options?.source) {
      conditions.push(eq(orchestrationRuns.source, options.source));
    }

    return db.select()
      .from(orchestrationRuns)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(orchestrationRuns.createdAt))
      .limit(options?.limit || 50);
  }

  async getPendingRuns(): Promise<OrchestrationRun[]> {
    return db.select()
      .from(orchestrationRuns)
      .where(inArray(orchestrationRuns.status, ['queued', 'awaiting_approval']))
      .orderBy(orchestrationRuns.createdAt);
  }

  async getIncompleteRuns(): Promise<OrchestrationRun[]> {
    return db.select()
      .from(orchestrationRuns)
      .where(inArray(orchestrationRuns.status, ['queued', 'running']))
      .orderBy(orchestrationRuns.createdAt);
  }

  async getMetrics(options?: { 
    workspaceId?: string; 
    category?: string; 
    since?: Date 
  }): Promise<RunMetrics> {
    const conditions = [];
    
    if (options?.workspaceId) {
      conditions.push(eq(orchestrationRuns.workspaceId, options.workspaceId));
    }
    if (options?.category) {
      conditions.push(eq(orchestrationRuns.category, options.category));
    }
    if (options?.since) {
      conditions.push(gte(orchestrationRuns.createdAt, options.since));
    }

    const [result] = await db.select({
      totalRuns: sql<number>`count(*)::int`,
      completedRuns: sql<number>`count(*) filter (where ${orchestrationRuns.status} = 'completed')::int`,
      failedRuns: sql<number>`count(*) filter (where ${orchestrationRuns.status} = 'failed')::int`,
      averageDurationMs: sql<number>`avg(${orchestrationRuns.durationMs})::int`,
      slaMetCount: sql<number>`count(*) filter (where ${orchestrationRuns.slaMet} = true)::int`,
    })
    .from(orchestrationRuns)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

    return {
      totalRuns: result?.totalRuns || 0,
      completedRuns: result?.completedRuns || 0,
      failedRuns: result?.failedRuns || 0,
      averageDurationMs: result?.averageDurationMs || 0,
      slaComplianceRate: result?.totalRuns ? (result.slaMetCount || 0) / result.totalRuns : 0,
    };
  }

  async cleanupOldRuns(retentionDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await db.delete(orchestrationRuns)
      .where(and(
        lte(orchestrationRuns.createdAt, cutoffDate),
        inArray(orchestrationRuns.status, ['completed', 'failed', 'cancelled', 'rolled_back'])
      ));

    return result.rowCount || 0;
  }
}

export const workflowLedger = WorkflowLedgerService.getInstance();
