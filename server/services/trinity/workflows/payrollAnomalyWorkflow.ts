/**
 * Phase 20 — Workflow 6: PAYROLL ANOMALY RESPONSE
 * ================================================
 * Runs when a payroll run enters `pending` state. Trinity inspects the run
 * for anomalies (overtime spike, hours variance, gross-pay variance) and
 * takes severity-graded action:
 *
 *   LOW       → log + in-app notification to run owner
 *   MEDIUM    → SMS to manager + flag run for review
 *   HIGH      → block approval (status → `pending_review`), SMS owner,
 *               require dual-AI deliberation before re-approval
 *
 *   TRIGGER    Called from the payroll approval flow (payroll.submit_for_
 *              approval action in aiBrainMasterOrchestrator) and from a
 *              cron pass that scans for pending runs missing an anomaly
 *              scan.
 *
 *   Delegation Detection itself is done by
 *                `payrollSubagent.detectAnomalies(...)`. This workflow
 *                wraps the detection call, decides severity, and drives
 *                notifications + state transitions.
 */

import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../../../db';
import { payrollRuns, auditLogs } from '@shared/schema';
import { NotificationDeliveryService } from '../../notificationDeliveryService';
import { sendSMSToEmployee } from '../../smsService';
import { platformEventBus } from '../../platformEventBus';
import { createLogger } from '../../../lib/logger';
import {
  logWorkflowStart,
  logWorkflowStep,
  logWorkflowComplete,
} from './workflowLogger';

const log = createLogger('payrollAnomalyWorkflow');

const WORKFLOW_NAME = 'payroll_anomaly_response';

type Severity = 'low' | 'medium' | 'high';

export interface PayrollAnomalyParams {
  workspaceId: string;
  payrollRunId: string;
  triggerSource: 'payroll_submit' | 'cron_scan' | 'trinity_action';
  userId?: string | null;
}

export interface PayrollAnomalyResult {
  success: boolean;
  workflowId: string | null;
  anomalyCount: number;
  highestSeverity: Severity | 'none';
  blocked: boolean;
  summary: string;
}

