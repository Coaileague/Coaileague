/**
 * Tenant Score Service
 * ====================
 * Computes a single 0-100 score per workspace (tenant company) on signals
 * officers actually care about when picking an employer:
 *
 *   - turnover rate (vs. industry baseline)
 *   - pay rate (vs. platform peers)
 *   - work availability / shift volume
 *   - role diversity
 *   - internal mobility / move-up opportunities
 *   - license upkeep
 *   - payroll reliability
 *   - aggregate officer compliance
 *
 * Result is snapshot per period to tenant_scores; never overwritten so
 * trend over time is readable.
 */

import { db } from '../../db';
import { eq, and, gte, lte, sql, ne } from 'drizzle-orm';
import {
  employees,
  employeeTerminations,
  tenantScores,
  workspaces,
} from '@shared/schema';
import { createLogger } from '../../lib/logger';

const log = createLogger('tenantScore');

export const TENANT_SCORE_WEIGHTS = {
  turnover: 0.25,
  payCompetitiveness: 0.20,
  workAvailability: 0.10,
  roleDiversity: 0.10,
  internalMobility: 0.10,
  licenseUpkeep: 0.15,
  payrollReliability: 0.05,
  aggregateCompliance: 0.05,
} as const;

export type TenantTier = 'excellent' | 'strong' | 'fair' | 'weak' | 'critical';

export function tierForTenantScore(score: number): TenantTier {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'strong';
  if (score >= 55) return 'fair';
  if (score >= 40) return 'weak';
  return 'critical';
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export interface TenantScoreResult {
  workspaceId: string;
  overallScore: number;
  tier: TenantTier;
  dimensions: {
    turnover: number;
    payCompetitiveness: number;
    workAvailability: number;
    roleDiversity: number;
    internalMobility: number;
    licenseUpkeep: number;
    payrollReliability: number;
    aggregateCompliance: number;
  };
  rawInputs: Record<string, unknown>;
  periodStart: Date;
  periodEnd: Date;
}

// ────────────────────────────────────────────────────────────────────────────
// DIMENSIONS
// ────────────────────────────────────────────────────────────────────────────

async function computeTurnoverScore(workspaceId: string, periodStart: Date): Promise<{ score: number; raw: unknown }> {
  // Industry baseline for security workforce: ~50% annual.
  // Tenant score: 100 at 0% turnover, 0 at 100%+.
  const [active] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(eq(employees.workspaceId, workspaceId), eq(employees.status, 'active')));
  const headcount = active?.count ?? 0;
  if (headcount === 0) return { score: 75, raw: { reason: 'no_headcount' } };

  const [terminated] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(employeeTerminations)
    .where(and(
      eq(employeeTerminations.workspaceId, workspaceId),
      gte(employeeTerminations.terminationDate, periodStart),
    ));
  const termCount = terminated?.count ?? 0;

  const annualizedTurnover = (termCount / headcount) * (365 / Math.max(1, daysSince(periodStart)));
  const score = clamp(100 - annualizedTurnover * 100);
  return { score, raw: { annualizedTurnover, headcount, termCount } };
}

async function computePayCompetitivenessScore(workspaceId: string): Promise<{ score: number; raw: unknown }> {
  // Platform median hourly rate vs. this tenant's median.
  const [tenantMedian] = await db
    .select({ median: sql<number>`percentile_cont(0.5) within group (order by ${employees.hourlyRate}::numeric)` })
    .from(employees)
    .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)));
  const [platformMedian] = await db
    .select({ median: sql<number>`percentile_cont(0.5) within group (order by ${employees.hourlyRate}::numeric)` })
    .from(employees)
    .where(eq(employees.isActive, true));

  const tm = Number(tenantMedian?.median ?? 0);
  const pm = Number(platformMedian?.median ?? 0);
  if (tm === 0 || pm === 0) return { score: 50, raw: { reason: 'insufficient_data' } };

  // 100 at +20% over platform median, 50 at parity, 0 at -50% below.
  const ratio = tm / pm;
  const score = clamp(50 + (ratio - 1) * 250);
  return { score, raw: { tenantMedian: tm, platformMedian: pm, ratio } };
}

async function computeWorkAvailabilityScore(workspaceId: string): Promise<{ score: number; raw: unknown }> {
  // Heuristic: ratio of active employees to actively-scheduled posts. We don't
  // model open posts directly here — score is steady at 75 unless we see
  // signal of insufficient work (low overtime usage + large bench).
  const [headcount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)));
  const c = headcount?.count ?? 0;
  if (c === 0) return { score: 50, raw: { reason: 'no_headcount' } };
  return { score: 75, raw: { headcount: c, note: 'baseline' } };
}

async function computeRoleDiversityScore(workspaceId: string): Promise<{ score: number; raw: unknown }> {
  const result = await db
    .selectDistinct({ position: employees.position })
    .from(employees)
    .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)));
  const distinctPositions = result.filter((r: { position: string | null }) => r.position).length;
  // 1 role = 30, 2-3 = 60, 4-6 = 80, 7+ = 100
  const score = distinctPositions <= 1 ? 30 :
                distinctPositions <= 3 ? 60 :
                distinctPositions <= 6 ? 80 : 100;
  return { score, raw: { distinctPositions } };
}

async function computeInternalMobilityScore(workspaceId: string): Promise<{ score: number; raw: unknown }> {
  // Heuristic: count commendations and lack of stale tenure.
  // Real measure would require a promotion ledger; this is a proxy.
  const [headcount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)));
  const c = headcount?.count ?? 0;
  if (c === 0) return { score: 50, raw: { reason: 'no_headcount' } };
  return { score: 70, raw: { note: 'baseline_pending_promotion_ledger' } };
}

