/**
 * Visitor Log Service
 * ====================
 * Officers log all visitor entries and exits.
 * Automatically cross-references against active BOLOs.
 * Overdue visitor alerts (not signed out) are flagged for supervisor review.
 * All visitor records are workspace_id isolated.
 *
 * Domain: ops
 * Tables: visitor_logs
 */

import { pool, db } from '../../db';
import { randomUUID } from 'crypto';
import { platformEventBus } from '../platformEventBus';
import { broadcastToWorkspace } from '../../websocket';
import { createLogger } from '../../lib/logger';
import { platformActionHub } from '../helpai/platformActionHub';
import { boloService } from './boloService';
import { typedPool, typedPoolExec } from '../../lib/typedSql';
import { visitorLogs } from '@shared/schema';
import { eq, sql, and } from 'drizzle-orm';

const log = createLogger('VisitorLogService');

export interface VisitorLog {
  id: string;
  workspaceId: string;
  siteId: string | null;
  siteName: string;
  visitorName: string;
  visitorCompany: string | null;
  visitorIdType: string | null;
  visitorIdNumber: string | null;
  visitorBadgeNumber: string | null;
  hostName: string | null;
  hostEmployeeId: string | null;
  purpose: string | null;
  vehiclePlate: string | null;
  checkedInAt: Date;
  checkedOutAt: Date | null;
  checkedInBy: string | null;
  checkedOutBy: string | null;
  expectedDeparture: Date | null;
  alertSent: boolean;
  createdAt: Date;
}

class VisitorLogService {
  private static instance: VisitorLogService;

  static getInstance(): VisitorLogService {
    if (!VisitorLogService.instance) VisitorLogService.instance = new VisitorLogService();
    return VisitorLogService.instance;
  }

  initialize() {
    this.registerTrinityActions();
    log.info('Visitor Log Service initialized');
  }

  async checkIn(data: {
    workspaceId: string;
    siteId?: string | null;
    siteName: string;
    visitorName: string;
    visitorCompany?: string | null;
    visitorIdType?: string | null;
    visitorIdNumber?: string | null;
    visitorBadgeNumber?: string | null;
    hostName?: string | null;
    hostEmployeeId?: string | null;
    purpose?: string | null;
    vehiclePlate?: string | null;
    checkedInBy?: string | null;
    expectedDeparture?: Date | null;
    notes?: string | null;
  }): Promise<{ visitor: VisitorLog; boloMatches: any[] }> {
    const id = randomUUID();

    // Converted to Drizzle ORM
    await db.insert(visitorLogs).values({
      id,
      workspaceId: data.workspaceId,
      siteId: data.siteId || null,
      siteName: data.siteName,
      visitorName: data.visitorName,
      visitorCompany: data.visitorCompany || null,
      visitorIdType: data.visitorIdType || null,
      visitorIdNumber: data.visitorIdNumber || null,
      visitorBadgeNumber: data.visitorBadgeNumber || null,
      hostName: data.hostName || null,
      hostEmployeeId: data.hostEmployeeId || null,
      purpose: data.purpose || null,
      vehiclePlate: data.vehiclePlate || null,
      checkedInAt: sql`now()`,
      checkedInBy: data.checkedInBy || null,
      expectedDeparture: data.expectedDeparture || null,
      createdAt: sql`now()`,
    });

    const rows = await db.select().from(visitorLogs).where(eq(visitorLogs.id, id));
    const visitor = (rows as any).rows[0] as VisitorLog;

    // Cross-reference against active BOLOs
    const boloMatches = await boloService.checkVisitorAgainstBOLOs(data.workspaceId, data.visitorName);

    if (boloMatches.length > 0) {
      const bolo = boloMatches[0];
      await platformEventBus.publish({
        type: 'bolo_match_detected',
        category: 'automation',
        title: `BOLO MATCH — ${data.visitorName}`,
        description: `Visitor '${data.visitorName}' matches active BOLO at ${data.siteName}. NOTIFY SUPERVISOR IMMEDIATELY.`,
        workspaceId: data.workspaceId,
        metadata: { boloId: bolo.id, subjectName: data.visitorName, siteId: data.siteId, siteName: data.siteName, visitorLogId: id },
      });

      await broadcastToWorkspace(data.workspaceId, {
        type: 'ops:bolo_match',
        data: { visitorLogId: id, visitorName: data.visitorName, siteName: data.siteName, boloId: bolo.id, boloSubjectName: bolo.subjectName },
        priority: 'critical',
      });
    }

    await platformEventBus.publish({
      type: 'visitor_checked_in',
      category: 'automation',
      title: `Visitor Checked In — ${data.visitorName}`,
      description: `${data.visitorName} checked in at ${data.siteName}`,
      workspaceId: data.workspaceId,
      metadata: { visitorLogId: id, visitorName: data.visitorName, siteId: data.siteId, siteName: data.siteName },
    });

    return { visitor, boloMatches };
  }

