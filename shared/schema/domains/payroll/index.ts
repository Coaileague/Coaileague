// ═══════════════════════════════════════════════════════════════
// Domain 6 of 15: Payroll
// ═══════════════════════════════════════════════════════════════
// THE LAW: No new tables without Bryan's explicit approval. Zero DROP TABLE ever.
// Tables: 13

import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, date, index, uniqueIndex, primaryKey, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import {
  benefitStatusEnum,
  benefitTypeEnum,
  payrollStatusEnum,
} from '../../enums';

export const employeeBenefits = pgTable("employee_benefits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),

  // Benefit details
  benefitType: benefitTypeEnum("benefit_type").notNull(),
  benefitName: varchar("benefit_name").notNull(), // e.g., "Blue Cross PPO", "Company 401k Match"
  provider: varchar("provider"), // Insurance company or 401k provider

  // Coverage & amounts
  coverageAmount: decimal("coverage_amount", { precision: 12, scale: 2 }), // For insurance policies
  employeeContribution: decimal("employee_contribution", { precision: 10, scale: 2 }), // Monthly deduction
  employerContribution: decimal("employer_contribution", { precision: 10, scale: 2 }), // Monthly company cost

  // PTO/Leave specific
  ptoHoursPerYear: decimal("pto_hours_per_year", { precision: 10, scale: 2 }),
  ptoHoursAccrued: decimal("pto_hours_accrued", { precision: 10, scale: 2 }).default("0"),
  ptoHoursUsed: decimal("pto_hours_used", { precision: 10, scale: 2 }).default("0"),

  // 401k specific
  contributionPercentage: decimal("contribution_percentage", { precision: 5, scale: 2 }), // % of salary
  matchPercentage: decimal("match_percentage", { precision: 5, scale: 2 }), // Employer match %

  // Status & dates
  status: benefitStatusEnum("status").default("active"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),

  // Additional info
  policyNumber: varchar("policy_number"),
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const payrollProposals = pgTable("payroll_proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Proposal metadata
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  
  // Pay period
  payPeriodStart: timestamp("pay_period_start").notNull(),
  payPeriodEnd: timestamp("pay_period_end").notNull(),
  
  // AI response (payroll data, hours, rates, taxes, summary)
  aiResponse: jsonb("ai_response").notNull(), // Contains employeePayroll, taxes, deductions, summary
  confidence: integer("confidence").notNull(), // 0-100 (duplicated for query convenience)
  totalPayrollCost: decimal("total_payroll_cost", { precision: 10, scale: 2 }),
  employeeCount: integer("employee_count"),
  
  // Approval workflow
  status: varchar("status").default("pending"), // 'pending', 'approved', 'rejected', 'auto_approved'
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  rejectedBy: varchar("rejected_by"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  
  // Payroll tracking (after approval)
  payrollRunId: varchar("payroll_run_id"), // Payroll run ID generated from this proposal
  syncedToGusto: boolean("synced_to_gusto").default(false),
  gustoPayrollId: varchar("gusto_payroll_id"),
  
  // Billing linkage
  aiUsageLogId: varchar("ai_usage_log_id"),
  
});

export const offCyclePayrollRuns = pgTable("off_cycle_payroll_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),

  // Payroll details
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  payType: varchar("pay_type").notNull(), // 'bonus', 'commission', 'advance', 'correction', 'other'
  description: text("description").notNull(),
  payDate: timestamp("pay_date").notNull(),

  // Tax withholding
  federalTaxWithheld: decimal("federal_tax_withheld", { precision: 10, scale: 2 }),
  stateTaxWithheld: decimal("state_tax_withheld", { precision: 10, scale: 2 }),
  socialSecurityWithheld: decimal("social_security_withheld", { precision: 10, scale: 2 }),
  medicareWithheld: decimal("medicare_withheld", { precision: 10, scale: 2 }),
  netAmount: decimal("net_amount", { precision: 10, scale: 2 }).notNull(),

  // Processing
  status: varchar("status").default('pending'), // 'pending', 'processing', 'completed', 'failed'
  processedAt: timestamp("processed_at"),
  stripeTransferId: varchar("stripe_transfer_id"), // Stripe transfer ID for direct deposit

  // Approval
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),

  // Metadata
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const payrollRuns = pgTable("payroll_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),

  status: payrollStatusEnum("status").default("draft"),

  totalGrossPay: decimal("total_gross_pay", { precision: 12, scale: 2 }).default("0.00"),
  totalTaxes: decimal("total_taxes", { precision: 12, scale: 2 }).default("0.00"),
  totalNetPay: decimal("total_net_pay", { precision: 12, scale: 2 }).default("0.00"),

  processedBy: varchar("processed_by"),
  processedAt: timestamp("processed_at"),

  paymentSchedule: varchar("payment_schedule", { length: 30 }),
  runType: varchar("run_type", { length: 30 }).default("regular"),
  isOffCycle: boolean("is_off_cycle").default(false),
  offCycleRequestedBy: varchar("off_cycle_requested_by", { length: 255 }),
  approvedBy: varchar("approved_by", { length: 255 }),
  approvedAt: timestamp("approved_at"),
  disbursementStatus: varchar("disbursement_status", { length: 30 }).default("pending"),
  disbursementDate: timestamp("disbursement_date"),
  disbursedAt: timestamp("disbursed_at"),
  workerTypeBreakdown: jsonb("worker_type_breakdown"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  exportData: jsonb("export_data").default('{}'),
  providerData: jsonb("provider_data").default('{}'),
}, (table) => [
  // Prevent duplicate payroll runs for the same period — one run per workspace per pay period
  unique("uq_payroll_runs_workspace_period").on(table.workspaceId, table.periodStart, table.periodEnd),
  index("idx_payroll_runs_workspace").on(table.workspaceId),
  index("payroll_runs_workspace_status_idx").on(table.workspaceId, table.status),
  index("idx_payroll_runs_status").on(table.status),
]);


export const payrollEntries = pgTable("payroll_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  payrollRunId: varchar("payroll_run_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),

  regularHours: decimal("regular_hours", { precision: 8, scale: 2 }).default("0.00"),
  overtimeHours: decimal("overtime_hours", { precision: 8, scale: 2 }).default("0.00"),
  holidayHours: decimal("holiday_hours", { precision: 8, scale: 2 }).default("0.00"),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }).notNull(),

  grossPay: decimal("gross_pay", { precision: 10, scale: 2 }).default("0.00"),
  federalTax: decimal("federal_tax", { precision: 10, scale: 2 }).default("0.00"),
  stateTax: decimal("state_tax", { precision: 10, scale: 2 }).default("0.00"),
  socialSecurity: decimal("social_security", { precision: 10, scale: 2 }).default("0.00"),
  medicare: decimal("medicare", { precision: 10, scale: 2 }).default("0.00"),
  netPay: decimal("net_pay", { precision: 10, scale: 2 }).default("0.00"),

  workerType: varchar("worker_type", { length: 20 }).default("employee"),
  disbursedAt: timestamp("disbursed_at"),
  disbursementMethod: varchar("disbursement_method", { length: 30 }),
  isOffCycle: boolean("is_off_cycle").default(false),
  offCycleReason: text("off_cycle_reason"),
  stripeTransferId: varchar("stripe_transfer_id", { length: 255 }),
  plaidTransferId: varchar("plaid_transfer_id", { length: 255 }),
  plaidTransferStatus: varchar("plaid_transfer_status", { length: 50 }),
  plaidTransferFailureReason: text("plaid_transfer_failure_reason"),
  paidPeriodStart: timestamp("paid_period_start"),
  paidPeriodEnd: timestamp("paid_period_end"),

  // Stripe Connect payout tracking (set when payouts go via Stripe Connect)
  adjustments: jsonb("adjustments"),
  payoutStatus: varchar("payout_status", { length: 30 }),
  payoutMethod: varchar("payout_method", { length: 30 }),
  payoutCurrency: varchar("payout_currency", { length: 10 }),
  stripePayoutId: varchar("stripe_payout_id", { length: 255 }),
  payoutInitiatedAt: timestamp("payout_initiated_at"),
  payoutCompletedAt: timestamp("payout_completed_at"),
  payoutFailedAt: timestamp("payout_failed_at"),
  payoutFailureReason: text("payout_failure_reason"),
  payoutMetadata: jsonb("payout_metadata"),

  notes: text("notes"),
  // Phase 6: Calculation audit trail — stores inputs used to produce this entry's output.
  // Allows any payroll figure to be independently re-verified from stored inputs.
  calculationInputs: jsonb("calculation_inputs"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPayrollEntrySchema = createInsertSchema(payrollEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  notes: z.string().max(1000).optional(),
});

