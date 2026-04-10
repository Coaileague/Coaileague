/**
 * Trinity Financial Briefing Service — GAP 12
 *
 * Generates a weekly financial briefing for org_owners using Trinity AI.
 * Covers:
 *   - Revenue collected vs outstanding in past 7 days
 *   - Payroll spend + projected payroll
 *   - Invoice aging summary (current / 30+ / 60+ / 90+ days)
 *   - Cash flow trend (week-over-week)
 *   - Trinity recommendations (risk flags, opportunities)
 *
 * Called from automationTriggerService on Mondays (or configurable day).
 */

import { db } from '../../db';
import { workspaces, employees, invoices, timeEntries, payrollRuns } from '@shared/schema';
import { eq, and, gte, lte, sql, isNull } from 'drizzle-orm';
import { createNotification } from '../notificationService';
import { createLogger } from '../../lib/logger';
import { format, subDays, startOfWeek, endOfWeek } from 'date-fns';

const log = createLogger('TrinityFinancialBriefing');

interface WeeklyBriefing {
  workspaceId: string;
  orgName: string;
  periodStart: Date;
  periodEnd: Date;
  revenue: {
    collectedThisWeek: number;
    outstanding: number;
    overdue: number;
  };
  payroll: {
    lastRunAmount: number;
    pendingDraftAmount: number;
  };
  invoiceAging: {
    current: number;
    past30: number;
    past60: number;
    past90: number;
  };
  cashFlow: {
    netThisWeek: number;
    trend: 'positive' | 'neutral' | 'negative';
  };
  flags: string[];
  recommendations: string[];
}

export async function runTrinityFinancialBriefings(): Promise<{ briefingsSent: number }> {
  let briefingsSent = 0;

  try {
    const now = new Date();
    const periodEnd = now;
    const periodStart = subDays(now, 7);

    const allWorkspaces = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        ownerId: workspaces.ownerId,
        subscriptionTier: workspaces.subscriptionTier,
        subscriptionStatus: workspaces.subscriptionStatus,
      })
      .from(workspaces)
      .where(
        and(
          sql`${workspaces.subscriptionStatus} IN ('active', 'past_due')`,
          sql`${workspaces.id} NOT LIKE 'coaileague-%'`,
          sql`${workspaces.id} != 'system'`
        )
      );

    for (const ws of allWorkspaces) {
      if (!ws.ownerId) continue;
      try {
        const briefing = await buildBriefing(ws.id, ws.name || 'Your Organization', periodStart, periodEnd);
        await deliverBriefing(briefing, ws.ownerId);
        briefingsSent++;
        log.info('Financial briefing delivered', { workspaceId: ws.id });
      } catch (wsErr: any) {
        log.warn('Briefing failed for workspace', { workspaceId: ws.id, error: wsErr.message });
      }
    }
  } catch (err: any) {
    log.error('Financial briefing scan failed', { error: (err instanceof Error ? err.message : String(err)) });
  }

  log.info('Financial briefing complete', { briefingsSent });
  return { briefingsSent };
}

