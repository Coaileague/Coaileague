// Multi-tenant SaaS Scheduling Portal Schema
// Reference: javascript_log_in_with_replit and javascript_database blueprints

import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import {
  index,
  uniqueIndex,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  decimal,
  doublePrecision,
  boolean,
  pgEnum,
  check,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// REPLIT AUTH REQUIRED TABLES (DO NOT MODIFY)
// ============================================================================

// Session storage table - Required for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table - Universal authentication (portable to any platform)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),

  // Password authentication
  passwordHash: varchar("password_hash"), // Bcrypt hash
  emailVerified: boolean("email_verified").default(false),
  verificationToken: varchar("verification_token"),
  verificationTokenExpiry: timestamp("verification_token_expiry"),

  // Password reset
  resetToken: varchar("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),

  // Profile
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  phone: varchar("phone"),

  // Work ID for action tracking (format: Firstname-##-###-##-####)
  workId: varchar("work_id"),

  // Multi-tenant
  currentWorkspaceId: varchar("current_workspace_id"),
  role: varchar("role"), // Workspace role (owner, admin, employee, etc.)

  // Security
  lastLoginAt: timestamp("last_login_at"),
  loginAttempts: integer("login_attempts").default(0),
  lockedUntil: timestamp("locked_until"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// User onboarding progress tracking
export const userOnboarding = pgTable("user_onboarding", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),

  // Progress tracking
  completedSteps: text("completed_steps").array().default(sql`ARRAY[]::text[]`), // Array of completed step IDs
  currentStep: varchar("current_step"), // Current active step ID
  totalSteps: integer("total_steps").default(20), // Total number of onboarding steps
  progressPercentage: integer("progress_percentage").default(0), // 0-100%

  // Status
  hasSkipped: boolean("has_skipped").default(false), // User clicked "Skip Tour"
  hasCompleted: boolean("has_completed").default(false), // 100% completion
  lastViewedAt: timestamp("last_viewed_at"), // Last time onboarding was opened

  // Module-specific progress (for 4 OS Families)
  communicationProgress: integer("communication_progress").default(0), // 0-100%
  operationsProgress: integer("operations_progress").default(0), // 0-100%
  growthProgress: integer("growth_progress").default(0), // 0-100%
  platformProgress: integer("platform_progress").default(0), // 0-100%

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserOnboardingSchema = createInsertSchema(userOnboarding).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserOnboarding = z.infer<typeof insertUserOnboardingSchema>;
export type UserOnboarding = typeof userOnboarding.$inferSelect;

// ============================================================================
// MULTI-TENANT CORE TABLES
// ============================================================================

// Business category enum - determines available forms and features
export const businessCategoryEnum = pgEnum('business_category', [
  'general', // Default - basic forms only
  'security', // Security guards, surveillance - DAR, incident reports
  'healthcare', // Healthcare providers - patient logs, incident reports, compliance forms
  'construction', // Construction companies - safety checklists, OJT forms, equipment logs
  'cleaning', // Cleaning services - inspection checklists, supply logs
  'hospitality', // Hotels, restaurants - service logs, maintenance reports
  'retail', // Retail stores - inventory logs, shift reports
  'transportation', // Logistics, delivery - vehicle logs, route reports
  'manufacturing', // Factories - production logs, quality control
  'education', // Schools, training centers - attendance, assessment forms
  'custom' // Fully custom forms configured by admin
]);

// Workspaces (Business accounts that subscribe to the platform)
export const workspaces = pgTable("workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Unique organization identifiers for support tracking
  organizationId: varchar("organization_id").unique(), // Format: wfosupport-#########
  organizationSerial: varchar("organization_serial").unique(), // Format: ORG-XXXX-XXXX (Enterprise license key for tier unlocking)

  // Business information
  companyName: varchar("company_name"),
  businessCategory: businessCategoryEnum("business_category").default("general"), // Industry type
  industryDescription: text("industry_description"), // Additional context
  taxId: varchar("tax_id"),
  address: text("address"),
  phone: varchar("phone"),
  website: varchar("website"),

  // Subscription & billing
  subscriptionTier: varchar("subscription_tier").default("free"), // 'free', 'starter', 'professional', 'enterprise'
  subscriptionStatus: varchar("subscription_status").default("active"), // 'active', 'suspended', 'cancelled'
  maxEmployees: integer("max_employees").default(5),
  maxClients: integer("max_clients").default(10),

  // Stripe Connect for payment processing
  stripeAccountId: varchar("stripe_account_id"), // Connected account ID
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),

  // Platform fee
  platformFeePercentage: decimal("platform_fee_percentage", { precision: 5, scale: 2 }).default("3.00"),

  // Account control & admin actions
  isSuspended: boolean("is_suspended").default(false), // General suspension
  suspendedReason: text("suspended_reason"), // Why suspended
  suspendedAt: timestamp("suspended_at"),
  suspendedBy: varchar("suspended_by"), // Admin user ID who suspended

  isFrozen: boolean("is_frozen").default(false), // Freeze for non-payment
  frozenReason: text("frozen_reason"),
  frozenAt: timestamp("frozen_at"),
  frozenBy: varchar("frozen_by"),

  isLocked: boolean("is_locked").default(false), // Emergency lock
  lockedReason: text("locked_reason"),
  lockedAt: timestamp("locked_at"),
  lockedBy: varchar("locked_by"),

  // AI Feature Trials & Activation (Subscriber Pays All Model)
  // ScheduleOS™ AI Auto-Scheduling
  scheduleosTrialStartedAt: timestamp("scheduleos_trial_started_at"), // 7-day free trial
  scheduleosActivatedAt: timestamp("scheduleos_activated_at"), // Payment confirmed, feature unlocked
  scheduleosActivatedBy: varchar("scheduleos_activated_by"), // User ID who activated (Owner/Manager only)
  scheduleosPaymentMethod: varchar("scheduleos_payment_method"), // 'stripe_subscription' | 'stripe_card'

  // Future AI Features (following same pattern)
  hireos_trial_started_at: timestamp("hireos_trial_started_at"),
  hireos_activated_at: timestamp("hireos_activated_at"),
  hireos_activated_by: varchar("hireos_activated_by"),

  // ============================================================================
  // MASTER KEYS - ROOT-ONLY ORGANIZATION MANAGEMENT
  // ============================================================================

  // Feature Toggles (ROOT can enable/disable individual OS modules)
  feature_scheduleos_enabled: boolean("feature_scheduleos_enabled").default(true),
  feature_timeos_enabled: boolean("feature_timeos_enabled").default(true),
  feature_payrollos_enabled: boolean("feature_payrollos_enabled").default(false), // In dev
  feature_billos_enabled: boolean("feature_billos_enabled").default(true),
  feature_hireos_enabled: boolean("feature_hireos_enabled").default(true),
  feature_reportos_enabled: boolean("feature_reportos_enabled").default(true),
  feature_analyticsos_enabled: boolean("feature_analyticsos_enabled").default(true),
  feature_supportos_enabled: boolean("feature_supportos_enabled").default(true),
  feature_communicationos_enabled: boolean("feature_communicationos_enabled").default(true),

  // Billing Overrides (ROOT can give free/discounted service)
  billing_override_type: varchar("billing_override_type"), // 'free', 'discount', 'custom', null = normal
  billing_override_discount_percent: integer("billing_override_discount_percent"), // 0-100
  billing_override_custom_price: decimal("billing_override_custom_price", { precision: 10, scale: 2 }), // Fixed monthly price
  billing_override_reason: text("billing_override_reason"), // Why override applied
  billing_override_applied_by: varchar("billing_override_applied_by"), // ROOT user ID
  billing_override_applied_at: timestamp("billing_override_applied_at"),
  billing_override_expires_at: timestamp("billing_override_expires_at"), // Auto-revert date

  // Manual Adjustments & Notes
  admin_notes: text("admin_notes"), // ROOT private notes about this org
  admin_flags: text("admin_flags").array().default(sql`ARRAY[]::text[]`), // Tags: 'vip', 'watchlist', 'partner', 'delinquent'
  last_admin_action: text("last_admin_action"), // Description of last ROOT action
  last_admin_action_by: varchar("last_admin_action_by"), // ROOT user ID
  last_admin_action_at: timestamp("last_admin_action_at"),

  // ============================================================================
  // ADVANCED BILLING & ACCOUNT STATE MANAGEMENT
  // ============================================================================
  
  // Account state (subscription enforcement)
  accountState: varchar("account_state").default('active'), // Maps to accountStateEnum but stored as varchar for flexibility
  accountSuspensionReason: text("account_suspension_reason"),
  accountSuspendedAt: timestamp("account_suspended_at"),
  supportTicketId: varchar("support_ticket_id"), // For support intervention tracking
  
  // Billing schedule
  nextInvoiceAt: timestamp("next_invoice_at"), // When next invoice will be generated
  lastInvoiceGeneratedAt: timestamp("last_invoice_generated_at"),
  billingCycleDay: integer("billing_cycle_day").default(1), // Day of week for weekly billing (0=Sunday, 1=Monday, etc.)
  
  // Billing preferences
  billingPreferences: jsonb("billing_preferences"), // { autoPayEnabled, paymentTerms, reminderDays, etc. }
  
  // Usage limits & overages
  monthlyEmployeeOverages: integer("monthly_employee_overages").default(0), // Employees above plan limit
  lastOverageCheckAt: timestamp("last_overage_check_at"),

  // ============================================================================
  // AUTOMATION SETTINGS - Organization-Level Schedule Configuration
  // ============================================================================
  
  // BillOS™ Invoicing Automation
  autoInvoicingEnabled: boolean("auto_invoicing_enabled").default(true), // Enable/disable auto-invoice generation
  invoiceSchedule: varchar("invoice_schedule").default('monthly'), // 'weekly', 'biweekly', 'semi-monthly', 'monthly', 'net30', 'custom'
  invoiceCustomDays: integer("invoice_custom_days"), // For 'custom' schedule (e.g., every 10 days)
  invoiceDayOfWeek: integer("invoice_day_of_week"), // 0-6 for weekly/biweekly (0=Sunday)
  invoiceDayOfMonth: integer("invoice_day_of_month").default(1), // 1-31 for monthly/semi-monthly
  
  // PayrollOS™ Payroll Automation
  autoPayrollEnabled: boolean("auto_payroll_enabled").default(true), // Enable/disable auto-payroll processing
  payrollSchedule: varchar("payroll_schedule").default('biweekly'), // 'weekly', 'biweekly', 'semi-monthly', 'monthly', 'custom'
  payrollCustomDays: integer("payroll_custom_days"), // For 'custom' schedule
  payrollDayOfWeek: integer("payroll_day_of_week").default(1), // 0-6 for weekly/biweekly (1=Monday)
  payrollDayOfMonth: integer("payroll_day_of_month").default(1), // 1-31 for monthly (process day)
  payrollCutoffDay: integer("payroll_cutoff_day").default(15), // 1-31 for semi-monthly (second pay date)
  
  // ScheduleOS™ Schedule Generation Automation
  autoSchedulingEnabled: boolean("auto_scheduling_enabled").default(true), // Enable/disable auto-schedule generation
  scheduleGenerationInterval: varchar("schedule_generation_interval").default('weekly'), // 'weekly', 'biweekly', 'monthly', 'custom'
  scheduleCustomDays: integer("schedule_custom_days"), // For 'custom' interval
  scheduleAdvanceNoticeDays: integer("schedule_advance_notice_days").default(7), // How many days in advance to generate (default 7)
  scheduleDayOfWeek: integer("schedule_day_of_week").default(0), // 0-6 for weekly/biweekly (0=Sunday)
  scheduleDayOfMonth: integer("schedule_day_of_month"), // 1-31 for monthly

  // Biweekly Anchor Dates - Fix month-boundary drift
  invoiceBiweeklyAnchor: timestamp("invoice_biweekly_anchor", { withTimezone: true }), // Last biweekly invoice anchor date
  scheduleBiweeklyAnchor: timestamp("schedule_biweekly_anchor", { withTimezone: true }), // Last biweekly schedule anchor date
  payrollBiweeklyAnchor: timestamp("payroll_biweekly_anchor", { withTimezone: true }), // Last biweekly payroll anchor date

  // Last Run Tracking - Enables custom intervals and prevents duplicate runs
  lastInvoiceRunAt: timestamp("last_invoice_run_at", { withTimezone: true }),
  lastScheduleRunAt: timestamp("last_schedule_run_at", { withTimezone: true }),
  lastPayrollRunAt: timestamp("last_payroll_run_at", { withTimezone: true }),

  // ============================================================================
  // OVERTIME & RATE CONFIGURATION
  // ============================================================================
  
  // Overtime Rules
  enableDailyOvertime: boolean("enable_daily_overtime").default(false), // Enable 8-hour daily OT threshold
  dailyOvertimeThreshold: decimal("daily_overtime_threshold", { precision: 5, scale: 2 }).default("8.00"), // Hours per day before OT
  weeklyOvertimeThreshold: decimal("weekly_overtime_threshold", { precision: 5, scale: 2 }).default("40.00"), // Hours per week before OT (FLSA standard)
  
  // Default Rates (fallback when employee/client rates not configured)
  defaultBillableRate: decimal("default_billable_rate", { precision: 10, scale: 2 }), // Default billing rate for client invoices
  defaultHourlyRate: decimal("default_hourly_rate", { precision: 10, scale: 2 }), // Default pay rate for employees

  // ============================================================================
  // HOLIDAY CALENDAR & RATE MULTIPLIERS
  // ============================================================================

  // Timezone for local date calculations (IANA format, e.g., "America/New_York")
  // Used for holiday detection and shift segmentation at midnight boundaries
  timezone: varchar("timezone").default("America/New_York"),

  // Holiday Calendar (array of ISO dates with optional metadata)
  // Format: [{"date": "2025-12-25", "name": "Christmas", "billMultiplier": 2.5, "payMultiplier": 2.0}]
  holidayCalendar: jsonb("holiday_calendar").default('[]'),

  // Overtime Multipliers (default 1.5x for billing and pay)
  overtimeBillableMultiplier: decimal("overtime_billable_multiplier", { precision: 5, scale: 2 }).default("1.50"),
  overtimePayMultiplier: decimal("overtime_pay_multiplier", { precision: 5, scale: 2 }).default("1.50"),

  // Holiday Multipliers (default 2.0x for billing and pay)
  holidayBillableMultiplier: decimal("holiday_billable_multiplier", { precision: 5, scale: 2 }).default("2.00"),
  holidayPayMultiplier: decimal("holiday_pay_multiplier", { precision: 5, scale: 2 }).default("2.00"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type Workspace = typeof workspaces.$inferSelect;

// White-label theming for Enterprise workspaces
export const workspaceThemes = pgTable("workspace_themes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Theming tier - determines what can be customized
  tier: varchar("tier").default("standard"), // 'standard', 'professional', 'white_label'

  // Color customization (HSL format: "H S% L%")
  primaryColor: varchar("primary_color"), // e.g., "210 100% 58%" for blue
  secondaryColor: varchar("secondary_color"),
  successColor: varchar("success_color"),
  warningColor: varchar("warning_color"),
  errorColor: varchar("error_color"),

  // Logo & branding assets
  logoUrl: text("logo_url"), // Sidebar logo (max 180×40px)
  logoUrlInverted: text("logo_url_inverted"), // For light backgrounds
  faviconUrl: text("favicon_url"),
  loginBackgroundUrl: text("login_background_url"), // Hero background

  // Typography (must be web-safe or loaded font)
  fontFamily: varchar("font_family"), // e.g., "Inter, sans-serif"

  // Domain settings (Enterprise tier only)
  customDomain: varchar("custom_domain"), // e.g., "schedule.acmecorp.com"
  customEmailDomain: varchar("custom_email_domain"), // e.g., "notifications@acmecorp.com"

  // Branding removals (Enterprise tier only)
  removePoweredBy: boolean("remove_powered_by").default(false),
  removeClockworkLogo: boolean("remove_clockwork_logo").default(false),
  removeWatermarks: boolean("remove_watermarks").default(false),

  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWorkspaceThemeSchema = createInsertSchema(workspaceThemes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWorkspaceTheme = z.infer<typeof insertWorkspaceThemeSchema>;
export type WorkspaceTheme = typeof workspaceThemes.$inferSelect;

// ============================================================================
// ROLE HIERARCHY ENUMS
// ============================================================================

// Platform Support Staff Roles (AutoForce™ Internal Team - Platform Level)
// Root Admin → Deputy Admin → SysOp / Support Manager → Support Agent / Compliance Officer
// These roles manage the PLATFORM ITSELF, not individual client organizations
export const platformRoleEnum = pgEnum('platform_role', [
  'root_admin',         // Creator - Highest authority, full destructive access
  'deputy_admin',       // Ops Chief - Full ops control (no destructive), day-to-day platform management
  'sysop',             // System Administrator - Backend, deployment, diagnostics, service restarts
  'support_manager',    // Support Lead - Manages support team, ticket assignment, client escalations
  'support_agent',      // Support Staff - Handles client tickets, assists organizations
  'compliance_officer', // Compliance & AI Oversight - Audits, documentation, AI governance
  'none'               // Regular subscriber user (not platform staff)
]);

// Organization/Tenant Roles (Subscriber Companies - Tenant Level)
// Org Owner → Org Admin → Department Manager → Supervisor → Staff
// These roles manage THEIR OWN BUSINESS OPERATIONS within their tenant sandbox
export const workspaceRoleEnum = pgEnum('workspace_role', [
  'org_owner',          // Organization Owner - Top authority within tenant, full tenant control
  'org_admin',          // Organization Admin - Day-to-day operations, user management, AI approvals
  'department_manager', // Department Manager - Manages department tasks, staff, and reports
  'supervisor',         // Supervisor - Team-level oversight, approves tasks and schedules
  'staff',              // Staff/Employee - Frontline worker, executes tasks
  'auditor',            // Auditor - Read-only access to finances, HR, and compliance
  'contractor'          // Contractor - Limited access to specific tasks/projects only
]);

// ============================================================================
// ORGANIZATION LEADER CAPABILITIES (Self-Service Admin Features)
// ============================================================================

// Granular capabilities for organization leaders (Owner/Manager)
export const leaderCapabilityEnum = pgEnum('leader_capability', [
  'view_reports',           // Access analytics and reports
  'manage_employees_basic', // Reset passwords, unlock accounts, update contact info
  'manage_schedules',       // Approve swaps, adjust time entries (within limits)
  'escalate_support',       // Create support tickets to platform staff
  'view_audit_logs',        // View organization audit trail
  'manage_security_flags'   // Handle basic security issues
]);

// Role-based capability assignments (defines what each role can do)
export const roleCapabilities = pgTable("role_capabilities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  workspaceRole: workspaceRoleEnum("workspace_role").notNull(),
  capability: leaderCapabilityEnum("capability").notNull(),

  // Capability constraints
  constraints: jsonb("constraints"), // e.g., { maxTimeAdjustmentHours: 2, requiresApproval: true }

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("unique_workspace_role_capability").on(table.workspaceId, table.workspaceRole, table.capability),
]);

export const insertRoleCapabilitySchema = createInsertSchema(roleCapabilities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRoleCapability = z.infer<typeof insertRoleCapabilitySchema>;
export type RoleCapability = typeof roleCapabilities.$inferSelect;

// Leader action tracking (specialized audit log for self-service admin actions)
export const leaderActionEnum = pgEnum('leader_action', [
  'reset_password',
  'unlock_account',
  'update_employee_contact',
  'approve_schedule_swap',
  'adjust_time_entry',
  'flag_security_issue',
  'create_support_ticket',
  'export_report'
]);

export const leaderActions = pgTable("leader_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Leader information
  leaderId: varchar("leader_id").notNull().references(() => users.id),
  leaderEmail: varchar("leader_email").notNull(),
  leaderRole: workspaceRoleEnum("leader_role").notNull(),

  // Action details
  action: leaderActionEnum("action").notNull(),
  targetEntityType: varchar("target_entity_type").notNull(), // 'employee', 'shift', 'time_entry'
  targetEntityId: varchar("target_entity_id").notNull(),
  targetEmployeeName: varchar("target_employee_name"), // Denormalized for audit display

  // Change tracking (before/after snapshots)
  changesBefore: jsonb("changes_before"),
  changesAfter: jsonb("changes_after"),

  // Context
  reason: text("reason"), // Why was this action taken?
  metadata: jsonb("metadata"), // Additional context (IP, user agent, feature used)
  ipAddress: varchar("ip_address"),

  // Approval workflow (if required)
  requiresApproval: boolean("requires_approval").default(false),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),

  // Immutability
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_leader_workspace_created").on(table.workspaceId, table.createdAt),
  index("idx_leader_user_created").on(table.leaderId, table.createdAt),
  index("idx_leader_action_type").on(table.action, table.createdAt),
]);

export const insertLeaderActionSchema = createInsertSchema(leaderActions).omit({
  id: true,
  createdAt: true,
});

export type InsertLeaderAction = z.infer<typeof insertLeaderActionSchema>;
export type LeaderAction = typeof leaderActions.$inferSelect;

// Escalation tickets (Leaders → Platform Support)
export const escalationStatusEnum = pgEnum('escalation_status', [
  'open',
  'in_progress',
  'resolved',
  'closed'
]);

export const escalationCategoryEnum = pgEnum('escalation_category', [
  'billing',
  'compliance',
  'technical_issue',
  'security',
  'feature_request',
  'data_correction',
  'other'
]);

export const escalationTickets = pgTable("escalation_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketNumber: varchar("ticket_number").unique().notNull(), // ESC-XXXXXX format
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Requestor (organization leader)
  requestorId: varchar("requestor_id").notNull().references(() => users.id),
  requestorEmail: varchar("requestor_email").notNull(),
  requestorRole: workspaceRoleEnum("requestor_role").notNull(),

  // Ticket details
  category: escalationCategoryEnum("category").notNull(),
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  priority: varchar("priority").default("normal"), // low, normal, high, urgent

  // Related entities (optional)
  relatedEntityType: varchar("related_entity_type"), // 'employee', 'payroll_run', 'invoice'
  relatedEntityId: varchar("related_entity_id"),

  // Context data (for support staff)
  contextData: jsonb("context_data"), // Workspace info, affected records, error details
  attachments: jsonb("attachments"), // File references

  // Assignment & resolution
  assignedTo: varchar("assigned_to").references(() => users.id), // Platform support staff
  status: escalationStatusEnum("status").default("open"),
  resolution: text("resolution"),
  resolvedAt: timestamp("resolved_at"),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_escalation_workspace").on(table.workspaceId, table.status),
  index("idx_escalation_assigned").on(table.assignedTo, table.status),
]);

export const insertEscalationTicketSchema = createInsertSchema(escalationTickets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEscalationTicket = z.infer<typeof insertEscalationTicketSchema>;
export type EscalationTicket = typeof escalationTickets.$inferSelect;

// ============================================================================
// EMPLOYEE & CLIENT TABLES
// ============================================================================

// Employees (Staff within a workspace)
export const employees = pgTable("employees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }), // Optional link to user account

  // Employee information
  employeeNumber: varchar("employee_number"), // Unique employee ID (generated after onboarding)
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  email: varchar("email"),
  phone: varchar("phone"),

  // Contact information (editable by employee)
  address: text("address"),
  city: varchar("city"),
  state: varchar("state"),
  zipCode: varchar("zip_code"),

  // Emergency contact (editable by employee)
  emergencyContactName: varchar("emergency_contact_name"),
  emergencyContactPhone: varchar("emergency_contact_phone"),
  emergencyContactRelation: varchar("emergency_contact_relation"),

  // Employment details
  role: varchar("role"), // e.g., "Technician", "Consultant", "Driver" - job title
  workspaceRole: workspaceRoleEnum("workspace_role").default("staff"), // Permission level (formerly 'employee')
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  color: varchar("color").default("#3b82f6"), // For calendar display

  // Onboarding status
  onboardingStatus: varchar("onboarding_status").default("not_started"), // not_started, in_progress, completed

  // Availability
  isActive: boolean("is_active").default(true),
  availabilityNotes: text("availability_notes"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmployeeSchema = createInsertSchema(employees).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

// Employee Benefits (Insurance, 401k, PTO, etc.)
export const benefitTypeEnum = pgEnum('benefit_type', [
  'health_insurance',
  'dental_insurance', 
  'vision_insurance',
  'life_insurance',
  '401k',
  'pto_vacation',
  'sick_leave',
  'bonus',
  'equity',
  'other'
]);

export const benefitStatusEnum = pgEnum('benefit_status', ['pending', 'active', 'expired', 'cancelled']);

export const employeeBenefits = pgTable("employee_benefits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),

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

export const insertEmployeeBenefitSchema = createInsertSchema(employeeBenefits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeBenefit = z.infer<typeof insertEmployeeBenefitSchema>;
export type EmployeeBenefit = typeof employeeBenefits.$inferSelect;

// Performance Reviews (HR Management)
export const reviewStatusEnum = pgEnum('review_status', ['draft', 'in_progress', 'completed', 'cancelled']);
export const reviewTypeEnum = pgEnum('review_type', ['annual', 'quarterly', 'probation', '90_day', 'promotion', 'pip']);

export const performanceReviews = pgTable("performance_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  reviewerId: varchar("reviewer_id").references(() => employees.id, { onDelete: 'cascade' }),

  // Review details
  reviewType: reviewTypeEnum("review_type").notNull(),
  reviewPeriodStart: timestamp("review_period_start"),
  reviewPeriodEnd: timestamp("review_period_end"),

  // Ratings (1-5 scale)
  overallRating: integer("overall_rating"), // 1-5
  technicalSkillsRating: integer("technical_skills_rating"),
  communicationRating: integer("communication_rating"),
  teamworkRating: integer("teamwork_rating"),
  leadershipRating: integer("leadership_rating"),
  attendanceRating: integer("attendance_rating"),

  // Feedback
  strengths: text("strengths"),
  areasForImprovement: text("areas_for_improvement"),
  goals: text("goals").array(), // Array of goal strings
  reviewerComments: text("reviewer_comments"),
  employeeComments: text("employee_comments"),

  // Status & completion
  status: reviewStatusEnum("status").default("draft"),
  completedAt: timestamp("completed_at"),

  // Salary/promotion decisions
  salaryAdjustment: decimal("salary_adjustment", { precision: 10, scale: 2 }),
  promotionRecommended: boolean("promotion_recommended").default(false),

  // ========================================================================
  // TALENTOS™ EXTENDED FIELDS - Performance-to-Pay Loop & Analytics
  // ========================================================================

  // Auto-calculated performance metrics (from Unified Data Nexus)
  shiftsCompletedOnTime: integer("shifts_completed_on_time"),
  totalShiftsAssigned: integer("total_shifts_assigned"),
  attendanceRate: decimal("attendance_rate", { precision: 5, scale: 2 }),
  averageHoursWorkedPerWeek: decimal("average_hours_worked_per_week", { precision: 5, scale: 2 }),
  overtimeHours: decimal("overtime_hours", { precision: 10, scale: 2 }),

  // Report quality metrics (ReportOS™ integration)
  reportsSubmitted: integer("reports_submitted"),
  reportsApproved: integer("reports_approved"),
  reportsRejected: integer("reports_rejected"),
  reportQualityScore: decimal("report_quality_score", { precision: 5, scale: 2 }),

  // Compliance & safety
  complianceViolations: integer("compliance_violations"),
  safetyIncidents: integer("safety_incidents"),
  trainingCompletionRate: decimal("training_completion_rate", { precision: 5, scale: 2 }),

  // Additional subjective ratings (TalentOS™)
  qualityOfWorkRating: integer("quality_of_work_rating"), // 1-5
  initiativeRating: integer("initiative_rating"), // 1-5

  // Overall composite score (auto-calculated from weighted metrics)
  compositeScore: decimal("composite_score", { precision: 5, scale: 2 }),
  performanceTier: varchar("performance_tier"), // 'exceptional', 'exceeds', 'meets', 'needs_improvement', 'unsatisfactory'

  // Auto-generated pay increase recommendation
  currentHourlyRate: decimal("current_hourly_rate", { precision: 10, scale: 2 }),
  suggestedPayIncrease: decimal("suggested_pay_increase", { precision: 10, scale: 2 }),
  suggestedPayIncreasePercentage: decimal("suggested_pay_increase_percentage", { precision: 5, scale: 2 }),
  payIncreaseFormula: text("pay_increase_formula"),
  payIncreaseJustification: text("pay_increase_justification"),

  // Manager override
  managerApprovedIncrease: decimal("manager_approved_increase", { precision: 10, scale: 2 }),
  managerOverrideReason: text("manager_override_reason"),
  employeeAcknowledgedAt: timestamp("employee_acknowledged_at"),

  // Goals & development (Career Pathing)
  goalsMet: jsonb("goals_met").$type<string[]>(),
  goalsNotMet: jsonb("goals_not_met").$type<string[]>(),
  nextQuarterGoals: jsonb("next_quarter_goals").$type<string[]>(),
  developmentNeeds: jsonb("development_needs").$type<string[]>(),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPerformanceReviewSchema = createInsertSchema(performanceReviews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPerformanceReview = z.infer<typeof insertPerformanceReviewSchema>;
export type PerformanceReview = typeof performanceReviews.$inferSelect;

// PTO Requests (Paid Time Off / Vacation Management)
export const ptoStatusEnum = pgEnum('pto_status', ['pending', 'approved', 'denied', 'cancelled']);
export const ptoTypeEnum = pgEnum('pto_type', ['vacation', 'sick', 'personal', 'bereavement', 'unpaid']);

export const ptoRequests = pgTable("pto_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  approverId: varchar("approver_id").references(() => employees.id, { onDelete: 'set null' }),

  // Request details
  ptoType: ptoTypeEnum("pto_type").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  totalHours: decimal("total_hours", { precision: 10, scale: 2 }).notNull(),

  // Request & approval
  requestNotes: text("request_notes"),
  status: ptoStatusEnum("status").default("pending"),
  approvedAt: timestamp("approved_at"),
  denialReason: text("denial_reason"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPtoRequestSchema = createInsertSchema(ptoRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPtoRequest = z.infer<typeof insertPtoRequestSchema>;
export type PtoRequest = typeof ptoRequests.$inferSelect;

// Employee Terminations (Offboarding / Exit Management)
export const terminationTypeEnum = pgEnum('termination_type', ['voluntary', 'involuntary', 'retirement', 'layoff', 'end_of_contract']);
export const terminationStatusEnum = pgEnum('termination_status', ['pending', 'in_progress', 'completed']);

export const employeeTerminations = pgTable("employee_terminations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  terminatedBy: varchar("terminated_by").notNull().references(() => employees.id, { onDelete: 'cascade' }),

  // Termination details
  terminationType: terminationTypeEnum("termination_type").notNull(),
  terminationDate: timestamp("termination_date").notNull(),
  lastWorkingDay: timestamp("last_working_day").notNull(),

  // Documentation
  reason: text("reason").notNull(),
  exitInterviewNotes: text("exit_interview_notes"),
  rehireEligible: boolean("rehire_eligible").default(false),

  // Offboarding checklist
  equipmentReturned: boolean("equipment_returned").default(false),
  accessRevoked: boolean("access_revoked").default(false),
  finalPaymentProcessed: boolean("final_payment_processed").default(false),
  exitInterviewCompleted: boolean("exit_interview_completed").default(false),

  // Status
  status: terminationStatusEnum("status").default("pending"),
  completedAt: timestamp("completed_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmployeeTerminationSchema = createInsertSchema(employeeTerminations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeTermination = z.infer<typeof insertEmployeeTerminationSchema>;
export type EmployeeTermination = typeof employeeTerminations.$inferSelect;

// Clients (End customers of the workspace/business)
export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Client information
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  companyName: varchar("company_name"),
  email: varchar("email"),
  phone: varchar("phone"),
  address: text("address"),

  // Job site location (for geo-compliance)
  latitude: decimal("latitude", { precision: 10, scale: 7 }), // Job site GPS latitude
  longitude: decimal("longitude", { precision: 10, scale: 7 }), // Job site GPS longitude

  // Billing
  billingEmail: varchar("billing_email"),
  taxId: varchar("tax_id"),

  // Client-Specific Rate Multiplier Overrides (for enterprise contracts)
  // If set, these override workspace defaults for this client's billing
  clientOvertimeMultiplier: decimal("client_overtime_multiplier", { precision: 5, scale: 2 }), // Override workspace OT multiplier
  clientHolidayMultiplier: decimal("client_holiday_multiplier", { precision: 5, scale: 2 }), // Override workspace holiday multiplier

  // Status
  isActive: boolean("is_active").default(true),
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

// ============================================================================
// SCHEDULING TABLES
// ============================================================================

export const shiftStatusEnum = pgEnum('shift_status', ['draft', 'published', 'scheduled', 'in_progress', 'completed', 'cancelled']);

// Shifts (Scheduled time blocks)
export const shifts = pgTable("shifts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").references(() => employees.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: 'set null' }),

  // Shift details
  title: varchar("title"),
  description: text("description"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),

  // Smart Schedule™ tracking
  aiGenerated: boolean("ai_generated").default(false),
  requiresAcknowledgment: boolean("requires_acknowledgment").default(false),
  replacementForShiftId: varchar("replacement_for_shift_id"), // If this shift replaces a denied one
  autoReplacementAttempts: integer("auto_replacement_attempts").default(0), // Track replacement tries

  // AI confidence & risk scoring
  aiConfidenceScore: decimal("ai_confidence_score", { precision: 3, scale: 2 }), // 0.00-1.00
  riskScore: decimal("risk_score", { precision: 3, scale: 2 }), // 0.00-1.00 (higher = riskier)
  riskFactors: jsonb("risk_factors").$type<string[]>(), // ['high_tardiness', 'location_far', 'low_performance']

  // Acknowledgment & Denial tracking
  acknowledgedAt: timestamp("acknowledged_at"),
  deniedAt: timestamp("denied_at"),
  denialReason: text("denial_reason"),

  // Status and tracking
  status: shiftStatusEnum("status").default('draft'),

  // Billing
  billableToClient: boolean("billable_to_client").default(true),
  hourlyRateOverride: decimal("hourly_rate_override", { precision: 10, scale: 2 }), // Override employee's default rate

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertShiftSchema = createInsertSchema(shifts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  startTime: z.string().or(z.date()).transform(val => typeof val === 'string' ? new Date(val) : val),
  endTime: z.string().or(z.date()).transform(val => typeof val === 'string' ? new Date(val) : val),
});

export type InsertShift = z.infer<typeof insertShiftSchema>;
export type Shift = typeof shifts.$inferSelect;

// Shift Acknowledgments (Post Orders & Special Orders)
export const shiftAcknowledgmentTypeEnum = pgEnum('shift_acknowledgment_type', ['post_order', 'special_order', 'safety_notice', 'site_instruction']);

export const shiftAcknowledgments = pgTable("shift_acknowledgments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  shiftId: varchar("shift_id").notNull().references(() => shifts.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),

  // Acknowledgment details
  type: shiftAcknowledgmentTypeEnum("type").notNull(),
  title: varchar("title").notNull(),
  content: text("content").notNull(),
  priority: varchar("priority").default('normal'), // 'low', 'normal', 'high', 'urgent'

  // File attachments
  attachmentUrls: text("attachment_urls").array(),

  // Status tracking
  isRequired: boolean("is_required").default(true), // Must acknowledge before clock-in
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgedBy: varchar("acknowledged_by").references(() => employees.id),
  deniedAt: timestamp("denied_at"),
  denialReason: text("denial_reason"),

  // Metadata
  createdBy: varchar("created_by").notNull().references(() => employees.id),
  expiresAt: timestamp("expires_at"), // Optional expiration

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertShiftAcknowledgmentSchema = createInsertSchema(shiftAcknowledgments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertShiftAcknowledgment = z.infer<typeof insertShiftAcknowledgmentSchema>;
export type ShiftAcknowledgment = typeof shiftAcknowledgments.$inferSelect;

// Service Coverage Requests - AI-powered on-demand staffing
export const serviceCoverageRequests = pgTable("service_coverage_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: 'set null' }),
  
  // Request details
  requestNumber: varchar("request_number").notNull().unique(), // AUTO-GENERATED: REQ-2024-001
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  
  // Schedule requirements
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  numberOfEmployeesNeeded: integer("number_of_employees_needed").notNull().default(1),
  
  // Location data (for AI distance calculation)
  jobSiteAddress: text("job_site_address"),
  jobSiteCity: varchar("job_site_city"),
  jobSiteState: varchar("job_site_state"),
  jobSiteZipCode: varchar("job_site_zip_code"),
  jobSiteLatitude: decimal("job_site_latitude", { precision: 10, scale: 6 }),
  jobSiteLongitude: decimal("job_site_longitude", { precision: 10, scale: 6 }),
  
  // Skill/license requirements
  requiredSkills: text("required_skills").array(), // ['forklift', 'cdl', 'first_aid']
  requiredCertifications: text("required_certifications").array(),
  
  // AI Processing
  aiProcessed: boolean("ai_processed").default(false),
  aiProcessedAt: timestamp("ai_processed_at"),
  aiSuggestedEmployees: jsonb("ai_suggested_employees"), // Array of employee matches with scores
  aiConfidenceScore: decimal("ai_confidence_score", { precision: 3, scale: 2 }),
  
  // Status workflow
  status: varchar("status").default('pending'), // 'pending', 'processing', 'matched', 'assigned', 'cancelled'
  assignedEmployeeIds: text("assigned_employee_ids").array(), // Final assignments
  
  // Billing tracking (AI usage charge)
  aiUsageLogId: varchar("ai_usage_log_id").references(() => workspaceAiUsage.id),
  
  // Request metadata
  requestedBy: varchar("requested_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertServiceCoverageRequestSchema = createInsertSchema(serviceCoverageRequests).omit({
  id: true,
  requestNumber: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  startTime: z.string().or(z.date()).transform(val => typeof val === 'string' ? new Date(val) : val),
  endTime: z.string().or(z.date()).transform(val => typeof val === 'string' ? new Date(val) : val),
});

export type InsertServiceCoverageRequest = z.infer<typeof insertServiceCoverageRequestSchema>;
export type ServiceCoverageRequest = typeof serviceCoverageRequests.$inferSelect;

// Published Schedules - Track when schedules go live
export const publishedSchedules = pgTable("published_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Schedule period
  weekStartDate: timestamp("week_start_date").notNull(),
  weekEndDate: timestamp("week_end_date").notNull(),
  title: varchar("title"), // e.g., "Week of Nov 6-12, 2024"
  
  // Publishing details
  publishedBy: varchar("published_by").notNull().references(() => users.id),
  publishedAt: timestamp("published_at").notNull().defaultNow(),
  
  // Shift tracking
  totalShifts: integer("total_shifts").default(0),
  employeesAffected: integer("employees_affected").default(0),
  shiftIds: text("shift_ids").array(), // All shifts in this published schedule
  
  // Notification tracking
  notificationsSent: boolean("notifications_sent").default(false),
  notificationsSentAt: timestamp("notifications_sent_at"),
  
  // Version control
  version: integer("version").default(1),
  replacesScheduleId: varchar("replaces_schedule_id"), // If republishing
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPublishedScheduleSchema = createInsertSchema(publishedSchedules).omit({
  id: true,
  createdAt: true,
});

export type InsertPublishedSchedule = z.infer<typeof insertPublishedScheduleSchema>;
export type PublishedSchedule = typeof publishedSchedules.$inferSelect;

// Shift Templates (Reusable shift patterns)
export const shiftTemplates = pgTable("shift_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  name: varchar("name").notNull(),
  title: varchar("title"),
  description: text("description"),
  durationHours: decimal("duration_hours", { precision: 5, scale: 2 }).notNull(),
  billableToClient: boolean("billable_to_client").default(true),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertShiftTemplateSchema = createInsertSchema(shiftTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertShiftTemplate = z.infer<typeof insertShiftTemplateSchema>;
export type ShiftTemplate = typeof shiftTemplates.$inferSelect;

// Smart Schedule™ Usage Tracking (for billing)
export const smartScheduleUsage = pgTable("smart_schedule_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Usage details
  scheduleDate: timestamp("schedule_date").notNull(), // Week start date
  employeesScheduled: integer("employees_scheduled").notNull(),
  shiftsGenerated: integer("shifts_generated").notNull(),

  // Billing
  billingModel: varchar("billing_model").notNull(), // 'per_cycle', 'per_employee', 'tier_included'
  chargeAmount: decimal("charge_amount", { precision: 10, scale: 2 }), // Amount charged

  // AI metadata
  aiModel: varchar("ai_model").default('gpt-4'),
  processingTimeMs: integer("processing_time_ms"),

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSmartScheduleUsageSchema = createInsertSchema(smartScheduleUsage).omit({
  id: true,
  createdAt: true,
});

export type InsertSmartScheduleUsage = z.infer<typeof insertSmartScheduleUsageSchema>;
export type SmartScheduleUsage = typeof smartScheduleUsage.$inferSelect;

// Time Entries (Actual clock-in/clock-out for billing)
export const timeEntries = pgTable("time_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  shiftId: varchar("shift_id").references(() => shifts.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: 'set null' }),

  // Time tracking
  clockIn: timestamp("clock_in").notNull(),
  clockOut: timestamp("clock_out"),
  totalHours: decimal("total_hours", { precision: 10, scale: 2 }),

  // Billing
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),

  // GEO-COMPLIANCE: GPS & IP Tracking (Monopolistic Feature #3)
  clockInLatitude: decimal("clock_in_latitude", { precision: 10, scale: 7 }), // GPS lat at clock-in
  clockInLongitude: decimal("clock_in_longitude", { precision: 10, scale: 7 }), // GPS lng at clock-in
  clockInAccuracy: decimal("clock_in_accuracy", { precision: 8, scale: 2 }), // GPS accuracy in meters
  clockInIpAddress: varchar("clock_in_ip_address"), // IP address at clock-in

  clockOutLatitude: decimal("clock_out_latitude", { precision: 10, scale: 7 }), // GPS lat at clock-out
  clockOutLongitude: decimal("clock_out_longitude", { precision: 10, scale: 7 }), // GPS lng at clock-out
  clockOutAccuracy: decimal("clock_out_accuracy", { precision: 8, scale: 2 }), // GPS accuracy in meters
  clockOutIpAddress: varchar("clock_out_ip_address"), // IP address at clock-out

  // Job site location (for discrepancy detection)
  jobSiteLatitude: decimal("job_site_latitude", { precision: 10, scale: 7 }),
  jobSiteLongitude: decimal("job_site_longitude", { precision: 10, scale: 7 }),
  jobSiteAddress: text("job_site_address"),

  // Approval workflow (approval-focused states only)
  status: varchar("status").default('pending'), // 'pending', 'approved', 'rejected'
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: 'set null' }), // Who approved
  approvedAt: timestamp("approved_at"), // When approved
  rejectedBy: varchar("rejected_by").references(() => users.id, { onDelete: 'set null' }), // Who rejected
  rejectedAt: timestamp("rejected_at"), // When rejected
  rejectionReason: text("rejection_reason"), // Why rejected

  // BillOS™ & PayrollOS™ Integration (separate orthogonal tracking)
  invoiceId: varchar("invoice_id").references(() => invoices.id, { onDelete: 'set null' }),
  billedAt: timestamp("billed_at"), // When included in invoice
  payrollRunId: varchar("payroll_run_id"), // Future: link to payroll run table
  payrolledAt: timestamp("payrolled_at"), // When included in payroll
  billableToClient: boolean("billable_to_client").default(true),

  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTimeEntrySchema = createInsertSchema(timeEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  clockIn: z.string().or(z.date()),
  clockOut: z.string().or(z.date()).optional(),
});

export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;
export type TimeEntry = typeof timeEntries.$inferSelect;

// Time Entry Approval Audit Trail (Immutable history)
export const timeEntryApprovalAudit = pgTable("time_entry_approval_audit", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  timeEntryId: varchar("time_entry_id").notNull().references(() => timeEntries.id, { onDelete: 'cascade' }),
  
  // Audit details
  action: varchar("action").notNull(), // 'approved', 'rejected', 'reverted_to_pending'
  performedBy: varchar("performed_by").references(() => users.id, { onDelete: 'set null' }), // Nullable to preserve history
  performedAt: timestamp("performed_at").notNull().defaultNow(),
  
  // Previous and new state
  previousStatus: varchar("previous_status"),
  newStatus: varchar("new_status").notNull(),
  
  // Context
  reason: text("reason"), // Rejection reason or approval notes
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTimeEntryApprovalAuditSchema = createInsertSchema(timeEntryApprovalAudit).omit({
  id: true,
  createdAt: true,
});

export type InsertTimeEntryApprovalAudit = z.infer<typeof insertTimeEntryApprovalAuditSchema>;
export type TimeEntryApprovalAudit = typeof timeEntryApprovalAudit.$inferSelect;

// ============================================================================
// SHIFT ORDERS & POST ORDERS
// ============================================================================

export const shiftOrderPriorityEnum = pgEnum('shift_order_priority', ['normal', 'high', 'urgent']);

// Shift Orders (Post Orders) - Special instructions/tasks for shifts
export const shiftOrders = pgTable("shift_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  shiftId: varchar("shift_id").notNull().references(() => shifts.id, { onDelete: 'cascade' }),

  // Order details
  title: varchar("title").notNull(),
  description: text("description"),
  priority: shiftOrderPriorityEnum("priority").default('normal'),

  // Requirements
  requiresAcknowledgment: boolean("requires_acknowledgment").default(true),

  // Metadata
  createdBy: varchar("created_by").notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertShiftOrderSchema = createInsertSchema(shiftOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertShiftOrder = z.infer<typeof insertShiftOrderSchema>;
export type ShiftOrder = typeof shiftOrders.$inferSelect;

// Shift Order Acknowledgments - Track who acknowledged which orders
export const shiftOrderAcknowledgments = pgTable("shift_order_acknowledgments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  shiftOrderId: varchar("shift_order_id").notNull().references(() => shiftOrders.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),

  // Acknowledgment details
  acknowledgedAt: timestamp("acknowledged_at").defaultNow(),
  notes: text("notes"), // Optional employee notes
}, (table) => [
  // Prevent duplicate acknowledgments
  uniqueIndex("unique_acknowledgment").on(table.shiftOrderId, table.employeeId)
]);

export const insertShiftOrderAcknowledgmentSchema = createInsertSchema(shiftOrderAcknowledgments).omit({
  id: true,
  acknowledgedAt: true,
});

export type InsertShiftOrderAcknowledgment = z.infer<typeof insertShiftOrderAcknowledgmentSchema>;
export type ShiftOrderAcknowledgment = typeof shiftOrderAcknowledgments.$inferSelect;

// ============================================================================
// INVOICING & BILLING TABLES
// ============================================================================

export const invoiceStatusEnum = pgEnum('invoice_status', ['draft', 'sent', 'paid', 'overdue', 'cancelled']);

// Invoices
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: 'cascade' }),

  // Invoice details
  invoiceNumber: varchar("invoice_number").notNull(),
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
  paymentIntentId: varchar("payment_intent_id"), // Stripe Payment Intent ID

  // Additional details
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

// Invoice Line Items
export const invoiceLineItems = pgTable("invoice_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => invoices.id, { onDelete: 'cascade' }),

  // Line item details
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),

  // Links
  timeEntryId: varchar("time_entry_id").references(() => timeEntries.id, { onDelete: 'set null' }),
  shiftId: varchar("shift_id").references(() => shifts.id, { onDelete: 'set null' }),

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInvoiceLineItemSchema = createInsertSchema(invoiceLineItems).omit({
  id: true,
  createdAt: true,
});

export type InsertInvoiceLineItem = z.infer<typeof insertInvoiceLineItemSchema>;
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;

// ============================================================================
// BILLOS™ - FULL FINANCIAL AUTOMATION SYSTEM
// ============================================================================

// Client Billable Rates (for zero-touch invoice generation)
export const clientRates = pgTable("client_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: 'cascade' }),

  // Billing configuration
  billableRate: decimal("billable_rate", { precision: 10, scale: 2 }).notNull(), // Hourly rate for this client
  description: text("description"), // e.g., "Standard hourly rate", "Premium weekend rate"
  isActive: boolean("is_active").default(true),

  // Subscription billing (hybrid model)
  hasSubscription: boolean("has_subscription").default(false),
  subscriptionAmount: decimal("subscription_amount", { precision: 10, scale: 2 }),
  subscriptionFrequency: varchar("subscription_frequency"), // 'monthly', 'quarterly', 'annual'
  subscriptionStartDate: timestamp("subscription_start_date"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertClientRateSchema = createInsertSchema(clientRates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClientRate = z.infer<typeof insertClientRateSchema>;
export type ClientRate = typeof clientRates.$inferSelect;

// Payment Records (for invoice payment tracking)
export const paymentRecords = pgTable("payment_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  invoiceId: varchar("invoice_id").notNull().references(() => invoices.id, { onDelete: 'cascade' }),

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
});

export const insertPaymentRecordSchema = createInsertSchema(paymentRecords).omit({
  id: true,
  createdAt: true,
});

export type InsertPaymentRecord = z.infer<typeof insertPaymentRecordSchema>;
export type PaymentRecord = typeof paymentRecords.$inferSelect;

// Invoice Reminders (for delinquency automation)
export const reminderTypeEnum = pgEnum('reminder_type', ['7_day', '14_day', '30_day', 'custom']);

export const invoiceReminders = pgTable("invoice_reminders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  invoiceId: varchar("invoice_id").notNull().references(() => invoices.id, { onDelete: 'cascade' }),

  // Reminder details
  reminderType: reminderTypeEnum("reminder_type").notNull(),
  daysOverdue: integer("days_overdue").notNull(),

  // Email delivery
  sentAt: timestamp("sent_at"),
  emailTo: varchar("email_to").notNull(),
  emailSubject: text("email_subject"),
  emailBody: text("email_body"),

  // Status
  status: varchar("status").default('pending'), // 'pending', 'sent', 'failed'
  failureReason: text("failure_reason"),

  // Escalation flag
  needsHumanIntervention: boolean("needs_human_intervention").default(false), // True after 30 days

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInvoiceReminderSchema = createInsertSchema(invoiceReminders).omit({
  id: true,
  createdAt: true,
});

export type InsertInvoiceReminder = z.infer<typeof insertInvoiceReminderSchema>;
export type InvoiceReminder = typeof invoiceReminders.$inferSelect;

// Client Portal Access (for branded self-service portal)
export const clientPortalAccess = pgTable("client_portal_access", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: 'cascade' }),

  // Secure access
  accessToken: varchar("access_token").unique().notNull(), // Secure token for portal link
  email: varchar("email").notNull(), // Client contact email

  // Portal customization (white-label)
  portalName: varchar("portal_name"), // e.g., "ACME Corp Billing Portal"
  logoUrl: varchar("logo_url"),
  primaryColor: varchar("primary_color"),

  // Access control
  isActive: boolean("is_active").default(true),
  lastAccessedAt: timestamp("last_accessed_at"),
  expiresAt: timestamp("expires_at"), // Optional expiration

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertClientPortalAccessSchema = createInsertSchema(clientPortalAccess).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClientPortalAccess = z.infer<typeof insertClientPortalAccessSchema>;
export type ClientPortalAccess = typeof clientPortalAccess.$inferSelect;

// Employee Tax Forms (W-4, W-2, 1099 for ESS)
export const taxFormTypeEnum = pgEnum('tax_form_type', ['w4', 'w2', '1099']);

export const employeeTaxForms = pgTable("employee_tax_forms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),

  // Form details
  formType: taxFormTypeEnum("form_type").notNull(),
  taxYear: integer("tax_year").notNull(),

  // W-4 Information
  filingStatus: varchar("filing_status"), // 'single', 'married_filing_jointly', 'married_filing_separately', 'head_of_household'
  allowances: integer("allowances"),
  additionalWithholding: decimal("additional_withholding", { precision: 10, scale: 2 }),

  // W-2 / 1099 Information (generated annually)
  wages: decimal("wages", { precision: 10, scale: 2 }),
  federalTaxWithheld: decimal("federal_tax_withheld", { precision: 10, scale: 2 }),
  socialSecurityWages: decimal("social_security_wages", { precision: 10, scale: 2 }),
  socialSecurityTaxWithheld: decimal("social_security_tax_withheld", { precision: 10, scale: 2 }),
  medicareWages: decimal("medicare_wages", { precision: 10, scale: 2 }),
  medicareTaxWithheld: decimal("medicare_tax_withheld", { precision: 10, scale: 2 }),
  stateTaxWithheld: decimal("state_tax_withheld", { precision: 10, scale: 2 }),

  // Document storage
  pdfUrl: varchar("pdf_url"), // Cloud storage URL for generated PDF
  generatedAt: timestamp("generated_at"),

  // Status
  isActive: boolean("is_active").default(true), // Latest W-4 is active

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmployeeTaxFormSchema = createInsertSchema(employeeTaxForms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeTaxForm = z.infer<typeof insertEmployeeTaxFormSchema>;
export type EmployeeTaxForm = typeof employeeTaxForms.$inferSelect;

// Employee Bank Accounts (Direct Deposit for ESS)
export const employeeBankAccounts = pgTable("employee_bank_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),

  // Bank account details (encrypted in production)
  accountHolderName: varchar("account_holder_name").notNull(),
  bankName: varchar("bank_name").notNull(),
  routingNumber: varchar("routing_number").notNull(),
  accountNumber: varchar("account_number").notNull(), // Last 4 digits visible only
  accountType: varchar("account_type").notNull(), // 'checking', 'savings'

  // Stripe Connect bank account token (for secure processing)
  stripeBankAccountToken: varchar("stripe_bank_account_token"),

  // Status
  isActive: boolean("is_active").default(true), // Primary account for direct deposit
  isVerified: boolean("is_verified").default(false), // Micro-deposit verification
  verifiedAt: timestamp("verified_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmployeeBankAccountSchema = createInsertSchema(employeeBankAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeBankAccount = z.infer<typeof insertEmployeeBankAccountSchema>;
export type EmployeeBankAccount = typeof employeeBankAccounts.$inferSelect;

// Off-Cycle Payroll Runs (Bonus/Instant Pay)
export const offCyclePayrollRuns = pgTable("off_cycle_payroll_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),

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
  approvedBy: varchar("approved_by").references(() => employees.id, { onDelete: 'set null' }),
  approvedAt: timestamp("approved_at"),

  // Metadata
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertOffCyclePayrollRunSchema = createInsertSchema(offCyclePayrollRuns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOffCyclePayrollRun = z.infer<typeof insertOffCyclePayrollRunSchema>;
export type OffCyclePayrollRun = typeof offCyclePayrollRuns.$inferSelect;

// ============================================================================
// ROLE-BASED ACCESS CONTROL
// ============================================================================

// Manager Assignments (which managers oversee which employees)
// NOTE: Application layer MUST validate:
//   1. Both manager and employee belong to the same workspace
//   2. managerId has workspaceRole = 'manager' or 'owner'
export const managerAssignments = pgTable("manager_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  managerId: varchar("manager_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Ensure no duplicate manager-employee pairs
  uniqueManagerEmployee: uniqueIndex("unique_manager_employee").on(table.managerId, table.employeeId),
}));

export const insertManagerAssignmentSchema = createInsertSchema(managerAssignments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertManagerAssignment = z.infer<typeof insertManagerAssignmentSchema>;
export type ManagerAssignment = typeof managerAssignments.$inferSelect;

// ============================================================================
// RELATIONS
// ============================================================================

export const usersRelations = relations(users, ({ many }) => ({
  ownedWorkspaces: many(workspaces),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, {
    fields: [workspaces.ownerId],
    references: [users.id],
  }),
  employees: many(employees),
  clients: many(clients),
  shifts: many(shifts),
  invoices: many(invoices),
  timeEntries: many(timeEntries),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [employees.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [employees.userId],
    references: [users.id],
  }),
  shifts: many(shifts),
  timeEntries: many(timeEntries),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [clients.workspaceId],
    references: [workspaces.id],
  }),
  shifts: many(shifts),
  invoices: many(invoices),
  timeEntries: many(timeEntries),
}));

export const shiftsRelations = relations(shifts, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [shifts.workspaceId],
    references: [workspaces.id],
  }),
  employee: one(employees, {
    fields: [shifts.employeeId],
    references: [employees.id],
  }),
  client: one(clients, {
    fields: [shifts.clientId],
    references: [clients.id],
  }),
  timeEntries: many(timeEntries),
  shiftOrders: many(shiftOrders),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [timeEntries.workspaceId],
    references: [workspaces.id],
  }),
  shift: one(shifts, {
    fields: [timeEntries.shiftId],
    references: [shifts.id],
  }),
  employee: one(employees, {
    fields: [timeEntries.employeeId],
    references: [employees.id],
  }),
  client: one(clients, {
    fields: [timeEntries.clientId],
    references: [clients.id],
  }),
  approvalAudits: many(timeEntryApprovalAudit),
}));

export const timeEntryApprovalAuditRelations = relations(timeEntryApprovalAudit, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [timeEntryApprovalAudit.workspaceId],
    references: [workspaces.id],
  }),
  timeEntry: one(timeEntries, {
    fields: [timeEntryApprovalAudit.timeEntryId],
    references: [timeEntries.id],
  }),
  performedByUser: one(users, {
    fields: [timeEntryApprovalAudit.performedBy],
    references: [users.id],
  }),
}));

export const shiftOrdersRelations = relations(shiftOrders, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [shiftOrders.workspaceId],
    references: [workspaces.id],
  }),
  shift: one(shifts, {
    fields: [shiftOrders.shiftId],
    references: [shifts.id],
  }),
  createdByUser: one(users, {
    fields: [shiftOrders.createdBy],
    references: [users.id],
  }),
  acknowledgments: many(shiftOrderAcknowledgments),
}));

export const shiftOrderAcknowledgmentsRelations = relations(shiftOrderAcknowledgments, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [shiftOrderAcknowledgments.workspaceId],
    references: [workspaces.id],
  }),
  shiftOrder: one(shiftOrders, {
    fields: [shiftOrderAcknowledgments.shiftOrderId],
    references: [shiftOrders.id],
  }),
  employee: one(employees, {
    fields: [shiftOrderAcknowledgments.employeeId],
    references: [employees.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [invoices.workspaceId],
    references: [workspaces.id],
  }),
  client: one(clients, {
    fields: [invoices.clientId],
    references: [clients.id],
  }),
  lineItems: many(invoiceLineItems),
}));

export const invoiceLineItemsRelations = relations(invoiceLineItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceLineItems.invoiceId],
    references: [invoices.id],
  }),
  timeEntry: one(timeEntries, {
    fields: [invoiceLineItems.timeEntryId],
    references: [timeEntries.id],
  }),
  shift: one(shifts, {
    fields: [invoiceLineItems.shiftId],
    references: [shifts.id],
  }),
}));

