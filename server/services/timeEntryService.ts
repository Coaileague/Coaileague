/**
 * TimeEntry Service - Real Time Entry Synchronization
 * Implements time tracking, validation, and payroll integration
 */

import { db } from "../db";
import { timeEntries, employees, clients } from "@shared/schema";
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
 * GPS coordinates are validated at the service layer for defense-in-depth
 */
export async function createTimeEntry(
  workspaceId: string,
  data: { 
    employeeId: string; 
    clockIn: Date; 
    clockOut?: Date | null; 
    status?: string;
    latitude?: number | null;
    longitude?: number | null;
    shiftId?: string | null;
    clientId?: string | null;
  }
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

  if (data.latitude != null && data.longitude != null) {
    const gpsValidation = validateGPSCoordinates(data.latitude, data.longitude);
    if (!gpsValidation.valid) {
      throw new Error(`GPS validation failed: ${gpsValidation.error}`);
    }
  }

  // Snapshot current rates at insert time — locks billing/pay rates so
  // later rate changes don't silently rewrite completed work
  let capturedPayRate: string | null = null;
  let capturedBillRate: string | null = null;

  const [empRecord] = await db
    .select({ hourlyRate: employees.hourlyRate })
    .from(employees)
    .where(eq(employees.id, data.employeeId))
    .limit(1);
  capturedPayRate = empRecord?.hourlyRate || null;

  if (data.clientId) {
    const [clientRecord] = await db
      .select({ contractRate: clients.contractRate })
      .from(clients)
      .where(eq(clients.id, data.clientId))
      .limit(1);
    capturedBillRate = clientRecord?.contractRate || null;
  }

  const insertValues: Record<string, any> = {
    workspaceId,
    employeeId: data.employeeId,
    clockIn: data.clockIn,
    clockOut: data.clockOut || null,
    status: data.status || "pending",
    // Automatically mark as billable when a client is associated.
    // Officers clock in on-site (GPS-verified); any entry linked to a client
    // is billable by definition — billing aggregator requires this flag.
    billableToClient: data.clientId ? true : false,
    capturedPayRate,
    capturedBillRate,
  };

  if (data.latitude != null) insertValues.clockInLatitude = data.latitude;
  if (data.longitude != null) insertValues.clockInLongitude = data.longitude;
  if (data.shiftId) insertValues.shiftId = data.shiftId;
  if (data.clientId) insertValues.clientId = data.clientId;

  const result = await db
    .insert(timeEntries)
    .values(insertValues)
    .returning();

  return result[0];
}

/**
 * Validate GPS coordinates are within valid ranges
 * Defense-in-depth: coordinates checked at service layer independent of route validation
 */
export function validateGPSCoordinates(
  latitude: number,
  longitude: number
): { valid: boolean; error?: string } {
  if (typeof latitude !== 'number' || isNaN(latitude) || latitude < -90 || latitude > 90) {
    return { valid: false, error: 'Latitude must be between -90 and 90' };
  }
  if (typeof longitude !== 'number' || isNaN(longitude) || longitude < -180 || longitude > 180) {
    return { valid: false, error: 'Longitude must be between -180 and 180' };
  }
  if (latitude === 0 && longitude === 0) {
    return { valid: false, error: 'GPS coordinates appear to be default/null island (0,0)' };
  }
  return { valid: true };
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
    orderBy: [desc(timeEntries.clockIn)],
  });
}

/**
 * Calculate total hours for payroll period
 * Missing 8hr/day threshold required by A3 spec — added daily OT calculation
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
  let dailyOvertimeMinutes = 0;
  const entriesByDay: Record<string, number> = {};

  for (const entry of entries) {
    const billableHours = calculateBillableHours(entry);
    const billableMinutes = billableHours * 60;
    totalMinutes += billableMinutes;

    const dayKey = new Date(entry.clockIn).toISOString().split('T')[0];
    entriesByDay[dayKey] = (entriesByDay[dayKey] || 0) + billableMinutes;
  }

  // Calculate daily overtime (any hours over 8 per day)
  for (const dayKey in entriesByDay) {
    const dayMinutes = entriesByDay[dayKey];
    if (dayMinutes > 480) { // 8 hours * 60 minutes
      dailyOvertimeMinutes += (dayMinutes - 480);
    }
  }

  const totalHours = totalMinutes / 60;
  const weeklyOvertimeMinutes = Math.max(0, totalMinutes - 2400); // 40 hours * 60 minutes
  
  // Overtime is the greater of (total hours over 40/week) or (sum of daily hours over 8)
  // This is a common labor law standard (e.g., California)
  const overtimeMinutes = Math.max(weeklyOvertimeMinutes, dailyOvertimeMinutes);
  const regularMinutes = totalMinutes - overtimeMinutes;

  return {
    regularHours: regularMinutes / 60,
    overtimeHours: overtimeMinutes / 60,
    totalHours,
  };
}
