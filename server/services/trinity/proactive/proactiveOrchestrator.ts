/**
 * Phase 24 — Proactive Orchestrator
 * ==================================
 * Single registration surface for the five proactive monitors:
 *
 *   1. preShiftIntelligence  — every 30 min, checks shifts 90–120 min out
 *   2. revenueAtRisk         — daily 7:00 UTC per workspace
 *   3. officerWellness       — every 10 min (send) + hourly (stale check)
 *   4. anomalyWatch          — hourly pattern sweep
 *   5. weeklyBrief           — Monday 08:00 UTC digest
 *
 * Registers crons on the shared node-cron scheduler already used by
 * `autonomousScheduler.ts`, and exposes Trinity-callable actions:
 *
 *   - trinity.run_pre_shift_intel
 *   - trinity.run_revenue_scan
 *   - trinity.send_weekly_brief
 *   - trinity.run_anomaly_watch
 *
 * Also re-exports the monitor entrypoints so callers can invoke them
 * directly (tests, ad-hoc chat commands, manual triggers).
 */

import cron from 'node-cron';
import { createLogger } from '../../../lib/logger';
import { helpaiOrchestrator } from '../../helpai/platformActionHub';
import type {
  ActionHandler,
  ActionRequest,
  ActionResult,
} from '../../helpai/platformActionHub';

import { runPreShiftIntelligenceSweep } from './preShiftIntelligence';
import { runRevenueAtRiskSweep, runRevenueAtRiskForWorkspace } from './revenueAtRisk';
import { runWellnessCheckSweep, runWellnessStaleSweep } from './officerWellness';
import { runAnomalyWatchSweep } from './anomalyWatch';
import { runWeeklyBriefSweep, sendWeeklyBriefForWorkspace } from './weeklyBrief';

const log = createLogger('proactiveOrchestrator');

export interface ProactiveCronHandle {
  jobName: string;
  schedule: string;
  description: string;
  run: () => Promise<unknown>;
}

// ─── Cron schedules ───────────────────────────────────────────────────────────

const SCHEDULES: ProactiveCronHandle[] = [
  {
    jobName: 'Trinity Pre-Shift Intelligence',
    schedule: '*/30 * * * *',
    description: 'Scans shifts starting in 90–120 min for reliability / licensing / coverage flags',
    run: runPreShiftIntelligenceSweep,
  },
  {
    jobName: 'Trinity Revenue-at-Risk Scan',
    schedule: '0 7 * * *',
    description: 'Daily 7 AM UTC scan for overdue invoices, expiring contracts, churn risk, unfilled shifts',
    run: runRevenueAtRiskSweep,
  },
  {
    jobName: 'Trinity Officer Wellness Check',
    schedule: '*/10 * * * *',
    description: 'Sends post-shift wellness SMS 30 min after clock-out for 8+ hour shifts',
    run: runWellnessCheckSweep,
  },
  {
    jobName: 'Trinity Officer Wellness Stale',
    schedule: '0 * * * *',
    description: 'Hourly sweep for wellness check-ins that have gone 2h without a reply',
    run: runWellnessStaleSweep,
  },
  {
    jobName: 'Trinity Anomaly Watch',
    schedule: '5 * * * *',
    description: 'Hourly pattern-detection sweep: GPS fraud, coverage gaps, incident patterns, ghost employees, billing anomalies',
    run: runAnomalyWatchSweep,
  },
  {
    jobName: 'Trinity Weekly Brief',
    schedule: '0 8 * * 1',
    description: 'Monday 08:00 UTC owner digest across all active workspaces',
    run: runWeeklyBriefSweep,
  },
];

/**
 * Scheduler-side registration. Called from `autonomousScheduler.ts`.
 * The adapter parameter lets the scheduler provide its own `trackJobExecution`
 * + `registerJobInfo` wrapper; we accept it as a loose interface so the
 * orchestrator doesn't have to import the scheduler (which would invert the
 * dependency direction).
 */
export interface SchedulerAdapter {
  registerJobInfo: (jobName: string, schedule: string, description: string, enabled: boolean) => void;
  trackJobExecution: (jobName: string, fn: () => Promise<any>) => Promise<void>;
}

export function registerProactiveMonitors(adapter: SchedulerAdapter): void {
  for (const job of SCHEDULES) {
    try {
      adapter.registerJobInfo(job.jobName, job.schedule, job.description, true);
      cron.schedule(job.schedule, () => {
        adapter.trackJobExecution(job.jobName, async () => {
          return await job.run();
        });
      });
      log.info(`[${job.jobName}] registered`, { schedule: job.schedule });
    } catch (err: unknown) {
      log.error(`[${job.jobName}] registration failed:`, err?.message);
    }
  }
}

/** Convenience: summary metadata for health/admin endpoints. */
export function getProactiveScheduleMetadata(): Array<{
  jobName: string;
  schedule: string;
  description: string;
}> {
  return SCHEDULES.map(({ jobName, schedule, description }) => ({
    jobName,
    schedule,
    description,
  }));
}

// ─── Trinity action handlers ──────────────────────────────────────────────────

function ok(actionId: string, message: string, data: any, start: number): ActionResult {
  return { success: true, actionId, message, data, executionTimeMs: Date.now() - start };
}

function fail(actionId: string, message: string, start: number): ActionResult {
  return { success: false, actionId, message, executionTimeMs: Date.now() - start };
}

