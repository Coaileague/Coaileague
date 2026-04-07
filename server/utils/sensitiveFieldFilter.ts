/**
 * SENSITIVE FIELD FILTER
 * ======================
 * Utility functions to strip sensitive fields from API responses based on user role.
 *
 * PRIVACY POLICY:
 * - Client bill rates / contract rates → org_owner, co_owner, platform staff, Trinity only
 * - Client contact emails / phones → org_owner, co_owner, platform staff, Trinity only
 *   (manager access to client emails creates non-compete / information-bleed risk)
 * - Employee pay rates → org_owner, co_owner, platform staff, SELF only
 * - Employee personal info (SSN, bank) → org_owner, co_owner, platform staff, SELF only
 * - Trinity / AI Brain / scheduling system → always gets full data (internal context)
 * - Regular managers, supervisors → see operational data only (names, schedules, addresses)
 */

// ─── EMPLOYEE PAY RATE FIELDS ─────────────────────────────────────────────
const PAY_RATE_FIELDS = [
  'hourlyRate',
  'currentHourlyRate',
  'minHourlyRate',
  'maxHourlyRate',
  'salary',
  'payRate',
  'payAmount',
  'overtimeRate',
  'doubletimeRate',
  'annualSalary',
  'bonusTarget',
  'commissionRate',
  'billingRate',
  'salaryAdjustment',
];

// ─── EMPLOYEE SENSITIVE PERSONAL FIELDS ────────────────────────────────────
const SENSITIVE_PERSONAL_FIELDS = [
  'ssn',
  'socialSecurityNumber',
  'bankAccountNumber',
  'bankRoutingNumber',
  'bankAccount',
  'taxId',
  'ein',
  'dateOfBirth',
  'driverLicenseNumber',
  'socialSecurityCardFrontUrl',
  'stateIdFrontUrl',
  'stateIdBackUrl',
];

// ─── CLIENT FINANCIAL FIELDS (OWNER-ONLY) ──────────────────────────────────
// Rates, revenue metrics, and integration IDs that could reveal business
// strategy or be used to undercut pricing in a non-compete situation.
const CLIENT_FINANCIAL_FIELDS = [
  'contractRate',
  'contractRateType',
  'armedBillRate',
  'unarmedBillRate',
  'overtimeBillRate',
  'ppoBillRate',
  'billRate',
  'clientOvertimeMultiplier',
  'clientHolidayMultiplier',
  'monthlyRevenue',
  'lifetimeValue',
  'averageProfitMargin',
  'stripeCustomerId',
  'quickbooksClientId',
  'isTaxExempt',
  'taxExemptCertificate',
  'paymentTermsDays',
  'preferredPaymentMethod',
  'autoSendInvoice',
];

// ─── CLIENT CONTACT FIELDS (OWNER-ONLY) ────────────────────────────────────
// Contact info that managers could use to approach the client directly,
// violating non-compete / non-solicitation agreements.
const CLIENT_CONTACT_FIELDS = [
  'email',
  'phone',
  'billingEmail',
  'invoiceDeliveryEmail',
  'pocEmail',
  'pocPhone',
  'apContactEmail',
  'apContactPhone',
  'primaryContactEmail',
  'primaryContactPhone',
  'taxId',
  'portalAccessEnabled',
  'portalAccessToken',
];

// ─── CLIENT INTEGRATION FIELDS (OWNER-ONLY) ────────────────────────────────
const CLIENT_INTEGRATION_FIELDS = [
  'stripeCustomerId',
  'quickbooksClientId',
  'quickbooksVendorId',
];

// ─── ROLE DEFINITIONS ──────────────────────────────────────────────────────

// Roles that can view employee pay rate information
const PAY_RATE_VISIBLE_ROLES = [
  'org_owner',
  'co_owner',
  'root_admin',
  'deputy_admin',
  'sysop',
  'payroll_admin',
  'hr_director',
];

// Roles that can view client financial rates and contact info
// NOTE: Standard managers are intentionally EXCLUDED — non-compete/bleed risk
const OWNER_AND_PLATFORM_ROLES = [
  'org_owner',
  'co_owner',
  'root_admin',
  'deputy_admin',
  'sysop',
  'support_manager',
  'support_agent',
];

// Roles that can view highly sensitive personal info (SSN, bank)
const ADMIN_ROLES = [
  'org_owner',
  'co_owner',
  'root_admin',
  'deputy_admin',
  'sysop',
  'hr_director',
];

// ─── FILTER CONTEXT ────────────────────────────────────────────────────────

export interface FilterContext {
  workspaceRole?: string;
  platformRole?: string;
  requestingUserId?: string;
  entityOwnerId?: string;
  allowAll?: boolean;
  isInternalSystem?: boolean;
}

/**
 * Full internal access — for Trinity / AI Brain / scheduling system / bots.
 * These systems need all data to operate (rate calculations, compliance, scheduling).
 */
export function createInternalFilterContext(): FilterContext {
  return { allowAll: true, isInternalSystem: true };
}

// ─── ACCESS CHECKS ─────────────────────────────────────────────────────────

/** Can the requester see employee pay rates? */
export function canViewPayRates(context: FilterContext): boolean {
  if (context.allowAll || context.isInternalSystem) return true;
  if (isSelf(context)) return true;
  const role = context.workspaceRole || '';
  const pRole = context.platformRole || '';
  return PAY_RATE_VISIBLE_ROLES.includes(role) || PAY_RATE_VISIBLE_ROLES.includes(pRole);
}

