import {
  addFinancialValues,
  formatCurrency,
  multiplyFinancialValues,
  toFinancialString,
} from '../financialCalculator';

export interface PayrollEstimateInput {
  totalMinutes: number;
  hourlyRate: number;
  overtimeThresholdHours?: number;
  overtimeMultiplier?: number;
  ficaEmployerRate?: number;
  futaRate?: number;
  futaWageBase?: number;
}

export interface PayrollEstimateResult {
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  grossPay: number;
  ficaEmployerShare: number;
  futaContribution: number;
  totalCostToOrg: number;
}

function moneyNumber(value: string | number): number {
  return Number(formatCurrency(toFinancialString(value)));
}

function multiplyMoney(a: string | number, b: string | number): number {
  return moneyNumber(multiplyFinancialValues(toFinancialString(a), toFinancialString(b)));
}

function addMoney(...values: Array<string | number>): number {
  return moneyNumber(values.reduce(
    (total, value) => addFinancialValues(toFinancialString(total), toFinancialString(value)),
    toFinancialString(0),
  ));
}

function roundHours(hours: number): number {
  return Math.round(hours * 100) / 100;
}

/**
 * Canonical payroll estimate math helper.
 *
 * This helper centralizes Trinity/preview payroll estimate calculations so
 * action handlers do not carry their own raw gross-pay, FICA, FUTA, and
 * overtime formulas. It intentionally returns numbers to preserve existing
 * action/API response shapes while routing money math through FinancialCalculator.
 *
 * This is an estimate helper only. Final payroll tax calculation should still
 * use the canonical payroll tax service and approved payroll finalization path.
 */
export function calculatePayrollEstimate(input: PayrollEstimateInput): PayrollEstimateResult {
  const totalHours = roundHours(input.totalMinutes / 60);
  const overtimeThresholdHours = input.overtimeThresholdHours ?? 40;
  const overtimeMultiplier = input.overtimeMultiplier ?? 1.5;
  const ficaEmployerRate = input.ficaEmployerRate ?? 0.0765;
  const futaRate = input.futaRate ?? 0.006;
  const futaWageBase = input.futaWageBase ?? 7000;

  const regularHours = roundHours(Math.min(totalHours, overtimeThresholdHours));
  const overtimeHours = roundHours(Math.max(0, totalHours - overtimeThresholdHours));
  const regularPay = multiplyMoney(regularHours, input.hourlyRate);
  const overtimeRate = multiplyMoney(input.hourlyRate, overtimeMultiplier);
  const overtimePay = multiplyMoney(overtimeHours, overtimeRate);
  const grossPay = addMoney(regularPay, overtimePay);
  const ficaEmployerShare = multiplyMoney(grossPay, ficaEmployerRate);
  const futaContribution = multiplyMoney(Math.min(grossPay, futaWageBase), futaRate);
  const totalCostToOrg = addMoney(grossPay, ficaEmployerShare, futaContribution);

  return {
    totalHours,
    regularHours,
    overtimeHours,
    regularPay,
    overtimePay,
    grossPay,
    ficaEmployerShare,
    futaContribution,
    totalCostToOrg,
  };
}
