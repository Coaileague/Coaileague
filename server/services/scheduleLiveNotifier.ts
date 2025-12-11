/**
 * Schedule Live Notifier Service
 * 
 * Real-time schedule notifications through AI Brain orchestration.
 * Ensures employees are immediately notified of any schedule changes
 * via WebSocket, push notifications, and the notification system.
 * 
 * Features:
 * - Instant WebSocket push for schedule changes
 * - AI Brain orchestrated notifications with smart messaging
 * - Affected employee identification and targeted delivery
 * - Support/Trinity action tracking for audit trail
 */

import { db } from '../db';
import { shifts, employees, users } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import {
  notifySchedulePublished,
  notifyShiftCreated,
  notifyShiftUpdated,
  notifyShiftDeleted,
  notifyShiftSwap,
  publishPlatformUpdate,
} from './platformEventBus';

export interface ShiftInfo {
  id: string;
  workspaceId: string;
  employeeId?: string | null;
  assignedEmployeeIds?: string[] | null;
  startTime: Date | string;
  endTime: Date | string;
  title?: string | null;
  location?: string | null;
}

interface ActionContext {
  userId: string;
  userRole: string;
  isSupport?: boolean;
  isTrinity?: boolean;
  reason?: string;
}

/**
 * Format date for user-friendly display
 */
function formatShiftDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format time for user-friendly display
 */
