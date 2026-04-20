/**
 * Phase 24 — Proactive Monitor 1: PRE-SHIFT INTELLIGENCE
 * ======================================================
 * Two hours before each upcoming shift, Trinity silently checks for issues
 * so they can be resolved before they become problems:
 *
 *   - DOUBLE BOOKING: officer has an open time_entry (clock-in without
 *     clock-out) from a different shift.
 *   - RELIABILITY: officer has >= 3 late clock-ins in the last 30 days
 *     (clock_in > shift.start_time + 10 minutes).
 *   - LICENSE EXPIRY: any required training_certifications row expires
 *     within 30 days.
 *   - STALE POST ORDER: the linked client's post_orders text was updated
 *     more than 90 days ago (best-effort — missing column tolerated).
 *
 * Severity grading:
 *   low      → in-app notification to supervisors (license expiring in 30d,
 *              stale post order)
 *   medium   → SMS to the supervisor line (reliability flag)
 *   high     → SMS + in-app to managers (double booking, expired license)
 *
 * Invocation:
 *   - Cron: every 30 minutes via `proactiveOrchestrator` → autonomousScheduler
 *     (looks at shifts starting in the 90–120 minute window).
 *   - Chat/Voice: trinity.run_pre_shift_intel action handler in
 *     `proactiveOrchestrator.ts` → registered in actionRegistry.
 *
 * Idempotency:
 *   Flags are deduped per (shiftId, flagCode) using the shared audit log:
 *   action = 'workflow:pre_shift_intel', entityId = shiftId. A second run
 *   within the same pre-shift window will not double-notify.
 */

import { createLogger } from '../../../lib/logger';
import { NotificationDeliveryService } from '../../notificationDeliveryService';
import { sendSMSToEmployee } from '../../smsService';
import { platformEventBus } from '../../platformEventBus';
import { logActionAudit } from '../../ai-brain/actionAuditLogger';

const log = createLogger('preShiftIntelligence');

const WORKFLOW_NAME = 'pre_shift_intel';
const WINDOW_START_MIN = 90;
const WINDOW_END_MIN = 120;
const RELIABILITY_LATE_THRESHOLD = 3;
const LICENSE_EXPIRY_WARN_DAYS = 30;
const POST_ORDER_STALE_DAYS = 90;

export type FlagSeverity = 'low' | 'medium' | 'high';
export type FlagCode =
  | 'double_booking'
  | 'reliability'
  | 'license_expiring'
  | 'license_expired'
  | 'stale_post_order';

export interface PreShiftFlag {
  shiftId: string;
  workspaceId: string;
  employeeId: string | null;
  code: FlagCode;
  severity: FlagSeverity;
  message: string;
  details?: Record<string, any>;
}

export interface PreShiftSweepResult {
  scanned: number;
  flagged: number;
  notified: number;
  errors: string[];
  flags: PreShiftFlag[];
}

/**
 * Top-level sweep. Scans upcoming shifts in the pre-shift window, evaluates
 * each for flags, and notifies the appropriate recipient based on severity.
 */