const runPreShiftIntelAction: ActionHandler = {
  actionId: 'trinity.run_pre_shift_intel',
  name: 'Trinity Pre-Shift Intelligence Sweep',
  category: 'automation',
  description:
    'Scan shifts starting in 90–120 minutes for double-bookings, reliability flags, ' +
    'license expirations, and stale post orders. Notifies supervisors per severity.',
  requiredRoles: ['supervisor', 'manager', 'org_owner', 'root_admin'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    try {
      const result = await runPreShiftIntelligenceSweep();
      return ok(
        request.actionId,
        `Pre-shift intel: scanned=${result.scanned}, flagged=${result.flagged}, notified=${result.notified}`,
        result,
        start,
      );
    } catch (err: unknown) {
      return fail(request.actionId, `Pre-shift intel error: ${err.message}`, start);
    }
  },
};

const runRevenueScanAction: ActionHandler = {
  actionId: 'trinity.run_revenue_scan',
  name: 'Trinity Revenue-at-Risk Scan',
  category: 'automation',
  description:
    'Daily revenue scan: overdue invoices, contracts expiring within 60 days, ' +
    'churn-risk clients, shifts unfilled for 24+ hours. Summarizes the dollars at risk.',
  requiredRoles: ['manager', 'org_owner', 'root_admin'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    try {
      // If the caller's workspaceId is set, scan only that tenant. Otherwise
      // this is a platform-wide sweep (typically invoked from cron or a
      // platform-staff console).
      if (request.workspaceId) {
        const result = await runRevenueAtRiskForWorkspace(request.workspaceId);
        return ok(
          request.actionId,
          `Revenue scan: overdue=${result.overdueInvoicesFlagged}, contracts=${result.expiringContractsFlagged}, ` +
            `churn=${result.churnClientsFlagged}, unfilled=${result.unfilledShiftsFlagged}, ` +
            `$${result.totalAtRiskDollars.toFixed(2)} at risk`,
          result,
          start,
        );
      }
      const result = await runRevenueAtRiskSweep();
      return ok(
        request.actionId,
        `Revenue sweep: workspaces=${result.workspacesScanned}, $${result.totalAtRiskDollars.toFixed(2)} at risk`,
        result,
        start,
      );
    } catch (err: unknown) {
      return fail(request.actionId, `Revenue scan error: ${err.message}`, start);
    }
  },
};

const sendWeeklyBriefAction: ActionHandler = {
  actionId: 'trinity.send_weekly_brief',
  name: 'Trinity Weekly Brief',
  category: 'automation',
  description:
    'Generate and deliver the Monday morning owner digest: uncovered shifts, expiring ' +
    'contracts/licenses, on-time rate trend, outstanding invoices.',
  requiredRoles: ['org_owner', 'org_admin', 'co_owner', 'manager', 'root_admin'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    try {
      if (request.workspaceId) {
        const delivered = await sendWeeklyBriefForWorkspace(request.workspaceId, 'manual');
        return ok(
          request.actionId,
          `Weekly brief delivered to ${delivered} owner recipient(s).`,
          { delivered, workspaceId: request.workspaceId },
          start,
        );
      }
      const result = await runWeeklyBriefSweep();
      return ok(
        request.actionId,
        `Weekly briefs: workspaces=${result.workspacesBriefed}, deliveries=${result.deliveries}`,
        result,
        start,
      );
    } catch (err: unknown) {
      return fail(request.actionId, `Weekly brief error: ${err.message}`, start);
    }
  },
};

const runAnomalyWatchAction: ActionHandler = {
  actionId: 'trinity.run_anomaly_watch',
  name: 'Trinity Anomaly Watch',
  category: 'automation',
  description:
    'Scan active tenants for GPS fraud, coverage gaps, repeated incidents at one site, ' +
    'ghost employees, and billing anomalies. Routes each anomaly by severity.',
  requiredRoles: ['manager', 'org_owner', 'root_admin'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    try {
      const result = await runAnomalyWatchSweep();
      return ok(
        request.actionId,
        `Anomaly sweep: workspaces=${result.workspacesScanned}, found=${result.anomaliesFound}, notified=${result.anomaliesNotified}`,
        result,
        start,
      );
    } catch (err: unknown) {
      return fail(request.actionId, `Anomaly watch error: ${err.message}`, start);
    }
  },
};

export function registerProactiveActions(): void {
  helpaiOrchestrator.registerAction(runPreShiftIntelAction);
  helpaiOrchestrator.registerAction(runRevenueScanAction);
  helpaiOrchestrator.registerAction(sendWeeklyBriefAction);
  helpaiOrchestrator.registerAction(runAnomalyWatchAction);
  log.info(
    '[ProactiveMonitors] Registered 4 Phase 24 action handlers: ' +
      'trinity.run_pre_shift_intel, trinity.run_revenue_scan, ' +
      'trinity.send_weekly_brief, trinity.run_anomaly_watch',
  );
}

export {
  runPreShiftIntelligenceSweep,
  runRevenueAtRiskSweep,
  runRevenueAtRiskForWorkspace,
  runWellnessCheckSweep,
  runWellnessStaleSweep,
  runAnomalyWatchSweep,
  runWeeklyBriefSweep,
  sendWeeklyBriefForWorkspace,
};
