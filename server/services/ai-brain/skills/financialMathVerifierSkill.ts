import { BaseSkill } from './base-skill';
import type { SkillManifest, SkillContext, SkillResult } from './types';

import { createLogger } from '../../../lib/logger';
import { PLATFORM } from '../../../config/platformConfig';
const log = createLogger('financialMathVerifierSkill');

interface MathVerificationParams {
  operationType: 'payroll' | 'invoice' | 'credit' | 'tax' | 'billing' | 'general';
  inputs: Record<string, number>;
  expectedOutput?: number;
  aiProposedOutput?: number;
  formula?: string;
  context?: {
    employeeCount?: number;
    hoursWorked?: number;
    payRate?: number;
    taxRate?: number;
    creditBalance?: number;
    invoiceItems?: Array<{ description: string; quantity: number; unitPrice: number }>;
  };
}

interface VerificationStep {
  step: number;
  operation: string;
  input: string;
  result: number;
  verified: boolean;
  note?: string;
}

interface MathVerificationResult {
  verified: boolean;
  deterministicResult: number;
  aiProposedResult?: number;
  discrepancy?: number;
  discrepancyPercent?: number;
  steps: VerificationStep[];
  warnings: string[];
  currencyPrecisionCheck: boolean;
  overflowCheck: boolean;
  negativeValueCheck: boolean;
  roundingMethod: string;
}

class FinancialMathVerifierSkill extends BaseSkill {
  private static readonly MAX_SAFE_CENTS = 999_999_999_99;
  private static readonly ROUNDING_TOLERANCE_CENTS = 1;

  getManifest(): SkillManifest {
    return {
      id: 'financial-math-verifier',
      name: 'Financial Math Verifier',
      version: '1.0.0',
      description: 'Deterministic verification layer for all financial calculations. Catches AI math errors, floating-point drift, rounding issues, and currency precision violations before they reach production.',
      author: PLATFORM.name,
      category: 'compliance',
      requiredTier: 'starter',
      capabilities: [
        'payroll_math_verification',
        'invoice_math_verification',
        'credit_balance_verification',
        'tax_computation_verification',
        'currency_precision_enforcement',
        'overflow_detection',
        'rounding_consistency',
        'deterministic_recalculation',
      ],
      eventSubscriptions: ['financial_calculation', 'payroll_processed', 'invoice_generated', 'credit_consumed'],
    };
  }

  async execute(context: SkillContext, params: MathVerificationParams): Promise<SkillResult<MathVerificationResult>> {
    const logs: string[] = [];

    try {
      logs.push(`Verifying ${params.operationType} calculation`);

      const precisionCheck = this.checkCurrencyPrecision(params.inputs, logs);
      const overflowCheck = this.checkOverflow(params.inputs, logs);
      const negativeCheck = this.checkNegativeValues(params.inputs, params.operationType, logs);

      let result: MathVerificationResult;

      switch (params.operationType) {
        case 'payroll':
          result = this.verifyPayroll(params, precisionCheck, overflowCheck, negativeCheck, logs);
          break;
        case 'invoice':
          result = this.verifyInvoice(params, precisionCheck, overflowCheck, negativeCheck, logs);
          break;
        case 'credit':
          result = this.verifyCredit(params, precisionCheck, overflowCheck, negativeCheck, logs);
          break;
        case 'tax':
          result = this.verifyTax(params, precisionCheck, overflowCheck, negativeCheck, logs);
          break;
        case 'billing':
          result = this.verifyBilling(params, precisionCheck, overflowCheck, negativeCheck, logs);
          break;
        default:
          result = this.verifyGeneral(params, precisionCheck, overflowCheck, negativeCheck, logs);
      }

      if (params.aiProposedOutput !== undefined) {
        const discrepancy = Math.abs(result.deterministicResult - params.aiProposedOutput);
        result.aiProposedResult = params.aiProposedOutput;
        result.discrepancy = discrepancy;
        result.discrepancyPercent = result.deterministicResult !== 0
          ? (discrepancy / Math.abs(result.deterministicResult)) * 100
          : (discrepancy > 0 ? 100 : 0);

        if (discrepancy > FinancialMathVerifierSkill.ROUNDING_TOLERANCE_CENTS) {
          result.verified = false;
          result.warnings.push(
            `AI proposed ${params.aiProposedOutput} but deterministic calculation yields ${result.deterministicResult} (off by ${discrepancy} cents, ${result.discrepancyPercent.toFixed(4)}%)`
          );
          logs.push(`DISCREPANCY: AI=${params.aiProposedOutput}, Deterministic=${result.deterministicResult}, Delta=${discrepancy}`);
        } else {
          logs.push(`AI output matches deterministic result within tolerance`);
        }
      }

      return {
        success: true,
        data: result,
        logs,
        metadata: {
          creditsUsed: 0,
          isVerified: result.verified,
          hasWarnings: result.warnings.length > 0,
        },
      };
    } catch (error: any) {
      logs.push(`Verification failed: ${(error instanceof Error ? error.message : String(error))}`);
      return { success: false, error: (error instanceof Error ? error.message : String(error)), logs };
    }
  }

