/**
 * Notification Acknowledgment & Escalation Service
 * 
 * Tracks notification delivery, acknowledgment, and escalation:
 * - Persistent acknowledgment tracking
 * - SLA-based escalation timers
 * - Multi-channel delivery confirmation
 * - Escalation chain management
 * 
 * Ensures critical notifications reach recipients or escalate appropriately
 */

import { db } from '../../db';
import { trackedNotifications } from '@shared/schema';
import { sql } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import { helpaiOrchestrator } from '../helpai/platformActionHub';
import { typedQuery } from '../../lib/typedSql';
import { publishEvent } from './pipelineErrorHandler';
import { createLogger } from '../../lib/logger';
const log = createLogger('notificationAcknowledgmentService');


export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'push' | 'webhook';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export type AcknowledgmentStatus = 
  | 'pending'
  | 'delivered'
  | 'seen'
  | 'acknowledged'
  | 'actioned'
  | 'expired'
  | 'escalated'
  | 'failed';

export interface TrackedNotification {
  id: string;
  workspaceId: string;
  recipientId: string;
  recipientType: 'user' | 'role' | 'team' | 'all';
  channel: NotificationChannel;
  priority: NotificationPriority;
  status: AcknowledgmentStatus;
  title: string;
  body: string;
  actionUrl?: string;
  actionRequired: boolean;
  sentAt: Date;
  deliveredAt?: Date;
  seenAt?: Date;
  acknowledgedAt?: Date;
  actionedAt?: Date;
  expiresAt?: Date;
  escalationDeadline?: Date;
  escalationLevel: number;
  escalatedAt?: Date;
  escalatedTo?: string;
  retryCount: number;
  lastRetryAt?: Date;
  metadata: Record<string, unknown>;
  sourceType?: string;
  sourceId?: string;
}

export interface EscalationPolicy {
  priority: NotificationPriority;
  initialDeadlineMinutes: number;
  maxEscalationLevel: number;
  escalationIntervalMinutes: number;
  escalationTargets: string[];
  channels: NotificationChannel[];
}

const DEFAULT_ESCALATION_POLICIES: EscalationPolicy[] = [
  {
    priority: 'urgent',
    initialDeadlineMinutes: 15,
    maxEscalationLevel: 3,
    escalationIntervalMinutes: 10,
    escalationTargets: ['manager', 'org_admin', 'root_admin'],
    channels: ['in_app', 'email', 'sms', 'push'],
  },
  {
    priority: 'high',
    initialDeadlineMinutes: 60,
    maxEscalationLevel: 2,
    escalationIntervalMinutes: 30,
    escalationTargets: ['manager', 'admin'],
    channels: ['in_app', 'email', 'push'],
  },
  {
    priority: 'medium',
    initialDeadlineMinutes: 240,
    maxEscalationLevel: 1,
    escalationIntervalMinutes: 120,
    escalationTargets: ['manager'],
    channels: ['in_app', 'email'],
  },
  {
    priority: 'low',
    initialDeadlineMinutes: 1440,
    maxEscalationLevel: 0,
    escalationIntervalMinutes: 0,
    escalationTargets: [],
    channels: ['in_app'],
  },
];

class NotificationAcknowledgmentService {
  private notifications = new Map<string, TrackedNotification>();
  private policies = new Map<NotificationPriority, EscalationPolicy>();
  private escalationCheckInterval: NodeJS.Timeout | null = null;
  private readonly MAX_RETRIES = 3;

  constructor() {
    DEFAULT_ESCALATION_POLICIES.forEach(policy => {
      this.policies.set(policy.priority, policy);
    });

    this.escalationCheckInterval = setInterval(() => this.checkEscalations(), 60000);
  }

