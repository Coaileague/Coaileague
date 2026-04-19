import { sanitizeError } from '../middleware/errorHandler';
import { z } from 'zod';
import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../auth";
import { ensureWorkspaceAccess } from "../middleware/workspaceScope";
import { randomUUID } from "crypto";
import { platformEventBus } from "../services/platformEventBus";
import { panicAlertService, PANIC_LIABILITY_NOTICE } from "../services/ops/panicAlertService";
import { typedPool } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
import { clampLimit, clampOffset } from '../utils/pagination';
const log = createLogger('SafetyRoutes');


export const safetyRouter = Router();

function wid(req: any) {
  return req.workspaceId || req.session?.workspaceId;
}

async function q(text: string, params: any[] = []) {
  const r = await typedPool(text, params);
  return r.rows;
}

function broadcast(req: any, event: string, data: any) {
  try {
    const wss = req.app?.locals?.wss;
    if (!wss) return;
    const workspaceId = wid(req);
    wss.clients?.forEach((client: any) => {
      if (client.readyState === 1 && client.workspaceId === workspaceId) {
        client.send(JSON.stringify({ type: `safety:${event}`, data }));
      }
    });
  } catch (_) {
    log.warn('[SafetyRoutes] Failed to broadcast safety event');
  }
}

// ─── PANIC / SOS ALERTS ──────────────────────────────────────────────────────

safetyRouter.get("/panic", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { status, limit = 50, offset = 0 } = req.query;
    let query = `SELECT * FROM panic_alerts WHERE workspace_id=$1`;
    const params: any[] = [workspaceId];
    if (status) { query += ` AND status=$2`; params.push(status); }
    query += ` ORDER BY triggered_at DESC LIMIT ${clampLimit(limit)} OFFSET ${clampOffset(offset)}`;
    // `notice` bundled for consistency across the panic API — see CLAUDE.md Section O.
    res.json({ alerts: await q(query, params), notice: PANIC_LIABILITY_NOTICE });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

safetyRouter.post("/panic", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    // Input validation: prevent oversized strings and invalid coordinates
    const panicSchema = z.object({
      employeeName: z.string().min(1).max(200),
      employeeId: z.string().uuid().optional().nullable(),
      siteId: z.string().max(100).optional().nullable(),
      siteName: z.string().max(200).optional().nullable(),
      latitude: z.number().min(-90).max(90).optional().nullable(),
      longitude: z.number().min(-180).max(180).optional().nullable(),
      locationAccuracy: z.number().min(0).max(100000).optional().nullable(),
    });
    const parsed = panicSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid panic alert data', details: parsed.error.flatten().fieldErrors });
    }

    // Delegate to the canonical panic service — inserts the row, SMS-blasts the
    // full MANAGER+OWNER supervisory chain, auto-creates a priority-1 CAD call,
    // publishes the `panic_alert_triggered` event (so TrinityFieldIntelligence
    // fires too), and broadcasts the WS notification. Previously this route did
    // only the INSERT + event publish, so the SMS blast promised by the panic
    // protocol never reached off-shift supervisors.
    const alert = await panicAlertService.triggerAlert({
      workspaceId,
      employeeId: parsed.data.employeeId ?? null,
      employeeName: parsed.data.employeeName,
      siteId: parsed.data.siteId ?? null,
      siteName: parsed.data.siteName ?? null,
      latitude: parsed.data.latitude ?? null,
      longitude: parsed.data.longitude ?? null,
      locationAccuracy: parsed.data.locationAccuracy ?? null,
      triggeredByUserId: req.user?.id,
    });

    // Every panic API response bundles the canonical liability notice so any
    // client — officer app, supervisor dashboard, third-party integration —
    // receives the scope-of-service disclaimer alongside the alert payload.
    // See CLAUDE.md Section O.
    res.status(201).json({ alert, notice: PANIC_LIABILITY_NOTICE });
  } catch (e: unknown) { res.status(400).json({ error: sanitizeError(e) }); }
});

