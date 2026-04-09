import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../auth";
import { ensureWorkspaceAccess } from "../middleware/workspaceScope";
import { typedPool } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
const log = createLogger('SituationRoutes');


export const situationRouter = Router();

function wid(req: any): string {
  return req.workspaceId || req.session?.workspaceId;
}

async function q(text: string, params: any[] = []) {
  const r = await typedPool(text, params);
  return r.rows;
}

situationRouter.get("/guards", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const guards = await q(
      `SELECT e.id, e.first_name || ' ' || e.last_name AS name, e.role, e.status,
              te.clock_in IS NOT NULL AND te.clock_out IS NULL AS is_clocked_in,
              te.clock_in AS last_clock_in,
              s.name AS current_site
       FROM employees e
       LEFT JOIN LATERAL (
         SELECT clock_in, clock_out, site_id
         FROM time_entries
         WHERE employee_id = e.id AND workspace_id = $1
         ORDER BY clock_in DESC LIMIT 1
       ) te ON true
       LEFT JOIN sites s ON te.site_id = s.id
       WHERE e.workspace_id = $1
       ORDER BY te.clock_in DESC NULLS LAST, e.last_name`,
      [workspaceId]
    );

    const mapped = guards.map((g: any) => ({
      id: g.id,
      name: g.name,
      role: g.role || "guard",
      status: g.is_clocked_in ? "on_duty" : g.status === "active" ? "off_duty" : "inactive",
      currentSite: g.current_site || null,
      lastClockIn: g.last_clock_in || null,
    }));

    res.json(mapped);
  } catch (err: unknown) {
    log.error("Situation board guards error:", err);
    res.status(500).json({ error: "Failed to load guard statuses" });
  }
});

situationRouter.get("/incidents", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const incidents = await q(
      `SELECT id, title, severity, status, location_address as location, reported_by,
              COALESCE(occurred_at, updated_at) as created_at
       FROM incident_reports
       WHERE workspace_id = $1 AND status NOT IN ('closed', 'resolved')
       ORDER BY
         CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         COALESCE(occurred_at, updated_at) DESC
       LIMIT 50`,
      [workspaceId]
    );
    res.json(incidents);
  } catch (err: unknown) {
    log.error("Situation board incidents error:", err);
    res.status(500).json({ error: "Failed to load incidents" });
  }
});

situationRouter.get("/open-shifts", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const shifts = await q(
      `SELECT sh.id, sh.title, sh.start_time, sh.end_time, sh.status,
              s.name AS site_name, e.first_name || ' ' || e.last_name AS assigned_to
       FROM shifts sh
       LEFT JOIN sites s ON sh.site_id = s.id
       LEFT JOIN employees e ON sh.employee_id = e.id
       WHERE sh.workspace_id = $1
         AND sh.start_time >= NOW() - INTERVAL '1 day'
         AND sh.start_time <= NOW() + INTERVAL '48 hours'
         AND (sh.employee_id IS NULL OR sh.status IN ('draft', 'pending'))
       ORDER BY sh.start_time ASC
       LIMIT 50`,
      [workspaceId]
    );
    res.json(shifts);
  } catch (err: unknown) {
    log.error("Situation board open shifts error:", err);
    res.status(500).json({ error: "Failed to load open shifts" });
  }
});

situationRouter.get("/summary", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);

    const [guardCounts] = await q(
      `SELECT
         COUNT(*) FILTER (WHERE e.status = 'active') AS total_active,
         COUNT(*) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM time_entries te
             WHERE te.employee_id = e.id AND te.workspace_id = $1
               AND te.clock_in IS NOT NULL AND te.clock_out IS NULL
           )
         ) AS on_duty
       FROM employees e
       WHERE e.workspace_id = $1`,
      [workspaceId]
    );

    const [incidentCounts] = await q(
      `SELECT
         COUNT(*) FILTER (WHERE status NOT IN ('closed', 'resolved')) AS active_incidents,
         COUNT(*) FILTER (WHERE severity IN ('critical', 'high') AND status NOT IN ('closed', 'resolved')) AS critical_incidents
       FROM incident_reports
       WHERE workspace_id = $1`,
      [workspaceId]
    );

    const [shiftCounts] = await q(
      `SELECT
         COUNT(*) FILTER (WHERE employee_id IS NULL OR status IN ('draft', 'pending')) AS open_shifts,
         COUNT(*) AS total_upcoming
       FROM shifts
       WHERE workspace_id = $1
         AND start_time >= NOW() - INTERVAL '1 day'
         AND start_time <= NOW() + INTERVAL '48 hours'`,
      [workspaceId]
    );

    res.json({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      totalGuards: parseInt(guardCounts?.total_active || "0"),
      // @ts-expect-error — TS migration: fix in refactoring sprint
      onDuty: parseInt(guardCounts?.on_duty || "0"),
      // @ts-expect-error — TS migration: fix in refactoring sprint
      activeIncidents: parseInt(incidentCounts?.active_incidents || "0"),
      // @ts-expect-error — TS migration: fix in refactoring sprint
      criticalIncidents: parseInt(incidentCounts?.critical_incidents || "0"),
      // @ts-expect-error — TS migration: fix in refactoring sprint
      openShifts: parseInt(shiftCounts?.open_shifts || "0"),
      // @ts-expect-error — TS migration: fix in refactoring sprint
      totalUpcomingShifts: parseInt(shiftCounts?.total_upcoming || "0"),
    });
  } catch (err: unknown) {
    log.error("Situation board summary error:", err);
    res.status(500).json({ error: "Failed to load summary" });
  }
});
