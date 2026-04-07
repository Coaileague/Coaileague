import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, date, time } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const celebrationTemplates = pgTable("celebration_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  eventType: varchar("event_type").notNull(),
  templateText: text("template_text").notNull(),
  deliveryChannel: varchar("delivery_channel").default('dm'),
  requiresApproval: boolean("requires_approval").default(false),
  approvalRole: varchar("approval_role").default('supervisor'),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertCelebrationTemplatesSchema = createInsertSchema(celebrationTemplates).omit({ id: true });
export type InsertCelebrationTemplates = z.infer<typeof insertCelebrationTemplatesSchema>;
export type CelebrationTemplates = typeof celebrationTemplates.$inferSelect;

export const milestoneTracker = pgTable("milestone_tracker", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  milestoneType: varchar("milestone_type").notNull(),
  milestoneDate: date("milestone_date").notNull(),
  triggeredAt: timestamp("triggered_at").default(sql`now()`),
  actionTaken: jsonb("action_taken"),
  celebrationMessageSent: boolean("celebration_message_sent").default(false),
  managerNotified: boolean("manager_notified").default(false),
  acknowledged: boolean("acknowledged").default(false),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertMilestoneTrackerSchema = createInsertSchema(milestoneTracker).omit({ id: true });
export type InsertMilestoneTracker = z.infer<typeof insertMilestoneTrackerSchema>;
export type MilestoneTracker = typeof milestoneTracker.$inferSelect;

export const orgCreationProgress = pgTable("org_creation_progress", {
  userId: varchar("user_id").notNull(),
  progressData: jsonb("progress_data").notNull().default('{}'),
  updatedAt: timestamp("updated_at").default(sql`now()`),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertOrgCreationProgressSchema = createInsertSchema(orgCreationProgress).omit({ id: true });
export type InsertOrgCreationProgress = z.infer<typeof insertOrgCreationProgressSchema>;
export type OrgCreationProgress = typeof orgCreationProgress.$inferSelect;

export const tenantOnboardingProgress = pgTable("tenant_onboarding_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  overallProgressPct: integer("overall_progress_pct").notNull().default(0),
  status: varchar("status").notNull().default('not_started'),
  currentStep: varchar("current_step"),
  stepsCompleted: jsonb("steps_completed").notNull().default('[]'),
  stepsRemaining: jsonb("steps_remaining").notNull().default('[]'),
  trinityWelcomeSent: boolean("trinity_welcome_sent").notNull().default(false),
  trinityWelcomeSentAt: timestamp("trinity_welcome_sent_at"),
  lastTrinityNudgeAt: timestamp("last_trinity_nudge_at"),
  companyProfileComplete: boolean("company_profile_complete").notNull().default(false),
  companyDocumentsComplete: boolean("company_documents_complete").notNull().default(false),
  billingSetupComplete: boolean("billing_setup_complete").notNull().default(false),
  firstClientAdded: boolean("first_client_added").notNull().default(false),
  firstOfficerAdded: boolean("first_officer_added").notNull().default(false),
  dataImportComplete: boolean("data_import_complete").notNull().default(false),
  firstSchedulePublished: boolean("first_schedule_published").notNull().default(false),
  complianceSetupComplete: boolean("compliance_setup_complete").notNull().default(false),
  readyForOperations: boolean("ready_for_operations").notNull().default(false),
  completedAt: timestamp("completed_at"),
  lastUpdatedAt: timestamp("last_updated_at").notNull().default(sql`now()`),
});

export const insertTenantOnboardingProgressSchema = createInsertSchema(tenantOnboardingProgress).omit({ id: true });
export type InsertTenantOnboardingProgress = z.infer<typeof insertTenantOnboardingProgressSchema>;
export type TenantOnboardingProgress = typeof tenantOnboardingProgress.$inferSelect;

export const tenantOnboardingSteps = pgTable("tenant_onboarding_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stepKey: varchar("step_key").notNull(),
  stepNumber: integer("step_number").notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  required: boolean("required").notNull().default(true),
  category: varchar("category").notNull(),
  completionTrigger: text("completion_trigger"),
  trinityPromptTemplate: text("trinity_prompt_template"),
  estimatedMinutes: integer("estimated_minutes").default(5),
  dependsOnStep: varchar("depends_on_step"),
  documentType: varchar("document_type"),
  uploadRequired: boolean("upload_required").default(false),

  appliesToTier: jsonb("applies_to_tier"),
});

export const insertTenantOnboardingStepsSchema = createInsertSchema(tenantOnboardingSteps).omit({ id: true });
export type InsertTenantOnboardingSteps = z.infer<typeof insertTenantOnboardingStepsSchema>;
export type TenantOnboardingSteps = typeof tenantOnboardingSteps.$inferSelect;

export const workspaceCostSummary = pgTable("workspace_cost_summary", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  aiTokenCostCents: integer("ai_token_cost_cents").default(0),
  smsCostCents: integer("sms_cost_cents").default(0),
  emailCostCents: integer("email_cost_cents").default(0),
  voiceCostCents: integer("voice_cost_cents").default(0),
  translationCostCents: integer("translation_cost_cents").default(0),
  totalCostCents: integer("total_cost_cents").default(0),
  lastCalculatedAt: timestamp("last_calculated_at").default(sql`now()`),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertWorkspaceCostSummarySchema = createInsertSchema(workspaceCostSummary).omit({ id: true });
export type InsertWorkspaceCostSummary = z.infer<typeof insertWorkspaceCostSummarySchema>;
export type WorkspaceCostSummary = typeof workspaceCostSummary.$inferSelect;

export const workspaceCreditBalance = pgTable("workspace_credit_balance", {
  workspaceId: varchar("workspace_id"),
  workspaceName: varchar("workspace_name"),
  creditBalance: integer("credit_balance"),
  monthlyCreditAllocation: integer("monthly_credit_allocation"),
  subscriptionTier: varchar("subscription_tier"),
});

export const insertWorkspaceCreditBalanceSchema = createInsertSchema(workspaceCreditBalance).omit({ id: true });
export type InsertWorkspaceCreditBalance = z.infer<typeof insertWorkspaceCreditBalanceSchema>;
export type WorkspaceCreditBalance = typeof workspaceCreditBalance.$inferSelect;

