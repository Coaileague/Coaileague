/**
 * AI Payroll™ Automation Engine
 * 99% Automated Payroll Processing with 1% Human QC
 * 
 * Features:
 * - Auto-detect pay periods (weekly, bi-weekly, monthly)
 * - Pull time entries from TrackOS™
 * - Calculate gross pay with overtime (1.5x after 40hrs)
 * - Federal & state tax withholding
 * - Social Security (6.2%) & Medicare (1.45%)
 * - Generate paychecks ready for QC approval
 * 
 * Trinity Integration: Connected via trinityPlatformConnector for payroll oversight and insights
 */

import { db } from "../db";
import { createLogger } from "../lib/logger";
import { timeEntries, employees, payrollRuns, payrollEntries, payrollGarnishments, workspaces, invoiceLineItems, employeeBenefits, employeePayrollInfo, payrollDeductions, type TimeEntry } from "@shared/schema";

const log = createLogger('PayrollAutomation');
import { eq, and, gte, lte, isNull, sql, notInArray, inArray, sum } from "drizzle-orm";
import { startOfWeek, endOfWeek, subWeeks, format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from "date-fns";
import { aggregatePayrollHours, markEntriesAsPayrolled } from "./automation/payrollHoursAggregator";
import { trinityPlatformConnector } from './ai-brain/trinityPlatformConnector';
import { notifyPayrollReadyForReview } from './automation/notificationEventCoverage';
import { platformEventBus } from './platformEventBus';
import { assertNoPeriodOverlap } from './payroll/payrollLedger';
import { calculatePayrollTaxes, type PayPeriod as TaxPayPeriod, type FilingStatus as TaxFilingStatus } from './billing/payrollTaxService';
import { getTaxRules, computeProgressiveStateTax, TAX_REGISTRY_VERSION, TAX_REGISTRY_EFFECTIVE_YEAR } from './tax/taxRulesRegistry';
import { claimPayrollTimeEntries } from './payroll/payrollTimeEntryClaimer';
import { multiplyFinancialValues, addFinancialValues, toFinancialString } from './financialCalculator';
const PRE_TAX_BENEFIT_TYPES = ['401k', 'health_insurance', 'dental_insurance', 'vision_insurance'];
const POST_TAX_BENEFIT_TYPES = ['life_insurance', 'other'];

interface EmployeeDeductions {
  preTax: number;
  postTax: number;
  details: Array<{ type: string; amount: number; isPreTax: boolean }>;
}

interface PayPeriod {
  start: Date;
  end: Date;
  type: 'daily' | 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly';
}

interface PayrollCalculation {
  employeeId: string;
  employeeName: string;
  workerType: string; // 'employee' | 'contractor' — drives tax withholding and ledger categorisation
  regularHours: number;
  overtimeHours: number;
  holidayHours: number; // Added for FLSA holiday pay tracking
  hourlyRate: number;
  grossPay: number;
  preTaxDeductions: number; // 401k, health insurance, HSA, FSA, etc.
  taxableGrossPay: number; // grossPay - preTaxDeductions
  federalTax: number;
  stateTax: number;
  socialSecurity: number;
  medicare: number;
  postTaxDeductions: number; // Extra deductions after taxes
  totalGarnishments: number; // Court-ordered wage garnishments applied after all other deductions
  netPay: number;
}

export class PayrollAutomationEngine {
  
  /**
   * Fetch active employee benefit deductions from the database
   * Calculates per-payroll amounts based on monthly contributions and pay frequency
   */
  static async getEmployeeDeductions(
    employeeId: string,
    grossPay: number,
    payPeriodType: 'daily' | 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly' = 'bi-weekly'
  ): Promise<EmployeeDeductions> {
    const payrollsPerMonth: Record<string, number> = {
      'daily': 21.67,
      'weekly': 4.33,
      'bi-weekly': 2.17,
      'semi-monthly': 2,
      'monthly': 1
    };
    // Guard: unknown payPeriodType falls back to bi-weekly (2.17) to prevent silent NaN
    const divisor = payrollsPerMonth[payPeriodType] ?? 2.17;
    
    const benefits = await db
      .select()
      .from(employeeBenefits)
      .where(
        and(
          eq(employeeBenefits.employeeId, employeeId),
          eq(employeeBenefits.status, 'active')
        )
      );
    
    let preTax = 0;
    let postTax = 0;
    const details: Array<{ type: string; amount: number; isPreTax: boolean }> = [];
    
    for (const benefit of benefits) {
      let amount = 0;
      
      if (benefit.benefitType === '401k' && benefit.contributionPercentage) {
        amount = grossPay * (parseFloat(benefit.contributionPercentage) / 100);
      } else if (benefit.employeeContribution) {
        amount = parseFloat(benefit.employeeContribution) / divisor;
      }
      
      if (amount > 0) {
        const isPreTax = PRE_TAX_BENEFIT_TYPES.includes(benefit.benefitType);
        
        if (isPreTax) {
          preTax += amount;
        } else {
          postTax += amount;
        }
        
        details.push({
          type: benefit.benefitType,
          amount: parseFloat(amount.toFixed(2)),
          isPreTax
        });
      }
    }
    
    return {
      preTax: parseFloat(preTax.toFixed(2)),
      postTax: parseFloat(postTax.toFixed(2)),
      details
    };
  }
  
  /**
   * Auto-detect pay period based on workspace settings
   * Default: bi-weekly (most common)
   */
  static detectPayPeriod(workspacePaySchedule?: string): PayPeriod {
    const now = new Date();
    
    switch (workspacePaySchedule) {
      case 'daily': {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        const yesterdayEnd = new Date(yesterday);
        yesterdayEnd.setHours(23, 59, 59, 999);
        return { start: yesterday, end: yesterdayEnd, type: 'daily' };
      }

      case 'weekly':
        return {
          start: startOfWeek(subWeeks(now, 1)),
          end: endOfWeek(subWeeks(now, 1)),
          type: 'weekly'
        };

      case 'semi-monthly':
      case 'semi_monthly': {
        const dom = now.getDate();
        if (dom <= 15) {
          const prevMonth = subMonths(now, 1);
          const start = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 16);
          const end = endOfMonth(prevMonth);
          return { start, end, type: 'semi-monthly' };
        } else {
          const start = new Date(now.getFullYear(), now.getMonth(), 1);
          const end = new Date(now.getFullYear(), now.getMonth(), 15, 23, 59, 59, 999);
          return { start, end, type: 'semi-monthly' };
        }
      }
      
      case 'monthly':
        return {
          start: startOfMonth(subMonths(now, 1)),
          end: endOfMonth(subMonths(now, 1)),
          type: 'monthly'
        };
      
      case 'biweekly': // DB stores without hyphen — normalize
      case 'bi-weekly':
      default: {
        const EPOCH = new Date('2024-01-01T00:00:00Z');
        const msPerDay = 86400000;
        const daysSinceEpoch = Math.floor((now.getTime() - EPOCH.getTime()) / msPerDay);
        const currentCycleDay = daysSinceEpoch % 14;
        const currentPeriodStart = new Date(EPOCH.getTime() + (daysSinceEpoch - currentCycleDay) * msPerDay);
        const previousPeriodStart = new Date(currentPeriodStart.getTime() - 14 * msPerDay);
        const previousPeriodEnd = new Date(currentPeriodStart.getTime() - 1);
        previousPeriodEnd.setUTCHours(23, 59, 59, 999);
        return {
          start: previousPeriodStart,
          end: previousPeriodEnd,
          type: 'bi-weekly'
        };
      }
    }
  }
  
  /**
   * Calculate federal tax withholding — delegates to canonical IRS Pub 15-T 2024 service.
   * Maintains backwards-compatible signature for scripts and tests.
   */
  static calculateFederalTax(
    grossPay: number,
    payPeriodType: 'daily' | 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly' = 'bi-weekly',
    filingStatus: string = 'single'
  ): number {
    const ppMap: Record<string, TaxPayPeriod> = {
      'daily': 'weekly',
      'weekly': 'weekly',
      'bi-weekly': 'biweekly',
      'semi-monthly': 'semimonthly',
      'monthly': 'monthly',
    };
    const taxPeriod: TaxPayPeriod = ppMap[payPeriodType] ?? 'biweekly';
    const status: TaxFilingStatus = filingStatus === 'married' ? 'married_jointly' : 'single';
    const breakdown = calculatePayrollTaxes({
      grossWage: grossPay,
      state: 'CA',
      payPeriod: taxPeriod,
      filingStatus: status,
    });
    return breakdown.federalWithholding;
  }
  
  /**
   * State-specific tax configuration with 2024 rates
   * Full progressive brackets for all 50 states + DC
   * Based on single filer annual income brackets
   */
  static calculateStateTax(
    grossPay: number, 
    state: string = 'CA',
    payPeriodType: 'daily' | 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly' = 'bi-weekly'
  ): number {
    const stateCode = state.toUpperCase();
    const rules = getTaxRules();
    const stateRule = rules.stateTaxRules[stateCode];
    
    if (!stateRule) {
      log.warn(`Unknown state ${state}, defaulting to CA rates (registry v${TAX_REGISTRY_VERSION})`);
      return Number(multiplyFinancialValues(toFinancialString(grossPay), toFinancialString(0.0575)));
    }
    
    if (stateRule.type === 'none') return 0;
    
    const annualizationFactors: Record<string, number> = {
      'daily': 260, 'weekly': 52, 'bi-weekly': 26, 'semi-monthly': 24, 'monthly': 12
    };
    const factor = annualizationFactors[payPeriodType] || 26;
    
    if (stateRule.type === 'flat' && stateRule.rate != null) {
      return parseFloat((grossPay * stateRule.rate).toFixed(2));
    }
    
    if (stateRule.type === 'progressive') {
      const annualGross = grossPay * factor;
      const annualTax = computeProgressiveStateTax(annualGross, stateCode);
      return parseFloat((annualTax / factor).toFixed(2));
    }
    
    return 0;
  }
  
  /**
   * Reciprocal Tax Agreements between states
   * When an employee lives in one state but works in another,
   * these agreements determine which state to withhold taxes for.
   * 
   * Format: { workState: [array of resident states that have reciprocity] }
   */
  private static readonly RECIPROCAL_AGREEMENTS: Record<string, string[]> = {
    // DC has agreements with all states (employees pay their resident state)
    'DC': ['MD', 'VA'],
    
    // Illinois
    'IL': ['IA', 'KY', 'MI', 'WI'],
    
    // Indiana
    'IN': ['KY', 'MI', 'OH', 'PA', 'WI'],
    
    // Iowa
    'IA': ['IL'],
    
    // Kentucky
    'KY': ['IL', 'IN', 'MI', 'OH', 'VA', 'WV', 'WI'],
    
    // Maryland
    'MD': ['DC', 'PA', 'VA', 'WV'],
    
    // Michigan
    'MI': ['IL', 'IN', 'KY', 'MN', 'OH', 'WI'],
    
    // Minnesota
    'MN': ['MI', 'ND'],
    
    // Montana
    'MT': ['ND'],
    
    // New Jersey
    'NJ': ['PA'],
    
    // North Dakota
    'ND': ['MN', 'MT'],
    
    // Ohio
    'OH': ['IN', 'KY', 'MI', 'PA', 'WV'],
    
    // Pennsylvania
    'PA': ['IN', 'MD', 'NJ', 'OH', 'VA', 'WV'],
    
    // Virginia
    'VA': ['DC', 'KY', 'MD', 'PA', 'WV'],
    
    // West Virginia
    'WV': ['KY', 'MD', 'OH', 'PA', 'VA'],
    
    // Wisconsin
    'WI': ['IL', 'IN', 'KY', 'MI'],
  };
  
  /**
   * Determine which state to withhold income tax for based on reciprocal agreements
   * 
   * @param workState - State where work is performed
   * @param residentState - State where employee resides
   * @returns Object with taxState (which state to withhold for) and hasReciprocity boolean
   */
  static getEffectiveTaxState(
    workState: string,
    residentState: string
  ): { taxState: string; hasReciprocity: boolean; explanation: string } {
    const work = workState.toUpperCase();
    const resident = residentState.toUpperCase();
    
    // Same state - no reciprocity needed
    if (work === resident) {
      return {
        taxState: work,
        hasReciprocity: false,
        explanation: `Employee works and lives in ${work} - standard withholding applies`
      };
    }
    
    // Check if work state has reciprocity with resident state
    const reciprocalStates = this.RECIPROCAL_AGREEMENTS[work];
    if (reciprocalStates && reciprocalStates.includes(resident)) {
      return {
        taxState: resident,
        hasReciprocity: true,
        explanation: `${work} and ${resident} have a reciprocal agreement - withholding for resident state ${resident}`
      };
    }
    
    // No reciprocity - employee may owe taxes to both states
    // By default, withhold for work state (employee handles resident state on tax return)
    return {
      taxState: work,
      hasReciprocity: false,
      explanation: `No reciprocal agreement between ${work} and ${resident} - withholding for work state ${work}. Employee may need to file in ${resident} and claim credit.`
    };
  }
  
  /**
   * Calculate multi-state tax withholding
   * Handles reciprocal agreements and multi-state work scenarios
   * 
   * @param grossPay - Current period gross pay
   * @param workState - State where work is performed
   * @param residentState - State where employee resides
   * @param payPeriodType - Pay frequency for annualization
   * @returns Object with tax amounts and explanation
   */
  static calculateMultiStateTax(
    grossPay: number,
    workState: string,
    residentState: string,
    payPeriodType: 'daily' | 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly' = 'bi-weekly'
  ): {
    workStateTax: number;
    residentStateTax: number;
    effectiveWithholding: number;
    taxState: string;
    hasReciprocity: boolean;
    explanation: string;
  } {
    const reciprocity = this.getEffectiveTaxState(workState, residentState);
    
    // Calculate taxes for both states
    const workTax = this.calculateStateTax(grossPay, workState, payPeriodType);
    const residentTax = this.calculateStateTax(grossPay, residentState, payPeriodType);
    
    // Determine effective withholding based on reciprocity
    let effectiveWithholding: number;
    
    if (reciprocity.hasReciprocity) {
      // With reciprocity, only withhold for resident state
      effectiveWithholding = residentTax;
    } else if (workState.toUpperCase() === residentState.toUpperCase()) {
      // Same state
      effectiveWithholding = workTax;
    } else {
      // No reciprocity - withhold for work state
      // Note: Employee may need to file in both states
      effectiveWithholding = workTax;
    }
    
    return {
      workStateTax: workTax,
      residentStateTax: residentTax,
      effectiveWithholding,
      taxState: reciprocity.taxState,
      hasReciprocity: reciprocity.hasReciprocity,
      explanation: reciprocity.explanation
    };
  }
  
  /**
   * Get Year-to-Date wages for Social Security wage base tracking
   * Sums gross pay from all approved/paid payroll entries for the employee in the given year
   * 
   * @param employeeId - The employee ID to query
   * @param year - The calendar year to sum wages for
   * @returns Promise<number> - The total YTD gross wages subject to SS
   */
  static async getSocialSecurityYtdWages(employeeId: string, year: number): Promise<number> {
    const yearStart = startOfYear(new Date(year, 0, 1));
    const yearEnd = endOfYear(new Date(year, 0, 1));
    
    // Query payroll entries joined with payroll runs to filter by year and status
    // Only count approved or paid payroll runs (not draft or pending)
    const result = await db
      .select({
        totalGrossPay: sql<string>`COALESCE(SUM(${payrollEntries.grossPay}), 0)`
      })
      .from(payrollEntries)
      .innerJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))
      .where(
        and(
          eq(payrollEntries.employeeId, employeeId),
          gte(payrollRuns.periodEnd, yearStart),
          lte(payrollRuns.periodEnd, yearEnd),
          inArray(payrollRuns.status, ['approved', 'paid'])
        )
      );
    
    const ytdWages = parseFloat(result[0]?.totalGrossPay || '0');
    return ytdWages;
  }
  
  /**
   * Calculate Social Security (6.2% up to wage base $168,600)
   * Implements YTD wage base tracking to stop withholding once annual limit is reached
   * 
   * @param grossPay - Current period gross pay
   * @param ytdWages - Year-to-date wages already subject to SS (default 0 for backward compatibility)
   * @returns The Social Security tax amount to withhold
   */
  static calculateSocialSecurity(grossPay: number, ytdWages: number = 0): number {
    const SS_RATE = 0.062;
    const WAGE_BASE = 168600; // 2024 wage base
    
    // If YTD wages already exceed the wage base, no SS tax due
    if (ytdWages >= WAGE_BASE) {
      return 0;
    }
    
    // Calculate taxable wages for this period (capped at remaining room under wage base)
    const taxableWages = Math.min(grossPay, Math.max(0, WAGE_BASE - ytdWages));
    
    return parseFloat((taxableWages * SS_RATE).toFixed(2));
  }
  
  /**
   * Calculate Medicare tax including Additional Medicare Tax
   * - Regular Medicare: 1.45% on all wages (no limit)
   * - Additional Medicare Tax: 0.9% on wages over $200,000 (single) or $250,000 (married)
   * 
   * @param grossPay - Current period gross pay
   * @param ytdWages - Year-to-date wages for threshold tracking (default 0)
   * @param filingStatus - 'single', 'married', or 'head_of_household' (default 'single')
   * @returns Total Medicare tax including Additional Medicare Tax if applicable
   */
  static calculateMedicare(
    grossPay: number, 
    ytdWages: number = 0,
    filingStatus: string = 'single'
  ): number {
    const MEDICARE_RATE = 0.0145;
    const ADDITIONAL_MEDICARE_RATE = 0.009; // 0.9% additional tax
    
    // Additional Medicare Tax thresholds by filing status
    const thresholds: Record<string, number> = {
      'single': 200000,
      'head_of_household': 200000,
      'married': 250000,
      'married_filing_separately': 125000,
    };
    
    const threshold = thresholds[filingStatus] || 200000;
    
    // Regular Medicare tax on all wages
    let medicareTax = Number(multiplyFinancialValues(toFinancialString(grossPay), toFinancialString(MEDICARE_RATE)));
    
    // Calculate Additional Medicare Tax on wages exceeding threshold
    const totalWagesWithCurrent = ytdWages + grossPay;
    
    if (totalWagesWithCurrent > threshold) {
      // Calculate how much of this period's pay is subject to additional tax
      const amountOverThreshold = Math.max(0, totalWagesWithCurrent - threshold);
      const priorAmountOverThreshold = Math.max(0, ytdWages - threshold);
      const taxableThisPeriod = amountOverThreshold - priorAmountOverThreshold;
      
      if (taxableThisPeriod > 0) {
        const additionalTax = Number(multiplyFinancialValues(toFinancialString(taxableThisPeriod), toFinancialString(ADDITIONAL_MEDICARE_RATE)));
        medicareTax += additionalTax;
        log.info(`[AI Payroll™] Additional Medicare Tax: $${additionalTax.toFixed(2)} on $${taxableThisPeriod.toFixed(2)} exceeding $${threshold} threshold`);
      }
    }
    
    return parseFloat(medicareTax.toFixed(2));
  }
  
  /**
   * Calculate Federal Unemployment Tax (FUTA) - EMPLOYER TAX
   * - 6.0% on first $7,000 of wages per employee per year
   * - Most employers get a 5.4% credit for paying state unemployment taxes
   * - Effective rate is typically 0.6% on first $7,000
   * 
   * @param grossPay - Current period gross pay
   * @param ytdWages - Year-to-date wages for threshold tracking
   * @param hasStateTaxCredit - Whether employer qualifies for state credit (default true)
   * @returns FUTA tax amount (employer cost, not deducted from employee)
   */
  static calculateFUTA(
    grossPay: number,
    ytdWages: number = 0,
    hasStateTaxCredit: boolean = true
  ): number {
    const FUTA_WAGE_BASE = 7000;
    const FUTA_RATE = 0.06; // 6.0% base rate
    const STATE_CREDIT = 0.054; // 5.4% credit for paying SUTA
    
    // Effective rate after state credit
    const effectiveRate = hasStateTaxCredit ? (FUTA_RATE - STATE_CREDIT) : FUTA_RATE;
    
    // If YTD wages already exceed the wage base, no FUTA due
    if (ytdWages >= FUTA_WAGE_BASE) {
      return 0;
    }
    
    // Calculate taxable wages for this period
    const taxableWages = Math.min(grossPay, Math.max(0, FUTA_WAGE_BASE - ytdWages));
    
    return parseFloat((taxableWages * effectiveRate).toFixed(2));
  }

  /**
   * Calculate State Unemployment Tax (SUTA) - EMPLOYER TAX
   * Rates vary by state and employer experience rating
   * 
   * @param grossPay - Current period gross pay
   * @param ytdWages - Year-to-date wages for threshold tracking
   * @param state - State code for rate lookup
   * @param experienceRate - Employer's experience-rated SUTA rate (default varies by state)
   * @returns SUTA tax amount (employer cost, not deducted from employee)
   */
  static calculateSUTA(
    grossPay: number,
    ytdWages: number = 0,
    state: string = 'CA',
    experienceRate?: number
  ): number {
    // SUTA wage bases and new employer rates by state (2024)
    const sutaConfig: Record<string, { wageBase: number; newEmployerRate: number; minRate: number; maxRate: number }> = {
      'AL': { wageBase: 8000, newEmployerRate: 0.027, minRate: 0.006, maxRate: 0.068 },
      'AK': { wageBase: 47100, newEmployerRate: 0.012, minRate: 0.01, maxRate: 0.054 },
      'AZ': { wageBase: 8000, newEmployerRate: 0.02, minRate: 0.0008, maxRate: 0.077 },
      'AR': { wageBase: 7000, newEmployerRate: 0.031, minRate: 0.01, maxRate: 0.12 },
      'CA': { wageBase: 7000, newEmployerRate: 0.034, minRate: 0.015, maxRate: 0.068 },
      'CO': { wageBase: 20400, newEmployerRate: 0.017, minRate: 0.0, maxRate: 0.058 },
      'CT': { wageBase: 25000, newEmployerRate: 0.03, minRate: 0.01, maxRate: 0.069 },
      'DE': { wageBase: 10500, newEmployerRate: 0.018, minRate: 0.001, maxRate: 0.08 },
      'FL': { wageBase: 7000, newEmployerRate: 0.027, minRate: 0.001, maxRate: 0.054 },
      'GA': { wageBase: 9500, newEmployerRate: 0.027, minRate: 0.005, maxRate: 0.054 },
      'HI': { wageBase: 56700, newEmployerRate: 0.03, minRate: 0.0, maxRate: 0.054 },
      'ID': { wageBase: 49900, newEmployerRate: 0.01, minRate: 0.002, maxRate: 0.052 },
      'IL': { wageBase: 13271, newEmployerRate: 0.035, minRate: 0.006, maxRate: 0.067 },
      'IN': { wageBase: 9500, newEmployerRate: 0.025, minRate: 0.005, maxRate: 0.075 },
      'IA': { wageBase: 36100, newEmployerRate: 0.01, minRate: 0.0, maxRate: 0.07 },
      'KS': { wageBase: 14000, newEmployerRate: 0.027, minRate: 0.001, maxRate: 0.075 },
      'KY': { wageBase: 11400, newEmployerRate: 0.027, minRate: 0.003, maxRate: 0.09 },
      'LA': { wageBase: 7700, newEmployerRate: 0.02, minRate: 0.001, maxRate: 0.06 },
      'ME': { wageBase: 12000, newEmployerRate: 0.0238, minRate: 0.0005, maxRate: 0.054 },
      'MD': { wageBase: 8500, newEmployerRate: 0.024, minRate: 0.003, maxRate: 0.075 },
      'MA': { wageBase: 15000, newEmployerRate: 0.027, minRate: 0.006, maxRate: 0.083 },
      'MI': { wageBase: 9500, newEmployerRate: 0.027, minRate: 0.001, maxRate: 0.1085 },
      'MN': { wageBase: 40000, newEmployerRate: 0.01, minRate: 0.001, maxRate: 0.09 },
      'MS': { wageBase: 14000, newEmployerRate: 0.01, minRate: 0.0, maxRate: 0.055 },
      'MO': { wageBase: 10500, newEmployerRate: 0.027, minRate: 0.0, maxRate: 0.09 },
      'MT': { wageBase: 40500, newEmployerRate: 0.013, minRate: 0.0, maxRate: 0.062 },
      'NE': { wageBase: 9000, newEmployerRate: 0.02, minRate: 0.0, maxRate: 0.054 },
      'NV': { wageBase: 40100, newEmployerRate: 0.0295, minRate: 0.0025, maxRate: 0.054 },
      'NH': { wageBase: 14000, newEmployerRate: 0.027, minRate: 0.001, maxRate: 0.075 },
      'NJ': { wageBase: 42300, newEmployerRate: 0.028, minRate: 0.005, maxRate: 0.0575 },
      'NM': { wageBase: 30100, newEmployerRate: 0.01, minRate: 0.003, maxRate: 0.054 },
      'NY': { wageBase: 12500, newEmployerRate: 0.035, minRate: 0.006, maxRate: 0.079 },
      'NC': { wageBase: 29600, newEmployerRate: 0.01, minRate: 0.001, maxRate: 0.056 },
      'ND': { wageBase: 40000, newEmployerRate: 0.0107, minRate: 0.0017, maxRate: 0.0954 },
      'OH': { wageBase: 9000, newEmployerRate: 0.027, minRate: 0.003, maxRate: 0.09 },
      'OK': { wageBase: 27000, newEmployerRate: 0.01, minRate: 0.001, maxRate: 0.055 },
      'OR': { wageBase: 52800, newEmployerRate: 0.024, minRate: 0.007, maxRate: 0.054 },
      'PA': { wageBase: 10000, newEmployerRate: 0.0307, minRate: 0.004, maxRate: 0.1017 },
      'RI': { wageBase: 29200, newEmployerRate: 0.011, minRate: 0.009, maxRate: 0.095 },
      'SC': { wageBase: 14000, newEmployerRate: 0.006, minRate: 0.0006, maxRate: 0.054 },
      'SD': { wageBase: 15000, newEmployerRate: 0.01, minRate: 0.0, maxRate: 0.095 },
      'TN': { wageBase: 7000, newEmployerRate: 0.027, minRate: 0.001, maxRate: 0.1 },
      'TX': { wageBase: 9000, newEmployerRate: 0.027, minRate: 0.001, maxRate: 0.062 },
      'UT': { wageBase: 44800, newEmployerRate: 0.011, minRate: 0.001, maxRate: 0.073 },
      'VT': { wageBase: 16100, newEmployerRate: 0.01, minRate: 0.006, maxRate: 0.08 },
      'VA': { wageBase: 8000, newEmployerRate: 0.0258, minRate: 0.001, maxRate: 0.065 },
      'WA': { wageBase: 67600, newEmployerRate: 0.013, minRate: 0.0, maxRate: 0.054 },
      'WV': { wageBase: 9000, newEmployerRate: 0.027, minRate: 0.015, maxRate: 0.085 },
      'WI': { wageBase: 14000, newEmployerRate: 0.032, minRate: 0.0, maxRate: 0.108 },
      'WY': { wageBase: 30900, newEmployerRate: 0.0092, minRate: 0.0015, maxRate: 0.081 },
      'DC': { wageBase: 9000, newEmployerRate: 0.027, minRate: 0.014, maxRate: 0.07 },
    };
    
    const stateCode = state.toUpperCase();
    const config = sutaConfig[stateCode] || sutaConfig['CA'];
    
    // Use provided experience rate or default to new employer rate
    const rate = experienceRate !== undefined ? experienceRate : config.newEmployerRate;
    
    // Clamp rate within state min/max bounds
    const clampedRate = Math.max(config.minRate, Math.min(rate, config.maxRate));
    
    // If YTD wages already exceed the wage base, no SUTA due
    if (ytdWages >= config.wageBase) {
      return 0;
    }
    
    // Calculate taxable wages for this period
    const taxableWages = Math.min(grossPay, Math.max(0, config.wageBase - ytdWages));
    
    return parseFloat((taxableWages * clampedRate).toFixed(2));
  }

  /**
   * Calculate overtime (1.5x after 40 hours per week)
   * For state-specific daily overtime rules, use calculateStateOvertimeHours instead
   */
  static calculateOvertimeHours(totalHours: number): { regular: number; overtime: number } {
    const OVERTIME_THRESHOLD = 40;

    if (totalHours <= OVERTIME_THRESHOLD) {
      return { regular: totalHours, overtime: 0 };
    }

    return {
      regular: OVERTIME_THRESHOLD,
      overtime: totalHours - OVERTIME_THRESHOLD
    };
  }

  /**
   * State-specific overtime rules configuration
   * California and some other states have daily overtime requirements
   */
  private static readonly STATE_OVERTIME_RULES: Record<string, {
    dailyThreshold?: number;       // Hours before daily OT (CA: 8)
    dailyDoubleThreshold?: number; // Hours before double time (CA: 12)
    weeklyThreshold: number;       // Hours before weekly OT (default: 40)
    seventhDayOT?: boolean;        // 7th consecutive day rules (CA: true)
  }> = {
    // California - strictest overtime rules
    'CA': {
      dailyThreshold: 8,
      dailyDoubleThreshold: 12,
      weeklyThreshold: 40,
      seventhDayOT: true,
    },
    // Colorado - daily overtime after 12 hours
    'CO': {
      dailyThreshold: 12,
      weeklyThreshold: 40,
    },
    // Nevada - daily overtime after 8 hours (if employer has 50+ employees)
    'NV': {
      dailyThreshold: 8,
      weeklyThreshold: 40,
    },
    // Alaska - daily overtime after 8 hours
    'AK': {
      dailyThreshold: 8,
      weeklyThreshold: 40,
    },
    // Default federal rules (most states)
    'DEFAULT': {
      weeklyThreshold: 40,
    },
  };

  /**
   * Calculate state-specific overtime including daily overtime rules
   * Critical for California compliance (daily OT after 8 hours, double time after 12)
   *
   * @param dailyHours - Array of hours worked each day of the week (7 elements)
   * @param state - State code for overtime rules lookup
   * @returns Detailed overtime breakdown including regular, overtime, and double time
   */
  static calculateStateOvertimeHours(
    dailyHours: number[],
    state: string = 'DEFAULT'
  ): {
    regular: number;
    overtime: number;        // 1.5x rate
    doubleTime: number;      // 2.0x rate
    totalHours: number;
    weeklyOvertimeHours: number;
    dailyOvertimeHours: number;
    explanation: string;
  } {
    const stateCode = state.toUpperCase();
    const rules = this.STATE_OVERTIME_RULES[stateCode] || this.STATE_OVERTIME_RULES['DEFAULT'];

    const totalHours = dailyHours.reduce((sum, h) => sum + h, 0);
    let regularHours = 0;
    let dailyOT = 0;
    let dailyDT = 0;

    // Step 1: Calculate daily overtime (if state requires it)
    if (rules.dailyThreshold) {
      for (let i = 0; i < dailyHours.length; i++) {
        const dayHours = dailyHours[i];
        const isSeventhDay = i === 6 && rules.seventhDayOT;

        if (isSeventhDay) {
          // California 7th consecutive day rules:
          // - First 8 hours at 1.5x
          // - Hours over 8 at 2.0x
          if (dayHours <= 8) {
            dailyOT += dayHours;
          } else {
            dailyOT += 8;
            dailyDT += dayHours - 8;
          }
        } else if (rules.dailyDoubleThreshold && dayHours > rules.dailyDoubleThreshold) {
          // Double time for hours over 12 (CA)
          regularHours += rules.dailyThreshold;
          dailyOT += rules.dailyDoubleThreshold - rules.dailyThreshold;
          dailyDT += dayHours - rules.dailyDoubleThreshold;
        } else if (dayHours > rules.dailyThreshold) {
          // Overtime for hours over 8 but under 12
          regularHours += rules.dailyThreshold;
          dailyOT += dayHours - rules.dailyThreshold;
        } else {
          regularHours += dayHours;
        }
      }
    } else {
      // No daily overtime - all hours go to regular (subject to weekly threshold)
      regularHours = totalHours;
    }

    // Step 2: Calculate weekly overtime (if applicable)
    // In CA, daily OT counts toward the 40-hour threshold, but we don't double-count
    let weeklyOT = 0;

    if (!rules.dailyThreshold) {
      // Federal rules: simple 40-hour weekly threshold
      if (totalHours > rules.weeklyThreshold) {
        weeklyOT = totalHours - rules.weeklyThreshold;
        regularHours = rules.weeklyThreshold;
      }
    } else {
      // State with daily OT: weekly threshold applies to remaining regular hours
      // If regular hours exceed weekly threshold, convert excess to OT
      if (regularHours > rules.weeklyThreshold) {
        weeklyOT = regularHours - rules.weeklyThreshold;
        regularHours = rules.weeklyThreshold;
      }
    }

    // Combine daily and weekly overtime (don't double-count)
    const totalOT = dailyOT + weeklyOT;
    const totalDT = dailyDT;

    // Build explanation
    let explanation = `Total ${totalHours.toFixed(1)} hrs: `;
    explanation += `${regularHours.toFixed(1)} regular`;
    if (totalOT > 0) explanation += `, ${totalOT.toFixed(1)} OT (1.5x)`;
    if (totalDT > 0) explanation += `, ${totalDT.toFixed(1)} DT (2x)`;
    if (rules.dailyThreshold) {
      explanation += ` [${stateCode} daily OT rules applied]`;
    }

    log.info(`[AI Payroll] ${stateCode} Overtime: ${explanation}`);

    return {
      regular: parseFloat(regularHours.toFixed(2)),
      overtime: parseFloat(totalOT.toFixed(2)),
      doubleTime: parseFloat(totalDT.toFixed(2)),
      totalHours: parseFloat(totalHours.toFixed(2)),
      weeklyOvertimeHours: parseFloat(weeklyOT.toFixed(2)),
      dailyOvertimeHours: parseFloat(dailyOT.toFixed(2)),
      explanation,
    };
  }

  /**
   * Get overtime rules for a state
   */
  static getStateOvertimeRules(state: string): {
    hasDailyOT: boolean;
    dailyThreshold?: number;
    hasDoubleTime: boolean;
    doubleTimeThreshold?: number;
    weeklyThreshold: number;
    hasSeventhDayRules: boolean;
  } {
    const rules = this.STATE_OVERTIME_RULES[state.toUpperCase()] || this.STATE_OVERTIME_RULES['DEFAULT'];
    return {
      hasDailyOT: !!rules.dailyThreshold,
      dailyThreshold: rules.dailyThreshold,
      hasDoubleTime: !!rules.dailyDoubleThreshold,
      doubleTimeThreshold: rules.dailyDoubleThreshold,
      weeklyThreshold: rules.weeklyThreshold,
      hasSeventhDayRules: !!rules.seventhDayOT,
    };
  }

  /**
   * Calculate FLSA-compliant weighted average overtime for multi-rate employees
   * 
   * When an employee works at multiple pay rates within the same workweek,
   * FLSA requires overtime to be calculated using a weighted average of all rates.
   * 
   * Formula:
   * 1. Calculate total straight-time earnings (sum of hours × rate for each job)
   * 2. Calculate total hours worked
   * 3. Weighted average rate = Total Straight-Time Earnings / Total Hours
   * 4. OT Premium = (Weighted Average Rate × 0.5) × OT Hours (the "half-time" method)
   *    OR Regular OT = Weighted Average Rate × 1.5 × OT Hours
   * 
   * @param rateHours - Array of {rate, hours} for each different pay rate worked
   * @param weeklyThreshold - Weekly overtime threshold (default 40)
   * @returns FLSA-compliant pay breakdown with weighted average OT
   */
  static calculateFLSAWeightedAverageOvertime(
    rateHours: Array<{ rate: number; hours: number }>,
    weeklyThreshold: number = 40
  ): {
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    straightTimePay: number;
    weightedAverageRate: number;
    overtimePremium: number;
    totalPay: number;
    rateBreakdown: Array<{ rate: number; hours: number; pay: number }>;
  } {
    // Calculate totals across all rates
    const totalHours = rateHours.reduce((sum, rh) => sum + rh.hours, 0);
    const straightTimePay = rateHours.reduce((sum, rh) => sum + (rh.rate * rh.hours), 0);
    
    // Calculate weighted average rate
    const weightedAverageRate = totalHours > 0 ? straightTimePay / totalHours : 0;
    
    // Determine regular and overtime hours
    const regularHours = Math.min(totalHours, weeklyThreshold);
    const overtimeHours = Math.max(0, totalHours - weeklyThreshold);
    
    // Calculate overtime premium using "half-time" method
    // This is the FLSA-approved method: pay straight time for all hours,
    // then add 0.5x the weighted average rate for each OT hour
    const overtimePremium = Number(multiplyFinancialValues(toFinancialString(overtimeHours), toFinancialString(Number(multiplyFinancialValues(toFinancialString(weightedAverageRate), toFinancialString(0.5))))));
    
    // Total pay = straight time pay + OT premium
    const totalPay = straightTimePay + overtimePremium;
    
    // Build rate breakdown for audit trail
    const rateBreakdown = rateHours.map(rh => ({
      rate: rh.rate,
      hours: rh.hours,
      pay: rh.rate * rh.hours,
    }));
    
    log.info(`[AI Payroll™] FLSA Weighted Average OT: ${totalHours} hrs across ${rateHours.length} rates, ` +
      `WAR=$${weightedAverageRate.toFixed(2)}/hr, OT Premium=$${overtimePremium.toFixed(2)}`);
    
    return {
      totalHours: parseFloat(totalHours.toFixed(2)),
      regularHours: parseFloat(regularHours.toFixed(2)),
      overtimeHours: parseFloat(overtimeHours.toFixed(2)),
      straightTimePay: parseFloat(straightTimePay.toFixed(2)),
      weightedAverageRate: parseFloat(weightedAverageRate.toFixed(2)),
      overtimePremium: parseFloat(overtimePremium.toFixed(2)),
      totalPay: parseFloat(totalPay.toFixed(2)),
      rateBreakdown,
    };
  }

  /**
   * Detect if an employee has multiple pay rates in their time entries
   * Returns true if employee worked at more than one distinct rate
   */
  static hasMultiplePayRates(entries: Array<{ payRate: number }>): boolean {
    const uniqueRates = new Set(entries.map(e => e.payRate));
    return uniqueRates.size > 1;
  }

  /**
   * Aggregate hours by pay rate for FLSA weighted average calculation
   */
  static aggregateHoursByRate(
    entries: Array<{ payRate: number; totalHours: number }>
  ): Array<{ rate: number; hours: number }> {
    const rateMap = new Map<number, number>();
    
    for (const entry of entries) {
      const currentHours = rateMap.get(entry.payRate) || 0;
      rateMap.set(entry.payRate, currentHours + entry.totalHours);
    }
    
    return Array.from(rateMap.entries()).map(([rate, hours]) => ({
      rate,
      hours,
    }));
  }

  /**
   * Calculate local/city withholding tax - EMPLOYEE TAX
   * Some cities and localities require income tax withholding
   * 
   * @param grossPay - Current period gross pay
   * @param locality - City or locality code (e.g., 'NYC', 'PHL', 'DET')
   * @param workLocation - Work location (for work-location-based localities)
   * @param residenceLocation - Residence location (for residence-based localities)
   * @returns Local tax withholding amount
   */
  static calculateLocalWithholding(
    grossPay: number,
    locality: string = '',
    workLocation?: string,
    residenceLocation?: string
  ): number {
    const rules = getTaxRules();
    const localTaxConfig = rules.localTaxRules;
    
    const localityCode = locality.toUpperCase().replace(/\s+/g, '_');
    const config = localTaxConfig[localityCode];
    
    if (!config) {
      return 0; // No local tax for unknown localities
    }
    
    // Apply tax based on type
    const effectiveLocality = workLocation?.toUpperCase().replace(/\s+/g, '_') || residenceLocation?.toUpperCase().replace(/\s+/g, '_') || localityCode;
    
    switch (config.type) {
      case 'resident':
        // Only applies if employee is a resident
        if (residenceLocation?.toUpperCase().replace(/\s+/g, '_') === localityCode) {
          return parseFloat((grossPay * config.rate).toFixed(2));
        }
        return 0;
        
      case 'worker':
        // Applies to anyone working in the locality
        if (workLocation?.toUpperCase().replace(/\s+/g, '_') === localityCode) {
          return parseFloat((grossPay * config.rate).toFixed(2));
        }
        return 0;
        
      case 'both':
        // Applies to both residents and workers
        return parseFloat((grossPay * config.rate).toFixed(2));
        
      default:
        return 0;
    }
  }

  /**
   * Get list of supported local tax jurisdictions
   */
  static getLocalTaxJurisdictions(): Array<{ code: string; name: string; state: string; rate: number }> {
    return [
      { code: 'NYC', name: 'New York City', state: 'NY', rate: 0.03876 },
      { code: 'PHL', name: 'Philadelphia', state: 'PA', rate: 0.03828 },
      { code: 'CLEVELAND', name: 'Cleveland', state: 'OH', rate: 0.025 },
      { code: 'DETROIT', name: 'Detroit', state: 'MI', rate: 0.024 },
      { code: 'LOUISVILLE', name: 'Louisville', state: 'KY', rate: 0.0285 },
      { code: 'COLUMBUS', name: 'Columbus', state: 'OH', rate: 0.025 },
      { code: 'PITTSBURGH', name: 'Pittsburgh', state: 'PA', rate: 0.03 },
      { code: 'STLOUIS', name: 'St. Louis City', state: 'MO', rate: 0.01 },
      { code: 'BALTIMORE_CITY', name: 'Baltimore City', state: 'MD', rate: 0.032 },
      { code: 'WILMINGTON', name: 'Wilmington', state: 'DE', rate: 0.0125 },
    ];
  }

  /**
   * Calculate pre-tax deductions for an employee
   * Includes: 401k, health insurance, HSA, FSA, etc.
   * These reduce taxable income before federal/state/SS/Medicare calculations
   */
  static async getPreTaxDeductions(employeeId: string, payPeriodEnd: Date): Promise<number> {
    const [result] = await db
      .select({ total: sql<string>`COALESCE(SUM(CAST(${payrollDeductions.amount} AS FLOAT)), 0)` })
      .from(payrollDeductions)
      .where(and(
        eq(payrollDeductions.employeeId, employeeId),
        sql`${payrollDeductions.workspaceId} IS NOT NULL`,
        eq(payrollDeductions.isPreTax, true)
      ));
    
    const total = parseFloat(result?.total || '0');
    return parseFloat(total.toFixed(2));
  }

  /**
   * Calculate currency exchange amount for multi-currency support
   * Supports converting between USD and other currencies
   */
  static convertCurrency(amount: number, fromCurrency: string = 'USD', toCurrency: string = 'USD'): number {
    if (fromCurrency === toCurrency) return amount;
    
    // Simple exchange rates (in production, fetch from external service)
    const exchangeRates: Record<string, number> = {
      'USD': 1.0,
      'EUR': 0.92,
      'GBP': 0.79,
      'CAD': 1.36,
      'AUD': 1.52,
      'JPY': 149.5,
      'INR': 83.12,
    };
    
    const fromRate = exchangeRates[fromCurrency] || 1.0;
    const toRate = exchangeRates[toCurrency] || 1.0;
    
    return parseFloat((amount * (toRate / fromRate)).toFixed(2));
  }

  /**
   * Lookup tax jurisdiction by geographic coordinates
   * Returns state/province for tax calculation purposes
   */
  static getTaxJurisdictionByLocation(latitude: number, longitude: number): string {
    // Simplified mapping - in production use geocoding API
    // For now, return CA as default
    // This would use Google Maps or similar to convert lat/lng to state
    log.info(`[Payroll] Tax jurisdiction lookup for ${latitude}, ${longitude}`);
    return 'CA';
  }
  
  /**
   * Process payroll for a workspace - FULLY AUTOMATED
   */
  static async processAutomatedPayroll(
    workspaceId: string, 
    userId: string,
    customPeriodStart?: Date,
    customPeriodEnd?: Date
  ): Promise<{
    payrollRunId: string;
    totalEmployees: number;
    totalGrossPay: number;
    totalNetPay: number;
    calculations: PayrollCalculation[];
    timeEntryIds: string[];
    warnings: string[];
  }> {
    // Get workspace pay schedule — read from billingSettingsBlob.payrollCycle (canonical source)
    const workspace = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    const blob = (workspace[0]?.billingSettingsBlob as Record<string, any>) || {};
    const paySchedule: string = blob.payrollCycle || workspace[0]?.payrollSchedule || 'bi-weekly';

    // Use custom period dates if provided, otherwise auto-detect
    const payPeriod = (customPeriodStart && customPeriodEnd)
      ? { start: customPeriodStart, end: customPeriodEnd, type: paySchedule as 'weekly' | 'bi-weekly' | 'monthly' }
      : this.detectPayPeriod(paySchedule);
    
    // Get all active employees
    const activeEmployees = await db
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, workspaceId),
          eq(employees.isActive, true)
        )
      );
    
    // Use production aggregator for FLSA-compliant payroll calculation
    const aggregationResult = await aggregatePayrollHours({
      workspaceId,
      startDate: payPeriod.start,
      endDate: payPeriod.end,
    });
    
    // Log warnings for human review (surfaced in payroll review dashboard)
    if (aggregationResult.warnings.length > 0) {
      log.warn('[AI Payroll™] Payroll hours aggregation warnings:', aggregationResult.warnings);
    }
    
    // Fail early if no employees to process (prevent empty payroll runs)
    if (aggregationResult.employeeSummaries.length === 0) {
      log.warn('[AI Payroll™] No employees with approved hours for period:', payPeriod);
      throw new Error('No employees with approved time entries found for payroll period');
    }
    
    const calculations: PayrollCalculation[] = [];
    let totalGrossPay = 0;
    let totalNetPay = 0;
    let totalActualTaxes = 0;
    
    // Collect all time entry IDs for marking as payrolled after approval
    const allTimeEntryIds: string[] = [];
    const allWarnings = [...aggregationResult.warnings];
    const allErrors: string[] = []; // GAP-RATE-2: Explicit hard-block errors (zero-rate, invalid data)
    // Track manually-edited entries per employee for payroll audit notes
    const manualEditNotesMap = new Map<string, string>();
    const zeroRateEmployees: Array<{ employeeId: string; employeeName: string; hours: number }> = [];
    
    // Get the year from the pay period end date for YTD wage base calculations
    const payrollYear = payPeriod.end.getFullYear();
    
    // Process each employee's payroll summary from aggregator
    for (const employeeSummary of aggregationResult.employeeSummaries) {
      // Use aggregator's FLSA-compliant hour calculations
      const regularHours = employeeSummary.totalRegularHours;
      const overtimeHours = employeeSummary.totalOvertimeHours;
      const holidayHours = employeeSummary.totalHolidayHours;
      
      // Use aggregator's calculated pay amounts (preserves mixed-rate accuracy)
      const grossPay = employeeSummary.grossPay;
      
      // Calculate weighted average hourly rate for display
      // Use equivalent hours for proper weighting (regular + 1.5*OT + 2*holiday)
      const equivalentHours = regularHours + (overtimeHours * 1.5) + (holidayHours * 2.0);
      const hourlyRate = equivalentHours > 0 ? grossPay / equivalentHours : 0;
      
      // Validate rate calculation - warn if grossPay is 0 but hours exist
      if (grossPay === 0 && (regularHours > 0 || overtimeHours > 0 || holidayHours > 0)) {
        const totalHours = regularHours + overtimeHours + holidayHours;
        const warning = `Employee ${employeeSummary.employeeName} has ${totalHours} hours but $0 gross pay - missing pay rates`;
        allWarnings.push(warning);
        log.warn(`[AI Payroll™] ${warning}`);
        
        // GAP-RATE-2 FIX: Zero-rate officers produce a hard block surfaced as an explicit error
        // (not just a warning). Tracked in both zeroRateEmployees (for UI) and allErrors (for callers).
        zeroRateEmployees.push({
          employeeId: employeeSummary.employeeId,
          employeeName: employeeSummary.employeeName,
          hours: totalHours,
        });
        allErrors.push(`BLOCKED: ${employeeSummary.employeeName} (${totalHours} hrs) has no pay rate — stub not generated, hours kept unpayrolled for manager correction`);

        // CANONICAL: publish() so TrinityPayrollZeroRateBlocker subscriber fires and alerts managers
        platformEventBus.publish({
          type: 'payroll_zero_rate_detected',
          category: 'payroll',
          title: 'Payroll Zero Rate Detected',
          description: `${employeeSummary.employeeName} has ${totalHours} hours but $0 gross pay — missing pay rates`,
          workspaceId,
          metadata: {
            employeeId: employeeSummary.employeeId,
            employeeName: employeeSummary.employeeName,
            hours: totalHours,
            affectedEmployeeIds: [employeeSummary.employeeId],
            employeeCount: 1,
          },
        }).catch((err: any) => log.warn('[PayrollAuto] payroll_zero_rate_detected publish failed (non-blocking):', err.message));
        // CRITICAL: Skip this employee entirely — do NOT create a $0 payroll entry and do NOT
        // mark their time entries as payrolled. Hours stay unpayrolled so a manager can set
        // the correct rate and re-run payroll. Creating a $0 entry would permanently orphan
        // those hours since payrolledAt would be set and they'd be excluded from future runs.
        continue;
      }
      
      // Fetch YTD wages for Social Security wage base tracking
      const ytdWages = await this.getSocialSecurityYtdWages(employeeSummary.employeeId, payrollYear);

      // Fetch employee payroll info for accurate W-4 filing status (F059 fix)
      const empPayrollInfo = await db.query.employeePayrollInfo.findFirst({
        where: and(
          eq(employeePayrollInfo.employeeId, employeeSummary.employeeId),
          eq(employeePayrollInfo.workspaceId, workspaceId)
        ),
      });
      
      // Log when employee has reached the SS wage base limit
      const SS_WAGE_BASE = 168600;
      if (ytdWages >= SS_WAGE_BASE) {
        log.info(`[AI Payroll™] Employee ${employeeSummary.employeeId} has reached SS wage base limit — no SS withholding this period`);
      } else if (ytdWages + grossPay > SS_WAGE_BASE) {
        const taxableThisPeriod = SS_WAGE_BASE - ytdWages;
        log.info(`[AI Payroll™] Employee ${employeeSummary.employeeId} will reach SS wage base limit this period (partial withholding applies)`);
      }
      
      // Fetch employee benefit deductions from database
      const deductions = await this.getEmployeeDeductions(
        employeeSummary.employeeId,
        grossPay,
        payPeriod.type
      );
      
      // Calculate taxable gross (gross - pre-tax deductions)
      const taxableGrossPay = grossPay - deductions.preTax;
      
      // 1099 Contractors: NO tax withholding — straight pay, contractor handles own taxes
      const isContractor = employeeSummary.workerType === 'contractor';
      
      let federalTax = 0;
      let stateTax = 0;
      let socialSecurity = 0;
      let medicare = 0;
      
      if (isContractor) {
        log.info(`[AI Payroll™] ${employeeSummary.employeeName} is a 1099 contractor — skipping all tax withholding (straight pay)`);

        // 1099-NEC $600 threshold tracking: flag if contractor reaches or exceeds $600 in calendar year
        try {
          const calendarYear = payPeriod.end.getFullYear();
          const ytdContractorPay = await PayrollAutomationEngine.getSocialSecurityYtdWages(
            employeeSummary.employeeId,
            calendarYear
          );
          const newYtdTotal = ytdContractorPay + grossPay;
          if (newYtdTotal >= 600) {
            const warning = `1099-NEC REQUIRED: Contractor ${employeeSummary.employeeName} has reached $${newYtdTotal.toFixed(2)} in calendar year ${calendarYear} (threshold: $600). Issue Form 1099-NEC by January 31.`;
            allWarnings.push(warning);
            log.warn(`[AI Payroll™] [1099-THRESHOLD] ${warning}`);
          } else if (newYtdTotal >= 500) {
            const warning = `1099-NEC APPROACHING: Contractor ${employeeSummary.employeeName} has $${newYtdTotal.toFixed(2)} YTD in ${calendarYear} — approaching $600 threshold.`;
            allWarnings.push(warning);
          }
        } catch (thresholdErr: any) {
          log.warn(`[AI Payroll™] 1099 threshold check failed for ${employeeSummary.employeeName}:`, thresholdErr.message);
        }
      } else {
        // W-2 Employee: Calculate taxes via canonical IRS Percentage Method (Pub 15-T)
        const ppMap: Record<string, TaxPayPeriod> = {
          'weekly': 'weekly',
          'bi-weekly': 'biweekly',
          'semi-monthly': 'semimonthly',
          'monthly': 'monthly',
          'daily': 'weekly', // daily workers annualized via weekly factor
        };
        const taxPayPeriod: TaxPayPeriod = ppMap[payPeriod.type] ?? 'biweekly';
        const employeeState = employeeSummary.employeeState || 'CA';

        // F059 fix: use employee's W-4 filing status instead of hardcoded 'single'
        const rawFilingStatus = (empPayrollInfo?.taxFilingStatus || 'single').toLowerCase().replace(/\s+/g, '_');
        const filingStatusMap: Record<string, TaxFilingStatus> = {
          'single': 'single',
          'married': 'married_jointly',
          'married_jointly': 'married_jointly',
          'married_filing_jointly': 'married_jointly',
          'married_separately': 'married_separately',
          'married_filing_separately': 'married_separately',
          'head_of_household': 'head_of_household',
        };
        const resolvedFilingStatus: TaxFilingStatus = filingStatusMap[rawFilingStatus] ?? 'single';

        const taxBreakdown = calculatePayrollTaxes({
          grossWage: taxableGrossPay,
          state: employeeState,
          payPeriod: taxPayPeriod,
          filingStatus: resolvedFilingStatus,
          ytdSocialSecurity: ytdWages,
        });
        federalTax = taxBreakdown.federalWithholding;
        // F058 fix: use progressive bracket engine for state tax instead of flat-rate approximation
        stateTax = PayrollAutomationEngine.calculateStateTax(taxableGrossPay, employeeState, payPeriod.type);
        socialSecurity = taxBreakdown.socialSecurity;
        medicare = taxBreakdown.medicare;
      }
      
      // Calculate net pay (gross - all deductions - taxes)
      // For 1099: netPay = grossPay (no taxes withheld, no pre/post-tax deductions apply)
      const totalTaxes = federalTax + stateTax + socialSecurity + medicare;
      let netPay = isContractor 
        ? grossPay 
        : grossPay - deductions.preTax - totalTaxes - deductions.postTax;

      // FIX [GAP-8 GARNISHMENTS AT CALCULATION TIME]: Query the payroll_garnishments table
      // for all active garnishments belonging to this employee in this workspace and apply
      // them now — before the net pay floor — so that a fresh payroll run automatically
      // reflects every court-ordered deduction without requiring a manual add-garnishment
      // call after the run is created.
      //
      // Garnishments are post-tax, post-benefit obligations (child support, tax levies, etc.)
      // and must be subtracted last, after all other deductions, to comply with CCPA limits.
      // The CCPA floor check (net pay >= 0) that follows will catch any case where the total
      // garnishment amount exceeds disposable earnings.
      const activeGarnishments = await db
        .select({ amount: payrollGarnishments.amount })
        .from(payrollGarnishments)
        .where(
          and(
            eq(payrollGarnishments.employeeId, employeeSummary.employeeId),
            eq(payrollGarnishments.workspaceId, workspaceId)
          )
        );

      const totalGarnishments = activeGarnishments.reduce(
        (sum, g) => sum + parseFloat(String(g.amount)),
        0
      );

      if (totalGarnishments > 0) {
        netPay -= totalGarnishments;
        allWarnings.push(
          `[GARNISHMENT_APPLIED] ${employeeSummary.employeeName} — ${activeGarnishments.length} active garnishment(s) totalling $${totalGarnishments.toFixed(2)} applied at calculation time.`
        );
      }

      // FIX [GAP-9 NET PAY FLOOR]: If deductions exceed gross pay the raw calculation
      // produces a negative net pay which would be stored in the DB and appear on the stub.
      // The execution layer already blocks payment for $0 entries, but the bad value still
      // reaches the DB and the pay stub. Apply the floor here at calculation time so the
      // stored payroll entry and every downstream artefact shows $0.00 — never negative.
      if (netPay < 0) {
        allWarnings.push(
          `[NET_PAY_FLOOR] ${employeeSummary.employeeName} — deductions ($${(grossPay - netPay).toFixed(2)}) exceed gross pay ($${grossPay.toFixed(2)}). Net pay floored at $0.00. Manual review required.`
        );
        netPay = 0;
      }
      
      if (deductions.details.length > 0) {
        log.info(`[AI Payroll™] ${employeeSummary.employeeName} deductions: Pre-tax $${deductions.preTax}, Post-tax $${deductions.postTax}`);
      }
      
      calculations.push({
        employeeId: employeeSummary.employeeId,
        employeeName: employeeSummary.employeeName,
        workerType: employeeSummary.workerType || 'employee',
        regularHours,
        overtimeHours,
        holidayHours,
        hourlyRate,
        grossPay: parseFloat(grossPay.toFixed(2)),
        preTaxDeductions: deductions.preTax,
        taxableGrossPay: parseFloat(taxableGrossPay.toFixed(2)),
        federalTax,
        stateTax,
        socialSecurity,
        medicare,
        postTaxDeductions: deductions.postTax,
        totalGarnishments: parseFloat(totalGarnishments.toFixed(2)),
        netPay: parseFloat(netPay.toFixed(2))
      });
      
      totalGrossPay += grossPay;
      totalNetPay += netPay;
      totalActualTaxes += totalTaxes;
      
      // Collect time entry IDs for marking as payrolled
      allTimeEntryIds.push(...employeeSummary.entries.map(e => e.timeEntryId));

      // Detect manually-edited entries — record in payroll audit notes so ledger is never blind
      const editedEntries = employeeSummary.entries.filter((e: any) => e.manuallyEdited);
      if (editedEntries.length > 0) {
        const reasons = editedEntries.map((e: any) => e.manualEditReason).filter(Boolean).join('; ');
        const note = reasons
          ? `AUDIT: ${editedEntries.length} time entr${editedEntries.length === 1 ? 'y was' : 'ies were'} manually corrected before payroll. Reason(s): ${reasons}`
          : `AUDIT: ${editedEntries.length} time entr${editedEntries.length === 1 ? 'y was' : 'ies were'} manually corrected before payroll.`;
        manualEditNotesMap.set(employeeSummary.employeeId, note);
      }
    }
    
    // C4: Double-payment prevention — hard-stop before opening the transaction.
    // assertNoPeriodOverlap throws if any employee already has an approved/paid entry
    // that overlaps the proposed pay period. This prevents concurrent runs and human errors.
    await assertNoPeriodOverlap(workspaceId, payPeriod.start, payPeriod.end);

    // Build worker-type breakdown for reporting (e.g. dashboard, Trinity insights)
    const workerTypeBreakdown = calculations.reduce((acc, calc) => {
      const type = calc.workerType || 'employee';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // C5: Wrap payroll run creation, payroll entries, and time entry marking in a single
    // atomic transaction. If any step fails, the entire payroll is rolled back —
    // no orphaned run records and no entries marked payrolled without a corresponding run.
    const payrollRun = await db.transaction(async (tx) => {
      const [run] = await tx
        .insert(payrollRuns)
        .values({
          workspaceId,
          periodStart: payPeriod.start,
          periodEnd: payPeriod.end,
          status: 'pending', // Requires 1% human QC approval
          runType: 'regular',
          isOffCycle: false,
          disbursementStatus: 'pending',
          workerTypeBreakdown,
          totalGrossPay: totalGrossPay.toFixed(2),
          totalTaxes: totalActualTaxes.toFixed(2),
          totalNetPay: totalNetPay.toFixed(2),
          processedBy: userId,
          processedAt: new Date()
        })
        .returning();

      // Create payroll entries for each employee
      for (const calc of calculations) {
        const manualEditNote = manualEditNotesMap.get(calc.employeeId);
        await tx.insert(payrollEntries).values({
          payrollRunId: run.id,
          employeeId: calc.employeeId,
          workspaceId,
          workerType: calc.workerType,
          isOffCycle: false,
          paidPeriodStart: payPeriod.start,
          paidPeriodEnd: payPeriod.end,
          regularHours: calc.regularHours.toFixed(2),
          overtimeHours: calc.overtimeHours.toFixed(2),
          holidayHours: calc.holidayHours.toFixed(2),
          hourlyRate: calc.hourlyRate.toFixed(2),
          grossPay: calc.grossPay.toFixed(2),
          federalTax: calc.federalTax.toFixed(2),
          stateTax: calc.stateTax.toFixed(2),
          socialSecurity: calc.socialSecurity.toFixed(2),
          medicare: calc.medicare.toFixed(2),
          netPay: calc.netPay.toFixed(2),
          // Phase 6: Calculation audit trail — inputs stored alongside output for dispute resolution
          calculationInputs: {
            regularHours: String(calc.regularHours),
            overtimeHours: String(calc.overtimeHours),
            holidayHours: String(calc.holidayHours),
            hourlyRate: String(calc.hourlyRate),
            overtimeMultiplier: '1.5',
            grossPay: String(calc.grossPay),
            preTaxDeductions: String(calc.preTaxDeductions),
            taxableGrossPay: String(calc.taxableGrossPay),
            federalTax: String(calc.federalTax),
            stateTax: String(calc.stateTax),
            socialSecurity: String(calc.socialSecurity),
            medicare: String(calc.medicare),
            postTaxDeductions: String(calc.postTaxDeductions),
            netPay: String(calc.netPay),
            calculatedAt: new Date().toISOString(),
            calculatorVersion: '1.0',
          },
          ...(manualEditNote ? { notes: manualEditNote } : {}),
        });
      }

      // Bulk-claim source time entries atomically via canonical claimer.
      // Uses tx so the claim rolls back with the run if anything else fails.
      if (allTimeEntryIds.length > 0) {
        const claimed = await claimPayrollTimeEntries({
          workspaceId,
          timeEntryIds: allTimeEntryIds,
          payrollRunId: run.id,
          requireAll: true,
          tx,
        });
        log.info(`[AI Payroll™] Claimed ${claimed.claimedCount}/${claimed.requestedCount} entries for run ${run.id} — within transaction`);
      }

      // FIX-3: Ledger write INSIDE the payroll transaction.
      // If this fails the entire payroll run rolls back — books always balance.
      const { writeLedgerEntry } = await import('./orgLedgerService');
      await writeLedgerEntry({
        workspaceId,
        entryType: 'payroll_processed',
        direction: 'credit',
        amount: parseFloat(totalNetPay.toFixed(2)),
        relatedEntityType: 'payroll_run',
        relatedEntityId: run.id,
        payrollRunId: run.id,
        description: `Payroll run ${run.id.substring(0, 8)} — ${calculations.length} employees, gross $${totalGrossPay.toFixed(2)}, net $${totalNetPay.toFixed(2)}`,
        metadata: { employeeCount: calculations.length, totalGrossPay: parseFloat(totalGrossPay.toFixed(2)), totalNetPay: parseFloat(totalNetPay.toFixed(2)) },
        tx,
      });

      return run;
    });

    // Audit trail: overtime was calculated from timesheet data (FLSA weekly
    // threshold = 40 hrs). Records per-employee regular/OT hour split and the
    // blended rate so future disputes can be reconstructed from the log alone.
    try {
      const { universalAudit } = await import('./universalAuditService');
      await universalAudit.log({
        workspaceId,
        actorId: userId || 'system',
        actorType: 'system',
        changeType: 'action',
        action: 'payroll.overtime_calculated',
        entityType: 'payroll_run',
        entityId: payrollRun.id,
        metadata: {
          payrollRunId: payrollRun.id,
          employeeCount: calculations.length,
          totalRegularHours: calculations.reduce((s, c) => s + c.regularHours, 0),
          totalOvertimeHours: calculations.reduce((s, c) => s + c.overtimeHours, 0),
          employees: calculations.map(c => ({
            employeeId: c.employeeId,
            regularHours: c.regularHours,
            overtimeHours: c.overtimeHours,
            hourlyRate: c.hourlyRate,
            grossPay: c.grossPay,
          })),
        },
      });
    } catch (auditErr: any) {
      log.warn('[AI Payroll™] overtime_calculated audit log failed (non-fatal):', auditErr?.message);
    }

    // Emit payroll completion event to Trinity for platform awareness
    trinityPlatformConnector.emitAutomationEvent('payroll', 'payroll_processed', {
      action: `Payroll processed: ${calculations.length} employees, $${totalGrossPay.toFixed(2)} gross`,
      workspaceId,
      userId,
      success: true,
      data: {
        payrollRunId: payrollRun.id,
        employeeCount: calculations.length,
        totalGrossPay: parseFloat(totalGrossPay.toFixed(2)),
        totalNetPay: parseFloat(totalNetPay.toFixed(2)),
        periodStart: payPeriod.start.toISOString(),
        periodEnd: payPeriod.end.toISOString(),
        warningCount: allWarnings.length,
      },
    }).catch(err => log.error('[AI Payroll™] Failed to emit Trinity event:', err));

    // Surface manually-corrected entries to the platform event bus for manager review
    if (manualEditNotesMap.size > 0) {
      const affectedNames = calculations
        .filter(c => manualEditNotesMap.has(c.employeeId))
        .map(c => c.employeeName);
      platformEventBus.publish({
        type: 'payroll_manual_edit_flagged',
        category: 'payroll',
        title: `Payroll Contains Manually Corrected Time Entries`,
        description: `${manualEditNotesMap.size} employee${manualEditNotesMap.size === 1 ? '' : 's'} (${affectedNames.join(', ')}) had time entries manually corrected before this payroll run. Review the payroll ledger for audit notes.`,
        workspaceId,
        metadata: {
          payrollRunId: payrollRun.id,
          affectedEmployeeIds: Array.from(manualEditNotesMap.keys()),
          affectedEmployeeNames: affectedNames,
          totalAffected: manualEditNotesMap.size,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          severity: 'audit_flag',
        },
      }).catch((err) => log.warn('[payrollAutomation] Fire-and-forget failed:', err));
    }

    notifyPayrollReadyForReview({
      workspaceId,
      payrollRunId: payrollRun.id,
      periodStart: payPeriod.start,
      periodEnd: payPeriod.end,
      totalEmployees: calculations.length,
      totalGrossPay: parseFloat(totalGrossPay.toFixed(2)),
    }).catch(err => log.error('[AI Payroll™] Failed to send payroll ready notification:', err));

    return {
      payrollRunId: payrollRun.id,
      totalEmployees: calculations.length,
      totalGrossPay: parseFloat(totalGrossPay.toFixed(2)),
      totalNetPay: parseFloat(totalNetPay.toFixed(2)),
      calculations,
      timeEntryIds: allTimeEntryIds, // Return for marking as payrolled after approval
      warnings: allWarnings, // Surface warnings to caller
      // @ts-expect-error — TS migration: fix in refactoring sprint
      errors: allErrors, // Explicit hard-block errors — zero-rate employees, data integrity failures
      hasBlockedEmployees: zeroRateEmployees.length > 0, // True if any employees were blocked due to missing rates
      zeroRateEmployees, // Employees with hours but $0 gross pay
    };
  }
  
  /**
   * Approve payroll run (1% human QC step)
   * Marks time entries as payrolled after approval
   * BACKWARD COMPATIBLE: timeEntryIds optional for existing callers
   */
  static async approvePayrollRun(payrollRunId: string, approverId: string, timeEntryIds?: string[]): Promise<void> {
    // ATOMIC: both the payroll run status update and all time-entry markings execute
    // inside a single transaction. If the entry marking fails, the status update
    // is rolled back — preventing a "approved run, un-marked entries" desync.
    const now = new Date();
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(payrollRuns)
        .set({
          status: 'approved',
          processedBy: approverId,
          processedAt: now,
          approvedBy: approverId,
          approvedAt: now,
        })
        .where(eq(payrollRuns.id, payrollRunId))
        .returning({ workspaceId: payrollRuns.workspaceId, periodStart: payrollRuns.periodStart, periodEnd: payrollRuns.periodEnd });

      if (!row) {
        throw new Error(`Payroll run ${payrollRunId} not found`);
      }

      // Bulk-claim source time entries atomically via canonical claimer.
      if (timeEntryIds && timeEntryIds.length > 0) {
        const claimed = await claimPayrollTimeEntries({
          workspaceId,
          timeEntryIds,
          payrollRunId,
          requireAll: true,
          tx,
        });
        log.info(`[AI Payroll™] Claimed ${claimed.claimedCount}/${claimed.requestedCount} entries for run ${payrollRunId}`);
      } else {
        log.warn(`[AI Payroll™] Approved payroll ${payrollRunId} without marking entries - timeEntryIds not provided`);
      }

      return row;
    });

    // Publish so TrinityPayrollApprovalWatcher and downstream automation can react
    if (updated?.workspaceId) {
      platformEventBus.publish({
        type: 'payroll_run_approved',
        category: 'payroll',
        title: 'Payroll Run Approved',
        description: `Payroll run ${payrollRunId} approved by ${approverId}`,
        workspaceId: updated.workspaceId,
        metadata: { payrollRunId, approverId, periodStart: updated.periodStart, periodEnd: updated.periodEnd },
      }).catch(err => log.warn('[AI Payroll] payroll_run_approved publish failed (non-blocking):', err?.message));
    }
  }
  
  /**
   * Mark payroll as processed/paid (after direct deposit/ACH)
   */
  static async markPayrollPaid(payrollRunId: string): Promise<void> {
    const [updated] = await db
      .update(payrollRuns)
      .set({
        status: 'paid'
      })
      .where(eq(payrollRuns.id, payrollRunId))
      .returning({ workspaceId: payrollRuns.workspaceId, periodStart: payrollRuns.periodStart, periodEnd: payrollRuns.periodEnd });

    // Publish so TrinityPayrollRunPaidHandler subscriber can trigger owner notification
    if (updated?.workspaceId) {
      platformEventBus.publish({
        type: 'payroll_run_paid',
        category: 'payroll',
        title: 'Payroll Run Marked Paid',
        description: `Payroll run ${payrollRunId} marked as paid — funds disbursed`,
        workspaceId: updated.workspaceId,
        metadata: { payrollRunId, periodStart: updated.periodStart, periodEnd: updated.periodEnd },
      }).catch(err => log.warn('[AI Payroll] payroll_run_paid publish failed (non-blocking):', err?.message));
    }
  }
}