export const employeePayrollInfo = pgTable("employee_payroll_info", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull().unique(),
  
  // Tax information
  ssn: varchar("ssn"), // Encrypted in production
  taxFilingStatus: varchar("tax_filing_status"), // Single, Married, Head of Household
  federalAllowances: integer("federal_allowances").default(0),
  stateAllowances: integer("state_allowances").default(0),
  additionalWithholding: decimal("additional_withholding", { precision: 10, scale: 2 }).default("0.00"),
  
  // W4 form data
  w4Completed: boolean("w4_completed").default(false),
  w4CompletedAt: timestamp("w4_completed_at"),
  w4DocumentId: varchar("w4_document_id"),
  
  // I9 form data
  i9Completed: boolean("i9_completed").default(false),
  i9CompletedAt: timestamp("i9_completed_at"),
  i9DocumentId: varchar("i9_document_id"),
  i9ExpirationDate: timestamp("i9_expiration_date"),
  
  // Direct deposit
  bankName: varchar("bank_name"),
  bankAccountType: varchar("bank_account_type"), // 'checking', 'savings'
  bankRoutingNumber: varchar("bank_routing_number"), // Encrypted
  bankAccountNumber: varchar("bank_account_number"), // Encrypted
  directDepositEnabled: boolean("direct_deposit_enabled").default(false),
  
  // Stripe Connect (for Stripe-only payroll payouts)
  stripeConnectAccountId: varchar("stripe_connect_account_id"),
  stripeConnectPayoutsEnabled: boolean("stripe_connect_payouts_enabled").default(false),
  stripeConnectOnboardingComplete: boolean("stripe_connect_onboarding_complete").default(false),
  preferredPayoutMethod: varchar("preferred_payout_method", { length: 20 }).default("direct_deposit"),
  
  // Emergency tax info
  stateOfResidence: varchar("state_of_residence"),
  localTaxJurisdiction: varchar("local_tax_jurisdiction"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  bankDetails: jsonb("bank_details").default('{}'),
  bankAccountId: text("bank_account_id"),
  payrollReady: boolean("payroll_ready").default(false),
  directDepositFormStatus: varchar("direct_deposit_form_status"),
  bankVerificationStatus: varchar("bank_verification_status"),
  contractorAgreementSigned: boolean("contractor_agreement_signed").default(false),
  contractorAgreementDate: timestamp("contractor_agreement_date"),
}, (table) => ({
  workspaceIdx: index("employee_payroll_info_workspace_idx").on(table.workspaceId),
  employeeIdx: index("employee_payroll_info_employee_idx").on(table.employeeId),
  stripeConnectIdx: index("employee_payroll_info_stripe_connect_idx").on(table.stripeConnectAccountId),
}));

