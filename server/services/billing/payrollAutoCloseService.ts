/**
 * Payroll Auto-Close Service
 *
 * GAP FIX 6: Automatically detect when a pay period ends, lock the time entries,
 *            generate a payroll draft, and notify the org_owner for approval.
 *
 * Called daily from automationTriggerService.runDailyBillingCycle().
 *
 * Logic:
 *  1. Determine each workspace's pay period type.
 *  2. If yesterday was the last day of a pay period:
 *     - Lock approved time entries for that period (set status = 'period_closed').
 *     - Trigger PayrollAutomationEngine to generate a draft payroll run.
 *     - Notify org_owner that payroll draft is ready for review.
 */

import { db } from '../../db';
import { workspaces, employees, timeEntries, payrollRuns, payStubs, payrollEntries, billingAuditLog } from '@shared/schema';
import { eq, and, gte, lte, inArray, isNull, sql } from 'drizzle-orm';
import { createNotification } from '../../notifications';
import { createLogger } from '../../lib/logger';
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  subDays, format, addDays,
} from 'date-fns';

const log = createLogger('PayrollAutoCloseService');

type PayrollCycle = 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly' | 'daily';

function didPeriodEndYesterday(cycle: PayrollCycle, referenceDate: Date): {
  ended: boolean;
  periodStart: Date;
  periodEnd: Date;
} {
  const yesterday = subDays(referenceDate, 1);
  yesterday.setHours(23, 59, 59, 999);
  const dayBefore = new Date(yesterday);
  dayBefore.setHours(0, 0, 0, 0);

  const yesterdayDay = yesterday.getDate();
  const lastDayOfMonth = endOfMonth(yesterday).getDate();
  const isEndOfWeekSunday = yesterday.getDay() === 0;
  const weekNum = Math.floor(
    startOfWeek(yesterday, { weekStartsOn: 0 }).getTime() / (7 * 24 * 60 * 60 * 1000),
  );

  switch (cycle) {
    case 'weekly': {
      if (!isEndOfWeekSunday) return { ended: false, periodStart: dayBefore, periodEnd: yesterday };
      const pStart = startOfWeek(yesterday, { weekStartsOn: 0 });
      pStart.setHours(0, 0, 0, 0);
      return { ended: true, periodStart: pStart, periodEnd: yesterday };
    }
    case 'bi-weekly': {
      const isOddWeek = weekNum % 2 === 1;
      if (!isEndOfWeekSunday || !isOddWeek) return { ended: false, periodStart: dayBefore, periodEnd: yesterday };
      const pStart = new Date(yesterday);
      pStart.setDate(pStart.getDate() - 13);
      pStart.setHours(0, 0, 0, 0);
      return { ended: true, periodStart: pStart, periodEnd: yesterday };
    }
    case 'monthly': {
      if (yesterdayDay !== lastDayOfMonth) return { ended: false, periodStart: dayBefore, periodEnd: yesterday };
      const pStart = startOfMonth(yesterday);
      pStart.setHours(0, 0, 0, 0);
      return { ended: true, periodStart: pStart, periodEnd: yesterday };
    }
    case 'semi-monthly': {
      const isHalfMonthEnd = yesterdayDay === 15 || yesterdayDay === lastDayOfMonth;
      if (!isHalfMonthEnd) return { ended: false, periodStart: dayBefore, periodEnd: yesterday };
      const pStart = yesterdayDay === 15
        ? new Date(yesterday.getFullYear(), yesterday.getMonth(), 1, 0, 0, 0, 0)
        : new Date(yesterday.getFullYear(), yesterday.getMonth(), 16, 0, 0, 0, 0);
      return { ended: true, periodStart: pStart, periodEnd: yesterday };
    }
    default:
      return { ended: false, periodStart: dayBefore, periodEnd: yesterday };
  }
}

