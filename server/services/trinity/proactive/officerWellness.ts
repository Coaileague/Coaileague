/**
 * Phase 24 — Proactive Monitor 3: OFFICER WELLNESS CHECK
 * =======================================================
 * When an officer clocks out after a shift of 8+ consecutive hours, Trinity
 * waits 30 minutes and sends a single, caring SMS:
 *
 *   "Hi <name>! You just finished a long shift. How are you doing?
 *    Reply OK if you're good, or HELP if you need anything. — Trinity"
 *
 * Reply handling:
 *   - OK       → logged as wellness check passed.
 *   - HELP     → creates a support case and notifies a supervisor.
 *   - no reply within 2 hours → logged, in-app note to manager. (Soft —
 *     the goal is signal, not alarm.)
 *
 * This is a differentiator, not a safety system — the Phase O panic
 * disclaimer law does NOT apply here because this surface explicitly does
 * not make any emergency response claim. The SMS wording is chosen so the
 * officer understands Trinity is a friendly check-in, not a rescue service.
 *
 * Architecture:
 *   - The cron sweep (every 10 minutes) finds time_entries that:
 *       clocked out 30-45 minutes ago
 *       worked 8+ consecutive hours (clockOut - clockIn)
 *       have no prior wellness audit row
 *     and sends the initial check-in SMS.
 *   - A separate hourly sweep finds time_entries whose wellness SMS was
 *     sent > 2 hours ago with no reply recorded and posts the soft
 *     manager-side notification.
 *   - Reply handling is done by `trinitySmsKeywordRouter.ts` — OK/HELP are
 *     already routed there. This file just exposes helpers that router
 *     handlers can call when the officer's most recent wellness row is
 *     the one being replied to.
 */

import { createLogger } from '../../../lib/logger';
import { NotificationDeliveryService } from '../../notificationDeliveryService';
// sendSMSToEmployee imported lazily inside sendCheckInSms to avoid circular imports.
import { platformEventBus } from '../../platformEventBus';
import { logActionAudit } from '../../ai-brain/actionAuditLogger';

const log = createLogger('officerWellness');

const WORKFLOW_NAME = 'officer_wellness';
const LONG_SHIFT_HOURS = 8;
const SEND_DELAY_MIN = 30;
const SEND_WINDOW_END_MIN = 45;
const NO_REPLY_ESCALATE_HOURS = 2;

export interface WellnessSweepResult {
  scanned: number;
  smsSent: number;
  errors: string[];
}

export interface WellnessStaleResult {
  scanned: number;
  noReplyNoted: number;
  errors: string[];
}

/**
 * Initial sweep — finds long-shift clock-outs from 30-45 minutes ago and
 * sends the check-in SMS. Called every 10 minutes.
 */
export async function runWellnessCheckSweep(): Promise<WellnessSweepResult> {
  const result: WellnessSweepResult = { scanned: 0, smsSent: 0, errors: [] };

  let candidates: WellnessCandidate[];
  try {
    candidates = await findLongShiftClockouts();
  } catch (err: any) {
    result.errors.push(`scan:${err?.message}`);
    return result;
  }

  const { isWorkspaceServiceable } = await import('../../billing/billingConstants');

  for (const c of candidates) {
    result.scanned++;
    try {
      if (await alreadySentCheckIn(c.timeEntryId)) continue;
      // Phase 26: subscription gate — skip cancelled/suspended workspaces.
      if (!(await isWorkspaceServiceable(c.workspaceId))) {
        continue;
      }
      const sent = await sendCheckInSms(c);
      if (sent) result.smsSent++;
      await recordSent(c);
    } catch (err: any) {
      result.errors.push(`${c.timeEntryId}:${err?.message}`);
      log.warn(`[officerWellness] ${c.timeEntryId} failed:`, err?.message);
    }
  }

  return result;
}

/**
 * Stale-reply sweep — finds wellness check-ins that went out >2h ago with
 * no recorded reply and posts a soft in-app note to managers. Runs hourly.
 */
