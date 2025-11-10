/**
 * ReportService - Centralized reporting and analytics for AutoForce™
 * 
 * Provides role-scoped, tier-aware reporting across all OS modules:
 * - BillOS™: Billable hours, invoices, client summaries
 * - PayrollOS™: Payroll hours, employee earnings
 * - AuditOS™: Audit logs, compliance trails
 * - OperationsOS™: Employee activity, shift attendance
 */

import { db } from "../db";
import { 
  timeEntries, 
  invoices, 
  invoiceLineItems,
  clients,
  employees,
  users,
  auditLogs,
  payrollRuns,
  shifts,
} from "@shared/schema";
import { eq, and, gte, lte, desc, asc } from "drizzle-orm";

export interface ReportFilters {
  workspaceId: string;
  startDate?: Date;
  endDate?: Date;
  clientId?: string;
  employeeId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface ReportExportOptions {
  format: 'json' | 'csv' | 'pdf';
  filename?: string;
}

interface BillableEntrySummary {
  employeeId: string;
  employeeName: string;
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
  totalBillable: number;
  entries: Array<{
    id: string;
    date: Date;
    clientName: string;
    hours: number;
    rate: number;
    billable: number;
    overtime: boolean;
  }>;
}

interface PayrollSummary {
  employeeId: string;
  employeeName: string;
  hourlyRate: number;
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  grossPay: number;
}

interface ClientSummary {
  clientId: string;
  clientName: string;
  contactEmail: string | null;
  totalInvoices: number;
  totalAmount: number;
  totalPaid: number;
  totalOutstanding: number;
  invoices: Array<{
    id: string;
    number: string;
    date: Date | null;
    amount: number;
    status: string | null;
  }>;
}

interface ActivitySummary {
  employeeId: string;
  employeeName: string;
  totalShifts: number;
  totalHours: number;
  approvedShifts: number;
  pendingShifts: number;
  rejectedShifts: number;
  hasGPSVerification: number;
}

/**
 * Billable Hours Report
 * Shows approved billable time entries grouped by client/employee
 * RBAC: view_reports capability
 * Tier: starter+
 */
export async function getBillableHoursReport(filters: ReportFilters) {
  const conditions = [
    eq(timeEntries.workspaceId, filters.workspaceId),
    eq(timeEntries.status, 'approved'),
  ];

  if (filters.startDate) {
    conditions.push(gte(timeEntries.clockIn, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(timeEntries.clockIn, filters.endDate));
  }
  if (filters.clientId) {
    conditions.push(eq(timeEntries.clientId, filters.clientId));
  }
  if (filters.employeeId) {
    conditions.push(eq(timeEntries.employeeId, filters.employeeId));
  }

  const entries = await db.query.timeEntries.findMany({
    where: and(...conditions),
    with: {
      employee: {
        with: {
          user: {
            columns: {
              firstName: true,
              lastName: true,
            },
          },
        },
      },
      client: {
        columns: {
          companyName: true,
        },
      },
    },
    orderBy: [desc(timeEntries.clockIn)],
    limit: filters.limit || 1000,
    offset: filters.offset || 0,
  });

  // Group by employee and calculate totals
  const grouped = entries.reduce((acc: Record<string, BillableEntrySummary>, entry: any) => {
    const key = entry.employeeId;
    if (!acc[key]) {
      acc[key] = {
        employeeId: entry.employeeId,
        employeeName: `${entry.employee?.user?.firstName || ''} ${entry.employee?.user?.lastName || ''}`.trim(),
        regularHours: 0,
        overtimeHours: 0,
        totalHours: 0,
        totalBillable: 0,
        entries: [],
      };
    }

    const hours = parseFloat(String(entry.totalHours || 0));
    const rate = parseFloat(String(entry.hourlyRate || 0));
    const billable = hours * rate;

    // Detect overtime by comparing entry rate to employee base rate
    const baseRate = parseFloat(String(entry.employee?.hourlyRate || 0));
    const isOvertime = baseRate > 0 && rate > baseRate * 1.3;

    if (isOvertime) {
      acc[key].overtimeHours += hours;
    } else {
      acc[key].regularHours += hours;
    }

    acc[key].totalHours += hours;
    acc[key].totalBillable += billable;
    acc[key].entries.push({
      id: entry.id,
      date: entry.clockIn,
      clientName: entry.client?.companyName || 'Unknown',
      hours,
      rate,
      billable,
      overtime: isOvertime,
    });

    return acc;
  }, {});

  return {
    summary: Object.values(grouped),
    totalEntries: entries.length,
    filters,
  };
}

/**
 * Payroll Report
 * Shows approved payroll hours and earnings by employee
 * RBAC: view_payroll capability
 * Tier: professional+
 */
export async function getPayrollReport(filters: ReportFilters) {
  const conditions = [
    eq(timeEntries.workspaceId, filters.workspaceId),
    eq(timeEntries.status, 'approved'),
  ];

  if (filters.startDate) {
    conditions.push(gte(timeEntries.clockIn, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(timeEntries.clockIn, filters.endDate));
  }
  if (filters.employeeId) {
    conditions.push(eq(timeEntries.employeeId, filters.employeeId));
  }

  const entries = await db.query.timeEntries.findMany({
    where: and(...conditions),
    with: {
      employee: {
        with: {
          user: {
            columns: {
              firstName: true,
              lastName: true,
            },
          },
        },
        columns: {
          hourlyRate: true,
        },
      },
    },
    orderBy: [asc(timeEntries.employeeId), desc(timeEntries.clockIn)],
    limit: filters.limit || 1000,
    offset: filters.offset || 0,
  });

  // Group by employee and calculate earnings
  const grouped = entries.reduce((acc: Record<string, PayrollSummary>, entry: any) => {
    const key = entry.employeeId;
    if (!acc[key]) {
      acc[key] = {
        employeeId: entry.employeeId,
        employeeName: `${entry.employee?.user?.firstName || ''} ${entry.employee?.user?.lastName || ''}`.trim(),
        hourlyRate: parseFloat(String(entry.employee?.hourlyRate || 0)),
        regularHours: 0,
        overtimeHours: 0,
        regularPay: 0,
        overtimePay: 0,
        grossPay: 0,
      };
    }

    const hours = parseFloat(String(entry.totalHours || 0));
    const baseRate = parseFloat(String(entry.employee?.hourlyRate || 0));
    const otRate = baseRate * 1.5; // Standard OT rate is 1.5x base
    const entryRate = parseFloat(String(entry.hourlyRate || baseRate));

    // Detect overtime based on rate comparison
    const isOvertime = baseRate > 0 && entryRate > baseRate * 1.3;

    if (isOvertime) {
      acc[key].overtimeHours += hours;
      acc[key].overtimePay += hours * otRate;
    } else {
      acc[key].regularHours += hours;
      acc[key].regularPay += hours * baseRate;
    }

    acc[key].grossPay = acc[key].regularPay + acc[key].overtimePay;

    return acc;
  }, {});

  return {
    summary: Object.values(grouped),
    totalEntries: entries.length,
    filters,
  };
}

/**
 * Client Summary Report
 * Shows invoice totals by client
 * RBAC: view_invoices capability
 * Tier: starter+
 */
export async function getClientSummaryReport(filters: ReportFilters) {
  const invoiceConditions = [
    eq(invoices.workspaceId, filters.workspaceId),
  ];

  if (filters.startDate) {
    invoiceConditions.push(gte(invoices.issueDate, filters.startDate));
  }
  if (filters.endDate) {
    invoiceConditions.push(lte(invoices.issueDate, filters.endDate));
  }
  if (filters.clientId) {
    invoiceConditions.push(eq(invoices.clientId, filters.clientId));
  }

  const invoiceData = await db.query.invoices.findMany({
    where: and(...invoiceConditions),
    with: {
      client: {
        columns: {
          companyName: true,
          email: true,
        },
      },
      lineItems: true,
    },
    orderBy: [desc(invoices.createdAt)],
    limit: filters.limit || 100,
    offset: filters.offset || 0,
  });

  // Group by client
  const grouped = invoiceData.reduce((acc: Record<string, ClientSummary>, invoice: any) => {
    const key = invoice.clientId;
    if (!acc[key]) {
      acc[key] = {
        clientId: invoice.clientId,
        clientName: invoice.client?.companyName || 'Unknown',
        contactEmail: invoice.client?.email || null,
        totalInvoices: 0,
        totalAmount: 0,
        totalPaid: 0,
        totalOutstanding: 0,
        invoices: [],
      };
    }

    const amount = parseFloat(String(invoice.total || 0));
    const amountPaid = parseFloat(String(invoice.total || 0)); // TODO: Add amountPaid field to schema

    acc[key].totalInvoices += 1;
    acc[key].totalAmount += amount;
    acc[key].totalPaid += (invoice.status === 'paid' ? amount : 0);
    acc[key].totalOutstanding += (invoice.status !== 'paid' ? amount : 0);
    acc[key].invoices.push({
      id: invoice.id,
      number: invoice.invoiceNumber,
      date: invoice.issueDate,
      amount,
      status: invoice.status,
    });

    return acc;
  }, {});

  return {
    summary: Object.values(grouped),
    totalClients: Object.keys(grouped).length,
    filters,
  };
}

/**
 * Employee Activity Report
 * Shows shift attendance and time entry patterns
 * RBAC: approve_timesheets capability
 * Tier: starter+
 */
export async function getEmployeeActivityReport(filters: ReportFilters) {
  const conditions = [
    eq(timeEntries.workspaceId, filters.workspaceId),
  ];

  if (filters.startDate) {
    conditions.push(gte(timeEntries.clockIn, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(timeEntries.clockIn, filters.endDate));
  }
  if (filters.employeeId) {
    conditions.push(eq(timeEntries.employeeId, filters.employeeId));
  }

  const entries = await db.query.timeEntries.findMany({
    where: and(...conditions),
    with: {
      employee: {
        with: {
          user: {
            columns: {
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
    orderBy: [asc(timeEntries.employeeId), desc(timeEntries.clockIn)],
    limit: filters.limit || 1000,
    offset: filters.offset || 0,
  });

  // Group by employee and calculate metrics
  const grouped = entries.reduce((acc: Record<string, ActivitySummary>, entry: any) => {
    const key = entry.employeeId;
    if (!acc[key]) {
      acc[key] = {
        employeeId: entry.employeeId,
        employeeName: `${entry.employee?.user?.firstName || ''} ${entry.employee?.user?.lastName || ''}`.trim(),
        totalShifts: 0,
        totalHours: 0,
        approvedShifts: 0,
        pendingShifts: 0,
        rejectedShifts: 0,
        hasGPSVerification: 0,
      };
    }

    acc[key].totalShifts += 1;
    acc[key].totalHours += parseFloat(String(entry.totalHours || 0));

    if (entry.status === 'approved') acc[key].approvedShifts += 1;
    if (entry.status === 'pending') acc[key].pendingShifts += 1;
    if (entry.status === 'rejected') acc[key].rejectedShifts += 1;

    if (entry.clockInLatitude && entry.clockInLongitude) {
      acc[key].hasGPSVerification += 1;
    }

    return acc;
  }, {});

  return {
    summary: Object.values(grouped),
    totalEmployees: Object.keys(grouped).length,
    filters,
  };
}

/**
 * Audit Logs Report
 * Shows compliance audit trail filtered by action, user, or date range
 * RBAC: view_audit_logs capability
 * Tier: professional+
 */
export async function getAuditLogsReport(filters: ReportFilters & { action?: string }) {
  const conditions = [
    eq(auditLogs.workspaceId, filters.workspaceId),
  ];

  if (filters.startDate) {
    conditions.push(gte(auditLogs.createdAt, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(auditLogs.createdAt, filters.endDate));
  }
  if (filters.action) {
    conditions.push(eq(auditLogs.action, filters.action as any));
  }

  const logs = await db.query.auditLogs.findMany({
    where: and(...conditions),
    with: {
      user: {
        columns: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
    orderBy: [desc(auditLogs.createdAt)],
    limit: filters.limit || 500,
    offset: filters.offset || 0,
  });

  // Group by action type
  const actionCounts = logs.reduce((acc: Record<string, number>, log: any) => {
    acc[log.action] = (acc[log.action] || 0) + 1;
    return acc;
  }, {});

  return {
    logs: logs.map((log: any) => ({
      id: log.id,
      timestamp: log.createdAt,
      action: log.action,
      userName: `${log.user?.firstName || ''} ${log.user?.lastName || ''}`.trim() || log.user?.email || 'System',
      metadata: log.metadata,
      ipAddress: log.ipAddress,
    })),
    actionCounts,
    totalLogs: logs.length,
    filters,
  };
}