/** Can the requester see client financial rates and billing info? */
export function canViewClientFinancials(context: FilterContext): boolean {
  if (context.allowAll || context.isInternalSystem) return true;
  const role = context.workspaceRole || '';
  const pRole = context.platformRole || '';
  return OWNER_AND_PLATFORM_ROLES.includes(role) || OWNER_AND_PLATFORM_ROLES.includes(pRole);
}

/** Can the requester see client contact emails / phones / tax IDs? */
export function canViewClientContactInfo(context: FilterContext): boolean {
  if (context.allowAll || context.isInternalSystem) return true;
  const role = context.workspaceRole || '';
  const pRole = context.platformRole || '';
  return OWNER_AND_PLATFORM_ROLES.includes(role) || OWNER_AND_PLATFORM_ROLES.includes(pRole);
}

/** Can the requester see sensitive personal info (SSN, bank details)? */
export function canViewSensitivePersonalInfo(context: FilterContext): boolean {
  if (context.allowAll) return true;
  if (isSelf(context)) return true;
  const role = context.workspaceRole || '';
  const pRole = context.platformRole || '';
  return ADMIN_ROLES.includes(role) || ADMIN_ROLES.includes(pRole);
}

function isSelf(context: FilterContext): boolean {
  return !!(
    context.requestingUserId &&
    context.entityOwnerId &&
    context.requestingUserId === context.entityOwnerId
  );
}

// ─── FILTER FUNCTIONS ──────────────────────────────────────────────────────

/**
 * Filter sensitive fields from an employee record.
 * Pay rates stripped unless requester is owner/authorized role/self.
 */
export function filterSensitiveFields<T extends Record<string, any>>(
  record: T,
  context: FilterContext
): T {
  if (!record || context.allowAll) return record;

  const filtered = { ...record };

  if (!canViewPayRates(context)) {
    for (const field of PAY_RATE_FIELDS) {
      delete (filtered as any)[field];
    }
  }

  if (!canViewSensitivePersonalInfo(context)) {
    for (const field of SENSITIVE_PERSONAL_FIELDS) {
      delete (filtered as any)[field];
    }
  }

  return filtered;
}

/**
 * Filter sensitive fields from an array of employee records.
 */
export function filterSensitiveFieldsArray<T extends Record<string, any>>(
  records: T[],
  context: FilterContext
): T[] {
  if (!records || context.allowAll) return records;
  return records.map(r => filterSensitiveFields(r, context));
}

/**
 * Filter employee record for API response.
 * Uses employee.userId as entityOwnerId for self-access check.
 */
export function filterEmployeeForResponse<T extends Record<string, any>>(
  employee: T,
  context: FilterContext
): T {
  return filterSensitiveFields(employee, {
    ...context,
    entityOwnerId: (employee as any).userId,
  });
}

/**
 * Filter array of employee records for API response.
 */
export function filterEmployeesForResponse<T extends Record<string, any>>(
  employees: T[],
  context: FilterContext
): T[] {
  if (!employees) return employees;
  return employees.map(e => filterEmployeeForResponse(e, context));
}

/**
 * Filter contractor records for API response.
 */
export function filterContractorForResponse<T extends Record<string, any>>(
  contractor: T,
  context: FilterContext
): T {
  return filterSensitiveFields(contractor, {
    ...context,
    entityOwnerId: (contractor as any).userId,
  });
}

/**
 * Filter a single client record for API response.
 *
 * Fields removed for non-owner managers:
 *   - All bill rates / contract rates (financial strategy data)
 *   - All contact emails / phones (non-compete bleed risk)
 *   - Tax ID, integration IDs (Stripe, QuickBooks)
 *
 * Managers retain: name, address, post orders, service type, officers required,
 *   client onboarding status, and all operational scheduling fields.
 */
export function filterClientForResponse<T extends Record<string, any>>(
  client: T,
  context: FilterContext
): T {
  if (!client || context.allowAll) return client;

  const filtered = { ...client };

  if (!canViewClientFinancials(context)) {
    for (const field of CLIENT_FINANCIAL_FIELDS) {
      delete (filtered as any)[field];
    }
    for (const field of CLIENT_INTEGRATION_FIELDS) {
      delete (filtered as any)[field];
    }
  }

  if (!canViewClientContactInfo(context)) {
    for (const field of CLIENT_CONTACT_FIELDS) {
      delete (filtered as any)[field];
    }
  }

  return filtered;
}

/**
 * Filter an array of client records for API response.
 */
export function filterClientsForResponse<T extends Record<string, any>>(
  clients: T[],
  context: FilterContext
): T[] {
  if (!clients) return clients;
  return clients.map(c => filterClientForResponse(c, context));
}

/**
 * Create filter context from an Express request object.
 */
export function createFilterContext(req: any): FilterContext {
  return {
    workspaceRole: req.workspaceRole || req.user?.workspaceRole,
    platformRole: req.platformRole || req.user?.platformRole,
    requestingUserId: req.user?.id,
    allowAll: false,
  };
}

/**
 * Express middleware to attach filter context to the request.
 */
export function attachFilterContext(req: any, res: any, next: () => void) {
  req.filterContext = createFilterContext(req);
  next();
}