  private toCents(dollars: number): number {
    return Math.round(dollars * 100);
  }

  private bankersRound(value: number, decimals: number = 2): number {
    const factor = Math.pow(10, decimals);
    const shifted = value * factor;
    const truncated = Math.trunc(shifted);
    const remainder = Math.abs(shifted - truncated);

    if (Math.abs(remainder - 0.5) < 1e-10) {
      return (truncated % 2 === 0 ? truncated : truncated + Math.sign(shifted)) / factor;
    }
    return Math.round(shifted) / factor;
  }

  private bankersRoundCents(value: number): number {
    const truncated = Math.trunc(value);
    const remainder = Math.abs(value - truncated);
    if (Math.abs(remainder - 0.5) < 1e-10) {
      return truncated % 2 === 0 ? truncated : truncated + Math.sign(value);
    }
    return Math.round(value);
  }

  private checkCurrencyPrecision(inputs: Record<string, number>, logs: string[]): boolean {
    const warnings: string[] = [];
    for (const [key, value] of Object.entries(inputs)) {
      if (typeof value !== 'number') continue;

      const str = value.toString();
      const decimalPart = str.includes('.') ? str.split('.')[1] : '';
      if (decimalPart.length > 2 && !key.includes('rate') && !key.includes('Rate') && !key.includes('percent')) {
        warnings.push(`${key}=${value} has more than 2 decimal places — potential floating-point contamination`);
      }

      if (!Number.isFinite(value)) {
        warnings.push(`${key} is not a finite number: ${value}`);
      }
    }

    if (warnings.length > 0) {
      logs.push(`Currency precision issues: ${warnings.join('; ')}`);
      return false;
    }
    return true;
  }

  private checkOverflow(inputs: Record<string, number>, logs: string[]): boolean {
    for (const [key, value] of Object.entries(inputs)) {
      if (typeof value !== 'number') continue;
      if (Math.abs(value) > FinancialMathVerifierSkill.MAX_SAFE_CENTS) {
        logs.push(`OVERFLOW WARNING: ${key}=${value} exceeds safe range`);
        return false;
      }
      if (!Number.isSafeInteger(Math.round(value)) && Number.isInteger(value)) {
        logs.push(`INTEGER SAFETY WARNING: ${key}=${value} exceeds safe integer range`);
        return false;
      }
    }
    return true;
  }

  private checkNegativeValues(inputs: Record<string, number>, opType: string, logs: string[]): boolean {
    const allowedNegativeKeys = ['adjustment', 'refund', 'credit', 'discount', 'deduction'];
    let clean = true;

    for (const [key, value] of Object.entries(inputs)) {
      if (typeof value !== 'number') continue;
      if (value < 0) {
        const isAllowed = allowedNegativeKeys.some(k => key.toLowerCase().includes(k));
        if (!isAllowed) {
          logs.push(`NEGATIVE VALUE WARNING: ${key}=${value} — unexpected negative in ${opType}`);
          clean = false;
        }
      }
    }
    return clean;
  }

