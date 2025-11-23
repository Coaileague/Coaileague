/**
 * Shift Approval Service - Manages shift approval/rejection workflows
 * Enables managers to approve or reject AI-generated shifts before publishing
 */

import { db } from "../db";
import { shifts, employees, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import type { Shift } from "@shared/schema";

export interface ShiftApprovalRequest {
  shiftId: string;
  approvedBy: string;
  decision: 'approved' | 'rejected';
  notes?: string;
  reason?: string; // For rejections
}

/**
 * Approve a shift for publishing
 */
export async function approveShift(
  shiftId: string,
  approvedBy: string,
  notes?: string
): Promise<Shift> {
  const result = await db
    .update(shifts)
    .set({
      status: 'published',
      acknowledgedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(shifts.id, shiftId))
    .returning();

  if (!result[0]) throw new Error(`Shift ${shiftId} not found`);

  console.log(`[SHIFT APPROVAL] Shift ${shiftId} approved by ${approvedBy}`);
  return result[0];
}

/**
 * Reject a shift and optionally auto-replace it
 */
export async function rejectShift(
  shiftId: string,
  rejectedBy: string,
  reason: string,
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
    .where(eq(shifts.id, shiftId))
    .returning();

  if (!result[0]) throw new Error(`Shift ${shiftId} not found`);

  console.log(`[SHIFT APPROVAL] Shift ${shiftId} rejected by ${rejectedBy}: ${reason}`);
  
  if (autoReplace) {
    console.log(`[SHIFT APPROVAL] Auto-replacement triggered for shift ${shiftId}`);
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
      email: employee?.email,
    };
  }

  return shift;
}

/**
 * Bulk approve shifts
 */
export async function bulkApproveShifts(
  shiftIds: string[],
  approvedBy: string
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const shiftId of shiftIds) {
    try {
      await approveShift(shiftId, approvedBy);
      success++;
    } catch (error) {
      console.error(`Failed to approve shift ${shiftId}:`, error);
      failed++;
    }
  }

  console.log(`[SHIFT APPROVAL] Bulk approval completed: ${success} success, ${failed} failed`);
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
