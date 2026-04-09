/**
 * PRIVACY MASK UTILITY
 * =====================
 * Enforces field-level privacy for sensitive financial data:
 *
 * Employee pay rates (hourlyRate, overtimeRate, doubletimeRate, payAmount):
 *   - Visible to: the employee themselves, owner, co_owner, manager roles, Trinity (system), support agents
 *   - Hidden from: peers, supervisors below manager level, external viewers
 *
 * Client bill rates (contractRate, armedBillRate, unarmedBillRate, overtimeBillRate):
 *   - Visible to: owner, co_owner, manager roles, Trinity (system), support agents
 *   - Hidden from: all other roles including officers and supervisors
 *
 * Addresses (employee home address, client billing address):
 *   - Employee home address: visible to the employee + owner/manager roles
 *   - Client site address: visible to anyone (needed for GPS/dispatch)
 *   - Client billing address (if different): owner/manager only
 */

import { SYSTEM_ACTOR_IDS } from '../lib/sentinels';

/** Roles that can see all financial data in a workspace */
const PRIVILEGED_ROLES = new Set([
  'org_owner',
  'co_owner',
  'org_admin',
  'org_manager',
  'manager',
  'department_manager',
]);

/** System/platform identifiers that bypass all masking (Trinity, cron, support).
 *  Canonical list lives in server/lib/sentinels.ts — do not duplicate. */
const SYSTEM_USER_IDS = new Set<string>(SYSTEM_ACTOR_IDS);

export interface PrivacyContext {
  requestingUserId?: string;
  requestingWorkspaceRole?: string;
  subjectEmployeeUserId?: string; // Set if the response is about a specific employee
}

/**
 * Determines if the requester can see sensitive pay data for an employee.
 * Returns true (show data) if:
 * - Requester IS the employee (viewing their own record)
 * - Requester has a privileged role (manager, owner, etc.)
 * - Requester is a system/Trinity/support actor
 */
export function canViewEmployeePayRates(ctx: PrivacyContext): boolean {
  if (!ctx.requestingUserId) return false;
  if (SYSTEM_USER_IDS.has(ctx.requestingUserId)) return true;
  if (ctx.requestingUserId === ctx.subjectEmployeeUserId) return true; // Self-view
  if (ctx.requestingWorkspaceRole && PRIVILEGED_ROLES.has(ctx.requestingWorkspaceRole)) return true;
  return false;
}

/**
 * Determines if the requester can see client bill rates.
 * Returns true if:
 * - Requester has a privileged role
 * - Requester is a system/Trinity/support actor
 */
export function canViewClientBillRates(ctx: PrivacyContext): boolean {
  if (!ctx.requestingUserId) return false;
  if (SYSTEM_USER_IDS.has(ctx.requestingUserId)) return true;
  if (ctx.requestingWorkspaceRole && PRIVILEGED_ROLES.has(ctx.requestingWorkspaceRole)) return true;
  return false;
}

/**
 * Determines if the requester can see an employee's home address.
 * Returns true if:
 * - Requester IS the employee
 * - Requester has a privileged role
 * - Requester is system/support
 */
export function canViewEmployeeAddress(ctx: PrivacyContext): boolean {
  if (!ctx.requestingUserId) return false;
  if (SYSTEM_USER_IDS.has(ctx.requestingUserId)) return true;
  if (ctx.requestingUserId === ctx.subjectEmployeeUserId) return true;
  if (ctx.requestingWorkspaceRole && PRIVILEGED_ROLES.has(ctx.requestingWorkspaceRole)) return true;
  return false;
}

// ── Masking functions ─────────────────────────────────────────────────────────

/** Employee pay rate fields to mask */
const EMPLOYEE_PAY_FIELDS = [
  'hourlyRate', 'overtimeRate', 'doubletimeRate', 'payAmount',
  'taxIdLastFour', 'is1099Eligible', 'payFrequency',
] as const;

/** Employee home address fields to mask */
const EMPLOYEE_ADDRESS_FIELDS = [
  'address', 'addressLine2', 'city', 'state', 'zipCode', 'latitude', 'longitude',
  'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelation',
] as const;

/** Client bill rate fields to mask */
const CLIENT_BILL_RATE_FIELDS = [
  'contractRate', 'contractRateType',
  'armedBillRate', 'unarmedBillRate', 'overtimeBillRate',
  'clientOvertimeMultiplier', 'clientHolidayMultiplier',
  'monthlyRevenue', 'lifetimeValue', 'averageProfitMargin',
  'taxId', 'stripeCustomerId',
] as const;

/**
 * Masks sensitive fields on an employee object.
 * Pass `ctx` derived from the authenticated request.
 */
export function maskEmployee<T extends Record<string, any>>(employee: T, ctx: PrivacyContext): T {
  const result = { ...employee };
  const ctxWithSubject: PrivacyContext = { ...ctx, subjectEmployeeUserId: employee.userId || ctx.subjectEmployeeUserId };

  if (!canViewEmployeePayRates(ctxWithSubject)) {
    for (const field of EMPLOYEE_PAY_FIELDS) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      if (field in result) result[field] = null;
    }
  }

  if (!canViewEmployeeAddress(ctxWithSubject)) {
    for (const field of EMPLOYEE_ADDRESS_FIELDS) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      if (field in result) result[field] = null;
    }
  }

  return result;
}

/**
 * Masks sensitive fields on a client object.
 */
export function maskClient<T extends Record<string, any>>(client: T, ctx: PrivacyContext): T {
  const result = { ...client };

  if (!canViewClientBillRates(ctx)) {
    for (const field of CLIENT_BILL_RATE_FIELDS) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      if (field in result) result[field] = null;
    }
  }

  return result;
}

/**
 * Batch-mask an array of employee records.
 */
export function maskEmployeeList<T extends Record<string, any>>(employees: T[], ctx: PrivacyContext): T[] {
  return employees.map(emp => maskEmployee(emp, { ...ctx, subjectEmployeeUserId: emp.userId }));
}

/**
 * Batch-mask an array of client records.
 */
export function maskClientList<T extends Record<string, any>>(clients: T[], ctx: PrivacyContext): T[] {
  return clients.map(c => maskClient(c, ctx));
}

/**
 * Build a PrivacyContext from an Express request and the requester's employee record.
 * Usage in routes:
 *
 *   const ctx = buildPrivacyContext(req.userId, requesterEmployee?.workspaceRole);
 *   const masked = maskEmployee(employeeData, ctx);
 */
export function buildPrivacyContext(
  requestingUserId?: string,
  requestingWorkspaceRole?: string,
  subjectEmployeeUserId?: string,
): PrivacyContext {
  return { requestingUserId, requestingWorkspaceRole, subjectEmployeeUserId };
}
