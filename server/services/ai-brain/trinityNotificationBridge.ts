/**
 * TrinityNotificationBridge - Fortune 500-Grade AI Notification Orchestration
 * 
 * Connects Trinity AI to all notification systems for:
 * - Live patch delivery with deployment tracking
 * - AI-driven notification prioritization
 * - Smart batching and delivery scheduling
 * - Support role escalation and force-push
 * - Real-time What's New announcements
 * - End-user notification personalization
 */

import crypto from 'crypto';
import { db } from '../../db';
import { 
  notifications, 
  platformUpdates, 
  employees, 
  users,
  systemAuditLogs,
  maintenanceAlerts,
  platformRoles
} from '@shared/schema';
import { eq, and, desc, sql, gte, isNull, or, inArray, ne } from 'drizzle-orm';
import { broadcastToAllClients, broadcastToWorkspace, broadcastNotificationToUser, getLiveConnectionStats } from '../../websocket';
import { publishPlatformUpdate, platformEventBus } from '../platformEventBus';
import { notificationStateManager } from '../notificationStateManager';
import { UniversalNotificationEngine } from '../universalNotificationEngine';
import { platformFeatureRegistry } from './platformFeatureRegistry';
import { createLogger } from '../../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../billing/billingConstants';
const log = createLogger('TrinityNotificationBridge');

export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low' | 'batch';
export type DeliveryChannel = 'websocket' | 'push' | 'email' | 'in_app' | 'sms';
export type NotificationSource = 'trinity' | 'ai_brain' | 'support' | 'system' | 'automation';

export interface LivePatchDelivery {
  patchId: string;
  version: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'normal' | 'low';
  category?: 'security' | 'bugfix' | 'feature' | 'improvement';
  affectedSystems: string[];
  deployedAt: string;
  deployedBy?: string;
  requiresRefresh: boolean;
  rolloutPercentage?: number;
}

export interface TrinityNotificationPayload {
  source: NotificationSource;
  priority: NotificationPriority;
  channels: DeliveryChannel[];
  title: string;
  message: string;
  category: 'feature' | 'improvement' | 'bugfix' | 'security' | 'announcement' | 'maintenance' | 'ai_brain' | 'support';
  
  targetAudience?: {
    type: 'all' | 'workspace' | 'role' | 'user';
    workspaceId?: string;
    roleFilter?: string[];
    userIds?: string[];
    platformRoles?: string[];
  };
  
  metadata?: {
    patchInfo?: LivePatchDelivery;
    actionUrl?: string;
    badge?: string;
    version?: string;
    learnMoreUrl?: string;
    expiresAt?: string;
    aiGenerated?: boolean;
    trinityMode?: 'demo' | 'business_pro' | 'guru';
  };
}

export interface NotificationDeliveryResult {
  success: boolean;
  notificationId?: string;
  recipientCount: number;
  channels: DeliveryChannel[];
  deliveryTime: number;
  errors?: string[];
}

export interface BatchedNotification {
  id: string;
  payload: TrinityNotificationPayload;
  scheduledFor: Date;
  status: 'pending' | 'delivered' | 'failed';
  retryCount: number;
}

class TrinityNotificationBridge {
  private batchQueue: BatchedNotification[] = [];
  private batchInterval: NodeJS.Timeout | null = null;
  private deliveryMetrics = {
    totalSent: 0,
    totalFailed: 0,
    averageDeliveryTime: 0,
    byChannel: new Map<DeliveryChannel, number>(),
  };

  private universalEngine = new UniversalNotificationEngine();

  constructor() {
    this.startBatchProcessor();
    log.info('[TrinityNotificationBridge] Fortune 500-grade notification orchestration initialized');
  }

  /**
   * Send notification with AI-driven prioritization
   */
  async sendNotification(payload: TrinityNotificationPayload): Promise<NotificationDeliveryResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let recipientCount = 0;