  private verifyPayroll(
    params: MathVerificationParams,
    precisionOk: boolean, overflowOk: boolean, negativeOk: boolean,
    logs: string[]
  ): MathVerificationResult {
    const steps: VerificationStep[] = [];
    const warnings: string[] = [];
    const { inputs, context } = params;

    const hours = inputs.hoursWorked || context?.hoursWorked || 0;
    const rate = inputs.payRate || context?.payRate || 0;
    const otHours = inputs.overtimeHours || 0;
    const otMultiplier = inputs.overtimeMultiplier || 1.5;

    const regularPayCents = Math.round(hours * rate * 100);
    steps.push({ step: 1, operation: 'Regular pay', input: `${hours}hrs * $${rate}/hr`, result: regularPayCents, verified: true });

    let otPayCents = 0;
    if (otHours > 0) {
      otPayCents = Math.round(otHours * rate * otMultiplier * 100);
      steps.push({ step: 2, operation: 'Overtime pay', input: `${otHours}hrs * $${rate}/hr * ${otMultiplier}x`, result: otPayCents, verified: true });
    }

    const grossCents = regularPayCents + otPayCents;
    steps.push({ step: 3, operation: 'Gross pay', input: `regular + overtime`, result: grossCents, verified: true });

    const deductionCents = Math.round((inputs.deductions || 0) * 100);
    const taxCents = Math.round((inputs.taxWithholding || 0) * 100);

    const netCents = grossCents - deductionCents - taxCents;
    steps.push({ step: 4, operation: 'Net pay', input: `gross - deductions - tax`, result: netCents, verified: true });

    if (netCents < 0) {
      warnings.push('Net pay is negative — deductions exceed gross pay');
    }

    if (hours > 168) {
      warnings.push(`Hours worked (${hours}) exceeds maximum possible in a week (168)`);
    }

    if (rate > 0 && rate < 7.25) {
      warnings.push(`Pay rate ($${rate}/hr) below federal minimum wage ($7.25/hr)`);
    }

    if (!precisionOk) warnings.push('Currency precision issues detected in inputs');
    if (!overflowOk) warnings.push('Overflow risk detected in inputs');
    if (!negativeOk) warnings.push('Unexpected negative values in inputs');

    return {
      verified: warnings.length === 0,
      deterministicResult: netCents,
      steps,
      warnings,
      currencyPrecisionCheck: precisionOk,
      overflowCheck: overflowOk,
      negativeValueCheck: negativeOk,
      roundingMethod: 'banker_rounding_cents',
    };
  }

  private verifyInvoice(
    params: MathVerificationParams,
    precisionOk: boolean, overflowOk: boolean, negativeOk: boolean,
    logs: string[]
  ): MathVerificationResult {
    const steps: VerificationStep[] = [];
    const warnings: string[] = [];
    const items = params.context?.invoiceItems || [];

    let subtotalCents = 0;
    items.forEach((item, idx) => {
      const lineCents = Math.round(item.quantity * item.unitPrice * 100);
      subtotalCents += lineCents;
      steps.push({
        step: idx + 1,
        operation: `Line item: ${item.description}`,
        input: `${item.quantity} * $${item.unitPrice}`,
        result: lineCents,
        verified: true,
      });
    });

    if (items.length === 0 && params.inputs.subtotal !== undefined) {
      subtotalCents = Math.round(params.inputs.subtotal * 100);
    }

    steps.push({ step: items.length + 1, operation: 'Subtotal', input: 'Sum of line items', result: subtotalCents, verified: true });

    const taxRate = params.inputs.taxRate || params.context?.taxRate || 0;
    const taxCents = this.bankersRoundCents(subtotalCents * taxRate / 100);
    steps.push({ step: items.length + 2, operation: 'Tax (bankers rounded)', input: `subtotal * ${taxRate}%`, result: taxCents, verified: true });

    const discountCents = Math.round((params.inputs.discount || 0) * 100);
    const totalCents = subtotalCents + taxCents - discountCents;
    steps.push({ step: items.length + 3, operation: 'Total', input: 'subtotal + tax - discount', result: totalCents, verified: true });

    if (totalCents < 0) warnings.push('Invoice total is negative');
    if (taxRate > 15) warnings.push(`Tax rate ${taxRate}% seems unusually high — verify jurisdiction`);
    if (!precisionOk) warnings.push('Currency precision issues detected');
    if (!overflowOk) warnings.push('Overflow risk detected');

    return {
      verified: warnings.length === 0,
      deterministicResult: totalCents,
      steps, warnings,
      currencyPrecisionCheck: precisionOk,
      overflowCheck: overflowOk,
      negativeValueCheck: negativeOk,
      roundingMethod: 'round_half_up_cents',
    };
  }