  async trackNotification(params: {
    workspaceId: string;
    recipientId: string;
    recipientType?: 'user' | 'role' | 'team' | 'all';
    channel: NotificationChannel;
    priority?: NotificationPriority;
    title: string;
    body: string;
    actionUrl?: string;
    actionRequired?: boolean;
    expiresInMinutes?: number;
    metadata?: Record<string, unknown>;
    sourceType?: string;
    sourceId?: string;
  }): Promise<TrackedNotification> {
    const {
      workspaceId,
      recipientId,
      recipientType = 'user',
      channel,
      priority = 'normal',
      title,
      body,
      actionUrl,
      actionRequired = false,
      expiresInMinutes,
      metadata = {},
      sourceType,
      sourceId,
    } = params;

    const id = this.generateNotificationId();
    const now = new Date();
    const policy = this.policies.get(priority);

    const notification: TrackedNotification = {
      id,
      workspaceId,
      recipientId,
      recipientType,
      channel,
      priority,
      status: 'pending',
      title,
      body,
      actionUrl,
      actionRequired,
      sentAt: now,
      expiresAt: expiresInMinutes ? new Date(now.getTime() + expiresInMinutes * 60000) : undefined,
      escalationDeadline: actionRequired && policy
        ? new Date(now.getTime() + policy.initialDeadlineMinutes * 60000)
        : undefined,
      escalationLevel: 0,
      retryCount: 0,
      metadata,
      sourceType,
      sourceId,
    };

    this.notifications.set(id, notification);
    await this.persistNotification(notification);

    log.info(`[AcknowledgmentService] Tracking notification: ${id} (${priority}) to ${recipientId}`);

    return notification;
  }

  async markDelivered(notificationId: string, channel?: NotificationChannel): Promise<boolean> {
    const notification = this.notifications.get(notificationId);
    if (!notification) return false;

    notification.status = 'delivered';
    notification.deliveredAt = new Date();
    if (channel) {
      notification.channel = channel;
    }

    this.notifications.set(notificationId, notification);
    await this.persistNotification(notification);

    return true;
  }

  async markSeen(notificationId: string): Promise<boolean> {
    const notification = this.notifications.get(notificationId);
    if (!notification) return false;

    if (notification.status === 'pending' || notification.status === 'delivered') {
      notification.status = 'seen';
      notification.seenAt = new Date();

      this.notifications.set(notificationId, notification);
      await this.persistNotification(notification);
    }

    return true;
  }

  async acknowledge(notificationId: string, userId: string): Promise<boolean> {
    const notification = this.notifications.get(notificationId);
    if (!notification) return false;

    notification.status = 'acknowledged';
    notification.acknowledgedAt = new Date();

    this.notifications.set(notificationId, notification);
    await this.persistNotification(notification);

    publishEvent(
      () => platformEventBus.publish({
        type: 'notification_acknowledged',
        workspaceId: notification.workspaceId,
        payload: {
          notificationId,
          acknowledgedBy: userId,
          title: notification.title,
          priority: notification.priority,
        },
        metadata: { source: 'NotificationAcknowledgmentService' },
      }),
      '[NotificationAcknowledgmentService] event publish',
    );

    log.info(`[AcknowledgmentService] Acknowledged: ${notificationId} by ${userId}`);

    return true;
  }

  async markActioned(notificationId: string, userId: string, actionTaken?: string): Promise<boolean> {
    const notification = this.notifications.get(notificationId);
    if (!notification) return false;

    notification.status = 'actioned';
    notification.actionedAt = new Date();
    if (actionTaken) {
      notification.metadata.actionTaken = actionTaken;
    }

    this.notifications.set(notificationId, notification);
    await this.persistNotification(notification);

    publishEvent(
      () => platformEventBus.publish({
        type: 'notification_actioned',
        workspaceId: notification.workspaceId,
        payload: {
          notificationId,
          actionedBy: userId,
          actionTaken,
          title: notification.title,
        },
        metadata: { source: 'NotificationAcknowledgmentService' },
      }),
      '[NotificationAcknowledgmentService] event publish',
    );

    return true;
  }

  async markFailed(notificationId: string, reason: string): Promise<boolean> {
    const notification = this.notifications.get(notificationId);
    if (!notification) return false;

    notification.retryCount += 1;
    notification.lastRetryAt = new Date();
    notification.metadata.lastFailureReason = reason;

    if (notification.retryCount >= this.MAX_RETRIES) {
      notification.status = 'failed';
      
      publishEvent(
        () => platformEventBus.publish({
          type: 'notification_failed',
          workspaceId: notification.workspaceId,
          payload: {
            notificationId,
            recipientId: notification.recipientId,
            title: notification.title,
            reason,
            retryCount: notification.retryCount,
          },
          metadata: { source: 'NotificationAcknowledgmentService', priority: 'high' },
        }),
        '[NotificationAcknowledgmentService] event publish',
      );
    }

    this.notifications.set(notificationId, notification);
    await this.persistNotification(notification);

    return true;
  }

