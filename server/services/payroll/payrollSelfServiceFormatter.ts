import { formatCurrency, sumFinancialValues } from '../financialCalculator';

export interface PayrollSelfServicePaycheckInput {
  id: string;
  payrollRunId?: string | null;
  employeeId: string;
  employeeName?: string | null;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
  regularHours?: string | number | null;
  overtimeHours?: string | number | null;
  hourlyRate?: string | number | null;
  grossPay?: string | number | null;
  federalTax?: string | number | null;
  stateTax?: string | number | null;
  socialSecurity?: string | number | null;
  medicare?: string | number | null;
  netPay?: string | number | null;
  createdAt?: Date | string | null;
}

export interface PayrollSelfServicePaycheck {
  id: string;
  payrollRunId: string | null;
  employeeId: string;
  employeeName: string;
  periodStart: string | null;
  periodEnd: string | null;
  regularHours: string;
  overtimeHours: string;
  hourlyRate: string;
  grossPay: string;
  federalTax: string;
  stateTax: string;
  socialSecurity: string;
  medicare: string;
  deductions: string;
  netPay: string;
  createdAt: string | null;
}

export interface PayrollSelfServiceInfoInput {
  directDepositEnabled?: boolean | null;
  bankAccountType?: string | null;
  preferredPayoutMethod?: string | null;
  bankRoutingNumberEncrypted?: string | null;
  bankAccountNumberEncrypted?: string | null;
  hasRoutingNumber?: boolean | null;
  hasAccountNumber?: boolean | null;
}

export interface PayrollSelfServiceInfo {
  directDepositEnabled: boolean;
  bankAccountType?: string;
  preferredPayoutMethod?: string;
  hasRoutingNumber: boolean;
  hasAccountNumber: boolean;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function moneyString(value: string | number | null | undefined): string {
  return formatCurrency(String(value ?? '0'));
}

function decimalString(value: string | number | null | undefined): string {
  return String(value ?? '0');
}

/**
 * Format an employee-facing paycheck response for `/api/payroll/my-paychecks`.
 *
 * Keeps the frontend response shape stable while centralizing FC-backed deduction
 * formatting and date normalization outside the giant payroll route file.
 */
export function formatPayrollSelfServicePaycheck(input: PayrollSelfServicePaycheckInput): PayrollSelfServicePaycheck {
  const federalTax = moneyString(input.federalTax);
  const stateTax = moneyString(input.stateTax);
  const socialSecurity = moneyString(input.socialSecurity);
  const medicare = moneyString(input.medicare);
  const deductions = formatCurrency(sumFinancialValues([federalTax, stateTax, socialSecurity, medicare]));

  return {
    id: input.id,
    payrollRunId: input.payrollRunId ?? null,
    employeeId: input.employeeId,
    employeeName: input.employeeName || input.employeeId,
    periodStart: toIso(input.periodStart),
    periodEnd: toIso(input.periodEnd),
    regularHours: decimalString(input.regularHours),
    overtimeHours: decimalString(input.overtimeHours),
    hourlyRate: moneyString(input.hourlyRate),
    grossPay: moneyString(input.grossPay),
    federalTax,
    stateTax,
    socialSecurity,
    medicare,
    deductions,
    netPay: moneyString(input.netPay),
    createdAt: toIso(input.createdAt),
  };
}

/**
 * Format employee-facing direct-deposit/payroll settings without exposing
 * encrypted bank values to the client.
 */
export function formatPayrollSelfServiceInfo(input: PayrollSelfServiceInfoInput | null | undefined): PayrollSelfServiceInfo {
  return {
    directDepositEnabled: Boolean(input?.directDepositEnabled),
    ...(input?.bankAccountType ? { bankAccountType: input.bankAccountType } : {}),
    ...(input?.preferredPayoutMethod ? { preferredPayoutMethod: input.preferredPayoutMethod } : {}),
    hasRoutingNumber: Boolean(input?.hasRoutingNumber ?? input?.bankRoutingNumberEncrypted),
    hasAccountNumber: Boolean(input?.hasAccountNumber ?? input?.bankAccountNumberEncrypted),
  };
}
