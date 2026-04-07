import { Router } from "express";
import { requireAuth } from "../rbac";
import { pool } from "../db";
import { platformEventBus } from "../services/platformEventBus";
import { platformActionHub } from "../services/helpai/platformActionHub";
import { registerLegacyBootstrap } from "../services/legacyBootstrapRegistry";
import { createLogger } from '../lib/logger';
const log = createLogger('WellnessRoutes');


const router = Router();

// Table initialization (deferred to post-DB-ready bootstrap phase)
registerLegacyBootstrap('wellness', async (p) => {
  await p.query(`
    CREATE TABLE IF NOT EXISTS wellness_check_configs (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id varchar NOT NULL UNIQUE,
      default_interval_minutes integer DEFAULT 30,
      escalation_threshold_minutes integer DEFAULT 15,
      supervisor_notification_enabled boolean DEFAULT true,
      emergency_contact_enabled boolean DEFAULT false,
      created_at timestamptz DEFAULT NOW(),
      updated_at timestamptz DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS wellness_check_events (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id varchar NOT NULL,
      session_id varchar NOT NULL,
      employee_id varchar NOT NULL,
      event_type varchar NOT NULL CHECK (event_type IN ('check_in','missed_check_in','sos_triggered','session_started','session_ended','supervisor_alerted')),
      latitude numeric,
      longitude numeric,
      notes text,
      created_at timestamptz DEFAULT NOW()
    );
  `);
});

// Trinity Actions Registration
platformActionHub.registerAction({
  actionId: 'wellness.active_sessions',
  name: 'Active Wellness Sessions',
  category: 'automation',
  description: 'Count of active lone worker sessions',
  requiredRoles: ['guard', 'supervisor', 'manager', 'owner', 'root_admin'],
  inputSchema: { type: 'object', properties: {} },
  handler: async (request: any) => {
    const t = Date.now();
    try {
      const { rows } = await pool.query(
        "SELECT count(*)::int as count FROM lone_worker_sessions WHERE workspace_id = $1 AND status = 'active'",
        [request.workspaceId]
      );
      return { success: true, actionId: 'wellness.active_sessions', message: `Found \${rows[0].count} active sessions`, executionTimeMs: Date.now() - t, data: { count: rows[0].count } };
    } catch (err) {
      return { success: false, actionId: 'wellness.active_sessions', message: 'Failed to fetch active sessions', executionTimeMs: Date.now() - t };
    }
  }
});

platformActionHub.registerAction({
  actionId: 'wellness.sos_alerts',
  name: 'SOS Alerts (24h)',
  category: 'automation',
  description: 'SOS events in last 24h',
  requiredRoles: ['guard', 'supervisor', 'manager', 'owner', 'root_admin'],
  inputSchema: { type: 'object', properties: { hours: { type: 'integer', description: 'Lookback window in hours', default: 24 } } },
  handler: async (request: any) => {
    const t = Date.now();
    try {
      const { rows } = await pool.query(
        "SELECT count(*)::int as count FROM wellness_check_events WHERE workspace_id = $1 AND event_type = 'sos_triggered' AND created_at > NOW() - interval '24 hours'",
        [request.workspaceId]
      );
      return { success: true, actionId: 'wellness.sos_alerts', message: `Found \${rows[0].count} SOS alerts in last 24h`, executionTimeMs: Date.now() - t, data: { count: rows[0].count } };
    } catch (err) {
      return { success: false, actionId: 'wellness.sos_alerts', message: 'Failed to fetch SOS alerts', executionTimeMs: Date.now() - t };
    }
  }
});

platformActionHub.registerAction({
  actionId: 'wellness.overdue_checkins',
  name: 'Overdue Check-ins',
  category: 'automation',
  description: 'Sessions where next check-in is overdue',
  requiredRoles: ['guard', 'supervisor', 'manager', 'owner', 'root_admin'],
  inputSchema: { type: 'object', properties: {} },
  handler: async (request: any) => {
    const t = Date.now();
    try {
      const { rows } = await pool.query(
        "SELECT count(*)::int as count FROM lone_worker_sessions WHERE workspace_id = $1 AND status = 'active' AND next_check_in_due < NOW()",
        [request.workspaceId]
      );
      return { success: true, actionId: 'wellness.overdue_checkins', message: `Found \${rows[0].count} overdue check-ins`, executionTimeMs: Date.now() - t, data: { count: rows[0].count } };
    } catch (err) {
      return { success: false, actionId: 'wellness.overdue_checkins', message: 'Failed to fetch overdue check-ins', executionTimeMs: Date.now() - t };
    }
  }
});