  async getUnacknowledged(workspaceId: string, recipientId?: string): Promise<TrackedNotification[]> {
    const pendingStatuses: AcknowledgmentStatus[] = ['pending', 'delivered', 'seen'];
    
    return Array.from(this.notifications.values())
      .filter(n => 
        n.workspaceId === workspaceId &&
        pendingStatuses.includes(n.status) &&
        (!recipientId || n.recipientId === recipientId)
      )
      .sort((a, b) => {
        const priorityOrder: Record<NotificationPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
  }

  async getEscalationStatus(workspaceId: string): Promise<{
    pendingEscalation: TrackedNotification[];
    escalated: TrackedNotification[];
    overdueCount: number;
  }> {
    const now = new Date();
    const all = Array.from(this.notifications.values())
      .filter(n => n.workspaceId === workspaceId && n.actionRequired);

    const pendingEscalation = all.filter(n =>
      n.escalationDeadline &&
      n.escalationDeadline < now &&
      n.status !== 'acknowledged' &&
      n.status !== 'actioned' &&
      n.status !== 'escalated'
    );

    const escalated = all.filter(n => n.status === 'escalated');

    const overdueCount = pendingEscalation.length + escalated.filter(n =>
      n.escalationDeadline && n.escalationDeadline < now
    ).length;

    return { pendingEscalation, escalated, overdueCount };
  }

  private async checkEscalations(): Promise<void> {
    const now = new Date();

    for (const [id, notification] of this.notifications.entries()) {
      if (!notification.actionRequired || !notification.escalationDeadline) {
        continue;
      }

      if (notification.status === 'acknowledged' || notification.status === 'actioned' || notification.status === 'expired') {
        continue;
      }

      if (notification.expiresAt && notification.expiresAt < now) {
        notification.status = 'expired';
        this.notifications.set(id, notification);
        await this.persistNotification(notification);
        continue;
      }

      if (notification.escalationDeadline < now) {
        const policy = this.policies.get(notification.priority);
        if (!policy || notification.escalationLevel >= policy.maxEscalationLevel) {
          continue;
        }

        notification.escalationLevel += 1;
        notification.status = 'escalated';
        notification.escalatedAt = now;
        notification.escalationDeadline = new Date(now.getTime() + policy.escalationIntervalMinutes * 60000);

        const targetRole = policy.escalationTargets[notification.escalationLevel - 1];
        if (targetRole) {
          notification.escalatedTo = targetRole;
        }

        this.notifications.set(id, notification);
        await this.persistNotification(notification);

        publishEvent(
          () => platformEventBus.publish({
            type: 'notification_escalated',
            workspaceId: notification.workspaceId,
            payload: {
              notificationId: id,
              title: notification.title,
              priority: notification.priority,
              escalationLevel: notification.escalationLevel,
              escalatedTo: notification.escalatedTo,
              originalRecipient: notification.recipientId,
            },
            metadata: { source: 'NotificationAcknowledgmentService', priority: 'high' },
          }),
          '[NotificationAcknowledgmentService] event publish',
        );

        log.info(`[AcknowledgmentService] Escalated: ${id} to level ${notification.escalationLevel}`);
      }
    }
  }

  private generateNotificationId(): string {
    return `notif-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
  }

  private async persistNotification(notification: TrackedNotification): Promise<void> {
    try {
      // Converted to Drizzle ORM: ON CONFLICT
      const notifJson = JSON.stringify(notification);
      await db.insert(trackedNotifications).values({
        id: notification.id,
        workspaceId: notification.workspaceId,
        notificationData: notifJson,
        updatedAt: sql`now()`,
      }).onConflictDoUpdate({
        target: trackedNotifications.id,
        set: { notificationData: notifJson, updatedAt: sql`now()` },
      });
    } catch (error) {
      log.warn('[AcknowledgmentService] Failed to persist notification (table may not exist):', error);
    }
  }

  getStats(): {
    total: number;
    pending: number;
    delivered: number;
    acknowledged: number;
    escalated: number;
    failed: number;
    byPriority: Record<string, number>;
    byChannel: Record<string, number>;
  } {
    const notifications = Array.from(this.notifications.values());
    const byPriority: Record<string, number> = {};
    const byChannel: Record<string, number> = {};

    notifications.forEach(n => {
      byPriority[n.priority] = (byPriority[n.priority] || 0) + 1;
      byChannel[n.channel] = (byChannel[n.channel] || 0) + 1;
    });

    return {
      total: notifications.length,
      pending: notifications.filter(n => n.status === 'pending').length,
      delivered: notifications.filter(n => n.status === 'delivered').length,
      acknowledged: notifications.filter(n => n.status === 'acknowledged' || n.status === 'actioned').length,
      escalated: notifications.filter(n => n.status === 'escalated').length,
      failed: notifications.filter(n => n.status === 'failed').length,
      byPriority,
      byChannel,
    };
  }

  shutdown(): void {
    if (this.escalationCheckInterval) {
      clearInterval(this.escalationCheckInterval);
      this.escalationCheckInterval = null;
    }
  }
}

export const notificationAcknowledgmentService = new NotificationAcknowledgmentService();

export function registerNotificationAckActions(orchestrator: typeof helpaiOrchestrator): void {
  orchestrator.registerAction({
    actionId: 'notification_ack.track',
    name: 'Track Notification',
    category: 'notifications',
    description: 'Track a notification for acknowledgment',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
    handler: async (request) => {
      const { recipientId, channel, priority, title, body, actionUrl, actionRequired, expiresInMinutes, metadata } = request.payload || {};

      if (!request.workspaceId || !recipientId || !channel || !title) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'workspaceId, recipientId, channel, and title are required',
          executionTimeMs: 0,
        };
      }

      const notification = await notificationAcknowledgmentService.trackNotification({
        workspaceId: request.workspaceId,
        recipientId,
        channel,
        priority,
        title,
        body: body || title,
        actionUrl,
        actionRequired,
        expiresInMinutes,
        metadata,
      });

      return {
        success: true,
        actionId: request.actionId,
        message: 'Notification tracked',
        data: notification,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'notification_ack.acknowledge',
    name: 'Acknowledge Notification',
    category: 'notifications',
    description: 'Acknowledge receipt of a notification',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
    handler: async (request) => {
      const { notificationId } = request.payload || {};

      if (!notificationId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'notificationId is required',
          executionTimeMs: 0,
        };
      }

      const success = await notificationAcknowledgmentService.acknowledge(notificationId, request.userId);

      return {
        success,
        actionId: request.actionId,
        message: success ? 'Notification acknowledged' : 'Notification not found',
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'notification_ack.mark_actioned',
    name: 'Mark Notification Actioned',
    category: 'notifications',
    description: 'Mark a notification as actioned',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
    handler: async (request) => {
      const { notificationId, actionTaken } = request.payload || {};

      if (!notificationId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'notificationId is required',
          executionTimeMs: 0,
        };
      }

      const success = await notificationAcknowledgmentService.markActioned(notificationId, request.userId, actionTaken);

      return {
        success,
        actionId: request.actionId,
        message: success ? 'Notification marked as actioned' : 'Notification not found',
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'notification_ack.get_unacknowledged',
    name: 'Get Unacknowledged Notifications',
    category: 'notifications',
    description: 'Get all unacknowledged notifications',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
    handler: async (request) => {
      const { recipientId } = request.payload || {};

      if (!request.workspaceId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'workspaceId is required',
          executionTimeMs: 0,
        };
      }

      const notifications = await notificationAcknowledgmentService.getUnacknowledged(
        request.workspaceId,
        recipientId || request.userId
      );

      return {
        success: true,
        actionId: request.actionId,
        message: `${notifications.length} unacknowledged notifications`,
        data: notifications,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'notification_ack.get_escalation_status',
    name: 'Get Escalation Status',
    category: 'notifications',
    description: 'Get notification escalation status for workspace',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request) => {
      if (!request.workspaceId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'workspaceId is required',
          executionTimeMs: 0,
        };
      }

      const status = await notificationAcknowledgmentService.getEscalationStatus(request.workspaceId);

      return {
        success: true,
        actionId: request.actionId,
        message: `${status.overdueCount} overdue notifications`,
        data: status,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'notification_ack.get_stats',
    name: 'Get Notification Acknowledgment Stats',
    category: 'analytics',
    description: 'Get platform-wide notification acknowledgment statistics',
    requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (request) => {
      const stats = notificationAcknowledgmentService.getStats();
      return {
        success: true,
        actionId: request.actionId,
        message: 'Notification acknowledgment stats retrieved',
        data: stats,
        executionTimeMs: 0,
      };
    },
  });

  log.info('[NotificationAcknowledgmentService] Registered 6 AI Brain actions');
}