export async function voidPayrollRun(
  runId: string,
  workspaceId: string,
  userId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.workspaceId, workspaceId)))
      .limit(1);

    if (!run) return { success: false, error: 'Payroll run not found' };

    // G8 FIX: 'paid' is NOT voidable — funds have already been disbursed.
    // Voiding a paid run would erase the payment audit trail and re-expose time entries
    // for re-processing, risking double-payment. Paid runs require manual financial reversal.
    const voidableStatuses = ['pending', 'approved', 'processed'];
    if (run.status === 'paid') {
      return { success: false, error: 'Cannot void a PAID payroll run — funds have already been disbursed. Contact your accountant to issue a reversal or correcting entry.' };
    }
    if (!voidableStatuses.includes(run.status || '')) {
      return { success: false, error: `Cannot void a payroll run with status "${run.status}"` };
    }

    await db.transaction(async (tx) => {
      await tx.update(payrollRuns).set({
        status: 'draft',
        updatedAt: new Date(),
      }).where(eq(payrollRuns.id, runId));

      const entries = await tx.select({ id: payrollEntries.id }).from(payrollEntries)
        .where(eq(payrollEntries.payrollRunId, runId));

      for (const entry of entries) {
        await tx.update(payrollEntries).set({
          notes: sql`COALESCE(${payrollEntries.notes}, '') || ${`\n[VOIDED ${new Date().toISOString()}] by ${userId}: ${reason}`}`,
          updatedAt: new Date(),
        }).where(eq(payrollEntries.id, entry.id));
      }

      // Reset payrolledAt on all time entries linked to this run so they are eligible
      // for re-processing in the next payroll run. Without this, voided entries would
      // be permanently locked out of future payrolls.
      const resetResult = await tx
        .update(timeEntries)
        .set({ payrolledAt: null, payrollRunId: null, updatedAt: new Date() })
        .where(eq(timeEntries.payrollRunId, runId))
        .returning({ id: timeEntries.id });
      if (resetResult.length > 0) {
        log.info(`[AI Payroll] Void: reset payrolledAt on ${resetResult.length} time entries (run ${runId})`);
      }
    });

    log.info(`[AI Payroll] Payroll run ${runId} voided by ${userId}: ${reason}`);

    // GAP-16 FIX: Write ledger reversal when voiding a 'processed' payroll run.
    // A processed run already has a payroll_processed/credit entry that reduced the org's
    // ledger balance. Voiding rolls it back to draft without disbursing, so the original
    // payroll_processed credit must be offset by an equal adjustment/debit reversal.
    // 'pending' and 'approved' runs have no payroll_processed entry, so no reversal needed.
    if (run.status === 'processed') {
      const reversalAmount = parseFloat(run.totalNetPay || '0');
      if (reversalAmount > 0) {
        const { writeLedgerEntry } = await import('./orgLedgerService');
        await writeLedgerEntry({
          workspaceId,
          entryType: 'adjustment',
          direction: 'debit',
          amount: reversalAmount,
          relatedEntityType: 'payroll_run',
          relatedEntityId: runId,
          payrollRunId: runId,
          description: `Reversal: payroll run ${runId.substring(0, 8)} voided — offsets payroll_processed entry (net $${reversalAmount.toFixed(2)}). Reason: ${reason}`,
          createdBy: userId,
          metadata: { originalStatus: 'processed', voidedBy: userId, reason, reversalOf: 'payroll_processed' },
        }).catch((err: Error) => log.error(`[AI Payroll] Ledger reversal write failed for voided run ${runId}:`, err.message));
      }
    }

    // Publish so TrinityPayrollRunVoidedWatcher subscriber (trinityEventSubscriptions) fires
    platformEventBus.publish({
      type: 'payroll_run_voided',
      category: 'payroll',
      title: 'Payroll Run Voided',
      description: `Payroll run ${runId} voided by ${userId}: ${reason}`,
      workspaceId,
      metadata: { payrollRunId: runId, voidedBy: userId, reason },
    }).catch(err => log.warn('[AI Payroll] payroll_run_voided publish failed (non-blocking):', err?.message));

    return { success: true };
  } catch (error) {
    log.error('[AI Payroll] Void payroll run failed:', error);
    return { success: false, error: String(error) };
  }
}

