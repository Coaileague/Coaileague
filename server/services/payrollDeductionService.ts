/**
 * PHASE 4D: Payroll Deduction & Garnishment Service
 * Calculates and applies payroll deductions and garnishments
 * 
 * Supports pre-tax deductions with IRS 2025 annual limits:
 * - 401(k) Traditional/Roth: $23,500 + $7,500 catch-up (age 50+)
 * - HSA: $4,300 (self) / $8,550 (family) + $1,000 catch-up (age 55+)
 * - FSA Healthcare: $3,300
 * - FSA Dependent Care: $5,000 (married filing jointly) / $2,500 (married filing separately)
 * - Section 125 Cafeteria Plans
 */

import { db } from "../db";
import {
  payrollEntries,
  payrollRuns
} from '@shared/schema';
import { eq, and, gte, lte, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { startOfYear, endOfYear } from "date-fns";
import { payrollDeductions, payrollGarnishments } from '@shared/schema';

/**
 * IRS 2025 Annual Contribution Limits for Pre-Tax Deductions
 */
export const IRS_DEDUCTION_LIMITS_2025 = {
  '401k': {
    baseLimit: 23500,
    catchUpLimit: 7500,
    catchUpAge: 50,
    description: '401(k) Traditional/Roth Contributions'
  },
  '401k_employer': {
    baseLimit: 70000,
    catchUpLimit: 7500,
    catchUpAge: 50,
    description: '401(k) Total Annual Additions'
  },
  '403b': {
    baseLimit: 23500,
    catchUpLimit: 7500,
    catchUpAge: 50,
    description: '403(b) Tax-Sheltered Annuity'
  },
  '457b': {
    baseLimit: 23500,
    catchUpLimit: 7500,
    catchUpAge: 50,
    description: '457(b) Deferred Compensation'
  },
  'hsa_self': {
    baseLimit: 4300,
    catchUpLimit: 1000,
    catchUpAge: 55,
    description: 'Health Savings Account (Self-only)'
  },
  'hsa_family': {
    baseLimit: 8550,
    catchUpLimit: 1000,
    catchUpAge: 55,
    description: 'Health Savings Account (Family)'
  },
  'fsa_healthcare': {
    baseLimit: 3300,
    catchUpLimit: 0,
    catchUpAge: 0,
    description: 'Flexible Spending Account (Healthcare)'
  },
  'fsa_dependent_care': {
    baseLimit: 5000,
    catchUpLimit: 0,
    catchUpAge: 0,
    alternateLimit: 2500,
    description: 'Flexible Spending Account (Dependent Care)'
  },
  'simple_ira': {
    baseLimit: 16500,
    catchUpLimit: 3500,
    catchUpAge: 50,
    description: 'SIMPLE IRA Contributions'
  },
  'traditional_ira': {
    baseLimit: 7000,
    catchUpLimit: 1000,
    catchUpAge: 50,
    description: 'Traditional IRA Contributions'
  },
  'roth_ira': {
    baseLimit: 7000,
    catchUpLimit: 1000,
    catchUpAge: 50,
    description: 'Roth IRA Contributions',
    incomePhaseoutSingle: { start: 150000, end: 165000 },
    incomePhaseoutMarried: { start: 236000, end: 246000 }
  }
} as const;

export const IRS_DEDUCTION_LIMITS_2024 = IRS_DEDUCTION_LIMITS_2025;

export type DeductionType = keyof typeof IRS_DEDUCTION_LIMITS_2024;

/**
 * Get the annual limit for a deduction type based on employee age and coverage
 */
export function getDeductionLimit(
  deductionType: string,
  employeeAge: number = 30,
  coverageType: 'self' | 'family' = 'self',
  filingStatus: 'single' | 'married' | 'married_separately' = 'single'
): { limit: number; description: string; includesCatchUp: boolean } {
  // Handle HSA coverage type
  if (deductionType === 'hsa') {
    const hsaType = coverageType === 'family' ? 'hsa_family' : 'hsa_self';
    const config = IRS_DEDUCTION_LIMITS_2024[hsaType];
    const catchUpEligible = employeeAge >= config.catchUpAge;
    return {
      limit: config.baseLimit + (catchUpEligible ? config.catchUpLimit : 0),
      description: config.description,
      includesCatchUp: catchUpEligible
    };
  }
  
  // Handle FSA dependent care filing status
  if (deductionType === 'fsa_dependent_care') {
    const config = IRS_DEDUCTION_LIMITS_2024['fsa_dependent_care'];
    const limit = filingStatus === 'married_separately' 
      ? (config.alternateLimit || config.baseLimit / 2)
      : config.baseLimit;
    return {
      limit,
      description: config.description,
      includesCatchUp: false
    };
  }
  
  // Standard deduction types
  const config = IRS_DEDUCTION_LIMITS_2024[deductionType as DeductionType];
  if (!config) {
    return {
      limit: Infinity, // No limit for unknown types
      description: `Unknown deduction type: ${deductionType}`,
      includesCatchUp: false
    };
  }
  
  const catchUpEligible = employeeAge >= config.catchUpAge;
  return {
    limit: config.baseLimit + (catchUpEligible ? config.catchUpLimit : 0),
    description: config.description,
    includesCatchUp: catchUpEligible
  };
}

/**
 * Get YTD contributions for a specific deduction type
 */
export async function getYtdDeductions(
  employeeId: string,
  deductionType: string,
  year: number = new Date().getFullYear()
): Promise<number> {
  const yearStart = startOfYear(new Date(year, 0, 1));
  const yearEnd = endOfYear(new Date(year, 0, 1));
  
  const result = await db
    .select({
      total: sql<string>`COALESCE(SUM(${payrollDeductions.amount}::numeric), 0)`
    })
    .from(payrollDeductions)
    .innerJoin(payrollEntries, eq(payrollDeductions.payrollEntryId, payrollEntries.id))
    .innerJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))
    .where(
      and(
        eq(payrollDeductions.employeeId, employeeId),
        eq(payrollDeductions.deductionType, deductionType),
        gte(payrollRuns.periodEnd, yearStart),
        lte(payrollRuns.periodEnd, yearEnd)
      )
    );
  
  return parseFloat(result[0]?.total || '0');
}

