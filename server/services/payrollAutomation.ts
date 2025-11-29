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
 */

import { db } from "../db";
import { timeEntries, employees, payrollRuns, payrollEntries, workspaces, invoiceLineItems, type TimeEntry } from "@shared/schema";
import { eq, and, gte, lte, isNull, sql, notInArray, inArray } from "drizzle-orm";
import { startOfWeek, endOfWeek, subWeeks, format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from "date-fns";
import { aggregatePayrollHours, markEntriesAsPayrolled } from "./automation/payrollHoursAggregator";

interface PayPeriod {
  start: Date;
  end: Date;
  type: 'weekly' | 'bi-weekly' | 'monthly';
}

interface PayrollCalculation {
  employeeId: string;
  employeeName: string;
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
  netPay: number;
}

export class PayrollAutomationEngine {
  
  /**
   * Auto-detect pay period based on workspace settings
   * Default: bi-weekly (most common)
   */
  static detectPayPeriod(workspacePaySchedule?: string): PayPeriod {
    const now = new Date();
    
    switch (workspacePaySchedule) {
      case 'weekly':
        return {
          start: startOfWeek(subWeeks(now, 1)),
          end: endOfWeek(subWeeks(now, 1)),
          type: 'weekly'
        };
      
      case 'monthly':
        return {
          start: startOfMonth(subMonths(now, 1)),
          end: endOfMonth(subMonths(now, 1)),
          type: 'monthly'
        };
      
      case 'bi-weekly':
      default:
        // Bi-weekly: last 14 days
        const twoWeeksAgo = new Date(now);
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
        return {
          start: twoWeeksAgo,
          end: now,
          type: 'bi-weekly'
        };
    }
  }
  
  /**
   * Calculate federal tax withholding (simplified progressive brackets)
   * Based on 2024 tax tables for single filers
   */
  static calculateFederalTax(
    grossPay: number, 
    payPeriodType: 'weekly' | 'bi-weekly' | 'monthly' = 'bi-weekly',
    filingStatus: string = 'single'
  ): number {
    // Simplified federal tax brackets (annual basis, converted to pay period)
    // Single filer 2024 brackets (simplified)
    const brackets = [
      { limit: 11000, rate: 0.10 },
      { limit: 44725, rate: 0.12 },
      { limit: 95375, rate: 0.22 },
      { limit: Infinity, rate: 0.24 }
    ];
    
    // Determine annualization factor based on pay period
    const annualizationFactors: Record<'weekly' | 'bi-weekly' | 'monthly', number> = {
      'weekly': 52,
      'bi-weekly': 26,
      'monthly': 12
    };
    const factor = annualizationFactors[payPeriodType];
    
    // Annualize gross pay
    const annualGross = grossPay * factor;
    let tax = 0;
    let previousLimit = 0;
    
    for (const bracket of brackets) {
      if (annualGross > bracket.limit) {
        tax += (bracket.limit - previousLimit) * bracket.rate;
        previousLimit = bracket.limit;
      } else {
        tax += (annualGross - previousLimit) * bracket.rate;
        break;
      }
    }
    
    // Convert back to pay period
    return parseFloat((tax / factor).toFixed(2));
  }
  
  /**
   * State-specific tax configuration with 2024 rates
   * Supports no-tax states, flat rates, and simplified progressive brackets
   */
  private static readonly STATE_TAX_CONFIG: Record<string, { type: 'none' | 'flat' | 'progressive'; rate?: number; brackets?: Array<{ limit: number; rate: number }> }> = {
    // No income tax states
    'AK': { type: 'none' },
    'FL': { type: 'none' },
    'NV': { type: 'none' },
    'SD': { type: 'none' },
    'TN': { type: 'none' },
    'TX': { type: 'none' },
    'WA': { type: 'none' },
    'WY': { type: 'none' },
    
    // Flat rate states (top 10)
    'CO': { type: 'flat', rate: 0.044 },
    'GA': { type: 'flat', rate: 0.0575 },
    'IL': { type: 'flat', rate: 0.0495 },
    'IN': { type: 'flat', rate: 0.0323 },
    'KY': { type: 'flat', rate: 0.045 },
    'MA': { type: 'flat', rate: 0.05 },
    'MI': { type: 'flat', rate: 0.0425 },
    'NC': { type: 'flat', rate: 0.0525 },
    'PA': { type: 'flat', rate: 0.0307 },
    'UT': { type: 'flat', rate: 0.0465 },
    
    // Progressive states (simplified - top marginal rate)
    'AZ': { type: 'progressive', brackets: [{ limit: 36500, rate: 0.02 }, { limit: 90000, rate: 0.0455 }, { limit: Infinity, rate: 0.055 }] },
    'AR': { type: 'progressive', brackets: [{ limit: 4500, rate: 0.02 }, { limit: 9000, rate: 0.04 }, { limit: Infinity, rate: 0.0575 }] },
    'CA': { type: 'progressive', brackets: [{ limit: 10000, rate: 0.01 }, { limit: 23000, rate: 0.02 }, { limit: 37500, rate: 0.04 }, { limit: 52500, rate: 0.06 }, { limit: 67500, rate: 0.08 }, { limit: 340000, rate: 0.093 }, { limit: 410000, rate: 0.103 }, { limit: 680000, rate: 0.113 }, { limit: Infinity, rate: 0.123 }] },
    'CT': { type: 'progressive', rate: 0.0575 },
    'DE': { type: 'progressive', rate: 0.0615 },
    'IA': { type: 'progressive', rate: 0.0585 },
    'ID': { type: 'progressive', rate: 0.0585 },
    'KS': { type: 'progressive', rate: 0.057 },
    'LA': { type: 'progressive', rate: 0.0575 },
    'ME': { type: 'progressive', rate: 0.0715 },
    'MD': { type: 'progressive', rate: 0.0575 },
    'MN': { type: 'progressive', rate: 0.0985 },
    'MO': { type: 'progressive', rate: 0.0575 },
    'MS': { type: 'progressive', rate: 0.05 },
    'MT': { type: 'progressive', rate: 0.065 },
    'NE': { type: 'progressive', rate: 0.0684 },
    'NH': { type: 'none' }, // No income tax (only dividends)
    'NJ': { type: 'progressive', rate: 0.0897 },
    'NM': { type: 'progressive', rate: 0.059 },
    'NY': { type: 'progressive', rate: 0.0685 },
    'OH': { type: 'progressive', rate: 0.0399 },
    'OK': { type: 'progressive', rate: 0.05 },
    'OR': { type: 'progressive', rate: 0.099 },
    'RI': { type: 'progressive', rate: 0.0675 },
    'SC': { type: 'progressive', rate: 0.07 },
    'VT': { type: 'progressive', rate: 0.085 },
    'VA': { type: 'progressive', rate: 0.0575 },
    'WI': { type: 'progressive', rate: 0.0685 },
    'WV': { type: 'progressive', rate: 0.065 },
  };
  
  /**
   * Calculate state tax based on state-specific rules
   * Supports no-tax, flat-rate, and progressive bracket states
   */
  static calculateStateTax(grossPay: number, state: string = 'CA'): number {
    const stateCode = state.toUpperCase();
    const config = this.STATE_TAX_CONFIG[stateCode];
    
    // Default to CA if state not found
    if (!config) {
      console.warn(`[Payroll] Unknown state ${state}, defaulting to CA rates`);
      return parseFloat((grossPay * 0.0575).toFixed(2));
    }
    
    // No income tax states
    if (config.type === 'none') {
      return 0;
    }
    
    // Flat rate states
    if (config.type === 'flat' && config.rate) {
      return parseFloat((grossPay * config.rate).toFixed(2));
    }
    
    // Progressive bracket states (simplified calculation on gross pay basis)
    if (config.type === 'progressive') {
      if (config.rate) {
        // Single marginal rate for simplicity
        return parseFloat((grossPay * config.rate).toFixed(2));
      }
      if (config.brackets) {
        let tax = 0;
        let previousLimit = 0;
        for (const bracket of config.brackets) {
          if (grossPay > bracket.limit) {
            tax += (bracket.limit - previousLimit) * bracket.rate;
            previousLimit = bracket.limit;
          } else {
            tax += (grossPay - previousLimit) * bracket.rate;
            break;
          }
        }
        return parseFloat(tax.toFixed(2));
      }
    }
    
    return 0;
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
    let medicareTax = grossPay * MEDICARE_RATE;
    
    // Calculate Additional Medicare Tax on wages exceeding threshold
    const totalWagesWithCurrent = ytdWages + grossPay;
    
    if (totalWagesWithCurrent > threshold) {
      // Calculate how much of this period's pay is subject to additional tax
      const amountOverThreshold = Math.max(0, totalWagesWithCurrent - threshold);
      const priorAmountOverThreshold = Math.max(0, ytdWages - threshold);
      const taxableThisPeriod = amountOverThreshold - priorAmountOverThreshold;
      
      if (taxableThisPeriod > 0) {
        const additionalTax = taxableThisPeriod * ADDITIONAL_MEDICARE_RATE;
        medicareTax += additionalTax;
        console.log(`[AI Payroll™] Additional Medicare Tax: $${additionalTax.toFixed(2)} on $${taxableThisPeriod.toFixed(2)} exceeding $${threshold} threshold`);
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
    // Major local/city income tax jurisdictions and rates (2024)
    const localTaxConfig: Record<string, { 
      rate: number; 
      type: 'resident' | 'worker' | 'both';
      name: string;
    }> = {
      // New York City (applies to NYC residents only)
      'NYC': { rate: 0.03876, type: 'resident', name: 'New York City' },
      'YONKERS': { rate: 0.01535, type: 'resident', name: 'Yonkers' },
      
      // Pennsylvania localities (Philadelphia, Pittsburgh, etc.)
      'PHL': { rate: 0.03828, type: 'both', name: 'Philadelphia' },
      'PITTSBURGH': { rate: 0.03, type: 'both', name: 'Pittsburgh' },
      'SCRANTON': { rate: 0.024, type: 'both', name: 'Scranton' },
      'ALLENTOWN': { rate: 0.0175, type: 'both', name: 'Allentown' },
      
      // Ohio cities (many have local income tax)
      'CLEVELAND': { rate: 0.025, type: 'worker', name: 'Cleveland' },
      'COLUMBUS': { rate: 0.025, type: 'worker', name: 'Columbus' },
      'CINCINNATI': { rate: 0.0212, type: 'worker', name: 'Cincinnati' },
      'TOLEDO': { rate: 0.0225, type: 'worker', name: 'Toledo' },
      'AKRON': { rate: 0.025, type: 'worker', name: 'Akron' },
      'DAYTON': { rate: 0.025, type: 'worker', name: 'Dayton' },
      
      // Michigan cities
      'DETROIT': { rate: 0.024, type: 'both', name: 'Detroit' },
      'GRAND_RAPIDS': { rate: 0.015, type: 'both', name: 'Grand Rapids' },
      'SAGINAW': { rate: 0.015, type: 'both', name: 'Saginaw' },
      
      // Indiana localities
      'INDIANAPOLIS': { rate: 0.02, type: 'resident', name: 'Indianapolis' },
      'FORT_WAYNE': { rate: 0.0155, type: 'resident', name: 'Fort Wayne' },
      
      // Kentucky cities
      'LOUISVILLE': { rate: 0.0285, type: 'both', name: 'Louisville' },
      'LEXINGTON': { rate: 0.025, type: 'both', name: 'Lexington' },
      
      // Missouri localities
      'STLOUIS': { rate: 0.01, type: 'worker', name: 'St. Louis City' },
      'KANSAS_CITY': { rate: 0.01, type: 'worker', name: 'Kansas City' },
      
      // Alabama localities
      'BIRMINGHAM': { rate: 0.01, type: 'worker', name: 'Birmingham' },
      
      // Maryland localities (county taxes)
      'BALTIMORE_CITY': { rate: 0.032, type: 'resident', name: 'Baltimore City' },
      'MONTGOMERY_CO': { rate: 0.032, type: 'resident', name: 'Montgomery County' },
      
      // Delaware localities
      'WILMINGTON': { rate: 0.0125, type: 'worker', name: 'Wilmington' },
    };
    
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
    // Query payrollDeductions table for active deductions using Drizzle query
    const result = await db.execute(
      sql`SELECT COALESCE(SUM(CAST(amount AS FLOAT)), 0) as total
          FROM payroll_deductions
          WHERE employee_id = ${employeeId}
            AND workspace_id IS NOT NULL
            AND (end_date IS NULL OR end_date >= ${payPeriodEnd})`
    );
    
    const total = parseFloat(result.rows[0]?.total as string || '0');
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
    console.log(`[Payroll] Tax jurisdiction lookup for ${latitude}, ${longitude}`);
    return 'CA';
  }
  
  /**
   * Process payroll for a workspace - FULLY AUTOMATED
   */
  static async processAutomatedPayroll(workspaceId: string, userId: string): Promise<{
    payrollRunId: string;
    totalEmployees: number;
    totalGrossPay: number;
    totalNetPay: number;
    calculations: PayrollCalculation[];
    timeEntryIds: string[];
    warnings: string[];
  }> {
    // Get workspace pay schedule
    const workspace = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    const paySchedule = workspace[0]?.payrollSchedule || 'bi-weekly';
    
    // Auto-detect pay period based on workspace schedule
    const payPeriod = this.detectPayPeriod(paySchedule);
    
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
      console.warn('[AI Payroll™] Payroll hours aggregation warnings:', aggregationResult.warnings);
    }
    
    // Fail early if no employees to process (prevent empty payroll runs)
    if (aggregationResult.employeeSummaries.length === 0) {
      console.warn('[AI Payroll™] No employees with approved hours for period:', payPeriod);
      throw new Error('No employees with approved time entries found for payroll period');
    }
    
    const calculations: PayrollCalculation[] = [];
    let totalGrossPay = 0;
    let totalNetPay = 0;
    
    // Collect all time entry IDs for marking as payrolled after approval
    const allTimeEntryIds: string[] = [];
    const allWarnings = [...aggregationResult.warnings];
    
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
        const warning = `Employee ${employeeSummary.employeeName} has ${regularHours + overtimeHours + holidayHours} hours but $0 gross pay - missing pay rates`;
        allWarnings.push(warning);
        console.warn(`[AI Payroll™] ${warning}`);
      }
      
      // Fetch YTD wages for Social Security wage base tracking
      const ytdWages = await this.getSocialSecurityYtdWages(employeeSummary.employeeId, payrollYear);
      
      // Log when employee has reached the SS wage base limit
      const SS_WAGE_BASE = 168600;
      if (ytdWages >= SS_WAGE_BASE) {
        console.log(`[AI Payroll™] Employee ${employeeSummary.employeeName} has reached SS wage base limit ($${ytdWages.toFixed(2)} YTD) - no SS withholding`);
      } else if (ytdWages + grossPay > SS_WAGE_BASE) {
        const taxableThisPeriod = SS_WAGE_BASE - ytdWages;
        console.log(`[AI Payroll™] Employee ${employeeSummary.employeeName} will reach SS wage base limit this period - withholding on $${taxableThisPeriod.toFixed(2)} of $${grossPay.toFixed(2)} gross`);
      }
      
      // Calculate taxes and deductions on gross pay
      const federalTax = this.calculateFederalTax(grossPay, payPeriod.type);
      const stateTax = this.calculateStateTax(grossPay);
      const socialSecurity = this.calculateSocialSecurity(grossPay, ytdWages);
      // Pass YTD wages for Additional Medicare Tax threshold tracking
      const medicare = this.calculateMedicare(grossPay, ytdWages);
      
      // Calculate net pay
      const totalDeductions = federalTax + stateTax + socialSecurity + medicare;
      const netPay = grossPay - totalDeductions;
      
      calculations.push({
        employeeId: employeeSummary.employeeId,
        employeeName: employeeSummary.employeeName,
        regularHours,
        overtimeHours,
        holidayHours, // Include holiday hours for QC review
        hourlyRate,
        grossPay: parseFloat(grossPay.toFixed(2)),
        preTaxDeductions: 0, // TODO: Fetch from employee deductions
        taxableGrossPay: parseFloat(grossPay.toFixed(2)), // grossPay - preTaxDeductions
        federalTax,
        stateTax,
        socialSecurity,
        medicare,
        postTaxDeductions: 0, // TODO: Fetch from employee deductions
        netPay: parseFloat(netPay.toFixed(2))
      });
      
      totalGrossPay += grossPay;
      totalNetPay += netPay;
      
      // Collect time entry IDs for marking as payrolled
      allTimeEntryIds.push(...employeeSummary.entries.map(e => e.timeEntryId));
    }
    
    // Create payroll run (status: pending for 1% QC)
    const [payrollRun] = await db
      .insert(payrollRuns)
      .values({
        workspaceId,
        periodStart: payPeriod.start,
        periodEnd: payPeriod.end,
        status: 'pending', // Requires 1% human QC approval
        totalGrossPay: totalGrossPay.toFixed(2),
        totalTaxes: (totalGrossPay - totalNetPay).toFixed(2),
        totalNetPay: totalNetPay.toFixed(2),
        processedBy: userId,
        processedAt: new Date()
      })
      .returning();
    
    // Create payroll entries for each employee
    for (const calc of calculations) {
      await db.insert(payrollEntries).values({
        payrollRunId: payrollRun.id,
        employeeId: calc.employeeId,
        workspaceId,
        regularHours: calc.regularHours.toFixed(2),
        overtimeHours: calc.overtimeHours.toFixed(2),
        holidayHours: calc.holidayHours.toFixed(2), // Persist holiday hours for audit trail
        hourlyRate: calc.hourlyRate.toFixed(2),
        grossPay: calc.grossPay.toFixed(2),
        federalTax: calc.federalTax.toFixed(2),
        stateTax: calc.stateTax.toFixed(2),
        socialSecurity: calc.socialSecurity.toFixed(2),
        medicare: calc.medicare.toFixed(2),
        netPay: calc.netPay.toFixed(2)
      });
    }
    
    return {
      payrollRunId: payrollRun.id,
      totalEmployees: calculations.length,
      totalGrossPay: parseFloat(totalGrossPay.toFixed(2)),
      totalNetPay: parseFloat(totalNetPay.toFixed(2)),
      calculations,
      timeEntryIds: allTimeEntryIds, // Return for marking as payrolled after approval
      warnings: allWarnings, // Surface warnings to caller
    };
  }
  
  /**
   * Approve payroll run (1% human QC step)
   * Marks time entries as payrolled after approval
   * BACKWARD COMPATIBLE: timeEntryIds optional for existing callers
   */
  static async approvePayrollRun(payrollRunId: string, approverId: string, timeEntryIds?: string[]): Promise<void> {
    await db
      .update(payrollRuns)
      .set({
        status: 'approved',
        processedBy: approverId,
        processedAt: new Date()
      })
      .where(eq(payrollRuns.id, payrollRunId));
    
    // Mark time entries as payrolled after approval (if IDs provided)
    if (timeEntryIds && timeEntryIds.length > 0) {
      await markEntriesAsPayrolled({
        timeEntryIds,
        payrollRunId,
      });
    } else {
      console.warn(`[AI Payroll™] Approved payroll ${payrollRunId} without marking entries - timeEntryIds not provided`);
    }
  }
  
  /**
   * Mark payroll as processed/paid (after direct deposit/ACH)
   */
  static async markPayrollPaid(payrollRunId: string): Promise<void> {
    await db
      .update(payrollRuns)
      .set({
        status: 'paid'
      })
      .where(eq(payrollRuns.id, payrollRunId));
  }
}

// Export convenience functions for use in routes
export const detectPayPeriod = async (workspaceId: string) => {
  const workspace = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const paySchedule = workspace[0]?.payrollSchedule || 'bi-weekly';
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
  console.warn('[AI Payroll™] Legacy calculatePayroll called - use processAutomatedPayroll with aggregator instead');
  throw new Error('calculatePayroll is deprecated - use processAutomatedPayroll instead');
};

export const createAutomatedPayrollRun = async (params: {
  workspaceId: string;
  periodStart: Date;
  periodEnd: Date;
  createdBy: string;
}) => {
  // The processAutomatedPayroll already handles creating the run with proper pay period detection
  return await PayrollAutomationEngine.processAutomatedPayroll(
    params.workspaceId,
    params.createdBy
  );
};
