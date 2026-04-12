import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, date, time, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// ============================================================================
// REVENUE RECOGNITION SCHEDULE — ASC 606 / IFRS 15 accrual tracking
// ============================================================================
export const revenueRecognitionSchedule = pgTable("revenue_recognition_schedule", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  invoiceId: varchar("invoice_id").notNull(),
  clientId: varchar("client_id").notNull(),
  contractId: varchar("contract_id"), // optional link to client_contracts
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  recognizedAmount: decimal("recognized_amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
  remainingAmount: decimal("remaining_amount", { precision: 12, scale: 2 }).notNull(),
  // 'accrual' = spread over months; 'cash' = recognize on payment
  recognitionMethod: varchar("recognition_method", { length: 20 }).notNull().default("cash"),
  // JSON array of { date: ISO8601, amount: string } objects for monthly schedule
  scheduledDates: jsonb("scheduled_dates").notNull().default('[]'),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | in_progress | recognized | deferred | cancelled
  recognizedAt: timestamp("recognized_at", { withTimezone: true }),
  lastProcessedAt: timestamp("last_processed_at", { withTimezone: true }),
  auditLog: jsonb("audit_log").notNull().default('[]'), // array of { timestamp, userId, action, amount, note }
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("rev_recog_workspace_idx").on(table.workspaceId),
  index("rev_recog_invoice_idx").on(table.invoiceId),
  index("rev_recog_status_idx").on(table.status),
  index("rev_recog_client_idx").on(table.clientId),
  index("rev_recog_method_idx").on(table.recognitionMethod),
]);

export const insertRevenueRecognitionScheduleSchema = createInsertSchema(revenueRecognitionSchedule).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRevenueRecognitionSchedule = z.infer<typeof insertRevenueRecognitionScheduleSchema>;
export type RevenueRecognitionSchedule = typeof revenueRecognitionSchedule.$inferSelect;

// ============================================================================
// DEFERRED REVENUE — Revenue collected but not yet earned
// ============================================================================
export const deferredRevenue = pgTable("deferred_revenue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  invoiceId: varchar("invoice_id").notNull(),
  scheduleId: varchar("schedule_id"), // link to revenueRecognitionSchedule
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  deferralReason: varchar("deferral_reason", { length: 200 }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  recognizedAmount: decimal("recognized_amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
  status: varchar("status", { length: 20 }).notNull().default("deferred"), // deferred | partially_recognized | recognized
  recognizedAt: timestamp("recognized_at", { withTimezone: true }),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("deferred_rev_workspace_idx").on(table.workspaceId),
  index("deferred_rev_invoice_idx").on(table.invoiceId),
  index("deferred_rev_status_idx").on(table.status),
  index("deferred_rev_start_idx").on(table.startDate),
]);

export const insertDeferredRevenueSchema = createInsertSchema(deferredRevenue).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDeferredRevenue = z.infer<typeof insertDeferredRevenueSchema>;
export type DeferredRevenue = typeof deferredRevenue.$inferSelect;

// ============================================================================
// PROCESSED REVENUE EVENTS — Idempotency for monthly recognition job
// ============================================================================
export const processedRevenueEvents = pgTable("processed_revenue_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  idempotencyKey: varchar("idempotency_key").notNull().unique(), // e.g. "revenue-<workspaceId>-2026-04"
  workspaceId: varchar("workspace_id").notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  schedulesProcessed: integer("schedules_processed").default(0),
  amountRecognized: decimal("amount_recognized", { precision: 14, scale: 2 }).default("0.00"),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("proc_rev_workspace_idx").on(table.workspaceId),
  index("proc_rev_key_idx").on(table.idempotencyKey),
  index("proc_rev_period_idx").on(table.workspaceId, table.year, table.month),
]);

export const insertProcessedRevenueEventSchema = createInsertSchema(processedRevenueEvents).omit({
  id: true,
  processedAt: true,
});
export type InsertProcessedRevenueEvent = z.infer<typeof insertProcessedRevenueEventSchema>;
export type ProcessedRevenueEvent = typeof processedRevenueEvents.$inferSelect;

// ============================================================================
// CONTRACT REVENUE MAPPING — Map client contracts to invoice revenue
// ============================================================================
export const contractRevenueMapping = pgTable("contract_revenue_mapping", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  contractId: varchar("contract_id").notNull(),
  invoiceId: varchar("invoice_id"),
  scheduleId: varchar("schedule_id"), // link to revenueRecognitionSchedule
  contractValue: decimal("contract_value", { precision: 12, scale: 2 }),
  monthlyValue: decimal("monthly_value", { precision: 12, scale: 2 }), // contract_value / term_months
  recognitionStartDate: date("recognition_start_date"),
  recognitionEndDate: date("recognition_end_date"),
  termMonths: integer("term_months"),
  recognitionMethod: varchar("recognition_method", { length: 20 }).default("accrual"),
  status: varchar("status", { length: 20 }).default("active"), // active | completed | cancelled
  recognizedToDate: decimal("recognized_to_date", { precision: 12, scale: 2 }).default("0.00"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("contract_rev_workspace_idx").on(table.workspaceId),
  index("contract_rev_contract_idx").on(table.contractId),
  index("contract_rev_invoice_idx").on(table.invoiceId),
  index("contract_rev_status_idx").on(table.status),
]);

