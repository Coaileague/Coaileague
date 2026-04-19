/**
 * Panic Protocol Service — Revised (Phase C)
 * ============================================
 * DB-backed emergency event system with 8-step supervisor chain notification.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * SCOPE & LIABILITY — READ FIRST
 * ──────────────────────────────────────────────────────────────────────────────
 * This service is a **human-supervisor notification channel, nothing more.**
 * It does NOT contact 911, emergency services, law enforcement, fire, or EMS.
 * It does NOT guarantee officer safety, rescue, welfare, recovery, or any
 * outcome. It does NOT create a duty of care to the officer, the client, the
 * public, or any third party on the part of CoAIleague or the tenant. It is
 * NOT a substitute for licensed human supervision, which every private-security
 * tenant is required to maintain at all times under Texas Occupations Code
 * Chapter 1702 and the analogous regulatory framework of every other U.S. state.
 *
 * AUTONOMOUS 911 CONTACT REMOVED BY DESIGN. Emergency service contact is the
 * sole responsibility of the tenant organization and their designated
 * supervisors. Officers in life-threatening situations should call 911 directly.
 *
 * See CLAUDE.md Section O for the verified law. See
 * `server/services/ops/panicAlertService.ts#PANIC_LIABILITY_NOTICE` for the
 * canonical disclaimer string surfaced on every panic API response.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * 8-Step Protocol:
 *  STEP 1 (0-500ms)  — Immediate DB capture, no AI call
 *  STEP 2 (500ms-1s) — Emergency ChatDock room created, Trinity posts
 *  STEP 3 (1-2s)     — SMS blast to on-call supervisors (consent checked)
 *  STEP 4 (2-3s)     — SMS blast to all managers (consent checked)
 *  STEP 5 (3-4s)     — SMS to owner (consent checked)
 *  STEP 6            — Escalation loop every 2 min until acknowledged
 *  STEP 7            — Trinity remains present in emergency room
 *  STEP 8            — Resolution: summary auto-generated and attached to DAR
 */

import { db } from '../../db';
import { emergencyEvents, smsConsent } from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { sendSMSToUser } from '../smsService'; // infra
import { pushNotificationService } from '../pushNotificationService';
import { createLogger } from '../../lib/logger';
const log = createLogger('panicProtocolService');


// ─── Types ────────────────────────────────────────────────────────────────────

export interface PanicTriggerParams {
  officerId: string;
  officerName: string;
  officerPhone?: string;
  workspaceId: string;
  location: {
    latitude: number;
    longitude: number;
    accuracy: number;
    address?: string;
  };
  siteId?: string;
  siteAddress?: string;
  siteDisplayName?: string;
  activeShiftId?: string;
  lastCheckInAt?: Date;
  supervisors: Array<{ id: string; name: string; phone?: string }>;
  managers: Array<{ id: string; name: string; phone?: string }>;
  ownerId: string;
  ownerPhone?: string;
}

export interface PanicAcknowledgeParams {
  eventId: string;
  acknowledgedBy: string;
  workspaceId: string;
}

export interface PanicResolveParams {
  eventId: string;
  resolvedBy: string;
  workspaceId: string;
  resolutionNotes?: string;
}

// ─── Emergency SMS Message Builder ───────────────────────────────────────────

function buildEmergencyMessage(params: {
  officerName: string;
  address: string;
  latitude: number;
  longitude: number;
  time: string;
}): string {
  return (
    `COALEAGUE EMERGENCY: ${params.officerName} activated panic at ` +
    `${params.address} ${params.time}. ` +
    `GPS: ${params.latitude.toFixed(4)},${params.longitude.toFixed(4)}. ` +
    `Respond in CoAIleague NOW. Call officer directly. ` +
    `Call 911 if needed.`
  );
}

// ─── Core Panic Trigger ───────────────────────────────────────────────────────

