/**
 * Score Engine Service
 * ====================
 * Computes the single composite 0-100 officer score that follows a person
 * across every tenant on the platform. Replaces the legacy gamification
 * surface (achievements, points, leaderboards) with one objective number.
 *
 * Inputs are pulled from existing event sources (no new event bus needed):
 *   - shifts (no_show, calloff, on-time)
 *   - performanceReviews + officerPerformanceScores
 *   - disciplinaryRecords + securityIncidents
 *   - employeeDocuments + incidentReports (paperwork timeliness)
 *   - officerTrainingCertificates + employeeSkills (training & certs)
 *   - candidateInterviewSessions (Trinity interview rating)
 *   - globalOfficers.veteranStatus, primaryLanguages
 *
 * Output is written back to globalOfficers.currentScore plus a row in
 * employeeEventLog for full provenance. The engine never touches the
 * closing-score history — that is closingScoreService's job.
 *
 * Weights are tunable via DEFAULT_WEIGHTS but the dimension structure is
 * stable: callers can rely on factorBreakdown keys.
 */

import { db } from '../../db';
import { eq, and, gte, sql } from 'drizzle-orm';
import {
  employees,
  globalOfficers,
  coaileagueEmployeeProfiles,
  disciplinaryRecords,
  employeeEventLog,
  officerTrainingCertificates,
  employeeSkills,
  candidateInterviewSessions,
  interviewCandidates,
} from '@shared/schema';
import { createLogger } from '../../lib/logger';

const log = createLogger('scoreEngine');

export const DEFAULT_WEIGHTS = {
  attendance: 0.25,
  performance: 0.20,
  behavior: 0.15,
  paperwork: 0.10,
  training: 0.10,
  interview: 0.08,
  veteran: 0.04,
  bilingual: 0.04,
  tenure: 0.04,
} as const;

export type ScoreDimension = keyof typeof DEFAULT_WEIGHTS;

export interface ScoreFactorBreakdown {
  attendance: number;       // 0-100
  performance: number;
  behavior: number;
  paperwork: number;
  training: number;
  interview: number;
  veteran: number;
  bilingual: number;
  tenure: number;
}

export interface ScoreResult {
  globalOfficerId: string;
  score: number;            // 0-100 weighted composite
  tier: ScoreTier;
  factorBreakdown: ScoreFactorBreakdown;
  weightsUsed: typeof DEFAULT_WEIGHTS;
  computedAt: Date;
}

export type ScoreTier =
  | 'highly_favorable'    // 90-100
  | 'favorable'           // 75-89
  | 'less_favorable'      // 60-74
  | 'low_priority'        // 45-59
  | 'minimum_priority'    // 30-44
  | 'hard_blocked';       // 0-29

