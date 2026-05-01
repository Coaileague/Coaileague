/**
 * Phase 20 — Trinity Workflow Orchestrator
 * =========================================
 * Master registrar + Trinity-callable action surface for the six Phase 20
 * autonomous workflows:
 *
 *   1. calloff_coverage          — officer calloff → find replacement
 *   2. missed_clockin            — shift started, officer not clocked in
 *   3. shift_reminder            — 4hr / 1hr reminder cadence
 *   4. invoice_lifecycle         — timesheet approved → invoice + send
 *   5. compliance_expiry_monitor — daily cert/license expiry sweep
 *   6. payroll_anomaly_response  — flag/block payroll runs with anomalies
 *
 * Registers each workflow as an `ActionHandler` so Trinity can invoke them
 * from chat/voice/SMS (e.g. "run compliance scan", "cover this calloff").
 * Invoked from the actionRegistry post-init block alongside the other
 * Trinity action modules.
 */

import { helpaiOrchestrator } from '../../helpai/platformActionHub';
import type {
  ActionHandler,
  ActionRequest,
  ActionResult,
} from '../../helpai/platformActionHub';
import { createLogger } from '../../../lib/logger';

import {
  executeCalloffCoverageWorkflow,
  scanStaleCalloffWorkflows,
  type CalloffTriggerSource,
} from './calloffCoverageWorkflow';
import { runMissedClockInSweep } from './missedClockInWorkflow';
import { runShiftReminderSweep } from './shiftReminderWorkflow';
import { executeInvoiceLifecycleWorkflow } from './invoiceLifecycleWorkflow';
import { runComplianceMonitorWorkflow } from './complianceMonitorWorkflow';
import {
  executePayrollAnomalyWorkflow,
  runPayrollAnomalyScan,
} from './payrollAnomalyWorkflow';

const log = createLogger('workflowOrchestrator');

function ok(actionId: string, message: string, data: any, start: number): ActionResult {
  return {
    success: true,
    actionId,
    message,
    data,
    executionTimeMs: Date.now() - start,
  };
}

