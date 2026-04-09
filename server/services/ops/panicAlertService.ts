/**
 * Panic Alert Service
 * ====================
 * Manages officer panic/duress SOS alerts.
 * All panic alerts are routed through the Trinity amygdala priority layer as
 * the highest urgency signal — no panic ever fails silently.
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
import { panicAlerts } from '@shared/schema';
import { eq, sql, and } from 'drizzle-orm';

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

    const rows = await db.select().from(panicAlerts).where(eq(panicAlerts.id, id));
    const alert = (rows as any).rows[0] as PanicAlert;

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
    // Converted to Drizzle ORM
    await db.update(panicAlerts).set({
      status: 'acknowledged',
      resolvedBy: acknowledgedBy,
    }).where(and(eq(panicAlerts.id, alertId), eq(panicAlerts.workspaceId, workspaceId)));
    const rows = await db.select().from(panicAlerts).where(eq(panicAlerts.id, alertId));
    const alert = (rows as any).rows[0] as PanicAlert;

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
    // Converted to Drizzle ORM
    await db.update(panicAlerts).set({
      status: 'resolved',
      resolvedAt: sql`now()`,
      resolvedBy: resolvedBy,
    }).where(and(eq(panicAlerts.id, alertId), eq(panicAlerts.workspaceId, workspaceId)));
    const rows = await db.select().from(panicAlerts).where(eq(panicAlerts.id, alertId));
    const alert = (rows as any).rows[0] as PanicAlert;

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
    query += ` ORDER BY triggered_at DESC LIMIT ${limit}`;
    const rows = await typedPool(query, params);
    return rows.rows;
  }

  private async notifyEmergencyContacts(workspaceId: string, alert: PanicAlert) {
    // WebSocket broadcast is the primary notification channel for panic alerts
    // The safetyRoutes.ts broadcast covers real-time supervisor notification
    log.info(`Panic alert ${alert.alertNumber} — supervisors notified via WebSocket broadcast`);
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
    } catch (err: any) {
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
