/**
 * PHASE 2 RC4 — Financial Calculator
 *
 * THE ONLY PERMITTED LOCATION for financial arithmetic in CoAIleague.
 * Uses decimal.js for precision — JavaScript's native Number cannot represent
 * most decimal fractions precisely (0.1 + 0.2 = 0.30000000000000004).
 *
 * Contract:
 *   - All inputs and outputs are STRINGS (never plain numbers)
 *   - Intermediate values carry FOUR decimal places (.toFixed(4))
 *   - formatCurrency() produces TWO decimal places at the DISPLAY BOUNDARY ONLY
 *   - Native JavaScript arithmetic on financial values is permanently retired
 *
 * Architecture Canon (replit.md):
 *   FinancialCalculator is the only permitted location for financial arithmetic.
 *   Native arithmetic on financial values is permanently retired.
 *   Four decimal places in storage. Two decimal places at display boundary
 *   via formatCurrency() only.
 */

import { Decimal } from 'decimal.js';

// Configure Decimal.js for financial precision
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -9,
  toExpPos: 21,
});

// ─── Core Payroll ─────────────────────────────────────────────────────────────

export function calculateGrossPay(
  hours: string,
  rate: string,
  payType: 'hourly' | 'salary' | 'contract' | string,
): string {
  if (payType === 'salary') return new Decimal(rate).toFixed(4);
  return new Decimal(hours).mul(new Decimal(rate)).toFixed(4);
}

export function calculateOvertimePay(
  overtimeHours: string,
  rate: string,
  multiplier: string = '1.5',
): string {
  return new Decimal(overtimeHours)
    .mul(new Decimal(rate))
    .mul(new Decimal(multiplier))
    .toFixed(4);
}

export function calculateRegularPay(
  regularHours: string,
  rate: string,
): string {
  return new Decimal(regularHours).mul(new Decimal(rate)).toFixed(4);
}

// ─── Deductions & Net Pay ────────────────────────────────────────────────────

export function applyDeduction(gross: string, deductionAmount: string): string {
  return new Decimal(gross).minus(new Decimal(deductionAmount)).toFixed(4);
}

export function calculateNetPay(gross: string, deductions: string[]): string {
  const totalDeductions = deductions.reduce(
    (sum, d) => sum.plus(new Decimal(d)),
    new Decimal(0),
  );
  return new Decimal(gross).minus(totalDeductions).toFixed(4);
}

export function calculateTotalDeductions(deductions: string[]): string {
  return deductions
    .reduce((sum, d) => sum.plus(new Decimal(d)), new Decimal(0))
    .toFixed(4);
}

// ─── Invoice & Billing ───────────────────────────────────────────────────────

export function calculateInvoiceLineItem(
  hours: string,
  clientRate: string,
): string {
  return new Decimal(hours).mul(new Decimal(clientRate)).toFixed(4);
}

export function calculateInvoiceTotal(lineItems: string[]): string {
  return lineItems
    .reduce((sum, item) => sum.plus(new Decimal(item)), new Decimal(0))
    .toFixed(4);
}

export function applyTax(amount: string, taxRate: string): string {
  return new Decimal(amount)
    .mul(new Decimal(taxRate).div(100))
    .toFixed(4);
}

export function applyDiscount(amount: string, discountPercent: string): string {
  const discount = new Decimal(amount)
    .mul(new Decimal(discountPercent).div(100));
  return new Decimal(amount).minus(discount).toFixed(4);
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

export function sumFinancialValues(values: string[]): string {
  return values
    .reduce((sum, v) => sum.plus(new Decimal(v)), new Decimal(0))
    .toFixed(4);
}

export function addFinancialValues(a: string, b: string): string {
  return new Decimal(a).plus(new Decimal(b)).toFixed(4);
}

export function subtractFinancialValues(a: string, b: string): string {
  return new Decimal(a).minus(new Decimal(b)).toFixed(4);
}

export function multiplyFinancialValues(a: string, b: string): string {
  return new Decimal(a).mul(new Decimal(b)).toFixed(4);
}

export function divideFinancialValues(a: string, b: string): string {
  if (new Decimal(b).isZero()) {
    throw new Error('FinancialCalculator: division by zero');
  }
  return new Decimal(a).div(new Decimal(b)).toFixed(4);
}

// ─── Display Boundary ─────────────────────────────────────────────────────────

/**
 * FORMAT ONLY — call only at the display boundary, never for storage or arithmetic.
 * Converts a 4-decimal-place financial string to a human-readable 2-decimal string.
 */
export function formatCurrency(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '0.00';
  return new Decimal(String(amount))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN)
    .toFixed(2);
}

// ─── Validation Helpers ───────────────────────────────────────────────────────

export function isValidFinancialString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const d = new Decimal(value);
    return !d.isNaN() && d.isFinite();
  } catch {
    return false;
  }
}

export function toFinancialString(value: string | number): string {
  return new Decimal(String(value)).toFixed(4);
}

// ─── Test Verification (Phase 2 RC4) ─────────────────────────────────────────
// calculateGrossPay('40', '15.75', 'hourly') === '630.0000'
// sumFinancialValues(['630.0000', '118.1250']) === '748.1250'
// formatCurrency('748.1250') === '748.13'
// calculateInvoiceTotal(['100.0000', '200.0000', '150.0000']) === '450.0000'