// ============================================================================
// ENTERPRISE FEATURES - Job Posting & Hiring
// ============================================================================

export const jobPostingStatusEnum = pgEnum('job_posting_status', ['draft', 'active', 'closed', 'filled']);
export const applicationStatusEnum = pgEnum('application_status', ['pending', 'reviewed', 'interviewed', 'offered', 'hired', 'rejected']);

export const jobPostings = pgTable("job_postings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  title: varchar("title").notNull(),
  department: varchar("department"),
  location: varchar("location"),
  employmentType: varchar("employment_type"), // 'full-time', 'part-time', 'contract'
  description: text("description").notNull(),
  requirements: text("requirements"),

  salaryMin: decimal("salary_min", { precision: 10, scale: 2 }),
  salaryMax: decimal("salary_max", { precision: 10, scale: 2 }),

  status: jobPostingStatusEnum("status").default("draft"),
  postedBy: varchar("posted_by").references(() => users.id),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const insertJobPostingSchema = createInsertSchema(jobPostings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertJobPosting = z.infer<typeof insertJobPostingSchema>;
export type JobPosting = typeof jobPostings.$inferSelect;

export const jobApplications = pgTable("job_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobPostingId: varchar("job_posting_id").notNull().references(() => jobPostings.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  applicantName: varchar("applicant_name").notNull(),
  applicantEmail: varchar("applicant_email").notNull(),
  applicantPhone: varchar("applicant_phone"),
  resumeUrl: varchar("resume_url"),
  coverLetter: text("cover_letter"),

  status: applicationStatusEnum("status").default("pending"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertJobApplicationSchema = createInsertSchema(jobApplications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertJobApplication = z.infer<typeof insertJobApplicationSchema>;
export type JobApplication = typeof jobApplications.$inferSelect;

// ============================================================================
// ENTERPRISE FEATURES - Employee File Management
// ============================================================================

export const documentTypeEnum = pgEnum('document_type', ['certification', 'license', 'contract', 'policy', 'id', 'other']);

export const employeeFiles = pgTable("employee_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),

  fileName: varchar("file_name").notNull(),
  fileUrl: varchar("file_url").notNull(),
  fileSize: integer("file_size"), // bytes
  mimeType: varchar("mime_type"),

  documentType: documentTypeEnum("document_type").default("other"),
  title: varchar("title").notNull(),
  description: text("description"),

  expirationDate: timestamp("expiration_date"),
  isExpired: boolean("is_expired").default(false),

  uploadedBy: varchar("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmployeeFileSchema = createInsertSchema(employeeFiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeFile = z.infer<typeof insertEmployeeFileSchema>;
export type EmployeeFile = typeof employeeFiles.$inferSelect;

// ============================================================================
// ENTERPRISE FEATURES - Employee Onboarding System
// ============================================================================

export const onboardingStatusEnum = pgEnum('onboarding_status', ['invited', 'in_progress', 'pending_review', 'completed', 'rejected']);
export const taxClassificationEnum = pgEnum('tax_classification', ['w4_employee', 'w9_contractor']);
export const onboardingStepEnum = pgEnum('onboarding_step', [
  'personal_info', 'tax_selection', 'tax_forms', 'contract_signature', 
  'document_upload', 'work_availability', 'certifications', 'acknowledgements', 'completed'
]);

// Onboarding Invites
export const onboardingInvites = pgTable("onboarding_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").references(() => employees.id, { onDelete: 'cascade' }),

  email: varchar("email").notNull(),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),

  inviteToken: varchar("invite_token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),

  acceptedAt: timestamp("accepted_at"),
  isUsed: boolean("is_used").default(false),

  sentBy: varchar("sent_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOnboardingInviteSchema = createInsertSchema(onboardingInvites).omit({
  id: true,
  createdAt: true,
});

export type InsertOnboardingInvite = z.infer<typeof insertOnboardingInviteSchema>;
export type OnboardingInvite = typeof onboardingInvites.$inferSelect;

// Onboarding Applications
export const onboardingApplications = pgTable("onboarding_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").references(() => employees.id, { onDelete: 'set null' }),
  inviteId: varchar("invite_id").references(() => onboardingInvites.id),

  // Generated employee number
  employeeNumber: varchar("employee_number").unique(),

  // Personal Information
  firstName: varchar("first_name").notNull(),
  middleName: varchar("middle_name"),
  lastName: varchar("last_name").notNull(),
  dateOfBirth: timestamp("date_of_birth"),
  ssn: varchar("ssn"), // Encrypted in production

  // Contact
  email: varchar("email").notNull(),
  phone: varchar("phone"),
  address: text("address"),
  city: varchar("city"),
  state: varchar("state"),
  zipCode: varchar("zip_code"),

  // Emergency Contact
  emergencyContactName: varchar("emergency_contact_name"),
  emergencyContactPhone: varchar("emergency_contact_phone"),
  emergencyContactRelation: varchar("emergency_contact_relation"),

  // Tax Classification
  taxClassification: taxClassificationEnum("tax_classification"),

  // Payroll Information (W-4 employees only)
  bankName: varchar("bank_name"),
  routingNumber: varchar("routing_number"), // Encrypted in production
  accountNumber: varchar("account_number"), // Encrypted in production
  accountType: varchar("account_type"), // 'checking' or 'savings'

  // W-4 Tax Withholding
  filingStatus: varchar("filing_status"), // 'single', 'married_filing_jointly', 'married_filing_separately', 'head_of_household'
  multipleJobs: varchar("multiple_jobs"), // 'yes' or 'no'
  dependentsAmount: varchar("dependents_amount"), // Dollar amount for dependent credits
  otherIncome: varchar("other_income"), // Other income not from jobs
  deductions: varchar("deductions"), // Deductions beyond standard
  extraWithholding: varchar("extra_withholding"), // Extra amount to withhold per paycheck

  // Work Availability (for AI scheduling)
  availableMonday: boolean("available_monday").default(true),
  availableTuesday: boolean("available_tuesday").default(true),
  availableWednesday: boolean("available_wednesday").default(true),
  availableThursday: boolean("available_thursday").default(true),
  availableFriday: boolean("available_friday").default(true),
  availableSaturday: boolean("available_saturday").default(false),
  availableSunday: boolean("available_sunday").default(false),
  preferredShiftTime: varchar("preferred_shift_time"), // 'morning', 'afternoon', 'evening', 'night'
  maxHoursPerWeek: integer("max_hours_per_week"),
  availabilityNotes: text("availability_notes"),

  // Onboarding Status
  currentStep: onboardingStepEnum("current_step").default("personal_info"),
  status: onboardingStatusEnum("status").default("in_progress"),
  completedAt: timestamp("completed_at"),

  // Tracking
  ipAddress: varchar("ip_address"),
  userAgent: varchar("user_agent"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertOnboardingApplicationSchema = createInsertSchema(onboardingApplications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOnboardingApplication = z.infer<typeof insertOnboardingApplicationSchema>;
export type OnboardingApplication = typeof onboardingApplications.$inferSelect;

// Legal Documents & Signatures
export const documentSignatureStatusEnum = pgEnum('signature_status', ['pending', 'signed', 'declined']);
export const documentTypeSignatureEnum = pgEnum('document_type_signature', [
  'employee_contract', 'contractor_agreement', 'sop_acknowledgement', 
  'drug_free_policy', 'handbook', 'confidentiality', 'i9_form', 'w4_form', 'w9_form'
]);

export const documentSignatures = pgTable("document_signatures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  applicationId: varchar("application_id").references(() => onboardingApplications.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").references(() => employees.id),

  documentType: documentTypeSignatureEnum("document_type").notNull(),
  documentTitle: varchar("document_title").notNull(),
  documentContent: text("document_content"), // Full text for legal record
  documentUrl: varchar("document_url"), // PDF/file URL

  status: documentSignatureStatusEnum("status").default("pending"),

  // Signature Data (legal defensibility)
  signatureData: text("signature_data"), // Base64 signature image
  signedByName: varchar("signed_by_name"),
  signedAt: timestamp("signed_at"),
  ipAddress: varchar("ip_address"),
  userAgent: varchar("user_agent"),
  geoLocation: varchar("geo_location"), // Optional: lat,lon

  // Witness/Notary (if required)
  witnessName: varchar("witness_name"),
  witnessSignature: text("witness_signature"),
  witnessedAt: timestamp("witnessed_at"),

  // Audit Trail
  viewedAt: timestamp("viewed_at"),
  viewCount: integer("view_count").default(0),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDocumentSignatureSchema = createInsertSchema(documentSignatures).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDocumentSignature = z.infer<typeof insertDocumentSignatureSchema>;
export type DocumentSignature = typeof documentSignatures.$inferSelect;

// Certification & License Tracking
export const certificationStatusEnum = pgEnum('certification_status', ['pending', 'verified', 'expired', 'invalid']);

export const employeeCertifications = pgTable("employee_certifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  applicationId: varchar("application_id").references(() => onboardingApplications.id),

  certificationType: varchar("certification_type").notNull(), // 'driver_license', 'medical_cert', 'professional_license'
  certificationName: varchar("certification_name").notNull(),
  certificationNumber: varchar("certification_number"),
  issuingAuthority: varchar("issuing_authority"),

  issuedDate: timestamp("issued_date"),
  expirationDate: timestamp("expiration_date"),

  status: certificationStatusEnum("status").default("pending"),

  // Document proof
  documentUrl: varchar("document_url"),
  verifiedBy: varchar("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at"),

  // Required for job
  isRequired: boolean("is_required").default(false),

  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmployeeCertificationSchema = createInsertSchema(employeeCertifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeCertification = z.infer<typeof insertEmployeeCertificationSchema>;
export type EmployeeCertification = typeof employeeCertifications.$inferSelect;

// ============================================================================
// COMPLIANCEOS™ - I-9 WORK AUTHORIZATION & RE-VERIFICATION
// ============================================================================

export const i9StatusEnum = pgEnum('i9_status', ['pending', 'verified', 'reverification_required', 'expired', 'invalid']);

export const employeeI9Records = pgTable("employee_i9_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),

  // I-9 Form details
  status: i9StatusEnum("status").default("pending"),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: varchar("verified_by").references(() => users.id),

  // Work authorization
  workAuthorizationType: varchar("work_authorization_type"), // 'citizen', 'permanent_resident', 'work_visa', 'other'
  expirationDate: timestamp("expiration_date"), // For work visas/EADs
  
  // Re-verification tracking
  reverificationRequired: boolean("reverification_required").default(false),
  reverificationDate: timestamp("reverification_date"), // When re-verification is due
  reverificationCompleted: boolean("reverification_completed").default(false),
  reverificationCompletedAt: timestamp("reverification_completed_at"),

  // Document List A (Identity + Work Authorization)
  listADocument: varchar("list_a_document"), // 'us_passport', 'permanent_resident_card', 'ead_card'
  listADocumentNumber: varchar("list_a_document_number"),
  listAExpirationDate: timestamp("list_a_expiration_date"),
  listADocumentUrl: varchar("list_a_document_url"),

  // Document List B (Identity only)
  listBDocument: varchar("list_b_document"), // 'drivers_license', 'state_id', 'school_id'
  listBDocumentNumber: varchar("list_b_document_number"),
  listBExpirationDate: timestamp("list_b_expiration_date"),
  listBDocumentUrl: varchar("list_b_document_url"),

  // Document List C (Work Authorization only)
  listCDocument: varchar("list_c_document"), // 'social_security_card', 'birth_certificate'
  listCDocumentNumber: varchar("list_c_document_number"),
  listCExpirationDate: timestamp("list_c_expiration_date"),
  listCDocumentUrl: varchar("list_c_document_url"),

  // Alerts sent
  alertSent30Days: boolean("alert_sent_30_days").default(false),
  alertSent7Days: boolean("alert_sent_7_days").default(false),

  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  employeeIdx: index("i9_records_employee_idx").on(table.employeeId),
  expirationIdx: index("i9_records_expiration_idx").on(table.expirationDate),
  statusIdx: index("i9_records_status_idx").on(table.status),
}));

export const insertEmployeeI9RecordSchema = createInsertSchema(employeeI9Records).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeI9Record = z.infer<typeof insertEmployeeI9RecordSchema>;
export type EmployeeI9Record = typeof employeeI9Records.$inferSelect;

// ============================================================================
// POLICIOS™ - HANDBOOK & POLICY ACKNOWLEDGMENT
// ============================================================================

export const policyStatusEnum = pgEnum('policy_status', ['draft', 'published', 'archived']);

// Company Policies & Handbooks
export const companyPolicies = pgTable("company_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Policy details
  title: varchar("title").notNull(),
  description: text("description"),
  category: varchar("category"), // 'handbook', 'code_of_conduct', 'safety', 'pto', 'benefits', 'it_security', 'other'
  
  // Content
  contentMarkdown: text("content_markdown"), // Policy text in Markdown
  pdfUrl: varchar("pdf_url"), // Optional PDF version
  
  // Versioning
  version: varchar("version").notNull(), // '1.0', '1.1', '2.0'
  previousVersionId: varchar("previous_version_id").references((): any => companyPolicies.id),
  
  // Status
  status: policyStatusEnum("status").default("draft"),
  publishedAt: timestamp("published_at"),
  publishedBy: varchar("published_by").references(() => users.id),
  
  // Acknowledgment requirements
  requiresAcknowledgment: boolean("requires_acknowledgment").default(true),
  acknowledgmentDeadlineDays: integer("acknowledgment_deadline_days").default(30), // Days to acknowledge from publish date
  
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("policies_workspace_idx").on(table.workspaceId),
  statusIdx: index("policies_status_idx").on(table.status),
}));

// Policy Acknowledgments (Employee signatures)
export const policyAcknowledgments = pgTable("policy_acknowledgments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  policyId: varchar("policy_id").notNull().references(() => companyPolicies.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),

  // Acknowledgment
  acknowledgedAt: timestamp("acknowledged_at").defaultNow(),
  signatureUrl: varchar("signature_url"), // E-signature image
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  
  // Policy version at time of acknowledgment (for audit trail)
  policyVersion: varchar("policy_version").notNull(),
  policyTitle: varchar("policy_title").notNull(),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  policyEmployeeIdx: index("policy_acks_policy_employee_idx").on(table.policyId, table.employeeId),
  employeeIdx: index("policy_acks_employee_idx").on(table.employeeId),
}));

export const insertCompanyPolicySchema = createInsertSchema(companyPolicies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPolicyAcknowledgmentSchema = createInsertSchema(policyAcknowledgments).omit({
  id: true,
  createdAt: true,
});

export type InsertCompanyPolicy = z.infer<typeof insertCompanyPolicySchema>;
export type CompanyPolicy = typeof companyPolicies.$inferSelect;
export type InsertPolicyAcknowledgment = z.infer<typeof insertPolicyAcknowledgmentSchema>;
export type PolicyAcknowledgment = typeof policyAcknowledgments.$inferSelect;

// ============================================================================
// HIREOS™ - DIGITAL FILE CABINET & COMPLIANCE WORKFLOW (MONOPOLISTIC FEATURE)
// ============================================================================

// Onboarding Workflow Templates (No-Code Builder)
export const onboardingWorkflowTemplates = pgTable("onboarding_workflow_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Template metadata
  name: varchar("name").notNull(), // e.g., "Security Guard Onboarding", "Office Manager Onboarding"
  description: text("description"),
  industry: varchar("industry"), // 'security', 'construction', 'healthcare', 'office', 'general'
  roleType: varchar("role_type"), // 'employee', 'contractor', 'temporary'

  // Workflow steps configuration
  steps: jsonb("steps").notNull().$type<Array<{
    stepId: string;
    stepName: string;
    stepOrder: number;
    stepType: 'personal_info' | 'tax_forms' | 'documents' | 'certifications' | 'signatures' | 'custom_form';
    isRequired: boolean;
    requiredDocuments?: string[]; // ['government_id', 'ssn_card', 'i9', 'w4', 'direct_deposit']
    requiredCertifications?: string[]; // ['guard_card', 'cpr', 'first_aid']
    requiredSignatures?: string[]; // ['employee_handbook', 'confidentiality', 'code_of_conduct']
    approvalRequired?: boolean;
    approverRole?: 'owner' | 'manager' | 'hr'; 
    customFields?: Array<{
      fieldName: string;
      fieldType: 'text' | 'number' | 'date' | 'file' | 'signature';
      isRequired: boolean;
      options?: string[];
    }>;
  }>>(),

  // Compliance tracking
  complianceRequirements: jsonb("compliance_requirements").$type<{
    i9Required: boolean;
    i9VerificationDeadline: number; // Days from hire date
    backgroundCheckRequired: boolean;
    drugTestRequired: boolean;
    minimumDocuments: number;
    retentionPeriodYears: number; // Default: 7
  }>(),

  // Usage stats
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false), // Default for new employees
  usageCount: integer("usage_count").default(0),

  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertOnboardingWorkflowTemplateSchema = createInsertSchema(onboardingWorkflowTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOnboardingWorkflowTemplate = z.infer<typeof insertOnboardingWorkflowTemplateSchema>;
export type OnboardingWorkflowTemplate = typeof onboardingWorkflowTemplates.$inferSelect;

// Employee Documents (Permanent Digital File Cabinet)
export const employeeDocumentTypeEnum = pgEnum('employee_document_type', [
  'government_id', 'passport', 'ssn_card', 'birth_certificate',
  'i9_form', 'w4_form', 'w9_form', 'direct_deposit_form',
  'employee_handbook_signed', 'confidentiality_agreement', 'code_of_conduct',
  'certification', 'license', 'training_certificate',
  'background_check', 'drug_test', 'physical_exam',
  'emergency_contact_form', 'uniform_agreement', 'vehicle_insurance',
  'custom_document'
]);

export const employeeDocumentStatusEnum = pgEnum('employee_document_status', [
  'pending_upload', 'uploaded', 'pending_review', 'approved', 'rejected', 'expired', 'archived'
]);

export const employeeDocuments = pgTable("employee_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  applicationId: varchar("application_id").references(() => onboardingApplications.id),

  // Document classification
  documentType: employeeDocumentTypeEnum("document_type").notNull(),
  documentName: varchar("document_name").notNull(),
  documentDescription: text("document_description"),

  // File storage (Object Storage)
  fileUrl: varchar("file_url").notNull(), // Permanent storage URL
  fileSize: integer("file_size"), // Bytes
  fileType: varchar("file_type"), // 'application/pdf', 'image/jpeg'
  originalFileName: varchar("original_file_name"),

  // Audit trail - WHO uploaded
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  uploadedByEmail: varchar("uploaded_by_email"), // Denormalized for audit persistence
  uploadedByRole: varchar("uploaded_by_role"), // Role at time of upload

  // Audit trail - WHEN uploaded
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),

  // Audit trail - WHERE uploaded from
  uploadIpAddress: varchar("upload_ip_address").notNull(),
  uploadUserAgent: text("upload_user_agent"),
  uploadGeoLocation: varchar("upload_geo_location"), // City, State, Country

  // Document lifecycle
  status: employeeDocumentStatusEnum("status").default('uploaded'),
  expirationDate: timestamp("expiration_date"), // For licenses, certifications

  // Approval workflow
  requiresApproval: boolean("requires_approval").default(false),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  approvalNotes: text("approval_notes"),

  rejectedBy: varchar("rejected_by").references(() => users.id),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),

  // Compliance & retention
  isComplianceDocument: boolean("is_compliance_document").default(false), // I-9, W-4, etc.
  retentionPeriodYears: integer("retention_period_years").default(7), // Default: 7 years for audit defense
  deleteAfter: timestamp("delete_after"), // Auto-calculated: uploadedAt + retentionPeriodYears

  // Document verification
  isVerified: boolean("is_verified").default(false),
  verifiedBy: varchar("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at"),

  // Immutability flag (for signed documents)
  isImmutable: boolean("is_immutable").default(false), // Once signed, cannot be modified
  digitalSignatureHash: varchar("digital_signature_hash"), // SHA-256 hash for tamper detection

  // Metadata
  metadata: jsonb("metadata"), // Custom fields, OCR data, etc.

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_employee_documents_employee").on(table.employeeId),
  index("idx_employee_documents_type").on(table.documentType),
  index("idx_employee_documents_status").on(table.status),
  index("idx_employee_documents_expiration").on(table.expirationDate),
]);

export const insertEmployeeDocumentSchema = createInsertSchema(employeeDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeDocument = z.infer<typeof insertEmployeeDocumentSchema>;
export type EmployeeDocument = typeof employeeDocuments.$inferSelect;

// Document Access Log (Who viewed what, when)
export const documentAccessLogs = pgTable("document_access_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  documentId: varchar("document_id").notNull().references(() => employeeDocuments.id, { onDelete: 'cascade' }),

  // Access details
  accessedBy: varchar("accessed_by").notNull().references(() => users.id),
  accessedByEmail: varchar("accessed_by_email").notNull(),
  accessedByRole: varchar("accessed_by_role").notNull(),

  accessType: varchar("access_type").notNull(), // 'view', 'download', 'print', 'share'

  // Context
  ipAddress: varchar("ip_address").notNull(),
  userAgent: text("user_agent"),

  // Audit compliance
  accessedAt: timestamp("accessed_at").notNull().defaultNow(),
}, (table) => [
  index("idx_document_access_document").on(table.documentId),
  index("idx_document_access_user").on(table.accessedBy),
  index("idx_document_access_time").on(table.accessedAt),
]);

export const insertDocumentAccessLogSchema = createInsertSchema(documentAccessLogs).omit({
  id: true,
  accessedAt: true,
});

export type InsertDocumentAccessLog = z.infer<typeof insertDocumentAccessLogSchema>;
export type DocumentAccessLog = typeof documentAccessLogs.$inferSelect;

// Onboarding Checklist (Track completion per employee)
export const onboardingChecklists = pgTable("onboarding_checklists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  applicationId: varchar("application_id").notNull().references(() => onboardingApplications.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").references(() => employees.id),
  templateId: varchar("template_id").references(() => onboardingWorkflowTemplates.id),

  // Progress tracking
  checklistItems: jsonb("checklist_items").notNull().$type<Array<{
    itemId: string;
    itemName: string;
    itemType: 'document' | 'signature' | 'certification' | 'form' | 'task';
    isRequired: boolean;
    isCompleted: boolean;
    completedAt?: Date;
    completedBy?: string;
    documentId?: string; // Link to employeeDocuments
    notes?: string;
  }>>(),

  overallProgress: integer("overall_progress").default(0), // 0-100%

  // Compliance deadlines
  i9DeadlineDate: timestamp("i9_deadline_date"), // 3 business days from hire
  onboardingCompletedAt: timestamp("onboarding_completed_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_onboarding_checklist_employee").on(table.employeeId),
  index("idx_onboarding_checklist_application").on(table.applicationId),
]);

export const insertOnboardingChecklistSchema = createInsertSchema(onboardingChecklists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOnboardingChecklist = z.infer<typeof insertOnboardingChecklistSchema>;
export type OnboardingChecklist = typeof onboardingChecklists.$inferSelect;

// ============================================================================
// ENTERPRISE FEATURES - Audit Trail System
// ============================================================================

export const auditActionEnum = pgEnum('audit_action', [
  // Legacy workspace actions
  'create', 'update', 'delete', 
  'login', 'logout', 
  'clock_in', 'clock_out',
  'generate_invoice', 'payment_received',
  'assign_manager', 'remove_manager',

  // AuditOS™ Chat moderation actions
  'kick_user',
  'silence_user',
  'give_voice',
  'remove_voice',
  'ban_user',
  'unban_user',

  // AuditOS™ Account management actions
  'reset_password',
  'unlock_account',
  'lock_account',
  'change_role',
  'change_permissions',

  // AuditOS™ Workspace actions
  'transfer_ownership',
  'impersonate_user',

  // AuditOS™ Data actions
  'export_data',
  'import_data',
  'delete_data',
  'restore_data',

  // AuditOS™ System actions
  'update_motd',
  'update_banner',
  'change_settings',
  'view_audit_logs',

  // AuditOS™ Support actions
  'escalate_ticket',
  'transfer_ticket',
  'view_documents',
  'request_secure_info',
  'release_spectator',

  // Autonomous Automation actions (BillOS™, ScheduleOS™, PayrollOS™)
  'automation_job_start',
  'automation_job_complete',
  'automation_job_error',
  'automation_artifact_generated',

  // Other
  'other'
]);

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),

  // AuditOS™ Command tracking (IRC-style)
  commandId: varchar("command_id"), // Unique ID for command/response matching

  // Actor information
  userId: varchar("user_id").notNull().references(() => users.id),
  userEmail: varchar("user_email").notNull(), // Denormalized for audit trail persistence
  userRole: varchar("user_role").notNull(), // Role at time of action

  // Action details
  action: auditActionEnum("action").notNull(),
  actionDescription: text("action_description"), // Human-readable description for AuditOS™
  entityType: varchar("entity_type"), // 'employee', 'shift', 'invoice', 'user', 'message', etc.
  entityId: varchar("entity_id"),

  // AuditOS™ Target tracking
  targetId: varchar("target_id"), // User, workspace, or resource affected by action
  targetName: varchar("target_name"), // Cached for historical accuracy
  targetType: varchar("target_type"), // 'user', 'workspace', 'message', 'document', etc.

  // AuditOS™ Context
  conversationId: varchar("conversation_id"), // If chat-related
  reason: text("reason"), // Reason for action (e.g., kick/silence reason)

  // Change tracking
  changes: jsonb("changes"), // { before: {...}, after: {...} }
  metadata: jsonb("metadata"), // Additional context (API endpoint, feature flag, command payload, etc.)

  // Request context
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"), // Required for SOC2/GDPR traceability
  requestId: varchar("request_id"), // For correlating related actions

  // AuditOS™ Result tracking
  success: boolean("success").default(true),
  errorMessage: text("error_message"), // If action failed

  // Compliance flags
  isSensitiveData: boolean("is_sensitive_data").default(false), // PII, financial data, etc.
  complianceTag: varchar("compliance_tag"), // 'gdpr', 'soc2', 'hipaa', etc.

  // Immutability - audit logs should NEVER be deleted
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_audit_workspace_created").on(table.workspaceId, table.createdAt),
  index("idx_audit_user_created").on(table.userId, table.createdAt),
  index("idx_audit_entity").on(table.entityType, table.entityId),
  index("idx_audit_action_created").on(table.action, table.createdAt),
  index("idx_audit_command_id").on(table.commandId),
  index("idx_audit_target").on(table.targetId),
]);

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// ============================================================================
// ENTERPRISE FEATURES - API Access
// ============================================================================

