import { createLogger } from '../lib/logger';
const log = createLogger('NDS');

/**
 * PHASE 8 — NOTIFICATION DELIVERY SERVICE
 *
 * The single source of truth for all outbound notification delivery.
 * Every send is persisted to notification_deliveries before any delivery
 * attempt, ensuring no notification disappears silently.
 *
 * Features:
 * - DB-first: record created before any delivery attempt
 * - Idempotency: same key = same record, no duplicate sends
 * - Retry with exponential backoff (2min → 8min → 32min)
 * - Permanent failure alerts after max attempts
 * - WebSocket delivery with 30-second email fallback for critical types
 * - Status lifecycle: pending → sending → sent/failed/retrying/permanently_failed/delivered
 *
 * Usage:
 *   import { NotificationDeliveryService } from './notificationDeliveryService';
 *   await NotificationDeliveryService.send({ type, workspaceId, recipientUserId, channel, body });
 */

import { db } from '../db';
import { notificationDeliveries } from '@shared/schema';
import { eq, and, lte, lt } from 'drizzle-orm';
// Phase 49: Notification preference enforcement
import { shouldDeliver } from './notificationPreferenceService';

export type NotificationDeliveryType =
  | 'shift_assignment'
  | 'shift_cancellation'
  | 'calloff_received'
  | 'coverage_needed'
  | 'payroll_approval_required'
  | 'payroll_approved'
  | 'payroll_paid'
  | 'invoice_sent'
  | 'invoice_overdue'
  | 'invoice_paid'
  | 'document_requires_signature'
  | 'onboarding_invite'
  | 'trinity_alert'
  | 'system_alert'
  | 'shift_reminder'
  // Phase 8: business notification types routed through NDS
  | 'report_delivery'
  | 'support_ticket_confirmation'
  | 'invoice_notification'
  | 'payment_reminder'
  | 'client_welcome'
  | 'lead_welcome'
  | 'regulatory_notification'
  | 'document_notification'
  | 'compliance_alert'
  | 'rms_notification'
  | 'sps_document'
  | 'sales_outreach'
  | 'ai_proactive'
  | 'billing_notification'
  | 'client_portal_invite'
  | 'dar_report'
  | 'ticket_closed'
  | 'coi_request'
  | 'schedule_notification'
  | 'payroll_notification'
  | 'incident_alert'
  | 'contractor_confirmation'
  | 'onboarding_notification'
  | 'alert_notification'
  | 'contract_notification'
  | 'certification_alert'
  | 'staffing_status_update'
  | 'inbound_opportunity_notification'
  | 'shift_offer_notification'
  | 'client_portal_invitation'
  | 'staffing_onboarding_invitation'
  | 'non_shift_email_routing'
  | 'contract_acknowledgment'
  | 'ai_usage_80pct'
  | 'ai_usage_90pct'
  | 'ai_usage_at_cap'
  | 'free_trial_hard_cap_blocked'
  | 'trial_expiring_soon'
  | 'trial_expired'
  | 'grace_period_ending'
  | 'voice_soft_cap_reached'
  | 'voice_soft_cap_sms_reached'
  | 'token_overage_billing_applied'
  | 'voice_overage_billing_applied'
  | 'voice_platinum_activated'
  | 'voice_platinum_cancelled'
  | 'annual_renewal_reminder'
  | 'seat_overage_detected'
  | 'new_email_received'
  | 'trinity_email_processed'
  | 'email_seat_activated'
  | 'email_seat_deactivated'
  | 'email_fair_use_warning'
  | 'client_portal_report'
  | 'client_portal_dispute'
  | 'trinity_welcome_email';

export type NotificationDeliveryChannel = 'email' | 'sms' | 'websocket' | 'in_app' | 'push';

export const CRITICAL_NOTIFICATION_TYPES: NotificationDeliveryType[] = [
  'coverage_needed',
  'calloff_received',
  'payroll_approval_required',
  'trinity_alert',
  // @ts-expect-error — TS migration: fix in refactoring sprint
  'panic_alert',
];

export interface SendNotificationPayload {
  type: NotificationDeliveryType;
  workspaceId: string;
  recipientUserId: string;
  channel: NotificationDeliveryChannel;
  subject?: string;
  body: Record<string, unknown>;
  idempotencyKey?: string;
  scheduledAt?: Date;
  maxAttempts?: number;
}

