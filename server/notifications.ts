import { IStorage } from './storage';
import { emailService } from './services/emailService';
import { notificationStateManager } from './services/notificationStateManager';

interface NotificationHelperContext {
  storage: IStorage;
  broadcastNotification?: (
    workspaceId: string,
    userId: string,
    updateType: 'notification_new' | 'notification_read' | 'notification_count_updated',
    notification?: any,
    unreadCount?: number
  ) => void;
}

type NotificationType = 
  | 'shift_assigned'
  | 'shift_changed'
  | 'shift_cancelled'
  | 'pto_approved'
  | 'pto_denied'
  | 'schedule_change'
  | 'document_uploaded'
  | 'document_expiring'
  | 'profile_updated'
  | 'form_assigned'
  | 'timesheet_approved'
  | 'timesheet_rejected'
  | 'payroll_processed'
  | 'mention'
  | 'system';

interface CreateNotificationParams {
  workspaceId: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  actionUrl?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  metadata?: any;
  createdBy?: string;
}

async function createAndBroadcastNotification(
  context: NotificationHelperContext,
  params: CreateNotificationParams
) {
  const { storage, broadcastNotification } = context;
  
  // Create notification in database
  const notification = await storage.createNotification({
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    actionUrl: params.actionUrl || null,
    relatedEntityType: params.relatedEntityType || null,
    relatedEntityId: params.relatedEntityId || null,
    metadata: params.metadata || null,
    createdBy: params.createdBy || null,
  });

  // Create audit log entry
  await storage.createAuditLog({
    userId: params.createdBy || 'system',
    userEmail: 'system',
    userRole: 'system',
    action: 'other',
    actionDescription: `Notification created: ${params.title}`,
    entityType: 'notification',
    entityId: notification.id,
    targetId: params.userId,
    targetType: 'user',
    metadata: {
      notificationType: params.type,
      title: params.title,
      message: params.message,
      actionUrl: params.actionUrl,
    },
  });

  // Broadcast to connected client if available
  if (broadcastNotification) {
    const unreadCount = await storage.getUnreadNotificationCount(params.userId, params.workspaceId);
    broadcastNotification(params.workspaceId, params.userId, 'notification_new', notification, unreadCount);
  }

  // Also notify the NotificationStateManager for unified count tracking
  await notificationStateManager.onNewNotification(params.userId, params.workspaceId, notification);

  return notification;
}

export async function createShiftAssignedNotification(
  context: NotificationHelperContext,
  params: {
    workspaceId: string;
    userId: string;
    shiftId: string;
    shiftTitle: string;
    shiftDate: string;
    assignedBy: string;
    userEmail?: string;
    userName?: string;
  }
) {
  // Send email notification if email provided
  if (params.userEmail) {
    await emailService.sendCustomEmail(
      params.userEmail,
      `New Shift Assignment: ${params.shiftTitle}`,
      `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">New Shift Assigned</h2>
        <p>Hello ${params.userName || 'Employee'},</p>
        <p>You have been assigned to a new shift:</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Shift:</strong> ${params.shiftTitle}</p>
          <p style="margin: 5px 0;"><strong>Date:</strong> ${params.shiftDate}</p>
        </div>
        <p>Please ensure you're available for this shift.</p>
      </div>`,
      'shift_assigned',
      params.workspaceId,
      params.userId
    ).catch(err => console.error('[Notification] Failed to send shift email:', err.message));
  }

  return createAndBroadcastNotification(context, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: 'shift_assigned',
    title: 'New Shift Assigned',
    message: `You've been assigned to ${params.shiftTitle} on ${params.shiftDate}`,
    actionUrl: `/schedule?shift=${params.shiftId}`,
    relatedEntityType: 'shift',
    relatedEntityId: params.shiftId,
    metadata: { shiftTitle: params.shiftTitle, shiftDate: params.shiftDate },
    createdBy: params.assignedBy,
  });
}

export async function createShiftChangedNotification(
  context: NotificationHelperContext,
  params: {
    workspaceId: string;
    userId: string;
    shiftId: string;
    shiftTitle: string;
    changes: string;
    changedBy: string;
  }
) {
  return createAndBroadcastNotification(context, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: 'shift_changed',
    title: 'Shift Updated',
    message: `Your shift "${params.shiftTitle}" has been updated: ${params.changes}`,
    actionUrl: `/schedule?shift=${params.shiftId}`,
    relatedEntityType: 'shift',
    relatedEntityId: params.shiftId,
    metadata: { shiftTitle: params.shiftTitle, changes: params.changes },
    createdBy: params.changedBy,
  });
}

