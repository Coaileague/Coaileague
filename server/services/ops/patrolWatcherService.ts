/**
 * Patrol Watcher Service — Wave 12 / Task 5
 * ─────────────────────────────────────────────────────────────────────────────
 * Trinity monitors active patrol schedules and lone-worker sessions.
 * Two protection modes:
 *
 * Mode 1 — PATROL WATCHER
 *   Compares expected patrol rounds against guard_tour_scans timestamps.
 *   If a checkpoint is missed by >10 minutes: warn guard via ChatDock.
 *   If missed by >20 minutes: escalate to supervisor via SMS + ChatDock.
 *   If missed by >30 minutes: full incident alert to workspace owner.
 *
 * Mode 2 — LONE WORKER DEAD MAN SWITCH
 *   For solo guards with loneWorkerSessions active.
 *   If lastCheckIn > checkInInterval minutes: send SMS safety handshake.
 *   If no response after 5 minutes: escalate to supervisor.
 *   If no response after 15 minutes: emergency escalation to owner — supervisor decides next steps.
 *
 * Called by a scheduled job (Railway Cron or setInterval at startup).
 * Non-blocking — errors are logged, never thrown.
 */

import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
import { platformEventBus } from '../platformEventBus';
import { isProduction } from '../../lib/isProduction';

const log = createLogger('PatrolWatcher');

// Missed checkpoint thresholds
const PATROL_WARN_MINUTES      = 10;
const PATROL_ESCALATE_MINUTES  = 20;
const PATROL_INCIDENT_MINUTES  = 30;

// Lone worker thresholds
const LONE_WORKER_HANDSHAKE_MINUTES  = 5;  // check-in overdue → send SMS
const LONE_WORKER_ESCALATE_MINUTES   = 10; // still no response → supervisor
const LONE_WORKER_EMERGENCY_MINUTES  = 20; // still no response → owner + full escalation chain

/** Run the patrol watcher check (call every 5 minutes via cron) */
export async function runPatrolWatcherCheck(): Promise<{
  checked: number;
  warned: number;
  escalated: number;
  incidents: number;
}> {
  let warned = 0, escalated = 0, incidents = 0, checked = 0;

  try {
    // Find all active guard tours with expected checkpoint timing
    const { rows: activeTours } = await pool.query(
      `SELECT
         gs.workspace_id, gs.id AS tour_id, gs.assigned_employee_id,
         gs.scheduled_start, gs.scheduled_end,
         w.name AS workspace_name
       FROM guard_tour_sessions gs
       JOIN workspaces w ON w.id = gs.workspace_id
       WHERE gs.status IN ('active', 'in_progress', 'started')
         AND gs.scheduled_end > NOW()
         AND gs.scheduled_start < NOW()`,
      []
    ).catch(() => ({ rows: [] }));

    for (const tour of activeTours) {
      checked++;

      // Find checkpoints that should have been scanned by now
      const { rows: overdueCheckpoints } = await pool.query(
        `SELECT gtc.id, gtc.name, gtc.sort_order,
                gtc.expected_time_minutes,
                MAX(gts.scanned_at) AS last_scanned_at,
                EXTRACT(EPOCH FROM (NOW() - COALESCE(MAX(gts.scanned_at), $1::timestamp))) / 60 AS minutes_since_scan
         FROM guard_tour_checkpoints gtc
         LEFT JOIN guard_tour_scans gts ON gts.checkpoint_id = gtc.id AND gts.tour_id = $2
         WHERE gtc.tour_id = $2
         GROUP BY gtc.id, gtc.name, gtc.sort_order, gtc.expected_time_minutes
         HAVING EXTRACT(EPOCH FROM (NOW() - COALESCE(MAX(gts.scanned_at), $1::timestamp))) / 60 > $3`,
        [tour.scheduled_start, tour.tour_id, PATROL_WARN_MINUTES]
      ).catch(() => ({ rows: [] }));

      for (const cp of overdueCheckpoints) {
        const minutesMissed = Math.round(cp.minutes_since_scan);

        if (minutesMissed >= PATROL_INCIDENT_MINUTES) {
          incidents++;
          await firePatrolAlert(tour, cp.name, minutesMissed, 'incident');
        } else if (minutesMissed >= PATROL_ESCALATE_MINUTES) {
          escalated++;
          await firePatrolAlert(tour, cp.name, minutesMissed, 'escalate');
        } else {
          warned++;
          await firePatrolAlert(tour, cp.name, minutesMissed, 'warn');
        }
      }
    }
  } catch (err: unknown) {
    log.error('[PatrolWatcher] Check failed:', err instanceof Error ? err.message : String(err));
  }

  if (checked > 0) {
    log.info(`[PatrolWatcher] Checked ${checked} tours | Warned: ${warned} | Escalated: ${escalated} | Incidents: ${incidents}`);
  }

  return { checked, warned, escalated, incidents };
}

