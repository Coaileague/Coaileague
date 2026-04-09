/**
 * ORCHESTRATION STATE MACHINE SERVICE
 * ====================================
 * Fortune 500-grade state machine coordinating work orders through execution.
 * 
 * This thin overlay pattern connects:
 * - WorkOrderSystem (intake, decomposition)
 * - ExecutionFabric (validation, execution)
 * - ToolCapabilityRegistry (RBAC enforcement)
 * 
 * Key Features:
 * - Runtime-enforced phase transitions
 * - RBAC permission checks before execution
 * - Escalation and rollback handling
 * - Complete audit trail
 */

import { db } from '../../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  orchestrationOverlays,
  users,
  type OrchestrationOverlay,
  type InsertOrchestrationOverlay,
  type PhaseTransition,
  type OrchestrationAuditEntry,
} from '@shared/schema';
import { trinityWorkOrderIntake, type WorkOrder } from './trinityWorkOrderSystem';
import { trinityExecutionFabric, type ExecutionManifest } from './trinityExecutionFabric';
import { aiBrainAuthorizationService } from './aiBrainAuthorizationService';
import { VALID_PHASE_TRANSITIONS, getAllowedNextPhases, isValidPhaseTransition } from '@shared/schema';
import { toolCapabilityRegistry, type ToolValidationResult } from './toolCapabilityRegistry';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('orchestrationStateMachine');

// ============================================================================
// TYPES
// ============================================================================

export type OrchestrationPhase = 
  | 'intake'
  | 'planning'
  | 'validating'
  | 'executing'
  | 'reflecting'
  | 'committing'
  | 'completed'
  | 'failed'
  | 'rolled_back'
  | 'escalated';

export interface TransitionRequest {
  overlayId: string;
  targetPhase: OrchestrationPhase;
  reason?: string;
  triggeredBy: 'system' | 'user' | 'subagent' | 'timeout' | 'error' | 'orchestrator';
  actorId?: string;
}

export interface TransitionResult {
  success: boolean;
  overlay: OrchestrationOverlay | null;
  error?: string;
  allowedNextPhases?: string[];
}

export interface PermissionCheckResult {
  granted: boolean;
  grantedPermissions: string[];
  deniedPermissions: string[];
  reason?: string;
  bypassed: boolean;
}

export interface OrchestrationSummary {
  overlayId: string;
  workOrderId: string;
  phase: OrchestrationPhase;
  domain: string;
  confidenceScore: number;
  phaseTransitionCount: number;
  totalDurationMs: number | null;
  hasEscalation: boolean;
  permissionResult: string;
  createdAt: Date;
  completedAt: Date | null;
}

// ============================================================================
// ORCHESTRATION STATE MACHINE SERVICE
// ============================================================================

class OrchestrationStateMachine {
  private static instance: OrchestrationStateMachine;

  static getInstance(): OrchestrationStateMachine {
    if (!this.instance) {
      this.instance = new OrchestrationStateMachine();
    }
    return this.instance;
  }

  // =========================================================================
  // OVERLAY LIFECYCLE
  // =========================================================================

  /**
   * Create a new orchestration overlay for a work order
   */
  async createOverlay(params: {
    workOrderId: string;
    workspaceId: string;
    userId: string;
    domain: string;
    subagentId?: string;
    conversationId?: string;
    workboardTaskId?: string;
    requiredPermissions?: string[];
  }): Promise<OrchestrationOverlay> {
    const now = new Date();
    
    const auditEntry: OrchestrationAuditEntry = {
      id: crypto.randomUUID(),
      timestamp: now.toISOString(),
      eventType: 'overlay_created',
      details: {
        workOrderId: params.workOrderId,
        domain: params.domain,
      },
      actor: 'orchestrator',
      actorId: params.userId,
    };

    const phaseTransition: PhaseTransition = {
      fromPhase: null,
      toPhase: 'intake',
      reason: 'Overlay created',
      triggeredBy: 'orchestrator',
      enteredAt: now.toISOString(),
      validatedByStateMachine: true,
    };

    const insert: InsertOrchestrationOverlay = {
      workOrderId: params.workOrderId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      domain: params.domain,
      subagentId: params.subagentId ?? null,
      conversationId: params.conversationId ?? null,
      workboardTaskId: params.workboardTaskId ?? null,
      phase: 'intake',
      previousPhase: null,
      phaseEnteredAt: now,
      phaseTransitionCount: 1,
      phaseHistory: [phaseTransition],
      requiredPermissions: params.requiredPermissions ?? [],
      grantedPermissions: [],
      deniedPermissions: [],
      permissionResult: 'pending',
      requiresEscalation: false,
      confidenceScore: '0',
      confidenceLevel: 'none',
      startedAt: now,
      auditTrail: [auditEntry],
    };

    const [overlay] = await db
      .insert(orchestrationOverlays)
      .values(insert)
      .returning();

    log.info(`[OrchestrationStateMachine] Created overlay ${overlay.id} for work order ${params.workOrderId}`);

    return overlay;
  }

