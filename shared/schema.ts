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

// ============================================================================
// NOTIFICATION SYSTEM TABLES - AI Brain & Support Staff Integration
// ============================================================================

// Platform updates from AI brain (What's New badge updates)
export const platformUpdates = pgTable("platform_updates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Update metadata
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  category: varchar("category").notNull(), // 'feature', 'improvement', 'fix', 'announcement'
  priority: varchar("priority").default("normal"), // 'low', 'normal', 'high', 'critical'
  
  // AI tracking
  generatedByAi: boolean("generated_by_ai").default(false),
  aiInsightType: varchar("ai_insight_type"), // 'scheduling_optimization', 'performance_alert', 'compliance', 'efficiency_tip'
  aiConfidenceScore: doublePrecision("ai_confidence_score"), // 0-1 score for AI-generated updates
  
  // Content enrichment
  icon: varchar("icon"), // Lucide icon name for display
  url: varchar("url"), // Link to details page
  affectedFeatures: text("affected_features").array(), // Array of feature names impacted
  
  // Visibility & engagement
  isVisible: boolean("is_visible").default(true),
  viewCount: integer("view_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("platform_updates_workspace_idx").on(table.workspaceId),
  index("platform_updates_category_idx").on(table.category),
  index("platform_updates_priority_idx").on(table.priority),
  index("platform_updates_created_idx").on(table.createdAt),
  index("platform_updates_ai_idx").on(table.generatedByAi),
]);

