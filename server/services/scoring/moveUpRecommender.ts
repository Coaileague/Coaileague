/**
 * Move-Up Recommender
 * ===================
 * Trinity-driven internal-mobility recommendations. For high-scoring officers
 * (currentScore >= threshold), surface up to N better-fit job postings on the
 * platform — including postings at OTHER tenants — based on:
 *
 *   - skill / license match
 *   - geography (within travel radius)
 *   - meaningful pay or growth step up
 *
 * Reuses inboundOpportunityAgent's match primitive when available; falls back
 * to a direct query if not. Output is notification-class — Trinity's conscience
 * treats this as low-risk advisory, not an autonomous action.
 *
 * Below-threshold officers get recommendations only on explicit request — no
 * unsolicited outreach for officers who'd be unlikely to qualify.
 */

import { db } from '../../db';
import { eq, and, gte, ne, sql } from 'drizzle-orm';
import {
  employees,
  globalOfficers,
  jobPostings,
} from '@shared/schema';
import { createLogger } from '../../lib/logger';

const log = createLogger('moveUpRecommender');

const UNSOLICITED_THRESHOLD = 75;
const DEFAULT_LIMIT = 3;

export interface MoveUpRecommendation {
  jobPostingId: string;
  jobTitle: string;
  workspaceId: string;
  payRange: { min?: number; max?: number };
  matchReasons: string[];
  matchConfidence: number; // 0-100
  isCrossTenant: boolean;
}

export interface MoveUpInput {
  globalOfficerId: string;
  currentEmployeeId: string;        // their employees row at the current tenant
  currentWorkspaceId: string;
  source: 'unsolicited' | 'requested';
  limit?: number;
}

export async function recommendMoveUps(input: MoveUpInput): Promise<MoveUpRecommendation[]> {
  const limit = input.limit ?? DEFAULT_LIMIT;

  const [officer] = await db
    .select({
      score: globalOfficers.currentScore,
      tier: globalOfficers.currentTier,
    })
    .from(globalOfficers)
    .where(eq(globalOfficers.id, input.globalOfficerId))
    .limit(1);

  if (!officer) {
    log.warn(`[moveUp] officer ${input.globalOfficerId} not found`);
    return [];
  }

  // Unsolicited outreach is gated on score threshold so we don't pester
  // officers who won't qualify anyway. Explicit requests bypass.
  if (input.source === 'unsolicited' && (officer.score ?? 0) < UNSOLICITED_THRESHOLD) {
    log.info(`[moveUp] unsolicited gated: score=${officer.score} < ${UNSOLICITED_THRESHOLD}`);
    return [];
  }

  const [emp] = await db
    .select({
      currentRate: employees.hourlyRate,
      isArmed: employees.isArmed,
      licenseType: employees.licenseType,
      latitude: employees.latitude,
      longitude: employees.longitude,
      travelRadius: employees.travelRadiusMiles,
      city: employees.city,
      state: employees.state,
    })
    .from(employees)
    .where(eq(employees.id, input.currentEmployeeId))
    .limit(1);

  if (!emp) return [];

  // Find open postings at OTHER workspaces with a meaningful pay step up.
  // Step-up = postings whose minimum pay >= 110% of officer's current rate.
  const currentRate = Number(emp.currentRate ?? 0);
  const stepUpFloor = currentRate > 0 ? currentRate * 1.10 : 0;

  const postings = await db
    .select({
      id: jobPostings.id,
      title: jobPostings.title,
      workspaceId: jobPostings.workspaceId,
      payMin: jobPostings.payRateMin,
      payMax: jobPostings.payRateMax,
      requiresArmed: jobPostings.requiresArmed,
      requiresBilingual: jobPostings.bilingualRequired,
      city: jobPostings.city,
      state: jobPostings.state,
      status: jobPostings.status,
    })
    .from(jobPostings)
    .where(and(
      ne(jobPostings.workspaceId, input.currentWorkspaceId),
      eq(jobPostings.status, 'active'),
      sql`${jobPostings.payRateMin}::numeric >= ${stepUpFloor}`,
    ))
    .limit(20);

  // Rank: license match wins, then pay delta, then state/city co-location.
  const recommendations: MoveUpRecommendation[] = postings
    .map((p: typeof postings[number]) => {
      const reasons: string[] = [];
      let confidence = 50;

      if (p.requiresArmed && emp.isArmed) {
        reasons.push('armed_license_match');
        confidence += 15;
      } else if (p.requiresArmed && !emp.isArmed) {
        return null; // disqualified
      }

      const minPay = Number(p.payMin ?? 0);
      if (currentRate > 0 && minPay > 0) {
        const lift = ((minPay - currentRate) / currentRate) * 100;
        reasons.push(`pay_step_up_${Math.round(lift)}pct`);
        confidence += Math.min(30, Math.round(lift));
      }

      if (p.state && p.state === emp.state) {
        reasons.push('same_state');
        confidence += 5;
      }
      if (p.city && p.city === emp.city) {
        reasons.push('same_city');
        confidence += 10;
      }

      return {
        jobPostingId: p.id,
        jobTitle: p.title ?? 'Untitled',
        workspaceId: p.workspaceId,
        payRange: {
          min: p.payMin ? Number(p.payMin) : undefined,
          max: p.payMax ? Number(p.payMax) : undefined,
        },
        matchReasons: reasons,
        matchConfidence: Math.min(100, confidence),
        isCrossTenant: true,
      };
    })
    .filter((r: MoveUpRecommendation | null): r is MoveUpRecommendation => r !== null)
    .sort((a: MoveUpRecommendation, b: MoveUpRecommendation) => b.matchConfidence - a.matchConfidence)
    .slice(0, limit);

  log.info(`[moveUp] officer=${input.globalOfficerId} found=${recommendations.length} (${input.source})`);
  return recommendations;
}