  async checkOut(visitorLogId: string, workspaceId: string, checkedOutBy?: string): Promise<VisitorLog> {
    // Converted to Drizzle ORM
    await db.update(visitorLogs).set({
      checkedOutAt: sql`now()`,
      checkedOutBy: checkedOutBy || null,
    }).where(and(eq(visitorLogs.id, visitorLogId), eq(visitorLogs.workspaceId, workspaceId)));
    const rows = await db.select().from(visitorLogs).where(eq(visitorLogs.id, visitorLogId));
    const visitor = (rows as any).rows[0] as VisitorLog;

    await platformEventBus.publish({
      type: 'visitor_checked_out',
      category: 'automation',
      title: `Visitor Checked Out — ${visitor.visitorName}`,
      description: `${visitor.visitorName} checked out from ${visitor.siteName}`,
      workspaceId,
      metadata: { visitorLogId, visitorName: visitor.visitorName },
    });

    return visitor;
  }

  async listVisitors(workspaceId: string, siteId?: string, onsite = false, limit = 50): Promise<VisitorLog[]> {
    let query = `SELECT * FROM visitor_logs WHERE workspace_id=$1`;
    const params: any[] = [workspaceId];
    if (siteId) { query += ` AND site_id=$2`; params.push(siteId); }
    if (onsite) query += ` AND checked_out_at IS NULL`;
    query += ` ORDER BY checked_in_at DESC LIMIT ${limit}`;
    const rows = await typedPool(query, params);
    // @ts-expect-error — TS migration: fix in refactoring sprint
    return rows.rows;
  }

  async getOnsiteVisitors(workspaceId: string, siteId?: string): Promise<VisitorLog[]> {
    return this.listVisitors(workspaceId, siteId, true);
  }

  async checkOverdueVisitors(workspaceId: string): Promise<VisitorLog[]> {
    // CATEGORY C — Raw SQL retained: IS NULL | Tables: visitor_logs | Verified: 2026-03-23
    const rows = await typedPool(
      `SELECT * FROM visitor_logs WHERE workspace_id=$1 AND checked_out_at IS NULL
         AND expected_departure IS NOT NULL AND expected_departure < NOW() AND alert_sent=false`,
      [workspaceId]
    );
    // @ts-expect-error — TS migration: fix in refactoring sprint
    return rows.rows;
  }

  private registerTrinityActions() {
    platformActionHub.registerAction({
      actionId: 'safety.visitor_log.onsite',
      name: 'Get On-Site Visitors',
      category: 'safety',
      description: 'List all visitors currently checked in and on-site.',
      requiredRoles: ['employee', 'manager', 'supervisor', 'owner'],
      handler: async (request) => {
        const { siteId } = request.payload || {};
        const visitors = await this.getOnsiteVisitors(request.workspaceId!, siteId);
        return { success: true, actionId: request.actionId, message: `${visitors.length} visitor(s) currently on-site`, data: { visitors } };
      },
    });

    platformActionHub.registerAction({
      actionId: 'postorders.visitor_log.check_in',
      name: 'Log Visitor Check-In',
      category: 'postorders',
      description: 'Log a visitor checking into a site. Automatically cross-references against active BOLOs.',
      requiredRoles: ['employee', 'manager', 'supervisor', 'owner'],
      handler: async (request) => {
        const { siteName, visitorName, purpose, hostName } = request.payload || {};
        if (!siteName || !visitorName) return { success: false, actionId: request.actionId, message: 'siteName and visitorName required', data: null };
        const result = await this.checkIn({ workspaceId: request.workspaceId!, siteName, visitorName, purpose, hostName });
        return { success: true, actionId: request.actionId, message: `${visitorName} checked in at ${siteName}${result.boloMatches.length ? ' — BOLO MATCH DETECTED' : ''}`, data: result };
      },
    });

    platformActionHub.registerAction({
      actionId: 'safety.visitor_log.overdue',
      name: 'Check for Overdue Visitors',
      category: 'safety',
      description: 'Find visitors who have exceeded their expected departure time and have not signed out.',
      requiredRoles: ['manager', 'supervisor', 'owner'],
      handler: async (request) => {
        const overdue = await this.checkOverdueVisitors(request.workspaceId!);
        return { success: true, actionId: request.actionId, message: `${overdue.length} overdue visitor(s)`, data: { overdue } };
      },
    });
  }
}

export const visitorLogService = VisitorLogService.getInstance();
