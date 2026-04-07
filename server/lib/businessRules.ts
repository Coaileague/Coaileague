import { Decimal } from 'decimal.js';
import { WORKSPACE_ROLE_HIERARCHY } from './rbac/roleDefinitions';

// ─── PAY RATE RULES ───────────────────────────────────────────────────────────
export const PAY_RATE_RULES = {
  minimum: '0.01',
  maximum: '999.99',
  decimalPlaces: 4,
} as const;

// ─── HOURS RULES ─────────────────────────────────────────────────────────────
export const HOURS_RULES = {
  minimumPerShift: '0',
  maximumPerShift: '24',
  maximumPerWeek: '168',
} as const;

// ─── SHIFT TIME RULES ────────────────────────────────────────────────────────
export const SHIFT_TIME_RULES = {
  endMustBeAfterStart: true,
  minimumDurationMinutes: 0,
  maximumDurationHours: 24,
  pastLookbackDays: 90,
  futureLookAheadDays: 365,
} as const;

// ─── INVOICE RULES ───────────────────────────────────────────────────────────
export const INVOICE_RULES = {
  minimumAmount: '0.01',
  maximumAmount: '999999.99',
  minimumLineItems: 1,
  dueDateMinimumDaysFromNow: 0,
  dueDateMaximumDaysFromNow: 365,
} as const;

// ─── BILLING RATE RULES ──────────────────────────────────────────────────────
export const BILLING_RATE_RULES = {
  minimum: '0.01',
  maximum: '9999.99',
} as const;

// ─── PAYROLL PERIOD RULES ────────────────────────────────────────────────────
export const PAYROLL_PERIOD_RULES = {
  endMustBeAfterStart: true,
  maximumPeriodDays: 31,
  cannotOverlapClosedRun: true,
} as const;

// ─── ROLE ASSIGNMENT RULES ───────────────────────────────────────────────────
// Phase 9 F-3: Uses the full 11-role WORKSPACE_ROLE_HIERARCHY from roleDefinitions.ts.
// The previous stale 4-role map ('officer','supervisor','manager','owner') is removed.
// Hierarchy: org_owner(7) > co_owner(6) > org_admin(5) > org_manager/manager/dept_manager(4)
//            > supervisor(3) > employee/staff(2) > contractor/auditor(1)
//
// Phase 25 RBAC — Ownership gate:
// Roles at level 3+ (supervisor and above) may ONLY be granted by org_owner or
// co_owner. Regular managers (level 4) cannot escalate peers to supervisor+.
// Platform staff bypass this via isPlatStaff checks in route handlers.

const OWNER_ONLY_ASSIGNABLE_LEVEL = 3; // supervisor(3) and above require owner

export function canAssignRole(assignerRole: string, targetRole: string): boolean {
  const assignerLevel = WORKSPACE_ROLE_HIERARCHY[assignerRole] ?? 0;
  const targetLevel = WORKSPACE_ROLE_HIERARCHY[targetRole] ?? 0;
  return assignerLevel > targetLevel;
}

/**
 * Returns true when the targetRole requires an org_owner or co_owner (level 6+)
 * to assign it. Any role at supervisor level (3) or above is owner-gated.
 * org_owner itself is additionally gated behind platform staff in route handlers.
 */
export function requiresOwnerToAssign(targetRole: string): boolean {
  const level = WORKSPACE_ROLE_HIERARCHY[targetRole] ?? 0;
  return level >= OWNER_ONLY_ASSIGNABLE_LEVEL;
}

/** Minimum workspace role level required to assign supervisor+ roles */
export const OWNER_ASSIGN_MIN_LEVEL = 6; // co_owner(6) or org_owner(7)

// ─── VIOLATION SHAPE ─────────────────────────────────────────────────────────
export interface BusinessRuleViolation {
  field: string;
  rule: string;
  message: string;
  received: string | number | null;
  allowed: string;
}

// ─── VALIDATORS ──────────────────────────────────────────────────────────────

