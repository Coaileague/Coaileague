/**
 * TimeEntry Service - Real Time Entry Synchronization
 * Implements time tracking, validation, and payroll integration
 */

import { db } from "../db";
import { timeEntries, employees } from "@shared/schema";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import type { InsertTimeEntry, TimeEntry } from "@shared/schema";

export interface TimeEntryQuery {
  employeeId?: string;
  startDate?: Date;
  endDate?: Date;
  status?: "pending" | "approved" | "rejected";
  limit?: number;
}

/**
 * Get time entries for an employee within a date range
 * Used by payroll engine to calculate hours for payment
 */
export async function getTimeEntriesByEmployee(
  employeeId: string,
  startDate: Date,
  endDate: Date
): Promise<TimeEntry[]> {
  return db.query.timeEntries.findMany({
    where: and(
      eq(timeEntries.employeeId, employeeId),
      gte(timeEntries.clockIn, startDate),
      lte(timeEntries.clockOut || timeEntries.clockIn, endDate),
      eq(timeEntries.status, "approved")
    ),
    orderBy: [desc(timeEntries.clockIn)],
  });
}

/**
 * Get all time entries for a workspace
 */
export async function getTimeEntriesByWorkspace(
  workspaceId: string,
  startDate: Date,
  endDate: Date,
  status?: string
): Promise<TimeEntry[]> {
  const filters = [
    eq(timeEntries.workspaceId, workspaceId),
    gte(timeEntries.clockIn, startDate),
    lte(timeEntries.clockIn, endDate),
  ];

  if (status) {
    filters.push(eq(timeEntries.status, status as any));
  }

  return db.query.timeEntries.findMany({
    where: and(...filters),
    orderBy: [desc(timeEntries.clockIn)],
  });
}

/**
 * Calculate total billable hours for a time entry
 */
export function calculateBillableHours(entry: TimeEntry): number {
  if (!entry.clockOut) return 0;
  const clockOut = new Date(entry.clockOut);
  const clockIn = new Date(entry.clockIn);
  const totalMinutes = (clockOut.getTime() - clockIn.getTime()) / 60000;
  
  const billableMinutes = Math.max(0, totalMinutes);
  return billableMinutes / 60;
}

/**
 * Validate time entry for errors (overlaps, exceeds max hours, etc.)
 */
export async function validateTimeEntry(
  workspaceId: string,
  employeeId: string,
  clockIn: Date,
  clockOut: Date | null
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Check for overlapping entries
  if (clockOut) {
    const overlapping = await db.query.timeEntries.findMany({
      where: and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.employeeId, employeeId),
        eq(timeEntries.status, "approved")
      ),
    });

    for (const entry of overlapping) {
      const entryClockOut = entry.clockOut || new Date();
      if (
        clockIn < entryClockOut &&
        clockOut > entry.clockIn
      ) {
        errors.push("Time entry overlaps with existing entry");
        break;
      }
    }
  }

  // Check for max hours per day (12 hours)
  if (clockOut) {
    const totalMinutes = (clockOut.getTime() - clockIn.getTime()) / 60000;
    const hours = totalMinutes / 60;

    if (hours > 12) {
      errors.push("Daily hours cannot exceed 12");
    }
  }

  // Check for future clock-in
  if (clockIn > new Date()) {
    errors.push("Cannot clock in for future times");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create a new time entry (clock in)
 */
export async function createTimeEntry(
  workspaceId: string,
  data: { employeeId: string; clockIn: Date; clockOut?: Date | null; status?: string }
): Promise<TimeEntry> {
  const validation = await validateTimeEntry(
    workspaceId,
    data.employeeId,
    data.clockIn,
    data.clockOut || null
  );

  if (!validation.valid) {
    throw new Error(`Time entry validation failed: ${validation.errors.join(", ")}`);
  }

  const result = await db
    .insert(timeEntries)
    .values({ 
      workspaceId,
      employeeId: data.employeeId,
      clockIn: data.clockIn,
      clockOut: data.clockOut || null,
      status: data.status || "pending"
    })
    .returning();

  return result[0];
}

/**
 * Update time entry (clock out or reject)
 */
export async function updateTimeEntry(
  id: string,
  updates: Partial<TimeEntry>
): Promise<TimeEntry> {
  const result = await db
    .update(timeEntries)
    .set(updates)
    .where(eq(timeEntries.id, id))
    .returning();

  return result[0];
}

/**
 * Approve a time entry (supervisor/manager action)
 */
export async function approveTimeEntry(
  id: string,
  approvedBy: string
): Promise<TimeEntry> {
  return updateTimeEntry(id, {
    status: "approved",
    approvedBy,
    approvedAt: new Date(),
  });
}

/**
 * Reject a time entry with reason
 */
export async function rejectTimeEntry(
  id: string,
  rejectedBy: string,
  reason: string
): Promise<TimeEntry> {
  return updateTimeEntry(id, {
    status: "rejected",
    rejectedBy,
    rejectedAt: new Date(),
    rejectionReason: reason,
  });
}

/**
 * Get pending time entries awaiting approval
 */
export async function getPendingTimeEntries(
  workspaceId: string
): Promise<TimeEntry[]> {
  return db.query.timeEntries.findMany({
    where: and(
      eq(timeEntries.workspaceId, workspaceId),
      eq(timeEntries.status, "pending")
    ),
    orderBy: [desc(timeEntries.clockInTime)],
  });
}

/**
 * Calculate total hours for payroll period
 */
export async function calculatePayrollHours(
  employeeId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
}> {
  const entries = await getTimeEntriesByEmployee(employeeId, startDate, endDate);

  let totalMinutes = 0;

  for (const entry of entries) {
    const billable = calculateBillableHours(entry);
    totalMinutes += billable * 60;
  }

  const totalHours = totalMinutes / 60;
  const regularHours = Math.min(40, totalHours);
  const overtimeHours = Math.max(0, totalHours - 40);

  return {
    regularHours,
    overtimeHours,
    totalHours,
  };
}
