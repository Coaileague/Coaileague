/**
 * TRINITY SHIFT CONFIRMATION — Night-Before Officer Confirm System
 * =================================================================
 * Trinity sends confirmation requests the night before every shift.
 * Officers confirm or decline. Trinity handles replacements automatically.
 *
 * Uses existing shifts fields:
 *   requiresAcknowledgment → flag to request confirmation
 *   acknowledgedAt          → officer confirmed
 *   deniedAt                → officer declined
 *   denialReason            → reason for decline
 *
 * Actions (4):
 *   shift.send_confirmation_request  — notify officer to confirm tomorrow's shift
 *   shift.receive_confirmation       — record officer confirm or decline + handle replacement
 *   shift.flag_unconfirmed           — scan for shifts approaching start with no confirmation
 *   shift.scan_tomorrows_shifts      — batch confirmation sweep for all tomorrow's shifts
 */

import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { db } from '../../db';
import { shifts, employees, workspaceMembers, clients } from '@shared/schema';
import { eq, and, gte, lte, lt, isNull, ne, sql } from 'drizzle-orm';
import { createNotification } from '../notificationService';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityShiftConfirmationActions');

function mkAction(actionId: string, fn: (params: any) => Promise<any>): ActionHandler {
  return {
    actionId,
    name: actionId,
    category: 'automation' as any,
    description: `Trinity shift confirmation: ${actionId}`,
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      try {
        const data = await fn(req.params || {});
        return { success: true, data };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Unknown error' };
      }
    }
  };
}

async function getEmployeeUserId(employeeId: string): Promise<string | null> {
  const emp = await db.query.employees?.findFirst({ where: eq(employees.id, employeeId) } as any).catch(() => null);
  return (emp as any)?.userId || null;
}

