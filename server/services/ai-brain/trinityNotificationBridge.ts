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
import { broadcastToAllClients, broadcastToWorkspace, broadcastNotificationToUser } from '../../websocket';
import { publishPlatformUpdate, platformEventBus } from '../platformEventBus';
import { notificationStateManager } from '../notificationStateManager';
import { UniversalNotificationEngine } from '../universalNotificationEngine';

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
    console.log('[TrinityNotificationBridge] Fortune 500-grade notification orchestration initialized');
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
      errors.push(error.message);
      console.error('[TrinityNotificationBridge] Delivery error:', error);

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
    console.log(`[TrinityNotificationBridge] Delivering live patch: ${patch.patchId} v${patch.version}`);

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
    console.log(`[TrinityNotificationBridge] Pushing What's New: ${options.title}`);

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
      workspaceId: options.workspaceId,
      createdBy: options.pushedBy,
      isNew: true,
      date: new Date(),
    }).returning();

    await publishPlatformUpdate({
      type: 'announcement',
      category: options.category,
      title: options.title,
      description: options.description,
      version: options.version,
      priority: options.priority || 5,
      visibility: options.visibility || 'all',
      workspaceId: options.workspaceId,
      learnMoreUrl: options.learnMoreUrl,
    });

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
    console.log(`[TrinityNotificationBridge] Support escalation: ${options.title} (${options.severity})`);

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
    console.log(`[TrinityNotificationBridge] Maintenance alert: ${options.title}`);

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
        for (const userId of payload.targetAudience.userIds) {
          const [notification] = await db.insert(notifications).values({
            workspaceId: payload.targetAudience.workspaceId || null,
            scope: payload.targetAudience.workspaceId ? 'workspace' : 'user',
            userId,
            type: 'system',
            title: payload.title,
            message: payload.message,
            actionUrl: payload.metadata?.actionUrl,
            isRead: false,
            metadata: {
              source: payload.source,
              category: payload.category,
              priority: payload.priority,
              aiGenerated: payload.metadata?.aiGenerated,
              trinityMode: payload.metadata?.trinityMode,
              badge: payload.metadata?.badge,
            },
          }).returning();

          broadcastNotificationToUser(
            payload.targetAudience.workspaceId || 'global',
            userId,
            {
              id: notification.id,
              type: 'system',
              title: payload.title,
              message: payload.message,
              severity: payload.priority,
              actionUrl: payload.metadata?.actionUrl,
              createdAt: notification.createdAt,
            }
          );
          recipientCount++;
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
      id: `batch-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      payload,
      scheduledFor: new Date(Date.now() + 5 * 60 * 1000),
      status: 'pending',
      retryCount: 0,
    };
    this.batchQueue.push(batchItem);
  }

  private startBatchProcessor(): void {
    this.batchInterval = setInterval(async () => {
      const now = new Date();
      const dueItems = this.batchQueue.filter(
        b => b.status === 'pending' && b.scheduledFor <= now
      );

      if (dueItems.length > 0) {
        console.log(`[TrinityNotificationBridge] Processing ${dueItems.length} batched notifications`);
        
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
    }, 30 * 1000);
  }

  private updateAverageDeliveryTime(newTime: number): void {
    const total = this.deliveryMetrics.totalSent + this.deliveryMetrics.totalFailed;
    this.deliveryMetrics.averageDeliveryTime = 
      (this.deliveryMetrics.averageDeliveryTime * (total - 1) + newTime) / total;
  }

  private async logDeployment(patch: LivePatchDelivery): Promise<void> {
    await db.insert(systemAuditLogs).values({
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
  }
}

export const trinityNotificationBridge = new TrinityNotificationBridge();
export default trinityNotificationBridge;