export async function runPayrollAutoClose(): Promise<{
  workspacesProcessed: number;
  draftsGenerated: number;
}> {
  const now = new Date();
  let workspacesProcessed = 0;
  let draftsGenerated = 0;

  try {
    // RC3 (Phase 2): Read payrollCycle from workspaces.payrollCycle (dedicated column,
    // single source of truth). Removed billingSettingsBlob read — blob write eliminated.
    const activeWorkspaces = await db
      .select({
        id: workspaces.id,
        ownerId: workspaces.ownerId,
        companyName: workspaces.companyName,
        payrollCycle: workspaces.payrollCycle,
      })
      .from(workspaces)
      .where(eq(workspaces.subscriptionStatus, 'active'));

    for (const ws of activeWorkspaces) {
      try {
        const cycle: PayrollCycle = (ws.payrollCycle as PayrollCycle) || 'bi-weekly';
        const { ended, periodStart, periodEnd } = didPeriodEndYesterday(cycle, now);

        if (!ended) continue;

        workspacesProcessed++;

        log.info('Pay period ended — initiating auto-close', {
          workspaceId: ws.id,
          cycle,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        });

        const existingRun = await db
          .select({ id: payrollRuns.id })
          .from(payrollRuns)
          .where(
            and(
              eq(payrollRuns.workspaceId, ws.id),
              gte(payrollRuns.periodStart, periodStart),
              lte(payrollRuns.periodEnd, periodEnd),
            ),
          )
          .limit(1);

        if (existingRun.length > 0) {
          log.info('Payroll run already exists for this period — skipping', {
            workspaceId: ws.id,
            runId: existingRun[0].id,
          });
          continue;
        }

        const approvedEntries = await db
          .select({ id: timeEntries.id })
          .from(timeEntries)
          .where(
            and(
              eq(timeEntries.workspaceId, ws.id),
              eq(timeEntries.status, 'approved'),
              gte(timeEntries.clockIn, periodStart),
              lte(timeEntries.clockIn, periodEnd),
            ),
          );

        if (approvedEntries.length === 0) {
          log.info('No approved entries for period — skipping payroll auto-close', { workspaceId: ws.id });
          continue;
        }

        // Guard: do not auto-close if any time entries for the period are still pending
        // approval. Auto-closing now would orphan those hours into an off-cycle run.
        const pendingEntries = await db
          .select({ id: timeEntries.id })
          .from(timeEntries)
          .where(
            and(
              eq(timeEntries.workspaceId, ws.id),
              eq(timeEntries.status, 'pending'),
              gte(timeEntries.clockIn, periodStart),
              lte(timeEntries.clockIn, periodEnd),
            ),
          )
          .limit(1);

        if (pendingEntries.length > 0) {
          log.warn('Pending (unapproved) time entries exist for period — deferring payroll auto-close to avoid orphaned hours', {
            workspaceId: ws.id,
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
          });
          continue;
        }

        const { PayrollAutomationEngine } = await import('../payrollAutomation');
        const result = await PayrollAutomationEngine.processAutomatedPayroll(
          ws.id,
          ws.ownerId || 'system',
          periodStart,
          periodEnd,
        );

        if (result?.payrollRunId) {
          draftsGenerated++;
          log.info('Payroll draft auto-generated', { workspaceId: ws.id, runId: result.payrollRunId });

          // @ts-expect-error — TS migration: fix in refactoring sprint
          await db.insert(billingAuditLog).values({
            workspaceId: ws.id,
            eventType: 'payroll_period_auto_closed',
            actorType: 'system',
            idempotencyKey: `payroll-autoclose-${ws.id}-${result.payrollRunId}`,
            previousState: { status: 'open', entryCount: approvedEntries.length },
            newState: { status: 'draft_generated', payrollRunId: result.payrollRunId, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() },
          }).onConflictDoNothing().catch((err) => log.warn('[payrollAutoCloseService] Fire-and-forget failed:', err));

          if (ws.ownerId) {
            const periodLabel = `${format(periodStart, 'MMM d')} – ${format(periodEnd, 'MMM d, yyyy')}`;
            await createNotification({
              workspaceId: ws.id,
              userId: ws.ownerId,
              type: 'payroll_draft_ready',
              title: `Payroll draft ready for ${periodLabel}`,
              message: `The ${cycle} pay period ended ${format(periodEnd, 'MMM d')}. Trinity generated a payroll draft covering ${approvedEntries.length} time entr${approvedEntries.length === 1 ? 'y' : 'ies'}. Review and approve to begin processing.`,
              actionUrl: `/payroll/${result.payrollRunId}`,
              // @ts-expect-error — TS migration: fix in refactoring sprint
              relatedEntityType: 'payroll_run',
              relatedEntityId: result.payrollRunId,
              metadata: { periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(), entryCount: approvedEntries.length },
            }).catch((e: any) => log.warn('Failed to notify owner of payroll draft', { error: e.message }));
          }
        }
      } catch (wsErr: any) {
        log.warn('Payroll auto-close failed for workspace', { workspaceId: ws.id, error: wsErr.message });
      }
    }
  } catch (err: any) {
    log.error('Payroll auto-close scan failed', { error: (err instanceof Error ? err.message : String(err)) });
  }

  log.info('Payroll auto-close complete', { workspacesProcessed, draftsGenerated });
  return { workspacesProcessed, draftsGenerated };
}

