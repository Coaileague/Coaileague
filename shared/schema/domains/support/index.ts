// ═══════════════════════════════════════════════════════════════
// Domain 13 of 15: Support & HelpAI
// ═══════════════════════════════════════════════════════════════
// THE LAW: No new tables without Bryan's explicit approval. Zero DROP TABLE ever.
// Tables: 31

import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, date, time, doublePrecision, char, index, primaryKey, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  escalationCategoryEnum,
  escalationStatusEnum,
  faqSourceTypeEnum,
  faqStatusEnum,
  knowledgeDomainEnum,
  knowledgeEntityTypeEnum,
  knowledgeRelationTypeEnum,
  platformRoleEnum,
  platformUpdateCategoryEnum,
  supportSessionScopeEnum,
  updateVisibilityEnum,
  workspaceRoleEnum,
} from '../../enums';

export const escalationTickets = pgTable("escalation_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketNumber: varchar("ticket_number").unique().notNull(), // ESC-XXXXXX format
  workspaceId: varchar("workspace_id").notNull(),

  // Requestor (organization leader)
  requestorId: varchar("requestor_id").notNull(),
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
  assignedTo: varchar("assigned_to"), // Platform support staff
  status: escalationStatusEnum("status").default("open"),
  resolution: text("resolution"),
  resolvedAt: timestamp("resolved_at"),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  chainData: jsonb("chain_data").default('{}'),
}, (table) => [
  index("idx_escalation_workspace").on(table.workspaceId, table.status),
  index("idx_escalation_assigned").on(table.assignedTo, table.status),
]);

export const supportSessions = pgTable("support_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Who is providing support
  adminUserId: varchar("admin_user_id").notNull(),
  adminEmail: varchar("admin_email").notNull(),
  platformRole: platformRoleEnum("platform_role").notNull(),
  
  // Which org is being supported
  workspaceId: varchar("workspace_id").notNull(),
  workspaceName: varchar("workspace_name").notNull(),
  
  // Session metadata
  ticketNumber: varchar("ticket_number", { length: 100 }), // Support ticket reference
  justification: text("justification").notNull(), // Why accessing this org
  scope: supportSessionScopeEnum("scope").array().default([]), // What they plan to do
  
  // Org lockout/freeze
  isOrgFrozen: boolean("is_org_frozen").default(false), // If true, org users see maintenance overlay
  freezeReason: text("freeze_reason"), // "Platform maintenance in progress"
  
  // Timing
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"), // Null = active session
  
  // Actions taken during session (summary)
  actionsSummary: jsonb("actions_summary").default([]), // Quick summary of what was done
  
  // IP and security
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("support_sessions_admin_idx").on(table.adminUserId),
  index("support_sessions_workspace_idx").on(table.workspaceId),
  index("support_sessions_active_idx").on(table.workspaceId, table.endedAt),
]);

