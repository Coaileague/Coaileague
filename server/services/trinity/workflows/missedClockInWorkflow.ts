/**
 * Phase 20 — Workflow 2: LATE / MISSED CLOCK-IN
 * =============================================
 * Proactive welfare check when a scheduled officer has not clocked in.
 *
 *   TRIGGER      Scheduled cron every 5 minutes (per autonomousScheduler).
 *                For each shift where:
 *                  - status ∈ {scheduled, published, confirmed, draft}
 *                  - start_time < NOW() - 15 minutes
 *                  - start_time > NOW() - 4 hours (don't chase truly stale)
 *                  - no time_entry with clock_in >= start_time - 30 minutes
 *                ... this workflow fires.
 *
 *   STAGES       Tracked in the workflow record's metadata.stage field so
 *                successive cron passes can advance the state machine
 *                without creating new tables.
 *
 *                  stage=sms_sent        → text sent, waiting for OK/HELP
 *                  stage=call_placed     → outbound welfare call placed
 *                  stage=escalated       → supervisor notified
 *                  stage=resolved        → officer clocked in or replied
 *
 *   Each cron pass advances the stage based on elapsed time since the last
 *   transition (10 min SMS→call, 10 min call→escalate).
 */

import { and, eq, lt, gt, isNull, sql as drizzleSql } from 'drizzle-orm';
import { db } from '../../../db';
import { shifts, employees, auditLogs } from '@shared/schema';
import { sendSMSToEmployee, sendSMS } from '../../smsService';
import { callOfficerWelfareCheck } from '../../trinityVoice/trinityOutboundService';
import { NotificationDeliveryService } from '../../notificationDeliveryService';
import { platformEventBus } from '../../platformEventBus';
import { createLogger } from '../../../lib/logger';
import {
  logWorkflowStart,
  logWorkflowStep,
  logWorkflowComplete,
  type WorkflowRecord,
} from './workflowLogger';

const log = createLogger('missedClockInWorkflow');

const WORKFLOW_NAME = 'missed_clockin';
const SMS_GRACE_MINUTES = 15; // wait this long after shift start before texting
const CALL_ESCALATION_MINUTES = 10; // after SMS, wait this long before calling
const SUPERVISOR_ESCALATION_MINUTES = 10; // after call, wait before supervisor alert
const SHIFT_WINDOW_HOURS = 4; // don't look back further than this

export interface MissedClockInSweepResult {
  scanned: number;
  smsSent: number;
  callsPlaced: number;
  escalated: number;
  resolved: number;
  errors: string[];
}

/**
 * Top-level sweep. Called by autonomousScheduler cron.
 * Returns aggregated counts for logging.
 */