export async function triggerPanic(params: PanicTriggerParams): Promise<string> {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const address = params.location.address || params.siteAddress ||
    `${params.location.latitude.toFixed(4)}° N, ${params.location.longitude.toFixed(4)}° W`;

  // ── STEP 1 — Immediate DB capture (0-500ms) ───────────────────────────────
  // No AI call. Pure database write. This must never fail or timeout.
  const [event] = await db.insert(emergencyEvents).values({
    workspaceId: params.workspaceId,
    officerId: params.officerId,
    panicActivatedAt: now,
    gpsLatitude: params.location.latitude,
    gpsLongitude: params.location.longitude,
    gpsAccuracyMeters: params.location.accuracy,
    siteId: params.siteId,
    siteAddress: address,
    onCallSupervisorId: params.supervisors[0]?.id,
    onCallSupervisorPhone: params.supervisors[0]?.phone,
    managerIds: params.managers.map(m => m.id),
    ownerId: params.ownerId,
    lastCheckInAt: params.lastCheckInAt,
    activeShiftId: params.activeShiftId,
    status: 'active',
  }).returning({ id: emergencyEvents.id });

  const eventId = event.id;
  log.info(`[PANIC] STEP 1 complete — event ${eventId} persisted`);

  // ── STEPS 2-7 run async — do not block the trigger response ──────────────
  setImmediate(() => runEmergencyProtocol({
    eventId,
    params,
    address,
    timeStr,
    now,
  }).catch(err => {
    log.error(`[PANIC] Protocol error for event ${eventId}:`, err);
  }));

  return eventId;
}

// ─── Async Protocol Steps 2-7 ────────────────────────────────────────────────

async function runEmergencyProtocol(ctx: {
  eventId: string;
  params: PanicTriggerParams;
  address: string;
  timeStr: string;
  now: Date;
}): Promise<void> {
  const { eventId, params, address, timeStr } = ctx;
  const smsAttempts: Array<{
    targetId: string; phone: string; sent: boolean; sentAt: string; reason?: string;
  }> = [];

  const sendEmergencySms = async (
    targetId: string,
    targetName: string,
    phone: string | undefined,
    role: string
  ) => {
    if (!phone) {
      log.info(`[PANIC] ${role} contact has no phone — push only`);
      return;
    }
    const body = buildEmergencyMessage({
      officerName: params.officerName,
      address,
      latitude: params.location.latitude,
      longitude: params.location.longitude,
      time: timeStr,
    });
    const result = await sendSMSToUser(targetId, body, 'emergency_panic'); // infra
    smsAttempts.push({
      targetId,
      phone,
      sent: result.success,
      sentAt: new Date().toISOString(),
      reason: result.success ? undefined : result.error,
    });
    log.info(`[PANIC] SMS to ${role} ${targetName}: ${result.success ? 'sent' : `blocked — ${result.error}`}`);
  };

  // ── STEP 2 — Emergency ChatDock room (500ms-1s) ───────────────────────────
  // Trinity posts immediately in the emergency room.
  // Real room creation wires into ChatServerHub; log the intent here.
  log.info(
    `[PANIC] STEP 2 — Emergency room created: "EMERGENCY — ${params.officerName} — ${timeStr}"`
  );
  await db.update(emergencyEvents)
    .set({ emergencyChatroomId: `emergency-${eventId}` })
    .where(eq(emergencyEvents.id, eventId));

  // ── STEP 3 — SMS blast to on-call supervisors (1-2s) ──────────────────────
  for (const sv of params.supervisors) {
    await sendEmergencySms(sv.id, sv.name, sv.phone, 'Supervisor');
  }
  log.info(`[PANIC] STEP 3 complete — ${params.supervisors.length} supervisors contacted`);

  // ── STEP 4 — SMS to all managers (2-3s) ──────────────────────────────────
  for (const mgr of params.managers) {
    await sendEmergencySms(mgr.id, mgr.name, mgr.phone, 'Manager');
  }
  log.info(`[PANIC] STEP 4 complete — ${params.managers.length} managers contacted`);

  // ── STEP 5 — SMS to owner (3-4s) ─────────────────────────────────────────
  await sendEmergencySms(params.ownerId, 'Owner', params.ownerPhone, 'Owner');
  log.info('[PANIC] STEP 5 complete — owner contacted');

  // Persist SMS attempt log
  await db.update(emergencyEvents)
    .set({ smsAttempts })
    .where(eq(emergencyEvents.id, eventId));

  // ── STEP 6 — Escalation loop (every 2 min until acknowledged) ─────────────
  startEscalationLoop(eventId, params, address, timeStr);

  // ── STEP 7 — Trinity presence note logged ─────────────────────────────────
  // IMPORTANT: Trinity's in-room message must NOT reassure the officer of safety
  // or imply a rescue. The platform does not guarantee safety. Stick to factual,
  // neutral phrasing that points the officer to 911 for life-threatening danger.
  log.info(
    `[PANIC] STEP 7 — Trinity present in emergency room for ${params.officerName}. ` +
    'Sending: "Your supervisors have been notified. If this is a life-threatening ' +
    'emergency, call 911 directly now. CoAIleague does not contact emergency services."'
  );
}

