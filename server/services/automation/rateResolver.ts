import type { TimeEntry } from "@shared/schema";

/**
 * Rate Resolution Helper
 * 
 * Resolves billing and pay rates following the precedence order:
 * 1. Per-entry overrides (entry.hourlyRate from shift.hourlyRateOverride)
 * 2. Employee-specific rates (employee.hourlyRate)
 * 3. Client rates (clientRates.billableRate)
 * 4. Workspace defaults
 * 
 * This helper is used by both billable hours and payroll aggregators
 * to ensure consistent rate calculation across the platform.
 */

/**
 * Holiday Configuration (from workspace.holidayCalendar JSON)
 */
export interface HolidayEntry {
  date: string; // ISO date format "YYYY-MM-DD"
  name?: string; // Optional holiday name
  billMultiplier?: number; // Per-holiday billing override
  payMultiplier?: number; // Per-holiday pay override
}

/**
 * Check if a given date is a holiday
 * @param date Date to check
 * @param holidays Array of holiday configurations from workspace
 * @returns Holiday entry if found, null otherwise
 */
export function findHoliday(date: Date, holidays: any[]): HolidayEntry | null {
  if (!holidays || holidays.length === 0) {
    return null;
  }

  // Convert date to ISO format (YYYY-MM-DD) for comparison
  const dateStr = date.toISOString().split('T')[0];

  // Find matching holiday
  const holiday = holidays.find((h: any) => {
    if (typeof h === 'string') {
      return h === dateStr;
    }
    if (h && typeof h === 'object' && h.date) {
      return h.date === dateStr;
    }
    return false;
  });

  if (!holiday) {
    return null;
  }

  // Normalize to HolidayEntry format
  if (typeof holiday === 'string') {
    return { date: holiday };
  }

  return {
    date: holiday.date,
    name: holiday.name,
    billMultiplier: holiday.billMultiplier ? parseFloat(holiday.billMultiplier) : undefined,
    payMultiplier: holiday.payMultiplier ? parseFloat(holiday.payMultiplier) : undefined,
  };
}

export interface RateResolutionContext {
  timeEntry: TimeEntry;
  employeeHourlyRate?: string | null;
  clientBillableRate?: string | null;
  workspaceDefaultRate?: string | null;
}

export interface ResolvedRates {
  billingRate: number;
  payRate: number;
  rateSource: 'entry_override' | 'employee_rate' | 'client_rate' | 'workspace_default' | 'none';
  hasWarning: boolean;
  warningMessage?: string;
}

/**
 * Resolve billing and pay rates for a time entry
 */
export function resolveRates(context: RateResolutionContext): ResolvedRates {
  const { timeEntry, employeeHourlyRate, clientBillableRate, workspaceDefaultRate } = context;

  // Precedence 1: Per-entry override (from shift.hourlyRateOverride)
  if (timeEntry.hourlyRate) {
    const rate = parseFloat(timeEntry.hourlyRate);
    return {
      billingRate: rate,
      payRate: rate, // Entry rate applies to both billing and pay
      rateSource: 'entry_override',
      hasWarning: false,
    };
  }

  // Precedence 2: Employee-specific rate
  if (employeeHourlyRate) {
    const rate = parseFloat(employeeHourlyRate);
    return {
      billingRate: clientBillableRate ? parseFloat(clientBillableRate) : rate,
      payRate: rate,
      rateSource: 'employee_rate',
      hasWarning: false,
    };
  }

  // Precedence 3: Client billable rate (for billing only)
  if (clientBillableRate) {
    const rate = parseFloat(clientBillableRate);
    return {
      billingRate: rate,
      payRate: 0, // No pay rate available - will need manual review
      rateSource: 'client_rate',
      hasWarning: true,
      warningMessage: `Time entry ${timeEntry.id} has client rate but no pay rate - requires manual review`,
    };
  }

  // Precedence 4: Workspace default
  if (workspaceDefaultRate) {
    const rate = parseFloat(workspaceDefaultRate);
    return {
      billingRate: rate,
      payRate: rate,
      rateSource: 'workspace_default',
      hasWarning: false,
    };
  }

  // No rate found - flag for manual review
  return {
    billingRate: 0,
    payRate: 0,
    rateSource: 'none',
    hasWarning: true,
    warningMessage: `Time entry ${timeEntry.id} has no applicable rate - requires manual review`,
  };
}

/**
 * Calculate total amount for a time entry
 */
export function calculateAmount(hours: number, rate: number): number {
  return parseFloat((hours * rate).toFixed(2));
}

/**
 * Round hours to configured precision (default 2 decimal places)
 */
export function roundHours(hours: number, precision: number = 2): number {
  const multiplier = Math.pow(10, precision);
  return Math.round(hours * multiplier) / multiplier;
}

/**
 * Group hours by category (regular, overtime, holiday)
 */
export interface HoursBucket {
  regularHours: number;
  overtimeHours: number;
  holidayHours: number;
}

/**
 * Bucket hours into regular, overtime, and holiday categories
 * Based on workspace overtime policy (40-hour weekly or 8-hour daily)
 */
