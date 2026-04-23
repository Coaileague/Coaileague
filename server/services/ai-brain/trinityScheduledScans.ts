/**
 * TRINITY SCHEDULED SCANS — Multi-org Automated Intelligence
 * ===========================================================
 * Runs the TrinityProactiveScanner for ALL active organizations on
 * daily / weekly / monthly cadences — no human trigger required.
 *
 * Cadences:
 *  - Daily  : 06:00 UTC — coverage check, missed punches, compliance expiry
 *  - Weekly : Monday 07:00 UTC — OT risk, next-week completeness, SLA check
 *  - Monthly: 25th 08:00 UTC — payroll, invoices, executive summary
 */

import { db } from '../../db';
import { workspaces, workspaceMembers } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createNotification } from '../notificationService';
import { createLogger } from '../../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../billing/billingConstants';
const log = createLogger('TrinityScheduledScans');

const SCAN_LABEL = '[ScheduledScans]';
const DAILY_HOUR_UTC = 6;
const WEEKLY_DAY = 1;
const WEEKLY_HOUR_UTC = 7;
const MONTHLY_DATE = 25;
const MONTHLY_HOUR_UTC = 8;

interface ScanStatus {
  running: boolean;
  lastDailyScan: Date | null;
  lastWeeklyScan: Date | null;
  lastMonthlyScan: Date | null;
}

class TrinityScheduledScansService {
  private dailyTimer: ReturnType<typeof setTimeout> | null = null;
  private weeklyTimer: ReturnType<typeof setTimeout> | null = null;
  private monthlyTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private lastDailyScan: Date | null = null;
  private lastWeeklyScan: Date | null = null;
  private lastMonthlyScan: Date | null = null;

  start(): void {
    if (this.running) {
      log.info(`${SCAN_LABEL} Already running — skipping start`);
      return;
    }
    this.running = true;
    log.info(`${SCAN_LABEL} Initialized — scheduling multi-org scans`);
    this.scheduleDailyScans();
    this.scheduleWeeklyScans();
    this.scheduleMonthlyScans();
  }

  stop(): void {
    if (this.dailyTimer) clearTimeout(this.dailyTimer);
    if (this.weeklyTimer) clearTimeout(this.weeklyTimer);
    if (this.monthlyTimer) clearTimeout(this.monthlyTimer);
    this.dailyTimer = null;
    this.weeklyTimer = null;
    this.monthlyTimer = null;
    this.running = false;
    log.info(`${SCAN_LABEL} Stopped`);
  }

  getStatus(): ScanStatus {
    return {
      running: this.running,
      lastDailyScan: this.lastDailyScan,
      lastWeeklyScan: this.lastWeeklyScan,
      lastMonthlyScan: this.lastMonthlyScan,
    };
  }

  // ─── Daily: every day at DAILY_HOUR_UTC ────────────────────────────────────

  private scheduleDailyScans(): void {
    const msUntilNext = msUntilNextHour(DAILY_HOUR_UTC);
    log.info(`${SCAN_LABEL} Daily scan scheduled in ${Math.round(msUntilNext / 60000)} min`);
    this.dailyTimer = setTimeout(async () => {
      await this.runDailyForAllOrgs();
      // Reschedule every 24h after first run
      this.dailyTimer = setInterval(() => this.runDailyForAllOrgs(), 24 * 60 * 60 * 1000) as any;
    }, msUntilNext);
  }

  private isDailyRunning = false;
  private isWeeklyRunning = false;
  private isMonthlyRunning = false;

  private async runDailyForAllOrgs(): Promise<void> {
    if (this.isDailyRunning) {
      log.warn(`${SCAN_LABEL} Daily scan already in progress — skipping this tick to prevent execution storm`);
      return;
    }
    this.isDailyRunning = true;
    try {
      const workspaceList = await getActiveWorkspaces();
      log.info(`${SCAN_LABEL} Daily scan starting for ${workspaceList.length} workspace(s)`);
      for (const ws of workspaceList) {
        try {
          const { trinityProactiveScanner } = await import('./trinityProactiveScanner');
          const result = await trinityProactiveScanner.runDailyScan(ws.id);
          log.info(`${SCAN_LABEL} Daily scan done [${ws.id}]: ${result.alerts.length} alerts, ${result.escalations?.length ?? 0} escalations`);
        } catch (err: any) {
          log.error(`${SCAN_LABEL} Daily scan failed for workspace ${ws.id}: ${(err instanceof Error ? err.message : String(err))}`);
          await notifyScanFailure(ws.id, 'Daily', (err instanceof Error ? err.message : String(err)));
        }
      }
      this.lastDailyScan = new Date();
    } finally {
      this.isDailyRunning = false;
    }
  }

