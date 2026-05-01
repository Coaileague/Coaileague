/**
 * Trinity Orchestration Adapter
 * =============================
 * Unified event emission and command consumption for all platform services.
 * Ensures Trinity AI has complete visibility into HRIS, RBAC/ABAC, webhooks,
 * workflows, middleware auth, and all platform operations.
 * 
 * This adapter provides:
 * 1. Standardized event contracts (Trinity Event Contract v1)
 * 2. Fire-and-forget event emission that never blocks main flows
 * 3. Dual-channel routing (platformEventBus + aiBrainEvents)
 * 4. Context-aware lifecycle tracking for long-running operations
 */

import { aiBrainEvents } from '../ai-brain/internalEventEmitter';
import { platformEventBus, PlatformEventType, EventCategory } from '../platformEventBus';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityOrchestrationAdapter');


// ============================================================================
// TRINITY EVENT CONTRACT V1 - Standardized Payload Schemas
// ============================================================================

export type TrinityEventDomain = 
  | 'hris'           // HRIS integration events
  | 'rbac'           // RBAC permission checks
  | 'abac'           // ABAC attribute-based access control
  | 'auth'           // Authentication events
  | 'workflow'       // Workflow pipeline events
  | 'webhook'        // External webhook events
  | 'automation'     // Bot/automation events
  | 'scheduling'     // Scheduling operations
  | 'billing'        // Billing/payment events
  | 'notification'   // Notification system events
  | 'integration'    // Third-party integration events
  | 'governance';    // Policy/governance events

export type TrinityEventSeverity = 'trace' | 'info' | 'warning' | 'error' | 'critical';

export type TrinityLifecyclePhase = 
  | 'requested'      // Operation requested
  | 'started'        // Operation started
  | 'in_progress'    // Operation in progress
  | 'completed'      // Operation completed successfully
  | 'failed'         // Operation failed
  | 'retrying'       // Operation retrying
  | 'escalated'      // Operation escalated for human review
  | 'cancelled';     // Operation cancelled

export interface TrinityEventContract {
  eventId: string;
  timestamp: string;
  domain: TrinityEventDomain;
  eventType: string;
  phase: TrinityLifecyclePhase;
  severity: TrinityEventSeverity;
  workspaceId?: string;
  userId?: string;
  sessionId?: string;
  correlationId?: string;
  parentEventId?: string;
  payload: Record<string, unknown>;
  metrics?: {
    durationMs?: number;
    retryCount?: number;
    resourceCount?: number;
  };
  trinityDirectives?: {
    requiresReview?: boolean;
    autoHeal?: boolean;
    escalateTo?: string;
  };
}

// ============================================================================
// DOMAIN-SPECIFIC EVENT TYPES
// ============================================================================

export interface HRISEvent extends Omit<TrinityEventContract, 'domain' | 'eventType'> {
  domain: 'hris';
  eventType: 
    | 'sync.requested'
    | 'sync.started'
    | 'sync.progress'
    | 'sync.completed'
    | 'sync.failed'
    | 'oauth.initiated'
    | 'oauth.callback'
    | 'oauth.success'
    | 'oauth.failed'
    | 'mapping.generated'
    | 'mapping.applied'
    | 'conflict.detected'
    | 'conflict.resolved'
    | 'employee.imported'
    | 'employee.updated'
    | 'employee.skipped';
  payload: {
    provider?: string;
    connectionId?: string;
    employeeCount?: number;
    fieldsMapped?: number;
    conflictCount?: number;
    confidenceScore?: number;
    errorMessage?: string;
    [key: string]: any;
  };
}

export interface RBACEvent extends Omit<TrinityEventContract, 'domain' | 'eventType'> {
  domain: 'rbac';
  eventType:
    | 'check.requested'
    | 'check.allowed'
    | 'check.denied'
    | 'role.assigned'
    | 'role.revoked'
    | 'permission.elevated'
    | 'permission.expired'
    | 'bypass.attempted'
    | 'bypass.granted'
    | 'bypass.denied';
  payload: {
    resource?: string;
    action?: string;
    role?: string;
    permission?: string;
    reason?: string;
    policyId?: string;
    [key: string]: any;
  };
}

