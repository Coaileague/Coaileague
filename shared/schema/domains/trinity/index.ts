// ═══════════════════════════════════════════════════════════════
// Domain 8 of 15: Trinity AI Engine
// ═══════════════════════════════════════════════════════════════
// THE LAW: No new tables without Bryan's explicit approval. Zero DROP TABLE ever.
// Tables: 70

import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, uuid, decimal, real, date, time, doublePrecision, index, uniqueIndex, primaryKey, unique, numeric, point, serial } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  a2aAgentRoleEnum,
  a2aAgentStatusEnum,
  a2aMessagePriorityEnum,
  a2aMessageStatusEnum,
  a2aMessageTypeEnum,
  agentStatusEnum,
  aiBrainActorTypeEnum,
  aiBrainJobPriorityEnum,
  aiBrainJobStatusEnum,
  aiBrainSkillEnum,
  aiModelTierEnum,
  aiProviderEnum,
  aiTaskStatusEnum,
  automationGovernanceStatusEnum,
  automationLevelEnum,
  checkpointStatusEnum,
  codeChangeStatusEnum,
  codeChangeTypeEnum,
  componentDomainEnum,
  entityTypeEnum,
  gapSeverityEnum,
  gapTypeEnum,
  knowledgeDomainEnum,
  orchestrationPhaseEnum,
  permissionResultEnum,
  quickFixRiskTierEnum,
  ruleStatusEnum,
  ruleTypeEnum,
  subagentDomainEnum,
  subagentStatusEnum,
  trinityTrustLevelEnum,
} from '../../enums';

export const workspaceAiUsage = pgTable("workspace_ai_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

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
  invoiceId: varchar("invoice_id"), // Link to monthly AI usage invoice
  billingPeriod: varchar("billing_period"), // '2024-10', '2024-11' for monthly aggregation

  // Metadata
  inputData: jsonb("input_data"), // Request parameters (for debugging/audit)
  outputData: jsonb("output_data"), // AI response summary

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const customRules = pgTable("custom_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

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
  createdBy: varchar("created_by"),
  updatedBy: timestamp("updated_by"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const ruleExecutionLogs = pgTable("rule_execution_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ruleId: varchar("rule_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),

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
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const aiInsights = pgTable("ai_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

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
  dismissedBy: varchar("dismissed_by"),
  dismissedAt: timestamp("dismissed_at"),
  dismissReason: text("dismiss_reason"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  insightType: varchar("insight_type"),
  suggestionData: jsonb("suggestion_data").default('{}'),
}, (table) => ({
  workspaceIdx: index("ai_insights_workspace_idx").on(table.workspaceId),
  categoryIdx: index("ai_insights_category_idx").on(table.category),
  priorityIdx: index("ai_insights_priority_idx").on(table.priority),
  statusIdx: index("ai_insights_status_idx").on(table.status),
}));

export const aiUsageEvents = pgTable("ai_usage_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id"), // User who triggered the usage
  
  // Feature identification
  featureKey: varchar("feature_key").notNull(), // e.g., 'scheduleos_ai_generation', 'recordos_search', 'insightos_prediction'
  addonId: varchar("addon_id"), // Related add-on if applicable
  
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
  updatedAt: timestamp("updated_at").defaultNow(),

  // @ts-expect-error — TS migration: fix in refactoring sprint
  providerCostUsd: decimal("provider_cost_usd").default(0),
  aiModel: varchar("ai_model"),
  creditsDeducted: integer("credits_deducted").default(0),
}, (table) => ({
  workspaceIdx: index("ai_usage_workspace_idx").on(table.workspaceId),
  userIdx: index("ai_usage_user_idx").on(table.userId),
  featureIdx: index("ai_usage_feature_idx").on(table.featureKey),
  createdAtIdx: index("ai_usage_created_at_idx").on(table.createdAt),
  sessionIdx: index("ai_usage_session_idx").on(table.sessionId),
}));

export const aiUsageDailyRollups = pgTable("ai_usage_daily_rollups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
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

export const exceptionTriageQueue = pgTable("exception_triage_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  realmId: varchar("realm_id"),
  
  // Error classification
  errorType: varchar("error_type").notNull(), // 'auth_expired', 'rate_limited', 'mapping_missing', 'validation', 'duplicate_risk', 'amount_spike'
  errorCode: varchar("error_code"),
  errorMessage: text("error_message"),
  errorContext: jsonb("error_context"), // Structured context about the error
  
  // Source tracking
  sourceWorkflow: varchar("source_workflow"), // 'weekly_invoice', 'payroll_export', etc.
  sourceCycleKey: varchar("source_cycle_key"),
  sourceEntityType: varchar("source_entity_type"), // 'invoice', 'customer', 'employee'
  sourceEntityId: varchar("source_entity_id"),
  
  // Recommended action
  recommendedAction: varchar("recommended_action").notNull(), // 'refresh_token', 'relink_customer', 'retry', 'manual_review'
  actionDetails: jsonb("action_details"), // Structured action parameters
  
  // Resolution
  status: varchar("status").notNull().default('open'), // 'open', 'auto_resolved', 'manual_resolved', 'escalated', 'ignored'
  resolutionMethod: varchar("resolution_method"), // 'auto_retry', 'user_action', 'escalated'
  resolvedBy: varchar("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  
  // Retry tracking
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  nextRetryAt: timestamp("next_retry_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("exception_workspace_idx").on(table.workspaceId),
  errorTypeIdx: index("exception_error_type_idx").on(table.errorType),
  statusIdx: index("exception_status_idx").on(table.status),
  sourceIdx: index("exception_source_idx").on(table.sourceWorkflow, table.sourceCycleKey),
}));

export const aiBrainJobs = pgTable("ai_brain_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Job context
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id"),
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
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  rejectedBy: varchar("rejected_by"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  taskKind: varchar("task_kind"),
  queuePriority: integer("queue_priority").default(0),
}, (table) => [
  index("ai_brain_jobs_workspace_idx").on(table.workspaceId),
  index("ai_brain_jobs_status_idx").on(table.status),
  index("ai_brain_jobs_skill_idx").on(table.skill),
  index("ai_brain_jobs_priority_idx").on(table.priority),
  index("ai_brain_jobs_created_idx").on(table.createdAt),
  index("ai_brain_jobs_conversation_idx").on(table.conversationId),
  index("ai_brain_jobs_session_idx").on(table.sessionId),
]);

export const aiCheckpoints = pgTable("ai_checkpoints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id"), // User who triggered automation
  
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

export const scoringWeightProfiles = pgTable("scoring_weight_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
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
  
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("scoring_weights_workspace_idx").on(table.workspaceId),
  index("scoring_weights_default_idx").on(table.isDefault),
]);

export const aiSuggestions = pgTable("ai_suggestions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

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
  acceptedBy: varchar("accepted_by"),
  acceptedAt: timestamp("accepted_at"),
  rejectionReason: text("rejection_reason"), // Why was it rejected
  rejectedBy: varchar("rejected_by"),
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
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"), // Reviewer's comments
  
  // Rollback support
  appliedAt: timestamp("applied_at"),
  appliedBy: varchar("applied_by"),
  rollbackAvailable: boolean("rollback_available").default(true),
  
  // What's New integration
  whatsNewSent: boolean("whats_new_sent").default(false),
  whatsNewId: varchar("whats_new_id"),
  
  // Priority and categorization
  priority: integer("priority").default(2), // 1=critical, 2=normal, 3=low
  category: varchar("category", { length: 100 }), // e.g., 'bugfix', 'feature', 'enhancement'
  affectedModule: varchar("affected_module", { length: 100 }), // e.g., 'scheduling', 'payroll', 'chat'
  
  // Metadata
  metadata: jsonb("metadata"),
  
  // Expiry
  expiresAt: timestamp("expires_at"), // Auto-expire if not reviewed
  
  // Batch linkage (folded from batch_code_change_links)
  batchId: varchar("batch_id"),
  batchOrder: integer("batch_order").default(0),
  
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
  reviewedBy: varchar("reviewed_by"),
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

export const orchestrationRuns = pgTable("orchestration_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Context
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id"),
  
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
  approvedBy: varchar("approved_by"),
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

export const orchestrationRunSteps = pgTable("orchestration_run_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull(),
  
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
  updatedAt: timestamp("updated_at").defaultNow(),

  workspaceId: varchar("workspace_id"),
}, (table) => [
  index("run_steps_run_idx").on(table.runId),
  index("run_steps_status_idx").on(table.status),
  index("run_steps_step_number_idx").on(table.stepNumber),
]);

export const workflowArtifacts = pgTable("workflow_artifacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull(),
  stepId: varchar("step_id"),
  
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
  updatedAt: timestamp("updated_at").defaultNow(),

  workspaceId: varchar("workspace_id"),
}, (table) => [
  index("artifacts_run_idx").on(table.runId),
  index("artifacts_step_idx").on(table.stepId),
  index("artifacts_type_idx").on(table.artifactType),
]);

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

export const quickFixRolePolicies = pgTable("quick_fix_role_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  platformRole: varchar("platform_role", { length: 50 }).notNull(), // root_admin, support_manager, support_agent, etc.
  actionId: varchar("action_id").notNull(),
  
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
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("quick_fix_policies_role_idx").on(table.platformRole),
  index("quick_fix_policies_action_idx").on(table.actionId),
  uniqueIndex("quick_fix_policies_unique").on(table.platformRole, table.actionId),
]);

