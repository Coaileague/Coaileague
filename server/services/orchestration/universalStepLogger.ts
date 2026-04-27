/**
 * UNIVERSAL ORCHESTRATION STEP LOGGER
 * ====================================
 * Fortune 500-grade step-by-step logging for ALL platform automations.
 * 
 * Enforces the 7-step pattern:
 * 1. TRIGGER   → Cron job, button click, API call, event
 * 2. FETCH     → Query database for required data
 * 3. VALIDATE  → Check data exists, guards available, permissions OK
 * 4. PROCESS   → AI analysis, business logic, transformations
 * 5. MUTATE    → Write changes to database (STAGED until approved)
 * 6. CONFIRM   → Return success/update UI (after approval)
 * 7. NOTIFY    → Send alerts to stakeholders
 * 
 * Features:
 * - Step-level database logging with timing
 * - Subscription/credits validation at each step
 * - Staged payload holding until user approval
 * - Automatic upsell triggers when features unavailable
 * - Conflict detection between competing services
 * - Never fails silently - every step is tracked
 */

import { db } from '../../db';
import { systemAuditLogs, workspaces } from '@shared/schema';
import { eq, and, sql, desc, gt } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import { idempotencyService } from '../ai-brain/idempotencyService';
import { createLogger } from '../../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../billing/billingConstants';
const log = createLogger('universalStepLogger');


// Import execution tracker dynamically to avoid circular deps
let executionTracker: any = null;
const getExecutionTracker = async () => {
  if (!executionTracker) {
    const mod = await import('./automationExecutionTracker');
    executionTracker = mod.automationExecutionTracker;
  }
  return executionTracker;
};

// ============================================================================
// TYPES
// ============================================================================

export type OrchestrationStep = 
  | 'TRIGGER'
  | 'FETCH'
  | 'VALIDATE'
  | 'PROCESS'
  | 'MUTATE'
  | 'CONFIRM'
  | 'NOTIFY';

export type StepStatus = 'started' | 'completed' | 'failed' | 'skipped' | 'blocked';

export type OrchestrationDomain = 
  | 'scheduling'
  | 'payroll'
  | 'invoicing'
  | 'quickbooks'
  | 'onboarding'
  | 'compliance'
  | 'time_tracking'
  | 'employee_management'
  | 'client_management'
  | 'analytics'
  | 'hris_sync'
  | 'automation'
  | 'trinity_ai'
  | 'trinity_cognitive'
  | 'general';

export type FeatureTier = 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic';

export interface StepLogEntry {
  step: OrchestrationStep;
  status: StepStatus;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  inputPayload?: Record<string, any>;
  outputPayload?: Record<string, any>;
  error?: string;
  errorCode?: string;
  metadata?: Record<string, any>;
}

export interface OrchestrationContext {
  orchestrationId: string;
  domain: OrchestrationDomain;
  actionName: string;
  actionId?: string;
  workspaceId: string;
  userId?: string;
  triggeredBy: 'user' | 'cron' | 'event' | 'api' | 'ai_brain' | 'webhook';
  triggerDetails?: Record<string, any>;
  requiredFeature?: string;
  requiredTier?: FeatureTier;
  requiresApproval?: boolean;
  externalSystem?: string;
  parentOrchestrationId?: string;
  steps: StepLogEntry[];
  status: 'in_progress' | 'completed' | 'failed' | 'pending_approval' | 'rejected';
  stagedPayload?: Record<string, any>;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StartOrchestrationParams {
  domain: OrchestrationDomain;
  actionName: string;
  actionId?: string;
  workspaceId: string;
  userId?: string;
  triggeredBy: OrchestrationContext['triggeredBy'];
  triggerDetails?: Record<string, any>;
  requiredFeature?: string;
  requiredTier?: FeatureTier;
  requiresApproval?: boolean;
  externalSystem?: string;
  parentOrchestrationId?: string;
}

export interface StepResult {
  success: boolean;
  data?: any;
  error?: string;
  errorCode?: string;
  blockedReason?: string;
  upsellRequired?: boolean;
  upsellFeature?: string;
}

export interface SubscriptionCheckResult {
  allowed: boolean;
  currentTier: FeatureTier;
  requiredTier: FeatureTier;
  creditsRemaining?: number;
  creditsRequired?: number;
  upsellRequired: boolean;
  upsellMessage?: string;
}

// ============================================================================
// ORCHESTRATION STEP ORDER
// ============================================================================

const STEP_ORDER: OrchestrationStep[] = ['TRIGGER', 'FETCH', 'VALIDATE', 'PROCESS', 'MUTATE', 'CONFIRM', 'NOTIFY'];

const STEP_DESCRIPTIONS: Record<OrchestrationStep, string> = {
  TRIGGER: 'Automation triggered',
  FETCH: 'Fetching required data',
  VALIDATE: 'Validating data and permissions',
  PROCESS: 'Processing with AI/business logic',
  MUTATE: 'Writing changes to database',
  CONFIRM: 'Confirming changes to UI',
  NOTIFY: 'Sending notifications to stakeholders',
};

// ============================================================================
// UNIVERSAL STEP LOGGER SERVICE
// ============================================================================

class UniversalStepLogger {
  private orchestrations: Map<string, OrchestrationContext> = new Map();
  private activeLocks: Map<string, string> = new Map(); // resource -> orchestrationId
  private executionTrackerIds: Map<string, string> = new Map();
  private heldLockKeys: Map<string, Set<string>> = new Map(); // orchestrationId -> Set<lockKey>