export function validatePayRate(
  rate: string | number | null | undefined,
  fieldName: string = 'payRate',
): BusinessRuleViolation | null {
  if (rate === null || rate === undefined || rate === '') return null;
  try {
    const d = new Decimal(String(rate));
    if (d.lessThan(PAY_RATE_RULES.minimum)) {
      return {
        field: fieldName,
        rule: 'PAY_RATE_MINIMUM',
        message: `Pay rate must be at least $${PAY_RATE_RULES.minimum}`,
        received: String(rate),
        allowed: `>= ${PAY_RATE_RULES.minimum}`,
      };
    }
    if (d.greaterThan(PAY_RATE_RULES.maximum)) {
      return {
        field: fieldName,
        rule: 'PAY_RATE_MAXIMUM',
        message: `Pay rate cannot exceed $${PAY_RATE_RULES.maximum}`,
        received: String(rate),
        allowed: `<= ${PAY_RATE_RULES.maximum}`,
      };
    }
  } catch {
    return {
      field: fieldName,
      rule: 'PAY_RATE_INVALID',
      message: `Pay rate must be a valid number`,
      received: String(rate),
      allowed: `numeric value between ${PAY_RATE_RULES.minimum} and ${PAY_RATE_RULES.maximum}`,
    };
  }
  return null;
}

export function validateShiftTimes(
  startTime: Date,
  endTime: Date,
): BusinessRuleViolation | null {
  if (endTime <= startTime) {
    return {
      field: 'endTime',
      rule: 'SHIFT_END_AFTER_START',
      message: 'Shift end time must be after start time',
      received: endTime.toISOString(),
      allowed: `> ${startTime.toISOString()}`,
    };
  }
  const durationHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
  if (durationHours > SHIFT_TIME_RULES.maximumDurationHours) {
    return {
      field: 'endTime',
      rule: 'SHIFT_DURATION_MAXIMUM',
      message: `Shift duration cannot exceed ${SHIFT_TIME_RULES.maximumDurationHours} hours`,
      received: `${durationHours.toFixed(2)} hours`,
      allowed: `<= ${SHIFT_TIME_RULES.maximumDurationHours} hours`,
    };
  }
  return null;
}

export function validateShiftStartPast(startTime: Date): BusinessRuleViolation | null {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SHIFT_TIME_RULES.pastLookbackDays);
  if (startTime < cutoff) {
    return {
      field: 'startTime',
      rule: 'SHIFT_START_TOO_FAR_PAST',
      message: `Shift start cannot be more than ${SHIFT_TIME_RULES.pastLookbackDays} days in the past`,
      received: startTime.toISOString(),
      allowed: `>= ${cutoff.toISOString()}`,
    };
  }
  return null;
}

export function validateShiftEndFuture(endTime: Date): BusinessRuleViolation | null {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + SHIFT_TIME_RULES.futureLookAheadDays);
  if (endTime > cutoff) {
    return {
      field: 'endTime',
      rule: 'SHIFT_END_TOO_FAR_FUTURE',
      message: `Shift end cannot be more than ${SHIFT_TIME_RULES.futureLookAheadDays} days in the future`,
      received: endTime.toISOString(),
      allowed: `<= ${cutoff.toISOString()}`,
    };
  }
  return null;
}

export function validateInvoiceAmount(
  amount: string | number | null | undefined,
  fieldName: string = 'amount',
): BusinessRuleViolation | null {
  if (amount === null || amount === undefined || amount === '') return null;
  try {
    const d = new Decimal(String(amount));
    if (d.lessThan(INVOICE_RULES.minimumAmount)) {
      return {
        field: fieldName,
        rule: 'INVOICE_AMOUNT_MINIMUM',
        message: `Invoice amount must be at least $${INVOICE_RULES.minimumAmount}`,
        received: String(amount),
        allowed: `>= ${INVOICE_RULES.minimumAmount}`,
      };
    }
    if (d.greaterThan(INVOICE_RULES.maximumAmount)) {
      return {
        field: fieldName,
        rule: 'INVOICE_AMOUNT_MAXIMUM',
        message: `Invoice amount cannot exceed $${INVOICE_RULES.maximumAmount}`,
        received: String(amount),
        allowed: `<= ${INVOICE_RULES.maximumAmount}`,
      };
    }
  } catch {
    return {
      field: fieldName,
      rule: 'INVOICE_AMOUNT_INVALID',
      message: `Invoice amount must be a valid number`,
      received: String(amount),
      allowed: `numeric value between ${INVOICE_RULES.minimumAmount} and ${INVOICE_RULES.maximumAmount}`,
    };
  }
  return null;
}