export function registerShiftConfirmationActions() {

  helpaiOrchestrator.registerAction(mkAction('shift.send_confirmation_request', async (params) => {
    const { shiftId, workspaceId } = params;
    if (!shiftId) return { error: 'shiftId required' };
    const shift = await db.query.shifts?.findFirst({
      where: workspaceId
        ? and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId))
        : eq(shifts.id, shiftId),
    } as any).catch(() => null);
    if (!shift) return { error: `Shift ${shiftId} not found` };
    if (!(shift as any).employeeId) return { error: 'Shift has no assigned officer — cannot send confirmation', shiftId };
    if ((shift as any).acknowledgedAt) return { alreadyConfirmed: true, shiftId, confirmedAt: (shift as any).acknowledgedAt };

    await db.update(shifts)
      .set({ requiresAcknowledgment: true, updatedAt: new Date() } as any)
      .where(eq(shifts.id, shiftId));

    const clientData = (shift as any).clientId
      ? await db.query.clients?.findFirst({ where: eq(clients.id, (shift as any).clientId) } as any).catch(() => null)
      : null;
    const siteName = (clientData as any)?.name || 'your assigned site';
    const startTime = new Date((shift as any).startTime);
    const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const dateStr = startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    const userId = await getEmployeeUserId((shift as any).employeeId);
    if (userId) {
      await createNotification({
        workspaceId: (shift as any).workspaceId,
        userId,
        type: 'shift_confirmation',
        title: `Shift Confirmation Needed — ${dateStr}`,
        message: `You're scheduled at ${siteName} ${dateStr} at ${timeStr}. Please confirm your attendance or let us know if you cannot make it so we can arrange coverage.`,
        priority: 'high',
        metadata: { shiftId, startTime: (shift as any).startTime, site: siteName, action: 'confirm_shift' },
      } as any).catch(() => null);
    }

    log.info(`[TrinityShiftConfirmation] Confirmation request sent: shiftId=${shiftId}, officerId=${(shift as any).employeeId}`);
    return {
      sent: true,
      shiftId,
      officerId: (shift as any).employeeId,
      shiftDate: dateStr,
      shiftTime: timeStr,
      site: siteName,
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('shift.receive_confirmation', async (params) => {
    const { shiftId, officerId, confirmed, reason, workspaceId } = params;
    if (!shiftId || !officerId || confirmed === undefined) {
      return { error: 'shiftId, officerId, confirmed (true/false) required' };
    }
    const shift = await db.query.shifts?.findFirst({ where: eq(shifts.id, shiftId) } as any).catch(() => null);
    if (!shift) return { error: `Shift ${shiftId} not found` };
    const ws = workspaceId || (shift as any).workspaceId;
    const now = new Date();

    if (confirmed) {
      await db.update(shifts)
        .set({ acknowledgedAt: now, updatedAt: now } as any)
        .where(eq(shifts.id, shiftId));

      const managers = await db.select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, ws), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner', 'manager', 'supervisor')`))
        .catch(() => []);
      for (const mgr of managers) {
        await createNotification({
          workspaceId: ws, userId: mgr.userId, type: 'shift_confirmed',
          title: 'Shift Confirmed',
          message: `Officer confirmed their shift on ${new Date((shift as any).startTime).toLocaleDateString()}. Coverage is locked.`,
          priority: 'normal',
          metadata: { shiftId, officerId },
        } as any).catch(() => null);
      }

      log.info(`[TrinityShiftConfirmation] Shift confirmed: shiftId=${shiftId}, officerId=${officerId}`);
      return { confirmed: true, shiftId, officerId, confirmedAt: now.toISOString() };
    } else {
      await db.update(shifts)
        .set({ deniedAt: now, denialReason: reason || 'Officer declined', updatedAt: now } as any)
        .where(eq(shifts.id, shiftId));

      const [replacementShift] = await db.insert(shifts).values({
        workspaceId: ws,
        clientId: (shift as any).clientId || null,
        startTime: (shift as any).startTime,
        endTime: (shift as any).endTime,
        title: `[COVERAGE NEEDED] ${(shift as any).title || 'Shift'}`,
        status: 'open',
        employeeId: null,
        notes: `Replacement needed — original officer declined. Reason: ${reason || 'Not provided'}`,
        createdAt: now,
        updatedAt: now,
      } as any).returning().catch(() => [null]);

      const managers = await db.select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, ws), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner', 'manager', 'supervisor')`))
        .catch(() => []);
      for (const mgr of managers) {
        await createNotification({
          workspaceId: ws, userId: mgr.userId, type: 'shift_declined_alert',
          title: 'Officer Declined Shift — Coverage Needed',
          message: `An officer declined their shift on ${new Date((shift as any).startTime).toLocaleDateString()}. Reason: ${reason || 'Not provided'}. Trinity has created an open replacement shift.`,
          priority: 'urgent',
          metadata: { originalShiftId: shiftId, officerId, replacementShiftId: (replacementShift as any)?.id },
        } as any).catch(() => null);
      }

      log.info(`[TrinityShiftConfirmation] Shift declined + replacement created: shiftId=${shiftId}, replacementId=${(replacementShift as any)?.id}`);
      return {
        confirmed: false,
        shiftId,
        officerId,
        deniedAt: now.toISOString(),
        denialReason: reason || 'Officer declined',
        replacementShiftCreated: !!(replacementShift as any)?.id,
        replacementShiftId: (replacementShift as any)?.id || null,
      };
    }
  }));

  helpaiOrchestrator.registerAction(mkAction('shift.flag_unconfirmed', async (params) => {
    const { workspaceId, hoursBeforeShift = 4 } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const now = new Date();
    const threshold = new Date(now.getTime() + hoursBeforeShift * 3600000);

    const unconfirmedShifts = await db.select({
      id: shifts.id,
      employeeId: shifts.employeeId,
      startTime: shifts.startTime,
      title: shifts.title,
      clientId: shifts.clientId,
      requiresAcknowledgment: shifts.requiresAcknowledgment,
    })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.requiresAcknowledgment, true),
        isNull(shifts.acknowledgedAt as any),
        isNull(shifts.deniedAt as any),
        ne(shifts.status, 'cancelled'),
        gte(shifts.startTime, now),
        lt(shifts.startTime, threshold),
        ne(shifts.employeeId, null as any),
      ))
      .catch(() => []);

    if (unconfirmedShifts.length === 0) {
      return { flagged: 0, message: 'All shifts within window are confirmed', hoursWindow: hoursBeforeShift };
    }

    const managers = await db.select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner', 'manager', 'supervisor')`))
      .catch(() => []);
    for (const mgr of managers) {
      await createNotification({
        workspaceId, userId: mgr.userId, type: 'unconfirmed_shifts_alert',
        title: `${unconfirmedShifts.length} Unconfirmed Shift(s) in Next ${hoursBeforeShift} Hours`,
        message: `${unconfirmedShifts.length} officer(s) have not confirmed upcoming shifts. Immediate action may be required to ensure coverage.`,
        priority: 'urgent',
        metadata: { unconfirmedCount: unconfirmedShifts.length, shiftIds: unconfirmedShifts.map(s => s.id) },
      } as any).catch(() => null);
    }

    log.info(`[TrinityShiftConfirmation] Flagged ${unconfirmedShifts.length} unconfirmed shifts within ${hoursBeforeShift}h window`);
    return {
      flagged: unconfirmedShifts.length,
      hoursWindow: hoursBeforeShift,
      unconfirmedShifts: unconfirmedShifts.map(s => ({
        shiftId: s.id,
        officerId: s.employeeId,
        startTime: s.startTime,
        title: s.title,
        hoursUntilStart: +((new Date(s.startTime).getTime() - now.getTime()) / 3600000).toFixed(1),
      })),
      managersNotified: managers.length,
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('shift.scan_tomorrows_shifts', async (params) => {
    const { workspaceId } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const now = new Date();
    const tomorrowStart = new Date(now);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const tomorrowShifts = await db.select({
      id: shifts.id,
      employeeId: shifts.employeeId,
      startTime: shifts.startTime,
      title: shifts.title,
      acknowledgedAt: shifts.acknowledgedAt,
    })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        ne(shifts.status, 'cancelled'),
        gte(shifts.startTime, tomorrowStart),
        lte(shifts.startTime, tomorrowEnd),
        ne(shifts.employeeId, null as any),
      ))
      .catch(() => []);

    const needsConfirmation = tomorrowShifts.filter(s => !s.acknowledgedAt);
    let sent = 0;
    let alreadyConfirmed = 0;

    for (const shift of tomorrowShifts) {
      if (shift.acknowledgedAt) { alreadyConfirmed++; continue; }
      const clientData = null;
      const timeStr = new Date(shift.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      const dateStr = new Date(shift.startTime).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

      await db.update(shifts)
        .set({ requiresAcknowledgment: true, updatedAt: new Date() } as any)
        .where(eq(shifts.id, shift.id)).catch(() => null);

      if (shift.employeeId) {
        const userId = await getEmployeeUserId(shift.employeeId);
        if (userId) {
          await createNotification({
            workspaceId,
            userId,
            type: 'shift_confirmation',
            title: `Tomorrow's Shift Confirmation — ${dateStr}`,
            message: `You're scheduled tomorrow, ${dateStr} at ${timeStr}. Please confirm your attendance so we know coverage is locked.`,
            priority: 'high',
            metadata: { shiftId: shift.id, startTime: shift.startTime, action: 'confirm_shift' },
          } as any).catch(() => null);
          sent++;
        }
      }
    }

    log.info(`[TrinityShiftConfirmation] Night-before sweep: ${tomorrowShifts.length} shifts tomorrow, sent=${sent}, alreadyConfirmed=${alreadyConfirmed}`);
    return {
      totalTomorrowShifts: tomorrowShifts.length,
      confirmationRequestsSent: sent,
      alreadyConfirmed,
      needsConfirmation: needsConfirmation.length,
      date: tomorrowStart.toISOString().split('T')[0],
    };
  }));

  log.info('[Trinity Shift Confirmation] Registered 4 night-before confirmation actions');
}
