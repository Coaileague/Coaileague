/**
 * SCORECARD SERVICE
 * Phase 58 — Trinity Interview Pipeline
 *
 * Aggregates scores across all interview rounds (email R1, email R2,
 * chat_interview, voice_interview) into a composite scorecard persisted
 * in the `interview_scorecards` table.
 *
 * Entry points:
 *   generateComprehensiveScorecard — full re-compute from all sessions
 *   upsertSessionScore             — update a single session score and refresh composite
 *   getRankedSummary               — workspace-wide ranked list (delegates to Trinity)
 */

import { db } from '../../db';
import {
  interviewCandidates,
  candidateInterviewSessions,
  interviewScorecards,
  type InterviewCandidate,
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getRankedSummary } from './trinityScreeningService';
import { createLogger } from '../../lib/logger';

export { getRankedSummary };

const log = createLogger('ScorecardService');

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionScores {
  emailRound1?: { score: number; sessionId: string };
  emailRound2?: { score: number; sessionId: string };
  chat?: { score: number; sessionId: string };
  voice?: { score: number; sessionId: string };
}

// ─── Read Session Scores for a Candidate ────────────────────────────────────

async function readSessionScores(
  candidateId: string,
  workspaceId: string,
): Promise<SessionScores> {
  const sessions = await db.select({
    id: candidateInterviewSessions.id,
    sessionType: candidateInterviewSessions.sessionType,
    status: candidateInterviewSessions.status,
    sessionScore: candidateInterviewSessions.sessionScore,
  })
    .from(candidateInterviewSessions)
    .where(and(
      eq(candidateInterviewSessions.candidateId, candidateId),
      eq(candidateInterviewSessions.workspaceId, workspaceId),
    ))
    .orderBy(desc(candidateInterviewSessions.createdAt));

  const result: SessionScores = {};

  for (const s of sessions) {
    if (s.sessionScore === null) continue;
    switch (s.sessionType) {
      case 'email_round_1':
        if (!result.emailRound1) result.emailRound1 = { score: s.sessionScore, sessionId: s.id };
        break;
      case 'email_round_2':
        if (!result.emailRound2) result.emailRound2 = { score: s.sessionScore, sessionId: s.id };
        break;
      case 'chat_interview':
        if (!result.chat) result.chat = { score: s.sessionScore, sessionId: s.id };
        break;
      case 'voice_interview':
        if (!result.voice) result.voice = { score: s.sessionScore, sessionId: s.id };
        break;
    }
  }

  return result;
}

// ─── Compute Composite Score ──────────────────────────────────────────────────
// Weighted average over available scores:
//   email R1:  20 %   email R2:  25 %
//   chat:      30 %   voice:     25 %
// If a stage hasn't been completed yet only the present scores are averaged
// (weights are normalised so they still sum to 100 %).

function computeCompositeScore(scores: SessionScores): number {
  const weights: Array<[number | undefined, number]> = [
    [scores.emailRound1?.score, 20],
    [scores.emailRound2?.score, 25],
    [scores.chat?.score, 30],
    [scores.voice?.score, 25],
  ];

  const present = weights.filter(([s]) => s !== undefined) as Array<[number, number]>;
  if (present.length === 0) return 0;

  const totalWeight = present.reduce((acc, [, w]) => acc + w, 0);
  const weighted = present.reduce((acc, [s, w]) => acc + s * w, 0);
  return Math.round(weighted / totalWeight);
}

// ─── Recommendation from Score ────────────────────────────────────────────────

function recommendationFromScore(
  score: number,
  hasVoice: boolean,
  hasChat: boolean,
): string {
  if (score >= 80 && (hasVoice || hasChat)) return 'hire';
  if (score >= 70) return 'advance';
  if (score >= 50) return 'hold';
  return 'reject';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Full scorecard re-compute: reads all completed sessions for a candidate,
 * calculates the composite score, and upserts the `interview_scorecards` row.
 */
export async function generateComprehensiveScorecard(
  candidateId: string,
  workspaceId: string,
): Promise<void> {
  try {
    const [candidate] = await db.select()
      .from(interviewCandidates)
      .where(and(
        eq(interviewCandidates.id, candidateId),
        eq(interviewCandidates.workspaceId, workspaceId),
      ))
      .limit(1);

    if (!candidate) {
      log.warn(`[ScorecardService] Candidate ${candidateId} not found`);
      return;
    }

    const sessionScores = await readSessionScores(candidateId, workspaceId);
    const overallScore = computeCompositeScore(sessionScores);
    const recommendation = recommendationFromScore(
      overallScore,
      sessionScores.voice !== undefined,
      sessionScores.chat !== undefined,
    );

    const scorecardValues = {
      workspaceId,
      candidateId,
      qualificationScore: candidate.qualificationScore ?? undefined,
      communicationScore: sessionScores.emailRound1?.score ?? sessionScores.emailRound2?.score,
      availabilityScore: undefined,
      experienceScore: undefined,
      overallScore,
      trinityRecommendation: recommendation,
      trinityReasoning: `Composite score of ${overallScore}/100 based on ${Object.keys(sessionScores).length} completed interview stage(s). Trinity recommendation: ${recommendation}.`,
      emailRound1SessionId: sessionScores.emailRound1?.sessionId,
      emailRound2SessionId: sessionScores.emailRound2?.sessionId,
      chatSessionId: sessionScores.chat?.sessionId,
      voiceSessionId: sessionScores.voice?.sessionId,
      generatedAt: new Date(),
      generatedBy: 'trinity',
      version: 1,
    };

    // Check for existing scorecard
    const [existing] = await db.select({ id: interviewScorecards.id, version: interviewScorecards.version })
      .from(interviewScorecards)
      .where(and(
        eq(interviewScorecards.candidateId, candidateId),
        eq(interviewScorecards.workspaceId, workspaceId),
      ))
      .orderBy(desc(interviewScorecards.generatedAt))
      .limit(1);

    if (existing) {
      await db.update(interviewScorecards)
        .set({
          ...scorecardValues,
          version: (existing.version ?? 1) + 1,
          updatedAt: new Date(),
        })
        .where(eq(interviewScorecards.id, existing.id));
    } else {
      await db.insert(interviewScorecards).values(scorecardValues);
    }

    log.info(`[ScorecardService] Scorecard upserted for candidate ${candidateId} — score: ${overallScore}, recommendation: ${recommendation}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`[ScorecardService] Failed to generate scorecard for ${candidateId}: ${msg}`);
  }
}

/**
 * Update the session score for a single completed session, then refresh
 * the composite scorecard automatically.
 */
export async function upsertSessionScore(
  sessionId: string,
  workspaceId: string,
  score: number,
): Promise<void> {
  const [session] = await db.select({ candidateId: candidateInterviewSessions.candidateId })
    .from(candidateInterviewSessions)
    .where(and(
      eq(candidateInterviewSessions.id, sessionId),
      eq(candidateInterviewSessions.workspaceId, workspaceId),
    ))
    .limit(1);

  if (!session) return;

  await db.update(candidateInterviewSessions)
    .set({ sessionScore: score, updatedAt: new Date() })
    .where(eq(candidateInterviewSessions.id, sessionId));

  await generateComprehensiveScorecard(session.candidateId, workspaceId);
}
