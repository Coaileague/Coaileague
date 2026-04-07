// ═══════════════════════════════════════════════════════════════
// Domain 7 of 15: Billing & Finance
// ═══════════════════════════════════════════════════════════════
// THE LAW: No new tables without Bryan's explicit approval. Zero DROP TABLE ever.
// Tables: 58

import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, date, time, index, uniqueIndex, primaryKey, unique, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import {
  actorTypeEnum,
  appealStatusEnum,
  billingCycleEnum,
  complianceEntityTypeEnum,
  expenseStatusEnum,
  financialAlertCategoryEnum,
  financialAlertSeverityEnum,
  financialSnapshotGranularityEnum,
  financialSnapshotSourceEnum,
  freezePhaseEnum,
  freezeStatusEnum,
  invoiceStatusEnum,
  migrationStatusEnum,
  paymentReminderTypeEnum,
  quickbooksFlowStageEnum,
  reminderChannelEnum,
  serviceTypeEnum,
  subscriptionPlanEnum,
  subscriptionStatusEnum,
} from '../../enums';

export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  clientId: varchar("client_id").notNull(),

  // Invoice details
  invoiceNumber: varchar("invoice_number").notNull().unique(),
  issueDate: timestamp("issue_date").defaultNow(),
  dueDate: timestamp("due_date"),

  // Amounts
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0.00"),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0.00"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),

  // Platform fee
  platformFeePercentage: decimal("platform_fee_percentage", { precision: 5, scale: 2 }),
  platformFeeAmount: decimal("platform_fee_amount", { precision: 10, scale: 2 }),
  businessAmount: decimal("business_amount", { precision: 10, scale: 2 }), // Amount after platform fee

  // Payment
  status: invoiceStatusEnum("status").default('draft'),
  paidAt: timestamp("paid_at"),
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }).default("0.00"), // Track partial payments
  paymentIntentId: varchar("payment_intent_id"), // Stripe Payment Intent ID
  stripeInvoiceId: varchar("stripe_invoice_id"), // Stripe Invoice ID for automated billing
  sentAt: timestamp("sent_at"), // When invoice was sent to client

  // Additional details
  notes: text("notes"),

  // ============================================================================
  // EXTERNAL / AGENCY INVOICE REFERENCES
  // For subcontracting - track both your invoice # and the agency's reference #
  // ============================================================================
  
  // Agency/External References (for subcontract billing)
  externalInvoiceNumber: varchar("external_invoice_number"), // Agency's required invoice number format
  agencyPONumber: varchar("agency_po_number"), // Agency's PO number to reference
  agencyReferenceNumber: varchar("agency_reference_number"), // Any other agency reference
  externalClientId: varchar("external_client_id"), // Agency's client ID for their system
  
  // Client Portal Tracking
  viewedAt: timestamp("viewed_at"), // When client first opened the invoice in the portal
  portalAccessToken: varchar("portal_access_token"), // Portal access token used to generate the payment link

  // Email Delivery Tracking
  deliveryConfirmed: boolean("delivery_confirmed").default(false), // true when Resend webhook confirms delivery
  resentAfterDeliveryFailure: boolean("resent_after_delivery_failure").default(false), // true if re-sent after email barrel fix

  // QuickBooks Integration
  quickbooksInvoiceId: varchar("quickbooks_invoice_id"), // QuickBooks Invoice ID after sync
  quickbooksSyncStatus: varchar("quickbooks_sync_status").default("pending"), // pending, synced, error
  quickbooksLastSync: timestamp("quickbooks_last_sync"),
  
  // Service reference (link to billing service)
  primaryServiceId: varchar("primary_service_id"), // Primary service type for this invoice

  // Manual payment reference (check number, wire confirmation, ACH ref)
  paymentReference: varchar("payment_reference"), // e.g. CHK-1042, WIRE-REF-88291

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  billingCycle: varchar("billing_cycle"),
  netTerms: integer("net_terms").default(30),
  reminderSentAt: timestamp("reminder_sent_at"),
  secondReminderSentAt: timestamp("second_reminder_sent_at"),
  paymentMethod: varchar("payment_method"),
  voidReason: text("void_reason"),
  voidedAt: timestamp("voided_at"),
  voidedBy: varchar("voided_by"),
}, (table) => [
  index("invoices_workspace_idx").on(table.workspaceId),
  index("invoices_client_idx").on(table.clientId),
  index("invoices_status_idx").on(table.status),
  index("invoices_due_date_idx").on(table.dueDate),
  index("invoices_workspace_status_idx").on(table.workspaceId, table.status),
  index("invoices_created_at_idx").on(table.createdAt),
  index("invoices_qb_id_idx").on(table.quickbooksInvoiceId),
  index("invoices_external_num_idx").on(table.externalInvoiceNumber),
]);

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  notes: z.string().max(1000).optional(),
  clientId: z.string().min(1, "Client is required"),
  invoiceNumber: z.string().min(1, "Invoice number is required"),
}).refine((data) => {
  if (data.issueDate && data.dueDate) {
    return new Date(data.dueDate) >= new Date(data.issueDate);
  }
  return true;
}, {
  message: "Due date cannot be before issue date",
  path: ["dueDate"],
});

export const invoiceLineItems = pgTable("invoice_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull(),
  workspaceId: varchar("workspace_id"),

  // Line Item Order
  lineNumber: integer("line_number").default(1),

  // Service Info
  serviceDate: timestamp("service_date"),
  productServiceName: varchar("product_service_name"),

  // Sub-Client & Site Links
  subClientId: varchar("sub_client_id"),
  siteId: varchar("site_id"),

  // Line item details
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  rate: decimal("rate", { precision: 10, scale: 2 }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),

  // Structured Description Data (for automation) - Contains job_id, location, schedule, dates, officers
  descriptionData: jsonb("description_data").$type<{
    job_id?: string;
    sub_client_name?: string;
    location?: string;
    schedule_description?: string;
    service_dates?: Array<{ date: string; time: string }>;
    officers?: string[];
  }>(),

  // Tax
  taxable: boolean("taxable").default(true),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }),

  // Time Entry Links (which time entries make up this line item)
  timeEntryIds: varchar("time_entry_ids").array(),

  // Links
  timeEntryId: varchar("time_entry_id"),
  shiftId: varchar("shift_id"),
  employeeId: varchar("employee_id"),

  // QuickBooks
  qbLineId: varchar("qb_line_id"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  discountType: varchar("discount_type"),
  discountValue: decimal("discount_value"),
  markupValue: decimal("markup_value"),
  overtimeHours: decimal("overtime_hours"),
  holidayHours: decimal("holiday_hours"),
});

export const insertInvoiceLineItemSchema = createInsertSchema(invoiceLineItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  description: z.string().max(500),
  quantity: z.string().refine(v => parseFloat(v) > 0, { message: "Quantity must be greater than 0" }),
  unitPrice: z.string().refine(v => parseFloat(v) >= 0, { message: "Unit price must be non-negative" }),
});

export const paymentRecords = pgTable("payment_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  invoiceId: varchar("invoice_id").notNull(),

  // Payment details
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: varchar("payment_method").notNull(), // 'stripe_card', 'stripe_ach', 'stripe_transfer', 'manual'
  paymentIntentId: varchar("payment_intent_id"), // Stripe Payment Intent ID
  transactionId: varchar("transaction_id"), // External transaction reference

  // Stripe Connect platform fee tracking
  platformFeeAmount: decimal("platform_fee_amount", { precision: 10, scale: 2 }),
  businessAmount: decimal("business_amount", { precision: 10, scale: 2 }),

  // Status
  status: varchar("status").default('pending'), // 'pending', 'completed', 'failed', 'refunded'
  paidAt: timestamp("paid_at"),
  failureReason: text("failure_reason"),

  // Metadata
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const orgLedger = pgTable("org_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  entryType: varchar("entry_type").notNull(),
  direction: varchar("direction").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 14, scale: 2 }),
  referenceNumber: varchar("reference_number"),
  createdBy: varchar("created_by"),
  relatedEntityType: varchar("related_entity_type"),
  relatedEntityId: varchar("related_entity_id"),
  invoiceId: varchar("invoice_id"),
  payrollRunId: varchar("payroll_run_id"),
  description: text("description"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("org_ledger_workspace_idx").on(table.workspaceId),
  index("org_ledger_type_idx").on(table.entryType),
  index("org_ledger_entity_idx").on(table.relatedEntityType, table.relatedEntityId),
  index("org_ledger_created_idx").on(table.createdAt),
  index("org_ledger_ref_idx").on(table.referenceNumber),
]);

export const exchangeRates = pgTable("exchange_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  
  // Currency pair
  baseCurrency: varchar("base_currency", { length: 3 }).notNull().default('USD'),
  targetCurrency: varchar("target_currency", { length: 3 }).notNull(),
  
  // Exchange rate (amount of target currency per 1 base currency)
  rate: decimal("rate", { precision: 18, scale: 8 }).notNull(),
  inverseRate: decimal("inverse_rate", { precision: 18, scale: 8 }), // Precomputed for faster lookups
  
  // Source and freshness
  source: varchar("source").default('system'), // 'system', 'api', 'manual'
  rateDate: timestamp("rate_date").notNull(),
  fetchedAt: timestamp("fetched_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // When rate should be refreshed
  
  // Status
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("exchange_rates_pair_idx").on(table.baseCurrency, table.targetCurrency),
  index("exchange_rates_date_idx").on(table.rateDate),
]);

export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique(),

  // Plan details
  plan: subscriptionPlanEnum("plan").default("free"),
  billingCycle: billingCycleEnum("billing_cycle").default("monthly"),
  status: subscriptionStatusEnum("status").default("active"),

  // Pricing (in cents)
  basePrice: integer("base_price").default(0), // Monthly base price
  platformFeePercentage: decimal("platform_fee_percentage", { precision: 5, scale: 2 }).default("3.00"), // 3% invoice fee

  // Limits
  maxEmployees: integer("max_employees").default(5),
  maxClients: integer("max_clients").default(10),
  currentEmployees: integer("current_employees").default(0),
  currentClients: integer("current_clients").default(0),

  // Trial tracking
  trialStartedAt: timestamp("trial_started_at"),
  trialEndsAt: timestamp("trial_ends_at"),

  // Billing dates
  currentPeriodStart: timestamp("current_period_start").defaultNow(),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAt: timestamp("cancel_at"),
  canceledAt: timestamp("canceled_at"),

  // Stripe integration
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  stripeCustomerId: varchar("stripe_customer_id"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  invoiceData: jsonb("invoice_data").default('{}'),
  paymentData: jsonb("payment_data").default('{}'),
});