export const supportTickets = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Ticket details
  ticketNumber: varchar("ticket_number").notNull(), // Auto-generated (e.g., "TKT-2024-001")
  type: varchar("type").notNull(), // 'report_request', 'template_request', 'support', 'other'
  priority: varchar("priority").default("normal"), // 'low', 'normal', 'high', 'urgent'

  // Requester (can be client or employee)
  clientId: varchar("client_id"),
  employeeId: varchar("employee_id"),
  requestedBy: varchar("requested_by"), // Name/email if external

  // Ticket content
  subject: varchar("subject").notNull(),
  description: text("description").notNull(),

  // For report requests
  reportSubmissionId: varchar("report_submission_id"),

  // Status tracking
  status: varchar("status").default("open"), // 'open', 'in_progress', 'resolved', 'closed'
  assignedTo: varchar("assigned_to"),

  // Resolution
  resolution: text("resolution"),
  resolutionSummary: text("resolution_summary"), // Brief summary for ticket updates
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by"),
  closedAt: timestamp("closed_at"), // Final closure timestamp (may differ from resolvedAt)
  closedBy: varchar("closed_by"), // Who officially closed the ticket

  // Verification for chatroom access (gatekeeper MOMJJ)
  verifiedAt: timestamp("verified_at"),
  verifiedBy: varchar("verified_by"), // Support staff who verified

  // Organization-to-Platform Escalation
  isEscalated: boolean("is_escalated").default(false), // Whether ticket escalated to platform support
  escalatedAt: timestamp("escalated_at"), // When escalated
  escalatedBy: varchar("escalated_by"), // Org leader who escalated
  escalatedReason: text("escalated_reason"), // Why escalated
  platformAssignedTo: varchar("platform_assigned_to"), // Platform support staff assigned
  platformNotes: text("platform_notes"), // Internal platform support notes

  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  closedReason: text("closed_reason"),
  ticketType: varchar("ticket_type"),
  sessionData: jsonb("session_data").default('{}'),
  accessData: jsonb("access_data").default('{}'),
  elevationData: jsonb("elevation_data").default('{}'),

  // Phase 13 — Inbound Email Pipeline
  // How this ticket was submitted: 'app' | 'email' | 'portal'
  submissionMethod: varchar("submission_method", { length: 30 }).default('app'),
  // Trinity email classification: 'billing' | 'scheduling' | 'technical' | 'general'
  emailCategory: varchar("email_category", { length: 100 }),
  // ID of the inbound_email_log record that created this ticket (if submitted via email)
  inboundEmailLogId: varchar("inbound_email_log_id"),

  // Phase 23B — FAQ Learning Loop
  // Whether this resolved ticket has been flagged as a candidate for a new FAQ entry
  faqCandidate: boolean("faq_candidate").default(false),
  // When the ticket was flagged as a FAQ candidate
  faqCandidateFlaggedAt: timestamp("faq_candidate_flagged_at"),
}, (table) => [
  // Performance indexes for ticket filtering and routing
  index("support_tickets_workspace_status_idx").on(table.workspaceId, table.status),
  index("support_tickets_status_idx").on(table.status),
  index("support_tickets_priority_idx").on(table.priority),
  index("support_tickets_workspace_created_idx").on(table.workspaceId, table.createdAt),
  index("support_tickets_assigned_idx").on(table.assignedTo),
  index("support_tickets_platform_assigned_idx").on(table.platformAssignedTo),
]);

export const helposFaqs = pgTable("helpos_faqs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
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
  publishedBy: varchar("published_by"),
  createdBy: varchar("created_by"),
  updatedBy: varchar("updated_by"),

  // Scope & Language
  scope: varchar("scope").default('platform'),     // 'platform' | 'workspace'
  language: varchar("language").default('en'),     // 'en' | 'es'

  // === NEW: Provenance & Learning Metadata ===
  sourceType: faqSourceTypeEnum("source_type").default('manual'), // Where this FAQ came from
  sourceId: varchar("source_id"), // Reference ID (ticket ID, AI job ID, etc.)
  sourceContext: jsonb("source_context"), // Additional context (original question, resolution details)
  
  // === NEW: Verification & Quality ===
  // status stored as varchar in DB (not constrained to enum) to allow workflow states
  status: varchar("status").default('published'),  // draft | published | needs_review | under_review | approved | archived
  confidenceScore: integer("confidence_score").default(100), // 0-100 confidence in accuracy
  lastVerifiedAt: timestamp("last_verified_at"), // When last verified as accurate
  lastVerifiedBy: varchar("last_verified_by"),
  verificationNotes: text("verification_notes"), // Notes from verification

  // === Phase E: Approval Workflow ===
  reviewRequired: boolean("review_required").default(false),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  updateOrderedBy: varchar("update_ordered_by"),
  updateOrderReason: text("update_order_reason"),
  
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

  // === Phase 23B: FAQ Intelligence / Learning Loop ===
  // Whether this FAQ was auto-suggested by AI (from resolved tickets) vs manually created
  autoSuggested: boolean("auto_suggested").default(false),
  // Array of ticket IDs that contributed to this FAQ (for provenance)
  relatedTicketIds: jsonb("related_ticket_ids").default('[]'),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const faqVersions = pgTable("faq_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  faqId: varchar("faq_id").notNull(),
  
  // Snapshot of FAQ content at this version
  version: integer("version").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: varchar("category").notNull(),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),
  
  // Change metadata
  changedBy: varchar("changed_by"),
  changedByAi: boolean("changed_by_ai").default(false), // Was this an AI-initiated change?
  changeType: varchar("change_type").notNull(), // 'created', 'updated', 'corrected', 'merged', 'archived'
  changeReason: text("change_reason"),
  changeDiff: jsonb("change_diff"), // JSON diff of what changed
  
  // Source tracking
  sourceType: faqSourceTypeEnum("source_type"),
  sourceId: varchar("source_id"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  workspaceId: varchar("workspace_id"),
});

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
  resolvedFaqId: varchar("resolved_faq_id"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by"),
  resolutionNotes: text("resolution_notes"),
  
  // Frequency tracking
  occurrenceCount: integer("occurrence_count").default(1), // How many times this gap was detected
  lastOccurredAt: timestamp("last_occurred_at").defaultNow(),
  
  // Clustering for similar gaps
  clusterId: varchar("cluster_id"), // Group similar gaps together
  similarityHash: varchar("similarity_hash"), // For deduplication
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  workspaceId: varchar("workspace_id"),
});

