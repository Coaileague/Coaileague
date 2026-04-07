/**
 * Timesheet Report Service
 * Generate reports and CSV exports from time entries
 */

import { db } from '../db';
import { timeEntries, timeEntryBreaks, employees, clients, shifts } from '@shared/schema';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { format, differenceInMinutes, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { COMPLIANCE } from '@shared/platformConfig';

export interface TimesheetReportEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  clientId: string | null;
  clientName: string | null;
  shiftId: string | null;
  date: string;
  clockInTime: string | null;
  clockOutTime: string | null;
  breakMinutes: number;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  status: string;
  notes: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
}

export interface TimesheetSummary {
  totalEntries: number;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  breakMinutes: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  averageHoursPerDay: number;
  byEmployee: Record<string, {
    name: string;
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    entryCount: number;
  }>;
  byClient: Record<string, {
    name: string;
    totalHours: number;
    entryCount: number;
  }>;
}

export interface TimesheetReportParams {
  workspaceId: string;
  startDate: Date;
  endDate: Date;
  employeeId?: string;
  clientId?: string;
  status?: 'pending' | 'approved' | 'rejected';
  includeBreaks?: boolean;
}

// Compliance thresholds from central configuration
const OVERTIME_THRESHOLD_HOURS = COMPLIANCE.overtime.dailyThresholdHours;
const MIN_BREAK_HOURS = COMPLIANCE.breaks.minBreakAfterHours;
const MIN_BREAK_DURATION = COMPLIANCE.breaks.minBreakDuration;
const MAX_SHIFT_HOURS = COMPLIANCE.shifts.maxDailyHours;

function calculateHours(clockIn: Date | null, clockOut: Date | null, breakMinutes: number = 0): { total: number; regular: number; overtime: number } {
  if (!clockIn || !clockOut) return { total: 0, regular: 0, overtime: 0 };
  
  const minutes = differenceInMinutes(clockOut, clockIn) - breakMinutes;
  const total = Math.max(0, minutes / 60);
  const regular = Math.min(total, OVERTIME_THRESHOLD_HOURS);
  const overtime = Math.max(0, total - OVERTIME_THRESHOLD_HOURS);
  
  return { total: Number(total.toFixed(2)), regular: Number(regular.toFixed(2)), overtime: Number(overtime.toFixed(2)) };
}

async function getBreakMinutesForEntry(timeEntryId: string): Promise<number> {
  const breaks = await db.select().from(timeEntryBreaks)
    .where(eq(timeEntryBreaks.timeEntryId, timeEntryId));
  
  let totalMinutes = 0;
  for (const brk of breaks) {
    if (brk.duration) {
      totalMinutes += Number(brk.duration);
    } else if (brk.startTime && brk.endTime) {
      totalMinutes += differenceInMinutes(brk.endTime, brk.startTime);
    }
  }
  return totalMinutes;
}

export async function generateTimesheetReport(params: TimesheetReportParams): Promise<{
  entries: TimesheetReportEntry[];
  summary: TimesheetSummary;
}> {
  const { workspaceId, startDate, endDate, employeeId, clientId, status } = params;

  const conditions = [
    eq(timeEntries.workspaceId, workspaceId),
    gte(timeEntries.clockIn, startDate),
    lte(timeEntries.clockIn, endDate),
  ];

  if (employeeId) {
    conditions.push(eq(timeEntries.employeeId, employeeId));
  }

  if (clientId) {
    conditions.push(eq(timeEntries.clientId, clientId));
  }

  if (status) {
    conditions.push(eq(timeEntries.status, status));
  }

  const rawEntries = await db.select({
    id: timeEntries.id,
    employeeId: timeEntries.employeeId,
    clientId: timeEntries.clientId,
    shiftId: timeEntries.shiftId,
    clockIn: timeEntries.clockIn,
    clockOut: timeEntries.clockOut,
    status: timeEntries.status,
    approvedAt: timeEntries.approvedAt,
    approvedBy: timeEntries.approvedBy,
    employeeFirstName: employees.firstName,
    employeeLastName: employees.lastName,
    clientName: clients.companyName,
  })
    .from(timeEntries)
    .leftJoin(employees, eq(timeEntries.employeeId, employees.id))
    .leftJoin(clients, eq(timeEntries.clientId, clients.id))
    .where(and(...conditions))
    .orderBy(desc(timeEntries.clockIn));

  const reportEntries: TimesheetReportEntry[] = [];
  
  for (const entry of rawEntries) {
    const breakMinutes = await getBreakMinutesForEntry(entry.id);
    const { total, regular, overtime } = calculateHours(
      entry.clockIn,
      entry.clockOut || null,
      breakMinutes
    );

    const empFirstName = entry.employeeFirstName || '';
    const empLastName = entry.employeeLastName || '';

    reportEntries.push({
      id: entry.id,
      employeeId: entry.employeeId,
      employeeName: (empFirstName || empLastName) ? `${empFirstName} ${empLastName}`.trim() : 'Unknown',
      clientId: entry.clientId,
      clientName: entry.clientName || null,
      shiftId: entry.shiftId,
      date: entry.clockIn ? format(entry.clockIn, 'yyyy-MM-dd') : '',
      clockInTime: entry.clockIn ? format(entry.clockIn, 'HH:mm') : null,
      clockOutTime: entry.clockOut ? format(entry.clockOut, 'HH:mm') : null,
      breakMinutes,
      totalHours: total,
      regularHours: regular,
      overtimeHours: overtime,
      status: entry.status || 'pending',
      notes: null,
      approvedAt: entry.approvedAt ? new Date(entry.approvedAt).toISOString() : null,
      approvedBy: entry.approvedBy,
    });
  }

  const summary = calculateSummary(reportEntries);

  return { entries: reportEntries, summary };
}

