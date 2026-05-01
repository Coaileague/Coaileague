/**
 * Panic Alert Service
 * ====================
 * Manages officer panic/duress SOS alerts.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * SCOPE & LIABILITY — READ FIRST
 * ──────────────────────────────────────────────────────────────────────────────
 * This service is a **human-supervisor notification channel, nothing more.**
 *
 *  - It does NOT contact 911, dispatch, law enforcement, fire, EMS, medical,
 *    or any emergency service.
 *  - It does NOT guarantee an officer's safety, rescue, welfare, or recovery.
 *  - It does NOT create a duty of care to the officer, the client, the public,
 *    or any third party on the part of CoAIleague or the tenant organization.
 *  - It is NOT a substitute for human supervision. Every tenant organization
 *    is required — by Texas Occupations Code Chapter 1702 and by the analogous
 *    regulatory framework of every other U.S. state that licenses private
 *    security — to maintain adequate licensed human supervision at all times.
 *    This platform cannot and does not replace that obligation.
 *  - A panic alert reaching a supervisor does NOT mean the supervisor acted.
 *    Supervisor acknowledgement, response, dispatch of help, and contact with
 *    911 are the sole responsibility of human personnel at the tenant
 *    organization.
 *  - Delivery of SMS/WS notifications is best-effort. Cellular networks, carrier
 *    policy, device state, "Do Not Disturb," blocked numbers, silent mode, and
 *    app-kill behavior may all prevent a notification from being seen in time.
 *    CoAIleague does not warrant timely delivery.
 *
 * In short: **officers in life-threatening danger should call 911 directly.**
 * This service notifies designated humans that help may be needed. It is not,
 * and will never be, a rescue mechanism.
 *
 * Every outgoing SMS carries a short version of this disclaimer, every API
 * response returns a `notice` field, and every tenant-facing panic UI must
 * render <EmergencyDisclaimer />. Do not remove any of these surfaces without
 * explicit written legal approval.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * Domain: ops
 * Tables: panic_alerts
 */

import { pool, db } from '../../db';
import { randomUUID } from 'crypto';
import { platformEventBus } from '../platformEventBus';
import { broadcastToWorkspace } from '../../websocket';
import { createLogger } from '../../lib/logger';
import { platformActionHub } from '../helpai/platformActionHub';
import { typedPool, typedPoolExec } from '../../lib/typedSql';
import { panicAlerts, employees } from '@shared/schema';
import { eq, sql, and, inArray } from 'drizzle-orm';
import { NotificationDeliveryService } from '../notificationDeliveryService';
import { MANAGER_ROLES, OWNER_ROLES } from '@shared/lib/rbac/roleDefinitions';
import { isDeliverableEmployee } from '../../lib/isDeliverableEmployee';

/**
 * Canonical liability notice returned with every panic API response and
 * surfaced on every tenant-facing panic UI. Exported so the HTTP layer, the
 * mobile client, and any downstream integration share one string.
 *
 * Change only with written legal approval — see TRINITY.md Section O.
 */
export const PANIC_LIABILITY_NOTICE =
  'This panic alert is a notification to designated human supervisors only. ' +
  'CoAIleague does not contact 911, emergency services, law enforcement, fire, ' +
  'or EMS, and does not guarantee officer safety, response, or outcome. ' +
  'Responding to the alert, contacting emergency services, and supervising the ' +
  'officer are the sole responsibility of the tenant organization and its ' +
  'licensed human personnel. Human supervision is required at all times by ' +
  'applicable state law (e.g. Texas Occupations Code Chapter 1702) and is not ' +
  'replaced by this platform. Officers in life-threatening situations should ' +
  'call 911 directly.';

const log = createLogger('PanicAlertService');

export interface PanicAlertPayload {
  workspaceId: string;
  employeeId?: string | null;
  employeeName: string;
  siteId?: string | null;
  siteName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationAccuracy?: number | null;
  triggeredByUserId?: string;
}

export interface PanicAlert {
  id: string;
  workspaceId: string;
  alertNumber: string;
  employeeId: string | null;
  employeeName: string;
  siteId: string | null;
  siteName: string | null;
  latitude: number | null;
  longitude: number | null;
  status: 'active' | 'acknowledged' | 'resolved';
  triggeredAt: Date;
  createdAt: Date;
}