export async function runPreShiftIntelligenceSweep(): Promise<PreShiftSweepResult> {
  const result: PreShiftSweepResult = {
    scanned: 0,
    flagged: 0,
    notified: 0,
    errors: [],
    flags: [],
  };

  let upcoming: Array<UpcomingShift>;
  try {
    upcoming = await findUpcomingShifts();
  } catch (err: any) {
    result.errors.push(`scan:${err?.message}`);
    return result;
  }

  for (const shift of upcoming) {
    result.scanned++;
    try {
      const flags = await evaluateShift(shift);
      if (!flags.length) continue;

      for (const flag of flags) {
        if (await alreadyNotified(flag)) continue;

        const delivered = await notify(flag, shift);
        if (delivered) result.notified++;
        result.flagged++;
        result.flags.push(flag);

        await recordNotified(flag);
      }
    } catch (err: any) {
      result.errors.push(`${shift.shiftId}:${err?.message}`);
      log.warn(`[preShiftIntel] shift ${shift.shiftId} failed:`, err?.message);
    }
  }

  return result;
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

interface UpcomingShift {
  shiftId: string;
  workspaceId: string;
  employeeId: string | null;
  startTime: Date;
  endTime: Date;
  clientId: string | null;
  title: string | null;
}

async function evaluateShift(shift: UpcomingShift): Promise<PreShiftFlag[]> {
  const flags: PreShiftFlag[] = [];
  if (!shift.employeeId) return flags;

  const [doubleBooked, lateCount, expiringCerts, staleOrder] = await Promise.all([
    isDoubleBooked(shift),
    countRecentLates(shift),
    findExpiringCerts(shift),
    isPostOrderStale(shift),
  ]);

  if (doubleBooked) {
    flags.push({
      shiftId: shift.shiftId,
      workspaceId: shift.workspaceId,
      employeeId: shift.employeeId,
      code: 'double_booking',
      severity: 'high',
      message:
        'Officer is currently clocked in on a different shift. The upcoming shift ' +
        'risks a double booking when the current entry is not closed.',
    });
  }

  if (lateCount >= RELIABILITY_LATE_THRESHOLD) {
    flags.push({
      shiftId: shift.shiftId,
      workspaceId: shift.workspaceId,
      employeeId: shift.employeeId,
      code: 'reliability',
      severity: 'medium',
      message: `Reliability flag: ${lateCount} late clock-ins in the last 30 days.`,
      details: { lateCount },
    });
  }

  for (const cert of expiringCerts) {
    flags.push({
      shiftId: shift.shiftId,
      workspaceId: shift.workspaceId,
      employeeId: shift.employeeId,
      code: cert.expired ? 'license_expired' : 'license_expiring',
      severity: cert.expired ? 'high' : 'low',
      message: cert.expired
        ? `Certification "${cert.name}" is EXPIRED (expired ${cert.expiryDate}).`
        : `Certification "${cert.name}" expires in ${cert.daysUntilExpiry} day(s).`,
      details: { certName: cert.name, expiryDate: cert.expiryDate, daysUntilExpiry: cert.daysUntilExpiry },
    });
  }

  if (staleOrder) {
    flags.push({
      shiftId: shift.shiftId,
      workspaceId: shift.workspaceId,
      employeeId: shift.employeeId,
      code: 'stale_post_order',
      severity: 'low',
      message: 'Site post orders have not been updated in the last 90 days.',
      details: { clientId: shift.clientId },
    });
  }

  return flags;
}

// ─── Notification dispatch ────────────────────────────────────────────────────

async function notify(flag: PreShiftFlag, shift: UpcomingShift): Promise<boolean> {
  const supervisors = await fetchSupervisors(shift.workspaceId);
  const managers = await fetchManagers(shift.workspaceId);

  const shiftLabel = buildShiftLabel(shift);
  const firstName = await fetchFirstName(shift.workspaceId, shift.employeeId ?? '');
  const label = firstName ? `${firstName}` : `officer ${shift.employeeId ?? ''}`.trim();
  const summary = `${flag.message} Shift: ${shiftLabel}, officer: ${label}.`;

  const recipientIds =
    flag.severity === 'high'
      ? [...new Set([...managers, ...supervisors])]
      : flag.severity === 'medium'
        ? supervisors
        : [...new Set([...supervisors, ...managers])];

  let delivered = false;

  // In-app notification for all severities.
  await Promise.allSettled(
    recipientIds.map((recipientUserId) =>
      NotificationDeliveryService.send({
        type: 'trinity_alert',
        workspaceId: shift.workspaceId,
        recipientUserId,
        channel: 'in_app',
        subject: `Pre-shift flag: ${flag.code.replace(/_/g, ' ')}`,
        body: {
          summary,
          shiftId: shift.shiftId,
          employeeId: shift.employeeId,
          severity: flag.severity,
          code: flag.code,
          details: flag.details ?? null,
        },
        idempotencyKey: `preshift-${shift.shiftId}-${flag.code}-${recipientUserId}`,
      }).then(() => {
        delivered = true;
      }),
    ),
  );

  // Medium + high also go by SMS to the first 3 supervisors (consent-checked).
  if (flag.severity !== 'low') {
    const supervisors = await fetchSupervisorPhones(shift.workspaceId);
    await Promise.allSettled(
      supervisors.slice(0, 3).map((sup) =>
        sendSMSToEmployee(
          sup.id,
          `Trinity heads-up: ${summary}`,
          `preshift_${flag.code}`,
          shift.workspaceId,
        ).then(() => {
          delivered = true;
        }),
      ),
    );
  }

  // Event bus for dashboards/subscribers.
  try {
    await platformEventBus.publish({
      type: 'trinity_issue_detected',
      workspaceId: shift.workspaceId,
      title: `Pre-shift flag: ${flag.code}`,
      description: summary,
      severity: flag.severity === 'low' ? 'low' : flag.severity === 'medium' ? 'medium' : 'high',
      metadata: {
        workflow: WORKFLOW_NAME,
        shiftId: shift.shiftId,
        employeeId: shift.employeeId,
        code: flag.code,
        details: flag.details ?? null,
      },
    } as any);
  } catch (err: any) {
    log.warn('[preShiftIntel] event publish failed (non-fatal):', err?.message);
  }

  await logActionAudit({
    actionId: 'trinity.run_pre_shift_intel',
    workspaceId: shift.workspaceId,
    entityType: 'shift',
    entityId: shift.shiftId,
    success: true,
    message: summary,
    payload: { code: flag.code, severity: flag.severity, details: flag.details ?? null },
  });

  return delivered;
}

// ─── DB helpers (raw SQL — mirrors the Phase 20 workflow pattern) ─────────────

async function findUpcomingShifts(): Promise<UpcomingShift[]> {
  const { pool } = await import('../../../db');
  const r = await pool.query(
    `SELECT s.id AS shift_id,
            s.workspace_id,
            s.employee_id,
            s.start_time,
            s.end_time,
            s.client_id,
            s.title
       FROM shifts s
      WHERE s.deleted_at IS NULL
        AND s.employee_id IS NOT NULL
        AND s.status NOT IN ('cancelled', 'denied')
        AND s.start_time >= NOW() + INTERVAL '${WINDOW_START_MIN} minutes'
        AND s.start_time <= NOW() + INTERVAL '${WINDOW_END_MIN} minutes'
      LIMIT 200`,
  );
  return r.rows.map((row: any) => ({
    shiftId: row.shift_id,
    workspaceId: row.workspace_id,
    employeeId: row.employee_id,
    startTime: new Date(row.start_time),
    endTime: new Date(row.end_time),
    clientId: row.client_id,
    title: row.title,
  }));
}

async function isDoubleBooked(shift: UpcomingShift): Promise<boolean> {
  if (!shift.employeeId) return false;
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT 1
         FROM time_entries
        WHERE workspace_id = $1
          AND employee_id = $2
          AND clock_in IS NOT NULL
          AND clock_out IS NULL
          AND (shift_id IS NULL OR shift_id <> $3)
        LIMIT 1`,
      [shift.workspaceId, shift.employeeId, shift.shiftId],
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

async function countRecentLates(shift: UpcomingShift): Promise<number> {
  if (!shift.employeeId) return 0;
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT COUNT(*)::int AS c
         FROM time_entries te
         JOIN shifts s ON s.id = te.shift_id AND s.workspace_id = te.workspace_id
        WHERE te.workspace_id = $1
          AND te.employee_id = $2
          AND te.clock_in IS NOT NULL
          AND te.clock_in > s.start_time + INTERVAL '10 minutes'
          AND te.clock_in >= NOW() - INTERVAL '30 days'`,
      [shift.workspaceId, shift.employeeId],
    );
    return Number(r.rows[0]?.c || 0);
  } catch {
    return 0;
  }
}

