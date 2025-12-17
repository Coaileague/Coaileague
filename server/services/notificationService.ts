/**
 * NOTIFICATION SERVICE STUB
 * Old UNS removed - this is a stub to prevent import errors
 * Real functionality moved to Trinity Command Request System
 */

export async function createNotification(_params: any): Promise<{ success: boolean; id?: string }> {
  console.log('[NotificationService] Stub - use Trinity Command Request System');
  return { success: true };
}

export async function sendTrinityWelcomeNotification(_userId: string, _workspaceId: string): Promise<void> {
  console.log('[NotificationService] Stub - welcome notification not sent');
}

export async function sendWelcomeEmployeeNotification(_employeeId: string, _workspaceId: string): Promise<void> {
  console.log('[NotificationService] Stub - employee welcome not sent');
}

export async function getOnboardingDigest(_workspaceId: string): Promise<any[]> {
  return [];
}

export async function autoCleanupSystemNotifications(): Promise<{ deleted: number }> {
  return { deleted: 0 };
}