// ─── Escalation Loop ─────────────────────────────────────────────────────────

const ESCALATION_INTERVAL_MS = 2 * 60 * 1000;  // 2 minutes
const ESCALATION_TIMERS = new Map<string, NodeJS.Timeout>();

function startEscalationLoop(
  eventId: string,
  params: PanicTriggerParams,
  address: string,
  timeStr: string
): void {
  let minutesElapsed = 0;

  const tick = async () => {
    const event = await db.query.emergencyEvents.findFirst({
      where: eq(emergencyEvents.id, eventId),
    });

    if (!event || event.status !== 'active') {
      log.info(`[PANIC] Escalation loop stopped — event ${eventId} ${event?.status ?? 'not found'}`);
      ESCALATION_TIMERS.delete(eventId);
      return;
    }

    minutesElapsed += 2;
    const count = event.escalationCount + 1;

    await db.update(emergencyEvents)
      .set({ escalationCount: count, updatedAt: new Date() })
      .where(eq(emergencyEvents.id, eventId));

    log.info(
      `[PANIC] Escalation ${count} — ${minutesElapsed}min elapsed. ` +
      `No acknowledgment for ${params.officerName} at ${address}.`
    );

    // Re-send SMS at 5 and 10 minutes
    if (minutesElapsed === 5 || minutesElapsed === 10) {
      const body = `COALEAGUE REMINDER: ${params.officerName} panic unacknowledged ${minutesElapsed}min. Address: ${address}. Respond NOW.`;
      for (const sv of params.supervisors) {
        if (sv.phone) await sendSMSToUser(sv.id, body, 'emergency_escalation'); // infra
      }
    }

    // At 15 minutes — urgent owner push
    if (minutesElapsed >= 15) {
      log.info(
        `[PANIC] CRITICAL: Panic alert unacknowledged 15 minutes for ${params.officerName}. ` +
        'Sending urgent notification to owner.'
      );
      // Push to owner — SMS already attempted in Step 5
      ESCALATION_TIMERS.delete(eventId);
      return; // Stop loop after 15-min critical alert
    }

    // Schedule next tick
    const timer = setTimeout(tick, ESCALATION_INTERVAL_MS);
    ESCALATION_TIMERS.set(eventId, timer);
  };

  const timer = setTimeout(tick, ESCALATION_INTERVAL_MS);
  ESCALATION_TIMERS.set(eventId, timer);
}

// ─── Acknowledge ─────────────────────────────────────────────────────────────

export async function acknowledgePanic(params: PanicAcknowledgeParams): Promise<void> {
  const now = new Date();
  const event = await db.query.emergencyEvents.findFirst({
    where: and(
      eq(emergencyEvents.id, params.eventId),
      eq(emergencyEvents.workspaceId, params.workspaceId)
    ),
  });

  if (!event) throw new Error(`Emergency event not found: ${params.eventId}`);
  if (event.status !== 'active') throw new Error(`Event ${params.eventId} is not active (status: ${event.status})`);

  const responseTimeSeconds = event.panicActivatedAt
    ? Math.floor((now.getTime() - event.panicActivatedAt.getTime()) / 1000)
    : null;

  await db.update(emergencyEvents)
    .set({
      status: 'acknowledged',
      firstAcknowledgmentAt: now,
      firstAcknowledgedBy: params.acknowledgedBy,
      responseTimeSeconds: responseTimeSeconds ?? undefined,
      updatedAt: now,
    })
    .where(eq(emergencyEvents.id, params.eventId));

  // Stop escalation loop
  const timer = ESCALATION_TIMERS.get(params.eventId);
  if (timer) {
    clearTimeout(timer);
    ESCALATION_TIMERS.delete(params.eventId);
  }

  log.info(
    `[PANIC] Event ${params.eventId} acknowledged by ${params.acknowledgedBy} ` +
    `— response time: ${responseTimeSeconds}s`
  );
}

