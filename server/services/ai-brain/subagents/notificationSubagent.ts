/**
 * NOTIFICATION SUBAGENT STUB
 * Old UNS removed - this is a stub to prevent import errors
 * Real functionality moved to Trinity Command Request System
 */

export type NotificationPriority = 'P0' | 'P1' | 'P2';

interface NotificationStubResult {
  success: boolean;
  notificationId?: string;
  bundled: boolean;
  bundleId?: string;
  channel?: string;
}

class NotificationSubagentStub {
  async sendPriorityNotification(
    _userId: string,
    _workspaceId: string,
    _priority: NotificationPriority,
    _payload: any
  ): Promise<NotificationStubResult> {
    console.log('[NotificationSubagent] Stub - use Trinity Command Request System');
    return { success: true, bundled: false };
  }

  async sendCriticalNotification(
    _workspaceId: string,
    _payload: any
  ): Promise<NotificationStubResult> {
    console.log('[NotificationSubagent] Stub - use Trinity Command Request System');
    return { success: true, bundled: false };
  }

  async sendBulkByRole(
    _workspaceId: string,
    _targetRole: string,
    _payload: any
  ): Promise<{ success: boolean; sent: number; failed: number }> {
    console.log('[NotificationSubagent] Stub - use Trinity Command Request System');
    return { success: true, sent: 0, failed: 0 };
  }

  async getDeliveryStats(_workspaceId: string): Promise<any> {
    return {
      totalSent: 0,
      deliveryRate: 100,
      averageDeliveryTime: 0,
      bundlingRate: 0,
      channelBreakdown: {},
    };
  }

  registerActions(_orchestrator: any): void {
    console.log('[NotificationSubagent] Stub - actions not registered, use Trinity Command Request System');
  }
}

export const notificationSubagent = new NotificationSubagentStub();
