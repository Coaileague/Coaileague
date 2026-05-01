/**
 * Phase 20 — Workflow 3: SHIFT REMINDER SEQUENCE
 * ==============================================
 * Two-stage reminder sequence for each scheduled shift:
 *
 *   4 hours before:  "Reminder: you're scheduled at <location> today at <time>.
 *                     Reply OK to confirm."
 *   1 hour  before:  "Your shift starts in 1 hour at <location>. Reply CALLOFF
 *                     [reason] if you can't make it."
 *
 * Idempotency: each reminder fires exactly once per shift — the workflow
 * leverages the NotificationDeliveryService's idempotency key system with
 * keys of the form `shift-reminder-<shiftId>-<bucket>` where bucket is
 * `4h` or `1h`. Duplicate cron passes are no-ops.
 *
 * The reminders are sent by SMS via sendSMSToEmployee (consent-gated) and
 * mirrored to in-app via NotificationDeliveryService.
 */

import { and, eq, gt, lt } from 'drizzle-orm';
import { db } from '../../../db';
import { shifts, employees, auditLogs } from '@shared/schema';
import { sendSMSToEmployee } from '../../smsService';
import { NotificationDeliveryService } from '../../notificationDeliveryService';
import { createLogger } from '../../../lib/logger';
import {
  logWorkflowStart,
  logWorkflowStep,
  logWorkflowComplete,
} from './workflowLogger';

const log = createLogger('shiftReminderWorkflow');

const WORKFLOW_NAME = 'shift_reminder';

// Tolerance windows (minutes) for each bucket — cron fires every 5 min, so
// the bucket is [target - tolerance, target + tolerance].
const FOUR_HOUR_TOLERANCE_MIN = 10;
const ONE_HOUR_TOLERANCE_MIN = 8;

export interface ShiftReminderSweepResult {
  scanned: number;
  fourHourSent: number;
  oneHourSent: number;
  errors: string[];
}

/**
 * Cron entry point. Scans shifts due for a reminder and fires them.
 */
export async function runShiftReminderSweep(): Promise<ShiftReminderSweepResult> {
  const result: ShiftReminderSweepResult = {
    scanned: 0,
    fourHourSent: 0,
    oneHourSent: 0,
    errors: [],
  };

  try {
    const fourHourShifts = await findShiftsInWindow(240, FOUR_HOUR_TOLERANCE_MIN);
    const oneHourShifts = await findShiftsInWindow(60, ONE_HOUR_TOLERANCE_MIN);

    for (const s of fourHourShifts) {
      result.scanned++;
      if (await reminderAlreadySent(s.shiftId, '4h')) continue;
      try {
        await sendReminder({
          ...s,
          bucket: '4h',
          message: build4hMessage(s.firstName, s.location, s.startTime),
        });
        result.fourHourSent++;
      } catch (err: unknown) {
        result.errors.push(`4h:${s.shiftId}:${err?.message}`);
      }
    }

    for (const s of oneHourShifts) {
      result.scanned++;
      if (await reminderAlreadySent(s.shiftId, '1h')) continue;
      try {
        await sendReminder({
          ...s,
          bucket: '1h',
          message: build1hMessage(s.firstName, s.location, s.startTime),
        });
        result.oneHourSent++;
      } catch (err: unknown) {
        result.errors.push(`1h:${s.shiftId}:${err?.message}`);
      }
    }
  } catch (err: unknown) {
    result.errors.push(`scan:${err?.message}`);
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────────────────

interface ReminderShift {
  shiftId: string;
  workspaceId: string;
  employeeId: string;
  userId: string | null;
  firstName: string | null;
  location: string | null;
  startTime: Date;
}

async function findShiftsInWindow(
  leadMinutes: number,
  toleranceMinutes: number,
): Promise<ReminderShift[]> {
  const { pool } = await import('../../../db');
  const r = await pool.query(
    `SELECT s.id AS shift_id,
            s.workspace_id,
            s.employee_id,
            s.start_time,
            e.first_name,
            e.user_id,
            COALESCE(site.name, site.address) AS location
       FROM shifts s
       JOIN employees e ON e.id = s.employee_id AND e.workspace_id = s.workspace_id
       LEFT JOIN client_sites site ON site.id = s.site_id
      WHERE s.status IN ('scheduled','published','confirmed')
        AND s.deleted_at IS NULL
        AND s.employee_id IS NOT NULL
        AND s.start_time >= NOW() + INTERVAL '${leadMinutes - toleranceMinutes} minutes'
        AND s.start_time <  NOW() + INTERVAL '${leadMinutes + toleranceMinutes} minutes'
      LIMIT 500`,
  );
  return r.rows.map((row: any) => ({
    shiftId: row.shift_id,
    workspaceId: row.workspace_id,
    employeeId: row.employee_id,
    userId: row.user_id,
    firstName: row.first_name,
    location: row.location,
    startTime: new Date(row.start_time),
  }));
}

async function reminderAlreadySent(shiftId: string, bucket: '4h' | '1h'): Promise<boolean> {
  try {
    const [existing] = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, `workflow:${WORKFLOW_NAME}`),
          eq(auditLogs.entityId, shiftId),
          eq(auditLogs.rawAction, `${WORKFLOW_NAME}:${bucket}`),
          gt(auditLogs.createdAt, new Date(Date.now() - 6 * 60 * 60 * 1000)),
        ),
      )
      .limit(1);
    return !!existing;
  } catch {
    return false;
  }
}

