import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { db } from '../../db';
import { shifts, employees } from '@shared/schema';
import { eq, and, gte, lte, isNull, ne, sql, count, desc } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinitySchedulingPlatformActions');

function mkAction(actionId: string, fn: (params: any) => Promise<any>): ActionHandler {
  return {
    actionId,
    name: actionId,
    category: 'scheduling' as any,
    description: `Trinity scheduling action: ${actionId}`,
    inputSchema: { type: 'object' as const, properties: {} },
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      try {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const data = await fn(req.params || req.payload || {});
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return { success: true, data };
      } catch (err: any) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return { success: false, error: err?.message || 'Unknown error' };
      }
    },
  };
}

export function registerSchedulingPlatformActions() {

  helpaiOrchestrator.registerAction(mkAction('scheduling.get_open_shifts', async (params) => {
    const { workspaceId, daysAhead = 7, clientId, limit = 50 } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + daysAhead);
    const conditions = [
      eq(shifts.workspaceId, workspaceId),
      isNull(shifts.employeeId),
      gte(shifts.startTime, from),
      lte(shifts.startTime, to),
      ne(shifts.status, 'cancelled'),
    ];
    if (clientId) conditions.push(eq(shifts.clientId, clientId));
    const openShifts = await db.select({
      id: shifts.id,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      title: shifts.title,
      clientId: shifts.clientId,
      status: shifts.status,
    })
      .from(shifts)
      .where(and(...conditions))
      .orderBy(shifts.startTime)
      .limit(limit);
    return { openShifts, count: openShifts.length, daysAhead, workspaceId };
  }));

  helpaiOrchestrator.registerAction(mkAction('scheduling.find_coverage', async (params) => {
    const { workspaceId, shiftId, startTime, endTime, requiredPosition, requiredArmed } = params;
    if (!workspaceId) return { error: 'workspaceId required' };

    // Pull all active employees with full profile for compatibility scoring
    const allActive = await db.select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      position: employees.position,
      status: employees.status,
      hourlyRate: employees.hourlyRate,
      isArmed: employees.isArmed,
    })
      .from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.status, 'active'),
      ))
      .limit(50);

    // Filter out employees with conflicting shifts during the requested window
    let available = allActive;
    let busyIds = new Set<string>();
    if (startTime && endTime) {
      const from = new Date(startTime);
      const to = new Date(endTime);
      const conflicting = await db.select({ employeeId: shifts.employeeId })
        .from(shifts)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.startTime, from),
          lte(shifts.endTime, to),
          ne(shifts.status, 'cancelled'),
        ));
      busyIds = new Set(conflicting.map((c: any) => c.employeeId).filter(Boolean));
      available = allActive.filter(e => !busyIds.has(e.id));
    }

    // Compatibility scoring: rank candidates intelligently
    const scored = available.map(emp => {
      let score = 100;
      const reasons: string[] = [];
      const disqualifiers: string[] = [];

      // Position match bonus
      if (requiredPosition && emp.position) {
        if (emp.position.toLowerCase().includes(requiredPosition.toLowerCase())) {
          score += 15;
          reasons.push('Position match');
        }
      }

      // Armed match — required armed but not armed = disqualify
      if (requiredArmed === true && !emp.isArmed) {
        disqualifiers.push('Armed status required');
        score = 0;
      } else if (emp.isArmed) {
        score += 10;
        reasons.push('Armed certified');
      }

      return {
        id: emp.id,
        name: `${emp.firstName} ${emp.lastName}`,
        position: emp.position,
        isArmed: emp.isArmed,
        hourlyRate: emp.hourlyRate,
        compatibilityScore: Math.max(0, score),
        reasons,
        disqualifiers,
        recommended: score >= 100,
      };
    });

    // Sort: recommended first, then by score desc
    scored.sort((a, b) => b.compatibilityScore - a.compatibilityScore);

    const qualified = scored.filter(e => e.disqualifiers.length === 0);
    const disqualified = scored.filter(e => e.disqualifiers.length > 0);

    return {
      available: qualified,
      disqualified,
      busyCount: busyIds.size,
      totalActive: allActive.length,
      shiftId,
      recommended: qualified.filter(e => e.recommended),
      summary: `${qualified.length} qualified, ${disqualified.length} disqualified, ${busyIds.size} busy`,
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('scheduling.detect_conflicts', async (params) => {
    const { workspaceId, startDate, endDate } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const from = startDate ? new Date(startDate) : new Date();
    const to = endDate ? new Date(endDate) : new Date(Date.now() + 7 * 86400000);
    const upcoming = await db.select({
      id: shifts.id,
      employeeId: shifts.employeeId,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      status: shifts.status,
    })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        gte(shifts.startTime, from),
        lte(shifts.startTime, to),
        ne(shifts.status, 'cancelled'),
      ))
      .orderBy(shifts.employeeId, shifts.startTime);
    const conflicts: any[] = [];
    const byEmployee: Record<string, typeof upcoming> = {};
    for (const s of upcoming) {
      if (!s.employeeId) continue;
      if (!byEmployee[s.employeeId]) byEmployee[s.employeeId] = [];
      byEmployee[s.employeeId].push(s);
    }
    for (const [empId, empShifts] of Object.entries(byEmployee)) {
      for (let i = 0; i < empShifts.length - 1; i++) {
        const a = empShifts[i];
        const b = empShifts[i + 1];
        if (new Date(a.endTime!) > new Date(b.startTime)) {
          conflicts.push({ employeeId: empId, shiftA: a.id, shiftB: b.id, overlapStart: b.startTime, overlapEnd: a.endTime });
        }
      }
    }
    return { conflicts, conflictCount: conflicts.length, shiftsChecked: upcoming.length };
  }));

  helpaiOrchestrator.registerAction(mkAction('scheduling.get_schedule_for_period', async (params) => {
    const { workspaceId, startDate, endDate, employeeId, clientId } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const from = startDate ? new Date(startDate) : new Date();
    const to = endDate ? new Date(endDate) : new Date(Date.now() + 7 * 86400000);
    const conditions = [
      eq(shifts.workspaceId, workspaceId),
      gte(shifts.startTime, from),
      lte(shifts.startTime, to),
    ];
    if (employeeId) conditions.push(eq(shifts.employeeId, employeeId));
    if (clientId) conditions.push(eq(shifts.clientId, clientId));
    const schedule = await db.select({
      id: shifts.id,
      employeeId: shifts.employeeId,
      clientId: shifts.clientId,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      title: shifts.title,
      status: shifts.status,
    })
      .from(shifts)
      .where(and(...conditions))
      .orderBy(shifts.startTime)
      .limit(200);
    const openCount = schedule.filter(s => !s.employeeId && s.status !== 'cancelled').length;
    const coveredCount = schedule.filter(s => s.employeeId).length;
    return { schedule, totalShifts: schedule.length, openCount, coveredCount, coverageRate: schedule.length > 0 ? Math.round((coveredCount / schedule.length) * 100) : 100 };
  }));

  // scheduling.publish_shifts removed — canonical: scheduling.publish in trinityScheduleTimeclockActions.ts

  log.info('[Trinity Scheduling] Registered 4 scheduling.* platform actions');
}
