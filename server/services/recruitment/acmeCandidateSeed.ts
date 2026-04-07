/**
 * ACME CANDIDATE SEED
 * Phase 58 — Trinity Interview Pipeline
 *
 * Seeds test candidates into the ACME dev workspace, together with
 * representative interview sessions and scorecards so that each
 * pipeline stage is demonstrable without running a live interview.
 *
 * Candidates:
 *   1. Marcus  Williams  — email_round_2 (Round 1 completed, Round 2 in progress)
 *   2. Keisha  Jackson   — chat_interview (both email rounds done, score ≥ 75)
 *   3. David   Park      — decided/reject  (failed initial screening)
 *   4. Renata  Vasquez   — screening        (freshly applied)
 *
 * Production-guarded. Idempotent.
 */

import { db } from '../../db';
import {
  interviewCandidates,
  candidateInterviewSessions,
  interviewScorecards,
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { createCandidate } from './candidateService';

const WS = 'dev-acme-security-ws';

interface SeedCandidate {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  positionType: string;
  positionTitle: string;
  stage: string;
  qualificationScore?: number;
  decision?: 'hire' | 'reject' | 'hold';
  rawApplicationText?: string;
}

const SEED_CANDIDATES: SeedCandidate[] = [
  {
    firstName: 'Marcus',
    lastName: 'Williams',
    email: 'marcus.williams.candidate@mailtest.dev',
    positionType: 'unarmed_officer',
    positionTitle: 'Security Officer',
    stage: 'email_round_2',
    qualificationScore: 74,
    phone: '(214) 555-8901',
    rawApplicationText: `Hello,

I am writing to apply for the Security Officer position at ACME Security. I have 4 years of experience in security operations, including 2 years at DFW International Airport doing access control and perimeter patrols. I hold a valid Texas Security Guard License (Class A, expires 12/2026) and a valid TWIC card.

I am available for day, evening, and night shifts including weekends and holidays. I have my own reliable transportation (licensed driver). I am CPR/AED certified and completed de-escalation training in 2024.

Key experience:
- Access control operations (badge verification, visitor management)
- Incident report writing
- CCTV monitoring and alarm response
- Emergency response coordination

I look forward to the opportunity to join your team.

Best regards,
Marcus Williams
marcus.williams@example.com
(214) 555-8901`,
  },
  {
    firstName: 'Keisha',
    lastName: 'Jackson',
    email: 'keisha.jackson.candidate@mailtest.dev',
    positionType: 'armed_officer',
    positionTitle: 'Armed Security Officer',
    stage: 'chat_interview',
    qualificationScore: 91,
    phone: '(817) 555-2233',
    rawApplicationText: `To Whom It May Concern,

I am applying for the Armed Security Officer position. I am a Level III licensed armed security officer in Texas (expires 08/2026) and a current commissioned officer in Tarrant County. I qualified Expert on the Glock 19 at my last range qualification (94/100 score).

I have 7 years of experience in armed security, including 3 years protecting a federal courthouse. I am trained in use-of-force procedures, report writing, and emergency response.

Availability: Nights and weekends preferred. Open to full-time.

Previous employers:
- Securitas USA (3 years, Federal contract)
- Allied Universal (4 years, Commercial sites)

Certifications: Level III TX, CPR, First Aid, Handgun proficiency

Keisha Jackson`,
  },
  {
    firstName: 'David',
    lastName: 'Park',
    email: 'david.park.candidate@mailtest.dev',
    positionType: 'supervisor',
    positionTitle: 'Security Supervisor',
    stage: 'decided',
    decision: 'reject',
    qualificationScore: 22,
    phone: null,
    rawApplicationText: `Hi,

Applying for supervisor role. I have 2 months experience watching a parking lot. I don't have a security license yet but I heard I can get one online. I work part time and can only do Saturday mornings. I don't have a car but I take the bus.

Thanks
David`,
  },
  {
    firstName: 'Renata',
    lastName: 'Vasquez',
    email: 'renata.vasquez.candidate@mailtest.dev',
    positionType: 'unarmed_officer',
    positionTitle: 'Security Officer',
    stage: 'screening',
    qualificationScore: 58,
    phone: '(210) 555-0177',
    rawApplicationText: `Good afternoon,

I am interested in the Security Officer opening at ACME Security. I have 2 years of experience in security at a retail mall (Central Park Mall, San Antonio). I completed my Texas Security Training (Class B license) in 2024 and am currently in the process of upgrading to Class A.

I can work full-time, prefer days, and have reliable transportation. I am bilingual (English/Spanish) which has been helpful with diverse clientele.

Looking forward to speaking with you.

Renata Vasquez
(210) 555-0177`,
  },
];

// ─── Session + Scorecard Fixtures ────────────────────────────────────────────

interface SessionFixture {
  sessionType: string;
  status: string;
  sessionScore?: number;
  questionsAsked?: unknown;
  responsesReceived?: unknown;
  scoringBreakdown?: unknown;
  startedAt?: Date;
  completedAt?: Date;
}

interface ScorecardFixture {
  qualificationScore: number;
  communicationScore: number;
  availabilityScore: number;
  experienceScore: number;
  overallScore: number;
  trinityRecommendation: string;
  trinityReasoning: string;
}

function getSessionsForCandidate(email: string): SessionFixture[] {
  switch (email) {
    case 'marcus.williams.candidate@mailtest.dev':
      // Round 1 completed; Round 2 in progress
      return [
        {
          sessionType: 'email_round_1',
          status: 'completed',
          sessionScore: 74,
          questionsAsked: [
            { questionId: 'seed-q1', questionText: 'How many years of security experience do you have?', sentAt: new Date('2026-03-20T09:00:00Z') },
            { questionId: 'seed-q2', questionText: 'Describe a time you handled a difficult situation on post.', sentAt: new Date('2026-03-20T09:00:00Z') },
          ],
          responsesReceived: [
            { questionId: 'seed-q1', responseText: '4 years, 2 of which were at DFW International Airport doing access control.', receivedAt: new Date('2026-03-20T11:30:00Z'), score: 8, scoring_notes: 'Strong, verifiable experience' },
            { questionId: 'seed-q2', responseText: 'Encountered an aggressive visitor at the airport checkpoint. Used de-escalation and called supervisor.', receivedAt: new Date('2026-03-20T11:30:00Z'), score: 7, scoring_notes: 'Appropriate response, good awareness' },
          ],
          scoringBreakdown: { experience: 80, communication: 70, availability: 75 },
          startedAt: new Date('2026-03-20T09:00:00Z'),
          completedAt: new Date('2026-03-20T12:00:00Z'),
        },
        {
          sessionType: 'email_round_2',
          status: 'in_progress',
          questionsAsked: [
            { questionId: 'seed-q3', questionText: 'Are you comfortable working overnight shifts without a partner?', sentAt: new Date('2026-03-21T10:00:00Z') },
          ],
          startedAt: new Date('2026-03-21T10:00:00Z'),
        },
      ];

    case 'keisha.jackson.candidate@mailtest.dev':
      // Both email rounds completed; now in chat interview
      return [
        {
          sessionType: 'email_round_1',
          status: 'completed',
          sessionScore: 88,
          questionsAsked: [
            { questionId: 'seed-q4', questionText: 'Tell us about your armed security certifications.', sentAt: new Date('2026-03-18T09:00:00Z') },
          ],
          responsesReceived: [
            { questionId: 'seed-q4', responseText: 'Level III TX license, Glock 19 qualified Expert (94/100), CPR and First Aid certified.', receivedAt: new Date('2026-03-18T10:00:00Z'), score: 9, scoring_notes: 'Exceptional credentials' },
          ],
          scoringBreakdown: { experience: 95, communication: 88, availability: 80 },
          startedAt: new Date('2026-03-18T09:00:00Z'),
          completedAt: new Date('2026-03-18T11:00:00Z'),
        },
        {
          sessionType: 'email_round_2',
          status: 'completed',
          sessionScore: 91,
          questionsAsked: [
            { questionId: 'seed-q5', questionText: 'How do you handle use-of-force escalation decisions in the field?', sentAt: new Date('2026-03-19T09:00:00Z') },
          ],
          responsesReceived: [
            { questionId: 'seed-q5', responseText: 'Follow the UoF continuum: verbal commands first, then intermediate force only when justified. Always document.', receivedAt: new Date('2026-03-19T10:30:00Z'), score: 10, scoring_notes: 'Textbook answer, clear understanding of policy' },
          ],
          scoringBreakdown: { experience: 95, communication: 90, availability: 85 },
          startedAt: new Date('2026-03-19T09:00:00Z'),
          completedAt: new Date('2026-03-19T11:30:00Z'),
        },
        {
          sessionType: 'chat_interview',
          status: 'in_progress',
          startedAt: new Date('2026-03-22T14:00:00Z'),
        },
      ];

    case 'david.park.candidate@mailtest.dev':
      // Rejected after initial email — only a scorecard
      return [
        {
          sessionType: 'email_round_1',
          status: 'completed',
          sessionScore: 18,
          questionsAsked: [
            { questionId: 'seed-q6', questionText: 'How many years of security experience do you have?', sentAt: new Date('2026-03-15T09:00:00Z') },
          ],
          responsesReceived: [
            { questionId: 'seed-q6', responseText: 'About 2 months at a parking lot.', receivedAt: new Date('2026-03-15T13:00:00Z'), score: 2, scoring_notes: 'Insufficient experience for any position' },
          ],
          scoringBreakdown: { experience: 10, communication: 25, availability: 30 },
          startedAt: new Date('2026-03-15T09:00:00Z'),
          completedAt: new Date('2026-03-15T14:00:00Z'),
        },
      ];

    default:
      return [];
  }
}

function getScorecardForCandidate(email: string): ScorecardFixture | null {
  switch (email) {
    case 'marcus.williams.candidate@mailtest.dev':
      return {
        qualificationScore: 74,
        communicationScore: 70,
        availabilityScore: 75,
        experienceScore: 80,
        overallScore: 74,
        trinityRecommendation: 'advance',
        trinityReasoning: 'Candidate has solid experience and credentials. Round 2 email sent. Pending response before chat interview recommendation.',
      };
    case 'keisha.jackson.candidate@mailtest.dev':
      return {
        qualificationScore: 91,
        communicationScore: 89,
        availabilityScore: 82,
        experienceScore: 95,
        overallScore: 90,
        trinityRecommendation: 'hire',
        trinityReasoning: 'Outstanding candidate. Level III TX armed license, 7 years verified experience, excellent communication. Strongly recommend proceeding to voice interview and extending offer.',
      };
    case 'david.park.candidate@mailtest.dev':
      return {
        qualificationScore: 22,
        communicationScore: 25,
        availabilityScore: 20,
        experienceScore: 10,
        overallScore: 19,
        trinityRecommendation: 'reject',
        trinityReasoning: 'Candidate does not meet minimum qualifications. No security license, 2 months experience, severely limited availability (Saturday mornings only), no transportation. Recommend rejection.',
      };
    default:
      return null;
  }
}

// ─── Main Seed Function ───────────────────────────────────────────────────────

export async function seedAcmeCandidates(): Promise<{ seeded: number; skipped: number }> {
  if (process.env.REPLIT_DEPLOYMENT === '1') {
    return { seeded: 0, skipped: 0 };
  }

  const { workspaces } = await import('@shared/schema');
  const { eq: eqCheck } = await import('drizzle-orm');
  const workspaceCheck = await db.select({ id: workspaces.id })
    .from(workspaces)
    .where(eqCheck(workspaces.id, WS))
    .limit(1)
    .catch(() => []);

  if (workspaceCheck.length === 0) {
    return { seeded: 0, skipped: SEED_CANDIDATES.length };
  }

  let seeded = 0;
  let skipped = 0;

  for (const c of SEED_CANDIDATES) {
    const existing = await db.select({ id: interviewCandidates.id })
      .from(interviewCandidates)
      .where(and(
        eq(interviewCandidates.workspaceId, WS),
        eq(interviewCandidates.email, c.email),
      ))
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    try {
      const candidate = await createCandidate({
        workspaceId: WS,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        positionType: c.positionType,
        positionTitle: c.positionTitle,
        stage: c.stage,
        rawApplicationText: c.rawApplicationText,
        sourceEmail: 'careers@acme-security.coaileague.app',
      });

      // Apply qualification score and decision overrides
      if (c.qualificationScore !== undefined || c.decision !== undefined) {
        await db.update(interviewCandidates)
          .set({
            ...(c.qualificationScore !== undefined ? { qualificationScore: c.qualificationScore } : {}),
            ...(c.decision ? {
              decision: c.decision,
              decisionNotes: 'Auto-set by seed (below qualification threshold)',
              decisionAt: new Date(),
            } : {}),
            updatedAt: new Date(),
          })
          .where(eq(interviewCandidates.id, candidate.id));
      }

      // Seed sessions for this candidate
      const sessionFixtures = getSessionsForCandidate(c.email);
      const sessionIds: Record<string, string> = {};

      for (const sf of sessionFixtures) {
        const [session] = await db.insert(candidateInterviewSessions).values({
          workspaceId: WS,
          candidateId: candidate.id,
          sessionType: sf.sessionType,
          status: sf.status,
          sessionScore: sf.sessionScore,
          questionsAsked: sf.questionsAsked ?? null,
          responsesReceived: sf.responsesReceived ?? null,
          scoringBreakdown: sf.scoringBreakdown ?? null,
          startedAt: sf.startedAt,
          completedAt: sf.completedAt,
        }).returning({ id: candidateInterviewSessions.id });

        if (session) {
          sessionIds[sf.sessionType] = session.id;
        }
      }

      // Seed scorecard if fixture exists
      const scorecardFixture = getScorecardForCandidate(c.email);
      if (scorecardFixture) {
        await db.insert(interviewScorecards).values({
          workspaceId: WS,
          candidateId: candidate.id,
          qualificationScore: scorecardFixture.qualificationScore,
          communicationScore: scorecardFixture.communicationScore,
          availabilityScore: scorecardFixture.availabilityScore,
          experienceScore: scorecardFixture.experienceScore,
          overallScore: scorecardFixture.overallScore,
          trinityRecommendation: scorecardFixture.trinityRecommendation,
          trinityReasoning: scorecardFixture.trinityReasoning,
          emailRound1SessionId: sessionIds['email_round_1'] ?? null,
          emailRound2SessionId: sessionIds['email_round_2'] ?? null,
          chatSessionId: sessionIds['chat_interview'] ?? null,
          voiceSessionId: sessionIds['voice_interview'] ?? null,
          generatedAt: new Date(),
          generatedBy: 'trinity',
          version: 1,
        });
      }

      seeded++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AcmeCandidateSeed] Failed to seed ${c.firstName} ${c.lastName}:`, msg);
      skipped++;
    }
  }

  console.log(`[AcmeCandidateSeed] Seeded ${seeded} test candidates (with sessions + scorecards), skipped ${skipped}`);
  return { seeded, skipped };
}
