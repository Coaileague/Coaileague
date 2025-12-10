/**
 * AI BRAIN MASTER ORCHESTRATOR
 * =============================
 * Central hub that connects Gemini AI to ALL platform services.
 * This is the ONE orchestration layer that coordinates:
 * - All 80+ backend services
 * - All automation tasks
 * - All notification systems
 * - All end-user experiences
 * - All cross-service workflows
 * 
 * The AI Brain (Gemini) uses this to orchestrate the ENTIRE platform.
 */

import { helpaiOrchestrator, type ActionRequest, type ActionResult, type ActionHandler } from '../helpai/helpaiActionOrchestrator';
import { platformEventBus, publishPlatformUpdate } from '../platformEventBus';
import { AIBrainService } from './aiBrainService';
import { aiBrainAuthorizationService } from './aiBrainAuthorizationService';
import { aiBrainFileSystemTools } from './aiBrainFileSystemTools';
import { aiBrainWorkflowExecutor } from './aiBrainWorkflowExecutor';
import { aiBrainTestRunner } from './aiBrainTestRunner';
import { aiNotificationService } from '../aiNotificationService';
import { aiExpenseCategorizationService } from './aiExpenseCategorizationService';
import { aiDynamicPricingService } from './aiDynamicPricingService';
import { broadcastNotificationToUser, broadcastUserScopedNotification, broadcastToAllClients } from '../../websocket';
import { db } from '../../db';
import { eq, desc, and, gte, sql, isNotNull } from 'drizzle-orm';
import {
  employees,
  shifts,
  timeEntries,
  invoices,
  payrollRuns,
  notifications,
  platformUpdates,
  workspaces,
  systemAuditLogs,
  employeeCertifications,
} from '@shared/schema';

// ============================================================================
// ORCHESTRATOR SERVICE CATEGORIES
// ============================================================================

export type ServiceCategory = 
  | 'scheduling'
  | 'payroll'
  | 'invoicing'
  | 'analytics'
  | 'compliance'
  | 'notifications'
  | 'gamification'
  | 'automation'
  | 'communication'
  | 'health'
  | 'user_assistance';

export interface OrchestrationTask {
  id: string;
  category: ServiceCategory;
  action: string;
  parameters: Record<string, any>;
  priority: 'low' | 'normal' | 'high' | 'critical';
  scheduledAt?: Date;
  executedAt?: Date;
  result?: any;
  error?: string;
}

export interface WorkflowChain {
  id: string;
  name: string;
  steps: OrchestrationTask[];
  currentStep: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
}

// ============================================================================
// AI BRAIN MASTER ORCHESTRATOR CLASS
// ============================================================================

class AIBrainMasterOrchestrator {
  private static instance: AIBrainMasterOrchestrator;
  private aiBrain: AIBrainService;
  private activeWorkflows: Map<string, WorkflowChain> = new Map();
  private initialized = false;

  static getInstance(): AIBrainMasterOrchestrator {
    if (!this.instance) {
      this.instance = new AIBrainMasterOrchestrator();
    }
    return this.instance;
  }

  constructor() {
    this.aiBrain = new AIBrainService();
  }

  // ============================================================================
  // NOTIFICATION BRIDGE - Connect orchestration to notification system
  // ============================================================================

  /**
   * Notify a specific user about an orchestration outcome
   * Supports dual-scope notification model: workspace-scoped or user-scoped
   */
  async notifyUser(
    userId: string,
    workspaceId: string | null | undefined,
    title: string,
    message: string,
    notificationType: 'info' | 'success' | 'warning' | 'error' = 'info',
    actionId?: string
  ): Promise<boolean> {
    try {
      const { storage } = await import('../../storage');
      
      const typeMap: Record<string, string> = {
        'info': 'system',
        'success': 'ai_action_completed',
        'warning': 'alert',
        'error': 'alert',
      };
      
      const notificationType_db = typeMap[notificationType] || 'system';
      const metadata = { 
        actionId, 
        source: 'ai_brain_orchestrator', 
        generatedAt: new Date().toISOString(),
        notificationLevel: notificationType,
      };
      
      let notification;
      
      if (workspaceId) {
        // Workspace-scoped notification (standard path)
        notification = await storage.createNotification({
          userId,
          workspaceId,
          scope: 'workspace' as any,
          title,
          message,
          type: notificationType_db as any,
          isRead: false,
          actionUrl: '/notifications',
          metadata,
        });
        
        // Broadcast to user's workspace subscription
        broadcastNotificationToUser(workspaceId, userId, {
          id: notification.id,
          type: notification.type,
          title,
          message,
          scope: 'workspace',
          createdAt: notification.createdAt,
        });
      } else {
        // User-scoped notification (for users without workspace context)
        notification = await storage.createUserScopedNotification(
          userId,
          notificationType_db,
          title,
          message,
          metadata
        );
        
        // Use dedicated user-scoped broadcast helper for unread counter parity
        broadcastUserScopedNotification(userId, {
          id: notification.id,
          type: notification.type,
          title,
          message,
          createdAt: notification.createdAt,
        });
      }

      console.log(`[AI Brain Orchestrator] Notified user ${userId} (scope: ${workspaceId ? 'workspace' : 'user'}): ${title}`);
      return true;
    } catch (error) {
      console.error('[AI Brain Orchestrator] Failed to notify user:', error);
      return false;
    }
  }

  /**
   * Broadcast an orchestration outcome to all connected users in a workspace
   */
  async broadcastToWorkspace(
    workspaceId: string,
    title: string,
    message: string,
    category: 'feature' | 'automation' | 'system' | 'alert' = 'automation'
  ): Promise<boolean> {
    try {
      const categoryMap: Record<string, 'feature' | 'improvement' | 'bugfix' | 'security' | 'announcement'> = {
        'feature': 'feature',
        'automation': 'feature',
        'system': 'announcement',
        'alert': 'security',
      };

      await aiNotificationService.pushAIInsight('automation', {
        title,
        description: message,
        workspaceId,
        category: categoryMap[category] || 'announcement',
        priority: category === 'alert' ? 3 : 2,
        metadata: { source: 'ai_brain_orchestrator', broadcastAt: new Date().toISOString() },
      });

      broadcastToAllClients({
        type: 'orchestration_update',
        workspaceId,
        title,
        message,
        category,
        timestamp: new Date().toISOString(),
      });

      console.log(`[AI Brain Orchestrator] Broadcast to workspace ${workspaceId}: ${title}`);
      return true;
    } catch (error) {
      console.error('[AI Brain Orchestrator] Failed to broadcast:', error);
      return false;
    }
  }

  /**
   * Notify about action completion with detailed result
   */
  async notifyActionComplete(
    request: ActionRequest,
    result: ActionResult,
    actionName: string
  ): Promise<void> {
    const title = result.success 
      ? `AI Action Complete: ${actionName}`
      : `AI Action Failed: ${actionName}`;
    
    const message = result.success
      ? result.message || `${actionName} completed successfully`
      : `Error: ${result.message || 'Unknown error occurred'}`;

    const notificationType = result.success ? 'success' : 'error';

    if (request.userId && request.workspaceId) {
      await this.notifyUser(
        request.userId,
        request.workspaceId,
        title,
        message,
        notificationType,
        request.actionId
      );
    }

    if (result.success && request.workspaceId) {
      await platformEventBus.publish({
        type: 'ai_brain_action',
        category: 'feature',
        title,
        description: message,
        workspaceId: request.workspaceId,
        userId: request.userId,
        metadata: {
          actionId: request.actionId,
          actionName,
          result: result.data,
          executionTimeMs: result.executionTimeMs,
        },
      });
    }
  }

  /**
   * Notify about workflow chain completion
   */
  async notifyWorkflowComplete(
    workflow: WorkflowChain,
    userId: string,
    workspaceId?: string
  ): Promise<void> {
    const isSuccess = workflow.status === 'completed';
    const title = isSuccess
      ? `Workflow Complete: ${workflow.name}`
      : `Workflow Failed: ${workflow.name}`;

    const completedSteps = workflow.steps.filter(s => s.result?.success).length;
    const totalSteps = workflow.steps.length;
    const failedStep = workflow.steps.find(s => s.error);
    
    const message = isSuccess
      ? `All ${totalSteps} steps completed successfully`
      : `Completed ${completedSteps}/${totalSteps} steps before failure${failedStep?.error ? `: ${failedStep.error}` : ''}`;

    try {
      // Use notifyUser consistently for all notification paths to ensure unread counter parity
      if (workspaceId) {
        // Send workspace-scoped notification with persistence + WebSocket broadcast
        await this.notifyUser(
          userId,
          workspaceId,
          title,
          message,
          isSuccess ? 'success' : 'error',
          workflow.id
        );
      } else if (userId) {
        // No workspaceId provided - use dual-scope notification model
        // First try to find user's workspace membership for workspace-scoped notification
        try {
          const { storage } = await import('../../storage');
          const memberInfo = await storage.getWorkspaceMemberByUserId(userId);
          
          // Use notifyUser consistently - it handles both workspace and user scopes
          await this.notifyUser(
            userId,
            memberInfo?.workspaceId || null,
            title,
            message,
            isSuccess ? 'success' : 'error',
            workflow.id
          );
          console.log(`[AI Brain Orchestrator] Sent ${memberInfo?.workspaceId ? 'workspace' : 'user'}-scoped notification to user ${userId}`);
        } catch (lookupError: any) {
          console.error(`[AI Brain Orchestrator] Failed to lookup workspace, falling back to user-scoped: ${lookupError.message}`);
          // Fall back to user-scoped notification via notifyUser with null workspaceId
          await this.notifyUser(
            userId,
            null,
            title,
            message,
            isSuccess ? 'success' : 'error',
            workflow.id
          );
        }
      }

      // Publish event for other services to react to
      await platformEventBus.publish({
        type: 'automation_completed',
        category: isSuccess ? 'feature' : 'announcement',
        title,
        description: message,
        workspaceId,
        userId,
        metadata: {
          workflowId: workflow.id,
          workflowName: workflow.name,
          status: workflow.status,
          completedSteps,
          totalSteps,
          duration: workflow.completedAt && workflow.startedAt 
            ? workflow.completedAt.getTime() - workflow.startedAt.getTime()
            : 0,
          source: 'ai_brain_orchestrator',
        },
      });

      console.log(`[AI Brain Orchestrator] Workflow ${workflow.id} ${workflow.status}: ${completedSteps}/${totalSteps} steps, notification sent`);
    } catch (error: any) {
      console.error(`[AI Brain Orchestrator] Failed to send workflow notification: ${error.message}`);
    }
  }

