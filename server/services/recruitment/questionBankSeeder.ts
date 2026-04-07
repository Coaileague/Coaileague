/**
 * QUESTION BANK SEEDER
 * Phase 58 — Trinity Interview Pipeline
 *
 * Seeds the default question bank for armed_officer, unarmed_officer, and supervisor position types.
 * Called during ACME sandbox setup.
 */

import { db } from '../../db';
import { interviewQuestionsBank } from '@shared/schema';
import { isNull } from 'drizzle-orm';

const DEFAULT_QUESTIONS = [
  // ── UNARMED OFFICER — Round 1 ────────────────────────────────────────────
  {
    positionType: 'unarmed_officer',
    round: 1,
    questionText: 'Tell me about your previous security or related work experience. How many years have you worked in this field?',
    questionCategory: 'experience',
    isRequired: true,
    scoringCriteria: {
      keywords: ['security', 'guard', 'officer', 'patrol', 'surveillance', 'access control'],
      idealResponse: 'Applicant has at least 1 year of security or related experience, can describe specific duties',
      weights: { experience: 0.5, detail: 0.3, professionalism: 0.2 },
    },
    maxScore: 10,
    displayOrder: 1,
  },
  {
    positionType: 'unarmed_officer',
    round: 1,
    questionText: 'What shifts are you available to work? (Days, evenings, nights, weekends, holidays)',
    questionCategory: 'availability',
    isRequired: true,
    scoringCriteria: {
      keywords: ['days', 'evenings', 'nights', 'weekends', 'holidays', 'flexible', 'available'],
      idealResponse: 'Open availability including nights and weekends',
      weights: { flexibility: 0.6, detail: 0.4 },
    },
    maxScore: 10,
    displayOrder: 2,
  },
  {
    positionType: 'unarmed_officer',
    round: 1,
    questionText: 'Do you currently hold a valid security guard license or are you in the process of obtaining one?',
    questionCategory: 'background',
    isRequired: true,
    scoringCriteria: {
      keywords: ['licensed', 'license', 'certified', 'in process', 'applying', 'guard card'],
      idealResponse: 'Holds a valid security license or is actively pursuing one',
      weights: { compliance: 0.7, initiative: 0.3 },
    },
    maxScore: 10,
    displayOrder: 3,
  },
  {
    positionType: 'unarmed_officer',
    round: 1,
    questionText: 'Describe a situation where you had to handle a difficult or confrontational person. What did you do?',
    questionCategory: 'scenario',
    isRequired: false,
    scoringCriteria: {
      keywords: ['de-escalate', 'calm', 'professional', 'supervisor', 'call', 'communicate', 'authority'],
      idealResponse: 'Used de-escalation, remained professional, followed protocols, involved supervisors as needed',
      weights: { judgment: 0.4, de_escalation: 0.4, outcome: 0.2 },
    },
    maxScore: 10,
    displayOrder: 4,
  },

  // ── UNARMED OFFICER — Round 2 ────────────────────────────────────────────
  {
    positionType: 'unarmed_officer',
    round: 2,
    questionText: 'Walk me through how you would conduct an access control check at a secured building entrance.',
    questionCategory: 'scenario',
    isRequired: false,
    scoringCriteria: {
      keywords: ['ID', 'badge', 'verify', 'log', 'authorized', 'visitor', 'protocol', 'procedure'],
      idealResponse: 'Describes checking credentials, logging visitors, verifying against access list, maintaining professionalism',
      weights: { procedure: 0.5, detail: 0.3, professionalism: 0.2 },
    },
    maxScore: 10,
    displayOrder: 1,
  },
  {
    positionType: 'unarmed_officer',
    round: 2,
    questionText: 'What would you do if you observed a suspicious vehicle circling the property multiple times?',
    questionCategory: 'scenario',
    isRequired: false,
    scoringCriteria: {
      keywords: ['document', 'report', 'license plate', 'supervisor', 'dispatch', 'observe', 'note time'],
      idealResponse: 'Documents observations, reports to supervisor/dispatch, does not confront, maintains awareness',
      weights: { safety: 0.4, procedure: 0.4, judgment: 0.2 },
    },
    maxScore: 10,
    displayOrder: 2,
    branchCondition: null,
  },
  {
    positionType: 'unarmed_officer',
    round: 2,
    questionText: 'Tell me about your transportation. Are you able to reliably get to assigned sites?',
    questionCategory: 'availability',
    isRequired: false,
    scoringCriteria: {
      keywords: ['car', 'vehicle', 'reliable', 'license', 'public transit', 'transportation'],
      idealResponse: 'Has reliable transportation and valid driver\'s license',
      weights: { reliability: 0.7, detail: 0.3 },
    },
    maxScore: 10,
    displayOrder: 3,
  },

  // ── ARMED OFFICER — Round 1 ────────────────────────────────────────────
  {
    positionType: 'armed_officer',
    round: 1,
    questionText: 'Describe your firearms training and experience. What weapons are you qualified on?',
    questionCategory: 'experience',
    isRequired: true,
    scoringCriteria: {
      keywords: ['firearm', 'pistol', 'handgun', 'range', 'qualification', 'armed', 'licensed', 'commission'],
      idealResponse: 'Trained and qualified on handgun, holds armed license or commissioned officer status',
      weights: { training: 0.5, qualification: 0.3, recency: 0.2 },
    },
    maxScore: 10,
    displayOrder: 1,
  },
  {
    positionType: 'armed_officer',
    round: 1,
    questionText: 'Do you hold a current armed security license? What state is it in and when does it expire?',
    questionCategory: 'background',
    isRequired: true,
    scoringCriteria: {
      keywords: ['armed', 'license', 'commissioned', 'Level III', 'Class G', 'expires', 'current', 'valid'],
      idealResponse: 'Holds valid armed security license, knows expiration date, in good standing',
      weights: { compliance: 0.6, detail: 0.4 },
    },
    maxScore: 10,
    displayOrder: 2,
  },
  {
    positionType: 'armed_officer',
    round: 1,
    questionText: 'What is your availability for armed posts? Many armed sites require overnight and weekend coverage.',
    questionCategory: 'availability',
    isRequired: true,
    scoringCriteria: {
      keywords: ['nights', 'weekends', 'overnights', 'flexible', 'available', 'shifts'],
      idealResponse: 'Available for nights, weekends, and holidays; understanding of demanding schedule',
      weights: { flexibility: 0.7, understanding: 0.3 },
    },
    maxScore: 10,
    displayOrder: 3,
  },
  {
    positionType: 'armed_officer',
    round: 1,
    questionText: 'Describe the use-of-force continuum. When would you consider drawing your firearm?',
    questionCategory: 'scenario',
    isRequired: true,
    scoringCriteria: {
      keywords: ['last resort', 'imminent threat', 'deadly force', 'de-escalate first', 'continuum', 'presence', 'verbal'],
      idealResponse: 'Correctly describes escalating force, emphasizes firearm as absolute last resort only when life is in danger',
      weights: { knowledge: 0.5, judgment: 0.3, safety: 0.2 },
    },
    maxScore: 10,
    displayOrder: 4,
  },

  // ── ARMED OFFICER — Round 2 ────────────────────────────────────────────
  {
    positionType: 'armed_officer',
    round: 2,
    questionText: 'An intoxicated individual is refusing to leave the premises and becoming aggressive. Walk me through your response.',
    questionCategory: 'scenario',
    isRequired: false,
    scoringCriteria: {
      keywords: ['verbal', 'de-escalate', 'call police', 'supervisor', 'space', 'calm', 'document', 'not physical'],
      idealResponse: 'Uses verbal de-escalation, creates space, contacts police if needed, does not use physical force unless life threatened',
      weights: { de_escalation: 0.4, procedure: 0.3, judgment: 0.3 },
    },
    maxScore: 10,
    displayOrder: 1,
  },
  {
    positionType: 'armed_officer',
    round: 2,
    questionText: 'Describe your experience writing post orders and incident reports.',
    questionCategory: 'experience',
    isRequired: false,
    scoringCriteria: {
      keywords: ['report', 'documentation', 'post order', 'incident', 'written', 'factual', 'detailed', 'accurate'],
      idealResponse: 'Can write clear, factual incident reports; understands importance of thorough documentation',
      weights: { writing: 0.4, detail: 0.4, understanding: 0.2 },
    },
    maxScore: 10,
    displayOrder: 2,
  },

  // ── SUPERVISOR — Round 1 ────────────────────────────────────────────────
  {
    positionType: 'supervisor',
    round: 1,
    questionText: 'How many security officers have you supervised, and in what capacity?',
    questionCategory: 'experience',
    isRequired: true,
    scoringCriteria: {
      keywords: ['managed', 'supervised', 'team', 'officers', 'direct reports', 'responsible for', 'shift'],
      idealResponse: 'Has directly supervised 3 or more officers; managed scheduling, performance, or daily operations',
      weights: { experience: 0.5, scope: 0.3, responsibility: 0.2 },
    },
    maxScore: 10,
    displayOrder: 1,
  },
  {
    positionType: 'supervisor',
    round: 1,
    questionText: 'How do you handle an officer who is consistently late or unreliable?',
    questionCategory: 'scenario',
    isRequired: true,
    scoringCriteria: {
      keywords: ['document', 'counsel', 'progressive discipline', 'write-up', 'HR', 'formal', 'coaching', 'consistent'],
      idealResponse: 'Uses progressive discipline, documents all occurrences, involves HR, consistent with all officers',
      weights: { procedure: 0.4, fairness: 0.3, documentation: 0.3 },
    },
    maxScore: 10,
    displayOrder: 2,
  },
  {
    positionType: 'supervisor',
    round: 1,
    questionText: 'A client calls to complain that one of your officers was sleeping on duty. How do you handle this?',
    questionCategory: 'scenario',
    isRequired: true,
    scoringCriteria: {
      keywords: ['investigate', 'document', 'contact officer', 'client', 'apologize', 'action', 'consequence', 'report'],
      idealResponse: 'Investigates immediately, contacts client to acknowledge, disciplines officer appropriately, documents everything',
      weights: { urgency: 0.3, client_service: 0.3, follow_through: 0.4 },
    },
    maxScore: 10,
    displayOrder: 3,
  },
  {
    positionType: 'supervisor',
    round: 1,
    questionText: 'What is your experience with scheduling? How do you handle last-minute call-offs?',
    questionCategory: 'experience',
    isRequired: false,
    scoringCriteria: {
      keywords: ['schedule', 'coverage', 'call-off', 'backup', 'on-call', 'roster', 'fill', 'replacement'],
      idealResponse: 'Maintains backup roster, uses on-call list, has procedures for finding coverage quickly',
      weights: { experience: 0.4, problem_solving: 0.4, preparation: 0.2 },
    },
    maxScore: 10,
    displayOrder: 4,
  },

  // ── SUPERVISOR — Round 2 ────────────────────────────────────────────────
  {
    positionType: 'supervisor',
    round: 2,
    questionText: 'How would you conduct a site audit to ensure officers are following post orders?',
    questionCategory: 'scenario',
    isRequired: false,
    scoringCriteria: {
      keywords: ['unannounced', 'log', 'check', 'post orders', 'observation', 'report', 'feedback', 'training'],
      idealResponse: 'Makes unannounced checks, reviews logs and reports, observes adherence to post orders, provides coaching',
      weights: { procedure: 0.4, thoroughness: 0.3, follow_up: 0.3 },
    },
    maxScore: 10,
    displayOrder: 1,
  },
  {
    positionType: 'supervisor',
    round: 2,
    questionText: 'Tell me about a time you improved a team\'s performance or fixed a recurring problem on a site.',
    questionCategory: 'experience',
    isRequired: false,
    scoringCriteria: {
      keywords: ['identified', 'trained', 'improved', 'solution', 'result', 'metric', 'accountability'],
      idealResponse: 'Identifies root cause, implements systematic solution, measures results, takes accountability for outcomes',
      weights: { problem_solving: 0.4, leadership: 0.3, results: 0.3 },
    },
    maxScore: 10,
    displayOrder: 2,
  },

  // ── ALL POSITIONS ────────────────────────────────────────────────────────
  {
    positionType: 'all',
    round: 1,
    questionText: 'Why are you interested in working with our company specifically?',
    questionCategory: 'personality',
    isRequired: false,
    scoringCriteria: {
      keywords: ['opportunity', 'company', 'team', 'growth', 'reputation', 'values', 'mission'],
      idealResponse: 'Shows research into the company, genuine interest, aligns personal goals with role',
      weights: { research: 0.3, motivation: 0.4, fit: 0.3 },
    },
    maxScore: 10,
    displayOrder: 5,
  },
];

