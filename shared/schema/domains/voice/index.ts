// ═══════════════════════════════════════════════════════════════
// Domain: Voice — Trinity Voice Phone System (Phase 56)
// ═══════════════════════════════════════════════════════════════
// Tables: workspace_phone_numbers, voice_call_sessions,
//         voice_call_actions, voice_verification_log
// NOTE: voice_credit_accounts and voice_credit_transactions dropped (Phase 16)
//       Voice usage now tracked via voiceSmsMeteringService

import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// ── workspace_phone_numbers ────────────────────────────────────────────────
export const workspacePhoneNumbers = pgTable("workspace_phone_numbers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  phoneNumber: varchar("phone_number").notNull().unique(), // E.164 format
  friendlyName: varchar("friendly_name"),
  twilioSid: varchar("twilio_sid").unique(), // Twilio PhoneNumber SID
  country: varchar("country").default("US"),
  capabilities: jsonb("capabilities"), // { voice: true, sms: true }

  isActive: boolean("is_active").default(true),
  isPrimary: boolean("is_primary").default(false),

  // Trinity voice persona config per number
  greetingScript: text("greeting_script"),
  greetingScriptEs: text("greeting_script_es"), // Spanish greeting
  extensionConfig: jsonb("extension_config"), // which extensions are enabled

  monthlyRentCents: integer("monthly_rent_cents").default(100), // $1/mo typical

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("workspace_phone_numbers_workspace_idx").on(t.workspaceId),
]);

export const insertWorkspacePhoneNumberSchema = createInsertSchema(workspacePhoneNumbers).omit({ id: true });
export type InsertWorkspacePhoneNumber = z.infer<typeof insertWorkspacePhoneNumberSchema>;
export type WorkspacePhoneNumber = typeof workspacePhoneNumbers.$inferSelect;

// ── voice_call_sessions ────────────────────────────────────────────────────
export const voiceCallSessions = pgTable("voice_call_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),

  twilioCallSid: varchar("twilio_call_sid").unique().notNull(),
  phoneNumberId: varchar("phone_number_id"), // which workspace number was called
  callerNumber: varchar("caller_number"),    // E.164 caller ID
  callerName: varchar("caller_name"),        // Twilio lookup name if available

  status: varchar("status").default("initiated"), // initiated | in_progress | completed | failed | no_answer
  direction: varchar("direction").default("inbound"),

  extensionReached: varchar("extension_reached"), // 1-6 or 'unknown'
  extensionLabel: varchar("extension_label"),     // 'sales' | 'client_support' | etc

  language: varchar("language").default("en"), // 'en' | 'es'

  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  durationSeconds: integer("duration_seconds"),

  // Cost tracking
  estimatedCostCents: integer("estimated_cost_cents"),
  actualCostCents: integer("actual_cost_cents"),
  creditDeducted: boolean("credit_deducted").default(false),

  // Transcript and recording
  transcript: text("transcript"),
  recordingUrl: text("recording_url"),
  recordingSid: varchar("recording_sid"),

  // Clock-in metadata (if this was a staff voice clock-in)
  clockInEmployeeId: varchar("clock_in_employee_id"),
  clockInReferenceId: varchar("clock_in_reference_id"),
  clockInSuccess: boolean("clock_in_success"),

  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("voice_call_sessions_workspace_idx").on(t.workspaceId),
  index("voice_call_sessions_twilio_sid_idx").on(t.twilioCallSid),
  index("voice_call_sessions_caller_idx").on(t.callerNumber),
  index("voice_call_sessions_started_at_idx").on(t.startedAt),
]);

export const insertVoiceCallSessionSchema = createInsertSchema(voiceCallSessions).omit({ id: true });
export type InsertVoiceCallSession = z.infer<typeof insertVoiceCallSessionSchema>;
export type VoiceCallSession = typeof voiceCallSessions.$inferSelect;