/**
 * HTTP response shape for POST /api/safety/panic. Always bundles the liability
 * notice with the alert — no caller should ever display or forward panic
 * metadata without the notice attached.
 */
export interface PanicAlertResponse {
  alert: PanicAlert;
  notice: typeof PANIC_LIABILITY_NOTICE;
}

class PanicAlertService {
  private static instance: PanicAlertService;

  static getInstance(): PanicAlertService {
    if (!PanicAlertService.instance) PanicAlertService.instance = new PanicAlertService();
    return PanicAlertService.instance;
  }

  initialize() {
    this.registerTrinityActions();
    log.info('Panic Alert Service initialized — Trinity amygdala wired');
  }

  async triggerAlert(payload: PanicAlertPayload): Promise<PanicAlert> {
    const id = randomUUID();
    const alertNumber = `SOS-${Date.now().toString(36).toUpperCase()}`;

    // Converted to Drizzle ORM
    await db.insert(panicAlerts).values({
      id,
      workspaceId: payload.workspaceId,
      alertNumber,
      employeeId: payload.employeeId || null,
      employeeName: payload.employeeName,
      siteId: payload.siteId || null,
      siteName: payload.siteName || null,
      latitude: payload.latitude != null ? String(payload.latitude) : null,
      longitude: payload.longitude != null ? String(payload.longitude) : null,
      locationAccuracy: payload.locationAccuracy != null ? String(payload.locationAccuracy) : null,
      triggeredAt: sql`now()`,
      status: 'active',
      createdAt: sql`now()`,
    });

    const rows = await db.select().from(panicAlerts).where(eq(panicAlerts.id, id)).limit(1);
    const alert = rows[0] as unknown as PanicAlert;
    if (!alert) {
      throw new Error(`Panic alert ${id} failed to persist`);
    }

    // Notify all supervisors and managers immediately
    await this.notifyEmergencyContacts(payload.workspaceId, alert);

    // Auto-create CAD call for the incident
    await this.autoCreateCadCall(alert);

    // Broadcast HIGHEST priority Trinity amygdala signal
    await platformEventBus.publish({
      type: 'panic_alert_triggered',
      category: 'automation',
      title: `PANIC ALERT — ${alertNumber}`,
      description: `${payload.employeeName} triggered an SOS panic alert${payload.siteName ? ` at ${payload.siteName}` : ''}. IMMEDIATE RESPONSE REQUIRED.`,
      workspaceId: payload.workspaceId,
      metadata: {
        alertId: id,
        alertNumber,
        employeeId: payload.employeeId || null,
        employeeName: payload.employeeName,
        siteId: payload.siteId || null,
        siteName: payload.siteName || null,
        latitude: payload.latitude || null,
        longitude: payload.longitude || null,
        priority: 'CRITICAL',
        requiresImmediateResponse: true,
      },
    });

    await broadcastToWorkspace(payload.workspaceId, {
      type: 'safety:panic_alert',
      data: alert,
      priority: 'critical',
      requiresAcknowledgment: true,
    });

    log.info(`Panic alert triggered: ${alertNumber} for ${payload.employeeName}`);
    return alert;
  }

  async acknowledgeAlert(alertId: string, workspaceId: string, acknowledgedBy: string): Promise<PanicAlert> {
    // Conditional WHERE — only acknowledge if currently active (prevents double-ack race)
    const [updated] = await db.update(panicAlerts).set({
      status: 'acknowledged',
      resolvedBy: acknowledgedBy,
    }).where(and(
      eq(panicAlerts.id, alertId),
      eq(panicAlerts.workspaceId, workspaceId),
      eq(panicAlerts.status, 'active')
    )).returning();
    if (!updated) {
      const [existing] = await db.select().from(panicAlerts)
        .where(and(eq(panicAlerts.id, alertId), eq(panicAlerts.workspaceId, workspaceId))).limit(1);
      if (!existing) throw Object.assign(new Error('Alert not found'), { code: 'NOT_FOUND' });
      throw Object.assign(new Error(`Alert already ${(existing as any).status}`), { code: 'CONFLICT' });
    }
    const alert = updated as unknown as PanicAlert;

    await platformEventBus.publish({
      type: 'panic_alert_acknowledged',
      category: 'automation',
      title: `Panic Alert Acknowledged`,
      description: `Alert ${alertId} acknowledged by ${acknowledgedBy}`,
      workspaceId,
      metadata: { alertId, acknowledgedBy, alert },
    });

    await broadcastToWorkspace(workspaceId, { type: 'safety:panic_acknowledged', data: alert });
    return alert;
  }