export async function seedDefaultQuestionBank(): Promise<{ seeded: number; skipped: number }> {
  let seeded = 0;
  let skipped = 0;

  // Check if we already have platform-default questions (workspaceId = null)
  const existing = await db.select({ id: interviewQuestionsBank.id })
    .from(interviewQuestionsBank)
    .where(isNull(interviewQuestionsBank.workspaceId))
    .limit(1);

  if (existing.length > 0) {
    console.log('[QuestionBankSeeder] Platform default questions already seeded, skipping');
    return { seeded: 0, skipped: DEFAULT_QUESTIONS.length };
  }

  type QuestionSeed = typeof DEFAULT_QUESTIONS[number] & { branchCondition?: Record<string, unknown> | null };

  for (const q of DEFAULT_QUESTIONS as QuestionSeed[]) {
    try {
      await db.insert(interviewQuestionsBank).values({
        workspaceId: null,
        positionType: q.positionType,
        round: q.round,
        questionText: q.questionText,
        questionCategory: q.questionCategory,
        isRequired: q.isRequired,
        scoringCriteria: q.scoringCriteria,
        maxScore: q.maxScore,
        branchCondition: q.branchCondition ?? null,
        isActive: true,
        displayOrder: q.displayOrder,
      });
      seeded++;
    } catch (err: any) {
      console.warn('[QuestionBankSeeder] Failed to insert question:', err.message);
      skipped++;
    }
  }

  console.log(`[QuestionBankSeeder] Seeded ${seeded} platform default questions`);
  return { seeded, skipped };
}