export async function amendPayrollEntry(
  entryId: string,
  workspaceId: string,
  userId: string,
  amendments: {
    regularHours?: string;
    overtimeHours?: string;
    hourlyRate?: string;
    grossPay?: string;
    federalTax?: string;
    stateTax?: string;
    socialSecurity?: string;
    medicare?: string;
    netPay?: string;
    reason: string;
  }
): Promise<{ success: boolean; originalEntry?: any; amendedEntry?: any; error?: string }> {
  try {
    const [entry] = await db.select().from(payrollEntries)
      .where(and(eq(payrollEntries.id, entryId), eq(payrollEntries.workspaceId, workspaceId)))
      .limit(1);

    if (!entry) return { success: false, error: 'Payroll entry not found' };

    const [run] = await db.select().from(payrollRuns)
      .where(eq(payrollRuns.id, entry.payrollRunId))
      .limit(1);

    if (!run) return { success: false, error: 'Associated payroll run not found' };

    // SERVICE-LAYER WRITE PROTECTION: Terminal payroll runs are immutable.
    // Paid/completed runs have already been disbursed — amendments would create
    // reconciliation errors between the DB, ACH records, and tax filings.
    const TERMINAL_STATUSES = ['paid', 'completed', 'void'] as const;
    if (TERMINAL_STATUSES.includes(run.status as typeof TERMINAL_STATUSES[number])) {
      return {
        success: false,
        error: `Cannot amend a ${run.status} payroll run. Payroll entries are write-protected once disbursement has occurred. Create a corrective run for any adjustments.`,
      };
    }

    const originalSnapshot = { ...entry };

    const updateFields: Record<string, any> = {
      updatedAt: new Date(),
      notes: `${entry.notes || ''}\n[AMENDED ${new Date().toISOString()}] by ${userId}: ${amendments.reason}` +
        `\nOriginal values: gross=${entry.grossPay}, net=${entry.netPay}, regHrs=${entry.regularHours}, otHrs=${entry.overtimeHours}`,
    };

    if (amendments.regularHours !== undefined) updateFields.regularHours = amendments.regularHours;
    if (amendments.overtimeHours !== undefined) updateFields.overtimeHours = amendments.overtimeHours;
    if (amendments.hourlyRate !== undefined) updateFields.hourlyRate = amendments.hourlyRate;
    if (amendments.grossPay !== undefined) updateFields.grossPay = amendments.grossPay;
    if (amendments.federalTax !== undefined) updateFields.federalTax = amendments.federalTax;
    if (amendments.stateTax !== undefined) updateFields.stateTax = amendments.stateTax;
    if (amendments.socialSecurity !== undefined) updateFields.socialSecurity = amendments.socialSecurity;
    if (amendments.medicare !== undefined) updateFields.medicare = amendments.medicare;
    if (amendments.netPay !== undefined) updateFields.netPay = amendments.netPay;

    const [amended] = await db.update(payrollEntries)
      .set(updateFields)
      .where(eq(payrollEntries.id, entryId))
      .returning();

    if (amendments.grossPay || amendments.netPay) {
      const allEntries = await db.select().from(payrollEntries)
        .where(eq(payrollEntries.payrollRunId, entry.payrollRunId));

      const totalGross = allEntries.reduce((sum, e) => sum + parseFloat(String(e.grossPay || '0')), 0);
      const totalNet = allEntries.reduce((sum, e) => sum + parseFloat(String(e.netPay || '0')), 0);
      const totalTaxes = allEntries.reduce((sum, e) => {
        return sum +
          parseFloat(String(e.federalTax || '0')) +
          parseFloat(String(e.stateTax || '0')) +
          parseFloat(String(e.socialSecurity || '0')) +
          parseFloat(String(e.medicare || '0'));
      }, 0);

      await db.update(payrollRuns).set({
        totalGrossPay: String(totalGross.toFixed(2)),
        totalNetPay: String(totalNet.toFixed(2)),
        totalTaxes: String(totalTaxes.toFixed(2)),
        updatedAt: new Date(),
      }).where(eq(payrollRuns.id, entry.payrollRunId));
    }

    log.info(`[AI Payroll] Entry ${entryId} amended by ${userId}: ${amendments.reason}`);
    return { success: true, originalEntry: originalSnapshot, amendedEntry: amended };
  } catch (error) {
    log.error('[AI Payroll] Amend payroll entry failed:', error);
    return { success: false, error: String(error) };
  }
}