export const quickFixRequests = pgTable("quick_fix_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actionId: varchar("action_id").notNull(),
  
  // Requester info
  requesterId: varchar("requester_id").notNull(),
  requesterRole: varchar("requester_role", { length: 50 }).notNull(),
  workspaceId: varchar("workspace_id"),
  
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

export const quickFixExecutions = pgTable("quick_fix_executions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull(),
  
  // Executor info
  executorId: varchar("executor_id"), // null = system/automated
  executorType: varchar("executor_type", { length: 30 }).default('user'), // 'user', 'system', 'ai_brain', 'scheduled'
  
  // Orchestrator integration
  orchestratorRunId: varchar("orchestrator_run_id"),
  
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
  rolledBackBy: varchar("rolled_back_by"),
}, (table) => [
  index("quick_fix_executions_request_idx").on(table.requestId),
  index("quick_fix_executions_executor_idx").on(table.executorId),
  index("quick_fix_executions_result_idx").on(table.result),
  index("quick_fix_executions_started_idx").on(table.executionStarted),
]);

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

export const trinityAccessControl = pgTable("trinity_access_control", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  
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
  configuredBy: varchar("configured_by"),
  configuredAt: timestamp("configured_at").defaultNow(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("trinity_access_workspace_idx").on(table.workspaceId),
  index("trinity_access_resource_idx").on(table.resourceType, table.resourceId),
  uniqueIndex("trinity_access_unique_idx").on(table.workspaceId, table.resourceType, table.resourceId),
]);

export const subagentTelemetry = pgTable("subagent_telemetry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subagentId: varchar("subagent_id"),
  workspaceId: varchar("workspace_id"),
  
  // Execution Context
  executionId: varchar("execution_id", { length: 100 }).notNull(), // Unique execution trace ID
  actionId: varchar("action_id", { length: 200 }), // Specific action being executed
  userId: varchar("user_id"),
  
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
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("subagent_telemetry_subagent_idx").on(table.subagentId),
  index("subagent_telemetry_workspace_idx").on(table.workspaceId),
  index("subagent_telemetry_execution_idx").on(table.executionId),
  index("subagent_telemetry_status_idx").on(table.status),
  index("subagent_telemetry_created_idx").on(table.createdAt),
]);

export const automationActionLedger = pgTable("automation_action_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  
  actionId: varchar("action_id", { length: 100 }).notNull(),
  actionName: varchar("action_name", { length: 200 }).notNull(),
  actionCategory: varchar("action_category", { length: 50 }).notNull(),
  toolName: varchar("tool_name", { length: 100 }),
  
  confidenceScore: integer("confidence_score").notNull(),
  computedLevel: automationLevelEnum("computed_level").notNull(),
  policyLevel: automationLevelEnum("policy_level").notNull(),
  
  requiresHumanApproval: boolean("requires_human_approval").default(false),
  approvalState: varchar("approval_state", { length: 30 }).default("pending"),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  approvalNotes: text("approval_notes"),
  
  executedBy: varchar("executed_by"),
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
  updatedAt: timestamp("updated_at").defaultNow(),
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

export const trinityConversationSessions = pgTable("trinity_conversation_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id"),
  
  // Trinity conversation mode (BUDDY metacognition system)
  mode: varchar("mode", { length: 20 }).default("business"), // 'business' | 'personal' | 'integrated'
  
  sessionState: varchar("session_state", { length: 30 }).default("active"),
  
  // Session metadata (columns that exist in database)
  title: varchar("title", { length: 255 }),
  summary: text("summary"),
  messageCount: integer("message_count").default(0),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
  contextSnapshot: jsonb("context_snapshot").default(sql`'{}'::jsonb`),
  
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
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("trinity_conversation_sessions_user_idx").on(table.userId),
  index("trinity_conversation_sessions_workspace_idx").on(table.workspaceId),
  index("trinity_conversation_sessions_state_idx").on(table.sessionState),
  index("trinity_conversation_sessions_activity_idx").on(table.lastActivityAt),
]);

export const trinityConversationTurns = pgTable("trinity_conversation_turns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  sessionId: varchar("session_id").notNull(),
  
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
  
  ledgerEntryId: varchar("ledger_entry_id"),
  
  tokenCount: integer("token_count"),
  responseTimeMs: integer("response_time_ms"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  processingTimeMs: integer("processing_time_ms"),
  tokensUsed: integer("tokens_used"),
}, (table) => [
  index("trinity_conversation_turns_session_idx").on(table.sessionId),
  index("trinity_conversation_turns_number_idx").on(table.turnNumber),
  index("trinity_conversation_turns_role_idx").on(table.role),
]);

export const aiApprovals = pgTable("ai_approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  approvalKind: varchar("approval_kind", { length: 30 }).notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  priority: varchar("priority", { length: 20 }).default('normal'),
  expiresAt: timestamp("expires_at"),
  status: varchar("status", { length: 30 }).default('pending'),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  approvalNotes: text("approval_notes"),
  rejectedBy: varchar("rejected_by"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  requesterId: varchar("requester_id"),
  approverId: varchar("approver_id"),
  sourceSystem: varchar("source_system", { length: 30 }),
  sourceTaskId: varchar("source_task_id"),
  sourceAgentId: varchar("source_agent_id", { length: 100 }),
  requestType: varchar("request_type", { length: 50 }),
  estimatedTokens: integer("estimated_tokens").default(0),
  gapFindingId: varchar("gap_finding_id"),
  workOrderId: varchar("work_order_id"),
  riskLevel: varchar("risk_level", { length: 20 }).default('medium'),
  impactScope: varchar("impact_scope", { length: 50 }),
  payload: jsonb("payload").default({}),
  statusHistory: jsonb("status_history").default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const entityAttributes = pgTable("entity_attributes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Entity reference (can be user or agent)
  entityType: entityTypeEnum("entity_type").notNull(),
  entityId: varchar("entity_id", { length: 255 }).notNull(), // User ID or Agent ID
  workspaceId: varchar("workspace_id"),
  
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
  createdBy: varchar("created_by"),
}, (table) => [
  index("entity_attributes_entity_idx").on(table.entityType, table.entityId),
  index("entity_attributes_workspace_idx").on(table.workspaceId),
  index("entity_attributes_name_idx").on(table.attributeName),
  uniqueIndex("entity_attributes_unique").on(table.entityType, table.entityId, table.attributeName, table.workspaceId),
]);

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
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("a2a_messages_from_idx").on(table.fromAgent),
  index("a2a_messages_to_idx").on(table.toAgent),
  index("a2a_messages_type_idx").on(table.type),
  index("a2a_messages_status_idx").on(table.status),
  index("a2a_messages_correlation_idx").on(table.correlationId),
  index("a2a_messages_created_idx").on(table.createdAt),
]);

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
  updatedAt: timestamp("updated_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("a2a_teams_coordinator_idx").on(table.coordinator),
  index("a2a_teams_status_idx").on(table.status),
]);

export const a2aTrustRules = pgTable("a2a_trust_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  sourceAgent: varchar("source_agent", { length: 255 }).notNull(),
  targetAgent: varchar("target_agent", { length: 255 }).notNull(),
  dataType: varchar("data_type", { length: 255 }).notNull(),
  conditions: jsonb("conditions").default('[]'), // Array of TrustCondition objects
  trustLevel: varchar("trust_level", { length: 50 }).default("conditional"), // full, verified, conditional, none
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("a2a_trust_source_idx").on(table.sourceAgent),
  index("a2a_trust_target_idx").on(table.targetAgent),
]);