export class NotificationDeliveryService {

  // ============================================================================
  // SEND — idempotent entry point for all notification delivery
  // ============================================================================

  static async send(payload: SendNotificationPayload): Promise<string> {
    // Phase 49: Enforce user notification preferences (channel + quiet hours)
    try {
      const { allow, reason } = await shouldDeliver({
        userId: payload.recipientUserId,
        workspaceId: payload.workspaceId,
        notificationType: payload.type,
        channel: payload.channel as any,
      });
      if (!allow) {
        log.info(`[NotificationDeliveryService] Skipped delivery: user=${payload.recipientUserId} type=${payload.type} channel=${payload.channel} reason=${reason}`);
        return `skipped:${reason}`;
      }
    } catch (prefErr: any) {
      // Fail open — preference check error should never block delivery
      log.warn('[NotificationDeliveryService] Preference check failed (fail open):', prefErr?.message);
    }

    const idempotencyKey = payload.idempotencyKey ??
      `${payload.type}-${payload.recipientUserId}-${Date.now()}`;

    const existing = await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing.length > 0) {
      const rec = existing[0];
      if (rec.status === 'sent' || rec.status === 'delivered') return rec.id;
      if (rec.status !== 'permanently_failed') {
        await this.attemptDelivery(rec.id);
      }
      return rec.id;
    }

    const [record] = await db
      .insert(notificationDeliveries)
      .values({
        workspaceId: payload.workspaceId,
        recipientUserId: payload.recipientUserId,
        notificationType: payload.type,
        channel: payload.channel,
        subject: payload.subject ?? null,
        payload: payload.body,
        idempotencyKey,
        status: 'pending',
        scheduledAt: payload.scheduledAt ?? new Date(),
        maxAttempts: payload.maxAttempts ?? 3,
      })
      .onConflictDoUpdate({
        target: notificationDeliveries.idempotencyKey,
        set: { status: 'pending', updatedAt: new Date() },
      })
      .returning();

    // Best-effort immediate delivery; retry job handles failures
    await this.attemptDelivery(record.id).catch(err => {
      log.error('[NotificationDeliveryService] immediate delivery error:', err);
    });

