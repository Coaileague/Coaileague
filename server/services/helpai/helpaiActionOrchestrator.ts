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
import { ChatServerHub } from '../ChatServerHub';
import { db } from '../../db';
import { notifications, platformUpdates, maintenanceAlerts, systemAuditLogs } from '@shared/schema';
import { eq, and, desc, gte } from 'drizzle-orm';
import { automationGovernanceService, type ActionContext, type ConfidenceFactors } from '../ai-brain/automationGovernanceService';
import { knowledgeOrchestrationService } from '../ai-brain/knowledgeOrchestrationService';
import { idempotencyService, registerIdempotencyActions } from '../ai-brain/idempotencyService';

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
  | 'memory';

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
  actionId: string;
  message: string;
  data?: any;
  executionTimeMs: number;
  notificationSent?: boolean;
  broadcastSent?: boolean;
}

export interface ActionHandler {
  actionId: string;
  name: string;
  category: ActionCategory;
  description: string;
  requiredRoles: string[];
  healthProbe?: () => Promise<boolean>;
  handler: (request: ActionRequest) => Promise<ActionResult>;
  isTestTool?: boolean;
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

// ============================================================================
// HELPAI ACTION ORCHESTRATOR CLASS
// ============================================================================

class HelpaiActionOrchestrator {
  private serviceHealth: Map<string, ServiceHealthStatus> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private wsBroadcaster: ((message: any) => void) | null = null;
  private initialized = false;

  constructor() {
    console.log('[Platform Action Hub] Initializing universal action handler...');
    this.registerBuiltinActions();
    this.subscribeToEventBus();
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
    console.log('[Platform Action Hub] Initialized with WebSocket broadcaster');
  }

