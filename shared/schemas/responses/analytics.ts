import { z } from 'zod';

const isoDate = z.string().nullable();
const decimalStr = z.union([z.string(), z.number()]).nullable();

export const BillableHoursReportResponse = z.object({
  totalHours: decimalStr,
  totalBillableAmount: decimalStr,
  entries: z.array(z.object({
    employeeId: z.string().nullable(),
    employeeName: z.string().nullable(),
    hours: decimalStr,
    billableAmount: decimalStr,
    date: isoDate,
  }).passthrough()).optional(),
  summary: z.any().optional(),
}).passthrough();

export const PayrollReportResponse = z.object({
  totalGrossPay: decimalStr,
  totalNetPay: decimalStr,
  totalTaxes: decimalStr,
  employeeCount: z.number().nullable(),
  entries: z.array(z.object({
    employeeId: z.string().nullable(),
    employeeName: z.string().nullable(),
    grossPay: decimalStr,
    netPay: decimalStr,
  }).passthrough()).optional(),
  summary: z.any().optional(),
}).passthrough();

export const ClientSummaryReportResponse = z.object({
  clients: z.array(z.object({
    clientId: z.string().nullable(),
    clientName: z.string().nullable(),
    totalBilled: decimalStr,
    hoursWorked: decimalStr,
  }).passthrough()).optional(),
  totalBilled: decimalStr,
  summary: z.any().optional(),
}).passthrough();

export const EmployeeActivityReportResponse = z.object({
  employees: z.array(z.object({
    employeeId: z.string().nullable(),
    employeeName: z.string().nullable(),
    shiftsWorked: z.number().nullable(),
    hoursWorked: decimalStr,
  }).passthrough()).optional(),
  summary: z.any().optional(),
}).passthrough();

export const AuditLogReportResponse = z.object({
  logs: z.array(z.object({
    id: z.string().nullable(),
    action: z.string().nullable(),
    userId: z.string().nullable(),
    createdAt: isoDate,
  }).passthrough()).optional(),
  total: z.number().optional(),
  summary: z.any().optional(),
}).passthrough();

export type TBillableHoursReportResponse = z.infer<typeof BillableHoursReportResponse>;
export type TPayrollReportResponse = z.infer<typeof PayrollReportResponse>;