export function scoreToTier(score: number): ScoreTier {
  if (score >= 90) return 'highly_favorable';
  if (score >= 75) return 'favorable';
  if (score >= 60) return 'less_favorable';
  if (score >= 45) return 'low_priority';
  if (score >= 30) return 'minimum_priority';
  return 'hard_blocked';
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

// ────────────────────────────────────────────────────────────────────────────
// DIMENSION COMPUTATIONS
// Each helper returns a 0-100 score for the dimension. Inputs come from rows
// already in the DB — the engine does not assume a fresh event was just emitted.
// ────────────────────────────────────────────────────────────────────────────

async function computeAttendanceScore(employeeId: string): Promise<number> {
  // Pull aggregates from coaileague_employee_profiles which already tracks
  // shift outcomes per employee. Reuse, do not recompute.
  const [profile] = await db
    .select({
      assigned: coaileagueEmployeeProfiles.totalShiftsAssigned,
      completed: coaileagueEmployeeProfiles.shiftsCompleted,
      noShow: coaileagueEmployeeProfiles.shiftsNoShow,
      callOff: coaileagueEmployeeProfiles.shiftsCallOff,
      lateCallOff: coaileagueEmployeeProfiles.shiftsLateCallOff,
      onTime: coaileagueEmployeeProfiles.clockInsOnTime,
      late: coaileagueEmployeeProfiles.clockInsLate,
    })
    .from(coaileagueEmployeeProfiles)
    .where(eq(coaileagueEmployeeProfiles.employeeId, employeeId))
    .limit(1);

  if (!profile || (profile.assigned ?? 0) === 0) return 75; // default for fresh hires

  const assigned = profile.assigned ?? 1;
  const completed = profile.completed ?? 0;
  const noShows = profile.noShow ?? 0;
  const lateCallOffs = profile.lateCallOff ?? 0;
  const totalClockIns = (profile.onTime ?? 0) + (profile.late ?? 0);
  const onTimeRatio = totalClockIns === 0 ? 1 : (profile.onTime ?? 0) / totalClockIns;

  // Penalize no_show heavily, late_call_off moderately, late clock-in lightly.
  const completionRate = completed / assigned;
  const noShowPenalty = (noShows / assigned) * 50;
  const lateCallOffPenalty = (lateCallOffs / assigned) * 20;
  const onTimeBonus = onTimeRatio * 15;

  return clamp(85 + onTimeBonus + completionRate * 10 - noShowPenalty - lateCallOffPenalty);
}

async function computePerformanceScore(employeeId: string): Promise<number> {
  const [emp] = await db
    .select({
      perf: employees.performanceScore,
      rating: employees.rating,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!emp) return 75;
  // employees.performanceScore is already 0-100; rating is 0-5 stars. Combine.
  const perf = emp.perf ?? 75;
  const ratingPct = ((Number(emp.rating ?? 4) / 5) * 100);
  return clamp(perf * 0.7 + ratingPct * 0.3);
}

async function computeBehaviorScore(employeeId: string): Promise<number> {
  // Start at 100, subtract for active discipline records, add for commendations.
  const records = await db
    .select({
      type: disciplinaryRecords.recordType,
      issuedAt: disciplinaryRecords.issuedAt,
    })
    .from(disciplinaryRecords)
    .where(eq(disciplinaryRecords.employeeId, employeeId));

  let score = 100;
  for (const r of records) {
    switch (r.type) {
      case 'commendation':           score += 5; break;
      case 'verbal_caution':         score -= 2; break;
      case 'verbal_warning':         score -= 5; break;
      case 'written_warning':        score -= 12; break;
      case 'termination_warning':    score -= 25; break;
      case 'pip':                    score -= 18; break;
      case 'suspension':             score -= 20; break;
      case 'termination':            score -= 50; break;
    }
  }
  return clamp(score);
}

async function computePaperworkScore(employeeId: string): Promise<number> {
  // Reuse complianceScore which already tracks documents + post orders + interventions.
  const [emp] = await db
    .select({ complianceScore: employees.complianceScore })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  return clamp(emp?.complianceScore ?? 75);
}

async function computeTrainingScore(employeeId: string): Promise<number> {
  // Base from trainingCompletionPercentage; bonus for non-required certs.
  const [emp] = await db
    .select({ trainingPct: employees.trainingCompletionPercentage })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  const baseScore = emp?.trainingPct ?? 75;

  // Count non-required certs that are still valid → bonus up to +15
  const now = new Date();
  const certs = await db
    .select({
      validUntil: officerTrainingCertificates.validUntil,
    })
    .from(officerTrainingCertificates)
    .where(eq(officerTrainingCertificates.employeeId, employeeId));

  const activeCerts = certs.filter((c: { validUntil: Date | null }) => !c.validUntil || c.validUntil > now);
  const beyondRequiredBonus = Math.min(15, activeCerts.length * 2);

  return clamp(baseScore + beyondRequiredBonus);
}

async function computeInterviewScore(employeeId: string, globalOfficerId: string): Promise<number> {
  // Look for any Trinity interview tied to this person, by employeeId or by
  // the candidate that became this employee.
  const [emp] = await db
    .select({ email: employees.email })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!emp?.email) return 75;

  const [candidate] = await db
    .select({ id: interviewCandidates.id, qualScore: interviewCandidates.qualificationScore })
    .from(interviewCandidates)
    .where(eq(interviewCandidates.email, emp.email))
    .limit(1);
  if (!candidate) return 75;

  const sessions = await db
    .select({ score: candidateInterviewSessions.sessionScore })
    .from(candidateInterviewSessions)
    .where(eq(candidateInterviewSessions.candidateId, candidate.id));

  if (sessions.length === 0) return clamp(candidate.qualScore ?? 75);

  const avgSession = sessions.reduce((s: number, x: { score: number | null }) => s + (x.score ?? 0), 0) / sessions.length;
  const qualWeight = 0.4;
  const sessionWeight = 0.6;
  return clamp((candidate.qualScore ?? 75) * qualWeight + avgSession * sessionWeight);
}

function computeVeteranScore(officer: { veteranStatus: boolean | null; veteranVerifiedAt: Date | null }): number {
  // DD-214 verification gates the full credit. Per locked decision (see plan):
  // self-attest alone does NOT count.
  if (officer.veteranStatus && officer.veteranVerifiedAt) return 100;
  return 0;
}

async function computeBilingualScore(employeeId: string, officer: { primaryLanguages: string[] | null; bilingualVerified: boolean | null }): Promise<number> {
  // Cross-check that at least one non-English language is verified in employeeSkills.
  if (!officer.primaryLanguages || officer.primaryLanguages.length <= 1) return 0;

  const langSkills = await db
    .select({ verified: employeeSkills.verified, name: employeeSkills.skillName })
    .from(employeeSkills)
    .where(and(
      eq(employeeSkills.employeeId, employeeId),
      eq(employeeSkills.skillCategory, 'language'),
    ));

  const hasVerifiedLang = langSkills.some((s: { verified: boolean | null }) => s.verified);
  if (hasVerifiedLang || officer.bilingualVerified) return 100;
  return 50; // partial credit for self-attestation
}

async function computeTenureScore(globalOfficerId: string): Promise<number> {
  const [officer] = await db
    .select({ firstSeenAt: globalOfficers.firstSeenAt })
    .from(globalOfficers)
    .where(eq(globalOfficers.id, globalOfficerId))
    .limit(1);

  if (!officer?.firstSeenAt) return 0;
  const months = (Date.now() - officer.firstSeenAt.getTime()) / (1000 * 60 * 60 * 24 * 30);

  // 0 at <1mo, scales to 100 at >=60 months (5 years platform tenure)
  return clamp((months / 60) * 100);
}

// ────────────────────────────────────────────────────────────────────────────
// COMPOSITE
// ────────────────────────────────────────────────────────────────────────────

export async function computeOfficerScore(
  employeeId: string,
  globalOfficerId: string,
  weights = DEFAULT_WEIGHTS,
): Promise<ScoreResult> {
  const [officer] = await db
    .select()
    .from(globalOfficers)
    .where(eq(globalOfficers.id, globalOfficerId))
    .limit(1);
  if (!officer) {
    throw new Error(`[scoreEngine] global officer ${globalOfficerId} not found`);
  }

  const [
    attendance,
    performance,
    behavior,
    paperwork,
    training,
    interview,
    bilingual,
    tenure,
  ] = await Promise.all([
    computeAttendanceScore(employeeId),
    computePerformanceScore(employeeId),
    computeBehaviorScore(employeeId),
    computePaperworkScore(employeeId),
    computeTrainingScore(employeeId),
    computeInterviewScore(employeeId, globalOfficerId),
    computeBilingualScore(employeeId, officer),
    computeTenureScore(globalOfficerId),
  ]);

  const veteran = computeVeteranScore(officer);

  const factorBreakdown: ScoreFactorBreakdown = {
    attendance, performance, behavior, paperwork, training, interview,
    veteran, bilingual, tenure,
  };

  const score = clamp(
    attendance * weights.attendance +
    performance * weights.performance +
    behavior * weights.behavior +
    paperwork * weights.paperwork +
    training * weights.training +
    interview * weights.interview +
    veteran * weights.veteran +
    bilingual * weights.bilingual +
    tenure * weights.tenure,
  );

  return {
    globalOfficerId,
    score,
    tier: scoreToTier(score),
    factorBreakdown,
    weightsUsed: weights,
    computedAt: new Date(),
  };
}

/**
 * Persist a score result: updates globalOfficers + appends a row to
 * employeeEventLog for provenance. Returns the persisted result.
 */
export async function persistOfficerScore(
  employeeId: string,
  workspaceId: string,
  result: ScoreResult,
): Promise<ScoreResult> {
  const [previous] = await db
    .select({ score: globalOfficers.currentScore })
    .from(globalOfficers)
    .where(eq(globalOfficers.id, result.globalOfficerId))
    .limit(1);

  await db.update(globalOfficers).set({
    currentScore: result.score,
    currentTier: result.tier,
    scoreFactorBreakdown: result.factorBreakdown as unknown as Record<string, unknown>,
    lastScoreRecomputeAt: result.computedAt,
    lastUpdatedAt: result.computedAt,
    updatedAt: result.computedAt,
  }).where(eq(globalOfficers.id, result.globalOfficerId));

  await db.insert(employeeEventLog).values({
    workspaceId,
    employeeId,
    eventType: 'manual_adjustment',
    eventSource: 'system',
    pointsChange: 0,
    previousOverallScore: previous?.score ? String(previous.score / 100) : null,
    newOverallScore: String(result.score / 100),
    metadata: {
      engine: 'scoreEngineService.v1',
      tier: result.tier,
      factorBreakdown: result.factorBreakdown,
      weights: result.weightsUsed,
    } as unknown as Record<string, unknown>,
    isAutomatic: true,
  });

  log.info(`[scoreEngine] employee=${employeeId} prev=${previous?.score ?? 'init'} → new=${result.score} (${result.tier})`);
  return result;
}

export async function recomputeAndPersist(
  employeeId: string,
  globalOfficerId: string,
  workspaceId: string,
): Promise<ScoreResult> {
  const result = await computeOfficerScore(employeeId, globalOfficerId);
  return persistOfficerScore(employeeId, workspaceId, result);
}
