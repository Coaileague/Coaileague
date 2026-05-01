/**
 * Phase 24 — Proactive Monitor 4: ANOMALY WATCH
 * =============================================
 * Continuous (hourly) scan for patterns that suggest something is wrong —
 * before it becomes a support ticket.
 *
 *   - GPS FRAUD: same officer produced two clock-in GPS fixes > 3 km apart
 *     within 10 minutes. Flags the supervisor.
 *   - COVERAGE GAP: a shift started 15 minutes ago with no clock-in recorded
 *     on the shift (distinct from Phase 20 missed clock-in — that sweep
 *     handles welfare, this one handles the site-coverage blind spot).
 *   - INCIDENT PATTERN: 3+ open security_incidents at the same client site
 *     within the last 14 days — triggers a client-report flag.
 *   - GHOST EMPLOYEE: employee with an active role who has no time_entries
 *     or shifts in the last 7 days on a workspace with active contracts.
 *   - BILLING ANOMALY: invoice total is 30%+ above the trailing 3-month
 *     average for the same client.
 *
 * Each anomaly is graded low/medium/high and routed:
 *   low    → in-app note to manager only
 *   medium → in-app note + audit
 *   high   → in-app + SMS to supervisor line
 */

import { createLogger } from '../../../lib/logger';
import { NotificationDeliveryService } from '../../notificationDeliveryService';
import { sendSMSToEmployee } from '../../smsService';
import { platformEventBus } from '../../platformEventBus';
import { logActionAudit } from '../../ai-brain/actionAuditLogger';

const log = createLogger('anomalyWatch');

const WORKFLOW_NAME = 'anomaly_watch';
const GPS_FRAUD_WINDOW_MIN = 10;
const GPS_FRAUD_MIN_DISTANCE_KM = 3;
const COVERAGE_GAP_MIN = 15;
const INCIDENT_PATTERN_DAYS = 14;
const INCIDENT_PATTERN_THRESHOLD = 3;
const GHOST_EMPLOYEE_DAYS = 7;
const BILLING_ANOMALY_PCT = 0.3;
const DEDUP_WINDOW_HOURS = 6;

export type AnomalySeverity = 'low' | 'medium' | 'high';

export type AnomalyCode =
  | 'gps_fraud'
  | 'coverage_gap'
  | 'incident_pattern'
  | 'ghost_employee'
  | 'billing_anomaly';

export interface Anomaly {
  workspaceId: string;
  code: AnomalyCode;
  severity: AnomalySeverity;
  summary: string;
  entityType: string;
  entityId: string;
  dedupKey: string;
  details?: Record<string, unknown>;
}

export interface AnomalyWatchResult {
  workspacesScanned: number;
  anomaliesFound: number;
  anomaliesNotified: number;
  byCode: Record<AnomalyCode, number>;
  errors: string[];
}

export async function runAnomalyWatchSweep(): Promise<AnomalyWatchResult> {
  const result: AnomalyWatchResult = {
    workspacesScanned: 0,
    anomaliesFound: 0,
    anomaliesNotified: 0,
    byCode: {
      gps_fraud: 0,
      coverage_gap: 0,
      incident_pattern: 0,
      ghost_employee: 0,
      billing_anomaly: 0,
    },
    errors: [],
  };

  let workspaces: string[];
  try {
    workspaces = await listActiveWorkspaces();
  } catch (err: unknown) {
    result.errors.push(`workspaces:${err?.message}`);
    return result;
  }

  const { isWorkspaceServiceable } = await import('../../billing/billingConstants');

  for (const workspaceId of workspaces) {
    result.workspacesScanned++;
    try {
      // Phase 26: subscription gate — skip cancelled/suspended workspaces.
      if (!(await isWorkspaceServiceable(workspaceId))) {
        continue;
      }
      const anomalies = await runAnomalyWatchForWorkspace(workspaceId);
      for (const a of anomalies) {
        result.anomaliesFound++;
        result.byCode[a.code]++;
        if (await alreadyFlagged(a)) continue;
        const delivered = await notify(a);
        if (delivered) result.anomaliesNotified++;
        await recordAnomaly(a);
      }
    } catch (err: unknown) {
      result.errors.push(`${workspaceId}:${err?.message}`);
      log.warn(`[anomalyWatch] workspace ${workspaceId} failed:`, err?.message);
    }
  }

  return result;
}

