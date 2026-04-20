/**
 * EXECUTION PIPELINE SERVICE
 * ===========================
 * Universal 7-step enforcement for ALL operations in the system.
 * Every feature, CRUD, AI call, and subagent action must pass through this pipeline.
 * 
 * The 7 Steps:
 * 1. TRIGGER - Register operation, create execution record
 * 2. FETCH - Get permissions, requirements, rate limits
 * 3. VALIDATE - Check inputs, permissions, credits
 * 4. PROCESS - Execute the actual operation
 * 5. MUTATE - Commit database changes in transaction
 * 6. CONFIRM - Verify mutations succeeded
 * 7. NOTIFY - Dispatch notifications based on outcome
 * 
 * ORCHESTRATION ARCHITECTURE (Consolidated):
 * ==========================================
 * Three orchestration services exist with distinct purposes:
 * 
 * 1. ExecutionPipeline (THIS FILE) - General operation execution
 *    - Lightweight 7-step wrapper for any operation
 *    - Logs to executionPipelineLogs table
 *    - Integrates with tokenManager for billing
 *    - Best for: CRUD, feature actions, subagent tasks
 * 
 * 2. UniversalStepLogger - Full orchestration with approval flow
 *    - Rich step-level logging with timing and payloads
 *    - Logs to systemAuditLogs table
 *    - Support for staged payloads requiring approval
 *    - Best for: Complex orchestrations needing visibility
 * 
 * 3. AutomationOrchestration - Daemon/cron wrapper
 *    - USES UniversalStepLogger internally (facade pattern)
 *    - Adds automation-specific metadata and tracking
 *    - Best for: Scheduled tasks, background processes
 * 
 * WHEN TO USE WHICH:
 * - Simple feature/CRUD: ExecutionPipeline.execute()
 * - Complex multi-step with approval: universalStepLogger.startOrchestration()
 * - Automated daemon/cron: automationOrchestration.executeAutomation()
 */

import { db } from '../db';
import { executionPipelineLogs, systemAuditLogs, type InsertExecutionPipelineLog } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { tokenManager, TOKEN_COSTS } from './billing/tokenManager';
import { aiTokenGateway } from './billing/aiTokenGateway';
import { platformEventBus } from './platformEventBus';
// @ts-expect-error — TS migration: fix in refactoring sprint
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../lib/logger';
const log = createLogger('executionPipeline');


// ============================================================================
// TYPES
// ============================================================================

export type OperationType = 
  | 'crud' 
  | 'ai_call' 
  | 'feature_action' 
  | 'subagent_task' 
  | 'onboarding' 
  | 'automation'
  | 'inbound_opportunity'
  | 'room_lifecycle';

export type InitiatorType = 'user' | 'system' | 'ai_model' | 'cron' | 'webhook';

export type StepStatus = 'pending' | 'processing' | 'complete' | 'failed' | 'skipped';

export interface PipelineContext {
  executionId: string;
  workspaceId?: string;
  operationType: OperationType;
  operationName: string;
  initiator: string;
  initiatorType: InitiatorType;
  startedAt: Date;
  
  // Step statuses
  steps: {
    trigger: StepStatus;
    fetch: StepStatus;
    validate: StepStatus;
    process: StepStatus;
    mutate: StepStatus;
    confirm: StepStatus;
    notify: StepStatus;
  };
  
  // Results and metadata
  fetchedData?: Record<string, any>;
  validationResults?: { field: string; passed: boolean; message?: string }[];
  processResult?: any;
  mutationDetails?: { tables: string[]; recordsChanged: number };
  confirmationStatus?: 'verified' | 'mismatch';
  notificationsSent?: string[];
  
  // Notification context (for consistent tracking across workflows)
  referenceNumber?: string;
  workspaceName?: string;
  senderEmail?: string;
  senderName?: string;
  
  // AI-specific
  modelUsed?: string;
  tokensConsumed?: number;
  confidenceScore?: number;
  creditsDeducted?: number;
  
  // Escalation tracking
  escalationTier?: 'none' | 'ai_retry' | 'ai_architect' | 'human_review';
  escalationAttempts?: number;
  escalationHistory?: Array<{
    tier: string;
    attemptedAt: Date;
    result: 'success' | 'failed';
    error?: string;
    modelUsed?: string;
  }>;
  humanReviewTicketId?: string;
  
