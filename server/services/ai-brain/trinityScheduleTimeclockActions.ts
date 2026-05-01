import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { db } from '../../db';
import { shifts, employees, clients, timeEntries, workspaces, shiftSwapRequests, orchestrationRuns, employeeSkills, employeeComplianceRecords } from '@shared/schema';
import { eq, and, isNull, isNotNull, gte, lte, lt, gt, ne, sql, desc, or, inArray } from 'drizzle-orm';
import { recurringScheduleTemplates } from '../scheduling/recurringScheduleTemplates';
import { autonomousSchedulingDaemon } from '../scheduling/autonomousSchedulingDaemon';
import { platformEventBus } from '../platformEventBus';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityScheduleTimeclockActions');

function mkAction(actionId: string, fn: (params: any) => Promise<any>): ActionHandler {
  return {
    actionId,
    name: actionId,
    category: 'automation' as any,
    description: `Trinity action: ${actionId}`,
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      try {
        const data = await fn(req.params || {});
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err?.message || 'Unknown error' };
      }
    }
  };
}

export function registerScheduleTimeclockActions() {

  helpaiOrchestrator.registerAction(mkAction('scheduling.auto_fill_shift', async (params) => {
    const { workspaceId, mode = 'current_week' } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const result = await autonomousSchedulingDaemon.triggerManualRun(workspaceId, mode as any);
    return result;
  }));

  helpaiOrchestrator.registerAction(mkAction('scheduling.assign_shift', async (params) => {
    const { shiftId, employeeId, workspaceId, force = false } = params;
    if (!shiftId || !employeeId || !workspaceId) return { error: 'shiftId, employeeId, and workspaceId required' };

    // 1. Fetch target shift — must belong to workspace (cross-workspace security gate)
    const [shift] = await db.select({
      id: shifts.id, startTime: shifts.startTime, endTime: shifts.endTime,
      status: shifts.status, clientId: shifts.clientId, existingEmployeeId: shifts.employeeId,
    })
      .from(shifts)
      .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)))
      .limit(1);

    if (!shift) return { blocked: true, reason: 'Shift not found in this workspace' };
    if (shift.status === 'cancelled') return { blocked: true, reason: 'Cannot assign to a cancelled shift' };

    const warnings: string[] = [];
    const blocks: string[] = [];

    // 2. Double-booking check — does this officer have any overlapping shifts?
    if (shift.startTime && shift.endTime) {
      const overlapping = await db.select({ id: shifts.id, startTime: shifts.startTime, endTime: shifts.endTime })
        .from(shifts)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          eq(shifts.employeeId, employeeId),
          ne(shifts.id, shiftId),
          ne(shifts.status, 'cancelled'),
          lt(shifts.startTime, shift.endTime),
          gt(shifts.endTime, shift.startTime),
        ));
      if (overlapping.length > 0) {
        blocks.push(`DOUBLE-BOOKING: Officer already has ${overlapping.length} overlapping shift(s) during this time window — an officer cannot be in two places at once`);
      }
    }

    // 3. Guard card / compliance expiry check
    const [compliance] = await db.select({
      guardCardStatus: (employeeComplianceRecords as any).guardCardStatus,
      guardCardExpirationDate: (employeeComplianceRecords as any).guardCardExpirationDate,
      overallStatus: (employeeComplianceRecords as any).overallStatus,
    })
      .from(employeeComplianceRecords)
      .where(and(
        eq((employeeComplianceRecords as any).workspaceId, workspaceId),
        eq((employeeComplianceRecords as any).employeeId, employeeId),
      ))
      .limit(1);

    if (compliance) {
      if (compliance.guardCardStatus === 'expired' || compliance.overallStatus === 'expired') {
        blocks.push('COMPLIANCE: Guard card is expired — officer cannot legally work this jurisdiction');
      } else if (compliance.guardCardExpirationDate) {
        const daysToExpiry = (new Date(compliance.guardCardExpirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        if (daysToExpiry < 0) {
          blocks.push('COMPLIANCE: Guard card expired — assignment blocked');
        } else if (daysToExpiry < 14) {
          warnings.push(`Guard card expires in ${Math.round(daysToExpiry)} days — initiate renewal immediately`);
        }
      }
    }

    // 4. FLSA weekly OT pre-check
    if (shift.startTime) {
      const weekStart = new Date(shift.startTime);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const [weekHrs] = await db.select({
        total: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${timeEntries.clockOut} - ${timeEntries.clockIn})) / 3600), 0)::numeric(6,2)`,
      })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          eq(timeEntries.employeeId, employeeId),
          gte(timeEntries.clockIn, weekStart),
          lt(timeEntries.clockIn, weekEnd),
          isNotNull(timeEntries.clockOut),
        ));

      const currentHrs = Number(weekHrs?.total || 0);
      const shiftDurHrs = shift.startTime && shift.endTime
        ? (shift.endTime.getTime() - shift.startTime.getTime()) / 3600000
        : 8;

      if (currentHrs + shiftDurHrs > 40) {
        warnings.push(`FLSA: Officer will reach ${(currentHrs + shiftDurHrs).toFixed(1)}h this week — ${(currentHrs + shiftDurHrs - 40).toFixed(1)}h overtime at 1.5x must be budgeted`);
      } else if (currentHrs + shiftDurHrs > 36) {
        warnings.push(`Approaching OT: officer at ${currentHrs.toFixed(1)}h — this shift brings them to ${(currentHrs + shiftDurHrs).toFixed(1)}h of 40h limit`);
      }
    }

    // 5. If hard blocks and not force-override, reject the assignment
    if (blocks.length > 0 && !force) {
      return {
        assigned: false,
        blocked: true,
        blocks,
        warnings,
        advisory: `Assignment blocked: ${blocks[0]}. A supervisor may pass force=true to override.`,
        shiftId,
        employeeId,
      };
    }

    // 6. All checks passed (or force override) — proceed
    const now = new Date();
    await db.update(shifts)
      .set({ employeeId, status: 'confirmed', updatedAt: now } as any)
      .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)));
    await platformEventBus.publish({
      eventType: 'shift_updated',
      workspaceId,
      title: 'Shift Assigned',
      description: `Trinity assigned employee ${employeeId} to shift ${shiftId}`,
      data: { shiftId, employeeId, status: 'confirmed', forcedOverride: blocks.length > 0 && force, warnings },
    });

    return {
      assigned: true,
      shiftId,
      employeeId,
      assignedAt: now.toISOString(),
      forcedOverride: blocks.length > 0 && force,
      warnings: warnings.length > 0 ? warnings : undefined,
      blocksOverridden: blocks.length > 0 && force ? blocks : undefined,
      advisory: warnings.length > 0 ? `Assignment confirmed with warnings: ${warnings.join('; ')}` : undefined,
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('scheduling.unassign_shift', async (params) => {
    const { shiftId, workspaceId } = params;
    if (!shiftId || !workspaceId) return { error: 'shiftId and workspaceId required' };
    // Security FIX: workspaceId filter prevents cross-workspace unassign
    await db.update(shifts)
      .set({ employeeId: null, status: 'draft', updatedAt: new Date() } as any)
      .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)));
    await platformEventBus.publish({
      eventType: 'shift_updated',
      workspaceId,
      title: 'Shift Unassigned',
      description: `Trinity unassigned employee from shift ${shiftId} — shift returned to draft`,
      data: { shiftId, employeeId: null, status: 'draft' },
    });
    return { unassigned: true, shiftId };
  }));

  helpaiOrchestrator.registerAction(mkAction('scheduling.create_recurring', async (params) => {
    const { workspaceId, name, baseShift, frequency, daysOfWeek, startDate, endDate } = params;
    if (!workspaceId || !baseShift) return { error: 'workspaceId and baseShift required' };
    const template = await recurringScheduleTemplates.createTemplate({
      workspaceId,
      name: name || 'Recurring Shift',
      frequency: frequency || 'weekly',
      daysOfWeek: daysOfWeek || [1, 2, 3, 4, 5],
      shiftTemplate: baseShift,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : undefined,
    });
    return { template };
  }));

  helpaiOrchestrator.registerAction(mkAction('scheduling.apply_template', async (params) => {
    const { workspaceId, templateId, weekStartDate } = params;
    if (!workspaceId || !templateId) return { error: 'workspaceId and templateId required' };
    const result = await recurringScheduleTemplates.applyTemplate({
      workspaceId,
      templateId,
      weekStartDate: weekStartDate ? new Date(weekStartDate) : new Date(),
    });
    return result;
  }));

  helpaiOrchestrator.registerAction(mkAction('scheduling.publish', async (params) => {
    const { workspaceId, shiftIds, weekOf } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    let whereClause: any;
    if (shiftIds && Array.isArray(shiftIds) && shiftIds.length > 0) {
      whereClause = and(eq(shifts.workspaceId, workspaceId), sql`${shifts.id} = ANY(${shiftIds})`);
    } else if (weekOf) {
      const weekStart = new Date(weekOf);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      whereClause = and(
        eq(shifts.workspaceId, workspaceId),
        gte(shifts.startTime, weekStart),
        lt(shifts.startTime, weekEnd),
        eq(shifts.status as any, 'draft')
      );
    } else {
      return { error: 'shiftIds array or weekOf date required' };
    }
    const result = await db.update(shifts)
      .set({ status: 'published', updatedAt: new Date() } as any)
      .where(whereClause);
    await platformEventBus.publish({
      eventType: 'schedule_published',
      workspaceId,
      title: 'Schedule Published',
      description: `Trinity published ${shiftIds?.length || 'weekly'} shift(s) for ${weekOf || 'selected period'}`,
      data: { shiftIds, weekOf, publishedAt: new Date().toISOString() },
    });
    return { published: true, workspaceId };
  }));

  helpaiOrchestrator.registerAction(mkAction('scheduling.unpublish', async (params) => {
    const { workspaceId, shiftIds } = params;
    if (!workspaceId || !shiftIds) return { error: 'workspaceId and shiftIds required' };
    await db.update(shifts)
      .set({ status: 'draft', updatedAt: new Date() } as any)
      .where(and(eq(shifts.workspaceId, workspaceId), sql`${shifts.id} = ANY(${shiftIds})`));
    return { unpublished: true, count: shiftIds.length };
  }));

  helpaiOrchestrator.registerAction(mkAction('scheduling.approve_pending', async (params) => {
    const { workspaceId, shiftId } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const whereClause = shiftId
      ? and(eq(shifts.workspaceId, workspaceId), eq(shifts.id, shiftId), eq(shifts.status as any, 'pending'))
      : and(eq(shifts.workspaceId, workspaceId), eq(shifts.status as any, 'pending'));
    await db.update(shifts)
      .set({ status: 'confirmed', updatedAt: new Date() } as any)
      .where(whereClause);
    return { approved: true, workspaceId };
  }));

  helpaiOrchestrator.registerAction(mkAction('scheduling.resolve_conflict', async (params) => {
    const { workspaceId, employeeId, conflictingShiftId, resolution } = params;
    if (!workspaceId || !conflictingShiftId) return { error: 'workspaceId and conflictingShiftId required' };
    if (resolution === 'cancel') {
      await db.update(shifts)
        .set({ status: 'cancelled', updatedAt: new Date() } as any)
        .where(and(eq(shifts.workspaceId, workspaceId), eq(shifts.id, conflictingShiftId)));
      return { resolved: true, action: 'cancelled', shiftId: conflictingShiftId };
    }
    if (resolution === 'unassign') {
      await db.update(shifts)
        .set({ employeeId: null, status: 'draft', updatedAt: new Date() } as any)
        .where(and(eq(shifts.workspaceId, workspaceId), eq(shifts.id, conflictingShiftId)));
      return { resolved: true, action: 'unassigned', shiftId: conflictingShiftId };
    }
    return { resolved: false, reason: 'Unknown resolution type. Use: cancel | unassign' };
  }));

  helpaiOrchestrator.registerAction(mkAction('scheduling.suggest_ot_alternative', async (params) => {
    const { workspaceId, employeeId, periodStart } = params;
    if (!workspaceId || !employeeId) return { error: 'workspaceId and employeeId required' };
    const weekStart = periodStart ? new Date(periodStart) : (() => {
      const d = new Date();
      d.setDate(d.getDate() - d.getDay());
      d.setHours(0, 0, 0, 0);
      return d;
    })();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const assignedShifts = await db.select({
      id: shifts.id,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
    })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.employeeId, employeeId),
        gte(shifts.startTime, weekStart),
        lt(shifts.startTime, weekEnd),
        ne(shifts.status, 'cancelled')
      ));
    const totalHours = assignedShifts.reduce((acc, s) => {
      const hours = (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 3600000;
      return acc + hours;
    }, 0);
    const projectedOT = Math.max(0, totalHours - 40);
    const suggestions: string[] = [];
    if (projectedOT > 0) {
      suggestions.push(`Reduce scheduled hours by ${projectedOT.toFixed(1)}h to avoid OT`);
      suggestions.push('Consider swapping one shift to an under-scheduled officer');
      suggestions.push('Offer the extra shift on the marketplace');
    }
    return { employeeId, weekStart, totalHours: totalHours.toFixed(1), projectedOT: projectedOT.toFixed(1), suggestions, atRisk: projectedOT > 0 };
  }));

  helpaiOrchestrator.registerAction(mkAction('timeclock.verify_location', async (params) => {
    const { lat, lng, shiftId, workspaceId } = params;
    if (!shiftId || lat === undefined || lng === undefined) return { error: 'shiftId, lat, lng required' };
    const shift = await db.query.shifts?.findFirst({
      where: and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId || '')),
    } as any).catch(() => null);
    if (!shift) return { verified: false, reason: 'Shift not found' };
    const clientData = shift.clientId ? await db.query.clients?.findFirst({
      where: eq(clients.id, shift.clientId)
    } as any).catch(() => null) : null;
    const siteLat = (clientData as any)?.latitude;
    const siteLng = (clientData as any)?.longitude;
    const geofenceRadius = (clientData as any)?.geofenceRadius || 200;
    if (!siteLat || !siteLng) return { verified: true, note: 'No geofence configured for site' };
    const R = 6371000;
    const dLat = (lat - siteLat) * Math.PI / 180;
    const dLng = (lng - siteLng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(siteLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return {
      verified: distance <= geofenceRadius,
      distance: Math.round(distance),
      geofenceRadius,
      inGeofence: distance <= geofenceRadius,
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('timeclock.review_photo', async (params) => {
    const { timeEntryId, workspaceId, flagReason } = params;
    // GAP-21 FIX: workspaceId added to WHERE so a Trinity action cannot annotate a foreign workspace's time entry.
    if (!timeEntryId || !workspaceId) return { error: 'timeEntryId and workspaceId required' };
    await db.update(timeEntries)
      .set({ notes: `[PHOTO_REVIEW_FLAG] ${flagReason || 'Manual review requested'}` } as any)
      .where(and(eq(timeEntries.id, timeEntryId), eq(timeEntries.workspaceId, workspaceId)));
    return { flagged: true, timeEntryId, reason: flagReason || 'Manual review requested' };
  }));

  helpaiOrchestrator.registerAction(mkAction('timeclock.flag_missed_punch', async (params) => {
    const { workspaceId, date } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const checkDate = date ? new Date(date) : new Date();
    const threshold = new Date(checkDate.getTime() - 15 * 60000);
    const missedShifts = await db.select({
      id: shifts.id,
      employeeId: shifts.employeeId,
      startTime: shifts.startTime,
      title: shifts.title,
    })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        lte(shifts.startTime, threshold),
        gte(shifts.startTime, new Date(checkDate.getTime() - 8 * 3600000)),
        ne(shifts.status, 'cancelled'),
        ne(shifts.status as any, 'completed')
      ));
    const missedWithNoPunch: typeof missedShifts = [];
    for (const s of missedShifts) {
      if (!s.employeeId) continue;
      const punch = await db.select().from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          eq(timeEntries.employeeId, s.employeeId),
          gte(timeEntries.clockIn, new Date(new Date(s.startTime).getTime() - 30 * 60000)),
          lte(timeEntries.clockIn, new Date(new Date(s.startTime).getTime() + 60 * 60000))
        ))
        .limit(1);
      if (punch.length === 0) missedWithNoPunch.push(s);
    }
    return { missedPunches: missedWithNoPunch, count: missedWithNoPunch.length };
  }));

  helpaiOrchestrator.registerAction(mkAction('marketplace.post_shift', async (params) => {
    const { shiftId, workspaceId, expiresHours = 24 } = params;
    if (!shiftId || !workspaceId) return { error: 'shiftId and workspaceId required' };
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresHours);
    await db.update(shifts)
      .set({ status: 'marketplace', updatedAt: new Date() } as any)
      .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)));
    return { posted: true, shiftId, expiresAt: expiresAt.toISOString() };
  }));

  helpaiOrchestrator.registerAction(mkAction('marketplace.auto_award', async (params) => {
    const { shiftId, workspaceId, employeeId } = params;
    if (!shiftId || !employeeId) return { error: 'shiftId and employeeId required' };
    // G21-pattern FIX: isNull guard prevents double-award in concurrent marketplace claim
    const [awarded] = await db.update(shifts)
      .set({ employeeId, status: 'confirmed', updatedAt: new Date() } as any)
      .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId || ''), isNull(shifts.employeeId)))
      .returning();
    if (!awarded) return { awarded: false, reason: 'ALREADY_CLAIMED', shiftId };
    return { awarded: true, shiftId, employeeId };
  }));

  helpaiOrchestrator.registerAction(mkAction('coverage.request', async (params) => {
    const { workspaceId, clientId, startTime, endTime, title, requiredLevel } = params;
    if (!workspaceId || !startTime || !endTime) return { error: 'workspaceId, startTime, endTime required' };
    const [newShift] = await db.insert(shifts).values({
      workspaceId,
      clientId: clientId || null,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      title: title || `Coverage Request ${new Date(startTime).toLocaleDateString()}`,
      status: 'open',
      employeeId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();
    return { created: true, shift: newShift };
  }));

  helpaiOrchestrator.registerAction(mkAction('coverage.fulfill', async (params) => {
    const { shiftId, employeeId, workspaceId } = params;
    if (!shiftId || !employeeId) return { error: 'shiftId and employeeId required' };
    // G21-pattern FIX: isNull guard prevents two officers both claiming an open coverage slot
    const [fulfilled] = await db.update(shifts)
      .set({ employeeId, status: 'confirmed', updatedAt: new Date() } as any)
      .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId || ''), isNull(shifts.employeeId)))
      .returning();
    if (!fulfilled) return { fulfilled: false, reason: 'ALREADY_FULFILLED', shiftId };
    return { fulfilled: true, shiftId, employeeId };
  }));

  helpaiOrchestrator.registerAction(mkAction('timeclock.detect_buddy_punch_risk', async (params) => {
    const { workspaceId, clockEntryId } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const flags: string[] = [];
    const affectedOfficers: string[] = [];
    let riskLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';

    if (clockEntryId) {
      const [entry] = await db.select({
        id: timeEntries.id,
        employeeId: timeEntries.employeeId,
        clockIn: timeEntries.clockIn,
        clockInLat: sql`time_entries.clock_in_lat`,
        clockInLng: sql`time_entries.clock_in_lng`,
        deviceId: sql`time_entries.device_id`,
        shiftId: sql`time_entries.shift_id`,
      }).from(timeEntries).where(eq(timeEntries.id, clockEntryId)).limit(1).catch(() => []);

      if (entry && (entry as any).clockIn) {
        const clockInTime = new Date((entry as any).clockIn);
        const window2min = new Date(clockInTime.getTime() - 2 * 60000);
        const window2minAfter = new Date(clockInTime.getTime() + 2 * 60000);

        const nearbyClockIns = await db.select({
          id: timeEntries.id,
          employeeId: timeEntries.employeeId,
          clockIn: timeEntries.clockIn,
          deviceId: sql`time_entries.device_id`,
        })
          .from(timeEntries)
          .where(and(
            eq(timeEntries.workspaceId, workspaceId),
            ne(timeEntries.id, clockEntryId),
            ne(timeEntries.employeeId, (entry as any).employeeId),
            gte(timeEntries.clockIn, window2min),
            lte(timeEntries.clockIn, window2minAfter),
          ))
          .limit(5)
          .catch(() => []);

        if (nearbyClockIns.length > 0) {
          riskLevel = 'HIGH';
          flags.push(`${nearbyClockIns.length} other officer(s) clocked in within 2 minutes of this entry`);
          for (const n of nearbyClockIns) {
            if ((n as any).employeeId && !affectedOfficers.includes((n as any).employeeId)) {
              affectedOfficers.push((n as any).employeeId);
            }
            const sameDevice = (entry as any).deviceId && (n as any).deviceId && (entry as any).deviceId === (n as any).deviceId;
            if (sameDevice) {
              flags.push(`Same device ID used to clock in two different officers — high buddy punch indicator`);
            }
          }
          if ((entry as any).employeeId) affectedOfficers.push((entry as any).employeeId);
        }
      }
    } else {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
      const recentEntries = await db.select({
        employeeId: timeEntries.employeeId,
        clockIn: timeEntries.clockIn,
        shiftId: sql`time_entries.shift_id`,
        deviceId: sql`time_entries.device_id`,
      })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, thirtyDaysAgo),
        ))
        .orderBy(timeEntries.clockIn)
        .limit(500)
        .catch(() => []);

      const pairMap: Record<string, { count: number; total: number }> = {};
      for (let i = 0; i < recentEntries.length; i++) {
        for (let j = i + 1; j < recentEntries.length; j++) {
          const a = recentEntries[i];
          const b = recentEntries[j];
          if ((a as any).employeeId === (b as any).employeeId) continue;
          const timeDiff = Math.abs(new Date((b as any).clockIn).getTime() - new Date((a as any).clockIn).getTime());
          if (timeDiff > 2 * 60000) break;
          const pairKey = [(a as any).employeeId, (b as any).employeeId].sort().join('::');
          if (!pairMap[pairKey]) pairMap[pairKey] = { count: 0, total: 0 };
          pairMap[pairKey].count++;
          pairMap[pairKey].total++;
        }
      }

      const suspiciousPairs = Object.entries(pairMap).filter(([_, v]) => v.count >= 3);
      if (suspiciousPairs.length > 0) {
        riskLevel = suspiciousPairs.some(([_, v]) => v.count >= 7) ? 'HIGH' : 'MEDIUM';
        for (const [pair, data] of suspiciousPairs) {
          const [emp1, emp2] = pair.split('::');
          flags.push(`Officers ${emp1} and ${emp2} clocked in within 2 minutes of each other ${data.count} times in 30 days`);
          if (!affectedOfficers.includes(emp1)) affectedOfficers.push(emp1);
          if (!affectedOfficers.includes(emp2)) affectedOfficers.push(emp2);
        }
      }
    }

    const recommendation = riskLevel === 'HIGH'
      ? 'Immediate supervisor review required. Consider requiring photo + GPS verification for flagged officers and reviewing time entries for accuracy.'
      : riskLevel === 'MEDIUM'
        ? 'Pattern warrants monitoring. Enable photo verification for flagged officer pair(s) and audit recent clock-in entries.'
        : 'No buddy punch indicators detected in this scan.';

    log.info(`[TrinityTimeclock] buddy_punch_risk: ws=${workspaceId}, risk=${riskLevel}, flags=${flags.length}, officers=${affectedOfficers.length}`);
    return { riskLevel, flags, affectedOfficers, recommendation, scannedAt: new Date().toISOString() };
  }));

  helpaiOrchestrator.registerAction(mkAction('shift.validate_swap', async (params) => {
    const { workspaceId, shiftAId, officerBId } = params;
    if (!workspaceId || !shiftAId || !officerBId) return { error: 'workspaceId, shiftAId, officerBId required' };

    const [shiftA] = await db.select().from(shifts).where(and(eq(shifts.id, shiftAId), eq(shifts.workspaceId, workspaceId))).limit(1);
    if (!shiftA) return { error: 'Shift A not found' };

    const [officerB] = await db.select().from(employees).where(and(eq(employees.id, officerBId), eq(employees.workspaceId, workspaceId))).limit(1);
    if (!officerB) return { error: 'Officer B not found' };

    const blockers: string[] = [];
    const warnings: string[] = [];
    let requiresSupervisorApproval = false;

    // 1. officerB is qualified (same or higher required_certifications as shiftA)
    const requiredCerts = (shiftA.requiredCertifications as string[]) || [];
    if (requiredCerts.length > 0) {
      const officerBCerts = await db.select().from(employeeSkills).where(and(eq(employeeSkills.employeeId, officerBId), eq(employeeSkills.skillCategory, 'certification'))).catch(() => []);
      const officerBCertNames = officerBCerts.map((c) => c.skillName);
      for (const cert of requiredCerts) {
        if (!officerBCertNames.includes(cert)) {
          blockers.push(`Officer B lacks required certification: ${cert}`);
        }
      }
    }

    // 2. Neither officer goes into OT from swap (check total hours for the week)
    const shiftStart = new Date(shiftA.startTime);
    const weekStart = new Date(shiftStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const officerBShifts = await db.select().from(shifts).where(and(
      eq(shifts.employeeId, officerBId),
      gte(shifts.startTime, weekStart),
      lt(shifts.startTime, weekEnd),
      ne(shifts.status, 'cancelled')
    ));

    const officerBHours = officerBShifts.reduce((acc, s) => acc + (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 3600000, 0);
    const shiftAHours = (new Date(shiftA.endTime).getTime() - new Date(shiftA.startTime).getTime()) / 3600000;

    if (officerBHours + shiftAHours > 40) {
      warnings.push(`Swap would put Officer B into overtime (${(officerBHours + shiftAHours).toFixed(1)} hours)`);
    }

    // 3. No 8-hour fatigue window violated for officerB (no shift ending less than 8hrs before shiftA.start_time)
    const eightHoursBefore = new Date(shiftStart.getTime() - 8 * 3600000);
    const eightHoursAfter = new Date(new Date(shiftA.endTime).getTime() + 8 * 3600000);

    const fatigueConflict = await db.select().from(shifts).where(and(
      eq(shifts.employeeId, officerBId),
      or(
        and(gte(shifts.endTime, eightHoursBefore), lte(shifts.endTime, shiftStart)),
        and(gte(shifts.startTime, new Date(shiftA.endTime)), lte(shifts.startTime, eightHoursAfter))
      ),
      ne(shifts.status, 'cancelled')
    )).limit(1);

    if (fatigueConflict.length > 0) {
      blockers.push('8-hour fatigue window violation for Officer B');
    }

    // 4. Supervisor approval required if either officer is on a key post (check client.requires_supervisor_approval or shift.category)
    const [clientA] = await db.select().from(clients).where(eq(clients.id, shiftA.clientId || '')).limit(1);
    if ((clientA as any)?.requiresSupervisorApproval || shiftA.category === 'emergency') {
      requiresSupervisorApproval = true;
    }

    return {
      valid: blockers.length === 0,
      warnings,
      blockers,
      requiresSupervisorApproval
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('scheduling.execute_swap', async (params) => {
    const { workspaceId, swapRequestId } = params;
    if (!workspaceId || !swapRequestId) return { error: 'workspaceId and swapRequestId required' };

    const [swapRequest] = await db.select().from(shiftSwapRequests).where(and(eq(shiftSwapRequests.id, swapRequestId), eq(shiftSwapRequests.workspaceId, workspaceId))).limit(1);
    if (!swapRequest) return { error: 'Swap request not found' };

    const shiftId = swapRequest.shiftId;
    const targetOfficerId = swapRequest.targetEmployeeId;

    if (!targetOfficerId) return { error: 'Swap request has no target officer' };

    await db.transaction(async (tx) => {
      await tx.update(shifts)
        .set({ employeeId: targetOfficerId, updatedAt: new Date() })
        .where(eq(shifts.id, shiftId));

      await tx.update(shiftSwapRequests)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(shiftSwapRequests.id, swapRequestId));

      await tx.insert(orchestrationRuns).values({
        workspaceId,
        category: 'shift_swap',
        source: 'trinity',
        actionId: 'scheduling.execute_swap',
        status: 'completed',
        inputParams: params,
        outputResult: { success: true, shiftId, targetOfficerId },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    return { success: true, shiftId, swappedTo: targetOfficerId };
  }));

  /**
   * scheduling.delete_shift — Phase 1 CRUD gap fill
   * Deletes a shift by ID. Validates shift is not in the past.
   * Publishes shift_deleted event on success.
   */
  helpaiOrchestrator.registerAction(mkAction('scheduling.delete_shift', async (params) => {
    const { workspaceId, shiftId, reason } = params;
    if (!workspaceId || !shiftId) return { error: 'workspaceId and shiftId required' };

    const [shift] = await db.select().from(shifts)
      .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)))
      .limit(1);
    if (!shift) return { error: 'Shift not found in this workspace' };

    if (shift.startTime && new Date(shift.startTime) < new Date()) {
      return { blocked: true, reason: 'Cannot delete a shift that has already started or is in the past' };
    }

    await db.update(shifts)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(shifts.id, shiftId));

    await platformEventBus.publish({
      type: 'shift_deleted',
      workspaceId,
      title: 'Shift Deleted',
      description: `Shift ${shiftId} deleted${reason ? `: ${reason}` : ''}`,
      metadata: { shiftId, employeeId: shift.employeeId, reason },
    } as any);

    return { success: true, shiftId, status: 'cancelled', employeeId: shift.employeeId };
  }));

  /**
   * scheduling.detect_double_booking
   * New dedicated scan — finds all officers assigned to overlapping shifts in a time window.
   * The individual assign_shift action now blocks double-bookings at creation time, but this
   * scan catches pre-existing conflicts and those created outside of Trinity's action system.
   */
  helpaiOrchestrator.registerAction(mkAction('scheduling.detect_double_booking', async (params) => {
    const { workspaceId, windowStart, windowEnd } = params;
    if (!workspaceId) return { error: 'workspaceId required' };

    const start = windowStart ? new Date(windowStart) : new Date();
    const end = windowEnd ? new Date(windowEnd) : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Fetch all assigned (non-cancelled) shifts in window
    const allShifts = await db.select({
      id: shifts.id,
      employeeId: shifts.employeeId,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      clientId: shifts.clientId,
    })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        isNotNull(shifts.employeeId),
        gte(shifts.startTime, start),
        lte(shifts.startTime, end),
        ne(shifts.status, 'cancelled'),
      ));

    // Group by employee, then check all pairs for time overlap
    const byEmployee = new Map<string, typeof allShifts>();
    for (const s of allShifts) {
      if (!s.employeeId) continue;
      if (!byEmployee.has(s.employeeId)) byEmployee.set(s.employeeId, []);
      byEmployee.get(s.employeeId)!.push(s);
    }

    const conflicts: any[] = [];
    for (const [empId, empShifts] of byEmployee) {
      for (let i = 0; i < empShifts.length; i++) {
        for (let j = i + 1; j < empShifts.length; j++) {
          const a = empShifts[i];
          const b = empShifts[j];
          if (!a.startTime || !a.endTime || !b.startTime || !b.endTime) continue;
          const overlap = a.startTime < b.endTime && a.endTime > b.startTime;
          if (overlap) {
            const overlapMins = Math.round(
              (Math.min(a.endTime.getTime(), b.endTime.getTime()) -
               Math.max(a.startTime.getTime(), b.startTime.getTime())) / 60000
            );
            conflicts.push({
              employeeId: empId,
              shiftA: a.id,
              shiftAWindow: `${a.startTime.toISOString().slice(0,16)} – ${a.endTime.toISOString().slice(0,16)}`,
              shiftB: b.id,
              shiftBWindow: `${b.startTime.toISOString().slice(0,16)} – ${b.endTime.toISOString().slice(0,16)}`,
              overlapMinutes: overlapMins,
              severity: 'CONFLICT — physically impossible assignment',
            });
          }
        }
      }
    }

    // Resolve employee names for human-readable output
    if (conflicts.length > 0) {
      const empIds = [...new Set(conflicts.map(c => c.employeeId))];
      const nameRows = await db.select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName })
        .from(employees)
        .where(and(eq(employees.workspaceId, workspaceId), inArray(employees.id, empIds)));
      const nameMap = new Map(nameRows.map(r => [r.id, `${r.firstName} ${r.lastName}`.trim()]));
      for (const c of conflicts) c.employeeName = nameMap.get(c.employeeId) || c.employeeId;
    }

    return {
      windowStart: start.toISOString().split('T')[0],
      windowEnd: end.toISOString().split('T')[0],
      shiftsScanned: allShifts.length,
      officersWithShifts: byEmployee.size,
      doubleBookings: conflicts.length,
      conflicts,
      advisory: conflicts.length > 0
        ? `URGENT: ${conflicts.length} double-booking conflict(s) found. Officers cannot be in two places simultaneously. Resolve by unassigning or cancelling one shift per conflict.`
        : 'No double-booking conflicts detected in this window.',
      approvalRequired: conflicts.length > 0,
      confidenceScore: 1.0,
    };
  }));

  log.info('[Trinity Schedule+Timeclock] Registered 24 schedule, timeclock, marketplace, coverage, buddy-punch, double-booking-scan actions');
}