export async function runAnomalyWatchForWorkspace(workspaceId: string): Promise<Anomaly[]> {
  const out: Anomaly[] = [];
  const [gpsFraud, coverageGaps, incidentPatterns, ghostEmployees, billingAnomalies,
    futureShiftExpiry, billRateMismatch] =
    await Promise.all([
      findGpsFraud(workspaceId),
      findCoverageGaps(workspaceId),
      findIncidentPatterns(workspaceId),
      findGhostEmployees(workspaceId),
      findBillingAnomalies(workspaceId),
      // Chaos edge cases: future shifts with expired guard cards + bill rate drift
      detectFutureShiftGuardCardExpiry(workspaceId),
      detectBillRateMismatch(workspaceId),
    ]);
  out.push(...gpsFraud, ...coverageGaps, ...incidentPatterns, ...ghostEmployees, ...billingAnomalies,
    ...futureShiftExpiry, ...billRateMismatch);
  return out;
}

// ─── Pattern detectors ────────────────────────────────────────────────────────

async function findGpsFraud(workspaceId: string): Promise<Anomaly[]> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `WITH recent AS (
         SELECT te.id, te.employee_id, te.clock_in,
                te.clock_in_latitude, te.clock_in_longitude
           FROM time_entries te
          WHERE te.workspace_id = $1
            AND te.clock_in >= NOW() - INTERVAL '1 hour'
            AND te.clock_in_latitude IS NOT NULL
            AND te.clock_in_longitude IS NOT NULL
       )
       SELECT a.employee_id,
              a.id AS id_a, b.id AS id_b,
              a.clock_in_latitude AS lat_a, a.clock_in_longitude AS lng_a,
              b.clock_in_latitude AS lat_b, b.clock_in_longitude AS lng_b,
              EXTRACT(EPOCH FROM (b.clock_in - a.clock_in)) / 60 AS minutes_apart
         FROM recent a
         JOIN recent b ON b.employee_id = a.employee_id
                       AND b.id > a.id
                       AND ABS(EXTRACT(EPOCH FROM (b.clock_in - a.clock_in)) / 60) <= $2
        LIMIT 20`,
      [workspaceId, GPS_FRAUD_WINDOW_MIN],
    );
    return r.rows
      .map((row: any) => {
        const km = haversineKm(
          Number(row.lat_a),
          Number(row.lng_a),
          Number(row.lat_b),
          Number(row.lng_b),
        );
        if (km < GPS_FRAUD_MIN_DISTANCE_KM) return null;
        const pairKey = [row.id_a, row.id_b].sort().join('-');
        return {
          workspaceId,
          code: 'gps_fraud' as AnomalyCode,
          severity: 'high' as AnomalySeverity,
          summary:
            `GPS anomaly: officer ${row.employee_id} produced two clock-in fixes ` +
            `${km.toFixed(1)} km apart within ${Number(row.minutes_apart).toFixed(1)} minutes.`,
          entityType: 'employee',
          entityId: row.employee_id,
          dedupKey: `gps_fraud:${pairKey}`,
          details: { pair: [row.id_a, row.id_b], kmApart: km, minutesApart: row.minutes_apart },
        } as Anomaly;
      })
      .filter((a: any): a is Anomaly => !!a);
  } catch (err: unknown) {
    log.warn('[anomalyWatch] gps_fraud lookup failed:', err?.message);
    return [];
  }
}

