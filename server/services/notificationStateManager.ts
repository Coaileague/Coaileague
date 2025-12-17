/**
 * NotificationStateManager - Unified notification count and state management
 * 
 * Handles:
 * - Combined count tracking for notifications + platform updates
 * - Mark as read with count decrements
 * - Clear all functionality
 * - WebSocket broadcast for real-time count updates
 * - AI Brain update routing to end users
 * - Persistent state synchronized to database
 */

import { db } from '../db';
import { 
  notifications, 
  platformUpdates, 
  userPlatformUpdateViews,
  maintenanceAlerts
} from '@shared/schema';
import { eq, and, sql, notInArray, gte, or, isNull, ne } from 'drizzle-orm';

export interface UnreadCounts {
  notifications: number;
  platformUpdates: number;
  maintenanceAlerts: number;
  total: number;
  lastUpdated: string;
}

export interface NotificationStateUpdate {
  type: 'notification_count_updated';
  counts: UnreadCounts;
  source: 'read' | 'clear_all' | 'new_notification' | 'new_update' | 'sync';
}

type BroadcastFunction = (
  workspaceId: string,
  userId: string,
  updateType: string,
  data: any,
  unreadCount?: number
) => void;

class NotificationStateManager {
  private broadcastFn: BroadcastFunction | null = null;
  
  setBroadcastFunction(fn: BroadcastFunction) {
    this.broadcastFn = fn;
    console.log('[NotificationStateManager] Broadcast function registered');
  }
  
  async getUnreadCounts(userId: string, workspaceId?: string, workspaceRole: string = 'staff'): Promise<UnreadCounts> {
    try {
      const notificationCount = await this.getUnreadNotificationCount(userId, workspaceId);
      const platformUpdateCount = await this.getUnviewedPlatformUpdateCount(userId, workspaceRole);
      const alertCount = await this.getUnacknowledgedAlertCount(workspaceId);
      
      return {
        notifications: notificationCount,
        platformUpdates: platformUpdateCount,
        maintenanceAlerts: alertCount,
        total: notificationCount + platformUpdateCount + alertCount,
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[NotificationStateManager] Error getting counts:', error);
      return {
        notifications: 0,
        platformUpdates: 0,
        maintenanceAlerts: 0,
        total: 0,
        lastUpdated: new Date().toISOString(),
      };
    }
  }
  
  private async getUnacknowledgedAlertCount(workspaceId?: string): Promise<number> {
    try {
      const conditions = [
        ne(maintenanceAlerts.status, 'completed'),
        ne(maintenanceAlerts.status, 'cancelled'),
      ];
      
      if (workspaceId) {
        conditions.push(
          or(
            eq(maintenanceAlerts.workspaceId, workspaceId),
            isNull(maintenanceAlerts.workspaceId)
          )!
        );
      }
      
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(maintenanceAlerts)
        .where(and(...conditions));
      
      return result?.count || 0;
    } catch (error) {
      console.error('[NotificationStateManager] Error counting maintenance alerts:', error);
      return 0;
    }
  }
  
  private async getUnreadNotificationCount(userId: string, workspaceId?: string): Promise<number> {
    try {
      const conditions = [
        eq(notifications.userId, userId),
        eq(notifications.isRead, false),
      ];
      
      if (workspaceId) {
        conditions.push(
          or(
            eq(notifications.workspaceId, workspaceId),
            isNull(notifications.workspaceId)
          )!
        );
      }
      
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(...conditions));
      
      return result?.count || 0;
    } catch (error) {
      console.error('[NotificationStateManager] Error counting notifications:', error);
      return 0;
    }
  }
  
  private async getUnviewedPlatformUpdateCount(userId: string, workspaceRole: string): Promise<number> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const viewedUpdateIds = await db
        .select({ updateId: userPlatformUpdateViews.updateId })
        .from(userPlatformUpdateViews)
        .where(eq(userPlatformUpdateViews.userId, userId));
      
      const viewedIds = viewedUpdateIds.map(v => v.updateId);
      
