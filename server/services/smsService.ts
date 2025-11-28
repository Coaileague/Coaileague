/**
 * SMS Notification Service - Twilio Integration
 * Sends SMS notifications for schedule changes, reminders, and alerts
 */

import { db } from '../db';
import { employees, users, notifications } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { isFeatureEnabled } from '@shared/platformConfig';

interface SMSMessage {
  to: string;
  body: string;
  workspaceId?: string;
  userId?: string;
  type?: string;
}

interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
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
      console.error('[SMS] Failed to initialize Twilio client:', error);
    }
  }
  return twilioClient;
}

export async function sendSMS(message: SMSMessage): Promise<SMSResult> {
  if (!isFeatureEnabled('enableSMSNotifications')) {
    console.log('[SMS] SMS notifications disabled by feature flag');
    return { success: false, error: 'SMS notifications disabled' };
  }

  const client = await getTwilioClient();
  
  if (!client) {
    console.log('[SMS] Twilio client not configured - skipping SMS');
    return { success: false, error: 'Twilio not configured' };
  }

  if (!process.env.TWILIO_PHONE_NUMBER) {
    console.log('[SMS] TWILIO_PHONE_NUMBER not set');
    return { success: false, error: 'Twilio phone number not configured' };
  }

  try {
    const result = await client.messages.create({
      body: message.body,
      to: message.to,
      from: process.env.TWILIO_PHONE_NUMBER,
    });

    console.log(`[SMS] Sent to ${message.to}: ${result.sid}`);
    
    return {
      success: true,
      messageId: result.sid,
    };
  } catch (error: any) {
    console.error('[SMS] Failed to send:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function sendSMSToUser(userId: string, body: string, type: string = 'notification'): Promise<SMSResult> {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user?.phone) {
      return { success: false, error: 'User has no phone number' };
    }

    return sendSMS({
      to: user.phone,
      body,
      userId,
      type,
    });
  } catch (error: any) {
    console.error('[SMS] Error sending to user:', error);
    return { success: false, error: error.message };
  }
}

export async function sendSMSToEmployee(employeeId: string, body: string, type: string = 'notification', workspaceId?: string): Promise<SMSResult> {
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

    return sendSMS({
      to: employee.phone,
      body,
      type,
    });
  } catch (error: any) {
    console.error('[SMS] Error sending to employee:', error);
    return { success: false, error: error.message };
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
  
  return sendSMSToEmployee(employeeId, message, 'shift_reminder', workspaceId);
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
  
  return sendSMSToEmployee(employeeId, messages[changeType], 'schedule_change', workspaceId);
}

export async function sendApprovalNotification(
  userId: string,
  itemType: 'timesheet' | 'time_off' | 'expense',
  status: 'approved' | 'rejected',
  details?: string
): Promise<SMSResult> {
  const statusText = status === 'approved' ? 'approved' : 'requires attention';
  const message = `CoAIleague: Your ${itemType.replace('_', ' ')} has been ${statusText}${details ? ` - ${details}` : ''}`;
  
  return sendSMSToUser(userId, message, `${itemType}_${status}`);
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
  
  return sendSMSToEmployee(employeeId, messages[reminderType], reminderType);
}

export async function sendInvoiceReminder(
  clientPhone: string,
  invoiceNumber: string,
  amount: string,
  dueDate: string
): Promise<SMSResult> {
  const message = `CoAIleague: Invoice ${invoiceNumber} for ${amount} is due ${dueDate}. View and pay online at your client portal.`;
  
  return sendSMS({
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
  
  return sendSMS({
    to: clientPhone,
    body: message,
    type: 'payment_confirmation',
  });
}

export function isSMSConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
}
