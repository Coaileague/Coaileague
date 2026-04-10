import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, date, time, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

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
