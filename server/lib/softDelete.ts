/**
 * SOFT DELETE UTILITY (TRINITY.md Section R, Law P1)
 *
 * No business record is ever hard-deleted. This helper sets `deleted_at` and
 * `deleted_by` on a row so it disappears from normal queries (which filter
 * `IS NULL deleted_at`) while remaining available for audit, legal hold,
 * undo, and compliance retrieval.
 *
 * Hard `db.delete(...)` is reserved for: temp locks, expired rate-limit
 * windows, idempotency keys >30 days, processed Stripe events >30 days,
 * WebSocket typing indicators.
 */

import { db } from '../db';
import { auditLogs } from '@shared/schema';
import { sql, type SQL } from 'drizzle-orm';
import { createLogger } from './logger';

const log = createLogger('softDelete');

export interface SoftDeleteParams {
  /** The Drizzle table whose row to mark deleted. Must declare `deleted_at` + `deleted_by` columns. */
  table: any;
  /** The fully-qualified WHERE clause selecting the row(s) to mark deleted. Must include `workspace_id` per Section G. */
  where: SQL;
  /** ID of the user performing the deletion (for audit + `deleted_by`). */
  userId: string;
  /** workspace ID — written to the audit row. */
  workspaceId: string;
  /** entity type label for the audit log (e.g. 'client', 'employee_document'). */
  entityType: string;
  /** Optional entity ID for the audit log. */
  entityId?: string | null;
  /** Optional human reason — stored in audit metadata. */
  reason?: string;
}

/**
 * Soft-delete one or more rows. Sets `deleted_at = now()` and `deleted_by = userId`,
 * then writes an `audit_logs` entry. The audit write is non-fatal — a logging
 * failure cannot block a delete.
 */
export async function softDelete(params: SoftDeleteParams): Promise<void> {
  const { table, where, userId, workspaceId, entityType, entityId, reason } = params;

  await db.update(table)
    .set({
      deletedAt: new Date(),
      deletedBy: userId,
    } as any)
    .where(where);

  try {
    await db.insert(auditLogs).values({
      workspaceId,
      userId,
      action: 'soft_delete',
      entityType,
      entityId: entityId ?? null,
      metadata: {
        reason: reason ?? null,
        // Store SQL string for replay/debugging — Drizzle SQL toString() exposes the parameterized form.
        whereSql: (where as any).toString?.() ?? null,
      },
      createdAt: new Date(),
    } as any);
  } catch (auditErr: any) {
    log.warn('[softDelete] Audit log write failed (non-fatal):', auditErr?.message);
  }
}

/**
 * Convenience: drizzle SQL fragment for "row is not soft-deleted".
 * Use in SELECT WHERE clauses to keep deleted rows invisible to normal queries.
 */
export const notDeleted = sql`deleted_at IS NULL`;
