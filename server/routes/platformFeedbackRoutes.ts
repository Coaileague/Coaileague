import { requirePlatformStaff } from '../rbac';
import { requireAuth } from '../auth';
/**
 * Platform Feedback Routes
 *
 * Collects structured feedback about the CoAIleague platform itself
 * from workspace users (admins, managers, officers). Platform admins can
 * configure the survey questions via the UI. Trinity/HelpAI reads the
 * responses table for analysis and continuous improvement suggestions.
 *
 * Uses existing pulse_survey_templates + pulse_survey_responses tables
 * with workspaceId = PLATFORM_WORKSPACE_ID to scope platform surveys.
 */

import { Router } from 'express';
import { db } from '../db';
import { pulseSurveyTemplates, pulseSurveyResponses } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';
import { z } from 'zod';
import { PLATFORM_WORKSPACE_ID } from '../services/billing/billingConstants';

const router = Router();
const log = createLogger('PlatformFeedback');

const PLATFORM_WS = PLATFORM_WORKSPACE_ID;

router.use(requireAuth);

// ── Default survey seeded on first-run ────────────────────────────────────
const DEFAULT_SURVEY_QUESTIONS = [
  {
    id: 'q-overall',
    text: `How would you rate ${PLATFORM.name} overall?`,
    type: 'rating' as const,
    options: [],
    required: true,
    category: 'culture' as const,
  },
  {
    id: 'q-feature',
    text: 'Which feature area would you most like to see improved?',
    type: 'multiple_choice' as const,
    options: ['Scheduling & Shifts', 'Payroll & Billing', 'Compliance & Docs', 'Reporting & Analytics', 'Mobile Experience', 'Communication & Alerts'],
    required: true,
    category: 'resources' as const,
  },
  {
    id: 'q-ease',
    text: `How easy is it to manage your daily operations in ${PLATFORM.name}?`,
    type: 'rating' as const,
    options: [],
    required: true,
    category: 'workload' as const,
  },
  {
    id: 'q-nps',
    text: `How likely are you to recommend ${PLATFORM.name} to another security company?`,
    type: 'rating' as const,
    options: [],
    required: true,
    category: 'growth' as const,
  },
  {
    id: 'q-feedback',
    text: `What is one thing that would make ${PLATFORM.name} more valuable to your team?`,
    type: 'text' as const,
    options: [],
    required: false,
    category: 'management' as const,
  },
];

/** Ensure one active platform survey exists (idempotent seed) */
async function ensurePlatformSurveyExists(): Promise<void> {
  const existing = await db
    .select({ id: pulseSurveyTemplates.id })
    .from(pulseSurveyTemplates)
    .where(and(
      eq(pulseSurveyTemplates.workspaceId, PLATFORM_WS),
      eq(pulseSurveyTemplates.isActive, true),
    ))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(pulseSurveyTemplates).values({
      workspaceId: PLATFORM_WS,
      title: `${PLATFORM.name} Platform Feedback`,
      description: `Help us improve ${PLATFORM.name}. Your feedback directly shapes what we build next.`,
      questions: DEFAULT_SURVEY_QUESTIONS,
      frequency: 'quarterly',
      isActive: true,
      isAnonymous: false,
      showResultsToEmployees: false,
      createdBy: 'system',
    });
    log.info('Default platform feedback survey seeded');
  }
}

// Seed on module load (non-blocking)
ensurePlatformSurveyExists().catch((err) =>
  log.warn('Could not seed platform survey', { error: err?.message })
);