export const faqSearchHistory = pgTable("faq_search_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Search context
  query: text("query").notNull(), // The search query/question
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id"),
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
  resultClickedFaqId: varchar("result_clicked_faq_id"),
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
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const helpOsQueue = pgTable("help_os_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // User identification
  conversationId: varchar("conversation_id").notNull(),
  userId: varchar("user_id"),
  ticketNumber: varchar("ticket_number").notNull(), // TKT-XXXXXX
  userName: varchar("user_name").notNull(),
  workspaceId: varchar("workspace_id"),

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
  assignedStaffId: varchar("assigned_staff_id"),
  assignedAt: timestamp("assigned_at"),
  resolvedAt: timestamp("resolved_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const supportRooms = pgTable("support_rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Room identification
  slug: varchar("slug").notNull().unique(), // 'helpdesk', 'emergency', etc.
  name: varchar("name").notNull(), // 'HelpDesk', 'Emergency Support'
  description: text("description"), // 'Professional platform support'
  
  // IRC-style room mode - determines behavior (bots, guests, history rules)
  mode: varchar("mode").default("org"), // 'org', 'met', 'sup', 'field', 'coai'

  // Room status (controls access and visibility)
  status: varchar("status").default("open"), // 'open' (green), 'closed' (red), 'maintenance'
  statusMessage: text("status_message"), // Custom message when closed

  // Workspace scope (null = platform-wide room)
  workspaceId: varchar("workspace_id"),

  // Associated chat conversation
  conversationId: varchar("conversation_id"),

  // Access control
  requiresTicket: boolean("requires_ticket").default(false), // Clients need verified ticket
  allowedRoles: jsonb("allowed_roles"), // ['platform_admin', 'support_staff', 'deputy_admin']

  // Status tracking
  lastStatusChange: timestamp("last_status_change").defaultNow(),
  statusChangedBy: varchar("status_changed_by"), // Support staff who toggled

  // Metadata
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const supportTicketAccess = pgTable("support_ticket_access", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Relationships
  ticketId: varchar("ticket_id").notNull(),
  userId: varchar("user_id").notNull(),
  roomId: varchar("room_id").notNull(),

  // Access control
  grantedBy: varchar("granted_by").notNull(), // Support staff who verified
  expiresAt: timestamp("expires_at").notNull(), // Time-limited access (e.g., 24-48 hours)

  // Usage tracking
  joinCount: integer("join_count").default(0),
  lastJoinedAt: timestamp("last_joined_at"),

  // Status
  isRevoked: boolean("is_revoked").default(false),
  revokedAt: timestamp("revoked_at"),
  revokedBy: varchar("revoked_by"),
  revokedReason: text("revoked_reason"),

  // Suspension tracking for investigations
  isSuspended: boolean("is_suspended").default(false),
  suspendedAt: timestamp("suspended_at"),
  suspendedBy: varchar("suspended_by"),
  suspendedReason: text("suspended_reason"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  workspaceId: varchar("workspace_id"),
});

export const knowledgeArticles = pgTable("knowledge_articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),

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
  lastUpdatedBy: varchar("last_updated_by"),
  viewCount: integer("view_count").default(0),
  helpfulCount: integer("helpful_count").default(0), // User feedback

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  categoryIdx: index("knowledge_articles_category_idx").on(table.category),
  workspaceIdx: index("knowledge_articles_workspace_idx").on(table.workspaceId),
}));

export const knowledgeQueries = pgTable("knowledge_queries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id"),

  // Query details
  query: text("query").notNull(), // What the user asked
  response: text("response"), // AI-generated answer

  // Metadata
  responseTime: integer("response_time"), // Milliseconds
  articlesRetrieved: text("articles_retrieved").array(), // IDs of articles used
  wasHelpful: boolean("was_helpful"), // User feedback
  followUpQueries: integer("follow_up_queries").default(0), // Did they ask again?

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("knowledge_queries_user_idx").on(table.userId),
  createdIdx: index("knowledge_queries_created_idx").on(table.createdAt),
}));

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
  workspaceId: varchar("workspace_id"), // null = global
  createdBy: varchar("created_by"), // Who published
  
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

