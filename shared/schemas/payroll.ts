import { z } from 'zod';

export const payrollDeductionSchema = z.object({
  employeeId: z.string().min(1, 'employeeId is required'),
  deductionType: z.string().min(1, 'deductionType is required'),
  amount: z.union([z.string(), z.number()]).refine(
    (v) => !isNaN(Number(v)) && Number(v) > 0,
    { message: 'amount must be a positive number' }
  ),
  isPreTax: z.boolean().optional().default(true),
  description: z.string().optional(),
});
export type PayrollDeductionInput = z.infer<typeof payrollDeductionSchema>;

export const payrollGarnishmentSchema = z.object({
  employeeId: z.string().min(1, 'employeeId is required'),
  garnishmentType: z.string().min(1, 'garnishmentType is required'),
  amount: z.union([z.string(), z.number()]).refine(
    (v) => !isNaN(Number(v)) && Number(v) > 0,
    { message: 'amount must be a positive number' }
  ),
  priority: z.number().int().min(1).optional().default(1),
  caseNumber: z.string().optional(),
  description: z.string().optional(),
});
export type PayrollGarnishmentInput = z.infer<typeof payrollGarnishmentSchema>;

export const payrollInfoUpdateSchema = z.object({
  bankAccountType: z.enum(['checking', 'savings']).optional(),
  bankRoutingNumber: z.string().regex(/^\d{9}$/, 'bankRoutingNumber must be exactly 9 digits').optional(),
  bankAccountNumber: z.string().min(4).max(17).optional(),
  directDepositEnabled: z.boolean().optional(),
  preferredPayoutMethod: z.string().optional(),
});
export type PayrollInfoUpdateInput = z.infer<typeof payrollInfoUpdateSchema>;

export const payrollVoidSchema = z.object({
  reason: z.string().min(5, 'A reason of at least 5 characters is required to void a payroll run').max(500),
});
export type PayrollVoidInput = z.infer<typeof payrollVoidSchema>;

export const payrollMarkPaidSchema = z.object({
  disbursementMethod: z.string().optional().default('ach'),
  notes: z.string().optional(),
});
export type PayrollMarkPaidInput = z.infer<typeof payrollMarkPaidSchema>;

export const payrollAmendSchema = z.object({
  regularHours: z.union([z.string(), z.number()]).optional(),
  overtimeHours: z.union([z.string(), z.number()]).optional(),
  hourlyRate: z.union([z.string(), z.number()]).optional(),
  grossPay: z.union([z.string(), z.number()]).optional(),
  federalTax: z.union([z.string(), z.number()]).optional(),
  stateTax: z.union([z.string(), z.number()]).optional(),
  socialSecurity: z.union([z.string(), z.number()]).optional(),
  medicare: z.union([z.string(), z.number()]).optional(),
  netPay: z.union([z.string(), z.number()]).refine(
    (v) => v === undefined || (!isNaN(Number(v)) && Number(v) >= 0),
    { message: 'netPay cannot be negative' }
  ).optional(),
  reason: z.string().min(1, 'reason is required to amend a payroll entry').max(500),
});
export type PayrollAmendInput = z.infer<typeof payrollAmendSchema>;

export const employeeBankAccountSchema = z.object({
  bankName: z.string().optional(),
  routingNumber: z.string().regex(/^\d{9}$/, 'routingNumber must be exactly 9 digits'),
  accountNumber: z.string().min(4).max(17),
  accountType: z.enum(['checking', 'savings']).optional().default('checking'),
  depositType: z.enum(['full', 'amount', 'percent']).optional().default('full'),
  depositAmount: z.union([z.string(), z.number()]).optional(),
  depositPercent: z.union([z.string(), z.number()]).optional(),
  isPrimary: z.boolean().optional().default(true),
  notes: z.string().optional(),
});
export type EmployeeBankAccountInput = z.infer<typeof employeeBankAccountSchema>;

export const employeeBankAccountUpdateSchema = employeeBankAccountSchema.partial().omit({ routingNumber: true, accountNumber: true }).extend({
  routingNumber: z.string().regex(/^\d{9}$/, 'routingNumber must be exactly 9 digits').optional(),
  accountNumber: z.string().min(4).max(17).optional(),
});
export type EmployeeBankAccountUpdateInput = z.infer<typeof employeeBankAccountUpdateSchema>;
