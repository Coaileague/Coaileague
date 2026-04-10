/**
 * TRINITY CASH FLOW INTELLIGENCE
 * ==============================
 * The #1 thing that keeps security company owners up at night:
 * showing $50k in receivables but not being able to make Friday payroll
 * because every client is net-30.
 *
 * Trinity watches the gap between:
 *   Receivables due before next payroll date
 *   - Next payroll total
 *   = Cash gap (negative = owner has a problem)
 *
 * She alerts before it becomes a crisis, not after.
 */

import { db } from '../../db';
import { invoices, payrollRuns, workspaceMembers } from '@shared/schema';
import { eq, and, gte, lte, lt, inArray, sql, desc } from 'drizzle-orm';
import { helpaiOrchestrator } from '../helpai/platformActionHub';
// @ts-expect-error — TS migration: fix in refactoring sprint
import type { ActionRequest, ActionResult, ActionHandler } from './actionRegistry';
import { createNotification } from '../notificationService';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityCashFlowActions');

const createResult = (
  actionId: string, success: boolean, message: string,
  data: any, start: number
): ActionResult => ({
  actionId, success, message, data,
  executionTimeMs: Date.now() - start,
  timestamp: new Date().toISOString(),
});

function mkAction(id: string, fn: (req: ActionRequest) => Promise<ActionResult>): ActionHandler {
  return { actionId: id, name: id, category: id.split('.')[0], description: id, requiredRoles: [], handler: fn };
}

// ─── CORE CASH FLOW GAP CALCULATION ──────────────────────────────────────────

async function computeCashFlowGap(workspaceId: string, horizonDays = 14): Promise<{
  upcomingPayroll: number;
  nextPayrollDate: string | null;
  receivablesDueBeforePayroll: number;
  receivablesTotal: number;
  cashGap: number;
  isAtRisk: boolean;
  riskLevel: 'critical' | 'warning' | 'healthy';
  overdueTotal: number;
  agingBuckets: { current: number; days1_30: number; days31_60: number; days61_90: number; days90plus: number };
  details: string;
}> {
  const now = new Date();
  const horizon = new Date(now.getTime() + horizonDays * 86400000);

  // 1. Next upcoming payroll
  const nextPayroll = await db.select({
    id: payrollRuns.id,
    totalNetPay: payrollRuns.totalNetPay,
    disbursementDate: payrollRuns.disbursementDate,
    periodEnd: payrollRuns.periodEnd,
    status: payrollRuns.status,
  }).from(payrollRuns)
    .where(and(
      eq(payrollRuns.workspaceId, workspaceId),
      inArray(payrollRuns.status as any, ['draft', 'pending', 'approved']),
    ))
    .orderBy(payrollRuns.disbursementDate)
    .limit(1)
    .catch(() => []);

  const upcomingPayroll = parseFloat(String((nextPayroll[0] as any)?.totalNetPay || 0));
  const nextPayrollDate = (nextPayroll[0] as any)?.disbursementDate
    ? new Date((nextPayroll[0] as any).disbursementDate).toISOString().split('T')[0]
    : null;

  const payrollCutoff = (nextPayroll[0] as any)?.disbursementDate
    ? new Date((nextPayroll[0] as any).disbursementDate)
    : horizon;

  // 2. Receivables due before payroll date
  const receivablesDue = await db.select({
    total: sql`COALESCE(SUM(CAST(${invoices.total} AS DECIMAL)), 0)`,
  }).from(invoices)
    .where(and(
      eq(invoices.workspaceId, workspaceId),
      inArray(invoices.status as any, ['sent', 'overdue']),
      lte(invoices.dueDate, payrollCutoff),
    ))
    .catch(() => [{ total: 0 }]);

  const receivablesDueBeforePayroll = parseFloat(String((receivablesDue[0] as any)?.total || 0));

  // 3. Total outstanding receivables
  const receivablesAll = await db.select({
    total: sql`COALESCE(SUM(CAST(${invoices.total} AS DECIMAL)), 0)`,
  }).from(invoices)
    .where(and(
      eq(invoices.workspaceId, workspaceId),
      inArray(invoices.status as any, ['sent', 'overdue']),
    ))
    .catch(() => [{ total: 0 }]);

  const receivablesTotal = parseFloat(String((receivablesAll[0] as any)?.total || 0));

  // 4. Overdue total
  const overdueRows = await db.select({
    total: sql`COALESCE(SUM(CAST(${invoices.total} AS DECIMAL)), 0)`,
  }).from(invoices)
    .where(and(
      eq(invoices.workspaceId, workspaceId),
      eq(invoices.status as any, 'overdue'),
    ))
    .catch(() => [{ total: 0 }]);

  const overdueTotal = parseFloat(String((overdueRows[0] as any)?.total || 0));

  // 5. Aging buckets
  const agingQuery = await db.select({
    dueDate: invoices.dueDate,
    total: invoices.total,
    status: invoices.status,
  }).from(invoices)
    .where(and(
      eq(invoices.workspaceId, workspaceId),
      inArray(invoices.status as any, ['sent', 'overdue']),
    ))
    .catch(() => []);

  const agingBuckets = { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0 };
  for (const inv of agingQuery) {
    const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
    const amount = parseFloat(String(inv.total || 0));
    if (!dueDate) { agingBuckets.current += amount; continue; }
    const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
    if (daysOverdue <= 0) agingBuckets.current += amount;
    else if (daysOverdue <= 30) agingBuckets.days1_30 += amount;
    else if (daysOverdue <= 60) agingBuckets.days31_60 += amount;
    else if (daysOverdue <= 90) agingBuckets.days61_90 += amount;
    else agingBuckets.days90plus += amount;
  }

  // 6. Cash gap
  const cashGap = receivablesDueBeforePayroll - upcomingPayroll;

  let riskLevel: 'critical' | 'warning' | 'healthy';
  let details: string;

  if (upcomingPayroll === 0) {
    riskLevel = 'healthy';
    details = `No upcoming payroll found. Total outstanding receivables: $${receivablesTotal.toLocaleString()}.`;
  } else if (cashGap < 0) {
    riskLevel = 'critical';
    details = `CASH GAP ALERT: Upcoming payroll ($${upcomingPayroll.toLocaleString()}) exceeds receivables due before payroll ($${receivablesDueBeforePayroll.toLocaleString()}). Shortfall: $${Math.abs(cashGap).toLocaleString()}. ${overdueTotal > 0 ? `$${overdueTotal.toLocaleString()} already overdue — follow up immediately.` : ''}`;
  } else if (cashGap < upcomingPayroll * 0.2) {
    riskLevel = 'warning';
    details = `Tight cash position: only $${cashGap.toLocaleString()} buffer before payroll${nextPayrollDate ? ' on ' + nextPayrollDate : ''}. Recommend accelerating collections.`;
  } else {
    riskLevel = 'healthy';
    details = `Cash position healthy. $${cashGap.toLocaleString()} buffer above payroll${nextPayrollDate ? ' due ' + nextPayrollDate : ''}.`;
  }

  return {
    upcomingPayroll, nextPayrollDate, receivablesDueBeforePayroll, receivablesTotal,
    cashGap, isAtRisk: cashGap < 0, riskLevel, overdueTotal, agingBuckets, details,
  };
}