  // ─── Weekly: every Monday at WEEKLY_HOUR_UTC ───────────────────────────────

  private scheduleWeeklyScans(): void {
    const msUntilNext = msUntilNextWeekday(WEEKLY_DAY, WEEKLY_HOUR_UTC);
    log.info(`${SCAN_LABEL} Weekly scan scheduled in ${Math.round(msUntilNext / 3600000)} hrs`);
    this.weeklyTimer = setTimeout(async () => {
      await this.runWeeklyForAllOrgs();
      this.weeklyTimer = setInterval(() => this.runWeeklyForAllOrgs(), 7 * 24 * 60 * 60 * 1000) as any;
    }, msUntilNext);
  }

  private async runWeeklyForAllOrgs(): Promise<void> {
    if (this.isWeeklyRunning) {
      log.warn(`${SCAN_LABEL} Weekly scan already in progress — skipping this tick to prevent execution storm`);
      return;
    }
    this.isWeeklyRunning = true;
    try {
      const workspaceList = await getActiveWorkspaces();
      log.info(`${SCAN_LABEL} Weekly scan starting for ${workspaceList.length} workspace(s)`);
      for (const ws of workspaceList) {
        try {
          const { trinityProactiveScanner } = await import('./trinityProactiveScanner');
          await trinityProactiveScanner.runWeeklyScan(ws.id);
          log.info(`${SCAN_LABEL} Weekly scan done [${ws.id}]`);
        } catch (err: any) {
          log.error(`${SCAN_LABEL} Weekly scan failed for workspace ${ws.id}: ${(err instanceof Error ? err.message : String(err))}`);
          await notifyScanFailure(ws.id, 'Weekly', (err instanceof Error ? err.message : String(err)));
        }
      }
      this.lastWeeklyScan = new Date();
    } finally {
      this.isWeeklyRunning = false;
    }
  }

  // ─── Monthly: 25th of each month at MONTHLY_HOUR_UTC ──────────────────────

  private scheduleMonthlyScans(): void {
    const msUntilNext = msUntilNextMonthlyDate(MONTHLY_DATE, MONTHLY_HOUR_UTC);
    log.info(`${SCAN_LABEL} Monthly scan scheduled in ${Math.round(msUntilNext / 3600000)} hrs`);
    // Use safeSetTimeout to avoid Node's 32-bit integer overflow for delays > 24.8 days
    this.monthlyTimer = safeSetTimeout(async () => {
      await this.runMonthlyForAllOrgs();
      // Reschedule one month later
      const reschedule = () => {
        const delay = msUntilNextMonthlyDate(MONTHLY_DATE, MONTHLY_HOUR_UTC);
        this.monthlyTimer = safeSetTimeout(async () => {
          await this.runMonthlyForAllOrgs();
          reschedule();
        }, delay) as any;
      };
      reschedule();
    }, msUntilNext);
  }

  private async runMonthlyForAllOrgs(): Promise<void> {
    if (this.isMonthlyRunning) {
      log.warn(`${SCAN_LABEL} Monthly cycle already in progress — skipping this tick to prevent execution storm`);
      return;
    }
    this.isMonthlyRunning = true;
    try {
      const workspaceList = await getActiveWorkspaces();
      log.info(`${SCAN_LABEL} Monthly cycle starting for ${workspaceList.length} workspace(s)`);
      for (const ws of workspaceList) {
        try {
          const { trinityProactiveScanner } = await import('./trinityProactiveScanner');
          await trinityProactiveScanner.runMonthlyCycle(ws.id);
          log.info(`${SCAN_LABEL} Monthly cycle done [${ws.id}]`);
        } catch (err: any) {
          log.error(`${SCAN_LABEL} Monthly cycle failed for workspace ${ws.id}: ${(err instanceof Error ? err.message : String(err))}`);
          await notifyScanFailure(ws.id, 'Monthly', (err instanceof Error ? err.message : String(err)));
        }
      }
      this.lastMonthlyScan = new Date();
    } finally {
      this.isMonthlyRunning = false;
    }
  }
}