  /**
   * Get overlay by ID
   */
  async getOverlay(overlayId: string): Promise<OrchestrationOverlay | null> {
    const [overlay] = await db
      .select()
      .from(orchestrationOverlays)
      .where(eq(orchestrationOverlays.id, overlayId))
      .limit(1);

    return overlay ?? null;
  }

  /**
   * Get overlay by work order ID
   */
  async getOverlayByWorkOrder(workOrderId: string): Promise<OrchestrationOverlay | null> {
    const [overlay] = await db
      .select()
      .from(orchestrationOverlays)
      .where(eq(orchestrationOverlays.workOrderId, workOrderId))
      .limit(1);

    return overlay ?? null;
  }

  /**
   * Get active overlays for a workspace
   */
  async getActiveOverlays(workspaceId: string): Promise<OrchestrationOverlay[]> {
    const terminalPhases = ['completed', 'failed', 'rolled_back', 'escalated'];
    
    const overlays = await db
      .select()
      .from(orchestrationOverlays)
      .where(eq(orchestrationOverlays.workspaceId, workspaceId))
      .orderBy(desc(orchestrationOverlays.createdAt));

    return overlays.filter(o => !terminalPhases.includes(o.phase));
  }

  // =========================================================================
  // PHASE TRANSITIONS (Runtime Enforced)
  // =========================================================================

