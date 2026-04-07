import { Router } from "express";
import { pool, db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../auth";
import { requireManager } from "../rbac";
import { ensureWorkspaceAccess } from "../middleware/workspaceScope";
import { sanitizeError } from "../middleware/errorHandler";
import { randomUUID } from "crypto";
import { platformEventBus } from "../services/platformEventBus";
import { broadcastToWorkspace } from "../websocket";
import { typedPool } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
const log = createLogger('CadRoutes');

export const cadRouter = Router();

const cadCallLocks = new Map<string, { lockedBy: string; lockedByName: string; lockedAt: number }>();
const CAD_LOCK_TTL_MS = 5 * 60 * 1000;

function isLockExpired(lock: { lockedAt: number }): boolean {
  return Date.now() - lock.lockedAt > CAD_LOCK_TTL_MS;
}

function cleanExpiredLocks() {
  for (const [key, lock] of cadCallLocks.entries()) {
    if (isLockExpired(lock)) cadCallLocks.delete(key);
  }
}

setInterval(cleanExpiredLocks, 60 * 1000);

function genCallNum() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `CAD-${y}${m}${d}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function wid(req: any) {
  return req.workspaceId || req.session?.workspaceId;
}

async function q(text: string, params: any[] = []) {
  const r = await typedPool(text, params);
  return r.rows;
}

// ─── CAD CALLS ───────────────────────────────────────────────────────────────

cadRouter.get("/calls", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { status, priority, siteId, limit = 50, offset = 0 } = req.query;
    let query = `SELECT cc.*, cu.employee_name AS primary_unit_name, cu.unit_identifier AS primary_unit_identifier
      FROM cad_calls cc
      LEFT JOIN cad_units cu ON cu.id = cc.primary_unit_id
      WHERE cc.workspace_id=$1`;
    const params: any[] = [workspaceId];
    let i = 2;
    if (status) { query += ` AND cc.status=$${i++}`; params.push(status); }
    if (priority) { query += ` AND cc.priority=$${i++}`; params.push(priority); }
    if (siteId) { query += ` AND cc.site_id=$${i++}`; params.push(siteId); }
    query += ` ORDER BY cc.received_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
    res.json({ calls: await q(query, params) });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

cadRouter.get("/calls/:id", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const rows = await q(`SELECT * FROM cad_calls WHERE id=$1 AND workspace_id=$2`, [req.params.id, wid(req)]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const log = await q(`SELECT * FROM cad_dispatch_log WHERE call_id=$1 ORDER BY logged_at ASC`, [req.params.id]);
    res.json({ ...rows[0], dispatchLog: log });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

cadRouter.post("/calls", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { callType, priority = 2, siteId, siteName, locationDescription, callerName, callerPhone, callerType, incidentDescription, createdBy, latitude, longitude } = req.body;
    if (!locationDescription || !incidentDescription) return res.status(400).json({ error: "locationDescription, incidentDescription required" });
    const id = randomUUID();
    const callNumber = genCallNum();
    await q(`INSERT INTO cad_calls (id,workspace_id,call_number,call_type,priority,status,site_id,site_name,location_description,caller_name,caller_phone,caller_type,incident_description,dispatched_units,received_at,created_by,latitude,longitude,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10,$11,$12,'[]',NOW(),$13,$14,$15,NOW(),NOW())`,
      [id, workspaceId, callNumber, callType||"other", Number(priority), siteId||null, siteName||null, locationDescription, callerName||null, callerPhone||null, callerType||null, incidentDescription, createdBy||null, latitude||null, longitude||null]);
    const rows = await q(`SELECT * FROM cad_calls WHERE id=$1`, [id]);
    await broadcastToWorkspace(workspaceId, { type: "cad:new_call", data: rows[0] });
    await q(`INSERT INTO cad_dispatch_log (id,workspace_id,call_id,action,action_by,action_by_name,notes,logged_at) VALUES($1,$2,$3,'call_received',$4,'Dispatch','Call for service received',NOW())`,
      [randomUUID(), workspaceId, id, createdBy||null]);
    platformEventBus.publish({
      type: 'cad_call_created',
      category: 'ai_brain',
      title: 'CAD Call Created',
      description: `New ${callType||"other"} call ${callNumber} created at ${siteName || locationDescription}`,
      workspaceId,
      metadata: {
        callId: id, callNumber, callType: callType||"other", priority: Number(priority),
        siteId: siteId||null, siteName: siteName||null, locationDescription, incidentDescription,
        createdBy, latitude, longitude,
      }
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    res.status(201).json(rows[0]);
  } catch (e: unknown) { res.status(400).json({ error: sanitizeError(e) }); }
});

cadRouter.post("/calls/:id/dispatch", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { unitId, dispatchedBy, dispatchedByName } = req.body;

    const lockKey = `${workspaceId}:${req.params.id}`;
    const lock = cadCallLocks.get(lockKey);
    if (lock && !isLockExpired(lock) && lock.lockedBy !== dispatchedBy) {
      return res.status(409).json({ error: "Call is locked by another dispatcher", lockedBy: lock.lockedBy, lockedByName: lock.lockedByName });
    }

    let notFound = false;
    // GAP 2 converted: pool.connect()+BEGIN/COMMIT → db.transaction() | FOR UPDATE via tx.execute(sql) | 2026-03-23
    await db.transaction(async (tx) => {
      const callResult = await tx.execute(sql`SELECT * FROM cad_calls WHERE id=${req.params.id} AND workspace_id=${workspaceId} FOR UPDATE`);
      const callRows = (callResult as any).rows || [];
      if (!callRows.length) { notFound = true; return; }
      const call = callRows[0] as any;
      const currentUnits = Array.isArray(call.dispatched_units) ? call.dispatched_units : [];
      if (!currentUnits.includes(unitId)) currentUnits.push(unitId);
      await tx.execute(sql`UPDATE cad_calls SET status='dispatched', dispatched_units=${JSON.stringify(currentUnits)}, primary_unit_id=${unitId}, dispatched_at=NOW(), updated_at=NOW() WHERE id=${req.params.id}`);
      await tx.execute(sql`UPDATE cad_units SET current_status='dispatched', current_call_id=${req.params.id}, updated_at=NOW() WHERE id=${unitId} AND workspace_id=${workspaceId}`);
      await tx.execute(sql`INSERT INTO cad_dispatch_log (id,workspace_id,call_id,unit_id,action,action_by,action_by_name,notes,logged_at) VALUES(${randomUUID()},${workspaceId},${req.params.id},${unitId},'unit_dispatched',${dispatchedBy||null},${dispatchedByName||"Dispatch"},'Unit dispatched to call',NOW())`);
    });
    if (notFound) return res.status(404).json({ error: "Call not found" });
    const updated = (await q(`SELECT * FROM cad_calls WHERE id=$1 AND workspace_id=$2`, [req.params.id, workspaceId]))[0];
    await broadcastToWorkspace(workspaceId, { type: "cad:call_updated", data: updated });
    await broadcastToWorkspace(workspaceId, { type: "cad:unit_status_changed", data: { unitId, status: "dispatched", callId: req.params.id } });
    platformEventBus.publish({
      type: 'cad_call_dispatched',
      category: 'ai_brain',
      title: 'CAD Call Dispatched',
      description: `Unit ${unitId} dispatched to call ${req.params.id}`,
      workspaceId,
      metadata: { callId: req.params.id, unitId, dispatchedBy, dispatchedByName }
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    res.json(updated);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

cadRouter.post("/calls/:id/on-scene", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { unitId, reportedBy } = req.body;
    await q(`UPDATE cad_calls SET status='on_scene', on_scene_at=NOW(), updated_at=NOW() WHERE id=$1 AND workspace_id=$2`, [req.params.id, workspaceId]);
    if (unitId) await q(`UPDATE cad_units SET current_status='on_scene', updated_at=NOW() WHERE id=$1 AND workspace_id=$2`, [unitId, workspaceId]);
    await q(`INSERT INTO cad_dispatch_log (id,workspace_id,call_id,unit_id,action,action_by_name,notes,logged_at) VALUES($1,$2,$3,$4,'on_scene',$5,'Unit arrived on scene',NOW())`,
      [randomUUID(), workspaceId, req.params.id, unitId||null, reportedBy||"Officer"]);
    const updated = await q(`SELECT * FROM cad_calls WHERE id=$1 AND workspace_id=$2`, [req.params.id, workspaceId]);
    await broadcastToWorkspace(workspaceId, { type: "cad:call_updated", data: updated[0] });
    res.json(updated[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

cadRouter.post("/calls/:id/resolve", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { resolutionCode, resolutionNotes, closedBy, incidentReportId } = req.body;

    const lockKey = `${workspaceId}:${req.params.id}`;
    const lock = cadCallLocks.get(lockKey);
    if (lock && !isLockExpired(lock) && lock.lockedBy !== closedBy) {
      return res.status(409).json({ error: "Call is locked by another dispatcher", lockedBy: lock.lockedBy, lockedByName: lock.lockedByName });
    }
    cadCallLocks.delete(lockKey);

    await q(`UPDATE cad_calls SET status='resolved', resolution_code=$1, resolution_notes=$2, incident_report_id=$3, resolved_at=NOW(), closed_at=NOW(), updated_at=NOW() WHERE id=$4 AND workspace_id=$5`,
      [resolutionCode||null, resolutionNotes||null, incidentReportId||null, req.params.id, workspaceId]);
    const callRows = await q(`SELECT * FROM cad_calls WHERE id=$1 AND workspace_id=$2`, [req.params.id, workspaceId]);
    const call = callRows[0] as any;
    const units = Array.isArray(call.dispatched_units) ? call.dispatched_units : [];
    for (const uid of units) {
      await q(`UPDATE cad_units SET current_status='available', current_call_id=NULL, updated_at=NOW() WHERE id=$1 AND workspace_id=$2`, [uid, workspaceId]);
      await broadcastToWorkspace(workspaceId, { type: "cad:unit_status_changed", data: { unitId: uid, status: "available" } });
    }
    await q(`INSERT INTO cad_dispatch_log (id,workspace_id,call_id,action,action_by_name,notes,logged_at) VALUES($1,$2,$3,'call_closed',$4,$5,NOW())`,
      [randomUUID(), workspaceId, req.params.id, closedBy||"Dispatch", resolutionNotes||"Call resolved"]);
    await broadcastToWorkspace(workspaceId, { type: "cad:call_updated", data: call });
    platformEventBus.publish({
      type: 'cad_call_resolved',
      category: 'ai_brain',
      title: 'CAD Call Resolved',
      description: `Call ${call.call_number} resolved by ${closedBy}`,
      workspaceId,
      metadata: { callId: req.params.id, closedBy, resolutionNotes }
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    res.json(call);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ─── CAD UNITS ───────────────────────────────────────────────────────────────

cadRouter.get("/units", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    res.json({ units: await q(`SELECT * FROM cad_units WHERE workspace_id=$1 ORDER BY unit_identifier`, [wid(req)]) });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// Schedule-view: joins CAD units with today's active shifts for 3-state officer view
cadRouter.get("/units/schedule-view", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const now = new Date().toISOString();

    // Get all scheduled officers and their current state
    const scheduledOfficers = await q(`
      SELECT DISTINCT ON (e.id)
        e.id AS employee_id,
        e.id::text AS employee_id_str,
        COALESCE(e.first_name || ' ' || e.last_name, e.first_name, 'Unknown') AS employee_name,
        s.id AS shift_id,
        s.start_time AS shift_start,
        s.end_time AS shift_end,
        s.site_id,
        si.name AS site_name,
        si.address_line1 AS site_address,
        si.geofence_lat AS site_lat,
        si.geofence_lng AS site_lng,
        te.id AS time_entry_id,
        te.clock_in AS clock_in_time,
        te.last_gps_ping_at,
        te.last_gps_ping_lat AS gps_lat,
        te.last_gps_ping_lng AS gps_lng,
        cu.id AS cad_unit_id,
        cu.unit_identifier,
        cu.current_status AS cad_status,
        cu.latitude AS unit_lat,
        cu.longitude AS unit_lng,
        gdl.id AS departure_id,
        gdl.departed_at
      FROM shifts s
      JOIN employees e ON e.id::text = s.employee_id::text AND e.workspace_id = s.workspace_id
      LEFT JOIN sites si ON si.id = s.site_id AND si.workspace_id = s.workspace_id
      LEFT JOIN time_entries te ON (
        te.employee_id = e.id
        AND te.workspace_id = e.workspace_id
        AND te.clock_in >= NOW() - INTERVAL '14 hours'
        AND te.clock_out IS NULL
      )
      LEFT JOIN cad_units cu ON (
        cu.employee_id = e.id::text
        AND cu.workspace_id = e.workspace_id
      )
      LEFT JOIN geofence_departure_log gdl ON (
        gdl.employee_id = e.id::text
        AND gdl.workspace_id = e.workspace_id
        AND gdl.returned_at IS NULL
        AND gdl.departed_at >= NOW() - INTERVAL '4 hours'
      )
      WHERE
        s.workspace_id = $1
        AND s.start_time <= $2::timestamptz + INTERVAL '2 hours'
        AND s.end_time >= $2::timestamptz - INTERVAL '2 hours'
        AND s.status != 'cancelled'
        AND s.employee_id IS NOT NULL
      ORDER BY e.id, s.start_time ASC
    `, [workspaceId, now]);

    const result = scheduledOfficers.map((row: any) => {
      const clockedIn = !!row.time_entry_id;
      const geofenceDeparted = !!row.departure_id;

      let fieldState: string;
      let latitude: number | null = null;
      let longitude: number | null = null;

      if (geofenceDeparted) {
        fieldState = 'geofence_departed';
        latitude = parseFloat(row.gps_lat) || null;
        longitude = parseFloat(row.gps_lng) || null;
      } else if (clockedIn) {
        fieldState = 'active_on_site';
        latitude = parseFloat(row.gps_lat || row.unit_lat) || null;
        longitude = parseFloat(row.gps_lng || row.unit_lng) || null;
      } else {
        fieldState = 'scheduled_not_in';
        latitude = parseFloat(row.site_lat) || null;
        longitude = parseFloat(row.site_lng) || null;
      }

      return {
        employeeId: row.employee_id_str,
        employeeName: row.employee_name,
        shiftId: row.shift_id,
        shiftStart: row.shift_start,
        shiftEnd: row.shift_end,
        siteId: row.site_id,
        siteName: row.site_name,
        siteAddress: row.site_address,
        fieldState,
        clockedIn,
        clockInTime: row.clock_in_time,
        lastPingAt: row.last_gps_ping_at,
        geofenceDeparted,
        departedAt: row.departed_at,
        cadUnitId: row.cad_unit_id,
        unitIdentifier: row.unit_identifier,
        cadStatus: row.cad_status,
        latitude,
        longitude,
      };
    });

    // Also get registered CAD units not linked to a scheduled shift
    const unscheduledUnits = await q(`
      SELECT cu.*
      FROM cad_units cu
      WHERE cu.workspace_id = $1
        AND cu.current_status != 'off_duty'
        AND NOT EXISTS (
          SELECT 1 FROM shifts s
          WHERE s.employee_id::text = cu.employee_id
            AND s.workspace_id = cu.workspace_id
            AND s.start_time <= $2::timestamptz + INTERVAL '2 hours'
            AND s.end_time >= $2::timestamptz - INTERVAL '2 hours'
            AND s.status != 'cancelled'
        )
    `, [workspaceId, now]);

    const unscheduledMapped = unscheduledUnits.map((u: any) => ({
      employeeId: u.employee_id,
      employeeName: u.employee_name,
      shiftId: null,
      shiftStart: null,
      shiftEnd: null,
      siteId: u.current_site_id,
      siteName: u.current_site_name,
      siteAddress: null,
      fieldState: 'active_on_site',
      clockedIn: true,
      clockInTime: null,
      lastPingAt: u.last_location_update,
      geofenceDeparted: false,
      departedAt: null,
      cadUnitId: u.id,
      unitIdentifier: u.unit_identifier,
      cadStatus: u.current_status,
      latitude: u.latitude ? parseFloat(u.latitude) : null,
      longitude: u.longitude ? parseFloat(u.longitude) : null,
    }));

    res.json({ officers: [...result, ...unscheduledMapped] });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

cadRouter.post("/units", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { unitIdentifier, employeeId, employeeName, radioChannel, vehicleId, notes } = req.body;
    if (!unitIdentifier || !employeeName) return res.status(400).json({ error: "unitIdentifier, employeeName required" });
    const id = randomUUID();
    await q(`INSERT INTO cad_units (id,workspace_id,unit_identifier,employee_id,employee_name,current_status,radio_channel,vehicle_id,notes,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'off_duty',$6,$7,$8,NOW(),NOW())`,
      [id, workspaceId, unitIdentifier, employeeId||null, employeeName, radioChannel||null, vehicleId||null, notes||null]);
    const rows = await q(`SELECT * FROM cad_units WHERE id=$1`, [id]);
    res.status(201).json(rows[0]);
  } catch (e: unknown) { res.status(400).json({ error: sanitizeError(e) }); }
});

cadRouter.patch("/units/:id/status", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { status, latitude, longitude, currentSiteId, currentSiteName } = req.body;
    const validStatuses = ["available","dispatched","on_scene","off_duty","break","out_of_service","needs_check"];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });
    await q(`UPDATE cad_units SET current_status=$1, latitude=$2, longitude=$3, current_site_id=$4, current_site_name=$5, last_location_update=NOW(), updated_at=NOW() WHERE id=$6 AND workspace_id=$7`,
      [status, latitude||null, longitude||null, currentSiteId||null, currentSiteName||null, req.params.id, workspaceId]);
    const rows = await q(`SELECT * FROM cad_units WHERE id=$1`, [req.params.id]);
    await broadcastToWorkspace(workspaceId, { type: "cad:unit_status_changed", data: rows[0] });
    platformEventBus.publish({
      type: 'unit_status_changed',
      category: 'ai_brain',
      title: 'Unit Status Changed',
      description: `Unit ${rows[0].unit_identifier} changed status to ${status}`,
      workspaceId,
      metadata: { unitId: req.params.id, status, currentSiteId, currentSiteName }
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    res.json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

cadRouter.delete("/units/:id", requireAuth as any, ensureWorkspaceAccess as any, requireManager as any, async (req: any, res: any) => {
  try {
    await q(`DELETE FROM cad_units WHERE id=$1 AND workspace_id=$2`, [req.params.id, wid(req)]);
    res.json({ success: true });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ─── CAD CALL LOCKING ────────────────────────────────────────────────────────

cadRouter.post("/calls/:id/lock", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const callId = req.params.id;
    const workspaceId = wid(req);
    const { userId, userName } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const lockKey = `${workspaceId}:${callId}`;
    const existing = cadCallLocks.get(lockKey);

    if (existing && !isLockExpired(existing) && existing.lockedBy !== userId) {
      return res.status(409).json({
        error: "Call is locked by another dispatcher",
        lockedBy: existing.lockedBy,
        lockedByName: existing.lockedByName,
        lockedAt: new Date(existing.lockedAt).toISOString(),
        expiresAt: new Date(existing.lockedAt + CAD_LOCK_TTL_MS).toISOString(),
      });
    }

    cadCallLocks.set(lockKey, { lockedBy: userId, lockedByName: userName || userId, lockedAt: Date.now() });
    await broadcastToWorkspace(workspaceId, { type: "cad:call_locked", data: { callId, lockedBy: userId, lockedByName: userName || userId } });
    res.json({ locked: true, expiresAt: new Date(Date.now() + CAD_LOCK_TTL_MS).toISOString() });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

cadRouter.post("/calls/:id/unlock", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const callId = req.params.id;
    const workspaceId = wid(req);
    const { userId } = req.body;
    const lockKey = `${workspaceId}:${callId}`;
    const existing = cadCallLocks.get(lockKey);

    if (existing && existing.lockedBy !== userId && !isLockExpired(existing)) {
      return res.status(403).json({ error: "Cannot unlock — locked by another dispatcher" });
    }

    cadCallLocks.delete(lockKey);
    await broadcastToWorkspace(workspaceId, { type: "cad:call_unlocked", data: { callId } });
    res.json({ unlocked: true });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

cadRouter.post("/calls/:id/lock-heartbeat", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const callId = req.params.id;
    const workspaceId = wid(req);
    const { userId } = req.body;
    const lockKey = `${workspaceId}:${callId}`;
    const existing = cadCallLocks.get(lockKey);

    if (!existing || existing.lockedBy !== userId) {
      return res.status(409).json({ error: "Lock not held by this user" });
    }

    existing.lockedAt = Date.now();
    res.json({ renewed: true, expiresAt: new Date(Date.now() + CAD_LOCK_TTL_MS).toISOString() });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

cadRouter.get("/calls/:id/lock-status", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const lockKey = `${wid(req)}:${req.params.id}`;
    const existing = cadCallLocks.get(lockKey);
    if (!existing || isLockExpired(existing)) {
      return res.json({ locked: false });
    }
    res.json({
      locked: true,
      lockedBy: existing.lockedBy,
      lockedByName: existing.lockedByName,
      lockedAt: new Date(existing.lockedAt).toISOString(),
      expiresAt: new Date(existing.lockedAt + CAD_LOCK_TTL_MS).toISOString(),
    });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ─── GEOFENCE DEPARTURES ─────────────────────────────────────────────────────

cadRouter.get("/geofence-departures", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const rows = await q(`
      SELECT * FROM geofence_departure_log
      WHERE workspace_id=$1 AND returned_at IS NULL
      ORDER BY departed_at DESC
      LIMIT 50
    `, [workspaceId]);
    res.json({ departures: rows });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

cadRouter.post("/geofence-departures", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { employeeId, employeeName, siteId, siteName, unitId } = req.body;
    if (!employeeId) return res.status(400).json({ error: "employeeId required" });
    const id = randomUUID();
    await q(`INSERT INTO geofence_departure_log (id, workspace_id, employee_id, employee_name, site_id, site_name, unit_id, departed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [id, workspaceId, employeeId, employeeName||null, siteId||null, siteName||null, unitId||null]);
    await q(`UPDATE cad_units SET current_status='needs_check', updated_at=NOW() WHERE employee_id=$1 AND workspace_id=$2`, [employeeId, workspaceId]);
    platformEventBus.publish({
      type: 'geofence_departure',
      category: 'ai_brain',
      title: 'Geofence Departure Detected',
      description: `Officer ${employeeName || employeeId} has left the geofence at Site ${siteName || siteId}`,
      workspaceId,
      metadata: { employeeId, employeeName, siteId, siteName, unitId }
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    res.status(201).json({ id });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

cadRouter.post("/geofence-departures/:id/acknowledge", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const { acknowledgedBy, note } = req.body;
    await q(`UPDATE geofence_departure_log SET acknowledged_at=NOW(), acknowledged_by=$1, override_reason=$2 WHERE id=$3 AND workspace_id=$4`,
      [acknowledgedBy||null, note||null, req.params.id, wid(req)]);
    res.json({ success: true });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

cadRouter.post("/geofence-departures/:id/returned", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const row = await q(`UPDATE geofence_departure_log SET returned_at=NOW() WHERE id=$1 AND workspace_id=$2 RETURNING employee_id`, [req.params.id, workspaceId]);
    if (row[0]?.employee_id) {
      await q(`UPDATE cad_units SET current_status='available', updated_at=NOW() WHERE employee_id=$1 AND workspace_id=$2 AND current_status='needs_check'`,
        [row[0].employee_id, workspaceId]);
    }
    res.json({ success: true });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ─── MANUAL CLOCK-IN OVERRIDES ───────────────────────────────────────────────

cadRouter.post("/manual-override", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { employeeId, employeeName, shiftId, siteId, siteName, reasonCode, reasonDetail, supervisorId, supervisorName } = req.body;
    const validReasonCodes = ["vehicle_breakdown","signal_loss","reassigned_site","emergency_response","other"];
    if (!reasonCode || !validReasonCodes.includes(reasonCode)) return res.status(400).json({ error: "Valid reasonCode required" });
    if (!reasonDetail) return res.status(400).json({ error: "reasonDetail required" });
    const id = randomUUID();
    await q(`INSERT INTO manual_clockin_overrides (id, workspace_id, employee_id, shift_id, override_type, reason, approved_by, metadata, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [id, workspaceId, employeeId||null, shiftId||null, reasonCode||'manual', reasonDetail||null, supervisorId||null,
       JSON.stringify({ employeeName: employeeName||null, siteId: siteId||null, siteName: siteName||null, supervisorName: supervisorName||null, reviewed: false })]);
    platformEventBus.publish({
      type: 'manual_override_submitted',
      category: 'ai_brain',
      title: 'Manual Clock-In Override',
      description: `Officer ${employeeName || employeeId} submitted a manual override: ${reasonCode}`,
      workspaceId,
      metadata: { employeeId, employeeName, shiftId, siteId, siteName, reasonCode, reasonDetail, supervisorId }
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    res.status(201).json({ id, message: "Override submitted — supervisor notified." });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ─── DISPATCH LOG ────────────────────────────────────────────────────────────

cadRouter.get("/log", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const rows = await q(`SELECT * FROM cad_dispatch_log WHERE workspace_id=$1 ORDER BY logged_at DESC LIMIT 100`, [wid(req)]);
    res.json({ log: rows });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ─── STATS ───────────────────────────────────────────────────────────────────

cadRouter.get("/stats", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const [active, today, byStatus, departures] = await Promise.all([
      q(`SELECT COUNT(*) FROM cad_calls WHERE workspace_id=$1 AND status IN ('pending','dispatched','on_scene')`, [workspaceId]),
      q(`SELECT COUNT(*) FROM cad_calls WHERE workspace_id=$1 AND received_at>=NOW()-INTERVAL '24 hours'`, [workspaceId]),
      q(`SELECT current_status, COUNT(*) FROM cad_units WHERE workspace_id=$1 GROUP BY current_status`, [workspaceId]),
      q(`SELECT COUNT(*) FROM geofence_departure_log WHERE workspace_id=$1 AND returned_at IS NULL`, [workspaceId]),
    ]);
    const statusMap: Record<string, number> = {};
    for (const row of byStatus as any[]) { statusMap[row.current_status] = parseInt(row.count); }
    res.json({
      activeCalls: Number(active[0]?.count || 0),
      callsToday: Number(today[0]?.count || 0),
      unitsByStatus: statusMap,
      activeGeofenceDepartures: Number(departures[0]?.count || 0),
    });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});
