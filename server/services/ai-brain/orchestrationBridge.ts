/**
 * Orchestration Bridge - Connects AI Brain services to platform infrastructure
 * 
 * This bridge:
 * 1. Starts SupervisoryAgent and SchedulerCoordinator during server boot
 * 2. Connects aiBrainEvents to WebSocket broadcasts for real-time updates
 * 3. Bridges to PlatformEventBus for persistent notifications
 * 4. Ensures all orchestration events reach clients
 */

import { aiBrainEvents } from './internalEventEmitter';
import { supervisoryAgent } from './supervisoryAgent';
import { schedulerCoordinator } from './schedulerCoordinator';
import { realTimeBridge } from './realTimeBridge';
import { platformEventBus, publishPlatformUpdate } from '../platformEventBus';
import type { PlatformEventType } from '../platformEventBus';
import { serviceControlManager } from './serviceControl';
import { createLogger } from '../../lib/logger';
const log = createLogger('OrchestrationBridge');

let isInitialized = false;
let wssBroadcaster: ((workspaceId: string, data: any) => void) | null = null;

/**
 * Load persisted service states from database
 */
async function loadPersistedServiceStates(): Promise<string[]> {
  try {
    const pausedServices = await serviceControlManager.loadPersistedStates();
    
    if (pausedServices.length > 0) {
      log.info(`[OrchestrationBridge] Respecting ${pausedServices.length} paused services from previous session:`, pausedServices.join(', '));
    }
    
    return pausedServices;
  } catch (error) {
    log.error('[OrchestrationBridge] Failed to load persisted service states:', error);
    return [];
  }
}

/**
 * Set the WebSocket broadcaster function from the main websocket.ts
 */
export function setOrchestrationWebSocketBroadcaster(broadcaster: (workspaceId: string, data: any) => void) {
  wssBroadcaster = broadcaster;
  log.info('[OrchestrationBridge] WebSocket broadcaster registered');
}

/**
 * Initialize all orchestration services and connect them to platform infrastructure
 */
export async function initializeOrchestrationServices() {
  if (isInitialized) {
    log.info('[OrchestrationBridge] Already initialized, skipping');
    return;
  }

  log.info('[OrchestrationBridge] Initializing AI Brain orchestration services...');

  // 0. Load persisted service states from database
  await loadPersistedServiceStates();

  // 1. Start SupervisoryAgent health monitoring loop (only if not paused)
  startSupervisoryAgent();

  // 2. Start SchedulerCoordinator processing loop
  startSchedulerCoordinator();

  // 3. Bridge aiBrainEvents to WebSocket broadcasts
  setupWebSocketBridge();

  // 4. Bridge to PlatformEventBus for notifications
  setupPlatformEventBridge();

  // 5. Connect realTimeBridge subscribers to actual WebSocket
  connectRealTimeBridgeToWebSocket();

  // 6. Register service control callbacks for pause/resume
  setupServiceControlCallbacks();

  isInitialized = true;
  log.info('[OrchestrationBridge] Orchestration services initialized');
}

/**
 * Register pause/resume callbacks for orchestration services
 */
function setupServiceControlCallbacks() {
  // SupervisoryAgent pause/resume
  serviceControlManager.registerPauseCallback('supervisory_agent', () => {
    supervisoryAgent.stop();
  });
  serviceControlManager.registerResumeCallback('supervisory_agent', () => {
    supervisoryAgent.start();
  });

  // SchedulerCoordinator pause/resume
  serviceControlManager.registerPauseCallback('scheduler_coordinator', () => {
    schedulerCoordinator.stop();
  });
  serviceControlManager.registerResumeCallback('scheduler_coordinator', () => {
    schedulerCoordinator.start();
  });

  // Service state change events -> WebSocket broadcast
  aiBrainEvents.on('service_state_changed', (data) => {
    broadcastOrchestrationEvent('service_status', {
      service: data.service,
      status: data.status,
      userId: data.userId,
      reason: data.reason,
      timestamp: data.timestamp,
    });
  });

  aiBrainEvents.on('service_control_action', (data) => {
    broadcastOrchestrationEvent('service_control', {
      action: data.action,
      service: data.service,
      userId: data.userId,
      reason: data.reason,
      timestamp: data.timestamp,
    });
  });

  log.info('[OrchestrationBridge] Service control callbacks registered');
}

