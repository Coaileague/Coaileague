// ═══════════════════════════════════════════════════════════════
// Domain 12 of 15: Audit & Platform Ops
// ═══════════════════════════════════════════════════════════════
// THE LAW: No new tables without Bryan's explicit approval. Zero DROP TABLE ever.
// Tables: 47

import { pgTable, varchar, text, integer, bigint, boolean, timestamp, jsonb, uuid, decimal, date, time, doublePrecision, index, uniqueIndex, primaryKey, unique, numeric } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import {
  actorTypeEnum,
  alertSeverityEnum,
  alertStatusEnum,
  alertTypeEnum,
  auditDocRequestStatusEnum,
  auditFindingTypeEnum,
  changeDetailedCategoryEnum,
  changeSeverityEnum,
  changeSourceTypeEnum,
  enforcementDocTypeEnum,
  eventStatusEnum,
  leaderActionEnum,
  oversightEntityTypeEnum,
  oversightStatusEnum,
  platformScanStatusEnum,
  workspaceRoleEnum,
} from '../../enums';

export const leaderActions = pgTable("leader_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Leader information
  leaderId: varchar("leader_id").notNull(),
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
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),

  // Immutability
  createdAt: timestamp("created_at").notNull().defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("idx_leader_workspace_created").on(table.workspaceId, table.createdAt),
  index("idx_leader_user_created").on(table.leaderId, table.createdAt),
  index("idx_leader_action_type").on(table.action, table.createdAt),
]);

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),

  // Audit System Command tracking (IRC-style)
  commandId: varchar("command_id"), // Unique ID for command/response matching

  // Actor information
  userId: varchar("user_id"),
  userEmail: varchar("user_email"),
  userRole: varchar("user_role"),
  userName: varchar("user_name"),

  // Action details — enum for system logs, rawAction for trail-style writes
  action: text("action"),
  rawAction: varchar("raw_action"),
  actionDescription: text("action_description"),
  entityType: varchar("entity_type"),
  entityId: varchar("entity_id"),
  entityDescription: text("entity_description"),

  // Audit System Target tracking
  targetId: varchar("target_id"),
  targetName: varchar("target_name"),
  targetType: varchar("target_type"),

  // Audit System Context
  conversationId: varchar("conversation_id"),
  reason: text("reason"),

  // Change tracking (unified)
  changes: jsonb("changes"),
  changesBefore: jsonb("changes_before"),
  changesAfter: jsonb("changes_after"),
  fieldChanges: jsonb("field_changes"),
  metadata: jsonb("metadata"),

  // Request context
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  requestId: varchar("request_id"),
  geoLocation: jsonb("geo_location"),

  // Result tracking
  success: boolean("success").default(true),
  errorMessage: text("error_message"),

  // Compliance flags
  isSensitiveData: boolean("is_sensitive_data").default(false),
  complianceTag: varchar("compliance_tag"),
  requiresApproval: boolean("requires_approval").default(false),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  retentionUntil: timestamp("retention_until"),
  isLocked: boolean("is_locked").default(false),

  // Absorbed from audit_events
  actorType: varchar("actor_type"),
  eventStatus: varchar("event_status"),
  actionHash: varchar("action_hash"),
  payload: jsonb("payload"),

  // Actor/source context (B1 audit consolidation — absorbs system, support, compliance, universal trails)
  source: varchar("source", { length: 30 }).default("general"), // 'system'|'support'|'compliance'|'universal'|'general'
  actorBot: varchar("actor_bot", { length: 30 }),
  sourceRoute: varchar("source_route", { length: 200 }),
  platformRole: varchar("platform_role", { length: 50 }),
  requiresConfirmation: boolean("requires_confirmation").default(false),
  confirmedBy: varchar("confirmed_by"),
  confirmedAt: timestamp("confirmed_at"),
  severity: varchar("severity", { length: 20 }),
  justification: text("justification"),
  sessionId: varchar("session_id", { length: 100 }),
  employeeId: varchar("employee_id"),
  documentId: varchar("document_id"),
  hashChain: varchar("hash_chain", { length: 64 }),

  createdAt: timestamp("created_at").notNull().defaultNow(),

  sourceCategory: text("source_category"),
}, (table) => [
  index("idx_audit_workspace_created").on(table.workspaceId, table.createdAt),
  index("idx_audit_user_created").on(table.userId, table.createdAt),
  index("idx_audit_entity").on(table.entityType, table.entityId),
  index("idx_audit_action_created").on(table.action, table.createdAt),
  index("idx_audit_command_id").on(table.commandId),
  index("idx_audit_target").on(table.targetId),
]);


export const reportTemplates = pgTable("report_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

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
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const reportSubmissions = pgTable("report_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  templateId: varchar("template_id").notNull(),

  // Report metadata
  reportNumber: varchar("report_number").notNull(), // Auto-generated unique number (e.g., "RPT-2024-001")
  employeeId: varchar("employee_id").notNull(),
  clientId: varchar("client_id"), // End customer receiving report

  // Form data (JSON object with filled field values)
  formData: jsonb("form_data").notNull(),

  // Photo attachments with automatic timestamping
  // Format: [{ url: "...", timestamp: "2024-10-14T21:30:00Z", caption: "...", metadata: {...} }, ...]
  photos: jsonb("photos"), // Array of photo objects with timestamp, URL, metadata

  // Workflow status
  status: varchar("status").default("draft"), // 'draft', 'pending_review', 'approved', 'rejected', 'sent_to_customer'

  // Review tracking
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),

  // Customer delivery
  sentToCustomerAt: timestamp("sent_to_customer_at"),
  customerViewedAt: timestamp("customer_viewed_at"),

  // Timestamps
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  attachments: jsonb("attachments").default('[]'),
  reportType: varchar("report_type"),
});

