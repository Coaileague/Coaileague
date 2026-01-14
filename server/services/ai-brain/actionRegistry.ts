/**
 * AI Brain Action Registry
 * ========================
 * Central registry that wires ALL AI Brain capabilities to executable actions.
 * This enables the orchestrator to execute any platform action through a unified interface.
 */

import { 
  helpaiOrchestrator, 
  type ActionHandler, 
  type ActionRequest, 
  type ActionResult,
  type ActionCategory 
} from '../helpai/platformActionHub';
import { serviceController, featureToggleManager, consoleCommandExecutor, endUserBotSupport, supportStaffAssistant } from './orchestratorCapabilities';
import { db } from '../../db';
import { creditManager, CREDIT_COSTS } from '../billing/creditManager';
import { FAST_MODE_TIERS, type FastModeTier } from './fastModeService';
import { eq, and, desc, gte, lte, sql, isNull } from 'drizzle-orm';
import {
  employees,
  shifts,
  timeEntries,
  invoices,
  payrollRuns,
  clients,
  notifications,
  workspaces,
} from '@shared/schema';

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
// ACTION REGISTRY CLASS
// ============================================================================

class AIBrainActionRegistry {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[AI Brain Action Registry] Initializing action registry...');

    // Register all action categories
    this.registerServiceActions();
    this.registerFeatureActions();
    this.registerSchedulingActions();
    this.registerPayrollActions();
    this.registerEmployeeActions();
    this.registerClientActions();
    this.registerTimeTrackingActions();
    this.registerNotificationActions();
    this.registerBulkOperationActions();
    this.registerIntegrationActions();
    this.registerOnboardingActions();
    this.registerStrategicOptimizationActions();