export const supportRegistry = pgTable("support_registry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id").notNull(),
  supportCode: varchar("support_code").notNull().unique(), // Format: SUP-AB12
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const helposAiSessions = pgTable("helpos_ai_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id"),
  
  // Session metadata
  conversationId: varchar("conversation_id"), // Links to chat if escalated
  supportTicketId: varchar("support_ticket_id"), // Created on escalation
  
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

export const helposAiTranscriptEntries = pgTable("helpos_ai_transcript_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  
  // Message content
  role: varchar("role").notNull(), // 'user', 'assistant', 'system'
  content: text("content").notNull(), // Message text
  
  // Metadata
  messageType: varchar("message_type").default("text"), // 'text', 'quick_action', 'escalation_notice'
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  workspaceId: varchar("workspace_id"),
}, (table) => [
  index("helpos_transcripts_session_idx").on(table.sessionId),
  index("helpos_transcripts_created_idx").on(table.createdAt), // For chronological retrieval
]);

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
  createdBy: varchar("created_by"),
  updatedBy: varchar("updated_by"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("helpai_registry_api_idx").on(table.apiName),
  index("helpai_registry_category_idx").on(table.apiCategory),
  index("helpai_registry_active_idx").on(table.isActive),
]);

export const helpaiIntegrations = pgTable("helpai_integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Relationship
  workspaceId: varchar("workspace_id").notNull(),
  registryId: varchar("registry_id").notNull(),
  
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
  configuredBy: varchar("configured_by").notNull(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("helpai_integrations_workspace_idx").on(table.workspaceId),
  index("helpai_integrations_registry_idx").on(table.registryId),
  index("helpai_integrations_enabled_idx").on(table.isEnabled),
]);

export const helpaiCredentials = pgTable("helpai_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Relationship
  integrationId: varchar("integration_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Encrypted Credentials
  credentialType: varchar("credential_type").notNull(), // 'api_key', 'oauth2', 'bearer', 'basic_auth'
  encryptedValue: text("encrypted_value").notNull(), // AES-256-GCM encrypted
  encryptionKeyId: varchar("encryption_key_id").notNull(), // Reference to encryption key
  
  // Metadata
  credentialName: varchar("credential_name"), // For display/reference
  expiresAt: timestamp("expires_at"), // For OAuth tokens
  isRevoked: boolean("is_revoked").default(false),
  
  // Audit Trail
  createdBy: varchar("created_by").notNull(),
  revokedBy: varchar("revoked_by"),
  revokedAt: timestamp("revoked_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("helpai_credentials_integration_idx").on(table.integrationId),
  index("helpai_credentials_workspace_idx").on(table.workspaceId),
  index("helpai_credentials_revoked_idx").on(table.isRevoked),
]);

export const helpaiAuditLog = pgTable("helpai_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Context
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id"),
  integrationId: varchar("integration_id"),
  
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
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("helpai_audit_workspace_idx").on(table.workspaceId),
  index("helpai_audit_action_idx").on(table.action),
  index("helpai_audit_status_idx").on(table.status),
  index("helpai_audit_created_idx").on(table.createdAt),
  index("helpai_audit_user_idx").on(table.userId),
]);