  private verifyCredit(
    params: MathVerificationParams,
    precisionOk: boolean, overflowOk: boolean, negativeOk: boolean,
    logs: string[]
  ): MathVerificationResult {
    const steps: VerificationStep[] = [];
    const warnings: string[] = [];
    const { inputs } = params;

    const subscription = Math.round(inputs.subscriptionCredits || 0);
    const carryover = Math.round(inputs.carryoverCredits || 0);
    const purchased = Math.round(inputs.purchasedCredits || 0);
    const consumed = Math.round(inputs.creditsToConsume || 0);

    const totalBefore = subscription + carryover + purchased;
    steps.push({ step: 1, operation: 'Total balance before', input: `${subscription} + ${carryover} + ${purchased}`, result: totalBefore, verified: true });

    if (consumed > totalBefore) {
      warnings.push(`Attempting to consume ${consumed} credits but only ${totalBefore} available`);
    }

    let remaining = consumed;
    let subDrain = Math.min(remaining, subscription);
    remaining -= subDrain;
    steps.push({ step: 2, operation: 'Drain subscription', input: `min(${consumed}, ${subscription})`, result: subDrain, verified: true });

    let carryDrain = Math.min(remaining, carryover);
    remaining -= carryDrain;
    steps.push({ step: 3, operation: 'Drain carryover', input: `min(${remaining + carryDrain}, ${carryover})`, result: carryDrain, verified: true });

    let purchDrain = Math.min(remaining, purchased);
    remaining -= purchDrain;
    steps.push({ step: 4, operation: 'Drain purchased', input: `min(${remaining + purchDrain}, ${purchased})`, result: purchDrain, verified: true });

    const totalAfter = totalBefore - subDrain - carryDrain - purchDrain;
    steps.push({ step: 5, operation: 'Balance after', input: `${totalBefore} - consumed`, result: totalAfter, verified: true });

    if (remaining > 0) warnings.push(`${remaining} credits could not be drained — insufficient balance`);
    if (totalAfter < 0) warnings.push('Negative credit balance detected');

    return {
      verified: warnings.length === 0 && remaining === 0,
      deterministicResult: totalAfter,
      steps, warnings,
      currencyPrecisionCheck: true,
      overflowCheck: overflowOk,
      negativeValueCheck: totalAfter >= 0,
      roundingMethod: 'integer_only',
    };
  }

  private verifyTax(
    params: MathVerificationParams,
    precisionOk: boolean, overflowOk: boolean, negativeOk: boolean,
    logs: string[]
  ): MathVerificationResult {
    const steps: VerificationStep[] = [];
    const warnings: string[] = [];
    const { inputs } = params;

    const grossCents = Math.round((inputs.grossAmount || 0) * 100);
    const federalRate = inputs.federalTaxRate || 0;
    const stateRate = inputs.stateTaxRate || 0;
    const localRate = inputs.localTaxRate || 0;
    const ficaRate = inputs.ficaRate || 7.65;
    const futaRate = inputs.futaRate || 0.6;

    const federalCents = this.bankersRoundCents(grossCents * federalRate / 100);
    steps.push({ step: 1, operation: 'Federal tax (bankers rounded)', input: `$${(grossCents/100).toFixed(2)} * ${federalRate}%`, result: federalCents, verified: true });

    const stateCents = this.bankersRoundCents(grossCents * stateRate / 100);
    steps.push({ step: 2, operation: 'State tax (bankers rounded)', input: `$${(grossCents/100).toFixed(2)} * ${stateRate}%`, result: stateCents, verified: true });

    const localCents = this.bankersRoundCents(grossCents * localRate / 100);
    steps.push({ step: 3, operation: 'Local tax (bankers rounded)', input: `$${(grossCents/100).toFixed(2)} * ${localRate}%`, result: localCents, verified: true });

    const ficaCents = this.bankersRoundCents(grossCents * ficaRate / 100);
    steps.push({ step: 4, operation: 'FICA (bankers rounded)', input: `$${(grossCents/100).toFixed(2)} * ${ficaRate}%`, result: ficaCents, verified: true });

    const totalTaxCents = federalCents + stateCents + localCents + ficaCents;
    steps.push({ step: 5, operation: 'Total tax', input: 'federal + state + local + FICA', result: totalTaxCents, verified: true });

    const effectiveRate = grossCents > 0 ? (totalTaxCents / grossCents * 100) : 0;
    if (effectiveRate > 55) warnings.push(`Effective tax rate ${effectiveRate.toFixed(1)}% seems unusually high`);
    if (effectiveRate < 5 && grossCents > 100000) warnings.push(`Effective tax rate ${effectiveRate.toFixed(1)}% seems unusually low for income > $1,000`);

    return {
      verified: warnings.length === 0,
      deterministicResult: totalTaxCents,
      steps, warnings,
      currencyPrecisionCheck: precisionOk,
      overflowCheck: overflowOk,
      negativeValueCheck: negativeOk,
      roundingMethod: 'bankers_rounding_cents',
    };
  }

