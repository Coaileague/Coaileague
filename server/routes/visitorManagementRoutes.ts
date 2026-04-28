/**
 * Phase 35I — Visitor & Guest Management System
 * Routes: /api/visitor-management/*
 *
 * Handles corporate/office post visitor logging:
 *   - Check-in with photo capture, host notification, visitor type, pre-reg fast-track
 *   - Check-out with overstay NDS alert
 *   - Pre-registration by clients
 *   - Active visitors board (per-post, elapsed time)
 *   - Searchable visitor log history
 *   - Banned flag stub (Phase 35L integration target)
 */
import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, type AuthenticatedRequest } from '../rbac';
import { NotificationDeliveryService } from '../services/notificationDeliveryService';
import { platformEventBus } from '../services/platformEventBus';
import { createLogger } from '../lib/logger';
const log = createLogger('VisitorManagementRoutes');


export const visitorManagementRouter = Router();

function getQueryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

const VISITOR_TYPES = ['guest', 'vendor', 'contractor', 'employee', 'delivery', 'law_enforcement', 'other'] as const;
const PRE_REG_STATUSES = ['pending', 'checked_in', 'completed', 'cancelled'] as const;

function wid(req: AuthenticatedRequest) {
  return req.workspaceId || req.session?.workspaceId;
}