export const helpaiSessions = pgTable("helpai_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Session identity
  ticketNumber: varchar("ticket_number").notNull(), // e.g. "HAI-10042"
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id"),
  guestName: varchar("guest_name"), // If not logged in
  guestEmail: varchar("guest_email"),

  // Auth context
  authMethod: varchar("auth_method"), // 'session' | 'safety_code' | 'org_code' | 'guest'
  authVerified: boolean("auth_verified").default(false),

  // Lifecycle state
  state: varchar("state").notNull().default('queued'), // maps to HelpAIState values
  queuePosition: integer("queue_position"),
  queueEnteredAt: timestamp("queue_entered_at").defaultNow(),
  identifiedAt: timestamp("identified_at"),
  assistStartedAt: timestamp("assist_started_at"),
  resolvedAt: timestamp("resolved_at"),
  ratedAt: timestamp("rated_at"),
  disconnectedAt: timestamp("disconnected_at"),

  // Ticket linkage
  supportTicketId: varchar("support_ticket_id"),
  escalatedToAgentId: varchar("escalated_to_agent_id"),
  escalatedAt: timestamp("escalated_at"),
  escalationReason: text("escalation_reason"),

  // Conversation summary
  issueCategory: varchar("issue_category"), // auto-detected
  issueSummary: text("issue_summary"), // AI-generated summary of issue
  resolution: text("resolution"), // What was done to resolve
  faqsServed: jsonb("faqs_served"), // Array of FAQ IDs shown to user
  botsInvoked: jsonb("bots_invoked"), // Array of bot names summoned during session

  // Satisfaction & rating
  satisfactionScore: integer("satisfaction_score"), // 1-5 rating
  satisfactionComment: text("satisfaction_comment"),
  wasEscalated: boolean("was_escalated").default(false),
  wasResolved: boolean("was_resolved").default(false),

  // Metadata
  conversationMessageCount: integer("conversation_message_count").default(0),
  totalDurationMs: integer("total_duration_ms"),
  metadata: jsonb("metadata"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  sessionType: varchar("session_type"),
  actionData: jsonb("action_data").default('{}'),
  credentialsData: jsonb("credentials_data").default('{}'),
  safetyData: jsonb("safety_data").default('{}'),
}, (table) => [
  index("helpai_sessions_workspace_idx").on(table.workspaceId),
  index("helpai_sessions_user_idx").on(table.userId),
  index("helpai_sessions_state_idx").on(table.state),
  index("helpai_sessions_ticket_idx").on(table.ticketNumber),
  index("helpai_sessions_created_idx").on(table.createdAt),
]);

export const helpaiActionLog = pgTable("helpai_action_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Session context
  sessionId: varchar("session_id"),
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id"),

  // Action details
  actionType: varchar("action_type").notNull(), // 'query' | 'fetch' | 'mutate' | 'faq_read' | 'bot_summon' | 'escalate' | 'close' | 'auth_check' | 'safety_code_verify'
  actionName: varchar("action_name").notNull(), // Human-readable label
  toolUsed: varchar("tool_used"), // Platform tool or service name
  botSummoned: varchar("bot_summoned"), // If a bot was summoned: HelpAI, MeetingBot etc.
  commandUsed: varchar("command_used"), // /slash command that triggered this

  // Input/Output
  inputPayload: jsonb("input_payload"), // Sanitized request data
  outputPayload: jsonb("output_payload"), // Result/response data
  faqId: varchar("faq_id"),

  // Outcome
  success: boolean("success").notNull().default(true),
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  tokensUsed: integer("tokens_used"),
  confidenceScore: decimal("confidence_score", { precision: 4, scale: 3 }),

  createdAt: timestamp("created_at").defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("helpai_action_session_idx").on(table.sessionId),
  index("helpai_action_workspace_idx").on(table.workspaceId),
  index("helpai_action_type_idx").on(table.actionType),
  index("helpai_action_created_idx").on(table.createdAt),
]);

