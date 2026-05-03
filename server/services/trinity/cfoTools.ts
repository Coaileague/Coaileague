/**
 * Trinity CFO Tools
 * ─────────────────────────────────────────────────────────────────────────────
 * Read-only financial reasoning helpers Trinity calls when the operator asks
 * about the company's health: margin, AR days, cash runway, P&L, expense
 * trend, client profitability, and the consolidated company-health briefing.
 *
 * These are PURE READS — they never mutate state. Trinity uses them to think
 * in income-vs-expense terms and to surface data-grounded recommendations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from '../../db';
import { and, eq, gte, lte, sql, desc } from 'drizzle-orm';
import {
  invoices,
  invoicePayments,
  expenses,
  payrollRuns,
  clients,
  timeEntries,
} from '@shared/schema';
import { createLogger } from '../../lib/logger';

const log = createLogger('CfoTools');

// ─── Common helpers ──────────────────────────────────────────────────────────

const num = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  const parsed = parseFloat(String(v));
  return isNaN(parsed) ? 0 : parsed;
};

interface PeriodInput { workspaceId: string; startDate: Date; endDate: Date }

function defaultPeriod(): { startDate: Date; endDate: Date } {
  const now = new Date();
  return {
    startDate: new Date(now.getFullYear(), now.getMonth(), 1),
    endDate: now,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. monthlyPnL — gross revenue, direct labor, expenses, net income, margin
// ═════════════════════════════════════════════════════════════════════════════

export interface PnL {
  startDate: string;
  endDate: string;
  grossRevenue: number;
  directLabor: number;
  operatingExpenses: number;
  grossProfit: number;
  netIncome: number;
  grossMarginPct: number;
  netMarginPct: number;
  isProfitable: boolean;
}

export async function monthlyPnL(input: PeriodInput): Promise<PnL> {
  const { workspaceId, startDate, endDate } = input;

  const revRows = await db.select({
    total: sql<string>`COALESCE(SUM(${invoices.total}::numeric), 0)`,
  }).from(invoices).where(and(
    eq(invoices.workspaceId, workspaceId),
    gte(invoices.issueDate, startDate),
    lte(invoices.issueDate, endDate),
    sql`${invoices.status} NOT IN ('void', 'cancelled', 'draft')`,
  ));
  const grossRevenue = num(revRows[0]?.total);

  const payRows = await db.select({
    total: sql<string>`COALESCE(SUM(${payrollRuns.totalNetPay}::numeric), 0)`,
  }).from(payrollRuns).where(and(
    eq(payrollRuns.workspaceId, workspaceId),
    gte(payrollRuns.periodStart, startDate),
    lte(payrollRuns.periodEnd, endDate),
  ));
  const directLabor = num(payRows[0]?.total);

  const expRows = await db.select({
    total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)`,
  }).from(expenses).where(and(
    eq(expenses.workspaceId, workspaceId),
    gte(expenses.expenseDate, startDate),
    lte(expenses.expenseDate, endDate),
  ));
  const operatingExpenses = num(expRows[0]?.total);

  const grossProfit = grossRevenue - directLabor;
  const netIncome = grossProfit - operatingExpenses;
  const grossMarginPct = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;
  const netMarginPct = grossRevenue > 0 ? (netIncome / grossRevenue) * 100 : 0;

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    grossRevenue,
    directLabor,
    operatingExpenses,
    grossProfit,
    netIncome,
    grossMarginPct,
    netMarginPct,
    isProfitable: netIncome > 0,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. arDays — Days Sales Outstanding (DSO) and bucket counts
// ═════════════════════════════════════════════════════════════════════════════

export interface ArDays {
  dso: number;
  outstandingTotal: number;
  invoiceCount: number;
  bucketCounts: { current: number; '0-30': number; '31-60': number; '61-90': number; '90+': number };
  bucketAmounts: { current: number; '0-30': number; '31-60': number; '61-90': number; '90+': number };
}

export async function arDays(workspaceId: string): Promise<ArDays> {
  const open = await db.select().from(invoices).where(and(
    eq(invoices.workspaceId, workspaceId),
    sql`${invoices.status} NOT IN ('paid', 'void', 'cancelled')`,
  ));

  const now = new Date();
  const buckets = {
    current: { count: 0, total: 0, ageDays: 0 },
    '0-30': { count: 0, total: 0, ageDays: 0 },
    '31-60': { count: 0, total: 0, ageDays: 0 },
    '61-90': { count: 0, total: 0, ageDays: 0 },
    '90+': { count: 0, total: 0, ageDays: 0 },
  };

  let outstandingTotal = 0;
  let weightedDays = 0;

  for (const inv of open) {
    const due = inv.dueDate ? new Date(inv.dueDate) : (inv.issueDate ? new Date(inv.issueDate) : now);
    const daysLate = Math.floor((now.getTime() - due.getTime()) / 86_400_000);
    const owed = num(inv.total) - num(inv.amountPaid);
    if (owed <= 0) continue;
    outstandingTotal += owed;
    weightedDays += owed * Math.max(0, daysLate);

    let key: keyof typeof buckets;
    if (daysLate <= 0) key = 'current';
    else if (daysLate <= 30) key = '0-30';
    else if (daysLate <= 60) key = '31-60';
    else if (daysLate <= 90) key = '61-90';
    else key = '90+';
    buckets[key].count += 1;
    buckets[key].total += owed;
  }

  const dso = outstandingTotal > 0 ? weightedDays / outstandingTotal : 0;

  return {
    dso,
    outstandingTotal,
    invoiceCount: open.length,
    bucketCounts: {
      current: buckets.current.count,
      '0-30': buckets['0-30'].count,
      '31-60': buckets['31-60'].count,
      '61-90': buckets['61-90'].count,
      '90+': buckets['90+'].count,
    },
    bucketAmounts: {
      current: buckets.current.total,
      '0-30': buckets['0-30'].total,
      '31-60': buckets['31-60'].total,
      '61-90': buckets['61-90'].total,
      '90+': buckets['90+'].total,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. cashRunway — burn rate vs cash on hand → days remaining
// ═════════════════════════════════════════════════════════════════════════════

export interface CashRunway {
  estimatedCashOnHand: number;
  monthlyBurnRate: number;
  monthlyInflow: number;
  netMonthlyBurn: number;
  runwayDays: number | null;
  runwayMonths: number | null;
  status: 'healthy' | 'tight' | 'critical' | 'positive';
}

export async function cashRunway(workspaceId: string): Promise<CashRunway> {
  const now = new Date();
  const ninety = new Date(now.getTime() - 90 * 86_400_000);

  // Lifetime cash in (succeeded payments)
  const allPay = await db.select({
    total: sql<string>`COALESCE(SUM(${invoicePayments.amount}::numeric), 0)`,
  }).from(invoicePayments).where(and(
    eq(invoicePayments.workspaceId, workspaceId),
    eq(invoicePayments.status, 'succeeded'),
  ));

  // Lifetime expenses + payroll
  const allExp = await db.select({
    total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)`,
  }).from(expenses).where(eq(expenses.workspaceId, workspaceId));

  const allPayroll = await db.select({
    total: sql<string>`COALESCE(SUM(${payrollRuns.totalNetPay}::numeric), 0)`,
  }).from(payrollRuns).where(eq(payrollRuns.workspaceId, workspaceId));

  const estimatedCashOnHand = num(allPay[0]?.total) - num(allExp[0]?.total) - num(allPayroll[0]?.total);

  // Trailing-90-day inflow & burn → monthly average
  const ninetyPay = await db.select({
    total: sql<string>`COALESCE(SUM(${invoicePayments.amount}::numeric), 0)`,
  }).from(invoicePayments).where(and(
    eq(invoicePayments.workspaceId, workspaceId),
    eq(invoicePayments.status, 'succeeded'),
    gte(invoicePayments.paidAt, ninety),
  ));
  const ninetyExp = await db.select({
    total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)`,
  }).from(expenses).where(and(
    eq(expenses.workspaceId, workspaceId),
    gte(expenses.expenseDate, ninety),
  ));
  const ninetyPayroll = await db.select({
    total: sql<string>`COALESCE(SUM(${payrollRuns.totalNetPay}::numeric), 0)`,
  }).from(payrollRuns).where(and(
    eq(payrollRuns.workspaceId, workspaceId),
    gte(payrollRuns.processedAt, ninety),
  ));

  const monthlyInflow = num(ninetyPay[0]?.total) / 3;
  const monthlyBurnRate = (num(ninetyExp[0]?.total) + num(ninetyPayroll[0]?.total)) / 3;
  const netMonthlyBurn = monthlyBurnRate - monthlyInflow;

  let runwayDays: number | null = null;
  let runwayMonths: number | null = null;
  let status: CashRunway['status'] = 'healthy';

  if (netMonthlyBurn <= 0) {
    status = 'positive';
  } else if (estimatedCashOnHand > 0) {
    runwayMonths = estimatedCashOnHand / netMonthlyBurn;
    runwayDays = runwayMonths * 30;
    if (runwayMonths < 2) status = 'critical';
    else if (runwayMonths < 6) status = 'tight';
  } else {
    status = 'critical';
    runwayDays = 0;
    runwayMonths = 0;
  }

  return {
    estimatedCashOnHand,
    monthlyBurnRate,
    monthlyInflow,
    netMonthlyBurn,
    runwayDays,
    runwayMonths,
    status,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. computeMargin — overall and by-client margin (revenue vs payable labor)
// ═════════════════════════════════════════════════════════════════════════════

export interface ClientMargin {
  clientId: string;
  clientName: string;
  revenue: number;
  laborCost: number;
  margin: number;
  marginPct: number;
  isUnprofitable: boolean;
}

export interface MarginReport {
  overall: { revenue: number; laborCost: number; margin: number; marginPct: number };
  byClient: ClientMargin[];
  unprofitableClients: ClientMargin[];
}

export async function computeMargin(input: PeriodInput): Promise<MarginReport> {
  const { workspaceId, startDate, endDate } = input;
  const clientList = await db.select().from(clients).where(eq(clients.workspaceId, workspaceId));

  const byClient: ClientMargin[] = [];
  let overallRevenue = 0;
  let overallLabor = 0;

  for (const c of clientList) {
    const rev = await db.select({
      total: sql<string>`COALESCE(SUM(${invoices.total}::numeric), 0)`,
    }).from(invoices).where(and(
      eq(invoices.workspaceId, workspaceId),
      eq(invoices.clientId, c.id),
      gte(invoices.issueDate, startDate),
      lte(invoices.issueDate, endDate),
      sql`${invoices.status} NOT IN ('void', 'cancelled', 'draft')`,
    ));

    const lab = await db.select({
      total: sql<string>`COALESCE(SUM(${timeEntries.payableAmount}::numeric), 0)`,
    }).from(timeEntries).where(and(
      eq(timeEntries.workspaceId, workspaceId),
      eq(timeEntries.clientId, c.id),
      gte(timeEntries.clockIn, startDate),
      lte(timeEntries.clockIn, endDate),
    ));

    const revenue = num(rev[0]?.total);
    const laborCost = num(lab[0]?.total);
    if (revenue === 0 && laborCost === 0) continue;
    const margin = revenue - laborCost;
    const marginPct = revenue > 0 ? (margin / revenue) * 100 : (laborCost > 0 ? -100 : 0);
    byClient.push({
      clientId: c.id,
      clientName: c.companyName || `${c.firstName} ${c.lastName}`,
      revenue,
      laborCost,
      margin,
      marginPct,
      isUnprofitable: margin < 0,
    });
    overallRevenue += revenue;
    overallLabor += laborCost;
  }

  byClient.sort((a, b) => a.marginPct - b.marginPct);
  const overallMargin = overallRevenue - overallLabor;
  const overallMarginPct = overallRevenue > 0 ? (overallMargin / overallRevenue) * 100 : 0;

  return {
    overall: {
      revenue: overallRevenue,
      laborCost: overallLabor,
      margin: overallMargin,
      marginPct: overallMarginPct,
    },
    byClient,
    unprofitableClients: byClient.filter(c => c.isUnprofitable),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. expenseTrend — last N months of expense totals
// ═════════════════════════════════════════════════════════════════════════════

export interface ExpenseTrendPoint { month: string; total: number; count: number }
export interface ExpenseTrend {
  points: ExpenseTrendPoint[];
  totalSpend: number;
  averageMonthly: number;
  trendPct: number;
}

export async function expenseTrend(input: { workspaceId: string; months?: number }): Promise<ExpenseTrend> {
  const { workspaceId, months = 6 } = input;
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - (months - 1), 1);

  const rows = await db.select({
    month: sql<string>`TO_CHAR(${expenses.expenseDate}, 'YYYY-MM')`,
    total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)`,
    count: sql<number>`COUNT(*)`,
  }).from(expenses).where(and(
    eq(expenses.workspaceId, workspaceId),
    gte(expenses.expenseDate, start),
    lte(expenses.expenseDate, end),
  )).groupBy(sql`TO_CHAR(${expenses.expenseDate}, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${expenses.expenseDate}, 'YYYY-MM')`);

  const points: ExpenseTrendPoint[] = rows.map((r: { month: string; total: string; count: number }) => ({
    month: r.month,
    total: num(r.total),
    count: Number(r.count),
  }));
  const totalSpend = points.reduce((s, p) => s + p.total, 0);
  const averageMonthly = points.length ? totalSpend / points.length : 0;
  const firstHalf = points.slice(0, Math.floor(points.length / 2));
  const secondHalf = points.slice(Math.floor(points.length / 2));
  const fhAvg = firstHalf.reduce((s, p) => s + p.total, 0) / Math.max(1, firstHalf.length);
  const shAvg = secondHalf.reduce((s, p) => s + p.total, 0) / Math.max(1, secondHalf.length);
  const trendPct = fhAvg > 0 ? ((shAvg - fhAvg) / fhAvg) * 100 : 0;

  return { points, totalSpend, averageMonthly, trendPct };
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. clientProfitability — revenue, labor, margin per client
// ═════════════════════════════════════════════════════════════════════════════

export async function clientProfitability(input: PeriodInput): Promise<ClientMargin[]> {
  const report = await computeMargin(input);
  return report.byClient;
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. companyHealth — consolidated CFO briefing for Trinity
// ═════════════════════════════════════════════════════════════════════════════

export interface CompanyHealth {
  workspaceId: string;
  generatedAt: string;
  pnl: PnL;
  ar: ArDays;
  runway: CashRunway;
  margin: MarginReport;
  expenses: ExpenseTrend;
  alerts: Array<{ severity: 'critical' | 'warning' | 'info'; message: string }>;
  oneLiner: string;
}

export async function companyHealth(workspaceId: string): Promise<CompanyHealth> {
  const period = defaultPeriod();
  const [pnl, ar, runway, marginReport, expenses] = await Promise.all([
    monthlyPnL({ workspaceId, ...period }),
    arDays(workspaceId),
    cashRunway(workspaceId),
    computeMargin({ workspaceId, ...period }),
    expenseTrend({ workspaceId, months: 6 }),
  ]);

  const alerts: CompanyHealth['alerts'] = [];

  if (runway.status === 'critical') {
    alerts.push({
      severity: 'critical',
      message: runway.runwayMonths !== null
        ? `Cash runway is ~${runway.runwayMonths.toFixed(1)} months. Net burn ${fmt$(runway.netMonthlyBurn)}/mo.`
        : 'Cash runway is critical — cash on hand is non-positive.',
    });
  } else if (runway.status === 'tight') {
    alerts.push({
      severity: 'warning',
      message: `Runway tight: ~${(runway.runwayMonths ?? 0).toFixed(1)} months. Watch burn.`,
    });
  }

  if (!pnl.isProfitable) {
    alerts.push({
      severity: 'warning',
      message: `Period net income is ${fmt$(pnl.netIncome)} (${pnl.netMarginPct.toFixed(1)}% margin).`,
    });
  }

  if (ar.bucketAmounts['90+'] > 0) {
    alerts.push({
      severity: 'critical',
      message: `${fmt$(ar.bucketAmounts['90+'])} stuck 90+ days past due. Escalate collections.`,
    });
  } else if (ar.bucketAmounts['61-90'] > 0) {
    alerts.push({
      severity: 'warning',
      message: `${fmt$(ar.bucketAmounts['61-90'])} aging 61–90 days. Trigger second-notice cadence.`,
    });
  }

  if (marginReport.unprofitableClients.length > 0) {
    const worst = marginReport.unprofitableClients[0];
    alerts.push({
      severity: 'warning',
      message: `${marginReport.unprofitableClients.length} client(s) running negative margin. Worst: ${worst.clientName} (${worst.marginPct.toFixed(1)}%).`,
    });
  }

  if (expenses.trendPct > 25) {
    alerts.push({
      severity: 'warning',
      message: `Expenses trending up ${expenses.trendPct.toFixed(0)}% vs first half. Review categories.`,
    });
  }

  // One-line CFO summary Trinity can speak
  const verdict =
    runway.status === 'critical' ? 'cash is the priority' :
    !pnl.isProfitable ? 'we are running unprofitable this month' :
    runway.status === 'tight' ? 'profitable but cash-thin' :
    'healthy';

  const oneLiner =
    `Revenue ${fmt$(pnl.grossRevenue)}, net ${fmt$(pnl.netIncome)} (${pnl.netMarginPct.toFixed(1)}%). ` +
    `${fmt$(ar.outstandingTotal)} outstanding across ${ar.invoiceCount} invoice(s), DSO ${ar.dso.toFixed(0)} days. ` +
    `Cash on hand est. ${fmt$(runway.estimatedCashOnHand)}, runway ${runway.runwayMonths !== null ? runway.runwayMonths.toFixed(1) + ' mo' : 'positive'}. ` +
    `Verdict: ${verdict}.`;

  return {
    workspaceId,
    generatedAt: new Date().toISOString(),
    pnl,
    ar,
    runway,
    margin: marginReport,
    expenses,
    alerts,
    oneLiner,
  };
}

function fmt$(n: number): string {
  return (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Tool catalog — for Trinity tool registry / chat function-calling
// ═════════════════════════════════════════════════════════════════════════════

export const CFO_TOOLS = {
  monthlyPnL,
  arDays,
  cashRunway,
  computeMargin,
  expenseTrend,
  clientProfitability,
  companyHealth,
} as const;

export type CfoToolName = keyof typeof CFO_TOOLS;

export const CFO_TOOL_CATALOG: Array<{ name: CfoToolName; description: string; readOnly: true }> = [
  { name: 'monthlyPnL', description: 'Profit & loss for a date range — revenue, labor, expenses, net income, margins.', readOnly: true },
  { name: 'arDays', description: 'Days Sales Outstanding (DSO) plus aging buckets for unpaid invoices.', readOnly: true },
  { name: 'cashRunway', description: 'Estimated cash on hand, monthly burn, runway in months and days.', readOnly: true },
  { name: 'computeMargin', description: 'Overall and per-client margin (revenue vs payable labor).', readOnly: true },
  { name: 'expenseTrend', description: 'Last N months of expense totals with directional trend %.', readOnly: true },
  { name: 'clientProfitability', description: 'Revenue, labor, and margin sorted by least-profitable client.', readOnly: true },
  { name: 'companyHealth', description: 'Consolidated CFO briefing: P&L, AR, runway, margin, expenses, and alert list.', readOnly: true },
];