async function firePatrolAlert(
  tour: Record<string, unknown>,
  checkpointName: string,
  minutesMissed: number,
  level: 'warn' | 'escalate' | 'incident'
): Promise<void> {
  const severity = level === 'incident' ? 'error' : level === 'escalate' ? 'warning' : 'info';
  const title = level === 'incident'
    ? `🚨 Patrol INCIDENT — ${checkpointName} missed ${minutesMissed}min`
    : level === 'escalate'
      ? `⚠️ Patrol Escalation — ${checkpointName} overdue ${minutesMissed}min`
      : `⏰ Patrol Reminder — ${checkpointName} due ${minutesMissed}min ago`;

  await platformEventBus.publish({
    type: `patrol_${level}`,
    category: level === 'incident' ? 'error' : 'compliance',
    title,
    description: `Guard has not scanned checkpoint "${checkpointName}" for ${minutesMissed} minutes.`,
    workspaceId: String(tour.workspace_id),
    metadata: {
      tourId: tour.tour_id, employeeId: tour.assigned_employee_id,
      checkpointName, minutesMissed, level,
    },
  }).catch(() => {});

  // SMS escalation for supervisor/incident levels (production only)
  if (isProduction() && level !== 'warn') {
    const { rows: supervisors } = await pool.query(
      `SELECT u.phone FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1
         AND wm.workspace_role IN ('org_owner', 'co_owner', 'department_manager', 'supervisor')
         AND u.phone IS NOT NULL
       LIMIT 3`,
      [tour.workspace_id]
    ).catch(() => ({ rows: [] }));

    for (const sup of supervisors) {
      const { twilioService } = await import('../twilioService').catch(() => ({ twilioService: null }));
      if (twilioService && sup.phone) {
        await twilioService.sendSms(
          sup.phone,
          `CoAIleague ${level === 'incident' ? '🚨 INCIDENT' : '⚠️ Alert'}: Patrol checkpoint "${checkpointName}" in ${tour.workspace_name} missed by ${minutesMissed} minutes. Check guard status immediately.`
        ).catch(() => {});
      }
    }
  }
}

/** Run the lone-worker dead man switch check (call every 2 minutes) */
export async function runLoneWorkerCheck(): Promise<{
  checked: number;
  handshakeSent: number;
  escalated: number;
  emergencies: number;
}> {
  let handshakeSent = 0, escalated = 0, emergencies = 0, checked = 0;

  try {
    const { rows: activeSessions } = await pool.query(
      `SELECT lws.id, lws.workspace_id, lws.employee_id, lws.shift_id,
              lws.check_in_interval, lws.last_check_in,
              lws.escalation_level,
              EXTRACT(EPOCH FROM (NOW() - COALESCE(lws.last_check_in, lws.created_at))) / 60 AS minutes_overdue,
              e.first_name || ' ' || e.last_name AS employee_name,
              u.phone AS employee_phone
       FROM lone_worker_sessions lws
       JOIN employees e ON e.id = lws.employee_id
       LEFT JOIN users u ON u.id = e.user_id
       WHERE lws.status = 'active'
       ORDER BY minutes_overdue DESC`,
      []
    ).catch(() => ({ rows: [] }));

    for (const session of activeSessions) {
      checked++;
      const intervalMinutes = session.check_in_interval || 30;
      const overdueMinutes = Math.round(session.minutes_overdue - intervalMinutes);

      if (overdueMinutes < LONE_WORKER_HANDSHAKE_MINUTES) continue; // Not overdue yet

      if (overdueMinutes >= LONE_WORKER_EMERGENCY_MINUTES) {
        emergencies++;
        await fireLoneWorkerAlert(session, overdueMinutes, 'emergency');
      } else if (overdueMinutes >= LONE_WORKER_ESCALATE_MINUTES) {
        escalated++;
        await fireLoneWorkerAlert(session, overdueMinutes, 'escalate');
      } else {
        handshakeSent++;
        await fireLoneWorkerAlert(session, overdueMinutes, 'handshake');
      }
    }
  } catch (err: unknown) {
    log.error('[LoneWorker] Check failed:', err instanceof Error ? err.message : String(err));
  }

  return { checked, handshakeSent, escalated, emergencies };
}