export async function createShiftCancelledNotification(
  context: NotificationHelperContext,
  params: {
    workspaceId: string;
    userId: string;
    shiftId: string;
    shiftTitle: string;
    shiftDate: string;
    cancelledBy: string;
  }
) {
  return createAndBroadcastNotification(context, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: 'shift_cancelled',
    title: 'Shift Cancelled',
    message: `Your shift "${params.shiftTitle}" on ${params.shiftDate} has been cancelled`,
    actionUrl: '/schedule',
    relatedEntityType: 'shift',
    relatedEntityId: params.shiftId,
    metadata: { shiftTitle: params.shiftTitle, shiftDate: params.shiftDate },
    createdBy: params.cancelledBy,
  });
}

export async function createPTOApprovedNotification(
  context: NotificationHelperContext,
  params: {
    workspaceId: string;
    userId: string;
    requestId: string;
    startDate: string;
    endDate: string;
    approvedBy: string;
    userEmail?: string;
    userName?: string;
  }
) {
  // Send email notification if email provided
  if (params.userEmail) {
    await emailService.sendCustomEmail(
      params.userEmail,
      'Your PTO Request Has Been Approved',
      `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">PTO Request Approved</h2>
        <p>Hello ${params.userName || 'Employee'},</p>
        <p>Your time off request has been approved!</p>
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
          <p style="margin: 5px 0;"><strong>Start Date:</strong> ${params.startDate}</p>
          <p style="margin: 5px 0;"><strong>End Date:</strong> ${params.endDate}</p>
        </div>
        <p>Enjoy your time off!</p>
      </div>`,
      'pto_approved',
      params.workspaceId,
      params.userId
    ).catch(err => console.error('[Notification] Failed to send PTO email:', err.message));
  }

  return createAndBroadcastNotification(context, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: 'pto_approved',
    title: 'PTO Request Approved',
    message: `Your time off request from ${params.startDate} to ${params.endDate} has been approved`,
    actionUrl: `/time-off?request=${params.requestId}`,
    relatedEntityType: 'time_off_request',
    relatedEntityId: params.requestId,
    metadata: { startDate: params.startDate, endDate: params.endDate },
    createdBy: params.approvedBy,
  });
}

export async function createPTODeniedNotification(
  context: NotificationHelperContext,
  params: {
    workspaceId: string;
    userId: string;
    requestId: string;
    startDate: string;
    endDate: string;
    reason?: string;
    deniedBy: string;
    userEmail?: string;
    userName?: string;
  }
) {
  const message = params.reason
    ? `Your time off request from ${params.startDate} to ${params.endDate} has been denied. Reason: ${params.reason}`
    : `Your time off request from ${params.startDate} to ${params.endDate} has been denied`;

  // Send email notification if email provided
  if (params.userEmail) {
    await emailService.sendCustomEmail(
      params.userEmail,
      'Your PTO Request Has Been Denied',
      `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">PTO Request Denied</h2>
        <p>Hello ${params.userName || 'Employee'},</p>
        <p>Unfortunately, your time off request has been denied.</p>
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
          <p style="margin: 5px 0;"><strong>Requested Dates:</strong> ${params.startDate} to ${params.endDate}</p>
          ${params.reason ? `<p style="margin: 5px 0;"><strong>Reason:</strong> ${params.reason}</p>` : ''}
        </div>
        <p>Please contact your manager if you have questions about this decision or would like to discuss alternative dates.</p>
      </div>`,
      'pto_denied',
      params.workspaceId,
      params.userId
    ).catch(err => console.error('[Notification] Failed to send PTO denial email:', err.message));
  }

  return createAndBroadcastNotification(context, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: 'pto_denied',
    title: 'PTO Request Denied',
    message,
    actionUrl: `/time-off?request=${params.requestId}`,
    relatedEntityType: 'time_off_request',
    relatedEntityId: params.requestId,
    metadata: { startDate: params.startDate, endDate: params.endDate, reason: params.reason },
    createdBy: params.deniedBy,
  });
}

export async function createScheduleChangeNotification(
  context: NotificationHelperContext,
  params: {
    workspaceId: string;
    userId: string;
    changeDescription: string;
    changedBy: string;
  }
) {
  return createAndBroadcastNotification(context, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: 'schedule_change',
    title: 'Schedule Updated',
    message: params.changeDescription,
    actionUrl: '/schedule',
    relatedEntityType: 'schedule',
    metadata: { changeDescription: params.changeDescription },
    createdBy: params.changedBy,
  });
}