      const conditions = [
        gte(platformUpdates.date, thirtyDaysAgo),
      ];
      
      if (viewedIds.length > 0) {
        conditions.push(notInArray(platformUpdates.id, viewedIds));
      }
      
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(platformUpdates)
        .where(and(...conditions));
      
      return result?.count || 0;
    } catch (error) {
      console.error('[NotificationStateManager] Error counting platform updates:', error);
      return 0;
    }
  }
  
  async markNotificationAsRead(
    notificationId: string, 
    userId: string, 
    workspaceId?: string
  ): Promise<{ success: boolean; newCounts: UnreadCounts }> {
    try {
      await db
        .update(notifications)
        .set({ 
          isRead: true, 
          readAt: new Date(),
          updatedAt: new Date()
        })
        .where(and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId)
        ));
      
      const newCounts = await this.getUnreadCounts(userId, workspaceId);
      
      this.broadcastCountUpdate(userId, workspaceId || 'global', newCounts, 'read');
      
      return { success: true, newCounts };
    } catch (error) {
      console.error('[NotificationStateManager] Error marking notification as read:', error);
      return { 
        success: false, 
        newCounts: await this.getUnreadCounts(userId, workspaceId) 
      };
    }
  }
  
  async markPlatformUpdateAsViewed(
    updateId: string,
    userId: string,
    viewSource: string = 'feed',
    workspaceId?: string
  ): Promise<{ success: boolean; newCounts: UnreadCounts }> {
    try {
      await db.insert(userPlatformUpdateViews)
        .values({
          userId,
          updateId,
          viewSource,
          viewedAt: new Date(),
        })
        .onConflictDoNothing();
      
      const newCounts = await this.getUnreadCounts(userId, workspaceId);
      
      this.broadcastCountUpdate(userId, workspaceId || 'global', newCounts, 'read');
      
      return { success: true, newCounts };
    } catch (error) {
      console.error('[NotificationStateManager] Error marking update as viewed:', error);
      return { 
        success: false, 
        newCounts: await this.getUnreadCounts(userId, workspaceId) 
      };
    }
  }
  
  async markAllNotificationsAsRead(
    userId: string, 
    workspaceId?: string
  ): Promise<{ success: boolean; markedCount: number; newCounts: UnreadCounts }> {
    try {
      const conditions = [
        eq(notifications.userId, userId),
        eq(notifications.isRead, false),
      ];
      
      if (workspaceId) {
        conditions.push(
          or(
            eq(notifications.workspaceId, workspaceId),
            isNull(notifications.workspaceId)
          )!
        );
      }
      
      const result = await db
        .update(notifications)
        .set({ 
          isRead: true, 
          readAt: new Date(),
          updatedAt: new Date()
        })
        .where(and(...conditions))
        .returning({ id: notifications.id });
      
      const newCounts = await this.getUnreadCounts(userId, workspaceId);
      
      this.broadcastCountUpdate(userId, workspaceId || 'global', newCounts, 'clear_all');
      
      return { 
        success: true, 
        markedCount: result.length, 
        newCounts 
      };
    } catch (error) {
      console.error('[NotificationStateManager] Error clearing all notifications:', error);
      return { 
        success: false, 
        markedCount: 0, 
        newCounts: await this.getUnreadCounts(userId, workspaceId) 
      };
    }
  }
  
  async markAllPlatformUpdatesAsViewed(
    userId: string,
    workspaceRole: string = 'staff',
    workspaceId?: string
  ): Promise<{ success: boolean; markedCount: number; newCounts: UnreadCounts }> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const viewedUpdateIds = await db
        .select({ updateId: userPlatformUpdateViews.updateId })
        .from(userPlatformUpdateViews)
        .where(eq(userPlatformUpdateViews.userId, userId));
      
      const viewedIds = new Set(viewedUpdateIds.map(v => v.updateId));
      
      const allUpdates = await db
        .select({ id: platformUpdates.id })
        .from(platformUpdates)
        .where(gte(platformUpdates.date, thirtyDaysAgo));
      
      const unviewedUpdates = allUpdates.filter(u => !viewedIds.has(u.id));
      
      if (unviewedUpdates.length > 0) {
        await db.insert(userPlatformUpdateViews)
          .values(unviewedUpdates.map(u => ({
            userId,
            updateId: u.id,
            viewSource: 'clear_all',
            viewedAt: new Date(),
          })))
          .onConflictDoNothing();
      }
      
      const newCounts = await this.getUnreadCounts(userId, workspaceId, workspaceRole);
      
      this.broadcastCountUpdate(userId, workspaceId || 'global', newCounts, 'clear_all');
      
      return { 
        success: true, 
        markedCount: unviewedUpdates.length, 
        newCounts 
      };
    } catch (error) {
      console.error('[NotificationStateManager] Error clearing all platform updates:', error);
      return { 
        success: false, 
        markedCount: 0, 
        newCounts: await this.getUnreadCounts(userId, workspaceId) 
      };
    }
  }
  
  async clearAll(
    userId: string,
    workspaceId?: string,
    workspaceRole: string = 'staff'
  ): Promise<{ success: boolean; notificationsCleared: number; updatesCleared: number; newCounts: UnreadCounts }> {
    try {
      const notifResult = await this.markAllNotificationsAsRead(userId, workspaceId);
      const updateResult = await this.markAllPlatformUpdatesAsViewed(userId, workspaceRole, workspaceId);
      
      const newCounts = await this.getUnreadCounts(userId, workspaceId, workspaceRole);
      
      this.broadcastCountUpdate(userId, workspaceId || 'global', newCounts, 'clear_all');
      
      console.log(`[NotificationStateManager] Clear all for user ${userId}: ${notifResult.markedCount} notifications, ${updateResult.markedCount} updates`);
      
      return {
        success: true,
        notificationsCleared: notifResult.markedCount,
        updatesCleared: updateResult.markedCount,
        newCounts,
      };
    } catch (error) {
      console.error('[NotificationStateManager] Error in clearAll:', error);
      return {
        success: false,
        notificationsCleared: 0,
        updatesCleared: 0,
        newCounts: await this.getUnreadCounts(userId, workspaceId, workspaceRole),
      };
    }
  }
  
  async onNewNotification(
    userId: string,
    workspaceId: string,
    notification: any
  ): Promise<void> {
    try {
      const newCounts = await this.getUnreadCounts(userId, workspaceId);
      
      // Only broadcast count update - the caller already broadcasts notification_new
      // to avoid duplicate WebSocket events
      this.broadcastCountUpdate(userId, workspaceId, newCounts, 'new_notification');
      
      console.log(`[NotificationStateManager] New notification for user ${userId}, total: ${newCounts.total}`);
    } catch (error) {
      console.error('[NotificationStateManager] Error broadcasting new notification:', error);
    }
  }
  
  async onNewPlatformUpdate(updateId: string): Promise<void> {
    try {
      console.log(`[NotificationStateManager] New platform update: ${updateId}`);
    } catch (error) {
      console.error('[NotificationStateManager] Error handling new platform update:', error);
    }
  }
  
  private broadcastCountUpdate(
    userId: string,
    workspaceId: string,
    counts: UnreadCounts,
    source: 'read' | 'clear_all' | 'new_notification' | 'new_update' | 'sync'
  ): void {
    if (!this.broadcastFn) {
      console.warn('[NotificationStateManager] No broadcast function registered');
      return;
    }
    
    const update: NotificationStateUpdate = {
      type: 'notification_count_updated',
      counts,
      source,
    };
    
    this.broadcastFn(workspaceId, userId, 'notification_count_updated', update, counts.total);
  }
  
  async syncCountsForUser(userId: string, workspaceId?: string, workspaceRole: string = 'staff'): Promise<UnreadCounts> {
    const counts = await this.getUnreadCounts(userId, workspaceId, workspaceRole);
    this.broadcastCountUpdate(userId, workspaceId || 'global', counts, 'sync');
    return counts;
  }
}

export const notificationStateManager = new NotificationStateManager();
export default notificationStateManager;
