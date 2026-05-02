/**
 * Scoring Scheduler
 * =================
 * Periodic jobs for the cross-tenant score system:
 *   - Nightly officer score recompute (every globalOfficer with active employment)
 *   - First-of-month Officer of the Month selection
 *   - First-of-year Officer of the Year selection
 *   - Monthly tenant score snapshot
 *
 * Trinity Conscience already gates the closing-score path; these jobs only
 * touch live (non-closing) scores plus the honor-roll selection table.
 */

import cron from 'node-cron';
import { db } from '../../db';
import { eq, and, isNotNull } from 'drizzle-orm';
import { employees, globalOfficers, workspaces } from '@shared/schema';
import { recomputeAndPersist } from './scoreEngineService';
import { snapshotTenantScore } from './tenantScoreService';
import { selectHonorRollPick } from './honorRollService';
import { createLogger } from '../../lib/logger';

const log = createLogger('scoringScheduler');

let started = false;

export function startScoringScheduler(): void {
  if (started) return;
  started = true;

  // Nightly officer score recompute @ 02:30 UTC.
  // Iterates every active employee with a linked globalOfficerId.
  cron.schedule('30 2 * * *', () => {
    runOfficerRecompute().catch((err: Error) => {
      log.error('[scoringScheduler] nightly officer recompute failed:', err);
    });
  });

  // Monthly tenant score snapshot — first of month @ 03:00 UTC.
  cron.schedule('0 3 1 * *', () => {
    runTenantScoreSnapshot().catch((err: Error) => {
      log.error('[scoringScheduler] monthly tenant snapshot failed:', err);
    });
  });

  // Officer of the Month — first of month @ 04:00 UTC.
  cron.schedule('0 4 1 * *', () => {
    selectHonorRollPick('officer_of_month').catch((err: Error) => {
      log.error('[scoringScheduler] OoM selection failed:', err);
    });
  });

  // Officer of the Year — January 2nd @ 04:30 UTC.
  cron.schedule('30 4 2 1 *', () => {
    selectHonorRollPick('officer_of_year').catch((err: Error) => {
      log.error('[scoringScheduler] OoY selection failed:', err);
    });
  });

  log.info('[scoringScheduler] cron jobs registered');
}

async function runOfficerRecompute(): Promise<void> {
  const rows = await db
    .select({
      employeeId: employees.id,
      globalOfficerId: employees.globalOfficerId,
      workspaceId: employees.workspaceId,
    })
    .from(employees)
    .where(and(eq(employees.isActive, true), isNotNull(employees.globalOfficerId)));

  log.info(`[scoringScheduler] recomputing scores for ${rows.length} active officers`);
  let ok = 0, failed = 0;
  for (const r of rows) {
    if (!r.globalOfficerId) continue;
    try {
      await recomputeAndPersist(r.employeeId, r.globalOfficerId, r.workspaceId);
      ok++;
    } catch (err) {
      failed++;
      log.warn(`[scoringScheduler] recompute failed for ${r.employeeId}:`, (err as Error).message);
    }
  }
  log.info(`[scoringScheduler] recompute complete: ok=${ok} failed=${failed}`);
}

async function runTenantScoreSnapshot(): Promise<void> {
  const rows = await db
    .select({ id: workspaces.id })
    .from(workspaces);

  log.info(`[scoringScheduler] snapshotting tenant scores for ${rows.length} workspaces`);
  for (const w of rows) {
    try {
      await snapshotTenantScore(w.id, 'monthly');
    } catch (err) {
      log.warn(`[scoringScheduler] tenant snapshot failed for ${w.id}:`, (err as Error).message);
    }
  }
}
