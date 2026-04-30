/**
 * AI Brain Action Registry
 * ========================
 * Central registry that wires ALL AI Brain capabilities to executable actions.
 * This enables the orchestrator to execute any platform action through a unified interface.
 */

import { recordDeliberation } from './trinityEpisodicMemoryService';
import { 
  helpaiOrchestrator, 
  type ActionHandler, 
  type ActionRequest, 
  type ActionResult,
  type ActionCategory 
} from '../helpai/platformActionHub';
import { serviceController, featureToggleManager, consoleCommandExecutor, endUserBotSupport, supportStaffAssistant } from './orchestratorCapabilities';
import { db } from '../../db';
import { aiTokenGateway } from '../billing/aiTokenGateway';
import { TOKEN_COSTS } from '../billing/tokenManager';
import { FAST_MODE_TIERS, type FastModeTier } from './fastModeService';
import { eq, and, desc, gte, lte, sql, isNull } from 'drizzle-orm';
import {
  clientBillingSettings,
  employees,
  shifts,
  timeEntries,
  invoices,
  invoiceLineItems,
  paymentRecords,
  payrollRuns,
  clients,
  notifications,
  workspaces,
} from '@shared/schema';
import { universalNotificationEngine } from '../universalNotificationEngine';
import { broadcastShiftUpdate, broadcastToWorkspace } from '../../websocket';
import { assertWorkspaceActive } from '../../middleware/workspaceGuard';
import { typedExec, typedQuery } from '../../lib/typedSql';
import { NotificationDeliveryService } from '../notificationDeliveryService';
import { registerTrainingSessionActions } from './trinityTrainingSessionActions';
import { createLogger } from '../../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../billing/billingConstants';
import { logActionAudit } from './actionAuditLogger';
import { requiresFinancialApproval, actorMeetsApprovalRequirement } from './financialApprovalThresholds';
import { trinityDeliberationLoop } from './trinityDeliberationLoop';
const log = createLogger('actionRegistry');

// ============================================================================
// PHASE 19: DUAL-AI DELIBERATION GATE
// Mandatory gate for financial mutations (invoice void, payroll void/adjust).
// Uses the existing Trinity Prefrontal deliberation loop — any decision that
// returns `escalated` or `humanNotificationRequired` blocks autonomous execution.
// ============================================================================

async function requireDeliberationConsensus(params: {
  actionId: string;
  workspaceId: string;
  description: string;
  userId?: string;
}): Promise<{ allowed: true } | { allowed: false; reason: string; deliberationId: string }> {
  try {
    const decision = await trinityDeliberationLoop.deliberate({
      type: 'workspace_health_degraded',
      workspaceId: params.workspaceId,
      description: `[${params.actionId}] ${params.description}`.slice(0, 500),
      priority: 'high',
      sourceSystem: 'action_registry_gate',
      userId: params.userId,
    });
    if (decision.recommendedTier === 'escalated' || decision.humanNotificationRequired) {
      return {
        allowed: false,
        reason: `Dual-AI gate blocked ${params.actionId}: tier=${decision.recommendedTier}, risk=${decision.riskLevel} — ${decision.reasoning.slice(0, 200)}`,
        deliberationId: decision.deliberationId,
      };
    }
    return { allowed: true };
  } catch (err: any) {
    // Fail closed on a deliberation error — financial mutations must not run
    // when the reasoning loop itself is unavailable.
    return {
      allowed: false,
      reason: `Dual-AI gate unavailable: ${err?.message ?? 'unknown error'}`,
      deliberationId: 'unavailable',
    };
  }
}

// ============================================================================
// HELPER: Create ActionResult
// ============================================================================

function createResult(
  actionId: string, 
  success: boolean, 
  message: string, 
  data?: any,
  startTime?: number
): ActionResult {
  return {
    success,
    actionId,
    message,
    data,
    executionTimeMs: startTime ? Date.now() - startTime : 0,
  };
}

// ============================================================================
// AUDIT WRAP HELPER (Phase 18)
// Wraps any ActionHandler with logActionAudit on both success and failure paths.
// Do NOT use on handlers that already contain explicit logActionAudit calls.
// ============================================================================

function withAuditWrap(action: ActionHandler, entityType: string): ActionHandler {
  const originalHandler = action.handler;
  return {
    ...action,
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const result = await originalHandler(request);
        await logActionAudit({
          actionId: request.actionId,
          workspaceId: request.workspaceId,
          userId: request.userId,
          userRole: request.userRole,
          platformRole: request.platformRole,
          entityType,
          success: result.success,
          message: result.message,
          changesAfter: result.data,
          durationMs: Date.now() - start,
        });
        return result;
      } catch (err: any) {
        await logActionAudit({
          actionId: request.actionId,
          workspaceId: request.workspaceId,
          userId: request.userId,
          entityType,
          success: false,
          errorMessage: err?.message,
          payload: request.payload,
          durationMs: Date.now() - start,
        });
        throw err;
      }
    },
  };
}

// ============================================================================
// ACTION REGISTRY CLASS
// ============================================================================

class AIBrainActionRegistry {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Fix: check if it's already being initialized to prevent duplicate calls from module load + server/index.ts
    if ((global as any)._aiBrainActionRegistryInitializing) {
      log.info('[AI Brain Action Registry] Initialization already in progress, skipping duplicate call');
      return;
    }
    (global as any)._aiBrainActionRegistryInitializing = true;

    log.info('[AI Brain Action Registry] Initializing action registry...');

    // Register all action categories
    this.registerServiceActions();
    this.registerFeatureActions();
    this.registerSchedulingActions();
    this.registerPayrollActions();
    this.registerEmployeeActions();
    this.registerClientActions();
    this.registerTimeTrackingActions();
    this.registerNotificationActions();
    this.registerDirectActions(); // NEW: Direct autonomous actions
    this.registerBulkOperationActions();
    this.registerIntegrationActions();
    this.registerOnboardingActions();
    this.registerStrategicOptimizationActions();
    this.registerContractPipelineActions();
    this.registerMemoryOptimizationActions();
    this.registerBillingSettingsActions();
    this.registerInvoiceActions();
    this.registerFinancialStagingActions();
    registerTrainingSessionActions();
    this.registerDisciplinaryActions();