/**
 * Validate deduction amount against IRS limits
 * Returns adjusted amount if it would exceed annual limit
 */
export async function validateDeductionAmount(
  employeeId: string,
  deductionType: string,
  requestedAmount: number,
  employeeAge: number = 30,
  coverageType: 'self' | 'family' = 'self',
  filingStatus: 'single' | 'married' | 'married_separately' = 'single',
  year: number = new Date().getFullYear()
): Promise<{
  allowedAmount: number;
  ytdContributions: number;
  remainingLimit: number;
  annualLimit: number;
  isLimited: boolean;
  warning?: string;
}> {
  const limitInfo = getDeductionLimit(deductionType, employeeAge, coverageType, filingStatus);
  const ytdContributions = await getYtdDeductions(employeeId, deductionType, year);
  const remainingLimit = Math.max(0, limitInfo.limit - ytdContributions);
  
  let allowedAmount = Math.min(requestedAmount, remainingLimit);
  let warning: string | undefined;
  
  if (requestedAmount > remainingLimit) {
    warning = `Requested ${deductionType} contribution of $${requestedAmount.toFixed(2)} exceeds remaining annual limit. Adjusted to $${allowedAmount.toFixed(2)}. YTD: $${ytdContributions.toFixed(2)}, Annual limit: $${limitInfo.limit}`;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    log.info(`[PAYROLL DEDUCTION] ${warning}`);
  }
  
  return {
    allowedAmount,
    ytdContributions,
    remainingLimit,
    annualLimit: limitInfo.limit,
    isLimited: requestedAmount > remainingLimit
  };
}

/**
 * Calculate pre-tax deduction impact on taxable income
 * Pre-tax deductions reduce gross pay before federal/state/FICA taxes
 */
export function calculatePreTaxReduction(
  grossPay: number,
  preTaxDeductions: Array<{ type: string; amount: number }>
): {
  adjustedGrossForFederal: number;
  adjustedGrossForState: number;
  adjustedGrossForFICA: number;
  totalPreTaxDeductions: number;
} {
  // Most pre-tax deductions reduce all taxes
  const section125Deductions = preTaxDeductions.filter(d => 
    ['hsa', 'hsa_self', 'hsa_family', 'fsa_healthcare', 'fsa_dependent_care'].includes(d.type)
  );
  
  // 401k/403b/457b reduce federal/state but NOT FICA
  const retirementDeductions = preTaxDeductions.filter(d =>
    ['401k', '403b', '457b', 'simple_ira', 'traditional_ira'].includes(d.type)
  );
  
  const section125Total = section125Deductions.reduce((sum, d) => sum + d.amount, 0);
  const retirementTotal = retirementDeductions.reduce((sum, d) => sum + d.amount, 0);
  const totalPreTaxDeductions = section125Total + retirementTotal;
  
  return {
    // Federal/State tax: reduced by ALL pre-tax deductions
    adjustedGrossForFederal: grossPay - totalPreTaxDeductions,
    adjustedGrossForState: grossPay - totalPreTaxDeductions,
    // FICA: only reduced by Section 125 (cafeteria plan) deductions
    // Retirement contributions (401k, etc.) are still subject to FICA
    adjustedGrossForFICA: grossPay - section125Total,
    totalPreTaxDeductions
  };
}