export const helpaiSafetyCodes = pgTable("helpai_safety_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id"),
  code: varchar("code").notNull(), // 6-char alphanumeric code
  purpose: varchar("purpose").notNull().default('helpdesk_auth'), // 'helpdesk_auth' | 'password_reset' | 'account_verify'
  usedAt: timestamp("used_at"),
  expiresAt: timestamp("expires_at").notNull(),
  sessionId: varchar("session_id"),
  ipAddress: varchar("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("helpai_safety_codes_user_idx").on(table.userId),
  index("helpai_safety_codes_code_idx").on(table.code),
  index("helpai_safety_codes_expires_idx").on(table.expiresAt),
]);

export const serviceControlStates = pgTable("service_control_states", {
  serviceName: varchar("service_name", { length: 100 }).primaryKey(),
  status: varchar("status", { length: 30 }).notNull().default('running'),
  pausedBy: varchar("paused_by"),
  pauseReason: text("pause_reason"),
  pausedAt: timestamp("paused_at"),
  lastStartedAt: timestamp("last_started_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const supportInterventions = pgTable("support_interventions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  
  // Triggering Context
  subagentId: varchar("subagent_id"),
  telemetryId: varchar("telemetry_id"),
  checkpointId: varchar("checkpoint_id"),
  
  // Derailment Details
  derailmentType: varchar("derailment_type", { length: 50 }).notNull(), // 'repeated_failure', 'high_risk', 'user_complaint', 'system_anomaly'
  severity: varchar("severity", { length: 20 }).notNull(), // 'low', 'medium', 'high', 'critical'
  description: text("description").notNull(),
  diagnosticSummary: text("diagnostic_summary"), // AI-generated summary of what went wrong
  
  // Affected Users/Context
  affectedUserId: varchar("affected_user_id"),
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
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  rejectedBy: varchar("rejected_by"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  
  // Resolution
  resolvedAt: timestamp("resolved_at"),
  resolutionMethod: varchar("resolution_method", { length: 50 }), // 'auto_fix', 'manual_fix', 'rollback', 'escalated_to_engineering'
  resolutionNotes: text("resolution_notes"),
  resolutionOutcome: jsonb("resolution_outcome"),
  
  // Linked Governance Approval
  governanceApprovalId: varchar("governance_approval_id"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("support_interventions_workspace_idx").on(table.workspaceId),
  index("support_interventions_subagent_idx").on(table.subagentId),
  index("support_interventions_status_idx").on(table.status),
  index("support_interventions_severity_idx").on(table.severity),
  index("support_interventions_created_idx").on(table.createdAt),
]);

export const supportSessionElevations = pgTable("support_session_elevations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Session binding
  userId: varchar("user_id").notNull(),
  sessionId: varchar("session_id").notNull(), // Express session ID
  
  // Cryptographic verification
  signature: varchar("signature", { length: 128 }).notNull(), // HMAC-SHA256 signature
  signatureVersion: integer("signature_version").default(1), // For future algorithm upgrades
  
  // Timing controls
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(), // Absolute expiration (max 12 hours)
  lastActivityAt: timestamp("last_activity_at").defaultNow(), // For idle timeout (4 hours)
  
  // Context
  issuedBy: varchar("issued_by"), // Who approved elevation (self for auto-approved roles)
  platformRole: varchar("platform_role", { length: 50 }).notNull(), // Role at time of elevation
  elevationReason: varchar("elevation_reason", { length: 200 }), // 'auto_support_login', 'governance_approved', 'mfa_verified'
  
  // Status
  isActive: boolean("is_active").default(true),
  revokedAt: timestamp("revoked_at"),
  revokedBy: varchar("revoked_by"),
  revocationReason: varchar("revocation_reason", { length: 200 }), // 'logout', 'expired', 'manual_revoke', 'session_destroyed'
  
  // Audit trail
  actionsExecuted: integer("actions_executed").default(0), // Count of actions using this elevation
  lastActionAt: timestamp("last_action_at"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  workspaceId: varchar("workspace_id"),
}, (table) => [
  index("support_elevations_user_idx").on(table.userId),
  index("support_elevations_session_idx").on(table.sessionId),
  index("support_elevations_active_idx").on(table.isActive),
  index("support_elevations_expires_idx").on(table.expiresAt),
]);

export const knowledgeGapLogs = pgTable("knowledge_gap_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  sessionId: varchar("session_id"),
  turnId: varchar("turn_id"),
  
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
  workspaceId: varchar("workspace_id"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  entityType: text("entity_type"),
  content: text("content"),
  sourceAgent: varchar("source_agent"),
  sourceAction: varchar("source_action"),
  metadata: jsonb("metadata").default('{}'),
  accessCount: integer("access_count").default(0),
  lastAccessed: timestamp("last_accessed"),
  articleData: jsonb("article_data").default('{}'),
  gapData: jsonb("gap_data").default('{}'),
}, (table) => [
  index("knowledge_entities_domain_idx").on(table.domain),
  index("knowledge_entities_type_idx").on(table.type),
  index("knowledge_entities_workspace_idx").on(table.workspaceId),
]);

export const knowledgeRelationships = pgTable("knowledge_relationships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  sourceId: varchar("source_id").notNull(),
  targetId: varchar("target_id").notNull(),
  type: knowledgeRelationTypeEnum("type").notNull(),
  strength: doublePrecision("strength").default(0.8),
  metadata: jsonb("metadata").default('{}'),
  
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  workspaceId: varchar("workspace_id"),
}, (table) => [
  index("knowledge_rel_source_idx").on(table.sourceId),
  index("knowledge_rel_target_idx").on(table.targetId),
  index("knowledge_rel_type_idx").on(table.type),
]);

export const knowledgeLearningEntries = pgTable("knowledge_learning_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  domain: knowledgeDomainEnum("domain").notNull(),
  agentId: varchar("agent_id", { length: 255 }).notNull(),
  action: varchar("action", { length: 500 }).notNull(),
  context: jsonb("context").default('{}'),
  outcome: varchar("outcome", { length: 50 }).notNull(), // success, failure, partial
  reward: doublePrecision("reward").default(0),
  insights: text("insights").array().default(sql`ARRAY[]::text[]`),
  workspaceId: varchar("workspace_id"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("knowledge_learning_domain_idx").on(table.domain),
  index("knowledge_learning_agent_idx").on(table.agentId),
  index("knowledge_learning_workspace_idx").on(table.workspaceId),
]);

export const platformConfigRegistry = pgTable("platform_config_registry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domain: varchar("domain", { length: 50 }).notNull(),
  key: varchar("key", { length: 255 }).notNull(),
  value: jsonb("value").notNull(),
  valueType: varchar("value_type", { length: 30 }).notNull().default("string"),
  description: text("description"),
  workspaceId: varchar("workspace_id"),
  isGlobal: boolean("is_global").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by"),

  createdAt: timestamp("created_at").default(sql`now()`),
  eventData: jsonb("event_data").default('{}'),
  awarenessData: jsonb("awareness_data").default('{}'),
}, (table) => [
  index("plat_cfg_domain_key_idx").on(table.domain, table.key),
  index("plat_cfg_workspace_idx").on(table.workspaceId),
  index("plat_cfgreg_domain_idx").on(table.domain),
  index("plat_cfg_global_active_idx").on(table.isGlobal, table.isActive),
]);

// ─────────────────────────────────────────────────────────────────────────────
// HELPAI v2 — Conversation & Cognitive Layer Tables
// Phase 3 additions per HelpAI Complete System Implementation spec
// ─────────────────────────────────────────────────────────────────────────────

export const helpaiConversations = pgTable("helpai_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  layer: varchar("layer").notNull().default('workspace'),
  channelType: varchar("channel_type").notNull().default('help_desk'),
  channelId: text("channel_id"),
  initiatedByRole: text("initiated_by_role"),
  language: varchar("language").notNull().default('en'),
  faithSensitivityState: varchar("faith_sensitivity_state").notNull().default('neutral'),
  faithForwardMode: boolean("faith_forward_mode").default(false),
  status: varchar("status").notNull().default('active'),
  priority: varchar("priority").notNull().default('normal'),
  humanHandoffActive: boolean("human_handoff_active").default(false),
  handoffTo: text("handoff_to"),
  slaFirstResponseAt: timestamp("sla_first_response_at"),
  slaResolvedAt: timestamp("sla_resolved_at"),
  slaFirstResponseMet: boolean("sla_first_response_met"),
  slaResolutionMet: boolean("sla_resolution_met"),
  satisfactionResponse: text("satisfaction_response"),
  trinityEscalationId: varchar("trinity_escalation_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("helpai_conv_workspace_idx").on(table.workspaceId),
  index("helpai_conv_status_idx").on(table.status),
  index("helpai_conv_priority_idx").on(table.priority),
  index("helpai_conv_layer_idx").on(table.layer),
  index("helpai_conv_created_idx").on(table.createdAt),
]);

export const helpaiMessages = pgTable("helpai_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull(),
  workspaceId: varchar("workspace_id"),
  sender: varchar("sender").notNull().default('helpai'),
  content: text("content").notNull(),
  language: varchar("language").notNull().default('en'),
  cognitiveLayerUsed: varchar("cognitive_layer_used"),
  priorityClassification: varchar("priority_classification").notNull().default('normal'),
  statusBroadcast: text("status_broadcast"),
  processingStartedAt: timestamp("processing_started_at"),
  processingCompletedAt: timestamp("processing_completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("helpai_msg_conversation_idx").on(table.conversationId),
  index("helpai_msg_workspace_idx").on(table.workspaceId),
  index("helpai_msg_sender_idx").on(table.sender),
  index("helpai_msg_created_idx").on(table.createdAt),
]);

export const helpaiSlaLog = pgTable("helpai_sla_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  conversationId: varchar("conversation_id").notNull(),
  layer: varchar("layer").notNull().default('workspace'),
  channelType: text("channel_type"),
  firstResponseSeconds: integer("first_response_seconds"),
  resolutionMinutes: integer("resolution_minutes"),
  firstResponseMet: boolean("first_response_met").notNull().default(false),
  resolutionMet: boolean("resolution_met").notNull().default(false),
  missedReason: text("missed_reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("helpai_sla_workspace_idx").on(table.workspaceId),
  index("helpai_sla_conversation_idx").on(table.conversationId),
  index("helpai_sla_created_idx").on(table.createdAt),
]);

export const helpaiFaqGaps = pgTable("helpai_faq_gaps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  questionReceived: text("question_received").notNull(),
  language: varchar("language").notNull().default('en'),
  wasAnswered: boolean("was_answered").notNull().default(false),
  resolutionType: text("resolution_type"),
  flaggedForFaqCreation: boolean("flagged_for_faq_creation").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("helpai_faq_gaps_workspace_idx").on(table.workspaceId),
  index("helpai_faq_gaps_answered_idx").on(table.wasAnswered),
  index("helpai_faq_gaps_created_idx").on(table.createdAt),
]);