function calculateSummary(entries: TimesheetReportEntry[]): TimesheetSummary {
  const byEmployee: Record<string, { name: string; totalHours: number; regularHours: number; overtimeHours: number; entryCount: number }> = {};
  const byClient: Record<string, { name: string; totalHours: number; entryCount: number }> = {};

  let totalHours = 0;
  let regularHours = 0;
  let overtimeHours = 0;
  let breakMinutes = 0;
  let approvedCount = 0;
  let pendingCount = 0;
  let rejectedCount = 0;

  const uniqueDates = new Set<string>();

  for (const entry of entries) {
    totalHours += entry.totalHours;
    regularHours += entry.regularHours;
    overtimeHours += entry.overtimeHours;
    breakMinutes += entry.breakMinutes;

    if (entry.status === 'approved') approvedCount++;
    else if (entry.status === 'pending') pendingCount++;
    else if (entry.status === 'rejected') rejectedCount++;

    if (entry.date) uniqueDates.add(entry.date);

    if (!byEmployee[entry.employeeId]) {
      byEmployee[entry.employeeId] = {
        name: entry.employeeName,
        totalHours: 0,
        regularHours: 0,
        overtimeHours: 0,
        entryCount: 0,
      };
    }
    byEmployee[entry.employeeId].totalHours += entry.totalHours;
    byEmployee[entry.employeeId].regularHours += entry.regularHours;
    byEmployee[entry.employeeId].overtimeHours += entry.overtimeHours;
    byEmployee[entry.employeeId].entryCount++;

    if (entry.clientId && entry.clientName) {
      if (!byClient[entry.clientId]) {
        byClient[entry.clientId] = {
          name: entry.clientName,
          totalHours: 0,
          entryCount: 0,
        };
      }
      byClient[entry.clientId].totalHours += entry.totalHours;
      byClient[entry.clientId].entryCount++;
    }
  }

  return {
    totalEntries: entries.length,
    totalHours: Number(totalHours.toFixed(2)),
    regularHours: Number(regularHours.toFixed(2)),
    overtimeHours: Number(overtimeHours.toFixed(2)),
    breakMinutes,
    approvedCount,
    pendingCount,
    rejectedCount,
    averageHoursPerDay: uniqueDates.size > 0 ? Number((totalHours / uniqueDates.size).toFixed(2)) : 0,
    byEmployee,
    byClient,
  };
}