  // Error tracking with remediation
  error?: Error;
  errorCode?: string;
  remediation?: string;
  retryable?: boolean;
  failedAtStep?: number;
}

// Standardized error codes with remediation messages
export const PIPELINE_ERROR_CODES: Record<string, { remediation: string; retryable: boolean }> = {
  'TIMEOUT': {
    remediation: 'Operation exceeded time limit. Will retry automatically.',
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
    remediation: 'Workspace credits insufficient. Admin needs to add credits.',
    retryable: false,
  },
  'PERMISSION_DENIED': {
    remediation: 'Operation lacks required permissions. Check access settings.',
    retryable: false,
  },
  'VALIDATION_FAILED': {
    remediation: 'Input data validation failed. Check data format.',
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
  'NETWORK_ERROR': {
    remediation: 'Network connectivity issue. Will retry automatically.',
    retryable: true,
  },
  'UNKNOWN': {
    remediation: 'Unexpected error occurred. Check logs for details.',
    retryable: false,
  },
};

export interface EscalationConfig {
  enabled: boolean;
  maxRetries?: number;
  retryHandler?: (ctx: PipelineContext, fetchedData: Record<string, any>, previousError: Error, tier: string) => Promise<any>;
  escalationChain?: Array<'ai_retry' | 'ai_architect' | 'human_review'>;
  humanReviewHandler?: (ctx: PipelineContext, error: Error, attempts: PipelineContext['escalationHistory']) => Promise<string>;
}

export interface PipelineOptions {
  workspaceId?: string;
  operationType: OperationType;
  operationName: string;
  initiator: string;
  initiatorType?: InitiatorType;
  payload?: Record<string, any>;
  
  // Optional overrides
  skipCreditCheck?: boolean;
  skipNotifications?: boolean;
  
  escalation?: EscalationConfig;
}

export interface StepHandlers<T = any> {
  fetch?: (ctx: PipelineContext) => Promise<Record<string, any>>;
  validate?: (ctx: PipelineContext, fetchedData: Record<string, any>) => Promise<{ valid: boolean; errors?: string[] }>;
  process: (ctx: PipelineContext, fetchedData: Record<string, any>) => Promise<T>;
  mutate?: (ctx: PipelineContext, processResult: T) => Promise<{ tables: string[]; recordsChanged: number }>;
  confirm?: (ctx: PipelineContext, mutationDetails: { tables: string[]; recordsChanged: number }) => Promise<boolean>;
  notify?: (ctx: PipelineContext, result: T) => Promise<string[]>;
}

// ============================================================================
// EXECUTION PIPELINE CLASS
// ============================================================================

export class ExecutionPipeline {
  private static instance: ExecutionPipeline;
  
  private constructor() {}
  
  static getInstance(): ExecutionPipeline {
    if (!ExecutionPipeline.instance) {
      ExecutionPipeline.instance = new ExecutionPipeline();
    }
    return ExecutionPipeline.instance;
  }
  
  /**
   * Execute an operation through the 7-step pipeline
   */
  async execute<T>(
    options: PipelineOptions,
    handlers: StepHandlers<T>
  ): Promise<{ success: boolean; result?: T; error?: Error; context: PipelineContext }> {
    const executionId = `exec_${uuidv4()}`;
    const startedAt = new Date();
    
    // Initialize context
    const ctx: PipelineContext = {
      executionId,
      workspaceId: options.workspaceId,
      operationType: options.operationType,
      operationName: options.operationName,
      initiator: options.initiator,
      initiatorType: options.initiatorType || 'user',
      startedAt,
      steps: {
        trigger: 'pending',
        fetch: 'pending',
        validate: 'pending',
        process: 'pending',
        mutate: 'pending',
        confirm: 'pending',
        notify: 'pending',
      },
    };
    
    try {
      // =====================================================================
      // STEP 1: TRIGGER
      // =====================================================================
      ctx.steps.trigger = 'processing';
      await this.createExecutionLog(ctx, options.payload);
      ctx.steps.trigger = 'complete';
      
      // =====================================================================
      // STEP 2: FETCH
      // =====================================================================
      ctx.steps.fetch = 'processing';
      let fetchedData: Record<string, any> = {};
      
      if (handlers.fetch) {
        fetchedData = await handlers.fetch(ctx);
      }
      
      // Default fetch: get credit requirements if applicable
      if (options.workspaceId && !options.skipCreditCheck) {
        const creditCost = this.getCreditCost(options.operationType, options.operationName);
        fetchedData.creditCost = creditCost;
        
        if (creditCost > 0) {
          // getBalance returns a number directly, not an object
          const balance = await tokenManager.getBalance(options.workspaceId);
          fetchedData.creditBalance = balance || 0;
        }
      }
      
      ctx.fetchedData = fetchedData;
      ctx.steps.fetch = 'complete';
      await this.updateExecutionLog(ctx, 'step2FetchStatus', 'complete');
      
      // =====================================================================
      // STEP 3: VALIDATE
      // =====================================================================
      ctx.steps.validate = 'processing';
      
      // Default validation: check credits
      const validationResults: { field: string; passed: boolean; message?: string }[] = [];
      
      if (fetchedData.creditCost && fetchedData.creditCost > 0) {
        const hasCredits = (fetchedData.creditBalance || 0) >= fetchedData.creditCost;
        validationResults.push({
          field: 'credits',
          passed: hasCredits,
          message: hasCredits ? undefined : `Insufficient credits. Required: ${fetchedData.creditCost}, Available: ${fetchedData.creditBalance}`
        });
      }
      
      // Custom validation
      if (handlers.validate) {
        const customValidation = await handlers.validate(ctx, fetchedData);
        if (!customValidation.valid) {
          customValidation.errors?.forEach(err => {
            validationResults.push({ field: 'custom', passed: false, message: err });
          });
        }
      }
      
      ctx.validationResults = validationResults;
      
      const validationFailed = validationResults.some(r => !r.passed);
      if (validationFailed) {
        ctx.steps.validate = 'failed';
        ctx.failedAtStep = 3;
        const errorMessage = validationResults
          .filter(r => !r.passed)
          .map(r => r.message)
          .join('; ');
        throw new Error(`Validation failed: ${errorMessage}`);
      }
      
      ctx.steps.validate = 'complete';
      await this.updateExecutionLog(ctx, 'step3ValidateStatus', 'complete', { validationResults });
      
      // =====================================================================
      // STEP 4: PROCESS (with escalation chain on failure)
      // =====================================================================
      ctx.steps.process = 'processing';
      ctx.escalationTier = 'none';
      ctx.escalationAttempts = 0;
      ctx.escalationHistory = [];
      const processStartTime = Date.now();
      
      let processResult: T;
      const escalation = options.escalation;
      const escalationChain = escalation?.escalationChain || ['ai_retry', 'ai_architect', 'human_review'];
      
      try {
        processResult = await handlers.process(ctx, fetchedData);
      } catch (processError: any) {
        if (!escalation?.enabled) {
          throw processError;
        }

        log.warn(`[ExecutionPipeline] ${options.operationName} PROCESS failed, starting escalation chain: ${processError.message}`);
        
        let lastError = processError;
        let resolved = false;
        
        for (const tier of escalationChain) {
          if (tier === 'human_review') {
            ctx.escalationTier = 'human_review';
            ctx.escalationAttempts = (ctx.escalationAttempts || 0) + 1;
            
            let ticketId = `REVIEW-${ctx.executionId.slice(-8).toUpperCase()}`;
            if (escalation.humanReviewHandler) {
              try {
                ticketId = await escalation.humanReviewHandler(ctx, lastError, ctx.escalationHistory || []);
              } catch (hrError: any) {
                log.error('[ExecutionPipeline] Human review handler failed:', hrError.message);
              }
            }
            
            ctx.humanReviewTicketId = ticketId;
            ctx.escalationHistory?.push({
              tier: 'human_review',
              attemptedAt: new Date(),
              result: 'failed',
              error: `Escalated to human review. Ticket: ${ticketId}`,
            });
            
            await this.updateExecutionLog(ctx, 'step4ProcessStatus', 'escalated_to_human', {
              escalationTier: 'human_review',
              humanReviewTicketId: ticketId,
              escalationHistory: ctx.escalationHistory,
            });
            
            log.error(`[ExecutionPipeline] ${options.operationName} escalated to HUMAN REVIEW. Ticket: ${ticketId}`);
            
            throw new Error(`Operation requires human review. Ticket: ${ticketId}. Original error: ${lastError.message}`);
          }
          
          if (!escalation.retryHandler) continue;
          
          ctx.escalationTier = tier;
          ctx.escalationAttempts = (ctx.escalationAttempts || 0) + 1;
          
          log.info(`[ExecutionPipeline] ${options.operationName} escalating to tier: ${tier} (attempt ${ctx.escalationAttempts})`);
          
          try {
            processResult = await escalation.retryHandler(ctx, fetchedData, lastError, tier);
            
            ctx.escalationHistory?.push({
              tier,
              attemptedAt: new Date(),
              result: 'success',
              modelUsed: ctx.modelUsed,
            });
            
            resolved = true;
            log.info(`[ExecutionPipeline] ${options.operationName} resolved at escalation tier: ${tier}`);
            break;
          } catch (retryError: any) {
            lastError = retryError;
            ctx.escalationHistory?.push({
              tier,
              attemptedAt: new Date(),
              result: 'failed',
              error: retryError.message,
              modelUsed: ctx.modelUsed,
            });
            log.warn(`[ExecutionPipeline] ${options.operationName} escalation tier ${tier} failed: ${retryError.message}`);
          }
        }
        
        if (!resolved) {
          throw lastError;
        }
      }
      
      const processingTimeMs = Date.now() - processStartTime;
      ctx.processResult = processResult!;
      ctx.steps.process = 'complete';
      
      await this.updateExecutionLog(ctx, 'step4ProcessStatus', 'complete', { 
        processingTimeMs,
        escalationTier: ctx.escalationTier,
        escalationAttempts: ctx.escalationAttempts,
        escalationHistory: ctx.escalationHistory,
      });
      
      // =====================================================================
      // STEP 5: MUTATE
      // =====================================================================
      ctx.steps.mutate = 'processing';
      
      let mutationDetails = { tables: [] as string[], recordsChanged: 0 };
      
      if (handlers.mutate) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        mutationDetails = await handlers.mutate(ctx, processResult);
      }
      
      // Deduct credits if applicable
      if (fetchedData.creditCost && fetchedData.creditCost > 0 && options.workspaceId) {
        await aiTokenGateway.finalizeBilling(
          options.workspaceId,
          options.initiator,
          options.operationName,
          fetchedData.creditCost,
          { executionId, operationType: options.operationType }
        );
        ctx.creditsDeducted = fetchedData.creditCost;
        mutationDetails.tables.push('workspace_credits');
        mutationDetails.recordsChanged++;
      }
      
      ctx.mutationDetails = mutationDetails;
      ctx.steps.mutate = 'complete';
      
      await this.updateExecutionLog(ctx, 'step5MutateStatus', 'complete', {
        tablesAffected: mutationDetails.tables,
        recordsChanged: mutationDetails.recordsChanged,
        creditsDeducted: ctx.creditsDeducted
      });
      
      // =====================================================================
      // STEP 6: CONFIRM
      // =====================================================================
      ctx.steps.confirm = 'processing';
      
      let confirmationPassed = true;
      if (handlers.confirm) {
        confirmationPassed = await handlers.confirm(ctx, mutationDetails);
      }
      
      ctx.confirmationStatus = confirmationPassed ? 'verified' : 'mismatch';
      ctx.steps.confirm = confirmationPassed ? 'complete' : 'failed';
      
      if (!confirmationPassed) {
        ctx.failedAtStep = 6;
        throw new Error('Confirmation failed: Mutation verification returned mismatch');
      }
      
      await this.updateExecutionLog(ctx, 'step6ConfirmStatus', 'complete');
      
      // =====================================================================
      // STEP 7: NOTIFY
      // =====================================================================
      if (!options.skipNotifications) {
        ctx.steps.notify = 'processing';
        
        let notifications: string[] = [];
        if (handlers.notify) {
          // @ts-expect-error — TS migration: fix in refactoring sprint
          notifications = await handlers.notify(ctx, processResult);
        }
        
        ctx.notificationsSent = notifications;
        ctx.steps.notify = 'complete';
        
        await this.updateExecutionLog(ctx, 'step7NotifyStatus', 'complete', {
          notificationsSent: notifications
        });
      } else {
        ctx.steps.notify = 'skipped';
      }
      
      // =====================================================================
      // FINALIZE
      // =====================================================================
      const totalExecutionTimeMs = Date.now() - startedAt.getTime();
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await this.finalizeExecutionLog(ctx, 'success', totalExecutionTimeMs, processResult);
      
      // @ts-expect-error — TS migration: fix in refactoring sprint
      return { success: true, result: processResult, context: ctx };
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ctx.error = err;
      
      // Mark current step as failed
      const currentStep = Object.entries(ctx.steps).find(([_, status]) => status === 'processing');
      if (currentStep) {
        (ctx as any).steps[currentStep[0]] = 'failed';
        ctx.failedAtStep = ['trigger', 'fetch', 'validate', 'process', 'mutate', 'confirm', 'notify'].indexOf(currentStep[0]) + 1;
      }
      
      const totalExecutionTimeMs = Date.now() - startedAt.getTime();
      await this.finalizeExecutionLog(ctx, `failed_at_step_${ctx.failedAtStep}`, totalExecutionTimeMs, undefined, err);
      
      log.error(`[ExecutionPipeline] ${options.operationName} failed at step ${ctx.failedAtStep}:`, err.message);
      
      return { success: false, error: err, context: ctx };
    }
  }
  
  /**
   * Get credit cost for an operation
   */
  private getCreditCost(operationType: OperationType, operationName: string): number {
    // Check if operation has a defined credit cost
    const cost = TOKEN_COSTS[operationName as keyof typeof TOKEN_COSTS];
    if (cost !== undefined) {
      return cost;
    }
    
    // Default costs by operation type
    const defaultCosts: Record<OperationType, number> = {
      'crud': 0,
      'ai_call': 5,
      'feature_action': 0,
      'subagent_task': 10,
      'onboarding': 0,
      'automation': 5,
      'inbound_opportunity': 15, // Full email → shift workflow cost
      'room_lifecycle': 0,
    };
    
    return defaultCosts[operationType] || 0;
  }
  
  /**
   * Create initial execution log
   */
  private async createExecutionLog(ctx: PipelineContext, payload?: Record<string, any>): Promise<void> {
    try {
      await db.insert(executionPipelineLogs).values({
        executionId: ctx.executionId,
        workspaceId: ctx.workspaceId,
        operationType: ctx.operationType,
        operationName: ctx.operationName,
        initiator: ctx.initiator,
        initiatorType: ctx.initiatorType,
        step1TriggerStatus: 'complete',
        initialPayload: payload,
        finalStatus: 'initiated',
      });
    } catch (error) {
      log.error('[ExecutionPipeline] Failed to create execution log:', error);
    }
  }
  
  /**
   * Update execution log for a specific step
   */
  private async updateExecutionLog(
    ctx: PipelineContext, 
    stepField: string, 
    status: string,
    additionalData?: Record<string, any>
  ): Promise<void> {
    try {
      const updateData: Record<string, any> = {
        [stepField]: status,
      };
      
      if (additionalData) {
        Object.assign(updateData, additionalData);
      }
      
      await db.update(executionPipelineLogs)
        .set(updateData)
        .where(eq(executionPipelineLogs.executionId, ctx.executionId));
    } catch (error) {
      log.error('[ExecutionPipeline] Failed to update execution log:', error);
    }
  }
  
  /**
   * Finalize execution log with final status
   */
  private async finalizeExecutionLog(
    ctx: PipelineContext,
    finalStatus: string,
    totalExecutionTimeMs: number,
    result?: any,
    error?: Error
  ): Promise<void> {
    try {
      await db.update(executionPipelineLogs)
        .set({
          finalStatus,
          totalExecutionTimeMs,
          failedAtStep: ctx.failedAtStep,
          errorMessage: error?.message,
          errorStack: error?.stack,
          finalResult: result ? JSON.parse(JSON.stringify(result)) : undefined,
          modelUsed: ctx.modelUsed,
          tokensConsumed: typeof ctx.tokensConsumed === 'number' ? ctx.tokensConsumed : (parseInt(String(ctx.tokensConsumed), 10) || 0),
          confidenceScore: ctx.confidenceScore?.toString(),
          creditsDeducted: typeof ctx.creditsDeducted === 'number' ? ctx.creditsDeducted : (parseInt(String(ctx.creditsDeducted), 10) || 0),
          completedAt: new Date(),
        })
        .where(eq(executionPipelineLogs.executionId, ctx.executionId));
    } catch (error) {
      log.error('[ExecutionPipeline] Failed to finalize execution log:', error);
    }
  }
  
  /**
   * Get execution log by ID
   */
  async getExecutionLog(executionId: string) {
    const [log] = await db.select()
      .from(executionPipelineLogs)
      .where(eq(executionPipelineLogs.executionId, executionId))
      .limit(1);
    return log;
  }
  
  /**
   * Get recent executions for a workspace
   */
  async getRecentExecutions(workspaceId: string, limit = 50) {
    return db.select()
      .from(executionPipelineLogs)
      .where(eq(executionPipelineLogs.workspaceId, workspaceId))
      .orderBy(executionPipelineLogs.startedAt)
      .limit(limit);
  }
  
  /**
   * Get execution statistics
   */
  async getExecutionStats(workspaceId?: string) {
    const query = workspaceId 
      ? db.select().from(executionPipelineLogs).where(eq(executionPipelineLogs.workspaceId, workspaceId))
      : db.select().from(executionPipelineLogs);
    
    const logs = await query;
    
    const total = logs.length;
    const successful = logs.filter(l => l.finalStatus === 'success').length;
    const failed = logs.filter(l => l.finalStatus?.startsWith('failed')).length;
    const avgTime = logs.length > 0 
      ? logs.reduce((sum, l) => sum + (l.totalExecutionTimeMs || 0), 0) / logs.length 
      : 0;
    
    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      averageExecutionTimeMs: Math.round(avgTime),
    };
  }
}