export const reportWorkflowConfigs = pgTable("report_workflow_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),

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

export const reportApprovalSteps = pgTable("report_approval_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  submissionId: varchar("submission_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),

  // Step details
  stepNumber: integer("step_number").notNull(), // 1, 2, 3...
  stepName: varchar("step_name"), // "Manager Review", "Supervisor Final Approval"
  requiredRole: varchar("required_role"), // 'manager', 'owner', 'supervisor'

  // Approver assignment
  assignedTo: varchar("assigned_to"), // Specific user if assigned

  // Step status
  status: varchar("status").default("pending"), // 'pending', 'approved', 'rejected', 'skipped'

  // Approval/Rejection details
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  rejectionReason: text("rejection_reason"),

  // Audit trail
  notificationSentAt: timestamp("notification_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const lockedReportRecords = pgTable("locked_report_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  submissionId: varchar("submission_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),

  // Immutable snapshot
  snapshotData: jsonb("snapshot_data").notNull(), // Full report data + metadata frozen at approval
  pdfUrl: text("pdf_url"), // Generated PDF stored in object storage
  pdfGeneratedAt: timestamp("pdf_generated_at"),

  // Lock metadata
  lockedBy: varchar("locked_by").notNull(),
  lockedAt: timestamp("locked_at").notNull().defaultNow(),
  lockReason: varchar("lock_reason").default('approved'), // 'approved', 'compliance', 'audit'

  // Cryptographic integrity (future enhancement)
  contentHash: varchar("content_hash"), // SHA-256 hash for tamper detection
  digitalSignature: text("digital_signature"), // Optional: cryptographic signature

  // Cross-references for analytics
  employeeId: varchar("employee_id"),
  shiftId: varchar("shift_id"), // References shift if applicable
  clientId: varchar("client_id"),

  // Retention policy
  retentionYears: integer("retention_years").default(7), // IRS/DOL compliance
  expiresAt: timestamp("expires_at"), // Auto-calculated: lockedAt + retentionYears

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const reportAttachments = pgTable("report_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  submissionId: varchar("submission_id").notNull(),

  // File details
  fileName: varchar("file_name").notNull(),
  fileType: varchar("file_type").notNull(), // 'image/jpeg', 'application/pdf', etc.
  fileSize: integer("file_size"), // In bytes
  fileData: text("file_data"), // Base64 encoded for MVP (will upgrade to object storage)

  // Metadata
  uploadedBy: varchar("uploaded_by"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),

  // Optional: Location/timestamp when photo was taken
  capturedAt: timestamp("captured_at"),
  gpsLocation: jsonb("gps_location"), // { lat, lng, accuracy }
});

export const customerReportAccess = pgTable("customer_report_access", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  submissionId: varchar("submission_id").notNull(),
  clientId: varchar("client_id").notNull(),

  // Access control
  accessToken: varchar("access_token").notNull().unique(), // Unique token for secure access
  expiresAt: timestamp("expires_at").notNull(), // Time-limited access (e.g., 30-60 days)

  // Usage tracking
  accessCount: integer("access_count").default(0),
  lastAccessedAt: timestamp("last_accessed_at"),

  // Status
  isRevoked: boolean("is_revoked").default(false),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  workspaceId: varchar("workspace_id"),
});

export const kpiAlerts = pgTable("kpi_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

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

  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const kpiAlertTriggers = pgTable("kpi_alert_triggers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alertId: varchar("alert_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),

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
  acknowledgedBy: varchar("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const benchmarkMetrics = pgTable("benchmark_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  periodType: varchar("period_type").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  avgTimeToInvoicePayment: decimal("avg_time_to_invoice_payment", { precision: 8, scale: 2 }),
  shiftAdherenceRate: decimal("shift_adherence_rate", { precision: 5, scale: 2 }),
  employeeTurnoverRate: decimal("employee_turnover_rate", { precision: 5, scale: 2 }),
  avgOvertimePercentage: decimal("avg_overtime_percentage", { precision: 5, scale: 2 }),
  avgRevenuePerEmployee: decimal("avg_revenue_per_employee", { precision: 12, scale: 2 }),
  avgCostVariancePercentage: decimal("avg_cost_variance_percentage", { precision: 5, scale: 2 }),
  platformFeeCollected: decimal("platform_fee_collected", { precision: 12, scale: 2 }),
  totalActiveEmployees: integer("total_active_employees"),
  totalActiveClients: integer("total_active_clients"),
  totalShiftsScheduled: integer("total_shifts_scheduled"),
  totalHoursWorked: decimal("total_hours_worked", { precision: 12, scale: 2 }),
  industryCategory: varchar("industry_category"),
  companySize: varchar("company_size"),
  isAnonymized: boolean("is_anonymized").default(true),
  shareWithPeerBenchmarks: boolean("share_with_peer_benchmarks").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  metricType: varchar("metric_type"),
  employerData: jsonb("employer_data").default('{}'),
});

export const employerRatings = pgTable("employer_ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Rater (anonymous)
  employeeId: varchar("employee_id"),

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

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => ({
  workspaceTypeIndex: index("employer_ratings_workspace_type_idx").on(table.workspaceId, table.ratingType),
  targetIndex: index("employer_ratings_target_idx").on(table.targetId, table.submittedAt),
  scoreIndex: index("employer_ratings_score_idx").on(table.workspaceId, table.overallScore),
}));

export const employerBenchmarkScores = pgTable("employer_benchmark_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  benchmarkType: varchar("benchmark_type").notNull(),
  targetId: varchar("target_id"),
  targetName: varchar("target_name"),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  managementQualityAvg: decimal("management_quality_avg", { precision: 3, scale: 2 }),
  workEnvironmentAvg: decimal("work_environment_avg", { precision: 3, scale: 2 }),
  compensationFairnessAvg: decimal("compensation_fairness_avg", { precision: 3, scale: 2 }),
  growthOpportunitiesAvg: decimal("growth_opportunities_avg", { precision: 3, scale: 2 }),
  workLifeBalanceAvg: decimal("work_life_balance_avg", { precision: 3, scale: 2 }),
  equipmentResourcesAvg: decimal("equipment_resources_avg", { precision: 3, scale: 2 }),
  communicationClarityAvg: decimal("communication_clarity_avg", { precision: 3, scale: 2 }),
  recognitionAppreciationAvg: decimal("recognition_appreciation_avg", { precision: 3, scale: 2 }),
  overallScore: decimal("overall_score", { precision: 3, scale: 2 }),
  industryAverageScore: decimal("industry_average_score", { precision: 3, scale: 2 }),
  percentileRank: integer("percentile_rank"),
  scoreTrend: varchar("score_trend"),
  monthOverMonthChange: decimal("month_over_month_change", { precision: 4, scale: 2 }),
  totalResponses: integer("total_responses").default(0),
  responseRate: decimal("response_rate", { precision: 5, scale: 2 }),
  criticalIssuesCount: integer("critical_issues_count").default(0),
  highRiskFlags: jsonb("high_risk_flags").$type<string[]>().default(sql`'[]'`),
  calculatedAt: timestamp("calculated_at").defaultNow(),

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => ({
  workspaceTypeIndex: index("employer_benchmarks_workspace_type_idx").on(table.workspaceId, table.benchmarkType),
  targetPeriodIndex: index("employer_benchmarks_target_period_idx").on(table.targetId, table.periodEnd),
  scoreRankIndex: index("employer_benchmarks_score_rank_idx").on(table.overallScore, table.percentileRank),
}));

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subscriptionId: varchar("subscription_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),

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
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  subscriptionStatusIndex: index("webhook_deliveries_subscription_status_idx").on(table.subscriptionId, table.status),
  eventTypeIndex: index("webhook_deliveries_event_type_idx").on(table.eventType, table.eventId),
  retryQueueIndex: index("webhook_deliveries_retry_queue_idx").on(table.status, table.nextRetryAt),
  workspaceIndex: index("webhook_deliveries_workspace_idx").on(table.workspaceId, table.createdAt),
}));

