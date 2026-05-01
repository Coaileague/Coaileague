/**
 * AUTOMATION ORCHESTRATION SERVICE
 * =================================
 * Fortune 500-grade 7-step orchestration wrapper for ALL platform automations.
 * Ensures every daemon, scheduled task, cron job, and background process follows:
 * 
 * TRIGGER → FETCH → VALIDATE → PROCESS → MUTATE → CONFIRM → NOTIFY
 * 
 * This provides:
 * - Complete visibility into every automated operation
 * - Step-level logging with timing and payloads
 * - Proper billing/metering integration
 * - Structured error capture with remediation
 * - Middleware-aware failure notifications
 * 
 * Usage:
 * await automationOrchestration.executeAutomation({
 *   domain: 'scheduling',
 *   automationName: 'autonomous-scheduling-daemon',
 *   workspaceId: '...',
 *   triggeredBy: 'cron',
 * }, async (ctx) => {
 *   // Your automation logic here
 *   return { processed: 100 };
 * });
 */

import { universalStepLogger, OrchestrationContext, StepResult, OrchestrationDomain } from './universalStepLogger';
import { platformEventBus } from '../platformEventBus';
import { db } from '../../db';
import { systemAuditLogs, workspaces } from '@shared/schema';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { classifyPipelineError, notifyWorkspaceFailure } from './pipelineErrorHandler';
import { createLogger } from '../../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../billing/billingConstants';
const log = createLogger('automationOrchestration');


export type AutomationType = 
  | 'daemon'
  | 'scheduled_task'
  | 'cron_job'
  | 'background_process'
  | 'data_migration'
  | 'cleanup_job'
  | 'sync_operation'
  | 'notification_batch'
  | 'email_delivery'
  | 'sms_delivery'
  | 'document_processing'
  | 'report_generation'
  | 'backup'
  | 'health_check'
  | 'billing_cycle';

export interface AutomationParams {
  domain: OrchestrationDomain;
  automationName: string;
  automationType: AutomationType;
  workspaceId?: string;
  userId?: string;
  triggeredBy: 'cron' | 'event' | 'api' | 'ai_brain' | 'system' | 'webhook';
  payload?: Record<string, unknown>;
  billable?: boolean;
  creditCost?: number;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface AutomationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  step?: string;
  orchestrationId?: string;
  durationMs?: number;
  remediation?: string;
  retryable?: boolean;
  metered?: {
    domain: string;
    operation: string;
    cost: number;
    billed: boolean;
  };
}

interface AutomationStepContext {
  orchestrationId: string;
  domain: OrchestrationDomain;
  automationName: string;
  automationType: AutomationType;
  workspaceId?: string;
  fetchedData: Record<string, unknown>;
}

const AUTOMATION_ERROR_CODES: Record<string, { remediation: string; retryable: boolean }> = {
  'TIMEOUT': {
    remediation: 'Automation exceeded time limit. Will retry with extended timeout.',
    retryable: true,
  },
  'DB_CONNECTION_FAILED': {
    remediation: 'Database connection failed. Will retry in next cycle.',
    retryable: true,
  },
  'EXTERNAL_SERVICE_DOWN': {
    remediation: 'External service unavailable. Will retry after service recovery.',
    retryable: true,
  },
  'INSUFFICIENT_CREDITS': {
    remediation: 'AI operation usage exceeds plan limits. Contact support to review your plan.',
    retryable: false,
  },
  'PERMISSION_DENIED': {
    remediation: 'Automation lacks required permissions. Check service account settings.',
    retryable: false,
  },
  'VALIDATION_FAILED': {
    remediation: 'Input data validation failed. Check data integrity.',
    retryable: false,
  },
  'RESOURCE_LOCKED': {
    remediation: 'Resource is locked by another process. Will retry after lock release.',
    retryable: true,
  },
  'RATE_LIMITED': {
    remediation: 'Rate limit exceeded. Operation will retry after cooldown.',
    retryable: true,
  },
  'DATA_INTEGRITY_ERROR': {
    remediation: 'Data integrity check failed. Manual review required.',
    retryable: false,
  },
  'UNKNOWN': {
    remediation: 'Unexpected error occurred. Check logs for details.',
    retryable: false,
  },
};