/**
 * Start SupervisoryAgent health monitoring
 */
function startSupervisoryAgent() {
  if (!serviceControlManager.isServiceRunning('supervisory_agent')) {
    log.info('[OrchestrationBridge] SupervisoryAgent is paused, skipping start');
    return;
  }
  supervisoryAgent.start();
  log.info('[OrchestrationBridge] SupervisoryAgent started');
}

/**
 * Start SchedulerCoordinator processing loop
 */
function startSchedulerCoordinator() {
  if (!serviceControlManager.isServiceRunning('scheduler_coordinator')) {
    log.info('[OrchestrationBridge] SchedulerCoordinator is paused, skipping start');
    return;
  }
  schedulerCoordinator.start();
  log.info('[OrchestrationBridge] SchedulerCoordinator started');
}

/**
 * Bridge aiBrainEvents to WebSocket for real-time client updates
 */
function setupWebSocketBridge() {
  // Workflow status updates
  aiBrainEvents.on('workflow_created', (data) => {
    broadcastOrchestrationEvent('workflow_update', {
      type: 'created',
      runId: data.runId,
      actionId: data.actionId,
      timestamp: new Date().toISOString(),
    }, data.workspaceId);
  });

  aiBrainEvents.on('workflow_started', (data) => {
    broadcastOrchestrationEvent('workflow_update', {
      type: 'started',
      runId: data.runId,
      actionId: data.actionId,
      timestamp: new Date().toISOString(),
    }, data.workspaceId);
  });

  aiBrainEvents.on('workflow_completed', (data) => {
    broadcastOrchestrationEvent('workflow_update', {
      type: 'completed',
      runId: data.runId,
      actionId: data.actionId,
      durationMs: data.durationMs,
      slaMet: data.slaMet,
      timestamp: new Date().toISOString(),
    }, data.workspaceId);
  });

  aiBrainEvents.on('workflow_failed', (data) => {
    broadcastOrchestrationEvent('workflow_update', {
      type: 'failed',
      runId: data.runId,
      actionId: data.actionId,
      error: data.error,
      canRetry: data.canRetry,
      timestamp: new Date().toISOString(),
    }, data.workspaceId);
  });

  aiBrainEvents.on('workflow_cancelled', (data) => {
    broadcastOrchestrationEvent('workflow_update', {
      type: 'cancelled',
      runId: data.runId,
      actionId: data.actionId,
      reason: data.reason,
      timestamp: new Date().toISOString(),
    }, data.workspaceId);
  });

  // Commitment/approval updates
  aiBrainEvents.on('approval_requested', (data) => {
    broadcastOrchestrationEvent('approval_update', {
      type: 'requested',
      commitmentId: data.commitmentId,
      actionId: data.actionId,
      requiredRole: data.requiredRole,
      timestamp: new Date().toISOString(),
    }, data.workspaceId);
  });

  aiBrainEvents.on('approval_granted', (data) => {
    broadcastOrchestrationEvent('approval_update', {
      type: 'granted',
      commitmentId: data.commitmentId,
      approvedBy: data.approvedBy,
      timestamp: new Date().toISOString(),
    }, data.workspaceId);
  });

  aiBrainEvents.on('approval_rejected', (data) => {
    broadcastOrchestrationEvent('approval_update', {
      type: 'rejected',
      commitmentId: data.commitmentId,
      rejectedBy: data.rejectedBy,
      reason: data.reason,
      timestamp: new Date().toISOString(),
    }, data.workspaceId);
  });

  // Health warnings
  aiBrainEvents.on('workflow_health_warning', (data) => {
    broadcastOrchestrationEvent('health_warning', {
      stalledRuns: data.stalledRuns,
      pendingRuns: data.pendingRuns,
      timestamp: new Date().toISOString(),
    });
  });

  // Workflow approved - handle previously orphaned event
  aiBrainEvents.on('workflow_approved', (data) => {
    broadcastOrchestrationEvent('workflow_update', {
      type: 'approved',
      runId: data.runId,
      actionId: data.actionId,
      approvedBy: data.approvedBy,
      timestamp: new Date().toISOString(),
    }, data.workspaceId);
  });

  // Workflow retrying
  aiBrainEvents.on('workflow_retrying', (data) => {
    broadcastOrchestrationEvent('workflow_update', {
      type: 'retrying',
      runId: data.runId,
      actionId: data.actionId,
      retryCount: data.retryCount,
      timestamp: new Date().toISOString(),
    }, data.workspaceId);
  });

  // Commitment fulfilled - handle previously orphaned event
  aiBrainEvents.on('commitment_fulfilled', (data) => {
    broadcastOrchestrationEvent('commitment_update', {
      type: 'fulfilled',
      commitmentId: data.commitmentId,
      runId: data.runId,
      timestamp: new Date().toISOString(),
    }, data.workspaceId);
  });

  // Compensation required - critical alert for rollback needed
  aiBrainEvents.on('compensation_required', (data) => {
    broadcastOrchestrationEvent('commitment_update', {
      type: 'compensation_required',
      commitmentId: data.commitmentId,
      reason: data.reason,
      timestamp: new Date().toISOString(),
    }, data.workspaceId);
  });

  // Critical alert - high priority system notification
  aiBrainEvents.on('critical_alert', (data) => {
    broadcastOrchestrationEvent('critical_alert', {
      level: data.level,
      type: data.type,
      message: data.message,
      actionId: data.actionId,
      timestamp: new Date().toISOString(),
    }, data.workspaceId);
  });

  aiBrainEvents.on('execute_action', async (data) => {
    log.info(`[OrchestrationBridge] Execute action request: ${data.actionId}`, {
      runId: data.runId,
      params: Object.keys(data.params || {}),
    });

    try {
      const { helpaiOrchestrator } = await import('../helpai/platformActionHub');
      const result = await helpaiOrchestrator.executeAction({
        actionId: data.actionId,
        userId: data.userId || 'trinity-ai',
        workspaceId: data.workspaceId,
        userRole: data.userRole || 'system',
        payload: data.params || {},
      });

      log.info(`[OrchestrationBridge] Action ${data.actionId} ${result.success ? 'succeeded' : 'failed'}: ${result.message || ''}`);

      broadcastOrchestrationEvent('action_result', {
        actionId: data.actionId,
        runId: data.runId,
        success: result.success,
        message: result.message,
        data: result.data,
        executionTimeMs: result.executionTimeMs,
        timestamp: new Date().toISOString(),
      }, data.workspaceId);
    } catch (error: any) {
      log.error(`[OrchestrationBridge] Action ${data.actionId} execution error:`, (error instanceof Error ? error.message : String(error)));
      broadcastOrchestrationEvent('action_result', {
        actionId: data.actionId,
        runId: data.runId,
        success: false,
        error: (error instanceof Error ? error.message : String(error)),
        timestamp: new Date().toISOString(),
      }, data.workspaceId);
    }
  });

  log.info('[OrchestrationBridge] WebSocket event bridge configured');
}

