// ═══════════════════════════════════════════════════════════════
// Domain 1 of 15: Auth & Identity
// ═══════════════════════════════════════════════════════════════
// THE LAW: No new tables without Bryan's explicit approval. Zero DROP TABLE ever.
// Tables: 23

import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, time, doublePrecision, index, uniqueIndex, primaryKey, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  actorTypeEnum,
  checkpointSyncStateEnum,
  entityTypeEnum,
  externalIdEntityTypeEnum,
  idSequenceKindEnum,
  idempotencyStatusEnum,
  operationTypeEnum,
  partnerTypeEnum,
  platformRoleEnum,
  policyEffectEnum,
  tokenTypeEnum,
} from '../../enums';

export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  name: varchar("name").notNull(),
  keyHash: varchar("key_hash").notNull().unique(), // Hashed API key
  keyPrefix: varchar("key_prefix").notNull(), // First 8 chars for display

  scopes: text("scopes").array(), // ['read:employees', 'write:shifts', etc.]
  isActive: boolean("is_active").default(true),

  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),

  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  revokedAt: timestamp("revoked_at"),

  keyType: varchar("key_type"),
  usageData: jsonb("usage_data").default('{}'),
});

export const platformRoles = pgTable("platform_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  role: platformRoleEnum("role").notNull(),

  // Assignment tracking
  grantedBy: varchar("granted_by"),
  grantedReason: text("granted_reason"),
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
}, (table) => ({
  uniqueUserRole: uniqueIndex("unique_user_platform_role").on(table.userId, table.role),
}));

export const roleTemplates = pgTable("role_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

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
  requiredTrainingCourses: jsonb("required_training_courses").$type<string[]>().default(sql`'[]'`), // Links to Training Management

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
  createdBy: varchar("created_by").notNull(),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceRoleIndex: index("role_templates_workspace_role_idx").on(table.workspaceId, table.roleName),
  levelIndex: index("role_templates_level_idx").on(table.roleLevel),
}));

export const integrationApiKeys = pgTable("integration_api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  // Key identity
  name: varchar("name").notNull(), // "Production API Key", "Mobile App Key"
  description: text("description"),
  keyPrefix: varchar("key_prefix").notNull(), // "wfos_prod_" for display
  keyHash: text("key_hash").notNull(), // Hashed full key for verification

  // Permissions
  scopes: jsonb("scopes").$type<string[]>().default(sql`'[]'`), // ['read:employees', 'write:shifts', 'webhooks:manage']
  ipWhitelist: jsonb("ip_whitelist").$type<string[]>().default(sql`'[]'`),

  // Rate limiting
  rateLimit: integer("rate_limit").default(1000), // Requests per hour
  rateLimitWindow: varchar("rate_limit_window").default('hour'), // 'minute', 'hour', 'day'

  // Usage tracking
  lastUsedAt: timestamp("last_used_at"),
  totalRequests: integer("total_requests").default(0),
  totalErrors: integer("total_errors").default(0),

  // Status
  isActive: boolean("is_active").default(true),
  expiresAt: timestamp("expires_at"),

  // Audit
  createdByUserId: varchar("created_by_user_id"),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceActiveIndex: index("integration_api_keys_workspace_active_idx").on(table.workspaceId, table.isActive),
  keyHashIndex: uniqueIndex("integration_api_keys_key_hash_idx").on(table.keyHash),
}));

