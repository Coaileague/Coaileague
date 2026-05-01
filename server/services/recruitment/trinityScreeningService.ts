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

// ─── Trinity Security Score Types ────────────────────────────────────────────

export interface TrinityScoreDimension {
  score: number;
  notes: string;
}

export interface TrinityScoreDimensions {
  license_eligibility: TrinityScoreDimension;
  experience_fit: TrinityScoreDimension;
  reliability_signals: TrinityScoreDimension;
  liability_indicators: TrinityScoreDimension;
  operational_fit: TrinityScoreDimension;
  speed_to_deploy: TrinityScoreDimension;
}

export interface TrinityApplicantFlag {
  type: 'license_issue' | 'gap' | 'termination_signal' | 'disqualifier' | 'armed_risk' | 'verify_required';
  severity: 'critical' | 'warning' | 'info';
  description: string;
}

// ─── Trinity Security Applicant Scorer ───────────────────────────────────────
//
// Industry-specific scoring for private security positions.
// Replaces the generic HR prompt with a 6-dimension security-specific
// evaluation that covers Texas DPS licensing, armed/unarmed requirements,
// reliability signals, and liability indicators.
//
// Legal compliance: Recommendations only — management makes the decision.
// No protected class characteristics are considered. EEOC compliant.

export async function screenCandidate(
  candidate: InterviewCandidate,
  resumeText: string,
  positionType: string,
  options?: {
    isArmedRole?: boolean;
    stateJurisdiction?: string; // 'TX' | 'FL' | etc.
    siteType?: string;          // 'hospital' | 'retail' | 'corporate' | 'government'
    requiresBilingual?: boolean;
    sponsorshipAvailable?: boolean;
  },
): Promise<{
  score: number;
  reasoning: string;
  parsedData: Record<string, unknown>;
  dimensions: TrinityScoreDimensions;
  flags: TrinityApplicantFlag[];
  recommendation: 'hire' | 'advance' | 'hold' | 'reject';
  liabilityIndicators: string[];
}> {
  const isArmed = options?.isArmedRole || positionType.includes('armed');
  const state = options?.stateJurisdiction || 'TX';

  try {
    const ai = await getAIClient();

    const prompt = `You are Trinity, an AI staffing intelligence system for private security companies.
Evaluate this ${isArmed ? 'ARMED' : 'UNARMED'} security officer applicant for ${options?.siteType || 'general'} deployment in ${state}.

APPLICANT INFORMATION:
${resumeText.slice(0, 4000)}

POSITION REQUIREMENTS:
- Role type: ${positionType}
- Armed: ${isArmed ? 'YES — requires valid armed security license/commission' : 'NO — unarmed only'}
- State: ${state}
- Site type: ${options?.siteType || 'general'}
- Bilingual required: ${options?.requiresBilingual ? 'YES' : 'NO'}
- License sponsorship available: ${options?.sponsorshipAvailable ? 'YES' : 'NO'}

${state === 'TX' ? `TEXAS LICENSING RULES (OC Chapter 1702):
- Unarmed: Level II Non-Commissioned Security Officer registration required
- Armed: Level III Commissioned Security Officer license required
- Pre-license work (unarmed only): Allowed if TOPS shows "Licensed" OR "Substantially Complete Application" within 48hr of submission, plus employer background check (OC §1702.230)
- Armed pre-license work: NEVER allowed under any circumstance
- License must not show Denied or Suspended status on TOPS` : ''}

Evaluate across these 6 dimensions. Return ONLY valid JSON, no preamble:

{
  "dimensions": {
    "license_eligibility": {
      "score": <0-25>,
      "notes": "<what license status signals were found>"
    },
    "experience_fit": {
      "score": <0-20>,
      "notes": "<years, industry type, site match>"
    },
    "reliability_signals": {
      "score": <0-20>,
      "notes": "<employment pattern, gaps, tenure>"
    },
    "liability_indicators": {
      "score": <0-20>,
      "notes": "<red flags, use of force history, termination signals>"
    },
    "operational_fit": {
      "score": <0-10>,
      "notes": "<availability, location, shift match>"
    },
    "speed_to_deploy": {
      "score": <0-5>,
      "notes": "<how fast can they start, paperwork readiness>"
    }
  },
  "total_score": <0-100, sum of above>,
  "recommendation": "<hire|advance|hold|reject>",
  "reasoning": "<2-3 sentence overall assessment>",
  "flags": [
    {
      "type": "<license_issue|gap|termination_signal|disqualifier|armed_risk|verify_required>",
      "severity": "<critical|warning|info>",
      "description": "<specific concern>"
    }
  ],
  "liability_indicators": ["<list of specific liability concerns for legal review>"],
  "parsedData": {
    "summary": "<1-2 sentence profile>",
    "yearsExperience": <number or null>,
    "hasSgLicense": <boolean>,
    "hasArmedLicense": <boolean>,
    "licenseNumber": "<if stated>",
    "licenseState": "<state code if stated>",
    "wantsSponsorship": <boolean>,
    "availableShifts": ["<day|night|weekend|etc>"],
    "languages": ["<list>"],
    "certifications": ["<list>"],
    "militaryBackground": <boolean>,
    "lawEnforcementBackground": <boolean>,
    "employmentGaps": [{"period": "<dates>", "duration_months": <n>}],
    "redFlags": ["<specific issues>"],
    "strengths": ["<key strengths>"]
  }
}

SCORING GUIDE:
License Eligibility (0-25):
  25: Valid active license for role type, current, in correct state
  18: License valid but different state — needs transfer
  12: No license but qualifies for substantially_complete (unarmed only)
  8:  No license but sponsorship requested and position allows it
  0:  Armed role with no license — disqualify immediately
  DEDUCT 15: Any mention of license denial, revocation, or suspension

Experience Fit (0-20):
  2pts per year security experience (cap 10)
  +8: Military or law enforcement background
  +5: Site-type match (hospital/retail/corporate/government)
  +5: Armed experience specifically if armed role

Reliability Signals (0-20):
  +10: No employment gaps > 6 months in last 3 years
  +5: Single security employer for 2+ years
  +3: Explanation provided for any gaps
  -10 per pattern: Multiple jobs < 90 days (job hopping)
  -5: Frequent changes among security companies < 1 year each

Liability Indicators (0-20):
  +10: Clean work history, no concerning language
  +5: Proactive about background check consent
  +5: Professional tone, no confrontational language
  -20: Any mention of lawsuits against prior employers
  -15: Termination language suggesting conduct issues
  -10: Use-of-force incidents described without proper context
  FLAG: Any criminal history disclosure → critical flag for legal_agent review

Operational Fit (0-10):
  +5: Available shifts match posting requirements
  +3: Location proximity to posted sites
  +2: Bilingual (if required)

Speed to Deploy (0-5):
  +3: States availability to start immediately or within 1 week
  +2: Background check authorization language present

RECOMMENDATION LOGIC:
  85-100: hire — recommend immediate advancement to management review
  70-84:  advance — proceed to Round 1 email questions
  50-69:  hold — proceed with caution, flag specific concerns
  0-49:   reject — does not meet minimum requirements
  ANY critical flag: override to hold or reject regardless of score`;

    const response = await ai.generateContent(prompt, { temperature: 0.1, maxOutputTokens: 1200 });
    const text = (response as any).trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
    const parsed = JSON.parse(text);

    const totalScore = Math.min(100, Math.max(0, Number(parsed.total_score) || 0));

    return {
      score: totalScore,
      reasoning: String(parsed.reasoning || ''),
      parsedData: parsed.parsedData || {},
      dimensions: parsed.dimensions || ({} as TrinityScoreDimensions),
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      recommendation: parsed.recommendation || (totalScore >= 70 ? 'advance' : totalScore >= 50 ? 'hold' : 'reject'),
      liabilityIndicators: Array.isArray(parsed.liability_indicators) ? parsed.liability_indicators : [],
    };
  } catch (err: unknown) {
    log.warn('[TrinityScreening] Screening error:', err.message);
    return {
      score: 0,
      reasoning: 'AI screening temporarily unavailable — manual review required.',
      parsedData: {},
      dimensions: {} as TrinityScoreDimensions,
      flags: [{ type: 'verify_required', severity: 'warning', description: 'Auto-score failed — manual review needed' }],
      recommendation: 'hold',
      liabilityIndicators: [],
    };
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