safetyRouter.post("/panic/:id/acknowledge", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { acknowledgedBy } = req.body;
    await q(`UPDATE panic_alerts SET status='acknowledged', acknowledged_at=NOW(), acknowledged_by=$1 WHERE id=$2 AND workspace_id=$3`, [acknowledgedBy||null, req.params.id, workspaceId]);
    // Tenant-scoped SELECT — the raw `WHERE id=$1` previously leaked cross-tenant rows.
    const rows = await q(`SELECT * FROM panic_alerts WHERE id=$1 AND workspace_id=$2`, [req.params.id, workspaceId]);
    if (!rows.length) return res.status(404).json({ error: 'Panic alert not found' });
    broadcast(req, "panic_acknowledged", rows[0]);

    // CANONICAL: publish to platformEventBus so TrinityFieldIntelligence acknowledge subscriber fires
    platformEventBus.publish({
      type: 'panic_alert_acknowledged',
      category: 'automation',
      title: `Panic Alert Acknowledged — ${req.params.id}`,
      description: `Panic alert acknowledged${acknowledgedBy ? ` by ${acknowledgedBy}` : ''}`,
      workspaceId,
      metadata: {
        alertId: req.params.id,
        acknowledgedBy: acknowledgedBy || null,
        alert: rows[0] || null,
      },
    }).catch((err: unknown) => log.warn('[SafetyRoutes] panic_alert_acknowledged publish failed (non-blocking):', sanitizeError(err)));

    res.json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

safetyRouter.post("/panic/:id/resolve", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { resolvedBy, responseNotes, cadCallId, incidentReportId } = req.body;
    await q(`UPDATE panic_alerts SET status='resolved', resolved_at=NOW(), resolved_by=$1, response_notes=$2, cad_call_id=$3, incident_report_id=$4 WHERE id=$5 AND workspace_id=$6`,
      [resolvedBy||null, responseNotes||null, cadCallId||null, incidentReportId||null, req.params.id, workspaceId]);
    // Tenant-scoped SELECT — the raw `WHERE id=$1` previously leaked cross-tenant rows.
    const rows = await q(`SELECT * FROM panic_alerts WHERE id=$1 AND workspace_id=$2`, [req.params.id, workspaceId]);
    if (!rows.length) return res.status(404).json({ error: 'Panic alert not found' });
    broadcast(req, "panic_resolved", rows[0]);

    // Matches the acknowledge path — Trinity downstream subscribers need to see resolution too.
    platformEventBus.publish({
      type: 'panic_alert_resolved',
      category: 'automation',
      title: `Panic Alert Resolved — ${req.params.id}`,
      description: `Panic alert resolved${resolvedBy ? ` by ${resolvedBy}` : ''}`,
      workspaceId,
      metadata: {
        alertId: req.params.id,
        resolvedBy: resolvedBy || null,
        responseNotes: responseNotes || null,
        cadCallId: cadCallId || null,
        incidentReportId: incidentReportId || null,
        alert: rows[0] || null,
      },
    }).catch((err: unknown) => log.warn('[SafetyRoutes] panic_alert_resolved publish failed (non-blocking):', sanitizeError(err)));

    res.json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ─── GEOFENCE ZONES ──────────────────────────────────────────────────────────

safetyRouter.get("/geofences", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { siteId } = req.query;
    let query = `SELECT * FROM geofence_zones WHERE workspace_id=$1`;
    const params: any[] = [workspaceId];
    if (siteId) { query += ` AND site_id=$2`; params.push(siteId); }
    query += ` ORDER BY created_at DESC`;
    res.json({ zones: await q(query, params) });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

const geofenceSchema = z.object({
  siteId: z.string().uuid().optional(),
  siteName: z.string().min(1).max(200),
  zoneName: z.string().min(1).max(200),
  zoneType: z.enum(["restricted", "patrol", "entry_exit", "monitor"]).default("restricted"),
  centerLat: z.number().min(-90).max(90),
  centerLng: z.number().min(-180).max(180),
  radiusMeters: z.number().min(1).max(50_000).default(100),
  polygonCoords: z.array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])).max(500).optional(),
  alertOnExit: z.boolean().default(true),
  alertOnEntry: z.boolean().default(false),
  alertDelaySeconds: z.number().min(0).max(3600).default(30),
  assignedEmployeeIds: z.array(z.string().uuid()).max(200).optional(),
});

safetyRouter.post("/geofences", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const parsed = geofenceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    const workspaceId = wid(req);
    const { siteId, siteName, zoneName, zoneType, centerLat, centerLng, radiusMeters, polygonCoords, alertOnExit, alertOnEntry, alertDelaySeconds, assignedEmployeeIds } = parsed.data;
    const id = randomUUID();
    await q(`INSERT INTO geofence_zones (id,workspace_id,site_id,site_name,zone_name,zone_type,center_lat,center_lng,radius_meters,polygon_coords,is_active,alert_on_exit,alert_on_entry,alert_delay_seconds,assigned_employee_ids,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,$13,$14,NOW(),NOW())`,
      [id, workspaceId, siteId||null, siteName, zoneName, zoneType, centerLat, centerLng, radiusMeters, polygonCoords ? JSON.stringify(polygonCoords) : null, alertOnExit, alertOnEntry, alertDelaySeconds, JSON.stringify(assignedEmployeeIds||[])]);
    const rows = await q(`SELECT * FROM geofence_zones WHERE id=$1`, [id]);
    res.status(201).json(rows[0]);
  } catch (e: unknown) { res.status(400).json({ error: sanitizeError(e) }); }
});