export const idempotencyKeys = pgTable("idempotency_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Operation identification
  operationType: operationTypeEnum("operation_type").notNull(),
  requestFingerprint: text("request_fingerprint").notNull(), // Hash of request params
  
  // Result tracking
  status: idempotencyStatusEnum("status").default('processing').notNull(),
  resultId: varchar("result_id"), // ID of created invoice/payroll/timesheet
  resultMetadata: jsonb("result_metadata"), // Additional result data
  
  // Error tracking
  errorMessage: text("error_message"),
  errorStack: text("error_stack"),
  
  // Lifecycle
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at").notNull(), // TTL for cleanup (7-30 days)

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
  statusVersion: integer("status_version").default(0),
  inflightToken: varchar("inflight_token"),
}, (table) => ({
  workspaceIdx: index("idempotency_keys_workspace_idx").on(table.workspaceId),
  operationIdx: index("idempotency_keys_operation_idx").on(table.operationType),
  fingerprintIdx: uniqueIndex("idempotency_keys_fingerprint_idx").on(table.workspaceId, table.operationType, table.requestFingerprint),
  expiresIdx: index("idempotency_keys_expires_idx").on(table.expiresAt),
}));

export const oauthStates = pgTable("oauth_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  
  // Partner identification
  partnerType: partnerTypeEnum("partner_type").notNull(),
  
  // OAuth flow state
  state: varchar("state").notNull().unique(), // CSRF protection token
  codeVerifier: text("code_verifier"), // PKCE code verifier (for QuickBooks)
  codeChallenge: varchar("code_challenge"), // PKCE code challenge
  codeChallengeMethod: varchar("code_challenge_method").default('S256'), // 'S256' or 'plain'
  
  // Expiry tracking
  expiresAt: timestamp("expires_at").notNull(), // State expires after 10 minutes
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("oauth_states_workspace_idx").on(table.workspaceId),
  partnerIdx: index("oauth_states_partner_idx").on(table.partnerType),
  stateIdx: index("oauth_states_state_idx").on(table.state),
  expiryIdx: index("oauth_states_expiry_idx").on(table.expiresAt),
}));

export const externalIdentifiers = pgTable("external_identifiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Entity reference
  entityType: externalIdEntityTypeEnum("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(), // UUID of the actual entity
  
  // Human-readable external ID
  externalId: varchar("external_id").notNull().unique(), // Format: ORG-ABCD, EMP-ABCD-00001, SUP-AB12
  
  // Organization association (null for org entities themselves)
  orgId: varchar("org_id"),
  
  // Primary flag (in case entity has multiple external IDs)
  isPrimary: boolean("is_primary").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  workspaceId: varchar("workspace_id"),
}, (table) => ({
  entityIdx: index("external_identifiers_entity_idx").on(table.entityType, table.entityId),
  externalIdIdx: index("external_identifiers_external_id_idx").on(table.externalId),
  orgIdx: index("external_identifiers_org_idx").on(table.orgId),
  uniqueEntityPrimary: uniqueIndex("external_identifiers_entity_primary_idx").on(table.entityType, table.entityId, table.isPrimary),
}));

export const idSequences = pgTable("id_sequences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  orgId: varchar("org_id").notNull(),
  kind: idSequenceKindEnum("kind").notNull(),
  nextVal: integer("next_val").notNull().default(1),
  
  updatedAt: timestamp("updated_at").defaultNow(),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueOrgKind: uniqueIndex("id_sequences_org_kind_idx").on(table.orgId, table.kind),
}));

export const idRegistry = pgTable("id_registry", {
  id: varchar("id").primaryKey(), // The ID that was issued (NOT auto-generated)
  entityType: varchar("entity_type").notNull(), // USER, ORG, EMPLOYEE, CLIENT, etc.
  workspaceId: varchar("workspace_id"),
  
  // Issuing context
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
  issuedBy: varchar("issued_by"), // Actor who caused this ID to be created
  issuedByType: actorTypeEnum("issued_by_type"),
  
  // Immutability flag
  neverReuse: boolean("never_reuse").notNull().default(true),
  
  // Soft delete tracking (entity may be deleted but ID is NEVER reused)
  entityDeletedAt: timestamp("entity_deleted_at"),
  
  // Metadata
  metadata: jsonb("metadata").default("{}"),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("idx_id_registry_unique").on(table.id),
  index("idx_id_registry_entity_type").on(table.entityType, table.issuedAt),
  index("idx_id_registry_workspace").on(table.workspaceId, table.issuedAt),
]);