  /**
   * Attempt a phase transition with validation
   */
  async transitionPhase(request: TransitionRequest): Promise<TransitionResult> {
    const overlay = await this.getOverlay(request.overlayId);
    
    if (!overlay) {
      return {
        success: false,
        overlay: null,
        error: `Overlay ${request.overlayId} not found`,
      };
    }

    const currentPhase = overlay.phase;
    const targetPhase = request.targetPhase;

    // Validate transition using exported helper
    if (!isValidPhaseTransition(currentPhase, targetPhase)) {
      const allowed = getAllowedNextPhases(currentPhase);
      
      // Log rejected transition - map trigger type to valid actor
      const actorMapping: Record<string, 'system' | 'user' | 'subagent' | 'orchestrator' | 'auth_service'> = {
        'system': 'system',
        'user': 'user',
        'subagent': 'subagent',
        'timeout': 'system',
        'error': 'system',
        'orchestrator': 'orchestrator',
      };
      
      await this.appendAuditEntry(overlay.id, {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        eventType: 'phase_transition_rejected',
        details: {
          from: currentPhase,
          to: targetPhase,
          allowedTransitions: allowed,
          triggeredBy: request.triggeredBy,
        },
        actor: actorMapping[request.triggeredBy] ?? 'system',
        actorId: request.actorId,
      });

      return {
        success: false,
        overlay,
        error: `Invalid transition from '${currentPhase}' to '${targetPhase}'`,
        allowedNextPhases: allowed,
      };
    }

    // Create phase transition record
    const now = new Date();
    const phaseTransition: PhaseTransition = {
      fromPhase: currentPhase as any,
      toPhase: targetPhase,
      reason: request.reason ?? 'Transition requested',
      triggeredBy: request.triggeredBy,
      enteredAt: now.toISOString(),
      validatedByStateMachine: true,
    };

    // Update previous transition's exit time
    const phaseHistory = (overlay.phaseHistory as PhaseTransition[]) || [];
    if (phaseHistory.length > 0) {
      const lastTransition = phaseHistory[phaseHistory.length - 1];
      lastTransition.exitedAt = now.toISOString();
      if (lastTransition.enteredAt) {
        lastTransition.durationMs = now.getTime() - new Date(lastTransition.enteredAt).getTime();
      }
    }
    phaseHistory.push(phaseTransition);

    // Calculate total duration if reaching terminal state
    const isTerminal = ['completed', 'failed', 'rolled_back', 'escalated'].includes(targetPhase);
    const totalDuration = isTerminal && overlay.startedAt
      ? now.getTime() - new Date(overlay.startedAt).getTime()
      : null;

    // Update overlay
    const [updated] = await db
      .update(orchestrationOverlays)
      .set({
        phase: targetPhase as any,
        previousPhase: currentPhase as any,
        phaseEnteredAt: now,
        phaseTransitionCount: (overlay.phaseTransitionCount ?? 0) + 1,
        phaseHistory: phaseHistory,
        completedAt: isTerminal ? now : undefined,
        totalDurationMs: totalDuration,
      })
      .where(eq(orchestrationOverlays.id, overlay.id))
      .returning();

    // Log validated transition - map trigger type to valid actor
    const validActorMapping: Record<string, 'system' | 'user' | 'subagent' | 'orchestrator' | 'auth_service'> = {
      'system': 'system',
      'user': 'user',
      'subagent': 'subagent',
      'timeout': 'system',
      'error': 'system',
      'orchestrator': 'orchestrator',
    };
    
    await this.appendAuditEntry(overlay.id, {
      id: crypto.randomUUID(),
      timestamp: now.toISOString(),
      eventType: 'phase_transition_validated',
      details: {
        from: currentPhase,
        to: targetPhase,
        reason: request.reason,
        triggeredBy: request.triggeredBy,
      },
      actor: validActorMapping[request.triggeredBy] ?? 'system',
      actorId: request.actorId,
    });

    log.info(`[OrchestrationStateMachine] Transitioned overlay ${overlay.id}: ${currentPhase} → ${targetPhase}`);

    return {
      success: true,
      overlay: updated,
    };
  }

  // =========================================================================
  // RBAC PERMISSION CHECKING
  // =========================================================================