    try {
      if (payload.priority === 'critical' || payload.priority === 'high') {
        const result = await this.deliverImmediate(payload);
        recipientCount = result.recipientCount;
      } else if (payload.priority === 'batch') {
        this.queueForBatch(payload);
        return {
          success: true,
          recipientCount: 0,
          channels: payload.channels,
          deliveryTime: Date.now() - startTime,
        };
      } else {
        const result = await this.deliverImmediate(payload);
        recipientCount = result.recipientCount;
      }

      this.deliveryMetrics.totalSent++;
      this.updateAverageDeliveryTime(Date.now() - startTime);

      return {
        success: true,
        recipientCount,
        channels: payload.channels,
        deliveryTime: Date.now() - startTime,
      };
    } catch (error: any) {
      this.deliveryMetrics.totalFailed++;
      errors.push((error instanceof Error ? error.message : String(error)));
      log.error('[TrinityNotificationBridge] Delivery error:', error);

      return {
        success: false,
        recipientCount: 0,
        channels: payload.channels,
        deliveryTime: Date.now() - startTime,
        errors,
      };
    }
  }

  /**
   * Deliver live patch notification with deployment tracking
   */
  async deliverLivePatch(patch: LivePatchDelivery): Promise<NotificationDeliveryResult> {
    log.info(`[TrinityNotificationBridge] Delivering live patch: ${patch.patchId} v${patch.version}`);

    const priority = patch.severity === 'critical' ? 'critical' : 
                     patch.severity === 'high' ? 'high' : 'normal';

    const eventCategory = patch.category === 'security' ? 'security' : 
                          patch.category === 'bugfix' ? 'bugfix' : 'improvement';

    const payload: TrinityNotificationPayload = {
      source: 'system',
      priority,
      channels: ['websocket', 'in_app'],
      title: patch.title,
      message: patch.description,
      category: eventCategory,
      targetAudience: { type: 'all' },
      metadata: {
        patchInfo: patch,
        badge: 'PATCH',
        version: patch.version,
      },
    };

    await publishPlatformUpdate({
      type: 'bugfix_deployed',
      category: eventCategory,
      title: patch.title,
      description: patch.description,
      version: patch.version,
      priority: patch.severity === 'critical' ? 1 : patch.severity === 'high' ? 2 : 3,
      visibility: 'all',
      metadata: {
        patchId: patch.patchId,
        affectedSystems: patch.affectedSystems,
        deployedBy: patch.deployedBy,
        requiresRefresh: patch.requiresRefresh,
      },
    });

    if (patch.requiresRefresh) {
      broadcastToAllClients({
        type: 'force_refresh',
        refreshType: 'live_patch',
        payload: {
          patchId: patch.patchId,
          version: patch.version,
          requiresRefresh: true,
          message: `A new update (${patch.version}) has been deployed. Please refresh for the latest changes.`,
        },
        timestamp: new Date().toISOString(),
      });
    }

    await this.logDeployment(patch);

    // Refresh Trinity's feature registry sync on each deployment
    const syncStatus = platformFeatureRegistry.refreshSync();
    log.info(`[TrinityNotificationBridge] Feature registry synced: v${syncStatus.syncVersion}`);

    return this.sendNotification(payload);
  }

  /**
   * Push What's New announcement with Trinity AI insights
   */
  async pushWhatsNew(options: {
    title: string;
    description: string;
    category: 'feature' | 'improvement' | 'bugfix' | 'security' | 'announcement';
    priority?: number;
    visibility?: 'all' | 'staff' | 'supervisor' | 'manager' | 'admin';
    badge?: string;
    version?: string;
    learnMoreUrl?: string;
    workspaceId?: string;
    pushedBy?: string;
  }): Promise<{ updateId: string; recipientCount: number }> {
    log.info(`[TrinityNotificationBridge] Pushing What's New: ${options.title}`);

    const updateId = `update-${options.category}-${Date.now()}`;
    
    const [update] = await db.insert(platformUpdates).values({
      id: updateId,
      title: options.title,
      description: options.description,
      category: options.category,
      priority: options.priority || 5,
      visibility: options.visibility || 'all',
      badge: options.badge || 'NEW',
      version: options.version,
      learnMoreUrl: options.learnMoreUrl,
      workspaceId: options.workspaceId || PLATFORM_WORKSPACE_ID,
      createdBy: options.pushedBy,
      isNew: true,
      date: new Date(),
    }).returning();

    // NOTE: Do NOT call publishPlatformUpdate here - it would cause double posting
    // Trinity directly inserts into platformUpdates and broadcasts via WebSocket
    // The platformEventBus is only used as a fallback when Trinity is unhealthy

    const count = broadcastToAllClients({
      type: 'force_refresh',
      refreshType: 'whats_new',
      payload: {
        action: 'new_update',
        updateId: update.id,
        title: options.title,
        badge: options.badge || 'NEW',
      },
      timestamp: new Date().toISOString(),
    });

    return { updateId: update.id, recipientCount: count };
  }

  /**
   * Support role escalation - force push to staff with priority handling
   */
  async supportEscalation(options: {
    title: string;
    message: string;
    severity: 'info' | 'warning' | 'error' | 'critical';
    targetRoles?: string[];
    actionUrl?: string;
    pushedBy: string;
  }): Promise<NotificationDeliveryResult> {
    log.info(`[TrinityNotificationBridge] Support escalation: ${options.title} (${options.severity})`);

    const priority: NotificationPriority = 
      options.severity === 'critical' ? 'critical' :
      options.severity === 'error' ? 'high' :
      options.severity === 'warning' ? 'normal' : 'low';

    const supportRoles = options.targetRoles || [
      'root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'
    ];

    const staffWithRoles = await db.select({ userId: platformRoles.userId })
      .from(platformRoles)
      .where(
        inArray(platformRoles.role, supportRoles as any)
      );

    const userIds = staffWithRoles.map(r => r.userId);

    const payload: TrinityNotificationPayload = {
      source: 'support',
      priority,
      channels: ['websocket', 'in_app'],
      title: options.title,
      message: options.message,
      category: 'support',
      targetAudience: {
        type: 'user',
        userIds,
      },
      metadata: {
        actionUrl: options.actionUrl,
        badge: options.severity.toUpperCase(),
      },
    };

    await db.insert(systemAuditLogs).values({
      workspaceId: 'system',
      action: 'support_escalation',
      entityType: 'notification',
      entityId: `escalation-${Date.now()}`,
      userId: options.pushedBy,
      metadata: {
        title: options.title,
        message: options.message,
        severity: options.severity,
        targetRoles: supportRoles,
        recipientCount: userIds.length,
      },
    });

    return this.sendNotification(payload);
  }

  /**
   * Trinity-driven notification for business insights
   */
  async trinityInsight(options: {
    workspaceId: string;
    userId: string;
    insightType: 'growth' | 'risk' | 'opportunity' | 'recommendation' | 'alert';
    title: string;
    message: string;
    actionUrl?: string;
    mode: 'demo' | 'business_pro' | 'guru';
  }): Promise<NotificationDeliveryResult> {
    const priority: NotificationPriority = 
      options.insightType === 'alert' ? 'high' :
      options.insightType === 'risk' ? 'high' :
      options.insightType === 'opportunity' ? 'normal' : 'low';

    const payload: TrinityNotificationPayload = {
      source: 'trinity',
      priority,
      channels: ['websocket', 'in_app'],
      title: options.title,
      message: options.message,
      category: 'ai_brain',
      targetAudience: {
        type: 'user',
        userIds: [options.userId],
        workspaceId: options.workspaceId,
      },
      metadata: {
        actionUrl: options.actionUrl,
        aiGenerated: true,
        trinityMode: options.mode,
        badge: options.insightType.toUpperCase(),
      },
    };

    return this.sendNotification(payload);
  }

  /**
   * Maintenance alert for scheduled downtime or system updates
   */
  async maintenanceAlert(options: {
    title: string;
    message: string;
    scheduledStart: Date;
    scheduledEnd: Date;
    affectedServices: string[];
    workspaceId?: string;
    createdBy: string;
  }): Promise<{ alertId: string; recipientCount: number }> {
    log.info(`[TrinityNotificationBridge] Maintenance alert: ${options.title}`);

    const [alert] = await db.insert(maintenanceAlerts).values({
      title: options.title,
      description: options.message,
      severity: 'warning',
      scheduledStartTime: options.scheduledStart,
      scheduledEndTime: options.scheduledEnd,
      affectedServices: options.affectedServices,
      workspaceId: options.workspaceId,
      status: 'scheduled',
      createdById: options.createdBy,
    }).returning();

    const count = broadcastToAllClients({
      type: 'maintenance_alert',
      payload: {
        alertId: alert.id,
        title: options.title,
        message: options.message,
        scheduledStart: options.scheduledStart.toISOString(),
        scheduledEnd: options.scheduledEnd.toISOString(),
        affectedServices: options.affectedServices,
      },
      timestamp: new Date().toISOString(),
    });

    return { alertId: alert.id, recipientCount: count };
  }

  /**
   * Get notification delivery metrics for monitoring
   */
  getDeliveryMetrics() {
    return {
      ...this.deliveryMetrics,
      queuedBatchCount: this.batchQueue.filter(b => b.status === 'pending').length,
      byChannel: Object.fromEntries(this.deliveryMetrics.byChannel),
    };
  }

  private async deliverImmediate(payload: TrinityNotificationPayload): Promise<{ recipientCount: number }> {
    let recipientCount = 0;

    if (payload.channels.includes('websocket') || payload.channels.includes('in_app')) {
      if (payload.targetAudience?.type === 'all') {
        recipientCount = broadcastToAllClients({
          type: 'notification',
          payload: {
            title: payload.title,
            message: payload.message,
            category: payload.category,
            priority: payload.priority,
            source: payload.source,
            metadata: payload.metadata,
          },
          timestamp: new Date().toISOString(),
        });
      } else if (payload.targetAudience?.type === 'workspace' && payload.targetAudience.workspaceId) {
        broadcastToWorkspace(payload.targetAudience.workspaceId, {
          type: 'notification',
          payload: {
            title: payload.title,
            message: payload.message,
            category: payload.category,
            priority: payload.priority,
            source: payload.source,
            metadata: payload.metadata,
          },
        });
        recipientCount = 1;
      } else if (payload.targetAudience?.type === 'user' && payload.targetAudience.userIds) {
        // Route through UniversalNotificationEngine for Trinity AI enrichment and validation
        const { universalNotificationEngine } = await import('../universalNotificationEngine');
        
        for (const userId of payload.targetAudience.userIds) {
          try {
            await universalNotificationEngine.sendNotification({
              type: 'system',
              title: payload.title,
              message: payload.message,
              workspaceId: payload.targetAudience.workspaceId || undefined,
              userId: userId,
              severity: payload.priority === 'critical' ? 'critical' : payload.priority === 'high' ? 'high' : 'medium',
              source: 'trinity_notification_bridge',
              metadata: {
                source: payload.source,
                category: payload.category,
                priority: payload.priority,
                aiGenerated: payload.metadata?.aiGenerated,
                trinityMode: payload.metadata?.trinityMode,
                badge: payload.metadata?.badge,
                actionUrl: payload.metadata?.actionUrl,
              },
            });
            recipientCount++;
          } catch (uneError) {
            log.info(`[TrinityNotificationBridge] UNE validation blocked notification for user ${userId}`);
          }
        }
      }
    }

    payload.channels.forEach(ch => {
      this.deliveryMetrics.byChannel.set(
        ch,
        (this.deliveryMetrics.byChannel.get(ch) || 0) + recipientCount
      );
    });

    return { recipientCount };
  }

  private queueForBatch(payload: TrinityNotificationPayload): void {
    const batchItem: BatchedNotification = {
      id: `batch-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      payload,
      scheduledFor: new Date(Date.now() + 5 * 60 * 1000),
      status: 'pending',
      retryCount: 0,
    };
    this.batchQueue.push(batchItem);
  }

  private startBatchProcessor(): void {
    this.batchInterval = setInterval(async () => {
      try {
      const now = new Date();
      const dueItems = this.batchQueue.filter(
        b => b.status === 'pending' && b.scheduledFor <= now
      );

      if (dueItems.length > 0) {
        log.info(`[TrinityNotificationBridge] Processing ${dueItems.length} batched notifications`);
        
        for (const item of dueItems) {
          try {
            await this.deliverImmediate(item.payload);
            item.status = 'delivered';
          } catch (error) {
            item.retryCount++;
            if (item.retryCount >= 3) {
              item.status = 'failed';
            } else {
              item.scheduledFor = new Date(Date.now() + 60 * 1000);
            }
          }
        }

        this.batchQueue = this.batchQueue.filter(
          b => b.status === 'pending' || (b.status !== 'delivered' && b.retryCount < 3)
        );
      }
      } catch (error: any) {
        log.warn('[TrinityNotificationBridge] Batch processing failed (will retry):', error?.message || 'unknown');
      }
    }, 30 * 1000);
  }

  private updateAverageDeliveryTime(newTime: number): void {
    const total = this.deliveryMetrics.totalSent + this.deliveryMetrics.totalFailed;
    this.deliveryMetrics.averageDeliveryTime = 
      (this.deliveryMetrics.averageDeliveryTime * (total - 1) + newTime) / total;
  }

  private async logDeployment(patch: LivePatchDelivery): Promise<void> {
    await db.insert(systemAuditLogs).values({
      workspaceId: 'system',
      action: 'live_patch_deployed',
      entityType: 'deployment',
      entityId: patch.patchId,
      userId: patch.deployedBy,
      metadata: {
        version: patch.version,
        title: patch.title,
        severity: patch.severity,
        category: patch.category,
        affectedSystems: patch.affectedSystems,
        requiresRefresh: patch.requiresRefresh,
        deployedAt: patch.deployedAt,
      },
    });
  }

  destroy(): void {
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
      this.batchInterval = null;
    }
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
  }

  /**
   * Get notification system metrics
   */
  getMetrics(): {
    totalSent: number;
    totalFailed: number;
    failureRate: number;
    averageDeliveryTime: number;
    queueDepth: number;
    failedInQueue: number;
    byChannel: Record<string, number>;
    health: 'healthy' | 'degraded' | 'unhealthy';
    lastCheck: Date;
  } {
    const failedInQueue = this.batchQueue.filter(b => b.status === 'failed').length;
    const pendingInQueue = this.batchQueue.filter(b => b.status === 'pending').length;
    
    let health: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const totalAttempts = this.deliveryMetrics.totalSent + this.deliveryMetrics.totalFailed;
    const failureRate = totalAttempts > 0 ? this.deliveryMetrics.totalFailed / totalAttempts : 0;
    
    // More than 10% failure rate = degraded
    if (failureRate > 0.1 || this.deliveryMetrics.totalFailed > 5) {
      health = 'degraded';
    }
    // More than 50% failure rate OR too many failed in queue = unhealthy
    if (failedInQueue > 10 || failureRate > 0.5 || this.deliveryMetrics.totalFailed > 20) {
      health = 'unhealthy';
    }

    return {
      totalSent: this.deliveryMetrics.totalSent,
      totalFailed: this.deliveryMetrics.totalFailed,
      failureRate: Math.round(failureRate * 100) / 100,
      averageDeliveryTime: Math.round(this.deliveryMetrics.averageDeliveryTime),
      queueDepth: pendingInQueue,
      failedInQueue,
      byChannel: Object.fromEntries(this.deliveryMetrics.byChannel),
      health,
      lastCheck: new Date(),
    };
  }

  /**
   * Notification System Watchdog - Self-monitoring for Trinity/AI Brain
   * Runs every 2 minutes to detect and alert about notification issues
   */
  private watchdogInterval: NodeJS.Timeout | null = null;
  private lastWatchdogAlert: Date | null = null;
  private consecutiveFailures = 0;

  startWatchdog(): void {
    if (this.watchdogInterval) return;

    log.info('[TrinityNotificationWatchdog] Starting self-monitoring...');
    
    this.watchdogInterval = setInterval(async () => {
      try {
        await this.runWatchdogCheck();
      } catch (error: any) {
        log.warn('[TrinityNotificationWatchdog] Check failed (will retry):', error?.message || 'unknown');
      }
    }, 2 * 60 * 1000);

    // Run initial check after 30 seconds
    setTimeout(() => this.runWatchdogCheck(), 30 * 1000);
  }

  private async runWatchdogCheck(): Promise<void> {
    // Skip watchdog check when DB circuit breaker is open — don't pile on a frozen DB
    try {
      const { isDbCircuitOpen } = await import('../../db');
      if (isDbCircuitOpen()) return;
    } catch { /* ignore */ }
    
    const issues: string[] = [];
    const metrics = this.getMetrics();

    // Check 1: High failure rate
    if (metrics.health === 'unhealthy') {
      issues.push(`High notification failure rate: ${metrics.totalFailed}/${metrics.totalSent + metrics.totalFailed} failed`);
    }

    // Check 2: Queue backup
    if (metrics.queueDepth > 50) {
      issues.push(`Notification queue backing up: ${metrics.queueDepth} pending items`);
    }

    // Check 3: Slow delivery times
    if (metrics.averageDeliveryTime > 5000) {
      issues.push(`Slow notification delivery: ${metrics.averageDeliveryTime}ms average`);
    }

    // Check 4: Failed items stuck in queue
    if (metrics.failedInQueue > 5) {
      issues.push(`${metrics.failedInQueue} failed notifications stuck in queue`);
    }

    // Check 5: WebSocket connectivity test
    try {
      const wsTest = await this.testWebSocketDelivery();
      if (!wsTest.success) {
        issues.push('WebSocket server not operational');
      }
      // Log connection stats for monitoring
      if (wsTest.activeConnections !== undefined && wsTest.activeConnections === 0) {
        // Not an issue - just informational that no clients are connected
        log.info('[TrinityNotificationWatchdog] No active WebSocket connections (normal during quiet periods)');
      }
    } catch (error) {
      issues.push('WebSocket connectivity check failed');
    }

    // Check 6: Database notification table accessibility
    try {
      const dbTest = await this.testDatabaseAccess();
      if (!dbTest.success) {
        issues.push(`Database notification access issue: ${dbTest.error}`);
      }
    } catch (error: any) {
      issues.push(`Database access error: ${(error instanceof Error ? error.message : String(error))}`);
    }

    if (issues.length > 0) {
      this.consecutiveFailures++;
      
      // Alert Trinity/AI Brain about issues (but not too frequently)
      const shouldAlert = !this.lastWatchdogAlert || 
        (Date.now() - this.lastWatchdogAlert.getTime() > 10 * 60 * 1000); // Max once per 10 minutes

      if (shouldAlert) {
        await this.alertTrinityAboutIssues(issues, metrics);
        this.lastWatchdogAlert = new Date();
      }

      log.warn('[TrinityNotificationWatchdog] Issues detected:', issues);
    } else {
      // Reset failure counter on successful check
      if (this.consecutiveFailures > 0) {
        log.info('[TrinityNotificationWatchdog] Issues resolved, system healthy');
        this.consecutiveFailures = 0;
      }
    }
  }

  private async testWebSocketDelivery(): Promise<{ success: boolean; activeConnections?: number }> {
    try {
      // Get real connection stats to verify WebSocket is operational
      const stats = getLiveConnectionStats();
      const hasActiveServer = stats && typeof stats === 'object';
      const totalConnections = stats?.totalConnections || 0;
      
      // Consider healthy if server is operational (even with 0 connections during quiet periods)
      return { 
        success: hasActiveServer, 
        activeConnections: totalConnections 
      };
    } catch {
      return { success: false };
    }
  }

  private async testDatabaseAccess(): Promise<{ success: boolean; error?: string }> {
    try {
      // Test notification table access
      const result = await db.select({ count: sql<number>`COUNT(*)` })
        .from(notifications)
        .limit(1);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  private async alertTrinityAboutIssues(issues: string[], metrics: any): Promise<void> {
    log.info('[TrinityNotificationWatchdog] Alerting Trinity/AI Brain about notification system issues');

    // Create internal alert for support/admin staff
    try {
      const { probeDbConnection } = await import('../../db');
      const dbOk = await probeDbConnection();
      if (!dbOk) {
        log.warn('[TrinityNotificationWatchdog] Skipping DB alert — probe failed');
        broadcastToAllClients({
          type: 'trinity_system_alert',
          payload: { source: 'notification_watchdog', issues, metrics, timestamp: new Date().toISOString() },
        });
        return;
      }
      // Log to system audit for tracking
      await db.insert(systemAuditLogs).values({
        workspaceId: 'system',
        action: 'notification_watchdog_alert',
        entityType: 'notification_system',
        entityId: 'watchdog',
        metadata: {
          issues,
          metrics,
          consecutiveFailures: this.consecutiveFailures,
          timestamp: new Date().toISOString(),
        },
      });

      // Broadcast alert to connected support staff via WebSocket
      broadcastToAllClients({
        type: 'trinity_system_alert',
        payload: {
          source: 'notification_watchdog',
          severity: this.consecutiveFailures >= 3 ? 'critical' : 'warning',
          title: 'Notification System Issue Detected',
          message: `I detected ${issues.length} notification system issue(s) requiring attention`,
          issues,
          metrics: {
            health: metrics.health,
            queueDepth: metrics.queueDepth,
            failedInQueue: metrics.failedInQueue,
            averageDeliveryTime: metrics.averageDeliveryTime,
          },
          actionRequired: true,
          timestamp: new Date().toISOString(),
        },
      });

      // Also publish through platform event bus for AI Brain to pick up
      await platformEventBus.publish({
        type: 'bugfix_deployed',
        title: 'Notification System Issue Detected',
        description: `I detected ${issues.length} notification issue(s): ${issues.join('; ')}`,
        category: 'system',
        version: '1.0.0',
        metadata: {
          issues,
          severity: this.consecutiveFailures >= 3 ? 'critical' : 'warning',
        },
      });

    } catch (error) {
      log.error('[TrinityNotificationWatchdog] Failed to send alert:', error);
    }
  }

  /**
   * Get watchdog status for health monitoring
   */
  getWatchdogStatus(): {
    running: boolean;
    lastAlert: Date | null;
    consecutiveFailures: number;
    systemHealth: 'healthy' | 'degraded' | 'unhealthy';
  } {
    return {
      running: this.watchdogInterval !== null,
      lastAlert: this.lastWatchdogAlert,
      consecutiveFailures: this.consecutiveFailures,
      systemHealth: this.getMetrics().health,
    };
  }
}

export const trinityNotificationBridge = new TrinityNotificationBridge();

// Auto-start the watchdog on module load
trinityNotificationBridge.startWatchdog();

export default trinityNotificationBridge;