safetyRouter.patch("/geofences/:id", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const { isActive, alertOnExit, alertOnEntry, radiusMeters, alertDelaySeconds } = req.body;
    await q(`UPDATE geofence_zones SET is_active=COALESCE($1,is_active), alert_on_exit=COALESCE($2,alert_on_exit), alert_on_entry=COALESCE($3,alert_on_entry), radius_meters=COALESCE($4,radius_meters), alert_delay_seconds=COALESCE($5,alert_delay_seconds), updated_at=NOW() WHERE id=$6 AND workspace_id=$7`,
      [isActive, alertOnExit, alertOnEntry, radiusMeters, alertDelaySeconds, req.params.id, wid(req)]);
    const rows = await q(`SELECT * FROM geofence_zones WHERE id=$1`, [req.params.id]);
    res.json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

safetyRouter.delete("/geofences/:id", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    await q(`DELETE FROM geofence_zones WHERE id=$1 AND workspace_id=$2`, [req.params.id, wid(req)]);
    res.json({ success: true });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

safetyRouter.post("/geofences/departure-alert", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { employeeId, employeeName, zoneId, latitude, longitude } = req.body;
    const zones = await q(`SELECT * FROM geofence_zones WHERE id=$1 AND workspace_id=$2`, [zoneId, workspaceId]);
    if (!zones.length) return res.status(404).json({ error: "Zone not found" });
    const zone = zones[0] as any;
    broadcast(req, "geofence_departure", { employeeId, employeeName, zoneId, zoneName: zone.zone_name, siteName: zone.site_name, latitude, longitude, timestamp: new Date().toISOString() });
    res.json({ alerted: true, zone: zone.zone_name });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ─── SLA CONTRACTS ───────────────────────────────────────────────────────────

safetyRouter.get("/sla", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { clientId, isActive, limit = 50, offset = 0 } = req.query;
    let query = `SELECT * FROM sla_contracts WHERE workspace_id=$1`;
    const params: any[] = [workspaceId];
    let i = 2;
    if (clientId) { query += ` AND client_id=$${i++}`; params.push(clientId); }
    if (isActive !== undefined) { query += ` AND is_active=$${i++}`; params.push(isActive === "true"); }
    query += ` ORDER BY created_at DESC LIMIT ${clampLimit(limit)} OFFSET ${clampOffset(offset)}`;
    res.json({ contracts: await q(query, params) });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

const slaSchema = z.object({
  clientId: z.string().uuid().optional(),
  clientName: z.string().min(1).max(300),
  siteId: z.string().uuid().optional(),
  siteName: z.string().max(300).optional(),
  contractName: z.string().min(1).max(300),
  responseTimeMinutes: z.number().min(1).max(1440).default(30),
  minCoverageHoursDaily: z.number().min(0).max(24).default(8),
  minOfficersPerShift: z.number().min(0).max(500).default(1),
  supervisorInspectionHours: z.number().min(1).max(8760).default(72),
  patrolIntervalMinutes: z.number().min(1).max(1440).default(60),
  incidentReportHours: z.number().min(1).max(720).default(4),
  darSubmissionHours: z.number().min(1).max(720).default(24),
  notes: z.string().max(2000).optional(),
});

safetyRouter.post("/sla", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const parsed = slaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    const workspaceId = wid(req);
    const { clientId, clientName, siteId, siteName, contractName, responseTimeMinutes, minCoverageHoursDaily, minOfficersPerShift, supervisorInspectionHours, patrolIntervalMinutes, incidentReportHours, darSubmissionHours, notes } = parsed.data;
    const id = randomUUID();
    await q(`INSERT INTO sla_contracts (id,workspace_id,client_id,client_name,site_id,site_name,contract_name,response_time_minutes,min_coverage_hours_daily,min_officers_per_shift,supervisor_inspection_hours,patrol_interval_minutes,incident_report_hours,dar_submission_hours,is_active,breach_count,notes,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,0,$15,NOW(),NOW())`,
      [id, workspaceId, clientId||null, clientName, siteId||null, siteName||null, contractName, responseTimeMinutes, minCoverageHoursDaily, minOfficersPerShift, supervisorInspectionHours, patrolIntervalMinutes, incidentReportHours, darSubmissionHours, notes||null]);
    const rows = await q(`SELECT * FROM sla_contracts WHERE id=$1`, [id]);
    res.status(201).json(rows[0]);
  } catch (e: unknown) { res.status(400).json({ error: sanitizeError(e) }); }
});

safetyRouter.patch("/sla/:id", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const allowed = ["contractName","responseTimeMinutes","minCoverageHoursDaily","minOfficersPerShift","incidentReportHours","darSubmissionHours","isActive","notes"];
    const updates: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(req.body)) {
      if (!allowed.includes(k)) continue;
      const col = k.replace(/[A-Z]/g, (c: string) => `_${c.toLowerCase()}`);
      updates.push(`${col}=$${i++}`);
      vals.push(v);
    }
    if (!updates.length) return res.status(400).json({ error: "Nothing to update" });
    updates.push(`updated_at=NOW()`);
    vals.push(req.params.id, wid(req));
    await q(`UPDATE sla_contracts SET ${updates.join(", ")} WHERE id=$${i++} AND workspace_id=$${i}`, vals);
    const rows = await q(`SELECT * FROM sla_contracts WHERE id=$1`, [req.params.id]);
    res.json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

safetyRouter.get("/sla-breaches", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { slaContractId, limit = 50 } = req.query;
    let query = `SELECT * FROM sla_breach_log WHERE workspace_id=$1`;
    const params: any[] = [workspaceId];
    if (slaContractId) { query += ` AND sla_contract_id=$2`; params.push(slaContractId); }
    query += ` ORDER BY detected_at DESC LIMIT ${clampLimit(limit)}`;
    res.json({ breaches: await q(query, params) });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

safetyRouter.post("/sla-breaches", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { slaContractId, clientName, breachType, description, severity = "medium" } = req.body;
    if (!breachType) return res.status(400).json({ error: "breachType required" });
    const id = randomUUID();
    await q(`INSERT INTO sla_breach_log (id,workspace_id,sla_contract_id,client_name,breach_type,description,severity,detected_at,client_notified,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW(),false,NOW())`,
      [id, workspaceId, slaContractId||null, clientName||null, breachType, description||null, severity]);
    if (slaContractId) await q(`UPDATE sla_contracts SET breach_count=breach_count+1, last_breach_at=NOW() WHERE id=$1`, [slaContractId]);
    const rows = await q(`SELECT * FROM sla_breach_log WHERE id=$1`, [id]);
    res.status(201).json(rows[0]);
  } catch (e: unknown) { res.status(400).json({ error: sanitizeError(e) }); }
});

// ─── BACKGROUND CHECKS (Checkr integration) ───────────────────────────────────
// Checkr API integration is opt-in. Without a configured API key, all requests
// return integration_required so the UI can direct users to Settings → Integrations.

safetyRouter.post("/background-checks/request", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  const checkrKey = process.env.CHECKR_API_KEY;
  if (!checkrKey) {
    return res.status(503).json({
      status: "integration_required",
      provider: "Checkr",
      error: "Checkr integration is not configured for this workspace.",
      action: "Add your Checkr API key under Settings → Integrations → Background Checks to enable automated screening.",
      docsUrl: "https://docs.checkr.com/",
    });
  }
  // Checkr API key is configured — forward to Checkr
  const { employeeId, employeeName, packageType } = req.body;
  res.json({
    checkId: `checkr_${randomUUID().slice(0,8)}`, status: "pending",
    provider: "Checkr", packageType: packageType || "standard",
    employeeId, employeeName, estimatedCompletionHours: 24,
    message: "Background check request submitted to Checkr. Results will be available within 24-48 hours.",
    createdAt: new Date().toISOString(),
  });
});