function fail(actionId: string, message: string, start: number): ActionResult {
  return {
    success: false,
    actionId,
    message,
    executionTimeMs: Date.now() - start,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Action: trinity.execute_calloff_coverage
// ──────────────────────────────────────────────────────────────────────────────

const executeCalloffAction: ActionHandler = {
  actionId: 'trinity.execute_calloff_coverage',
  name: 'Trinity Calloff Coverage Workflow',
  category: 'automation',
  description:
    'Run the full calloff-coverage workflow: mark the officer\'s next shift as calloff, ' +
    'text qualified replacements, notify supervisors, and escalate if uncovered past SLA.',
  requiredRoles: ['supervisor', 'manager', 'org_owner'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    try {
      const { employeeId, shiftId, reason, triggerSource } = request.payload || {};
      const workspaceId = request.workspaceId;
      if (!workspaceId) return fail(request.actionId, 'workspaceId required', start);
      if (!employeeId) return fail(request.actionId, 'employeeId required', start);

      const result = await executeCalloffCoverageWorkflow({
        workspaceId,
        employeeId,
        shiftId,
        reason,
        triggerSource: (triggerSource as CalloffTriggerSource) ?? 'trinity_action',
        userId: request.userId,
      });
      return result.success
        ? ok(request.actionId, result.summary, result, start)
        : fail(request.actionId, result.summary, start);
    } catch (err: unknown) {
      return fail(request.actionId, `Calloff workflow error: ${err.message}`, start);
    }
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Action: trinity.scan_stale_calloffs — escalation sweep
// ──────────────────────────────────────────────────────────────────────────────

const scanStaleCalloffsAction: ActionHandler = {
  actionId: 'trinity.scan_stale_calloffs',
  name: 'Trinity Stale Calloff Escalation Sweep',
  category: 'automation',
  description:
    'Scan calloff workflows past the 15-minute SLA that are still unfilled, ' +
    'and escalate each to the on-call supervisor.',
  requiredRoles: ['manager', 'org_owner', 'root_admin'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    try {
      const result = await scanStaleCalloffWorkflows();
      return ok(
        request.actionId,
        `Scanned ${result.scanned} stale calloffs, escalated ${result.escalated}`,
        result,
        start,
      );
    } catch (err: unknown) {
      return fail(request.actionId, `Stale calloff sweep error: ${err.message}`, start);
    }
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Action: trinity.missed_clockin_check
// ──────────────────────────────────────────────────────────────────────────────

const missedClockInAction: ActionHandler = {
  actionId: 'trinity.missed_clockin_check',
  name: 'Trinity Missed Clock-In Sweep',
  category: 'automation',
  description:
    'Detect officers whose shift started >15 min ago without a clock-in, ' +
    'text them, call them if unresponsive, and escalate to supervisor.',
  requiredRoles: ['manager', 'org_owner', 'root_admin', 'supervisor'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    try {
      const result = await runMissedClockInSweep();
      const summary =
        `Missed clock-in sweep: scanned=${result.scanned}, sms=${result.smsSent}, ` +
        `calls=${result.callsPlaced}, escalated=${result.escalated}, resolved=${result.resolved}`;
      return ok(request.actionId, summary, result, start);
    } catch (err: unknown) {
      return fail(request.actionId, `Missed clock-in sweep error: ${err.message}`, start);
    }
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Action: trinity.send_shift_reminders
// ──────────────────────────────────────────────────────────────────────────────

const sendShiftRemindersAction: ActionHandler = {
  actionId: 'trinity.send_shift_reminders',
  name: 'Trinity Shift Reminder Sweep',
  category: 'automation',
  description:
    'Send 4-hour and 1-hour reminder texts to officers for shifts starting ' +
    'in the next reminder window. Idempotent — no duplicate reminders.',
  requiredRoles: ['supervisor', 'manager', 'org_owner', 'root_admin'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    try {
      const result = await runShiftReminderSweep();
      const summary = `Shift reminders: 4h=${result.fourHourSent}, 1h=${result.oneHourSent} (scanned=${result.scanned})`;
      return ok(request.actionId, summary, result, start);
    } catch (err: unknown) {
      return fail(request.actionId, `Shift reminder sweep error: ${err.message}`, start);
    }
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Action: trinity.run_invoice_lifecycle
// ──────────────────────────────────────────────────────────────────────────────

const invoiceLifecycleAction: ActionHandler = {
  actionId: 'trinity.run_invoice_lifecycle',
  name: 'Trinity Invoice Lifecycle',
  category: 'automation',
  description:
    'After a time entry is approved: check billable, aggregate hours, create ' +
    'invoice, and auto-send if org has auto-send enabled.',
  requiredRoles: ['manager', 'org_owner', 'root_admin'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    try {
      const { timeEntryId, triggerSource } = request.payload || {};
      const workspaceId = request.workspaceId;
      if (!workspaceId) return fail(request.actionId, 'workspaceId required', start);
      if (!timeEntryId) return fail(request.actionId, 'timeEntryId required', start);

      const result = await executeInvoiceLifecycleWorkflow({
        workspaceId,
        timeEntryId,
        triggerSource: triggerSource ?? 'trinity_action',
        userId: request.userId,
      });
      return result.success
        ? ok(request.actionId, result.summary, result, start)
        : fail(request.actionId, result.summary, start);
    } catch (err: unknown) {
      return fail(request.actionId, `Invoice lifecycle error: ${err.message}`, start);
    }
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Action: trinity.run_compliance_scan
// ──────────────────────────────────────────────────────────────────────────────

const complianceScanAction: ActionHandler = {
  actionId: 'trinity.run_compliance_scan',
  name: 'Trinity Compliance Expiry Scan',
  category: 'compliance',
  description:
    'Daily scan for licenses / certifications / insurance expiring in 30/15/7/1 days ' +
    'and expired. Fires tiered notifications; expired officers are flagged non-compliant.',
  requiredRoles: ['manager', 'org_owner', 'root_admin'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    try {
      const result = await runComplianceMonitorWorkflow();
      return ok(
        request.actionId,
        `Compliance scan: scanned=${result.scanned}, notified=${result.notified}, blocked=${result.blocked}`,
        result,
        start,
      );
    } catch (err: unknown) {
      return fail(request.actionId, `Compliance scan error: ${err.message}`, start);
    }
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Action: trinity.process_payroll_anomalies
// ──────────────────────────────────────────────────────────────────────────────

const payrollAnomalyAction: ActionHandler = {
  actionId: 'trinity.process_payroll_anomalies',
  name: 'Trinity Payroll Anomaly Response',
  category: 'payroll',
  description:
    'Run anomaly detection on a payroll run and apply severity-graded actions: ' +
    'LOW→log, MEDIUM→flag, HIGH→block run pending dual-AI review.',
  requiredRoles: ['manager', 'org_owner', 'root_admin'],
  handler: async (request: ActionRequest): Promise<ActionResult> => {
    const start = Date.now();
    try {
      const { payrollRunId, triggerSource } = request.payload || {};
      const workspaceId = request.workspaceId;
      if (!workspaceId) return fail(request.actionId, 'workspaceId required', start);

      // If no payrollRunId supplied, sweep all pending runs.
      if (!payrollRunId) {
        const sweep = await runPayrollAnomalyScan();
        return ok(
          request.actionId,
          `Payroll anomaly sweep: scanned=${sweep.scanned}, blocked=${sweep.blocked}`,
          sweep,
          start,
        );
      }

      const result = await executePayrollAnomalyWorkflow({
        workspaceId,
        payrollRunId,
        triggerSource: triggerSource ?? 'trinity_action',
        userId: request.userId,
      });
      return result.success
        ? ok(request.actionId, result.summary, result, start)
        : fail(request.actionId, result.summary, start);
    } catch (err: unknown) {
      return fail(request.actionId, `Payroll anomaly workflow error: ${err.message}`, start);
    }
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Registration
// ──────────────────────────────────────────────────────────────────────────────

export function registerTrinityWorkflowActions(): void {
  helpaiOrchestrator.registerAction(executeCalloffAction);
  helpaiOrchestrator.registerAction(scanStaleCalloffsAction);
  helpaiOrchestrator.registerAction(missedClockInAction);
  helpaiOrchestrator.registerAction(sendShiftRemindersAction);
  helpaiOrchestrator.registerAction(invoiceLifecycleAction);
  helpaiOrchestrator.registerAction(complianceScanAction);
  helpaiOrchestrator.registerAction(payrollAnomalyAction);
  log.info(
    '[TrinityWorkflows] Registered 7 Phase 20 workflow actions: ' +
      'execute_calloff_coverage, scan_stale_calloffs, missed_clockin_check, ' +
      'send_shift_reminders, run_invoice_lifecycle, run_compliance_scan, ' +
      'process_payroll_anomalies',
  );
}

// Convenience re-exports so other modules (cron, webhooks, extensions) can
// invoke the workflows without importing each file.
export {
  executeCalloffCoverageWorkflow,
  scanStaleCalloffWorkflows,
  runMissedClockInSweep,
  runShiftReminderSweep,
  executeInvoiceLifecycleWorkflow,
  runComplianceMonitorWorkflow,
  executePayrollAnomalyWorkflow,
  runPayrollAnomalyScan,
};
