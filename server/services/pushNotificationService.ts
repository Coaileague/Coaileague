import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { 
  pushSubscriptions, 
  users, 
  employees, 
  notifications,
  type InsertPushSubscription 
} from "@shared/schema";

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, any>;
  actions?: { action: string; title: string; icon?: string }[];
  requireInteraction?: boolean;
  vibrate?: number[];
  timestamp?: number;
}

type PushSubscriptionData = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@coaileague.com';

async function getWebPush() {
  try {
    const webpush = await import('web-push');
    
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      webpush.default.setVapidDetails(
        VAPID_SUBJECT,
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
      );
    }
    
    return webpush.default;
  } catch (error) {
    console.warn('[PushNotification] web-push not available:', error);
    return null;
  }
}

export async function registerPushSubscription(
  userId: string,
  subscription: PushSubscriptionData,
  deviceInfo?: { userAgent?: string; platform?: string }
): Promise<{ success: boolean; subscriptionId?: string; error?: string }> {
  try {
    const existingSub = await db.query.pushSubscriptions.findFirst({
      where: and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, subscription.endpoint)
      )
    });

    if (existingSub) {
      await db.update(pushSubscriptions)
        .set({ 
          p256dhKey: subscription.keys.p256dh,
          authKey: subscription.keys.auth,
          updatedAt: new Date()
        })
        .where(eq(pushSubscriptions.id, existingSub.id));
      
      console.log(`[PushNotification] Updated subscription for user ${userId}`);
      return { success: true, subscriptionId: existingSub.id };
    }

    const newSubscription: InsertPushSubscription = {
      userId,
      endpoint: subscription.endpoint,
      p256dhKey: subscription.keys.p256dh,
      authKey: subscription.keys.auth,
      userAgent: deviceInfo?.userAgent,
      platform: deviceInfo?.platform,
      isActive: true,
    };

    const [inserted] = await db.insert(pushSubscriptions)
      .values(newSubscription)
      .returning();

    console.log(`[PushNotification] Created subscription ${inserted.id} for user ${userId}`);
    return { success: true, subscriptionId: inserted.id };
  } catch (error: any) {
    console.error('[PushNotification] Registration error:', error);
    return { success: false, error: error.message };
  }
}

export async function unregisterPushSubscription(
  userId: string,
  endpoint?: string
): Promise<{ success: boolean; unsubscribed: number }> {
  try {
    let unsubscribed = 0;

    if (endpoint) {
      const result = await db.delete(pushSubscriptions)
        .where(and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.endpoint, endpoint)
        ));
      unsubscribed = 1;
    } else {
      const result = await db.delete(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));
      unsubscribed = 1;
    }

    console.log(`[PushNotification] Unsubscribed ${unsubscribed} subscription(s) for user ${userId}`);
    return { success: true, unsubscribed };
  } catch (error: any) {
    console.error('[PushNotification] Unsubscribe error:', error);
    return { success: false, unsubscribed: 0 };
  }
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const webpush = await getWebPush();
  if (!webpush || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[PushNotification] VAPID keys not configured, skipping push');
    return { sent: 0, failed: 0, errors: ['Push notifications not configured'] };
  }

  const subscriptions = await db.query.pushSubscriptions.findMany({
    where: and(
      eq(pushSubscriptions.userId, userId),
      eq(pushSubscriptions.isActive, true)
    )
  });

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, errors: [] };
  }

  const results = { sent: 0, failed: 0, errors: [] as string[] };
  const notificationPayload = JSON.stringify({
    ...payload,
    timestamp: payload.timestamp || Date.now()
  });

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dhKey,
            auth: sub.authKey
          }
        },
        notificationPayload
      );
      results.sent++;
    } catch (error: any) {
      results.failed++;
      results.errors.push(error.message);

      if (error.statusCode === 410 || error.statusCode === 404) {
        await db.update(pushSubscriptions)
          .set({ isActive: false })
          .where(eq(pushSubscriptions.id, sub.id));
        console.log(`[PushNotification] Deactivated expired subscription ${sub.id}`);
      }
    }
  }

  console.log(`[PushNotification] Sent to user ${userId}: ${results.sent}/${subscriptions.length}`);
  return results;
}