export const insertContractRevenueMappingSchema = createInsertSchema(contractRevenueMapping).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertContractRevenueMapping = z.infer<typeof insertContractRevenueMappingSchema>;
export type ContractRevenueMapping = typeof contractRevenueMapping.$inferSelect;

export const externalCostLog = pgTable("external_cost_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id"),
  serviceName: varchar("service_name").notNull(),
  callType: varchar("call_type"),
  modelUsed: varchar("model_used"),
  unitsConsumed: decimal("units_consumed"),
  costMicrocents: integer("cost_microcents").default(0),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertExternalCostLogSchema = createInsertSchema(externalCostLog).omit({ id: true });
export type InsertExternalCostLog = z.infer<typeof insertExternalCostLogSchema>;
export type ExternalCostLog = typeof externalCostLog.$inferSelect;

export const laborCostForecast = pgTable("labor_cost_forecast", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  forecastDate: date("forecast_date").notNull(),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  projectedRegularHours: decimal("projected_regular_hours").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  projectedOtHours: decimal("projected_ot_hours").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  projectedRegularCost: decimal("projected_regular_cost").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  projectedOtCost: decimal("projected_ot_cost").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  projectedTotalCost: decimal("projected_total_cost").default(0),
  confidenceScore: decimal("confidence_score").default('0.7'),
  generatedAt: timestamp("generated_at").notNull().default(sql`now()`),
});

export const insertLaborCostForecastSchema = createInsertSchema(laborCostForecast).omit({ id: true });
export type InsertLaborCostForecast = z.infer<typeof insertLaborCostForecastSchema>;
export type LaborCostForecast = typeof laborCostForecast.$inferSelect;

export const platformAiProviderBudgets = pgTable("platform_ai_provider_budgets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: varchar("provider").notNull(),
  displayName: varchar("display_name").notNull(),
  monthlyBudgetCents: integer("monthly_budget_cents").notNull().default(0),
  alertThresholdPercent: integer("alert_threshold_percent").notNull().default(80),
  topoffEvents: jsonb("topoff_events").notNull().default('[]'),
  notes: text("notes"),
  createdAt: timestamp("created_at").default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`),
});

export const insertPlatformAiProviderBudgetsSchema = createInsertSchema(platformAiProviderBudgets).omit({ id: true });
export type InsertPlatformAiProviderBudgets = z.infer<typeof insertPlatformAiProviderBudgetsSchema>;
export type PlatformAiProviderBudgets = typeof platformAiProviderBudgets.$inferSelect;

export const platformCostRates = pgTable("platform_cost_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceName: varchar("service_name").notNull(),
  unitName: varchar("unit_name").notNull(),
  costMicrocents: integer("cost_microcents").notNull(),
  markupMultiplier: decimal("markup_multiplier").default('1.0'),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`),
});

export const insertPlatformCostRatesSchema = createInsertSchema(platformCostRates).omit({ id: true });
export type InsertPlatformCostRates = z.infer<typeof insertPlatformCostRatesSchema>;
export type PlatformCostRates = typeof platformCostRates.$inferSelect;

export const seatCostBreakdown = pgTable("seat_cost_breakdown", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id"),
  seatType: varchar("seat_type"),
  costCents: integer("cost_cents").default(0),
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertSeatCostBreakdownSchema = createInsertSchema(seatCostBreakdown).omit({ id: true });
export type InsertSeatCostBreakdown = z.infer<typeof insertSeatCostBreakdownSchema>;
export type SeatCostBreakdown = typeof seatCostBreakdown.$inferSelect;

export const voiceUsage = pgTable("voice_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  userId: varchar("user_id"),
  sessionId: varchar("session_id"),
  charactersUsed: integer("characters_used").notNull().default(0),
  voiceId: varchar("voice_id"),
  modelId: varchar("model_id"),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  costUsd: decimal("cost_usd").default(0),
  creditsDeducted: integer("credits_deducted").default(0),
  callType: varchar("call_type").default('tts'),
  audioDurationSeconds: decimal("audio_duration_seconds"),
  createdAt: timestamp("created_at").default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`),
});

export const insertVoiceUsageSchema = createInsertSchema(voiceUsage).omit({ id: true });
export type InsertVoiceUsage = z.infer<typeof insertVoiceUsageSchema>;
export type VoiceUsage = typeof voiceUsage.$inferSelect;



// ============================================================================
// INVOICE PROPOSALS — Pre-invoice draft proposals for client approval
// ============================================================================
export const invoiceProposals = pgTable("invoice_proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  invoiceId: varchar("invoice_id"),
  clientId: varchar("client_id").notNull(),
  status: varchar("status", { length: 30 }).default("draft"), // draft | sent | accepted | rejected | expired
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }),
  proposalData: jsonb("proposal_data"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("inv_proposal_workspace_idx").on(table.workspaceId),
  index("inv_proposal_client_idx").on(table.clientId),
  index("inv_proposal_status_idx").on(table.status),
]);
export const insertInvoiceProposalSchema = createInsertSchema(invoiceProposals).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInvoiceProposal = z.infer<typeof insertInvoiceProposalSchema>;
export type InvoiceProposal = typeof invoiceProposals.$inferSelect;