export function generateCSV(entries: TimesheetReportEntry[], summary: TimesheetSummary): string {
  const headers = [
    'Date',
    'Employee Name',
    'Client',
    'Clock In',
    'Clock Out',
    'Break (min)',
    'Total Hours',
    'Regular Hours',
    'Overtime Hours',
    'Status',
    'Notes',
  ];

  const rows = entries.map(entry => [
    entry.date,
    entry.employeeName,
    entry.clientName || '',
    entry.clockInTime || '',
    entry.clockOutTime || '',
    entry.breakMinutes.toString(),
    entry.totalHours.toFixed(2),
    entry.regularHours.toFixed(2),
    entry.overtimeHours.toFixed(2),
    entry.status,
    entry.notes || '',
  ]);

  rows.push([]);
  rows.push(['SUMMARY']);
  rows.push(['Total Entries', summary.totalEntries.toString()]);
  rows.push(['Total Hours', summary.totalHours.toFixed(2)]);
  rows.push(['Regular Hours', summary.regularHours.toFixed(2)]);
  rows.push(['Overtime Hours', summary.overtimeHours.toFixed(2)]);
  rows.push(['Average Hours/Day', summary.averageHoursPerDay.toFixed(2)]);
  rows.push(['Approved', summary.approvedCount.toString()]);
  rows.push(['Pending', summary.pendingCount.toString()]);
  rows.push(['Rejected', summary.rejectedCount.toString()]);

  rows.push([]);
  rows.push(['BY EMPLOYEE']);
  for (const [_empId, emp] of Object.entries(summary.byEmployee)) {
    rows.push([emp.name, `${emp.totalHours.toFixed(2)} hrs`, `${emp.overtimeHours.toFixed(2)} OT`]);
  }

  if (Object.keys(summary.byClient).length > 0) {
    rows.push([]);
    rows.push(['BY CLIENT']);
    for (const [_clientId, client] of Object.entries(summary.byClient)) {
      rows.push([client.name, `${client.totalHours.toFixed(2)} hrs`, `${client.entryCount} entries`]);
    }
  }

  const escape = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  return [
    headers.map(escape).join(','),
    ...rows.map(row => row.map(escape).join(',')),
  ].join('\n');
}

export async function getWeeklyReport(workspaceId: string, date: Date = new Date(), employeeId?: string) {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const end = endOfWeek(date, { weekStartsOn: 1 });

  return generateTimesheetReport({
    workspaceId,
    startDate: start,
    endDate: end,
    employeeId,
  });
}

export async function getMonthlyReport(workspaceId: string, date: Date = new Date(), employeeId?: string) {
  const start = startOfMonth(date);
  const end = endOfMonth(date);

  return generateTimesheetReport({
    workspaceId,
    startDate: start,
    endDate: end,
    employeeId,
  });
}

export async function getComplianceReport(workspaceId: string, startDate: Date, endDate: Date): Promise<{
  violations: Array<{
    employeeId: string;
    employeeName: string;
    date: string;
    type: 'overtime' | 'missing_break' | 'short_break' | 'extended_shift';
    details: string;
  }>;
  summary: {
    totalViolations: number;
    byType: Record<string, number>;
    byEmployee: Record<string, number>;
  };
}> {
  const { entries } = await generateTimesheetReport({ workspaceId, startDate, endDate });

  const violations: Array<{
    employeeId: string;
    employeeName: string;
    date: string;
    type: 'overtime' | 'missing_break' | 'short_break' | 'extended_shift';
    details: string;
  }> = [];

  // Use the module-level constants defined at the top of this file

  for (const entry of entries) {
    if (entry.totalHours > OVERTIME_THRESHOLD_HOURS) {
      violations.push({
        employeeId: entry.employeeId,
        employeeName: entry.employeeName,
        date: entry.date,
        type: 'overtime',
        details: `Worked ${entry.totalHours.toFixed(1)} hours (${entry.overtimeHours.toFixed(1)} OT)`,
      });
    }

    if (entry.totalHours >= MIN_BREAK_HOURS && entry.breakMinutes === 0) {
      violations.push({
        employeeId: entry.employeeId,
        employeeName: entry.employeeName,
        date: entry.date,
        type: 'missing_break',
        details: `No break recorded for ${entry.totalHours.toFixed(1)} hour shift`,
      });
    }

    if (entry.totalHours >= MIN_BREAK_HOURS && entry.breakMinutes > 0 && entry.breakMinutes < MIN_BREAK_DURATION) {
      violations.push({
        employeeId: entry.employeeId,
        employeeName: entry.employeeName,
        date: entry.date,
        type: 'short_break',
        details: `Only ${entry.breakMinutes} min break for ${entry.totalHours.toFixed(1)} hour shift`,
      });
    }

    if (entry.totalHours > MAX_SHIFT_HOURS) {
      violations.push({
        employeeId: entry.employeeId,
        employeeName: entry.employeeName,
        date: entry.date,
        type: 'extended_shift',
        details: `Shift exceeded ${MAX_SHIFT_HOURS} hours (${entry.totalHours.toFixed(1)} hrs)`,
      });
    }
  }

  const byType: Record<string, number> = {};
  const byEmployee: Record<string, number> = {};

  for (const v of violations) {
    byType[v.type] = (byType[v.type] || 0) + 1;
    byEmployee[v.employeeId] = (byEmployee[v.employeeId] || 0) + 1;
  }

  return {
    violations,
    summary: {
      totalViolations: violations.length,
      byType,
      byEmployee,
    },
  };
}
