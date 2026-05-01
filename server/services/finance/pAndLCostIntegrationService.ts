/**
 * P&L COST INTEGRATION SERVICE  (Phase 10-4)
 * =============================================
 * Bridges Trinity execution costs into the existing P&L infrastructure so that
 * AI operating costs are visible as a line-item in expense breakdowns, margin
 * analysis, and financial alerts.
 *
 * This service does NOT replace profitLossService — it supplements it by
 * providing Trinity-specific cost data that profitLossService can fold into
 * the "admin" or a dedicated "ai_operations" expense category.
 *
 * INTEGRATION POINTS:
 *  - trinityCostService.ts  (source of execution-level cost data)
 *  - profitLossService.ts   (consumer — calls getTrinityImpact for P&L widgets)
 *  - financialAlerts table  (raises alerts when AI cost exceeds thresholds)
 */

import { db } from '../../db';
import { financialAlerts, type InsertFinancialAlert } from '@shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { trinityCostService, type MonthlyCostSummary } from '../trinity/trinityCostService';
import { createLogger } from '../../lib/logger';

const log = createLogger('pAndLCostIntegration');

// ── Thresholds ──────────────────────────────────────────────────────────────
const COST_WARNING_THRESHOLD_USD = 50;   // warn if monthly Trinity cost > $50
const COST_CRITICAL_THRESHOLD_USD = 200; // critical if monthly Trinity cost > $200
const COST_REVENUE_RATIO_WARN = 0.05;   // warn if Trinity cost > 5% of revenue

// ── Public types ────────────────────────────────────────────────────────────

export interface TrinityPLImpact {
  period: string;               // 'YYYY-MM'
  totalTrinityCostUsd: number;
  asPercentOfRevenue: number;   // 0-100
  asPercentOfExpenses: number;  // 0-100
  marginImpactPct: number;      // how much Trinity costs reduce margin
  costBreakdown: MonthlyCostSummary;
  variance?: {
    previousPeriodCost: number;
    changeUsd: number;
    changePct: number;
  };
  alerts: TrinityFinancialAlert[];
}

export interface TrinityFinancialAlert {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
}

// ── Service ─────────────────────────────────────────────────────────────────

class PAndLCostIntegrationService {

  /**
   * Full P&L impact assessment for a workspace in a given month.
   */
  async getTrinityImpact(
    workspaceId: string,
    year: number,
    month: number,
    revenueTotal: number,
    expenseTotal: number,
  ): Promise<TrinityPLImpact> {
    const period = `${year}-${String(month).padStart(2, '0')}`;

    const costBreakdown = await trinityCostService.getMonthlySummary(workspaceId, year, month);
    const totalTrinityCostUsd = costBreakdown.totalCostUsd;

    // Revenue / expense ratios (avoid division by zero)
    const asPercentOfRevenue  = revenueTotal > 0
      ? (totalTrinityCostUsd / revenueTotal) * 100
      : 0;
    const asPercentOfExpenses = expenseTotal > 0
      ? (totalTrinityCostUsd / expenseTotal) * 100
      : 0;
    const marginImpactPct     = revenueTotal > 0
      ? (totalTrinityCostUsd / revenueTotal) * 100
      : 0;

    // Variance vs previous month
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear  = month === 1 ? year - 1 : year;
    const prevSummary = await trinityCostService.getMonthlySummary(workspaceId, prevYear, prevMonth);
    const previousPeriodCost = prevSummary.totalCostUsd;
    const changeUsd = totalTrinityCostUsd - previousPeriodCost;
    const changePct = previousPeriodCost > 0
      ? (changeUsd / previousPeriodCost) * 100
      : totalTrinityCostUsd > 0 ? 100 : 0;

    const variance = {
      previousPeriodCost,
      changeUsd,
      changePct,
    };

    // Generate alerts
    const alerts = this.evaluateAlerts(totalTrinityCostUsd, revenueTotal, changeUsd, changePct);

    // Persist critical alerts to the financialAlerts table
    for (const alert of alerts) {
      if (alert.severity === 'critical') {
        await this.persistAlert(workspaceId, alert, period);
      }
    }

    return {
      period,
      totalTrinityCostUsd,
      asPercentOfRevenue,
      asPercentOfExpenses,
      marginImpactPct,
      costBreakdown,
      variance,
      alerts,
    };
  }

  /**
   * Quick check: total Trinity cost for the current month (for dashboard widgets).
   */
  async getCurrentMonthCost(workspaceId: string): Promise<number> {
    const now = new Date();
    const summary = await trinityCostService.getMonthlySummary(
      workspaceId,
      now.getFullYear(),
      now.getMonth() + 1,
    );
    return summary.totalCostUsd;
  }

  /**
   * Platform-level Trinity cost for P&L roll-up (all workspaces).
   */
  async getPlatformMonthlyImpact(year: number, month: number): Promise<number> {
    return trinityCostService.getPlatformMonthlyCost(year, month);
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  private evaluateAlerts(
    totalCostUsd: number,
    revenueTotal: number,
    changeUsd: number,
    changePct: number,
  ): TrinityFinancialAlert[] {
    const alerts: TrinityFinancialAlert[] = [];

    if (totalCostUsd >= COST_CRITICAL_THRESHOLD_USD) {
      alerts.push({
        severity: 'critical',
        title: 'Trinity API cost critically high',
        message: `Monthly Trinity API cost is $${totalCostUsd.toFixed(2)}, exceeding the $${COST_CRITICAL_THRESHOLD_USD} threshold. Review skill usage.`,
      });
    } else if (totalCostUsd >= COST_WARNING_THRESHOLD_USD) {
      alerts.push({
        severity: 'warning',
        title: 'Trinity API cost elevated',
        message: `Monthly Trinity API cost is $${totalCostUsd.toFixed(2)}, above the $${COST_WARNING_THRESHOLD_USD} warning level.`,
      });
    }

    if (revenueTotal > 0 && (totalCostUsd / revenueTotal) > COST_REVENUE_RATIO_WARN) {
      alerts.push({
        severity: 'warning',
        title: 'Trinity cost/revenue ratio high',
        message: `Trinity costs represent ${((totalCostUsd / revenueTotal) * 100).toFixed(2)}% of revenue (threshold: ${(COST_REVENUE_RATIO_WARN * 100).toFixed(0)}%).`,
      });
    }

    if (changePct > 100 && changeUsd > 10) {
      alerts.push({
        severity: 'warning',
        title: 'Trinity cost spike detected',
        message: `Trinity costs increased ${changePct.toFixed(0)}% ($${changeUsd.toFixed(2)}) compared to the previous month.`,
      });
    }

    if (alerts.length === 0 && totalCostUsd > 0) {
      alerts.push({
        severity: 'info',
        title: 'Trinity costs within budget',
        message: `Monthly Trinity API cost: $${totalCostUsd.toFixed(2)} — within healthy thresholds.`,
      });
    }

    return alerts;
  }

  private async persistAlert(
    workspaceId: string,
    alert: TrinityFinancialAlert,
    period: string,
  ): Promise<void> {
    try {
      await db.insert(financialAlerts).values({
        workspaceId,
        severity: alert.severity,
        category: 'expense',
        title: alert.title,
        message: alert.message,
        relatedEntityType: 'trinity_cost',
        relatedEntityId: period,
        status: 'active',
        detectedAt: new Date(),
      } as InsertFinancialAlert);
    } catch (err) {
      log.warn('[PAndLCostIntegration] Failed to persist financial alert (non-fatal):', err);
    }
  }
}

export const pAndLCostIntegrationService = new PAndLCostIntegrationService();