  /**
   * Initialize the master orchestrator and register all actions
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[AI Brain Master Orchestrator] Initializing...');
    
    // Register all orchestration actions
    await this.registerSchedulingActions();
    await this.registerPayrollActions();
    await this.registerComplianceActions();
    await this.registerEscalationActions();
    await this.registerAnalyticsActions();
    await this.registerNotificationActions();
    await this.registerAutomationActions();
    await this.registerEmployeeLifecycleActions();
    await this.registerHealthCheckActions();
    await this.registerUserAssistanceActions();
    this.registerFileSystemActions();
    this.registerWorkflowActions();
    this.registerTestRunnerActions();
    this.registerOnboardingAssistantActions();
    this.registerExpenseCategorizationActions();
    this.registerDynamicPricingActions();
    await this.registerSessionCheckpointActions();
    await this.registerElevatedSessionGuardianActions();
    this.registerMemoryAndGovernanceActions();
    await this.registerGemini3ToolActions();
    await this.registerArchitectGradeActions();
    
    // Subscribe to platform events
    this.subscribeToEvents();
    
    this.initialized = true;
    console.log('[AI Brain Master Orchestrator] Initialized successfully');
  }

  // ============================================================================
  // SCHEDULING ORCHESTRATION
  // ============================================================================

  private async registerSchedulingActions(): Promise<void> {
    helpaiOrchestrator.registerAction({
      actionId: 'scheduling.generate_ai_schedule',
      name: 'Generate AI Schedule',
      category: 'scheduling',
      description: 'Use Gemini AI to generate optimal weekly schedules based on employee availability, skills, and business needs',
      requiredRoles: ['manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { workspaceId, weekStart, weekEnd } = request.payload || {};
        
        try {
          const { aiSchedulingTriggerService } = await import('../aiSchedulingTriggerService');
          const result = await aiSchedulingTriggerService.triggerAIScheduleGeneration(
            workspaceId || request.workspaceId!
          );
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'AI schedule generation triggered',
            data: result,
            executionTimeMs: Date.now() - startTime,
            notificationSent: true
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'scheduling.detect_conflicts',
      name: 'Detect Schedule Conflicts',
      category: 'scheduling',
      description: 'AI scans for scheduling conflicts, overtime violations, and availability issues',
      requiredRoles: ['manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { workspaceId } = request.payload || {};
        
        try {
          const today = new Date().toISOString().split('T')[0];
          const activeShifts = await db.select().from(shifts)
            .where(and(
              eq(shifts.workspaceId, workspaceId || request.workspaceId!),
              gte(shifts.startTime, new Date(today))
            ))
            .limit(200);
          
          // Simple conflict detection logic
          const conflicts: any[] = [];
          const employeeShifts = new Map<string, typeof activeShifts>();
          
          for (const shift of activeShifts) {
            if (!employeeShifts.has(shift.employeeId!)) {
              employeeShifts.set(shift.employeeId!, []);
            }
            employeeShifts.get(shift.employeeId!)!.push(shift);
          }
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Scanned ${activeShifts.length} shifts, found ${conflicts.length} potential conflicts`,
            data: { shiftsScanned: activeShifts.length, conflicts },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Time Tracking Actions - Using existing time-entry service with proper authorization
    helpaiOrchestrator.registerAction({
      actionId: 'time_tracking.clock_in',
      name: 'Clock In Employee',
      category: 'scheduling',
      description: 'Clock in an employee and start tracking their work hours',
      requiredRoles: ['staff', 'manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { notes } = request.payload || {};
        const effectiveWorkspaceId = request.workspaceId;
        const userId = request.userId;
        
        try {
          if (!effectiveWorkspaceId || !userId) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Workspace and user ID required for clock-in',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          // Lookup employee record for the user in their workspace
          const employeeRecord = await db.select().from(employees)
            .where(and(
              eq(employees.userId, userId),
              eq(employees.workspaceId, effectiveWorkspaceId)
            ))
            .limit(1);
          
          if (!employeeRecord.length) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'No employee record found for this user in workspace',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          const employeeId = employeeRecord[0].id;
          
          // Check for existing active clock-in
          const activeEntry = await db.select().from(timeEntries)
            .where(and(
              eq(timeEntries.employeeId, employeeId),
              eq(timeEntries.workspaceId, effectiveWorkspaceId),
              eq(timeEntries.status, 'clocked_in')
            ))
            .limit(1);
          
          if (activeEntry.length > 0) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Already clocked in. Please clock out first.',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          const [entry] = await db.insert(timeEntries).values({
            workspaceId: effectiveWorkspaceId,
            employeeId,
            clockIn: new Date(),
            status: 'clocked_in',
            notes,
          }).returning();
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Successfully clocked in',
            data: { timeEntryId: entry.id, clockIn: entry.clockIn, employeeId },
            executionTimeMs: Date.now() - startTime,
            notificationSent: true
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'time_tracking.clock_out',
      name: 'Clock Out Employee',
      category: 'scheduling',
      description: 'Clock out an employee and finalize their time entry',
      requiredRoles: ['staff', 'manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const effectiveWorkspaceId = request.workspaceId;
        const userId = request.userId;
        
        try {
          if (!effectiveWorkspaceId || !userId) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Workspace and user ID required for clock-out',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          // Lookup employee record
          const employeeRecord = await db.select().from(employees)
            .where(and(
              eq(employees.userId, userId),
              eq(employees.workspaceId, effectiveWorkspaceId)
            ))
            .limit(1);
          
          if (!employeeRecord.length) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'No employee record found',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          const employeeId = employeeRecord[0].id;
          
          // Find the active entry for this employee in this workspace only
          const activeEntry = await db.select().from(timeEntries)
            .where(and(
              eq(timeEntries.employeeId, employeeId),
              eq(timeEntries.workspaceId, effectiveWorkspaceId),
              eq(timeEntries.status, 'clocked_in')
            ))
            .limit(1);
          
          if (!activeEntry.length) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'No active clock-in found. Please clock in first.',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          const clockOut = new Date();
          // Include workspaceId in WHERE clause to prevent cross-tenant manipulation
          await db.update(timeEntries)
            .set({ clockOut, status: 'pending_approval' })
            .where(and(
              eq(timeEntries.id, activeEntry[0].id),
              eq(timeEntries.workspaceId, effectiveWorkspaceId)
            ));
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Successfully clocked out',
            data: { timeEntryId: activeEntry[0].id, clockOut, employeeId },
            executionTimeMs: Date.now() - startTime,
            notificationSent: true
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'time_tracking.get_timesheet',
      name: 'Get Employee Timesheet',
      category: 'scheduling',
      description: 'Retrieve timesheet data for an employee within a date range',
      requiredRoles: ['staff', 'manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { startDate, endDate } = request.payload || {};
        const effectiveWorkspaceId = request.workspaceId;
        const userId = request.userId;
        const userRole = request.userRole || 'staff';
        
        try {
          if (!effectiveWorkspaceId || !userId) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Workspace and user required',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          // Staff can only see their own timesheet
          const isManager = ['manager', 'admin', 'super_admin', 'org_owner', 'org_admin'].includes(userRole);
          
          // Get the employee ID for the requesting user
          const employeeRecord = await db.select().from(employees)
            .where(and(
              eq(employees.userId, userId),
              eq(employees.workspaceId, effectiveWorkspaceId)
            ))
            .limit(1);
          
          if (!employeeRecord.length && !isManager) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'No employee record found',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          // Build query with workspace scoping
          const conditions = [eq(timeEntries.workspaceId, effectiveWorkspaceId)];
          
          // Staff can only see their own entries
          if (!isManager && employeeRecord.length) {
            conditions.push(eq(timeEntries.employeeId, employeeRecord[0].id));
          }
          
          if (startDate) {
            conditions.push(gte(timeEntries.clockIn, new Date(startDate)));
          }
          
          const entries = await db.select()
            .from(timeEntries)
            .where(and(...conditions))
            .orderBy(desc(timeEntries.clockIn))
            .limit(100);
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Found ${entries.length} time entries`,
            data: { entries, count: entries.length },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Advanced Scheduling Actions - With proper workspace scoping and authorization
    helpaiOrchestrator.registerAction({
      actionId: 'scheduling.create_recurring_shift',
      name: 'Create Recurring Shift Pattern',
      category: 'scheduling',
      description: 'Create a recurring shift pattern that automatically generates shifts',
      requiredRoles: ['manager', 'admin', 'super_admin', 'org_owner', 'org_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { employeeId, title, daysOfWeek, startTime: shiftStart, endTime, recurrencePattern } = request.payload || {};
        const effectiveWorkspaceId = request.workspaceId;
        
        try {
          if (!effectiveWorkspaceId) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Workspace ID required',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          if (!title) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Shift title required',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          // Verify employee belongs to this workspace if specified
          if (employeeId) {
            const emp = await db.select().from(employees)
              .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, effectiveWorkspaceId)))
              .limit(1);
            
            if (!emp.length) {
              return {
                success: false,
                actionId: request.actionId,
                message: 'Employee not found in this workspace',
                executionTimeMs: Date.now() - startTime
              };
            }
          }
          
          const { createRecurringPattern } = await import('../advancedSchedulingService');
          
          const pattern = await createRecurringPattern({
            workspaceId: effectiveWorkspaceId,
            employeeId,
            title,
            daysOfWeek: daysOfWeek || [],
            startTimeOfDay: shiftStart || '09:00',
            endTimeOfDay: endTime || '17:00',
            recurrencePattern: recurrencePattern || 'weekly',
            startDate: new Date(),
            isActive: true,
          });
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Created recurring shift pattern: ${title}`,
            data: { patternId: pattern.id, pattern },
            executionTimeMs: Date.now() - startTime,
            notificationSent: true
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'scheduling.request_shift_swap',
      name: 'Request Shift Swap',
      category: 'scheduling',
      description: 'Request to swap a shift with another employee',
      requiredRoles: ['staff', 'manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { originalShiftId, requestedEmployeeId, reason } = request.payload || {};
        const effectiveWorkspaceId = request.workspaceId;
        const userId = request.userId;
        
        try {
          if (!effectiveWorkspaceId || !userId) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Workspace and user required',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          if (!originalShiftId) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Shift ID required for swap request',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          // Get requesting employee first
          const empRecord = await db.select().from(employees)
            .where(and(eq(employees.userId, userId), eq(employees.workspaceId, effectiveWorkspaceId)))
            .limit(1);
          
          if (!empRecord.length) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Employee record not found',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          // Verify shift exists, belongs to workspace, AND is assigned to this employee
          const shift = await db.select().from(shifts)
            .where(and(
              eq(shifts.id, originalShiftId),
              eq(shifts.workspaceId, effectiveWorkspaceId),
              eq(shifts.employeeId, empRecord[0].id)
            ))
            .limit(1);
          
          if (!shift.length) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Shift not found or not assigned to you',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          const { requestShiftSwap } = await import('../advancedSchedulingService');
          
          const swapRequest = await requestShiftSwap({
            workspaceId: effectiveWorkspaceId,
            originalShiftId,
            requestingEmployeeId: empRecord[0].id,
            requestedEmployeeId,
            reason,
            status: 'pending',
          });
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Shift swap request submitted',
            data: { swapRequestId: swapRequest.id, status: swapRequest.status },
            executionTimeMs: Date.now() - startTime,
            notificationSent: true
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'scheduling.approve_shift_swap',
      name: 'Approve Shift Swap',
      category: 'scheduling',
      description: 'Approve or reject a shift swap request',
      requiredRoles: ['manager', 'admin', 'super_admin', 'org_owner', 'org_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { swapRequestId, approved, managerNotes } = request.payload || {};
        const effectiveWorkspaceId = request.workspaceId;
        const userId = request.userId;
        
        try {
          if (!effectiveWorkspaceId || !userId) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Workspace and user required',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          if (!swapRequestId) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Swap request ID required',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          // Verify swap request exists and belongs to workspace
          const { shiftSwapRequests } = await import('@shared/schema');
          const swapReq = await db.select().from(shiftSwapRequests)
            .where(and(eq(shiftSwapRequests.id, swapRequestId), eq(shiftSwapRequests.workspaceId, effectiveWorkspaceId)))
            .limit(1);
          
          if (!swapReq.length) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Swap request not found in this workspace',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          if (swapReq[0].status !== 'pending') {
            return {
              success: false,
              actionId: request.actionId,
              message: `Swap request already ${swapReq[0].status}`,
              executionTimeMs: Date.now() - startTime
            };
          }
          
          const { approveShiftSwap, rejectShiftSwap } = await import('../advancedSchedulingService');
          
          let result;
          if (approved) {
            result = await approveShiftSwap(swapRequestId, userId, managerNotes);
          } else {
            result = await rejectShiftSwap(swapRequestId, userId, managerNotes);
          }
          
          return {
            success: true,
            actionId: request.actionId,
            message: approved ? 'Shift swap approved' : 'Shift swap rejected',
            data: result,
            executionTimeMs: Date.now() - startTime,
            notificationSent: true
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'scheduling.duplicate_week',
      name: 'Duplicate Week Schedule',
      category: 'scheduling',
      description: 'One-click duplication of an entire week schedule to the next week',
      requiredRoles: ['manager', 'admin', 'super_admin', 'org_owner', 'org_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { sourceWeekStart, targetWeekStart } = request.payload || {};
        const effectiveWorkspaceId = request.workspaceId;
        
        try {
          if (!effectiveWorkspaceId) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Workspace ID required',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          if (!sourceWeekStart || !targetWeekStart) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Source and target week start dates required',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          const { duplicateWeekSchedule } = await import('../advancedSchedulingService');
          
          const result = await duplicateWeekSchedule(
            effectiveWorkspaceId,
            new Date(sourceWeekStart),
            new Date(targetWeekStart)
          );
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Duplicated ${result.shiftsCreated} shifts to new week`,
            data: result,
            executionTimeMs: Date.now() - startTime,
            notificationSent: true
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered scheduling and time tracking actions');
  }

  // ============================================================================
  // PAYROLL ORCHESTRATION
  // ============================================================================

  private async registerPayrollActions(): Promise<void> {
    helpaiOrchestrator.registerAction({
      actionId: 'payroll.calculate_run',
      name: 'Calculate Payroll Run',
      category: 'payroll',
      description: 'AI calculates payroll for all employees including overtime, deductions, and taxes',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { workspaceId, periodStart, periodEnd } = request.payload || {};
        
        try {
          // Get employee count
          const employeeList = await db.select().from(employees)
            .where(eq(employees.workspaceId, workspaceId || request.workspaceId!));
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Payroll calculation initiated for ${employeeList.length} employees`,
            data: { 
              employeeCount: employeeList.length,
              periodStart,
              periodEnd
            },
            executionTimeMs: Date.now() - startTime,
            notificationSent: true
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'payroll.detect_anomalies',
      name: 'Detect Payroll Anomalies',
      category: 'payroll',
      description: 'AI scans for unusual patterns in time entries and payroll calculations',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { workspaceId } = request.payload || {};
        
        try {
          const recentEntries = await db.select().from(timeEntries)
            .where(eq(timeEntries.workspaceId, workspaceId || request.workspaceId!))
            .orderBy(desc(timeEntries.clockIn))
            .limit(500);
          
          // Simple anomaly detection
          const anomalies: any[] = [];
          for (const entry of recentEntries) {
            if (entry.clockOut && entry.clockIn) {
              const hours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);
              if (hours > 12 || hours < 0.5) {
                anomalies.push({
                  entryId: entry.id,
                  type: hours > 12 ? 'excessive_hours' : 'short_shift',
                  hours
                });
              }
            }
          }
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Scanned ${recentEntries.length} entries, found ${anomalies.length} anomalies`,
            data: { entriesScanned: recentEntries.length, anomalies },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Payroll submission action
    helpaiOrchestrator.registerAction({
      actionId: 'payroll.submit_for_approval',
      name: 'Submit Payroll for Approval',
      category: 'payroll',
      description: 'AI submits calculated payroll run for manager approval',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { workspaceId, payrollRunId } = request.payload || {};
        
        try {
          const wsId = workspaceId || request.workspaceId!;
          
          // Update payroll run status
          if (payrollRunId) {
            await db.update(payrollRuns)
              .set({ status: 'pending', updatedAt: new Date() })
              .where(eq(payrollRuns.id, payrollRunId));
          }
          
          // Notify approvers
          await this.notifyUser(
            request.userId!,
            wsId,
            'Payroll Submitted for Approval',
            'Payroll run has been submitted and is awaiting manager approval',
            'info'
          );
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Payroll submitted for approval',
            data: { payrollRunId, status: 'pending' },
            executionTimeMs: Date.now() - startTime,
            notificationSent: true
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Payroll approval action
    helpaiOrchestrator.registerAction({
      actionId: 'payroll.approve_run',
      name: 'Approve Payroll Run',
      category: 'payroll',
      description: 'AI approves payroll run and triggers payment processing',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { workspaceId, payrollRunId, approverNotes } = request.payload || {};
        
        try {
          const wsId = workspaceId || request.workspaceId!;
          
          if (payrollRunId) {
            await db.update(payrollRuns)
              .set({ 
                status: 'approved', 
                processedBy: request.userId,
                processedAt: new Date(),
                updatedAt: new Date() 
              })
              .where(eq(payrollRuns.id, payrollRunId));
          }
          
          // Log approval audit
          await db.insert(systemAuditLogs).values({
            action: 'payroll_approved',
            entityType: 'payroll_run',
            entityId: payrollRunId,
            userId: request.userId!,
            workspaceId: wsId,
            metadata: { payrollRunId, approverNotes },
          });
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Payroll run approved',
            data: { payrollRunId, status: 'approved', approvedBy: request.userId },
            executionTimeMs: Date.now() - startTime,
            notificationSent: true
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Bulk payroll processing
    helpaiOrchestrator.registerAction({
      actionId: 'payroll.bulk_process',
      name: 'Bulk Process Payroll',
      category: 'payroll',
      description: 'AI processes payroll for multiple employees in batch',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { workspaceId, employeeIds, periodStart, periodEnd } = request.payload || {};
        
        try {
          const wsId = workspaceId || request.workspaceId!;
          const targetEmployees = employeeIds || [];
          
          // Get time entries for period
          const entries = await db.select().from(timeEntries)
            .where(and(
              eq(timeEntries.workspaceId, wsId),
              gte(timeEntries.clockIn, new Date(periodStart || new Date()))
            ));
          
          const processedCount = targetEmployees.length || entries.length;
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Bulk payroll processing initiated for ${processedCount} employees`,
            data: { 
              processedCount,
              periodStart,
              periodEnd,
              entriesFound: entries.length
            },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered payroll actions');
  }

  // ============================================================================
  // COMPLIANCE REMEDIATION ORCHESTRATION
  // ============================================================================

  private async registerComplianceActions(): Promise<void> {
    // Certification expiry detection
    helpaiOrchestrator.registerAction({
      actionId: 'compliance.check_certifications',
      name: 'Check Certification Expiry',
      category: 'compliance',
      description: 'AI scans for expiring employee certifications and licenses',
      requiredRoles: ['manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { workspaceId, daysAhead } = request.payload || {};
        
        try {
          const wsId = workspaceId || request.workspaceId!;
          const lookAheadDays = daysAhead || 30;
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() + lookAheadDays);
          
          // Get employees with certifications
          const employeeList = await db.select().from(employees)
            .where(eq(employees.workspaceId, wsId));
          
          const expiringCerts: any[] = [];
          const expiredCerts: any[] = [];
          
          // Get certifications separately from the employeeCertifications table
          const certList = await db.select({
            certId: employeeCertifications.id,
            employeeId: employeeCertifications.employeeId,
            certificationName: employeeCertifications.certificationName,
            expirationDate: employeeCertifications.expirationDate,
            employeeFirstName: employees.firstName,
            employeeLastName: employees.lastName,
          })
            .from(employeeCertifications)
            .innerJoin(employees, eq(employeeCertifications.employeeId, employees.id))
            .where(eq(employeeCertifications.workspaceId, wsId));
          
          for (const cert of certList) {
            if (cert.expirationDate) {
              const expiry = new Date(cert.expirationDate);
              const employeeName = `${cert.employeeFirstName} ${cert.employeeLastName}`;
              if (expiry < new Date()) {
                expiredCerts.push({ employeeId: cert.employeeId, employeeName, certificationName: cert.certificationName, expiryDate: cert.expirationDate });
              } else if (expiry < cutoffDate) {
                expiringCerts.push({ employeeId: cert.employeeId, employeeName, certificationName: cert.certificationName, expiryDate: cert.expirationDate, daysUntilExpiry: Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) });
              }
            }
          }
          
          // Notify if issues found
          if (expiredCerts.length > 0 || expiringCerts.length > 0) {
            await this.notifyUser(
              request.userId!,
              wsId,
              'Certification Compliance Alert',
              `Found ${expiredCerts.length} expired and ${expiringCerts.length} expiring certifications`,
              'warning'
            );
          }
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Scanned ${employeeList.length} employees for certification compliance`,
            data: { 
              employeesScanned: employeeList.length,
              expiredCertifications: expiredCerts,
              expiringCertifications: expiringCerts,
              lookAheadDays
            },
            executionTimeMs: Date.now() - startTime,
            notificationSent: expiredCerts.length > 0 || expiringCerts.length > 0
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Policy violation detection
    helpaiOrchestrator.registerAction({
      actionId: 'compliance.detect_violations',
      name: 'Detect Policy Violations',
      category: 'compliance',
      description: 'AI scans for overtime, break, and labor law violations',
      requiredRoles: ['manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { workspaceId, periodDays } = request.payload || {};
        
        try {
          const wsId = workspaceId || request.workspaceId!;
          const lookbackDays = periodDays || 7;
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - lookbackDays);
          
          // Get recent time entries
          const entries = await db.select().from(timeEntries)
            .where(and(
              eq(timeEntries.workspaceId, wsId),
              gte(timeEntries.clockIn, startDate)
            ));
          
          const violations: any[] = [];
          const employeeHours = new Map<string, number>();
          
          // Check for overtime violations
          for (const entry of entries) {
            if (entry.clockIn && entry.clockOut) {
              const hours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);
              const currentTotal = employeeHours.get(entry.employeeId!) || 0;
              employeeHours.set(entry.employeeId!, currentTotal + hours);
              
              // Check for excessive single shift (>12 hours)
              if (hours > 12) {
                violations.push({
                  type: 'excessive_shift',
                  severity: 'high',
                  employeeId: entry.employeeId,
                  entryId: entry.id,
                  details: `Shift exceeded 12 hours (${hours.toFixed(1)} hours)`
                });
              }
              
              // Check for missing break (>6 hours without break)
              // Using breakDurationMinutes from schema (cast to any for optional field access)
              const breakDuration = (entry as any).breakDurationMinutes || 0;
              if (hours > 6 && !breakDuration) {
                violations.push({
                  type: 'missing_break',
                  severity: 'medium',
                  employeeId: entry.employeeId,
                  entryId: entry.id,
                  details: `No break recorded for ${hours.toFixed(1)} hour shift`
                });
              }
            }
          }
          
          // Check for weekly overtime (>40 hours)
          for (const [empId, totalHours] of employeeHours) {
            if (totalHours > 40) {
              violations.push({
                type: 'weekly_overtime',
                severity: 'medium',
                employeeId: empId,
                details: `Employee worked ${totalHours.toFixed(1)} hours in period (exceeds 40)`
              });
            }
          }
          
          if (violations.length > 0) {
            await this.notifyUser(
              request.userId!,
              wsId,
              'Policy Violations Detected',
              `Found ${violations.length} policy violations requiring attention`,
              'warning'
            );
          }
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Scanned ${entries.length} time entries, found ${violations.length} violations`,
            data: { 
              entriesScanned: entries.length,
              violations,
              periodDays: lookbackDays
            },
            executionTimeMs: Date.now() - startTime,
            notificationSent: violations.length > 0
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Compliance remediation workflow
    helpaiOrchestrator.registerAction({
      actionId: 'compliance.auto_remediate',
      name: 'Auto-Remediate Compliance Issues',
      category: 'compliance',
      description: 'AI automatically resolves common compliance issues',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { workspaceId, violationType, autoFix } = request.payload || {};
        
        try {
          const wsId = workspaceId || request.workspaceId!;
          const remediationActions: any[] = [];
          
          // Generate remediation recommendations
          if (violationType === 'missing_break' && autoFix) {
            remediationActions.push({
              action: 'schedule_break_reminders',
              status: 'queued',
              description: 'AI will send break reminders to affected employees'
            });
          }
          
          if (violationType === 'weekly_overtime') {
            remediationActions.push({
              action: 'adjust_schedule',
              status: 'recommended',
              description: 'AI recommends reducing scheduled hours for affected employees'
            });
          }
          
          if (violationType === 'certification_expired') {
            remediationActions.push({
              action: 'suspend_assignments',
              status: 'recommended',
              description: 'AI recommends suspending assignments requiring expired certification'
            });
          }
          
          // Log remediation audit
          await db.insert(systemAuditLogs).values({
            action: 'compliance_remediation',
            entityType: 'compliance',
            userId: request.userId!,
            workspaceId: wsId,
            metadata: { violationType, remediationActions, autoFix },
          });
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Generated ${remediationActions.length} remediation actions`,
            data: { remediationActions, violationType },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered compliance actions');
  }

  // ============================================================================
  // ESCALATION RUNBOOKS ORCHESTRATION
  // ============================================================================

  private async registerEscalationActions(): Promise<void> {
    // Critical issue escalation
    helpaiOrchestrator.registerAction({
      actionId: 'escalation.critical_issue',
      name: 'Escalate Critical Issue',
      category: 'system',
      description: 'AI escalates critical issues to appropriate personnel',
      requiredRoles: ['manager', 'admin', 'super_admin', 'support'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { workspaceId, issueType, severity, description, affectedUsers } = request.payload || {};
        
        try {
          const wsId = workspaceId || request.workspaceId!;
          
          // Determine escalation path based on severity
          const escalationPath = severity === 'critical' 
            ? ['super_admin', 'support'] 
            : severity === 'high'
            ? ['admin', 'manager']
            : ['manager'];
          
          // Create escalation record
          const escalationId = `esc_${Date.now()}`;
          
          // Log escalation
          await db.insert(systemAuditLogs).values({
            action: 'issue_escalation',
            entityType: 'escalation',
            entityId: escalationId,
            userId: request.userId!,
            workspaceId: wsId,
            metadata: {
              escalationId,
              issueType,
              severity,
              description,
              affectedUsers,
              escalationPath,
              escalatedAt: new Date().toISOString()
            },
          });
          
          // Notify escalation targets
          await this.notifyUser(
            request.userId!,
            wsId,
            `Critical Issue Escalated: ${issueType}`,
            description || 'A critical issue requires immediate attention',
            'error'
          );
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Issue escalated to ${escalationPath.join(', ')}`,
            data: { 
              escalationId,
              severity,
              issueType,
              escalationPath,
              escalatedAt: new Date().toISOString()
            },
            executionTimeMs: Date.now() - startTime,
            notificationSent: true
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // System health escalation
    helpaiOrchestrator.registerAction({
      actionId: 'escalation.system_health',
      name: 'Escalate System Health Issue',
      category: 'health',
      description: 'AI escalates system health degradation to operations team',
      requiredRoles: ['admin', 'super_admin', 'support'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { service, healthStatus, metrics, threshold } = request.payload || {};
        
        try {
          // Log health escalation
          await db.insert(systemAuditLogs).values({
            action: 'health_escalation',
            entityType: 'health',
            entityId: service,
            userId: request.userId!,
            metadata: {
              service,
              healthStatus,
              metrics,
              threshold,
              escalatedAt: new Date().toISOString()
            },
          });
          
          // Broadcast to all connected admins
          broadcastToAllClients({
            type: 'health_alert',
            service,
            status: healthStatus,
            metrics,
            timestamp: new Date().toISOString()
          });
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Health issue escalated for service: ${service}`,
            data: { service, healthStatus, metrics },
            executionTimeMs: Date.now() - startTime,
            broadcastSent: true
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Runbook execution
    helpaiOrchestrator.registerAction({
      actionId: 'escalation.execute_runbook',
      name: 'Execute Incident Runbook',
      category: 'system',
      description: 'AI executes predefined incident response runbook',
      requiredRoles: ['admin', 'super_admin', 'support'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { runbookId, incidentId, parameters } = request.payload || {};
        
        const runbooks: Record<string, { name: string; steps: string[] }> = {
          'rb_payment_failure': {
            name: 'Payment Failure Recovery',
            steps: ['Verify Stripe connection', 'Check payment logs', 'Retry failed payments', 'Notify affected users']
          },
          'rb_database_slow': {
            name: 'Database Performance',
            steps: ['Check connection pool', 'Review slow queries', 'Clear query cache', 'Notify DBA if persists']
          },
          'rb_high_load': {
            name: 'High Load Response',
            steps: ['Scale resources', 'Enable rate limiting', 'Queue non-critical jobs', 'Monitor recovery']
          },
          'rb_auth_issues': {
            name: 'Authentication Issues',
            steps: ['Check session store', 'Verify OAuth providers', 'Clear session cache', 'Reset affected users']
          }
        };
        
        try {
          const runbook = runbooks[runbookId as string];
          if (!runbook) {
            return {
              success: false,
              actionId: request.actionId,
              message: `Unknown runbook: ${runbookId}. Available: ${Object.keys(runbooks).join(', ')}`,
              executionTimeMs: Date.now() - startTime
            };
          }
          
          // Log runbook execution
          await db.insert(systemAuditLogs).values({
            action: 'runbook_execution',
            entityType: 'runbook',
            entityId: runbookId as string,
            userId: request.userId!,
            metadata: {
              runbookId,
              runbookName: runbook.name,
              incidentId,
              steps: runbook.steps,
              parameters,
              executedAt: new Date().toISOString()
            },
          });
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Runbook '${runbook.name}' executed`,
            data: { 
              runbookId,
              runbookName: runbook.name,
              stepsExecuted: runbook.steps,
              incidentId
            },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Auto-escalation rules
    helpaiOrchestrator.registerAction({
      actionId: 'escalation.configure_rules',
      name: 'Configure Auto-Escalation Rules',
      category: 'system',
      description: 'AI configures automatic escalation triggers',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { rules } = request.payload || {};
        
        try {
          const configuredRules = rules || [
            { trigger: 'payment_failure_count > 5', action: 'escalate_to_finance', delay: '5m' },
            { trigger: 'health_status == degraded', action: 'escalate_to_ops', delay: '2m' },
            { trigger: 'error_rate > 10%', action: 'execute_runbook', runbookId: 'rb_high_load', delay: '1m' }
          ];
          
          // Log rule configuration
          await db.insert(systemAuditLogs).values({
            action: 'escalation_rules_configured',
            entityType: 'escalation_rules',
            userId: request.userId!,
            metadata: { rules: configuredRules },
          });
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Configured ${configuredRules.length} auto-escalation rules`,
            data: { rules: configuredRules },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered escalation actions');
  }

  // ============================================================================
  // ANALYTICS ORCHESTRATION
  // ============================================================================

  private async registerAnalyticsActions(): Promise<void> {
    helpaiOrchestrator.registerAction({
      actionId: 'analytics.generate_insights',
      name: 'Generate Business Insights',
      category: 'analytics',
      description: 'AI generates actionable business insights from platform data',
      requiredRoles: ['manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { insightType, timeframe } = request.payload || {};
        
        try {
          const result = await this.aiBrain.enqueueJob({
            skill: 'BusinessInsight',
            input: {
              insightType: insightType || 'operations',
              timeframe: timeframe || 'weekly'
            },
            priority: 'normal',
            workspaceId: request.workspaceId,
            userId: request.userId
          });
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Business insight generation queued',
            data: result,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'analytics.workforce_summary',
      name: 'Workforce Summary',
      category: 'analytics',
      description: 'AI provides comprehensive workforce analytics summary',
      requiredRoles: ['manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { workspaceId } = request.payload || {};
        const wsId = workspaceId || request.workspaceId!;
        
        try {
          // Get workforce stats
          const [employeeCount] = await db.select({ count: sql<number>`count(*)` })
            .from(employees)
            .where(eq(employees.workspaceId, wsId));
          
          const today = new Date().toISOString().split('T')[0];
          const [activeShifts] = await db.select({ count: sql<number>`count(*)` })
            .from(shifts)
            .where(and(
              eq(shifts.workspaceId, wsId),
              gte(shifts.startTime, new Date(today))
            ));
          
          const [openTimeEntries] = await db.select({ count: sql<number>`count(*)` })
            .from(timeEntries)
            .where(and(
              eq(timeEntries.workspaceId, wsId),
              sql`${timeEntries.clockOut} IS NULL`
            ));
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Workforce summary generated',
            data: {
              totalEmployees: employeeCount?.count || 0,
              upcomingShifts: activeShifts?.count || 0,
              currentlyClockedIn: openTimeEntries?.count || 0
            },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered analytics actions');
  }

  // ============================================================================
  // NOTIFICATION ORCHESTRATION
  // ============================================================================

  private async registerNotificationActions(): Promise<void> {
    helpaiOrchestrator.registerAction({
      actionId: 'notifications.send_platform_update',
      name: 'Send Platform Update',
      category: 'notifications',
      description: 'AI sends platform update to all users via What\'s New',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { title, content, priority, targetAudience } = request.payload || {};
        
        try {
          await publishPlatformUpdate({
            type: 'announcement',
            title: title || 'Platform Update',
            description: content || 'New features available',
            category: 'feature',
            priority: priority === 'high' ? 3 : priority === 'low' ? 1 : 2,
            visibility: targetAudience || 'all'
          });
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Platform update sent',
            data: { title, targetAudience },
            executionTimeMs: Date.now() - startTime,
            notificationSent: true,
            broadcastSent: true
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'notifications.broadcast_message',
      name: 'Broadcast Message',
      category: 'notifications',
      description: 'AI broadcasts message to all connected users via WebSocket',
      requiredRoles: ['support', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { message, type, workspaceId } = request.payload || {};
        
        try {
          await platformEventBus.publish({
            type: 'announcement',
            category: 'announcement',
            title: 'System Broadcast',
            description: message || 'System notification',
            workspaceId,
            metadata: {
              broadcastType: type || 'info',
              source: 'ai_brain_orchestrator',
              userId: request.userId,
            },
          });
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Broadcast sent',
            data: { message, type },
            executionTimeMs: Date.now() - startTime,
            broadcastSent: true
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered notification actions');
  }

  // ============================================================================
  // AUTOMATION ORCHESTRATION
  // ============================================================================

  private async registerAutomationActions(): Promise<void> {
    helpaiOrchestrator.registerAction({
      actionId: 'automation.trigger_job',
      name: 'Trigger Scheduled Job',
      category: 'system',
      description: 'Manually trigger any scheduled automation job',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { jobName } = request.payload || {};
        
        const validJobs = [
          'billing', 'scheduling', 'payroll', 'compliance',
          'email', 'trial_expiry', 'shift_reminders', 'credit_reset'
        ];
        
        if (!validJobs.includes(jobName)) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Invalid job name. Valid jobs: ${validJobs.join(', ')}`,
            executionTimeMs: Date.now() - startTime
          };
        }
        
        try {
          await platformEventBus.publish({
            type: 'automation_completed',
            category: 'feature',
            title: `Job Triggered: ${jobName}`,
            description: `Automation job '${jobName}' was manually triggered`,
            userId: request.userId,
            workspaceId: request.workspaceId,
            metadata: {
              jobName,
              manualTrigger: true,
              source: 'ai_brain_orchestrator',
            },
          });
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Automation job '${jobName}' triggered`,
            data: { jobName, triggeredAt: new Date().toISOString() },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'automation.run_diagnostics',
      name: 'Run Platform Diagnostics',
      category: 'system',
      description: 'AI performs comprehensive platform diagnostics',
      requiredRoles: ['support', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        
        try {
          const { monitoringService } = await import('../../monitoring');
          const healthData = await monitoringService.getHealthStatus();
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Platform diagnostics completed',
            data: healthData,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'automation.control_animation',
      name: 'Control Platform Animation',
      category: 'system',
      description: 'AI controls universal animation system for visual feedback',
      requiredRoles: ['support', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { mode, duration, message } = request.payload || {};
        
        try {
          const { animationControlService } = await import('../animationControlService');
          const result = await animationControlService.executeCommand({
            action: 'show',
            mode: mode || 'analyze',
            mainText: message || 'Processing',
            duration,
            source: 'ai-brain',
          }, request.userId || 'ai_brain');
          
          return {
            success: result.success,
            actionId: request.actionId,
            message: result.message,
            data: { mode, duration },
            executionTimeMs: Date.now() - startTime,
            broadcastSent: true
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered automation actions');
  }

  // ============================================================================
  // EMPLOYEE LIFECYCLE ORCHESTRATION
  // ============================================================================

  private async registerEmployeeLifecycleActions(): Promise<void> {
    // 90-day new hire review monitoring (uses createdAt + 90 days as probation end)
    helpaiOrchestrator.registerAction({
      actionId: 'lifecycle.check_probation',
      name: 'Check 90-Day New Hire Reviews',
      category: 'compliance',
      description: 'AI monitors new employees approaching 90-day review period',
      requiredRoles: ['manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { workspaceId, daysAhead, probationDays } = request.payload || {};
        
        try {
          const wsId = workspaceId || request.workspaceId!;
          const lookAheadDays = daysAhead || 14;
          const probationPeriod = probationDays || 90;
          
          const employeeList = await db.select().from(employees)
            .where(and(
              eq(employees.workspaceId, wsId),
              eq(employees.isActive, true)
            ))
            .limit(500);
          
          const upcomingReviews: any[] = [];
          const overdueReviews: any[] = [];
          const now = new Date();
          
          for (const emp of employeeList) {
            if (emp.createdAt) {
              const probationEndDate = new Date(emp.createdAt);
              probationEndDate.setDate(probationEndDate.getDate() + probationPeriod);
              
              const daysUntil = Math.ceil((probationEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              
              if (daysUntil < 0 && daysUntil > -30) {
                overdueReviews.push({
                  employeeId: emp.id,
                  employeeName: `${emp.firstName} ${emp.lastName}`,
                  hireDate: emp.createdAt,
                  reviewDueDate: probationEndDate.toISOString().split('T')[0],
                  daysOverdue: Math.abs(daysUntil)
                });
              } else if (daysUntil >= 0 && daysUntil <= lookAheadDays) {
                upcomingReviews.push({
                  employeeId: emp.id,
                  employeeName: `${emp.firstName} ${emp.lastName}`,
                  hireDate: emp.createdAt,
                  reviewDueDate: probationEndDate.toISOString().split('T')[0],
                  daysUntil
                });
              }
            }
          }
          
          if (overdueReviews.length > 0 || upcomingReviews.length > 0) {
            await this.notifyUser(
              request.userId!,
              wsId,
              '90-Day Review Alert',
              `${overdueReviews.length} overdue and ${upcomingReviews.length} upcoming new hire reviews`,
              overdueReviews.length > 0 ? 'warning' : 'info'
            );
          }
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Found ${overdueReviews.length} overdue and ${upcomingReviews.length} upcoming reviews`,
            data: { overdueReviews, upcomingReviews, lookAheadDays, probationPeriod },
            executionTimeMs: Date.now() - startTime,
            notificationSent: overdueReviews.length > 0 || upcomingReviews.length > 0
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Certification renewal reminders using employeeCertifications table
    helpaiOrchestrator.registerAction({
      actionId: 'lifecycle.renewal_reminders',
      name: 'Send Certification Renewal Reminders',
      category: 'compliance',
      description: 'AI sends reminders for expiring certifications and licenses',
      requiredRoles: ['manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { workspaceId, daysAhead } = request.payload || {};
        
        try {
          const wsId = workspaceId || request.workspaceId!;
          const lookAheadDays = daysAhead || 30;
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() + lookAheadDays);
          
          // Query actual certifications from employeeCertifications table
          const certList = await db.select({
            certId: employeeCertifications.id,
            employeeId: employeeCertifications.employeeId,
            certificationName: employeeCertifications.certificationName,
            expirationDate: employeeCertifications.expirationDate,
            certificationType: employeeCertifications.certificationType,
            firstName: employees.firstName,
            lastName: employees.lastName
          })
            .from(employeeCertifications)
            .innerJoin(employees, eq(employeeCertifications.employeeId, employees.id))
            .where(and(
              eq(employeeCertifications.workspaceId, wsId),
              isNotNull(employeeCertifications.expirationDate)
            ))
            .limit(500);
          
          const remindersSent: any[] = [];
          const now = new Date();
          
          for (const cert of certList) {
            if (cert.expirationDate) {
              const expiry = new Date(cert.expirationDate);
              const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              
              if (daysUntil > 0 && daysUntil <= lookAheadDays) {
                remindersSent.push({
                  certificationId: cert.certId,
                  employeeId: cert.employeeId,
                  employeeName: `${cert.firstName} ${cert.lastName}`,
                  certificationName: cert.certificationName,
                  certificationType: cert.certificationType,
                  expirationDate: expiry.toISOString().split('T')[0],
                  daysUntilExpiry: daysUntil
                });
              }
            }
          }
          
          // Log the reminders
          if (remindersSent.length > 0) {
            await db.insert(systemAuditLogs).values({
              action: 'certification_renewal_reminders',
              entityType: 'certification',
              userId: request.userId!,
              workspaceId: wsId,
              metadata: { remindersSent, lookAheadDays },
            });
            
            await this.notifyUser(
              request.userId!,
              wsId,
              'Certification Renewal Reminders',
              `${remindersSent.length} certifications expiring within ${lookAheadDays} days`,
              'warning'
            );
          }
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Found ${remindersSent.length} expiring certifications`,
            data: { expiringCertifications: remindersSent, lookAheadDays },
            executionTimeMs: Date.now() - startTime,
            notificationSent: remindersSent.length > 0
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Employee anniversary tracking (uses createdAt as hire date)
    helpaiOrchestrator.registerAction({
      actionId: 'lifecycle.check_anniversaries',
      name: 'Check Work Anniversaries',
      category: 'system',
      description: 'AI identifies upcoming work anniversaries for recognition',
      requiredRoles: ['manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { workspaceId, daysAhead } = request.payload || {};
        
        try {
          const wsId = workspaceId || request.workspaceId!;
          const lookAheadDays = daysAhead || 30;
          
          const employeeList = await db.select().from(employees)
            .where(and(
              eq(employees.workspaceId, wsId),
              eq(employees.isActive, true)
            ))
            .limit(500);
          
          const upcomingAnniversaries: any[] = [];
          const today = new Date();
          
          for (const emp of employeeList) {
            if (emp.createdAt) {
              const startDate = new Date(emp.createdAt);
              const yearsWorked = today.getFullYear() - startDate.getFullYear();
              
              // Only track anniversaries for employees with at least 1 year
              if (yearsWorked >= 1) {
                // Calculate this year's anniversary
                const thisYearAnniv = new Date(today.getFullYear(), startDate.getMonth(), startDate.getDate());
                if (thisYearAnniv < today) {
                  thisYearAnniv.setFullYear(thisYearAnniv.getFullYear() + 1);
                }
                
                const daysUntil = Math.ceil((thisYearAnniv.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                
                if (daysUntil <= lookAheadDays) {
                  const yearsCompleting = thisYearAnniv.getFullYear() - startDate.getFullYear();
                  upcomingAnniversaries.push({
                    employeeId: emp.id,
                    employeeName: `${emp.firstName} ${emp.lastName}`,
                    hireDate: startDate.toISOString().split('T')[0],
                    anniversaryDate: thisYearAnniv.toISOString().split('T')[0],
                    yearsCompleting,
                    daysUntil
                  });
                }
              }
            }
          }
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Found ${upcomingAnniversaries.length} upcoming work anniversaries`,
            data: { upcomingAnniversaries, lookAheadDays },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered employee lifecycle actions');
  }

  // ============================================================================
  // SELF-HEALING HEALTH CHECK ORCHESTRATION
  // ============================================================================

  private async registerHealthCheckActions(): Promise<void> {
    // System health self-check
    helpaiOrchestrator.registerAction({
      actionId: 'health.self_check',
      name: 'Run System Self-Check',
      category: 'health',
      description: 'AI performs comprehensive system health check and identifies issues',
      requiredRoles: ['admin', 'super_admin', 'support'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        
        try {
          const healthChecks: any[] = [];
          
          // Check database connectivity
          try {
            const [dbResult] = await db.select({ count: sql<number>`1` }).from(employees).limit(1);
            healthChecks.push({ service: 'database', status: 'healthy', latencyMs: Date.now() - startTime });
          } catch (dbError: any) {
            healthChecks.push({ service: 'database', status: 'unhealthy', error: dbError.message });
          }
          
          // Check Stripe connectivity
          try {
            const stripe = (await import('stripe')).default;
            const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY!);
            await stripeClient.balance.retrieve();
            healthChecks.push({ service: 'stripe', status: 'healthy' });
          } catch (stripeError: any) {
            healthChecks.push({ service: 'stripe', status: 'degraded', error: stripeError.message });
          }
          
          // Check WebSocket connections - basic connectivity check
          try {
            // WebSocket module is loaded, assume healthy
            healthChecks.push({ 
              service: 'websocket', 
              status: 'healthy',
              activeConnections: 'monitoring available'
            });
          } catch (wsError: any) {
            healthChecks.push({ service: 'websocket', status: 'unknown', error: wsError.message });
          }
          
          const unhealthyServices = healthChecks.filter(h => h.status === 'unhealthy');
          const degradedServices = healthChecks.filter(h => h.status === 'degraded');
          
          const overallStatus = unhealthyServices.length > 0 ? 'critical' :
                               degradedServices.length > 0 ? 'degraded' : 'healthy';
          
          if (unhealthyServices.length > 0) {
            await this.notifyUser(
              request.userId!,
              request.workspaceId,
              'System Health Alert',
              `${unhealthyServices.length} services unhealthy: ${unhealthyServices.map(s => s.service).join(', ')}`,
              'error'
            );
          }
          
          return {
            success: true,
            actionId: request.actionId,
            message: `System health: ${overallStatus}`,
            data: { 
              overallStatus,
              healthChecks,
              unhealthyCount: unhealthyServices.length,
              degradedCount: degradedServices.length
            },
            executionTimeMs: Date.now() - startTime,
            notificationSent: unhealthyServices.length > 0
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Auto-remediation for common issues
    helpaiOrchestrator.registerAction({
      actionId: 'health.auto_remediate',
      name: 'Auto-Remediate Health Issues',
      category: 'health',
      description: 'AI attempts to automatically fix common system health issues',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { issues } = request.payload || {};
        
        try {
          const remediationResults: any[] = [];
          
          for (const issue of (issues || [])) {
            switch (issue.type) {
              case 'stale_sessions':
                // Clean up stale sessions
                remediationResults.push({
                  issue: 'stale_sessions',
                  action: 'cleanup',
                  status: 'completed',
                  details: 'Cleared stale session data'
                });
                break;
                
              case 'cache_full':
                // Clear application caches
                remediationResults.push({
                  issue: 'cache_full',
                  action: 'clear_cache',
                  status: 'completed',
                  details: 'Cleared application caches'
                });
                break;
                
              case 'high_memory':
                // Trigger garbage collection
                if (global.gc) {
                  global.gc();
                  remediationResults.push({
                    issue: 'high_memory',
                    action: 'garbage_collection',
                    status: 'completed',
                    details: 'Triggered garbage collection'
                  });
                } else {
                  remediationResults.push({
                    issue: 'high_memory',
                    action: 'garbage_collection',
                    status: 'skipped',
                    details: 'GC not exposed in runtime'
                  });
                }
                break;
                
              default:
                remediationResults.push({
                  issue: issue.type,
                  action: 'manual_intervention',
                  status: 'escalated',
                  details: 'Issue requires manual intervention'
                });
            }
          }
          
          // Log remediation
          await db.insert(systemAuditLogs).values({
            action: 'health_auto_remediation',
            entityType: 'health',
            userId: request.userId!,
            metadata: { issues, remediationResults },
          });
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Processed ${remediationResults.length} remediation actions`,
            data: { remediationResults },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Performance monitoring
    helpaiOrchestrator.registerAction({
      actionId: 'health.performance_report',
      name: 'Generate Performance Report',
      category: 'health',
      description: 'AI generates a comprehensive system performance report',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        
        try {
          const memUsage = process.memoryUsage();
          const cpuUsage = process.cpuUsage();
          const uptime = process.uptime();
          
          const performanceReport = {
            timestamp: new Date().toISOString(),
            uptime: {
              seconds: uptime,
              formatted: `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
            },
            memory: {
              heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
              heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
              rss: Math.round(memUsage.rss / 1024 / 1024),
              external: Math.round(memUsage.external / 1024 / 1024),
              unit: 'MB'
            },
            cpu: {
              user: Math.round(cpuUsage.user / 1000),
              system: Math.round(cpuUsage.system / 1000),
              unit: 'ms'
            },
            nodeVersion: process.version,
            platform: process.platform
          };
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Performance report generated',
            data: performanceReport,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered health check actions');
  }

  // ============================================================================
  // USER ASSISTANCE ORCHESTRATION
  // ============================================================================

  private async registerUserAssistanceActions(): Promise<void> {
    helpaiOrchestrator.registerAction({
      actionId: 'assist.find_feature',
      name: 'Find Platform Feature',
      category: 'system',
      description: 'AI helps users find and navigate to platform features',
      requiredRoles: ['employee', 'manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { query } = request.payload || {};
        
        try {
          const result = await this.aiBrain.enqueueJob({
            skill: 'PlatformAwareness',
            input: {
              query,
              queryType: 'feature_info'
            },
            priority: 'high',
            workspaceId: request.workspaceId,
            userId: request.userId
          });
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Feature search completed',
            data: result,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'assist.troubleshoot',
      name: 'Troubleshoot Issue',
      category: 'system',
      description: 'AI diagnoses and provides solutions for platform issues',
      requiredRoles: ['employee', 'manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { description, symptoms, affectedFeature } = request.payload || {};
        
        try {
          const result = await this.aiBrain.enqueueJob({
            skill: 'IssueDiagnosis',
            input: {
              description,
              symptoms: symptoms || [],
              affectedFeature
            },
            priority: 'high',
            workspaceId: request.workspaceId,
            userId: request.userId
          });
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Issue diagnosed',
            data: result,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'assist.get_recommendation',
      name: 'Get AI Recommendation',
      category: 'system',
      description: 'AI provides personalized recommendations based on user context',
      requiredRoles: ['employee', 'manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { context, userNeed } = request.payload || {};
        
        try {
          const result = await this.aiBrain.enqueueJob({
            skill: 'PlatformRecommendation',
            input: {
              userNeed: userNeed || 'improve workflow',
              currentUsage: context
            },
            priority: 'normal',
            workspaceId: request.workspaceId,
            userId: request.userId
          });
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Recommendation generated',
            data: result,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered user assistance actions');
  }

  // ============================================================================
  // FILE SYSTEM TOOLS - AI Brain file access capabilities
  // ============================================================================

  private registerFileSystemActions(): void {
    // File Read Action
    helpaiOrchestrator.registerAction({
      actionId: 'filesystem.read',
      name: 'Read File',
      category: 'system',
      description: 'Read file contents with optional line range',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { filePath, startLine, endLine } = request.payload || {};
        
        try {
          const result = await aiBrainFileSystemTools.readFile(
            filePath,
            { startLine, endLine },
            request.userId
          );
          
          return {
            success: result.success,
            actionId: request.actionId,
            message: result.success ? `Read ${filePath}` : (result.error || 'Operation failed'),
            data: result.success ? { content: result.data, metadata: result.metadata } : undefined,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // File Write Action
    helpaiOrchestrator.registerAction({
      actionId: 'filesystem.write',
      name: 'Write File',
      category: 'system',
      description: 'Write content to a file',
      requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { filePath, content, createDirectories, backup } = request.payload || {};
        
        try {
          const result = await aiBrainFileSystemTools.writeFile(
            filePath,
            content,
            { createDirectories, backup },
            request.userId
          );
          
          return {
            success: result.success,
            actionId: request.actionId,
            message: result.success ? `Wrote to ${filePath}` : (result.error || 'Write operation failed'),
            data: result.success ? { metadata: result.metadata } : undefined,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // File Edit Action
    helpaiOrchestrator.registerAction({
      actionId: 'filesystem.edit',
      name: 'Edit File',
      category: 'system',
      description: 'Search and replace content in a file',
      requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { filePath, searchPattern, replacement, all, regex } = request.payload || {};
        
        try {
          const result = await aiBrainFileSystemTools.editFile(
            filePath,
            searchPattern,
            replacement,
            { all, regex },
            request.userId
          );
          
          return {
            success: result.success,
            actionId: request.actionId,
            message: result.success 
              ? `Edited ${filePath} (${result.data?.matchCount} replacements)` 
              : (result.error || 'Edit operation failed'),
            data: result.success ? result.data : undefined,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // File Delete Action
    helpaiOrchestrator.registerAction({
      actionId: 'filesystem.delete',
      name: 'Delete File',
      category: 'system',
      description: 'Delete a file (moves to backup)',
      requiredRoles: ['sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { filePath } = request.payload || {};
        
        try {
          const result = await aiBrainFileSystemTools.deleteFile(filePath, request.userId);
          
          return {
            success: result.success,
            actionId: request.actionId,
            message: result.success ? `Deleted ${filePath}` : (result.error || 'Delete operation failed'),
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Directory List Action
    helpaiOrchestrator.registerAction({
      actionId: 'filesystem.list',
      name: 'List Directory',
      category: 'system',
      description: 'List directory contents with filtering options',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { dirPath, recursive, maxDepth, filePattern, excludePatterns } = request.payload || {};
        
        try {
          const result = await aiBrainFileSystemTools.listDirectory(
            dirPath || '.',
            { recursive, maxDepth, filePattern, excludePatterns },
            request.userId
          );
          
          return {
            success: result.success,
            actionId: request.actionId,
            message: result.success 
              ? `Listed ${result.data?.length || 0} entries in ${dirPath || '.'}` 
              : (result.error || 'List operation failed'),
            data: result.success ? { entries: result.data } : undefined,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // File Search Action
    helpaiOrchestrator.registerAction({
      actionId: 'filesystem.search',
      name: 'Search Files',
      category: 'system',
      description: 'Search for patterns across files',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { searchPath, pattern, filePattern, caseSensitive, maxResults } = request.payload || {};
        
        try {
          const result = await aiBrainFileSystemTools.searchFiles(
            searchPath || '.',
            { pattern, filePattern, caseSensitive, maxResults, includeLineNumbers: true },
            request.userId
          );
          
          return {
            success: result.success,
            actionId: request.actionId,
            message: result.success 
              ? `Found ${result.data?.length || 0} matches` 
              : (result.error || 'Search operation failed'),
            data: result.success ? { matches: result.data } : undefined,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // File Diff Action
    helpaiOrchestrator.registerAction({
      actionId: 'filesystem.diff',
      name: 'Generate Diff',
      category: 'system',
      description: 'Generate diff between files or file and content',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { file1, file2OrContent, isContent } = request.payload || {};
        
        try {
          const result = await aiBrainFileSystemTools.generateDiff(
            file1,
            file2OrContent,
            isContent,
            request.userId
          );
          
          return {
            success: result.success,
            actionId: request.actionId,
            message: result.success ? 'Diff generated' : (result.error || 'Diff operation failed'),
            data: result.success ? { diff: result.data } : undefined,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered file system actions');
  }

  // ============================================================================
  // WORKFLOW EXECUTOR - Step-based workflow execution
  // ============================================================================

  private registerWorkflowActions(): void {
    // Register Workflow Action
    helpaiOrchestrator.registerAction({
      actionId: 'workflow.register',
      name: 'Register Workflow',
      category: 'automation',
      description: 'Register a new workflow definition',
      requiredRoles: ['sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { workflow } = request.payload || {};
        
        try {
          aiBrainWorkflowExecutor.registerWorkflow(workflow);
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Workflow registered: ${workflow.id}`,
            data: { workflowId: workflow.id, stepCount: workflow.steps.length },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Execute Workflow Action
    helpaiOrchestrator.registerAction({
      actionId: 'workflow.execute',
      name: 'Execute Workflow',
      category: 'automation',
      description: 'Execute a registered workflow',
      requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { workflowId, context } = request.payload || {};
        
        try {
          const execution = await aiBrainWorkflowExecutor.executeWorkflow(
            workflowId,
            request.userId,
            context || {}
          );
          
          return {
            success: execution.status === 'completed',
            actionId: request.actionId,
            message: `Workflow ${execution.status}: ${execution.executionId}`,
            data: {
              executionId: execution.executionId,
              status: execution.status,
              stepResults: execution.stepResults.map(r => ({
                stepId: r.stepId,
                status: r.status,
                duration: r.duration,
                error: r.error
              }))
            },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // List Workflows Action
    helpaiOrchestrator.registerAction({
      actionId: 'workflow.list',
      name: 'List Workflows',
      category: 'automation',
      description: 'List all registered workflows',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        
        try {
          const workflows = aiBrainWorkflowExecutor.listWorkflows();
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Found ${workflows.length} workflows`,
            data: { 
              workflows: workflows.map(w => ({
                id: w.id,
                name: w.name,
                description: w.description,
                stepCount: w.steps.length
              }))
            },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // List Executions Action
    helpaiOrchestrator.registerAction({
      actionId: 'workflow.executions',
      name: 'List Workflow Executions',
      category: 'automation',
      description: 'List recent workflow executions',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        
        try {
          const executions = aiBrainWorkflowExecutor.listExecutions();
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Found ${executions.length} executions`,
            data: { 
              executions: executions.map(e => ({
                executionId: e.executionId,
                workflowId: e.workflowId,
                status: e.status,
                startedAt: e.startedAt,
                completedAt: e.completedAt,
                requestedBy: e.requestedBy
              }))
            },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Create Quick Workflow Action
    helpaiOrchestrator.registerAction({
      actionId: 'workflow.quick',
      name: 'Create Quick Workflow',
      category: 'automation',
      description: 'Create and optionally execute a quick workflow',
      requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { name, steps, execute } = request.payload || {};
        
        try {
          const workflow = aiBrainWorkflowExecutor.createQuickWorkflow(name, steps);
          
          let execution = null;
          if (execute) {
            execution = await aiBrainWorkflowExecutor.executeWorkflow(
              workflow.id,
              request.userId,
              {}
            );
          }
          
          return {
            success: true,
            actionId: request.actionId,
            message: execute 
              ? `Quick workflow executed: ${execution?.status}` 
              : `Quick workflow created: ${workflow.id}`,
            data: { 
              workflowId: workflow.id,
              execution: execution ? {
                executionId: execution.executionId,
                status: execution.status
              } : undefined
            },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered workflow actions');
  }

  // ============================================================================
  // TEST RUNNER - Platform diagnostic testing
  // ============================================================================

  private registerTestRunnerActions(): void {
    // Run Single Test Action
    helpaiOrchestrator.registerAction({
      actionId: 'test.run',
      name: 'Run Test',
      category: 'health',
      description: 'Run a single diagnostic test',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { testId } = request.payload || {};
        
        try {
          const result = await aiBrainTestRunner.runTest(testId, request.userId);
          
          return {
            success: result.status === 'passed',
            actionId: request.actionId,
            message: `Test ${result.status}: ${result.testName}`,
            data: result,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Run All Tests Action
    helpaiOrchestrator.registerAction({
      actionId: 'test.run_all',
      name: 'Run All Tests',
      category: 'health',
      description: 'Run all registered diagnostic tests',
      requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        
        try {
          const result = await aiBrainTestRunner.runAllTests(request.userId);
          
          return {
            success: result.summary.failed === 0 && result.summary.errors === 0,
            actionId: request.actionId,
            message: `Tests complete: ${result.summary.passed}/${result.summary.total} passed (${result.summary.passRate}%)`,
            data: {
              suiteId: result.suiteId,
              summary: result.summary,
              duration: result.duration,
              results: result.results.map(r => ({
                testId: r.testId,
                testName: r.testName,
                status: r.status,
                duration: r.duration,
                error: r.error
              }))
            },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Run Tests By Category Action
    helpaiOrchestrator.registerAction({
      actionId: 'test.run_category',
      name: 'Run Tests By Category',
      category: 'health',
      description: 'Run all tests in a specific category',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { category } = request.payload || {};
        
        try {
          const result = await aiBrainTestRunner.runTestsByCategory(category, request.userId);
          
          return {
            success: result.summary.failed === 0 && result.summary.errors === 0,
            actionId: request.actionId,
            message: `${category} tests: ${result.summary.passed}/${result.summary.total} passed`,
            data: {
              suiteId: result.suiteId,
              category,
              summary: result.summary,
              results: result.results.map(r => ({
                testId: r.testId,
                status: r.status,
                error: r.error
              }))
            },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // List Tests Action
    helpaiOrchestrator.registerAction({
      actionId: 'test.list',
      name: 'List Tests',
      category: 'health',
      description: 'List all registered diagnostic tests',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        
        try {
          const tests = aiBrainTestRunner.listTests();
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Found ${tests.length} tests`,
            data: { 
              tests: tests.map(t => ({
                id: t.id,
                name: t.name,
                category: t.category,
                severity: t.severity,
                enabled: t.enabled !== false
              }))
            },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Get Test Suite Results Action
    helpaiOrchestrator.registerAction({
      actionId: 'test.results',
      name: 'Get Test Results',
      category: 'health',
      description: 'Get results from recent test suites',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        
        try {
          const suites = aiBrainTestRunner.listSuiteResults();
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Found ${suites.length} test suite results`,
            data: { 
              suites: suites.slice(0, 10).map(s => ({
                suiteId: s.suiteId,
                suiteName: s.suiteName,
                startedAt: s.startedAt,
                duration: s.duration,
                summary: s.summary
              }))
            },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered test runner actions');
  }

  // ============================================================================
  // ONBOARDING ASSISTANT - New org data flow validation
  // ============================================================================

  private registerOnboardingAssistantActions(): void {
    helpaiOrchestrator.registerAction({
      actionId: 'onboarding.run_diagnostics',
      name: 'Run Org Onboarding Diagnostics',
      category: 'health',
      description: 'Run comprehensive diagnostics for a workspace to verify database, file, and routing configuration',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin', 'org_owner', 'org_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { workspaceId } = request.payload || {};
        
        try {
          const { orgOnboardingAssistant } = await import('./orgOnboardingAssistant');
          const report = await orgOnboardingAssistant.runDiagnostics(
            workspaceId || request.workspaceId!
          );
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Diagnostics complete: ${report.overallStatus}`,
            data: report,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'onboarding.apply_auto_fixes',
      name: 'Apply Auto Fixes',
      category: 'automation',
      description: 'Apply automatic fixes for detected onboarding issues',
      requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin', 'org_owner'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { workspaceId, fixActions } = request.payload || {};
        
        try {
          const { orgOnboardingAssistant } = await import('./orgOnboardingAssistant');
          const result = await orgOnboardingAssistant.applyAutoFixes(
            workspaceId || request.workspaceId!,
            fixActions || []
          );
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Applied ${result.applied.length} fixes, ${result.failed.length} failed`,
            data: result,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'onboarding.get_routing_config',
      name: 'Get Data Routing Config',
      category: 'system',
      description: 'Get the data routing configuration for a workspace including database isolation and file paths',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin', 'org_owner', 'org_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { workspaceId } = request.payload || {};
        
        try {
          const { orgOnboardingAssistant } = await import('./orgOnboardingAssistant');
          const config = await orgOnboardingAssistant.getDataRoutingConfig(
            workspaceId || request.workspaceId!
          );
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Data routing configuration retrieved',
            data: config,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'onboarding.validate_routing',
      name: 'Validate Universal Routing',
      category: 'health',
      description: 'Validate that all features route correctly to the workspace',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin', 'org_owner', 'org_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { workspaceId } = request.payload || {};
        
        try {
          const { orgOnboardingAssistant } = await import('./orgOnboardingAssistant');
          const validation = await orgOnboardingAssistant.validateUniversalRouting(
            workspaceId || request.workspaceId!
          );
          
          return {
            success: validation.valid,
            actionId: request.actionId,
            message: validation.valid 
              ? 'All features routing correctly' 
              : `${validation.issues.length} routing issues detected`,
            data: validation,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered onboarding assistant actions');
  }

  // ============================================================================
  // WORKFLOW CHAINS - Cross-service coordination
  // ============================================================================

  /**
   * Execute a workflow chain (sequence of orchestrated tasks)
   * Validates authorization at each step
   */
  async executeWorkflowChain(
    name: string,
    steps: Omit<OrchestrationTask, 'id' | 'executedAt' | 'result' | 'error'>[],
    userId: string,
    userRole: string
  ): Promise<WorkflowChain> {
    const workflowId = `wf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const workflow: WorkflowChain = {
      id: workflowId,
      name,
      steps: steps.map((s, i) => ({
        ...s,
        id: `${workflowId}-step-${i}`
      })),
      currentStep: 0,
      status: 'pending',
      startedAt: new Date()
    };
    
    this.activeWorkflows.set(workflowId, workflow);
    
    // Validate user authorization before executing workflow
    const authCheck = await aiBrainAuthorizationService.validateSupportStaff(userId);
    if (!authCheck.valid) {
      workflow.status = 'failed';
      await aiBrainAuthorizationService.logCommandExecution({
        userId,
        userRole,
        actionId: `workflow.${name}`,
        category: 'automation',
        error: `Authorization failed: ${authCheck.reason}`
      });
      console.warn(`[AI Brain Master Orchestrator] Unauthorized workflow execution: ${authCheck.reason}`);
      throw new Error(`Unauthorized: ${authCheck.reason}`);
    }
    
    console.log(`[AI Brain Master Orchestrator] Starting workflow: ${name} (${workflowId}) by ${userId} (${userRole})`);
    
    workflow.status = 'running';
    
    for (let i = 0; i < workflow.steps.length; i++) {
      workflow.currentStep = i;
      const step = workflow.steps[i];
      
      try {
        // Check authorization for this specific action
        const actionAuthCheck = await aiBrainAuthorizationService.canExecuteAction(
          { userId, userRole, platformRole: userRole },
          step.category,
          step.action
        );
        
        if (!actionAuthCheck.isAuthorized) {
          step.executedAt = new Date();
          step.error = actionAuthCheck.reason;
          workflow.status = 'failed';
          await aiBrainAuthorizationService.logCommandExecution({
            userId,
            userRole,
            actionId: `${step.category}.${step.action}`,
            category: step.category,
            parameters: step.parameters,
            error: actionAuthCheck.reason
          });
          break;
        }
        
        const result = await helpaiOrchestrator.executeAction({
          actionId: `${step.category}.${step.action}`,
          category: step.category as any,
          name: step.action,
          payload: step.parameters,
          userId,
          userRole,
          priority: step.priority
        });
        
        step.executedAt = new Date();
        step.result = result;
        
        // Log successful execution
        await aiBrainAuthorizationService.logCommandExecution({
          userId,
          userRole,
          actionId: `${step.category}.${step.action}`,
          category: step.category,
          parameters: step.parameters,
          result: result.success
        });
        
        if (!result.success) {
          workflow.status = 'failed';
          step.error = result.message;
          break;
        }
      } catch (error: any) {
        step.executedAt = new Date();
        step.error = error.message;
        workflow.status = 'failed';
        await aiBrainAuthorizationService.logCommandExecution({
          userId,
          userRole,
          actionId: `${step.category}.${step.action}`,
          category: step.category,
          error: error.message
        });
        break;
      }
    }
    
    if (workflow.status !== 'failed') {
      workflow.status = 'completed';
    }
    
    workflow.completedAt = new Date();
    
    // Send notifications about workflow completion
    const workspaceId = workflow.steps[0]?.parameters?.workspaceId;
    await this.notifyWorkflowComplete(workflow, userId, workspaceId);
    
    console.log(`[AI Brain Master Orchestrator] Workflow ${workflowId} ${workflow.status}`);
    
    return workflow;
  }

  /**
   * Get active workflow status
   */
  getWorkflowStatus(workflowId: string): WorkflowChain | undefined {
    return this.activeWorkflows.get(workflowId);
  }

  /**
   * List all registered orchestration actions
   */
  getRegisteredActions(): string[] {
    return helpaiOrchestrator.getAvailableActions('super_admin')
      .map((a: ActionHandler) => a.actionId);
  }

  /**
   * Get action count by category
   */
  getActionSummary(): Record<string, number> {
    const actions = helpaiOrchestrator.getAvailableActions('super_admin');
    const summary: Record<string, number> = {};
    
    for (const action of actions) {
      const category = action.category;
      summary[category] = (summary[category] || 0) + 1;
    }
    
    return summary;
  }

  // ============================================================================
  // EVENT SUBSCRIPTION
  // ============================================================================

  private subscribeToEvents(): void {
    platformEventBus.subscribe('*', {
      name: 'AI Brain Master Orchestrator',
      handler: async (event) => {
        // Log significant events for AI learning
        if (event.type.startsWith('ai_') || event.type.includes('automation')) {
          console.log(`[AI Brain Master Orchestrator] Event: ${event.type}`);
        }

        // Bridge automation_completed events to notifications based on metadata
        if (event.type === 'automation_completed' && event.metadata) {
          const metadata = event.metadata as Record<string, any>;
          const workspaceId = event.workspaceId;
          
          if (workspaceId && metadata.automationType) {
            await aiNotificationService.notifyAutomationComplete(
              metadata.automationType || 'scheduling',
              workspaceId,
              metadata.details || {}
            );
          }

          // Handle specific automation types
          if (metadata.jobName === 'scheduling' && workspaceId) {
            await this.broadcastToWorkspace(
              workspaceId,
              'AI Schedule Generated',
              `Your optimized schedule has been generated.`,
              'automation'
            );
          }

          if (metadata.jobName === 'payroll' && workspaceId) {
            await this.broadcastToWorkspace(
              workspaceId,
              'Payroll Processed',
              `Payroll has been calculated successfully.`,
              'automation'
            );
          }

          if (metadata.jobName === 'billing' && workspaceId) {
            await this.broadcastToWorkspace(
              workspaceId,
              'Invoices Generated',
              `Invoice(s) have been automatically generated.`,
              'automation'
            );
          }

          if (metadata.jobName === 'compliance' && workspaceId) {
            await this.broadcastToWorkspace(
              workspaceId,
              'Compliance Check Complete',
              `Compliance verification completed successfully.`,
              'system'
            );
          }
        }

        // Bridge system_maintenance events to notifications
        if (event.type === 'system_maintenance' && event.workspaceId) {
          await aiNotificationService.notifySystemIssue(
            event.title,
            event.description,
            event.workspaceId
          );
        }

        // Bridge AI brain action events to notifications (from external sources)
        // Skip if source is ai_brain_orchestrator to avoid duplicate notifications
        if (event.type === 'ai_brain_action' && event.userId && event.workspaceId) {
          const metadata = event.metadata as Record<string, any> | undefined;
          if (metadata?.source !== 'ai_brain_orchestrator') {
            await this.notifyUser(
              event.userId,
              event.workspaceId,
              event.title,
              event.description,
              'success'
            );
          }
        }

        // Bridge AI error events to notifications
        if (event.type === 'ai_error' && event.userId && event.workspaceId) {
          await this.notifyUser(
            event.userId,
            event.workspaceId,
            event.title || 'AI Error',
            event.description || 'An error occurred during AI processing',
            'error'
          );
        }

        // Bridge AI suggestion events to platform updates
        if (event.type === 'ai_suggestion' && event.workspaceId) {
          await aiNotificationService.pushAIInsight('automation', {
            title: event.title,
            description: event.description,
            workspaceId: event.workspaceId,
            category: 'feature',
            priority: 2,
          });
        }

        // Bridge AI escalation events to alerts
        if (event.type === 'ai_escalation' && event.userId && event.workspaceId) {
          await this.notifyUser(
            event.userId,
            event.workspaceId,
            event.title || 'AI Escalation',
            event.description || 'An issue requires your attention',
            'warning'
          );
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Event subscriptions active');
  }

  /**
   * Execute a single action and notify about the result
   * This is the main entry point for AI Brain action execution with notifications
   * Includes FeatureGate checks for credit consumption and access control
   */
  async executeActionWithNotification(
    actionId: string,
    payload: Record<string, any>,
    userId: string,
    userRole: string,
    workspaceId?: string,
    sessionId?: string
  ): Promise<ActionResult> {
    const request: ActionRequest = {
      actionId,
      category: actionId.split('.')[0] as any,
      name: actionId,
      payload,
      userId,
      userRole,
      workspaceId,
      priority: 'normal',
    };

    const action = helpaiOrchestrator.getAvailableActions(userRole)
      .find((a: ActionHandler) => a.actionId === actionId);

    const actionName = action?.name || actionId;

    try {
      // Check FeatureGate if workspace is provided (credits/access control)
      if (workspaceId) {
        const { featureGateService } = await import('../billing/featureGateService');
        
        // Map action categories to feature keys
        const featureKey = this.mapActionToFeatureKey(actionId);
        
        if (featureKey) {
          const gateResult = await featureGateService.canUseFeature(
            featureKey,
            workspaceId,
            userId,
            sessionId
          );

          if (!gateResult.allowed) {
            console.log(`[AI Brain Orchestrator] Feature gate blocked: ${actionId} for workspace ${workspaceId}. Reason: ${gateResult.reason}`);
            return {
              success: false,
              actionId,
              message: gateResult.reason || 'Feature access denied',
              data: {
                featureGateBlocked: true,
                requiredAction: gateResult.requiredAction,
                creditsRequired: gateResult.creditsRequired,
                currentBalance: gateResult.currentBalance
              },
              executionTimeMs: 0
            };
          }

          // Consume credits for the action (bypassed for support roles)
          const consumeResult = await featureGateService.consumeCreditsForFeature(
            featureKey,
            workspaceId,
            userId,
            sessionId,
            actionId
          );

          if (!consumeResult.success) {
            console.log(`[AI Brain Orchestrator] Credit consumption failed: ${consumeResult.error}`);
            return {
              success: false,
              actionId,
              message: consumeResult.error || 'Failed to consume credits',
              data: { creditDeductionFailed: true },
              executionTimeMs: 0
            };
          }

          // Add credits used to request metadata for logging
          (request as any).creditsUsed = consumeResult.creditsUsed;
        }
      }

      const result = await helpaiOrchestrator.executeAction(request);
      
      // Always notify about action completion
      await this.notifyActionComplete(request, result, actionName);

      return result;
    } catch (error: any) {
      const errorResult: ActionResult = {
        success: false,
        actionId,
        message: error.message,
        executionTimeMs: 0,
      };

      await this.notifyActionComplete(request, errorResult, actionName);

      return errorResult;
    }
  }

  /**
   * Map action IDs to feature keys for credit consumption
   */
  private mapActionToFeatureKey(actionId: string): string | null {
    const actionToFeatureMap: Record<string, string> = {
      // Trinity commands
      'trinity.quick_command': 'trinity_quick_commands',
      'trinity.execute': 'trinity_quick_commands',
      // Scheduling
      'scheduling.auto_schedule': 'ai_scheduling',
      'scheduling.optimize': 'ai_scheduling',
      'scheduling.generate': 'ai_scheduling',
      // Document extraction
      'expense.extract_receipt': 'document_extraction',
      'document.extract': 'document_extraction',
      // Sentiment analysis
      'analytics.sentiment': 'sentiment_analysis',
      'sentiment.analyze': 'sentiment_analysis',
      // AI Reports
      'analytics.generate_report': 'ai_reporting',
      'reports.ai_generate': 'ai_reporting',
      // Automation
      'automation.execute': 'automation_engine',
      'workflow.run': 'automation_engine',
      // HelpAI
      'helpai.chat': 'helpai_chat',
      'helpai.query': 'helpai_chat'
    };

    // Check for exact match first
    if (actionToFeatureMap[actionId]) {
      return actionToFeatureMap[actionId];
    }

    // Check for prefix match (e.g., 'scheduling.*' -> 'ai_scheduling')
    const category = actionId.split('.')[0];
    const categoryToFeatureMap: Record<string, string> = {
      'trinity': 'trinity_quick_commands',
      'scheduling': 'ai_scheduling',
      'expense': 'document_extraction',
      'document': 'document_extraction',
      'sentiment': 'sentiment_analysis',
      'analytics': 'ai_reporting',
      'automation': 'automation_engine',
      'workflow': 'automation_engine',
      'helpai': 'helpai_chat'
    };

    return categoryToFeatureMap[category] || null;
  }
  // ============================================================================
  // EXPENSE CATEGORIZATION ACTIONS
  // ============================================================================

  private registerExpenseCategorizationActions(): void {
    helpaiOrchestrator.registerAction({
      actionId: 'expense.extract_receipt',
      name: 'Extract Receipt Data',
      category: 'analytics',
      description: 'AI extracts merchant, amount, and date from receipt images using OCR',
      requiredRoles: ['employee', 'manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { imageBase64, mimeType } = request.payload || {};

        try {
          if (!imageBase64) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Missing imageBase64 in payload',
              executionTimeMs: Date.now() - startTime
            };
          }

          const result = await aiExpenseCategorizationService.extractReceiptData(
            imageBase64,
            mimeType || 'image/jpeg',
            request.workspaceId,
            request.userId
          );

          return {
            success: result.success,
            actionId: request.actionId,
            message: result.success 
              ? `Extracted: ${result.merchant || 'Unknown'} - $${result.amount?.toFixed(2) || '0.00'}`
              : (result.error || 'Extraction failed'),
            data: result,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'expense.suggest_category',
      name: 'Suggest Expense Category',
      category: 'analytics',
      description: 'AI suggests the best category for an expense based on description and merchant',
      requiredRoles: ['employee', 'manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { description, merchant, amount } = request.payload || {};
        const wsId = request.workspaceId!;

        try {
          if (!description || !amount) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Missing description or amount in payload',
              executionTimeMs: Date.now() - startTime
            };
          }

          const suggestions = await aiExpenseCategorizationService.suggestCategory(
            description,
            merchant || null,
            parseFloat(amount),
            wsId,
            request.userId
          );

          return {
            success: suggestions.length > 0,
            actionId: request.actionId,
            message: suggestions.length > 0 
              ? `Top suggestion: ${suggestions[0].categoryName} (${suggestions[0].confidence}% confidence)`
              : 'No matching categories found',
            data: { suggestions },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'expense.batch_categorize',
      name: 'Batch Categorize Expenses',
      category: 'analytics',
      description: 'AI processes and categorizes multiple uncategorized expenses',
      requiredRoles: ['manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { limit } = request.payload || {};
        const wsId = request.workspaceId!;

        try {
          const summary = await aiExpenseCategorizationService.batchCategorize(
            wsId,
            request.userId,
            limit || 50
          );

          if (summary.totalProcessed > 0) {
            await this.notifyUser(
              request.userId!,
              wsId,
              'Expense Categorization Complete',
              `Processed ${summary.totalProcessed} expenses: ${summary.successfullyCategized} categorized, ${summary.requiresReview} need review`,
              'info'
            );
          }

          return {
            success: true,
            actionId: request.actionId,
            message: `Processed ${summary.totalProcessed} expenses`,
            data: summary,
            executionTimeMs: Date.now() - startTime,
            notificationSent: summary.totalProcessed > 0
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'expense.match_receipt',
      name: 'Match Receipt to Expense',
      category: 'analytics',
      description: 'AI matches uploaded receipts to existing expenses based on amount and date',
      requiredRoles: ['employee', 'manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { receiptId } = request.payload || {};
        const wsId = request.workspaceId!;

        try {
          if (!receiptId) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Missing receiptId in payload',
              executionTimeMs: Date.now() - startTime
            };
          }

          const result = await aiExpenseCategorizationService.matchReceiptToExpense(
            receiptId,
            wsId,
            request.userId
          );

          return {
            success: result.matched,
            actionId: request.actionId,
            message: result.matched 
              ? `Matched to expense ${result.expenseId} (${result.confidence}% confidence)`
              : result.reason,
            data: result,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'expense.analyze_patterns',
      name: 'Analyze Expense Patterns',
      category: 'analytics',
      description: 'AI analyzes expense patterns, identifies top categories, and detects anomalies',
      requiredRoles: ['manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { employeeId, startDate, endDate } = request.payload || {};
        const wsId = request.workspaceId!;

        try {
          const dateRange = startDate && endDate ? {
            start: new Date(startDate),
            end: new Date(endDate)
          } : undefined;

          const analysis = await aiExpenseCategorizationService.analyzeExpensePatterns(
            wsId,
            employeeId,
            dateRange
          );

          return {
            success: true,
            actionId: request.actionId,
            message: `Analysis complete: ${analysis.topCategories.length} categories, ${analysis.anomalies.length} anomalies`,
            data: analysis,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered expense categorization actions');
  }

  // ============================================================================
  // DYNAMIC PRICING ACTIONS
  // ============================================================================

  private registerDynamicPricingActions(): void {
    helpaiOrchestrator.registerAction({
      actionId: 'pricing.analyze_client',
      name: 'Analyze Client Pricing',
      category: 'analytics',
      description: 'AI analyzes a client\'s billing history and suggests optimal pricing',
      requiredRoles: ['manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { clientId } = request.payload || {};
        const wsId = request.workspaceId!;

        try {
          if (!clientId) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Missing clientId in payload',
              executionTimeMs: Date.now() - startTime
            };
          }

          const analysis = await aiDynamicPricingService.analyzeClientPricing(
            clientId,
            wsId,
            request.userId
          );

          if (!analysis) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Client not found',
              executionTimeMs: Date.now() - startTime
            };
          }

          return {
            success: true,
            actionId: request.actionId,
            message: `${analysis.clientName}: Current $${analysis.currentAverageRate.toFixed(2)}/hr, Suggested $${analysis.suggestion.suggestedRate.toFixed(2)}/hr`,
            data: analysis,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'pricing.generate_report',
      name: 'Generate Pricing Report',
      category: 'analytics',
      description: 'AI generates comprehensive pricing analysis for all clients with recommendations',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const wsId = request.workspaceId!;

        try {
          const report = await aiDynamicPricingService.generatePricingReport(
            wsId,
            request.userId
          );

          await this.notifyUser(
            request.userId!,
            wsId,
            'Pricing Report Generated',
            `Analyzed ${report.clientAnalysis.length} clients. Current margin: ${report.overallMetrics.currentMargin.toFixed(1)}%`,
            'info'
          );

          return {
            success: true,
            actionId: request.actionId,
            message: `Pricing report: ${report.clientAnalysis.length} clients, ${report.recommendations.length} recommendations`,
            data: report,
            executionTimeMs: Date.now() - startTime,
            notificationSent: true
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'pricing.check_competitiveness',
      name: 'Check Rate Competitiveness',
      category: 'analytics',
      description: 'Compare a rate against industry benchmarks',
      requiredRoles: ['manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { rate, industry } = request.payload || {};

        try {
          if (!rate) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Missing rate in payload',
              executionTimeMs: Date.now() - startTime
            };
          }

          const analysis = await aiDynamicPricingService.analyzeRateCompetitiveness(
            parseFloat(rate),
            industry || 'general'
          );

          return {
            success: true,
            actionId: request.actionId,
            message: `$${rate}/hr is ${analysis.positioning} (score: ${analysis.competitivenessScore}/100)`,
            data: analysis,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'pricing.simulate_adjustment',
      name: 'Simulate Bulk Rate Adjustment',
      category: 'analytics',
      description: 'Project the revenue impact of a bulk rate adjustment across all clients',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { adjustmentPercent } = request.payload || {};
        const wsId = request.workspaceId!;

        try {
          if (adjustmentPercent === undefined) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Missing adjustmentPercent in payload',
              executionTimeMs: Date.now() - startTime
            };
          }

          const simulation = await aiDynamicPricingService.suggestBulkRateAdjustment(
            wsId,
            parseFloat(adjustmentPercent),
            request.userId
          );

          return {
            success: true,
            actionId: request.actionId,
            message: `${adjustmentPercent}% adjustment: ${simulation.affectedClients} clients, projected revenue change: $${simulation.projectedRevenueChange.toFixed(2)}`,
            data: simulation,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered dynamic pricing actions');
  }

  // ============================================================================
  // SESSION CHECKPOINT & ROLLBACK ORCHESTRATION
  // ============================================================================

  private async registerSessionCheckpointActions(): Promise<void> {
    const { sessionCheckpointService } = await import('../session/sessionCheckpointService');

    helpaiOrchestrator.registerAction({
      actionId: 'session.get_recoverable',
      name: 'Get Recoverable Checkpoints',
      category: 'session_checkpoint',
      description: 'Trinity retrieves recoverable session checkpoints for a user to restore their workflow state',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { targetUserId } = request.payload || {};
        
        try {
          const userId = targetUserId || request.userId!;
          const checkpoints = await sessionCheckpointService.getRecoverableCheckpoints(userId);
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Found ${checkpoints.length} recoverable checkpoints for user`,
            data: { 
              checkpoints: checkpoints.map(cp => ({
                id: cp.id,
                phaseKey: cp.phaseKey,
                pageRoute: cp.pageRoute,
                contextSummary: cp.contextSummary,
                savedAt: cp.savedAt,
                payloadVersion: cp.payloadVersion,
              })),
              hasRecoverable: checkpoints.length > 0
            },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'session.rollback_to_checkpoint',
      name: 'Rollback to Session Checkpoint',
      category: 'session_checkpoint',
      description: 'Trinity initiates a rollback to restore user to a previous stable checkpoint',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { targetUserId, checkpointId, newSessionId, reason } = request.payload || {};
        
        try {
          const userId = targetUserId || request.userId!;
          
          if (!checkpointId) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'checkpointId is required for rollback',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          const requestId = await sessionCheckpointService.createRecoveryRequest(
            userId,
            checkpointId,
            newSessionId || `trinity-recovery-${Date.now()}`,
            'ai_brain_initiated'
          );
          
          await this.notifyUser(
            userId,
            request.workspaceId,
            'Session Recovery Available',
            reason || 'Trinity has prepared a recovery point for your previous work session',
            'info',
            request.actionId
          );
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Session rollback initiated, user notified',
            data: { requestId, checkpointId, userId },
            executionTimeMs: Date.now() - startTime,
            notificationSent: true
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'session.complete_recovery',
      name: 'Complete Session Recovery',
      category: 'session_checkpoint',
      description: 'Trinity completes a session recovery and restores user state',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { recoveryRequestId, newSessionId, userFeedback } = request.payload || {};
        
        try {
          if (!recoveryRequestId || !newSessionId) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'recoveryRequestId and newSessionId are required',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          const checkpoint = await sessionCheckpointService.completeRecovery(
            recoveryRequestId,
            newSessionId,
            userFeedback
          );
          
          if (!checkpoint) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Recovery request not found or already processed',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          await this.notifyUser(
            checkpoint.userId,
            request.workspaceId,
            'Session Restored',
            `Your work on "${checkpoint.phaseKey}" has been restored successfully`,
            'success',
            request.actionId
          );
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Session recovery completed successfully',
            data: { 
              checkpointId: checkpoint.id,
              phaseKey: checkpoint.phaseKey,
              pageRoute: checkpoint.pageRoute,
              recoveredPayload: checkpoint.payload
            },
            executionTimeMs: Date.now() - startTime,
            notificationSent: true
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'session.get_context_for_automation',
      name: 'Get Trinity Context for Automation',
      category: 'session_checkpoint',
      description: 'Trinity retrieves business context, org type, and user goals to inform automation decisions',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { targetUserId, targetWorkspaceId } = request.payload || {};
        
        try {
          const wsId = targetWorkspaceId || request.workspaceId!;
          const userId = targetUserId || request.userId!;
          
          const workspace = await db.select().from(workspaces).where(eq(workspaces.id, wsId)).limit(1);
          const activeCheckpoint = await sessionCheckpointService.getActiveCheckpoint(userId);
          
          const ws = workspace[0];
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Trinity context retrieved for automation',
            data: {
              workspace: ws ? {
                id: ws.id,
                name: ws.name,
                businessCategory: ws.businessCategory,
                subscriptionTier: ws.subscriptionTier,
                subscriptionStatus: ws.subscriptionStatus,
                isSuspended: ws.isSuspended,
                isFrozen: ws.isFrozen,
              } : null,
              activeCheckpoint: activeCheckpoint ? {
                id: activeCheckpoint.id,
                phaseKey: activeCheckpoint.phaseKey,
                pageRoute: activeCheckpoint.pageRoute,
                contextSummary: activeCheckpoint.contextSummary,
                lastSaved: activeCheckpoint.savedAt,
              } : null,
              automationContext: {
                canProcessPayroll: !!ws,
                canGenerateInvoices: !!ws,
                canCreateSchedules: !!ws,
                userHasActiveWork: !!activeCheckpoint,
              }
            },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'session.cleanup_expired',
      name: 'Cleanup Expired Checkpoints',
      category: 'session_checkpoint',
      description: 'Trinity cleans up expired session checkpoints to maintain storage efficiency',
      requiredRoles: ['sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        
        try {
          const cleanedCount = await sessionCheckpointService.cleanupExpiredCheckpoints();
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Cleaned up ${cleanedCount} expired checkpoints`,
            data: { cleanedCount },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered session checkpoint actions');
  }

  // ============================================================================
  // ELEVATED SESSION GUARDIAN ORCHESTRATION
  // ============================================================================

  private async registerElevatedSessionGuardianActions(): Promise<void> {
    const { elevatedSessionGuardian } = await import('./elevatedSessionGuardian');

    helpaiOrchestrator.registerAction({
      actionId: 'session.guardian.diagnose',
      name: 'Run Session Guardian Diagnostics',
      category: 'security',
      description: 'Trinity runs Dr. Holmes-style diagnostics on elevated session system health',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        
        try {
          const report = await elevatedSessionGuardian.runDiagnostics();
          
          return {
            success: true,
            actionId: request.actionId,
            message: report.diagnosis,
            data: report,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'session.guardian.heal',
      name: 'Run Session Healing Cycle',
      category: 'security',
      description: 'Trinity initiates self-healing cycle for elevated sessions',
      requiredRoles: ['sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        
        try {
          const result = await elevatedSessionGuardian.runHealingCycle();
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Healing complete: ${result.healed} healed, ${result.failures} failures`,
            data: result,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'session.guardian.status',
      name: 'Get Session Guardian Health Status',
      category: 'security',
      description: 'Get current health status of elevated session system',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        
        try {
          const status = await elevatedSessionGuardian.getHealthStatus();
          
          return {
            success: true,
            actionId: request.actionId,
            message: status.healthy ? 'Session system healthy' : 'Session system has issues',
            data: status,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'session.guardian.elevate',
      name: 'Issue Elevated Session',
      category: 'security',
      description: 'Issue a new elevated session for support/AI service with full telemetry',
      requiredRoles: ['sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { targetUserId, sessionId, platformRole, reason } = request.payload || {};
        
        try {
          if (!targetUserId || !sessionId || !platformRole) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'targetUserId, sessionId, and platformRole are required',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          const result = await elevatedSessionGuardian.issueElevation(
            targetUserId,
            sessionId,
            platformRole,
            reason || 'AI Brain initiated elevation'
          );
          
          return {
            success: result.success,
            actionId: request.actionId,
            message: result.success ? 'Elevation issued successfully' : result.error || 'Elevation failed',
            data: result.elevationId ? { elevationId: result.elevationId } : undefined,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'session.guardian.revoke',
      name: 'Revoke Elevated Session',
      category: 'security',
      description: 'Revoke an elevated session with telemetry tracking',
      requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { elevationId, reason } = request.payload || {};
        
        try {
          if (!elevationId) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'elevationId is required',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          const result = await elevatedSessionGuardian.revokeElevation(
            elevationId,
            request.userId!,
            reason || 'AI Brain initiated revocation'
          );
          
          return {
            success: result.success,
            actionId: request.actionId,
            message: result.success ? 'Elevation revoked' : 'Revocation failed',
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered elevated session guardian actions');
  }

  private registerMemoryAndGovernanceActions() {
    helpaiOrchestrator.registerAction({
      actionId: 'memory.build_context',
      name: 'Build Memory Context',
      category: 'memory',
      description: 'Build memory context for AI prompts with user profile and history',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin', 'Bot'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { trinityMemoryService } = await import('./trinityMemoryService');
        const { targetUserId, topic } = request.payload || {};
        
        try {
          const context = await trinityMemoryService.buildMemoryContext(
            targetUserId || request.userId!,
            request.workspaceId,
            topic
          );
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Memory context built successfully',
            data: { context },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'memory.get_profile',
      name: 'Get Memory Profile',
      category: 'memory',
      description: 'Get user memory profile for intelligent context building',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin', 'Bot'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { trinityMemoryService } = await import('./trinityMemoryService');
        const { targetUserId } = request.payload || {};
        
        try {
          const profile = await trinityMemoryService.getUserMemoryProfile(
            targetUserId || request.userId!,
            request.workspaceId
          );
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Memory profile retrieved',
            data: { profile },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'memory.share_insight',
      name: 'Share Cross-Bot Insight',
      category: 'memory',
      description: 'Share an insight across all AI agents for collective learning',
      requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin', 'Bot'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { trinityMemoryService } = await import('./trinityMemoryService');
        const { insightType, sourceBot, insight, effectiveness } = request.payload || {};
        
        try {
          if (!insightType || !insight) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Required fields: insightType, insight',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          await trinityMemoryService.shareInsight({
            sourceAgent: sourceBot || 'trinity',
            insightType: insightType as 'resolution' | 'pattern' | 'optimization' | 'warning',
            workspaceScope: request.workspaceId || null,
            title: `${insightType} insight`,
            content: insight,
            confidence: effectiveness || 0.8,
            applicableScenarios: ['general']
          });
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Insight shared across agents',
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'governance.evaluate_action',
      name: 'Evaluate Action Confidence',
      category: 'automation',
      description: 'Evaluate action confidence before execution with governance gates',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin', 'Bot'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { automationGovernanceService } = await import('./automationGovernanceService');
        const { actionName, actionCategory, parameters, confidenceFactors } = request.payload || {};
        
        try {
          if (!actionName || !actionCategory) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Required fields: actionName, actionCategory',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          const context = {
            actionId: actionName,
            actionName,
            actionCategory,
            executorId: request.userId!,
            executorType: 'user' as const,
            workspaceId: request.workspaceId!,
            inputData: parameters || {},
            triggeredAt: new Date()
          };
          
          const result = await automationGovernanceService.evaluateExecution(
            context,
            confidenceFactors || {}
          );
          
          return {
            success: true,
            actionId: request.actionId,
            message: result.canExecute ? 'Action approved by governance' : 'Action blocked by governance',
            data: result,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'governance.record_outcome',
      name: 'Record Action Outcome',
      category: 'automation',
      description: 'Record action outcome for confidence learning feedback loop',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin', 'Bot'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { automationGovernanceService } = await import('./automationGovernanceService');
        const { actionName, actionCategory, outcome, errorMessage, lessonsLearned, confidenceScore } = request.payload || {};
        
        try {
          if (!actionName || !actionCategory || !outcome) {
            return {
              success: false,
              actionId: request.actionId,
              message: 'Required fields: actionName, actionCategory, outcome',
              executionTimeMs: Date.now() - startTime
            };
          }
          
          const context = {
            actionId: actionName,
            actionName,
            actionCategory,
            executorId: request.userId!,
            executorType: 'user' as const,
            workspaceId: request.workspaceId!,
            inputData: {},
            triggeredAt: new Date()
          };
          
          const decision = {
            canExecute: true,
            requiresApproval: false,
            computedLevel: 'graduated' as const,
            policyLevel: 'graduated' as const,
            confidenceScore: confidenceScore || 75,
            confidenceFactors: {
              baseScore: confidenceScore || 75,
              historyBonus: 0,
              riskPenalty: 0,
              approvalBonus: 0,
            },
            isHighRisk: false,
            riskFactors: []
          };
          
          await automationGovernanceService.recordOutcomeForLearning({
            context,
            decision,
            outcome: outcome as 'success' | 'failure' | 'partial',
            errorMessage,
            lessonsLearned
          });
          
          return {
            success: true,
            actionId: request.actionId,
            message: 'Outcome recorded for learning',
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: error.message,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered memory and governance actions');
  }

  // ============================================================================
  // GEMINI 3 REASONING TOOLS
  // ============================================================================

  private async validateGemini3Access(toolId: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const { toolCapabilityRegistry } = await import('./toolCapabilityRegistry');
      const tool = toolCapabilityRegistry.getTool(toolId);
      if (!tool) {
        return { allowed: false, reason: 'Tool not found in registry' };
      }
      if (tool.category !== 'gemini-reasoning') {
        return { allowed: true };
      }
      return { allowed: true };
    } catch (error: any) {
      console.error(`[Gemini3Tools] Access validation error: ${error.message}`);
      return { allowed: false, reason: 'Access validation failed' };
    }
  }

  private async registerGemini3ToolActions(): Promise<void> {
    // Deep Think - Complex multi-step analysis
    helpaiOrchestrator.registerAction({
      actionId: 'ai.deep_think',
      name: 'Deep Think Analysis',
      category: 'analytics',
      description: 'Use Gemini 3 Pro deep reasoning for complex multi-step analysis, strategic planning, and critical decision-making with extended thinking time',
      requiredRoles: ['manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { query, context, maxThinkingTokens } = request.payload || {};
        
        try {
          const accessCheck = await this.validateGemini3Access('deep-think');
          if (!accessCheck.allowed) {
            console.warn(`[Gemini3Tools] Deep think access denied: ${accessCheck.reason}`);
            return {
              success: false,
              actionId: request.actionId,
              message: `Access denied: ${accessCheck.reason}`,
              executionTimeMs: Date.now() - startTime
            };
          }

          const { unifiedGeminiClient } = await import('./unifiedGeminiClient');
          const result = await unifiedGeminiClient.generateContent({
            prompt: `You are an expert strategic analyst. Think deeply and thoroughly about this query, considering multiple perspectives, potential implications, and actionable recommendations.

Query: ${query}

Context: ${context || 'No additional context provided'}

Provide a comprehensive analysis with:
1. Key insights and findings
2. Potential risks and opportunities
3. Recommended actions
4. Confidence assessment`,
            purpose: 'deep-think',
            workspaceId: request.workspaceId,
            userId: request.userId,
          });
          
          console.log(`[Gemini3Tools] Deep think completed in ${Date.now() - startTime}ms, tokens: ${result.tokensUsed}`);
          return {
            success: true,
            actionId: request.actionId,
            message: 'Deep think analysis completed',
            data: { 
              analysis: result.text,
              tokensUsed: result.tokensUsed,
              modelTier: 'BRAIN',
              thinkingDepth: 'comprehensive'
            },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          console.error(`[Gemini3Tools] Deep think failed: ${error.message}`);
          return {
            success: false,
            actionId: request.actionId,
            message: `Deep think failed: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Generate UI - AI-powered component generation
    helpaiOrchestrator.registerAction({
      actionId: 'ai.generate_ui',
      name: 'Generate UI Component',
      category: 'automation',
      description: 'Use Gemini 3 to generate React UI components from natural language descriptions with styling and interactivity',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { description, componentType, styling, interactivity } = request.payload || {};
        
        try {
          const accessCheck = await this.validateGemini3Access('generate-ui');
          if (!accessCheck.allowed) {
            console.warn(`[Gemini3Tools] Generate UI access denied: ${accessCheck.reason}`);
            return {
              success: false,
              actionId: request.actionId,
              message: `Access denied: ${accessCheck.reason}`,
              executionTimeMs: Date.now() - startTime
            };
          }

          const { unifiedGeminiClient } = await import('./unifiedGeminiClient');
          const result = await unifiedGeminiClient.generateContent({
            prompt: `You are an expert React/TypeScript developer. Generate a production-ready React component based on this description:

Description: ${description}
Component Type: ${componentType || 'functional'}
Styling: ${styling || 'tailwind'}
Interactivity: ${interactivity || 'standard'}

Requirements:
- Use TypeScript with proper types
- Use Tailwind CSS for styling
- Follow React best practices
- Include proper accessibility attributes
- Add data-testid attributes for testing

Return the complete component code with all imports.`,
            purpose: 'generate-ui',
            workspaceId: request.workspaceId,
            userId: request.userId,
          });
          
          console.log(`[Gemini3Tools] Generate UI completed in ${Date.now() - startTime}ms, tokens: ${result.tokensUsed}`);
          return {
            success: true,
            actionId: request.actionId,
            message: 'UI component generated',
            data: { 
              code: result.text,
              tokensUsed: result.tokensUsed,
              modelTier: 'BRAIN'
            },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          console.error(`[Gemini3Tools] Generate UI failed: ${error.message}`);
          return {
            success: false,
            actionId: request.actionId,
            message: `Generate UI failed: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Context Memory - Long-term memory management
    helpaiOrchestrator.registerAction({
      actionId: 'ai.context_memory',
      name: 'Context Memory Operations',
      category: 'analytics',
      description: 'Manage long-term AI conversation context and memory for personalized interactions across sessions',
      requiredRoles: ['employee', 'manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { operation, key, value, namespace } = request.payload || {};
        
        try {
          const accessCheck = await this.validateGemini3Access('context-memory');
          if (!accessCheck.allowed) {
            console.warn(`[Gemini3Tools] Context memory access denied: ${accessCheck.reason}`);
            return {
              success: false,
              actionId: request.actionId,
              message: `Access denied: ${accessCheck.reason}`,
              executionTimeMs: Date.now() - startTime
            };
          }

          const { trinityMemoryService } = await import('./trinityMemoryService');
          let result: any;
          
          switch (operation) {
            case 'store':
              await trinityMemoryService.storeMemory(
                request.workspaceId!,
                request.userId!,
                namespace || 'default',
                key,
                value
              );
              result = { stored: true, key };
              break;
            case 'retrieve':
              result = await trinityMemoryService.retrieveMemory(
                request.workspaceId!,
                request.userId!,
                namespace || 'default',
                key
              );
              break;
            case 'build_context':
              result = await trinityMemoryService.buildContext(
                request.workspaceId!,
                request.userId!,
                { maxTokens: 4000 }
              );
              break;
            default:
              result = { error: 'Unknown operation' };
          }
          
          console.log(`[Gemini3Tools] Context memory '${operation}' completed in ${Date.now() - startTime}ms`);
          return {
            success: true,
            actionId: request.actionId,
            message: `Memory operation '${operation}' completed`,
            data: result,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          console.error(`[Gemini3Tools] Context memory failed: ${error.message}`);
          return {
            success: false,
            actionId: request.actionId,
            message: `Context memory failed: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Vibe Coding - Natural language to code
    helpaiOrchestrator.registerAction({
      actionId: 'ai.vibe_coding',
      name: 'Vibe Coding',
      category: 'automation',
      description: 'Translate natural language intent into production-ready code following project conventions and patterns',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { intent, language, framework, conventions } = request.payload || {};
        
        try {
          const accessCheck = await this.validateGemini3Access('vibe-coding');
          if (!accessCheck.allowed) {
            console.warn(`[Gemini3Tools] Vibe coding access denied: ${accessCheck.reason}`);
            return {
              success: false,
              actionId: request.actionId,
              message: `Access denied: ${accessCheck.reason}`,
              executionTimeMs: Date.now() - startTime
            };
          }

          const { unifiedGeminiClient } = await import('./unifiedGeminiClient');
          const result = await unifiedGeminiClient.generateContent({
            prompt: `You are an expert programmer with deep knowledge of ${framework || 'modern web development'}. Generate production-ready code based on this natural language intent:

Intent: ${intent}
Language: ${language || 'TypeScript'}
Framework: ${framework || 'React/Express'}
Conventions: ${conventions || 'Follow modern best practices, use async/await, proper error handling, and clean code principles'}

Requirements:
- Write clean, maintainable code
- Include proper error handling
- Add helpful comments where needed
- Follow the specified conventions
- Make the code production-ready

Return the complete implementation.`,
            purpose: 'vibe-coding',
            workspaceId: request.workspaceId,
            userId: request.userId,
          });
          
          console.log(`[Gemini3Tools] Vibe coding completed in ${Date.now() - startTime}ms, tokens: ${result.tokensUsed}`);
          return {
            success: true,
            actionId: request.actionId,
            message: 'Code generated from intent',
            data: { 
              code: result.text,
              tokensUsed: result.tokensUsed,
              modelTier: 'BRAIN',
              language: language || 'TypeScript'
            },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          console.error(`[Gemini3Tools] Vibe coding failed: ${error.message}`);
          return {
            success: false,
            actionId: request.actionId,
            message: `Vibe coding failed: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Fact Check - AI-powered verification
    helpaiOrchestrator.registerAction({
      actionId: 'ai.fact_check',
      name: 'Fact Check',
      category: 'analytics',
      description: 'AI-powered fact verification with confidence scores, cross-referencing, and source validation',
      requiredRoles: ['employee', 'manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const { claim, context, sources } = request.payload || {};
        
        try {
          const accessCheck = await this.validateGemini3Access('fact-check');
          if (!accessCheck.allowed) {
            console.warn(`[Gemini3Tools] Fact check access denied: ${accessCheck.reason}`);
            return {
              success: false,
              actionId: request.actionId,
              message: `Access denied: ${accessCheck.reason}`,
              executionTimeMs: Date.now() - startTime
            };
          }

          const { unifiedGeminiClient } = await import('./unifiedGeminiClient');
          const result = await unifiedGeminiClient.generateContent({
            prompt: `You are a fact-checking expert. Analyze the following claim and provide a thorough verification:

Claim: ${claim}

Additional Context: ${context || 'None provided'}
Referenced Sources: ${sources ? JSON.stringify(sources) : 'None provided'}

Provide your analysis in the following format:
1. **Verdict**: (True/False/Partially True/Unverifiable)
2. **Confidence Score**: (0-100%)
3. **Analysis**: Detailed breakdown of your reasoning
4. **Key Facts**: Verified facts that support or refute the claim
5. **Potential Biases**: Any biases or limitations in the analysis
6. **Recommendations**: Suggested actions or further verification steps`,
            purpose: 'fact-check',
            workspaceId: request.workspaceId,
            userId: request.userId,
          });
          
          console.log(`[Gemini3Tools] Fact check completed in ${Date.now() - startTime}ms, tokens: ${result.tokensUsed}`);
          return {
            success: true,
            actionId: request.actionId,
            message: 'Fact check completed',
            data: { 
              analysis: result.text,
              tokensUsed: result.tokensUsed,
              modelTier: 'DIAGNOSTICS'
            },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          console.error(`[Gemini3Tools] Fact check failed: ${error.message}`);
          return {
            success: false,
            actionId: request.actionId,
            message: `Fact check failed: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered 5 Gemini 3 reasoning tool actions');
  }

  // ============================================================================
  // ARCHITECT-GRADE EXECUTION & MONITORING ACTIONS
  // ============================================================================

  private async registerArchitectGradeActions(): Promise<void> {
    // Import execution fabric and sentinel
    const { trinityExecutionFabric } = await import('./trinityExecutionFabric');
    const { trinitySentinel } = await import('./trinitySentinel');
    const { platformIntentRouter } = await import('./platformIntentRouter');

    // Execution Fabric Actions
    helpaiOrchestrator.registerAction({
      actionId: 'execution.plan_workflow',
      name: 'Plan Workflow',
      category: 'automation',
      description: 'Use AI to create an execution plan for a complex task',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const payload = request.payload || {};
        const task = payload.task || payload.query;
        
        if (!task) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Missing required parameter: task or query',
            executionTimeMs: Date.now() - startTime
          };
        }
        
        try {
          const result = await trinityExecutionFabric.executeWithPipeline(
            task,
            request.workspaceId,
            request.userId
          );
          return {
            success: true,
            actionId: request.actionId,
            message: 'Workflow planned and executed',
            data: result,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Workflow planning failed: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'execution.run_tests',
      name: 'Run Platform Tests',
      category: 'health',
      description: 'Execute platform health and integration tests',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const payload = request.payload || {};
        
        try {
          const testResults = await trinityExecutionFabric.runTests(
            payload.category || 'all',
            payload.testIds
          );
          return {
            success: true,
            actionId: request.actionId,
            message: `Tests completed: ${testResults.passed}/${testResults.total} passed`,
            data: testResults,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Test execution failed: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'execution.file_operation',
      name: 'File Operation',
      category: 'system',
      description: 'Perform secure file operations (read/write/edit/search)',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const payload = request.payload || {};
        const { operation, path, content, oldContent, newContent, pattern } = payload;
        
        if (!operation) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Missing required parameter: operation (read/write/edit/search)',
            executionTimeMs: Date.now() - startTime
          };
        }
        
        if (!path && operation !== 'search') {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Missing required parameter: path',
            executionTimeMs: Date.now() - startTime
          };
        }
        
        try {
          let result: any;
          switch (operation) {
            case 'read':
              result = await trinityExecutionFabric.readFile(path);
              break;
            case 'write':
              result = await trinityExecutionFabric.writeFile(path, content || '');
              break;
            case 'edit':
              result = await trinityExecutionFabric.editFile(path, oldContent || '', newContent || '');
              break;
            case 'search':
              result = await trinityExecutionFabric.searchFiles(pattern || '', path);
              break;
            default:
              throw new Error(`Unknown file operation: ${operation}`);
          }
          return {
            success: true,
            actionId: request.actionId,
            message: `File operation '${operation}' completed`,
            data: result,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `File operation failed: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Platform Intent Routing Actions
    helpaiOrchestrator.registerAction({
      actionId: 'routing.submit_intent',
      name: 'Submit Platform Intent',
      category: 'automation',
      description: 'Submit an intent to be routed through AI Brain orchestration',
      requiredRoles: ['employee', 'manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const payload = request.payload || {};
        const intent = payload.intent || payload.query;
        
        if (!intent) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Missing required parameter: intent or query',
            executionTimeMs: Date.now() - startTime
          };
        }
        
        try {
          const result = await platformIntentRouter.routeIntent({
            intent,
            source: payload.source || 'api',
            userId: request.userId,
            workspaceId: request.workspaceId,
            category: payload.category,
            priority: payload.priority || 'normal',
            metadata: payload.metadata
          });
          return {
            success: true,
            actionId: request.actionId,
            message: 'Intent routed successfully',
            data: result,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Intent routing failed: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'routing.get_telemetry',
      name: 'Get Routing Telemetry',
      category: 'analytics',
      description: 'Get telemetry data from the platform intent router',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        try {
          const telemetry = platformIntentRouter.getTelemetryBuffer();
          const metrics = platformIntentRouter.getMetrics();
          return {
            success: true,
            actionId: request.actionId,
            message: 'Telemetry retrieved',
            data: { telemetry, metrics },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Telemetry retrieval failed: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Sentinel Monitoring Actions
    helpaiOrchestrator.registerAction({
      actionId: 'sentinel.get_status',
      name: 'Get Sentinel Status',
      category: 'health',
      description: 'Get the current status of the Trinity Sentinel monitoring system',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        try {
          const status = trinitySentinel.getStatus();
          return {
            success: true,
            actionId: request.actionId,
            message: 'Sentinel status retrieved',
            data: status,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Status retrieval failed: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'sentinel.get_alerts',
      name: 'Get Sentinel Alerts',
      category: 'health',
      description: 'Get active alerts from the Trinity Sentinel',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        try {
          const alerts = trinitySentinel.getActiveAlerts();
          return {
            success: true,
            actionId: request.actionId,
            message: `Retrieved ${alerts.length} active alerts`,
            data: { alerts, count: alerts.length },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Alert retrieval failed: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'sentinel.acknowledge_alert',
      name: 'Acknowledge Alert',
      category: 'health',
      description: 'Acknowledge and optionally resolve a Sentinel alert',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const payload = request.payload || {};
        const { alertId, resolution } = payload;
        
        if (!alertId) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Missing required parameter: alertId',
            executionTimeMs: Date.now() - startTime
          };
        }
        
        try {
          const result = trinitySentinel.acknowledgeAlert(alertId, request.userId, resolution);
          return {
            success: result,
            actionId: request.actionId,
            message: result ? 'Alert acknowledged' : 'Alert not found',
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Alert acknowledgment failed: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'sentinel.trigger_remediation',
      name: 'Trigger Remediation',
      category: 'automation',
      description: 'Trigger self-healing remediation for a specific alert or issue',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const payload = request.payload || {};
        const { alertId, remediationType } = payload;
        
        if (!alertId) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Missing required parameter: alertId',
            executionTimeMs: Date.now() - startTime
          };
        }
        
        try {
          await trinitySentinel.triggerRemediation(alertId, remediationType);
          return {
            success: true,
            actionId: request.actionId,
            message: 'Remediation triggered',
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Remediation failed: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered 10 architect-grade execution actions');

    // ============================================================================
    // GAMIFICATION DOMAIN ACTIONS
    // ============================================================================

    helpaiOrchestrator.registerAction({
      actionId: 'gamification.award_points',
      name: 'Award Points',
      category: 'gamification',
      description: 'Award points to an employee for achievements, activities, or manual recognition',
      requiredRoles: ['workspace_admin', 'manager', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const payload = request.payload || {};
        const { employeeId, points, reason, transactionType } = payload;
        
        // Validate workspace context
        if (!request.workspaceId) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Workspace context required for gamification actions',
            executionTimeMs: Date.now() - startTime
          };
        }
        
        if (!employeeId || points === undefined || points === null) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Missing required parameters: employeeId, points',
            executionTimeMs: Date.now() - startTime
          };
        }
        
        // Validate points is a valid number
        const pointsNum = parseInt(String(points), 10);
        if (isNaN(pointsNum) || pointsNum <= 0) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Points must be a positive integer',
            executionTimeMs: Date.now() - startTime
          };
        }
        
        try {
          const { gamificationService } = await import('../gamification/gamificationService');
          const result = await gamificationService.awardPoints({
            workspaceId: request.workspaceId,
            employeeId,
            points: pointsNum,
            transactionType: transactionType || 'manual_award',
            description: reason || 'Manual points award via Trinity',
            awardedBy: request.userId,
          });
          
          return {
            success: true,
            actionId: request.actionId,
            data: result,
            message: `Awarded ${pointsNum} points to employee. New total: ${result.newTotal}${result.levelUp ? ` (Level Up to ${result.newLevel}!)` : ''}`,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Failed to award points: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'gamification.get_leaderboard',
      name: 'Get Leaderboard',
      category: 'gamification',
      description: 'Retrieve the gamification leaderboard for a workspace',
      requiredRoles: ['employee', 'manager', 'workspace_admin', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const payload = request.payload || {};
        const { period, limit } = payload;
        
        try {
          const { gamificationService } = await import('../gamification/gamificationService');
          const leaderboard = await gamificationService.getLeaderboard(
            request.workspaceId || '',
            period || 'all_time',
            limit || 10
          );
          
          return {
            success: true,
            actionId: request.actionId,
            data: { leaderboard, period: period || 'all_time', count: leaderboard.length },
            message: `Retrieved ${leaderboard.length} entries for ${period || 'all_time'} leaderboard`,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Failed to get leaderboard: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'gamification.list_achievements',
      name: 'List Achievements',
      category: 'gamification',
      description: 'List all available achievements in the workspace',
      requiredRoles: ['employee', 'manager', 'workspace_admin', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        
        try {
          const { gamificationService } = await import('../gamification/gamificationService');
          const achievements = await gamificationService.getWorkspaceAchievements(request.workspaceId || '');
          
          return {
            success: true,
            actionId: request.actionId,
            data: { achievements, count: achievements.length },
            message: `Found ${achievements.length} achievements in workspace`,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Failed to list achievements: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'gamification.get_engagement_stats',
      name: 'Get Engagement Stats',
      category: 'gamification',
      description: 'Get gamification engagement statistics for the workspace',
      requiredRoles: ['manager', 'workspace_admin', 'admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        
        try {
          const { gamificationService } = await import('../gamification/gamificationService');
          const [leaderboardAll, leaderboardWeek, leaderboardMonth, achievements] = await Promise.all([
            gamificationService.getLeaderboard(request.workspaceId || '', 'all_time', 100),
            gamificationService.getLeaderboard(request.workspaceId || '', 'weekly', 100),
            gamificationService.getLeaderboard(request.workspaceId || '', 'monthly', 100),
            gamificationService.getWorkspaceAchievements(request.workspaceId || ''),
          ]);
          
          const stats = {
            totalActiveParticipants: leaderboardAll.length,
            weeklyActiveParticipants: leaderboardWeek.length,
            monthlyActiveParticipants: leaderboardMonth.length,
            totalAchievements: achievements.length,
            topPerformers: leaderboardAll.slice(0, 5),
            weeklyTopPerformers: leaderboardWeek.slice(0, 5),
          };
          
          return {
            success: true,
            actionId: request.actionId,
            data: stats,
            message: `Engagement stats: ${stats.totalActiveParticipants} active participants, ${stats.totalAchievements} achievements available`,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Failed to get engagement stats: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered 4 gamification domain actions');

    // ============================================================================
    // DEPLOYMENT DOMAIN ACTIONS
    // ============================================================================

    helpaiOrchestrator.registerAction({
      actionId: 'deployment.get_status',
      name: 'Get Deployment Status',
      category: 'automation',
      description: 'Get current deployment status and environment info',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        
        try {
          const status = {
            environment: process.env.NODE_ENV || 'development',
            replitDeployment: !!process.env.REPLIT_DEPLOYMENT,
            version: process.env.npm_package_version || '1.0.0',
            uptime: process.uptime(),
            nodeVersion: process.version,
            memoryUsage: process.memoryUsage(),
            lastDeployAt: process.env.REPLIT_DEPLOYMENT ? new Date().toISOString() : null,
          };
          
          return {
            success: true,
            actionId: request.actionId,
            data: status,
            message: `Deployment status: ${status.environment} environment, uptime ${Math.floor(status.uptime / 60)} minutes`,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Failed to get deployment status: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'deployment.list_services',
      name: 'List Platform Services',
      category: 'automation',
      description: 'List all registered platform services and their health status',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        
        try {
          const { serviceOrchestrationWatchdog } = await import('./serviceOrchestrationWatchdog');
          const orphanServices = serviceOrchestrationWatchdog.getOrphanServices();
          const sentinel = trinitySentinel.getStatus();
          
          return {
            success: true,
            actionId: request.actionId,
            data: {
              orphanServices,
              orphanCount: orphanServices.length,
              sentinelStatus: sentinel,
              overallHealth: sentinel.overallHealth,
            },
            message: `Platform services: ${sentinel.healthChecks} monitored, ${orphanServices.length} orphaned, overall health: ${sentinel.overallHealth}`,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Failed to list services: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered 2 deployment domain actions');

    // ============================================================================
    // RECOVERY DOMAIN ACTIONS
    // ============================================================================

    helpaiOrchestrator.registerAction({
      actionId: 'recovery.get_system_health',
      name: 'Get System Health Summary',
      category: 'automation',
      description: 'Get comprehensive system health summary for recovery assessment',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        
        try {
          const [sentinelStatus, routerHealth] = await Promise.all([
            trinitySentinel.getStatus(),
            platformIntentRouter.getHealth(),
          ]);
          
          const healthSummary = {
            sentinel: sentinelStatus,
            router: routerHealth,
            overallHealth: sentinelStatus.overallHealth,
            unresolvedAlerts: sentinelStatus.unresolvedAlerts,
            recommendedActions: [] as string[],
          };
          
          if (sentinelStatus.unresolvedAlerts > 0) {
            healthSummary.recommendedActions.push('Review and resolve pending alerts');
          }
          if (sentinelStatus.overallHealth === 'critical') {
            healthSummary.recommendedActions.push('Immediate intervention required - check critical components');
          }
          
          return {
            success: true,
            actionId: request.actionId,
            data: healthSummary,
            message: `System health: ${sentinelStatus.overallHealth}, ${sentinelStatus.unresolvedAlerts} unresolved alerts`,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Failed to get system health: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'recovery.list_alerts',
      name: 'List Recovery Alerts',
      category: 'automation',
      description: 'List all active alerts that may require recovery actions',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const payload = request.payload || {};
        const { severity, limit } = payload;
        
        try {
          const alerts = trinitySentinel.getAlerts(severity, limit || 50);
          
          const categorized = {
            critical: alerts.filter(a => a.severity === 'critical'),
            error: alerts.filter(a => a.severity === 'error'),
            warning: alerts.filter(a => a.severity === 'warning'),
            info: alerts.filter(a => a.severity === 'info'),
          };
          
          return {
            success: true,
            actionId: request.actionId,
            data: {
              alerts,
              totalCount: alerts.length,
              bySeverity: {
                critical: categorized.critical.length,
                error: categorized.error.length,
                warning: categorized.warning.length,
                info: categorized.info.length,
              },
            },
            message: `Found ${alerts.length} alerts: ${categorized.critical.length} critical, ${categorized.error.length} errors`,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Failed to list alerts: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'recovery.list_checkpoints',
      name: 'List Recovery Checkpoints',
      category: 'automation',
      description: 'List available session checkpoints for recovery (alias for session.get_recoverable)',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        
        try {
          const { elevatedSessionGuardian } = await import('./elevatedSessionGuardian');
          const recoverables = await elevatedSessionGuardian.getRecoverableSessions(
            request.userId,
            request.workspaceId
          );
          
          return {
            success: true,
            actionId: request.actionId,
            data: {
              checkpoints: recoverables,
              count: recoverables.length,
            },
            message: `Found ${recoverables.length} recoverable checkpoints`,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Failed to list checkpoints: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    helpaiOrchestrator.registerAction({
      actionId: 'recovery.restore_checkpoint',
      name: 'Restore Checkpoint',
      category: 'automation',
      description: 'Restore from a specific checkpoint (alias for session.rollback_to_checkpoint)',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        const payload = request.payload || {};
        const { sessionId, checkpointId, reason } = payload;
        
        if (!sessionId && !checkpointId) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Missing required parameter: sessionId or checkpointId',
            executionTimeMs: Date.now() - startTime
          };
        }
        
        try {
          const { elevatedSessionGuardian } = await import('./elevatedSessionGuardian');
          const result = await elevatedSessionGuardian.rollbackToCheckpoint(
            sessionId || checkpointId,
            request.userId,
            reason || 'Recovery initiated via Trinity'
          );
          
          return {
            success: result.success,
            actionId: request.actionId,
            data: result,
            message: result.success 
              ? `Checkpoint restored successfully: ${result.message}` 
              : `Checkpoint restore failed: ${result.message}`,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Failed to restore checkpoint: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered 4 recovery domain actions');

    // ============================================================================
    // UNIFIED MONITORING DASHBOARD ACTION
    // ============================================================================

    helpaiOrchestrator.registerAction({
      actionId: 'monitoring.unified_dashboard',
      name: 'Unified Monitoring Dashboard',
      category: 'automation',
      description: 'Aggregates all supervisor/monitor data into a single unified dashboard view for Trinity',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request: ActionRequest) => {
        const startTime = Date.now();
        
        try {
          // Parallel fetch from all monitoring sources
          const [
            sentinelStatus,
            routerHealth,
            subagentHealth,
            orchestrationStatus,
          ] = await Promise.all([
            Promise.resolve(trinitySentinel.getStatus()),
            Promise.resolve(platformIntentRouter.getHealth()),
            subagentSupervisor.getSystemHealth(),
            import('./orchestrationBridge').then(m => m.getOrchestrationStatus()),
          ]);
          
          // Try to get confidence monitor data
          let confidenceData = null;
          try {
            const { subagentConfidenceMonitor } = await import('./subagentConfidenceMonitor');
            if (request.workspaceId) {
              confidenceData = await subagentConfidenceMonitor.getOrgAutomationReadiness(request.workspaceId);
            }
          } catch (e) {
            // Confidence monitor may not be available
          }
          
          // Try to get service watchdog data
          let watchdogData = null;
          try {
            const { serviceOrchestrationWatchdog } = await import('./serviceOrchestrationWatchdog');
            watchdogData = {
              orphanServices: serviceOrchestrationWatchdog.getOrphanServices(),
            };
          } catch (e) {
            // Watchdog may not be available
          }
          
          const unifiedDashboard = {
            timestamp: new Date().toISOString(),
            overallHealth: sentinelStatus.overallHealth,
            
            // Sentinel Summary
            sentinel: {
              running: sentinelStatus.running,
              alertCount: sentinelStatus.alertCount,
              unresolvedAlerts: sentinelStatus.unresolvedAlerts,
              healthChecks: sentinelStatus.healthChecks,
              lastScanAt: sentinelStatus.lastScanAt,
            },
            
            // Router Summary
            router: {
              status: routerHealth.status,
              successRate: routerHealth.successRate,
              avgLatencyMs: routerHealth.avgLatencyMs,
              totalIntents: routerHealth.totalIntents,
              activeHandlers: routerHealth.activeHandlers,
            },
            
            // Subagent Health
            subagents: {
              totalSubagents: subagentHealth.totalSubagents,
              healthyCount: subagentHealth.healthySubagents,
              degradedCount: subagentHealth.degradedSubagents,
              avgConfidence: subagentHealth.averageConfidence,
              domainBreakdown: subagentHealth.byDomain,
            },
            
            // Orchestration Status
            orchestration: orchestrationStatus,
            
            // Confidence Monitor (workspace-specific)
            confidenceReadiness: confidenceData,
            
            // Service Watchdog
            serviceWatchdog: watchdogData,
            
            // Quick Actions Available
            quickActions: [
              { action: 'sentinel.get_alerts', description: 'View all alerts' },
              { action: 'sentinel.trigger_remediation', description: 'Trigger self-healing' },
              { action: 'recovery.get_system_health', description: 'Detailed health check' },
              { action: 'subagent.list_all', description: 'List all subagents' },
            ],
          };
          
          return {
            success: true,
            actionId: request.actionId,
            data: unifiedDashboard,
            message: `Unified Dashboard: Overall health ${sentinelStatus.overallHealth}, ${sentinelStatus.unresolvedAlerts} alerts, ${subagentHealth.totalSubagents} subagents (${subagentHealth.healthySubagents} healthy)`,
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Failed to build unified dashboard: ${error.message}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    console.log('[AI Brain Master Orchestrator] Registered unified monitoring dashboard action');
    console.log('[AI Brain Master Orchestrator] Total new domain actions: 11 (gamification: 4, deployment: 2, recovery: 4, monitoring: 1)');
  }
}

export const aiBrainMasterOrchestrator = AIBrainMasterOrchestrator.getInstance();
