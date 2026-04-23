/**
 * SHIFT ROOM BOT ORCHESTRATOR
 * ============================
 * Autonomous bot intelligence engine for all shift rooms.
 * Manages ReportBot, HelpAI, MeetingBot, and ClockBot behavior
 * within chatConversation rooms of type shift_chat and meeting rooms.
 *
 * Architecture:
 * - This service writes to chatMessages (the live ChatDock system)
 * - It is invoked by:
 *   (a) Room creation events → auto-entry + welcome
 *   (b) Message events from websocket.ts → reactive bot responses
 *   (c) Cron jobs in autonomousScheduler.ts → proactive check-ins
 *   (d) Shift assignment in shiftRoutes.ts → auto-room creation
 */

import { db } from '../../db';
import {
  chatConversations,
  chatMessages,
  chatParticipants,
  organizationChatRooms,
  shifts,
  employees,
  users,
  notifications,
  timeEntries,
  orgDocuments,
  incidentReports,
  boloAlerts,
  panicAlerts,
  postOrderTemplates,
  platformRoles,
  employeeDocuments,
} from '@shared/schema';
import { eq, and, desc, gte, lte, sql, isNull, ne, ilike } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { format, addMinutes, subMinutes } from 'date-fns';
import { botAIService } from '../../bots/botAIService';
import { storage } from '../../storage';
import { createLogger } from '../../lib/logger';
const log = createLogger('shiftRoomBotOrchestrator');


// ─── Types ──────────────────────────────────────────────────────────────────

export interface ShiftRoomContext {
  conversationId: string;
  workspaceId: string;
  shiftId: string;
  officerName: string;
  officerUserId: string;
  siteName: string;
  shiftStart: Date;
  shiftEnd: Date;
  siteLatitude?: number | null;
  siteLongitude?: number | null;
  siteRadius?: number | null;
}

export interface BotMessagePayload {
  conversationId: string;
  workspaceId: string;
  senderId: string;
  senderName: string;
  content: string;
  metadata?: Record<string, any>;
}

// In-memory pending ClockBot confirmation map
// Key: `${managerId}-${conversationId}`
// State machine: awaitingReason=true → manager types reason → awaitingReason=false → CONFIRM → execute
const clockBotPending = new Map<string, {
  officerName: string;
  siteName: string;
  officerUserId: string;
  officerEmployeeId?: string;
  shiftId: string;
  workspaceId: string;
  managerId: string;
  managerName: string;
  conversationId: string;
  expiresAt: number;
  awaitingReason: boolean;
  reason?: string;
  // Trinity validation context
  licenseStatus?: string;
  licenseExpiry?: string;
  onboardingStatus?: string;
}>();

// In-memory MeetingBot action/decision/motion/vote tracker per room
const meetingBotData = new Map<string, {
  actionItems: Array<{ text: string; owner?: string; addedAt: Date }>;
  decisions: Array<{ text: string; addedAt: Date }>;
  motions: Array<{ text: string; movedBy: string; secondedBy?: string; addedAt: Date }>;
  votes: Array<{ motionIndex: number; voter: string; vote: 'yes' | 'no' | 'abstain'; addedAt: Date }>;
  attendees: Array<{ name: string; joinedAt: Date }>;
  startedAt: Date;
  title: string;
  meetingType?: string; // e.g. 'llc_compliance', 'disciplinary', 'operational', 'general'
  workspaceId?: string;
}>();

// In-memory /incident structured 9-question flow map
// Key: conversationId
const incidentFlowMap = new Map<string, {
  step: number; // 0-8 (9 questions total)
  responses: string[];
  startedAt: Date;
  reporterName: string;
  shiftId?: string | null;
}>();

// Question sequence for /incident structured report
const INCIDENT_QUESTIONS = [
  'What time did the incident occur? (e.g., 22:35)',
  'Where exactly did the incident occur? (be specific — building, floor, area)',
  'Describe what happened in detail.',
  'Who was involved? (names, descriptions, or "unknown")',
  'Was any use of force required? If yes, describe.',
  'Were police or emergency services contacted? If yes, provide the agency and any case number.',
  'Were there any injuries? If yes, describe.',
  'What evidence was collected or preserved? (photos, video, witnesses)',
  'What is the current status? (situation resolved / ongoing / pending follow-up)',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function sendBotMessage(payload: BotMessagePayload): Promise<void> {
  try {
    await storage.createChatMessage({
      conversationId: payload.conversationId,
      senderId: payload.senderId,
      senderName: payload.senderName,
      senderType: 'bot',
      message: payload.content,
      messageType: 'text',
      isSystemMessage: false,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      metadata: payload.metadata,
    });

    // Broadcast via WebSocket — broadcast to workspace so all room participants receive it
    try {
      const { broadcastToWorkspace } = await import('../../websocket');
      broadcastToWorkspace(payload.workspaceId || '', {
        type: 'new_message',
        conversationId: payload.conversationId,
        message: {
          senderId: payload.senderId,
          senderName: payload.senderName,
          senderType: 'bot',
          message: payload.content,
          messageType: 'text',
          createdAt: new Date().toISOString(),
          metadata: payload.metadata,
        },
      });
    } catch {
      // WebSocket broadcast is best-effort
    }
  } catch (err) {
    log.error('[ShiftBotOrchestrator] Failed to send bot message:', err);
  }
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getShiftRoomContext(conversationId: string): Promise<ShiftRoomContext | null> {
  try {
    const [conv] = await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId))
      .limit(1);

    if (!conv || !conv.shiftId) return null;

    const [shift] = await db
      .select()
      .from(shifts)
      .where(eq(shifts.id, conv.shiftId))
      .limit(1);

    if (!shift) return null;

    // Get officer info
    let officerName = 'Officer';
    let officerUserId = '';
    if (shift.employeeId) {
      const [emp] = await db
        .select()
        .from(employees)
        .where(eq(employees.id, shift.employeeId))
        .limit(1);
      if (emp) {
        officerName = emp.lastName ? `${emp.firstName} ${emp.lastName}` : (emp.firstName || 'Officer');
        officerUserId = emp.userId || '';
      }
    }

    const siteName = (shift as any).siteName || (shift as any).jobSiteName || (shift as any).title || 'the site';

    return {
      conversationId,
      workspaceId: conv.workspaceId || shift.workspaceId || '',
      shiftId: shift.id,
      officerName,
      officerUserId,
      siteName,
      shiftStart: new Date(shift.startTime),
      shiftEnd: new Date(shift.endTime),
      siteLatitude: (shift as any).siteLatitude || null,
      siteLongitude: (shift as any).siteLongitude || null,
      siteRadius: (shift as any).siteRadius || 200,
    };
  } catch (err) {
    log.error('[ShiftBotOrchestrator] Error getting shift room context:', err);
    return null;
  }
}

async function sendManagerEscalation(
  workspaceId: string,
  officerName: string,
  siteName: string,
  messageExcerpt: string,
  conversationId: string
): Promise<void> {
  try {
    // Find managers/owners for this workspace
    const managers = await db
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, workspaceId),
          sql`${employees.role} IN ('manager', 'co_owner', 'org_owner', 'supervisor')`
        )
      );

    for (const mgr of managers) {
      if (mgr.userId) {
        await storage.createNotification({
          workspaceId,
          userId: mgr.userId,
          type: 'alert',
          scope: 'workspace',
          // @ts-expect-error — TS migration: fix in refactoring sprint
          category: 'safety',
          title: 'ReportBot — Possible Incident Reported',
          message: `Officer ${officerName} at ${siteName} reported: "${messageExcerpt.slice(0, 120)}". Please review immediately.`,
          relatedEntityType: 'conversation',
          relatedEntityId: conversationId,
          metadata: { escalatedBy: 'reportbot', siteName, officerName },
          createdBy: 'reportbot',
          idempotencyKey: `alert-${conversationId}-${mgr.userId}`
        });
      }
    }
  } catch (err) {
    log.error('[ShiftBotOrchestrator] Manager escalation failed:', err);
  }
}

// ─── Field Intelligence Context Builder ──────────────────────────────────────
// Equips bots with real-time operational intel about the shift, site, officer,
// active alerts, team coverage, and historical incident data so they can
// reason like a knowledgeable partner rather than a generic assistant.

interface ShiftFieldIntel {
  officer: {
    name: string;
    role: string;
    licenseStatus: string;
    licenseExpiry?: string;
    certifications: string[];
  };
  shift: {
    siteName: string;
    start: Date;
    end: Date;
    isOvernight: boolean;
    phase: string;
    hoursIntoShift: number;
    hoursRemaining: number;
    currentHour: number;
  };
  siteHistory: {
    recentIncidents: Array<{ type: string; severity: string; title: string; daysAgo: number }>;
    incidentCount30Days: number;
    highRiskSite: boolean;
  };
  activeAlerts: {
    bolos: Array<{ subjectName: string; reason: string; description?: string }>;
    activePanics: number;
  };
  teamOnDuty: Array<{ name: string; siteName: string; clockedIn: boolean }>;
  postOrders?: string;
  activity: {
    lastCheckInMinutesAgo: number;
    totalMessages: number;
    incidentsFiled: number;
  };
}

