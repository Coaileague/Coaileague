import { db } from '../../db';
import { eq, and, gte, lte, lt, isNull, isNotNull, ne, desc, sql, count } from 'drizzle-orm';
import {
  workspaces,
  employees,
  clients,
  shifts,
  timeEntries,
  invoices,
  payrollRuns,
  notifications,
  shiftSwapRequests,
  scheduledBreaks,
  workspaceMembers,
  laborLawRules,
  proposals,
  systemAuditLogs,
} from '@shared/schema';

import { createLogger } from '../../lib/logger';
import { employeeCertifications } from '@shared/schema';
const log = createLogger('workspaceContextService');

export interface WorkspaceContext {
  workspace: {
    id: string;
    name: string;
    companyName: string | null;
    industry: string | null;
    subscriptionTier: string | null;
    createdAt: Date | null;
  };
  workforce: {
    totalEmployees: number;
    activeEmployees: number;
    roles: Record<string, number>;
    memberCount: number;
  };
  clients: {
    totalClients: number;
    activeClients: number;
  };
  scheduling: {
    upcomingShifts: number;
    openShifts: number;
    openShiftsToday: number;
    missedPunchesToday: number;
    shiftsThisWeek: number;
    pendingSwapRequests: number;
    totalHoursThisWeek: number;
  };
  financials: {
    monthlyRevenue: number;
    invoiceCount: number;
    outstandingAmount: number;
    overdueCount: number;
    recentPayrollCount: number;
  };
  compliance: {
    expiringCertifications: number;
    expiredCertifications: number;
    activeRules: number;
  };
  activity: {
    recentActions: number;
    unreadNotifications: number;
  };
  contracts: {
    activeProposals: number;
    pendingSignatures: number;
  };
  summary: string;
}

const CACHE_TTL = 60_000;

class WorkspaceContextServiceImpl {
  private cache: Map<string, { data: WorkspaceContext; expiresAt: number }> = new Map();