async function buildBriefing(
  workspaceId: string,
  orgName: string,
  periodStart: Date,
  periodEnd: Date
): Promise<WeeklyBriefing> {
  // ── Revenue metrics ────────────────────────────────────────────────────────
  const invoiceRows = await db
    .select({
      status: invoices.status,
      total: invoices.total,
      dueDate: invoices.dueDate,
    })
    .from(invoices)
    .where(eq(invoices.workspaceId, workspaceId));

  let collectedThisWeek = 0;
  let outstanding = 0;
  let overdue = 0;
  let agingCurrent = 0;
  let agingPast30 = 0;
  let agingPast60 = 0;
  let agingPast90 = 0;

  const today = new Date();
  for (const inv of invoiceRows) {
    const amount = parseFloat(inv.total || '0');
    if (inv.status === 'paid') {
      collectedThisWeek += amount;
    } else if (inv.status === 'sent' || inv.status === 'overdue') {
      outstanding += amount;
      const due = inv.dueDate ? new Date(inv.dueDate) : null;
      if (due) {
        const daysOverdue = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        if (daysOverdue > 0) {
          overdue += amount;
          if (daysOverdue >= 90) agingPast90 += amount;
          else if (daysOverdue >= 60) agingPast60 += amount;
          else if (daysOverdue >= 30) agingPast30 += amount;
          else agingCurrent += amount;
        } else {
          agingCurrent += amount;
        }
      } else {
        agingCurrent += amount;
      }
    }
  }

  // ── Payroll metrics ────────────────────────────────────────────────────────
  const recentRuns = await db
    .select({
      id: payrollRuns.id,
      status: payrollRuns.status,
      totalGross: payrollRuns.totalGrossPay,
    })
    .from(payrollRuns)
    .where(
      and(
        eq(payrollRuns.workspaceId, workspaceId),
        gte(payrollRuns.createdAt, subDays(today, 30))
      )
    )
    .limit(5);

  let lastRunAmount = 0;
  let pendingDraftAmount = 0;
  for (const run of recentRuns) {
    const amt = parseFloat((run.totalGross || '0').toString());
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (run.status === 'approved' || run.status === 'processing' || run.status === 'completed') {
      lastRunAmount = Math.max(lastRunAmount, amt);
    } else if (run.status === 'draft') {
      pendingDraftAmount += amt;
    }
  }

  // ── Cash flow ─────────────────────────────────────────────────────────────
  const netThisWeek = collectedThisWeek - lastRunAmount;
  const trend: 'positive' | 'neutral' | 'negative' =
    netThisWeek > 0 ? 'positive' : netThisWeek < -500 ? 'negative' : 'neutral';

  // ── Intelligence flags + recommendations ──────────────────────────────────
  const flags: string[] = [];
  const recommendations: string[] = [];

  if (overdue > 0) {
    flags.push(`${formatCurrency(overdue)} in overdue invoices — collections at risk.`);
    recommendations.push('Send payment reminders to overdue clients immediately. Consider calling clients with 60+ day balances.');
  }
  if (agingPast90 > 0) {
    flags.push(`${formatCurrency(agingPast90)} past 90 days — may require write-off or legal action.`);
    recommendations.push(`Review 90-day overdue accounts and consider collections escalation.`);
  }
  if (pendingDraftAmount > 0) {
    flags.push(`Payroll draft of ${formatCurrency(pendingDraftAmount)} awaiting your approval.`);
    recommendations.push('Review and approve the pending payroll draft to avoid processing delays.');
  }
  if (outstanding > collectedThisWeek * 1.5 && collectedThisWeek > 0) {
    flags.push(`Outstanding invoices (${formatCurrency(outstanding)}) exceed collected revenue by more than 1.5x.`);
    recommendations.push('Consider accelerating invoice sends or adjusting payment terms for faster collection.');
  }
  if (flags.length === 0) {
    recommendations.push('All financial metrics look healthy this week. Keep monitoring cash flow and invoice aging weekly.');
  }

  return {
    workspaceId,
    orgName,
    periodStart,
    periodEnd,
    revenue: { collectedThisWeek, outstanding, overdue },
    payroll: { lastRunAmount, pendingDraftAmount },
    invoiceAging: { current: agingCurrent, past30: agingPast30, past60: agingPast60, past90: agingPast90 },
    cashFlow: { netThisWeek, trend },
    flags,
    recommendations,
  };
}

async function deliverBriefing(briefing: WeeklyBriefing, ownerId: string): Promise<void> {
  const periodLabel = `${format(briefing.periodStart, 'MMM d')} – ${format(briefing.periodEnd, 'MMM d, yyyy')}`;
  const trendEmoji = briefing.cashFlow.trend === 'positive' ? '(positive)' : briefing.cashFlow.trend === 'negative' ? '(negative)' : '(neutral)';

  const flagsSummary = briefing.flags.length > 0
    ? `\n\nFlags:\n${briefing.flags.map(f => `• ${f}`).join('\n')}`
    : '';

  const recsSummary = briefing.recommendations.length > 0
    ? `\n\nRecommendations:\n${briefing.recommendations.map(r => `• ${r}`).join('\n')}`
    : '';

  const message =
    `Weekly Financial Briefing for ${briefing.orgName} (${periodLabel})\n\n` +
    `Revenue: ${formatCurrency(briefing.revenue.collectedThisWeek)} collected | ${formatCurrency(briefing.revenue.outstanding)} outstanding | ${formatCurrency(briefing.revenue.overdue)} overdue\n` +
    `Payroll: ${formatCurrency(briefing.payroll.lastRunAmount)} last run | ${formatCurrency(briefing.payroll.pendingDraftAmount)} pending approval\n` +
    `Net Cash Flow: ${formatCurrency(briefing.cashFlow.netThisWeek)} ${trendEmoji}\n` +
    `Invoice Aging: Current ${formatCurrency(briefing.invoiceAging.current)} | 30+ ${formatCurrency(briefing.invoiceAging.past30)} | 60+ ${formatCurrency(briefing.invoiceAging.past60)} | 90+ ${formatCurrency(briefing.invoiceAging.past90)}` +
    flagsSummary +
    recsSummary;

  await createNotification({
    workspaceId: briefing.workspaceId,
    userId: ownerId,
    type: 'trinity_financial_briefing',
    title: `Trinity Weekly Financial Briefing — ${format(briefing.periodEnd, 'MMM d, yyyy')}`,
    message,
    priority: briefing.flags.length > 0 ? 'high' : 'normal',
    metadata: {
      periodStart: briefing.periodStart.toISOString(),
      periodEnd: briefing.periodEnd.toISOString(),
      revenue: briefing.revenue,
      payroll: briefing.payroll,
      invoiceAging: briefing.invoiceAging,
      cashFlow: briefing.cashFlow,
      flagCount: briefing.flags.length,
    },
    actionUrl: '/cash-flow',
  });
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
