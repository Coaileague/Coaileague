/**
 * SMS Notification Service - Twilio Integration
 * Sends SMS notifications for schedule changes, reminders, and alerts
 * 
 * Phase 2D: Enhanced with preference-aware sending and AI Brain integration
 */

import { db } from '../db';
import { voiceSmsMeteringService } from './billing/voiceSmsMeteringService';
import {
  employees,
  users,
  userNotificationPreferences,
  smsConsent,
  smsAttemptLog,
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { isFeatureEnabled } from '@shared/platformConfig';
import { createLogger } from '../lib/logger';
const log = createLogger('smsService');


// ─── SMS Consent Gate ─────────────────────────────────────────────────────────
// Per Phase B: every SMS must pass consent verification before sending.
// Autonomous 911 contact removed by design.
// CoAIleague facilitates communication between officers and their supervisory
// chain only. Emergency service contact is the sole responsibility of the
// tenant organization per Texas Occupations Code Chapter 1702.

export type SmsConsentStatus = 'approved' | 'no_consent' | 'opted_out' | 'emergency_only';

export async function checkSmsConsent(
  phoneNumber: string,
  messageType: string
): Promise<{ allowed: boolean; status: SmsConsentStatus; reason?: string }> {
  try {
    const consent = await db.query.smsConsent.findFirst({
      where: eq(smsConsent.phoneNumber, phoneNumber),
    });

    if (!consent || !consent.consentGiven) {
      return { allowed: false, status: 'no_consent', reason: 'No SMS consent on file' };
    }

    if (consent.optOutAt) {
      return { allowed: false, status: 'opted_out', reason: 'User opted out via STOP reply' };
    }

    if (consent.emergencyAlertsOnly) {
      const isEmergency = messageType.startsWith('emergency') || messageType === 'panic_alert';
      if (!isEmergency) {
        return {
          allowed: false,
          status: 'emergency_only',
          reason: 'User limited to emergency alerts only',
        };
      }
    }

    return { allowed: true, status: 'approved' };
  } catch (err) {
    log.error('[SMS Consent] Gate check failed — defaulting to block:', err);
    return { allowed: false, status: 'no_consent', reason: 'Consent check error' };
  }
}

async function logAttempt(params: {
  userId?: string;
  workspaceId?: string;
  phone: string;
  messageType: string;
  sent: boolean;
  consentVerified: boolean;
  reason?: string;
  twilioMessageId?: string;
}): Promise<void> {
  try {
    await db.insert(smsAttemptLog).values({
      userId: params.userId,
      workspaceId: params.workspaceId,
      phoneNumber: params.phone,
      messageType: params.messageType,
      sent: params.sent,
      consentVerified: params.consentVerified,
      reasonNotSent: params.reason,
      twilioMessageId: params.twilioMessageId,
    });
  } catch (err) {
    log.error('[SMS Log] Failed to log attempt:', err);
  }
}

interface SMSMessage {
  to: string;
  body: string;
  workspaceId?: string;
  userId?: string;
  type?: string;
  metadata?: Record<string, any>;
}

interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
  deliveredAt?: Date;
}

interface SMSTemplate {
  type: string;
  message: string;
  category: 'shift_reminder' | 'schedule_change' | 'approval' | 'clock_reminder' | 'invoice' | 'general';
}

