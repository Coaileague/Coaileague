/**
 * NOTIFICATION STATE MANAGER STUB
 * Old UNS removed - this is a stub to prevent import errors
 * Real functionality moved to Trinity Command Request System
 */

class NotificationStateManagerStub {
  setBroadcastFunction(_fn: any) {}
  
  async getUnreadCounts(_userId: string, _workspaceId: string, _workspaceRole?: string) {
    return { notifications: 0, platformUpdates: 0 };
  }
  
  async markNotificationAsRead(_notificationId: string, _userId: string, _workspaceId: string) {
    return { success: true };
  }
  
  async markPlatformUpdateAsViewed(_updateId: string, _userId: string) {
    return { success: true };
  }
  
  async syncCountsForUser(_userId: string, _workspaceId: string, _workspaceRole?: string) {
    return { notifications: 0, platformUpdates: 0 };
  }
  
  async onNewNotification(_userId: string, _workspaceId: string, _notification: any) {}
}

export const notificationStateManager = new NotificationStateManagerStub();
