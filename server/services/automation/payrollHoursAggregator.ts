import { db } from "server/db";
import { timeEntries, employees, workspaces, clients, shifts, employeePayrollInfo } from "@shared/schema";
import { and, eq, gte, lte, inArray, isNull, isNotNull, or, sql } from "drizzle-orm";
import { resolveRates, bucketHours, calculateAmount, roundHours } from "./rateResolver";
import { getHolidayEntry, isHolidayDate } from "./holidayDetector";
import { calculatePayrollTaxes, type PayPeriod, type FilingStatus, type PayrollTaxBreakdown } from "../billing/payrollTaxService";
import { PayrollAutomationEngine } from "../payrollAutomation";
import { createLogger } from "../../lib/logger";

const log = createLogger('payroll-hours-aggregator');

/**
 * Payroll Hours Aggregation Service
 * 
 * Automatically collects approved, unpayrolled time entries for a pay period
 * and prepares them for payroll processing. This is the "data collection" 
 * automation that feeds into AI Payroll™.
 * 
 * CRITICAL: Must sort entries chronologically to ensure deterministic overtime
 * calculation per FLSA requirements.
 * 
 * Algorithm:
 * 1. Batch-load workspace settings and client metadata (eliminate N+1 queries)
 * 2. Group entries by employee
 * 3. Sort chronologically within each employee (for deterministic OT)
 * 4. Calculate overtime using workspace rules and weekly accumulator
 * 5. Return employee-level summaries with gross pay breakdown
 * 
 * Key Features:
 * - Finds approved time entries in date range
 * - Groups by employee for payroll calculation
 * - Calculates pay hours (regular, overtime, holiday)
 * - Applies pay rates using rate resolution precedence
 * - Filters out already-payrolled entries
 * - Validates data completeness
 */

export interface PayrollHoursSummary {
  workspaceId: string;
  periodStart: Date;
  periodEnd: Date;
  employeeSummaries: EmployeePayrollSummary[];
  totalPayrollAmount: number;
  totalPayrollTaxes: number;
  totalNetPay: number;
  warnings: string[];
  entriesProcessed: number;
}

export interface EmployeePayrollSummary {
  employeeId: string;
  employeeName: string;
  employeeNumber: string | null;
  employeeState: string | null;
  workerType: 'employee' | 'contractor';
  entries: TimeEntryPayroll[];
  totalHours: number;
  totalRegularHours: number;
  totalOvertimeHours: number;
  totalHolidayHours: number;
  regularPay: number;
  overtimePay: number;
  holidayPay: number;
  grossPay: number;
  netPay: number;
  taxes: PayrollTaxBreakdown | null;
  warnings: string[];
}

export interface TimeEntryPayroll {
  timeEntryId: string;
  clientId: string | null;
  clientName: string | null;
  clockIn: Date;
  clockOut: Date | null;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  holidayHours: number;
  payRate: number;
  regularPay: number;
  overtimePay: number;
  holidayPay: number;
  totalPay: number;
  rateSource: string;
  manuallyEdited?: boolean;
  manualEditReason?: string | null;
}

/**
 * Aggregate payroll hours for a workspace in a given period
 */