export const aiLearningEvents = pgTable("ai_learning_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: varchar("event_type", { length: 30 }).notNull(), // 'experience', 'confidence_update', 'strategy_adaptation'
  
  agentId: varchar("agent_id", { length: 255 }).notNull(),
  action: varchar("action", { length: 500 }).default("unknown"),
  actionType: varchar("action_type"),
  domain: varchar("domain").default("general"),
  workspaceId: varchar("workspace_id"),
  
  // Core stats kept as real columns for query filtering
  outcome: varchar("outcome"),
  reward: numeric("reward", { precision: 5, scale: 3 }).default('0'),
  confidenceLevel: doublePrecision("confidence_level").default(0.5),
  humanIntervention: boolean("human_intervention").default(false),
  
  // Event-specific payload (context, parameters, factors, strategy diffs, etc.)
  data: jsonb("data").default({}),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_ale_event_type").on(table.eventType),
  index("idx_ale_agent_id").on(table.agentId),
  index("idx_ale_workspace").on(table.workspaceId),
  index("idx_ale_outcome").on(table.outcome),
  index("idx_ale_created_at").on(table.createdAt),
]);

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
  
  workspaceId: varchar("workspace_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("llm_judge_type_idx").on(table.evaluationType),
  index("llm_judge_subject_idx").on(table.subjectId, table.subjectType),
  index("llm_judge_verdict_idx").on(table.verdict),
  index("llm_judge_risk_idx").on(table.riskScore),
  index("llm_judge_workspace_idx").on(table.workspaceId),
  index("llm_judge_created_idx").on(table.createdAt),
]);

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