export const platformRevenue = pgTable("platform_revenue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Revenue source
  revenueType: varchar("revenue_type").notNull(), // 'subscription', 'invoice_fee', 'overage', 'setup_fee'
  sourceId: varchar("source_id"), // invoiceId, subscriptionId, etc.

  // Amounts (in cents)
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  feePercentage: decimal("fee_percentage", { precision: 5, scale: 2 }),

  // Tracking
  collectedAt: timestamp("collected_at"),
  status: varchar("status").default("pending"), // 'pending', 'collected', 'failed'

  // Period
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const costVariancePredictions = pgTable("cost_variance_predictions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  shiftId: varchar("shift_id"),

  // Schedule details
  scheduleDate: timestamp("schedule_date").notNull(),
  schedulePeriod: varchar("schedule_period"), // 'week', 'day', 'month'

  // Cost predictions
  budgetedCost: decimal("budgeted_cost", { precision: 10, scale: 2 }).notNull(),
  predictedCost: decimal("predicted_cost", { precision: 10, scale: 2 }).notNull(),
  varianceAmount: decimal("variance_amount", { precision: 10, scale: 2 }).notNull(), // Predicted - Budgeted
  variancePercentage: decimal("variance_percentage", { precision: 5, scale: 2 }).notNull(),

  // Risk classification
  exceeds10Percent: boolean("exceeds_10_percent").default(false), // Red flag threshold
  riskLevel: varchar("risk_level").notNull(), // 'acceptable', 'warning', 'critical'

  // Contributing factors (AI-identified)
  riskFactors: jsonb("risk_factors"), // { overtime: 0.6, premium_rates: 0.3, understaffing: 0.1 }
  problematicShifts: jsonb("problematic_shifts"), // Array of shift IDs causing cost spike
  recommendations: text("recommendations"), // AI-generated cost optimization strategies

  // Model metadata
  aiModel: varchar("ai_model").default("gpt-4"),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }),
  analysisDate: timestamp("analysis_date").defaultNow(),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const expenseCategories = pgTable("expense_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Category details
  name: varchar("name").notNull(),
  description: text("description"),
  code: varchar("code"), // Accounting code

  // Budget tracking
  budgetId: varchar("budget_id"), // Will reference budgets table

  // Limits
  requiresApproval: boolean("requires_approval").default(true),
  approvalThreshold: decimal("approval_threshold", { precision: 10, scale: 2 }), // Auto-approve under this amount
  maxPerTransaction: decimal("max_per_transaction", { precision: 10, scale: 2 }),

  // Status
  isActive: boolean("is_active").default(true),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const expenses = pgTable("expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Expense details
  employeeId: varchar("employee_id").notNull(),
  categoryId: varchar("category_id").notNull(),

  // Transaction details
  expenseDate: timestamp("expense_date").notNull(),
  merchant: varchar("merchant"),
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency").default('USD'),

  // Receipt
  receiptUrl: varchar("receipt_url"),
  receiptImageUrl: varchar("receipt_image_url"),

  // Client/project association
  clientId: varchar("client_id"),
  projectCode: varchar("project_code"),
  isBillable: boolean("is_billable").default(false),

  // Mileage-specific fields (for mileage reimbursement)
  mileageDistance: decimal("mileage_distance", { precision: 10, scale: 2 }), // Miles driven
  mileageRate: decimal("mileage_rate", { precision: 5, scale: 3 }), // IRS rate (e.g., $0.67/mile)
  mileageStartLocation: text("mileage_start_location"),
  mileageEndLocation: text("mileage_end_location"),

  // Approval workflow
  status: expenseStatusEnum("status").default('submitted'),
  submittedAt: timestamp("submitted_at"),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  rejectedBy: varchar("rejected_by"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  reviewNotes: text("review_notes"),

  // Reimbursement
  reimbursedAt: timestamp("reimbursed_at"),
  reimbursedBy: varchar("reimbursed_by"),
  reimbursementMethod: varchar("reimbursement_method"), // 'direct_deposit', 'check', 'payroll'
  reimbursementReference: varchar("reimbursement_reference"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  categoryData: jsonb("category_data").default('{}'),
  receiptData: jsonb("receipt_data").default('{}'),
}, (table) => ({
  employeeIdx: index("expenses_employee_idx").on(table.employeeId),
  statusIdx: index("expenses_status_idx").on(table.status),
  dateIdx: index("expenses_date_idx").on(table.expenseDate),
}));

export const expenseReceipts = pgTable("expense_receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  expenseId: varchar("expense_id").notNull(),

  // Receipt file
  fileName: varchar("file_name").notNull(),
  fileUrl: varchar("file_url").notNull(), // Object storage URL
  fileType: varchar("file_type").notNull(), // 'image/jpeg', 'image/png', 'application/pdf'
  fileSize: integer("file_size"), // Bytes

  // OCR/AI extraction (future feature)
  extractedAmount: decimal("extracted_amount", { precision: 10, scale: 2 }),
  extractedDate: timestamp("extracted_date"),
  extractedVendor: varchar("extracted_vendor"),
  ocrConfidence: decimal("ocr_confidence", { precision: 5, scale: 2 }), // 0-100%

  uploadedAt: timestamp("uploaded_at").defaultNow(),

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => ({
  expenseIdx: index("expense_receipts_expense_idx").on(table.expenseId),
}));

export const budgets = pgTable("budgets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Budget details
  name: varchar("name").notNull(),
  description: text("description"),
  budgetType: varchar("budget_type").notNull(), // 'department', 'project', 'category', 'annual', 'quarterly'

  // Period
  fiscalYear: integer("fiscal_year").notNull(),
  fiscalQuarter: integer("fiscal_quarter"), // 1-4, null for annual
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),

  // Amounts
  plannedAmount: decimal("planned_amount", { precision: 12, scale: 2 }).notNull(),
  adjustedAmount: decimal("adjusted_amount", { precision: 12, scale: 2 }), // After revisions
  actualSpent: decimal("actual_spent", { precision: 12, scale: 2 }).default('0.00'),
  committed: decimal("committed", { precision: 12, scale: 2 }).default('0.00'), // Encumbered funds

  // Department/category
  departmentName: varchar("department_name"), // Department name (no FK)
  categoryCode: varchar("category_code"),

  // Ownership
  ownerId: varchar("owner_id"),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),

  // Status
  status: varchar("status").default('draft'), // 'draft', 'submitted', 'approved', 'active', 'closed'

  // Alerts
  alertThreshold: integer("alert_threshold").default(80), // Alert when X% spent
  isOverBudget: boolean("is_over_budget").default(false),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  lineItems: jsonb("line_items").default('[]'),
  variances: jsonb("variances").default('[]'),
});

export const budgetLineItems = pgTable("budget_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  budgetId: varchar("budget_id").notNull(),

  // Line item details
  name: varchar("name").notNull(),
  description: text("description"),
  categoryCode: varchar("category_code"),

  // Amounts
  plannedAmount: decimal("planned_amount", { precision: 12, scale: 2 }).notNull(),
  actualSpent: decimal("actual_spent", { precision: 12, scale: 2 }).default('0.00'),

  // Ordering
  sortOrder: integer("sort_order").default(0),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const budgetVariances = pgTable("budget_variances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  budgetId: varchar("budget_id").notNull(),

  // Period
  month: integer("month").notNull(), // 1-12
  year: integer("year").notNull(),

  // Variance data
  plannedAmount: decimal("planned_amount", { precision: 12, scale: 2 }).notNull(),
  actualSpent: decimal("actual_spent", { precision: 12, scale: 2 }).notNull(),
  variance: decimal("variance", { precision: 12, scale: 2 }).notNull(), // actual - planned
  variancePercentage: decimal("variance_percentage", { precision: 5, scale: 2 }), // (variance / planned) * 100

  // Analysis
  analysisNotes: text("analysis_notes"),
  actionItems: text("action_items").array(),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  budgetMonthIdx: index("budget_variances_month_idx").on(table.budgetId, table.year, table.month),
}));

export const disputes = pgTable("disputes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Who filed the dispute
  filedBy: varchar("filed_by").notNull(),
  filedByRole: varchar("filed_by_role").notNull(), // 'employee', 'manager', 'hr'

  // What's being disputed
  disputeType: varchar("dispute_type").notNull(), // 'performance_review', 'employer_rating', 'report_submission', 'composite_score'
  targetId: varchar("target_id").notNull(), // ID of the review/rating/report being disputed
  targetType: varchar("target_type").notNull(), // 'performance_reviews', 'employer_ratings', 'report_submissions', etc.

  // Dispute details
  title: varchar("title").notNull(),
  reason: text("reason").notNull(), // Why the dispute is being filed
  evidence: text("evidence").array(), // URLs to supporting documents
  requestedOutcome: text("requested_outcome"), // What the employee wants (e.g., "Remove write-up", "Change rating to 4")

  // ========================================================================
  // AI SUMMARIZATION - AutoScheduler Audit Tracker™
  // ========================================================================
  // AI analyzes dispute reason/evidence and provides summary + recommendation
  // Human managers make final decision (with AI insight)
  aiSummary: text("ai_summary"), // AI-generated summary of the dispute
  aiRecommendation: varchar("ai_recommendation"), // 'approve', 'reject', 'needs_review', 'escalate'
  aiConfidenceScore: decimal("ai_confidence_score", { precision: 3, scale: 2 }), // 0.00-1.00
  aiAnalysisFactors: text("ai_analysis_factors").array(), // Key factors AI considered
  aiProcessedAt: timestamp("ai_processed_at"),
  aiModel: varchar("ai_model"), // e.g., "gpt-4-turbo"

  // Labor law compliance tags (for audit tracker)
  complianceCategory: varchar("compliance_category"), // 'labor_law', 'payday_law', 'unemployment', 'flsa', 'osha', null
  regulatoryReference: varchar("regulatory_reference"), // e.g., "FLSA §207", "State Payday Law"

  // Priority & urgency
  priority: varchar("priority").default('normal'), // 'low', 'normal', 'high', 'urgent'

  // Assignment
  assignedTo: varchar("assigned_to"), // HR/Manager reviewing the dispute
  assignedAt: timestamp("assigned_at"),

  // Timeline
  filedAt: timestamp("filed_at").notNull().defaultNow(),
  reviewDeadline: timestamp("review_deadline"), // Must be reviewed by this date

  // Status tracking
  status: varchar("status").default('pending'), // 'pending', 'under_review', 'approved', 'rejected', 'partially_approved', 'withdrawn'

  // Review process
  reviewStartedAt: timestamp("review_started_at"),
  reviewerNotes: text("reviewer_notes"),
  reviewerRecommendation: varchar("reviewer_recommendation"), // 'approve', 'reject', 'partial', 'escalate'

  // Resolution
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by"),
  resolution: text("resolution"), // Final decision explanation
  resolutionAction: text("resolution_action"), // What was changed (e.g., "Rating changed from 2 to 3")

  // Changes made (if approved)
  changesApplied: boolean("changes_applied").default(false),
  changesAppliedAt: timestamp("changes_applied_at"),

  // Appeals (if dispute is rejected)
  canBeAppealed: boolean("can_be_appealed").default(true),
  appealDeadline: timestamp("appeal_deadline"),
  appealedToUpperManagement: boolean("appealed_to_upper_management").default(false),

  // Audit trail
  statusHistory: text("status_history").array(), // JSON strings of status changes

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  filedByIdx: index("disputes_filed_by_idx").on(table.filedBy),
  statusIdx: index("disputes_status_idx").on(table.status),
  typeIdx: index("disputes_type_idx").on(table.disputeType),
  targetIdx: index("disputes_target_idx").on(table.targetType, table.targetId),
  assignedToIdx: index("disputes_assigned_to_idx").on(table.assignedTo),
  workspaceStatusIdx: index("disputes_workspace_status_idx").on(table.workspaceId, table.status),
}));