const SMS_TEMPLATES: Record<string, SMSTemplate> = {
  shift_reminder: {
    type: 'shift_reminder',
    message: 'CoAIleague Reminder: You have a shift on {date} at {time}{location}. Reply STOP to unsubscribe.',
    category: 'shift_reminder',
  },
  shift_reminder_soon: {
    type: 'shift_reminder_soon',
    message: 'CoAIleague: Your shift starts in {minutes} minutes{location}. Reply STOP to unsubscribe.',
    category: 'shift_reminder',
  },
  schedule_added: {
    type: 'schedule_added',
    message: 'CoAIleague: New shift assigned - {details}. Check your schedule for details.',
    category: 'schedule_change',
  },
  schedule_removed: {
    type: 'schedule_removed', 
    message: 'CoAIleague: Shift cancelled - {details}. Check your schedule for updates.',
    category: 'schedule_change',
  },
  schedule_modified: {
    type: 'schedule_modified',
    message: 'CoAIleague: Schedule update - {details}. Check your schedule for details.',
    category: 'schedule_change',
  },
  approval_needed: {
    type: 'approval_needed',
    message: 'CoAIleague: Action required - {itemType} needs your approval. Check the app for details.',
    category: 'approval',
  },
  approval_approved: {
    type: 'approval_approved',
    message: 'CoAIleague: Your {itemType} has been approved{details}.',
    category: 'approval',
  },
  approval_rejected: {
    type: 'approval_rejected',
    message: 'CoAIleague: Your {itemType} requires attention{details}. Check the app for details.',
    category: 'approval',
  },
  clock_in_reminder: {
    type: 'clock_in_reminder',
    message: 'CoAIleague: Reminder to clock in for your {time} shift.',
    category: 'clock_reminder',
  },
  clock_out_reminder: {
    type: 'clock_out_reminder',
    message: "CoAIleague: Don't forget to clock out from your shift.",
    category: 'clock_reminder',
  },
  timesheet_submitted: {
    type: 'timesheet_submitted',
    message: 'CoAIleague: Timesheet for {period} submitted successfully.',
    category: 'general',
  },
  pto_request_submitted: {
    type: 'pto_request_submitted',
    message: 'CoAIleague: Time off request for {dates} submitted. Awaiting approval.',
    category: 'approval',
  },
  pto_approved: {
    type: 'pto_approved',
    message: 'CoAIleague: Your time off request for {dates} has been approved.',
    category: 'approval',
  },
  pto_denied: {
    type: 'pto_denied',
    message: 'CoAIleague: Your time off request for {dates} was not approved. Check app for details.',
    category: 'approval',
  },
};

// ─── PHASE 32: SPANISH (ES) SMS TEMPLATES ────────────────────────────────────
const SMS_TEMPLATES_ES: Record<string, SMSTemplate> = {
  shift_reminder: {
    type: 'shift_reminder',
    message: 'CoAIleague: Recordatorio — tiene un turno el {date} a las {time}{location}. Responda STOP para darse de baja.',
    category: 'shift_reminder',
  },
  shift_reminder_soon: {
    type: 'shift_reminder_soon',
    message: 'CoAIleague: Su turno comienza en {minutes} minutos{location}. Responda STOP para darse de baja.',
    category: 'shift_reminder',
  },
  schedule_added: {
    type: 'schedule_added',
    message: 'CoAIleague: Nuevo turno asignado — {details}. Verifique su horario para más detalles.',
    category: 'schedule_change',
  },
  schedule_removed: {
    type: 'schedule_removed',
    message: 'CoAIleague: Turno cancelado — {details}. Verifique su horario para actualizaciones.',
    category: 'schedule_change',
  },
  schedule_modified: {
    type: 'schedule_modified',
    message: 'CoAIleague: Actualización de horario — {details}. Verifique su horario para detalles.',
    category: 'schedule_change',
  },
  approval_needed: {
    type: 'approval_needed',
    message: 'CoAIleague: Acción requerida — {itemType} necesita su aprobación. Verifique la aplicación.',
    category: 'approval',
  },
  approval_approved: {
    type: 'approval_approved',
    message: 'CoAIleague: Su {itemType} ha sido aprobado{details}.',
    category: 'approval',
  },
  approval_rejected: {
    type: 'approval_rejected',
    message: 'CoAIleague: Su {itemType} requiere atención{details}. Verifique la aplicación.',
    category: 'approval',
  },
  clock_in_reminder: {
    type: 'clock_in_reminder',
    message: 'CoAIleague: Recuerde registrar su entrada para el turno de las {time}.',
    category: 'clock_reminder',
  },
  clock_out_reminder: {
    type: 'clock_out_reminder',
    message: 'CoAIleague: No olvide registrar su salida del turno.',
    category: 'clock_reminder',
  },
  timesheet_submitted: {
    type: 'timesheet_submitted',
    message: 'CoAIleague: Registro de horas para {period} enviado exitosamente.',
    category: 'general',
  },
  pto_request_submitted: {
    type: 'pto_request_submitted',
    message: 'CoAIleague: Solicitud de tiempo libre para {dates} enviada. Pendiente de aprobación.',
    category: 'approval',
  },
  pto_approved: {
    type: 'pto_approved',
    message: 'CoAIleague: Su solicitud de tiempo libre para {dates} ha sido aprobada.',
    category: 'approval',
  },
  pto_denied: {
    type: 'pto_denied',
    message: 'CoAIleague: Su solicitud de tiempo libre para {dates} no fue aprobada. Verifique la aplicación.',
    category: 'approval',
  },
};