  async resolveAlert(alertId: string, workspaceId: string, resolvedBy: string): Promise<PanicAlert> {
    // Conditional WHERE — only resolve if active or acknowledged (prevents double-resolve)
    const [updated] = await db.update(panicAlerts).set({
      status: 'resolved',
      resolvedAt: sql`now()`,
      resolvedBy: resolvedBy,
    }).where(and(
      eq(panicAlerts.id, alertId),
      eq(panicAlerts.workspaceId, workspaceId),
      inArray(panicAlerts.status, ['active', 'acknowledged'])
    )).returning();
    if (!updated) {
      const [existing] = await db.select().from(panicAlerts)
        .where(and(eq(panicAlerts.id, alertId), eq(panicAlerts.workspaceId, workspaceId))).limit(1);
      if (!existing) throw Object.assign(new Error('Alert not found'), { code: 'NOT_FOUND' });
      if ((existing as any).status === 'resolved') return existing as unknown as PanicAlert; // idempotent
      throw Object.assign(new Error(`Cannot resolve alert with status: ${(existing as any).status}`), { code: 'CONFLICT' });
    }
    const alert = updated as unknown as PanicAlert;

    await platformEventBus.publish({
      type: 'panic_alert_resolved',
      category: 'automation',
      title: `Panic Alert Resolved`,
      description: `Alert resolved by ${resolvedBy}`,
      workspaceId,
      metadata: { alertId, resolvedBy },
    });

    await broadcastToWorkspace(workspaceId, { type: 'safety:panic_resolved', data: alert });
    return alert;
  }

  async listAlerts(workspaceId: string, status?: string, limit = 50): Promise<PanicAlert[]> {
    let query = `SELECT * FROM panic_alerts WHERE workspace_id=$1`;
    const params: any[] = [workspaceId];
    if (status) { query += ` AND status=$2`; params.push(status); }
    const clampedLimit = Math.min(Math.max(1, Number(limit) || 50), 200);
    query += ` ORDER BY triggered_at DESC LIMIT $${params.length + 1}`;
    params.push(clampedLimit);
    const rows = await typedPool(query, params);
    return rows.rows;
  }

