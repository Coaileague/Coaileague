// ═══════════════════════════════════════════════════════════════
// Domain: Storage Quota (Option B — category-based sub-limits)
// ═══════════════════════════════════════════════════════════════

import {
  pgTable,
  varchar,
  bigint,
  timestamp,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export type StorageCategory = 'email' | 'documents' | 'media' | 'audit_reserve';

/**
 * Per-workspace, per-category byte accounting.
 * Composite PK on (workspace_id, category) — one row per category per workspace.
 */
export const storageUsage = pgTable('storage_usage', {
  workspaceId: varchar('workspace_id').notNull(),
  category:    varchar('category').notNull().$type<StorageCategory>(),
  bytesUsed:   bigint('bytes_used', { mode: 'number' }).notNull().default(0),
  updatedAt:   timestamp('updated_at').defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.workspaceId, t.category] }),
}));

/**
 * Idempotency table for storage warning notifications.
 * One row per (workspace_id, threshold) — prevents re-firing 80%/95% alerts.
 * Deleted or reset_at set when usage drops back below the threshold.
 */
export const storageWarningState = pgTable('storage_warning_state', {
  id:          varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar('workspace_id').notNull(),
  threshold:   varchar('threshold').notNull(),
  firedAt:     timestamp('fired_at').defaultNow(),
  resetAt:     timestamp('reset_at'),
}, (t) => ({
  uniq: uniqueIndex('storage_warning_ws_thresh').on(t.workspaceId, t.threshold),
}));

export type StorageUsageRow = typeof storageUsage.$inferSelect;
export type StorageWarningStateRow = typeof storageWarningState.$inferSelect;
