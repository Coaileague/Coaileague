import crypto from 'crypto';
import { format } from 'date-fns';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from 'server/db';
import { employees, payrollEntries, payrollRuns } from '@shared/schema';
import { formatCurrency, sumFinancialValues } from '../financialCalculator';
import { createLogger } from '../../lib/logger';

const log = createLogger('PayrollCsvExportService');

export interface PayrollCsvExportParams {
  workspaceId: string;
  userId: string;
  ipAddress?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface PayrollCsvExportResult {
  contentType: 'text/csv';
  filename: string;
  csv: string;
  exportedRows: number;
}

function csvEscape(value: unknown): string {
  const raw = value == null ? '' : String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function formatDate(value: unknown): string {
  if (!value) return '';
  return format(new Date(value as any), 'yyyy-MM-dd');
}

async function writePayrollCsvAuditLog(params: PayrollCsvExportParams, exportedRows: number): Promise<void> {
  try {
    const { auditLogs } = await import('@shared/schema');
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      workspaceId: params.workspaceId,
      userId: params.userId,
      action: 'payroll.export.csv',
      entityType: 'payroll',
      entityId: params.workspaceId,
      details: JSON.stringify({
        exportedRows,
        dateRange: {
          startDate: params.startDate || null,
          endDate: params.endDate || null,
        },
        exportedAt: new Date().toISOString(),
      }),
      ipAddress: params.ipAddress || null,
      createdAt: new Date(),
    } as any);
  } catch (auditErr) {
    log.warn('[PayrollCsvExportService] Failed to write export audit log (non-blocking):', auditErr);
  }
}

/**
 * Build the payroll CSV export for a workspace.
 *
 * This preserves the existing payroll route behavior: export all workspace payroll
 * entries, join run period metadata, resolve employee names, and write a
 * best-effort sensitive-data audit log. `startDate` and `endDate` are currently
 * tracked in the audit payload only because the existing route did not filter by
 * those values.
 */
export async function buildPayrollCsvExport(params: PayrollCsvExportParams): Promise<PayrollCsvExportResult> {
  const { workspaceId, userId } = params;
  if (!workspaceId) throw new Error('[PayrollCsvExportService] workspaceId is required');
  if (!userId) throw new Error('[PayrollCsvExportService] userId is required');

  // Keep this query intentionally close to the legacy route's query so route
  // extraction is behavior-preserving. It warms/validates run metadata and
  // preserves the previous query side effects around DB access patterns.
  await db.select({
    id: payrollRuns.id,
    periodStart: payrollRuns.periodStart,
    periodEnd: payrollRuns.periodEnd,
    status: payrollRuns.status,
    totalGrossPay: payrollRuns.totalGrossPay,
    totalNetPay: payrollRuns.totalNetPay,
    createdAt: payrollRuns.createdAt,
  }).from(payrollRuns)
    .where(eq(payrollRuns.workspaceId, workspaceId))
    .orderBy(desc(payrollRuns.createdAt));

  const entries = await db.select({
    id: payrollEntries.id,
    employeeId: payrollEntries.employeeId,
    periodStart: payrollRuns.periodStart,
    periodEnd: payrollRuns.periodEnd,
    regularHours: payrollEntries.regularHours,
    overtimeHours: payrollEntries.overtimeHours,
    hourlyRate: payrollEntries.hourlyRate,
    grossPay: payrollEntries.grossPay,
    federalTax: payrollEntries.federalTax,
    stateTax: payrollEntries.stateTax,
    socialSecurity: payrollEntries.socialSecurity,
    medicare: payrollEntries.medicare,
    netPay: payrollEntries.netPay,
    createdAt: payrollEntries.createdAt,
  })
    .from(payrollEntries)
    .leftJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))
    .where(eq(payrollEntries.workspaceId, workspaceId));

  const employeeIds = Array.from(new Set(entries.map(entry => entry.employeeId).filter(Boolean)));
  const employeeMap = new Map<string, string>();
  if (employeeIds.length > 0) {
    const emps = await db.select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
    }).from(employees).where(and(
      eq(employees.workspaceId, workspaceId),
      inArray(employees.id, employeeIds),
    ));
    emps.forEach(emp => employeeMap.set(emp.id, `${emp.firstName} ${emp.lastName}`));
  }

  const csvHeader = 'Employee Name,Period Start,Period End,Regular Hours,Overtime Hours,Hourly Rate,Gross Pay,Deductions,Federal Tax,State Tax,Social Security,Medicare,Net Pay,Date\n';
  const csvRows = entries.map(entry => {
    const employeeName = employeeMap.get(entry.employeeId) || entry.employeeId;
    const deductions = formatCurrency(sumFinancialValues([
      entry.federalTax || '0',
      entry.stateTax || '0',
      entry.socialSecurity || '0',
      entry.medicare || '0',
    ]));

    return [
      employeeName,
      formatDate(entry.periodStart),
      formatDate(entry.periodEnd),
      entry.regularHours,
      entry.overtimeHours,
      entry.hourlyRate,
      entry.grossPay,
      deductions,
      entry.federalTax,
      entry.stateTax,
      entry.socialSecurity,
      entry.medicare,
      entry.netPay,
      formatDate(entry.createdAt),
    ].map(csvEscape).join(',');
  }).join('\n');

  await writePayrollCsvAuditLog(params, entries.length);

  return {
    contentType: 'text/csv',
    filename: `payroll-export-${format(new Date(), 'yyyy-MM-dd')}.csv`,
    csv: csvHeader + csvRows,
    exportedRows: entries.length,
  };
}