export const paymentReminders = pgTable("payment_reminders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  invoiceId: varchar("invoice_id").notNull(),
  clientId: varchar("client_id").notNull(),
  
  reminderType: paymentReminderTypeEnum("reminder_type").notNull(),
  sentVia: reminderChannelEnum("sent_via").notNull().default('email'),
  recipientEmail: varchar("recipient_email"),
  
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  acknowledged: boolean("acknowledged").default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
  
  escalatedToOwner: boolean("escalated_to_owner").default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("payment_reminders_workspace_idx").on(table.workspaceId),
  index("payment_reminders_invoice_idx").on(table.invoiceId),
  index("payment_reminders_client_idx").on(table.clientId),
  index("payment_reminders_type_idx").on(table.reminderType),
]);

export const billingAddons = pgTable("billing_addons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  
  // Add-on identity
  addonKey: varchar("addon_key").notNull().unique(), // e.g., 'scheduleos_ai', 'recordos', 'insightos'
  name: varchar("name").notNull(), // e.g., 'Scheduling Platform AI Auto-Scheduling'
  description: text("description"),
  category: varchar("category").notNull(), // 'ai_feature', 'os_module', 'integration', 'support'
  
  // Pricing model
  pricingType: varchar("pricing_type").notNull(), // 'subscription', 'usage_based', 'hybrid', 'one_time'
  basePrice: decimal("base_price", { precision: 10, scale: 2 }), // Monthly subscription fee
  usagePrice: decimal("usage_price", { precision: 10, scale: 4 }), // Price per usage unit (e.g., per token, per session)
  usageUnit: varchar("usage_unit"), // 'token', 'session', 'activity', 'api_call', 'hour'
  
  // AI token allowances (for hybrid pricing)
  monthlyTokenAllowance: decimal("monthly_token_allowance", { precision: 15, scale: 2 }), // Included AI tokens per month
  overageRatePer1kTokens: decimal("overage_rate_per_1k_tokens", { precision: 10, scale: 4 }), // Overage rate per 1000 tokens
  
  // Stripe integration
  stripePriceId: varchar("stripe_price_id"), // Stripe price ID for subscription
  stripeMeteredPriceId: varchar("stripe_metered_price_id"), // Stripe price ID for usage billing
  
  // Feature flags
  requiresBaseTier: varchar("requires_base_tier"), // Minimum subscription tier required
  isAIFeature: boolean("is_ai_feature").default(false), // Is this an AI/autonomous feature
  isActive: boolean("is_active").default(true), // Can be purchased
  
  // Metadata
  metadata: jsonb("metadata"), // Additional configuration
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const aiTokenWallets = pgTable("ai_token_wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique(),
  
  // Balance tracking
  currentBalance: decimal("current_balance", { precision: 15, scale: 4 }).notNull().default("0.0000"), // Current credit balance
  totalPurchased: decimal("total_purchased", { precision: 15, scale: 4 }).notNull().default("0.0000"), // Lifetime purchases
  totalUsed: decimal("total_used", { precision: 15, scale: 4 }).notNull().default("0.0000"), // Lifetime usage
  
  // Monthly included credits (from subscription tier)
  monthlyIncludedCredits: decimal("monthly_included_credits", { precision: 10, scale: 2 }).default("0.00"),
  monthlyCreditsUsed: decimal("monthly_credits_used", { precision: 10, scale: 2 }).default("0.00"),
  monthlyCreditsResetAt: timestamp("monthly_credits_reset_at"), // When monthly credits reset
  
  // Auto-recharge settings
  autoRechargeEnabled: boolean("auto_recharge_enabled").default(false),
  autoRechargeThreshold: decimal("auto_recharge_threshold", { precision: 10, scale: 2 }), // Recharge when below this
  autoRechargeAmount: decimal("auto_recharge_amount", { precision: 10, scale: 2 }), // Amount to recharge
  
  // Low balance alerts
  lowBalanceAlertEnabled: boolean("low_balance_alert_enabled").default(true),
  lowBalanceAlertThreshold: decimal("low_balance_alert_threshold", { precision: 10, scale: 2 }).default("10.00"),
  lastLowBalanceAlertAt: timestamp("last_low_balance_alert_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  creditSettings: jsonb("credit_settings").default('{}'),
  workspaceCreditsId: varchar("workspace_credits_id"),
  monthlyBudgetLimit: decimal("monthly_budget_limit"),
  currentMonthUsage: decimal("current_month_usage").default(0),
  rfpCreditsRemaining: integer("rfp_credits_remaining").default(0),
  rfpMonthlyIncluded: integer("rfp_monthly_included").default(0),
  topoffPaymentMethodId: varchar("topoff_payment_method_id"),
  lastTopoffAt: timestamp("last_topoff_at"),
});

export const subscriptionInvoices = pgTable("subscription_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Invoice identity
  invoiceNumber: varchar("invoice_number").notNull().unique(), // e.g., "SUB-INV-2024-W14-ORG-XXXX"
  
  // Billing period
  billingPeriodStart: timestamp("billing_period_start").notNull(),
  billingPeriodEnd: timestamp("billing_period_end").notNull(),
  
  // Amounts
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull().default("0.00"),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default("0.00"),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).default("0.00"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  
  // Payment status
  status: varchar("status").notNull().default('draft'), // 'draft', 'pending', 'paid', 'overdue', 'cancelled', 'void'
  paidAt: timestamp("paid_at"),
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }).default("0.00"),
  dueDate: timestamp("due_date").notNull(),
  
  // Stripe integration
  stripeInvoiceId: varchar("stripe_invoice_id"),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  
  // Metadata
  notes: text("notes"),
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("subscription_invoices_workspace_idx").on(table.workspaceId),
  statusIdx: index("subscription_invoices_status_idx").on(table.status),
  dueDateIdx: index("subscription_invoices_due_date_idx").on(table.dueDate),
  createdAtIdx: index("subscription_invoices_created_at_idx").on(table.createdAt),
  stripeIdx: index("subscription_invoices_stripe_idx").on(table.stripeInvoiceId),
}));

export const subscriptionLineItems = pgTable("subscription_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  invoiceId: varchar("invoice_id").notNull(),
  
  // Line item details
  itemType: varchar("item_type").notNull(), // 'subscription', 'addon', 'usage', 'overage', 'credit', 'adjustment'
  description: text("description").notNull(),
  
  // Quantity & pricing
  quantity: decimal("quantity", { precision: 15, scale: 4 }).default("1.0000"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 4 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  
  // Related entities
  addonId: varchar("addon_id"), // If this is an add-on charge
  featureKey: varchar("feature_key"), // If this is a usage charge
  
  // Metadata
  metadata: jsonb("metadata"), // Usage details, date range, etc.
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  invoiceIdx: index("subscription_line_items_invoice_idx").on(table.invoiceId),
  typeIdx: index("subscription_line_items_type_idx").on(table.itemType),
  addonIdx: index("subscription_line_items_addon_idx").on(table.addonId),
}));

export const subscriptionPayments = pgTable("subscription_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  invoiceId: varchar("invoice_id"),
  
  // Payment details
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency").notNull().default('usd'),
  
  // Payment status
  status: varchar("status").notNull(), // 'pending', 'succeeded', 'failed', 'refunded'
  failureReason: text("failure_reason"),
  
  // Payment method
  paymentMethod: varchar("payment_method"), // 'card', 'ach', 'wire', 'credit'
  paymentMethodLast4: varchar("payment_method_last4"),
  
  // Stripe integration
  stripePaymentIntentId: varchar("stripe_payment_intent_id").unique(),
  stripeChargeId: varchar("stripe_charge_id"),
  
  // Transaction info
  paidAt: timestamp("paid_at"),
  refundedAt: timestamp("refunded_at"),
  refundAmount: decimal("refund_amount", { precision: 10, scale: 2 }),
  
  // Metadata
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("subscription_payments_workspace_idx").on(table.workspaceId),
  invoiceIdx: index("subscription_payments_invoice_idx").on(table.invoiceId),
  statusIdx: index("subscription_payments_status_idx").on(table.status),
  stripeIdx: index("subscription_payments_stripe_idx").on(table.stripePaymentIntentId),
  createdAtIdx: index("subscription_payments_created_at_idx").on(table.createdAt),
}));

export const billingAuditLog = pgTable("billing_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Event identification
  eventType: varchar("event_type").notNull(), // 'addon_purchased', 'addon_cancelled', 'usage_recorded', 'invoice_generated', 'payment_succeeded', 'payment_failed', 'account_suspended', 'account_reactivated', 'credits_purchased', 'feature_toggled'
  eventCategory: varchar("event_category").notNull(), // 'subscription', 'usage', 'payment', 'account', 'feature'
  
  // Actor
  actorType: varchar("actor_type").notNull(), // 'user', 'system', 'admin', 'webhook'
  actorId: varchar("actor_id"), // User ID if user action, null if system
  actorEmail: varchar("actor_email"),
  
  // Event details
  description: text("description").notNull(),
  
  // Related entities
  relatedEntityType: varchar("related_entity_type"), // 'invoice', 'addon', 'payment', 'usage_event'
  relatedEntityId: varchar("related_entity_id"),
  
  // Changes
  previousState: jsonb("previous_state"), // State before change
  newState: jsonb("new_state"), // State after change
  
  // Metadata
  metadata: jsonb("metadata"), // Additional context
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),

  // Idempotency key — prevents duplicate billing run entries and duplicate per-workspace charges.
  // Unique (where non-null) so concurrent billing runs produce a 23505 constraint violation
  // on the second INSERT, which acquireRunLock() catches and converts to locked=true.
  idempotencyKey: varchar("idempotency_key"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("billing_audit_workspace_idx").on(table.workspaceId),
  eventTypeIdx: index("billing_audit_event_type_idx").on(table.eventType),
  categoryIdx: index("billing_audit_category_idx").on(table.eventCategory),
  actorIdx: index("billing_audit_actor_idx").on(table.actorId),
  createdAtIdx: index("billing_audit_created_at_idx").on(table.createdAt),
  idempotencyKeyUniqueIdx: uniqueIndex("billing_audit_idempotency_key_unique_idx").on(table.idempotencyKey),
}));