export interface ABACEvent extends Omit<TrinityEventContract, 'domain' | 'eventType'> {
  domain: 'abac';
  eventType:
    | 'policy.evaluated'
    | 'policy.matched'
    | 'policy.denied'
    | 'attribute.checked'
    | 'context.enriched'
    | 'condition.failed';
  payload: {
    policyId?: string;
    attributes?: Record<string, unknown>;
    conditions?: Record<string, unknown>;
    result?: 'allow' | 'deny';
    reason?: string;
    [key: string]: any;
  };
}

export interface AuthEvent extends Omit<TrinityEventContract, 'domain' | 'eventType'> {
  domain: 'auth';
  eventType:
    | 'session.created'
    | 'session.validated'
    | 'session.expired'
    | 'session.destroyed'
    | 'request.authenticated'
    | 'request.unauthenticated'
    | 'mfa.required'
    | 'mfa.verified'
    | 'mfa.failed'
    | 'rate.limited'
    | 'anomaly.detected';
  payload: {
    method?: string;
    endpoint?: string;
    ipAddress?: string;
    userAgent?: string;
    reason?: string;
    riskScore?: number;
    [key: string]: any;
  };
}

export interface WorkflowEvent extends Omit<TrinityEventContract, 'domain' | 'eventType'> {
  domain: 'workflow';
  eventType:
    | 'pipeline.started'
    | 'pipeline.completed'
    | 'pipeline.failed'
    | 'step.entered'
    | 'step.completed'
    | 'step.failed'
    | 'step.skipped'
    | 'approval.required'
    | 'approval.granted'
    | 'approval.denied'
    | 'rollback.initiated'
    | 'rollback.completed';
  payload: {
    pipelineId?: string;
    pipelineName?: string;
    stepId?: string;
    stepName?: string;
    stepIndex?: number;
    totalSteps?: number;
    errorMessage?: string;
    approver?: string;
    [key: string]: any;
  };
}

export interface WebhookEvent extends Omit<TrinityEventContract, 'domain' | 'eventType'> {
  domain: 'webhook';
  eventType:
    | 'received'
    | 'validated'
    | 'invalid'
    | 'processed'
    | 'failed'
    | 'retried'
    | 'acknowledged';
  payload: {
    source?: string;
    webhookType?: string;
    httpMethod?: string;
    endpoint?: string;
    statusCode?: number;
    errorMessage?: string;
    [key: string]: any;
  };
}

export type AnyTrinityEvent = 
  | HRISEvent 
  | RBACEvent 
  | ABACEvent 
  | AuthEvent 
  | WorkflowEvent 
  | WebhookEvent 
  | TrinityEventContract;

// ============================================================================
// ORCHESTRATION CONTEXT - Tracks long-running operations
// ============================================================================

interface OrchestrationContext {
  correlationId: string;
  domain: TrinityEventDomain;
  startTime: number;
  events: string[];
  metadata: Record<string, unknown>;
}

class TrinityOrchestrationAdapter {
  private contexts: Map<string, OrchestrationContext> = new Map();
  private eventCounter = 0;

  private generateEventId(): string {
    return `trinity-${Date.now()}-${++this.eventCounter}`;
  }