async function buildShiftFieldIntel(
  conversationId: string,
  workspaceId: string,
  officerUserId?: string
): Promise<ShiftFieldIntel | null> {
  try {
    const ctx = await getShiftRoomContext(conversationId);
    if (!ctx) return null;

    const now = new Date();

    // ── Shift phase analysis ───────────────────────────────────────────────
    const totalMinutes = (ctx.shiftEnd.getTime() - ctx.shiftStart.getTime()) / 60000;
    const elapsedMinutes = Math.max(0, (now.getTime() - ctx.shiftStart.getTime()) / 60000);
    const hoursInto = elapsedMinutes / 60;
    const hoursRemaining = Math.max(0, (ctx.shiftEnd.getTime() - now.getTime()) / 60000 / 60);
    const shiftFraction = totalMinutes > 0 ? elapsedMinutes / totalMinutes : 0;
    const currentHour = now.getHours();
    const isOvernight = currentHour >= 22 || currentHour < 6;
    let phase = 'mid';
    if (shiftFraction < 0.15) phase = 'early';
    else if (shiftFraction > 0.85) phase = 'end';
    else if (isOvernight && currentHour >= 0 && currentHour < 4) phase = 'overnight_deep';
    else if (isOvernight) phase = 'overnight';

    // ── Officer compliance data ────────────────────────────────────────────
    let licenseStatus = 'Unknown';
    let licenseExpiry: string | undefined;
    let officerRole = 'Officer';
    const certifications: string[] = [];
    try {
      const uid = officerUserId || ctx.officerUserId;
      if (uid) {
        const [emp] = await db.select().from(employees)
          .where(and(eq(employees.workspaceId, workspaceId), eq(employees.userId, uid)))
          .limit(1);
        if (emp) {
          const e = emp as any;
          officerRole = e.role || e.position || 'Officer';
          const expDate = e.licenseExpiry || e.licenseExpiryDate || e.guardCardExpiry || e.psbLicenseExpiry;
          if (expDate) {
            const expObj = new Date(expDate);
            const daysUntil = Math.ceil((expObj.getTime() - now.getTime()) / 86400000);
            licenseStatus = daysUntil < 0 ? 'EXPIRED' : daysUntil < 30 ? `Expires in ${daysUntil} days` : 'Active';
            licenseExpiry = expDate;
          } else {
            licenseStatus = 'No expiry on file';
          }
          if (e.certifications && Array.isArray(e.certifications)) certifications.push(...e.certifications.slice(0, 4));
          if (e.firstAidCertified) certifications.push('First Aid');
          if (e.cprCertified) certifications.push('CPR');
        }
      }
    } catch {
      // Best-effort
    }

    // ── Site incident history (last 30 days) ──────────────────────────────
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    let recentIncidents: Array<{ type: string; severity: string; title: string; daysAgo: number }> = [];
    let incidentCount30Days = 0;
    try {
      const siteIncidents = await db.select({
        incidentType: incidentReports.incidentType,
        severity: incidentReports.severity,
        title: incidentReports.title,
        occurredAt: incidentReports.occurredAt,
      })
        .from(incidentReports)
        .where(and(
          eq(incidentReports.workspaceId, workspaceId),
          gte(incidentReports.occurredAt, thirtyDaysAgo),
        ))
        .orderBy(desc(incidentReports.occurredAt))
        .limit(10);

      incidentCount30Days = siteIncidents.length;
      recentIncidents = siteIncidents.slice(0, 5).map(inc => ({
        type: inc.incidentType || 'General',
        severity: inc.severity || 'medium',
        title: inc.title || 'Incident',
        daysAgo: inc.occurredAt
          ? Math.floor((now.getTime() - new Date(inc.occurredAt).getTime()) / 86400000)
          : 0,
      }));
    } catch {
      // Best-effort
    }

    // ── Active BOLOs ──────────────────────────────────────────────────────
    let activeBOLOs: Array<{ subjectName: string; reason: string; description?: string }> = [];
    try {
      const bolos = await db.select({
        subjectName: boloAlerts.subjectName,
        reason: boloAlerts.reason,
        subjectDescription: boloAlerts.subjectDescription,
      })
        .from(boloAlerts)
        .where(and(
          eq(boloAlerts.workspaceId, workspaceId),
          eq(boloAlerts.isActive, true)
        ))
        .limit(5);
      activeBOLOs = bolos.map(b => ({
        subjectName: b.subjectName,
        reason: b.reason,
        description: b.subjectDescription || undefined,
      }));
    } catch {
      // Best-effort
    }

    // ── Active panic alerts ───────────────────────────────────────────────
    let activePanicsCount = 0;
    try {
      const panics = await db.select({ id: panicAlerts.id })
        .from(panicAlerts)
        .where(and(
          eq(panicAlerts.workspaceId, workspaceId),
          eq(panicAlerts.status, 'active')
        ))
        .limit(5);
      activePanicsCount = panics.length;
    } catch {
      // Best-effort
    }

    // ── Team on duty (same workspace, overlapping shift window) ───────────
    let teamOnDuty: Array<{ name: string; siteName: string; clockedIn: boolean }> = [];
    try {
      const windowStart = new Date(ctx.shiftStart.getTime() - 2 * 60 * 60 * 1000);
      const windowEnd = new Date(ctx.shiftEnd.getTime() + 2 * 60 * 60 * 1000);
      const overlappingShifts = await db.select({
        employeeId: shifts.employeeId,
        siteName: (shifts as any).siteName,
        title: shifts.title,
        shiftId: shifts.id,
      })
        .from(shifts)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.endTime, windowStart),
          lte(shifts.startTime, windowEnd),
          ne(shifts.id, ctx.shiftId),
        ))
        .limit(8);

      for (const s of overlappingShifts) {
        if (!s.employeeId) continue;
        try {
          const [emp] = await db.select({ firstName: employees.firstName, lastName: employees.lastName, userId: employees.userId })
            .from(employees).where(eq(employees.id, s.employeeId)).limit(1);
          if (!emp) continue;
          const empName = [emp.firstName, emp.lastName].filter(Boolean).join(' ') || 'Officer';
          const siteName = s.siteName || s.title || 'Site';
          // Check if clocked in
          const [entry] = await db.select({ id: timeEntries.id })
            .from(timeEntries)
            .where(and(eq(timeEntries.shiftId, s.shiftId), isNull(timeEntries.clockOut)))
            .limit(1);
          teamOnDuty.push({ name: empName, siteName, clockedIn: !!entry });
        } catch {
          // skip
        }
      }
    } catch {
      // Best-effort
    }

    // ── Post orders for this site ─────────────────────────────────────────
    let postOrdersText: string | undefined;
    try {
      const allPostOrders = await db.select()
        .from(postOrderTemplates)
        .where(eq(postOrderTemplates.workspaceId, workspaceId))
        .limit(5);

      if (allPostOrders.length > 0) {
        const relevant = allPostOrders.find(po =>
          // @ts-expect-error — TS migration: fix in refactoring sprint
          (po.name || '').toLowerCase().includes(ctx.siteName.toLowerCase()) ||
          // @ts-expect-error — TS migration: fix in refactoring sprint
          ctx.siteName.toLowerCase().includes((po.name || '').toLowerCase())
        ) || allPostOrders[0];
        const content = (relevant as any).content || (relevant as any).description || JSON.stringify(relevant);
        postOrdersText = `POST ORDERS (${(relevant as any).name || ctx.siteName}):\n${content.slice(0, 800)}`;
      }
    } catch {
      // Best-effort
    }

    // ── Activity score ────────────────────────────────────────────────────
    let lastCheckInMinutesAgo = 999;
    let totalMessages = 0;
    let incidentsFiled = 0;
    try {
      const [lastMsg] = await db.select({ createdAt: chatMessages.createdAt })
        .from(chatMessages)
        .where(and(
          eq(chatMessages.conversationId, conversationId),
          sql`${chatMessages.senderType} NOT IN ('bot', 'system')`
        ))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);

      if (lastMsg) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        lastCheckInMinutesAgo = Math.floor((now.getTime() - new Date(lastMsg.createdAt).getTime()) / 60000);
      }

      const [countResult] = await db.select({ count: sql<number>`count(*)` })
        .from(chatMessages)
        .where(and(
          eq(chatMessages.conversationId, conversationId),
          sql`${chatMessages.senderType} NOT IN ('bot', 'system')`
        ));
      totalMessages = Number(countResult?.count ?? 0);

      const [incResult] = await db.select({ count: sql<number>`count(*)` })
        .from(chatMessages)
        .where(and(
          eq(chatMessages.conversationId, conversationId),
          sql`${(chatMessages as any).metadata}->>'botEvent' = 'incident_ack'`
        ));
      incidentsFiled = Number(incResult?.count ?? 0);
    } catch {
      // Best-effort
    }

    return {
      officer: { name: ctx.officerName, role: officerRole, licenseStatus, licenseExpiry, certifications },
      shift: {
        siteName: ctx.siteName,
        start: ctx.shiftStart,
        end: ctx.shiftEnd,
        isOvernight,
        phase,
        hoursIntoShift: hoursInto,
        hoursRemaining,
        currentHour,
      },
      siteHistory: {
        recentIncidents,
        incidentCount30Days,
        highRiskSite: incidentCount30Days >= 3,
      },
      activeAlerts: { bolos: activeBOLOs, activePanics: activePanicsCount },
      teamOnDuty,
      postOrders: postOrdersText,
      activity: { lastCheckInMinutesAgo, totalMessages, incidentsFiled },
    };
  } catch (err) {
    log.warn('[ShiftFieldIntel] Failed to build intel context (non-blocking):', err);
    return null;
  }
}

// Compose a plain-text Intel summary string for AI prompts
function composeIntelSummary(intel: ShiftFieldIntel): string {
  const lines: string[] = [];

  // Shift status
  lines.push(`SHIFT CONTEXT:`);
  lines.push(`  Site: ${intel.shift.siteName}`);
  lines.push(`  Time: ${format(intel.shift.start, 'HH:mm')} to ${format(intel.shift.end, 'HH:mm')} — currently ${intel.shift.phase.replace('_', ' ')}`);
  lines.push(`  Hours in: ${intel.shift.hoursIntoShift.toFixed(1)} | Hours remaining: ${intel.shift.hoursRemaining.toFixed(1)}`);
  if (intel.shift.isOvernight) lines.push(`  OVERNIGHT SHIFT — high-fatigue awareness required`);

  // Officer
  lines.push(`\nOFFICER:`);
  lines.push(`  Name: ${intel.officer.name} | Role: ${intel.officer.role}`);
  lines.push(`  License: ${intel.officer.licenseStatus}${intel.officer.licenseExpiry ? ` (exp: ${intel.officer.licenseExpiry})` : ''}`);
  if (intel.officer.certifications.length > 0) lines.push(`  Certifications: ${intel.officer.certifications.join(', ')}`);

  // Active alerts — always prioritize
  if (intel.activeAlerts.bolos.length > 0) {
    lines.push(`\nACTIVE BOLOs — SHARE WITH OFFICER:`);
    intel.activeAlerts.bolos.forEach(b => {
      lines.push(`  - ${b.subjectName}: ${b.reason}${b.description ? ` | ${b.description.slice(0, 100)}` : ''}`);
    });
  }
  if (intel.activeAlerts.activePanics > 0) {
    lines.push(`\nWARNING: ${intel.activeAlerts.activePanics} ACTIVE PANIC ALERT(S) IN THIS WORKSPACE`);
  }

  // Site history
  if (intel.siteHistory.highRiskSite) {
    lines.push(`\nHIGH-RISK SITE: ${intel.siteHistory.incidentCount30Days} incidents in last 30 days — heightened vigilance required`);
  } else if (intel.siteHistory.incidentCount30Days > 0) {
    lines.push(`\nSITE HISTORY: ${intel.siteHistory.incidentCount30Days} incident(s) in past 30 days`);
  }
  if (intel.siteHistory.recentIncidents.length > 0) {
    lines.push(`  Recent incidents:`);
    intel.siteHistory.recentIncidents.slice(0, 3).forEach(inc => {
      lines.push(`    - ${inc.daysAgo === 0 ? 'Today' : `${inc.daysAgo}d ago`}: [${inc.severity}] ${inc.type} — ${inc.title}`);
    });
  }

  // Team on duty
  if (intel.teamOnDuty.length > 0) {
    lines.push(`\nTEAM ON DUTY (overlapping shifts):`);
    intel.teamOnDuty.forEach(m => {
      lines.push(`  - ${m.name} at ${m.siteName} — ${m.clockedIn ? 'clocked in' : 'not yet clocked in'}`);
    });
  } else {
    lines.push(`\nTEAM: No other officers scheduled during this window`);
  }

  // Activity
  if (intel.activity.lastCheckInMinutesAgo < 999) {
    lines.push(`\nACTIVITY: Last check-in ${intel.activity.lastCheckInMinutesAgo} min ago | ${intel.activity.totalMessages} total messages | ${intel.activity.incidentsFiled} incident(s) filed`);
  }

  if (intel.postOrders) lines.push(`\n${intel.postOrders}`);

  return lines.join('\n');
}

// ─── Incident language patterns ───────────────────────────────────────────────

const INCIDENT_PATTERNS = [
  /incident/i, /assault/i, /fight/i, /weapon/i, /gun/i, /knife/i,
  /trespass/i, /unauthorized/i, /suspicious/i, /broke\s+in/i, /break.?in/i,
  /fire/i, /smoke/i, /medical/i, /injured/i, /hurt/i, /ambulance/i, /police/i,
  /emergency/i, /theft/i, /stolen/i, /vandal/i, /damage/i, /accident/i,
  /unconscious/i, /overdose/i, /threats?/i, /confrontation/i,
];

function detectIncident(message: string): boolean {
  return INCIDENT_PATTERNS.some(p => p.test(message));
}

// ─── Core Orchestrator Class ──────────────────────────────────────────────────

class ShiftRoomBotOrchestrator {
  private static instance: ShiftRoomBotOrchestrator;

  static getInstance(): ShiftRoomBotOrchestrator {
    if (!ShiftRoomBotOrchestrator.instance) {
      ShiftRoomBotOrchestrator.instance = new ShiftRoomBotOrchestrator();
    }
    return ShiftRoomBotOrchestrator.instance;
  }

  // ── Auto-create shift room on assignment ─────────────────────────────────