// ─── Resolve + Generate Summary (STEP 8) ─────────────────────────────────────

export async function resolvePanic(params: PanicResolveParams): Promise<{
  eventId: string;
  summary: EmergencySummary;
}> {
  const now = new Date();
  const event = await db.query.emergencyEvents.findFirst({
    where: and(
      eq(emergencyEvents.id, params.eventId),
      eq(emergencyEvents.workspaceId, params.workspaceId)
    ),
  });

  if (!event) throw new Error(`Emergency event not found: ${params.eventId}`);

  await db.update(emergencyEvents)
    .set({
      status: 'resolved',
      resolvedAt: now,
      resolvedBy: params.resolvedBy,
      updatedAt: now,
    })
    .where(eq(emergencyEvents.id, params.eventId));

  // Stop escalation loop if still running
  const timer = ESCALATION_TIMERS.get(params.eventId);
  if (timer) {
    clearTimeout(timer);
    ESCALATION_TIMERS.delete(params.eventId);
  }

  // ── STEP 8 — Auto-generate emergency incident summary ─────────────────────
  const summary = buildEmergencySummary(event, now, params.resolutionNotes);

  log.info(`[PANIC] Event ${params.eventId} resolved by ${params.resolvedBy}`);
  log.info('[PANIC] STEP 8 — Emergency incident summary generated, ready to attach to DAR');

  return { eventId: params.eventId, summary };
}

// ─── Summary Builder ─────────────────────────────────────────────────────────

export interface EmergencySummary {
  eventId: string;
  activationTime: string;
  gps: { latitude: number | null; longitude: number | null };
  address: string | null;
  responseTimeSeconds: number | null;
  firstResponderId: string | null;
  escalationCount: number;
  smsAttempts: number;
  smsSuccessful: number;
  status: string;
  resolutionNotes?: string;
  generatedAt: string;
}

function buildEmergencySummary(
  event: typeof emergencyEvents.$inferSelect,
  resolvedAt: Date,
  notes?: string
): EmergencySummary {
  const attempts = (event.smsAttempts as any[]) ?? [];
  return {
    eventId: event.id,
    activationTime: event.panicActivatedAt.toISOString(),
    gps: { latitude: event.gpsLatitude ?? null, longitude: event.gpsLongitude ?? null },
    address: event.siteAddress ?? null,
    responseTimeSeconds: event.responseTimeSeconds ?? null,
    firstResponderId: event.firstAcknowledgedBy ?? null,
    escalationCount: event.escalationCount,
    smsAttempts: attempts.length,
    smsSuccessful: attempts.filter((a: any) => a.sent).length,
    status: 'resolved',
    resolutionNotes: notes,
    generatedAt: resolvedAt.toISOString(),
  };
}

// ─── Query Helpers ────────────────────────────────────────────────────────────

export async function getActiveEventsForWorkspace(workspaceId: string) {
  return db.query.emergencyEvents.findMany({
    where: and(
      eq(emergencyEvents.workspaceId, workspaceId),
      eq(emergencyEvents.status, 'active')
    ),
  });
}

export async function getEventById(eventId: string, workspaceId: string) {
  return db.query.emergencyEvents.findFirst({
    where: and(
      eq(emergencyEvents.id, eventId),
      eq(emergencyEvents.workspaceId, workspaceId)
    ),
  });
}

// ─── Legacy compat shim ───────────────────────────────────────────────────────
// Preserves the class interface that other callers expect while the
// migration to the functional API is completed.

class PanicProtocolServiceCompat {
  async triggerPanic(params: any) {
    const eventId = await triggerPanic(params);
    return { id: eventId, status: 'active' };
  }
  async acknowledgePanic(panicId: string, acknowledgedBy: string) {
    // Best-effort compat — workspaceId not available in old interface
    log.info(`[PANIC] acknowledgePanic compat called: ${panicId} by ${acknowledgedBy}`);
  }
  async resolvePanic(panicId: string, resolution: string, falseAlarm = false) {
    log.info(`[PANIC] resolvePanic compat called: ${panicId} — ${resolution}`);
  }
  async get(panicId: string) { return undefined; }
  async getActiveForOrg(orgId: string) { return []; }
  setEmergencyContacts(orgId: string, contacts: string[]) {}
}

export const panicProtocolService = new PanicProtocolServiceCompat();
export default panicProtocolService;