async function findCoverageGaps(workspaceId: string): Promise<Anomaly[]> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT s.id AS shift_id, s.employee_id, s.client_id, s.title, s.start_time
         FROM shifts s
        WHERE s.workspace_id = $1
          AND s.deleted_at IS NULL
          AND s.status NOT IN ('cancelled','denied','completed')
          AND s.start_time <= NOW() - INTERVAL '${COVERAGE_GAP_MIN} minutes'
          AND s.start_time >= NOW() - INTERVAL '2 hours'
          AND NOT EXISTS (
            SELECT 1 FROM time_entries te
             WHERE te.shift_id = s.id
               AND te.workspace_id = s.workspace_id
               AND te.clock_in IS NOT NULL
          )
        LIMIT 50`,
      [workspaceId],
    );
    return r.rows.map((row: any) => ({
      workspaceId,
      code: 'coverage_gap' as AnomalyCode,
      severity: 'high' as AnomalySeverity,
      summary: `No clock-in ${COVERAGE_GAP_MIN}+ min after shift start — site may be uncovered.`,
      entityType: 'shift',
      entityId: row.shift_id,
      dedupKey: `coverage_gap:${row.shift_id}`,
      details: {
        shiftId: row.shift_id,
        clientId: row.client_id,
        employeeId: row.employee_id,
        startTime: row.start_time,
      },
    }));
  } catch (err: unknown) {
    log.warn('[anomalyWatch] coverage_gap lookup failed:', err?.message);
    return [];
  }
}

async function findIncidentPatterns(workspaceId: string): Promise<Anomaly[]> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT client_id, COUNT(*)::int AS incident_count
         FROM security_incidents
        WHERE workspace_id = $1
          AND client_id IS NOT NULL
          AND reported_at >= NOW() - INTERVAL '${INCIDENT_PATTERN_DAYS} days'
          AND status IN ('open','escalated')
        GROUP BY client_id
       HAVING COUNT(*) >= ${INCIDENT_PATTERN_THRESHOLD}
        LIMIT 20`,
      [workspaceId],
    );
    return r.rows.map((row: any) => ({
      workspaceId,
      code: 'incident_pattern' as AnomalyCode,
      severity: 'medium' as AnomalySeverity,
      summary:
        `${row.incident_count} open incidents at this client site in the last ` +
        `${INCIDENT_PATTERN_DAYS} days — consider a client report.`,
      entityType: 'client',
      entityId: row.client_id,
      dedupKey: `incident_pattern:${row.client_id}`,
      details: { clientId: row.client_id, incidentCount: row.incident_count },
    }));
  } catch (err: unknown) {
    log.warn('[anomalyWatch] incident_pattern lookup failed:', err?.message);
    return [];
  }
}

async function findGhostEmployees(workspaceId: string): Promise<Anomaly[]> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT e.id AS employee_id, e.first_name, e.last_name
         FROM employees e
        WHERE e.workspace_id = $1
          AND e.is_active = true
          AND NOT EXISTS (
            SELECT 1 FROM time_entries te
             WHERE te.employee_id = e.id
               AND te.workspace_id = e.workspace_id
               AND te.clock_in >= NOW() - INTERVAL '${GHOST_EMPLOYEE_DAYS} days'
          )
          AND NOT EXISTS (
            SELECT 1 FROM shifts s
             WHERE s.employee_id = e.id
               AND s.workspace_id = e.workspace_id
               AND s.deleted_at IS NULL
               AND s.start_time >= NOW() - INTERVAL '${GHOST_EMPLOYEE_DAYS} days'
          )
          AND EXISTS (
            SELECT 1 FROM client_contracts cc
             WHERE cc.workspace_id = e.workspace_id
               AND cc.status IN ('executed','active','accepted')
          )
        LIMIT 30`,
      [workspaceId],
    );
    return r.rows.map((row: any) => ({
      workspaceId,
      code: 'ghost_employee' as AnomalyCode,
      severity: 'low' as AnomalySeverity,
      summary: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() +
        ` has no clock-ins or shift assignments in the last ${GHOST_EMPLOYEE_DAYS} days.`,
      entityType: 'employee',
      entityId: row.employee_id,
      dedupKey: `ghost_employee:${row.employee_id}`,
      details: { employeeId: row.employee_id },
    }));
  } catch (err: unknown) {
    log.warn('[anomalyWatch] ghost_employee lookup failed:', err?.message);
    return [];
  }
}

async function findBillingAnomalies(workspaceId: string): Promise<Anomaly[]> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `WITH recent AS (
         SELECT id, client_id, total::numeric AS total, issue_date
           FROM invoices
          WHERE workspace_id = $1
            AND status <> 'voided'
            AND status <> 'cancelled'
            AND issue_date >= NOW() - INTERVAL '7 days'
       ),
       baseline AS (
         SELECT client_id, AVG(total::numeric) AS avg_total, COUNT(*) AS n
           FROM invoices
          WHERE workspace_id = $1
            AND status <> 'voided'
            AND status <> 'cancelled'
            AND issue_date >= NOW() - INTERVAL '3 months'
            AND issue_date < NOW() - INTERVAL '7 days'
          GROUP BY client_id
       )
       SELECT r.id AS invoice_id, r.client_id, r.total, b.avg_total,
              (r.total - b.avg_total) / NULLIF(b.avg_total, 0) AS pct_delta
         FROM recent r
         JOIN baseline b ON b.client_id = r.client_id
        WHERE b.n >= 3
          AND b.avg_total > 0
          AND (r.total - b.avg_total) / b.avg_total > $2
        LIMIT 30`,
      [workspaceId, BILLING_ANOMALY_PCT],
    );
    return r.rows.map((row: any) => ({
      workspaceId,
      code: 'billing_anomaly' as AnomalyCode,
      severity: 'medium' as AnomalySeverity,
      summary:
        `Invoice $${Number(row.total).toFixed(2)} is ${(Number(row.pct_delta) * 100).toFixed(0)}% ` +
        `above this client's 3-month average ($${Number(row.avg_total).toFixed(2)}).`,
      entityType: 'invoice',
      entityId: row.invoice_id,
      dedupKey: `billing_anomaly:${row.invoice_id}`,
      details: {
        invoiceId: row.invoice_id,
        clientId: row.client_id,
        total: Number(row.total),
        avgTotal: Number(row.avg_total),
        pctDelta: Number(row.pct_delta),
      },
    }));
  } catch (err: unknown) {
    log.warn('[anomalyWatch] billing_anomaly lookup failed:', err?.message);
    return [];
  }
}

