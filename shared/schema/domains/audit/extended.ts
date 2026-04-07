import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, date, time } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const automationTriggers = pgTable("automation_triggers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  createdAt: timestamp("created_at").default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`),
  triggerData: jsonb("trigger_data"),
});

export const insertAutomationTriggersSchema = createInsertSchema(automationTriggers).omit({ id: true });
export type InsertAutomationTriggers = z.infer<typeof insertAutomationTriggersSchema>;
export type AutomationTriggers = typeof automationTriggers.$inferSelect;

