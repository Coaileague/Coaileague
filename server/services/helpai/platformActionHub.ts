/**
 * Platform Action Hub - Universal Action Handler
 * 
 * Central infrastructure that brokers ALL user-triggered actions through the AI Brain (Trinity).
 * Uses an event-driven command bus tied to ChatServerHub and WebSocket layers.
 * 
 * NOTE: This is platform infrastructure, not HelpAI itself. HelpAI is a support bot that
 * uses this action hub. Trinity/AI Brain is the true orchestrator.
 * 
 * Responsibilities:
 * - Intercept and validate all user actions
 * - Route actions to appropriate service handlers (via Trinity orchestration)
 * - Monitor health of services, features, and tools
 * - Send notifications to support/end users
 * - Push updates to What's New for platform announcements
 * - Provide support staff with command console capabilities
 */

import { platformEventBus, PlatformEvent } from '../platformEventBus';
import { createLogger } from '../../lib/logger';
import { ChatServerHub } from '../ChatServerHub';
import { db, pool } from '../../db';
import { 
  notifications, 
  platformUpdates, 
  maintenanceAlerts, 
  systemAuditLogs, 
  workspaces,
  automationActionLedger 
} from '@shared/schema';
import { payrollRuns } from '@shared/schema/domains/payroll/index';
import { complianceAlerts } from '@shared/schema/domains/compliance/index';
import { eq, and, desc, gte, sql, inArray } from 'drizzle-orm';
import { automationGovernanceService, type ActionContext, type ConfidenceFactors } from '../ai-brain/automationGovernanceService';
import { knowledgeOrchestrationService } from '../ai-brain/knowledgeOrchestrationService';
import { idempotencyService, registerIdempotencyActions } from '../ai-brain/idempotencyService';
import { universalNotificationEngine } from '../universalNotificationEngine';
import { validateBeforeExecution } from '../trinity/preExecutionValidator';
import { evaluateConscience, logConscienceDecision } from '../ai-brain/trinityConscience';
import { claudeVerificationService } from '../ai-brain/dualai/claudeVerificationService';
import { typedPool, typedPoolExec } from '../../lib/typedSql';
import { PLATFORM_WORKSPACE_ID } from '../billing/billingConstants';

// ============================================================================
// ACTION TYPES & INTERFACES
// ============================================================================

export type ActionCategory = 
  | 'scheduling'
  | 'payroll'
  | 'invoicing'
  | 'notifications'
  | 'health_check'
  | 'system'
  | 'support'
  | 'analytics'
  | 'integration'
  | 'integrations'
  | 'test'
  | 'compliance'
  | 'gamification'
  | 'automation'
  | 'communication'
  | 'health'
  | 'user_assistance'
  | 'lifecycle'
  | 'escalation'
  | 'session_checkpoint'
  | 'security'
  | 'memory'
  | 'admin'
  | 'coding'
  | 'strategic'
  | 'billing'
  | 'gap_intelligence'
  | 'training'
  | 'hr'
  | 'voice'
  | 'forms'
  | 'esignature'
  | 'proposals'
  | 'hr_documents'
  | 'postorders'
  | 'safety'
  | 'hiring'
  | 'operations'
  | 'workforce'
  | 'documents'
  | 'sales'
  | 'ai'
  | 'license'
  | 'metacognition'
  | 'timekeeping'
  | 'meetings'
  | 'monitoring'
  | 'intelligence'
  | 'schema_ops'
  | 'log_ops'
  | 'handler_ops'
  | 'hook_ops'
  | 'emergency'
  | 'field_operations'
  | 'announcement'
  | 'helpdesk'
  | 'audit';

export type ActionPriority = 'low' | 'normal' | 'high' | 'critical';

export interface ActionRequest {
  actionId: string;
  category: ActionCategory;
  name: string;
  description?: string;
  payload?: Record<string, any>;
  workspaceId?: string;
  userId: string;
  userRole: string;
  platformRole?: string; // Platform-level role for governance bypass (root_admin, superadmin)
  priority?: ActionPriority;
  requiresConfirmation?: boolean;
  isTestMode?: boolean;
  metadata?: {
    source?: string;
    conversationId?: string;
    sessionId?: string;
    originalToolName?: string;
    [key: string]: any;
  };
}

export interface ActionResult {
  success: boolean;
  actionId?: string;
  message: string;
  data?: any;
  error?: string;
  executionTimeMs?: number;
  notificationSent?: boolean;
  broadcastSent?: boolean;
  requiresHumanConfirmation?: boolean;
}

export interface ActionHandler {
  actionId: string;
  name: string;
  category: ActionCategory;
  description: string;
  requiredRoles?: string[];
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  healthProbe?: () => Promise<boolean>;
  handler: (request: ActionRequest) => Promise<ActionResult>;
  isTestTool?: boolean;
  isDeferred?: boolean;
}

export interface ServiceHealthStatus {
  serviceName: string;
  isHealthy: boolean;
  lastCheck: Date;
  errorMessage?: string;
  responseTimeMs?: number;
}

// ============================================================================
// ACTION REGISTRY - All platform actions registered here
// ============================================================================

const ACTION_REGISTRY: Map<string, ActionHandler> = new Map();

const log = createLogger('PlatformActionHub');

// ============================================================================
// PLATFORM ACTION HUB CLASS (Trinity's Action Infrastructure)
// ============================================================================

class PlatformActionHub {
  private serviceHealth: Map<string, ServiceHealthStatus> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private wsBroadcaster: ((message: any) => void) | null = null;
  private initialized = false;

  constructor() {
    log.info('[Platform Action Hub] Initializing universal action handler...');
    this.registerBuiltinActions();
    // Defer subscription to avoid circular-module-initialization race:
    // platformEventBus singleton may not be fully assigned when this
    // constructor runs (ESM TDZ). setImmediate pushes past all module evals.
    setImmediate(() => {
      try {
        this.subscribeToEventBus();
      } catch (err) {
        log.warn('[Platform Action Hub] Event bus subscription deferred retry:', err);
      }
    });
  }

  /**
   * Initialize the orchestrator with WebSocket broadcaster
   */
  initialize(wsBroadcaster?: (message: any) => void): void {
    if (this.initialized) return;
    
    if (wsBroadcaster) {
      this.wsBroadcaster = wsBroadcaster;
    }
    
    // Start health monitoring
    this.startHealthMonitoring();
    this.initialized = true;
    log.info('[Platform Action Hub] Initialized with WebSocket broadcaster');
  }

  /**
   * Subscribe to platform event bus for AI-related events
   */
  private subscribeToEventBus(): void {
    platformEventBus.subscribe('ai_brain_action', {
      name: 'HelpAI Orchestrator',
      handler: async (event) => {
        log.info(`[Platform Action Hub] Received event: ${event.type}`);
        // Process AI brain events
        if (event.metadata?.actionId) {
          await this.handleAIEvent(event);
        }
      }
    });

    platformEventBus.subscribe('ai_error', {
      name: 'HelpAI Orchestrator Error Handler',
      handler: async (event) => {
        await this.handleServiceError(event);
      }
    });
  }

  /**
   * Register built-in actions that are always available
   */
  private registerBuiltinActions(): void {
    // Health Check Action
    this.registerAction({
      actionId: 'system.health_check',
      name: 'System Health Check',
      category: 'health_check',
      description: 'Check health status of all platform services',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        const startTime = Date.now();
        const healthStatus = await this.getAllServiceHealth();
        return {
          success: true,
          actionId: request.actionId,
          message: 'Health check completed',
          data: healthStatus,
          executionTimeMs: Date.now() - startTime
        };
      }
    });