  async createShiftRoomOnAssignment(params: {
    workspaceId: string;
    shiftId: string;
    shiftTitle: string;
    siteName: string;
    shiftStart: Date;
    shiftEnd: Date;
    officerUserId: string;
    officerEmployeeId: string;
    officerName: string;
    managerUserId?: string;
    createdBy?: string;
  }): Promise<{ conversationId: string; created: boolean }> {
    try {
      // Check if a shift room already exists for this shift
      const [existing] = await db
        .select()
        .from(chatConversations)
        .where(
          and(
            eq(chatConversations.workspaceId, params.workspaceId),
            eq(chatConversations.shiftId, params.shiftId),
            eq(chatConversations.conversationType, 'shift_chat')
          )
        )
        .limit(1);

      if (existing) {
        log.info(`[ShiftBotOrchestrator] Shift room already exists for shift ${params.shiftId}: ${existing.id}`);
        return { conversationId: existing.id, created: false };
      }

      // Build room name: Shift — Site Name — Date — Start to End
      const dateStr = format(params.shiftStart, 'MMMM d');
      const startStr = format(params.shiftStart, 'HH:mm');
      const endStr = format(params.shiftEnd, 'HH:mm');
      const roomName = `Shift — ${params.siteName} — ${dateStr} — ${startStr} to ${endStr}`;

      // Create the conversation
      const conversationId = randomUUID();
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await db.insert(chatConversations).values({
        id: conversationId,
        workspaceId: params.workspaceId,
        subject: roomName,
        conversationType: 'shift_chat',
        visibility: 'workspace',
        status: 'active',
        shiftId: params.shiftId,
        customerId: params.officerUserId,
        customerName: params.officerName,
        metadata: {
          siteName: params.siteName,
          shiftStart: params.shiftStart.toISOString(),
          shiftEnd: params.shiftEnd.toISOString(),
          officerEmployeeId: params.officerEmployeeId,
          roomStatus: 'pre_shift',
          activeBots: ['reportbot', 'helpai'],
          createdBy: params.createdBy || 'system',
        },
      });

      // Create org chat room wrapper
      const slug = `shift-${params.shiftId.slice(0, 8)}-${conversationId.slice(0, 8)}`;
      await db.insert(organizationChatRooms).values({
        workspaceId: params.workspaceId,
        roomName,
        roomSlug: slug,
        conversationId,
        status: 'active',
        createdBy: params.createdBy || 'system',
      });

      // Add officer as participant
      await db.insert(chatParticipants).values({
        conversationId,
        workspaceId: params.workspaceId,
        participantId: params.officerUserId,
        participantName: params.officerName,
        participantRole: 'member',
        canSendMessages: true,
        canViewHistory: true,
        canInviteOthers: false,
        joinedAt: new Date(),
        isActive: true,
      }).onConflictDoNothing();

      // Add manager as read participant if provided
      if (params.managerUserId) {
        await db.insert(chatParticipants).values({
          conversationId,
          workspaceId: params.workspaceId,
          participantId: params.managerUserId,
          participantName: 'Supervisor',
          participantRole: 'owner',
          canSendMessages: true,
          canViewHistory: true,
          canInviteOthers: true,
          joinedAt: new Date(),
          isActive: true,
        }).onConflictDoNothing();
      }

      // Deploy bots via botPool
      try {
        const { botPool } = await import('../../bots');
        await botPool.deployBot('reportbot', conversationId, params.workspaceId);
        await botPool.deployBot('helpai', conversationId, params.workspaceId);
        await botPool.deployBot('clockbot', conversationId, params.workspaceId);
      } catch (botErr: any) {
        log.warn('[ShiftBotOrchestrator] Bot deploy error (non-blocking):', botErr.message);
      }

      // Send ReportBot welcome message (with field intel briefing)
      await this.sendReportBotWelcome({
        conversationId,
        workspaceId: params.workspaceId,
        officerName: params.officerName,
        siteName: params.siteName,
        shiftStart: params.shiftStart,
        shiftEnd: params.shiftEnd,
      });

      // Notify officer of their shift room
      await storage.createNotification({
        workspaceId: params.workspaceId,
        userId: params.officerUserId,
        type: 'shift_assigned',
        scope: 'workspace',
        category: 'activity',
        title: 'Shift Room Ready',
        message: `Your shift room for ${params.siteName} on ${format(params.shiftStart, 'MMM d')} is now open. Tap to enter.`,
        relatedEntityType: 'conversation',
        relatedEntityId: conversationId,
        metadata: { shiftId: params.shiftId, siteName: params.siteName },
        createdBy: 'reportbot',
        idempotencyKey: `shift_assigned-${conversationId}-${params.officerUserId}`
      });

      log.info(`[ShiftBotOrchestrator] Created shift room ${conversationId} for shift ${params.shiftId}`);
      return { conversationId, created: true };
    } catch (err) {
      log.error('[ShiftBotOrchestrator] Failed to create shift room:', err);
      throw err;
    }
  }

  // ── ReportBot Welcome (with field intel briefing) ───────────────────────

  async sendReportBotWelcome(params: {
    conversationId: string;
    workspaceId: string;
    officerName: string;
    siteName: string;
    shiftStart: Date;
    shiftEnd?: Date;
  }): Promise<void> {
    const dateStr = format(params.shiftStart, 'MMMM d');
    const now = new Date();
    const currentHour = now.getHours();
    const isOvernightShift = params.shiftEnd
      ? (params.shiftEnd.getHours() < params.shiftStart.getHours() || params.shiftEnd.getDate() > params.shiftStart.getDate())
      : (currentHour >= 18 || currentHour < 6);

    // Build base welcome
    const lines: string[] = [
      `Welcome to your shift room for ${params.siteName} on ${dateStr}. I am ReportBot.`,
      '',
      `Use this room to post your hourly check-ins, site photos, and incident reports. I will organize everything into a shift report at the end of your shift.`,
      '',
    ];

    if (isOvernightShift) {
      lines.push(`This is an overnight shift. I will check in with you every hour — do not go silent for more than 90 minutes or your supervisor will be notified.`);
      lines.push('');
    }

    // Append active intel if available
    try {
      const [activeBOLOs, recentInc] = await Promise.all([
        db.select({ subjectName: boloAlerts.subjectName, reason: boloAlerts.reason })
          .from(boloAlerts)
          .where(and(eq(boloAlerts.workspaceId, params.workspaceId), eq(boloAlerts.isActive, true)))
          .limit(3),
        db.select({ count: sql<number>`count(*)` })
          .from(incidentReports)
          .where(and(
            eq(incidentReports.workspaceId, params.workspaceId),
            gte(incidentReports.occurredAt, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))
          )),
      ]);

      if (activeBOLOs.length > 0) {
        lines.push(`ACTIVE BOLOs — be on the lookout:`);
        activeBOLOs.forEach(b => lines.push(`  - ${b.subjectName}: ${b.reason}`));
        lines.push('');
      }

      const incCount = Number(recentInc[0]?.count ?? 0);
      if (incCount >= 3) {
        lines.push(`Site Alert: ${incCount} incidents logged at this workspace in the past 30 days. Stay alert.`);
        lines.push('');
      }
    } catch {
      // Best-effort intel — don't block welcome
    }

    lines.push(`Post a photo with your location to begin your shift documentation.`);
    lines.push('');
    lines.push(`HelpAI is also here — type @HelpAI followed by any question anytime.\nFor clock-in assistance, type @ClockBot.`);