/**
 * Bridge orchestration events to PlatformEventBus for persistent notifications
 */
function setupPlatformEventBridge() {
  // Critical workflow failures -> platform notification
  aiBrainEvents.on('workflow_failed', async (data) => {
    if (data.severity === 'critical' || data.requiresAttention) {
      await publishPlatformUpdate({
        type: 'ai_error' as PlatformEventType,
        category: 'bugfix',
        title: `AI Workflow Failed: ${data.actionId}`,
        description: `Workflow ${data.runId} failed: ${data.error}`,
        workspaceId: data.workspaceId,
        metadata: {
          runId: data.runId,
          actionId: data.actionId,
          error: data.error,
          canRetry: data.canRetry,
        },
        visibility: 'org_leadership',
      });
    }
  });

  // Escalations -> platform notification
  aiBrainEvents.on('escalation_triggered', async (data) => {
    await publishPlatformUpdate({
      type: 'ai_escalation' as PlatformEventType,
      category: 'announcement',
      title: `Escalation: ${data.reason}`,
      description: data.message || `Action ${data.actionId} requires attention`,
      workspaceId: data.workspaceId,
      userId: data.triggeredBy,
      metadata: {
        actionId: data.actionId,
        escalationType: data.escalationType,
        reason: data.reason,
      },
      visibility: 'manager',
    });
  });

  // Approval requests -> platform notification for approvers
  aiBrainEvents.on('approval_requested', async (data) => {
    await publishPlatformUpdate({
      type: 'ai_brain_action' as PlatformEventType,
      category: 'announcement',
      title: 'Approval Required',
      description: `Action ${data.actionId} requires ${data.requiredRole} approval`,
      workspaceId: data.workspaceId,
      metadata: {
        commitmentId: data.commitmentId,
        actionId: data.actionId,
        requiredRole: data.requiredRole,
      },
      visibility: data.requiredRole === 'admin' ? 'admin' : 'manager',
    });
  });

  // Completed automations -> success notification
  aiBrainEvents.on('workflow_completed', async (data) => {
    if (data.notifyOnComplete) {
      await publishPlatformUpdate({
        type: 'automation_completed' as PlatformEventType,
        category: 'improvement',
        title: `Automation Complete: ${data.actionId}`,
        description: `Workflow completed successfully in ${Math.round((data.durationMs || 0) / 1000)}s`,
        workspaceId: data.workspaceId,
        metadata: {
          runId: data.runId,
          actionId: data.actionId,
          durationMs: data.durationMs,
          slaMet: data.slaMet,
        },
        visibility: 'staff',
      });
    }
  });

  log.info('[OrchestrationBridge] Platform event bridge configured');
}