export const workspaceRateHistory = pgTable("workspace_rate_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Default rates (fallback when employee/client rates not configured)
  defaultBillableRate: decimal("default_billable_rate", { precision: 10, scale: 2 }),
  defaultHourlyRate: decimal("default_hourly_rate", { precision: 10, scale: 2 }),
  
  // Versioning
  validFrom: timestamp("valid_from").notNull().defaultNow(),
  validTo: timestamp("valid_to"), // NULL = current active rate
  supersededBy: varchar("superseded_by"), // FK to next version
  
  // Audit trail
  changedBy: varchar("changed_by"),
  changeReason: text("change_reason"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index("workspace_rate_history_workspace_idx").on(table.workspaceId),
  validFromIdx: index("workspace_rate_history_valid_from_idx").on(table.validFrom),
  validToIdx: index("workspace_rate_history_valid_to_idx").on(table.validTo),
  activeRateIdx: index("workspace_rate_history_active_idx").on(table.workspaceId, table.validTo),
}));

export const quickbooksMigrationRuns = pgTable("quickbooks_migration_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Migration status
  status: migrationStatusEnum("status").notNull().default('running'),
  
  // Progress tracking
  totalEmployees: integer("total_employees").default(0),
  syncedEmployees: integer("synced_employees").default(0),
  totalCustomers: integer("total_customers").default(0),
  syncedCustomers: integer("synced_customers").default(0),
  totalInvoices: integer("total_invoices").default(0),
  syncedInvoices: integer("synced_invoices").default(0),
  
  // Current position for restart capability
  lastProcessedEmployeeId: varchar("last_processed_employee_id"),
  lastProcessedCustomerId: varchar("last_processed_customer_id"),
  
  // Timing
  startedAt: timestamp("started_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
  cancelRequestedAt: timestamp("cancel_requested_at"),
  
  // Initiator
  initiatedBy: varchar("initiated_by"),
  
  // Error tracking
  errorMessage: text("error_message"),
  
  // Metadata for additional context
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("qb_migration_runs_workspace_idx").on(table.workspaceId),
  statusIdx: index("qb_migration_runs_status_idx").on(table.status),
  runningWorkspaceUnique: uniqueIndex("qb_migration_runs_running_workspace")
    .on(table.workspaceId)
    .where(sql`status = 'running' OR status = 'cancel_requested'`),
}));

export const quickbooksOnboardingFlows = pgTable("quickbooks_onboarding_flows", {
  id: varchar("id").primaryKey(),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id").notNull(),
  stage: quickbooksFlowStageEnum("stage").notNull().default('oauth_initiated'),
  connectionId: varchar("connection_id"),
  realmId: varchar("realm_id"),
  syncJobId: varchar("sync_job_id"),
  importedEmployeeCount: integer("imported_employee_count").default(0),
  generatedScheduleId: varchar("generated_schedule_id"),
  automationSettings: jsonb("automation_settings").default({ autoInvoice: true, autoPayroll: true, autoSchedule: true }),
  errors: jsonb("errors").default([]),
  warnings: jsonb("warnings").default([]),
  flowData: jsonb("flow_data"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("qb_flows_workspace_idx").on(table.workspaceId),
  stageIdx: index("qb_flows_stage_idx").on(table.stage),
  userIdx: index("qb_flows_user_idx").on(table.userId),
}));

export const quickbooksApiUsage = pgTable("quickbooks_api_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  realmId: varchar("realm_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  requestCount: integer("request_count").notNull().default(0),
  periodStart: timestamp("period_start").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  realmPeriodIdx: index("qb_api_usage_realm_period_idx").on(table.realmId, table.periodStart),
  workspaceIdx: index("qb_api_usage_workspace_idx").on(table.workspaceId),
  realmPeriodUnique: unique("qb_api_usage_realm_period_unique").on(table.realmId, table.periodStart),
}));

export const billingPolicyProfiles = pgTable("billing_policy_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Scoping (nullable = org default, specified = override)
  clientId: varchar("client_id"),
  siteId: varchar("site_id"),
  roleId: varchar("role_id"),
  
  // Profile name
  name: varchar("name").notNull(),
  isDefault: boolean("is_default").default(false),
  
  // Rounding rules
  billableRounding: varchar("billable_rounding").notNull().default('15_min'), // '1_min', '5_min', '15_min', '30_min'
  payrollRounding: varchar("payroll_rounding").notNull().default('1_min'),
  roundingDirection: varchar("rounding_direction").default('nearest'), // 'up', 'down', 'nearest'
  
  // Break rules
  breakRules: jsonb("break_rules"), // { unpaidBreakMinutes: 30, autoDeductBreaks: true, breakThreshold: 360 }
  
  // Overtime rules
  overtimeRules: jsonb("overtime_rules"), // { weekly_threshold: 40, daily_threshold: null, rate_multiplier: 1.5 }
  doubleTimeRules: jsonb("double_time_rules"), // { daily_threshold: 12, rate_multiplier: 2.0 }
  
  // Holiday rules
  holidayRules: jsonb("holiday_rules"), // { holidays: [...], rate_multiplier: 1.5 }
  
  // Invoice grouping
  invoiceGrouping: varchar("invoice_grouping").default('by_client'), // 'by_client', 'by_site', 'by_role'
  
  // Approval mode
  approvalMode: varchar("approval_mode").default('auto_send'), // 'auto_send', 'approve', 'hybrid'
  
  // Status
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("billing_policy_workspace_idx").on(table.workspaceId),
  clientIdx: index("billing_policy_client_idx").on(table.clientId),
  defaultIdx: index("billing_policy_default_idx").on(table.workspaceId, table.isDefault),
}));

export const usageAggregates = pgTable("usage_aggregates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  aggregateDate: timestamp("aggregate_date").notNull(),
  aggregatePeriod: varchar("aggregate_period", { length: 20 }).notNull(),
  
  activeUsers: integer("active_users").default(0),
  totalSessions: integer("total_sessions").default(0),
  totalPageViews: integer("total_page_views").default(0),
  
  featureAdoptionScore: decimal("feature_adoption_score", { precision: 5, scale: 2 }),
  engagementScore: decimal("engagement_score", { precision: 5, scale: 2 }),
  
  aiActionsExecuted: integer("ai_actions_executed").default(0),
  aiActionsSuccessful: integer("ai_actions_successful").default(0),
  manualOverrides: integer("manual_overrides").default(0),
  
  apiCallsTotal: integer("api_calls_total").default(0),
  apiCallsInternal: integer("api_calls_internal").default(0),
  apiCallsPartner: integer("api_calls_partner").default(0),
  
  totalCostEstimate: decimal("total_cost_estimate", { precision: 12, scale: 4 }),
  aiCostEstimate: decimal("ai_cost_estimate", { precision: 12, scale: 4 }),
  partnerApiCostEstimate: decimal("partner_api_cost_estimate", { precision: 12, scale: 4 }),
  
  topFeatures: jsonb("top_features"),
  topEndpoints: jsonb("top_endpoints"),
  userBreakdown: jsonb("user_breakdown"),
  
  metadata: jsonb("metadata"),
  
  computedAt: timestamp("computed_at").defaultNow(),

  createdAt: timestamp("created_at").defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("usage_agg_workspace_idx").on(table.workspaceId),
  index("usage_agg_date_idx").on(table.aggregateDate),
  index("usage_agg_period_idx").on(table.aggregatePeriod),
  index("usage_agg_workspace_date_idx").on(table.workspaceId, table.aggregateDate),
]);

export const commitmentLedger = pgTable("commitment_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Context
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id"),
  runId: varchar("run_id"),
  
  // Commitment type
  commitmentType: varchar("commitment_type", { length: 50 }).notNull(),
  // 'intent', 'lock', 'reservation', 'approval_pending', 'committed', 'rolled_back'
  
  // Resource being committed
  resourceType: varchar("resource_type", { length: 100 }).notNull(), // 'schedule', 'payroll', 'notification', 'employee'
  resourceId: varchar("resource_id", { length: 255 }),
  
  // Commitment details
  description: text("description"),
  commitmentData: jsonb("commitment_data"), // What will be changed
  compensationData: jsonb("compensation_data"), // How to roll back
  
  // Status
  status: varchar("status", { length: 30 }).default('pending').notNull(),
  // 'pending', 'active', 'fulfilled', 'cancelled', 'compensated'
  
  // Expiry (for locks/reservations)
  expiresAt: timestamp("expires_at"),
  
  // Resolution
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by"),
  resolutionReason: text("resolution_reason"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("commitment_workspace_idx").on(table.workspaceId),
  index("commitment_run_idx").on(table.runId),
  index("commitment_type_idx").on(table.commitmentType),
  index("commitment_resource_idx").on(table.resourceType, table.resourceId),
  index("commitment_status_idx").on(table.status),
  index("commitment_expires_idx").on(table.expiresAt),
]);

export const trinityCreditPackages = pgTable("trinity_credit_packages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Package details
  name: varchar("name", { length: 100 }).notNull(), // 'Starter Pack', 'Pro Pack', 'Enterprise Pack'
  description: text("description"),
  credits: integer("credits").notNull(), // Number of credits in package
  priceUsd: decimal("price_usd", { precision: 10, scale: 2 }).notNull(), // Price in USD
  
  // Package type
  packageType: varchar("package_type", { length: 30 }).default("one_time"), // 'one_time', 'subscription', 'enterprise'
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  
  // Bonus credits for larger packages
  bonusCredits: integer("bonus_credits").default(0),
  
  // Tier restrictions (which subscription tiers can buy this)
  allowedTiers: text("allowed_tiers").array().default(sql`ARRAY['starter', 'professional', 'enterprise']::text[]`),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const trinityCredits = pgTable("trinity_credits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique(),
  
  // Balance
  balance: integer("balance").notNull().default(0), // Current credit balance
  lifetimePurchased: integer("lifetime_purchased").default(0), // Total credits ever purchased
  lifetimeUsed: integer("lifetime_used").default(0), // Total credits ever consumed
  lifetimeBonuses: integer("lifetime_bonuses").default(0), // Total bonus credits received
  
  // Status
  isActive: boolean("is_active").default(true), // Whether credits can be used
  lowBalanceThreshold: integer("low_balance_threshold").default(50), // Alert when below this
  lastLowBalanceAlert: timestamp("last_low_balance_alert"),
  
  // Tracking
  lastUsedAt: timestamp("last_used_at"),
  lastPurchasedAt: timestamp("last_purchased_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  unlockData: jsonb("unlock_data").default('{}'),
  confidenceData: jsonb("confidence_data").default('{}'),
}, (table) => [
  index("trinity_credits_workspace_idx").on(table.workspaceId),
  index("trinity_credits_balance_idx").on(table.balance),
]);

export const trinityCreditCosts = pgTable("trinity_credit_costs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Action identification
  actionKey: varchar("action_key", { length: 100 }).notNull().unique(), // Maps to AI Brain action keys
  actionCategory: varchar("action_category", { length: 50 }).notNull(), // 'trinity_command', 'automation', 'ai_analysis', etc.
  
  // Cost
  credits: integer("credits").notNull().default(1), // Credits consumed per use
  
  // Tier adjustments (some tiers may get discounts)
  freeMultiplier: decimal("free_multiplier", { precision: 4, scale: 2 }).default("1.0"),
  starterMultiplier: decimal("starter_multiplier", { precision: 4, scale: 2 }).default("1.0"),
  professionalMultiplier: decimal("professional_multiplier", { precision: 4, scale: 2 }).default("0.8"),
  enterpriseMultiplier: decimal("enterprise_multiplier", { precision: 4, scale: 2 }).default("0.5"),
  
  // Display
  displayName: varchar("display_name", { length: 100 }),
  description: text("description"),
  
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("trinity_credit_costs_action_idx").on(table.actionKey),
  index("trinity_credit_costs_category_idx").on(table.actionCategory),
]);