// Export singleton instance
export const executionPipeline = ExecutionPipeline.getInstance();

export async function createHumanReviewTicket(
  ctx: PipelineContext,
  error: Error,
  escalationHistory: PipelineContext['escalationHistory']
): Promise<string> {
  const ticketId = `REVIEW-${Date.now().toString(36).toUpperCase()}-${ctx.executionId.slice(-6)}`;
  
  try {
    await db.insert(systemAuditLogs).values({
      workspaceId: ctx.workspaceId,
      action: 'escalation_to_human',
      entityType: 'escalation',
      entityId: ctx.executionId,
      metadata: {
        logType: 'human_review_required',
        severity: 'critical',
        actor: 'execution_pipeline',
        targetType: ctx.operationType,
        targetId: ctx.executionId,
        status: 'pending',
        ticketId,
        operationName: ctx.operationName,
        operationType: ctx.operationType,
        originalError: error.message,
        escalationHistory: escalationHistory?.map(h => ({
          tier: h.tier,
          result: h.result,
          error: h.error,
          modelUsed: h.modelUsed,
          attemptedAt: h.attemptedAt.toISOString(),
        })),
        failedAtStep: ctx.failedAtStep,
        initiator: ctx.initiator,
        resolvedBy: null,
        resolvedAt: null,
      },
    });
    
    platformEventBus.publish({
      type: 'human_review_required',
      category: 'automation',
      title: `Human Review Required — ${ctx.operationName}`,
      description: `Execution pipeline exhausted all retries for '${ctx.operationName}' after ${ctx.escalationAttempts} attempts. Human intervention required.`,
      workspaceId: ctx.workspaceId,
      metadata: { ticketId, executionId: ctx.executionId, operationName: ctx.operationName, error: error.message, escalationAttempts: ctx.escalationAttempts, severity: 'critical' },
    }).catch((dbError: any) => log.error('[ExecutionPipeline] Failed to publish human_review_required:', dbError));
  } catch (dbError) {
    log.error('[ExecutionPipeline] Failed to create human review ticket:', dbError);
  }
  
  return ticketId;
}