// Export convenience functions for use in routes
export const detectPayPeriod = async (workspaceId: string) => {
  const workspace = await db.select({ billingSettingsBlob: workspaces.billingSettingsBlob }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const blob = (workspace[0]?.billingSettingsBlob || {}) as Record<string, any>;
  // payrollCycle stored in billingSettingsBlob: weekly | biweekly | semimonthly | monthly
  const rawCycle: string = blob.payrollCycle || 'bi-weekly';
  // Normalize: biweekly → bi-weekly, semimonthly → semi-monthly
  const paySchedule = rawCycle
    .replace(/^biweekly$/i, 'bi-weekly')
    .replace(/^bi_weekly$/i, 'bi-weekly')
    .replace(/^semimonthly$/i, 'semi-monthly')
    .replace(/^semi_monthly$/i, 'semi-monthly');
  const period = PayrollAutomationEngine.detectPayPeriod(paySchedule);
  return {
    periodStart: period.start,
    periodEnd: period.end,
    periodType: period.type
  };
};

export const calculatePayroll = (params: {
  timeEntries: TimeEntry[];
  employeeId: string;
  employeeName: string;
  hourlyRate: number;
  taxState: string;
}) => {
  // Legacy function - use processAutomatedPayroll instead
  log.warn('[AI Payroll™] Legacy calculatePayroll called - use processAutomatedPayroll with aggregator instead');
  throw new Error('calculatePayroll is deprecated - use processAutomatedPayroll instead');
};

export const createAutomatedPayrollRun = async (params: {
  workspaceId: string;
  periodStart: Date;
  periodEnd: Date;
  createdBy: string;
}) => {
  return await PayrollAutomationEngine.processAutomatedPayroll(
    params.workspaceId,
    params.createdBy,
    params.periodStart,
    params.periodEnd
  );
};

export interface InternalPayrollResult {
  success: boolean;
  payrollRunId: string;
  totalEntries: number;
  processedEntries: number;
  failedEntries: number;
  totalNetPay: number;
  totalEmployerTaxes: number;
  stripePayouts: number;
  plaidAchPayouts: number;
  pendingManualPayments: number;
  journalEntriesCreated: number;
  errors: string[];
  auditTrail: Array<{
    timestamp: string;
    action: string;
    details: string;
  }>;
}

export interface PayrollEntryExecutionResult {
  success: boolean;
  employeeId: string;
  netPay: number;
  paymentMethod: 'stripe_connect' | 'plaid_ach' | 'pending_manual_payment';
  stripeTransferId?: string;
  plaidTransferId?: string;
  error?: string;
}

export async function executePayrollEntry(
  entry: any,
  workspaceId: string,
  hasStripeConnect: boolean
): Promise<PayrollEntryExecutionResult> {
  const employeeId = entry.employeeId;
  const netPay = parseFloat(String(entry.netPay || '0'));

  if (netPay <= 0) {
    return {
      success: true,
      employeeId,
      netPay: 0,
      paymentMethod: 'pending_manual_payment',
    };
  }

  if (hasStripeConnect) {
    try {
      const { stripeConnectPayoutService } = await import('./billing/stripeConnectPayoutService');

      if (stripeConnectPayoutService.isAvailable()) {
        const payoutResult = await stripeConnectPayoutService.processPayrollPayout(entry.id, workspaceId);

        if (payoutResult.success) {
          return {
            success: true,
            employeeId,
            netPay,
            paymentMethod: 'stripe_connect',
            stripeTransferId: payoutResult.transferId,
          };
        }

        log.warn(`[InternalPayroll] Stripe payout failed for ${employeeId}: ${payoutResult.error}, falling back to manual`);
      }
    } catch (err: any) {
      log.warn(`[InternalPayroll] Stripe Connect error for ${employeeId}:`, (err instanceof Error ? err.message : String(err)));
    }
  }

  // ── PLAID ACH DISBURSEMENT ────────────────────────────────────────────────
  // If the org has a Plaid-connected funding account and the employee has a
  // Plaid-linked bank account, initiate an ACH credit transfer automatically.
  try {
    const { initiatePayrollAchTransfer } = await import('./payroll/achTransferService');
    const achResult = await initiatePayrollAchTransfer({
      workspaceId,
      employeeId,
      payrollRunId: entry.payrollRunId,
      payrollEntryId: entry.id,
      amount: netPay,
      idempotencyKey: `payroll-entry-${entry.id}`,
      description: 'Payroll',
      legalName: employeeId,
    });

    if (achResult.status === 'initiated') {
      log.info(`[InternalPayroll] Plaid ACH transfer initiated for ${employeeId}: ${achResult.transferId} ($${netPay})`);
      return {
        success: true,
        employeeId,
        netPay,
        paymentMethod: 'plaid_ach',
        plaidTransferId: achResult.transferId,
      };
    }

    if (achResult.status === 'payment_held') {
      log.warn(`[InternalPayroll] Plaid ACH transfer held for ${employeeId}: ${achResult.reason}`);
      return {
        success: true,
        employeeId,
        netPay,
        paymentMethod: 'pending_manual_payment',
        error: achResult.reason,
      };
    }
  } catch (err: any) {
    // Non-fatal — fall through to manual if Plaid ACH fails
    log.warn(`[InternalPayroll] Plaid ACH transfer failed for ${employeeId} (falling back to manual):`, (err instanceof Error ? err.message : String(err)));
  }
  // ─────────────────────────────────────────────────────────────────────────

  try {
    const { payrollPayouts } = await import('@shared/schema');
    // @ts-expect-error — TS migration: fix in refactoring sprint
    await db.insert(payrollPayouts).values({
      workspaceId,
      payrollRunId: entry.payrollRunId,
      payrollEntryId: entry.id,
      employeeId,
      method: 'manual',
      amount: netPay.toFixed(2),
      currency: 'usd',
      status: 'pending',
      initiatedAt: new Date(),
      metadata: { reason: 'no_automated_disbursement_configured' },
    });
  } catch (err) {
    log.warn('[InternalPayroll] Could not insert manual payout record:', err);
  }

  return {
    success: true,
    employeeId,
    netPay,
    paymentMethod: 'pending_manual_payment',
  };
}

export async function executeInternalPayroll(
  workspaceId: string,
  payrollRunId: string,
  executedBy?: string
): Promise<InternalPayrollResult> {
  const auditTrail: InternalPayrollResult['auditTrail'] = [];
  const errors: string[] = [];

  const logAudit = (action: string, details: string) => {
    auditTrail.push({ timestamp: new Date().toISOString(), action, details });
    log.info(`[InternalPayroll] ${action}: ${details}`);
  };

  logAudit('INIT', `Starting internal payroll execution for run ${payrollRunId}`);

  const [run] = await db.select().from(payrollRuns)
    .where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.workspaceId, workspaceId)))
    .limit(1);

  if (!run) {
    return {
      success: false, payrollRunId, totalEntries: 0, processedEntries: 0,
      failedEntries: 0, totalNetPay: 0, totalEmployerTaxes: 0, stripePayouts: 0,
      plaidAchPayouts: 0, pendingManualPayments: 0, journalEntriesCreated: 0,
      errors: ['Payroll run not found'], auditTrail,
    };
  }

  if (run.status !== 'approved' && run.status !== 'pending') {
    return {
      success: false, payrollRunId, totalEntries: 0, processedEntries: 0,
      failedEntries: 0, totalNetPay: 0, totalEmployerTaxes: 0, stripePayouts: 0,
      plaidAchPayouts: 0, pendingManualPayments: 0, journalEntriesCreated: 0,
      errors: [`Payroll run status is '${run.status}', must be 'approved' or 'pending'`], auditTrail,
    };
  }

  logAudit('STATUS_CHECK', `Payroll run status: ${run.status}, period: ${run.periodStart} - ${run.periodEnd}`);

  const entries = await db.select().from(payrollEntries)
    .where(and(eq(payrollEntries.payrollRunId, payrollRunId), eq(payrollEntries.workspaceId, workspaceId)));

  if (entries.length === 0) {
    return {
      success: false, payrollRunId, totalEntries: 0, processedEntries: 0,
      failedEntries: 0, totalNetPay: 0, totalEmployerTaxes: 0, stripePayouts: 0,
      plaidAchPayouts: 0, pendingManualPayments: 0, journalEntriesCreated: 0,
      errors: ['No payroll entries found for this run'], auditTrail,
    };
  }

  logAudit('ENTRIES_LOADED', `Found ${entries.length} payroll entries to process`);

  let hasStripeConnect = false;
  try {
    const { providerPreferenceService } = await import('./billing/providerPreferenceService');
    const prefs = await providerPreferenceService.getPreferences(workspaceId);
    hasStripeConnect = prefs.payrollProvider === 'local';
    logAudit('PROVIDER_CHECK', `Payroll provider: ${prefs.payrollProvider}, Stripe Connect available: ${hasStripeConnect}`);
  } catch {
    logAudit('PROVIDER_CHECK', 'Could not determine provider preference, defaulting to manual payments');
  }

  const employeeNames = new Map<string, string>();
  const contractorEmployees = new Set<string>();
  try {
    const empIds = [...new Set(entries.map(e => e.employeeId))];
    for (const empId of empIds) {
      const [emp] = await db.select({ firstName: employees.firstName, lastName: employees.lastName, workerType: employees.workerType, is1099Eligible: employees.is1099Eligible })
        .from(employees).where(eq(employees.id, empId)).limit(1);
      if (emp) {
        employeeNames.set(empId, `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || empId);
        if (emp.workerType === 'contractor' || emp.is1099Eligible === true) {
          contractorEmployees.add(empId);
        }
      }
    }
  } catch {
    logAudit('EMPLOYEE_LOOKUP', 'Could not look up employee names');
  }

  // Set payroll run status to 'disbursing' before initiating transfers.
  // Atomic guard: WHERE clause includes status check so two concurrent executions
  // cannot both succeed — only the first UPDATE returns rows.
  try {
    const disbursing = await db.update(payrollRuns)
      .set({ status: 'disbursing' as any, updatedAt: new Date() })
      .where(and(
        eq(payrollRuns.id, payrollRunId),
        eq(payrollRuns.workspaceId, workspaceId),
        sql`${payrollRuns.status} IN ('approved', 'pending')`,
      ))
      .returning({ id: payrollRuns.id });
    if (!disbursing.length) {
      logAudit('STATUS_UPDATE_SKIP', 'Payroll run already being executed by another process — aborting duplicate');
      return { success: false, message: 'Payroll run is already executing' } as any;
    }
    platformEventBus.publish({
      type: 'payroll_run_disbursing',
      workspaceId,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      payrollRunId,
      transferCount: entries.length,
      nachaCount: 0,
    }).catch((err) => log.warn('[payrollAutomation] Fire-and-forget failed:', err));
    logAudit('STATUS_UPDATE', `Payroll run status set to 'disbursing' — initiating ${entries.length} transfers`);
  } catch (err: any) {
    logAudit('STATUS_UPDATE_WARN', `Could not set disbursing status: ${(err instanceof Error ? err.message : String(err))}`);
  }

  let processedEntries = 0;
  let failedEntries = 0;
  let totalNetPay = 0;
  let stripePayouts = 0;
  let plaidAchPayouts = 0;
  let pendingManualPayments = 0;

  const ledgerData: Array<{
    employeeId: string;
    employeeName: string;
    grossPay: number;
    netPay: number;
    federalTax: number;
    stateTax: number;
    socialSecurity: number;
    medicare: number;
    employerSocialSecurity: number;
    employerMedicare: number;
    employerFUTA: number;
    employerSUTA: number;
  }> = [];

  for (const entry of entries) {
    try {
      const result = await executePayrollEntry(entry, workspaceId, hasStripeConnect);

      if (result.success) {
        processedEntries++;
        totalNetPay += result.netPay;

        if (result.paymentMethod === 'stripe_connect') {
          stripePayouts++;
          logAudit('PAYOUT', `Stripe Connect payout for ${result.employeeId}: $${result.netPay.toFixed(2)}, transfer: ${result.stripeTransferId}`);
        } else if (result.paymentMethod === 'plaid_ach') {
          plaidAchPayouts++;
          logAudit('PAYOUT', `Plaid ACH transfer initiated for ${result.employeeId}: $${result.netPay.toFixed(2)}, transferId: ${result.plaidTransferId}`);
        } else {
          pendingManualPayments++;
          logAudit('PAYOUT', `Manual payment pending for ${result.employeeId}: $${result.netPay.toFixed(2)}`);
        }

        const grossPay = parseFloat(String(entry.grossPay || '0'));
        const federalTax = parseFloat(String(entry.federalTax || '0'));
        const stateTax = parseFloat(String(entry.stateTax || '0'));
        const socialSecurity = parseFloat(String(entry.socialSecurity || '0'));
        const medicare = parseFloat(String(entry.medicare || '0'));

        // 1099 contractors: No employer taxes (no FICA match, no FUTA, no SUTA)
        const isEntryContractor = contractorEmployees.has(entry.employeeId);
        let employerSS = 0;
        let employerMedicare = 0;
        let employerFUTA = 0;
        let employerSUTA = 0;

        if (!isEntryContractor) {
          const ytdWages = await PayrollAutomationEngine.getSocialSecurityYtdWages(
            entry.employeeId,
            new Date().getFullYear()
          ).catch(() => 0);

          employerSS = PayrollAutomationEngine.calculateSocialSecurity(grossPay, ytdWages);
          employerMedicare = PayrollAutomationEngine.calculateMedicare(grossPay, ytdWages);
          employerFUTA = PayrollAutomationEngine.calculateFUTA(grossPay, ytdWages);
          employerSUTA = PayrollAutomationEngine.calculateSUTA(grossPay, ytdWages);
        } else {
          logAudit('1099_CONTRACTOR', `Skipping employer taxes for 1099 contractor ${entry.employeeId} — straight pay $${grossPay.toFixed(2)}`);
        }

        ledgerData.push({
          employeeId: entry.employeeId,
          employeeName: employeeNames.get(entry.employeeId) || entry.employeeId,
          grossPay,
          netPay: result.netPay,
          federalTax,
          stateTax,
          socialSecurity,
          medicare,
          employerSocialSecurity: employerSS,
          employerMedicare: employerMedicare,
          employerFUTA,
          employerSUTA,
        });
      } else {
        failedEntries++;
        errors.push(`${entry.employeeId}: ${result.error}`);
        logAudit('PAYOUT_FAILED', `Failed for ${entry.employeeId}: ${result.error}`);
      }
    } catch (err: any) {
      failedEntries++;
      errors.push(`${entry.employeeId}: ${(err instanceof Error ? err.message : String(err))}`);
      logAudit('PAYOUT_ERROR', `Error processing ${entry.employeeId}: ${(err instanceof Error ? err.message : String(err))}`);
    }
  }

  let journalEntriesCreated = 0;
  let totalEmployerTaxes = 0;

  if (ledgerData.length > 0) {
    try {
      const { financialLedgerService } = await import('./financialLedgerService');
      const journalEntries = await financialLedgerService.recordPayrollJournalEntries(
        workspaceId, payrollRunId, ledgerData
      );
      journalEntriesCreated = journalEntries.length;

      totalEmployerTaxes = ledgerData.reduce((sum, d) =>
        sum + d.employerSocialSecurity + d.employerMedicare + d.employerFUTA + d.employerSUTA, 0
      );

      logAudit('JOURNAL_ENTRIES', `Created ${journalEntriesCreated} journal entries, employer taxes: $${totalEmployerTaxes.toFixed(2)}`);
    } catch (err: any) {
      logAudit('JOURNAL_ERROR', `Failed to create journal entries: ${(err instanceof Error ? err.message : String(err))}`);
      errors.push(`Journal entries failed: ${(err instanceof Error ? err.message : String(err))}`);
    }
  }

  const finalStatus = failedEntries === 0 ? 'completed' : (processedEntries > 0 ? 'partial' : 'failed');

  const automatedPayouts = stripePayouts + plaidAchPayouts;
  const finalDisbursementStatus =
    automatedPayouts > 0 && failedEntries === 0 ? 'disbursed' :
    automatedPayouts > 0 && processedEntries > 0 ? 'partial' :
    pendingManualPayments > 0 ? 'pending_manual' :
    'pending';

  try {
    const updateData: Record<string, any> = {
      status: finalStatus,
      disbursementStatus: finalDisbursementStatus,
      disbursedAt: (automatedPayouts > 0 || pendingManualPayments > 0) ? new Date() : undefined,
      updatedAt: new Date(),
    };

    if (executedBy) {
      updateData.notes = `Internal payroll executed by ${executedBy} at ${new Date().toISOString()}. ` +
        `Processed: ${processedEntries}/${entries.length}. ` +
        `Stripe payouts: ${stripePayouts}. Plaid ACH: ${plaidAchPayouts}. Manual payments: ${pendingManualPayments}. ` +
        `Employer taxes: $${totalEmployerTaxes.toFixed(2)}.`;
    }

    await db.update(payrollRuns)
      .set(updateData)
      .where(eq(payrollRuns.id, payrollRunId));

    logAudit('STATUS_UPDATE', `Payroll run status updated to '${finalStatus}', disbursement: '${finalDisbursementStatus}'`);
  } catch (err: any) {
    logAudit('STATUS_UPDATE_ERROR', `Failed to update payroll run status: ${(err instanceof Error ? err.message : String(err))}`);
    errors.push(`Status update failed: ${(err instanceof Error ? err.message : String(err))}`);
  }

  // DUAL-EMIT LAW: financial mutations must publish() to hit subscribe() handlers
  // AND broadcastToWorkspace() for real-time UI updates.
  try {
    await platformEventBus.publish({
      type: automatedPayouts > 0 ? 'payroll_run_paid' : 'payroll_run_processed',
      workspaceId,
      title: automatedPayouts > 0
        ? `Payroll Disbursed — $${totalNetPay.toFixed(2)} sent to ${processedEntries} employee(s)`
        : `Payroll Processed — $${totalNetPay.toFixed(2)} net pay calculated`,
      description: `Run ${payrollRunId}: ${processedEntries} entries processed. Stripe: ${stripePayouts}, Plaid ACH: ${plaidAchPayouts}, Manual: ${pendingManualPayments}.`,
      metadata: {
        workspaceId,
        payrollRunId,
        status: finalStatus,
        disbursementStatus: finalDisbursementStatus,
        totalNetPay,
        totalEmployerTaxes,
        processedEntries,
        failedEntries,
        stripePayouts,
        plaidAchPayouts,
        pendingManualPayments,
        executedBy,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (pubErr: any) {
    log.warn('[InternalPayroll] Event publish failed (non-critical):', pubErr?.message);
  }

  try {
    const { broadcastToWorkspace } = await import('../websocket');
    broadcastToWorkspace(workspaceId, {
      type: 'payroll_run_executed',
      data: {
        payrollRunId,
        status: finalStatus,
        disbursementStatus: finalDisbursementStatus,
        totalNetPay,
        processedEntries,
        stripePayouts,
        plaidAchPayouts,
        pendingManualPayments,
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    // non-critical
  }

  logAudit('COMPLETE', `Internal payroll execution finished. Status: ${finalStatus}`);

  return {
    success: failedEntries === 0,
    payrollRunId,
    totalEntries: entries.length,
    processedEntries,
    failedEntries,
    totalNetPay,
    totalEmployerTaxes,
    stripePayouts,
    plaidAchPayouts,
    pendingManualPayments,
    journalEntriesCreated,
    errors,
    auditTrail,
  };
}