  constructor() {
    setInterval(() => this.cleanup(), 30_000);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, val] of this.cache.entries()) {
      if (val.expiresAt < now) this.cache.delete(key);
    }
  }

  invalidate(workspaceId: string) {
    this.cache.delete(workspaceId);
  }

  async getFullContext(workspaceId: string): Promise<WorkspaceContext> {
    const cached = this.cache.get(workspaceId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const ctx = await this.buildContext(workspaceId);
    this.cache.set(workspaceId, { data: ctx, expiresAt: Date.now() + CACHE_TTL });
    return ctx;
  }

  private async buildContext(workspaceId: string): Promise<WorkspaceContext> {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysOut = new Date(now);
    thirtyDaysOut.setDate(now.getDate() + 30);

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const missedPunchThreshold = new Date(now.getTime() - 15 * 60000);
    const missedPunchWindow = new Date(now.getTime() - 4 * 3600000);

    const [
      workspaceRow,
      employeeStats,
      clientStats,
      shiftStats,
      openShiftCount,
      openShiftsTodayCount,
      missedPunchesCount,
      swapStats,
      timeStats,
      invoiceStats,
      payrollStats,
      certStats,
      notifStats,
      proposalStats,
      roleBreakdown,
      memberStats,
      laborRuleCount,
      recentAuditCount,
    ] = await Promise.all([
      db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1).then(r => r[0]),

      db.select({
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where status = 'active')`,
      }).from(employees).where(eq(employees.workspaceId, workspaceId)).then(r => r[0]),

      db.select({
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where is_active = true)`,
      }).from(clients).where(eq(clients.workspaceId, workspaceId)).then(r => r[0]),

      db.select({
        upcoming: sql<number>`count(*) filter (where start_time >= ${now})`,
        thisWeek: sql<number>`count(*) filter (where start_time >= ${startOfWeek} and start_time < ${endOfWeek})`,
      }).from(shifts).where(eq(shifts.workspaceId, workspaceId)).then(r => r[0]),

      db.select({
        count: sql<number>`count(*)`,
      }).from(shifts).where(
        and(
          eq(shifts.workspaceId, workspaceId),
          sql`start_time >= ${now}`,
          sql`employee_id IS NULL`
        )
      ).then(r => r[0]),

      db.select({
        count: sql<number>`count(*)`,
      }).from(shifts).where(
        and(
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.startTime, todayStart),
          lte(shifts.startTime, todayEnd),
          isNull(shifts.employeeId),
          ne(shifts.status, 'cancelled')
        )
      ).then(r => r[0]).catch(() => ({ count: 0 })),

      db.select({
        count: sql<number>`count(*)`,
      }).from(shifts).where(
        and(
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.startTime, missedPunchWindow),
          lte(shifts.startTime, missedPunchThreshold),
          isNotNull(shifts.employeeId),
          ne(shifts.status, 'cancelled'),
          sql`NOT EXISTS (
            SELECT 1 FROM time_entries te
            WHERE te.shift_id = shifts.id
              AND te.clock_in IS NOT NULL
          )`
        )
      ).then(r => r[0]).catch(() => ({ count: 0 })),

      db.select({
        pending: sql<number>`count(*) filter (where status = 'pending')`,
      }).from(shiftSwapRequests).where(eq(shiftSwapRequests.workspaceId, workspaceId)).then(r => r[0]),

      db.select({
        totalHours: sql<number>`coalesce(sum(cast(total_hours as decimal)), 0)`,
      }).from(timeEntries).where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, startOfWeek)
        )
      ).then(r => r[0]),

      db.select({
        monthlyRevenue: sql<number>`coalesce(sum(cast(total as decimal)), 0)`,
        invoiceCount: sql<number>`count(*)`,
        outstanding: sql<number>`coalesce(sum(case when status in ('sent', 'pending', 'overdue') then cast(total as decimal) else 0 end), 0)`,
        overdue: sql<number>`count(*) filter (where status = 'overdue')`,
      }).from(invoices).where(
        and(
          eq(invoices.workspaceId, workspaceId),
          gte(invoices.issueDate, startOfMonth)
        )
      ).then(r => r[0]),

      db.select({
        recent: sql<number>`count(*)`,
      }).from(payrollRuns).where(
        and(
          eq(payrollRuns.workspaceId, workspaceId),
          gte(payrollRuns.createdAt, startOfMonth)
        )
      ).then(r => r[0]),

      db.select({
        expiring: sql<number>`count(*) filter (where expiry_date <= ${thirtyDaysOut} and expiry_date > ${now} and status != 'expired')`,
        expired: sql<number>`count(*) filter (where (expiry_date <= ${now} or status = 'expired'))`,
      }).from(employeeCertifications).where(eq(employeeCertifications.workspaceId, workspaceId)).then(r => r[0]),

      db.select({
        unread: sql<number>`count(*) filter (where read = false)`,
      }).from(notifications).where(eq(notifications.workspaceId, workspaceId)).then(r => r[0]),

      this.getProposalStats(workspaceId),

      this.getRoleBreakdown(workspaceId),

      db.select({
        total: sql<number>`count(*)`,
      }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId)).then(r => r[0]),

      this.getLaborRuleCount(workspaceId),

      this.getRecentAuditCount(workspaceId, startOfWeek),
    ]);

    const ws = workspaceRow || { id: workspaceId, name: 'Unknown', companyName: null, industryDescription: null, subscriptionTier: null, createdAt: null };

    const context: WorkspaceContext = {
      workspace: {
        id: ws.id,
        name: (ws as any).companyName || ws.name,
        companyName: (ws as any).companyName,
        industry: (ws as any).industryDescription || null,
        subscriptionTier: (ws as any).subscriptionTier || null,
        createdAt: (ws as any).createdAt || null,
      },
      workforce: {
        totalEmployees: Number(employeeStats?.total) || 0,
        activeEmployees: Number(employeeStats?.active) || 0,
        roles: roleBreakdown,
        memberCount: Number(memberStats?.total) || 0,
      },
      clients: {
        totalClients: Number(clientStats?.total) || 0,
        activeClients: Number(clientStats?.active) || 0,
      },
      scheduling: {
        upcomingShifts: Number(shiftStats?.upcoming) || 0,
        openShifts: Number(openShiftCount?.count) || 0,
        openShiftsToday: Number(openShiftsTodayCount?.count) || 0,
        missedPunchesToday: Number(missedPunchesCount?.count) || 0,
        shiftsThisWeek: Number(shiftStats?.thisWeek) || 0,
        pendingSwapRequests: Number(swapStats?.pending) || 0,
        totalHoursThisWeek: Number(timeStats?.totalHours) || 0,
      },
      financials: {
        monthlyRevenue: Number(invoiceStats?.monthlyRevenue) || 0,
        invoiceCount: Number(invoiceStats?.invoiceCount) || 0,
        outstandingAmount: Number(invoiceStats?.outstanding) || 0,
        overdueCount: Number(invoiceStats?.overdue) || 0,
        recentPayrollCount: Number(payrollStats?.recent) || 0,
      },
      compliance: {
        expiringCertifications: Number(certStats?.expiring) || 0,
        expiredCertifications: Number(certStats?.expired) || 0,
        activeRules: laborRuleCount,
      },
      activity: {
        recentActions: recentAuditCount,
        unreadNotifications: Number(notifStats?.unread) || 0,
      },
      contracts: {
        activeProposals: proposalStats.active,
        pendingSignatures: proposalStats.pendingSign,
      },
      summary: '',
    };

    context.summary = this.buildSummary(context);
    return context;
  }

  private async getProposalStats(workspaceId: string) {
    try {
      const stats = await db.select({
        active: sql<number>`count(*) filter (where status in ('draft', 'sent', 'under_review'))`,
        pendingSign: sql<number>`count(*) filter (where status = 'accepted')`,
      }).from(proposals).where(and(eq(proposals.workspaceId, workspaceId), eq(proposals.proposalType, 'contract')));
      return { active: Number(stats[0]?.active) || 0, pendingSign: Number(stats[0]?.pendingSign) || 0 };
    } catch {
      return { active: 0, pendingSign: 0 };
    }
  }

  private async getRoleBreakdown(workspaceId: string): Promise<Record<string, number>> {
    try {
      const rows = await db.select({
        role: sql<string>`coalesce(position, 'unassigned')`,
        cnt: sql<number>`count(*)`,
      }).from(employees).where(
        and(eq(employees.workspaceId, workspaceId), sql`status = 'active'`)
      ).groupBy(sql`coalesce(position, 'unassigned')`);
      const roles: Record<string, number> = {};
      for (const r of rows) {
        roles[r.role] = Number(r.cnt);
      }
      return roles;
    } catch {
      return {};
    }
  }

  private async getLaborRuleCount(workspaceId: string): Promise<number> {
    try {
      const [result] = await db.select({
        cnt: sql<number>`count(*)`,
      }).from(laborLawRules).where(eq(laborLawRules.workspaceId, workspaceId));
      return Number(result?.cnt) || 0;
    } catch {
      return 0;
    }
  }

  private async getRecentAuditCount(workspaceId: string, since: Date): Promise<number> {
    try {
      const [result] = await db.select({
        cnt: sql<number>`count(*)`,
      }).from(systemAuditLogs).where(
        and(
          eq(systemAuditLogs.workspaceId, workspaceId),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          gte(systemAuditLogs.timestamp, since)
        )
      );
      return Number(result?.cnt) || 0;
    } catch {
      return 0;
    }
  }

  private buildSummary(ctx: WorkspaceContext): string {
    const lines: string[] = [];
    const ws = ctx.workspace;
    lines.push(`Organization: ${ws.name || ws.companyName || 'Unnamed'}${ws.industry ? ` (${ws.industry})` : ''}, Tier: ${ws.subscriptionTier || 'starter'}`);
    lines.push(`Workforce: ${ctx.workforce.activeEmployees} active of ${ctx.workforce.totalEmployees} employees, ${ctx.workforce.memberCount} workspace members`);

    const roleEntries = Object.entries(ctx.workforce.roles);
    if (roleEntries.length > 0) {
      lines.push(`Roles: ${roleEntries.map(([r, c]) => `${r}: ${c}`).join(', ')}`);
    }

    lines.push(`Clients: ${ctx.clients.activeClients} active of ${ctx.clients.totalClients} total`);
    const todayAlerts: string[] = [];
    if (ctx.scheduling.openShiftsToday > 0) todayAlerts.push(`${ctx.scheduling.openShiftsToday} UNFILLED TODAY`);
    if (ctx.scheduling.missedPunchesToday > 0) todayAlerts.push(`${ctx.scheduling.missedPunchesToday} MISSED PUNCHES`);
    const todayStr = todayAlerts.length > 0 ? ` [⚠ TODAY: ${todayAlerts.join(', ')}]` : '';
    lines.push(`Scheduling: ${ctx.scheduling.shiftsThisWeek} shifts this week, ${ctx.scheduling.openShifts} open/unassigned (${ctx.scheduling.openShiftsToday} open today), ${ctx.scheduling.upcomingShifts} upcoming, ${ctx.scheduling.pendingSwapRequests} swap requests pending${todayStr}`);
    lines.push(`Hours: ${ctx.scheduling.totalHoursThisWeek.toFixed(1)} hours tracked this week`);
    lines.push(`Financials: $${ctx.financials.monthlyRevenue.toFixed(2)} monthly revenue, ${ctx.financials.invoiceCount} invoices, $${ctx.financials.outstandingAmount.toFixed(2)} outstanding, ${ctx.financials.overdueCount} overdue, ${ctx.financials.recentPayrollCount} payroll runs this month`);

    const complianceParts: string[] = [];
    if (ctx.compliance.activeRules > 0) complianceParts.push(`${ctx.compliance.activeRules} labor law rules`);
    if (ctx.compliance.expiredCertifications > 0) complianceParts.push(`${ctx.compliance.expiredCertifications} expired certs`);
    if (ctx.compliance.expiringCertifications > 0) complianceParts.push(`${ctx.compliance.expiringCertifications} expiring within 30 days`);
    if (complianceParts.length > 0) {
      lines.push(`Compliance: ${complianceParts.join(', ')}`);
    }

    if (ctx.contracts.activeProposals > 0 || ctx.contracts.pendingSignatures > 0) {
      lines.push(`Contracts: ${ctx.contracts.activeProposals} active proposals, ${ctx.contracts.pendingSignatures} pending signatures`);
    }

    const activityParts: string[] = [];
    if (ctx.activity.recentActions > 0) activityParts.push(`${ctx.activity.recentActions} audit events this week`);
    if (ctx.activity.unreadNotifications > 0) activityParts.push(`${ctx.activity.unreadNotifications} unread notifications`);
    if (activityParts.length > 0) {
      lines.push(`Activity: ${activityParts.join(', ')}`);
    }

    return lines.join('\n');
  }

  formatForPrompt(ctx: WorkspaceContext): string {
    return `=== WORKSPACE INTELLIGENCE ===\n${ctx.summary}\n=== END WORKSPACE INTELLIGENCE ===`;
  }
}

export const workspaceContextService = new WorkspaceContextServiceImpl();