  /**
   * Acquire a resource lock using in-memory tracking with IdempotencyService validation
   * Note: For true distributed locking across multiple instances, a Redis-backed lock would be needed.
   * This implementation provides single-instance safety with idempotency validation.
   */
  private acquireLock(
    resource: string,
    orchestrationId: string,
    workspaceId: string
  ): boolean {
    const lockKey = `orchestration_lock:${workspaceId}:${resource}`;
    const existingLock = this.activeLocks.get(lockKey);
    
    // Check if already held by this orchestration
    if (existingLock === orchestrationId) {
      return true;
    }
    
    // Check if held by another orchestration
    if (existingLock) {
      return false;
    }
    
    // Use idempotency service to check if any process is working on this resource
    const idempotencyCheck = idempotencyService.checkAndMark(lockKey, {
      category: 'execution',
      workspaceId,
      ttlMs: 300000, // 5 min lock TTL
    });
    
    // If key exists and wasn't created by us, someone else holds it
    if (!idempotencyCheck.isNew) {
      return false;
    }
    
    // We got the lock - store it locally
    this.activeLocks.set(lockKey, orchestrationId);
    
    // Track which locks this orchestration holds for cleanup
    if (!this.heldLockKeys.has(orchestrationId)) {
      this.heldLockKeys.set(orchestrationId, new Set());
    }
    this.heldLockKeys.get(orchestrationId)!.add(lockKey);
    
    return true;
  }

  /**
   * Release all locks held by an orchestration
   */
  private releaseAllLocks(orchestrationId: string): void {
    const heldKeys = this.heldLockKeys.get(orchestrationId);
    if (heldKeys) {
      for (const lockKey of heldKeys) {
        if (this.activeLocks.get(lockKey) === orchestrationId) {
          this.activeLocks.delete(lockKey);
          // Mark completed in idempotency service to free the key
          (idempotencyService as any).markCompleted(lockKey, 'released');
        }
      }
      this.heldLockKeys.delete(orchestrationId);
    }
  }

  /**
   * Persist orchestration state to audit logs for durability
   * Uses a single "orchestration_state" log entry per orchestration that gets updated
   */
  private async persistOrchestrationState(context: OrchestrationContext): Promise<void> {
    try {
      // Skip DB persistence for high-frequency ephemeral daemon orchestrations.
      // These restart fresh on every tick and never need rehydration — persisting them
      // is what caused the 279k-record flood in system_audit_logs.
      const EPHEMERAL_DAEMON_ACTIONS = new Set([
        'autonomous-scheduling-daemon',
        'shift-monitoring-cycle',
        'shift_monitoring_cycle',
        'billing-cycle-daemon',
        'gps-inactivity-monitor',
        'shift-escalation-scanner',
        'shift-reminders',
        'payroll-auto-close',
        'lone-worker-safety',
        'chat-auto-close',
      ]);
      if (EPHEMERAL_DAEMON_ACTIONS.has(context.actionName)) {
        return;
      }

      // Only persist terminal states to avoid O(steps) writes per orchestration.
      // In-memory tracking handles intermediate state; DB only needs the final outcome.
      if (context.status !== 'completed' && context.status !== 'failed') {
        return;
      }

      const trackerId = this.executionTrackerIds.get(context.orchestrationId);
      
      // Store current state as structured metadata
      const stateMetadata = {
        orchestrationId: context.orchestrationId,
        executionTrackerId: trackerId,
        domain: context.domain,
        actionName: context.actionName,
        actionId: context.actionId,
        status: context.status,
        currentStep: context.steps[context.steps.length - 1]?.step || 'TRIGGER',
        stepCount: context.steps.length,
        completedSteps: context.steps.filter(s => s.status === 'completed').length,
        triggeredBy: context.triggeredBy,
        requiredTier: context.requiredTier,
        externalSystem: context.externalSystem,
        hasStagedPayload: !!context.stagedPayload,
        createdAt: context.createdAt.toISOString(),
        updatedAt: new Date().toISOString(),
        ttlHours: 24, // Auto-expire state after 24 hours
      };

      // Use platform workspace as fallback for system-level daemons that run without a tenant workspaceId
      await db.insert(systemAuditLogs).values({
        workspaceId: context.workspaceId || PLATFORM_WORKSPACE_ID,
        userId: context.userId || null,
        action: 'orchestration_state',
        entityType: context.domain || 'orchestration',
        entityId: context.orchestrationId,
        metadata: stateMetadata,
      });
    } catch (error) {
      log.warn('[UniversalStepLogger] Failed to persist state:', error);
    }
  }

