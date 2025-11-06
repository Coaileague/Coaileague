import { IStorage } from './storage';

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

interface CreateNotificationParams {
  workspaceId: string;
  userId: string;
  title: string;
  message: string;
  type: string;
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
    action: 'notification_created',
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
  }
) {
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
  }
) {
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
  }
) {
  const message = params.reason
    ? `Your time off request from ${params.startDate} to ${params.endDate} has been denied. Reason: ${params.reason}`
    : `Your time off request from ${params.startDate} to ${params.endDate} has been denied`;

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
  }
) {
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
  }
) {
  const message = params.reason
    ? `Your timesheet for ${params.periodStart} - ${params.periodEnd} has been rejected. Reason: ${params.reason}`
    : `Your timesheet for ${params.periodStart} - ${params.periodEnd} has been rejected`;

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
  }
) {
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