function formatShiftTime(startTime: Date | string, endTime: Date | string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

/**
 * Get all affected employee IDs from a shift
 */
function getAffectedEmployeeIds(shift: ShiftInfo): string[] {
  const ids: string[] = [];
  if (shift.employeeId) ids.push(shift.employeeId);
  if (shift.assignedEmployeeIds && Array.isArray(shift.assignedEmployeeIds)) {
    for (const id of shift.assignedEmployeeIds) {
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

/**
 * Get employee name for notifications
 */
async function getEmployeeName(employeeId: string): Promise<string> {
  try {
    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, employeeId),
      columns: { firstName: true, lastName: true },
    });
    if (employee) {
      return `${employee.firstName} ${employee.lastName}`.trim() || 'Employee';
    }
  } catch (error) {
    console.error('[ScheduleLive] Error getting employee name:', error);
  }
  return 'Employee';
}

/**
 * Notify when a new shift is created and assigned
 */
export async function onShiftCreated(
  shift: ShiftInfo,
  context: ActionContext
): Promise<void> {
  try {
    const affectedIds = getAffectedEmployeeIds(shift);
    if (affectedIds.length === 0) {
      console.log('[ScheduleLive] Shift created but no employees assigned, skipping notification');
      return;
    }

    const shiftDate = formatShiftDate(shift.startTime);
    const shiftTime = formatShiftTime(shift.startTime, shift.endTime);

    for (const employeeId of affectedIds) {
      const employeeName = await getEmployeeName(employeeId);
      
      await notifyShiftCreated({
        workspaceId: shift.workspaceId,
        employeeId,
        employeeName,
        shiftId: shift.id,
        shiftDate,
        shiftTime,
        createdBy: context.userId,
        createdByRole: context.isTrinity ? 'Trinity AI' : context.isSupport ? 'Support' : context.userRole,
      });
    }

    console.log(`[ScheduleLive] Shift created: Notified ${affectedIds.length} employee(s)`);
  } catch (error) {
    console.error('[ScheduleLive] Error in onShiftCreated:', error);
  }
}

/**
 * Notify when a shift is updated
 */
export async function onShiftUpdated(
  shift: ShiftInfo,
  changes: string,
  context: ActionContext
): Promise<void> {
  try {
    const affectedIds = getAffectedEmployeeIds(shift);
    if (affectedIds.length === 0) {
      console.log('[ScheduleLive] Shift updated but no employees assigned, skipping notification');
      return;
    }

    const shiftDate = formatShiftDate(shift.startTime);
    const shiftTime = formatShiftTime(shift.startTime, shift.endTime);

    for (const employeeId of affectedIds) {
      await notifyShiftUpdated({
        workspaceId: shift.workspaceId,
        employeeId,
        shiftId: shift.id,
        shiftDate,
        shiftTime,
        changedBy: context.userId,
        changedByRole: context.isTrinity ? 'Trinity AI' : context.isSupport ? 'Support' : context.userRole,
        changes,
      });
    }

    console.log(`[ScheduleLive] Shift updated: Notified ${affectedIds.length} employee(s) - ${changes}`);
  } catch (error) {
    console.error('[ScheduleLive] Error in onShiftUpdated:', error);
  }
}

/**
 * Notify when a shift is deleted
 */
export async function onShiftDeleted(
  shift: ShiftInfo,
  context: ActionContext
): Promise<void> {
  try {
    const affectedIds = getAffectedEmployeeIds(shift);
    if (affectedIds.length === 0) {
      console.log('[ScheduleLive] Shift deleted but no employees were assigned, skipping notification');
      return;
    }

    const shiftDate = formatShiftDate(shift.startTime);
    const shiftTime = formatShiftTime(shift.startTime, shift.endTime);

    for (const employeeId of affectedIds) {
      await notifyShiftDeleted({
        workspaceId: shift.workspaceId,
        employeeId,
        shiftId: shift.id,
        shiftDate,
        shiftTime,
        deletedBy: context.userId,
        deletedByRole: context.isTrinity ? 'Trinity AI' : context.isSupport ? 'Support' : context.userRole,
        reason: context.reason,
      });
    }

    console.log(`[ScheduleLive] Shift deleted: Notified ${affectedIds.length} employee(s)`);
  } catch (error) {
    console.error('[ScheduleLive] Error in onShiftDeleted:', error);
  }
}

/**
 * Notify when a schedule is published for a week
 */
export async function onSchedulePublished(params: {
  workspaceId: string;
  weekStart: string;
  weekEnd: string;
  affectedEmployeeIds: string[];
  publishedBy: string;
  publishedByRole: string;
  totalShifts: number;
}): Promise<void> {
  try {
    await notifySchedulePublished(params);
    console.log(`[ScheduleLive] Schedule published: Notified ${params.affectedEmployeeIds.length} employee(s) for ${params.weekStart} - ${params.weekEnd}`);
  } catch (error) {
    console.error('[ScheduleLive] Error in onSchedulePublished:', error);
  }
}

/**
 * Notify about shift swap events
 */
export async function onShiftSwap(
  eventType: 'requested' | 'approved' | 'denied',
  params: {
    workspaceId: string;
    requesterId: string;
    targetEmployeeId?: string;
    shiftId: string;
    shiftDate: string;
    actionBy: string;
    actionByRole: string;
    reason?: string;
  }
): Promise<void> {
  try {
    const eventMap = {
      requested: 'shift_swap_requested',
      approved: 'shift_swap_approved',
      denied: 'shift_swap_denied',
    } as const;

    await notifyShiftSwap(eventMap[eventType], params);
    console.log(`[ScheduleLive] Shift swap ${eventType}: Notified affected employees`);
  } catch (error) {
    console.error('[ScheduleLive] Error in onShiftSwap:', error);
  }
}

/**
 * Notify about automation-triggered schedule changes
 * Used when Trinity or automation jobs modify schedules
 */
export async function onAutomationScheduleChange(params: {
  workspaceId: string;
  actionType: 'created' | 'updated' | 'deleted' | 'bulk_created';
  affectedEmployeeIds: string[];
  description: string;
  automationSource: 'trinity' | 'scheduler' | 'ai_brain' | 'support';
}): Promise<void> {
  try {
    await publishPlatformUpdate({
      type: 'automation_completed',
      category: 'schedule',
      title: 'Schedule Updated by Automation',
      description: params.description,
      workspaceId: params.workspaceId,
      visibility: 'all',
      priority: 1,
      metadata: {
        actionType: params.actionType,
        affectedEmployeeIds: params.affectedEmployeeIds,
        automationSource: params.automationSource,
      },
    });

    console.log(`[ScheduleLive] Automation schedule change: ${params.actionType} - ${params.affectedEmployeeIds.length} affected`);
  } catch (error) {
    console.error('[ScheduleLive] Error in onAutomationScheduleChange:', error);
  }
}

console.log('[ScheduleLiveNotifier] Service initialized - Real-time schedule notifications ready');