async function sendReminder(params: {
  shiftId: string;
  workspaceId: string;
  employeeId: string;
  userId: string | null;
  firstName: string | null;
  location: string | null;
  startTime: Date;
  bucket: '4h' | '1h';
  message: string;
}): Promise<void> {
  // Phase 26: Subscription gate — don't send proactive shift reminders
  // on behalf of a workspace whose subscription is inactive. Cron sweeps
  // every workspace; the gate filters per-tenant. Protected workspaces
  // always pass.
  const { isWorkspaceServiceable } = await import('../../billing/billingConstants');
  if (!(await isWorkspaceServiceable(params.workspaceId))) {
    log.info(`[shift-reminder] Skipping workspace ${params.workspaceId} — subscription inactive`);
    return;
  }

  const record = await logWorkflowStart({
    workflowName: WORKFLOW_NAME,
    workspaceId: params.workspaceId,
    triggerSource: `cron_${params.bucket}_reminder`,
    triggerData: {
      shiftId: params.shiftId,
      employeeId: params.employeeId,
      bucket: params.bucket,
      startTime: params.startTime.toISOString(),
    },
  });

  // Tag the row with entityId=shiftId so reminderAlreadySent() can find it
  // cheaply, and rawAction with the bucket so we can distinguish 4h vs 1h.
  if (record.id) {
    try {
      await db
        .update(auditLogs)
        .set({
          entityId: params.shiftId,
          rawAction: `${WORKFLOW_NAME}:${params.bucket}`,
        })
        .where(eq(auditLogs.id, record.id));
    } catch (err: unknown) {
      log.warn('[shift-reminder] audit tag update failed:', err?.message);
    }
  }

  const smsResult = await sendSMSToEmployee(
    params.employeeId,
    params.message,
    `shift_reminder_${params.bucket}`,
    params.workspaceId,
  );
  await logWorkflowStep(
    record,
    'notify',
    smsResult.success,
    smsResult.error ?? `SMS ${params.bucket} reminder sent`,
  );

  if (params.userId) {
    try {
      await NotificationDeliveryService.send({
        type: 'shift.reminder' as any,
        workspaceId: params.workspaceId,
        recipientUserId: params.userId,
        channel: 'in_app' as any,
        subject: `Shift reminder (${params.bucket === '4h' ? '4 hours' : '1 hour'})`,
        body: {
          shiftId: params.shiftId,
          bucket: params.bucket,
          message: params.message,
          startTime: params.startTime.toISOString(),
        },
        idempotencyKey: `shift-reminder-${params.shiftId}-${params.bucket}`,
      });
    } catch (err: unknown) {
      log.warn('[shift-reminder] in-app delivery failed:', err?.message);
    }
  }

  await logWorkflowComplete(record, {
    success: smsResult.success,
    summary: smsResult.success
      ? `${params.bucket} reminder delivered to ${params.employeeId}`
      : `${params.bucket} reminder failed: ${smsResult.error}`,
    result: { bucket: params.bucket, messageId: smsResult.messageId },
  });
}

function build4hMessage(
  firstName: string | null,
  location: string | null,
  startTime: Date,
): string {
  const name = firstName ? `, ${firstName}` : '';
  const loc = location ? ` at ${location}` : '';
  const timeLabel = formatLocalTime(startTime);
  return `Reminder${name}: you're scheduled${loc} today at ${timeLabel}. Reply OK to confirm, CALLOFF if you can't make it. — Trinity`;
}

function build1hMessage(
  firstName: string | null,
  location: string | null,
  _startTime: Date,
): string {
  const name = firstName ? `, ${firstName}` : '';
  const loc = location ? ` at ${location}` : '';
  return `Your shift${loc} starts in 1 hour${name}. Reply CALLOFF <reason> if you can't make it. — Trinity`;
}

function formatLocalTime(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