interface CertFlag {
  name: string;
  expiryDate: string;
  daysUntilExpiry: number;
  expired: boolean;
}

async function findExpiringCerts(shift: UpcomingShift): Promise<CertFlag[]> {
  if (!shift.employeeId) return [];
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT name,
              expiry_date,
              EXTRACT(DAY FROM (expiry_date - NOW()))::int AS days_until_expiry
         FROM training_certifications
        WHERE workspace_id = $1
          AND employee_id = $2
          AND expiry_date IS NOT NULL
          AND expiry_date <= NOW() + INTERVAL '${LICENSE_EXPIRY_WARN_DAYS} days'`,
      [shift.workspaceId, shift.employeeId],
    );
    return r.rows.map((row: any) => ({
      name: row.name,
      expiryDate: row.expiry_date ? new Date(row.expiry_date).toISOString().slice(0, 10) : '',
      daysUntilExpiry: Number(row.days_until_expiry ?? 0),
      expired: Number(row.days_until_expiry ?? 0) < 0,
    }));
  } catch (err: any) {
    log.warn('[preShiftIntel] cert lookup failed:', err?.message);
    return [];
  }
}

async function isPostOrderStale(shift: UpcomingShift): Promise<boolean> {
  if (!shift.clientId) return false;
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT post_orders, updated_at
         FROM clients
        WHERE id = $1
          AND workspace_id = $2
        LIMIT 1`,
      [shift.clientId, shift.workspaceId],
    );
    if (!r.rows.length) return false;
    const row = r.rows[0];
    if (!row.post_orders) return false;
    const updatedAt = row.updated_at ? new Date(row.updated_at) : null;
    if (!updatedAt) return false;
    const daysAgo = (Date.now() - updatedAt.getTime()) / (24 * 60 * 60 * 1000);
    return daysAgo > POST_ORDER_STALE_DAYS;
  } catch {
    return false;
  }
}

