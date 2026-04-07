import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, date, time } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const incidentPatterns = pgTable("incident_patterns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  patternType: varchar("pattern_type").notNull(),
  patternScope: varchar("pattern_scope").notNull(),
  sitesAffected: jsonb("sites_affected").default('[]'),
  officersInvolved: jsonb("officers_involved").default('[]'),
  incidentCount: integer("incident_count").default(0),
  firstOccurrence: timestamp("first_occurrence"),
  mostRecentOccurrence: timestamp("most_recent_occurrence"),
  patternDescription: text("pattern_description"),
  riskLevel: varchar("risk_level").default('medium'),
  recommendedAction: text("recommended_action"),
  status: varchar("status").default('active'),
  addressedBy: varchar("addressed_by"),
  addressedAt: timestamp("addressed_at"),
  addressNotes: text("address_notes"),
  createdBy: varchar("created_by").default('trinity'),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertIncidentPatternsSchema = createInsertSchema(incidentPatterns).omit({ id: true });
export type InsertIncidentPatterns = z.infer<typeof insertIncidentPatternsSchema>;
export type IncidentPatterns = typeof incidentPatterns.$inferSelect;