export const userDeviceProfiles = pgTable("user_device_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  
  // Device identification
  deviceFingerprint: varchar("device_fingerprint", { length: 255 }),
  deviceType: varchar("device_type", { length: 30 }).notNull(), // 'desktop', 'tablet', 'mobile'
  platform: varchar("platform", { length: 50 }), // 'windows', 'macos', 'ios', 'android', 'linux'
  browser: varchar("browser", { length: 50 }),
  browserVersion: varchar("browser_version", { length: 30 }),
  
  // Capabilities
  screenWidth: integer("screen_width"),
  screenHeight: integer("screen_height"),
  devicePixelRatio: doublePrecision("device_pixel_ratio"),
  touchSupport: boolean("touch_support").default(false),
  
  // Performance metrics
  cpuCores: integer("cpu_cores"),
  memoryGb: doublePrecision("memory_gb"),
  connectionType: varchar("connection_type", { length: 30 }), // '4g', 'wifi', 'ethernet'
  
  // Optimized settings (cached)
  optimizedSettings: jsonb("optimized_settings"), // Animation density, resource bundles, etc.
  settingsVersion: integer("settings_version").default(1),
  
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("device_profiles_user_idx").on(table.userId),
  index("device_profiles_type_idx").on(table.deviceType),
  index("device_profiles_fingerprint_idx").on(table.deviceFingerprint),
]);

export const sessionCheckpoints = pgTable("session_checkpoints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id"),
  sessionId: varchar("session_id").notNull(), // Browser session fingerprint
  
  // Phase tracking
  phaseKey: varchar("phase_key", { length: 100 }).notNull(), // e.g., 'form_editing', 'report_building', 'data_entry'
  phaseNumber: integer("phase_number").default(1),
  
  // State payload (encrypted for sensitive data)
  payload: jsonb("payload").notNull(), // Current user state/form data
  payloadChecksum: varchar("payload_checksum", { length: 64 }), // SHA-256 for integrity verification
  payloadVersion: integer("payload_version").default(1),
  
  // Context for Trinity AI Brain
  contextSummary: text("context_summary"), // AI-readable summary of what user was doing
  pageRoute: varchar("page_route", { length: 255 }), // Current page/route
  actionHistory: jsonb("action_history"), // Recent user actions for context
  
  // AI Sync State
  aiSyncState: checkpointSyncStateEnum("ai_sync_state").default("pending"),
  aiSyncedAt: timestamp("ai_synced_at"),
  trinityContextId: varchar("trinity_context_id", { length: 100 }), // Reference ID in Trinity's context
  
  // Lifecycle
  isFinal: boolean("is_final").default(false), // True when session ended gracefully
  isRecovered: boolean("is_recovered").default(false), // True if this was used for recovery
  expiresAt: timestamp("expires_at"), // Auto-cleanup after this time
  
  // Folded audit trail (from session_checkpoint_events)
  checkpointEvents: jsonb("checkpoint_events").default([]),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  savedAt: timestamp("saved_at").defaultNow(),
}, (table) => [
  index("session_checkpoints_user_idx").on(table.userId),
  index("session_checkpoints_workspace_idx").on(table.workspaceId),
  index("session_checkpoints_session_idx").on(table.sessionId),
  index("session_checkpoints_phase_idx").on(table.phaseKey),
  index("session_checkpoints_final_idx").on(table.isFinal),
  index("session_checkpoints_expires_idx").on(table.expiresAt),
]);