  /**
   * Rehydrate orchestration state from audit logs on startup
   * Rebuilds in-memory maps from persisted state entries
   */
  async rehydrateFromLogs(): Promise<{ restored: number; expired: number }> {
    try {
      // NOTE: audit_logs is immutable (has a trigger preventing UPDATEs for compliance).
      // We cannot mark orphaned in-progress records as timed_out via UPDATE.
      // Instead, we apply a strict recency filter: only consider records created in the last
      // 30 seconds (after this server process started). Records older than that are pre-restart
      // orphans and are skipped entirely — preventing the 279k-record rehydration flood.
      const serverStartTime = new Date(Date.now() - 30 * 1000); // 30s window

      // Look at records created after the server started (not orphans from previous runs)
      const stateEntries = await db
        .select()
        .from(systemAuditLogs)
        .where(
          and(
            eq(systemAuditLogs.action, 'orchestration_state'),
            gt(systemAuditLogs.createdAt, serverStartTime)
          )
        );

      let restored = 0;
      let expired = 0;

      for (const entry of stateEntries) {
        const meta = entry.metadata as Record<string, any>;
        if (!meta?.orchestrationId) continue;

        if (this.orchestrations.has(meta.orchestrationId)) continue;

        if (meta.status === 'completed' || meta.status === 'failed' || meta.status === 'timed_out') continue;

        const createdAt = new Date(meta.createdAt);
        const ttlMs = (meta.ttlHours || 24) * 60 * 60 * 1000;
        if (Date.now() - createdAt.getTime() > ttlMs) {
          expired++;
          continue;
        }

        if (meta.executionTrackerId) {
          this.executionTrackerIds.set(meta.orchestrationId, meta.executionTrackerId);
        }

        restored++;
      }

      if (restored > 0 || expired > 0) {
        log.info(`[UniversalStepLogger] Rehydration complete: ${restored} tracked, ${expired} expired`);
      }

      return { restored, expired };
    } catch (error) {
      log.warn('[UniversalStepLogger] Failed to rehydrate:', error);
      return { restored: 0, expired: 0 };
    }
  }

  /**
   * Mark an orchestration as expired (timed out)
   */
  private async markOrchestrationExpired(orchestrationId: string, workspaceId: string): Promise<void> {
    try {
      // Update execution tracker if we have the ID
      const trackerId = this.executionTrackerIds.get(orchestrationId);
      if (trackerId) {
        const tracker = await getExecutionTracker();
        if (tracker) {
          await tracker.failExecution(trackerId, {
            failureReason: 'Orchestration expired (timeout)',
            failureCode: 'TIMEOUT',
          });
        }
        this.executionTrackerIds.delete(orchestrationId);
      }

      // Log expiration
      await db.insert(systemAuditLogs).values({
        entityType: 'orchestration',
        action: 'orchestration_timeout',
        metadata: { reason: 'TTL exceeded after restart', logType: 'orchestration_expired', severity: 'warning', actor: 'system', targetType: 'orchestration', targetId: orchestrationId, status: 'failure' },
      });
    } catch (error) {
      log.warn('[UniversalStepLogger] Failed to mark expired:', error);
    }
  }

