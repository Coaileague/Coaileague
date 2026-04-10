import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, date, time, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const clientConcerns = pgTable("client_concerns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  clientId: varchar("client_id").notNull(),
  concernType: varchar("concern_type").notNull(),
  severity: varchar("severity").default('moderate'),
  description: text("description").notNull(),
  raisedAt: timestamp("raised_at").default(sql`now()`),
  raisedBy: varchar("raised_by"),
  assignedTo: varchar("assigned_to"),
  status: varchar("status").default('open'),
  resolutionNotes: text("resolution_notes"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by"),
  linkedIncidentId: varchar("linked_incident_id"),
});

export const insertClientConcernsSchema = createInsertSchema(clientConcerns).omit({ id: true });
export type InsertClientConcerns = z.infer<typeof insertClientConcernsSchema>;
export type ClientConcerns = typeof clientConcerns.$inferSelect;

export const clientSatisfactionRecords = pgTable("client_satisfaction_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  clientId: varchar("client_id").notNull(),
  checkInType: varchar("check_in_type").default('scheduled'),
  checkInDate: date("check_in_date").notNull(),
  conductedBy: varchar("conducted_by"),
  satisfactionScore: decimal("satisfaction_score"),
  npsScore: integer("nps_score"),
  feedbackText: text("feedback_text"),
  issuesRaised: jsonb("issues_raised").default('[]'),
  issuesResolved: boolean("issues_resolved").default(false),
  followUpRequired: boolean("follow_up_required").default(false),
  followUpCompletedAt: timestamp("follow_up_completed_at"),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertClientSatisfactionRecordsSchema = createInsertSchema(clientSatisfactionRecords).omit({ id: true });
export type InsertClientSatisfactionRecords = z.infer<typeof insertClientSatisfactionRecordsSchema>;
export type ClientSatisfactionRecords = typeof clientSatisfactionRecords.$inferSelect;

export const postOrderVersionAcknowledgments = pgTable("post_order_version_acknowledgments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  siteId: varchar("site_id"),
  postOrderVersionId: varchar("post_order_version_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  acknowledgedAt: timestamp("acknowledged_at").default(sql`now()`),
  acknowledgmentMethod: varchar("acknowledgment_method").default('manual'),
  deviceInfo: text("device_info"),
  ipAddress: varchar("ip_address"),
});

export const insertPostOrderVersionAcknowledgmentsSchema = createInsertSchema(postOrderVersionAcknowledgments).omit({ id: true });
export type InsertPostOrderVersionAcknowledgments = z.infer<typeof insertPostOrderVersionAcknowledgmentsSchema>;
export type PostOrderVersionAcknowledgments = typeof postOrderVersionAcknowledgments.$inferSelect;

export const postOrderVersions = pgTable("post_order_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  siteId: varchar("site_id"),
  versionNumber: integer("version_number").notNull().default(1),
  title: varchar("title").notNull(),
  content: text("content").notNull(),
  changeSummary: text("change_summary"),
  effectiveDate: date("effective_date"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").default(sql`now()`),
  isCurrent: boolean("is_current").default(true),
  requiresAcknowledgment: boolean("requires_acknowledgment").default(true),
  acknowledgmentDeadline: date("acknowledgment_deadline"),
  officersRequiredToAcknowledge: jsonb("officers_required_to_acknowledge").default('[]'),
  acknowledgedCount: integer("acknowledged_count").default(0),
  pendingCount: integer("pending_count").default(0),
});

export const insertPostOrderVersionsSchema = createInsertSchema(postOrderVersions).omit({ id: true });
export type InsertPostOrderVersions = z.infer<typeof insertPostOrderVersionsSchema>;
export type PostOrderVersions = typeof postOrderVersions.$inferSelect;

export const siteMarginScores = pgTable("site_margin_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  siteId: varchar("site_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  grossRevenue: decimal("gross_revenue").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  laborCost: decimal("labor_cost").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  grossMargin: decimal("gross_margin").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  grossMarginPct: decimal("gross_margin_pct").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  targetMarginPct: decimal("target_margin_pct").default(30),
  status: varchar("status").default('healthy'),
  calculatedAt: timestamp("calculated_at").notNull().default(sql`now()`),
});