export const quickbooksSyncReceipts = pgTable("quickbooks_sync_receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Sync type
  syncType: varchar("sync_type", { length: 30 }).notNull(), // invoice, payroll, customer, vendor, employee
  direction: varchar("direction", { length: 20 }).default("outbound"), // outbound (to QB), inbound (from QB), bidirectional
  
  // Entity references
  localEntityId: varchar("local_entity_id"), // Our invoice/payroll/employee ID
  localEntityType: varchar("local_entity_type", { length: 50 }), // invoice, payrollRun, employee, client
  quickbooksEntityId: varchar("quickbooks_entity_id"), // QB entity ID
  quickbooksEntityType: varchar("quickbooks_entity_type", { length: 50 }), // Invoice, Bill, Customer, Vendor, Employee
  
  // Sync details
  success: boolean("success").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }), // For financial syncs
  description: text("description"),
  
  // QuickBooks URLs
  quickbooksUrl: varchar("quickbooks_url", { length: 500 }), // Direct link to entity in QB
  quickbooksSyncToken: varchar("quickbooks_sync_token"), // For change detection
  
  // Error handling
  errorCode: varchar("error_code", { length: 50 }),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  
  // Trinity verification
  trinityVerified: boolean("trinity_verified").default(false),
  trinitySignature: text("trinity_signature"),
  
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("qbsr_workspace_idx").on(table.workspaceId),
  index("qbsr_sync_type_idx").on(table.syncType),
  index("qbsr_local_entity_idx").on(table.localEntityType, table.localEntityId),
  index("qbsr_qb_entity_idx").on(table.quickbooksEntityType, table.quickbooksEntityId),
  index("qbsr_synced_idx").on(table.syncedAt),
  index("qbsr_workspace_type_idx").on(table.workspaceId, table.syncType),
]);

export const billingServices = pgTable("billing_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Service identification
  serviceCode: varchar("service_code", { length: 50 }).notNull(), // e.g., "ARM-01", "UNARM-01"
  serviceName: varchar("service_name", { length: 200 }).notNull(), // e.g., "Armed Security Officer"
  serviceType: serviceTypeEnum("service_type").default("unarmed_guard"),
  
  // Service categorization
  isArmed: boolean("is_armed").default(false), // Quick filter for armed/unarmed
  category: varchar("category", { length: 100 }), // "Security", "Patrol", "Investigation"
  subCategory: varchar("sub_category", { length: 100 }), // More specific grouping
  
  // Description
  description: text("description"),
  
  // Billing rates
  defaultHourlyRate: decimal("default_hourly_rate", { precision: 10, scale: 2 }).notNull(),
  overtimeRate: decimal("overtime_rate", { precision: 10, scale: 2 }), // Optional override
  holidayRate: decimal("holiday_rate", { precision: 10, scale: 2 }), // Optional override
  minimumHours: decimal("minimum_hours", { precision: 5, scale: 2 }).default("4.00"), // Minimum billable hours
  
  // Pay rates (what you pay employees for this service)
  defaultPayRate: decimal("default_pay_rate", { precision: 10, scale: 2 }),
  
  // QuickBooks mapping
  quickbooksItemId: varchar("quickbooks_item_id"), // QB Service/Item ID
  quickbooksItemName: varchar("quickbooks_item_name"), // QB display name
  
  // Certifications required for this service
  requiredCertifications: text("required_certifications").array(),
  
  // Status
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0), // Display order
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  addonData: jsonb("addon_data").default('{}'),
  policyData: jsonb("policy_data").default('{}'),
  auditData: jsonb("audit_data").default('{}'),
}, (table) => [
  index("bs_workspace_idx").on(table.workspaceId),
  index("bs_service_code_idx").on(table.workspaceId, table.serviceCode),
  index("bs_type_idx").on(table.serviceType),
  index("bs_armed_idx").on(table.isArmed),
  index("bs_qb_item_idx").on(table.quickbooksItemId),
]);

export const processedStripeEvents = pgTable("processed_stripe_events", {
  eventId: varchar("event_id", { length: 255 }).primaryKey(),
  eventType: varchar("event_type", { length: 128 }),
  processedAt: timestamp("processed_at").defaultNow().notNull(),

  createdAt: timestamp("created_at").default(sql`now()`),
}, (table) => [
  index("idx_processed_stripe_events_time").on(table.processedAt),
]);

export const evvBillingCodes = pgTable("evv_billing_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stateCode: varchar("state_code", { length: 2 }).notNull(), // US state
  billingCode: varchar("billing_code", { length: 20 }).notNull(),
  description: text("description").notNull(),
  serviceCategory: varchar("service_category", { length: 50 }), // personal_care, skilled_nursing, respite, etc.
  requiresPhysicianOrder: boolean("requires_physician_order").default(false),
  maxUnitsPerDay: integer("max_units_per_day"),
  unitDurationMinutes: integer("unit_duration_minutes").default(15), // Typical 15-min units
  medicaidRate: decimal("medicaid_rate", { precision: 10, scale: 2 }),
  effectiveDate: date("effective_date"),
  expirationDate: date("expiration_date"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("evv_codes_state_idx").on(table.stateCode),
  index("evv_codes_code_idx").on(table.billingCode),
  uniqueIndex("evv_codes_state_code_unique").on(table.stateCode, table.billingCode),
]);

export const locationPnlSnapshots = pgTable("location_pnl_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  locationId: varchar("location_id").notNull(),
  periodType: varchar("period_type", { length: 20 }).notNull(), // daily, weekly, monthly, quarterly, yearly
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  // Revenue
  totalRevenue: decimal("total_revenue", { precision: 14, scale: 2 }).default("0"),
  invoicedAmount: decimal("invoiced_amount", { precision: 14, scale: 2 }).default("0"),
  collectedAmount: decimal("collected_amount", { precision: 14, scale: 2 }).default("0"),
  // Costs
  totalLabor: decimal("total_labor", { precision: 14, scale: 2 }).default("0"),
  totalMaterials: decimal("total_materials", { precision: 14, scale: 2 }).default("0"),
  totalOverhead: decimal("total_overhead", { precision: 14, scale: 2 }).default("0"),
  // Profit
  grossProfit: decimal("gross_profit", { precision: 14, scale: 2 }).default("0"),
  netProfit: decimal("net_profit", { precision: 14, scale: 2 }).default("0"),
  profitMargin: decimal("profit_margin", { precision: 5, scale: 2 }), // Percentage
  // Metrics
  totalHoursWorked: decimal("total_hours_worked", { precision: 10, scale: 2 }),
  totalShifts: integer("total_shifts"),
  employeeCount: integer("employee_count"),
  clientCount: integer("client_count"),
  // Sync
  qboSynced: boolean("qbo_synced").default(false),
  qboSyncedAt: timestamp("qbo_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("pnl_snapshots_workspace_idx").on(table.workspaceId),
  index("pnl_snapshots_location_idx").on(table.locationId),
  index("pnl_snapshots_period_idx").on(table.periodStart, table.periodEnd),
  uniqueIndex("pnl_snapshots_unique").on(table.locationId, table.periodType, table.periodStart),
]);

export const reconciliationFindings = pgTable("reconciliation_findings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  runId: varchar("run_id").notNull(), // Groups findings from same reconciliation run
  // Finding type
  findingType: varchar("finding_type", { length: 50 }).notNull(), // invoice_mismatch, payment_mismatch, time_mismatch, customer_sync, employee_sync, duplicate_entry
  severity: varchar("severity", { length: 20 }).notNull(), // low, medium, high, critical
  // Entity references
  entityType: varchar("entity_type", { length: 30 }), // invoice, payment, time_entry, customer, employee, vendor
  localEntityId: varchar("local_entity_id"),
  qboEntityId: varchar("qbo_entity_id"),
  // Discrepancy details
  fieldName: varchar("field_name", { length: 100 }), // Which field has discrepancy
  localValue: text("local_value"),
  qboValue: text("qbo_value"),
  discrepancyAmount: decimal("discrepancy_amount", { precision: 14, scale: 2 }), // Dollar difference if applicable
  // AI analysis
  description: text("description").notNull(),
  suggestedAction: text("suggested_action"),
  confidence: decimal("confidence", { precision: 3, scale: 2 }), // 0.00 to 1.00
  autoFixable: boolean("auto_fixable").default(false),
  // Resolution
  status: varchar("status", { length: 20 }).default("open"), // open, acknowledged, resolved, ignored, auto_fixed
  resolvedBy: varchar("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("recon_findings_workspace_idx").on(table.workspaceId),
  index("recon_findings_run_idx").on(table.runId),
  index("recon_findings_status_idx").on(table.status),
  index("recon_findings_severity_idx").on(table.severity),
  index("recon_findings_type_idx").on(table.findingType),
]);

export const reconciliationRuns = pgTable("reconciliation_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  runType: varchar("run_type", { length: 30 }).notNull(), // scheduled, manual, triggered
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at"),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  // Results
  status: varchar("status", { length: 20 }).default("running"), // running, completed, failed
  totalEntitiesScanned: integer("total_entities_scanned").default(0),
  findingsCount: integer("findings_count").default(0),
  criticalCount: integer("critical_count").default(0),
  highCount: integer("high_count").default(0),
  mediumCount: integer("medium_count").default(0),
  lowCount: integer("low_count").default(0),
  autoFixedCount: integer("auto_fixed_count").default(0),
  totalDiscrepancyAmount: decimal("total_discrepancy_amount", { precision: 14, scale: 2 }),
  // Metadata
  triggeredBy: varchar("triggered_by"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("recon_runs_workspace_idx").on(table.workspaceId),
  index("recon_runs_status_idx").on(table.status),
]);