export const automationGovernance = pgTable("automation_governance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Workspace context
  workspaceId: varchar("workspace_id").notNull(),
  
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
  approvedBy: varchar("approved_by"),
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
  rolledBackBy: varchar("rolled_back_by"),
  
  // AI Brain job linkage
  aiBrainJobId: varchar("ai_brain_job_id"),
  
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

export const trinityThoughtSignatures = pgTable("trinity_thought_signatures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Session context
  sessionId: varchar("session_id", { length: 100 }).notNull(),
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id"),
  
  // Workflow linkage
  runId: varchar("run_id"),
  
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

export const trinityActionLogs = pgTable("trinity_action_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Session context
  sessionId: varchar("session_id", { length: 100 }).notNull(),
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id"),
  
  // Workflow and thought linkage
  runId: varchar("run_id"),
  thoughtId: varchar("thought_id"),
  
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

export const trinityUserConfidenceStats = pgTable("trinity_user_confidence_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id"),
  
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

export const trinityOrgStats = pgTable("trinity_org_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique(),
  
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

export const orchestrationOverlays = pgTable("orchestration_overlays", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // === CORRELATION IDS (Reference existing systems) ===
  workOrderId: varchar("work_order_id").notNull(), // Links to WorkOrder in trinityWorkOrderSystem
  executionManifestId: varchar("execution_manifest_id"), // Links to ExecutionManifest in trinityExecutionFabric
  workboardTaskId: varchar("workboard_task_id"), // Links to aiWorkboardTasks if applicable
  conversationId: varchar("conversation_id"), // Links to conversation session
  
  // === CONTEXT ===
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id"),
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

export const aiGapFindings = pgTable("ai_gap_findings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  
  // Location
  componentId: varchar("component_id"),
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

export const trinitySelfAwareness = pgTable("trinity_self_awareness", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  
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

export const aiBrainLiveEvents = pgTable("ai_brain_live_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  
  // Actor information
  actorType: aiBrainActorTypeEnum("actor_type").notNull(),
  actorId: varchar("actor_id"),
  actorName: varchar("actor_name", { length: 200 }),
  
  // Event details
  actionType: varchar("action_type", { length: 100 }).notNull(),
  actionCategory: varchar("action_category", { length: 100 }),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  
  // Event payload
  payload: jsonb("payload"),
  metadata: jsonb("metadata"),
  
  // Visibility and targeting
  severity: varchar("severity", { length: 20 }).default("info"),
  isGlobal: boolean("is_global").default(false),
  targetUserIds: text("target_user_ids").array(),
  targetRoles: text("target_roles").array(),
  
  // Processing status
  broadcastedAt: timestamp("broadcasted_at"),
  acknowledgedCount: integer("acknowledged_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("able_workspace_idx").on(table.workspaceId),
  index("able_actor_type_idx").on(table.actorType),
  index("able_action_type_idx").on(table.actionType),
  index("able_created_idx").on(table.createdAt),
  index("able_global_idx").on(table.isGlobal),
]);

export const automationExecutions = pgTable("automation_executions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  
  // Execution identification
  actionType: varchar("action_type", { length: 100 }).notNull(),
  actionName: varchar("action_name", { length: 300 }).notNull(),
  actionId: varchar("action_id", { length: 100 }),
  
  // Status lifecycle
  status: varchar("status", { length: 50 }).default("queued").notNull(),
  
  // User context
  triggeredBy: varchar("triggered_by"),
  triggerSource: varchar("trigger_source", { length: 100 }),
  
  // Timing
  queuedAt: timestamp("queued_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  
  // Input/Output payloads
  inputPayload: jsonb("input_payload"),
  outputPayload: jsonb("output_payload"),
  
  // User-visible breakdown (AI-generated summary)
  workBreakdown: jsonb("work_breakdown"),
  aiSummary: text("ai_summary"),
  
  // External system sync
  externalSystem: varchar("external_system", { length: 100 }),
  externalSyncStatus: varchar("external_sync_status", { length: 50 }),
  externalSyncAt: timestamp("external_sync_at"),
  externalReference: varchar("external_reference", { length: 200 }),
  
  // Verification workflow
  requiresVerification: boolean("requires_verification").default(false),
  verifiedBy: varchar("verified_by"),
  verifiedAt: timestamp("verified_at"),
  verificationNotes: text("verification_notes"),
  rejectedBy: varchar("rejected_by"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  
  // Failure handling
  failureReason: text("failure_reason"),
  failureCode: varchar("failure_code", { length: 50 }),
  remediationSteps: jsonb("remediation_steps"),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  
  // Metrics
  processingTimeMs: integer("processing_time_ms"),
  itemsProcessed: integer("items_processed").default(0),
  itemsFailed: integer("items_failed").default(0),
  totalValueProcessed: decimal("total_value_processed", { precision: 14, scale: 2 }),
  
  // Audit
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),

  correlationId: uuid("correlation_id"),
  parentExecutionId: uuid("parent_execution_id"),
  metadata: jsonb("metadata"),
  executionType: varchar("execution_type"),
  triggerData: jsonb("trigger_data").default('{}'),
  governanceData: jsonb("governance_data").default('{}'),
  acknowledgmentData: jsonb("acknowledgment_data").default('{}'),
  ledgerData: jsonb("ledger_data").default('{}'),
}, (table) => [
  index("ae_workspace_idx").on(table.workspaceId),
  index("ae_status_idx").on(table.status),
  index("ae_action_type_idx").on(table.actionType),
  index("ae_queued_at_idx").on(table.queuedAt),
  index("ae_requires_verification_idx").on(table.requiresVerification),
]);

export const trinityAutomationSettings = pgTable("trinity_automation_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique(),
  
  // Feature toggles
  schedulingEnabled: boolean("scheduling_enabled").default(false),
  invoicingEnabled: boolean("invoicing_enabled").default(false),
  payrollEnabled: boolean("payroll_enabled").default(false),
  timeTrackingEnabled: boolean("time_tracking_enabled").default(false),
  shiftMonitoringEnabled: boolean("shift_monitoring_enabled").default(false),
  quickbooksSyncEnabled: boolean("quickbooks_sync_enabled").default(false),

  // Invoicing cycle configuration
  // Cycle: daily | weekly | biweekly | monthly | net30
  invoicingCycle: varchar("invoicing_cycle", { length: 20 }).default("monthly"),
  // For weekly/biweekly: day of week to run (monday–sunday)
  invoicingDayOfWeek: varchar("invoicing_day_of_week", { length: 10 }).default("monday"),
  // For monthly: day of month to run (1–28)
  invoicingDayOfMonth: integer("invoicing_day_of_month").default(1),
  // For net30: how many days after service delivery
  invoicingNetDays: integer("invoicing_net_days").default(30),

  // Payroll cycle configuration
  // Cycle: daily | weekly | biweekly | semi_monthly | monthly
  payrollCycle: varchar("payroll_cycle", { length: 20 }).default("biweekly"),
  // For weekly/biweekly: day of week to run (monday–sunday)
  payrollDayOfWeek: varchar("payroll_day_of_week", { length: 10 }).default("friday"),
  // For semi-monthly: comma-separated days, e.g. "1,15" or "15,30"
  payrollSemiMonthlyDays: varchar("payroll_semi_monthly_days", { length: 10 }).default("1,15"),
  // Calculated next run date (set by scheduler after each run)
  payrollNextRunDate: timestamp("payroll_next_run_date"),

  // Break compliance rule set
  // e.g. US-FEDERAL | CA | NY | TX | WA | FL | IL
  breakComplianceRule: varchar("break_compliance_rule", { length: 30 }).default("US-FEDERAL"),

  // Shift reminder lead time in hours (1 = 1 hour before shift)
  shiftReminderHours: integer("shift_reminder_hours").default(1),

  // Approval settings
  requireApprovalForAll: boolean("require_approval_for_all").default(true),
  autoApproveThreshold: decimal("auto_approve_threshold", { precision: 5, scale: 2 }).default("0.95"),

  // Notification preferences
  notifyOnRequest: boolean("notify_on_request").default(true),
  notifyOnComplete: boolean("notify_on_complete").default(true),
  notifyOnError: boolean("notify_on_error").default(true),

  // Last modified tracking
  lastModifiedBy: varchar("last_modified_by"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("tas_workspace_idx").on(table.workspaceId),
]);

export const trinityAutomationRequests = pgTable("trinity_automation_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Request details
  feature: varchar("feature", { length: 50 }).notNull(), // scheduling, invoicing, payroll, etc.
  requestedBy: varchar("requested_by"),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  
  // Context and preview
  context: jsonb("context").default({}), // Feature-specific context
  preview: jsonb("preview"), // Generated preview data
  previewGeneratedAt: timestamp("preview_generated_at"),
  
  // Status tracking
  status: varchar("status", { length: 30 }).default("pending").notNull(), // pending, approved, rejected, executing, completed, failed
  
  // Approval workflow
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  rejectedBy: varchar("rejected_by"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  
  // Execution results
  executionStartedAt: timestamp("execution_started_at"),
  executionCompletedAt: timestamp("execution_completed_at"),
  executionResult: jsonb("execution_result"),
  errorMessage: text("error_message"),
  
  // Trinity signature for verification
  trinitySignature: text("trinity_signature"),
  
  // Expiry (requests expire after 24 hours if not actioned)
  expiresAt: timestamp("expires_at"),

  // Checkpoint: step-by-step execution state for pause/resume
  // Stores { version, steps[], resumable, partialResults } — written after each step
  checkpointData: jsonb("checkpoint_data"),

  // Pause/checkpoint state
  pausedAt: timestamp("paused_at"),
  pausedBy: varchar("paused_by", { length: 255 }),
  pauseReason: text("pause_reason"),

  // Payload revision (user edits before final approval)
  revisedPayload: jsonb("revised_payload"),
  revisionNotes: text("revision_notes"),
  revisionHistory: jsonb("revision_history").default([]),

  // Trinity on-demand re-analysis of staged payload
  trinityReanalysis: text("trinity_reanalysis"),
  trinityReanalysisAt: timestamp("trinity_reanalysis_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("tar_workspace_idx").on(table.workspaceId),
  index("tar_status_idx").on(table.status),
  index("tar_feature_idx").on(table.feature),
  index("tar_workspace_status_idx").on(table.workspaceId, table.status),
  index("tar_expires_idx").on(table.expiresAt),
]);

export const trinityAutomationReceipts = pgTable("trinity_automation_receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Link to original request
  requestId: varchar("request_id"),
  
  // Receipt details
  feature: varchar("feature", { length: 50 }).notNull(),
  action: varchar("action", { length: 100 }).notNull(), // e.g., "generate_schedule", "sync_invoices"
  
  // Execution summary
  success: boolean("success").notNull(),
  itemsProcessed: integer("items_processed").default(0),
  itemsFailed: integer("items_failed").default(0),
  summary: text("summary"),
  
  // Detailed results
  details: jsonb("details").default({}),
  
  // Trinity verification
  trinitySignature: text("trinity_signature"),
  verifiedAt: timestamp("verified_at"),
  
  // Actors
  initiatedBy: varchar("initiated_by"),
  approvedBy: varchar("approved_by"),
  
  executedAt: timestamp("executed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("trcpt_workspace_idx").on(table.workspaceId),
  index("trcpt_feature_idx").on(table.feature),
  index("trcpt_request_idx").on(table.requestId),
  index("trcpt_executed_idx").on(table.executedAt),
  index("trcpt_workspace_executed_idx").on(table.workspaceId, table.executedAt),
]);

export const trinityBuddySettings = pgTable("trinity_buddy_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id"),
  
  // Personal Development Mode
  personalDevelopmentEnabled: boolean("personal_development_enabled").default(false),
  
  // Spiritual guidance preference
  spiritualGuidance: varchar("spiritual_guidance", { length: 20 }).default("none"), // 'none' | 'general' | 'christian'
  
  // Accountability settings
  accountabilityLevel: varchar("accountability_level", { length: 20 }).default("balanced"), // 'gentle' | 'balanced' | 'challenging'
  weeklyCheckInEnabled: boolean("weekly_check_in_enabled").default(false),
  checkInDay: varchar("check_in_day", { length: 10 }).default("friday"), // day of week
  checkInTime: varchar("check_in_time", { length: 10 }).default("17:00"), // HH:MM format
  
  // Metacognition preferences
  showThoughtProcess: boolean("show_thought_process").default(true), // Show Trinity's reasoning
  proactiveInsights: boolean("proactive_insights").default(true), // Trinity brings up observations
  memoryRecallDepth: varchar("memory_recall_depth", { length: 20 }).default("moderate"), // 'minimal' | 'moderate' | 'deep'
  
  // Personal goals (Trinity tracks and references these)
  personalGoals: jsonb("personal_goals").default(sql`'[]'::jsonb`), // Array of { goal, deadline, progress }
  
  // Conversation preferences
  preferredCommunicationStyle: varchar("preferred_communication_style", { length: 20 }).default("direct"), // 'direct' | 'supportive' | 'challenging'
  allowPersonalQuestions: boolean("allow_personal_questions").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("trinity_buddy_settings_user_idx").on(table.userId),
  index("trinity_buddy_settings_workspace_idx").on(table.workspaceId),
  uniqueIndex("trinity_buddy_settings_user_workspace_idx").on(table.userId, table.workspaceId),
]);

export const trinityMetacognitionLog = pgTable("trinity_metacognition_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id"),
  sessionId: varchar("session_id"),
  
  // What Trinity noticed
  insightType: varchar("insight_type", { length: 30 }).notNull(), // 'pattern' | 'emotion' | 'behavior' | 'contradiction' | 'growth' | 'struggle'
  insightContent: text("insight_content").notNull(), // The actual observation
  insightConfidence: decimal("insight_confidence", { precision: 3, scale: 2 }).default("0.80"),
  
  // Context from when insight was generated
  triggerContext: text("trigger_context"), // What user said/did that triggered this insight
  relatedTopics: text("related_topics").array().default(sql`'{}'`),
  
  // Whether Trinity has mentioned this to the user
  surfacedToUser: boolean("surfaced_to_user").default(false),
  surfacedAt: timestamp("surfaced_at"),
  userReaction: varchar("user_reaction", { length: 30 }), // 'acknowledged' | 'rejected' | 'appreciated' | 'ignored'
  
  // Decay/relevance
  relevanceScore: decimal("relevance_score", { precision: 3, scale: 2 }).default("1.00"), // Decreases over time
  lastRelevantAt: timestamp("last_relevant_at").defaultNow(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("trinity_metacognition_user_idx").on(table.userId),
  index("trinity_metacognition_workspace_idx").on(table.workspaceId),
  index("trinity_metacognition_type_idx").on(table.insightType),
  index("trinity_metacognition_relevance_idx").on(table.relevanceScore),
]);

export const trinityDecisionLog = pgTable("trinity_decision_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  triggerEvent: varchar("trigger_event", { length: 60 }),
  taskType: varchar("task_type", { length: 30 }),
  taskComplexity: varchar("task_complexity", { length: 20 }),
  decisionType: varchar("decision_type", { length: 50 }).notNull(),
  domain: varchar("domain", { length: 30 }).notNull(),

  chosenOption: text("chosen_option").notNull(),
  chosenOptionId: varchar("chosen_option_id"),
  reasoning: text("reasoning").notNull(),

  alternativesConsidered: jsonb("alternatives_considered").$type<Array<{
    optionId: string;
    optionLabel: string;
    rejectionReason: string;
    score?: number;
  }>>(),

  candidatesEvaluated: jsonb("candidates_evaluated").$type<Array<{
    candidateId: string;
    name: string;
    rankScore: number;
    proximityMiles?: number;
    otRisk?: boolean;
    otHoursProjected?: number;
    complianceStatus?: string;
    reliabilityScore?: number;
    costImpact?: number;
    reasoning: string;
  }>>(),

  contextSnapshot: jsonb("context_snapshot").$type<Record<string, any>>(),

  confidenceScore: decimal("confidence_score", { precision: 3, scale: 2 }),

  triadReviewTriggered: boolean("triad_review_triggered").default(false),
  judgeModel: varchar("judge_model", { length: 20 }),
  originalScore: decimal("original_score", { precision: 3, scale: 2 }),
  claudeVerdict: varchar("claude_verdict", { length: 20 }),
  claudeReasoning: text("claude_reasoning"),
  claudeSuggestedAlternative: varchar("claude_suggested_alternative"),

  outcomeStatus: varchar("outcome_status", { length: 20 }).default("pending"),
  humanOverride: boolean("human_override").default(false),
  overrideBy: varchar("override_by"),
  overrideReason: text("override_reason"),

  primaryModel: varchar("primary_model", { length: 20 }),
  tokensUsed: integer("tokens_used"),
  costUsd: decimal("cost_usd", { precision: 8, scale: 4 }),
  fallbackChainUsed: boolean("fallback_chain_used").default(false),
  modelsAttempted: jsonb("models_attempted").$type<string[]>(),

  relatedEntityType: varchar("related_entity_type", { length: 50 }),
  relatedEntityId: varchar("related_entity_id"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  telemetryData: jsonb("telemetry_data").default('{}'),
  anomalyData: jsonb("anomaly_data").default('{}'),
}, (table) => [
  index("trinity_decision_workspace_idx").on(table.workspaceId),
  index("trinity_decision_type_idx").on(table.decisionType),
  index("trinity_decision_domain_idx").on(table.domain),
  index("trinity_decision_entity_idx").on(table.relatedEntityType, table.relatedEntityId),
  index("trinity_decision_trigger_idx").on(table.triggerEvent),
  index("trinity_decision_triad_idx").on(table.triadReviewTriggered),
  index("trinity_decision_created_idx").on(table.createdAt),
]);

export const trinityRuntimeFlags = pgTable("trinity_runtime_flags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Flag identification
  key: varchar("key", { length: 100 }).notNull().unique(),
  label: varchar("label", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).default("general"), // 'ui', 'performance', 'security', 'integration', 'ai', 'general'
  
  // Flag type and value
  flagType: varchar("flag_type", { length: 30 }).default("toggle").notNull(), // 'toggle', 'threshold', 'config', 'percentage'
  valueType: varchar("value_type", { length: 20 }).default("boolean").notNull(), // 'boolean', 'string', 'number', 'json'
  currentValue: text("current_value").notNull(), // JSON-encoded value
  defaultValue: text("default_value").notNull(), // JSON-encoded default
  
  // Governance
  safetyLevel: varchar("safety_level", { length: 20 }).default("low_risk").notNull(), // 'low_risk', 'medium_risk', 'high_risk'
  allowedActors: text("allowed_actors").array().default(sql`ARRAY['trinity', 'admin']::text[]`), // Who can modify: 'trinity', 'admin', 'system'
  requiresApproval: boolean("requires_approval").default(false), // If true, Trinity suggests but human approves
  
  // Scope (null = global, otherwise workspace-specific)
  workspaceId: varchar("workspace_id"),
  
  // State
  isEnabled: boolean("is_enabled").default(true).notNull(), // Master enable/disable for the flag itself
  lastModifiedBy: varchar("last_modified_by", { length: 50 }), // 'trinity', 'admin:userId', 'system'
  lastModifiedReason: text("last_modified_reason"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),

  settingsData: jsonb("settings_data").default('{}'),
  accessData: jsonb("access_data").default('{}'),
}, (table) => [
  index("trinity_runtime_flags_key_idx").on(table.key),
  index("trinity_runtime_flags_category_idx").on(table.category),
  index("trinity_runtime_flags_safety_idx").on(table.safetyLevel),
  index("trinity_runtime_flags_workspace_idx").on(table.workspaceId),
]);

export const trinityRuntimeFlagChanges = pgTable("trinity_runtime_flag_changes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  flagId: varchar("flag_id").notNull(),
  flagKey: varchar("flag_key", { length: 100 }).notNull(), // Denormalized for easy querying
  
  // Change details
  previousValue: text("previous_value"), // JSON-encoded
  newValue: text("new_value").notNull(), // JSON-encoded
  changeReason: text("change_reason"),
  
  // Actor info
  actorType: varchar("actor_type", { length: 20 }).notNull(), // 'trinity', 'admin', 'system', 'diagnostics'
  actorId: varchar("actor_id"), // userId for admins, null for trinity/system
  
  // Source tracking
  source: varchar("source", { length: 50 }).default("manual"), // 'manual', 'diagnostics', 'automation', 'rollback', 'api'
  sourceDetails: text("source_details"), // JSON with additional context (e.g., diagnostic issue ID)
  
  // Outcome
  wasSuccessful: boolean("was_successful").default(true),
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("trinity_flag_changes_flag_id_idx").on(table.flagId),
  index("trinity_flag_changes_flag_key_idx").on(table.flagKey),
  index("trinity_flag_changes_actor_idx").on(table.actorType),
  index("trinity_flag_changes_source_idx").on(table.source),
  index("trinity_flag_changes_created_idx").on(table.createdAt),
]);

export const trinityRequests = pgTable("trinity_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id"),
  
  // Request details
  requestType: varchar("request_type", { length: 50 }).notNull(), // 'api', 'feature', 'workflow', 'automation'
  endpoint: varchar("endpoint", { length: 500 }), // API endpoint or feature path
  method: varchar("method", { length: 10 }), // GET, POST, PUT, DELETE, etc.
  featureKey: varchar("feature_key", { length: 100 }), // Feature registry key if applicable
  
  // Context
  source: varchar("source", { length: 50 }), // 'web', 'mobile', 'api', 'automation', 'trinity'
  sessionId: varchar("session_id", { length: 100 }),
  userAgent: text("user_agent"),
  ipAddress: varchar("ip_address", { length: 45 }),
  
  // Request/Response
  requestPayload: jsonb("request_payload"), // Sanitized request data (no sensitive info)
  responseStatus: integer("response_status"), // HTTP status code
  responseTimeMs: integer("response_time_ms"),
  
  // Access control
  wasBlocked: boolean("was_blocked").default(false),
  blockReason: varchar("block_reason", { length: 200 }), // 'tier_limit', 'rate_limit', 'permission', 'feature_disabled'
  tierAtRequest: varchar("tier_at_request", { length: 50 }), // Subscription tier at time of request
  
  // Trinity analysis
  trinityEnriched: boolean("trinity_enriched").default(false),
  painPointDetected: varchar("pain_point_detected", { length: 100 }),
  upsellOpportunity: varchar("upsell_opportunity", { length: 100 }),
  
  // Metadata
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("trinity_req_workspace_idx").on(table.workspaceId),
  index("trinity_req_user_idx").on(table.userId),
  index("trinity_req_type_idx").on(table.requestType),
  index("trinity_req_feature_idx").on(table.featureKey),
  index("trinity_req_blocked_idx").on(table.wasBlocked),
  index("trinity_req_created_idx").on(table.createdAt),
  index("trinity_req_pain_point_idx").on(table.painPointDetected),
]);

export const trinityUsageAnalytics = pgTable("trinity_usage_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Time period
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  periodType: varchar("period_type", { length: 20 }).notNull(), // 'hourly', 'daily', 'weekly', 'monthly'
  
  // Usage metrics
  totalRequests: integer("total_requests").default(0),
  uniqueUsers: integer("unique_users").default(0),
  uniqueFeatures: integer("unique_features").default(0),
  
  // Blocked attempts (CRITICAL for upselling)
  blockedRequests: integer("blocked_requests").default(0),
  blockedByTier: jsonb("blocked_by_tier").default(sql`'{}'::jsonb`), // { 'employee_limit': 5, 'ai_credits': 12, ... }
  blockedByFeature: jsonb("blocked_by_feature").default(sql`'{}'::jsonb`), // { 'advanced_scheduling': 3, ... }
  blockedByRateLimit: integer("blocked_by_rate_limit").default(0),
  
  // Feature usage breakdown
  featureUsage: jsonb("feature_usage").default(sql`'{}'::jsonb`), // { 'scheduling': 150, 'time_clock': 89, ... }
  topFeatures: text("top_features").array().default(sql`'{}'`), // ['scheduling', 'time_clock', ...]
  unusedFeatures: text("unused_features").array().default(sql`'{}'`), // Features available but not used
  
  // Pain points detected
  painPointsDetected: jsonb("pain_points_detected").default(sql`'{}'::jsonb`), // { 'overtime_tracking': 8, ... }
  frictionPoints: jsonb("friction_points").default(sql`'{}'::jsonb`), // { 'slow_page_load': 3, 'api_error': 2, ... }
  
  // Engagement metrics
  avgSessionDuration: integer("avg_session_duration_seconds"),
  avgRequestsPerSession: decimal("avg_requests_per_session", { precision: 8, scale: 2 }),
  peakUsageHour: integer("peak_usage_hour"), // 0-23
  
  // Upsell signals
  upsellScore: decimal("upsell_score", { precision: 5, scale: 4 }).default("0"), // 0-1 score
  recommendedUpgrade: varchar("recommended_upgrade", { length: 50 }), // 'professional', 'enterprise', null
  recommendedAddons: text("recommended_addons").array().default(sql`'{}'`),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("trinity_usage_workspace_idx").on(table.workspaceId),
  index("trinity_usage_period_idx").on(table.periodStart, table.periodEnd),
  index("trinity_usage_type_idx").on(table.periodType),
  index("trinity_usage_upsell_idx").on(table.upsellScore),
  uniqueIndex("trinity_usage_unique_idx").on(table.workspaceId, table.periodStart, table.periodType),
]);

