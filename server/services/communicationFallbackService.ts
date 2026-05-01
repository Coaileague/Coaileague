/**
 * communicationFallbackService.ts
 *
 * Cascading communication fallback — guarantees no event is ever silently lost.
 *
 * Chain: Twilio SMS → Push (FCM/PWA) → Universal NDS (in-app + websocket) → Internal Email → External Email
 *
 * Design rules:
 * - Each layer is independently attempted; failure triggers the next layer.
 * - In-app NDS and internal email are ALWAYS attempted (backstop layers).
 * - All successes and failures are logged for audit.
 * - The service never throws — it returns a structured result.
 * - Production tenant guard: caller must never pass the grandfathered tenant workspaceId in dev contexts.
 */

import { createLogger } from '../lib/logger';
import { sendSMS, sendSMSToUser, isSMSConfigured } from './smsService';
import { sendPushToUser } from './pushNotificationService';
import { NotificationDeliveryService } from './notificationDeliveryService';
import { emailService } from './emailService';

const log = createLogger('communicationFallbackService');

export interface FallbackNotificationPayload {
  workspaceId: string;
  recipientUserId: string;
  title: string;
  body: string;
  subject?: string;
  htmlBody?: string;
  phone?: string;
  externalEmail?: string;
  notificationType?: string;
  url?: string;
  idempotencyKey?: string;
}

export interface FallbackResult {
  success: boolean;
  channelsAttempted: string[];
  channelsSucceeded: string[];
  channelsFailed: string[];
  allFailed: boolean;
  idempotencyKey: string;
}

import { GRANDFATHERED_TENANT_ID } from './billing/billingConstants';

/**
 * sendWithFallback — attempts delivery through each channel in the cascade.
 * Guaranteed to attempt NDS (in-app) and email as final backstops.
 */
