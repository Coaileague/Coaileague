/**
 * Universal Notification Engine
 * RBAC-aware, dynamic notification system for all workspace events
 * Sends notifications through multiple channels with role-based filtering
 * Now uses database persistence instead of in-memory storage
 */

import { db } from '../db';
import { notifications, users, employees } from '@shared/schema';
import { eq, and, desc, inArray, isNull, or } from 'drizzle-orm';
import aiBrainConfig from "@shared/config/aiBrainGuardrails";

export interface NotificationPayload {
  workspaceId: string;
  type: "document_extraction" | "issue_detected" | "migration_complete" | "guardrail_violation" | "quota_warning" | "platform_update" | "system";
  title: string;
  message: string;
  metadata?: Record<string, any>;
  severity?: "info" | "warning" | "error" | "critical";
  userId?: string;
  targetRoles?: string[]; // RBAC: Only send to these roles
  actionUrl?: string;
}

export class UniversalNotificationEngine {
  /**
   * Send notification with RBAC filtering
   * Persists to database for all notifications
   */
  async sendNotification(payload: NotificationPayload): Promise<{
    success: boolean;
    recipientCount: number;
    channels: string[];
    notificationIds: string[];
  }> {
    try {
      const notificationRule = aiBrainConfig.notificationRules.find(
        (r) => r.triggerType === payload.type
      );

      if (!notificationRule || !notificationRule.enabled) {
        console.log(`[UniversalNotificationEngine] Notification type ${payload.type} is disabled`);
        return { success: false, recipientCount: 0, channels: [], notificationIds: [] };
      }

      const notificationIds: string[] = [];
      let recipientCount = 0;

      // If specific userId provided, send to that user only
      if (payload.userId) {
        const [notification] = await db
          .insert(notifications)
          .values({
            workspaceId: payload.workspaceId,
            userId: payload.userId,
            type: payload.type as any,
            title: payload.title,
            message: payload.message,
            actionUrl: payload.actionUrl,
            metadata: {
              ...payload.metadata,
              severity: payload.severity || 'info',
            },
            isRead: false,
          })
          .returning();
        
        notificationIds.push(notification.id);
        recipientCount = 1;
      } else if (payload.targetRoles && payload.targetRoles.length > 0) {
        // RBAC: Send to all users with specified roles in workspace
        const workspaceEmployees = await db.query.employees.findMany({
          where: and(
            eq(employees.workspaceId, payload.workspaceId),
            eq(employees.isActive, true)
          ),
          columns: { userId: true, workspaceRole: true },
        });
        
        // Filter by target roles (since inArray requires proper typing)
        const filteredEmployees = workspaceEmployees.filter(
          emp => payload.targetRoles!.includes(emp.workspaceRole as string)
        );

        for (const emp of filteredEmployees) {
          if (emp.userId) {
            const [notification] = await db
              .insert(notifications)
              .values({
                workspaceId: payload.workspaceId,
                userId: emp.userId,
                type: payload.type as any,
                title: payload.title,
                message: payload.message,
                actionUrl: payload.actionUrl,
                metadata: {
                  ...payload.metadata,
                  severity: payload.severity || 'info',
                },
                isRead: false,
              })
              .returning();
            
            notificationIds.push(notification.id);
            recipientCount++;
          }
        }
      } else {
        // Send to all active employees in workspace
        const workspaceEmployees = await db.query.employees.findMany({
          where: and(
            eq(employees.workspaceId, payload.workspaceId),
            eq(employees.isActive, true)
          ),
          columns: { userId: true },
        });

        for (const emp of workspaceEmployees) {
          if (emp.userId) {
            const [notification] = await db
              .insert(notifications)
              .values({
                workspaceId: payload.workspaceId,
                userId: emp.userId,
                type: payload.type as any,
                title: payload.title,
                message: payload.message,
                actionUrl: payload.actionUrl,
                metadata: {
                  ...payload.metadata,
                  severity: payload.severity || 'info',
                },
                isRead: false,
              })
              .returning();
            
            notificationIds.push(notification.id);
            recipientCount++;
          }
        }
      }

      console.log(`[UniversalNotificationEngine] Notification sent: ${payload.title} to ${recipientCount} recipients (${notificationRule.channels.join(", ")})`);

      return {
        success: true,
        recipientCount,
        channels: notificationRule.channels,
        notificationIds,
      };
    } catch (error: any) {
      console.error("[UniversalNotificationEngine] Error:", error);
      return { success: false, recipientCount: 0, channels: [], notificationIds: [] };
    }
  }