export const financialSnapshots = pgTable("financial_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Period definition
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  granularity: financialSnapshotGranularityEnum("granularity").notNull(),
  
  // Core P&L metrics
  revenueTotal: decimal("revenue_total", { precision: 14, scale: 2 }).notNull().default('0'),
  payrollTotal: decimal("payroll_total", { precision: 14, scale: 2 }).notNull().default('0'),
  expenseTotal: decimal("expense_total", { precision: 14, scale: 2 }).notNull().default('0'),
  
  // Calculated metrics
  grossProfit: decimal("gross_profit", { precision: 14, scale: 2 }).notNull().default('0'),
  netProfit: decimal("net_profit", { precision: 14, scale: 2 }).notNull().default('0'),
  marginPercent: decimal("margin_percent", { precision: 5, scale: 2 }),
  
  // Revenue breakdown
  invoicedAmount: decimal("invoiced_amount", { precision: 14, scale: 2 }),
  collectedAmount: decimal("collected_amount", { precision: 14, scale: 2 }),
  outstandingAmount: decimal("outstanding_amount", { precision: 14, scale: 2 }),
  
  // Expense breakdown
  overtimeCost: decimal("overtime_cost", { precision: 14, scale: 2 }),
  benefitsCost: decimal("benefits_cost", { precision: 14, scale: 2 }),
  insuranceCost: decimal("insurance_cost", { precision: 14, scale: 2 }),
  equipmentCost: decimal("equipment_cost", { precision: 14, scale: 2 }),
  adminCost: decimal("admin_cost", { precision: 14, scale: 2 }),
  
  // Data source
  source: financialSnapshotSourceEnum("source").notNull().default('platform'),
  quickbooksLastSyncAt: timestamp("quickbooks_last_sync_at"),
  
  // AI insights (stored for caching)
  aiInsights: jsonb("ai_insights"), // Array of insight strings
  aiInsightsGeneratedAt: timestamp("ai_insights_generated_at"),
  
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),

  snapshotType: varchar("snapshot_type"),
  processingFees: jsonb("processing_fees").default('{}'),
  alertData: jsonb("alert_data").default('{}'),
  varianceData: jsonb("variance_data").default('{}'),
}, (table) => [
  index("fin_snapshot_workspace_idx").on(table.workspaceId),
  index("fin_snapshot_period_idx").on(table.periodStart, table.periodEnd),
  index("fin_snapshot_granularity_idx").on(table.granularity),
]);

export const clientProfitability = pgTable("client_profitability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  clientId: varchar("client_id").notNull(),
  
  // Period definition
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  
  // Revenue metrics
  revenue: decimal("revenue", { precision: 14, scale: 2 }).notNull().default('0'),
  invoicedHours: decimal("invoiced_hours", { precision: 10, scale: 2 }),
  effectiveBillRate: decimal("effective_bill_rate", { precision: 10, scale: 2 }),
  
  // Cost metrics
  directLaborCost: decimal("direct_labor_cost", { precision: 14, scale: 2 }).notNull().default('0'),
  overtimeCost: decimal("overtime_cost", { precision: 14, scale: 2 }),
  directExpenses: decimal("direct_expenses", { precision: 14, scale: 2 }),
  overheadAllocated: decimal("overhead_allocated", { precision: 14, scale: 2 }),
  
  // Hours tracking
  scheduledHours: decimal("scheduled_hours", { precision: 10, scale: 2 }),
  actualHours: decimal("actual_hours", { precision: 10, scale: 2 }),
  
  // Profitability
  grossProfit: decimal("gross_profit", { precision: 14, scale: 2 }).notNull().default('0'),
  netProfit: decimal("net_profit", { precision: 14, scale: 2 }),
  marginPercent: decimal("margin_percent", { precision: 5, scale: 2 }),
  
  // Comparison to target
  targetMarginPercent: decimal("target_margin_percent", { precision: 5, scale: 2 }),
  marginVariance: decimal("margin_variance", { precision: 5, scale: 2 }),
  
  // AI-detected flags
  isUnderperforming: boolean("is_underperforming").default(false),
  aiRecommendation: text("ai_recommendation"),
  
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("client_profit_workspace_idx").on(table.workspaceId),
  index("client_profit_client_idx").on(table.clientId),
  index("client_profit_period_idx").on(table.periodStart, table.periodEnd),
  uniqueIndex("client_profit_unique_idx").on(table.workspaceId, table.clientId, table.periodStart, table.periodEnd),
]);

export const financialAlerts = pgTable("financial_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Alert classification
  severity: financialAlertSeverityEnum("severity").notNull(),
  category: financialAlertCategoryEnum("category").notNull(),
  
  // Alert content
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message").notNull(),
  actionSuggestion: text("action_suggestion"),
  
  // Related entity (for drill-down)
  relatedEntityType: varchar("related_entity_type"), // 'client', 'invoice', 'employee', 'expense'
  relatedEntityId: varchar("related_entity_id"),
  
  // Numeric details for display
  metricValue: decimal("metric_value", { precision: 14, scale: 2 }),
  thresholdValue: decimal("threshold_value", { precision: 14, scale: 2 }),
  variancePercent: decimal("variance_percent", { precision: 5, scale: 2 }),
  
  // Lifecycle
  status: varchar("status", { length: 20 }).default("active"), // active, acknowledged, resolved, dismissed
  acknowledgedBy: varchar("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),
  
  // Auto-generated flag
  isAiGenerated: boolean("is_ai_generated").default(true),
  aiModel: varchar("ai_model"),
  
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"), // Auto-dismiss old alerts
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("fin_alert_workspace_idx").on(table.workspaceId),
  index("fin_alert_severity_idx").on(table.severity),
  index("fin_alert_category_idx").on(table.category),
  index("fin_alert_status_idx").on(table.status),
  index("fin_alert_detected_idx").on(table.detectedAt),
]);

export const subscriptionTiers = pgTable("subscription_tiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tierName: varchar("tier_name", { length: 50 }).notNull().unique(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  
  // Core features array
  coreFeatures: jsonb("core_features").$type<string[]>().default(sql`'[]'::jsonb`),
  includedPremiumFeatures: jsonb("included_premium_features").$type<string[]>().default(sql`'[]'::jsonb`),
  
  // Pricing
  basePrice: decimal("base_price", { precision: 10, scale: 2 }).notNull().default('0'),
  includedCredits: integer("included_credits").notNull().default(0),
  creditCostPerUnit: decimal("credit_cost_per_unit", { precision: 6, scale: 4 }).default('0.01'),
  
  // Usage limits
  usageLimits: jsonb("usage_limits").$type<Record<string, number>>().default(sql`'{}'::jsonb`),
  
  // Billing Spec v2.0 — Employee limits and processing fee rates
  basePriceCents: integer("base_price_cents").notNull().default(0),
  includedEmployees: integer("included_employees").notNull().default(0),
  perEmployeeOverageCents: integer("per_employee_overage_cents").notNull().default(0),
  perInvoiceFeeCents: integer("per_invoice_fee_cents").notNull().default(0),
  perPayrollFeeCents: integer("per_payroll_fee_cents").notNull().default(0),
  perQbSyncFeeCents: integer("per_qb_sync_fee_cents").notNull().default(0),
  carryoverPercentage: integer("carryover_percentage").notNull().default(10),
  perEmployeeCreditScaling: integer("per_employee_credit_scaling").notNull().default(0),
  baseCredits: integer("base_credits").notNull().default(0),

  // Tier metadata
  description: text("description"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("subscription_tiers_name_idx").on(table.tierName),
]);

export const addonFeatures = pgTable("addon_features", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  featureKey: varchar("feature_key", { length: 100 }).notNull().unique(),
  displayName: varchar("display_name", { length: 150 }).notNull(),
  description: text("description"),
  
  // Pricing type: 'flat_monthly' or 'credit_based'
  pricingType: varchar("pricing_type", { length: 20 }).notNull().default('flat_monthly'),
  monthlyCost: decimal("monthly_cost", { precision: 10, scale: 2 }).default('0'),
  creditsRequiredMonthly: integer("credits_required_monthly").default(0),
  
  // Dependencies (other add-ons required)
  dependencies: jsonb("dependencies").$type<string[]>().default(sql`'[]'::jsonb`),
  
  // Category for UI grouping
  category: varchar("category", { length: 50 }).default('general'),
  
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("addon_features_key_idx").on(table.featureKey),
  index("addon_features_category_idx").on(table.category),
]);

export const orgSubscriptions = pgTable("org_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  tierId: varchar("tier_id").notNull(),
  
  // Subscription status
  status: varchar("status", { length: 30 }).notNull().default('pending_configuration'),
  
  // Billing
  monthlyTotal: decimal("monthly_total", { precision: 10, scale: 2 }).default('0'),
  creditAllocation: integer("credit_allocation").default(0),
  autoTopoffEnabled: boolean("auto_topoff_enabled").default(false),
  autoTopoffThreshold: integer("auto_topoff_threshold").default(100),
  autoTopoffAmount: integer("auto_topoff_amount").default(1000),
  
  // Stripe
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  
  // Lifecycle
  subscriptionStartedAt: timestamp("subscription_started_at"),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("org_subscriptions_workspace_idx").on(table.workspaceId),
  index("org_subscriptions_tier_idx").on(table.tierId),
]);

export const upsellEvents = pgTable("upsell_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  eventType: varchar("event_type").notNull(), // 'depletion' | 'low_balance' | 'tier_suggestion' | 'addon_suggestion' | 'dismissed'
  featureKey: varchar("feature_key"),
  depletionCount: integer("depletion_count").default(1),
  suggestedTier: varchar("suggested_tier"),
  addonFeatureKey: varchar("addon_feature_key"),
  notificationSent: boolean("notification_sent").default(false),
  resolved: boolean("resolved").default(false),
  metadata: jsonb("metadata"),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_upsell_events_workspace").on(table.workspaceId, table.createdAt),
  index("idx_upsell_events_type").on(table.eventType, table.resolved),
]);

export const featureAddons = pgTable("feature_addons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  featureKey: varchar("feature_key").notNull(),
  planName: varchar("plan_name").notNull(),
  monthlyAllotmentCredits: integer("monthly_allotment_credits").notNull().default(500),
  creditsUsedThisPeriod: integer("credits_used_this_period").notNull().default(0),
  monthlyFeeCents: integer("monthly_fee_cents").notNull().default(0),
  status: varchar("status").notNull().default("active"), // 'active' | 'cancelled' | 'pending' | 'expired'
  stripePriceId: varchar("stripe_price_id"),
  stripeSubscriptionItemId: varchar("stripe_subscription_item_id"),
  renewsAt: timestamp("renews_at"),
  cancelledAt: timestamp("cancelled_at"),
  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at").default(sql`now()`),
}, (table) => [
  index("idx_feature_addons_workspace").on(table.workspaceId, table.status),
  uniqueIndex("idx_feature_addons_unique").on(table.workspaceId, table.featureKey),
]);

