/**
 * Tenant Retention Policy Service — Readiness Section 23
 * =========================================================
 * Codifies the retention rules proposed in docs/SECURITY_AND_DR.md §6:
 *
 *   Active tenant     — retained indefinitely
 *   Suspended tenant  — 90 days in place, then archive 1 year
 *   Cancelled tenant  — 30 days soft delete, then hard delete
 *   Regulatory hold   — overrides all of the above
 *
 * Decisions are PURE functions of (workspace status, status_changed_at,
 * regulatory_hold) so they're trivially testable and auditable.
 *
 * This service is the decision brain. Actual archive / delete execution
 * happens in a cron worker that calls decideRetentionAction and then
 * performs the returned action idempotently. Cron wiring is NOT in this
 * branch — Section 7 (testing) lists it as a follow-up.
 */

export type WorkspaceStatus = 'active' | 'suspended' | 'cancelled';
export type RetentionAction =
  | { action: 'retain' }
  | { action: 'archive'; reason: string }
  | { action: 'hard_delete'; reason: string }
  | { action: 'hold'; reason: string };

export interface RetentionInput {
  workspaceId: string;
  status: WorkspaceStatus;
  statusChangedAt: Date | null;
  regulatoryHold: boolean;
  now?: Date;
}

const DAYS = 24 * 60 * 60 * 1000;

/** Pure function. Does not touch the database. */
export function decideRetentionAction(input: RetentionInput): RetentionAction {
  const now = input.now ?? new Date();

  // Regulatory hold overrides everything.
  if (input.regulatoryHold) {
    return { action: 'hold', reason: 'regulatory_hold' };
  }

  if (input.status === 'active') {
    return { action: 'retain' };
  }

  // Without a status_changed_at we cannot reason about age — default to retain.
  if (!input.statusChangedAt) {
    return { action: 'retain' };
  }

  const ageDays = (now.getTime() - input.statusChangedAt.getTime()) / DAYS;

  if (input.status === 'suspended') {
    // 90 days in place → archive. (Archive is a separate state we don't
    // model in code here; the worker moves rows to cold storage.)
    if (ageDays >= 90) {
      return { action: 'archive', reason: 'suspended_90d_elapsed' };
    }
    return { action: 'retain' };
  }

  if (input.status === 'cancelled') {
    // 30 days soft-delete grace, then hard delete.
    if (ageDays >= 30) {
      return { action: 'hard_delete', reason: 'cancelled_30d_elapsed' };
    }
    return { action: 'retain' };
  }

  return { action: 'retain' };
}

/**
 * Describe what a worker should do for a batch of workspaces. Returns
 * only the non-retain decisions so the worker can log its intent.
 */
export function decideRetentionBatch(inputs: RetentionInput[]): Array<{
  workspaceId: string;
  decision: RetentionAction;
}> {
  return inputs
    .map((input) => ({ workspaceId: input.workspaceId, decision: decideRetentionAction(input) }))
    .filter((r) => r.decision.action !== 'retain');
}

/**
 * Readiness Section 27 #11 — scan every workspace, return non-retain
 * decisions. Dry-run by default (does NOT execute archive/delete). A
 * cron worker will call this with execute=true once the archival
 * targets (S3 Glacier, etc.) are configured.
 */
export async function runRetentionScan(): Promise<{
  scanned: number;
  decisions: Array<{ workspaceId: string; decision: RetentionAction }>;
  scannedAt: string;
}> {
  const { pool } = await import('../db');
  const now = new Date();

  const r = await pool.query(`
    SELECT id AS workspace_id,
           status,
           status_changed_at,
           COALESCE(regulatory_hold, false) AS regulatory_hold
      FROM workspaces
  `);

  const inputs: RetentionInput[] = r.rows.map((row: any) => ({
    workspaceId: row.workspace_id,
    status: (row.status as WorkspaceStatus) ?? 'active',
    statusChangedAt: row.status_changed_at ? new Date(row.status_changed_at) : null,
    regulatoryHold: !!row.regulatory_hold,
    now,
  }));

  const decisions = decideRetentionBatch(inputs);
  return {
    scanned: inputs.length,
    decisions,
    scannedAt: now.toISOString(),
  };
}