  /**
   * Send platform-wide notification to all admins across all workspaces
   */
  async sendPlatformNotification(payload: {
    type: string;
    title: string;
    message: string;
    metadata?: Record<string, any>;
    severity?: "info" | "warning" | "error" | "critical";
    actionUrl?: string;
    targetRoles?: string[];
  }): Promise<{
    success: boolean;
    recipientCount: number;
  }> {
    try {
      const targetRoles = payload.targetRoles || ['org_owner', 'org_admin'];
      
      // Get all active admins across all workspaces
      const allEmployees = await db.query.employees.findMany({
        where: eq(employees.isActive, true),
        columns: { userId: true, workspaceId: true, workspaceRole: true },
      });
      
      // Filter by target roles
      const admins = allEmployees.filter(
        emp => targetRoles.includes(emp.workspaceRole as string)
      );

      let recipientCount = 0;
      for (const admin of admins) {
        if (admin.userId && admin.workspaceId) {
          await db.insert(notifications).values({
            workspaceId: admin.workspaceId,
            userId: admin.userId,
            type: 'system' as any,
            title: payload.title,
            message: payload.message,
            actionUrl: payload.actionUrl || '/whats-new',
            metadata: {
              ...payload.metadata,
              severity: payload.severity || 'info',
              platformNotification: true,
            },
            isRead: false,
          });
          recipientCount++;
        }
      }

      console.log(`[UniversalNotificationEngine] Platform notification sent to ${recipientCount} admins`);

      return {
        success: true,
        recipientCount,
      };
    } catch (error: any) {
      console.error("[UniversalNotificationEngine] Platform notification error:", error);
      return { success: false, recipientCount: 0 };
    }
  }

  /**
   * Get workspace notifications from database
   */
  async getWorkspaceNotifications(
    workspaceId: string,
    options?: { unreadOnly?: boolean; limit?: number; offset?: number }
  ) {
    try {
      const limit = options?.limit || 50;
      const offset = options?.offset || 0;

      const conditions = [eq(notifications.workspaceId, workspaceId)];
      if (options?.unreadOnly) {
        conditions.push(eq(notifications.isRead, false));
      }

      const results = await db.query.notifications.findMany({
        where: and(...conditions),
        orderBy: [desc(notifications.createdAt)],
        limit,
        offset,
      });

      return results;
    } catch (error: any) {
      console.error("[UniversalNotificationEngine] Error fetching notifications:", error);
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

      const conditions = [
        eq(notifications.workspaceId, workspaceId),
        eq(notifications.userId, userId),
      ];
      
      if (options?.unreadOnly) {
        conditions.push(eq(notifications.isRead, false));
      }

      const results = await db.query.notifications.findMany({
        where: and(...conditions),
        orderBy: [desc(notifications.createdAt)],
        limit,
        offset,
      });

      return results;
    } catch (error: any) {
      console.error("[UniversalNotificationEngine] Error fetching user notifications:", error);
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<boolean> {
    try {
      await db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(eq(notifications.id, notificationId));
      return true;
    } catch (error: any) {
      console.error("[UniversalNotificationEngine] Error marking as read:", error);
      return false;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(workspaceId: string, userId: string): Promise<number> {
    try {
      const result = await db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(
          and(
            eq(notifications.workspaceId, workspaceId),
            eq(notifications.userId, userId),
            eq(notifications.isRead, false)
          )
        );
      return 1; // Return count affected
    } catch (error: any) {
      console.error("[UniversalNotificationEngine] Error marking all as read:", error);
      return 0;
    }
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(workspaceId: string, userId: string): Promise<number> {
    try {
      const unread = await db.query.notifications.findMany({
        where: and(
          eq(notifications.workspaceId, workspaceId),
          eq(notifications.userId, userId),
          eq(notifications.isRead, false)
        ),
        columns: { id: true },
      });
      return unread.length;
    } catch (error: any) {
      console.error("[UniversalNotificationEngine] Error getting unread count:", error);
      return 0;
    }
  }
}

// Singleton instance
export const universalNotificationEngine = new UniversalNotificationEngine();

// Backward compatibility alias
export const notificationEngine = universalNotificationEngine;