export const sessionRecoveryRequests = pgTable("session_recovery_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  userId: varchar("user_id").notNull(),
  checkpointId: varchar("checkpoint_id").notNull(),
  sessionId: varchar("session_id").notNull(), // Original session that was lost
  newSessionId: varchar("new_session_id"), // New session where recovery happened
  
  // Request details
  requestSource: varchar("request_source", { length: 50 }).notNull(), // 'auto_prompt', 'user_initiated', 'trinity_suggested'
  status: varchar("status", { length: 30 }).default("pending"), // 'pending', 'accepted', 'declined', 'expired', 'completed'
  
  // Recovery outcome
  recoveredData: jsonb("recovered_data"), // What was restored
  recoveryNotes: text("recovery_notes"), // AI-generated summary of recovery
  userFeedback: varchar("user_feedback", { length: 30 }), // 'helpful', 'partial', 'not_needed'
  
  // Timing
  promptedAt: timestamp("prompted_at").defaultNow(),
  respondedAt: timestamp("responded_at"),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at"), // Recovery offer expires after this
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("recovery_requests_user_idx").on(table.userId),
  index("recovery_requests_checkpoint_idx").on(table.checkpointId),
  index("recovery_requests_status_idx").on(table.status),
  index("recovery_requests_created_idx").on(table.createdAt),
]);

export const userAutomationConsents = pgTable("user_automation_consents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  
  consentType: varchar("consent_type", { length: 50 }).notNull(),
  
  consentGranted: boolean("consent_granted").notNull().default(false),
  consentGrantedAt: timestamp("consent_granted_at"),
  
  waiverAccepted: boolean("waiver_accepted").default(false),
  waiverAcceptedAt: timestamp("waiver_accepted_at"),
  waiverVersion: varchar("waiver_version", { length: 20 }),
  
  sourceContext: varchar("source_context", { length: 100 }),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  revokedReason: text("revoked_reason"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("user_automation_consents_user_idx").on(table.userId),
  index("user_automation_consents_workspace_idx").on(table.workspaceId),
  index("user_automation_consents_type_idx").on(table.consentType),
  uniqueIndex("unique_user_workspace_consent_type").on(table.userId, table.workspaceId, table.consentType),
]);

export const accessPolicies = pgTable("access_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Policy identification
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  workspaceId: varchar("workspace_id"),
  isGlobal: boolean("is_global").default(false), // Platform-wide policy
  
  // Policy definition
  effect: policyEffectEnum("effect").notNull().default("deny"),
  priority: integer("priority").default(100), // Lower = higher priority
  
  // Subject conditions (WHO)
  subjectConditions: jsonb("subject_conditions").notNull().default('{}'), // JSON rules for entity matching
  // e.g., { "entityType": "human", "role": ["manager", "admin"], "department": "finance" }
  
  // Resource conditions (WHAT)
  resourceType: varchar("resource_type", { length: 100 }).notNull(), // 'action', 'domain', 'endpoint', 'data'
  resourcePattern: varchar("resource_pattern", { length: 500 }).notNull(), // Pattern or specific resource
  
  // Context conditions (WHEN/WHERE)
  contextConditions: jsonb("context_conditions").default('{}'), // Time, location, device, risk
  // e.g., { "timeOfDay": "business_hours", "deviceType": ["desktop", "mobile"], "riskScore": { "max": 50 } }
  
  // Action constraints
  actions: text("actions").array(), // ['read', 'write', 'delete', 'execute']
  maxTransactionAmount: decimal("max_transaction_amount", { precision: 15, scale: 2 }), // Financial limit
  
  // Status
  isActive: boolean("is_active").default(true),
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by"),
}, (table) => [
  index("access_policies_workspace_idx").on(table.workspaceId),
  index("access_policies_resource_idx").on(table.resourceType, table.resourcePattern),
  index("access_policies_priority_idx").on(table.priority),
  index("access_policies_active_idx").on(table.isActive),
]);