export function bucketHours(params: {
  totalHours: number;
  weeklyHoursSoFar: number;
  enableDailyOvertime: boolean;
  dailyOvertimeThreshold?: number;
  weeklyOvertimeThreshold?: number;
  isHoliday?: boolean;
}): HoursBucket {
  const {
    totalHours,
    weeklyHoursSoFar,
    enableDailyOvertime,
    dailyOvertimeThreshold = 8,
    weeklyOvertimeThreshold = 40,
    isHoliday = false,
  } = params;

  // Holiday hours get special treatment - all hours count as holiday
  // Holidays override overtime calculation (per architect guidance)
  if (isHoliday) {
    return {
      regularHours: 0,
      overtimeHours: 0,
      holidayHours: roundHours(totalHours),
    };
  }

  let regularHours = 0;
  let overtimeHours = 0;

  // Daily overtime check
  if (enableDailyOvertime && totalHours > dailyOvertimeThreshold) {
    regularHours = dailyOvertimeThreshold;
    overtimeHours = roundHours(totalHours - dailyOvertimeThreshold);
  }
  // Weekly overtime check
  else if (weeklyHoursSoFar + totalHours > weeklyOvertimeThreshold) {
    const hoursBeforeOT = Math.max(0, weeklyOvertimeThreshold - weeklyHoursSoFar);
    regularHours = roundHours(hoursBeforeOT);
    overtimeHours = roundHours(totalHours - hoursBeforeOT);
  }
  // All regular hours
  else {
    regularHours = roundHours(totalHours);
    overtimeHours = 0;
  }

  return {
    regularHours,
    overtimeHours,
    holidayHours: 0,
  };
}

/**
 * Apply rate multipliers to bucketed hours
 * Precedence for multipliers: per-holiday override → client override → workspace default
 */
export interface MultiplierContext {
  baseRate: number;
  overtimeBillableMultiplier: number;
  overtimePayMultiplier: number;
  holidayBillableMultiplier: number;
  holidayPayMultiplier: number;
  holidayEntry?: HolidayEntry | null;
  clientOvertimeMultiplier?: number | null;
  clientHolidayMultiplier?: number | null;
}

export interface BucketedAmounts {
  regularAmount: number;
  overtimeAmount: number;
  holidayAmount: number;
  totalAmount: number;
  billingMultipliers: {
    regular: number;
    overtime: number;
    holiday: number;
  };
}

/**
 * Calculate billing amounts with multipliers applied to each bucket
 */
export function calculateBillingAmounts(
  bucket: HoursBucket,
  context: MultiplierContext
): BucketedAmounts {
  const {
    baseRate,
    overtimeBillableMultiplier,
    holidayBillableMultiplier,
    holidayEntry,
    clientOvertimeMultiplier,
    clientHolidayMultiplier,
  } = context;

  // Resolve overtime multiplier (client override → workspace default)
  const otMultiplier = clientOvertimeMultiplier !== null && clientOvertimeMultiplier !== undefined
    ? clientOvertimeMultiplier
    : overtimeBillableMultiplier;

  // Resolve holiday multiplier (per-holiday → client override → workspace default)
  let holidayMultiplier = holidayBillableMultiplier;
  if (holidayEntry?.billMultiplier !== undefined) {
    holidayMultiplier = holidayEntry.billMultiplier;
  } else if (clientHolidayMultiplier !== null && clientHolidayMultiplier !== undefined) {
    holidayMultiplier = clientHolidayMultiplier;
  }

  // Calculate amounts per bucket
  const regularAmount = calculateAmount(bucket.regularHours, baseRate);
  const overtimeAmount = calculateAmount(bucket.overtimeHours, baseRate * otMultiplier);
  const holidayAmount = calculateAmount(bucket.holidayHours, baseRate * holidayMultiplier);

  return {
    regularAmount,
    overtimeAmount,
    holidayAmount,
    totalAmount: regularAmount + overtimeAmount + holidayAmount,
    billingMultipliers: {
      regular: 1.0,
      overtime: otMultiplier,
      holiday: holidayMultiplier,
    },
  };
}

/**
 * Calculate payroll amounts with multipliers applied to each bucket
 */
export function calculatePayrollAmounts(
  bucket: HoursBucket,
  context: MultiplierContext
): BucketedAmounts {
  const {
    baseRate,
    overtimePayMultiplier,
    holidayPayMultiplier,
    holidayEntry,
  } = context;

  // For payroll, client overrides don't apply (employee-specific rates only)
  const otMultiplier = overtimePayMultiplier;

  // Resolve holiday multiplier (per-holiday → workspace default)
  const holidayMultiplier = holidayEntry?.payMultiplier !== undefined
    ? holidayEntry.payMultiplier
    : holidayPayMultiplier;

  // Calculate amounts per bucket
  const regularAmount = calculateAmount(bucket.regularHours, baseRate);
  const overtimeAmount = calculateAmount(bucket.overtimeHours, baseRate * otMultiplier);
  const holidayAmount = calculateAmount(bucket.holidayHours, baseRate * holidayMultiplier);

  return {
    regularAmount,
    overtimeAmount,
    holidayAmount,
    totalAmount: regularAmount + overtimeAmount + holidayAmount,
    billingMultipliers: {
      regular: 1.0,
      overtime: otMultiplier,
      holiday: holidayMultiplier,
    },
  };
}