export async function runWellnessStaleSweep(): Promise<WellnessStaleResult> {
  const result: WellnessStaleResult = { scanned: 0, noReplyNoted: 0, errors: [] };

  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT id, workspace_id, entity_id AS time_entry_id,
              (metadata->>'employee_id') AS employee_id
         FROM audit_logs
        WHERE action = $1
          AND metadata->>'stage' = 'sms_sent'
          AND created_at < NOW() - INTERVAL '${NO_REPLY_ESCALATE_HOURS} hours'
          AND created_at > NOW() - INTERVAL '24 hours'
        LIMIT 200`,
      [`trinity.${WORKFLOW_NAME}`],
    );
    for (const row of r.rows) {
      result.scanned++;
      try {
        await markNoReply(row.workspace_id, row.id, row.employee_id, row.time_entry_id);
        result.noReplyNoted++;
      } catch (err: any) {
        result.errors.push(`${row.id}:${err?.message}`);
      }
    }
  } catch (err: any) {
    result.errors.push(`sweep:${err?.message}`);
  }

  return result;
}

/**
 * Called by the SMS router's OK/HELP path to mark wellness resolved and
 * log the outcome. Returns true if the officer had a pending wellness row.
 */
export async function handleWellnessReply(params: {
  workspaceId: string;
  employeeId: string;
  reply: 'ok' | 'help';
}): Promise<{ matched: boolean; supportCaseId?: string }> {
  const { pool } = await import('../../../db');
  const r = await pool.query(
    `SELECT id, entity_id AS time_entry_id, metadata
       FROM audit_logs
      WHERE workspace_id = $1
        AND action = $2
        AND metadata->>'employee_id' = $3
        AND metadata->>'stage' = 'sms_sent'
        AND created_at > NOW() - INTERVAL '6 hours'
      ORDER BY created_at DESC
      LIMIT 1`,
    [params.workspaceId, `trinity.${WORKFLOW_NAME}`, params.employeeId],
  );
  if (!r.rows.length) return { matched: false };

  const audit = r.rows[0];
  const meta = audit.metadata || {};
  const now = new Date().toISOString();

  if (params.reply === 'ok') {
    try {
      await pool.query(
        `UPDATE audit_logs
            SET metadata = $1::jsonb,
                success = true
          WHERE id = $2`,
        [
          JSON.stringify({
            ...meta,
            stage: 'resolved_ok',
            status: 'completed',
            lastTransitionAt: now,
            outcome: 'ok',
          }),
          audit.id,
        ],
      );
    } catch (err: any) {
      log.warn('[officerWellness] resolve-ok write failed:', err?.message);
    }
    await logActionAudit({
      actionId: 'trinity.officer_wellness.resolved',
      workspaceId: params.workspaceId,
      entityType: 'time_entry',
      entityId: audit.time_entry_id,
      success: true,
      payload: { outcome: 'ok' },
    });
    return { matched: true };
  }

  // HELP path — open a support case, notify supervisors.
  let caseId: string | undefined;
  try {
    const { createSupportCase, notifyHumanAgents } = await import(
      '../../trinityVoice/supportCaseService'
    );
    const { pool: p2 } = await import('../../../db');
    const emp = await p2.query(
      `SELECT first_name, last_name, phone FROM employees WHERE id = $1 LIMIT 1`,
      [params.employeeId],
    );
    const name = emp.rows[0]
      ? `${emp.rows[0].first_name || ''} ${emp.rows[0].last_name || ''}`.trim()
      : undefined;
    const sc = await createSupportCase({
      workspaceId: params.workspaceId,
      callerNumber: emp.rows[0]?.phone || '',
      callerName: name,
      issueSummary: `[WELLNESS HELP via SMS] ${name ?? 'Officer'} replied HELP to a post-shift wellness check.`,
      aiResolutionAttempted: false,
      language: 'en',
    });
    caseId = sc.case_number;
    try {
      await notifyHumanAgents({ supportCase: sc, workspaceId: params.workspaceId });
    } catch (e: any) {
      log.warn('[officerWellness] notify agents failed (non-fatal):', e?.message);
    }
  } catch (err: any) {
    log.warn('[officerWellness] support case create failed:', err?.message);
  }

  try {
    await pool.query(
      `UPDATE audit_logs
          SET metadata = $1::jsonb,
              success = true
        WHERE id = $2`,
      [
        JSON.stringify({
          ...meta,
          stage: 'resolved_help',
          status: 'completed',
          lastTransitionAt: now,
          outcome: 'help',
          supportCaseId: caseId ?? null,
        }),
        audit.id,
      ],
    );
  } catch (err: any) {
    log.warn('[officerWellness] resolve-help write failed:', err?.message);
  }

  await logActionAudit({
    actionId: 'trinity.officer_wellness.resolved',
    workspaceId: params.workspaceId,
    entityType: 'time_entry',
    entityId: audit.time_entry_id,
    success: true,
    payload: { outcome: 'help', supportCaseId: caseId ?? null },
  });

  return { matched: true, supportCaseId: caseId };
}

// ─── Internals ────────────────────────────────────────────────────────────────

interface WellnessCandidate {
  timeEntryId: string;
  workspaceId: string;
  employeeId: string;
  hoursWorked: number;
  clockOut: Date;
  firstName: string | null;
  phone: string | null;
}

async function findLongShiftClockouts(): Promise<WellnessCandidate[]> {
  const { pool } = await import('../../../db');
  const r = await pool.query(
    `SELECT te.id AS time_entry_id,
            te.workspace_id,
            te.employee_id,
            te.clock_out,
            EXTRACT(EPOCH FROM (te.clock_out - te.clock_in)) / 3600 AS hours_worked,
            e.first_name,
            e.phone
       FROM time_entries te
       JOIN employees e ON e.id = te.employee_id AND e.workspace_id = te.workspace_id
      WHERE te.clock_out IS NOT NULL
        AND te.clock_in IS NOT NULL
        AND te.clock_out >= NOW() - INTERVAL '${SEND_WINDOW_END_MIN} minutes'
        AND te.clock_out <= NOW() - INTERVAL '${SEND_DELAY_MIN} minutes'
        AND EXTRACT(EPOCH FROM (te.clock_out - te.clock_in)) / 3600 >= ${LONG_SHIFT_HOURS}
        AND e.phone IS NOT NULL
      LIMIT 100`,
  );
  return r.rows.map((row: any) => ({
    timeEntryId: row.time_entry_id,
    workspaceId: row.workspace_id,
    employeeId: row.employee_id,
    hoursWorked: Number(row.hours_worked || 0),
    clockOut: new Date(row.clock_out),
    firstName: row.first_name,
    phone: row.phone,
  }));
}

async function alreadySentCheckIn(timeEntryId: string): Promise<boolean> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT 1 FROM audit_logs
        WHERE action = $1
          AND entity_id = $2
        LIMIT 1`,
      [`trinity.${WORKFLOW_NAME}`, timeEntryId],
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

async function sendCheckInSms(c: WellnessCandidate): Promise<boolean> {
  if (!c.phone) return false;
  const hours = Math.round(c.hoursWorked * 10) / 10;
  const name = c.firstName || 'there';
  const hour = new Date().getHours();

  // Time-aware greeting — Trinity knows what time it is
  const timeContext =
    hour < 6  ? 'late night' :
    hour < 12 ? 'morning' :
    hour < 17 ? 'afternoon' :
    hour < 21 ? 'evening' : 'late night';

  // Voice: warm, first-person, not a system alert. Varies by shift length.
  let body: string;
  if (hours >= 12) {
    body = `${name}, that was a long one — ${hours} hours. Trinity here. Just checking in. ` +
      `How are you holding up? Text GOOD or HELP and I'll take it from there.`;
  } else if (hours >= 10) {
    body = `${name} — Trinity. You just wrapped a ${hours}-hour shift on a ${timeContext} post. ` +
      `I want to make sure you're okay. Reply GOOD if all's well, or HELP if you need anything.`;
  } else {
    body = `Hey ${name}, Trinity here. Shift's done — ${hours} hours. ` +
      `Quick check-in: everything good? Reply GOOD or HELP.`;
  }
  // TCPA: route through sendSMSToEmployee to enforce consent + subscription gates.
  const { sendSMSToEmployee } = await import('../../smsService');
  const res = await sendSMSToEmployee(
    c.employeeId,
    body,
    'officer_wellness_checkin',
    c.workspaceId,
  );
  if (res.success) {
    try {
      await platformEventBus.publish({
        type: 'trinity_wellness_checkin_sent',
        workspaceId: c.workspaceId,
        title: 'Trinity post-shift wellness check sent',
        description: `Sent wellness SMS to ${c.firstName ?? 'officer'} after ${hours}h shift.`,
        severity: 'low',
        metadata: { timeEntryId: c.timeEntryId, employeeId: c.employeeId, hoursWorked: hours },
      } as any);
    } catch (err: any) {
      log.warn('[officerWellness] event publish failed (non-fatal):', err?.message);
    }
  }
  return res.success;
}

async function recordSent(c: WellnessCandidate): Promise<void> {
  try {
    const { pool } = await import('../../../db');
    await pool.query(
      `INSERT INTO audit_logs (workspace_id, action, raw_action, entity_type, entity_id,
                               success, source, actor_type, metadata, created_at)
       VALUES ($1, $2, $3, 'time_entry', $4, true, 'system', 'trinity',
               jsonb_build_object('stage','sms_sent','status','running',
                                  'employee_id', $5::text,
                                  'hours_worked', $6::text,
                                  'phase','24'),
               NOW())`,
      [
        c.workspaceId,
        `trinity.${WORKFLOW_NAME}`,
        WORKFLOW_NAME,
        c.timeEntryId,
        c.employeeId,
        String(c.hoursWorked),
      ],
    );
  } catch (err: any) {
    log.warn('[officerWellness] audit write failed (non-fatal):', err?.message);
  }
}

async function markNoReply(
  workspaceId: string,
  auditId: string,
  employeeId: string | null,
  timeEntryId: string,
): Promise<void> {
  const { pool } = await import('../../../db');
  await pool.query(
    `UPDATE audit_logs
        SET metadata = metadata || jsonb_build_object('stage','no_reply','status','completed',
                                                      'lastTransitionAt', NOW()::text)
      WHERE id = $1`,
    [auditId],
  );

  const managers = await fetchManagers(workspaceId);
  const firstName = employeeId ? await fetchFirstName(workspaceId, employeeId) : null;
  const summary = `${firstName ?? 'Officer'} has not replied to Trinity's post-shift wellness check.`;

  await Promise.allSettled(
    managers.map((recipientUserId) =>
      NotificationDeliveryService.send({
        type: 'trinity_alert',
        workspaceId,
        recipientUserId,
        channel: 'in_app',
        subject: 'Wellness check: no reply',
        body: { summary, timeEntryId, employeeId },
        idempotencyKey: `wellness-noreply-${timeEntryId}-${recipientUserId}`,
      }),
    ),
  );

  await logActionAudit({
    actionId: 'trinity.officer_wellness.stale',
    workspaceId,
    entityType: 'time_entry',
    entityId: timeEntryId,
    success: true,
    message: summary,
    payload: { employeeId },
  });
}

async function fetchManagers(workspaceId: string): Promise<string[]> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT DISTINCT user_id
         FROM workspace_memberships
        WHERE workspace_id = $1
          AND role IN ('org_owner','co_owner','org_admin','org_manager','manager',
                       'department_manager','supervisor')
        LIMIT 20`,
      [workspaceId],
    );
    return r.rows.map((row: any) => row.user_id).filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchFirstName(workspaceId: string, employeeId: string): Promise<string | null> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT first_name FROM employees WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [employeeId, workspaceId],
    );
    return r.rows[0]?.first_name ?? null;
  } catch {
    return null;
  }
}
