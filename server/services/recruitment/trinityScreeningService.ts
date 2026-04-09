/**
 * TRINITY SCREENING SERVICE
 * Phase 58 — Trinity Interview Pipeline
 *
 * Provides AI-powered candidate screening: initial qualification scoring,
 * email question generation, response scoring, and scorecard generation.
 */

import { db } from '../../db';
import {
  interviewCandidates,
  candidateInterviewSessions,
  interviewQuestionsBank,
  interviewScorecards,
  type InterviewCandidate,
  type CandidateInterviewSession,
} from '@shared/schema';
import { eq, and, or, isNull, asc, desc } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityScreeningService');


// Dynamic import for AI to avoid circular deps
async function getAIClient() {
  const { UnifiedGeminiClient } = await import('../ai-brain/providers/geminiClient');
  return new UnifiedGeminiClient();
}

// ─── Initial Qualification Screening (0-100) ─────────────────────────────────

export async function screenCandidate(
  candidate: InterviewCandidate,
  resumeText: string,
  positionType: string,
): Promise<{ score: number; reasoning: string; parsedData: Record<string, unknown> }> {
  try {
    const ai = await getAIClient();
    const prompt = `You are a security company HR screening AI. Evaluate this job applicant for a ${positionType} position.

APPLICANT EMAIL/RESUME TEXT:
${resumeText.slice(0, 3000)}

Return ONLY valid JSON with:
{
  "score": <number 0-100>,
  "reasoning": "<2-3 sentence explanation>",
  "parsedData": {
    "summary": "<brief profile>",
    "yearsExperience": <number or null>,
    "hasSgLicense": <boolean>,
    "hasArmedLicense": <boolean>,
    "availableShifts": ["<shift patterns>"],
    "languages": ["<list>"],
    "certifications": ["<list>"],
    "redFlags": ["<any issues>"],
    "strengths": ["<key strengths>"]
  }
}

Scoring guide:
- 85-100: Excellent fit, experienced, licensed, no red flags
- 70-84: Good fit, some experience or relevant background
- 60-69: Borderline, proceed with caution
- 40-59: Below threshold, missing key requirements
- 0-39: Not qualified, major gaps or red flags`;

    const response = await ai.generateContent(prompt, { temperature: 0.1, maxOutputTokens: 600 }); // withGemini
    const text = (response as any).trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
    const parsed = JSON.parse(text);

    return {
      score: Math.min(100, Math.max(0, Number(parsed.score) || 0)),
      reasoning: String(parsed.reasoning || ''),
      parsedData: parsed.parsedData || {},
    };
  } catch (err: any) {
    log.warn('[TrinityScreening] Screening error:', err.message);
    return { score: 0, reasoning: 'AI screening unavailable', parsedData: {} };
  }
}

// ─── Generate Round Questions ─────────────────────────────────────────────────

export async function getQuestionsForRound(
  workspaceId: string,
  positionType: string,
  round: number,
  round1Responses?: Array<{ questionId: string; score: number }>,
): Promise<Array<{ id: string; questionText: string; questionCategory: string; maxScore: number }>> {
  // Fetch questions: workspace-specific first, then platform defaults
  const workspaceCondition = or(
    eq(interviewQuestionsBank.workspaceId, workspaceId),
    isNull(interviewQuestionsBank.workspaceId),
  ) as SQL;
  const positionCondition = or(
    eq(interviewQuestionsBank.positionType, positionType),
    eq(interviewQuestionsBank.positionType, 'all'),
  ) as SQL;

  const questions = await db.select()
    .from(interviewQuestionsBank)
    .where(and(
      workspaceCondition,
      positionCondition,
      eq(interviewQuestionsBank.round, round),
      eq(interviewQuestionsBank.isActive, true),
    ))
    .orderBy(asc(interviewQuestionsBank.displayOrder));

  if (round === 1) {
    // Return 3-5 questions for Round 1
    return questions.slice(0, 5).map(q => ({
      id: q.id,
      questionText: q.questionText,
      questionCategory: q.questionCategory,
      maxScore: q.maxScore || 10,
    }));
  }

  // Round 2: apply branching logic based on Round 1 scores
  if (round1Responses && round1Responses.length > 0) {
    type BranchCondition = { if?: { round1QuestionId?: string; scoreRange?: [number, number] } };
    const filtered = questions.filter(q => {
      const condition = q.branchCondition as BranchCondition | null;
      if (!condition) return true; // No condition = always include

      const r1Score = round1Responses.find(r => r.questionId === condition?.if?.round1QuestionId);
      if (!r1Score) return true;

      const [min, max]: [number, number] = condition?.if?.scoreRange || [0, 10];
      return r1Score.score >= min && r1Score.score <= max;
    });
    return filtered.slice(0, 5).map(q => ({
      id: q.id,
      questionText: q.questionText,
      questionCategory: q.questionCategory,
      maxScore: q.maxScore || 10,
    }));
  }

  return questions.slice(0, 5).map(q => ({
    id: q.id,
    questionText: q.questionText,
    questionCategory: q.questionCategory,
    maxScore: q.maxScore || 10,
  }));
}