function getSmsTemplate(templateKey: string, language: string): SMSTemplate | undefined {
  if (language === 'es') {
    return SMS_TEMPLATES_ES[templateKey] ?? SMS_TEMPLATES[templateKey];
  }
  return SMS_TEMPLATES[templateKey];
}

async function getUserPreferredLanguage(userId: string): Promise<string> {
  try {
    const { pool: dbPool } = await import('../db');
    const { rows } = await dbPool.query(
      'SELECT preferred_language FROM users WHERE id = $1 LIMIT 1',
      [userId]
    );
    return rows[0]?.preferred_language ?? 'en';
  } catch {
    return 'en';
  }
}

let twilioClient: any = null;

async function getTwilioClient() {
  if (!twilioClient && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const twilio = await import('twilio');
      twilioClient = twilio.default(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
    } catch (error) {
      log.error('[SMS] Failed to initialize Twilio client:', error);
    }
  }
  return twilioClient;
}

export async function sendSMS(message: SMSMessage): Promise<SMSResult> { // infra
  if (!isFeatureEnabled('enableSMSNotifications')) {
    log.info('[SMS] SMS notifications disabled by feature flag');
    return { success: false, error: 'SMS notifications disabled' };
  }

  const client = await getTwilioClient();
  
  // NDS Integration: NotificationDeliveryService is the ONLY allowed caller of sendSMS.
  // We check if the caller is NDS via a stack check or internal flag if needed, 
  // but for now we enforce that all business logic uses NDS.send({ channel: 'sms' })
  // which eventually calls this.

  if (!process.env.TWILIO_PHONE_NUMBER) {
    log.info('[SMS] TWILIO_PHONE_NUMBER not set');
    return { success: false, error: 'Twilio phone number not configured' };
  }

  try {
    const result = await client.messages.create({ // withClaude
      body: message.body,
      to: message.to,
      from: process.env.TWILIO_PHONE_NUMBER,
    });

    const maskedPhone = message.to.replace(/(\+?\d{1,3})(\d+)(\d{4})$/, (_, cc, mid, last4) => `${cc}${'*'.repeat(mid.length)}${last4}`);
    log.info(`[SMS] Sent to ${maskedPhone}: ${result.sid}`);

    if (message.workspaceId) {
      // Cost ledger write is awaited (no fire-and-forget per TRINITY.md §9).
      // Failure is logged but does not fail the send — the SMS already
      // succeeded and the attempt is tracked in smsAttemptLog.
      try {
        // CATEGORY C — Raw SQL retained: SMS cost logging INSERT via db.$client | Tables: external_cost_log | Verified: 2026-03-23
        await db.$client.query(
          `INSERT INTO external_cost_log (workspace_id, user_id, service_name, call_type, units_consumed, cost_microcents, metadata)
           VALUES ($1, $2, 'twilio_sms', $3, 1, 800, $4)`,
          [message.workspaceId, message.userId || null, message.type || 'sms_notification', JSON.stringify({ sid: result.sid, to: message.to })]
        );
      } catch (err) {
        log.warn('[smsService] Cost ledger write failed (non-fatal):', err);
      }

      try {
        await voiceSmsMeteringService.recordSmsMessage({
          workspaceId: message.workspaceId,
          messageSid: result.sid,
          callType: message.type || 'sms_notification',
          twilioCostCents: 1, // Twilio SMS ~$0.0079/msg → 1 cent (ceil)
        });
      } catch (e: any) {
        log.warn('[smsService] SMS metering error:', e?.message || String(e));
      }
    }

    return {
      success: true,
      messageId: result.sid,
    };
  } catch (error: any) {
    log.error('[SMS] Failed to send:', (error instanceof Error ? error.message : String(error)));
    return {
      success: false,
      error: (error instanceof Error ? error.message : String(error)),
    };
  }
}