// ============================================================================
// ORPHANED PAYROLL RUN DETECTION  (GAP-PAY-1 Fix)
// Detects payrollRuns stuck in 'processed' status with zero associated payStubs.
// Runs alongside the daily auto-close sweep.
// ============================================================================

export async function detectOrphanedPayrollRuns(): Promise<void> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  try {
    const processedRuns = await db
      .select({ id: payrollRuns.id, workspaceId: payrollRuns.workspaceId, ownerId: workspaces.ownerId })
      .from(payrollRuns)
      .innerJoin(workspaces, eq(payrollRuns.workspaceId, workspaces.id))
      .where(and(
        eq(payrollRuns.status as any, 'processed'),
        lte(payrollRuns.updatedAt as any, twoHoursAgo),
      ));

    for (const run of processedRuns) {
      const [stubCheck] = await db
        .select({ id: payStubs.id })
        .from(payStubs)
        .where(eq(payStubs.payrollRunId, run.id))
        .limit(1);

      if (!stubCheck) {
        // FIX [GAP-16 ORPHAN DETECTOR FALSE POSITIVE]: A processed run with zero stubs
        // could be either (a) truly orphaned — payroll entries exist but stub generation
        // failed mid-way, or (b) legitimately empty — the run was created for a period
        // with zero eligible employees and was marked processed correctly with no entries.
        //
        // Before notifying the owner, verify at least one payroll_entry exists for this run.
        // If no entries exist, the run is not orphaned — it was a valid empty run.
        const [entryCheck] = await db
          .select({ id: payrollEntries.id })
          .from(payrollEntries)
          .where(eq(payrollEntries.payrollRunId, run.id))
          .limit(1);

        if (!entryCheck) {
          log.info('Processed run has no stubs but also no entries — not orphaned, skipping', {
            runId: run.id,
            workspaceId: run.workspaceId,
          });
          continue;
        }

        log.warn('Orphaned payroll run detected — has payroll entries but no pay stubs', {
          runId: run.id,
          workspaceId: run.workspaceId,
        });

        if (run.ownerId) {
          await createNotification({
            workspaceId: run.workspaceId,
            userId: run.ownerId,
            type: 'payroll_alert',
            title: 'Payroll run requires attention',
            message: `A payroll run (${run.id}) is in processed status but has no pay stubs. This may indicate a partial failure during stub generation. Please review and regenerate stubs if needed.`,
            actionUrl: `/payroll/${run.id}`,
            // @ts-expect-error — TS migration: fix in refactoring sprint
            relatedEntityType: 'payroll_run',
            relatedEntityId: run.id,
            metadata: { issue: 'orphaned_processed_run_no_stubs' },
          }).catch((err) => log.warn('[payrollAutoCloseService] Fire-and-forget failed:', err));
        }
      }
    }
  } catch (err: any) {
    log.warn('Orphaned payroll run detection failed', { error: err.message });
  }
}
