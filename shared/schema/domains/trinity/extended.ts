import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, date, time } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const agentRegistry = pgTable("agent_registry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  agentKey: text("agent_key").notNull(),
  agentName: text("agent_name").notNull(),
  domain: text("domain").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  inputSchema: jsonb("input_schema").notNull().default('{}'),
  outputSchema: jsonb("output_schema").notNull().default('{}'),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),

  completionCriteria: jsonb("completion_criteria"),
});

export const insertAgentRegistrySchema = createInsertSchema(agentRegistry).omit({ id: true });
export type InsertAgentRegistry = z.infer<typeof insertAgentRegistrySchema>;
export type AgentRegistry = typeof agentRegistry.$inferSelect;

export const agentTaskLogs = pgTable("agent_task_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentTaskId: varchar("agent_task_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  logType: text("log_type").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata"),
  loggedAt: timestamp("logged_at").notNull().default(sql`now()`),
});

export const insertAgentTaskLogsSchema = createInsertSchema(agentTaskLogs).omit({ id: true });
export type InsertAgentTaskLogs = z.infer<typeof insertAgentTaskLogsSchema>;
export type AgentTaskLogs = typeof agentTaskLogs.$inferSelect;

export const agentTasks = pgTable("agent_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  agentKey: text("agent_key").notNull(),
  spawnedBy: text("spawned_by").notNull().default('trinity'),
  taskType: text("task_type").notNull(),
  status: text("status").notNull().default('pending'),
  inputPayload: jsonb("input_payload").notNull().default('{}'),
  outputPayload: jsonb("output_payload"),
  completionScore: integer("completion_score"),
  confidenceLevel: integer("confidence_level"),
  flags: jsonb("flags"),
  trinityEvaluation: text("trinity_evaluation"),
  evaluationResult: text("evaluation_result"),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(2),
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: varchar("related_entity_id"),
  spawnedAt: timestamp("spawned_at").notNull().default(sql`now()`),
  completedAt: timestamp("completed_at"),
  evaluatedAt: timestamp("evaluated_at"),
});

export const insertAgentTasksSchema = createInsertSchema(agentTasks).omit({ id: true });
export type InsertAgentTasks = z.infer<typeof insertAgentTasksSchema>;
export type AgentTasks = typeof agentTasks.$inferSelect;

