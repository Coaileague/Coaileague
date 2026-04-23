/**
 * server/notifications.ts
 *
 * Compatibility shim + helper factory for notification creation.
 *
 * Route files and billing services import either:
 *   - `createNotification` directly  (billing services)
 *   - `* as notificationHelpers`     (route files, for typed helper wrappers)
 *
 * All helpers delegate to `createNotification` from notificationService which
 * handles DB persistence and real-time WebSocket broadcasting automatically.
 * The `ctx` parameter (legacy `{ storage, broadcastNotification }`) is accepted
 * but not used — it was a TS-migration shim that is now superseded.
 */

import { createNotification } from './services/notificationService';

export { createNotification };

// ---------------------------------------------------------------------------
// Legacy context type accepted by helper wrappers (ignored internally).
// Call sites pass `{ storage, broadcastNotification }` with @ts-expect-error
// suppressions; the parameter is kept for API compatibility only.
// ---------------------------------------------------------------------------
type _Ctx = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------
export async function createPayrollRunCreatedNotification(
  _ctx: _Ctx,
  params: {
    workspaceId: string;
    userId: string;
    payrollRunId: string;
    periodStart: string;
    periodEnd: string;
    createdBy?: string;
  }
): Promise<void> {
  await createNotification({
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: 'payroll_processed',
    title: 'Payroll Run Created',
    message: `A payroll run has been created for the period ${params.periodStart} – ${params.periodEnd}.`,
    relatedEntityType: 'payroll_run',
    relatedEntityId: params.payrollRunId,
    actionUrl: '/payroll',
    createdBy: params.createdBy,
    idempotencyKey: `payroll_processed-${params.payrollRunId}-${params.userId}`
  });
}

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------
export async function createShiftAssignedNotification(
  _ctx: _Ctx,
  params: {
    workspaceId: string;
    userId: string;
    shiftId: string;
    shiftTitle: string;
    shiftDate: string;
    assignedBy?: string;
  }
): Promise<void> {
  await createNotification({
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: 'shift_assigned',
    title: 'Shift Assigned',
    message: `You have been assigned to "${params.shiftTitle}" on ${params.shiftDate}.`,
    relatedEntityType: 'shift',
    relatedEntityId: params.shiftId,
    actionUrl: '/schedule',
    createdBy: params.assignedBy,
    idempotencyKey: `shift_assigned-${params.shiftId}-${params.userId}`
  });
}

export async function createShiftChangedNotification(
  _ctx: _Ctx,
  params: {
    workspaceId: string;
    userId: string;
    shiftId: string;
    shiftTitle: string;
    changes?: string;
    changedBy?: string;
  }
): Promise<void> {
  await createNotification({
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: 'shift_changed',
    title: 'Shift Updated',
    message: `Your shift "${params.shiftTitle}" has been updated${params.changes ? `: ${params.changes}` : ''}.`,
    relatedEntityType: 'shift',
    relatedEntityId: params.shiftId,
    actionUrl: '/schedule',
    createdBy: params.changedBy,
    idempotencyKey: `shift_changed-${params.shiftId}-${params.userId}`
  });
}

export async function createShiftCancelledNotification(
  _ctx: _Ctx,
  params: {
    workspaceId: string;
    userId: string;
    shiftId: string;
    shiftTitle: string;
    shiftDate: string;
    cancelledBy?: string;
  }
): Promise<void> {
  await createNotification({
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: 'shift_cancelled',
    title: 'Shift Cancelled',
    message: `Your shift "${params.shiftTitle}" on ${params.shiftDate} has been cancelled.`,
    relatedEntityType: 'shift',
    relatedEntityId: params.shiftId,
    actionUrl: '/schedule',
    createdBy: params.cancelledBy,
    idempotencyKey: `shift_cancelled-${params.shiftId}-${params.userId}`
  });
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------
export async function createSchedulePublishedNotification(
  _ctx: _Ctx,
  params: {
    workspaceId: string;
    userId: string;
    weekStart: string;
    weekEnd: string;
    totalShifts: number;
    publishedBy?: string;
  }
): Promise<void> {
  await createNotification({
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: 'schedule_published',
    title: 'Schedule Published',
    idempotencyKey: `schedule_published-${Date.now()}-${params.userId}`,
    message: `Your schedule for ${params.weekStart} – ${params.weekEnd} has been published (${params.totalShifts} shift${params.totalShifts !== 1 ? 's' : ''}).`,
    relatedEntityType: 'schedule',
    actionUrl: '/schedule',
    createdBy: params.publishedBy,
  });
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------
export async function createInvoiceCreatedNotification(
  _ctx: _Ctx,
  params: {
    workspaceId: string;
    userId: string;
    invoiceId: string;
    invoiceNumber: string;
    clientName: string;
    totalAmount: string;
    createdBy?: string;
  }
): Promise<void> {
  await createNotification({
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: 'invoice_created',
    title: 'Invoice Created',
    idempotencyKey: `invoice_created-${Date.now()}-${params.userId}`,
    message: `Invoice #${params.invoiceNumber} for ${params.clientName} ($${params.totalAmount}) has been created.`,
    relatedEntityType: 'invoice',
    relatedEntityId: params.invoiceId,
    actionUrl: '/invoices',
    createdBy: params.createdBy,
  });
}