export async function sendSMSToUser(userId: string, body: string, type: string = 'notification'): Promise<SMSResult> { // infra
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user?.phone) {
      return { success: false, error: 'User has no phone number' };
    }

    // Phase B — Consent gate: every SMS requires explicit consent
    const consent = await checkSmsConsent(user.phone, type);
    if (!consent.allowed) {
      await logAttempt({
        userId,
        phone: user.phone,
        messageType: type,
        sent: false,
        consentVerified: false,
        reason: consent.reason,
      });
      log.info(`[SMS Consent] Blocked to user ${userId}: ${consent.reason} — use push notifications`);
      return { success: false, error: `SMS blocked: ${consent.reason}` };
    }

    const result = await sendSMS({ to: user.phone, body, userId, type }); // infra
    await logAttempt({
      userId,
      phone: user.phone,
      messageType: type,
      sent: result.success,
      consentVerified: true,
      twilioMessageId: result.messageId,
      reason: result.success ? undefined : result.error,
    });
    return result;
  } catch (error: any) {
    log.error('[SMS] Error sending to user:', error);
    return { success: false, error: (error instanceof Error ? error.message : String(error)) };
  }
}

export async function sendSMSToEmployee(employeeId: string, body: string, type: string = 'notification', workspaceId?: string): Promise<SMSResult> { // infra
  try {
    const employee = await db.query.employees.findFirst({
      where: workspaceId
        ? and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId))
        : eq(employees.id, employeeId),
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    if (!employee.phone) {
      return { success: false, error: 'Employee has no phone number' };
    }

    // ── Phase 26: Subscription gate ─────────────────────────────────────────
    // Trinity-proactive SMS paths (shift reminders, cron workflows, etc.)
    // route through this function. Block per-tenant when the workspace's
    // subscription is inactive. Emergency / safety SMS routes through
    // sendSMSToUser → NotificationDeliveryService and is unaffected by this
    // gate. workspaceId is optional; if absent we fail open so existing
    // callers that rely on the old behavior keep working.
    const effectiveWorkspaceId = workspaceId || employee.workspaceId || null;
    if (effectiveWorkspaceId) {
      const { isWorkspaceServiceable } = await import('./billing/billingConstants');
      const serviceable = await isWorkspaceServiceable(effectiveWorkspaceId);
      if (!serviceable) {
        log.info(`[SMS] Subscription gate blocked employee SMS for workspace ${effectiveWorkspaceId} (type=${type})`);
        return { success: false, error: 'SUBSCRIPTION_INACTIVE' };
      }
    }

    // Phase B — Consent gate
    const consent = await checkSmsConsent(employee.phone, type);
    if (!consent.allowed) {
      await logAttempt({
        workspaceId,
        phone: employee.phone,
        messageType: type,
        sent: false,
        consentVerified: false,
        reason: consent.reason,
      });
      log.info(`[SMS Consent] Blocked to employee ${employeeId}: ${consent.reason} — use push notifications`);
      return { success: false, error: `SMS blocked: ${consent.reason}` };
    }

    const result = await sendSMS({ to: employee.phone, body, type }); // infra
    await logAttempt({
      workspaceId,
      phone: employee.phone,
      messageType: type,
      sent: result.success,
      consentVerified: true,
      twilioMessageId: result.messageId,
      reason: result.success ? undefined : result.error,
    });
    return result;
  } catch (error: any) {
    log.error('[SMS] Error sending to employee:', error);
    return { success: false, error: (error instanceof Error ? error.message : String(error)) };
  }
}