  /**
   * Check permissions before execution phase
   * Validates all capabilities against authorization service
   */
  async checkPermissions(
    overlayId: string,
    userId: string,
    workspaceId: string,
    capabilities: string[],
    userRole?: string
  ): Promise<PermissionCheckResult> {
    const overlay = await this.getOverlay(overlayId);
    
    if (!overlay) {
      return {
        granted: false,
        grantedPermissions: [],
        deniedPermissions: capabilities,
        reason: 'Overlay not found',
        bypassed: false,
      };
    }

    // Log permission check start
    await this.appendAuditEntry(overlayId, {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      eventType: 'permission_check_started',
      details: { capabilities, userRole },
      actor: 'auth_service',
    });

    try {
      // Resolve user role if not provided
      let resolvedRole = userRole;
      if (!resolvedRole) {
        try {
          const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
          resolvedRole = user?.role || 'employee';
        } catch {
          resolvedRole = 'employee';
        }
      }

      // Check elevation status
      const elevationContext = await aiBrainAuthorizationService.checkElevatedSession(userId);
      
      const category = overlay.domain || 'system';
      const grantedCapabilities: string[] = [];
      const deniedCapabilities: string[] = [];
      const denialReasons: string[] = [];

      // Check ALL capabilities, not just the first
      for (const capability of capabilities) {
        const authResult = await aiBrainAuthorizationService.canExecuteAction(
          { userId, userRole: resolvedRole, workspaceId },
          category,
          capability,
          elevationContext
        );

        if (authResult.isAuthorized) {
          grantedCapabilities.push(capability);
        } else {
          deniedCapabilities.push(capability);
          if (authResult.reason) {
            denialReasons.push(`${capability}: ${authResult.reason}`);
          }
        }
      }

      // All capabilities must be granted for overall success
      const allGranted = deniedCapabilities.length === 0;
      const isPartial = grantedCapabilities.length > 0 && deniedCapabilities.length > 0;
      
      // Determine permission result
      const permResult = allGranted ? 'granted' : (isPartial ? 'partial' : 'denied');
      const combinedReason = denialReasons.length > 0 ? denialReasons.join('; ') : undefined;

      // Update overlay with permission result
      await db
        .update(orchestrationOverlays)
        .set({
          requiredPermissions: capabilities,
          grantedPermissions: grantedCapabilities,
          deniedPermissions: deniedCapabilities,
          permissionResult: permResult as any,
          permissionCheckedAt: new Date(),
          permissionCheckedBy: 'auth_service',
          permissionDeniedReason: combinedReason ?? null,
        })
        .where(eq(orchestrationOverlays.id, overlayId));

      // Log permission result
      await this.appendAuditEntry(overlayId, {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        eventType: allGranted ? 'permission_granted' : 'permission_denied',
        details: {
          grantedPermissions: grantedCapabilities,
          deniedPermissions: deniedCapabilities,
          reason: combinedReason,
          resolvedRole,
          isElevated: elevationContext.isElevated,
        },
        actor: 'auth_service',
      });

      return {
        granted: allGranted,
        grantedPermissions: grantedCapabilities,
        deniedPermissions: deniedCapabilities,
        reason: combinedReason,
        bypassed: false,
      };

    } catch (error: any) {
      log.error(`[OrchestrationStateMachine] Permission check failed:`, (error instanceof Error ? error.message : String(error)));
      
      // Log failure to audit trail for state consistency
      await this.appendAuditEntry(overlayId, {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        eventType: 'permission_check_failed',
        details: {
          capabilities,
          error: (error instanceof Error ? error.message : String(error)),
        },
        actor: 'auth_service',
      });

      // Update overlay to reflect error state
      try {
        await db
          .update(orchestrationOverlays)
          .set({
            requiredPermissions: capabilities,
            grantedPermissions: [],
            deniedPermissions: capabilities,
            permissionResult: 'denied' as any,
            permissionCheckedAt: new Date(),
            permissionCheckedBy: 'auth_service',
            permissionDeniedReason: `Permission check error: ${error.message}`,
          })
          .where(eq(orchestrationOverlays.id, overlayId));
      } catch (updateError) {
        log.error(`[OrchestrationStateMachine] Failed to update overlay state:`, updateError);
      }
      
      return {
        granted: false,
        grantedPermissions: [],
        deniedPermissions: capabilities,
        reason: error.message,
        bypassed: false,
      };
    }
  }

  // =========================================================================
  // TOOL CAPABILITY REGISTRY INTEGRATION
  // =========================================================================

  /**
   * Validate tools before execution using ToolCapabilityRegistry
   * Enforces health checks, tier access, and policy compliance
   */
  async validateToolsForExecution(
    overlayId: string,
    toolIds: string[],
    subagentId: string,
    userPermissions: string[],
    userConsents: string[],
    modelTier?: string
  ): Promise<{
    valid: boolean;
    toolResults: Map<string, ToolValidationResult>;
    blockers: string[];
    warnings: string[];
  }> {
    const toolResults = new Map<string, ToolValidationResult>();
    const blockers: string[] = [];
    const warnings: string[] = [];

    // Log tool validation start
    await this.appendAuditEntry(overlayId, {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      eventType: 'tool_validation_started',
      details: { toolIds, subagentId, modelTier },
      actor: 'orchestrator',
    });

    for (const toolId of toolIds) {
      const result = await toolCapabilityRegistry.validateToolExecution(
        toolId,
        subagentId,
        userPermissions,
        userConsents,
        modelTier
      );

      toolResults.set(toolId, result);

      if (!result.valid) {
        blockers.push(`Tool '${toolId}': ${result.errors.join(', ')}`);
      }
      if (result.warnings.length > 0) {
        warnings.push(`Tool '${toolId}': ${result.warnings.join(', ')}`);
      }

      // Check health status for degraded/offline tools
      if (result.healthStatus === 'offline') {
        blockers.push(`Tool '${toolId}' is offline`);
      } else if (result.healthStatus === 'degraded') {
        warnings.push(`Tool '${toolId}' is experiencing degraded performance`);
      }
    }

    const valid = blockers.length === 0;

    // Log tool validation result
    await this.appendAuditEntry(overlayId, {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      eventType: valid ? 'tool_validation_passed' : 'tool_validation_failed',
      details: {
        toolIds,
        blockers,
        warnings,
        healthSummary: toolCapabilityRegistry.getHealthySummary(),
      },
      actor: 'orchestrator',
    });

    return { valid, toolResults, blockers, warnings };
  }

