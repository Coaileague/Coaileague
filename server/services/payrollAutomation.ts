/**
 * PayrollOS™ Automation Engine
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
import { eq, and, gte, lte, isNull, sql, notInArray } from "drizzle-orm";
import { startOfWeek, endOfWeek, subWeeks, format, startOfMonth, endOfMonth, subMonths } from "date-fns";
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
  federalTax: number;
  stateTax: number;
  socialSecurity: number;
  medicare: number;
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
   * Calculate state tax (simplified - flat 5% for demo)
   * In production, this would use state-specific tables
   */
  static calculateStateTax(grossPay: number, state: string = 'CA'): number {
    // Simplified state tax - 5% flat rate
    // In production, use state-specific tax tables
    return parseFloat((grossPay * 0.05).toFixed(2));
  }
  
  /**
   * Calculate Social Security (6.2% up to wage base $168,600)
   */
  static calculateSocialSecurity(grossPay: number): number {
    const SS_RATE = 0.062;
    const WAGE_BASE = 168600; // 2024 wage base
    
    // For simplicity, not tracking YTD - in production track cumulative
    return parseFloat((grossPay * SS_RATE).toFixed(2));
  }
  
  /**
   * Calculate Medicare (1.45% no limit)
   */
  static calculateMedicare(grossPay: number): number {
    const MEDICARE_RATE = 0.0145;
    return parseFloat((grossPay * MEDICARE_RATE).toFixed(2));
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
      console.warn('[PayrollOS™] Payroll hours aggregation warnings:', aggregationResult.warnings);
    }
    
    // Fail early if no employees to process (prevent empty payroll runs)
    if (aggregationResult.employeeSummaries.length === 0) {
      console.warn('[PayrollOS™] No employees with approved hours for period:', payPeriod);
      throw new Error('No employees with approved time entries found for payroll period');
    }
    
    const calculations: PayrollCalculation[] = [];
    let totalGrossPay = 0;
    let totalNetPay = 0;
    
    // Collect all time entry IDs for marking as payrolled after approval
    const allTimeEntryIds: string[] = [];
    const allWarnings = [...aggregationResult.warnings];
    
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
        console.warn(`[PayrollOS™] ${warning}`);
      }
      
      // Calculate taxes and deductions on gross pay
      const federalTax = this.calculateFederalTax(grossPay, payPeriod.type);
      const stateTax = this.calculateStateTax(grossPay);
      const socialSecurity = this.calculateSocialSecurity(grossPay);
      const medicare = this.calculateMedicare(grossPay);
      
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
        federalTax,
        stateTax,
        socialSecurity,
        medicare,
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
      console.warn(`[PayrollOS™] Approved payroll ${payrollRunId} without marking entries - timeEntryIds not provided`);
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
  console.warn('[PayrollOS™] Legacy calculatePayroll called - use processAutomatedPayroll with aggregator instead');
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