// ─── Score a Response ─────────────────────────────────────────────────────────

export async function scoreResponse(
  questionText: string,
  responseText: string,
  scoringCriteria: Record<string, unknown> | null,
  maxScore: number = 10,
): Promise<{ score: number; notes: string }> {
  try {
    const ai = await getAIClient();
    const criteriaText = scoringCriteria
      ? JSON.stringify(scoringCriteria, null, 2)
      : 'Look for relevant experience, specificity, and professionalism.';

    const prompt = `You are scoring a security job interview response.

QUESTION: ${questionText}

CANDIDATE RESPONSE: ${responseText.slice(0, 1000)}

SCORING CRITERIA:
${criteriaText}

Max score: ${maxScore}

Return ONLY valid JSON:
{
  "score": <number 0-${maxScore}>,
  "notes": "<one sentence explanation of score>"
}`;

    const response = await ai.generateContent(prompt, { temperature: 0.1, maxOutputTokens: 200 }); // withGemini
    const text = (response as any).trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
    const parsed = JSON.parse(text);

    return {
      score: Math.min(maxScore, Math.max(0, Number(parsed.score) || 0)),
      notes: String(parsed.notes || ''),
    };
  } catch {
    return { score: 0, notes: 'Scoring unavailable' };
  }
}

// ─── Generate Final Scorecard ─────────────────────────────────────────────────