  /**
   * Record tool execution metrics after a step completes
   */
  recordToolExecution(
    toolId: string,
    subagentId: string,
    success: boolean,
    executionTimeMs: number,
    error?: string
  ): void {
    toolCapabilityRegistry.recordExecution(toolId, subagentId, success, executionTimeMs, error);
  }

  /**
   * Get tool health summary for dashboard/monitoring
   */
  getToolHealthSummary(): {
    healthy: number;
    degraded: number;
    offline: number;
    unknown: number;
  } {
    return toolCapabilityRegistry.getHealthySummary();
  }

  /**
   * Get all tool health statuses for detailed monitoring
   */
  getToolHealthStatuses(): Array<{
    toolId: string;
    status: string;
    lastCheck: Date;
    responseTime: number;
    uptime: number;
    errorRate: number;
  }> {
    return toolCapabilityRegistry.getAllHealthStatuses().map(h => ({
      toolId: h.toolId,
      status: h.status,
      lastCheck: h.lastCheck,
      responseTime: h.responseTime,
      uptime: h.uptime,
      errorRate: h.errorRate,
    }));
  }

  /**
   * Get tool diagnostics for debugging
   */
  getToolDiagnostics(): Record<string, any> {
    return toolCapabilityRegistry.exportDiagnostics();
  }

  // =========================================================================
  // ESCALATION HANDLING
  // =========================================================================

  /**
   * Trigger escalation to human
   * Wrapped in error handling for transactional consistency
   */
  async escalate(
    overlayId: string,
    reason: string,
    escalatedTo?: string
  ): Promise<TransitionResult> {
    try {
      await this.appendAuditEntry(overlayId, {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        eventType: 'escalation_triggered',
        details: { reason, escalatedTo },
        actor: 'orchestrator',
      });

      // Update escalation fields
      await db
        .update(orchestrationOverlays)
        .set({
          requiresEscalation: true,
          escalationReason: reason,
          escalatedTo: escalatedTo,
          escalatedAt: new Date(),
        })
        .where(eq(orchestrationOverlays.id, overlayId));

      // Transition to escalated phase
      return this.transitionPhase({
        overlayId,
        targetPhase: 'escalated',
        reason: `Escalation: ${reason}`,
        triggeredBy: 'orchestrator',
      });
    } catch (error: any) {
      log.error(`[OrchestrationStateMachine] Escalation failed:`, (error instanceof Error ? error.message : String(error)));
      
      // Log escalation failure
      await this.appendAuditEntry(overlayId, {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        eventType: 'escalation_failed',
        details: { reason, error: (error instanceof Error ? error.message : String(error)) },
        actor: 'orchestrator',
      });

      return {
        success: false,
        overlay: null,
        error: `Escalation failed: ${(error instanceof Error ? error.message : String(error))}`,
      };
    }
  }

