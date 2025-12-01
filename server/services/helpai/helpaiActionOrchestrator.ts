/**
 * HelpAI Action Orchestrator - Universal Action Handler
 * 
 * Central hub that brokers ALL user-triggered actions through the AI Brain.
 * Uses an event-driven command bus tied to ChatServerHub and WebSocket layers.
 * 
 * Responsibilities:
 * - Intercept and validate all user actions
 * - Route actions to appropriate service handlers
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
  | 'test';

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
  priority?: ActionPriority;
  requiresConfirmation?: boolean;
  isTestMode?: boolean;
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
    console.log('[HelpAI Orchestrator] Initializing universal action handler...');
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
    console.log('[HelpAI Orchestrator] Initialized with WebSocket broadcaster');
  }

  /**
   * Subscribe to platform event bus for AI-related events
   */
  private subscribeToEventBus(): void {
    platformEventBus.subscribe('ai_brain_action', {
      name: 'HelpAI Orchestrator',
      handler: async (event) => {
        console.log(`[HelpAI Orchestrator] Received event: ${event.type}`);
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
          isActive: true
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

    console.log(`[HelpAI Orchestrator] Registered ${ACTION_REGISTRY.size} built-in actions`);
  }

  /**
   * Register a new action handler
   */
  registerAction(handler: ActionHandler): void {
    ACTION_REGISTRY.set(handler.actionId, handler);
    console.log(`[HelpAI Orchestrator] Registered action: ${handler.actionId}`);
  }

  /**
   * Execute an action through the orchestrator
   */
  async executeAction(request: ActionRequest): Promise<ActionResult> {
    const startTime = Date.now();
    
    // Log the action request
    console.log(`[HelpAI Orchestrator] Executing action: ${request.actionId} by user ${request.userId}`);

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
      console.warn(`[HelpAI Orchestrator] Unauthorized: ${request.userId} with role ${request.userRole} tried to execute ${request.actionId}`);
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

    // Execute the action
    try {
      const result = await handler.handler(request);
      
      // Log successful execution
      await this.logAction(request, result);
      
      // Emit platform event
      await this.emitActionEvent(request, result);

      return result;
    } catch (error: any) {
      const errorResult: ActionResult = {
        success: false,
        actionId: request.actionId,
        message: `Action failed: ${error.message}`,
        executionTimeMs: Date.now() - startTime
      };

      await this.logAction(request, errorResult);
      
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
      console.warn(`[HelpAI Orchestrator] Test tool ${request.actionId} requires workspace context`);
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
      console.error('[HelpAI Orchestrator] Failed to log action:', error);
    }
  }

  /**
   * Emit action event to platform event bus
   */
  private async emitActionEvent(request: ActionRequest, result: ActionResult): Promise<void> {
    await platformEventBus.publish({
      type: 'ai_brain_action',
      category: 'feature',
      title: `Action: ${request.name}`,
      description: result.message,
      workspaceId: request.workspaceId,
      userId: request.userId,
      metadata: {
        actionId: request.actionId,
        category: request.category,
        success: result.success,
        executionTimeMs: result.executionTimeMs
      }
    });
  }

  /**
   * Handle AI-related events from event bus
   */
  private async handleAIEvent(event: PlatformEvent): Promise<void> {
    console.log(`[HelpAI Orchestrator] Processing AI event: ${event.title}`);
    // Process AI brain events - could trigger follow-up actions
  }

  /**
   * Handle service errors and notify support
   */
  private async handleServiceError(event: PlatformEvent): Promise<void> {
    console.log(`[HelpAI Orchestrator] Service error detected: ${event.title}`);
    
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
    console.log(`[HelpAI Orchestrator] ALERT: Action ${request.actionId} failed: ${error.message}`);
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

    console.log('[HelpAI Orchestrator] Health monitoring started');
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
    console.log('[HelpAI Orchestrator] Shutdown complete');
  }
}

// Export singleton instance
export const helpaiOrchestrator = new HelpaiActionOrchestrator();
