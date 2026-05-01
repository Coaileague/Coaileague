import type { TimeEntry } from "@shared/schema";
import {
  addFinancialValues,
  formatCurrency,
  multiplyFinancialValues,
  toFinancialString,
} from "../financialCalculator";
import { createLogger } from '../../lib/logger';
const log = createLogger('rateResolver');


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
 * Convert a UTC timestamp to local date string (YYYY-MM-DD) in workspace timezone
 * Uses UTC as fallback if timezone not configured
 */
export function toLocalDateString(date: Date, timezone?: string): string {
  if (!timezone) {
    // Fallback to UTC if no timezone configured
    return date.toISOString().split('T')[0];
  }

  try {
    // Use Intl API for timezone-aware date formatting
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    
    // Format returns "YYYY-MM-DD" in en-CA locale
    return formatter.format(date);
  } catch (error) {
    log.warn(`[RateResolver] Invalid timezone "${timezone}", falling back to UTC`);
    return date.toISOString().split('T')[0];
  }
}

/**
 * Check if a given date is a holiday (timezone-aware)
 * @param date Date to check (UTC timestamp)
 * @param holidays Array of holiday configurations from workspace
 * @param timezone Workspace timezone (IANA format, e.g., "America/New_York")
 * @returns Holiday entry if found, null otherwise
 */
