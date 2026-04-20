/**
 * Compliance Score Monitor — Readiness Section 17
 * ==================================================
 * Takes the composite compliance score computed in Section 3
 * (auditorAccessService.computeComplianceScore) and:
 *
 *   1. Persists a snapshot to compliance_score_snapshots (created on
 *      first use, idempotent bootstrap).
 *   2. Compares the new snapshot against the previous one.
 *   3. If the score dropped by >= DROP_THRESHOLD, fires a notification
 *      through NotificationDeliveryService (TRINITY.md §B sole sender)
 *      to every org_owner + co_owner in the workspace.
 *
 * Intended to run nightly (cron) or be triggered from the admin
 * dashboard. This service has no schedule of its own — the call site
 * decides cadence.
 */

import { db, pool } from '../db';
import { sql } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
import { computeComplianceScore } from './auditor/auditorAccessService';
import { NotificationDeliveryService } from './notificationDeliveryService';

const log = createLogger('complianceScoreMonitor');

/** Minimum drop (in points, 0-100 scale) that triggers owner alert. */
const DROP_THRESHOLD = 10;

let bootstrapped = false;
async function ensureTable(): Promise<void> {
  if (bootstrapped) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS compliance_score_snapshots (
        id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        workspace_id VARCHAR NOT NULL,
        score        INTEGER NOT NULL,
        components   JSONB,
        notes        JSONB,
        recorded_at  TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS compliance_score_snapshots_workspace_idx
        ON compliance_score_snapshots(workspace_id, recorded_at DESC);
    `);
    bootstrapped = true;
  } catch (err: any) {
    log.warn('[complianceScoreMonitor] bootstrap failed (non-fatal):', err?.message);
  }
}

export interface SnapshotResult {
  workspaceId: string;
  score: number;
  previousScore: number | null;
  delta: number | null;
  alerted: boolean;
}

/**
 * Run a compliance check against a single workspace. Returns the
 * snapshot result and whether an owner-level alert was fired.
 */
export async function snapshotAndMonitor(workspaceId: string): Promise<SnapshotResult> {
  await ensureTable();

  const current = await computeComplianceScore(workspaceId);

  // Insert this snapshot (CLAUDE §G — workspace-scoped; no cross-tenant writes).
  await db.execute(sql`
    INSERT INTO compliance_score_snapshots (workspace_id, score, components, notes)
    VALUES (${workspaceId}, ${current.score}, ${JSON.stringify(current.components)}::jsonb, ${JSON.stringify(current.notes)}::jsonb)
  `);

  // Previous snapshot — the one right before the row we just wrote.
  const prevRes = await db.execute(sql`
    SELECT score FROM compliance_score_snapshots
     WHERE workspace_id = ${workspaceId}
  ORDER BY recorded_at DESC
     LIMIT 1 OFFSET 1
  `);
  const previousScore: number | null =
    (prevRes as any).rows?.[0]?.score !== undefined
      ? Number((prevRes as any).rows[0].score)
      : null;

  const delta = previousScore === null ? null : current.score - previousScore;
  let alerted = false;

  if (delta !== null && delta <= -DROP_THRESHOLD) {
    alerted = await notifyOwners(workspaceId, current.score, previousScore!, current.notes);
  }

  return {
    workspaceId,
    score: current.score,
    previousScore,
    delta,
    alerted,
  };
}

/** List every org_owner / co_owner for the workspace and dispatch NDS. */
async function notifyOwners(
  workspaceId: string,
  currentScore: number,
  previousScore: number,
  notes: string[],
): Promise<boolean> {
  try {
    const ownerRows = await pool.query(
      `SELECT user_id FROM employees
         WHERE workspace_id = $1
           AND role IN ('org_owner', 'co_owner')
           AND (status IS NULL OR status = 'active')`,
      [workspaceId],
    );

    if (ownerRows.rowCount === 0) {
      log.warn(`[complianceScoreMonitor] No owner to notify for ${workspaceId}`);
      return false;
    }

    let delivered = 0;
    for (const row of ownerRows.rows) {
      const userId = row.user_id;
      if (!userId) continue;
      try {
        await NotificationDeliveryService.send({
          type: 'compliance_alert' as any,
          workspaceId,
          recipientUserId: userId,
          channel: 'in_app' as any,
          subject: `Compliance score dropped ${previousScore - currentScore} points`,
          body: {
            previousScore,
            currentScore,
            delta: currentScore - previousScore,
            notes,
            reason:
              'Automated compliance monitor detected a meaningful score drop. Review the Auditor Portal compliance panel for details.',
          },
          idempotencyKey: `compliance-drop-${workspaceId}-${new Date().toISOString().split('T')[0]}-${userId}`,
        });
        delivered++;
      } catch (err: any) {
        log.warn(`[complianceScoreMonitor] NDS send failed for ${userId}:`, err?.message);
      }
    }
    log.info(`[complianceScoreMonitor] Alerted ${delivered}/${ownerRows.rowCount} owners for ${workspaceId}`);
    return delivered > 0;
  } catch (err: any) {
    log.warn('[complianceScoreMonitor] notifyOwners failed:', err?.message);
    return false;
  }
}