export const accountFreezes = pgTable("account_freezes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  entityType: complianceEntityTypeEnum("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  workspaceId: varchar("workspace_id"),
  complianceWindowId: varchar("compliance_window_id"),

  phase: freezePhaseEnum("phase").notNull(),
  status: freezeStatusEnum("status").notNull().default('active'),
  reason: text("reason").notNull(),
  missingDocTypes: jsonb("missing_doc_types").default([]),

  frozenAt: timestamp("frozen_at").defaultNow().notNull(),
  frozenBySystem: boolean("frozen_by_system").default(true),

  // Unfreeze — support staff only, requires open HelpDesk ticket
  liftedAt: timestamp("lifted_at"),
  liftedBy: varchar("lifted_by"),
  liftReason: text("lift_reason"),
  relatedTicketId: varchar("related_ticket_id"),


  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("idx_account_freezes_entity").on(table.entityType, table.entityId),
  index("idx_account_freezes_workspace").on(table.workspaceId),
  index("idx_account_freezes_status").on(table.status),
]);

export const freezeAppeals = pgTable("freeze_appeals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  entityType: complianceEntityTypeEnum("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  workspaceId: varchar("workspace_id"),
  freezeId: varchar("freeze_id"),
  complianceWindowId: varchar("compliance_window_id"),

  submittedBy: varchar("submitted_by"),
  appealReason: text("appeal_reason").notNull(),
  status: appealStatusEnum("status").notNull().default('submitted'),

  // Granted extension to end of current calendar month
  extensionDeadline: timestamp("extension_deadline"),

  decidedBy: varchar("decided_by"),
  decidedAt: timestamp("decided_at"),
  decisionNotes: text("decision_notes"),

  submittedAt: timestamp("submitted_at").defaultNow(),

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("idx_freeze_appeals_entity").on(table.entityType, table.entityId),
  index("idx_freeze_appeals_freeze").on(table.freezeId),
  index("idx_freeze_appeals_status").on(table.status),
]);

export const orgFinanceSettings = pgTable("org_finance_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique(),
  accountingMode: varchar("accounting_mode").default("native"),
  quickbooksSyncEnabled: boolean("quickbooks_sync_enabled").default(false),
  payrollProvider: varchar("payroll_provider").default("internal"),
  payrollProviderExternalId: varchar("payroll_provider_external_id"),
  stripeConnectAccountId: varchar("stripe_connect_account_id"),
  defaultPaymentTermsDays: integer("default_payment_terms_days").default(30),
  autoGenerateInvoices: boolean("auto_generate_invoices").default(true),
  autoSendInvoices: boolean("auto_send_invoices").default(false),
  invoicePrefix: varchar("invoice_prefix").default("INV"),
  invoiceFooterNotes: text("invoice_footer_notes"),
  differentialRatesConfig: jsonb("differential_rates_config").$type<{
    nightShiftEnabled: boolean;
    nightShiftStartHour: number;
    nightShiftEndHour: number;
    nightShiftMultiplier: number;
    weekendEnabled: boolean;
    weekendMultiplier: number;
    hazardEnabled: boolean;
    hazardMultiplier: number;
  }>(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by"),

  // Plaid — org funding bank account for ACH payroll transfers
  plaidAccessTokenEncrypted: text("plaid_access_token_encrypted"),
  plaidItemId: varchar("plaid_item_id", { length: 255 }),
  plaidAccountId: varchar("plaid_account_id", { length: 255 }),
  plaidAccountLast4: varchar("plaid_account_last4", { length: 10 }),
  plaidAccountName: varchar("plaid_account_name", { length: 255 }),
  plaidInstitutionName: varchar("plaid_institution_name", { length: 255 }),
  plaidBankConnectedAt: timestamp("plaid_bank_connected_at"),
  plaidBankConnectedBy: varchar("plaid_bank_connected_by", { length: 255 }),

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("org_finance_settings_workspace_idx").on(table.workspaceId),
]);

export const creditBalances = pgTable("credit_balances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique(),
  subscriptionCredits: integer("subscription_credits").notNull().default(0),
  carryoverCredits: integer("carryover_credits").notNull().default(0),
  purchasedCredits: integer("purchased_credits").notNull().default(0),
  lastResetAt: timestamp("last_reset_at"),
  nextResetAt: timestamp("next_reset_at"),
  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at").default(sql`now()`),
}, (table) => [
  index("credit_balances_workspace_idx").on(table.workspaceId),
]);

export const financialProcessingFees = pgTable("financial_processing_fees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  motherOrgWorkspaceId: varchar("mother_org_workspace_id"),
  feeType: varchar("fee_type", { length: 50 }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  referenceId: varchar("reference_id"),
  referenceType: varchar("reference_type", { length: 50 }),
  billingCycle: varchar("billing_cycle", { length: 7 }).notNull(),
  employeeCount: integer("employee_count"),
  perUnitRateCents: integer("per_unit_rate_cents"),
  billedOnPlatformInvoiceId: varchar("billed_on_platform_invoice_id"),
  description: text("description"),
}, (table) => [
  index("fin_proc_fees_workspace_idx").on(table.workspaceId),
  index("fin_proc_fees_mother_idx").on(table.motherOrgWorkspaceId),
  index("fin_proc_fees_billing_cycle_idx").on(table.billingCycle),
  index("fin_proc_fees_type_idx").on(table.feeType),
  index("fin_proc_fees_ref_idx").on(table.referenceId, table.feeType, table.billingCycle),
]);

export const platformInvoices = pgTable("platform_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  billingCycle: varchar("billing_cycle", { length: 7 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default('draft'),
  subscriptionAmountCents: integer("subscription_amount_cents").notNull().default(0),
  employeeOverageAmountCents: integer("employee_overage_amount_cents").notNull().default(0),
  employeeOverageCount: integer("employee_overage_count").notNull().default(0),
  invoiceProcessingTotalCents: integer("invoice_processing_total_cents").notNull().default(0),
  invoiceProcessingCount: integer("invoice_processing_count").notNull().default(0),
  payrollProcessingTotalCents: integer("payroll_processing_total_cents").notNull().default(0),
  payrollProcessingRuns: integer("payroll_processing_runs").notNull().default(0),
  payrollProcessingEmployeeTotal: integer("payroll_processing_employee_total").notNull().default(0),
  qbSyncTotalCents: integer("qb_sync_total_cents").notNull().default(0),
  qbSyncCount: integer("qb_sync_count").notNull().default(0),
  creditPackPurchasesCents: integer("credit_pack_purchases_cents").notNull().default(0),
  addonModulesTotalCents: integer("addon_modules_total_cents").notNull().default(0),
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  paidAt: timestamp("paid_at"),
  sentAt: timestamp("sent_at"),
  autoPayEnabled: boolean("auto_pay_enabled").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("platform_invoices_workspace_idx").on(table.workspaceId),
  index("platform_invoices_billing_cycle_idx").on(table.billingCycle),
  index("platform_invoices_status_idx").on(table.status),
]);

export const usageCaps = pgTable("usage_caps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  billingCycle: varchar("billing_cycle", { length: 7 }).notNull(),
  aiScheduledShiftsUsed: integer("ai_scheduled_shifts_used").notNull().default(0),
  aiScheduledShiftsCap: integer("ai_scheduled_shifts_cap").notNull().default(0),
  analyticsReportsUsed: integer("analytics_reports_used").notNull().default(0),
  analyticsReportsCap: integer("analytics_reports_cap").notNull().default(0),
  contractReviewsUsed: integer("contract_reviews_used").notNull().default(0),
  contractReviewsCap: integer("contract_reviews_cap").notNull().default(0),
  botInteractionsToday: integer("bot_interactions_today").notNull().default(0),
  botInteractionsDailyCap: integer("bot_interactions_daily_cap").notNull().default(0),
  botInteractionsLastReset: timestamp("bot_interactions_last_reset").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("usage_caps_workspace_cycle_idx").on(table.workspaceId, table.billingCycle),
]);

export const platformCreditPool = pgTable("platform_credit_pool", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  amount: integer("amount").notNull(),
  poolType: varchar("pool_type", { length: 50 }).notNull(),
  sourceWorkspaceId: varchar("source_workspace_id"),
  description: text("description"),
}, (table) => [
  index("platform_credit_pool_type_idx").on(table.poolType),
  index("platform_credit_pool_source_idx").on(table.sourceWorkspaceId),
]);

// ─── Recovered unmapped tables ─────────────────────────────────────────────

export const pointsTransactions = pgTable("points_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  
  // Transaction details
  points: integer("points").notNull(), // Positive for earning, negative for spending
  transactionType: varchar("transaction_type").notNull(), // 'achievement', 'bonus', 'reward_redemption', 'manual'
  
  // Reference
  referenceId: varchar("reference_id"), // Achievement ID, time entry ID, etc.
  referenceType: varchar("reference_type"), // 'achievement', 'time_entry', 'manual'
  
  description: text("description"),
  awardedBy: varchar("awarded_by"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("points_transactions_workspace_idx").on(table.workspaceId),
  index("points_transactions_employee_idx").on(table.employeeId),
  index("points_transactions_type_idx").on(table.transactionType),
  index("points_transactions_created_idx").on(table.createdAt),
]);