export const employeeRateHistory = pgTable("employee_rate_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  
  // Rate details
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }).notNull(),
  
  // Versioning
  validFrom: timestamp("valid_from").notNull().defaultNow(),
  validTo: timestamp("valid_to"), // NULL = current active rate
  supersededBy: varchar("superseded_by"), // FK to next version
  
  // Audit trail
  changedBy: varchar("changed_by"),
  changeReason: text("change_reason"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index("employee_rate_history_workspace_idx").on(table.workspaceId),
  employeeIdx: index("employee_rate_history_employee_idx").on(table.employeeId),
  validFromIdx: index("employee_rate_history_valid_from_idx").on(table.validFrom),
  validToIdx: index("employee_rate_history_valid_to_idx").on(table.validTo),
  activeRateIdx: index("employee_rate_history_active_idx").on(table.employeeId, table.validTo),
}));

export const laborLawRules = pgTable("labor_law_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  
  // Jurisdiction identification
  jurisdiction: varchar("jurisdiction").notNull().unique(), // State/country code (e.g., 'CA', 'NY', 'US-FEDERAL')
  jurisdictionName: varchar("jurisdiction_name").notNull(), // Full name (e.g., "California", "New York")
  country: varchar("country").default('US'), // Country code (ISO 3166-1 alpha-2)
  
  // Rest Break Rules (short breaks - typically 10-15 minutes)
  restBreakEnabled: boolean("rest_break_enabled").default(true),
  restBreakMinShiftHours: decimal("rest_break_min_shift_hours", { precision: 4, scale: 2 }).default("4.00"), // Shift length before rest break required
  restBreakDurationMinutes: integer("rest_break_duration_minutes").default(10), // Duration in minutes
  restBreakIsPaid: boolean("rest_break_is_paid").default(true), // Whether rest breaks are paid
  restBreakFrequencyHours: decimal("rest_break_frequency_hours", { precision: 4, scale: 2 }).default("4.00"), // One break per X hours
  
  // Meal Break Rules (longer breaks - typically 30-60 minutes)
  mealBreakEnabled: boolean("meal_break_enabled").default(true),
  mealBreakMinShiftHours: decimal("meal_break_min_shift_hours", { precision: 4, scale: 2 }).default("5.00"), // Shift length before meal break required
  mealBreakDurationMinutes: integer("meal_break_duration_minutes").default(30), // Duration in minutes
  mealBreakIsPaid: boolean("meal_break_is_paid").default(false), // Whether meal breaks are paid
  mealBreakMaxDelayHours: decimal("meal_break_max_delay_hours", { precision: 4, scale: 2 }).default("5.00"), // Must take meal break before X hours of work
  mealBreakSecondThresholdHours: decimal("meal_break_second_threshold_hours", { precision: 4, scale: 2 }).default("10.00"), // When second meal break required
  
  // Additional Rules
  minorBreakRulesEnabled: boolean("minor_break_rules_enabled").default(false), // Different rules for minors (<18)
  minorRestBreakFrequencyHours: decimal("minor_rest_break_frequency_hours", { precision: 4, scale: 2 }),
  minorMealBreakMaxDelayHours: decimal("minor_meal_break_max_delay_hours", { precision: 4, scale: 2 }),
  
  // Waiver Rules
  mealBreakWaiverAllowed: boolean("meal_break_waiver_allowed").default(false), // Can employee waive meal break?
  mealBreakWaiverMaxShiftHours: decimal("meal_break_waiver_max_shift_hours", { precision: 4, scale: 2 }).default("6.00"), // Max shift for waiver
  
  // Penalty Information
  breakViolationPenalty: text("break_violation_penalty"), // Description of penalty for violations
  penaltyPerViolation: decimal("penalty_per_violation", { precision: 10, scale: 2 }), // Dollar amount per violation
  
  // Source and Notes
  legalReference: text("legal_reference"), // Citation (e.g., "California Labor Code Section 512")
  effectiveDate: timestamp("effective_date"), // When these rules became effective
  notes: text("notes"), // Additional context
  
  // System flags
  isActive: boolean("is_active").default(true), // Can be deprecated without deleting
  isDefault: boolean("is_default").default(false), // Default fallback rule (US-FEDERAL)
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("labor_law_rules_jurisdiction_idx").on(table.jurisdiction),
  index("labor_law_rules_country_idx").on(table.country),
  index("labor_law_rules_active_idx").on(table.isActive),
]);