export const autoReports = pgTable("auto_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Report details
  userId: varchar("user_id").notNull(),
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
  reviewedBy: varchar("reviewed_by"),
  sentAt: timestamp("sent_at"),
  sentTo: text("sent_to").array(), // Email addresses or user IDs

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("auto_reports_user_idx").on(table.userId),
  periodIdx: index("auto_reports_period_idx").on(table.period),
  statusIdx: index("auto_reports_status_idx").on(table.status),
}));

export const searchQueries = pgTable("search_queries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id").notNull(),

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
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("search_queries_workspace_idx").on(table.workspaceId),
  userIdx: index("search_queries_user_idx").on(table.userId),
  typeIdx: index("search_queries_type_idx").on(table.searchType),
}));

export const metricsSnapshots = pgTable("metrics_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

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
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("metrics_snapshots_workspace_idx").on(table.workspaceId),
  dateIdx: index("metrics_snapshots_date_idx").on(table.snapshotDate),
  periodIdx: index("metrics_snapshots_period_idx").on(table.period),
}));

export const userPlatformUpdateViews = pgTable("user_platform_update_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id").notNull(),
  updateId: varchar("update_id").notNull(),
  
  // When the user viewed this update
  viewedAt: timestamp("viewed_at").defaultNow(),
  
  // How the user viewed it (modal, notification, feed)
  viewSource: varchar("view_source", { length: 50 }).default('feed'),

  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => ({
  userUpdateIdx: uniqueIndex("user_platform_update_views_user_update_idx").on(table.userId, table.updateId),
  userIdx: index("user_platform_update_views_user_idx").on(table.userId),
  updateIdx: index("user_platform_update_views_update_idx").on(table.updateId),
}));

export const auditProofPacks = pgTable("audit_proof_packs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Invoice lifecycle reference (table removed)
  invoiceLifecycleId: varchar("invoice_lifecycle_id"),
  cycleKey: varchar("cycle_key").notNull(),
  clientId: varchar("client_id").notNull(),
  
  // Pack metadata
  packChecksum: varchar("pack_checksum").notNull(), // SHA256 of pack contents
  generatedAt: timestamp("generated_at").defaultNow(),
  generatedBy: varchar("generated_by"),
  
  // Pack contents summary
  totalHours: decimal("total_hours", { precision: 10, scale: 2 }),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }),
  shiftCount: integer("shift_count"),
  employeeCount: integer("employee_count"),
  
  // Detailed breakdown
  billableFacts: jsonb("billable_facts"), // Array of line items with hours, rates, etc.
  shiftReferences: jsonb("shift_references"), // Array of { shiftId, date, employee, hours, site }
  policyApplied: jsonb("policy_applied"), // { rounding, overtime_policy, break_rules }
  changeHistory: jsonb("change_history"), // Edits/approvals made to underlying data
  
  // Export URLs
  pdfUrl: varchar("pdf_url"),
  csvUrl: varchar("csv_url"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("audit_pack_workspace_idx").on(table.workspaceId),
  cycleIdx: index("audit_pack_cycle_idx").on(table.cycleKey, table.clientId),
  checksumIdx: index("audit_pack_checksum_idx").on(table.packChecksum),
}));

export const rateThrottleLogs = pgTable("rate_throttle_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  realmId: varchar("realm_id").notNull(), // QBO company/realm ID
  workspaceId: varchar("workspace_id").notNull(),
  
  // Request tracking
  operation: varchar("operation").notNull(), // 'create_invoice', 'query_customers', etc.
  priority: varchar("priority").default('normal'), // 'critical', 'high', 'normal', 'low'
  
  // Throttle decision
  wasThrottled: boolean("was_throttled").default(false),
  delayMs: integer("delay_ms").default(0),
  retryCount: integer("retry_count").default(0),
  
  // Rate limit status at time of request
  currentBucketSize: integer("current_bucket_size"),
  maxBucketSize: integer("max_bucket_size"),
  windowResetAt: timestamp("window_reset_at"),
  
  // Result
  succeeded: boolean("succeeded"),
  errorType: varchar("error_type"), // 'rate_limited', 'auth_expired', 'validation', etc.
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  realmIdx: index("throttle_realm_idx").on(table.realmId),
  workspaceIdx: index("throttle_workspace_idx").on(table.workspaceId),
  operationIdx: index("throttle_operation_idx").on(table.operation),
  createdAtIdx: index("throttle_created_idx").on(table.createdAt),
}));