// ── invoice_reminders ────────────────────────────────────────────────────
export const invoiceReminders = pgTable("invoice_reminders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  invoiceId: varchar("invoice_id").notNull(),
  reminderType: varchar("reminder_type").notNull(),
  daysOverdue: integer("days_overdue").notNull(),
  sentAt: timestamp("sent_at"),
  emailTo: varchar("email_to").notNull(),
  emailSubject: text("email_subject"),
  emailBody: text("email_body"),
  status: varchar("status").default('pending'),
  failureReason: text("failure_reason"),
  needsHumanIntervention: boolean("needs_human_intervention").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertInvoiceReminderSchema = createInsertSchema(invoiceReminders).omit({ id: true, createdAt: true });
export type InsertInvoiceReminder = z.infer<typeof insertInvoiceReminderSchema>;
export type InvoiceReminder = typeof invoiceReminders.$inferSelect;

// ── invoice_payments ─────────────────────────────────────────────────────
export const invoicePayments = pgTable("invoice_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  invoiceId: varchar("invoice_id").notNull(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id").unique(),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeChargeId: varchar("stripe_charge_id"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency").default('usd'),
  status: varchar("status").default('pending'),
  payerEmail: varchar("payer_email"),
  payerName: varchar("payer_name"),
  paymentMethod: varchar("payment_method"),
  last4: varchar("last4"),
  receiptUrl: varchar("receipt_url"),
  refundedAmount: decimal("refunded_amount", { precision: 10, scale: 2 }).default("0.00"),
  refundReason: text("refund_reason"),
  refundedAt: timestamp("refunded_at"),
  failureCode: varchar("failure_code"),
  failureMessage: text("failure_message"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertInvoicePaymentSchema = createInsertSchema(invoicePayments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInvoicePayment = z.infer<typeof insertInvoicePaymentSchema>;
export type InvoicePayment = typeof invoicePayments.$inferSelect;

// ── invoice_adjustments ──────────────────────────────────────────────────
export const invoiceAdjustments = pgTable("invoice_adjustments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  adjustmentType: varchar("adjustment_type").notNull(),
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason"),
  supportTicketId: varchar("support_ticket_id"),
  createdBy: varchar("created_by").notNull(),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  status: varchar("status").notNull().default('pending'),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertInvoiceAdjustmentSchema = createInsertSchema(invoiceAdjustments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInvoiceAdjustment = z.infer<typeof insertInvoiceAdjustmentSchema>;
export type InvoiceAdjustment = typeof invoiceAdjustments.$inferSelect;

// clientBillingSettings - Per-client billing configuration (restored Mar 2026)
// FK constraints enforced at DB level; omitted here to avoid circular domain imports
export const clientBillingSettings = pgTable("client_billing_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  clientId: varchar("client_id").notNull(),
  // Service contract window
  serviceStartDate: date("service_start_date"),
  serviceEndDate: date("service_end_date"),
  // Invoice generation frequency and anchoring
  billingCycle: varchar("billing_cycle", { length: 20 }).default("monthly"), // daily|weekly|biweekly|semimonthly|monthly
  billingDayOfWeek: integer("billing_day_of_week"), // 0=Sun … 6=Sat (for weekly/biweekly)
  billingDayOfMonth: integer("billing_day_of_month"), // 1–31 (for monthly/semimonthly first day)
  billingSecondDayOfMonth: integer("billing_second_day_of_month"), // 1–31 (semimonthly second day)
  // Payment terms
  paymentTerms: varchar("payment_terms", { length: 20 }).default("net_30"), // net_15|net_30|net_45|net_60|due_on_receipt
  defaultBillRate: decimal("default_bill_rate", { precision: 10, scale: 2 }),
  defaultPayRate: decimal("default_pay_rate", { precision: 10, scale: 2 }),
  overtimeBillMultiplier: decimal("overtime_bill_multiplier", { precision: 4, scale: 2 }).default("1.50"),
  overtimePayMultiplier: decimal("overtime_pay_multiplier", { precision: 4, scale: 2 }).default("1.50"),
  invoiceFormat: varchar("invoice_format", { length: 20 }).default("detailed"),
  groupLineItemsBy: varchar("group_line_items_by", { length: 30 }).default("employee"),
  includeTimeBreakdown: boolean("include_time_breakdown").default(true),
  includeEmployeeDetails: boolean("include_employee_details").default(true),
  autoSendInvoice: boolean("auto_send_invoice").default(false),
  invoiceRecipientEmails: text("invoice_recipient_emails").array(),
  ccEmails: text("cc_emails").array(),
  qbCustomerId: varchar("qb_customer_id", { length: 100 }),
  qbItemId: varchar("qb_item_id", { length: 100 }),
  qbClassId: varchar("qb_class_id", { length: 100 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("client_billing_settings_workspace_idx").on(table.workspaceId),
  index("client_billing_settings_client_idx").on(table.clientId),
]);
export const insertClientBillingSettingsSchema = createInsertSchema(clientBillingSettings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClientBillingSettings = z.infer<typeof insertClientBillingSettingsSchema>;
export type ClientBillingSettings = typeof clientBillingSettings.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// trinity_credit_failures
// Canonical log of every credit deduction that failed after an AI/automation
// action succeeded. Used for billing reconciliation and owner alerting.
// All credit deduction failures MUST write here — never silently drop.
// ─────────────────────────────────────────────────────────────────────────────
export const trinityCreditFailures = pgTable("trinity_credit_failures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id"),
  featureKey: varchar("feature_key").notNull(),
  featureName: varchar("feature_name"),
  amountAttempted: decimal("amount_attempted", { precision: 12, scale: 4 }).notNull(),
  description: text("description"),
  errorMessage: text("error_message").notNull(),
  source: varchar("source").notNull().default("unknown"),
  relatedEntityType: varchar("related_entity_type"),
  relatedEntityId: varchar("related_entity_id"),
  aiUsageEventId: varchar("ai_usage_event_id"),
  notifiedOwner: boolean("notified_owner").default(false),
  resolved: boolean("resolved").default(false),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_credit_failures_workspace").on(table.workspaceId),
  index("idx_credit_failures_created").on(table.createdAt),
]);
export type TrinityCreditFailure = typeof trinityCreditFailures.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// cron_run_log
// Tracks every autonomous cron job execution for debugging and auditing.
// ─────────────────────────────────────────────────────────────────────────────
export const cronRunLog = pgTable("cron_run_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobName: varchar("job_name").notNull(),
  workspaceId: varchar("workspace_id"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  status: varchar("status").notNull().default("running"), // running, completed, failed
  resultSummary: text("result_summary"),
  errorMessage: text("error_message"),
  recordsProcessed: integer("records_processed").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_cron_run_log_job_name").on(table.jobName),
  index("idx_cron_run_log_started_at").on(table.startedAt),
]);
export type CronRunLog = typeof cronRunLog.$inferSelect;
export const insertCronRunLogSchema = createInsertSchema(cronRunLog).omit({ id: true, createdAt: true });
export type InsertCronRunLog = z.infer<typeof insertCronRunLogSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// state_tax_overrides
// Per-workspace state tax rate overrides — supersede platform defaults.
// ─────────────────────────────────────────────────────────────────────────────
export const stateTaxOverrides = pgTable("state_tax_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  stateCode: varchar("state_code", { length: 2 }).notNull(),
  taxRate: decimal("tax_rate", { precision: 5, scale: 4 }).notNull(),
  effectiveDate: date("effective_date").notNull(),
  expiryDate: date("expiry_date"),
  notes: text("notes"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_state_tax_workspace").on(table.workspaceId),
]);
export type StateTaxOverride = typeof stateTaxOverrides.$inferSelect;
export const insertStateTaxOverrideSchema = createInsertSchema(stateTaxOverrides).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStateTaxOverride = z.infer<typeof insertStateTaxOverrideSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// workspace_usage_tracking
// Fair-use AI interaction tracking per workspace.
// Replaces the credit billing system — tracks monthly interactions against
// the tier's hard cap. Overage billed as a line item, never hard-blocks ops.
// Created: pricing overhaul 2026-03
// ─────────────────────────────────────────────────────────────────────────────
export const workspaceUsageTracking = pgTable("workspace_usage_tracking", {
  workspaceId:                    varchar("workspace_id").primaryKey(),
  planTier:                       varchar("plan_tier").notNull().default("trial"),
  interactionsIncludedMonthly:    integer("interactions_included_monthly").notNull().default(500),
  interactionsUsedCurrentPeriod:  integer("interactions_used_current_period").notNull().default(0),
  interactionsRemaining:          integer("interactions_remaining").notNull().default(500),
  hardCapLimit:                   integer("hard_cap_limit").notNull().default(1000),
  overageInteractions:            integer("overage_interactions").notNull().default(0),
  overageRatePerInteraction:      decimal("overage_rate_per_interaction", { precision: 10, scale: 4 }).notNull().default("0.1500"),
  billingPeriodStart:             timestamp("billing_period_start", { withTimezone: true }),
  billingPeriodEnd:               timestamp("billing_period_end", { withTimezone: true }),
  capNotificationSentAt:          timestamp("cap_notification_sent_at", { withTimezone: true }),
  lastUpdated:                    timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_workspace_usage_tracking_tier").on(table.planTier),
]);

export type WorkspaceUsageTracking = typeof workspaceUsageTracking.$inferSelect;
export const insertWorkspaceUsageTrackingSchema = createInsertSchema(workspaceUsageTracking).omit({ lastUpdated: true });
export type InsertWorkspaceUsageTracking = z.infer<typeof insertWorkspaceUsageTrackingSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN USAGE LOG — append-only per-action token tracking
// Every Trinity action, email classification, voice interaction, and model
// API call writes one record here. Never updated — only inserted.
// ─────────────────────────────────────────────────────────────────────────────
export const tokenUsageLog = pgTable("token_usage_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  sessionId: varchar("session_id"),
  userId: varchar("user_id"),
  modelUsed: varchar("model_used").notNull(), // gemini | openai | claude
  tokensInput: integer("tokens_input").notNull().default(0),
  tokensOutput: integer("tokens_output").notNull().default(0),
  tokensTotal: integer("tokens_total").notNull().default(0),
  actionType: varchar("action_type").notNull(), // trinity_action | email_classification | voice | ai_assist
  featureName: varchar("feature_name"), // e.g. schedule.assign, invoice.generate
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_token_usage_log_workspace_ts").on(table.workspaceId, table.timestamp),
  index("idx_token_usage_log_model").on(table.modelUsed),
  index("idx_token_usage_log_action").on(table.actionType),
]);

export type TokenUsageLog = typeof tokenUsageLog.$inferSelect;
export const insertTokenUsageLogSchema = createInsertSchema(tokenUsageLog).omit({ id: true, timestamp: true });
export type InsertTokenUsageLog = z.infer<typeof insertTokenUsageLogSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN USAGE MONTHLY — running monthly rollup per workspace
// Updated atomically on each token_usage_log write.
// Unique per (workspace_id, month_year). Used for overage billing.
// ─────────────────────────────────────────────────────────────────────────────
export const tokenUsageMonthly = pgTable("token_usage_monthly", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  monthYear: varchar("month_year").notNull(), // e.g. "2026-04"
  totalTokensUsed: integer("total_tokens_used").notNull().default(0),
  allowanceTokens: integer("allowance_tokens").notNull().default(0),
  overageTokens: integer("overage_tokens").notNull().default(0),
  overageAmountCents: integer("overage_amount_cents").notNull().default(0),
  overageInvoiceId: varchar("overage_invoice_id"), // nullable — set when DRAFT invoice created
  status: varchar("status").notNull().default("pending"), // pending | invoiced | paid
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_token_usage_monthly_ws_month").on(table.workspaceId, table.monthYear),
  index("idx_token_usage_monthly_workspace").on(table.workspaceId),
  index("idx_token_usage_monthly_status").on(table.status),
]);

export type TokenUsageMonthly = typeof tokenUsageMonthly.$inferSelect;
export const insertTokenUsageMonthlySchema = createInsertSchema(tokenUsageMonthly).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTokenUsageMonthly = z.infer<typeof insertTokenUsageMonthlySchema>;

export * from './extended';
