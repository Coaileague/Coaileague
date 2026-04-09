/**
 * TRINITY ORG CONTEXT BUILDER
 * ============================
 * Builds a comprehensive, parallel-fetched snapshot of a workspace's
 * organisational state for injection into Trinity AI sessions.
 *
 * This is the single source-of-truth for what Trinity "knows" about the org
 * at the start of every conversation. All fetches run in parallel for speed.
 *
 * Usage:
 *   const ctx = await trinityOrgContextBuilder.buildTrinityOrgContext(workspaceId);
 *   // ctx.summary — plain-English narrative for injection into system prompt
 *   // ctx.raw     — structured data for function-call responses
 */

import { db } from '../../db';
import {
  workspaces,
  employees,
  clients,
  shifts,
  invoices,
  payrollRuns,
  timeEntries,
  orgDocuments,
  securityIncidents,
  complianceScores,
  systemAuditLogs,
  proposals,
} from '@shared/schema';
import { eq, and, gte, lte, lt, isNull, isNotNull, desc, sql, count, sum } from 'drizzle-orm';
import { subDays, subMonths, startOfMonth, endOfMonth } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TrinityOrgContext {
  workspaceId: string;
  generatedAt: Date;
  raw: TrinityOrgContextRaw;
  summary: string;
}

export interface TrinityOrgContextRaw {
  workspace: WorkspaceSnap;
  workforce: WorkforceSnap;
  scheduling: SchedulingSnap;
  financials: FinancialsSnap;
  clients: ClientsSnap;
  compliance: ComplianceSnap;
  documents: DocumentsSnap;
  incidents: IncidentsSnap;
  activity: ActivitySnap;
}

interface WorkspaceSnap {
  id: string;
  name: string;
  companyName: string | null;
  industry: string | null;
  subscriptionTier: string | null;
  metadata: Record<string, any>;
  lastLLCComplianceMeeting: string | null;
}

interface WorkforceSnap {
  totalEmployees: number;
  activeEmployees: number;
  roleBreakdown: Record<string, number>;
  recentHires: number;
  expiringCerts: number;
}

interface SchedulingSnap {
  upcomingShiftsNext7d: number;
  openShifts: number;
  shiftsThisWeek: number;
  activeShifts: number;
  overtimeAlerts: number;
  missedPunchesLast24h: number;
  forceClockLast7d: number;
}

interface FinancialsSnap {
  monthlyRevenue: number;
  outstandingInvoices: number;
  overdueInvoices: number;
  overdueAmount: number;
  recentPayrolls: number;
  totalPayrollLast30d: number;
  activeProposals: number;
}

interface ClientsSnap {
  totalClients: number;
  activeClients: number;
  clientsWithActiveContract: number;
}

interface ComplianceSnap {
  overallScore: number | null;
  lastLLCComplianceMeeting: string | null;
  daysUntilLLCOverdue: number | null;
  openIncidents: number;
  criticalIncidents: number;
}

interface DocumentsSnap {
  totalDocuments: number;
  recentDocuments: number;
  forceClockReports: number;
  meetingMinutes: number;
}

interface IncidentsSnap {
  openIncidents: number;
  resolvedLast30d: number;
  criticalOpen: number;
  unresolvedOlderThan7d: number;
}

interface ActivitySnap {
  recentAuditEvents: number;
  actionsLast24h: number;
}

// ── Cache ──────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 90_000; // 90 seconds
const contextCache = new Map<string, { data: TrinityOrgContext; expiresAt: number }>();

// ── Builder ────────────────────────────────────────────────────────────────────

class TrinityOrgContextBuilder {
  private static instance: TrinityOrgContextBuilder;

  static getInstance(): TrinityOrgContextBuilder {
    if (!TrinityOrgContextBuilder.instance) {
      TrinityOrgContextBuilder.instance = new TrinityOrgContextBuilder();
      setInterval(() => TrinityOrgContextBuilder.instance.pruneCache(), 60_000);
    }
    return TrinityOrgContextBuilder.instance;
  }

  private pruneCache() {
    const now = Date.now();
    for (const [k, v] of contextCache) {
      if (v.expiresAt < now) contextCache.delete(k);
    }
  }