export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  name: varchar("name").notNull(),
  keyHash: varchar("key_hash").notNull().unique(), // Hashed API key
  keyPrefix: varchar("key_prefix").notNull(), // First 8 chars for display

  scopes: text("scopes").array(), // ['read:employees', 'write:shifts', etc.]
  isActive: boolean("is_active").default(true),

  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),

  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  revokedAt: timestamp("revoked_at"),
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
});

export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;

// ============================================================================
// ENTERPRISE FEATURES - GPS Clock-in Verification
// ============================================================================

export const gpsLocations = pgTable("gps_locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // References - for different use cases
  timeEntryId: varchar("time_entry_id").references(() => timeEntries.id, { onDelete: 'cascade' }), // Clock-in verification
  employeeId: varchar("employee_id").references(() => employees.id, { onDelete: 'cascade' }), // DispatchOS tracking

  // Location data
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  accuracy: decimal("accuracy", { precision: 10, scale: 2 }), // meters
  altitude: decimal("altitude", { precision: 10, scale: 2 }), // meters

  // Movement data (for DispatchOS)
  speed: decimal("speed", { precision: 10, scale: 2 }), // km/h or mph
  heading: decimal("heading", { precision: 10, scale: 2 }), // degrees 0-360
  isMoving: boolean("is_moving").default(false),

  // Clock-in verification fields
  address: varchar("address"),
  verified: boolean("verified").default(false),
  deviceInfo: jsonb("device_info"),
  
  // Device data (for DispatchOS)
  batteryLevel: integer("battery_level"), // percentage 0-100
  timestamp: timestamp("timestamp").notNull().defaultNow(),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("gps_locations_workspace_idx").on(table.workspaceId),
  employeeIdx: index("gps_locations_employee_idx").on(table.employeeId),
  timestampIdx: index("gps_locations_timestamp_idx").on(table.timestamp),
}));

export const insertGpsLocationSchema = createInsertSchema(gpsLocations).omit({
  id: true,
  createdAt: true,
});

export type InsertGpsLocation = z.infer<typeof insertGpsLocationSchema>;
export type GpsLocation = typeof gpsLocations.$inferSelect;

// ============================================================================
// ENTERPRISE FEATURES - Payroll Automation
// ============================================================================

export const payrollStatusEnum = pgEnum('payroll_status', ['draft', 'pending', 'approved', 'processed', 'paid']);