/**
 * Calculate total deductions for a payroll entry
 */
export async function calculateTotalDeductions(payrollEntryId: string): Promise<Decimal> {
  const deductions = await db
    .select()
    .from(payrollDeductions)
    .where(eq(payrollDeductions.payrollEntryId, payrollEntryId));

  return deductions.reduce((sum, d) => {
    return sum.plus(new Decimal(d.amount));
  }, new Decimal(0));
}

/**
 * Calculate total garnishments (in order of priority)
 */
export async function calculateTotalGarnishments(payrollEntryId: string): Promise<Decimal> {
  const garnishments = await db
    .select()
    .from(payrollGarnishments)
    .where(eq(payrollGarnishments.payrollEntryId, payrollEntryId));

  // Sort by priority (lower numbers = higher priority)
  const sorted = garnishments.sort((a, b) => (a.priority || 0) - (b.priority || 0));

  return sorted.reduce((sum, g) => {
    return sum.plus(new Decimal(g.amount));
  }, new Decimal(0));
}

/**
 * Apply all deductions and garnishments to a payroll entry
 */
export async function applyDeductionsAndGarnishments(payrollEntryId: string): Promise<Decimal> {
  const entry = await db
    .select()
    .from(payrollEntries)
    .where(eq(payrollEntries.id, payrollEntryId));

  if (!entry[0]) throw new Error(`Payroll entry ${payrollEntryId} not found`);

  const totalDeductions = await calculateTotalDeductions(payrollEntryId);
  const totalGarnishments = await calculateTotalGarnishments(payrollEntryId);

  // 30x Federal Minimum Wage Garnishment Floor (A4 Requirement)
  // net_pay after garnishments must be >= 30x federal minimum wage ($7.25 * 30 = $217.50)
  // Note: This applies to disposable earnings (net pay after taxes/deductions).
  // Current implementation subtracts garnishments from netPay.
  const FEDERAL_MINIMUM_WAGE = 7.25;
  const GARNISHMENT_FLOOR = FEDERAL_MINIMUM_WAGE * 30;

  const netPayAfterDeductions = new Decimal(entry[0].netPay || 0).minus(totalDeductions);
  const maxAllowedGarnishments = Decimal.max(new Decimal(0), netPayAfterDeductions.minus(GARNISHMENT_FLOOR));
  
  const finalGarnishments = Decimal.min(totalGarnishments, maxAllowedGarnishments);

  const rawNetPay = netPayAfterDeductions.minus(finalGarnishments);

  // NET PAY FLOOR: garnishments and deductions can never produce negative take-home pay
  const netPay = Decimal.max(new Decimal(0), rawNetPay);

  const log = (await import('../lib/logger')).createLogger('PayrollDeductions');
  log.info(`Entry ${payrollEntryId} — Deductions=$${totalDeductions} Garnishments=$${finalGarnishments} (Requested=$${totalGarnishments}) Raw=$${rawNetPay} Net=$${netPay}`);

  return netPay;
}

/**
 * Add a deduction to a payroll entry
 */
export async function addDeduction(
  payrollEntryId: string,
  employeeId: string,
  workspaceId: string,
  deductionType: string,
  amount: string | number,
  isPreTax: boolean = true,
  description?: string
): Promise<any> {
  const result = await db
    .insert(payrollDeductions)
    .values({
      payrollEntryId,
      employeeId,
      workspaceId,
      deductionType,
      amount: new Decimal(amount).toString(),
      isPreTax,
      description,
    })
    .returning();

  // @ts-expect-error — TS migration: fix in refactoring sprint
  log.info(`[PAYROLL DEDUCTION] Added ${deductionType} deduction of $${amount} to entry ${payrollEntryId}`);
  return result[0];
}

/**
 * Add a garnishment to a payroll entry
 */
export async function addGarnishment(
  payrollEntryId: string,
  employeeId: string,
  workspaceId: string,
  garnishmentType: string,
  amount: string | number,
  priority: number = 1,
  caseNumber?: string,
  description?: string
): Promise<any> {
  const result = await db
    .insert(payrollGarnishments)
    .values({
      payrollEntryId,
      employeeId,
      workspaceId,
      garnishmentType,
      amount: new Decimal(amount).toString(),
      priority,
      caseNumber,
      description,
    })
    .returning();

  // @ts-expect-error — TS migration: fix in refactoring sprint
  log.info(`[PAYROLL GARNISHMENT] Added ${garnishmentType} garnishment of $${amount} (priority ${priority}) to entry ${payrollEntryId}`);
  return result[0];
}
