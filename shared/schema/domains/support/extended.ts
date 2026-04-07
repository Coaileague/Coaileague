import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, date, time } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const faqEntries = pgTable("faq_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  category: varchar("category").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  status: varchar("status").default('published'),
  createdBy: varchar("created_by").default('system'),
  reviewRequired: boolean("review_required").default(false),
  version: integer("version").default(1),
  isActive: boolean("is_active").default(true),
  tags: text("tags"),
  createdAt: timestamp("created_at").default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`),
});

export const insertFaqEntriesSchema = createInsertSchema(faqEntries).omit({ id: true });
export type InsertFaqEntries = z.infer<typeof insertFaqEntriesSchema>;
export type FaqEntries = typeof faqEntries.$inferSelect;

export const faqNotifications = pgTable("faq_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  faqId: varchar("faq_id"),
  notificationType: varchar("notification_type").default('faq_update'),
  sentTo: varchar("sent_to"),
  sentAt: timestamp("sent_at").default(sql`now()`),
});

export const insertFaqNotificationsSchema = createInsertSchema(faqNotifications).omit({ id: true });
export type InsertFaqNotifications = z.infer<typeof insertFaqNotificationsSchema>;
export type FaqNotifications = typeof faqNotifications.$inferSelect;

export const faqVersionHistory = pgTable("faq_version_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  faqId: varchar("faq_id"),
  versionNumber: integer("version_number").notNull(),
  oldAnswer: text("old_answer"),
  newAnswer: text("new_answer"),
  changedBy: varchar("changed_by"),
  changeReason: text("change_reason"),
  changedAt: timestamp("changed_at").default(sql`now()`),
});

export const insertFaqVersionHistorySchema = createInsertSchema(faqVersionHistory).omit({ id: true });
export type InsertFaqVersionHistory = z.infer<typeof insertFaqVersionHistorySchema>;
export type FaqVersionHistory = typeof faqVersionHistory.$inferSelect;