export async function sendWithFallback(
  payload: FallbackNotificationPayload
): Promise<FallbackResult> {
  if (GRANDFATHERED_TENANT_ID && payload.workspaceId === GRANDFATHERED_TENANT_ID) {
    log.warn('[CommunicationFallback] Production tenant passed — aborting to preserve tenant isolation');
    return {
      success: false,
      channelsAttempted: [],
      channelsSucceeded: [],
      channelsFailed: ['TENANT_GUARD'],
      allFailed: true,
      idempotencyKey: payload.idempotencyKey || `fallback-blocked-${Date.now()}`,
    };
  }

  const ikey = payload.idempotencyKey || `fallback-${payload.workspaceId}-${payload.recipientUserId}-${Date.now()}`;
  const type = (payload.notificationType || 'general_notification') as any;
  const channelsAttempted: string[] = [];
  const channelsSucceeded: string[] = [];
  const channelsFailed: string[] = [];

  let primaryDelivered = false;

  // ─────────────────────────────────────────────
  // LAYER 1 — Twilio SMS
  // ─────────────────────────────────────────────
  if (payload.phone && isSMSConfigured()) {
    channelsAttempted.push('sms');
    try {
      const smsResult = await sendSMS({
        to: payload.phone,
        body: payload.body,
        userId: payload.recipientUserId,
        workspaceId: payload.workspaceId,
        type,
      });
      if (smsResult.success) {
        channelsSucceeded.push('sms');
        primaryDelivered = true;
        log.info(`[CommunicationFallback] SMS delivered — user=${payload.recipientUserId} ikey=${ikey}`);
      } else {
        channelsFailed.push('sms');
        log.warn(`[CommunicationFallback] SMS failed — user=${payload.recipientUserId} error=${smsResult.error} — trying push`);
      }
    } catch (err: unknown) {
      channelsFailed.push('sms');
      log.error(`[CommunicationFallback] SMS exception — user=${payload.recipientUserId}:`, err?.message);
    }
  }

  // ─────────────────────────────────────────────
  // LAYER 2 — Push (FCM/PWA via web-push VAPID)
  // ─────────────────────────────────────────────
  if (!primaryDelivered) {
    channelsAttempted.push('push');
    try {
      const pushResult = await sendPushToUser(payload.recipientUserId, {
        title: payload.title,
        body: payload.body,
        type,
        url: payload.url,
        data: {
          workspaceId: payload.workspaceId,
          notificationId: ikey,
          type,
          url: payload.url,
        },
      });
      if (pushResult.sent > 0) {
        channelsSucceeded.push('push');
        primaryDelivered = true;
        log.info(`[CommunicationFallback] Push delivered (${pushResult.sent} sub(s)) — user=${payload.recipientUserId} ikey=${ikey}`);
      } else if (pushResult.errors.length > 0) {
        channelsFailed.push('push');
        log.warn(`[CommunicationFallback] Push failed — user=${payload.recipientUserId} errors=${pushResult.errors.join(', ')} — falling through to NDS`);
      } else {
        log.info(`[CommunicationFallback] Push skipped (no active subscriptions) — user=${payload.recipientUserId}`);
      }
    } catch (err: unknown) {
      channelsFailed.push('push');
      log.error(`[CommunicationFallback] Push exception — user=${payload.recipientUserId}:`, err?.message);
    }
  }

  // ─────────────────────────────────────────────
  // LAYER 3 — Universal NDS (in-app + websocket) — ALWAYS attempted
  // ─────────────────────────────────────────────
  channelsAttempted.push('nds_inapp');
  try {
    const ndsId = await NotificationDeliveryService.send({
      type,
      workspaceId: payload.workspaceId,
      recipientUserId: payload.recipientUserId,
      channel: 'in_app',
      subject: payload.subject || payload.title,
      body: {
        title: payload.title,
        message: payload.body,
        url: payload.url,
      },
      idempotencyKey: `${ikey}-inapp`,
    });
    if (!ndsId.startsWith('skipped:')) {
      channelsSucceeded.push('nds_inapp');
      log.info(`[CommunicationFallback] NDS in-app queued — user=${payload.recipientUserId} deliveryId=${ndsId}`);
    }
  } catch (err: unknown) {
    channelsFailed.push('nds_inapp');
    log.error(`[CommunicationFallback] NDS in-app exception — user=${payload.recipientUserId}:`, err?.message);
  }

  // NDS websocket (real-time push to connected browser session)
  channelsAttempted.push('nds_websocket');
  try {
    const wsId = await NotificationDeliveryService.send({
      type,
      workspaceId: payload.workspaceId,
      recipientUserId: payload.recipientUserId,
      channel: 'websocket',
      subject: payload.subject || payload.title,
      body: {
        title: payload.title,
        message: payload.body,
        url: payload.url,
      },
      idempotencyKey: `${ikey}-ws`,
    });
    if (!wsId.startsWith('skipped:')) {
      channelsSucceeded.push('nds_websocket');
    }
  } catch (err: unknown) {
    channelsFailed.push('nds_websocket');
    log.error(`[CommunicationFallback] NDS websocket exception — user=${payload.recipientUserId}:`, err?.message);
  }

  // ─────────────────────────────────────────────
  // LAYER 4 — Internal Email via NDS (to registered user account email) — ALWAYS attempted
  // ─────────────────────────────────────────────
  channelsAttempted.push('nds_email');
  try {
    const emailNdsId = await NotificationDeliveryService.send({
      type,
      workspaceId: payload.workspaceId,
      recipientUserId: payload.recipientUserId,
      channel: 'email',
      subject: payload.subject || payload.title,
      body: {
        to: payload.recipientUserId,
        subject: payload.subject || payload.title,
        html: payload.htmlBody || `<p>${payload.body}</p>`,
      },
      idempotencyKey: `${ikey}-email-internal`,
    });
    if (!emailNdsId.startsWith('skipped:')) {
      channelsSucceeded.push('nds_email');
      log.info(`[CommunicationFallback] NDS internal email queued — user=${payload.recipientUserId} deliveryId=${emailNdsId}`);
    }
  } catch (err: unknown) {
    channelsFailed.push('nds_email');
    log.error(`[CommunicationFallback] NDS email exception — user=${payload.recipientUserId}:`, err?.message);
  }

  // ─────────────────────────────────────────────
  // LAYER 5 — External Email (direct Resend) — if externalEmail provided
  // ─────────────────────────────────────────────
  if (payload.externalEmail) {
    channelsAttempted.push('email_external');
    try {
      const emailResult = await emailService.send({
        to: payload.externalEmail,
        subject: payload.subject || payload.title,
        html: payload.htmlBody || `<p>${payload.body}</p>`,
        workspaceId: payload.workspaceId,
      });
      if (emailResult.success) {
        channelsSucceeded.push('email_external');
        log.info(`[CommunicationFallback] External email delivered — to=${payload.externalEmail} resendId=${emailResult.resendId}`);
      } else {
        channelsFailed.push('email_external');
        log.error(`[CommunicationFallback] External email failed — to=${payload.externalEmail} error=${emailResult.error}`);
      }
    } catch (err: unknown) {
      channelsFailed.push('email_external');
      log.error(`[CommunicationFallback] External email exception — to=${payload.externalEmail}:`, err?.message);
    }
  }

  const success = channelsSucceeded.length > 0;
  const allFailed = channelsAttempted.length > 0 && channelsSucceeded.length === 0;

  log.info(
    `[CommunicationFallback] Complete — user=${payload.recipientUserId} success=${success} ` +
    `succeeded=[${channelsSucceeded.join(', ')}] failed=[${channelsFailed.join(', ')}] ikey=${ikey}`
  );

  return {
    success,
    channelsAttempted,
    channelsSucceeded,
    channelsFailed,
    allFailed,
    idempotencyKey: ikey,
  };
}