// ─── Scan failure notifier — delivers inbox alert to org_owner / co_owner ─────

async function notifyScanFailure(workspaceId: string, scanType: 'Daily' | 'Weekly' | 'Monthly', errorMsg: string): Promise<void> {
  try {
    const owners = await db
      .select({ userId: workspaceMembers.userId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId));
    const ownerIds = owners
      .filter((m) => ['org_owner', 'co_owner'].includes(m.role ?? ''))
      .map((m) => m.userId);
    if (ownerIds.length === 0) return;
    const shortError = errorMsg?.slice(0, 200) ?? 'Unknown error';
    await Promise.all(ownerIds.map((userId: string) =>
      createNotification({
        workspaceId,
        userId,
        type: 'scheduler_job_failed',
        title: `Trinity ${scanType} Scan Failed`,
        message: `The scheduled ${scanType.toLowerCase()} Trinity intelligence scan did not complete for your organization. Error: ${shortError}`,
        idempotencyKey: `scheduler_job_failed-${Date.now()}-`
      }).catch((notifErr: any) => {
        log.error(`${SCAN_LABEL} Failed to send scan failure notification to ${userId}: ${notifErr.message}`);
      })
    ));
  } catch (err: any) {
    log.error(`${SCAN_LABEL} notifyScanFailure helper error: ${(err instanceof Error ? err.message : String(err))}`);
  }
}

// ─── Scheduling helpers ────────────────────────────────────────────────────────

async function getActiveWorkspaces(): Promise<Array<{ id: string }>> {
  try {
    const all = await db
      .select({ id: workspaces.id })
      .from(workspaces);
    // Exclude the internal system workspace from tenant scans
    return all.filter(w => w.id !== 'system' && w.id !== PLATFORM_WORKSPACE_ID);
  } catch (err: any) {
    log.error(`${SCAN_LABEL} Failed to fetch active workspaces: ${(err instanceof Error ? err.message : String(err))}`);
    return [];
  }
}

function msUntilNextHour(targetHourUTC: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(targetHourUTC, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

function msUntilNextWeekday(targetDay: number, targetHourUTC: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(targetHourUTC, 0, 0, 0);
  const daysUntil = (targetDay - now.getUTCDay() + 7) % 7;
  next.setUTCDate(next.getUTCDate() + (daysUntil === 0 && next <= now ? 7 : daysUntil));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 7);
  return next.getTime() - now.getTime();
}

function msUntilNextMonthlyDate(targetDate: number, targetHourUTC: number): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), targetDate, targetHourUTC, 0, 0));
  if (next <= now) next.setUTCMonth(next.getUTCMonth() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Node's setTimeout has a 32-bit signed integer limit (~24.8 days).
 * For delays longer than that (e.g., monthly schedules) we must chain
 * multiple shorter timeouts to avoid the overflow which collapses to 1ms
 * and causes the handler to fire in an infinite loop.
 */
const MAX_SAFE_TIMEOUT_MS = 2_147_483_647; // 2^31 - 1

function safeSetTimeout(fn: () => void, delayMs: number): ReturnType<typeof setTimeout> {
  if (delayMs <= MAX_SAFE_TIMEOUT_MS) {
    return setTimeout(fn, delayMs);
  }
  // Chain: wait MAX_SAFE_TIMEOUT_MS, then schedule remainder
  return setTimeout(() => {
    safeSetTimeout(fn, delayMs - MAX_SAFE_TIMEOUT_MS);
  }, MAX_SAFE_TIMEOUT_MS) as ReturnType<typeof setTimeout>;
}

export const trinityScheduledScans = new TrinityScheduledScansService();