    await sendBotMessage({
      conversationId: params.conversationId,
      workspaceId: params.workspaceId,
      senderId: 'reportbot',
      senderName: 'ReportBot',
      content: lines.join('\n'),
      metadata: { botEvent: 'welcome', shiftStart: params.shiftStart.toISOString(), isOvernightShift },
    });
  }

  // ── Handle incoming message in a shift room ──────────────────────────────

  async handleShiftRoomMessage(params: {
    conversationId: string;
    workspaceId: string;
    senderId: string;
    senderName: string;
    senderRole: string;
    message: string;
    messageType?: string;
    attachmentUrl?: string;
    attachmentType?: string;
    gpsLat?: number;
    gpsLng?: number;
    gpsAddress?: string;
    messageId?: string;
  }): Promise<void> {
    const isBot = ['reportbot', 'helpai', 'clockbot', 'meetingbot', 'system'].includes(params.senderId);
    if (isBot) return;

    const msg = params.message || '';
    const msgLower = msg.toLowerCase();

    // ── ClockBot summon detection ──────────────────────────────────────────
    if (/@clockbot/i.test(msg)) {
      await this.handleClockBotSummon(params);
      return;
    }

    // ── ClockBot state machine: reason capture → CONFIRM ──────────────────
    const pendingKey = `${params.senderId}-${params.conversationId}`;
    const pendingEntry = clockBotPending.get(pendingKey);
    if (pendingEntry && Date.now() <= pendingEntry.expiresAt) {
      if (pendingEntry.awaitingReason) {
        // Manager typed their reason — capture it, advance to CONFIRM state
        await this.captureClockBotReason(
          params.senderId,
          params.senderName,
          params.conversationId,
          params.workspaceId,
          msg
        );
        return;
      } else if (msg.trim().toUpperCase() === 'CONFIRM') {
        // Manager typed CONFIRM after providing reason
        await this.executeClockBotOverride(params.senderId, params.senderName, params.conversationId, params.workspaceId);
        return;
      } else if (msg.trim().toUpperCase() === 'CANCEL') {
        clockBotPending.delete(pendingKey);
        await sendBotMessage({
          conversationId: params.conversationId,
          workspaceId: params.workspaceId,
          senderId: 'clockbot',
          senderName: 'ClockBot',
          content: 'Supervised clock-in cancelled.',
          metadata: { botEvent: 'clockbot_cancelled' },
        });
        return;
      }
    }

    // ── @HelpAI detection ─────────────────────────────────────────────────
    if (/@helpai/i.test(msg)) {
      await this.handleHelpAIQuestion(params, msg);
      return;
    }

    // ── /incident structured 9-question flow continuation ─────────────────
    const activeIncidentFlow = incidentFlowMap.get(params.conversationId);
    if (activeIncidentFlow && !/^\//.test(msg.trim())) {
      await this.continueIncidentFlow(params.conversationId, params.workspaceId, params.senderId, params.senderName, msg, activeIncidentFlow);
      return;
    }

    // ── /incident command: start structured report ─────────────────────────
    if (/^\/incident\b/i.test(msg.trim())) {
      await this.startIncidentFlow(params.conversationId, params.workspaceId, params.senderId, params.senderName);
      return;
    }

    // ── /endshift command: explicit trigger ───────────────────────────────
    if (/^\/endshift\b/i.test(msg.trim())) {
      await this.handleEndShiftCommand(params.conversationId, params.workspaceId);
      return;
    }

    // ── "show me my DAR / what's in my report so far" ────────────────────
    if (/\b(dar|daily activity report|shift report|what.*(in|is).*my.*(dar|report)|(show|preview|see).*my.*(dar|report)|report so far)\b/i.test(msg)) {
      await this.handleDARQuery(params.conversationId, params.workspaceId, params.senderName);
      return;
    }

    // ── @MeetingBot action item / decision / motion / vote ───────────────
    if (/@meetingbot\s+action\s+item:/i.test(msg)) {
      const actionText = msg.replace(/@meetingbot\s+action\s+item:/i, '').trim();
      await this.trackMeetingBotItem('action', params.conversationId, actionText, params.senderName);
      return;
    }
    if (/@meetingbot\s+decision:/i.test(msg)) {
      const decisionText = msg.replace(/@meetingbot\s+decision:/i, '').trim();
      await this.trackMeetingBotItem('decision', params.conversationId, decisionText, params.senderName);
      return;
    }
    // /motion [text]
    if (/^\/motion\s+/i.test(msg.trim())) {
      const motionText = msg.replace(/^\/motion\s+/i, '').trim();
      await this.handleMotionRecord(params.conversationId, params.workspaceId, params.senderName, motionText);
      return;
    }
    // /vote [yes|no|abstain]
    if (/^\/vote\s+(yes|no|abstain)\b/i.test(msg.trim())) {
      const voteVal = msg.trim().split(/\s+/)[1].toLowerCase() as 'yes' | 'no' | 'abstain';
      await this.handleVoteRecord(params.conversationId, params.workspaceId, params.senderName, voteVal);
      return;
    }
    // /meeting attendee [name]
    if (/^\/meeting\s+attendee\s+/i.test(msg.trim())) {
      const attendeeName = msg.replace(/^\/meeting\s+attendee\s+/i, '').trim();
      await this.handleAttendeeRecord(params.conversationId, params.workspaceId, attendeeName);
      return;
    }
    // "when was our last compliance meeting"
    if (/last\s+(compliance|llc)\s+meeting/i.test(msg)) {
      await this.handleComplianceMeetingQuery(params.conversationId, params.workspaceId);
      return;
    }

    // ── Photo acknowledgment ──────────────────────────────────────────────
    if (params.messageType === 'image' || params.attachmentType?.startsWith('image/')) {
      await this.handlePhotoAcknowledgment(params);
      return;
    }

    // Skip non-shift_chat rooms for autonomous ReportBot behavior
    const [conv] = await db
      .select({ conversationType: chatConversations.conversationType, shiftId: chatConversations.shiftId })
      .from(chatConversations)
      .where(eq(chatConversations.id, params.conversationId))
      .limit(1);

    if (!conv || conv.conversationType !== 'shift_chat') return;

    // ── Incident detection (keyword fallback) ────────────────────────────
    if (detectIncident(msg)) {
      await this.handleIncidentMessage(params, msg, conv.shiftId);
      return;
    }

    // ── Routine check-in acknowledgment ───────────────────────────────────
    const timeStr = format(new Date(), 'HH:mm');
    await sendBotMessage({
      conversationId: params.conversationId,
      workspaceId: params.workspaceId,
      senderId: 'reportbot',
      senderName: 'ReportBot',
      content: `Check-in noted at ${timeStr}.`,
      metadata: { botEvent: 'checkin_ack', timestamp: new Date().toISOString() },
    });
  }

  // ── Photo handling ───────────────────────────────────────────────────────

  async handlePhotoAcknowledgment(params: {
    conversationId: string;
    workspaceId: string;
    senderName: string;
    attachmentUrl?: string;
    gpsLat?: number;
    gpsLng?: number;
    gpsAddress?: string;
  }): Promise<void> {
    const now = new Date();
    const timeStr = format(now, 'HH:mm');
    const ctx = await getShiftRoomContext(params.conversationId);

    // Count photos in this room for log entry number
    const photoCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.conversationId, params.conversationId),
          eq(chatMessages.senderType, 'employee')
        )
      )
      .then(r => Number(r[0]?.count ?? 0));

    const logNum = photoCount + 1;

    // ── GPS geofence check ───────────────────────────────────────────────────
    let gpsStatus: string;
    if (params.gpsLat && params.gpsLng) {
      if (ctx?.siteLatitude && ctx?.siteLongitude) {
        const dist = haversineDistance(
          params.gpsLat, params.gpsLng,
          ctx.siteLatitude, ctx.siteLongitude
        );
        const radius = ctx.siteRadius ?? 200;
        if (dist <= radius) {
          gpsStatus = `Location confirmed at ${ctx?.siteName || 'the site'}.`;
        } else {
          gpsStatus =
            `Location shows ${Math.round(dist)}m outside expected site boundary. ` +
            `Please confirm your current position.`;
        }
      } else {
        const addr = params.gpsAddress || `${params.gpsLat.toFixed(5)}, ${params.gpsLng.toFixed(5)}`;
        gpsStatus = `GPS position: ${addr}.`;
      }
    } else {
      gpsStatus = 'GPS data not available. Please confirm your current location in a message.';
    }

    // ── AI photo analysis (Trinity vision) ──────────────────────────────────
    // Fires asynchronously after initial GPS acknowledgment so officer sees response immediately
    const initialMsg = `Photo ${logNum} logged at ${timeStr}. ${gpsStatus} Analyzing...`;
    await sendBotMessage({
      conversationId: params.conversationId,
      workspaceId: params.workspaceId,
      senderId: 'reportbot',
      senderName: 'ReportBot',
      content: initialMsg,
      metadata: { botEvent: 'photo_ack', logNum, timestamp: now.toISOString() },
    });

    // Run AI vision analysis non-blocking
    (async () => {
      try {
        if (!params.workspaceId) return;
        const aiResp = await botAIService.analyzePhotoForReport(
          params.workspaceId,
          params.attachmentUrl || '',
          {
            siteName: ctx?.siteName || 'the site',
            officerName: params.senderName,
            timeOfDay: timeStr,
            shiftStart: ctx ? format(ctx.shiftStart, 'HH:mm') : 'unknown',
            shiftEnd: ctx ? format(ctx.shiftEnd, 'HH:mm') : 'unknown',
            photoNumber: logNum,
          }
        );
        if (aiResp.success && aiResp.text && aiResp.text.length > 10) {
          await sendBotMessage({
            conversationId: params.conversationId,
            workspaceId: params.workspaceId,
            senderId: 'reportbot',
            senderName: 'ReportBot',
            content: `ReportBot analysis: ${aiResp.text}`,
            metadata: { botEvent: 'photo_analysis', logNum, aiAnalyzed: true },
          });
        }
      } catch (err) {
        // AI analysis is best-effort
        log.warn('[ShiftBotOrchestrator] Photo AI analysis failed:', err);
      }
    })();
  }

  // ── Incident handling ────────────────────────────────────────────────────

  async handleIncidentMessage(params: {
    conversationId: string;
    workspaceId: string;
    senderName: string;
    senderId: string;
  }, message: string, shiftId?: string | null): Promise<void> {
    const timeStr = format(new Date(), 'HH:mm');
    const ctx = await getShiftRoomContext(params.conversationId);
    const siteName = ctx?.siteName || 'the site';

    // ── AI incident classification (Trinity intelligence) ────────────────────
    // Fires asynchronously — initial ack is immediate, AI assessment follows
    let incidentType: string | undefined;
    try {
      const aiDetect = await botAIService.detectIncident(
        params.workspaceId,
        message
      );
      incidentType = aiDetect.incidentType || undefined;
    } catch {
      // Non-blocking — fall back to regex detection already confirmed
    }

    // Build context-aware acknowledgment
    const incidentLabel = incidentType
      ? `${incidentType.replace('_', ' ')} incident`
      : 'incident';
    const ackMsg =
      `${incidentLabel.charAt(0).toUpperCase() + incidentLabel.slice(1)} logged at ${timeStr} at ${siteName}. This will be included in your shift report and has been flagged for supervisor review.\n\n` +
      `Please provide the following details in your next message:\n` +
      `• Exact description of what occurred\n` +
      `• Names or descriptions of persons involved\n` +
      `• Actions you have taken\n` +
      `• Whether police or emergency services were contacted\n` +
      `• Current status — situation resolved or ongoing`;

    await sendBotMessage({
      conversationId: params.conversationId,
      workspaceId: params.workspaceId,
      senderId: 'reportbot',
      senderName: 'ReportBot',
      content: ackMsg,
      metadata: { botEvent: 'incident_ack', incidentType, timestamp: new Date().toISOString() },
    });

    // Escalate to managers
    const excerpt = message.slice(0, 150);
    await sendManagerEscalation(
      params.workspaceId,
      params.senderName,
      siteName,
      excerpt,
      params.conversationId
    );

    // Escalation post in room
    await sendBotMessage({
      conversationId: params.conversationId,
      workspaceId: params.workspaceId,
      senderId: 'reportbot',
      senderName: 'ReportBot',
      content: `Escalation sent — your supervisor has been notified of this incident immediately.`,
      metadata: { botEvent: 'incident_escalated', timestamp: new Date().toISOString() },
    });
  }

  // ── @HelpAI questions in shift rooms ─────────────────────────────────────

  async handleHelpAIQuestion(params: {
    conversationId: string;
    workspaceId: string;
    senderName: string;
    senderId?: string;
  }, fullMessage: string): Promise<void> {
    const question = fullMessage.replace(/@helpai/i, '').trim();
    const ctx = await getShiftRoomContext(params.conversationId);
    const siteName = ctx?.siteName || 'your site';

    // ── MEDICAL EMERGENCY: auto-escalate within 10 seconds ───────────────────
    const MEDICAL_KEYWORDS = /\b(medical|medical emergency|heart attack|unconscious|not breathing|choking|seizure|overdose|unresponsive|CPR|911|ambulance|injured badly|serious injury|collapsed|stroke)\b/i;
    if (MEDICAL_KEYWORDS.test(question)) {
      (async () => {
        try {
          await sendManagerEscalation(
            params.workspaceId,
            params.senderName,
            siteName,
            `MEDICAL EMERGENCY: ${question.slice(0, 150)}`,
            params.conversationId
          );
        } catch (err: any) {
          log.error(`[ShiftRoomBot] Failed to send manager escalation for medical emergency in workspace ${params.workspaceId}: ${err?.message}`);
        }
      })();

      await sendBotMessage({
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        senderId: 'helpai',
        senderName: 'HelpAI',
        content:
          `MEDICAL EMERGENCY RESPONSE:\n\n` +
          `1. Call 911 immediately if not already done.\n` +
          `2. Stay on the line with the dispatcher — they will guide you.\n` +
          `3. Do not move the person unless they are in immediate danger.\n` +
          `4. If the person is unconscious and not breathing, begin CPR if trained: 30 chest compressions, 2 rescue breaths.\n` +
          `5. Keep the scene clear. Meet first responders at the building entrance.\n\n` +
          `Your supervisor has been notified automatically.\n\n` +
          `Site emergency contacts — check your post orders or contact your supervisor immediately.`,
        metadata: { botEvent: 'helpai_medical_emergency', escalated: true },
      });
      return;
    }

    // ── Load full field intelligence context ──────────────────────────────────
    const intel = await buildShiftFieldIntel(params.conversationId, params.workspaceId, params.senderId);
    const intelSummary = intel ? composeIntelSummary(intel) : '';

    // ── BOLO QUERY: surface immediately if officer asks ───────────────────────
    const BOLO_KEYWORDS = /\b(bolo|be on the lookout|wanted|suspect|alert|active alert|who (should|am) I watch|suspicious person|person of interest)\b/i;
    if (BOLO_KEYWORDS.test(question) && intel && intel.activeAlerts.bolos.length > 0) {
      const boloLines = intel.activeAlerts.bolos.map(b =>
        `• ${b.subjectName} — ${b.reason}${b.description ? `\n  Description: ${b.description}` : ''}`
      ).join('\n');
      await sendBotMessage({
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        senderId: 'helpai',
        senderName: 'HelpAI',
        content:
          `ACTIVE BOLOs FOR THIS WORKSPACE (${intel.activeAlerts.bolos.length}):\n\n${boloLines}\n\n` +
          `Stay alert and report any sightings immediately via the incident report system or contact your supervisor.`,
        metadata: { botEvent: 'helpai_bolo_response', boloCount: intel.activeAlerts.bolos.length },
      });
      return;
    }

    // ── TEAM QUERY: who else is on duty ──────────────────────────────────────
    const TEAM_KEYWORDS = /\b(who else|other officer|team|on duty|who is working|my team|coverage|who's on|who.s working)\b/i;
    if (TEAM_KEYWORDS.test(question) && intel) {
      let teamMsg: string;
      if (intel.teamOnDuty.length === 0) {
        teamMsg = `No other officers are scheduled during your shift window at this time. You are currently the only officer on duty.`;
      } else {
        const teamLines = intel.teamOnDuty.map(m =>
          `• ${m.name} at ${m.siteName} — ${m.clockedIn ? 'clocked in' : 'not yet clocked in'}`
        ).join('\n');
        teamMsg = `Officers on duty during your shift:\n\n${teamLines}\n\nFor emergency backup, contact your supervisor directly.`;
      }
      await sendBotMessage({
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        senderId: 'helpai',
        senderName: 'HelpAI',
        content: teamMsg,
        metadata: { botEvent: 'helpai_team_response' },
      });
      return;
    }

    // ── SITE HISTORY QUERY ────────────────────────────────────────────────────
    const HISTORY_KEYWORDS = /\b(incident history|what happened|past incidents|recent incidents|last (week|month|time)|history at|site history|previous|before)\b/i;
    if (HISTORY_KEYWORDS.test(question) && intel) {
      let histMsg: string;
      if (intel.siteHistory.incidentCount30Days === 0) {
        histMsg = `No incidents have been logged at this workspace in the past 30 days. Stay vigilant.`;
      } else {
        const incLines = intel.siteHistory.recentIncidents.map(inc =>
          `• ${inc.daysAgo === 0 ? 'Today' : `${inc.daysAgo} day(s) ago`}: [${inc.severity.toUpperCase()}] ${inc.type} — ${inc.title}`
        ).join('\n');
        histMsg =
          `Site incident history — last 30 days (${intel.siteHistory.incidentCount30Days} total):\n\n${incLines}\n\n` +
          (intel.siteHistory.highRiskSite
            ? `This is a high-activity site. Maintain heightened situational awareness.`
            : `Remain alert and follow your post orders.`);
      }
      await sendBotMessage({
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        senderId: 'helpai',
        senderName: 'HelpAI',
        content: histMsg,
        metadata: { botEvent: 'helpai_history_response' },
      });
      return;
    }

    // ── Build AI prompt with full field intelligence ───────────────────────────
    const prompt =
      `You are HelpAI — an AI field intelligence assistant embedded in a shift room for a security officer. ` +
      `You are NOT a generic assistant. You are fully equipped with real-time operational data and act as a ` +
      `knowledgeable partner who helps the officer make better decisions in the field.\n\n` +
      `${intelSummary}\n\n` +
      `The officer ${params.senderName} is asking: "${question}"\n\n` +
      `Rules:\n` +
      `- Use the provided Intel context to give specific, data-grounded answers.\n` +
      `- If there are active BOLOs, include them in your answer if they are relevant.\n` +
      `- Reference post orders if applicable.\n` +
      `- For overnight shifts, be alert to fatigue and isolation risks.\n` +
      `- NEVER share financial data, other officers' personal information, or cross-org data.\n` +
      `- If unsure, say so and recommend contacting the supervisor.\n` +
      `- Be concise, calm, and professional. This officer may be alone in the field.\n` +
      `- Never use markdown. Plain text only — this is a mobile chat interface.\n` +
      `- If asked to help draft an incident report, provide a structured template with the key fields.`;

    try {
      const aiResp = await botAIService.generate({
        botId: 'helpai',
        workspaceId: params.workspaceId,
        action: 'response',
        prompt,
        maxTokens: 600,
      });

      await sendBotMessage({
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        senderId: 'helpai',
        senderName: 'HelpAI',
        content: aiResp.success
          ? aiResp.text
          : `I am here to help, ${params.senderName}. For this question, please consult your post orders or contact your supervisor directly.`,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        metadata: { botEvent: 'helpai_response', question: question.slice(0, 100), hadPostOrders: !!postOrdersContext },
      });
    } catch (err) {
      log.error('[ShiftBotOrchestrator] HelpAI error:', err);
    }
  }

  // ── @ClockBot summon ─────────────────────────────────────────────────────

  async handleClockBotSummon(params: {
    conversationId: string;
    workspaceId: string;
    senderId: string;
    senderName: string;
    senderRole: string;
  }): Promise<void> {
    const authorizedRoles = ['manager', 'co_owner', 'org_owner', 'supervisor'];
    if (!authorizedRoles.includes(params.senderRole)) {
      await sendBotMessage({
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        senderId: 'clockbot',
        senderName: 'ClockBot',
        content: `ClockBot supervised clock-in is only available to managers, supervisors, and owners. Contact your manager if you need assistance clocking in.`,
        metadata: { botEvent: 'clockbot_unauthorized' },
      });
      return;
    }

    const ctx = await getShiftRoomContext(params.conversationId);
    if (!ctx) {
      await sendBotMessage({
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        senderId: 'clockbot',
        senderName: 'ClockBot',
        content: `Unable to find shift information for this room. ClockBot requires a shift-linked room.`,
        metadata: { botEvent: 'clockbot_no_shift' },
      });
      return;
    }

    // Check if officer is already clocked in
    const now = new Date();
    const [existing] = await db
      .select()
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.shiftId, ctx.shiftId),
          isNull(timeEntries.clockOut)
        )
      )
      .limit(1);

    if (existing) {
      await sendBotMessage({
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        senderId: 'clockbot',
        senderName: 'ClockBot',
        content: `${ctx.officerName} is already clocked in for this shift (since ${format(new Date(existing.clockIn), 'HH:mm')}). ClockBot cannot create a duplicate clock-in entry.`,
        metadata: { botEvent: 'clockbot_already_clocked_in' },
      });
      return;
    }

    // Check shift hasn't ended
    if (now > ctx.shiftEnd) {
      await sendBotMessage({
        conversationId: params.conversationId,
        workspaceId: params.workspaceId,
        senderId: 'clockbot',
        senderName: 'ClockBot',
        content: `This shift ended at ${format(ctx.shiftEnd, 'HH:mm')}. ClockBot cannot create a clock-in for a shift that has already ended.`,
        metadata: { botEvent: 'clockbot_shift_ended' },
      });
      return;
    }

    // ── Trinity validation: license and onboarding status ───────────────────
    let licenseStatus = 'Status unknown';
    let licenseExpiry = '';
    let onboardingStatus = 'Status unknown';
    try {
      if (ctx.officerUserId) {
        const [empDetail] = await db
          .select()
          .from(employees)
          .where(
            and(
              eq(employees.workspaceId, params.workspaceId),
              eq(employees.userId, ctx.officerUserId)
            )
          )
          .limit(1);

        if (empDetail) {
          // Check license expiry — try known field names
          const emp = empDetail as any;
          const expDate = emp.licenseExpiry || emp.licenseExpiryDate || emp.guardCardExpiry || emp.psbLicenseExpiry;
          if (expDate) {
            const expDateObj = new Date(expDate);
            const daysUntilExp = Math.ceil((expDateObj.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            if (daysUntilExp < 0) {
              licenseStatus = 'EXPIRED';
            } else if (daysUntilExp < 30) {
              licenseStatus = `Expires in ${daysUntilExp} days`;
            } else {
              licenseStatus = 'Active';
            }
            licenseExpiry = expDate;
          } else {
            licenseStatus = 'No expiry recorded';
          }

          // Check onboarding
          const os = emp.onboardingStatus || emp.onboarding_status;
          if (os) {
            onboardingStatus = os;
          } else {
            onboardingStatus = 'Not recorded';
          }
        }
      }
    } catch (validErr) {
      log.warn('[ShiftBotOrchestrator] ClockBot Trinity validation failed (non-blocking):', validErr);
    }

    // ── Check for double clock-in elsewhere (same workspace, different shift) ─
    let doubleClockWarning = '';
    try {
      const otherActiveEntry = await db
        .select({ shiftId: timeEntries.shiftId })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.workspaceId, params.workspaceId),
            eq(timeEntries.employeeId, ctx.officerUserId),
            isNull(timeEntries.clockOut),
            sql`${timeEntries.shiftId} != ${ctx.shiftId}`
          )
        )
        .limit(1);

      if (otherActiveEntry.length > 0) {
        doubleClockWarning = `\nWARNING: ${ctx.officerName} appears to already be clocked in on a different shift.`;
      }
    } catch {
      // Non-blocking
    }

    // Store pending with awaitingReason = true
    const pendingKey = `${params.senderId}-${params.conversationId}`;
    clockBotPending.set(pendingKey, {
      officerName: ctx.officerName,
      siteName: ctx.siteName,
      officerUserId: ctx.officerUserId,
      shiftId: ctx.shiftId,
      workspaceId: params.workspaceId,
      managerId: params.senderId,
      managerName: params.senderName,
      conversationId: params.conversationId,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes to complete 2-step flow
      awaitingReason: true,
      licenseStatus,
      licenseExpiry,
      onboardingStatus,
    });

    // Present Trinity context and ask for reason (not CONFIRM yet)
    const shiftWindow = `${format(ctx.shiftStart, 'HH:mm')} to ${format(ctx.shiftEnd, 'HH:mm')}`;
    const licenseDisplay = licenseExpiry ? `${licenseStatus} (exp: ${licenseExpiry})` : licenseStatus;
    const onboardingDisplay = onboardingStatus;

    await sendBotMessage({
      conversationId: params.conversationId,
      workspaceId: params.workspaceId,
      senderId: 'clockbot',
      senderName: 'ClockBot',
      content:
        `ClockBot — Supervised Clock-In Review\n\n` +
        `Officer: ${ctx.officerName}\n` +
        `Site: ${ctx.siteName}\n` +
        `Shift: ${shiftWindow}\n` +
        `License: ${licenseDisplay}\n` +
        `Onboarding: ${onboardingDisplay}` +
        `${doubleClockWarning}\n\n` +
        `This action requires a documented reason.\n\n` +
        `Please type the reason for this supervised clock-in (e.g. "GPS unavailable — officer confirmed present at gate"):`,
      metadata: {
        botEvent: 'clockbot_reason_prompt',
        licenseStatus,
        onboardingStatus,
      },
    });
  }

  // ── Capture ClockBot reason then advance to CONFIRM state ────────────────

  async captureClockBotReason(
    managerId: string,
    managerName: string,
    conversationId: string,
    workspaceId: string,
    reason: string
  ): Promise<void> {
    const pendingKey = `${managerId}-${conversationId}`;
    const pending = clockBotPending.get(pendingKey);

    if (!pending || Date.now() > pending.expiresAt) {
      clockBotPending.delete(pendingKey);
      await sendBotMessage({
        conversationId,
        workspaceId,
        senderId: 'clockbot',
        senderName: 'ClockBot',
        content: 'ClockBot session expired. Please summon @ClockBot again to start a new override.',
        metadata: { botEvent: 'clockbot_expired' },
      });
      return;
    }

    // Validate reason is meaningful (not just "ok" or a single word after a command word)
    if (reason.trim().length < 5) {
      await sendBotMessage({
        conversationId,
        workspaceId,
        senderId: 'clockbot',
        senderName: 'ClockBot',
        content: 'Reason too short. Please provide a complete reason for the supervised clock-in (e.g. "GPS unavailable — officer confirmed at main gate by phone").',
        metadata: { botEvent: 'clockbot_reason_too_short' },
      });
      return;
    }

    // Capture reason and advance to CONFIRM state
    pending.reason = reason;
    pending.awaitingReason = false;
    pending.expiresAt = Date.now() + 5 * 60 * 1000; // 5 more minutes to type CONFIRM
    clockBotPending.set(pendingKey, pending);

    await sendBotMessage({
      conversationId,
      workspaceId,
      senderId: 'clockbot',
      senderName: 'ClockBot',
      content:
        `Reason recorded: "${reason}"\n\n` +
        `This reason will be saved in the audit trail.\n\n` +
        `Type CONFIRM to create the supervised clock-in for ${pending.officerName}.\n` +
        `Type CANCEL to abort.`,
      metadata: { botEvent: 'clockbot_reason_captured', reason },
    });
  }

  // ── Execute ClockBot override ────────────────────────────────────────────

  async executeClockBotOverride(
    managerId: string,
    managerName: string,
    conversationId: string,
    workspaceId: string
  ): Promise<void> {
    const pendingKey = `${managerId}-${conversationId}`;
    const pending = clockBotPending.get(pendingKey);

    if (!pending || Date.now() > pending.expiresAt) {
      clockBotPending.delete(pendingKey);
      await sendBotMessage({
        conversationId,
        workspaceId,
        senderId: 'clockbot',
        senderName: 'ClockBot',
        content: `ClockBot confirmation expired. Please summon @ClockBot again to start a new override.`,
        metadata: { botEvent: 'clockbot_expired' },
      });
      return;
    }

    clockBotPending.delete(pendingKey);
    const now = new Date();

    try {
      // Create the time entry with supervisor override
      const entryId = randomUUID();
      const overrideReason = pending.reason || 'No reason provided';
      await db.insert(timeEntries).values({
        id: entryId,
        workspaceId: pending.workspaceId,
        shiftId: pending.shiftId,
        employeeId: pending.officerEmployeeId || pending.officerUserId,
        clockIn: now,
        status: 'active',
        gpsVerificationStatus: 'supervisor_confirmed',
        trinityAssistedClockin: true,
        trinityClockInReason: `Supervisor override by ${managerName} via ClockBot. Reason: ${overrideReason}`,
        manualEditedBy: managerId,
        manualEditedAt: now,
        manualEditReason: `ClockBot supervised clock-in. Authorized by ${managerName} at ${format(now, 'HH:mm')}. Reason: ${overrideReason}`,
        correctionData: {
          clockInMethod: 'supervisor_override',
          supervisorId: managerId,
          supervisorName: managerName,
          overrideTimestamp: now.toISOString(),
          reason: overrideReason,
          licenseStatus: pending.licenseStatus,
          onboardingStatus: pending.onboardingStatus,
          note: `Clock-in created by supervisor override via ClockBot. Authorized by ${managerName} at ${format(now, 'HH:mm')}. Reason: ${overrideReason}`,
        } as any,
        notes: `Supervisor override. Authorized by ${managerName}. Reason: ${overrideReason}`,
      });

      // Post confirmation in room
      await sendBotMessage({
        conversationId,
        workspaceId,
        senderId: 'clockbot',
        senderName: 'ClockBot',
        content:
          `ClockBot — Supervised clock-in recorded for ${pending.officerName} at ${format(now, 'HH:mm')}.\n` +
          `Method: supervisor override. Authorized by ${managerName}.\n` +
          `This event is logged in the audit trail.`,
        metadata: {
          botEvent: 'clockbot_override_confirmed',
          timeEntryId: entryId,
          authorizedBy: managerId,
        },
      });

      // Notify the officer
      if (pending.officerUserId) {
        await storage.createNotification({
          workspaceId: pending.workspaceId,
          userId: pending.officerUserId,
          type: 'shift_assigned',
          scope: 'workspace',
          category: 'activity',
          title: 'You have been clocked in',
          message: `Your manager has clocked you in for your shift at ${pending.siteName}. Clock-in time recorded as ${format(now, 'HH:mm')}. Contact your supervisor with any questions.`,
          relatedEntityType: 'time_entry',
          relatedEntityId: entryId,
          metadata: { clockInMethod: 'supervisor_override', authorizedBy: managerName },
          createdBy: 'clockbot',
          idempotencyKey: `shift_assigned-${entryId}-${pending.officerUserId}`
        });
      }

      // Audit trail
      try {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const { universalAuditService } = await import('../universalAuditService');
        await universalAuditService.log({
          workspaceId: pending.workspaceId,
          action: 'supervisor_clock_in_override',
          entityType: 'time_entry',
          entityId: entryId,
          actorId: managerId,
          actorName: managerName,
          metadata: {
            officerId: pending.officerUserId,
            officerName: pending.officerName,
            siteId: pending.shiftId,
            siteName: pending.siteName,
            clockInTime: now.toISOString(),
            clockInMethod: 'supervisor_override',
          },
        });
      } catch (auditErr) {
        log.warn('[ShiftBotOrchestrator] Audit trail failed (non-blocking):', auditErr);
      }

      // ── Force clock trend analysis ─────────────────────────────────────
      this.checkForceClockTrend(
        pending.workspaceId,
        pending.officerUserId,
        pending.officerName,
        managerId,
        managerName,
        conversationId
      ).catch(err => log.warn('[ShiftBotOrchestrator] Force clock trend check failed (non-blocking):', err));

      log.info(`[ShiftBotOrchestrator] ClockBot override executed: ${entryId} by ${managerName}`);
    } catch (err) {
      log.error('[ShiftBotOrchestrator] ClockBot override failed:', err);
      await sendBotMessage({
        conversationId,
        workspaceId,
        senderId: 'clockbot',
        senderName: 'ClockBot',
        content: `ClockBot encountered an error creating the clock-in entry. Please try again or create the entry manually in the time tracking module.`,
        metadata: { botEvent: 'clockbot_error' },
      });
    }
  }

  // ── MeetingBot action item / decision tracking ────────────────────────────

  async trackMeetingBotItem(
    type: 'action' | 'decision',
    conversationId: string,
    text: string,
    senderName: string
  ): Promise<void> {
    if (!meetingBotData.has(conversationId)) {
      meetingBotData.set(conversationId, {
        actionItems: [],
        decisions: [],
        motions: [],
        votes: [],
        attendees: [],
        startedAt: new Date(),
        title: 'Meeting',
      });
    }

    const data = meetingBotData.get(conversationId)!;
    const now = new Date();

    if (type === 'action') {
      data.actionItems.push({ text, owner: senderName, addedAt: now });
      const num = data.actionItems.length;
      await sendBotMessage({
        conversationId,
        workspaceId: '',
        senderId: 'meetingbot',
        senderName: 'MeetingBot',
        content: `Action item #${num} recorded: "${text}" — Owner: ${senderName}. This will be included in the meeting summary.`,
        metadata: { botEvent: 'action_item_added', num },
      });
    } else {
      data.decisions.push({ text, addedAt: now });
      const num = data.decisions.length;
      await sendBotMessage({
        conversationId,
        workspaceId: '',
        senderId: 'meetingbot',
        senderName: 'MeetingBot',
        content: `Decision #${num} recorded: "${text}". This will be included in the meeting summary.`,
        metadata: { botEvent: 'decision_added', num },
      });
    }
  }

  // ── Initialize meeting room ───────────────────────────────────────────────

  async initMeetingRoom(params: {
    conversationId: string;
    workspaceId: string;
    meetingTitle: string;
    meetingDate: Date;
    startTime: Date;
    meetingType?: string;
  }): Promise<void> {
    meetingBotData.set(params.conversationId, {
      actionItems: [],
      decisions: [],
      motions: [],
      votes: [],
      attendees: [],
      startedAt: params.startTime,
      title: params.meetingTitle,
      meetingType: params.meetingType,
      workspaceId: params.workspaceId,
    });

    const dateStr = format(params.meetingDate, 'MMMM d');
    const timeStr = format(params.startTime, 'h:mm a');
    const isLLC = params.meetingType === 'llc_compliance';

    await sendBotMessage({
      conversationId: params.conversationId,
      workspaceId: params.workspaceId,
      senderId: 'meetingbot',
      senderName: 'MeetingBot',
      content:
        `Meeting room is open for ${params.meetingTitle} on ${dateStr} at ${timeStr}${isLLC ? ' (LLC Compliance Meeting)' : ''}.\n` +
        `I will keep a full record of this meeting and generate certified minutes when the meeting ends.\n\n` +
        `Available commands:\n` +
        `  @MeetingBot action item: [text] — Add an action item\n` +
        `  @MeetingBot decision: [text] — Record a decision\n` +
        `  /motion [text] — Record a formal motion\n` +
        `  /vote [yes|no|abstain] — Vote on the last motion\n` +
        `  /meeting attendee [name] — Record an attendee\n` +
        `  /meetingend — End meeting and generate certified minutes`,
      metadata: { botEvent: 'meeting_start', meetingType: params.meetingType },
    });
  }

  // ── MeetingBot: motion recording ──────────────────────────────────────────

  async handleMotionRecord(
    conversationId: string,
    workspaceId: string,
    moverName: string,
    motionText: string
  ): Promise<void> {
    if (!meetingBotData.has(conversationId)) {
      await sendBotMessage({
        conversationId,
        workspaceId,
        senderId: 'meetingbot',
        senderName: 'MeetingBot',
        content: `No active meeting in this room. Start a meeting first with /meetingstart.`,
        metadata: { botEvent: 'motion_no_meeting' },
      });
      return;
    }
    const data = meetingBotData.get(conversationId)!;
    const now = new Date();
    data.motions.push({ text: motionText, movedBy: moverName, addedAt: now });
    const num = data.motions.length;
    await sendBotMessage({
      conversationId,
      workspaceId,
      senderId: 'meetingbot',
      senderName: 'MeetingBot',
      content:
        `Motion #${num} recorded: "${motionText}"\n` +
        `Moved by: ${moverName}\n\n` +
        `Is there a seconder? Use /vote [yes|no|abstain] to cast votes on this motion.`,
      metadata: { botEvent: 'motion_recorded', num, movedBy: moverName },
    });
  }

  // ── MeetingBot: vote recording ────────────────────────────────────────────

  async handleVoteRecord(
    conversationId: string,
    workspaceId: string,
    voterName: string,
    vote: 'yes' | 'no' | 'abstain'
  ): Promise<void> {
    if (!meetingBotData.has(conversationId)) {
      await sendBotMessage({
        conversationId,
        workspaceId,
        senderId: 'meetingbot',
        senderName: 'MeetingBot',
        content: `No active meeting in this room.`,
        metadata: { botEvent: 'vote_no_meeting' },
      });
      return;
    }
    const data = meetingBotData.get(conversationId)!;
    const motionIndex = data.motions.length - 1;
    if (motionIndex < 0) {
      await sendBotMessage({
        conversationId,
        workspaceId,
        senderId: 'meetingbot',
        senderName: 'MeetingBot',
        content: `No motion on the floor. Record a motion first with /motion [text].`,
        metadata: { botEvent: 'vote_no_motion' },
      });
      return;
    }
    data.votes.push({ motionIndex, voter: voterName, vote, addedAt: new Date() });

    // Calculate running tally for this motion
    const motionVotes = data.votes.filter(v => v.motionIndex === motionIndex);
    const yes = motionVotes.filter(v => v.vote === 'yes').length;
    const no = motionVotes.filter(v => v.vote === 'no').length;
    const abstain = motionVotes.filter(v => v.vote === 'abstain').length;

    const motion = data.motions[motionIndex];
    await sendBotMessage({
      conversationId,
      workspaceId,
      senderId: 'meetingbot',
      senderName: 'MeetingBot',
      content:
        `Vote recorded — ${voterName}: ${vote.toUpperCase()}\n` +
        `Motion: "${motion.text}"\n` +
        `Current tally: Yes: ${yes} | No: ${no} | Abstain: ${abstain}`,
      metadata: { botEvent: 'vote_recorded', motionIndex, vote, tally: { yes, no, abstain } },
    });
  }

  // ── MeetingBot: attendee recording ────────────────────────────────────────

  async handleAttendeeRecord(
    conversationId: string,
    workspaceId: string,
    attendeeName: string
  ): Promise<void> {
    if (!meetingBotData.has(conversationId)) {
      await sendBotMessage({
        conversationId,
        workspaceId,
        senderId: 'meetingbot',
        senderName: 'MeetingBot',
        content: `No active meeting in this room.`,
        metadata: { botEvent: 'attendee_no_meeting' },
      });
      return;
    }
    const data = meetingBotData.get(conversationId)!;
    const already = data.attendees.find(a => a.name.toLowerCase() === attendeeName.toLowerCase());
    if (already) {
      await sendBotMessage({
        conversationId,
        workspaceId,
        senderId: 'meetingbot',
        senderName: 'MeetingBot',
        content: `${attendeeName} is already recorded as an attendee.`,
        metadata: { botEvent: 'attendee_duplicate' },
      });
      return;
    }
    data.attendees.push({ name: attendeeName, joinedAt: new Date() });
    await sendBotMessage({
      conversationId,
      workspaceId,
      senderId: 'meetingbot',
      senderName: 'MeetingBot',
      content: `${attendeeName} added to the attendee list (${data.attendees.length} total).`,
      metadata: { botEvent: 'attendee_added', total: data.attendees.length },
    });
  }

  // ── MeetingBot: LLC compliance date query ─────────────────────────────────

  async handleComplianceMeetingQuery(conversationId: string, workspaceId: string): Promise<void> {
    try {
      // Look for the most recent meeting minutes PDF with type 'llc_compliance' in document safe
      const [lastMeeting] = await db
        .select({ createdAt: employeeDocuments.createdAt, name: employeeDocuments.documentName })
        .from(employeeDocuments)
        .where(
          and(
            eq(employeeDocuments.workspaceId, workspaceId),
            // @ts-expect-error — TS migration: fix in refactoring sprint
            ilike(employeeDocuments.category, '%compliance%')
          )
        )
        .orderBy(desc(employeeDocuments.createdAt))
        .limit(1);

      if (!lastMeeting) {
        await sendBotMessage({
          conversationId,
          workspaceId,
          senderId: 'meetingbot',
          senderName: 'MeetingBot',
          content: `No LLC compliance meeting on record in the document safe. Schedule one as soon as possible — annual compliance meetings are required to maintain LLC standing.`,
          metadata: { botEvent: 'compliance_query_none' },
        });
        return;
      }

      // @ts-expect-error — TS migration: fix in refactoring sprint
      const meetingDate = new Date(lastMeeting.createdAt);
      const daysAgo = Math.floor((Date.now() - meetingDate.getTime()) / (1000 * 60 * 60 * 24));
      const overdue = daysAgo > 365;

      await sendBotMessage({
        conversationId,
        workspaceId,
        senderId: 'meetingbot',
        senderName: 'MeetingBot',
        content:
          `Last LLC compliance meeting: ${format(meetingDate, 'MMMM d, yyyy')} (${daysAgo} days ago).\n` +
          (overdue
            ? `This meeting is overdue — more than 365 days have passed. Schedule a compliance meeting immediately to maintain LLC standing.`
            : `Next compliance meeting due by ${format(new Date(meetingDate.getTime() + 365 * 24 * 60 * 60 * 1000), 'MMMM d, yyyy')}.`),
        metadata: { botEvent: 'compliance_query_result', daysAgo, overdue },
      });
    } catch (err) {
      log.warn('[ShiftBotOrchestrator] Compliance query failed:', err);
      await sendBotMessage({
        conversationId,
        workspaceId,
        senderId: 'meetingbot',
        senderName: 'MeetingBot',
        content: `Unable to retrieve compliance meeting records at this time.`,
        metadata: { botEvent: 'compliance_query_error' },
      });
    }
  }

  // ── ReportBot: /endshift explicit command ─────────────────────────────────

  async handleEndShiftCommand(conversationId: string, workspaceId: string): Promise<void> {
    await sendBotMessage({
      conversationId,
      workspaceId,
      senderId: 'reportbot',
      senderName: 'ReportBot',
      content: `End-of-shift command received. Compiling your daily activity report now — this may take a moment.`,
      metadata: { botEvent: 'endshift_manual_trigger' },
    });

    // Mark room so automatic cron doesn't re-fire
    try {
      await db.update(chatConversations)
        // @ts-expect-error — TS migration: fix in refactoring sprint
        .set({ metadata: sql`COALESCE(metadata, '{}'::jsonb) || '{"endOfShiftFired":true}'::jsonb` })
        .where(eq(chatConversations.id, conversationId));
    } catch {
      // Best-effort metadata update
    }

    (async () => {
      try {
        const { reportBotPdfService } = await import('./reportBotPdfService');
        await reportBotPdfService.generateAndSaveShiftReport(conversationId, workspaceId);
      } catch (err) {
        log.error('[ShiftBotOrchestrator] Manual endshift PDF failed:', err);
        await sendBotMessage({
          conversationId,
          workspaceId,
          senderId: 'reportbot',
          senderName: 'ReportBot',
          content: `Report generation encountered an error. Please contact your supervisor to pull the shift log manually.`,
          metadata: { botEvent: 'endshift_error' },
        });
      }
    })();
  }

  // ── ReportBot: "DAR so far" query ─────────────────────────────────────────

  async handleDARQuery(conversationId: string, workspaceId: string, senderName: string): Promise<void> {
    try {
      const messages = await db
        .select({
          message: chatMessages.message,
          senderType: chatMessages.senderType,
          metadata: (chatMessages as any).metadata,
          createdAt: chatMessages.createdAt,
        })
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, conversationId))
        .orderBy(chatMessages.createdAt);

      const officerMessages = messages.filter(m =>
        m.senderType !== 'bot' && m.senderType !== 'system'
      );
      const photoCount = messages.filter(m => {
        const meta = m.metadata as any;
        return meta?.botEvent === 'photo_ack' || meta?.botEvent === 'photo_logged';
      }).length;
      const incidentCount = messages.filter(m => {
        const meta = m.metadata as any;
        return meta?.botEvent === 'incident_ack' || meta?.botEvent === 'incident_report_complete';
      }).length;
      const checkInCount = messages.filter(m => {
        const meta = m.metadata as any;
        return meta?.botEvent === 'checkin_ack';
      }).length;

      await sendBotMessage({
        conversationId,
        workspaceId,
        senderId: 'reportbot',
        senderName: 'ReportBot',
        content:
          `DAR status for this shift:\n` +
          `  Messages logged: ${officerMessages.length}\n` +
          `  Check-ins acknowledged: ${checkInCount}\n` +
          `  Photos submitted: ${photoCount}\n` +
          `  Incidents filed: ${incidentCount}\n\n` +
          `Use /endshift when ready to compile the full report.`,
        metadata: { botEvent: 'dar_query_result' },
      });
    } catch (err) {
      log.warn('[ShiftBotOrchestrator] DAR query failed:', err);
      await sendBotMessage({
        conversationId,
        workspaceId,
        senderId: 'reportbot',
        senderName: 'ReportBot',
        content: `Unable to pull shift data at this time.`,
        metadata: { botEvent: 'dar_query_error' },
      });
    }
  }

  // ── ReportBot: /incident 9-question flow ──────────────────────────────────

  async startIncidentFlow(
    conversationId: string,
    workspaceId: string,
    senderId: string,
    senderName: string
  ): Promise<void> {
    // If there's already an active flow for this person, abandon old one
    incidentFlowMap.set(conversationId, {
      step: 0,
      responses: [],
      startedAt: new Date(),
      reporterName: senderName,
      shiftId: null,
    });

    // Try to get shiftId from room context
    try {
      const ctx = await getShiftRoomContext(conversationId);
      if (ctx) {
        const flow = incidentFlowMap.get(conversationId)!;
        flow.shiftId = ctx.shiftId;
      }
    } catch {
      // Non-blocking
    }

    await sendBotMessage({
      conversationId,
      workspaceId,
      senderId: 'reportbot',
      senderName: 'ReportBot',
      content:
        `Incident report initiated. I will ask you ${INCIDENT_QUESTIONS.length} questions to compile a complete, timestamped incident report. Type /cancel at any time to abort.\n\n` +
        `Question 1 of ${INCIDENT_QUESTIONS.length}: ${INCIDENT_QUESTIONS[0]}`,
      metadata: { botEvent: 'incident_flow_start' },
    });
  }

  async continueIncidentFlow(
    conversationId: string,
    workspaceId: string,
    senderId: string,
    senderName: string,
    answer: string,
    flow: { step: number; responses: string[]; startedAt: Date; reporterName: string; shiftId?: string | null }
  ): Promise<void> {
    if (answer.trim().toLowerCase() === '/cancel') {
      incidentFlowMap.delete(conversationId);
      await sendBotMessage({
        conversationId,
        workspaceId,
        senderId: 'reportbot',
        senderName: 'ReportBot',
        content: `Incident report cancelled. No report was filed.`,
        metadata: { botEvent: 'incident_flow_cancelled' },
      });
      return;
    }

    flow.responses.push(answer.trim());
    const nextStep = flow.step + 1;

    if (nextStep < INCIDENT_QUESTIONS.length) {
      flow.step = nextStep;
      await sendBotMessage({
        conversationId,
        workspaceId,
        senderId: 'reportbot',
        senderName: 'ReportBot',
        content: `Question ${nextStep + 1} of ${INCIDENT_QUESTIONS.length}: ${INCIDENT_QUESTIONS[nextStep]}`,
        metadata: { botEvent: 'incident_flow_question', step: nextStep },
      });
    } else {
      // All 9 questions answered — compile and file the report
      incidentFlowMap.delete(conversationId);
      await this.compileAndFileIncidentReport(conversationId, workspaceId, senderName, flow.responses, flow.shiftId);
    }
  }

  async compileAndFileIncidentReport(
    conversationId: string,
    workspaceId: string,
    reporterName: string,
    responses: string[],
    shiftId?: string | null
  ): Promise<void> {
    const labels = [
      'Time of incident',
      'Location',
      'Description',
      'Persons involved',
      'Use of force',
      'Police contact',
      'Injuries',
      'Evidence collected',
      'Current status',
    ];

    const reportLines = labels.map((label, i) => `${label}: ${responses[i] || 'Not provided'}`).join('\n');
    const reportText =
      `INCIDENT REPORT\n` +
      `Filed by: ${reporterName}\n` +
      `Filed at: ${format(new Date(), 'MMM d, yyyy HH:mm')}\n\n` +
      reportLines;

    // Save as incidentReport record if we have shiftId
    try {
      if (shiftId) {
        const { incidentReports } = await import('@shared/schema');
        const { randomUUID } = await import('crypto');
        await db.insert(incidentReports).values({
          id: randomUUID(),
          workspaceId,
          shiftId,
          title: `Incident Report — ${reporterName} — ${format(new Date(), 'MMM d yyyy HH:mm')}`,
          description: reportLines,
          incidentType: 'general',
          severity: 'medium',
          status: 'open',
          reportedBy: reporterName,
          occurredAt: new Date(),
        } as any);
      }
    } catch (saveErr) {
      log.warn('[ShiftBotOrchestrator] Incident report DB save failed:', saveErr);
    }

    // Post completed report in room
    await sendBotMessage({
      conversationId,
      workspaceId,
      senderId: 'reportbot',
      senderName: 'ReportBot',
      content:
        `Incident report complete. Your responses have been compiled and logged.\n\n${reportText}\n\n` +
        `This report has been saved and will be included in your shift DAR. Your supervisor has been notified.`,
      metadata: { botEvent: 'incident_report_complete', reportText },
    });

    // Notify supervisor
    await sendManagerEscalation(workspaceId, reporterName, 'the site', responses[2] || 'See incident report', conversationId);
  }

  // ── ClockBot: force clock trend analysis ──────────────────────────────────

  async checkForceClockTrend(
    workspaceId: string,
    officerUserId: string,
    officerName: string,
    managerId: string,
    managerName: string,
    conversationId: string
  ): Promise<void> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Count officer's force clocks in 7 days and 30 days
    const [count7] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(timeEntries)
      .where(and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.employeeId, officerUserId),
        eq(timeEntries.trinityAssistedClockin, true),
        sql`${timeEntries.gpsVerificationStatus} = 'supervisor_confirmed'`,
        gte(timeEntries.clockIn, sevenDaysAgo)
      ));

    const [count30] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(timeEntries)
      .where(and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.employeeId, officerUserId),
        eq(timeEntries.trinityAssistedClockin, true),
        sql`${timeEntries.gpsVerificationStatus} = 'supervisor_confirmed'`,
        gte(timeEntries.clockIn, thirtyDaysAgo)
      ));

    const c7 = Number(count7?.count ?? 0);
    const c30 = Number(count30?.count ?? 0);

    // Count manager's total approvals in 7 days (abuse detection)
    const [mgrCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(timeEntries)
      .where(and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.manualEditedBy, managerId),
        eq(timeEntries.trinityAssistedClockin, true),
        gte(timeEntries.clockIn, sevenDaysAgo)
      ));
    const mgrC7 = Number(mgrCount?.count ?? 0);

    // Get org owners/admins to notify
    const owners = await db
      .select({ userId: platformRoles.userId })
      .from(platformRoles)
      .where(and(
        // @ts-expect-error — TS migration: fix in refactoring sprint
        eq(platformRoles.workspaceId, workspaceId),
        sql`${platformRoles.role} IN ('org_owner', 'co_owner')`
      ))
      .limit(5);

    const notifyOwners = async (title: string, message: string, severity: 'warning' | 'critical') => {
      for (const owner of owners) {
        await storage.createNotification({
          workspaceId,
          userId: owner.userId,
          type: 'compliance_alert' as any,
          scope: 'workspace',
          // @ts-expect-error — TS migration: fix in refactoring sprint
          category: 'alert',
          title,
          message,
          priority: severity === 'critical' ? 'critical' : 'high',
          relatedEntityType: 'time_entry',
          metadata: { officerUserId, officerName, count7: c7, count30: c30, managerId, managerName },
          createdBy: 'clockbot',
          idempotencyKey: `compliance_alert-${Date.now()}-${owner.userId}`
        });
      }
    };

    // Red flag: 5+ force clocks in 30 days
    if (c30 >= 5) {
      await notifyOwners(
        `Red Flag: ${officerName} — Repeated Force Clock-Ins`,
        `${officerName} has required ${c30} supervisor-authorized clock-ins in the past 30 days. This may indicate a recurring attendance, GPS, or equipment issue. Review recommended.`,
        'critical'
      );
      await sendBotMessage({
        conversationId,
        workspaceId,
        senderId: 'clockbot',
        senderName: 'ClockBot',
        content:
          `Red flag: ${officerName} has now required ${c30} force clock-ins in the past 30 days. Org leadership has been notified. A formal review of this pattern is recommended.`,
        metadata: { botEvent: 'force_clock_red_flag', count30: c30 },
      });
    } else if (c7 >= 3) {
      // Amber flag: 3+ in 7 days
      await notifyOwners(
        `Amber Flag: ${officerName} — Repeated Force Clock-Ins`,
        `${officerName} has required ${c7} supervisor-authorized clock-ins in the past 7 days. Monitor for ongoing pattern.`,
        'warning'
      );
      await sendBotMessage({
        conversationId,
        workspaceId,
        senderId: 'clockbot',
        senderName: 'ClockBot',
        content:
          `Amber flag: ${officerName} has needed ${c7} force clock-ins in the past 7 days. Org leadership has been notified to monitor this pattern.`,
        metadata: { botEvent: 'force_clock_amber_flag', count7: c7 },
      });
    }

    // Manager abuse check: 10+ approvals in 7 days
    if (mgrC7 >= 10) {
      await notifyOwners(
        `Manager Audit Alert: ${managerName} — Excessive Force Clock Approvals`,
        `${managerName} has approved ${mgrC7} force clock-ins in the past 7 days. This volume is unusual and warrants a review to confirm each approval was legitimate.`,
        'critical'
      );
    }
  }

  // ── Hourly check-in cron (context-aware, overnight-sensitive) ────────────

  async runHourlyCheckInCron(workspaceId?: string): Promise<void> {
    try {
      const fiftyFiveMinAgo = subMinutes(new Date(), 55);
      const now = new Date();
      const currentHour = now.getHours();
      const isOvernightHours = currentHour >= 22 || currentHour < 6;

      const conditions: any[] = [
        eq(chatConversations.conversationType, 'shift_chat'),
        eq(chatConversations.status, 'active'),
      ];
      if (workspaceId) conditions.push(eq(chatConversations.workspaceId, workspaceId));

      const activeRooms = await db.select().from(chatConversations).where(and(...conditions));

      for (const room of activeRooms) {
        try {
          if (!room.shiftId) continue;

          const [shift] = await db.select().from(shifts).where(eq(shifts.id, room.shiftId)).limit(1);
          if (!shift) continue;

          const shiftStart = new Date(shift.startTime);
          const shiftEnd = new Date(shift.endTime);
          if (now < shiftStart || now > shiftEnd) continue;

          // 30-min end-of-shift warning
          const minsToEnd = (shiftEnd.getTime() - now.getTime()) / 60000;
          if (minsToEnd <= 30 && minsToEnd > 25) {
            await sendBotMessage({
              conversationId: room.id,
              workspaceId: room.workspaceId || '',
              senderId: 'reportbot',
              senderName: 'ReportBot',
              content:
                `Shift ends in 30 minutes. Post your final site status and any outstanding observations before handover.`,
              metadata: { botEvent: 'shift_warning_30min' },
            });
            continue;
          }

          // Check last officer activity
          const [lastMsg] = await db
            .select({ createdAt: chatMessages.createdAt })
            .from(chatMessages)
            .where(and(
              eq(chatMessages.conversationId, room.id),
              sql`${chatMessages.senderType} NOT IN ('bot', 'system')`
            ))
            .orderBy(desc(chatMessages.createdAt))
            .limit(1);

          // @ts-expect-error — TS migration: fix in refactoring sprint
          const lastActivity = lastMsg ? new Date(lastMsg.createdAt) : new Date(0);
          const minutesSilent = (now.getTime() - lastActivity.getTime()) / 60000;

          if (lastActivity >= fiftyFiveMinAgo) continue; // Officer is active — no nudge needed

          // ── Build context-aware check-in message ──────────────────────────
          let checkInMsg: string;

          // Check for active BOLOs to include in reminder
          let boloLine = '';
          try {
            const activeBolos = await db.select({
              subjectName: boloAlerts.subjectName,
              reason: boloAlerts.reason,
            })
              .from(boloAlerts)
              .where(and(eq(boloAlerts.workspaceId, room.workspaceId || ''), eq(boloAlerts.isActive, true)))
              .limit(2);
            if (activeBolos.length > 0) {
              boloLine = `\n\nActive BOLO reminder: ${activeBolos.map(b => `${b.subjectName} (${b.reason})`).join(' | ')}`;
            }
          } catch {
            // Best-effort
          }

          if (isOvernightHours) {
            const timeStr = format(now, 'h:mm a');
            const depthLabels: Record<number, string> = { 0: '12:00 AM', 1: '1 AM', 2: '2 AM', 3: '3 AM', 4: '4 AM', 5: '5 AM' };
            const hourLabel = depthLabels[currentHour] || format(now, 'h a');

            if (currentHour >= 2 && currentHour < 5) {
              // Deep overnight — this is the hardest window
              checkInMsg =
                `It is ${timeStr} — the deepest part of the overnight. Stay alert, move around if you can, and post your check-in.\n\n` +
                `Scan your sector, check all access points, and note anything unusual. I am here if you need me.` +
                boloLine;
            } else if (currentHour >= 22 || currentHour < 2) {
              checkInMsg =
                `Overnight check-in — ${timeStr}. Post your current status and location update.` +
                boloLine;
            } else {
              checkInMsg =
                `Pre-dawn check-in — ${timeStr}. You are in the final stretch of the overnight. Stay sharp and post your update.` +
                boloLine;
            }
          } else {
            checkInMsg =
              `Hourly check-in — post a photo or update from your current position.` +
              boloLine;
          }

          await sendBotMessage({
            conversationId: room.id,
            workspaceId: room.workspaceId || '',
            senderId: 'reportbot',
            senderName: 'ReportBot',
            content: checkInMsg,
            metadata: { botEvent: 'hourly_checkin_reminder', isOvernight: isOvernightHours, minutesSilent: Math.round(minutesSilent) },
          });

          // ── Welfare escalation for overnight silence > 90 minutes ─────────
          if (isOvernightHours && minutesSilent >= 90) {
            const ctx = await getShiftRoomContext(room.id);
            if (ctx) {
              await sendManagerEscalation(
                room.workspaceId || '',
                ctx.officerName,
                ctx.siteName,
                `WELFARE CHECK: Officer has not checked in for ${Math.round(minutesSilent)} minutes during overnight shift. Immediate contact recommended.`,
                room.id
              );
              await sendBotMessage({
                conversationId: room.id,
                workspaceId: room.workspaceId || '',
                senderId: 'reportbot',
                senderName: 'ReportBot',
                content:
                  `WELFARE CHECK — You have been silent for over ${Math.round(minutesSilent / 60 * 10) / 10} hours. ` +
                  `Your supervisor has been notified. Please respond immediately to confirm you are safe.`,
                metadata: { botEvent: 'overnight_welfare_escalation', minutesSilent: Math.round(minutesSilent) },
              });
            }
          }
        } catch (err) {
          log.error(`[ShiftBotOrchestrator] Error processing room ${room.id} in cron:`, err);
        }
      }
    } catch (err) {
      log.error('[ShiftBotOrchestrator] Hourly check-in cron failed:', err);
    }
  }

  // ── ClockBot: 12-hour clock-out warning ──────────────────────────────────
  // Fires every hour. If an officer has been clocked in for 12+ hours with no
  // clock-out, ClockBot posts in their shift room asking if the shift is over.

  async runTwelveHourClockOutCheck(workspaceId?: string): Promise<void> {
    try {
      const now = new Date();
      const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

      // Find time entries open for 12+ hours
      const conditions: any[] = [
        isNull(timeEntries.clockOut),
        lte(timeEntries.clockIn, twelveHoursAgo),
      ];
      if (workspaceId) conditions.push(eq(timeEntries.workspaceId, workspaceId));

      const longEntries = await db
        .select({
          id: timeEntries.id,
          workspaceId: timeEntries.workspaceId,
          employeeId: timeEntries.employeeId,
          shiftId: timeEntries.shiftId,
          clockIn: timeEntries.clockIn,
        })
        .from(timeEntries)
        .where(and(...conditions))
        .limit(50);

      for (const entry of longEntries) {
        if (!entry.shiftId) continue;
        const hoursIn = Math.floor((now.getTime() - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60));

        // Find their shift room
        const [room] = await db
          .select({ id: chatConversations.id, metadata: (chatConversations as any).metadata })
          .from(chatConversations)
          .where(and(
            eq(chatConversations.shiftId, entry.shiftId),
            eq(chatConversations.conversationType, 'shift_chat'),
            eq(chatConversations.status, 'active'),
          ))
          .limit(1);

        if (!room) continue;

        // Don't spam — check if we already sent a 12h warning this hour
        const meta = (room as any).metadata || {};
        const warningKey = `clockout12h_${format(now, 'yyyy-MM-dd-HH')}`;
        if (meta[warningKey]) continue;

        // Mark as sent
        await db.update(chatConversations)
          // @ts-expect-error — TS migration: fix in refactoring sprint
          .set({ metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ [warningKey]: true })}::jsonb` })
          .where(eq(chatConversations.id, room.id));

        await sendBotMessage({
          conversationId: room.id,
          workspaceId: entry.workspaceId,
          senderId: 'clockbot',
          senderName: 'ClockBot',
          content:
            `You have been clocked in for ${hoursIn} hours without a clock-out recorded.\n\n` +
            `If your shift has ended, please clock out in the Time Tracking module or contact your supervisor to clock you out. ` +
            `If you are still on duty, no action is needed — this is just a check-in.`,
          metadata: { botEvent: 'clockout_12h_warning', hoursIn, timeEntryId: entry.id },
        });
      }
    } catch (err) {
      log.error('[ShiftBotOrchestrator] 12h clock-out check failed:', err);
    }
  }

  // ── Proactive overnight intelligence brief ───────────────────────────────
  // Sends a situational awareness update to active overnight shift rooms.
  // Called by autonomousScheduler at peak overnight hours (midnight, 2 AM, 4 AM).

  async runOvernightIntelBrief(workspaceId?: string): Promise<void> {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      // Only runs during overnight hours
      if (currentHour < 22 && currentHour >= 6) return;

      const conditions: any[] = [
        eq(chatConversations.conversationType, 'shift_chat'),
        eq(chatConversations.status, 'active'),
      ];
      if (workspaceId) conditions.push(eq(chatConversations.workspaceId, workspaceId));

      const activeRooms = await db.select().from(chatConversations).where(and(...conditions));

      for (const room of activeRooms) {
        try {
          if (!room.shiftId) continue;

          const [shift] = await db.select().from(shifts).where(eq(shifts.id, room.shiftId)).limit(1);
          if (!shift) continue;

          const shiftStart = new Date(shift.startTime);
          const shiftEnd = new Date(shift.endTime);
          if (now < shiftStart || now > shiftEnd) continue;

          // Only send once per overnight window (check metadata flag)
          const meta = (room as any).metadata || {};
          const briefKey = `overnightBrief_${format(now, 'yyyy-MM-dd-HH')}`;
          if (meta[briefKey]) continue;

          // Mark as sent
          await db.update(chatConversations)
            // @ts-expect-error — TS migration: fix in refactoring sprint
            .set({ metadata: sql`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ [briefKey]: true })}::jsonb` })
            .where(eq(chatConversations.id, room.id));

          // Build intel brief
          const intel = await buildShiftFieldIntel(room.id, room.workspaceId || '');
          if (!intel) continue;

          const lines: string[] = [
            `Overnight Intel Brief — ${format(now, 'h:mm a')}`,
            '',
          ];

          if (intel.activeAlerts.bolos.length > 0) {
            lines.push(`Active BOLOs (${intel.activeAlerts.bolos.length}):`);
            intel.activeAlerts.bolos.forEach(b => lines.push(`  - ${b.subjectName}: ${b.reason}`));
            lines.push('');
          }

          if (intel.activeAlerts.activePanics > 0) {
            lines.push(`WARNING: ${intel.activeAlerts.activePanics} active panic alert(s) in your workspace.`);
            lines.push('');
          }

          if (intel.siteHistory.highRiskSite) {
            lines.push(`Site Alert: ${intel.siteHistory.incidentCount30Days} incidents at this workspace in the past 30 days. Stay vigilant.`);
            lines.push('');
          }

          if (intel.teamOnDuty.length > 0) {
            const onDuty = intel.teamOnDuty.filter(m => m.clockedIn);
            if (onDuty.length > 0) {
              lines.push(`Team on duty: ${onDuty.map(m => `${m.name} (${m.siteName})`).join(', ')}`);
            } else {
              lines.push(`No other officers currently clocked in. You are the sole officer on duty.`);
            }
            lines.push('');
          }

          lines.push(`Type @HelpAI followed by any question for field assistance. I am here all night.`);

          await sendBotMessage({
            conversationId: room.id,
            workspaceId: room.workspaceId || '',
            senderId: 'helpai',
            senderName: 'HelpAI',
            content: lines.join('\n'),
            metadata: { botEvent: 'overnight_intel_brief', hour: currentHour },
          });
        } catch (err) {
          log.error(`[ShiftBotOrchestrator] Overnight brief error for room ${room.id}:`, err);
        }
      }
    } catch (err) {
      log.error('[ShiftBotOrchestrator] Overnight intel brief cron failed:', err);
    }
  }

  // ── End-of-shift trigger ─────────────────────────────────────────────────

  async runEndOfShiftCron(workspaceId?: string): Promise<void> {
    try {
      const now = new Date();
      const fiveMinAgo = subMinutes(now, 5);
      const fiveMinFuture = addMinutes(now, 5);

      const conditions: any[] = [
        eq(chatConversations.conversationType, 'shift_chat'),
        eq(chatConversations.status, 'active'),
      ];
      if (workspaceId) conditions.push(eq(chatConversations.workspaceId, workspaceId));

      const activeRooms = await db
        .select()
        .from(chatConversations)
        .where(and(...conditions));

      for (const room of activeRooms) {
        if (!room.shiftId) continue;
        const [shift] = await db.select().from(shifts).where(eq(shifts.id, room.shiftId)).limit(1);
        if (!shift) continue;

        const shiftEnd = new Date(shift.endTime);
        // Trigger end-of-shift message when shift end is within the 5-minute window
        if (shiftEnd >= fiveMinAgo && shiftEnd <= fiveMinFuture) {
          const meta = (room as any).metadata || {};
          if (meta.endOfShiftFired) continue;

          await sendBotMessage({
            conversationId: room.id,
            workspaceId: room.workspaceId || '',
            senderId: 'reportbot',
            senderName: 'ReportBot',
            content: `Shift ended. Compiling your shift report now. This may take a moment.`,
            metadata: { botEvent: 'shift_ended' },
          });

          // Mark so we don't re-fire
          await db.update(chatConversations)
            // @ts-expect-error — TS migration: fix in refactoring sprint
            .set({ metadata: sql`COALESCE(metadata, '{}'::jsonb) || '{"endOfShiftFired":true}'::jsonb` })
            .where(eq(chatConversations.id, room.id));

          // Fire report generation asynchronously
          (async () => {
            try {
              const { reportBotPdfService } = await import('./reportBotPdfService');
              await reportBotPdfService.generateAndSaveShiftReport(room.id, room.workspaceId || '');
            } catch (pdfErr) {
              log.error('[ShiftBotOrchestrator] End-of-shift PDF generation failed:', pdfErr);
            }
          })();
        }
      }
    } catch (err) {
      log.error('[ShiftBotOrchestrator] End-of-shift cron failed:', err);
    }
  }

  // ── Clean expired ClockBot confirmations ─────────────────────────────────

  cleanExpiredPending(): void {
    const now = Date.now();
    for (const [key, val] of clockBotPending.entries()) {
      if (now > val.expiresAt) {
        clockBotPending.delete(key);
      }
    }
  }

  // ── Get meeting bot data for summary ─────────────────────────────────────

  getMeetingBotData(conversationId: string) {
    return meetingBotData.get(conversationId) || null;
  }

  clearMeetingBotData(conversationId: string): void {
    meetingBotData.delete(conversationId);
  }
}

export const shiftRoomBotOrchestrator = ShiftRoomBotOrchestrator.getInstance();
log.info('[ShiftRoomBotOrchestrator] Initialized');