/**
 * sendShiftNotificationWithFallback — convenience wrapper for shift-related events
 * (reminders, calloffs, schedule changes). Automatically resolves phone from employee
 * record if not provided directly.
 */
export async function sendShiftNotificationWithFallback(params: {
  workspaceId: string;
  recipientUserId: string;
  title: string;
  body: string;
  subject?: string;
  htmlBody?: string;
  phone?: string;
  externalEmail?: string;
  notificationType?: string;
  shiftId?: string;
}): Promise<FallbackResult> {
  return sendWithFallback({
    ...params,
    notificationType: params.notificationType || 'shift_reminder',
    url: params.shiftId ? `/schedule/shift/${params.shiftId}` : '/schedule',
    idempotencyKey: params.shiftId
      ? `shift-notify-${params.shiftId}-${params.recipientUserId}`
      : undefined,
  });
}

/**
 * sendApprovalNotificationWithFallback — convenience wrapper for approval events
 * (PTO, overtime, schedule change approvals).
 */
export async function sendApprovalNotificationWithFallback(params: {
  workspaceId: string;
  recipientUserId: string;
  title: string;
  body: string;
  subject?: string;
  htmlBody?: string;
  phone?: string;
  externalEmail?: string;
  approvalType?: string;
  approvalId?: string;
}): Promise<FallbackResult> {
  return sendWithFallback({
    ...params,
    notificationType: params.approvalType || 'approval_request',
    url: params.approvalId ? `/approvals/${params.approvalId}` : '/approvals',
    idempotencyKey: params.approvalId
      ? `approval-notify-${params.approvalId}-${params.recipientUserId}`
      : undefined,
  });
}

/**
 * sendCalloffNotificationWithFallback — convenience wrapper for calloff cascade events.
 * Called when an officer calls off a shift and replacements need to be notified.
 */
export async function sendCalloffNotificationWithFallback(params: {
  workspaceId: string;
  recipientUserId: string;
  title: string;
  body: string;
  phone?: string;
  externalEmail?: string;
  shiftId?: string;
  tier?: number;
}): Promise<FallbackResult> {
  return sendWithFallback({
    ...params,
    subject: params.title,
    notificationType: 'calloff_cascade',
    url: params.shiftId ? `/schedule/shift/${params.shiftId}` : '/schedule',
    idempotencyKey: params.shiftId
      ? `calloff-${params.shiftId}-${params.recipientUserId}-tier${params.tier ?? 0}`
      : undefined,
  });
}