/**
 * Connect realTimeBridge subscribers to actual WebSocket broadcaster
 */
function connectRealTimeBridgeToWebSocket() {
  // Subscribe to all RealTimeBridge channels and forward to WebSocket
  realTimeBridge.subscribe('workflow', (payload) => {
    broadcastOrchestrationEvent('workflow_progress', payload);
  });

  realTimeBridge.subscribe('notification', (payload) => {
    broadcastOrchestrationEvent('notification_update', payload);
  });

  realTimeBridge.subscribe('mascot', (payload) => {
    broadcastOrchestrationEvent('mascot_command', payload);
  });

  realTimeBridge.subscribe('helpai', (payload) => {
    broadcastOrchestrationEvent('helpai_update', payload);
  });

  realTimeBridge.subscribe('system', (payload) => {
    broadcastOrchestrationEvent('system_alert', payload);
  });

  log.info('[OrchestrationBridge] RealTimeBridge connected to WebSocket');
}

/**
 * Broadcast an orchestration event to all clients (or specific workspace)
 */
function broadcastOrchestrationEvent(type: string, data: any, workspaceId?: string) {
  const message = {
    type: 'orchestration',
    event: type,
    data,
    timestamp: new Date().toISOString(),
  };

  if (wssBroadcaster && workspaceId) {
    wssBroadcaster(workspaceId, message);
  } else if (wssBroadcaster) {
    // Broadcast to all workspaces (for system-wide events)
    wssBroadcaster('*', message);
  }
}

/**
 * Get orchestration service status
 */
export async function getOrchestrationStatus() {
  const health = await supervisoryAgent.getHealth();
  const queueStats = schedulerCoordinator.getQueueStats();
  const bridgeStats = realTimeBridge.getChannelStats();

  return {
    initialized: isInitialized,
    supervisoryAgent: {
      healthy: health.isHealthy,
      ...health,
    },
    scheduler: queueStats,
    realTimeBridge: bridgeStats,
    webSocketConnected: wssBroadcaster !== null,
  };
}

/**
 * Cleanup function for graceful bridge shutdown (resets bridge connection state only).
 * For full orchestration service shutdown, use shutdownOrchestrationServices() from server/services/orchestration/index.ts
 */
export function shutdownOrchestrationBridge() {
  log.info('[OrchestrationBridge] Shutting down orchestration bridge...');
  isInitialized = false;
  wssBroadcaster = null;
}
