/**
 * Lone Worker Service
 * ====================
 * Officers working alone check in at configured intervals (default 30 min).
 * Missed check-ins escalate through supervisor → manager → owner.
 * Trinity receives missed check-ins via the amygdala priority layer.
 *
 * Domain: ops
 * Tables: lone_worker_sessions
 * Delegates to: server/services/automation/loneWorkerSafetyService.ts for daemon
 */

import { pool, db } from '../../db';
import { randomUUID } from 'crypto';
import { platformEventBus } from '../platformEventBus';
import { broadcastToWorkspace } from '../../websocket';
import { createLogger } from '../../lib/logger';
import { platformActionHub } from '../helpai/platformActionHub';
import { typedPool, typedPoolExec } from '../../lib/typedSql';
import { loneWorkerSessions } from '@shared/schema';
import { eq, sql, and } from 'drizzle-orm';

const log = createLogger('LoneWorkerService');

export interface LoneWorkerSession {
  id: string;
  workspaceId: string;
  employeeId: string | null;
  employeeName: string;
  shiftId: string | null;
  siteId: string | null;
  siteName: string | null;
  intervalMinutes: number;
  startedAt: Date;
  lastCheckinAt: Date;
  missedCheckins: number;
  status: 'active' | 'ended';
  endedAt: Date | null;
}

class LoneWorkerService {
  private static instance: LoneWorkerService;

  static getInstance(): LoneWorkerService {
    if (!LoneWorkerService.instance) LoneWorkerService.instance = new LoneWorkerService();
    return LoneWorkerService.instance;
  }

  initialize() {
    this.registerTrinityActions();
    log.info('Lone Worker Service initialized');
  }

  async startSession(data: {
    workspaceId: string;
    employeeId?: string | null;
    employeeName: string;
    shiftId?: string | null;
    siteId?: string | null;
    siteName?: string | null;
    intervalMinutes?: number;
    notes?: string | null;
  }): Promise<LoneWorkerSession> {
    if (data.employeeId) {
      // Converted to Drizzle ORM
      await db.update(loneWorkerSessions).set({
        status: 'ended',
        endedAt: sql`now()`,
      }).where(and(eq(loneWorkerSessions.workspaceId, data.workspaceId), eq(loneWorkerSessions.employeeId, data.employeeId), eq(loneWorkerSessions.status, 'active')));
    }

    const id = randomUUID();
    const interval = data.intervalMinutes || 30;

    // Converted to Drizzle ORM: startSession → INTERVAL
    // @ts-expect-error — TS migration: fix in refactoring sprint
    await db.insert(loneWorkerSessions).values({
      id,
      workspaceId: data.workspaceId,
      employeeId: data.employeeId || null,
      shiftId: data.shiftId || null,
      status: 'active',
      checkInInterval: interval,
      lastCheckIn: sql`NOW()`,
      nextCheckInDue: sql`NOW() + (${sql.raw(interval.toString())} || ' minutes')::interval`,
      createdAt: sql`NOW()`,
      updatedAt: sql`NOW()`,
    });

    const rows = await db.select().from(loneWorkerSessions).where(eq(loneWorkerSessions.id, id));
    const session = rows[0] as unknown as LoneWorkerSession;

    await platformEventBus.publish({
      type: 'lone_worker_session_started',
      category: 'automation',
      title: `Lone Worker Session Started — ${data.employeeName}`,
      description: `${data.employeeName} started a lone worker session. Check-in every ${interval} minutes.`,
      workspaceId: data.workspaceId,
      metadata: { sessionId: id, employeeId: data.employeeId, employeeName: data.employeeName, intervalMinutes: interval, siteId: data.siteId, siteName: data.siteName },
    });

    await broadcastToWorkspace(data.workspaceId, { type: 'safety:lone_worker_started', data: session });
    return session;
  }

  async checkIn(data: {
    workspaceId: string;
    employeeId?: string | null;
    sessionId?: string | null;
    notes?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }): Promise<LoneWorkerSession | null> {
    // Converted to Drizzle ORM: checkIn → INTERVAL
    if (data.sessionId) {
      await db.update(loneWorkerSessions)
        .set({
          lastCheckIn: sql`NOW()`,
          updatedAt: sql`NOW()`,
          nextCheckInDue: sql`NOW() + (check_in_interval || ' minutes')::interval`,
        })
        .where(and(
          eq(loneWorkerSessions.id, data.sessionId),
          eq(loneWorkerSessions.workspaceId, data.workspaceId),
          eq(loneWorkerSessions.status, 'active')
        ));
    } else {
      await db.update(loneWorkerSessions)
        .set({
          lastCheckIn: sql`NOW()`,
          updatedAt: sql`NOW()`,
          nextCheckInDue: sql`NOW() + (check_in_interval || ' minutes')::interval`,
        })
        .where(and(
          eq(loneWorkerSessions.workspaceId, data.workspaceId),
          eq(loneWorkerSessions.employeeId, data.employeeId!),
          eq(loneWorkerSessions.status, 'active')
        ));
    }

    const fetchResult = data.sessionId
      ? await db.select().from(loneWorkerSessions).where(eq(loneWorkerSessions.id, data.sessionId)).limit(1)
      : await db.select().from(loneWorkerSessions).where(and(eq(loneWorkerSessions.workspaceId, data.workspaceId), eq(loneWorkerSessions.employeeId, data.employeeId!), eq(loneWorkerSessions.status, 'active'))).limit(1);

    if (!fetchResult.length) return null;
    const session = fetchResult[0] as unknown as LoneWorkerSession;

    await platformEventBus.publish({
      type: 'lone_worker_checked_in',
      category: 'automation',
      title: `Lone Worker Check-In`,
      description: `Officer checked in successfully`,
      workspaceId: data.workspaceId,
      metadata: { sessionId: session.id, employeeId: data.employeeId, latitude: data.latitude, longitude: data.longitude },
    });

    await broadcastToWorkspace(data.workspaceId, { type: 'safety:lone_worker_checkin', data: session });
    return session;
  }