// ─── Dispatch + dedup ─────────────────────────────────────────────────────────

async function notify(a: Anomaly): Promise<boolean> {
  const managers = await fetchManagers(a.workspaceId);

  const inAppResults = await Promise.allSettled(
    managers.map((recipientUserId) =>
      NotificationDeliveryService.send({
        type: 'trinity_alert',
        workspaceId: a.workspaceId,
        recipientUserId,
        channel: 'in_app',
        subject: `Anomaly: ${a.code.replace(/_/g, ' ')}`,
        body: {
          summary: a.summary,
          code: a.code,
          severity: a.severity,
          entityType: a.entityType,
          entityId: a.entityId,
          details: a.details ?? null,
        },
        idempotencyKey: `anomaly-${a.dedupKey}-${recipientUserId}`,
      }),
    ),
  );

  const inAppDelivered = inAppResults.filter((r) => r.status === 'fulfilled').length;
  const inAppFailed = inAppResults.filter((r) => r.status === 'rejected').length;
  for (const r of inAppResults) {
    if (r.status === 'rejected') {
      log.warn('[anomalyWatch] in-app notify failed (non-fatal):', (r.reason as any)?.message ?? r.reason);
    }
  }

  let smsDelivered = 0;
  let smsFailed = 0;
  let smsAttempted = 0;
  if (a.severity === 'high') {
    const contacts = await fetchSupervisorContacts(a.workspaceId);
    const smsTargets = contacts.slice(0, 3);
    smsAttempted = smsTargets.length;
    const smsResults = await Promise.allSettled(
      smsTargets.map((c) =>
        sendSMSToEmployee(
          c.employeeId,
          `Trinity anomaly: ${a.summary}`,
          `anomaly_${a.code}`,
          a.workspaceId,
        ),
      ),
    );
    smsDelivered = smsResults.filter((r) => r.status === 'fulfilled' && (r.value as any)?.success).length;
    smsFailed = smsResults.length - smsDelivered;
    for (const r of smsResults) {
      if (r.status === 'rejected') {
        log.warn('[anomalyWatch] supervisor SMS threw (non-fatal):', (r.reason as any)?.message ?? r.reason);
      } else if (!(r.value as any)?.success) {
        log.info('[anomalyWatch] supervisor SMS not sent:', (r.value as any)?.error);
      }
    }
  }

  const delivered = inAppDelivered > 0 || smsDelivered > 0;

  try {
    await platformEventBus.publish({
      type: 'trinity_anomaly_detected',
      workspaceId: a.workspaceId,
      title: `Anomaly detected: ${a.code}`,
      description: a.summary,
      severity: a.severity,
      metadata: { workflow: WORKFLOW_NAME, ...a },
    } as any);
  } catch (err: unknown) {
    log.warn('[anomalyWatch] event publish failed (non-fatal):', err?.message);
  }

  await logActionAudit({
    actionId: 'trinity.run_anomaly_watch',
    workspaceId: a.workspaceId,
    entityType: a.entityType,
    entityId: a.entityId,
    success: delivered,
    message: a.summary,
    payload: {
      code: a.code,
      severity: a.severity,
      details: a.details ?? null,
      delivery: {
        inAppAttempted: managers.length,
        inAppDelivered,
        inAppFailed,
        smsAttempted,
        smsDelivered,
        smsFailed,
      },
    },
  });

  return delivered;
}