  /**
   * Subscribe to platform event bus for AI-related events
   */
  private subscribeToEventBus(): void {
    platformEventBus.subscribe('ai_brain_action', {
      name: 'HelpAI Orchestrator',
      handler: async (event) => {
        console.log(`[Platform Action Hub] Received event: ${event.type}`);
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
      requiredRoles: ['support', 'admin', 'super_admin'],
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
      requiredRoles: ['support', 'admin', 'super_admin'],
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

        await db.insert(notifications).values({
          userId: targetUserId || request.userId,
          workspaceId: request.workspaceId,
          type: type || 'system',
          title: title || 'Test Notification',
          message: message || 'This is a test notification from HelpAI',
          isRead: false
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
      requiredRoles: ['support', 'admin', 'super_admin'],
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
          isActive: true,
          affectedServices: ['platform']
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
      requiredRoles: ['support', 'admin', 'super_admin'],
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
      actionId: 'notifications.send_to_user',
      name: 'Send User Notification',
      category: 'notifications',
      description: 'Send a persisted notification to a specific user via centralized notification engine',
      requiredRoles: ['support', 'admin', 'super_admin'],
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

        // Insert notification with proper fields
        const [notification] = await db.insert(notifications).values({
          userId: targetUserId,
          workspaceId: request.workspaceId || null,
          type: type || 'system',
          title,
          message,
          actionUrl: actionUrl || null,
          relatedEntityType: relatedEntityType || null,
          relatedEntityId: relatedEntityId || null,
          metadata: { ...metadata, sentViaHelpAI: true, sentBy: request.userId },
          createdBy: request.userId,
          isRead: false,
          clearedAt: null
        }).returning();

        // Broadcast via centralized WebSocket service
        if (request.workspaceId) {
          broadcastNotificationToUser(request.workspaceId, targetUserId, {
            ...notification,
            source: 'helpai_orchestrator',
            timestamp: new Date().toISOString()
          });
        }

        return {
          success: true,
          actionId: request.actionId,
          message: `Notification sent to user ${targetUserId}`,
          data: { notificationId: notification.id },
          executionTimeMs: Date.now() - startTime,
          notificationSent: true
        };
      }
    });

    // Create Maintenance Alert - Uses aiNotificationService
    this.registerAction({
      actionId: 'notifications.create_maintenance_alert',
      name: 'Create Maintenance Alert',
      category: 'notifications',
      description: 'Create a maintenance alert for scheduled downtime via AI notification service',
      requiredRoles: ['support', 'admin', 'super_admin'],
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

    // Get Notification Stats for User - Uses proper SQL aggregation
    this.registerAction({
      actionId: 'notifications.get_stats',
      name: 'Get Notification Statistics',
      category: 'notifications',
      description: 'Get notification counts and statistics for a user',
      requiredRoles: ['support', 'admin', 'super_admin', 'employee'],
      handler: async (request) => {
        const startTime = Date.now();
        const { sql, isNull } = await import('drizzle-orm');
        const { targetUserId, workspaceId: targetWorkspaceId } = request.payload || {};
        const userId = targetUserId || request.userId;
        const workspaceId = targetWorkspaceId || request.workspaceId;

        // Build proper query with workspace scoping for multi-tenant
        const conditions = [eq(notifications.userId, userId)];
        if (workspaceId) {
          conditions.push(eq(notifications.workspaceId, workspaceId));
        }

        const [stats] = await db.select({
          total: sql<number>`count(*)::int`,
          unread: sql<number>`count(*) filter (where ${notifications.isRead} = false)::int`,
          uncleared: sql<number>`count(*) filter (where ${notifications.clearedAt} is null)::int`,
        }).from(notifications).where(and(...conditions));

        return {
          success: true,
          actionId: request.actionId,
          message: `Notification stats for user ${userId}`,
          data: {
            userId,
            workspaceId,
            total: stats?.total || 0,
            unread: stats?.unread || 0,
            read: (stats?.total || 0) - (stats?.unread || 0),
            uncleared: stats?.uncleared || 0
          },
          executionTimeMs: Date.now() - startTime
        };
      }
    });

    // Force Clear All Notifications - Aligns with REST endpoint behavior
    this.registerAction({
      actionId: 'notifications.force_clear_all',
      name: 'Force Clear All Notifications',
      category: 'notifications',
      description: 'Clear all notifications for a user (support action) - sets clearedAt and acknowledges alerts',
      requiredRoles: ['support', 'admin', 'super_admin'],
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
          console.warn('[HelpAI] Failed to acknowledge maintenance alerts:', e);
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
            actionId: 'notifications.force_clear_all',
            category: 'notifications',
            parameters: { targetUserId, workspaceId },
            result: { success: true, cleared: { notifications: result.length, alerts: alertsCleared } }
          });
        } catch (logError) {
          console.warn('[HelpAI] Failed to log to AI Brain audit:', logError);
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
      requiredRoles: ['support', 'admin', 'super_admin'],
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
      requiredRoles: ['support', 'admin', 'super_admin'],
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

    // AI Brain Query
    this.registerAction({
      actionId: 'ai.query',
      name: 'Query AI Brain',
      category: 'support',
      description: 'Send a natural language query to the AI Brain',
      requiredRoles: ['support', 'admin', 'super_admin', 'employee'],
      handler: async (request) => {
        const startTime = Date.now();
        const { query, context } = request.payload || {};
        
        // This would integrate with actual AI Brain - for now return acknowledgment
        return {
          success: true,
          actionId: request.actionId,
          message: 'AI query received and processing',
          data: {
            query,
            context,
            status: 'processing',
            estimatedTimeMs: 2000
          },
          executionTimeMs: Date.now() - startTime
        };
      }
    });

    // ============================================================================
    // CODE EDITOR ACTIONS - AI Brain can propose code changes for approval
    // ============================================================================

    // Stage Code Change
    this.registerAction({
      actionId: 'code.stage_change',
      name: 'Stage Code Change',
      category: 'system',
      description: 'Stage a code change for user approval before applying',
      requiredRoles: ['support', 'admin', 'super_admin'],
      handler: async (request) => {
        const startTime = Date.now();
        const { aiBrainCodeEditor } = await import('../ai-brain/aiBrainCodeEditor');
        
        const { filePath, changeType, proposedContent, title, description, requestReason, conversationId, priority, category, affectedModule } = request.payload || {};
        
        if (!filePath || !changeType || !title || !description) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Missing required fields: filePath, changeType, title, description',
            executionTimeMs: Date.now() - startTime
          };
        }

        const result = await aiBrainCodeEditor.stageCodeChange({
          filePath,
          changeType,
          proposedContent,
          title,
          description,
          requestReason: requestReason || `Requested via HelpAI by ${request.userId}`,
          conversationId,
          priority,
          category,
          affectedModule
        }, request.userId);

        return {
          success: result.success,
          actionId: request.actionId,
          message: result.success ? 'Code change staged for approval' : (result.error || 'Failed to stage change'),
          data: { changeId: result.changeId },
          executionTimeMs: Date.now() - startTime
        };
      }
    });

    // Stage Batch Code Changes
    this.registerAction({
      actionId: 'code.stage_batch',
      name: 'Stage Batch Code Changes',
      category: 'system',
      description: 'Stage multiple code changes as a batch for approval',
      requiredRoles: ['support', 'admin', 'super_admin'],
      handler: async (request) => {
        const startTime = Date.now();
        const { aiBrainCodeEditor } = await import('../ai-brain/aiBrainCodeEditor');
        
        const { title, description, changes, conversationId, whatsNewTitle, whatsNewDescription } = request.payload || {};
        
        if (!title || !description || !changes || !Array.isArray(changes)) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Missing required fields: title, description, changes[]',
            executionTimeMs: Date.now() - startTime
          };
        }

        const result = await aiBrainCodeEditor.stageBatchChanges({
          title,
          description,
          changes,
          conversationId,
          whatsNewTitle,
          whatsNewDescription
        }, request.userId);

        return {
          success: result.success,
          actionId: request.actionId,
          message: result.success ? 'Batch changes staged for approval' : (result.errors?.join(', ') || 'Failed to stage batch'),
          data: { batchId: result.batchId, changeIds: result.changeIds },
          executionTimeMs: Date.now() - startTime
        };
      }
    });

    // Get Pending Code Changes
    this.registerAction({
      actionId: 'code.get_pending',
      name: 'Get Pending Code Changes',
      category: 'system',
      description: 'Get all pending code changes awaiting approval',
      requiredRoles: ['support', 'admin', 'super_admin'],
      handler: async (request) => {
        const startTime = Date.now();
        const { aiBrainCodeEditor } = await import('../ai-brain/aiBrainCodeEditor');
        
        const pendingChanges = await aiBrainCodeEditor.getPendingChanges();

        return {
          success: true,
          actionId: request.actionId,
          message: `Found ${pendingChanges.length} pending changes`,
          data: { pendingChanges },
          executionTimeMs: Date.now() - startTime
        };
      }
    });

    // Approve Code Change
    this.registerAction({
      actionId: 'code.approve',
      name: 'Approve Code Change',
      category: 'system',
      description: 'Approve a staged code change',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request) => {
        const startTime = Date.now();
        const { aiBrainCodeEditor } = await import('../ai-brain/aiBrainCodeEditor');
        
        const { changeId, notes } = request.payload || {};
        
        if (!changeId) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Missing required field: changeId',
            executionTimeMs: Date.now() - startTime
          };
        }

        const result = await aiBrainCodeEditor.approveChange(changeId, request.userId, notes);

        return {
          success: result.success,
          actionId: request.actionId,
          message: result.message,
          data: { changeId },
          executionTimeMs: Date.now() - startTime
        };
      }
    });

    // Reject Code Change
    this.registerAction({
      actionId: 'code.reject',
      name: 'Reject Code Change',
      category: 'system',
      description: 'Reject a staged code change',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request) => {
        const startTime = Date.now();
        const { aiBrainCodeEditor } = await import('../ai-brain/aiBrainCodeEditor');
        
        const { changeId, reason } = request.payload || {};
        
        if (!changeId) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Missing required field: changeId',
            executionTimeMs: Date.now() - startTime
          };
        }

        const result = await aiBrainCodeEditor.rejectChange(changeId, request.userId, reason);

        return {
          success: result.success,
          actionId: request.actionId,
          message: result.message,
          data: { changeId },
          executionTimeMs: Date.now() - startTime
        };
      }
    });

    // Apply Approved Code Change
    this.registerAction({
      actionId: 'code.apply',
      name: 'Apply Approved Code Change',
      category: 'system',
      description: 'Apply an approved code change to the codebase',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request) => {
        const startTime = Date.now();
        const { aiBrainCodeEditor } = await import('../ai-brain/aiBrainCodeEditor');
        
        const { changeId, sendWhatsNew } = request.payload || {};
        
        if (!changeId) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Missing required field: changeId',
            executionTimeMs: Date.now() - startTime
          };
        }

        // Defense-in-depth: Verify the change is in a valid state before applying
        const change = await aiBrainCodeEditor.getChangeById(changeId);
        if (!change) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Code change not found',
            executionTimeMs: Date.now() - startTime
          };
        }
        if (change.status !== 'approved') {
          return {
            success: false,
            actionId: request.actionId,
            message: `Can only apply approved changes (current status: ${change.status})`,
            executionTimeMs: Date.now() - startTime
          };
        }

        const result = await aiBrainCodeEditor.applyChange(changeId, request.userId, sendWhatsNew !== false);

        return {
          success: result.success,
          actionId: request.actionId,
          message: result.message,
          data: { changeId, appliedAt: result.appliedAt },
          executionTimeMs: Date.now() - startTime,
          notificationSent: sendWhatsNew !== false
        };
      }
    });

    // Rollback Applied Change
    this.registerAction({
      actionId: 'code.rollback',
      name: 'Rollback Applied Change',
      category: 'system',
      description: 'Rollback a previously applied code change',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request) => {
        const startTime = Date.now();
        const { aiBrainCodeEditor } = await import('../ai-brain/aiBrainCodeEditor');
        
        const { changeId, reason } = request.payload || {};
        
        if (!changeId) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Missing required field: changeId',
            executionTimeMs: Date.now() - startTime
          };
        }

        // Defense-in-depth: Verify the change is in a valid state before rollback
        const change = await aiBrainCodeEditor.getChangeById(changeId);
        if (!change) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Code change not found',
            executionTimeMs: Date.now() - startTime
          };
        }
        if (change.status !== 'applied') {
          return {
            success: false,
            actionId: request.actionId,
            message: `Can only rollback applied changes (current status: ${change.status})`,
            executionTimeMs: Date.now() - startTime
          };
        }
        if (!change.rollbackAvailable) {
          return {
            success: false,
            actionId: request.actionId,
            message: 'Rollback not available for this change',
            executionTimeMs: Date.now() - startTime
          };
        }

        const result = await aiBrainCodeEditor.rollbackChange(changeId);

        return {
          success: result.success,
          actionId: request.actionId,
          message: result.message,
          data: { changeId, reason },
          executionTimeMs: Date.now() - startTime
        };
      }
    });

    // Register idempotency management actions
    registerIdempotencyActions(this);

    console.log(`[Platform Action Hub] Registered ${ACTION_REGISTRY.size} built-in actions`);
  }

  /**
   * Register a new action handler
   */
  registerAction(handler: ActionHandler): void {
    ACTION_REGISTRY.set(handler.actionId, handler);
    console.log(`[Platform Action Hub] Registered action: ${handler.actionId}`);
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
    console.log(`[Platform Action Hub] Executing action: ${request.actionId} by user ${request.userId}`);

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
    if (!this.isAuthorized(request.userRole, handler.requiredRoles)) {
      console.warn(`[Platform Action Hub] Unauthorized: ${request.userId} with role ${request.userRole} tried to execute ${request.actionId}`);
      return {
        success: false,
        actionId: request.actionId,
        message: `Unauthorized: requires one of roles [${handler.requiredRoles.join(', ')}]`,
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
          console.log(`[Platform Action Hub] Governance blocked action: ${handler.name} - ${governanceDecision.blockingReason}`);
          
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
          console.log(`[Platform Action Hub] Action requires approval: ${handler.name} (confidence: ${governanceDecision.confidenceScore}%)`);
          
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
        
        console.log(`[Platform Action Hub] Governance approved: ${handler.name} (confidence: ${governanceDecision.confidenceScore}%, level: ${governanceDecision.computedLevel})`);
      }
    } catch (govError) {
      console.warn('[Platform Action Hub] Governance check failed (continuing with caution):', govError);
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
        console.log(`[Platform Action Hub] Duplicate action detected: ${request.actionId} (key: ${idempotencyKey})`);
        
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
            console.log(`[Platform Action Hub] Trinity blocked action: ${handler.name} - ${preActionDecision.rationale}`);
            
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
            console.log(`[Platform Action Hub] Trinity approved: ${handler.name} (confidence: ${preActionDecision.confidence})`);
          }
        }
      }
    } catch (aiError) {
      console.warn('[Platform Action Hub] Trinity pre-action check failed (continuing):', aiError);
    }

    // Execute the action
    try {
      const result = await handler.handler(request);
      
      // Log successful execution
      await this.logAction(request, result);
      
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
            }).catch(err => console.warn('[Platform Action Hub] Trinity post-action analysis failed:', err));
          }
        }
      } catch (postAiError) {
        console.warn('[Platform Action Hub] Trinity post-action check failed:', postAiError);
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
        console.warn('[Platform Action Hub] Knowledge learning failed:', learningError);
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
        message: `Action failed: ${error.message}`,
        executionTimeMs: Date.now() - startTime
      };

      await this.logAction(request, errorResult);
      
      // Update governance ledger on failure
      if (ledgerEntry) {
        await automationGovernanceService.updateLedgerEntry(ledgerEntry.id, {
          executionStatus: 'failed',
          errorDetails: error.message,
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
    // Role hierarchy: super_admin > admin > support > manager > employee
    const ROLE_HIERARCHY: Record<string, number> = {
      'super_admin': 100,
      'admin': 90,
      'support': 80,
      'manager': 70,
      'supervisor': 60,
      'employee': 50,
      'guest': 10,
    };

    const userLevel = ROLE_HIERARCHY[userRole] || 0;
    
    // Check if user's role level meets the minimum required level
    for (const requiredRole of requiredRoles) {
      const requiredLevel = ROLE_HIERARCHY[requiredRole] || 100;
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
    // Test tools and support actions require workspace context for multi-tenant isolation
    if (handler.isTestTool && !request.workspaceId) {
      console.warn(`[Platform Action Hub] Test tool ${request.actionId} requires workspace context`);
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
      console.error('[Platform Action Hub] Failed to log action:', error);
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
      console.log(`[Platform Action Hub] Skipping duplicate event: ${dedupKey}`);
      return;
    }

    // Map action categories to user-friendly event types and visibility
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
    
    console.log(`[Platform Action Hub] Published What's New: "${friendlyTitle}" (visibility: ${policy.visibility})`);
  }

  /**
   * Handle AI-related events from event bus
   */
  private async handleAIEvent(event: PlatformEvent): Promise<void> {
    console.log(`[Platform Action Hub] Processing AI event: ${event.title}`);
    // Process AI brain events - could trigger follow-up actions
  }

  /**
   * Handle service errors and notify support
   */
  private async handleServiceError(event: PlatformEvent): Promise<void> {
    console.log(`[Platform Action Hub] Service error detected: ${event.title}`);
    
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
    console.log(`[Platform Action Hub] ALERT: Action ${request.actionId} failed: ${error.message}`);
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

    console.log('[Platform Action Hub] Health monitoring started');
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
          errorMessage: error.message,
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
    console.log('[Platform Action Hub] Shutdown complete');
  }
}

// Export singleton instance
export const helpaiOrchestrator = new HelpaiActionOrchestrator();