export const oversightEvents = pgTable("oversight_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
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
  resolvedBy: varchar("resolved_by"), // User who approved/rejected
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
  workspaceId: varchar("workspace_id"),
  
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

export const alertConfigurations = pgTable("alert_configurations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
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
  notifyRoles: text("notify_roles").array().default(sql`ARRAY['org_owner', 'co_owner']::text[]`),
  notifyUserIds: text("notify_user_ids").array(), // Specific user IDs (optional)
  
  // Rate limiting (prevent alert flooding)
  cooldownMinutes: integer("cooldown_minutes").default(60), // Minimum time between duplicate alerts
  maxAlertsPerHour: integer("max_alerts_per_hour").default(10), // Max alerts of this type per hour
  
  // Schedule restrictions
  alertSchedule: jsonb("alert_schedule").default('{}'), // e.g., { "daysOfWeek": [1,2,3,4,5], "startHour": 8, "endHour": 18 }
  
  // Custom message template (optional)
  customTitle: varchar("custom_title"),
  customMessage: text("custom_message"),
  
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("alert_configurations_workspace_idx").on(table.workspaceId),
  index("alert_configurations_type_idx").on(table.alertType),
  index("alert_configurations_enabled_idx").on(table.isEnabled),
  uniqueIndex("alert_configurations_workspace_type_unique").on(table.workspaceId, table.alertType),
]);

export const alertHistory = pgTable("alert_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  configurationId: varchar("configuration_id"),
  
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
  acknowledgedBy: varchar("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgmentNotes: text("acknowledgment_notes"),
  
  // Resolution tracking
  isResolved: boolean("is_resolved").default(false),
  resolvedBy: varchar("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  
  // Metadata
  expiresAt: timestamp("expires_at"), // When alert is no longer relevant
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("alert_history_workspace_idx").on(table.workspaceId),
  index("alert_history_type_idx").on(table.alertType),
  index("alert_history_severity_idx").on(table.severity),
  index("alert_history_acknowledged_idx").on(table.isAcknowledged),
  index("alert_history_resolved_idx").on(table.isResolved),
  index("alert_history_created_idx").on(table.createdAt),
  index("alert_history_config_idx").on(table.configurationId),
]);

export const alertRateLimits = pgTable("alert_rate_limits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
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
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("alert_rate_limits_workspace_idx").on(table.workspaceId),
  index("alert_rate_limits_type_idx").on(table.alertType),
  index("alert_rate_limits_dedup_idx").on(table.deduplicationKey),
  uniqueIndex("alert_rate_limits_workspace_type_key_unique").on(table.workspaceId, table.alertType, table.deduplicationKey),
]);

export const platformScanSnapshots = pgTable("platform_scan_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  
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
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("platform_scan_snapshots_status_idx").on(table.status),
  index("platform_scan_snapshots_type_idx").on(table.scanType),
  index("platform_scan_snapshots_created_idx").on(table.createdAt),
]);

export const platformChangeEvents = pgTable("platform_change_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  
  // Link to scan that detected this
  scanId: varchar("scan_id"),
  
  // Change details
  changeType: varchar("change_type", { length: 100 }).notNull(), // 'feature_added', 'bug_fixed', 'hotpatch', 'enhancement', 'security_fix'
  severity: changeSeverityEnum("severity").notNull().default('info'),
  
  // ENHANCED: Detailed category for better organization
  detailedCategory: changeDetailedCategoryEnum("detailed_category").default('improvement'),
  
  // ENHANCED: Source attribution - WHO made this change
  sourceType: changeSourceTypeEnum("source_type").default('system'),
  sourceName: varchar("source_name", { length: 100 }), // e.g., "Billing Automation", "HelpAI", "John Smith"
  sourceUserId: varchar("source_user_id"), // If human-initiated
  
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
  whatsNewId: varchar("whats_new_id"),
  
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

export const featureUsageEvents = pgTable("feature_usage_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id").notNull(),
  
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

  createdAt: timestamp("created_at").defaultNow(),

  eventType: varchar("event_type"),
}, (table) => [
  index("feature_usage_workspace_idx").on(table.workspaceId),
  index("feature_usage_user_idx").on(table.userId),
  index("feature_usage_feature_idx").on(table.featureKey),
  index("feature_usage_category_idx").on(table.featureCategory),
  index("feature_usage_action_idx").on(table.actionType),
  index("feature_usage_ingested_idx").on(table.ingestedAt),
  index("feature_usage_session_idx").on(table.sessionId),
]);

export const apiUsageEvents = pgTable("api_usage_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id"),
  
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

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("api_usage_workspace_idx").on(table.workspaceId),
  index("api_usage_user_idx").on(table.userId),
  index("api_usage_endpoint_idx").on(table.endpoint),
  index("api_usage_api_type_idx").on(table.apiType),
  index("api_usage_partner_idx").on(table.partnerName),
  index("api_usage_ingested_idx").on(table.ingestedAt),
  index("api_usage_automated_idx").on(table.isAutomated),
]);

export const supervisorTelemetry = pgTable("supervisor_telemetry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  workspaceId: varchar("workspace_id"),
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
  updatedAt: timestamp("updated_at").defaultNow(),

}, (table) => [
  index("supervisor_telemetry_supervisor_idx").on(table.supervisorId),
  index("supervisor_telemetry_domain_idx").on(table.domain),
  index("supervisor_telemetry_period_idx").on(table.periodStart),
]);