export const aiCostConfig = pgTable("ai_cost_config", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  modelId: varchar("model_id").notNull(),
  provider: varchar("provider").notNull(),
  displayName: varchar("display_name"),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  inputCostPer_1kTokens: decimal("input_cost_per_1k_tokens").notNull().default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  outputCostPer_1kTokens: decimal("output_cost_per_1k_tokens").notNull().default(0),
  markupMultiplier: decimal("markup_multiplier").notNull().default('1.5'),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`),
});

// @ts-expect-error — TS migration: fix in refactoring sprint
export const insertAiCostConfigSchema = createInsertSchema(aiCostConfig).omit({ id: true });
export type InsertAiCostConfig = z.infer<typeof insertAiCostConfigSchema>;
export type AiCostConfig = typeof aiCostConfig.$inferSelect;

export const aiUsageLog = pgTable("ai_usage_log", {
  id: varchar("id").primaryKey(),
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id"),
  provider: text("provider"),
  featureKey: varchar("feature_key"),
  tokensUsed: integer("tokens_used"),
  costBasisUsd: decimal("cost_basis_usd"),
  createdAt: timestamp("created_at"),
});

export const insertAiUsageLogSchema = createInsertSchema(aiUsageLog).omit({ id: true });
export type InsertAiUsageLog = z.infer<typeof insertAiUsageLogSchema>;
export type AiUsageLog = typeof aiUsageLog.$inferSelect;

export const counterfactualSimulations = pgTable("counterfactual_simulations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  workspaceId: varchar("workspace_id").notNull(),
  triggerEvent: text("trigger_event").notNull(),
  actualDecisionMade: text("actual_decision_made"),
  actualOutcome: text("actual_outcome"),
  counterfactualDecision: text("counterfactual_decision"),
  simulatedOutcome: text("simulated_outcome"),
  simulationConfidence: integer("simulation_confidence"),
  keyDecisionMoment: text("key_decision_moment"),
  lessonExtracted: text("lesson_extracted"),
  policyChangeSuggested: boolean("policy_change_suggested").default(false),
  policyChangeDescription: text("policy_change_description"),
  appliedByTrinity: boolean("applied_by_trinity").default(false),
  createdAt: timestamp("created_at").default(sql`now()`),
});

// @ts-expect-error — TS migration: fix in refactoring sprint
export const insertCounterfactualSimulationsSchema = createInsertSchema(counterfactualSimulations).omit({ id: true });
export type InsertCounterfactualSimulations = z.infer<typeof insertCounterfactualSimulationsSchema>;
export type CounterfactualSimulations = typeof counterfactualSimulations.$inferSelect;

export const curiosityQueue = pgTable("curiosity_queue", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  workspaceId: varchar("workspace_id").notNull(),
  question: text("question").notNull(),
  triggeredBy: text("triggered_by").notNull(),
  priority: varchar("priority").default('low'),
  investigationPlan: jsonb("investigation_plan").default('[]'),
  status: varchar("status").default('queued'),
  finding: text("finding"),
  findingConfidence: integer("finding_confidence"),
  findingSignificance: varchar("finding_significance"),
  fedToConnectome: boolean("fed_to_connectome").default(false),
  triggeredAt: timestamp("triggered_at").default(sql`now()`),
  investigatedAt: timestamp("investigated_at"),
});

// @ts-expect-error — TS migration: fix in refactoring sprint
export const insertCuriosityQueueSchema = createInsertSchema(curiosityQueue).omit({ id: true });
export type InsertCuriosityQueue = z.infer<typeof insertCuriosityQueueSchema>;
export type CuriosityQueue = typeof curiosityQueue.$inferSelect;

export const incubationQueue = pgTable("incubation_queue", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  workspaceId: varchar("workspace_id").notNull(),
  problemStatement: text("problem_statement").notNull(),
  contextSnapshot: jsonb("context_snapshot").default('{}'),
  initialAttempts: text("initial_attempts"),
  blockingFactor: text("blocking_factor"),
  incubationApproachHistory: jsonb("incubation_approach_history").default('[]'),
  status: varchar("status").default('incubating'),
  solution: text("solution"),
  solutionConfidence: integer("solution_confidence"),
  incubationStartedAt: timestamp("incubation_started_at").default(sql`now()`),
  breakthroughAt: timestamp("breakthrough_at"),
  cyclesAttempted: integer("cycles_attempted").default(0),
});

// @ts-expect-error — TS migration: fix in refactoring sprint
export const insertIncubationQueueSchema = createInsertSchema(incubationQueue).omit({ id: true });
export type InsertIncubationQueue = z.infer<typeof insertIncubationQueueSchema>;
export type IncubationQueue = typeof incubationQueue.$inferSelect;

export const socialEntities = pgTable("social_entities", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  entityId: varchar("entity_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  influenceScore: integer("influence_score").default(50),
  connectorScore: integer("connector_score").default(50),
  isolationRiskScore: integer("isolation_risk_score").default(0),
  socialCapital: integer("social_capital").default(50),
  primaryPeerGroup: jsonb("primary_peer_group").default('[]'),
  sentimentInInteractions: varchar("sentiment_in_interactions").default('neutral'),
  informalRole: varchar("informal_role").default('follower'),
  lastAssessed: timestamp("last_assessed").default(sql`now()`),
});

// @ts-expect-error — TS migration: fix in refactoring sprint
export const insertSocialEntitiesSchema = createInsertSchema(socialEntities).omit({ id: true });
export type InsertSocialEntities = z.infer<typeof insertSocialEntitiesSchema>;
export type SocialEntities = typeof socialEntities.$inferSelect;

export const socialRelationships = pgTable("social_relationships", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  workspaceId: varchar("workspace_id").notNull(),
  fromEntity: varchar("from_entity").notNull(),
  toEntity: varchar("to_entity").notNull(),
  relationshipStrength: integer("relationship_strength").default(50),
  relationshipType: varchar("relationship_type").default('peer'),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  interactionFrequencyWeekly: decimal("interaction_frequency_weekly").default(0),
  sentimentScore: integer("sentiment_score").default(50),
  trustLevel: integer("trust_level").default(50),
  lastInteractionAt: timestamp("last_interaction_at"),
});

// @ts-expect-error — TS migration: fix in refactoring sprint
export const insertSocialRelationshipsSchema = createInsertSchema(socialRelationships).omit({ id: true });
export type InsertSocialRelationships = z.infer<typeof insertSocialRelationshipsSchema>;
export type SocialRelationships = typeof socialRelationships.$inferSelect;

export const somaticPatternLibrary = pgTable("somatic_pattern_library", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  workspaceId: varchar("workspace_id"),
  patternSignature: jsonb("pattern_signature").notNull(),
  historicalOutcome: varchar("historical_outcome").default('neutral'),
  outcomeSeverity: integer("outcome_severity").default(0),
  patternFrequency: integer("pattern_frequency").default(1),
  confidenceInPattern: integer("confidence_in_pattern").default(50),
  lastConfirmedAt: timestamp("last_confirmed_at").default(sql`now()`),
  createdAt: timestamp("created_at").default(sql`now()`),
});

// @ts-expect-error — TS migration: fix in refactoring sprint
export const insertSomaticPatternLibrarySchema = createInsertSchema(somaticPatternLibrary).omit({ id: true });
export type InsertSomaticPatternLibrary = z.infer<typeof insertSomaticPatternLibrarySchema>;
export type SomaticPatternLibrary = typeof somaticPatternLibrary.$inferSelect;

export const temporalEntityArcs = pgTable("temporal_entity_arcs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  entityId: varchar("entity_id").notNull(),
  entityType: varchar("entity_type").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  currentStateAssessment: text("current_state_assessment"),
  state_30DaysAgo: text("state_30_days_ago"),
  state_90DaysAgo: text("state_90_days_ago"),
  trajectory: varchar("trajectory").default('stable'),
  trajectoryConfidence: integer("trajectory_confidence").default(50),
  keyInflectionPoints: jsonb("key_inflection_points").default('[]'),
  trinityAttentionLevel: varchar("trinity_attention_level").default('background'),
  narrativeSummary: text("narrative_summary"),
  lastAssessedAt: timestamp("last_assessed_at").default(sql`now()`),
  createdAt: timestamp("created_at").default(sql`now()`),
});

// @ts-expect-error — TS migration: fix in refactoring sprint
export const insertTemporalEntityArcsSchema = createInsertSchema(temporalEntityArcs).omit({ id: true });
export type InsertTemporalEntityArcs = z.infer<typeof insertTemporalEntityArcsSchema>;
export type TemporalEntityArcs = typeof temporalEntityArcs.$inferSelect;

export const trinityAiUsageLog = pgTable("trinity_ai_usage_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id"),
  userRole: varchar("user_role"),
  sessionId: varchar("session_id"),
  conversationId: varchar("conversation_id"),
  modelUsed: varchar("model_used"),
  modelTier: varchar("model_tier"),
  callType: varchar("call_type").notNull(),
  inputTokens: integer("input_tokens").default(0),
  outputTokens: integer("output_tokens").default(0),
  totalTokens: integer("total_tokens").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  costBasisUsd: decimal("cost_basis_usd").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  markupRate: decimal("markup_rate").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  billedAmountUsd: decimal("billed_amount_usd").default(0),
  creditsDeducted: integer("credits_deducted").default(0),
  responseTimeMs: integer("response_time_ms").default(0),
  taskId: varchar("task_id"),
  wasBlocked: boolean("was_blocked").default(false),
  blockReason: text("block_reason"),
  calledAt: timestamp("called_at").default(sql`now()`),
});

export const insertTrinityAiUsageLogSchema = createInsertSchema(trinityAiUsageLog).omit({ id: true });
export type InsertTrinityAiUsageLog = z.infer<typeof insertTrinityAiUsageLogSchema>;
export type TrinityAiUsageLog = typeof trinityAiUsageLog.$inferSelect;

export const trinityAutonomousTasks = pgTable("trinity_autonomous_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  taskType: varchar("task_type").notNull(),
  description: text("description").notNull(),
  identifiedAt: timestamp("identified_at").notNull().default(sql`now()`),
  plannedAt: timestamp("planned_at"),
  executedAt: timestamp("executed_at"),
  verifiedAt: timestamp("verified_at"),
  completedAt: timestamp("completed_at"),
  status: varchar("status").notNull().default('identified'),
  requiresHumanApproval: boolean("requires_human_approval").default(false),
  approvalThresholdReason: text("approval_threshold_reason"),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  attempts: integer("attempts").default(0),
  attemptLog: jsonb("attempt_log").default('[]'),
  outcome: text("outcome"),
  success: boolean("success"),
  escalationReason: text("escalation_reason"),
  growthLogEntryId: varchar("growth_log_entry_id"),
});

export const insertTrinityAutonomousTasksSchema = createInsertSchema(trinityAutonomousTasks).omit({ id: true });
export type InsertTrinityAutonomousTasks = z.infer<typeof insertTrinityAutonomousTasksSchema>;
export type TrinityAutonomousTasks = typeof trinityAutonomousTasks.$inferSelect;

export const trinityCognitiveState = pgTable("trinity_cognitive_state", {
  workspaceId: varchar("workspace_id").notNull(),
  activeAutonomousTasks: integer("active_autonomous_tasks").default(0),
  pendingAutonomousTasks: integer("pending_autonomous_tasks").default(0),
  openInvestigations: integer("open_investigations").default(0),
  openCuriosityItems: integer("open_curiosity_items").default(0),
  incubationQueueSize: integer("incubation_queue_size").default(0),
  activeCriticalEscalations: integer("active_critical_escalations").default(0),
  currentLoadScore: integer("current_load_score").default(0),
  loadStatus: varchar("load_status").default('light'),
  autonomousTaskThrottled: boolean("autonomous_task_throttled").default(false),
  lastAssessedAt: timestamp("last_assessed_at").default(sql`now()`),
});

// @ts-expect-error — TS migration: fix in refactoring sprint
export const insertTrinityCognitiveStateSchema = createInsertSchema(trinityCognitiveState).omit({ id: true });
export type InsertTrinityCognitiveState = z.infer<typeof insertTrinityCognitiveStateSchema>;
export type TrinityCognitiveState = typeof trinityCognitiveState.$inferSelect;

export const trinityHypothesisSessions = pgTable("trinity_hypothesis_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  sessionId: varchar("session_id"),
  question: text("question").notNull(),
  triggerType: varchar("trigger_type").default('diagnostic'),
  hypotheses: jsonb("hypotheses").notNull().default('[]'),
  evidenceQueries: jsonb("evidence_queries").default('[]'),
  conclusion: text("conclusion"),
  conclusionConfidence: integer("conclusion_confidence").default(0),
  finalHypothesisId: varchar("final_hypothesis_id"),
  status: varchar("status").default('open'),
  thinkingTokensUsed: integer("thinking_tokens_used").default(0),
  thinkingTimeMs: integer("thinking_time_ms").default(0),
  createdAt: timestamp("created_at").default(sql`now()`),
  resolvedAt: timestamp("resolved_at"),
});

export const insertTrinityHypothesisSessionsSchema = createInsertSchema(trinityHypothesisSessions).omit({ id: true });
export type InsertTrinityHypothesisSessions = z.infer<typeof insertTrinityHypothesisSessionsSchema>;
export type TrinityHypothesisSessions = typeof trinityHypothesisSessions.$inferSelect;

export const trinityMemoryService = pgTable("trinity_memory_service", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  workspaceId: varchar("workspace_id").notNull(),
  entityId: varchar("entity_id").notNull(),
  memoryKey: varchar("memory_key").notNull(),
  memoryValue: text("memory_value").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// @ts-expect-error — TS migration: fix in refactoring sprint
export const insertTrinityMemoryServiceSchema = createInsertSchema(trinityMemoryService).omit({ id: true });
export type InsertTrinityMemoryService = z.infer<typeof insertTrinityMemoryServiceSchema>;
export type TrinityMemoryService = typeof trinityMemoryService.$inferSelect;

export const trinityNarrative = pgTable("trinity_narrative", {
  workspaceId: varchar("workspace_id").notNull(),
  initializedAt: timestamp("initialized_at").default(sql`now()`),
  currentChapterStart: timestamp("current_chapter_start").default(sql`now()`),
  chapterSummaries: jsonb("chapter_summaries").default('[]'),
  keyLearnings: jsonb("key_learnings").default('[]'),
  definingMoments: jsonb("defining_moments").default('[]'),
  relationshipWithOwner: text("relationship_with_owner").default(''),
  selfAssessment: text("self_assessment").default(''),
  growthAreas: jsonb("growth_areas").default('[]'),
  lastUpdated: timestamp("last_updated").default(sql`now()`),
});

// @ts-expect-error — TS migration: fix in refactoring sprint
export const insertTrinityNarrativeSchema = createInsertSchema(trinityNarrative).omit({ id: true });
export type InsertTrinityNarrative = z.infer<typeof insertTrinityNarrativeSchema>;
export type TrinityNarrative = typeof trinityNarrative.$inferSelect;

export const trinityPeripheralSurfaced = pgTable("trinity_peripheral_surfaced", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  itemKey: varchar("item_key").notNull(),
  itemCategory: varchar("item_category").notNull(),
  surfacedAt: timestamp("surfaced_at").default(sql`now()`),
});

export const insertTrinityPeripheralSurfacedSchema = createInsertSchema(trinityPeripheralSurfaced).omit({ id: true });
export type InsertTrinityPeripheralSurfaced = z.infer<typeof insertTrinityPeripheralSurfacedSchema>;
export type TrinityPeripheralSurfaced = typeof trinityPeripheralSurfaced.$inferSelect;

export const trinityThinkingSessions = pgTable("trinity_thinking_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  sessionId: varchar("session_id"),
  triggerType: varchar("trigger_type").default('complex_request'),
  problemStatement: text("problem_statement").notNull(),
  approachCandidates: jsonb("approach_candidates").default('[]'),
  selectedApproach: text("selected_approach"),
  approachScore: integer("approach_score").default(0),
  executionPlan: jsonb("execution_plan").default('[]'),
  failureModes: jsonb("failure_modes").default('[]'),
  thinkingTokensUsed: integer("thinking_tokens_used").default(0),
  thinkingTimeMs: integer("thinking_time_ms").default(0),
  phasesCompleted: jsonb("phases_completed").default('[]'),
  outcome: varchar("outcome").default('pending'),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertTrinityThinkingSessionsSchema = createInsertSchema(trinityThinkingSessions).omit({ id: true });
export type InsertTrinityThinkingSessions = z.infer<typeof insertTrinityThinkingSessionsSchema>;
export type TrinityThinkingSessions = typeof trinityThinkingSessions.$inferSelect;

// ── Phase 10-4: Trinity API Execution Cost Tracking ─────────────────────────
export const trinityExecutionCosts = pgTable("trinity_execution_costs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Execution context
  skillKey: varchar("skill_key").notNull(),
  taskId: varchar("task_id"),
  sessionId: varchar("session_id"),

  // Model / provider
  provider: varchar("provider").notNull(),
  modelId: varchar("model_id").notNull(),

  // Token usage
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),

  // Cost (USD)
  inputCostUsd: decimal("input_cost_usd", { precision: 12, scale: 8 }).notNull().default('0'),
  outputCostUsd: decimal("output_cost_usd", { precision: 12, scale: 8 }).notNull().default('0'),
  apiCallCostUsd: decimal("api_call_cost_usd", { precision: 12, scale: 8 }).notNull().default('0.01'),
  totalCostUsd: decimal("total_cost_usd", { precision: 12, scale: 8 }).notNull().default('0'),

  // Response metrics
  responseTimeMs: integer("response_time_ms").default(0),
  success: boolean("success").default(true),
  errorMessage: text("error_message"),

  executedAt: timestamp("executed_at").notNull().default(sql`now()`),
});

export const insertTrinityExecutionCostsSchema = createInsertSchema(trinityExecutionCosts).omit({ id: true });
export type InsertTrinityExecutionCosts = z.infer<typeof insertTrinityExecutionCostsSchema>;
export type TrinityExecutionCosts = typeof trinityExecutionCosts.$inferSelect;