  /**
   * Build (or return cached) full org context for a workspace.
   */
  async buildTrinityOrgContext(workspaceId: string): Promise<TrinityOrgContext> {
    const cached = contextCache.get(workspaceId);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const ctx = await this.fetchAll(workspaceId);
    contextCache.set(workspaceId, { data: ctx, expiresAt: Date.now() + CACHE_TTL_MS });
    return ctx;
  }

  /** Force-invalidate cache for a workspace (call after mutations). */
  invalidate(workspaceId: string) {
    contextCache.delete(workspaceId);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async fetchAll(workspaceId: string): Promise<TrinityOrgContext> {
    const now = new Date();
    const d7 = subDays(now, 7);
    const d30 = subDays(now, 30);
    const d365 = subDays(now, 365);
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    // ── All fetches run in parallel ─────────────────────────────────────────
    const [
      workspaceRow,
      employeeRows,
      shiftCounts,
      activeShiftCount,
      missedPunchCount,
      forceClockCount,
      invoiceRows,
      payrollRows,
      clientRows,
      proposalRows,
      complianceRow,
      docRows,
      incidentRows,
      auditCount,
    ] = await Promise.all([
      // workspace
      db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1),

      // employees
      db.select({
        isActive: employees.isActive,
        workspaceRole: employees.workspaceRole,
        createdAt: employees.createdAt,
      }).from(employees).where(eq(employees.workspaceId, workspaceId)),

      // shift summary
      db.select({ count: count() }).from(shifts).where(
        and(
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.startTime, now),
          lte(shifts.startTime, subDays(subDays(now, -7), 0))
        )
      ),

      // active shifts
      db.select({ count: count() }).from(timeEntries).where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          isNotNull(timeEntries.clockIn),
          isNull(timeEntries.clockOut)
        )
      ),

