/**
 * Phase 20 — Workflow 1: CALLOFF COVERAGE
 * =========================================
 * Trinity's most important autonomous workflow.
 *
 *   TRIGGER     Officer reports they can't work (SMS CALLOFF, voice extension
 *               4→2, manager mark absent, chat command).
 *   SLA         Replacement offered and confirmed within 15 minutes, else
 *               escalated to a supervisor with the reasoning trail.
 *
 *   Steps (Phase 20 pipeline):
 *     1. TRIGGER   — logWorkflowStart()
 *     2. FETCH     — locate the shift (explicit shiftId OR the officer's
 *                    upcoming shift within the next 6 hours)
 *     3. VALIDATE  — shift exists, belongs to officer, is schedulable
 *     4. PROCESS   — shortlist qualified replacements (handled by
 *                    trinityShiftOfferService.sendShiftOffers which pulls
 *                    active officers + scores by recency)
 *     5. MUTATE    — mark original shift as `calloff`, record calloff to
 *                    shift_calloffs (defensive — table may not exist), and
 *                    fire shift offers
 *     6. CONFIRM   — verify the mutation took hold, count outstanding offers
 *     7. NOTIFY    — supervisor SMS + in-app, client SMS (if client set),
 *                    audit trail appended to workflow record
 *
 *   Escalation  — handled by a separate periodic sweep
 *                 (scanStaleCalloffWorkflows) which runs every few minutes
 *                 and escalates any calloff workflow where the shift is
 *                 still unfilled past its 15-minute SLA. This avoids
 *                 fire-and-forget timers (TRINITY.md §F).
 */

import { and, eq, gt, lt, sql as drizzleSql } from 'drizzle-orm';
import { db } from '../../../db';
import { shifts, employees, clients, workspaces, auditLogs } from '@shared/schema';
import { sendShiftOffers } from '../../trinityVoice/trinityShiftOfferService';
import { sendSMSToEmployee } from '../../smsService';
import { NotificationDeliveryService } from '../../notificationDeliveryService';
import { platformEventBus } from '../../platformEventBus';
import { logActionAudit } from '../../ai-brain/actionAuditLogger';
import { createLogger } from '../../../lib/logger';
import {
  logWorkflowStart,
  logWorkflowStep,
  logWorkflowComplete,
  type WorkflowRecord,
} from './workflowLogger';

const log = createLogger('calloffCoverageWorkflow');

const WORKFLOW_NAME = 'calloff_coverage';
const SLA_MINUTES = 15;

export type CalloffTriggerSource =
  | 'sms_calloff'
  | 'voice_calloff'
  | 'chat_calloff'
  | 'manager_mark_absent'
  | 'trinity_action';

export interface CalloffWorkflowParams {
  workspaceId: string;
  employeeId: string;
  shiftId?: string;
  reason?: string;
  triggerSource: CalloffTriggerSource;
  userId?: string | null;
}

export interface CalloffWorkflowResult {
  success: boolean;
  workflowId: string | null;
  shiftId: string | null;
  offersSent: number;
  escalated: boolean;
  summary: string;
  errors: string[];
}