    this.initialized = true;
    (global as any)._aiBrainActionRegistryInitializing = false;
    log.info(`[AI Brain Action Registry] Initialization complete`);
  }

  // ============================================================================
  // SERVICE CONTROL ACTIONS
  // ============================================================================

  private registerServiceActions(): void {
    const getServiceStatus: ActionHandler = {
      actionId: 'services.get_status',
      name: 'Get Service Status',
      category: 'health_check',
      description: 'Get the status of a specific platform service',
      requiredRoles: ['support_agent', 'sysop', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const serviceName = request.payload?.serviceName;
        const status = await serviceController.getServiceStatus(serviceName);
        return createResult(request.actionId, true, `Service status retrieved`, status, start);
      },
    };

    const getAllServicesStatus: ActionHandler = {
      actionId: 'services.get_all_status',
      name: 'Get All Services Status',
      category: 'health_check',
      description: 'Get status of all platform services',
      requiredRoles: ['support_agent', 'sysop', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const statuses = await serviceController.getAllServicesStatus();
        return createResult(request.actionId, true, `All service statuses retrieved`, statuses, start);
      },
    };

    const restartService: ActionHandler = {
      actionId: 'services.restart',
      name: 'Restart Service',
      category: 'system',
      description: 'Restart a platform service',
      requiredRoles: ['sysop', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const serviceName = request.payload?.serviceName;
        try {
          const result = await serviceController.restartService(serviceName, request.userId);
          await logActionAudit({
            actionId: request.actionId,
            workspaceId: request.workspaceId,
            userId: request.userId,
            userRole: request.userRole,
            platformRole: request.platformRole,
            entityType: 'service',
            entityId: serviceName ?? null,
            success: result.success,
            message: result.message,
            errorMessage: result.success ? undefined : result.message,
            durationMs: Date.now() - start,
          });
          return createResult(request.actionId, result.success, result.message, null, start);
        } catch (err: any) {
          await logActionAudit({
            actionId: request.actionId,
            workspaceId: request.workspaceId,
            userId: request.userId,
            entityType: 'service',
            entityId: serviceName ?? null,
            success: false,
            errorMessage: err?.message,
            durationMs: Date.now() - start,
          });
          throw err;
        }
      },
    };

    helpaiOrchestrator.registerAction(withAuditWrap(getServiceStatus, 'service'));
    helpaiOrchestrator.registerAction(withAuditWrap(getAllServicesStatus, 'service'));
    helpaiOrchestrator.registerAction(withAuditWrap(restartService, 'service'));
  }

  // ============================================================================
  // FEATURE TOGGLE ACTIONS
  // ============================================================================

  private registerFeatureActions(): void {
    const getFeature: ActionHandler = {
      actionId: 'features.get',
      name: 'Get Feature Toggle',
      category: 'system',
      description: 'Get the current state of a feature toggle',
      requiredRoles: ['support_agent', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const featurePath = request.payload?.featurePath;
        const value = await featureToggleManager.getToggle(featurePath);
        return createResult(request.actionId, true, `Feature toggle retrieved`, { path: featurePath, enabled: value }, start);
      },
    };

    const setFeature: ActionHandler = {
      actionId: 'features.set',
      name: 'Set Feature Toggle',
      category: 'system',
      description: 'Enable or disable a feature',
      requiredRoles: ['deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        try {
          const result = await featureToggleManager.setToggle({
            featurePath: request.payload?.featurePath,
            enabled: request.payload?.enabled,
            reason: request.payload?.reason || 'AI Brain action',
            userId: request.userId,
            workspaceId: request.workspaceId,
          });
          await logActionAudit({
            actionId: request.actionId,
            workspaceId: request.workspaceId,
            userId: request.userId,
            userRole: request.userRole,
            platformRole: request.platformRole,
            entityType: 'feature_toggle',
            entityId: request.payload?.featurePath ?? null,
            success: true,
            message: `Feature toggle updated: ${request.payload?.featurePath}=${request.payload?.enabled}`,
            changesAfter: result as any,
            durationMs: Date.now() - start,
          });
          return createResult(request.actionId, true, `Feature toggle updated`, result, start);
        } catch (err: any) {
          await logActionAudit({
            actionId: request.actionId,
            workspaceId: request.workspaceId,
            userId: request.userId,
            entityType: 'feature_toggle',
            entityId: request.payload?.featurePath ?? null,
            success: false,
            errorMessage: err?.message,
            payload: request.payload,
            durationMs: Date.now() - start,
          });
          throw err;
        }
      },
    };

    const listFeatures: ActionHandler = {
      actionId: 'features.list',
      name: 'List All Features',
      category: 'system',
      description: 'List all available feature toggles',
      requiredRoles: ['support_agent', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const features = await featureToggleManager.listAllFeatures();
        return createResult(request.actionId, true, `Feature list retrieved`, features, start);
      },
    };

    helpaiOrchestrator.registerAction(withAuditWrap(getFeature, 'feature'));
    helpaiOrchestrator.registerAction(withAuditWrap(setFeature, 'feature'));
    helpaiOrchestrator.registerAction(withAuditWrap(listFeatures, 'feature'));
  }

  // ============================================================================
  // SCHEDULING ACTIONS
  // ============================================================================

  private registerSchedulingActions(): void {
    const createShift: ActionHandler = {
      actionId: 'scheduling.create_shift',
      name: 'Create Shift',
      category: 'scheduling',
      description: 'Create a new shift for an employee',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        try {
          const [shift] = await db.insert(shifts).values({
            workspaceId: request.workspaceId!,
            employeeId: request.payload?.employeeId,
            startTime: new Date(request.payload?.startTime),
            endTime: new Date(request.payload?.endTime),
            title: request.payload?.title,
            description: request.payload?.description,
            status: 'scheduled',
          }).returning();
          await logActionAudit({
            actionId: request.actionId,
            workspaceId: request.workspaceId,
            userId: request.userId,
            userRole: request.userRole,
            platformRole: request.platformRole,
            entityType: 'shift',
            entityId: (shift as any)?.id ?? null,
            success: true,
            message: 'Shift created',
            changesAfter: shift as any,
            durationMs: Date.now() - start,
          });
          return createResult(request.actionId, true, `Shift created`, shift, start);
        } catch (err: any) {
          await logActionAudit({
            actionId: request.actionId,
            workspaceId: request.workspaceId,
            userId: request.userId,
            userRole: request.userRole,
            platformRole: request.platformRole,
            entityType: 'shift',
            success: false,
            errorMessage: err?.message ?? 'Shift create failed',
            payload: request.payload,
            durationMs: Date.now() - start,
          });
          throw err;
        }
      },
    };

    const getShifts: ActionHandler = {
      actionId: 'scheduling.get_shifts',
      name: 'Get Shifts',
      category: 'scheduling',
      description: 'Get shifts for a date range',
      requiredRoles: ['system', 'employee', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const shiftList = await db.query.shifts.findMany({
          where: and(
            eq(shifts.workspaceId, request.workspaceId!),
            gte(shifts.startTime, new Date(request.payload?.startDate)),
            lte(shifts.endTime, new Date(request.payload?.endDate))
          ),
        });
        return createResult(request.actionId, true, `Shifts retrieved`, shiftList, start);
      },
    };

    // Create Open Shift and Auto-Fill with Trinity (with live streaming progress)
    const createOpenShiftAndFill: ActionHandler = {
      actionId: 'scheduling.create_open_shift_fill',
      name: 'Create Open Shift & Auto-Fill',
      category: 'scheduling',
      description: 'Create an open shift and have Trinity automatically find the best employee match with live progress streaming',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { schedulingSubagent } = await import('./subagents/schedulingSubagent');
        
        try {
          // Determine execution mode and credit multiplier
          const executionMode = (request.payload?.executionMode as FastModeTier | 'normal') || 'normal';
          const baseCost = TOKEN_COSTS.ai_open_shift_fill;
          let creditMultiplier = 1.0;
          
          if (executionMode !== 'normal' && FAST_MODE_TIERS[executionMode as FastModeTier]) {
            creditMultiplier = FAST_MODE_TIERS[executionMode as FastModeTier].creditMultiplier;
          }
          
          const totalCredits = Math.ceil(baseCost * creditMultiplier);
          
          // Check and deduct credits before proceeding (with multiplier for FAST modes)
          const creditAuth = await aiTokenGateway.preAuthorize(request.workspaceId!, request.userId, 'ai_open_shift_fill');
          
          if (!creditAuth.authorized) {
            return createResult(request.actionId, false, 
              creditAuth.reason || 'Insufficient credits for AI scheduling', 
              { creditsRequired: totalCredits, executionMode },
              start
            );
          }
          
          // Step 1: Create the open shift FIRST — only bill after mutation succeeds
          const [openShift] = await db.insert(shifts).values({
            workspaceId: request.workspaceId!,
            employeeId: null, // Open shift - no employee yet
            clientId: request.payload?.clientId || null,
            startTime: new Date(request.payload?.startTime),
            endTime: new Date(request.payload?.endTime),
            title: request.payload?.title || 'Open Shift',
            description: request.payload?.description || 'Auto-filling with Trinity AI',
            status: 'draft',
            aiGenerated: true,
          }).returning();

          // Bill AFTER shift is created — credits are only deducted on successful mutation
          await aiTokenGateway.finalizeBilling(request.workspaceId!, request.userId, 'ai_open_shift_fill', totalCredits);
          log.info(`[ActionRegistry] Charged ${totalCredits} credits for open shift fill (${executionMode} mode)`);
          const { UsageMeteringService } = await import('../billing/usageMetering');
          const usageMeteringService = new UsageMeteringService();
          await usageMeteringService.recordUsage({
            workspaceId: request.workspaceId!,
            userId: request.userId,
            featureKey: 'ai_open_shift_fill',
            usageType: 'activity',
            usageAmount: totalCredits,
            usageUnit: 'credits',
            metadata: { executionMode, baseCost, creditMultiplier, totalCredits, actionId: request.actionId },
            skipBillingDeduction: true,
            emitEvent: false,
          });
          
          broadcastToWorkspace(request.workspaceId!, {
            type: 'trinity_scheduling_progress',
            data: {
              shiftId: openShift.id,
              step: 'analyzing',
              message: 'I\'m analyzing available employees...',
              progress: 20,
              executionMode,
              tokensUsed: totalCredits,
            }
          });
          
          // Step 2: Get strategic schedule for this shift
          const shiftDuration = (new Date(request.payload?.endTime).getTime() - new Date(request.payload?.startTime).getTime()) / (1000 * 60 * 60);
          
          broadcastToWorkspace(request.workspaceId!, {
            type: 'trinity_scheduling_progress',
            data: {
              shiftId: openShift.id,
              step: 'matching',
              message: 'Finding best employee match using AI optimization...',
              progress: 50,
            }
          });
          
          const result = await schedulingSubagent.generateStrategicSchedule(
            request.workspaceId!,
            [{
              shiftId: openShift.id,
              clientId: request.payload?.clientId || '',
              date: new Date(request.payload?.startTime),
              startTime: request.payload?.startTime,
              endTime: request.payload?.endTime,
              durationHours: shiftDuration,
            }]
          );
          
          // Step 3: Apply the best assignment
          if (result.schedule.length > 0) {
            const assignment = result.schedule[0];
            
            broadcastToWorkspace(request.workspaceId!, {
              type: 'trinity_scheduling_progress',
              data: {
                shiftId: openShift.id,
                step: 'assigning',
                message: `Assigning to ${assignment.employeeName} (score: ${(assignment as any).assignment.toFixed(0)})...`,
                progress: 80,
                assignedEmployee: {
                  id: assignment.employeeId,
                  name: assignment.employeeName,
                  score: assignment.assignment,
                },
              }
            });
            
            // G21-pattern FIX: Atomic conditional UPDATE — only succeeds if shift is
            // still unassigned. A concurrent request that already claimed this shift
            // will cause RETURNING to be empty; we skip the broadcast in that case.
            const [filledShift] = await db.update(shifts)
              .set({
                employeeId: assignment.employeeId,
                status: 'scheduled',
                aiConfidenceScore: String(result.confidence.score),
                updatedAt: new Date(),
              })
              .where(and(eq(shifts.id, openShift.id), isNull(shifts.employeeId)))
              .returning();
            
            // Broadcast: Shift filled successfully
            if (!filledShift) {
              // Concurrent assignment already claimed this shift — skip broadcasts
              return createResult(request.actionId, false,
                `Shift ${openShift.id} was already assigned by a concurrent request (ALREADY_ASSIGNED)`,
                { shiftId: openShift.id },
                start
              );
            }

            broadcastToWorkspace(request.workspaceId!, {
              type: 'trinity_scheduling_progress',
              data: {
                shiftId: openShift.id,
                step: 'complete',
                message: `Shift assigned to ${assignment.employeeName}!`,
                progress: 100,
                shift: filledShift,
                businessMetrics: result.businessMetrics,
              }
            });
            
            // Also broadcast standard shift update for cross-device sync
            broadcastShiftUpdate(request.workspaceId!, 'shift_created', filledShift);
            
            await logActionAudit({
              actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
              userRole: request.userRole, platformRole: request.platformRole,
              entityType: 'shift', entityId: (filledShift as any)?.id ?? openShift.id,
              success: true, message: `Open shift filled: assigned to ${assignment.employeeName}`,
              changesAfter: filledShift as any, durationMs: Date.now() - start,
            });
            return createResult(request.actionId, true,
              `Open shift created and assigned to ${assignment.employeeName} with ${(result.confidence.score * 100).toFixed(0)}% confidence`,
              { shift: filledShift, assignment, businessMetrics: result.businessMetrics, strategicDecisions: result.strategicDecisions },
              start
            );
          } else {
            // No suitable employee found
            broadcastToWorkspace(request.workspaceId!, {
              type: 'trinity_scheduling_progress',
              data: {
                shiftId: openShift.id,
                step: 'no_match',
                message: 'No suitable employee available for this shift',
                progress: 100,
                shift: openShift,
              }
            });

            broadcastShiftUpdate(request.workspaceId!, 'shift_created', openShift);

            await logActionAudit({
              actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
              userRole: request.userRole, platformRole: request.platformRole,
              entityType: 'shift', entityId: openShift.id,
              success: true, message: 'Open shift created — no suitable employee found, shift remains open',
              changesAfter: openShift as any, durationMs: Date.now() - start,
            });
            return createResult(request.actionId, true,
              'Open shift created but no suitable employee found - shift remains open',
              { shift: openShift, alerts: result.alerts },
              start
            );
          }
        } catch (error: any) {
          log.error('[ActionRegistry] Create open shift fill error:', error);
          await logActionAudit({
            actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
            entityType: 'shift', entityId: null,
            success: false, errorMessage: error instanceof Error ? error.message : String(error),
            payload: request.payload, durationMs: Date.now() - start,
          });
          return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)) || 'Failed to create and fill shift', null, start);
        }
      },
    };

    // ============================================================================
    // PHASE 19: SCHEDULING MUTATION ACTIONS
    // update, delete, cancel, publish, bulk_publish, reassign
    // ============================================================================

    const updateShift: ActionHandler = {
      actionId: 'scheduling.update_shift',
      name: 'Update Shift',
      category: 'scheduling',
      description: 'Update an existing shift — change time, assigned employee, or status. Requires shift ID.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { shiftId, startTime, endTime, employeeId, status, notes } = request.payload || {};
        const workspaceId = request.workspaceId;

        if (!shiftId) return createResult(request.actionId, false, 'shiftId required', null, start);
        if (!workspaceId) return createResult(request.actionId, false, 'workspaceId required', null, start);

        const updateSet: Record<string, any> = { updatedAt: new Date() };
        if (startTime) updateSet.startTime = new Date(startTime);
        if (endTime) updateSet.endTime = new Date(endTime);
        if (employeeId !== undefined) updateSet.employeeId = employeeId;
        if (status) updateSet.status = status;
        if (notes) updateSet.description = notes;
        if (Object.keys(updateSet).length === 1) {
          return createResult(request.actionId, false, 'No fields to update', null, start);
        }

        const [updated] = await db.update(shifts)
          .set(updateSet)
          .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)))
          .returning();

        if (!updated) return createResult(request.actionId, false, 'Shift not found or access denied', null, start);

        broadcastShiftUpdate(workspaceId, 'shift_updated', updated);
        return createResult(request.actionId, true, 'Shift updated', updated, start);
      },
    };

    const deleteShift: ActionHandler = {
      actionId: 'scheduling.delete_shift',
      name: 'Delete Shift',
      category: 'scheduling',
      description: 'Delete a shift. Cannot delete shifts with clock-in records — cancel instead.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { shiftId, reason } = request.payload || {};
        const workspaceId = request.workspaceId;

        if (!shiftId) return createResult(request.actionId, false, 'shiftId required', null, start);
        if (!reason) return createResult(request.actionId, false, 'reason required for audit log', null, start);
        if (!workspaceId) return createResult(request.actionId, false, 'workspaceId required', null, start);

        // GAP-SCHED-1: block deletion if any time entries exist for this shift
        const [existingEntry] = await db.select({ id: timeEntries.id })
          .from(timeEntries)
          .where(and(eq(timeEntries.shiftId, shiftId), eq(timeEntries.workspaceId, workspaceId)))
          .limit(1);
        if (existingEntry) {
          return createResult(request.actionId, false,
            'Cannot delete shift — clock-in records exist. Cancel the shift instead.', null, start);
        }

        const [existing] = await db.select().from(shifts)
          .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)))
          .limit(1);
        if (!existing) return createResult(request.actionId, false, 'Shift not found', null, start);

        await db.delete(shifts)
          .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)));

        broadcastShiftUpdate(workspaceId, 'shift_deleted', undefined, shiftId);
        return createResult(request.actionId, true, `Shift deleted (reason: ${reason})`, { shiftId, reason }, start);
      },
    };

    const cancelShift: ActionHandler = {
      actionId: 'scheduling.cancel_shift',
      name: 'Cancel Shift',
      category: 'scheduling',
      description: 'Cancel a shift without deleting it. Status becomes cancelled; assigned employee is notified.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { shiftId, reason } = request.payload || {};
        const workspaceId = request.workspaceId;

        if (!shiftId) return createResult(request.actionId, false, 'shiftId required', null, start);
        if (!reason) return createResult(request.actionId, false, 'reason required', null, start);
        if (!workspaceId) return createResult(request.actionId, false, 'workspaceId required', null, start);

        const [updated] = await db.update(shifts)
          .set({ status: 'cancelled', denialReason: reason, updatedAt: new Date() })
          .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)))
          .returning();

        if (!updated) return createResult(request.actionId, false, 'Shift not found', null, start);

        broadcastShiftUpdate(workspaceId, 'shift_updated', updated);
        return createResult(request.actionId, true, 'Shift cancelled', updated, start);
      },
    };

    const publishShift: ActionHandler = {
      actionId: 'scheduling.publish_shift',
      name: 'Publish Shift',
      category: 'scheduling',
      description: 'Publish a draft shift, making it visible to employees.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { shiftId } = request.payload || {};
        const workspaceId = request.workspaceId;

        if (!shiftId) return createResult(request.actionId, false, 'shiftId required', null, start);
        if (!workspaceId) return createResult(request.actionId, false, 'workspaceId required', null, start);

        const [updated] = await db.update(shifts)
          .set({ status: 'scheduled', updatedAt: new Date() })
          .where(and(
            eq(shifts.id, shiftId),
            eq(shifts.workspaceId, workspaceId),
            eq(shifts.status, 'draft'),
          ))
          .returning();

        if (!updated) return createResult(request.actionId, false, 'Draft shift not found (already published?)', null, start);

        broadcastShiftUpdate(workspaceId, 'shift_updated', updated);
        return createResult(request.actionId, true, 'Shift published', updated, start);
      },
    };

    const bulkPublish: ActionHandler = {
      actionId: 'scheduling.bulk_publish',
      name: 'Bulk Publish Shifts',
      category: 'scheduling',
      description: 'Publish multiple draft shifts at once. Accepts shiftIds array, or publishes all drafts when omitted.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { shiftIds, weekOf } = request.payload || {};
        const workspaceId = request.workspaceId;

        if (!workspaceId) return createResult(request.actionId, false, 'workspaceId required', null, start);

        const conditions = [
          eq(shifts.workspaceId, workspaceId),
          eq(shifts.status, 'draft'),
        ];
        if (Array.isArray(shiftIds) && shiftIds.length > 0) {
          conditions.push(sql`${shifts.id} = ANY(${shiftIds})`);
        }
        if (weekOf) {
          const weekStart = new Date(weekOf);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekEnd.getDate() + 7);
          conditions.push(gte(shifts.startTime, weekStart));
          conditions.push(lte(shifts.startTime, weekEnd));
        }

        const published = await db.update(shifts)
          .set({ status: 'scheduled', updatedAt: new Date() })
          .where(and(...conditions))
          .returning({ id: shifts.id });

        broadcastToWorkspace(workspaceId, {
          type: 'schedule_published',
          count: published.length,
          shiftIds: published.map(s => s.id),
        });
        return createResult(request.actionId, true, `Published ${published.length} shift(s)`, { count: published.length, shiftIds: published.map(s => s.id) }, start);
      },
    };

    const reassignShift: ActionHandler = {
      actionId: 'scheduling.reassign_shift',
      name: 'Reassign Shift',
      category: 'scheduling',
      description: 'Reassign a shift from one employee to another. Broadcasts update so both employees see the change.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { shiftId, newEmployeeId, reason } = request.payload || {};
        const workspaceId = request.workspaceId;

        if (!shiftId) return createResult(request.actionId, false, 'shiftId required', null, start);
        if (!newEmployeeId) return createResult(request.actionId, false, 'newEmployeeId required', null, start);
        if (!workspaceId) return createResult(request.actionId, false, 'workspaceId required', null, start);

        const [existing] = await db.select({ id: shifts.id, employeeId: shifts.employeeId })
          .from(shifts)
          .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)))
          .limit(1);
        if (!existing) return createResult(request.actionId, false, 'Shift not found', null, start);

        const [updated] = await db.update(shifts)
          .set({ employeeId: newEmployeeId, updatedAt: new Date() })
          .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)))
          .returning();

        if (!updated) return createResult(request.actionId, false, 'Reassignment failed', null, start);

        broadcastShiftUpdate(workspaceId, 'shift_updated', updated);
        return createResult(
          request.actionId,
          true,
          `Shift reassigned from ${existing.employeeId ?? 'open'} to ${newEmployeeId}${reason ? ` (reason: ${reason})` : ''}`,
          { shift: updated, previousEmployeeId: existing.employeeId, newEmployeeId },
          start,
        );
      },
    };

    helpaiOrchestrator.registerAction(createShift); // explicit audit inside handler
    helpaiOrchestrator.registerAction(withAuditWrap(getShifts, 'shift'));
    helpaiOrchestrator.registerAction(withAuditWrap(createOpenShiftAndFill, 'shift'));
    helpaiOrchestrator.registerAction(withAuditWrap(updateShift, 'shift'));
    helpaiOrchestrator.registerAction(withAuditWrap(deleteShift, 'shift'));
    helpaiOrchestrator.registerAction(withAuditWrap(cancelShift, 'shift'));
    helpaiOrchestrator.registerAction(withAuditWrap(publishShift, 'shift'));
    helpaiOrchestrator.registerAction(withAuditWrap(bulkPublish, 'shift'));
    helpaiOrchestrator.registerAction(withAuditWrap(reassignShift, 'shift'));
  }

  // ============================================================================
  // PAYROLL ACTIONS
  // ============================================================================

  private registerPayrollActions(): void {
    const getPayrollRuns: ActionHandler = {
      actionId: 'payroll.get_runs',
      name: 'Get Payroll Runs',
      category: 'payroll',
      description: 'Get payroll runs for a workspace',
      requiredRoles: ['system', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const runs = await db.query.payrollRuns.findMany({
          where: eq(payrollRuns.workspaceId, request.workspaceId!),
          orderBy: [desc(payrollRuns.createdAt)],
          limit: request.payload?.limit || 10,
        });
        return createResult(request.actionId, true, `Payroll runs retrieved`, runs, start);
      },
    };

    helpaiOrchestrator.registerAction(withAuditWrap(getPayrollRuns, 'payroll_run'));
  }

  // ============================================================================
  // EMPLOYEE ACTIONS
  // ============================================================================

  private registerEmployeeActions(): void {
    const listEmployees: ActionHandler = {
      actionId: 'employees.list',
      name: 'List Employees',
      category: 'scheduling',
      description: 'List all employees in a workspace',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const employeeList = await db.query.employees.findMany({
          where: eq(employees.workspaceId, request.workspaceId!),
        });
        return createResult(request.actionId, true, `Employees retrieved`, employeeList, start);
      },
    };

    const getEmployee: ActionHandler = {
      actionId: 'employees.get',
      name: 'Get Employee',
      category: 'scheduling',
      description: 'Get a specific employee by ID',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const employee = await db.query.employees.findFirst({
          where: and(
            eq(employees.id, request.payload?.employeeId),
            eq(employees.workspaceId, request.workspaceId!)
          ),
        });
        if (!employee) return createResult(request.actionId, false, 'Employee not found in this workspace', null, start);
        return createResult(request.actionId, true, `Employee retrieved`, employee, start);
      },
    };

    const activateEmployee: ActionHandler = {
      actionId: 'employees.activate',
      name: 'Activate Employee',
      category: 'scheduling',
      description: 'Activate an employee account - restore their access to the platform',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        try {
          const [updated] = await db.update(employees)
            .set({ isActive: true })
            .where(and(eq(employees.id, request.payload?.employeeId), eq(employees.workspaceId, request.workspaceId!)))
            .returning();
          if (!updated) {
            await logActionAudit({
              actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
              userRole: request.userRole, platformRole: request.platformRole,
              entityType: 'employee', entityId: request.payload?.employeeId ?? null,
              success: false, errorMessage: 'Employee not found', durationMs: Date.now() - start,
            });
            return createResult(request.actionId, false, 'Employee not found', null, start);
          }
          await logActionAudit({
            actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
            userRole: request.userRole, platformRole: request.platformRole,
            entityType: 'employee', entityId: (updated as any).id,
            success: true, message: `Employee ${updated.firstName} ${updated.lastName} activated`,
            changesAfter: updated as any, durationMs: Date.now() - start,
          });
          return createResult(request.actionId, true, `${updated.firstName} ${updated.lastName} has been activated`, updated, start);
        } catch (err: any) {
          await logActionAudit({
            actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
            entityType: 'employee', entityId: request.payload?.employeeId ?? null,
            success: false, errorMessage: err?.message, durationMs: Date.now() - start,
          });
          throw err;
        }
      },
    };

    const deactivateEmployee: ActionHandler = {
      actionId: 'employees.deactivate',
      name: 'Deactivate Employee',
      category: 'scheduling',
      description: 'Deactivate an employee account - revoke their access without deleting records',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        try {
          const [updated] = await db.update(employees)
            .set({ isActive: false })
            .where(and(eq(employees.id, request.payload?.employeeId), eq(employees.workspaceId, request.workspaceId!)))
            .returning();
          if (!updated) {
            await logActionAudit({
              actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
              userRole: request.userRole, platformRole: request.platformRole,
              entityType: 'employee', entityId: request.payload?.employeeId ?? null,
              success: false, errorMessage: 'Employee not found', durationMs: Date.now() - start,
            });
            return createResult(request.actionId, false, 'Employee not found', null, start);
          }
          await logActionAudit({
            actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
            userRole: request.userRole, platformRole: request.platformRole,
            entityType: 'employee', entityId: (updated as any).id,
            success: true, message: `Employee ${updated.firstName} ${updated.lastName} deactivated`,
            changesAfter: updated as any, durationMs: Date.now() - start,
          });
          return createResult(request.actionId, true, `${updated.firstName} ${updated.lastName} has been deactivated`, updated, start);
        } catch (err: any) {
          await logActionAudit({
            actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
            entityType: 'employee', entityId: request.payload?.employeeId ?? null,
            success: false, errorMessage: err?.message, durationMs: Date.now() - start,
          });
          throw err;
        }
      },
    };

    const updateEmployee: ActionHandler = {
      actionId: 'employees.update',
      name: 'Update Employee',
      category: 'scheduling',
      description: 'Update employee details such as pay rate, position, phone, email, or other profile fields',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { employeeId, ...updates } = request.payload || {};
        if (!employeeId) return createResult(request.actionId, false, 'Employee ID required', null, start);
        const safeFields: Record<string, any> = {};
        const allowed = ['firstName', 'lastName', 'email', 'phone', 'position', 'payRate', 'payType', 'department'];
        for (const key of allowed) {
          if (updates[key] !== undefined) safeFields[key] = updates[key];
        }
        if (Object.keys(safeFields).length === 0) return createResult(request.actionId, false, 'No valid fields to update', null, start);
        const [before] = await db.select().from(employees)
          .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, request.workspaceId!)))
          .limit(1);
        const [updated] = await db.update(employees)
          .set(safeFields)
          .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, request.workspaceId!)))
          .returning();
        if (!updated) {
          await logActionAudit({
            actionId: request.actionId,
            workspaceId: request.workspaceId,
            userId: request.userId,
            userRole: request.userRole,
            platformRole: request.platformRole,
            entityType: 'employee',
            entityId: employeeId,
            success: false,
            errorMessage: 'Employee not found',
            durationMs: Date.now() - start,
          });
          return createResult(request.actionId, false, 'Employee not found', null, start);
        }
        await logActionAudit({
          actionId: request.actionId,
          workspaceId: request.workspaceId,
          userId: request.userId,
          userRole: request.userRole,
          platformRole: request.platformRole,
          entityType: 'employee',
          entityId: employeeId,
          success: true,
          message: 'Employee updated',
          changesBefore: before as any,
          changesAfter: updated as any,
          durationMs: Date.now() - start,
        });
        return createResult(request.actionId, true, `Employee ${updated.firstName} ${updated.lastName} updated`, updated, start);
      },
    };

    // employees.create — Phase 1 CRUD gap fill
    const createEmployee: ActionHandler = {
      actionId: 'employees.create',
      name: 'Create Employee',
      category: 'scheduling',
      description: 'Create a new employee record in the workspace',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { firstName, lastName, email, phone, position, role, payRate, payType, department } = request.payload || {};
        if (!firstName || !lastName) return createResult(request.actionId, false, 'firstName and lastName are required', null, start);
        if (!request.workspaceId) return createResult(request.actionId, false, 'workspaceId required', null, start);
        await assertWorkspaceActive(request.workspaceId, { bypassForSystemActor: true });

        const [created] = await db.insert(employees).values({
          workspaceId: request.workspaceId,
          firstName,
          lastName,
          email: email || null,
          phone: phone || null,
          position: position || null,
          role: role || 'employee',
          hourlyRate: payRate ? String(payRate) : null,
          payType: payType || 'hourly',
          department: department || null,
          isActive: true,
        } as any).returning();

        if (!created) {
          await logActionAudit({
            actionId: request.actionId,
            workspaceId: request.workspaceId,
            userId: request.userId,
            userRole: request.userRole,
            platformRole: request.platformRole,
            entityType: 'employee',
            success: false,
            errorMessage: 'Failed to create employee',
            payload: { firstName, lastName, email },
            durationMs: Date.now() - start,
          });
          return createResult(request.actionId, false, 'Failed to create employee', null, start);
        }

        // Publish employee_hired event
        try {
          const { platformEventBus } = await import('../platformEventBus');
          await platformEventBus.publish({
            type: 'employee_hired',
            workspaceId: request.workspaceId,
            title: 'Employee Created',
            description: `New employee ${firstName} ${lastName} added`,
            metadata: { employeeId: (created as any).id, createdBy: request.userId },
          } as any);
        } catch (err) {
          log.warn('[employees.create] event publish failed (non-fatal):', err);
        }

        await logActionAudit({
          actionId: request.actionId,
          workspaceId: request.workspaceId,
          userId: request.userId,
          userRole: request.userRole,
          platformRole: request.platformRole,
          entityType: 'employee',
          entityId: (created as any).id,
          success: true,
          message: 'Employee created',
          changesAfter: created as any,
          durationMs: Date.now() - start,
        });

        return createResult(request.actionId, true, `Employee ${firstName} ${lastName} created`, created, start);
      },
    };

    const getEmployeeLifecycleHistory: ActionHandler = {
      actionId: 'employee.lifecycle.history',
      name: 'Get Employee Lifecycle History',
      category: 'workforce',
      description: 'Retrieve the full lifecycle audit history for an officer — all state transitions (activated, suspended, terminated, rehired) with actor, reason, and timestamp. Payload: employeeId (required), limit (optional, default 50).',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin', 'compliance_officer'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { employeeId, limit = 50 } = request.payload || {};
        if (!employeeId) {
          return createResult(request.actionId, false, 'employeeId is required', null, start);
        }
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const { universalAuditService } = await import('../universalAuditService');
        const history = await universalAuditService.getEntityHistory('employee', employeeId, request.workspaceId, limit);
        const lifecycleEvents = history.filter((e: any) =>
          ['employee.activated', 'employee.suspended', 'employee.terminated', 'employee.rehired', 'employee.deactivated', 'employee.reactivated'].includes(e.action)
        );
        return createResult(request.actionId, true, `Lifecycle history retrieved for employee ${employeeId}`, { employeeId, total: lifecycleEvents.length, history: lifecycleEvents }, start);
      },
    };

    const getClientLifecycleHistory: ActionHandler = {
      actionId: 'client.lifecycle.history',
      name: 'Get Client Lifecycle History',
      category: 'invoicing',
      description: 'Retrieve the full lifecycle audit history for a client — onboarding, suspension, offboarding events with actor, reason, and timestamp. Payload: clientId (required), limit (optional, default 50).',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin', 'compliance_officer'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { clientId, limit = 50 } = request.payload || {};
        if (!clientId) {
          return createResult(request.actionId, false, 'clientId is required', null, start);
        }
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const { universalAuditService } = await import('../universalAuditService');
        const history = await universalAuditService.getEntityHistory('client', clientId, request.workspaceId, limit);
        return createResult(request.actionId, true, `Lifecycle history retrieved for client ${clientId}`, { clientId, total: history.length, history }, start);
      },
    };

    helpaiOrchestrator.registerAction(withAuditWrap(listEmployees, 'employee'));
    helpaiOrchestrator.registerAction(withAuditWrap(getEmployee, 'employee'));
    helpaiOrchestrator.registerAction(createEmployee); // explicit audit inside handler
    helpaiOrchestrator.registerAction(withAuditWrap(activateEmployee, 'employee'));
    helpaiOrchestrator.registerAction(withAuditWrap(deactivateEmployee, 'employee'));
    helpaiOrchestrator.registerAction(updateEmployee); // explicit audit inside handler
    helpaiOrchestrator.registerAction(withAuditWrap(getEmployeeLifecycleHistory, 'employee'));
    helpaiOrchestrator.registerAction(withAuditWrap(getClientLifecycleHistory, 'client'));
  }

  // ============================================================================
  // CLIENT ACTIONS
  // ============================================================================

  private registerClientActions(): void {
    const listClients: ActionHandler = {
      actionId: 'clients.list',
      name: 'List Clients',
      category: 'invoicing',
      description: 'List all clients in a workspace',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const clientList = await db.query.clients.findMany({
          where: eq(clients.workspaceId, request.workspaceId!),
        });
        return createResult(request.actionId, true, `Clients retrieved`, clientList, start);
      },
    };

    helpaiOrchestrator.registerAction(withAuditWrap(listClients, 'client'));

    const createClient: ActionHandler = {
      actionId: 'clients.create',
      name: 'Create Client',
      category: 'invoicing',
      description: 'Create a new client in the workspace — Trinity can pre-fill all fields from context (email, conversation, or staffing request). Payload: firstName, lastName, companyName, email, phone, address, city, state, postalCode, contractRate, billingEmail, notes.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const p = request.payload || {};
        if (!p.firstName || !p.lastName) {
          return createResult(request.actionId, false, 'firstName and lastName are required to create a client', null, start);
        }
        const clientId = `cli_${Date.now()}`;
        const [newClient] = await db.insert(clients).values({
          id: clientId,
          workspaceId: request.workspaceId!,
          firstName: p.firstName,
          lastName: p.lastName,
          companyName: p.companyName || null,
          email: p.email || null,
          phone: p.phone || null,
          address: p.address || null,
          city: p.city || null,
          state: p.state || null,
          postalCode: p.postalCode || null,
          billingEmail: p.billingEmail || p.email || null,
          contractRate: p.contractRate ? String(p.contractRate) : null,
          category: p.category || 'other',
          isActive: true,
        }).returning();
        await universalNotificationEngine.sendNotification({
          workspaceId: request.workspaceId!,
          idempotencyKey: `notif-${Date.now()}`,
          type: 'client_created',
          title: 'New Client Added',
          message: `${p.companyName || `${p.firstName} ${p.lastName}`} has been created as a client by Trinity.`,
          metadata: { clientId, createdBy: 'trinity' },
          severity: 'info',
        });
        await logActionAudit({
          actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
          userRole: request.userRole, platformRole: request.platformRole,
          entityType: 'client', entityId: clientId,
          success: true, message: `Client ${p.companyName || `${p.firstName} ${p.lastName}`} created`,
          changesAfter: newClient as any, durationMs: Date.now() - start,
        });
        return createResult(request.actionId, true, `Client "${p.companyName || `${p.firstName} ${p.lastName}`}" created successfully`, { client: newClient, clientId }, start);
      },
    };

    const createPortalInvite: ActionHandler = {
      actionId: 'clients.create_portal_invite',
      name: 'Send Client Portal Invite',
      category: 'invoicing',
      description: 'Send a portal invitation email to a client so they can create their account and access the client portal. Payload: clientId, email (required), clientName.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const p = request.payload || {};
        if (!p.email) {
          return createResult(request.actionId, false, 'email is required to send portal invite', null, start);
        }
        await NotificationDeliveryService.send({ type: 'client_welcome', workspaceId: request.workspaceId || 'system', recipientUserId: p.clientId || p.email, channel: 'email', body: { to: p.email, subject: `You've been invited to the client portal`, html: `<p>Hello ${p.clientName || 'there'},</p><p>You've been set up as a client in our staffing platform. You can access your portal to view schedules, invoices, and service summaries.</p><p>If you have any questions, simply reply to this email and our team will assist you.</p><p>— Trinity, CoAIleague Staffing Intelligence</p>` } });
        await universalNotificationEngine.sendNotification({
          workspaceId: request.workspaceId!,
          idempotencyKey: `notif-${Date.now()}`,
          type: 'client_invited',
          title: 'Client Portal Invite Sent',
          message: `Portal invitation sent to ${p.email}`,
          metadata: { clientId: p.clientId, email: p.email },
          severity: 'info',
        });
        await logActionAudit({
          actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
          userRole: request.userRole, platformRole: request.platformRole,
          entityType: 'client', entityId: p.clientId ?? null,
          success: true, message: `Portal invite sent to ${p.email}`,
          payload: { email: p.email, clientId: p.clientId } as any, durationMs: Date.now() - start,
        });
        return createResult(request.actionId, true, `Portal invite sent to ${p.email}`, { email: p.email, clientId: p.clientId }, start);
      },
    };

    const scanOpenShifts: ActionHandler = {
      actionId: 'scheduling.scan_open_shifts',
      name: 'Scan Open Shifts',
      category: 'scheduling',
      description: 'Trinity self-aware schedule scan — returns all unfilled or open shifts in the next 14 days, grouped by urgency. Trinity calls this proactively when talking to owners or managers.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const now = new Date();
        const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
        const in4Hours = new Date(now.getTime() + 4 * 60 * 60 * 1000);

        const openShifts = await db.query.shifts.findMany({
          where: and(
            eq(shifts.workspaceId, request.workspaceId!),
            gte(shifts.startTime, now),
            lte(shifts.startTime, in14Days),
            isNull(shifts.employeeId),
          ),
          with: { client: true } as any,
          orderBy: [shifts.startTime],
        });

        const critical = openShifts.filter(s => s.startTime <= in4Hours);
        const urgent = openShifts.filter(s => {
          const hoursAway = (s.startTime.getTime() - now.getTime()) / 3600000;
          return hoursAway > 4 && hoursAway <= 24;
        });
        const upcoming = openShifts.filter(s => {
          const hoursAway = (s.startTime.getTime() - now.getTime()) / 3600000;
          return hoursAway > 24;
        });

        const summary = {
          totalOpen: openShifts.length,
          critical: critical.length,
          urgent: urgent.length,
          upcoming: upcoming.length,
          criticalShifts: critical,
          urgentShifts: urgent,
          upcomingShifts: upcoming,
        };

        const msg = openShifts.length === 0
          ? 'No open shifts found in the next 14 days — schedule is fully covered.'
          : `Found ${openShifts.length} open shifts: ${critical.length} critical (within 4 hrs), ${urgent.length} urgent (within 24 hrs), ${upcoming.length} upcoming.`;

        return createResult(request.actionId, true, msg, summary, start);
      },
    };

    const detectDemandChange: ActionHandler = {
      actionId: 'scheduling.detect_demand_change',
      name: 'Detect Client Demand Changes',
      category: 'scheduling',
      description: 'Analyze shift patterns over the last 60 days to detect clients whose scheduling demand is trending up or down. Trinity uses this to proactively recommend creating new shifts or renegotiating contracts.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

        const recentShifts = await db.query.shifts.findMany({
          where: and(
            eq(shifts.workspaceId, request.workspaceId!),
            gte(shifts.startTime, thirtyDaysAgo),
            lte(shifts.startTime, now),
          ),
        });

        const priorShifts = await db.query.shifts.findMany({
          where: and(
            eq(shifts.workspaceId, request.workspaceId!),
            gte(shifts.startTime, sixtyDaysAgo),
            lte(shifts.startTime, thirtyDaysAgo),
          ),
        });

        const recentByClient: Record<string, number> = {};
        const priorByClient: Record<string, number> = {};

        recentShifts.forEach(s => {
          if (s.clientId) recentByClient[s.clientId] = (recentByClient[s.clientId] || 0) + 1;
        });
        priorShifts.forEach(s => {
          if (s.clientId) priorByClient[s.clientId] = (priorByClient[s.clientId] || 0) + 1;
        });

        const allClientIds = new Set([...Object.keys(recentByClient), ...Object.keys(priorByClient)]);
        const changes: Array<{ clientId: string; recent: number; prior: number; pctChange: number; trend: string }> = [];

        allClientIds.forEach(clientId => {
          const recent = recentByClient[clientId] || 0;
          const prior = priorByClient[clientId] || 0;
          if (prior === 0 && recent === 0) return;
          const pctChange = prior === 0 ? 100 : Math.round(((recent - prior) / prior) * 100);
          if (Math.abs(pctChange) >= 20) {
            changes.push({ clientId, recent, prior, pctChange, trend: pctChange > 0 ? 'increasing' : 'decreasing' });
          }
        });

        changes.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));

        const msg = changes.length === 0
          ? 'Demand is stable across all clients — no significant shifts in the last 60 days.'
          : `Detected demand changes in ${changes.length} clients: ${changes.filter(c => c.trend === 'increasing').length} trending up, ${changes.filter(c => c.trend === 'decreasing').length} trending down.`;

        return createResult(request.actionId, true, msg, { changes, analyzed: allClientIds.size }, start);
      },
    };

    helpaiOrchestrator.registerAction(withAuditWrap(createClient, 'client'));
    helpaiOrchestrator.registerAction(withAuditWrap(createPortalInvite, 'client'));
    helpaiOrchestrator.registerAction(withAuditWrap(scanOpenShifts, 'shift'));
    helpaiOrchestrator.registerAction(withAuditWrap(detectDemandChange, 'shift'));
  }

  // ============================================================================
  // TIME TRACKING ACTIONS
  // ============================================================================

  private registerTimeTrackingActions(): void {
    const getTimeEntries: ActionHandler = {
      actionId: 'time_tracking.get_entries',
      name: 'Get Time Entries',
      category: 'scheduling',
      description: 'Get time entries for an employee',
      requiredRoles: ['system', 'employee', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const entries = await db.query.timeEntries.findMany({
          where: and(
            eq(timeEntries.workspaceId, request.workspaceId!),
            eq(timeEntries.employeeId, request.payload?.employeeId)
          ),
          orderBy: [desc(timeEntries.clockIn)],
          limit: request.payload?.limit || 50,
        });
        return createResult(request.actionId, true, `Time entries retrieved`, entries, start);
      },
    };

    const editTimeEntry: ActionHandler = {
      actionId: 'time_tracking.edit_entry',
      name: 'Edit Time Entry',
      category: 'scheduling',
      description: 'Edit a time entry - adjust clock in/out times, add notes, or change status',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { entryId, clockIn: newClockIn, clockOut: newClockOut, notes, status } = request.payload || {};
        if (!entryId) return createResult(request.actionId, false, 'Time entry ID required', null, start);
        const updates: Record<string, any> = {};
        if (newClockIn) updates.clockIn = new Date(newClockIn);
        if (newClockOut) updates.clockOut = new Date(newClockOut);
        if (notes !== undefined) updates.notes = notes;
        if (status) updates.status = status;
        if (updates.clockIn && updates.clockOut) {
          updates.totalHours = Math.round((new Date(updates.clockOut).getTime() - new Date(updates.clockIn).getTime()) / (1000 * 60 * 60) * 100) / 100;
        }
        if (Object.keys(updates).length === 0) return createResult(request.actionId, false, 'No valid fields to update', null, start);
        const [updated] = await db.update(timeEntries)
          .set(updates)
          .where(and(eq(timeEntries.id, entryId), eq(timeEntries.workspaceId, request.workspaceId!)))
          .returning();
        if (!updated) {
          await logActionAudit({
            actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
            userRole: request.userRole, platformRole: request.platformRole,
            entityType: 'time_entry', entityId: entryId,
            success: false, errorMessage: 'Time entry not found', durationMs: Date.now() - start,
          });
          return createResult(request.actionId, false, 'Time entry not found', null, start);
        }
        await logActionAudit({
          actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
          userRole: request.userRole, platformRole: request.platformRole,
          entityType: 'time_entry', entityId: entryId,
          success: true, message: 'Time entry updated',
          changesAfter: updated as any, durationMs: Date.now() - start,
        });
        return createResult(request.actionId, true, `Time entry updated`, updated, start);
      },
    };

    helpaiOrchestrator.registerAction(withAuditWrap(getTimeEntries, 'time_entry'));
    helpaiOrchestrator.registerAction(withAuditWrap(editTimeEntry, 'time_entry'));
  }

  // ============================================================================
  // NOTIFICATION ACTIONS
  // ============================================================================

  private registerNotificationActions(): void {
    // Consolidated notify.send — replaces notify.send, notify.send_critical,
    // notify.send_priority, and notify.send_platform_update.
    // Dispatch is controlled by request.payload?.priority:
    //   'critical' | 'P0'              → critical severity, multi-user alert
    //   'high' | 'P1' | 'P2'          → high severity, tiered delivery
    //   'platform_update'              → info severity, platform update type
    //   normal / low / undefined       → base send logic (medium severity)
    const sendNotification: ActionHandler = {
      actionId: 'notify.send',
      name: 'Send Notification',
      category: 'notifications',
      description: 'Send a notification to a user. Supports priority dispatch: critical/P0, high/P1/P2, platform_update, or normal.',
      requiredRoles: ['manager', 'owner', 'support_agent', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { priority, severity, type, title, message, userId, userIds } = request.payload || {};

        // Derive effective severity from priority hint
        const effectiveSeverity =
          priority === 'critical' || priority === 'P0' ? 'critical'
          : priority === 'high' || priority === 'P1' || priority === 'P2' ? 'high'
          : priority === 'platform_update' ? 'info'
          : severity || 'medium';

        // Derive effective type
        const effectiveType =
          priority === 'platform_update' ? 'platform_update'
          : type || 'system';

        // Collect target user IDs (critical path may pass an array via userIds)
        const targetUserIds: string[] = userIds
          ? (Array.isArray(userIds) ? userIds : [userIds])
          : userId ? [userId] : [];

        // Route through UniversalNotificationEngine for Trinity AI enrichment and validation
        await universalNotificationEngine.sendNotification({
          idempotencyKey: `notif-${Date.now()}`,
          type: effectiveType,
          title: title,
          message: message,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          workspaceId: request.workspaceId || undefined,
          targetUserIds,
          severity: effectiveSeverity,
          source: 'action_registry',
        });

        await logActionAudit({
          actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
          userRole: request.userRole, platformRole: request.platformRole,
          entityType: 'notification', entityId: null,
          success: true, message: `Notification sent: ${title}`,
          payload: { effectiveSeverity, effectiveType, targetUserIds: targetUserIds.length } as any,
          durationMs: Date.now() - start,
        });

        return createResult(request.actionId, true, `Notification sent`, { sent: true, effectiveSeverity, effectiveType }, start);
      },
    };

    // Consolidated notify.manage — replaces notify.clear_all, notify.mark_all_read,
    // and delegates stats to notify.stats (renamed from notify.get_stats).
    // Dispatch is controlled by request.payload?.action:
    //   'clear'     → clear all notifications (former notify.clear_all logic)
    //   'mark_read' → mark all as read (former notify.mark_all_read logic)
    //   'stats'     → delegate to notify.stats action
    //   Default     → stats
    const manageNotifications: ActionHandler = {
      actionId: 'notify.manage',
      name: 'Manage Notifications',
      category: 'notifications',
      description: 'Unified notification management: clear, mark_read, or stats (set payload.action).',
      requiredRoles: ['employee', 'manager', 'owner', 'support_agent', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { storage } = await import('../../storage');
        const aiNotificationService = await import('../aiNotificationService').then(m => m.default);

        const manageAction = request.payload?.action ?? 'stats';
        const userId = request.userId;

        if (manageAction === 'clear') {
          if (!userId) {
            return createResult(request.actionId, false, 'User ID required to clear notifications', null, start);
          }
          // Clear both regular notifications and AI maintenance alerts
          const clearedNotifications = await storage.clearAllNotifications(userId);
          const clearedAlerts = await aiNotificationService.acknowledgeAllMaintenanceAlerts(userId);
          const totalCleared = clearedNotifications + clearedAlerts;
          await logActionAudit({
            actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
            userRole: request.userRole, platformRole: request.platformRole,
            entityType: 'notification', entityId: null,
            success: true, message: `Cleared ${totalCleared} notifications for user ${userId}`,
            payload: { clearedNotifications, clearedAlerts } as any, durationMs: Date.now() - start,
          });
          return createResult(
            request.actionId,
            true,
            `Successfully cleared ${totalCleared} notifications for user`,
            { clearedNotifications, clearedAlerts, totalCleared },
            start
          );
        }

        if (manageAction === 'mark_read') {
          if (!userId) {
            return createResult(request.actionId, false, 'User ID required', null, start);
          }
          // Mark both regular notifications and AI maintenance alerts as read
          await storage.markAllNotificationsAsRead(userId);
          const acknowledgedAlerts = await aiNotificationService.acknowledgeAllMaintenanceAlerts(userId);
          await logActionAudit({
            actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
            userRole: request.userRole, platformRole: request.platformRole,
            entityType: 'notification', entityId: null,
            success: true, message: `Marked all notifications read for user ${userId}`,
            payload: { acknowledgedAlerts } as any, durationMs: Date.now() - start,
          });
          return createResult(
            request.actionId,
            true,
            `All notifications marked as read (including ${acknowledgedAlerts} AI alerts)`,
            { acknowledgedAlerts },
            start
          );
        }

        // Default: stats — delegate to notify.stats
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const statsResult = await helpaiOrchestrator.executeAction({
          actionId: 'notify.stats',
          workspaceId: request.workspaceId,
          userId: request.userId,
          userRole: request.userRole,
          payload: request.payload,
        });
        return createResult(
          request.actionId,
          statsResult.success,
          statsResult.message || 'Stats retrieved',
          statsResult.data,
          start
        );
      },
    };

    // notify.mark_all_read is now handled by notify.manage (action='mark_read')
    // const markAllRead: ActionHandler = { actionId: 'notify.mark_all_read', ... };

    // P27-G03 FIX: Trinity delivery stats action — queries notification_deliveries table
    // Check 21 compliance: Trinity can query delivery stats by workspace, channel, status, date range
    const deliveryStats: ActionHandler = {
      actionId: 'notify.delivery_stats',
      name: 'Notification Delivery Stats',
      category: 'notifications',
      description: 'Query notification_deliveries stats by workspace, channel, status, and date range. Returns counts, failure rates, and recent delivery records.',
      requiredRoles: ['manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        try {
          const { db } = await import('../../db');
          const { notificationDeliveries } = await import('@shared/schema');
          const { eq, and, gte, lte, sql: drizzleSql, count } = await import('drizzle-orm');

          const workspaceId = request.payload?.workspaceId || request.workspaceId;
          const channel = request.payload?.channel;
          const status = request.payload?.status;
          const sinceHours = request.payload?.sinceHours ?? 24;

          const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

          const conditions: any[] = [gte(notificationDeliveries.createdAt, since)];
          if (workspaceId) conditions.push(eq(notificationDeliveries.workspaceId, workspaceId));
          if (channel) conditions.push(eq(notificationDeliveries.channel, channel));
          if (status) conditions.push(eq(notificationDeliveries.status, status));

          const [totals] = await db.select({
            total: count(),
            totalSent: drizzleSql<number>`SUM(CASE WHEN ${notificationDeliveries.status} IN ('sent','delivered') THEN 1 ELSE 0 END)`,
            totalFailed: drizzleSql<number>`SUM(CASE WHEN ${notificationDeliveries.status} IN ('failed','permanently_failed') THEN 1 ELSE 0 END)`,
            totalPending: drizzleSql<number>`SUM(CASE WHEN ${notificationDeliveries.status} = 'pending' THEN 1 ELSE 0 END)`,
          }).from(notificationDeliveries).where(and(...conditions));

          const recentFailures = await db.select({
            id: notificationDeliveries.id,
            notificationType: notificationDeliveries.notificationType,
            channel: notificationDeliveries.channel,
            status: notificationDeliveries.status,
            attemptCount: notificationDeliveries.attemptCount,
            lastError: notificationDeliveries.lastError,
            createdAt: notificationDeliveries.createdAt,
          }).from(notificationDeliveries)
            .where(and(
              gte(notificationDeliveries.createdAt, since),
              ...(workspaceId ? [eq(notificationDeliveries.workspaceId, workspaceId)] : []),
              drizzleSql`${notificationDeliveries.status} IN ('failed','permanently_failed')`,
            ))
            .orderBy(notificationDeliveries.createdAt)
            .limit(10);

          const total = Number(totals.total) || 0;
          const totalSent = Number(totals.totalSent) || 0;
          const totalFailed = Number(totals.totalFailed) || 0;
          const deliveryRate = total > 0 ? `${((totalSent / total) * 100).toFixed(1)}%` : 'N/A';

          return createResult(request.actionId, true, `Notification delivery stats for last ${sinceHours}h: ${totalSent}/${total} delivered (${deliveryRate} success rate), ${totalFailed} failed.`, {
            sinceHours,
            total,
            totalSent,
            totalFailed,
            totalPending: Number(totals.totalPending) || 0,
            deliveryRate,
            recentFailures,
          }, start);
        } catch (err: any) {
          return createResult(request.actionId, false, `Failed to query delivery stats: ${err.message}`, null, start);
        }
      },
    };

    helpaiOrchestrator.registerAction(withAuditWrap(sendNotification, 'notification'));
    helpaiOrchestrator.registerAction(withAuditWrap(manageNotifications, 'notification'));
    helpaiOrchestrator.registerAction(withAuditWrap(deliveryStats, 'notification'));
    // helpaiOrchestrator.registerAction(markAllRead); // consolidated into notify.manage
  }

  // ============================================================================
  // DIRECT AUTONOMOUS ACTIONS (Critical Workflows)
  // ============================================================================

  private registerDirectActions(): void {
    // 1. Fill Open Shift
    const fillOpenShift: ActionHandler = {
      actionId: 'scheduling.fill_open_shift',
      name: 'Fill Open Shift',
      category: 'scheduling',
      description: 'Assign an employee to an unassigned shift',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { shiftId, employeeId } = request.payload || {};
        if (!shiftId || !employeeId) return createResult(request.actionId, false, 'shiftId and employeeId required', null, start);
        if (request.workspaceId) await assertWorkspaceActive(request.workspaceId, { bypassForSystemActor: true });

        const [updated] = await db.update(shifts)
          .set({ 
            employeeId, 
            status: 'scheduled',
            updatedAt: new Date() 
          })
          .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, request.workspaceId!)))
          .returning();

        if (!updated) {
          await logActionAudit({
            actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
            userRole: request.userRole, platformRole: request.platformRole,
            entityType: 'shift', entityId: shiftId,
            success: false, errorMessage: 'Shift not found or access denied',
            payload: { shiftId, employeeId } as any, durationMs: Date.now() - start,
          });
          return createResult(request.actionId, false, 'Shift not found or access denied', null, start);
        }
        await logActionAudit({
          actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
          userRole: request.userRole, platformRole: request.platformRole,
          entityType: 'shift', entityId: shiftId,
          success: true, message: `Shift ${shiftId} assigned to employee ${employeeId}`,
          changesAfter: updated as any, durationMs: Date.now() - start,
        });
        broadcastShiftUpdate(request.workspaceId!, 'shift_updated', updated);
        return createResult(request.actionId, true, `Shift ${shiftId} assigned to employee ${employeeId}`, updated, start);
      },
    };

    // 2. Approve Timesheet
    const approveTimesheet: ActionHandler = {
      actionId: 'payroll.approve_timesheet',
      name: 'Approve Timesheet',
      category: 'payroll',
      description: 'Approve a time entry for payroll',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { timeEntryId } = request.payload || {};
        if (!timeEntryId) return createResult(request.actionId, false, 'timeEntryId required', null, start);
        if (request.workspaceId) await assertWorkspaceActive(request.workspaceId, { bypassForSystemActor: true });

        // HIGH-STAKES: deliberation log for payroll approval
        recordDeliberation({
          workspaceId: request.workspaceId || 'unknown',
          actionType: 'payroll_timesheet_approval',
          actionDescription: `Approving timesheet ${timeEntryId} for payroll`,
          whatIKnow: `Time entry ID: ${timeEntryId}. Requested by: ${request.userId} (${request.userRole}).`,
          myOptions: 'Approve entry (includes in next payroll run) OR reject (requires correction)',
          myDecision: 'APPROVED: Marking time entry as approved, setting approvedBy and approvedAt',
          confidenceScore: 0.9,
          actionId: request.actionId,
        }).catch(() => null); // fire-and-forget, non-fatal

        const [updated] = await db.update(timeEntries)
          .set({
            status: 'approved',
            approvedAt: new Date(),
            approvedBy: request.userId,
            updatedAt: new Date()
          })
          .where(and(eq(timeEntries.id, timeEntryId), eq(timeEntries.workspaceId, request.workspaceId!)))
          .returning();

        if (!updated) {
          await logActionAudit({
            actionId: request.actionId,
            workspaceId: request.workspaceId,
            userId: request.userId,
            userRole: request.userRole,
            platformRole: request.platformRole,
            entityType: 'time_entry',
            entityId: timeEntryId,
            success: false,
            errorMessage: 'Time entry not found or access denied',
            payload: { timeEntryId },
            durationMs: Date.now() - start,
          });
          return createResult(request.actionId, false, 'Time entry not found or access denied', null, start);
        }

        await logActionAudit({
          actionId: request.actionId,
          workspaceId: request.workspaceId,
          userId: request.userId,
          userRole: request.userRole,
          platformRole: request.platformRole,
          entityType: 'time_entry',
          entityId: timeEntryId,
          success: true,
          message: `Time entry ${timeEntryId} approved`,
          changesAfter: updated as any,
          durationMs: Date.now() - start,
        });

        return createResult(request.actionId, true, `Time entry ${timeEntryId} approved`, updated, start);
      },
    };

    // 3a. Create Invoice — Phase 1 CRUD gap fill
    const createInvoice: ActionHandler = {
      actionId: 'billing.invoice_create',
      name: 'Create Invoice',
      category: 'invoicing',
      description: 'Create a new invoice for a client in the workspace',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { clientId, amount, dueDate, lineItems, notes } = request.payload || {};
        if (!clientId) return createResult(request.actionId, false, 'clientId is required', null, start);
        if (!request.workspaceId) return createResult(request.actionId, false, 'workspaceId required', null, start);
        await assertWorkspaceActive(request.workspaceId, { bypassForSystemActor: true });

        // Phase 17C: amount-threshold approval gate. If the requesting actor
        // doesn't meet the required role for this amount, refuse with a
        // typed error. The caller is expected to route through the
        // approval-creation flow (workflowApprovalService) for high-value
        // invoices instead of executing directly.
        const approvalDecision = requiresFinancialApproval(amount);
        if (
          approvalDecision.requiresApproval &&
          !actorMeetsApprovalRequirement(request.userRole ?? request.platformRole, approvalDecision.requiredRole)
        ) {
          await logActionAudit({
            actionId: request.actionId,
            workspaceId: request.workspaceId,
            userId: request.userId,
            userRole: request.userRole,
            platformRole: request.platformRole,
            entityType: 'invoice',
            success: false,
            errorMessage: `Approval required: ${approvalDecision.rationale} Required role: ${approvalDecision.requiredRole}.`,
            payload: { clientId, amount, decision: approvalDecision } as any,
            durationMs: Date.now() - start,
          });
          return createResult(
            request.actionId,
            false,
            `Approval required for amount $${amount}: ${approvalDecision.rationale} Required role: ${approvalDecision.requiredRole}.`,
            { decision: approvalDecision },
            start,
          );
        }

        const [created] = await db.insert(invoices).values({
          workspaceId: request.workspaceId,
          clientId,
          status: 'draft',
          total: amount ? String(amount) : '0',
          dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
          notes: notes || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any).returning();

        if (!created) {
          await logActionAudit({
            actionId: request.actionId,
            workspaceId: request.workspaceId,
            userId: request.userId,
            userRole: request.userRole,
            platformRole: request.platformRole,
            entityType: 'invoice',
            success: false,
            errorMessage: 'Failed to create invoice',
            payload: { clientId },
            durationMs: Date.now() - start,
          });
          return createResult(request.actionId, false, 'Failed to create invoice', null, start);
        }

        // Publish invoice_created event
        try {
          const { platformEventBus } = await import('../platformEventBus');
          await platformEventBus.publish({
            type: 'invoice_created',
            workspaceId: request.workspaceId,
            title: 'Invoice Created',
            description: `New invoice created for client ${clientId}`,
            metadata: { invoiceId: (created as any).id, clientId, createdBy: request.userId },
          } as any);
        } catch (err) {
          log.warn('[billing.invoice_create] event publish failed (non-fatal):', err);
        }

        await logActionAudit({
          actionId: request.actionId,
          workspaceId: request.workspaceId,
          userId: request.userId,
          userRole: request.userRole,
          platformRole: request.platformRole,
          entityType: 'invoice',
          entityId: (created as any).id,
          success: true,
          message: 'Invoice created',
          changesAfter: created as any,
          durationMs: Date.now() - start,
        });

        return createResult(request.actionId, true, `Invoice created`, created, start);
      },
    };

    // 3b. Send Invoice (canonical version is billing.invoice_send in trinityInvoiceEmailActions.ts)
    const sendInvoice: ActionHandler = {
      actionId: 'billing.invoice_send',
      name: 'Send Invoice',
      category: 'invoicing',
      description: 'Send a finalized invoice to a client',
      requiredRoles: ['system', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { invoiceId } = request.payload || {};
        if (!invoiceId) return createResult(request.actionId, false, 'invoiceId required', null, start);
        if (request.workspaceId) await assertWorkspaceActive(request.workspaceId, { bypassForSystemActor: true });

        const { invoiceService } = await import('../finance/invoiceService');
        const result = await invoiceService.sendInvoice(invoiceId, request.workspaceId!);

        await logActionAudit({
          actionId: request.actionId,
          workspaceId: request.workspaceId,
          userId: request.userId,
          userRole: request.userRole,
          platformRole: request.platformRole,
          entityType: 'invoice',
          entityId: invoiceId,
          success: result.success,
          message: result.message,
          errorMessage: result.success ? null : result.message,
          durationMs: Date.now() - start,
        });

        return createResult(request.actionId, result.success, result.message, result.data, start);
      },
    };

    // 4. Clock Out Officer
    const clockOutOfficer: ActionHandler = {
      actionId: 'time_tracking.clock_out_officer',
      name: 'Clock Out Officer',
      category: 'scheduling',
      description: 'Force clock-out an officer who forgot to clock out',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { timeEntryId, clockOutTime } = request.payload || {};
        if (!timeEntryId) return createResult(request.actionId, false, 'timeEntryId required', null, start);
        if (request.workspaceId) await assertWorkspaceActive(request.workspaceId, { bypassForSystemActor: true });

        const logoutTime = clockOutTime ? new Date(clockOutTime) : new Date();
        const [updated] = await db.update(timeEntries)
          .set({
            clockOut: logoutTime,
            status: 'completed',
            updatedAt: new Date()
          })
          .where(and(eq(timeEntries.id, timeEntryId), eq(timeEntries.workspaceId, request.workspaceId!)))
          .returning();

        if (!updated) {
          await logActionAudit({
            actionId: request.actionId,
            workspaceId: request.workspaceId,
            userId: request.userId,
            userRole: request.userRole,
            platformRole: request.platformRole,
            entityType: 'time_entry',
            entityId: timeEntryId,
            success: false,
            errorMessage: 'Time entry not found or access denied',
            payload: { timeEntryId, clockOutTime },
            durationMs: Date.now() - start,
          });
          return createResult(request.actionId, false, 'Time entry not found or access denied', null, start);
        }

        await logActionAudit({
          actionId: request.actionId,
          workspaceId: request.workspaceId,
          userId: request.userId,
          userRole: request.userRole,
          platformRole: request.platformRole,
          entityType: 'time_entry',
          entityId: timeEntryId,
          success: true,
          message: `Officer clocked out at ${logoutTime.toISOString()}`,
          changesAfter: updated as any,
          durationMs: Date.now() - start,
        });

        return createResult(request.actionId, true, `Officer clocked out at ${logoutTime.toISOString()}`, updated, start);
      },
    };

    // 5. Escalate Compliance
    const escalateCompliance: ActionHandler = {
      actionId: 'compliance.escalate',
      name: 'Escalate Compliance Issue',
      category: 'compliance',
      description: 'Create a compliance alert and notify stakeholders',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { title, description, severity, relatedEntityId, relatedEntityType } = request.payload || {};
        if (request.workspaceId) await assertWorkspaceActive(request.workspaceId, { bypassForSystemActor: true });

        try {
          const { complianceService } = await import('../compliance/complianceService');
          const alert = await complianceService.createAlert({
            workspaceId: request.workspaceId!,
            title: title || 'Compliance Escalation',
            description: description || 'Manual escalation via Trinity AI',
            severity: severity || 'high',
            status: 'open',
            relatedEntityId,
            relatedEntityType,
            createdBy: request.userId
          });

          await universalNotificationEngine.sendNotification({
            idempotencyKey: `notif-${Date.now()}`,
          type: 'compliance_alert',
            title: `Compliance Escalation: ${(alert as any).title}`,
            message: (alert as any).description,
            workspaceId: request.workspaceId!,
            // @ts-expect-error — TS migration: fix in refactoring sprint
            severity: alert.severity === 'critical' ? 'high' : 'medium',
            source: 'trinity_compliance_escalation',
            metadata: { alertId: alert.id }
          });

          await logActionAudit({
            actionId: request.actionId,
            workspaceId: request.workspaceId,
            userId: request.userId,
            userRole: request.userRole,
            platformRole: request.platformRole,
            entityType: 'compliance_alert',
            entityId: (alert as any)?.id ?? null,
            success: true,
            message: 'Compliance issue escalated',
            changesAfter: alert as any,
            durationMs: Date.now() - start,
          });

          return createResult(request.actionId, true, 'Compliance issue escalated', alert, start);
        } catch (err: any) {
          await logActionAudit({
            actionId: request.actionId,
            workspaceId: request.workspaceId,
            userId: request.userId,
            userRole: request.userRole,
            platformRole: request.platformRole,
            entityType: 'compliance_alert',
            success: false,
            errorMessage: err?.message ?? String(err),
            payload: { title, severity, relatedEntityId, relatedEntityType },
            durationMs: Date.now() - start,
          });
          throw err;
        }
      },
    };

    // 3c. Add Line Items to Draft Invoice — Phase 17C
    // Enables proper multi-step invoice workflow:
    // billing.invoice_create → billing.invoice_add_line_items → billing.invoice_send
    // Status='draft' precondition prevents mutating finalized invoices.
    const addInvoiceLineItems: ActionHandler = {
      actionId: 'billing.invoice_add_line_items',
      name: 'Add Invoice Line Items',
      category: 'invoicing',
      description: 'Append line items to a draft invoice and recalculate the total',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { invoiceId, items } = request.payload || {};
        if (!invoiceId) return createResult(request.actionId, false, 'invoiceId is required', null, start);
        if (!Array.isArray(items) || items.length === 0) {
          return createResult(request.actionId, false, 'items array required (non-empty)', null, start);
        }
        if (!request.workspaceId) return createResult(request.actionId, false, 'workspaceId required', null, start);
        await assertWorkspaceActive(request.workspaceId, { bypassForSystemActor: true });

        // Fetch invoice with workspace scope (TRINITY.md Section G — tenant isolation in raw SQL)
        const [invoice] = await db.select()
          .from(invoices)
          .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, request.workspaceId)))
          .limit(1);

        if (!invoice) {
          await logActionAudit({
            actionId: request.actionId,
            workspaceId: request.workspaceId,
            userId: request.userId,
            entityType: 'invoice',
            entityId: invoiceId,
            success: false,
            errorMessage: 'Invoice not found in this workspace',
            durationMs: Date.now() - start,
          });
          return createResult(request.actionId, false, 'Invoice not found in this workspace', null, start);
        }

        if ((invoice as any).status !== 'draft') {
          await logActionAudit({
            actionId: request.actionId,
            workspaceId: request.workspaceId,
            userId: request.userId,
            entityType: 'invoice',
            entityId: invoiceId,
            success: false,
            errorMessage: `Cannot add line items to invoice in status '${(invoice as any).status}'. Only drafts accept new line items.`,
            payload: { items },
            durationMs: Date.now() - start,
          });
          return createResult(
            request.actionId,
            false,
            `Cannot add line items to invoice in status '${(invoice as any).status}'. Only drafts accept new line items.`,
            null,
            start,
          );
        }

        // Compute deltas (integer cents to avoid float drift)
        let appendedTotalCents = 0;
        const rows = items.map((it: any, idx: number) => {
          const qty = parseFloat(String(it.quantity ?? '1'));
          const unit = parseFloat(String(it.unitPrice ?? '0'));
          if (!Number.isFinite(qty) || qty <= 0) {
            throw new Error(`items[${idx}].quantity must be > 0`);
          }
          if (!Number.isFinite(unit) || unit < 0) {
            throw new Error(`items[${idx}].unitPrice must be >= 0`);
          }
          const lineTotal = Math.round(qty * unit * 100);
          appendedTotalCents += lineTotal;
          return {
            invoiceId,
            workspaceId: request.workspaceId,
            description: String(it.description ?? '').slice(0, 500),
            quantity: String(qty),
            unitPrice: String(unit),
            amount: (lineTotal / 100).toFixed(2),
          };
        });

        try {
          const inserted = await db.transaction(async (tx) => {
            const out = await tx.insert(invoiceLineItems).values(rows as any).returning();
            const newTotalCents = Math.round(parseFloat(String((invoice as any).total ?? '0')) * 100) + appendedTotalCents;
            await tx.update(invoices)
              .set({ total: (newTotalCents / 100).toFixed(2), updatedAt: new Date() } as any)
              .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, request.workspaceId!)));
            return out;
          });

          await logActionAudit({
            actionId: request.actionId,
            workspaceId: request.workspaceId,
            userId: request.userId,
            userRole: request.userRole,
            platformRole: request.platformRole,
            entityType: 'invoice',
            entityId: invoiceId,
            success: true,
            message: `${inserted.length} line items appended to invoice`,
            changesAfter: { lineItemsAppended: inserted.length, appendedTotalCents } as any,
            durationMs: Date.now() - start,
          });

          return createResult(
            request.actionId,
            true,
            `${inserted.length} line items appended`,
            { lineItems: inserted, appendedTotal: (appendedTotalCents / 100).toFixed(2) },
            start,
          );
        } catch (err: any) {
          await logActionAudit({
            actionId: request.actionId,
            workspaceId: request.workspaceId,
            userId: request.userId,
            entityType: 'invoice',
            entityId: invoiceId,
            success: false,
            errorMessage: err?.message ?? String(err),
            payload: { items },
            durationMs: Date.now() - start,
          });
          return createResult(request.actionId, false, err?.message ?? 'Failed to append line items', null, start);
        }
      },
    };

    // ============================================================================
    // PHASE 19: INVOICE MUTATION ACTIONS
    // update, void (dual-AI), cancel, duplicate, apply_payment
    // ============================================================================

    const updateInvoice: ActionHandler = {
      actionId: 'billing.invoice_update',
      name: 'Update Invoice',
      category: 'billing',
      description: 'Update a draft or open invoice — due date, notes, or memo. Blocked on paid/void/cancelled/refunded invoices.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { invoiceId, dueDate, notes, memo } = request.payload || {};
        const workspaceId = request.workspaceId;

        if (!invoiceId) return createResult(request.actionId, false, 'invoiceId required', null, start);
        if (!workspaceId) return createResult(request.actionId, false, 'workspaceId required', null, start);

        const [existing] = await db.select({ id: invoices.id, status: invoices.status })
          .from(invoices)
          .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
          .limit(1);
        if (!existing) return createResult(request.actionId, false, 'Invoice not found', null, start);

        const frozenStatuses = ['paid', 'void', 'cancelled', 'refunded'];
        if (frozenStatuses.includes(existing.status || '')) {
          return createResult(request.actionId, false,
            `Cannot update invoice with status "${existing.status}" — immutable after settlement`, null, start);
        }

        const updateSet: Record<string, any> = { updatedAt: new Date() };
        if (dueDate) updateSet.dueDate = new Date(dueDate);
        const combinedNotes = [notes, memo].filter(Boolean).join('\n').trim();
        if (combinedNotes) updateSet.notes = combinedNotes;
        if (Object.keys(updateSet).length === 1) {
          return createResult(request.actionId, false, 'No fields to update', null, start);
        }

        const [updated] = await db.update(invoices)
          .set(updateSet)
          .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
          .returning();

        broadcastToWorkspace(workspaceId, { type: 'invoices_updated', action: 'updated', invoiceId });
        return createResult(request.actionId, true, 'Invoice updated', updated, start);
      },
    };

    // ⚠️ DUAL-AI REQUIRED — financial mutation
    const voidInvoice: ActionHandler = {
      actionId: 'billing.invoice_void',
      name: 'Void Invoice',
      category: 'billing',
      description: 'Void an invoice. Requires dual-AI deliberation and reason. Writes AR reversal ledger entry.',
      requiredRoles: ['system', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { invoiceId, reason } = request.payload || {};
        const workspaceId = request.workspaceId;

        if (!invoiceId) return createResult(request.actionId, false, 'invoiceId required', null, start);
        if (!reason || String(reason).trim().length < 5) {
          return createResult(request.actionId, false, 'reason required (min 5 chars)', null, start);
        }
        if (!workspaceId) return createResult(request.actionId, false, 'workspaceId required', null, start);

        // ⚠️ DUAL-AI GATE — non-negotiable for financial mutations
        const gate = await requireDeliberationConsensus({
          actionId: request.actionId,
          workspaceId,
          description: `Void invoice ${invoiceId}. Reason: ${reason}`,
          userId: request.userId,
        });
        if (!gate.allowed) {
          await logActionAudit({
            actionId: request.actionId, workspaceId, userId: request.userId,
            entityType: 'invoice', entityId: invoiceId, success: false,
            errorMessage: gate.reason, payload: { invoiceId, reason, deliberationId: gate.deliberationId },
            durationMs: Date.now() - start,
          });
          return createResult(request.actionId, false, gate.reason, { deliberationId: gate.deliberationId }, start);
        }

        const [existing] = await db.select()
          .from(invoices)
          .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
          .limit(1);
        if (!existing) return createResult(request.actionId, false, 'Invoice not found', null, start);
        if (['void', 'paid', 'cancelled', 'refunded'].includes(existing.status || '')) {
          return createResult(request.actionId, false, `Cannot void invoice with status "${existing.status}"`, null, start);
        }

        const [updated] = await db.update(invoices)
          .set({
            status: 'void',
            voidReason: String(reason).trim(),
            voidedAt: new Date(),
            voidedBy: request.userId ?? null,
            updatedAt: new Date(),
          })
          .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
          .returning();

        // AR reversal ledger entry — mirrors invoiceRoutes.ts void path
        const arOpenStatuses = ['sent', 'partial', 'overdue', 'draft'];
        if (arOpenStatuses.includes(existing.status || '')) {
          const totalNum = parseFloat(String(existing.total || updated?.total || 0));
          const paidNum = parseFloat(String(existing.amountPaid || 0));
          const remaining = Math.max(0, totalNum - paidNum);
          if (remaining > 0) {
            try {
              const { writeLedgerEntry } = await import('../orgLedgerService');
              await writeLedgerEntry({
                workspaceId,
                entryType: 'invoice_voided',
                direction: 'credit',
                amount: remaining,
                relatedEntityType: 'invoice',
                relatedEntityId: invoiceId,
                invoiceId,
                createdBy: request.userId ?? 'trinity',
                description: `Invoice ${existing.invoiceNumber} voided by Trinity — AR reversal ${remaining.toFixed(2)}. Reason: ${reason}`,
                metadata: { previousStatus: existing.status, reason },
              });
            } catch (err: any) {
              log.warn('[billing.invoice_void] ledger write failed (non-fatal):', err?.message);
            }
          }
        }

        // Explicit audit log (financial mutations get full before/after)
        await logActionAudit({
          actionId: request.actionId,
          workspaceId,
          userId: request.userId,
          userRole: request.userRole,
          platformRole: request.platformRole,
          entityType: 'invoice',
          entityId: invoiceId,
          success: true,
          message: 'Invoice voided via dual-AI gate',
          changesBefore: existing as any,
          changesAfter: updated as any,
          payload: { reason },
          durationMs: Date.now() - start,
        });

        broadcastToWorkspace(workspaceId, {
          type: 'invoice_voided',
          invoiceId,
          invoiceNumber: existing.invoiceNumber,
          reason,
        });
        return createResult(request.actionId, true, 'Invoice voided', updated, start);
      },
    };

    const cancelInvoice: ActionHandler = {
      actionId: 'billing.invoice_cancel',
      name: 'Cancel Invoice',
      category: 'billing',
      description: 'Cancel an unpaid invoice. For draft/sent invoices only.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { invoiceId, reason } = request.payload || {};
        const workspaceId = request.workspaceId;

        if (!invoiceId) return createResult(request.actionId, false, 'invoiceId required', null, start);
        if (!reason) return createResult(request.actionId, false, 'reason required', null, start);
        if (!workspaceId) return createResult(request.actionId, false, 'workspaceId required', null, start);

        const [existing] = await db.select()
          .from(invoices)
          .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
          .limit(1);
        if (!existing) return createResult(request.actionId, false, 'Invoice not found', null, start);
        if (['paid', 'void', 'cancelled', 'refunded'].includes(existing.status || '')) {
          return createResult(request.actionId, false, `Cannot cancel invoice with status "${existing.status}"`, null, start);
        }

        const [updated] = await db.update(invoices)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
          .returning();

        broadcastToWorkspace(workspaceId, { type: 'invoices_updated', action: 'cancelled', invoiceId });
        return createResult(request.actionId, true, `Invoice cancelled (reason: ${reason})`, updated, start);
      },
    };

    const duplicateInvoice: ActionHandler = {
      actionId: 'billing.invoice_duplicate',
      name: 'Duplicate Invoice',
      category: 'billing',
      description: 'Duplicate an existing invoice as a new draft. Copies line items.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { invoiceId, newDueDate } = request.payload || {};
        const workspaceId = request.workspaceId;

        if (!invoiceId) return createResult(request.actionId, false, 'invoiceId required', null, start);
        if (!workspaceId) return createResult(request.actionId, false, 'workspaceId required', null, start);

        const [source] = await db.select().from(invoices)
          .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
          .limit(1);
        if (!source) return createResult(request.actionId, false, 'Source invoice not found', null, start);

        const nowSuffix = Date.now().toString(36).toUpperCase();
        const [cloned] = await db.insert(invoices).values({
          workspaceId,
          clientId: source.clientId,
          invoiceNumber: `${source.invoiceNumber}-COPY-${nowSuffix}`,
          issueDate: new Date(),
          dueDate: newDueDate ? new Date(newDueDate) : source.dueDate,
          subtotal: source.subtotal,
          taxRate: source.taxRate,
          taxAmount: source.taxAmount,
          total: source.total,
          status: 'draft',
          notes: source.notes,
          netTerms: source.netTerms,
          billingCycle: source.billingCycle,
          primaryServiceId: source.primaryServiceId,
        }).returning();

        // Copy line items
        const sourceItems = await db.select().from(invoiceLineItems)
          .where(eq(invoiceLineItems.invoiceId, invoiceId));
        if (sourceItems.length > 0) {
          await db.insert(invoiceLineItems).values(sourceItems.map(item => ({
            invoiceId: cloned.id,
            workspaceId,
            lineNumber: item.lineNumber,
            serviceDate: item.serviceDate,
            productServiceName: item.productServiceName,
            subClientId: item.subClientId,
            siteId: item.siteId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            rate: item.rate,
            amount: item.amount,
            descriptionData: item.descriptionData,
            taxable: item.taxable,
            taxAmount: item.taxAmount,
          })));
        }

        broadcastToWorkspace(workspaceId, { type: 'invoices_updated', action: 'duplicated', invoiceId: cloned.id });
        return createResult(request.actionId, true, 'Invoice duplicated', { sourceInvoiceId: invoiceId, newInvoice: cloned }, start);
      },
    };

    const applyPayment: ActionHandler = {
      actionId: 'billing.apply_payment',
      name: 'Apply Payment',
      category: 'billing',
      description: 'Record a manual payment against an invoice. Updates balance and writes ledger entry.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { invoiceId, amount, paymentMethod, paymentDate, reference } = request.payload || {};
        const workspaceId = request.workspaceId;

        if (!invoiceId) return createResult(request.actionId, false, 'invoiceId required', null, start);
        if (!amount || Number(amount) <= 0) return createResult(request.actionId, false, 'amount > 0 required', null, start);
        if (!paymentMethod) return createResult(request.actionId, false, 'paymentMethod required', null, start);
        if (!workspaceId) return createResult(request.actionId, false, 'workspaceId required', null, start);

        const paidAt = paymentDate ? new Date(paymentDate) : new Date();
        const amountNum = Number(amount);

        const [preCheck] = await db.select()
          .from(invoices)
          .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
          .limit(1);
        if (!preCheck) return createResult(request.actionId, false, 'Invoice not found', null, start);
        if (['paid', 'void', 'cancelled', 'refunded'].includes(preCheck.status || '')) {
          return createResult(request.actionId, false, `Invoice is already ${preCheck.status}`, null, start);
        }

        const totalNum = parseFloat(String(preCheck.total || 0));
        const previouslyPaid = parseFloat(String(preCheck.amountPaid || 0));
        const newPaidTotal = previouslyPaid + amountNum;
        const isFullyPaid = newPaidTotal >= totalNum - 0.001;

        const { updated, paymentRow } = await db.transaction(async (tx) => {
          const [updated] = await tx.update(invoices)
            .set({
              status: isFullyPaid ? 'paid' : 'partial',
              amountPaid: newPaidTotal.toFixed(2),
              paidAt: isFullyPaid ? paidAt : preCheck.paidAt,
              paymentMethod,
              paymentReference: reference ?? preCheck.paymentReference,
              updatedAt: new Date(),
            })
            .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
            .returning();
          const [paymentRow] = await tx.insert(paymentRecords).values({
            workspaceId,
            invoiceId,
            amount: amountNum.toFixed(2),
            paymentMethod,
            transactionId: reference ?? null,
            status: 'completed',
            paidAt,
          }).returning();
          return { updated, paymentRow };
        });

        try {
          const { writeLedgerEntry } = await import('../orgLedgerService');
          await writeLedgerEntry({
            workspaceId,
            entryType: 'payment_received',
            direction: 'credit',
            amount: amountNum,
            relatedEntityType: 'invoice',
            relatedEntityId: invoiceId,
            invoiceId,
            createdBy: request.userId ?? 'trinity',
            description: `Trinity applied ${paymentMethod} payment of ${amountNum.toFixed(2)} to ${preCheck.invoiceNumber}${reference ? ` (ref: ${reference})` : ''}`,
            metadata: { paymentMethod, reference, paymentRecordId: paymentRow?.id },
          });
        } catch (err: any) {
          log.warn('[billing.apply_payment] ledger write failed (non-fatal):', err?.message);
        }

        broadcastToWorkspace(workspaceId, {
          type: 'invoices_updated',
          action: 'payment_applied',
          invoiceId,
          amount: amountNum,
          paymentMethod,
        });
        return createResult(
          request.actionId,
          true,
          isFullyPaid ? 'Payment applied — invoice paid in full' : 'Partial payment applied',
          { invoice: updated, payment: paymentRow },
          start,
        );
      },
    };

    helpaiOrchestrator.registerAction(withAuditWrap(fillOpenShift, 'shift'));
    helpaiOrchestrator.registerAction(approveTimesheet); // explicit audit inside handler
    helpaiOrchestrator.registerAction(createInvoice); // explicit audit inside handler
    helpaiOrchestrator.registerAction(addInvoiceLineItems); // explicit audit inside handler
    // billing.invoice_send canonical is in trinityInvoiceEmailActions.ts — not registering here
    // helpaiOrchestrator.registerAction(sendInvoice);
    helpaiOrchestrator.registerAction(withAuditWrap(updateInvoice, 'invoice'));
    helpaiOrchestrator.registerAction(voidInvoice); // explicit audit + dual-AI inside handler
    helpaiOrchestrator.registerAction(withAuditWrap(cancelInvoice, 'invoice'));
    helpaiOrchestrator.registerAction(withAuditWrap(duplicateInvoice, 'invoice'));
    helpaiOrchestrator.registerAction(withAuditWrap(applyPayment, 'invoice'));
    helpaiOrchestrator.registerAction(clockOutOfficer); // explicit audit inside handler
    helpaiOrchestrator.registerAction(escalateCompliance); // explicit audit inside handler
  }

  // ============================================================================
  // ONBOARDING ACTIONS
  // ============================================================================

  private registerOnboardingActions(): void {
    // onboarding.get_checklist CONSOLIDATED into onboarding.track (view='checklist') in domainSupervisorActions.ts
    // Handler kept here for reference only — not registered separately:
    const getChecklist: ActionHandler = {
      actionId: 'onboarding.get_checklist',
      name: 'Get Onboarding Checklist',
      category: 'lifecycle',
      description: 'Get the onboarding checklist for a user/employee',
      requiredRoles: ['system', 'employee', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { onboardingConfig } = await import('@shared/config/onboardingConfig');
        return createResult(request.actionId, true, 'Onboarding checklist retrieved', onboardingConfig.onboardingSteps, start);
      },
    };

    // onboarding.invite — consolidates: send_invitation (default/action='send'), resend_invitation (action='resend'),
    //                      revoke_invitation (action='revoke'), send_client_welcome (action='client_welcome')
    const sendInvitation: ActionHandler = {
      actionId: 'onboarding.invite',
      name: 'Send / Manage Employee or Client Invitation',
      category: 'lifecycle',
      description: 'Manage invitations. Use payload.action="resend" to resend an existing invitation (requires invitationId); action="revoke" to revoke (requires invitationId); action="client_welcome" to send a client welcome email (requires email, clientName); default sends a new employee invitation (requires email, firstName, lastName).',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { action: subAction, email, firstName, lastName, role, invitationId, clientId, clientName, companyName } = request.payload || {};
        const { storage } = await import('../../storage');
        const { emailService } = await import('../emailService');

        if (subAction === 'resend') {
          // Consolidated from onboarding.resend_invitation
          if (!invitationId) {
            return createResult(request.actionId, false, 'Invitation ID is required', null, start);
          }

          const invitation = await storage.getEmployeeInvitationById(invitationId);
          if (!invitation) {
            return createResult(request.actionId, false, 'Invitation not found', null, start);
          }

          const workspace = await storage.getWorkspace(invitation.workspaceId);
          await emailService.sendEmployeeInvitation( // nds-exempt: one-time invite token delivery
            invitation.workspaceId,
            invitation.email,
            invitation.inviteToken!,
            {
              // @ts-expect-error — TS migration: fix in refactoring sprint
              firstName: invitation.firstName,
              inviterName: 'System',
              workspaceName: workspace?.name || 'Your Organization',
              roleName: invitation.role || 'Team Member',
            }
          );

          await storage.updateEmployeeInvitation(invitation.id, {
            invitedAt: new Date(),
          });

          await logActionAudit({
            actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
            userRole: request.userRole, platformRole: request.platformRole,
            entityType: 'invitation', entityId: invitationId,
            success: true, message: `Invitation resent to ${invitation.email}`,
            durationMs: Date.now() - start,
          });
          return createResult(request.actionId, true, 'Invitation resent successfully', { invitationId }, start);
        }

        if (subAction === 'revoke') {
          // Consolidated from onboarding.revoke_invitation
          if (!invitationId) {
            return createResult(request.actionId, false, 'Invitation ID is required', null, start);
          }

          await storage.updateEmployeeInvitation(invitationId, {
            inviteStatus: 'revoked',
          });

          await logActionAudit({
            actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
            userRole: request.userRole, platformRole: request.platformRole,
            entityType: 'invitation', entityId: invitationId,
            success: true, message: `Invitation ${invitationId} revoked`,
            durationMs: Date.now() - start,
          });
          return createResult(request.actionId, true, 'Invitation revoked successfully', { invitationId }, start);
        }

        if (subAction === 'client_welcome') {
          // Consolidated from onboarding.send_client_welcome
          if (!email || !clientName) {
            return createResult(request.actionId, false, 'Email and clientName are required', null, start);
          }

          const workspace = await storage.getWorkspace(request.workspaceId!);
          // @ts-expect-error — TS migration: fix in refactoring sprint
          const _welcomeEmail = emailService.buildClientWelcomeEmail(clientId || '', email, clientName, companyName || '', workspace?.name || '');
          await NotificationDeliveryService.send({ type: 'client_welcome', workspaceId: request.workspaceId || 'system', recipientUserId: clientId || email, channel: 'email', body: _welcomeEmail });

          await logActionAudit({
            actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
            userRole: request.userRole, platformRole: request.platformRole,
            entityType: 'client', entityId: clientId ?? null,
            success: true, message: `Client welcome email sent to ${email}`,
            durationMs: Date.now() - start,
          });
          return createResult(request.actionId, true, 'Client welcome email sent', { clientId }, start);
        }

        // Default (action='send' or undefined): send new employee invitation
        if (!email || !firstName || !lastName) {
          return createResult(request.actionId, false, 'Email, firstName, and lastName are required', null, start);
        }

        // @ts-expect-error — TS migration: fix in refactoring sprint
        const invitation = await storage.createEmployeeInvitation({
          workspaceId: request.workspaceId!,
          email,
          firstName,
          lastName,
          role: role || 'employee',
          inviteStatus: 'pending',
        });

        const workspace = await storage.getWorkspace(request.workspaceId!);
        await emailService.sendEmployeeInvitation( // nds-exempt: one-time invite token delivery
          request.workspaceId!,
          email,
          invitation.inviteToken!,
          {
            firstName,
            inviterName: 'System',
            workspaceName: workspace?.name || 'Your Organization',
            roleName: role || 'Team Member',
          }
        );

        await logActionAudit({
          actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
          userRole: request.userRole, platformRole: request.platformRole,
          entityType: 'invitation', entityId: invitation.id,
          success: true, message: `Invitation sent to ${email} (${firstName} ${lastName})`,
          changesAfter: { email, firstName, lastName, role } as any, durationMs: Date.now() - start,
        });
        return createResult(request.actionId, true, 'Invitation sent successfully', { invitationId: invitation.id }, start);
      },
    };

    // onboarding.resend_invitation CONSOLIDATED into onboarding.invite (action='resend')
    // Handler kept for reference only — not registered separately:
    const resendInvitation: ActionHandler = {
      actionId: 'onboarding.resend_invitation',
      name: 'Resend Employee Invitation',
      category: 'lifecycle',
      description: 'Resend an invitation email to an employee',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { invitationId } = request.payload || {};
        const { storage } = await import('../../storage');
        const { emailService } = await import('../emailService');

        if (!invitationId) {
          return createResult(request.actionId, false, 'Invitation ID is required', null, start);
        }

        const invitation = await storage.getEmployeeInvitationById(invitationId);
        if (!invitation) {
          return createResult(request.actionId, false, 'Invitation not found', null, start);
        }

        const workspace = await storage.getWorkspace(invitation.workspaceId);
        await emailService.sendEmployeeInvitation( // nds-exempt: one-time invite token delivery
          invitation.workspaceId,
          invitation.email,
          invitation.inviteToken!,
          {
            // @ts-expect-error — TS migration: fix in refactoring sprint
            firstName: invitation.firstName,
            inviterName: 'System',
            workspaceName: workspace?.name || 'Your Organization',
            roleName: invitation.role || 'Team Member',
          }
        );

        await storage.updateEmployeeInvitation(invitation.id, {
          invitedAt: new Date(),
        });

        return createResult(request.actionId, true, 'Invitation resent successfully', { invitationId }, start);
      },
    };

    // onboarding.revoke_invitation CONSOLIDATED into onboarding.invite (action='revoke')
    // Handler kept for reference only — not registered separately:
    const revokeInvitation: ActionHandler = {
      actionId: 'onboarding.revoke_invitation',
      name: 'Revoke Employee Invitation',
      category: 'lifecycle',
      description: 'Revoke an outstanding employee invitation',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { invitationId } = request.payload || {};
        const { storage } = await import('../../storage');

        if (!invitationId) {
          return createResult(request.actionId, false, 'Invitation ID is required', null, start);
        }

        await storage.updateEmployeeInvitation(invitationId, {
          inviteStatus: 'revoked',
        });

        return createResult(request.actionId, true, 'Invitation revoked successfully', { invitationId }, start);
      },
    };

    // onboarding.send_client_welcome CONSOLIDATED into onboarding.invite (action='client_welcome')
    // Handler kept for reference only — not registered separately:
    const sendClientWelcome: ActionHandler = {
      actionId: 'onboarding.send_client_welcome',
      name: 'Send Client Welcome Email',
      category: 'lifecycle',
      description: 'Send a welcome email to a new client with portal access',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { clientId, email, clientName, companyName } = request.payload || {};
        const { emailService } = await import('../emailService');
        const { storage } = await import('../../storage');

        if (!email || !clientName) {
          return createResult(request.actionId, false, 'Email and clientName are required', null, start);
        }

        const workspace = await storage.getWorkspace(request.workspaceId!);
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const _welcomeEmail2 = emailService.buildClientWelcomeEmail(clientId || '', email, clientName, companyName || '', workspace?.name || '');
        await NotificationDeliveryService.send({ type: 'client_welcome', workspaceId: request.workspaceId || 'system', recipientUserId: clientId || email, channel: 'email', body: _welcomeEmail2 });

        return createResult(request.actionId, true, 'Client welcome email sent', { clientId }, start);
      },
    };

    const assignPlatformRole: ActionHandler = {
      actionId: 'platform_roles.assign',
      name: 'Assign Platform Role',
      category: 'lifecycle',
      description: 'Assign a platform-level role to a user',
      requiredRoles: ['root_admin', 'deputy_admin', 'sysop'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { userId, role, reason } = request.payload || {};
        const { platformRoles, users } = await import('@shared/schema');
        
        if (!userId || !role) {
          return createResult(request.actionId, false, 'userId and role are required', null, start);
        }

        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user) {
          return createResult(request.actionId, false, 'User not found', null, start);
        }

        await db.update(platformRoles)
          .set({ revokedAt: new Date(), revokedReason: 'Role changed via AI Brain' })
          .where(and(eq(platformRoles.userId, userId)));

        if (role !== 'none') {
          await db.insert(platformRoles).values({
            // @ts-expect-error — TS migration: fix in refactoring sprint
            workspaceId: PLATFORM_WORKSPACE_ID,
            userId,
            role,
            grantedBy: request.userId,
            grantedReason: reason || 'Assigned via AI Brain',
          });
        }

        return createResult(request.actionId, true, 'Platform role assigned successfully', { userId, role }, start);
      },
    };

    // platform_roles.assign — Phase 26A restored. Previously removed as a
    // duplicate of uacp.assign_platform_role, but that target was disabled as
    // non-MVP, leaving a dangling shim. Register directly with withAuditWrap
    // so the security-critical role assignment has a real handler and an
    // audit trail per CLAUDE.md §L.
    helpaiOrchestrator.registerAction(withAuditWrap(assignPlatformRole, 'platform_role'));

    // onboarding.get_platform_status CONSOLIDATED into onboarding.track (view='status') in domainSupervisorActions.ts
    // Handler kept for reference only — not registered separately:
    const getPlatformOnboarding: ActionHandler = {
      actionId: 'onboarding.get_platform_status',
      name: 'Get Platform Onboarding Status',
      category: 'lifecycle',
      description: 'Get onboarding status across all organizations',
      requiredRoles: ['system', 'support_agent', 'sysop', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { employeeInvitations } = await import('@shared/schema');

        const pending = await db.select({ count: sql`count(*)::int` })
          .from(employeeInvitations)
          .where(eq(employeeInvitations.inviteStatus, 'pending' as any));

        const accepted = await db.select({ count: sql`count(*)::int` })
          .from(employeeInvitations)
          .where(eq(employeeInvitations.inviteStatus, 'accepted' as any));

        const expired = await db.select({ count: sql`count(*)::int` })
          .from(employeeInvitations)
          .where(eq(employeeInvitations.inviteStatus, 'expired' as any));

        return createResult(request.actionId, true, 'Platform onboarding status retrieved', {
          pendingInvitations: pending[0]?.count || 0,
          acceptedInvitations: accepted[0]?.count || 0,
          expiredInvitations: expired[0]?.count || 0,
        }, start);
      },
    };

    // onboarding.gather_billing_preferences CONSOLIDATED into onboarding.recommend (type='billing_prefs') in domainSupervisorActions.ts
    // Handler kept for reference only — not registered separately:
    const gatherBillingPreferences: ActionHandler = {
      actionId: 'onboarding.gather_billing_preferences',
      name: 'Gather Client Billing Preferences During Onboarding',
      category: 'lifecycle',
      description: 'During client onboarding, gather and persist billing preferences. Accepts clientId plus optional: billingCycle (daily/weekly/bi_weekly/monthly), paymentTerms (net_7/net_15/net_30/net_60/due_on_receipt), defaultBillRate, invoiceFormat (summary/detailed/itemized), autoSendInvoice, invoiceRecipientEmails. Missing fields use workspace defaults.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        try {
          const { clientId, ...prefs } = request.payload || {};
          if (!clientId) return createResult(request.actionId, false, 'clientId required', null, start);

          const existing = await db
            .select()
            .from(clientBillingSettings)
            .where(
              and(
                eq(clientBillingSettings.workspaceId, request.workspaceId!),
                eq(clientBillingSettings.clientId, clientId)
              )
            )
            .limit(1);

          let settings;
          if (existing.length > 0) {
            [settings] = await db
              .update(clientBillingSettings)
              .set({ ...prefs, updatedAt: new Date() })
              .where(eq(clientBillingSettings.id, existing[0].id))
              .returning();
          } else {
            [settings] = await db
              .insert(clientBillingSettings)
              .values({ ...prefs, workspaceId: request.workspaceId!, clientId })
              .returning();
          }

          const summary = [
            prefs.billingCycle ? `Billing: ${prefs.billingCycle}` : null,
            prefs.paymentTerms ? `Terms: ${prefs.paymentTerms}` : null,
            prefs.defaultBillRate ? `Rate: $${prefs.defaultBillRate}/hr` : null,
            prefs.autoSendInvoice ? 'Auto-send: enabled' : null,
          ].filter(Boolean).join(', ');

          return createResult(request.actionId, true,
            `Billing preferences saved for client ${clientId}: ${summary || 'defaults applied'}`,
            settings, start);
        } catch (error: any) {
          return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
        }
      },
    };

    // onboarding.get_checklist — CONSOLIDATED into onboarding.track (view='checklist') in domainSupervisorActions.ts
    // helpaiOrchestrator.registerAction(getChecklist);

    // onboarding.invite — consolidated action (replaces send_invitation, resend_invitation, revoke_invitation, send_client_welcome)
    helpaiOrchestrator.registerAction(withAuditWrap(sendInvitation, 'invitation'));

    // onboarding.resend_invitation — CONSOLIDATED into onboarding.invite (action='resend')
    // helpaiOrchestrator.registerAction(resendInvitation);

    // onboarding.revoke_invitation — CONSOLIDATED into onboarding.invite (action='revoke')
    // helpaiOrchestrator.registerAction(revokeInvitation);

    // onboarding.send_client_welcome — CONSOLIDATED into onboarding.invite (action='client_welcome')
    // helpaiOrchestrator.registerAction(sendClientWelcome);

    // platform_roles.assign — Phase 26A: restored as canonical handler above.
    // uacp.assign_platform_role target was disabled as non-MVP, leaving a
    // dangling shim. Shim removed in actionCompatibilityShims.ts.

    // onboarding.get_platform_status — CONSOLIDATED into onboarding.track (view='status') in domainSupervisorActions.ts
    // helpaiOrchestrator.registerAction(getPlatformOnboarding);

    // onboarding.gather_billing_preferences — CONSOLIDATED into onboarding.recommend (type='billing_prefs') in domainSupervisorActions.ts
    // helpaiOrchestrator.registerAction(gatherBillingPreferences);
  }
  // ============================================================================
  // BULK OPERATION ACTIONS
  // ============================================================================

  private registerBulkOperationActions(): void {
    const bulkImportEmployees: ActionHandler = {
      actionId: 'employees.import',
      name: 'Bulk Import Employees',
      category: 'scheduling',
      description: 'Import multiple employees from CSV data',
      requiredRoles: ['system', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const rows = request.payload?.data as Array<{
          firstName: string;
          lastName: string;
          email: string;
          phone?: string;
          role?: string;
        }>;

        const imported: any[] = [];
        const errors: any[] = [];

        for (const row of rows) {
          try {
            const [emp] = await db.insert(employees).values({
              workspaceId: request.workspaceId!,
              firstName: row.firstName,
              lastName: row.lastName,
              email: row.email,
              phone: row.phone,
              role: row.role || 'employee',
              isActive: true,
            }).returning();
            imported.push(emp);
          } catch (error: any) {
            errors.push({ row, error: (error instanceof Error ? error.message : String(error)) });
          }
        }

        await logActionAudit({
          actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
          userRole: request.userRole, platformRole: request.platformRole,
          entityType: 'employee', entityId: null,
          success: true, message: `Bulk import: ${imported.length} employees created, ${errors.length} errors`,
          changesAfter: { importedCount: imported.length, errorCount: errors.length } as any,
          durationMs: Date.now() - start,
        });
        return createResult(
          request.actionId,
          true,
          `Imported ${imported.length} employees with ${errors.length} errors`,
          { imported: imported.length, errors: errors.length, errorDetails: errors },
          start
        );
      },
    };

    const bulkExportEmployees: ActionHandler = {
      actionId: 'employees.export',
      name: 'Bulk Export Employees',
      category: 'scheduling',
      description: 'Export all employees to CSV format',
      requiredRoles: ['system', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { exportEmployees } = await import('../exportService');
        const result = await exportEmployees(request.workspaceId!, { format: request.payload?.format || 'csv' });
        return createResult(request.actionId, true, `Employees exported`, result, start);
      },
    };

    helpaiOrchestrator.registerAction(withAuditWrap(bulkImportEmployees, 'employee'));
    helpaiOrchestrator.registerAction(withAuditWrap(bulkExportEmployees, 'employee'));
  }

  // ============================================================================
  // INTEGRATION ACTIONS
  // ============================================================================

  private registerIntegrationActions(): void {
    const getIntegrationStatus: ActionHandler = {
      actionId: 'integrations.get_status',
      name: 'Get Integration Status',
      category: 'integration',
      description: 'Get the connection status of all integrations',
      requiredRoles: ['owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const integrations = {
          quickbooks: !!process.env.QUICKBOOKS_CLIENT_ID,
          gusto: !!process.env.GUSTO_CLIENT_ID,
          stripe: !!process.env.STRIPE_SECRET_KEY,
          resend: !!process.env.RESEND_API_KEY,
          twilio: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
        };
        return createResult(request.actionId, true, `Integration status retrieved`, integrations, start);
      },
    };

    const listIntegrations: ActionHandler = {
      actionId: 'integrations.list',
      name: 'List Integrations',
      category: 'integration',
      description: 'List all available integrations and their status',
      requiredRoles: ['owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const integrationList = [
          { id: 'quickbooks', name: 'QuickBooks', category: 'accounting', connected: !!process.env.QUICKBOOKS_CLIENT_ID },
          { id: 'gusto', name: 'Gusto', category: 'payroll', connected: !!process.env.GUSTO_CLIENT_ID },
          { id: 'stripe', name: 'Stripe', category: 'payments', connected: !!process.env.STRIPE_SECRET_KEY },
          { id: 'resend', name: 'Resend', category: 'email', connected: !!process.env.RESEND_API_KEY },
          { id: 'twilio', name: 'Twilio', category: 'sms', connected: !!process.env.TWILIO_ACCOUNT_SID },
        ];
        return createResult(request.actionId, true, `Integrations listed`, integrationList, start);
      },
    };

    helpaiOrchestrator.registerAction(withAuditWrap(getIntegrationStatus, 'integration'));
    helpaiOrchestrator.registerAction(withAuditWrap(listIntegrations, 'integration'));
  }

  // ============================================================================
  // STRATEGIC BUSINESS OPTIMIZATION ACTIONS
  // ============================================================================

  private registerStrategicOptimizationActions(): void {
    const generateStrategicSchedule: ActionHandler = {
      actionId: 'strategic.generate_schedule',
      name: 'Generate Strategic Schedule',
      category: 'strategic',
      description: 'Generate profit-first strategic schedule using business intelligence',
      requiredRoles: ['owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { schedulingSubagent } = await import('./subagents/schedulingSubagent');
        const result = await schedulingSubagent.generateStrategicSchedule(
          request.workspaceId!,
          request.payload?.openShifts || []
        );
        return createResult(request.actionId, true, `Strategic schedule generated: ${result.schedule.length} assignments, $${result.businessMetrics.totalProfit} profit`, result, start);
      },
    };

    const getEmployeeBusinessMetrics: ActionHandler = {
      actionId: 'strategic.get_employee_metrics',
      name: 'Get Employee Business Metrics',
      category: 'strategic',
      description: 'Get strategic employee scoring and performance metrics',
      requiredRoles: ['system', 'owner', 'root_admin', 'manager'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { strategicOptimizationService } = await import('./strategicOptimizationService');
        const metrics = await strategicOptimizationService.getEmployeeBusinessMetrics(request.workspaceId!);
        return createResult(request.actionId, true, `Retrieved metrics for ${metrics.length} employees`, { employees: metrics, count: metrics.length }, start);
      },
    };

    const getClientBusinessMetrics: ActionHandler = {
      actionId: 'strategic.get_client_metrics',
      name: 'Get Client Business Metrics',
      category: 'strategic',
      description: 'Get strategic client tiering and value metrics',
      requiredRoles: ['system', 'owner', 'root_admin', 'manager'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { strategicOptimizationService } = await import('./strategicOptimizationService');
        const metrics = await strategicOptimizationService.getClientBusinessMetrics(request.workspaceId!);
        return createResult(request.actionId, true, `Retrieved metrics for ${metrics.length} clients`, { clients: metrics, count: metrics.length }, start);
      },
    };

    const getStrategicContext: ActionHandler = {
      actionId: 'strategic.get_context',
      name: 'Get Strategic Business Context',
      category: 'strategic',
      description: 'Get full strategic business context for AI scheduling',
      requiredRoles: ['owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { strategicOptimizationService } = await import('./strategicOptimizationService');
        const context = await strategicOptimizationService.generateStrategicContext(request.workspaceId!);
        return createResult(request.actionId, true, `Strategic context: ${context.summary.totalEmployees} employees, ${context.clients.length} clients`, context, start);
      },
    };

    const calculateShiftProfit: ActionHandler = {
      actionId: 'strategic.calculate_shift_profit',
      name: 'Calculate Shift Profit',
      category: 'strategic',
      description: 'Calculate profit metrics for a specific employee-shift assignment',
      requiredRoles: ['system', 'owner', 'root_admin', 'manager'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { strategicOptimizationService } = await import('./strategicOptimizationService');
        const profit = strategicOptimizationService.calculateShiftProfit({
          billableRate: request.payload?.billableRate || 0,
          employeeCostPerHour: request.payload?.employeeCost || 0,
          shiftDurationHours: request.payload?.durationHours || 8,
          employeeScore: request.payload?.employeeScore || 75,
          clientTier: request.payload?.clientTier || 'standard',
          clientIsAtRisk: request.payload?.clientIsAtRisk || false,
          employeeNoShows: request.payload?.employeeNoShows || 0,
          employeeCallIns: request.payload?.employeeCallIns || 0,
          employeeClientComplaints: request.payload?.employeeClientComplaints || 0,
        });
        return createResult(request.actionId, true, `Shift profit: $${profit.totalProfit.toFixed(2)} (${profit.profitMargin.toFixed(1)}% margin), recommendation: ${profit.recommendation}`, profit, start);
      },
    };

    const getAtRiskClients: ActionHandler = {
      actionId: 'strategic.get_at_risk_clients',
      name: 'Get At-Risk Clients',
      category: 'strategic',
      description: 'Get list of clients flagged as at-risk of churn',
      requiredRoles: ['system', 'owner', 'root_admin', 'manager'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { strategicOptimizationService } = await import('./strategicOptimizationService');
        const clients = await strategicOptimizationService.getClientBusinessMetrics(request.workspaceId!);
        const atRisk = clients.filter(c => c.isAtRisk);
        return createResult(request.actionId, true, `Found ${atRisk.length} at-risk clients requiring attention`, { atRiskClients: atRisk, count: atRisk.length }, start);
      },
    };

    const getTopPerformers: ActionHandler = {
      actionId: 'strategic.get_top_performers',
      name: 'Get Top Performing Employees',
      category: 'strategic',
      description: 'Get list of top-performing employees (score 85+)',
      requiredRoles: ['owner', 'root_admin', 'manager'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { strategicOptimizationService } = await import('./strategicOptimizationService');
        const employees = await strategicOptimizationService.getEmployeeBusinessMetrics(request.workspaceId!);
        const topPerformers = employees.filter(e => e.overallScore >= 85).sort((a, b) => b.overallScore - a.overallScore);
        return createResult(request.actionId, true, `Found ${topPerformers.length} top performers`, { topPerformers, count: topPerformers.length }, start);
      },
    };

    const getProblematicEmployees: ActionHandler = {
      actionId: 'strategic.get_problematic_employees',
      name: 'Get Problematic Employees',
      category: 'strategic',
      description: 'Get list of employees with performance issues (low scores or no-shows)',
      requiredRoles: ['system', 'owner', 'root_admin', 'manager'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { strategicOptimizationService } = await import('./strategicOptimizationService');
        const employees = await strategicOptimizationService.getEmployeeBusinessMetrics(request.workspaceId!);
        const problematic = employees.filter(e => e.overallScore < 60 || e.noShows > 2 || e.clientComplaints > 2);
        return createResult(request.actionId, true, `Found ${problematic.length} employees needing attention`, { problematicEmployees: problematic, count: problematic.length }, start);
      },
    };

    helpaiOrchestrator.registerAction(withAuditWrap(generateStrategicSchedule, 'schedule'));
    helpaiOrchestrator.registerAction(withAuditWrap(getEmployeeBusinessMetrics, 'employee'));
    helpaiOrchestrator.registerAction(withAuditWrap(getClientBusinessMetrics, 'client'));
    helpaiOrchestrator.registerAction(withAuditWrap(getStrategicContext, 'workspace'));
    helpaiOrchestrator.registerAction(withAuditWrap(calculateShiftProfit, 'shift'));
    helpaiOrchestrator.registerAction(withAuditWrap(getAtRiskClients, 'client'));
    helpaiOrchestrator.registerAction(withAuditWrap(getTopPerformers, 'employee'));
    helpaiOrchestrator.registerAction(withAuditWrap(getProblematicEmployees, 'employee'));
  }

  // ============================================================================
  // CONTRACT PIPELINE ACTIONS
  // ============================================================================

  private registerContractPipelineActions(): void {
    const getContractStats: ActionHandler = {
      actionId: 'contracts.get_stats',
      name: 'Get Contract Pipeline Statistics',
      category: 'billing',
      description: 'Get contract pipeline statistics including proposals, contracts, and conversion rates',
      requiredRoles: ['system', 'owner', 'manager', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { contractPipelineService } = await import('../contracts/contractPipelineService');
        const stats = await contractPipelineService.getStatistics(request.workspaceId!);
        return createResult(request.actionId, true, `Contract stats: ${stats.totalContracts} contracts, ${stats.pendingSignatures} pending signatures, $${stats.totalContractValue.toFixed(2)} total value`, stats, start);
      },
    };

    const getPendingSignatures: ActionHandler = {
      actionId: 'contracts.get_pending_signatures',
      name: 'Get Pending Signatures',
      category: 'billing',
      description: 'Get contracts waiting for client signatures',
      requiredRoles: ['system', 'owner', 'manager', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { contractPipelineService } = await import('../contracts/contractPipelineService');
        const contracts = await contractPipelineService.getContracts(request.workspaceId!, { status: 'pending_signatures' });
        return createResult(request.actionId, true, `Found ${(contracts as any).length} contracts awaiting signatures`, { contracts, count: (contracts as any).length }, start);
      },
    };

    const getExpiringContracts: ActionHandler = {
      actionId: 'contracts.get_expiring',
      name: 'Get Expiring Contracts',
      category: 'billing',
      description: 'Get contracts expiring within 30 days',
      requiredRoles: ['system', 'owner', 'manager', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { contractPipelineService } = await import('../contracts/contractPipelineService');
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const contracts = await contractPipelineService.getContracts(request.workspaceId!, { expiresBy: thirtyDaysFromNow });
        return createResult(request.actionId, true, `Found ${(contracts as any).length} contracts expiring in next 30 days`, { contracts, count: (contracts as any).length }, start);
      },
    };

    const getContractUsage: ActionHandler = {
      actionId: 'contracts.get_usage',
      name: 'Get Contract Pipeline Usage',
      category: 'billing',
      description: 'Get current month contract pipeline quota usage',
      requiredRoles: ['system', 'owner', 'manager', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { contractPipelineService } = await import('../contracts/contractPipelineService');
        const usage = await contractPipelineService.getUsage(request.workspaceId!);
        const status = usage.isUnlimited ? 'unlimited' : `${usage.quotaUsed}/${usage.quotaLimit} used (${usage.remaining} remaining)`;
        return createResult(request.actionId, true, `Contract quota: ${status}`, usage, start);
      },
    };

    const getContractTemplates: ActionHandler = {
      actionId: 'contracts.get_templates',
      name: 'Get Contract Templates',
      category: 'billing',
      description: 'Get available contract templates',
      requiredRoles: ['system', 'owner', 'manager', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { contractPipelineService } = await import('../contracts/contractPipelineService');
        const templates = await contractPipelineService.getTemplates(request.workspaceId!);
        return createResult(request.actionId, true, `Found ${templates.length} contract templates`, { templates, count: templates.length }, start);
      },
    };

    const searchContracts: ActionHandler = {
      actionId: 'contracts.search',
      name: 'Search Contracts',
      category: 'billing',
      description: 'Search contracts by client name, title, or content',
      requiredRoles: ['system', 'owner', 'manager', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { contractPipelineService } = await import('../contracts/contractPipelineService');
        const searchTerm = request.payload?.query || '';
        const contracts = await contractPipelineService.getContracts(request.workspaceId!, {});
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const filtered = (contracts as any).filter(c => 
          c.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.title?.toLowerCase().includes(searchTerm.toLowerCase())
        );
        return createResult(request.actionId, true, `Found ${filtered.length} contracts matching "${searchTerm}"`, { contracts: filtered, count: filtered.length }, start);
      },
    };

    const getContractAuditTrail: ActionHandler = {
      actionId: 'contracts.get_audit_trail',
      name: 'Get Contract Audit Trail',
      category: 'billing',
      description: 'Get audit trail for a specific contract',
      requiredRoles: ['system', 'owner', 'manager', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { contractPipelineService } = await import('../contracts/contractPipelineService');
        const contractId = request.payload?.contractId;
        if (!contractId) {
          return createResult(request.actionId, false, 'Contract ID is required', null, start);
        }
        const auditTrail = await contractPipelineService.getAuditTrail(contractId);
        return createResult(request.actionId, true, `Found ${auditTrail.length} audit entries`, { auditTrail, count: auditTrail.length }, start);
      },
    };

    helpaiOrchestrator.registerAction(withAuditWrap(getContractStats, 'contract'));
    helpaiOrchestrator.registerAction(withAuditWrap(getPendingSignatures, 'contract'));
    helpaiOrchestrator.registerAction(withAuditWrap(getExpiringContracts, 'contract'));
    helpaiOrchestrator.registerAction(withAuditWrap(getContractUsage, 'contract'));
    helpaiOrchestrator.registerAction(withAuditWrap(getContractTemplates, 'contract'));
    helpaiOrchestrator.registerAction(withAuditWrap(searchContracts, 'contract'));
    helpaiOrchestrator.registerAction(withAuditWrap(getContractAuditTrail, 'contract'));
  }

  // ============================================================================
  // MEMORY OPTIMIZATION ACTIONS (Trinity Self-Optimization)
  // ============================================================================

  private registerMemoryOptimizationActions(): void {
    const getMemoryHealth: ActionHandler = {
      actionId: 'memory.get_health',
      name: 'Get Memory Health Report',
      category: 'system',
      description: 'Get a full health diagnostic of Trinity memory systems including table sizes, retention status, and optimization recommendations',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        try {
          const { trinityMemoryOptimizer } = await import('./trinityMemoryOptimizer');
          const health = await trinityMemoryOptimizer.getMemoryHealth();
          return createResult(request.actionId, true, `Memory health: ${health.overallHealth} (score: ${health.healthScore}/100, ${health.totalRecordsManaged} records managed)`, health, start);
        } catch (error: any) {
          return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
        }
      },
    };

    const optimizeMemory: ActionHandler = {
      actionId: 'memory.optimize',
      name: 'Run Memory Optimization',
      category: 'system',
      description: 'Run full memory optimization: cleanup old records, decay stale knowledge confidence, prune dead entities, consolidate duplicates. This permanently removes expired data.',
      requiredRoles: ['sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        try {
          const { trinityMemoryOptimizer } = await import('./trinityMemoryOptimizer');
          if (trinityMemoryOptimizer.isCurrentlyOptimizing()) {
            return createResult(request.actionId, false, 'Optimization already in progress', null, start);
          }
          const results = await trinityMemoryOptimizer.runFullOptimization(false);
          const totalDeleted = results.reduce((s, r) => s + r.recordsDeleted, 0);
          const totalDecayed = results.reduce((s, r) => s + r.recordsDecayed, 0);
          const totalConsolidated = results.reduce((s, r) => s + r.recordsConsolidated, 0);
          const failures = results.filter(r => !r.success);
          const success = failures.length === 0;
          await logActionAudit({
            actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
            userRole: request.userRole, platformRole: request.platformRole,
            entityType: 'memory', entityId: null,
            success,
            message: `Memory optimization: ${totalDeleted} deleted, ${totalDecayed} decayed, ${totalConsolidated} consolidated`,
            changesAfter: { totalDeleted, totalDecayed, totalConsolidated, failures: failures.length } as any,
            durationMs: Date.now() - start,
          });
          return createResult(request.actionId, success,
            `Optimization complete: ${totalDeleted} deleted, ${totalDecayed} decayed, ${totalConsolidated} consolidated${failures.length > 0 ? ` (${failures.length} failures)` : ''}`,
            results, start);
        } catch (error: any) {
          return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
        }
      },
    };

    const optimizeDryRun: ActionHandler = {
      actionId: 'memory.optimize_dry_run',
      name: 'Memory Optimization Dry Run',
      category: 'system',
      description: 'Preview what a full memory optimization would do without making any changes. Shows counts of records that would be affected.',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        try {
          const { trinityMemoryOptimizer } = await import('./trinityMemoryOptimizer');
          const results = await trinityMemoryOptimizer.runFullOptimization(true);
          const totalWouldProcess = results.reduce((s, r) => s + r.recordsProcessed, 0);
          return createResult(request.actionId, true,
            `Dry run: ${totalWouldProcess} records would be affected across ${results.length} optimization jobs`,
            results, start);
        } catch (error: any) {
          return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
        }
      },
    };

    const getRetentionPolicies: ActionHandler = {
      actionId: 'memory.get_policies',
      name: 'Get Memory Retention Policies',
      category: 'system',
      description: 'View the retention policies for all Trinity memory tables including retention periods and cleanup strategies',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        try {
          const { trinityMemoryOptimizer } = await import('./trinityMemoryOptimizer');
          const policies = trinityMemoryOptimizer.getRetentionPolicies();
          return createResult(request.actionId, true, `${policies.length} retention policies configured`, policies, start);
        } catch (error: any) {
          return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
        }
      },
    };

    const getOptimizationHistory: ActionHandler = {
      actionId: 'memory.get_history',
      name: 'Get Optimization History',
      category: 'system',
      description: 'View the history of recent memory optimization runs with their results',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        try {
          const { trinityMemoryOptimizer } = await import('./trinityMemoryOptimizer');
          const history = trinityMemoryOptimizer.getOptimizationHistory();
          return createResult(request.actionId, true, `${history.length} optimization runs in history`, history, start);
        } catch (error: any) {
          return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
        }
      },
    };

    helpaiOrchestrator.registerAction(withAuditWrap(getMemoryHealth, 'memory'));
    helpaiOrchestrator.registerAction(withAuditWrap(optimizeMemory, 'memory'));
    helpaiOrchestrator.registerAction(withAuditWrap(optimizeDryRun, 'memory'));
    helpaiOrchestrator.registerAction(withAuditWrap(getRetentionPolicies, 'memory'));
    helpaiOrchestrator.registerAction(withAuditWrap(getOptimizationHistory, 'memory'));
  }

  // ============================================================================
  // BILLING & PAYROLL SETTINGS ACTIONS
  // ============================================================================

  private registerBillingSettingsActions(): void {
    const getWorkspaceBillingSettings: ActionHandler = {
      actionId: 'billing.settings',
      name: 'Billing Settings',
      category: 'billing',
      description: 'Consolidated billing settings action. Dispatch via payload.entity (workspace|client) and payload.action (get|set|list|learn). Defaults to get workspace settings.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const entity = request.payload?.entity;
        const action = request.payload?.action;

        try {
          // action=learn → learn billing preference logic
          if (action === 'learn') {
            const { preferenceType, entityId, value, confidence, source } = request.payload || {};
            const learnEntity = entity || 'workspace';

            if (learnEntity === 'client' && entityId && preferenceType && value) {
              const fieldMap: Record<string, string> = {
                billing_cycle: 'billingCycle',
                payment_terms: 'paymentTerms',
                bill_rate: 'defaultBillRate',
                pay_rate: 'defaultPayRate',
              };
              const field = fieldMap[preferenceType];
              if (field && (confidence || 0) >= 0.8) {
                const existing = await db
                  .select()
                  .from(clientBillingSettings)
                  .where(
                    and(
                      eq(clientBillingSettings.workspaceId, request.workspaceId!),
                      eq(clientBillingSettings.clientId, entityId)
                    )
                  )
                  .limit(1);

                if (existing.length > 0) {
                  await db
                    .update(clientBillingSettings)
                    .set({ [field]: value, updatedAt: new Date() })
                    .where(eq(clientBillingSettings.id, existing[0].id));
                } else {
                  await db
                    .insert(clientBillingSettings)
                    .values({ workspaceId: request.workspaceId!, clientId: entityId, [field]: value });
                }
              }
            }

            await logActionAudit({
              actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
              userRole: request.userRole, platformRole: request.platformRole,
              entityType: 'billing_preference', entityId: entityId ?? null,
              success: true,
              message: `Learned ${preferenceType} for ${learnEntity} ${entityId || ''} (confidence: ${confidence || 'unknown'})`,
              payload: request.payload as any, durationMs: Date.now() - start,
            });
            return createResult(request.actionId, true,
              `Learned ${preferenceType} preference for ${learnEntity} ${entityId || ''} (confidence: ${confidence || 'unknown'}, source: ${source || 'unknown'})`,
              request.payload, start);
          }

          // entity=client, action=list → list all client billing settings
          if (entity === 'client' && action === 'list') {
            const settings = await db
              .select({
                billingSettings: clientBillingSettings,
                clientName: clients.companyName,
              })
              .from(clientBillingSettings)
              .leftJoin(clients, eq(clientBillingSettings.clientId, clients.id))
              .where(eq(clientBillingSettings.workspaceId, request.workspaceId!));

            return createResult(request.actionId, true,
              `${settings.length} client(s) with custom billing settings`,
              settings, start);
          }

          // entity=client, action=set → set client billing settings
          if (entity === 'client' && action === 'set') {
            const { clientId, ...payload } = request.payload || {};
            if (!clientId) return createResult(request.actionId, false, 'clientId required', null, start);

            const existing = await db
              .select()
              .from(clientBillingSettings)
              .where(
                and(
                  eq(clientBillingSettings.workspaceId, request.workspaceId!),
                  eq(clientBillingSettings.clientId, clientId)
                )
              )
              .limit(1);

            let settings;
            if (existing.length > 0) {
              [settings] = await db
                .update(clientBillingSettings)
                .set({ ...payload, updatedAt: new Date() })
                .where(eq(clientBillingSettings.id, existing[0].id))
                .returning();
            } else {
              [settings] = await db
                .insert(clientBillingSettings)
                .values({ ...payload, workspaceId: request.workspaceId!, clientId })
                .returning();
            }
            await logActionAudit({
              actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
              userRole: request.userRole, platformRole: request.platformRole,
              entityType: 'client_billing_settings', entityId: clientId,
              success: true, message: `Client ${clientId} billing settings updated`,
              changesAfter: settings as any, durationMs: Date.now() - start,
            });
            return createResult(request.actionId, true, `Client ${clientId} billing settings updated`, settings, start);
          }

          // entity=client, action=get → get client billing settings
          if (entity === 'client' && action === 'get') {
            const clientId = request.payload?.clientId;
            if (!clientId) return createResult(request.actionId, false, 'clientId required', null, start);

            const [settings] = await db
              .select()
              .from(clientBillingSettings)
              .where(
                and(
                  eq(clientBillingSettings.workspaceId, request.workspaceId!),
                  eq(clientBillingSettings.clientId, clientId)
                )
              )
              .limit(1);

            return createResult(request.actionId, true,
              settings ? `Billing settings for client ${clientId}` : 'No custom settings - using workspace defaults',
              settings, start);
          }

          // entity=workspace, action=set → set workspace billing settings
          if (entity === 'workspace' && action === 'set') {
            const payload = request.payload || {};
            // CATEGORY C — Raw SQL retained: ::jsonb | Tables: workspaces | Verified: 2026-03-23
            await typedExec(sql`
              UPDATE workspaces
              SET billing_settings_blob = billing_settings_blob || ${JSON.stringify(payload)}::jsonb,
                  updated_at = NOW()
              WHERE id = ${request.workspaceId!}
            `);
            await logActionAudit({
              actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
              userRole: request.userRole, platformRole: request.platformRole,
              entityType: 'workspace_billing_settings', entityId: request.workspaceId ?? null,
              success: true, message: 'Workspace billing settings updated',
              changesAfter: payload as any, durationMs: Date.now() - start,
            });
            return createResult(request.actionId, true, 'Workspace billing settings updated', payload, start);
          }

          // Default: entity=workspace, action=get (or no entity/action specified for backward compat)
          // CATEGORY C — Raw SQL retained: LIMIT | Tables: workspaces | Verified: 2026-03-23
          const result = await typedQuery(sql`
            SELECT payroll_schedule, payroll_day_of_week, payroll_day_of_month, payroll_cutoff_day,
                   billing_cycle_day, billing_preferences, billing_settings_blob,
                   platform_fee_percentage, auto_payroll_enabled
            FROM workspaces WHERE id = ${request.workspaceId!} LIMIT 1
          `);
          const settings = (result as any[])[0];
          return createResult(request.actionId, true,
            settings ? 'Workspace billing settings retrieved' : 'No billing settings found',
            settings || { payrollCycle: 'bi_weekly', defaultBillingCycle: 'monthly', defaultPaymentTerms: 'net_30' },
            start);
        } catch (error: any) {
          return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
        }
      },
    };

    const setWorkspaceBillingSettings: ActionHandler = {
      actionId: 'billing.set_workspace_settings',
      name: 'Set Workspace Billing Settings',
      category: 'billing',
      description: 'Configure workspace billing settings. Accepts: payrollCycle (daily/weekly/bi_weekly/semi_monthly/monthly), defaultBillingCycle, defaultPaymentTerms (net_7/net_15/net_30/net_60/due_on_receipt), overtime thresholds and multipliers, invoice automation',
      requiredRoles: ['system', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        try {
          const payload = request.payload || {};
          // CATEGORY C — Raw SQL retained: ::jsonb | Tables: workspaces | Verified: 2026-03-23
          await typedExec(sql`
            UPDATE workspaces
            SET billing_settings_blob = billing_settings_blob || ${JSON.stringify(payload)}::jsonb,
                updated_at = NOW()
            WHERE id = ${request.workspaceId!}
          `);
          return createResult(request.actionId, true, 'Workspace billing settings updated', payload, start);
        } catch (error: any) {
          return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
        }
      },
    };

    const getClientBillingSettings: ActionHandler = {
      actionId: 'billing.get_client_settings',
      name: 'Get Client Billing Settings',
      category: 'billing',
      description: 'Get billing settings for a specific client. Provide clientId in payload. Returns the client billing cycle, payment terms, rates, and invoice preferences that override workspace defaults.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        try {
          const clientId = request.payload?.clientId;
          if (!clientId) return createResult(request.actionId, false, 'clientId required', null, start);

          const [settings] = await db
            .select()
            .from(clientBillingSettings)
            .where(
              and(
                eq(clientBillingSettings.workspaceId, request.workspaceId!),
                eq(clientBillingSettings.clientId, clientId)
              )
            )
            .limit(1);

          return createResult(request.actionId, true,
            settings ? `Billing settings for client ${clientId}` : 'No custom settings - using workspace defaults',
            settings, start);
        } catch (error: any) {
          return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
        }
      },
    };

    const setClientBillingSettings: ActionHandler = {
      actionId: 'billing.set_client_settings',
      name: 'Set Client Billing Settings',
      category: 'billing',
      description: 'Configure per-client billing overrides. Accepts clientId plus: billingCycle (daily/weekly/bi_weekly/monthly), paymentTerms, defaultBillRate, defaultPayRate, overtimeBillMultiplier, overtimePayMultiplier, invoiceFormat, autoSendInvoice, invoiceRecipientEmails',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        try {
          const { clientId, ...payload } = request.payload || {};
          if (!clientId) return createResult(request.actionId, false, 'clientId required', null, start);

          const existing = await db
            .select()
            .from(clientBillingSettings)
            .where(
              and(
                eq(clientBillingSettings.workspaceId, request.workspaceId!),
                eq(clientBillingSettings.clientId, clientId)
              )
            )
            .limit(1);

          let settings;
          if (existing.length > 0) {
            [settings] = await db
              .update(clientBillingSettings)
              .set({ ...payload, updatedAt: new Date() })
              .where(eq(clientBillingSettings.id, existing[0].id))
              .returning();
          } else {
            [settings] = await db
              .insert(clientBillingSettings)
              .values({ ...payload, workspaceId: request.workspaceId!, clientId })
              .returning();
          }
          return createResult(request.actionId, true, `Client ${clientId} billing settings updated`, settings, start);
        } catch (error: any) {
          return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
        }
      },
    };

    const listClientBillingSettings: ActionHandler = {
      actionId: 'billing.list_client_settings',
      name: 'List All Client Billing Settings',
      category: 'billing',
      description: 'List billing settings for all clients in the workspace, showing which clients have custom billing cycles different from the workspace default',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        try {
          const settings = await db
            .select({
              billingSettings: clientBillingSettings,
              clientName: clients.companyName,
            })
            .from(clientBillingSettings)
            .leftJoin(clients, eq(clientBillingSettings.clientId, clients.id))
            .where(eq(clientBillingSettings.workspaceId, request.workspaceId!));

          return createResult(request.actionId, true,
            `${settings.length} client(s) with custom billing settings`,
            settings, start);
        } catch (error: any) {
          return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
        }
      },
    };

    const learnBillingPreference: ActionHandler = {
      actionId: 'billing.learn_preference',
      name: 'Learn Billing Preference',
      category: 'billing',
      description: 'Record a learned billing/payroll preference from user conversation or onboarding. Accepts: preferenceType (billing_cycle/payment_terms/payroll_schedule/overtime_rules), entity (workspace/client), entityId, value, confidence (0-1), source (conversation/onboarding/migration)',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        try {
          const { preferenceType, entity, entityId, value, confidence, source } = request.payload || {};

          if (entity === 'client' && entityId && preferenceType && value) {
            const fieldMap: Record<string, string> = {
              billing_cycle: 'billingCycle',
              payment_terms: 'paymentTerms',
              bill_rate: 'defaultBillRate',
              pay_rate: 'defaultPayRate',
            };
            const field = fieldMap[preferenceType];
            if (field && (confidence || 0) >= 0.8) {
              const existing = await db
                .select()
                .from(clientBillingSettings)
                .where(
                  and(
                    eq(clientBillingSettings.workspaceId, request.workspaceId!),
                    eq(clientBillingSettings.clientId, entityId)
                  )
                )
                .limit(1);

              if (existing.length > 0) {
                await db
                  .update(clientBillingSettings)
                  .set({ [field]: value, updatedAt: new Date() })
                  .where(eq(clientBillingSettings.id, existing[0].id));
              } else {
                await db
                  .insert(clientBillingSettings)
                  .values({ workspaceId: request.workspaceId!, clientId: entityId, [field]: value });
              }
            }
          }

          return createResult(request.actionId, true,
            `Learned ${preferenceType} preference for ${entity} ${entityId || ''} (confidence: ${confidence || 'unknown'}, source: ${source || 'unknown'})`,
            request.payload, start);
        } catch (error: any) {
          return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
        }
      },
    };

    helpaiOrchestrator.registerAction(withAuditWrap(getWorkspaceBillingSettings, 'billing_settings')); // billing.settings (consolidated)
    // Consolidated into billing.settings — not registering separately:
    // helpaiOrchestrator.registerAction(setWorkspaceBillingSettings);
    // helpaiOrchestrator.registerAction(getClientBillingSettings);
    // helpaiOrchestrator.registerAction(setClientBillingSettings);
    // helpaiOrchestrator.registerAction(listClientBillingSettings);
    // helpaiOrchestrator.registerAction(learnBillingPreference);

    // Phase 30: workspace.tier.status — canonical tier/seat status for Trinity
    const getWorkspaceTierStatus: ActionHandler = {
      actionId: 'workspace.tier.status',
      name: 'Workspace Tier Status',
      category: 'billing',
      description: 'Returns the workspace\'s current subscription tier, seat usage vs. limit, available features for this tier, and upgrade path options. Use this to answer "what plan am I on?", "how many seats do I have left?", or "what features are available to me?"',
      requiredRoles: ['manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        try {
          if (!request.workspaceId) return createResult(request.actionId, false, 'workspaceId required', null, start);

          // CATEGORY C — Raw SQL retained: LIMIT 1 | Tables: workspaces | Verified: Phase-30
          const result = await typedQuery(sql`
            SELECT subscription_tier, subscription_status,
                   (SELECT COUNT(*) FROM employees WHERE workspace_id = ${request.workspaceId} AND status = 'active') AS active_employees
            FROM workspaces WHERE id = ${request.workspaceId} LIMIT 1
          `);

          const row = (result as any[])[0];
          if (!row) return createResult(request.actionId, false, 'Workspace not found', null, start);

          const tier = row.subscription_tier || 'free';
          const status = row.subscription_status || 'active';
          const activeEmployees = parseInt(row.active_employees || '0', 10);

          // Seat limits per tier
          const seatLimits: Record<string, number> = {
            free: 5, trial: 5, starter: 10, professional: 30,
            business: 75, enterprise: 200, strategic: 999999,
          };
          const seatLimit = seatLimits[tier] ?? 10;
          const seatsRemaining = Math.max(0, seatLimit - activeEmployees);
          const seatUsagePct = seatLimit > 0 ? Math.round((activeEmployees / seatLimit) * 100) : 0;

          // Tier hierarchy for upgrade suggestions
          const tierOrder = ['free', 'trial', 'starter', 'professional', 'business', 'enterprise', 'strategic'];
          const tierIndex = tierOrder.indexOf(tier);
          const nextTier = tierIndex >= 0 && tierIndex < tierOrder.length - 1 ? tierOrder[tierIndex + 1] : null;

          const summary = {
            currentTier: tier,
            subscriptionStatus: status,
            seats: { used: activeEmployees, limit: seatLimit, remaining: seatsRemaining, usagePct: seatUsagePct },
            isNearSeatLimit: seatUsagePct >= 80,
            isAtSeatLimit: seatsRemaining === 0,
            nextTier,
            upgradeUrl: nextTier ? `/billing/upgrade?tier=${nextTier}` : null,
            message: seatsRemaining === 0
              ? `Seat limit reached (${activeEmployees}/${seatLimit}). Upgrade to ${nextTier || 'a higher plan'} to add more team members.`
              : seatUsagePct >= 80
              ? `Approaching seat limit: ${activeEmployees}/${seatLimit} seats used (${seatUsagePct}%).`
              : `${tier} plan — ${activeEmployees}/${seatLimit} seats used (${seatsRemaining} remaining).`,
          };

          return createResult(request.actionId, true, summary.message, summary, start);
        } catch (error: any) {
          return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
        }
      },
    };
    helpaiOrchestrator.registerAction(withAuditWrap(getWorkspaceTierStatus, 'workspace')); // workspace.tier.status
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  // ============================================================================
  // INVOICE & ANALYTICS ACTIONS
  // ============================================================================

  private registerInvoiceActions(): void {
    const listInvoices: ActionHandler = {
      actionId: 'billing.invoice',
      name: 'Get or List Invoices',
      category: 'invoicing',
      description: 'Get a single invoice by ID/number (pass payload.id or payload.invoiceNumber) or list all invoices filtered by status/client. Consolidates billing.invoices_get and billing.invoices_list.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();

        // Single invoice fetch: if id or invoiceNumber provided
        if (request.payload?.id || request.payload?.invoiceId || request.payload?.invoiceNumber) {
          const invoiceId = request.payload?.id || request.payload?.invoiceId;
          const invoiceNumber = request.payload?.invoiceNumber;
          let invoice;
          if (invoiceId) {
            invoice = await db.query.invoices.findFirst({
              where: and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, request.workspaceId!)),
            });
          } else if (invoiceNumber) {
            invoice = await db.query.invoices.findFirst({
              where: and(eq(invoices.invoiceNumber, invoiceNumber), eq(invoices.workspaceId, request.workspaceId!)),
            });
          }
          if (!invoice) return createResult(request.actionId, false, 'Invoice not found', null, start);
          return createResult(request.actionId, true, 'Invoice retrieved', invoice, start);
        }

        // List invoices
        const conditions: any[] = [eq(invoices.workspaceId, request.workspaceId!)];
        if (request.payload?.status) {
          conditions.push(eq(invoices.status, request.payload.status));
        }
        if (request.payload?.clientId) {
          conditions.push(eq(invoices.clientId, request.payload.clientId));
        }
        const invoiceList = await db.query.invoices.findMany({
          where: and(...conditions),
          orderBy: [desc(invoices.issueDate)],
          limit: request.payload?.limit || 50,
        });
        return createResult(request.actionId, true, `Found ${invoiceList.length} invoices`, invoiceList, start);
      },
    };

    const getInvoice: ActionHandler = {
      actionId: 'billing.invoices_get',
      name: 'Get Invoice Details',
      category: 'invoicing',
      description: 'Get detailed information about a specific invoice by ID or invoice number',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { invoiceId, invoiceNumber } = request.payload || {};
        let invoice;
        if (invoiceId) {
          invoice = await db.query.invoices.findFirst({
            where: and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, request.workspaceId!)),
          });
        } else if (invoiceNumber) {
          invoice = await db.query.invoices.findFirst({
            where: and(eq(invoices.invoiceNumber, invoiceNumber), eq(invoices.workspaceId, request.workspaceId!)),
          });
        }
        if (!invoice) return createResult(request.actionId, false, 'Invoice not found', null, start);
        return createResult(request.actionId, true, 'Invoice retrieved', invoice, start);
      },
    };

    const getInvoiceSummary: ActionHandler = {
      actionId: 'billing.invoice_summary',
      name: 'Invoice Summary & Analytics',
      category: 'invoicing',
      description: 'Get a summary of invoice analytics: total billed, paid, outstanding, overdue amounts',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const [summary] = await db
          .select({
            totalInvoices: sql<number>`count(*)`,
            totalBilled: sql<string>`coalesce(sum(${invoices.total}::numeric), 0)`,
            totalPaid: sql<string>`coalesce(sum(case when ${invoices.status} = 'paid' then ${invoices.total}::numeric else 0 end), 0)`,
            totalOutstanding: sql<string>`coalesce(sum(case when ${invoices.status} in ('sent', 'overdue', 'pending') then ${invoices.total}::numeric else 0 end), 0)`,
            totalOverdue: sql<string>`coalesce(sum(case when ${invoices.status} = 'overdue' then ${invoices.total}::numeric else 0 end), 0)`,
            overdueCount: sql<number>`count(case when ${invoices.status} = 'overdue' then 1 end)`,
          })
          .from(invoices)
          .where(eq(invoices.workspaceId, request.workspaceId!));
        return createResult(request.actionId, true, 'Invoice summary retrieved', summary, start);
      },
    };

    helpaiOrchestrator.registerAction(withAuditWrap(listInvoices, 'invoice')); // billing.invoice (consolidated — replaces invoices_list + invoices_get)
    // billing.invoices_get consolidated into billing.invoice above — not registering separately:
    // helpaiOrchestrator.registerAction(getInvoice);
    helpaiOrchestrator.registerAction(withAuditWrap(getInvoiceSummary, 'invoice')); // billing.invoice_summary
    log.info('[AI Brain] Invoice & analytics actions registered (2 actions)');
  }

  // ============================================================================
  // FINANCIAL STAGING PIPELINE ACTIONS
  // The canonical chain-of-custody mutators that move work-performed →
  // revenue (invoices) and work-performed → payroll. Implementation lives in
  // server/services/financialStagingService.ts; this method only exposes them
  // to the action registry so Trinity can call them autonomously.
  // ============================================================================

  private registerFinancialStagingActions(): void {
    const stageBillingRunAction: ActionHandler = {
      actionId: 'finance.stage_billing_run',
      name: 'Stage Billing Run',
      category: 'invoicing',
      description: 'Generate draft invoices grouped by client from approved time entries in the period. Refuses clients without an executed contract. Atomically claims source time entries.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        if (!request.workspaceId) return createResult(request.actionId, false, 'workspaceId required', null, start);
        await assertWorkspaceActive(request.workspaceId, { bypassForSystemActor: true });
        const { startDate, endDate, clientIds, taxRate, dueInDays, notes } = request.payload || {};
        if (!startDate || !endDate) return createResult(request.actionId, false, 'startDate and endDate required', null, start);
        const { stageBillingRun } = await import('../financialStagingService');
        const result = await stageBillingRun({
          workspaceId: request.workspaceId,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          clientIds,
          taxRate,
          dueInDays,
          notes,
        });
        return createResult(request.actionId, true, `Drafted ${result.totals.invoiceCount} invoices ($${result.totals.totalBillable})`, result, start);
      },
    };

    const stagePayrollBatchAction: ActionHandler = {
      actionId: 'finance.stage_payroll_batch',
      name: 'Stage Payroll Batch',
      category: 'payroll',
      description: 'Aggregate approved time entries into a draft payroll run with FLSA-compliant 40h OT logic. Atomically claims source time entries inside the run transaction.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        if (!request.workspaceId) return createResult(request.actionId, false, 'workspaceId required', null, start);
        await assertWorkspaceActive(request.workspaceId, { bypassForSystemActor: true });
        const { periodStart, periodEnd } = request.payload || {};
        const { stagePayrollBatch } = await import('../financialStagingService');
        const result = await stagePayrollBatch({
          workspaceId: request.workspaceId,
          userId: request.userId || 'system',
          periodStart: periodStart ? new Date(periodStart) : undefined,
          periodEnd: periodEnd ? new Date(periodEnd) : undefined,
        });
        return createResult(request.actionId, true, `Drafted payroll run for ${result.totals.employeeCount} employees ($${result.totals.totalGrossPay} gross)`, result, start);
      },
    };

    const finalizeFinancialBatchAction: ActionHandler = {
      actionId: 'finance.finalize_financial_batch',
      name: 'Finalize Financial Batch',
      category: 'invoicing',
      description: 'Lock draft invoices and pending payroll runs. Once finalized, linked time entries become read-only via the WORM lock at the time-entry edit endpoint.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        if (!request.workspaceId) return createResult(request.actionId, false, 'workspaceId required', null, start);
        await assertWorkspaceActive(request.workspaceId, { bypassForSystemActor: true });

        const gate = await requireDeliberationConsensus({
          actionId: 'finance.finalize_financial_batch',
          workspaceId: request.workspaceId,
          description: `Finalize batch — invoices=${(request.payload?.invoiceIds ?? []).length}, payrollRuns=${(request.payload?.payrollRunIds ?? []).length}`,
          userId: request.userId,
        });
        if (!gate.allowed) {
          return createResult(request.actionId, false, gate.reason, null, start);
        }

        const { invoiceIds, payrollRunIds, reason } = request.payload || {};
        const { finalizeFinancialBatch } = await import('../financialStagingService');
        const result = await finalizeFinancialBatch({
          workspaceId: request.workspaceId,
          approvedBy: request.userId || 'system',
          invoiceIds,
          payrollRunIds,
          reason,
        });
        return createResult(
          request.actionId,
          true,
          `Locked ${result.invoices.length} invoices, ${result.payrollRuns.filter(p => p.status === 'approved').length} payroll runs, ${result.lockedTimeEntryIds.length} time entries`,
          result,
          start,
        );
      },
    };

    const generateMarginReportAction: ActionHandler = {
      actionId: 'finance.generate_margin_report',
      name: 'Generate Margin Report',
      category: 'analytics',
      description: 'Compute total billable vs total payable across a batch and per client. Flags any cohort where gross margin is below 20%.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        if (!request.workspaceId) return createResult(request.actionId, false, 'workspaceId required', null, start);
        const { invoiceIds, payrollRunIds, startDate, endDate } = request.payload || {};
        const { generateMarginReport } = await import('../financialStagingService');
        const result = await generateMarginReport({
          workspaceId: request.workspaceId,
          invoiceIds,
          payrollRunIds,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
        });
        const flag = result.flagged ? ' (FLAGGED — below 20% floor)' : '';
        return createResult(request.actionId, true, `Margin ${Number(result.grossMarginPct).toFixed(2)}%${flag}`, result, start);
      },
    };

    const autoApproveByVarianceAction: ActionHandler = {
      actionId: 'time.auto_approve_by_variance',
      name: 'Variance-based Time-Entry Auto-Approval',
      category: 'timekeeping',
      description: 'Compare scheduled vs actual hours for a completed time entry. If variance < threshold (default 5%) AND GPS-verified, auto-approve. Otherwise flag for manual review with a reason recorded in entry notes.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        if (!request.workspaceId) return createResult(request.actionId, false, 'workspaceId required', null, start);
        await assertWorkspaceActive(request.workspaceId, { bypassForSystemActor: true });
        const { entryId, thresholdPct, requireGpsVerified } = request.payload || {};
        if (!entryId) return createResult(request.actionId, false, 'entryId required', null, start);
        const { autoApproveByVariance } = await import('../timeEntryService');
        const result = await autoApproveByVariance({
          entryId,
          approvedBy: request.userId || 'trinity-system',
          thresholdPct,
          requireGpsVerified,
        });
        return createResult(request.actionId, true, `${result.decision}: ${result.reason ?? ''}`, result, start);
      },
    };

    const addPayrollAdjustmentAction: ActionHandler = {
      actionId: 'finance.add_payroll_adjustment',
      name: 'Add Payroll Line-Item Adjustment',
      category: 'payroll',
      description: 'Append a signed line-item adjustment (reimbursement, deduction, or correction) to a draft payroll entry. Net pay recomputes; bonuses must go through amendPayrollEntry to recompute taxable gross.',
      requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        if (!request.workspaceId) return createResult(request.actionId, false, 'workspaceId required', null, start);
        await assertWorkspaceActive(request.workspaceId, { bypassForSystemActor: true });
        const { payrollEntryId, kind, label, amount, reason } = request.payload || {};
        if (!payrollEntryId || !kind || !label || amount === undefined) {
          return createResult(request.actionId, false, 'payrollEntryId, kind, label, amount required', null, start);
        }
        const { addPayrollAdjustment } = await import('../financialStagingService');
        const result = await addPayrollAdjustment({
          workspaceId: request.workspaceId,
          payrollEntryId,
          kind,
          label,
          amount: Number(amount),
          addedBy: request.userId || 'system',
          reason,
        });
        return createResult(request.actionId, true, `${kind} adjustment $${amount} applied; net=$${result.newNetPay}`, result, start);
      },
    };

    helpaiOrchestrator.registerAction(withAuditWrap(stageBillingRunAction, 'invoice'));
    helpaiOrchestrator.registerAction(withAuditWrap(stagePayrollBatchAction, 'payroll_run'));
    helpaiOrchestrator.registerAction(withAuditWrap(finalizeFinancialBatchAction, 'financial_batch'));
    helpaiOrchestrator.registerAction(withAuditWrap(generateMarginReportAction, 'financial_report'));
    helpaiOrchestrator.registerAction(withAuditWrap(addPayrollAdjustmentAction, 'payroll_entry'));
    helpaiOrchestrator.registerAction(withAuditWrap(autoApproveByVarianceAction, 'time_entry'));
    log.info('[AI Brain] Financial staging pipeline actions registered (6 actions)');
  }

  // ============================================================================
  // DISCIPLINARY / HR ACTIONS (Phase 4)
  // Trinity-guided 5-W intake + AI document generation for write-ups and LODs.
  // ============================================================================

  private registerDisciplinaryActions(): void {
    const initiateDisciplinary: ActionHandler = {
      actionId: 'hr.initiate_disciplinary',
      name: 'Initiate Disciplinary Process',
      category: 'hr',
      description:
        'Trinity guides the manager through a 5-W intake and generates a disciplinary document (or Letter of Dissatisfaction for 1099 contractors).',
      requiredRoles: ['system', 'owner', 'manager', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const {
          subjectId,
          subjectType,
          what,
          why,
          when: whenStr,
          where: whereStr,
          who,
          how,
          witnesses,
          priorIncidents,
          rawNarrative,
        } = request.payload || {};

        if (!subjectId || !what) {
          return createResult(
            request.actionId,
            false,
            'Trinity needs subjectId, what happened, and why it is a policy violation.',
            null,
            start,
          );
        }
        if (!request.workspaceId) {
          return createResult(
            request.actionId,
            false,
            'Workspace context required.',
            null,
            start,
          );
        }

        try {
          const { runDisciplinaryWorkflow } = await import(
            '../trinity/trinityDisciplinaryWorkflow'
          );
          const result = await runDisciplinaryWorkflow({
            workspaceId: request.workspaceId,
            initiatedBy: request.userId || 'trinity-brain',
            initiatedByRole: request.userRole || 'manager',
            subjectId,
            subjectType: subjectType || 'employee',
            who: who || 'See incident report',
            what,
            where: whereStr || 'On duty',
            when: whenStr || new Date().toLocaleString(),
            why: why || 'Policy violation',
            how: how || 'Manager observation',
            witnesses,
            priorIncidents,
            rawNarrative,
          });

          return createResult(
            request.actionId,
            true,
            `Disciplinary document generated: ${result.documentTitle}. ${result.severityLevel.toUpperCase()} severity. Trinity recommends: ${result.documentType.replace(/_/g, ' ')}.`,
            result,
            start,
          );
        } catch (err: any) {
          return createResult(
            request.actionId,
            false,
            `Document generation failed: ${err?.message}`,
            null,
            start,
          );
        }
      },
    };

    helpaiOrchestrator.registerAction(withAuditWrap(initiateDisciplinary, 'disciplinary'));
    log.info('[AI Brain] Disciplinary actions registered (1 action)');
  }

  getRegisteredActionCount(): number {
    return helpaiOrchestrator.getRegisteredActions?.()?.length || 45;
  }
}

