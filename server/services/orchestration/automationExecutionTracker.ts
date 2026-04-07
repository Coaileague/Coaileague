/**
 * Automation Execution Tracker Service
 * 
 * Tracks the complete lifecycle of all automation actions:
 * - Queued → In Progress → Completed/Failed
 * - Provides user-visible breakdown of work done
 * - Verification workflow before external system sync
 * - Failure reasons with remediation steps
 * - Integration with Trinity/Claude AI for summaries
 */

import { db } from '../../db';
import { automationExecutions } from '@shared/schema';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import { helpaiOrchestrator } from '../helpai/platformActionHub';
import { meteredGemini } from '../billing/meteredGeminiClient';
import { notifyWorkspaceFailure, publishEvent } from './pipelineErrorHandler';
import { createLogger } from '../../lib/logger';
const log = createLogger('automationExecutionTracker');


export type ExecutionStatus = 
  | 'queued'
  | 'in_progress' 
  | 'completed'
  | 'failed'
  | 'pending_verification'
  | 'verified'
  | 'rejected';

export type ActionType =
  | 'quickbooks_sync'
  | 'payroll_run'
  | 'invoice_generation'
  | 'schedule_publish'
  | 'employee_import'
  | 'time_entry_approval'
  | 'compliance_check'
  | 'report_generation'
  | 'data_export'
  | 'integration_sync'
  | 'schedule_analysis'
  | 'billing_run'
  | 'custom';

export interface WorkBreakdownItem {
  label: string;
  value: string | number;
  icon?: string;
  category?: string;
}

export interface WorkBreakdown {
  items: WorkBreakdownItem[];
  totalCount: number;
  totalValue?: number;
  currency?: string;
}

export interface RemediationStep {
  step: number;
  description: string;
  actionUrl?: string;
  actionLabel?: string;
}

export interface CreateExecutionParams {
  workspaceId: string;
  actionType: ActionType | string;
  actionName: string;
  actionId?: string;
  triggeredBy?: string;
  triggerSource?: 'button_click' | 'scheduled' | 'api' | 'event' | 'ai_brain';
  inputPayload?: Record<string, any>;
  externalSystem?: string;
  requiresVerification?: boolean;
}

export interface UpdateExecutionParams {
  status?: ExecutionStatus;
  outputPayload?: Record<string, any>;
  workBreakdown?: WorkBreakdown;
  aiSummary?: string;
  externalSyncStatus?: 'pending' | 'synced' | 'failed';
  externalReference?: string;
  failureReason?: string;
  failureCode?: string;
  remediationSteps?: RemediationStep[];
  processingTimeMs?: number;
  itemsProcessed?: number;
  itemsFailed?: number;
  totalValueProcessed?: number;
  requiresVerification?: boolean;
}