  private verifyBilling(
    params: MathVerificationParams,
    precisionOk: boolean, overflowOk: boolean, negativeOk: boolean,
    logs: string[]
  ): MathVerificationResult {
    const steps: VerificationStep[] = [];
    const warnings: string[] = [];
    const { inputs } = params;

    const baseCents = Math.round(inputs.subscriptionAmountCents || 0);
    steps.push({ step: 1, operation: 'Base subscription', input: `${baseCents} cents`, result: baseCents, verified: true });

    const employeeOverageCount = Math.round(inputs.employeeOverageCount || 0);
    const perEmployeeOverageCents = Math.round(inputs.perEmployeeOverageCents || 0);
    const overageCents = employeeOverageCount * perEmployeeOverageCents;
    steps.push({ step: 2, operation: 'Employee overage', input: `${employeeOverageCount} * ${perEmployeeOverageCents}c`, result: overageCents, verified: true });

    const invoiceFeeCents = Math.round(inputs.invoiceProcessingCents || 0);
    const payrollFeeCents = Math.round(inputs.payrollProcessingCents || 0);
    const qbSyncCents = Math.round(inputs.qbSyncCents || 0);
    const feesTotalCents = invoiceFeeCents + payrollFeeCents + qbSyncCents;
    steps.push({ step: 3, operation: 'Processing fees', input: `inv(${invoiceFeeCents}) + payroll(${payrollFeeCents}) + qb(${qbSyncCents})`, result: feesTotalCents, verified: true });

    const creditPackCents = Math.round(inputs.creditPackPurchasesCents || 0);
    const addonCents = Math.round(inputs.addonModulesCents || 0);

    const subtotalCents = baseCents + overageCents + feesTotalCents + creditPackCents + addonCents;
    steps.push({ step: 4, operation: 'Subtotal', input: 'base + overage + fees + credits + addons', result: subtotalCents, verified: true });

    const taxRate = inputs.taxRate || 0;
    const taxCents = this.bankersRoundCents(subtotalCents * taxRate / 100);
    steps.push({ step: 5, operation: 'Tax (bankers rounded)', input: `${subtotalCents}c * ${taxRate}%`, result: taxCents, verified: true });

    const totalCents = subtotalCents + taxCents;
    steps.push({ step: 6, operation: 'Total', input: 'subtotal + tax', result: totalCents, verified: true });

    if (totalCents < 0) warnings.push('Negative platform bill total');
    if (!precisionOk) warnings.push('Currency precision issues in inputs');

    return {
      verified: warnings.length === 0,
      deterministicResult: totalCents,
      steps, warnings,
      currencyPrecisionCheck: precisionOk,
      overflowCheck: overflowOk,
      negativeValueCheck: negativeOk,
      roundingMethod: 'integer_cents_only',
    };
  }

  private verifyGeneral(
    params: MathVerificationParams,
    precisionOk: boolean, overflowOk: boolean, negativeOk: boolean,
    logs: string[]
  ): MathVerificationResult {
    const steps: VerificationStep[] = [];
    const warnings: string[] = [];
    const { inputs } = params;

    let sum = 0;
    let stepNum = 1;
    for (const [key, value] of Object.entries(inputs)) {
      if (typeof value === 'number') {
        sum += value;
        steps.push({ step: stepNum++, operation: key, input: `${value}`, result: Math.round(value * 100), verified: true });
      }
    }

    if (params.expectedOutput !== undefined) {
      const diff = Math.abs(sum - params.expectedOutput);
      if (diff > 0.01) {
        warnings.push(`Sum (${sum}) does not match expected output (${params.expectedOutput}), diff: ${diff}`);
      }
    }

    return {
      verified: warnings.length === 0,
      deterministicResult: Math.round(sum * 100),
      steps, warnings,
      currencyPrecisionCheck: precisionOk,
      overflowCheck: overflowOk,
      negativeValueCheck: negativeOk,
      roundingMethod: 'round_half_up_cents',
    };
  }
}

export const financialMathVerifierSkill = new FinancialMathVerifierSkill();
export default FinancialMathVerifierSkill;
