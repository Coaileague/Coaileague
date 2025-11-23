/**
 * Export Service - Data Export & GDPR Compliance
 * Handles CSV/JSON/PDF exports for audits, compliance, and data portability
 */

import { db } from "../db";
import { 
  employees, 
  timeEntries, 
  invoices, 
  auditLogs
} from "@shared/schema";
import { eq } from "drizzle-orm";
import type { Employee, TimeEntry, Invoice, AuditLog } from "@shared/schema";

export type ExportFormat = "csv" | "json" | "pdf";
export type ExportType = "employees" | "payroll" | "audit-logs" | "time-entries" | "invoices" | "all";

interface ExportOptions {
  format: ExportFormat;
  startDate?: Date;
  endDate?: Date;
  includeDeleted?: boolean;
}

/**
 * Convert array of objects to CSV format
 */
function convertToCSV(data: any[]): string {
  if (data.length === 0) return "";

  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(","),
    ...data.map(row =>
      headers
        .map(header => {
          const value = row[header];
          // Escape quotes in values and wrap in quotes if contains comma
          if (typeof value === "string" && (value.includes(",") || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(",")
    ),
  ].join("\n");

  return csv;
}

/**
 * Export employees data
 */
export async function exportEmployees(
  workspaceId: string,
  options: ExportOptions
): Promise<{ data: string; filename: string }> {
  const employeeData = await db.query.employees.findMany({
    where: eq(employees.workspaceId, workspaceId),
  });

  const sanitized = employeeData.map(emp => ({
    id: emp.id,
    firstName: emp.firstName,
    lastName: emp.lastName,
    email: emp.email,
    phone: emp.phone,
    role: emp.role,
  }));

  let data: string;
  if (options.format === "csv") {
    data = convertToCSV(sanitized);
  } else {
    data = JSON.stringify(sanitized, null, 2);
  }

  return {
    data,
    filename: `employees-${new Date().toISOString().split("T")[0]}.${options.format}`,
  };
}

/**
 * Export payroll records from time entries
 */
export async function exportPayroll(
  workspaceId: string,
  options: ExportOptions
): Promise<{ data: string; filename: string }> {
  const entries = await db.query.timeEntries.findMany({
    where: eq(timeEntries.workspaceId, workspaceId),
  });

  const sanitized = entries.map(entry => ({
    id: entry.id,
    employeeId: entry.employeeId,
    clockIn: entry.clockIn,
    clockOut: entry.clockOut,
    totalHours: entry.totalHours,
    hourlyRate: entry.hourlyRate,
    totalAmount: entry.totalAmount,
    status: entry.status,
  }));

  let data: string;
  if (options.format === "csv") {
    data = convertToCSV(sanitized);
  } else {
    data = JSON.stringify(sanitized, null, 2);
  }

  return {
    data,
    filename: `payroll-${new Date().toISOString().split("T")[0]}.${options.format}`,
  };
}

/**
 * Export audit logs for compliance
 */
export async function exportAuditLogs(
  workspaceId: string,
  options: ExportOptions
): Promise<{ data: string; filename: string }> {
  const filters = [eq(auditLogs.workspaceId, workspaceId)];

  if (options.startDate && options.endDate) {
    // Add date filtering
  }

  const logs = await db.query.auditLogs.findMany({
    where: filters.length > 1 ? undefined : filters[0],
  });

  const sanitized = logs.map(log => ({
    id: log.id,
    createdAt: log.createdAt,
    userId: log.userId,
    action: log.action,
    actionDescription: log.actionDescription,
    entityType: log.entityType,
    entityId: log.entityId,
  }));

  let data: string;
  if (options.format === "csv") {
    data = convertToCSV(sanitized);
  } else {
    data = JSON.stringify(sanitized, null, 2);
  }

  return {
    data,
    filename: `audit-logs-${new Date().toISOString().split("T")[0]}.${options.format}`,
  };
}

/**
 * Export time entries
 */
export async function exportTimeEntries(
  workspaceId: string,
  options: ExportOptions
): Promise<{ data: string; filename: string }> {
  const filters = [eq(timeEntries.workspaceId, workspaceId)];

  if (options.startDate && options.endDate) {
    // Add date filtering
  }

  const entries = await db.query.timeEntries.findMany({
    where: filters.length > 1 ? undefined : filters[0],
  });

  const sanitized = entries.map(entry => ({
    id: entry.id,
    employeeId: entry.employeeId,
    clockIn: entry.clockIn,
    clockOut: entry.clockOut,
    totalHours: entry.totalHours,
    status: entry.status,
    approvedAt: entry.approvedAt,
  }));

  let data: string;
  if (options.format === "csv") {
    data = convertToCSV(sanitized);
  } else {
    data = JSON.stringify(sanitized, null, 2);
  }

  return {
    data,
    filename: `time-entries-${new Date().toISOString().split("T")[0]}.${options.format}`,
  };
}

/**
 * Export all workspace data (GDPR data portability)
 */
export async function exportAllData(
  workspaceId: string,
  options: ExportOptions
): Promise<{ data: string; filename: string }> {
  const [employeeExport, payrollExport, auditExport, timeExport] = await Promise.all([
    exportEmployees(workspaceId, options),
    exportPayroll(workspaceId, options),
    exportAuditLogs(workspaceId, options),
    exportTimeEntries(workspaceId, options),
  ]);

  const consolidated = {
    exportDate: new Date().toISOString(),
    workspaceId,
    employees: JSON.parse(employeeExport.data),
    payroll: JSON.parse(payrollExport.data),
    auditLogs: JSON.parse(auditExport.data),
    timeEntries: JSON.parse(timeExport.data),
  };

  let data: string;
  if (options.format === "json") {
    data = JSON.stringify(consolidated, null, 2);
  } else {
    // For CSV, we'll need to handle multiple tables (simplified version)
    data = "See JSON export for complete data with all tables";
  }

  return {
    data,
    filename: `workspace-export-${new Date().toISOString().split("T")[0]}.${options.format}`,
  };
}

/**
 * Execute GDPR "right to be forgotten" - soft delete employee data
 */
export async function anonymizeEmployeeData(
  workspaceId: string,
  employeeId: string
): Promise<{ success: boolean; anonymizedRecords: number }> {
  // Soft delete by clearing PII, keep records for audit trail
  const result = await db
    .update(employees)
    .set({
      firstName: "DELETED",
      lastName: "DELETED",
      email: `deleted-${Date.now()}@deleted.invalid`,
      phone: null,
    })
    .where(eq(employees.id, employeeId));

  return {
    success: true,
    anonymizedRecords: result.rowCount || 0,
  };
}

/**
 * Get export audit trail
 */
export async function logExport(
  workspaceId: string,
  userId: string,
  exportType: ExportType,
  format: ExportFormat
): Promise<void> {
  // Log in audit trail for compliance
  console.log(
    `[EXPORT AUDIT] ${new Date().toISOString()} - User ${userId} exported ${exportType} (${format}) from workspace ${workspaceId}`
  );

  // In production, would log to audit_logs table
}
