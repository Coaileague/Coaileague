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
  boolean,
  pgEnum,
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
  
  // Unique Work ID for action tracking (format: Firstname-##-###-##-####)
  workId: varchar("work_id").unique(),
  
  // Multi-tenant
  currentWorkspaceId: varchar("current_workspace_id"),
  
  // Security
  lastLoginAt: timestamp("last_login_at"),
  loginAttempts: integer("login_attempts").default(0),
  lockedUntil: timestamp("locked_until"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

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
  organizationSerial: varchar("organization_serial").unique(), // Format: ORG-XXXX-XXXX (Enterprise license key)
  
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

// Platform Support Staff Roles (WFOS Organization - Platform Level)
// Platform Admin → Deputy Admin → Deputy Assistant → Sysop
export const platformRoleEnum = pgEnum('platform_role', [
  'platform_admin',      // Creator - Highest authority
  'deputy_admin',        // Assistant to creator  
  'deputy_assistant',    // Deputy assistant
  'sysop',              // System operators/help support staff
  'none'                // Regular subscriber user (not platform staff)
]);

// Subscriber/Workspace Roles (Customer Organizations - Subscriber Level)
// Owner (Client) → Manager → Supervisor → Employee
export const workspaceRoleEnum = pgEnum('workspace_role', [
  'owner',              // Client/Subscriber - Organization owner
  'manager',            // Manager - Mid-level authority
  'supervisor',         // Supervisor - Oversees employees
  'employee'            // Employee - Frontline worker
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
  
  // Employment details
  role: varchar("role"), // e.g., "Technician", "Consultant", "Driver" - job title
  workspaceRole: workspaceRoleEnum("workspace_role").default("employee"), // Permission level
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
  reviewerId: varchar("reviewer_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  
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

export const shiftStatusEnum = pgEnum('shift_status', ['scheduled', 'in_progress', 'completed', 'cancelled']);

// Shifts (Scheduled time blocks)
export const shifts = pgTable("shifts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: 'set null' }),
  
  // Shift details
  title: varchar("title"),
  description: text("description"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  
  // Smart Schedule™ tracking
  aiGenerated: boolean("ai_generated").default(false),
  requiresAcknowledgment: boolean("requires_acknowledgment").default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
  
  // Status and tracking
  status: shiftStatusEnum("status").default('scheduled'),
  
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
  startTime: z.string().or(z.date()),
  endTime: z.string().or(z.date()),
});

export type InsertShift = z.infer<typeof insertShiftSchema>;
export type Shift = typeof shifts.$inferSelect;

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
  
  // BillOS™ Integration
  status: varchar("status").default('pending'), // 'pending', 'approved', 'rejected', 'billed'
  invoiceId: varchar("invoice_id").references(() => invoices.id, { onDelete: 'set null' }),
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

// ExpenseOS™ - Employee Expense Management
export const expenseStatusEnum = pgEnum('expense_status', ['pending', 'approved', 'rejected', 'reimbursed']);

export const expenseReports = pgTable("expense_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  
  // Expense details
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  category: varchar("category").notNull(), // 'mileage', 'meals', 'supplies', 'travel', 'other'
  description: text("description").notNull(),
  expenseDate: timestamp("expense_date").notNull(),
  
  // Receipt
  receiptImageUrl: varchar("receipt_image_url"), // Cloud storage URL
  receiptUploadedAt: timestamp("receipt_uploaded_at"),
  
  // Job/Client association
  clientId: varchar("client_id").references(() => clients.id, { onDelete: 'set null' }),
  shiftId: varchar("shift_id").references(() => shifts.id, { onDelete: 'set null' }),
  
  // Approval workflow
  status: expenseStatusEnum("status").default('pending'),
  approvedBy: varchar("approved_by").references(() => employees.id, { onDelete: 'set null' }),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  
  // Reimbursement (auto-included in next payroll run)
  reimbursedInPayrollId: varchar("reimbursed_in_payroll_id"), // Link to payroll run
  reimbursedAt: timestamp("reimbursed_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertExpenseReportSchema = createInsertSchema(expenseReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertExpenseReport = z.infer<typeof insertExpenseReportSchema>;
export type ExpenseReport = typeof expenseReports.$inferSelect;

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

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
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
// ENTERPRISE FEATURES - Audit Trail System
// ============================================================================

export const auditActionEnum = pgEnum('audit_action', [
  'create', 'update', 'delete', 
  'login', 'logout', 
  'clock_in', 'clock_out',
  'generate_invoice', 'payment_received',
  'assign_manager', 'remove_manager'
]);

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Actor information
  userId: varchar("user_id").notNull().references(() => users.id),
  userEmail: varchar("user_email").notNull(), // Denormalized for audit trail persistence
  userRole: varchar("user_role").notNull(), // Role at time of action
  
  // Action details
  action: auditActionEnum("action").notNull(),
  entityType: varchar("entity_type").notNull(), // 'employee', 'shift', 'invoice', etc.
  entityId: varchar("entity_id").notNull(),
  
  // Change tracking
  changes: jsonb("changes"), // { before: {...}, after: {...} }
  metadata: jsonb("metadata"), // Additional context (API endpoint, feature flag, etc.)
  
  // Request context
  ipAddress: varchar("ip_address").notNull(),
  userAgent: text("user_agent").notNull(), // Required for SOC2/GDPR traceability
  requestId: varchar("request_id"), // For correlating related actions
  
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
  timeEntryId: varchar("time_entry_id").references(() => timeEntries.id, { onDelete: 'cascade' }),
  
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  accuracy: decimal("accuracy", { precision: 6, scale: 2 }), // meters
  
  address: varchar("address"),
  verified: boolean("verified").default(false),
  deviceInfo: jsonb("device_info"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

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
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by").references(() => users.id),
  
  // Verification for chatroom access (gatekeeper MOMJJ)
  verifiedAt: timestamp("verified_at"),
  verifiedBy: varchar("verified_by").references(() => users.id), // Support staff who verified
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;

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
  message: text("message").notNull(),
  messageType: varchar("message_type").default("text"), // 'text', 'file', 'system'
  isSystemMessage: boolean("is_system_message").default(false), // For breach notifications and system announcements (shown in gray)
  
  // File attachments
  attachmentUrl: varchar("attachment_url"),
  attachmentName: varchar("attachment_name"),
  
  // Status
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertChatConversationSchema = createInsertSchema(chatConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertChatConversation = z.infer<typeof insertChatConversationSchema>;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

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
// HELPDESK SYSTEM - Professional Support Chat Rooms
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

// AI Usage Logs - Track AI assistant costs for subscriber billing (they pay, we don't)
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
export const motdAcknowledgments = pgTable("motd_acknowledgments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  motdId: varchar("motd_id").notNull().references(() => motdMessages.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  acknowledgedAt: timestamp("acknowledged_at").defaultNow(),
});

export const insertMotdAcknowledgmentSchema = createInsertSchema(motdAcknowledgments).omit({
  id: true,
  acknowledgedAt: true,
});

export type InsertMotdAcknowledgment = z.infer<typeof insertMotdAcknowledgmentSchema>;
export type MotdAcknowledgment = typeof motdAcknowledgments.$inferSelect;

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
// PREDICTIONOS™ - AI-Powered Predictive Analytics (Monopolistic Feature #1)
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
// CUSTOM WORKFLOW RULES - Visual Rule Builder (Monopolistic Feature #2)
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
  updatedBy: varchar("updated_by").references(() => users.id),
  
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

// Performance Reviews - Data-driven compensation recommendations
export const performanceReviews = pgTable("performance_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  
  // Review period
  reviewPeriodStart: timestamp("review_period_start").notNull(),
  reviewPeriodEnd: timestamp("review_period_end").notNull(),
  reviewType: varchar("review_type").notNull(), // 'annual', 'quarterly', 'probation', 'promotion'
  
  // Auto-calculated performance metrics (from Unified Data Nexus)
  shiftsCompletedOnTime: integer("shifts_completed_on_time").default(0),
  totalShiftsAssigned: integer("total_shifts_assigned").default(0),
  attendanceRate: decimal("attendance_rate", { precision: 5, scale: 2 }), // Percentage
  averageHoursWorkedPerWeek: decimal("average_hours_worked_per_week", { precision: 5, scale: 2 }),
  overtimeHours: decimal("overtime_hours", { precision: 10, scale: 2 }),
  
  // Report quality metrics (ReportOS™ integration)
  reportsSubmitted: integer("reports_submitted").default(0),
  reportsApproved: integer("reports_approved").default(0),
  reportsRejected: integer("reports_rejected").default(0),
  reportQualityScore: decimal("report_quality_score", { precision: 5, scale: 2 }), // 0-100%
  
  // Compliance & safety
  complianceViolations: integer("compliance_violations").default(0),
  safetyIncidents: integer("safety_incidents").default(0),
  trainingCompletionRate: decimal("training_completion_rate", { precision: 5, scale: 2 }),
  
  // Subjective ratings (manager input)
  qualityOfWorkRating: integer("quality_of_work_rating"), // 1-5
  teamworkRating: integer("teamwork_rating"), // 1-5
  communicationRating: integer("communication_rating"), // 1-5
  initiativeRating: integer("initiative_rating"), // 1-5
  
  // Overall composite score (auto-calculated from weighted metrics)
  compositeScore: decimal("composite_score", { precision: 5, scale: 2 }), // 0-100%
  performanceTier: varchar("performance_tier"), // 'exceptional', 'exceeds', 'meets', 'needs_improvement', 'unsatisfactory'
  
  // Auto-generated pay increase recommendation
  currentHourlyRate: decimal("current_hourly_rate", { precision: 10, scale: 2 }),
  suggestedPayIncrease: decimal("suggested_pay_increase", { precision: 10, scale: 2 }), // Dollar amount
  suggestedPayIncreasePercentage: decimal("suggested_pay_increase_percentage", { precision: 5, scale: 2 }),
  payIncreaseFormula: text("pay_increase_formula"), // "Base 3% + 0.5% per attendance point + 1% for quality > 90%"
  payIncreaseJustification: text("pay_increase_justification"),
  
  // Manager override
  managerApprovedIncrease: decimal("manager_approved_increase", { precision: 10, scale: 2 }),
  managerOverrideReason: text("manager_override_reason"),
  
  // Review lifecycle
  status: varchar("status").default("draft"), // 'draft', 'pending_manager', 'completed', 'archived'
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  managerComments: text("manager_comments"),
  employeeComments: text("employee_comments"), // Self-reflection
  employeeAcknowledgedAt: timestamp("employee_acknowledged_at"),
  
  // Goals & development (feeds into Career Pathing)
  goalsMet: jsonb("goals_met").$type<string[]>().default(sql`'[]'`),
  goalsNotMet: jsonb("goals_not_met").$type<string[]>().default(sql`'[]'`),
  nextQuarterGoals: jsonb("next_quarter_goals").$type<string[]>().default(sql`'[]'`),
  developmentNeeds: jsonb("development_needs").$type<string[]>().default(sql`'[]'`), // Links to LearnOS™
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  employeeIndex: index("performance_reviews_employee_idx").on(table.employeeId, table.reviewPeriodEnd),
  workspaceStatusIndex: index("performance_reviews_workspace_status_idx").on(table.workspaceId, table.status),
}));

export const insertPerformanceReviewSchema = createInsertSchema(performanceReviews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPerformanceReview = z.infer<typeof insertPerformanceReviewSchema>;
export type PerformanceReview = typeof performanceReviews.$inferSelect;

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
  billableAmount: decimal("billable_amount", { precision: 10, scale: 2 }),
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