export const accessControlEvents = pgTable("access_control_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Event identification
  eventType: varchar("event_type", { length: 50 }).notNull(), // 'role_changed', 'permission_granted', 'access_suspended', etc.
  priority: varchar("priority", { length: 20 }).default("normal"), // 'low', 'normal', 'high', 'critical'
  
  // Actor (who made the change)
  actorType: entityTypeEnum("actor_type").notNull(),
  actorId: varchar("actor_id", { length: 255 }).notNull(),
  actorRole: varchar("actor_role", { length: 50 }),
  
  // Target (who was affected)
  targetType: entityTypeEnum("target_type").notNull(),
  targetId: varchar("target_id", { length: 255 }).notNull(),
  workspaceId: varchar("workspace_id"),
  
  // Change details
  changeDetails: jsonb("change_details").notNull(), // Full change record
  previousState: jsonb("previous_state"), // State before change
  newState: jsonb("new_state"), // State after change
  
  // Policy enforcement
  policyId: varchar("policy_id"),
  enforcementResult: varchar("enforcement_result", { length: 50 }), // 'allowed', 'denied', 'pending_approval'
  
  // Propagation tracking
  propagated: boolean("propagated").default(false),
  propagatedAt: timestamp("propagated_at"),
  propagationTargets: text("propagation_targets").array(), // Services that received the event
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("access_control_events_type_idx").on(table.eventType),
  index("access_control_events_actor_idx").on(table.actorType, table.actorId),
  index("access_control_events_target_idx").on(table.targetType, table.targetId),
  index("access_control_events_workspace_idx").on(table.workspaceId),
  index("access_control_events_created_idx").on(table.createdAt),
]);

export const workspaceApiKeys = pgTable("workspace_api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  name: varchar("name").notNull(),
  keyHash: varchar("key_hash").notNull(),
  keyPrefix: varchar("key_prefix", { length: 8 }).notNull(),
  permissions: text("permissions").array(),
  rateLimit: integer("rate_limit").default(1000),
  rateLimitWindow: varchar("rate_limit_window").default("hour"),
  totalRequests: integer("total_requests").default(0),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("api_key_ws_idx").on(table.workspaceId),
  index("api_key_hash_idx").on(table.keyHash),
]);

export const apiKeyUsageLogs = pgTable("api_key_usage_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  apiKeyId: varchar("api_key_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  endpoint: varchar("endpoint"),
  method: varchar("method"),
  statusCode: integer("status_code"),
  responseTimeMs: integer("response_time_ms"),
  ipAddress: varchar("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
}, (table) => [
  index("api_usage_key_idx").on(table.apiKeyId),
  index("api_usage_ws_idx").on(table.workspaceId),
]);

export const expressSessions = pgTable("sessions", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull(),

  createdAt: timestamp("created_at").defaultNow(),

  checkpointData: jsonb("checkpoint_data").default('{}'),
  recoveryData: jsonb("recovery_data").default('{}'),
});