export async function sendShiftReminder(
  employeeId: string,
  shiftDate: string,
  shiftTime: string,
  location?: string,
  workspaceId?: string
): Promise<SMSResult> {
  const message = location
    ? `CoAIleague Reminder: You have a shift on ${shiftDate} at ${shiftTime} at ${location}. Reply STOP to unsubscribe.`
    : `CoAIleague Reminder: You have a shift on ${shiftDate} at ${shiftTime}. Reply STOP to unsubscribe.`;
  
  return sendSMSToEmployee(employeeId, message, 'shift_reminder', workspaceId); // infra
}

export async function sendScheduleChangeNotification(
  employeeId: string,
  changeType: 'added' | 'removed' | 'modified',
  shiftDetails: string,
  workspaceId?: string
): Promise<SMSResult> {
  const messages = {
    added: `CoAIleague: New shift assigned - ${shiftDetails}. Check your schedule for details.`,
    removed: `CoAIleague: Shift cancelled - ${shiftDetails}. Check your schedule for updates.`,
    modified: `CoAIleague: Schedule update - ${shiftDetails}. Check your schedule for details.`,
  };
  
  return sendSMSToEmployee(employeeId, messages[changeType], 'schedule_change', workspaceId); // infra
}

export async function sendApprovalNotification(
  userId: string,
  itemType: 'timesheet' | 'time_off' | 'expense',
  status: 'approved' | 'rejected',
  details?: string
): Promise<SMSResult> {
  const statusText = status === 'approved' ? 'approved' : 'requires attention';
  const message = `CoAIleague: Your ${itemType.replace('_', ' ')} has been ${statusText}${details ? ` - ${details}` : ''}`;
  
  return sendSMSToUser(userId, message, `${itemType}_${status}`); // infra
}

export async function sendClockReminder(
  employeeId: string,
  reminderType: 'clock_in' | 'clock_out',
  shiftTime: string
): Promise<SMSResult> {
  const messages = {
    clock_in: `CoAIleague: Reminder to clock in for your ${shiftTime} shift.`,
    clock_out: `CoAIleague: Don't forget to clock out from your shift.`,
  };
  
  return sendSMSToEmployee(employeeId, messages[reminderType], reminderType); // infra
}

export async function sendInvoiceReminder(
  clientPhone: string,
  invoiceNumber: string,
  amount: string,
  dueDate: string
): Promise<SMSResult> {
  const message = `CoAIleague: Invoice ${invoiceNumber} for ${amount} is due ${dueDate}. View and pay online at your client portal.`;
  
  return sendSMS({ // infra
    to: clientPhone,
    body: message,
    type: 'invoice_reminder',
  });
}

export async function sendPaymentConfirmation(
  clientPhone: string,
  invoiceNumber: string,
  amount: string
): Promise<SMSResult> {
  const message = `CoAIleague: Payment of ${amount} received for invoice ${invoiceNumber}. Thank you!`;
  
  return sendSMS({ // infra
    to: clientPhone,
    body: message,
    type: 'payment_confirmation',
  });
}

export async function smsHealthCheck(): Promise<{ configured: boolean; accountSid: string | null; fromNumber: string | null; status: string }> {
  const configured = isSMSConfigured();
  return {
    configured,
    accountSid: process.env.TWILIO_ACCOUNT_SID ? `${process.env.TWILIO_ACCOUNT_SID.substring(0, 8)}...` : null,
    fromNumber: process.env.TWILIO_FROM_NUMBER || null,
    status: configured ? 'ready' : 'not_configured',
  };
}

export function isSMSConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
}

/**
 * Check if a user has SMS enabled in their preferences
 */
