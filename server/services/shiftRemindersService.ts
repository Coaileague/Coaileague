/**
 * Shift Reminders Service - Enhanced with SMS, Email, and Customizable Timing
 * 
 * Phase 2D: Supports user preferences for reminder timing and delivery channels
 */

import { db } from "../db";
import {
  shifts,
  employees,
  users,
  userNotificationPreferences,
  idempotencyKeys,
} from '@shared/schema';
import { eq, and, gte, lte, isNotNull, sql } from "drizzle-orm";
import { platformEventBus } from './platformEventBus';
import { sendShiftAssignmentEmail } from "./emailCore";
import { 
  sendShiftReminderSMSWithPrefs, 
  shouldSendSmsForCategory, 
  getUserSmsPhone,
  isSMSConfigured,
  sendSMSToEmployee // email-tracked
} from "./smsService";
import { createNotification } from "./notificationService";
import { createLogger } from '../lib/logger';
import { PLATFORM_WORKSPACE_ID } from './billing/billingConstants';
const log = createLogger('shiftRemindersService');


export interface ReminderResult {
  shiftId: string;
  employeeId: string;
  employeeName: string;
  email: string;
  status: 'sent' | 'partial' | 'failed';
  message: string;
  channels: {
    email?: { sent: boolean; error?: string };
    sms?: { sent: boolean; error?: string };
    push?: { sent: boolean; error?: string };
  };
}

interface ShiftReminderConfig {
  minutesBefore: number;
  channels: ('email' | 'sms' | 'push')[];
}

const TIMING_TO_MINUTES: Record<string, number> = {
  '15min': 15,
  '30min': 30,
  '1hour': 60,
  '2hours': 120,
  '4hours': 240,
  '12hours': 720,
  '24hours': 1440,
  '48hours': 2880,
};

/**
 * Get user's shift reminder configuration from preferences
 */
async function getUserReminderConfig(userId: string, workspaceId: string): Promise<ShiftReminderConfig | null> {
  try {
    const [prefs] = await db
      .select()
      .from(userNotificationPreferences)
      .where(and(
        eq(userNotificationPreferences.userId, userId),
        eq(userNotificationPreferences.workspaceId, workspaceId)
      ));
    
    if (!prefs || !prefs.enableShiftReminders) {
      return null;
    }
    
    let minutesBefore = TIMING_TO_MINUTES[prefs.shiftReminderTiming || '1hour'] || 60;
    if (prefs.shiftReminderTiming === 'custom' && prefs.shiftReminderCustomMinutes) {
      minutesBefore = prefs.shiftReminderCustomMinutes;
    }
    
    const channels = (prefs.shiftReminderChannels as string[]) || ['push', 'email'];
    
    return {
      minutesBefore,
      channels: channels as ('email' | 'sms' | 'push')[],
    };
  } catch (error) {
    log.error('[ShiftReminders] Error getting user config:', error);
    return { minutesBefore: 60, channels: ['email', 'push'] };
  }
}

/**
 * Send reminder for a specific shift using user's preferred channels
 */
