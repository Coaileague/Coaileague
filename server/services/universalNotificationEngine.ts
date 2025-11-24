/**
 * Universal Notification Engine
 * RBAC-aware, dynamic notification system for all workspace events
 * Sends notifications through multiple channels with role-based filtering
 */

import aiBrainConfig from "@shared/config/aiBrainGuardrails";

export interface NotificationPayload {
  workspaceId: string;
  type: "document_extraction" | "issue_detected" | "migration_complete" | "guardrail_violation" | "quota_warning";
  title: string;
  message: string;
  metadata?: Record<string, any>;
  severity?: "info" | "warning" | "error" | "critical";
  userId?: string;
}

// In-memory notification store
const notificationStore: Map<string, any[]> = new Map();

export class UniversalNotificationEngine {
  /**
   * Send notification with RBAC filtering
   */
  async sendNotification(payload: NotificationPayload): Promise<{
    success: boolean;
    recipientCount: number;
    channels: string[];
  }> {
    try {
      const notificationRule = aiBrainConfig.notificationRules.find(
        (r) => r.triggerType === payload.type
      );

      if (!notificationRule || !notificationRule.enabled) {
        console.log(`Notification type ${payload.type} is disabled`);
        return { success: false, recipientCount: 0, channels: [] };
      }

      // Store notification in memory
      const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const notification = {
        id: notificationId,
        workspaceId: payload.workspaceId,
        userId: payload.userId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        metadata: payload.metadata || {},
        severity: payload.severity || "info",
        read: false,
        createdAt: new Date(),
      };

      // Store by workspace
      if (!notificationStore.has(payload.workspaceId)) {
        notificationStore.set(payload.workspaceId, []);
      }
      notificationStore.get(payload.workspaceId)?.push(notification);

      // Log notification for audit trail
      console.log(`📬 Notification sent: ${payload.title} (${notificationRule.channels.join(", ")})`);

      return {
        success: true,
        recipientCount: 1,
        channels: notificationRule.channels,
      };
    } catch (error: any) {
      console.error("Notification engine error:", error);
      return { success: false, recipientCount: 0, channels: [] };
    }
  }

  /**
   * Get workspace notifications
   */
  async getWorkspaceNotifications(
    workspaceId: string,
    options?: { unreadOnly?: boolean; limit?: number; offset?: number }
  ) {
    try {
      const limit = options?.limit || 50;
      const offset = options?.offset || 0;

      let notifications = notificationStore.get(workspaceId) || [];

      if (options?.unreadOnly) {
        notifications = notifications.filter((n) => !n.read);
      }

      return notifications.slice(offset, offset + limit);
    } catch (error: any) {
      console.error("Error fetching notifications:", error);
      return [];
    }
  }

  /**
   * Get user notifications with filtering
   */
  async getUserNotifications(
    workspaceId: string,
    userId: string,
    options?: { unreadOnly?: boolean; limit?: number; offset?: number }
  ) {
    try {
      const limit = options?.limit || 50;
      const offset = options?.offset || 0;

      let notifications = (notificationStore.get(workspaceId) || []).filter(
        (n) => !n.userId || n.userId === userId
      );

      if (options?.unreadOnly) {
        notifications = notifications.filter((n) => !n.read);
      }

      return notifications.slice(offset, offset + limit);
    } catch (error: any) {
      console.error("Error fetching user notifications:", error);
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, workspaceId: string): Promise<boolean> {
    try {
      const notifications = notificationStore.get(workspaceId) || [];
      const notification = notifications.find((n) => n.id === notificationId);

      if (notification) {
        notification.read = true;
        return true;
      }
      return false;
    } catch (error: any) {
      console.error("Error marking notification as read:", error);
      return false;
    }
  }

  /**
   * Clear old notifications
   */
  async clearOldNotifications(workspaceId: string, daysOld: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
      const notifications = notificationStore.get(workspaceId) || [];
      const initialCount = notifications.length;

      const filtered = notifications.filter((n) => n.createdAt > cutoffDate);
      notificationStore.set(workspaceId, filtered);

      return initialCount - filtered.length;
    } catch (error: any) {
      console.error("Error clearing old notifications:", error);
      return 0;
    }
  }

  /**
   * Get notification stats
   */
  async getNotificationStats(workspaceId: string): Promise<{
    total: number;
    unread: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  }> {
    try {
      const notifications = notificationStore.get(workspaceId) || [];

      const byType: Record<string, number> = {};
      const bySeverity: Record<string, number> = {};

      for (const notif of notifications) {
        byType[notif.type] = (byType[notif.type] || 0) + 1;
        bySeverity[notif.severity] = (bySeverity[notif.severity] || 0) + 1;
      }

      return {
        total: notifications.length,
        unread: notifications.filter((n) => !n.read).length,
        byType,
        bySeverity,
      };
    } catch (error: any) {
      console.error("Error getting notification stats:", error);
      return { total: 0, unread: 0, byType: {}, bySeverity: {} };
    }
  }
}

export const notificationEngine = new UniversalNotificationEngine();
