/**
 * Analytics Data Service - Replace mock analytics with real operational data
 */

import { db } from "../db";
import { shifts, timeEntries, payrollEntries, employees } from "@shared/schema";
import { eq, and, gte, lte } from "drizzle-orm";

export interface AnalyticsSummary {
  activeEmployees: number;
  shiftsCompleted: number;
  shiftsScheduled: number;
  completionRate: number;
  totalHoursPaid: number;
  averageHourlyRate: number;
  payrollProcessed: number;
}

/**
 * Get real analytics from database instead of mock data
 */
export async function getAnalyticsSummary(
  workspaceId: string,
  startDate?: Date,
  endDate?: Date
): Promise<AnalyticsSummary> {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate || new Date();

  // Active employees
  const activeEmployees = await db
    .select()
    .from(employees)
    .where(eq(employees.workspaceId, workspaceId));

  // Shifts data
  const shiftData = await db
    .select()
    .from(shifts)
    .where(and(
      eq(shifts.workspaceId, workspaceId),
      gte(shifts.createdAt, start),
      lte(shifts.createdAt, end)
    ));

  const shiftsCompleted = shiftData.filter(s => s.status === 'completed').length;
  const shiftsScheduled = shiftData.length;
  const completionRate = shiftsScheduled > 0 ? Math.round((shiftsCompleted / shiftsScheduled) * 100) : 0;

  // Time entries
  const timeEntryData = await db
    .select()
    .from(timeEntries)
    .where(and(
      eq(timeEntries.workspaceId, workspaceId),
      gte(timeEntries.createdAt, start),
      lte(timeEntries.createdAt, end)
    ));

  const totalHoursPaid = timeEntryData.reduce((sum: number, t) => {
    return sum + parseFloat(t.totalHours?.toString() || '0');
  }, 0);

  // Payroll data
  const payrollData = await db
    .select()
    .from(payrollEntries)
    .where(and(
      eq(payrollEntries.workspaceId, workspaceId),
      gte(payrollEntries.createdAt, start),
      lte(payrollEntries.createdAt, end)
    ));

  const avgHourlyRate = activeEmployees.length > 0
    ? activeEmployees.reduce((sum: number, e) => sum + parseFloat(e.hourlyRate?.toString() || '0'), 0) / activeEmployees.length
    : 0;

  return {
    activeEmployees: activeEmployees.length,
    shiftsCompleted,
    shiftsScheduled,
    completionRate,
    totalHoursPaid: Math.round(totalHoursPaid),
    averageHourlyRate: Math.round(avgHourlyRate * 100) / 100,
    payrollProcessed: payrollData.length,
  };
}

export const analyticsDataService = {
  getAnalyticsSummary,
};
