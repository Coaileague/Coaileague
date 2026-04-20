/**
 * STARTUP RECOVERY (TRINITY.md Section R, Law P4)
 *
 * Runs once at boot, after ensureRequiredTables() / ensureCriticalConstraints()
 * / ensureWorkspaceIndexes() so all required tables exist. Reconciles
 * persistent state for in-memory primitives that did not survive the
 * previous server's death:
 *
 *   - clears stale `payroll_run_locks` whose TTL has expired so a crashed
 *     payroll run cannot wedge the workspace forever
 *   - marks any `trinity_goal_executions` row still in `running` as
 *     `interrupted` (the executor that owned it is gone)
 *   - marks any `supervisor_handoffs` row still `active` as `interrupted`
 *
 * All steps are non-fatal — a recovery failure is logged but never blocks
 * the HTTP server from accepting traffic.
 */

import { db } from '../db';
import {
  payrollRunLocks,
  trinityGoalExecutions,
  supervisorHandoffs,
} from '@shared/schema';
import { and, eq, lte } from 'drizzle-orm';
import { createLogger } from './logger';

const log = createLogger('StartupRecovery');

export async function runStartupRecovery(): Promise<void> {
  log.info('[Recovery] Running startup recovery checks...');

  // 1. Clear stale payroll locks (expired)
  try {
    const stale = await db.delete(payrollRunLocks)
      .where(lte(payrollRunLocks.expiresAt, new Date()))
      .returning({ workspaceId: payrollRunLocks.workspaceId });
    if (stale.length > 0) {
      log.warn(`[Recovery] Cleared ${stale.length} stale payroll lock(s)`);
    }
  } catch (err: any) {
    log.warn('[Recovery] Stale payroll lock cleanup failed (non-fatal):', err?.message);
  }

  // 2. Mark interrupted goal executions
  try {
    const interrupted = await db.update(trinityGoalExecutions)
      .set({
        status: 'interrupted',
        completedAt: new Date(),
        errorMessage: 'Server restart during execution',
      })
      .where(eq(trinityGoalExecutions.status, 'running'))
      .returning({ id: trinityGoalExecutions.id });
    if (interrupted.length > 0) {
      log.warn(`[Recovery] Marked ${interrupted.length} goal execution(s) as interrupted`);
    }
  } catch (err: any) {
    log.warn('[Recovery] Goal interruption marker failed (non-fatal):', err?.message);
  }

  // 3. Mark interrupted supervisor handoffs
  try {
    const interrupted = await db.update(supervisorHandoffs)
      .set({ status: 'interrupted', resolvedAt: new Date() })
      .where(eq(supervisorHandoffs.status, 'active'))
      .returning({ id: supervisorHandoffs.id });
    if (interrupted.length > 0) {
      log.warn(`[Recovery] Marked ${interrupted.length} supervisor handoff(s) as interrupted`);
    }
  } catch (err: any) {
    log.warn('[Recovery] Handoff interruption marker failed (non-fatal):', err?.message);
  }

  log.info('[Recovery] Startup recovery complete');
}

/**
 * Lightweight startup check for object storage configuration.
 * Logged at WARN if missing — file uploads (chat photos, DAR PDFs,
 * employee documents) will fail without it. Doesn't throw — degraded
 * boot is preferable to no boot, and tests can run without object storage.
 */
export function checkObjectStorageConfig(): void {
  const bucket = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID
    || process.env.PUBLIC_OBJECT_SEARCH_PATHS
    || process.env.PRIVATE_OBJECT_DIR;
  if (!bucket) {
    log.warn(
      '[Recovery] ⚠️  DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set — file uploads ' +
      '(photos, documents, PDFs) will fail. Configure in Railway env vars.',
    );
  } else {
    log.info(`[Recovery] ✅ Object storage configured: ${bucket}`);
  }
}
