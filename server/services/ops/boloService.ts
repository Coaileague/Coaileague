/**
 * BOLO Service — Be On Lookout
 * =============================
 * Manages BOLO alerts for security officers.
 * BOLOs are broadcast to all officers on shift via Trinity.
 * All BOLO records are workspace_id isolated.
 *
 * Domain: ops
 * Tables: bolo_alerts
 */

import { pool, db } from '../../db';
import { randomUUID } from 'crypto';
import { platformEventBus } from '../platformEventBus';
import { broadcastToWorkspace } from '../../websocket';
import { createLogger } from '../../lib/logger';
import { platformActionHub } from '../helpai/platformActionHub';
import { typedPool, typedPoolExec } from '../../lib/typedSql';
import { boloAlerts } from '@shared/schema';
import { eq, sql, and } from 'drizzle-orm';

const log = createLogger('BOLOService');

export interface BOLOAlert {
  id: string;
  workspaceId: string;
  subjectName: string;
  subjectDob: string | null;
  subjectDescription: string | null;
  photoUrl: string | null;
  reason: string;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  isActive: boolean;
  expiresAt: Date | null;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

class BOLOService {
  private static instance: BOLOService;

  static getInstance(): BOLOService {
    if (!BOLOService.instance) BOLOService.instance = new BOLOService();
    return BOLOService.instance;
  }

  initialize() {
    this.registerTrinityActions();
    log.info('BOLO Service initialized');
  }

  async createBOLO(data: {
    workspaceId: string;
    subjectName: string;
    subjectDob?: string | null;
    subjectDescription?: string | null;
    photoUrl?: string | null;
    reason: string;
    threatLevel?: 'low' | 'medium' | 'high' | 'critical';
    expiresAt?: Date | null;
    createdById?: string | null;
    createdByName?: string;
  }): Promise<BOLOAlert> {
    const id = randomUUID();
    const threatLevel = data.threatLevel || 'medium';

    // Converted to Drizzle ORM
    await db.insert(boloAlerts).values({
      id,
      workspaceId: data.workspaceId,
      subjectName: data.subjectName,
      subjectDob: data.subjectDob || null,
      subjectDescription: data.subjectDescription || null,
      photoUrl: data.photoUrl || null,
      reason: data.reason,
      isActive: true,
      expiresAt: data.expiresAt || null,
      createdById: data.createdById || null,
      createdByName: data.createdByName || 'Manager',
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    });

    const rows = await db.select().from(boloAlerts).where(eq(boloAlerts.id, id));
    const bolo = (rows as any).rows[0] as BOLOAlert;

    await platformEventBus.publish({
      type: 'bolo_created',
      category: 'automation',
      title: `BOLO Created — ${data.subjectName}`,
      description: `New BOLO alert for '${data.subjectName}' — ${data.reason}`,
      workspaceId: data.workspaceId,
      metadata: { boloId: id, subjectName: data.subjectName, reason: data.reason, threatLevel },
    });

    await broadcastToWorkspace(data.workspaceId, { type: 'ops:bolo_created', data: bolo });
    log.info(`BOLO created: ${id} for ${data.subjectName}`);
    return bolo;
  }

  async deactivateBOLO(boloId: string, workspaceId: string): Promise<BOLOAlert> {
    // Converted to Drizzle ORM
    await db.update(boloAlerts).set({
      isActive: false,
      updatedAt: sql`now()`,
    }).where(and(eq(boloAlerts.id, boloId), eq(boloAlerts.workspaceId, workspaceId)));
    const rows = await db.select().from(boloAlerts).where(eq(boloAlerts.id, boloId));
    const bolo = (rows as any).rows[0] as BOLOAlert;

    await platformEventBus.publish({
      type: 'bolo_cleared',
      category: 'automation',
      title: `BOLO Cleared — ${bolo.subjectName}`,
      description: `BOLO for ${bolo.subjectName} has been cleared`,
      workspaceId,
      metadata: { boloId },
    });

    await broadcastToWorkspace(workspaceId, { type: 'ops:bolo_cleared', data: bolo });
    return bolo;
  }

  async checkVisitorAgainstBOLOs(workspaceId: string, visitorName: string): Promise<BOLOAlert[]> {
    // CATEGORY C — Raw SQL retained: LIKE | Tables: bolo_alerts | Verified: 2026-03-23
    const rows = await typedPool(
      `SELECT * FROM bolo_alerts WHERE workspace_id=$1 AND is_active=true
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (LOWER(subject_name) LIKE LOWER($2) OR LOWER($2) LIKE '%' || LOWER(subject_name) || '%')`,
      [workspaceId, `%${visitorName}%`]
    );
    return rows.rows;
  }

  async listActiveBOLOs(workspaceId: string): Promise<BOLOAlert[]> {
    // CATEGORY C — Raw SQL retained: IS NULL | Tables: bolo_alerts | Verified: 2026-03-23
    const rows = await typedPool(
      `SELECT * FROM bolo_alerts WHERE workspace_id=$1 AND is_active=true
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC`,
      [workspaceId]
    );
    return rows.rows;
  }

  async listAllBOLOs(workspaceId: string, limit = 50): Promise<BOLOAlert[]> {
    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: bolo_alerts | Verified: 2026-03-23
    const rows = await typedPool(
      `SELECT * FROM bolo_alerts WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT $2`,
      [workspaceId, limit]
    );
    return rows.rows;
  }

  private registerTrinityActions() {
    platformActionHub.registerAction({
      actionId: 'safety.bolo.list_active',
      name: 'List Active BOLOs',
      category: 'safety',
      description: 'List all active BOLO (Be On Lookout) alerts for the workspace.',
      requiredRoles: ['employee', 'manager', 'supervisor', 'owner'],
      handler: async (request) => {
        const bolos = await this.listActiveBOLOs(request.workspaceId!);
        return { success: true, actionId: request.actionId, message: `${bolos.length} active BOLO(s)`, data: { bolos } };
      },
    });

    platformActionHub.registerAction({
      actionId: 'safety.bolo.create',
      name: 'Create BOLO Alert',
      category: 'safety',
      description: 'Create a new BOLO (Be On Lookout) alert and broadcast it to all officers on shift.',
      requiredRoles: ['manager', 'supervisor', 'owner'],
      handler: async (request) => {
        const { subjectName, reason, subjectDescription, threatLevel } = request.payload || {};
        if (!subjectName || !reason) return { success: false, actionId: request.actionId, message: 'subjectName and reason required', data: null };
        const bolo = await this.createBOLO({ workspaceId: request.workspaceId!, subjectName, reason, subjectDescription, threatLevel });
        return { success: true, actionId: request.actionId, message: `BOLO created for ${subjectName}`, data: bolo };
      },
    });

    platformActionHub.registerAction({
      actionId: 'postorders.bolo.check_visitor',
      name: 'Check Visitor Against BOLOs',
      category: 'postorders',
      description: 'Check if a visitor name matches any active BOLO alerts. Returns matching BOLOs if found.',
      requiredRoles: ['employee', 'manager', 'supervisor', 'owner'],
      handler: async (request) => {
        const { visitorName } = request.payload || {};
        if (!visitorName) return { success: false, actionId: request.actionId, message: 'visitorName required', data: null };
        const matches = await this.checkVisitorAgainstBOLOs(request.workspaceId!, visitorName);
        return { success: true, actionId: request.actionId, message: matches.length ? `WARNING: ${matches.length} BOLO match(es) found` : 'No BOLO matches', data: { matches, hasMatch: matches.length > 0 } };
      },
    });
  }
}

export const boloService = BOLOService.getInstance();
