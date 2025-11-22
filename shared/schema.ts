// Add these tables to the END of schema.ts (after aiCheckpoints)

// ============================================================================
// SALES & ONBOARDING - Org Invitations, RFPs, and Sales Activities
// ============================================================================

// Org Invitations - Track sent invites to organizations
export const orgInvitations = pgTable("org_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Invitation details
  email: varchar("email").notNull(),
  organizationName: varchar("organization_name").notNull(),
  contactName: varchar("contact_name"),
  industry: varchar("industry"),
  
  // Trial tier assignment
  offeredTier: varchar("offered_tier").default("starter"), // 'free', 'starter', 'professional'
  trialDurationDays: integer("trial_duration_days").default(14),
  trialCredits: integer("trial_credits").default(1000),
  
  // Invitation status
  status: varchar("status").default("pending"), // 'pending', 'accepted', 'rejected', 'expired', 'completed'
  invitationToken: varchar("invitation_token").unique(),
  invitationTokenExpiry: timestamp("invitation_token_expiry"),
  
  // When accepted, link to workspace
  acceptedWorkspaceId: varchar("accepted_workspace_id").references(() => workspaces.id, { onDelete: 'set null' }),
  acceptedAt: timestamp("accepted_at"),
  acceptedBy: varchar("accepted_by").references(() => users.id, { onDelete: 'set null' }),
  
  // Metadata
  sentBy: varchar("sent_by").references(() => users.id, { onDelete: 'set null' }),
  sentAt: timestamp("sent_at").defaultNow(),
  
  // Progress tracking
  onboardingProgress: integer("onboarding_progress").default(0), // 0-100%
  completedSteps: text("completed_steps").array().default(sql`ARRAY[]::text[]`),
  lastActivityAt: timestamp("last_activity_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("org_invitations_email_idx").on(table.email),
  index("org_invitations_status_idx").on(table.status),
  index("org_invitations_workspace_idx").on(table.acceptedWorkspaceId),
]);

export const insertOrgInvitationSchema = createInsertSchema(orgInvitations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  invitationToken: true,
});

export type InsertOrgInvitation = z.infer<typeof insertOrgInvitationSchema>;
export type OrgInvitation = typeof orgInvitations.$inferSelect;

// RFPs & Proposals - Track RFPs sent to prospects and proposals for deals
export const proposals = pgTable("proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Proposal details
  title: varchar("title").notNull(),
  description: text("description"),
  
  // Recipient
  prospectEmail: varchar("prospect_email").notNull(),
  prospectName: varchar("prospect_name"),
  prospectOrganization: varchar("prospect_organization"),
  
  // Terms
  proposalType: varchar("proposal_type").default("trial"), // 'trial', 'custom_plan', 'enterprise'
  suggestedTier: varchar("suggested_tier").default("starter"),
  estimatedValue: decimal("estimated_value", { precision: 10, scale: 2 }),
  currency: varchar("currency").default("USD"),
  
  // Content
  pdfUrl: varchar("pdf_url"), // Generated PDF storage
  content: jsonb("content"), // Proposal content structure
  
  // Status
  status: varchar("status").default("draft"), // 'draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired'
  sentAt: timestamp("sent_at"),
  viewedAt: timestamp("viewed_at"),
  expiresAt: timestamp("expires_at"),
  respondedAt: timestamp("responded_at"),
  
  // Metadata
  createdBy: varchar("created_by").notNull().references(() => users.id, { onDelete: 'set null' }),
  sentBy: varchar("sent_by").references(() => users.id, { onDelete: 'set null' }),
  
  // Tracking
  viewCount: integer("view_count").default(0),
  lastViewedAt: timestamp("last_viewed_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("proposals_email_idx").on(table.prospectEmail),
  index("proposals_status_idx").on(table.status),
  index("proposals_created_by_idx").on(table.createdBy),
]);

export const insertProposalSchema = createInsertSchema(proposals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProposal = z.infer<typeof insertProposalSchema>;
export type Proposal = typeof proposals.$inferSelect;

// Sales activity log - Track all sales interactions
export const salesActivities = pgTable("sales_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Activity type
  activityType: varchar("activity_type").notNull(), // 'email_sent', 'call', 'meeting', 'proposal_viewed', 'proposal_signed', 'invited'
  
  // Related entities
  prospectEmail: varchar("prospect_email"),
  proposalId: varchar("proposal_id").references(() => proposals.id, { onDelete: 'set null' }),
  invitationId: varchar("invitation_id").references(() => orgInvitations.id, { onDelete: 'set null' }),
  
  // Details
  title: varchar("title").notNull(),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  
  // Owner
  createdBy: varchar("created_by").notNull().references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("sales_activities_email_idx").on(table.prospectEmail),
  index("sales_activities_type_idx").on(table.activityType),
  index("sales_activities_user_idx").on(table.createdBy),
]);

export const insertSalesActivitySchema = createInsertSchema(salesActivities).omit({
  id: true,
  createdAt: true,
});

export type InsertSalesActivity = z.infer<typeof insertSalesActivitySchema>;
export type SalesActivity = typeof salesActivities.$inferSelect;