// ─────────────────────────────────────────────────────────────────────────
// GET /api/platform-feedback/active
// Returns the active platform survey for display to any authenticated user.
// ─────────────────────────────────────────────────────────────────────────
router.get('/active', async (req, res) => {
  try {
    const [survey] = await db
      .select()
      .from(pulseSurveyTemplates)
      .where(and(
        eq(pulseSurveyTemplates.workspaceId, PLATFORM_WS),
        eq(pulseSurveyTemplates.isActive, true),
      ))
      .orderBy(desc(pulseSurveyTemplates.createdAt))
      .limit(1);

    if (!survey) {
      return res.status(404).json({ error: 'No active platform survey found' });
    }

    res.json(survey);
  } catch (err: unknown) {
    log.error('Failed to fetch active platform survey', { error: (err instanceof Error ? err.message : String(err)) });
    res.status(500).json({ error: 'Failed to fetch survey' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/platform-feedback/surveys — admin: list all platform surveys
// ─────────────────────────────────────────────────────────────────────────
router.get('/surveys', requirePlatformStaff, async (req, res) => {
  try {
    const surveys = await db
      .select()
      .from(pulseSurveyTemplates)
      .where(eq(pulseSurveyTemplates.workspaceId, PLATFORM_WS))
      .orderBy(desc(pulseSurveyTemplates.createdAt));

    res.json(surveys);
  } catch (err: unknown) {
    log.error('Failed to list platform surveys', { error: (err instanceof Error ? err.message : String(err)) });
    res.status(500).json({ error: 'Failed to list surveys' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// POST /api/platform-feedback/surveys — admin: create or replace survey
// ─────────────────────────────────────────────────────────────────────────
const QuestionSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  type: z.enum(['rating', 'multiple_choice', 'text', 'yes_no']),
  options: z.array(z.string()).optional().default([]),
  required: z.boolean().default(true),
  category: z.enum(['workload', 'management', 'environment', 'growth', 'compensation', 'culture', 'safety', 'resources']).default('culture'),
});

const SurveyCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional().default(''),
  questions: z.array(QuestionSchema).min(1).max(20),
  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'quarterly', 'annual', 'one_time']).default('quarterly'),
  isActive: z.boolean().default(true),
});

router.post('/surveys', requirePlatformStaff, async (req, res) => {
  const parse = SurveyCreateSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid survey data', details: parse.error.issues });
  }

  const { title, description, questions, frequency, isActive } = parse.data;
  const userId = req.user?.id || 'system';

  try {
    // Deactivate any existing active surveys if creating a new active one
    if (isActive) {
      await db
        .update(pulseSurveyTemplates)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(pulseSurveyTemplates.workspaceId, PLATFORM_WS),
          eq(pulseSurveyTemplates.isActive, true),
        ));
    }

    const [survey] = await db
      .insert(pulseSurveyTemplates)
      .values({
        workspaceId: PLATFORM_WS,
        title,
        description: description || '',
        questions: questions as any,
        frequency,
        isActive,
        isAnonymous: false,
        showResultsToEmployees: false,
        createdBy: userId,
      })
      .returning();

    log.info('Platform survey created', { surveyId: survey.id, userId });
    res.status(201).json(survey);
  } catch (err: unknown) {
    log.error('Failed to create platform survey', { error: (err instanceof Error ? err.message : String(err)) });
    res.status(500).json({ error: 'Failed to create survey' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// PUT /api/platform-feedback/surveys/:id — admin: update survey questions
// ─────────────────────────────────────────────────────────────────────────
router.put('/surveys/:id', requirePlatformStaff, async (req, res) => {
  const { id } = req.params;
  const parse = SurveyCreateSchema.partial().safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid update data', details: parse.error.issues });
  }

  try {
    const [updated] = await db
      .update(pulseSurveyTemplates)
      .set({ ...parse.data, questions: parse.data.questions as any, updatedAt: new Date() })
      .where(and(
        eq(pulseSurveyTemplates.id, id),
        eq(pulseSurveyTemplates.workspaceId, PLATFORM_WS),
      ))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Survey not found' });
    res.json(updated);
  } catch (err: unknown) {
    log.error('Failed to update platform survey', { error: (err instanceof Error ? err.message : String(err)) });
    res.status(500).json({ error: 'Failed to update survey' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// POST /api/platform-feedback/respond — any user: submit survey response
// ─────────────────────────────────────────────────────────────────────────
const ResponseSchema = z.object({
  surveyId: z.string(),
  answers: z.array(z.object({
    questionId: z.string(),
    answer: z.union([z.string(), z.number(), z.array(z.string())]),
  })),
});

router.post('/respond', async (req, res) => {
  const parse = ResponseSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid response data', details: parse.error.issues });
  }

  const { surveyId, answers } = parse.data;
  const userId = req.user?.id;
  const responderWorkspace = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId || PLATFORM_WS;

  try {
    // Verify the survey exists
    const [survey] = await db
      .select({ id: pulseSurveyTemplates.id })
      .from(pulseSurveyTemplates)
      .where(and(
        eq(pulseSurveyTemplates.id, surveyId),
        eq(pulseSurveyTemplates.workspaceId, PLATFORM_WS),
      ))
      .limit(1);

    if (!survey) {
      return res.status(404).json({ error: 'Survey not found' });
    }

    const [response] = await db
      .insert(pulseSurveyResponses)
      .values({
        workspaceId: responderWorkspace,
        surveyTemplateId: surveyId,
        employeeId: userId || null,
        responses: answers as any,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
      })
      .returning();

    log.info('Platform feedback response submitted', {
      surveyId,
      responseId: response.id,
      workspace: responderWorkspace,
    });

    res.status(201).json({ success: true, responseId: response.id });
  } catch (err: unknown) {
    log.error('Failed to submit platform feedback response', { error: (err instanceof Error ? err.message : String(err)) });
    res.status(500).json({ error: 'Failed to submit response' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/platform-feedback/analytics — admin: aggregate response data
// ─────────────────────────────────────────────────────────────────────────
router.get('/analytics', requirePlatformStaff, async (req, res) => {
  try {
    const surveyId = req.query.surveyId as string | undefined;

    // Get the active survey for question reference
    const [survey] = await db
      .select()
      .from(pulseSurveyTemplates)
      .where(surveyId
        ? eq(pulseSurveyTemplates.id, surveyId)
        : and(
            eq(pulseSurveyTemplates.workspaceId, PLATFORM_WS),
            eq(pulseSurveyTemplates.isActive, true),
          )
      )
      .limit(1);

    if (!survey) {
      return res.json({ totalResponses: 0, questions: [], byWorkspace: {} });
    }

    // Fetch all responses for this survey
    const responses = await db
      .select()
      .from(pulseSurveyResponses)
      .where(eq(pulseSurveyResponses.surveyTemplateId, survey.id))
      .orderBy(desc(pulseSurveyResponses.submittedAt));

    const questions = (survey.questions as any[]) || [];

    // Aggregate answers per question
    const questionStats: Record<string, {
      question: string;
      type: string;
      totalAnswers: number;
      ratingAvg?: number;
      ratingDist?: Record<number, number>;
      choiceDist?: Record<string, number>;
      textSamples?: string[];
    }> = {};

    for (const q of questions) {
      questionStats[q.id] = {
        question: q.text,
        type: q.type,
        totalAnswers: 0,
        ...(q.type === 'rating' ? { ratingAvg: 0, ratingDist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } } : {}),
        ...(q.type === 'multiple_choice' || q.type === 'yes_no' ? { choiceDist: {} } : {}),
        ...(q.type === 'text' ? { textSamples: [] } : {}),
      };
    }

    const byWorkspace: Record<string, number> = {};
    let ratingTotals: Record<string, { sum: number; count: number }> = {};

    for (const resp of responses) {
      const answers = (resp.responses as any[]) || [];
      const ws = resp.workspaceId || 'unknown';
      byWorkspace[ws] = (byWorkspace[ws] || 0) + 1;

      for (const answer of answers) {
        const stat = questionStats[answer.questionId];
        if (!stat) continue;
        stat.totalAnswers++;

        if (stat.type === 'rating') {
          const val = Number(answer.answer);
          if (!isNaN(val) && val >= 1 && val <= 5) {
            stat.ratingDist![val]++;
            if (!ratingTotals[answer.questionId]) ratingTotals[answer.questionId] = { sum: 0, count: 0 };
            ratingTotals[answer.questionId].sum += val;
            ratingTotals[answer.questionId].count++;
          }
        } else if (stat.type === 'multiple_choice' || stat.type === 'yes_no') {
          const val = String(answer.answer);
          stat.choiceDist![val] = (stat.choiceDist![val] || 0) + 1;
        } else if (stat.type === 'text' && answer.answer) {
          stat.textSamples!.push(String(answer.answer));
        }
      }
    }

    // Calculate rating averages
    for (const [qId, totals] of Object.entries(ratingTotals)) {
      if (questionStats[qId] && totals.count > 0) {
        questionStats[qId].ratingAvg = Math.round((totals.sum / totals.count) * 10) / 10;
      }
    }

    res.json({
      survey: { id: survey.id, title: survey.title, description: survey.description },
      totalResponses: responses.length,
      questions: Object.values(questionStats),
      byWorkspace,
      recentResponses: responses.slice(0, 10).map((r) => ({
        id: r.id,
        workspaceId: r.workspaceId,
        submittedAt: r.submittedAt,
        answers: r.responses,
      })),
    });
  } catch (err: unknown) {
    log.error('Failed to compute analytics', { error: (err instanceof Error ? err.message : String(err)) });
    res.status(500).json({ error: 'Failed to compute analytics' });
  }
});

export default router;