export const workerTaxClassificationHistory = pgTable("worker_tax_classification_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  // Classification
  previousClassification: varchar("previous_classification", { length: 30 }),
  newClassification: varchar("new_classification", { length: 30 }).notNull(), // w2_employee, 1099_contractor
  // Source of change
  changeSource: varchar("change_source", { length: 30 }).notNull(), // manual, qbo_sync, ai_detection
  qboVendorId: varchar("qbo_vendor_id"), // If synced from QBO Vendor
  qboEmployeeId: varchar("qbo_employee_id"), // If synced from QBO Employee
  // AI detection details
  aiConfidence: decimal("ai_confidence", { precision: 3, scale: 2 }),
  aiReasoning: text("ai_reasoning"),
  // Flags
  is1099Eligible: boolean("is_1099_eligible").default(false),
  requiresReview: boolean("requires_review").default(false),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  // Tax year
  taxYear: integer("tax_year").notNull(),
  effectiveDate: date("effective_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("tax_class_history_workspace_idx").on(table.workspaceId),
  index("tax_class_history_employee_idx").on(table.employeeId),
  index("tax_class_history_year_idx").on(table.taxYear),
]);

export const multiStateComplianceWindows = pgTable("multi_state_compliance_windows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  stateCode: varchar("state_code").notNull(),
  stateName: varchar("state_name").notNull(),
  licenseNumber: varchar("license_number"),
  licenseExpiresAt: timestamp("license_expires_at"),
  windowOpenedAt: timestamp("window_opened_at").defaultNow(),
  windowDeadline: timestamp("window_deadline").notNull(),
  daysRemaining: integer("days_remaining"),
  requiredDocTypes: jsonb("required_doc_types").default([]),
  approvedDocTypes: jsonb("approved_doc_types").default([]),
  pendingDocTypes: jsonb("pending_doc_types").default([]),
  isCompliant: boolean("is_compliant").default(false),
  isFrozen: boolean("is_frozen").default(false),
  appealUsed: boolean("appeal_used").default(false),
  appealExtensionDate: timestamp("appeal_extension_date"),
  lastCheckedAt: timestamp("last_checked_at"),
  complianceScore: integer("compliance_score").default(0),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("idx_multi_state_workspace").on(table.workspaceId),
  index("idx_multi_state_state").on(table.stateCode),
  index("idx_multi_state_compliant").on(table.isCompliant),
  uniqueIndex("idx_multi_state_unique").on(table.workspaceId, table.stateCode),
]);