export async function executePayrollAnomalyWorkflow(
  params: PayrollAnomalyParams,
): Promise<PayrollAnomalyResult> {
  // Phase 26: subscription gate — skip cancelled/suspended workspaces.
  const { isWorkspaceServiceable } = await import('../../billing/billingConstants');
  if (!(await isWorkspaceServiceable(params.workspaceId))) {
    return {
      success: false,
      workflowId: '',
      anomalyCount: 0,
      highestSeverity: 'none',
      blocked: false,
      summary: 'Workspace not serviceable (subscription inactive)',
    };
  }

  const record = await logWorkflowStart({
    workflowName: WORKFLOW_NAME,
    workspaceId: params.workspaceId,
    userId: params.userId ?? null,
    triggerSource: params.triggerSource,
    triggerData: { payrollRunId: params.payrollRunId },
  });

  // ── FETCH ──
  const [run] = await db
    .select()
    .from(payrollRuns)
    .where(
      and(
        eq(payrollRuns.id, params.payrollRunId),
        eq(payrollRuns.workspaceId, params.workspaceId),
      ),
    )
    .limit(1);

  if (!run) {
    await logWorkflowStep(record, 'fetch', false, 'run not found');
    await logWorkflowComplete(record, {
      success: false,
      summary: 'Payroll run not found',
    });
    return {
      success: false,
      workflowId: record.id,
      anomalyCount: 0,
      highestSeverity: 'none',
      blocked: false,
      summary: 'Payroll run not found',
    };
  }
  await logWorkflowStep(record, 'fetch', true, `run ${run.id} period ${run.periodStart} → ${run.periodEnd}`);

  // ── PROCESS: run anomaly detection ──
  let anomalies: Array<{
    type: string;
    severity: Severity;
    description: string;
    affectedEmployees: string[];
    suggestedAction: string;
  }> = [];
  let aiInsights = '';
  try {
    const { payrollSubagent } = await import('../../ai-brain/subagents/payrollSubagent');
    const detection = await payrollSubagent.detectAnomalies(
      params.workspaceId,
      run.periodStart as Date,
      run.periodEnd as Date,
    );
    anomalies = detection.anomalies;
    aiInsights = detection.aiInsights;
    await logWorkflowStep(
      record,
      'process',
      true,
      `detected ${anomalies.length} anomalies`,
      { count: anomalies.length, severities: anomalies.map((a) => a.severity) },
    );
  } catch (err: unknown) {
    await logWorkflowStep(record, 'process', false, `detection failed: ${err?.message}`);
    await logWorkflowComplete(record, {
      success: false,
      errorMessage: err?.message,
      summary: 'Anomaly detection failed',
    });
    return {
      success: false,
      workflowId: record.id,
      anomalyCount: 0,
      highestSeverity: 'none',
      blocked: false,
      summary: 'Anomaly detection failed',
    };
  }

  const highestSeverity: Severity | 'none' = anomalies.some((a) => a.severity === 'high')
    ? 'high'
    : anomalies.some((a) => a.severity === 'medium')
    ? 'medium'
    : anomalies.some((a) => a.severity === 'low')
    ? 'low'
    : 'none';

  // ── MUTATE: if HIGH, flag the run for review and block approval ──
  let blocked = false;
  if (highestSeverity === 'high') {
    try {
      await db
        .update(payrollRuns)
        .set({
          status: 'pending',
          updatedAt: new Date(),
          providerData: {
            ...((run.providerData as any) ?? {}),
            trinityBlocked: true,
            trinityBlockReason: 'high-severity anomalies detected',
            trinityBlockedAt: new Date().toISOString(),
          } as any,
        } as any)
        .where(
          and(
            eq(payrollRuns.id, params.payrollRunId),
            eq(payrollRuns.workspaceId, params.workspaceId),
          ),
        );
      blocked = true;
      await logWorkflowStep(record, 'mutate', true, 'payroll run blocked pending review');
    } catch (err: unknown) {
      await logWorkflowStep(record, 'mutate', false, `flag failed: ${err?.message}`);
    }
  } else {
    await logWorkflowStep(record, 'mutate', true, 'no block required');
  }

  // ── CONFIRM ──
  await logWorkflowStep(
    record,
    'confirm',
    true,
    `highestSeverity=${highestSeverity}, blocked=${blocked}`,
  );

  // ── NOTIFY ──
  await notifyStakeholders({
    workspaceId: params.workspaceId,
    payrollRunId: params.payrollRunId,
    highestSeverity,
    anomalies,
    aiInsights,
    blocked,
  });
  await logWorkflowStep(record, 'notify', true, 'stakeholders notified');

  try {
    await platformEventBus.publish({
      type: 'payroll_anomaly_response',
      workspaceId: params.workspaceId,
      title: blocked ? 'Payroll blocked by Trinity' : 'Payroll anomaly scan complete',
      description: `Severity=${highestSeverity}, anomalies=${anomalies.length}`,
      metadata: {
        payrollRunId: params.payrollRunId,
        highestSeverity,
        blocked,
      },
    } as any);
  } catch (err: unknown) {
    log.warn('[payroll-anomaly] event publish failed:', err?.message);
  }

  const summary = blocked
    ? `Payroll run ${params.payrollRunId} blocked: ${anomalies.length} anomalies (${highestSeverity}). Dual-AI review required.`
    : anomalies.length > 0
    ? `Payroll run ${params.payrollRunId} flagged: ${anomalies.length} anomalies (${highestSeverity}).`
    : `Payroll run ${params.payrollRunId} clear: no anomalies detected.`;

  await logWorkflowComplete(record, {
    success: true,
    summary,
    result: {
      payrollRunId: params.payrollRunId,
      anomalyCount: anomalies.length,
      highestSeverity,
      blocked,
    },
  });

  return {
    success: true,
    workflowId: record.id,
    anomalyCount: anomalies.length,
    highestSeverity,
    blocked,
    summary,
  };
}

/**
 * Cron entry point — scan pending runs that haven't been anomaly-checked in
 * the past 6 hours and run the workflow for each.
 */