// ============================================================================
// SALES & ONBOARDING - Org Invitations, RFPs, and Sales Activities
// ============================================================================

// Org Invitations - Track sent invites to organizations
export const orgInvitations = pgTable("org_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Invitation details
  email: varchar("email").notNull(),
  organizationName: varchar("organization_name").notNull(),
  contactName: varchar("contact_name"),
  industry: varchar("industry"),
  
  // Trial tier assignment
  offeredTier: varchar("offered_tier").default("starter"), // 'free', 'starter', 'professional'
  trialDurationDays: integer("trial_duration_days").default(14),
  trialCredits: integer("trial_credits").default(1000),
  
  // Invitation status
  status: varchar("status").default("pending"), // 'pending', 'accepted', 'rejected', 'expired', 'completed'
  invitationToken: varchar("invitation_token").unique(),
  invitationTokenExpiry: timestamp("invitation_token_expiry"),
  
  // When accepted, link to workspace
  acceptedWorkspaceId: varchar("accepted_workspace_id").references(() => workspaces.id, { onDelete: 'set null' }),
  acceptedAt: timestamp("accepted_at"),
  acceptedBy: varchar("accepted_by").references(() => users.id, { onDelete: 'set null' }),
  
  // Metadata
  sentBy: varchar("sent_by").references(() => users.id, { onDelete: 'set null' }),
  sentAt: timestamp("sent_at").defaultNow(),
  
  // Progress tracking
  onboardingProgress: integer("onboarding_progress").default(0), // 0-100%
  completedSteps: text("completed_steps").array().default(sql`ARRAY[]::text[]`),
  lastActivityAt: timestamp("last_activity_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("org_invitations_email_idx").on(table.email),
  index("org_invitations_status_idx").on(table.status),
  index("org_invitations_workspace_idx").on(table.acceptedWorkspaceId),
]);

export const insertOrgInvitationSchema = createInsertSchema(orgInvitations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  invitationToken: true,
});

export type InsertOrgInvitation = z.infer<typeof insertOrgInvitationSchema>;
export type OrgInvitation = typeof orgInvitations.$inferSelect;

// RFPs & Proposals - Track RFPs sent to prospects and proposals for deals
export const proposals = pgTable("proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Proposal details
  title: varchar("title").notNull(),
  description: text("description"),
  
  // Recipient
  prospectEmail: varchar("prospect_email").notNull(),
  prospectName: varchar("prospect_name"),
  prospectOrganization: varchar("prospect_organization"),
  
  // Terms
  proposalType: varchar("proposal_type").default("trial"), // 'trial', 'custom_plan', 'enterprise'
  suggestedTier: varchar("suggested_tier").default("starter"),
  estimatedValue: decimal("estimated_value", { precision: 10, scale: 2 }),
  currency: varchar("currency").default("USD"),
  
  // Content
  pdfUrl: varchar("pdf_url"), // Generated PDF storage
  content: jsonb("content"), // Proposal content structure
  
  // Status
  status: varchar("status").default("draft"), // 'draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired'
  sentAt: timestamp("sent_at"),
  viewedAt: timestamp("viewed_at"),
  expiresAt: timestamp("expires_at"),
  respondedAt: timestamp("responded_at"),
  
  // Metadata
  createdBy: varchar("created_by").notNull().references(() => users.id, { onDelete: 'set null' }),
  sentBy: varchar("sent_by").references(() => users.id, { onDelete: 'set null' }),
  
  // Tracking
  viewCount: integer("view_count").default(0),
  lastViewedAt: timestamp("last_viewed_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("proposals_email_idx").on(table.prospectEmail),
  index("proposals_status_idx").on(table.status),
  index("proposals_created_by_idx").on(table.createdBy),
]);

export const insertProposalSchema = createInsertSchema(proposals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProposal = z.infer<typeof insertProposalSchema>;
export type Proposal = typeof proposals.$inferSelect;

// Sales activity log - Track all sales interactions
export const salesActivities = pgTable("sales_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Activity type
  activityType: varchar("activity_type").notNull(), // 'email_sent', 'call', 'meeting', 'proposal_viewed', 'proposal_signed', 'invited'
  
  // Related entities
  prospectEmail: varchar("prospect_email"),
  proposalId: varchar("proposal_id").references(() => proposals.id, { onDelete: 'set null' }),
  invitationId: varchar("invitation_id").references(() => orgInvitations.id, { onDelete: 'set null' }),
  
  // Details
  title: varchar("title").notNull(),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  
  // Owner
  createdBy: varchar("created_by").notNull().references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("sales_activities_email_idx").on(table.prospectEmail),
  index("sales_activities_type_idx").on(table.activityType),
  index("sales_activities_user_idx").on(table.createdBy),
]);

export const insertSalesActivitySchema = createInsertSchema(salesActivities).omit({
  id: true,
  createdAt: true,
});

export type InsertSalesActivity = z.infer<typeof insertSalesActivitySchema>;
export type SalesActivity = typeof salesActivities.$inferSelect;