export async function sendShiftReminder(
  shiftId: string,
  workspaceId: string
): Promise<ReminderResult | null> {
  // DB-backed idempotency guard: prevents duplicate reminders when the cron fires
  // more than once within the 5-minute window (server restart, overlapping runs).
  // Key is scoped to the shift so each shift gets exactly one reminder per lifecycle.
  const reminderKey = `shift-reminder-${shiftId}`;
  const inserted = await db.insert(idempotencyKeys)
    .values({
      workspaceId,
      operationType: 'shift_reminder',
      requestFingerprint: reminderKey,
      status: 'completed',
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // expire 8h from now
    })
    .onConflictDoNothing()
    .returning({ id: idempotencyKeys.id });

  if (inserted.length === 0) {
    // Another cron run already sent this reminder — skip silently
    log.info(`[ShiftReminders] Reminder already sent for shift ${shiftId}, skipping duplicate`);
    return null;
  }

  const [shift] = await db
    .select()
    .from(shifts)
    .where(and(
      eq(shifts.id, shiftId),
      eq(shifts.workspaceId, workspaceId)
    ));

  if (!shift || !shift.employeeId) {
    return null;
  }

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, shift.employeeId));

  if (!employee) {
    return null;
  }
  
  const userId = employee.userId;
  const config = userId ? await getUserReminderConfig(userId, workspaceId) : null;
  const channels = config?.channels || ['email', 'push'];
  
  const result: ReminderResult = {
    shiftId,
    employeeId: shift.employeeId,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    email: employee.email || 'unknown',
    status: 'sent',
    message: '',
    channels: {},
  };

  const shiftDate = shift.startTime.toISOString().split('T')[0];
  const shiftTime = shift.startTime.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
  const location = shift.description || undefined;
  
  if (channels.includes('email') && employee.email) {
    try {
      await sendShiftAssignmentEmail(
        employee.email,
        {
          employeeEmail: employee.email,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          shiftTitle: shift.title,
          shiftDate,
          startTime: shiftTime,
          endTime: shift.endTime?.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          }) || 'TBD',
          location: location || 'TBD',
        },
        workspaceId,
      );
      result.channels.email = { sent: true };
    } catch (error: any) {
      result.channels.email = { sent: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }
  
  if (channels.includes('sms') && userId && isSMSConfigured()) {
    try {
      const { NotificationDeliveryService } = await import('./notificationDeliveryService');
      const smsResult = await NotificationDeliveryService.send({
        type: 'shift_reminder',
        workspaceId,
        recipientUserId: userId,
        channel: 'sms',
        body: {
          phone: employee.phone, // fallback if user phone not in payload? deliverSMS uses payload.phone
          body: `CoAIleague Reminder: You have a shift on ${shiftDate} at ${shiftTime}${location ? ` at ${location}` : ''}. Reply STOP to unsubscribe.`,
        }
      });
      result.channels.sms = { sent: !smsResult.startsWith('skipped'), error: smsResult.startsWith('skipped') ? smsResult : undefined };
    } catch (error: any) {
      result.channels.sms = { sent: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  } else if (channels.includes('sms') && employee.phone) {
    try {
      const { NotificationDeliveryService } = await import('./notificationDeliveryService');
      const smsResult = await NotificationDeliveryService.send({
        type: 'shift_reminder',
        workspaceId,
        recipientUserId: shift.employeeId, // Assuming this is a userId or we need to find it
        channel: 'sms',
        body: {
          phone: employee.phone,
          body: `CoAIleague Reminder: You have a shift on ${shiftDate} at ${shiftTime}${location ? ` at ${location}` : ''}. Reply STOP to unsubscribe.`,
        }
      });
      result.channels.sms = { sent: !smsResult.startsWith('skipped'), error: smsResult.startsWith('skipped') ? smsResult : undefined };
    } catch (error: any) {
      result.channels.sms = { sent: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }
  
  if (channels.includes('push') && userId) {
    try {
      await createNotification({
        workspaceId,
        userId,
        type: 'shift_reminder',
        title: 'Upcoming Shift Reminder',
        message: `You have a shift scheduled on ${shiftDate} at ${shiftTime}${location ? ` at ${location}` : ''}.`,
        actionUrl: '/schedule',
        relatedEntityType: 'shift',
        relatedEntityId: shiftId,
        metadata: { shiftDate, shiftTime, location },
      });
      result.channels.push = { sent: true };
    } catch (error: any) {
      result.channels.push = { sent: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }
  
  const sentChannels = Object.entries(result.channels).filter(([_, v]) => v.sent).length;
  const totalChannels = Object.keys(result.channels).length;
  
  if (sentChannels === 0 && totalChannels > 0) {
    result.status = 'failed';
    result.message = 'All notification channels failed';
  } else if (sentChannels < totalChannels) {
    result.status = 'partial';
    result.message = `Sent via ${sentChannels}/${totalChannels} channels`;
  } else {
    result.status = 'sent';
    result.message = 'Reminder sent successfully';
  }

  await logReminderEvent(workspaceId, shiftId, shift.employeeId, result);

  return result;
}

/**
 * Log reminder delivery event for AI Brain tracking
 */
async function logReminderEvent(
  workspaceId: string,
  shiftId: string,
  employeeId: string,
  result: ReminderResult
): Promise<void> {
  log.info('[ShiftReminders] Reminder event:', {
    workspaceId,
    shiftId,
    employeeId,
    status: result.status,
    channels: result.channels,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Send reminders for all shifts in a date range
 */
export async function sendBulkShiftReminders(
  workspaceId: string,
  startDate: Date,
  endDate: Date
): Promise<ReminderResult[]> {
  const shiftsToRemind = await db
    .select()
    .from(shifts)
    .where(and(
      eq(shifts.workspaceId, workspaceId),
      gte(shifts.startTime, startDate),
      lte(shifts.startTime, endDate),
      eq(shifts.status, 'published'),
      isNotNull(shifts.employeeId)
    ));

  const results: ReminderResult[] = [];
  for (const shift of shiftsToRemind) {
    const result = await sendShiftReminder(shift.id, workspaceId);
    if (result) results.push(result);
  }

  return results;
}

/**
 * Send reminder for upcoming shifts (next 24-48 hours)
 */
export async function sendUpcomingShiftReminders(workspaceId: string): Promise<ReminderResult[]> {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const inTwoDays = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const shiftsToRemind = await db
    .select()
    .from(shifts)
    .where(and(
      eq(shifts.workspaceId, workspaceId),
      gte(shifts.startTime, tomorrow),
      lte(shifts.startTime, inTwoDays),
      eq(shifts.status, 'published'),
      isNotNull(shifts.employeeId)
    ));

  const results: ReminderResult[] = [];
  for (const shift of shiftsToRemind) {
    const result = await sendShiftReminder(shift.id, workspaceId);
    if (result) results.push(result);
  }

  return results;
}

/**
 * Get shifts that need reminders based on user preferences
 * This is the main function called by the cron job
 */
export async function getShiftsNeedingReminders(): Promise<Array<{
  shiftId: string;
  workspaceId: string;
  employeeId: string;
  userId: string | null;
  minutesBefore: number;
  channels: string[];
}>> {
  const now = new Date();
  const maxLookAhead = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  
  const upcomingShifts = await db
    .select({
      shiftId: shifts.id,
      workspaceId: shifts.workspaceId,
      employeeId: shifts.employeeId,
      startTime: shifts.startTime,
      userId: employees.userId,
    })
    .from(shifts)
    .leftJoin(employees, eq(shifts.employeeId, employees.id))
    .where(and(
      gte(shifts.startTime, now),
      lte(shifts.startTime, maxLookAhead),
      eq(shifts.status, 'published'),
      isNotNull(shifts.employeeId)
    ));
  
  const shiftsNeedingReminders: Array<{
    shiftId: string;
    workspaceId: string;
    employeeId: string;
    userId: string | null;
    minutesBefore: number;
    channels: string[];
  }> = [];
  
  for (const shift of upcomingShifts) {
    if (!shift.employeeId || !shift.workspaceId) continue;
    
    let config: ShiftReminderConfig | null = null;
    if (shift.userId) {
      config = await getUserReminderConfig(shift.userId, shift.workspaceId);
    }
    
    if (!config) {
      config = { minutesBefore: 60, channels: ['email', 'push'] };
    }
    
    const reminderTime = new Date(shift.startTime.getTime() - config.minutesBefore * 60 * 1000);
    const fiveMinuteWindow = 5 * 60 * 1000;
    
    if (Math.abs(now.getTime() - reminderTime.getTime()) <= fiveMinuteWindow) {
      shiftsNeedingReminders.push({
        shiftId: shift.shiftId,
        workspaceId: shift.workspaceId,
        employeeId: shift.employeeId,
        userId: shift.userId,
        minutesBefore: config.minutesBefore,
        channels: config.channels,
      });
    }
  }
  
  return shiftsNeedingReminders;
}

/**
 * Process all shifts that need reminders right now
 * Called by cron job every 5 minutes
 */
export async function processShiftReminders(): Promise<{
  processed: number;
  successful: number;
  failed: number;
  results: ReminderResult[];
}> {
  log.info('[ShiftReminders] Processing shift reminders...');
  
  const shiftsToRemind = await getShiftsNeedingReminders();
  
  log.info(`[ShiftReminders] Found ${shiftsToRemind.length} shifts needing reminders`);
  
  const results: ReminderResult[] = [];
  let successful = 0;
  let failed = 0;
  
  for (const shift of shiftsToRemind) {
    const result = await sendShiftReminder(shift.shiftId, shift.workspaceId);
    if (result) {
      results.push(result);
      if (result.status === 'sent' || result.status === 'partial') {
        successful++;
      } else {
        failed++;
      }
    }
  }
  
  log.info(`[ShiftReminders] Processed: ${results.length}, Successful: ${successful}, Failed: ${failed}`);

  if (results.length > 0) {
    platformEventBus.publish({
      type: 'shift_reminders_processed',
      category: 'scheduling',
      title: 'Shift Reminders Processed',
      description: `Processed ${results.length} shift reminder(s): ${successful} sent, ${failed} failed`,
      workspaceId: PLATFORM_WORKSPACE_ID,
      metadata: { processed: results.length, successful, failed },
    });
  }

  return {
    processed: results.length,
    successful,
    failed,
    results,
  };
}

/**
 * Get reminder timing options for frontend
 */
export function getReminderTimingOptions(): Array<{ value: string; label: string; minutes: number }> {
  return [
    { value: '15min', label: '15 minutes before', minutes: 15 },
    { value: '30min', label: '30 minutes before', minutes: 30 },
    { value: '1hour', label: '1 hour before', minutes: 60 },
    { value: '2hours', label: '2 hours before', minutes: 120 },
    { value: '4hours', label: '4 hours before', minutes: 240 },
    { value: '12hours', label: '12 hours before', minutes: 720 },
    { value: '24hours', label: '24 hours before', minutes: 1440 },
    { value: '48hours', label: '48 hours before', minutes: 2880 },
    { value: 'custom', label: 'Custom', minutes: 0 },
  ];
}

export const shiftRemindersService = {
  sendShiftReminder,
  sendBulkShiftReminders,
  sendUpcomingShiftReminders,
  getShiftsNeedingReminders,
  processShiftReminders,
  getUserReminderConfig,
  getReminderTimingOptions,
  TIMING_TO_MINUTES,
};
