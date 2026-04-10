/**
 * Shift Approval Service - Manages shift approval/rejection workflows
 * Enables managers to approve or reject AI-generated shifts before publishing
 */

import { db } from "../db";
import { shifts, employees, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import type { Shift } from "@shared/schema";
import { broadcastShiftUpdate } from '../websocket';
import { createLogger } from '../lib/logger';
const log = createLogger('shiftApprovalService');


export interface ShiftApprovalRequest {
  shiftId: string;
  approvedBy: string;
  decision: 'approved' | 'rejected';
  notes?: string;
  reason?: string; // For rejections
}

/**
 * Approve a shift for publishing.
 * PHASE 4A: Broadcasts real-time notification to workspace WebSocket clients.
 *
 * FIX [CROSS-TENANT SHIFT APPROVAL]: workspaceId is now required and included
 * in the WHERE clause. Previously the UPDATE was keyed only on shiftId, which
 * allowed any authenticated manager to approve any shift in the platform by
 * knowing its UUID — even shifts belonging to a completely different workspace.
 */
export async function approveShift(
  shiftId: string,
  approvedBy: string,
  workspaceId: string,
  notes?: string
): Promise<Shift> {
  const result = await db
    .update(shifts)
    .set({
      status: 'published',
      acknowledgedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)))
    .returning();

  if (!result[0]) throw new Error(`Shift ${shiftId} not found or does not belong to workspace`);

  log.info(`[SHIFT APPROVAL] Shift ${shiftId} approved by ${approvedBy}`);
  
  // PHASE 4A: Real-time notification broadcast
  try {
    broadcastShiftUpdate(result[0].workspaceId, 'shift_updated', result[0], shiftId);
  } catch (error) {
    log.error('[NOTIFICATION ERROR] Failed to broadcast shift approval:', error);
  }
  
  return result[0];
}

/**
 * Reject a shift and optionally auto-replace it
 * PHASE 4A: Broadcasts real-time notification to workspace WebSocket clients
 */
export async function rejectShift(
  shiftId: string,
  rejectedBy: string,
  reason: string,
  workspaceId: string,
  autoReplace: boolean = false
): Promise<Shift> {
  const result = await db
    .update(shifts)
    .set({
      status: 'cancelled',
      deniedAt: new Date(),
      denialReason: reason,
      updatedAt: new Date(),
    })
    .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)))
    .returning();

  if (!result[0]) throw new Error(`Shift ${shiftId} not found`);

  log.info(`[SHIFT APPROVAL] Shift ${shiftId} rejected by ${rejectedBy}: ${reason}`);
  
  // PHASE 4A: Real-time notification broadcast
  try {
    broadcastShiftUpdate(result[0].workspaceId, 'shift_deleted', result[0], shiftId);
  } catch (error) {
    log.error('[NOTIFICATION ERROR] Failed to broadcast shift rejection:', error);
  }
  
  if (autoReplace) {
    log.info(`[SHIFT APPROVAL] Auto-replacement triggered for shift ${shiftId}`);
    // Trigger replacement logic here (could call AutomationEngine)
  }

  return result[0];
}

/**
 * Get all pending shifts awaiting approval for a workspace
 */
export async function getPendingShifts(workspaceId: string): Promise<Shift[]> {
  return db.query.shifts.findMany({
    where: and(
      eq(shifts.workspaceId, workspaceId),
      eq(shifts.status, 'draft')
    ),
  });
}

/**
 * Get shift details with employee info
 */
export async function getShiftWithDetails(shiftId: string): Promise<(Shift & { employeeName?: string; email?: string }) | null> {
  const shift = await db.query.shifts.findFirst({
    where: eq(shifts.id, shiftId),
  });

  if (!shift) return null;

  if (shift.employeeId) {
    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, shift.employeeId),
    });
    return {
      ...shift,
      employeeName: employee ? `${employee.firstName} ${employee.lastName}` : undefined,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      email: employee?.email,
    };
  }

  return shift;
}

/**
 * Bulk approve shifts.
 *
 * FIX [BULK APPROVE CROSS-TENANT + DOS]: workspaceId is now required and
 * forwarded to approveShift, which enforces the workspace filter on each
 * individual UPDATE. Also enforces a hard cap of 200 shifts per call to
 * prevent a large array from exhausting DB connections or server memory.
 */
export async function bulkApproveShifts(
  shiftIds: string[],
  approvedBy: string,
  workspaceId: string
): Promise<{ success: number; failed: number }> {
  const MAX_BULK = 200;
  if (shiftIds.length > MAX_BULK) {
    throw new Error(`Bulk approve limit is ${MAX_BULK} shifts per request. Received ${shiftIds.length}.`);
  }

  let success = 0;
  let failed = 0;

  for (const shiftId of shiftIds) {
    try {
      await approveShift(shiftId, approvedBy, workspaceId);
      success++;
    } catch (error) {
      log.error(`Failed to approve shift ${shiftId}:`, error);
      failed++;
    }
  }

  log.info(`[SHIFT APPROVAL] Bulk approval completed: ${success} success, ${failed} failed`);
  return { success, failed };
}

/**
 * Get approval statistics for a workspace
 */
export async function getApprovalStats(workspaceId: string): Promise<{
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}> {
  const allShifts = await db.query.shifts.findMany({
    where: eq(shifts.workspaceId, workspaceId),
  });

  const pending = allShifts.filter(s => s.status === 'draft').length;
  const approved = allShifts.filter(s => s.status === 'published').length;
  const rejected = allShifts.filter(s => s.status === 'cancelled').length;

  return {
    pending,
    approved,
    rejected,
    total: allShifts.length,
  };
}