  async endSession(data: { workspaceId: string; employeeId?: string | null; sessionId?: string | null }): Promise<void> {
    const { and, eq } = await import('drizzle-orm');
    const conditions = [
      eq(loneWorkerSessions.workspaceId, data.workspaceId),
      eq(loneWorkerSessions.status, 'active')
    ];
    if (data.sessionId) conditions.push(eq(loneWorkerSessions.id, data.sessionId));
    else if (data.employeeId) conditions.push(eq(loneWorkerSessions.employeeId, data.employeeId));

    await db.update(loneWorkerSessions)
      .set({
        status: 'ended',
        endedAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .where(and(...conditions));

    await platformEventBus.publish({
      type: 'lone_worker_session_ended',
      category: 'automation',
      title: 'Lone Worker Session Ended',
      description: 'Lone worker session ended normally',
      workspaceId: data.workspaceId,
      metadata: { employeeId: data.employeeId, sessionId: data.sessionId },
    });

    await broadcastToWorkspace(data.workspaceId, { type: 'safety:lone_worker_ended', data: {} });
  }

  async escalateMissedCheckIn(workspaceId: string, sessionId: string, missedCount: number) {
    const session = await db.select().from(loneWorkerSessions).where(eq(loneWorkerSessions.id, sessionId));
    if (!session.length) return;
    const s = session[0];

    const level = missedCount === 1 ? 'supervisor' : missedCount === 2 ? 'manager' : 'owner';
    const urgency = missedCount >= 3 ? 'CRITICAL — OFFICER WELFARE CHECK REQUIRED' : missedCount === 2 ? 'URGENT' : 'WARNING';

    await platformEventBus.publish({
      type: 'lone_worker_missed_checkin',
      category: 'automation',
      title: `${urgency}: Lone Worker Missed Check-In`,
      description: `${(s as any).employee_name || 'Officer'} has missed ${missedCount} check-in(s). Escalating to ${level}.`,
      workspaceId,
      metadata: { sessionId, employeeId: s.employeeId, missedCount, level, requiresImmediateResponse: missedCount >= 3 },
    });

    await broadcastToWorkspace(workspaceId, {
      type: 'safety:lone_worker_missed',
      data: { sessionId, missedCount, level, urgency },
      priority: missedCount >= 3 ? 'critical' : 'high',
    });

    // Real-time escalation via WebSocket broadcast — supervisors monitoring the dashboard see the alert
    log.warn(`Lone worker missed check-in escalated to ${level}: ${(s as any).employee_name || 'officer'}, missed=${missedCount}`);
  }

  async listActiveSessions(workspaceId: string): Promise<LoneWorkerSession[]> {
    const { and, eq, desc } = await import('drizzle-orm');
    const result = await db
      .select()
      .from(loneWorkerSessions)
      .where(and(
        eq(loneWorkerSessions.workspaceId, workspaceId),
        eq(loneWorkerSessions.status, 'active')
      ))
      .orderBy(desc(loneWorkerSessions.createdAt));

    return result as unknown as LoneWorkerSession[];
  }

  private registerTrinityActions() {
    platformActionHub.registerAction({
      actionId: 'safety.lone_worker.active_sessions',
      name: 'List Active Lone Worker Sessions',
      category: 'safety',
      description: 'Get all officers currently in lone worker mode with their check-in status.',
      requiredRoles: ['manager', 'supervisor', 'owner', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        const sessions = await this.listActiveSessions(request.workspaceId!);
        return { success: true, actionId: request.actionId, message: `${sessions.length} active lone worker session(s)`, data: { sessions } };
      },
    });

    platformActionHub.registerAction({
      actionId: 'safety.lone_worker.missed_check_ins',
      name: 'Check for Missed Lone Worker Check-Ins',
      category: 'safety',
      description: 'Check if any active lone worker sessions have missed their scheduled check-ins.',
      requiredRoles: ['manager', 'supervisor', 'owner', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        const { and, eq, lt } = await import('drizzle-orm');
        const overdue = await db
          .select()
          .from(loneWorkerSessions)
          .where(and(
            eq(loneWorkerSessions.workspaceId, request.workspaceId!),
            eq(loneWorkerSessions.status, 'active'),
            lt(loneWorkerSessions.nextCheckInDue, sql`NOW()`)
          ));
        return { success: true, actionId: request.actionId, message: `${overdue.length} overdue check-in(s)`, data: { overdue } };
      },
    });

    platformActionHub.registerAction({
      actionId: 'emergency.lone_worker.welfare_check',
      name: 'Trigger Welfare Check',
      category: 'emergency',
      description: 'Immediately initiate an emergency welfare check for a lone worker who cannot be reached.',
      requiredRoles: ['manager', 'supervisor', 'owner', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        const { sessionId, employeeName } = request.payload || {};
        if (sessionId) await this.escalateMissedCheckIn(request.workspaceId!, sessionId, 3);
        return { success: true, actionId: request.actionId, message: `Welfare check initiated for ${employeeName || 'officer'}`, data: { sessionId, triggered: true } };
      },
    });
  }
}

export const loneWorkerService = LoneWorkerService.getInstance();