export const payStubs = pgTable("pay_stubs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  payrollRunId: varchar("payroll_run_id").notNull(),
  payrollEntryId: varchar("payroll_entry_id"),
  employeeId: varchar("employee_id").notNull(),
  payPeriodStart: timestamp("pay_period_start").notNull(),
  payPeriodEnd: timestamp("pay_period_end").notNull(),
  payDate: timestamp("pay_date").notNull(),
  grossPay: decimal("gross_pay", { precision: 12, scale: 2 }).notNull(),
  totalDeductions: decimal("total_deductions", { precision: 12, scale: 2 }).default("0.00"),
  netPay: decimal("net_pay", { precision: 12, scale: 2 }).notNull(),
  deductionsBreakdown: jsonb("deductions_breakdown").$type<{
    federal_tax?: string;
    state_tax?: string;
    social_security?: string;
    medicare?: string;
    health_insurance?: string;
    dental?: string;
    vision?: string;
    retirement_401k?: string;
    other?: Record<string, string>;
  }>(),
  earningsBreakdown: jsonb("earnings_breakdown").$type<{
    regular_hours?: string;
    regular_rate?: string;
    regular_pay?: string;
    overtime_hours?: string;
    overtime_rate?: string;
    overtime_pay?: string;
    holiday_hours?: string;
    holiday_pay?: string;
    bonuses?: string;
    // Differential pay line items (GAP-RATE-3) — stored as distinct amounts when applicable
    hazard_pay?: string;           // Hazard premium — only set when shift-level hazard flag active
    night_shift_pay?: string;      // Night shift differential premium
    weekend_pay?: string;          // Weekend differential premium
    differential_pay?: string;     // Total differential premium (fallback if type not determined)
    differential_multiplier?: string;  // Multiplier applied (e.g. "1.15" for 15% premium)
    differential_types?: string;   // CSV of applied types: "night_shift,weekend"
  }>(),
  employerCosts: jsonb("employer_costs").$type<{
    employer_fica?: string;
    employer_medicare?: string;
    employer_futa?: string;
    employer_suta?: string;
    workers_comp?: string;
    health_contribution?: string;
  }>(),
  pdfUrl: text("pdf_url"),
  pdfStorageKey: text("pdf_storage_key"),
  status: varchar("status").default("generated"),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by"),

  // Plaid Transfer tracking
  plaidTransferId: varchar("plaid_transfer_id", { length: 255 }),
  plaidTransferStatus: varchar("plaid_transfer_status", { length: 50 }),
  plaidTransferFailureReason: text("plaid_transfer_failure_reason"),

  // Transfer monitoring
  consecutivePollFailures: integer("consecutive_poll_failures").default(0),
  transferStatus: varchar("transfer_status"), // mirrors plaidTransferStatus for generic polling

  createdAt: timestamp("created_at"),
}, (table) => [
  index("pay_stubs_workspace_idx").on(table.workspaceId),
  index("pay_stubs_employee_idx").on(table.employeeId),
  index("pay_stubs_run_idx").on(table.payrollRunId),
  index("pay_stubs_pay_date_idx").on(table.payDate),
]);