// ── voice_call_actions ─────────────────────────────────────────────────────
// Granular action log per call (IVR selections, DTMF inputs, clock-in attempts)
export const voiceCallActions = pgTable("voice_call_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callSessionId: varchar("call_session_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),

  action: varchar("action").notNull(),   // 'dtmf_input' | 'speech_input' | 'extension_selected' | 'clock_in' | 'transfer'
  payload: jsonb("payload"),             // action-specific data (digits, transcript, result)
  outcome: varchar("outcome"),           // 'success' | 'failure' | 'timeout' | 'invalid'
  errorMessage: text("error_message"),

  occurredAt: timestamp("occurred_at").defaultNow(),
}, (t) => [
  index("voice_call_actions_session_idx").on(t.callSessionId),
  index("voice_call_actions_workspace_idx").on(t.workspaceId),
]);

export const insertVoiceCallActionSchema = createInsertSchema(voiceCallActions).omit({ id: true });
export type InsertVoiceCallAction = z.infer<typeof insertVoiceCallActionSchema>;
export type VoiceCallAction = typeof voiceCallActions.$inferSelect;

// ── voice_verification_log ─────────────────────────────────────────────────
// PIN auth audit trail for voice clock-in attempts
export const voiceVerificationLog = pgTable("voice_verification_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  callSessionId: varchar("call_session_id"),
  employeeId: varchar("employee_id"),
  employeeNumber: varchar("employee_number"), // what was keyed in

  verificationType: varchar("verification_type").notNull(), // 'clock_in_pin' | 'employee_lookup'
  outcome: varchar("outcome").notNull(),  // 'success' | 'failure' | 'no_employee_found' | 'no_pin_set' | 'locked'
  failedAttempts: integer("failed_attempts").default(0),

  ipAddress: varchar("ip_address"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("voice_verification_log_workspace_idx").on(t.workspaceId),
  index("voice_verification_log_employee_idx").on(t.employeeId),
  index("voice_verification_log_session_idx").on(t.callSessionId),
]);

export const insertVoiceVerificationLogSchema = createInsertSchema(voiceVerificationLog).omit({ id: true });
export type InsertVoiceVerificationLog = z.infer<typeof insertVoiceVerificationLogSchema>;
export type VoiceVerificationLog = typeof voiceVerificationLog.$inferSelect;

// ── voice_support_cases ────────────────────────────────────────────────────
// Inbound support cases created through the Trinity IVR voice system
export const voiceSupportCases = pgTable("voice_support_cases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  caseNumber: varchar("case_number").notNull().unique(),
  callSessionId: varchar("call_session_id"),
  callerNumber: varchar("caller_number"),
  callerName: varchar("caller_name"),
  issueSummary: text("issue_summary").notNull(),
  aiResolutionAttempted: boolean("ai_resolution_attempted").notNull().default(false),
  aiResolutionText: text("ai_resolution_text"),
  aiModelUsed: varchar("ai_model_used"),
  status: varchar("status").notNull().default("open"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by"),
  resolutionNotes: text("resolution_notes"),
  agentNotified: boolean("agent_notified").notNull().default(false),
  notificationSentAt: timestamp("notification_sent_at"),
  language: varchar("language").notNull().default("en"),
  transcript: text("transcript"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("voice_support_cases_workspace_idx").on(t.workspaceId),
  index("voice_support_cases_status_idx").on(t.status),
  index("voice_support_cases_case_number_idx").on(t.caseNumber),
  index("voice_support_cases_created_idx").on(t.createdAt),
]);

export const insertVoiceSupportCaseSchema = createInsertSchema(voiceSupportCases).omit({ id: true });
export type InsertVoiceSupportCase = z.infer<typeof insertVoiceSupportCaseSchema>;
export type VoiceSupportCase = typeof voiceSupportCases.$inferSelect;

// ── voice_support_agents ───────────────────────────────────────────────────
// Human agents who receive voice support escalation notifications
export const voiceSupportAgents = pgTable("voice_support_agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  name: varchar("name").notNull(),
  email: varchar("email"),
  phone: varchar("phone"),
  role: varchar("role").notNull().default("support_agent"),
  notificationChannels: jsonb("notification_channels").notNull().default(["email"] as unknown as string[]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("voice_support_agents_workspace_idx").on(t.workspaceId),
]);

export const insertVoiceSupportAgentSchema = createInsertSchema(voiceSupportAgents).omit({ id: true });
export type InsertVoiceSupportAgent = z.infer<typeof insertVoiceSupportAgentSchema>;
export type VoiceSupportAgent = typeof voiceSupportAgents.$inferSelect;
