import { pgTable, varchar, text, integer, boolean, timestamp, jsonb, decimal, date, time, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const regulatoryRules = pgTable("regulatory_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  state: varchar("state").notNull(),
  category: varchar("category").notNull(),
  ruleName: varchar("rule_name").notNull(),
  ruleText: text("rule_text").notNull(),
  plainEnglishSummary: text("plain_english_summary"),
  statuteReference: varchar("statute_reference").notNull(),
  effectiveDate: date("effective_date"),
  reviewDate: date("review_date"),
  lastVerified: date("last_verified"),
  severity: varchar("severity").notNull().default('informational'),
  appliesTo: varchar("applies_to").notNull().default('both'),
  workspaceId: varchar("workspace_id"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertRegulatoryRulesSchema = createInsertSchema(regulatoryRules).omit({ id: true });
export type InsertRegulatoryRules = z.infer<typeof insertRegulatoryRulesSchema>;
export type RegulatoryRules = typeof regulatoryRules.$inferSelect;

export const regulatoryUpdates = pgTable("regulatory_updates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ruleId: varchar("rule_id").notNull(),
  changedAt: timestamp("changed_at").notNull().default(sql`now()`),
  oldText: text("old_text"),
  newText: text("new_text").notNull(),
  changedBy: varchar("changed_by"),
  changeReason: text("change_reason"),
});

export const insertRegulatoryUpdatesSchema = createInsertSchema(regulatoryUpdates).omit({ id: true });
export type InsertRegulatoryUpdates = z.infer<typeof insertRegulatoryUpdatesSchema>;
export type RegulatoryUpdates = typeof regulatoryUpdates.$inferSelect;


// ============================================================================
// EMPLOYEE I-9 RECORDS — Employment eligibility verification
// ============================================================================
export const employeeI9Records = pgTable("employee_i9_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  citizenshipStatus: varchar("citizenship_status", { length: 50 }),
  documentType: varchar("document_type", { length: 100 }),
  documentNumber: varchar("document_number", { length: 100 }),
  issuingAuthority: varchar("issuing_authority", { length: 200 }),
  expirationDate: date("expiration_date"),
  reverificationCompleted: boolean("reverification_completed").default(false),
  reverificationDate: date("reverification_date"),
  listADocumentTitle: varchar("list_a_document_title", { length: 200 }),
  listBDocumentTitle: varchar("list_b_document_title", { length: 200 }),
  listCDocumentTitle: varchar("list_c_document_title", { length: 200 }),
  section1CompletedAt: timestamp("section1_completed_at", { withTimezone: true }),
  section2CompletedAt: timestamp("section2_completed_at", { withTimezone: true }),
  employerSignedBy: varchar("employer_signed_by"),
  status: varchar("status", { length: 30 }).default("pending"), // pending | complete | expiring | expired
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("i9_workspace_idx").on(table.workspaceId),
  index("i9_employee_idx").on(table.employeeId),
  index("i9_expiration_idx").on(table.expirationDate),
]);
export const insertEmployeeI9RecordSchema = createInsertSchema(employeeI9Records).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmployeeI9Record = z.infer<typeof insertEmployeeI9RecordSchema>;
export type EmployeeI9Record = typeof employeeI9Records.$inferSelect;