export function validateBillingRate(
  rate: string | number | null | undefined,
  fieldName: string = 'billingRate',
): BusinessRuleViolation | null {
  if (rate === null || rate === undefined || rate === '') return null;
  try {
    const d = new Decimal(String(rate));
    if (d.lessThan(BILLING_RATE_RULES.minimum)) {
      return {
        field: fieldName,
        rule: 'BILLING_RATE_MINIMUM',
        message: `Billing rate must be at least $${BILLING_RATE_RULES.minimum}`,
        received: String(rate),
        allowed: `>= ${BILLING_RATE_RULES.minimum}`,
      };
    }
    if (d.greaterThan(BILLING_RATE_RULES.maximum)) {
      return {
        field: fieldName,
        rule: 'BILLING_RATE_MAXIMUM',
        message: `Billing rate cannot exceed $${BILLING_RATE_RULES.maximum}`,
        received: String(rate),
        allowed: `<= ${BILLING_RATE_RULES.maximum}`,
      };
    }
  } catch {
    return {
      field: fieldName,
      rule: 'BILLING_RATE_INVALID',
      message: `Billing rate must be a valid number`,
      received: String(rate),
      allowed: `numeric value between ${BILLING_RATE_RULES.minimum} and ${BILLING_RATE_RULES.maximum}`,
    };
  }
  return null;
}

export function validatePayrollPeriod(
  startDate: Date,
  endDate: Date,
): BusinessRuleViolation | null {
  if (endDate <= startDate) {
    return {
      field: 'periodEnd',
      rule: 'PAYROLL_PERIOD_END_AFTER_START',
      message: 'Payroll period end date must be after start date',
      received: endDate.toISOString(),
      allowed: `> ${startDate.toISOString()}`,
    };
  }
  const durationDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  if (durationDays > PAYROLL_PERIOD_RULES.maximumPeriodDays) {
    return {
      field: 'periodEnd',
      rule: 'PAYROLL_PERIOD_MAXIMUM_DURATION',
      message: `Payroll period cannot exceed ${PAYROLL_PERIOD_RULES.maximumPeriodDays} days`,
      received: `${durationDays} days`,
      allowed: `<= ${PAYROLL_PERIOD_RULES.maximumPeriodDays} days`,
    };
  }
  return null;
}

export function validateDeductionAmount(
  amount: string | number | null | undefined,
  grossPay?: string | number | null,
  fieldName: string = 'amount',
): BusinessRuleViolation | null {
  if (amount === null || amount === undefined || amount === '') return null;
  try {
    const d = new Decimal(String(amount));
    if (d.lessThanOrEqualTo('0')) {
      return {
        field: fieldName,
        rule: 'DEDUCTION_AMOUNT_POSITIVE',
        message: 'Deduction amount must be greater than zero',
        received: String(amount),
        allowed: '> 0',
      };
    }
    if (grossPay !== null && grossPay !== undefined && grossPay !== '') {
      const gross = new Decimal(String(grossPay));
      if (d.greaterThan(gross)) {
        return {
          field: fieldName,
          rule: 'DEDUCTION_EXCEEDS_GROSS_PAY',
          message: `Deduction cannot exceed gross pay of $${gross.toFixed(2)}`,
          received: String(amount),
          allowed: `<= ${gross.toFixed(2)}`,
        };
      }
    }
  } catch {
    return {
      field: fieldName,
      rule: 'DEDUCTION_AMOUNT_INVALID',
      message: 'Deduction amount must be a valid number',
      received: String(amount),
      allowed: '> 0',
    };
  }
  return null;
}

export function validatePartialPaymentAmount(
  amount: number | null | undefined,
  remainingBalance?: number | null,
  fieldName: string = 'amount',
): BusinessRuleViolation | null {
  if (amount === null || amount === undefined) return null;
  if (amount <= 0) {
    return {
      field: fieldName,
      rule: 'PAYMENT_AMOUNT_POSITIVE',
      message: 'Payment amount must be greater than zero',
      received: amount,
      allowed: '> 0',
    };
  }
  if (remainingBalance !== null && remainingBalance !== undefined) {
    if (amount > remainingBalance) {
      return {
        field: fieldName,
        rule: 'PAYMENT_EXCEEDS_BALANCE',
        message: `Payment amount cannot exceed remaining balance of $${remainingBalance.toFixed(2)}`,
        received: amount,
        allowed: `<= ${remainingBalance.toFixed(2)}`,
      };
    }
  }
  return null;
}

// ─── MARGIN CHECK ─────────────────────────────────────────────────────────────
export interface ShiftMarginResult {
  isNegativeMargin: boolean;
  lossPerHour: string;
  employeePayRate: string;
  clientBillingRate: string;
}