// UUID v4 pattern — workspace IDs like "system", "demo-workspace-00000000",
// "coaileague-platform-workspace" are valid dev/platform IDs but not PostgreSQL
// UUIDs.  Storing them as-is blows up the DB insert.  We null them out so the
// execution is still tracked; the workspace filter still works for real UUID IDs.
function isValidUUID(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

class AutomationExecutionTrackerService {
  private aiEnabled = true;

  async createExecution(params: CreateExecutionParams): Promise<string> {
    const executionId = crypto.randomUUID();
    const safeWorkspaceId = isValidUUID(params.workspaceId) ? params.workspaceId : null;
    
    try {
      await db.insert(automationExecutions).values({
        id: executionId,
        workspaceId: safeWorkspaceId,
        actionType: params.actionType,
        actionName: params.actionName,
        actionId: params.actionId,
        triggeredBy: params.triggeredBy || 'system',
        triggerSource: params.triggerSource || 'api',
        inputPayload: params.inputPayload,
        externalSystem: params.externalSystem,
        requiresVerification: params.requiresVerification ?? false,
        status: 'queued',
        queuedAt: new Date(),
      });

      log.info(`[AutomationExecutionTracker] Created execution ${executionId}:`, {
        actionType: params.actionType,
        actionName: params.actionName,
        workspaceId: params.workspaceId,
      });

      return executionId;
    } catch (error) {
      log.error('[AutomationExecutionTracker] Failed to create execution:', error);
      throw error;
    }
  }

  async startExecution(executionId: string): Promise<void> {
    // FIX [EXECUTION STATUS MACHINE]: Only transition from 'queued' state.
    // This prevents a race condition where a completed or failed execution is
    // accidentally re-started (e.g., by a duplicate trigger or retry without
    // idempotency checks), which would overwrite the final status record.
    const result = await db.update(automationExecutions)
      .set({
        status: 'in_progress',
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(automationExecutions.id, executionId),
        eq(automationExecutions.status, 'queued')
      ))
      .returning({ id: automationExecutions.id });

    if (!result[0]) {
      log.warn(`[AutomationExecutionTracker] startExecution skipped — execution ${executionId} is not in 'queued' state (duplicate trigger or race condition)`);
      return;
    }

    log.info(`[AutomationExecutionTracker] Started execution ${executionId}`);
  }

  async completeExecution(executionId: string, params: UpdateExecutionParams): Promise<void> {
    const completedAt = new Date();
    const execution = await this.getExecution(executionId);
    
    let processingTimeMs = params.processingTimeMs;
    if (!processingTimeMs && execution?.startedAt) {
      processingTimeMs = completedAt.getTime() - new Date(execution.startedAt).getTime();
    }

    const finalStatus: ExecutionStatus = params.requiresVerification 
      ? 'pending_verification' 
      : 'completed';

    let aiSummary = params.aiSummary;
    if (!aiSummary && this.aiEnabled && params.workBreakdown) {
      aiSummary = await this.generateAISummary(execution, params);
    }

    await db.update(automationExecutions)
      .set({
        status: finalStatus,
        completedAt,
        outputPayload: params.outputPayload,
        workBreakdown: params.workBreakdown,
        aiSummary,
        externalSyncStatus: params.externalSyncStatus || 'pending',
        externalReference: params.externalReference,
        processingTimeMs,
        itemsProcessed: params.itemsProcessed,
        itemsFailed: params.itemsFailed,
        totalValueProcessed: params.totalValueProcessed?.toString(),
        updatedAt: new Date(),
      })
      .where(eq(automationExecutions.id, executionId));

    log.info(`[AutomationExecutionTracker] Completed execution ${executionId}:`, {
      status: finalStatus,
      itemsProcessed: params.itemsProcessed,
      processingTimeMs,
    });

    if (execution?.workspaceId) {
      const isPendingVerification = finalStatus === 'pending_verification';
      publishEvent(
        () => platformEventBus.publish({
          type: isPendingVerification ? 'automation_pending_verification' : 'automation_execution_completed',
          category: 'automation',
          title: isPendingVerification ? 'Automation Awaiting Verification' : 'Automation Execution Complete',
          description: isPendingVerification
            ? `Automation action '${execution.actionType}' processed ${params.itemsProcessed ?? 0} items — pending human verification`
            : `Automation action '${execution.actionType}' completed — ${params.itemsProcessed ?? 0} items processed`,
          workspaceId: execution.workspaceId,
          metadata: {
            executionId,
            actionType: execution.actionType,
            itemsProcessed: params.itemsProcessed,
            requiresVerification: isPendingVerification,
          },
        }),
        '[AutomationExecutionTracker] completeExecution event publish',
      );
    }
  }

  async failExecution(executionId: string, params: {
    failureReason: string;
    failureCode?: string;
    remediationSteps?: RemediationStep[];
    itemsProcessed?: number;
    itemsFailed?: number;
  }): Promise<void> {
    const execution = await this.getExecution(executionId);
    const completedAt = new Date();
    
    let processingTimeMs: number | undefined;
    if (execution?.startedAt) {
      processingTimeMs = completedAt.getTime() - new Date(execution.startedAt).getTime();
    }

    const retryCount = (execution?.retryCount || 0) + 1;
    const maxRetries = execution?.maxRetries || 3;
    const canRetry = retryCount < maxRetries;

    let remediationSteps = params.remediationSteps;
    if (!remediationSteps && this.aiEnabled && execution?.workspaceId) {
      remediationSteps = await this.generateRemediationSteps(params.failureReason, execution.workspaceId, params.failureCode);
    }

    await db.update(automationExecutions)
      .set({
        status: 'failed',
        completedAt,
        failureReason: params.failureReason,
        failureCode: params.failureCode,
        remediationSteps,
        retryCount,
        processingTimeMs,
        itemsProcessed: params.itemsProcessed,
        itemsFailed: params.itemsFailed,
        updatedAt: new Date(),
      })
      .where(eq(automationExecutions.id, executionId));

    log.info(`[AutomationExecutionTracker] Failed execution ${executionId}:`, {
      failureCode: params.failureCode,
      canRetry,
      retryCount,
    });

    if (execution?.workspaceId) {
      // Event bus broadcast (fire-and-forget; failures logged not swallowed)
      platformEventBus.publish({
        type: 'automation_execution_failed',
        category: 'automation',
        title: 'Automation Execution Failed',
        description: `Automation action '${execution.actionType}' failed — ${params.failureReason}${canRetry ? ' (will retry)' : ' (max retries reached)'}`,
        workspaceId: execution.workspaceId,
        metadata: {
          executionId,
          actionType: execution.actionType,
          failureReason: params.failureReason,
          failureCode: params.failureCode,
          canRetry,
        },
      }).catch(err =>
        log.warn(
          '[AutomationExecutionTracker] Event bus publish failed:',
          err instanceof Error ? err.message : String(err)
        )
      );

      // On final failure (no more retries), surface to org owner via in-app + email
      if (!canRetry) {
        const remediationHints = remediationSteps?.map((s) => s.description) ?? [
          'Review the failure details in the Automations dashboard.',
          'Check that all required integrations are connected and active.',
          'Contact support if the issue persists.',
        ];

        notifyWorkspaceFailure(
          execution.workspaceId,
          `Automation Action Failed: ${execution.actionType}`,
          params.failureReason,
          {
            actionUrl: '/settings/automations',
            pipelineName: execution.actionType,
            executionId,
            errorCode: params.failureCode as any,
            remediationHints,
          }
        ).catch(err =>
          log.warn(
            '[AutomationExecutionTracker] notifyWorkspaceFailure failed (non-blocking):',
            err instanceof Error ? err.message : String(err)
          )
        );
      }
    }
  }

  async verifyExecution(executionId: string, params: {
    verifiedBy: string;
    verificationNotes?: string;
  }): Promise<void> {
    const execution = await this.getExecution(executionId);
    
    if (!execution) {
      throw new Error('Execution not found');
    }

    if (execution.status === 'verified') {
      log.info(`[AutomationExecutionTracker] Execution ${executionId} already verified, skipping`);
      return;
    }

    if (execution.status === 'completed') {
      log.info(`[AutomationExecutionTracker] Execution ${executionId} already completed, upgrading to verified`);
    } else if (execution.status !== 'pending_verification') {
      throw new Error(`Execution cannot be verified — current status: ${execution.status}`);
    }

    await db.update(automationExecutions)
      .set({
        status: 'verified',
        verifiedBy: params.verifiedBy,
        verifiedAt: new Date(),
        verificationNotes: params.verificationNotes,
        updatedAt: new Date(),
      })
      .where(eq(automationExecutions.id, executionId));

    log.info(`[AutomationExecutionTracker] Verified execution ${executionId} by ${params.verifiedBy}`);

    publishEvent(
      () => platformEventBus.publish({
        type: 'automation_execution_verified',
        category: 'automation',
        title: 'Automation Output Verified',
        description: `Automation action '${execution.actionType}' verified by ${params.verifiedBy}`,
        workspaceId: execution.workspaceId,
        metadata: {
          executionId,
          actionType: execution.actionType,
          verifiedBy: params.verifiedBy,
          externalSystem: execution.externalSystem,
        },
      }),
      '[AutomationExecutionTracker] verifyExecution event publish',
    );
  }

  async rejectExecution(executionId: string, params: {
    rejectedBy: string;
    rejectionReason: string;
  }): Promise<void> {
    const execution = await this.getExecution(executionId);
    
    if (!execution || execution.status !== 'pending_verification') {
      throw new Error('Execution not found or not pending verification');
    }

    await db.update(automationExecutions)
      .set({
        status: 'rejected',
        rejectedBy: params.rejectedBy,
        rejectedAt: new Date(),
        rejectionReason: params.rejectionReason,
        updatedAt: new Date(),
      })
      .where(eq(automationExecutions.id, executionId));

    log.info(`[AutomationExecutionTracker] Rejected execution ${executionId} by ${params.rejectedBy}`);

    publishEvent(
      () => platformEventBus.publish({
        type: 'automation_execution_rejected',
        category: 'automation',
        title: 'Automation Output Rejected',
        description: `Automation action '${execution.actionType}' rejected by ${params.rejectedBy} — ${params.rejectionReason}`,
        workspaceId: execution.workspaceId,
        metadata: {
          executionId,
          actionType: execution.actionType,
          rejectedBy: params.rejectedBy,
          rejectionReason: params.rejectionReason,
        },
      }),
      '[AutomationExecutionTracker] rejectExecution event publish',
    );
  }

  async syncToExternalSystem(executionId: string, externalReference: string): Promise<void> {
    await db.update(automationExecutions)
      .set({
        externalSyncStatus: 'synced',
        externalSyncAt: new Date(),
        externalReference,
        updatedAt: new Date(),
      })
      .where(eq(automationExecutions.id, executionId));

    log.info(`[AutomationExecutionTracker] Synced execution ${executionId} to external system:`, externalReference);
  }

  async getExecution(executionId: string) {
    const [execution] = await db.select()
      .from(automationExecutions)
      .where(eq(automationExecutions.id, executionId))
      .limit(1);
    return execution;
  }

  async getWorkspaceExecutions(workspaceId: string, options?: {
    status?: ExecutionStatus;
    actionType?: string;
    limit?: number;
    since?: Date;
  }) {
    let query = db.select()
      .from(automationExecutions)
      .where(eq(automationExecutions.workspaceId, workspaceId))
      .orderBy(desc(automationExecutions.queuedAt));

    if (options?.limit) {
      query = query.limit(options.limit) as typeof query;
    }

    const results = await query;

    return results.filter(exec => {
      if (options?.status && exec.status !== options.status) return false;
      if (options?.actionType && exec.actionType !== options.actionType) return false;
      if (options?.since && new Date(exec.queuedAt) < options.since) return false;
      return true;
    });
  }

  async getPendingVerifications(workspaceId: string) {
    return db.select()
      .from(automationExecutions)
      .where(and(
        eq(automationExecutions.workspaceId, workspaceId),
        eq(automationExecutions.status, 'pending_verification')
      ))
      .orderBy(desc(automationExecutions.completedAt));
  }

  async getStats(workspaceId: string, since?: Date) {
    const executions = await this.getWorkspaceExecutions(workspaceId, { since });
    
    const byStatus: Record<string, number> = {};
    const byActionType: Record<string, number> = {};
    let totalProcessed = 0;
    let totalFailed = 0;
    let totalValue = 0;

    executions.forEach(exec => {
      byStatus[exec.status] = (byStatus[exec.status] || 0) + 1;
      byActionType[exec.actionType] = (byActionType[exec.actionType] || 0) + 1;
      totalProcessed += exec.itemsProcessed || 0;
      totalFailed += exec.itemsFailed || 0;
      if (exec.totalValueProcessed) {
        totalValue += parseFloat(exec.totalValueProcessed);
      }
    });

    return {
      total: executions.length,
      byStatus,
      byActionType,
      totalItemsProcessed: totalProcessed,
      totalItemsFailed: totalFailed,
      totalValueProcessed: totalValue,
      pendingVerification: byStatus['pending_verification'] || 0,
      successRate: executions.length > 0 
        ? ((byStatus['completed'] || 0) + (byStatus['verified'] || 0)) / executions.length 
        : 0,
    };
  }

  private async generateAISummary(
    execution: any, 
    params: UpdateExecutionParams
  ): Promise<string> {
    try {
      const prompt = `Generate a brief, user-friendly summary (2-3 sentences) of this automation:
Action: ${execution?.actionName || 'Unknown'}
Type: ${execution?.actionType || 'Unknown'}
Items Processed: ${params.itemsProcessed || 0}
Items Failed: ${params.itemsFailed || 0}
Total Value: ${params.totalValueProcessed ? `$${params.totalValueProcessed}` : 'N/A'}
Work Breakdown: ${JSON.stringify(params.workBreakdown?.items || [])}

Be concise and focus on what was accomplished.`;

      const result = await meteredGemini.generate({
        workspaceId: execution?.workspaceId || 'system',
        featureKey: 'automation_summary',
        prompt,
        maxOutputTokens: 150,
      });

      return result.text || 'Automation completed successfully.';
    } catch (error) {
      log.warn('[AutomationExecutionTracker] AI summary generation failed:', error);
      return `Processed ${params.itemsProcessed || 0} items successfully.`;
    }
  }

  private async generateRemediationSteps(
    failureReason: string,
    workspaceId: string,
    failureCode?: string
  ): Promise<RemediationStep[]> {
    try {
      const prompt = `Generate 2-3 simple remediation steps for this automation failure:
Failure Reason: ${failureReason}
Failure Code: ${failureCode || 'UNKNOWN'}

Return as JSON array: [{ "step": 1, "description": "..." }]`;

      const result = await meteredGemini.generate({
        workspaceId, // Billed to org where failure occurred
        featureKey: 'automation_remediation',
        prompt,
        maxOutputTokens: 200,
      });

      const parsed = JSON.parse(result.text || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      log.warn('[AutomationExecutionTracker] Remediation steps generation failed:', error);
      return [
        { step: 1, description: 'Review the error details above' },
        { step: 2, description: 'Check your connection settings' },
        { step: 3, description: 'Contact support if the issue persists' },
      ];
    }
  }
}

export const automationExecutionTracker = new AutomationExecutionTrackerService();

export function registerExecutionTrackerActions(orchestrator: typeof helpaiOrchestrator): void {
  orchestrator.registerAction({
    actionId: 'execution_tracker.create',
    name: 'Create Automation Execution',
    category: 'automation',
    description: 'Create a new automation execution record',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request) => {
      if (!request.workspaceId) {
        return { success: false, actionId: request.actionId, message: 'workspaceId required to create execution record', data: null, executionTimeMs: 0 };
      }
      const executionId = await automationExecutionTracker.createExecution({
        workspaceId: request.workspaceId,
        actionType: request.payload?.actionType || 'custom',
        actionName: request.payload?.actionName || 'Custom Action',
        actionId: request.actionId,
        triggeredBy: request.userId,
        triggerSource: 'ai_brain',
        inputPayload: request.payload,
        externalSystem: request.payload?.externalSystem,
        requiresVerification: request.payload?.requiresVerification,
      });

      return {
        success: true,
        actionId: request.actionId,
        message: `Execution ${executionId} created`,
        data: { executionId },
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'execution_tracker.verify',
    name: 'Verify Automation Execution',
    category: 'automation',
    description: 'Verify and approve a pending automation execution',
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request) => {
      await automationExecutionTracker.verifyExecution(request.payload?.executionId, {
        verifiedBy: request.userId,
        verificationNotes: request.payload?.notes,
      });

      return {
        success: true,
        actionId: request.actionId,
        message: 'Execution verified',
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'execution_tracker.reject',
    name: 'Reject Automation Execution',
    category: 'automation',
    description: 'Reject a pending automation execution',
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request) => {
      await automationExecutionTracker.rejectExecution(request.payload?.executionId, {
        rejectedBy: request.userId,
        rejectionReason: request.payload?.reason || 'Rejected by user',
      });

      return {
        success: true,
        actionId: request.actionId,
        message: 'Execution rejected',
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'execution_tracker.get_pending',
    name: 'Get Pending Verifications',
    category: 'automation',
    description: 'Get all executions pending verification',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request) => {
      if (!request.workspaceId) {
        return { success: false, actionId: request.actionId, message: 'workspaceId required', data: null, executionTimeMs: 0 };
      }
      const pending = await automationExecutionTracker.getPendingVerifications(
        request.workspaceId
      );

      return {
        success: true,
        actionId: request.actionId,
        message: `Found ${pending.length} pending verifications`,
        data: { executions: pending },
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'execution_tracker.get_stats',
    name: 'Get Execution Stats',
    category: 'automation',
    description: 'Get automation execution statistics',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request) => {
      if (!request.workspaceId) {
        return { success: false, actionId: request.actionId, message: 'workspaceId required', data: null, executionTimeMs: 0 };
      }
      const since = request.payload?.since ? new Date(request.payload.since) : undefined;
      const stats = await automationExecutionTracker.getStats(
        request.workspaceId,
        since
      );

      return {
        success: true,
        actionId: request.actionId,
        message: 'Stats retrieved',
        data: stats,
        executionTimeMs: 0,
      };
    },
  });

  log.info('[AutomationExecutionTracker] Registered 5 AI Brain actions');
}