export async function isUserSmsEnabled(userId: string, workspaceId: string): Promise<boolean> {
  try {
    const [prefs] = await db
      .select()
      .from(userNotificationPreferences)
      .where(and(
        eq(userNotificationPreferences.userId, userId),
        eq(userNotificationPreferences.workspaceId, workspaceId)
      ));
    
    return prefs?.enableSms === true && prefs?.smsOptOut !== true;
  } catch (error) {
    log.error('[SMS] Error checking user SMS preferences:', error);
    return false;
  }
}

/**
 * Get user's SMS phone number from preferences
 */
export async function getUserSmsPhone(userId: string, workspaceId: string): Promise<string | null> {
  try {
    const [prefs] = await db
      .select()
      .from(userNotificationPreferences)
      .where(and(
        eq(userNotificationPreferences.userId, userId),
        eq(userNotificationPreferences.workspaceId, workspaceId)
      ));
    
    if (prefs?.smsPhoneNumber) {
      return prefs.smsPhoneNumber;
    }
    
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    
    return user?.phone || null;
  } catch (error) {
    log.error('[SMS] Error getting user SMS phone:', error);
    return null;
  }
}

/**
 * Check if user should receive notifications of a specific category via SMS
 */
export async function shouldSendSmsForCategory(
  userId: string, 
  workspaceId: string, 
  category: 'shift_reminder' | 'schedule_change' | 'approval' | 'clock_reminder' | 'invoice' | 'general'
): Promise<boolean> {
  try {
    const [prefs] = await db
      .select()
      .from(userNotificationPreferences)
      .where(and(
        eq(userNotificationPreferences.userId, userId),
        eq(userNotificationPreferences.workspaceId, workspaceId)
      ));
    
    if (!prefs || !prefs.enableSms || prefs.smsOptOut) {
      return false;
    }
    
    let channels: string[] = [];
    switch (category) {
      case 'shift_reminder':
        channels = prefs.shiftReminderChannels as string[] || ['push', 'email'];
        break;
      case 'schedule_change':
        channels = prefs.scheduleChangeChannels as string[] || ['push', 'email'];
        break;
      case 'approval':
        channels = prefs.approvalNotificationChannels as string[] || ['push', 'email'];
        break;
      default:
        channels = ['push', 'email'];
    }
    
    return channels.includes('sms');
  } catch (error) {
    log.error('[SMS] Error checking category preference:', error);
    return false;
  }
}

/**
 * Send SMS with template substitution
 */