  private generateCorrelationId(): string {
    return `corr-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
  }

  /**
   * Start a new orchestration context for tracking related events
   */
  startContext(domain: TrinityEventDomain, metadata?: Record<string, unknown>): string {
    const correlationId = this.generateCorrelationId();
    this.contexts.set(correlationId, {
      correlationId,
      domain,
      startTime: Date.now(),
      events: [],
      metadata: metadata || {},
    });
    return correlationId;
  }

  /**
   * Get an existing context or create a new one
   */
  getOrCreateContext(correlationId: string | undefined, domain: TrinityEventDomain): string {
    if (correlationId && this.contexts.has(correlationId)) {
      return correlationId;
    }
    return this.startContext(domain);
  }

  /**
   * End an orchestration context and emit summary
   */
  endContext(correlationId: string, success: boolean, summary?: Record<string, unknown>): void {
    const context = this.contexts.get(correlationId);
    if (context) {
      const durationMs = Date.now() - context.startTime;
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: context.domain,
        eventType: 'context.completed',
        phase: success ? 'completed' : 'failed',
        severity: success ? 'info' : 'error',
        correlationId,
        payload: {
          eventCount: context.events.length,
          durationMs,
          ...context.metadata,
          ...summary,
        },
        metrics: { durationMs },
      });
      this.contexts.delete(correlationId);
    }
  }

  /**
   * Core event emission - routes to both internal and platform event buses
   * Fire-and-forget pattern - never blocks
   */
  emit(event: AnyTrinityEvent): void {
    setImmediate(() => {
      try {
        const fullEvent: TrinityEventContract = {
          eventId: event.eventId || this.generateEventId(),
          timestamp: event.timestamp || new Date().toISOString(),
          domain: event.domain,
          eventType: event.eventType,
          phase: event.phase,
          severity: event.severity,
          workspaceId: event.workspaceId,
          userId: event.userId,
          sessionId: event.sessionId,
          correlationId: event.correlationId,
          parentEventId: event.parentEventId,
          payload: event.payload,
          metrics: event.metrics,
          trinityDirectives: event.trinityDirectives,
        };

        if (event.correlationId) {
          const context = this.contexts.get(event.correlationId);
          if (context) {
            context.events.push(fullEvent.eventId);
          }
        }

        aiBrainEvents.emit('trinity_orchestration', fullEvent);

        if (event.severity === 'warning' || event.severity === 'error' || event.severity === 'critical') {
          aiBrainEvents.emit('trinity_alert', fullEvent);
        }

        if (event.severity === 'warning' || event.severity === 'error' || event.severity === 'critical') {
          log.info(`[TrinityOrchestration] ${event.domain}.${event.eventType} [${event.phase}]`);
        }
      } catch (error) {
        log.error('[TrinityOrchestration] Failed to emit event:', error);
      }
    });
  }

  // ========================================================================
  // DOMAIN-SPECIFIC HELPERS
  // ========================================================================

  /**
   * HRIS Integration Events
   */
  hris = {
    syncRequested: (workspaceId: string, provider: string, userId?: string, correlationId?: string) => {
      const corrId = this.getOrCreateContext(correlationId, 'hris');
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'hris',
        eventType: 'sync.requested',
        phase: 'requested',
        severity: 'info',
        workspaceId,
        userId,
        correlationId: corrId,
        payload: { provider },
      });
      return corrId;
    },

    syncStarted: (workspaceId: string, provider: string, correlationId: string) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'hris',
        eventType: 'sync.started',
        phase: 'started',
        severity: 'info',
        workspaceId,
        correlationId,
        payload: { provider },
      });
    },

    syncCompleted: (workspaceId: string, provider: string, correlationId: string, stats: { imported: number; updated: number; skipped: number }) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'hris',
        eventType: 'sync.completed',
        phase: 'completed',
        severity: 'info',
        workspaceId,
        correlationId,
        payload: { provider, ...stats },
        metrics: { resourceCount: stats.imported + stats.updated },
      });
      this.endContext(correlationId, true, stats);
    },

    syncFailed: (workspaceId: string, provider: string, correlationId: string, error: string) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'hris',
        eventType: 'sync.failed',
        phase: 'failed',
        severity: 'error',
        workspaceId,
        correlationId,
        payload: { provider, errorMessage: error },
        trinityDirectives: { requiresReview: true },
      });
      this.endContext(correlationId, false, { error });
    },

    oauthInitiated: (workspaceId: string, provider: string, userId: string) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'hris',
        eventType: 'oauth.initiated',
        phase: 'started',
        severity: 'info',
        workspaceId,
        userId,
        payload: { provider },
      });
    },

    oauthSuccess: (workspaceId: string, provider: string, connectionId: string) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'hris',
        eventType: 'oauth.success',
        phase: 'completed',
        severity: 'info',
        workspaceId,
        payload: { provider, connectionId },
      });
    },

    oauthFailed: (workspaceId: string, provider: string, error: string) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'hris',
        eventType: 'oauth.failed',
        phase: 'failed',
        severity: 'error',
        workspaceId,
        payload: { provider, errorMessage: error },
      });
    },

    mappingGenerated: (workspaceId: string, provider: string, fieldCount: number, avgConfidence: number) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'hris',
        eventType: 'mapping.generated',
        phase: 'completed',
        severity: 'info',
        workspaceId,
        payload: { provider, fieldsMapped: fieldCount, confidenceScore: avgConfidence },
      });
    },
  };

  /**
   * RBAC Permission Events
   */
  rbac = {
    checkAllowed: (userId: string, resource: string, action: string, role: string, workspaceId?: string) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'rbac',
        eventType: 'check.allowed',
        phase: 'completed',
        severity: 'trace',
        userId,
        workspaceId,
        payload: { resource, action, role, result: 'allowed' },
      });
    },

    checkDenied: (userId: string, resource: string, action: string, role: string, reason: string, workspaceId?: string) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'rbac',
        eventType: 'check.denied',
        phase: 'completed',
        severity: 'warning',
        userId,
        workspaceId,
        payload: { resource, action, role, result: 'denied', reason },
        trinityDirectives: { requiresReview: true },
      });
    },

    roleAssigned: (targetUserId: string, role: string, assignedBy: string, workspaceId: string) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'rbac',
        eventType: 'role.assigned',
        phase: 'completed',
        severity: 'info',
        userId: assignedBy,
        workspaceId,
        payload: { targetUserId, role },
      });
    },

    bypassAttempted: (userId: string, resource: string, bypassType: string, granted: boolean, workspaceId?: string) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'rbac',
        eventType: granted ? 'bypass.granted' : 'bypass.denied',
        phase: 'completed',
        severity: granted ? 'warning' : 'error',
        userId,
        workspaceId,
        payload: { resource, bypassType, granted },
        trinityDirectives: { requiresReview: !granted },
      });
    },
  };

  /**
   * ABAC Policy Events
   */
  abac = {
    policyEvaluated: (userId: string, policyId: string, result: 'allow' | 'deny', attributes: Record<string, unknown>, workspaceId?: string) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'abac',
        eventType: 'policy.evaluated',
        phase: 'completed',
        severity: result === 'deny' ? 'warning' : 'trace',
        userId,
        workspaceId,
        payload: { policyId, result, attributes },
      });
    },
  };

  /**
   * Authentication Events
   */
  auth = {
    sessionCreated: (userId: string, sessionId: string, method: string, ipAddress?: string) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'auth',
        eventType: 'session.created',
        phase: 'completed',
        severity: 'info',
        userId,
        sessionId,
        payload: { method, ipAddress },
      });
    },

    requestAuthenticated: (userId: string, endpoint: string, method: string, workspaceId?: string) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'auth',
        eventType: 'request.authenticated',
        phase: 'completed',
        severity: 'trace',
        userId,
        workspaceId,
        payload: { endpoint, method },
      });
    },

    requestUnauthenticated: (endpoint: string, method: string, reason: string, ipAddress?: string) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'auth',
        eventType: 'request.unauthenticated',
        phase: 'completed',
        severity: 'warning',
        payload: { endpoint, method, reason, ipAddress },
      });
    },

    rateLimited: (identifier: string, endpoint: string, limit: number, windowMs: number, ipAddress?: string) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'auth',
        eventType: 'rate.limited',
        phase: 'completed',
        severity: 'warning',
        payload: { identifier, endpoint, limit, windowMs, ipAddress },
        trinityDirectives: { requiresReview: true },
      });
    },

    anomalyDetected: (userId: string, anomalyType: string, riskScore: number, details: Record<string, unknown>) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'auth',
        eventType: 'anomaly.detected',
        phase: 'completed',
        severity: riskScore > 0.7 ? 'critical' : 'warning',
        userId,
        payload: { anomalyType, riskScore, ...details },
        trinityDirectives: { requiresReview: true, escalateTo: 'security_ops' },
      });
    },
  };

  /**
   * Workflow Pipeline Events
   */
  workflow = {
    pipelineStarted: (pipelineId: string, pipelineName: string, totalSteps: number, workspaceId?: string, userId?: string): string => {
      const correlationId = this.startContext('workflow', { pipelineId, pipelineName });
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'workflow',
        eventType: 'pipeline.started',
        phase: 'started',
        severity: 'info',
        workspaceId,
        userId,
        correlationId,
        payload: { pipelineId, pipelineName, totalSteps },
      });
      return correlationId;
    },

    stepEntered: (pipelineId: string, stepId: string, stepName: string, stepIndex: number, correlationId: string) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'workflow',
        eventType: 'step.entered',
        phase: 'in_progress',
        severity: 'info',
        correlationId,
        payload: { pipelineId, stepId, stepName, stepIndex },
      });
    },

    stepCompleted: (pipelineId: string, stepId: string, stepName: string, stepIndex: number, correlationId: string, durationMs?: number) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'workflow',
        eventType: 'step.completed',
        phase: 'completed',
        severity: 'info',
        correlationId,
        payload: { pipelineId, stepId, stepName, stepIndex },
        metrics: { durationMs },
      });
    },

    stepFailed: (pipelineId: string, stepId: string, stepName: string, error: string, correlationId: string) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'workflow',
        eventType: 'step.failed',
        phase: 'failed',
        severity: 'error',
        correlationId,
        payload: { pipelineId, stepId, stepName, errorMessage: error },
        trinityDirectives: { requiresReview: true },
      });
    },

    pipelineCompleted: (pipelineId: string, pipelineName: string, correlationId: string, durationMs: number) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'workflow',
        eventType: 'pipeline.completed',
        phase: 'completed',
        severity: 'info',
        correlationId,
        payload: { pipelineId, pipelineName },
        metrics: { durationMs },
      });
      this.endContext(correlationId, true, { pipelineId, pipelineName, durationMs });
    },

    pipelineFailed: (pipelineId: string, pipelineName: string, correlationId: string, error: string) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'workflow',
        eventType: 'pipeline.failed',
        phase: 'failed',
        severity: 'error',
        correlationId,
        payload: { pipelineId, pipelineName, errorMessage: error },
        trinityDirectives: { requiresReview: true, autoHeal: true },
      });
      this.endContext(correlationId, false, { pipelineId, error });
    },

    approvalRequired: (pipelineId: string, stepId: string, approverRole: string, correlationId: string, workspaceId?: string) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'workflow',
        eventType: 'approval.required',
        phase: 'escalated',
        severity: 'info',
        workspaceId,
        correlationId,
        payload: { pipelineId, stepId, approverRole },
        trinityDirectives: { escalateTo: approverRole },
      });
    },
  };

  /**
   * Webhook Events
   */
  webhook = {
    received: (source: string, webhookType: string, endpoint: string, workspaceId?: string): string => {
      const correlationId = this.startContext('webhook', { source, webhookType });
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'webhook',
        eventType: 'received',
        phase: 'started',
        severity: 'info',
        workspaceId,
        correlationId,
        payload: { source, webhookType, endpoint },
      });
      return correlationId;
    },

    validated: (source: string, correlationId: string) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'webhook',
        eventType: 'validated',
        phase: 'in_progress',
        severity: 'info',
        correlationId,
        payload: { source },
      });
    },

    processed: (source: string, correlationId: string, result: Record<string, unknown>) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'webhook',
        eventType: 'processed',
        phase: 'completed',
        severity: 'info',
        correlationId,
        payload: { source, ...result },
      });
      this.endContext(correlationId, true, result);
    },

    failed: (source: string, correlationId: string, error: string, statusCode?: number) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain: 'webhook',
        eventType: 'failed',
        phase: 'failed',
        severity: 'error',
        correlationId,
        payload: { source, errorMessage: error, statusCode },
        trinityDirectives: { requiresReview: true },
      });
      this.endContext(correlationId, false, { error });
    },
  };

  /**
   * Generic platform event emission
   */
  platform = {
    custom: (domain: TrinityEventDomain, eventType: string, phase: TrinityLifecyclePhase, severity: TrinityEventSeverity, payload: Record<string, unknown>, options?: { workspaceId?: string; userId?: string; correlationId?: string }) => {
      this.emit({
        eventId: this.generateEventId(),
        timestamp: new Date().toISOString(),
        domain,
        eventType,
        phase,
        severity,
        workspaceId: options?.workspaceId,
        userId: options?.userId,
        correlationId: options?.correlationId,
        payload,
      });
    },
  };
}

export const trinityOrchestration = new TrinityOrchestrationAdapter();

export default trinityOrchestration;