export async function sendPushToWorkspace(
  workspaceId: string,
  payload: PushPayload,
  options?: { roles?: string[]; excludeUserIds?: string[] }
): Promise<{ totalSent: number; totalFailed: number; userResults: Record<string, { sent: number; failed: number }> }> {
  const workspaceEmployees = await db.select({
    userId: employees.userId
  })
  .from(employees)
  .where(eq(employees.workspaceId, workspaceId));

  const userIds = workspaceEmployees
    .map((e: { userId: string | null }) => e.userId)
    .filter((id: string | null): id is string => id !== null)
    .filter((id: string) => !options?.excludeUserIds?.includes(id));

  const results = {
    totalSent: 0,
    totalFailed: 0,
    userResults: {} as Record<string, { sent: number; failed: number }>
  };

  for (const userId of userIds) {
    const userResult = await sendPushToUser(userId, payload);
    results.userResults[userId] = { sent: userResult.sent, failed: userResult.failed };
    results.totalSent += userResult.sent;
    results.totalFailed += userResult.failed;
  }

  console.log(`[PushNotification] Workspace ${workspaceId}: ${results.totalSent} sent, ${results.totalFailed} failed`);
  return results;
}

export async function sendUrgentAlert(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<{ success: boolean }> {
  const result = await sendPushToUser(userId, {
    title,
    body,
    icon: '/icons/alert-192.png',
    badge: '/icons/badge-72.png',
    tag: 'urgent-alert',
    data: { ...data, urgent: true },
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200],
    actions: [
      { action: 'view', title: 'View Details' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  });

  return { success: result.sent > 0 };
}

export async function sendShiftReminder(
  userId: string,
  shiftTitle: string,
  startTime: Date,
  minutesBefore: number
): Promise<{ success: boolean }> {
  const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  
  const result = await sendPushToUser(userId, {
    title: 'Upcoming Shift Reminder',
    body: `${shiftTitle} starts in ${minutesBefore} minutes at ${timeStr}`,
    icon: '/icons/clock-192.png',
    badge: '/icons/badge-72.png',
    tag: `shift-reminder-${startTime.getTime()}`,
    data: { type: 'shift_reminder', shiftTitle, startTime: startTime.toISOString() },
    actions: [
      { action: 'view_shift', title: 'View Shift' },
      { action: 'clock_in', title: 'Clock In' }
    ]
  });

  return { success: result.sent > 0 };
}

export async function sendApprovalRequest(
  userId: string,
  requestType: 'timesheet' | 'time_off' | 'shift_swap',
  employeeName: string,
  details: string
): Promise<{ success: boolean }> {
  const titles: Record<string, string> = {
    timesheet: 'Timesheet Approval Needed',
    time_off: 'Time Off Request',
    shift_swap: 'Shift Swap Request'
  };

  const result = await sendPushToUser(userId, {
    title: titles[requestType],
    body: `${employeeName}: ${details}`,
    icon: '/icons/approval-192.png',
    badge: '/icons/badge-72.png',
    tag: `approval-${requestType}-${Date.now()}`,
    data: { type: 'approval_request', requestType, employeeName },
    actions: [
      { action: 'approve', title: 'Approve' },
      { action: 'view', title: 'Review' }
    ]
  });

  return { success: result.sent > 0 };
}

export async function sendComplianceAlert(
  userId: string,
  certificationName: string,
  daysUntilExpiry: number
): Promise<{ success: boolean }> {
  const urgency = daysUntilExpiry <= 7 ? 'urgent' : daysUntilExpiry <= 30 ? 'warning' : 'info';
  
  const result = await sendPushToUser(userId, {
    title: urgency === 'urgent' ? 'Certification Expiring Soon!' : 'Certification Reminder',
    body: `${certificationName} expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`,
    icon: '/icons/warning-192.png',
    badge: '/icons/badge-72.png',
    tag: `compliance-${certificationName}`,
    data: { type: 'compliance_alert', certificationName, daysUntilExpiry },
    requireInteraction: urgency === 'urgent',
    vibrate: urgency === 'urgent' ? [200, 100, 200] : undefined
  });

  return { success: result.sent > 0 };
}

export async function getVapidPublicKey(): Promise<string | null> {
  return VAPID_PUBLIC_KEY || null;
}

export async function getUserSubscriptions(userId: string) {
  return db.query.pushSubscriptions.findMany({
    where: and(
      eq(pushSubscriptions.userId, userId),
      eq(pushSubscriptions.isActive, true)
    ),
    columns: {
      id: true,
      endpoint: true,
      platform: true,
      createdAt: true
    }
  });
}

export const pushNotificationService = {
  registerPushSubscription,
  unregisterPushSubscription,
  sendPushToUser,
  sendPushToWorkspace,
  sendUrgentAlert,
  sendShiftReminder,
  sendApprovalRequest,
  sendComplianceAlert,
  getVapidPublicKey,
  getUserSubscriptions
};