export const helpaiProactiveAlerts = pgTable("helpai_proactive_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  alertType: text("alert_type").notNull(),
  alertSourceThread: text("alert_source_thread"),
  description: text("description").notNull(),
  priority: varchar("priority").notNull().default('normal'),
  deliveredTo: text("delivered_to"),
  acknowledged: boolean("acknowledged").notNull().default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("helpai_proactive_workspace_idx").on(table.workspaceId),
  index("helpai_proactive_priority_idx").on(table.priority),
  index("helpai_proactive_ack_idx").on(table.acknowledged),
  index("helpai_proactive_created_idx").on(table.createdAt),
]);

export const trinityHelpaiCommandBus = pgTable("trinity_helpai_command_bus", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  direction: varchar("direction").notNull(),
  messageType: varchar("message_type").notNull(),
  priority: varchar("priority").notNull().default('normal'),
  payload: jsonb("payload").notNull().default({}),
  status: varchar("status").notNull().default('sent'),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("trinity_cmd_bus_workspace_idx").on(table.workspaceId),
  index("trinity_cmd_bus_direction_idx").on(table.direction),
  index("trinity_cmd_bus_status_idx").on(table.status),
  index("trinity_cmd_bus_priority_idx").on(table.priority),
  index("trinity_cmd_bus_created_idx").on(table.createdAt),
]);

export * from './extended';
