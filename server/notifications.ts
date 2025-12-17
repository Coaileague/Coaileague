/**
 * NOTIFICATIONS STUB
 * Old UNS removed - this is a stub to prevent import errors
 * Real functionality moved to Trinity Command Request System
 */

export async function sendNotification(_params: any): Promise<void> {
  console.log('[Notifications] Stub - use Trinity Command Request System');
}

export async function broadcastNotification(_params: any): Promise<void> {
  console.log('[Notifications] Stub - broadcast not sent');
}

export async function getNotifications(_userId: string, _workspaceId?: string): Promise<any[]> {
  return [];
}

export async function markAsRead(_notificationId: string): Promise<boolean> {
  return true;
}

export async function clearAll(_userId: string): Promise<boolean> {
  return true;
}

export async function getUnreadCount(_userId: string, _workspaceId?: string): Promise<number> {
  return 0;
}
