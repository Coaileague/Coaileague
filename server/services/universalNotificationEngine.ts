/**
 * UNIVERSAL NOTIFICATION ENGINE STUB
 * Old UNS removed - this is a stub to prevent import errors
 * Real functionality moved to Trinity Command Request System
 */

interface NotificationParams {
  workspaceId?: string;
  userId?: string;
  type?: string;
  title?: string;
  message?: string;
  metadata?: any;
  severity?: string;
  [key: string]: any;
}

class UniversalNotificationEngineStub {
  async sendNotification(_params: NotificationParams) {
    console.log('[NotificationEngine] Stub - notification not sent, use Trinity Command Request System');
    return { success: true, notificationId: null };
  }
  
  async getUserNotifications(_userId: string, _workspaceId: string, _options?: any) {
    return [];
  }
  
  async markAsRead(_notificationId: string, _workspaceId: string) {
    return true;
  }
}

export const notificationEngine = new UniversalNotificationEngineStub();
export const universalNotificationEngine = notificationEngine;