    this.initialized = true;
    console.log(`[AI Brain Action Registry] Initialization complete`);
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
        const result = await serviceController.restartService(serviceName, request.userId);
        return createResult(request.actionId, result.success, result.message, null, start);
      },
    };

    helpaiOrchestrator.registerAction(getServiceStatus);
    helpaiOrchestrator.registerAction(getAllServicesStatus);
    helpaiOrchestrator.registerAction(restartService);
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
        const result = await featureToggleManager.setToggle({
          featurePath: request.payload?.featurePath,
          enabled: request.payload?.enabled,
          reason: request.payload?.reason || 'AI Brain action',
          userId: request.userId,
          workspaceId: request.workspaceId,
        });
        return createResult(request.actionId, true, `Feature toggle updated`, result, start);
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

    helpaiOrchestrator.registerAction(getFeature);
    helpaiOrchestrator.registerAction(setFeature);
    helpaiOrchestrator.registerAction(listFeatures);
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
      requiredRoles: ['manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const [shift] = await db.insert(shifts).values({
          workspaceId: request.workspaceId!,
          employeeId: request.payload?.employeeId,
          startTime: new Date(request.payload?.startTime),
          endTime: new Date(request.payload?.endTime),
          title: request.payload?.title,
          description: request.payload?.description,
          status: 'scheduled',
        }).returning();
        return createResult(request.actionId, true, `Shift created`, shift, start);
      },
    };

    const getShifts: ActionHandler = {
      actionId: 'scheduling.get_shifts',
      name: 'Get Shifts',
      category: 'scheduling',
      description: 'Get shifts for a date range',
      requiredRoles: ['employee', 'manager', 'owner', 'root_admin'],
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
      requiredRoles: ['manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { schedulingSubagent } = await import('./subagents/schedulingSubagent');
        const { broadcastShiftUpdate, broadcastToWorkspace } = require('../../websocket');
        
        try {
          // Determine execution mode and credit multiplier
          const executionMode = (request.payload?.executionMode as FastModeTier | 'normal') || 'normal';
          const baseCost = CREDIT_COSTS.ai_open_shift_fill;
          let creditMultiplier = 1.0;
          
          if (executionMode !== 'normal' && FAST_MODE_TIERS[executionMode as FastModeTier]) {
            creditMultiplier = FAST_MODE_TIERS[executionMode as FastModeTier].creditMultiplier;
          }
          
          const totalCredits = Math.ceil(baseCost * creditMultiplier);
          
          // Check and deduct credits before proceeding (with multiplier for FAST modes)
          const creditResult = await creditManager.deductCredits({
            workspaceId: request.workspaceId!,
            userId: request.userId,
            featureKey: 'ai_open_shift_fill',
            featureName: 'AI Open Shift Auto-Fill',
            description: `Trinity AI shift auto-fill (${executionMode} mode, ${totalCredits} credits)`,
            amountOverride: totalCredits, // Apply execution mode multiplier
          });
          
          if (!creditResult.success) {
            return createResult(request.actionId, false, 
              creditResult.errorMessage || 'Insufficient credits for AI scheduling', 
              { creditsRequired: totalCredits, executionMode },
              start
            );
          }
          
          console.log(`[ActionRegistry] Charged ${totalCredits} credits for open shift fill (${executionMode} mode)`);
          
          // Record usage event for telemetry (track the correct multiplied amount)
          const { UsageMeteringService } = await import('../billing/usageMetering');
          const usageMeteringService = new UsageMeteringService();
          await usageMeteringService.recordUsage({
            workspaceId: request.workspaceId!,
            userId: request.userId,
            featureKey: 'ai_open_shift_fill',
            usageType: 'activity',
            usageAmount: totalCredits, // Correct multiplied amount
            usageUnit: 'credits',
            metadata: {
              executionMode,
              baseCost,
              creditMultiplier,
              totalCredits,
              actionId: request.actionId,
            },
            emitEvent: false, // Don't double-emit, credit deduction already handled
          });
          
          // Step 1: Create the open shift (no employee assigned)
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
          
          // Broadcast: Open shift created, Trinity is analyzing
          broadcastToWorkspace(request.workspaceId!, {
            type: 'trinity_scheduling_progress',
            data: {
              shiftId: openShift.id,
              step: 'analyzing',
              message: 'Trinity is analyzing available employees...',
              progress: 20,
              executionMode,
              creditsCharged: totalCredits,
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
                message: `Assigning to ${assignment.employeeName} (score: ${assignment.assignmentScore.toFixed(0)})...`,
                progress: 80,
                assignedEmployee: {
                  id: assignment.employeeId,
                  name: assignment.employeeName,
                  score: assignment.assignmentScore,
                },
              }
            });
            
            // Update the shift with the assigned employee
            const [filledShift] = await db.update(shifts)
              .set({
                employeeId: assignment.employeeId,
                status: 'scheduled',
                aiConfidenceScore: String(result.confidence.score),
                updatedAt: new Date(),
              })
              .where(eq(shifts.id, openShift.id))
              .returning();
            
            // Broadcast: Shift filled successfully
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
            
            return createResult(request.actionId, true, 
              'Open shift created but no suitable employee found - shift remains open', 
              { shift: openShift, alerts: result.alerts },
              start
            );
          }
        } catch (error: any) {
          console.error('[ActionRegistry] Create open shift fill error:', error);
          return createResult(request.actionId, false, error.message || 'Failed to create and fill shift', null, start);
        }
      },
    };

    helpaiOrchestrator.registerAction(createShift);
    helpaiOrchestrator.registerAction(getShifts);
    helpaiOrchestrator.registerAction(createOpenShiftAndFill);
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
      requiredRoles: ['owner', 'root_admin'],
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

    helpaiOrchestrator.registerAction(getPayrollRuns);
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
      requiredRoles: ['manager', 'owner', 'root_admin'],
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
      requiredRoles: ['manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const employee = await db.query.employees.findFirst({
          where: eq(employees.id, request.payload?.employeeId),
        });
        return createResult(request.actionId, true, `Employee retrieved`, employee, start);
      },
    };

    helpaiOrchestrator.registerAction(listEmployees);
    helpaiOrchestrator.registerAction(getEmployee);
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
      requiredRoles: ['manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const clientList = await db.query.clients.findMany({
          where: eq(clients.workspaceId, request.workspaceId!),
        });
        return createResult(request.actionId, true, `Clients retrieved`, clientList, start);
      },
    };

    helpaiOrchestrator.registerAction(listClients);
  }

  // ============================================================================
  // TIME TRACKING ACTIONS
  // ============================================================================

  private registerTimeTrackingActions(): void {
    const clockIn: ActionHandler = {
      actionId: 'time_tracking.clock_in',
      name: 'Clock In',
      category: 'scheduling',
      description: 'Clock in an employee',
      requiredRoles: ['employee', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const [entry] = await db.insert(timeEntries).values({
          workspaceId: request.workspaceId!,
          employeeId: request.payload?.employeeId,
          clockIn: new Date(),
          status: 'active',
        }).returning();
        return createResult(request.actionId, true, `Clock in recorded`, entry, start);
      },
    };

    const getTimeEntries: ActionHandler = {
      actionId: 'time_tracking.get_entries',
      name: 'Get Time Entries',
      category: 'scheduling',
      description: 'Get time entries for an employee',
      requiredRoles: ['employee', 'manager', 'owner', 'root_admin'],
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

    helpaiOrchestrator.registerAction(clockIn);
    helpaiOrchestrator.registerAction(getTimeEntries);
  }

  // ============================================================================
  // NOTIFICATION ACTIONS
  // ============================================================================

  private registerNotificationActions(): void {
    const sendNotification: ActionHandler = {
      actionId: 'notifications.send',
      name: 'Send Notification',
      category: 'notifications',
      description: 'Send a notification to a user',
      requiredRoles: ['manager', 'owner', 'support_agent', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const [notification] = await db.insert(notifications).values({
          userId: request.payload?.userId,
          workspaceId: request.workspaceId,
          title: request.payload?.title,
          message: request.payload?.message,
          type: request.payload?.type || 'system',
          isRead: false,
        }).returning();
        return createResult(request.actionId, true, `Notification sent`, notification, start);
      },
    };

    const clearAllNotifications: ActionHandler = {
      actionId: 'notifications.clear_all',
      name: 'Clear All Notifications',
      category: 'notifications',
      description: 'Clear all notifications for the current user. Use when user asks Trinity to clear their notifications.',
      requiredRoles: ['employee', 'manager', 'owner', 'support_agent', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { storage } = await import('../../storage');
        const aiNotificationService = await import('../aiNotificationService').then(m => m.default);
        
        const userId = request.userId;
        if (!userId) {
          return createResult(request.actionId, false, 'User ID required to clear notifications', null, start);
        }
        
        // Clear both regular notifications and AI maintenance alerts
        const clearedNotifications = await storage.clearAllNotifications(userId);
        const clearedAlerts = await aiNotificationService.acknowledgeAllMaintenanceAlerts(userId);
        
        const totalCleared = clearedNotifications + clearedAlerts;
        return createResult(
          request.actionId, 
          true, 
          `Successfully cleared ${totalCleared} notifications for user`, 
          { clearedNotifications, clearedAlerts, totalCleared },
          start
        );
      },
    };

    const markAllRead: ActionHandler = {
      actionId: 'notifications.mark_all_read',
      name: 'Mark All Notifications Read',
      category: 'notifications',
      description: 'Mark all notifications as read for the current user.',
      requiredRoles: ['employee', 'manager', 'owner', 'support_agent', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { storage } = await import('../../storage');
        
        const userId = request.userId;
        if (!userId) {
          return createResult(request.actionId, false, 'User ID required', null, start);
        }
        
        await storage.markAllNotificationsRead(userId);
        return createResult(request.actionId, true, `All notifications marked as read`, null, start);
      },
    };

    helpaiOrchestrator.registerAction(sendNotification);
    helpaiOrchestrator.registerAction(clearAllNotifications);
    helpaiOrchestrator.registerAction(markAllRead);
  }

  // ============================================================================
  // ONBOARDING ACTIONS
  // ============================================================================

  private registerOnboardingActions(): void {
    const getChecklist: ActionHandler = {
      actionId: 'onboarding.get_checklist',
      name: 'Get Onboarding Checklist',
      category: 'lifecycle',
      description: 'Get the onboarding checklist for a user/employee',
      requiredRoles: ['employee', 'manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { onboardingConfig } = await import('@shared/config/onboardingConfig');
        return createResult(request.actionId, true, 'Onboarding checklist retrieved', onboardingConfig.onboardingSteps, start);
      },
    };

    const sendInvitation: ActionHandler = {
      actionId: 'onboarding.send_invitation',
      name: 'Send Employee Invitation',
      category: 'lifecycle',
      description: 'Send an invitation email to a new employee',
      requiredRoles: ['manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { email, firstName, lastName, role } = request.payload || {};
        const { storage } = await import('../../storage');
        const { emailService } = await import('../emailService');
        
        if (!email || !firstName || !lastName) {
          return createResult(request.actionId, false, 'Email, firstName, and lastName are required', null, start);
        }

        const invitation = await storage.createEmployeeInvitation({
          workspaceId: request.workspaceId!,
          email,
          firstName,
          lastName,
          role: role || 'employee',
          inviteStatus: 'pending',
        });

        const workspace = await storage.getWorkspace(request.workspaceId!);
        await emailService.sendEmployeeInvitationEmail(
          request.workspaceId!,
          invitation.id,
          email,
          firstName,
          workspace?.name || 'Your Organization',
          invitation.token!
        );

        return createResult(request.actionId, true, 'Invitation sent successfully', { invitationId: invitation.id }, start);
      },
    };

    const resendInvitation: ActionHandler = {
      actionId: 'onboarding.resend_invitation',
      name: 'Resend Employee Invitation',
      category: 'lifecycle',
      description: 'Resend an invitation email to an employee',
      requiredRoles: ['manager', 'owner', 'root_admin'],
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
        await emailService.sendEmployeeInvitationEmail(
          invitation.workspaceId,
          invitation.id,
          invitation.email!,
          invitation.firstName,
          workspace?.name || 'Your Organization',
          invitation.token!
        );

        await storage.updateEmployeeInvitation(invitation.id, {
          invitedAt: new Date(),
          resentCount: (invitation.resentCount || 0) + 1,
        });

        return createResult(request.actionId, true, 'Invitation resent successfully', { invitationId }, start);
      },
    };

    const revokeInvitation: ActionHandler = {
      actionId: 'onboarding.revoke_invitation',
      name: 'Revoke Employee Invitation',
      category: 'lifecycle',
      description: 'Revoke an outstanding employee invitation',
      requiredRoles: ['manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { invitationId } = request.payload || {};
        const { storage } = await import('../../storage');
        
        if (!invitationId) {
          return createResult(request.actionId, false, 'Invitation ID is required', null, start);
        }

        await storage.updateEmployeeInvitation(invitationId, {
          inviteStatus: 'revoked',
          revokedAt: new Date(),
        });

        return createResult(request.actionId, true, 'Invitation revoked successfully', { invitationId }, start);
      },
    };

    const sendClientWelcome: ActionHandler = {
      actionId: 'onboarding.send_client_welcome',
      name: 'Send Client Welcome Email',
      category: 'lifecycle',
      description: 'Send a welcome email to a new client with portal access',
      requiredRoles: ['manager', 'owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { clientId, email, clientName, companyName } = request.payload || {};
        const { emailService } = await import('../emailService');
        const { storage } = await import('../../storage');
        
        if (!email || !clientName) {
          return createResult(request.actionId, false, 'Email and clientName are required', null, start);
        }

        const workspace = await storage.getWorkspace(request.workspaceId!);
        await emailService.sendClientWelcomeEmail(
          request.workspaceId!,
          clientId || '',
          email,
          clientName,
          companyName || '',
          workspace?.name || ''
        );

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
            userId,
            role,
            grantedBy: request.userId,
            grantedReason: reason || 'Assigned via AI Brain',
          });
        }

        return createResult(request.actionId, true, 'Platform role assigned successfully', { userId, role }, start);
      },
    };

    const getPlatformOnboarding: ActionHandler = {
      actionId: 'onboarding.get_platform_status',
      name: 'Get Platform Onboarding Status',
      category: 'lifecycle',
      description: 'Get onboarding status across all organizations',
      requiredRoles: ['support_agent', 'sysop', 'root_admin'],
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

    helpaiOrchestrator.registerAction(getChecklist);
    helpaiOrchestrator.registerAction(sendInvitation);
    helpaiOrchestrator.registerAction(resendInvitation);
    helpaiOrchestrator.registerAction(revokeInvitation);
    helpaiOrchestrator.registerAction(sendClientWelcome);
    helpaiOrchestrator.registerAction(assignPlatformRole);
    helpaiOrchestrator.registerAction(getPlatformOnboarding);
  }
  // ============================================================================
  // BULK OPERATION ACTIONS
  // ============================================================================

  private registerBulkOperationActions(): void {
    const bulkImportEmployees: ActionHandler = {
      actionId: 'bulk.import_employees',
      name: 'Bulk Import Employees',
      category: 'scheduling',
      description: 'Import multiple employees from CSV data',
      requiredRoles: ['owner', 'root_admin'],
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
              status: 'active',
            }).returning();
            imported.push(emp);
          } catch (error: any) {
            errors.push({ row, error: error.message });
          }
        }

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
      actionId: 'bulk.export_employees',
      name: 'Bulk Export Employees',
      category: 'scheduling',
      description: 'Export all employees to CSV format',
      requiredRoles: ['owner', 'root_admin'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { exportEmployees } = await import('../exportService');
        const result = await exportEmployees(request.workspaceId!, { format: request.payload?.format || 'csv' });
        return createResult(request.actionId, true, `Employees exported`, result, start);
      },
    };

    helpaiOrchestrator.registerAction(bulkImportEmployees);
    helpaiOrchestrator.registerAction(bulkExportEmployees);
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

    helpaiOrchestrator.registerAction(getIntegrationStatus);
    helpaiOrchestrator.registerAction(listIntegrations);
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
      requiredRoles: ['owner', 'root_admin', 'manager'],
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
      requiredRoles: ['owner', 'root_admin', 'manager'],
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
      requiredRoles: ['owner', 'root_admin', 'manager'],
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
      requiredRoles: ['owner', 'root_admin', 'manager'],
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
      requiredRoles: ['owner', 'root_admin', 'manager'],
      handler: async (request: ActionRequest): Promise<ActionResult> => {
        const start = Date.now();
        const { strategicOptimizationService } = await import('./strategicOptimizationService');
        const employees = await strategicOptimizationService.getEmployeeBusinessMetrics(request.workspaceId!);
        const problematic = employees.filter(e => e.overallScore < 60 || e.noShows > 2 || e.clientComplaints > 2);
        return createResult(request.actionId, true, `Found ${problematic.length} employees needing attention`, { problematicEmployees: problematic, count: problematic.length }, start);
      },
    };

    helpaiOrchestrator.registerAction(generateStrategicSchedule);
    helpaiOrchestrator.registerAction(getEmployeeBusinessMetrics);
    helpaiOrchestrator.registerAction(getClientBusinessMetrics);
    helpaiOrchestrator.registerAction(getStrategicContext);
    helpaiOrchestrator.registerAction(calculateShiftProfit);
    helpaiOrchestrator.registerAction(getAtRiskClients);
    helpaiOrchestrator.registerAction(getTopPerformers);
    helpaiOrchestrator.registerAction(getProblematicEmployees);
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  getRegisteredActionCount(): number {
    return 33; // Updated count including 8 new strategic actions
  }
}

// Export singleton instance
export const aiBrainActionRegistry = new AIBrainActionRegistry();

// Initialize on import
aiBrainActionRegistry.initialize().catch(console.error);

export default aiBrainActionRegistry;
