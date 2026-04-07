// ═══════════════════════════════════════════════════════════════
// Domain 14 of 15: Sales & CRM
// ═══════════════════════════════════════════════════════════════
// THE LAW: No new tables without Bryan's explicit approval. Zero DROP TABLE ever.
// Tables: 9

import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, date, index, primaryKey, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const leads = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  
  // Multi-tenant isolation
  organizationId: varchar("organization_id"),

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
  convertedToWorkspaceId: varchar("converted_to_workspace_id"),
  convertedAt: timestamp("converted_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const deals = pgTable("deals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Multi-tenant isolation
  organizationId: varchar("organization_id"),

  // Deal identification
  dealName: varchar("deal_name").notNull(),
  companyName: varchar("company_name").notNull(),

  // Relationships
  leadId: varchar("lead_id"),
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

  dealType: varchar("deal_type"),
  taskData: jsonb("task_data").default('{}'),
});

export const rfps = pgTable("rfps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

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
  dealId: varchar("deal_id"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const proposals = pgTable("proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Multi-tenant
  workspaceId: varchar("workspace_id"),

  // Relationships
  dealId: varchar("deal_id"),
  rfpId: varchar("rfp_id"),

  // Proposal details
  proposalName: varchar("proposal_name").notNull(),
  version: integer("version").default(1),
  templateId: varchar("template_id"),

  // Client / prospect info
  clientName: varchar("client_name"),
  clientAddress: varchar("client_address"),
  clientContact: varchar("client_contact"),
  clientEmail: varchar("client_email"),
  clientPhone: varchar("client_phone"),

  // Company info (auto-fill from workspace)
  companyName: varchar("company_name"),
  companyAddress: varchar("company_address"),
  companyPhone: varchar("company_phone"),
  companyEmail: varchar("company_email"),
  companyLogo: varchar("company_logo"),

  // Financial
  totalValue: decimal("total_value", { precision: 12, scale: 2 }),
  validUntil: timestamp("valid_until"),

  // Content
  sections: jsonb("sections"), // Proposal sections as JSON
  lineItems: jsonb("line_items"), // [{description, quantity, rate, total}]
  termsAndConditions: text("terms_and_conditions"),
  fileUrl: varchar("file_url"), // PDF file location

  // Status
  status: varchar("status").default("draft"), // 'draft', 'review', 'submitted', 'won', 'lost'
  submittedAt: timestamp("submitted_at"),

  // Metadata
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  // B17: Merged from sales_proposals + contract_proposals
  proposalType: varchar("proposal_type").default("general"), // 'general', 'sales', 'contract'
  description: text("description"),
  prospectEmail: varchar("prospect_email"),
  prospectName: varchar("prospect_name"),
  suggestedTier: varchar("suggested_tier"),
  estimatedValue: decimal("estimated_value", { precision: 12, scale: 2 }),
  sentAt: timestamp("sent_at"),
  content: text("content"),
  clientId: varchar("client_id"),
});

export const dealTasks = pgTable("deal_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),

  // Task details
  title: varchar("title").notNull(),
  description: text("description"),

  // Relationships
  dealId: varchar("deal_id"),
  rfpId: varchar("rfp_id"),

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

export const testimonials = pgTable("testimonials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Who submitted
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id"),
  
  // Display info
  userName: varchar("user_name").notNull(),
  companyName: varchar("company_name").notNull(),
  industry: varchar("industry").default("security"),
  title: varchar("title"), // Job title
  photoUrl: varchar("photo_url"),
  
  // Content
  rating: integer("rating").notNull().default(5), // 1-5 stars
  quote: text("quote").notNull(),
  
  // Publishing workflow
  isApproved: boolean("is_approved").default(false), // User approved for publishing
  isPublished: boolean("is_published").default(false), // Admin published
  publishedAt: timestamp("published_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("testimonials_workspace_idx").on(table.workspaceId),
  index("testimonials_published_idx").on(table.isPublished, table.rating),
]);

export const clientProspects = pgTable("client_prospects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Temp code format: {ORG_CODE}-TEMP-{RANDOM} (e.g., "SPS-TEMP-A7K3")
  tempCode: varchar("temp_code", { length: 50 }).notNull().unique(),
  
  // Link to parent org code for routing
  orgCode: varchar("org_code", { length: 50 }).notNull(),
  
  // Client contact info (from email)
  email: varchar("email", { length: 255 }).notNull(),
  companyName: varchar("company_name", { length: 200 }),
  contactName: varchar("contact_name", { length: 200 }),
  phone: varchar("phone", { length: 30 }),
  
  // Access control
  accessStatus: varchar("access_status", { length: 30 }).default('temp'), // 'temp' | 'invited' | 'converted' | 'expired'
  accessExpiresAt: timestamp("access_expires_at"), // Temp access expiry (e.g., 30 days)
  
  // Conversion tracking
  convertedToClientId: varchar("converted_to_client_id"),
  convertedAt: timestamp("converted_at"),
  convertedUserId: varchar("converted_user_id"),
  
  // Onboarding link tracking
  onboardingLinkSent: boolean("onboarding_link_sent").default(false),
  onboardingLinkSentAt: timestamp("onboarding_link_sent_at"),
  onboardingLinkClickedAt: timestamp("onboarding_link_clicked_at"),
  
  // Source tracking (which request brought them in)
  sourceType: varchar("source_type", { length: 30 }).default('email'), // 'email' | 'manual' | 'referral'
  sourceEmailId: varchar("source_email_id"),
  sourceReferenceNumber: varchar("source_reference_number", { length: 50 }), // e.g., "SR-ML7HHQ19-2Y39"
  
  // Activity tracking
  lastActivityAt: timestamp("last_activity_at"),
  totalRequests: integer("total_requests").default(1),
  totalShiftsFilled: integer("total_shifts_filled").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("client_prospects_workspace_idx").on(table.workspaceId),
  index("client_prospects_temp_code_idx").on(table.tempCode),
  index("client_prospects_org_code_idx").on(table.orgCode),
  index("client_prospects_email_idx").on(table.email),
]);

export const pipelineDeals = pgTable("pipeline_deals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  prospectCompany: varchar("prospect_company", { length: 255 }).notNull(),
  prospectContactName: varchar("prospect_contact_name", { length: 255 }),
  prospectEmail: varchar("prospect_email", { length: 255 }),
  prospectPhone: varchar("prospect_phone", { length: 50 }),
  source: varchar("source", { length: 100 }),
  stage: varchar("stage", { length: 50 }).notNull().default('lead'),
  estimatedMonthlyValue: decimal("estimated_monthly_value", { precision: 10, scale: 2 }),
  coverageType: varchar("coverage_type", { length: 100 }),
  estimatedHoursWeekly: decimal("estimated_hours_weekly", { precision: 6, scale: 1 }),
  numberOfSites: integer("number_of_sites").notNull().default(1),
  siteSurveyScheduledAt: timestamp("site_survey_scheduled_at"),
  siteSurveyCompletedAt: timestamp("site_survey_completed_at"),
  siteSurveyNotes: text("site_survey_notes"),
  rfpReceivedAt: timestamp("rfp_received_at"),
  rfpDueDate: timestamp("rfp_due_date"),
  rfpDocumentUrl: text("rfp_document_url"),
  rfpResponseUrl: text("rfp_response_url"),
  proposalSentAt: timestamp("proposal_sent_at"),
  proposalDocumentUrl: text("proposal_document_url"),
  proposalAmount: decimal("proposal_amount", { precision: 10, scale: 2 }),
  contractSentAt: timestamp("contract_sent_at"),
  contractSignedAt: timestamp("contract_signed_at"),
  contractDocumentUrl: text("contract_document_url"),
  contractStartDate: date("contract_start_date"),
  contractEndDate: date("contract_end_date"),
  outcomeStatus: varchar("outcome_status", { length: 20 }),
  outcomeLostReason: text("outcome_lost_reason"),
  outcomeClosedAt: timestamp("outcome_closed_at"),
  assignedTo: varchar("assigned_to"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at"),
  proposalType: varchar("proposal_type"),
  competitionKnown: boolean("competition_known").default(false),
  competitorNames: jsonb("competitor_names").default('[]'),
  decisionTimeline: varchar("decision_timeline"),
  decisionMakerName: varchar("decision_maker_name"),
  decisionMakerTitle: varchar("decision_maker_title"),
  requirementsSummary: text("requirements_summary"),
  ourDifferentiators: text("our_differentiators"),
  pricePerHourProposed: decimal("price_per_hour_proposed"),
  estimatedAnnualValue: decimal("estimated_annual_value"),
  lossReason: text("loss_reason"),
  followUpCount: integer("follow_up_count").default(0),
  lastFollowUpAt: timestamp("last_follow_up_at"),
  expectedCloseDate: date("expected_close_date"),
  actualCloseDate: date("actual_close_date"),
  convertedToClientId: varchar("converted_to_client_id"),
}, (table) => [
  index("pipeline_deals_workspace_idx").on(table.workspaceId),
  index("pipeline_deals_stage_idx").on(table.stage),
  index("pipeline_deals_assigned_idx").on(table.assignedTo),
  index("pipeline_deals_outcome_idx").on(table.outcomeStatus),
]);

export const rfpDocuments = pgTable("rfp_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  clientId: varchar("client_id"),
  title: varchar("title").notNull(),
  status: varchar("status").default('draft'),
  dueDate: timestamp("due_date"),
  submittedAt: timestamp("submitted_at"),
  content: text("content"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── GROUP 5 PHASE 35B: AUTONOMOUS SALES ENGINE ─────────────────────────────
// Approved: Group 5 session. Bryan's explicit approval via project prompt.

export const salesLeads = pgTable("sales_leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  companyName: varchar("company_name").notNull(),
  contactName: varchar("contact_name"),
  contactEmail: varchar("contact_email"),
  contactPhone: varchar("contact_phone"),
  leadSource: varchar("lead_source").default("manual_entry"),
  // stage: captured|qualified|outreach_active|proposal_sent|proposal_approved|contract_sent|contract_executed|onboarded|lost
  stage: varchar("stage").notNull().default("captured"),
  lostReason: text("lost_reason"),
  leadScore: integer("lead_score").default(0),
  assignedTo: varchar("assigned_to"),
  estimatedContractValue: decimal("estimated_contract_value", { precision: 12, scale: 2 }),
  estimatedOfficersNeeded: integer("estimated_officers_needed"),
  primaryPostType: varchar("primary_post_type"),
  operatingStates: text("operating_states").array().default(sql`ARRAY[]::text[]`),
  notes: text("notes"),
  trinityContext: jsonb("trinity_context").default({}),
  lastContactedAt: timestamp("last_contacted_at"),
  expectedCloseDate: date("expected_close_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("sales_leads_workspace_idx").on(table.workspaceId),
  index("sales_leads_stage_idx").on(table.stage),
  index("sales_leads_assigned_idx").on(table.assignedTo),
  index("sales_leads_score_idx").on(table.leadScore),
]);
export type SalesLead = typeof salesLeads.$inferSelect;
export const insertSalesLeadSchema = createInsertSchema(salesLeads).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSalesLead = z.infer<typeof insertSalesLeadSchema>;

export const salesActivities = pgTable("sales_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  // activity_type: email|call|meeting|note|stage_change|proposal|contract
  activityType: varchar("activity_type").notNull().default("note"),
  direction: varchar("direction").default("outbound"), // inbound|outbound
  subject: varchar("subject"),
  body: text("body"),
  actorId: varchar("actor_id"),
  timestamp: timestamp("timestamp").defaultNow(),
}, (table) => [
  index("sales_activities_lead_idx").on(table.leadId),
  index("sales_activities_workspace_idx").on(table.workspaceId),
  index("sales_activities_ts_idx").on(table.timestamp),
]);
export type SalesActivity = typeof salesActivities.$inferSelect;
export const insertSalesActivitySchema = createInsertSchema(salesActivities).omit({ id: true });
export type InsertSalesActivity = z.infer<typeof insertSalesActivitySchema>;

export const salesProposals = pgTable("sales_proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  proposalNumber: varchar("proposal_number"),
  // status: draft|sent|viewed|approved|rejected|expired
  status: varchar("status").notNull().default("draft"),
  servicesDescription: text("services_description"),
  estimatedOfficers: integer("estimated_officers"),
  postLocations: text("post_locations"),
  coverageSchedule: text("coverage_schedule"),
  monthlyRate: decimal("monthly_rate", { precision: 12, scale: 2 }),
  setupFee: decimal("setup_fee", { precision: 12, scale: 2 }).default("0"),
  contractTermMonths: integer("contract_term_months").default(12),
  documentUrl: text("document_url"),
  orgOwnerSignedAt: timestamp("org_owner_signed_at"),
  prospectSignedAt: timestamp("prospect_signed_at"),
  validUntil: timestamp("valid_until"),
  sentAt: timestamp("sent_at"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("sales_proposals_lead_idx").on(table.leadId),
  index("sales_proposals_workspace_idx").on(table.workspaceId),
  index("sales_proposals_status_idx").on(table.status),
]);
export type SalesProposal = typeof salesProposals.$inferSelect;
export const insertSalesProposalSchema = createInsertSchema(salesProposals).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSalesProposal = z.infer<typeof insertSalesProposalSchema>;

export const salesEmailThreads = pgTable("sales_email_threads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  threadId: varchar("thread_id"),
  fromEmail: varchar("from_email"),
  toEmail: varchar("to_email"),
  subject: varchar("subject"),
  direction: varchar("direction").default("outbound"), // inbound|outbound
  body: text("body"),
  trinityGenerated: boolean("trinity_generated").default(false),
  sentAt: timestamp("sent_at").defaultNow(),
}, (table) => [
  index("sales_email_threads_lead_idx").on(table.leadId),
  index("sales_email_threads_workspace_idx").on(table.workspaceId),
  index("sales_email_threads_sent_idx").on(table.sentAt),
]);
export type SalesEmailThread = typeof salesEmailThreads.$inferSelect;
export const insertSalesEmailThreadSchema = createInsertSchema(salesEmailThreads).omit({ id: true });
export type InsertSalesEmailThread = z.infer<typeof insertSalesEmailThreadSchema>;

export * from './extended';