  /**
   * Initiate rollback
   * Wrapped in error handling for transactional consistency
   */
  async rollback(
    overlayId: string,
    reason: string
  ): Promise<TransitionResult> {
    try {
      await this.appendAuditEntry(overlayId, {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        eventType: 'rollback_initiated',
        details: { reason },
        actor: 'orchestrator',
      });

      return this.transitionPhase({
        overlayId,
        targetPhase: 'rolled_back',
        reason: `Rollback: ${reason}`,
        triggeredBy: 'orchestrator',
      });
    } catch (error: any) {
      log.error(`[OrchestrationStateMachine] Rollback failed:`, (error instanceof Error ? error.message : String(error)));
      
      // Log rollback failure
      await this.appendAuditEntry(overlayId, {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        eventType: 'rollback_failed',
        details: { reason, error: (error instanceof Error ? error.message : String(error)) },
        actor: 'orchestrator',
      });

      return {
        success: false,
        overlay: null,
        error: `Rollback failed: ${(error instanceof Error ? error.message : String(error))}`,
      };
    }
  }

  // =========================================================================
  // CONFIDENCE & METRICS
  // =========================================================================

  /**
   * Update confidence score
   */
  async updateConfidence(
    overlayId: string,
    score: number,
    source?: string
  ): Promise<void> {
    const level = this.calculateConfidenceLevel(score);
    
    await db
      .update(orchestrationOverlays)
      .set({
        confidenceScore: score.toString(),
        confidenceLevel: level,
      })
      .where(eq(orchestrationOverlays.id, overlayId));
  }

  private calculateConfidenceLevel(score: number): string {
    if (score >= 0.95) return 'certain';
    if (score >= 0.8) return 'high';
    if (score >= 0.5) return 'medium';
    if (score >= 0.2) return 'low';
    return 'none';
  }

  // =========================================================================
  // FULL ORCHESTRATION PIPELINE
  // =========================================================================