export const managedApiKeys = pgTable("managed_api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  keyName: varchar("key_name").notNull(),
  keyHash: varchar("key_hash").notNull(),
  keyPrefix: varchar("key_prefix"),
  scopes: text("scopes").array(),
  isActive: boolean("is_active").default(true),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  createdBy: varchar("created_by"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  name: varchar("name"),
  keyType: varchar("key_type"),
  status: varchar("status"),
  rotationCount: integer("rotation_count").default(0),
  lastRotatedAt: timestamp("last_rotated_at", { withTimezone: true }),
});

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),

  // Password authentication
  passwordHash: varchar("password_hash"), // Bcrypt hash (cost 12)
  emailVerified: boolean("email_verified").default(false),
  emailVerifiedAt: timestamp("email_verified_at"),
  verificationToken: varchar("verification_token"),
  verificationTokenExpiry: timestamp("verification_token_expiry"),

  // Password reset
  resetToken: varchar("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  
  // Auth provider tracking for migration
  authProvider: varchar("auth_provider").default("email"), // 'email', 'magic_link', 'replit_legacy'

  // Profile
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  phone: varchar("phone"),

  // ============================================================================
  // UNIVERSAL IDENTIFICATION SYSTEM — Phase 57
  // Format: USR-[NNNNN]  e.g. USR-10847 — platform-wide unique
  // ============================================================================
  userNumber: varchar("user_number").unique(), // e.g. USR-10847

  // Work ID for action tracking (format: Firstname-##-###-##-####)
  workId: varchar("work_id"),

  // Multi-tenant
  currentWorkspaceId: varchar("current_workspace_id"),
  role: varchar("role"), // Workspace role (owner, admin, employee, etc.)

  // Security
  lastLoginAt: timestamp("last_login_at"),
  loginAttempts: integer("login_attempts").default(0),
  lockedUntil: timestamp("locked_until"),
  passwordResetRequired: boolean("password_reset_required").default(false),

  // Multi-Factor Authentication (MFA)
  mfaSecret: varchar("mfa_secret"), // Encrypted TOTP secret
  mfaEnabled: boolean("mfa_enabled").default(false),
  mfaBackupCodes: text("mfa_backup_codes").array(), // Encrypted backup codes
  mfaLastUsedAt: timestamp("mfa_last_used_at"),

  // Display & Language Preferences
  simpleMode: boolean("simple_mode").default(false), // Hide complex widgets/tables for easier interface
  preferredLanguage: varchar("preferred_language", { length: 5 }).notNull().default('en'), // en | es

  // Verified email change flow
  pendingEmail: varchar("pending_email"),
  pendingEmailToken: varchar("pending_email_token"),
  pendingEmailExpiry: timestamp("pending_email_expiry"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const authTokens = pgTable("auth_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  tokenHash: varchar("token_hash").notNull().unique(), // Hashed token (never store raw)
  tokenType: tokenTypeEnum("token_type").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_auth_tokens_hash").on(table.tokenHash),
  index("idx_auth_tokens_user").on(table.userId),
  index("idx_auth_tokens_type").on(table.tokenType),
]);

export const authSessions = pgTable("auth_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  sessionToken: varchar("session_token").notNull().unique(), // Hashed session token
  deviceInfo: jsonb("device_info").default({}),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at").notNull(),
  lastActivityAt: timestamp("last_activity_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  isValid: boolean("is_valid").default(true),

  tokenData: jsonb("token_data").default('{}'),
}, (table) => [
  index("idx_auth_sessions_token").on(table.sessionToken),
  index("idx_auth_sessions_user").on(table.userId),
]);

// ─── Recovered unmapped tables ─────────────────────────────────────────────

export const passwordResetAuditLog = pgTable(
  "password_reset_audit_log",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    requestedBy: varchar("requested_by").notNull(), // Staff user ID who triggered reset
    requestedByWorkspaceId: varchar("requested_by_workspace_id"), // Staff workspace context
    targetUserId: varchar("target_user_id"), // User whose password is being reset (null if user not found)
    targetEmail: varchar("target_email").notNull(), // Email address used for reset
    targetWorkspaceId: varchar("target_workspace_id"), // Target user's workspace (null if user not found)
    success: boolean("success").notNull(), // Whether reset was successful
    outcomeCode: varchar("outcome_code").notNull(), // 'sent', 'not_found', 'rate_limited', 'email_failed', 'error'
    reason: text("reason"), // Success/failure reason
    ipAddress: varchar("ip_address"), // IP address of requester
    userAgent: varchar("user_agent"), // User agent of requester
    createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("password_reset_audit_requested_by_idx").on(table.requestedBy),
    index("password_reset_audit_target_idx").on(table.targetUserId),
    index("password_reset_audit_email_idx").on(table.targetEmail),
    index("password_reset_audit_created_at_idx").on(table.createdAt),
  ]
);

export const keyRotationHistory = pgTable("key_rotation_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  keyId: varchar("key_id"),
  keyType: varchar("key_type").notNull(),
  rotatedBy: varchar("rotated_by"),
  reason: varchar("reason"),
  oldKeyHash: varchar("old_key_hash"),
  newKeyHash: varchar("new_key_hash"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("key_rotation_history_workspace_idx").on(table.workspaceId),
  index("key_rotation_history_key_type_idx").on(table.keyType),
  index("key_rotation_history_created_idx").on(table.createdAt),
]);