export const trinityRecommendations = pgTable("trinity_recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id"), // null = org-wide recommendation
  
  // Recommendation details
  recommendationType: varchar("recommendation_type", { length: 50 }).notNull(), // 'tier_upgrade', 'addon', 'feature', 'optimization'
  targetTier: varchar("target_tier", { length: 50 }), // For tier upgrades
  targetAddon: varchar("target_addon", { length: 100 }), // For addon recommendations
  targetFeature: varchar("target_feature", { length: 100 }), // For feature recommendations
  
  // Pain point connection
  painPointId: varchar("pain_point_id", { length: 100 }), // Links to security pain point audit
  painPointCategory: varchar("pain_point_category", { length: 100 }), // 'time_attendance', 'compliance', 'billing', etc.
  painPointSeverity: varchar("pain_point_severity", { length: 20 }), // 'critical', 'high', 'medium', 'low'
  
  // Messaging
  headline: varchar("headline", { length: 200 }).notNull(), // "You're hitting your employee limit"
  description: text("description"), // Full explanation of value
  valueProposition: text("value_proposition"), // What they'll gain
  estimatedSavings: varchar("estimated_savings", { length: 100 }), // "$15,000/year"
  
  // Evidence
  triggerEvent: varchar("trigger_event", { length: 100 }), // What triggered this recommendation
  triggerCount: integer("trigger_count").default(1), // How many times trigger occurred
  evidenceData: jsonb("evidence_data").default(sql`'{}'::jsonb`), // Supporting data
  
  // Scoring
  relevanceScore: decimal("relevance_score", { precision: 5, scale: 4 }).default("0.5"), // 0-1
  urgencyScore: decimal("urgency_score", { precision: 5, scale: 4 }).default("0.5"), // 0-1
  potentialValue: decimal("potential_value", { precision: 12, scale: 2 }), // Estimated $ value
  
  // State
  status: varchar("status", { length: 30 }).default("pending"), // 'pending', 'shown', 'clicked', 'dismissed', 'converted', 'expired'
  shownAt: timestamp("shown_at"),
  clickedAt: timestamp("clicked_at"),
  dismissedAt: timestamp("dismissed_at"),
  convertedAt: timestamp("converted_at"),
  dismissReason: varchar("dismiss_reason", { length: 200 }),
  
  // Display control
  displayLocation: varchar("display_location", { length: 50 }), // 'dashboard_banner', 'modal', 'trinity_chat', 'email'
  displayPriority: integer("display_priority").default(50), // 1-100, higher = more important
  expiresAt: timestamp("expires_at"),
  maxImpressions: integer("max_impressions").default(5),
  impressionCount: integer("impression_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("trinity_rec_workspace_idx").on(table.workspaceId),
  index("trinity_rec_user_idx").on(table.userId),
  index("trinity_rec_type_idx").on(table.recommendationType),
  index("trinity_rec_status_idx").on(table.status),
  index("trinity_rec_pain_idx").on(table.painPointId),
  index("trinity_rec_relevance_idx").on(table.relevanceScore),
  index("trinity_rec_urgency_idx").on(table.urgencyScore),
  index("trinity_rec_expires_idx").on(table.expiresAt),
]);