  /**
   * Main orchestration entry point - drives full work order lifecycle
   * Wires together: WorkOrderIntake -> Overlay -> ExecutionFabric
   */
  async orchestrateRequest(params: {
    rawRequest: string;
    workspaceId: string;
    userId: string;
    userRole?: string;
    conversationId?: string;
  }): Promise<{
    success: boolean;
    overlayId: string;
    workOrderId?: string;
    manifestId?: string;
    phase: OrchestrationPhase;
    error?: string;
  }> {
    let overlayId = '';
    
    try {
      // Phase 1: INTAKE - Parse work order via WorkOrderIntake
      log.info(`[OrchestrationStateMachine] Starting orchestration for: "${params.rawRequest.substring(0, 50)}..."`);
      
      const workOrder = await trinityWorkOrderIntake.parseWorkOrder(
        params.rawRequest,
        params.workspaceId,
        params.userId
      );
      
      // Create overlay in intake phase
      const overlay = await this.createOverlay({
        workOrderId: workOrder.id,
        workspaceId: params.workspaceId,
        userId: params.userId,
        domain: workOrder.intent,
        conversationId: params.conversationId,
        requiredPermissions: [],
      });
      overlayId = overlay.id;
      
      // Phase 2: PLANNING - Transition and plan execution
      await this.transitionPhase({
        overlayId,
        targetPhase: 'planning',
        reason: 'Work order parsed, planning execution',
        triggeredBy: 'orchestrator',
      });
      
      // Plan execution via ExecutionFabric
      const manifest = await trinityExecutionFabric.planExecution(
        params.rawRequest,
        {
          workspaceId: params.workspaceId,
          userId: params.userId,
          userRole: params.userRole || 'employee',
          conversationId: params.conversationId,
          creditsAvailable: 100,
          permissions: [],
        },
        { domain: workOrder.intent }
      );
      
      // Link manifest to overlay
      await this.linkExecutionManifest(overlayId, manifest.id);
      
      // Phase 3: VALIDATING - Check permissions and prepare
      await this.transitionPhase({
        overlayId,
        targetPhase: 'validating',
        reason: 'Execution plan created, validating permissions',
        triggeredBy: 'orchestrator',
      });
      
      // Check permissions
      const permResult = await this.checkPermissions(
        overlayId,
        params.userId,
        params.workspaceId,
        manifest.steps.map(s => s.capability),
        params.userRole
      );
      
      if (!permResult.granted) {
        // Escalate if permissions denied
        await this.escalate(overlayId, `Permissions denied: ${permResult.reason}`);
        return {
          success: false,
          overlayId,
          workOrderId: workOrder.id,
          manifestId: manifest.id,
          phase: 'escalated',
          error: permResult.reason,
        };
      }
      
      // Validate tools via ToolCapabilityRegistry (health, tier access, policy)
      const toolIds = manifest.steps.map(s => s.capability).filter(Boolean);
      const toolValidation = await this.validateToolsForExecution(
        overlayId,
        toolIds,
        manifest.subagentId || 'orchestrator',
        permResult.grantedPermissions,
        [], // User consents - would come from workspace settings
        'ORCHESTRATOR' // Model tier for orchestration
      );
      
      if (!toolValidation.valid) {
        await this.transitionPhase({
          overlayId,
          targetPhase: 'failed',
          reason: `Tool validation failed: ${toolValidation.blockers.join(', ')}`,
          triggeredBy: 'system',
        });
        return {
          success: false,
          overlayId,
          workOrderId: workOrder.id,
          manifestId: manifest.id,
          phase: 'failed',
          error: toolValidation.blockers.join(', '),
        };
      }
      
      // Prepare execution via fabric
      const preparation = await trinityExecutionFabric.prepareExecution(manifest.id);
      if (!preparation.ready) {
        await this.transitionPhase({
          overlayId,
          targetPhase: 'failed',
          reason: `Preflight failed: ${preparation.blockers.join(', ')}`,
          triggeredBy: 'system',
        });
        return {
          success: false,
          overlayId,
          workOrderId: workOrder.id,
          manifestId: manifest.id,
          phase: 'failed',
          error: preparation.blockers.join(', '),
        };
      }
      
      // Phase 4: EXECUTING
      await this.transitionPhase({
        overlayId,
        targetPhase: 'executing',
        reason: 'Preflight passed, executing manifest',
        triggeredBy: 'orchestrator',
      });
      
      const execution = await trinityExecutionFabric.executeManifest(manifest.id);
      
      if (!execution.success) {
        await this.rollback(overlayId, execution.error || 'Execution failed');
        return {
          success: false,
          overlayId,
          workOrderId: workOrder.id,
          manifestId: manifest.id,
          phase: 'rolled_back',
          error: execution.error,
        };
      }
      
      // Phase 5: REFLECTING - Validate execution
      await this.transitionPhase({
        overlayId,
        targetPhase: 'reflecting',
        reason: 'Execution complete, validating results',
        triggeredBy: 'orchestrator',
      });
      
      const validation = await trinityExecutionFabric.validateExecution(manifest.id);
      
      if (!validation.passed) {
        await this.rollback(overlayId, `Validation failed: ${validation.issues.join(', ')}`);
        return {
          success: false,
          overlayId,
          workOrderId: workOrder.id,
          manifestId: manifest.id,
          phase: 'rolled_back',
          error: validation.issues.join(', '),
        };
      }
      
      // Phase 6: COMMITTING - Finalize
      await this.transitionPhase({
        overlayId,
        targetPhase: 'committing',
        reason: 'Validation passed, committing changes',
        triggeredBy: 'orchestrator',
      });
      
      // Phase 7: COMPLETED
      await this.transitionPhase({
        overlayId,
        targetPhase: 'completed',
        reason: 'Orchestration completed successfully',
        triggeredBy: 'orchestrator',
      });
      
      // Update work order status
      await trinityWorkOrderIntake.updateStatus(workOrder.id, 'completed');
      
      log.info(`[OrchestrationStateMachine] Orchestration completed: ${overlayId}`);
      
      return {
        success: true,
        overlayId,
        workOrderId: workOrder.id,
        manifestId: manifest.id,
        phase: 'completed',
      };
      
    } catch (error: any) {
      log.error(`[OrchestrationStateMachine] Orchestration failed:`, (error instanceof Error ? error.message : String(error)));
      
      if (overlayId) {
        await this.transitionPhase({
          overlayId,
          targetPhase: 'failed',
          reason: (error instanceof Error ? error.message : String(error)),
          triggeredBy: 'error',
        });
      }
      
      return {
        success: false,
        overlayId,
        phase: 'failed',
        error: error.message,
      };
    }
  }