// Export singleton instance
export const aiBrainActionRegistry = new AIBrainActionRegistry();

// Initialize on import
aiBrainActionRegistry.initialize().then(async () => {
  registerAutonomousSchedulingBrainActions();
  const { registerFinanceOrchestratorActions } = await import('./trinityFinanceOrchestrator');
  registerFinanceOrchestratorActions();
  const { registerInfraActions } = await import('./trinityInfraActions');
  registerInfraActions();
  const { registerInvoiceEmailActions } = await import('./trinityInvoiceEmailActions');
  registerInvoiceEmailActions();
  const { registerReportAnalyticsActions } = await import('./trinityReportAnalyticsActions');
  registerReportAnalyticsActions();
  const { registerOpsActions } = await import('./trinityOpsActions');
  registerOpsActions();
  const { registerExtendedActions } = await import('./trinityExtendedActions');
  registerExtendedActions();
  const { registerScheduleTimeclockActions } = await import('./trinityScheduleTimeclockActions');
  registerScheduleTimeclockActions();
  const { registerTimesheetPayrollCycleActions } = await import('./trinityTimesheetPayrollCycleActions');
  registerTimesheetPayrollCycleActions();
  const { registerComplianceIncidentActions } = await import('./trinityComplianceIncidentActions');
  registerComplianceIncidentActions();
  const { registerCommsProactiveActions } = await import('./trinityCommsProactiveActions');
  registerCommsProactiveActions();
  const { registerPostOrdersSafetyActions } = await import('./trinityPostOrdersSafetyActions');
  registerPostOrdersSafetyActions();
  const { registerCashFlowActions } = await import('./trinityCashFlowActions');
  registerCashFlowActions();
  const { registerHiringPipelineActions } = await import('./trinityHiringPipelineActions');
  registerHiringPipelineActions();
  const { registerDelegationTrackerActions } = await import('./trinityDelegationTrackerActions');
  registerDelegationTrackerActions();
  const { registerShiftConfirmationActions } = await import('./trinityShiftConfirmationActions');
  registerShiftConfirmationActions();
  const { registerChangePropagationActions } = await import('./trinityChangePropagationActions');
  registerChangePropagationActions();

  const { registerSubcontractorActions } = await import('./trinitySubcontractorActions');
  await registerSubcontractorActions();
  const { registerDrugTestingActions } = await import('./trinityDrugTestingActions');
  registerDrugTestingActions();
  const { registerEmergencyStaffingActions } = await import('./trinityEmergencyStaffingActions');
  registerEmergencyStaffingActions();
  const { registerExternalIntelligenceActions } = await import('./trinityExternalIntelligenceActions');
  registerExternalIntelligenceActions();
  const { registerMilestoneActions } = await import('./trinityMilestoneActions');
  registerMilestoneActions();
  const { registerSchedulingPlatformActions } = await import('./trinitySchedulingPlatformActions');
  registerSchedulingPlatformActions();
  const { registerWorkspaceTimeActions } = await import('./trinityWorkspaceTimeActions');
  registerWorkspaceTimeActions();
  const { registerIntelligenceLayerActions } = await import('./trinityIntelligenceLayers');
  registerIntelligenceLayerActions();

  const { registerTaxComplianceActions } = await import('./trinityTaxComplianceActions');
  registerTaxComplianceActions();

  // Form Actions (Online Forms Phase) — form.prefill, form.auto_submit, form.query_status
  const { registerFormActions } = await import('./trinityFormActions');
  registerFormActions();

  // Agent Spawning System (Phase 4)
  const { registerAgentSpawningActions } = await import('./trinityAgentSpawningActions');
  registerAgentSpawningActions();

  // License Management (Phase 17)
  const { registerLicenseActions } = await import('./trinityLicenseActions');
  registerLicenseActions();

  // Portal Actions (Phase 20) — portal.client.query, portal.officer.query, portal.auditor.status, portal.send_link
  const { registerPortalActions } = await import('./trinityPortalActions');
  registerPortalActions();

  // Helpdesk Actions (Phase 23B) — helpdesk.ticket.create, helpdesk.ticket.query, helpdesk.ticket.resolve, helpdesk.faq.search, helpdesk.faq.suggest, helpdesk.workspace.history
  const { registerHelpdeskActions } = await import('./trinityHelpdeskActions');
  registerHelpdeskActions();

  // Performance Management Actions (Phase 35J) — performance.summary, performance.flag, performance.commend
  const { registerTrinityPerformanceActions } = await import('./trinityPerformanceActions');
  await registerTrinityPerformanceActions();

  // Phase 58 — Missing Domain Actions: voice, forms, esignature, proposals, hr_docs
  const { registerMissingDomainActions } = await import('./trinityMissingDomainActions');
  registerMissingDomainActions();

  // Phase 18B — Trinity outbound shift offers + outbound welfare-check calls
  const { registerShiftOfferAndOutboundActions } = await import('./trinityShiftOfferActions');
  registerShiftOfferAndOutboundActions();

  // Phase 18C — Regulatory auditor intake, listing, close, expire
  const { registerTrinityAuditorActions } = await import('./trinityAuditorActions');
  registerTrinityAuditorActions();

  // Phase 18D — Security actions (overrides, allow-list, caller-ID lookup)
  const { registerTrinitySecurityActions } = await import('./trinitySecurityActions');
  registerTrinitySecurityActions();

  // Phase 20 — Trinity autonomous workflow actions:
  //   trinity.execute_calloff_coverage, trinity.scan_stale_calloffs,
  //   trinity.missed_clockin_check, trinity.send_shift_reminders,
  //   trinity.run_invoice_lifecycle, trinity.run_compliance_scan,
  //   trinity.process_payroll_anomalies
  const { registerTrinityWorkflowActions } = await import('../trinity/workflows/workflowOrchestrator');
  registerTrinityWorkflowActions();

  // Phase 24 — Trinity proactive monitor actions:
  //   trinity.run_pre_shift_intel, trinity.run_revenue_scan,
  //   trinity.send_weekly_brief, trinity.run_anomaly_watch
  const { registerProactiveActions } = await import('../trinity/proactive/proactiveOrchestrator');
  registerProactiveActions();
}).catch((e: any) => log.error(e instanceof Error ? e.message : String(e)));