export function findHoliday(date: Date, holidays: any[], timezone?: string): HolidayEntry | null {
  if (!holidays || holidays.length === 0) {
    return null;
  }

  // Convert date to local date string in workspace timezone
  const dateStr = toLocalDateString(date, timezone);

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

/**
 * Daily segment for multi-day shift handling
 */
export interface DailySegment {
  date: string; // ISO date "YYYY-MM-DD" in workspace timezone
  startTime: Date; // UTC timestamp for segment start
  endTime: Date; // UTC timestamp for segment end
  hours: number; // Hours in this segment
}

/**
 * Split a shift spanning multiple calendar days into daily segments
 * Critical for correct holiday hour calculation
 * 
 * Example: Shift from Dec 25 22:00 -> Dec 26 06:00 (8 hours)
 * Segments: [
 *   {date: "2025-12-25", hours: 2.0},  // 22:00-00:00
 *   {date: "2025-12-26", hours: 6.0}   // 00:00-06:00
 * ]
 */
export function splitShiftIntoDays(
  clockIn: Date,
  clockOut: Date,
  timezone?: string
): DailySegment[] {
  const segments: DailySegment[] = [];
  
  // Handle same-day shifts (optimization)
  const clockInDate = toLocalDateString(clockIn, timezone);
  const clockOutDate = toLocalDateString(clockOut, timezone);
  
  if (clockInDate === clockOutDate) {
    // Same calendar day - no split needed
    const hours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
    return [{
      date: clockInDate,
      startTime: clockIn,
      endTime: clockOut,
      hours: roundHours(hours),
    }];
  }

  // Multi-day shift - split at midnight boundaries in workspace timezone
  let currentTime = new Date(clockIn);
  
  while (currentTime < clockOut) {
    const currentDate = toLocalDateString(currentTime, timezone);
    
    // Find midnight of next day in workspace timezone
    const nextMidnight = getNextMidnight(currentTime, timezone);
    const segmentEnd = nextMidnight > clockOut ? clockOut : nextMidnight;
    
    const segmentHours = (segmentEnd.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
    
    segments.push({
      date: currentDate,
      startTime: new Date(currentTime),
      endTime: new Date(segmentEnd),
      hours: roundHours(segmentHours),
    });
    
    currentTime = segmentEnd;
  }
  
  return segments;
}

/**
 * Get the next midnight in workspace timezone
 * Returns UTC timestamp representing midnight in the specified timezone
 * 
 * Approach: Format current and next-day dates in target timezone,
 * calculate offset, and apply to find UTC time of next midnight.
 */
function getNextMidnight(date: Date, timezone?: string): Date {
  if (!timezone) {
    // UTC fallback
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(0, 0, 0, 0);
    return next;
  }

  try {
    // Get the current local date in the target timezone
    const currentLocalDate = toLocalDateString(date, timezone);
    const [year, month, day] = currentLocalDate.split('-').map(Number);
    
    // Calculate next day's date
    const nextDate = new Date(year, month - 1, day + 1);
    const nextYear = nextDate.getFullYear();
    const nextMonth = nextDate.getMonth() + 1;
    const nextDay = nextDate.getDate();
    
    // Create a probe date: assume next day midnight is at this UTC time
    const probeUTC = Date.UTC(nextYear, nextMonth - 1, nextDay, 0, 0, 0, 0);
    const probeDate = new Date(probeUTC);
    
    // Format this probe date as it appears in the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    
    // Parse the formatted result to extract time offset
    const parts = formatter.formatToParts(probeDate);
    const hourPart = parts.find(p => p.type === 'hour');
    const minutePart = parts.find(p => p.type === 'minute');
    const tzHour = hourPart ? parseInt(hourPart.value) : 0;
    const tzMinute = minutePart ? parseInt(minutePart.value) : 0;
    
    // Calculate offset in milliseconds
    // If probe shows "08:00" in TZ when we set UTC to "00:00", 
    // then TZ is 8 hours ahead, so we need to subtract 8 hours from UTC
    const offsetMs = (tzHour * 60 + tzMinute) * 60 * 1000;
    
    // Apply offset to get true UTC time of next midnight in TZ
    const midnightUTC = new Date(probeUTC - offsetMs);
    
    // Validation: ensure result is actually after the input date
    if (midnightUTC <= date) {
      // If not, add 24 hours
      midnightUTC.setUTCHours(midnightUTC.getUTCHours() + 24);
    }
    
    return midnightUTC;
    
  } catch (error) {
    log.warn(`[RateResolver] Error calculating next midnight in ${timezone}:`, error);
    const fallback = new Date(date);
    fallback.setUTCDate(fallback.getUTCDate() + 1);
    fallback.setUTCHours(0, 0, 0, 0);
    return fallback;
  }
}

/**
 * License-expiry segment for invoice/payroll splitting.
 *
 * Texas OC §1702.201 / §1702.161 mandate that hours worked under an EXPIRED license cannot be
 * billed at the armed rate. When a guard's Level III commission lapses mid-shift the invoice
 * MUST be split: hours up to the expiry timestamp are billed at the armed rate, hours after at
 * either the unarmed rate (if the contract permits) or unbilled.
 *
 * This helper is the building block. It does NOT make billing decisions — it only segments the
 * shift around the expiry timestamp. Callers (billableHoursAggregator) decide per-segment rates.
 */
export interface LicenseExpirySegment {
  startTime: Date;
  endTime: Date;
  hours: number;
  /** True when the license was valid for the entirety of this segment. */
  licenseValid: boolean;
  /** Texas regulatory citation when this segment is post-expiry. */
  citation?: string;
}

/**
 * Split a shift into pre-expiry and post-expiry segments for invoice/payroll regulatory accuracy.
 *
 * - If `licenseExpiresAt` is null/undefined → returns a single `licenseValid: true` segment.
 * - If expiry falls before the shift starts → single `licenseValid: false` segment.
 * - If expiry falls after the shift ends → single `licenseValid: true` segment.
 * - Otherwise → two segments at the expiry boundary.
 *
 * This mirrors `splitShiftIntoDays` (midnight boundary) — same invariant: total hours of the
 * returned segments equals the original shift hours, and segments do not overlap.
 */
export function splitShiftAtLicenseExpiry(
  clockIn: Date,
  clockOut: Date,
  licenseExpiresAt: Date | null | undefined,
  citation: string = 'TX OC §1702.201',
): LicenseExpirySegment[] {
  const totalHours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);

  if (!licenseExpiresAt) {
    return [{ startTime: clockIn, endTime: clockOut, hours: roundHours(totalHours), licenseValid: true }];
  }

  if (licenseExpiresAt <= clockIn) {
    // Expired before the shift even started — entire shift is post-expiry.
    return [{ startTime: clockIn, endTime: clockOut, hours: roundHours(totalHours), licenseValid: false, citation }];
  }

  if (licenseExpiresAt >= clockOut) {
    // Expired after the shift ended — entire shift was valid.
    return [{ startTime: clockIn, endTime: clockOut, hours: roundHours(totalHours), licenseValid: true }];
  }

  const preHours = (licenseExpiresAt.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
  const postHours = (clockOut.getTime() - licenseExpiresAt.getTime()) / (1000 * 60 * 60);

  return [
    { startTime: clockIn, endTime: licenseExpiresAt, hours: roundHours(preHours), licenseValid: true },
    { startTime: licenseExpiresAt, endTime: clockOut, hours: roundHours(postHours), licenseValid: false, citation },
  ];
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
 *
 * Precedence order (highest -> lowest):
 *   0. capturedBillRate / capturedPayRate  — snapshotted at clock-in (historical lock)
 *   1. hourlyRate                          — per-entry override from shift.hourlyRateOverride
 *   2. employeeHourlyRate                  — employee default rate
 *   3. clientBillableRate                  — client contract rate
 *   4. workspaceDefaultRate                — workspace fallback
 */
export function resolveRates(context: RateResolutionContext): ResolvedRates {
  const { timeEntry, employeeHourlyRate, clientBillableRate, workspaceDefaultRate } = context;

  // Precedence 0: Captured snapshot from clock-in (prevents rate drift between clock-in and invoice)
  // capturedBillRate is the client contract rate at clock-in; capturedPayRate is employee rate at clock-in.
  // These are independent — billing and pay rates can differ.
  const capturedBill = timeEntry.capturedBillRate ? parseFloat(timeEntry.capturedBillRate) : null;
  const capturedPay  = timeEntry.capturedPayRate  ? parseFloat(timeEntry.capturedPayRate)  : null;
  if (capturedBill !== null || capturedPay !== null) {
    return {
      billingRate: capturedBill ?? capturedPay ?? 0,
      payRate:     capturedPay  ?? capturedBill ?? 0,
      rateSource: 'entry_override',
      hasWarning: false,
    };
  }

  // Safe numeric parser: returns 0 and a warning flag when parseFloat yields NaN or negative.
  const safeRate = (raw: string | null | undefined, label: string): { value: number; invalid: boolean } => {
    const n = parseFloat(raw ?? '');
    if (Number.isNaN(n) || n < 0) {
      return { value: 0, invalid: true };
    }
    return { value: n, invalid: false };
  };

  // Precedence 1: Per-entry override (from shift.hourlyRateOverride — manager-set shift rate)
  if (timeEntry.hourlyRate) {
    const { value: rate, invalid } = safeRate(timeEntry.hourlyRate, 'entry_override');
    const { value: billingRate } = clientBillableRate ? safeRate(clientBillableRate, 'client_billing') : { value: rate, invalid: false };
    return {
      billingRate,
      payRate: rate,
      rateSource: 'entry_override',
      hasWarning: invalid,
      ...(invalid ? { warningMessage: `Time entry ${timeEntry.id} has an invalid hourlyRate — defaulted to 0` } : {}),
    };
  }

  // Precedence 2: Employee-specific rate
  if (employeeHourlyRate) {
    const { value: rate, invalid } = safeRate(employeeHourlyRate, 'employee_rate');
    const { value: billingRate } = clientBillableRate ? safeRate(clientBillableRate, 'client_billing') : { value: rate, invalid: false };
    return {
      billingRate,
      payRate: rate,
      rateSource: 'employee_rate',
      hasWarning: invalid,
      ...(invalid ? { warningMessage: `Employee rate for time entry ${timeEntry.id} is invalid — defaulted to 0` } : {}),
    };
  }

  // Precedence 3: Client billable rate (for billing only)
  if (clientBillableRate) {
    const { value: rate, invalid } = safeRate(clientBillableRate, 'client_rate');
    return {
      billingRate: rate,
      payRate: 0, // No pay rate available — requires manual review
      rateSource: 'client_rate',
      hasWarning: true,
      warningMessage: invalid
        ? `Time entry ${timeEntry.id} has invalid client rate — requires manual review`
        : `Time entry ${timeEntry.id} has client rate but no pay rate - requires manual review`,
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

  // No rate found — flag for manual review
  return {
    billingRate: 0,
    payRate: 0,
    rateSource: 'none',
    hasWarning: true,
    warningMessage: `Time entry ${timeEntry.id} has no applicable rate - requires manual review`,
  };
}

function moneyNumber(amount: string | number): number {
  return Number(formatCurrency(toFinancialString(amount)));
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

/**
 * Calculate total amount for a time entry
 */
export function calculateAmount(hours: number, rate: number): number {
  return multiplyMoney(hours, rate);
}

function calculateAmountWithMultiplier(hours: number, baseRate: number, multiplier: number): number {
  return calculateAmount(hours, multiplyMoney(baseRate, multiplier));
}

// ============================================================================
// DIFFERENTIAL PAY PREMIUMS  (GAP-RATE-1 Fix)
// Workspace-configurable night-shift, weekend, and hazard differentials.
// Config is stored in orgFinanceSettings.differentialRatesConfig (JSONB).
// Callers: payrollHoursAggregator (after resolveRates) and billableHoursAggregator.
// ============================================================================

export interface DifferentialRatesConfig {
  nightShiftEnabled: boolean;
  nightShiftStartHour: number;
  nightShiftEndHour: number;
  nightShiftMultiplier: number;
  weekendEnabled: boolean;
  weekendMultiplier: number;
  hazardEnabled: boolean;
  hazardMultiplier: number;
}

/**
 * Apply workspace-configured differential premiums to a resolved base pay rate.
 *
 * Night shift detection: hour-of-day range (UTC) at clock-in.
 * Weekend detection: Saturday (6) or Sunday (0) at clock-in UTC day.
 * Hazard: config-level flag only — actual application requires a per-shift hazard tag
 *         which is checked by the calling aggregator.
 *
 * The highest qualifying multiplier wins (multipliers do not stack).
 */
export function applyDifferentialPremium(
  basePayRate: number,
  clockIn: Date,
  config: DifferentialRatesConfig | null | undefined,
): { adjustedRate: number; appliedDifferentials: string[]; multiplier: number } {
  if (!config) return { adjustedRate: basePayRate, appliedDifferentials: [], multiplier: 1.0 };

  let multiplier = 1.0;
  const appliedDifferentials: string[] = [];

  const clockInHour = clockIn.getUTCHours();
  const clockInDay = clockIn.getUTCDay();

  if (config.nightShiftEnabled && config.nightShiftMultiplier > 1.0) {
    const start = config.nightShiftStartHour ?? 22;
    const end = config.nightShiftEndHour ?? 6;
    const isNight = start > end
      ? (clockInHour >= start || clockInHour < end)
      : (clockInHour >= start && clockInHour < end);
    if (isNight) {
      multiplier = Math.max(multiplier, config.nightShiftMultiplier);
      appliedDifferentials.push('night_shift');
    }
  }

  if (config.weekendEnabled && config.weekendMultiplier > 1.0) {
    if (clockInDay === 0 || clockInDay === 6) {
      multiplier = Math.max(multiplier, config.weekendMultiplier);
      appliedDifferentials.push('weekend');
    }
  }

  if (config.hazardEnabled && config.hazardMultiplier > 1.0) {
    appliedDifferentials.push('hazard_eligible');
  }

  return {
    adjustedRate: Number(toFinancialString(multiplyFinancialValues(toFinancialString(basePayRate), toFinancialString(multiplier)))),
    appliedDifferentials,
    multiplier,
  };
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
 * Precedence for multipliers: per-holiday override -> client override -> workspace default
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
  appliedMultipliers: {
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

  // Resolve overtime multiplier (client override -> workspace default)
  const otMultiplier = clientOvertimeMultiplier !== null && clientOvertimeMultiplier !== undefined
    ? clientOvertimeMultiplier
    : overtimeBillableMultiplier;

  // Resolve holiday multiplier (per-holiday -> client override -> workspace default)
  let holidayMultiplier = holidayBillableMultiplier;
  if (holidayEntry?.billMultiplier !== undefined) {
    holidayMultiplier = holidayEntry.billMultiplier;
  } else if (clientHolidayMultiplier !== null && clientHolidayMultiplier !== undefined) {
    holidayMultiplier = clientHolidayMultiplier;
  }

  // Calculate amounts per bucket
  const regularAmount = calculateAmount(bucket.regularHours, baseRate);
  const overtimeAmount = calculateAmountWithMultiplier(bucket.overtimeHours, baseRate, otMultiplier);
  const holidayAmount = calculateAmountWithMultiplier(bucket.holidayHours, baseRate, holidayMultiplier);

  return {
    regularAmount,
    overtimeAmount,
    holidayAmount,
    totalAmount: addMoney(regularAmount, overtimeAmount, holidayAmount),
    appliedMultipliers: {
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

  // Resolve holiday multiplier (per-holiday -> workspace default)
  const holidayMultiplier = holidayEntry?.payMultiplier !== undefined
    ? holidayEntry.payMultiplier
    : holidayPayMultiplier;

  // Calculate amounts per bucket
  const regularAmount = calculateAmount(bucket.regularHours, baseRate);
  const overtimeAmount = calculateAmountWithMultiplier(bucket.overtimeHours, baseRate, otMultiplier);
  const holidayAmount = calculateAmountWithMultiplier(bucket.holidayHours, baseRate, holidayMultiplier);

  return {
    regularAmount,
    overtimeAmount,
    holidayAmount,
    totalAmount: addMoney(regularAmount, overtimeAmount, holidayAmount),
    appliedMultipliers: {
      regular: 1.0,
      overtime: otMultiplier,
      holiday: holidayMultiplier,
    },
  };
}