// Routes
router.get("/overdue", requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, e.name as employee_name 
       FROM lone_worker_sessions s
       LEFT JOIN employees e ON e.id = s.employee_id
       WHERE s.workspace_id = $1 AND s.status = 'active' AND s.next_check_in_due < NOW()`,
      [req.workspaceId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch overdue sessions" });
  }
});

router.get("/config", requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM wellness_check_configs WHERE workspace_id = $1",
      [req.workspaceId]
    );
    if (rows.length === 0) {
      return res.json({
        default_interval_minutes: 30,
        escalation_threshold_minutes: 15,
        supervisor_notification_enabled: true,
        emergency_contact_enabled: false
      });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch config" });
  }
});

router.patch("/config", requireAuth, async (req: any, res) => {
  const { defaultIntervalMinutes, escalationThresholdMinutes, supervisorNotificationEnabled } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO wellness_check_configs (workspace_id, default_interval_minutes, escalation_threshold_minutes, supervisor_notification_enabled, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (workspace_id) DO UPDATE SET
         default_interval_minutes = EXCLUDED.default_interval_minutes,
         escalation_threshold_minutes = EXCLUDED.escalation_threshold_minutes,
         supervisor_notification_enabled = EXCLUDED.supervisor_notification_enabled,
         updated_at = NOW()
       RETURNING *`,
      [req.workspaceId, defaultIntervalMinutes, escalationThresholdMinutes, supervisorNotificationEnabled]
    );
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to update config" });
  }
});

router.get("/sessions", requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, e.name as employee_name 
       FROM lone_worker_sessions s
       LEFT JOIN employees e ON e.id = s.employee_id
       WHERE s.workspace_id = $1 AND s.status = 'active'`,
      [req.workspaceId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

router.post("/sessions", requireAuth, async (req: any, res) => {
  const { employeeId, shiftId, checkInIntervalMinutes } = req.body;
  const interval = checkInIntervalMinutes || 30;
  try {
    const { rows } = await pool.query(
      `INSERT INTO lone_worker_sessions (workspace_id, employee_id, shift_id, status, check_in_interval, next_check_in_due)
       VALUES ($1, $2, $3, 'active', $4, NOW() + ($4 || ' minutes')::interval)
       RETURNING *`,
      [req.workspaceId, employeeId, shiftId, interval]
    );
    const session = rows[0];

    await pool.query(
      "INSERT INTO wellness_check_events (workspace_id, session_id, employee_id, event_type) VALUES ($1, $2, $3, 'session_started')",
      [req.workspaceId, session.id, employeeId]
    );

    res.json(session);
  } catch (error) {
    log.error("Error starting wellness session:", error);
    res.status(500).json({ error: "Failed to start session" });
  }
});

router.post("/sessions/:id/checkin", requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE lone_worker_sessions 
       SET last_check_in = NOW(), 
           next_check_in_due = NOW() + (check_in_interval || ' minutes')::interval 
       WHERE id = $1 AND workspace_id = $2 AND status = 'active'
       RETURNING *`,
      [req.params.id, req.workspaceId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: "Session not found or not active" });
    }

    const session = rows[0];
    await pool.query(
      "INSERT INTO wellness_check_events (workspace_id, session_id, employee_id, event_type) VALUES ($1, $2, $3, 'check_in')",
      [req.workspaceId, session.id, session.employee_id]
    );

    res.json(session);
  } catch (error) {
    res.status(500).json({ error: "Failed to check in" });
  }
});

router.post("/sessions/:id/sos", requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM lone_worker_sessions WHERE id = $1 AND workspace_id = $2",
      [req.params.id, req.workspaceId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const session = rows[0];
    await pool.query(
      "INSERT INTO wellness_check_events (workspace_id, session_id, employee_id, event_type) VALUES ($1, $2, $3, 'sos_triggered')",
      [req.workspaceId, session.id, session.employee_id]
    );

    platformEventBus.publish({
      type: 'sos_triggered',
      category: 'automation',
      title: 'SOS Alert Triggered',
      description: `SOS triggered by employee ID: \${session.employee_id}`,
      workspaceId: req.workspaceId,
      metadata: { sessionId: session.id, employeeId: session.employee_id }
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to trigger SOS" });
  }
});

router.post("/sessions/:id/end", requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE lone_worker_sessions SET status = 'ended', ended_at = NOW() WHERE id = $1 AND workspace_id = $2 RETURNING *",
      [req.params.id, req.workspaceId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const session = rows[0];
    await pool.query(
      "INSERT INTO wellness_check_events (workspace_id, session_id, employee_id, event_type) VALUES ($1, $2, $3, 'session_ended')",
      [req.workspaceId, session.id, session.employee_id]
    );

    res.json(session);
  } catch (error) {
    res.status(500).json({ error: "Failed to end session" });
  }
});

router.get("/sessions/:id/events", requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM wellness_check_events WHERE session_id = $1 AND workspace_id = $2 ORDER BY created_at DESC",
      [req.params.id, req.workspaceId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

export default router;