export default aiBrainActionRegistry;

// ============================================================================
// AUTONOMOUS SCHEDULING ACTIONS (Trinity Intelligent Scheduling Brain)
// ============================================================================

// NOTE: Autonomous scheduling actions are registered via registerAutonomousSchedulingBrainActions()
// This provides Trinity with day-by-day systematic scheduling, demand prioritization,
// historical pattern learning, and continuous background automation.

export async function registerAutonomousSchedulingBrainActions(): Promise<void> {
  const { trinityAutonomousScheduler } = await import('../scheduling/trinityAutonomousScheduler');
  
  const executeAutonomousScheduling: ActionHandler = {
    actionId: 'scheduling.execute_autonomous',
    name: 'Execute Autonomous Scheduling',
    category: 'scheduling',
    description: 'Run Trinity intelligent autonomous scheduling with day-by-day processing, demand prioritization, and historical pattern learning. Processes current day first, then tomorrow, then rest of week.',
    requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const result = await trinityAutonomousScheduler.executeAutonomousScheduling({
          workspaceId: request.workspaceId!,
          userId: request.userId || 'trinity-brain',
          mode: request.payload?.mode || 'current_week',
          prioritizeBy: request.payload?.prioritizeBy || 'urgency',
          useContractorFallback: request.payload?.useContractorFallback ?? true,
          maxShiftsPerEmployee: request.payload?.maxShiftsPerEmployee || 0,
          respectAvailability: request.payload?.respectAvailability ?? true,
        });
        await logActionAudit({
          actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
          userRole: request.userRole, platformRole: request.platformRole,
          entityType: 'schedule', entityId: null,
          success: result.success,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          message: result.summary,
          changesAfter: result as any, durationMs: Date.now() - start,
        });
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return createResult(request.actionId, result.success, result.summary, result, start);
      } catch (error: any) {
        await logActionAudit({
          actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
          entityType: 'schedule', entityId: null,
          success: false, errorMessage: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - start,
        });
        return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)) || 'Autonomous scheduling failed', null, start);
      }
    },
  };
  
  const getSchedulingStatus: ActionHandler = {
    actionId: 'scheduling.get_autonomous_status',
    name: 'Get Autonomous Scheduling Status',
    category: 'scheduling',
    description: 'Get the current status of Trinity autonomous scheduling daemon and session progress',
    requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const { autonomousSchedulingDaemon } = await import('../scheduling/autonomousSchedulingDaemon');
        const status = await autonomousSchedulingDaemon.getStatus();
        return createResult(request.actionId, true, 'Autonomous scheduling status retrieved', status, start);
      } catch (error: any) {
        return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
      }
    },
  };
  
  const enableBackgroundScheduling: ActionHandler = {
    actionId: 'scheduling.enable_background_daemon',
    name: 'Enable Background Scheduling Daemon',
    category: 'scheduling',
    description: 'Enable Trinity continuous background scheduling daemon that automatically fills open shifts',
    requiredRoles: ['system', 'owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const { autonomousSchedulingDaemon } = await import('../scheduling/autonomousSchedulingDaemon');
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await autonomousSchedulingDaemon.start(request.workspaceId!);
        await logActionAudit({
          actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
          userRole: request.userRole, platformRole: request.platformRole,
          entityType: 'daemon', entityId: null,
          success: true, message: 'Background scheduling daemon enabled',
          durationMs: Date.now() - start,
        });
        return createResult(request.actionId, true, 'Background scheduling daemon enabled', { running: true }, start);
      } catch (error: any) {
        await logActionAudit({
          actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
          entityType: 'daemon', entityId: null,
          success: false, errorMessage: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - start,
        });
        return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
      }
    },
  };

  const disableBackgroundScheduling: ActionHandler = {
    actionId: 'scheduling.disable_background_daemon',
    name: 'Disable Background Scheduling Daemon',
    category: 'scheduling',
    description: 'Disable Trinity continuous background scheduling daemon',
    requiredRoles: ['system', 'owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const { autonomousSchedulingDaemon } = await import('../scheduling/autonomousSchedulingDaemon');
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await autonomousSchedulingDaemon.stop(request.workspaceId!);
        await logActionAudit({
          actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
          userRole: request.userRole, platformRole: request.platformRole,
          entityType: 'daemon', entityId: null,
          success: true, message: 'Background scheduling daemon disabled',
          durationMs: Date.now() - start,
        });
        return createResult(request.actionId, true, 'Background scheduling daemon disabled', { running: false }, start);
      } catch (error: any) {
        await logActionAudit({
          actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
          entityType: 'daemon', entityId: null,
          success: false, errorMessage: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - start,
        });
        return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
      }
    },
  };

  const importHistoricalPatterns: ActionHandler = {
    actionId: 'scheduling.import_historical_patterns',
    name: 'Import Historical Scheduling Patterns',
    category: 'scheduling',
    description: 'Import historical scheduling data from CSV to train Trinity on past assignment patterns and employee preferences',
    requiredRoles: ['system', 'owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const { historicalScheduleImporter } = await import('../scheduling/historicalScheduleImporter');
        const result = await historicalScheduleImporter.importFromCSV(
          request.workspaceId!,
          request.payload?.csvData || '',
          request.payload?.options
        );
        await logActionAudit({
          actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
          userRole: request.userRole, platformRole: request.platformRole,
          entityType: 'schedule', entityId: null,
          success: result.success,
          message: (result as any).summary || 'Historical patterns import complete',
          changesAfter: result as any, durationMs: Date.now() - start,
        });
        return createResult(request.actionId, result.success, (result as any).summary, result, start);
      } catch (error: any) {
        await logActionAudit({
          actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
          entityType: 'schedule', entityId: null,
          success: false, errorMessage: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - start,
        });
        return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
      }
    },
  };

  const createRecurringTemplate: ActionHandler = {
    actionId: 'scheduling.create_recurring_template',
    name: 'Create Recurring Schedule Template',
    category: 'scheduling',
    description: 'Create a weekly recurring schedule template that I\'ll automatically apply each week',
    requiredRoles: ['system', 'manager', 'owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const { recurringScheduleTemplates } = await import('../scheduling/recurringScheduleTemplates');
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const result = await recurringScheduleTemplates.createTemplate(
          request.workspaceId!,
          request.payload?.template
        );
        await logActionAudit({
          actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
          userRole: request.userRole, platformRole: request.platformRole,
          entityType: 'schedule_template', entityId: (result as any)?.id ?? null,
          success: true, message: 'Recurring schedule template created',
          changesAfter: result as any, durationMs: Date.now() - start,
        });
        return createResult(request.actionId, true, 'Recurring template created', result, start);
      } catch (error: any) {
        await logActionAudit({
          actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
          entityType: 'schedule_template', entityId: null,
          success: false, errorMessage: error instanceof Error ? error.message : String(error),
          payload: request.payload, durationMs: Date.now() - start,
        });
        return createResult(request.actionId, false, (error instanceof Error ? error.message : String(error)), null, start);
      }
    },
  };

  // Register all autonomous scheduling actions with Trinity's brain
  helpaiOrchestrator.registerAction(withAuditWrap(executeAutonomousScheduling, 'schedule'));
  helpaiOrchestrator.registerAction(withAuditWrap(getSchedulingStatus, 'schedule'));
  helpaiOrchestrator.registerAction(withAuditWrap(enableBackgroundScheduling, 'schedule'));
  helpaiOrchestrator.registerAction(withAuditWrap(disableBackgroundScheduling, 'schedule'));
  helpaiOrchestrator.registerAction(withAuditWrap(importHistoricalPatterns, 'schedule'));
  helpaiOrchestrator.registerAction(withAuditWrap(createRecurringTemplate, 'schedule'));
  
  log.info('[AI Brain] Autonomous scheduling actions registered (6 new actions)');
}