export async function createDocumentUploadedNotification(
  context: NotificationHelperContext,
  params: {
    workspaceId: string;
    userId: string;
    documentId: string;
    documentName: string;
    uploadedBy: string;
  }
) {
  return createAndBroadcastNotification(context, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: 'document_uploaded',
    title: 'New Document Available',
    message: `A new document has been uploaded: ${params.documentName}`,
    actionUrl: `/documents?doc=${params.documentId}`,
    relatedEntityType: 'document',
    relatedEntityId: params.documentId,
    metadata: { documentName: params.documentName },
    createdBy: params.uploadedBy,
  });
}

export async function createDocumentExpiringNotification(
  context: NotificationHelperContext,
  params: {
    workspaceId: string;
    userId: string;
    documentId: string;
    documentName: string;
    expiryDate: string;
  }
) {
  return createAndBroadcastNotification(context, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: 'document_expiring',
    title: 'Document Expiring Soon',
    message: `Your document "${params.documentName}" expires on ${params.expiryDate}`,
    actionUrl: `/documents?doc=${params.documentId}`,
    relatedEntityType: 'document',
    relatedEntityId: params.documentId,
    metadata: { documentName: params.documentName, expiryDate: params.expiryDate },
    createdBy: 'system',
  });
}

export async function createProfileUpdatedNotification(
  context: NotificationHelperContext,
  params: {
    workspaceId: string;
    userId: string;
    changes: string[];
    updatedBy: string;
  }
) {
  const changesList = params.changes.join(', ');
  return createAndBroadcastNotification(context, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: 'profile_updated',
    title: 'Profile Updated',
    message: `Your profile has been updated. Changes: ${changesList}`,
    actionUrl: '/profile',
    relatedEntityType: 'user',
    relatedEntityId: params.userId,
    metadata: { changes: params.changes },
    createdBy: params.updatedBy,
  });
}

export async function createFormAssignedNotification(
  context: NotificationHelperContext,
  params: {
    workspaceId: string;
    userId: string;
    formId: string;
    formName: string;
    dueDate?: string;
    assignedBy: string;
  }
) {
  const message = params.dueDate
    ? `You've been assigned a new form: ${params.formName}. Due: ${params.dueDate}`
    : `You've been assigned a new form: ${params.formName}`;

  return createAndBroadcastNotification(context, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: 'form_assigned',
    title: 'New Form Assigned',
    message,
    actionUrl: `/forms?form=${params.formId}`,
    relatedEntityType: 'form',
    relatedEntityId: params.formId,
    metadata: { formName: params.formName, dueDate: params.dueDate },
    createdBy: params.assignedBy,
  });
}

export async function createTimesheetApprovedNotification(
  context: NotificationHelperContext,
  params: {
    workspaceId: string;
    userId: string;
    timesheetId: string;
    periodStart: string;
    periodEnd: string;
    approvedBy: string;
    userEmail?: string;
    userName?: string;
  }
) {
  // Send email notification if email provided
  if (params.userEmail) {
    await emailService.sendCustomEmail(
      params.userEmail,
      'Your Timesheet Has Been Approved',
      `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Timesheet Approved</h2>
        <p>Hello ${params.userName || 'Employee'},</p>
        <p>Your timesheet has been reviewed and approved!</p>
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
          <p style="margin: 5px 0;"><strong>Period:</strong> ${params.periodStart} to ${params.periodEnd}</p>
          <p style="margin: 15px 0 5px 0;">You can now view your approved timesheet in your dashboard.</p>
        </div>
      </div>`,
      'timesheet_approved',
      params.workspaceId,
      params.userId
    ).catch(err => console.error('[Notification] Failed to send timesheet email:', err.message));
  }

  return createAndBroadcastNotification(context, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: 'timesheet_approved',
    title: 'Timesheet Approved',
    message: `Your timesheet for ${params.periodStart} - ${params.periodEnd} has been approved`,
    actionUrl: `/timesheets?id=${params.timesheetId}`,
    relatedEntityType: 'timesheet',
    relatedEntityId: params.timesheetId,
    metadata: { periodStart: params.periodStart, periodEnd: params.periodEnd },
    createdBy: params.approvedBy,
  });
}