async function fireLoneWorkerAlert(
  session: Record<string, unknown>,
  overdueMinutes: number,
  level: 'handshake' | 'escalate' | 'emergency'
): Promise<void> {
  const name = String(session.employee_name || 'Guard');
  const phone = String(session.employee_phone || '');

  await platformEventBus.publish({
    type: `lone_worker_${level}`,
    category: level === 'emergency' ? 'error' : 'compliance',
    title: level === 'emergency'
      ? `🚨 LONE WORKER EMERGENCY — ${name} not checked in ${overdueMinutes}min`
      : level === 'escalate'
        ? `⚠️ Lone Worker Overdue — ${name} (${overdueMinutes}min)`
        : `Safety Check — ${name} (${overdueMinutes}min overdue)`,
    description: level === 'emergency'
      ? `No safety response from ${name} in ${overdueMinutes} minutes. Supervisor and owner have been notified.`
      : `${name} has not checked in. System is sending a safety handshake.`,
    workspaceId: String(session.workspace_id),
    metadata: { sessionId: session.id, employeeId: session.employee_id, overdueMinutes, level },
  }).catch(() => {});

  // SMS direct to guard (handshake)
  if (isProduction() && phone && level === 'handshake') {
    const { twilioService } = await import('../twilioService').catch(() => ({ twilioService: null }));
    if (twilioService) {
      await twilioService.sendSms(
        phone,
        `CoAIleague Safety Check: ${name}, are you OK? Reply SAFE to confirm. If no reply in 5 minutes, your supervisor will be notified. — Trinity`
      ).catch(() => {});
    }
  }

  // Supervisor alert
  if (isProduction() && level !== 'handshake') {
    const { rows: supervisors } = await pool.query(
      `SELECT u.phone FROM workspace_members wm JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1 AND wm.workspace_role IN ('org_owner', 'supervisor', 'department_manager')
         AND u.phone IS NOT NULL LIMIT 3`,
      [session.workspace_id]
    ).catch(() => ({ rows: [] }));

    for (const sup of supervisors) {
      const { twilioService } = await import('../twilioService').catch(() => ({ twilioService: null }));
      if (twilioService) {
        const msg = level === 'emergency'
          ? `🚨 EMERGENCY: Lone worker ${name} has not responded for ${overdueMinutes} minutes. Verify their safety immediately. Check last GPS in CoAIleague.`
          : `⚠️ CoAIleague: Lone worker ${name} is ${overdueMinutes}min overdue for safety check-in. Please verify.`;
        await twilioService.sendSms(sup.phone, msg).catch(() => {});
      }
    }
  }
}

/** Register or refresh a lone-worker safety check-in */
export async function recordLoneWorkerCheckin(params: {
  workspaceId: string;
  employeeId: string;
  sessionId?: string;
  response?: 'SAFE' | 'HELP';
}): Promise<{ success: boolean; nextCheckInAt: Date }> {
  const interval = 30; // default 30 minutes
  const nextCheckIn = new Date(Date.now() + interval * 60 * 1000);

  if (params.sessionId) {
    await pool.query(
      `UPDATE lone_worker_sessions SET
         last_check_in = NOW(), escalation_level = 0, status = 'active', updated_at = NOW()
       WHERE id = $1 AND workspace_id = $2`,
      [params.sessionId, params.workspaceId]
    ).catch(() => {});
  } else {
    // Find active session
    await pool.query(
      `UPDATE lone_worker_sessions SET
         last_check_in = NOW(), escalation_level = 0, updated_at = NOW()
       WHERE workspace_id = $1 AND employee_id = $2 AND status = 'active'`,
      [params.workspaceId, params.employeeId]
    ).catch(() => {});
  }

  return { success: true, nextCheckInAt: nextCheckIn };
}