export async function runMissedClockInSweep(): Promise<MissedClockInSweepResult> {
  const result: MissedClockInSweepResult = {
    scanned: 0,
    smsSent: 0,
    callsPlaced: 0,
    escalated: 0,
    resolved: 0,
    errors: [],
  };

  let missing: Array<{
    shiftId: string;
    workspaceId: string;
    employeeId: string;
    startTime: Date;
    location: string | null;
  }> = [];

  try {
    missing = await findMissedClockIns();
  } catch (err: unknown) {
    result.errors.push(`scan:${err?.message}`);
    return result;
  }

  const { isWorkspaceServiceable } = await import('../../billing/billingConstants');

  for (const miss of missing) {
    result.scanned++;
    try {
      // Phase 26: subscription gate — skip cancelled/suspended workspaces.
      if (!(await isWorkspaceServiceable(miss.workspaceId))) {
        continue;
      }
      const existing = await findExistingWorkflow(miss.workspaceId, miss.shiftId);
      if (!existing) {
        const advanced = await startMissedClockInWorkflow(miss);
        if (advanced === 'sms_sent') result.smsSent++;
        continue;
      }

      const meta = (existing.metadata ?? {}) as Record<string, any>;
      const stage: string = meta.stage ?? 'sms_sent';
      const lastTransition = meta.lastTransitionAt
        ? new Date(meta.lastTransitionAt)
        : existing.createdAt;

      // Has the officer now clocked in? If so, resolve.
      if (await hasEmployeeClockedIn(miss.workspaceId, miss.employeeId, miss.shiftId)) {
        await markResolved(existing.id, meta, 'officer clocked in after prompt');
        result.resolved++;
        continue;
      }

      const minutesSince = Math.floor((Date.now() - lastTransition.getTime()) / 60000);

      if (stage === 'sms_sent' && minutesSince >= CALL_ESCALATION_MINUTES) {
        const advanced = await advanceToCall(existing.id, meta, miss);
        if (advanced) result.callsPlaced++;
      } else if (stage === 'call_placed' && minutesSince >= SUPERVISOR_ESCALATION_MINUTES) {
        const advanced = await advanceToEscalation(existing.id, meta, miss);
        if (advanced) result.escalated++;
      }
    } catch (err: unknown) {
      result.errors.push(`${miss.shiftId}:${err?.message}`);
    }
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// Stage transitions
// ──────────────────────────────────────────────────────────────────────────────

async function startMissedClockInWorkflow(miss: {
  shiftId: string;
  workspaceId: string;
  employeeId: string;
  startTime: Date;
  location: string | null;
}): Promise<'sms_sent' | 'failed'> {
  const record: WorkflowRecord = await logWorkflowStart({
    workflowName: WORKFLOW_NAME,
    workspaceId: miss.workspaceId,
    triggerSource: 'cron_missed_clockin',
    triggerData: {
      shiftId: miss.shiftId,
      employeeId: miss.employeeId,
      startTime: miss.startTime.toISOString(),
    },
  });

  const firstName = await fetchFirstName(miss.workspaceId, miss.employeeId);
  const startedAgoMin = Math.max(
    0,
    Math.floor((Date.now() - miss.startTime.getTime()) / 60000),
  );
  const locationPart = miss.location ? ` at ${miss.location}` : '';
  const body =
    `Hi ${firstName ?? 'there'}, your shift${locationPart} started ${startedAgoMin} min ago. ` +
    `Reply OK if you're running late, HELP if you need assistance. — Trinity`;

  const smsResult = await sendSMSToEmployee(
    miss.employeeId,
    body,
    'missed_clockin_check',
    miss.workspaceId,
  );
  await logWorkflowStep(record, 'notify', smsResult.success, smsResult.error ?? 'SMS sent');

  if (record.id) {
    try {
      await db
        .update(auditLogs)
        .set({
          entityType: 'workflow',
          entityId: miss.shiftId,
          metadata: {
            source: 'workflow',
            phase: '20',
            stage: smsResult.success ? 'sms_sent' : 'failed',
            shiftId: miss.shiftId,
            employeeId: miss.employeeId,
            startTime: miss.startTime.toISOString(),
            lastTransitionAt: new Date().toISOString(),
            status: 'running',
            trail: [
              {
                step: 'trigger',
                ts: new Date().toISOString(),
                ok: true,
                detail: 'cron_missed_clockin',
              },
              {
                step: 'notify',
                ts: new Date().toISOString(),
                ok: smsResult.success,
                detail: smsResult.error ?? 'SMS check-in sent',
              },
            ],
          } as any,
        })
        .where(eq(auditLogs.id, record.id));
    } catch (err: unknown) {
      log.warn('[missed-clockin] start metadata write failed:', err?.message);
    }
  }

  return smsResult.success ? 'sms_sent' : 'failed';
}

async function advanceToCall(
  auditId: string,
  meta: Record<string, unknown>,
  miss: { shiftId: string; workspaceId: string; employeeId: string },
): Promise<boolean> {
  const baseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || '';
  if (!baseUrl) {
    log.info('[missed-clockin] No baseUrl — skipping outbound call, escalating directly.');
    await advanceToEscalation(auditId, meta, miss);
    return false;
  }

  try {
    const callResult = await callOfficerWelfareCheck({
      employeeId: miss.employeeId,
      workspaceId: miss.workspaceId,
      baseUrl,
      shiftStartLabel: 'your scheduled shift',
    });

    await db
      .update(auditLogs)
      .set({
        metadata: {
          ...meta,
          stage: 'call_placed',
          lastTransitionAt: new Date().toISOString(),
          callSid: callResult.callSid ?? null,
          trail: [
            ...(Array.isArray(meta.trail) ? meta.trail : []),
            {
              step: 'escalate',
              ts: new Date().toISOString(),
              ok: callResult.success,
              detail: callResult.success
                ? `welfare call placed (${callResult.callSid})`
                : `call failed: ${callResult.error}`,
            },
          ],
        } as any,
      })
      .where(eq(auditLogs.id, auditId));

    return callResult.success;
  } catch (err: unknown) {
    log.warn('[missed-clockin] welfare call failed, escalating:', err?.message);
    await advanceToEscalation(auditId, meta, miss);
    return false;
  }
}

async function advanceToEscalation(
  auditId: string,
  meta: Record<string, unknown>,
  miss: { shiftId: string; workspaceId: string; employeeId: string },
): Promise<boolean> {
  try {
    const officerName = (await fetchFirstName(miss.workspaceId, miss.employeeId)) ?? 'Officer';
    const summary = `${officerName} has not clocked in and is unresponsive. Shift ${miss.shiftId} requires supervisor intervention.`;

    // Phase 26G — deep link so the supervisor can one-click mark the shift as
    // a calloff and trigger the replacement flow. The calloff coverage
    // workflow is intentionally human-gated (officer might be running late,
    // not truly a no-show), so we surface the action rather than autofiring.
    // The UI reads the shiftId + action query params and opens a confirmation
    // dialog that POSTs to /api/shifts/:id/mark-calloff (Phase 26H).
    const actionUrl = `/schedule?shiftId=${encodeURIComponent(miss.shiftId)}&action=calloff`;
    const actionSms = `URGENT: ${summary} Tap to mark as calloff: ${actionUrl}`;

    const supervisorIds = await fetchSupervisors(miss.workspaceId);
    const contacts = await fetchSupervisorContacts(miss.workspaceId);

    await Promise.allSettled([
      ...supervisorIds.map((recipientUserId) =>
        NotificationDeliveryService.send({
          type: 'missed_clockin.escalation' as any,
          workspaceId: miss.workspaceId,
          recipientUserId,
          channel: 'in_app' as any,
          subject: 'Missed clock-in — unresponsive',
          body: {
            summary,
            shiftId: miss.shiftId,
            employeeId: miss.employeeId,
            actionUrl,
            actionLabel: 'Mark as calloff & find replacement',
          },
          idempotencyKey: `missed-clockin-${miss.shiftId}-${recipientUserId}`,
        }),
      ),
      ...contacts.slice(0, 3).map((c) =>
        sendSMS({
          to: c.phone,
          body: actionSms,
          workspaceId: miss.workspaceId,
          type: 'missed_clockin_escalation',
        }),
      ),
    ]);

    try {
      await platformEventBus.publish({
        type: 'missed_clockin_escalated',
        workspaceId: miss.workspaceId,
        title: 'Missed clock-in escalation',
        description: summary,
        metadata: { shiftId: miss.shiftId, employeeId: miss.employeeId },
      } as any);
    } catch (err: unknown) {
      log.warn('[missed-clockin] event publish failed:', err?.message);
    }

    await db
      .update(auditLogs)
      .set({
        metadata: {
          ...meta,
          stage: 'escalated',
          lastTransitionAt: new Date().toISOString(),
          status: 'escalated',
          trail: [
            ...(Array.isArray(meta.trail) ? meta.trail : []),
            {
              step: 'escalate',
              ts: new Date().toISOString(),
              ok: true,
              detail: summary,
            },
          ],
        } as any,
      })
      .where(eq(auditLogs.id, auditId));
    return true;
  } catch (err: unknown) {
    log.warn('[missed-clockin] escalation failed:', err?.message);
    return false;
  }
}

async function markResolved(
  auditId: string,
  meta: Record<string, unknown>,
  detail: string,
): Promise<void> {
  try {
    await db
      .update(auditLogs)
      .set({
        success: true,
        metadata: {
          ...meta,
          stage: 'resolved',
          lastTransitionAt: new Date().toISOString(),
          status: 'completed',
          trail: [
            ...(Array.isArray(meta.trail) ? meta.trail : []),
            {
              step: 'complete',
              ts: new Date().toISOString(),
              ok: true,
              detail,
            },
          ],
        } as any,
      })
      .where(eq(auditLogs.id, auditId));
  } catch (err: unknown) {
    log.warn('[missed-clockin] resolve update failed:', err?.message);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// DB helpers
// ──────────────────────────────────────────────────────────────────────────────

async function findMissedClockIns(): Promise<Array<{
  shiftId: string;
  workspaceId: string;
  employeeId: string;
  startTime: Date;
  location: string | null;
}>> {
  const { pool } = await import('../../../db');
  const r = await pool.query(
    `SELECT s.id AS shift_id,
            s.workspace_id,
            s.employee_id,
            s.start_time,
            COALESCE(site.name, site.address) AS location
       FROM shifts s
       LEFT JOIN client_sites site ON site.id = s.site_id
      WHERE s.status IN ('scheduled','published','confirmed','draft')
        AND s.deleted_at IS NULL
        AND s.employee_id IS NOT NULL
        AND s.start_time < NOW() - INTERVAL '${SMS_GRACE_MINUTES} minutes'
        AND s.start_time > NOW() - INTERVAL '${SHIFT_WINDOW_HOURS} hours'
        AND NOT EXISTS (
          SELECT 1 FROM time_entries te
           WHERE te.shift_id = s.id
             AND te.workspace_id = s.workspace_id
             AND te.clock_in >= s.start_time - INTERVAL '30 minutes'
        )
      LIMIT 100`,
  );
  return r.rows.map((row: any) => ({
    shiftId: row.shift_id,
    workspaceId: row.workspace_id,
    employeeId: row.employee_id,
    startTime: new Date(row.start_time),
    location: row.location,
  }));
}

async function findExistingWorkflow(
  workspaceId: string,
  shiftId: string,
): Promise<{
  id: string;
  metadata: Record<string, any> | null;
  createdAt: Date;
} | null> {
  try {
    const [row] = await db
      .select({
        id: auditLogs.id,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.workspaceId, workspaceId),
          eq(auditLogs.action, `workflow:${WORKFLOW_NAME}`),
          eq(auditLogs.entityId, shiftId),
          gt(auditLogs.createdAt, new Date(Date.now() - SHIFT_WINDOW_HOURS * 60 * 60 * 1000)),
        ),
      )
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      metadata: row.metadata as Record<string, any> | null,
      createdAt: row.createdAt,
    };
  } catch (err: unknown) {
    log.warn('[missed-clockin] existing-workflow lookup failed:', err?.message);
    return null;
  }
}

async function hasEmployeeClockedIn(
  workspaceId: string,
  employeeId: string,
  shiftId: string,
): Promise<boolean> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT 1
         FROM time_entries
        WHERE workspace_id = $1
          AND employee_id = $2
          AND (shift_id = $3 OR clock_in >= NOW() - INTERVAL '${SHIFT_WINDOW_HOURS} hours')
          AND clock_in IS NOT NULL
        LIMIT 1`,
      [workspaceId, employeeId, shiftId],
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

async function fetchFirstName(
  workspaceId: string,
  employeeId: string,
): Promise<string | null> {
  try {
    const [emp] = await db
      .select({ firstName: employees.firstName })
      .from(employees)
      .where(
        and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)),
      )
      .limit(1);
    return emp?.firstName ?? null;
  } catch {
    return null;
  }
}

async function fetchSupervisors(workspaceId: string): Promise<string[]> {
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
  } catch {
    return [];
  }
}

async function fetchSupervisorContacts(workspaceId: string): Promise<Array<{ employeeId: string; phone: string }>> {
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
  } catch {
    return [];
  }
}
