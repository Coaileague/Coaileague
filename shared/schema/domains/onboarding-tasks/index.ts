/**
 * Phase 48 — Onboarding Task Management
 * =======================================
 * Tables: onboarding_task_templates, employee_onboarding_completions
 */

import {
  pgTable, varchar, text, integer, boolean,
  timestamp, jsonb, index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─── onboarding_task_templates ────────────────────────────────────────────────
// Platform-wide and workspace-specific task templates.
// workspaceId = null means platform default (visible to all orgs).
export const onboardingTaskTemplates = pgTable('onboarding_task_templates', {
  id:            varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId:   varchar('workspace_id'),              // null = platform default
  category:      varchar('category', { length: 32 }).notNull(), // 'officer' | 'client'
  tier:          integer('tier').notNull().default(1), // 1=blocking, 2=week1, 3=month1
  title:         text('title').notNull(),
  description:   text('description'),
  dueByDays:     integer('due_by_days').notNull().default(1),
  isRequired:    boolean('is_required').notNull().default(true),
  isActive:      boolean('is_active').notNull().default(true),
  sortOrder:     integer('sort_order').notNull().default(0),
  documentType:  varchar('document_type', { length: 64 }), // links to Phase 18 docs
  createdAt:     timestamp('created_at').notNull().default(sql`now()`),
}, (t) => [
  index('ott_workspace_category').on(t.workspaceId, t.category),
  index('ott_tier').on(t.tier),
]);

// ─── employee_onboarding_completions ─────────────────────────────────────────
// Per-employee task completion tracking.
export const employeeOnboardingCompletions = pgTable('employee_onboarding_completions', {
  id:              varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  employeeId:      varchar('employee_id').notNull(),
  workspaceId:     varchar('workspace_id').notNull(),
  taskTemplateId:  varchar('task_template_id').notNull(),
  status:          varchar('status', { length: 32 }).notNull().default('pending'),
                   // pending | in_progress | completed | waived
  completedAt:     timestamp('completed_at'),
  waivedBy:        varchar('waived_by'),
  waivedReason:    text('waived_reason'),
  notes:           text('notes'),
  metadata:        jsonb('metadata'),
  dueDate:         timestamp('due_date'),
  createdAt:       timestamp('created_at').notNull().default(sql`now()`),
  updatedAt:       timestamp('updated_at').notNull().default(sql`now()`),
}, (t) => [
  index('eoc_employee').on(t.employeeId),
  index('eoc_workspace_status').on(t.workspaceId, t.status),
  index('eoc_template').on(t.taskTemplateId),
]);

export type OnboardingTaskTemplate = typeof onboardingTaskTemplates.$inferSelect;
export type EmployeeOnboardingCompletion = typeof employeeOnboardingCompletions.$inferSelect;
