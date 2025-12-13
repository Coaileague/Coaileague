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
  foreignKey,
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

  // Multi-Factor Authentication (MFA)
  mfaSecret: varchar("mfa_secret"), // Encrypted TOTP secret
  mfaEnabled: boolean("mfa_enabled").default(false),
  mfaBackupCodes: text("mfa_backup_codes").array(), // Encrypted backup codes
  mfaLastUsedAt: timestamp("mfa_last_used_at"),

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

// User Mascot Preferences - Per-user isolated mascot settings
export const userMascotPreferences = pgTable("user_mascot_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  
  // Position preferences
  positionX: integer("position_x").default(0),
  positionY: integer("position_y").default(0),
  
  // Display settings
  isEnabled: boolean("is_enabled").default(true),
  isMinimized: boolean("is_minimized").default(false),
  preferredSize: varchar("preferred_size").default('default'), // 'small', 'default', 'large'
  
  // Behavior settings
  roamingEnabled: boolean("roaming_enabled").default(true),
  reactToActions: boolean("react_to_actions").default(true),
  showThoughts: boolean("show_thoughts").default(true),
  soundEnabled: boolean("sound_enabled").default(false),
  
  // Personalization
  nickname: varchar("nickname"), // User's custom name for the mascot
  favoriteEmotes: text("favorite_emotes").array().default(sql`ARRAY[]::text[]`),
  dislikedEmotes: text("disliked_emotes").array().default(sql`ARRAY[]::text[]`),
  
  // Interaction history summary
  totalInteractions: integer("total_interactions").default(0),
  totalDrags: integer("total_drags").default(0),
  totalTaps: integer("total_taps").default(0),
  lastInteractionAt: timestamp("last_interaction_at"),
  
  // Custom thoughts from AI
  customThoughts: text("custom_thoughts").array().default(sql`ARRAY[]::text[]`),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserMascotPreferencesSchema = createInsertSchema(userMascotPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserMascotPreferences = z.infer<typeof insertUserMascotPreferencesSchema>;
export type UserMascotPreferences = typeof userMascotPreferences.$inferSelect;

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

  // Workspace type - distinguishes platform support orgs from regular business orgs
  workspaceType: varchar("workspace_type").default("business"), // 'business' (default) | 'platform_support' | 'internal'
  isPlatformSupport: boolean("is_platform_support").default(false), // Quick check for platform support workspace

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

  // ============================================================================
  // INVESTIGATION SERVICE CONTROLS - ROOT/SUPPORT Staff Only
  // Per-workspace service suspension for investigations/compliance
  // ============================================================================
  
  // Trinity Mascot Control
  trinitySuspended: boolean("trinity_suspended").default(false),
  trinitySuspendedReason: text("trinity_suspended_reason"),
  trinitySuspendedAt: timestamp("trinity_suspended_at"),
  trinitySuspendedBy: varchar("trinity_suspended_by"),
  
  // Chat Service Control  
  chatSuspended: boolean("chat_suspended").default(false),
  chatSuspendedReason: text("chat_suspended_reason"),
  chatSuspendedAt: timestamp("chat_suspended_at"),
  chatSuspendedBy: varchar("chat_suspended_by"),
  
  // Automation Service Control (disables all scheduled jobs for this workspace)
  automationsSuspended: boolean("automations_suspended").default(false),
  automationsSuspendedReason: text("automations_suspended_reason"),
  automationsSuspendedAt: timestamp("automations_suspended_at"),
  automationsSuspendedBy: varchar("automations_suspended_by"),
  
  // AI Brain Service Control (disables HelpAI/AI features for this workspace)
  aiBrainSuspended: boolean("ai_brain_suspended").default(false),
  aiBrainSuspendedReason: text("ai_brain_suspended_reason"),
  aiBrainSuspendedAt: timestamp("ai_brain_suspended_at"),
  aiBrainSuspendedBy: varchar("ai_brain_suspended_by"),

  // AI Feature Trials & Activation (Subscriber Pays All Model)
  // Scheduling Platform AI Auto-Scheduling
  scheduleosTrialStartedAt: timestamp("scheduleos_trial_started_at"), // 7-day free trial
  scheduleosActivatedAt: timestamp("scheduleos_activated_at"), // Payment confirmed, feature unlocked
  scheduleosActivatedBy: varchar("scheduleos_activated_by"), // User ID who activated (Owner/Manager only)
  scheduleosPaymentMethod: varchar("scheduleos_payment_method"), // 'stripe_subscription' | 'stripe_card'
  scheduleosPaymentIntentId: varchar("scheduleos_payment_intent_id"), // Stripe Payment Intent ID to prevent reuse

  // Future AI Features (following same pattern)
  hireos_trial_started_at: timestamp("hireos_trial_started_at"),
  hireos_activated_at: timestamp("hireos_activated_at"),
  hireos_activated_by: varchar("hireos_activated_by"),

  // ============================================================================
  // MASTER KEYS - ROOT-ONLY ORGANIZATION MANAGEMENT
  // ============================================================================

  // Feature Toggles (ROOT can enable/disable individual OS modules)
  feature_scheduleos_enabled: boolean("feature_scheduleos_enabled").default(false), // AI automation defaults OFF - must be explicitly activated
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

  // ============================================================================
  // GAP FIXES - CONFIGURABLE SETTINGS (Gap #6, #7, #8)
  // ============================================================================
  
  // HelpAI Bot Configuration (Gap #7)
  enableHelpOSBot: boolean("enable_helpos_bot").default(true), // Allow disabling bot per workspace
  
  // Trinity Diagnostic & Recovery Tools Access
  trinityDiagnosticsEnabled: boolean("trinity_diagnostics_enabled").default(true), // Allow org owners to enable/disable Trinity AI recovery tools
  trinityDiagnosticsEnabledAt: timestamp("trinity_diagnostics_enabled_at"),
  trinityDiagnosticsEnabledBy: varchar("trinity_diagnostics_enabled_by"), // User who last changed this setting
  
  // Client Tax Rate Configuration (Gap #8)
  defaultTaxRate: decimal("default_tax_rate", { precision: 5, scale: 4 }).default("0.08875"), // Default 8.875%
  taxJurisdiction: varchar("tax_jurisdiction"), // State/country for tax lookup
  
  // Labor Law Jurisdiction (Break Scheduling Compliance)
  laborLawJurisdiction: varchar("labor_law_jurisdiction").default('US-FEDERAL'), // State/country code for break rules (e.g., 'CA', 'NY', 'TX', 'US-FEDERAL')
  autoBreakSchedulingEnabled: boolean("auto_break_scheduling_enabled").default(true), // Enable automatic break scheduling
  breakComplianceAlerts: boolean("break_compliance_alerts").default(true), // Send alerts for compliance violations
  
  // Industry Benchmarking (Gap #5)
  industry: varchar("industry"), // For benchmark comparisons
  companySize: varchar("company_size"), // 'small', 'medium', 'large', 'enterprise'

  // ============================================================================
  // HIERARCHICAL INDUSTRY TAXONOMY (3-Level Classification)
  // Used for Trinity onboarding orchestration, compliance templates, and ABAC policies
  // ============================================================================
  
  sectorId: varchar("sector_id"), // Level 1: e.g., 'construction', 'healthcare', 'security'
  industryGroupId: varchar("industry_group_id"), // Level 2: e.g., 'specialty_contractors', 'guard_services'
  subIndustryId: varchar("sub_industry_id"), // Level 3: e.g., 'electrician', 'plumber', 'armed_guard'
  
  industryTaxonomyVersion: varchar("industry_taxonomy_version"), // Version of taxonomy used for selection
  industrySelectedAt: timestamp("industry_selected_at"), // When industry was selected
  industrySelectedBy: varchar("industry_selected_by"), // User who selected the industry
  
  industryComplianceTemplates: text("industry_compliance_templates").array().default(sql`ARRAY[]::text[]`), // Active compliance templates
  industryCertifications: text("industry_certifications").array().default(sql`ARRAY[]::text[]`), // Required certifications for this industry
  
  industryOnboardingComplete: boolean("industry_onboarding_complete").default(false), // Industry-specific onboarding complete
  industryVerifiedBy: varchar("industry_verified_by"), // User/AI that verified industry classification
  industryVerifiedAt: timestamp("industry_verified_at"),
  
  // Custom Industry Support (for "Other / My Industry Not Listed" sector)
  customIndustryName: varchar("custom_industry_name"), // User-defined industry name when using "Other/Custom"
  customIndustryDescription: text("custom_industry_description"), // User-defined industry description

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
  
  // Billing Platform Invoicing Automation
  autoInvoicingEnabled: boolean("auto_invoicing_enabled").default(true), // Enable/disable auto-invoice generation
  invoiceSchedule: varchar("invoice_schedule").default('monthly'), // 'weekly', 'biweekly', 'semi-monthly', 'monthly', 'net30', 'custom'
  invoiceCustomDays: integer("invoice_custom_days"), // For 'custom' schedule (e.g., every 10 days)
  invoiceDayOfWeek: integer("invoice_day_of_week"), // 0-6 for weekly/biweekly (0=Sunday)
  invoiceDayOfMonth: integer("invoice_day_of_month").default(1), // 1-31 for monthly/semi-monthly
  
  // Payroll Platform Payroll Automation
  autoPayrollEnabled: boolean("auto_payroll_enabled").default(true), // Enable/disable auto-payroll processing
  autoSubmitPayroll: boolean("auto_submit_payroll").default(false), // SAFETY MODE: Auto-submit to Gusto (defaults to manual approval)
  payrollSchedule: varchar("payroll_schedule").default('biweekly'), // 'weekly', 'biweekly', 'semi-monthly', 'monthly', 'custom'
  payrollCustomDays: integer("payroll_custom_days"), // For 'custom' schedule
  payrollDayOfWeek: integer("payroll_day_of_week").default(1), // 0-6 for weekly/biweekly (1=Monday)
  payrollDayOfMonth: integer("payroll_day_of_month").default(1), // 1-31 for monthly (process day)
  payrollCutoffDay: integer("payroll_cutoff_day").default(15), // 1-31 for semi-monthly (second pay date)
  
  // Scheduling Platform Schedule Generation Automation
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

  // ============================================================================
  // SALES/ONBOARDING PIPELINE (Gamification & Rewards)
  // ============================================================================
  
  // Pipeline status tracking
  pipelineStatus: varchar("pipeline_status").default('invited'), // 'invited', 'email_opened', 'trial_started', 'trial_active', 'trial_expired', 'accepted', 'rejected', 'churned'
  pipelineStatusUpdatedAt: timestamp("pipeline_status_updated_at"),
  invitedAt: timestamp("invited_at"),
  inviteEmailOpenedAt: timestamp("invite_email_opened_at"),
  
  // Trial tracking
  trialStartedAt: timestamp("trial_started_at"),
  trialEndsAt: timestamp("trial_ends_at"),
  trialDays: integer("trial_days").default(14), // 14-day default trial
  trialCreditsUsed: integer("trial_credits_used").default(0), // Credits consumed during trial
  
  // Onboarding progress
  onboardingCompletionPercent: integer("onboarding_completion_percent").default(0), // 0-100
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  totalOnboardingPoints: integer("total_onboarding_points").default(0), // Gamification points earned
  
  // ============================================================================
  // COMPREHENSIVE ONBOARDING STEPS & AUTOMATION UNLOCK
  // ============================================================================
  
  // Step-by-step completion tracking (JSONB for flexibility)
  // Format: { profile: true, payment: true, org_setup: false, employees: false, ... }
  onboardingStepsCompleted: jsonb("onboarding_steps_completed").default('{}'),
  
  // Required steps for full automation unlock
  // profile, payment, org_setup, first_employee, first_schedule, first_client, role_invites, api_integrations
  onboardingFullyComplete: boolean("onboarding_fully_complete").default(false), // All required steps done
  onboardingFullyCompleteAt: timestamp("onboarding_fully_complete_at"),
  
  // Automation feature gating - LOCKED until onboarding complete
  automationUnlocked: boolean("automation_unlocked").default(false), // Master automation unlock
  automationUnlockedAt: timestamp("automation_unlocked_at"),
  automationUnlockedBy: varchar("automation_unlocked_by"), // User who completed final step
  
  // First-time signup discount (10% off for completing onboarding)
  isFirstTimeOrg: boolean("is_first_time_org").default(true), // First org for this owner
  discountEligible: boolean("discount_eligible").default(true), // Eligible for 10% off
  discountRedeemed: boolean("discount_redeemed").default(false), // Already used discount
  discountRedeemedAt: timestamp("discount_redeemed_at"),
  discountCode: varchar("discount_code"), // Unique discount code
  discountPercentage: integer("discount_percentage").default(10), // Default 10% off
  
  // Business Buddy AI Credits
  businessBuddyEnabled: boolean("business_buddy_enabled").default(true), // Org can use Business Buddy
  businessBuddyCreditsBalance: integer("business_buddy_credits_balance").default(100), // Starting credits
  businessBuddyCreditsUsed: integer("business_buddy_credits_used").default(0), // Total consumed
  businessBuddyLastUsedAt: timestamp("business_buddy_last_used_at"),
  businessBuddySpawnedFor: text("business_buddy_spawned_for").array().default(sql`ARRAY[]::text[]`), // User IDs buddy is visible for
  
  // AI Usage Tracking & Billing
  aiUsageThisWeek: integer("ai_usage_this_week").default(0), // Tokens/calls this billing week
  aiUsageAllTime: integer("ai_usage_all_time").default(0), // Lifetime usage
  aiOverageChargedAt: timestamp("ai_overage_charged_at"), // Last overage billing
  aiOverageAmount: decimal("ai_overage_amount", { precision: 10, scale: 2 }).default("0.00"), // Pending overage charges
  
  // Conversion tracking
  acceptedAt: timestamp("accepted_at"), // When they subscribed
  rejectedAt: timestamp("rejected_at"), // When they declined
  rejectionReason: text("rejection_reason"),

  // ============================================================================
  // SUPPORT-ASSISTED ONBOARDING
  // Enables platform support staff to create and configure orgs on behalf of users
  // who cannot do so themselves (disability, time constraints, etc.)
  // ============================================================================
  
  // Assisted onboarding metadata
  assistedOnboardingBy: varchar("assisted_onboarding_by"), // Support staff userId who created this org
  assistedOnboardingAt: timestamp("assisted_onboarding_at"), // When assisted onboarding started
  assistedOnboardingNotes: text("assisted_onboarding_notes"), // Internal notes from support
  
  // Target user information (who will receive this org)
  targetUserEmail: varchar("target_user_email"), // Email of user who will receive ownership
  targetUserName: varchar("target_user_name"), // Name of the target user for personalization
  targetUserPhone: varchar("target_user_phone"), // Optional contact number
  
  // Handoff workflow status
  handoffStatus: varchar("handoff_status"), // 'pending_setup' | 'ready_for_handoff' | 'handoff_sent' | 'handoff_complete' | 'handoff_expired'
  handoffToken: varchar("handoff_token"), // Secure token for handoff link
  handoffTokenExpiry: timestamp("handoff_token_expiry"), // Token expiration (72 hours)
  handoffSentAt: timestamp("handoff_sent_at"), // When handoff email was sent
  handoffCompletedAt: timestamp("handoff_completed_at"), // When user accepted ownership
  handoffCompletedBy: varchar("handoff_completed_by"), // User ID who completed handoff
  
  // Document extraction tracking (Trinity AI integration)
  assistedDocsUploaded: integer("assisted_docs_uploaded").default(0), // Count of docs uploaded
  assistedDocsProcessed: integer("assisted_docs_processed").default(0), // Count of docs processed by AI
  assistedDataExtracted: jsonb("assisted_data_extracted"), // AI-extracted business data
  assistedExtractionStatus: varchar("assisted_extraction_status"), // 'pending' | 'processing' | 'complete' | 'failed'

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

// Platform Support Staff Roles (CoAIleague Internal Team - Platform Level)
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

  // Premium Schedule Features (Phase 1 MVP)
  performanceScore: integer("performance_score").default(85), // 0-100 percentage
  rating: decimal("rating", { precision: 2, scale: 1 }).default("4.0"), // 0.0-5.0 star rating
  availabilityPercentage: integer("availability_percentage").default(90), // 0-100 percentage
  overtimeHoursThisWeek: decimal("overtime_hours_this_week", { precision: 5, scale: 2 }).default("0.00"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEmployeeSchema = createInsertSchema(employees).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  hourlyRate: z.union([z.string(), z.number()]).transform(val => typeof val === 'number' ? val.toString() : val).optional(),
});

export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

// ============================================================================
// EMPLOYEE SCORING & AI AUTOMATION TABLES
// ============================================================================

// Employee Skills (for AI scoring and matching)
export const employeeSkills = pgTable("employee_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  skillName: varchar("skill_name").notNull(), // e.g., "Spanish", "CDL-A", "Forklift", "CPR"
  skillCategory: varchar("skill_category").notNull(), // "language", "certification", "technical", "soft_skill"
  proficiencyLevel: integer("proficiency_level").default(3), // 1-5 scale
  verified: boolean("verified").default(false), // Has this been verified by manager/certification?
  verifiedBy: varchar("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at"),
  expiresAt: timestamp("expires_at"), // For certifications that expire
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_employee_skills_employee").on(table.employeeId),
  index("idx_employee_skills_category").on(table.skillCategory),
]);

export const insertEmployeeSkillSchema = createInsertSchema(employeeSkills).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeSkill = z.infer<typeof insertEmployeeSkillSchema>;
export type EmployeeSkill = typeof employeeSkills.$inferSelect;

// NOTE: employeeCertifications table already exists for onboarding/compliance at line 2516
// We'll reuse that existing table for AI scoring - it has all the fields we need

// Employee Performance Metrics (for AI scoring)
export const employeeMetrics = pgTable("employee_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  
  // Reliability metrics
  reliabilityScore: decimal("reliability_score", { precision: 3, scale: 2 }).default("0.85"), // 0.00-1.00
  tardinessCount: integer("tardiness_count").default(0), // Last 90 days
  noShowCount: integer("no_show_count").default(0), // Last 90 days
  lastMinuteCancellations: integer("last_minute_cancellations").default(0), // Last 90 days
  
  // Experience metrics
  yearsExperience: decimal("years_experience", { precision: 4, scale: 1 }).default("0.0"),
  shiftsCompleted: integer("shifts_completed").default(0),
  totalHoursWorked: decimal("total_hours_worked", { precision: 10, scale: 2 }).default("0.00"),
  
  // Distance & Location
  preferredMaxDistance: integer("preferred_max_distance").default(50), // miles
  homeLatitude: decimal("home_latitude", { precision: 10, scale: 7 }),
  homeLongitude: decimal("home_longitude", { precision: 10, scale: 7 }),
  
  // Cost metrics
  averagePayRate: decimal("average_pay_rate", { precision: 10, scale: 2 }),
  overtimeEligible: boolean("overtime_eligible").default(true),
  maxWeeklyHours: integer("max_weekly_hours").default(40),
  
  // Availability
  availableForLastMinute: boolean("available_for_last_minute").default(false),
  typicalResponseTime: integer("typical_response_time").default(120), // minutes
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_employee_metrics_employee").on(table.employeeId),
  index("idx_employee_metrics_reliability").on(table.reliabilityScore),
]);

export const insertEmployeeMetricsSchema = createInsertSchema(employeeMetrics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeMetrics = z.infer<typeof insertEmployeeMetricsSchema>;
export type EmployeeMetrics = typeof employeeMetrics.$inferSelect;

// ============================================================================
// UNIVERSAL DATA MIGRATION SYSTEM
// ============================================================================

// Document type enum for migration system
export const migrationDocumentTypeEnum = pgEnum('migration_document_type', [
  'employees', 'payroll', 'schedules', 'invoices', 'timesheets', 'clients', 'other'
]);

// Migration job status
export const migrationJobStatusEnum = pgEnum('migration_job_status', [
  'uploaded', 'analyzing', 'reviewed', 'importing', 'completed', 'failed', 'cancelled'
]);

// Migration jobs - Track overall migration sessions
export const migrationJobs = pgTable("migration_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id),
  
  status: migrationJobStatusEnum("status").default('uploaded').notNull(),
  totalDocuments: integer("total_documents").default(0),
  processedDocuments: integer("processed_documents").default(0),
  
  // AI Brain integration
  syncedToAiBrain: boolean("synced_to_ai_brain").default(false),
  aiBrainJobId: varchar("ai_brain_job_id"), // Reference to AI Brain knowledge graph job
  
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_migration_jobs_workspace").on(table.workspaceId),
  index("idx_migration_jobs_status").on(table.status),
]);

export const insertMigrationJobSchema = createInsertSchema(migrationJobs).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export type InsertMigrationJob = z.infer<typeof insertMigrationJobSchema>;
export type MigrationJob = typeof migrationJobs.$inferSelect;

// Migration documents - Track individual uploaded files
export const migrationDocuments = pgTable("migration_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => migrationJobs.id, { onDelete: 'cascade' }),
  
  fileName: varchar("file_name").notNull(),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type").notNull(),
  
  detectedType: migrationDocumentTypeEnum("detected_type").notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 2 }).default("0.00"), // 0-100%
  
  extractedData: jsonb("extracted_data"), // Raw JSON from Gemini
  validationErrors: jsonb("validation_errors").default(sql`'[]'::jsonb`),
  warnings: jsonb("warnings").default(sql`'[]'::jsonb`),
  
  recordsExtracted: integer("records_extracted").default(0),
  recordsImported: integer("records_imported").default(0),
  
  requiresReview: boolean("requires_review").default(false),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_migration_documents_job").on(table.jobId),
  index("idx_migration_documents_type").on(table.detectedType),
]);

export const insertMigrationDocumentSchema = createInsertSchema(migrationDocuments).omit({
  id: true,
  createdAt: true,
});

export type InsertMigrationDocument = z.infer<typeof insertMigrationDocumentSchema>;
export type MigrationDocument = typeof migrationDocuments.$inferSelect;

// Migration records - Track individual extracted records for audit and AI sync
export const migrationRecords = pgTable("migration_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => migrationDocuments.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  recordType: migrationDocumentTypeEnum("record_type").notNull(),
  extractedData: jsonb("extracted_data").notNull(), // Individual record data
  
  importedToTable: varchar("imported_to_table"), // employees, shifts, invoices, etc.
  importedRecordId: varchar("imported_record_id"), // ID of created record
  
  importStatus: varchar("import_status").default('pending'), // pending, imported, failed, skipped
  importError: text("import_error"),
  
  // Role sync - ALL workspace roles can access via audit systems
  accessibleByRoles: text("accessible_by_roles").array().default(sql`ARRAY['org_owner', 'org_admin', 'org_manager', 'employee', 'support_staff']::text[]`),
  
  createdAt: timestamp("created_at").defaultNow(),
  importedAt: timestamp("imported_at"),
}, (table) => [
  index("idx_migration_records_document").on(table.documentId),
  index("idx_migration_records_workspace").on(table.workspaceId),
  index("idx_migration_records_type").on(table.recordType),
]);

export const insertMigrationRecordSchema = createInsertSchema(migrationRecords).omit({
  id: true,
  createdAt: true,
  importedAt: true,
});

export type InsertMigrationRecord = z.infer<typeof insertMigrationRecordSchema>;
export type MigrationRecord = typeof migrationRecords.$inferSelect;

// ============================================================================
// CONTRACTOR POOL & MARKETPLACE TABLES
// ============================================================================

// Contractor Pool (external workers available for Fill Request)
export const contractorPool = pgTable("contractor_pool", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Basic info
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  email: varchar("email").notNull(),
  phone: varchar("phone").notNull(),
  
  // Employment type
  contractorType: varchar("contractor_type").notNull(), // "w2_temp", "1099_independent", "agency"
  agencyName: varchar("agency_name"), // If agency worker
  
  // Availability
  isActive: boolean("is_active").default(true),
  availableForLastMinute: boolean("available_for_last_minute").default(true),
  maxDistanceWilling: integer("max_distance_willing").default(75), // miles
  homeLatitude: decimal("home_latitude", { precision: 10, scale: 7 }),
  homeLongitude: decimal("home_longitude", { precision: 10, scale: 7 }),
  
  // Compensation
  minHourlyRate: decimal("min_hourly_rate", { precision: 10, scale: 2 }).notNull(),
  maxHourlyRate: decimal("max_hourly_rate", { precision: 10, scale: 2 }),
  overtimeAllowed: boolean("overtime_allowed").default(false),
  maxWeeklyHours: integer("max_weekly_hours").default(40),
  
  // Profile
  profilePhotoUrl: text("profile_photo_url"),
  bio: text("bio"),
  
  // Onboarding status
  onboardingCompleted: boolean("onboarding_completed").default(false),
  backgroundCheckStatus: varchar("background_check_status").default("pending"), // "pending", "approved", "failed"
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_contractor_pool_active").on(table.isActive, table.availableForLastMinute),
  index("idx_contractor_pool_email").on(table.email),
]);

export const insertContractorPoolSchema = createInsertSchema(contractorPool).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContractorPool = z.infer<typeof insertContractorPoolSchema>;
export type ContractorPool = typeof contractorPool.$inferSelect;

// Contractor Skills
export const contractorSkills = pgTable("contractor_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractorId: varchar("contractor_id").notNull().references(() => contractorPool.id, { onDelete: 'cascade' }),
  skillName: varchar("skill_name").notNull(),
  skillCategory: varchar("skill_category").notNull(),
  proficiencyLevel: integer("proficiency_level").default(3),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_contractor_skills_contractor").on(table.contractorId),
]);

export const insertContractorSkillSchema = createInsertSchema(contractorSkills).omit({
  id: true,
  createdAt: true,
});

export type InsertContractorSkill = z.infer<typeof insertContractorSkillSchema>;
export type ContractorSkill = typeof contractorSkills.$inferSelect;

// Contractor Certifications
export const contractorCertifications = pgTable("contractor_certifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractorId: varchar("contractor_id").notNull().references(() => contractorPool.id, { onDelete: 'cascade' }),
  certificationType: varchar("certification_type").notNull(),
  certificationName: varchar("certification_name").notNull(),
  certificationNumber: varchar("certification_number"),
  issuedDate: timestamp("issued_date"),
  expirationDate: timestamp("expiration_date"),
  status: varchar("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_contractor_certs_contractor").on(table.contractorId),
]);

export const insertContractorCertificationSchema = createInsertSchema(contractorCertifications).omit({
  id: true,
  createdAt: true,
});

export type InsertContractorCertification = z.infer<typeof insertContractorCertificationSchema>;
export type ContractorCertification = typeof contractorCertifications.$inferSelect;

// Contractor Performance Metrics
export const contractorMetrics = pgTable("contractor_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractorId: varchar("contractor_id").notNull().references(() => contractorPool.id, { onDelete: 'cascade' }),
  
  reliabilityScore: decimal("reliability_score", { precision: 3, scale: 2 }).default("0.80"),
  tardinessCount: integer("tardiness_count").default(0),
  noShowCount: integer("no_show_count").default(0),
  yearsExperience: decimal("years_experience", { precision: 4, scale: 1 }).default("0.0"),
  shiftsCompleted: integer("shifts_completed").default(0),
  totalHoursWorked: decimal("total_hours_worked", { precision: 10, scale: 2 }).default("0.00"),
  averageRating: decimal("average_rating", { precision: 2, scale: 1 }).default("4.0"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_contractor_metrics_contractor").on(table.contractorId),
]);

export const insertContractorMetricsSchema = createInsertSchema(contractorMetrics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContractorMetrics = z.infer<typeof insertContractorMetricsSchema>;
export type ContractorMetrics = typeof contractorMetrics.$inferSelect;

// Shift Requests (when no internal employees available)
export const shiftRequests = pgTable("shift_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  shiftId: varchar("shift_id").notNull().references(() => shifts.id, { onDelete: 'cascade' }),
  
  requestReason: text("request_reason"), // Why searching external pool
  requiredSkills: text("required_skills").array(), // Must-have skills
  preferredSkills: text("preferred_skills").array(), // Nice-to-have skills
  maxPayRate: decimal("max_pay_rate", { precision: 10, scale: 2 }), // Budget constraint
  maxDistance: integer("max_distance").default(50),
  
  status: varchar("status").default("searching"), // "searching", "offers_sent", "filled", "cancelled"
  offersCount: integer("offers_count").default(0),
  acceptedOfferId: varchar("accepted_offer_id"),
  
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_shift_requests_workspace").on(table.workspaceId, table.status),
  index("idx_shift_requests_shift").on(table.shiftId),
]);

export const insertShiftRequestSchema = createInsertSchema(shiftRequests).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export type InsertShiftRequest = z.infer<typeof insertShiftRequestSchema>;
export type ShiftRequest = typeof shiftRequests.$inferSelect;

// Shift Offers (sent to contractors)
export const shiftOffers = pgTable("shift_offers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shiftRequestId: varchar("shift_request_id").notNull().references(() => shiftRequests.id, { onDelete: 'cascade' }),
  shiftId: varchar("shift_id").notNull().references(() => shifts.id, { onDelete: 'cascade' }),
  contractorId: varchar("contractor_id").notNull().references(() => contractorPool.id, { onDelete: 'cascade' }),
  
  // Offer details
  offeredPayRate: decimal("offered_pay_rate", { precision: 10, scale: 2 }).notNull(),
  matchScore: decimal("match_score", { precision: 3, scale: 2 }), // 0.00-1.00 from AI scoring
  matchReasons: jsonb("match_reasons").$type<string[]>(), // Why this contractor matched
  
  // Status tracking
  status: varchar("status").default("pending"), // "pending", "accepted", "declined", "expired"
  sentAt: timestamp("sent_at").defaultNow(),
  respondedAt: timestamp("responded_at"),
  expiresAt: timestamp("expires_at").notNull(), // Offer expires after X hours
  
  // Response token (HMAC-signed for stateless contractor authentication)
  responseToken: varchar("response_token").unique(), // UUID + HMAC for secure one-click responses
  
  // Onboarding (if accepted)
  onboardingStarted: boolean("onboarding_started").default(false),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_shift_offers_request").on(table.shiftRequestId),
  index("idx_shift_offers_contractor").on(table.contractorId, table.status),
  index("idx_shift_offers_token").on(table.responseToken),
]);

// Contractor assignments - Keeps contractors separate from employees
export const contractorAssignments = pgTable("contractor_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  shiftId: varchar("shift_id").notNull().references(() => shifts.id, { onDelete: 'cascade' }),
  contractorId: varchar("contractor_id").notNull().references(() => contractorPool.id, { onDelete: 'cascade' }),
  shiftOfferId: varchar("shift_offer_id").notNull().references(() => shiftOffers.id, { onDelete: 'cascade' }),
  
  // Assignment details
  assignedRate: decimal("assigned_rate", { precision: 10, scale: 2 }).notNull(),
  assignedAt: timestamp("assigned_at").defaultNow(),
  assignedBy: varchar("assigned_by"), // User who created the fill request
  
  // Status
  status: varchar("status").default("active"), // "active", "cancelled", "completed"
  
  // Onboarding
  onboardingChecklistId: varchar("onboarding_checklist_id"),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_contractor_assignments_shift").on(table.shiftId),
  index("idx_contractor_assignments_contractor").on(table.contractorId),
  index("idx_contractor_assignments_workspace").on(table.workspaceId),
]);

export const insertContractorAssignmentSchema = createInsertSchema(contractorAssignments).omit({
  id: true,
  createdAt: true,
  assignedAt: true,
});
export type InsertContractorAssignment = z.infer<typeof insertContractorAssignmentSchema>;
export type ContractorAssignment = typeof contractorAssignments.$inferSelect;

export const insertShiftOfferSchema = createInsertSchema(shiftOffers).omit({
  id: true,
  createdAt: true,
  sentAt: true,
});

export type InsertShiftOffer = z.infer<typeof insertShiftOfferSchema>;
export type ShiftOffer = typeof shiftOffers.$inferSelect;

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
  // TALENT ANALYTICS EXTENDED FIELDS - Performance-to-Pay Loop & Analytics
  // ========================================================================

  // Auto-calculated performance metrics (from Unified Data Nexus)
  shiftsCompletedOnTime: integer("shifts_completed_on_time"),
  totalShiftsAssigned: integer("total_shifts_assigned"),
  attendanceRate: decimal("attendance_rate", { precision: 5, scale: 2 }),
  averageHoursWorkedPerWeek: decimal("average_hours_worked_per_week", { precision: 5, scale: 2 }),
  overtimeHours: decimal("overtime_hours", { precision: 10, scale: 2 }),

  // Report quality metrics (Reports & Forms integration)
  reportsSubmitted: integer("reports_submitted"),
  reportsApproved: integer("reports_approved"),
  reportsRejected: integer("reports_rejected"),
  reportQualityScore: decimal("report_quality_score", { precision: 5, scale: 2 }),

  // Compliance & safety
  complianceViolations: integer("compliance_violations"),
  safetyIncidents: integer("safety_incidents"),
  trainingCompletionRate: decimal("training_completion_rate", { precision: 5, scale: 2 }),

  // Additional subjective ratings (Talent Analytics)
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
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }), // Link client to user account
  
  // External ID (CLI-XXXX-NNNNN format)
  clientCode: varchar("client_code"),

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
  stripeCustomerId: varchar("stripe_customer_id"), // Stripe customer ID for automated billing

  // Client-Specific Rate Multiplier Overrides (for enterprise contracts)
  // If set, these override workspace defaults for this client's billing
  clientOvertimeMultiplier: decimal("client_overtime_multiplier", { precision: 5, scale: 2 }), // Override workspace OT multiplier
  clientHolidayMultiplier: decimal("client_holiday_multiplier", { precision: 5, scale: 2 }), // Override workspace holiday multiplier

  // Status
  isActive: boolean("is_active").default(true),
  notes: text("notes"),

  // Visual branding (for schedule display)
  color: varchar("color").default("#3b82f6"), // Brand color for calendar display (vibrant blue default)

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Add index on userId for performance
  userIdIdx: index("clients_user_id_idx").on(table.userId),
}));

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

// Shift category for visual theming (matches homepage preview colors)
export const shiftCategoryEnum = pgEnum('shift_category', [
  'general',        // Default - uses client/employee color
  'tech_support',   // Royal blue (#3b82f6)
  'field_ops',      // Vibrant blue (#2563eb)
  'healthcare',     // Sky blue (#0ea5e9)
  'training',       // Blue (#1d4ed8)
  'emergency',      // Magenta/Purple (#a855f7)
  'admin',          // Purple (#8b5cf6)
  'security',       // Teal/Cyan (#14b8a6)
]);

// Shifts (Scheduled time blocks)
export const shifts = pgTable("shifts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").references(() => employees.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: 'set null' }),

  // Shift details
  title: varchar("title"),
  description: text("description"),
  category: shiftCategoryEnum("category").default("general"), // Visual theme category for colorful scheduling
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
}, (table) => [
  index("shifts_workspace_idx").on(table.workspaceId),
  index("shifts_employee_idx").on(table.employeeId),
  index("shifts_client_idx").on(table.clientId),
  index("shifts_time_range_idx").on(table.workspaceId, table.startTime, table.endTime),
  index("shifts_status_idx").on(table.status),
  index("shifts_created_at_idx").on(table.createdAt),
  index("shifts_ai_generated_idx").on(table.aiGenerated),
]);

// ============================================================================
// CUSTOM SCHEDULER INTERVALS TABLE - Phase 2 Critical Blocker
// ============================================================================

export const customSchedulerIntervals = pgTable("custom_scheduler_intervals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }).unique(),
  
  // Automation scheduling intervals (cron-like)
  scheduleInterval: varchar("schedule_interval"), // 'weekly', 'biweekly', 'monthly', 'custom'
  scheduleTime: varchar("schedule_time"), // '09:00', '14:30', etc.
  scheduleDay: varchar("schedule_day"), // 'monday', 'friday', etc.
  
  // Custom interval tracking
  customCronExpression: varchar("custom_cron_expression"), // '0 9 * * MON' for Monday 9 AM
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  
  // Invoice & Payroll generation settings
  autoGenerateInvoices: boolean("auto_generate_invoices").default(true),
  autoGeneratePayroll: boolean("auto_generate_payroll").default(true),
  autoApproveThreshold: integer("auto_approve_threshold").default(85), // Auto-approve if AI confidence > 85%
  
  // Settings
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCustomSchedulerIntervalSchema = createInsertSchema(customSchedulerIntervals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCustomSchedulerInterval = z.infer<typeof insertCustomSchedulerIntervalSchema>;
export type CustomSchedulerInterval = typeof customSchedulerIntervals.$inferSelect;

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

// ============================================================================
// RECURRING SHIFT PATTERNS - Phase 2B Advanced Scheduling
// ============================================================================

export const recurrencePatternEnum = pgEnum('recurrence_pattern', ['daily', 'weekly', 'biweekly', 'monthly']);
export const dayOfWeekEnum = pgEnum('day_of_week', ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']);

export const recurringShiftPatterns = pgTable("recurring_shift_patterns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Template details
  employeeId: varchar("employee_id").references(() => employees.id, { onDelete: 'set null' }),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: 'set null' }),
  title: varchar("title").notNull(),
  description: text("description"),
  category: shiftCategoryEnum("category").default("general"),
  
  // Time configuration
  startTimeOfDay: varchar("start_time_of_day").notNull(), // 'HH:mm' format
  endTimeOfDay: varchar("end_time_of_day").notNull(), // 'HH:mm' format
  daysOfWeek: text("days_of_week").array().notNull(), // ['monday', 'wednesday', 'friday']
  recurrencePattern: recurrencePatternEnum("recurrence_pattern").notNull().default('weekly'),
  
  // Date range
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"), // null = indefinite
  skipDates: timestamp("skip_dates").array(), // Holidays, exceptions
  
  // Billing
  billableToClient: boolean("billable_to_client").default(true),
  hourlyRateOverride: decimal("hourly_rate_override", { precision: 10, scale: 2 }),
  
  // Status & metadata
  isActive: boolean("is_active").default(true),
  lastGeneratedDate: timestamp("last_generated_date"), // Track last shift generation
  shiftsGenerated: integer("shifts_generated").default(0), // Count of shifts created
  createdBy: varchar("created_by").references(() => users.id),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_recurring_patterns_workspace").on(table.workspaceId, table.isActive),
  index("idx_recurring_patterns_employee").on(table.employeeId),
]);

export const insertRecurringShiftPatternSchema = createInsertSchema(recurringShiftPatterns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastGeneratedDate: true,
  shiftsGenerated: true,
});

export type InsertRecurringShiftPattern = z.infer<typeof insertRecurringShiftPatternSchema>;
export type RecurringShiftPattern = typeof recurringShiftPatterns.$inferSelect;

// ============================================================================
// SHIFT SWAP REQUESTS - Phase 2B Advanced Scheduling
// ============================================================================

export const swapRequestStatusEnum = pgEnum('swap_request_status', ['pending', 'approved', 'rejected', 'cancelled', 'expired']);

export const shiftSwapRequests = pgTable("shift_swap_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  shiftId: varchar("shift_id").notNull().references(() => shifts.id, { onDelete: 'cascade' }),
  
  // Requester (employee who wants to give up the shift)
  requesterId: varchar("requester_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  
  // Target employee (who will take the shift, null = open for anyone)
  targetEmployeeId: varchar("target_employee_id").references(() => employees.id, { onDelete: 'set null' }),
  
  // Request details
  reason: text("reason"),
  status: swapRequestStatusEnum("status").notNull().default('pending'),
  
  // Manager response
  respondedBy: varchar("responded_by").references(() => users.id),
  responseMessage: text("response_message"),
  respondedAt: timestamp("responded_at"),
  
  // AI suggestions
  aiSuggestedEmployees: jsonb("ai_suggested_employees").$type<Array<{
    employeeId: string;
    employeeName: string;
    score: number;
    reasons: string[];
  }>>(),
  aiProcessedAt: timestamp("ai_processed_at"),
  
  // Expiration
  expiresAt: timestamp("expires_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_swap_requests_workspace").on(table.workspaceId, table.status),
  index("idx_swap_requests_shift").on(table.shiftId),
  index("idx_swap_requests_requester").on(table.requesterId),
]);

export const insertShiftSwapRequestSchema = createInsertSchema(shiftSwapRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  respondedAt: true,
  aiProcessedAt: true,
  aiSuggestedEmployees: true,
});

export type InsertShiftSwapRequest = z.infer<typeof insertShiftSwapRequestSchema>;
export type ShiftSwapRequest = typeof shiftSwapRequests.$inferSelect;

// ============================================================================
// SCHEDULE TEMPLATES - Phase 2B Advanced Scheduling
// ============================================================================

export const scheduleTemplates = pgTable("schedule_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Template info
  name: varchar("name").notNull(),
  description: text("description"),
  
  // Shift patterns stored as JSON array
  shiftPatterns: jsonb("shift_patterns").$type<Array<{
    title?: string;
    employeeId?: string;
    clientId?: string;
    location?: string;
    description?: string;
    startTimeOffset: number; // Minutes from midnight
    endTimeOffset: number; // Minutes from midnight
    dayOfWeek?: number; // 0-6
  }>>(),
  
  // Metadata
  createdBy: varchar("created_by").references(() => users.id),
  usageCount: integer("usage_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_schedule_templates_workspace").on(table.workspaceId),
]);

export const insertScheduleTemplateSchema = createInsertSchema(scheduleTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usageCount: true,
});

export type InsertScheduleTemplate = z.infer<typeof insertScheduleTemplateSchema>;
export type ScheduleTemplate = typeof scheduleTemplates.$inferSelect;

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

// Schedule Proposals - AI-generated schedules awaiting approval (99% AI, 1% Human Governance)
export const scheduleProposals = pgTable("schedule_proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Proposal metadata
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  
  // AI response (full ScheduleSmartResponse from Gemini)
  aiResponse: jsonb("ai_response").notNull(), // Contains assignments, confidence, summary
  confidence: integer("confidence").notNull(), // 0-100 (duplicated for query convenience)
  
  // Approval workflow
  status: varchar("status").default("pending"), // 'pending', 'approved', 'rejected', 'auto_approved'
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectedBy: varchar("rejected_by").references(() => users.id),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  
  // Legal disclaimer acknowledgment
  disclaimerAcknowledged: boolean("disclaimer_acknowledged").default(false),
  disclaimerAcknowledgedBy: varchar("disclaimer_acknowledged_by").references(() => users.id),
  disclaimerAcknowledgedAt: timestamp("disclaimer_acknowledged_at"),
  
  // Billing linkage
  aiUsageLogId: varchar("ai_usage_log_id").references(() => workspaceAiUsage.id),
  
  // Learning mechanism (track post-approval edits)
  shiftIdsCreated: text("shift_ids_created").array(), // Shifts actually created from this proposal
  editedAfterApproval: boolean("edited_after_approval").default(false),
  editCount: integer("edit_count").default(0),
  
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertScheduleProposalSchema = createInsertSchema(scheduleProposals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertScheduleProposal = z.infer<typeof insertScheduleProposalSchema>;
export type ScheduleProposal = typeof scheduleProposals.$inferSelect;

// Invoice Proposals - AI-generated invoices awaiting approval (Billing Platform Automation)
export const invoiceProposals = pgTable("invoice_proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Proposal metadata
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  
  // Invoice period
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: 'set null' }),
  
  // AI response (invoice line items, amounts, summary)
  aiResponse: jsonb("ai_response").notNull(), // Contains lineItems, total, taxes, summary
  confidence: integer("confidence").notNull(), // 0-100 (duplicated for query convenience)
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  
  // Approval workflow
  status: varchar("status").default("pending"), // 'pending', 'approved', 'rejected', 'auto_approved'
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectedBy: varchar("rejected_by").references(() => users.id),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  
  // Invoice tracking (after approval)
  invoiceIdCreated: varchar("invoice_id_created"), // Invoice ID generated from this proposal
  syncedToQuickBooks: boolean("synced_to_quickbooks").default(false),
  quickBooksInvoiceId: varchar("quickbooks_invoice_id"),
  
  // Billing linkage
  aiUsageLogId: varchar("ai_usage_log_id").references(() => workspaceAiUsage.id),
  
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInvoiceProposalSchema = createInsertSchema(invoiceProposals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInvoiceProposal = z.infer<typeof insertInvoiceProposalSchema>;
export type InvoiceProposal = typeof invoiceProposals.$inferSelect;

// Payroll Proposals - AI-generated payroll awaiting approval (Operations Automation)
export const payrollProposals = pgTable("payroll_proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Proposal metadata
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  
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
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectedBy: varchar("rejected_by").references(() => users.id),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  
  // Payroll tracking (after approval)
  payrollRunId: varchar("payroll_run_id"), // Payroll run ID generated from this proposal
  syncedToGusto: boolean("synced_to_gusto").default(false),
  gustoPayrollId: varchar("gusto_payroll_id"),
  
  // Billing linkage
  aiUsageLogId: varchar("ai_usage_log_id").references(() => workspaceAiUsage.id),
  
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPayrollProposalSchema = createInsertSchema(payrollProposals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPayrollProposal = z.infer<typeof insertPayrollProposalSchema>;
export type PayrollProposal = typeof payrollProposals.$inferSelect;

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
  clockInPhotoUrl: text("clock_in_photo_url"), // Photo verification at clock-in

  clockOutLatitude: decimal("clock_out_latitude", { precision: 10, scale: 7 }), // GPS lat at clock-out
  clockOutLongitude: decimal("clock_out_longitude", { precision: 10, scale: 7 }), // GPS lng at clock-out
  clockOutAccuracy: decimal("clock_out_accuracy", { precision: 8, scale: 2 }), // GPS accuracy in meters
  clockOutIpAddress: varchar("clock_out_ip_address"), // IP address at clock-out
  clockOutPhotoUrl: text("clock_out_photo_url"), // Photo verification at clock-out

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

  // Billing Platform & Payroll Platform Integration (separate orthogonal tracking)
  invoiceId: varchar("invoice_id").references(() => invoices.id, { onDelete: 'set null' }),
  billedAt: timestamp("billed_at"), // When included in invoice
  payrollRunId: varchar("payroll_run_id"), // Future: link to payroll run table
  payrolledAt: timestamp("payrolled_at"), // When included in payroll
  billableToClient: boolean("billable_to_client").default(true),

  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("time_entries_workspace_idx").on(table.workspaceId),
  index("time_entries_employee_idx").on(table.employeeId),
  index("time_entries_shift_idx").on(table.shiftId),
  index("time_entries_client_idx").on(table.clientId),
  index("time_entries_status_idx").on(table.status),
  index("time_entries_clock_in_idx").on(table.clockIn),
  index("time_entries_invoice_idx").on(table.invoiceId),
  index("time_entries_workspace_employee_idx").on(table.workspaceId, table.employeeId, table.clockIn),
]);

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

// Break type enum
export const breakTypeEnum = pgEnum('break_type', [
  'meal', // Meal break (typically 30-60 minutes)
  'rest', // Rest break (typically 10-15 minutes)
  'personal', // Personal break
  'emergency' // Emergency/unscheduled break
]);

// Time Entry Breaks - Track all breaks within a time entry/shift
export const timeEntryBreaks = pgTable("time_entry_breaks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  timeEntryId: varchar("time_entry_id").notNull().references(() => timeEntries.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  
  // Break tracking
  breakType: breakTypeEnum("break_type").default('rest'),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  duration: decimal("duration", { precision: 10, scale: 2 }), // Minutes
  
  // Break details
  isPaid: boolean("is_paid").default(false),
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTimeEntryBreakSchema = createInsertSchema(timeEntryBreaks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  startTime: z.string().or(z.date()),
  endTime: z.string().or(z.date()).optional(),
});

export type InsertTimeEntryBreak = z.infer<typeof insertTimeEntryBreakSchema>;
export type TimeEntryBreak = typeof timeEntryBreaks.$inferSelect;

// Audit action types
export const auditActionTypeEnum = pgEnum('audit_action_type', [
  'clock_in',
  'clock_out',
  'start_break',
  'end_break',
  'edit_time',
  'approve_time',
  'reject_time',
  'delete_time',
  'manual_entry',
  'system_adjustment'
]);

// Time Entry Audit Events - Complete audit trail for all time tracking actions
export const timeEntryAuditEvents = pgTable("time_entry_audit_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  timeEntryId: varchar("time_entry_id").references(() => timeEntries.id, { onDelete: 'cascade' }),
  breakId: varchar("break_id").references(() => timeEntryBreaks.id, { onDelete: 'cascade' }),
  
  // Actor information
  actorUserId: varchar("actor_user_id").references(() => users.id, { onDelete: 'set null' }),
  actorEmployeeId: varchar("actor_employee_id").references(() => employees.id, { onDelete: 'set null' }),
  actorName: varchar("actor_name").notNull(), // Cached for display
  
  // Action details
  actionType: auditActionTypeEnum("action_type").notNull(),
  description: text("description").notNull(), // Human-readable description
  payload: jsonb("payload"), // JSON data with before/after values, coordinates, etc.
  
  // Context
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
});

export const insertTimeEntryAuditEventSchema = createInsertSchema(timeEntryAuditEvents).omit({
  id: true,
  occurredAt: true,
});

export type InsertTimeEntryAuditEvent = z.infer<typeof insertTimeEntryAuditEventSchema>;
export type TimeEntryAuditEvent = typeof timeEntryAuditEvents.$inferSelect;

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
export const shiftOrderPhotoFrequencyEnum = pgEnum('shift_order_photo_frequency', ['hourly', 'per_shift', 'per_task', 'at_completion', 'custom']);

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
  requiresSignature: boolean("requires_signature").default(false),
  requiresPhotos: boolean("requires_photos").default(false),
  
  // Photo requirements
  photoFrequency: shiftOrderPhotoFrequencyEnum("photo_frequency"),
  photoInstructions: text("photo_instructions"),

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
  
  // Signature (if required)
  signatureUrl: varchar("signature_url"), // Object storage URL for signature image
  signedAt: timestamp("signed_at"),
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

// Shift Order Photos - Photo evidence for post orders
export const shiftOrderPhotos = pgTable("shift_order_photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  shiftOrderId: varchar("shift_order_id").notNull().references(() => shiftOrders.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  
  // Photo details
  photoUrl: varchar("photo_url").notNull(), // Object storage URL
  takenAt: timestamp("taken_at").notNull(), // When photo was taken
  uploadedBy: varchar("uploaded_by").notNull().references(() => users.id, { onDelete: 'cascade' }),
  notes: text("notes"), // Optional description/context
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("shift_order_photos_workspace_idx").on(table.workspaceId),
  index("shift_order_photos_order_idx").on(table.shiftOrderId),
]);

export const insertShiftOrderPhotoSchema = createInsertSchema(shiftOrderPhotos).omit({
  id: true,
  createdAt: true,
});

export type InsertShiftOrderPhoto = z.infer<typeof insertShiftOrderPhotoSchema>;
export type ShiftOrderPhoto = typeof shiftOrderPhotos.$inferSelect;

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
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }).default("0.00"), // Track partial payments
  paymentIntentId: varchar("payment_intent_id"), // Stripe Payment Intent ID
  stripeInvoiceId: varchar("stripe_invoice_id"), // Stripe Invoice ID for automated billing
  sentAt: timestamp("sent_at"), // When invoice was sent to client

  // Additional details
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("invoices_workspace_idx").on(table.workspaceId),
  index("invoices_client_idx").on(table.clientId),
  index("invoices_status_idx").on(table.status),
  index("invoices_due_date_idx").on(table.dueDate),
  index("invoices_workspace_status_idx").on(table.workspaceId, table.status),
  index("invoices_created_at_idx").on(table.createdAt),
]);

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
// BILLING PLATFORM - FULL FINANCIAL AUTOMATION SYSTEM
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

// ============================================================================
// MULTI-CURRENCY SUPPORT (Gap #P1)
// ============================================================================

// Exchange Rates - Stores daily exchange rates for multi-currency support
export const exchangeRates = pgTable("exchange_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
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
}, (table) => [
  index("exchange_rates_pair_idx").on(table.baseCurrency, table.targetCurrency),
  index("exchange_rates_date_idx").on(table.rateDate),
]);

export const insertExchangeRateSchema = createInsertSchema(exchangeRates).omit({
  id: true,
  createdAt: true,
  fetchedAt: true,
});

export type InsertExchangeRate = z.infer<typeof insertExchangeRateSchema>;
export type ExchangeRate = typeof exchangeRates.$inferSelect;

// Workspace Currency Settings - Stores per-workspace currency configuration
export const workspaceCurrencySettings = pgTable("workspace_currency_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }).unique(),
  
  // Primary currency for the workspace
  primaryCurrency: varchar("primary_currency", { length: 3 }).notNull().default('USD'),
  
  // Supported currencies for transactions
  supportedCurrencies: text("supported_currencies").array().default(sql`ARRAY['USD']::text[]`),
  
  // Display preferences
  currencyDisplayFormat: varchar("currency_display_format").default('symbol'), // 'symbol', 'code', 'both'
  decimalPlaces: integer("decimal_places").default(2),
  
  // Auto-conversion settings
  autoConvertToBase: boolean("auto_convert_to_base").default(true),
  exchangeRateMarginPercent: decimal("exchange_rate_margin_percent", { precision: 5, scale: 2 }).default('0.00'),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("workspace_currency_settings_workspace_idx").on(table.workspaceId),
]);

export const insertWorkspaceCurrencySettingsSchema = createInsertSchema(workspaceCurrencySettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWorkspaceCurrencySettings = z.infer<typeof insertWorkspaceCurrencySettingsSchema>;
export type WorkspaceCurrencySettings = typeof workspaceCurrencySettings.$inferSelect;

// Currency Conversion Audit Log - Tracks all currency conversions
export const currencyConversionLog = pgTable("currency_conversion_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Original transaction details
  sourceAmount: decimal("source_amount", { precision: 18, scale: 4 }).notNull(),
  sourceCurrency: varchar("source_currency", { length: 3 }).notNull(),
  
  // Converted amount
  targetAmount: decimal("target_amount", { precision: 18, scale: 4 }).notNull(),
  targetCurrency: varchar("target_currency", { length: 3 }).notNull(),
  
  // Rate used
  exchangeRate: decimal("exchange_rate", { precision: 18, scale: 8 }).notNull(),
  rateSource: varchar("rate_source").default('system'),
  rateDate: timestamp("rate_date").notNull(),
  
  // Reference to related record
  referenceType: varchar("reference_type"), // 'invoice', 'payroll', 'payment', etc.
  referenceId: varchar("reference_id"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("currency_conversion_log_workspace_idx").on(table.workspaceId),
  index("currency_conversion_log_reference_idx").on(table.referenceType, table.referenceId),
]);

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
  swapRequests: many(shiftSwapRequests),
}));

export const recurringShiftPatternsRelations = relations(recurringShiftPatterns, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [recurringShiftPatterns.workspaceId],
    references: [workspaces.id],
  }),
  employee: one(employees, {
    fields: [recurringShiftPatterns.employeeId],
    references: [employees.id],
  }),
  client: one(clients, {
    fields: [recurringShiftPatterns.clientId],
    references: [clients.id],
  }),
  createdByUser: one(users, {
    fields: [recurringShiftPatterns.createdBy],
    references: [users.id],
  }),
}));

export const shiftSwapRequestsRelations = relations(shiftSwapRequests, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [shiftSwapRequests.workspaceId],
    references: [workspaces.id],
  }),
  shift: one(shifts, {
    fields: [shiftSwapRequests.shiftId],
    references: [shifts.id],
  }),
  requester: one(employees, {
    fields: [shiftSwapRequests.requesterId],
    references: [employees.id],
    relationName: 'swapRequester',
  }),
  targetEmployee: one(employees, {
    fields: [shiftSwapRequests.targetEmployeeId],
    references: [employees.id],
    relationName: 'swapTarget',
  }),
  respondedByUser: one(users, {
    fields: [shiftSwapRequests.respondedBy],
    references: [users.id],
  }),
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
  breaks: many(timeEntryBreaks),
  auditEvents: many(timeEntryAuditEvents),
}));

export const timeEntryBreaksRelations = relations(timeEntryBreaks, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [timeEntryBreaks.workspaceId],
    references: [workspaces.id],
  }),
  timeEntry: one(timeEntries, {
    fields: [timeEntryBreaks.timeEntryId],
    references: [timeEntries.id],
  }),
  employee: one(employees, {
    fields: [timeEntryBreaks.employeeId],
    references: [employees.id],
  }),
}));

export const timeEntryAuditEventsRelations = relations(timeEntryAuditEvents, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [timeEntryAuditEvents.workspaceId],
    references: [workspaces.id],
  }),
  timeEntry: one(timeEntries, {
    fields: [timeEntryAuditEvents.timeEntryId],
    references: [timeEntries.id],
  }),
  break: one(timeEntryBreaks, {
    fields: [timeEntryAuditEvents.breakId],
    references: [timeEntryBreaks.id],
  }),
  actorUser: one(users, {
    fields: [timeEntryAuditEvents.actorUserId],
    references: [users.id],
  }),
  actorEmployee: one(employees, {
    fields: [timeEntryAuditEvents.actorEmployeeId],
    references: [employees.id],
  }),
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

// Invite Status Enum for tracking invitation lifecycle
export const inviteStatusEnum = pgEnum('invite_status', ['sent', 'opened', 'accepted', 'expired', 'revoked']);

// Onboarding Invites - Enhanced with tracking fields
export const onboardingInvites = pgTable("onboarding_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").references(() => employees.id, { onDelete: 'cascade' }),

  email: varchar("email").notNull(),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  role: varchar("role"), // Job title/role for the invited employee
  workspaceRole: workspaceRoleEnum("workspace_role").default("staff"), // Permission level

  inviteToken: varchar("invite_token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),

  // Enhanced tracking fields
  status: inviteStatusEnum("status").default("sent").notNull(),
  openedAt: timestamp("opened_at"), // When invite link was first clicked
  acceptedAt: timestamp("accepted_at"),
  isUsed: boolean("is_used").default(false),
  
  // Resend tracking
  resentCount: integer("resent_count").default(0),
  lastResentAt: timestamp("last_resent_at"),
  
  // Notification preferences
  sendEmailOnCreate: boolean("send_email_on_create").default(true),
  reminderSentAt: timestamp("reminder_sent_at"),

  sentBy: varchar("sent_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("onboarding_invites_workspace_idx").on(table.workspaceId),
  emailIdx: index("onboarding_invites_email_idx").on(table.email),
  statusIdx: index("onboarding_invites_status_idx").on(table.status),
  tokenIdx: index("onboarding_invites_token_idx").on(table.inviteToken),
}));

export const insertOnboardingInviteSchema = createInsertSchema(onboardingInvites).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOnboardingInvite = z.infer<typeof insertOnboardingInviteSchema>;
export type OnboardingInvite = typeof onboardingInvites.$inferSelect;
export type InviteStatus = 'sent' | 'opened' | 'accepted' | 'expired' | 'revoked';

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
// COMPLIANCE SYSTEM - I-9 WORK AUTHORIZATION & RE-VERIFICATION
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
// POLICY MANAGEMENT - HANDBOOK & POLICY ACKNOWLEDGMENT
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
// EMPLOYEE ONBOARDING - DIGITAL FILE CABINET & COMPLIANCE WORKFLOW (MONOPOLISTIC FEATURE)
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

  // Audit System Chat moderation actions
  'kick_user',
  'silence_user',
  'give_voice',
  'remove_voice',
  'ban_user',
  'unban_user',

  // Audit System Account management actions
  'reset_password',
  'unlock_account',
  'lock_account',
  'change_role',
  'change_permissions',

  // Audit System Workspace actions
  'transfer_ownership',
  'impersonate_user',

  // Audit System Data actions
  'export_data',
  'import_data',
  'delete_data',
  'restore_data',

  // Audit System actions
  'update_motd',
  'update_banner',
  'change_settings',
  'view_audit_logs',

  // Audit System Support actions
  'escalate_ticket',
  'transfer_ticket',
  'view_documents',
  'request_secure_info',
  'release_spectator',

  // Autonomous Automation actions (Billing Platform, Scheduling Platform, Payroll Platform)
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

  // Audit System Command tracking (IRC-style)
  commandId: varchar("command_id"), // Unique ID for command/response matching

  // Actor information
  userId: varchar("user_id").notNull().references(() => users.id),
  userEmail: varchar("user_email").notNull(), // Denormalized for audit trail persistence
  userRole: varchar("user_role").notNull(), // Role at time of action

  // Action details
  action: auditActionEnum("action").notNull(),
  actionDescription: text("action_description"), // Human-readable description for Audit System
  entityType: varchar("entity_type"), // 'employee', 'shift', 'invoice', 'user', 'message', etc.
  entityId: varchar("entity_id"),

  // Audit System Target tracking
  targetId: varchar("target_id"), // User, workspace, or resource affected by action
  targetName: varchar("target_name"), // Cached for historical accuracy
  targetType: varchar("target_type"), // 'user', 'workspace', 'message', 'document', etc.

  // Audit System Context
  conversationId: varchar("conversation_id"), // If chat-related
  reason: text("reason"), // Reason for action (e.g., kick/silence reason)

  // Change tracking
  changes: jsonb("changes"), // { before: {...}, after: {...} }
  metadata: jsonb("metadata"), // Additional context (API endpoint, feature flag, command payload, etc.)

  // Request context
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"), // Required for SOC2/GDPR traceability
  requestId: varchar("request_id"), // For correlating related actions

  // Audit System Result tracking
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
// PHASE 4D: PAYROLL DEDUCTIONS & GARNISHMENTS
// ============================================================================

export const payrollDeductions = pgTable("payroll_deductions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  payrollEntryId: varchar("payroll_entry_id").notNull().references(() => payrollEntries.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  deductionType: varchar("deduction_type").notNull(), // 'health_insurance', 'dental', 'vision', 'ira', '401k', 'hsa', 'fsa', 'other'
  description: text("description"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  isPreTax: boolean("is_pre_tax").default(true), // Pre-tax or post-tax
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const payrollGarnishments = pgTable("payroll_garnishments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  payrollEntryId: varchar("payroll_entry_id").notNull().references(() => payrollEntries.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  garnishmentType: varchar("garnishment_type").notNull(), // 'child_support', 'alimony', 'taxes', 'student_loans', 'court_order', 'other'
  description: text("description"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  priority: integer("priority").default(1), // 1=highest priority (federal taxes, child support), higher numbers=lower priority
  caseNumber: varchar("case_number"), // Court case reference
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPayrollDeductionSchema = createInsertSchema(payrollDeductions).omit({
  id: true,
  createdAt: true,
});

export const insertPayrollGarnishmentSchema = createInsertSchema(payrollGarnishments).omit({
  id: true,
  createdAt: true,
});

export type InsertPayrollDeduction = z.infer<typeof insertPayrollDeductionSchema>;
export type PayrollDeduction = typeof payrollDeductions.$inferSelect;
export type InsertPayrollGarnishment = z.infer<typeof insertPayrollGarnishmentSchema>;
export type PayrollGarnishment = typeof payrollGarnishments.$inferSelect;

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

  // Suspension tracking for investigations
  isSuspended: boolean("is_suspended").default(false),
  suspendedAt: timestamp("suspended_at"),
  suspendedBy: varchar("suspended_by").references(() => users.id),
  suspendedReason: text("suspended_reason"),

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
// AI BRAIN GOVERNANCE APPROVAL GATES
// Persistent storage for destructive action approvals - survives restarts
// ============================================================================

export const approvalStatusEnum = pgEnum('approval_status', ['pending', 'approved', 'rejected', 'expired', 'executed']);

export const governanceApprovals = pgTable("governance_approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actionType: varchar("action_type").notNull(),
  requesterId: varchar("requester_id").notNull().references(() => users.id),
  requesterRole: varchar("requester_role").notNull(),
  targetEntity: varchar("target_entity").notNull(),
  parameters: jsonb("parameters").default({}),
  reason: text("reason"),
  status: approvalStatusEnum("status").default("pending").notNull(),
  requiredApprovals: integer("required_approvals").default(1).notNull(),
  approvals: jsonb("approvals").default([]),
  expiresAt: timestamp("expires_at").notNull(),
  executedAt: timestamp("executed_at"),
  executedBy: varchar("executed_by").references(() => users.id),
  rejectedBy: varchar("rejected_by").references(() => users.id),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  statusIdx: index("governance_approvals_status_idx").on(table.status),
  requesterIdx: index("governance_approvals_requester_idx").on(table.requesterId),
  expiryIdx: index("governance_approvals_expiry_idx").on(table.expiresAt),
}));

export const insertGovernanceApprovalSchema = createInsertSchema(governanceApprovals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGovernanceApproval = z.infer<typeof insertGovernanceApprovalSchema>;
export type GovernanceApproval = typeof governanceApprovals.$inferSelect;

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
// MONOPOLISTIC REPORTS & FORMS FEATURES
// ============================================================================

// Real-Time KPI Alerts - Configurable notifications tied to AI Predictions and Custom Logic
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

// FAQ Source Type Enum - Where the FAQ originated from
export const faqSourceTypeEnum = pgEnum('faq_source_type', [
  'manual',           // Manually created by support staff
  'ai_learned',       // Auto-created from successful AI interactions
  'ticket_resolution', // Created from resolved support tickets
  'feature_update',   // Created/updated due to feature changes
  'gap_detection',    // Created to fill detected knowledge gap
  'import'            // Imported from external source
]);

// FAQ Status Enum - Lifecycle status
export const faqStatusEnum = pgEnum('faq_status', [
  'draft',            // Not yet published
  'published',        // Live and serving users
  'needs_review',     // Flagged for review (stale, low confidence)
  'needs_update',     // Flagged for update (feature changed, issues reported)
  'archived',         // No longer active but kept for history
  'deprecated'        // Replaced by newer FAQ
]);

// HelpAI FAQ Knowledge Base - FAQ articles for AI-powered bot assistance
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
  
  // === NEW: Provenance & Learning Metadata ===
  sourceType: faqSourceTypeEnum("source_type").default('manual'), // Where this FAQ came from
  sourceId: varchar("source_id"), // Reference ID (ticket ID, AI job ID, etc.)
  sourceContext: jsonb("source_context"), // Additional context (original question, resolution details)
  
  // === NEW: Verification & Quality ===
  status: faqStatusEnum("status").default('published'), // Lifecycle status
  confidenceScore: integer("confidence_score").default(100), // 0-100 confidence in accuracy
  lastVerifiedAt: timestamp("last_verified_at"), // When last verified as accurate
  lastVerifiedBy: varchar("last_verified_by").references(() => users.id),
  verificationNotes: text("verification_notes"), // Notes from verification
  
  // === NEW: Version Control ===
  version: integer("version").default(1), // Current version number
  previousVersionId: varchar("previous_version_id"), // Link to previous version
  changeReason: text("change_reason"), // Why this was updated
  
  // === NEW: Staleness Detection ===
  relatedFeature: varchar("related_feature"), // Feature this FAQ relates to (for update detection)
  expiresAt: timestamp("expires_at"), // Optional expiry for time-sensitive FAQs
  autoUpdateEnabled: boolean("auto_update_enabled").default(false), // Allow AI to auto-update
  
  // === NEW: Learning Metrics ===
  matchCount: integer("match_count").default(0), // How often this FAQ is matched to queries
  resolvedCount: integer("resolved_count").default(0), // How often it resolved user issues
  escalatedCount: integer("escalated_count").default(0), // How often users escalated after seeing this
  
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

// FAQ Version History - Track all changes to FAQs for audit trail
export const faqVersions = pgTable("faq_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  faqId: varchar("faq_id").notNull().references(() => helposFaqs.id, { onDelete: 'cascade' }),
  
  // Snapshot of FAQ content at this version
  version: integer("version").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: varchar("category").notNull(),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),
  
  // Change metadata
  changedBy: varchar("changed_by").references(() => users.id),
  changedByAi: boolean("changed_by_ai").default(false), // Was this an AI-initiated change?
  changeType: varchar("change_type").notNull(), // 'created', 'updated', 'corrected', 'merged', 'archived'
  changeReason: text("change_reason"),
  changeDiff: jsonb("change_diff"), // JSON diff of what changed
  
  // Source tracking
  sourceType: faqSourceTypeEnum("source_type"),
  sourceId: varchar("source_id"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFaqVersionSchema = createInsertSchema(faqVersions).omit({
  id: true,
  createdAt: true,
});

export type InsertFaqVersion = z.infer<typeof insertFaqVersionSchema>;
export type FaqVersion = typeof faqVersions.$inferSelect;

// FAQ Gap Events - Track unanswered questions and knowledge gaps
export const faqGapEvents = pgTable("faq_gap_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Gap detection source
  sourceType: varchar("source_type").notNull(), // 'chat_unanswered', 'low_confidence', 'ticket_common', 'feedback_negative'
  sourceId: varchar("source_id"), // Chat ID, ticket ID, feedback ID
  
  // The question/issue that wasn't answered well
  question: text("question").notNull(),
  context: jsonb("context"), // Additional context (user message, conversation history)
  
  // AI analysis
  suggestedCategory: varchar("suggested_category"),
  suggestedAnswer: text("suggested_answer"), // AI's attempted answer if any
  confidenceScore: integer("confidence_score"), // How confident AI was (0-100)
  
  // Resolution tracking
  status: varchar("status").default('open'), // 'open', 'faq_created', 'faq_updated', 'dismissed', 'duplicate'
  resolvedFaqId: varchar("resolved_faq_id").references(() => helposFaqs.id),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by").references(() => users.id),
  resolutionNotes: text("resolution_notes"),
  
  // Frequency tracking
  occurrenceCount: integer("occurrence_count").default(1), // How many times this gap was detected
  lastOccurredAt: timestamp("last_occurred_at").defaultNow(),
  
  // Clustering for similar gaps
  clusterId: varchar("cluster_id"), // Group similar gaps together
  similarityHash: varchar("similarity_hash"), // For deduplication
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFaqGapEventSchema = createInsertSchema(faqGapEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFaqGapEvent = z.infer<typeof insertFaqGapEventSchema>;
export type FaqGapEvent = typeof faqGapEvents.$inferSelect;

// FAQ Search History - Track all FAQ searches for analytics and learning
export const faqSearchHistory = pgTable("faq_search_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Search context
  query: text("query").notNull(), // The search query/question
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'set null' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  conversationId: varchar("conversation_id"), // For routing to correct chatroom
  
  // Results
  matchedFaqIds: text("matched_faq_ids").array().default(sql`ARRAY[]::text[]`), // FAQs found
  matchCount: integer("match_count").default(0), // How many FAQs matched
  topConfidenceScore: doublePrecision("top_confidence_score"), // Best match confidence (0-1)
  averageConfidenceScore: doublePrecision("average_confidence_score"), // Average of all matches
  
  // Search method
  searchMethod: varchar("search_method").notNull(), // 'semantic', 'keyword', 'hybrid'
  tokensUsed: integer("tokens_used").default(0), // For billing/analytics
  
  // Interaction
  resultClicked: boolean("result_clicked").default(false), // Did user click a result?
  resultClickedFaqId: varchar("result_clicked_faq_id").references(() => helposFaqs.id, { onDelete: 'set null' }),
  resultClickedAt: timestamp("result_clicked_at"),
  
  userFeedback: varchar("user_feedback"), // 'helpful', 'not_helpful', null = no feedback
  userFeedbackAt: timestamp("user_feedback_at"),
  
  // AI suggestion event
  suggestionEmitted: boolean("suggestion_emitted").default(false), // Was ai_suggestion event emitted?
  suggestionEmittedAt: timestamp("suggestion_emitted_at"),
  
  // Escalation tracking
  escalatedToSupport: boolean("escalated_to_support").default(false),
  escalatedAt: timestamp("escalated_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFaqSearchHistorySchema = createInsertSchema(faqSearchHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertFaqSearchHistory = z.infer<typeof insertFaqSearchHistorySchema>;
export type FaqSearchHistory = typeof faqSearchHistory.$inferSelect;

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
  // Types: 'dm_user' (user-to-user), 'dm_support' (support-to-user), 'dm_bot' (bot-to-user), 'open_chat' (Communications/monitored), 'shift_chat' (temporary shift chatroom)
  
  // Shift-specific chatroom (auto-created on clock-in, auto-closed on clock-out)
  shiftId: varchar("shift_id").references(() => shifts.id, { onDelete: 'set null' }),
  timeEntryId: varchar("time_entry_id").references(() => timeEntries.id, { onDelete: 'set null' }),
  
  // Workroom lifecycle management (Communications Platform Workroom Upgrade)
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

  // Sentiment Analysis (AI-driven emotional/urgency detection)
  sentiment: varchar("sentiment"), // 'positive', 'neutral', 'negative', 'urgent'
  sentimentScore: decimal("sentiment_score", { precision: 5, scale: 2 }), // -100 to +100 (negative to positive)
  sentimentConfidence: decimal("sentiment_confidence", { precision: 5, scale: 2 }), // 0-100 (confidence level)
  urgencyLevel: integer("urgency_level"), // 1-5 (1=low, 5=critical)
  shouldEscalate: boolean("should_escalate").default(false), // Flag for urgent/negative messages
  sentimentAnalyzedAt: timestamp("sentiment_analyzed_at"), // When sentiment was analyzed

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
  
  // Sentiment analysis indexes
  index("chat_messages_sentiment_idx").on(table.sentiment), // Query by sentiment
  index("chat_messages_should_escalate_idx").on(table.shouldEscalate), // Query urgent messages
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

// Chat Macros - Quick response templates for support agents
export const chatMacros = pgTable("chat_macros", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Macro details
  title: varchar("title").notNull(),
  content: text("content").notNull(),
  shortcut: varchar("shortcut"), // e.g., "/welcome", "/refund"
  category: varchar("category").notNull(), // 'greeting', 'closing', 'technical', 'billing'
  
  // Metadata
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("chat_macros_workspace_idx").on(table.workspaceId),
  index("chat_macros_category_idx").on(table.category),
  uniqueIndex("chat_macros_shortcut_unique").on(table.workspaceId, table.shortcut),
]);

// Typing Indicators - Track real-time typing status (ephemeral)
export const typingIndicators = pgTable("typing_indicators", {
  conversationId: varchar("conversation_id").notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  userName: varchar("user_name").notNull(),
  startedAt: timestamp("started_at").defaultNow(),
}, (table) => ({
  primaryKey: uniqueIndex("typing_indicators_unique").on(table.conversationId, table.userId),
  conversationIdx: index("typing_indicators_conversation_idx").on(table.conversationId),
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

export const insertChatMacroSchema = createInsertSchema(chatMacros).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTypingIndicatorSchema = createInsertSchema(typingIndicators).omit({
  startedAt: true,
});

export type InsertChatConversation = z.infer<typeof insertChatConversationSchema>;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertMessageReaction = z.infer<typeof insertMessageReactionSchema>;
export type MessageReaction = typeof messageReactions.$inferSelect;
export type InsertMessageReadReceipt = z.infer<typeof insertMessageReadReceiptSchema>;
export type MessageReadReceipt = typeof messageReadReceipts.$inferSelect;
export type InsertChatMacro = z.infer<typeof insertChatMacroSchema>;
export type ChatMacro = typeof chatMacros.$inferSelect;
export type InsertTypingIndicator = z.infer<typeof insertTypingIndicatorSchema>;
export type TypingIndicator = typeof typingIndicators.$inferSelect;

// Chat Message Edit Schema - Validation for editing existing messages
export const editChatMessageSchema = z.object({
  message: z.string().min(1).max(10000), // Message content validation
});

export type EditChatMessage = z.infer<typeof editChatMessageSchema>;

// ============================================================================
// COMMUNICATIONS WORKROOM UPGRADE - FILE UPLOADS, EVENTS, VOICE
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

  // Suspension tracking for investigations
  isSuspended: boolean("is_suspended").default(false),
  suspendedAt: timestamp("suspended_at"),
  suspendedBy: varchar("suspended_by").references(() => users.id),
  suspendedReason: text("suspended_reason"),
  
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

// HelpAI Queue Management - AI-powered support queue
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

// Service Health Status - Track platform service availability
export const serviceStatusEnum = pgEnum('service_status', ['operational', 'degraded', 'down']);
export const serviceKeyEnum = pgEnum('service_key', ['database', 'chat_websocket', 'gemini_ai', 'object_storage', 'stripe', 'email']);
export const errorTypeEnum = pgEnum('error_type', ['connection_failed', 'timeout', 'server_error', 'unknown']);
export const incidentStatusEnum = pgEnum('incident_status', ['submitted', 'triaged', 'resolved', 'dismissed']);

// Service Incident Reports - User-submitted error reports when services fail
export const serviceIncidentReports = pgTable("service_incident_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // User & workspace tracking
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }), // Null for anonymous
  
  // Service identification
  serviceKey: serviceKeyEnum("service_key").notNull(),
  errorType: errorTypeEnum("error_type").notNull(),
  
  // Criticality (for UI prioritization)
  isCriticalService: boolean("is_critical_service").default(true).notNull(), // false for email, object_storage
  
  // Error details
  userMessage: text("user_message"), // User-provided description
  errorMessage: text("error_message"), // Technical error message
  stackTrace: text("stack_trace"), // Error stack if available
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`), // { url, browser, viewport, etc. }
  
  // Screenshot/evidence
  screenshotUrl: varchar("screenshot_url"), // Object storage URL
  screenshotKey: varchar("screenshot_key"), // Object storage key for deletion
  
  // Support integration
  supportTicketId: varchar("support_ticket_id"),
  helpOsQueueId: varchar("help_os_queue_id"),
  
  // Status tracking
  status: incidentStatusEnum("status").default("submitted").notNull(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by").references(() => users.id, { onDelete: 'set null' }),
  resolutionNotes: text("resolution_notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("service_incident_reports_workspace_status_idx").on(table.workspaceId, table.status),
  index("service_incident_reports_service_key_idx").on(table.serviceKey),
  index("service_incident_reports_created_at_idx").on(table.createdAt),
]);

export const insertServiceIncidentReportSchema = createInsertSchema(serviceIncidentReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertServiceIncidentReport = z.infer<typeof insertServiceIncidentReportSchema>;
export type ServiceIncidentReport = typeof serviceIncidentReports.$inferSelect;

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
// SALES MVP: DEAL MANAGEMENT + PROCUREMENT - CRM & PROCUREMENT SYSTEM
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

  // Suspension tracking for investigations
  isSuspended: boolean("is_suspended").default(false),
  suspendedAt: timestamp("suspended_at"),
  suspendedBy: varchar("suspended_by").references(() => users.id),
  suspendedReason: text("suspended_reason"),

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
// AI PREDICTIONS - AI-POWERED PREDICTIVE ANALYTICS (MONOPOLISTIC FEATURE #1)
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

// Comprehensive audit trail for all critical changes (Payroll Platform & Time Platform)
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
// TALENT ANALYTICS - RECRUITMENT, PERFORMANCE, & RETENTION (MONOPOLISTIC TIER)
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

  // High-risk employee tracking (AI Predictions integration)
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

  // AI Predictions risk score at time of application
  turnoverRiskScore: integer("turnover_risk_score"), // 0-100 from AI Predictions
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
  requiredTrainingCourses: jsonb("required_training_courses").$type<string[]>().default(sql`'[]'`), // Links to Training Management

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
    trainingLinkId?: string; // Links to Training Management course
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
// ASSET MANAGEMENT - PHYSICAL RESOURCE ALLOCATION (MONOPOLISTIC TIER)
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

  // Billing (auto-calculated for Billing Platform)
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

  // Billing Platform integration
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
// EMPLOYEE ENGAGEMENT - BIDIRECTIONAL INTELLIGENCE SYSTEM
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

  // Ticket tracking (Support System integration)
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

  // Monetary reward (Billing Platform integration)
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
  turnoverRiskScore: decimal("turnover_risk_score", { precision: 5, scale: 2 }), // AI Predictions integration
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
// INTEGRATIONS HUB - EXTERNAL ECOSYSTEM LAYER (MONOPOLISTIC LOCK-IN)
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
  isCertified: boolean("is_certified").default(false), // Official CoAIleague™ certification
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
// EMPLOYEE ONBOARDING - EMPLOYEE ONBOARDING WORKFLOWS
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
// OFFBOARDING SYSTEM - EXIT INTERVIEWS & OFFBOARDING WORKFLOWS
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
// EXPENSE MANAGEMENT - EXPENSE TRACKING & REIMBURSEMENTS
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
// BUDGET PLANNING - BUDGET PLANNING & FORECASTING
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
// TRAINING MANAGEMENT - LEARNING MANAGEMENT SYSTEM
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
// NOTE: Write-ups/disciplinary actions are handled through Reports & Forms (RMS) forms
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
// RECORD MANAGEMENT - NATURAL LANGUAGE SEARCH
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
// AI INSIGHTS - AI ANALYTICS & AUTONOMOUS INSIGHTS
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
// EMPLOYEE AVAILABILITY - AI SCHEDULING INTEGRATION
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
  
  // Recurring vs one-time availability
  isRecurring: boolean("is_recurring").default(true), // true = repeats weekly, false = single occurrence
  
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
  aiNotified: boolean("ai_notified").default(false), // Has Scheduling been notified?
  
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
// COMMUNICATIONS - ORGANIZATION CHAT ROOMS & CHANNELS
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
// PLATFORM UPDATES - WHAT'S NEW FEED
// ============================================================================

// Platform update category enum
export const platformUpdateCategoryEnum = pgEnum('platform_update_category', [
  'feature',               // New feature release
  'improvement',           // Enhancement to existing feature
  'bugfix',                // Bug fix
  'security',              // Security patch
  'announcement',          // Platform announcement
  'maintenance',           // System maintenance, scheduled downtime
  'diagnostic',            // Trinity diagnostics, system health
  'support',               // Support requests, help desk
  'ai_brain',              // AI Brain messages, orchestration updates
  'error',                 // System errors, issues, incidents
  // Extended system categories (for System tab "Clear All" support)
  'fix',                   // Quick fixes, patches
  'hotpatch',              // Live hotpatches
  'deprecation',           // Deprecation notices
  'system',                // General system notifications
  'incident',              // Incident reports
  'outage',                // Service outage alerts
  'recovery',              // Recovery notifications
  'maintenance_update',    // Maintenance status updates
  'maintenance_postmortem',// Post-incident analysis
]);

// Tab group type for filtering What's New notifications
export type WhatsNewTabGroup = 'features' | 'enduser' | 'system';

// Map categories to tab groups for filtering
export const categoryToTabGroup: Record<string, WhatsNewTabGroup> = {
  feature: 'features',
  improvement: 'features',
  bugfix: 'enduser',
  security: 'enduser',
  announcement: 'enduser',
  maintenance: 'system',
  diagnostic: 'system',
  support: 'system',
  ai_brain: 'system',
  error: 'system',
};

// Minimum role required to view update (RBAC visibility)
export const updateVisibilityEnum = pgEnum('update_visibility', [
  'all',           // Everyone can see (default)
  'staff',         // Staff and above
  'supervisor',    // Supervisors and above
  'manager',       // Managers and above
  'admin',         // Admins and owners only
  'platform_staff' // Platform staff only (root, deputy, sysop)
]);

// Platform Updates table - What's New feed (global and workspace-scoped)
export const platformUpdates = pgTable("platform_updates", {
  id: varchar("id").primaryKey(), // Deterministic ID: type-title-timestamp
  
  // Content
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  category: platformUpdateCategoryEnum("category").notNull(),
  
  // Version and priority
  version: varchar("version", { length: 50 }),
  priority: integer("priority"), // Lower = higher priority (1 = top)
  badge: varchar("badge", { length: 50 }), // e.g., "NEW", "BETA"
  
  // Status
  isNew: boolean("is_new").default(true),
  
  // Links
  learnMoreUrl: varchar("learn_more_url", { length: 500 }),
  
  // RBAC visibility control
  visibility: updateVisibilityEnum("visibility").default('all'), // Who can see this update
  
  // Optional scoping
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }), // null = global
  createdBy: varchar("created_by").references(() => users.id), // Who published
  
  // Metadata
  metadata: jsonb("metadata"),
  
  // Timestamps
  date: timestamp("date").notNull().defaultNow(), // Original release date
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  categoryIdx: index("platform_updates_category_idx").on(table.category),
  priorityIdx: index("platform_updates_priority_idx").on(table.isNew, table.priority, table.createdAt),
  workspaceIdx: index("platform_updates_workspace_idx").on(table.workspaceId),
  dateIdx: index("platform_updates_date_idx").on(table.date),
  visibilityIdx: index("platform_updates_visibility_idx").on(table.visibility),
}));

export const insertPlatformUpdateSchema = createInsertSchema(platformUpdates).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertPlatformUpdate = z.infer<typeof insertPlatformUpdateSchema>;
export type PlatformUpdate = typeof platformUpdates.$inferSelect;

// Track which users have viewed which platform updates (persistent read receipts)
export const userPlatformUpdateViews = pgTable("user_platform_update_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  updateId: varchar("update_id").notNull().references(() => platformUpdates.id, { onDelete: 'cascade' }),
  
  // When the user viewed this update
  viewedAt: timestamp("viewed_at").defaultNow(),
  
  // How the user viewed it (modal, notification, feed)
  viewSource: varchar("view_source", { length: 50 }).default('feed'),
}, (table) => ({
  userUpdateIdx: uniqueIndex("user_platform_update_views_user_update_idx").on(table.userId, table.updateId),
  userIdx: index("user_platform_update_views_user_idx").on(table.userId),
  updateIdx: index("user_platform_update_views_update_idx").on(table.updateId),
}));

export const insertUserPlatformUpdateViewSchema = createInsertSchema(userPlatformUpdateViews).omit({
  id: true,
  viewedAt: true,
});

export type InsertUserPlatformUpdateView = z.infer<typeof insertUserPlatformUpdateViewSchema>;
export type UserPlatformUpdateView = typeof userPlatformUpdateViews.$inferSelect;

// ============================================================================
// NOTIFICATIONS - REAL-TIME USER NOTIFICATIONS
// ============================================================================

// Notification scope enum - determines routing and persistence rules
export const notificationScopeEnum = pgEnum('notification_scope', [
  'workspace',  // Tenant-scoped notification (requires workspaceId)
  'user',       // User-scoped notification (no workspace required, for global admins)
  'global',     // Platform-wide notification (broadcast to all users)
]);

// Notification category enum - for filtering and organizing notifications
export const notificationCategoryEnum = pgEnum('notification_category', [
  'system',      // Platform maintenance, known issues, services down
  'chat',        // Chat server notifications, mentions, DMs
  'whats_new',   // Platform updates, patches, new features (AI-summarized)
  'alerts',      // Important alerts requiring attention
  'activity',    // General activity (shifts, timesheets, approvals)
]);

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
  'support_escalation',  // HelpAI bot escalated ticket to human support
  'system',              // System notification
  'welcome_org',         // Welcome message for new organization
  'welcome_employee',    // Welcome message for new employee
  'invoice_generated',   // Invoice generated for client
  'invoice_paid',        // Invoice paid
  'payment_received',    // Payment received
  'ai_schedule_ready',   // AI-generated schedule ready for approval
  'ai_approval_needed',  // AI Brain needs approval for workflow
  'ai_action_completed', // AI Brain completed automated action
  'deadline_approaching', // Deadline approaching for approval/action
  'platform_maintenance', // Platform going down for maintenance
  'known_issue',         // Known issue being investigated
  'service_down',        // Service outage notification
  'service_restored',    // Service restored notification
  'platform_update',     // New platform update/patch deployed
  'feature_release',     // New feature released
]);

// Notifications table - supports workspace, user, and global scopes
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Scope determines routing and validation rules
  scope: notificationScopeEnum("scope").notNull().default('workspace'),
  
  // Category for filtering (system, chat, whats_new, alerts, activity)
  category: notificationCategoryEnum("category").default('activity'),
  
  // workspaceId is nullable for user-scoped and global notifications
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Notification content
  type: notificationTypeEnum("type").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  
  // Status - three states: unread, read (acknowledged), cleared (dismissed permanently)
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  isAcknowledged: boolean("is_acknowledged").default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
  clearedAt: timestamp("cleared_at"), // When null = visible; when set = permanently dismissed
  
  // Navigation
  actionUrl: varchar("action_url", { length: 500 }), // Where to go when clicked
  
  // Related entities (for tracking what triggered the notification)
  relatedEntityType: varchar("related_entity_type", { length: 100 }), // e.g., 'shift', 'employee', 'document'
  relatedEntityId: varchar("related_entity_id"), // ID of the related entity
  
  // For What's New / Platform Updates - links to change event
  changeEventId: varchar("change_event_id"), // Reference to platform change/patch
  
  // Metadata
  metadata: jsonb("metadata"), // Additional data (shift details, document name, AI summary, etc.)
  
  // Audit
  createdBy: varchar("created_by").references(() => users.id), // Who triggered this notification
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("notifications_user_idx").on(table.userId),
  workspaceIdx: index("notifications_workspace_idx").on(table.workspaceId),
  scopeIdx: index("notifications_scope_idx").on(table.scope),
  categoryIdx: index("notifications_category_idx").on(table.category),
  isReadIdx: index("notifications_is_read_idx").on(table.isRead),
  createdAtIdx: index("notifications_created_at_idx").on(table.createdAt),
  typeIdx: index("notifications_type_idx").on(table.type),
  clearedAtIdx: index("notifications_cleared_at_idx").on(table.clearedAt),
  userScopeIdx: index("notifications_user_scope_idx").on(table.userId, table.scope),
  userCategoryClearedIdx: index("notifications_user_category_cleared_idx").on(table.userId, table.category, table.isRead, table.clearedAt),
}));

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// ============================================================================
// WEB PUSH SUBSCRIPTIONS - Browser Push Notification Subscriptions
// ============================================================================
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  endpoint: text("endpoint").notNull(),
  p256dhKey: text("p256dh_key").notNull(),
  authKey: text("auth_key").notNull(),
  
  isActive: boolean("is_active").default(true).notNull(),
  userAgent: text("user_agent"),
  platform: varchar("platform", { length: 50 }),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("push_subscriptions_user_idx").on(table.userId),
  endpointIdx: index("push_subscriptions_endpoint_idx").on(table.endpoint),
  activeIdx: index("push_subscriptions_active_idx").on(table.isActive),
}));

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

// ============================================================================
// AI-POWERED NOTIFICATION DIGESTS - Prevent Notification Floods
// ============================================================================

// Digest frequency enum - How often to send AI-summarized notification digests
export const digestFrequencyEnum = pgEnum('digest_frequency', [
  'realtime',   // Send individual notifications immediately (default)
  '15min',      // Batch and summarize every 15 minutes
  '1hour',      // Batch and summarize every hour
  '4hours',     // Batch and summarize every 4 hours
  'daily',      // Once per day summary (morning)
  'never',      // Disable all notifications
]);

// Shift reminder timing enum
export const shiftReminderTimingEnum = pgEnum('shift_reminder_timing', [
  '15min',    // 15 minutes before
  '30min',    // 30 minutes before
  '1hour',    // 1 hour before
  '2hours',   // 2 hours before
  '4hours',   // 4 hours before
  '12hours',  // 12 hours before (half day)
  '24hours',  // 24 hours before
  '48hours',  // 48 hours before
  'custom',   // Custom minutes set in shiftReminderCustomMinutes
]);

// User Notification Preferences - Control how users receive notifications
export const userNotificationPreferences = pgTable("user_notification_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Digest settings
  digestFrequency: digestFrequencyEnum("digest_frequency").notNull().default('realtime'),
  enableAiSummarization: boolean("enable_ai_summarization").default(true), // Use Gemini to summarize
  
  // Notification type filters (which types to include in digests)
  enabledTypes: jsonb("enabled_types").$type<string[]>().default(sql`'[]'::jsonb`), // Empty = all types
  
  // Delivery channel preferences
  preferEmail: boolean("prefer_email").default(false), // Also send digest via email
  enableEmail: boolean("enable_email").default(true), // Enable email notifications
  enableSms: boolean("enable_sms").default(false), // Enable SMS notifications (requires Twilio)
  enablePush: boolean("enable_push").default(true), // Enable push/in-app notifications
  
  // SMS configuration
  smsPhoneNumber: varchar("sms_phone_number"), // User's phone number for SMS
  smsVerified: boolean("sms_verified").default(false), // Whether phone is verified
  smsOptOut: boolean("sms_opt_out").default(false), // User opted out of SMS
  
  // Shift reminder settings
  enableShiftReminders: boolean("enable_shift_reminders").default(true), // Enable shift reminders
  shiftReminderTiming: shiftReminderTimingEnum("shift_reminder_timing").default('1hour'), // When to send reminder
  shiftReminderCustomMinutes: integer("shift_reminder_custom_minutes"), // Custom minutes if timing='custom'
  shiftReminderChannels: jsonb("shift_reminder_channels").$type<string[]>().default(sql`'["push", "email"]'::jsonb`), // Channels: push, email, sms
  
  // Schedule change notifications
  enableScheduleChangeNotifications: boolean("enable_schedule_change_notifications").default(true),
  scheduleChangeChannels: jsonb("schedule_change_channels").$type<string[]>().default(sql`'["push", "email"]'::jsonb`),
  
  // Approval notifications
  enableApprovalNotifications: boolean("enable_approval_notifications").default(true),
  approvalNotificationChannels: jsonb("approval_notification_channels").$type<string[]>().default(sql`'["push", "email"]'::jsonb`),
  
  // Quiet hours
  quietHoursStart: integer("quiet_hours_start"), // 0-23 hour (null = disabled)
  quietHoursEnd: integer("quiet_hours_end"), // 0-23 hour
  
  // AI optimization
  aiOptimizedTiming: boolean("ai_optimized_timing").default(false), // Let AI learn best reminder times
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userWorkspaceIdx: index("user_notification_preferences_user_workspace_idx").on(table.userId, table.workspaceId),
}));

// Notification Digests - AI-summarized batches of notifications
export const notificationDigests = pgTable("notification_digests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Digest content
  title: varchar("title", { length: 255 }).notNull(), // e.g., "15 updates in the last hour"
  aiSummary: text("ai_summary").notNull(), // Gemini-generated summary
  rawSummary: text("raw_summary"), // Fallback non-AI summary (if Gemini fails)
  
  // Source notifications
  notificationIds: jsonb("notification_ids").$type<string[]>().notNull(), // IDs of notifications in this digest
  notificationCount: integer("notification_count").notNull(), // How many notifications summarized
  
  // Time window
  periodStart: timestamp("period_start").notNull(), // When this digest period started
  periodEnd: timestamp("period_end").notNull(), // When this digest period ended
  
  // Status
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  emailSent: boolean("email_sent").default(false),
  emailSentAt: timestamp("email_sent_at"),
  
  // AI metadata
  generatedBy: varchar("generated_by", { length: 50 }).default('gemini-2.0-flash-exp'), // AI model used
  confidenceScore: doublePrecision("confidence_score"), // AI confidence (0-1)
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("notification_digests_user_idx").on(table.userId),
  workspaceIdx: index("notification_digests_workspace_idx").on(table.workspaceId),
  isReadIdx: index("notification_digests_is_read_idx").on(table.isRead),
  createdAtIdx: index("notification_digests_created_at_idx").on(table.createdAt),
}));

export const insertUserNotificationPreferencesSchema = createInsertSchema(userNotificationPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNotificationDigestSchema = createInsertSchema(notificationDigests).omit({
  id: true,
  createdAt: true,
});

export type InsertUserNotificationPreferences = z.infer<typeof insertUserNotificationPreferencesSchema>;
export type UserNotificationPreferences = typeof userNotificationPreferences.$inferSelect;
export type InsertNotificationDigest = z.infer<typeof insertNotificationDigestSchema>;
export type NotificationDigest = typeof notificationDigests.$inferSelect;

// ============================================================================
// MAINTENANCE ALERTS - Support Staff System Notifications
// ============================================================================

// Maintenance alert severity enum
export const maintenanceAlertSeverityEnum = pgEnum('maintenance_alert_severity', [
  'info',       // Informational - no service impact expected
  'warning',    // Planned maintenance - some services may be affected
  'critical',   // Critical - significant service disruption expected
]);

// Maintenance alert status enum
export const maintenanceAlertStatusEnum = pgEnum('maintenance_alert_status', [
  'scheduled',   // Alert is scheduled but not yet started
  'in_progress', // Maintenance is currently in progress
  'completed',   // Maintenance has been completed
  'cancelled',   // Maintenance was cancelled
]);

// Maintenance alerts - for support staff to notify users of platform maintenance
export const maintenanceAlerts = pgTable("maintenance_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }), // null = platform-wide
  createdById: varchar("created_by_id").references(() => users.id, { onDelete: 'set null' }),
  
  // Alert details
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  severity: maintenanceAlertSeverityEnum("severity").notNull(),
  
  // Timing
  scheduledStartTime: timestamp("scheduled_start_time").notNull(),
  scheduledEndTime: timestamp("scheduled_end_time").notNull(),
  actualStartTime: timestamp("actual_start_time"),
  actualEndTime: timestamp("actual_end_time"),
  
  // Impact
  affectedServices: jsonb("affected_services").$type<string[]>().notNull(), // Array of service names
  estimatedImpactMinutes: integer("estimated_impact_minutes"),
  
  // Status tracking
  status: maintenanceAlertStatusEnum("status").default("scheduled"),
  isBroadcast: boolean("is_broadcast").default(false), // Sent to all workspaces if true
  
  // Admin tracking
  acknowledgedByCount: integer("acknowledged_by_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("maintenance_alerts_workspace_idx").on(table.workspaceId),
  statusIdx: index("maintenance_alerts_status_idx").on(table.status),
  severityIdx: index("maintenance_alerts_severity_idx").on(table.severity),
  scheduledIdx: index("maintenance_alerts_scheduled_idx").on(table.scheduledStartTime),
  createdIdx: index("maintenance_alerts_created_idx").on(table.createdAt),
}));

export const insertMaintenanceAlertSchema = createInsertSchema(maintenanceAlerts).omit({
  id: true,
  acknowledgedByCount: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMaintenanceAlert = z.infer<typeof insertMaintenanceAlertSchema>;
export type MaintenanceAlert = typeof maintenanceAlerts.$inferSelect;

// Maintenance acknowledgments - tracks which users have acknowledged alerts
export const maintenanceAcknowledgments = pgTable("maintenance_acknowledgments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alertId: varchar("alert_id").notNull().references(() => maintenanceAlerts.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  acknowledgedAt: timestamp("acknowledged_at").defaultNow(),
}, (table) => ({
  alertIdx: index("maintenance_acks_alert_idx").on(table.alertId),
  userIdx: index("maintenance_acks_user_idx").on(table.userId),
  uniqueAck: uniqueIndex("maintenance_acks_unique").on(table.alertId, table.userId),
}));

export const insertMaintenanceAcknowledgmentSchema = createInsertSchema(maintenanceAcknowledgments).omit({
  id: true,
  acknowledgedAt: true,
});

export type InsertMaintenanceAcknowledgment = z.infer<typeof insertMaintenanceAcknowledgmentSchema>;
export type MaintenanceAcknowledgment = typeof maintenanceAcknowledgments.$inferSelect;

// Update Notification Preferences Schema - Partial update for user preferences
export const updateNotificationPreferencesSchema = z.object({
  // Digest settings
  digestFrequency: z.enum(['realtime', '15min', '1hour', '4hours', 'daily', 'never']).optional(),
  enableAiSummarization: z.boolean().optional(),
  enabledTypes: z.array(z.string()).optional(),
  
  // Delivery channel preferences
  preferEmail: z.boolean().optional(),
  enableEmail: z.boolean().optional(),
  enableSms: z.boolean().optional(),
  enablePush: z.boolean().optional(),
  
  // SMS configuration
  smsPhoneNumber: z.string().nullable().optional(),
  smsVerified: z.boolean().optional(),
  smsOptOut: z.boolean().optional(),
  
  // Shift reminder settings
  enableShiftReminders: z.boolean().optional(),
  shiftReminderTiming: z.enum(['15min', '30min', '1hour', '2hours', '4hours', '12hours', '24hours', '48hours', 'custom']).optional(),
  shiftReminderCustomMinutes: z.number().int().min(5).max(10080).nullable().optional(), // 5 min to 7 days
  shiftReminderChannels: z.array(z.enum(['push', 'email', 'sms'])).optional(),
  
  // Schedule change notifications
  enableScheduleChangeNotifications: z.boolean().optional(),
  scheduleChangeChannels: z.array(z.enum(['push', 'email', 'sms'])).optional(),
  
  // Approval notifications
  enableApprovalNotifications: z.boolean().optional(),
  approvalNotificationChannels: z.array(z.enum(['push', 'email', 'sms'])).optional(),
  
  // Quiet hours
  quietHoursStart: z.number().int().min(0).max(23).nullable().optional(),
  quietHoursEnd: z.number().int().min(0).max(23).nullable().optional(),
  
  // AI optimization
  aiOptimizedTiming: z.boolean().optional(),
});

export type UpdateNotificationPreferences = z.infer<typeof updateNotificationPreferencesSchema>;

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
// DISPATCH SYSTEM - COMPUTER-AIDED DISPATCH SYSTEM
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
  featureKey: varchar("feature_key"), // Which CoAIleague feature triggered this (e.g., 'billos_invoice_creation')
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

// Partner Data Mappings - Map CoAIleague entities to partner entities
export const partnerDataMappings = pgTable("partner_data_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  partnerConnectionId: varchar("partner_connection_id").notNull().references(() => partnerConnections.id, { onDelete: 'cascade' }),
  
  // Partner identification (use enum for data integrity)
  partnerType: partnerTypeEnum("partner_type").notNull(),
  
  // Entity mapping
  entityType: varchar("entity_type").notNull(), // 'client', 'employee', 'invoice', 'payroll_run'
  coaileagueEntityId: varchar("coaileague_entity_id").notNull(), // CoAIleague entity ID (clients.id, employees.id, etc.)
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
  coaileagueEntityIdx: index("partner_mappings_coaileague_idx").on(table.coaileagueEntityId),
  partnerEntityIdx: index("partner_mappings_partner_entity_idx").on(table.partnerEntityId),
  uniqueMapping: uniqueIndex("unique_partner_mapping").on(
    table.workspaceId,
    table.partnerType,
    table.entityType,
    table.coaileagueEntityId
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

// ============================================================================
// ANALYTICS STATS SCHEMA - Universal Dashboard Metrics
// ============================================================================

export const analyticsStatsSchema = z.object({
  summary: z.object({
    totalWorkspaces: z.number(),
    totalCustomers: z.number(),
    activeEmployees: z.number(),
    monthlyRevenue: z.object({
      amount: z.number(),
      currency: z.string().default('USD'),
      previousMonth: z.number(),
      delta: z.number(),
    }),
    activeSubscriptions: z.number(),
  }),
  workspace: z.object({
    id: z.string(),
    name: z.string(),
    tier: z.string(),
    activeEmployees: z.number(),
    activeClients: z.number(),
    upcomingShifts: z.number(),
  }).optional(),
  support: z.object({
    openTickets: z.number(),
    unresolvedEscalations: z.number(),
    avgFirstResponseHours: z.number(),
    liveChats: z.object({
      active: z.number(),
      staffOnline: z.number(),
    }),
  }),
  system: z.object({
    cpu: z.number(),
    memory: z.number(),
    database: z.object({
      status: z.enum(['healthy', 'degraded']),
    }),
    uptimeSeconds: z.number(),
    updatedAt: z.string(),
  }),
  automation: z.object({
    hoursSavedThisMonth: z.number(),
    hoursSavedAllTime: z.number(),
    costAvoidanceMonthly: z.number(),
    costAvoidanceTotal: z.number(),
    aiSuccessRate: z.number(),
    avgConfidenceScore: z.number(),
    autoApprovalRate: z.number(),
    breakdown: z.object({
      scheduling: z.object({
        shiftsGenerated: z.number(),
        hoursSaved: z.number(),
        successRate: z.number(),
      }),
      billing: z.object({
        invoicesGenerated: z.number(),
        hoursSaved: z.number(),
        successRate: z.number(),
      }),
      payroll: z.object({
        payrollsProcessed: z.number(),
        hoursSaved: z.number(),
        successRate: z.number(),
      }),
    }),
    trend: z.object({
      percentChange: z.number(),
      isImproving: z.boolean(),
    }),
  }).optional(),
});

export type AnalyticsStats = z.infer<typeof analyticsStatsSchema>;

// ============================================================================
// HELP DESK AI SUPPORT SYSTEM
// ============================================================================

// HelpAI AI chat sessions - Track AI-powered support conversations
export const helposAiSessions = pgTable("helpos_ai_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  
  // Session metadata
  conversationId: varchar("conversation_id").references(() => chatConversations.id, { onDelete: 'set null' }), // Links to chat if escalated
  supportTicketId: varchar("support_ticket_id").references(() => supportTickets.id, { onDelete: 'set null' }), // Created on escalation
  
  // Status tracking
  status: varchar("status").notNull().default("active"), // 'active', 'resolved', 'escalated', 'closed'
  failedAttempts: integer("failed_attempts").default(0), // Tracks unsuccessful troubleshooting attempts
  
  // Escalation data
  escalationReason: varchar("escalation_reason"), // 'failed_attempts', 'critical_keyword', 'user_request'
  aiSummary: text("ai_summary"), // AI-generated conversation summary for human agent
  recommendedFix: text("recommended_fix"), // AI's suggested solution for agent
  escalatedAt: timestamp("escalated_at"),
  
  // Issue categorization
  detectedIssueCategory: varchar("detected_issue_category"), // 'login', 'schedule', 'timesheet', 'reports', etc.
  detectedSentiment: varchar("detected_sentiment"), // 'positive', 'neutral', 'frustrated', 'angry'
  
  // Session lifecycle
  lastInteractionAt: timestamp("last_interaction_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // Auto-delete after 1 year for compliance
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("helpos_sessions_workspace_idx").on(table.workspaceId),
  index("helpos_sessions_user_idx").on(table.userId),
  index("helpos_sessions_status_idx").on(table.status),
  index("helpos_sessions_expires_idx").on(table.expiresAt), // For cleanup jobs
]);

export const insertHelposAiSessionSchema = createInsertSchema(helposAiSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertHelposAiSession = z.infer<typeof insertHelposAiSessionSchema>;
export type HelposAiSession = typeof helposAiSessions.$inferSelect;

// HelpAI AI transcript entries - Audit trail for AI conversations (1-year retention)
export const helposAiTranscriptEntries = pgTable("helpos_ai_transcript_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => helposAiSessions.id, { onDelete: 'cascade' }),
  
  // Message content
  role: varchar("role").notNull(), // 'user', 'assistant', 'system'
  content: text("content").notNull(), // Message text
  
  // Metadata
  messageType: varchar("message_type").default("text"), // 'text', 'quick_action', 'escalation_notice'
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("helpos_transcripts_session_idx").on(table.sessionId),
  index("helpos_transcripts_created_idx").on(table.createdAt), // For chronological retrieval
]);

export const insertHelposAiTranscriptEntrySchema = createInsertSchema(helposAiTranscriptEntries).omit({
  id: true,
  createdAt: true,
});

export type InsertHelposAiTranscriptEntry = z.infer<typeof insertHelposAiTranscriptEntrySchema>;
export type HelposAiTranscriptEntry = typeof helposAiTranscriptEntries.$inferSelect;

// ============================================================================
// PLATFORM FEATURE UPDATES & ANNOUNCEMENTS
// ============================================================================

// Feature update status enum
export const featureUpdateStatusEnum = pgEnum('feature_update_status', [
  'draft',      // Being prepared by admin
  'scheduled',  // Scheduled for future release
  'active',     // Currently active and visible
  'expired',    // Past expiration date
  'archived'    // Manually archived
]);

// Feature update category enum
export const featureUpdateCategoryEnum = pgEnum('feature_update_category', [
  'new',         // New feature
  'improvement', // Feature improvement
  'fix',         // Bug fix
  'security',    // Security update
  'maintenance'  // Maintenance or infrastructure
]);

// Feature Updates - Platform-wide announcements with lifecycle management
export const featureUpdates = pgTable("feature_updates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Content
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  category: featureUpdateCategoryEnum("category").notNull(),
  isMajor: boolean("is_major").default(false), // Only major updates show in badge
  
  // Optional links
  learnMoreUrl: varchar("learn_more_url"),
  documentationUrl: varchar("documentation_url"),
  
  // Lifecycle management
  status: featureUpdateStatusEnum("status").notNull().default('draft'),
  releaseAt: timestamp("release_at"), // When to make visible (null = immediate)
  expireAt: timestamp("expire_at"),   // When to hide (null = never expire)
  
  // Admin metadata
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("feature_updates_status_idx").on(table.status),
  index("feature_updates_release_idx").on(table.releaseAt),
  index("feature_updates_major_idx").on(table.isMajor),
]);

export const insertFeatureUpdateSchema = createInsertSchema(featureUpdates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFeatureUpdate = z.infer<typeof insertFeatureUpdateSchema>;
export type FeatureUpdate = typeof featureUpdates.$inferSelect;

// Feature Update Receipts - Tracks which users have seen/dismissed each update
export const featureUpdateReceipts = pgTable("feature_update_receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // User tracking (workspace-scoped)
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  featureUpdateId: varchar("feature_update_id").notNull().references(() => featureUpdates.id, { onDelete: 'cascade' }),
  
  // Interaction tracking
  viewedAt: timestamp("viewed_at"), // When user first saw it
  dismissedAt: timestamp("dismissed_at"), // When user dismissed it
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("feature_receipts_user_idx").on(table.userId),
  index("feature_receipts_workspace_idx").on(table.workspaceId),
  index("feature_receipts_update_idx").on(table.featureUpdateId),
  // Ensure one receipt per user+workspace+update
  index("feature_receipts_unique_idx").on(table.userId, table.workspaceId, table.featureUpdateId),
]);

export const insertFeatureUpdateReceiptSchema = createInsertSchema(featureUpdateReceipts).omit({
  id: true,
  createdAt: true,
});

export type InsertFeatureUpdateReceipt = z.infer<typeof insertFeatureUpdateReceiptSchema>;
export type FeatureUpdateReceipt = typeof featureUpdateReceipts.$inferSelect;

// ============================================================================
// UNIFIED AI BRAIN - GLOBAL INTELLIGENCE SYSTEM
// ============================================================================

// AI Brain Job Status
export const aiBrainJobStatusEnum = pgEnum('ai_brain_job_status', [
  'pending',      // Queued, waiting to execute
  'running',      // Currently executing
  'completed',    // Successfully completed
  'failed',       // Execution failed
  'cancelled',    // User or system cancelled
  'requires_approval' // Needs human review
]);

// AI Brain Job Priority
export const aiBrainJobPriorityEnum = pgEnum('ai_brain_job_priority', [
  'low',
  'normal',
  'high',
  'critical'
]);

// AI Brain Skill Types (all autonomous features)
export const aiBrainSkillEnum = pgEnum('ai_brain_skill', [
  'scheduleos_generation',    // Schedule generation
  'scheduleos_migration',     // Schedule migration via vision
  'billos_invoice_review',    // Invoice review and approval
  'billos_payroll_review',    // Payroll review and approval
  'auditos_compliance',       // Compliance auditing
  'intelligenceos_prediction',// Predictive analytics
  'helpos_support',           // Customer support chat
  'disputeos_resolution',     // Dispute resolution
  'talentos_scoring',         // Employee scoring
  'marketingos_campaign',     // Marketing automation
  'business_insight',         // Business insights (sales, finance, operations, automation, growth)
  'platform_recommendation',  // Platform feature recommendations (self-selling)
  'faq_update'                // FAQ learning and updates
]);

// Monitoring & Alerting Enums
export const monitoringScopeEnum = pgEnum('monitoring_scope', [
  'global',
  'workspace'
]);

export const monitoringTypeEnum = pgEnum('monitoring_type', [
  'credential_expiry',
  'contract_expiry',
  'payment_issue',
  'schedule_conflict',
  'compliance_violation',
  'timecard_anomaly'
]);

export const monitoringStatusEnum = pgEnum('monitoring_status', [
  'active',
  'paused',
  'failed'
]);

export const alertTypeEnum = pgEnum('alert_type', [
  'credential_expiry',
  'contract_expiry',
  'payment_issue',
  'schedule_conflict',
  'compliance_violation',
  'timecard_anomaly',
  'system_alert',
  'overtime',
  'low_coverage',
  'payment_overdue',
  'shift_unfilled',
  'clock_anomaly',
  'budget_exceeded',
  'approval_pending'
]);

export const alertSeverityEnum = pgEnum('alert_severity', [
  'low',
  'medium',
  'high',
  'critical'
]);

export const alertChannelEnum = pgEnum('alert_channel', [
  'helpos',
  'email',
  'sms',
  'in_app'
]);

export const alertStatusEnum = pgEnum('alert_status', [
  'queued',
  'dispatched',
  'acknowledged',
  'resolved'
]);

export const notificationDeliveryStatusEnum = pgEnum('notification_delivery_status', [
  'pending',
  'sent',
  'delivered',
  'failed'
]);

// AI Brain Jobs - All AI task requests across the platform
export const aiBrainJobs = pgTable("ai_brain_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Job context
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  skill: aiBrainSkillEnum("skill").notNull(), // Which AI skill to use
  
  // Conversation context - for proper room routing
  conversationId: varchar("conversation_id"), // Chat conversation ID if chat-related
  sessionId: varchar("session_id"), // Session ID for conversation continuity
  
  // Job execution
  priority: aiBrainJobPriorityEnum("priority").notNull().default('normal'),
  status: aiBrainJobStatusEnum("status").notNull().default('pending'),
  
  // Input/Output
  input: jsonb("input").notNull(), // Job parameters
  output: jsonb("output"), // Job results
  error: text("error"), // Error message if failed
  
  // Execution metadata
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  executionTimeMs: integer("execution_time_ms"),
  retryCount: integer("retry_count").default(0),
  
  // AI metrics
  tokensUsed: integer("tokens_used"),
  confidenceScore: doublePrecision("confidence_score"), // 0-1, AI confidence in result
  requiresHumanReview: boolean("requires_human_review").default(false),
  
  // Approval workflow
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp("approved_at"),
  rejectedBy: varchar("rejected_by").references(() => users.id, { onDelete: 'set null' }),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("ai_brain_jobs_workspace_idx").on(table.workspaceId),
  index("ai_brain_jobs_status_idx").on(table.status),
  index("ai_brain_jobs_skill_idx").on(table.skill),
  index("ai_brain_jobs_priority_idx").on(table.priority),
  index("ai_brain_jobs_created_idx").on(table.createdAt),
  index("ai_brain_jobs_conversation_idx").on(table.conversationId),
  index("ai_brain_jobs_session_idx").on(table.sessionId),
]);

export const insertAiBrainJobSchema = createInsertSchema(aiBrainJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiBrainJob = z.infer<typeof insertAiBrainJobSchema>;
export type AiBrainJob = typeof aiBrainJobs.$inferSelect;

// AI Event Stream - Telemetry from all platform events for learning
export const aiEventStream = pgTable("ai_event_stream", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Event context (anonymized for cross-org learning)
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  eventType: varchar("event_type").notNull(), // e.g., 'error', 'resolution', 'feedback'
  feature: varchar("feature").notNull(), // e.g., 'timetracker', 'schedule', 'invoice'
  
  // Event data
  fingerprint: varchar("fingerprint").notNull(), // Anonymized hash for pattern matching
  payload: jsonb("payload").notNull(), // Anonymized event data
  outcome: varchar("outcome"), // 'success', 'failure', 'timeout', etc.
  
  // Learning signals
  userFeedback: varchar("user_feedback"), // 'helpful', 'not_helpful', 'resolved'
  resolutionTime: integer("resolution_time_seconds"),
  
  // Metadata
  clientInfo: jsonb("client_info"), // Browser, device info (anonymized)
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("ai_event_stream_workspace_idx").on(table.workspaceId),
  index("ai_event_stream_type_idx").on(table.eventType),
  index("ai_event_stream_fingerprint_idx").on(table.fingerprint),
  index("ai_event_stream_created_idx").on(table.createdAt),
]);

export const insertAiEventStreamSchema = createInsertSchema(aiEventStream).omit({
  id: true,
  createdAt: true,
});

export type InsertAiEventStream = z.infer<typeof insertAiEventStreamSchema>;
export type AiEventStream = typeof aiEventStream.$inferSelect;

// AI Global Patterns - Cross-organizational learnings (anonymized)
export const aiGlobalPatterns = pgTable("ai_global_patterns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Pattern identification
  patternType: varchar("pattern_type").notNull(), // e.g., 'scheduling_conflict', 'invoice_error'
  fingerprint: varchar("fingerprint").notNull().unique(), // Unique pattern identifier
  
  // Pattern data (anonymized)
  description: text("description").notNull(),
  occurrences: integer("occurrences").default(1), // How many times seen across all orgs
  affectedWorkspaces: integer("affected_workspaces").default(1), // K-anonymity count
  
  // Learning status
  validated: boolean("validated").default(false), // Human verified
  validatedBy: varchar("validated_by").references(() => users.id, { onDelete: 'set null' }),
  validatedAt: timestamp("validated_at"),
  
  // Solution linkage
  hasSolution: boolean("has_solution").default(false),
  
  // Metadata
  metadata: jsonb("metadata"), // Additional pattern details
  embedding: text("embedding"), // Vector embedding for similarity search
  
  firstSeenAt: timestamp("first_seen_at").defaultNow(),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("ai_global_patterns_type_idx").on(table.patternType),
  index("ai_global_patterns_validated_idx").on(table.validated),
  index("ai_global_patterns_has_solution_idx").on(table.hasSolution),
]);

export const insertAiGlobalPatternSchema = createInsertSchema(aiGlobalPatterns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  firstSeenAt: true,
  lastSeenAt: true,
});

export type InsertAiGlobalPattern = z.infer<typeof insertAiGlobalPatternSchema>;
export type AiGlobalPattern = typeof aiGlobalPatterns.$inferSelect;

// AI Solution Library - Validated fixes available to all organizations
export const aiSolutionLibrary = pgTable("ai_solution_library", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Linked pattern
  patternId: varchar("pattern_id").references(() => aiGlobalPatterns.id, { onDelete: 'cascade' }),
  
  // Solution details
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  solutionType: varchar("solution_type").notNull(), // 'automated', 'manual', 'hybrid'
  
  // Implementation
  automationScript: text("automation_script"), // Code/logic for automated fix
  manualSteps: jsonb("manual_steps"), // Step-by-step instructions
  
  // Effectiveness metrics
  successRate: doublePrecision("success_rate").default(0), // 0-1
  timesApplied: integer("times_applied").default(0),
  avgResolutionTime: integer("avg_resolution_time_seconds"),
  
  // Validation
  validated: boolean("validated").default(false),
  validatedBy: varchar("validated_by").references(() => users.id, { onDelete: 'set null' }),
  validatedAt: timestamp("validated_at"),
  
  // Status
  status: varchar("status").notNull().default('active'), // 'active', 'deprecated', 'experimental'
  
  // Rollout control
  rolloutPercentage: integer("rollout_percentage").default(0), // 0-100, gradual rollout
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("ai_solution_library_pattern_idx").on(table.patternId),
  index("ai_solution_library_status_idx").on(table.status),
  index("ai_solution_library_validated_idx").on(table.validated),
]);

export const insertAiSolutionLibrarySchema = createInsertSchema(aiSolutionLibrary).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiSolutionLibrary = z.infer<typeof insertAiSolutionLibrarySchema>;
export type AiSolutionLibrary = typeof aiSolutionLibrary.$inferSelect;

// AI Feedback Loops - Human validation and confidence scoring
export const aiFeedbackLoops = pgTable("ai_feedback_loops", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Context
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  jobId: varchar("job_id").references(() => aiBrainJobs.id, { onDelete: 'cascade' }),
  
  // Feedback
  rating: integer("rating"), // 1-5 stars
  sentiment: varchar("sentiment"), // 'positive', 'neutral', 'negative'
  feedback: text("feedback"),
  wasHelpful: boolean("was_helpful"),
  
  // Outcome tracking
  issueResolved: boolean("issue_resolved"),
  timeToResolution: integer("time_to_resolution_seconds"),
  
  // Human corrections
  aiSuggestion: jsonb("ai_suggestion"), // What AI recommended
  humanCorrection: jsonb("human_correction"), // What human actually did
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("ai_feedback_loops_workspace_idx").on(table.workspaceId),
  index("ai_feedback_loops_job_idx").on(table.jobId),
  index("ai_feedback_loops_helpful_idx").on(table.wasHelpful),
]);

export const insertAiFeedbackLoopSchema = createInsertSchema(aiFeedbackLoops).omit({
  id: true,
  createdAt: true,
});

export type InsertAiFeedbackLoop = z.infer<typeof insertAiFeedbackLoopSchema>;
export type AiFeedbackLoop = typeof aiFeedbackLoops.$inferSelect;

// AI Skill Registry - Registered AI skills/modules
export const aiSkillRegistry = pgTable("ai_skill_registry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Skill identification
  skillKey: varchar("skill_key").notNull().unique(), // e.g., 'scheduleos_generation'
  name: varchar("name").notNull(),
  description: text("description").notNull(),
  
  // Configuration
  enabled: boolean("enabled").default(true),
  requiresApproval: boolean("requires_approval").default(false),
  confidenceThreshold: doublePrecision("confidence_threshold").default(0.95),
  
  // Resource limits
  maxConcurrentJobs: integer("max_concurrent_jobs").default(5),
  timeoutSeconds: integer("timeout_seconds").default(300),
  maxRetries: integer("max_retries").default(3),
  
  // Cost management
  estimatedCostPer1kTokens: decimal("estimated_cost_per_1k_tokens", { precision: 10, scale: 4 }),
  
  // Metrics
  totalExecutions: integer("total_executions").default(0),
  successfulExecutions: integer("successful_executions").default(0),
  failedExecutions: integer("failed_executions").default(0),
  avgExecutionTimeMs: integer("avg_execution_time_ms"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("ai_skill_registry_enabled_idx").on(table.enabled),
]);

export const insertAiSkillRegistrySchema = createInsertSchema(aiSkillRegistry).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiSkillRegistry = z.infer<typeof insertAiSkillRegistrySchema>;
export type AiSkillRegistry = typeof aiSkillRegistry.$inferSelect;

// AI Dashboard Snapshots - Pre-computed metrics for fast dashboard loading
export const aiDashboardSnapshots = pgTable("ai_dashboard_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Scope
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  snapshotType: varchar("snapshot_type").notNull(), // 'global', 'workspace', 'daily'
  snapshotDate: timestamp("snapshot_date").notNull(),
  
  // Metrics
  metrics: jsonb("metrics").notNull(), // Pre-computed dashboard data
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("ai_dashboard_snapshots_workspace_idx").on(table.workspaceId),
  index("ai_dashboard_snapshots_type_idx").on(table.snapshotType),
  index("ai_dashboard_snapshots_date_idx").on(table.snapshotDate),
]);

export const insertAiDashboardSnapshotSchema = createInsertSchema(aiDashboardSnapshots).omit({
  id: true,
  createdAt: true,
});

export type InsertAiDashboardSnapshot = z.infer<typeof insertAiDashboardSnapshotSchema>;
export type AiDashboardSnapshot = typeof aiDashboardSnapshots.$inferSelect;

// AI Context - Feature-specific context storage for monitoring
export const aiContext = pgTable("ai_context", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  scope: monitoringScopeEnum("scope").notNull().default("workspace"),
  monitoringType: monitoringTypeEnum("monitoring_type").notNull(),
  contextKey: varchar("context_key").notNull(),
  entityType: varchar("entity_type").notNull(),
  entityId: varchar("entity_id").notNull().default(''),
  contextData: jsonb("context_data").notNull().default("{}"),
  metadata: jsonb("metadata").default("{}"),
  refreshIntervalMinutes: integer("refresh_interval_minutes").notNull().default(1440),
  lastRefreshedAt: timestamp("last_refreshed_at").defaultNow(),
  nextRefreshAt: timestamp("next_refresh_at"),
  staleAfter: timestamp("stale_after"),
  version: integer("version").notNull().default(1),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("ai_context_unique_idx").on(
    sql`COALESCE(${table.workspaceId}, '')`,
    table.scope,
    table.monitoringType,
    table.contextKey,
    table.entityType,
    table.entityId,
  ),
  index("ai_context_workspace_idx").on(table.workspaceId, table.scope),
  index("ai_context_refresh_idx").on(table.nextRefreshAt),
]);

export const insertAiContextSchema = createInsertSchema(aiContext).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiContext = z.infer<typeof insertAiContextSchema>;
export type AiContext = typeof aiContext.$inferSelect;

// AI Monitoring Tasks - Scheduled monitoring jobs
export const aiMonitoringTasks = pgTable("ai_monitoring_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  scope: monitoringScopeEnum("scope").notNull().default("workspace"),
  monitoringType: monitoringTypeEnum("monitoring_type").notNull(),
  status: monitoringStatusEnum("status").notNull().default("active"),
  contextId: varchar("context_id").references(() => aiContext.id, { onDelete: "set null" }),
  targetEntityType: varchar("target_entity_type").notNull(),
  targetEntityId: varchar("target_entity_id").notNull().default(''),
  configuration: jsonb("configuration").notNull().default("{}"),
  runIntervalMinutes: integer("run_interval_minutes").notNull().default(1440),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  lastRunStatus: monitoringStatusEnum("last_run_status"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  failureReason: text("failure_reason"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("ai_monitoring_tasks_unique_idx").on(
    sql`COALESCE(${table.workspaceId}, '')`,
    table.monitoringType,
    table.targetEntityType,
    table.targetEntityId,
  ),
  index("ai_monitoring_tasks_workspace_idx").on(table.workspaceId, table.status),
  index("ai_monitoring_tasks_next_run_idx").on(table.nextRunAt),
]);

export const insertAiMonitoringTaskSchema = createInsertSchema(aiMonitoringTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiMonitoringTask = z.infer<typeof insertAiMonitoringTaskSchema>;
export type AiMonitoringTask = typeof aiMonitoringTasks.$inferSelect;

// AI Proactive Alerts - Generated alerts with lifecycle management
export const aiProactiveAlerts = pgTable("ai_proactive_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  taskId: varchar("task_id").references(() => aiMonitoringTasks.id, { onDelete: "set null" }),
  alertType: alertTypeEnum("alert_type").notNull(),
  severity: alertSeverityEnum("severity").notNull().default("medium"),
  status: alertStatusEnum("status").notNull().default("queued"),
  dedupeHash: varchar("dedupe_hash"),
  payload: jsonb("payload").notNull().default("{}"),
  contextSnapshot: jsonb("context_snapshot").default("{}"),
  triggeredAt: timestamp("triggered_at").defaultNow(),
  acknowledgedBy: varchar("acknowledged_by").references(() => users.id, { onDelete: "set null" }),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedBy: varchar("resolved_by").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  resolutionNote: text("resolution_note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("ai_proactive_alerts_dedupe_idx").on(table.workspaceId, table.alertType, table.dedupeHash),
  index("ai_proactive_alerts_workspace_idx").on(table.workspaceId, table.status),
  index("ai_proactive_alerts_task_idx").on(table.taskId),
]);

export const insertAiProactiveAlertSchema = createInsertSchema(aiProactiveAlerts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiProactiveAlert = z.infer<typeof insertAiProactiveAlertSchema>;
export type AiProactiveAlert = typeof aiProactiveAlerts.$inferSelect;

// AI Notification History - Alert delivery tracking
export const aiNotificationHistory = pgTable("ai_notification_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alertId: varchar("alert_id").notNull().references(() => aiProactiveAlerts.id, { onDelete: "cascade" }),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  recipientUserId: varchar("recipient_user_id").references(() => users.id, { onDelete: "set null" }),
  channel: alertChannelEnum("channel").notNull(),
  status: notificationDeliveryStatusEnum("status").notNull().default("pending"),
  payload: jsonb("payload").notNull().default("{}"),
  metadata: jsonb("metadata").default("{}"),
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("ai_notification_history_alert_idx").on(table.alertId, table.status),
  index("ai_notification_history_workspace_idx").on(table.workspaceId),
]);

export const insertAiNotificationHistorySchema = createInsertSchema(aiNotificationHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertAiNotificationHistory = z.infer<typeof insertAiNotificationHistorySchema>;
export type AiNotificationHistory = typeof aiNotificationHistory.$inferSelect;

// ============================================================================
// DATA INTEGRITY - Event Sourcing & ID Management
// ============================================================================

// Actor Type Enum - Track WHO performed the action
export const actorTypeEnum = pgEnum('actor_type', [
  'END_USER',         // Regular workspace user
  'SUPPORT_STAFF',    // Support team member (root_admin, deputy_admin, support_manager)
  'AI_AGENT',         // Gemini AI Brain or autonomous system
  'SYSTEM',           // System-initiated action (cron job, webhook, etc.)
]);

// Event Sourcing Status
export const eventStatusEnum = pgEnum('event_status', [
  'pending',    // Event logged, not yet committed
  'prepared',   // Event prepared for processing (for schedule events)
  'committed',  // Event successfully committed to database
  'failed',     // Event failed to commit
  'rolled_back' // Event was rolled back
]);

// Audit Events - Immutable Event Sourcing (never deleted, never modified)
export const auditEvents = pgTable("audit_events", {
  // Event identity
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: varchar("event_type").notNull(), // USER_CREATED, ORG_UPDATED, SUPPORT_ACTION, AI_ACTION, etc.
  
  // Actor information
  actorId: varchar("actor_id").notNull(), // User ID, AI agent ID, or 'system'
  actorType: actorTypeEnum("actor_type").notNull(),
  actorName: varchar("actor_name"), // Cached for historical accuracy
  
  // Workspace context
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Entity being modified
  aggregateId: varchar("aggregate_id").notNull(), // ID of entity being modified
  aggregateType: varchar("aggregate_type").notNull(), // USER, ORG, TASK, EMPLOYEE, etc.
  
  // Event payload
  payload: jsonb("payload").notNull().default("{}"), // Full action details
  changes: jsonb("changes"), // { before: {...}, after: {...} }
  
  // Verification & integrity
  actionHash: varchar("action_hash"), // SHA-256 hash for AI action verification
  verifiedAt: timestamp("verified_at"),
  
  // Status tracking
  status: eventStatusEnum("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  
  // Request metadata
  metadata: jsonb("metadata").default("{}"), // IP, user agent, session ID, etc.
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  sessionId: varchar("session_id"),
  requestId: varchar("request_id"),
  
  // Immutable timestamp
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => [
  index("idx_audit_events_actor").on(table.actorId, table.timestamp),
  index("idx_audit_events_workspace").on(table.workspaceId, table.timestamp),
  index("idx_audit_events_aggregate").on(table.aggregateType, table.aggregateId),
  index("idx_audit_events_type").on(table.eventType, table.timestamp),
  index("idx_audit_events_status").on(table.status, table.timestamp),
  index("idx_audit_events_hash").on(table.actionHash),
  // Composite indexes for high-volume queries
  index("idx_audit_events_workspace_created").on(table.workspaceId, table.timestamp),
  index("idx_audit_events_aggregate_created").on(table.aggregateId, table.timestamp),
]);

export const insertAuditEventSchema = createInsertSchema(auditEvents).omit({
  id: true,
  timestamp: true,
});

export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;
export type AuditEvent = typeof auditEvents.$inferSelect;

// ID Registry - Prevent ID reuse forever (NEVER delete records)
export const idRegistry = pgTable("id_registry", {
  id: varchar("id").primaryKey(), // The ID that was issued (NOT auto-generated)
  entityType: varchar("entity_type").notNull(), // USER, ORG, EMPLOYEE, CLIENT, etc.
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Issuing context
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
  issuedBy: varchar("issued_by"), // Actor who caused this ID to be created
  issuedByType: actorTypeEnum("issued_by_type"),
  
  // Immutability flag
  neverReuse: boolean("never_reuse").notNull().default(true),
  
  // Soft delete tracking (entity may be deleted but ID is NEVER reused)
  entityDeletedAt: timestamp("entity_deleted_at"),
  
  // Metadata
  metadata: jsonb("metadata").default("{}"),
}, (table) => [
  uniqueIndex("idx_id_registry_unique").on(table.id),
  index("idx_id_registry_entity_type").on(table.entityType, table.issuedAt),
  index("idx_id_registry_workspace").on(table.workspaceId, table.issuedAt),
]);

export const insertIdRegistrySchema = createInsertSchema(idRegistry).omit({
  issuedAt: true,
});

export type InsertIdRegistry = z.infer<typeof insertIdRegistrySchema>;
export type IdRegistry = typeof idRegistry.$inferSelect;

// Write-Ahead Log - Transaction safety pattern
export const writeAheadLog = pgTable("write_ahead_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Transaction context
  transactionId: varchar("transaction_id").notNull().unique(),
  operationType: varchar("operation_type").notNull(), // CREATE, UPDATE, DELETE, etc.
  
  // Entity being modified
  entityType: varchar("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  
  // Actor
  actorId: varchar("actor_id").notNull(),
  actorType: actorTypeEnum("actor_type").notNull(),
  
  // Workspace context
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Operation payload
  payload: jsonb("payload").notNull().default("{}"),
  
  // Status tracking
  status: eventStatusEnum("status").notNull().default("pending"),
  
  // Phase tracking (Two-Phase Commit)
  preparedAt: timestamp("prepared_at"),
  committedAt: timestamp("committed_at"),
  rolledBackAt: timestamp("rolled_back_at"),
  
  // Error tracking
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_wal_transaction_unique").on(table.transactionId),
  index("idx_wal_status").on(table.status, table.createdAt),
  index("idx_wal_entity").on(table.entityType, table.entityId),
  index("idx_wal_workspace").on(table.workspaceId, table.createdAt),
  index("idx_wal_actor").on(table.actorId, table.createdAt),
]);

export const insertWriteAheadLogSchema = createInsertSchema(writeAheadLog).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWriteAheadLog = z.infer<typeof insertWriteAheadLogSchema>;
export type WriteAheadLog = typeof writeAheadLog.$inferSelect;

// ============================================================================
// AUTOMATION CREDIT SYSTEM
// ============================================================================

// Credit transaction types
export const creditTransactionTypeEnum = pgEnum('credit_transaction_type', [
  'monthly_allocation',  // Monthly tier-based credit refill
  'purchase',           // User purchased credit pack
  'deduction',          // AI automation consumed credits
  'refund',             // Credit refund (e.g., failed automation)
  'bonus',              // Promotional credits
  'adjustment',         // Admin manual adjustment
  'expiration'          // Credits expired
]);

// Workspace Credits - Current balance and monthly allocation
export const workspaceCredits = pgTable("workspace_credits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }).unique(),
  
  // Current balance
  currentBalance: integer("current_balance").notNull().default(0), // Available credits
  
  // Monthly allocation based on subscription tier
  monthlyAllocation: integer("monthly_allocation").notNull().default(100), // Free: 100, Starter: 500, Pro: 2000, Enterprise: 10000
  
  // Lifecycle tracking
  lastResetAt: timestamp("last_reset_at").defaultNow(), // Last monthly reset
  nextResetAt: timestamp("next_reset_at"), // Next scheduled reset
  
  // Usage tracking
  totalCreditsEarned: integer("total_credits_earned").notNull().default(0), // Lifetime credits received
  totalCreditsSpent: integer("total_credits_spent").notNull().default(0), // Lifetime credits consumed
  totalCreditsPurchased: integer("total_credits_purchased").notNull().default(0), // Lifetime purchased
  
  // Rollover settings (Enterprise only)
  rolloverEnabled: boolean("rollover_enabled").default(false),
  rolloverBalance: integer("rollover_balance").default(0), // Unused credits from previous month
  maxRolloverCredits: integer("max_rollover_credits").default(0), // Maximum rollover allowed
  
  // Status
  isActive: boolean("is_active").default(true),
  isSuspended: boolean("is_suspended").default(false), // Suspend credit usage
  suspendedReason: text("suspended_reason"),
  suspendedAt: timestamp("suspended_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("workspace_credits_workspace_idx").on(table.workspaceId),
  index("workspace_credits_next_reset_idx").on(table.nextResetAt),
]);

export const insertWorkspaceCreditsSchema = createInsertSchema(workspaceCredits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWorkspaceCredits = z.infer<typeof insertWorkspaceCreditsSchema>;
export type WorkspaceCredits = typeof workspaceCredits.$inferSelect;

// Credit Transactions - Log every credit addition/deduction
export const creditTransactions = pgTable("credit_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id), // User who triggered transaction
  
  // Transaction type and amount
  transactionType: creditTransactionTypeEnum("transaction_type").notNull(),
  amount: integer("amount").notNull(), // Positive for additions, negative for deductions
  balanceAfter: integer("balance_after").notNull(), // Balance after this transaction
  
  // Feature context (for deductions)
  featureKey: varchar("feature_key"), // e.g., 'ai_scheduling', 'ai_invoicing', 'ai_payroll'
  featureName: varchar("feature_name"), // Human-readable name
  
  // Purchase context (for purchases)
  creditPackId: varchar("credit_pack_id"), // Reference to purchased pack
  stripePaymentIntentId: varchar("stripe_payment_intent_id"), // Stripe payment ID
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }), // Amount paid in USD
  
  // Automation context (for deductions)
  aiUsageEventId: varchar("ai_usage_event_id").references(() => aiUsageEvents.id), // Link to AI usage event
  relatedEntityType: varchar("related_entity_type"), // 'schedule', 'invoice', 'payroll', etc.
  relatedEntityId: varchar("related_entity_id"), // ID of schedule/invoice/etc.
  
  // Metadata
  description: text("description"), // Human-readable description
  metadata: jsonb("metadata").default("{}"), // Additional context
  
  // Audit
  actorType: actorTypeEnum("actor_type"), // Who performed this transaction
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("credit_transactions_workspace_idx").on(table.workspaceId, table.createdAt),
  index("credit_transactions_type_idx").on(table.transactionType),
  index("credit_transactions_feature_idx").on(table.featureKey),
  index("credit_transactions_user_idx").on(table.userId),
]);

export const insertCreditTransactionSchema = createInsertSchema(creditTransactions).omit({
  id: true,
  createdAt: true,
});

export type InsertCreditTransaction = z.infer<typeof insertCreditTransactionSchema>;
export type CreditTransaction = typeof creditTransactions.$inferSelect;

// Credit Packs - Purchasable credit bundles
export const creditPacks = pgTable("credit_packs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Pack details
  name: varchar("name").notNull(), // e.g., "Starter Pack", "Power User Pack"
  description: text("description"),
  creditsAmount: integer("credits_amount").notNull(), // Number of credits in pack
  
  // Pricing
  priceUsd: decimal("price_usd", { precision: 10, scale: 2 }).notNull(), // Price in USD
  stripePriceId: varchar("stripe_price_id"), // Stripe Price ID
  stripeProductId: varchar("stripe_product_id"), // Stripe Product ID
  
  // Bonus credits (promotional)
  bonusCredits: integer("bonus_credits").default(0), // Extra credits included
  
  // Availability
  isActive: boolean("is_active").default(true),
  isPopular: boolean("is_popular").default(false), // Featured pack
  displayOrder: integer("display_order").default(0), // Sort order in UI
  
  // Tier restrictions
  availableForTiers: text("available_for_tiers").array().default(sql`ARRAY['free', 'starter', 'professional', 'enterprise']::text[]`), // Which tiers can buy this
  
  // Metadata
  metadata: jsonb("metadata").default("{}"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("credit_packs_active_idx").on(table.isActive, table.displayOrder),
]);

export const insertCreditPackSchema = createInsertSchema(creditPacks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCreditPack = z.infer<typeof insertCreditPackSchema>;
export type CreditPack = typeof creditPacks.$inferSelect;

// Checkpoint status enum
export const checkpointStatusEnum = pgEnum('checkpoint_status', [
  'paused',     // Automation paused due to insufficient credits
  'resumed',    // Automation resumed after credit purchase
  'expired',    // Checkpoint expired (24h limit)
  'cancelled'   // User cancelled the checkpoint
]);

// AI Brain Checkpoints - Save automation state when credits exhausted
export const aiCheckpoints = pgTable("ai_checkpoints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id), // User who triggered automation
  
  // Automation context
  featureKey: varchar("feature_key").notNull(), // 'ai_scheduling', 'ai_invoicing', 'ai_payroll'
  featureName: varchar("feature_name").notNull(), // Human-readable name
  
  // Checkpoint state
  status: checkpointStatusEnum("status").notNull().default("paused"),
  creditsRequired: integer("credits_required").notNull(), // Credits needed to resume
  creditsAtPause: integer("credits_at_pause").notNull(), // Balance when paused
  
  // Progress tracking
  progressPercentage: integer("progress_percentage").default(0), // 0-100% completion
  completedSteps: text("completed_steps").array().default(sql`ARRAY[]::text[]`), // Completed operations
  
  // Automation state (serialized for resume)
  stateSnapshot: jsonb("state_snapshot").notNull(), // Full state for resumption
  partialResults: jsonb("partial_results").default("{}"), // What was completed
  resumeParameters: jsonb("resume_parameters").notNull(), // Parameters to resume
  
  // User notification
  userNotified: boolean("user_notified").default(false),
  notifiedAt: timestamp("notified_at"),
  
  // Lifecycle
  pausedAt: timestamp("paused_at").defaultNow(),
  resumedAt: timestamp("resumed_at"),
  expiresAt: timestamp("expires_at").notNull(), // Auto-expire after 24h
  
  // Audit
  errorMessage: text("error_message"), // Error that triggered pause
  metadata: jsonb("metadata").default("{}"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("ai_checkpoints_workspace_idx").on(table.workspaceId, table.status),
  index("ai_checkpoints_user_idx").on(table.userId),
  index("ai_checkpoints_feature_idx").on(table.featureKey),
  index("ai_checkpoints_expires_idx").on(table.expiresAt),
]);

export const insertAiCheckpointSchema = createInsertSchema(aiCheckpoints).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiCheckpoint = z.infer<typeof insertAiCheckpointSchema>;


// SALES & ORG INVITATIONS
export const orgInvitations = pgTable("org_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull(),
  organizationName: varchar("organization_name").notNull(),
  contactName: varchar("contact_name"),
  status: varchar("status").default("pending"),
  invitationToken: varchar("invitation_token").unique(),
  invitationTokenExpiry: timestamp("invitation_token_expiry"),
  acceptedWorkspaceId: varchar("accepted_workspace_id").references(() => workspaces.id, { onDelete: 'set null' }),
  acceptedAt: timestamp("accepted_at"),
  acceptedBy: varchar("accepted_by").references(() => users.id, { onDelete: 'set null' }),
  sentBy: varchar("sent_by").references(() => users.id, { onDelete: 'set null' }),
  sentAt: timestamp("sent_at").defaultNow(),
  onboardingProgress: integer("onboarding_progress").default(0),
  completedSteps: text("completed_steps").array().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("org_invitations_email_idx").on(table.email),
  index("org_invitations_status_idx").on(table.status),
]);
export const insertOrgInvitationSchema = createInsertSchema(orgInvitations).omit({ id: true, createdAt: true, updatedAt: true, invitationToken: true });
export type InsertOrgInvitation = z.infer<typeof insertOrgInvitationSchema>;
export type OrgInvitation = typeof orgInvitations.$inferSelect;

export const salesProposals = pgTable("sales_proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title").notNull(),
  description: text("description"),
  prospectEmail: varchar("prospect_email").notNull(),
  prospectName: varchar("prospect_name"),
  proposalType: varchar("proposal_type").default("trial"),
  suggestedTier: varchar("suggested_tier").default("starter"),
  estimatedValue: decimal("estimated_value", { precision: 10, scale: 2 }),
  status: varchar("status").default("draft"),
  sentAt: timestamp("sent_at"),
  createdBy: varchar("created_by").notNull().references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("sales_proposals_email_idx").on(table.prospectEmail),
  index("sales_proposals_status_idx").on(table.status),
]);
export const insertSalesProposalSchema = createInsertSchema(salesProposals).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSalesProposal = z.infer<typeof insertSalesProposalSchema>;
export type SalesProposal = typeof salesProposals.$inferSelect;

export const salesActivities = pgTable("sales_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activityType: varchar("activity_type").notNull(),
  prospectEmail: varchar("prospect_email"),
  proposalId: varchar("proposal_id").references(() => salesProposals.id, { onDelete: 'set null' }),
  invitationId: varchar("invitation_id").references(() => orgInvitations.id, { onDelete: 'set null' }),
  title: varchar("title").notNull(),
  createdBy: varchar("created_by").notNull().references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("sales_activities_email_idx").on(table.prospectEmail),
  index("sales_activities_type_idx").on(table.activityType),
]);
export const insertSalesActivitySchema = createInsertSchema(salesActivities).omit({ id: true, createdAt: true });
export type InsertSalesActivity = z.infer<typeof insertSalesActivitySchema>;
export type SalesActivity = typeof salesActivities.$inferSelect;

// ============================================================================
// EMAIL EVENTS AUDIT TABLE
// ============================================================================

export const emailEvents = pgTable("email_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id),
  emailType: varchar("email_type").notNull(), // 'verification', 'password_reset', 'support_ticket', 'report_delivery', etc.
  recipientEmail: varchar("recipient_email").notNull(),
  status: varchar("status").notNull(), // 'pending', 'sent', 'failed', 'bounced'
  resendId: varchar("resend_id"), // Resend message ID for tracking
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("email_events_workspace_idx").on(table.workspaceId),
  index("email_events_user_idx").on(table.userId),
  index("email_events_type_idx").on(table.emailType),
  index("email_events_status_idx").on(table.status),
  index("email_events_created_idx").on(table.createdAt),
]);

export const insertEmailEventSchema = createInsertSchema(emailEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertEmailEvent = z.infer<typeof insertEmailEventSchema>;
export type EmailEvent = typeof emailEvents.$inferSelect;

// ============================================================================
// INTERNAL EMAIL SYSTEM - Virtual Mailboxes & Messages
// ============================================================================

// Enum for email folder types
export const emailFolderTypeEnum = pgEnum("email_folder_type", [
  "inbox", "sent", "drafts", "trash", "archive", "spam", "starred", "custom"
]);

// Enum for email priority
export const emailPriorityEnum = pgEnum("email_priority", [
  "low", "normal", "high", "urgent"
]);

// Enum for email status
export const internalEmailStatusEnum = pgEnum("internal_email_status", [
  "draft", "sent", "delivered", "read", "archived", "deleted"
]);

// Internal Mailboxes - Virtual email addresses for each user
export const internalMailboxes = pgTable("internal_mailboxes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Virtual email address (e.g., john.doe@coaileague.internal)
  emailAddress: varchar("email_address").notNull().unique(),
  displayName: varchar("display_name"), // "John Doe" or "Support Team"
  
  // Mailbox type
  mailboxType: varchar("mailbox_type").notNull().default('personal'), // personal, shared, system, department
  
  // Settings
  autoReply: boolean("auto_reply").default(false),
  autoReplyMessage: text("auto_reply_message"),
  signature: text("signature"),
  
  // Statistics
  unreadCount: integer("unread_count").default(0),
  totalMessages: integer("total_messages").default(0),
  
  // Status
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("internal_mailboxes_user_idx").on(table.userId),
  index("internal_mailboxes_workspace_idx").on(table.workspaceId),
  index("internal_mailboxes_email_idx").on(table.emailAddress),
]);

export const insertInternalMailboxSchema = createInsertSchema(internalMailboxes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  unreadCount: true,
  totalMessages: true,
});

export type InsertInternalMailbox = z.infer<typeof insertInternalMailboxSchema>;
export type InternalMailbox = typeof internalMailboxes.$inferSelect;

// Email Folders - Custom folders for organizing emails
export const internalEmailFolders = pgTable("internal_email_folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mailboxId: varchar("mailbox_id").notNull().references(() => internalMailboxes.id, { onDelete: 'cascade' }),
  
  name: varchar("name").notNull(),
  folderType: emailFolderTypeEnum("folder_type").notNull().default('custom'),
  color: varchar("color"), // Hex color for UI
  icon: varchar("icon"), // Icon name for UI
  
  // Hierarchy
  parentFolderId: varchar("parent_folder_id"),
  sortOrder: integer("sort_order").default(0),
  
  // Statistics
  messageCount: integer("message_count").default(0),
  unreadCount: integer("unread_count").default(0),
  
  isSystem: boolean("is_system").default(false), // System folders can't be deleted
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("internal_email_folders_mailbox_idx").on(table.mailboxId),
  index("internal_email_folders_type_idx").on(table.folderType),
]);

export const insertInternalEmailFolderSchema = createInsertSchema(internalEmailFolders).omit({
  id: true,
  createdAt: true,
  messageCount: true,
  unreadCount: true,
});

export type InsertInternalEmailFolder = z.infer<typeof insertInternalEmailFolderSchema>;
export type InternalEmailFolder = typeof internalEmailFolders.$inferSelect;

// Internal Emails - The actual email messages
export const internalEmails = pgTable("internal_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Sender
  fromMailboxId: varchar("from_mailbox_id").references(() => internalMailboxes.id, { onDelete: 'set null' }),
  fromAddress: varchar("from_address").notNull(), // Can be internal or external
  fromName: varchar("from_name"),
  
  // Recipients (stored as JSON arrays for multiple recipients)
  toAddresses: text("to_addresses").notNull(), // JSON array of email addresses
  ccAddresses: text("cc_addresses"), // JSON array
  bccAddresses: text("bcc_addresses"), // JSON array
  
  // Email content
  subject: varchar("subject", { length: 500 }),
  bodyText: text("body_text"), // Plain text version
  bodyHtml: text("body_html"), // HTML version
  
  // Threading
  threadId: varchar("thread_id"), // For conversation threading
  inReplyTo: varchar("in_reply_to"), // Reference to parent email ID
  
  // Metadata
  priority: emailPriorityEnum("priority").default('normal'),
  isInternal: boolean("is_internal").default(true), // true = internal, false = external via Resend
  
  // External email tracking (when sent via Resend)
  externalId: varchar("external_id"), // Resend message ID
  externalStatus: varchar("external_status"), // Resend delivery status
  
  // Attachments (stored as JSON array of file references)
  attachments: text("attachments"), // JSON array of {fileName, fileUrl, fileSize, mimeType}
  
  // Timestamps
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("internal_emails_from_idx").on(table.fromMailboxId),
  index("internal_emails_thread_idx").on(table.threadId),
  index("internal_emails_sent_idx").on(table.sentAt),
  index("internal_emails_created_idx").on(table.createdAt),
  foreignKey({
    columns: [table.inReplyTo],
    foreignColumns: [table.id],
    name: "internal_emails_reply_fk",
  }).onDelete('set null'),
]);

export const insertInternalEmailSchema = createInsertSchema(internalEmails).omit({
  id: true,
  createdAt: true,
});

export type InsertInternalEmail = z.infer<typeof insertInternalEmailSchema>;
export type InternalEmail = typeof internalEmails.$inferSelect;

// Email Recipients - Junction table for mailbox-email relationship with read status
export const internalEmailRecipients = pgTable("internal_email_recipients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  emailId: varchar("email_id").notNull().references(() => internalEmails.id, { onDelete: 'cascade' }),
  mailboxId: varchar("mailbox_id").notNull().references(() => internalMailboxes.id, { onDelete: 'cascade' }),
  
  // Recipient type
  recipientType: varchar("recipient_type").notNull().default('to'), // to, cc, bcc
  
  // Folder location
  folderId: varchar("folder_id").references(() => internalEmailFolders.id, { onDelete: 'set null' }),
  
  // Status
  status: internalEmailStatusEnum("status").notNull().default('delivered'),
  isRead: boolean("is_read").default(false),
  isStarred: boolean("is_starred").default(false),
  isImportant: boolean("is_important").default(false),
  
  // Timestamps
  readAt: timestamp("read_at"),
  archivedAt: timestamp("archived_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("internal_email_recipients_email_idx").on(table.emailId),
  index("internal_email_recipients_mailbox_idx").on(table.mailboxId),
  index("internal_email_recipients_folder_idx").on(table.folderId),
  index("internal_email_recipients_status_idx").on(table.status),
  index("internal_email_recipients_unread_idx").on(table.isRead),
]);

export const insertInternalEmailRecipientSchema = createInsertSchema(internalEmailRecipients).omit({
  id: true,
  createdAt: true,
});

export type InsertInternalEmailRecipient = z.infer<typeof insertInternalEmailRecipientSchema>;
export type InternalEmailRecipient = typeof internalEmailRecipients.$inferSelect;

// ============================================================================
// SUPPORT TICKET ESCALATION TRACKING (NEW - Tier 1 Critical Fix #5)
// ============================================================================

export const supportTicketEscalations = pgTable(
  "support_tickets_escalation",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    supportTicketId: varchar("support_ticket_id").notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
    workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

    // Escalation details
    escalationLevel: integer("escalation_level").default(1), // 1-3 (tier 1, tier 2, tier 3)
    escalationReason: text("escalation_reason").notNull(),
    escalationNotes: text("escalation_notes"),

    // Assignment
    escalatedTo: varchar("escalated_to").references(() => users.id, { onDelete: 'set null' }),
    escalatedBy: varchar("escalated_by").references(() => users.id, { onDelete: 'set null' }),

    // Status
    status: varchar("status").notNull().default('open'), // 'open', 'in_progress', 'resolved', 'closed'
    resolvedAt: timestamp("resolved_at"),
    resolutionNotes: text("resolution_notes"),

    // Timing
    escalatedAt: timestamp("escalated_at").defaultNow(),
    targetResolutionTime: timestamp("target_resolution_time"), // SLA compliance
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("support_ticket_escalation_ticket_idx").on(table.supportTicketId),
    index("support_ticket_escalation_workspace_idx").on(table.workspaceId),
    index("support_ticket_escalation_status_idx").on(table.status),
    index("support_ticket_escalation_level_idx").on(table.escalationLevel),
  ]
);

export const insertSupportTicketEscalationSchema = createInsertSchema(supportTicketEscalations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSupportTicketEscalation = z.infer<typeof insertSupportTicketEscalationSchema>;
export type SupportTicketEscalation = typeof supportTicketEscalations.$inferSelect;

// ============================================================================
// SUPPORT TICKET HISTORY AUDIT TRAIL (NEW - Tier 1 Critical Fix #5)
// ============================================================================

export const supportTicketHistory = pgTable(
  "support_ticket_history",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    supportTicketId: varchar("support_ticket_id").notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
    workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

    // Change tracking
    changeType: varchar("change_type").notNull(), // 'status_change', 'assignment_change', 'note_added', 'priority_change', 'category_change'
    previousValue: text("previous_value"),
    newValue: text("new_value"),
    changeDescription: text("change_description"),

    // Actor
    changedBy: varchar("changed_by").references(() => users.id, { onDelete: 'set null' }),
    changedByName: varchar("changed_by_name"),
    changedByRole: varchar("changed_by_role"), // 'customer', 'admin', 'support', 'system'

    // Context
    changeReason: text("change_reason"),
    metadata: jsonb("metadata"), // Additional context

    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("support_ticket_history_ticket_idx").on(table.supportTicketId),
    index("support_ticket_history_workspace_idx").on(table.workspaceId),
    index("support_ticket_history_type_idx").on(table.changeType),
    index("support_ticket_history_created_idx").on(table.createdAt),
  ]
);

export const insertSupportTicketHistorySchema = createInsertSchema(supportTicketHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertSupportTicketHistory = z.infer<typeof insertSupportTicketHistorySchema>;
export type SupportTicketHistory = typeof supportTicketHistory.$inferSelect;

// ============================================================================
// INVOICE ADJUSTMENTS TABLE (NEW - Tier 1 Critical Fix #2)
// ============================================================================

export const invoiceAdjustments = pgTable(
  "invoice_adjustments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    invoiceId: varchar("invoice_id").notNull().references(() => invoices.id, { onDelete: 'cascade' }),
    workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

    // Adjustment details
    adjustmentType: varchar("adjustment_type").notNull(), // 'credit', 'discount', 'correction', 'overage_waiver', 'proration'
    description: text("description").notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),

    // Reasoning
    reason: text("reason"),
    supportTicketId: varchar("support_ticket_id").references(() => supportTickets.id),

    // Authorization
    createdBy: varchar("created_by").notNull().references(() => users.id, { onDelete: 'set null' }),
    approvedBy: varchar("approved_by").references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp("approved_at"),
    status: varchar("status").notNull().default('pending'), // 'pending', 'approved', 'applied', 'rejected'

    // Metadata
    metadata: jsonb("metadata"),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("invoice_adjustments_invoice_idx").on(table.invoiceId),
    index("invoice_adjustments_workspace_idx").on(table.workspaceId),
    index("invoice_adjustments_type_idx").on(table.adjustmentType),
    index("invoice_adjustments_status_idx").on(table.status),
  ]
);

export const insertInvoiceAdjustmentSchema = createInsertSchema(invoiceAdjustments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInvoiceAdjustment = z.infer<typeof insertInvoiceAdjustmentSchema>;
export type InvoiceAdjustment = typeof invoiceAdjustments.$inferSelect;

// ============================================================================
// PASSWORD RESET AUDIT LOG TABLE (Compliance & Security)
// ============================================================================

export const passwordResetAuditLog = pgTable(
  "password_reset_audit_log",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    requestedBy: varchar("requested_by").notNull(), // Staff user ID who triggered reset
    requestedByWorkspaceId: varchar("requested_by_workspace_id"), // Staff workspace context
    targetUserId: varchar("target_user_id"), // User whose password is being reset (null if user not found)
    targetEmail: varchar("target_email").notNull(), // Email address used for reset
    targetWorkspaceId: varchar("target_workspace_id"), // Target user's workspace (null if user not found)
    success: boolean("success").notNull(), // Whether reset was successful
    outcomeCode: varchar("outcome_code").notNull(), // 'sent', 'not_found', 'rate_limited', 'email_failed', 'error'
    reason: text("reason"), // Success/failure reason
    ipAddress: varchar("ip_address"), // IP address of requester
    userAgent: varchar("user_agent"), // User agent of requester
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("password_reset_audit_requested_by_idx").on(table.requestedBy),
    index("password_reset_audit_target_idx").on(table.targetUserId),
    index("password_reset_audit_email_idx").on(table.targetEmail),
    index("password_reset_audit_created_at_idx").on(table.createdAt),
  ]
);

export const insertPasswordResetAuditLogSchema = createInsertSchema(passwordResetAuditLog).omit({
  id: true,
  createdAt: true,
});

export type InsertPasswordResetAuditLog = z.infer<typeof insertPasswordResetAuditLogSchema>;
export type PasswordResetAuditLog = typeof passwordResetAuditLog.$inferSelect;

// ============================================================================
// SENTIMENT ANALYSIS HISTORY (Gap #2 - Persist sentiment for trend analysis)
// ============================================================================

export const sentimentTrendEnum = pgEnum('sentiment_trend', ['improving', 'stable', 'declining']);

export const sentimentHistory = pgTable(
  "sentiment_history",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    employeeId: varchar("employee_id").references(() => employees.id, { onDelete: 'cascade' }),
    
    // Sentiment data
    overallScore: decimal("overall_score", { precision: 3, scale: 2 }).notNull(), // 0.00 to 1.00
    positiveScore: decimal("positive_score", { precision: 3, scale: 2 }),
    negativeScore: decimal("negative_score", { precision: 3, scale: 2 }),
    neutralScore: decimal("neutral_score", { precision: 3, scale: 2 }),
    
    // Analysis context
    sourceType: varchar("source_type").notNull(), // 'feedback', 'survey', 'review', 'message', 'note'
    sourceId: varchar("source_id"), // Reference to source entity
    sourceText: text("source_text"), // Original text analyzed (optional, for audit)
    
    // AI analysis details
    keyTopics: jsonb("key_topics"), // Extracted themes/topics
    emotionBreakdown: jsonb("emotion_breakdown"), // Detailed emotion analysis
    actionableInsights: jsonb("actionable_insights"), // AI recommendations
    
    // Trend tracking
    previousScore: decimal("previous_score", { precision: 3, scale: 2 }),
    trend: sentimentTrendEnum("trend"),
    
    analyzedAt: timestamp("analyzed_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("sentiment_history_workspace_idx").on(table.workspaceId),
    index("sentiment_history_employee_idx").on(table.employeeId),
    index("sentiment_history_source_idx").on(table.sourceType),
    index("sentiment_history_created_at_idx").on(table.createdAt),
  ]
);

export const insertSentimentHistorySchema = createInsertSchema(sentimentHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertSentimentHistory = z.infer<typeof insertSentimentHistorySchema>;
export type SentimentHistory = typeof sentimentHistory.$inferSelect;

// ============================================================================
// AI BRAIN JOB QUEUE (Gap #13 - Persistent job queue for restart resilience)
// ============================================================================

export const jobStatusEnum = pgEnum('job_status', ['pending', 'processing', 'completed', 'failed', 'cancelled']);
export const jobPriorityEnum = pgEnum('job_priority', ['low', 'normal', 'high', 'critical']);

export const aiBrainJobQueue = pgTable(
  "ai_brain_job_queue",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    
    // Job definition
    jobType: varchar("job_type").notNull(), // 'document_extraction', 'issue_detection', 'sentiment_analysis', etc.
    skillId: varchar("skill_id"), // Reference to AI Brain skill
    
    // Job data
    inputData: jsonb("input_data").notNull(), // Job parameters
    outputData: jsonb("output_data"), // Job result
    
    // Status tracking
    status: jobStatusEnum("status").default('pending'),
    priority: jobPriorityEnum("priority").default('normal'),
    
    // Retry handling
    attempts: integer("attempts").default(0),
    maxAttempts: integer("max_attempts").default(3),
    lastError: text("last_error"),
    nextRetryAt: timestamp("next_retry_at"),
    
    // Timing
    scheduledFor: timestamp("scheduled_for").defaultNow(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    
    // Audit
    createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("ai_brain_job_queue_workspace_idx").on(table.workspaceId),
    index("ai_brain_job_queue_status_idx").on(table.status),
    index("ai_brain_job_queue_priority_idx").on(table.priority),
    index("ai_brain_job_queue_scheduled_idx").on(table.scheduledFor),
    index("ai_brain_job_queue_type_idx").on(table.jobType),
  ]
);

export const insertAiBrainJobQueueSchema = createInsertSchema(aiBrainJobQueue).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiBrainJobQueue = z.infer<typeof insertAiBrainJobQueueSchema>;
export type AiBrainJobQueue = typeof aiBrainJobQueue.$inferSelect;

// ============================================================================
// GUSTO SYNC HISTORY (Gap #12 - Persist Gusto integration data)
// ============================================================================

export const gustoSyncStatusEnum = pgEnum('gusto_sync_status', ['pending', 'syncing', 'completed', 'failed', 'partial']);

export const gustoSyncHistory = pgTable(
  "gusto_sync_history",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    
    // Sync details
    syncType: varchar("sync_type").notNull(), // 'employees', 'payroll', 'time_off', 'benefits', 'full'
    direction: varchar("direction").notNull().default('inbound'), // 'inbound' or 'outbound'
    
    // Status
    status: gustoSyncStatusEnum("status").default('pending'),
    
    // Statistics
    recordsProcessed: integer("records_processed").default(0),
    recordsCreated: integer("records_created").default(0),
    recordsUpdated: integer("records_updated").default(0),
    recordsFailed: integer("records_failed").default(0),
    
    // Details
    syncDetails: jsonb("sync_details"), // Detailed sync log
    errorLog: jsonb("error_log"), // Errors encountered
    
    // Gusto references
    gustoCompanyId: varchar("gusto_company_id"),
    gustoPayrollId: varchar("gusto_payroll_id"),
    
    // Timing
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    
    // Audit
    triggeredBy: varchar("triggered_by").references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("gusto_sync_history_workspace_idx").on(table.workspaceId),
    index("gusto_sync_history_status_idx").on(table.status),
    index("gusto_sync_history_type_idx").on(table.syncType),
    index("gusto_sync_history_created_at_idx").on(table.createdAt),
  ]
);

export const insertGustoSyncHistorySchema = createInsertSchema(gustoSyncHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertGustoSyncHistory = z.infer<typeof insertGustoSyncHistorySchema>;
export type GustoSyncHistory = typeof gustoSyncHistory.$inferSelect;

// ============================================================================
// ENGAGEMENT SCORE HISTORY (Gap #4 - Track historical engagement for trends)
// ============================================================================

export const engagementScoreHistory = pgTable(
  "engagement_score_history",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    
    // Score data
    overallScore: decimal("overall_score", { precision: 5, scale: 2 }).notNull(), // 0-100
    participationRate: decimal("participation_rate", { precision: 5, scale: 2 }),
    responseCount: integer("response_count").default(0),
    
    // Breakdown by category
    categoryScores: jsonb("category_scores"), // { satisfaction: 75, culture: 80, growth: 70 }
    
    // Benchmarking
    industryPercentile: integer("industry_percentile"), // 0-100
    companySize: varchar("company_size"), // 'small', 'medium', 'large', 'enterprise'
    industry: varchar("industry"),
    
    // Period tracking
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    periodType: varchar("period_type").notNull(), // 'weekly', 'monthly', 'quarterly', 'annual'
    
    // Trend vs previous period
    previousScore: decimal("previous_score", { precision: 5, scale: 2 }),
    scoreDelta: decimal("score_delta", { precision: 5, scale: 2 }),
    
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("engagement_score_history_workspace_idx").on(table.workspaceId),
    index("engagement_score_history_period_idx").on(table.periodStart),
    index("engagement_score_history_type_idx").on(table.periodType),
  ]
);

export const insertEngagementScoreHistorySchema = createInsertSchema(engagementScoreHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertEngagementScoreHistory = z.infer<typeof insertEngagementScoreHistorySchema>;
export type EngagementScoreHistory = typeof engagementScoreHistory.$inferSelect;

// ============================================================================
// GAMIFICATION SYSTEM - Employee Engagement & Recognition
// ============================================================================

// Achievement categories
export const achievementCategoryEnum = pgEnum('achievement_category', [
  'attendance', 'performance', 'teamwork', 'learning', 'milestone', 'special'
]);

// Achievement definitions
export const achievements = pgTable("achievements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Achievement details
  name: varchar("name").notNull(),
  description: text("description"),
  category: achievementCategoryEnum("category").default('performance'),
  icon: varchar("icon"), // Lucide icon name or emoji
  
  // Points and rarity
  pointsValue: integer("points_value").default(10),
  rarity: varchar("rarity").default('common'), // 'common', 'uncommon', 'rare', 'epic', 'legendary'
  
  // Criteria for automatic awarding
  triggerType: varchar("trigger_type"), // 'clock_in_streak', 'hours_worked', 'tasks_completed', 'manual', etc.
  triggerThreshold: integer("trigger_threshold"), // e.g., 7 for 7-day streak
  
  // Display
  isActive: boolean("is_active").default(true),
  isGlobal: boolean("is_global").default(false), // Platform-wide or workspace-specific
  sortOrder: integer("sort_order").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
}, (table) => [
  index("achievements_workspace_idx").on(table.workspaceId),
  index("achievements_category_idx").on(table.category),
  index("achievements_active_idx").on(table.isActive),
]);

export const insertAchievementSchema = createInsertSchema(achievements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAchievement = z.infer<typeof insertAchievementSchema>;
export type Achievement = typeof achievements.$inferSelect;

// Employee achievements (earned)
export const employeeAchievements = pgTable("employee_achievements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  achievementId: varchar("achievement_id").notNull().references(() => achievements.id, { onDelete: 'cascade' }),
  
  // Award details
  earnedAt: timestamp("earned_at").defaultNow(),
  pointsAwarded: integer("points_awarded").default(0),
  
  // Reason/context
  reason: text("reason"),
  metadata: jsonb("metadata"), // Additional context data
  
  // Notification tracking
  isNotified: boolean("is_notified").default(false),
  notifiedAt: timestamp("notified_at"),
}, (table) => [
  index("employee_achievements_workspace_idx").on(table.workspaceId),
  index("employee_achievements_employee_idx").on(table.employeeId),
  index("employee_achievements_achievement_idx").on(table.achievementId),
  index("employee_achievements_earned_idx").on(table.earnedAt),
]);

export const insertEmployeeAchievementSchema = createInsertSchema(employeeAchievements).omit({
  id: true,
});

export type InsertEmployeeAchievement = z.infer<typeof insertEmployeeAchievementSchema>;
export type EmployeeAchievement = typeof employeeAchievements.$inferSelect;

// Employee points ledger
export const employeePoints = pgTable("employee_points", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  
  // Current totals (denormalized for performance)
  totalPoints: integer("total_points").default(0),
  currentLevel: integer("current_level").default(1),
  currentStreak: integer("current_streak").default(0),
  longestStreak: integer("longest_streak").default(0),
  
  // Monthly/weekly tracking
  pointsThisMonth: integer("points_this_month").default(0),
  pointsThisWeek: integer("points_this_week").default(0),
  
  // Achievement counts
  achievementsEarned: integer("achievements_earned").default(0),
  
  // Last activity
  lastActivityAt: timestamp("last_activity_at"),
  lastClockIn: timestamp("last_clock_in"),
  
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("employee_points_workspace_idx").on(table.workspaceId),
  index("employee_points_employee_idx").on(table.employeeId),
  index("employee_points_total_idx").on(table.totalPoints),
  index("employee_points_level_idx").on(table.currentLevel),
]);

export const insertEmployeePointsSchema = createInsertSchema(employeePoints).omit({
  id: true,
  updatedAt: true,
});

export type InsertEmployeePoints = z.infer<typeof insertEmployeePointsSchema>;
export type EmployeePoints = typeof employeePoints.$inferSelect;

// Points transaction history
export const pointsTransactions = pgTable("points_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  
  // Transaction details
  points: integer("points").notNull(), // Positive for earning, negative for spending
  transactionType: varchar("transaction_type").notNull(), // 'achievement', 'bonus', 'reward_redemption', 'manual'
  
  // Reference
  referenceId: varchar("reference_id"), // Achievement ID, time entry ID, etc.
  referenceType: varchar("reference_type"), // 'achievement', 'time_entry', 'manual'
  
  description: text("description"),
  awardedBy: varchar("awarded_by").references(() => users.id, { onDelete: 'set null' }),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("points_transactions_workspace_idx").on(table.workspaceId),
  index("points_transactions_employee_idx").on(table.employeeId),
  index("points_transactions_type_idx").on(table.transactionType),
  index("points_transactions_created_idx").on(table.createdAt),
]);

export const insertPointsTransactionSchema = createInsertSchema(pointsTransactions).omit({
  id: true,
  createdAt: true,
});

export type InsertPointsTransaction = z.infer<typeof insertPointsTransactionSchema>;
export type PointsTransaction = typeof pointsTransactions.$inferSelect;

// Leaderboard cache (refreshed periodically)
export const leaderboardCache = pgTable("leaderboard_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Period
  period: varchar("period").notNull(), // 'daily', 'weekly', 'monthly', 'all_time'
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  
  // Rankings (JSON array of {employeeId, rank, points, name})
  rankings: jsonb("rankings").notNull(),
  
  // Cache metadata
  calculatedAt: timestamp("calculated_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("leaderboard_cache_workspace_idx").on(table.workspaceId),
  index("leaderboard_cache_period_idx").on(table.period),
  index("leaderboard_cache_expires_idx").on(table.expiresAt),
]);

export const insertLeaderboardCacheSchema = createInsertSchema(leaderboardCache).omit({
  id: true,
  calculatedAt: true,
});

export type InsertLeaderboardCache = z.infer<typeof insertLeaderboardCacheSchema>;
export type LeaderboardCache = typeof leaderboardCache.$inferSelect;

// ============================================================================
// COAILEAGUE AUTONOMOUS SCHEDULER - PHASE 1 (Gap Analysis Implementation)
// ============================================================================

// Pool type enum for scheduler
export const schedulerPoolTypeEnum = pgEnum('scheduler_pool_type', ['org', 'global']);

// Scoring event type enum
export const scoringEventTypeEnum = pgEnum('scoring_event_type', [
  'clock_in_on_time', 'clock_in_late', 'clock_out_on_time', 'clock_out_early', 'clock_out_late',
  'shift_completed', 'shift_perfect', 'shift_no_show', 'shift_call_off', 'shift_call_off_late',
  'shift_accepted', 'shift_rejected', 'shift_dropped',
  'client_positive_feedback', 'client_negative_feedback', 'client_neutral_feedback',
  'overtime_compliance', 'overtime_violation',
  'certification_added', 'certification_expired', 'certification_renewed',
  'training_completed', 'skill_verified',
  'manual_adjustment'
]);

// Personality tag category enum  
export const personalityTagCategoryEnum = pgEnum('personality_tag_category', [
  'work_style', 'communication', 'energy_level', 'experience_type', 'special_skills'
]);

// Pool failure type enum
export const poolFailureTypeEnum = pgEnum('pool_failure_type', ['hard', 'soft', 'threshold']);

// Unified CoAIleague Employee Profile for AI Scheduling
export const coaileagueEmployeeProfiles = pgTable("coaileague_employee_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }).unique(),
  
  // === COMPOSITE SCORES (0.00-1.00 normalized) ===
  overallScore: decimal("overall_score", { precision: 5, scale: 4 }).default("0.7500"),
  reliabilityScore: decimal("reliability_score", { precision: 5, scale: 4 }).default("0.8500"),
  skillMatchScore: decimal("skill_match_score", { precision: 5, scale: 4 }).default("0.8000"),
  distanceScore: decimal("distance_score", { precision: 5, scale: 4 }).default("0.7000"),
  personalityLikenessScore: decimal("personality_likeness_score", { precision: 5, scale: 4 }).default("0.5000"),
  costEfficiencyScore: decimal("cost_efficiency_score", { precision: 5, scale: 4 }).default("0.8000"),
  
  // === RAW METRICS ===
  // Reliability
  totalShiftsAssigned: integer("total_shifts_assigned").default(0),
  shiftsCompleted: integer("shifts_completed").default(0),
  shiftsNoShow: integer("shifts_no_show").default(0),
  shiftsCallOff: integer("shifts_call_off").default(0),
  shiftsLateCallOff: integer("shifts_late_call_off").default(0),
  shiftsDropped: integer("shifts_dropped").default(0),
  clockInsOnTime: integer("clock_ins_on_time").default(0),
  clockInsLate: integer("clock_ins_late").default(0),
  clockOutsOnTime: integer("clock_outs_on_time").default(0),
  clockOutsLate: integer("clock_outs_late").default(0),
  perfectShifts: integer("perfect_shifts").default(0),
  
  // Distance & Location
  homeLatitude: decimal("home_latitude", { precision: 10, scale: 7 }),
  homeLongitude: decimal("home_longitude", { precision: 10, scale: 7 }),
  maxWillingDistance: integer("max_willing_distance").default(50),
  preferredRegions: text("preferred_regions").array().default(sql`ARRAY[]::text[]`),
  
  // Availability & Response
  typicalResponseTimeMinutes: integer("typical_response_time_minutes").default(120),
  availableForLastMinute: boolean("available_for_last_minute").default(false),
  preferredShiftTypes: text("preferred_shift_types").array().default(sql`ARRAY[]::text[]`),
  blackoutDates: jsonb("blackout_dates"), // Array of date ranges
  
  // Client Feedback Aggregates
  clientPositiveFeedback: integer("client_positive_feedback").default(0),
  clientNegativeFeedback: integer("client_negative_feedback").default(0),
  clientNeutralFeedback: integer("client_neutral_feedback").default(0),
  averageClientRating: decimal("average_client_rating", { precision: 3, scale: 2 }).default("4.00"),
  
  // Cost Metrics
  currentHourlyRate: decimal("current_hourly_rate", { precision: 10, scale: 2 }),
  maxWeeklyHours: integer("max_weekly_hours").default(40),
  currentWeeklyHours: decimal("current_weekly_hours", { precision: 6, scale: 2 }).default("0.00"),
  overtimeEligible: boolean("overtime_eligible").default(true),
  
  // Points System (ties to gamification)
  goodPoints: integer("good_points").default(0),
  negativePoints: integer("negative_points").default(0),
  netPoints: integer("net_points").default(0),
  
  // === HISTORICAL AGGREGATES (for Gemini learning) ===
  weeklyAverageScore30Days: decimal("weekly_average_score_30_days", { precision: 5, scale: 4 }),
  weeklyAverageScore90Days: decimal("weekly_average_score_90_days", { precision: 5, scale: 4 }),
  callOffRate30Days: decimal("call_off_rate_30_days", { precision: 5, scale: 4 }),
  callOffRate90Days: decimal("call_off_rate_90_days", { precision: 5, scale: 4 }),
  reliabilityTrend: varchar("reliability_trend"), // 'improving', 'stable', 'declining'
  
  // Day-of-week reliability patterns (0.00-1.00 for each day)
  sundayReliability: decimal("sunday_reliability", { precision: 5, scale: 4 }),
  mondayReliability: decimal("monday_reliability", { precision: 5, scale: 4 }),
  tuesdayReliability: decimal("tuesday_reliability", { precision: 5, scale: 4 }),
  wednesdayReliability: decimal("wednesday_reliability", { precision: 5, scale: 4 }),
  thursdayReliability: decimal("thursday_reliability", { precision: 5, scale: 4 }),
  fridayReliability: decimal("friday_reliability", { precision: 5, scale: 4 }),
  saturdayReliability: decimal("saturday_reliability", { precision: 5, scale: 4 }),
  
  // Licensing & Certifications (quick reference)
  activeLicenses: text("active_licenses").array().default(sql`ARRAY[]::text[]`),
  expiringLicenses: jsonb("expiring_licenses"), // {license: string, expiresAt: date}[]
  
  // Pool membership
  isInOrgPool: boolean("is_in_org_pool").default(true),
  isInGlobalPool: boolean("is_in_global_pool").default(false),
  globalPoolCategories: text("global_pool_categories").array().default(sql`ARRAY[]::text[]`),
  
  // Last activity timestamps
  lastShiftAssigned: timestamp("last_shift_assigned"),
  lastShiftCompleted: timestamp("last_shift_completed"),
  lastScoreUpdate: timestamp("last_score_update"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("coaileague_profiles_workspace_idx").on(table.workspaceId),
  index("coaileague_profiles_employee_idx").on(table.employeeId),
  index("coaileague_profiles_overall_score_idx").on(table.overallScore),
  index("coaileague_profiles_reliability_idx").on(table.reliabilityScore),
  index("coaileague_profiles_org_pool_idx").on(table.isInOrgPool),
  index("coaileague_profiles_global_pool_idx").on(table.isInGlobalPool),
]);

export const insertCoaileagueEmployeeProfileSchema = createInsertSchema(coaileagueEmployeeProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCoaileagueEmployeeProfile = z.infer<typeof insertCoaileagueEmployeeProfileSchema>;
export type CoaileagueEmployeeProfile = typeof coaileagueEmployeeProfiles.$inferSelect;

// Employee Score Snapshots (Historical tracking for trends)
export const employeeScoreSnapshots = pgTable("employee_score_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  profileId: varchar("profile_id").references(() => coaileagueEmployeeProfiles.id, { onDelete: 'cascade' }),
  
  // Snapshot period
  periodType: varchar("period_type").notNull(), // 'daily', 'weekly', 'monthly'
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  
  // Scores at snapshot time
  overallScore: decimal("overall_score", { precision: 5, scale: 4 }),
  reliabilityScore: decimal("reliability_score", { precision: 5, scale: 4 }),
  skillMatchScore: decimal("skill_match_score", { precision: 5, scale: 4 }),
  distanceScore: decimal("distance_score", { precision: 5, scale: 4 }),
  personalityLikenessScore: decimal("personality_likeness_score", { precision: 5, scale: 4 }),
  
  // Activity during period
  shiftsAssigned: integer("shifts_assigned").default(0),
  shiftsCompleted: integer("shifts_completed").default(0),
  shiftsNoShow: integer("shifts_no_show").default(0),
  shiftsCallOff: integer("shifts_call_off").default(0),
  pointsEarned: integer("points_earned").default(0),
  pointsLost: integer("points_lost").default(0),
  
  // Calculated metrics
  reliabilityPercentage: decimal("reliability_percentage", { precision: 5, scale: 2 }),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("score_snapshots_workspace_idx").on(table.workspaceId),
  index("score_snapshots_employee_idx").on(table.employeeId),
  index("score_snapshots_period_idx").on(table.periodType, table.periodStart),
]);

export const insertEmployeeScoreSnapshotSchema = createInsertSchema(employeeScoreSnapshots).omit({
  id: true,
  createdAt: true,
});

export type InsertEmployeeScoreSnapshot = z.infer<typeof insertEmployeeScoreSnapshotSchema>;
export type EmployeeScoreSnapshot = typeof employeeScoreSnapshots.$inferSelect;

// Employee Event Log (Event-driven score updates)
export const employeeEventLog = pgTable("employee_event_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  profileId: varchar("profile_id").references(() => coaileagueEmployeeProfiles.id, { onDelete: 'set null' }),
  
  // Event details
  eventType: scoringEventTypeEnum("event_type").notNull(),
  eventSource: varchar("event_source").notNull(), // 'time_tracking', 'shift_management', 'client_feedback', 'admin', 'system'
  
  // Points impact
  pointsChange: integer("points_change").default(0),
  pointsType: varchar("points_type"), // 'good', 'negative'
  
  // Score impact (before/after)
  previousOverallScore: decimal("previous_overall_score", { precision: 5, scale: 4 }),
  newOverallScore: decimal("new_overall_score", { precision: 5, scale: 4 }),
  previousReliabilityScore: decimal("previous_reliability_score", { precision: 5, scale: 4 }),
  newReliabilityScore: decimal("new_reliability_score", { precision: 5, scale: 4 }),
  
  // Reference to triggering entity
  referenceId: varchar("reference_id"), // shift_id, time_entry_id, feedback_id
  referenceType: varchar("reference_type"), // 'shift', 'time_entry', 'feedback', 'certification'
  
  // Context
  metadata: jsonb("metadata"), // Additional context (e.g., minutes late, client comments)
  triggeredBy: varchar("triggered_by").references(() => users.id, { onDelete: 'set null' }), // User who triggered (if manual)
  isAutomatic: boolean("is_automatic").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("event_log_workspace_idx").on(table.workspaceId),
  index("event_log_employee_idx").on(table.employeeId),
  index("event_log_type_idx").on(table.eventType),
  index("event_log_created_idx").on(table.createdAt),
  index("event_log_reference_idx").on(table.referenceType, table.referenceId),
]);

export const insertEmployeeEventLogSchema = createInsertSchema(employeeEventLog).omit({
  id: true,
  createdAt: true,
});

export type InsertEmployeeEventLog = z.infer<typeof insertEmployeeEventLogSchema>;
export type EmployeeEventLog = typeof employeeEventLog.$inferSelect;

// Personality Tags Catalog (Master list per workspace)
export const personalityTagsCatalog = pgTable("personality_tags_catalog", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  tagName: varchar("tag_name").notNull(), // e.g., 'energetic', 'calm', 'detail-oriented'
  tagCategory: personalityTagCategoryEnum("tag_category").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("personality_tags_workspace_idx").on(table.workspaceId),
  index("personality_tags_category_idx").on(table.tagCategory),
]);

export const insertPersonalityTagsCatalogSchema = createInsertSchema(personalityTagsCatalog).omit({
  id: true,
  createdAt: true,
});

export type InsertPersonalityTagsCatalog = z.infer<typeof insertPersonalityTagsCatalogSchema>;
export type PersonalityTagsCatalog = typeof personalityTagsCatalog.$inferSelect;

// Employee Personality Tags (Junction table)
export const employeePersonalityTags = pgTable("employee_personality_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  tagId: varchar("tag_id").notNull().references(() => personalityTagsCatalog.id, { onDelete: 'cascade' }),
  
  // Self-reported or verified
  isSelfReported: boolean("is_self_reported").default(true),
  verifiedBy: varchar("verified_by").references(() => users.id, { onDelete: 'set null' }),
  verifiedAt: timestamp("verified_at"),
  
  // Strength/confidence (0.00-1.00)
  strength: decimal("strength", { precision: 3, scale: 2 }).default("0.80"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("emp_personality_tags_workspace_idx").on(table.workspaceId),
  index("emp_personality_tags_employee_idx").on(table.employeeId),
  index("emp_personality_tags_tag_idx").on(table.tagId),
]);

export const insertEmployeePersonalityTagSchema = createInsertSchema(employeePersonalityTags).omit({
  id: true,
  createdAt: true,
});

export type InsertEmployeePersonalityTag = z.infer<typeof insertEmployeePersonalityTagSchema>;
export type EmployeePersonalityTag = typeof employeePersonalityTags.$inferSelect;

// Client Personality Preferences (What traits clients want for shifts)
export const clientPersonalityPreferences = pgTable("client_personality_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: 'cascade' }),
  tagId: varchar("tag_id").notNull().references(() => personalityTagsCatalog.id, { onDelete: 'cascade' }),
  
  // Preference weight (how important is this trait?)
  preferenceWeight: decimal("preference_weight", { precision: 3, scale: 2 }).default("0.50"), // 0.00-1.00
  isRequired: boolean("is_required").default(false), // Hard requirement vs preference
  
  // Context (applies to specific shift types or all)
  appliesToShiftTypes: text("applies_to_shift_types").array().default(sql`ARRAY[]::text[]`), // Empty = all shifts
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("client_prefs_workspace_idx").on(table.workspaceId),
  index("client_prefs_client_idx").on(table.clientId),
  index("client_prefs_tag_idx").on(table.tagId),
]);

export const insertClientPersonalityPreferenceSchema = createInsertSchema(clientPersonalityPreferences).omit({
  id: true,
  createdAt: true,
});

export type InsertClientPersonalityPreference = z.infer<typeof insertClientPersonalityPreferenceSchema>;
export type ClientPersonalityPreference = typeof clientPersonalityPreferences.$inferSelect;

// Scoring Weight Profiles (Configurable weights per workspace)
export const scoringWeightProfiles = pgTable("scoring_weight_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  profileName: varchar("profile_name").notNull(),
  description: text("description"),
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  
  // Scoring factor weights (must sum to 1.00)
  skillsWeight: decimal("skills_weight", { precision: 4, scale: 3 }).default("0.250"),
  certificationsWeight: decimal("certifications_weight", { precision: 4, scale: 3 }).default("0.150"),
  performanceWeight: decimal("performance_weight", { precision: 4, scale: 3 }).default("0.150"),
  reliabilityWeight: decimal("reliability_weight", { precision: 4, scale: 3 }).default("0.150"),
  distanceWeight: decimal("distance_weight", { precision: 4, scale: 3 }).default("0.100"),
  payMarginWeight: decimal("pay_margin_weight", { precision: 4, scale: 3 }).default("0.100"),
  overtimeRiskWeight: decimal("overtime_risk_weight", { precision: 4, scale: 3 }).default("0.050"),
  personalityLikenessWeight: decimal("personality_likeness_weight", { precision: 4, scale: 3 }).default("0.050"),
  
  // Point values for events
  pointsClockInOnTime: integer("points_clock_in_on_time").default(2),
  pointsClockInLate: integer("points_clock_in_late").default(-5),
  pointsShiftComplete: integer("points_shift_complete").default(5),
  pointsShiftPerfect: integer("points_shift_perfect").default(10),
  pointsNoShow: integer("points_no_show").default(-20),
  pointsCallOff: integer("points_call_off").default(-10),
  pointsLateCallOff: integer("points_late_call_off").default(-15),
  pointsPositiveFeedback: integer("points_positive_feedback").default(5),
  pointsNegativeFeedback: integer("points_negative_feedback").default(-5),
  
  // Thresholds
  lateThresholdMinutes: integer("late_threshold_minutes").default(5),
  earlyDepartureThresholdMinutes: integer("early_departure_threshold_minutes").default(10),
  lateCallOffThresholdHours: integer("late_call_off_threshold_hours").default(4),
  
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("scoring_weights_workspace_idx").on(table.workspaceId),
  index("scoring_weights_default_idx").on(table.isDefault),
]);

export const insertScoringWeightProfileSchema = createInsertSchema(scoringWeightProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertScoringWeightProfile = z.infer<typeof insertScoringWeightProfileSchema>;
export type ScoringWeightProfile = typeof scoringWeightProfiles.$inferSelect;

// Pool Failure Configuration (Thresholds for Org/Global pool)
export const poolFailureConfig = pgTable("pool_failure_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }).unique(),
  
  // Hard failure thresholds (must be met)
  hardFailureNoLicensing: boolean("hard_failure_no_licensing").default(true),
  hardFailureNoAvailability: boolean("hard_failure_no_availability").default(true),
  hardFailureNoCriticalSkills: boolean("hard_failure_no_critical_skills").default(true),
  
  // Soft failure thresholds (optimization preferences)
  softFailureMinScore: decimal("soft_failure_min_score", { precision: 3, scale: 2 }).default("0.60"),
  softFailureMaxDistance: integer("soft_failure_max_distance").default(100), // miles
  softFailureMinPersonalityMatch: decimal("soft_failure_min_personality_match", { precision: 3, scale: 2 }).default("0.40"),
  
  // Global pool search settings
  globalPoolEnabled: boolean("global_pool_enabled").default(true),
  globalPoolMaxCandidates: integer("global_pool_max_candidates").default(10),
  globalPoolTimeoutMinutes: integer("global_pool_timeout_minutes").default(30),
  
  // Fallback behavior
  fallbackToHumanDispatch: boolean("fallback_to_human_dispatch").default(true),
  alertOnPoolFailure: boolean("alert_on_pool_failure").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("pool_failure_config_workspace_idx").on(table.workspaceId),
]);

export const insertPoolFailureConfigSchema = createInsertSchema(poolFailureConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPoolFailureConfig = z.infer<typeof insertPoolFailureConfigSchema>;
export type PoolFailureConfig = typeof poolFailureConfig.$inferSelect;

// Shift Acceptance Records (Digital acceptance audit trail)
export const shiftAcceptanceRecords = pgTable("shift_acceptance_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  shiftId: varchar("shift_id").notNull().references(() => shifts.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  
  // Acceptance details
  action: varchar("action").notNull(), // 'accepted', 'rejected', 'dropped', 'reassigned'
  
  // Digital signature/acknowledgment
  acceptanceMethod: varchar("acceptance_method").notNull(), // 'one_click', 'digital_signature', 'verbal_confirmation'
  signatureHash: varchar("signature_hash"), // SHA-256 hash of acceptance data
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  deviceInfo: jsonb("device_info"),
  
  // Shift details at time of acceptance (immutable snapshot)
  shiftDetails: jsonb("shift_details").notNull(), // {date, time, location, client, payRate, duties}
  
  // Offer/Response tracking
  offerId: varchar("offer_id").references(() => shiftOffers.id, { onDelete: 'set null' }),
  offerSentAt: timestamp("offer_sent_at"),
  responseReceivedAt: timestamp("response_received_at"),
  responseTimeMinutes: integer("response_time_minutes"),
  
  // Status for downstream automation
  isAcknowledged: boolean("is_acknowledged").default(true),
  acknowledgedAt: timestamp("acknowledged_at").defaultNow(),
  
  // For reassignments
  previousEmployeeId: varchar("previous_employee_id").references(() => employees.id, { onDelete: 'set null' }),
  reassignmentReason: text("reassignment_reason"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("acceptance_records_workspace_idx").on(table.workspaceId),
  index("acceptance_records_shift_idx").on(table.shiftId),
  index("acceptance_records_employee_idx").on(table.employeeId),
  index("acceptance_records_action_idx").on(table.action),
  index("acceptance_records_created_idx").on(table.createdAt),
]);

export const insertShiftAcceptanceRecordSchema = createInsertSchema(shiftAcceptanceRecords).omit({
  id: true,
  createdAt: true,
});

export type InsertShiftAcceptanceRecord = z.infer<typeof insertShiftAcceptanceRecordSchema>;
export type ShiftAcceptanceRecord = typeof shiftAcceptanceRecords.$inferSelect;

// AI Decision Audit (Gemini decision logging)
export const aiDecisionAudit = pgTable("ai_decision_audit", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Decision context
  decisionType: varchar("decision_type").notNull(), // 'shift_assignment', 'schedule_generation', 'candidate_ranking'
  shiftId: varchar("shift_id").references(() => shifts.id, { onDelete: 'set null' }),
  
  // Pool search details
  poolSearched: schedulerPoolTypeEnum("pool_searched").notNull(),
  orgPoolSearched: boolean("org_pool_searched").default(false),
  globalPoolSearched: boolean("global_pool_searched").default(false),
  poolFailureType: poolFailureTypeEnum("pool_failure_type"),
  poolFailureReason: text("pool_failure_reason"),
  
  // Candidates evaluated (top 5)
  candidatesEvaluated: integer("candidates_evaluated").default(0),
  topCandidates: jsonb("top_candidates"), // [{employeeId, score, reasons, concerns}]
  
  // Final decision
  selectedEmployeeId: varchar("selected_employee_id").references(() => employees.id, { onDelete: 'set null' }),
  selectionReason: text("selection_reason"),
  selectionConfidence: decimal("selection_confidence", { precision: 4, scale: 3 }),
  
  // Tie-breaking (if applicable)
  tieBreakingUsed: boolean("tie_breaking_used").default(false),
  tieBreakingMethod: varchar("tie_breaking_method"), // 'seniority', 'last_assigned', 'random'
  
  // Constraints
  hardConstraintsMet: jsonb("hard_constraints_met"), // {licensing: true, availability: true}
  softConstraintsOptimized: jsonb("soft_constraints_optimized"), // {distance: 0.85, score: 0.90}
  constraintsViolated: jsonb("constraints_violated"), // Any soft constraints not met
  
  // Optimization function details
  optimizationWeightsUsed: jsonb("optimization_weights_used"), // The weights profile used
  calculatedFitScores: jsonb("calculated_fit_scores"), // Fit scores for top candidates
  
  // Gemini API details
  geminiModelUsed: varchar("gemini_model_used"),
  geminiTokensUsed: integer("gemini_tokens_used"),
  geminiLatencyMs: integer("gemini_latency_ms"),
  geminiRawResponse: text("gemini_raw_response"), // For debugging
  
  // Outcome tracking
  decisionOutcome: varchar("decision_outcome"), // 'accepted', 'rejected', 'no_response', 'reassigned'
  outcomeRecordedAt: timestamp("outcome_recorded_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("ai_audit_workspace_idx").on(table.workspaceId),
  index("ai_audit_shift_idx").on(table.shiftId),
  index("ai_audit_type_idx").on(table.decisionType),
  index("ai_audit_created_idx").on(table.createdAt),
  index("ai_audit_pool_idx").on(table.poolSearched),
]);

export const insertAiDecisionAuditSchema = createInsertSchema(aiDecisionAudit).omit({
  id: true,
  createdAt: true,
});

export type InsertAiDecisionAudit = z.infer<typeof insertAiDecisionAuditSchema>;
export type AiDecisionAudit = typeof aiDecisionAudit.$inferSelect;

// Scheduler Notification Events (For notification matrix)
export const schedulerNotificationEvents = pgTable("scheduler_notification_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Event details
  eventType: varchar("event_type").notNull(), // 'shift_offered', 'shift_accepted', 'shift_unfilled', 'calloff_received', 'reassignment_needed'
  severity: varchar("severity").notNull().default("info"), // 'info', 'warning', 'critical'
  
  // Related entities
  shiftId: varchar("shift_id").references(() => shifts.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").references(() => employees.id, { onDelete: 'set null' }),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: 'set null' }),
  
  // Recipients (who should be notified)
  recipientType: varchar("recipient_type").notNull(), // 'employee', 'org_admin', 'client', 'dispatcher'
  recipientUserId: varchar("recipient_user_id").references(() => users.id, { onDelete: 'set null' }),
  
  // Notification content
  title: text("title").notNull(),
  message: text("message").notNull(),
  actionUrl: text("action_url"),
  
  // Delivery status
  channels: text("channels").array().default(sql`ARRAY[]::text[]`), // ['websocket', 'email', 'sms', 'push']
  deliveredVia: text("delivered_via").array().default(sql`ARRAY[]::text[]`),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
  
  // Escalation
  requiresAcknowledgment: boolean("requires_acknowledgment").default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
  escalatedAt: timestamp("escalated_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("scheduler_notif_workspace_idx").on(table.workspaceId),
  index("scheduler_notif_event_type_idx").on(table.eventType),
  index("scheduler_notif_severity_idx").on(table.severity),
  index("scheduler_notif_recipient_idx").on(table.recipientUserId),
  index("scheduler_notif_shift_idx").on(table.shiftId),
]);

export const insertSchedulerNotificationEventSchema = createInsertSchema(schedulerNotificationEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertSchedulerNotificationEvent = z.infer<typeof insertSchedulerNotificationEventSchema>;
export type SchedulerNotificationEvent = typeof schedulerNotificationEvents.$inferSelect;

// ============================================================================
// SALES/ONBOARDING PIPELINE WITH PROGRESS & GAMIFICATION
// ============================================================================

// Pipeline status for tracking org journey from invite to paid subscriber
export const pipelineStatusEnum = pgEnum('pipeline_status', [
  'invited',           // Initial invite sent
  'email_opened',      // Invite email was opened
  'trial_started',     // Trial period began
  'trial_active',      // Actively using trial
  'trial_expired',     // Trial ended without conversion
  'accepted',          // Subscribed to paid plan
  'rejected',          // Declined after trial
  'churned',           // Cancelled after being accepted
]);

// Onboarding task status
export const onboardingTaskStatusEnum = pgEnum('onboarding_task_status', [
  'pending',           // Not started
  'in_progress',       // Started but not complete
  'completed',         // Fully completed
  'skipped',           // User chose to skip
]);

// Reward status
export const rewardStatusEnum = pgEnum('reward_status', [
  'locked',            // Not yet earned
  'unlocked',          // Earned but not applied
  'applied',           // Applied to invoice/checkout
  'expired',           // Reward expired before use
]);

// Reward type
export const rewardTypeEnum = pgEnum('reward_type', [
  'onboarding_discount_10',     // 10% off first subscription
  'referral_bonus',             // Referral credit
  'early_adopter',              // Early adopter discount
  'loyalty_bonus',              // Long-term customer bonus
]);

// Task creator source
export const taskCreatorEnum = pgEnum('task_creator', [
  'system',            // Auto-generated by platform
  'ai',                // Generated by Gemini AI
  'admin',             // Created by platform admin
]);

// Org onboarding tasks table
export const orgOnboardingTasks = pgTable(
  "org_onboarding_tasks",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    
    // Task definition
    title: varchar("title").notNull(),
    description: text("description"),
    category: varchar("category").default("setup"), // 'setup', 'configuration', 'engagement', 'billing'
    
    // Status tracking
    status: onboardingTaskStatusEnum("status").default('pending'),
    
    // Progress (for multi-step tasks)
    currentProgress: integer("current_progress").default(0), // e.g., 0
    targetProgress: integer("target_progress").default(1),   // e.g., 3 users invited
    progressUnit: varchar("progress_unit"),                  // e.g., "users", "automations"
    
    // Points/weight for gamification
    points: integer("points").default(10),
    displayOrder: integer("display_order").default(0),
    
    // Task creator and AI context
    createdBy: taskCreatorEnum("created_by").default('system'),
    aiSuggestionId: varchar("ai_suggestion_id"), // Reference to AI suggestion if generated by Gemini
    aiContext: jsonb("ai_context"),               // Context used for AI task generation
    
    // Completion tracking
    completedAt: timestamp("completed_at"),
    completedBy: varchar("completed_by").references(() => users.id, { onDelete: 'set null' }),
    
    // Validation
    validationRule: varchar("validation_rule"),   // e.g., 'user_count >= 3', 'automation_created'
    systemEvent: varchar("system_event"),         // Event that triggers completion check
    
    // Required for discount unlock
    requiredForReward: boolean("required_for_reward").default(true),
    
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("onboarding_task_workspace_idx").on(table.workspaceId),
    index("onboarding_task_status_idx").on(table.status),
    index("onboarding_task_category_idx").on(table.category),
    index("onboarding_task_order_idx").on(table.displayOrder),
  ]
);

export const insertOrgOnboardingTaskSchema = createInsertSchema(orgOnboardingTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrgOnboardingTask = z.infer<typeof insertOrgOnboardingTaskSchema>;
export type OrgOnboardingTask = typeof orgOnboardingTasks.$inferSelect;

// Org rewards table
export const orgRewards = pgTable(
  "org_rewards",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    
    // Reward definition
    type: rewardTypeEnum("type").notNull(),
    title: varchar("title").notNull(),
    description: text("description"),
    
    // Discount value
    discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }),  // e.g., 10.00 for 10%
    discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }),   // Fixed amount alternative
    
    // Status
    status: rewardStatusEnum("status").default('locked'),
    
    // Stripe integration
    stripeCouponId: varchar("stripe_coupon_id"),      // Coupon created in Stripe
    stripePromotionCodeId: varchar("stripe_promotion_code_id"), // Promo code for checkout
    promoCode: varchar("promo_code"),                 // User-facing promo code
    
    // Unlock conditions
    unlockCondition: varchar("unlock_condition"),     // e.g., 'all_tasks_completed'
    
    // Timestamps
    unlockedAt: timestamp("unlocked_at"),
    appliedAt: timestamp("applied_at"),
    appliedToInvoiceId: varchar("applied_to_invoice_id").references(() => invoices.id, { onDelete: 'set null' }),
    
    // Expiration
    expiresAt: timestamp("expires_at"),
    
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("org_rewards_workspace_idx").on(table.workspaceId),
    index("org_rewards_type_idx").on(table.type),
    index("org_rewards_status_idx").on(table.status),
    index("org_rewards_promo_idx").on(table.promoCode),
  ]
);

export const insertOrgRewardSchema = createInsertSchema(orgRewards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrgReward = z.infer<typeof insertOrgRewardSchema>;
export type OrgReward = typeof orgRewards.$inferSelect;

// User onboarding progress (per-user task tracking within an org)
export const userOnboardingProgress = pgTable(
  "user_onboarding_progress",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
    
    // Task reference
    taskId: varchar("task_id").notNull().references(() => orgOnboardingTasks.id, { onDelete: 'cascade' }),
    
    // User's contribution to the task
    contribution: integer("contribution").default(0), // How much they contributed
    completedTheirPart: boolean("completed_their_part").default(false),
    completedAt: timestamp("completed_at"),
    
    // Points earned
    pointsEarned: integer("points_earned").default(0),
    
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("user_onboarding_workspace_idx").on(table.workspaceId),
    index("user_onboarding_user_idx").on(table.userId),
    index("user_onboarding_task_idx").on(table.taskId),
  ]
);

export const insertUserOnboardingProgressSchema = createInsertSchema(userOnboardingProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserOnboardingProgress = z.infer<typeof insertUserOnboardingProgressSchema>;
export type UserOnboardingProgress = typeof userOnboardingProgress.$inferSelect;

// Pipeline metrics for tracking conversion rates
export const pipelineMetrics = pgTable(
  "pipeline_metrics",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    
    // Time period
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    periodType: varchar("period_type").notNull(), // 'daily', 'weekly', 'monthly'
    
    // Counts at each stage
    invitedCount: integer("invited_count").default(0),
    emailOpenedCount: integer("email_opened_count").default(0),
    trialStartedCount: integer("trial_started_count").default(0),
    trialActiveCount: integer("trial_active_count").default(0),
    trialExpiredCount: integer("trial_expired_count").default(0),
    acceptedCount: integer("accepted_count").default(0),
    rejectedCount: integer("rejected_count").default(0),
    
    // Conversion rates (calculated)
    inviteToTrialRate: decimal("invite_to_trial_rate", { precision: 5, scale: 2 }),
    trialToAcceptedRate: decimal("trial_to_accepted_rate", { precision: 5, scale: 2 }),
    
    // Onboarding completion
    avgOnboardingCompletion: decimal("avg_onboarding_completion", { precision: 5, scale: 2 }),
    orgsCompletedOnboarding: integer("orgs_completed_onboarding").default(0),
    
    // Revenue metrics
    totalMrr: decimal("total_mrr", { precision: 12, scale: 2 }),
    newMrr: decimal("new_mrr", { precision: 12, scale: 2 }),
    
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("pipeline_metrics_period_idx").on(table.periodStart, table.periodEnd),
    index("pipeline_metrics_type_idx").on(table.periodType),
  ]
);

export const insertPipelineMetricsSchema = createInsertSchema(pipelineMetrics).omit({
  id: true,
  createdAt: true,
});

export type InsertPipelineMetrics = z.infer<typeof insertPipelineMetricsSchema>;
export type PipelineMetrics = typeof pipelineMetrics.$inferSelect;

// ============================================================================
// HELPAI ORCHESTRATION SYSTEM - PHASES 2-5
// ============================================================================
// HelpAI Registry - Master registry of all available APIs and capabilities
export const helpaiRegistry = pgTable("helpai_registry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // API Metadata
  apiName: varchar("api_name").notNull(), // e.g., 'HR_LOOKUP', 'PAYROLL_QUERY'
  apiVersion: varchar("api_version").notNull(), // e.g., '1.0.0'
  apiEndpoint: varchar("api_endpoint").notNull(), // Base URL
  apiCategory: varchar("api_category").notNull(), // 'hr', 'payroll', 'scheduling', 'compliance'
  
  // API Documentation & Schema
  description: text("description"),
  requestSchema: jsonb("request_schema"), // JSON Schema for request payload
  responseSchema: jsonb("response_schema"), // JSON Schema for response
  requiredScopes: text("required_scopes").array(), // OAuth scopes needed
  
  // Availability & Status
  isActive: boolean("is_active").default(true),
  isPublic: boolean("is_public").default(false), // Whether all orgs can access it
  
  // Rate Limiting
  rateLimitPerMinute: integer("rate_limit_per_minute").default(60),
  rateLimitPerDay: integer("rate_limit_per_day").default(10000),
  
  // Metadata
  tags: text("tags").array(), // For filtering/categorization
  metadata: jsonb("metadata"), // Additional config
  
  // Admin fields
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: 'set null' }),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("helpai_registry_api_idx").on(table.apiName),
  index("helpai_registry_category_idx").on(table.apiCategory),
  index("helpai_registry_active_idx").on(table.isActive),
]);

export const insertHelpaiRegistrySchema = createInsertSchema(helpaiRegistry).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertHelpaiRegistry = z.infer<typeof insertHelpaiRegistrySchema>;
export type HelpaiRegistry = typeof helpaiRegistry.$inferSelect;

// HelpAI Integrations - Per-org integration configuration
export const helpaiIntegrations = pgTable("helpai_integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Relationship
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  registryId: varchar("registry_id").notNull().references(() => helpaiRegistry.id, { onDelete: 'cascade' }),
  
  // Integration Settings
  isEnabled: boolean("is_enabled").default(true),
  customEndpoint: varchar("custom_endpoint"), // Override default endpoint
  customConfig: jsonb("custom_config"), // Org-specific configuration
  
  // Sync Settings
  autoSyncEnabled: boolean("auto_sync_enabled").default(false),
  syncIntervalMinutes: integer("sync_interval_minutes").default(60),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: varchar("last_sync_status"), // 'success', 'error', 'pending'
  
  // Usage Tracking
  totalRequests: integer("total_requests").default(0),
  totalSuccessfulRequests: integer("total_successful_requests").default(0),
  totalFailedRequests: integer("total_failed_requests").default(0),
  
  // Admin fields
  configuredBy: varchar("configured_by").notNull().references(() => users.id, { onDelete: 'set null' }),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("helpai_integrations_workspace_idx").on(table.workspaceId),
  index("helpai_integrations_registry_idx").on(table.registryId),
  index("helpai_integrations_enabled_idx").on(table.isEnabled),
]);

export const insertHelpaiIntegrationSchema = createInsertSchema(helpaiIntegrations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertHelpaiIntegration = z.infer<typeof insertHelpaiIntegrationSchema>;
export type HelpaiIntegration = typeof helpaiIntegrations.$inferSelect;

// HelpAI Credentials - Encrypted API credentials per org
export const helpaiCredentials = pgTable("helpai_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Relationship
  integrationId: varchar("integration_id").notNull().references(() => helpaiIntegrations.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Encrypted Credentials
  credentialType: varchar("credential_type").notNull(), // 'api_key', 'oauth2', 'bearer', 'basic_auth'
  encryptedValue: text("encrypted_value").notNull(), // AES-256-GCM encrypted
  encryptionKeyId: varchar("encryption_key_id").notNull(), // Reference to encryption key
  
  // Metadata
  credentialName: varchar("credential_name"), // For display/reference
  expiresAt: timestamp("expires_at"), // For OAuth tokens
  isRevoked: boolean("is_revoked").default(false),
  
  // Audit Trail
  createdBy: varchar("created_by").notNull().references(() => users.id, { onDelete: 'set null' }),
  revokedBy: varchar("revoked_by").references(() => users.id, { onDelete: 'set null' }),
  revokedAt: timestamp("revoked_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("helpai_credentials_integration_idx").on(table.integrationId),
  index("helpai_credentials_workspace_idx").on(table.workspaceId),
  index("helpai_credentials_revoked_idx").on(table.isRevoked),
]);

export const insertHelpaiCredentialSchema = createInsertSchema(helpaiCredentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertHelpaiCredential = z.infer<typeof insertHelpaiCredentialSchema>;
export type HelpaiCredential = typeof helpaiCredentials.$inferSelect;

// HelpAI Audit Log - Comprehensive audit trail for all HelpAI operations
export const helpaiAuditLog = pgTable("helpai_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Context
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  integrationId: varchar("integration_id").references(() => helpaiIntegrations.id, { onDelete: 'set null' }),
  
  // Action Details
  action: varchar("action").notNull(), // 'api_call', 'config_update', 'credential_create', 'credential_revoke'
  apiName: varchar("api_name"),
  status: varchar("status").notNull(), // 'success', 'error', 'pending'
  
  // Request/Response Data
  requestPayload: jsonb("request_payload"), // Full request (sanitized if needed)
  responseStatus: integer("response_status"), // HTTP status
  responseMessage: text("response_message"), // Error or success message
  
  // Performance Metrics
  durationMs: integer("duration_ms"), // How long the API call took
  tokensUsed: integer("tokens_used"), // AI tokens if applicable
  
  // Security & Compliance
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  requestId: varchar("request_id"), // For tracing
  actionHash: varchar("action_hash"), // SHA-256 hash for AI action verification
  
  // Metadata
  metadata: jsonb("metadata"), // Additional contextual info
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("helpai_audit_workspace_idx").on(table.workspaceId),
  index("helpai_audit_action_idx").on(table.action),
  index("helpai_audit_status_idx").on(table.status),
  index("helpai_audit_created_idx").on(table.createdAt),
  index("helpai_audit_user_idx").on(table.userId),
]);

export const insertHelpaiAuditLogSchema = createInsertSchema(helpaiAuditLog).omit({
  id: true,
  createdAt: true,
});

export type InsertHelpaiAuditLog = z.infer<typeof insertHelpaiAuditLogSchema>;
export type HelpaiAuditLog = typeof helpaiAuditLog.$inferSelect;

// ============================================================================
// AI RESPONSE TRACKING SYSTEM - Phase 3: API Gaps
// ============================================================================

// AI Responses - Track all AI-generated responses for learning and improvement
export const aiResponses = pgTable("ai_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Source of the response
  sourceType: varchar("source_type").notNull(), // 'chat', 'suggestion', 'automation', 'faq_match', 'schedule_ai'
  sourceId: varchar("source_id"), // Reference ID (chatroom ID, automation job ID, etc.)

  // Response metadata
  model: varchar("model").notNull(), // 'gpt-4', 'gemini', 'claude', 'custom'
  feature: varchar("feature").notNull(), // 'schedule_smart_ai', 'helpai_bot', 'dispute_resolver', 'payment_optimizer'

  // Request/Response data
  userQuery: text("user_query").notNull(), // User's original question/request
  aiResponse: text("ai_response").notNull(), // AI's generated response
  responseTokens: integer("response_tokens"), // Tokens used in response
  totalTokens: integer("total_tokens"), // Total tokens for this interaction

  // Quality metrics
  confidenceScore: integer("confidence_score"), // 0-100 confidence in response
  relevanceScore: integer("relevance_score"), // 0-100 relevance to query

  // User feedback (for AI improvement)
  userRating: integer("user_rating"), // 1-5 stars (null if not rated)
  userFeedback: text("user_feedback"), // User's comments on the response
  wasHelpful: boolean("was_helpful"), // Simplified: yes/no
  ratedAt: timestamp("rated_at"), // When user provided feedback

  // Improvement tracking
  improvementSuggestions: text("improvement_suggestions"), // ML model suggestions for improvement
  correctionProvided: text("correction_provided"), // If user corrected the AI
  correctedAt: timestamp("corrected_at"),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("ai_responses_workspace_idx").on(table.workspaceId),
  index("ai_responses_source_idx").on(table.sourceType, table.sourceId),
  index("ai_responses_model_idx").on(table.model),
  index("ai_responses_feature_idx").on(table.feature),
  index("ai_responses_created_idx").on(table.createdAt),
  index("ai_responses_rating_idx").on(table.userRating),
]);

export const insertAiResponseSchema = createInsertSchema(aiResponses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiResponse = z.infer<typeof insertAiResponseSchema>;
export type AiResponse = typeof aiResponses.$inferSelect;

// AI Suggestions - Unified suggestions from all AI systems
export const aiSuggestions = pgTable("ai_suggestions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),

  // Source and context
  suggestionType: varchar("suggestion_type").notNull(), // 'schedule_optimization', 'cost_reduction', 'compliance_alert', 'employee_insight', 'payment_terms'
  sourceSystem: varchar("source_system").notNull(), // 'schedule_ai', 'analytics_ai', 'compliance_monitor', 'helpai'
  
  // Target entity
  targetType: varchar("target_type"), // 'shift', 'employee', 'client', 'invoice', 'organization'
  targetId: varchar("target_id"), // ID of the entity being targeted

  // Suggestion details
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  suggestedAction: text("suggested_action"), // Recommended action to take
  estimatedImpact: text("estimated_impact"), // Expected positive outcome

  // Priority and urgency
  priority: varchar("priority").default("normal"), // 'low', 'normal', 'high', 'urgent'
  confidenceScore: integer("confidence_score"), // 0-100 confidence
  
  // Metrics
  potentialSavings: decimal("potential_savings", { precision: 10, scale: 2 }), // Money that could be saved
  potentialRiskReduction: decimal("potential_risk_reduction", { precision: 5, scale: 2 }), // Risk reduction percentage
  estimatedTimeToImplement: integer("estimated_time_to_implement"), // Minutes
  
  // Action tracking
  status: varchar("status").default("pending"), // 'pending', 'accepted', 'rejected', 'implemented', 'archived'
  acceptedBy: varchar("accepted_by").references(() => users.id, { onDelete: 'set null' }),
  acceptedAt: timestamp("accepted_at"),
  rejectionReason: text("rejection_reason"), // Why was it rejected
  rejectedBy: varchar("rejected_by").references(() => users.id, { onDelete: 'set null' }),
  rejectedAt: timestamp("rejected_at"),
  implementedAt: timestamp("implemented_at"),

  // Expiry (suggestions may become stale)
  expiresAt: timestamp("expires_at"), // When suggestion is no longer valid

  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("ai_suggestions_workspace_idx").on(table.workspaceId),
  index("ai_suggestions_type_idx").on(table.suggestionType),
  index("ai_suggestions_status_idx").on(table.status),
  index("ai_suggestions_priority_idx").on(table.priority),
  index("ai_suggestions_created_idx").on(table.createdAt),
  index("ai_suggestions_target_idx").on(table.targetType, table.targetId),
]);

export const insertAiSuggestionSchema = createInsertSchema(aiSuggestions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiSuggestion = z.infer<typeof insertAiSuggestionSchema>;
export type AiSuggestion = typeof aiSuggestions.$inferSelect;

// ============================================================================
// ROOM ANALYTICS SYSTEM - Chat Room Activity Tracking & Metrics
// ============================================================================

// Room Analytics - Current snapshot of metrics per room
// Updated in real-time as events are emitted from ChatServerHub
export const roomAnalytics = pgTable("room_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Room identification
  roomType: varchar("room_type").notNull(), // 'support', 'work', 'meeting', 'org'
  conversationId: varchar("conversation_id").notNull(), // Reference to chatConversations.id
  roomName: varchar("room_name"), // Display name of the room
  
  // Message metrics
  totalMessages: integer("total_messages").default(0), // Cumulative message count
  messageCountToday: integer("message_count_today").default(0), // Messages posted today
  messageCountThisWeek: integer("message_count_this_week").default(0), // Messages this week
  
  // Participant activity
  totalParticipants: integer("total_participants").default(0), // Unique users who ever participated
  activeParticipantsNow: integer("active_participants_now").default(0), // Currently in room
  newParticipantsToday: integer("new_participants_today").default(0), // Joined today
  
  // Support metrics (for support rooms)
  ticketsCreated: integer("tickets_created").default(0), // Total support tickets
  ticketsResolved: integer("tickets_resolved").default(0), // Resolved tickets
  avgResolutionTimeHours: doublePrecision("avg_resolution_time_hours"), // Average time to resolve
  unresovledTickets: integer("unresolved_tickets").default(0), // Currently unresolved
  
  // AI metrics
  aiEscalationCount: integer("ai_escalation_count").default(0), // Times AI escalated to human
  aiEscalationRate: doublePrecision("ai_escalation_rate").default(0), // Percentage of interactions escalated
  aiResponseCount: integer("ai_response_count").default(0), // Times AI provided response
  
  // Sentiment analysis
  sentimentPositive: integer("sentiment_positive").default(0), // Positive sentiment messages
  sentimentNeutral: integer("sentiment_neutral").default(0), // Neutral sentiment messages
  sentimentNegative: integer("sentiment_negative").default(0), // Negative sentiment messages
  averageSentimentScore: doublePrecision("average_sentiment_score"), // -1 to 1 scale
  
  // Room status
  status: varchar("status").notNull(), // 'active', 'archived', 'closed'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("room_analytics_workspace_idx").on(table.workspaceId),
  index("room_analytics_conversation_idx").on(table.conversationId),
  index("room_analytics_type_idx").on(table.roomType),
  index("room_analytics_status_idx").on(table.status),
  index("room_analytics_updated_idx").on(table.updatedAt),
  uniqueIndex("room_analytics_conversation_unique").on(table.conversationId, table.workspaceId),
]);

export const insertRoomAnalyticsSchema = createInsertSchema(roomAnalytics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRoomAnalytics = z.infer<typeof insertRoomAnalyticsSchema>;
export type RoomAnalytics = typeof roomAnalytics.$inferSelect;

// Room Analytics Time Series - Hourly and daily aggregated data
// Allows querying historical trends and patterns
export const roomAnalyticsTimeseries = pgTable("room_analytics_timeseries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  conversationId: varchar("conversation_id").notNull(),
  
  // Time period
  period: varchar("period").notNull(), // 'hourly', 'daily'
  periodStart: timestamp("period_start").notNull(), // Start of hour/day (UTC)
  periodEnd: timestamp("period_end").notNull(), // End of hour/day (UTC)
  
  // Metrics for this period
  messageCount: integer("message_count").default(0), // Messages in this period
  participantCount: integer("participant_count").default(0), // Active participants
  newParticipants: integer("new_participants").default(0), // Newly joined
  
  // Support metrics for this period
  ticketsCreated: integer("tickets_created").default(0),
  ticketsResolved: integer("tickets_resolved").default(0),
  avgResolutionTimeHours: doublePrecision("avg_resolution_time_hours"),
  
  // AI metrics for this period
  aiResponses: integer("ai_responses").default(0),
  aiEscalations: integer("ai_escalations").default(0),
  
  // Sentiment for this period
  sentimentPositive: integer("sentiment_positive").default(0),
  sentimentNeutral: integer("sentiment_neutral").default(0),
  sentimentNegative: integer("sentiment_negative").default(0),
  averageSentimentScore: doublePrecision("average_sentiment_score"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("room_analytics_ts_workspace_idx").on(table.workspaceId),
  index("room_analytics_ts_conversation_idx").on(table.conversationId),
  index("room_analytics_ts_period_idx").on(table.period),
  index("room_analytics_ts_period_start_idx").on(table.periodStart),
  index("room_analytics_ts_conversation_period_idx").on(table.conversationId, table.period, table.periodStart),
]);

export const insertRoomAnalyticsTimeseriesSchema = createInsertSchema(roomAnalyticsTimeseries).omit({
  id: true,
  createdAt: true,
});

export type InsertRoomAnalyticsTimeseries = z.infer<typeof insertRoomAnalyticsTimeseriesSchema>;
export type RoomAnalyticsTimeseries = typeof roomAnalyticsTimeseries.$inferSelect;

// ============================================================================
// CALENDAR SUBSCRIPTIONS - Token-Based iCal Subscription URLs
// ============================================================================

export const calendarSubscriptions = pgTable("calendar_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").references(() => employees.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  
  // Unique subscription token (URL-safe, cryptographically secure)
  subscriptionToken: varchar("subscription_token").notNull().unique(),
  
  // Subscription type
  subscriptionType: varchar("subscription_type").notNull().default('shifts'), // 'shifts', 'timesheets', 'all'
  
  // Filter settings (what to include in the calendar)
  includeShifts: boolean("include_shifts").default(true),
  includeTimesheets: boolean("include_timesheets").default(false),
  includePendingShifts: boolean("include_pending_shifts").default(true),
  includeCancelledShifts: boolean("include_cancelled_shifts").default(false),
  
  // Date range settings
  daysBack: integer("days_back").default(30), // Include events from X days ago
  daysForward: integer("days_forward").default(90), // Include events up to X days in future
  
  // Refresh settings
  refreshIntervalMinutes: integer("refresh_interval_minutes").default(15), // How often external apps should refresh
  lastAccessedAt: timestamp("last_accessed_at"), // Track subscription usage
  accessCount: integer("access_count").default(0), // Total number of times accessed
  
  // Status
  isActive: boolean("is_active").default(true),
  expiresAt: timestamp("expires_at"), // Optional expiry date for security
  
  // Metadata
  name: varchar("name"), // User-friendly name like "My Work Schedule"
  createdByIp: varchar("created_by_ip"),
  lastAccessedFromIp: varchar("last_accessed_from_ip"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("calendar_subscriptions_workspace_idx").on(table.workspaceId),
  index("calendar_subscriptions_employee_idx").on(table.employeeId),
  index("calendar_subscriptions_user_idx").on(table.userId),
  index("calendar_subscriptions_token_idx").on(table.subscriptionToken),
  index("calendar_subscriptions_active_idx").on(table.isActive),
]);

export const insertCalendarSubscriptionSchema = createInsertSchema(calendarSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  accessCount: true,
  lastAccessedAt: true,
});

export type InsertCalendarSubscription = z.infer<typeof insertCalendarSubscriptionSchema>;
export type CalendarSubscription = typeof calendarSubscriptions.$inferSelect;

// ============================================================================
// CALENDAR IMPORTS - Track imported calendar events
// ============================================================================

export const calendarImports = pgTable("calendar_imports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Import source
  fileName: varchar("file_name"),
  fileSize: integer("file_size"),
  sourceType: varchar("source_type").notNull().default('file'), // 'file', 'google', 'outlook', 'apple'
  sourceUrl: text("source_url"), // For URL-based imports
  
  // Import results
  status: varchar("status").notNull().default('pending'), // 'pending', 'processing', 'completed', 'failed'
  totalEvents: integer("total_events").default(0), // Total events in the file
  eventsImported: integer("events_imported").default(0), // Successfully imported
  eventsSkipped: integer("events_skipped").default(0), // Skipped (duplicates, conflicts)
  eventsFailed: integer("events_failed").default(0), // Failed to import
  
  // Conflict handling
  conflictsDetected: integer("conflicts_detected").default(0), // Number of conflicts found
  conflictResolution: varchar("conflict_resolution").default('skip'), // 'skip', 'overwrite', 'merge', 'ask'
  
  // Error handling
  errorMessage: text("error_message"),
  errorDetails: jsonb("error_details"),
  
  // Processing times
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  
  // Imported data reference
  importedShiftIds: text("imported_shift_ids").array(), // Array of created shift IDs
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("calendar_imports_workspace_idx").on(table.workspaceId),
  index("calendar_imports_user_idx").on(table.userId),
  index("calendar_imports_status_idx").on(table.status),
  index("calendar_imports_created_idx").on(table.createdAt),
]);

export const insertCalendarImportSchema = createInsertSchema(calendarImports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCalendarImport = z.infer<typeof insertCalendarImportSchema>;
export type CalendarImport = typeof calendarImports.$inferSelect;

// ============================================================================
// LABOR LAW RULES - Break Scheduling Compliance by Jurisdiction
// ============================================================================

export const laborLawRules = pgTable("labor_law_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
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

export const insertLaborLawRuleSchema = createInsertSchema(laborLawRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLaborLawRule = z.infer<typeof insertLaborLawRuleSchema>;
export type LaborLawRule = typeof laborLawRules.$inferSelect;

// ============================================================================
// SCHEDULED BREAKS - Auto-scheduled breaks for shifts based on labor laws
// ============================================================================

export const scheduledBreaks = pgTable("scheduled_breaks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  shiftId: varchar("shift_id").references(() => shifts.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").references(() => employees.id, { onDelete: 'cascade' }),
  
  // Break Details
  breakType: breakTypeEnum("break_type").notNull().default('rest'), // 'meal' or 'rest'
  scheduledStart: timestamp("scheduled_start").notNull(),
  scheduledEnd: timestamp("scheduled_end").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  isPaid: boolean("is_paid").default(false),
  
  // Compliance Tracking
  laborLawRuleId: varchar("labor_law_rule_id").references(() => laborLawRules.id, { onDelete: 'set null' }),
  jurisdiction: varchar("jurisdiction"), // Cached for reference
  isRequired: boolean("is_required").default(true), // Required by law vs optional
  complianceStatus: varchar("compliance_status").default('scheduled'), // 'scheduled', 'taken', 'skipped', 'waived', 'late'
  
  // Actual Break Tracking
  actualStart: timestamp("actual_start"),
  actualEnd: timestamp("actual_end"),
  actualDurationMinutes: integer("actual_duration_minutes"),
  waiverSigned: boolean("waiver_signed").default(false),
  waiverSignedAt: timestamp("waiver_signed_at"),
  
  // AI Optimization
  aiOptimized: boolean("ai_optimized").default(false), // Was timing optimized by AI?
  coverageScore: decimal("coverage_score", { precision: 5, scale: 2 }), // How well coverage was maintained
  aiNotes: text("ai_notes"), // AI explanation for timing choice
  
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("scheduled_breaks_workspace_idx").on(table.workspaceId),
  index("scheduled_breaks_shift_idx").on(table.shiftId),
  index("scheduled_breaks_employee_idx").on(table.employeeId),
  index("scheduled_breaks_scheduled_start_idx").on(table.scheduledStart),
  index("scheduled_breaks_compliance_idx").on(table.complianceStatus),
]);

export const insertScheduledBreakSchema = createInsertSchema(scheduledBreaks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  scheduledStart: z.string().or(z.date()),
  scheduledEnd: z.string().or(z.date()),
});

export type InsertScheduledBreak = z.infer<typeof insertScheduledBreakSchema>;
export type ScheduledBreak = typeof scheduledBreaks.$inferSelect;

// ============================================================================  
// CALENDAR SYNC EVENTS - AI Brain Integration for calendar operations
// ============================================================================

export const calendarSyncEvents = pgTable("calendar_sync_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id),
  
  // Event type
  eventType: varchar("event_type").notNull(), // 'export', 'import', 'subscribe', 'unsubscribe', 'sync_error', 'conflict_detected'
  
  // Related entities
  subscriptionId: varchar("subscription_id").references(() => calendarSubscriptions.id, { onDelete: 'set null' }),
  importId: varchar("import_id").references(() => calendarImports.id, { onDelete: 'set null' }),
  
  // Event details
  description: text("description"),
  metadata: jsonb("metadata"), // Additional event-specific data
  
  // AI Brain tracking
  aiBrainProcessed: boolean("ai_brain_processed").default(false),
  aiBrainJobId: varchar("ai_brain_job_id"),
  aiSuggestions: jsonb("ai_suggestions"), // AI-generated suggestions based on event
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("calendar_sync_events_workspace_idx").on(table.workspaceId),
  index("calendar_sync_events_type_idx").on(table.eventType),
  index("calendar_sync_events_created_idx").on(table.createdAt),
]);

// ============================================================================
// REAL-TIME ALERTS SYSTEM - Configurable Alert System for Critical Events
// ============================================================================
// Alert Configurations - Per-workspace alert settings
export const alertConfigurations = pgTable("alert_configurations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Alert type and settings
  alertType: alertTypeEnum("alert_type").notNull(),
  isEnabled: boolean("is_enabled").default(true),
  
  // Threshold configuration (JSON for flexibility)
  thresholds: jsonb("thresholds").default('{}'), // e.g., { "hours": 10, "percentage": 80 }
  
  // Severity level for this alert type
  severity: alertSeverityEnum("severity").default('medium'),
  
  // Delivery channels (array of channels)
  channels: text("channels").array().default(sql`ARRAY['in_app']::text[]`),
  
  // Who receives alerts
  notifyRoles: text("notify_roles").array().default(sql`ARRAY['org_owner', 'org_admin']::text[]`),
  notifyUserIds: text("notify_user_ids").array(), // Specific user IDs (optional)
  
  // Rate limiting (prevent alert flooding)
  cooldownMinutes: integer("cooldown_minutes").default(60), // Minimum time between duplicate alerts
  maxAlertsPerHour: integer("max_alerts_per_hour").default(10), // Max alerts of this type per hour
  
  // Schedule restrictions
  alertSchedule: jsonb("alert_schedule").default('{}'), // e.g., { "daysOfWeek": [1,2,3,4,5], "startHour": 8, "endHour": 18 }
  
  // Custom message template (optional)
  customTitle: varchar("custom_title"),
  customMessage: text("custom_message"),
  
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("alert_configurations_workspace_idx").on(table.workspaceId),
  index("alert_configurations_type_idx").on(table.alertType),
  index("alert_configurations_enabled_idx").on(table.isEnabled),
  uniqueIndex("alert_configurations_workspace_type_unique").on(table.workspaceId, table.alertType),
]);

export const insertAlertConfigurationSchema = createInsertSchema(alertConfigurations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAlertConfiguration = z.infer<typeof insertAlertConfigurationSchema>;
export type AlertConfiguration = typeof alertConfigurations.$inferSelect;

// Alert History - Triggered alerts log
export const alertHistory = pgTable("alert_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  configurationId: varchar("configuration_id").references(() => alertConfigurations.id, { onDelete: 'set null' }),
  
  // Alert details
  alertType: alertTypeEnum("alert_type").notNull(),
  severity: alertSeverityEnum("severity").notNull(),
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  
  // Context data (what triggered the alert)
  triggerData: jsonb("trigger_data").default('{}'), // e.g., { "employeeId": "...", "hours": 12.5 }
  relatedEntityType: varchar("related_entity_type"), // 'employee', 'shift', 'invoice', etc.
  relatedEntityId: varchar("related_entity_id"),
  
  // Delivery tracking
  channelsNotified: text("channels_notified").array().default(sql`ARRAY[]::text[]`),
  deliveryStatus: jsonb("delivery_status").default('{}'), // { "in_app": "sent", "email": "pending", "sms": "failed" }
  
  // Acknowledgment tracking
  isAcknowledged: boolean("is_acknowledged").default(false),
  acknowledgedBy: varchar("acknowledged_by").references(() => users.id, { onDelete: 'set null' }),
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgmentNotes: text("acknowledgment_notes"),
  
  // Resolution tracking
  isResolved: boolean("is_resolved").default(false),
  resolvedBy: varchar("resolved_by").references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  
  // Metadata
  expiresAt: timestamp("expires_at"), // When alert is no longer relevant
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("alert_history_workspace_idx").on(table.workspaceId),
  index("alert_history_type_idx").on(table.alertType),
  index("alert_history_severity_idx").on(table.severity),
  index("alert_history_acknowledged_idx").on(table.isAcknowledged),
  index("alert_history_resolved_idx").on(table.isResolved),
  index("alert_history_created_idx").on(table.createdAt),
  index("alert_history_config_idx").on(table.configurationId),
]);

export const insertAlertHistorySchema = createInsertSchema(alertHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertAlertHistory = z.infer<typeof insertAlertHistorySchema>;
export type AlertHistory = typeof alertHistory.$inferSelect;

// Alert Rate Limiting - Track alert frequency to prevent flooding
export const alertRateLimits = pgTable("alert_rate_limits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  alertType: alertTypeEnum("alert_type").notNull(),
  
  // Unique key for deduplication (e.g., "overtime:employee:123")
  deduplicationKey: varchar("deduplication_key").notNull(),
  
  // Rate tracking
  lastTriggeredAt: timestamp("last_triggered_at").notNull(),
  triggerCount: integer("trigger_count").default(1),
  
  // Window tracking
  windowStart: timestamp("window_start").notNull(),
  windowAlertCount: integer("window_alert_count").default(1),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("alert_rate_limits_workspace_idx").on(table.workspaceId),
  index("alert_rate_limits_type_idx").on(table.alertType),
  index("alert_rate_limits_dedup_idx").on(table.deduplicationKey),
  uniqueIndex("alert_rate_limits_workspace_type_key_unique").on(table.workspaceId, table.alertType, table.deduplicationKey),
]);

// ============================================================================
// USER FEEDBACK PORTAL - Feature Requests, Bug Reports, and Suggestions
// ============================================================================

export const feedbackTypeEnum = pgEnum('feedback_type', [
  'bug',
  'feature_request',
  'improvement',
  'general'
]);

export const feedbackPriorityEnum = pgEnum('feedback_priority', [
  'low',
  'medium',
  'high'
]);

export const feedbackStatusEnum = pgEnum('feedback_status', [
  'new',
  'under_review',
  'planned',
  'in_progress',
  'completed',
  'closed'
]);

export const userFeedback = pgTable("user_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  type: feedbackTypeEnum("type").notNull().default('general'),
  priority: feedbackPriorityEnum("priority").notNull().default('medium'),
  status: feedbackStatusEnum("status").notNull().default('new'),
  
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  
  upvoteCount: integer("upvote_count").default(0),
  downvoteCount: integer("downvote_count").default(0),
  commentCount: integer("comment_count").default(0),
  
  statusUpdatedBy: varchar("status_updated_by").references(() => users.id, { onDelete: 'set null' }),
  statusUpdatedAt: timestamp("status_updated_at"),
  statusNote: text("status_note"),
  
  adminResponse: text("admin_response"),
  adminRespondedBy: varchar("admin_responded_by").references(() => users.id, { onDelete: 'set null' }),
  adminRespondedAt: timestamp("admin_responded_at"),
  
  isPublic: boolean("is_public").default(true),
  isPinned: boolean("is_pinned").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("user_feedback_workspace_idx").on(table.workspaceId),
  index("user_feedback_user_idx").on(table.userId),
  index("user_feedback_type_idx").on(table.type),
  index("user_feedback_status_idx").on(table.status),
  index("user_feedback_priority_idx").on(table.priority),
  index("user_feedback_created_idx").on(table.createdAt),
  index("user_feedback_upvote_idx").on(table.upvoteCount),
]);

export const insertUserFeedbackSchema = createInsertSchema(userFeedback).omit({
  id: true,
  upvoteCount: true,
  downvoteCount: true,
  commentCount: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserFeedback = z.infer<typeof insertUserFeedbackSchema>;
export type UserFeedback = typeof userFeedback.$inferSelect;

export const feedbackComments = pgTable("feedback_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  feedbackId: varchar("feedback_id").notNull().references(() => userFeedback.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentId: varchar("parent_id").references((): any => feedbackComments.id, { onDelete: 'cascade' }),
  
  content: text("content").notNull(),
  isFromAdmin: boolean("is_from_admin").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("feedback_comments_feedback_idx").on(table.feedbackId),
  index("feedback_comments_user_idx").on(table.userId),
  index("feedback_comments_parent_idx").on(table.parentId),
  index("feedback_comments_created_idx").on(table.createdAt),
]);

export const insertFeedbackCommentSchema = createInsertSchema(feedbackComments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFeedbackComment = z.infer<typeof insertFeedbackCommentSchema>;
export type FeedbackComment = typeof feedbackComments.$inferSelect;

export const feedbackVotes = pgTable("feedback_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  feedbackId: varchar("feedback_id").notNull().references(() => userFeedback.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  voteType: varchar("vote_type").notNull(), // 'up' or 'down'
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("feedback_votes_feedback_idx").on(table.feedbackId),
  index("feedback_votes_user_idx").on(table.userId),
  uniqueIndex("feedback_votes_unique").on(table.feedbackId, table.userId),
]);

export const insertFeedbackVoteSchema = createInsertSchema(feedbackVotes).omit({
  id: true,
  createdAt: true,
});

export type InsertFeedbackVote = z.infer<typeof insertFeedbackVoteSchema>;
export type FeedbackVote = typeof feedbackVotes.$inferSelect;

// ============================================================================
// AI BRAIN CODE EDITOR - STAGED CODE CHANGES
// ============================================================================

// Status enum for code change requests
export const codeChangeStatusEnum = pgEnum('code_change_status', [
  'pending',      // Awaiting review
  'approved',     // Approved, ready to apply
  'rejected',     // Rejected by reviewer
  'applied',      // Successfully applied to codebase
  'failed',       // Failed to apply
  'expired',      // Expired without action
]);

// Change type enum
export const codeChangeTypeEnum = pgEnum('code_change_type', [
  'create',       // Create new file
  'modify',       // Modify existing file
  'delete',       // Delete file
  'rename',       // Rename file
]);

// Staged code changes table - AI Brain code edits awaiting approval
export const stagedCodeChanges = pgTable("staged_code_changes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Change request details
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  changeType: codeChangeTypeEnum("change_type").notNull(),
  
  // File details
  filePath: varchar("file_path", { length: 500 }).notNull(),
  originalContent: text("original_content"), // Content before change (for modify/delete)
  proposedContent: text("proposed_content"), // New content (for create/modify)
  diffPatch: text("diff_patch"), // Unified diff format
  
  // For rename operations
  newFilePath: varchar("new_file_path", { length: 500 }),
  
  // Request context
  requestedBy: varchar("requested_by").notNull(), // 'ai-brain', 'helpai', support user ID
  requestReason: text("request_reason"), // Why this change was requested
  conversationId: varchar("conversation_id"), // Chat conversation that triggered this
  ticketId: varchar("ticket_id"), // Support ticket if applicable
  
  // Approval workflow
  status: codeChangeStatusEnum("status").notNull().default('pending'),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"), // Reviewer's comments
  
  // Rollback support
  appliedAt: timestamp("applied_at"),
  appliedBy: varchar("applied_by").references(() => users.id),
  rollbackAvailable: boolean("rollback_available").default(true),
  
  // What's New integration
  whatsNewSent: boolean("whats_new_sent").default(false),
  whatsNewId: varchar("whats_new_id").references(() => platformUpdates.id),
  
  // Priority and categorization
  priority: integer("priority").default(2), // 1=critical, 2=normal, 3=low
  category: varchar("category", { length: 100 }), // e.g., 'bugfix', 'feature', 'enhancement'
  affectedModule: varchar("affected_module", { length: 100 }), // e.g., 'scheduling', 'payroll', 'chat'
  
  // Metadata
  metadata: jsonb("metadata"),
  
  // Expiry
  expiresAt: timestamp("expires_at"), // Auto-expire if not reviewed
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("staged_code_changes_status_idx").on(table.status),
  index("staged_code_changes_requested_by_idx").on(table.requestedBy),
  index("staged_code_changes_file_path_idx").on(table.filePath),
  index("staged_code_changes_created_idx").on(table.createdAt),
  index("staged_code_changes_priority_idx").on(table.priority),
  index("staged_code_changes_expires_idx").on(table.expiresAt),
]);

export const insertStagedCodeChangeSchema = createInsertSchema(stagedCodeChanges).omit({
  id: true,
  reviewedAt: true,
  appliedAt: true,
  whatsNewSent: true,
  whatsNewId: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertStagedCodeChange = z.infer<typeof insertStagedCodeChangeSchema>;
export type StagedCodeChange = typeof stagedCodeChanges.$inferSelect;

// Batch change requests - group multiple file changes together
export const codeChangeBatches = pgTable("code_change_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Batch details
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  
  // Request context
  requestedBy: varchar("requested_by").notNull(),
  conversationId: varchar("conversation_id"),
  
  // Approval workflow
  status: codeChangeStatusEnum("status").notNull().default('pending'),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  
  // Stats
  totalChanges: integer("total_changes").default(0),
  approvedChanges: integer("approved_changes").default(0),
  rejectedChanges: integer("rejected_changes").default(0),
  
  // What's New
  whatsNewTitle: varchar("whats_new_title", { length: 255 }),
  whatsNewDescription: text("whats_new_description"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("code_change_batches_status_idx").on(table.status),
  index("code_change_batches_requested_by_idx").on(table.requestedBy),
  index("code_change_batches_created_idx").on(table.createdAt),
]);

export const insertCodeChangeBatchSchema = createInsertSchema(codeChangeBatches).omit({
  id: true,
  reviewedAt: true,
  totalChanges: true,
  approvedChanges: true,
  rejectedChanges: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCodeChangeBatch = z.infer<typeof insertCodeChangeBatchSchema>;
export type CodeChangeBatch = typeof codeChangeBatches.$inferSelect;

// Link table for batch -> individual changes
export const batchCodeChangeLinks = pgTable("batch_code_change_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchId: varchar("batch_id").notNull().references(() => codeChangeBatches.id, { onDelete: 'cascade' }),
  changeId: varchar("change_id").notNull().references(() => stagedCodeChanges.id, { onDelete: 'cascade' }),
  order: integer("order").default(0), // Order of changes within batch
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("batch_code_change_links_batch_idx").on(table.batchId),
  index("batch_code_change_links_change_idx").on(table.changeId),
  uniqueIndex("batch_code_change_links_unique").on(table.batchId, table.changeId),
]);

export type BatchCodeChangeLink = typeof batchCodeChangeLinks.$inferSelect;

// ============================================================================
// AI BRAIN PLATFORM CHANGE MONITOR
// Autonomous detection and notification of platform updates
// ============================================================================

// Platform scan status enum
export const platformScanStatusEnum = pgEnum("platform_scan_status", [
  'running',
  'completed', 
  'failed'
]);

// Change severity enum
export const changeSeverityEnum = pgEnum("change_severity", [
  'critical',   // Breaking changes, security fixes
  'major',      // New features, significant improvements
  'minor',      // Bug fixes, small enhancements
  'patch',      // Hotfixes, typo corrections
  'info'        // Informational updates
]);

// Change source type enum - Who/what initiated the change
export const changeSourceTypeEnum = pgEnum("change_source_type", [
  'system',           // Platform system process
  'ai_brain',         // AI Brain automation
  'support_staff',    // Human support staff
  'developer',        // Developer/engineering team
  'automated_job',    // Scheduled automation job
  'user_request',     // User-initiated feature request
  'external_service'  // Third-party integration
]);

// Detailed change category enum
export const changeDetailedCategoryEnum = pgEnum("change_detailed_category", [
  'feature',          // New feature added
  'service',          // Service modification
  'bot_automation',   // AI/bot automation changes
  'bugfix',           // Bug fix - something was broken
  'security',         // Security update
  'improvement',      // Enhancement to existing feature
  'deprecation',      // Feature removal or deprecation
  'hotpatch',         // Urgent fix
  'integration',      // Third-party integration change
  'ui_update',        // Frontend/UI change
  'backend_update',   // Backend/API change
  'performance',      // Performance optimization
  'documentation'     // Documentation update
]);

// Platform scan snapshots - stores point-in-time platform state
export const platformScanSnapshots = pgTable("platform_scan_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Scan metadata
  scanType: varchar("scan_type", { length: 50 }).notNull(), // 'full', 'quick', 'health', 'scheduled'
  status: platformScanStatusEnum("status").notNull().default('running'),
  
  // Platform state fingerprint
  codebaseHash: varchar("codebase_hash", { length: 64 }), // SHA-256 of key files
  schemaVersion: varchar("schema_version", { length: 50 }),
  serviceCount: integer("service_count"),
  routeCount: integer("route_count"),
  
  // Health snapshot
  healthStatus: jsonb("health_status"), // Snapshot of all service health
  
  // Scan results
  changesDetected: integer("changes_detected").default(0),
  errorCount: integer("error_count").default(0),
  
  // Timing
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  
  // Raw data for comparison
  snapshotData: jsonb("snapshot_data"), // Full snapshot for diff comparison
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("platform_scan_snapshots_status_idx").on(table.status),
  index("platform_scan_snapshots_type_idx").on(table.scanType),
  index("platform_scan_snapshots_created_idx").on(table.createdAt),
]);

export const insertPlatformScanSnapshotSchema = createInsertSchema(platformScanSnapshots).omit({
  id: true,
  completedAt: true,
  durationMs: true,
  createdAt: true,
});

export type InsertPlatformScanSnapshot = z.infer<typeof insertPlatformScanSnapshotSchema>;
export type PlatformScanSnapshot = typeof platformScanSnapshots.$inferSelect;

// Platform change events - AI-summarized changes with notifications
export const platformChangeEvents = pgTable("platform_change_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Link to scan that detected this
  scanId: varchar("scan_id").references(() => platformScanSnapshots.id),
  
  // Change details
  changeType: varchar("change_type", { length: 100 }).notNull(), // 'feature_added', 'bug_fixed', 'hotpatch', 'enhancement', 'security_fix'
  severity: changeSeverityEnum("severity").notNull().default('info'),
  
  // ENHANCED: Detailed category for better organization
  detailedCategory: changeDetailedCategoryEnum("detailed_category").default('improvement'),
  
  // ENHANCED: Source attribution - WHO made this change
  sourceType: changeSourceTypeEnum("source_type").default('system'),
  sourceName: varchar("source_name", { length: 100 }), // e.g., "Billing Automation", "HelpAI", "John Smith"
  sourceUserId: varchar("source_user_id").references(() => users.id), // If human-initiated
  
  // AI-generated content (Gemini summaries)
  title: varchar("title", { length: 255 }).notNull(),
  summary: text("summary").notNull(), // AI-generated user-friendly summary
  technicalDetails: text("technical_details"), // Technical description for support staff
  
  // ENHANCED: End-user friendly summary (plain English, non-technical)
  endUserSummary: text("end_user_summary"), // Simple explanation for non-technical users
  
  // ENHANCED: What was broken (for bugfixes)
  brokenDescription: text("broken_description"), // What issue this fixes, for bugfix category
  impactDescription: text("impact_description"), // Who/what was affected
  
  // Affected areas
  affectedModules: jsonb("affected_modules"), // ['scheduling', 'payroll', 'chat']
  affectedFiles: jsonb("affected_files"), // File paths that changed
  
  // Status indicators
  platformStatus: varchar("platform_status", { length: 50 }).notNull().default('operational'), // 'operational', 'degraded', 'investigating', 'resolved'
  requiresAction: boolean("requires_action").default(false), // If users need to do something
  actionRequired: text("action_required"), // What users need to do
  
  // Notification tracking
  notifiedAllUsers: boolean("notified_all_users").default(false),
  notificationSentAt: timestamp("notification_sent_at"),
  notificationCount: integer("notification_count").default(0), // How many users were notified
  
  // ENHANCED: Real-time broadcast tracking
  broadcastedViaWebSocket: boolean("broadcasted_via_websocket").default(false),
  broadcastedAt: timestamp("broadcasted_at"),
  
  // What's New integration
  whatsNewId: varchar("whats_new_id").references(() => platformUpdates.id),
  
  // ENHANCED: Version info
  versionFrom: varchar("version_from", { length: 50 }), // Previous version
  versionTo: varchar("version_to", { length: 50 }), // New version after change
  
  // Metadata
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("platform_change_events_scan_idx").on(table.scanId),
  index("platform_change_events_type_idx").on(table.changeType),
  index("platform_change_events_severity_idx").on(table.severity),
  index("platform_change_events_status_idx").on(table.platformStatus),
  index("platform_change_events_notified_idx").on(table.notifiedAllUsers),
  index("platform_change_events_created_idx").on(table.createdAt),
  index("platform_change_events_category_idx").on(table.detailedCategory),
  index("platform_change_events_source_idx").on(table.sourceType),
]);

export const insertPlatformChangeEventSchema = createInsertSchema(platformChangeEvents).omit({
  id: true,
  notificationSentAt: true,
  broadcastedAt: true,
  notificationCount: true,
  whatsNewId: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPlatformChangeEvent = z.infer<typeof insertPlatformChangeEventSchema>;
export type PlatformChangeEvent = typeof platformChangeEvents.$inferSelect;

// ============================================================================
// ADVANCED USAGE ANALYTICS - Business Owner Dashboard
// ============================================================================

// Feature usage events - tracks UI interactions and feature adoption
export const featureUsageEvents = pgTable("feature_usage_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  featureKey: varchar("feature_key", { length: 100 }).notNull(),
  featureCategory: varchar("feature_category", { length: 50 }).notNull(),
  actionType: varchar("action_type", { length: 50 }).notNull(),
  
  pageRoute: varchar("page_route", { length: 255 }),
  componentName: varchar("component_name", { length: 100 }),
  
  durationMs: integer("duration_ms"),
  clickCount: integer("click_count").default(1),
  
  sessionId: varchar("session_id", { length: 100 }),
  deviceType: varchar("device_type", { length: 20 }),
  
  relatedEntityType: varchar("related_entity_type", { length: 50 }),
  relatedEntityId: varchar("related_entity_id"),
  
  metadata: jsonb("metadata"),
  
  ingestedAt: timestamp("ingested_at").defaultNow(),
}, (table) => [
  index("feature_usage_workspace_idx").on(table.workspaceId),
  index("feature_usage_user_idx").on(table.userId),
  index("feature_usage_feature_idx").on(table.featureKey),
  index("feature_usage_category_idx").on(table.featureCategory),
  index("feature_usage_action_idx").on(table.actionType),
  index("feature_usage_ingested_idx").on(table.ingestedAt),
  index("feature_usage_session_idx").on(table.sessionId),
]);

export const insertFeatureUsageEventSchema = createInsertSchema(featureUsageEvents).omit({
  id: true,
  ingestedAt: true,
});

export type InsertFeatureUsageEvent = z.infer<typeof insertFeatureUsageEventSchema>;
export type FeatureUsageEvent = typeof featureUsageEvents.$inferSelect;

// API usage events - tracks backend API calls and partner integrations
export const apiUsageEvents = pgTable("api_usage_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  
  endpoint: varchar("endpoint", { length: 255 }).notNull(),
  method: varchar("method", { length: 10 }).notNull(),
  statusCode: integer("status_code"),
  
  apiType: varchar("api_type", { length: 50 }).notNull(),
  partnerName: varchar("partner_name", { length: 50 }),
  
  requestDurationMs: integer("request_duration_ms"),
  responseSize: integer("response_size"),
  
  isAutomated: boolean("is_automated").default(false),
  automationJobId: varchar("automation_job_id"),
  
  errorMessage: text("error_message"),
  
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 6 }),
  
  metadata: jsonb("metadata"),
  
  ingestedAt: timestamp("ingested_at").defaultNow(),
}, (table) => [
  index("api_usage_workspace_idx").on(table.workspaceId),
  index("api_usage_user_idx").on(table.userId),
  index("api_usage_endpoint_idx").on(table.endpoint),
  index("api_usage_api_type_idx").on(table.apiType),
  index("api_usage_partner_idx").on(table.partnerName),
  index("api_usage_ingested_idx").on(table.ingestedAt),
  index("api_usage_automated_idx").on(table.isAutomated),
]);

export const insertApiUsageEventSchema = createInsertSchema(apiUsageEvents).omit({
  id: true,
  ingestedAt: true,
});

export type InsertApiUsageEvent = z.infer<typeof insertApiUsageEventSchema>;
export type ApiUsageEvent = typeof apiUsageEvents.$inferSelect;

// Usage aggregates - pre-computed daily summaries for fast dashboard queries
export const usageAggregates = pgTable("usage_aggregates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
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
}, (table) => [
  index("usage_agg_workspace_idx").on(table.workspaceId),
  index("usage_agg_date_idx").on(table.aggregateDate),
  index("usage_agg_period_idx").on(table.aggregatePeriod),
  index("usage_agg_workspace_date_idx").on(table.workspaceId, table.aggregateDate),
]);

export const insertUsageAggregateSchema = createInsertSchema(usageAggregates).omit({
  id: true,
  computedAt: true,
});

export type InsertUsageAggregate = z.infer<typeof insertUsageAggregateSchema>;
export type UsageAggregate = typeof usageAggregates.$inferSelect;

// ============================================================================
// TRINITY MASCOT HOLIDAY DECORATION SYSTEM
// AI Brain orchestrated motion patterns and holiday decorations
// ============================================================================

// Motion pattern types for Trinity stars
export const motionPatternTypeEnum = pgEnum('motion_pattern_type', [
  'TRIAD_SYNCHRONIZED',    // All 3 stars rotate together in formation
  'DUAL_COUNTER_ROTATION', // Two stars orbit opposite directions
  'CENTRAL_ORBIT',         // Two stars orbit around the third
  'INDIVIDUAL_NOISE',      // Each star moves independently with noise
  'SEQUENCE_SCRIPTED',     // Choreographed sequence of movements
]);

// Mascot motion profiles - defines unique movement patterns for Trinity stars
export const mascotMotionProfiles = pgTable("mascot_motion_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Profile identification
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  
  // Motion pattern configuration (JSONB)
  patternType: text("pattern_type").notNull(), // 'TRIAD_SYNCHRONIZED' | etc
  starMotion: jsonb("star_motion").notNull(), // Per-star motion params
  /*
    starMotion: {
      co: { angularVelocity: 0.02, orbitRadius: 0.6, phaseOffset: 0, noiseAmp: 0 },
      ai: { angularVelocity: 0.02, orbitRadius: 0.6, phaseOffset: 2.094, noiseAmp: 0 },
      nx: { angularVelocity: 0.02, orbitRadius: 0.6, phaseOffset: 4.188, noiseAmp: 0 }
    }
  */
  
  // Physics adjustments
  physicsOverrides: jsonb("physics_overrides"), // Spring/dampen overrides
  /*
    physicsOverrides: {
      springStrength: 0.065,
      dampening: 0.88,
      repulsionStrength: 2.2
    }
  */
  
  // Randomness configuration
  randomSeed: integer("random_seed"),
  noiseConfig: jsonb("noise_config"), // Perlin/simplex noise params
  
  // Easing and timing
  easingCurve: varchar("easing_curve", { length: 50 }).default('easeInOutCubic'),
  cycleDuration: integer("cycle_duration_ms").default(5000), // Full cycle time
  
  // Metadata
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("motion_profile_name_idx").on(table.name),
  index("motion_profile_active_idx").on(table.isActive),
]);

export const insertMascotMotionProfileSchema = createInsertSchema(mascotMotionProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMascotMotionProfile = z.infer<typeof insertMascotMotionProfileSchema>;
export type MascotMotionProfile = typeof mascotMotionProfiles.$inferSelect;

// Holiday mascot decorations - per-holiday visual attachments for Trinity stars
export const holidayMascotDecor = pgTable("holiday_mascot_decor", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Holiday identification
  holidayKey: varchar("holiday_key", { length: 50 }).notNull(), // 'christmas', 'halloween', etc
  holidayName: varchar("holiday_name", { length: 100 }).notNull(),
  
  // Motion profile link
  motionProfileId: varchar("motion_profile_id").references(() => mascotMotionProfiles.id, { onDelete: 'set null' }),
  
  // Per-star decorations (JSONB)
  starDecorations: jsonb("star_decorations").notNull(),
  /*
    starDecorations: {
      co: { 
        attachments: ['led_wrap', 'santa_hat'],
        glowPalette: ['#ff0000', '#00ff00', '#ffffff'],
        ledCount: 8, 
        ledSpacing: 0.15,
        ledSpeed: 0.5
      },
      ai: { attachments: ['led_wrap', 'ornament'], ... },
      nx: { attachments: ['led_wrap', 'star_topper'], ... }
    }
  */
  
  // Global decoration settings
  globalGlowIntensity: doublePrecision("global_glow_intensity").default(1.0),
  particleEffects: jsonb("particle_effects"), // Sparkles, snow, etc
  ambientColors: text("ambient_colors").array(), // Holiday color palette
  
  // Priority for multiple active holidays
  priority: integer("priority").default(0),
  
  // Date range for automatic activation
  startMonth: integer("start_month"),
  startDay: integer("start_day"),
  endMonth: integer("end_month"),
  endDay: integer("end_day"),
  
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("holiday_decor_key_idx").on(table.holidayKey),
  index("holiday_decor_active_idx").on(table.isActive),
  index("holiday_decor_priority_idx").on(table.priority),
]);

export const insertHolidayMascotDecorSchema = createInsertSchema(holidayMascotDecor).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertHolidayMascotDecor = z.infer<typeof insertHolidayMascotDecorSchema>;
export type HolidayMascotDecor = typeof holidayMascotDecor.$inferSelect;

// Holiday mascot directive history - audit trail of AI Brain decisions
export const holidayMascotHistory = pgTable("holiday_mascot_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Reference to what was activated
  holidayDecorId: varchar("holiday_decor_id").references(() => holidayMascotDecor.id, { onDelete: 'set null' }),
  motionProfileId: varchar("motion_profile_id").references(() => mascotMotionProfiles.id, { onDelete: 'set null' }),
  
  // Action tracking
  action: varchar("action", { length: 50 }).notNull(), // 'activate', 'deactivate', 'switch', 'modify'
  triggeredBy: varchar("triggered_by", { length: 50 }).notNull(), // 'ai_brain', 'orchestrator', 'manual', 'schedule'
  
  // Snapshot of directive at time of activation
  directiveSnapshot: jsonb("directive_snapshot").notNull(),
  /*
    directiveSnapshot: {
      motionPattern: 'TRIAD_SYNCHRONIZED',
      decorations: { ... },
      timestamp: '2025-12-02T...'
    }
  */
  
  // AI Brain metadata
  aiBrainSessionId: varchar("ai_brain_session_id"),
  reasoning: text("reasoning"), // AI's explanation for the choice
  
  // Duration tracking
  activatedAt: timestamp("activated_at").defaultNow(),
  deactivatedAt: timestamp("deactivated_at"),
  
  // Analytics
  userReactions: jsonb("user_reactions"), // Aggregated user feedback
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("holiday_history_decor_idx").on(table.holidayDecorId),
  index("holiday_history_profile_idx").on(table.motionProfileId),
  index("holiday_history_action_idx").on(table.action),
  index("holiday_history_activated_idx").on(table.activatedAt),
]);

export const insertHolidayMascotHistorySchema = createInsertSchema(holidayMascotHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertHolidayMascotHistory = z.infer<typeof insertHolidayMascotHistorySchema>;
export type HolidayMascotHistory = typeof holidayMascotHistory.$inferSelect;

// ============================================================================
// MASCOT SESSIONS & INTERACTIONS - Per-org persistent mascot data
// ============================================================================

// Mascot sessions - tracks unique per-org mascot interaction sessions
export const mascotSessions = pgTable("mascot_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Multi-tenant scope
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  
  // Session lifecycle
  sessionKey: varchar("session_key", { length: 100 }).notNull(), // Unique key per org session
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  isActive: boolean("is_active").default(true),
  
  // Mascot state snapshot
  motionProfile: varchar("motion_profile", { length: 50 }),
  positionX: integer("position_x"),
  positionY: integer("position_y"),
  
  // Context tracking
  contextSnapshot: jsonb("context_snapshot"), // { page, userActions, recentMessages }
  
  // Statistics
  totalInteractions: integer("total_interactions").default(0),
  totalThoughts: integer("total_thoughts").default(0),
  totalAdvice: integer("total_advice").default(0),
  totalTasksGenerated: integer("total_tasks_generated").default(0),
  
  // Metadata
  userAgent: text("user_agent"),
  screenWidth: integer("screen_width"),
  screenHeight: integer("screen_height"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("mascot_sessions_workspace_idx").on(table.workspaceId),
  index("mascot_sessions_user_idx").on(table.userId),
  index("mascot_sessions_active_idx").on(table.isActive),
  index("mascot_sessions_key_idx").on(table.sessionKey),
  index("mascot_sessions_started_idx").on(table.startedAt),
]);

export const insertMascotSessionSchema = createInsertSchema(mascotSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMascotSession = z.infer<typeof insertMascotSessionSchema>;
export type MascotSession = typeof mascotSessions.$inferSelect;

// Mascot interactions - logs all user interactions with the mascot
export const mascotInteractions = pgTable("mascot_interactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Session and org context
  sessionId: varchar("session_id").notNull().references(() => mascotSessions.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  
  // Interaction details
  source: varchar("source", { length: 50 }).notNull(), // 'user', 'chat', 'navigation', 'click', 'scroll', 'idle'
  interactionType: varchar("interaction_type", { length: 50 }).notNull(), // 'ask', 'observe', 'react', 'advise', 'task_create'
  
  // Payload - what triggered the interaction
  payload: jsonb("payload"), // { question, chatMessage, clickTarget, pageUrl, etc }
  
  // AI response data
  aiResponse: text("ai_response"),
  aiResponseType: varchar("ai_response_type", { length: 50 }), // 'thought', 'advice', 'task', 'reaction'
  aiTokensUsed: integer("ai_tokens_used"),
  
  // Position at interaction time
  mascotPositionX: integer("mascot_position_x"),
  mascotPositionY: integer("mascot_position_y"),
  
  // Timing
  processingTimeMs: integer("processing_time_ms"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("mascot_interactions_session_idx").on(table.sessionId),
  index("mascot_interactions_workspace_idx").on(table.workspaceId),
  index("mascot_interactions_user_idx").on(table.userId),
  index("mascot_interactions_source_idx").on(table.source),
  index("mascot_interactions_type_idx").on(table.interactionType),
  index("mascot_interactions_created_idx").on(table.createdAt),
]);

export const insertMascotInteractionSchema = createInsertSchema(mascotInteractions).omit({
  id: true,
  createdAt: true,
});

export type InsertMascotInteraction = z.infer<typeof insertMascotInteractionSchema>;
export type MascotInteraction = typeof mascotInteractions.$inferSelect;

// Mascot tasks - AI-generated task lists for users
export const mascotTasks = pgTable("mascot_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Session and org context
  sessionId: varchar("session_id").notNull().references(() => mascotSessions.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  
  // Task details
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }), // 'setup', 'optimization', 'engagement', 'compliance', etc
  priority: varchar("priority", { length: 20 }).default('medium'), // 'low', 'medium', 'high', 'urgent'
  
  // Status tracking
  status: varchar("status", { length: 20 }).default('pending'), // 'pending', 'in_progress', 'completed', 'dismissed'
  completedAt: timestamp("completed_at"),
  
  // AI generation context
  generatedFromInteractionId: varchar("generated_from_interaction_id").references(() => mascotInteractions.id, { onDelete: 'set null' }),
  aiReasoning: text("ai_reasoning"), // Why this task was suggested
  
  // Action link
  actionUrl: text("action_url"),
  actionLabel: varchar("action_label", { length: 50 }),
  
  // Ordering
  sortOrder: integer("sort_order").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("mascot_tasks_session_idx").on(table.sessionId),
  index("mascot_tasks_workspace_idx").on(table.workspaceId),
  index("mascot_tasks_user_idx").on(table.userId),
  index("mascot_tasks_status_idx").on(table.status),
  index("mascot_tasks_priority_idx").on(table.priority),
]);

export const insertMascotTaskSchema = createInsertSchema(mascotTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMascotTask = z.infer<typeof insertMascotTaskSchema>;
export type MascotTask = typeof mascotTasks.$inferSelect;

// ============================================================================
// AI BRAIN ORCHESTRATION SYSTEM - Workflow Tracking & Commitment Management
// ============================================================================

// Orchestration runs - tracks all AI Brain workflow executions
export const orchestrationRuns = pgTable("orchestration_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Context
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  
  // Workflow identification
  actionId: varchar("action_id", { length: 100 }).notNull(), // e.g., 'scheduling.generate_ai_schedule'
  category: varchar("category", { length: 50 }).notNull(), // e.g., 'scheduling', 'payroll', 'compliance'
  source: varchar("source", { length: 50 }).notNull(), // 'helpai', 'trinity', 'automation', 'api', 'scheduler'
  
  // Status tracking (matches task status for consistency)
  status: varchar("status", { length: 30 }).default('queued').notNull(), 
  // 'queued', 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled', 'rolled_back'
  
  // Input/Output
  inputParams: jsonb("input_params"),
  outputResult: jsonb("output_result"),
  errorMessage: text("error_message"),
  errorStack: text("error_stack"),
  
  // SLA tracking
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  slaThresholdMs: integer("sla_threshold_ms").default(30000), // 30 second default SLA
  slaMet: boolean("sla_met"),
  
  // Retry/recovery
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  parentRunId: varchar("parent_run_id"), // For chained workflows
  
  // Commitment tracking
  commitmentId: varchar("commitment_id"), // Links to commitmentLedger
  requiresApproval: boolean("requires_approval").default(false),
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp("approved_at"),
  
  // Audit
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("orchestration_runs_workspace_idx").on(table.workspaceId),
  index("orchestration_runs_user_idx").on(table.userId),
  index("orchestration_runs_action_idx").on(table.actionId),
  index("orchestration_runs_category_idx").on(table.category),
  index("orchestration_runs_status_idx").on(table.status),
  index("orchestration_runs_source_idx").on(table.source),
  index("orchestration_runs_created_idx").on(table.createdAt),
  index("orchestration_runs_parent_idx").on(table.parentRunId),
]);

export const insertOrchestrationRunSchema = createInsertSchema(orchestrationRuns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrchestrationRun = z.infer<typeof insertOrchestrationRunSchema>;
export type OrchestrationRun = typeof orchestrationRuns.$inferSelect;

// Run steps - individual steps within a workflow run
export const orchestrationRunSteps = pgTable("orchestration_run_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull().references(() => orchestrationRuns.id, { onDelete: 'cascade' }),
  
  // Step identification
  stepNumber: integer("step_number").notNull(),
  stepName: varchar("step_name", { length: 100 }).notNull(),
  stepType: varchar("step_type", { length: 50 }).notNull(), // 'action', 'condition', 'loop', 'parallel', 'approval'
  
  // Status
  status: varchar("status", { length: 30 }).default('pending').notNull(),
  // 'pending', 'running', 'completed', 'failed', 'skipped'
  
  // Input/Output
  inputData: jsonb("input_data"),
  outputData: jsonb("output_data"),
  errorMessage: text("error_message"),
  
  // Timing
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("run_steps_run_idx").on(table.runId),
  index("run_steps_status_idx").on(table.status),
  index("run_steps_step_number_idx").on(table.stepNumber),
]);

export const insertOrchestrationRunStepSchema = createInsertSchema(orchestrationRunSteps).omit({
  id: true,
  createdAt: true,
});

export type InsertOrchestrationRunStep = z.infer<typeof insertOrchestrationRunStepSchema>;
export type OrchestrationRunStep = typeof orchestrationRunSteps.$inferSelect;

// Commitment ledger - tracks intents, locks, and transaction boundaries
export const commitmentLedger = pgTable("commitment_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Context
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  runId: varchar("run_id").references(() => orchestrationRuns.id, { onDelete: 'cascade' }),
  
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
  resolvedBy: varchar("resolved_by").references(() => users.id, { onDelete: 'set null' }),
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

export const insertCommitmentLedgerSchema = createInsertSchema(commitmentLedger).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCommitmentLedger = z.infer<typeof insertCommitmentLedgerSchema>;
export type CommitmentLedger = typeof commitmentLedger.$inferSelect;

// Workflow artifacts - stores outputs, files, and intermediate results
export const workflowArtifacts = pgTable("workflow_artifacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull().references(() => orchestrationRuns.id, { onDelete: 'cascade' }),
  stepId: varchar("step_id").references(() => orchestrationRunSteps.id, { onDelete: 'cascade' }),
  
  // Artifact identification
  artifactType: varchar("artifact_type", { length: 50 }).notNull(), // 'report', 'export', 'log', 'screenshot', 'data'
  artifactName: varchar("artifact_name", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }),
  
  // Content (for small artifacts)
  contentText: text("content_text"),
  contentJson: jsonb("content_json"),
  
  // File reference (for large artifacts)
  fileUrl: text("file_url"),
  fileSizeBytes: integer("file_size_bytes"),
  
  // Metadata
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("artifacts_run_idx").on(table.runId),
  index("artifacts_step_idx").on(table.stepId),
  index("artifacts_type_idx").on(table.artifactType),
]);

export const insertWorkflowArtifactSchema = createInsertSchema(workflowArtifacts).omit({
  id: true,
  createdAt: true,
});

export type InsertWorkflowArtifact = z.infer<typeof insertWorkflowArtifactSchema>;
export type WorkflowArtifact = typeof workflowArtifacts.$inferSelect;

// Service control states - persists AI Brain service pause/resume states across restarts
export const serviceControlStates = pgTable("service_control_states", {
  serviceName: varchar("service_name", { length: 100 }).primaryKey(),
  status: varchar("status", { length: 30 }).notNull().default('running'),
  pausedBy: varchar("paused_by").references(() => users.id, { onDelete: 'set null' }),
  pauseReason: text("pause_reason"),
  pausedAt: timestamp("paused_at"),
  lastStartedAt: timestamp("last_started_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertServiceControlStateSchema = createInsertSchema(serviceControlStates);
export type InsertServiceControlState = z.infer<typeof insertServiceControlStateSchema>;
export type ServiceControlState = typeof serviceControlStates.$inferSelect;

// ============================================================================
// QUICK FIX SYSTEM - RBAC-governed platform maintenance with audit trail
// ============================================================================

// Risk tiers for quick fix actions
export const quickFixRiskTierEnum = pgEnum('quick_fix_risk_tier', [
  'safe',      // Can be executed by any platform staff
  'moderate',  // Requires supervisor+ or approval code
  'elevated',  // Requires manager+ or dual approval
  'critical',  // Root admin only
]);

// Quick Fix Actions - Available fix types with risk levels
export const quickFixActions = pgTable("quick_fix_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 100 }).notNull().unique(), // e.g., 'restart_service', 'clear_cache'
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull(), // 'cache', 'service', 'database', 'security', 'config'
  
  // Risk and permissions
  riskTier: quickFixRiskTierEnum("risk_tier").notNull().default('moderate'),
  requiresApproval: boolean("requires_approval").default(false),
  aiSupported: boolean("ai_supported").default(true), // Can Trinity/AI Brain suggest this?
  
  // Execution details
  executionType: varchar("execution_type", { length: 50 }).default('immediate'), // 'immediate', 'scheduled', 'batched'
  estimatedDuration: integer("estimated_duration").default(5), // seconds
  reversible: boolean("reversible").default(true),
  
  // Limits
  globalDailyLimit: integer("global_daily_limit"), // Platform-wide daily limit
  cooldownSeconds: integer("cooldown_seconds").default(60), // Minimum time between executions
  
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("quick_fix_actions_code_idx").on(table.code),
  index("quick_fix_actions_category_idx").on(table.category),
  index("quick_fix_actions_risk_idx").on(table.riskTier),
]);

export const insertQuickFixActionSchema = createInsertSchema(quickFixActions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertQuickFixAction = z.infer<typeof insertQuickFixActionSchema>;
export type QuickFixAction = typeof quickFixActions.$inferSelect;

// Quick Fix Role Policies - Per-role limits and permissions
export const quickFixRolePolicies = pgTable("quick_fix_role_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  platformRole: varchar("platform_role", { length: 50 }).notNull(), // root_admin, support_manager, support_agent, etc.
  actionId: varchar("action_id").notNull().references(() => quickFixActions.id, { onDelete: 'cascade' }),
  
  // Limits per role
  perDayLimit: integer("per_day_limit").default(10),
  perWeekLimit: integer("per_week_limit").default(50),
  perMonthLimit: integer("per_month_limit"),
  
  // Approval requirements
  requiresApprovalCode: boolean("requires_approval_code").default(false),
  requiresSecondApprover: boolean("requires_second_approver").default(false),
  autoApproveBelow: integer("auto_approve_below"), // Auto-approve if impact score below threshold
  
  // Can this role execute immediately or must queue?
  canExecuteImmediately: boolean("can_execute_immediately").default(false),
  
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("quick_fix_policies_role_idx").on(table.platformRole),
  index("quick_fix_policies_action_idx").on(table.actionId),
  uniqueIndex("quick_fix_policies_unique").on(table.platformRole, table.actionId),
]);

export const insertQuickFixRolePolicySchema = createInsertSchema(quickFixRolePolicies).omit({
  id: true,
  createdAt: true,
});
export type InsertQuickFixRolePolicy = z.infer<typeof insertQuickFixRolePolicySchema>;
export type QuickFixRolePolicy = typeof quickFixRolePolicies.$inferSelect;

// Quick Fix Requests - Pending and historical fix requests
export const quickFixRequests = pgTable("quick_fix_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actionId: varchar("action_id").notNull().references(() => quickFixActions.id, { onDelete: 'cascade' }),
  
  // Requester info
  requesterId: varchar("requester_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  requesterRole: varchar("requester_role", { length: 50 }).notNull(),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'set null' }),
  
  // Request details
  targetScope: varchar("target_scope", { length: 50 }).default('platform'), // 'platform', 'workspace', 'user', 'service'
  targetId: varchar("target_id"), // Specific resource ID if scoped
  payloadJson: jsonb("payload_json"), // Parameters for the fix
  
  // AI recommendation (if suggested by Trinity/AI Brain)
  aiRecommendationId: varchar("ai_recommendation_id"),
  aiConfidenceScore: doublePrecision("ai_confidence_score"),
  aiReasoning: text("ai_reasoning"),
  
  // Status tracking
  status: varchar("status", { length: 30 }).notNull().default('pending'),
  // 'pending', 'awaiting_approval', 'approved', 'rejected', 'executing', 'completed', 'failed', 'cancelled'
  
  // Priority
  priority: varchar("priority", { length: 20 }).default('normal'), // 'low', 'normal', 'high', 'urgent'
  
  // Timing
  requestedAt: timestamp("requested_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // Request expires if not processed
  scheduledFor: timestamp("scheduled_for"), // For scheduled execution
  
  // Error handling
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("quick_fix_requests_action_idx").on(table.actionId),
  index("quick_fix_requests_requester_idx").on(table.requesterId),
  index("quick_fix_requests_status_idx").on(table.status),
  index("quick_fix_requests_requested_idx").on(table.requestedAt),
  index("quick_fix_requests_priority_idx").on(table.priority),
]);

export const insertQuickFixRequestSchema = createInsertSchema(quickFixRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertQuickFixRequest = z.infer<typeof insertQuickFixRequestSchema>;
export type QuickFixRequest = typeof quickFixRequests.$inferSelect;

// Quick Fix Approvals - Approval records for requests requiring authorization
export const quickFixApprovals = pgTable("quick_fix_approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull().references(() => quickFixRequests.id, { onDelete: 'cascade' }),
  
  // Approver info
  approverId: varchar("approver_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  approverRole: varchar("approver_role", { length: 50 }).notNull(),
  
  // Approval method
  approvalMethod: varchar("approval_method", { length: 30 }).notNull(), // 'rbac', 'approval_code', 'dual_approval', 'emergency'
  approvalCode: varchar("approval_code", { length: 100 }), // Hashed if used
  
  // Decision
  decision: varchar("decision", { length: 20 }).notNull(), // 'approved', 'rejected', 'escalated'
  decisionNotes: text("decision_notes"),
  
  // Risk assessment at time of approval
  assessedRiskLevel: varchar("assessed_risk_level", { length: 20 }),
  
  approvedAt: timestamp("approved_at").defaultNow(),
}, (table) => [
  index("quick_fix_approvals_request_idx").on(table.requestId),
  index("quick_fix_approvals_approver_idx").on(table.approverId),
  index("quick_fix_approvals_decision_idx").on(table.decision),
]);

export const insertQuickFixApprovalSchema = createInsertSchema(quickFixApprovals).omit({
  id: true,
  approvedAt: true,
});
export type InsertQuickFixApproval = z.infer<typeof insertQuickFixApprovalSchema>;
export type QuickFixApproval = typeof quickFixApprovals.$inferSelect;

// Quick Fix Executions - Execution records with telemetry
export const quickFixExecutions = pgTable("quick_fix_executions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull().references(() => quickFixRequests.id, { onDelete: 'cascade' }),
  
  // Executor info
  executorId: varchar("executor_id").references(() => users.id, { onDelete: 'set null' }), // null = system/automated
  executorType: varchar("executor_type", { length: 30 }).default('user'), // 'user', 'system', 'ai_brain', 'scheduled'
  
  // Orchestrator integration
  orchestratorRunId: varchar("orchestrator_run_id").references(() => orchestrationRuns.id, { onDelete: 'set null' }),
  
  // Execution result
  result: varchar("result", { length: 30 }).notNull(), // 'success', 'partial', 'failed', 'rolled_back'
  resultDetails: jsonb("result_details"),
  
  // Telemetry
  executionStarted: timestamp("execution_started").defaultNow(),
  executionCompleted: timestamp("execution_completed"),
  durationMs: integer("duration_ms"),
  
  // Changes made (for audit)
  changesSummary: text("changes_summary"),
  changesJson: jsonb("changes_json"), // Detailed change log
  
  // Rollback info
  rollbackAvailable: boolean("rollback_available").default(false),
  rollbackData: jsonb("rollback_data"),
  rolledBackAt: timestamp("rolled_back_at"),
  rolledBackBy: varchar("rolled_back_by").references(() => users.id, { onDelete: 'set null' }),
}, (table) => [
  index("quick_fix_executions_request_idx").on(table.requestId),
  index("quick_fix_executions_executor_idx").on(table.executorId),
  index("quick_fix_executions_result_idx").on(table.result),
  index("quick_fix_executions_started_idx").on(table.executionStarted),
]);

export const insertQuickFixExecutionSchema = createInsertSchema(quickFixExecutions).omit({
  id: true,
});
export type InsertQuickFixExecution = z.infer<typeof insertQuickFixExecutionSchema>;
export type QuickFixExecution = typeof quickFixExecutions.$inferSelect;

// Quick Fix Audit Links - Links executions to main audit log
export const quickFixAuditLinks = pgTable("quick_fix_audit_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull().references(() => quickFixRequests.id, { onDelete: 'cascade' }),
  executionId: varchar("execution_id").references(() => quickFixExecutions.id, { onDelete: 'cascade' }),
  auditEntryId: varchar("audit_entry_id").notNull(), // Links to main audit log
  
  // Event type
  eventType: varchar("event_type", { length: 50 }).notNull(), // 'requested', 'approved', 'rejected', 'executed', 'failed', 'rolled_back'
  
  // AI Brain awareness
  aiBrainNotified: boolean("ai_brain_notified").default(false),
  aiBrainSummary: text("ai_brain_summary"), // AI-generated summary for later queries
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("quick_fix_audit_request_idx").on(table.requestId),
  index("quick_fix_audit_execution_idx").on(table.executionId),
  index("quick_fix_audit_entry_idx").on(table.auditEntryId),
  index("quick_fix_audit_event_idx").on(table.eventType),
]);

export const insertQuickFixAuditLinkSchema = createInsertSchema(quickFixAuditLinks).omit({
  id: true,
  createdAt: true,
});
export type InsertQuickFixAuditLink = z.infer<typeof insertQuickFixAuditLinkSchema>;
export type QuickFixAuditLink = typeof quickFixAuditLinks.$inferSelect;

// Device Profiles - Store user device capabilities for optimized loading
export const userDeviceProfiles = pgTable("user_device_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Device identification
  deviceFingerprint: varchar("device_fingerprint", { length: 255 }),
  deviceType: varchar("device_type", { length: 30 }).notNull(), // 'desktop', 'tablet', 'mobile'
  platform: varchar("platform", { length: 50 }), // 'windows', 'macos', 'ios', 'android', 'linux'
  browser: varchar("browser", { length: 50 }),
  browserVersion: varchar("browser_version", { length: 30 }),
  
  // Capabilities
  screenWidth: integer("screen_width"),
  screenHeight: integer("screen_height"),
  devicePixelRatio: doublePrecision("device_pixel_ratio"),
  touchSupport: boolean("touch_support").default(false),
  
  // Performance metrics
  cpuCores: integer("cpu_cores"),
  memoryGb: doublePrecision("memory_gb"),
  connectionType: varchar("connection_type", { length: 30 }), // '4g', 'wifi', 'ethernet'
  
  // Optimized settings (cached)
  optimizedSettings: jsonb("optimized_settings"), // Animation density, resource bundles, etc.
  settingsVersion: integer("settings_version").default(1),
  
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("device_profiles_user_idx").on(table.userId),
  index("device_profiles_type_idx").on(table.deviceType),
  index("device_profiles_fingerprint_idx").on(table.deviceFingerprint),
]);

export const insertUserDeviceProfileSchema = createInsertSchema(userDeviceProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserDeviceProfile = z.infer<typeof insertUserDeviceProfileSchema>;
export type UserDeviceProfile = typeof userDeviceProfiles.$inferSelect;

// ============================================================================
// SESSION CHECKPOINT SYSTEM - Trinity-Aware Session State Management
// ============================================================================

// Checkpoint sync state enum
export const checkpointSyncStateEnum = pgEnum("checkpoint_sync_state", [
  "pending",
  "synced",
  "failed",
  "stale"
]);

// Session checkpoint phases
export const sessionCheckpoints = pgTable("session_checkpoints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  sessionId: varchar("session_id").notNull(), // Browser session fingerprint
  
  // Phase tracking
  phaseKey: varchar("phase_key", { length: 100 }).notNull(), // e.g., 'form_editing', 'report_building', 'data_entry'
  phaseNumber: integer("phase_number").default(1),
  
  // State payload (encrypted for sensitive data)
  payload: jsonb("payload").notNull(), // Current user state/form data
  payloadChecksum: varchar("payload_checksum", { length: 64 }), // SHA-256 for integrity verification
  payloadVersion: integer("payload_version").default(1),
  
  // Context for Trinity AI Brain
  contextSummary: text("context_summary"), // AI-readable summary of what user was doing
  pageRoute: varchar("page_route", { length: 255 }), // Current page/route
  actionHistory: jsonb("action_history"), // Recent user actions for context
  
  // AI Sync State
  aiSyncState: checkpointSyncStateEnum("ai_sync_state").default("pending"),
  aiSyncedAt: timestamp("ai_synced_at"),
  trinityContextId: varchar("trinity_context_id", { length: 100 }), // Reference ID in Trinity's context
  
  // Lifecycle
  isFinal: boolean("is_final").default(false), // True when session ended gracefully
  isRecovered: boolean("is_recovered").default(false), // True if this was used for recovery
  expiresAt: timestamp("expires_at"), // Auto-cleanup after this time
  
  createdAt: timestamp("created_at").defaultNow(),
  savedAt: timestamp("saved_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("session_checkpoints_user_idx").on(table.userId),
  index("session_checkpoints_workspace_idx").on(table.workspaceId),
  index("session_checkpoints_session_idx").on(table.sessionId),
  index("session_checkpoints_phase_idx").on(table.phaseKey),
  index("session_checkpoints_final_idx").on(table.isFinal),
  index("session_checkpoints_expires_idx").on(table.expiresAt),
]);

export const insertSessionCheckpointSchema = createInsertSchema(sessionCheckpoints).omit({
  id: true,
  createdAt: true,
  savedAt: true,
  updatedAt: true,
});
export type InsertSessionCheckpoint = z.infer<typeof insertSessionCheckpointSchema>;
export type SessionCheckpoint = typeof sessionCheckpoints.$inferSelect;

// Session checkpoint events for audit trail
export const sessionCheckpointEvents = pgTable("session_checkpoint_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checkpointId: varchar("checkpoint_id").notNull().references(() => sessionCheckpoints.id, { onDelete: 'cascade' }),
  
  // Event details
  eventType: varchar("event_type", { length: 50 }).notNull(), // 'created', 'updated', 'finalized', 'recovered', 'expired', 'ai_synced'
  eventSource: varchar("event_source", { length: 50 }).notNull(), // 'user_action', 'auto_save', 'visibility_change', 'unload', 'ai_brain'
  
  // Metadata
  metadata: jsonb("metadata"), // Event-specific data
  previousPayloadChecksum: varchar("previous_payload_checksum", { length: 64 }),
  
  // Trinity integration
  aiBrainNotified: boolean("ai_brain_notified").default(false),
  aiBrainEventId: varchar("ai_brain_event_id", { length: 100 }),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("checkpoint_events_checkpoint_idx").on(table.checkpointId),
  index("checkpoint_events_type_idx").on(table.eventType),
  index("checkpoint_events_created_idx").on(table.createdAt),
]);

export const insertSessionCheckpointEventSchema = createInsertSchema(sessionCheckpointEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertSessionCheckpointEvent = z.infer<typeof insertSessionCheckpointEventSchema>;
export type SessionCheckpointEvent = typeof sessionCheckpointEvents.$inferSelect;

// Session recovery requests
export const sessionRecoveryRequests = pgTable("session_recovery_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  checkpointId: varchar("checkpoint_id").notNull().references(() => sessionCheckpoints.id, { onDelete: 'cascade' }),
  sessionId: varchar("session_id").notNull(), // Original session that was lost
  newSessionId: varchar("new_session_id"), // New session where recovery happened
  
  // Request details
  requestSource: varchar("request_source", { length: 50 }).notNull(), // 'auto_prompt', 'user_initiated', 'trinity_suggested'
  status: varchar("status", { length: 30 }).default("pending"), // 'pending', 'accepted', 'declined', 'expired', 'completed'
  
  // Recovery outcome
  recoveredData: jsonb("recovered_data"), // What was restored
  recoveryNotes: text("recovery_notes"), // AI-generated summary of recovery
  userFeedback: varchar("user_feedback", { length: 30 }), // 'helpful', 'partial', 'not_needed'
  
  // Timing
  promptedAt: timestamp("prompted_at").defaultNow(),
  respondedAt: timestamp("responded_at"),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at"), // Recovery offer expires after this
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("recovery_requests_user_idx").on(table.userId),
  index("recovery_requests_checkpoint_idx").on(table.checkpointId),
  index("recovery_requests_status_idx").on(table.status),
  index("recovery_requests_created_idx").on(table.createdAt),
]);

export const insertSessionRecoveryRequestSchema = createInsertSchema(sessionRecoveryRequests).omit({
  id: true,
  createdAt: true,
});
export type InsertSessionRecoveryRequest = z.infer<typeof insertSessionRecoveryRequestSchema>;
export type SessionRecoveryRequest = typeof sessionRecoveryRequests.$inferSelect;

// ============================================================================
// AI BRAIN SUBAGENT ORCHESTRATION SYSTEM
// Specialized subagents for each domain with Dr. Holmes diagnostic capabilities
// ============================================================================

// Subagent domain categories
export const subagentDomainEnum = pgEnum('subagent_domain', [
  'scheduling',      // Shift management, availability, calendar sync
  'payroll',         // Pay runs, deductions, tax calculations
  'invoicing',       // Invoice generation, billing, client payments
  'compliance',      // Certifications, labor law, break enforcement
  'notifications',   // Alert routing, email, SMS, WebSocket
  'analytics',       // Metrics, reports, KPI tracking
  'gamification',    // Achievements, points, leaderboards
  'communication',   // Chat, helpdesk, support tickets
  'health',          // System monitoring, performance checks
  'testing',         // Automated tests, validation
  'deployment',      // Code commits, releases, migrations
  'recovery',        // Session recovery, rollback, checkpoints
  'orchestration',   // Workflow coordination, chain execution
  'security',        // RBAC, audit, access control
  'escalation',      // Critical issue escalation, runbook execution
  'automation',      // Scheduled jobs, diagnostics, platform animations
  'lifecycle',       // Employee lifecycle: probation, renewals, anniversaries
  'assist',          // User assistance: feature discovery, troubleshooting
  'filesystem',      // File operations: read, write, edit, search
  'workflow',        // Durable workflows: registration, execution, monitoring
  'onboarding',      // Employee onboarding: diagnostics, routing config
  'expense',         // Expense management: receipt OCR, categorization
  'pricing',         // Dynamic pricing: analysis, competitiveness, simulations
  'data_migration',  // Data migration: org onboarding, bulk import, hierarchy assignment
  'scoring',         // Trust scoring: graduated approval system, accuracy tracking, auto-approval
]);

// Subagent execution status
export const subagentStatusEnum = pgEnum('subagent_status', [
  'idle',
  'preparing',
  'executing',
  'validating',
  'escalating',
  'completed',
  'failed',
  'derailed',
]);

// AI Subagent Definitions - Registry of specialized subagents
export const aiSubagentDefinitions = pgTable("ai_subagent_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Identity
  name: varchar("name", { length: 100 }).notNull().unique(),
  domain: subagentDomainEnum("domain").notNull(),
  description: text("description").notNull(),
  
  // Capabilities
  capabilities: jsonb("capabilities").notNull(), // Array of action IDs this subagent handles
  requiredTools: jsonb("required_tools"), // Tools this subagent needs access to
  escalationPolicy: jsonb("escalation_policy"), // When/how to escalate to Trinity
  
  // Dr. Holmes Diagnostic Configuration
  diagnosticWorkflow: jsonb("diagnostic_workflow"), // Triage steps: diagnose → fix → validate → report
  knownPatterns: jsonb("known_patterns"), // Patterns this subagent can recognize
  fixStrategies: jsonb("fix_strategies"), // Auto-fix strategies for common issues
  
  // Execution Parameters
  maxRetries: integer("max_retries").default(3),
  timeoutMs: integer("timeout_ms").default(30000),
  confidenceThreshold: doublePrecision("confidence_threshold").default(0.7), // Min confidence to auto-execute
  requiresApproval: boolean("requires_approval").default(false), // Always require human approval
  
  // RBAC
  allowedRoles: jsonb("allowed_roles"), // Platform roles that can trigger this subagent
  bypassAuthFor: jsonb("bypass_auth_for"), // Roles that bypass approval for this subagent
  
  // Status
  isActive: boolean("is_active").default(true),
  version: varchar("version", { length: 20 }).default("1.0.0"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("subagent_definitions_domain_idx").on(table.domain),
  index("subagent_definitions_active_idx").on(table.isActive),
]);

export const insertAiSubagentDefinitionSchema = createInsertSchema(aiSubagentDefinitions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAiSubagentDefinition = z.infer<typeof insertAiSubagentDefinitionSchema>;
export type AiSubagentDefinition = typeof aiSubagentDefinitions.$inferSelect;

// Trinity Access Control - Per-workspace/page/feature RBAC with bypass controls
export const trinityAccessControl = pgTable("trinity_access_control", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // What is being controlled
  resourceType: varchar("resource_type", { length: 50 }).notNull(), // 'page', 'feature', 'tool', 'mascot', 'subagent'
  resourceId: varchar("resource_id", { length: 200 }).notNull(), // Unique identifier for the resource
  resourceName: varchar("resource_name", { length: 200 }), // Human-readable name
  
  // Access Settings
  isEnabled: boolean("is_enabled").default(true), // Master toggle for this resource
  allowedRoles: jsonb("allowed_roles"), // Roles that can access (null = all roles)
  deniedRoles: jsonb("denied_roles"), // Roles explicitly denied
  
  // Approval Settings
  requiresApproval: boolean("requires_approval").default(false),
  approvalRoles: jsonb("approval_roles"), // Roles that can approve
  autoApproveFor: jsonb("auto_approve_for"), // Roles that get auto-approval
  
  // Trinity AI Settings
  trinityCanAssist: boolean("trinity_can_assist").default(true), // Trinity can help with this resource
  trinityCanAutoFix: boolean("trinity_can_auto_fix").default(false), // Trinity can auto-fix issues
  aiToolsEnabled: boolean("ai_tools_enabled").default(true), // AI Brain tools available
  mascotVisible: boolean("mascot_visible").default(true), // CoAI mascot shows on this page
  
  // Audit
  configuredBy: varchar("configured_by").references(() => users.id, { onDelete: 'set null' }),
  configuredAt: timestamp("configured_at").defaultNow(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("trinity_access_workspace_idx").on(table.workspaceId),
  index("trinity_access_resource_idx").on(table.resourceType, table.resourceId),
  uniqueIndex("trinity_access_unique_idx").on(table.workspaceId, table.resourceType, table.resourceId),
]);

export const insertTrinityAccessControlSchema = createInsertSchema(trinityAccessControl).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrinityAccessControl = z.infer<typeof insertTrinityAccessControlSchema>;
export type TrinityAccessControl = typeof trinityAccessControl.$inferSelect;

// Subagent Telemetry - Health monitoring and execution tracking
export const subagentTelemetry = pgTable("subagent_telemetry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subagentId: varchar("subagent_id").references(() => aiSubagentDefinitions.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Execution Context
  executionId: varchar("execution_id", { length: 100 }).notNull(), // Unique execution trace ID
  actionId: varchar("action_id", { length: 200 }), // Specific action being executed
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  
  // Status Tracking
  status: subagentStatusEnum("status").notNull(),
  phase: varchar("phase", { length: 50 }), // 'prepare', 'execute', 'validate', 'escalate'
  
  // Execution Metrics
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  retryCount: integer("retry_count").default(0),
  
  // Diagnostic Data (Dr. Holmes)
  diagnosticResults: jsonb("diagnostic_results"), // What was diagnosed
  fixAttempted: boolean("fix_attempted").default(false),
  fixSucceeded: boolean("fix_succeeded"),
  fixDetails: jsonb("fix_details"), // What fix was applied
  
  // Health Signals
  confidenceScore: doublePrecision("confidence_score"), // 0-1
  riskLevel: varchar("risk_level", { length: 20 }), // 'low', 'medium', 'high', 'critical'
  requiresEscalation: boolean("requires_escalation").default(false),
  escalationReason: text("escalation_reason"),
  
  // Error Tracking
  errorCode: varchar("error_code", { length: 50 }),
  errorMessage: text("error_message"),
  errorStack: text("error_stack"),
  
  // Input/Output
  inputPayload: jsonb("input_payload"),
  outputPayload: jsonb("output_payload"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("subagent_telemetry_subagent_idx").on(table.subagentId),
  index("subagent_telemetry_workspace_idx").on(table.workspaceId),
  index("subagent_telemetry_execution_idx").on(table.executionId),
  index("subagent_telemetry_status_idx").on(table.status),
  index("subagent_telemetry_created_idx").on(table.createdAt),
]);

export const insertSubagentTelemetrySchema = createInsertSchema(subagentTelemetry).omit({
  id: true,
  createdAt: true,
});
export type InsertSubagentTelemetry = z.infer<typeof insertSubagentTelemetrySchema>;
export type SubagentTelemetry = typeof subagentTelemetry.$inferSelect;

// Support Interventions - Derailment tracking with approval workflow
export const supportInterventions = pgTable("support_interventions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Triggering Context
  subagentId: varchar("subagent_id").references(() => aiSubagentDefinitions.id, { onDelete: 'set null' }),
  telemetryId: varchar("telemetry_id").references(() => subagentTelemetry.id, { onDelete: 'set null' }),
  checkpointId: varchar("checkpoint_id").references(() => sessionCheckpoints.id, { onDelete: 'set null' }),
  
  // Derailment Details
  derailmentType: varchar("derailment_type", { length: 50 }).notNull(), // 'repeated_failure', 'high_risk', 'user_complaint', 'system_anomaly'
  severity: varchar("severity", { length: 20 }).notNull(), // 'low', 'medium', 'high', 'critical'
  description: text("description").notNull(),
  diagnosticSummary: text("diagnostic_summary"), // AI-generated summary of what went wrong
  
  // Affected Users/Context
  affectedUserId: varchar("affected_user_id").references(() => users.id, { onDelete: 'set null' }),
  affectedFeature: varchar("affected_feature", { length: 200 }),
  impactAssessment: jsonb("impact_assessment"), // Scope of impact
  
  // Proposed Fix
  proposedFix: jsonb("proposed_fix"), // What Trinity suggests
  fixConfidence: doublePrecision("fix_confidence"), // 0-1
  alternativeFixes: jsonb("alternative_fixes"), // Other options
  
  // Approval Workflow
  status: varchar("status", { length: 30 }).default("pending"), // 'pending', 'approved', 'rejected', 'auto_fixed', 'escalated', 'resolved'
  requestedAt: timestamp("requested_at").defaultNow(),
  
  // Approval Details
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp("approved_at"),
  rejectedBy: varchar("rejected_by").references(() => users.id, { onDelete: 'set null' }),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  
  // Resolution
  resolvedAt: timestamp("resolved_at"),
  resolutionMethod: varchar("resolution_method", { length: 50 }), // 'auto_fix', 'manual_fix', 'rollback', 'escalated_to_engineering'
  resolutionNotes: text("resolution_notes"),
  resolutionOutcome: jsonb("resolution_outcome"),
  
  // Linked Governance Approval
  governanceApprovalId: varchar("governance_approval_id").references(() => governanceApprovals.id, { onDelete: 'set null' }),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("support_interventions_workspace_idx").on(table.workspaceId),
  index("support_interventions_subagent_idx").on(table.subagentId),
  index("support_interventions_status_idx").on(table.status),
  index("support_interventions_severity_idx").on(table.severity),
  index("support_interventions_created_idx").on(table.createdAt),
]);

export const insertSupportInterventionSchema = createInsertSchema(supportInterventions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSupportIntervention = z.infer<typeof insertSupportInterventionSchema>;
export type SupportIntervention = typeof supportInterventions.$inferSelect;

// ============================================================================
// SUPPORT SESSION ELEVATIONS - Verified Support Session Bypass
// ============================================================================

/**
 * Tracks elevated support sessions where authenticated support roles
 * can bypass repeated auth checks for AI-driven automation workflows.
 * 
 * Key features:
 * - HMAC signature verification for tamper protection
 * - Time-bounded elevation with absolute and idle timeouts
 * - Audit trail for security compliance
 * - Automatic cleanup on logout or expiration
 */
export const supportSessionElevations = pgTable("support_session_elevations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Session binding
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: varchar("session_id").notNull(), // Express session ID
  
  // Cryptographic verification
  signature: varchar("signature", { length: 128 }).notNull(), // HMAC-SHA256 signature
  signatureVersion: integer("signature_version").default(1), // For future algorithm upgrades
  
  // Timing controls
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(), // Absolute expiration (max 12 hours)
  lastActivityAt: timestamp("last_activity_at").defaultNow(), // For idle timeout (4 hours)
  
  // Context
  issuedBy: varchar("issued_by").references(() => users.id, { onDelete: 'set null' }), // Who approved elevation (self for auto-approved roles)
  platformRole: varchar("platform_role", { length: 50 }).notNull(), // Role at time of elevation
  elevationReason: varchar("elevation_reason", { length: 200 }), // 'auto_support_login', 'governance_approved', 'mfa_verified'
  
  // Status
  isActive: boolean("is_active").default(true),
  revokedAt: timestamp("revoked_at"),
  revokedBy: varchar("revoked_by").references(() => users.id, { onDelete: 'set null' }),
  revocationReason: varchar("revocation_reason", { length: 200 }), // 'logout', 'expired', 'manual_revoke', 'session_destroyed'
  
  // Audit trail
  actionsExecuted: integer("actions_executed").default(0), // Count of actions using this elevation
  lastActionAt: timestamp("last_action_at"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("support_elevations_user_idx").on(table.userId),
  index("support_elevations_session_idx").on(table.sessionId),
  index("support_elevations_active_idx").on(table.isActive),
  index("support_elevations_expires_idx").on(table.expiresAt),
]);

export const insertSupportSessionElevationSchema = createInsertSchema(supportSessionElevations).omit({
  id: true,
  createdAt: true,
});
export type InsertSupportSessionElevation = z.infer<typeof insertSupportSessionElevationSchema>;
export type SupportSessionElevation = typeof supportSessionElevations.$inferSelect;

// ============================================================================
// TRINITY CREDITS & FEATURE GATING SYSTEM
// ============================================================================

/**
 * Credit packages available for purchase - defines pricing and credit amounts
 */
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

export const insertTrinityCreditPackageSchema = createInsertSchema(trinityCreditPackages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrinityCreditPackage = z.infer<typeof insertTrinityCreditPackageSchema>;
export type TrinityCreditPackage = typeof trinityCreditPackages.$inferSelect;

/**
 * Workspace credit balance - tracks credits for Trinity/AI Brain usage per workspace
 */
export const trinityCredits = pgTable("trinity_credits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }).unique(),
  
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
}, (table) => [
  index("trinity_credits_workspace_idx").on(table.workspaceId),
  index("trinity_credits_balance_idx").on(table.balance),
]);

export const insertTrinityCreditSchema = createInsertSchema(trinityCredits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrinityCredit = z.infer<typeof insertTrinityCreditSchema>;
export type TrinityCredit = typeof trinityCredits.$inferSelect;

/**
 * Credit transactions - audit trail for all credit movements
 */
export const trinityCreditTransactions = pgTable("trinity_credit_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }), // User who triggered transaction
  
  // Transaction details
  transactionType: varchar("transaction_type", { length: 30 }).notNull(), // 'purchase', 'usage', 'refund', 'bonus', 'expiry', 'code_redemption'
  credits: integer("credits").notNull(), // Amount (positive for add, negative for deduct)
  balanceAfter: integer("balance_after").notNull(), // Balance after transaction
  
  // Context
  description: text("description"), // Human-readable description
  actionType: varchar("action_type", { length: 100 }), // Which Trinity action consumed credits
  actionId: varchar("action_id"), // Reference to the specific action
  
  // For purchases
  packageId: varchar("package_id").references(() => trinityCreditPackages.id, { onDelete: 'set null' }),
  stripePaymentId: varchar("stripe_payment_id"), // Stripe payment intent ID
  priceUsd: decimal("price_usd", { precision: 10, scale: 2 }),
  
  // For code redemptions
  unlockCodeId: varchar("unlock_code_id"),
  
  // Metadata
  metadata: jsonb("metadata"),
  ipAddress: varchar("ip_address", { length: 45 }),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("trinity_transactions_workspace_idx").on(table.workspaceId),
  index("trinity_transactions_user_idx").on(table.userId),
  index("trinity_transactions_type_idx").on(table.transactionType),
  index("trinity_transactions_created_idx").on(table.createdAt),
]);

export const insertTrinityCreditTransactionSchema = createInsertSchema(trinityCreditTransactions).omit({
  id: true,
  createdAt: true,
});
export type InsertTrinityCreditTransaction = z.infer<typeof insertTrinityCreditTransactionSchema>;
export type TrinityCreditTransaction = typeof trinityCreditTransactions.$inferSelect;

/**
 * Unlock codes - system-generated codes to reactivate features
 */
export const trinityUnlockCodes = pgTable("trinity_unlock_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Code details
  code: varchar("code", { length: 50 }).notNull().unique(), // Format: TRIN-XXXX-XXXX-XXXX
  codeType: varchar("code_type", { length: 30 }).notNull(), // 'credits', 'feature_unlock', 'trial_extension', 'addon_activation'
  
  // Value
  credits: integer("credits"), // Credits to add (for credit codes)
  featureKey: varchar("feature_key", { length: 100 }), // Feature to unlock (for feature codes)
  addonKey: varchar("addon_key", { length: 100 }), // Addon to activate
  daysValid: integer("days_valid"), // Days the feature/addon stays active
  
  // Restrictions
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }), // If null, usable by any workspace
  maxRedemptions: integer("max_redemptions").default(1), // How many times code can be used
  currentRedemptions: integer("current_redemptions").default(0),
  
  // Validity
  isActive: boolean("is_active").default(true),
  expiresAt: timestamp("expires_at"), // When code expires
  
  // Audit
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("trinity_unlock_codes_code_idx").on(table.code),
  index("trinity_unlock_codes_type_idx").on(table.codeType),
  index("trinity_unlock_codes_workspace_idx").on(table.workspaceId),
  index("trinity_unlock_codes_active_idx").on(table.isActive),
]);

export const insertTrinityUnlockCodeSchema = createInsertSchema(trinityUnlockCodes).omit({
  id: true,
  createdAt: true,
});
export type InsertTrinityUnlockCode = z.infer<typeof insertTrinityUnlockCodeSchema>;
export type TrinityUnlockCode = typeof trinityUnlockCodes.$inferSelect;

/**
 * Workspace feature states - tracks locked/unlocked status per feature per workspace
 */
export const workspaceFeatureStates = pgTable("workspace_feature_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Feature identification
  featureKey: varchar("feature_key", { length: 100 }).notNull(), // 'trinity_quick_commands', 'ai_scheduling', 'automation_engine', etc.
  featureCategory: varchar("feature_category", { length: 50 }).notNull(), // 'ai_brain', 'automation', 'addon', 'core'
  
  // State
  isUnlocked: boolean("is_unlocked").default(false),
  unlockMethod: varchar("unlock_method", { length: 50 }), // 'onboarding', 'purchase', 'tier', 'code', 'migration', 'trial'
  unlockedAt: timestamp("unlocked_at"),
  unlockedBy: varchar("unlocked_by").references(() => users.id, { onDelete: 'set null' }),
  
  // For time-limited features
  expiresAt: timestamp("expires_at"), // When feature access expires
  
  // For credit-gated features
  requiresCredits: boolean("requires_credits").default(false),
  creditsPerUse: integer("credits_per_use").default(1), // Credits consumed per use
  
  // For tier-gated features
  requiredTier: varchar("required_tier", { length: 30 }), // Minimum subscription tier required
  
  // Display
  showLockIcon: boolean("show_lock_icon").default(true), // Show lock symbol in UI
  lockMessage: text("lock_message"), // Custom message for locked state
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("workspace_feature_states_workspace_idx").on(table.workspaceId),
  index("workspace_feature_states_feature_idx").on(table.featureKey),
  index("workspace_feature_states_unlocked_idx").on(table.isUnlocked),
  uniqueIndex("unique_workspace_feature").on(table.workspaceId, table.featureKey),
]);

export const insertWorkspaceFeatureStateSchema = createInsertSchema(workspaceFeatureStates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWorkspaceFeatureState = z.infer<typeof insertWorkspaceFeatureStateSchema>;
export type WorkspaceFeatureState = typeof workspaceFeatureStates.$inferSelect;

/**
 * Credit cost configuration - defines how many credits each action costs
 */
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

export const insertTrinityCreditCostSchema = createInsertSchema(trinityCreditCosts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrinityCreditCost = z.infer<typeof insertTrinityCreditCostSchema>;
export type TrinityCreditCost = typeof trinityCreditCosts.$inferSelect;

// ============================================================================
// AUTOMATION GOVERNANCE SYSTEM
// Confidence-based automation levels with consent tracking and audit trail
// ============================================================================

export const automationLevelEnum = pgEnum("automation_level", [
  "hand_held",       // 0-40% confidence: All actions require explicit user confirmation
  "graduated",       // 41-75% confidence: Routine auto-execute, high-risk requires confirmation
  "full_automation", // 76-100% confidence: All actions auto-execute with notifications
]);

export const workspaceAutomationPolicies = pgTable("workspace_automation_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  currentLevel: automationLevelEnum("current_level").notNull().default("hand_held"),
  
  handHeldThreshold: integer("hand_held_threshold").notNull().default(40),
  graduatedThreshold: integer("graduated_threshold").notNull().default(75),
  
  reviewCadenceDays: integer("review_cadence_days").default(30),
  lastReviewedAt: timestamp("last_reviewed_at"),
  lastReviewedBy: varchar("last_reviewed_by").references(() => users.id, { onDelete: 'set null' }),
  nextReviewAt: timestamp("next_review_at"),
  
  highRiskCategories: text("high_risk_categories").array().default(sql`ARRAY['payroll', 'billing', 'termination', 'data_deletion']`),
  
  autoEscalateOnLowConfidence: boolean("auto_escalate_on_low_confidence").default(true),
  minConfidenceForAutoExecute: integer("min_confidence_for_auto_execute").default(60),
  
  enableAuditNotifications: boolean("enable_audit_notifications").default(true),
  
  orgOwnerConsent: boolean("org_owner_consent").default(false),
  orgOwnerConsentAt: timestamp("org_owner_consent_at"),
  orgOwnerConsentUserId: varchar("org_owner_consent_user_id").references(() => users.id, { onDelete: 'set null' }),
  
  waiverAccepted: boolean("waiver_accepted").default(false),
  waiverAcceptedAt: timestamp("waiver_accepted_at"),
  waiverVersion: varchar("waiver_version", { length: 20 }).default("1.0"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("workspace_automation_policies_workspace_idx").on(table.workspaceId),
  index("workspace_automation_policies_level_idx").on(table.currentLevel),
]);

export const insertWorkspaceAutomationPolicySchema = createInsertSchema(workspaceAutomationPolicies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWorkspaceAutomationPolicy = z.infer<typeof insertWorkspaceAutomationPolicySchema>;
export type WorkspaceAutomationPolicy = typeof workspaceAutomationPolicies.$inferSelect;

export const userAutomationConsents = pgTable("user_automation_consents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  consentType: varchar("consent_type", { length: 50 }).notNull(),
  
  consentGranted: boolean("consent_granted").notNull().default(false),
  consentGrantedAt: timestamp("consent_granted_at"),
  
  waiverAccepted: boolean("waiver_accepted").default(false),
  waiverAcceptedAt: timestamp("waiver_accepted_at"),
  waiverVersion: varchar("waiver_version", { length: 20 }),
  
  sourceContext: varchar("source_context", { length: 100 }),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  revokedReason: text("revoked_reason"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("user_automation_consents_user_idx").on(table.userId),
  index("user_automation_consents_workspace_idx").on(table.workspaceId),
  index("user_automation_consents_type_idx").on(table.consentType),
  uniqueIndex("unique_user_workspace_consent_type").on(table.userId, table.workspaceId, table.consentType),
]);

export const insertUserAutomationConsentSchema = createInsertSchema(userAutomationConsents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserAutomationConsent = z.infer<typeof insertUserAutomationConsentSchema>;
export type UserAutomationConsent = typeof userAutomationConsents.$inferSelect;

export const automationActionLedger = pgTable("automation_action_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'set null' }),
  
  actionId: varchar("action_id", { length: 100 }).notNull(),
  actionName: varchar("action_name", { length: 200 }).notNull(),
  actionCategory: varchar("action_category", { length: 50 }).notNull(),
  toolName: varchar("tool_name", { length: 100 }),
  
  confidenceScore: integer("confidence_score").notNull(),
  computedLevel: automationLevelEnum("computed_level").notNull(),
  policyLevel: automationLevelEnum("policy_level").notNull(),
  
  requiresHumanApproval: boolean("requires_human_approval").default(false),
  approvalState: varchar("approval_state", { length: 30 }).default("pending"),
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp("approved_at"),
  approvalNotes: text("approval_notes"),
  
  executedBy: varchar("executed_by").references(() => users.id, { onDelete: 'set null' }),
  executedByBot: boolean("executed_by_bot").default(false),
  executorType: varchar("executor_type", { length: 30 }),
  
  inputPayload: jsonb("input_payload"),
  outputResult: jsonb("output_result"),
  errorDetails: text("error_details"),
  
  executionStatus: varchar("execution_status", { length: 30 }).default("pending"),
  executionTimeMs: integer("execution_time_ms"),
  
  consentSnapshotId: varchar("consent_snapshot_id"),
  policySnapshotId: varchar("policy_snapshot_id"),
  
  isHighRisk: boolean("is_high_risk").default(false),
  riskFactors: text("risk_factors").array(),
  
  trinitySessionId: varchar("trinity_session_id"),
  conversationTurnId: varchar("conversation_turn_id"),
  
  auditLogId: varchar("audit_log_id"),
  
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("automation_action_ledger_workspace_idx").on(table.workspaceId),
  index("automation_action_ledger_action_idx").on(table.actionId),
  index("automation_action_ledger_category_idx").on(table.actionCategory),
  index("automation_action_ledger_status_idx").on(table.executionStatus),
  index("automation_action_ledger_level_idx").on(table.computedLevel),
  index("automation_action_ledger_approval_idx").on(table.approvalState),
  index("automation_action_ledger_created_idx").on(table.createdAt),
]);

export const insertAutomationActionLedgerSchema = createInsertSchema(automationActionLedger).omit({
  id: true,
  createdAt: true,
});
export type InsertAutomationActionLedger = z.infer<typeof insertAutomationActionLedgerSchema>;
export type AutomationActionLedger = typeof automationActionLedger.$inferSelect;

export const automationAcknowledgments = pgTable("automation_acknowledgments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ledgerEntryId: varchar("ledger_entry_id").notNull().references(() => automationActionLedger.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  acknowledgmentType: varchar("acknowledgment_type", { length: 50 }).notNull(),
  
  acknowledged: boolean("acknowledged").default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
  
  response: varchar("response", { length: 30 }),
  responseNotes: text("response_notes"),
  
  reminderSentAt: timestamp("reminder_sent_at"),
  reminderCount: integer("reminder_count").default(0),
  
  expiresAt: timestamp("expires_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("automation_acknowledgments_ledger_idx").on(table.ledgerEntryId),
  index("automation_acknowledgments_user_idx").on(table.userId),
  index("automation_acknowledgments_type_idx").on(table.acknowledgmentType),
]);

export const insertAutomationAcknowledgmentSchema = createInsertSchema(automationAcknowledgments).omit({
  id: true,
  createdAt: true,
});
export type InsertAutomationAcknowledgment = z.infer<typeof insertAutomationAcknowledgmentSchema>;
export type AutomationAcknowledgment = typeof automationAcknowledgments.$inferSelect;

export const trinityConversationSessions = pgTable("trinity_conversation_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'set null' }),
  
  sessionState: varchar("session_state", { length: 30 }).default("active"),
  
  contextMemory: jsonb("context_memory").default(sql`'{}'::jsonb`),
  turnCount: integer("turn_count").default(0),
  
  lastToolUsed: varchar("last_tool_used", { length: 100 }),
  lastActionId: varchar("last_action_id", { length: 100 }),
  lastConfidenceScore: integer("last_confidence_score"),
  
  knowledgeGaps: text("knowledge_gaps").array().default(sql`'{}'`),
  pendingClarifications: text("pending_clarifications").array().default(sql`'{}'`),
  
  escalationPending: boolean("escalation_pending").default(false),
  escalationReason: text("escalation_reason"),
  escalatedToSupportAt: timestamp("escalated_to_support_at"),
  
  sessionMetrics: jsonb("session_metrics").default(sql`'{}'::jsonb`),
  
  startedAt: timestamp("started_at").defaultNow(),
  lastActivityAt: timestamp("last_activity_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("trinity_conversation_sessions_user_idx").on(table.userId),
  index("trinity_conversation_sessions_workspace_idx").on(table.workspaceId),
  index("trinity_conversation_sessions_state_idx").on(table.sessionState),
  index("trinity_conversation_sessions_activity_idx").on(table.lastActivityAt),
]);

export const insertTrinityConversationSessionSchema = createInsertSchema(trinityConversationSessions).omit({
  id: true,
  createdAt: true,
});
export type InsertTrinityConversationSession = z.infer<typeof insertTrinityConversationSessionSchema>;
export type TrinityConversationSession = typeof trinityConversationSessions.$inferSelect;

export const trinityConversationTurns = pgTable("trinity_conversation_turns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => trinityConversationSessions.id, { onDelete: 'cascade' }),
  
  turnNumber: integer("turn_number").notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  
  content: text("content").notNull(),
  contentType: varchar("content_type", { length: 30 }).default("text"),
  
  toolCalls: jsonb("tool_calls").default(sql`'[]'::jsonb`),
  toolResults: jsonb("tool_results").default(sql`'[]'::jsonb`),
  
  confidenceScore: integer("confidence_score"),
  confidenceFactors: jsonb("confidence_factors").default(sql`'{}'::jsonb`),
  
  knowledgeGapDetected: boolean("knowledge_gap_detected").default(false),
  knowledgeGapDetails: text("knowledge_gap_details"),
  
  ledgerEntryId: varchar("ledger_entry_id").references(() => automationActionLedger.id, { onDelete: 'set null' }),
  
  tokenCount: integer("token_count"),
  responseTimeMs: integer("response_time_ms"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("trinity_conversation_turns_session_idx").on(table.sessionId),
  index("trinity_conversation_turns_number_idx").on(table.turnNumber),
  index("trinity_conversation_turns_role_idx").on(table.role),
]);

export const insertTrinityConversationTurnSchema = createInsertSchema(trinityConversationTurns).omit({
  id: true,
  createdAt: true,
});
export type InsertTrinityConversationTurn = z.infer<typeof insertTrinityConversationTurnSchema>;
export type TrinityConversationTurn = typeof trinityConversationTurns.$inferSelect;

export const knowledgeGapLogs = pgTable("knowledge_gap_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'set null' }),
  sessionId: varchar("session_id").references(() => trinityConversationSessions.id, { onDelete: 'set null' }),
  turnId: varchar("turn_id").references(() => trinityConversationTurns.id, { onDelete: 'set null' }),
  
  gapType: varchar("gap_type", { length: 50 }).notNull(),
  gapDescription: text("gap_description").notNull(),
  userQuery: text("user_query"),
  
  contextSnapshot: jsonb("context_snapshot"),
  
  resolutionStatus: varchar("resolution_status", { length: 30 }).default("open"),
  resolvedAt: timestamp("resolved_at"),
  resolutionMethod: varchar("resolution_method", { length: 50 }),
  resolutionDetails: text("resolution_details"),
  
  learningWorkflowId: varchar("learning_workflow_id"),
  learningCompleted: boolean("learning_completed").default(false),
  
  priority: varchar("priority", { length: 20 }).default("normal"),
  frequency: integer("frequency").default(1),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("knowledge_gap_logs_workspace_idx").on(table.workspaceId),
  index("knowledge_gap_logs_type_idx").on(table.gapType),
  index("knowledge_gap_logs_status_idx").on(table.resolutionStatus),
  index("knowledge_gap_logs_priority_idx").on(table.priority),
]);

export const insertKnowledgeGapLogSchema = createInsertSchema(knowledgeGapLogs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertKnowledgeGapLog = z.infer<typeof insertKnowledgeGapLogSchema>;
export type KnowledgeGapLog = typeof knowledgeGapLogs.$inferSelect;

// ============================================================================
// AI BRAIN WORKBOARD - CENTRALIZED JOB QUEUE & ORCHESTRATION
// ============================================================================

/**
 * Workboard request types - source of the work request
 */
export const workboardRequestTypeEnum = pgEnum('workboard_request_type', [
  'voice_command',     // Mobile voice command via Trinity
  'chat',              // HelpAI/Trinity chat message
  'direct_api',        // Direct API call
  'automation',        // Scheduled automation trigger
  'escalation',        // Escalated from another task
  'system'             // System-initiated task
]);

/**
 * Workboard task status - lifecycle states
 */
export const workboardTaskStatusEnum = pgEnum('workboard_task_status', [
  'pending',           // Waiting to be processed
  'analyzing',         // SubagentSupervisor analyzing intent
  'assigned',          // Assigned to a subagent
  'in_progress',       // Subagent actively working
  'awaiting_approval', // Requires human approval
  'completed',         // Successfully completed
  'failed',            // Failed with error
  'cancelled',         // Cancelled by user or system
  'escalated'          // Escalated to support
]);

/**
 * Workboard priority levels
 */
export const workboardPriorityEnum = pgEnum('workboard_priority', [
  'critical',   // Immediate attention required
  'high',       // Priority processing
  'normal',     // Standard queue position
  'low',        // Background processing
  'scheduled'   // Scheduled for later
]);

/**
 * Execution mode for AI automation tasks
 * - normal: Standard sequential execution (included with subscription)
 * - trinity_fast: Premium parallel execution using Trinity credits (2x multiplier)
 */
export const executionModeEnum = pgEnum('execution_mode', [
  'normal',       // Standard sequential processing
  'trinity_fast'  // Premium parallel execution using credits
]);

/**
 * AI Brain Workboard Tasks - Central job queue for all AI orchestration
 */
export const aiWorkboardTasks = pgTable("ai_workboard_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Request details
  requestType: workboardRequestTypeEnum("request_type").notNull().default('chat'),
  requestContent: text("request_content").notNull(), // Original request/transcript
  requestMetadata: jsonb("request_metadata").default({}), // Additional context (source, device, etc.)
  
  // Task classification
  intent: varchar("intent", { length: 100 }), // Detected intent
  category: varchar("category", { length: 50 }), // Business category (scheduling, payroll, etc.)
  confidence: decimal("confidence", { precision: 4, scale: 3 }), // Intent confidence (0.000-1.000)
  
  // Assignment
  assignedAgentId: varchar("assigned_agent_id", { length: 100 }), // SubagentSupervisor agent ID
  assignedAgentName: varchar("assigned_agent_name", { length: 100 }), // Human-readable agent name
  
  // Status tracking
  status: workboardTaskStatusEnum("status").notNull().default('pending'),
  priority: workboardPriorityEnum("priority").notNull().default('normal'),
  
  // Token/credit tracking
  estimatedTokens: integer("estimated_tokens").default(0),
  actualTokens: integer("actual_tokens"),
  creditsDeducted: boolean("credits_deducted").default(false),
  
  // Trinity Fast Mode - Premium parallel execution
  executionMode: executionModeEnum("execution_mode").notNull().default('normal'),
  fastModeCredits: integer("fast_mode_credits").default(0), // Credits charged for fast mode (2x multiplier)
  fastModeRequestedBy: varchar("fast_mode_requested_by", { length: 50 }), // 'trinity', 'voice', 'api'
  parallelGroupId: varchar("parallel_group_id"), // For grouping parallel fast mode tasks
  
  // Execution details
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  timeoutSeconds: integer("timeout_seconds").default(300), // 5 min default
  
  // Results
  result: jsonb("result"), // Task output/result data
  resultSummary: text("result_summary"), // Human-readable summary
  errorMessage: text("error_message"), // Error details if failed
  
  // Notification preferences
  notifyVia: text("notify_via").array().default(sql`ARRAY['trinity']::text[]`), // ['trinity', 'email', 'push', 'websocket']
  notificationSent: boolean("notification_sent").default(false),
  notifiedAt: timestamp("notified_at"),
  
  // Workflow chaining
  parentTaskId: varchar("parent_task_id"), // For subtasks
  childTaskIds: text("child_task_ids").array().default(sql`ARRAY[]::text[]`),
  workflowStep: integer("workflow_step").default(1),
  totalWorkflowSteps: integer("total_workflow_steps").default(1),
  
  // Audit trail
  statusHistory: jsonb("status_history").default(sql`'[]'::jsonb`), // [{status, timestamp, actor}]
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("ai_workboard_tasks_workspace_idx").on(table.workspaceId),
  index("ai_workboard_tasks_user_idx").on(table.userId),
  index("ai_workboard_tasks_status_idx").on(table.status),
  index("ai_workboard_tasks_priority_idx").on(table.priority),
  index("ai_workboard_tasks_agent_idx").on(table.assignedAgentId),
  index("ai_workboard_tasks_parent_idx").on(table.parentTaskId),
  index("ai_workboard_tasks_created_idx").on(table.createdAt),
  index("ai_workboard_tasks_execution_mode_idx").on(table.executionMode),
  index("ai_workboard_tasks_parallel_group_idx").on(table.parallelGroupId),
]);

export const insertAiWorkboardTaskSchema = createInsertSchema(aiWorkboardTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAiWorkboardTask = z.infer<typeof insertAiWorkboardTaskSchema>;
export type AiWorkboardTask = typeof aiWorkboardTasks.$inferSelect;

/**
 * AI Approval Requests - Universal approval queue for AI Brain, Trinity, and subagent requests
 */
export const aiApprovalRequests = pgTable("ai_approval_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Requester and approver
  requesterId: varchar("requester_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  approverId: varchar("approver_id").references(() => users.id, { onDelete: 'set null' }),
  
  // Source tracking
  sourceTaskId: varchar("source_task_id").references(() => aiWorkboardTasks.id, { onDelete: 'set null' }),
  sourceSystem: varchar("source_system", { length: 30 }).notNull().default('ai_brain'), // 'ai_brain', 'trinity', 'subagent'
  sourceAgentId: varchar("source_agent_id", { length: 100 }),
  
  // Request details
  requestType: varchar("request_type", { length: 50 }).notNull(), // 'action_approval', 'budget_approval', 'access_request', 'schedule_change'
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  requestPayload: jsonb("request_payload").default(sql`'{}'::jsonb`), // Details of what's being requested
  
  // Decision state
  decision: varchar("decision", { length: 20 }).notNull().default('pending'), // 'pending', 'approved', 'rejected', 'expired', 'cancelled'
  decisionAt: timestamp("decision_at"),
  decisionNote: text("decision_note"),
  decisionMetadata: jsonb("decision_metadata").default(sql`'{}'::jsonb`),
  
  // Priority and timing
  priority: varchar("priority", { length: 20 }).notNull().default('normal'), // 'low', 'normal', 'high', 'urgent'
  expiresAt: timestamp("expires_at"),
  
  // Token cost display
  estimatedTokens: integer("estimated_tokens").default(0),
  
  // Status history for audit trail
  statusHistory: jsonb("status_history").default(sql`'[]'::jsonb`), // [{decision, timestamp, actor, note}]
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("ai_approval_requests_workspace_idx").on(table.workspaceId),
  index("ai_approval_requests_requester_idx").on(table.requesterId),
  index("ai_approval_requests_approver_idx").on(table.approverId),
  index("ai_approval_requests_decision_idx").on(table.decision),
  index("ai_approval_requests_source_task_idx").on(table.sourceTaskId),
  index("ai_approval_requests_expires_idx").on(table.expiresAt),
]);

export const insertAiApprovalRequestSchema = createInsertSchema(aiApprovalRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAiApprovalRequest = z.infer<typeof insertAiApprovalRequestSchema>;
export type AiApprovalRequest = typeof aiApprovalRequests.$inferSelect;

// ============================================================================
// VISUAL QA SYSTEM - AI Brain Eyes
// ============================================================================

/**
 * Visual QA Runs - Tracks visual inspection sessions
 */
export const visualQaRuns = pgTable("visual_qa_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Trigger source
  triggerSource: varchar("trigger_source", { length: 50 }).notNull().default('manual'), // 'manual', 'scheduled', 'trinity', 'monitoring'
  triggeredBy: varchar("triggered_by").references(() => users.id, { onDelete: 'set null' }),
  
  // Target page
  pageUrl: text("page_url").notNull(),
  pageName: varchar("page_name", { length: 255 }),
  viewport: jsonb("viewport").default(sql`'{"width": 1920, "height": 1080}'::jsonb`), // { width, height, deviceName? }
  
  // Screenshot storage (object storage reference)
  screenshotRef: text("screenshot_ref"), // GCS/object storage URL
  screenshotBase64: text("screenshot_base64"), // Fallback for smaller images
  
  // Baseline comparison
  baselineId: varchar("baseline_id").references(() => visualQaBaselines.id, { onDelete: 'set null' }),
  
  // Status tracking
  status: varchar("status", { length: 20 }).notNull().default('pending'), // 'pending', 'capturing', 'analyzing', 'completed', 'failed', 'self_healing'
  
  // Analysis results
  analysisResult: jsonb("analysis_result").default(sql`'{}'::jsonb`), // Full Gemini response
  anomalyCount: integer("anomaly_count").default(0),
  selfHealAttempted: boolean("self_heal_attempted").default(false),
  selfHealSuccess: boolean("self_heal_success"),
  
  // Performance metrics
  captureTimeMs: integer("capture_time_ms"),
  analysisTimeMs: integer("analysis_time_ms"),
  totalTimeMs: integer("total_time_ms"),
  tokensUsed: integer("tokens_used").default(0),
  
  // Error tracking
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("visual_qa_runs_workspace_idx").on(table.workspaceId),
  index("visual_qa_runs_status_idx").on(table.status),
  index("visual_qa_runs_trigger_idx").on(table.triggerSource),
  index("visual_qa_runs_created_idx").on(table.createdAt),
]);

export const insertVisualQaRunSchema = createInsertSchema(visualQaRuns).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});
export type InsertVisualQaRun = z.infer<typeof insertVisualQaRunSchema>;
export type VisualQaRun = typeof visualQaRuns.$inferSelect;

/**
 * Visual QA Baselines - Reference screenshots for comparison
 */
export const visualQaBaselines = pgTable("visual_qa_baselines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Page identification
  pageId: varchar("page_id", { length: 255 }).notNull(), // Unique page identifier (e.g., '/dashboard', '/payroll')
  pageName: varchar("page_name", { length: 255 }),
  pageUrl: text("page_url").notNull(),
  
  // Viewport specification
  viewport: jsonb("viewport").default(sql`'{"width": 1920, "height": 1080}'::jsonb`),
  deviceName: varchar("device_name", { length: 100 }), // 'desktop', 'mobile', 'tablet', 'iPhone 15', etc.
  
  // Screenshot storage
  screenshotRef: text("screenshot_ref").notNull(), // Object storage URL
  screenshotHash: varchar("screenshot_hash", { length: 64 }), // SHA-256 for quick comparison
  
  // Design system metadata
  designHash: varchar("design_hash", { length: 64 }), // Hash of design_guidelines.md at capture time
  expectedElements: jsonb("expected_elements").default(sql`'[]'::jsonb`), // Key elements that should exist
  
  // Status
  isActive: boolean("is_active").default(true),
  version: integer("version").default(1),
  
  // Metadata
  capturedBy: varchar("captured_by").references(() => users.id, { onDelete: 'set null' }),
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("visual_qa_baselines_workspace_idx").on(table.workspaceId),
  index("visual_qa_baselines_page_idx").on(table.pageId),
  uniqueIndex("visual_qa_baselines_unique_idx").on(table.workspaceId, table.pageId, table.deviceName),
]);

export const insertVisualQaBaselineSchema = createInsertSchema(visualQaBaselines).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertVisualQaBaseline = z.infer<typeof insertVisualQaBaselineSchema>;
export type VisualQaBaseline = typeof visualQaBaselines.$inferSelect;

/**
 * Visual QA Findings - Individual anomalies detected
 */
export const visualQaFindings = pgTable("visual_qa_findings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull().references(() => visualQaRuns.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Finding details
  severity: varchar("severity", { length: 20 }).notNull().default('medium'), // 'critical', 'high', 'medium', 'low', 'info'
  category: varchar("category", { length: 50 }).notNull(), // 'broken_icon', 'layout_shift', 'text_overlap', 'missing_element', 'color_mismatch', 'font_issue'
  description: text("description").notNull(),
  
  // Location data
  boundingBox: jsonb("bounding_box"), // { y_min, x_min, y_max, x_max }
  elementSelector: text("element_selector"), // CSS selector if identifiable
  elementType: varchar("element_type", { length: 50 }), // 'button', 'icon', 'text', 'image', etc.
  
  // AI-suggested fix
  suggestedFix: text("suggested_fix"),
  suggestedCss: text("suggested_css"),
  confidence: decimal("confidence", { precision: 5, scale: 4 }).default('0.0'), // 0.0-1.0
  
  // Resolution tracking
  status: varchar("status", { length: 20 }).notNull().default('open'), // 'open', 'acknowledged', 'fixed', 'ignored', 'false_positive'
  resolvedBy: varchar("resolved_by").references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  
  // Self-healing tracking
  autoFixApplied: boolean("auto_fix_applied").default(false),
  autoFixResult: varchar("auto_fix_result", { length: 20 }), // 'success', 'failed', 'rolled_back'
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("visual_qa_findings_run_idx").on(table.runId),
  index("visual_qa_findings_workspace_idx").on(table.workspaceId),
  index("visual_qa_findings_severity_idx").on(table.severity),
  index("visual_qa_findings_category_idx").on(table.category),
  index("visual_qa_findings_status_idx").on(table.status),
]);

export const insertVisualQaFindingSchema = createInsertSchema(visualQaFindings).omit({
  id: true,
  createdAt: true,
});
export type InsertVisualQaFinding = z.infer<typeof insertVisualQaFindingSchema>;
export type VisualQaFinding = typeof visualQaFindings.$inferSelect;

// ============================================================================
// UNIVERSAL ACCESS CONTROL PANEL (UACP) - ABAC SYSTEM
// Fortune 500-grade Dynamic Attribute-Based Access Control
// ============================================================================

// Entity types for UACP
export const entityTypeEnum = pgEnum("entity_type", [
  "human", // Regular user
  "bot", // Automated bot
  "subagent", // AI subagent
  "trinity", // Trinity AI orchestrator
  "service", // Platform service
  "external", // External integration
]);

// Agent identity status
export const agentStatusEnum = pgEnum("agent_status", [
  "active",
  "suspended",
  "revoked",
  "pending_approval",
  "maintenance",
]);

// Policy effect
export const policyEffectEnum = pgEnum("policy_effect", [
  "allow",
  "deny",
  "require_approval",
]);

// Agent Identities - Non-human entities with full identity management
export const agentIdentities = pgTable("agent_identities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Identity
  agentId: varchar("agent_id", { length: 100 }).notNull().unique(), // e.g., "trinity-orchestrator", "subagent-payroll-001"
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  entityType: entityTypeEnum("entity_type").notNull().default("bot"),
  
  // Workspace isolation
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  isGlobal: boolean("is_global").default(false), // Platform-wide agents like Trinity
  
  // Authorization
  status: agentStatusEnum("status").notNull().default("active"),
  role: varchar("role", { length: 50 }), // Base RBAC role
  permissions: text("permissions").array(), // Explicit permissions
  deniedPermissions: text("denied_permissions").array(), // Explicit denials
  
  // Mission & Context
  missionObjective: text("mission_objective"), // Current assigned task/objective
  riskProfile: varchar("risk_profile", { length: 20 }).default("low"), // 'low', 'medium', 'high', 'critical'
  maxAutonomyLevel: integer("max_autonomy_level").default(3), // 1-5 scale
  
  // Token management
  tokenExpiryMinutes: integer("token_expiry_minutes").default(15), // Short-lived tokens
  lastTokenIssuedAt: timestamp("last_token_issued_at"),
  tokenCount24h: integer("token_count_24h").default(0), // Track authentication frequency
  
  // Tool access control
  allowedTools: text("allowed_tools").array(), // Explicit tool allowlist
  deniedTools: text("denied_tools").array(), // Explicit tool denylist
  allowedDomains: text("allowed_domains").array(), // AI Brain domains
  
  // Rate limiting
  requestsPerMinute: integer("requests_per_minute").default(60),
  requestsPerHour: integer("requests_per_hour").default(1000),
  currentMinuteRequests: integer("current_minute_requests").default(0),
  currentHourRequests: integer("current_hour_requests").default(0),
  lastRequestAt: timestamp("last_request_at"),
  
  // Audit trail
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  lastActiveAt: timestamp("last_active_at"),
  suspendedAt: timestamp("suspended_at"),
  suspendedBy: varchar("suspended_by").references(() => users.id, { onDelete: 'set null' }),
  suspensionReason: text("suspension_reason"),
}, (table) => [
  index("agent_identities_workspace_idx").on(table.workspaceId),
  index("agent_identities_status_idx").on(table.status),
  index("agent_identities_type_idx").on(table.entityType),
  index("agent_identities_agent_id_idx").on(table.agentId),
]);

export const insertAgentIdentitySchema = createInsertSchema(agentIdentities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAgentIdentity = z.infer<typeof insertAgentIdentitySchema>;
export type AgentIdentity = typeof agentIdentities.$inferSelect;

// Entity Attributes - Dynamic ABAC attributes for users and agents
export const entityAttributes = pgTable("entity_attributes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Entity reference (can be user or agent)
  entityType: entityTypeEnum("entity_type").notNull(),
  entityId: varchar("entity_id", { length: 255 }).notNull(), // User ID or Agent ID
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Attribute definition
  attributeName: varchar("attribute_name", { length: 100 }).notNull(),
  attributeValue: text("attribute_value").notNull(),
  attributeType: varchar("attribute_type", { length: 50 }).default("string"), // 'string', 'number', 'boolean', 'json', 'array'
  
  // Metadata
  source: varchar("source", { length: 50 }).default("manual"), // 'manual', 'auto', 'derived', 'external'
  expiresAt: timestamp("expires_at"), // For time-limited attributes
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
}, (table) => [
  index("entity_attributes_entity_idx").on(table.entityType, table.entityId),
  index("entity_attributes_workspace_idx").on(table.workspaceId),
  index("entity_attributes_name_idx").on(table.attributeName),
  uniqueIndex("entity_attributes_unique").on(table.entityType, table.entityId, table.attributeName, table.workspaceId),
]);

export const insertEntityAttributeSchema = createInsertSchema(entityAttributes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEntityAttribute = z.infer<typeof insertEntityAttributeSchema>;
export type EntityAttribute = typeof entityAttributes.$inferSelect;

// Access Policies - ABAC policy rules
export const accessPolicies = pgTable("access_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Policy identification
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  isGlobal: boolean("is_global").default(false), // Platform-wide policy
  
  // Policy definition
  effect: policyEffectEnum("effect").notNull().default("deny"),
  priority: integer("priority").default(100), // Lower = higher priority
  
  // Subject conditions (WHO)
  subjectConditions: jsonb("subject_conditions").notNull().default('{}'), // JSON rules for entity matching
  // e.g., { "entityType": "human", "role": ["manager", "admin"], "department": "finance" }
  
  // Resource conditions (WHAT)
  resourceType: varchar("resource_type", { length: 100 }).notNull(), // 'action', 'domain', 'endpoint', 'data'
  resourcePattern: varchar("resource_pattern", { length: 500 }).notNull(), // Pattern or specific resource
  
  // Context conditions (WHEN/WHERE)
  contextConditions: jsonb("context_conditions").default('{}'), // Time, location, device, risk
  // e.g., { "timeOfDay": "business_hours", "deviceType": ["desktop", "mobile"], "riskScore": { "max": 50 } }
  
  // Action constraints
  actions: text("actions").array(), // ['read', 'write', 'delete', 'execute']
  maxTransactionAmount: decimal("max_transaction_amount", { precision: 15, scale: 2 }), // Financial limit
  
  // Status
  isActive: boolean("is_active").default(true),
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
}, (table) => [
  index("access_policies_workspace_idx").on(table.workspaceId),
  index("access_policies_resource_idx").on(table.resourceType, table.resourcePattern),
  index("access_policies_priority_idx").on(table.priority),
  index("access_policies_active_idx").on(table.isActive),
]);

export const insertAccessPolicySchema = createInsertSchema(accessPolicies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAccessPolicy = z.infer<typeof insertAccessPolicySchema>;
export type AccessPolicy = typeof accessPolicies.$inferSelect;

// Access Control Events - Real-time audit trail for access changes
export const accessControlEvents = pgTable("access_control_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Event identification
  eventType: varchar("event_type", { length: 50 }).notNull(), // 'role_changed', 'permission_granted', 'access_suspended', etc.
  priority: varchar("priority", { length: 20 }).default("normal"), // 'low', 'normal', 'high', 'critical'
  
  // Actor (who made the change)
  actorType: entityTypeEnum("actor_type").notNull(),
  actorId: varchar("actor_id", { length: 255 }).notNull(),
  actorRole: varchar("actor_role", { length: 50 }),
  
  // Target (who was affected)
  targetType: entityTypeEnum("target_type").notNull(),
  targetId: varchar("target_id", { length: 255 }).notNull(),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Change details
  changeDetails: jsonb("change_details").notNull(), // Full change record
  previousState: jsonb("previous_state"), // State before change
  newState: jsonb("new_state"), // State after change
  
  // Policy enforcement
  policyId: varchar("policy_id").references(() => accessPolicies.id, { onDelete: 'set null' }),
  enforcementResult: varchar("enforcement_result", { length: 50 }), // 'allowed', 'denied', 'pending_approval'
  
  // Propagation tracking
  propagated: boolean("propagated").default(false),
  propagatedAt: timestamp("propagated_at"),
  propagationTargets: text("propagation_targets").array(), // Services that received the event
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("access_control_events_type_idx").on(table.eventType),
  index("access_control_events_actor_idx").on(table.actorType, table.actorId),
  index("access_control_events_target_idx").on(table.targetType, table.targetId),
  index("access_control_events_workspace_idx").on(table.workspaceId),
  index("access_control_events_created_idx").on(table.createdAt),
]);

// ============================================================================
// COGNITIVE SYSTEMS PERSISTENCE - FORTUNE 500 GRADE
// ============================================================================

// Knowledge Graph Entity Types Enum
export const knowledgeEntityTypeEnum = pgEnum("knowledge_entity_type", [
  "concept", "rule", "pattern", "fact", "procedure", 
  "constraint", "insight", "error_pattern", "success_pattern"
]);

// Knowledge Domain Enum
export const knowledgeDomainEnum = pgEnum("knowledge_domain", [
  "scheduling", "payroll", "compliance", "invoicing", "employees",
  "clients", "automation", "security", "performance", "general"
]);

// Knowledge Graph Entities - Persistent knowledge storage
export const knowledgeEntities = pgTable("knowledge_entities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  type: knowledgeEntityTypeEnum("type").notNull(),
  name: varchar("name", { length: 500 }).notNull(),
  description: text("description"),
  domain: knowledgeDomainEnum("domain").notNull(),
  attributes: jsonb("attributes").default('{}'),
  
  // Metrics
  confidence: doublePrecision("confidence").default(0.8),
  usageCount: integer("usage_count").default(0),
  lastAccessedAt: timestamp("last_accessed_at"),
  
  // Source tracking
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("knowledge_entities_domain_idx").on(table.domain),
  index("knowledge_entities_type_idx").on(table.type),
  index("knowledge_entities_workspace_idx").on(table.workspaceId),
]);

export const insertKnowledgeEntitySchema = createInsertSchema(knowledgeEntities).omit({
  id: true, createdAt: true, updatedAt: true, usageCount: true,
});
export type InsertKnowledgeEntity = z.infer<typeof insertKnowledgeEntitySchema>;
export type KnowledgeEntityRecord = typeof knowledgeEntities.$inferSelect;

// Knowledge Relationship Types Enum
export const knowledgeRelationTypeEnum = pgEnum("knowledge_relation_type", [
  "depends_on", "implies", "contradicts", "similar_to", "derived_from",
  "applies_to", "causes", "prevents", "requires", "enables"
]);

// Knowledge Graph Relationships
export const knowledgeRelationships = pgTable("knowledge_relationships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  sourceId: varchar("source_id").notNull().references(() => knowledgeEntities.id, { onDelete: 'cascade' }),
  targetId: varchar("target_id").notNull().references(() => knowledgeEntities.id, { onDelete: 'cascade' }),
  type: knowledgeRelationTypeEnum("type").notNull(),
  strength: doublePrecision("strength").default(0.8),
  metadata: jsonb("metadata").default('{}'),
  
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("knowledge_rel_source_idx").on(table.sourceId),
  index("knowledge_rel_target_idx").on(table.targetId),
  index("knowledge_rel_type_idx").on(table.type),
]);

export const insertKnowledgeRelationshipSchema = createInsertSchema(knowledgeRelationships).omit({
  id: true, createdAt: true,
});
export type InsertKnowledgeRelationship = z.infer<typeof insertKnowledgeRelationshipSchema>;
export type KnowledgeRelationshipRecord = typeof knowledgeRelationships.$inferSelect;

// Learning Entries - Knowledge acquisition tracking
export const knowledgeLearningEntries = pgTable("knowledge_learning_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  domain: knowledgeDomainEnum("domain").notNull(),
  agentId: varchar("agent_id", { length: 255 }).notNull(),
  action: varchar("action", { length: 500 }).notNull(),
  context: jsonb("context").default('{}'),
  outcome: varchar("outcome", { length: 50 }).notNull(), // success, failure, partial
  reward: doublePrecision("reward").default(0),
  insights: text("insights").array().default(sql`ARRAY[]::text[]`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("knowledge_learning_domain_idx").on(table.domain),
  index("knowledge_learning_agent_idx").on(table.agentId),
  index("knowledge_learning_workspace_idx").on(table.workspaceId),
]);

// A2A Agent Role Enum
export const a2aAgentRoleEnum = pgEnum("a2a_agent_role", [
  "coordinator", "executor", "validator", "analyst", "specialist", "monitor"
]);

// A2A Agent Status Enum
export const a2aAgentStatusEnum = pgEnum("a2a_agent_status", [
  "active", "busy", "offline", "suspended"
]);

// A2A Registered Agents
export const a2aAgents = pgTable("a2a_agents", {
  id: varchar("id").primaryKey(),
  
  name: varchar("name", { length: 255 }).notNull(),
  role: a2aAgentRoleEnum("role").notNull(),
  domain: knowledgeDomainEnum("domain").notNull(),
  capabilities: text("capabilities").array().default(sql`ARRAY[]::text[]`),
  
  // Trust and metrics
  trustScore: doublePrecision("trust_score").default(0.8),
  messagesSent: integer("messages_sent").default(0),
  messagesReceived: integer("messages_received").default(0),
  successRate: doublePrecision("success_rate").default(1.0),
  status: a2aAgentStatusEnum("status").default("active"),
  
  lastActiveAt: timestamp("last_active_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("a2a_agents_role_idx").on(table.role),
  index("a2a_agents_domain_idx").on(table.domain),
  index("a2a_agents_status_idx").on(table.status),
]);

// A2A Message Types Enum
export const a2aMessageTypeEnum = pgEnum("a2a_message_type", [
  "request", "response", "broadcast", "negotiation", "validation_request",
  "validation_result", "knowledge_share", "error_report", "status_update", "handoff"
]);

// A2A Message Priority Enum
export const a2aMessagePriorityEnum = pgEnum("a2a_message_priority", [
  "critical", "high", "normal", "low"
]);

// A2A Message Status Enum
export const a2aMessageStatusEnum = pgEnum("a2a_message_status", [
  "pending", "delivered", "processed", "expired", "failed"
]);

// A2A Messages - Inter-agent communication logs
export const a2aMessages = pgTable("a2a_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  fromAgent: varchar("from_agent", { length: 255 }).notNull(),
  toAgent: varchar("to_agent", { length: 255 }).notNull(),
  type: a2aMessageTypeEnum("type").notNull(),
  priority: a2aMessagePriorityEnum("priority").default("normal"),
  payload: jsonb("payload").default('{}'),
  
  correlationId: varchar("correlation_id", { length: 255 }),
  replyTo: varchar("reply_to", { length: 255 }),
  status: a2aMessageStatusEnum("status").default("pending"),
  metadata: jsonb("metadata").default('{}'),
  
  expiresAt: timestamp("expires_at"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("a2a_messages_from_idx").on(table.fromAgent),
  index("a2a_messages_to_idx").on(table.toAgent),
  index("a2a_messages_type_idx").on(table.type),
  index("a2a_messages_status_idx").on(table.status),
  index("a2a_messages_correlation_idx").on(table.correlationId),
  index("a2a_messages_created_idx").on(table.createdAt),
]);

// A2A Collaboration Teams
export const a2aTeams = pgTable("a2a_teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  name: varchar("name", { length: 255 }).notNull(),
  purpose: text("purpose"),
  coordinator: varchar("coordinator", { length: 255 }).notNull(),
  members: jsonb("members").default('[]'), // Array of TeamMember objects
  status: varchar("status", { length: 50 }).default("forming"), // forming, active, completing, disbanded
  taskId: varchar("task_id", { length: 255 }),
  results: jsonb("results"),
  
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("a2a_teams_coordinator_idx").on(table.coordinator),
  index("a2a_teams_status_idx").on(table.status),
]);

// A2A Trust Rules
export const a2aTrustRules = pgTable("a2a_trust_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  sourceAgent: varchar("source_agent", { length: 255 }).notNull(),
  targetAgent: varchar("target_agent", { length: 255 }).notNull(),
  dataType: varchar("data_type", { length: 255 }).notNull(),
  conditions: jsonb("conditions").default('[]'), // Array of TrustCondition objects
  trustLevel: varchar("trust_level", { length: 50 }).default("conditional"), // full, verified, conditional, none
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("a2a_trust_source_idx").on(table.sourceAgent),
  index("a2a_trust_target_idx").on(table.targetAgent),
]);

// RL Experience Outcome Enum
export const rlOutcomeEnum = pgEnum("rl_outcome", [
  "success", "failure", "partial", "escalated"
]);

// RL Experiences - Reinforcement learning history
export const rlExperiences = pgTable("rl_experiences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  agentId: varchar("agent_id", { length: 255 }).notNull(),
  domain: knowledgeDomainEnum("domain").notNull(),
  action: varchar("action", { length: 500 }).notNull(),
  
  // State representation
  stateData: jsonb("state_data").default('{}'), // Full state representation
  complexity: varchar("complexity", { length: 50 }).default("medium"),
  priorSuccessRate: doublePrecision("prior_success_rate").default(0.5),
  confidenceLevel: doublePrecision("confidence_level").default(0.5),
  
  // Outcome
  outcome: rlOutcomeEnum("outcome").notNull(),
  reward: doublePrecision("reward").default(0),
  humanIntervention: boolean("human_intervention").default(false),
  feedback: varchar("feedback", { length: 50 }), // positive, negative, neutral
  
  // Context
  contextWindow: jsonb("context_window").default('{}'),
  executionTimeMs: integer("execution_time_ms").default(0),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("rl_experiences_agent_idx").on(table.agentId),
  index("rl_experiences_domain_idx").on(table.domain),
  index("rl_experiences_action_idx").on(table.action),
  index("rl_experiences_outcome_idx").on(table.outcome),
  index("rl_experiences_workspace_idx").on(table.workspaceId),
  index("rl_experiences_created_idx").on(table.createdAt),
]);

// RL Confidence Models
export const rlConfidenceModels = pgTable("rl_confidence_models", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  agentId: varchar("agent_id", { length: 255 }).notNull(),
  domain: knowledgeDomainEnum("domain").notNull(),
  action: varchar("action", { length: 500 }).notNull(),
  
  baseConfidence: doublePrecision("base_confidence").default(0.5),
  adjustedConfidence: doublePrecision("adjusted_confidence").default(0.5),
  experienceCount: integer("experience_count").default(0),
  successRate: doublePrecision("success_rate").default(0.5),
  factors: jsonb("factors").default('[]'), // Array of ConfidenceFactor objects
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("rl_confidence_agent_idx").on(table.agentId),
  index("rl_confidence_domain_idx").on(table.domain),
  index("rl_confidence_action_idx").on(table.action),
  uniqueIndex("rl_confidence_unique_idx").on(table.agentId, table.domain, table.action),
]);

// RL Strategy Adaptations
export const rlStrategyAdaptations = pgTable("rl_strategy_adaptations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  agentId: varchar("agent_id", { length: 255 }).notNull(),
  domain: knowledgeDomainEnum("domain").notNull(),
  action: varchar("action", { length: 500 }).notNull(),
  
  previousStrategy: text("previous_strategy"),
  newStrategy: text("new_strategy"),
  triggerReason: text("trigger_reason"),
  expectedImprovement: doublePrecision("expected_improvement").default(0),
  validated: boolean("validated").default(false),
  validationResult: jsonb("validation_result"),
  
  appliedAt: timestamp("applied_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("rl_adaptations_agent_idx").on(table.agentId),
  index("rl_adaptations_domain_idx").on(table.domain),
  index("rl_adaptations_validated_idx").on(table.validated),
]);

// Domain Lead Supervisor Telemetry
export const supervisorTelemetry = pgTable("supervisor_telemetry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  supervisorId: varchar("supervisor_id", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 100 }).notNull(),
  
  // Metrics
  tasksAssigned: integer("tasks_assigned").default(0),
  tasksCompleted: integer("tasks_completed").default(0),
  tasksFailed: integer("tasks_failed").default(0),
  avgExecutionTimeMs: doublePrecision("avg_execution_time_ms").default(0),
  escalationCount: integer("escalation_count").default(0),
  
  // Status
  activeSubagents: integer("active_subagents").default(0),
  pendingTasks: integer("pending_tasks").default(0),
  lastHealthCheck: timestamp("last_health_check"),
  healthStatus: varchar("health_status", { length: 50 }).default("healthy"),
  
  // Period
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("supervisor_telemetry_supervisor_idx").on(table.supervisorId),
  index("supervisor_telemetry_domain_idx").on(table.domain),
  index("supervisor_telemetry_period_idx").on(table.periodStart),
]);

// LLM Judge Evaluation History
export const llmJudgeEvaluations = pgTable("llm_judge_evaluations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  evaluationType: varchar("evaluation_type", { length: 100 }).notNull(), // quality, risk, policy, regression
  subjectId: varchar("subject_id", { length: 255 }).notNull(), // What was evaluated
  subjectType: varchar("subject_type", { length: 100 }).notNull(), // action, hotpatch, response, output
  
  // Evaluation results
  verdict: varchar("verdict", { length: 50 }).notNull(), // approved, rejected, needs_review
  riskScore: doublePrecision("risk_score").default(0), // 0-100
  confidenceScore: doublePrecision("confidence_score").default(0),
  qualityScore: doublePrecision("quality_score").default(0),
  
  reasoning: text("reasoning"),
  criteria: jsonb("criteria").default('[]'), // Array of evaluation criteria
  policyViolations: text("policy_violations").array().default(sql`ARRAY[]::text[]`),
  
  // Context
  requestContext: jsonb("request_context").default('{}'),
  evaluatorModel: varchar("evaluator_model", { length: 100 }),
  evaluationTimeMs: integer("evaluation_time_ms").default(0),
  
  // Enforcement
  enforcementAction: varchar("enforcement_action", { length: 100 }), // blocked, allowed, flagged, escalated
  enforcedBy: varchar("enforced_by", { length: 255 }),
  
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("llm_judge_type_idx").on(table.evaluationType),
  index("llm_judge_subject_idx").on(table.subjectId, table.subjectType),
  index("llm_judge_verdict_idx").on(table.verdict),
  index("llm_judge_risk_idx").on(table.riskScore),
  index("llm_judge_workspace_idx").on(table.workspaceId),
  index("llm_judge_created_idx").on(table.createdAt),
]);

// LLM Judge Regression Memory - Track patterns of failures
export const llmJudgeRegressions = pgTable("llm_judge_regressions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  patternHash: varchar("pattern_hash", { length: 64 }).notNull(), // Hash of failure pattern
  actionType: varchar("action_type", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 100 }),
  
  // Pattern details
  failureSignature: text("failure_signature").notNull(),
  failureCount: integer("failure_count").default(1),
  lastFailureAt: timestamp("last_failure_at"),
  
  // Prevention
  preventionRule: text("prevention_rule"),
  isBlocked: boolean("is_blocked").default(false),
  blockReason: text("block_reason"),
  
  // Learning
  suggestedFix: text("suggested_fix"),
  fixApplied: boolean("fix_applied").default(false),
  fixResult: varchar("fix_result", { length: 50 }), // success, failed, partial
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("llm_judge_reg_pattern_idx").on(table.patternHash),
  index("llm_judge_reg_action_idx").on(table.actionType),
  index("llm_judge_reg_blocked_idx").on(table.isBlocked),
  uniqueIndex("llm_judge_reg_unique_idx").on(table.patternHash),
]);

// ============================================================================
// AI BRAIN ACTION LOG - AALV (AI Audit Log Viewer) Support Dashboard
// ============================================================================
// Centralized audit log for ALL AI Brain orchestrator actions, enabling
// support staff to view, filter, and investigate Trinity's autonomous actions.

export const aiBrainActionLogs = pgTable("ai_brain_action_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Workflow tracking
  workflowId: varchar("workflow_id", { length: 255 }), // Groups related actions
  
  // Actor identification
  actorType: varchar("actor_type", { length: 100 }).notNull(), // 'AI_BRAIN', 'RevenueOps Lead', 'Scheduling Subagent', 'Human User'
  actorId: varchar("actor_id", { length: 255 }).notNull(), // Instance ID or user ID
  
  // Action summary (main display line)
  actionSummary: text("action_summary").notNull(), // Human-readable action description
  status: varchar("status", { length: 50 }).notNull().default("initiated"), // 'COMPLETED', 'INITIATED', 'FAILED', 'TIMEOUT', 'PENDING_HIL'
  categoryTag: varchar("category_tag", { length: 100 }), // 'PLANNING', 'TOOL_USE', 'CHECKPOINT', 'DIAGNOSTICS', 'HIL_WAIT', 'AGENTIC_CODING'
  
  // Gemini metadata (collapsible detail data)
  geminiMetadata: jsonb("gemini_metadata").default('{}'), // { model_used, token_cost, thinking_level, thought_signature }
  
  // Input/Output data
  inputs: jsonb("inputs").default('{}'), // { target_file, grep_pattern, etc. }
  outputs: jsonb("outputs").default('{}'), // { code_diff, new_status, etc. }
  
  // Error tracking
  failureReason: text("failure_reason"),
  errorStack: text("error_stack"),
  
  // Workspace context (optional - some actions are platform-wide)
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'set null' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  
  // Execution metrics
  durationMs: integer("duration_ms"),
  tokenCost: integer("token_cost"),
  
  // Escalation tracking
  requiresHumanReview: boolean("requires_human_review").default(false),
  humanReviewedBy: varchar("human_reviewed_by").references(() => users.id, { onDelete: 'set null' }),
  humanReviewedAt: timestamp("human_reviewed_at"),
  humanReviewNotes: text("human_review_notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("ai_brain_action_workflow_idx").on(table.workflowId),
  index("ai_brain_action_actor_idx").on(table.actorType, table.actorId),
  index("ai_brain_action_status_idx").on(table.status),
  index("ai_brain_action_category_idx").on(table.categoryTag),
  index("ai_brain_action_workspace_idx").on(table.workspaceId),
  index("ai_brain_action_created_idx").on(table.createdAt),
  index("ai_brain_action_review_idx").on(table.requiresHumanReview),
]);

export const insertAiBrainActionLogSchema = createInsertSchema(aiBrainActionLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertAiBrainActionLog = z.infer<typeof insertAiBrainActionLogSchema>;
export type AiBrainActionLog = typeof aiBrainActionLogs.$inferSelect;

// ============================================================================
// AUTOMATION GOVERNANCE - AI Brain Pattern Learning System
// ============================================================================
// Tracks automation patterns, outcomes, and enables Trinity to learn from
// successful/failed automations to improve decision-making over time.

export const automationGovernanceStatusEnum = pgEnum('automation_governance_status', [
  'pending',
  'approved',
  'rejected',
  'executed',
  'failed',
  'rolled_back',
]);

export const automationGovernance = pgTable("automation_governance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Workspace context
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  
  // Action tracking
  actionType: varchar("action_type", { length: 100 }).notNull(), // 'schedule_change', 'payroll_run', 'invoice_create', etc.
  actionCategory: varchar("action_category", { length: 100 }).notNull(), // 'scheduling', 'payroll', 'billing', 'compliance', etc.
  actionSource: varchar("action_source", { length: 100 }).notNull(), // 'trinity_ai', 'user_request', 'automation_job', 'subagent'
  
  // Pattern identification
  patternHash: varchar("pattern_hash", { length: 64 }), // Hash of similar patterns for grouping
  patternDescription: text("pattern_description"), // Human-readable pattern description
  
  // Input/Output tracking
  inputData: jsonb("input_data").default('{}'), // What triggered the action
  outputData: jsonb("output_data").default('{}'), // What the action produced
  affectedEntities: jsonb("affected_entities").default('[]'), // List of entity IDs affected
  
  // Approval workflow
  status: automationGovernanceStatusEnum("status").notNull().default('pending'),
  requiresApproval: boolean("requires_approval").default(false),
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  
  // Execution tracking
  executedAt: timestamp("executed_at"),
  executionDurationMs: integer("execution_duration_ms"),
  
  // Outcome learning
  outcome: varchar("outcome", { length: 50 }), // 'success', 'failure', 'partial', 'timeout'
  outcomeScore: integer("outcome_score"), // 0-100 confidence score
  outcomeNotes: text("outcome_notes"),
  
  // Learning data
  confidenceLevel: integer("confidence_level").default(50), // 0-100, increases with successful patterns
  learningData: jsonb("learning_data").default('{}'), // AI Brain learning metadata
  similarPatternCount: integer("similar_pattern_count").default(0), // How many similar patterns exist
  
  // Rollback support
  canRollback: boolean("can_rollback").default(false),
  rollbackData: jsonb("rollback_data"), // Data needed to undo the action
  rolledBackAt: timestamp("rolled_back_at"),
  rolledBackBy: varchar("rolled_back_by").references(() => users.id, { onDelete: 'set null' }),
  
  // AI Brain job linkage
  aiBrainJobId: varchar("ai_brain_job_id").references(() => aiBrainJobs.id, { onDelete: 'set null' }),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("automation_gov_workspace_idx").on(table.workspaceId),
  index("automation_gov_action_type_idx").on(table.actionType),
  index("automation_gov_category_idx").on(table.actionCategory),
  index("automation_gov_status_idx").on(table.status),
  index("automation_gov_pattern_idx").on(table.patternHash),
  index("automation_gov_outcome_idx").on(table.outcome),
  index("automation_gov_created_idx").on(table.createdAt),
  index("automation_gov_confidence_idx").on(table.confidenceLevel),
]);

export const insertAutomationGovernanceSchema = createInsertSchema(automationGovernance).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAutomationGovernance = z.infer<typeof insertAutomationGovernanceSchema>;
export type AutomationGovernance = typeof automationGovernance.$inferSelect;

// ============================================================================
// TRINITY CONTROL CONSOLE - Real-Time Cognitive Streaming
// ============================================================================
// Captures Trinity's thought signatures and action logs for transparent
// AI Brain operation visibility. Enables real-time streaming of cognitive
// process to the Control Console frontend.

// Thought Signatures - The "Why" between tool calls
export const trinityThoughtSignatures = pgTable("trinity_thought_signatures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Session context
  sessionId: varchar("session_id", { length: 100 }).notNull(),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  
  // Workflow linkage
  runId: varchar("run_id").references(() => orchestrationRuns.id, { onDelete: 'cascade' }),
  
  // Thought content
  thoughtType: varchar("thought_type", { length: 50 }).notNull(), // 'reasoning', 'planning', 'diagnosis', 'reflection', 'decision', 'observation'
  content: text("content").notNull(), // Human-readable thought
  
  // Context and confidence
  context: jsonb("context"), // Additional context data
  confidence: integer("confidence"), // 0-100 confidence in this reasoning
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("trinity_thought_session_idx").on(table.sessionId),
  index("trinity_thought_workspace_idx").on(table.workspaceId),
  index("trinity_thought_user_idx").on(table.userId),
  index("trinity_thought_run_idx").on(table.runId),
  index("trinity_thought_type_idx").on(table.thoughtType),
  index("trinity_thought_created_idx").on(table.createdAt),
]);

export const insertTrinityThoughtSignatureSchema = createInsertSchema(trinityThoughtSignatures).omit({
  id: true,
  createdAt: true,
});

export type InsertTrinityThoughtSignature = z.infer<typeof insertTrinityThoughtSignatureSchema>;
export type TrinityThoughtSignature = typeof trinityThoughtSignatures.$inferSelect;

// Action Logs - The "What" of every tool execution
export const trinityActionLogs = pgTable("trinity_action_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Session context
  sessionId: varchar("session_id", { length: 100 }).notNull(),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  
  // Workflow and thought linkage
  runId: varchar("run_id").references(() => orchestrationRuns.id, { onDelete: 'cascade' }),
  thoughtId: varchar("thought_id").references(() => trinityThoughtSignatures.id, { onDelete: 'set null' }),
  
  // Action details
  actionType: varchar("action_type", { length: 50 }).notNull(), // 'tool_call', 'api_request', 'database_query', 'file_operation', 'ai_generation', 'notification', 'workflow_step'
  actionName: varchar("action_name", { length: 255 }).notNull(), // e.g., 'grep', 'write_file', 'db.select', 'gemini.generate'
  
  // Input/Output
  parameters: jsonb("parameters"), // Tool parameters
  result: jsonb("result"), // Tool result
  
  // Status and timing
  status: varchar("status", { length: 30 }).notNull(), // 'started', 'completed', 'failed', 'skipped'
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("trinity_action_session_idx").on(table.sessionId),
  index("trinity_action_workspace_idx").on(table.workspaceId),
  index("trinity_action_user_idx").on(table.userId),
  index("trinity_action_run_idx").on(table.runId),
  index("trinity_action_thought_idx").on(table.thoughtId),
  index("trinity_action_type_idx").on(table.actionType),
  index("trinity_action_status_idx").on(table.status),
  index("trinity_action_created_idx").on(table.createdAt),
]);

export const insertTrinityActionLogSchema = createInsertSchema(trinityActionLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertTrinityActionLog = z.infer<typeof insertTrinityActionLogSchema>;
export type TrinityActionLog = typeof trinityActionLogs.$inferSelect;

// Platform Awareness Events - What Trinity sees happening
export const platformAwarenessEvents = pgTable("platform_awareness_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Event identification
  eventType: varchar("event_type", { length: 100 }).notNull(),
  source: varchar("source", { length: 100 }).notNull(), // 'api', 'webhook', 'scheduler', 'user_action', 'ai_brain'
  
  // Resource affected
  resourceType: varchar("resource_type", { length: 100 }).notNull(), // 'employee', 'shift', 'invoice', 'notification', etc.
  resourceId: varchar("resource_id", { length: 255 }),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Operation
  operation: varchar("operation", { length: 30 }).notNull(), // 'create', 'update', 'delete', 'read'
  
  // Routing status
  routedThroughTrinity: boolean("routed_through_trinity").default(false),
  processedByTrinity: boolean("processed_by_trinity").default(false),
  
  // Metadata
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("platform_awareness_event_type_idx").on(table.eventType),
  index("platform_awareness_source_idx").on(table.source),
  index("platform_awareness_resource_idx").on(table.resourceType, table.resourceId),
  index("platform_awareness_workspace_idx").on(table.workspaceId),
  index("platform_awareness_routed_idx").on(table.routedThroughTrinity),
  index("platform_awareness_created_idx").on(table.createdAt),
]);

export const insertPlatformAwarenessEventSchema = createInsertSchema(platformAwarenessEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertPlatformAwarenessEvent = z.infer<typeof insertPlatformAwarenessEventSchema>;
export type PlatformAwarenessEvent = typeof platformAwarenessEvents.$inferSelect;

// ============================================================================
// TRINITY PLATFORM CONSCIOUSNESS - USER & ORG CONFIDENCE TRACKING
// ============================================================================

/**
 * Trust level progression for users interacting with Trinity
 * - new: First interactions, learning user preferences
 * - learning: Building understanding of user patterns
 * - established: Reliable interaction history
 * - expert: High confidence, can take more autonomous actions
 */
export const trinityTrustLevelEnum = pgEnum('trinity_trust_level', [
  'new',
  'learning', 
  'established',
  'expert'
]);

/**
 * Trinity User Confidence Stats - Aggregated confidence tracking per user/workspace
 * Tracks how well Trinity understands and serves each user over time
 */
export const trinityUserConfidenceStats = pgTable("trinity_user_confidence_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Session metrics
  totalSessions: integer("total_sessions").default(0),
  totalInteractions: integer("total_interactions").default(0),
  totalToolCalls: integer("total_tool_calls").default(0),
  successfulToolCalls: integer("successful_tool_calls").default(0),
  
  // Confidence tracking
  cumulativeConfidence: decimal("cumulative_confidence", { precision: 10, scale: 4 }).default("0"),
  averageConfidence: decimal("average_confidence", { precision: 5, scale: 4 }).default("0.5"),
  peakConfidence: decimal("peak_confidence", { precision: 5, scale: 4 }).default("0"),
  recentTrend: varchar("recent_trend", { length: 20 }).default("stable"), // 'improving', 'stable', 'declining'
  
  // Trust level progression
  trustLevel: trinityTrustLevelEnum("trust_level").default("new"),
  trustLevelUpdatedAt: timestamp("trust_level_updated_at"),
  
  // Escalation tracking
  totalEscalations: integer("total_escalations").default(0),
  escalationRate: decimal("escalation_rate", { precision: 5, scale: 4 }).default("0"),
  
  // Knowledge gap tracking
  totalKnowledgeGaps: integer("total_knowledge_gaps").default(0),
  resolvedKnowledgeGaps: integer("resolved_knowledge_gaps").default(0),
  
  // User preferences learned
  preferredTopics: text("preferred_topics").array().default(sql`'{}'`),
  communicationStyle: varchar("communication_style", { length: 30 }).default("balanced"), // 'concise', 'balanced', 'detailed'
  preferredActionLevel: varchar("preferred_action_level", { length: 30 }).default("guided"), // 'manual', 'guided', 'autonomous'
  
  // Engagement metrics
  avgSessionDurationMs: integer("avg_session_duration_ms"),
  avgResponseSatisfaction: decimal("avg_response_satisfaction", { precision: 3, scale: 2 }),
  lastActiveAt: timestamp("last_active_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("trinity_user_confidence_user_idx").on(table.userId),
  index("trinity_user_confidence_workspace_idx").on(table.workspaceId),
  index("trinity_user_confidence_trust_idx").on(table.trustLevel),
  index("trinity_user_confidence_active_idx").on(table.lastActiveAt),
]);

export const insertTrinityUserConfidenceStatsSchema = createInsertSchema(trinityUserConfidenceStats).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrinityUserConfidenceStats = z.infer<typeof insertTrinityUserConfidenceStatsSchema>;
export type TrinityUserConfidenceStats = typeof trinityUserConfidenceStats.$inferSelect;

/**
 * Trinity Org Intelligence Stats - Workspace-level aggregated insights
 * Provides org-wide view of Trinity effectiveness and common patterns
 */
export const trinityOrgStats = pgTable("trinity_org_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Aggregate user metrics
  totalActiveUsers: integer("total_active_users").default(0),
  totalUserSessions: integer("total_user_sessions").default(0),
  totalOrgInteractions: integer("total_org_interactions").default(0),
  
  // Org-wide confidence
  avgUserConfidence: decimal("avg_user_confidence", { precision: 5, scale: 4 }).default("0.5"),
  orgHealthScore: decimal("org_health_score", { precision: 3, scale: 2 }).default("0.5"), // 0-1 health score
  
  // Common patterns across users
  commonTopics: text("common_topics").array().default(sql`'{}'`),
  commonPainPoints: text("common_pain_points").array().default(sql`'{}'`),
  growthOpportunities: text("growth_opportunities").array().default(sql`'{}'`),
  
  // Business context
  businessContext: jsonb("business_context").default(sql`'{}'::jsonb`), // Industry, size, priorities
  trinityRelationshipLevel: varchar("trinity_relationship_level", { length: 30 }).default("onboarding"),
  
  // Feature adoption
  featuresUsed: text("features_used").array().default(sql`'{}'`),
  featureAdoptionScore: decimal("feature_adoption_score", { precision: 3, scale: 2 }).default("0"),
  
  // Automation metrics
  automationSuccessRate: decimal("automation_success_rate", { precision: 5, scale: 4 }),
  avgTaskCompletionTime: integer("avg_task_completion_time_ms"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  lastAggregatedAt: timestamp("last_aggregated_at"),
}, (table) => [
  index("trinity_org_stats_workspace_idx").on(table.workspaceId),
  index("trinity_org_stats_health_idx").on(table.orgHealthScore),
  index("trinity_org_stats_updated_idx").on(table.updatedAt),
]);

export const insertTrinityOrgStatsSchema = createInsertSchema(trinityOrgStats).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastAggregatedAt: true,
});
export type InsertTrinityOrgStats = z.infer<typeof insertTrinityOrgStatsSchema>;
export type TrinityOrgStats = typeof trinityOrgStats.$inferSelect;

// ============================================================================
// ORCHESTRATION OVERLAY SCHEMA - THIN LAYER REFERENCING EXISTING SYSTEMS
// ============================================================================

/**
 * ORCHESTRATION OVERLAY (Thin Pattern)
 * ------------------------------------
 * This is a THIN orchestration layer that references existing systems:
 * - WorkOrder from trinityWorkOrderSystem.ts (contains plan, tasks, results)
 * - ExecutionManifest from trinityExecutionFabric.ts (contains steps, validation)
 * 
 * This overlay ONLY adds:
 * 1. Phase state machine governance with runtime enforcement
 * 2. RBAC permission tracking wired to ToolCapabilityRegistry
 * 3. Cross-system correlation IDs
 * 4. Audit trail for orchestration decisions
 * 
 * It does NOT duplicate:
 * - Plan steps (stored in WorkOrder.taskGraph)
 * - Tool calls (stored in ExecutionManifest.steps)
 * - Outputs (stored in WorkOrder.solutionAttempts)
 * - Validation results (stored in ExecutionManifest.preflightChecks/postflightValidations)
 */

// Orchestration phase (state machine for cross-system coordination)
export const orchestrationPhaseEnum = pgEnum('orchestration_phase', [
  'intake',          // Received, parsing (WorkOrder intake)
  'planning',        // Decomposing (WorkOrder decomposition)
  'validating',      // Pre-flight checks (ExecutionManifest preflight)
  'executing',       // Running steps (ExecutionManifest execution)
  'reflecting',      // Post-execution analysis (Self-reflection)
  'committing',      // Finalizing results
  'completed',       // Successfully done
  'failed',          // Execution failed
  'rolled_back',     // Undone after failure
  'escalated'        // Handed to human
]);

// Permission check result
export const permissionResultEnum = pgEnum('permission_result', [
  'pending',         // Not yet checked
  'granted',         // All permissions granted
  'partial',         // Some permissions granted
  'denied',          // Permission denied
  'bypassed'         // Admin/AI bypass applied
]);

/**
 * Orchestration Overlay - Thin coordination layer between WorkOrder and ExecutionManifest
 * References existing IDs rather than duplicating data structures
 */
export const orchestrationOverlays = pgTable("orchestration_overlays", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // === CORRELATION IDS (Reference existing systems) ===
  workOrderId: varchar("work_order_id").notNull(), // Links to WorkOrder in trinityWorkOrderSystem
  executionManifestId: varchar("execution_manifest_id"), // Links to ExecutionManifest in trinityExecutionFabric
  workboardTaskId: varchar("workboard_task_id"), // Links to aiWorkboardTasks if applicable
  conversationId: varchar("conversation_id"), // Links to conversation session
  
  // === CONTEXT ===
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  subagentId: varchar("subagent_id", { length: 100 }), // Which subagent is executing
  domain: varchar("domain", { length: 50 }).notNull(), // 'scheduling', 'payroll', 'invoice', etc.
  
  // === STATE MACHINE (Runtime Enforced) ===
  phase: orchestrationPhaseEnum("phase").default("intake").notNull(),
  previousPhase: orchestrationPhaseEnum("previous_phase"), // For transition validation
  phaseEnteredAt: timestamp("phase_entered_at").defaultNow(),
  phaseTransitionCount: integer("phase_transition_count").default(0),
  
  // Phase history stored as JSONB for audit
  phaseHistory: jsonb("phase_history").default('[]'), // Array of PhaseTransition
  
  // === RBAC ENFORCEMENT (Wired to ToolCapabilityRegistry) ===
  requiredPermissions: text("required_permissions").array().default(sql`'{}'`), // Permissions needed
  grantedPermissions: text("granted_permissions").array().default(sql`'{}'`), // Permissions granted
  deniedPermissions: text("denied_permissions").array().default(sql`'{}'`), // Permissions denied
  permissionResult: permissionResultEnum("permission_result").default("pending"),
  permissionCheckedAt: timestamp("permission_checked_at"),
  permissionCheckedBy: varchar("permission_checked_by"), // 'auth_service' | 'tool_registry' | 'bypass'
  permissionDeniedReason: text("permission_denied_reason"),
  
  // === ESCALATION ===
  requiresEscalation: boolean("requires_escalation").default(false),
  escalationReason: text("escalation_reason"),
  escalatedTo: varchar("escalated_to"),
  escalatedAt: timestamp("escalated_at"),
  
  // === CONFIDENCE (Aggregated from underlying systems) ===
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 4 }).default("0"),
  confidenceLevel: varchar("confidence_level", { length: 20 }).default("none"), // 'none', 'low', 'medium', 'high', 'certain'
  
  // === TIMING ===
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  totalDurationMs: integer("total_duration_ms"),
  
  // === ORCHESTRATION AUDIT (Coordination decisions only) ===
  auditTrail: jsonb("audit_trail").default('[]'), // Orchestration-level decisions
  
}, (table) => [
  index("orch_overlay_work_order_idx").on(table.workOrderId),
  index("orch_overlay_manifest_idx").on(table.executionManifestId),
  index("orch_overlay_workspace_idx").on(table.workspaceId),
  index("orch_overlay_user_idx").on(table.userId),
  index("orch_overlay_subagent_idx").on(table.subagentId),
  index("orch_overlay_phase_idx").on(table.phase),
  index("orch_overlay_permission_idx").on(table.permissionResult),
  index("orch_overlay_created_idx").on(table.createdAt),
]);

export const insertOrchestrationOverlaySchema = createInsertSchema(orchestrationOverlays).omit({
  id: true,
  createdAt: true,
});

export type InsertOrchestrationOverlay = z.infer<typeof insertOrchestrationOverlaySchema>;
export type OrchestrationOverlay = typeof orchestrationOverlays.$inferSelect;

// ============================================================================
// ZOD SCHEMAS FOR ORCHESTRATION SUB-STRUCTURES
// ============================================================================

/**
 * PhaseTransition - Record of state machine transition (runtime enforced)
 */
export const phaseTransitionSchema = z.object({
  fromPhase: z.enum([
    'intake', 'planning', 'validating', 'executing', 
    'reflecting', 'committing', 'completed', 'failed', 
    'rolled_back', 'escalated'
  ]).nullable(),
  toPhase: z.enum([
    'intake', 'planning', 'validating', 'executing', 
    'reflecting', 'committing', 'completed', 'failed', 
    'rolled_back', 'escalated'
  ]),
  reason: z.string().optional(),
  triggeredBy: z.enum(['system', 'user', 'subagent', 'timeout', 'error', 'orchestrator']).default('system'),
  enteredAt: z.string().datetime(),
  exitedAt: z.string().datetime().optional(),
  durationMs: z.number().optional(),
  validatedByStateMachine: z.boolean().default(false), // TRUE if transition was validated at runtime
});

export type PhaseTransition = z.infer<typeof phaseTransitionSchema>;

/**
 * OrchestrationAuditEntry - Audit entry for orchestration decisions
 */
export const orchestrationAuditEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  eventType: z.enum([
    'overlay_created',
    'phase_transition_requested',
    'phase_transition_validated',
    'phase_transition_rejected',
    'permission_check_started',
    'permission_granted',
    'permission_denied',
    'permission_bypassed',
    'escalation_triggered',
    'rollback_initiated',
    'orchestration_completed'
  ]),
  details: z.record(z.any()).optional(),
  actor: z.enum(['system', 'user', 'subagent', 'orchestrator', 'auth_service']).default('system'),
  actorId: z.string().optional(),
});

export type OrchestrationAuditEntry = z.infer<typeof orchestrationAuditEntrySchema>;

// ============================================================================
// VALID PHASE TRANSITIONS (State Machine Definition)
// ============================================================================

/**
 * State machine transition rules - used for runtime enforcement
 */
export const VALID_PHASE_TRANSITIONS: Record<string, string[]> = {
  'null': ['intake'],
  'intake': ['planning', 'failed', 'escalated'],
  'planning': ['validating', 'failed', 'escalated'],
  'validating': ['executing', 'failed', 'escalated'],
  'executing': ['reflecting', 'failed', 'escalated'],
  'reflecting': ['committing', 'executing', 'failed', 'escalated'], // Can retry via executing
  'committing': ['completed', 'failed', 'escalated'],
  'completed': [], // Terminal state
  'failed': ['rolled_back', 'escalated'], // Can rollback or escalate
  'rolled_back': [], // Terminal state
  'escalated': [], // Terminal state (human takes over)
};

/**
 * Validate phase transition according to state machine rules
 * This function MUST be called before any phase change
 */
export function isValidPhaseTransition(
  from: string | null, 
  to: string
): boolean {
  const key = from === null ? 'null' : from;
  return VALID_PHASE_TRANSITIONS[key]?.includes(to) ?? false;
}

/**
 * Get allowed next phases from current phase
 */
export function getAllowedNextPhases(currentPhase: string | null): string[] {
  const key = currentPhase === null ? 'null' : currentPhase;
  return VALID_PHASE_TRANSITIONS[key] ?? [];
}

/**
 * Check if phase is terminal (no further transitions allowed)
 */
export function isTerminalPhase(phase: string): boolean {
  return VALID_PHASE_TRANSITIONS[phase]?.length === 0;
}

/**
 * Calculate confidence level from numeric score
 */
export function getConfidenceLevel(score: number): 'none' | 'low' | 'medium' | 'high' | 'certain' {
  if (score <= 0) return 'none';
  if (score < 0.4) return 'low';
  if (score < 0.7) return 'medium';
  if (score < 0.95) return 'high';
  return 'certain';
}

// ============================================================================
// PLATFORM COMPONENT REGISTRY (PCR) - Trinity Full Platform Awareness
// ============================================================================

/**
 * Component domain categories for Trinity awareness
 */
export const componentDomainEnum = pgEnum('component_domain', [
  'schema',        // Database schema definitions
  'service',       // Backend services
  'handler',       // Request handlers
  'hook',          // React hooks
  'page',          // Frontend pages
  'component',     // UI components
  'manager',       // State managers
  'loader',        // Loading/async components
  'utility',       // Utility functions
  'asset',         // Static assets (images, fonts, etc.)
  'config',        // Configuration files
  'test',          // Test files
  'subagent',      // AI Brain subagents
  'orchestration', // Orchestration services
]);

/**
 * Component criticality levels
 */
export const componentCriticalityEnum = pgEnum('component_criticality', [
  'critical',   // System-breaking if fails
  'core',       // Core functionality
  'feature',    // Feature-level importance
  'utility',    // Helper/utility level
  'cosmetic',   // UI/UX only
]);

/**
 * Gap finding severity levels
 */
export const gapSeverityEnum = pgEnum('gap_severity', [
  'critical',   // System-breaking, immediate fix needed
  'high',       // Major functionality affected
  'medium',     // Feature affected but workarounds exist
  'low',        // Minor issues or improvements
  'info',       // Informational findings
]);

/**
 * Gap finding types
 */
export const gapTypeEnum = pgEnum('gap_type', [
  'typescript_error',   // TypeScript compilation errors
  'schema_mismatch',    // Database schema mismatches
  'code_quality',       // Code quality issues
  'missing_handler',    // Missing route/handler
  'missing_hook',       // Missing or broken hook
  'missing_component',  // Missing UI component
  'orphaned_file',      // Unused/orphaned file
  'security_issue',     // Security vulnerability
  'performance_issue',  // Performance bottleneck
  'accessibility',      // A11y violations
  'visual_anomaly',     // Visual QA findings
  'log_error',          // Errors detected in logs
  'integration_gap',    // Missing integration
  'capability_gap',     // Missing AI capability
]);

/**
 * Workflow approval status
 */
export const workflowApprovalStatusEnum = pgEnum('workflow_approval_status', [
  'pending',     // Awaiting approval
  'approved',    // Approved by authorized user
  'rejected',    // Rejected by authorized user
  'expired',     // Approval window expired
  'executed',    // Fix has been applied
  'failed',      // Fix execution failed
  'rolled_back', // Fix was rolled back
]);

/**
 * Platform Component Registry - Central registry of all platform components
 * Trinity uses this to find, understand, and fix any component
 */
export const aiComponentRegistry = pgTable("ai_component_registry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Component identification
  filePath: varchar("file_path", { length: 500 }).notNull().unique(),
  componentName: varchar("component_name", { length: 200 }).notNull(),
  displayName: varchar("display_name", { length: 200 }), // Human-friendly name for UNS
  
  // Classification
  domain: componentDomainEnum("domain").notNull(),
  criticality: componentCriticalityEnum("criticality").default("utility"),
  
  // Ownership and context
  ownerService: varchar("owner_service", { length: 100 }), // Which service owns this
  ownerSubagent: varchar("owner_subagent", { length: 100 }), // Which subagent manages this
  
  // Content metadata
  description: text("description"), // AI-generated or manual description
  exports: text("exports").array().default(sql`ARRAY[]::text[]`), // Exported symbols
  dependencies: text("dependencies").array().default(sql`ARRAY[]::text[]`), // Import dependencies
  dependents: text("dependents").array().default(sql`ARRAY[]::text[]`), // Files that depend on this
  
  // Version tracking
  lastCommitHash: varchar("last_commit_hash", { length: 40 }),
  lastModifiedAt: timestamp("last_modified_at"),
  lastScannedAt: timestamp("last_scanned_at"),
  
  // Trinity awareness metadata
  trinityNotes: text("trinity_notes"), // Notes for Trinity about this component
  fixPriority: integer("fix_priority").default(50), // 1-100, higher = more important to fix
  autoFixAllowed: boolean("auto_fix_allowed").default(false), // Can Trinity auto-fix without approval?
  
  // Statistics
  errorCount: integer("error_count").default(0),
  warningCount: integer("warning_count").default(0),
  lastErrorAt: timestamp("last_error_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("pcr_file_path_idx").on(table.filePath),
  index("pcr_domain_idx").on(table.domain),
  index("pcr_criticality_idx").on(table.criticality),
  index("pcr_owner_service_idx").on(table.ownerService),
  index("pcr_owner_subagent_idx").on(table.ownerSubagent),
]);

export const insertAiComponentRegistrySchema = createInsertSchema(aiComponentRegistry).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiComponentRegistry = z.infer<typeof insertAiComponentRegistrySchema>;
export type AiComponentRegistry = typeof aiComponentRegistry.$inferSelect;

/**
 * Component Tags - Flexible tagging for component discovery
 */
export const aiComponentTags = pgTable("ai_component_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  componentId: varchar("component_id").notNull().references(() => aiComponentRegistry.id, { onDelete: 'cascade' }),
  tag: varchar("tag", { length: 100 }).notNull(),
  tagCategory: varchar("tag_category", { length: 50 }), // 'feature', 'tech', 'status', etc.
  addedBy: varchar("added_by", { length: 50 }).default("scanner"), // 'scanner', 'manual', 'trinity'
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("pct_component_idx").on(table.componentId),
  index("pct_tag_idx").on(table.tag),
  uniqueIndex("pct_component_tag_unique").on(table.componentId, table.tag),
]);

export const insertAiComponentTagSchema = createInsertSchema(aiComponentTags).omit({
  id: true,
  createdAt: true,
});

export type InsertAiComponentTag = z.infer<typeof insertAiComponentTagSchema>;
export type AiComponentTag = typeof aiComponentTags.$inferSelect;

/**
 * Capability Links - Maps components to AI Brain capabilities they enable
 */
export const aiCapabilityLinks = pgTable("ai_capability_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  componentId: varchar("component_id").notNull().references(() => aiComponentRegistry.id, { onDelete: 'cascade' }),
  
  // Capability reference
  capabilityAction: varchar("capability_action", { length: 200 }).notNull(), // e.g., 'scheduling.forecast_staffing'
  capabilityDomain: varchar("capability_domain", { length: 100 }), // e.g., 'scheduling'
  
  // Relationship type
  relationshipType: varchar("relationship_type", { length: 50 }).default("provides"), // 'provides', 'requires', 'extends'
  
  // Metadata
  description: text("description"),
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("pcl_component_idx").on(table.componentId),
  index("pcl_capability_idx").on(table.capabilityAction),
  index("pcl_domain_idx").on(table.capabilityDomain),
]);

export const insertAiCapabilityLinkSchema = createInsertSchema(aiCapabilityLinks).omit({
  id: true,
  createdAt: true,
});

export type InsertAiCapabilityLink = z.infer<typeof insertAiCapabilityLinkSchema>;
export type AiCapabilityLink = typeof aiCapabilityLinks.$inferSelect;

/**
 * Gap Findings - Issues detected by Trinity's intelligence systems
 */
export const aiGapFindings = pgTable("ai_gap_findings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Location
  componentId: varchar("component_id").references(() => aiComponentRegistry.id, { onDelete: 'set null' }),
  filePath: varchar("file_path", { length: 500 }),
  lineNumber: integer("line_number"),
  columnNumber: integer("column_number"),
  
  // Classification
  gapType: gapTypeEnum("gap_type").notNull(),
  severity: gapSeverityEnum("severity").notNull(),
  domain: componentDomainEnum("domain"),
  
  // Details
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description").notNull(),
  technicalDetails: text("technical_details"), // Full error message, stack trace, etc.
  endUserSummary: text("end_user_summary"), // Human-friendly summary for UNS
  
  // Detection metadata
  detectedBy: varchar("detected_by", { length: 100 }).notNull(), // Which scanner/subagent found this
  detectionMethod: varchar("detection_method", { length: 100 }), // 'typescript_lsp', 'visual_qa', 'log_scan', etc.
  detectionConfidence: decimal("detection_confidence", { precision: 5, scale: 4 }).default("1.0"),
  
  // Evidence
  screenshotUrl: varchar("screenshot_url", { length: 500 }), // Visual QA screenshot
  logExcerpt: text("log_excerpt"), // Relevant log lines
  codeSnippet: text("code_snippet"), // Relevant code
  
  // Suggested fix
  suggestedFix: text("suggested_fix"), // AI-generated fix suggestion
  suggestedFixAgent: varchar("suggested_fix_agent", { length: 100 }), // Which subagent should fix this
  fixComplexity: varchar("fix_complexity", { length: 20 }).default("medium"), // 'trivial', 'simple', 'medium', 'complex', 'major'
  estimatedFixMinutes: integer("estimated_fix_minutes"),
  
  // Status tracking
  status: varchar("status", { length: 50 }).default("open"), // 'open', 'in_progress', 'fixed', 'wont_fix', 'duplicate'
  fixedAt: timestamp("fixed_at"),
  fixedBy: varchar("fixed_by", { length: 100 }), // User ID or subagent ID
  fixCommitHash: varchar("fix_commit_hash", { length: 40 }),
  
  // Approval workflow
  approvalRequestId: varchar("approval_request_id"),
  requiresApproval: boolean("requires_approval").default(true),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("gf_component_idx").on(table.componentId),
  index("gf_file_path_idx").on(table.filePath),
  index("gf_gap_type_idx").on(table.gapType),
  index("gf_severity_idx").on(table.severity),
  index("gf_status_idx").on(table.status),
  index("gf_detected_by_idx").on(table.detectedBy),
  index("gf_created_idx").on(table.createdAt),
]);

export const insertAiGapFindingSchema = createInsertSchema(aiGapFindings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiGapFinding = z.infer<typeof insertAiGapFindingSchema>;
export type AiGapFinding = typeof aiGapFindings.$inferSelect;

/**
 * Workflow Approvals - Human-in-the-loop approval for autonomous fixes
 */
export const aiWorkflowApprovals = pgTable("ai_workflow_approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // What needs approval
  gapFindingId: varchar("gap_finding_id").references(() => aiGapFindings.id, { onDelete: 'cascade' }),
  workOrderId: varchar("work_order_id"),
  
  // Approval details
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description").notNull(),
  endUserSummary: text("end_user_summary"), // Human-friendly for UNS
  
  // What will be changed
  affectedFiles: text("affected_files").array().default(sql`ARRAY[]::text[]`),
  proposedChanges: jsonb("proposed_changes"), // Diff or change description
  rollbackPlan: text("rollback_plan"),
  
  // Risk assessment
  riskLevel: varchar("risk_level", { length: 20 }).default("medium"), // 'low', 'medium', 'high', 'critical'
  impactScope: varchar("impact_scope", { length: 50 }), // 'single_file', 'feature', 'module', 'platform_wide'
  estimatedDowntime: varchar("estimated_downtime", { length: 50 }),
  
  // Approval requirements
  requiredRole: varchar("required_role", { length: 50 }).default("support_manager"), // Min role to approve
  requiredApprovers: integer("required_approvers").default(1),
  expiresAt: timestamp("expires_at"), // Approval expires after this time
  
  // Status
  status: workflowApprovalStatusEnum("status").default("pending"),
  
  // Approval tracking
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  approvalNotes: text("approval_notes"),
  rejectedBy: varchar("rejected_by"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  
  // Execution tracking
  executedAt: timestamp("executed_at"),
  executionResult: jsonb("execution_result"),
  executionError: text("execution_error"),
  commitHash: varchar("commit_hash", { length: 40 }),
  workflowRestarted: boolean("workflow_restarted").default(false),
  
  // UNS notification
  unsNotificationId: varchar("uns_notification_id"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("wa_gap_finding_idx").on(table.gapFindingId),
  index("wa_work_order_idx").on(table.workOrderId),
  index("wa_status_idx").on(table.status),
  index("wa_expires_idx").on(table.expiresAt),
  index("wa_created_idx").on(table.createdAt),
]);

export const insertAiWorkflowApprovalSchema = createInsertSchema(aiWorkflowApprovals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiWorkflowApproval = z.infer<typeof insertAiWorkflowApprovalSchema>;
export type AiWorkflowApproval = typeof aiWorkflowApprovals.$inferSelect;

/**
 * Trinity Self-Awareness Facts - Trinity's knowledge about herself and the platform
 */
export const trinitySelfAwareness = pgTable("trinity_self_awareness", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Fact categorization
  category: varchar("category", { length: 100 }).notNull(), // 'persona', 'capability', 'constraint', 'platform', 'history'
  subcategory: varchar("subcategory", { length: 100 }),
  
  // Fact content
  factKey: varchar("fact_key", { length: 200 }).notNull(),
  factValue: text("fact_value").notNull(),
  factType: varchar("fact_type", { length: 50 }).default("text"), // 'text', 'json', 'number', 'boolean', 'list'
  
  // Metadata
  source: varchar("source", { length: 100 }).default("system"), // 'system', 'learned', 'configured'
  confidence: decimal("confidence", { precision: 5, scale: 4 }).default("1.0"),
  lastVerifiedAt: timestamp("last_verified_at"),
  
  // Versioning
  version: integer("version").default(1),
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("tsa_category_idx").on(table.category),
  index("tsa_fact_key_idx").on(table.factKey),
  uniqueIndex("tsa_category_key_unique").on(table.category, table.factKey),
]);

export const insertTrinitySelfAwarenessSchema = createInsertSchema(trinitySelfAwareness).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTrinitySelfAwareness = z.infer<typeof insertTrinitySelfAwarenessSchema>;
export type TrinitySelfAwareness = typeof trinitySelfAwareness.$inferSelect;

// ============================================================================
// TRINITY UNIFIED TASK SCHEMA - Re-exports
// ============================================================================

export {
  // Enums
  trinityTaskStatusEnum,
  trinityTaskPhaseEnum,
  trinityStepStatusEnum,
  trinityRiskLevelEnum,
  
  // Zod Schemas
  TrinityIntentSchema,
  TrinityToolCallSchema,
  TrinityTaskStepSchema,
  TrinityReflectionSchema,
  TrinityTaskOutputSchema,
  TrinityStateTransitionSchema,
  TrinityTaskSchema,
  
  // Types
  type TrinityIntent,
  type TrinityToolCall,
  type TrinityTaskStep,
  type TrinityReflection,
  type TrinityTaskOutput,
  type TrinityStateTransition,
  type TrinityTask,
  
  // Database table and types
  aiBrainTasks,
  insertAiBrainTaskSchema,
  type InsertAiBrainTask,
  type AiBrainTask,
  
  // Conversion utilities
  fromSubagentContext,
  fromAgentExecutionContext,
  stepsFromExecutionPlan,
  toSubagentExecutionResult,
  createTrinityTask,
} from './trinityTaskSchema';
