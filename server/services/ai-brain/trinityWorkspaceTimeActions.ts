import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { db } from '../../db';
import { workspaces, employees, timeEntries, subscriptions, shifts } from '@shared/schema';
import { eq, and, gte, isNull, lt, lte, ne, sql, count, gt } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityWorkspaceTimeActions');

function mkAction(actionId: string, fn: (params: any) => Promise<any>): ActionHandler {
  return {
    actionId,
    name: actionId,
    category: 'automation' as any,
    description: `Trinity platform action: ${actionId}`,
    inputSchema: { type: 'object' as const, properties: {} },
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      try {
        const data = await fn(req.params || req.payload || {});
        return { success: true, data };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Unknown error' };
      }
    },
  };
}

export function registerWorkspaceTimeActions() {

  helpaiOrchestrator.registerAction(mkAction('workspace.get_org_context', async (params) => {
    const { workspaceId } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const workspace = await db.query.workspaces?.findFirst({ where: eq(workspaces.id, workspaceId) } as any).catch(() => null);
    if (!workspace) return { error: 'Workspace not found' };
    const [empCount] = await db.select({ count: count() }).from(employees).where(and(eq(employees.workspaceId, workspaceId), eq(employees.status, 'active')));
    const subscription = await db.query.subscriptions?.findFirst({ where: eq(subscriptions.workspaceId as any, workspaceId) } as any).catch(() => null);
    return {
      workspaceId,
      name: (workspace as any).name,
      industry: (workspace as any).industry,
      size: (workspace as any).size,
      activeEmployees: empCount?.count || 0,
      subscriptionTier: (subscription as any)?.tier || 'free',
      subscriptionStatus: (subscription as any)?.status || 'active',
      createdAt: (workspace as any).createdAt,
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('workspace.check_workspace_health', async (params) => {
    const { workspaceId } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const [empCount] = await db.select({ count: count() }).from(employees).where(eq(employees.workspaceId, workspaceId));
    const [activeCount] = await db.select({ count: count() }).from(employees).where(and(eq(employees.workspaceId, workspaceId), eq(employees.status, 'active')));
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const [recentActivity] = await db.select({ count: count() }).from(timeEntries).where(and(eq(timeEntries.workspaceId, workspaceId), gte(timeEntries.clockIn, sevenDaysAgo)));
    const totalEmps = empCount?.count || 0;
    const activeEmps = activeCount?.count || 0;
    const activityScore = Math.min(100, Math.round((recentActivity?.count || 0) / Math.max(activeEmps, 1) * 20));
    const health = activityScore >= 60 ? 'healthy' : activityScore >= 30 ? 'moderate' : 'low_activity';
    return { workspaceId, totalEmployees: totalEmps, activeEmployees: activeEmps, activityLast7d: recentActivity?.count || 0, activityScore, health };
  }));

  helpaiOrchestrator.registerAction(mkAction('workspace.get_subscription_status', async (params) => {
    const { workspaceId } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const subscription = await db.query.subscriptions?.findFirst({ where: eq(subscriptions.workspaceId as any, workspaceId) } as any).catch(() => null);
    if (!subscription) return { workspaceId, tier: 'free', status: 'active', credits: null };
    return {
      workspaceId,
      tier: (subscription as any).tier,
      status: (subscription as any).status,
      currentPeriodEnd: (subscription as any).currentPeriodEnd,
      cancelAtPeriodEnd: (subscription as any).cancelAtPeriodEnd,
      stripeSubscriptionId: (subscription as any).stripeSubscriptionId,
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('time.get_period_summary', async (params) => {
    const { workspaceId, startDate, endDate, employeeId } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const from = startDate ? new Date(startDate) : new Date(Date.now() - 14 * 86400000);
    const to = endDate ? new Date(endDate) : new Date();
    const conditions = [
      eq(timeEntries.workspaceId, workspaceId),
      gte(timeEntries.clockIn, from),
      lt(timeEntries.clockIn, to),
    ];
    if (employeeId) conditions.push(eq(timeEntries.employeeId, employeeId));
    const entries = await db.select({
      employeeId: timeEntries.employeeId,
      totalMinutes: (timeEntries as any).totalMinutes,
      status: timeEntries.status,
      clockIn: timeEntries.clockIn,
    })
      .from(timeEntries)
      .where(and(...conditions))
      .limit(500);
    const totalMinutes = entries.reduce((sum, e) => sum + (e.totalMinutes || 0), 0);
    const approvedCount = entries.filter(e => e.status === 'approved').length;
    const pendingCount = entries.filter(e => e.status === 'pending').length;
    const uniqueEmployees = new Set(entries.map(e => e.employeeId)).size;
    return {
      period: { from, to },
      totalEntries: entries.length,
      totalHours: Math.round((totalMinutes / 60) * 100) / 100,
      approvedCount,
      pendingCount,
      uniqueEmployees,
      avgHoursPerEmployee: uniqueEmployees > 0 ? Math.round((totalMinutes / 60 / uniqueEmployees) * 100) / 100 : 0,
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('time.flag_exceptions', async (params) => {
    const { workspaceId, lookbackDays = 7, overtimeThresholdHours = 40 } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const from = new Date(Date.now() - lookbackDays * 86400000);
    const entries = await db.select({
      id: timeEntries.id,
      employeeId: timeEntries.employeeId,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
      totalMinutes: (timeEntries as any).totalMinutes,
      status: timeEntries.status,
    })
      .from(timeEntries)
      .where(and(eq(timeEntries.workspaceId, workspaceId), gte(timeEntries.clockIn, from)))
      .limit(500);
    const byEmployee: Record<string, number> = {};
    const exceptions: any[] = [];
    for (const e of entries) {
      if (!e.employeeId) continue;
      byEmployee[e.employeeId] = (byEmployee[e.employeeId] || 0) + (e.totalMinutes || 0);
      if (!e.clockOut && e.clockIn) {
        const mins = (Date.now() - new Date(e.clockIn).getTime()) / 60000;
        if (mins > 720) exceptions.push({ type: 'forgot_clock_out', employeeId: e.employeeId, entryId: e.id, hoursElapsed: Math.round(mins / 60) });
      }
    }
    for (const [empId, mins] of Object.entries(byEmployee)) {
      if (mins / 60 > overtimeThresholdHours) {
        exceptions.push({ type: 'overtime_risk', employeeId: empId, hoursInPeriod: Math.round(mins / 60), threshold: overtimeThresholdHours });
      }
    }
    return { exceptions, exceptionCount: exceptions.length, lookbackDays, overtimeThresholdHours };
  }));

  helpaiOrchestrator.registerAction(mkAction('time.get_clocked_in_now', async (params) => {
    const { workspaceId } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const clockedIn = await db.select({
      id: timeEntries.id,
      employeeId: timeEntries.employeeId,
      clockIn: timeEntries.clockIn,
    })
      .from(timeEntries)
      .where(and(
        eq(timeEntries.workspaceId, workspaceId),
        isNull(timeEntries.clockOut),
        gte(timeEntries.clockIn, new Date(Date.now() - 24 * 3600000)),
      ));
    return { clockedInNow: clockedIn.length, employees: clockedIn.map(e => ({ employeeId: e.employeeId, clockIn: e.clockIn, minutesOnDuty: Math.round((Date.now() - new Date(e.clockIn).getTime()) / 60000) })) };
  }));

  helpaiOrchestrator.registerAction(mkAction('time.get_overtime_risk', async (params) => {
    const { workspaceId, weeklyThresholdHours = 40 } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEntries = await db.select({
      employeeId: timeEntries.employeeId,
      totalMinutes: (timeEntries as any).totalMinutes,
    })
      .from(timeEntries)
      .where(and(eq(timeEntries.workspaceId, workspaceId), gte(timeEntries.clockIn, weekStart)))
      .limit(1000);
    const byEmployee: Record<string, number> = {};
    for (const e of weekEntries) {
      if (!e.employeeId) continue;
      byEmployee[e.employeeId] = (byEmployee[e.employeeId] || 0) + (e.totalMinutes || 0);
    }
    const atRisk = Object.entries(byEmployee)
      .filter(([, mins]) => mins / 60 > weeklyThresholdHours * 0.8)
      .map(([empId, mins]) => ({ employeeId: empId, hoursThisWeek: Math.round(mins / 60 * 100) / 100, isOverThreshold: mins / 60 > weeklyThresholdHours }));
    return { atRisk, atRiskCount: atRisk.length, threshold: weeklyThresholdHours, weekStart };
  }));

  helpaiOrchestrator.registerAction(mkAction('time.get_daily_breakdown', async (params) => {
    const { workspaceId, date } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const targetDate = date ? new Date(date) : new Date();
    const start = new Date(targetDate); start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate); end.setHours(23, 59, 59, 999);
    const entries = await db.select({
      employeeId: timeEntries.employeeId,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
      totalMinutes: (timeEntries as any).totalMinutes,
      status: timeEntries.status,
    }).from(timeEntries).where(and(
      eq(timeEntries.workspaceId, workspaceId),
      gte(timeEntries.clockIn, start),
      lte(timeEntries.clockIn, end),
    ));
    const totalHours = entries.reduce((s, e) => s + (e.totalMinutes || 0), 0) / 60;
    return { date: start.toISOString().split('T')[0], entryCount: entries.length, totalHours: Math.round(totalHours * 100) / 100, entries };
  }));

  helpaiOrchestrator.registerAction(mkAction('time.flag_missed_clock_in', async (params) => {
    const { workspaceId, toleranceMinutes = 15 } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const now = new Date();
    const windowStart = new Date(now.getTime() - (toleranceMinutes + 60) * 60000);
    const scheduledNow = await db.select({
      id: shifts.id,
      employeeId: shifts.employeeId,
      startTime: shifts.startTime,
    }).from(shifts).where(and(
      eq(shifts.workspaceId, workspaceId),
      gte(shifts.startTime, windowStart),
      lte(shifts.startTime, now),
      ne(shifts.status, 'cancelled'),
    ));
    const clockedInNow = await db.select({ employeeId: timeEntries.employeeId })
      .from(timeEntries).where(and(
        eq(timeEntries.workspaceId, workspaceId),
        isNull(timeEntries.clockOut),
        gte(timeEntries.clockIn, windowStart),
      ));
    const clockedInSet = new Set(clockedInNow.map(e => e.employeeId));
    const missed = scheduledNow.filter(s => s.employeeId && !clockedInSet.has(s.employeeId));
    return { flaggedCount: missed.length, missed, toleranceMinutes, checkedAt: now };
  }));

  helpaiOrchestrator.registerAction(mkAction('time.get_weekly_summary', async (params) => {
    const { workspaceId, weekStart: weekStartParam } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const weekStart = weekStartParam ? new Date(weekStartParam) : (() => {
      const d = new Date(); d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); return d;
    })();
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    const entries = await db.select({
      employeeId: timeEntries.employeeId,
      totalMinutes: (timeEntries as any).totalMinutes,
      status: timeEntries.status,
    }).from(timeEntries).where(and(
      eq(timeEntries.workspaceId, workspaceId),
      gte(timeEntries.clockIn, weekStart),
      lte(timeEntries.clockIn, weekEnd),
    )).limit(2000);
    const byEmployee: Record<string, number> = {};
    for (const e of entries) {
      if (!e.employeeId) continue;
      byEmployee[e.employeeId] = (byEmployee[e.employeeId] || 0) + (e.totalMinutes || 0);
    }
    const summary = Object.entries(byEmployee).map(([empId, mins]) => ({ employeeId: empId, totalHours: Math.round(mins / 60 * 100) / 100 }));
    const totalHours = summary.reduce((s, e) => s + e.totalHours, 0);
    return { weekStart, weekEnd, employeeCount: summary.length, totalHours: Math.round(totalHours * 100) / 100, byEmployee: summary };
  }));

  log.info('[Trinity Workspace+Time] Registered 10 workspace.* and time.* platform actions');
}