// ─── ACTIONS ─────────────────────────────────────────────────────────────────

const cashFlowGapAction = mkAction('billing.cash_flow_gap', async (req) => {
  const start = Date.now();
  try {
    const wid = req.payload?.workspaceId || req.workspaceId;
    if (!wid) return createResult(req.actionId, false, 'workspaceId required', null, start);
    const horizonDays = req.payload?.horizonDays || 14;
    const gap = await computeCashFlowGap(wid, horizonDays);
    return createResult(req.actionId, true, gap.details, gap, start);
  } catch (e: any) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const agingReportAction = mkAction('billing.aging_report_detailed', async (req) => {
  const start = Date.now();
  try {
    const wid = req.payload?.workspaceId || req.workspaceId;
    if (!wid) return createResult(req.actionId, false, 'workspaceId required', null, start);

    const gap = await computeCashFlowGap(wid, 30);
    const invoiceRows = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      clientId: invoices.clientId,
      total: invoices.total,
      dueDate: invoices.dueDate,
      status: invoices.status,
      issueDate: invoices.issueDate,
    }).from(invoices)
      .where(and(eq(invoices.workspaceId, wid), inArray(invoices.status as any, ['sent', 'overdue'])))
      .orderBy(invoices.dueDate)
      .catch(() => []);

    const now = new Date();
    const agingDetail = invoiceRows.map(inv => {
      const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
      const daysOverdue = dueDate ? Math.floor((now.getTime() - dueDate.getTime()) / 86400000) : 0;
      return {
        invoiceNumber: inv.invoiceNumber,
        clientId: inv.clientId,
        total: parseFloat(String(inv.total || 0)),
        dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : null,
        status: inv.status,
        daysOverdue: Math.max(0, daysOverdue),
        agingBucket: daysOverdue <= 0 ? 'current' : daysOverdue <= 30 ? '1-30 days' : daysOverdue <= 60 ? '31-60 days' : daysOverdue <= 90 ? '61-90 days' : '90+ days',
      };
    });

    const summary = `Aging report: ${agingDetail.length} outstanding invoices. Current: $${gap.agingBuckets.current.toLocaleString()}, 1-30d: $${gap.agingBuckets.days1_30.toLocaleString()}, 31-60d: $${gap.agingBuckets.days31_60.toLocaleString()}, 61-90d: $${gap.agingBuckets.days61_90.toLocaleString()}, 90+d: $${gap.agingBuckets.days90plus.toLocaleString()}. Total outstanding: $${gap.receivablesTotal.toLocaleString()}.`;

    return createResult(req.actionId, true, summary, { invoices: agingDetail, buckets: gap.agingBuckets, totalOutstanding: gap.receivablesTotal }, start);
  } catch (e: any) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const payrollCashReadiness = mkAction('billing.payroll_cash_readiness', async (req) => {
  const start = Date.now();
  try {
    const wid = req.payload?.workspaceId || req.workspaceId;
    if (!wid) return createResult(req.actionId, false, 'workspaceId required', null, start);

    const gap = await computeCashFlowGap(wid, 7);

    let readinessLevel = 'READY';
    let recommendation = '';

    if (gap.riskLevel === 'critical') {
      readinessLevel = 'NOT READY — CRISIS';
      recommendation = `Immediate action required: Contact top ${Math.min(3, Math.ceil(gap.overdueTotal / 5000))} overdue clients for payment. Consider line of credit. Shortfall: $${Math.abs(gap.cashGap).toLocaleString()}.`;

      const owners = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, wid), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner')`)).catch(() => []);
      for (const owner of owners) {
        await createNotification({
          workspaceId: wid, userId: owner.userId, type: 'alert',
          title: '⚠️ PAYROLL CASH ALERT — Action Required',
          message: `Trinity detected a payroll cash shortfall of $${Math.abs(gap.cashGap).toLocaleString()}. Receivables due before payroll: $${gap.receivablesDueBeforePayroll.toLocaleString()}. Payroll due: $${gap.upcomingPayroll.toLocaleString()}${gap.nextPayrollDate ? ' on ' + gap.nextPayrollDate : ''}. Immediate collections follow-up required.`,
          priority: 'urgent',
        } as any).catch(() => null);
      }
    } else if (gap.riskLevel === 'warning') {
      readinessLevel = 'AT RISK — MONITOR CLOSELY';
      recommendation = `Follow up on outstanding invoices. Buffer is thin ($${gap.cashGap.toLocaleString()}). Send payment reminders today.`;
    } else {
      recommendation = `Payroll funded. Maintain collection cadence on outstanding receivables.`;
    }

    return createResult(req.actionId, true,
      `Payroll readiness: ${readinessLevel}. ${recommendation}`,
      { ...gap, readinessLevel, recommendation }, start);
  } catch (e: any) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const receivablesCollectionPriority = mkAction('billing.collection_priority', async (req) => {
  const start = Date.now();
  try {
    const wid = req.payload?.workspaceId || req.workspaceId;
    if (!wid) return createResult(req.actionId, false, 'workspaceId required', null, start);

    const invoiceRows = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      clientId: invoices.clientId,
      total: invoices.total,
      dueDate: invoices.dueDate,
      status: invoices.status,
    }).from(invoices)
      .where(and(eq(invoices.workspaceId, wid), inArray(invoices.status as any, ['sent', 'overdue'])))
      .orderBy(invoices.dueDate)
      .limit(20)
      .catch(() => []);

    const now = new Date();
    const prioritized = invoiceRows
      .map(inv => {
        const amount = parseFloat(String(inv.total || 0));
        const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
        const daysOverdue = dueDate ? Math.floor((now.getTime() - dueDate.getTime()) / 86400000) : 0;
        const priorityScore = (daysOverdue > 0 ? daysOverdue * 2 : 0) + (amount / 100);
        return { invoiceNumber: inv.invoiceNumber, clientId: inv.clientId, amount, daysOverdue: Math.max(0, daysOverdue), priorityScore, status: inv.status, dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : null };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 10);

    const total = prioritized.reduce((s, i) => s + i.amount, 0);
    return createResult(req.actionId, true,
      `Top ${prioritized.length} collection priorities — $${total.toLocaleString()} recoverable. Call the oldest/largest first.`,
      { priorities: prioritized, totalRecoverable: total }, start);
  } catch (e: any) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const revenueForecast = mkAction('billing.revenue_forecast', async (req) => {
  const start = Date.now();
  try {
    const wid = req.payload?.workspaceId || req.workspaceId;
    if (!wid) return createResult(req.actionId, false, 'workspaceId required', null, start);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);

    const lastMonth = await db.select({ total: sql`COALESCE(SUM(CAST(${invoices.total} AS DECIMAL)), 0)` })
      .from(invoices)
      .where(and(eq(invoices.workspaceId, wid), inArray(invoices.status as any, ['paid']), gte(invoices.paidAt, thirtyDaysAgo)))
      .catch(() => [{ total: 0 }]);

    const priorMonth = await db.select({ total: sql`COALESCE(SUM(CAST(${invoices.total} AS DECIMAL)), 0)` })
      .from(invoices)
      .where(and(eq(invoices.workspaceId, wid), inArray(invoices.status as any, ['paid']), gte(invoices.paidAt, sixtyDaysAgo), lt(invoices.paidAt, thirtyDaysAgo)))
      .catch(() => [{ total: 0 }]);

    const lastMonthRevenue = parseFloat(String((lastMonth[0] as any)?.total || 0));
    const priorMonthRevenue = parseFloat(String((priorMonth[0] as any)?.total || 0));
    const trend = priorMonthRevenue > 0 ? ((lastMonthRevenue - priorMonthRevenue) / priorMonthRevenue) * 100 : 0;
    const forecastNext30 = lastMonthRevenue * (1 + Math.max(-0.1, Math.min(0.2, trend / 100)));

    return createResult(req.actionId, true,
      `Revenue forecast: Last 30 days $${lastMonthRevenue.toLocaleString()}, prior 30 days $${priorMonthRevenue.toLocaleString()} (${trend >= 0 ? '+' : ''}${trend.toFixed(1)}% trend). Projected next 30 days: $${Math.round(forecastNext30).toLocaleString()}.`,
      { lastMonthRevenue, priorMonthRevenue, trendPercent: trend, forecastNext30: Math.round(forecastNext30) }, start);
  } catch (e: any) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

const quickCashSummary = mkAction('billing.quick_cash_summary', async (req) => {
  const start = Date.now();
  try {
    const wid = req.payload?.workspaceId || req.workspaceId;
    if (!wid) return createResult(req.actionId, false, 'workspaceId required', null, start);

    const [gap, forecast] = await Promise.all([
      computeCashFlowGap(wid, 14),
      (async () => {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
        const row = await db.select({ total: sql`COALESCE(SUM(CAST(${invoices.total} AS DECIMAL)), 0)` })
          .from(invoices)
          .where(and(eq(invoices.workspaceId, wid), eq(invoices.status as any, 'paid'), gte(invoices.paidAt, thirtyDaysAgo)))
          .catch(() => [{ total: 0 }]);
        return parseFloat(String((row[0] as any)?.total || 0));
      })(),
    ]);

    const statusIcon = gap.riskLevel === 'critical' ? '🔴' : gap.riskLevel === 'warning' ? '🟡' : '🟢';
    const summary = `${statusIcon} Cash Summary — ${gap.riskLevel.toUpperCase()}\n• Outstanding receivables: $${gap.receivablesTotal.toLocaleString()}\n• Overdue: $${gap.overdueTotal.toLocaleString()}\n• Next payroll: $${gap.upcomingPayroll.toLocaleString()}${gap.nextPayrollDate ? ' (' + gap.nextPayrollDate + ')' : ''}\n• Cash gap (receivables vs payroll): ${gap.cashGap >= 0 ? '+' : ''}$${gap.cashGap.toLocaleString()}\n• Last 30d collected: $${forecast.toLocaleString()}`;

    return createResult(req.actionId, true, summary, { ...gap, collected30d: forecast }, start);
  } catch (e: any) {
    return createResult(req.actionId, false, e.message, null, start);
  }
});

// Export the compute function for use in proactive scanner
export { computeCashFlowGap };

export function registerCashFlowActions(): void {
  const actions = [
    cashFlowGapAction,
    agingReportAction,
    payrollCashReadiness,
    receivablesCollectionPriority,
    revenueForecast,
    quickCashSummary,
  ];
  actions.forEach(a => helpaiOrchestrator.registerAction(a));
  log.info(`[Trinity Cash Flow Intelligence] Registered ${actions.length} cash flow + financial intelligence actions`);
}
