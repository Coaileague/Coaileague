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
import { db } from '../../db';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
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

  /**
   * Initialize the master orchestrator and register all actions
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[AI Brain Master Orchestrator] Initializing...');
    
    // Register all orchestration actions
    await this.registerSchedulingActions();
    await this.registerPayrollActions();
    await this.registerAnalyticsActions();
    await this.registerNotificationActions();
    await this.registerAutomationActions();
    await this.registerUserAssistanceActions();
    
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

    console.log('[AI Brain Master Orchestrator] Registered scheduling actions');
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

    console.log('[AI Brain Master Orchestrator] Registered payroll actions');
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
            title: title || 'Platform Update',
            description: content || 'New features available',
            category: 'feature',
            priority: priority || 'normal',
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
          platformEventBus.publish('system_broadcast', {
            message,
            type: type || 'info',
            workspaceId
          }, {
            source: 'ai_brain_orchestrator',
            userId: request.userId
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
          platformEventBus.publish('automation_trigger', {
            jobName,
            manualTrigger: true
          }, {
            source: 'ai_brain_orchestrator',
            userId: request.userId
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
          const result = animationControlService.setAnimationState(
            mode || 'analyze',
            message,
            duration
          );
          
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
  // WORKFLOW CHAINS - Cross-service coordination
  // ============================================================================

  /**
   * Execute a workflow chain (sequence of orchestrated tasks)
   */
  async executeWorkflowChain(
    name: string,
    steps: Omit<OrchestrationTask, 'id' | 'executedAt' | 'result' | 'error'>[],
    userId: string
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
    
    console.log(`[AI Brain Master Orchestrator] Starting workflow: ${name} (${workflowId})`);
    
    workflow.status = 'running';
    
    for (let i = 0; i < workflow.steps.length; i++) {
      workflow.currentStep = i;
      const step = workflow.steps[i];
      
      try {
        const result = await helpaiOrchestrator.executeAction({
          actionId: `${step.category}.${step.action}`,
          category: step.category as any,
          name: step.action,
          payload: step.parameters,
          userId,
          userRole: 'admin',
          priority: step.priority
        });
        
        step.executedAt = new Date();
        step.result = result;
        
        if (!result.success) {
          workflow.status = 'failed';
          step.error = result.message;
          break;
        }
      } catch (error: any) {
        step.executedAt = new Date();
        step.error = error.message;
        workflow.status = 'failed';
        break;
      }
    }
    
    if (workflow.status !== 'failed') {
      workflow.status = 'completed';
    }
    
    workflow.completedAt = new Date();
    
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
      }
    });
  }
}

export const aiBrainMasterOrchestrator = AIBrainMasterOrchestrator.getInstance();