export const aiModels = pgTable("ai_models", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  modelName: varchar("model_name", { length: 100 }).notNull().unique(),
  provider: aiProviderEnum("provider").notNull(),
  tier: aiModelTierEnum("tier").notNull(),
  
  // Cost tracking (per 1K tokens)
  costPer1kInputTokens: decimal("cost_per_1k_input_tokens", { precision: 10, scale: 6 }).notNull(),
  costPer1kOutputTokens: decimal("cost_per_1k_output_tokens", { precision: 10, scale: 6 }).notNull(),
  
  // Model limits
  maxTokens: integer("max_tokens").default(4096),
  rateLimitRpm: integer("rate_limit_rpm").default(60),
  
  // Capabilities (JSON array: ['text', 'code', 'analysis', 'creative', 'sales', 'rfp', 'compliance'])
  capabilities: jsonb("capabilities").$type<string[]>().default([]),
  
  // Status
  isActive: boolean("is_active").default(true),
  
  // Fallback configuration
  fallbackModelId: varchar("fallback_model_id").references((): any => aiModels.id),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  entityKind: varchar("entity_kind"),
  definitionData: jsonb("definition_data").default('{}'),
});

export const aiTaskTypes = pgTable("ai_task_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskType: varchar("task_type", { length: 100 }).notNull().unique(),
  description: text("description"),
  
  // Routing configuration
  primaryModelId: varchar("primary_model_id"),
  tier: aiModelTierEnum("tier").notNull(),
  requiredCapabilities: text("required_capabilities").array().default(sql`ARRAY[]::text[]`),
  
  // Token estimates
  avgInputTokens: integer("avg_input_tokens").default(500),
  avgOutputTokens: integer("avg_output_tokens").default(1000),
  
  // Execution settings
  timeoutSeconds: integer("timeout_seconds").default(30),
  maxRetries: integer("max_retries").default(3),
  
  // Feature flags
  requiresHumanReview: boolean("requires_human_review").default(false),
  isPremiumFeature: boolean("is_premium_feature").default(false),
  
  // Credit cost per execution (0 = included in subscription)
  creditCost: integer("credit_cost").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const aiTaskQueue = pgTable("ai_task_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  taskTypeId: varchar("task_type_id").notNull(),
  
  // Task details
  inputPayload: jsonb("input_payload").notNull().$type<Record<string, any>>(),
  context: jsonb("context").$type<Record<string, any>>(),
  priority: integer("priority").default(5), // 1=highest, 10=lowest
  
  // Routing
  assignedModelId: varchar("assigned_model_id"),
  currentAttempt: integer("current_attempt").default(0),
  maxAttempts: integer("max_attempts").default(3),
  
  // Status tracking
  status: aiTaskStatusEnum("status").default('pending'),
  
  // Results
  outputPayload: jsonb("output_payload").$type<Record<string, any>>(),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 4 }), // 0.0000 to 1.0000
  
  // Cost tracking
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalCost: decimal("total_cost", { precision: 10, scale: 6 }),
  
  // Timestamps
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  
  // Error handling
  errorMessage: text("error_message"),
  errorCode: varchar("error_code", { length: 50 }),
  
  // Fallback chain tracking
  parentTaskId: varchar("parent_task_id").references((): any => aiTaskQueue.id),
  fallbackReason: text("fallback_reason"),
  
  // User context
  userId: varchar("user_id"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("ai_task_queue_workspace_status_idx").on(table.workspaceId, table.status),
  index("ai_task_queue_status_priority_idx").on(table.status, table.priority),
  index("ai_task_queue_created_idx").on(table.createdAt),
]);