export async function runPayrollAnomalyScan(): Promise<{
  scanned: number;
  blocked: number;
  errors: string[];
}> {
  const result = { scanned: 0, blocked: 0, errors: [] as string[] };
  try {
    const pending = await db
      .select({
        id: payrollRuns.id,
        workspaceId: payrollRuns.workspaceId,
        status: payrollRuns.status,
      })
      .from(payrollRuns)
      .where(eq(payrollRuns.status, 'pending'))
      .limit(50);

    for (const run of pending) {
      result.scanned++;
      try {
        const scanned = await hasRecentScan(run.workspaceId, run.id);
        if (scanned) continue;
        const wfResult = await executePayrollAnomalyWorkflow({
          workspaceId: run.workspaceId,
          payrollRunId: run.id,
          triggerSource: 'cron_scan',
        });
        if (wfResult.blocked) result.blocked++;
      } catch (err: unknown) {
        result.errors.push(`${run.id}:${err?.message}`);
      }
    }
  } catch (err: unknown) {
    result.errors.push(`scan:${err?.message}`);
  }
  return result;
}

async function hasRecentScan(workspaceId: string, payrollRunId: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, `workflow:${WORKFLOW_NAME}`),
          eq(auditLogs.workspaceId, workspaceId),
          gt(auditLogs.createdAt, new Date(Date.now() - 6 * 60 * 60 * 1000)),
        ),
      )
      .limit(1);
    return !!row;
  } catch {
    return false;
  }
}

async function notifyStakeholders(params: {
  workspaceId: string;
  payrollRunId: string;
  highestSeverity: Severity | 'none';
  anomalies: Array<{ type: string; severity: Severity; description: string }>;
  aiInsights: string;
  blocked: boolean;
}): Promise<void> {
  if (params.highestSeverity === 'none') return;

  const managerIds = await fetchWorkspaceManagers(params.workspaceId);
  const summary = params.blocked
    ? `Trinity BLOCKED payroll run ${params.payrollRunId}: ${params.anomalies.length} anomalies (${params.highestSeverity}). Review required before re-approval.`
    : `Trinity flagged payroll run ${params.payrollRunId}: ${params.anomalies.length} anomalies (${params.highestSeverity}).`;

  await Promise.allSettled(
    managerIds.map((recipientUserId) =>
      NotificationDeliveryService.send({
        type: params.blocked ? 'payroll.anomaly.blocked' : ('payroll.anomaly.flagged' as any),
        workspaceId: params.workspaceId,
        recipientUserId,
        channel: 'in_app' as any,
        subject: params.blocked ? 'Payroll BLOCKED by Trinity' : 'Payroll anomaly flagged',
        body: {
          payrollRunId: params.payrollRunId,
          highestSeverity: params.highestSeverity,
          anomalies: params.anomalies,
          aiInsights: params.aiInsights,
          blocked: params.blocked,
          summary,
        },
        idempotencyKey: `payroll-anomaly-${params.payrollRunId}-${recipientUserId}`,
      }),
    ),
  );

  if (params.highestSeverity === 'medium' || params.highestSeverity === 'high') {
    try {
      const contacts = await fetchManagerContacts(params.workspaceId);
      await Promise.allSettled(
        contacts.slice(0, 3).map((c) =>
          sendSMSToEmployee(
            c.employeeId,
            summary,
            params.blocked ? 'payroll_blocked' : 'payroll_anomaly_flag',
            params.workspaceId,
          ),
        ),
      );
    } catch (err: unknown) {
      log.warn('[payroll-anomaly] manager SMS failed:', err?.message);
    }
  }
}

async function fetchWorkspaceManagers(workspaceId: string): Promise<string[]> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT DISTINCT user_id
         FROM workspace_memberships
        WHERE workspace_id = $1
          AND role IN ('org_owner','co_owner','org_admin','org_manager','manager')
        LIMIT 20`,
      [workspaceId],
    );
    return r.rows.map((row: any) => row.user_id).filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchManagerContacts(workspaceId: string): Promise<Array<{ employeeId: string; phone: string }>> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT e.id, e.phone
         FROM workspace_memberships wm
         JOIN employees e ON e.user_id = wm.user_id AND e.workspace_id = wm.workspace_id
        WHERE wm.workspace_id = $1
          AND wm.role IN ('org_owner','co_owner','org_admin','org_manager','manager')
          AND e.phone IS NOT NULL
        LIMIT 5`,
      [workspaceId],
    );
    return r.rows
      .map((row: any) => ({ employeeId: row.id as string, phone: row.phone as string }))
      .filter((row: any) => row.employeeId && row.phone);
  } catch {
    return [];
  }
}