export function checkShiftMargin(
  employeePayRate: string | number,
  clientBillingRate: string | number,
): ShiftMarginResult {
  try {
    const payRate = new Decimal(String(employeePayRate));
    const billRate = new Decimal(String(clientBillingRate));
    const isNegativeMargin = payRate.greaterThan(billRate);
    const lossPerHour = isNegativeMargin
      ? payRate.minus(billRate).toFixed(2)
      : '0.00';
    return {
      isNegativeMargin,
      lossPerHour,
      employeePayRate: payRate.toFixed(2),
      clientBillingRate: billRate.toFixed(2),
    };
  } catch {
    return {
      isNegativeMargin: false,
      lossPerHour: '0.00',
      employeePayRate: String(employeePayRate),
      clientBillingRate: String(clientBillingRate),
    };
  }
}

// ─── NON-NEGATIVE AMOUNT VALIDATION ─────────────────────────────────────────
// For fields where zero is valid but negative values are never permitted.
// Use validateInvoiceAmount when a positive minimum (>= $0.01) is required instead.
export function validateNonNegativeAmount(
  amount: string | number | null | undefined,
  fieldName: string,
): BusinessRuleViolation | null {
  if (amount === null || amount === undefined || amount === '') return null;
  try {
    const d = new Decimal(String(amount));
    if (d.lessThan('0')) {
      return {
        field: fieldName,
        rule: 'AMOUNT_CANNOT_BE_NEGATIVE',
        message: `${fieldName} cannot be a negative value`,
        received: String(amount),
        allowed: '>= 0',
      };
    }
  } catch {
    return {
      field: fieldName,
      rule: 'AMOUNT_INVALID',
      message: `${fieldName} must be a valid number`,
      received: String(amount),
      allowed: '>= 0',
    };
  }
  return null;
}

// ─── ADMIN HOURLY RATE RULES ─────────────────────────────────────────────────
// Workspace automation billing rate — distinct from employee pay rates.
// Applies only to the AI/automation cost-recovery rate set by org admins.
export const ADMIN_HOURLY_RATE_RULES = {
  minimum: '1',    // Admin rate must be at least $1/hour
  maximum: '500',  // Admin rate ceiling for automation billing
} as const;

export function validateAdminHourlyRate(
  rate: number | string | null | undefined,
  fieldName: string = 'hourlyRate',
): BusinessRuleViolation | null {
  if (rate === null || rate === undefined) return null;
  try {
    const d = new Decimal(String(rate));
    if (d.lessThan(ADMIN_HOURLY_RATE_RULES.minimum)) {
      return {
        field: fieldName,
        rule: 'ADMIN_HOURLY_RATE_MINIMUM',
        message: `Admin hourly rate must be at least $${ADMIN_HOURLY_RATE_RULES.minimum}`,
        received: String(rate),
        allowed: `>= ${ADMIN_HOURLY_RATE_RULES.minimum}`,
      };
    }
    if (d.greaterThan(ADMIN_HOURLY_RATE_RULES.maximum)) {
      return {
        field: fieldName,
        rule: 'ADMIN_HOURLY_RATE_MAXIMUM',
        message: `Admin hourly rate cannot exceed $${ADMIN_HOURLY_RATE_RULES.maximum}`,
        received: String(rate),
        allowed: `<= ${ADMIN_HOURLY_RATE_RULES.maximum}`,
      };
    }
  } catch {
    return {
      field: fieldName,
      rule: 'ADMIN_HOURLY_RATE_INVALID',
      message: 'Admin hourly rate must be a valid number',
      received: String(rate),
      allowed: `numeric value between ${ADMIN_HOURLY_RATE_RULES.minimum} and ${ADMIN_HOURLY_RATE_RULES.maximum}`,
    };
  }
  return null;
}

// ─── RESPONSE HELPER ──────────────────────────────────────────────────────────
export function businessRuleResponse(
  res: any,
  violations: (BusinessRuleViolation | null)[],
): boolean {
  const active = violations.filter(Boolean) as BusinessRuleViolation[];
  if (active.length === 0) return false;
  res.status(400).json({
    error: 'Business rule violation',
    code: 'BUSINESS_RULE_VIOLATION',
    violations: active.map(v => ({
      field: v.field,
      rule: v.rule,
      message: v.message,
      received: v.received,
      allowed: v.allowed,
    })),
  });
  return true;
}