export async function aggregatePayrollHours(params: {
  workspaceId: string;
  startDate: Date;
  endDate: Date;
}): Promise<PayrollHoursSummary> {
  const { workspaceId, startDate, endDate } = params;

  log.info(`Aggregating for workspace ${workspaceId} from ${startDate.toISOString()} to ${endDate.toISOString()}`);

  // Get workspace settings for overtime rules, holiday calendar, and default rates
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }

  // Apply workspace overtime rules and default rates
  const enableDailyOT = workspace.enableDailyOvertime || false;
  const dailyOTThreshold = parseFloat(workspace.dailyOvertimeThreshold || "8.00");
  const weeklyOTThreshold = parseFloat(workspace.weeklyOvertimeThreshold || "40.00");
  const workspaceDefaultPayRate = workspace.defaultHourlyRate;
  
  // Holiday calendar and timezone for timezone-aware holiday detection
  const holidayCalendar = workspace.holidayCalendar as any[] || [];
  const workspaceTimezone = workspace.timezone || "America/New_York";
  const overtimeMultiplier = parseFloat(workspace.overtimePayMultiplier || "1.50");
  const defaultHolidayMultiplier = parseFloat(workspace.holidayPayMultiplier || "2.00");
  const payrollSchedule = (workspace.payrollSchedule || workspace.payrollCycle || 'biweekly').toString().toLowerCase();
  const payPeriodMap: Record<string, PayPeriod> = {
    weekly: 'weekly',
    biweekly: 'biweekly',
    'bi-weekly': 'biweekly',
    semimonthly: 'semimonthly',
    'semi-monthly': 'semimonthly',
    monthly: 'monthly',
  };
  const payPeriod = payPeriodMap[payrollSchedule] || 'biweekly';

  // Find all approved, unpayrolled time entries in period
  // Training guard: exclude entries linked to training shifts (isTrainingShift=true)
  // so seeded training data never bleeds into real payroll runs.
  const approvedEntries = await db
    .select({
      timeEntry: timeEntries,
      employee: employees,
    })
    .from(timeEntries)
    .leftJoin(employees, eq(timeEntries.employeeId, employees.id))
    .leftJoin(shifts, eq(timeEntries.shiftId, shifts.id))
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.status, 'approved'),
        isNull(timeEntries.payrolledAt),
        isNotNull(timeEntries.clockOut),
        gte(timeEntries.clockIn, startDate),
        lte(timeEntries.clockIn, endDate),
        or(isNull(timeEntries.shiftId), eq(shifts.isTrainingShift, false))
      )
    );

  log.info(`Found ${approvedEntries.length} approved, unpayrolled entries`);

  if (approvedEntries.length === 0) {
    return {
      workspaceId,
      periodStart: startDate,
      periodEnd: endDate,
      employeeSummaries: [],
      totalPayrollAmount: 0,
      totalPayrollTaxes: 0,
      totalNetPay: 0,
      warnings: ['No approved, unpayrolled time entries found in this period'],
      entriesProcessed: 0,
    };
  }

  // Batch-load all unique clients to eliminate N+1 queries
  const uniqueClientIds = Array.from(new Set(approvedEntries.map(e => e.timeEntry.clientId).filter(Boolean) as string[]));
  let clientsMap = new Map<string, string | null>();
  
  if (uniqueClientIds.length > 0) {
    const clientsList = await db
      .select({
        id: clients.id,
        companyName: clients.companyName,
      })
      .from(clients)
      .where(
        sql`${clients.id} IN (${sql.join(uniqueClientIds.map(id => sql`${id}`), sql.raw(', '))})`
      );
    
    clientsMap = new Map(clientsList.map(c => [c.id, c.companyName]));
  }

  const warnings: string[] = [];

  // Group entries by employee
  const employeeGroups = new Map<string, typeof approvedEntries>();
  for (const entry of approvedEntries) {
    const employeeId = entry.timeEntry.employeeId;
    if (!employeeGroups.has(employeeId)) {
      employeeGroups.set(employeeId, []);
    }
    employeeGroups.get(employeeId)!.push(entry);
  }

  const employeeIds = Array.from(employeeGroups.keys());
  const payrollInfoRows = employeeIds.length > 0
    ? await db.select({
        employeeId: employeePayrollInfo.employeeId,
        taxFilingStatus: employeePayrollInfo.taxFilingStatus,
        federalAllowances: employeePayrollInfo.federalAllowances,
        additionalWithholding: employeePayrollInfo.additionalWithholding,
        stateOfResidence: employeePayrollInfo.stateOfResidence,
      })
        .from(employeePayrollInfo)
        .where(inArray(employeePayrollInfo.employeeId, employeeIds))
    : [];
  const payrollInfoMap = new Map(payrollInfoRows.map(row => [row.employeeId, row]));

  const employeeSummaries: EmployeePayrollSummary[] = [];
  let totalPayrollAmount = 0;
  let totalPayrollTaxes = 0;
  let totalNetPay = 0;

  // Process each employee group
  for (const [employeeId, entries] of Array.from(employeeGroups)) {
    const firstEntry = entries[0];
    const employee = firstEntry.employee;

    if (!employee) {
      warnings.push(`Employee ${employeeId} not found - skipping entries`);
      continue;
    }

    const employeeName = `${employee.firstName} ${employee.lastName}`;
    const workerType: 'employee' | 'contractor' = (employee.is1099Eligible) ? 'contractor' : 'employee';
    const isContractor = workerType === 'contractor';

    if (isContractor) {
      log.info(`Employee ${employeeId} is a 1099 contractor — all hours treated as regular (no OT/holiday multipliers)`);
    }

    // Sort entries chronologically for deterministic overtime calculation
    const sortedEntries = entries.sort((a, b) => 
      a.timeEntry.clockIn.getTime() - b.timeEntry.clockIn.getTime()
    );

    const employeePayroll: TimeEntryPayroll[] = [];
    let employeeTotalHours = 0;
    let employeeTotalRegularHours = 0;
    let employeeTotalOvertimeHours = 0;
    let employeeTotalHolidayHours = 0;
    let employeeRegularPay = 0;
    let employeeOvertimePay = 0;
    let employeeHolidayPay = 0;
    const employeeWarnings: string[] = [];

    // Calculate cumulative hours for overtime calculation
    let weeklyHoursSoFar = 0;
    let currentWeekStart: Date | null = null;

    // Helper: Get start of ISO week (Monday at midnight) for a given date
    const getWeekStart = (date: Date): Date => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
      d.setDate(diff);
      d.setHours(0, 0, 0, 0); // Normalize to midnight for consistent comparison
      return d;
    };

    // Process each time entry for this employee
    for (const entry of sortedEntries) {
      const { timeEntry } = entry;

      // Reset weekly hours when crossing week boundary (FLSA compliance)
      const entryWeekStart = getWeekStart(timeEntry.clockIn);
      if (currentWeekStart === null || entryWeekStart.getTime() !== currentWeekStart.getTime()) {
        weeklyHoursSoFar = 0;
        currentWeekStart = entryWeekStart;
      }

      // Validate entry has required data
      if (!timeEntry.clockOut) {
        employeeWarnings.push(`Time entry ${timeEntry.id} missing clock-out - skipping`);
        continue;
      }

      if (!timeEntry.totalHours) {
        employeeWarnings.push(`Time entry ${timeEntry.id} missing total hours - skipping`);
        continue;
      }

      // Resolve pay rate with workspace default fallback
      const resolved = resolveRates({
        timeEntry,
        employeeHourlyRate: employee.hourlyRate,
        clientBillableRate: null, // Not used for payroll
        workspaceDefaultRate: workspaceDefaultPayRate,
      });

      if (resolved.hasWarning) {
        employeeWarnings.push(resolved.warningMessage!);
      }

      // Calculate hours bucketing (regular, OT, holiday) using workspace settings
      const totalHours = parseFloat(timeEntry.totalHours);
      
      // 1099 contractors: ALL hours are regular — no overtime or holiday multipliers
      // They are paid straight rate regardless of hours worked (no FLSA OT protection)
      let hoursBucket: { regularHours: number; overtimeHours: number; holidayHours: number };
      let holidayMultiplier = defaultHolidayMultiplier;
      
      if (isContractor) {
        hoursBucket = { regularHours: totalHours, overtimeHours: 0, holidayHours: 0 };
      } else {
        // Timezone-aware holiday detection using workspace holiday calendar
        const holidayEntry = getHolidayEntry(timeEntry.clockIn, holidayCalendar, workspaceTimezone);
        const isHoliday = !!holidayEntry;
        if (holidayEntry?.payMultiplier) {
          holidayMultiplier = holidayEntry.payMultiplier;
        }
        
        hoursBucket = bucketHours({
          totalHours,
          weeklyHoursSoFar,
          enableDailyOvertime: enableDailyOT,
          weeklyOvertimeThreshold: weeklyOTThreshold,
          isHoliday,
        });
      }

      // Update weekly hours accumulator for next entry
      weeklyHoursSoFar += totalHours;

      // Calculate pay amounts
      const regularPay = calculateAmount(hoursBucket.regularHours, resolved.payRate);
      const overtimePay = calculateAmount(hoursBucket.overtimeHours, resolved.payRate * overtimeMultiplier);
      const holidayPay = calculateAmount(hoursBucket.holidayHours, resolved.payRate * holidayMultiplier);
      const totalPay = regularPay + overtimePay + holidayPay;

      // Get client name from batch-loaded map
      const clientName = timeEntry.clientId ? clientsMap.get(timeEntry.clientId) || null : null;

      employeePayroll.push({
        timeEntryId: timeEntry.id,
        clientId: timeEntry.clientId,
        clientName,
        clockIn: timeEntry.clockIn,
        clockOut: timeEntry.clockOut,
        totalHours,
        regularHours: hoursBucket.regularHours,
        overtimeHours: hoursBucket.overtimeHours,
        holidayHours: hoursBucket.holidayHours,
        payRate: resolved.payRate,
        regularPay,
        overtimePay,
        holidayPay,
        totalPay,
        rateSource: resolved.rateSource,
        manuallyEdited: timeEntry.manuallyEdited || false,
        manualEditReason: (timeEntry as any).manualEditReason || null,
      });

      employeeTotalHours += totalHours;
      employeeTotalRegularHours += hoursBucket.regularHours;
      employeeTotalOvertimeHours += hoursBucket.overtimeHours;
      employeeTotalHolidayHours += hoursBucket.holidayHours;
      employeeRegularPay += regularPay;
      employeeOvertimePay += overtimePay;
      employeeHolidayPay += holidayPay;
    }

    // FLSA Weighted Average Overtime: Check if employee worked at multiple rates
    // If so, recalculate overtime using the weighted average method per FLSA requirements
    const uniqueRates = new Set(employeePayroll.map(e => e.payRate));
    
    if (uniqueRates.size > 1 && employeeTotalOvertimeHours > 0) {
      // Employee worked at multiple rates with overtime - use FLSA weighted average
      log.info(`Employee ${employeeId} worked at ${uniqueRates.size} different rates with OT - using FLSA weighted average`);

      // Build rate/hours array for FLSA calculation
      const rateHours = employeePayroll.map(e => ({
        rate: e.payRate,
        hours: e.totalHours
      }));

      // Calculate FLSA-compliant weighted average overtime
      const flsaResult = PayrollAutomationEngine.calculateFLSAWeightedAverageOvertime(
        rateHours,
        employeeTotalOvertimeHours
      );

      // Recalculate overtime pay using FLSA weighted average (half-time premium)
      const oldOvertimePay = employeeOvertimePay;
      employeeOvertimePay = flsaResult.overtimePremium;

      // Also recalculate regular pay as straight-time pay
      employeeRegularPay = flsaResult.straightTimePay;

      // Log the adjustment
      const adjustment = employeeOvertimePay - oldOvertimePay;
      if (Math.abs(adjustment) > 0.01) {
        employeeWarnings.push(
          `FLSA weighted average applied: OT adjusted by $${adjustment.toFixed(2)} ` +
          `(weighted avg rate: $${flsaResult.weightedAverageRate.toFixed(2)}/hr)`
        );
        log.info(`FLSA adjustment for employee ${employeeId}: delta $${adjustment.toFixed(2)}`);
      }
    }

    const grossPay = employeeRegularPay + employeeOvertimePay + employeeHolidayPay;
    let taxes: PayrollTaxBreakdown | null = null;
    let netPay = grossPay;
    if (!isContractor) {
      const payrollInfo = payrollInfoMap.get(employeeId);
      const filingStatusRaw = (payrollInfo?.taxFilingStatus || 'single').toString().toLowerCase().replace(/\s+/g, '_');
      const filingStatus: FilingStatus =
        filingStatusRaw === 'married' || filingStatusRaw === 'married_jointly'
          ? 'married_jointly'
          : filingStatusRaw === 'married_separately'
            ? 'married_separately'
            : filingStatusRaw === 'head_of_household'
              ? 'head_of_household'
              : 'single';
      const state = (payrollInfo?.stateOfResidence || employee.state || workspace.stateLicenseState || 'CA').toString();
      taxes = calculatePayrollTaxes({
        grossWage: grossPay,
        state,
        payPeriod,
        filingStatus,
        allowances: payrollInfo?.federalAllowances ?? 0,
        additionalWithholding: parseFloat(String(payrollInfo?.additionalWithholding || '0')),
      });
      netPay = taxes.netWage;
      totalPayrollTaxes += taxes.totalDeductions;
    }

    if (employeePayroll.length > 0) {
      employeeSummaries.push({
        employeeId,
        employeeName,
        employeeNumber: employee.employeeNumber,
        employeeState: employee.state || null,
        workerType,
        entries: employeePayroll,
        totalHours: roundHours(employeeTotalHours),
        totalRegularHours: roundHours(employeeTotalRegularHours),
        totalOvertimeHours: roundHours(employeeTotalOvertimeHours),
        totalHolidayHours: roundHours(employeeTotalHolidayHours),
        regularPay: employeeRegularPay,
        overtimePay: employeeOvertimePay,
        holidayPay: employeeHolidayPay,
        grossPay,
        netPay,
        taxes,
        warnings: employeeWarnings,
      });

      totalPayrollAmount += grossPay;
      totalNetPay += netPay;
    }

    warnings.push(...employeeWarnings);
  }

  log.info(`Processed ${approvedEntries.length} entries for ${employeeSummaries.length} employees`);

  return {
    workspaceId,
    periodStart: startDate,
    periodEnd: endDate,
    employeeSummaries,
    totalPayrollAmount,
    totalPayrollTaxes,
    totalNetPay,
    warnings,
    entriesProcessed: approvedEntries.length,
  };
}

/**
 * Mark time entries as payrolled after payroll processing
 */
export async function markEntriesAsPayrolled(params: {
  timeEntryIds: string[];
  payrollRunId?: string;
}): Promise<void> {
  const { timeEntryIds, payrollRunId } = params;

  let markedCount = 0;
  for (const entryId of timeEntryIds) {
    const result = await db
      .update(timeEntries)
      .set({
        payrolledAt: new Date(),
        payrollRunId: payrollRunId || null,
        updatedAt: new Date(),
      })
      .where(and(eq(timeEntries.id, entryId), isNull(timeEntries.payrolledAt)))
      .returning();
    
    if (result.length > 0) {
      markedCount++;
    } else {
      log.warn(`Entry ${entryId} already payrolled - skipping (race condition guard)`);
    }
  }

  log.info(`Marked ${markedCount}/${timeEntryIds.length} entries as payrolled${payrollRunId ? ` (run ${payrollRunId})` : ''}`);
}