async function alreadyNotified(flag: PreShiftFlag): Promise<boolean> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT 1
         FROM audit_logs
        WHERE workspace_id = $1
          AND action = $2
          AND entity_id = $3
          AND metadata->>'code' = $4
          AND created_at > NOW() - INTERVAL '${WINDOW_END_MIN + 30} minutes'
        LIMIT 1`,
      [flag.workspaceId, `trinity.${WORKFLOW_NAME}`, flag.shiftId, flag.code],
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

async function recordNotified(flag: PreShiftFlag): Promise<void> {
  try {
    const { pool } = await import('../../../db');
    await pool.query(
      `INSERT INTO audit_logs (workspace_id, action, raw_action, entity_type, entity_id,
                               success, source, actor_type, metadata, created_at)
       VALUES ($1, $2, $3, 'shift', $4, true, 'system', 'trinity',
               jsonb_build_object('code', $5::text, 'severity', $6::text, 'phase', '24'),
               NOW())`,
      [
        flag.workspaceId,
        `trinity.${WORKFLOW_NAME}`,
        WORKFLOW_NAME,
        flag.shiftId,
        flag.code,
        flag.severity,
      ],
    );
  } catch (err: any) {
    log.warn('[preShiftIntel] audit write failed (non-fatal):', err?.message);
  }
}

// ─── Shared actor lookups (re-implemented locally so this service stays
// self-contained — same intent as the Phase 20 workflow helpers). ─────────────

async function fetchSupervisors(workspaceId: string): Promise<string[]> {
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

async function fetchManagers(workspaceId: string): Promise<string[]> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT DISTINCT user_id
         FROM workspace_memberships
        WHERE workspace_id = $1
          AND role IN ('org_owner','co_owner','org_admin','org_manager','manager',
                       'department_manager')
        LIMIT 20`,
      [workspaceId],
    );
    return r.rows.map((row: any) => row.user_id).filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchSupervisorPhones(workspaceId: string): Promise<Array<{ id: string; phone: string }>> {
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
      .map((row: any) => ({ id: row.id as string, phone: row.phone as string }))
      .filter((s: { id: string; phone: string }) => Boolean(s.id && s.phone));
  } catch {
    return [];
  }
}

async function fetchFirstName(workspaceId: string, employeeId: string): Promise<string | null> {
  if (!employeeId) return null;
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT first_name
         FROM employees
        WHERE id = $1 AND workspace_id = $2
        LIMIT 1`,
      [employeeId, workspaceId],
    );
    return r.rows[0]?.first_name ?? null;
  } catch {
    return null;
  }
}

function buildShiftLabel(shift: UpcomingShift): string {
  const start = shift.startTime.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return shift.title ? `${shift.title} @ ${start}` : start;
}