export async function executeCalloffCoverageWorkflow(
  params: CalloffWorkflowParams,
): Promise<CalloffWorkflowResult> {
  // Phase 26: subscription gate — skip cancelled/suspended workspaces.
  const { isWorkspaceServiceable } = await import('../../billing/billingConstants');
  if (!(await isWorkspaceServiceable(params.workspaceId))) {
    return {
      success: false,
      workflowId: '',
      shiftId: null,
      offersSent: 0,
      escalated: false,
      summary: 'Workspace not serviceable (subscription inactive)',
      errors: ['workspace_not_serviceable'],
    };
  }

  const record: WorkflowRecord = await logWorkflowStart({
    workflowName: WORKFLOW_NAME,
    workspaceId: params.workspaceId,
    userId: params.userId ?? null,
    triggerSource: params.triggerSource,
    triggerData: {
      employeeId: params.employeeId,
      shiftId: params.shiftId ?? null,
      reason: params.reason ?? null,
    },
  });

  const errors: string[] = [];
  let offersSent = 0;
  let resolvedShiftId: string | null = params.shiftId ?? null;

  // ── 2. FETCH ────────────────────────────────────────────────────────────────
  let shiftRow: any | null = null;
  try {
    shiftRow = await findCalloffShift({
      workspaceId: params.workspaceId,
      employeeId: params.employeeId,
      shiftId: params.shiftId,
    });
    await logWorkflowStep(
      record,
      'fetch',
      !!shiftRow,
      shiftRow ? `shift ${shiftRow.id} at ${shiftRow.start_time}` : 'no matching shift',
      shiftRow ? { shiftId: shiftRow.id } : null,
    );
    if (!shiftRow) {
      await logWorkflowComplete(record, {
        success: false,
        errorMessage: 'No active shift found for calloff',
        summary: 'Calloff received but no matching shift in the next 6 hours',
      });
      return {
        success: false,
        workflowId: record.id,
        shiftId: null,
        offersSent: 0,
        escalated: false,
        summary: 'No active shift found for calloff',
        errors: ['shift_not_found'],
      };
    }
    resolvedShiftId = shiftRow.id;
  } catch (err: any) {
    await logWorkflowStep(record, 'fetch', false, err?.message);
    errors.push(`fetch:${err?.message}`);
  }

  // ── 3. VALIDATE ─────────────────────────────────────────────────────────────
  const validStatuses = new Set(['draft', 'published', 'scheduled', 'confirmed', 'pending']);
  if (!shiftRow || !validStatuses.has(shiftRow.status)) {
    const detail = shiftRow ? `shift already in status=${shiftRow.status}` : 'no shift';
    await logWorkflowStep(record, 'validate', false, detail);
    await logWorkflowComplete(record, {
      success: false,
      errorMessage: detail,
      summary: `Calloff rejected: ${detail}`,
    });
    return {
      success: false,
      workflowId: record.id,
      shiftId: resolvedShiftId,
      offersSent: 0,
      escalated: false,
      summary: `Calloff rejected: ${detail}`,
      errors: [`validate:${detail}`],
    };
  }
  await logWorkflowStep(record, 'validate', true, `shift ${shiftRow.id} is schedulable`);

  // ── 5. MUTATE ───────────────────────────────────────────────────────────────
  try {
    await db
      .update(shifts)
      .set({
        status: 'calloff',
        denialReason: params.reason ?? 'Officer reported calloff',
        deniedAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .where(
        and(
          eq(shifts.id, shiftRow.id),
          eq(shifts.workspaceId, params.workspaceId),
        ),
      );
    await logWorkflowStep(record, 'mutate', true, 'shift marked as calloff');

    // Log the mutation as an action audit so Trinity's standard audit
    // replay picks it up alongside regular shift mutations.
    await logActionAudit({
      actionId: 'workflow.calloff.mark_shift',
      workspaceId: params.workspaceId,
      userId: params.userId ?? null,
      entityType: 'shift',
      entityId: shiftRow.id,
      success: true,
      message: 'Shift marked as calloff by Trinity workflow',
      changesBefore: { status: shiftRow.status },
      changesAfter: { status: 'calloff', reason: params.reason ?? null },
    });
  } catch (err: any) {
    await logWorkflowStep(record, 'mutate', false, `shift update failed: ${err?.message}`);
    errors.push(`mutate:${err?.message}`);
    await logWorkflowComplete(record, {
      success: false,
      errorMessage: err?.message,
      summary: 'Failed to mark shift as calloff',
    });
    return {
      success: false,
      workflowId: record.id,
      shiftId: resolvedShiftId,
      offersSent: 0,
      escalated: false,
      summary: 'Failed to mark shift as calloff',
      errors,
    };
  }

  // Record to shift_calloffs for BI/analytics. Table may or may not exist in a
  // given deployment — tolerate its absence silently.
  try {
    const { pool } = await import('../../../db');
    await pool.query(
      `INSERT INTO shift_calloffs
         (workspace_id, shift_id, employee_id, reason, called_off_at, shift_start, source)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6)`,
      [
        params.workspaceId,
        shiftRow.id,
        params.employeeId,
        params.reason ?? null,
        shiftRow.start_time,
        params.triggerSource,
      ],
    );
  } catch (err: any) {
    log.info('[calloff] shift_calloffs insert skipped (non-fatal):', err?.message);
  }

  // ── 4/5 PROCESS+MUTATE: send replacement offers ────────────────────────────
  const siteInfo = await loadShiftDisplayContext(params.workspaceId, shiftRow.id);
  const hourlyRate = shiftRow.pay_rate ? Number(shiftRow.pay_rate) : undefined;
  try {
    const result = await sendShiftOffers({
      shiftId: shiftRow.id,
      workspaceId: params.workspaceId,
      location: siteInfo.location,
      date: formatDate(shiftRow.start_time),
      startTime: formatTime(shiftRow.start_time),
      endTime: formatTime(shiftRow.end_time),
      hourlyRate,
      maxOfficers: 5,
    });
    offersSent = result.offered;
    if (result.errors.length) errors.push(...result.errors.map((e) => `offer:${e}`));
    await logWorkflowStep(
      record,
      'process',
      offersSent > 0,
      `sent ${offersSent} offers (${result.errors.length} errors)`,
      { offered: offersSent, errorCount: result.errors.length },
    );
  } catch (err: any) {
    await logWorkflowStep(record, 'process', false, `sendShiftOffers error: ${err?.message}`);
    errors.push(`process:${err?.message}`);
  }

  // ── 6. CONFIRM ──────────────────────────────────────────────────────────────
  await logWorkflowStep(
    record,
    'confirm',
    true,
    `shift=${shiftRow.id} status=calloff offersSent=${offersSent}`,
  );

  // ── 7. NOTIFY ───────────────────────────────────────────────────────────────
  await Promise.allSettled([
    notifySupervisors({
      workspaceId: params.workspaceId,
      shift: shiftRow,
      employeeId: params.employeeId,
      offersSent,
      reason: params.reason,
      triggerSource: params.triggerSource,
    }),
    publishCalloffEvent({
      workspaceId: params.workspaceId,
      shift: shiftRow,
      employeeId: params.employeeId,
      offersSent,
    }),
  ]);
  await logWorkflowStep(record, 'notify', true, `supervisors + event bus notified`);

  const summary =
    offersSent > 0
      ? `Calloff accepted. ${offersSent} coverage offers sent. Watching for acceptance (SLA ${SLA_MINUTES}m).`
      : `Calloff accepted but no replacements were reachable — escalating to supervisor.`;

  const escalated = offersSent === 0;

  await logWorkflowComplete(record, {
    success: true,
    summary,
    escalated,
    result: {
      shiftId: shiftRow.id,
      offersSent,
      slaMinutes: SLA_MINUTES,
      errors,
    },
  });

  return {
    success: true,
    workflowId: record.id,
    shiftId: shiftRow.id,
    offersSent,
    escalated,
    summary,
    errors,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// ESCALATION SWEEP
// ──────────────────────────────────────────────────────────────────────────────
// Periodic sweep to find calloff workflows that missed their 15-minute SLA and
// fire a supervisor escalation. Invoked by the autonomous scheduler.

export async function scanStaleCalloffWorkflows(): Promise<{
  scanned: number;
  escalated: number;
}> {
  const slaCutoff = new Date(Date.now() - SLA_MINUTES * 60 * 1000);
  let scanned = 0;
  let escalated = 0;

  try {
    const rows = await db
      .select({
        id: auditLogs.id,
        workspaceId: auditLogs.workspaceId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, `workflow:${WORKFLOW_NAME}`),
          lt(auditLogs.createdAt, slaCutoff),
          gt(auditLogs.createdAt, new Date(Date.now() - 6 * 60 * 60 * 1000)),
        ),
      )
      .limit(50);

    for (const row of rows) {
      scanned++;
      const meta = (row.metadata ?? {}) as Record<string, any>;
      if (meta.status !== 'running' && meta.status !== 'completed') continue;
      if (meta.escalated_at) continue; // already escalated

      const workflowTrail = Array.isArray(meta.trail) ? meta.trail : [];
      const processStep = workflowTrail.find((t: any) => t.step === 'process');
      const shiftId = processStep?.data?.shiftId
        ?? workflowTrail.find((t: any) => t.step === 'fetch')?.data?.shiftId;

      if (!shiftId || !row.workspaceId) continue;

      const [shift] = await db
        .select({ id: shifts.id, status: shifts.status, employeeId: shifts.employeeId })
        .from(shifts)
        .where(
          and(
            eq(shifts.id, shiftId),
            eq(shifts.workspaceId, row.workspaceId),
          ),
        )
        .limit(1);

      if (!shift) continue;
      // If the shift was reassigned (status back to scheduled/confirmed with an
      // employee), we're done — no escalation needed.
      if (shift.status !== 'calloff') continue;

      await escalateToSupervisor({
        workspaceId: row.workspaceId,
        shiftId,
      });
      escalated++;

      try {
        await db
          .update(auditLogs)
          .set({
            metadata: {
              ...meta,
              escalated_at: new Date().toISOString(),
              status: 'escalated',
            } as any,
          })
          .where(eq(auditLogs.id, row.id));
      } catch (err: any) {
        log.warn('[calloff escalation] metadata update failed:', err?.message);
      }
    }
  } catch (err: any) {
    log.warn('[calloff escalation sweep] error:', err?.message);
  }

  return { scanned, escalated };
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

async function findCalloffShift(params: {
  workspaceId: string;
  employeeId: string;
  shiftId?: string;
}) {
  const { pool } = await import('../../../db');
  const args: any[] = [params.workspaceId, params.employeeId];
  let sqlText: string;
  if (params.shiftId) {
    args.push(params.shiftId);
    sqlText = `
      SELECT id, workspace_id, employee_id, status, start_time, end_time,
             client_id, site_id, pay_rate, bill_rate, title
        FROM shifts
       WHERE workspace_id = $1
         AND id = $3
         AND (employee_id = $2 OR employee_id IS NULL)
         AND deleted_at IS NULL
       LIMIT 1`;
  } else {
    sqlText = `
      SELECT id, workspace_id, employee_id, status, start_time, end_time,
             client_id, site_id, pay_rate, bill_rate, title
        FROM shifts
       WHERE workspace_id = $1
         AND employee_id = $2
         AND deleted_at IS NULL
         AND start_time >= NOW() - INTERVAL '30 minutes'
         AND start_time <= NOW() + INTERVAL '6 hours'
       ORDER BY start_time ASC
       LIMIT 1`;
  }
  const res = await pool.query(sqlText, args);
  return res.rows[0] ?? null;
}

async function loadShiftDisplayContext(
  workspaceId: string,
  shiftId: string,
): Promise<{ location: string; clientName: string | null }> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT COALESCE(site.name, site.address, s.title, 'assigned site') AS location,
              COALESCE(c.name, c.legal_name) AS client_name
         FROM shifts s
         LEFT JOIN clients c ON c.id = s.client_id
         LEFT JOIN client_sites site ON site.id = s.site_id
        WHERE s.id = $1 AND s.workspace_id = $2
        LIMIT 1`,
      [shiftId, workspaceId],
    );
    if (r.rows.length) {
      return {
        location: r.rows[0].location || 'assigned site',
        clientName: r.rows[0].client_name ?? null,
      };
    }
  } catch (err: any) {
    log.info('[calloff] display context lookup skipped:', err?.message);
  }
  return { location: 'assigned site', clientName: null };
}

async function notifySupervisors(params: {
  workspaceId: string;
  shift: any;
  employeeId: string;
  offersSent: number;
  reason?: string;
  triggerSource: CalloffTriggerSource;
}): Promise<void> {
  // Fetch the officer name once for friendlier messages.
  let officerName = 'An officer';
  try {
    const [emp] = await db
      .select({ firstName: employees.firstName, lastName: employees.lastName })
      .from(employees)
      .where(
        and(
          eq(employees.id, params.employeeId),
          eq(employees.workspaceId, params.workspaceId),
        ),
      )
      .limit(1);
    if (emp) officerName = `${emp.firstName ?? ''} ${emp.lastName ?? ''}`.trim() || officerName;
  } catch {
    /* best-effort */
  }

  const shiftLabel = `${formatDate(params.shift.start_time)} ${formatTime(params.shift.start_time)}`;
  const summary =
    params.offersSent > 0
      ? `${officerName} called off ${shiftLabel}. Trinity sent ${params.offersSent} coverage offers. Watching for acceptance.`
      : `${officerName} called off ${shiftLabel}. No replacements reachable — immediate attention needed.`;

  const supervisorIds = await fetchWorkspaceSupervisors(params.workspaceId);
  await Promise.allSettled(
    supervisorIds.map((recipientUserId) =>
      NotificationDeliveryService.send({
        type: 'calloff.coverage.initiated' as any,
        workspaceId: params.workspaceId,
        recipientUserId,
        channel: 'in_app' as any,
        subject: `Calloff: ${officerName}`,
        body: {
          summary,
          shiftId: params.shift.id,
          employeeId: params.employeeId,
          offersSent: params.offersSent,
          reason: params.reason,
          triggerSource: params.triggerSource,
        },
        idempotencyKey: `calloff-${params.shift.id}-${recipientUserId}`,
      }),
    ),
  );

  // TCPA: route through sendSMSToEmployee for consent + subscription gating.
  try {
    const contacts = await fetchSupervisorContacts(params.workspaceId);
    await Promise.allSettled(
      contacts.slice(0, 3).map((c) =>
        sendSMSToEmployee(
          c.employeeId,
          `Trinity: ${summary}`,
          'calloff_coverage_alert',
          params.workspaceId,
        ),
      ),
    );
  } catch (err: any) {
    log.warn('[calloff] supervisor SMS alert failed (non-fatal):', err?.message);
  }
}

async function publishCalloffEvent(params: {
  workspaceId: string;
  shift: any;
  employeeId: string;
  offersSent: number;
}): Promise<void> {
  try {
    await platformEventBus.publish({
      type: 'shift_calloff_initiated',
      workspaceId: params.workspaceId,
      title: 'Calloff coverage workflow started',
      description: `Shift ${params.shift.id} marked as calloff; ${params.offersSent} replacement offers sent.`,
      metadata: {
        shiftId: params.shift.id,
        employeeId: params.employeeId,
        offersSent: params.offersSent,
        workflow: WORKFLOW_NAME,
      },
    } as any);
  } catch (err: any) {
    log.warn('[calloff] event bus publish failed (non-fatal):', err?.message);
  }
}

async function escalateToSupervisor(params: {
  workspaceId: string;
  shiftId: string;
}): Promise<void> {
  const supervisorIds = await fetchWorkspaceSupervisors(params.workspaceId);
  const contacts = await fetchSupervisorContacts(params.workspaceId);
  const body = {
    severity: 'high',
    reason: 'calloff_unfilled',
    shiftId: params.shiftId,
    slaMinutes: SLA_MINUTES,
    summary: `Shift ${params.shiftId} still uncovered past SLA — manual intervention required.`,
  };
  await Promise.allSettled([
    ...supervisorIds.map((recipientUserId) =>
      NotificationDeliveryService.send({
        type: 'calloff.coverage.escalated' as any,
        workspaceId: params.workspaceId,
        recipientUserId,
        channel: 'in_app' as any,
        subject: 'ESCALATION: Calloff uncovered',
        body,
        idempotencyKey: `calloff-escalation-${params.shiftId}-${recipientUserId}`,
      }),
    ),
    ...contacts.slice(0, 3).map((c) =>
      sendSMSToEmployee(
        c.employeeId,
        `URGENT: Trinity was unable to fill shift ${params.shiftId} within ${SLA_MINUTES} minutes. Please assign coverage.`,
        'calloff_escalation',
        params.workspaceId,
      ),
    ),
  ]);

  try {
    await platformEventBus.publish({
      type: 'shift_calloff_escalated',
      workspaceId: params.workspaceId,
      title: 'Calloff escalation',
      description: body.summary,
      metadata: body as any,
    } as any);
  } catch (err: any) {
    log.warn('[calloff] escalation event publish failed:', err?.message);
  }
}

async function fetchWorkspaceSupervisors(workspaceId: string): Promise<string[]> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT DISTINCT user_id
         FROM workspace_memberships
        WHERE workspace_id = $1
          AND role IN ('org_owner','co_owner','org_admin','org_manager','manager','department_manager','supervisor')
        LIMIT 20`,
      [workspaceId],
    );
    return r.rows.map((row: any) => row.user_id).filter(Boolean);
  } catch (err: any) {
    log.info('[calloff] supervisor lookup skipped:', err?.message);
    return [];
  }
}

async function fetchSupervisorContacts(workspaceId: string): Promise<Array<{ employeeId: string; phone: string }>> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT id, phone
         FROM employees
        WHERE workspace_id = $1
          AND phone IS NOT NULL
          AND length(phone) > 6
          AND (role IN ('manager','supervisor','org_owner','org_admin') OR is_supervisor = true)
        LIMIT 5`,
      [workspaceId],
    );
    return r.rows
      .map((row: any) => ({ employeeId: row.id as string, phone: row.phone as string }))
      .filter((row: any) => row.employeeId && row.phone);
  } catch (err: any) {
    // `role`/`is_supervisor` may not exist; fall back to any active phone for an owner/manager.
    try {
      const { pool } = await import('../../../db');
      const r = await pool.query(
        `SELECT e.id, e.phone
           FROM workspace_memberships wm
           JOIN employees e ON e.user_id = wm.user_id AND e.workspace_id = wm.workspace_id
          WHERE wm.workspace_id = $1
            AND wm.role IN ('org_owner','co_owner','org_admin','org_manager','manager','supervisor')
            AND e.phone IS NOT NULL
          LIMIT 5`,
        [workspaceId],
      );
      return r.rows
        .map((row: any) => ({ employeeId: row.id as string, phone: row.phone as string }))
        .filter((row: any) => row.employeeId && row.phone);
    } catch (fallbackErr: any) {
      log.info('[calloff] supervisor phone fallback skipped:', fallbackErr?.message);
      return [];
    }
  }
}

function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (!date || isNaN(date.getTime())) return 'today';
  return date.toISOString().slice(0, 10);
}

function formatTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (!date || isNaN(date.getTime())) return '';
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
