import { z } from 'zod';

const decimalStr = z.string().regex(/^\d+(\.\d+)?$/, 'must be a numeric string').nullable();
const decimalStrNotNull = z.string().regex(/^\d+(\.\d+)?$/, 'must be a numeric string');
const isoDate = z.string().nullable();
const isoDateNotNull = z.string();

export const PayrollRunResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  periodStart: isoDateNotNull,
  periodEnd: isoDateNotNull,
  status: z.string(),
  totalGrossPay: decimalStr,
  totalTaxes: decimalStr,
  totalNetPay: decimalStr,
  processedBy: z.string().nullable(),
  processedAt: isoDate,
  paymentSchedule: z.string().nullable(),
  runType: z.string().nullable(),
  isOffCycle: z.boolean().nullable(),
  offCycleRequestedBy: z.string().nullable(),
  approvedBy: z.string().nullable(),
  approvedAt: isoDate,
  disbursementStatus: z.string().nullable(),
  disbursementDate: isoDate,
  disbursedAt: isoDate,
  workerTypeBreakdown: z.any().nullable(),
  createdAt: isoDateNotNull,
  updatedAt: isoDateNotNull,
  exportData: z.any().nullable(),
  providerData: z.any().nullable(),
}).passthrough();

export const PayrollRunListResponse = z.array(PayrollRunResponse);

export const PayrollEntryResponse = z.object({
  id: z.string(),
  payrollRunId: z.string(),
  employeeId: z.string(),
  workspaceId: z.string(),
  regularHours: decimalStr,
  overtimeHours: decimalStr,
  holidayHours: decimalStr,
  hourlyRate: decimalStrNotNull,
  grossPay: decimalStr,
  federalTax: decimalStr,
  stateTax: decimalStr,
  socialSecurity: decimalStr,
  netPay: decimalStr,
  status: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: isoDateNotNull,
  updatedAt: isoDateNotNull,
}).passthrough();

export const PayrollRunDetailResponse = PayrollRunResponse.extend({
  entries: z.array(PayrollEntryResponse),
});

export type TPayrollRunResponse = z.infer<typeof PayrollRunResponse>;
export type TPayrollRunListResponse = z.infer<typeof PayrollRunListResponse>;
export type TPayrollEntryResponse = z.infer<typeof PayrollEntryResponse>;
export type TPayrollRunDetailResponse = z.infer<typeof PayrollRunDetailResponse>;