export const platformAwarenessEvents = pgTable("platform_awareness_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Event identification
  eventType: varchar("event_type", { length: 100 }).notNull(),
  source: varchar("source", { length: 100 }).notNull(), // 'api', 'webhook', 'scheduler', 'user_action', 'ai_brain'
  
  // Resource affected
  resourceType: varchar("resource_type", { length: 100 }).notNull(), // 'employee', 'shift', 'invoice', 'notification', etc.
  resourceId: varchar("resource_id", { length: 255 }),
  workspaceId: varchar("workspace_id"),
  
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

export const backupRecords = pgTable("backup_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: varchar("type").notNull(),
  status: varchar("status").notNull().default('pending'),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  tablesIncluded: text("tables_included").array(),
  checksum: varchar("checksum"),
  storagePath: varchar("storage_path"),
  error: text("error"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  workspaceId: varchar("workspace_id"),
});

export const officerScoreEvents = pgTable("officer_score_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  pointsDelta: integer("points_delta").notNull(),
  scoreAfter: integer("score_after").notNull(),
  reason: text("reason").notNull(),
  referenceType: varchar("reference_type", { length: 30 }),
  referenceId: varchar("reference_id", { length: 255 }),
  triggeredBy: varchar("triggered_by", { length: 50 }).default('system'),
  isDisputable: boolean("is_disputable").notNull().default(true),
  isOverturned: boolean("is_overturned").default(false),
  overturnedBy: varchar("overturned_by"),
  overturnedAt: timestamp("overturned_at"),
  createdAt: timestamp("created_at").defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("idx_score_events_employee").on(table.employeeId),
  index("idx_score_events_workspace").on(table.workspaceId),
  index("idx_score_events_type").on(table.eventType),
  index("idx_score_events_created").on(table.createdAt),
]);

export const auditorAccounts = pgTable("auditor_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  name: varchar("name").notNull(),
  email: varchar("email").notNull().unique(),
  agencyName: varchar("agency_name").notNull(),
  agencyType: varchar("agency_type").default('state_bureau'),
  badgeNumber: varchar("badge_number"),

  // State scope — auditors see only orgs in their state(s)
  stateCode: varchar("state_code").notNull(),
  stateCodeList: jsonb("state_code_list").default([]),
  isMultiState: boolean("is_multi_state").default(false),

  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  passwordHash: varchar("password_hash"),

  workspaceId: varchar("workspace_id"),
  issuedBy: varchar("issued_by"),
  issuedAt: timestamp("issued_at").defaultNow(),
  expiresAt: timestamp("expires_at"),

  // ── Org-owner invite lifecycle ───────────────────────────────────────────
  inviteToken: varchar("invite_token").unique(),
  inviteMethod: varchar("invite_method").default('email'),
  phone: varchar("phone"),
  invitedWorkspaceId: varchar("invited_workspace_id"),
  invitedByUserId: varchar("invited_by_user_id"),
  activatedAt: timestamp("activated_at"),
  deactivatedAt: timestamp("deactivated_at"),
  deactivatedBy: varchar("deactivated_by"),

  // ── Document safe & audit outcome ────────────────────────────────────────
  documentSafeExpiresAt: timestamp("document_safe_expires_at"),
  finalOutcome: varchar("final_outcome"),
  finalOutcomeSubmittedAt: timestamp("final_outcome_submitted_at"),
  finalOutcomeSubmittedTo: varchar("final_outcome_submitted_to"),

  updatedAt: timestamp("updated_at").defaultNow(),


  createdAt: timestamp("created_at").default(sql`now()`),
  sessionExpiresAt: timestamp("session_expires_at", { withTimezone: true }),
  sessionToken: varchar("session_token"),
  accountType: varchar("account_type"),
}, (table) => [
  index("idx_auditor_accounts_state").on(table.stateCode),
  index("idx_auditor_accounts_active").on(table.isActive),
  index("idx_auditor_accounts_workspace").on(table.invitedWorkspaceId),
  index("idx_auditor_accounts_token").on(table.inviteToken),
]);

export const auditSessions = pgTable("audit_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  auditorId: varchar("auditor_id"),
  workspaceId: varchar("workspace_id"),
  sessionLabel: varchar("session_label"),
  stateCode: varchar("state_code").notNull(),

  // Running audit log (array of action objects)
  actionsLog: jsonb("actions_log").default([]),
  emailsSent: integer("emails_sent").default(0),
  documentsReviewed: integer("documents_reviewed").default(0),
  requestsMade: integer("requests_made").default(0),

  // Outcome
  overallOutcome: varchar("overall_outcome"),  // 'passed' | 'passed_with_conditions' | 'failed' | 'in_progress'
  summaryNotes: text("summary_notes"),
  totalFineAmount: integer("total_fine_amount").default(0), // cents

  isCompleted: boolean("is_completed").default(false),
  completedAt: timestamp("completed_at"),

  pdfGeneratedAt: timestamp("pdf_generated_at"),
  pdfUrl: varchar("pdf_url"),

  startedAt: timestamp("started_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at").default(sql`now()`),
}, (table) => [
  index("idx_audit_sessions_auditor").on(table.auditorId),
  index("idx_audit_sessions_workspace").on(table.workspaceId),
  index("idx_audit_sessions_state").on(table.stateCode),
  index("idx_audit_sessions_outcome").on(table.overallOutcome),
]);

export const auditorDocumentRequests = pgTable("auditor_document_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  auditSessionId: varchar("audit_session_id"),
  auditorId: varchar("auditor_id"),
  workspaceId: varchar("workspace_id"),

  requestedDocType: enforcementDocTypeEnum("requested_doc_type").notNull(),
  requestNotes: text("request_notes"),
  requestedAt: timestamp("requested_at").defaultNow(),
  dueDate: timestamp("due_date"),

  status: auditDocRequestStatusEnum("status").notNull().default('requested'),
  submittedDocId: varchar("submitted_doc_id"),
  submittedAt: timestamp("submitted_at"),

  reviewedAt: timestamp("reviewed_at"),
  outcomeNotes: text("outcome_notes"),
  conditions: text("conditions"),


  createdAt: timestamp("created_at"),
  safeMetadata: jsonb("safe_metadata").default('{}'),
}, (table) => [
  index("idx_auditor_doc_req_session").on(table.auditSessionId),
  index("idx_auditor_doc_req_workspace").on(table.workspaceId),
  index("idx_auditor_doc_req_status").on(table.status),
]);