export async function generateScorecard(
  candidateId: string,
  workspaceId: string,
): Promise<void> {
  // Always enforce workspace scoping — prevents cross-tenant IDOR
  const [candidate] = await db.select()
    .from(interviewCandidates)
    .where(and(
      eq(interviewCandidates.id, candidateId),
      eq(interviewCandidates.workspaceId, workspaceId),
    ))
    .limit(1);

  if (!candidate) return;

  // Sessions scoped to workspace (via candidateId which is now workspace-verified)
  const sessions = await db.select()
    .from(candidateInterviewSessions)
    .where(and(
      eq(candidateInterviewSessions.candidateId, candidateId),
      eq(candidateInterviewSessions.workspaceId, workspaceId),
      eq(candidateInterviewSessions.status, 'completed'),
    ));

  // Compute composite scores
  let communicationScore = 0;
  let availabilityScore = 0;
  let experienceScore = candidate.qualificationScore || 0;
  let sessionCount = 0;

  type SessionResponse = { questionId?: string; score?: number; notes?: string };
  type ParsedResume = { availableShifts?: string[] };

  for (const session of sessions) {
    const responses: SessionResponse[] = Array.isArray(session.responsesReceived)
      ? (session.responsesReceived as SessionResponse[])
      : [];
    if (responses.length > 0) {
      const avgScore = responses.reduce((sum: number, r: SessionResponse) => sum + (r.score || 0), 0) / responses.length;
      communicationScore += avgScore * 10; // Normalize to 0-100
      sessionCount++;
    }
  }

  if (sessionCount > 0) communicationScore = Math.round(communicationScore / sessionCount);

  // Extract availability from parsed resume
  const parsed = candidate.resumeParsed as ParsedResume | null;
  availabilityScore = (parsed?.availableShifts?.length ?? 0) > 1 ? 80 : 60;

  const overallScore = Math.round(
    (experienceScore * 0.4) +
    (communicationScore * 0.4) +
    (availabilityScore * 0.2),
  );

  // Generate Trinity recommendation
  let trinityRecommendation: string;
  let trinityReasoning: string;

  if (overallScore >= 80) {
    trinityRecommendation = 'hire';
    trinityReasoning = `Candidate scored ${overallScore}/100 composite. Strong experience (${experienceScore}), excellent communication (${communicationScore}), good availability (${availabilityScore}). Trinity recommends extending an offer.`;
  } else if (overallScore >= 65) {
    trinityRecommendation = 'advance';
    trinityReasoning = `Candidate scored ${overallScore}/100 composite. Meets baseline requirements with room for development. Trinity recommends advancing to next round.`;
  } else if (overallScore >= 50) {
    trinityRecommendation = 'hold';
    trinityReasoning = `Candidate scored ${overallScore}/100 composite. Mixed signals — some strengths but notable gaps. Trinity recommends holding for comparison with other candidates.`;
  } else {
    trinityRecommendation = 'reject';
    trinityReasoning = `Candidate scored ${overallScore}/100 composite. Does not meet minimum requirements for this position. Trinity recommends not proceeding.`;
  }

  // Find session IDs by type
  const emailR1 = sessions.find(s => s.sessionType === 'email_round_1');
  const emailR2 = sessions.find(s => s.sessionType === 'email_round_2');
  const chatSession = sessions.find(s => s.sessionType === 'chat_interview');
  const voiceSession = sessions.find(s => s.sessionType === 'voice_interview');

  // Check for existing scorecard (update if exists)
  const [existingScorecard] = await db.select()
    .from(interviewScorecards)
    .where(eq(interviewScorecards.candidateId, candidateId))
    .limit(1);

  if (existingScorecard) {
    await db.update(interviewScorecards)
      .set({
        qualificationScore: experienceScore,
        communicationScore,
        availabilityScore,
        experienceScore,
        overallScore,
        trinityRecommendation,
        trinityReasoning,
        emailRound1SessionId: emailR1?.id || null,
        emailRound2SessionId: emailR2?.id || null,
        chatSessionId: chatSession?.id || null,
        voiceSessionId: voiceSession?.id || null,
        generatedAt: new Date(),
        version: (existingScorecard.version || 1) + 1,
        updatedAt: new Date(),
      })
      .where(eq(interviewScorecards.id, existingScorecard.id));
  } else {
    await db.insert(interviewScorecards).values({
      workspaceId,
      candidateId,
      qualificationScore: experienceScore,
      communicationScore,
      availabilityScore,
      experienceScore,
      overallScore,
      trinityRecommendation,
      trinityReasoning,
      emailRound1SessionId: emailR1?.id || null,
      emailRound2SessionId: emailR2?.id || null,
      chatSessionId: chatSession?.id || null,
      voiceSessionId: voiceSession?.id || null,
      generatedAt: new Date(),
      generatedBy: 'trinity',
      version: 1,
    });
  }
}

// ─── Ranked Summary ───────────────────────────────────────────────────────────

export async function getRankedSummary(
  workspaceId: string,
  positionType?: string,
): Promise<Array<{
  candidate: InterviewCandidate;
  overallScore: number;
  recommendation: string;
  reasoning: string;
}>> {
  const scorecards = await db.select()
    .from(interviewScorecards)
    .where(eq(interviewScorecards.workspaceId, workspaceId));

  const candidateIds = scorecards.map(s => s.candidateId);
  if (candidateIds.length === 0) return [];

  const candidates = await db.select()
    .from(interviewCandidates)
    .where(and(
      eq(interviewCandidates.workspaceId, workspaceId),
      ...(positionType ? [eq(interviewCandidates.positionType, positionType)] : []),
    ));

  const candidateMap = new Map(candidates.map(c => [c.id, c]));

  return scorecards
    .filter(s => candidateMap.has(s.candidateId))
    .map(s => ({
      candidate: candidateMap.get(s.candidateId)!,
      overallScore: s.overallScore || 0,
      recommendation: s.trinityRecommendation || 'unknown',
      reasoning: s.trinityReasoning || '',
    }))
    .sort((a, b) => b.overallScore - a.overallScore);
}
