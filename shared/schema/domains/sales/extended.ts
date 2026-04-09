import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, date, time } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const bidAnalytics = pgTable("bid_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  totalBidsSubmitted: integer("total_bids_submitted").default(0),
  totalBidsWon: integer("total_bids_won").default(0),
  totalBidsLost: integer("total_bids_lost").default(0),
  totalBidsNoResponse: integer("total_bids_no_response").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  winRatePct: decimal("win_rate_pct").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  averageProposalValue: decimal("average_proposal_value").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  totalPipelineValue: decimal("total_pipeline_value").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  totalWonValue: decimal("total_won_value").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  averageDaysToClose: decimal("average_days_to_close").default(0),
  mostCommonLossReason: text("most_common_loss_reason"),
  generatedAt: timestamp("generated_at").default(sql`now()`),
});

export const insertBidAnalyticsSchema = createInsertSchema(bidAnalytics).omit({ id: true });
export type InsertBidAnalytics = z.infer<typeof insertBidAnalyticsSchema>;
export type BidAnalytics = typeof bidAnalytics.$inferSelect;

export const contractHealthScores = pgTable("contract_health_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  contractedHoursPerPeriod: decimal("contracted_hours_per_period").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  actualHoursPerPeriod: decimal("actual_hours_per_period").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  billingRate: decimal("billing_rate").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  actualCostPerHour: decimal("actual_cost_per_hour").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  marginPerHour: decimal("margin_per_hour").default(0),
  // @ts-expect-error — TS migration: fix in refactoring sprint
  marginPct: decimal("margin_pct").default(0),
  trend: varchar("trend").default('stable'),
  atRisk: boolean("at_risk").default(false),
  calculatedAt: timestamp("calculated_at").notNull().default(sql`now()`),
});

export const insertContractHealthScoresSchema = createInsertSchema(contractHealthScores).omit({ id: true });
export type InsertContractHealthScores = z.infer<typeof insertContractHealthScoresSchema>;
export type ContractHealthScores = typeof contractHealthScores.$inferSelect;

export const contractRenewalTasks = pgTable("contract_renewal_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  contractId: varchar("contract_id").notNull(),
  taskType: varchar("task_type").notNull(),
  dueDate: date("due_date").notNull(),
  completedAt: timestamp("completed_at"),
  status: varchar("status").default('pending'),
  trinityActionTaken: text("trinity_action_taken"),
  ownerNotified: boolean("owner_notified").default(false),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertContractRenewalTasksSchema = createInsertSchema(contractRenewalTasks).omit({ id: true });
export type InsertContractRenewalTasks = z.infer<typeof insertContractRenewalTasksSchema>;
export type ContractRenewalTasks = typeof contractRenewalTasks.$inferSelect;