export async function createTimesheetRejectedNotification(
  context: NotificationHelperContext,
  params: {
    workspaceId: string;
    userId: string;
    timesheetId: string;
    periodStart: string;
    periodEnd: string;
    reason?: string;
    rejectedBy: string;
    userEmail?: string;
    userName?: string;
  }
) {
  const message = params.reason
    ? `Your timesheet for ${params.periodStart} - ${params.periodEnd} has been rejected. Reason: ${params.reason}`
    : `Your timesheet for ${params.periodStart} - ${params.periodEnd} has been rejected`;

  // Send email notification if email provided
  if (params.userEmail) {
    await emailService.sendCustomEmail(
      params.userEmail,
      'Your Timesheet Requires Revision',
      `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Timesheet Revision Required</h2>
        <p>Hello ${params.userName || 'Employee'},</p>
        <p>Your timesheet for the period below requires revision and resubmission.</p>
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
          <p style="margin: 5px 0;"><strong>Period:</strong> ${params.periodStart} to ${params.periodEnd}</p>
          ${params.reason ? `<p style="margin: 5px 0;"><strong>Reason:</strong> ${params.reason}</p>` : ''}
        </div>
        <p>Please review and resubmit your timesheet through your dashboard.</p>
      </div>`,
      'timesheet_rejected',
      params.workspaceId,
      params.userId
    ).catch(err => console.error('[Notification] Failed to send rejection email:', err.message));
  }

  return createAndBroadcastNotification(context, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: 'timesheet_rejected',
    title: 'Timesheet Rejected',
    message,
    actionUrl: `/timesheets?id=${params.timesheetId}`,
    relatedEntityType: 'timesheet',
    relatedEntityId: params.timesheetId,
    metadata: { periodStart: params.periodStart, periodEnd: params.periodEnd, reason: params.reason },
    createdBy: params.rejectedBy,
  });
}

export async function createPayrollProcessedNotification(
  context: NotificationHelperContext,
  params: {
    workspaceId: string;
    userId: string;
    payrollId: string;
    period: string;
    amount: string;
    userEmail?: string;
    userName?: string;
  }
) {
  // Send email notification if email provided
  if (params.userEmail) {
    await emailService.sendCustomEmail(
      params.userEmail,
      `Payroll Processed - ${params.period}`,
      `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Payroll Processed</h2>
        <p>Hello ${params.userName || 'Employee'},</p>
        <p>Your payroll has been processed and is ready for review.</p>
        <div style="background-color: #eef2ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
          <p style="margin: 5px 0;"><strong>Pay Period:</strong> ${params.period}</p>
          <p style="margin: 5px 0;"><strong>Amount:</strong> ${params.amount}</p>
        </div>
        <p>Log in to your dashboard to view detailed payroll information including deductions, taxes, and net pay.</p>
      </div>`,
      'payroll_processed',
      params.workspaceId,
      params.userId
    ).catch(err => console.error('[Notification] Failed to send payroll email:', err.message));
  }

  return createAndBroadcastNotification(context, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: 'payroll_processed',
    title: 'Payroll Processed',
    message: `Your payroll for ${params.period} has been processed. Amount: ${params.amount}`,
    actionUrl: `/payroll?id=${params.payrollId}`,
    relatedEntityType: 'payroll',
    relatedEntityId: params.payrollId,
    metadata: { period: params.period, amount: params.amount },
    createdBy: 'system',
  });
}

export async function createMentionNotification(
  context: NotificationHelperContext,
  params: {
    workspaceId: string;
    userId: string;
    mentionedBy: string;
    mentionedByName: string;
    context: string;
    contextUrl: string;
  }
) {
  return createAndBroadcastNotification(context, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: 'mention',
    title: 'You Were Mentioned',
    message: `${params.mentionedByName} mentioned you: ${params.context}`,
    actionUrl: params.contextUrl,
    relatedEntityType: 'mention',
    metadata: { mentionedByName: params.mentionedByName, context: params.context },
    createdBy: params.mentionedBy,
  });
}

export async function createSystemNotification(
  context: NotificationHelperContext,
  params: {
    workspaceId: string;
    userId: string;
    title: string;
    message: string;
    actionUrl?: string;
  }
) {
  return createAndBroadcastNotification(context, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: 'system',
    title: params.title,
    message: params.message,
    actionUrl: params.actionUrl,
    relatedEntityType: 'system',
    createdBy: 'system',
  });
}

/**
 * Send welcome notification when a new organization is created
 * NOTE: Onboarding automation already handles welcome emails
 * This is a placeholder for future in-app welcome notification
 */
export async function sendWelcomeOrgNotification(
  workspaceId: string,
  userId: string
) {
  console.log(`[Notifications] Welcome org notification triggered for workspace ${workspaceId}, user ${userId}`);
  return Promise.resolve();
}
