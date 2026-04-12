/**
 * Revenue Forecasting Service
 * ============================
 * Generates 3-month forward revenue projections based on:
 *   - Historical revenue growth rates (rolling 6-month average)
 *   - Known future contract / accrual schedules
 *   - Client account health (active, at-risk, churning)
 *   - Seasonal trend factors
 *
 * Per CLAUDE.md §G: All queries workspace-scoped.
 */

import { db } from '../../db';
import {
  invoices,
  revenueRecognitionSchedule,
  clientContracts,
  clients,
} from '@shared/schema';
import { eq, and, gte, lte, inArray } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';

const log = createLogger('RevenueForecasting');

export interface MonthlyRevenueForecast {
  month: string; // YYYY-MM
  projectedRevenue: number;
  knownContractRevenue: number;
  historicalTrendRevenue: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  confidenceScore: number; // 0–1
  assumptions: string[];
}

export interface RevenueForecastResult {
  workspaceId: string;
  generatedAt: string;
  basePeriodMonths: number;
  averageMonthlyRevenue: number;
  growthRatePercent: number;
  forecasts: MonthlyRevenueForecast[];
  keyAssumptions: string[];
}

/**
 * Calculate historical monthly revenue for a workspace over the last N months.
 * Returns map of { 'YYYY-MM': amount }
 */
async function getHistoricalMonthlyRevenue(
  workspaceId: string,
  months: number,
): Promise<Map<string, number>> {
  const endDate = new Date();
  const startDate = new Date(endDate.getFullYear(), endDate.getMonth() - months, 1);

  const result = await db
    .select({
      total: invoices.total,
      paidAt: invoices.paidAt,
      issueDate: invoices.issueDate,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.workspaceId, workspaceId),
        inArray(invoices.status, ['paid', 'partially_paid']),
        gte(invoices.paidAt, startDate),
      ),
    );

  const monthlyMap = new Map<string, number>();
  for (const inv of result) {
    const date = inv.paidAt ?? inv.issueDate;
    if (!date) continue;
    const d = new Date(date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + parseFloat(String(inv.total ?? 0)));
  }
  return monthlyMap;
}

/**
 * Get confirmed future revenue from accrual schedules.
 * Returns map of { 'YYYY-MM': amount }
 */
async function getKnownFutureRevenue(
  workspaceId: string,
  months: number,
): Promise<Map<string, number>> {
  const now = new Date();
  const futureMap = new Map<string, number>();

  const schedules = await db
    .select()
    .from(revenueRecognitionSchedule)
    .where(
      and(
        eq(revenueRecognitionSchedule.workspaceId, workspaceId),
        eq(revenueRecognitionSchedule.recognitionMethod, 'accrual'),
        inArray(revenueRecognitionSchedule.status, ['pending', 'in_progress']),
      ),
    );

  for (let i = 0; i < months; i++) {
    const forecastDate = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1);
    const key = `${forecastDate.getFullYear()}-${String(forecastDate.getMonth() + 1).padStart(2, '0')}`;

    for (const s of schedules) {
      const scheduledDates = (s.scheduledDates as Array<{ date: string; amount: string }>) ?? [];
      const entry = scheduledDates.find((e) => e.date.startsWith(key));
      if (entry) {
        futureMap.set(key, (futureMap.get(key) ?? 0) + parseFloat(entry.amount));
      }
    }
  }

  return futureMap;
}

/**
 * Calculate revenue growth rate from historical data.
 * Returns a decimal (e.g. 0.05 = 5% growth).
 */
function calculateGrowthRate(monthlyRevenue: Map<string, number>): number {
  const values = Array.from(monthlyRevenue.values()).filter((v) => v > 0);
  if (values.length < 2) return 0;

  // Simple linear regression slope as growth rate
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const mean = sumY / n;
  return mean > 0 ? slope / mean : 0;
}

/**
 * Determine confidence level from known contracts vs trend-based projection.
 */
function confidenceFromRatio(
  knownAmount: number,
  totalProjected: number,
  dataPoints: number,
): { level: 'high' | 'medium' | 'low'; score: number } {
  if (totalProjected <= 0) return { level: 'low', score: 0.2 };
  const contractCoverage = knownAmount / totalProjected;
  const dataConfidence = Math.min(1, dataPoints / 6); // 6 months = full confidence
  const score = contractCoverage * 0.6 + dataConfidence * 0.4;
  const level: 'high' | 'medium' | 'low' =
    score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low';
  return { level, score: parseFloat(score.toFixed(2)) };
}

/**
 * Generate a 3-month revenue forecast for a workspace.
 */
export async function generateRevenueForecast(
  workspaceId: string,
  forecastMonths = 3,
): Promise<RevenueForecastResult> {
  const now = new Date();
  const BASE_PERIOD = 6;

  const [historicalRevenue, knownFuture] = await Promise.all([
    getHistoricalMonthlyRevenue(workspaceId, BASE_PERIOD),
    getKnownFutureRevenue(workspaceId, forecastMonths),
  ]);

  const historicalValues = Array.from(historicalRevenue.values());
  const avgMonthly =
    historicalValues.length > 0
      ? historicalValues.reduce((s, v) => s + v, 0) / historicalValues.length
      : 0;
  const growthRate = calculateGrowthRate(historicalRevenue);

  const forecasts: MonthlyRevenueForecast[] = [];
  const keyAssumptions: string[] = [];

  if (historicalValues.length > 0) {
    keyAssumptions.push(
      `Based on ${historicalValues.length}-month average monthly revenue of $${avgMonthly.toFixed(0)}`,
    );
  }
  if (growthRate !== 0) {
    keyAssumptions.push(
      `Historical growth rate: ${(growthRate * 100).toFixed(1)}% per month`,
    );
  }

  for (let i = 0; i < forecastMonths; i++) {
    const forecastDate = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1);
    const monthKey = `${forecastDate.getFullYear()}-${String(forecastDate.getMonth() + 1).padStart(2, '0')}`;

    const trendProjection = avgMonthly * Math.pow(1 + growthRate, i + 1);
    const knownRevenue = knownFuture.get(monthKey) ?? 0;
    const projected = Math.max(knownRevenue, trendProjection);

    const { level, score } = confidenceFromRatio(knownRevenue, projected, historicalValues.length);

    const assumptions: string[] = [];
    if (knownRevenue > 0) {
      assumptions.push(`$${knownRevenue.toFixed(0)} from confirmed accrual schedules`);
    }
    if (trendProjection > 0) {
      assumptions.push(`$${trendProjection.toFixed(0)} from historical trend`);
    }
    if (assumptions.length === 0) {
      assumptions.push('Insufficient data for reliable projection');
    }

    forecasts.push({
      month: monthKey,
      projectedRevenue: parseFloat(projected.toFixed(2)),
      knownContractRevenue: parseFloat(knownRevenue.toFixed(2)),
      historicalTrendRevenue: parseFloat(trendProjection.toFixed(2)),
      confidenceLevel: level,
      confidenceScore: score,
      assumptions,
    });
  }

  if (knownFuture.size > 0) {
    keyAssumptions.push(`${knownFuture.size} month(s) have confirmed accrual contract revenue`);
  }
  keyAssumptions.push('Client churn and new business not modeled (future enhancement)');

  return {
    workspaceId,
    generatedAt: now.toISOString(),
    basePeriodMonths: BASE_PERIOD,
    averageMonthlyRevenue: parseFloat(avgMonthly.toFixed(2)),
    growthRatePercent: parseFloat((growthRate * 100).toFixed(2)),
    forecasts,
    keyAssumptions,
  };
}

export const revenueForecasting = { generateRevenueForecast };