export const deductionConfigs = pgTable("deduction_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  name: varchar("name").notNull(),
  deductionType: varchar("deduction_type").notNull(),
  calcMethod: varchar("calc_method").default("fixed"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  isPreTax: boolean("is_pre_tax").default(true),
  appliesTo: varchar("applies_to").default("all"),
  isActive: boolean("is_active").default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by"),
  updatedBy: varchar("updated_by"),

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("deduction_configs_workspace_idx").on(table.workspaceId),
  index("deduction_configs_active_idx").on(table.workspaceId, table.isActive),
]);

export const payrollProviderConnections = pgTable("payroll_provider_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  provider: varchar("provider").notNull(),
  externalCompanyId: varchar("external_company_id"),
  status: varchar("status").default("pending"),
  connectionMetadata: jsonb("connection_metadata"),
  lastSyncAt: timestamp("last_sync_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by"),

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("payroll_provider_conn_workspace_idx").on(table.workspaceId),
  index("payroll_provider_conn_provider_idx").on(table.provider),
]);

export const payrollDeductions = pgTable("payroll_deductions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  payrollEntryId: varchar("payroll_entry_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  deductionType: varchar("deduction_type").notNull(),
  description: text("description"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  isPreTax: boolean("is_pre_tax").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("payroll_deductions_entry_idx").on(table.payrollEntryId),
  index("payroll_deductions_employee_idx").on(table.employeeId),
  index("payroll_deductions_workspace_idx").on(table.workspaceId),
]);

export const insertPayrollDeductionSchema = createInsertSchema(payrollDeductions).omit({
  id: true,
  createdAt: true,
});
export type InsertPayrollDeduction = z.infer<typeof insertPayrollDeductionSchema>;
export type PayrollDeduction = typeof payrollDeductions.$inferSelect;