// ── Banned check — queries trespass_notices (active trespass records for workspace) ──
async function checkIsBanned(workspaceId: string, visitorName: string, _visitorCompany?: string): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM trespass_notices
       WHERE workspace_id = $1
         AND lower(subject_name) = lower($2)
         AND status = 'active'
       LIMIT 1`,
      [workspaceId, visitorName]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

// ── Overstay check helper ─────────────────────────────────────────────────────
function isOverstay(log: any, thresholdHours = 8): boolean {
  if (log.checked_out_at) return false;
  const sinceCheckIn = (Date.now() - new Date(log.checked_in_at).getTime()) / 3_600_000;
  if (log.expected_departure) {
    return Date.now() > new Date(log.expected_departure).getTime();
  }
  return sinceCheckIn > thresholdHours;
}

// ── Elapsed time helper ───────────────────────────────────────────────────────
function elapsedMinutes(checkedInAt: string): number {
  return Math.floor((Date.now() - new Date(checkedInAt).getTime()) / 60_000);
}

// =============================================================================
// VISITOR LOG ENDPOINTS
// =============================================================================

// GET /api/visitor-management/logs — paginated history with filters
visitorManagementRouter.get('/logs', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = wid(req);
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const siteId = getQueryString(req.query.siteId);
    const visitorType = getQueryString(req.query.visitorType);
    const date = getQueryString(req.query.date);
    const search = getQueryString(req.query.search);
    const limit = Number.parseInt(getQueryString(req.query.limit) || '50', 10);
    const offset = Number.parseInt(getQueryString(req.query.offset) || '0', 10);

    const conditions = ['workspace_id = $1'];
    const params: any[] = [workspaceId];
    let p = 2;

    if (siteId) { conditions.push(`site_id = $${p++}`); params.push(siteId); }
    if (visitorType) { conditions.push(`visitor_type = $${p++}`); params.push(visitorType); }
    if (date) {
      conditions.push(`date_trunc('day', checked_in_at) = $${p++}`);
      params.push(date);
    }
    if (search) {
      conditions.push(`(lower(visitor_name) LIKE $${p} OR lower(visitor_company) LIKE $${p})`);
      params.push(`%${String(search).toLowerCase()}%`);
      p++;
    }

    const where = conditions.join(' AND ');
    const { rows } = await pool.query(
      `SELECT * FROM visitor_logs WHERE ${where} ORDER BY checked_in_at DESC LIMIT $${p} OFFSET $${p + 1}`,
      [...params, limit, offset]
    );
    const { rows: countRows } = await pool.query(`SELECT COUNT(*) FROM visitor_logs WHERE ${where}`, params);

    res.json({ logs: rows, total: parseInt(countRows[0].count) });
  } catch (err: any) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// GET /api/visitor-management/active — currently checked-in visitors grouped by site
visitorManagementRouter.get('/active', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = wid(req);
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const { siteId } = req.query;
    const conditions = ['workspace_id = $1', 'checked_out_at IS NULL'];
    const params: any[] = [workspaceId];
    if (siteId) { conditions.push(`site_id = $2`); params.push(siteId); }

    const { rows } = await pool.query(
      `SELECT * FROM visitor_logs WHERE ${conditions.join(' AND ')} ORDER BY checked_in_at DESC`,
      params
    );

    const enriched = rows.map(r => ({
      ...r,
      elapsedMinutes: elapsedMinutes(r.checked_in_at),
      isOverstay: isOverstay(r),
    }));

    // Group by site
    const bySite: Record<string, any[]> = {};
    for (const v of enriched) {
      const key = v.site_name || 'Unknown Site';
      if (!bySite[key]) bySite[key] = [];
      bySite[key].push(v);
    }

    res.json({ activeVisitors: enriched, bySite, total: enriched.length });
  } catch (err: any) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// POST /api/visitor-management/checkin — check in a visitor
visitorManagementRouter.post('/checkin', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = wid(req);
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const {
      visitorName, visitorCompany, visitorType = 'guest',
      visitorIdType, visitorIdNumber, visitorBadgeNumber,
      visitorPhotoUrl, idPhotoUrl,
      hostName, hostEmployeeId, hostContact,
      purpose, notes, siteId, siteName,
      vehiclePlate, vehicleDescription,
      expectedDeparture, preRegistrationId,
    } = req.body;

    if (!visitorName) return res.status(400).json({ error: 'visitorName required' });
    if (!siteName) return res.status(400).json({ error: 'siteName required' });
    if (visitorType && !VISITOR_TYPES.includes(visitorType)) {
      return res.status(400).json({ error: `Invalid visitorType. Valid: ${VISITOR_TYPES.join(', ')}` });
    }

    // Banned stub check
    const isBanned = await checkIsBanned(workspaceId, visitorName, visitorCompany);
    // Fast-track: linked to a pending pre-registration
    let isFastTrack = false;
    if (preRegistrationId) {
      const { rows: preRows } = await pool.query(
        `SELECT id FROM visitor_pre_registrations WHERE id=$1 AND workspace_id=$2 AND status='pending'`,
        [preRegistrationId, workspaceId]
      );
      isFastTrack = preRows.length > 0;
    }

    const checkedInBy = req.user?.id || 'unknown';

    const { rows } = await pool.query(
      `INSERT INTO visitor_logs
         (workspace_id, site_id, site_name, visitor_name, visitor_company, visitor_type,
          visitor_id_type, visitor_id_number, visitor_badge_number,
          visitor_photo_url, id_photo_url,
          host_name, host_employee_id, host_contact,
          purpose, notes, vehicle_plate, vehicle_description,
          expected_departure, pre_registration_id, is_banned, is_fast_track,
          checked_in_at, checked_in_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW(),$23)
       RETURNING *`,
      [
        workspaceId, siteId || null, siteName, visitorName, visitorCompany || null, visitorType,
        visitorIdType || null, visitorIdNumber || null, visitorBadgeNumber || null,
        visitorPhotoUrl || null, idPhotoUrl || null,
        hostName || null, hostEmployeeId || null, hostContact || null,
        purpose || null, notes || null, vehiclePlate || null, vehicleDescription || null,
        expectedDeparture || null, preRegistrationId || null, isBanned, isFastTrack,
        checkedInBy,
      ]
    );

    const log = rows[0];

    // If pre-registration exists, mark it checked_in
    if (preRegistrationId && isFastTrack) {
      await pool.query(
        `UPDATE visitor_pre_registrations SET status='checked_in', checked_in_log_id=$1, updated_at=NOW() WHERE id=$2`,
        [log.id, preRegistrationId]
      ).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    }

    // Alert if banned
    if (isBanned) {
      NotificationDeliveryService.send({
        idempotencyKey: `notif:visitor:${log.id}:banned_checkin`,
        type: 'alert_notification',
        workspaceId,
        recipientUserId: workspaceId,
        channel: 'in_app',
        body: {
          title: 'BANNED VISITOR DETECTED',
          message: `${visitorName} is on the trespass registry. Notify supervisor immediately.`,
          severity: 'critical',
        },
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    }

    platformEventBus.publish({
      idempotencyKey: `notif:visitor:${log.id}:checked_in`,
            type: 'visitor_checked_in',
      workspaceId,
      title: `Visitor Checked In — ${visitorName}`,
      description: `${visitorName}${visitorCompany ? ` (${visitorCompany})` : ''} checked in at ${siteName}`,
      metadata: { logId: log.id, visitorName, siteName, isBanned, isFastTrack, visitorType },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.status(201).json({ log, isBanned });
  } catch (err: any) {
    res.status(400).json({ error: sanitizeError(err) });
  }
});

// POST /api/visitor-management/checkout/:id — check out a visitor
visitorManagementRouter.post('/checkout/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = wid(req);
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const { notes } = req.body;
    const checkedOutBy = req.user?.id || 'unknown';

    const { rows } = await pool.query(
      `UPDATE visitor_logs
       SET checked_out_at=NOW(), checked_out_by=$1, notes=COALESCE($2, notes)
       WHERE id=$3 AND workspace_id=$4 AND checked_out_at IS NULL
       RETURNING *`,
      [checkedOutBy, notes || null, req.params.id, workspaceId]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Visitor log not found or already checked out' });

    const log = rows[0];

    // If linked to pre-registration, mark it completed
    if (log.pre_registration_id) {
      await pool.query(
        `UPDATE visitor_pre_registrations SET status='completed', updated_at=NOW() WHERE id=$1`,
        [log.pre_registration_id]
      ).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    }

    platformEventBus.publish({
      type: 'visitor_checked_out',
      workspaceId,
      title: `Visitor Checked Out — ${log.visitor_name}`,
      description: `${log.visitor_name} checked out from ${log.site_name}`,
      metadata: { logId: log.id, visitorName: log.visitor_name, siteName: log.site_name },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json(log);
  } catch (err: any) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// GET /api/visitor-management/overstay — detect visitors past expected departure
visitorManagementRouter.get('/overstay', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = wid(req);
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const thresholdHours = parseInt(String(req.query.thresholdHours || '8'));

    const { rows } = await pool.query(
      `SELECT * FROM visitor_logs
       WHERE workspace_id=$1
         AND checked_out_at IS NULL
         AND (
           (expected_departure IS NOT NULL AND expected_departure < NOW())
           OR checked_in_at < NOW() - ($2 || ' hours')::interval
         )
       ORDER BY checked_in_at ASC`,
      [workspaceId, thresholdHours]
    );

    const overstays = rows.map(r => ({
      ...r,
      elapsedMinutes: elapsedMinutes(r.checked_in_at),
    }));

    // Fire NDS alert for each new overstay
    for (const o of overstays) {
      if (!o.alert_sent) {
        NotificationDeliveryService.send({
          idempotencyKey: `notif:visitor:${o.id}:overstay`,
          type: 'alert_notification',
          workspaceId,
          recipientUserId: workspaceId,
          channel: 'in_app',
          body: {
            title: 'Visitor Overstay Alert',
            message: `${o.visitor_name} at ${o.site_name} has been on-site for ${Math.floor(o.elapsedMinutes / 60)}h ${o.elapsedMinutes % 60}m.`,
            severity: 'warning',
          },
        }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

        platformEventBus.publish({
          idempotencyKey: `notif:visitor:${o.id}:overstay_event`,
            type: 'visitor_overstay',
          workspaceId,
          title: `Visitor Overstay — ${o.visitor_name}`,
          description: `${o.visitor_name} is still on-site at ${o.site_name} after ${Math.floor(o.elapsedMinutes / 60)}h`,
          metadata: { logId: o.id, visitorName: o.visitor_name, siteName: o.site_name, elapsedMinutes: o.elapsedMinutes },
        }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

        await pool.query(`UPDATE visitor_logs SET alert_sent=true WHERE id=$1`, [o.id]).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
      }
    }

    res.json({ overstays, total: overstays.length });
  } catch (err: any) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// =============================================================================
// PRE-REGISTRATION ENDPOINTS
// =============================================================================

// GET /api/visitor-management/pre-registrations — list pre-registrations
visitorManagementRouter.get('/pre-registrations', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = wid(req);
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const status = getQueryString(req.query.status);
    const clientId = getQueryString(req.query.clientId);
    const siteId = getQueryString(req.query.siteId);
    const limit = Number.parseInt(getQueryString(req.query.limit) || '50', 10);
    const offset = Number.parseInt(getQueryString(req.query.offset) || '0', 10);

    const conditions = ['workspace_id = $1'];
    const params: any[] = [workspaceId];
    let p = 2;

    if (status) { conditions.push(`status = $${p++}`); params.push(status); }
    if (clientId) { conditions.push(`client_id = $${p++}`); params.push(clientId); }
    if (siteId) { conditions.push(`site_id = $${p++}`); params.push(siteId); }

    const where = conditions.join(' AND ');
    const { rows } = await pool.query(
      `SELECT * FROM visitor_pre_registrations WHERE ${where} ORDER BY expected_arrival ASC LIMIT $${p} OFFSET $${p + 1}`,
      [...params, limit, offset]
    );
    const { rows: countRows } = await pool.query(`SELECT COUNT(*) FROM visitor_pre_registrations WHERE ${where}`, params);

    res.json({ preRegistrations: rows, total: parseInt(countRows[0].count) });
  } catch (err: any) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// POST /api/visitor-management/pre-registrations — create pre-registration
visitorManagementRouter.post('/pre-registrations', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = wid(req);
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const {
      siteName, siteId, clientId,
      expectedVisitorName, expectedVisitorCompany,
      visitorType = 'guest',
      expectedArrival, expectedDeparture,
      hostName, hostContact,
      reason, notes,
    } = req.body;

    if (!expectedVisitorName) return res.status(400).json({ error: 'expectedVisitorName required' });
    if (!siteName) return res.status(400).json({ error: 'siteName required' });
    if (!expectedArrival) return res.status(400).json({ error: 'expectedArrival required' });
    if (visitorType && !VISITOR_TYPES.includes(visitorType)) {
      return res.status(400).json({ error: `Invalid visitorType. Valid: ${VISITOR_TYPES.join(', ')}` });
    }

    const submittedBy = req.user?.id || 'unknown';
    const submittedByName = req.user?.name || null;

    const { rows } = await pool.query(
      `INSERT INTO visitor_pre_registrations
         (workspace_id, client_id, site_id, site_name, expected_visitor_name,
          expected_visitor_company, visitor_type, expected_arrival, expected_departure,
          host_name, host_contact, reason, notes, submitted_by, submitted_by_name, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending')
       RETURNING *`,
      [
        workspaceId, clientId || null, siteId || null, siteName,
        expectedVisitorName, expectedVisitorCompany || null,
        visitorType, expectedArrival, expectedDeparture || null,
        hostName || null, hostContact || null,
        reason || null, notes || null,
        submittedBy, submittedByName,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err: any) {
    res.status(400).json({ error: sanitizeError(err) });
  }
});

// PATCH /api/visitor-management/pre-registrations/:id — update status
visitorManagementRouter.patch('/pre-registrations/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = wid(req);
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const { status } = req.body;
    if (!status || !PRE_REG_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Valid: ${PRE_REG_STATUSES.join(', ')}` });
    }

    const { rows } = await pool.query(
      `UPDATE visitor_pre_registrations SET status=$1, updated_at=NOW()
       WHERE id=$2 AND workspace_id=$3 RETURNING *`,
      [status, req.params.id, workspaceId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pre-registration not found' });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// =============================================================================
// TRINITY ACTIONS: visitor.active & visitor.overstay
// =============================================================================
export function registerVisitorActions(): void {
  import('../services/helpai/platformActionHub').then(({ platformActionHub }) => {

    platformActionHub.registerAction({
      actionId: 'visitor.active',
      name: 'Active Visitors at Post',
      category: 'automation',
      description: 'Get currently checked-in visitors at a specified post/site',
      requiredRoles: ['guard', 'supervisor', 'manager', 'owner', 'root_admin'],
      inputSchema: { type: 'object', properties: { siteId: { type: 'string', description: 'Filter by site ID' }, siteName: { type: 'string', description: 'Filter by site name' } } },
      handler: async (request: any) => {
        const startTime = Date.now();
        const { siteId, siteName, workspaceId: payloadWs } = request.payload || {};
        const ws = request.workspaceId || payloadWs;
        if (!ws) return { success: false, actionId: request.actionId, message: 'Workspace required', executionTimeMs: 0 };

        const conditions = ['workspace_id = $1', 'checked_out_at IS NULL'];
        const params: any[] = [ws];
        if (siteId) { conditions.push('site_id = $2'); params.push(siteId); }
        else if (siteName) { conditions.push('site_name = $2'); params.push(siteName); }

        const { rows } = await pool.query(
          `SELECT * FROM visitor_logs WHERE ${conditions.join(' AND ')} ORDER BY checked_in_at DESC`,
          params
        );

        const enriched = rows.map(r => ({
          ...r,
          elapsedMinutes: elapsedMinutes(r.checked_in_at),
          isOverstay: isOverstay(r),
        }));

        return {
          success: true,
          actionId: request.actionId,
          message: `${enriched.length} active visitor(s)`,
          data: { activeVisitors: enriched, total: enriched.length },
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    platformActionHub.registerAction({
      actionId: 'visitor.overstay',
      name: 'Visitors Past Expected Departure',
      category: 'automation',
      description: 'Get visitors past their expected departure time or on-site beyond threshold',
      requiredRoles: ['guard', 'supervisor', 'manager', 'owner', 'root_admin'],
      inputSchema: { type: 'object', properties: { thresholdHours: { type: 'number', description: 'Hours on-site before flagging as overstay', default: 8 } } },
      handler: async (request: any) => {
        const startTime = Date.now();
        const { thresholdHours = 8, workspaceId: payloadWs } = request.payload || {};
        const ws = request.workspaceId || payloadWs;
        if (!ws) return { success: false, actionId: request.actionId, message: 'Workspace required', executionTimeMs: 0 };

        const { rows } = await pool.query(
          `SELECT * FROM visitor_logs
           WHERE workspace_id=$1
             AND checked_out_at IS NULL
             AND (
               (expected_departure IS NOT NULL AND expected_departure < NOW())
               OR checked_in_at < NOW() - ($2 || ' hours')::interval
             )
           ORDER BY checked_in_at ASC`,
          [ws, thresholdHours]
        );

        const overstays = rows.map(r => ({
          ...r,
          elapsedMinutes: elapsedMinutes(r.checked_in_at),
        }));

        return {
          success: true,
          actionId: request.actionId,
          message: `${overstays.length} overstay visitor(s) detected`,
          data: { overstays, total: overstays.length },
          executionTimeMs: Date.now() - startTime,
        };
      },
    });

    log.info('[VisitorMgmt] Trinity actions registered: visitor.active, visitor.overstay');
  }).catch((err: any) => {
    log.warn('[VisitorMgmt] Trinity action registration failed (non-blocking):', err?.message);
  });
}

// =============================================================================
// OVERSTAY MONITOR — Automatic background scanner
// Runs every 5 minutes, fires NDS alert for each new overstay detected
// =============================================================================
async function runOverstayScanner(workspaceIds?: string[]): Promise<void> {
  try {
    // Get all workspaces that have active visitors if no specific list given
    let wsList = workspaceIds;
    if (!wsList) {
      const { rows } = await pool.query(
        `SELECT DISTINCT workspace_id FROM visitor_logs WHERE checked_out_at IS NULL`
      );
      wsList = rows.map(r => r.workspace_id);
    }

    for (const workspaceId of wsList) {
      const { rows } = await pool.query(
        `SELECT * FROM visitor_logs
         WHERE workspace_id=$1
           AND checked_out_at IS NULL
           AND alert_sent = false
           AND (
             (expected_departure IS NOT NULL AND expected_departure < NOW())
             OR checked_in_at < NOW() - interval '8 hours'
           )`,
        [workspaceId]
      );

      for (const o of rows) {
        const elapsed = Math.floor((Date.now() - new Date(o.checked_in_at).getTime()) / 60_000);
        const hours = Math.floor(elapsed / 60);
        const mins = elapsed % 60;

        NotificationDeliveryService.send({
          idempotencyKey: `notif:visitor:${o.id}:overstay`,
          type: 'alert_notification',
          workspaceId,
          recipientUserId: workspaceId,
          channel: 'in_app',
          body: {
            title: 'Visitor Overstay Alert',
            message: `${o.visitor_name} at ${o.site_name} has been on-site for ${hours}h ${mins}m${o.expected_departure ? ' — past expected departure' : ''}.`,
            severity: 'warning',
          },
        }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

        platformEventBus.publish({
          idempotencyKey: `notif:visitor:${o.id}:overstay_event`,
            type: 'visitor_overstay',
          workspaceId,
          title: `Visitor Overstay — ${o.visitor_name}`,
          description: `${o.visitor_name} is still on-site at ${o.site_name} after ${hours}h ${mins}m`,
          metadata: { logId: o.id, visitorName: o.visitor_name, siteName: o.site_name, elapsedMinutes: elapsed },
        }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

        await pool.query(`UPDATE visitor_logs SET alert_sent=true WHERE id=$1`, [o.id]).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
      }
    }
  } catch (err: any) {
    log.warn('[VisitorMgmt] Overstay scanner error (non-blocking):', err?.message);
  }
}

let _overstayMonitorStarted = false;
export function startOverstayMonitor(): void {
  if (_overstayMonitorStarted) {
    log.info('[VisitorMgmt] Overstay monitor already running — skipping duplicate start');
    return;
  }
  _overstayMonitorStarted = true;
  const INTERVAL_MS = 5 * 60 * 1_000; // 5 minutes
  setInterval(() => {
    runOverstayScanner().catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
  }, INTERVAL_MS);
  log.info('[VisitorMgmt] Overstay monitor started — scanning every 5 minutes');
}

// ─── Ensure tables exist at startup (idempotent) ──────────────────────────────
export async function ensureVisitorTables(): Promise<void> {
  try {
    await pool.query(`
      ALTER TABLE visitor_logs
        ADD COLUMN IF NOT EXISTS visitor_type VARCHAR DEFAULT 'guest',
        ADD COLUMN IF NOT EXISTS host_contact VARCHAR,
        ADD COLUMN IF NOT EXISTS pre_registration_id VARCHAR,
        ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS is_fast_track BOOLEAN DEFAULT false
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS visitor_pre_registrations (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id VARCHAR NOT NULL,
        client_id VARCHAR,
        site_id VARCHAR,
        site_name VARCHAR NOT NULL,
        expected_visitor_name VARCHAR NOT NULL,
        expected_visitor_company VARCHAR,
        visitor_type VARCHAR DEFAULT 'guest',
        expected_arrival TIMESTAMP NOT NULL,
        expected_departure TIMESTAMP,
        host_name VARCHAR,
        host_contact VARCHAR,
        reason TEXT,
        status VARCHAR NOT NULL DEFAULT 'pending',
        notes TEXT,
        submitted_by VARCHAR,
        submitted_by_name VARCHAR,
        checked_in_log_id VARCHAR,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS visitor_pre_reg_workspace_idx ON visitor_pre_registrations(workspace_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS visitor_pre_reg_status_idx ON visitor_pre_registrations(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS visitor_pre_reg_arrival_idx ON visitor_pre_registrations(expected_arrival)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS visitor_logs_active_idx ON visitor_logs(workspace_id, checked_out_at)`);
  } catch (err: any) {
    log.error('[VisitorMgmt] Table ensure failed (non-blocking):', err?.message);
  }
}