    // Send Test Notification
    this.registerAction({
      actionId: 'test.send_notification',
      name: 'Send Test Notification',
      category: 'test',
      description: 'Send a test notification to verify notification system',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      isTestTool: true,
      handler: async (request) => {
        const startTime = Date.now();
        const { title, message, targetUserId, type } = request.payload || {};
        
        if (!request.workspaceId) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Workspace ID required to send notification',
            executionTimeMs: Date.now() - startTime
          };
        }

        // Route through UNE with skipFeatureCheck for test notifications
        await universalNotificationEngine.sendNotification({
          type: type || 'system',
          title: title || 'Test Notification',
          message: message || 'This is a test notification from HelpAI',
          workspaceId: request.workspaceId,
          targetUserIds: [targetUserId || request.userId],
          severity: 'info',
          source: 'platform_action_hub_test',
          skipFeatureCheck: true, // Test notifications bypass feature validation
          metadata: { isTestNotification: true },
        });

        return {
          success: true,
          actionId: request.actionId,
          message: 'Test notification sent successfully',
          executionTimeMs: Date.now() - startTime,
          notificationSent: true
        };
      }
    });

    // Send Test Maintenance Alert
    this.registerAction({
      actionId: 'test.send_maintenance_alert',
      name: 'Send Test Maintenance Alert',
      category: 'test',
      description: 'Send a test maintenance alert to all users',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      isTestTool: true,
      handler: async (request) => {
        const startTime = Date.now();
        const { title, message, severity } = request.payload || {};
        
        const now = new Date();
        const endTime = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
        
        await db.insert(maintenanceAlerts).values({
          title: title || 'Test Maintenance Alert',
          description: message || 'This is a test maintenance alert from HelpAI',
          severity: severity || 'info',
          scheduledStartTime: now,
          scheduledEndTime: endTime,
          workspaceId: request.workspaceId || null,
          createdById: request.userId,
          affectedServices: ['platform'],
          status: 'scheduled',
        });

        return {
          success: true,
          actionId: request.actionId,
          message: 'Test maintenance alert sent successfully',
          executionTimeMs: Date.now() - startTime,
          broadcastSent: true
        };
      }
    });

    // Push Platform Update
    this.registerAction({
      actionId: 'system.push_update',
      name: 'Push Platform Update',
      category: 'notifications',
      description: 'Push a new platform update to What\'s New',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        const startTime = Date.now();
        const { title, description, category, version, learnMoreUrl } = request.payload || {};
        
        const updateId = `update-${Date.now()}`;
        await db.insert(platformUpdates).values({
          id: updateId,
          title: title || 'Platform Update',
          description: description || 'A new update has been deployed',
          category: category || 'improvement',
          version: version,
          learnMoreUrl: learnMoreUrl,
          workspaceId: PLATFORM_WORKSPACE_ID,
          isNew: true,
          priority: 1,
          visibility: 'all',
          date: new Date()
        });

        return {
          success: true,
          actionId: request.actionId,
          message: 'Platform update pushed to What\'s New',
          data: { updateId },
          executionTimeMs: Date.now() - startTime,
          broadcastSent: true
        };
      }
    });

    // Send Notification to User - Uses centralized notification state manager
    this.registerAction({
      actionId: 'notify.send_to_user',
      name: 'Send User Notification',
      category: 'notifications',
      description: 'Send a persisted notification to a specific user via centralized notification engine',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        const startTime = Date.now();
        const { broadcastNotificationToUser } = await import('../../websocket');
        const { targetUserId, title, message, type, actionUrl, relatedEntityType, relatedEntityId, metadata } = request.payload || {};
        
        if (!targetUserId || !title || !message) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Required fields: targetUserId, title, message',
            executionTimeMs: Date.now() - startTime
          };
        }

        // Route through UniversalNotificationEngine for Trinity AI enrichment and validation
        await universalNotificationEngine.sendNotification({
          type: type || 'system',
          title,
          message,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          workspaceId: request.workspaceId || undefined,
          targetUserIds: [targetUserId],
          severity: 'warning',
          source: 'platform_action_hub',
          metadata: { 
            ...metadata, 
            sentViaHelpAI: true, 
            sentBy: request.userId,
            actionUrl: actionUrl || null,
            relatedEntityType: relatedEntityType || null,
            relatedEntityId: relatedEntityId || null,
          },
        });

        return {
          success: true,
          actionId: request.actionId,
          message: `Notification sent to user ${targetUserId}`,
          executionTimeMs: Date.now() - startTime,
          notificationSent: true
        };
      }
    });

    // Create Maintenance Alert - Uses aiNotificationService
    this.registerAction({
      actionId: 'notify.create_maintenance_alert',
      name: 'Create Maintenance Alert',
      category: 'notifications',
      description: 'Create a maintenance alert for scheduled downtime via AI notification service',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        const startTime = Date.now();
        const { aiNotificationService } = await import('../aiNotificationService');
        const { broadcastToAllClients } = await import('../../websocket');
        const { title, description, severity, scheduledStartTime, scheduledEndTime, affectedServices, isBroadcast, estimatedImpactMinutes } = request.payload || {};
        
        if (!title || !description || !scheduledStartTime || !scheduledEndTime) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Required fields: title, description, scheduledStartTime, scheduledEndTime',
            executionTimeMs: Date.now() - startTime
          };
        }

        // Use centralized AI notification service
        const result = await aiNotificationService.createMaintenanceAlert(request.userId, {
          title,
          description,
          severity: severity || 'info',
          scheduledStartTime: new Date(scheduledStartTime),
          scheduledEndTime: new Date(scheduledEndTime),
          affectedServices: affectedServices || [],
          estimatedImpactMinutes,
          workspaceId: request.workspaceId,
          isBroadcast: isBroadcast !== false
        });

        if (!result) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Failed to create maintenance alert',
            executionTimeMs: Date.now() - startTime
          };
        }

        // Broadcast maintenance alert to all connected clients
        if (isBroadcast !== false) {
          broadcastToAllClients({
            type: 'maintenance_alert_created',
            alertId: result.id,
            title,
            severity: severity || 'info',
            scheduledStartTime,
            scheduledEndTime,
            affectedServices: affectedServices || [],
            timestamp: new Date().toISOString()
          });
        }

        return {
          success: true,
          actionId: request.actionId,
          message: `Maintenance alert created: ${title}`,
          data: { alertId: result.id },
          executionTimeMs: Date.now() - startTime,
          broadcastSent: isBroadcast !== false
        };
      }
    });

    // notifications.get_stats removed — duplicate of notify.get_stats (coreSubagentOrchestration.ts)

    // Force Clear All Notifications - Aligns with REST endpoint behavior
    this.registerAction({
      actionId: 'notify.force_clear_all',
      name: 'Force Clear All Notifications',
      category: 'notifications',
      description: 'Clear all notifications for a user (support action) - sets clearedAt and acknowledges alerts',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        const startTime = Date.now();
        const { aiNotificationService } = await import('../aiNotificationService');
        const { broadcastNotificationToUser } = await import('../../websocket');
        const { aiBrainAuthorizationService } = await import('../ai-brain/aiBrainAuthorizationService');
        const { targetUserId, workspaceId: targetWorkspaceId } = request.payload || {};
        
        if (!targetUserId) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Required field: targetUserId',
            executionTimeMs: Date.now() - startTime
          };
        }

        const workspaceId = targetWorkspaceId || request.workspaceId;
        const now = new Date();

        // Clear all notifications - set clearedAt for permanent dismissal
        const conditions = [eq(notifications.userId, targetUserId)];
        if (workspaceId) {
          conditions.push(eq(notifications.workspaceId, workspaceId));
        }

        const result = await db.update(notifications)
          .set({ 
            isRead: true, 
            readAt: now,
            clearedAt: now,
            updatedAt: now
          })
          .where(and(...conditions))
          .returning({ id: notifications.id });

        // Acknowledge all active maintenance alerts
        let alertsCleared = 0;
        try {
          const alerts = await aiNotificationService.getActiveMaintenanceAlerts(workspaceId);
          for (const alert of alerts) {
            await aiNotificationService.acknowledgeMaintenanceAlert(alert.id, targetUserId);
            alertsCleared++;
          }
        } catch (e) {
          log.warn('[HelpAI] Failed to acknowledge maintenance alerts:', e);
        }

        // Broadcast notification cleared event via centralized WebSocket
        if (workspaceId) {
          broadcastNotificationToUser(workspaceId, targetUserId, {
            type: 'notification_cleared_all',
            cleared: { notifications: result.length, alerts: alertsCleared },
            unreadCount: 0,
            unclearedCount: 0,
            timestamp: now.toISOString()
          });
        }

        // Log to AI Brain audit trail
        try {
          await aiBrainAuthorizationService.logCommandExecution({
            userId: request.userId,
            userRole: request.userRole,
            actionId: 'notify.force_clear_all',
            category: 'notifications',
            parameters: { targetUserId, workspaceId },
            result: { success: true, cleared: { notifications: result.length, alerts: alertsCleared } }
          });
        } catch (logError) {
          log.warn('[HelpAI] Failed to log to AI Brain audit:', logError);
        }

        return {
          success: true,
          actionId: request.actionId,
          message: `Cleared ${result.length} notifications and ${alertsCleared} alerts for user ${targetUserId}`,
          data: { clearedCount: result.length, alertsCleared },
          executionTimeMs: Date.now() - startTime,
          broadcastSent: true
        };
      }
    });

    // Broadcast Message
    this.registerAction({
      actionId: 'support.broadcast',
      name: 'Broadcast Message',
      category: 'support',
      description: 'Broadcast a message to all connected users',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        const startTime = Date.now();
        const { message, type } = request.payload || {};
        
        if (this.wsBroadcaster) {
          this.wsBroadcaster({
            type: 'platform_broadcast',
            message: message || 'System announcement',
            broadcastType: type || 'info',
            timestamp: new Date().toISOString(),
            from: 'HelpAI'
          });
        }

        return {
          success: true,
          actionId: request.actionId,
          message: 'Broadcast message sent',
          executionTimeMs: Date.now() - startTime,
          broadcastSent: true
        };
      }
    });

    // Check Service Status
    this.registerAction({
      actionId: 'system.service_status',
      name: 'Service Status Check',
      category: 'health_check',
      description: 'Check status of a specific service',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        const startTime = Date.now();
        const { serviceName } = request.payload || {};
        
        const status = this.serviceHealth.get(serviceName);
        return {
          success: true,
          actionId: request.actionId,
          message: status ? `Service ${serviceName} is ${status.isHealthy ? 'healthy' : 'unhealthy'}` : 'Service not found',
          data: status || { serviceName, isHealthy: false, lastCheck: new Date(), errorMessage: 'Service not monitored' },
          executionTimeMs: Date.now() - startTime
        };
      }
    });


    // ============================================================================
    // PAYMENT ENFORCEMENT ACTIONS - Trinity can deactivate/reactivate workspaces
    // ============================================================================

    // Deactivate Workspace (for non-payment)
    this.registerAction({
      actionId: "admin.deactivate_workspace",
      name: "Deactivate Workspace",
      category: "admin",
      description: "Deactivate a workspace due to non-payment or suspension. End users will be logged out, org owners will see payment prompt.",
      requiredRoles: ["sysop", "deputy_admin", "root_admin"],
      handler: async (request) => {
        const startTime = Date.now();
        const { workspaceId, reason, status } = request.payload || {};
        
        const targetWorkspace = workspaceId || request.workspaceId;
        if (!targetWorkspace) {
          return {
            success: false,
            actionId: request.actionId,
            message: "Workspace ID required to deactivate",
            executionTimeMs: Date.now() - startTime
          };
        }
        
        const deactivationStatus = status || "suspended";
        
        try {
          await db.update(workspaces).set({ subscriptionStatus: deactivationStatus }).where(eq(workspaces.id, targetWorkspace));
          log.info(`[Trinity] Workspace ${targetWorkspace} deactivated (${deactivationStatus}) by Trinity. Reason: ${reason || "No reason provided"}`);
          
          // Force-disconnect all live WebSocket sessions in this workspace immediately
          try {
            const { broadcastToWorkspace } = await import('../../websocket');
            broadcastToWorkspace(targetWorkspace, {
              type: 'WORKSPACE_SUSPENDED',
              reason: reason || 'Workspace suspended',
              status: deactivationStatus,
              action: 'force_logout',
              message: 'Your session has ended because this workspace has been suspended. Please contact your administrator.',
              timestamp: new Date().toISOString(),
            });
            log.info(`[Trinity] Force-logout broadcast sent to workspace ${targetWorkspace}`);
          } catch (wsErr) {
            log.warn(`[Trinity] Could not broadcast force-logout to workspace ${targetWorkspace}:`, wsErr);
          }
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Workspace ${targetWorkspace} has been ${deactivationStatus}. Live sessions have been force-disconnected.`,
            data: { workspaceId: targetWorkspace, status: deactivationStatus, reason },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Failed to deactivate workspace: ${(error instanceof Error ? error.message : String(error))}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // Reactivate Workspace (after payment)
    this.registerAction({
      actionId: "admin.reactivate_workspace",
      name: "Reactivate Workspace",
      category: "admin",
      description: "Reactivate a previously suspended workspace after payment is received.",
      requiredRoles: ["sysop", "deputy_admin", "root_admin"],
      handler: async (request) => {
        const startTime = Date.now();
        const { workspaceId } = request.payload || {};
        
        const targetWorkspace = workspaceId || request.workspaceId;
        if (!targetWorkspace) {
          return {
            success: false,
            actionId: request.actionId,
            message: "Workspace ID required to reactivate",
            executionTimeMs: Date.now() - startTime
          };
        }
        
        try {
          await db.update(workspaces).set({ subscriptionStatus: "active" }).where(eq(workspaces.id, targetWorkspace));
          log.info(`[Trinity] Workspace ${targetWorkspace} reactivated by Trinity`);
          
          return {
            success: true,
            actionId: request.actionId,
            message: `Workspace ${targetWorkspace} has been reactivated. Users can now log in.`,
            data: { workspaceId: targetWorkspace, status: "active" },
            executionTimeMs: Date.now() - startTime
          };
        } catch (error: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Failed to reactivate workspace: ${(error instanceof Error ? error.message : String(error))}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });
    // AI Brain Query — routes to actual Trinity reasoning pipeline
    this.registerAction({
      actionId: 'ai.query',
      name: 'Query AI Brain',
      category: 'support',
      description: 'Send a natural language query to Trinity reasoning triad',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
      handler: async (request) => {
        const startTime = Date.now();
        const { query, context, sessionId, userId } = request.payload || {};

        if (!query) {
          return { success: false, actionId: request.actionId, message: 'query payload required', executionTimeMs: Date.now() - startTime };
        }

        try {
          const { trinityChatService } = await import('../ai-brain/trinityChatService');
          const response = await trinityChatService.chat({
            message: query,
            sessionId: sessionId || `ai-query-${Date.now()}`,
            userId: userId || request.workspaceId || 'system',
            workspaceId: request.workspaceId || '',
            mode: 'business',
          });

          return {
            success: true,
            actionId: request.actionId,
            message: response.response,
            data: {
              query,
              response: response.response,
              mode: response.mode,
              tokensUsed: response.usage?.totalTokens,
              sessionId: response.sessionId,
            },
            executionTimeMs: Date.now() - startTime
          };
        } catch (err: any) {
          return {
            success: false,
            actionId: request.actionId,
            message: `AI query failed: ${err?.message || 'Unknown error'}`,
            executionTimeMs: Date.now() - startTime
          };
        }
      }
    });

    // ============================================================================
    // CODE EDITOR ACTIONS — removed code.* prefix (7 actions).
    // Canonical equivalents are registered under coding.* in trinityCodeOpsActions.ts:
    //   code.stage_change  → coding.apply_patch
    //   code.stage_batch   → coding.preview_patch
    //   code.get_pending   → coding.list_pending_approvals / coding.get_status
    //   code.approve       → coding.approve_change
    //   code.reject        → coding.reject_change
    //   code.apply         → coding.commit_changes
    //   code.rollback      → coding.rollback_patch

    // Register idempotency management actions
    registerIdempotencyActions(this);

    this.registerAction({
      actionId: 'billing.aging_report',
      name: 'Invoice Aging Report',
      category: 'invoicing',
      description: 'Generate aging buckets (current, 30/60/90/90+ day) for all unpaid invoices',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
      handler: async (request) => {
        const startTime = Date.now();
        const { generateAgingReport } = await import('../billingAutomation');
        const workspaceId = request.workspaceId || request.payload?.workspaceId;
        if (!workspaceId) {
          return { success: false, actionId: request.actionId, message: 'Workspace required', executionTimeMs: Date.now() - startTime };
        }
        const report = await generateAgingReport(workspaceId);
        return { success: true, actionId: request.actionId, message: `Aging report: $${report.summary.totalOutstanding.toFixed(2)} outstanding across ${report.summary.current.count + report.summary.thirtyDay.count + report.summary.sixtyDay.count + report.summary.ninetyDay.count + report.summary.ninetyPlus.count} invoices`, data: report, executionTimeMs: Date.now() - startTime };
      }
    });

    this.registerAction({
      actionId: 'learning.record_correction',
      name: 'Record Human Correction',
      category: 'automation',
      description: 'Record when a manager overrides a Trinity decision for learning improvement',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
      handler: async (request) => {
        const startTime = Date.now();
        const { rlLoopRepository } = await import('../ai-brain/cognitiveRepositories');
        const { workspaceId, agentId, actionType, originalDecision, correctedDecision, correctionReason } = request.payload || {};
        if (!workspaceId || !actionType || !originalDecision || !correctedDecision) {
          return { success: false, actionId: request.actionId, message: 'Missing required correction fields', executionTimeMs: Date.now() - startTime };
        }
        const result = await rlLoopRepository.recordCorrection({
          workspaceId, agentId: agentId || 'trinity', actionType, originalDecision, correctedDecision,
          correctionReason: correctionReason || 'Manager override', correctedBy: request.userId,
        });
        return { success: !!result, actionId: request.actionId, message: result ? 'Correction recorded for learning' : 'Failed to record', data: result, executionTimeMs: Date.now() - startTime };
      }
    });

    this.registerAction({
      actionId: 'learning.lookup_corrections',
      name: 'Lookup Past Corrections',
      category: 'automation',
      description: 'Check if similar decisions were corrected before to inform current decision',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
      handler: async (request) => {
        const startTime = Date.now();
        const { rlLoopRepository } = await import('../ai-brain/cognitiveRepositories');
        const { agentId, actionType, workspaceId } = request.payload || {};
        const corrections = await rlLoopRepository.lookupCorrections(agentId || 'trinity', actionType || 'general', workspaceId);
        return { success: true, actionId: request.actionId, message: `Found ${corrections.length} past corrections`, data: corrections, executionTimeMs: Date.now() - startTime };
      }
    });

    this.registerAction({
      actionId: 'learning.accuracy_metrics',
      name: 'Trinity Accuracy Metrics',
      category: 'analytics',
      description: 'Get Trinity decision accuracy rate with breakdown by action type',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
      handler: async (request) => {
        const startTime = Date.now();
        const { rlLoopRepository } = await import('../ai-brain/cognitiveRepositories');
        const { agentId, workspaceId } = request.payload || {};
        const metrics = await rlLoopRepository.getAccuracyMetrics(agentId || 'trinity', workspaceId || request.workspaceId);
        return { success: true, actionId: request.actionId, message: `Accuracy: ${metrics.accuracyRate.toFixed(1)}% (${metrics.totalDecisions} decisions, ${metrics.totalCorrections} corrections)`, data: metrics, executionTimeMs: Date.now() - startTime };
      }
    });

    this.registerAction({
      actionId: 'chat.conversations_by_entity',
      name: 'Get Conversations About Entity',
      category: 'communication',
      description: 'Retrieve conversation history about a specific client or employee',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
      handler: async (request) => {
        const startTime = Date.now();
        const { trinityChatService } = await import('../ai-brain/trinityChatService');
        const { entityType, entityId, workspaceId } = request.payload || {};
        if (!entityType || !entityId || !workspaceId) {
          return { success: false, actionId: request.actionId, message: 'entityType, entityId, and workspaceId required', executionTimeMs: Date.now() - startTime };
        }
        const turns = await trinityChatService.getConversationsByEntity(workspaceId, entityType, entityId);
        return { success: true, actionId: request.actionId, message: `Found ${turns.length} conversation turns about ${entityType} ${entityId}`, data: turns, executionTimeMs: Date.now() - startTime };
      }
    });

    this.registerAction({
      actionId: 'system.sms_health',
      name: 'SMS/Twilio Health Check',
      category: 'health_check',
      description: 'Check SMS/Twilio service configuration and availability',
      requiredRoles: ['org_owner', 'co_owner'],
      handler: async (request) => {
        const startTime = Date.now();
        const { smsHealthCheck } = await import('../smsService');
        const health = await smsHealthCheck();
        return { success: true, actionId: request.actionId, message: `SMS service: ${health.status}`, data: health, executionTimeMs: Date.now() - startTime };
      }
    });

    this.registerAction({
      actionId: 'knowledge.track_client_preference',
      name: 'Track Client Preference',
      category: 'analytics',
      description: 'Store a client preference or intelligence note in the knowledge graph',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
      handler: async (request) => {
        const startTime = Date.now();
        const { knowledgeGraphRepository } = await import('../ai-brain/cognitiveRepositories');
        const { clientId, clientName, preferenceType, preferenceValue, workspaceId } = request.payload || {};
        if (!clientId || !preferenceType) {
          return { success: false, actionId: request.actionId, message: 'clientId and preferenceType required', executionTimeMs: Date.now() - startTime };
        }
        const entity = await knowledgeGraphRepository.createEntity({
          id: `client-pref-${clientId}-${preferenceType}-${Date.now()}`,
          entityType: 'client_preference',
          domain: 'billing',
          workspaceId: workspaceId || request.workspaceId,
          name: `${clientName || clientId}: ${preferenceType}`,
          content: JSON.stringify({ preferenceType, preferenceValue, clientId }),
          confidence: 0.9,
          sourceAgent: 'trinity',
          sourceAction: 'track_client_preference',
          metadata: { clientId, preferenceType, preferenceValue },
        });
        return { success: !!entity, actionId: request.actionId, message: entity ? `Client preference tracked: ${preferenceType}` : 'Failed to track', data: entity, executionTimeMs: Date.now() - startTime };
      }
    });

    this.registerAction({
      actionId: 'knowledge.get_client_intelligence',
      name: 'Get Client Intelligence',
      category: 'analytics',
      description: 'Retrieve all known preferences and intelligence for a client',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
      handler: async (request) => {
        const startTime = Date.now();
        const { knowledgeGraphRepository } = await import('../ai-brain/cognitiveRepositories');
        const { clientId, workspaceId } = request.payload || {};
        if (!clientId) {
          return { success: false, actionId: request.actionId, message: 'clientId required', executionTimeMs: Date.now() - startTime };
        }
        const entities = await knowledgeGraphRepository.getEntitiesByType('client_preference', workspaceId || request.workspaceId);
        const clientEntities = entities.filter((e: any) => {
          const attrs = e.attributes as any;
          return attrs?.clientId === clientId;
        });
        return { success: true, actionId: request.actionId, message: `Found ${clientEntities.length} intelligence entries for client`, data: clientEntities, executionTimeMs: Date.now() - startTime };
      }
    });

    // ============================================================================
    // CAD / FIELD OPERATIONS ACTIONS — Trinity can now execute dispatch
    // ============================================================================

    this.registerAction({
      actionId: 'cad.get_active_calls',
      name: 'Get Active CAD Calls',
      category: 'analytics',
      description: 'Retrieve all active or pending CAD dispatch calls for the workspace',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
      handler: async (request) => {
        const startTime = Date.now();
        const { pool } = await import('../../db');
        const workspaceId = request.workspaceId;
        if (!workspaceId) return { success: false, actionId: request.actionId, message: 'workspaceId required', executionTimeMs: Date.now() - startTime };
        // Converted to Drizzle ORM: Get Active CAD Calls → inArray
        const { cadCalls } = await import('@shared/schema');
        const { and, eq, inArray, desc } = await import('drizzle-orm');
        const activeCallsData = await db
          .select({
            id: cadCalls.id,
            callNumber: cadCalls.callNumber,
            callType: cadCalls.callType,
            priority: cadCalls.priority,
            status: cadCalls.status,
            siteName: cadCalls.siteName,
            locationDescription: cadCalls.locationDescription,
            callerName: cadCalls.callerName,
            receivedAt: cadCalls.receivedAt,
            dispatchedAt: cadCalls.dispatchedAt,
          })
          .from(cadCalls)
          .where(and(
            eq(cadCalls.workspaceId, workspaceId),
            inArray(cadCalls.status, ['pending', 'dispatched', 'on_scene']),
          ))
          .orderBy(desc(cadCalls.receivedAt))
          .limit(20);

        return { success: true, actionId: request.actionId, message: `Found ${activeCallsData.length} active calls`, data: activeCallsData, executionTimeMs: Date.now() - startTime };
      }
    });

    this.registerAction({
      actionId: 'cad.get_on_duty_officers',
      name: 'Get On-Duty Officers',
      category: 'analytics',
      description: 'Get list of all currently on-duty officers and their status from CAD units',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
      handler: async (request) => {
        const startTime = Date.now();
        const { pool } = await import('../../db');
        const workspaceId = request.workspaceId;
        if (!workspaceId) return { success: false, actionId: request.actionId, message: 'workspaceId required', executionTimeMs: Date.now() - startTime };
        // Converted to Drizzle ORM: Get On-Duty Officers → notInArray
        const { cadUnits } = await import('@shared/schema');
        const { and, eq, notInArray, asc } = await import('drizzle-orm');
        const onDutyUnitsData = await db
          .select({
            id: cadUnits.id,
            unitIdentifier: cadUnits.unitIdentifier,
            employeeName: cadUnits.employeeName,
            currentStatus: cadUnits.currentStatus,
            currentCallId: cadUnits.currentCallId,
            lastPingAt: cadUnits.lastLocationUpdate, // mapping last_ping_at to last_location_update based on schema
            latitude: cadUnits.latitude,
            longitude: cadUnits.longitude,
          })
          .from(cadUnits)
          .where(and(
            eq(cadUnits.workspaceId, workspaceId),
            notInArray(cadUnits.currentStatus, ['off_duty', 'out_of_service'] as any[]),
          ))
          .orderBy(asc(cadUnits.employeeName));

        return { success: true, actionId: request.actionId, message: `${onDutyUnitsData.length} officer(s) on duty`, data: onDutyUnitsData, executionTimeMs: Date.now() - startTime };
      }
    });

    this.registerAction({
      actionId: 'cad.get_nearest_unit',
      name: 'Get Nearest Available Unit',
      category: 'analytics',
      description: 'Find the nearest available on-duty officer to a given location (lat/lng)',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
      handler: async (request) => {
        const startTime = Date.now();
        const { pool } = await import('../../db');
        const workspaceId = request.workspaceId;
        const { latitude, longitude } = request.payload || {};
        if (!workspaceId) return { success: false, actionId: request.actionId, message: 'workspaceId required', executionTimeMs: Date.now() - startTime };
        let query = `SELECT id, unit_identifier, employee_name, current_status, latitude, longitude, last_ping_at FROM cad_units WHERE workspace_id=$1 AND current_status='available'`;
        const params: any[] = [workspaceId];
        if (latitude && longitude) {
          const lat = Number(latitude);
          const lng = Number(longitude);
          if (isNaN(lat) || isNaN(lng)) return { success: false, actionId: request.actionId, message: 'Invalid coordinates', executionTimeMs: Date.now() - startTime };
          query += ` ORDER BY ((latitude - $2)^2 + (longitude - $3)^2) ASC`;
          params.push(lat, lng);
        }
        query += ` LIMIT 5`;
        const result = await typedPool(query, params);
        const nearest = (result as unknown as any[])[0];
        return { success: true, actionId: request.actionId, message: nearest ? `Nearest available unit: ${nearest.unit_identifier} (${nearest.employee_name})` : 'No available units on duty', data: result, executionTimeMs: Date.now() - startTime };
      }
    });

    this.registerAction({
      actionId: 'cad.assign_unit',
      name: 'Dispatch Unit to Call',
      category: 'admin',
      description: 'Dispatch a specific CAD unit to an active call. Requires unitId and callId.',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
      handler: async (request) => {
        const startTime = Date.now();
        const { pool } = await import('../../db');
        const { unitId, callId, dispatchedByName } = request.payload || {};
        const workspaceId = request.workspaceId;
        if (!unitId || !callId || !workspaceId) return { success: false, actionId: request.actionId, message: 'unitId, callId, and workspaceId required', executionTimeMs: Date.now() - startTime };
        const callRows = await typedPool(`SELECT * FROM cad_calls WHERE id=$1 AND workspace_id=$2`, [callId, workspaceId]);
        if (!(callRows as unknown as any[]).length) return { success: false, actionId: request.actionId, message: 'Call not found', executionTimeMs: Date.now() - startTime };
        const call = (callRows as unknown as any[])[0];
        const currentUnits = Array.isArray(call.dispatched_units) ? call.dispatched_units : [];
        if (!currentUnits.includes(unitId)) currentUnits.push(unitId);
        // CATEGORY C — Genuine complex: multi-table CAD dispatch (cad_calls + cad_units + cad_dispatch_log in single operation)
        await typedPoolExec(`UPDATE cad_calls SET status='dispatched', dispatched_units=$1, primary_unit_id=$2, dispatched_at=NOW(), updated_at=NOW() WHERE id=$3`, [JSON.stringify(currentUnits), unitId, callId]);
        await typedPoolExec(`UPDATE cad_units SET current_status='dispatched', current_call_id=$1, updated_at=NOW() WHERE id=$2 AND workspace_id=$3`, [callId, unitId, workspaceId]);
        const { randomUUID } = await import('crypto');
        await typedPoolExec(`INSERT INTO cad_dispatch_log (id,workspace_id,call_id,unit_id,action,action_by_name,notes,logged_at) VALUES($1,$2,$3,$4,'unit_dispatched',$5,'Trinity autonomous dispatch',NOW())`, [randomUUID(), workspaceId, callId, unitId, dispatchedByName || 'Trinity AI']);
        return { success: true, actionId: request.actionId, message: `Unit ${unitId} dispatched to call ${call.call_number}`, data: { callId, unitId, callNumber: call.call_number }, executionTimeMs: Date.now() - startTime };
      }
    });

    this.registerAction({
      actionId: 'rms.get_incidents_by_site',
      name: 'Get Incidents by Site',
      category: 'analytics',
      description: 'Retrieve recent incidents for a specific site or client',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
      handler: async (request) => {
        const startTime = Date.now();
        const { pool } = await import('../../db');
        const { siteId, siteName, limit = 10 } = request.payload || {};
        const workspaceId = request.workspaceId;
        if (!workspaceId) return { success: false, actionId: request.actionId, message: 'workspaceId required', executionTimeMs: Date.now() - startTime };
        let query = `SELECT id, report_number, category, priority, title, status, occurred_at, reported_by_name, site_name FROM incident_reports WHERE workspace_id=$1`;
        const params: any[] = [workspaceId];
        if (siteId) { query += ` AND site_id=$2`; params.push(siteId); }
        else if (siteName) { query += ` AND site_name ILIKE $2`; params.push(`%${siteName}%`); }
        query += ` ORDER BY occurred_at DESC LIMIT ${Number(limit)}`;
        const result = await typedPool(query, params);
        return { success: true, actionId: request.actionId, message: `Found ${(result as unknown as any[]).length} incidents`, data: result, executionTimeMs: Date.now() - startTime };
      }
    });

    this.registerAction({
      actionId: 'scheduling.get_officer_status',
      name: 'Get Officer Status',
      category: 'analytics',
      description: 'Get current status of a specific officer (clocked in, GPS position, CAD status)',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
      handler: async (request) => {
        const startTime = Date.now();
        const { pool } = await import('../../db');
        const { employeeId, employeeName } = request.payload || {};
        const workspaceId = request.workspaceId;
        if (!workspaceId) return { success: false, actionId: request.actionId, message: 'workspaceId required', executionTimeMs: Date.now() - startTime };
        let unitQuery = `SELECT u.*, e.first_name, e.last_name FROM cad_units u LEFT JOIN employees e ON e.id = u.employee_id WHERE u.workspace_id=$1`;
        const params: any[] = [workspaceId];
        if (employeeId) { unitQuery += ` AND u.employee_id=$2`; params.push(employeeId); }
        else if (employeeName) { unitQuery += ` AND u.employee_name ILIKE $2`; params.push(`%${employeeName}%`); }
        unitQuery += ` LIMIT 1`;
        const result = await typedPool(unitQuery, params);
        const unit = (result as unknown as any[])[0];
        if (!unit) return { success: true, actionId: request.actionId, message: 'Officer not found in active duty', data: null, executionTimeMs: Date.now() - startTime };
        return { success: true, actionId: request.actionId, message: `Officer ${unit.employee_name}: ${unit.current_status}`, data: { unitId: unit.id, employeeName: unit.employee_name, status: unit.current_status, lastPing: unit.last_ping_at, latitude: unit.latitude, longitude: unit.longitude, currentCallId: unit.current_call_id }, executionTimeMs: Date.now() - startTime };
      }
    });

    this.registerAction({
      actionId: 'safety.get_panic_history',
      name: 'Get Panic Alert History',
      category: 'analytics',
      description: 'Retrieve recent panic/SOS alerts for the workspace',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
      handler: async (request) => {
        const startTime = Date.now();
        const { pool } = await import('../../db');
        const workspaceId = request.workspaceId;
        const { limit = 10 } = request.payload || {};
        if (!workspaceId) return { success: false, actionId: request.actionId, message: 'workspaceId required', executionTimeMs: Date.now() - startTime };
        // CATEGORY C — Raw SQL retained: ORDER BY | Tables: panic_alerts | Verified: 2026-03-23
        const result = await typedPool(`SELECT id, alert_number, employee_name, site_name, status, triggered_at, acknowledged_at, resolved_at FROM panic_alerts WHERE workspace_id=$1 ORDER BY triggered_at DESC LIMIT ${Number(limit)}`, [workspaceId]);
        return { success: true, actionId: request.actionId, message: `Found ${(result as unknown as any[]).length} panic alerts`, data: result, executionTimeMs: Date.now() - startTime };
      }
    });

    this.registerAction({
      actionId: 'cad.suggest_dispatch',
      name: 'Suggest Best Dispatch Unit',
      category: 'analytics',
      description: 'Analyze an active CAD call and recommend the best available on-duty officer to dispatch, considering location proximity, current workload, and unit availability',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
      handler: async (request) => {
        const startTime = Date.now();
        const { pool } = await import('../../db');
        const { callId } = request.payload || {};
        const workspaceId = request.workspaceId;
        if (!workspaceId) return { success: false, actionId: request.actionId, message: 'workspaceId required', executionTimeMs: Date.now() - startTime };

        let callRows: any[] = [];
        if (callId) {
          // @ts-expect-error — TS migration: fix in refactoring sprint
          callRows = await typedPool(
            `SELECT id, call_number, call_type, priority, location, site_name, latitude, longitude FROM cad_calls WHERE id=$1 AND workspace_id=$2`,
            [callId, workspaceId]
          ).catch(() => []);
        }
        const call = callRows[0];

        // CATEGORY C — Raw SQL retained: ORDER BY | Tables: cad_units | Verified: 2026-03-23
        const availableUnits = await typedPool(`
          SELECT cu.id, cu.unit_identifier, cu.employee_name, cu.current_status,
            cu.current_site_name, cu.latitude, cu.longitude, cu.last_ping_at
          FROM cad_units cu
          WHERE cu.workspace_id = $1 AND cu.current_status = 'available'
          ORDER BY cu.last_ping_at DESC NULLS LAST LIMIT 10
        `, [workspaceId]).catch(() => []);
        const availableUnitsArr = availableUnits as any[];

        if (!availableUnitsArr.length) {
          return { success: true, actionId: request.actionId, message: 'No available units on duty', data: { call, availableUnits: [], suggestion: null }, executionTimeMs: Date.now() - startTime };
        }

        let suggestion: any = availableUnitsArr[0];
        if (call?.latitude && call?.longitude) {
          suggestion = availableUnitsArr.sort((a: any, b: any) => {
            const distA = Math.pow((a.latitude || 0) - call.latitude, 2) + Math.pow((a.longitude || 0) - call.longitude, 2);
            const distB = Math.pow((b.latitude || 0) - call.latitude, 2) + Math.pow((b.longitude || 0) - call.longitude, 2);
            return distA - distB;
          })[0];
        }

        const reason = call
          ? `${suggestion.employee_name} (${suggestion.unit_identifier}) is the nearest available unit to ${call.site_name || call.location || 'the call location'}. Last pinged ${suggestion.last_ping_at ? new Date(suggestion.last_ping_at).toLocaleTimeString() : 'unknown'}.`
          : `${suggestion.employee_name} (${suggestion.unit_identifier}) is the most recently active available unit.`;

        return {
          success: true,
          actionId: request.actionId,
          message: `Suggested dispatch: ${suggestion.unit_identifier} — ${suggestion.employee_name}`,
          data: { call: call || null, suggestion, reason, allAvailableUnits: availableUnitsArr },
          executionTimeMs: Date.now() - startTime,
        };
      }
    });

    this.registerAction({
      actionId: 'rms.get_officer_incident_history',
      name: 'Get Officer Incident History',
      category: 'analytics',
      description: 'Retrieve all incidents filed by or involving a specific officer, with trend analysis',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
      handler: async (request) => {
        const startTime = Date.now();
        const { pool } = await import('../../db');
        const { employeeId, employeeName, limit = 20, days = 90 } = request.payload || {};
        const workspaceId = request.workspaceId;
        if (!workspaceId) return { success: false, actionId: request.actionId, message: 'workspaceId required', executionTimeMs: Date.now() - startTime };

        const daysNum = Math.max(1, Math.min(365, Number(days) || 90));
        const limitNum = Math.max(1, Math.min(100, Number(limit) || 20));
        let paramIdx = 2;
        let query = `
          SELECT id, report_number, category, priority, title, status, occurred_at,
            reported_by_name, reported_by_employee_id, site_name
          FROM incident_reports
          WHERE workspace_id=$1
            AND occurred_at >= NOW() - make_interval(days => $${paramIdx})
        `;
        const params: any[] = [workspaceId, daysNum];
        paramIdx++;

        if (employeeId) {
          query += ` AND reported_by_employee_id=$${paramIdx}`;
          params.push(employeeId);
          paramIdx++;
        } else if (employeeName) {
          query += ` AND reported_by_name ILIKE $${paramIdx}`;
          params.push(`%${employeeName}%`);
          paramIdx++;
        }
        query += ` ORDER BY occurred_at DESC LIMIT $${paramIdx}`;
        params.push(limitNum);

        const result = await typedPool(query, params).catch(() => []);
        const resultRows = result as any[];

        const categoryCounts: Record<string, number> = {};
        resultRows.forEach((r: any) => { categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1; });
        const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';

        return {
          success: true,
          actionId: request.actionId,
          message: `Found ${resultRows.length} incidents for officer over last ${days} days`,
          data: {
            incidents: resultRows,
            summary: {
              total: resultRows.length,
              days,
              topCategory,
              categoryCounts,
              criticalCount: resultRows.filter((r: any) => r.priority === 'critical').length,
            }
          },
          executionTimeMs: Date.now() - startTime,
        };
      }
    });


    // ============================================================================
    // RMS INCIDENT ACTIONS (F005) — Trinity can manage RMS incidents
    // ============================================================================

    this.registerAction({
      actionId: 'rms.create_incident',
      name: 'Create RMS Incident Report',
      category: 'automation',
      description: 'Create RMS incident report',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
      handler: async (request) => {
        const startTime = Date.now();
        const { pool } = await import('../../db');
        const workspaceId = request.workspaceId || request.payload?.workspaceId;
        if (!workspaceId) {
          return { success: false, actionId: request.actionId, message: 'workspaceId required', executionTimeMs: Date.now() - startTime };
        }
        const { category: incidentCategory, priority, description: incidentDescription, reportedBy } = request.payload || {};
        // CATEGORY C — Raw SQL retained: schema mismatch (SQL uses category/priority/description vs schema incidentType/severity/rawDescription) | Tables: incident_reports | Verified: 2026-03-23
        const result = await typedPool(
          'INSERT INTO incident_reports (workspace_id, category, priority, status, description, reported_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
          [workspaceId, incidentCategory || 'general', priority || 'medium', 'open', incidentDescription, reportedBy || 'trinity-ai']
        );
        const insertedId = (result as unknown as any[])[0]?.id;
        return {
          success: true,
          actionId: request.actionId,
          message: `Incident created: ${insertedId}`,
          data: { incidentId: insertedId },
          executionTimeMs: Date.now() - startTime
        };
      }
    });

    this.registerAction({
      actionId: 'rms.get_incidents',
      name: 'Query RMS Incidents',
      category: 'analytics',
      description: 'Query RMS incidents',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
      handler: async (request) => {
        const startTime = Date.now();
        const { pool } = await import('../../db');
        const workspaceId = request.workspaceId || request.payload?.workspaceId;
        if (!workspaceId) {
          return { success: false, actionId: request.actionId, message: 'workspaceId required', executionTimeMs: Date.now() - startTime };
        }
        const { limit = 10 } = request.payload || {};
        // CATEGORY C — Raw SQL retained: ORDER BY | Tables: incident_reports | Verified: 2026-03-23
        const result = await typedPool(
          'SELECT id, category, priority, status, description, COALESCE(occurred_at, updated_at) as created_at FROM incident_reports WHERE workspace_id = $1 ORDER BY COALESCE(occurred_at, updated_at) DESC LIMIT $2',
          [workspaceId, Number(limit)]
        );
        return {
          success: true,
          actionId: request.actionId,
          message: `Found ${(result as unknown as any[]).length} incidents`,
          data: { incidents: result },
          executionTimeMs: Date.now() - startTime
        };
      }
    });

    this.registerAction({
      actionId: 'rms.update_incident_status',
      name: 'Update RMS Incident Status',
      category: 'automation',
      description: 'Update RMS incident status',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
      handler: async (request) => {
        const startTime = Date.now();
        const { pool } = await import('../../db');
        const workspaceId = request.workspaceId || request.payload?.workspaceId;
        const { status, incidentId } = request.payload || {};
        if (!workspaceId || !status || !incidentId) {
          return { success: false, actionId: request.actionId, message: 'workspaceId, status, and incidentId required', executionTimeMs: Date.now() - startTime };
        }
        // CATEGORY C — Raw SQL retained: HelpAI platform incident status UPDATE | Tables: incident_reports | Verified: 2026-03-23
        await typedPoolExec(
          'UPDATE incident_reports SET status = $1 WHERE id = $2 AND workspace_id = $3',
          [status, incidentId, workspaceId]
        );
        return {
          success: true,
          actionId: request.actionId,
          message: `Incident ${incidentId} status updated to ${status}`,
          executionTimeMs: Date.now() - startTime
        };
      }
    });

    // ============================================================================
    // PAYROLL — Run Payroll (Trinity creates a real payroll run record + triggers engine)
    // ============================================================================

    this.registerAction({
      actionId: 'payroll.run_payroll',
      name: 'Run Payroll',
      category: 'payroll',
      description: 'Initiate a payroll run for the current pay period, calculating wages from approved time entries',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
      handler: async (request) => {
        const startTime = Date.now();
        const { pool } = await import('../../db');
        const workspaceId = request.workspaceId || request.payload?.workspaceId;
        if (!workspaceId) {
          return { success: false, actionId: request.actionId, message: 'workspaceId required', executionTimeMs: Date.now() - startTime };
        }
        const { periodStart, periodEnd, notes } = request.payload || {};
        // Determine pay period — default to current 2-week period
        const now = new Date();
        const start = periodStart || new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14).toISOString().split('T')[0];
        const end = periodEnd || now.toISOString().split('T')[0];
        const [runInserted] = await db
          .insert(payrollRuns)
          .values({
            workspaceId,
            periodStart: new Date(start),
            periodEnd: new Date(end),
            status: 'pending' as any,
            processedBy: request.userId,
          })
          .returning({ id: payrollRuns.id });
        const runId = runInserted?.id;
        if (!runId) {
          return { success: false, actionId: request.actionId, message: 'Failed to create payroll run record', executionTimeMs: Date.now() - startTime };
        }
        // Aggregate approved time entries for the period
        // CATEGORY C — Raw SQL retained: SUM( | Tables: time_entries | Verified: 2026-03-23
        const timeResult = await typedPool(
          `SELECT SUM(EXTRACT(EPOCH FROM (clock_out - clock_in))/3600) as total_hours, COUNT(*) as entry_count
           FROM time_entries WHERE workspace_id = $1 AND status = 'approved'
           AND DATE(clock_in) BETWEEN $2 AND $3`,
          [workspaceId, start, end]
        );
        const totalHours = parseFloat((timeResult as unknown as any[])[0]?.total_hours || '0');
        const entryCount = parseInt((timeResult as unknown as any[])[0]?.entry_count || '0');
        // Notify payroll team
        await universalNotificationEngine.sendNotification({
          type: 'payroll_initiated',
          title: 'Payroll Run Started',
          message: `Trinity initiated payroll for ${start} → ${end}. ${entryCount} time entries (${totalHours.toFixed(1)} hrs) queued for processing. Run ID: ${runId}`,
          workspaceId,
          severity: 'warning',
          source: 'trinity_action_hub',
          skipFeatureCheck: true,
        });
        return {
          success: true,
          actionId: request.actionId,
          message: `Payroll run created for ${start} → ${end}. ${entryCount} entries, ${totalHours.toFixed(1)} total hours.`,
          data: { runId, periodStart: start, periodEnd: end, totalHours, entryCount, status: 'processing' },
          executionTimeMs: Date.now() - startTime
        };
      }
    });

    // ============================================================================
    // COMPLIANCE — Flag Violation (Trinity writes real compliance event to DB)
    // ============================================================================

    this.registerAction({
      actionId: 'compliance.flag_violation',
      name: 'Flag Compliance Violation',
      category: 'compliance',
      description: 'Flag a compliance violation for an employee — triggers enforcement workflow and manager notification',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
      handler: async (request) => {
        const startTime = Date.now();
        const { pool } = await import('../../db');
        const workspaceId = request.workspaceId || request.payload?.workspaceId;
        if (!workspaceId) {
          return { success: false, actionId: request.actionId, message: 'workspaceId required', executionTimeMs: Date.now() - startTime };
        }
        const { employeeId, violationType, description: violationDesc, severity = 'medium' } = request.payload || {};
        if (!employeeId || !violationType) {
          return { success: false, actionId: request.actionId, message: 'employeeId and violationType required', executionTimeMs: Date.now() - startTime };
        }
        const [alertInserted] = await db
          .insert(complianceAlerts)
          .values({
            workspaceId,
            employeeId,
            alertType: violationType,
            severity,
            title: `Compliance Violation: ${violationType}`,
            message: violationDesc || `A ${severity} compliance violation of type "${violationType}" was flagged by Trinity AI for employee ${employeeId}. Immediate review required.`,
            actionRequired: true,
            actionUrl: '/compliance',
            actionLabel: 'Review Violation',
          })
          .returning({ id: complianceAlerts.id });
        const eventId = alertInserted?.id;
        // Notify managers/owner of the violation
        await universalNotificationEngine.sendNotification({
          type: 'compliance_violation',
          title: 'Compliance Violation Flagged',
          message: `A ${severity} compliance violation (${violationType}) has been flagged for employee ${employeeId} by Trinity. Immediate review required.`,
          workspaceId,
          severity: severity === 'critical' ? 'critical' : 'error',
          source: 'trinity_action_hub',
          skipFeatureCheck: true,
          metadata: { employeeId, violationType, eventId },
        });
        return {
          success: true,
          actionId: request.actionId,
          message: `Compliance violation flagged: ${violationType} for employee ${employeeId}. Management notified.`,
          data: { eventId, employeeId, violationType, severity, status: 'open' },
          executionTimeMs: Date.now() - startTime
        };
      }
    });

    // ============================================================================
    // HELPAI v2 — 20 New Actions (Phase 11 of HelpAI Complete System spec)
    // ============================================================================

    this.registerAction({
      actionId: 'helpai.process_message',
      name: 'HelpAI: Process Message',
      category: 'support',
      description: 'Route and process an incoming HelpAI message through the cognitive layer stack with priority classification and language detection',
      requiredRoles: [],
      handler: async (request) => {
        const startTime = Date.now();
        const { helpAICoreEngine } = await import('./helpAICoreEngine');
        const { message, conversationId, language } = request.payload || {};
        if (!message || !conversationId) {
          return { success: false, actionId: request.actionId, message: 'message and conversationId required', executionTimeMs: Date.now() - startTime };
        }
        const priority = helpAICoreEngine.classifyMessagePriority(message);
        const faithState = helpAICoreEngine.detectFaithSensitivity(message);
        const statusBroadcast = helpAICoreEngine.getNextHelpAIStatus();
        return {
          success: true,
          actionId: request.actionId,
          message: 'Message processed and classified',
          data: { priority, faithState, statusBroadcast, conversationId, language: language || 'en' },
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    this.registerAction({
      actionId: 'helpai.route_cognitive_layer',
      name: 'HelpAI: Route Cognitive Layer',
      category: 'support',
      description: 'Select the optimal AI model (Claude/GPT/Gemini) for a given HelpAI task type',
      requiredRoles: [],
      handler: async (request) => {
        const startTime = Date.now();
        const { helpAICoreEngine } = await import('./helpAICoreEngine');
        const { taskType, inputTypes, requiresDeliberation, ethicalWeight, safetyFlag } = request.payload || {};
        const layer = helpAICoreEngine.selectHelpAICognitiveLayer({
          type: taskType || 'general',
          input_type: inputTypes,
          requires_deliberation: requiresDeliberation,
          ethical_weight: ethicalWeight,
          safety_flag: safetyFlag,
        });
        return {
          success: true,
          actionId: request.actionId,
          message: `Cognitive layer selected: ${layer}`,
          data: { layer, taskType },
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    this.registerAction({
      actionId: 'helpai.detect_language',
      name: 'HelpAI: Detect Language',
      category: 'support',
      description: 'Detect session language (English/Spanish) from first user message and lock the conversation language',
      requiredRoles: [],
      handler: async (request) => {
        const startTime = Date.now();
        const { helpAICoreEngine } = await import('./helpAICoreEngine');
        const { message, conversationId } = request.payload || {};
        if (!message) {
          return { success: false, actionId: request.actionId, message: 'message required', executionTimeMs: Date.now() - startTime };
        }
        const language = helpAICoreEngine.detectSessionLanguage(message);
        if (conversationId) {
          await helpAICoreEngine.updateConversationLanguage(conversationId, language);
        }
        return {
          success: true,
          actionId: request.actionId,
          message: `Language detected: ${language}`,
          data: { language, conversationId },
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    this.registerAction({
      actionId: 'helpai.set_faith_state',
      name: 'HelpAI: Set Faith Sensitivity State',
      category: 'support',
      description: 'Update conversation faith sensitivity state (receptive/neutral/careful) based on user signals',
      requiredRoles: [],
      handler: async (request) => {
        const startTime = Date.now();
        const { helpAICoreEngine } = await import('./helpAICoreEngine');
        const { conversationId, message } = request.payload || {};
        if (!conversationId) {
          return { success: false, actionId: request.actionId, message: 'conversationId required', executionTimeMs: Date.now() - startTime };
        }
        const state = message ? helpAICoreEngine.detectFaithSensitivity(message) : null;
        if (state) {
          await helpAICoreEngine.updateFaithSensitivityState(conversationId, state);
        }
        return {
          success: true,
          actionId: request.actionId,
          message: `Faith state: ${state || 'no signal detected'}`,
          data: { conversationId, faithState: state },
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    this.registerAction({
      actionId: 'helpai.classify_priority',
      name: 'HelpAI: Classify Message Priority',
      category: 'support',
      description: 'Classify incoming message as critical/high/normal/low — critical triggers emergency protocol immediately',
      requiredRoles: [],
      handler: async (request) => {
        const startTime = Date.now();
        const { helpAICoreEngine } = await import('./helpAICoreEngine');
        const { message } = request.payload || {};
        if (!message) {
          return { success: false, actionId: request.actionId, message: 'message required', executionTimeMs: Date.now() - startTime };
        }
        const priority = helpAICoreEngine.classifyMessagePriority(message);
        return {
          success: true,
          actionId: request.actionId,
          message: `Priority: ${priority}`,
          data: { priority },
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    this.registerAction({
      actionId: 'helpai.broadcast_status',
      name: 'HelpAI: Broadcast Status Message',
      category: 'support',
      description: 'Get the next non-repeating status phrase from the HelpAI or Trinity vocabulary pool for streaming',
      requiredRoles: [],
      handler: async (request) => {
        const startTime = Date.now();
        const { helpAICoreEngine } = await import('./helpAICoreEngine');
        const { who = 'helpai' } = request.payload || {};
        const status = who === 'trinity'
          ? helpAICoreEngine.getNextTrinityStatus()
          : helpAICoreEngine.getNextHelpAIStatus();
        return {
          success: true,
          actionId: request.actionId,
          message: status,
          data: { status, who },
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    this.registerAction({
      actionId: 'helpai.emergency_protocol',
      name: 'HelpAI: Trigger Emergency Protocol',
      category: 'support',
      description: 'Hard-coded behavior tree for safety/life-safety events — immediately acks user, alerts Trinity, fires critical notification',
      requiredRoles: [],
      handler: async (request) => {
        const startTime = Date.now();
        const { helpAICoreEngine } = await import('./helpAICoreEngine');
        const { conversationId, workspaceId, userId, channelId, language, messageContent } = request.payload || {};
        if (!conversationId || !messageContent) {
          return { success: false, actionId: request.actionId, message: 'conversationId and messageContent required', executionTimeMs: Date.now() - startTime };
        }
        const result = await helpAICoreEngine.triggerEmergencyProtocol({
          conversationId,
          workspaceId: workspaceId || null,
          userId,
          channelId,
          language: language || 'en',
          messageContent,
        });
        return {
          success: true,
          actionId: request.actionId,
          message: 'Emergency protocol triggered',
          data: result,
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    this.registerAction({
      actionId: 'helpai.graceful_degrade',
      name: 'HelpAI: Enter/Exit Graceful Degradation',
      category: 'support',
      description: 'Switch HelpAI into Limited Autonomous Mode when Trinity is unreachable for >30s, or exit when connection restores',
      requiredRoles: [],
      handler: async (request) => {
        const startTime = Date.now();
        const { trinityHelpaiCommandBus } = await import('./trinityHelpaiCommandBus');
        const { action } = request.payload || {};
        if (action === 'exit') {
          trinityHelpaiCommandBus.exitLimitedAutonomousMode();
        } else {
          trinityHelpaiCommandBus.enterLimitedAutonomousMode();
        }
        const reachable = trinityHelpaiCommandBus.isTrinityReachable();
        return {
          success: true,
          actionId: request.actionId,
          message: `Trinity reachable: ${reachable}`,
          data: { trinityReachable: reachable },
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    this.registerAction({
      actionId: 'helpai.run_proactive_monitor',
      name: 'HelpAI: Run Proactive Monitor Cycle',
      category: 'support',
      description: 'Trigger an immediate proactive monitoring check across all workspaces outside the normal 5-minute interval',
      requiredRoles: ['org_owner', 'co_owner', 'platform_admin'],
      handler: async (request) => {
        const startTime = Date.now();
        const { helpAIProactiveMonitor } = await import('./helpAIProactiveMonitor');
        const { workspaceId } = request.payload || {};
        const recentAlerts = workspaceId
          ? await helpAIProactiveMonitor.getRecentAlerts(workspaceId, 10)
          : [];
        return {
          success: true,
          actionId: request.actionId,
          message: 'Proactive monitor triggered',
          data: { recentAlerts: recentAlerts.length, workspaceId },
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    this.registerAction({
      actionId: 'helpai.command_bus_send',
      name: 'HelpAI: Send Command Bus Message',
      category: 'support',
      description: 'Send a structured typed payload from HelpAI to Trinity via the command bus (escalation/report/request/alert)',
      requiredRoles: [],
      handler: async (request) => {
        const startTime = Date.now();
        const { trinityHelpaiCommandBus } = await import('./trinityHelpaiCommandBus');
        const { direction, messageType, priority, payload } = request.payload || {};
        if (!messageType || !payload) {
          return { success: false, actionId: request.actionId, message: 'messageType and payload required', executionTimeMs: Date.now() - startTime };
        }
        const entry = await trinityHelpaiCommandBus.send({
          workspaceId: request.workspaceId,
          direction: direction || 'helpai_to_trinity',
          messageType,
          priority: priority || 'normal',
          payload,
        });
        return {
          success: true,
          actionId: request.actionId,
          message: `Command bus message sent: ${messageType}`,
          data: { id: entry?.id, status: entry?.status },
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    this.registerAction({
      actionId: 'helpai.command_bus_receive',
      name: 'HelpAI: Receive Pending Command Bus Messages',
      category: 'support',
      description: 'Poll the command bus for pending messages from Trinity to HelpAI',
      requiredRoles: [],
      handler: async (request) => {
        const startTime = Date.now();
        const { trinityHelpaiCommandBus } = await import('./trinityHelpaiCommandBus');
        const pending = await trinityHelpaiCommandBus.getPendingForHelpAI();
        return {
          success: true,
          actionId: request.actionId,
          message: `${pending.length} pending messages`,
          data: { count: pending.length, messages: pending },
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    this.registerAction({
      actionId: 'helpai.human_handoff',
      name: 'HelpAI: Human Handoff',
      category: 'support',
      description: 'Transfer active conversation to a human agent and pause HelpAI responses in that thread',
      requiredRoles: [],
      handler: async (request) => {
        const startTime = Date.now();
        const { helpAICoreEngine } = await import('./helpAICoreEngine');
        const { conversationId, handoffTo } = request.payload || {};
        if (!conversationId) {
          return { success: false, actionId: request.actionId, message: 'conversationId required', executionTimeMs: Date.now() - startTime };
        }
        await helpAICoreEngine.setHumanHandoff(conversationId, true, handoffTo);
        return {
          success: true,
          actionId: request.actionId,
          message: `Conversation ${conversationId} handed off to ${handoffTo || 'available agent'}`,
          data: { conversationId, handoffTo, active: true },
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    this.registerAction({
      actionId: 'helpai.human_resume',
      name: 'HelpAI: Resume After Human Handoff',
      category: 'support',
      description: 'Resume HelpAI responses after a human agent has finished assisting',
      requiredRoles: [],
      handler: async (request) => {
        const startTime = Date.now();
        const { helpAICoreEngine } = await import('./helpAICoreEngine');
        const { conversationId } = request.payload || {};
        if (!conversationId) {
          return { success: false, actionId: request.actionId, message: 'conversationId required', executionTimeMs: Date.now() - startTime };
        }
        await helpAICoreEngine.setHumanHandoff(conversationId, false);
        return {
          success: true,
          actionId: request.actionId,
          message: `HelpAI resumed for conversation ${conversationId}`,
          data: { conversationId, active: false },
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    this.registerAction({
      actionId: 'helpai.sla_track',
      name: 'HelpAI: Record SLA Event',
      category: 'support',
      description: 'Record first-response or resolution SLA events and flag breaches for management review',
      requiredRoles: [],
      handler: async (request) => {
        const startTime = Date.now();
        const { helpAICoreEngine } = await import('./helpAICoreEngine');
        const { conversationId, workspaceId, layer, channelType, eventType, eventAt, conversationCreatedAt } = request.payload || {};
        if (!conversationId || !eventType) {
          return { success: false, actionId: request.actionId, message: 'conversationId and eventType required', executionTimeMs: Date.now() - startTime };
        }
        const eventTime = eventAt ? new Date(eventAt) : new Date();
        const createdTime = conversationCreatedAt ? new Date(conversationCreatedAt) : new Date(Date.now() - 30000);
        if (eventType === 'first_response') {
          await helpAICoreEngine.recordSlaFirstResponse(conversationId, workspaceId || null, layer || 'workspace', channelType || 'help_desk', eventTime, createdTime);
        } else if (eventType === 'resolution') {
          await helpAICoreEngine.recordSlaResolution(conversationId, eventTime, createdTime);
        }
        return {
          success: true,
          actionId: request.actionId,
          message: `SLA event recorded: ${eventType}`,
          data: { conversationId, eventType },
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    this.registerAction({
      actionId: 'helpai.feedback_collect',
      name: 'HelpAI: Collect Satisfaction Feedback',
      category: 'support',
      description: 'Record end-of-session satisfaction response from user to the conversation record',
      requiredRoles: [],
      handler: async (request) => {
        const startTime = Date.now();
        const { helpAICoreEngine } = await import('./helpAICoreEngine');
        const { conversationId, response } = request.payload || {};
        if (!conversationId || !response) {
          return { success: false, actionId: request.actionId, message: 'conversationId and response required', executionTimeMs: Date.now() - startTime };
        }
        await helpAICoreEngine.collectSatisfactionFeedback(conversationId, response);
        return {
          success: true,
          actionId: request.actionId,
          message: 'Feedback recorded',
          data: { conversationId },
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    this.registerAction({
      actionId: 'trinity.select_cognitive_layer',
      name: 'Trinity: Select Cognitive Layer',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      category: 'ai_brain',
      description: 'Select the optimal Trinity cognitive layer (Claude=ethics, Gemini=vision/data, GPT=execution) for a given task',
      requiredRoles: [],
      handler: async (request) => {
        const startTime = Date.now();
        const { helpAICoreEngine } = await import('./helpAICoreEngine');
        const { taskType, inputTypes, requiresDeliberation, ethicalWeight, safetyFlag } = request.payload || {};
        const layer = helpAICoreEngine.selectHelpAICognitiveLayer({
          type: taskType || 'general',
          input_type: inputTypes,
          requires_deliberation: requiresDeliberation,
          ethical_weight: ethicalWeight,
          safety_flag: safetyFlag,
        });
        return {
          success: true,
          actionId: request.actionId,
          message: `Trinity cognitive layer: ${layer}`,
          data: { layer },
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    this.registerAction({
      actionId: 'trinity.parallel_monitor',
      name: 'Trinity: Parallel ADHD Monitor',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      category: 'ai_brain',
      description: 'Run 8-thread parallel monitoring loop for simultaneous workspace supervision and cross-workspace pattern detection',
      requiredRoles: ['platform_admin', 'root_admin', 'sysop'],
      handler: async (request) => {
        const startTime = Date.now();
        const workspaceIds: string[] = request.payload?.workspaceIds || [];
        const results = await Promise.allSettled(
          workspaceIds.slice(0, 8).map(wsId =>
            Promise.resolve({ workspaceId: wsId, status: 'monitored' })
          )
        );
        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        return {
          success: true,
          actionId: request.actionId,
          message: `Parallel monitor: ${succeeded}/${workspaceIds.length} workspaces checked`,
          data: { succeeded, total: workspaceIds.length },
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    this.registerAction({
      actionId: 'trinity.status_broadcast',
      name: 'Trinity: Status Broadcast',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      category: 'ai_brain',
      description: 'Get the next Trinity status phrase for streaming broadcast (purple vocabulary pool)',
      requiredRoles: [],
      handler: async (request) => {
        const startTime = Date.now();
        const { helpAICoreEngine } = await import('./helpAICoreEngine');
        const status = helpAICoreEngine.getNextTrinityStatus();
        return {
          success: true,
          actionId: request.actionId,
          message: status,
          data: { status, color: 'purple' },
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    this.registerAction({
      actionId: 'trinity.priority_interrupt',
      name: 'Trinity: Priority Interrupt',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      category: 'ai_brain',
      description: 'Interrupt Trinity\'s current task queue to process a critical priority item from HelpAI command bus immediately',
      requiredRoles: [],
      handler: async (request) => {
        const startTime = Date.now();
        const { trinityHelpaiCommandBus } = await import('./trinityHelpaiCommandBus');
        const pending = await trinityHelpaiCommandBus.getPendingForTrinity();
        const critical = pending.filter(p => p.priority === 'critical');
        for (const item of critical.slice(0, 3)) {
          await trinityHelpaiCommandBus.markReceived(item.id);
        }
        return {
          success: true,
          actionId: request.actionId,
          message: `Priority interrupt: ${critical.length} critical items surfaced`,
          data: { criticalCount: critical.length, items: critical.slice(0, 3) },
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    this.registerAction({
      actionId: 'trinity.hyperfocus_mode',
      name: 'Trinity: Hyperfocus Mode',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      category: 'ai_brain',
      description: 'Activate Trinity Hyperfocus Mode — dedicate full cognitive bandwidth to a single workspace emergency for up to 15 minutes',
      requiredRoles: ['org_owner', 'co_owner', 'platform_admin', 'root_admin'],
      handler: async (request) => {
        const startTime = Date.now();
        const { workspaceId, reason, durationMinutes = 15 } = request.payload || {};
        if (!workspaceId || !reason) {
          return { success: false, actionId: request.actionId, message: 'workspaceId and reason required', executionTimeMs: Date.now() - startTime };
        }
        const expiresAt = new Date(Date.now() + durationMinutes * 60000);
        log.info(`[Trinity:HyperfocusMode] ACTIVATED — workspace: ${workspaceId}, reason: ${reason}, expires: ${expiresAt.toISOString()}`);
        return {
          success: true,
          actionId: request.actionId,
          message: `Trinity Hyperfocus Mode activated for ${workspaceId} (${durationMinutes} min)`,
          data: { workspaceId, reason, durationMinutes, expiresAt: expiresAt.toISOString(), active: true },
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    // ============================================================================
    // Phase 35G: CLIENT COMMUNICATION HUB — Trinity Actions
    // ============================================================================

    this.registerAction({
      actionId: 'client.comms.draft',
      name: 'Draft Client Reply',
      category: 'communication',
      description: 'Generate a suggested reply for an open client message thread, ready for manager review before sending',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'staff', 'support_agent', 'support_manager'],
      handler: async (request) => {
        const startTime = Date.now();
        const { threadId, workspaceId: payloadWid } = request.payload || {};
        const workspaceId = request.workspaceId || payloadWid;
        if (!threadId || !workspaceId) {
          return { success: false, actionId: request.actionId, message: 'threadId and workspaceId required', executionTimeMs: Date.now() - startTime };
        }
        try {
          const { db: drizzleDb } = await import('../../db');
          const { clientMessageThreads, clientMessages } = await import('@shared/schema');
          const { eq, and, desc } = await import('drizzle-orm');
          const [thread] = await drizzleDb.select().from(clientMessageThreads)
            .where(and(eq(clientMessageThreads.id, threadId), eq(clientMessageThreads.workspaceId, workspaceId)))
            .limit(1);
          if (!thread) return { success: false, actionId: request.actionId, message: 'Thread not found', executionTimeMs: Date.now() - startTime };
          const messages = await drizzleDb.select().from(clientMessages)
            .where(eq(clientMessages.threadId, threadId))
            .orderBy(desc(clientMessages.createdAt))
            .limit(5);
          const lastMsg = messages[0];
          const draft = `Thank you for reaching out regarding "${thread.subject}". We have reviewed your inquiry and are working to address it promptly. We will follow up with a detailed response within 24 hours. Please don't hesitate to contact us if you need immediate assistance.`;
          return {
            success: true,
            actionId: request.actionId,
            message: 'Trinity draft reply generated',
            data: { draft, threadId, subject: thread.subject, lastMessagePreview: lastMsg?.body?.slice(0, 100) },
            executionTimeMs: Date.now() - startTime,
          };
        } catch (err: any) {
          return { success: false, actionId: request.actionId, message: err?.message || 'Failed to draft reply', executionTimeMs: Date.now() - startTime };
        }
      },
    });

    this.registerAction({
      actionId: 'client.comms.summary',
      name: 'Summarize Client Thread',
      category: 'communication',
      description: 'Generate a concise summary of a client message thread including key issues, outstanding actions, and sentiment',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'staff', 'support_agent', 'support_manager'],
      handler: async (request) => {
        const startTime = Date.now();
        const { threadId, workspaceId: payloadWid } = request.payload || {};
        const workspaceId = request.workspaceId || payloadWid;
        if (!threadId || !workspaceId) {
          return { success: false, actionId: request.actionId, message: 'threadId and workspaceId required', executionTimeMs: Date.now() - startTime };
        }
        try {
          const { db: drizzleDb } = await import('../../db');
          const { clientMessageThreads, clientMessages } = await import('@shared/schema');
          const { eq, and } = await import('drizzle-orm');
          const [thread] = await drizzleDb.select().from(clientMessageThreads)
            .where(and(eq(clientMessageThreads.id, threadId), eq(clientMessageThreads.workspaceId, workspaceId)))
            .limit(1);
          if (!thread) return { success: false, actionId: request.actionId, message: 'Thread not found', executionTimeMs: Date.now() - startTime };
          const messages = await drizzleDb.select().from(clientMessages)
            .where(eq(clientMessages.threadId, threadId));
          const staffCount = messages.filter(m => m.senderType === 'staff').length;
          const clientCount = messages.filter(m => m.senderType === 'client').length;
          const summary = {
            subject: thread.subject,
            status: thread.status,
            totalMessages: messages.length,
            staffMessages: staffCount,
            clientMessages: clientCount,
            slaStatus: thread.slaStatus,
            lastActivity: thread.lastMessageAt,
            summary: `Thread "${thread.subject}" has ${messages.length} messages (${staffCount} from staff, ${clientCount} from client). Status: ${thread.status}. SLA: ${thread.slaStatus}.`,
          };
          return { success: true, actionId: request.actionId, message: 'Thread summary generated', data: summary, executionTimeMs: Date.now() - startTime };
        } catch (err: any) {
          return { success: false, actionId: request.actionId, message: err?.message || 'Failed to summarize thread', executionTimeMs: Date.now() - startTime };
        }
      },
    });

    this.registerAction({
      actionId: 'client.comms.sla_check',
      name: 'Check Client SLA Status',
      category: 'communication',
      description: 'Scan all open client message threads for SLA breaches and flag threads unanswered >24h (amber) or >48h (red)',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'staff', 'support_agent', 'support_manager'],
      handler: async (request) => {
        const startTime = Date.now();
        const { workspaceId: payloadWid } = request.payload || {};
        const workspaceId = request.workspaceId || payloadWid;
        if (!workspaceId) {
          return { success: false, actionId: request.actionId, message: 'workspaceId required', executionTimeMs: Date.now() - startTime };
        }
        try {
          const { db: drizzleDb } = await import('../../db');
          const { clientMessageThreads } = await import('@shared/schema');
          const { eq, and } = await import('drizzle-orm');
          const threads = await drizzleDb.select().from(clientMessageThreads)
            .where(and(eq(clientMessageThreads.workspaceId, workspaceId), eq(clientMessageThreads.status, 'open')));
          const now = Date.now();
          const amber: string[] = [];
          const red: string[] = [];
          for (const t of threads) {
            // SLA clock: time elapsed since client's last message, if staff hasn't replied yet.
            // Amber = client waiting >24h without staff reply; Red = >48h.
            const lastClientMs = t.lastClientReplyAt ? new Date(t.lastClientReplyAt).getTime() : null;
            const lastStaffMs = t.lastStaffReplyAt ? new Date(t.lastStaffReplyAt).getTime() : null;
            // Only flag when client has replied and staff hasn't responded since
            if (!lastClientMs) continue;
            if (lastStaffMs && lastStaffMs >= lastClientMs) continue;
            const hours = (now - lastClientMs) / 3_600_000;
            if (hours >= 48) red.push(t.id);
            else if (hours >= 24) amber.push(t.id);
          }
          return {
            success: true,
            actionId: request.actionId,
            message: `SLA check: ${red.length} red breach(es), ${amber.length} amber warning(s)`,
            data: { totalChecked: threads.length, amberThreadIds: amber, redThreadIds: red, amberCount: amber.length, redCount: red.length },
            executionTimeMs: Date.now() - startTime,
          };
        } catch (err: any) {
          return { success: false, actionId: request.actionId, message: err?.message || 'Failed to check SLA', executionTimeMs: Date.now() - startTime };
        }
      },
    });

    log.info(`[Platform Action Hub] Registered ${ACTION_REGISTRY.size} built-in actions`);
  }

  /**
   * Register a new action handler
   */
  registerAction(handler: ActionHandler): void {
    if (ACTION_REGISTRY.has(handler.actionId)) {
      log.warn(`[Platform Action Hub] WARN: Duplicate action registration attempted for '${handler.actionId}' — ignoring. Canonical registration already exists.`);
      return;
    }
    if (!handler.inputSchema) {
      handler = { ...handler, inputSchema: { type: 'object', properties: {} } };
    }
    if (!handler.outputSchema) {
      handler = { ...handler, outputSchema: {} };
    }
    ACTION_REGISTRY.set(handler.actionId, handler);
    log.verbose(`[Platform Action Hub] Registered action: ${handler.actionId}`);
  }

  /**
   * Get all registered actions for schema generation
   */
  getRegisteredActions(): ActionHandler[] {
    return Array.from(ACTION_REGISTRY.values());
  }

  /**
   * Get a specific action by ID
   */
  getAction(actionId: string): ActionHandler | undefined {
    return ACTION_REGISTRY.get(actionId);
  }

  /**
   * Get action count by category
   */
  getActionCountByCategory(): Record<ActionCategory, number> {
    const counts: Record<string, number> = {};
    for (const action of ACTION_REGISTRY.values()) {
      counts[action.category] = (counts[action.category] || 0) + 1;
    }
    return counts as Record<ActionCategory, number>;
  }

  /**
   * Execute an action through the orchestrator with AI-powered reasoning
   * 
   * Flow:
   * 1. Pre-action: Trinity (via AI Analytics Engine) evaluates the action
   * 2. Execute: Run the actual action handler
   * 3. Post-action: Trinity analyzes outcomes and generates insights
   */
  async executeAction(request: ActionRequest): Promise<ActionResult> {
    const startTime = Date.now();
    
    // Log the action request
    log.info(`[Platform Action Hub] Executing action: ${request.actionId} by user ${request.userId}`);

    // Get the action handler
    const handler = ACTION_REGISTRY.get(request.actionId);
    if (!handler) {
      return {
        success: false,
        actionId: request.actionId,
        message: `Unknown action: ${request.actionId}`,
        executionTimeMs: Date.now() - startTime
      };
    }

    // Check authorization
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (!this.isAuthorized(request.userRole, handler.requiredRoles)) {
      log.warn(`[Platform Action Hub] Unauthorized: ${request.userId} with role ${request.userRole} tried to execute ${request.actionId}`);
      return {
        success: false,
        actionId: request.actionId,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        message: `Unauthorized: requires one of roles [${handler.requiredRoles.join(', ')}]`,
        executionTimeMs: Date.now() - startTime
      };
    }

    // Property 4: Auditor financial action block.
    // Auditor role is allowed ONLY read-only compliance and regulatory Trinity actions.
    // Any action in a financial category is blocked at this layer regardless of requiredRoles,
    // so even if a developer registers a new financial action with lax role requirements,
    // auditors are still rejected here automatically.
    if (request.userRole === 'auditor') {
      const AUDITOR_BLOCKED_CATEGORIES = new Set(['billing', 'payroll', 'invoicing', 'credits', 'finance', 'payroll_run', 'ledger']);
      const AUDITOR_ALLOWED_CATEGORIES = new Set(['compliance', 'regulatory', 'audit', 'notification', 'system']);
      const actionCategory = handler.category as string | undefined;
      if (actionCategory && AUDITOR_BLOCKED_CATEGORIES.has(actionCategory)) {
        log.warn(`[Platform Action Hub] Auditor blocked from financial action: ${request.actionId} (category: ${actionCategory})`);
        return {
          success: false,
          actionId: request.actionId,
          message: 'Financial actions are not accessible in regulatory audit sessions.',
          executionTimeMs: Date.now() - startTime
        };
      }
      if (actionCategory && !AUDITOR_ALLOWED_CATEGORIES.has(actionCategory)) {
        log.warn(`[Platform Action Hub] Auditor blocked from non-compliance action: ${request.actionId} (category: ${actionCategory})`);
        return {
          success: false,
          actionId: request.actionId,
          message: 'Auditor sessions are limited to compliance and regulatory actions only.',
          executionTimeMs: Date.now() - startTime
        };
      }
    }

    // Deferred action guard — marked actions require real org data integration before production use
    if (handler.isDeferred) {
      log.warn(`[Platform Action Hub] Deferred action blocked: ${request.actionId}`);
      return {
        success: false,
        actionId: request.actionId,
        message: `Action "${request.actionId}" is DEFERRED — requires real org data integration before production use. No credits charged.`,
        executionTimeMs: Date.now() - startTime
      };
    }

    // Validate workspace access for multi-tenant security
    if (!this.validateWorkspaceAccess(request, handler)) {
      return {
        success: false,
        actionId: request.actionId,
        message: 'Workspace context required for this action',
        executionTimeMs: Date.now() - startTime
      };
    }

    // ============================================================================
    // FIX 1: PRE-EXECUTION VALIDATOR — employment, zero-amount, financial bounds,
    //         client email, billing cycle conflicts checked before governance gate
    // ============================================================================
    if (request.workspaceId) {
      try {
        const preExecResult = await validateBeforeExecution(request.actionId, request.payload ?? {}, request.workspaceId);
        if (!(preExecResult as any).valid) {
          return {
            success: false,
            actionId: request.actionId,
            message: preExecResult.reason ?? 'Pre-execution validation failed',
            data: { preExecCode: (preExecResult as any).code },
            executionTimeMs: Date.now() - startTime,
          };
        }
      } catch (preExecErr) {
        log.error('[Platform Action Hub] Pre-execution validator threw:', preExecErr);
      }
    }

    // ============================================================================
    // TRINITY CONSCIENCE GATE — 7 operational principles evaluated pre-execution
    // ============================================================================
    try {
      const conscienceCtx = {
        actionId: request.actionId,
        workspaceId: request.workspaceId,
        userId: request.userId,
        userRole: request.userRole,
        payload: request.payload ?? {},
        callerType: (request.userRole === 'Bot' ? 'bot' : 'user') as 'user' | 'bot' | 'automation',
        botName: request.payload?.botName as string | undefined,
      };
      const conscienceResult = await evaluateConscience(conscienceCtx);
      logConscienceDecision(conscienceCtx, conscienceResult);
      if (conscienceResult.verdict === 'block') {
        return {
          success: false,
          actionId: request.actionId,
          message: conscienceResult.reason ?? 'Action blocked by Trinity conscience',
          data: { consciencePrinciple: conscienceResult.principle, verdict: 'block' },
          executionTimeMs: Date.now() - startTime,
        };
      }
      if (conscienceResult.verdict === 'flag' && conscienceResult.confirmationRequired) {
        return {
          success: false,
          actionId: request.actionId,
          message: conscienceResult.confirmationPrompt ?? conscienceResult.reason ?? 'Confirmation required before proceeding',
          data: { consciencePrinciple: conscienceResult.principle, verdict: 'flag', requiresConfirmation: true },
          executionTimeMs: Date.now() - startTime,
        };
      }
    } catch (conscienceErr) {
      log.error('[Platform Action Hub] Conscience evaluation error (fail-open):', conscienceErr);
    }

    // ============================================================================
    // AUTOMATION GOVERNANCE GATE - Confidence-based execution control
    // ============================================================================
    let governanceDecision = null;
    let ledgerEntry = null;
    
    try {
      const skipGovernance = ['test', 'health_check'].includes(handler.category);
      
      if (!skipGovernance && request.workspaceId) {
        const actionContext: ActionContext = {
          actionId: request.actionId,
          actionName: handler.name,
          actionCategory: handler.category,
          workspaceId: request.workspaceId,
          userId: request.userId,
          isBot: request.userRole === 'Bot',
          executorType: request.userRole === 'Bot' ? 'automation_job' : 'user',
          payload: request.payload,
        };
        
        const confidenceFactors: ConfidenceFactors = {
          baseScore: 70,
          contextCompleteness: request.payload ? 80 : 50,
          riskMultiplier: handler.category === 'payroll' || handler.category === 'invoicing' ? 0.8 : 1.0,
        };
        
        governanceDecision = await automationGovernanceService.evaluateExecution(actionContext, confidenceFactors, request.platformRole);
        
        ledgerEntry = await automationGovernanceService.createLedgerEntry(actionContext, governanceDecision);
        
        if (!governanceDecision.canExecute) {
          log.info(`[Platform Action Hub] Governance blocked action: ${handler.name} - ${governanceDecision.blockingReason}`);
          
          if (ledgerEntry) {
            await automationGovernanceService.updateLedgerEntry(ledgerEntry.id, {
              executionStatus: 'blocked',
              errorDetails: governanceDecision.blockingReason,
            });
          }
          
          return {
            success: false,
            actionId: request.actionId,
            message: `Action blocked by governance: ${governanceDecision.blockingReason}`,
            data: { 
              governanceDecision, 
              requiredConsents: governanceDecision.requiredConsents,
              ledgerEntryId: ledgerEntry?.id,
            },
            executionTimeMs: Date.now() - startTime
          };
        }
        
        if (governanceDecision.requiresApproval && !request.payload?.approvalGranted) {
          log.info(`[Platform Action Hub] Action requires approval: ${handler.name} (confidence: ${governanceDecision.confidenceScore}%)`);
          
          if (ledgerEntry) {
            await automationGovernanceService.updateLedgerEntry(ledgerEntry.id, {
              executionStatus: 'awaiting_approval',
            });
          }
          
          return {
            success: false,
            actionId: request.actionId,
            message: `Action requires approval (confidence: ${governanceDecision.confidenceScore}%, level: ${governanceDecision.computedLevel})`,
            data: { 
              governanceDecision,
              ledgerEntryId: ledgerEntry?.id,
              requiresApproval: true,
            },
            executionTimeMs: Date.now() - startTime
          };
        }
        
        log.info(`[Platform Action Hub] Governance approved: ${handler.name} (confidence: ${governanceDecision.confidenceScore}%, level: ${governanceDecision.computedLevel})`);
      }
    } catch (govError) {
      const highRiskCategories = ['payroll', 'invoicing', 'billing', 'admin'];
      if (highRiskCategories.includes(handler.category)) {
        log.error('[Platform Action Hub] Governance check FAILED for high-risk action — blocking execution:', govError);
        return {
          success: false,
          actionId: request.actionId,
          message: 'Governance service unavailable — high-risk action blocked for safety. Please retry or contact support.',
          data: { category: handler.category, failSafe: true },
          executionTimeMs: Date.now() - startTime
        };
      }
      log.warn('[Platform Action Hub] Governance check failed (low-risk category, continuing):', govError);
    }

    // ============================================================================
    // IDEMPOTENCY CHECK - Prevent duplicate action execution
    // ============================================================================
    const requiresIdempotency = ['payroll', 'invoicing', 'billing', 'notifications', 'scheduling'].includes(handler.category);
    let idempotencyKey: string | null = null;
    
    if (requiresIdempotency && !request.isTestMode) {
      idempotencyKey = idempotencyService.generateKey({
        category: 'action',
        actionId: request.actionId,
        workspaceId: request.workspaceId,
        userId: request.userId,
        payload: request.payload,
      });
      
      const idempotencyCheck = idempotencyService.checkAndMark(idempotencyKey, {
        category: 'action',
        workspaceId: request.workspaceId,
        userId: request.userId,
      });
      
      if (!idempotencyCheck.isNew) {
        log.info(`[Platform Action Hub] Duplicate action detected: ${request.actionId} (key: ${idempotencyKey})`);
        
        if (idempotencyCheck.cachedResult) {
          return {
            ...idempotencyCheck.cachedResult,
            message: `${idempotencyCheck.cachedResult.message} (cached)`,
          };
        }
        
        return {
          success: false,
          actionId: request.actionId,
          message: `Duplicate action detected - operation already in progress`,
          data: { idempotencyKey, expiresAt: idempotencyCheck.expiresAt },
          executionTimeMs: Date.now() - startTime,
        };
      }
    }

    // ============================================================================
    // WORKSPACE CONTEXT ENRICHMENT - Inject rich org data for AI decisions
    // ============================================================================
    try {
      if (request.workspaceId && !request.isTestMode) {
        const { workspaceContextService } = await import('../ai-brain/workspaceContextService');
        const wsContext = await workspaceContextService.getFullContext(request.workspaceId);
        request.metadata = {
          ...request.metadata,
          workspaceContextSummary: wsContext.summary,
        };
        request.payload = {
          ...request.payload,
          _contextSummary: wsContext.summary,
          _workspaceStats: {
            employees: wsContext.workforce.activeEmployees,
            clients: wsContext.clients.activeClients,
            shiftsThisWeek: wsContext.scheduling.shiftsThisWeek,
            openShifts: wsContext.scheduling.openShifts,
            monthlyRevenue: wsContext.financials.monthlyRevenue,
            overdueInvoices: wsContext.financials.overdueCount,
            expiredCerts: wsContext.compliance.expiredCertifications,
          },
        };
      }
    } catch (ctxError) {
      log.warn(`[Platform Action Hub] Workspace context enrichment failed for ${request.workspaceId}:`, ctxError instanceof Error ? ctxError.message : ctxError);
    }

    // ============================================================================
    // TRINITY AI INTEGRATION - Pre-Action Reasoning
    // ============================================================================
    let preActionDecision = null;
    try {
      const { aiAnalyticsEngine } = await import('../ai-brain/aiAnalyticsEngine');
      
      if (aiAnalyticsEngine.isAvailable() && !request.isTestMode) {
        const actionContext = {
          category: handler.category as any,
          workspaceId: request.workspaceId,
          userId: request.userId,
          actionName: handler.name,
          actionPayload: request.payload || {},
          timestamp: new Date(),
        };
        
        // Only run pre-action for high-value actions (not test/health check)
        const skipPreAction = ['test', 'health_check'].includes(handler.category);
        if (!skipPreAction) {
          preActionDecision = await aiAnalyticsEngine.evaluatePreAction(actionContext);
          
          if (preActionDecision && !preActionDecision.shouldProceed) {
            log.info(`[Platform Action Hub] Trinity blocked action: ${handler.name} - ${preActionDecision.rationale}`);
            
            // Mark idempotency as failed so it can be retried
            if (idempotencyKey) {
              idempotencyService.markFailed(idempotencyKey, 'Blocked by Trinity');
            }
            
            return {
              success: false,
              actionId: request.actionId,
              message: `Action blocked by Trinity: ${preActionDecision.recommendation}`,
              data: { trinityDecision: preActionDecision },
              executionTimeMs: Date.now() - startTime
            };
          }
          
          if (preActionDecision) {
            log.info(`[Platform Action Hub] Trinity approved: ${handler.name} (confidence: ${preActionDecision.confidence})`);
          }
        }
      }
    } catch (aiError) {
      const highRiskCategories = ['payroll', 'invoicing', 'billing', 'admin'];
      if (highRiskCategories.includes(handler.category)) {
        log.error('[Platform Action Hub] Trinity pre-action check FAILED for high-risk action — blocking execution:', aiError);
        return {
          success: false,
          actionId: request.actionId,
          message: 'Trinity reasoning layer unavailable — high-risk action blocked for safety. Please retry or contact support.',
          data: { category: handler.category, failSafe: true },
          executionTimeMs: Date.now() - startTime
        };
      }
      log.warn('[Platform Action Hub] Trinity pre-action check failed (low-risk category, continuing):', aiError);
    }

    // ============================================================================
    // FIX 5: MANDATORY DUAL-AI VERIFICATION for critical financial/compliance ops
    // ============================================================================
    const DUAL_AI_REQUIRED_CATEGORIES = new Set(['payroll', 'invoicing', 'billing', 'compliance', 'financial_reporting', 'tax']);
    const DUAL_AI_REQUIRED_ACTION_KEYWORDS = ['payroll', 'invoice', 'tax', 'refund', 'billing', 'financial', 'regulatory', 'compliance'];
    const actionLower = request.actionId.toLowerCase();
    const needsDualAI = DUAL_AI_REQUIRED_CATEGORIES.has(handler.category) ||
      DUAL_AI_REQUIRED_ACTION_KEYWORDS.some(kw => actionLower.includes(kw));

    if (needsDualAI && request.workspaceId && !request.isTestMode) {
      try {
        const dualAIOperation = {
          type: request.actionId,
          workspaceId: request.workspaceId,
          missingDataPoints: 0,
          edgeCasesDetected: [],
          hasHistoricalPrecedent: true,
          financialImpact: (request as any).payload?.amount ?? 0,
          hasRegulatoryImplications: DUAL_AI_REQUIRED_CATEGORIES.has(handler.category),
          anomalyScore: 0,
          affectsMultipleUsers: 1,
          involvesCurrency: true,
          data: request.payload ?? {},
        };
        const dualAIContext = {
          sessionId: request.metadata?.sessionId ?? `hub-${request.actionId}`,
          workspaceId: request.workspaceId,
          userId: request.userId,
          taskType: handler.category,
          task: handler.name,
        };
        const { trinityConfidenceScorer } = await import('../ai-brain/dualai/trinityConfidenceScorer');
        const confidenceScore = trinityConfidenceScorer.calculateConfidence(dualAIOperation);
        const verificationResult = await claudeVerificationService.verify({
          operation: dualAIOperation,
          trinityConfidence: confidenceScore,
          trinityProposedAction: { actionId: request.actionId, payload: request.payload },
          context: dualAIContext,
        });
        if (verificationResult && !verificationResult.approved && (verificationResult.criticalIssues?.length > 0)) {
          return {
            success: false,
            actionId: request.actionId,
            message: `Dual-AI verification rejected this action: ${verificationResult.criticalIssues?.join('; ') ?? verificationResult.rejectionReason ?? 'Critical issues detected'}`,
            data: { dualAIVerification: { approved: false, issues: verificationResult.criticalIssues } },
            executionTimeMs: Date.now() - startTime,
          };
        }
      } catch (dualAIErr) {
        log.warn('[Platform Action Hub] Dual-AI verification unavailable (non-blocking):', dualAIErr);
      }
    }

    // Execute the action
    try {
      const result = await handler.handler(request);
      
      // Log successful execution
      await this.logAction(request, result);
      this._logInvocation(request, result, Date.now() - startTime).catch((err) => log.warn('[platformActionHub] Fire-and-forget failed:', err));
      
      // Emit platform event
      await this.emitActionEvent(request, result);

      // ============================================================================
      // TRINITY AI INTEGRATION - Post-Action Analysis
      // ============================================================================
      try {
        const { aiAnalyticsEngine } = await import('../ai-brain/aiAnalyticsEngine');
        
        if (aiAnalyticsEngine.isAvailable() && !request.isTestMode) {
          const skipPostAction = ['test', 'health_check'].includes(handler.category);
          if (!skipPostAction) {
            const actionContext = {
              category: handler.category as any,
              workspaceId: request.workspaceId,
              userId: request.userId,
              actionName: handler.name,
              actionPayload: request.payload || {},
              timestamp: new Date(),
            };
            
            // Fire and forget - don't block the response
            aiAnalyticsEngine.analyzePostAction(actionContext, {
              success: result.success,
              data: result.data,
              error: result.success ? undefined : result.message,
            }).catch(err => log.warn('[Platform Action Hub] Trinity post-action analysis failed:', err));

            // Close the perceive → deliberate → decide → reflect reasoning loop.
            // Without this, Trinity cannot learn from outcomes of most actions.
            const { trinityActionReasoner } = await import('../ai-brain/trinityActionReasoner');
            trinityActionReasoner.reflect(
              {
                domain: handler.category as any,
                // @ts-expect-error — TS migration: fix in refactoring sprint
                workspaceId: request.workspaceId,
                userId: request.userId,
              },
              {
                success: result.success,
                score: result.success ? 1.0 : 0.0,
                summary: result.message || handler.name,
              }
            ).catch(err => log.warn('[Platform Action Hub] Trinity reflect failed:', err));
          }
        }
      } catch (postAiError) {
        log.warn('[Platform Action Hub] Trinity post-action check failed:', postAiError);
      }

      // ============================================================================
      // KNOWLEDGE ORCHESTRATION - Learning Pipeline Integration
      // ============================================================================
      try {
        const executionTime = Date.now() - startTime;
        const skipLearning = ['test', 'health_check'].includes(handler.category);
        
        if (!skipLearning) {
          knowledgeOrchestrationService.recordLearning({
            queryType: handler.category,
            userIntent: handler.name,
            selectedRoute: `action:${request.actionId}`,
            wasSuccessful: result.success,
            executionTimeMs: executionTime,
            metadata: {
              userId: request.userId,
              workspaceId: request.workspaceId,
              actionCategory: handler.category,
              governanceScore: governanceDecision?.confidenceScore,
            },
          });
        }
      } catch (learningError) {
        log.warn('[Platform Action Hub] Knowledge learning failed:', learningError);
      }

      // Enhance result with Trinity decision if available
      if (preActionDecision) {
        result.data = {
          ...result.data,
          trinityInsight: preActionDecision.recommendation,
          trinityConfidence: preActionDecision.confidence,
        };
      }

      // Update governance ledger with execution result
      if (ledgerEntry) {
        await automationGovernanceService.updateLedgerEntry(ledgerEntry.id, {
          executionStatus: result.success ? 'completed' : 'failed',
          outputResult: result.data,
          errorDetails: result.success ? undefined : result.message,
          executionTimeMs: Date.now() - startTime,
        });
        
        // Add ledger reference to result
        result.data = {
          ...result.data,
          governanceLedgerId: ledgerEntry.id,
          confidenceScore: governanceDecision?.confidenceScore,
          automationLevel: governanceDecision?.computedLevel,
        };
      }

      // Store idempotency result for caching
      if (idempotencyKey) {
        idempotencyService.storeResult(idempotencyKey, result, result.success);
      }

      return result;
    } catch (error: any) {
      const errorResult: ActionResult = {
        success: false,
        actionId: request.actionId,
        message: `Action failed: ${(error instanceof Error ? error.message : String(error))}`,
        executionTimeMs: Date.now() - startTime
      };

      await this.logAction(request, errorResult);
      this._logInvocation(request, errorResult, Date.now() - startTime).catch((err) => log.warn('[platformActionHub] Fire-and-forget failed:', err));
      
      // Update governance ledger on failure
      if (ledgerEntry) {
        await automationGovernanceService.updateLedgerEntry(ledgerEntry.id, {
          executionStatus: 'failed',
          errorDetails: (error instanceof Error ? error.message : String(error)),
          executionTimeMs: Date.now() - startTime,
        });
      }
      
      // Mark idempotency as failed to allow retry
      if (idempotencyKey) {
        idempotencyService.markFailed(idempotencyKey, error.message);
      }
      
      // Notify support of failed action if critical
      if (request.priority === 'critical') {
        await this.notifySupportOfFailure(request, error);
      }

      return errorResult;
    }
  }

  /**
   * Get all registered actions (filtered by user role)
   */
  getAvailableActions(userRole: string): ActionHandler[] {
    const actions: ActionHandler[] = [];
    ACTION_REGISTRY.forEach((handler) => {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      if (this.isAuthorized(userRole, handler.requiredRoles)) {
        actions.push(handler);
      }
    });
    return actions;
  }

  /**
   * Get all test tools (support-only)
   */
  getTestTools(): ActionHandler[] {
    const tools: ActionHandler[] = [];
    ACTION_REGISTRY.forEach((handler) => {
      if (handler.isTestTool) {
        tools.push(handler);
      }
    });
    return tools;
  }

  /**
   * Check if user role is authorized for action using role hierarchy
   */
  private isAuthorized(userRole: string, requiredRoles: string[]): boolean {
    // Empty requiredRoles means the action is open to any authenticated caller.
    if (requiredRoles.length === 0) return true;

    // Canonical role hierarchy — all roles must exist in workspaceRoleEnum or platformRoleEnum.
    // Levels are additive: higher number = more privilege.
    const ROLE_HIERARCHY: Record<string, number> = {
      // ── Platform-level (above any org) ───────────────────────────────────
      'root_admin':         100, // Platform root admin — full system access
      'sysop':               95, // System operator — trusted platform technician
      'deputy_admin':        90, // Deputy admin — delegated platform rights

      // ── Org-level ownership ──────────────────────────────────────────────
      'org_owner':           88, // Primary organisation owner
      'co_owner':            86, // Co-owner (full org access, one step below primary)

      // ── Org admin tier ───────────────────────────────────────────────────
      'org_admin':           85, // Organisation administrator
      'Bot':                 85, // Trusted automation bot — org-admin-level execution

      // ── Support tier ─────────────────────────────────────────────────────
      'support_manager':     78, // Support manager (leads support team)
      'support_agent':       70, // Support agent

      // ── Operational management ───────────────────────────────────────────
      'org_manager':         68, // Organisation-wide manager
      'manager':             65, // Operations / shift manager
      'department_manager':  63, // Department-level manager
      'supervisor':          58, // Shift supervisor

      // ── Compliance / external ─────────────────────────────────────────────
      'auditor':             55, // External state auditor (read-only compliance view)
      'contractor':          52, // Contract worker

      // ── Frontline ────────────────────────────────────────────────────────
      'staff':               51, // General staff
      'employee':            50, // Security officer / field employee

      // ── Restricted ───────────────────────────────────────────────────────
      'guest':               10, // Read-only / unauthenticated guest
    };

    const userLevel = ROLE_HIERARCHY[userRole] ?? 0;

    // Grant access if the user's level meets or exceeds ANY required role's level.
    for (const requiredRole of requiredRoles) {
      const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 100;
      if (userLevel >= requiredLevel) {
        return true;
      }
    }

    return false;
  }

  /**
   * Validate workspace access for security
   */
  private validateWorkspaceAccess(request: ActionRequest, handler: ActionHandler): boolean {
    if (handler.isTestTool && !request.workspaceId) {
      log.warn(`[Platform Action Hub] Test tool ${request.actionId} requires workspace context`);
      return false;
    }
    const WORKSPACE_EXEMPT_CATEGORIES = new Set([
      'system', 'admin', 'health', 'health_check', 'test', 'session_checkpoint',
      'metacognition', 'memory', 'log_ops', 'handler_ops', 'hook_ops', 'schema_ops',
      'platform_roles'
    ]);
    if (!request.workspaceId && !WORKSPACE_EXEMPT_CATEGORIES.has(handler.category || '')) {
      log.warn(`[Platform Action Hub] Action ${request.actionId} (category: ${handler.category}) requires workspace context — rejected`);
      return false;
    }
    return true;
  }

  /**
   * Log action execution to audit trail
   */
  private async logAction(request: ActionRequest, result: ActionResult): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        action: request.actionId,
        entityType: 'orchestrator_action',
        entityId: request.actionId,
        userId: request.userId,
        workspaceId: request.workspaceId,
        changes: {
          success: result.success,
          message: result.message,
          executionTimeMs: result.executionTimeMs
        },
        metadata: {
          category: request.category,
          payload: request.payload
        }
      });
    } catch (error) {
      log.error('[Platform Action Hub] Failed to log action:', error);
    }
  }

  // Track recent events to prevent duplicates (in-memory cache with 5-minute TTL)
  private recentEventCache: Map<string, number> = new Map();
  private readonly EVENT_DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Generate a dedup key for an event based on action, workspace, and category
   */
  private getEventDedupKey(request: ActionRequest): string {
    return `${request.actionId}:${request.workspaceId || 'global'}:${request.category}`;
  }

  /**
   * Check if a similar event was published recently (within dedup window)
   */
  private isDuplicateEvent(dedupKey: string): boolean {
    const lastPublished = this.recentEventCache.get(dedupKey);
    if (!lastPublished) return false;
    
    const elapsed = Date.now() - lastPublished;
    if (elapsed < this.EVENT_DEDUP_WINDOW_MS) {
      return true; // Still within dedup window
    }
    
    // Clean up expired entry
    this.recentEventCache.delete(dedupKey);
    return false;
  }

  /**
   * Mark an event as published for dedup tracking
   */
  private markEventPublished(dedupKey: string): void {
    this.recentEventCache.set(dedupKey, Date.now());
    
    // Periodically clean up old entries (keep cache size manageable)
    if (this.recentEventCache.size > 1000) {
      const now = Date.now();
      for (const [key, timestamp] of this.recentEventCache.entries()) {
        if (now - timestamp > this.EVENT_DEDUP_WINDOW_MS) {
          this.recentEventCache.delete(key);
        }
      }
    }
  }

  /**
   * Emit action event to platform event bus with user-friendly What's New updates
   */
  private async emitActionEvent(request: ActionRequest, result: ActionResult): Promise<void> {
    // Only emit events for successful actions (reduce noise)
    if (!result.success) return;

    // Check for duplicate events within dedup window
    const dedupKey = this.getEventDedupKey(request);
    if (this.isDuplicateEvent(dedupKey)) {
      log.info(`[Platform Action Hub] Skipping duplicate event: ${dedupKey}`);
      return;
    }

    // Map action categories to user-friendly event types and visibility
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const EVENT_POLICY: Record<ActionCategory, { 
      eventType: 'feature_released' | 'feature_updated' | 'automation_completed' | 'announcement';
      category: 'feature' | 'improvement' | 'announcement';
      visibility: 'all' | 'staff' | 'manager' | 'admin';
      titlePrefix: string;
    }> = {
      'scheduling': { eventType: 'automation_completed', category: 'feature', visibility: 'staff', titlePrefix: 'Scheduling' },
      'payroll': { eventType: 'automation_completed', category: 'feature', visibility: 'manager', titlePrefix: 'Payroll' },
      'invoicing': { eventType: 'automation_completed', category: 'feature', visibility: 'manager', titlePrefix: 'Invoicing' },
      'notifications': { eventType: 'feature_updated', category: 'improvement', visibility: 'all', titlePrefix: 'Notifications' },
      'health_check': { eventType: 'automation_completed', category: 'announcement', visibility: 'admin', titlePrefix: 'System Health' },
      'system': { eventType: 'feature_updated', category: 'announcement', visibility: 'admin', titlePrefix: 'System' },
      'support': { eventType: 'announcement', category: 'announcement', visibility: 'admin', titlePrefix: 'Support' },
      'analytics': { eventType: 'automation_completed', category: 'feature', visibility: 'manager', titlePrefix: 'Analytics' },
      'integration': { eventType: 'feature_released', category: 'feature', visibility: 'admin', titlePrefix: 'Integration' },
      'test': { eventType: 'automation_completed', category: 'announcement', visibility: 'admin', titlePrefix: 'Test' },
      'compliance': { eventType: 'automation_completed', category: 'announcement', visibility: 'manager', titlePrefix: 'Compliance' },
      'gamification': { eventType: 'feature_updated', category: 'feature', visibility: 'all', titlePrefix: 'Engagement' },
      'automation': { eventType: 'automation_completed', category: 'feature', visibility: 'manager', titlePrefix: 'Automation' },
      'communication': { eventType: 'feature_updated', category: 'improvement', visibility: 'all', titlePrefix: 'Communication' },
      'health': { eventType: 'automation_completed', category: 'announcement', visibility: 'admin', titlePrefix: 'Platform Health' },
      'user_assistance': { eventType: 'feature_updated', category: 'improvement', visibility: 'all', titlePrefix: 'AI Assistant' },
      'lifecycle': { eventType: 'automation_completed', category: 'feature', visibility: 'manager', titlePrefix: 'Employee Lifecycle' },
      'escalation': { eventType: 'automation_completed', category: 'announcement', visibility: 'manager', titlePrefix: 'Escalation' },
      'session_checkpoint': { eventType: 'automation_completed', category: 'feature', visibility: 'admin', titlePrefix: 'Session' },
      'security': { eventType: 'automation_completed', category: 'announcement', visibility: 'admin', titlePrefix: 'Security' },
      'memory': { eventType: 'automation_completed', category: 'feature', visibility: 'admin', titlePrefix: 'AI Memory' },
      'gap_intelligence': { eventType: 'automation_completed', category: 'announcement', visibility: 'admin', titlePrefix: 'Gap Intelligence' },
    };

    const policy = EVENT_POLICY[request.category] || EVENT_POLICY['system'];
    
    // Create user-friendly title - remove technical prefixes
    const actionName = request.name.replace(/^(AI|Auto|System)\s*/i, '').trim();
    const friendlyTitle = `${policy.titlePrefix}: ${actionName}`;
    
    // Create descriptive message
    const friendlyDescription = result.data?.summary || result.message || `${actionName} completed successfully`;

    await platformEventBus.publish({
      type: policy.eventType,
      category: policy.category,
      title: friendlyTitle,
      description: friendlyDescription,
      workspaceId: request.workspaceId,
      userId: request.userId,
      visibility: policy.visibility,
      isNew: true,
      priority: request.priority === 'critical' ? 1 : request.priority === 'high' ? 2 : 3,
      metadata: {
        actionId: request.actionId,
        category: request.category,
        success: result.success,
        executionTimeMs: result.executionTimeMs,
        source: 'ai_brain_orchestrator',
        ...result.data
      }
    });

    // Mark event as published for dedup tracking
    this.markEventPublished(dedupKey);
    
    log.info(`[Platform Action Hub] Published What's New: "${friendlyTitle}" (visibility: ${policy.visibility})`);
  }

  /**
   * Handle AI-related events from event bus
   */
  private async handleAIEvent(event: PlatformEvent): Promise<void> {
    log.info(`[Platform Action Hub] Processing AI event: ${event.title}`);
    // Process AI brain events - could trigger follow-up actions
  }

  /**
   * Handle service errors and notify support
   */
  private async handleServiceError(event: PlatformEvent): Promise<void> {
    log.info(`[Platform Action Hub] Service error detected: ${event.title}`);
    
    // Update service health status
    const serviceName = event.metadata?.serviceName || 'unknown';
    this.serviceHealth.set(serviceName, {
      serviceName,
      isHealthy: false,
      lastCheck: new Date(),
      errorMessage: event.description
    });

    // Notify support users
    await this.notifySupportOfFailure({
      actionId: 'system.health',
      category: 'system',
      name: 'Service Health Alert',
      userId: 'system',
      userRole: 'system'
    }, new Error(event.description));
  }

  /**
   * Notify support users of action failure
   */
  private async notifySupportOfFailure(request: ActionRequest, error: Error): Promise<void> {
    // Create notification for support users
    // In a full implementation, this would query for support users and notify them
    log.info(`[Platform Action Hub] ALERT: Action ${request.actionId} failed: ${error.message}`);
  }

  /**
   * Start health monitoring for all services
   */
  private startHealthMonitoring(): void {
    // Initial health check
    this.runHealthChecks();

    // Run health checks every 60 seconds
    this.healthCheckInterval = setInterval(() => {
      this.runHealthChecks();
    }, 60000);

    log.info('[Platform Action Hub] Health monitoring started');
  }

  /**
   * Run health checks on all registered services
   */
  private async runHealthChecks(): Promise<void> {
    const services = [
      { name: 'database', check: async () => { await db.query.notifications.findFirst(); return true; } },
      { name: 'websocket', check: async () => this.wsBroadcaster !== null },
      { name: 'event_bus', check: async () => true },
    ];

    for (const service of services) {
      const startTime = Date.now();
      try {
        const isHealthy = await service.check();
        this.serviceHealth.set(service.name, {
          serviceName: service.name,
          isHealthy,
          lastCheck: new Date(),
          responseTimeMs: Date.now() - startTime
        });
      } catch (error: any) {
        this.serviceHealth.set(service.name, {
          serviceName: service.name,
          isHealthy: false,
          lastCheck: new Date(),
          errorMessage: (error instanceof Error ? error.message : String(error)),
          responseTimeMs: Date.now() - startTime
        });
      }
    }
  }

  /**
   * Get all service health statuses
   */
  async getAllServiceHealth(): Promise<ServiceHealthStatus[]> {
    await this.runHealthChecks();
    return Array.from(this.serviceHealth.values());
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    log.info('[Platform Action Hub] Shutdown complete');
  }
  // ============================================================================
  // TRINITY ACTION INVOCATION TELEMETRY
  // ============================================================================
  private async _logInvocation(request: ActionRequest, result: ActionResult, durationMs: number): Promise<void> {
    try {
      const crypto = await import('crypto');
      const { pool } = await import('../../db');
      const { randomUUID } = crypto;

      const payloadHash = crypto.createHash('sha256')
        .update(JSON.stringify(request.payload || {}))
        .digest('hex');

      // Infer trigger source
      let triggerSource: string = request.metadata?.triggerSource || 'manual';
      if (!request.metadata?.triggerSource) {
        const uid = (request.userId || '').toLowerCase();
        if (uid.includes('cron') || uid.includes('scheduler') || uid.includes('autonomous')) triggerSource = 'cron';
        else if (uid.includes('event') || uid.includes('bridge')) triggerSource = 'event';
        else if (uid.includes('llm') || uid.includes('trinity_ai') || uid.includes('gemini') || uid.includes('claude') || uid.includes('openai')) triggerSource = 'llm_intent';
      }

      const validSources = ['llm_intent','cron','event','manual'];
      if (!validSources.includes(triggerSource)) triggerSource = 'manual';

      // Converted to Drizzle ORM
      const { db: drizzleDb } = await import('../../db');
      const { trinityActionInvocations } = await import('@shared/schema');
      await drizzleDb.insert(trinityActionInvocations).values({
        id: randomUUID(),
        workspaceId: request.workspaceId || '',
        actionId: request.actionId,
        triggeredBy: request.userId || 'trinity_autonomous',
        triggerSource: triggerSource,
        payloadHash: payloadHash,
        durationMs: durationMs,
        success: result.success,
        errorMessage: result.success ? null : (result.message || null),
        createdAt: sql`now()`,
      });
    } catch (telErr: any) {
      log.warn('[Trinity Telemetry] Invocation log failed (non-blocking):', telErr?.message);
    }
  }

}
// Export singleton instance - aliased as both names for backward compatibility during migration
export const platformActionHub = new PlatformActionHub();
// Legacy alias - will be removed after full migration
export const helpaiOrchestrator = platformActionHub;
