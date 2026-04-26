import { Router } from "express";
import { db } from "../db";
import { requireAuth } from "../auth";
import { requireManager } from "../rbac";
import { ensureWorkspaceAccess } from "../middleware/workspaceScope";
import { sanitizeError } from "../middleware/errorHandler";
import { randomUUID } from "crypto";
import { platformEventBus } from "../services/platformEventBus";
import { broadcastToWorkspace } from "../websocket";
import { typedPool } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
import { clampLimit, clampOffset } from '../utils/pagination';
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

// CAD CALLS

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
    query += ` ORDER BY cc.received_at DESC LIMIT ${clampLimit(limit)} OFFSET ${clampOffset(offset)}`;
    res.json({ calls: await q(query, params) });
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

// CAD UNITS

// GEOFENCE DEPARTURES

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

// STATS

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
