/**
 * Weekly Report Cron Service
 *
 * Runs every Sunday at approximately 8am UTC.
 * Gets all active workspaces, generates a weekly timesheet report, and persists
 * a snapshot row to auto_reports so workspace owners can review it in the UI.
 *
 * Uses a daily timer that checks if today is Sunday, matching the pattern
 * already used for month_end checks in automationTriggerService.
 */

import { db, pool } from '../db';
import { autoReports, workspaces, workspaceMembers } from '@shared/schema';
import { automationOrchestration } from './orchestration/automationOrchestration';
import { typedPool } from '../lib/typedSql';
import { notInArray, inArray, asc, and, eq } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
const log = createLogger('weeklyReportCronService');


let _cronTimer: ReturnType<typeof setInterval> | null = null;

interface WorkspaceOwner {
  workspaceId: string;
  userId: string;
}

async function getActiveWorkspacesWithOwner(): Promise<WorkspaceOwner[]> {
  try {
    // Converted to Drizzle ORM: NOT IN → notInArray()
    const resultRows = await db.select({
      workspaceId: workspaces.id,
      userId: workspaceMembers.userId,
    })
      .from(workspaces)
      .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(
        notInArray(workspaces.subscriptionStatus, ['cancelled', 'terminated']),
        inArray(workspaceMembers.role, ['org_owner', 'co_owner'])
      ))
      .orderBy(asc(workspaceMembers.createdAt));

    // De-dupe: one row per workspace (first owner)
    const seen = new Set<string>();
    const out: WorkspaceOwner[] = [];
    for (const r of resultRows) {
      if (!seen.has(r.workspaceId)) {
        seen.add(r.workspaceId);
        out.push({ workspaceId: r.workspaceId, userId: r.userId });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function buildPeriodKey(weekOf: Date): string {
  const y = weekOf.getUTCFullYear();
  // ISO week number
  const startOfYear = new Date(Date.UTC(y, 0, 1));
  const dayOfYear = Math.floor((weekOf.getTime() - startOfYear.getTime()) / 86_400_000) + 1;
  const week = Math.ceil(dayOfYear / 7).toString().padStart(2, '0');
  return `week_${y}_${week}`;
}

export async function runSundayWeeklyReports(): Promise<void> {
  const today = new Date();
  if (today.getUTCDay() !== 0) return; // 0 = Sunday

  await automationOrchestration.executeAutomation(
    {
      domain: 'reporting',
      automationName: 'sunday-weekly-reports',
      automationType: 'cron_job',
      triggeredBy: 'cron',
      billable: false,
    },
    async (ctx) => {
      log.info('[WeeklyReportCron] Sunday detected — generating weekly reports for all active workspaces...');

      const { getWeeklyReport } = await import('./timesheetReportService');
      const workspaces = await getActiveWorkspacesWithOwner();

      let success = 0;
      let failed = 0;

      for (const { workspaceId, userId } of workspaces) {
        try {
          const weekOf = new Date();
          weekOf.setUTCDate(weekOf.getUTCDate() - 7); // Last full week

          const report = await getWeeklyReport(workspaceId, weekOf);
          const period = buildPeriodKey(weekOf);

          // Build a concise text summary from the report data
          const totalHours = (report.entries ?? []).reduce((s: number, e: any) => s + (e.totalHours || 0), 0);
          const totalEmployees = new Set((report.entries ?? []).map((e: any) => e.employeeId)).size;
          const otHours = (report.entries ?? []).reduce((s: number, e: any) => s + (e.overtimeHours || 0), 0);
          const summary = `Weekly report for period ${period}: ${totalEmployees} employee(s) worked a total of ${totalHours.toFixed(1)} hours (${otHours.toFixed(1)} OT).`;

          // Upsert: avoid duplicate rows if cron somehow re-fires on the same Sunday
          const existingRows = await db.select({ id: autoReports.id })
            .from(autoReports)
            .where(
              and(
                eq(autoReports.workspaceId, workspaceId),
                eq(autoReports.period, period),
                eq(autoReports.reportType, 'weekly_status'),
              )
            );

          if (existingRows.length === 0) {
            await db.insert(autoReports).values({
              workspaceId,
              userId,
              reportType: 'weekly_status',
              period,
              summary,
              hoursWorked: totalHours.toFixed(2),
              tasksCompleted: (report.entries ?? []).length,
              status: 'draft',
            });
          }

          success++;
        } catch (err: unknown) {
          log.error(`[WeeklyReportCron] Failed for workspace ${workspaceId}:`, err?.message);
          failed++;
        }
      }

      log.info(`[WeeklyReportCron] Weekly reports done — ${success} succeeded, ${failed} failed`);
      return { success, failed };
    }
  );
}

export function startWeeklyReportCron(): void {
  if (_cronTimer) return;

  // Check once per hour whether it's Sunday. Fires the full report run once per Sunday.
  // Idempotent: the daily check pattern prevents double-firing within the same day.
  const HOUR_MS = 60 * 60 * 1000;
  let lastRanDate: string | null = null;
  let isRunning = false;

  _cronTimer = setInterval(async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const today = new Date();
      if (today.getUTCDay() !== 0) return;

      const dateKey = today.toISOString().slice(0, 10);
      if (lastRanDate === dateKey) return; // Already ran this Sunday

      lastRanDate = dateKey;
      await runSundayWeeklyReports();
    } catch (err) {
      log.error('[WeeklyReportCron] Uncaught error in Sunday run:', err);
    } finally {
      isRunning = false;
    }
  }, HOUR_MS);

  log.info('[WeeklyReportCron] Sunday weekly report cron scheduled (hourly check, fires Sundays)');
}

export function stopWeeklyReportCron(): void {
  if (_cronTimer) {
    clearInterval(_cronTimer);
    _cronTimer = null;
  }
}