  // =========================================================================
  // INTEGRATION WITH WORK ORDER SYSTEM
  // =========================================================================

  /**
   * Link execution manifest to overlay
   */
  async linkExecutionManifest(
    overlayId: string,
    manifestId: string
  ): Promise<void> {
    await db
      .update(orchestrationOverlays)
      .set({
        executionManifestId: manifestId,
      })
      .where(eq(orchestrationOverlays.id, overlayId));
  }

  // =========================================================================
  // AUDIT TRAIL
  // =========================================================================

  private async appendAuditEntry(
    overlayId: string,
    entry: OrchestrationAuditEntry
  ): Promise<void> {
    try {
      await db
        .update(orchestrationOverlays)
        .set({
          auditTrail: sql`COALESCE(${orchestrationOverlays.auditTrail}, '[]'::jsonb) || ${JSON.stringify(entry)}::jsonb`,
        })
        .where(eq(orchestrationOverlays.id, overlayId));
    } catch (error) {
      log.error(`[OrchestrationStateMachine] Failed to append audit entry:`, error);
    }
  }

  // =========================================================================
  // SUMMARY & REPORTING
  // =========================================================================

  /**
   * Get orchestration summary for dashboard
   */
  async getSummary(overlayId: string): Promise<OrchestrationSummary | null> {
    const overlay = await this.getOverlay(overlayId);
    
    if (!overlay) return null;

    return {
      overlayId: overlay.id,
      workOrderId: overlay.workOrderId,
      phase: overlay.phase as OrchestrationPhase,
      domain: overlay.domain,
      confidenceScore: parseFloat(overlay.confidenceScore ?? '0'),
      phaseTransitionCount: overlay.phaseTransitionCount ?? 0,
      totalDurationMs: overlay.totalDurationMs,
      hasEscalation: overlay.requiresEscalation ?? false,
      permissionResult: overlay.permissionResult ?? 'pending',
      createdAt: overlay.createdAt,
      completedAt: overlay.completedAt,
    };
  }

  /**
   * Get all overlays summary for workspace dashboard
   */
  async getWorkspaceSummary(workspaceId: string, limit = 50): Promise<{
    total: number;
    byPhase: Record<string, number>;
    byDomain: Record<string, number>;
    recentOverlays: OrchestrationSummary[];
  }> {
    const overlays = await db
      .select()
      .from(orchestrationOverlays)
      .where(eq(orchestrationOverlays.workspaceId, workspaceId))
      .orderBy(desc(orchestrationOverlays.createdAt))
      .limit(limit);

    const byPhase: Record<string, number> = {};
    const byDomain: Record<string, number> = {};

    for (const overlay of overlays) {
      byPhase[overlay.phase] = (byPhase[overlay.phase] ?? 0) + 1;
      byDomain[overlay.domain] = (byDomain[overlay.domain] ?? 0) + 1;
    }

    return {
      total: overlays.length,
      byPhase,
      byDomain,
      recentOverlays: overlays.map(o => ({
        overlayId: o.id,
        workOrderId: o.workOrderId,
        phase: o.phase as OrchestrationPhase,
        domain: o.domain,
        confidenceScore: parseFloat(o.confidenceScore ?? '0'),
        phaseTransitionCount: o.phaseTransitionCount ?? 0,
        totalDurationMs: o.totalDurationMs,
        hasEscalation: o.requiresEscalation ?? false,
        permissionResult: o.permissionResult ?? 'pending',
        createdAt: o.createdAt,
        completedAt: o.completedAt,
      })),
    };
  }

  // =========================================================================
  // STATE MACHINE HELPERS
  // =========================================================================

  /**
   * Get valid phase transition map (for documentation/UI)
   */
  getTransitionMap(): Record<string, string[]> {
    return VALID_PHASE_TRANSITIONS;
  }

  /**
   * Check if a phase is terminal
   */
  isTerminalPhase(phase: string): boolean {
    return getAllowedNextPhases(phase).length === 0;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const orchestrationStateMachine = OrchestrationStateMachine.getInstance();