class AutomationOrchestrationService {
  private static instance: AutomationOrchestrationService;
  private activeAutomations: Map<string, { startTime: Date; params: AutomationParams }> = new Map();
  private executionHistory: Array<{
    orchestrationId: string;
    domain: string;
    automationName: string;
    status: 'success' | 'failed';
    durationMs: number;
    timestamp: Date;
    errorCode?: string;
  }> = [];

  private constructor() {}

  static getInstance(): AutomationOrchestrationService {
    if (!AutomationOrchestrationService.instance) {
      AutomationOrchestrationService.instance = new AutomationOrchestrationService();
    }
    return AutomationOrchestrationService.instance;
  }

  /**
   * Execute an automation through the full 7-step pipeline
   */
  async executeAutomation<T>(
    params: AutomationParams,
    executor: (ctx: AutomationStepContext, orchestrationCtx: OrchestrationContext) => Promise<T>,
    options?: {
      fetch?: (ctx: AutomationStepContext) => Promise<Record<string, any>>;
      validate?: (ctx: AutomationStepContext) => Promise<{ valid: boolean; errors?: string[] }>;
      notify?: (result: T, ctx: AutomationStepContext) => Promise<void>;
    }
  ): Promise<AutomationResult<T>> {
    const startTime = Date.now();
    const orchestrationId = `auto-${params.automationType}-${uuidv4().slice(0, 8)}`;
    let orchestrationCtx: OrchestrationContext | null = null;

    this.activeAutomations.set(orchestrationId, { startTime: new Date(), params });

    try {
      orchestrationCtx = await universalStepLogger.startOrchestration({
        domain: params.domain,
        actionName: params.automationName,
        actionId: orchestrationId,
        workspaceId: params.workspaceId || PLATFORM_WORKSPACE_ID,
        userId: params.userId,
        triggeredBy: params.triggeredBy === 'system' ? 'cron' : params.triggeredBy,
        triggerDetails: {
          automationType: params.automationType,
          payload: params.payload,
          billable: params.billable,
        },
        requiredFeature: params.billable ? 'automation' : undefined,
      });

      await universalStepLogger.logStep(orchestrationCtx, 'TRIGGER', 'completed', {
        outputPayload: {
          automationType: params.automationType,
          domain: params.domain,
          triggeredBy: params.triggeredBy,
        },
      });

      await universalStepLogger.logStep(orchestrationCtx, 'FETCH', 'started');
      let fetchedData: Record<string, unknown> = {};
      
      if (options?.fetch) {
        fetchedData = await options.fetch({
          orchestrationId,
          domain: params.domain,
          automationName: params.automationName,
          automationType: params.automationType,
          workspaceId: params.workspaceId,
          fetchedData: {},
        });
      }

      if (params.workspaceId && params.billable) {
        const [workspace] = await db.select()
          .from(workspaces)
          .where(eq(workspaces.id, params.workspaceId))
          .limit(1);
        
        fetchedData.workspace = workspace;
        fetchedData.subscriptionTier = workspace?.subscriptionTier || 'free';
      }

      await universalStepLogger.logStep(orchestrationCtx, 'FETCH', 'completed', {
        outputPayload: { keysLoaded: Object.keys(fetchedData) },
      });

      await universalStepLogger.logStep(orchestrationCtx, 'VALIDATE', 'started');
      
      if (options?.validate) {
        const validationResult = await options.validate({
          orchestrationId,
          domain: params.domain,
          automationName: params.automationName,
          automationType: params.automationType,
          workspaceId: params.workspaceId,
          fetchedData,
        });

        if (!validationResult.valid) {
          await universalStepLogger.logStep(orchestrationCtx, 'VALIDATE', 'failed', {
            error: validationResult.errors?.join('; '),
            errorCode: 'VALIDATION_FAILED',
          });
          throw new Error(`Validation failed: ${validationResult.errors?.join('; ')}`);
        }
      }

      await universalStepLogger.logStep(orchestrationCtx, 'VALIDATE', 'completed');

      await universalStepLogger.logStep(orchestrationCtx, 'PROCESS', 'started');
      
      const stepContext: AutomationStepContext = {
        orchestrationId,
        domain: params.domain,
        automationName: params.automationName,
        automationType: params.automationType,
        workspaceId: params.workspaceId,
        fetchedData,
      };

      // PROCESS step with retry loop (exponential backoff, retryable errors only)
      const processMaxAttempts = (params.maxRetries ?? 2) + 1; // e.g. maxRetries=2 → 3 total attempts
      const processBaseDelay = 1000;
      let result: T | undefined;
      let processLastError: unknown;
      let processSucceeded = false;

      for (let attempt = 1; attempt <= processMaxAttempts; attempt++) {
        try {
          const runExecutor = (): Promise<T> =>
            params.timeoutMs
              ? Promise.race([
                  executor(stepContext, orchestrationCtx!),
                  new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Automation timeout')), params.timeoutMs)
                  ),
                ])
              : executor(stepContext, orchestrationCtx!);

          result = await runExecutor();
          processSucceeded = true;

          if (attempt > 1) {
            log.info(
              `[AutomationOrchestration] ${params.automationName} succeeded on attempt ${attempt}/${processMaxAttempts}`
            );
          }
          break;
        } catch (retryErr: any) {
          processLastError = retryErr;
          const classified = classifyPipelineError(retryErr);

          if (attempt < processMaxAttempts && classified.retryable) {
            const jitter = Math.random() * 300;
            const delay = processBaseDelay * Math.pow(2, attempt - 1) + jitter;
            log.warn(
              `[AutomationOrchestration] ${params.automationName} attempt ${attempt}/${processMaxAttempts} failed (${classified.code}) — retrying in ${Math.round(delay)}ms: ${classified.technicalDetail}`
            );
            await new Promise<void>((resolve) => setTimeout(resolve, delay));
          } else {
            const reason = classified.retryable ? 'max attempts reached' : 'not retryable';
            log.error(
              `[AutomationOrchestration] ${params.automationName} permanently FAILED (${reason}) after ${attempt} attempt(s): ${classified.technicalDetail}`
            );
            break;
          }
        }
      }

      if (!processSucceeded) {
        throw processLastError ?? new Error(`${params.automationName} failed after all retry attempts`);
      }

      await universalStepLogger.logStep(orchestrationCtx, 'PROCESS', 'completed', {
        outputPayload: { resultType: typeof result },
      });

      await universalStepLogger.logStep(orchestrationCtx, 'MUTATE', 'started');
      
      try {
        await db.insert(systemAuditLogs).values({
          id: uuidv4(),
          action: `automation.${params.automationType}.${params.automationName}`,
          entityType: params.domain || 'automation',
          entityId: orchestrationId,
          userId: params.userId || null,
          workspaceId: params.workspaceId || PLATFORM_WORKSPACE_ID,
          metadata: {
            orchestrationId,
            domain: params.domain,
            automationType: params.automationType,
            durationMs: Date.now() - startTime,
            success: true,
          },
          createdAt: new Date(),
        });
      } catch (auditError) {
        log.warn('[AutomationOrchestration] Non-fatal: audit log insert failed', (auditError as Error).message);
      }

      await universalStepLogger.logStep(orchestrationCtx, 'MUTATE', 'completed', {
        outputPayload: { auditLogCreated: true },
      });

      await universalStepLogger.logStep(orchestrationCtx, 'CONFIRM', 'started');
      await universalStepLogger.logStep(orchestrationCtx, 'CONFIRM', 'completed');

      await universalStepLogger.logStep(orchestrationCtx, 'NOTIFY', 'started');
      
      if (options?.notify) {
        await options.notify(result, stepContext);
      }

      platformEventBus.publish({
        type: 'automation_completed',
        category: 'automation',
        title: `Automation Completed: ${params.automationName}`,
        description: `${params.automationType} automation in ${params.domain} domain completed successfully in ${Date.now() - startTime}ms`,
        workspaceId: params.workspaceId,
        metadata: {
          orchestrationId,
          domain: params.domain,
          automationName: params.automationName,
          automationType: params.automationType,
          durationMs: Date.now() - startTime,
          success: true,
        },
      }).catch(err => log.warn('[AutomationOrchestration] Event publish failed (non-blocking):', (err instanceof Error ? err.message : String(err))));

      await universalStepLogger.logStep(orchestrationCtx, 'NOTIFY', 'completed');
      await universalStepLogger.completeOrchestration(orchestrationCtx.orchestrationId, 'completed');

      this.recordExecution(orchestrationId, params.domain, params.automationName, 'success', Date.now() - startTime);
      this.activeAutomations.delete(orchestrationId);

      return {
        success: true,
        data: result,
        orchestrationId,
        durationMs: Date.now() - startTime,
        metered: params.billable ? {
          domain: params.domain,
          operation: params.automationName,
          cost: params.creditCost || 0,
          billed: true,
        } : undefined,
      };

    } catch (error: any) {
      const durationMs = Date.now() - startTime;

      // DUPLICATE_ORCHESTRATION is a deduplication guard, not a real failure.
      // Silently return success so the RL system is not contaminated with false negatives.
      if (typeof error?.message === 'string' && error.message.startsWith('DUPLICATE_ORCHESTRATION')) {
        this.activeAutomations.delete(orchestrationId);
        return {
          success: true,
          data: undefined as unknown as T,
          orchestrationId,
          durationMs,
        };
      }

      log.error(`[AutomationOrchestration] ${params.automationName} FAILED (${durationMs}ms):`, error?.message ?? String(error), error?.stack ? `\n${error.stack}` : '');
      const errorCode = this.categorizeError(error);
      const errorInfo = AUTOMATION_ERROR_CODES[errorCode] || AUTOMATION_ERROR_CODES['UNKNOWN'];

      if (orchestrationCtx) {
        const currentStep = this.getCurrentStep(orchestrationCtx);
        await universalStepLogger.logStep(orchestrationCtx, currentStep, 'failed', {
          error: (error instanceof Error ? error.message : String(error)),
          errorCode,
        });
        await universalStepLogger.completeOrchestration(orchestrationCtx.orchestrationId, 'failed');
      }

      try {
        await db.insert(systemAuditLogs).values({
          id: uuidv4(),
          action: `automation.${params.automationType}.${params.automationName}.failed`,
          entityType: params.domain || 'automation',
          entityId: orchestrationId,
          userId: params.userId || null,
          workspaceId: params.workspaceId || PLATFORM_WORKSPACE_ID,
          metadata: {
            orchestrationId,
            domain: params.domain,
            automationType: params.automationType,
            durationMs,
            error: error.message,
            errorCode,
            retryable: errorInfo.retryable,
          },
          createdAt: new Date(),
        });
      } catch (auditError) {
        log.warn('[AutomationOrchestration] Non-fatal: error audit log insert failed', (auditError as Error).message);
      }

      platformEventBus.publish({
        type: 'automation_execution_failed',
        category: 'automation',
        title: `Automation Failed: ${params.automationName}`,
        description: `${params.automationType} automation failed in ${params.domain} — ${errorInfo.remediation || error.message}`,
        workspaceId: params.workspaceId,
        metadata: {
          orchestrationId,
          domain: params.domain,
          automationName: params.automationName,
          automationType: params.automationType,
          error: error.message,
          errorCode,
          retryable: errorInfo.retryable,
          remediation: errorInfo.remediation,
        },
      }).catch(err => log.warn('[AutomationOrchestration] Failure event publish failed (non-blocking):', (err instanceof Error ? err.message : String(err))));

      // Surface the failure to the org owner as an in-app notification + email
      // (only for workspace-scoped automations — platform-wide jobs skip this)
      if (params.workspaceId && params.workspaceId !== PLATFORM_WORKSPACE_ID) {
        notifyWorkspaceFailure(
          params.workspaceId,
          `Automation Failed: ${params.automationName}`,
          errorInfo.remediation ||
            `The automation "${params.automationName}" failed and could not complete. ${error.message}`,
          {
            actionUrl: '/settings/automations',
            pipelineName: params.automationName,
            errorCode: errorCode as any,
            remediationHints: [
              errorInfo.remediation,
              'Check the automation logs in Settings > Automations for more detail.',
              'Contact support if the issue persists.',
            ].filter(Boolean) as string[],
          }
        ).catch(err =>
          log.warn(
            '[AutomationOrchestration] notifyWorkspaceFailure failed (non-blocking):',
            (err instanceof Error ? err.message : String(err))
          )
        );
      }

      this.recordExecution(orchestrationId, params.domain, params.automationName, 'failed', durationMs, errorCode);
      this.activeAutomations.delete(orchestrationId);

      return {
        success: false,
        error: error.message,
        errorCode,
        orchestrationId,
        durationMs,
        remediation: errorInfo.remediation,
        retryable: errorInfo.retryable,
      };
    }
  }

  /**
   * Execute a simple automation without the full pipeline (for quick operations)
   */
  async executeSimple<T>(
    domain: OrchestrationDomain,
    automationName: string,
    workspaceId: string | undefined,
    executor: () => Promise<T>
  ): Promise<AutomationResult<T>> {
    return this.executeAutomation<T>(
      {
        domain,
        automationName,
        automationType: 'background_process',
        workspaceId,
        triggeredBy: 'system',
      },
      async () => executor()
    );
  }

  private categorizeError(error: Error): string {
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout')) return 'TIMEOUT';
    if (message.includes('connection') || message.includes('econnrefused')) return 'DB_CONNECTION_FAILED';
    if (message.includes('insufficient credits') || message.includes('no credits')) return 'INSUFFICIENT_CREDITS';
    if (message.includes('permission') || message.includes('unauthorized')) return 'PERMISSION_DENIED';
    if (message.includes('validation')) return 'VALIDATION_FAILED';
    if (message.includes('locked') || message.includes('concurrent')) return 'RESOURCE_LOCKED';
    if (message.includes('rate limit') || message.includes('429')) return 'RATE_LIMITED';
    if (message.includes('integrity') || message.includes('constraint')) return 'DATA_INTEGRITY_ERROR';
    if (message.includes('service') && message.includes('unavailable')) return 'EXTERNAL_SERVICE_DOWN';
    
    return 'UNKNOWN';
  }

  private getCurrentStep(ctx: OrchestrationContext): 'TRIGGER' | 'FETCH' | 'VALIDATE' | 'PROCESS' | 'MUTATE' | 'CONFIRM' | 'NOTIFY' {
    const lastStep = ctx.steps[ctx.steps.length - 1];
    return (lastStep?.step as any) || 'PROCESS';
  }

  private recordExecution(
    orchestrationId: string,
    domain: string,
    automationName: string,
    status: 'success' | 'failed',
    durationMs: number,
    errorCode?: string
  ): void {
    this.executionHistory.push({
      orchestrationId,
      domain,
      automationName,
      status,
      durationMs,
      timestamp: new Date(),
      errorCode,
    });

    if (this.executionHistory.length > 1000) {
      this.executionHistory = this.executionHistory.slice(-500);
    }
  }

  /**
   * Get execution statistics for monitoring
   */
  getExecutionStats(since?: Date): {
    total: number;
    success: number;
    failed: number;
    byDomain: Record<string, { total: number; success: number; failed: number }>;
    averageDurationMs: number;
    activeAutomations: number;
  } {
    const cutoff = since || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentExecutions = this.executionHistory.filter(e => e.timestamp >= cutoff);
    
    const stats = {
      total: recentExecutions.length,
      success: recentExecutions.filter(e => e.status === 'success').length,
      failed: recentExecutions.filter(e => e.status === 'failed').length,
      byDomain: {} as Record<string, { total: number; success: number; failed: number }>,
      averageDurationMs: 0,
      activeAutomations: this.activeAutomations.size,
    };

    if (recentExecutions.length > 0) {
      stats.averageDurationMs = Math.round(
        recentExecutions.reduce((sum, e) => sum + e.durationMs, 0) / recentExecutions.length
      );
    }

    for (const exec of recentExecutions) {
      if (!stats.byDomain[exec.domain]) {
        stats.byDomain[exec.domain] = { total: 0, success: 0, failed: 0 };
      }
      stats.byDomain[exec.domain].total++;
      if (exec.status === 'success') {
        stats.byDomain[exec.domain].success++;
      } else {
        stats.byDomain[exec.domain].failed++;
      }
    }

    return stats;
  }

  /**
   * Get active automations for monitoring
   */
  getActiveAutomations(): Array<{
    orchestrationId: string;
    automationName: string;
    domain: string;
    runningForMs: number;
    workspaceId?: string;
  }> {
    const now = Date.now();
    return Array.from(this.activeAutomations.entries()).map(([id, data]) => ({
      orchestrationId: id,
      automationName: data.params.automationName,
      domain: data.params.domain,
      runningForMs: now - data.startTime.getTime(),
      workspaceId: data.params.workspaceId,
    }));
  }

  /**
   * Get recent execution history
   */
  getRecentExecutions(limit: number = 50): typeof this.executionHistory {
    return this.executionHistory.slice(-limit).reverse();
  }
}

export const automationOrchestration = AutomationOrchestrationService.getInstance();