  /**
   * Start a new orchestration with the 7-step pattern
   */
  async startOrchestration(params: StartOrchestrationParams): Promise<OrchestrationContext> {
    const orchestrationId = `orch-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    
    // Check for idempotency - prevent duplicate orchestrations
    const idempotencyKey = idempotencyService.generateKey({
      category: 'execution',
      actionId: params.actionName,
      workspaceId: params.workspaceId,
      userId: params.userId,
    });
    
    const idempotencyCheck = idempotencyService.checkAndMark(idempotencyKey, {
      category: 'execution',
      workspaceId: params.workspaceId,
      userId: params.userId,
    });
    
    if (!idempotencyCheck.isNew) {
      log.info(`[UniversalStepLogger] Duplicate orchestration blocked: ${params.actionName}`);
      throw new Error('DUPLICATE_ORCHESTRATION: This action is already in progress');
    }

    // Also register with AutomationExecutionTracker for unified tracking
    let executionTrackerId: string | undefined;
    try {
      const tracker = await getExecutionTracker();
      if (tracker) {
        executionTrackerId = await tracker.createExecution({
          workspaceId: params.workspaceId || PLATFORM_WORKSPACE_ID,
          actionType: params.domain,
          actionName: params.actionName,
          actionId: params.actionId,
          triggeredBy: params.userId || 'system',
          triggerSource: params.triggeredBy,
          externalSystem: params.externalSystem,
          requiresVerification: params.requiresApproval,
        });
        // Mark execution as started so processingTimeMs can be auto-calculated on completion
        await tracker.startExecution(executionTrackerId);
      }
    } catch (error) {
      log.warn('[UniversalStepLogger] Failed to register with execution tracker:', error);
    }

    const context: OrchestrationContext = {
      orchestrationId,
      domain: params.domain,
      actionName: params.actionName,
      actionId: params.actionId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      triggeredBy: params.triggeredBy,
      triggerDetails: params.triggerDetails,
      requiredFeature: params.requiredFeature,
      requiredTier: params.requiredTier,
      requiresApproval: params.requiresApproval,
      externalSystem: params.externalSystem,
      parentOrchestrationId: params.parentOrchestrationId,
      steps: [],
      status: 'in_progress',
      idempotencyKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.orchestrations.set(orchestrationId, context);
    
    // Track execution tracker ID for later correlation
    if (executionTrackerId) {
      this.executionTrackerIds.set(orchestrationId, executionTrackerId);
    }
    
    // Log to audit system (uses existing systemAuditLogs infrastructure)
    await this.logToDatabase(context, 'orchestration_started', {
      domain: params.domain,
      actionName: params.actionName,
      triggeredBy: params.triggeredBy,
      executionTrackerId,
    });
    
    // Persist state for durability
    await this.persistOrchestrationState(context);
    
    log.info(`[UniversalStepLogger] Started orchestration ${orchestrationId}: ${params.domain}/${params.actionName}`);
    
    // Publish so Trinity and monitoring subscribers can track orchestration lifecycle.
    // Using 'orchestration_lifecycle' (not 'automation_executed') so this internal
    // telemetry is blocked by SYSTEM_INTERNAL_EVENT_TYPES and never reaches What's New.
    platformEventBus.publish({
      type: 'orchestration_lifecycle',
      category: 'automation',
      title: `Orchestration Started: ${params.actionName}`,
      description: `${params.domain}/${params.actionName} orchestration initiated`,
      workspaceId: params.workspaceId,
      metadata: { orchestrationId, domain: params.domain, actionName: params.actionName, triggeredBy: params.triggeredBy, lifecycle: 'started' },
    }).catch(() => null);
    
    return context;
  }

  /**
   * Execute a step with full logging and validation
   */
  async executeStep<T>(
    orchestrationId: string,
    step: OrchestrationStep,
    executor: () => Promise<StepResult>,
    options?: {
      inputPayload?: Record<string, any>;
      validateSubscription?: boolean;
      acquireLock?: string;
      skipOnPreviousFailure?: boolean;
    }
  ): Promise<StepResult> {
    const context = this.orchestrations.get(orchestrationId);
    if (!context) {
      return { success: false, error: 'Orchestration not found', errorCode: 'ORCHESTRATION_NOT_FOUND' };
    }

    // Check step order
    const lastCompletedStep = this.getLastCompletedStep(context);
    if (lastCompletedStep && !this.isValidNextStep(lastCompletedStep, step)) {
      return { 
        success: false, 
        error: `Invalid step order: ${step} cannot follow ${lastCompletedStep}`,
        errorCode: 'INVALID_STEP_ORDER'
      };
    }

    // Check if previous step failed and we should skip
    if (options?.skipOnPreviousFailure && this.hasFailedStep(context)) {
      const stepEntry: StepLogEntry = {
        step,
        status: 'skipped',
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 0,
        metadata: { reason: 'Previous step failed' },
      };
      context.steps.push(stepEntry);
      return { success: false, error: 'Skipped due to previous failure', errorCode: 'PREVIOUS_STEP_FAILED' };
    }

    // Subscription validation for VALIDATE step
    if (options?.validateSubscription && step === 'VALIDATE' && context.requiredTier) {
      const subscriptionCheck = await this.checkSubscription(context.workspaceId, context.requiredTier, context.requiredFeature);
      if (!subscriptionCheck.allowed) {
        const stepEntry: StepLogEntry = {
          step,
          status: 'blocked',
          startedAt: new Date(),
          completedAt: new Date(),
          durationMs: 0,
          error: subscriptionCheck.upsellMessage || 'Feature not available on current plan',
          metadata: { 
            subscriptionCheck,
            upsellRequired: true,
            upsellFeature: context.requiredFeature,
          },
        };
        context.steps.push(stepEntry);
        
        // Trigger upsell
        await this.triggerUpsell(context, subscriptionCheck);
        
        return { 
          success: false, 
          error: subscriptionCheck.upsellMessage,
          errorCode: 'SUBSCRIPTION_REQUIRED',
          upsellRequired: true,
          upsellFeature: context.requiredFeature,
        };
      }
    }

    // Acquire lock for MUTATE step if specified (uses IdempotencyService)
    if (options?.acquireLock && step === 'MUTATE') {
      const lockAcquired = this.acquireLock(options.acquireLock, orchestrationId, context.workspaceId);
      if (!lockAcquired) {
        const stepEntry: StepLogEntry = {
          step,
          status: 'blocked',
          startedAt: new Date(),
          completedAt: new Date(),
          durationMs: 0,
          error: `Resource locked by another orchestration`,
          metadata: { resource: options.acquireLock },
        };
        context.steps.push(stepEntry);
        return { 
          success: false, 
          error: 'Resource locked by another operation',
          errorCode: 'RESOURCE_LOCKED',
          blockedReason: `Resource ${options.acquireLock} is currently being modified`,
        };
      }
    }

    // Start step
    const stepEntry: StepLogEntry = {
      step,
      status: 'started',
      startedAt: new Date(),
      inputPayload: options?.inputPayload,
    };
    context.steps.push(stepEntry);
    context.updatedAt = new Date();
    
    log.verbose(`[UniversalStepLogger] [${orchestrationId}] Step ${step}: ${STEP_DESCRIPTIONS[step]}`);
    
    try {
      const result = await executor();
      
      stepEntry.completedAt = new Date();
      stepEntry.durationMs = stepEntry.completedAt.getTime() - stepEntry.startedAt.getTime();
      stepEntry.status = result.success ? 'completed' : 'failed';
      stepEntry.outputPayload = result.data;
      
      if (!result.success) {
        stepEntry.error = result.error;
        stepEntry.errorCode = result.errorCode;
      }
      
      // Log to database
      await this.logToDatabase(context, `step_${step.toLowerCase()}_${stepEntry.status}`, {
        step,
        status: stepEntry.status,
        durationMs: stepEntry.durationMs,
        error: stepEntry.error,
      });
      
      // Persist state for durability after each step
      await this.persistOrchestrationState(context);
      
      log.verbose(`[UniversalStepLogger] [${orchestrationId}] Step ${step}: ${stepEntry.status} (${stepEntry.durationMs}ms)`);
      
      // Release lock on completion/failure (use correct lockKey format)
      if (options?.acquireLock) {
        const lockKey = `orchestration_lock:${context.workspaceId}:${options.acquireLock}`;
        this.activeLocks.delete(lockKey);
        const heldKeys = this.heldLockKeys.get(orchestrationId);
        if (heldKeys) heldKeys.delete(lockKey);
        (idempotencyService as any).markCompleted(lockKey, 'released');
      }
      
      return result;
    } catch (error: any) {
      stepEntry.completedAt = new Date();
      stepEntry.durationMs = stepEntry.completedAt.getTime() - stepEntry.startedAt.getTime();
      stepEntry.status = 'failed';
      stepEntry.error = (error instanceof Error ? error.message : String(error)) || 'Unknown error';
      stepEntry.errorCode = 'UNHANDLED_EXCEPTION';
      
      // Log to database
      await this.logToDatabase(context, `step_${step.toLowerCase()}_error`, {
        step,
        error: stepEntry.error,
        stack: error.stack,
      });
      
      // Persist state for durability
      await this.persistOrchestrationState(context);
      
      log.error(`[UniversalStepLogger] [${orchestrationId}] Step ${step} ERROR:`, error.message);
      
      // Release lock on error (use correct lockKey format)
      if (options?.acquireLock) {
        const lockKey = `orchestration_lock:${context.workspaceId}:${options.acquireLock}`;
        this.activeLocks.delete(lockKey);
        const heldKeys = this.heldLockKeys.get(orchestrationId);
        if (heldKeys) heldKeys.delete(lockKey);
        (idempotencyService as any).markCompleted(lockKey, 'released');
      }
      
      return { success: false, error: stepEntry.error, errorCode: 'UNHANDLED_EXCEPTION' };
    }
  }

  /**
   * Stage payload for approval (holds MUTATE until approved)
   */
  async stagePayload(orchestrationId: string, payload: Record<string, any>): Promise<void> {
    const context = this.orchestrations.get(orchestrationId);
    if (!context) {
      throw new Error('Orchestration not found');
    }
    
    context.stagedPayload = payload;
    context.status = 'pending_approval';
    context.updatedAt = new Date();
    
    await this.logToDatabase(context, 'payload_staged', {
      payloadSize: JSON.stringify(payload).length,
      requiresApproval: true,
    });
    
    log.info(`[UniversalStepLogger] [${orchestrationId}] Payload staged for approval`);
    
    // Publish event so Trinity and UI approval dialogs are notified
    platformEventBus.publish({
      type: 'orchestration_pending_approval',
      category: 'automation',
      title: `Orchestration Awaiting Approval — ${context.actionName}`,
      description: `Orchestration ${orchestrationId} in domain '${context.domain}' requires human approval`,
      workspaceId: context.workspaceId,
      metadata: { orchestrationId, domain: context.domain, actionName: context.actionName },
    }).catch((err: any) => log.warn('[UniversalStepLogger] publish orchestration_pending_approval failed:', err.message));
  }

  /**
   * Approve staged payload and proceed with CONFIRM step
   */
  async approvePayload(orchestrationId: string, approvedBy: string): Promise<StepResult> {
    const context = this.orchestrations.get(orchestrationId);
    if (!context) {
      return { success: false, error: 'Orchestration not found' };
    }
    
    if (context.status !== 'pending_approval') {
      return { success: false, error: 'Orchestration not pending approval' };
    }
    
    context.status = 'in_progress';
    context.updatedAt = new Date();
    
    await this.logToDatabase(context, 'payload_approved', {
      approvedBy,
      approvedAt: new Date().toISOString(),
    });
    
    log.info(`[UniversalStepLogger] [${orchestrationId}] Payload approved by ${approvedBy}`);
    
    return { success: true, data: context.stagedPayload };
  }

  /**
   * Reject staged payload
   */
  async rejectPayload(orchestrationId: string, rejectedBy: string, reason: string): Promise<void> {
    const context = this.orchestrations.get(orchestrationId);
    if (!context) {
      throw new Error('Orchestration not found');
    }
    
    context.status = 'rejected';
    context.updatedAt = new Date();
    
    await this.logToDatabase(context, 'payload_rejected', {
      rejectedBy,
      rejectedAt: new Date().toISOString(),
      reason,
    });
    
    log.info(`[UniversalStepLogger] [${orchestrationId}] Payload rejected by ${rejectedBy}: ${reason}`);
    
    platformEventBus.publish({
      type: 'orchestration_rejected',
      category: 'automation',
      title: `Orchestration Rejected — ${context.actionName}`,
      description: `Orchestration ${orchestrationId} rejected by ${rejectedBy}: ${reason}`,
      workspaceId: context.workspaceId,
      metadata: { orchestrationId, rejectedBy, reason, domain: context.domain, actionName: context.actionName },
    }).catch((err: any) => log.warn('[UniversalStepLogger] publish orchestration_rejected failed:', err.message));
  }

  /**
   * Complete orchestration successfully
   */
  async completeOrchestration(orchestrationId: string, summary?: Record<string, any>): Promise<void> {
    const context = this.orchestrations.get(orchestrationId);
    if (!context) {
      throw new Error('Orchestration not found');
    }
    
    context.status = 'completed';
    context.updatedAt = new Date();
    
    // Release the idempotency lock so recurring operations can run again
    if (context.idempotencyKey) {
      idempotencyService.deleteKey(context.idempotencyKey);
    }
    
    // Release all held locks
    this.releaseAllLocks(orchestrationId);
    
    // Update execution tracker
    const trackerId = this.executionTrackerIds.get(orchestrationId);
    if (trackerId) {
      try {
        const tracker = await getExecutionTracker();
        if (tracker) {
          // Derive itemsProcessed from common summary field names across all daemon types
          const derived = summary as Record<string, any> | undefined;
          const itemsProcessed: number =
            derived?.itemsProcessed ??
            derived?.shiftsGenerated ??
            derived?.shiftsAutoFilled ??
            derived?.recordsCreated ??
            derived?.recordsProcessed ??
            derived?.count ??
            0;
          await tracker.completeExecution(trackerId, {
            ...(summary as any),
            itemsProcessed,
          });
        }
      } catch (e) {
        log.warn('[UniversalStepLogger] Failed to update execution tracker:', e);
      }
      this.executionTrackerIds.delete(orchestrationId);
    }
    
    const totalDuration = context.steps.reduce((sum, s) => sum + (s.durationMs || 0), 0);
    const completedSteps = context.steps.filter(s => s.status === 'completed').length;
    
    await this.logToDatabase(context, 'orchestration_completed', {
      totalDurationMs: totalDuration,
      completedSteps,
      totalSteps: context.steps.length,
      summary,
      executionTrackerId: trackerId,
    });
    
    log.info(`[UniversalStepLogger] [${orchestrationId}] Orchestration completed in ${totalDuration}ms (${completedSteps}/${context.steps.length} steps)`);
    
    // Publish so Trinity can learn from and react to completed orchestrations.
    // Using 'orchestration_lifecycle' (not 'automation_executed') so this internal
    // telemetry is blocked by SYSTEM_INTERNAL_EVENT_TYPES and never reaches What's New.
    // User-facing automation completion events use automation_executed from trinityAutomationToggle.
    platformEventBus.publish({
      type: 'orchestration_lifecycle',
      category: 'automation',
      title: `Orchestration Completed: ${context.actionName}`,
      description: `${context.domain}/${context.actionName} completed in ${totalDuration}ms — ${completedSteps}/${context.steps.length} steps`,
      workspaceId: context.workspaceId,
      metadata: { orchestrationId, domain: context.domain, actionName: context.actionName, totalDurationMs: totalDuration, completedSteps, summary, lifecycle: 'completed' },
    }).catch(() => null);
    
    // Persist final state
    await this.persistOrchestrationState(context);
    
    // Cleanup after delay
    setTimeout(() => this.orchestrations.delete(orchestrationId), 300000); // 5 min retention
  }

  /**
   * Fail orchestration with error details
   */
  async failOrchestration(orchestrationId: string, error: string, errorCode?: string): Promise<void> {
    const context = this.orchestrations.get(orchestrationId);
    if (!context) {
      throw new Error('Orchestration not found');
    }
    
    context.status = 'failed';
    context.updatedAt = new Date();
    
    // Release the idempotency lock so the operation can be retried
    if (context.idempotencyKey) {
      idempotencyService.deleteKey(context.idempotencyKey);
    }
    
    // Release all held locks
    this.releaseAllLocks(orchestrationId);
    
    // Update execution tracker
    const trackerId = this.executionTrackerIds.get(orchestrationId);
    if (trackerId) {
      try {
        const tracker = await getExecutionTracker();
        if (tracker) {
          await tracker.failExecution(trackerId, {
            failureReason: error,
            failureCode: errorCode,
          });
        }
      } catch (e) {
        log.warn('[UniversalStepLogger] Failed to update execution tracker:', e);
      }
      this.executionTrackerIds.delete(orchestrationId);
    }
    
    const failedStep = context.steps.find(s => s.status === 'failed');
    
    await this.logToDatabase(context, 'orchestration_failed', {
      error,
      errorCode,
      failedAtStep: failedStep?.step,
      completedSteps: context.steps.filter(s => s.status === 'completed').length,
      executionTrackerId: trackerId,
    });
    
    log.error(`[UniversalStepLogger] [${orchestrationId}] Orchestration FAILED at ${failedStep?.step || 'unknown'}: ${error}`);
    
    // Publish failure — Trinity subscribers and monitoring layer must know
    platformEventBus.publish({
      type: 'automation_failed',
      category: 'automation',
      title: `Orchestration Failed: ${context.actionName}`,
      description: `${context.domain}/${context.actionName} failed at step ${failedStep?.step || 'unknown'}: ${error}`,
      workspaceId: context.workspaceId,
      metadata: { orchestrationId, domain: context.domain, actionName: context.actionName, error, errorCode, failedAtStep: failedStep?.step, lifecycle: 'failed' },
    }).catch(() => null);
    
    // Persist final state
    await this.persistOrchestrationState(context);
    
    // Cleanup after delay
    setTimeout(() => this.orchestrations.delete(orchestrationId), 300000);
  }

  /**
   * Log a step directly without using executeStep (for manual step tracking)
   * Used by services that manage their own step execution but want consistent logging
   */
  async logStep(
    context: OrchestrationContext,
    step: OrchestrationStep,
    status: StepStatus,
    inputPayload?: Record<string, any>,
    outputPayload?: Record<string, any>,
    error?: string
  ): Promise<void> {
    const now = new Date();
    const stepEntry: StepLogEntry = {
      step,
      status,
      startedAt: now,
      completedAt: status !== 'started' ? now : undefined,
      durationMs: 0,
      inputPayload,
      outputPayload,
      error,
    };
    
    // Track in context if registered
    const registeredContext = this.orchestrations.get(context.orchestrationId);
    if (registeredContext) {
      registeredContext.steps.push(stepEntry);
      registeredContext.updatedAt = now;
      await this.persistOrchestrationState(registeredContext);
    }
    
    // Log to database
    await this.logToDatabase(context, `step_${step.toLowerCase()}_${status}`, {
      step,
      status,
      inputPayload,
      outputPayload,
      error,
    });
    
    log.verbose(`[UniversalStepLogger] [${context.orchestrationId}] Step ${step}: ${status}`);
  }

  /**
   * Get orchestration status
   */
  getOrchestration(orchestrationId: string): OrchestrationContext | undefined {
    return this.orchestrations.get(orchestrationId);
  }

  /**
   * Get all active orchestrations for a workspace
   */
  getActiveOrchestrations(workspaceId: string): OrchestrationContext[] {
    return Array.from(this.orchestrations.values())
      .filter(o => o.workspaceId === workspaceId && o.status === 'in_progress');
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private getLastCompletedStep(context: OrchestrationContext): OrchestrationStep | null {
    const completedSteps = context.steps.filter(s => s.status === 'completed' || s.status === 'skipped');
    if (completedSteps.length === 0) return null;
    return completedSteps[completedSteps.length - 1].step;
  }

  private isValidNextStep(lastStep: OrchestrationStep, nextStep: OrchestrationStep): boolean {
    const lastIndex = STEP_ORDER.indexOf(lastStep);
    const nextIndex = STEP_ORDER.indexOf(nextStep);
    // Allow same step (retry) or next step
    return nextIndex >= lastIndex && nextIndex <= lastIndex + 1;
  }

  private hasFailedStep(context: OrchestrationContext): boolean {
    return context.steps.some(s => s.status === 'failed');
  }

  private async checkSubscription(
    workspaceId: string,
    requiredTier: FeatureTier,
    requiredFeature?: string
  ): Promise<SubscriptionCheckResult> {
    try {
      const [workspace] = await db.select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      
      if (!workspace) {
        return {
          allowed: false,
          currentTier: 'free',
          requiredTier,
          upsellRequired: true,
          upsellMessage: 'Workspace not found',
        };
      }
      
      const tierOrder: FeatureTier[] = ['free', 'starter', 'professional', 'enterprise'];
      const currentTier = (workspace.subscriptionTier as FeatureTier) || 'free';
      const currentIndex = tierOrder.indexOf(currentTier);
      const requiredIndex = tierOrder.indexOf(requiredTier);
      
      if (currentIndex >= requiredIndex) {
        return {
          allowed: true,
          currentTier,
          requiredTier,
          upsellRequired: false,
        };
      }
      
      return {
        allowed: false,
        currentTier,
        requiredTier,
        upsellRequired: true,
        upsellMessage: `This feature requires ${requiredTier} tier or higher. Current: ${currentTier}. ${requiredFeature ? `Upgrade to unlock ${requiredFeature}.` : ''}`,
      };
    } catch (error) {
      log.error('[UniversalStepLogger] Subscription check error:', error);
      return {
        allowed: true, // Fail open to avoid blocking legitimate operations
        currentTier: 'professional',
        requiredTier,
        upsellRequired: false,
      };
    }
  }

  private async triggerUpsell(context: OrchestrationContext, check: SubscriptionCheckResult): Promise<void> {
    platformEventBus.publish({
      type: 'upsell_triggered',
      category: 'automation',
      title: `Upsell Required — ${context.requiredFeature}`,
      description: `Feature '${context.requiredFeature}' requires ${check.requiredTier} tier (workspace is on ${check.currentTier})`,
      workspaceId: context.workspaceId,
      metadata: { orchestrationId: context.orchestrationId, feature: context.requiredFeature, currentTier: check.currentTier, requiredTier: check.requiredTier, message: check.upsellMessage, domain: context.domain, actionName: context.actionName },
    }).catch((err: any) => log.warn('[UniversalStepLogger] publish upsell_triggered failed:', err.message));
    
    log.info(`[UniversalStepLogger] Upsell triggered for ${context.requiredFeature}: ${check.currentTier} → ${check.requiredTier}`);
  }

  private async logToDatabase(
    context: OrchestrationContext,
    action: string,
    details: Record<string, any>
  ): Promise<void> {
    if (!context.workspaceId) {
      return;
    }
    // Skip high-frequency per-step events (started/completed for each step).
    // These create O(steps) rows per orchestration run with zero compliance value.
    // Keep: lifecycle events (started/completed/failed), payload decisions, and errors.
    const isStepNoise = /^step_[a-z]+_(started|completed)$/.test(action);
    if (isStepNoise) {
      return;
    }
    try {
      await db.insert(systemAuditLogs).values({
        workspaceId: context.workspaceId,
        userId: context.userId || null,
        action: `orchestration.${action}`,
        entityType: context.domain || 'orchestration',
        entityId: context.orchestrationId,
        metadata: {
          orchestrationId: context.orchestrationId,
          domain: context.domain,
          actionName: context.actionName,
          triggeredBy: 'system',
          ...details,
        },
        ipAddress: 'system',
        userAgent: 'UniversalStepLogger/1.0',
      });
    } catch (error) {
      log.error('[UniversalStepLogger] Failed to log to database:', error);
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const universalStepLogger = new UniversalStepLogger();

// Initialize on module load - rehydrate from persisted state (deferred 120s — fires after seeding + circuit stabilizes)
setTimeout(async () => {
  try {
    const { probeDbConnection } = await import('../../db');
    const dbOk = await probeDbConnection();
    if (!dbOk) {
      log.warn('[UniversalStepLogger] Skipping startup rehydration — DB probe failed');
      return;
    }
    const result = await universalStepLogger.rehydrateFromLogs();
    if (result.restored > 0 || result.expired > 0) {
      log.info(`[UniversalStepLogger] Startup rehydration: ${result.restored} in-progress, ${result.expired} expired`);
    }
  } catch (error) {
    log.warn('[UniversalStepLogger] Startup rehydration failed (non-fatal):', (error as Error)?.message);
  }
}, 120000);

// ============================================================================
// CONVENIENCE WRAPPER FOR FULL 7-STEP ORCHESTRATION
// ============================================================================

export interface FullOrchestrationConfig<T> {
  domain: OrchestrationDomain;
  actionName: string;
  workspaceId: string;
  userId?: string;
  triggeredBy: OrchestrationContext['triggeredBy'];
  requiredTier?: FeatureTier;
  requiredFeature?: string;
  requiresApproval?: boolean;
  externalSystem?: string;
  lockResource?: string;
  
  // Step executors
  onTrigger: () => Promise<StepResult>;
  onFetch: () => Promise<StepResult>;
  onValidate: () => Promise<StepResult>;
  onProcess: () => Promise<StepResult>;
  onMutate: () => Promise<StepResult>;
  onConfirm: (stagedData?: any) => Promise<StepResult>;
  onNotify: () => Promise<StepResult>;
}

export async function executeFullOrchestration<T>(
  config: FullOrchestrationConfig<T>
): Promise<{ success: boolean; orchestrationId: string; result?: T; error?: string }> {
  const context = await universalStepLogger.startOrchestration({
    domain: config.domain,
    actionName: config.actionName,
    workspaceId: config.workspaceId,
    userId: config.userId,
    triggeredBy: config.triggeredBy,
    requiredTier: config.requiredTier,
    requiredFeature: config.requiredFeature,
    requiresApproval: config.requiresApproval,
    externalSystem: config.externalSystem,
  });

  try {
    // Step 1: TRIGGER
    const triggerResult = await universalStepLogger.executeStep(context.orchestrationId, 'TRIGGER', config.onTrigger);
    if (!triggerResult.success) {
      await universalStepLogger.failOrchestration(context.orchestrationId, triggerResult.error || 'Trigger failed', triggerResult.errorCode);
      return { success: false, orchestrationId: context.orchestrationId, error: triggerResult.error };
    }

    // Step 2: FETCH
    const fetchResult = await universalStepLogger.executeStep(context.orchestrationId, 'FETCH', config.onFetch);
    if (!fetchResult.success) {
      await universalStepLogger.failOrchestration(context.orchestrationId, fetchResult.error || 'Fetch failed', fetchResult.errorCode);
      return { success: false, orchestrationId: context.orchestrationId, error: fetchResult.error };
    }

    // Step 3: VALIDATE (with subscription check)
    const validateResult = await universalStepLogger.executeStep(
      context.orchestrationId, 
      'VALIDATE', 
      config.onValidate,
      { validateSubscription: !!config.requiredTier }
    );
    if (!validateResult.success) {
      await universalStepLogger.failOrchestration(context.orchestrationId, validateResult.error || 'Validation failed', validateResult.errorCode);
      return { success: false, orchestrationId: context.orchestrationId, error: validateResult.error };
    }

    // Step 4: PROCESS
    const processResult = await universalStepLogger.executeStep(context.orchestrationId, 'PROCESS', config.onProcess);
    if (!processResult.success) {
      await universalStepLogger.failOrchestration(context.orchestrationId, processResult.error || 'Processing failed', processResult.errorCode);
      return { success: false, orchestrationId: context.orchestrationId, error: processResult.error };
    }

    // Step 5: MUTATE (with lock if specified)
    const mutateResult = await universalStepLogger.executeStep(
      context.orchestrationId, 
      'MUTATE', 
      config.onMutate,
      { acquireLock: config.lockResource }
    );
    if (!mutateResult.success) {
      await universalStepLogger.failOrchestration(context.orchestrationId, mutateResult.error || 'Mutation failed', mutateResult.errorCode);
      return { success: false, orchestrationId: context.orchestrationId, error: mutateResult.error };
    }

    // If requires approval, stage and wait
    if (config.requiresApproval) {
      await universalStepLogger.stagePayload(context.orchestrationId, mutateResult.data || {});
      return { 
        success: true, 
        orchestrationId: context.orchestrationId,
        result: { pendingApproval: true, stagedData: mutateResult.data } as any,
      };
    }

    // Step 6: CONFIRM
    const confirmResult = await universalStepLogger.executeStep(
      context.orchestrationId, 
      'CONFIRM', 
      () => config.onConfirm(mutateResult.data)
    );
    if (!confirmResult.success) {
      await universalStepLogger.failOrchestration(context.orchestrationId, confirmResult.error || 'Confirmation failed', confirmResult.errorCode);
      return { success: false, orchestrationId: context.orchestrationId, error: confirmResult.error };
    }

    // Step 7: NOTIFY
    const notifyResult = await universalStepLogger.executeStep(context.orchestrationId, 'NOTIFY', config.onNotify);
    if (!notifyResult.success) {
      // Notification failures are not critical - log but continue
      log.warn(`[Orchestration] Notification step failed: ${notifyResult.error}`);
    }

    await universalStepLogger.completeOrchestration(context.orchestrationId, { result: confirmResult.data });
    
    return { 
      success: true, 
      orchestrationId: context.orchestrationId, 
      result: confirmResult.data as T 
    };
  } catch (error: any) {
    await universalStepLogger.failOrchestration(context.orchestrationId, (error instanceof Error ? error.message : String(error)), 'UNHANDLED_EXCEPTION');
    return { success: false, orchestrationId: context.orchestrationId, error: (error instanceof Error ? error.message : String(error)) };
  }
}

// Register with AI Brain for diagnostic access
export function registerStepLoggerActions(): void {
  log.info('[UniversalStepLogger] Registered 7-step orchestration pattern');
}