// ============================================================================
// PHASE 57 — UNIVERSAL ENTITY RESOLVER ACTIONS
// Allows Trinity to resolve any canonical human-readable ID to its full record
// ============================================================================

export function registerUniversalIdActions(): void {
  // ── universal.resolve_entity ───────────────────────────────────────────────
  const resolveEntityAction: ActionHandler = {
    actionId: 'universal.resolve_entity',
    name: 'Resolve Entity by Canonical ID',
    category: 'intelligence' as ActionCategory,
    description: 'Resolve any human-readable canonical ID (EMP-ACM-00034, CLT-ACM-00891, SHF-20260329-00612, etc.) to its full database record and display name',
    requiredRoles: ['officer', 'supervisor', 'manager', 'owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const humanId = request.payload?.id || request.payload?.humanId || request.payload?.canonical_id;
        if (!humanId) {
          return createResult(request.actionId, false, 'No ID provided. Please supply a canonical ID like EMP-ACM-00034.', null, start);
        }
        const { resolveEntityById } = await import('../universalIdService');
        const entity = await resolveEntityById(humanId, request.workspaceId);
        if (!entity) {
          return createResult(request.actionId, false, `No entity found for ID: ${humanId}`, null, start);
        }
        return createResult(request.actionId, true, `Found ${entity.type}: ${entity.displayName} (${entity.humanId})`, entity, start);
      } catch (error: any) {
        return createResult(request.actionId, false, error.message, null, start);
      }
    },
  };

  // ── universal.lookup_by_id ─────────────────────────────────────────────────
  const lookupByIdAction: ActionHandler = {
    actionId: 'universal.lookup_by_id',
    name: 'Universal ID Lookup',
    category: 'intelligence' as ActionCategory,
    description: 'Look up and navigate to any entity using its canonical ID. Works for officers, clients, shifts, invoices, tickets, clock records, and documents.',
    requiredRoles: ['officer', 'supervisor', 'manager', 'owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const rawInput = request.payload?.query || request.payload?.id || request.payload?.humanId || '';
        // Extract canonical ID pattern from free text (e.g. "look up EMP-ACM-00034")
        const match = rawInput.toUpperCase().match(/(ORG|CLT|EMP|USR|SHF|CLK|DOC|INV|TKT)-[A-Z0-9-]+/);
        const humanId = match ? match[0] : rawInput.toUpperCase().trim();
        if (!humanId) {
          return createResult(request.actionId, false, 'Please provide a canonical ID to look up.', null, start);
        }
        const { resolveEntityById } = await import('../universalIdService');
        const entity = await resolveEntityById(humanId, request.workspaceId);
        if (!entity) {
          return createResult(request.actionId, false, `Could not find any entity with ID "${humanId}". Please check the ID and try again.`, null, start);
        }
        const deepLinks: Record<string, string> = {
          workspace: `/settings/organization`,
          client: `/clients/${entity.id}`,
          employee: `/officers/${entity.id}`,
          user: `/settings/profile`,
          shift: `/schedule?shiftId=${entity.id}`,
          time_entry: `/timeclock?entryId=${entity.id}`,
          document: `/documents/${entity.id}`,
          invoice: `/invoices/${entity.id}`,
          support_ticket: `/help-desk/tickets/${entity.id}`,
        };
        const deepLink = deepLinks[entity.type] || null;
        return createResult(request.actionId, true,
          `Found ${entity.type}: **${entity.displayName}** (${entity.humanId})${deepLink ? ` — [View →](${deepLink})` : ''}`,
          { ...entity, deepLink }, start);
      } catch (error: any) {
        return createResult(request.actionId, false, error.message, null, start);
      }
    },
  };

  // ── universal.backfill_ids ─────────────────────────────────────────────────
  // Root-admin only: trigger backfill for any remaining NULL canonical IDs
  const backfillIdsAction: ActionHandler = {
    actionId: 'universal.backfill_ids',
    name: 'Backfill Missing Canonical IDs',
    category: 'intelligence' as ActionCategory,
    description: 'Root admin: scan all entities for missing canonical IDs and generate them',
    requiredRoles: ['root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const { backfillOrgIds, backfillClientNumbers, backfillEmployeeNumbers, backfillUserNumbers } = await import('../universalIdService');
        const [orgs, clients, employees, users] = await Promise.all([
          backfillOrgIds(),
          backfillClientNumbers(),
          backfillEmployeeNumbers(),
          backfillUserNumbers(),
        ]);
        const summary = `Backfilled: ${orgs} orgs, ${clients} clients, ${employees} employees, ${users} users`;
        await logActionAudit({
          actionId: request.actionId, workspaceId: request.workspaceId, userId: request.userId,
          userRole: request.userRole, platformRole: request.platformRole,
          entityType: 'system', entityId: null,
          success: true, message: summary,
          changesAfter: { orgs, clients, employees, users } as any, durationMs: Date.now() - start,
        });
        return createResult(request.actionId, true, summary, { orgs, clients, employees, users }, start);
      } catch (error: any) {
        return createResult(request.actionId, false, error.message, null, start);
      }
    },
  };

  // ── system.resolve_id ─────────────────────────────────────────────────────
  // Canonical alias required by Phase 57 spec and Phase 56 voice system
  const systemResolveIdAction: ActionHandler = {
    actionId: 'system.resolve_id',
    name: 'Resolve Canonical ID',
    category: 'intelligence' as ActionCategory,
    description: 'Resolve any human-readable canonical ID (EMP-, CLT-, ORG-, INV-, DOC-, CLK-, SHF-) to its full entity record. Used by voice, interview, and Trinity pipelines.',
    requiredRoles: ['officer', 'supervisor', 'manager', 'owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const rawInput = request.payload?.id || request.payload?.humanId || request.payload?.canonical_id || request.payload?.query || '';
        const match = String(rawInput).toUpperCase().match(/(ORG|CLT|EMP|USR|SHF|CLK|DOC|INV|TKT|INC)-[A-Z0-9-]+/);
        const humanId = match ? match[0] : String(rawInput).toUpperCase().trim();
        if (!humanId) {
          return createResult(request.actionId, false, 'No ID provided. Provide a canonical ID like EMP-ACM-00034 or CLT-XX-00071.', null, start);
        }
        const { resolveEntityById } = await import('../universalIdService');
        const entity = await resolveEntityById(humanId, request.workspaceId);
        if (!entity) {
          return createResult(request.actionId, false, `No entity found for ID: ${humanId}`, null, start);
        }
        return createResult(request.actionId, true, `Resolved ${entity.type}: ${entity.displayName} (${entity.humanId})`, entity, start);
      } catch (error: any) {
        return createResult(request.actionId, false, error.message, null, start);
      }
    },
  };

  helpaiOrchestrator.registerAction(withAuditWrap(resolveEntityAction, 'entity'));
  helpaiOrchestrator.registerAction(withAuditWrap(lookupByIdAction, 'entity'));
  helpaiOrchestrator.registerAction(withAuditWrap(backfillIdsAction, 'entity'));
  helpaiOrchestrator.registerAction(withAuditWrap(systemResolveIdAction, 'entity'));

  log.info('[AI Brain] Phase 57 Universal ID Resolver actions registered (4 actions: universal.resolve_entity, universal.lookup_by_id, universal.backfill_ids, system.resolve_id)');
}