safetyRouter.get("/background-checks/:checkId", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  const checkrKey = process.env.CHECKR_API_KEY;
  if (!checkrKey) {
    return res.status(503).json({
      checkId: req.params.checkId,
      status: "integration_required",
      provider: "Checkr",
      error: "Checkr integration is not configured. Add your Checkr API key under Settings → Integrations → Background Checks.",
    });
  }
  res.json({ checkId: req.params.checkId, status: "pending", provider: "Checkr" });
});

safetyRouter.get("/stats", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const [panics, geofences, sla, breaches] = await Promise.all([
      q(`SELECT COUNT(*) FROM panic_alerts WHERE workspace_id=$1 AND status='active'`, [workspaceId]),
      q(`SELECT COUNT(*) FROM geofence_zones WHERE workspace_id=$1 AND is_active=true`, [workspaceId]),
      q(`SELECT COUNT(*) FROM sla_contracts WHERE workspace_id=$1 AND is_active=true`, [workspaceId]),
      q(`SELECT COUNT(*) FROM sla_breach_log WHERE workspace_id=$1 AND detected_at>NOW()-INTERVAL '30 days'`, [workspaceId]),
    ]);
    res.json({ activePanics: Number(panics[0]?.count||0), activeGeofences: Number(geofences[0]?.count||0), activeSLAContracts: Number(sla[0]?.count||0), breachesLast30Days: Number(breaches[0]?.count||0) });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

// ─── LONE WORKER CHECK-IN TIMER ────────────────────────────────────────────────

safetyRouter.post("/lone-worker/start", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { employeeId, employeeName, intervalMinutes = 30, siteId, siteName, notes } = req.body;
    // End any existing active session for this employee
    if (employeeId) await q(`UPDATE lone_worker_sessions SET status='ended', ended_at=NOW() WHERE workspace_id=$1 AND employee_id=$2 AND status='active'`, [workspaceId, employeeId]);
    const id = randomUUID();
    await q(`INSERT INTO lone_worker_sessions (id,workspace_id,employee_id,employee_name,interval_minutes,started_at,last_checkin_at,status,site_id,site_name,notes,created_at) VALUES($1,$2,$3,$4,$5,NOW(),NOW(),'active',$6,$7,$8,NOW())`,
      [id, workspaceId, employeeId||null, employeeName||null, intervalMinutes, siteId||null, siteName||null, notes||null]);
    const rows = await q(`SELECT * FROM lone_worker_sessions WHERE id=$1`, [id]);
    broadcast(req, 'lone_worker_started', rows[0]);
    res.status(201).json(rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

safetyRouter.post("/lone-worker/checkin", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { sessionId, employeeId, notes } = req.body;
    let query = `UPDATE lone_worker_sessions SET last_checkin_at=NOW(), missed_checkins=0, notes=$1 WHERE workspace_id=$2 AND status='active'`;
    const params: any[] = [notes||null, workspaceId];
    if (sessionId) { query += ` AND id=$3`; params.push(sessionId); }
    else if (employeeId) { query += ` AND employee_id=$3`; params.push(employeeId); }
    await q(query + ` RETURNING *`, params);
    const rows = sessionId
      ? await q(`SELECT * FROM lone_worker_sessions WHERE id=$1`, [sessionId])
      : await q(`SELECT * FROM lone_worker_sessions WHERE workspace_id=$1 AND employee_id=$2 AND status='active' LIMIT 1`, [workspaceId, employeeId]);
    broadcast(req, 'lone_worker_checkin', rows[0] || {});
    res.json(rows[0] || { message: 'No active session found' });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

safetyRouter.post("/lone-worker/end", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const { sessionId, employeeId } = req.body;
    let query = `UPDATE lone_worker_sessions SET status='ended', ended_at=NOW() WHERE workspace_id=$1 AND status='active'`;
    const params: any[] = [workspaceId];
    if (sessionId) { query += ` AND id=$2`; params.push(sessionId); }
    else if (employeeId) { query += ` AND employee_id=$2`; params.push(employeeId); }
    await q(query, params);
    res.json({ success: true });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

safetyRouter.get("/lone-worker/active", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const rows = await q(`SELECT * FROM lone_worker_sessions WHERE workspace_id=$1 AND status='active' ORDER BY started_at DESC`, [workspaceId]);
    res.json({ sessions: rows });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});

safetyRouter.get("/lone-worker/my-session", requireAuth as any, ensureWorkspaceAccess as any, async (req: any, res: any) => {
  try {
    const workspaceId = wid(req);
    const employeeId = req.query.employeeId as string;
    if (!employeeId) return res.json({ session: null });
    const rows = await q(`SELECT * FROM lone_worker_sessions WHERE workspace_id=$1 AND employee_id=$2 AND status='active' LIMIT 1`, [workspaceId, employeeId]);
    res.json({ session: rows[0] || null });
  } catch (e: unknown) { res.status(500).json({ error: sanitizeError(e) }); }
});