export const aiModelHealth = pgTable("ai_model_health", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  modelId: varchar("model_id").notNull().unique(),
  
  // Health metrics
  isHealthy: boolean("is_healthy").default(true),
  currentLatencyMs: integer("current_latency_ms"),
  avgLatency24hMs: integer("avg_latency_24h_ms"),
  successRate24h: decimal("success_rate_24h", { precision: 5, scale: 4 }),
  errorCount1h: integer("error_count_1h").default(0),
  
  // Rate limiting
  currentRpm: integer("current_rpm").default(0),
  rateLimitHits1h: integer("rate_limit_hits_1h").default(0),
  
  // Status ('healthy', 'degraded', 'down', 'rate_limited')
  status: varchar("status", { length: 50 }).default('healthy'),
  lastErrorMessage: text("last_error_message"),
  lastErrorAt: timestamp("last_error_at"),
  
  // Timestamps
  lastSuccessAt: timestamp("last_success_at"),
  lastCheckAt: timestamp("last_check_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at").default(sql`now()`),
}, (table) => [
  index("ai_model_health_model_idx").on(table.modelId),
  index("ai_model_health_status_idx").on(table.status),
]);

export const pendingConfigurations = pgTable("pending_configurations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Configuration data
  tierId: varchar("tier_id"),
  selectedAddons: jsonb("selected_addons").$type<string[]>().default(sql`'[]'::jsonb`),
  
  // Calculated pricing
  totalMonthlyBase: decimal("total_monthly_base", { precision: 10, scale: 2 }).default('0'),
  estimatedMonthlyCredits: integer("estimated_monthly_credits").default(0),
  recommendedCreditPackage: integer("recommended_credit_package").default(0),
  
  // Cart details
  pricingBreakdown: jsonb("pricing_breakdown").$type<Record<string, any>>().default(sql`'{}'::jsonb`),
  
  // Status: 'draft', 'ready_for_payment', 'abandoned', 'completed'
  status: varchar("status", { length: 30 }).notNull().default('draft'),
  
  // Promo
  promoCode: varchar("promo_code", { length: 50 }),
  
  // Timestamps for abandonment tracking
  lastActivityAt: timestamp("last_activity_at").defaultNow(),
  abandonmentEmailSent: boolean("abandonment_email_sent").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("pending_config_workspace_idx").on(table.workspaceId),
  index("pending_config_status_idx").on(table.status),
]);

export const executionPipelineLogs = pgTable("execution_pipeline_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  executionId: varchar("execution_id", { length: 100 }).notNull().unique(),
  workspaceId: varchar("workspace_id"),
  
  // Operation details
  operationType: varchar("operation_type", { length: 50 }).notNull(),
  operationName: varchar("operation_name", { length: 150 }).notNull(),
  initiator: varchar("initiator", { length: 100 }).notNull(),
  initiatorType: varchar("initiator_type", { length: 20 }).default('user'),
  
  // 7-step statuses
  step1TriggerStatus: varchar("step1_trigger_status", { length: 20 }).default('pending'),
  step2FetchStatus: varchar("step2_fetch_status", { length: 20 }).default('pending'),
  step3ValidateStatus: varchar("step3_validate_status", { length: 20 }).default('pending'),
  step4ProcessStatus: varchar("step4_process_status", { length: 20 }).default('pending'),
  step5MutateStatus: varchar("step5_mutate_status", { length: 20 }).default('pending'),
  step6ConfirmStatus: varchar("step6_confirm_status", { length: 20 }).default('pending'),
  step7NotifyStatus: varchar("step7_notify_status", { length: 20 }).default('pending'),
  
  // Step details
  validationResults: jsonb("validation_results").$type<Record<string, any>>(),
  processingTimeMs: integer("processing_time_ms"),
  tablesAffected: jsonb("tables_affected").$type<string[]>(),
  recordsChanged: integer("records_changed"),
  notificationsSent: jsonb("notifications_sent").$type<string[]>(),
  
  // AI-specific
  modelUsed: varchar("model_used", { length: 50 }),
  tokensConsumed: integer("tokens_consumed"),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 4 }),
  creditsDeducted: integer("credits_deducted"),
  
  // Final status
  finalStatus: varchar("final_status", { length: 30 }).default('initiated'),
  failedAtStep: integer("failed_at_step"),
  errorMessage: text("error_message"),
  errorStack: text("error_stack"),
  
  // Payload
  initialPayload: jsonb("initial_payload").$type<Record<string, any>>(),
  finalResult: jsonb("final_result").$type<Record<string, any>>(),
  
  // Timing
  totalExecutionTimeMs: integer("total_execution_time_ms"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),

  createdAt: timestamp("created_at").defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("exec_pipeline_workspace_idx").on(table.workspaceId),
  index("exec_pipeline_type_idx").on(table.operationType),
  index("exec_pipeline_status_idx").on(table.finalStatus),
  index("exec_pipeline_execution_idx").on(table.executionId),
]);

export const trinityAnomalyLog = pgTable("trinity_anomaly_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  anomalyType: varchar("anomaly_type").notNull(),
  severity: varchar("severity").notNull().default("warning"),
  title: varchar("title").notNull(),
  description: text("description"),
  dataSnapshot: jsonb("data_snapshot"),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  reasoningChain: jsonb("reasoning_chain"),
  recommendedActions: jsonb("recommended_actions"),
  acknowledged: boolean("acknowledged").default(false),
  acknowledgedBy: varchar("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),
  dismissed: boolean("dismissed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_trinity_anomaly_workspace").on(table.workspaceId),
  index("idx_trinity_anomaly_type").on(table.anomalyType),
  index("idx_trinity_anomaly_severity").on(table.severity),
  index("idx_trinity_anomaly_acknowledged").on(table.acknowledged),
]);