async function alreadyFlagged(a: Anomaly): Promise<boolean> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT 1 FROM audit_logs
        WHERE workspace_id = $1
          AND action = $2
          AND metadata->>'dedup_key' = $3
          AND created_at > NOW() - INTERVAL '${DEDUP_WINDOW_HOURS} hours'
        LIMIT 1`,
      [a.workspaceId, `trinity.${WORKFLOW_NAME}`, a.dedupKey],
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

async function recordAnomaly(a: Anomaly): Promise<void> {
  try {
    const { pool } = await import('../../../db');
    await pool.query(
      `INSERT INTO audit_logs (workspace_id, action, raw_action, entity_type, entity_id,
                               success, source, actor_type, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, true, 'system', 'trinity',
               jsonb_build_object('code', $6::text, 'severity', $7::text,
                                  'dedup_key', $8::text, 'phase', '24'),
               NOW())`,
      [
        a.workspaceId,
        `trinity.${WORKFLOW_NAME}`,
        WORKFLOW_NAME,
        a.entityType,
        a.entityId,
        a.code,
        a.severity,
        a.dedupKey,
      ],
    );
  } catch (err: unknown) {
    log.warn('[anomalyWatch] audit write failed (non-fatal):', err?.message);
  }
}

async function listActiveWorkspaces(): Promise<string[]> {
  const { pool } = await import('../../../db');
  const r = await pool.query(
    `SELECT id FROM workspaces WHERE COALESCE(is_active, true) = true LIMIT 5000`,
  );
  return r.rows.map((row: any) => row.id);
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

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAOS EDGE CASE 1: Mid-shift / Future-shift guard card expiry detection
// Runs inside the AnomalyWatch sweep. Detects officers whose guard card expires
// BEFORE a future assigned shift, not just when it's already expired.
// Trinity creates a compliance alert and flags the future shifts for reassignment.
// ─────────────────────────────────────────────────────────────────────────────
export async function detectFutureShiftGuardCardExpiry(workspaceId: string): Promise<Anomaly[]> {
  const out: Anomaly[] = [];
  try {
    const { pool } = await import('../../../db');

    // Find future shifts assigned to officers whose guard card expires before shift start
    const { rows } = await pool.query<{
      shift_id: string;
      shift_start: string;
      employee_id: string;
      employee_name: string;
      guard_card_expiry: string;
      days_before_expiry: number;
    }>(
      `SELECT
          s.id AS shift_id,
          s.start_time AS shift_start,
          e.id AS employee_id,
          (e.first_name || ' ' || e.last_name) AS employee_name,
          e.guard_card_expiry_date AS guard_card_expiry,
          EXTRACT(DAY FROM (s.start_time - e.guard_card_expiry_date::timestamp)) AS days_before_expiry
        FROM shifts s
        JOIN employees e ON s.employee_id = e.id
        WHERE s.workspace_id = $1
          AND s.start_time > NOW()
          AND s.status NOT IN ('cancelled','calloff','no_show','completed')
          AND e.guard_card_expiry_date IS NOT NULL
          AND e.guard_card_expiry_date::timestamp < s.start_time
        ORDER BY s.start_time ASC
        LIMIT 50`,
      [workspaceId]
    );

    for (const row of rows) {
      out.push({
        workspaceId,
        code: 'compliance_violation' as AnomalyCode,
        severity: 'high',
        title: `Future shift guard card conflict: ${row.employee_name}`,
        description: `${row.employee_name}'s guard card expires ${new Date(row.guard_card_expiry).toLocaleDateString()} — BEFORE their shift on ${new Date(row.shift_start).toLocaleDateString()}. This shift will need to be reassigned or the card renewed (Texas OC 1702).`,
        affectedEntityId: row.shift_id,
        affectedEntityType: 'shift',
        dedupKey: `future-gc-expiry:${row.shift_id}:${row.guard_card_expiry}`,
        metadata: {
          shiftId: row.shift_id,
          employeeId: row.employee_id,
          employeeName: row.employee_name,
          guardCardExpiry: row.guard_card_expiry,
          shiftStart: row.shift_start,
          daysBeforeExpiry: Math.round(row.days_before_expiry),
          reconciliationPath: 'Renew guard card before shift, or reassign shift to a licensed officer.',
        },
      });
    }
  } catch (err: unknown) {
    log.warn('[AnomalyWatch] Future shift guard card check failed:', err?.message);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAOS EDGE CASE 2: Bill rate change after time entries approved (pre-invoice)
// Detects: client bill rate changed AFTER time entries were captured at old rate
// Trinity surfaces a reconciliation alert so the invoice reflects current rates.
// ─────────────────────────────────────────────────────────────────────────────
export async function detectBillRateMismatch(workspaceId: string): Promise<Anomaly[]> {
  const out: Anomaly[] = [];
  try {
    const { pool } = await import('../../../db');

    // Find approved time entries where the captured bill rate differs from current client rate
    const { rows } = await pool.query<{
      entry_id: string;
      employee_name: string;
      client_name: string;
      captured_bill_rate: string;
      current_bill_rate: string;
      hours: string;
      clock_in: string;
      rate_delta: number;
    }>(
      `SELECT
          te.id AS entry_id,
          (e.first_name || ' ' || e.last_name) AS employee_name,
          COALESCE(cl.company_name, cl.first_name || ' ' || cl.last_name, 'Unknown') AS client_name,
          COALESCE(te.captured_bill_rate, '0') AS captured_bill_rate,
          COALESCE(cbs.billable_rate, '0') AS current_bill_rate,
          COALESCE(te.total_hours, '0') AS hours,
          te.clock_in,
          ABS(COALESCE(cbs.billable_rate::numeric, 0) - COALESCE(te.captured_bill_rate::numeric, 0)) AS rate_delta
        FROM time_entries te
        JOIN employees e ON te.employee_id = e.id
        LEFT JOIN clients cl ON te.client_id = cl.id
        LEFT JOIN client_billing_settings cbs ON cbs.client_id = te.client_id AND cbs.workspace_id = $1
        WHERE te.workspace_id = $1
          AND te.status = 'approved'
          AND te.invoice_id IS NULL
          AND te.captured_bill_rate IS NOT NULL
          AND cbs.billable_rate IS NOT NULL
          AND ABS(cbs.billable_rate::numeric - te.captured_bill_rate::numeric) > 0.01
        ORDER BY te.clock_in DESC
        LIMIT 20`,
      [workspaceId]
    );

    for (const row of rows) {
      const capturedRate = parseFloat(row.captured_bill_rate);
      const currentRate = parseFloat(row.current_bill_rate);
      const hours = parseFloat(row.hours);
      const impact = Math.abs((currentRate - capturedRate) * hours);

      out.push({
        workspaceId,
        code: 'billing_anomaly' as AnomalyCode,
        severity: impact > 100 ? 'high' : 'medium',
        title: `Bill rate mismatch: ${row.client_name}`,
        description: `Time entry for ${row.employee_name} at ${row.client_name} was captured at $${capturedRate.toFixed(2)}/h but current client rate is $${currentRate.toFixed(2)}/h. ` +
          `Estimated invoice impact: ${currentRate > capturedRate ? '+' : '-'}$${impact.toFixed(2)}. ` +
          `Reconciliation path: update the time entry bill rate before invoicing.`,
        affectedEntityId: row.entry_id,
        affectedEntityType: 'time_entry',
        dedupKey: `bill-rate-mismatch:${row.entry_id}`,
        metadata: {
          entryId: row.entry_id,
          employeeName: row.employee_name,
          clientName: row.client_name,
          capturedBillRate: capturedRate,
          currentBillRate: currentRate,
          rateDelta: currentRate - capturedRate,
          estimatedInvoiceImpact: impact,
          hoursWorked: hours,
          reconciliationPath: `Update captured_bill_rate on time entry ${row.entry_id} to $${currentRate.toFixed(2)} before generating invoice.`,
        },
      });
    }
  } catch (err: unknown) {
    log.warn('[AnomalyWatch] Bill rate mismatch check failed:', err?.message);
  }
  return out;
}