      // missed punches last 24h (clocked in > 12h ago, not clocked out)
      db.select({ count: count() }).from(timeEntries).where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          isNull(timeEntries.clockOut),
          lte(timeEntries.clockIn, subDays(now, 0.5))
        )
      ),

      // force clocks last 7d
      db.select({ count: count() }).from(timeEntries).where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          eq(timeEntries.trinityAssistedClockin, true),
          gte(timeEntries.clockIn, d7)
        )
      ),

      // invoices this month
      db.select({
        status: invoices.status,
        totalAmount: invoices.total,
        dueDate: invoices.dueDate,
      }).from(invoices).where(
        and(
          eq(invoices.workspaceId, workspaceId),
          gte(invoices.createdAt, monthStart)
        )
      ),

      // payroll last 30d
      db.select({ totalAmount: payrollRuns.totalGrossPay }).from(payrollRuns).where(
        and(
          eq(payrollRuns.workspaceId, workspaceId),
          gte(payrollRuns.createdAt, d30)
        )
      ),

      // clients
      db.select({ isActive: clients.isActive, clientOnboardingStatus: clients.clientOnboardingStatus }).from(clients).where(
        eq(clients.workspaceId, workspaceId)
      ),

      // proposals
      db.select({ status: proposals.status }).from(proposals).where(
        eq(proposals.workspaceId, workspaceId)
      ),

      // compliance scores (most recent)
      db.select({ overallScore: complianceScores.overallScore }).from(complianceScores).where(
        eq(complianceScores.workspaceId, workspaceId)
      ).orderBy(desc(complianceScores.createdAt)).limit(1),

      // documents
      db.select({ category: orgDocuments.category, createdAt: orgDocuments.createdAt }).from(orgDocuments).where(
        and(eq(orgDocuments.workspaceId, workspaceId), eq(orgDocuments.isActive, true))
      ),

      // incidents
      db.select({ status: securityIncidents.status, severity: securityIncidents.severity, createdAt: securityIncidents.createdAt }).from(securityIncidents).where(
        eq(securityIncidents.workspaceId, workspaceId)
      ),

      // audit events last 24h
      db.select({ count: count() }).from(systemAuditLogs).where(
        and(
          eq(systemAuditLogs.workspaceId, workspaceId),
          gte(systemAuditLogs.createdAt, subDays(now, 1))
        )
      ),
    ]);

    // ── Assemble workspace snap ─────────────────────────────────────────────
    const ws = workspaceRow[0];
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const wsMeta = (ws?.metadata as Record<string, any>) || {};
    const lastLLCDate = wsMeta.lastLLCComplianceMeeting as string | undefined;
    let daysUntilLLCOverdue: number | null = null;
    if (lastLLCDate) {
      const lastDate = new Date(lastLLCDate);
      const daysSince = Math.floor((now.getTime() - lastDate.getTime()) / 86400000);
      daysUntilLLCOverdue = 365 - daysSince;
    }

    const workspaceSnap: WorkspaceSnap = {
      id: workspaceId,
      name: ws?.name || 'Unknown',
      companyName: ws?.companyName || null,
      industry: (ws as any)?.industry || null,
      subscriptionTier: (ws as any)?.subscriptionTier || null,
      metadata: wsMeta,
      lastLLCComplianceMeeting: lastLLCDate || null,
    };

    // ── Workforce ───────────────────────────────────────────────────────────
    const activeEmps = employeeRows.filter(e => e.isActive);
    const roleBreakdown: Record<string, number> = {};
    for (const e of activeEmps) {
      const role = e.workspaceRole || 'unknown';
      roleBreakdown[role] = (roleBreakdown[role] || 0) + 1;
    }
    const recentHires = employeeRows.filter(e => e.createdAt && new Date(e.createdAt) >= d30).length;

    const workforceSnap: WorkforceSnap = {
      totalEmployees: employeeRows.length,
      activeEmployees: activeEmps.length,
      roleBreakdown,
      recentHires,
      expiringCerts: 0, // Populated below if certifications table is available
    };

    // ── Scheduling ──────────────────────────────────────────────────────────
    const schedulingSnap: SchedulingSnap = {
      upcomingShiftsNext7d: shiftCounts[0]?.count ?? 0,
      openShifts: 0,
      shiftsThisWeek: shiftCounts[0]?.count ?? 0,
      activeShifts: activeShiftCount[0]?.count ?? 0,
      overtimeAlerts: 0,
      missedPunchesLast24h: missedPunchCount[0]?.count ?? 0,
      forceClockLast7d: forceClockCount[0]?.count ?? 0,
    };

    // ── Financials ──────────────────────────────────────────────────────────
    const paidInvoices = invoiceRows.filter(i => i.status === 'paid');
    const overdueInvoices = invoiceRows.filter(i => i.status === 'overdue' || (i.status !== 'paid' && i.dueDate && new Date(i.dueDate) < now));
    const outstandingInvoices = invoiceRows.filter(i => i.status !== 'paid' && i.status !== 'void');
    const monthlyRevenue = paidInvoices.reduce((acc, i) => acc + parseFloat(String(i.totalAmount || 0)), 0);
    const overdueAmount = overdueInvoices.reduce((acc, i) => acc + parseFloat(String(i.totalAmount || 0)), 0);
    const totalPayrollLast30d = payrollRows.reduce((acc, p) => acc + parseFloat(String(p.totalAmount || 0)), 0);

    const financialsSnap: FinancialsSnap = {
      monthlyRevenue,
      outstandingInvoices: outstandingInvoices.length,
      overdueInvoices: overdueInvoices.length,
      overdueAmount,
      recentPayrolls: payrollRows.length,
      totalPayrollLast30d,
      activeProposals: proposalRows.filter(p => p.status === 'sent' || p.status === 'pending').length,
    };

    // ── Clients ─────────────────────────────────────────────────────────────
    const activeClients = clientRows.filter(c => c.isActive === true);
    const clientsSnap: ClientsSnap = {
      totalClients: clientRows.length,
      activeClients: activeClients.length,
      clientsWithActiveContract: activeClients.length,
    };

    // ── Compliance ──────────────────────────────────────────────────────────
    const openIncidents = incidentRows.filter(i => i.status === 'open' || i.status === 'investigating');
    const criticalIncidents = openIncidents.filter(i => i.severity === 'critical' || i.severity === 'high');

    const complianceSnap: ComplianceSnap = {
      overallScore: complianceRow[0]?.overallScore ? parseFloat(String(complianceRow[0].overallScore)) : null,
      lastLLCComplianceMeeting: lastLLCDate || null,
      daysUntilLLCOverdue,
      openIncidents: openIncidents.length,
      criticalIncidents: criticalIncidents.length,
    };

    // ── Documents ───────────────────────────────────────────────────────────
    const recentDocs = docRows.filter(d => d.createdAt && new Date(d.createdAt) >= d30);
    const docsSnap: DocumentsSnap = {
      totalDocuments: docRows.length,
      recentDocuments: recentDocs.length,
      forceClockReports: docRows.filter(d => d.category === 'force_clock_reports').length,
      meetingMinutes: docRows.filter(d => d.category === 'meeting_minutes' || d.category === 'meetings').length,
    };

    // ── Incidents ───────────────────────────────────────────────────────────
    const resolvedLast30d = incidentRows.filter(i =>
      (i.status === 'resolved' || i.status === 'closed') &&
      i.createdAt && new Date(i.createdAt) >= d30
    );
    const unresolvedOlderThan7d = openIncidents.filter(i =>
      i.createdAt && new Date(i.createdAt) < d7
    );

    const incidentsSnap: IncidentsSnap = {
      openIncidents: openIncidents.length,
      resolvedLast30d: resolvedLast30d.length,
      criticalOpen: criticalIncidents.length,
      unresolvedOlderThan7d: unresolvedOlderThan7d.length,
    };

    // ── Activity ────────────────────────────────────────────────────────────
    const activitySnap: ActivitySnap = {
      recentAuditEvents: auditCount[0]?.count ?? 0,
      actionsLast24h: auditCount[0]?.count ?? 0,
    };

    const raw: TrinityOrgContextRaw = {
      workspace: workspaceSnap,
      workforce: workforceSnap,
      scheduling: schedulingSnap,
      financials: financialsSnap,
      clients: clientsSnap,
      compliance: complianceSnap,
      documents: docsSnap,
      incidents: incidentsSnap,
      activity: activitySnap,
    };

    const summary = this.buildSummary(raw);

    return {
      workspaceId,
      generatedAt: now,
      raw,
      summary,
    };
  }

  private buildSummary(raw: TrinityOrgContextRaw): string {
    const { workspace, workforce, scheduling, financials, clients, compliance, incidents } = raw;
    const lines: string[] = [];

    lines.push(`You are assisting ${workspace.companyName || workspace.name}, a security guard company.`);
    lines.push(`Workforce: ${workforce.activeEmployees} active employees (${workforce.totalEmployees} total). Roles: ${Object.entries(workforce.roleBreakdown).map(([r, n]) => `${n} ${r}`).join(', ')}.`);

    if (workforce.recentHires > 0) {
      lines.push(`${workforce.recentHires} new hire(s) in the past 30 days.`);
    }

    lines.push(`Clients: ${clients.activeClients} active out of ${clients.totalClients} total.`);

    lines.push(`Scheduling: ${scheduling.activeShifts} shifts currently active. ${scheduling.forceClockLast7d} force clocks in the past 7 days.`);

    if (scheduling.missedPunchesLast24h > 0) {
      lines.push(`ALERT: ${scheduling.missedPunchesLast24h} officer(s) clocked in but have not clocked out in the past 12+ hours.`);
    }

    lines.push(`Financials: $${financials.monthlyRevenue.toFixed(0)} collected this month. ${financials.overdueInvoices} overdue invoice(s) totalling $${financials.overdueAmount.toFixed(0)}.`);

    if (financials.activeProposals > 0) {
      lines.push(`${financials.activeProposals} active proposal(s) pending client response.`);
    }

    if (compliance.overallScore !== null) {
      lines.push(`Compliance score: ${compliance.overallScore}%.`);
    }

    if (compliance.lastLLCComplianceMeeting) {
      if (compliance.daysUntilLLCOverdue !== null && compliance.daysUntilLLCOverdue < 60) {
        lines.push(`LLC compliance meeting due in ${compliance.daysUntilLLCOverdue} day(s) — schedule soon.`);
      } else {
        lines.push(`Last LLC compliance meeting: ${compliance.lastLLCComplianceMeeting}.`);
      }
    } else {
      lines.push(`No LLC compliance meeting recorded — recommend scheduling one immediately.`);
    }

    if (incidents.openIncidents > 0) {
      lines.push(`${incidents.openIncidents} open incident(s)${incidents.criticalOpen > 0 ? ` including ${incidents.criticalOpen} critical` : ''}.`);
    }

    if (incidents.unresolvedOlderThan7d > 0) {
      lines.push(`WARNING: ${incidents.unresolvedOlderThan7d} incident(s) open for more than 7 days without resolution.`);
    }

    return lines.join(' ');
  }
}

export const trinityOrgContextBuilder = TrinityOrgContextBuilder.getInstance();