export const insertSiteMarginScoresSchema = createInsertSchema(siteMarginScores).omit({ id: true });
export type InsertSiteMarginScores = z.infer<typeof insertSiteMarginScoresSchema>;
export type SiteMarginScores = typeof siteMarginScores.$inferSelect;

export const subcontractorCompanies = pgTable("subcontractor_companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  companyName: varchar("company_name").notNull(),
  dbaName: varchar("dba_name"),
  contactName: varchar("contact_name"),
  contactEmail: varchar("contact_email"),
  contactPhone: varchar("contact_phone"),
  companyLicenseNumber: varchar("company_license_number"),
  companyLicenseState: varchar("company_license_state").default('TX'),
  companyLicenseExpiration: date("company_license_expiration"),
  insuranceCoiPath: text("insurance_coi_path"),
  insuranceExpiration: date("insurance_expiration"),
  insuranceCoverageAmount: decimal("insurance_coverage_amount"),
  contractPath: text("contract_path"),
  contractStart: date("contract_start"),
  contractEnd: date("contract_end"),
  paymentTerms: varchar("payment_terms"),
  hourlyRate: decimal("hourly_rate"),
  flatRate: decimal("flat_rate"),
  status: varchar("status").default('active'),
  notes: text("notes"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertSubcontractorCompaniesSchema = createInsertSchema(subcontractorCompanies).omit({ id: true });
export type InsertSubcontractorCompanies = z.infer<typeof insertSubcontractorCompaniesSchema>;
export type SubcontractorCompanies = typeof subcontractorCompanies.$inferSelect;

// ─── Phase 35G: Client Communication Hub ──────────────────────────────────────

export const clientMessageThreads = pgTable("client_message_threads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  clientId: varchar("client_id").notNull(),

  subject: varchar("subject").notNull(),
  status: varchar("status").notNull().default("open"), // 'open' | 'resolved' | 'archived'
  channel: varchar("channel").notNull().default("platform"), // 'platform' | 'email' | 'phone_note'

  assignedToUserId: varchar("assigned_to_user_id"),

  // SLA tracking
  slaDeadline: timestamp("sla_deadline"),
  slaStatus: varchar("sla_status").default("ok"), // 'ok' | 'amber' | 'red'
  lastStaffReplyAt: timestamp("last_staff_reply_at"),
  lastClientReplyAt: timestamp("last_client_reply_at"),

  lastMessageAt: timestamp("last_message_at").default(sql`now()`),
  lastMessagePreview: text("last_message_preview"),

  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by"),

  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`),
});

export const insertClientMessageThreadSchema = createInsertSchema(clientMessageThreads).omit({ id: true });
export type InsertClientMessageThread = z.infer<typeof insertClientMessageThreadSchema>;
export type ClientMessageThread = typeof clientMessageThreads.$inferSelect;

export const clientMessages = pgTable("client_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  threadId: varchar("thread_id").notNull(),

  senderType: varchar("sender_type").notNull(), // 'staff' | 'client' | 'trinity'
  senderId: varchar("sender_id"),
  senderName: varchar("sender_name"),

  direction: varchar("direction").notNull().default("outbound"), // 'outbound' (staff->client) | 'inbound' (client->staff)
  channel: varchar("channel").notNull().default("platform"), // 'platform' | 'email' | 'phone_note'

  body: text("body").notNull(),
  attachments: jsonb("attachments").default('[]'),

  isTrinityDraft: boolean("is_trinity_draft").default(false),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),

  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),

  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertClientMessageSchema = createInsertSchema(clientMessages).omit({ id: true });
export type InsertClientMessage = z.infer<typeof insertClientMessageSchema>;
export type ClientMessage = typeof clientMessages.$inferSelect;


// ============================================================================
// CONTRACT DOCUMENTS — Employee contract/document tracking
// ============================================================================
export const contractDocuments = pgTable("contract_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  documentType: varchar("document_type", { length: 100 }).notNull(),
  fileUrl: text("file_url"),
  status: varchar("status", { length: 30 }).default("pending"), // pending | approved | rejected
  signedBy: varchar("signed_by"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  reviewNotes: text("review_notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("contract_docs_workspace_idx").on(table.workspaceId),
  index("contract_docs_employee_idx").on(table.employeeId),
]);
export const insertContractDocumentSchema = createInsertSchema(contractDocuments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertContractDocument = z.infer<typeof insertContractDocumentSchema>;
export type ContractDocument = typeof contractDocuments.$inferSelect;