export const auditFindings = pgTable("audit_findings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  auditSessionId: varchar("audit_session_id"),
  auditorId: varchar("auditor_id"),
  workspaceId: varchar("workspace_id"),

  findingType: auditFindingTypeEnum("finding_type").notNull(),
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  severity: varchar("severity").default('medium'),

  // Fine
  fineAmount: integer("fine_amount").default(0), // cents
  finePaid: boolean("fine_paid").default(false),
  finePaidAt: timestamp("fine_paid_at"),

  // Condition
  conditionDeadline: timestamp("condition_deadline"),
  conditionMet: boolean("condition_met").default(false),
  conditionMetAt: timestamp("condition_met_at"),

  relatedDocType: enforcementDocTypeEnum("related_doc_type"),
  relatedDocId: varchar("related_doc_id"),

  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at"),
}, (table) => [
  index("idx_audit_findings_session").on(table.auditSessionId),
  index("idx_audit_findings_workspace").on(table.workspaceId),
  index("idx_audit_findings_type").on(table.findingType),
]);

export const auditorFollowups = pgTable("auditor_followups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  auditSessionId: varchar("audit_session_id"),
  auditorId: varchar("auditor_id"),
  workspaceId: varchar("workspace_id"),

  scheduledFor: timestamp("scheduled_for").notNull(),
  followupType: varchar("followup_type").notNull().default('phone_call'),
  contactName: varchar("contact_name"),
  contactPhone: varchar("contact_phone"),
  contactEmail: varchar("contact_email"),
  notes: text("notes"),

  isCompleted: boolean("is_completed").default(false),
  completedAt: timestamp("completed_at"),
  outcome: text("outcome"),

  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at").default(sql`now()`),
}, (table) => [
  index("idx_auditor_followups_session").on(table.auditSessionId),
  index("idx_auditor_followups_auditor").on(table.auditorId),
  index("idx_auditor_followups_scheduled").on(table.scheduledFor),
]);

export const auditorDocumentSafe = pgTable("auditor_document_safe", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  auditorId: varchar("auditor_id"),
  auditSessionId: varchar("audit_session_id"),
  workspaceId: varchar("workspace_id"),
  documentType: varchar("document_type").notNull().default('audit_summary_pdf'),
  label: varchar("label").notNull(),
  storageKey: varchar("storage_key"),
  downloadUrl: varchar("download_url"),
  urlExpiresAt: timestamp("url_expires_at"),
  retentionRequiredUntil: timestamp("retention_required_until"),
  stateMandatedYears: integer("state_mandated_years").default(3),
  softDeletedAt: timestamp("soft_deleted_at"),
  purgeAt: timestamp("purge_at"),
  referenceNumber: varchar("reference_number").unique(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_auditor_doc_safe_auditor").on(table.auditorId),
  index("idx_auditor_doc_safe_workspace").on(table.workspaceId),
  index("idx_auditor_doc_safe_ref").on(table.referenceNumber),
]);

export const platformConfigSnapshots = pgTable("platform_config_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  workspaceId: varchar("workspace_id"),
  snapshotData: jsonb("snapshot_data").notNull(),
  version: integer("version").notNull().default(1),
  createdBy: varchar("created_by"),
}, (table) => [
  index("plat_cfg_snap_ws_idx").on(table.workspaceId),
  index("plat_cfg_snap_name_idx").on(table.name),
]);

export const platformConfigAudit = pgTable("platform_config_audit", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domain: varchar("domain", { length: 50 }).notNull(),
  key: varchar("key", { length: 255 }).notNull(),
  action: varchar("action", { length: 30 }).notNull(),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  changedBy: varchar("changed_by"),
  changeSource: varchar("change_source", { length: 50 }).default("manual"),
  workspaceId: varchar("workspace_id"),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("plat_cfg_aud_domain_key_idx").on(table.domain, table.key),
  index("plat_cfg_aud_changed_by_idx").on(table.changedBy),
  index("plat_cfg_aud_ws_idx").on(table.workspaceId),
  index("plat_cfg_aud_created_at_idx").on(table.createdAt),
]);

export const savedReports = pgTable("saved_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  reportType: varchar("report_type", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  filters: jsonb("filters").$type<Record<string, any>>().default(sql`'{}'::jsonb`),
  schedule: varchar("schedule", { length: 100 }),
  scheduleRecipients: jsonb("schedule_recipients").$type<string[]>().default(sql`'[]'::jsonb`),
  lastGeneratedAt: timestamp("last_generated_at"),
  createdBy: varchar("created_by"),
  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at"),
}, (table) => [
  index("saved_reports_workspace_idx").on(table.workspaceId),
  index("saved_reports_type_idx").on(table.reportType),
]);

export const universalAuditTrail = pgTable("universal_audit_trail", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  actorId: varchar("actor_id"),
  actorType: varchar("actor_type", { length: 20 }).notNull().default("user"),
  actorBot: varchar("actor_bot", { length: 30 }),
  actorRole: varchar("actor_role", { length: 30 }),
  actorIp: varchar("actor_ip", { length: 45 }),
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: varchar("entity_id"),
  entityName: varchar("entity_name", { length: 300 }),
  changeType: varchar("change_type", { length: 10 }).notNull().default("action"),
  changes: jsonb("changes").$type<Record<string, { old: any; new: any }>>(),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  sourceRoute: varchar("source_route", { length: 200 }),
  sourcePage: varchar("source_page", { length: 100 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("idx_uat_workspace_time").on(table.workspaceId, table.createdAt),
  index("idx_uat_actor").on(table.actorId, table.createdAt),
  index("idx_uat_entity").on(table.entityType, table.entityId, table.createdAt),
  index("idx_uat_action").on(table.action, table.createdAt),
  index("idx_uat_bot").on(table.actorBot, table.createdAt),
]);

export const reportAuditTrail = pgTable("report_audit_trail", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: uuid("report_id").notNull(),
  reportType: varchar("report_type").notNull().default("dar"),
  workspaceId: uuid("workspace_id").notNull(),
  action: varchar("action").notNull(),
  actorId: uuid("actor_id"),
  actorName: varchar("actor_name"),
  actorEmail: varchar("actor_email"),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("report_audit_trail_report_idx").on(table.reportId),
  index("report_audit_trail_workspace_idx").on(table.workspaceId),
]);