    return record.id;
  }

  // ============================================================================
  // ATTEMPT DELIVERY — marks sending, tries channel, updates status
  // ============================================================================

  static async attemptDelivery(notificationId: string): Promise<void> {
    const [record] = await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.id, notificationId))
      .limit(1);

    if (!record) return;
    if (
      record.status === 'sent' ||
      record.status === 'delivered' ||
      record.status === 'permanently_failed'
    ) return;

    await db
      .update(notificationDeliveries)
      .set({ status: 'sending', updatedAt: new Date() })
      .where(eq(notificationDeliveries.id, notificationId));

    try {
      await this.deliverByChannel(record);

      await db
        .update(notificationDeliveries)
        .set({
          status: 'sent',
          sentAt: new Date(),
          attemptCount: record.attemptCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(notificationDeliveries.id, notificationId));

    } catch (error) {
      const newAttemptCount = record.attemptCount + 1;
      const isPermanent = newAttemptCount >= record.maxAttempts;

      if (isPermanent) {
        await db
          .update(notificationDeliveries)
          .set({
            status: 'permanently_failed',
            lastError: error instanceof Error ? error.message : String(error),
            attemptCount: newAttemptCount,
            updatedAt: new Date(),
          })
          .where(eq(notificationDeliveries.id, notificationId));

        await this.alertPermanentFailure(record, newAttemptCount, error);
      } else {
        // Exponential backoff: attempt 1→2min, 2→8min, 3→32min
        const backoffMs = Math.pow(4, newAttemptCount) * 30 * 1000;
        const nextRetry = new Date(Date.now() + backoffMs);

        await db
          .update(notificationDeliveries)
          .set({
            status: 'retrying',
            lastError: error instanceof Error ? error.message : String(error),
            attemptCount: newAttemptCount,
            nextRetryAt: nextRetry,
            updatedAt: new Date(),
          })
          .where(eq(notificationDeliveries.id, notificationId));
      }
    }
  }

  // ============================================================================
  // CHANNEL DISPATCH
  // ============================================================================

  private static async deliverByChannel(
    record: typeof notificationDeliveries.$inferSelect
  ): Promise<void> {
    switch (record.channel) {
      case 'email':
        await this.deliverEmail(record);
        break;
      case 'websocket':
        await this.deliverWebSocket(record);
        break;
      case 'in_app':
        await this.deliverInApp(record);
        break;
      case 'sms':
        await this.deliverSMS(record);
        break;
      case 'push':
        // Push notifications route through pushNotificationService which writes
        // its own notification_deliveries record (channel: 'push'). If a push
        // reaches NDS directly, delegate to pushNotificationService.
        await this.deliverPush(record);
        break;
      default:
        throw new Error(`Unknown channel: ${(record as any).channel}`);
    }
  }

  private static async deliverEmail(
    record: typeof notificationDeliveries.$inferSelect
  ): Promise<void> {
    const { emailService } = await import('./emailService');
    const payload = record.payload as Record<string, unknown>;
    const to = String(payload.to ?? payload.recipientEmail ?? '');
    if (!to) throw new Error('No recipient email in notification payload');

    const { PLATFORM } = await import('../config/platformConfig');
    const subject = record.subject ?? String(payload.subject ?? `${PLATFORM.name} Notification`);
    const html = String(
      payload.html ?? payload.body ??
      `<p>${subject}</p><p>Please log in to ${PLATFORM.name} for details.</p>`
    );

    const sendResult = await emailService.sendCustomEmail(to, subject, html, record.notificationType);
    if (!sendResult) throw new Error('emailService.sendCustomEmail returned falsy');
  }

  private static async deliverWebSocket(
    record: typeof notificationDeliveries.$inferSelect
  ): Promise<void> {
    const { broadcastToWorkspace } = await import('../websocket');
    broadcastToWorkspace(record.workspaceId, {
      type: 'notification_delivery',
      notificationId: record.id,
      notificationType: record.notificationType,
      recipientUserId: record.recipientUserId,
      payload: record.payload,
      subject: record.subject,
      timestamp: new Date().toISOString(),
    });
  }

  private static async deliverInApp(
    record: typeof notificationDeliveries.$inferSelect
  ): Promise<void> {
    const { notifications } = await import('@shared/schema');
    const payload = record.payload as Record<string, unknown>;
    const title = record.subject ?? String(payload.title ?? record.notificationType);
    const message = String(payload.message ?? payload.body ?? title);

    await db.insert(notifications).values({
      workspaceId: record.workspaceId,
      userId: record.recipientUserId,
      type: 'system' as any,
      title,
      message,
      metadata: {
        notificationDeliveryId: record.id,
        notificationType: record.notificationType,
        ...payload,
      },
      createdBy: 'system',
    });
  }

  private static async deliverSMS(
    record: typeof notificationDeliveries.$inferSelect
  ): Promise<void> {
    const { sendSMS } = await import('./smsService');
    const payload = record.payload as Record<string, unknown>;
    const to = String(payload.to ?? payload.phone ?? '');
    if (!to) throw new Error('No recipient phone in notification payload');

    const body = String(payload.body ?? payload.message ?? record.subject ?? record.notificationType);

    const result = await sendSMS({ to, body, workspaceId: record.workspaceId, type: record.notificationType });
    if (result && typeof result === 'object' && 'error' in result && result.error) {
      throw new Error(String((result as any).error));
    }
  }

  // P27-G01 FIX: Push delivery case — delegates to pushNotificationService
  // Normally push goes directly through pushNotificationService which writes its own
  // notification_deliveries row (channel: 'push'). This method handles the case
  // where a push notification is explicitly routed through NDS.
  private static async deliverPush(
    record: typeof notificationDeliveries.$inferSelect
  ): Promise<void> {
    const { sendPushToUser } = await import('./pushNotificationService');
    const payload = record.payload as Record<string, unknown>;
    const userId = record.recipientUserId;
    if (!userId) throw new Error('No recipient userId for push delivery');
    const { PLATFORM } = await import('../config/platformConfig');
    await sendPushToUser(userId, {
      title: record.subject ?? String(payload.title ?? `${PLATFORM.name} Notification`),
      body: String(payload.body ?? payload.message ?? record.subject ?? ''),
      type: record.notificationType,
      url: String(payload.url ?? payload.actionUrl ?? '/'),
      data: { workspaceId: record.workspaceId, type: record.notificationType, notificationId: record.id },
    });
  }

  // ============================================================================
  // PERMANENT FAILURE ALERT
  // ============================================================================

  private static async alertPermanentFailure(
    record: typeof notificationDeliveries.$inferSelect,
    attemptCount: number,
    error: unknown
  ): Promise<void> {
    log.error('[NotificationDeliveryService] PERMANENT FAILURE', {
      id: record.id,
      type: record.notificationType,
      channel: record.channel,
      recipient: record.recipientUserId,
      workspace: record.workspaceId,
      attempts: attemptCount,
      error: error instanceof Error ? error.message : String(error),
    });

    try {
      const { broadcastToWorkspace } = await import('../websocket');
      broadcastToWorkspace(record.workspaceId, {
        type: 'notification_permanent_failure',
        notificationId: record.id,
        notificationType: record.notificationType,
        recipientUserId: record.recipientUserId,
        attempts: attemptCount,
        lastError: error instanceof Error ? error.message : String(error),
      });
    } catch {
      // Non-blocking — failure alerts must never throw
    }
  }

  // ============================================================================
  // RETRY PROCESSOR — called by background daemon every 60 seconds
  // ============================================================================

  static async processRetries(): Promise<void> {
    const due = await db
      .select()
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.status, 'retrying'),
          lte(notificationDeliveries.nextRetryAt, new Date())
        )
      )
      .orderBy(notificationDeliveries.nextRetryAt)
      .limit(50);

    if (due.length > 0) {
      log.info(`[NotificationDeliveryService] Processing ${due.length} retry(ies)`);
    }

    await Promise.allSettled(due.map(n => this.attemptDelivery(n.id)));
  }

  // ============================================================================
  // WEBSOCKET ACK PROCESSOR — email fallback for critical unacknowledged WS sends
  // Runs every 30 seconds. If a critical WebSocket notification has been 'sent'
  // for >30s without a client ACK, queue an email fallback.
  // ============================================================================

  static async processWebSocketAcks(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 1000);

    const unacknowledged = await db
      .select()
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.channel, 'websocket'),
          eq(notificationDeliveries.status, 'sent'),
          lt(notificationDeliveries.sentAt, cutoff)
        )
      )
      .limit(20);

    for (const n of unacknowledged) {
      if (!CRITICAL_NOTIFICATION_TYPES.includes(n.notificationType as NotificationDeliveryType)) {
        continue;
      }
      const fallbackKey = `${n.idempotencyKey ?? n.id}-email-fallback`;
      try {
        await NotificationDeliveryService.send({
          type: n.notificationType as NotificationDeliveryType,
          workspaceId: n.workspaceId,
          recipientUserId: n.recipientUserId,
          channel: 'email',
          subject: n.subject ?? undefined,
          body: n.payload as Record<string, unknown>,
          idempotencyKey: fallbackKey,
        });
      } catch (err) {
        log.warn(`[NotificationDeliveryService] WS email fallback failed for ${n.id}:`, err);
      }
    }
  }

  // ============================================================================
  // ACK — called when client confirms WebSocket notification receipt
  // ============================================================================

  static async acknowledge(notificationId: string): Promise<void> {
    await db
      .update(notificationDeliveries)
      .set({
        status: 'delivered',
        deliveredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(notificationDeliveries.id, notificationId),
          eq(notificationDeliveries.channel, 'websocket')
        )
      );
  }

  static async sendEmailReply(params: {
    fromAddress: string;
    toAddress: string;
    subject: string;
    html: string;
    originalMessageId: string;
  }): Promise<void> {
    const { getUncachableResendClient } = await import('./emailCore');
    const { client } = await getUncachableResendClient();
    const subject = params.subject.startsWith('Re:') ? params.subject : `Re: ${params.subject}`;
    await client.emails.send({
      from: params.fromAddress,
      to: params.toAddress,
      subject,
      html: params.html,
      headers: {
        'In-Reply-To': params.originalMessageId,
        'References': params.originalMessageId,
      },
    });
    log.info(`[NDS] sendEmailReply → ${params.toAddress} from ${params.fromAddress}`);
  }
}