  private async notifyEmergencyContacts(workspaceId: string, alert: PanicAlert) {
    // SMS blast to the entire supervisory chain. WebSocket broadcast alone is
    // not sufficient — supervisors may be off-shift, not looking at the app,
    // or on a mobile browser where the WS connection is closed. A panic alert
    // is the single highest-priority signal on the platform; every manager and
    // owner must get a phone-level ping awaited before the handler returns.
    const chainRoles = Array.from(new Set([...MANAGER_ROLES, ...OWNER_ROLES]));
    const chain = await db
      .select({
        id: employees.id,
        userId: employees.userId,
        phone: employees.phone,
        firstName: employees.firstName,
        lastName: employees.lastName,
        isActive: employees.isActive,
        status: (employees as any).status,
      })
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, workspaceId),
          inArray(employees.workspaceRole, chainRoles),
          eq(employees.isActive, true),
        ),
      );

    // Exclude terminated/deactivated/suspended supervisors from the panic chain
    const activeChain = chain.filter(isDeliverableEmployee);

    const locationLine = alert.latitude != null && alert.longitude != null
      ? `GPS ${Number(alert.latitude).toFixed(4)},${Number(alert.longitude).toFixed(4)}`
      : alert.siteName || 'location unknown';
    // Liability language is MANDATORY in the SMS body. Recipients must know this
    // notification is informational only — they are the responders, and calling
    // 911 is their judgment call, not the platform's. Do not shorten.
    const smsBody =
      `COALEAGUE SUPERVISOR ALERT: ${alert.employeeName} pressed the panic button. ` +
      `${locationLine}. You are a designated supervisor. ` +
      `Contact the officer now and decide whether to call 911. ` +
      `This is a notification only — CoAIleague does NOT contact emergency services ` +
      `and does NOT guarantee officer safety. Human response is required.`;

    let reachableCount = 0;
    for (const recipient of activeChain) {
      if (!recipient.phone || !recipient.userId) continue;
      try {
        await NotificationDeliveryService.send({
          type: 'incident_alert',
          workspaceId,
          recipientUserId: recipient.userId,
          channel: 'sms',
          body: { to: recipient.phone, body: smsBody },
          idempotencyKey: `panic_sms_${alert.id}_${recipient.id}`,
        });
        reachableCount++;
      } catch (err: unknown) {
        log.warn(
          `[PanicAlert] SMS dispatch failed for ${recipient.firstName} ${recipient.lastName} (non-fatal):`,
          err?.message,
        );
      }
    }

    log.info(
      `Panic alert ${alert.alertNumber} — SMS blast: ${reachableCount}/${activeChain.length} supervisory-chain recipients with a phone on file.`,
    );
  }

  private async autoCreateCadCall(alert: PanicAlert) {
    try {
      // CATEGORY C — Genuine schema mismatch: SQL uses 'description' and 'location' columns but schema has 'incidentDescription' and 'locationDescription' | Cannot convert until schema aligned
      await typedPoolExec(
        `INSERT INTO cad_calls
           (workspace_id, call_number, call_type, priority, description, location, site_id, site_name, status, created_by, latitude, longitude)
         VALUES ($1, $2, 'Officer Panic Alert', 1, $3, $4, $5, $6, 'pending', 'Trinity AI', $7, $8)
         ON CONFLICT DO NOTHING`,
        [
          alert.workspaceId,
          `CAD-SOS-${alert.alertNumber}`,
          `Panic/SOS alert from ${alert.employeeName}. Immediate welfare check required.`,
          alert.siteName || 'Unknown Location',
          alert.siteId,
          alert.siteName,
          alert.latitude,
          alert.longitude,
        ]
      );
    } catch (err: unknown) {
      log.error('Auto CAD call creation failed (non-critical)', { error: (err instanceof Error ? err.message : String(err)) });
    }
  }

  private registerTrinityActions() {
    platformActionHub.registerAction({
      actionId: 'safety.panic_alert.list',
      name: 'List Panic Alerts',
      category: 'safety',
      description: 'List all panic/SOS alerts for the workspace. Supports filtering by status (active, acknowledged, resolved).',
      requiredRoles: ['manager', 'supervisor', 'owner', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        const { status, limit = 20 } = request.payload || {};
        const alerts = await this.listAlerts(request.workspaceId!, status, limit);
        return { success: true, actionId: request.actionId, message: `Found ${alerts.length} panic alert(s)`, data: { alerts, count: alerts.length } };
      },
    });

    platformActionHub.registerAction({
      actionId: 'safety.panic_alert.resolve',
      name: 'Resolve Panic Alert',
      category: 'safety',
      description: 'Mark a panic alert as resolved and clear it from active monitoring.',
      requiredRoles: ['manager', 'supervisor', 'owner', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        const { alertId, resolvedBy } = request.payload || {};
        if (!alertId) return { success: false, actionId: request.actionId, message: 'alertId required', data: null };
        const alert = await this.resolveAlert(alertId, request.workspaceId!, resolvedBy || 'Manager');
        return { success: true, actionId: request.actionId, message: `Panic alert resolved`, data: alert };
      },
    });

    platformActionHub.registerAction({
      actionId: 'emergency.panic_alert.status',
      name: 'Get Active Emergency Alerts',
      category: 'emergency',
      description: 'Get all currently active (unresolved) panic and SOS alerts across the workspace.',
      requiredRoles: ['manager', 'supervisor', 'owner', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        const alerts = await this.listAlerts(request.workspaceId!, 'active', 50);
        return { success: true, actionId: request.actionId, message: alerts.length ? `${alerts.length} active emergency alert(s)` : 'No active emergency alerts', data: { alerts, activeCount: alerts.length } };
      },
    });
  }
}

export const panicAlertService = PanicAlertService.getInstance();