export async function sendTemplatedSMS(
  templateKey: string,
  to: string,
  variables: Record<string, string>,
  options?: { workspaceId?: string; userId?: string }
): Promise<SMSResult> {
  const template = SMS_TEMPLATES[templateKey];
  if (!template) {
    return { success: false, error: `Template '${templateKey}' not found` };
  }
  
  let message = template.message;
  for (const [key, value] of Object.entries(variables)) {
    message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  
  return sendSMS({ // infra
    to,
    body: message,
    type: template.type,
    workspaceId: options?.workspaceId,
    userId: options?.userId,
    metadata: { template: templateKey, variables },
  });
}

/**
 * Send preference-aware SMS to user - checks preferences before sending
 */
export async function sendPreferenceAwareSMS(
  userId: string,
  workspaceId: string,
  templateKey: string,
  variables: Record<string, string>
): Promise<SMSResult> {
  const [preferredLang] = await Promise.all([
    getUserPreferredLanguage(userId),
  ]);
  const localizedTemplate = getSmsTemplate(templateKey, preferredLang);
  if (!localizedTemplate) {
    return { success: false, error: `Template '${templateKey}' not found` };
  }

  const shouldSend = await shouldSendSmsForCategory(userId, workspaceId, localizedTemplate.category);
  if (!shouldSend) {
    return { success: false, error: 'User has SMS disabled for this category' };
  }

  const phone = await getUserSmsPhone(userId, workspaceId);
  if (!phone) {
    return { success: false, error: 'User has no phone number configured' };
  }

  let message = localizedTemplate.message;
  for (const [key, value] of Object.entries(variables)) {
    message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }

  return sendSMS({
    to: phone,
    body: message,
    type: localizedTemplate.type,
    workspaceId,
    userId,
    metadata: { template: templateKey, language: preferredLang, variables },
  });
}

/**
 * Log SMS delivery event for AI Brain tracking
 */
export async function logSmsDeliveryEvent(
  userId: string,
  workspaceId: string,
  messageId: string,
  templateType: string,
  success: boolean,
  error?: string
): Promise<void> {
  try {
    // aiEventStream table is not yet provisioned — delivery logging is a no-op
  } catch (err) {
    log.error('[SMS] Failed to log delivery event:', err);
  }
}

/**
 * Send approval needed SMS
 */
export async function sendApprovalNeededSMS(
  userId: string,
  workspaceId: string,
  itemType: string,
  itemId: string
): Promise<SMSResult> {
  return sendPreferenceAwareSMS(userId, workspaceId, 'approval_needed', {
    itemType: itemType.replace(/_/g, ' '),
    itemId,
  });
}

/**
 * Send PTO approved SMS
 */
export async function sendPTOApprovedSMS(
  userId: string,
  workspaceId: string,
  dates: string
): Promise<SMSResult> {
  return sendPreferenceAwareSMS(userId, workspaceId, 'pto_approved', { dates });
}

/**
 * Send PTO denied SMS
 */
export async function sendPTODeniedSMS(
  userId: string,
  workspaceId: string,
  dates: string
): Promise<SMSResult> {
  return sendPreferenceAwareSMS(userId, workspaceId, 'pto_denied', { dates });
}

/**
 * Send shift reminder SMS (preference-aware)
 */
export async function sendShiftReminderSMSWithPrefs(
  userId: string,
  workspaceId: string,
  shiftDate: string,
  shiftTime: string,
  minutesBefore: number,
  location?: string
): Promise<SMSResult> {
  if (minutesBefore <= 60) {
    return sendPreferenceAwareSMS(userId, workspaceId, 'shift_reminder_soon', {
      minutes: minutesBefore.toString(),
      location: location ? ` at ${location}` : '',
    });
  }
  
  return sendPreferenceAwareSMS(userId, workspaceId, 'shift_reminder', {
    date: shiftDate,
    time: shiftTime,
    location: location ? ` at ${location}` : '',
  });
}

/**
 * Send a shift offer SMS to an officer candidate.
 * Officers see only their own pay rate — NEVER the client billing rate.
 * Message ends with instructions to reply YES to accept.
 */
export async function sendShiftOfferSMS(params: {
  phone: string;
  officerFirstName: string;
  orgName: string;
  location: string;
  date: string;
  startTime: string;
  endTime: string;
  officerPayRate?: number;
  offerId: string;
}): Promise<SMSResult> {
  const { phone, officerFirstName, orgName, location, date, startTime, endTime, officerPayRate, offerId } = params;

  const payLine = officerPayRate ? ` Pay: $${officerPayRate.toFixed(2)}/hr.` : '';
  const body =
    `CoAIleague: Hi ${officerFirstName}, ${orgName} has a shift offer for you.\n` +
    `Location: ${location}\n` +
    `Date: ${date} ${startTime} – ${endTime}.${payLine}\n` +
    `Reply YES to accept. Ref: ${offerId}`;

  return sendSMS({ to: phone, body, type: 'shift_offer' }); // infra
}

export const smsService = {
  sendSMS, // infra
  sendSMSToUser, // infra
  sendSMSToEmployee, // infra
  sendShiftReminder,
  sendScheduleChangeNotification,
  sendApprovalNotification,
  sendClockReminder,
  sendInvoiceReminder,
  sendPaymentConfirmation,
  isSMSConfigured,
  isUserSmsEnabled,
  getUserSmsPhone,
  shouldSendSmsForCategory,
  sendTemplatedSMS,
  sendPreferenceAwareSMS,
  logSmsDeliveryEvent,
  sendApprovalNeededSMS,
  sendPTOApprovedSMS,
  sendPTODeniedSMS,
  sendShiftReminderSMSWithPrefs,
  sendShiftOfferSMS,
  SMS_TEMPLATES,
};