export const activities = pgTable("activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  leadId: varchar("lead_id"),
  dealId: varchar("deal_id"),
  activityType: varchar("activity_type").notNull(),
  subject: varchar("subject").notNull(),
  notes: text("notes"),
  workspaceId: varchar("workspace_id"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  assignedToUserId: varchar("assigned_to_user_id"),
  createdByUserId: varchar("created_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  performedBy: varchar("performed_by"),
  metadata: jsonb("metadata"),
  previousStatus: varchar("previous_status"),
  newStatus: varchar("new_status"),
  prospectEmail: varchar("prospect_email"),
  proposalId: varchar("proposal_id"),
  invitationId: varchar("invitation_id"),
}, (table) => [
  index("activities_org_idx").on(table.organizationId),
  index("activities_lead_idx").on(table.leadId),
  index("activities_deal_idx").on(table.dealId),
  index("idx_activities_subject_type").on(table.activityType, table.workspaceId),
]);

export const alertRules = pgTable("alert_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  condition: varchar("condition").notNull(),
  threshold: numeric("threshold").notNull(),
  windowMinutes: integer("window_minutes").notNull().default(5),
  severity: varchar("severity"),
  source: varchar("source"),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  workspaceId: varchar("workspace_id"),

  ruleType: varchar("rule_type"),
  configurationData: jsonb("configuration_data").default('{}'),
  rateLimitData: jsonb("rate_limit_data").default('{}'),
  historyData: jsonb("history_data").default('{}'),
});

export const aiProactiveAlerts = pgTable("ai_proactive_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  taskId: varchar("task_id"),
  alertType: alertTypeEnum("alert_type").notNull(),
  severity: alertSeverityEnum("severity").notNull().default("medium"),
  status: alertStatusEnum("status").notNull().default("queued"),
  dedupeHash: varchar("dedupe_hash"),
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  contextSnapshot: jsonb("context_snapshot").default(sql`'{}'::jsonb`),
  triggeredAt: timestamp("triggered_at").defaultNow(),
  acknowledgedBy: varchar("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedBy: varchar("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  resolutionNote: text("resolution_note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("ai_proactive_alerts_dedupe_idx").on(table.workspaceId, table.alertType, table.dedupeHash),
  index("ai_proactive_alerts_workspace_idx").on(table.workspaceId, table.status),
]);

// NOTE: password_reset_audit_log is defined in shared/schema.ts (legacy flat schema)
// and imported from ./schema/domains/auth. Do not duplicate it here.

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 33 — State Regulatory Auditor (SRA) Partner Portal Tables
// These are SEPARATE from the existing auditor_accounts / audit_sessions tables.
// SRA accounts are government employees with TOTP 2FA and credential verification.
// ─────────────────────────────────────────────────────────────────────────────

export const sraAccounts = pgTable("sra_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  badgeNumber: varchar("badge_number").unique().notNull(),
  fullLegalName: varchar("full_legal_name").notNull(),
  regulatoryBody: varchar("regulatory_body").notNull(),
  stateCode: varchar("state_code").notNull(),
  governmentEmail: varchar("government_email").unique().notNull(),
  authorizationLetterUrl: text("authorization_letter_url"),
  governmentIdUrl: text("government_id_url"),
  // status: pending_verification | verified | suspended | revoked
  status: varchar("status").notNull().default('pending_verification'),
  credentialHash: varchar("credential_hash"),
  twoFactorSecret: varchar("two_factor_secret"),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  verifiedBy: varchar("verified_by"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_sra_accounts_state").on(table.stateCode),
  index("idx_sra_accounts_status").on(table.status),
  index("idx_sra_accounts_badge").on(table.badgeNumber),
]);

export const sraAuditSessions = pgTable("sra_audit_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sraAccountId: varchar("sra_account_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  stateCode: varchar("state_code").notNull(),
  auditPeriodStart: timestamp("audit_period_start", { withTimezone: true }).notNull(),
  auditPeriodEnd: timestamp("audit_period_end", { withTimezone: true }).notNull(),
  authorizationLetterUrl: text("authorization_letter_url"),
  // status: active | closed | suspended
  status: varchar("status").notNull().default('active'),
  sessionToken: varchar("session_token").unique(),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  trinityContext: jsonb("trinity_context").default([]),
  // Compliance rating calculated on audit closure: 0.00–100.00
  complianceRating: decimal("compliance_rating", { precision: 5, scale: 2 }),
  // Breakdown: { total, remediated, bySeverity: { critical, major, minor, informational } }
  complianceRatingDetail: jsonb("compliance_rating_detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, (table) => [
  index("idx_sra_sessions_account").on(table.sraAccountId),
  index("idx_sra_sessions_workspace").on(table.workspaceId),
  index("idx_sra_sessions_token").on(table.sessionToken),
]);

// APPEND-ONLY — never update or delete rows in this table
export const sraAuditLog = pgTable("sra_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  sraAccountId: varchar("sra_account_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  // action_type: data_view | finding_created | finding_updated | pdf_generated | login | logout | trinity_query | document_downloaded
  actionType: varchar("action_type").notNull(),
  resourceType: varchar("resource_type"),
  resourceId: varchar("resource_id"),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata").default({}),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_sra_log_session").on(table.sessionId),
  index("idx_sra_log_workspace").on(table.workspaceId, table.timestamp),
  index("idx_sra_log_account").on(table.sraAccountId, table.timestamp),
]);