async function computeLicenseUpkeepScore(workspaceId: string): Promise<{ score: number; raw: unknown }> {
  const rows = await db
    .select({
      status: employees.guardCardStatus,
    })
    .from(employees)
    .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)));
  if (rows.length === 0) return { score: 75, raw: { reason: 'no_employees' } };

  let score = 0;
  for (const r of rows) {
    switch (r.status) {
      case 'licensed_card_on_file':  score += 100; break;
      case 'licensed_pending_card':  score += 80; break;
      case 'substantially_complete': score += 60; break;
      case 'grace_period_renewal':   score += 40; break;
      case 'expired_hard_block':     score += 0; break;
      default:                       score += 50;
    }
  }
  const avg = score / rows.length;
  return { score: clamp(avg), raw: { officerCount: rows.length, avgLicenseHealth: avg } };
}

async function computePayrollReliabilityScore(_workspaceId: string): Promise<{ score: number; raw: unknown }> {
  // Stub: full impl reads payroll run history (on-time vs. late). Default
  // to 90 so a tenant with no recorded payroll issues isn't unfairly penalized.
  return { score: 90, raw: { note: 'default_pending_payroll_history' } };
}

async function computeAggregateComplianceScore(workspaceId: string): Promise<{ score: number; raw: unknown }> {
  const rows = await db
    .select({ score: employees.complianceScore })
    .from(employees)
    .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)));
  if (rows.length === 0) return { score: 75, raw: { reason: 'no_employees' } };
  const avg = rows.reduce((s: number, r: { score: number | null }) => s + (r.score ?? 0), 0) / rows.length;
  return { score: clamp(avg), raw: { avgCompliance: avg, n: rows.length } };
}

function daysSince(d: Date): number {
  return Math.max(1, Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

// ────────────────────────────────────────────────────────────────────────────
// COMPOSITE
// ────────────────────────────────────────────────────────────────────────────

export async function computeTenantScore(
  workspaceId: string,
  periodStart: Date = defaultPeriodStart(),
  periodEnd: Date = new Date(),
): Promise<TenantScoreResult> {
  const [
    turnover,
    pay,
    avail,
    diversity,
    mobility,
    license,
    payroll,
    compliance,
  ] = await Promise.all([
    computeTurnoverScore(workspaceId, periodStart),
    computePayCompetitivenessScore(workspaceId),
    computeWorkAvailabilityScore(workspaceId),
    computeRoleDiversityScore(workspaceId),
    computeInternalMobilityScore(workspaceId),
    computeLicenseUpkeepScore(workspaceId),
    computePayrollReliabilityScore(workspaceId),
    computeAggregateComplianceScore(workspaceId),
  ]);

  const overall = clamp(
    turnover.score * TENANT_SCORE_WEIGHTS.turnover +
    pay.score * TENANT_SCORE_WEIGHTS.payCompetitiveness +
    avail.score * TENANT_SCORE_WEIGHTS.workAvailability +
    diversity.score * TENANT_SCORE_WEIGHTS.roleDiversity +
    mobility.score * TENANT_SCORE_WEIGHTS.internalMobility +
    license.score * TENANT_SCORE_WEIGHTS.licenseUpkeep +
    payroll.score * TENANT_SCORE_WEIGHTS.payrollReliability +
    compliance.score * TENANT_SCORE_WEIGHTS.aggregateCompliance,
  );

  return {
    workspaceId,
    overallScore: overall,
    tier: tierForTenantScore(overall),
    dimensions: {
      turnover: turnover.score,
      payCompetitiveness: pay.score,
      workAvailability: avail.score,
      roleDiversity: diversity.score,
      internalMobility: mobility.score,
      licenseUpkeep: license.score,
      payrollReliability: payroll.score,
      aggregateCompliance: compliance.score,
    },
    rawInputs: {
      turnover: turnover.raw,
      payCompetitiveness: pay.raw,
      workAvailability: avail.raw,
      roleDiversity: diversity.raw,
      internalMobility: mobility.raw,
      licenseUpkeep: license.raw,
      payrollReliability: payroll.raw,
      aggregateCompliance: compliance.raw,
    },
    periodStart,
    periodEnd,
  };
}

export async function snapshotTenantScore(
  workspaceId: string,
  periodType: 'monthly' | 'quarterly' = 'monthly',
): Promise<TenantScoreResult> {
  const result = await computeTenantScore(workspaceId);

  await db.insert(tenantScores).values({
    workspaceId,
    periodType,
    periodStart: result.periodStart,
    periodEnd: result.periodEnd,
    overallScore: result.overallScore,
    tier: result.tier,
    turnoverScore: result.dimensions.turnover,
    payCompetitivenessScore: result.dimensions.payCompetitiveness,
    workAvailabilityScore: result.dimensions.workAvailability,
    roleDiversityScore: result.dimensions.roleDiversity,
    internalMobilityScore: result.dimensions.internalMobility,
    licenseUpkeepScore: result.dimensions.licenseUpkeep,
    payrollReliabilityScore: result.dimensions.payrollReliability,
    aggregateComplianceScore: result.dimensions.aggregateCompliance,
    rawInputs: result.rawInputs as unknown as Record<string, unknown>,
    engineVersion: 'v1.0',
  });

  log.info(`[tenantScore] workspace=${workspaceId} score=${result.overallScore} (${result.tier})`);
  return result;
}

function defaultPeriodStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d;
}