export const insertPlatformUpdateSchema = createInsertSchema(platformUpdates).omit({
  id: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPlatformUpdate = z.infer<typeof insertPlatformUpdateSchema>;
export type PlatformUpdate = typeof platformUpdates.$inferSelect;

// Maintenance alerts from support staff (notification bell alerts)
export const maintenanceAlerts = pgTable("maintenance_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  createdById: varchar("created_by_id").references(() => users.id, { onDelete: 'set null' }),
  
  // Alert details
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  severity: varchar("severity").notNull(), // 'info', 'warning', 'critical'
  
  // Timing
  scheduledStartTime: timestamp("scheduled_start_time").notNull(),
  scheduledEndTime: timestamp("scheduled_end_time").notNull(),
  actualStartTime: timestamp("actual_start_time"),
  actualEndTime: timestamp("actual_end_time"),
  
  // Impact
  affectedServices: text("affected_services").array().notNull(), // Array of service names
  estimatedImpactMinutes: integer("estimated_impact_minutes"),
  
  // Status tracking
  status: varchar("status").default("scheduled"), // 'scheduled', 'in_progress', 'completed', 'cancelled'
  isBroadcast: boolean("is_broadcast").default(false), // Sent to all workspaces if true
  
  // Admin tracking
  acknowledgedByCount: integer("acknowledged_by_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("maintenance_alerts_workspace_idx").on(table.workspaceId),
  index("maintenance_alerts_status_idx").on(table.status),
  index("maintenance_alerts_severity_idx").on(table.severity),
  index("maintenance_alerts_scheduled_idx").on(table.scheduledStartTime),
  index("maintenance_alerts_created_idx").on(table.createdAt),
]);

export const insertMaintenanceAlertSchema = createInsertSchema(maintenanceAlerts).omit({
  id: true,
  acknowledgedByCount: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMaintenanceAlert = z.infer<typeof insertMaintenanceAlertSchema>;
export type MaintenanceAlert = typeof maintenanceAlerts.$inferSelect;

// User notification history (for tracking what users have seen)
export const notificationHistory = pgTable("notification_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  
  // Notification reference
  type: varchar("type").notNull(), // 'platform_update', 'maintenance_alert', 'ai_insight', 'custom'
  referenceId: varchar("reference_id"), // ID of the related record (e.g., platformUpdates.id)
  
  // Engagement tracking
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  isArchived: boolean("is_archived").default(false),
  archivedAt: timestamp("archived_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("notification_history_user_idx").on(table.userId),
  index("notification_history_workspace_idx").on(table.workspaceId),
  index("notification_history_type_idx").on(table.type),
  index("notification_history_read_idx").on(table.isRead),
  index("notification_history_created_idx").on(table.createdAt),
]);

export const insertNotificationHistorySchema = createInsertSchema(notificationHistory).omit({
  id: true,
  readAt: true,
  archivedAt: true,
  createdAt: true,
});

export type InsertNotificationHistory = z.infer<typeof insertNotificationHistorySchema>;
export type NotificationHistory = typeof notificationHistory.$inferSelect;

// User acknowledgment of maintenance alerts
export const maintenanceAcknowledgments = pgTable("maintenance_acknowledgments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alertId: varchar("alert_id").notNull().references(() => maintenanceAlerts.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  acknowledgedAt: timestamp("acknowledged_at").defaultNow(),
}, (table) => [
  index("maintenance_acks_alert_idx").on(table.alertId),
  index("maintenance_acks_user_idx").on(table.userId),
  uniqueIndex("maintenance_acks_unique").on(table.alertId, table.userId),
]);

export const insertMaintenanceAcknowledgmentSchema = createInsertSchema(maintenanceAcknowledgments).omit({
  id: true,
  acknowledgedAt: true,
});

export type InsertMaintenanceAcknowledgment = z.infer<typeof insertMaintenanceAcknowledgmentSchema>;
export type MaintenanceAcknowledgment = typeof maintenanceAcknowledgments.$inferSelect;

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
  stripeAccountId: varchar("stripe_account_id"),

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

// Theme customization per workspace
export const workspaceThemes = pgTable("workspace_themes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }).unique(),

  // Colors
  primaryColor: varchar("primary_color").default("#3b82f6"),
  secondaryColor: varchar("secondary_color").default("#8b5cf6"),
  accentColor: varchar("accent_color").default("#ec4899"),
  
  // Typography
  fontFamily: varchar("font_family").default("sans-serif"),
  
  // Branding
  logoUrl: varchar("logo_url"),
  logoSize: integer("logo_size").default(32),
  
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

export const platformRoleEnum = pgEnum('platform_role', [
  'superadmin',
  'admin',
  'moderator',
  'user'
]);

export const workspaceRoleEnum = pgEnum('workspace_role', [
  'owner',
  'admin',
  'manager',
  'employee',
  'contractor'
]);

export const leaderCapabilityEnum = pgEnum('leader_capability', [
  'communication',
  'problem_solving',
  'decision_making',
  'delegation',
  'motivation'
]);

export const roleCapabilities = pgTable("role_capabilities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  role: workspaceRoleEnum("role").notNull().unique(),
  
  capabilities: text("capabilities").array().notNull(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertRoleCapabilitySchema = createInsertSchema(roleCapabilities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRoleCapability = z.infer<typeof insertRoleCapabilitySchema>;
export type RoleCapability = typeof roleCapabilities.$inferSelect;

export const leaderActionEnum = pgEnum('leader_action', [
  'COMMUNICATION_INITIATED',
  'MEETING_SCHEDULED',
  'FEEDBACK_PROVIDED',
  'DECISION_MADE',
  'TEAM_MOTIVATED',
  'CONFLICT_RESOLVED',
  'STRATEGIC_PLAN_SET'
]);

export const leaderActions = pgTable("leader_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  leaderId: varchar("leader_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  action: leaderActionEnum("action").notNull(),
  description: text("description"),
  impact: varchar("impact"), // 'low', 'medium', 'high'
  targetTeamSize: integer("target_team_size"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("leader_actions_workspace_idx").on(table.workspaceId),
  index("leader_actions_leader_idx").on(table.leaderId),
  index("leader_actions_action_idx").on(table.action),
  index("leader_actions_created_idx").on(table.createdAt),
]);

export const insertLeaderActionSchema = createInsertSchema(leaderActions).omit({
  id: true,
  createdAt: true,
});

export type InsertLeaderAction = z.infer<typeof insertLeaderActionSchema>;
export type LeaderAction = typeof leaderActions.$inferSelect;

export const escalationStatusEnum = pgEnum('escalation_status', [
  'open',
  'in_progress',
  'resolved',
  'closed'
]);

export const escalationCategoryEnum = pgEnum('escalation_category', [
  'performance',
  'conduct',
  'attendance',
  'compliance',
  'other'
]);

export const escalationTickets = pgTable("escalation_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  createdById: varchar("created_by_id").notNull().references(() => users.id, { onDelete: 'restrict' }),
  
  category: escalationCategoryEnum("category").notNull(),
  status: escalationStatusEnum("status").default("open"),
  
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  severity: varchar("severity"), // 'low', 'medium', 'high', 'critical'
  
  dueDate: timestamp("due_date"),
  resolvedAt: timestamp("resolved_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("escalation_tickets_workspace_idx").on(table.workspaceId),
  index("escalation_tickets_employee_idx").on(table.employeeId),
  index("escalation_tickets_status_idx").on(table.status),
  index("escalation_tickets_category_idx").on(table.category),
  index("escalation_tickets_created_idx").on(table.createdAt),
]);

export const insertEscalationTicketSchema = createInsertSchema(escalationTickets).omit({
  id: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEscalationTicket = z.infer<typeof insertEscalationTicketSchema>;
export type EscalationTicket = typeof escalationTickets.$inferSelect;

export const employees = pgTable("employees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  email: varchar("email").notNull(),
  phone: varchar("phone"),
  
  department: varchar("department"),
  position: varchar("position"),
  employeeType: varchar("employee_type"), // 'full-time', 'part-time', 'contractor'
  
  hireDate: timestamp("hire_date"),
  terminationDate: timestamp("termination_date"),
  
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("employees_workspace_idx").on(table.workspaceId),
  index("employees_user_idx").on(table.userId),
  index("employees_email_idx").on(table.email),
]);

export const insertEmployeeSchema = createInsertSchema(employees).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

export const employeeSkills = pgTable("employee_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  
  skillName: varchar("skill_name").notNull(),
  proficiencyLevel: varchar("proficiency_level"), // 'beginner', 'intermediate', 'advanced', 'expert'
  yearsExperience: integer("years_experience"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("employee_skills_employee_idx").on(table.employeeId),
]);

export const insertEmployeeSkillSchema = createInsertSchema(employeeSkills).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeSkill = z.infer<typeof insertEmployeeSkillSchema>;
export type EmployeeSkill = typeof employeeSkills.$inferSelect;

export const employeeMetrics = pgTable("employee_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => employees.id, { onDelete: 'cascade' }),
  
  totalHoursWorked: doublePrecision("total_hours_worked").default(0),
  tasksCompleted: integer("tasks_completed").default(0),
  performanceScore: doublePrecision("performance_score"), // 0-100
  attendanceRate: doublePrecision("attendance_rate"), // percentage 0-100
  
  lastUpdatedAt: timestamp("last_updated_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("employee_metrics_employee_idx").on(table.employeeId),
]);

export const insertEmployeeMetricsSchema = createInsertSchema(employeeMetrics).omit({
  id: true,
  lastUpdatedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployeeMetrics = z.infer<typeof insertEmployeeMetricsSchema>;
export type EmployeeMetrics = typeof employeeMetrics.$inferSelect;

export const migrationDocumentTypeEnum = pgEnum('migration_document_type', [
  'payroll', 'tax', 'employee_records', 'benefits', 'other'
]);

export const migrationJobStatusEnum = pgEnum('migration_job_status', [
  'pending', 'in_progress', 'completed', 'failed'
]);

export const migrationJobs = pgTable("migration_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  sourceSystem: varchar("source_system").notNull(),
  targetSystem: varchar("target_system").notNull(),
  status: migrationJobStatusEnum("status").default("pending"),
  
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  
  totalRecords: integer("total_records"),
  migratedRecords: integer("migrated_records").default(0),
  failedRecords: integer("failed_records").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("migration_jobs_workspace_idx").on(table.workspaceId),
  index("migration_jobs_status_idx").on(table.status),
  index("migration_jobs_created_idx").on(table.createdAt),
]);

export const insertMigrationJobSchema = createInsertSchema(migrationJobs).omit({
  id: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMigrationJob = z.infer<typeof insertMigrationJobSchema>;
export type MigrationJob = typeof migrationJobs.$inferSelect;

export const migrationDocuments = pgTable("migration_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  migrationJobId: varchar("migration_job_id").notNull().references(() => migrationJobs.id, { onDelete: 'cascade' }),
  
  documentType: migrationDocumentTypeEnum("document_type").notNull(),
  fileName: varchar("file_name").notNull(),
  fileUrl: varchar("file_url"),
  fileSize: integer("file_size"),
  
  uploadedAt: timestamp("uploaded_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("migration_documents_job_idx").on(table.migrationJobId),
  index("migration_documents_type_idx").on(table.documentType),
]);

export const insertMigrationDocumentSchema = createInsertSchema(migrationDocuments).omit({
  id: true,
  uploadedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMigrationDocument = z.infer<typeof insertMigrationDocumentSchema>;
export type MigrationDocument = typeof migrationDocuments.$inferSelect;

export const migrationRecords = pgTable("migration_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  migrationJobId: varchar("migration_job_id").notNull().references(() => migrationJobs.id, { onDelete: 'cascade' }),
  
  sourceRecordId: varchar("source_record_id"),
  targetRecordId: varchar("target_record_id"),
  
  status: varchar("status"), // 'pending', 'in_progress', 'completed', 'failed'
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("migration_records_job_idx").on(table.migrationJobId),
  index("migration_records_status_idx").on(table.status),
]);

export const insertMigrationRecordSchema = createInsertSchema(migrationRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMigrationRecord = z.infer<typeof insertMigrationRecordSchema>;
export type MigrationRecord = typeof migrationRecords.$inferSelect;

export const contractorPool = pgTable("contractor_pool", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  email: varchar("email").notNull(),
  phone: varchar("phone"),
  
  specialization: varchar("specialization"),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  
  isAvailable: boolean("is_available").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("contractor_pool_workspace_idx").on(table.workspaceId),
  index("contractor_pool_email_idx").on(table.email),
]);

export const insertContractorPoolSchema = createInsertSchema(contractorPool).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContractorPool = z.infer<typeof insertContractorPoolSchema>;
export type ContractorPool = typeof contractorPool.$inferSelect;

export const contractorSkills = pgTable("contractor_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractorId: varchar("contractor_id").notNull().references(() => contractorPool.id, { onDelete: 'cascade' }),
  
  skillName: varchar("skill_name").notNull(),
  proficiencyLevel: varchar("proficiency_level"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("contractor_skills_contractor_idx").on(table.contractorId),
]);

export const insertContractorSkillSchema = createInsertSchema(contractorSkills).omit({
  id: true,
  createdAt: true,
});

export type InsertContractorSkill = z.infer<typeof insertContractorSkillSchema>;
export type ContractorSkill = typeof contractorSkills.$inferSelect;

export const contractorCertifications = pgTable("contractor_certifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractorId: varchar("contractor_id").notNull().references(() => contractorPool.id, { onDelete: 'cascade' }),
  
  certificationName: varchar("certification_name").notNull(),
  issuingBody: varchar("issuing_body"),
  expiryDate: timestamp("expiry_date"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("contractor_certs_contractor_idx").on(table.contractorId),
  index("contractor_certs_expiry_idx").on(table.expiryDate),
]);

export const insertContractorCertificationSchema = createInsertSchema(contractorCertifications).omit({
  id: true,
  createdAt: true,
});

export type InsertContractorCertification = z.infer<typeof insertContractorCertificationSchema>;
export type ContractorCertification = typeof contractorCertifications.$inferSelect;

export const userFeedback = pgTable("user_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  type: varchar("type").notNull(), // 'bug', 'feature_request', 'suggestion', 'general'
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  
  status: varchar("status").default("new"), // 'new', 'under_review', 'planned', 'in_progress', 'completed', 'rejected'
  priority: varchar("priority").default("medium"), // 'low', 'medium', 'high'
  
  upvoteCount: integer("upvote_count").default(0),
  downvoteCount: integer("downvote_count").default(0),
  commentCount: integer("comment_count").default(0),
  
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