export const sraFindings = pgTable("sra_findings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  // finding_type: expired_license | training_deficiency | documentation_gap | policy_violation | staffing_violation
  findingType: varchar("finding_type").notNull(),
  // severity: critical | major | minor | informational
  severity: varchar("severity").notNull().default('minor'),
  occupationCodeReference: varchar("occupation_code_reference"),
  description: text("description").notNull(),
  evidenceUrls: jsonb("evidence_urls").default([]),
  recommendedAction: text("recommended_action"),
  complianceDeadline: timestamp("compliance_deadline", { withTimezone: true }),
  fineAmount: decimal("fine_amount", { precision: 10, scale: 2 }),
  paymentInstructions: text("payment_instructions"),
  followUpRequired: boolean("follow_up_required").default(false),
  followUpDate: timestamp("follow_up_date", { withTimezone: true }),
  // status: open | under_review | remediated | closed | appealed
  status: varchar("status").notNull().default('open'),
  linkedResourceType: varchar("linked_resource_type"),
  linkedResourceId: varchar("linked_resource_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, (table) => [
  index("idx_sra_findings_session").on(table.sessionId),
  index("idx_sra_findings_workspace").on(table.workspaceId, table.status),
]);

export const sraEnforcementDocuments = pgTable("sra_enforcement_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  // document_type: audit_report | notice_of_deficiency | notice_of_compliance | citation | cease_order
  documentType: varchar("document_type").notNull(),
  documentUrl: text("document_url").notNull(),
  sha256Hash: varchar("sha256_hash").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  issuedBySraId: varchar("issued_by_sra_id").notNull(),
  acknowledgedByWorkspaceAt: timestamp("acknowledged_by_workspace_at", { withTimezone: true }),
  metadata: jsonb("metadata").default({}),
}, (table) => [
  index("idx_sra_enf_docs_session").on(table.sessionId),
  index("idx_sra_enf_docs_workspace").on(table.workspaceId),
]);

export const sraFindingMessages = pgTable("sra_finding_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  findingId: varchar("finding_id").notNull(),
  sessionId: varchar("session_id").notNull(),
  // author_type: sra_auditor | workspace_owner | trinity_ai
  authorType: varchar("author_type").notNull(),
  authorId: varchar("author_id").notNull(),
  message: text("message").notNull(),
  attachments: jsonb("attachments").default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_sra_finding_msgs_finding").on(table.findingId),
]);

// Insert schemas
export const insertSraAccountSchema = createInsertSchema(sraAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSraAuditSessionSchema = createInsertSchema(sraAuditSessions).omit({ id: true, createdAt: true });
export const insertSraAuditLogSchema = createInsertSchema(sraAuditLog).omit({ id: true, timestamp: true });
export const insertSraFindingSchema = createInsertSchema(sraFindings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSraEnforcementDocumentSchema = createInsertSchema(sraEnforcementDocuments).omit({ id: true, issuedAt: true });
export const insertSraFindingMessageSchema = createInsertSchema(sraFindingMessages).omit({ id: true, createdAt: true });

// Types
export type SraAccount = typeof sraAccounts.$inferSelect;
export type InsertSraAccount = z.infer<typeof insertSraAccountSchema>;
export type SraAuditSession = typeof sraAuditSessions.$inferSelect;
export type InsertSraAuditSession = z.infer<typeof insertSraAuditSessionSchema>;
export type SraAuditLogEntry = typeof sraAuditLog.$inferSelect;
export type InsertSraAuditLogEntry = z.infer<typeof insertSraAuditLogSchema>;
export type SraFinding = typeof sraFindings.$inferSelect;
export type InsertSraFinding = z.infer<typeof insertSraFindingSchema>;
export type SraEnforcementDocument = typeof sraEnforcementDocuments.$inferSelect;
export type SraFindingMessage = typeof sraFindingMessages.$inferSelect;

// ── Phase 34: Analytics Aggregate Tables ────────────────────────────────────

export const analyticsDailySnapshots = pgTable("analytics_daily_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  snapshotDate: date("snapshot_date").notNull(),
  metricName: varchar("metric_name", { length: 128 }).notNull(),
  metricValue: decimal("metric_value", { precision: 15, scale: 4 }).notNull().default("0"),
  dimension: varchar("dimension", { length: 256 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_analytics_daily_wksp_date_metric").on(table.workspaceId, table.snapshotDate, table.metricName),
  index("idx_analytics_daily_dimension").on(table.workspaceId, table.metricName, table.dimension),
]);

export const analyticsClientHealthScores = pgTable("analytics_client_health_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  clientId: varchar("client_id").notNull(),
  snapshotDate: date("snapshot_date").notNull(),
  paymentVelocityScore: decimal("payment_velocity_score", { precision: 5, scale: 2 }).notNull().default("0"),
  disputeRateScore: decimal("dispute_rate_score", { precision: 5, scale: 2 }).notNull().default("0"),
  postCoverageScore: decimal("post_coverage_score", { precision: 5, scale: 2 }).notNull().default("0"),
  ticketVolumeScore: decimal("ticket_volume_score", { precision: 5, scale: 2 }).notNull().default("0"),
  compositeScore: decimal("composite_score", { precision: 5, scale: 2 }).notNull().default("0"),
  churnRisk: varchar("churn_risk", { length: 16 }).notNull().default("low"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_analytics_client_health_wksp_client_date").on(table.workspaceId, table.clientId, table.snapshotDate),
  index("idx_analytics_client_health_churn").on(table.workspaceId, table.churnRisk, table.snapshotDate),
]);

export const analyticsScheduledReports = pgTable("analytics_scheduled_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  frequency: varchar("frequency", { length: 16 }).notNull().default("weekly"),
  dayOfWeek: integer("day_of_week").default(1),
  dayOfMonth: integer("day_of_month").default(1),
  recipientUserIds: jsonb("recipient_user_ids").default([]),
  reportSections: jsonb("report_sections").default(["revenue", "workforce", "clients", "compliance"]),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAnalyticsDailySnapshotSchema = createInsertSchema(analyticsDailySnapshots).omit({ id: true, createdAt: true });
export const insertAnalyticsScheduledReportSchema = createInsertSchema(analyticsScheduledReports).omit({ id: true, createdAt: true, updatedAt: true });

export type AnalyticsDailySnapshot = typeof analyticsDailySnapshots.$inferSelect;
export type AnalyticsClientHealthScore = typeof analyticsClientHealthScores.$inferSelect;
export type AnalyticsScheduledReport = typeof analyticsScheduledReports.$inferSelect;

export * from './extended';