export const metaCognitionLogs = pgTable("meta_cognition_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  agentId: varchar("agent_id"),
  sessionId: varchar("session_id"),
  logType: varchar("log_type").notNull(),
  content: text("content"),
  confidence: numeric("confidence", { precision: 5, scale: 4 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const durableJobQueue = pgTable("durable_job_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: varchar("type").notNull(),
  workspaceId: varchar("workspace_id"),
  payload: jsonb("payload").notNull().default({}),
  priority: varchar("priority").notNull().default("normal"),
  status: varchar("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  retryDelayMs: integer("retry_delay_ms").notNull().default(30000),
  idempotencyKey: varchar("idempotency_key"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  error: text("error"),
  result: jsonb("result"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),

}, (table) => [
  index("durable_job_queue_status_idx").on(table.status),
  index("durable_job_queue_type_idx").on(table.type),
]);

export const automationTriggersRaw = pgTable("automation_triggers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  triggerData: jsonb("trigger_data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("automation_triggers_workspace_idx").on(table.workspaceId),
]);

export const trinityKnowledgeBase = pgTable("trinity_knowledge_base", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  scope: varchar("scope", { length: 20 }).notNull().default("global"),
  workspaceId: varchar("workspace_id", { length: 255 }),
  stateCode: varchar("state_code", { length: 2 }),
  moduleKey: varchar("module_key", { length: 100 }).notNull().unique(),
  title: varchar("title", { length: 300 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  content: text("content").notNull(),
  version: integer("version").notNull().default(1),
  effectiveDate: date("effective_date"),
  expirationDate: date("expiration_date"),
  source: varchar("source", { length: 300 }),
  lastVerifiedAt: timestamp("last_verified_at"),
  isActive: boolean("is_active").default(true),
  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at").default(sql`now()`),
  entryType: varchar("entry_type"),
  recommendationData: jsonb("recommendation_data").default('{}'),
  reflectionData: jsonb("reflection_data").default('{}'),
}, (table) => [
  index("idx_kb_scope_state").on(table.scope, table.stateCode),
  index("idx_kb_category").on(table.category),
  index("idx_kb_active").on(table.isActive),
]);

export const trinityMeetingRecordings = pgTable("trinity_meeting_recordings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  chatroomId: varchar("chatroom_id").notNull(),
  
  // Recording info
  title: varchar("title", { length: 255 }).notNull(),
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at"),
  durationMinutes: integer("duration_minutes"),
  
  // Transcription
  transcription: text("transcription"),
  aiSummary: text("ai_summary"), // Trinity-generated meeting summary
  actionItems: jsonb("action_items").$type<string[]>(), // Extracted action items
  
  // Participants
  participantCount: integer("participant_count").default(0),
  participantIds: jsonb("participant_ids").$type<string[]>(),
  
  // Premium feature tracking
  isPremiumFeature: boolean("is_premium_feature").default(true),
  aiCreditsUsed: integer("ai_credits_used").default(0),
  
  // Audit integrity - meeting records cannot be deleted
  isAuditProtected: boolean("is_audit_protected").default(true),
  
  // Status
  status: varchar("status", { length: 50 }).default("recording").notNull(), // recording, processing, completed, failed
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("trinity_meeting_recordings_chatroom_idx").on(table.chatroomId),
  index("trinity_meeting_recordings_workspace_idx").on(table.workspaceId),
]);

// ── ai_brain_action_logs ───────────────────────────────────────────────────
// Append-only audit trail for Trinity field intelligence actions.
// Written by trinityFieldIntelligence.ts via raw SQL INSERT.
export const aiBrainActionLogs = pgTable("ai_brain_action_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  actionType: varchar("action_type", { length: 100 }).notNull(),
  actionData: jsonb("action_data"),
  result: varchar("result", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("ai_brain_logs_workspace_idx").on(table.workspaceId),
  index("ai_brain_logs_type_idx").on(table.actionType),
  index("ai_brain_logs_created_idx").on(table.createdAt),
]);

// ── ai_workboard_tasks ─────────────────────────────────────────────────────
// AI task queue for workboard items. Queried by trinityFastDiagnostic.ts.
export const aiWorkboardTasks = pgTable("ai_workboard_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  taskType: varchar("task_type", { length: 100 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default('pending'),
  payload: jsonb("payload"),
  result: jsonb("result"),
  assignedAgentId: varchar("assigned_agent_id"),
  priority: integer("priority").default(5),
  scheduledFor: timestamp("scheduled_for"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("ai_workboard_workspace_idx").on(table.workspaceId),
  index("ai_workboard_status_idx").on(table.status),
]);

// ── trinity_action_invocations ─────────────────────────────────────────────
// Audit log of every Trinity action invocation; used by authorization service
// and admin routes for audit/dedup. Written with raw SQL in production code.
export const trinityActionInvocations = pgTable("trinity_action_invocations", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id", { length: 255 }).notNull(),
  actionId: varchar("action_id", { length: 255 }),
  triggeredBy: varchar("triggered_by", { length: 255 }),
  triggerSource: varchar("trigger_source", { length: 100 }),
  payloadHash: varchar("payload_hash", { length: 255 }),
  durationMs: integer("duration_ms"),
  success: boolean("success"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("trinity_action_invocations_workspace_idx").on(table.workspaceId),
  index("trinity_action_invocations_action_idx").on(table.actionId),
  index("trinity_action_invocations_created_idx").on(table.createdAt),
]);

// ── trinity_workspace_pauses ───────────────────────────────────────────────
// Tracks manual Trinity pauses per workspace; used by platformActionHub.ts
// to gate autonomous operations when Trinity is suspended by an admin.
export const trinityWorkspacePauses = pgTable("trinity_workspace_pauses", {
  id: serial("id").primaryKey(),
  workspaceId: varchar("workspace_id", { length: 255 }).notNull(),
  pausedBy: varchar("paused_by", { length: 255 }),
  pausedAt: timestamp("paused_at", { withTimezone: true }).defaultNow(),
  reason: text("reason"),
  isActive: boolean("is_active").default(true),
}, (table) => [
  index("trinity_workspace_pauses_workspace_idx").on(table.workspaceId),
  index("trinity_workspace_pauses_active_idx").on(table.isActive),
]);

// ── thalamic_log ───────────────────────────────────────────────────────────
// Trinity's complete sensory record. Every signal that enters the brain
// through the Thalamus is logged here — the audit trail of all perception.
export const thalamiclogs = pgTable("thalamic_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  signalId: varchar("signal_id", { length: 255 }).notNull(),
  arrivedAt: timestamp("arrived_at", { withTimezone: true }).defaultNow().notNull(),
  signalType: varchar("signal_type", { length: 50 }).notNull(),
  source: varchar("source", { length: 255 }),
  sourceTrustTier: varchar("source_trust_tier", { length: 50 }),
  workspaceId: varchar("workspace_id", { length: 255 }),
  userId: varchar("user_id", { length: 255 }),
  priorityScore: integer("priority_score").notNull(),
  routedTo: jsonb("routed_to"),
  routingReason: text("routing_reason"),
  processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
  processingCompletedAt: timestamp("processing_completed_at", { withTimezone: true }),
  highPriorityCopySent: boolean("high_priority_copy_sent").default(false),
  rawSignalHash: varchar("raw_signal_hash", { length: 64 }),
  isDuplicate: boolean("is_duplicate").default(false),
  wasMerged: boolean("was_merged").default(false),
  wasDropped: boolean("was_dropped").default(false),
  dropReason: varchar("drop_reason", { length: 255 }),
  signalPayload: jsonb("signal_payload"),
}, (table) => [
  index("thalamic_log_workspace_idx").on(table.workspaceId),
  index("thalamic_log_arrived_idx").on(table.arrivedAt),
  index("thalamic_log_type_idx").on(table.signalType),
  index("thalamic_log_priority_idx").on(table.priorityScore),
  index("thalamic_log_hash_idx").on(table.rawSignalHash),
]);

// ── trinity_acc_log ────────────────────────────────────────────────────────
// Trinity's conscience record — every conflict detected, every resolution,
// every time Trinity stopped herself from doing something wrong.
export const trinityAccLogs = pgTable("trinity_acc_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conflictId: varchar("conflict_id", { length: 255 }).notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  conflictCategory: integer("conflict_category").notNull(),
  conflictSeverity: varchar("conflict_severity", { length: 20 }).notNull(),
  executionId: varchar("execution_id", { length: 255 }),
  workspaceId: varchar("workspace_id", { length: 255 }),
  entitiesInvolved: jsonb("entities_involved"),
  expectedState: jsonb("expected_state"),
  actualState: jsonb("actual_state"),
  contradictionDescription: text("contradiction_description"),
  recommendedResolution: text("recommended_resolution"),
  autoBlocked: boolean("auto_blocked").default(false),
  autoResolved: boolean("auto_resolved").default(false),
  resolutionMethod: varchar("resolution_method", { length: 100 }),
  requiresHumanReview: boolean("requires_human_review").default(false),
  humanResolverId: varchar("human_resolver_id", { length: 255 }),
  humanResolutionNotes: text("human_resolution_notes"),
  outcome: text("outcome"),
  hebbianUpdateTriggered: boolean("hebbian_update_triggered").default(false),
  thalamicSignalId: varchar("thalamic_signal_id", { length: 255 }),
}, (table) => [
  index("trinity_acc_log_workspace_idx").on(table.workspaceId),
  index("trinity_acc_log_detected_idx").on(table.detectedAt),
  index("trinity_acc_log_severity_idx").on(table.conflictSeverity),
  index("trinity_acc_log_category_idx").on(table.conflictCategory),
  index("trinity_acc_log_review_idx").on(table.requiresHumanReview),
]);

export type ThalamicLog = typeof thalamiclogs.$inferSelect;
export type TrinityAccLog = typeof trinityAccLogs.$inferSelect;

// ── trinity_audit_logs ───────────────────────────────────────────────────────
// Append-only audit trail for all Trinity autonomous skill executions.
// Logs permission checks, execution decisions, results, and errors for
// regulatory compliance and workspace-scoped querying.
export const trinityAuditLogs = pgTable("trinity_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Core fields
  type: text("type").notNull(),              // 'skill_execution' | 'permission_check' | 'skill_result' | 'skill_error'
  workspaceId: varchar("workspace_id").notNull(),
  skillName: text("skill_name").notNull(),
  executionId: text("execution_id").notNull(),

  // For skill_execution
  status: text("status"),                    // 'approved' | 'denied'
  reason: text("reason"),

  // For permission_check
  permissionGranted: boolean("permission_granted"),
  riskLevel: text("risk_level"),             // 'low' | 'medium' | 'high' | 'critical'

  // For skill_result
  success: boolean("success"),
  resultData: jsonb("result_data"),
  durationMs: integer("duration_ms"),

  // For skill_error
  errorMessage: text("error_message"),
  errorCode: text("error_code"),
  stackTrace: text("stack_trace"),

  // Timestamps
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => [
  index("idx_trinity_audit_workspace").on(table.workspaceId),
  index("idx_trinity_audit_skill").on(table.skillName),
  index("idx_trinity_audit_created").on(table.createdAt),
  index("idx_trinity_audit_type").on(table.type),
  index("idx_trinity_audit_execution").on(table.executionId),
]);

export type TrinityAuditLog = typeof trinityAuditLogs.$inferSelect;
export type InsertTrinityAuditLog = typeof trinityAuditLogs.$inferInsert;

export * from './extended';