export const payrollRuns = pgTable("payroll_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),

  status: payrollStatusEnum("status").default("draft"),

  totalGrossPay: decimal("total_gross_pay", { precision: 12, scale: 2 }).default("0.00"),
  totalTaxes: decimal("total_taxes", { precision: 12, scale: 2 }).default("0.00"),
  totalNetPay: decimal("total_net_pay", { precision: 12, scale: 2 }).default("0.00"),

  processedBy: varchar("processed_by").references(() => users.id),
  processedAt: timestamp("processed_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPayrollRunSchema = createInsertSchema(payrollRuns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPayrollRun = z.infer<typeof insertPayrollRunSchema>;
export type PayrollRun = typeof payrollRuns.$inferSelect;

export const payrollEntries = pgTable("payroll_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  payrollRunId: varchar("payroll_run_id").notNull().references(() => payrollRuns.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

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

  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPayrollEntrySchema = createInsertSchema(payrollEntries).omit({
  id: true,
  createdAt: true,
});

export type InsertPayrollEntry = z.infer<typeof insertPayrollEntrySchema>;
export type PayrollEntry = typeof payrollEntries.$inferSelect;

// ============================================================================
// ENTERPRISE FEATURES - Platform-Level Roles (Root, Sysop, Auditor)
// ============================================================================

// Platform roles that exist outside workspace tenancy
export const platformRoles = pgTable("platform_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: platformRoleEnum("role").notNull(),

  // Assignment tracking
  grantedBy: varchar("granted_by").references(() => users.id),
  grantedReason: text("granted_reason"),
  revokedAt: timestamp("revoked_at"),
  revokedBy: varchar("revoked_by").references(() => users.id),
  revokedReason: text("revoked_reason"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueUserRole: uniqueIndex("unique_user_platform_role").on(table.userId, table.role),
}));

export const insertPlatformRoleSchema = createInsertSchema(platformRoles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPlatformRole = z.infer<typeof insertPlatformRoleSchema>;
export type PlatformRole = typeof platformRoles.$inferSelect;

// System-wide audit log for platform operations
export const systemAuditLogs = pgTable("system_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  platformRole: platformRoleEnum("platform_role"),

  action: varchar("action").notNull(), // 'create_workspace', 'delete_user', 'grant_role', etc.
  entityType: varchar("entity_type").notNull(),
  entityId: varchar("entity_id"),
  workspaceId: varchar("workspace_id").references(() => workspaces.id),

  changes: jsonb("changes"), // { before: {...}, after: {...} }
  metadata: jsonb("metadata"),
  ipAddress: varchar("ip_address"),
  userAgent: varchar("user_agent"),
  requiresConfirmation: boolean("requires_confirmation").default(false),
  confirmedBy: varchar("confirmed_by").references(() => users.id),
  confirmedAt: timestamp("confirmed_at"),

  createdAt: timestamp("created_at").defaultNow(),
});

export type SystemAuditLog = typeof systemAuditLogs.$inferSelect;

// ============================================================================
// ENTERPRISE FEATURES - Resignation & Notice System
// ============================================================================

export const noticeTypeEnum = pgEnum('notice_type', ['resignation', 'role_change', 'termination']);
export const noticeStatusEnum = pgEnum('notice_status', ['submitted', 'acknowledged', 'completed', 'cancelled']);

export const employeeNotices = pgTable("employee_notices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),

  noticeType: noticeTypeEnum("notice_type").notNull(),
  currentRole: varchar("current_role"), // Current workspaceRole

  // Notice details
  submittedDate: timestamp("submitted_date").defaultNow(),
  effectiveDate: timestamp("effective_date").notNull(), // Last day or when change takes effect
  reason: text("reason"),

  // Status tracking
  status: noticeStatusEnum("status").default("submitted"),
  acknowledgedBy: varchar("acknowledged_by").references(() => users.id),
  acknowledgedAt: timestamp("acknowledged_at"),

  // Early release option
  releasedEarly: boolean("released_early").default(false),
  releasedBy: varchar("released_by").references(() => users.id),
  releasedAt: timestamp("released_at"),
  actualEndDate: timestamp("actual_end_date"),

  // Rehiring policy compliance
  eligibleForRehire: boolean("eligible_for_rehire").default(true),
  rehireNotes: text("rehire_notes"),

  // Audit trail (kept for 2 years)
  retentionUntil: timestamp("retention_until"), // Auto-set to 2 years from completion

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmployeeNoticeSchema = createInsertSchema(employeeNotices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeNotice = z.infer<typeof insertEmployeeNoticeSchema>;
export type EmployeeNotice = typeof employeeNotices.$inferSelect;

// ============================================================================
// ENTERPRISE FEATURES - Subscription & Billing Management
// ============================================================================

export const subscriptionPlanEnum = pgEnum('subscription_plan', ['free', 'starter', 'professional', 'enterprise']);
export const billingCycleEnum = pgEnum('billing_cycle', ['monthly', 'annual']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['trial', 'active', 'past_due', 'cancelled', 'suspended']);

export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique().references(() => workspaces.id, { onDelete: 'cascade' }),

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
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

// Overage tracking for exceeding plan limits
export const overageCharges = pgTable("overage_charges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  subscriptionId: varchar("subscription_id").notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),

  // Period
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),

  // Overage details
  overageType: varchar("overage_type").notNull(), // 'employees', 'clients', 'invoices'
  limit: integer("limit").notNull(),
  actual: integer("actual").notNull(),
  overage: integer("overage").notNull(),

  // Pricing
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(), // Price per overage unit
  totalCharge: decimal("total_charge", { precision: 10, scale: 2 }).notNull(),

  // Payment
  invoiced: boolean("invoiced").default(false),
  invoiceId: varchar("invoice_id"),

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOverageChargeSchema = createInsertSchema(overageCharges).omit({
  id: true,
  createdAt: true,
});

export type InsertOverageCharge = z.infer<typeof insertOverageChargeSchema>;
export type OverageCharge = typeof overageCharges.$inferSelect;

// Platform revenue tracking (our cuts from invoices + subscriptions)
export const platformRevenue = pgTable("platform_revenue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

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
});

export const insertPlatformRevenueSchema = createInsertSchema(platformRevenue).omit({
  id: true,
  createdAt: true,
});

export type InsertPlatformRevenue = z.infer<typeof insertPlatformRevenueSchema>;
export type PlatformRevenue = typeof platformRevenue.$inferSelect;

// AI Usage Tracking - Track AI operations and costs per workspace
export const workspaceAiUsage = pgTable("workspace_ai_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Operation details
  feature: varchar("feature").notNull(), // 'smart_schedule_ai', 'predictive_analytics', 'auto_optimization'
  operation: varchar("operation").notNull(), // 'generate_schedule', 'analyze_labor_costs', 'predict_demand'
  requestId: varchar("request_id").notNull(), // Unique identifier for this AI request

  // Token usage
  tokensUsed: integer("tokens_used").notNull(), // Total tokens consumed
  model: varchar("model").notNull(), // 'gpt-4', 'gpt-3.5-turbo', etc.

  // Cost tracking
  providerCostUsd: decimal("provider_cost_usd", { precision: 10, scale: 6 }).notNull(), // What we pay OpenAI
  markupPercentage: decimal("markup_percentage", { precision: 5, scale: 2 }).default("300.00"), // Default 300% markup
  clientChargeUsd: decimal("client_charge_usd", { precision: 10, scale: 6 }).notNull(), // What we charge client

  // Billing status
  status: varchar("status").default("pending"), // 'pending', 'invoiced', 'paid'
  invoiceId: varchar("invoice_id").references(() => invoices.id), // Link to monthly AI usage invoice
  billingPeriod: varchar("billing_period"), // '2024-10', '2024-11' for monthly aggregation

  // Metadata
  inputData: jsonb("input_data"), // Request parameters (for debugging/audit)
  outputData: jsonb("output_data"), // AI response summary

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkspaceAiUsageSchema = createInsertSchema(workspaceAiUsage).omit({
  id: true,
  createdAt: true,
});

export type InsertWorkspaceAiUsage = z.infer<typeof insertWorkspaceAiUsageSchema>;
export type WorkspaceAiUsage = typeof workspaceAiUsage.$inferSelect;

// ============================================================================
// REPORT MANAGEMENT SYSTEM (RMS)
// ============================================================================

// Report Templates - Configurable report types per workspace
export const reportTemplates = pgTable("report_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Template details
  name: varchar("name").notNull(), // "Daily Activity Report", "Incident Write-up", etc.
  description: text("description"),
  category: varchar("category"), // 'security', 'healthcare', 'retail', 'construction', 'compliance', 'executive', etc.

  // Field configuration (JSON array of field definitions)
  // Example: [{ name: "location", label: "Location", type: "text", required: true }, ...]
  fields: jsonb("fields").notNull(),

  // Photo requirements for transparency and accountability
  requiresPhotos: boolean("requires_photos").default(false), // Mandatory for DAR, incident, safety reports
  minPhotos: integer("min_photos").default(0), // Minimum photos required (e.g., 1 for incidents)
  maxPhotos: integer("max_photos").default(10), // Maximum allowed photos
  photoInstructions: text("photo_instructions"), // e.g., "Photos must be clear, well-lighted, showing full scene"

  // MONOPOLISTIC FEATURES: Compliance & Intelligence
  isComplianceReport: boolean("is_compliance_report").default(false), // Non-editable audit-ready reports
  complianceType: varchar("compliance_type"), // 'labor_law', 'tax_remittance', 'audit_log', 'benchmark'
  autoGeneratePdf: boolean("auto_generate_pdf").default(false), // Auto-generate PDF for compliance
  allowAiSummary: boolean("allow_ai_summary").default(false), // Enable GPT-4 executive summaries

  // Dynamic Report Builder
  isDynamicReport: boolean("is_dynamic_report").default(false), // User-created drag-and-drop reports
  dataSourceConfig: jsonb("data_source_config"), // { tables: ['timeEntries', 'invoices'], joins: [...] }
  chartType: varchar("chart_type"), // 'table', 'bar', 'line', 'pie', 'summary'

  // Activation status
  isActive: boolean("is_active").default(false), // Whether activated for this workspace
  isSystemTemplate: boolean("is_system_template").default(false), // Built-in vs custom

  // Metadata
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertReportTemplateSchema = createInsertSchema(reportTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertReportTemplate = z.infer<typeof insertReportTemplateSchema>;
export type ReportTemplate = typeof reportTemplates.$inferSelect;

// Report Submissions - Actual reports created by employees
export const reportSubmissions = pgTable("report_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  templateId: varchar("template_id").notNull().references(() => reportTemplates.id, { onDelete: 'cascade' }),

  // Report metadata
  reportNumber: varchar("report_number").notNull(), // Auto-generated unique number (e.g., "RPT-2024-001")
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: 'set null' }), // End customer receiving report

  // Form data (JSON object with filled field values)
  formData: jsonb("form_data").notNull(),

  // Photo attachments with automatic timestamping
  // Format: [{ url: "...", timestamp: "2024-10-14T21:30:00Z", caption: "...", metadata: {...} }, ...]
  photos: jsonb("photos"), // Array of photo objects with timestamp, URL, metadata

  // Workflow status
  status: varchar("status").default("draft"), // 'draft', 'pending_review', 'approved', 'rejected', 'sent_to_customer'

  // Review tracking
  reviewedBy: varchar("reviewed_by").references(() => employees.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),

  // Customer delivery
  sentToCustomerAt: timestamp("sent_to_customer_at"),
  customerViewedAt: timestamp("customer_viewed_at"),

  // Timestamps
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertReportSubmissionSchema = createInsertSchema(reportSubmissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertReportSubmission = z.infer<typeof insertReportSubmissionSchema>;
export type ReportSubmission = typeof reportSubmissions.$inferSelect;

// ============================================================================
// MONOPOLISTIC REPORT WORKFLOW ENGINE
// ============================================================================

// Approval Workflow Configuration - Define multi-step approval chains per template
export const reportWorkflowConfigs = pgTable("report_workflow_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => reportTemplates.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Workflow steps (array of approval stages)
  // Example: [{ step: 1, roleRequired: 'manager', approverUserId: null }, { step: 2, roleRequired: 'owner', approverUserId: 'user123' }]
  approvalSteps: jsonb("approval_steps").notNull(), // Array of {step, roleRequired, approverUserId?, minRole}

  // Final destination after all approvals
  finalDestination: varchar("final_destination").notNull(), // 'audit_database', 'email_client', 'return_to_submitter'

  // Email settings for client delivery
  emailTemplate: text("email_template"), // Custom email body template
  emailSubject: varchar("email_subject"), // Subject line
  includeAttachments: boolean("include_attachments").default(true),

  // Rejection handling
  requireRejectionNotes: boolean("require_rejection_notes").default(true),
  allowResubmit: boolean("allow_resubmit").default(true),

  // Automation
  autoLockOnApproval: boolean("auto_lock_on_approval").default(true), // Prevent editing after approval
  autoGeneratePdf: boolean("auto_generate_pdf").default(true),

  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertReportWorkflowConfigSchema = createInsertSchema(reportWorkflowConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertReportWorkflowConfig = z.infer<typeof insertReportWorkflowConfigSchema>;
export type ReportWorkflowConfig = typeof reportWorkflowConfigs.$inferSelect;

// Approval Step Tracking - Track each approval step for a submission
export const reportApprovalSteps = pgTable("report_approval_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  submissionId: varchar("submission_id").notNull().references(() => reportSubmissions.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Step details
  stepNumber: integer("step_number").notNull(), // 1, 2, 3...
  stepName: varchar("step_name"), // "Manager Review", "Supervisor Final Approval"
  requiredRole: varchar("required_role"), // 'manager', 'owner', 'supervisor'

  // Approver assignment
  assignedTo: varchar("assigned_to").references(() => users.id), // Specific user if assigned

  // Step status
  status: varchar("status").default("pending"), // 'pending', 'approved', 'rejected', 'skipped'

  // Approval/Rejection details
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  rejectionReason: text("rejection_reason"),

  // Audit trail
  notificationSentAt: timestamp("notification_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertReportApprovalStepSchema = createInsertSchema(reportApprovalSteps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertReportApprovalStep = z.infer<typeof insertReportApprovalStepSchema>;
export type ReportApprovalStep = typeof reportApprovalSteps.$inferSelect;

// Locked Report Records - Immutable audit trail after approval
export const lockedReportRecords = pgTable("locked_report_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  submissionId: varchar("submission_id").notNull().references(() => reportSubmissions.id, { onDelete: 'restrict' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Immutable snapshot
  snapshotData: jsonb("snapshot_data").notNull(), // Full report data + metadata frozen at approval
  pdfUrl: text("pdf_url"), // Generated PDF stored in object storage
  pdfGeneratedAt: timestamp("pdf_generated_at"),

  // Lock metadata
  lockedBy: varchar("locked_by").notNull().references(() => users.id),
  lockedAt: timestamp("locked_at").notNull().defaultNow(),
  lockReason: varchar("lock_reason").default('approved'), // 'approved', 'compliance', 'audit'

  // Cryptographic integrity (future enhancement)
  contentHash: varchar("content_hash"), // SHA-256 hash for tamper detection
  digitalSignature: text("digital_signature"), // Optional: cryptographic signature

  // Cross-references for analytics
  employeeId: varchar("employee_id").references(() => employees.id),
  shiftId: varchar("shift_id"), // References shift if applicable
  clientId: varchar("client_id").references(() => clients.id),

  // Retention policy
  retentionYears: integer("retention_years").default(7), // IRS/DOL compliance
  expiresAt: timestamp("expires_at"), // Auto-calculated: lockedAt + retentionYears

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLockedReportRecordSchema = createInsertSchema(lockedReportRecords).omit({
  id: true,
  createdAt: true,
});

export type InsertLockedReportRecord = z.infer<typeof insertLockedReportRecordSchema>;
export type LockedReportRecord = typeof lockedReportRecords.$inferSelect;

// Report Attachments - Photos, documents, etc.
export const reportAttachments = pgTable("report_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  submissionId: varchar("submission_id").notNull().references(() => reportSubmissions.id, { onDelete: 'cascade' }),

  // File details
  fileName: varchar("file_name").notNull(),
  fileType: varchar("file_type").notNull(), // 'image/jpeg', 'application/pdf', etc.
  fileSize: integer("file_size"), // In bytes
  fileData: text("file_data"), // Base64 encoded for MVP (will upgrade to object storage)

  // Metadata
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at").defaultNow(),

  // Optional: Location/timestamp when photo was taken
  capturedAt: timestamp("captured_at"),
  gpsLocation: jsonb("gps_location"), // { lat, lng, accuracy }
});

export const insertReportAttachmentSchema = createInsertSchema(reportAttachments).omit({
  id: true,
  uploadedAt: true,
});

export type InsertReportAttachment = z.infer<typeof insertReportAttachmentSchema>;
export type ReportAttachment = typeof reportAttachments.$inferSelect;

// Customer Report Access - Manage time-limited access for end customers
export const customerReportAccess = pgTable("customer_report_access", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  submissionId: varchar("submission_id").notNull().references(() => reportSubmissions.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: 'cascade' }),

  // Access control
  accessToken: varchar("access_token").notNull().unique(), // Unique token for secure access
  expiresAt: timestamp("expires_at").notNull(), // Time-limited access (e.g., 30-60 days)

  // Usage tracking
  accessCount: integer("access_count").default(0),
  lastAccessedAt: timestamp("last_accessed_at"),

  // Status
  isRevoked: boolean("is_revoked").default(false),

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomerReportAccessSchema = createInsertSchema(customerReportAccess).omit({
  id: true,
  createdAt: true,
});

export type InsertCustomerReportAccess = z.infer<typeof insertCustomerReportAccessSchema>;
export type CustomerReportAccess = typeof customerReportAccess.$inferSelect;

// ============================================================================
// MONOPOLISTIC REPORTOS™ FEATURES
// ============================================================================

// Real-Time KPI Alerts - Configurable notifications tied to PredictionOS™ and Custom Logic
export const kpiAlerts = pgTable("kpi_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Alert configuration
  alertName: varchar("alert_name").notNull(), // "Unapproved Overtime Alert", "Turnover Risk Alert"
  description: text("description"),
  alertType: varchar("alert_type").notNull(), // 'overtime', 'turnover_risk', 'cost_variance', 'compliance', 'custom'

  // Threshold & Trigger
  metricSource: varchar("metric_source").notNull(), // 'time_entries', 'predictions', 'custom_rules', 'invoices'
  thresholdValue: decimal("threshold_value", { precision: 10, scale: 2 }).notNull(), // e.g., 2.0 for "2 hours"
  thresholdUnit: varchar("threshold_unit"), // 'hours', 'percent', 'score', 'dollars'
  comparisonOperator: varchar("comparison_operator").notNull(), // '>', '<', '>=', '<=', '=='

  // Notification settings
  notifyRoles: jsonb("notify_roles").notNull(), // ['owner', 'manager', 'employee'] - who gets notified
  notifyUsers: jsonb("notify_users"), // [userId1, userId2] - specific users
  notificationMethod: varchar("notification_method").default('in_app'), // 'in_app', 'email', 'sms', 'all'

  // Status
  isActive: boolean("is_active").default(true),

  // Tracking
  lastTriggeredAt: timestamp("last_triggered_at"),
  triggerCount: integer("trigger_count").default(0),

  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertKpiAlertSchema = createInsertSchema(kpiAlerts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertKpiAlert = z.infer<typeof insertKpiAlertSchema>;
export type KpiAlert = typeof kpiAlerts.$inferSelect;

// Alert Trigger History - Log every time an alert fires
export const kpiAlertTriggers = pgTable("kpi_alert_triggers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alertId: varchar("alert_id").notNull().references(() => kpiAlerts.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Trigger details
  metricValue: decimal("metric_value", { precision: 10, scale: 2 }).notNull(), // Actual value that triggered alert
  thresholdValue: decimal("threshold_value", { precision: 10, scale: 2 }).notNull(), // Threshold at time of trigger

  // Context
  entityType: varchar("entity_type"), // 'shift', 'employee', 'invoice', 'prediction'
  entityId: varchar("entity_id"), // ID of entity that triggered alert
  entityData: jsonb("entity_data"), // Snapshot of relevant data

  // Notification tracking
  notifiedUsers: jsonb("notified_users"), // [userId1, userId2] who was actually notified
  acknowledged: boolean("acknowledged").default(false),
  acknowledgedBy: varchar("acknowledged_by").references(() => users.id),
  acknowledgedAt: timestamp("acknowledged_at"),

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertKpiAlertTriggerSchema = createInsertSchema(kpiAlertTriggers).omit({
  id: true,
  createdAt: true,
});

export type InsertKpiAlertTrigger = z.infer<typeof insertKpiAlertTriggerSchema>;
export type KpiAlertTrigger = typeof kpiAlertTriggers.$inferSelect;

// Benchmark Metrics - Anonymous aggregation for peer comparison (Future Moat)
export const benchmarkMetrics = pgTable("benchmark_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Metrics period
  periodType: varchar("period_type").notNull(), // 'weekly', 'monthly', 'quarterly'
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),

  // Efficiency metrics
  avgTimeToInvoicePayment: decimal("avg_time_to_invoice_payment", { precision: 8, scale: 2 }), // Days
  shiftAdherenceRate: decimal("shift_adherence_rate", { precision: 5, scale: 2 }), // Percentage
  employeeTurnoverRate: decimal("employee_turnover_rate", { precision: 5, scale: 2 }), // Percentage
  avgOvertimePercentage: decimal("avg_overtime_percentage", { precision: 5, scale: 2 }), // Percentage

  // Financial metrics
  avgRevenuePerEmployee: decimal("avg_revenue_per_employee", { precision: 12, scale: 2 }),
  avgCostVariancePercentage: decimal("avg_cost_variance_percentage", { precision: 5, scale: 2 }),
  platformFeeCollected: decimal("platform_fee_collected", { precision: 12, scale: 2 }),

  // Operational metrics
  totalActiveEmployees: integer("total_active_employees"),
  totalActiveClients: integer("total_active_clients"),
  totalShiftsScheduled: integer("total_shifts_scheduled"),
  totalHoursWorked: decimal("total_hours_worked", { precision: 12, scale: 2 }),

  // Industry classification (for peer grouping - added later)
  industryCategory: varchar("industry_category"), // 'security', 'healthcare', 'construction', etc.
  companySize: varchar("company_size"), // 'small', 'medium', 'large', 'enterprise'

  // Privacy & Anonymization
  isAnonymized: boolean("is_anonymized").default(true), // Always true for peer comparison
  shareWithPeerBenchmarks: boolean("share_with_peer_benchmarks").default(false), // Opt-in for industry averages

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBenchmarkMetricSchema = createInsertSchema(benchmarkMetrics).omit({
  id: true,
  createdAt: true,
});

export type InsertBenchmarkMetric = z.infer<typeof insertBenchmarkMetricSchema>;
export type BenchmarkMetric = typeof benchmarkMetrics.$inferSelect;

// Support Tickets - Help desk for report requests and template requests
export const supportTickets = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Ticket details
  ticketNumber: varchar("ticket_number").notNull(), // Auto-generated (e.g., "TKT-2024-001")
  type: varchar("type").notNull(), // 'report_request', 'template_request', 'support', 'other'
  priority: varchar("priority").default("normal"), // 'low', 'normal', 'high', 'urgent'

  // Requester (can be client or employee)
  clientId: varchar("client_id").references(() => clients.id),
  employeeId: varchar("employee_id").references(() => employees.id),
  requestedBy: varchar("requested_by"), // Name/email if external

  // Ticket content
  subject: varchar("subject").notNull(),
  description: text("description").notNull(),

  // For report requests
  reportSubmissionId: varchar("report_submission_id").references(() => reportSubmissions.id),

  // Status tracking
  status: varchar("status").default("open"), // 'open', 'in_progress', 'resolved', 'closed'
  assignedTo: varchar("assigned_to").references(() => employees.id),

  // Resolution
  resolution: text("resolution"),
  resolutionSummary: text("resolution_summary"), // Brief summary for ticket updates
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by").references(() => users.id),
  closedAt: timestamp("closed_at"), // Final closure timestamp (may differ from resolvedAt)
  closedBy: varchar("closed_by").references(() => users.id), // Who officially closed the ticket

  // Verification for chatroom access (gatekeeper MOMJJ)
  verifiedAt: timestamp("verified_at"),
  verifiedBy: varchar("verified_by").references(() => users.id), // Support staff who verified

  // Organization-to-Platform Escalation
  isEscalated: boolean("is_escalated").default(false), // Whether ticket escalated to platform support
  escalatedAt: timestamp("escalated_at"), // When escalated
  escalatedBy: varchar("escalated_by").references(() => users.id), // Org leader who escalated
  escalatedReason: text("escalated_reason"), // Why escalated
  platformAssignedTo: varchar("platform_assigned_to").references(() => users.id), // Platform support staff assigned
  platformNotes: text("platform_notes"), // Internal platform support notes

  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Performance indexes for ticket filtering and routing
  index("support_tickets_status_idx").on(table.status),
  index("support_tickets_priority_idx").on(table.priority),
  index("support_tickets_workspace_created_idx").on(table.workspaceId, table.createdAt),
  index("support_tickets_assigned_idx").on(table.assignedTo),
  index("support_tickets_platform_assigned_idx").on(table.platformAssignedTo),
]);

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;

// HelpOS FAQ Knowledge Base - FAQ articles for AI-powered bot assistance
export const helposFaqs = pgTable("helpos_faqs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // FAQ details
  category: varchar("category").notNull(), // 'billing', 'technical', 'account', 'features', 'general'
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`), // Searchable keywords
  
  // AI/Search optimization
  embeddingVector: text("embedding_vector"), // Optional: for semantic search
  searchKeywords: text("search_keywords"), // Additional keywords for matching
  
  // Metadata
  viewCount: integer("view_count").default(0), // Track popular FAQs
  helpfulCount: integer("helpful_count").default(0), // User feedback
  notHelpfulCount: integer("not_helpful_count").default(0),
  
  // Publishing
  isPublished: boolean("is_published").default(true),
  publishedAt: timestamp("published_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertHelposFaqSchema = createInsertSchema(helposFaqs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertHelposFaq = z.infer<typeof insertHelposFaqSchema>;
export type HelposFaq = typeof helposFaqs.$inferSelect;

// ============================================================================
// CUSTOM FORMS SYSTEM (Organization-Specific)
// ============================================================================

// Custom Form Templates - Organization-specific forms for onboarding and RMS
// Each organization can have custom forms added by platform admins/support
export const customForms = pgTable("custom_forms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Form details
  name: varchar("name").notNull(), // "Consent for Sildenafil", "Background Check Authorization", etc.
  description: text("description"),
  category: varchar("category"), // 'onboarding', 'rms', 'compliance', 'custom'

  // Form template (JSON structure)
  // Example: { title: "...", sections: [{ heading: "...", fields: [...], consent: {...} }] }
  template: jsonb("template").notNull(),

  // E-signature configuration
  requiresSignature: boolean("requires_signature").default(false),
  signatureType: varchar("signature_type").default("typed_name"), // 'typed_name', 'drawn', 'uploaded'
  signatureText: text("signature_text"), // Legal text above signature field

  // Document upload configuration
  requiresDocuments: boolean("requires_documents").default(false),
  documentTypes: jsonb("document_types"), // [{ type: 'id', label: 'Government ID', required: true }, ...]
  maxDocuments: integer("max_documents").default(5),

  // Access control
  isActive: boolean("is_active").default(true),
  accessibleBy: jsonb("accessible_by"), // ['employee', 'manager', 'admin'] - who can fill out this form

  // Metadata
  createdBy: varchar("created_by").references(() => users.id), // Platform admin/support who created it
  createdByRole: varchar("created_by_role"), // 'platform_admin', 'support_manager', 'support_staff'

  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCustomFormSchema = createInsertSchema(customForms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCustomForm = z.infer<typeof insertCustomFormSchema>;
export type CustomForm = typeof customForms.$inferSelect;

// Custom Form Submissions - Completed forms with e-signatures and documents
export const customFormSubmissions = pgTable("custom_form_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  formId: varchar("form_id").notNull().references(() => customForms.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Who submitted
  submittedBy: varchar("submitted_by").references(() => users.id),
  submittedByType: varchar("submitted_by_type"), // 'employee', 'client', 'external'
  employeeId: varchar("employee_id").references(() => employees.id),

  // Form data (filled values)
  formData: jsonb("form_data").notNull(), // User's responses to all fields

  // E-signature data
  signatureData: jsonb("signature_data"), // { name: "...", signedAt: "...", ipAddress: "...", userAgent: "..." }
  hasAccepted: boolean("has_accepted").default(false), // Checkbox acceptance
  acceptedAt: timestamp("accepted_at"),

  // Document uploads
  documents: jsonb("documents"), // [{ type: 'id', fileName: '...', fileUrl: '...', uploadedAt: '...' }, ...]

  // Metadata
  ipAddress: varchar("ip_address"), // For legal audit trail
  userAgent: text("user_agent"),

  // Associated context
  onboardingTokenId: varchar("onboarding_token_id"), // If used during onboarding (token reference)
  reportSubmissionId: varchar("report_submission_id").references(() => reportSubmissions.id), // If used in RMS

  // Status
  status: varchar("status").default("completed"), // 'draft', 'completed', 'archived'

  // Timestamps
  submittedAt: timestamp("submitted_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCustomFormSubmissionSchema = createInsertSchema(customFormSubmissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  submittedAt: true,
});

export type InsertCustomFormSubmission = z.infer<typeof insertCustomFormSubmissionSchema>;
export type CustomFormSubmission = typeof customFormSubmissions.$inferSelect;

// ============================================================================
// SECURITY & COMPLIANCE
// ============================================================================

// Feature Flags - Control access to premium features per workspace
export const featureFlags = pgTable("feature_flags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Tier-based features (aligned with pricing)
  tier: varchar("tier").notNull().default("basic"), // 'basic', 'professional', 'premium', 'enterprise'

  // Core Features (Basic Tier - $49/month)
  hasEmployeeManagement: boolean("has_employee_management").default(true),
  hasClientManagement: boolean("has_client_management").default(true),
  hasBasicScheduling: boolean("has_basic_scheduling").default(true),
  hasTimeTracking: boolean("has_time_tracking").default(true),

  // Professional Features (Professional Tier - $149/month)
  hasInvoiceGeneration: boolean("has_invoice_generation").default(false),
  hasAnalyticsDashboard: boolean("has_analytics_dashboard").default(false),
  hasEmployeeOnboarding: boolean("has_employee_onboarding").default(false),

  // Premium Features (Premium Tier - $299/month)
  hasReportManagementSystem: boolean("has_report_management_system").default(false),
  hasGpsTracking: boolean("has_gps_tracking").default(false),
  hasAdvancedRbac: boolean("has_advanced_rbac").default(false),
  hasComplianceTools: boolean("has_compliance_tools").default(false),

  // Enterprise Features (Enterprise Tier - $599/month)
  hasWhiteLabelRms: boolean("has_white_label_rms").default(false),
  hasCustomBranding: boolean("has_custom_branding").default(false),
  hasApiAccess: boolean("has_api_access").default(false),
  hasSsoIntegration: boolean("has_sso_integration").default(false),
  hasDedicatedSupport: boolean("has_dedicated_support").default(false),

  // Add-on Features (Additional cost)
  hasAutomatedPayroll: boolean("has_automated_payroll").default(false), // +$99/month
  hasSmsNotifications: boolean("has_sms_notifications").default(false), // +$29/month
  hasAdvancedAnalytics: boolean("has_advanced_analytics").default(false), // +$79/month

  // Usage limits
  maxEmployees: integer("max_employees").default(5),
  maxClients: integer("max_clients").default(10),
  maxReportsPerMonth: integer("max_reports_per_month").default(10),
  maxStorageGb: integer("max_storage_gb").default(5),

  // Billing integration
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  billingCycle: varchar("billing_cycle").default("monthly"), // 'monthly', 'annual'
  trialEndsAt: timestamp("trial_ends_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFeatureFlagSchema = createInsertSchema(featureFlags).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFeatureFlag = z.infer<typeof insertFeatureFlagSchema>;
export type FeatureFlag = typeof featureFlags.$inferSelect;

// ============================================================================
// LIVE CHAT SUPPORT SYSTEM
// ============================================================================

// Chat Conversations - Track chat sessions between support and customers
export const chatConversations = pgTable("chat_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Participants
  customerId: varchar("customer_id").references(() => users.id, { onDelete: 'set null' }),
  customerName: varchar("customer_name"),
  customerEmail: varchar("customer_email"),

  supportAgentId: varchar("support_agent_id").references(() => users.id, { onDelete: 'set null' }),
  supportAgentName: varchar("support_agent_name"),

  // Conversation metadata
  subject: varchar("subject"),
  status: varchar("status").notNull().default("active"), // 'active', 'resolved', 'closed'
  priority: varchar("priority").default("normal"), // 'low', 'normal', 'high', 'urgent'
  
  // Support ticket link (for automated ticket closure)
  associatedTicketId: varchar("associated_ticket_id").references(() => supportTickets.id, { onDelete: 'set null' }),
  
  // Conversation type for privacy/monitoring
  conversationType: varchar("conversation_type").notNull().default("open_chat"), 
  // Types: 'dm_user' (user-to-user), 'dm_support' (support-to-user), 'dm_bot' (bot-to-user), 'open_chat' (CommOS/monitored), 'shift_chat' (temporary shift chatroom)
  
  // Shift-specific chatroom (auto-created on clock-in, auto-closed on clock-out)
  shiftId: varchar("shift_id").references(() => shifts.id, { onDelete: 'set null' }),
  timeEntryId: varchar("time_entry_id").references(() => timeEntries.id, { onDelete: 'set null' }),
  
  // Workroom lifecycle management (CommOS™ Workroom Upgrade)
  autoCloseAt: timestamp("auto_close_at"), // Automatic room closure timestamp (shift end, etc.)
  visibility: varchar("visibility").default("workspace"), // 'workspace', 'public', 'private'
  helpdeskTicketId: varchar("helpdesk_ticket_id").references(() => supportTickets.id, { onDelete: 'set null' }), // Link to support ticket for helpdesk DMs
  
  // Encryption metadata for private DMs
  isEncrypted: boolean("is_encrypted").default(false), // True if messages are encrypted at rest
  encryptionKeyId: varchar("encryption_key_id"), // Reference to encryption key for this conversation

  // Voice/Silence permissions (IRC-style moderation)
  isSilenced: boolean("is_silenced").default(true), // Users start silenced until support grants voice
  voiceGrantedBy: varchar("voice_granted_by").references(() => users.id, { onDelete: 'set null' }),
  voiceGrantedAt: timestamp("voice_granted_at"),

  // Ratings (post-conversation)
  rating: integer("rating"), // 1-5 stars
  feedback: text("feedback"),

  // Session tracking
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  closedAt: timestamp("closed_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Chat Messages - Individual messages in conversations
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),

  // Message details
  senderId: varchar("sender_id").references(() => users.id, { onDelete: 'set null' }),
  senderName: varchar("sender_name").notNull(),
  senderType: varchar("sender_type").notNull(), // 'customer', 'support', 'system', 'bot'

  // Content
  message: text("message").notNull(), // Plain text for open chat, encrypted for private DMs
  messageType: varchar("message_type").default("text"), // 'text', 'file', 'system'
  isSystemMessage: boolean("is_system_message").default(false), // For breach notifications and system announcements (shown in gray)
  
  // Encryption metadata
  isEncrypted: boolean("is_encrypted").default(false), // True if message content is encrypted
  encryptionIv: varchar("encryption_iv"), // Initialization vector for encryption

  // Private messages (DMs/Whispers)
  isPrivateMessage: boolean("is_private_message").default(false), // True for private/whispered messages
  recipientId: varchar("recipient_id").references(() => users.id, { onDelete: 'set null' }), // For direct messages to specific user

  // Threading support (Slack/Discord-style)
  parentMessageId: varchar("parent_message_id"), // References parent message if this is a reply
  threadId: varchar("thread_id"), // Groups messages in same thread
  replyCount: integer("reply_count").default(0), // Number of replies to this message

  // File attachments (enhanced)
  attachmentUrl: varchar("attachment_url"),
  attachmentName: varchar("attachment_name"),
  attachmentType: varchar("attachment_type"), // 'image', 'pdf', 'document', 'video'
  attachmentSize: integer("attachment_size"), // File size in bytes
  attachmentThumbnail: varchar("attachment_thumbnail"), // Thumbnail URL for images/videos

  // Rich text formatting
  isFormatted: boolean("is_formatted").default(false), // True if contains markdown/HTML
  formattedContent: text("formatted_content"), // Rendered HTML content

  // Mentions
  mentions: text("mentions").array().default(sql`ARRAY[]::text[]`), // Array of user IDs mentioned in message
  
  // Staff-only visibility (for internal announcements)
  visibleToStaffOnly: boolean("visible_to_staff_only").default(false),

  // Status
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  isEdited: boolean("is_edited").default(false),
  editedAt: timestamp("edited_at"),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // Existing indexes
  index("chat_messages_conversation_idx").on(table.conversationId),
  index("chat_messages_thread_idx").on(table.threadId),
  index("chat_messages_parent_idx").on(table.parentMessageId),
  
  // New performance indexes for chat enhancements
  index("chat_messages_conversation_created_idx").on(table.conversationId, table.createdAt), // Chronological retrieval
  index("chat_messages_sender_idx").on(table.senderId), // User message history
  index("chat_messages_unread_idx").on(table.isRead, table.createdAt), // Unread message queries
  index("chat_messages_recipient_idx").on(table.recipientId), // DM recipient lookups
]);

// Message Reactions - Slack/Discord-style emoji reactions
export const messageReactions = pgTable("message_reactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull().references(() => chatMessages.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  emoji: varchar("emoji", { length: 50 }).notNull(), // Unicode emoji or custom emoji code
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  messageUserIdx: index("message_reactions_message_user_idx").on(table.messageId, table.userId),
  uniqueReaction: uniqueIndex("message_reactions_unique").on(table.messageId, table.userId, table.emoji),
}));

// Message Read Receipts - Track who has read which messages
export const messageReadReceipts = pgTable("message_read_receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull().references(() => chatMessages.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  readAt: timestamp("read_at").defaultNow(),
}, (table) => ({
  messageUserIdx: uniqueIndex("message_read_receipts_unique").on(table.messageId, table.userId),
}));

export const insertChatConversationSchema = createInsertSchema(chatConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export const insertMessageReactionSchema = createInsertSchema(messageReactions).omit({
  id: true,
  createdAt: true,
});

export const insertMessageReadReceiptSchema = createInsertSchema(messageReadReceipts).omit({
  id: true,
  readAt: true,
});

export type InsertChatConversation = z.infer<typeof insertChatConversationSchema>;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertMessageReaction = z.infer<typeof insertMessageReactionSchema>;
export type MessageReaction = typeof messageReactions.$inferSelect;
export type InsertMessageReadReceipt = z.infer<typeof insertMessageReadReceiptSchema>;
export type MessageReadReceipt = typeof messageReadReceipts.$inferSelect;

// ============================================================================
// COMMOS™ WORKROOM UPGRADE - FILE UPLOADS, EVENTS, VOICE
// ============================================================================

// Chat Uploads - Centralized file tracking with virus scanning and retention
export const chatUploads = pgTable("chat_uploads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Uploader details
  uploaderId: varchar("uploader_id").notNull().references(() => users.id, { onDelete: 'set null' }),
  uploaderName: varchar("uploader_name").notNull(),
  
  // Link to conversation and message
  conversationId: varchar("conversation_id").references(() => chatConversations.id, { onDelete: 'cascade' }),
  messageId: varchar("message_id").references(() => chatMessages.id, { onDelete: 'cascade' }),
  
  // File metadata
  filename: varchar("filename").notNull(), // Sanitized storage filename
  originalFilename: varchar("original_filename").notNull(), // User's original filename
  mimeType: varchar("mime_type").notNull(),
  fileSize: integer("file_size").notNull(), // Bytes
  storageUrl: varchar("storage_url").notNull(), // Object storage path or URL
  thumbnailUrl: varchar("thumbnail_url"), // For images/videos
  
  // Security scanning
  isScanned: boolean("is_scanned").default(false),
  scanStatus: varchar("scan_status").default("pending"), // 'pending', 'clean', 'infected', 'error'
  scanResult: text("scan_result"), // Scan details or error message
  
  // Retention policy
  expiresAt: timestamp("expires_at"), // Auto-delete timestamp
  isDeleted: boolean("is_deleted").default(false),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id, { onDelete: 'set null' }),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("chat_uploads_conversation_idx").on(table.conversationId),
  index("chat_uploads_uploader_idx").on(table.uploaderId),
  index("chat_uploads_workspace_idx").on(table.workspaceId),
  uniqueIndex("chat_uploads_storage_unique").on(table.workspaceId, table.storageUrl),
]);

// Room Events - Audit trail for room lifecycle and moderation actions
export const roomEvents = pgTable("room_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  conversationId: varchar("conversation_id").notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  
  // Actor details
  actorId: varchar("actor_id").references(() => users.id, { onDelete: 'set null' }),
  actorName: varchar("actor_name").notNull(),
  actorRole: varchar("actor_role").notNull(), // User's role at time of action
  
  // Event details
  eventType: varchar("event_type").notNull(),
  // Types: 'room_created', 'room_closed', 'room_archived', 'user_joined', 'user_left', 
  //        'user_muted', 'user_unmuted', 'user_kicked', 'voice_granted', 'voice_revoked',
  //        'file_uploaded', 'message_deleted', 'voice_session_started', 'voice_session_ended'
  
  eventPayload: jsonb("event_payload"), // Additional structured data
  description: text("description"), // Human-readable event description
  
  // Context
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("room_events_conversation_created_idx").on(table.conversationId, table.createdAt), // Chronological replay
  index("room_events_actor_idx").on(table.actorId),
  index("room_events_type_idx").on(table.eventType),
  index("room_events_workspace_idx").on(table.workspaceId),
]);

// Room Voice Sessions - WebRTC voice chat session management
export const roomVoiceSessions = pgTable("room_voice_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  conversationId: varchar("conversation_id").notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  
  // Session details
  sessionId: varchar("session_id").notNull().unique(), // WebRTC session identifier
  status: varchar("status").notNull().default("active"), // 'active', 'ended'
  
  // Participants (JSONB for dynamic participant list)
  participants: jsonb("participants").notNull().default('[]'), // [{userId, userName, joinedAt, leftAt, isMuted, isSpeaking}]
  activeParticipantCount: integer("active_participant_count").default(0),
  
  // Session lifecycle
  startedBy: varchar("started_by").notNull().references(() => users.id, { onDelete: 'set null' }),
  startedByName: varchar("started_by_name").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  
  endedBy: varchar("ended_by").references(() => users.id, { onDelete: 'set null' }),
  endedByName: varchar("ended_by_name"),
  endedAt: timestamp("ended_at"),
  
  // Recording (opt-in compliance)
  isRecorded: boolean("is_recorded").default(false),
  recordingUrl: varchar("recording_url"),
  recordingConsent: jsonb("recording_consent"), // {userId: consentGiven} map
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("room_voice_sessions_conversation_idx").on(table.conversationId),
  index("room_voice_sessions_status_idx").on(table.status),
  index("room_voice_sessions_workspace_idx").on(table.workspaceId),
]);

export const insertChatUploadSchema = createInsertSchema(chatUploads).omit({
  id: true,
  createdAt: true,
});

export const insertRoomEventSchema = createInsertSchema(roomEvents).omit({
  id: true,
  createdAt: true,
});

export const insertRoomVoiceSessionSchema = createInsertSchema(roomVoiceSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertChatUpload = z.infer<typeof insertChatUploadSchema>;
export type ChatUpload = typeof chatUploads.$inferSelect;
export type InsertRoomEvent = z.infer<typeof insertRoomEventSchema>;
export type RoomEvent = typeof roomEvents.$inferSelect;
export type InsertRoomVoiceSession = z.infer<typeof insertRoomVoiceSessionSchema>;
export type RoomVoiceSession = typeof roomVoiceSessions.$inferSelect;

// ============================================================================
// DM AUDIT & INVESTIGATION SYSTEM
// ============================================================================

// DM Audit Requests - Track formal requests to access encrypted DM conversations
export const dmAuditRequests = pgTable("dm_audit_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Investigation details
  conversationId: varchar("conversation_id").notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  investigationReason: text("investigation_reason").notNull(), // Legal/compliance reason for access
  caseNumber: varchar("case_number"), // Optional case/ticket reference
  
  // Request details
  requestedBy: varchar("requested_by").notNull().references(() => users.id, { onDelete: 'set null' }),
  requestedByName: varchar("requested_by_name").notNull(),
  requestedByEmail: varchar("requested_by_email").notNull(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  
  // Approval workflow
  status: varchar("status").notNull().default("pending"), // 'pending', 'approved', 'denied'
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: 'set null' }),
  approvedByName: varchar("approved_by_name"),
  approvedAt: timestamp("approved_at"),
  deniedReason: text("denied_reason"),
  
  // Access control
  expiresAt: timestamp("expires_at"), // When access expires
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// DM Access Logs - Immutable audit trail of who accessed encrypted DMs and when
export const dmAccessLogs = pgTable("dm_access_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // What was accessed
  conversationId: varchar("conversation_id").notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  auditRequestId: varchar("audit_request_id").references(() => dmAuditRequests.id, { onDelete: 'set null' }),
  
  // Who accessed
  accessedBy: varchar("accessed_by").notNull().references(() => users.id, { onDelete: 'set null' }),
  accessedByName: varchar("accessed_by_name").notNull(),
  accessedByEmail: varchar("accessed_by_email").notNull(),
  accessedByRole: varchar("accessed_by_role").notNull(), // 'owner', 'admin', 'compliance_officer'
  
  // When and why
  accessedAt: timestamp("accessed_at").defaultNow().notNull(),
  accessReason: text("access_reason").notNull(), // Copy of investigation reason
  
  // Context
  ipAddress: varchar("ip_address"),
  userAgent: varchar("user_agent"),
  
  // Metadata
  messagesViewed: integer("messages_viewed").default(0), // Count of messages decrypted
  filesAccessed: integer("files_accessed").default(0), // Count of files accessed
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDmAuditRequestSchema = createInsertSchema(dmAuditRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDmAccessLogSchema = createInsertSchema(dmAccessLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertDmAuditRequest = z.infer<typeof insertDmAuditRequestSchema>;
export type DmAuditRequest = typeof dmAuditRequests.$inferSelect;
export type InsertDmAccessLog = z.infer<typeof insertDmAccessLogSchema>;
export type DmAccessLog = typeof dmAccessLogs.$inferSelect;

// Encryption Keys - Persistent storage for conversation encryption keys
export const conversationEncryptionKeys = pgTable("conversation_encryption_keys", {
  id: varchar("id").primaryKey(), // Key ID (UUID)
  conversationId: varchar("conversation_id").notNull().unique().references(() => chatConversations.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Encrypted key material (wrapped with master key in production)
  keyMaterial: text("key_material").notNull(), // Base64-encoded encryption key
  algorithm: varchar("algorithm").notNull().default("aes-256-gcm"),
  
  // Key metadata
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
  
  // Key rotation support
  isActive: boolean("is_active").default(true),
  rotatedAt: timestamp("rotated_at"),
  replacedBy: varchar("replaced_by"),
});

export const insertConversationEncryptionKeySchema = createInsertSchema(conversationEncryptionKeys).omit({
  createdAt: true,
});

export type InsertConversationEncryptionKey = z.infer<typeof insertConversationEncryptionKeySchema>;
export type ConversationEncryptionKey = typeof conversationEncryptionKeys.$inferSelect;

// ============================================================================
// CHAT PARTICIPANTS - Group chat membership management
// ============================================================================

export const chatParticipants = pgTable("chat_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Participant info
  participantId: varchar("participant_id").notNull().references(() => users.id, { onDelete: 'cascade' }), // Employee or manager
  participantName: varchar("participant_name").notNull(),
  participantEmail: varchar("participant_email"),
  participantRole: varchar("participant_role").notNull().default("member"), // 'owner', 'admin', 'member', 'guest'
  
  // Permissions
  canSendMessages: boolean("can_send_messages").default(true),
  canViewHistory: boolean("can_view_history").default(true),
  canInviteOthers: boolean("can_invite_others").default(false),
  
  // Invitation details
  invitedBy: varchar("invited_by").references(() => users.id, { onDelete: 'set null' }),
  invitedAt: timestamp("invited_at").defaultNow(),
  joinedAt: timestamp("joined_at"),
  leftAt: timestamp("left_at"),
  
  // UI state (for multi-bubble chat interface)
  isMinimized: boolean("is_minimized").default(false), // Is chat minimized to a bubble?
  bubblePosition: integer("bubble_position"), // Order in bubble tray
  lastReadAt: timestamp("last_read_at"), // Last message read timestamp
  isMuted: boolean("is_muted").default(false), // Has muted notifications?
  
  // Status
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================================
// CHAT GUEST TOKENS - Customer invitations (non-user access)
// ============================================================================

export const chatGuestTokens = pgTable("chat_guest_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Guest identity
  guestName: varchar("guest_name"),
  guestEmail: varchar("guest_email"),
  guestPhone: varchar("guest_phone"),
  
  // Access token
  accessToken: varchar("access_token").notNull().unique(), // Short-lived token for guest access
  tokenType: varchar("token_type").notNull().default("email"), // 'email', 'sms', 'link'
  
  // Permissions & scope
  canSendMessages: boolean("can_send_messages").default(true),
  canViewFiles: boolean("can_view_files").default(true),
  canUploadFiles: boolean("can_upload_files").default(true),
  scopeDescription: text("scope_description"), // What the guest can see/do
  
  // Invitation details
  invitedBy: varchar("invited_by").notNull().references(() => users.id, { onDelete: 'set null' }),
  invitedByName: varchar("invited_by_name").notNull(),
  invitationMessage: text("invitation_message"),
  
  // Token lifecycle
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(), // Usually 7-30 days
  lastAccessedAt: timestamp("last_accessed_at"),
  revokedAt: timestamp("revoked_at"),
  revokedBy: varchar("revoked_by").references(() => users.id, { onDelete: 'set null' }),
  revokedReason: text("revoked_reason"),
  
  // Status
  isActive: boolean("is_active").default(true),
  accessCount: integer("access_count").default(0), // Track usage
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertChatParticipantSchema = createInsertSchema(chatParticipants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatGuestTokenSchema = createInsertSchema(chatGuestTokens).omit({
  id: true,
  createdAt: true,
});

export type InsertChatParticipant = z.infer<typeof insertChatParticipantSchema>;
export type ChatParticipant = typeof chatParticipants.$inferSelect;
export type InsertChatGuestToken = z.infer<typeof insertChatGuestTokenSchema>;
export type ChatGuestToken = typeof chatGuestTokens.$inferSelect;

// Terms Acknowledgments - Legal compliance tracking for support chat access
export const termsAcknowledgments = pgTable("terms_acknowledgments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Link to conversation/ticket
  conversationId: varchar("conversation_id").references(() => chatConversations.id, { onDelete: 'cascade' }),
  ticketNumber: varchar("ticket_number"), // Associated ticket if any

  // User identification
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  userName: varchar("user_name").notNull(),
  userEmail: varchar("user_email").notNull(),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'set null' }),

  // E-Signature (initials)
  initialsProvided: varchar("initials_provided").notNull(), // User's initials as e-signature

  // Acceptance details
  acceptedTermsVersion: varchar("accepted_terms_version").default("1.0"), // Track version of terms
  acceptedAt: timestamp("accepted_at").defaultNow().notNull(),

  // Audit trail
  ipAddress: varchar("ip_address"), // IP at time of acceptance
  userAgent: varchar("user_agent"), // Browser info

  // Linked to ticket lifecycle
  ticketClosedAt: timestamp("ticket_closed_at"), // When associated ticket was closed
  isArchived: boolean("is_archived").default(false), // For long-term storage

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTermsAcknowledgmentSchema = createInsertSchema(termsAcknowledgments).omit({
  id: true,
  createdAt: true,
  acceptedAt: true,
});

export type InsertTermsAcknowledgment = z.infer<typeof insertTermsAcknowledgmentSchema>;
export type TermsAcknowledgment = typeof termsAcknowledgments.$inferSelect;

// HelpOS Queue Management - AI-powered support queue
export const helpOsQueue = pgTable("help_os_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // User identification
  conversationId: varchar("conversation_id").notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  ticketNumber: varchar("ticket_number").notNull(), // TKT-XXXXXX
  userName: varchar("user_name").notNull(),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),

  // Queue position & timing
  queuePosition: integer("queue_position"), // Calculated position in line
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  estimatedWaitMinutes: integer("estimated_wait_minutes"),

  // Priority scoring (0-100)
  priorityScore: integer("priority_score").default(0).notNull(),
  waitTimeScore: integer("wait_time_score").default(0), // Based on how long waiting
  tierScore: integer("tier_score").default(0), // Subscriber tier bonus
  specialNeedsScore: integer("special_needs_score").default(0), // ADA/accessibility
  ownershipScore: integer("ownership_score").default(0), // Organization owner/POC

  // User metadata for prioritization
  subscriptionTier: varchar("subscription_tier").default("free"), // from workspace
  hasSpecialNeeds: boolean("has_special_needs").default(false), // ADA claim
  isOwner: boolean("is_owner").default(false), // Workspace owner
  isPOC: boolean("is_poc").default(false), // Point of contact

  // Announcement tracking
  lastAnnouncementAt: timestamp("last_announcement_at"),
  announcementCount: integer("announcement_count").default(0),
  hasReceivedWelcome: boolean("has_received_welcome").default(false),

  // Status
  status: varchar("status").default("waiting"), // 'waiting', 'being_helped', 'resolved', 'abandoned'
  assignedStaffId: varchar("assigned_staff_id").references(() => users.id, { onDelete: 'set null' }),
  assignedAt: timestamp("assigned_at"),
  resolvedAt: timestamp("resolved_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertHelpOsQueueSchema = createInsertSchema(helpOsQueue).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertHelpOsQueue = z.infer<typeof insertHelpOsQueueSchema>;
export type HelpOsQueueEntry = typeof helpOsQueue.$inferSelect;

// Abuse Violations - Track verbal abuse and protect support staff
export const abuseViolations = pgTable("abuse_violations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // User & conversation tracking
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  conversationId: varchar("conversation_id").notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  messageId: varchar("message_id").references(() => chatMessages.id, { onDelete: 'set null' }),

  // Violation details
  violationType: varchar("violation_type").notNull(), // 'profanity', 'threat', 'harassment', 'hate_speech'
  severity: varchar("severity").notNull(), // 'low', 'medium', 'high'
  detectedPatterns: text("detected_patterns").array(), // Matched abuse patterns
  originalMessage: text("original_message").notNull(), // The abusive message

  // Action taken
  action: varchar("action").notNull(), // 'warn', 'kick', 'ban'
  warningMessage: text("warning_message"), // Message shown to user

  // Staff involvement
  detectedBy: varchar("detected_by").default("system"), // 'system' or staff user ID
  actionTakenBy: varchar("action_taken_by").references(() => users.id, { onDelete: 'set null' }),

  // Violation count for this user (denormalized for quick access)
  userViolationCount: integer("user_violation_count").default(1).notNull(),

  // Ban tracking
  isBanned: boolean("is_banned").default(false),
  bannedUntil: timestamp("banned_until"), // Temporary ban expiry, null for permanent
  banReason: text("ban_reason"),

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAbuseViolationSchema = createInsertSchema(abuseViolations).omit({
  id: true,
  createdAt: true,
});

export type InsertAbuseViolation = z.infer<typeof insertAbuseViolationSchema>;
export type AbuseViolation = typeof abuseViolations.$inferSelect;

// ============================================================================
// SALES & MARKETING AUTOMATION SYSTEM
// ============================================================================

// Lead Management - Prospect database for sales outreach
export const leads = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Company information
  companyName: varchar("company_name").notNull(),
  industry: varchar("industry"), // 'security', 'healthcare', 'cleaning', 'construction', 'property_management', etc.
  companyWebsite: varchar("company_website"),
  estimatedEmployees: integer("estimated_employees"),

  // Contact information
  contactName: varchar("contact_name"),
  contactTitle: varchar("contact_title"),
  contactEmail: varchar("contact_email").notNull(),
  contactPhone: varchar("contact_phone"),

  // Lead scoring & qualification
  leadStatus: varchar("lead_status").default("new"), // 'new', 'contacted', 'qualified', 'demo_scheduled', 'proposal_sent', 'won', 'lost'
  leadScore: integer("lead_score").default(0), // 0-100
  estimatedValue: decimal("estimated_value", { precision: 10, scale: 2 }),

  // Campaign tracking
  source: varchar("source"), // 'manual', 'linkedin', 'email_campaign', 'web_form', 'referral'
  lastCampaignId: varchar("last_campaign_id"),
  lastContactedAt: timestamp("last_contacted_at"),

  // Notes & follow-up
  notes: text("notes"),
  nextFollowUpDate: timestamp("next_follow_up_date"),
  assignedTo: varchar("assigned_to"), // Platform admin user ID

  // Conversion tracking
  convertedToWorkspaceId: varchar("converted_to_workspace_id").references(() => workspaces.id, { onDelete: 'set null' }),
  convertedAt: timestamp("converted_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Email Templates - Industry-specific templates with AI personalization
export const emailTemplates = pgTable("email_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Template metadata
  name: varchar("name").notNull(),
  targetIndustry: varchar("target_industry"), // 'security', 'healthcare', 'cleaning', etc. (null = general)
  category: varchar("category").notNull(), // 'cold_outreach', 'follow_up', 'demo_invitation', 'proposal', 'nurture'

  // Email content
  subject: varchar("subject").notNull(),
  bodyTemplate: text("body_template").notNull(), // Supports {{variables}} for personalization

  // AI personalization
  useAI: boolean("use_ai").default(true), // Use OpenAI to personalize
  aiPrompt: text("ai_prompt"), // Instructions for AI personalization

  // Status
  isActive: boolean("is_active").default(true),

  // Performance metrics
  timesSent: integer("times_sent").default(0),
  openRate: decimal("open_rate", { precision: 5, scale: 2 }),
  responseRate: decimal("response_rate", { precision: 5, scale: 2 }),

  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Email Campaigns - Track bulk email sends
export const emailCampaigns = pgTable("email_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Campaign details
  name: varchar("name").notNull(),
  templateId: varchar("template_id").notNull().references(() => emailTemplates.id, { onDelete: 'restrict' }),
  targetIndustry: varchar("target_industry"), // Filter leads by industry

  // Campaign status
  status: varchar("status").default("draft"), // 'draft', 'scheduled', 'sending', 'sent', 'paused'
  scheduledFor: timestamp("scheduled_for"),

  // Targeting criteria
  leadFilters: jsonb("lead_filters"), // Store advanced filtering criteria

  // Performance metrics
  totalSent: integer("total_sent").default(0),
  totalOpened: integer("total_opened").default(0),
  totalClicked: integer("total_clicked").default(0),
  totalReplied: integer("total_replied").default(0),
  totalBounced: integer("total_bounced").default(0),

  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Email Sends - Individual email tracking
export const emailSends = pgTable("email_sends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Relationships
  campaignId: varchar("campaign_id").references(() => emailCampaigns.id, { onDelete: 'cascade' }),
  leadId: varchar("lead_id").notNull().references(() => leads.id, { onDelete: 'cascade' }),
  templateId: varchar("template_id").notNull().references(() => emailTemplates.id, { onDelete: 'restrict' }),

  // Email details
  toEmail: varchar("to_email").notNull(),
  subject: varchar("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text"),

  // Delivery status
  status: varchar("status").default("pending"), // 'pending', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'failed'

  // Tracking
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  repliedAt: timestamp("replied_at"),

  // External IDs (from email service provider)
  externalId: varchar("external_id"), // Resend message ID
  errorMessage: text("error_message"),

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEmailCampaignSchema = createInsertSchema(emailCampaigns).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const insertEmailSendSchema = createInsertSchema(emailSends).omit({
  id: true,
  createdAt: true,
});

export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailCampaign = z.infer<typeof insertEmailCampaignSchema>;
export type EmailCampaign = typeof emailCampaigns.$inferSelect;
export type InsertEmailSend = z.infer<typeof insertEmailSendSchema>;
export type EmailSend = typeof emailSends.$inferSelect;

// ============================================================================
// SALES MVP: DEALOS™ + BIDOS™ - CRM & PROCUREMENT SYSTEM
// ============================================================================

// Deals/Opportunities - Sales pipeline management
export const deals = pgTable("deals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Deal identification
  dealName: varchar("deal_name").notNull(),
  companyName: varchar("company_name").notNull(),

  // Relationships
  leadId: varchar("lead_id").references(() => leads.id, { onDelete: 'set null' }),
  rfpId: varchar("rfp_id"),

  // Pipeline stage
  stage: varchar("stage").default("prospect").notNull(), // 'prospect', 'qualified', 'rfp_identified', 'proposal_sent', 'negotiation', 'awarded', 'lost'

  // Deal value
  estimatedValue: decimal("estimated_value", { precision: 12, scale: 2 }),
  probability: integer("probability").default(50), // 0-100%
  expectedCloseDate: timestamp("expected_close_date"),
  actualCloseDate: timestamp("actual_close_date"),

  // Assignment
  ownerId: varchar("owner_id"), // Platform admin/sales rep user ID

  // Status
  status: varchar("status").default("active"), // 'active', 'won', 'lost'
  lostReason: text("lost_reason"),

  // Notes
  notes: text("notes"),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// RFPs - Request for Proposal database
export const rfps = pgTable("rfps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // RFP identification
  title: varchar("title").notNull(),
  rfpNumber: varchar("rfp_number"),
  buyer: varchar("buyer").notNull(), // Issuing organization

  // Source
  sourceUrl: varchar("source_url"),
  source: varchar("source").default("manual"), // 'sam_gov', 'state_portal', 'manual', etc.

  // Dates
  postedDate: timestamp("posted_date"),
  dueDate: timestamp("due_date"),

  // Details
  estimatedValue: decimal("estimated_value", { precision: 12, scale: 2 }),
  industry: varchar("industry"), // 'security', 'healthcare', 'cleaning', etc.
  location: varchar("location"),

  // AI Analysis
  aiSummary: text("ai_summary"), // AI-generated summary
  scopeOfWork: text("scope_of_work"),
  requirements: jsonb("requirements"), // Parsed requirements
  redFlags: text("red_flags").array().default(sql`ARRAY[]::text[]`), // Issues identified by AI

  // Status
  status: varchar("status").default("active"), // 'active', 'pursuing', 'submitted', 'declined', 'expired'

  // Deduplication
  contentHash: varchar("content_hash"), // For duplicate detection

  // Relationships
  assignedTo: varchar("assigned_to"), // Platform admin/sales rep
  dealId: varchar("deal_id").references(() => deals.id, { onDelete: 'set null' }),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Proposals - Track proposal documents
export const proposals = pgTable("proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Relationships
  dealId: varchar("deal_id").notNull().references(() => deals.id, { onDelete: 'cascade' }),
  rfpId: varchar("rfp_id").references(() => rfps.id, { onDelete: 'set null' }),

  // Proposal details
  proposalName: varchar("proposal_name").notNull(),
  version: integer("version").default(1),

  // Content
  sections: jsonb("sections"), // Proposal sections as JSON
  fileUrl: varchar("file_url"), // PDF/DOCX file location

  // Status
  status: varchar("status").default("draft"), // 'draft', 'review', 'submitted', 'won', 'lost'
  submittedAt: timestamp("submitted_at"),

  // Metadata
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Contacts - Point of contact database (separate from leads)
export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Contact info
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  fullName: varchar("full_name").notNull(),
  email: varchar("email").notNull(),
  phone: varchar("phone"),
  title: varchar("title"),

  // Company
  companyName: varchar("company_name").notNull(),
  companyDomain: varchar("company_domain"),

  // Source & confidence
  source: varchar("source").default("manual"), // 'manual', 'enrichment', 'linkedin', etc.
  confidenceScore: integer("confidence_score").default(50), // 0-100%

  // Consent tracking
  consentGiven: boolean("consent_given").default(false),
  consentSource: varchar("consent_source"),
  consentDate: timestamp("consent_date"),

  // Status
  status: varchar("status").default("active"), // 'active', 'bounced', 'unsubscribed', 'invalid'

  // Relationships
  leadId: varchar("lead_id").references(() => leads.id, { onDelete: 'set null' }),

  // Notes
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Email Sequences - Multi-step email campaigns
export const emailSequences = pgTable("email_sequences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Sequence details
  name: varchar("name").notNull(),
  description: text("description"),

  // Steps configuration
  steps: jsonb("steps").notNull(), // Array of {delay_days, template_id, subject, body}

  // Targeting
  targetIndustry: varchar("target_industry"),

  // Throttling
  dailySendLimit: integer("daily_send_limit").default(100),
  sendWindow: jsonb("send_window"), // {start_hour: 9, end_hour: 17}

  // Status
  status: varchar("status").default("active"), // 'active', 'paused', 'archived'

  // Performance
  totalEnrolled: integer("total_enrolled").default(0),
  totalCompleted: integer("total_completed").default(0),

  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Sequence Sends - Track individual sequence execution
export const sequenceSends = pgTable("sequence_sends", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Relationships
  sequenceId: varchar("sequence_id").notNull().references(() => emailSequences.id, { onDelete: 'cascade' }),
  leadId: varchar("lead_id").references(() => leads.id, { onDelete: 'cascade' }),
  dealId: varchar("deal_id").references(() => deals.id, { onDelete: 'cascade' }),

  // Step tracking
  currentStep: integer("current_step").default(1),
  totalSteps: integer("total_steps").notNull(),

  // Status
  status: varchar("status").default("active"), // 'active', 'completed', 'paused', 'replied', 'unsubscribed'

  // Email tracking
  lastSentAt: timestamp("last_sent_at"),
  nextSendAt: timestamp("next_send_at"),

  // Engagement
  replied: boolean("replied").default(false),
  repliedAt: timestamp("replied_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tasks - Deal-related tasks and reminders
export const dealTasks = pgTable("deal_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Task details
  title: varchar("title").notNull(),
  description: text("description"),

  // Relationships
  dealId: varchar("deal_id").references(() => deals.id, { onDelete: 'cascade' }),
  rfpId: varchar("rfp_id").references(() => rfps.id, { onDelete: 'cascade' }),

  // Assignment
  assignedTo: varchar("assigned_to"),

  // Due date & SLA
  dueDate: timestamp("due_date"),
  priority: varchar("priority").default("medium"), // 'low', 'medium', 'high', 'urgent'

  // Status
  status: varchar("status").default("pending"), // 'pending', 'in_progress', 'completed', 'cancelled'
  completedAt: timestamp("completed_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas
export const insertDealSchema = createInsertSchema(deals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRfpSchema = createInsertSchema(rfps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProposalSchema = createInsertSchema(proposals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEmailSequenceSchema = createInsertSchema(emailSequences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSequenceSendSchema = createInsertSchema(sequenceSends).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDealTaskSchema = createInsertSchema(dealTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type InsertDeal = z.infer<typeof insertDealSchema>;
export type Deal = typeof deals.$inferSelect;
export type InsertRfp = z.infer<typeof insertRfpSchema>;
export type Rfp = typeof rfps.$inferSelect;
export type InsertProposal = z.infer<typeof insertProposalSchema>;
export type Proposal = typeof proposals.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;
export type InsertEmailSequence = z.infer<typeof insertEmailSequenceSchema>;
export type EmailSequence = typeof emailSequences.$inferSelect;
export type InsertSequenceSend = z.infer<typeof insertSequenceSendSchema>;
export type SequenceSend = typeof sequenceSends.$inferSelect;
export type InsertDealTask = z.infer<typeof insertDealTaskSchema>;
export type DealTask = typeof dealTasks.$inferSelect;

// ============================================================================
// HELPDESK SYSTEM - PROFESSIONAL SUPPORT CHAT ROOMS
// ============================================================================

// Support Rooms - Persistent chatrooms with status management
export const supportRooms = pgTable("support_rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Room identification
  slug: varchar("slug").notNull().unique(), // 'helpdesk', 'emergency', etc.
  name: varchar("name").notNull(), // 'HelpDesk', 'Emergency Support'
  description: text("description"), // 'Professional platform support'

  // Room status (controls access and visibility)
  status: varchar("status").default("open"), // 'open' (green), 'closed' (red), 'maintenance'
  statusMessage: text("status_message"), // Custom message when closed

  // Workspace scope (null = platform-wide room)
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),

  // Associated chat conversation
  conversationId: varchar("conversation_id").references(() => chatConversations.id, { onDelete: 'cascade' }),

  // Access control
  requiresTicket: boolean("requires_ticket").default(false), // Clients need verified ticket
  allowedRoles: jsonb("allowed_roles"), // ['platform_admin', 'support_staff', 'deputy_admin']

  // Status tracking
  lastStatusChange: timestamp("last_status_change").defaultNow(),
  statusChangedBy: varchar("status_changed_by").references(() => users.id), // Support staff who toggled

  // Metadata
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSupportRoomSchema = createInsertSchema(supportRooms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSupportRoom = z.infer<typeof insertSupportRoomSchema>;
export type SupportRoom = typeof supportRooms.$inferSelect;

// Support Ticket Access - Tracks verified ticket holders' chatroom access
export const supportTicketAccess = pgTable("support_ticket_access", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Relationships
  ticketId: varchar("ticket_id").notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  roomId: varchar("room_id").notNull().references(() => supportRooms.id, { onDelete: 'cascade' }),

  // Access control
  grantedBy: varchar("granted_by").notNull().references(() => users.id), // Support staff who verified
  expiresAt: timestamp("expires_at").notNull(), // Time-limited access (e.g., 24-48 hours)

  // Usage tracking
  joinCount: integer("join_count").default(0),
  lastJoinedAt: timestamp("last_joined_at"),

  // Status
  isRevoked: boolean("is_revoked").default(false),
  revokedAt: timestamp("revoked_at"),
  revokedBy: varchar("revoked_by").references(() => users.id),
  revokedReason: text("revoked_reason"),

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSupportTicketAccessSchema = createInsertSchema(supportTicketAccess).omit({
  id: true,
  createdAt: true,
});

export type InsertSupportTicketAccess = z.infer<typeof insertSupportTicketAccessSchema>;
export type SupportTicketAccess = typeof supportTicketAccess.$inferSelect;

// AI Usage Logs - Track AI costs for subscriber billing (they pay, we don't)
export const aiUsageLogs = pgTable("ai_usage_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Relationships
  conversationId: varchar("conversation_id").notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),

  // AI request details
  messageId: varchar("message_id").references(() => chatMessages.id, { onDelete: 'set null' }),
  requestType: varchar("request_type").notNull(), // 'greeting', 'question', 'followup'
  model: varchar("model").notNull(), // 'gpt-4o-mini', 'gpt-4o', etc.

  // Token usage (for cost calculation)
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),

  // Cost tracking (USD, subscriber pays)
  promptCost: decimal("prompt_cost", { precision: 10, scale: 6 }).notNull().default("0"), // Cost per prompt token
  completionCost: decimal("completion_cost", { precision: 10, scale: 6 }).notNull().default("0"), // Cost per completion token
  totalCost: decimal("total_cost", { precision: 10, scale: 6 }).notNull().default("0"), // Total cost in USD

  // User tier tracking (for limits)
  userTier: varchar("user_tier").notNull(), // 'free_guest', 'subscriber'
  usageCount: integer("usage_count").notNull(), // Response number for this user (1st, 2nd, 3rd, etc.)

  // Billing period
  billingMonth: varchar("billing_month").notNull(), // 'YYYY-MM' format for monthly billing

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAiUsageLogSchema = createInsertSchema(aiUsageLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertAiUsageLog = z.infer<typeof insertAiUsageLogSchema>;
export type AiUsageLog = typeof aiUsageLogs.$inferSelect;

// ============================================================================
// HELPDESK - Message of the Day (MOTD)
// ============================================================================

export const motdMessages = pgTable("motd_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Content
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),

  // Display settings
  isActive: boolean("is_active").default(true),
  requiresAcknowledgment: boolean("requires_acknowledgment").default(true),
  displayOrder: integer("display_order").default(0), // For multiple MOTD priority

  // Styling
  backgroundColor: varchar("background_color").default("#1e3a8a"), // Navy blue default
  textColor: varchar("text_color").default("#ffffff"), // White text default
  iconName: varchar("icon_name").default("bell"), // Lucide icon name

  // Scheduling (optional)
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),

  // Staff info
  createdBy: varchar("created_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMotdMessageSchema = createInsertSchema(motdMessages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMotdMessage = z.infer<typeof insertMotdMessageSchema>;
export type MotdMessage = typeof motdMessages.$inferSelect;

// Track user acknowledgments
export const motdAcknowledgment = pgTable("motd_acknowledgments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  motdId: varchar("motd_id").notNull().references(() => motdMessages.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),

  acknowledgedAt: timestamp("acknowledged_at").defaultNow(),
});

export const insertMotdAcknowledgmentSchema = createInsertSchema(motdAcknowledgment).omit({
  id: true,
  acknowledgedAt: true,
});

export type InsertMotdAcknowledgment = z.infer<typeof insertMotdAcknowledgmentSchema>;
export type MotdAcknowledgment = typeof motdAcknowledgment.$inferSelect;

// ============================================================================
// CHAT AGREEMENT ACCEPTANCES - Terms & Conditions for HelpDesk Access
// ============================================================================

export const chatAgreementAcceptances = pgTable("chat_agreement_acceptances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // User/Ticket tracking
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  ticketId: varchar("ticket_id").references(() => supportTickets.id, { onDelete: 'cascade' }),
  sessionId: varchar("session_id"), // Browser session tracking

  // Agreement details
  agreementVersion: varchar("agreement_version").notNull().default("1.0"), // Track version changes
  fullName: varchar("full_name"), // Typed signature name (optional)
  agreedToTerms: boolean("agreed_to_terms").notNull().default(false),

  // Evidence tracking (compliance vault)
  ipAddress: varchar("ip_address"), // User's IP at time of acceptance
  userAgent: text("user_agent"), // Browser/device info
  acceptedAt: timestamp("accepted_at").defaultNow(),

  // Chat context
  roomSlug: varchar("room_slug").notNull(), // 'helpdesk', 'emergency', etc.
  platformRole: varchar("platform_role"), // User's role at time of acceptance

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertChatAgreementAcceptanceSchema = createInsertSchema(chatAgreementAcceptances).omit({
  id: true,
  acceptedAt: true,
  createdAt: true,
});

export type InsertChatAgreementAcceptance = z.infer<typeof insertChatAgreementAcceptanceSchema>;
export type ChatAgreementAcceptance = typeof chatAgreementAcceptances.$inferSelect;

// ============================================================================
// PREDICTIONOS™ - AI-POWERED PREDICTIVE ANALYTICS (MONOPOLISTIC FEATURE #1)
// ============================================================================

// Employee turnover risk scores (90-day flight risk predictions)
export const turnoverRiskScores = pgTable("turnover_risk_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),

  // Risk scoring
  riskScore: decimal("risk_score", { precision: 5, scale: 2 }).notNull(), // 0-100% probability
  riskLevel: varchar("risk_level").notNull(), // 'low', 'medium', 'high', 'critical'
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }), // ML model confidence

  // Prediction details
  predictionPeriod: integer("prediction_period").default(90), // Days (default: 90-day window)
  predictedTurnoverDate: timestamp("predicted_turnover_date"),

  // Cost impact
  replacementCost: decimal("replacement_cost", { precision: 10, scale: 2 }), // Estimated cost to replace
  trainingCost: decimal("training_cost", { precision: 10, scale: 2 }),
  lostProductivityCost: decimal("lost_productivity_cost", { precision: 10, scale: 2 }),
  totalTurnoverCost: decimal("total_turnover_cost", { precision: 10, scale: 2 }),

  // Risk factors (AI-identified)
  riskFactors: jsonb("risk_factors"), // { low_hours: 0.3, supervisor_rejections: 0.4, tardiness: 0.3 }
  recommendations: text("recommendations"), // AI-generated retention strategies

  // Model metadata
  aiModel: varchar("ai_model").default("gpt-4"), // Model used for prediction
  dataPointsUsed: integer("data_points_used"), // Number of historical records analyzed
  analysisDate: timestamp("analysis_date").defaultNow(),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueEmployeeAnalysis: uniqueIndex("unique_employee_current_prediction").on(table.employeeId, table.analysisDate),
}));

export const insertTurnoverRiskScoreSchema = createInsertSchema(turnoverRiskScores).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTurnoverRiskScore = z.infer<typeof insertTurnoverRiskScoreSchema>;
export type TurnoverRiskScore = typeof turnoverRiskScores.$inferSelect;

// Schedule cost variance predictions (labor cost overrun detection)
export const costVariancePredictions = pgTable("cost_variance_predictions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  shiftId: varchar("shift_id").references(() => shifts.id, { onDelete: 'cascade' }),

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

export const insertCostVariancePredictionSchema = createInsertSchema(costVariancePredictions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCostVariancePrediction = z.infer<typeof insertCostVariancePredictionSchema>;
export type CostVariancePrediction = typeof costVariancePredictions.$inferSelect;

// ============================================================================
// CUSTOM WORKFLOW RULES - VISUAL RULE BUILDER (MONOPOLISTIC FEATURE #2)
// ============================================================================

export const ruleTypeEnum = pgEnum('rule_type', ['payroll', 'scheduling', 'time_tracking', 'billing']);
export const ruleStatusEnum = pgEnum('rule_status', ['active', 'inactive', 'testing']);

export const customRules = pgTable("custom_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Rule identification
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  ruleType: ruleTypeEnum("rule_type").notNull(),
  priority: integer("priority").default(0), // Execution order (higher = runs first)

  // Rule definition (IF/THEN logic as JSON)
  trigger: varchar("trigger").notNull(), // 'time_clock_out', 'payroll_calculate', 'schedule_create', etc.
  conditions: jsonb("conditions").notNull(), // { field: 'hours', operator: '>', value: 10 }
  actions: jsonb("actions").notNull(), // { action: 'send_alert', params: { ... } }
  conditionLogic: varchar("condition_logic", { length: 3 }).default("AND"), // "AND" or "OR" for combining conditions

  // Example: Overtime rule
  // {
  //   trigger: 'payroll_calculate',
  //   conditions: { state: 'TX', classification: 'Rigger', hours: { $gt: 40 } },
  //   actions: { rateMultiplier: 1.5 }
  // }

  // Status & control
  status: ruleStatusEnum("status").default("active"),
  isLocked: boolean("is_locked").default(false), // Prevent accidental editing

  // Execution tracking
  executionCount: integer("execution_count").default(0),
  lastExecutedAt: timestamp("last_executed_at"),
  errorCount: integer("error_count").default(0),
  lastError: text("last_error"),

  // Audit trail
  createdBy: varchar("created_by").references(() => users.id),
  updatedBy: timestamp("updated_by").references(() => users.id),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCustomRuleSchema = createInsertSchema(customRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCustomRule = z.infer<typeof insertCustomRuleSchema>;
export type CustomRule = typeof customRules.$inferSelect;

// Rule execution logs (for debugging and compliance)
export const ruleExecutionLogs = pgTable("rule_execution_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ruleId: varchar("rule_id").notNull().references(() => customRules.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Execution context
  triggerEvent: varchar("trigger_event").notNull(),
  entityType: varchar("entity_type"), // 'payroll_entry', 'shift', 'time_entry'
  entityId: varchar("entity_id"),

  // Execution results
  conditionsMet: boolean("conditions_met").notNull(),
  actionsExecuted: jsonb("actions_executed"), // What actions were taken
  executionTimeMs: integer("execution_time_ms"),

  // Error handling
  success: boolean("success").default(true),
  errorMessage: text("error_message"),

  createdAt: timestamp("created_at").defaultNow(),
});

export type RuleExecutionLog = typeof ruleExecutionLogs.$inferSelect;

// ============================================================================
// GEO-COMPLIANCE & AUDIT TRAIL (Monopolistic Feature #3)
// ============================================================================

// Comprehensive audit trail for all critical changes (PayrollOS™ & TimeOS™)
export const auditTrail = pgTable("audit_trail", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Actor information
  userId: varchar("user_id").references(() => users.id),
  userName: varchar("user_name").notNull(),
  userRole: varchar("user_role").notNull(), // workspace role at time of action

  // Action details
  action: varchar("action").notNull(), // 'create', 'update', 'delete', 'approve', 'reject'
  entityType: varchar("entity_type").notNull(), // 'time_entry', 'payroll_run', 'employee', etc.
  entityId: varchar("entity_id").notNull(),
  entityDescription: text("entity_description"), // Human-readable description

  // Data snapshots (for compliance & rollback)
  changesBefore: jsonb("changes_before"), // Complete state before change
  changesAfter: jsonb("changes_after"), // Complete state after change
  fieldChanges: jsonb("field_changes"), // Detailed field-by-field diff

  // Context & metadata
  reason: text("reason"), // Why the change was made
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  geoLocation: jsonb("geo_location"), // { lat, lng, accuracy }

  // Compliance flags
  requiresApproval: boolean("requires_approval").default(false),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),

  // Retention policy (non-editable, kept for 7 years for IRS/DOL compliance)
  retentionUntil: timestamp("retention_until"), // Auto-set to 7 years from creation
  isLocked: boolean("is_locked").default(true), // Cannot be deleted or modified

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  entityIndex: index("audit_trail_entity_idx").on(table.entityType, table.entityId),
  workspaceIndex: index("audit_trail_workspace_idx").on(table.workspaceId, table.createdAt),
}));

export const insertAuditTrailSchema = createInsertSchema(auditTrail).omit({
  id: true,
  createdAt: true,
});

export type InsertAuditTrail = z.infer<typeof insertAuditTrailSchema>;
export type AuditTrail = typeof auditTrail.$inferSelect;

// Time entry discrepancy flags (geo-compliance violations)
export const timeEntryDiscrepancies = pgTable("time_entry_discrepancies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  timeEntryId: varchar("time_entry_id").notNull().references(() => timeEntries.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),

  // Discrepancy details
  discrepancyType: varchar("discrepancy_type").notNull(), // 'location_mismatch', 'ip_anomaly', 'impossible_travel'
  severity: varchar("severity").notNull(), // 'low', 'medium', 'high', 'critical'

  // Location analysis
  expectedLocation: jsonb("expected_location"), // Job site coordinates
  actualLocation: jsonb("actual_location"), // Clock-in coordinates
  distanceMeters: decimal("distance_meters", { precision: 10, scale: 2 }), // Distance from job site

  // Detection details
  detectedAt: timestamp("detected_at").defaultNow(),
  autoFlagged: boolean("auto_flagged").default(true), // Auto-detected vs manual

  // Resolution
  status: varchar("status").default("open"), // 'open', 'investigating', 'resolved', 'dismissed'
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  resolution: text("resolution"),
  resolutionNotes: text("resolution_notes"),

  // Evidence preservation
  evidenceSnapshot: jsonb("evidence_snapshot"), // Complete time entry data at time of flag

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTimeEntryDiscrepancySchema = createInsertSchema(timeEntryDiscrepancies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTimeEntryDiscrepancy = z.infer<typeof insertTimeEntryDiscrepancySchema>;
export type TimeEntryDiscrepancy = typeof timeEntryDiscrepancies.$inferSelect;

// ============================================================================
// TALENTOS™ - RECRUITMENT, PERFORMANCE, & RETENTION (MONOPOLISTIC TIER)
// ============================================================================

// Internal Talent Marketplace - Internal project/role bidding system
export const internalBids = pgTable("internal_bids", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Bid details
  title: varchar("title").notNull(), // "Short-term Project: Install Security System at Site B"
  description: text("description").notNull(),
  bidType: varchar("bid_type").notNull(), // 'project', 'role', 'temporary_assignment'

  // Requirements
  requiredSkills: jsonb("required_skills").$type<string[]>().notNull().default(sql`'[]'`), // ['Forklift Certified', 'OSHA 30']
  requiredCertifications: jsonb("required_certifications").$type<string[]>().default(sql`'[]'`), // ['CPR', 'First Aid']
  minimumExperience: integer("minimum_experience"), // Months
  targetRole: varchar("target_role"), // "Senior Rigger", "Lead Technician"

  // Compensation & duration
  compensationType: varchar("compensation_type").notNull(), // 'hourly_rate', 'flat_fee', 'promotion'
  compensationAmount: decimal("compensation_amount", { precision: 10, scale: 2 }),
  estimatedDuration: integer("estimated_duration"), // Days
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),

  // Location & logistics
  locationRequired: varchar("location_required"), // 'on_site', 'remote', 'hybrid'
  siteLocation: text("site_location"),
  clientId: varchar("client_id").references(() => clients.id),

  // Posting details
  postedBy: varchar("posted_by").notNull().references(() => users.id),
  status: varchar("status").default("open"), // 'open', 'in_progress', 'filled', 'cancelled'
  maxApplicants: integer("max_applicants").default(10),
  applicationDeadline: timestamp("application_deadline"),

  // Selected candidate
  selectedEmployeeId: varchar("selected_employee_id").references(() => employees.id),
  selectedAt: timestamp("selected_at"),

  // High-risk employee tracking (PredictionOS™ integration)
  highRiskViewCount: integer("high_risk_view_count").default(0), // Count of high-risk employees viewing
  highRiskViewers: jsonb("high_risk_viewers").$type<string[]>().default(sql`'[]'`), // Employee IDs with turnover score > 70%
  lastHighRiskViewAt: timestamp("last_high_risk_view_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceStatusIndex: index("internal_bids_workspace_status_idx").on(table.workspaceId, table.status),
  deadlineIndex: index("internal_bids_deadline_idx").on(table.applicationDeadline),
}));

export const insertInternalBidSchema = createInsertSchema(internalBids).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInternalBid = z.infer<typeof insertInternalBidSchema>;
export type InternalBid = typeof internalBids.$inferSelect;

// Bid Applications - Employee applications to internal opportunities
export const bidApplications = pgTable("bid_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  bidId: varchar("bid_id").notNull().references(() => internalBids.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),

  // Application details
  coverLetter: text("cover_letter"),
  whyInterestedText: text("why_interested"), // "I want to grow my skills in X"
  relevantExperience: text("relevant_experience"),

  // Skill/cert matching (auto-calculated)
  skillMatchPercentage: decimal("skill_match_percentage", { precision: 5, scale: 2 }), // 0-100%
  missingSkills: jsonb("missing_skills").$type<string[]>().default(sql`'[]'`),
  matchingSkills: jsonb("matching_skills").$type<string[]>().default(sql`'[]'`),

  // PredictionOS™ risk score at time of application
  turnoverRiskScore: integer("turnover_risk_score"), // 0-100 from PredictionOS™
  isHighRisk: boolean("is_high_risk").default(false), // Score > 70%

  // Application lifecycle
  status: varchar("status").default("pending"), // 'pending', 'reviewed', 'shortlisted', 'accepted', 'rejected'
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),

  // Manager intervention flag (for high-risk employees)
  interventionTriggered: boolean("intervention_triggered").default(false),
  interventionBy: varchar("intervention_by").references(() => users.id),
  interventionAt: timestamp("intervention_at"),
  interventionNotes: text("intervention_notes"),

  appliedAt: timestamp("applied_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  bidEmployeeIndex: uniqueIndex("bid_applications_bid_employee_idx").on(table.bidId, table.employeeId),
  employeeStatusIndex: index("bid_applications_employee_status_idx").on(table.employeeId, table.status),
}));

export const insertBidApplicationSchema = createInsertSchema(bidApplications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  appliedAt: true,
});

export type InsertBidApplication = z.infer<typeof insertBidApplicationSchema>;
export type BidApplication = typeof bidApplications.$inferSelect;

// Role Templates - Career progression paths
export const roleTemplates = pgTable("role_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Role definition
  roleName: varchar("role_name").notNull(), // "Senior Rigger", "Lead Security Officer"
  roleLevel: integer("role_level"), // 1 = Entry, 2 = Mid, 3 = Senior, 4 = Lead
  department: varchar("department"), // "Operations", "Security", "Logistics"

  // Prerequisites (from current role)
  fromRole: varchar("from_role"), // "Rigger" → "Senior Rigger"
  minimumTimeInCurrentRole: integer("minimum_time_in_current_role"), // Months
  minimumPerformanceScore: decimal("minimum_performance_score", { precision: 5, scale: 2 }), // Min composite score

  // Required skills & certifications
  requiredSkills: jsonb("required_skills").$type<string[]>().notNull().default(sql`'[]'`),
  requiredCertifications: jsonb("required_certifications").$type<string[]>().default(sql`'[]'`),
  requiredTrainingCourses: jsonb("required_training_courses").$type<string[]>().default(sql`'[]'`), // Links to LearnOS™

  // Desired (optional) qualifications
  desiredSkills: jsonb("desired_skills").$type<string[]>().default(sql`'[]'`),
  desiredCertifications: jsonb("desired_certifications").$type<string[]>().default(sql`'[]'`),

  // Compensation range
  minHourlyRate: decimal("min_hourly_rate", { precision: 10, scale: 2 }),
  maxHourlyRate: decimal("max_hourly_rate", { precision: 10, scale: 2 }),
  minSalary: decimal("min_salary", { precision: 12, scale: 2 }),
  maxSalary: decimal("max_salary", { precision: 12, scale: 2 }),

  // Responsibilities & expectations
  responsibilities: text("responsibilities"),
  performanceExpectations: text("performance_expectations"),

  // Template metadata
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").notNull().references(() => users.id),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceRoleIndex: index("role_templates_workspace_role_idx").on(table.workspaceId, table.roleName),
  levelIndex: index("role_templates_level_idx").on(table.roleLevel),
}));

export const insertRoleTemplateSchema = createInsertSchema(roleTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRoleTemplate = z.infer<typeof insertRoleTemplateSchema>;
export type RoleTemplate = typeof roleTemplates.$inferSelect;

// Skill Gap Analyses - Employee readiness for next role
export const skillGapAnalyses = pgTable("skill_gap_analyses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  targetRoleId: varchar("target_role_id").notNull().references(() => roleTemplates.id),

  // Current state (from employee profile)
  currentRole: varchar("current_role"),
  currentSkills: jsonb("current_skills").$type<string[]>().default(sql`'[]'`),
  currentCertifications: jsonb("current_certifications").$type<string[]>().default(sql`'[]'`),
  currentTrainingCompleted: jsonb("current_training_completed").$type<string[]>().default(sql`'[]'`),

  // Gap analysis results
  missingSkills: jsonb("missing_skills").$type<string[]>().default(sql`'[]'`),
  missingCertifications: jsonb("missing_certifications").$type<string[]>().default(sql`'[]'`),
  missingTraining: jsonb("missing_training").$type<string[]>().default(sql`'[]'`),

  // Readiness scoring
  readinessScore: decimal("readiness_score", { precision: 5, scale: 2 }), // 0-100% overall readiness
  skillsReadiness: decimal("skills_readiness", { precision: 5, scale: 2 }),
  certificationsReadiness: decimal("certifications_readiness", { precision: 5, scale: 2 }),
  trainingReadiness: decimal("training_readiness", { precision: 5, scale: 2 }),
  experienceReadiness: decimal("experience_readiness", { precision: 5, scale: 2 }),

  // Time-to-ready estimate
  estimatedTimeToReady: integer("estimated_time_to_ready"), // Months
  blockers: jsonb("blockers").$type<string[]>().default(sql`'[]'`), // "Needs OSHA 30 certification"

  // Recommended next steps (auto-generated action plan)
  recommendedActions: jsonb("recommended_actions").$type<{
    action: string;
    type: string; // 'skill_training', 'certification', 'course', 'experience'
    priority: string; // 'high', 'medium', 'low'
    estimatedTime: number; // Days to complete
    learnOsLinkId?: string; // Links to LearnOS™ course
  }[]>().default(sql`'[]'`),

  // Progress tracking
  actionsCompleted: integer("actions_completed").default(0),
  totalActions: integer("total_actions").default(0),
  lastProgressUpdate: timestamp("last_progress_update"),

  // Lifecycle
  status: varchar("status").default("active"), // 'active', 'in_progress', 'ready', 'cancelled'
  employeeInterestedAt: timestamp("employee_interested_at"),
  managerReviewedAt: timestamp("manager_reviewed_at"),
  managerNotes: text("manager_notes"),

  generatedAt: timestamp("generated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  employeeTargetIndex: uniqueIndex("skill_gap_analyses_employee_target_idx").on(table.employeeId, table.targetRoleId),
  readinessIndex: index("skill_gap_analyses_readiness_idx").on(table.readinessScore),
}));

export const insertSkillGapAnalysisSchema = createInsertSchema(skillGapAnalyses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  generatedAt: true,
});

export type InsertSkillGapAnalysis = z.infer<typeof insertSkillGapAnalysisSchema>;
export type SkillGapAnalysis = typeof skillGapAnalyses.$inferSelect;

// ============================================================================
// ASSETOS™ - PHYSICAL RESOURCE ALLOCATION (MONOPOLISTIC TIER)
// ============================================================================

// Assets - Physical resources (trucks, rigs, equipment)
export const assets = pgTable("assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Asset identification
  assetNumber: varchar("asset_number").notNull(), // "TRUCK-001", "RIG-4"
  assetName: varchar("asset_name").notNull(), // "2020 Ford F-150"
  assetType: varchar("asset_type").notNull(), // 'vehicle', 'equipment', 'tool', 'facility'
  category: varchar("category"), // "Pickup Truck", "Drilling Rig", "Forklift"

  // Asset details
  manufacturer: varchar("manufacturer"),
  model: varchar("model"),
  serialNumber: varchar("serial_number"),
  yearManufactured: integer("year_manufactured"),
  purchaseDate: timestamp("purchase_date"),
  purchasePrice: decimal("purchase_price", { precision: 12, scale: 2 }),

  // Location & assignment
  currentLocation: text("current_location"),
  homeLocation: text("home_location"), // Default storage location
  assignedToClientId: varchar("assigned_to_client_id").references(() => clients.id),

  // Billing configuration
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }), // $75/hr for Rig usage
  dailyRate: decimal("daily_rate", { precision: 10, scale: 2 }),
  weeklyRate: decimal("weekly_rate", { precision: 10, scale: 2 }),
  billingType: varchar("billing_type").default("hourly"), // 'hourly', 'daily', 'weekly', 'flat_fee'
  isBillable: boolean("is_billable").default(true),

  // Maintenance & compliance
  lastMaintenanceDate: timestamp("last_maintenance_date"),
  nextMaintenanceDate: timestamp("next_maintenance_date"),
  maintenanceIntervalDays: integer("maintenance_interval_days"),
  certifications: jsonb("certifications").$type<string[]>().default(sql`'[]'`), // ['DOT Inspection', 'Safety Certified']
  certificationExpiry: timestamp("certification_expiry"),

  // Availability & status
  status: varchar("status").default("available"), // 'available', 'in_use', 'maintenance', 'retired'
  isSchedulable: boolean("is_schedulable").default(true),
  requiresOperatorCertification: boolean("requires_operator_certification").default(false),
  requiredCertifications: jsonb("required_certifications").$type<string[]>().default(sql`'[]'`), // Employee must have these

  // Documentation
  photos: jsonb("photos").$type<string[]>().default(sql`'[]'`), // URLs to asset photos
  documents: jsonb("documents").$type<string[]>().default(sql`'[]'`), // Manuals, insurance docs
  notes: text("notes"),

  // Depreciation (for accounting)
  depreciationMethod: varchar("depreciation_method"), // 'straight_line', 'declining_balance'
  depreciationRate: decimal("depreciation_rate", { precision: 5, scale: 2 }),
  currentValue: decimal("current_value", { precision: 12, scale: 2 }),

  // Metadata
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").notNull().references(() => users.id),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceNumberIndex: uniqueIndex("assets_workspace_number_idx").on(table.workspaceId, table.assetNumber),
  statusIndex: index("assets_status_idx").on(table.status, table.isSchedulable),
  maintenanceIndex: index("assets_maintenance_idx").on(table.nextMaintenanceDate),
}));

export const insertAssetSchema = createInsertSchema(assets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assets.$inferSelect;

// Asset Schedules - Dual-layer scheduling (people + assets)
export const assetSchedules = pgTable("asset_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  assetId: varchar("asset_id").notNull().references(() => assets.id, { onDelete: 'cascade' }),

  // Linked to employee shift (dual-layer scheduling)
  shiftId: varchar("shift_id").references(() => shifts.id, { onDelete: 'set null' }),
  employeeId: varchar("employee_id").references(() => employees.id),
  clientId: varchar("client_id").references(() => clients.id),

  // Scheduling details
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  jobDescription: text("job_description"),
  jobLocation: text("job_location"),

  // Conflict detection flags
  hasConflict: boolean("has_conflict").default(false),
  conflictWith: jsonb("conflict_with").$type<string[]>().default(sql`'[]'`), // Asset schedule IDs that overlap

  // Usage tracking (for billing)
  actualStartTime: timestamp("actual_start_time"),
  actualEndTime: timestamp("actual_end_time"),
  actualHours: decimal("actual_hours", { precision: 10, scale: 2 }),
  odometerStart: decimal("odometer_start", { precision: 10, scale: 2 }),
  odometerEnd: decimal("odometer_end", { precision: 10, scale: 2 }),
  fuelUsed: decimal("fuel_used", { precision: 10, scale: 2 }),

  // Billing (auto-calculated for BillOS™)
  billableHours: decimal("billable_hours", { precision: 10, scale: 2 }),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }), // Snapshot from asset
  totalCharge: decimal("total_charge", { precision: 10, scale: 2 }),
  invoiced: boolean("invoiced").default(false),
  invoiceId: varchar("invoice_id").references(() => invoices.id),

  // Pre/post inspection (safety compliance)
  preInspectionCompleted: boolean("pre_inspection_completed").default(false),
  preInspectionBy: varchar("pre_inspection_by").references(() => users.id),
  preInspectionNotes: text("pre_inspection_notes"),
  postInspectionCompleted: boolean("post_inspection_completed").default(false),
  postInspectionBy: varchar("post_inspection_by").references(() => users.id),
  postInspectionNotes: text("post_inspection_notes"),
  damageReported: boolean("damage_reported").default(false),
  damageDescription: text("damage_description"),

  // Status
  status: varchar("status").default("scheduled"), // 'scheduled', 'in_progress', 'completed', 'cancelled'
  cancelledBy: varchar("cancelled_by").references(() => users.id),
  cancelledAt: timestamp("cancelled_at"),
  cancellationReason: text("cancellation_reason"),

  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  assetTimeIndex: index("asset_schedules_asset_time_idx").on(table.assetId, table.startTime),
  shiftIndex: index("asset_schedules_shift_idx").on(table.shiftId),
  conflictIndex: index("asset_schedules_conflict_idx").on(table.hasConflict),
}));

export const insertAssetScheduleSchema = createInsertSchema(assetSchedules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAssetSchedule = z.infer<typeof insertAssetScheduleSchema>;
export type AssetSchedule = typeof assetSchedules.$inferSelect;

// Asset Usage Logs - Detailed tracking for billing & analytics
export const assetUsageLogs = pgTable("asset_usage_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  assetId: varchar("asset_id").notNull().references(() => assets.id, { onDelete: 'cascade' }),
  assetScheduleId: varchar("asset_schedule_id").references(() => assetSchedules.id),

  // Usage period
  usagePeriodStart: timestamp("usage_period_start").notNull(),
  usagePeriodEnd: timestamp("usage_period_end").notNull(),
  totalHours: decimal("total_hours", { precision: 10, scale: 2 }),

  // Operator details
  operatedBy: varchar("operated_by").references(() => employees.id),
  operatorCertificationVerified: boolean("operator_certification_verified").default(false),

  // Client billing
  clientId: varchar("client_id").references(() => clients.id),
  costCenterCode: varchar("cost_center_code"), // For client's internal accounting

  // Maintenance tracking
  maintenanceRequired: boolean("maintenance_required").default(false),
  maintenanceNotes: text("maintenance_notes"),
  issuesReported: jsonb("issues_reported").$type<string[]>().default(sql`'[]'`),

  // Auto-aggregated metrics
  totalDistance: decimal("total_distance", { precision: 10, scale: 2 }), // Miles/KM
  fuelConsumed: decimal("fuel_consumed", { precision: 10, scale: 2 }),
  idleTime: decimal("idle_time", { precision: 10, scale: 2 }), // Hours

  // BillOS™ integration
  invoiceLineItemId: varchar("invoice_line_item_id"),
  billingStatus: varchar("billing_status").default("pending"), // 'pending', 'invoiced', 'paid'

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  assetPeriodIndex: index("asset_usage_logs_asset_period_idx").on(table.assetId, table.usagePeriodStart),
  clientIndex: index("asset_usage_logs_client_idx").on(table.clientId, table.billingStatus),
}));

export const insertAssetUsageLogSchema = createInsertSchema(assetUsageLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertAssetUsageLog = z.infer<typeof insertAssetUsageLogSchema>;
export type AssetUsageLog = typeof assetUsageLogs.$inferSelect;

// ============================================================================
// ENGAGEMENT OS™ - BIDIRECTIONAL INTELLIGENCE SYSTEM
// ============================================================================

// Pulse Survey Templates - Customizable employee engagement surveys
export const pulseSurveyTemplates = pgTable("pulse_survey_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  title: varchar("title").notNull(),
  description: text("description"),

  // Survey configuration
  questions: jsonb("questions").$type<Array<{
    id: string;
    text: string;
    type: 'rating' | 'multiple_choice' | 'text' | 'yes_no';
    options?: string[];
    required: boolean;
    category: 'workload' | 'management' | 'environment' | 'growth' | 'compensation' | 'culture' | 'safety' | 'resources';
  }>>().notNull(),

  // Scheduling
  frequency: varchar("frequency").default("monthly"), // 'weekly', 'biweekly', 'monthly', 'quarterly', 'annual', 'one_time'
  isActive: boolean("is_active").default(true),

  // Anonymity settings
  isAnonymous: boolean("is_anonymous").default(true),
  showResultsToEmployees: boolean("show_results_to_employees").default(false),

  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceActiveIndex: index("pulse_survey_templates_workspace_active_idx").on(table.workspaceId, table.isActive),
}));

export const insertPulseSurveyTemplateSchema = createInsertSchema(pulseSurveyTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPulseSurveyTemplate = z.infer<typeof insertPulseSurveyTemplateSchema>;
export type PulseSurveyTemplate = typeof pulseSurveyTemplates.$inferSelect;

// Pulse Survey Responses - Employee feedback submissions
export const pulseSurveyResponses = pgTable("pulse_survey_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  surveyTemplateId: varchar("survey_template_id").notNull().references(() => pulseSurveyTemplates.id, { onDelete: 'cascade' }),

  // Respondent (nullable for anonymous surveys)
  employeeId: varchar("employee_id").references(() => employees.id, { onDelete: 'set null' }),

  // Response data
  responses: jsonb("responses").$type<Array<{
    questionId: string;
    answer: string | number | string[];
  }>>().notNull(),

  // AI Sentiment Analysis
  sentimentScore: decimal("sentiment_score", { precision: 5, scale: 2 }), // -100 to +100
  sentimentLabel: varchar("sentiment_label"), // 'positive', 'neutral', 'negative', 'very_negative'
  emotionalTone: varchar("emotional_tone"), // 'happy', 'frustrated', 'anxious', 'satisfied', 'angry'
  keyThemes: jsonb("key_themes").$type<string[]>().default(sql`'[]'`), // AI-extracted themes

  // Engagement score calculation (0-100)
  engagementScore: decimal("engagement_score", { precision: 5, scale: 2 }),

  // Metadata
  submittedAt: timestamp("submitted_at").defaultNow(),
  ipAddress: varchar("ip_address"), // For duplicate detection (not shown to managers)
  userAgent: text("user_agent"),
}, (table) => ({
  surveyEmployeeIndex: index("pulse_responses_survey_employee_idx").on(table.surveyTemplateId, table.employeeId),
  sentimentIndex: index("pulse_responses_sentiment_idx").on(table.workspaceId, table.sentimentLabel),
  engagementIndex: index("pulse_responses_engagement_idx").on(table.workspaceId, table.engagementScore),
}));

export const insertPulseSurveyResponseSchema = createInsertSchema(pulseSurveyResponses).omit({
  id: true,
  submittedAt: true,
});

export type InsertPulseSurveyResponse = z.infer<typeof insertPulseSurveyResponseSchema>;
export type PulseSurveyResponse = typeof pulseSurveyResponses.$inferSelect;

// Employer Ratings - Employees rate their organization/departments/managers
export const employerRatings = pgTable("employer_ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Rater (anonymous)
  employeeId: varchar("employee_id").references(() => employees.id, { onDelete: 'set null' }),

  // Rating target
  ratingType: varchar("rating_type").notNull(), // 'organization', 'department', 'manager', 'location'
  targetId: varchar("target_id"), // departmentId, managerId, locationId (null for organization-wide)
  targetName: varchar("target_name"), // Display name for reporting

  // Ratings (1-5 scale)
  managementQuality: integer("management_quality"), // Leadership effectiveness
  workEnvironment: integer("work_environment"), // Safety, cleanliness, resources
  compensationFairness: integer("compensation_fairness"), // Pay vs. industry
  growthOpportunities: integer("growth_opportunities"), // Training, advancement
  workLifeBalance: integer("work_life_balance"), // Schedule flexibility
  equipmentResources: integer("equipment_resources"), // Tools, technology
  communicationClarity: integer("communication_clarity"), // Clear expectations
  recognitionAppreciation: integer("recognition_appreciation"), // Feeling valued

  // Overall score (calculated average)
  overallScore: decimal("overall_score", { precision: 3, scale: 1 }), // 1.0 - 5.0

  // Feedback
  positiveComments: text("positive_comments"),
  improvementSuggestions: text("improvement_suggestions"),

  // AI Analysis
  sentimentScore: decimal("sentiment_score", { precision: 5, scale: 2 }),
  sentimentLabel: varchar("sentiment_label"),
  riskFlags: jsonb("risk_flags").$type<string[]>().default(sql`'[]'`), // ['high_turnover_risk', 'safety_concern', 'harassment_mention']

  // Anonymous protection
  isAnonymous: boolean("is_anonymous").default(true),
  ipAddress: varchar("ip_address"), // For duplicate detection only

  submittedAt: timestamp("submitted_at").defaultNow(),
}, (table) => ({
  workspaceTypeIndex: index("employer_ratings_workspace_type_idx").on(table.workspaceId, table.ratingType),
  targetIndex: index("employer_ratings_target_idx").on(table.targetId, table.submittedAt),
  scoreIndex: index("employer_ratings_score_idx").on(table.workspaceId, table.overallScore),
}));

export const insertEmployerRatingSchema = createInsertSchema(employerRatings).omit({
  id: true,
  submittedAt: true,
});

export type InsertEmployerRating = z.infer<typeof insertEmployerRatingSchema>;
export type EmployerRating = typeof employerRatings.$inferSelect;

// Anonymous Suggestions - Employee suggestion box with ticket tracking
export const anonymousSuggestions = pgTable("anonymous_suggestions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Submitter (anonymous)
  employeeId: varchar("employee_id").references(() => employees.id, { onDelete: 'set null' }),

  // Suggestion content
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  category: varchar("category"), // 'safety', 'process', 'equipment', 'culture', 'compensation', 'benefits', 'other'

  // AI Sentiment Analysis
  sentimentScore: decimal("sentiment_score", { precision: 5, scale: 2 }),
  sentimentLabel: varchar("sentiment_label"),
  urgencyLevel: varchar("urgency_level"), // 'low', 'medium', 'high', 'critical' (AI-determined)

  // Ticket tracking (SupportOS™ integration)
  ticketId: varchar("ticket_id").references(() => supportTickets.id),
  status: varchar("status").default("submitted"), // 'submitted', 'under_review', 'in_progress', 'implemented', 'declined', 'duplicate'
  statusUpdatedAt: timestamp("status_updated_at"),

  // Management response
  responseToEmployee: text("response_to_employee"), // Public response visible to submitter
  internalNotes: text("internal_notes"), // Private manager notes
  implementationDate: timestamp("implementation_date"),
  declineReason: text("decline_reason"),

  // Visibility
  isAnonymous: boolean("is_anonymous").default(true),
  visibleToAllEmployees: boolean("visible_to_all_employees").default(false), // Suggestion board feature

  // Engagement metrics
  upvotes: integer("upvotes").default(0), // Other employees can upvote
  viewCount: integer("view_count").default(0),

  submittedAt: timestamp("submitted_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceStatusIndex: index("suggestions_workspace_status_idx").on(table.workspaceId, table.status),
  categoryUrgencyIndex: index("suggestions_category_urgency_idx").on(table.category, table.urgencyLevel),
}));

export const insertAnonymousSuggestionSchema = createInsertSchema(anonymousSuggestions).omit({
  id: true,
  submittedAt: true,
  updatedAt: true,
});

export type InsertAnonymousSuggestion = z.infer<typeof insertAnonymousSuggestionSchema>;
export type AnonymousSuggestion = typeof anonymousSuggestions.$inferSelect;

// Employee Recognition - Peer-to-peer kudos and rewards
export const employeeRecognition = pgTable("employee_recognition", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Recognition details
  recognizedEmployeeId: varchar("recognized_employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  recognizedByEmployeeId: varchar("recognized_by_employee_id").references(() => employees.id, { onDelete: 'set null' }),
  recognizedByManagerId: varchar("recognized_by_manager_id").references(() => employees.id, { onDelete: 'set null' }),

  // Kudos content
  reason: text("reason").notNull(),
  category: varchar("category"), // 'safety', 'customer_service', 'teamwork', 'innovation', 'quality', 'leadership'

  // Context (ties to work done)
  relatedShiftId: varchar("related_shift_id").references(() => shifts.id),
  relatedClientId: varchar("related_client_id").references(() => clients.id),
  relatedReportId: varchar("related_report_id"), // Links to report submissions

  // Visibility
  isPublic: boolean("is_public").default(true), // Visible on company feed

  // Monetary reward (BillOS™ integration)
  hasMonetaryReward: boolean("has_monetary_reward").default(false),
  rewardAmount: decimal("reward_amount", { precision: 10, scale: 2 }),
  rewardType: varchar("reward_type"), // 'bonus', 'gift_card', 'pto_hours', 'points'
  rewardPaid: boolean("reward_paid").default(false),
  rewardPaidAt: timestamp("reward_paid_at"),
  rewardTransactionId: varchar("reward_transaction_id"),

  // Engagement metrics
  likes: integer("likes").default(0), // Other employees can like
  comments: integer("comments").default(0),

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmployeeRecognitionSchema = createInsertSchema(employeeRecognition).omit({
  id: true,
  createdAt: true,
});

export type InsertEmployeeRecognition = z.infer<typeof insertEmployeeRecognitionSchema>;
export type EmployeeRecognition = typeof employeeRecognition.$inferSelect;

// Employee Health Scores - Aggregated engagement metrics
export const employeeHealthScores = pgTable("employee_health_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),

  // Calculated period
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),

  // Engagement metrics (0-100 scale)
  overallEngagementScore: decimal("overall_engagement_score", { precision: 5, scale: 2 }),
  surveyParticipationRate: decimal("survey_participation_rate", { precision: 5, scale: 2 }),
  averageSentimentScore: decimal("average_sentiment_score", { precision: 5, scale: 2 }),

  // Component scores
  workloadSatisfaction: decimal("workload_satisfaction", { precision: 5, scale: 2 }),
  managementSatisfaction: decimal("management_satisfaction", { precision: 5, scale: 2 }),
  growthSatisfaction: decimal("growth_satisfaction", { precision: 5, scale: 2 }),
  compensationSatisfaction: decimal("compensation_satisfaction", { precision: 5, scale: 2 }),
  cultureSatisfaction: decimal("culture_satisfaction", { precision: 5, scale: 2 }),

  // Risk indicators
  turnoverRiskScore: decimal("turnover_risk_score", { precision: 5, scale: 2 }), // PredictionOS™ integration
  riskLevel: varchar("risk_level"), // 'low', 'medium', 'high', 'critical'
  riskFactors: jsonb("risk_factors").$type<string[]>().default(sql`'[]'`), // ['low_engagement', 'compensation_concern', 'manager_conflict']

  // Manager action queue
  requiresManagerAction: boolean("requires_manager_action").default(false),
  actionPriority: varchar("action_priority"), // 'low', 'medium', 'high', 'urgent'
  suggestedActions: jsonb("suggested_actions").$type<Array<{
    action: string;
    conversationStarter: string; // AI-generated
    expectedImpact: string;
  }>>().default(sql`'[]'`),

  // Action tracking
  managerNotified: boolean("manager_notified").default(false),
  managerNotifiedAt: timestamp("manager_notified_at"),
  actionTaken: boolean("action_taken").default(false),
  actionTakenAt: timestamp("action_taken_at"),
  actionNotes: text("action_notes"),

  calculatedAt: timestamp("calculated_at").defaultNow(),
}, (table) => ({
  employeePeriodIndex: index("health_scores_employee_period_idx").on(table.employeeId, table.periodEnd),
  riskLevelIndex: index("health_scores_risk_level_idx").on(table.workspaceId, table.riskLevel, table.requiresManagerAction),
  actionQueueIndex: index("health_scores_action_queue_idx").on(table.requiresManagerAction, table.managerNotified),
}));

export const insertEmployeeHealthScoreSchema = createInsertSchema(employeeHealthScores).omit({
  id: true,
  calculatedAt: true,
});

export type InsertEmployeeHealthScore = z.infer<typeof insertEmployeeHealthScoreSchema>;
export type EmployeeHealthScore = typeof employeeHealthScores.$inferSelect;

// Employer Benchmark Scores - Aggregated org/department ratings vs. industry
export const employerBenchmarkScores = pgTable("employer_benchmark_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Benchmark target
  benchmarkType: varchar("benchmark_type").notNull(), // 'organization', 'department', 'manager', 'location'
  targetId: varchar("target_id"), // null for organization-wide
  targetName: varchar("target_name"),

  // Calculated period
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),

  // Aggregated ratings (1-5 scale)
  managementQualityAvg: decimal("management_quality_avg", { precision: 3, scale: 2 }),
  workEnvironmentAvg: decimal("work_environment_avg", { precision: 3, scale: 2 }),
  compensationFairnessAvg: decimal("compensation_fairness_avg", { precision: 3, scale: 2 }),
  growthOpportunitiesAvg: decimal("growth_opportunities_avg", { precision: 3, scale: 2 }),
  workLifeBalanceAvg: decimal("work_life_balance_avg", { precision: 3, scale: 2 }),
  equipmentResourcesAvg: decimal("equipment_resources_avg", { precision: 3, scale: 2 }),
  communicationClarityAvg: decimal("communication_clarity_avg", { precision: 3, scale: 2 }),
  recognitionAppreciationAvg: decimal("recognition_appreciation_avg", { precision: 3, scale: 2 }),

  // Overall employer score
  overallScore: decimal("overall_score", { precision: 3, scale: 2 }),

  // Industry benchmarking (anonymized cross-platform data)
  industryAverageScore: decimal("industry_average_score", { precision: 3, scale: 2 }),
  percentileRank: integer("percentile_rank"), // 0-100 (how you rank vs. similar companies)

  // Trend analysis
  scoreTrend: varchar("score_trend"), // 'improving', 'stable', 'declining'
  monthOverMonthChange: decimal("month_over_month_change", { precision: 4, scale: 2 }),

  // Response metrics
  totalResponses: integer("total_responses").default(0),
  responseRate: decimal("response_rate", { precision: 5, scale: 2 }),

  // Risk indicators
  criticalIssuesCount: integer("critical_issues_count").default(0),
  highRiskFlags: jsonb("high_risk_flags").$type<string[]>().default(sql`'[]'`),

  calculatedAt: timestamp("calculated_at").defaultNow(),
}, (table) => ({
  workspaceTypeIndex: index("employer_benchmarks_workspace_type_idx").on(table.workspaceId, table.benchmarkType),
  targetPeriodIndex: index("employer_benchmarks_target_period_idx").on(table.targetId, table.periodEnd),
  scoreRankIndex: index("employer_benchmarks_score_rank_idx").on(table.overallScore, table.percentileRank),
}));

export const insertEmployerBenchmarkScoreSchema = createInsertSchema(employerBenchmarkScores).omit({
  id: true,
  calculatedAt: true,
});

export type InsertEmployerBenchmarkScore = z.infer<typeof insertEmployerBenchmarkScoreSchema>;
export type EmployerBenchmarkScore = typeof employerBenchmarkScores.$inferSelect;

// ============================================================================
// INTEGRATIONOS™ - EXTERNAL ECOSYSTEM LAYER (MONOPOLISTIC LOCK-IN)
// ============================================================================

// Integration categories enum
export const integrationCategoryEnum = pgEnum('integration_category', [
  'accounting', // QuickBooks, Xero, NetSuite
  'erp', // SAP, Oracle, Microsoft Dynamics
  'crm', // Salesforce, HubSpot, Pipedrive
  'hris', // ADP, Workday, BambooHR
  'communication', // Slack, Microsoft Teams, Discord
  'productivity', // Google Workspace, Microsoft 365
  'analytics', // Tableau, Power BI, Looker
  'storage', // Dropbox, Box, OneDrive
  'custom' // Third-party developer integrations
]);

// Integration marketplace - Certified integration catalog
export const integrationMarketplace = pgTable("integration_marketplace", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Integration identity
  name: varchar("name").notNull(), // "QuickBooks Online", "Salesforce CRM"
  slug: varchar("slug").unique().notNull(), // "quickbooks-online", "salesforce"
  category: integrationCategoryEnum("category").notNull(),
  provider: varchar("provider").notNull(), // "Intuit", "Salesforce Inc."
  logoUrl: varchar("logo_url"),

  // Integration details
  description: text("description"),
  longDescription: text("long_description"),
  websiteUrl: varchar("website_url"),
  documentationUrl: varchar("documentation_url"),

  // Technical specifications
  authType: varchar("auth_type").notNull(), // 'oauth2', 'api_key', 'basic', 'custom'
  authConfig: jsonb("auth_config").$type<{
    authorizationUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
    apiKeyName?: string;
    customInstructions?: string;
  }>(),

  // Supported features
  supportedFeatures: jsonb("supported_features").$type<string[]>().default(sql`'[]'`), // ['sync_employees', 'sync_invoices', 'webhooks']
  webhookSupport: boolean("webhook_support").default(false),
  bidirectionalSync: boolean("bidirectional_sync").default(false),

  // Marketplace metadata
  isCertified: boolean("is_certified").default(false), // Official WorkforceOS certification
  isDeveloperSubmitted: boolean("is_developer_submitted").default(false),
  installCount: integer("install_count").default(0),
  rating: decimal("rating", { precision: 3, scale: 2 }), // 0.00 - 5.00
  reviewCount: integer("review_count").default(0),

  // Developer information (for third-party integrations)
  developerId: varchar("developer_id"),
  developerEmail: varchar("developer_email"),
  developerWebhookUrl: varchar("developer_webhook_url"),

  // Status
  isActive: boolean("is_active").default(true),
  isPublished: boolean("is_published").default(false),
  publishedAt: timestamp("published_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  categorySlugIndex: index("integration_marketplace_category_slug_idx").on(table.category, table.slug),
  certifiedActiveIndex: index("integration_marketplace_certified_active_idx").on(table.isCertified, table.isActive),
  installCountIndex: index("integration_marketplace_install_count_idx").on(table.installCount),
}));

export const insertIntegrationMarketplaceSchema = createInsertSchema(integrationMarketplace).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertIntegrationMarketplace = z.infer<typeof insertIntegrationMarketplaceSchema>;
export type IntegrationMarketplace = typeof integrationMarketplace.$inferSelect;

// Integration connections - Active workspace connections to external services
export const integrationConnections = pgTable("integration_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  integrationId: varchar("integration_id").notNull().references(() => integrationMarketplace.id, { onDelete: 'cascade' }),

  // Connection identity
  connectionName: varchar("connection_name"), // User-friendly name "Production QuickBooks"
  externalAccountId: varchar("external_account_id"), // External system's account identifier
  externalAccountName: varchar("external_account_name"), // "Acme Corp - QuickBooks"

  // Authentication
  authType: varchar("auth_type").notNull(), // 'oauth2', 'api_key', 'basic'
  accessToken: text("access_token"), // Encrypted OAuth access token
  refreshToken: text("refresh_token"), // Encrypted OAuth refresh token
  tokenExpiry: timestamp("token_expiry"),
  apiKey: text("api_key"), // Encrypted API key (for API key auth)
  apiSecret: text("api_secret"), // Encrypted API secret

  // Configuration
  syncConfig: jsonb("sync_config").$type<{
    syncDirection?: 'pull' | 'push' | 'bidirectional';
    syncFrequency?: 'realtime' | 'hourly' | 'daily' | 'manual';
    enabledFeatures?: string[];
    fieldMappings?: Record<string, string>;
  }>(),

  // Sync status
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: varchar("last_sync_status"), // 'success', 'failed', 'partial'
  lastSyncError: text("last_sync_error"),
  nextSyncAt: timestamp("next_sync_at"),
  totalSyncCount: integer("total_sync_count").default(0),
  failedSyncCount: integer("failed_sync_count").default(0),

  // Health monitoring
  isHealthy: boolean("is_healthy").default(true),
  healthCheckAt: timestamp("health_check_at"),
  healthCheckError: text("health_check_error"),

  // Connection status
  isActive: boolean("is_active").default(true),
  connectedAt: timestamp("connected_at").defaultNow(),
  disconnectedAt: timestamp("disconnected_at"),

  // Audit
  connectedByUserId: varchar("connected_by_user_id").references(() => users.id),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIntegrationIndex: index("integration_connections_workspace_integration_idx").on(table.workspaceId, table.integrationId),
  activeHealthIndex: index("integration_connections_active_health_idx").on(table.isActive, table.isHealthy),
  nextSyncIndex: index("integration_connections_next_sync_idx").on(table.nextSyncAt, table.isActive),
}));

export const insertIntegrationConnectionSchema = createInsertSchema(integrationConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertIntegrationConnection = z.infer<typeof insertIntegrationConnectionSchema>;
export type IntegrationConnection = typeof integrationConnections.$inferSelect;

// Integration API keys - Public API keys for developer access
export const integrationApiKeys = pgTable("integration_api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Key identity
  name: varchar("name").notNull(), // "Production API Key", "Mobile App Key"
  description: text("description"),
  keyPrefix: varchar("key_prefix").notNull(), // "wfos_prod_" for display
  keyHash: text("key_hash").notNull(), // Hashed full key for verification

  // Permissions
  scopes: jsonb("scopes").$type<string[]>().default(sql`'[]'`), // ['read:employees', 'write:shifts', 'webhooks:manage']
  ipWhitelist: jsonb("ip_whitelist").$type<string[]>().default(sql`'[]'`),

  // Rate limiting
  rateLimit: integer("rate_limit").default(1000), // Requests per hour
  rateLimitWindow: varchar("rate_limit_window").default('hour'), // 'minute', 'hour', 'day'

  // Usage tracking
  lastUsedAt: timestamp("last_used_at"),
  totalRequests: integer("total_requests").default(0),
  totalErrors: integer("total_errors").default(0),

  // Status
  isActive: boolean("is_active").default(true),
  expiresAt: timestamp("expires_at"),

  // Audit
  createdByUserId: varchar("created_by_user_id").references(() => users.id),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceActiveIndex: index("integration_api_keys_workspace_active_idx").on(table.workspaceId, table.isActive),
  keyHashIndex: uniqueIndex("integration_api_keys_key_hash_idx").on(table.keyHash),
}));

export const insertIntegrationApiKeySchema = createInsertSchema(integrationApiKeys).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertIntegrationApiKey = z.infer<typeof insertIntegrationApiKeySchema>;
export type IntegrationApiKey = typeof integrationApiKeys.$inferSelect;

// Webhook subscriptions - User-configured event listeners
export const webhookSubscriptions = pgTable("webhook_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Subscription identity
  name: varchar("name").notNull(), // "Slack Shift Notifications"
  description: text("description"),
  targetUrl: varchar("target_url").notNull(), // External endpoint to call

  // Event configuration
  events: jsonb("events").$type<string[]>().notNull(), // ['shift.created', 'invoice.paid', 'employee.hired']
  filters: jsonb("filters").$type<Record<string, any>>(), // Filter conditions: {department: 'sales', status: 'active'}

  // Authentication for outgoing webhooks
  authType: varchar("auth_type"), // 'none', 'basic', 'bearer', 'custom_header'
  authConfig: jsonb("auth_config").$type<{
    username?: string;
    password?: string;
    token?: string;
    customHeaders?: Record<string, string>;
  }>(),

  // Delivery settings
  retryPolicy: varchar("retry_policy").default('exponential'), // 'none', 'linear', 'exponential'
  maxRetries: integer("max_retries").default(3),
  timeoutSeconds: integer("timeout_seconds").default(30),

  // Health monitoring
  isHealthy: boolean("is_healthy").default(true),
  lastSuccessAt: timestamp("last_success_at"),
  lastFailureAt: timestamp("last_failure_at"),
  consecutiveFailures: integer("consecutive_failures").default(0),

  // Statistics
  totalDeliveries: integer("total_deliveries").default(0),
  successfulDeliveries: integer("successful_deliveries").default(0),
  failedDeliveries: integer("failed_deliveries").default(0),

  // Status
  isActive: boolean("is_active").default(true),
  pausedReason: text("paused_reason"),

  // Audit
  createdByUserId: varchar("created_by_user_id").references(() => users.id),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceActiveIndex: index("webhook_subscriptions_workspace_active_idx").on(table.workspaceId, table.isActive),
  eventIndex: index("webhook_subscriptions_event_idx").on(table.events),
  healthIndex: index("webhook_subscriptions_health_idx").on(table.isHealthy, table.consecutiveFailures),
}));

export const insertWebhookSubscriptionSchema = createInsertSchema(webhookSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWebhookSubscription = z.infer<typeof insertWebhookSubscriptionSchema>;
export type WebhookSubscription = typeof webhookSubscriptions.$inferSelect;

// Webhook deliveries - Delivery tracking and retry history
export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subscriptionId: varchar("subscription_id").notNull().references(() => webhookSubscriptions.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Event details
  eventType: varchar("event_type").notNull(), // 'shift.created', 'invoice.paid'
  eventId: varchar("event_id"), // ID of the triggering resource
  payload: jsonb("payload").notNull(), // Full event payload sent to webhook

  // Delivery attempt
  attemptNumber: integer("attempt_number").default(1),
  targetUrl: varchar("target_url").notNull(),
  httpMethod: varchar("http_method").default('POST'),

  // Request details
  requestHeaders: jsonb("request_headers"),
  requestBody: jsonb("request_body"),

  // Response details
  statusCode: integer("status_code"),
  responseHeaders: jsonb("response_headers"),
  responseBody: text("response_body"),
  durationMs: integer("duration_ms"),

  // Delivery status
  status: varchar("status").notNull(), // 'pending', 'success', 'failed', 'retrying'
  errorMessage: text("error_message"),
  errorStack: text("error_stack"),

  // Retry scheduling
  nextRetryAt: timestamp("next_retry_at"),
  maxRetries: integer("max_retries"),

  // Timestamps
  scheduledAt: timestamp("scheduled_at").defaultNow(),
  sentAt: timestamp("sent_at"),
  completedAt: timestamp("completed_at"),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  subscriptionStatusIndex: index("webhook_deliveries_subscription_status_idx").on(table.subscriptionId, table.status),
  eventTypeIndex: index("webhook_deliveries_event_type_idx").on(table.eventType, table.eventId),
  retryQueueIndex: index("webhook_deliveries_retry_queue_idx").on(table.status, table.nextRetryAt),
  workspaceIndex: index("webhook_deliveries_workspace_idx").on(table.workspaceId, table.createdAt),
}));

export const insertWebhookDeliverySchema = createInsertSchema(webhookDeliveries).omit({
  id: true,
  createdAt: true,
});

export type InsertWebhookDelivery = z.infer<typeof insertWebhookDeliverySchema>;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;

// ============================================================================
// PROMOTIONAL BANNERS - Dashboard-manageable promotional banners for landing page
// ============================================================================

export const promotionalBanners = pgTable("promotional_banners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Banner content
  message: text("message").notNull(), // Main promotional message
  ctaText: varchar("cta_text", { length: 100 }), // Call-to-action button text (optional)
  ctaLink: varchar("cta_link", { length: 500 }), // CTA button link (optional)

  // Display settings
  isActive: boolean("is_active").default(false), // Only one banner can be active at a time
  priority: integer("priority").default(0), // Higher priority shown first if multiple active

  // Tracking
  createdBy: varchar("created_by").notNull().references(() => users.id),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  activeIndex: index("promotional_banners_active_idx").on(table.isActive, table.priority),
}));

export const insertPromotionalBannerSchema = createInsertSchema(promotionalBanners).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPromotionalBanner = z.infer<typeof insertPromotionalBannerSchema>;
export type PromotionalBanner = typeof promotionalBanners.$inferSelect;

// ============================================================================
// INTELLIGENT KNOWLEDGE BASE - AI-Powered Document Search & Policy Retrieval
// ============================================================================

export const knowledgeArticles = pgTable("knowledge_articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),

  // Article content
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content").notNull(),
  summary: text("summary"), // AI-generated summary
  category: varchar("category", { length: 100 }), // 'policy', 'procedure', 'faq', 'guide'
  tags: text("tags").array(), // Searchable tags

  // Access control
  isPublic: boolean("is_public").default(false), // Public to all or workspace-specific
  requiredRole: varchar("required_role"), // Minimum role to view

  // Metadata
  lastUpdatedBy: varchar("last_updated_by").references(() => users.id),
  viewCount: integer("view_count").default(0),
  helpfulCount: integer("helpful_count").default(0), // User feedback

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  categoryIdx: index("knowledge_articles_category_idx").on(table.category),
  workspaceIdx: index("knowledge_articles_workspace_idx").on(table.workspaceId),
}));

export const insertKnowledgeArticleSchema = createInsertSchema(knowledgeArticles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertKnowledgeArticle = z.infer<typeof insertKnowledgeArticleSchema>;
export type KnowledgeArticle = typeof knowledgeArticles.$inferSelect;

// Track AI knowledge queries for learning and improving responses
export const knowledgeQueries = pgTable("knowledge_queries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),

  // Query details
  query: text("query").notNull(), // What the user asked
  response: text("response"), // AI-generated answer

  // Metadata
  responseTime: integer("response_time"), // Milliseconds
  articlesRetrieved: text("articles_retrieved").array(), // IDs of articles used
  wasHelpful: boolean("was_helpful"), // User feedback
  followUpQueries: integer("follow_up_queries").default(0), // Did they ask again?

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("knowledge_queries_user_idx").on(table.userId),
  createdIdx: index("knowledge_queries_created_idx").on(table.createdAt),
}));

export const insertKnowledgeQuerySchema = createInsertSchema(knowledgeQueries).omit({
  id: true,
  createdAt: true,
});

export type InsertKnowledgeQuery = z.infer<typeof insertKnowledgeQuerySchema>;
export type KnowledgeQuery = typeof knowledgeQueries.$inferSelect;

// ============================================================================
// PREDICTIVE SCHEDULING - CAPACITY ALERTS BEFORE OVER-ALLOCATION
// ============================================================================

export const capacityAlerts = pgTable("capacity_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Alert details
  employeeId: varchar("employee_id").references(() => employees.id, { onDelete: 'cascade' }),
  managerId: varchar("manager_id").references(() => users.id),

  alertType: varchar("alert_type").notNull(), // 'over_allocated', 'under_utilized', 'conflict', 'approaching_limit'
  severity: varchar("severity").default('medium'), // 'low', 'medium', 'high', 'critical'

  // Capacity data
  weekStartDate: timestamp("week_start_date").notNull(),
  scheduledHours: decimal("scheduled_hours", { precision: 5, scale: 2 }),
  availableHours: decimal("available_hours", { precision: 5, scale: 2 }),
  overageHours: decimal("overage_hours", { precision: 5, scale: 2 }), // Hours over limit

  // Alert message
  message: text("message").notNull(),
  suggestedAction: text("suggested_action"), // AI-suggested fix

  // Status
  status: varchar("status").default('active'), // 'active', 'acknowledged', 'resolved', 'dismissed'
  acknowledgedBy: varchar("acknowledged_by").references(() => users.id),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  employeeIdx: index("capacity_alerts_employee_idx").on(table.employeeId),
  statusIdx: index("capacity_alerts_status_idx").on(table.status),
  weekIdx: index("capacity_alerts_week_idx").on(table.weekStartDate),
}));

export const insertCapacityAlertSchema = createInsertSchema(capacityAlerts).omit({
  id: true,
  createdAt: true,
});

export type InsertCapacityAlert = z.infer<typeof insertCapacityAlertSchema>;
export type CapacityAlert = typeof capacityAlerts.$inferSelect;

// ============================================================================
// AUTOMATED STATUS REPORTS - Auto-Generated Weekly Summaries
// ============================================================================

export const autoReports = pgTable("auto_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Report details
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  reportType: varchar("report_type").notNull(), // 'weekly_status', 'timesheet_summary', 'accomplishments'
  period: varchar("period").notNull(), // 'week_2025_01', 'month_2025_01', etc.

  // Generated content
  summary: text("summary").notNull(), // AI-generated summary
  accomplishments: text("accomplishments").array(), // Key wins
  blockers: text("blockers").array(), // Issues encountered
  nextSteps: text("next_steps").array(), // Planned activities

  // Metrics
  hoursWorked: decimal("hours_worked", { precision: 5, scale: 2 }),
  tasksCompleted: integer("tasks_completed"),
  meetingsAttended: integer("meetings_attended"),

  // Status
  status: varchar("status").default('draft'), // 'draft', 'reviewed', 'sent'
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  sentAt: timestamp("sent_at"),
  sentTo: text("sent_to").array(), // Email addresses or user IDs

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("auto_reports_user_idx").on(table.userId),
  periodIdx: index("auto_reports_period_idx").on(table.period),
  statusIdx: index("auto_reports_status_idx").on(table.status),
}));

export const insertAutoReportSchema = createInsertSchema(autoReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAutoReport = z.infer<typeof insertAutoReportSchema>;
export type AutoReport = typeof autoReports.$inferSelect;

// ============================================================================
// ONBOARDOS™ - EMPLOYEE ONBOARDING WORKFLOWS
// ============================================================================

// Onboarding workflow templates
export const onboardingTemplates = pgTable("onboarding_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Template details
  name: varchar("name").notNull(),
  description: text("description"),
  departmentName: varchar("department_name"), // Department name (no FK)
  roleTemplateId: varchar("role_template_id").references(() => roleTemplates.id),

  // Timeline
  durationDays: integer("duration_days").default(30), // Typical onboarding length

  // Status
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").references(() => users.id),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Onboarding tasks (checklist items for each template)
export const onboardingTasks = pgTable("onboarding_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => onboardingTemplates.id, { onDelete: 'cascade' }),

  // Task details
  title: varchar("title").notNull(),
  description: text("description"),
  taskType: varchar("task_type").notNull(), // 'document', 'training', 'meeting', 'equipment', 'access', 'orientation'

  // Assignment
  assignedTo: varchar("assigned_to"), // 'new_hire', 'manager', 'hr', 'it', specific_user_id
  dayOffset: integer("day_offset").default(0), // Day # in onboarding (0 = first day)

  // Requirements
  isRequired: boolean("is_required").default(true),
  requiresDocument: boolean("requires_document").default(false),
  requiresSignature: boolean("requires_signature").default(false),

  // Ordering
  sortOrder: integer("sort_order").default(0),

  createdAt: timestamp("created_at").defaultNow(),
});

// Active onboarding sessions for new hires
export const onboardingSessions = pgTable("onboarding_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Employee being onboarded
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  templateId: varchar("template_id").notNull().references(() => onboardingTemplates.id),

  // Timeline
  startDate: timestamp("start_date").notNull(),
  expectedEndDate: timestamp("expected_end_date"),
  actualEndDate: timestamp("actual_end_date"),

  // Progress tracking
  status: varchar("status").default('in_progress'), // 'in_progress', 'completed', 'overdue'
  completionPercentage: integer("completion_percentage").default(0),

  // Assignment
  managerId: varchar("manager_id").references(() => users.id),
  hrContactId: varchar("hr_contact_id").references(() => users.id),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Task completion tracking for each session
export const onboardingTaskCompletions = pgTable("onboarding_task_completions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => onboardingSessions.id, { onDelete: 'cascade' }),
  taskId: varchar("task_id").notNull().references(() => onboardingTasks.id, { onDelete: 'cascade' }),

  // Completion details
  status: varchar("status").default('pending'), // 'pending', 'in_progress', 'completed', 'skipped'
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by").references(() => users.id),

  // Documents/signatures
  documentUrl: varchar("document_url"),
  signatureUrl: varchar("signature_url"),
  notes: text("notes"),

  // Due date tracking
  dueDate: timestamp("due_date"),
  isOverdue: boolean("is_overdue").default(false),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertOnboardingTemplateSchema = createInsertSchema(onboardingTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOnboardingTaskSchema = createInsertSchema(onboardingTasks).omit({
  id: true,
  createdAt: true,
});

export const insertOnboardingSessionSchema = createInsertSchema(onboardingSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOnboardingTaskCompletionSchema = createInsertSchema(onboardingTaskCompletions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOnboardingTemplate = z.infer<typeof insertOnboardingTemplateSchema>;
export type OnboardingTemplate = typeof onboardingTemplates.$inferSelect;
export type InsertOnboardingTask = z.infer<typeof insertOnboardingTaskSchema>;
export type OnboardingTask = typeof onboardingTasks.$inferSelect;
export type InsertOnboardingSession = z.infer<typeof insertOnboardingSessionSchema>;
export type OnboardingSession = typeof onboardingSessions.$inferSelect;
export type InsertOnboardingTaskCompletion = z.infer<typeof insertOnboardingTaskCompletionSchema>;
export type OnboardingTaskCompletion = typeof onboardingTaskCompletions.$inferSelect;

// ============================================================================
// OFFBOARDOS™ - EXIT INTERVIEWS & OFFBOARDING WORKFLOWS
// ============================================================================

// Offboarding sessions
export const offboardingSessions = pgTable("offboarding_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Employee leaving
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  lastWorkDay: timestamp("last_work_day").notNull(),

  // Reason for leaving
  exitReason: varchar("exit_reason"), // 'resignation', 'termination', 'retirement', 'end_of_contract', 'other'
  exitReasonDetails: text("exit_reason_details"),
  isVoluntary: boolean("is_voluntary").default(true),

  // Exit interview
  exitInterviewScheduled: timestamp("exit_interview_scheduled"),
  exitInterviewCompleted: timestamp("exit_interview_completed"),
  exitInterviewConductedBy: varchar("exit_interview_conducted_by").references(() => users.id),
  exitInterviewNotes: text("exit_interview_notes"),

  // Asset returns
  assetsReturned: boolean("assets_returned").default(false),
  assetReturnNotes: text("asset_return_notes"),

  // Access revocation
  accessRevoked: boolean("access_revoked").default(false),
  accessRevokedAt: timestamp("access_revoked_at"),
  accessRevokedBy: varchar("access_revoked_by").references(() => users.id),

  // Final paycheck
  finalPayCalculated: boolean("final_pay_calculated").default(false),
  finalPayAmount: decimal("final_pay_amount", { precision: 10, scale: 2 }),
  finalPayDate: timestamp("final_pay_date"),

  // Clearance
  clearanceStatus: varchar("clearance_status").default('pending'), // 'pending', 'cleared', 'issues'
  clearanceNotes: text("clearance_notes"),

  // Rehire eligibility
  eligibleForRehire: boolean("eligible_for_rehire"),
  rehireNotes: text("rehire_notes"),

  // Status
  status: varchar("status").default('in_progress'), // 'in_progress', 'completed'
  completedAt: timestamp("completed_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Exit interview questions & responses
export const exitInterviewResponses = pgTable("exit_interview_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => offboardingSessions.id, { onDelete: 'cascade' }),

  // Question & answer
  question: text("question").notNull(),
  answer: text("answer"),
  rating: integer("rating"), // 1-5 scale for satisfaction questions

  // Categorization
  category: varchar("category"), // 'satisfaction', 'management', 'culture', 'compensation', 'growth', 'other'

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOffboardingSessionSchema = createInsertSchema(offboardingSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertExitInterviewResponseSchema = createInsertSchema(exitInterviewResponses).omit({
  id: true,
  createdAt: true,
});

export type InsertOffboardingSession = z.infer<typeof insertOffboardingSessionSchema>;
export type OffboardingSession = typeof offboardingSessions.$inferSelect;
export type InsertExitInterviewResponse = z.infer<typeof insertExitInterviewResponseSchema>;
export type ExitInterviewResponse = typeof exitInterviewResponses.$inferSelect;

// ============================================================================
// EXPENSEOS™ - EXPENSE TRACKING & REIMBURSEMENTS
// ============================================================================

export const expenseStatusEnum = pgEnum('expense_status', [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'reimbursed',
  'cancelled'
]);

export const expenseCategories = pgTable("expense_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

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
});

export const expenses = pgTable("expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Expense details
  employeeId: varchar("employee_id").notNull().references(() => employees.id),
  categoryId: varchar("category_id").notNull().references(() => expenseCategories.id),

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
  clientId: varchar("client_id").references(() => clients.id),
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
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectedBy: varchar("rejected_by").references(() => users.id),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  reviewNotes: text("review_notes"),

  // Reimbursement
  reimbursedAt: timestamp("reimbursed_at"),
  reimbursedBy: varchar("reimbursed_by").references(() => users.id),
  reimbursementMethod: varchar("reimbursement_method"), // 'direct_deposit', 'check', 'payroll'
  reimbursementReference: varchar("reimbursement_reference"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  employeeIdx: index("expenses_employee_idx").on(table.employeeId),
  statusIdx: index("expenses_status_idx").on(table.status),
  dateIdx: index("expenses_date_idx").on(table.expenseDate),
}));

export const insertExpenseCategorySchema = createInsertSchema(expenseCategories).omit({
  id: true,
  createdAt: true,
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertExpenseCategory = z.infer<typeof insertExpenseCategorySchema>;
export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;

// Expense Receipts (Multiple receipts per expense)
export const expenseReceipts = pgTable("expense_receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  expenseId: varchar("expense_id").notNull().references(() => expenses.id, { onDelete: 'cascade' }),

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
}, (table) => ({
  expenseIdx: index("expense_receipts_expense_idx").on(table.expenseId),
}));

export const insertExpenseReceiptSchema = createInsertSchema(expenseReceipts).omit({
  id: true,
  uploadedAt: true,
});

export type InsertExpenseReceipt = z.infer<typeof insertExpenseReceiptSchema>;
export type ExpenseReceipt = typeof expenseReceipts.$inferSelect;

// ============================================================================
// BUDGETOS™ - BUDGET PLANNING & FORECASTING
// ============================================================================

export const budgets = pgTable("budgets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

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
  ownerId: varchar("owner_id").references(() => users.id),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),

  // Status
  status: varchar("status").default('draft'), // 'draft', 'submitted', 'approved', 'active', 'closed'

  // Alerts
  alertThreshold: integer("alert_threshold").default(80), // Alert when X% spent
  isOverBudget: boolean("is_over_budget").default(false),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Budget line items (detailed breakdown)
export const budgetLineItems = pgTable("budget_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  budgetId: varchar("budget_id").notNull().references(() => budgets.id, { onDelete: 'cascade' }),

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

// Budget variance analysis (monthly snapshots)
export const budgetVariances = pgTable("budget_variances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  budgetId: varchar("budget_id").notNull().references(() => budgets.id, { onDelete: 'cascade' }),

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
}, (table) => ({
  budgetMonthIdx: index("budget_variances_month_idx").on(table.budgetId, table.year, table.month),
}));

export const insertBudgetSchema = createInsertSchema(budgets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBudgetLineItemSchema = createInsertSchema(budgetLineItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBudgetVarianceSchema = createInsertSchema(budgetVariances).omit({
  id: true,
  createdAt: true,
});

export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type Budget = typeof budgets.$inferSelect;
export type InsertBudgetLineItem = z.infer<typeof insertBudgetLineItemSchema>;
export type BudgetLineItem = typeof budgetLineItems.$inferSelect;
export type InsertBudgetVariance = z.infer<typeof insertBudgetVarianceSchema>;
export type BudgetVariance = typeof budgetVariances.$inferSelect;

// ============================================================================
// TRAININGOS™ - LEARNING MANAGEMENT SYSTEM
// ============================================================================

// Training courses/programs
export const trainingCourses = pgTable("training_courses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Course details
  title: varchar("title").notNull(),
  description: text("description"),
  category: varchar("category"), // 'compliance', 'technical', 'leadership', 'soft_skills', 'safety'

  // Content
  courseType: varchar("course_type").notNull(), // 'online', 'in_person', 'hybrid', 'self_paced'
  duration: integer("duration"), // Minutes
  contentUrl: varchar("content_url"), // Link to course materials
  videoUrl: varchar("video_url"),

  // Requirements
  isRequired: boolean("is_required").default(false),
  expiresAfterDays: integer("expires_after_days"), // Requires renewal (e.g., 365 for annual training)
  passingScore: integer("passing_score"), // Minimum % to pass

  // Access
  requiresApproval: boolean("requires_approval").default(false),
  maxEnrollments: integer("max_enrollments"),

  // Instructor
  instructorId: varchar("instructor_id").references(() => users.id),
  instructorName: varchar("instructor_name"),

  // Status
  isActive: boolean("is_active").default(true),
  publishedAt: timestamp("published_at"),

  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Course enrollments
export const trainingEnrollments = pgTable("training_enrollments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").notNull().references(() => trainingCourses.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),

  // Enrollment details
  enrolledAt: timestamp("enrolled_at").defaultNow(),
  enrolledBy: varchar("enrolled_by").references(() => users.id), // Manager or self

  // Progress
  status: varchar("status").default('enrolled'), // 'enrolled', 'in_progress', 'completed', 'failed', 'expired'
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at"),

  // Assessment
  assessmentScore: integer("assessment_score"), // Percentage
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),

  // Certification
  certificateUrl: varchar("certificate_url"),
  certificateIssuedAt: timestamp("certificate_issued_at"),

  // Feedback
  rating: integer("rating"), // 1-5 stars
  feedback: text("feedback"),

  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  employeeIdx: index("training_enrollments_employee_idx").on(table.employeeId),
  statusIdx: index("training_enrollments_status_idx").on(table.status),
  expiresIdx: index("training_enrollments_expires_idx").on(table.expiresAt),
}));

// Training certifications/credentials
export const trainingCertifications = pgTable("training_certifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),

  // Certification details
  name: varchar("name").notNull(),
  issuingOrganization: varchar("issuing_organization"),
  certificationNumber: varchar("certification_number"),

  // Dates
  issuedDate: timestamp("issued_date").notNull(),
  expiryDate: timestamp("expiry_date"),

  // Documentation
  certificateUrl: varchar("certificate_url"),
  verificationUrl: varchar("verification_url"),

  // Status
  status: varchar("status").default('active'), // 'active', 'expired', 'revoked'

  // Linked to course (if applicable)
  courseId: varchar("course_id").references(() => trainingCourses.id),
  enrollmentId: varchar("enrollment_id").references(() => trainingEnrollments.id),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  employeeIdx: index("training_certifications_employee_idx").on(table.employeeId),
  expiryIdx: index("training_certifications_expiry_idx").on(table.expiryDate),
  statusIdx: index("training_certifications_status_idx").on(table.status),
}));

export const insertTrainingCourseSchema = createInsertSchema(trainingCourses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTrainingEnrollmentSchema = createInsertSchema(trainingEnrollments).omit({
  id: true,
  enrolledAt: true,
  updatedAt: true,
});

export const insertTrainingCertificationSchema = createInsertSchema(trainingCertifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTrainingCourse = z.infer<typeof insertTrainingCourseSchema>;
export type TrainingCourse = typeof trainingCourses.$inferSelect;
export type InsertTrainingEnrollment = z.infer<typeof insertTrainingEnrollmentSchema>;
export type TrainingEnrollment = typeof trainingEnrollments.$inferSelect;
export type InsertTrainingCertification = z.infer<typeof insertTrainingCertificationSchema>;
export type TrainingCertification = typeof trainingCertifications.$inferSelect;

// ============================================================================
// DISPUTES - CHALLENGE PERFORMANCE REVIEWS, EMPLOYER RATINGS, & RMS FORMS
// ============================================================================
// NOTE: Write-ups/disciplinary actions are handled through ReportOS™ (RMS) forms
// Employees can dispute those RMS forms using this disputes system

export const disputes = pgTable("disputes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Who filed the dispute
  filedBy: varchar("filed_by").notNull().references(() => users.id),
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
  assignedTo: varchar("assigned_to").references(() => users.id), // HR/Manager reviewing the dispute
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
  resolvedBy: varchar("resolved_by").references(() => users.id),
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

// ============================================================================
// SCHEMA EXPORTS - Disputes Only (Write-Ups handled via RMS)
// ============================================================================

// Enhanced insert schema with validation
export const insertDisputeSchema = createInsertSchema(disputes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  disputeType: z.enum(['performance_review', 'employer_rating', 'report_submission', 'composite_score']),
  targetType: z.enum(['performance_reviews', 'employer_ratings', 'report_submissions', 'composite_scores']),
  title: z.string().min(5).max(200),
  reason: z.string().min(20).max(5000),
  evidence: z.array(z.string().url()).optional(),
  requestedOutcome: z.string().max(1000).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  status: z.enum(['pending', 'under_review', 'resolved', 'rejected', 'appealed']).default('pending'),
});

// Schema for creating a new dispute (client-facing)
export const createDisputeSchema = insertDisputeSchema.omit({
  workspaceId: true,
  filedBy: true,
  filedByRole: true,
  filedAt: true,
  assignedTo: true,
  assignedAt: true,
  reviewDeadline: true,
  reviewStartedAt: true,
  reviewerNotes: true,
  reviewerRecommendation: true,
  resolvedAt: true,
  resolvedBy: true,
  resolution: true,
  resolutionAction: true,
  changesApplied: true,
  changesAppliedAt: true,
  canBeAppealed: true,
  appealDeadline: true,
  appealedToUpperManagement: true,
  statusHistory: true,
});

export type InsertDispute = z.infer<typeof insertDisputeSchema>;
export type CreateDispute = z.infer<typeof createDisputeSchema>;
export type Dispute = typeof disputes.$inferSelect;

// ============================================================================
// RECORDOS™ - NATURAL LANGUAGE SEARCH
// ============================================================================

export const searchQueries = pgTable("search_queries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Search details
  query: text("query").notNull(), // Natural language search query
  searchType: varchar("search_type").notNull(), // 'employees', 'invoices', 'time_entries', 'all', etc.
  resultsCount: integer("results_count").default(0),

  // AI processing
  aiProcessed: boolean("ai_processed").default(false),
  aiInterpretation: text("ai_interpretation"), // How AI understood the query
  searchFilters: text("search_filters"), // JSON of applied filters

  executionTimeMs: integer("execution_time_ms"), // Performance tracking
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("search_queries_workspace_idx").on(table.workspaceId),
  userIdx: index("search_queries_user_idx").on(table.userId),
  typeIdx: index("search_queries_type_idx").on(table.searchType),
}));

export const insertSearchQuerySchema = createInsertSchema(searchQueries).omit({
  id: true,
  createdAt: true,
});

export type InsertSearchQuery = z.infer<typeof insertSearchQuerySchema>;
export type SearchQuery = typeof searchQueries.$inferSelect;

// ============================================================================
// INSIGHTOS™ - AI ANALYTICS & AUTONOMOUS INSIGHTS
// ============================================================================

export const aiInsights = pgTable("ai_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Insight metadata
  title: varchar("title", { length: 200 }).notNull(),
  category: varchar("category").notNull(), // 'cost_savings', 'productivity', 'anomaly', 'prediction', 'recommendation'
  priority: varchar("priority").default('normal'), // 'low', 'normal', 'high', 'critical'

  // Insight content
  summary: text("summary").notNull(), // Short description
  details: text("details"), // Full analysis
  dataPoints: text("data_points"), // JSON array of supporting metrics

  // AI generation details
  generatedBy: varchar("generated_by").default('gpt-4'), // AI model used
  confidence: decimal("confidence", { precision: 5, scale: 2 }), // 0-100 confidence score

  // Actions & impact
  actionable: boolean("actionable").default(true),
  suggestedActions: text("suggested_actions").array(), // Array of recommended actions
  estimatedImpact: varchar("estimated_impact"), // e.g., "$5K savings", "20% faster"

  // Status
  status: varchar("status").default('active'), // 'active', 'dismissed', 'acted_upon'
  dismissedBy: varchar("dismissed_by").references(() => users.id),
  dismissedAt: timestamp("dismissed_at"),
  dismissReason: text("dismiss_reason"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("ai_insights_workspace_idx").on(table.workspaceId),
  categoryIdx: index("ai_insights_category_idx").on(table.category),
  priorityIdx: index("ai_insights_priority_idx").on(table.priority),
  statusIdx: index("ai_insights_status_idx").on(table.status),
}));

export const insertAiInsightSchema = createInsertSchema(aiInsights).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiInsight = z.infer<typeof insertAiInsightSchema>;
export type AiInsight = typeof aiInsights.$inferSelect;

// Metrics snapshots for trend analysis
export const metricsSnapshots = pgTable("metrics_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Snapshot timing
  snapshotDate: timestamp("snapshot_date").notNull(),
  period: varchar("period").notNull(), // 'daily', 'weekly', 'monthly'

  // Core metrics (JSON for flexibility)
  metrics: text("metrics").notNull(), // JSON object with all metrics

  // Key performance indicators
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }),
  totalExpenses: decimal("total_expenses", { precision: 12, scale: 2 }),
  netProfit: decimal("net_profit", { precision: 12, scale: 2 }),
  employeeCount: integer("employee_count"),
  activeClients: integer("active_clients"),
  hoursTracked: decimal("hours_tracked", { precision: 10, scale: 2 }),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("metrics_snapshots_workspace_idx").on(table.workspaceId),
  dateIdx: index("metrics_snapshots_date_idx").on(table.snapshotDate),
  periodIdx: index("metrics_snapshots_period_idx").on(table.period),
}));

export const insertMetricsSnapshotSchema = createInsertSchema(metricsSnapshots).omit({
  id: true,
  createdAt: true,
});

export type InsertMetricsSnapshot = z.infer<typeof insertMetricsSnapshotSchema>;
export type MetricsSnapshot = typeof metricsSnapshots.$inferSelect;

// ============================================================================
// ONLINE PAYMENTS - STRIPE INTEGRATION FOR INVOICE PAYMENTS
// ============================================================================

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'processing',
  'succeeded',
  'failed',
  'canceled',
  'refunded',
  'partially_refunded'
]);

export const invoicePayments = pgTable("invoice_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  invoiceId: varchar("invoice_id").notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  
  // Stripe details
  stripePaymentIntentId: varchar("stripe_payment_intent_id").unique(),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeChargeId: varchar("stripe_charge_id"),
  
  // Payment details
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency").default('usd'),
  status: paymentStatusEnum("status").default('pending'),
  
  // Customer info (for end customers paying invoices)
  payerEmail: varchar("payer_email"),
  payerName: varchar("payer_name"),
  
  // Metadata
  paymentMethod: varchar("payment_method"), // 'card', 'bank_transfer', 'ach', etc.
  last4: varchar("last4"), // Last 4 digits of card
  receiptUrl: varchar("receipt_url"),
  
  // Refund tracking
  refundedAmount: decimal("refunded_amount", { precision: 10, scale: 2 }).default("0.00"),
  refundReason: text("refund_reason"),
  refundedAt: timestamp("refunded_at"),
  
  // Error handling
  failureCode: varchar("failure_code"),
  failureMessage: text("failure_message"),
  
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("invoice_payments_workspace_idx").on(table.workspaceId),
  invoiceIdx: index("invoice_payments_invoice_idx").on(table.invoiceId),
  statusIdx: index("invoice_payments_status_idx").on(table.status),
  stripeIntentIdx: index("invoice_payments_stripe_intent_idx").on(table.stripePaymentIntentId),
}));

export const insertInvoicePaymentSchema = createInsertSchema(invoicePayments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInvoicePayment = z.infer<typeof insertInvoicePaymentSchema>;
export type InvoicePayment = typeof invoicePayments.$inferSelect;

// ============================================================================
// EMPLOYEE PAYROLL INFORMATION - TAX FORMS & DIRECT DEPOSIT
// ============================================================================

// Employee Payroll Information
export const employeePayrollInfo = pgTable("employee_payroll_info", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().unique().references(() => employees.id, { onDelete: 'cascade' }),
  
  // Tax information
  ssn: varchar("ssn"), // Encrypted in production
  taxFilingStatus: varchar("tax_filing_status"), // Single, Married, Head of Household
  federalAllowances: integer("federal_allowances").default(0),
  stateAllowances: integer("state_allowances").default(0),
  additionalWithholding: decimal("additional_withholding", { precision: 10, scale: 2 }).default("0.00"),
  
  // W4 form data
  w4Completed: boolean("w4_completed").default(false),
  w4CompletedAt: timestamp("w4_completed_at"),
  w4DocumentId: varchar("w4_document_id").references(() => employeeFiles.id),
  
  // I9 form data
  i9Completed: boolean("i9_completed").default(false),
  i9CompletedAt: timestamp("i9_completed_at"),
  i9DocumentId: varchar("i9_document_id").references(() => employeeFiles.id),
  i9ExpirationDate: timestamp("i9_expiration_date"),
  
  // Direct deposit
  bankName: varchar("bank_name"),
  bankAccountType: varchar("bank_account_type"), // 'checking', 'savings'
  bankRoutingNumber: varchar("bank_routing_number"), // Encrypted
  bankAccountNumber: varchar("bank_account_number"), // Encrypted
  directDepositEnabled: boolean("direct_deposit_enabled").default(false),
  
  // Emergency tax info
  stateOfResidence: varchar("state_of_residence"),
  localTaxJurisdiction: varchar("local_tax_jurisdiction"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("employee_payroll_info_workspace_idx").on(table.workspaceId),
  employeeIdx: index("employee_payroll_info_employee_idx").on(table.employeeId),
}));

export const insertEmployeePayrollInfoSchema = createInsertSchema(employeePayrollInfo).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeePayrollInfo = z.infer<typeof insertEmployeePayrollInfoSchema>;
export type EmployeePayrollInfo = typeof employeePayrollInfo.$inferSelect;

// ============================================================================
// EMPLOYEE AVAILABILITY - SCHEDULEOS™ INTEGRATION
// ============================================================================

export const availabilityStatusEnum = pgEnum('availability_status', [
  'available',
  'unavailable',
  'preferred',
  'limited'
]);

export const employeeAvailability = pgTable("employee_availability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  
  // Recurring weekly availability
  dayOfWeek: integer("day_of_week").notNull(), // 0-6 (Sunday-Saturday)
  startTime: varchar("start_time").notNull(), // "09:00" format
  endTime: varchar("end_time").notNull(), // "17:00" format
  
  status: availabilityStatusEnum("status").default('available'),
  
  // Metadata
  notes: text("notes"),
  effectiveFrom: timestamp("effective_from").defaultNow(),
  effectiveUntil: timestamp("effective_until"), // Optional end date
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("employee_availability_workspace_idx").on(table.workspaceId),
  employeeIdx: index("employee_availability_employee_idx").on(table.employeeId),
  dayIdx: index("employee_availability_day_idx").on(table.dayOfWeek),
}));

export const insertEmployeeAvailabilitySchema = createInsertSchema(employeeAvailability).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeAvailability = z.infer<typeof insertEmployeeAvailabilitySchema>;
export type EmployeeAvailability = typeof employeeAvailability.$inferSelect;

// Time-off requests (unavailability)
export const timeOffRequests = pgTable("time_off_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  
  // Request details
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  requestType: varchar("request_type").notNull(), // 'vacation', 'sick', 'personal', 'unpaid'
  totalDays: integer("total_days"),
  reason: text("reason"),
  notes: text("notes"),
  
  // Approval workflow
  status: varchar("status").default('pending'), // 'pending', 'approved', 'denied'
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  
  // AI scheduling impact
  affectsScheduling: boolean("affects_scheduling").default(true),
  aiNotified: boolean("ai_notified").default(false), // Has ScheduleOS been notified?
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("time_off_requests_workspace_idx").on(table.workspaceId),
  employeeIdx: index("time_off_requests_employee_idx").on(table.employeeId),
  statusIdx: index("time_off_requests_status_idx").on(table.status),
  dateRangeIdx: index("time_off_requests_date_range_idx").on(table.startDate, table.endDate),
}));

export const insertTimeOffRequestSchema = createInsertSchema(timeOffRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTimeOffRequest = z.infer<typeof insertTimeOffRequestSchema>;
export type TimeOffRequest = typeof timeOffRequests.$inferSelect;

// ============================================================================
// SHIFT MANAGEMENT - ACCEPT/DENY/SWITCH WITH APPROVAL
// ============================================================================

export const shiftActionTypeEnum = pgEnum('shift_action_type', [
  'accept',
  'deny',
  'switch_request',
  'cover_request'
]);

export const shiftActionStatusEnum = pgEnum('shift_action_status', [
  'pending',
  'approved',
  'denied',
  'completed',
  'canceled'
]);

export const shiftActions = pgTable("shift_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  shiftId: varchar("shift_id").notNull().references(() => shifts.id, { onDelete: 'cascade' }),
  
  // Action details
  actionType: shiftActionTypeEnum("action_type").notNull(),
  requestedBy: varchar("requested_by").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  
  // For switch/cover requests
  targetEmployeeId: varchar("target_employee_id").references(() => employees.id), // Who should take the shift
  reason: text("reason"),
  
  // Approval workflow
  status: shiftActionStatusEnum("status").default('pending'),
  requiresApproval: boolean("requires_approval").default(true),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  denialReason: text("denial_reason"),
  
  // AI scheduling impact
  aiScheduleUpdated: boolean("ai_schedule_updated").default(false),
  replacementShiftId: varchar("replacement_shift_id").references(() => shifts.id), // New shift created
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("shift_actions_workspace_idx").on(table.workspaceId),
  shiftIdx: index("shift_actions_shift_idx").on(table.shiftId),
  requestedByIdx: index("shift_actions_requested_by_idx").on(table.requestedBy),
  statusIdx: index("shift_actions_status_idx").on(table.status),
  actionTypeIdx: index("shift_actions_action_type_idx").on(table.actionType),
}));

export const insertShiftActionSchema = createInsertSchema(shiftActions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertShiftAction = z.infer<typeof insertShiftActionSchema>;
export type ShiftAction = typeof shiftActions.$inferSelect;

// ============================================================================
// TIMESHEET EDIT PERMISSIONS - EMPLOYEE REQUESTS ONLY
// ============================================================================

export const timesheetEditRequestStatusEnum = pgEnum('timesheet_edit_request_status', [
  'pending',
  'approved',
  'denied',
  'applied'
]);

export const timesheetEditRequests = pgTable("timesheet_edit_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  timeEntryId: varchar("time_entry_id").notNull().references(() => timeEntries.id, { onDelete: 'cascade' }),
  
  // Request details
  requestedBy: varchar("requested_by").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  reason: text("reason").notNull(),
  
  // Proposed changes
  proposedClockIn: timestamp("proposed_clock_in"),
  proposedClockOut: timestamp("proposed_clock_out"),
  proposedNotes: text("proposed_notes"),
  
  // Current values (for comparison)
  originalClockIn: timestamp("original_clock_in"),
  originalClockOut: timestamp("original_clock_out"),
  originalNotes: text("original_notes"),
  
  // Approval workflow
  status: timesheetEditRequestStatusEnum("status").default('pending'),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  
  // Applied changes
  appliedBy: varchar("applied_by").references(() => users.id),
  appliedAt: timestamp("applied_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("timesheet_edit_requests_workspace_idx").on(table.workspaceId),
  timeEntryIdx: index("timesheet_edit_requests_time_entry_idx").on(table.timeEntryId),
  requestedByIdx: index("timesheet_edit_requests_requested_by_idx").on(table.requestedBy),
  statusIdx: index("timesheet_edit_requests_status_idx").on(table.status),
}));

export const insertTimesheetEditRequestSchema = createInsertSchema(timesheetEditRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTimesheetEditRequest = z.infer<typeof insertTimesheetEditRequestSchema>;
export type TimesheetEditRequest = typeof timesheetEditRequests.$inferSelect;

// ============================================================================
// CONTRACT DOCUMENTS - I9, W9, W4 ONBOARDING
// ============================================================================

export const contractDocumentTypeEnum = pgEnum('contract_document_type', [
  'i9', // Employment Eligibility Verification
  'w4', // Employee's Withholding Certificate
  'w9', // Contractor Tax Information
  'nda', // Non-Disclosure Agreement
  'employment_agreement',
  'contractor_agreement',
  'handbook_acknowledgment',
  'policy_acknowledgment',
  'direct_deposit_authorization',
  'background_check_consent',
  'drug_test_consent',
  'other'
]);

export const contractDocuments = pgTable("contract_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  
  // Document details
  documentType: contractDocumentTypeEnum("document_type").notNull(),
  documentName: varchar("document_name").notNull(),
  
  // Template source
  templateId: varchar("template_id"), // Reference to document template
  
  // File storage
  fileUrl: varchar("file_url").notNull(),
  signedFileUrl: varchar("signed_file_url"),
  
  // Signature tracking
  requiresSignature: boolean("requires_signature").default(true),
  signedBy: varchar("signed_by").references(() => users.id),
  signedAt: timestamp("signed_at"),
  ipAddress: varchar("ip_address"), // IP when signed
  
  // Employer signature (if needed)
  requiresEmployerSignature: boolean("requires_employer_signature").default(false),
  employerSignedBy: varchar("employer_signed_by").references(() => users.id),
  employerSignedAt: timestamp("employer_signed_at"),
  
  // Completion & compliance
  isCompleted: boolean("is_completed").default(false),
  completedAt: timestamp("completed_at"),
  isRequired: boolean("is_required").default(true),
  mustCompleteBeforeWork: boolean("must_complete_before_work").default(true),
  
  // Expiration
  expirationDate: timestamp("expiration_date"),
  
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("contract_documents_workspace_idx").on(table.workspaceId),
  employeeIdx: index("contract_documents_employee_idx").on(table.employeeId),
  typeIdx: index("contract_documents_type_idx").on(table.documentType),
  completedIdx: index("contract_documents_completed_idx").on(table.isCompleted),
  requiredIdx: index("contract_documents_required_idx").on(table.isRequired, table.mustCompleteBeforeWork),
}));

export const insertContractDocumentSchema = createInsertSchema(contractDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContractDocument = z.infer<typeof insertContractDocumentSchema>;
export type ContractDocument = typeof contractDocuments.$inferSelect;

// ============================================================================
// ORGANIZATION ONBOARDING - COMPLETE SETUP WORKFLOW
// ============================================================================

export const organizationOnboarding = pgTable("organization_onboarding", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Setup progress
  currentStep: integer("current_step").default(1),
  totalSteps: integer("total_steps").default(8),
  isCompleted: boolean("is_completed").default(false),
  
  // Step completion tracking
  step1CompanyInfo: boolean("step1_company_info").default(false),
  step2BillingInfo: boolean("step2_billing_info").default(false),
  step3RolesPermissions: boolean("step3_roles_permissions").default(false),
  step4InviteEmployees: boolean("step4_invite_employees").default(false),
  step5AddCustomers: boolean("step5_add_customers").default(false),
  step6ConfigurePayroll: boolean("step6_configure_payroll").default(false),
  step7SetupIntegrations: boolean("step7_setup_integrations").default(false),
  step8ReviewLaunch: boolean("step8_review_launch").default(false),
  
  // Completion tracking
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by").references(() => users.id),
  
  // Skip tracking
  skippedSteps: text("skipped_steps").array().default(sql`ARRAY[]::text[]`),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("organization_onboarding_workspace_idx").on(table.workspaceId),
  completedIdx: index("organization_onboarding_completed_idx").on(table.isCompleted),
}));

export const insertOrganizationOnboardingSchema = createInsertSchema(organizationOnboarding).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrganizationOnboarding = z.infer<typeof insertOrganizationOnboardingSchema>;
export type OrganizationOnboarding = typeof organizationOnboarding.$inferSelect;

// ============================================================================
// COMMOS - ORGANIZATION CHAT ROOMS & CHANNELS
// ============================================================================

// Room status enum
export const roomStatusEnum = pgEnum('room_status', [
  'active',      // Room is open and operational
  'suspended',   // Room is frozen/locked by support staff
  'closed',      // Room is permanently closed
]);

// Room member role enum
export const roomMemberRoleEnum = pgEnum('room_member_role', [
  'owner',       // Organization creator - full control
  'admin',       // Leadership/management - can manage room
  'member',      // Regular employee/user
  'guest',       // End customer - limited access
]);

// Organization Chat Rooms - Main communication channels for organizations
export const organizationChatRooms = pgTable("organization_chat_rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Room identification
  roomName: varchar("room_name").notNull(), // "Customer Support", "Main Office", etc.
  roomSlug: varchar("room_slug").notNull(), // URL-friendly: "customer-support", "main-office"
  description: text("description"),
  
  // Room status
  status: roomStatusEnum("status").default("active"),
  suspendedReason: text("suspended_reason"),
  suspendedAt: timestamp("suspended_at"),
  suspendedBy: varchar("suspended_by").references(() => users.id), // Support staff who suspended
  
  // Associated chat conversation (links to existing chat system)
  conversationId: varchar("conversation_id").references(() => chatConversations.id, { onDelete: 'set null' }),
  
  // Onboarding status
  isOnboarded: boolean("is_onboarded").default(false),
  onboardedAt: timestamp("onboarded_at"),
  onboardedBy: varchar("onboarded_by").references(() => users.id),
  
  // Settings
  allowGuests: boolean("allow_guests").default(true), // Allow end customers
  requireApproval: boolean("require_approval").default(false), // Require approval to join
  maxMembers: integer("max_members").default(100),
  
  // Metadata
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("org_chat_rooms_workspace_idx").on(table.workspaceId),
  statusIdx: index("org_chat_rooms_status_idx").on(table.status),
  slugIdx: uniqueIndex("org_chat_rooms_slug_idx").on(table.workspaceId, table.roomSlug),
}));

export const insertOrganizationChatRoomSchema = createInsertSchema(organizationChatRooms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrganizationChatRoom = z.infer<typeof insertOrganizationChatRoomSchema>;
export type OrganizationChatRoom = typeof organizationChatRooms.$inferSelect;

// Organization Chat Channels - Sub-channels for meetings, departments, etc.
export const organizationChatChannels = pgTable("organization_chat_channels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull().references(() => organizationChatRooms.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Channel identification
  channelName: varchar("channel_name").notNull(), // "Weekly Meetings", "IT Department", etc.
  channelSlug: varchar("channel_slug").notNull(), // "weekly-meetings", "it-department"
  description: text("description"),
  channelType: varchar("channel_type").default("general"), // "general", "meeting", "department", "project"
  
  // Associated chat conversation
  conversationId: varchar("conversation_id").references(() => chatConversations.id, { onDelete: 'set null' }),
  
  // Settings
  isPrivate: boolean("is_private").default(false), // Private channels require invitation
  allowGuests: boolean("allow_guests").default(false), // Override room setting
  
  // Metadata
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  roomIdx: index("org_chat_channels_room_idx").on(table.roomId),
  workspaceIdx: index("org_chat_channels_workspace_idx").on(table.workspaceId),
  slugIdx: uniqueIndex("org_chat_channels_slug_idx").on(table.roomId, table.channelSlug),
}));

export const insertOrganizationChatChannelSchema = createInsertSchema(organizationChatChannels).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrganizationChatChannel = z.infer<typeof insertOrganizationChatChannelSchema>;
export type OrganizationChatChannel = typeof organizationChatChannels.$inferSelect;

// Organization Room Members - Access control for rooms and channels
export const organizationRoomMembers = pgTable("organization_room_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull().references(() => organizationChatRooms.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Role and permissions
  role: roomMemberRoleEnum("role").default("member"),
  canInvite: boolean("can_invite").default(false),
  canManage: boolean("can_manage").default(false), // Can edit room settings
  
  // Join tracking
  joinedAt: timestamp("joined_at").defaultNow(),
  lastActiveAt: timestamp("last_active_at"),
  
  // Approval workflow
  isApproved: boolean("is_approved").default(true), // Auto-approved unless room requires approval
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  roomIdx: index("org_room_members_room_idx").on(table.roomId),
  userIdx: index("org_room_members_user_idx").on(table.userId),
  workspaceIdx: index("org_room_members_workspace_idx").on(table.workspaceId),
  uniqueMember: uniqueIndex("org_room_members_unique_idx").on(table.roomId, table.userId),
}));

export const insertOrganizationRoomMemberSchema = createInsertSchema(organizationRoomMembers).omit({
  id: true,
  createdAt: true,
});

export type InsertOrganizationRoomMember = z.infer<typeof insertOrganizationRoomMemberSchema>;
export type OrganizationRoomMember = typeof organizationRoomMembers.$inferSelect;

// Organization Room Onboarding - Tracks chat room onboarding flow
export const organizationRoomOnboarding = pgTable("organization_room_onboarding", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Progress tracking
  currentStep: integer("current_step").default(1),
  totalSteps: integer("total_steps").default(4),
  isCompleted: boolean("is_completed").default(false),
  
  // Step completion
  step1RoomName: boolean("step1_room_name").default(false), // Name the room
  step2Channels: boolean("step2_channels").default(false),  // Add sub-channels
  step3Members: boolean("step3_members").default(false),    // Assign roles
  step4Settings: boolean("step4_settings").default(false),  // Configure settings
  
  // Onboarding data (collected during flow)
  roomNameInput: varchar("room_name_input"),
  channelsInput: text("channels_input").array().default(sql`ARRAY[]::text[]`), // Array of channel names
  guestAccessEnabled: boolean("guest_access_enabled").default(true),
  
  // Completion
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by").references(() => users.id),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("org_room_onboarding_workspace_idx").on(table.workspaceId),
  completedIdx: index("org_room_onboarding_completed_idx").on(table.isCompleted),
}));

export const insertOrganizationRoomOnboardingSchema = createInsertSchema(organizationRoomOnboarding).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrganizationRoomOnboarding = z.infer<typeof insertOrganizationRoomOnboardingSchema>;
export type OrganizationRoomOnboarding = typeof organizationRoomOnboarding.$inferSelect;

// ============================================================================
// NOTIFICATIONS - REAL-TIME USER NOTIFICATIONS
// ============================================================================

// Notification type enum
export const notificationTypeEnum = pgEnum('notification_type', [
  'shift_assigned',      // New shift assigned to user
  'shift_changed',       // Shift details changed (time, location, etc.)
  'shift_cancelled',     // Shift was cancelled
  'pto_approved',        // PTO request approved
  'pto_denied',          // PTO request denied
  'schedule_change',     // Schedule changed by manager
  'document_uploaded',   // New document uploaded for user
  'document_expiring',   // Document expiring soon
  'profile_updated',     // Profile updated by admin
  'form_assigned',       // New form/paperwork assigned
  'timesheet_approved',  // Timesheet approved
  'timesheet_rejected',  // Timesheet rejected
  'payroll_processed',   // Payroll processed
  'mention',             // User mentioned in chat/comment
  'support_escalation',  // HelpOS bot escalated ticket to human support
  'system',              // System notification
]);

// Notifications table - user-specific, organization-scoped
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Notification content
  type: notificationTypeEnum("type").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  
  // Status
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  
  // Navigation
  actionUrl: varchar("action_url", { length: 500 }), // Where to go when clicked
  
  // Related entities (for tracking what triggered the notification)
  relatedEntityType: varchar("related_entity_type", { length: 100 }), // e.g., 'shift', 'employee', 'document'
  relatedEntityId: varchar("related_entity_id"), // ID of the related entity
  
  // Metadata
  metadata: jsonb("metadata"), // Additional data (shift details, document name, etc.)
  
  // Audit
  createdBy: varchar("created_by").references(() => users.id), // Who triggered this notification
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("notifications_user_idx").on(table.userId),
  workspaceIdx: index("notifications_workspace_idx").on(table.workspaceId),
  isReadIdx: index("notifications_is_read_idx").on(table.isRead),
  createdAtIdx: index("notifications_created_at_idx").on(table.createdAt),
  typeIdx: index("notifications_type_idx").on(table.type),
}));

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// ============================================================================
// CHAT SYSTEM ENHANCEMENTS - Connection Tracking, Routing, CSAT
// ============================================================================

// Chat Connections - Track WebSocket connections for analytics
export const chatConnections = pgTable("chat_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: varchar("session_id", { length: 255 }).notNull().unique(), // Unique and required to prevent duplicate sessions
  
  // Connection lifecycle
  connectedAt: timestamp("connected_at").defaultNow(),
  disconnectedAt: timestamp("disconnected_at"),
  
  // Client info
  ipAddress: varchar("ip_address", { length: 45 }), // IPv6 max length
  userAgent: text("user_agent"),
  
  // Disconnect tracking
  disconnectReason: varchar("disconnect_reason", { length: 50 }), // 'user_logout', 'timeout', 'error', etc.
}, (table) => ({
  userConnectedIdx: index("chat_connections_user_connected_idx").on(table.userId, table.connectedAt),
}));

// Agent Availability - Track agent status for smart routing
export const agentAvailability = pgTable("agent_availability", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  
  // Status tracking
  status: varchar("status", { length: 20 }).notNull().default('offline'), // 'online', 'away', 'busy', 'offline'
  
  // Capacity management
  maxConcurrentChats: integer("max_concurrent_chats").default(5),
  currentChatCount: integer("current_chat_count").default(0),
  
  // Activity tracking
  lastActivity: timestamp("last_activity"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  statusIdx: index("agent_availability_status_idx").on(table.status, table.updatedAt),
}));

// Routing Rules - Smart routing based on keywords
export const routingRules = pgTable("routing_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'set null' }), // Optional workspace scoping
  
  // Rule definition
  keyword: varchar("keyword", { length: 255 }).notNull(),
  department: varchar("department", { length: 100 }),
  priority: integer("priority").default(0), // Higher = more important
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  keywordIdx: index("routing_rules_keyword_idx").on(table.keyword),
  departmentIdx: index("routing_rules_department_idx").on(table.department),
  priorityIdx: index("routing_rules_priority_idx").on(table.priority),
}));

// Satisfaction Surveys - CSAT responses after ticket resolution
export const satisfactionSurveys = pgTable("satisfaction_surveys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Related entities
  ticketId: varchar("ticket_id").unique().references(() => supportTickets.id, { onDelete: 'set null' }), // Unique to prevent duplicate surveys
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  agentId: varchar("agent_id").references(() => users.id, { onDelete: 'set null' }),
  
  // Survey response
  rating: integer("rating").notNull(), // 1-5 scale, validated at DB level
  feedback: text("feedback"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("satisfaction_surveys_ticket_idx").on(table.ticketId),
  index("satisfaction_surveys_agent_date_idx").on(table.agentId, table.createdAt),
  check("rating_valid", sql`${table.rating} BETWEEN 1 AND 5`), // DB-level validation
]);

export const insertChatConnectionSchema = createInsertSchema(chatConnections).omit({
  id: true,
  connectedAt: true,
});

export const insertAgentAvailabilitySchema = createInsertSchema(agentAvailability).omit({
  updatedAt: true,
});

export const insertRoutingRuleSchema = createInsertSchema(routingRules).omit({
  id: true,
  createdAt: true,
});

export const insertSatisfactionSurveySchema = createInsertSchema(satisfactionSurveys).omit({
  id: true,
  createdAt: true,
});

export type InsertChatConnection = z.infer<typeof insertChatConnectionSchema>;
export type ChatConnection = typeof chatConnections.$inferSelect;

export type InsertAgentAvailability = z.infer<typeof insertAgentAvailabilitySchema>;
export type AgentAvailability = typeof agentAvailability.$inferSelect;

export type InsertRoutingRule = z.infer<typeof insertRoutingRuleSchema>;
export type RoutingRule = typeof routingRules.$inferSelect;

export type InsertSatisfactionSurvey = z.infer<typeof insertSatisfactionSurveySchema>;
export type SatisfactionSurvey = typeof satisfactionSurveys.$inferSelect;

// ============================================================================
// CUSTOMER PAYMENT INFORMATION - END CUSTOMER BILLING
// ============================================================================

export const clientPaymentInfo = pgTable("client_payment_info", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").notNull().unique().references(() => clients.id, { onDelete: 'cascade' }),
  
  // Stripe customer
  stripeCustomerId: varchar("stripe_customer_id").unique(),
  
  // Payment terms
  paymentTermsDays: integer("payment_terms_days").default(30), // Net 30, etc.
  autoChargeEnabled: boolean("auto_charge_enabled").default(false),
  
  // Billing contact
  billingEmail: varchar("billing_email"),
  billingPhone: varchar("billing_phone"),
  billingContactName: varchar("billing_contact_name"),
  
  // Billing address
  billingAddress: text("billing_address"),
  billingCity: varchar("billing_city"),
  billingState: varchar("billing_state"),
  billingZip: varchar("billing_zip"),
  billingCountry: varchar("billing_country").default('US'),
  
  // Payment method on file
  hasPaymentMethod: boolean("has_payment_method").default(false),
  paymentMethodLast4: varchar("payment_method_last4"),
  paymentMethodType: varchar("payment_method_type"), // 'card', 'ach', etc.
  paymentMethodExpiry: varchar("payment_method_expiry"),
  
  // Credit limit
  creditLimit: decimal("credit_limit", { precision: 10, scale: 2 }),
  currentBalance: decimal("current_balance", { precision: 10, scale: 2 }).default("0.00"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("client_payment_info_workspace_idx").on(table.workspaceId),
  clientIdx: index("client_payment_info_client_idx").on(table.clientId),
  stripeIdx: index("client_payment_info_stripe_idx").on(table.stripeCustomerId),
}));

export const insertClientPaymentInfoSchema = createInsertSchema(clientPaymentInfo).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClientPaymentInfo = z.infer<typeof insertClientPaymentInfoSchema>;
export type ClientPaymentInfo = typeof clientPaymentInfo.$inferSelect;

// ============================================================================
// ADVANCED BILLING & USAGE-BASED PRICING SYSTEM
// ============================================================================

// Account state enum for subscription enforcement
export const accountStateEnum = pgEnum('account_state', [
  'active',           // Account in good standing
  'trial',            // Free trial period
  'payment_failed',   // Payment method declined
  'suspended',        // Auto-suspended due to non-payment
  'requires_support', // Requires support intervention to reactivate
  'cancelled',        // Subscription cancelled by user
  'terminated',       // Permanently terminated by platform
]);

// Billing add-ons catalog - available OS modules for à la carte purchase
export const billingAddons = pgTable("billing_addons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Add-on identity
  addonKey: varchar("addon_key").notNull().unique(), // e.g., 'scheduleos_ai', 'recordos', 'insightos'
  name: varchar("name").notNull(), // e.g., 'ScheduleOS™ AI Auto-Scheduling'
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

export const insertBillingAddonSchema = createInsertSchema(billingAddons).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBillingAddon = z.infer<typeof insertBillingAddonSchema>;
export type BillingAddon = typeof billingAddons.$inferSelect;

// Workspace add-on subscriptions - tracks which add-ons each org has purchased
export const workspaceAddons = pgTable("workspace_addons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  addonId: varchar("addon_id").notNull().references(() => billingAddons.id, { onDelete: 'cascade' }),
  
  // Subscription status
  status: varchar("status").notNull().default('active'), // 'active', 'suspended', 'cancelled'
  
  // Purchase info
  purchasedBy: varchar("purchased_by").notNull().references(() => users.id), // User who activated
  purchasedAt: timestamp("purchased_at").notNull().defaultNow(),
  
  // Billing
  stripeSubscriptionItemId: varchar("stripe_subscription_item_id"), // Stripe subscription item ID
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  
  // Token usage tracking (for hybrid pricing with monthly allowances)
  monthlyTokensUsed: decimal("monthly_tokens_used", { precision: 15, scale: 2 }).default("0"),
  lastUsageResetAt: timestamp("last_usage_reset_at").defaultNow(),
  
  // Cancellation
  cancelledAt: timestamp("cancelled_at"),
  cancelledBy: varchar("cancelled_by").references(() => users.id),
  cancellationReason: text("cancellation_reason"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("workspace_addons_workspace_idx").on(table.workspaceId),
  addonIdx: index("workspace_addons_addon_idx").on(table.addonId),
  statusIdx: index("workspace_addons_status_idx").on(table.status),
  uniqueWorkspaceAddon: uniqueIndex("unique_workspace_addon").on(table.workspaceId, table.addonId),
}));

export const insertWorkspaceAddonSchema = createInsertSchema(workspaceAddons).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWorkspaceAddon = z.infer<typeof insertWorkspaceAddonSchema>;
export type WorkspaceAddon = typeof workspaceAddons.$inferSelect;

// AI usage events - track every AI/autonomous feature usage
export const aiUsageEvents = pgTable("ai_usage_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id), // User who triggered the usage
  
  // Feature identification
  featureKey: varchar("feature_key").notNull(), // e.g., 'scheduleos_ai_generation', 'recordos_search', 'insightos_prediction'
  addonId: varchar("addon_id").references(() => billingAddons.id), // Related add-on if applicable
  
  // Usage metrics
  usageType: varchar("usage_type").notNull(), // 'token', 'session', 'activity', 'api_call'
  usageAmount: decimal("usage_amount", { precision: 15, scale: 4 }).notNull(), // Quantity used
  usageUnit: varchar("usage_unit").notNull(), // 'tokens', 'sessions', 'hours', etc.
  
  // Cost calculation
  unitPrice: decimal("unit_price", { precision: 10, scale: 4 }), // Price per unit at time of usage
  totalCost: decimal("total_cost", { precision: 10, scale: 4 }), // Total cost for this usage event
  
  // Context
  sessionId: varchar("session_id"), // Session identifier for grouping
  activityType: varchar("activity_type"), // 'schedule_generation', 'natural_language_search', 'predictive_analytics'
  metadata: jsonb("metadata"), // Additional context (model used, prompt length, response time, etc.)
  
  // Audit trail
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("ai_usage_workspace_idx").on(table.workspaceId),
  userIdx: index("ai_usage_user_idx").on(table.userId),
  featureIdx: index("ai_usage_feature_idx").on(table.featureKey),
  createdAtIdx: index("ai_usage_created_at_idx").on(table.createdAt),
  sessionIdx: index("ai_usage_session_idx").on(table.sessionId),
}));

export const insertAiUsageEventSchema = createInsertSchema(aiUsageEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertAiUsageEvent = z.infer<typeof insertAiUsageEventSchema>;
export type AiUsageEvent = typeof aiUsageEvents.$inferSelect;

// Daily usage rollups - aggregated usage per workspace per day
export const aiUsageDailyRollups = pgTable("ai_usage_daily_rollups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Time period
  usageDate: timestamp("usage_date").notNull(), // Date of usage (midnight UTC)
  
  // Feature breakdown
  featureKey: varchar("feature_key").notNull(),
  
  // Aggregated metrics
  totalEvents: integer("total_events").notNull().default(0),
  totalUsageAmount: decimal("total_usage_amount", { precision: 15, scale: 4 }).notNull().default("0"),
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }).notNull().default("0.00"),
  
  // Unique users
  uniqueUsers: integer("unique_users").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("ai_rollups_workspace_idx").on(table.workspaceId),
  dateIdx: index("ai_rollups_date_idx").on(table.usageDate),
  featureIdx: index("ai_rollups_feature_idx").on(table.featureKey),
  uniqueWorkspaceDateFeature: uniqueIndex("unique_workspace_date_feature").on(
    table.workspaceId,
    table.usageDate,
    table.featureKey
  ),
}));

export const insertAiUsageDailyRollupSchema = createInsertSchema(aiUsageDailyRollups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiUsageDailyRollup = z.infer<typeof insertAiUsageDailyRollupSchema>;
export type AiUsageDailyRollup = typeof aiUsageDailyRollups.$inferSelect;

// AI token wallets - prepaid credit balance for AI features
export const aiTokenWallets = pgTable("ai_token_wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique().references(() => workspaces.id, { onDelete: 'cascade' }),
  
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
});

export const insertAiTokenWalletSchema = createInsertSchema(aiTokenWallets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiTokenWallet = z.infer<typeof insertAiTokenWalletSchema>;
export type AiTokenWallet = typeof aiTokenWallets.$inferSelect;

// Subscription Invoices - weekly platform billing aggregation
export const subscriptionInvoices = pgTable("subscription_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
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

export const insertSubscriptionInvoiceSchema = createInsertSchema(subscriptionInvoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSubscriptionInvoice = z.infer<typeof insertSubscriptionInvoiceSchema>;
export type SubscriptionInvoice = typeof subscriptionInvoices.$inferSelect;

// Subscription Line Items - breakdown of charges on each subscription invoice
export const subscriptionLineItems = pgTable("subscription_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => subscriptionInvoices.id, { onDelete: 'cascade' }),
  
  // Line item details
  itemType: varchar("item_type").notNull(), // 'subscription', 'addon', 'usage', 'overage', 'credit', 'adjustment'
  description: text("description").notNull(),
  
  // Quantity & pricing
  quantity: decimal("quantity", { precision: 15, scale: 4 }).default("1.0000"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 4 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  
  // Related entities
  addonId: varchar("addon_id").references(() => billingAddons.id), // If this is an add-on charge
  featureKey: varchar("feature_key"), // If this is a usage charge
  
  // Metadata
  metadata: jsonb("metadata"), // Usage details, date range, etc.
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  invoiceIdx: index("subscription_line_items_invoice_idx").on(table.invoiceId),
  typeIdx: index("subscription_line_items_type_idx").on(table.itemType),
  addonIdx: index("subscription_line_items_addon_idx").on(table.addonId),
}));

export const insertSubscriptionLineItemSchema = createInsertSchema(subscriptionLineItems).omit({
  id: true,
  createdAt: true,
});

export type InsertSubscriptionLineItem = z.infer<typeof insertSubscriptionLineItemSchema>;
export type SubscriptionLineItem = typeof subscriptionLineItems.$inferSelect;

// Subscription Payments - track all subscription payment transactions
export const subscriptionPayments = pgTable("subscription_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  invoiceId: varchar("invoice_id").references(() => subscriptionInvoices.id, { onDelete: 'set null' }),
  
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

export const insertSubscriptionPaymentSchema = createInsertSchema(subscriptionPayments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSubscriptionPayment = z.infer<typeof insertSubscriptionPaymentSchema>;
export type SubscriptionPayment = typeof subscriptionPayments.$inferSelect;

// Billing audit log - comprehensive audit trail for all billing events
export const billingAuditLog = pgTable("billing_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
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
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("billing_audit_workspace_idx").on(table.workspaceId),
  eventTypeIdx: index("billing_audit_event_type_idx").on(table.eventType),
  categoryIdx: index("billing_audit_category_idx").on(table.eventCategory),
  actorIdx: index("billing_audit_actor_idx").on(table.actorId),
  createdAtIdx: index("billing_audit_created_at_idx").on(table.createdAt),
}));

export const insertBillingAuditLogSchema = createInsertSchema(billingAuditLog).omit({
  id: true,
  createdAt: true,
});

export type InsertBillingAuditLog = z.infer<typeof insertBillingAuditLogSchema>;
export type BillingAuditLog = typeof billingAuditLog.$inferSelect;

// ============================================================================
// DISPATCHOS™ - COMPUTER-AIDED DISPATCH SYSTEM
// ============================================================================

// Dispatch incidents (CAD calls)
export const dispatchIncidents = pgTable("dispatch_incidents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Incident identification
  incidentNumber: varchar("incident_number").notNull().unique(), // CAD-2024-001234
  priority: varchar("priority").notNull(), // emergency, urgent, routine, low
  type: varchar("type").notNull(), // alarm, medical, patrol, disturbance, fire, theft, etc.
  status: varchar("status").notNull().default('queued'), // queued, dispatched, en_route, on_scene, cleared, cancelled
  
  // Location
  clientId: varchar("client_id").references(() => clients.id), // FIXED: VARCHAR to match clients.id
  locationAddress: text("location_address").notNull(),
  locationLatitude: doublePrecision("location_latitude"),
  locationLongitude: doublePrecision("location_longitude"),
  locationZone: varchar("location_zone"), // "North Sector", "Downtown", etc.
  
  // Caller information
  callerName: varchar("caller_name"),
  callerPhone: varchar("caller_phone"),
  callerType: varchar("caller_type"), // client, employee, public, system
  
  // Incident details
  description: text("description"),
  specialInstructions: text("special_instructions"),
  notes: text("notes"),
  
  // Timeline tracking
  callReceivedAt: timestamp("call_received_at").notNull(),
  dispatchedAt: timestamp("dispatched_at"),
  enRouteAt: timestamp("en_route_at"),
  arrivedAt: timestamp("arrived_at"),
  clearedAt: timestamp("cleared_at"),
  cancelledAt: timestamp("cancelled_at"),
  
  // Performance metrics
  responseTimeSeconds: integer("response_time_seconds"), // dispatchedAt - callReceivedAt
  travelTimeSeconds: integer("travel_time_seconds"), // arrivedAt - enRouteAt
  sceneTimeSeconds: integer("scene_time_seconds"), // clearedAt - arrivedAt
  totalTimeSeconds: integer("total_time_seconds"), // clearedAt - callReceivedAt
  
  // Assignment
  assignedUnits: text("assigned_units").array(), // ["U-12", "U-7"]
  requiredCertifications: text("required_certifications").array(), // ["CPR", "Armed"]
  
  // Metadata
  createdBy: varchar("created_by").references(() => users.id), // Dispatcher user ID
  cancelledBy: varchar("cancelled_by").references(() => users.id),
  cancellationReason: text("cancellation_reason"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("dispatch_incidents_workspace_idx").on(table.workspaceId),
  statusIdx: index("dispatch_incidents_status_idx").on(table.status),
  priorityIdx: index("dispatch_incidents_priority_idx").on(table.priority),
  incidentNumberIdx: index("dispatch_incidents_number_idx").on(table.incidentNumber),
  clientIdx: index("dispatch_incidents_client_idx").on(table.clientId),
  createdAtIdx: index("dispatch_incidents_created_at_idx").on(table.createdAt),
  callReceivedIdx: index("dispatch_incidents_call_received_idx").on(table.callReceivedAt),
}));

export const insertDispatchIncidentSchema = createInsertSchema(dispatchIncidents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDispatchIncident = z.infer<typeof insertDispatchIncidentSchema>;
export type DispatchIncident = typeof dispatchIncidents.$inferSelect;

// Unit assignments to incidents
export const dispatchAssignments = pgTable("dispatch_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Assignment details
  incidentId: varchar("incident_id").notNull().references(() => dispatchIncidents.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }), // FIXED: VARCHAR to match employees.id
  unitNumber: varchar("unit_number").notNull(), // "U-12", "AMB-3", "ENG-7"
  
  // Status tracking
  status: varchar("status").notNull().default('assigned'), // assigned, accepted, rejected, en_route, on_scene, cleared, cancelled
  
  // Timeline
  assignedAt: timestamp("assigned_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  rejectedAt: timestamp("rejected_at"),
  enRouteAt: timestamp("en_route_at"),
  arrivedAt: timestamp("arrived_at"),
  clearedAt: timestamp("cleared_at"),
  
  // Additional data
  rejectionReason: text("rejection_reason"),
  notes: text("notes"),
  isPrimary: boolean("is_primary").default(false), // Primary unit vs backup
  
  // Assignment source
  assignedBy: varchar("assigned_by").references(() => users.id), // Dispatcher or system
  assignmentMethod: varchar("assignment_method").default('manual'), // manual, auto, requested
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("dispatch_assignments_workspace_idx").on(table.workspaceId),
  incidentIdx: index("dispatch_assignments_incident_idx").on(table.incidentId),
  employeeIdx: index("dispatch_assignments_employee_idx").on(table.employeeId),
  statusIdx: index("dispatch_assignments_status_idx").on(table.status),
  unitNumberIdx: index("dispatch_assignments_unit_idx").on(table.unitNumber),
  createdAtIdx: index("dispatch_assignments_created_at_idx").on(table.createdAt),
}));

export const insertDispatchAssignmentSchema = createInsertSchema(dispatchAssignments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDispatchAssignment = z.infer<typeof insertDispatchAssignmentSchema>;
export type DispatchAssignment = typeof dispatchAssignments.$inferSelect;

// Real-time unit status tracking
export const unitStatuses = pgTable("unit_statuses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }).unique(), // FIXED: VARCHAR to match employees.id
  
  // Unit identification
  unitNumber: varchar("unit_number").notNull(), // "U-12", "AMB-3", "ENG-7"
  unitType: varchar("unit_type"), // patrol, ambulance, supervisor, fire_engine, etc.
  
  // Current status
  status: varchar("status").notNull().default('offline'), // available, en_route, on_scene, offline, out_of_service, meal_break
  statusChangedAt: timestamp("status_changed_at").notNull(),
  statusChangedBy: varchar("status_changed_by"), // User ID or 'system'
  
  // Current assignment
  currentIncidentId: varchar("current_incident_id").references(() => dispatchIncidents.id),
  
  // Last known location
  lastKnownLatitude: doublePrecision("last_known_latitude"),
  lastKnownLongitude: doublePrecision("last_known_longitude"),
  lastLocationUpdate: timestamp("last_location_update"),
  
  // Zone assignment
  assignedZone: varchar("assigned_zone"), // "North Sector", "Downtown", etc.
  
  // Capabilities
  capabilities: text("capabilities").array(), // ["EMT", "CPR", "Armed", "K9"]
  equipmentAssigned: text("equipment_assigned").array(), // ["Radio-123", "Vehicle-456"]
  
  // Shift tracking
  currentShiftId: varchar("current_shift_id").references(() => shifts.id), // FIXED: VARCHAR to match shifts.id
  clockedInAt: timestamp("clocked_in_at"),
  
  // Device info
  deviceId: varchar("device_id"),
  appVersion: varchar("app_version"),
  lastHeartbeat: timestamp("last_heartbeat"), // For detecting disconnected units
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("unit_statuses_workspace_idx").on(table.workspaceId),
  employeeIdx: index("unit_statuses_employee_idx").on(table.employeeId),
  statusIdx: index("unit_statuses_status_idx").on(table.status),
  unitNumberIdx: index("unit_statuses_unit_number_idx").on(table.unitNumber),
  incidentIdx: index("unit_statuses_incident_idx").on(table.currentIncidentId),
  zoneIdx: index("unit_statuses_zone_idx").on(table.assignedZone),
}));

export const insertUnitStatusSchema = createInsertSchema(unitStatuses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUnitStatus = z.infer<typeof insertUnitStatusSchema>;
export type UnitStatus = typeof unitStatuses.$inferSelect;

// Dispatcher activity log (audit trail)
export const dispatchLogs = pgTable("dispatch_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Event details
  incidentId: varchar("incident_id").references(() => dispatchIncidents.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").references(() => employees.id), // FIXED: VARCHAR to match employees.id
  
  // Action tracking
  action: varchar("action").notNull(), // created_incident, assigned_unit, changed_status, sent_message, cancelled_incident, etc.
  actionCategory: varchar("action_category").notNull(), // incident, unit, communication, system
  
  // Actor
  userId: varchar("user_id").references(() => users.id),
  actorType: varchar("actor_type").default('user'), // user, system, auto
  
  // Details
  description: text("description").notNull(),
  details: jsonb("details"), // Additional structured data
  
  // Metadata
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => ({
  workspaceIdx: index("dispatch_logs_workspace_idx").on(table.workspaceId),
  incidentIdx: index("dispatch_logs_incident_idx").on(table.incidentId),
  employeeIdx: index("dispatch_logs_employee_idx").on(table.employeeId),
  actionIdx: index("dispatch_logs_action_idx").on(table.action),
  timestampIdx: index("dispatch_logs_timestamp_idx").on(table.timestamp),
}));

export const insertDispatchLogSchema = createInsertSchema(dispatchLogs).omit({
  id: true,
  timestamp: true,
});

export type InsertDispatchLog = z.infer<typeof insertDispatchLogSchema>;
export type DispatchLog = typeof dispatchLogs.$inferSelect;

// ============================================================================
// AUTONOMY AUDIT PHASE 1: IDEMPOTENCY & RATE VERSIONING
// ============================================================================

// Idempotency Keys - Prevent duplicate operations (invoice generation, payroll runs, timesheet ingestion)
export const operationTypeEnum = pgEnum('operation_type', [
  'invoice_generation',
  'payroll_run', 
  'timesheet_ingest',
  'schedule_generation',
  'payment_processing'
]);

export const idempotencyStatusEnum = pgEnum('idempotency_status', [
  'processing',
  'completed',
  'failed'
]);

export const idempotencyKeys = pgTable("idempotency_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Operation identification
  operationType: operationTypeEnum("operation_type").notNull(),
  requestFingerprint: text("request_fingerprint").notNull(), // Hash of request params
  
  // Result tracking
  status: idempotencyStatusEnum("status").default('processing').notNull(),
  resultId: varchar("result_id"), // ID of created invoice/payroll/timesheet
  resultMetadata: jsonb("result_metadata"), // Additional result data
  
  // Error tracking
  errorMessage: text("error_message"),
  errorStack: text("error_stack"),
  
  // Lifecycle
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at").notNull(), // TTL for cleanup (7-30 days)
}, (table) => ({
  workspaceIdx: index("idempotency_keys_workspace_idx").on(table.workspaceId),
  operationIdx: index("idempotency_keys_operation_idx").on(table.operationType),
  fingerprintIdx: uniqueIndex("idempotency_keys_fingerprint_idx").on(table.workspaceId, table.operationType, table.requestFingerprint),
  expiresIdx: index("idempotency_keys_expires_idx").on(table.expiresAt),
}));

export const insertIdempotencyKeySchema = createInsertSchema(idempotencyKeys).omit({
  id: true,
  createdAt: true,
});

export type InsertIdempotencyKey = z.infer<typeof insertIdempotencyKeySchema>;
export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;

// Employee Rate History - Versioned payroll rates with audit trail
export const employeeRateHistory = pgTable("employee_rate_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  
  // Rate details
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }).notNull(),
  
  // Versioning
  validFrom: timestamp("valid_from").notNull().defaultNow(),
  validTo: timestamp("valid_to"), // NULL = current active rate
  supersededBy: varchar("superseded_by"), // FK to next version
  
  // Audit trail
  changedBy: varchar("changed_by").references(() => users.id, { onDelete: 'set null' }),
  changeReason: text("change_reason"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index("employee_rate_history_workspace_idx").on(table.workspaceId),
  employeeIdx: index("employee_rate_history_employee_idx").on(table.employeeId),
  validFromIdx: index("employee_rate_history_valid_from_idx").on(table.validFrom),
  validToIdx: index("employee_rate_history_valid_to_idx").on(table.validTo),
  activeRateIdx: index("employee_rate_history_active_idx").on(table.employeeId, table.validTo),
}));

export const insertEmployeeRateHistorySchema = createInsertSchema(employeeRateHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertEmployeeRateHistory = z.infer<typeof insertEmployeeRateHistorySchema>;
export type EmployeeRateHistory = typeof employeeRateHistory.$inferSelect;

// Workspace Rate History - Versioned default rates for workspace
export const workspaceRateHistory = pgTable("workspace_rate_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Default rates (fallback when employee/client rates not configured)
  defaultBillableRate: decimal("default_billable_rate", { precision: 10, scale: 2 }),
  defaultHourlyRate: decimal("default_hourly_rate", { precision: 10, scale: 2 }),
  
  // Versioning
  validFrom: timestamp("valid_from").notNull().defaultNow(),
  validTo: timestamp("valid_to"), // NULL = current active rate
  supersededBy: varchar("superseded_by"), // FK to next version
  
  // Audit trail
  changedBy: varchar("changed_by").references(() => users.id, { onDelete: 'set null' }),
  changeReason: text("change_reason"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index("workspace_rate_history_workspace_idx").on(table.workspaceId),
  validFromIdx: index("workspace_rate_history_valid_from_idx").on(table.validFrom),
  validToIdx: index("workspace_rate_history_valid_to_idx").on(table.validTo),
  activeRateIdx: index("workspace_rate_history_active_idx").on(table.workspaceId, table.validTo),
}));

export const insertWorkspaceRateHistorySchema = createInsertSchema(workspaceRateHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertWorkspaceRateHistory = z.infer<typeof insertWorkspaceRateHistorySchema>;
export type WorkspaceRateHistory = typeof workspaceRateHistory.$inferSelect;

// Client Rate History - Client-specific billing rate overrides
export const clientRateHistory = pgTable("client_rate_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: 'cascade' }),
  
  // Client-specific billing rate
  billableRate: decimal("billable_rate", { precision: 10, scale: 2 }).notNull(),
  
  // Optional: role-specific rates for this client
  roleRateOverrides: jsonb("role_rate_overrides"), // { "Technician": 45.00, "Senior Tech": 65.00 }
  
  // Versioning
  validFrom: timestamp("valid_from").notNull().defaultNow(),
  validTo: timestamp("valid_to"), // NULL = current active rate
  supersededBy: varchar("superseded_by"), // FK to next version
  
  // Audit trail
  changedBy: varchar("changed_by").references(() => users.id, { onDelete: 'set null' }),
  changeReason: text("change_reason"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index("client_rate_history_workspace_idx").on(table.workspaceId),
  clientIdx: index("client_rate_history_client_idx").on(table.clientId),
  validFromIdx: index("client_rate_history_valid_from_idx").on(table.validFrom),
  validToIdx: index("client_rate_history_valid_to_idx").on(table.validTo),
  activeRateIdx: index("client_rate_history_active_idx").on(table.clientId, table.validTo),
}));

export const insertClientRateHistorySchema = createInsertSchema(clientRateHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertClientRateHistory = z.infer<typeof insertClientRateHistorySchema>;
export type ClientRateHistory = typeof clientRateHistory.$inferSelect;

// ============================================================================
// PARTNER INTEGRATIONS - QuickBooks, Gusto, etc.
// ============================================================================

// Partner connection types enum
export const partnerTypeEnum = pgEnum('partner_type', [
  'quickbooks', // QuickBooks Online
  'gusto', // Gusto Payroll
  'stripe', // Stripe (for reference, already integrated)
  'other', // Future partners
]);

// Partner connection status enum
export const partnerConnectionStatusEnum = pgEnum('partner_connection_status', [
  'connected', // Active connection
  'disconnected', // Manually disconnected
  'expired', // Tokens expired
  'error', // Connection error
]);

// Partner Connections - OAuth tokens and connection status
export const partnerConnections = pgTable("partner_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Partner identification (use enum for data integrity)
  partnerType: partnerTypeEnum("partner_type").notNull(),
  partnerName: varchar("partner_name").notNull(), // Display name
  
  // OAuth credentials (encrypted at rest in production via application layer)
  accessToken: text("access_token").notNull(), // OAuth access token
  refreshToken: text("refresh_token"), // OAuth refresh token (if applicable)
  tokenType: varchar("token_type").default('Bearer'), // Usually 'Bearer'
  expiresAt: timestamp("expires_at"), // When access token expires
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"), // QuickBooks provides refresh token expiry
  
  // Scopes and permissions
  scopes: text("scopes").array().default(sql`ARRAY[]::text[]`), // OAuth scopes granted
  
  // Connection status (use enum for data integrity)
  status: partnerConnectionStatusEnum("status").notNull().default('connected'),
  lastSyncAt: timestamp("last_sync_at"), // Last successful API call
  lastErrorAt: timestamp("last_error_at"), // Last error encountered
  lastError: text("last_error"), // Error message
  
  // Webhook configuration (for receiving real-time updates from partner)
  webhookSecret: text("webhook_secret"), // Secret for validating incoming webhooks (encrypted)
  webhookUrl: varchar("webhook_url"), // Registered webhook URL
  webhookEnabled: boolean("webhook_enabled").default(false),
  
  // Partner-specific metadata
  realmId: varchar("realm_id"), // QuickBooks company ID
  companyId: varchar("company_id"), // Gusto company ID
  metadata: jsonb("metadata"), // Additional partner-specific data
  
  // Connection management
  connectedBy: varchar("connected_by").references(() => users.id, { onDelete: 'set null' }),
  connectedAt: timestamp("connected_at").defaultNow(),
  disconnectedBy: varchar("disconnected_by").references(() => users.id, { onDelete: 'set null' }),
  disconnectedAt: timestamp("disconnected_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("partner_connections_workspace_idx").on(table.workspaceId),
  partnerIdx: index("partner_connections_partner_idx").on(table.partnerType),
  statusIdx: index("partner_connections_status_idx").on(table.status),
  uniqueWorkspacePartner: uniqueIndex("unique_workspace_partner").on(table.workspaceId, table.partnerType),
}));

export const insertPartnerConnectionSchema = createInsertSchema(partnerConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPartnerConnection = z.infer<typeof insertPartnerConnectionSchema>;
export type PartnerConnection = typeof partnerConnections.$inferSelect;

// Partner API Usage Events - Track all partner API calls with costs
export const partnerApiUsageEvents = pgTable("partner_api_usage_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id), // User who triggered the API call
  partnerConnectionId: varchar("partner_connection_id").notNull().references(() => partnerConnections.id, { onDelete: 'cascade' }),
  
  // API call identification (use enum for data integrity)
  partnerType: partnerTypeEnum("partner_type").notNull(),
  endpoint: varchar("endpoint").notNull(), // API endpoint called (e.g., '/v3/invoice')
  httpMethod: varchar("http_method").notNull(), // 'GET', 'POST', 'PUT', 'DELETE'
  
  // Usage metrics
  usageType: varchar("usage_type").notNull(), // 'api_call', 'batch_operation', 'webhook_event'
  usageAmount: decimal("usage_amount", { precision: 15, scale: 4 }).notNull().default("1.0000"), // Usually 1 per call
  usageUnit: varchar("usage_unit").notNull().default('api_calls'), // 'api_calls', 'batch_operations'
  
  // Cost calculation
  unitPrice: decimal("unit_price", { precision: 10, scale: 6 }), // Cost per API call (if applicable)
  totalCost: decimal("total_cost", { precision: 10, scale: 6 }), // Total cost for this event
  costCurrency: varchar("cost_currency").default('USD'),
  
  // Request/Response details
  requestPayloadSize: integer("request_payload_size"), // Bytes
  responsePayloadSize: integer("response_payload_size"), // Bytes
  responseStatusCode: integer("response_status_code"), // HTTP status code
  responseTimeMs: integer("response_time_ms"), // Response time in milliseconds
  
  // Success/Error tracking
  success: boolean("success").notNull().default(true),
  errorMessage: text("error_message"),
  errorCode: varchar("error_code"),
  
  // Context
  featureKey: varchar("feature_key"), // Which AutoForce feature triggered this (e.g., 'billos_invoice_creation')
  activityType: varchar("activity_type"), // 'invoice_creation', 'payroll_submission', 'customer_sync'
  metadata: jsonb("metadata"), // Additional context (invoice ID, payroll run ID, etc.)
  
  // Audit trail
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("partner_api_usage_workspace_idx").on(table.workspaceId),
  userIdx: index("partner_api_usage_user_idx").on(table.userId),
  partnerIdx: index("partner_api_usage_partner_idx").on(table.partnerType),
  connectionIdx: index("partner_api_usage_connection_idx").on(table.partnerConnectionId),
  featureIdx: index("partner_api_usage_feature_idx").on(table.featureKey),
  createdAtIdx: index("partner_api_usage_created_at_idx").on(table.createdAt),
  successIdx: index("partner_api_usage_success_idx").on(table.success),
}));

export const insertPartnerApiUsageEventSchema = createInsertSchema(partnerApiUsageEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertPartnerApiUsageEvent = z.infer<typeof insertPartnerApiUsageEventSchema>;
export type PartnerApiUsageEvent = typeof partnerApiUsageEvents.$inferSelect;

// Partner Data Mappings - Map AutoForce entities to partner entities
export const partnerDataMappings = pgTable("partner_data_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  partnerConnectionId: varchar("partner_connection_id").notNull().references(() => partnerConnections.id, { onDelete: 'cascade' }),
  
  // Partner identification (use enum for data integrity)
  partnerType: partnerTypeEnum("partner_type").notNull(),
  
  // Entity mapping
  entityType: varchar("entity_type").notNull(), // 'client', 'employee', 'invoice', 'payroll_run'
  autoforceEntityId: varchar("autoforce_entity_id").notNull(), // AutoForce entity ID (clients.id, employees.id, etc.)
  partnerEntityId: varchar("partner_entity_id").notNull(), // Partner entity ID (QBO Customer ID, Gusto Employee ID)
  partnerEntityName: varchar("partner_entity_name"), // Partner entity name for display
  
  // Sync status
  syncStatus: varchar("sync_status").notNull().default('synced'), // 'synced', 'pending', 'failed', 'conflict'
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncError: text("last_sync_error"),
  
  // Mapping metadata
  mappingSource: varchar("mapping_source").default('manual'), // 'manual', 'auto', 'import'
  metadata: jsonb("metadata"), // Additional mapping data
  
  // Audit trail
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("partner_mappings_workspace_idx").on(table.workspaceId),
  partnerIdx: index("partner_mappings_partner_idx").on(table.partnerType),
  connectionIdx: index("partner_mappings_connection_idx").on(table.partnerConnectionId),
  entityTypeIdx: index("partner_mappings_entity_type_idx").on(table.entityType),
  autoforceEntityIdx: index("partner_mappings_autoforce_idx").on(table.autoforceEntityId),
  partnerEntityIdx: index("partner_mappings_partner_entity_idx").on(table.partnerEntityId),
  uniqueMapping: uniqueIndex("unique_partner_mapping").on(
    table.workspaceId,
    table.partnerType,
    table.entityType,
    table.autoforceEntityId
  ),
}));

export const insertPartnerDataMappingSchema = createInsertSchema(partnerDataMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPartnerDataMapping = z.infer<typeof insertPartnerDataMappingSchema>;
export type PartnerDataMapping = typeof partnerDataMappings.$inferSelect;

// OAuth States - Store CSRF tokens and PKCE verifiers for OAuth flows
export const oauthStates = pgTable("oauth_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Partner identification
  partnerType: partnerTypeEnum("partner_type").notNull(),
  
  // OAuth flow state
  state: varchar("state").notNull().unique(), // CSRF protection token
  codeVerifier: text("code_verifier"), // PKCE code verifier (for QuickBooks)
  codeChallenge: varchar("code_challenge"), // PKCE code challenge
  codeChallengeMethod: varchar("code_challenge_method").default('S256'), // 'S256' or 'plain'
  
  // Expiry tracking
  expiresAt: timestamp("expires_at").notNull(), // State expires after 10 minutes
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("oauth_states_workspace_idx").on(table.workspaceId),
  partnerIdx: index("oauth_states_partner_idx").on(table.partnerType),
  stateIdx: index("oauth_states_state_idx").on(table.state),
  expiryIdx: index("oauth_states_expiry_idx").on(table.expiresAt),
}));

export const insertOAuthStateSchema = createInsertSchema(oauthStates).omit({
  id: true,
  createdAt: true,
});

export type InsertOAuthState = z.infer<typeof insertOAuthStateSchema>;
export type OAuthState = typeof oauthStates.$inferSelect;

// ============================================================================
// OVERSIGHT EVENTS - 1% Autonomous Oversight Queue
// ============================================================================

// Entity types that can be flagged for oversight
export const oversightEntityTypeEnum = pgEnum('oversight_entity_type', [
  'invoice',
  'expense',
  'timesheet',
  'shift',
  'payroll_run',
  'dispute',
  'time_entry',
]);

// Oversight status
export const oversightStatusEnum = pgEnum('oversight_status', [
  'pending',      // Awaiting review
  'approved',     // Human approved
  'rejected',     // Human rejected
  'auto_resolved' // Automatically resolved by rules
]);

// Oversight Events - Track items flagged for human review in the 1% oversight queue
export const oversightEvents = pgTable("oversight_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Entity reference
  entityType: oversightEntityTypeEnum("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(), // References the actual entity (invoice.id, expense.id, etc.)
  
  // Detection details
  detectedBy: varchar("detected_by").notNull(), // 'auto' or user ID for manual flags
  detectedAt: timestamp("detected_at").defaultNow(),
  autoScore: integer("auto_score"), // 0-100 risk/confidence score
  flagReason: text("flag_reason").notNull(), // Plain English reason for flagging
  
  // Entity summary for display (denormalized for performance)
  entitySummary: jsonb("entity_summary"), // { amount, date, employeeName, clientName, etc. }
  
  // Status & resolution
  status: oversightStatusEnum("status").notNull().default('pending'),
  resolvedBy: varchar("resolved_by").references(() => users.id), // User who approved/rejected
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"), // Optional notes from reviewer
  
  // Metadata
  metadata: jsonb("metadata"), // Additional context, rule triggers, etc.
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("oversight_events_workspace_idx").on(table.workspaceId),
  statusIdx: index("oversight_events_status_idx").on(table.status),
  entityIdx: index("oversight_events_entity_idx").on(table.entityType, table.entityId),
  workspaceStatusIdx: index("oversight_events_workspace_status_idx").on(table.workspaceId, table.status),
  detectedAtIdx: index("oversight_events_detected_at_idx").on(table.detectedAt),
  // Compound index for pending queue queries
  pendingQueueIdx: index("oversight_events_pending_queue_idx").on(table.workspaceId, table.status, table.detectedAt),
}));

export const insertOversightEventSchema = createInsertSchema(oversightEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOversightEvent = z.infer<typeof insertOversightEventSchema>;
export type OversightEvent = typeof oversightEvents.$inferSelect;

// ============================================================================
// EXTERNAL IDENTIFIERS SYSTEM - Human-Readable IDs
// ============================================================================

// Entity types that can have external IDs
export const externalIdEntityTypeEnum = pgEnum('external_id_entity_type', [
  'org',
  'employee',
  'user',
  'support',
  'client',
]);

// External identifiers for human-readable reference (ORG-XXXX, EMP-XXXX-00001, etc.)
export const externalIdentifiers = pgTable("external_identifiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Entity reference
  entityType: externalIdEntityTypeEnum("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(), // UUID of the actual entity
  
  // Human-readable external ID
  externalId: varchar("external_id").notNull().unique(), // Format: ORG-ABCD, EMP-ABCD-00001, SUP-AB12
  
  // Organization association (null for org entities themselves)
  orgId: varchar("org_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Primary flag (in case entity has multiple external IDs)
  isPrimary: boolean("is_primary").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  entityIdx: index("external_identifiers_entity_idx").on(table.entityType, table.entityId),
  externalIdIdx: index("external_identifiers_external_id_idx").on(table.externalId),
  orgIdx: index("external_identifiers_org_idx").on(table.orgId),
  uniqueEntityPrimary: uniqueIndex("external_identifiers_entity_primary_idx").on(table.entityType, table.entityId, table.isPrimary),
}));

export const insertExternalIdentifierSchema = createInsertSchema(externalIdentifiers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertExternalIdentifier = z.infer<typeof insertExternalIdentifierSchema>;
export type ExternalIdentifier = typeof externalIdentifiers.$inferSelect;

// ID sequence tracking for auto-incrementing employee numbers per org
export const idSequenceKindEnum = pgEnum('id_sequence_kind', [
  'employee',
  'ticket',
  'client',
]);

export const idSequences = pgTable("id_sequences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  kind: idSequenceKindEnum("kind").notNull(),
  nextVal: integer("next_val").notNull().default(1),
  
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueOrgKind: uniqueIndex("id_sequences_org_kind_idx").on(table.orgId, table.kind),
}));

export const insertIdSequenceSchema = createInsertSchema(idSequences).omit({
  id: true,
  updatedAt: true,
});

export type InsertIdSequence = z.infer<typeof insertIdSequenceSchema>;
export type IdSequence = typeof idSequences.$inferSelect;

// Support agent registry with unique codes
export const supportRegistry = pgTable("support_registry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  supportCode: varchar("support_code").notNull().unique(), // Format: SUP-AB12
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSupportRegistrySchema = createInsertSchema(supportRegistry).omit({
  id: true,
  createdAt: true,
});

export type InsertSupportRegistry = z.infer<typeof insertSupportRegistrySchema>;
export type SupportRegistry = typeof supportRegistry.$inferSelect;

// Tombstones for tracking deletions with approval workflow
export const tombstones = pgTable("tombstones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Entity that was deleted
  entityType: varchar("entity_type").notNull(), // 'org', 'employee', 'user', etc.
  entityId: varchar("entity_id").notNull(),
  
  // Organization context
  orgId: varchar("org_id").references(() => workspaces.id, { onDelete: 'set null' }),
  
  // Deletion tracking
  deletedByUserId: varchar("deleted_by_user_id").notNull().references(() => users.id),
  approvalId: varchar("approval_id"), // Link to approval if required
  reason: text("reason"),
  
  // Snapshot of deleted entity (for potential restoration)
  entitySnapshot: jsonb("entity_snapshot"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  entityIdx: index("tombstones_entity_idx").on(table.entityType, table.entityId),
  orgIdx: index("tombstones_org_idx").on(table.orgId),
  deletedByIdx: index("tombstones_deleted_by_idx").on(table.deletedByUserId),
}));

export const insertTombstoneSchema = createInsertSchema(tombstones).omit({
  id: true,
  createdAt: true,
});

export type InsertTombstone = z.infer<typeof insertTombstoneSchema>;
export type Tombstone = typeof tombstones.$inferSelect;