export const payrollGarnishments = pgTable("payroll_garnishments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  payrollEntryId: varchar("payroll_entry_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  garnishmentType: varchar("garnishment_type").notNull(),
  description: text("description"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  priority: integer("priority").default(1),
  caseNumber: varchar("case_number"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("payroll_garnishments_entry_idx").on(table.payrollEntryId),
  index("payroll_garnishments_employee_idx").on(table.employeeId),
  index("payroll_garnishments_workspace_idx").on(table.workspaceId),
]);

export const insertPayrollGarnishmentSchema = createInsertSchema(payrollGarnishments).omit({
  id: true,
  createdAt: true,
});
export type InsertPayrollGarnishment = z.infer<typeof insertPayrollGarnishmentSchema>;
export type PayrollGarnishment = typeof payrollGarnishments.$inferSelect;

// ============================================================================
// EMPLOYEE TAX FORMS (W-2 / 1099 records for tax filing assistance)
// ============================================================================
export const employeeTaxForms = pgTable("employee_tax_forms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  formType: varchar("form_type", { length: 20 }).notNull(), // 'w2' | '1099'
  taxYear: integer("tax_year").notNull(),
  wages: decimal("wages", { precision: 12, scale: 2 }),
  federalTaxWithheld: decimal("federal_tax_withheld", { precision: 12, scale: 2 }),
  stateTaxWithheld: decimal("state_tax_withheld", { precision: 12, scale: 2 }),
  socialSecurityWages: decimal("social_security_wages", { precision: 12, scale: 2 }),
  socialSecurityTaxWithheld: decimal("social_security_tax_withheld", { precision: 12, scale: 2 }),
  medicareWages: decimal("medicare_wages", { precision: 12, scale: 2 }),
  medicareTaxWithheld: decimal("medicare_tax_withheld", { precision: 12, scale: 2 }),
  generatedAt: timestamp("generated_at").defaultNow(),
  isActive: boolean("is_active").default(true),
}, (table) => [
  index("employee_tax_forms_employee_idx").on(table.employeeId),
  index("employee_tax_forms_workspace_idx").on(table.workspaceId),
  index("employee_tax_forms_year_idx").on(table.taxYear),
]);

export const insertEmployeeTaxFormSchema = createInsertSchema(employeeTaxForms).omit({
  id: true,
  generatedAt: true,
});
export type InsertEmployeeTaxForm = z.infer<typeof insertEmployeeTaxFormSchema>;
export type EmployeeTaxForm = typeof employeeTaxForms.$inferSelect;

// ============================================================================
// PAYROLL TIMESHEETS — manual weekly hour entry with submit/approve lifecycle
// draft → submitted → approved | rejected
// ============================================================================
export const payrollTimesheets = pgTable("payroll_timesheets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  totalHours: decimal("total_hours", { precision: 6, scale: 2 }).notNull().default("0"),
  status: varchar("status", { length: 20 }).notNull().default("draft"), // draft | submitted | approved | rejected
  createdBy: varchar("created_by").notNull(),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectedBy: varchar("rejected_by"),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("payroll_timesheets_workspace_idx").on(table.workspaceId),
  index("payroll_timesheets_employee_idx").on(table.employeeId),
  index("payroll_timesheets_status_idx").on(table.status),
]);

export const insertPayrollTimesheetSchema = createInsertSchema(payrollTimesheets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPayrollTimesheet = z.infer<typeof insertPayrollTimesheetSchema>;
export type PayrollTimesheet = typeof payrollTimesheets.$inferSelect;

export const payrollTimesheetEntries = pgTable("payroll_timesheet_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  timesheetId: varchar("timesheet_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  entryDate: date("entry_date").notNull(),
  hoursWorked: decimal("hours_worked", { precision: 5, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("payroll_timesheet_entries_timesheet_idx").on(table.timesheetId),
  index("payroll_timesheet_entries_workspace_idx").on(table.workspaceId),
  unique("payroll_timesheet_entries_unique").on(table.timesheetId, table.entryDate),
]);

export const insertPayrollTimesheetEntrySchema = createInsertSchema(payrollTimesheetEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPayrollTimesheetEntry = z.infer<typeof insertPayrollTimesheetEntrySchema>;
export type PayrollTimesheetEntry = typeof payrollTimesheetEntries.$inferSelect;
