/**
 * RECRUITMENT API ROUTES
 * Phase 58 — Trinity Interview Pipeline
 *
 * Mounted at: /api/recruitment
 */

import { Router, type Request, type Response } from 'express';
import { db } from '../db';
import {
  interviewCandidates,
  candidateInterviewSessions,
  interviewQuestionsBank,
  interviewScorecards,
  insertInterviewCandidateSchema,
  insertInterviewQuestionBankSchema,
} from '@shared/schema';
import { eq, and, or, desc, isNull, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import {
  createCandidate,
  getCandidates,
  getCandidateById,
  getPipelineSummary,
  advanceCandidateStage,
  recordDecision,
} from '../services/recruitment/candidateService';
import {
  screenCandidate,
} from '../services/recruitment/trinityScreeningService';
import {
  generateComprehensiveScorecard,
  getRankedSummary,
} from '../services/recruitment/scorecardService';
import {
  sendEmailRound1,
  sendEmailRound2,
  processEmailReply,
} from '../services/recruitment/emailInterviewService';
import {
  createChatInterviewRoom,
  analyzeChatResponse,
  closeChatInterviewSession,
  getCopilotEvents,
} from '../services/recruitment/chatInterviewService';
import {
  createVoiceInterviewSession,
} from '../services/recruitment/voiceInterviewService';
import { z } from 'zod';
import { createLogger } from '../lib/logger';

const log = createLogger('RecruitmentRoutes');
const router = Router();

// ─── Pipeline Summary ─────────────────────────────────────────────────────────

router.get('/pipeline', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
  try {
    const [summary, analytics] = await Promise.all([
      getPipelineSummary(workspaceId),
      (async () => {
        const total = await db.select({ count: sql<number>`COUNT(*)::int` })
          .from(interviewCandidates)
          .where(eq(interviewCandidates.workspaceId, workspaceId));

        const decided = await db.select({
          decision: interviewCandidates.decision,
          count: sql<number>`COUNT(*)::int`,
        })
          .from(interviewCandidates)
          .where(and(
            eq(interviewCandidates.workspaceId, workspaceId),
            eq(interviewCandidates.stage, 'decided'),
          ))
          .groupBy(interviewCandidates.decision);

        return { total: total[0]?.count || 0, decisionBreakdown: decided };
      })(),
    ]);
    res.json({ pipeline: summary, analytics });
  } catch (err) {
    log.error('[Recruitment] pipeline error:', err);
    res.status(500).json({ error: 'Failed to fetch pipeline' });
  }
});

// ─── Candidate List ────────────────────────────────────────────────────────────

router.get('/candidates', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
  try {
    const {
      stage,
      search,
      limit = '50',
      offset = '0',
    } = req.query as Record<string, string>;

    const result = await getCandidates(workspaceId, {
      stage,
      search,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
    res.json(result);
  } catch (err) {
    log.error('[Recruitment] candidates list error:', err);
    res.status(500).json({ error: 'Failed to fetch candidates' });
  }
});

// ─── Ranked Summary ────────────────────────────────────────────────────────────

router.get('/candidates/ranked', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
  try {
    const { positionType } = req.query as { positionType?: string };
    const ranked = await getRankedSummary(workspaceId, positionType);
    res.json({ ranked });
  } catch (err) {
    log.error('[Recruitment] ranked summary error:', err);
    res.status(500).json({ error: 'Failed to fetch ranked summary' });
  }
});

// ─── Create Candidate ──────────────────────────────────────────────────────────

router.post('/candidates', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
  try {
    const parsed = insertInterviewCandidateSchema.safeParse({ ...req.body, workspaceId });
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    }
    const candidate = await createCandidate({ ...parsed.data, workspaceId });
    res.status(201).json({ candidate });
  } catch (err) {
    log.error('[Recruitment] create candidate error:', err);
    res.status(500).json({ error: 'Failed to create candidate' });
  }
});

// ─── Get Candidate Detail ─────────────────────────────────────────────────────

router.get('/candidates/:id', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
  try {
    const result = await getCandidateById(req.params.id, workspaceId);
    if (!result.candidate) return res.status(404).json({ error: 'Candidate not found' });
    res.json(result);
  } catch (err) {
    log.error('[Recruitment] get candidate error:', err);
    res.status(500).json({ error: 'Failed to fetch candidate' });
  }
});

// ─── Screen Candidate (Trinity AI) ───────────────────────────────────────────

router.post('/candidates/:id/screen', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
  try {
    const [candidate] = await db.select()
      .from(interviewCandidates)
      .where(and(
        eq(interviewCandidates.id, req.params.id),
        eq(interviewCandidates.workspaceId, workspaceId),
      ))
      .limit(1);

    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    const result = await screenCandidate(
      candidate,
      candidate.rawApplicationText || '',
      candidate.positionType,
    );

    await db.update(interviewCandidates)
      .set({
        qualificationScore: result.score,
        resumeParsed: result.parsedData,
        stage: result.score >= 60 ? 'screening' : 'decided',
        decision: result.score < 60 ? 'reject' : null,
        updatedAt: new Date(),
      })
      .where(eq(interviewCandidates.id, req.params.id));

    res.json({
      score: result.score,
      reasoning: result.reasoning,
      parsedData: result.parsedData,
      qualified: result.score >= 60,
      stage: result.score >= 60 ? 'screening' : 'decided',
    });
  } catch (err) {
    log.error('[Recruitment] screen candidate error:', err);
    res.status(500).json({ error: 'Failed to screen candidate' });
  }
});

// ─── Send Email Questions ─────────────────────────────────────────────────────

router.post('/candidates/:id/send-questions', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
  try {
    const [candidate] = await db.select()
      .from(interviewCandidates)
      .where(and(
        eq(interviewCandidates.id, req.params.id),
        eq(interviewCandidates.workspaceId, workspaceId),
      ))
      .limit(1);

    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    const { round = 1, round1SessionId } = req.body;

    if (round === 1) {
      const result = await sendEmailRound1(candidate, workspaceId);
      return res.json({ success: true, ...result, round: 1 });
    } else if (round === 2) {
      const result = await sendEmailRound2(candidate, workspaceId, round1SessionId);
      return res.json({ success: true, ...result, round: 2 });
    }

    res.status(400).json({ error: 'Invalid round' });
  } catch (err) {
    log.error('[Recruitment] send-questions error:', err);
    res.status(500).json({ error: 'Failed to send interview questions' });
  }
});

// ─── Process Email Reply ──────────────────────────────────────────────────────

router.post('/sessions/:sessionId/reply', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
  try {
    const { replyText } = req.body;
    if (!replyText) return res.status(400).json({ error: 'replyText is required' });

    const [session] = await db.select({ id: candidateInterviewSessions.id, workspaceId: candidateInterviewSessions.workspaceId })
      .from(candidateInterviewSessions)
      .where(and(eq(candidateInterviewSessions.id, req.params.sessionId), eq(candidateInterviewSessions.workspaceId, workspaceId)))
      .limit(1);

    if (!session) return res.status(404).json({ error: 'Session not found' });

    const result = await processEmailReply(req.params.sessionId, replyText);
    res.json(result);
  } catch (err) {
    log.error('[Recruitment] process reply error:', err);
    res.status(500).json({ error: 'Failed to process email reply' });
  }
});

// ─── Advance Stage ─────────────────────────────────────────────────────────────

router.patch('/candidates/:id/stage', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
  try {
    const { stage } = req.body;
    const validStages = ['new', 'screening', 'email_round_1', 'email_round_2', 'chat_interview', 'voice_interview', 'decided'];
    if (!validStages.includes(stage)) {
      return res.status(400).json({ error: 'Invalid stage value' });
    }

    const updated = await advanceCandidateStage(workspaceId, req.params.id, stage);
    if (!updated) return res.status(404).json({ error: 'Candidate not found' });
    res.json({ candidate: updated });
  } catch (err) {
    log.error('[Recruitment] advance stage error:', err);
    res.status(500).json({ error: 'Failed to advance candidate stage' });
  }
});

// ─── Record Decision ──────────────────────────────────────────────────────────

router.patch('/candidates/:id/decision', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
  try {
    const decisionSchema = z.object({
      decision: z.enum(['hire', 'reject', 'hold']),
      notes: z.string().optional().default(''),
    });

    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid decision data', details: parsed.error.issues });
    }

    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    await recordDecision(
      workspaceId,
      req.params.id,
      parsed.data.decision,
      parsed.data.notes,
      req.user.id,
    );

    await generateComprehensiveScorecard(req.params.id, workspaceId).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    res.json({ success: true, decision: parsed.data.decision });
  } catch (err) {
    log.error('[Recruitment] record decision error:', err);
    res.status(500).json({ error: 'Failed to record decision' });
  }
});

// ─── Generate Scorecard ────────────────────────────────────────────────────────

router.post('/candidates/:id/scorecard', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId as string;
  if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
  try {
    await generateComprehensiveScorecard(req.params.id, workspaceId);

    const [scorecard] = await db.select()
      .from(interviewScorecards)
      .where(and(
        eq(interviewScorecards.candidateId, req.params.id),
        eq(interviewScorecards.workspaceId, workspaceId),
      ))
      .orderBy(desc(interviewScorecards.generatedAt))
      .limit(1);

    res.json({ scorecard });
  } catch (err) {
    log.error('[Recruitment] scorecard error:', err);
    res.status(500).json({ error: 'Failed to generate scorecard' });
  }
});

// ─── Question Bank CRUD ───────────────────────────────────────────────────────

router.get('/questions', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
  try {
    const { positionType, round } = req.query as { positionType?: string; round?: string };

    const workspaceScope = or(
      isNull(interviewQuestionsBank.workspaceId),
      eq(interviewQuestionsBank.workspaceId, workspaceId),
    ) as SQL;
    const conditions: SQL[] = [workspaceScope];
    if (positionType) conditions.push(eq(interviewQuestionsBank.positionType, positionType) as SQL);
    if (round) conditions.push(eq(interviewQuestionsBank.round, parseInt(round)) as SQL);

    const questions = await db.select()
      .from(interviewQuestionsBank)
      .where(and(...conditions))
      .orderBy(interviewQuestionsBank.positionType, interviewQuestionsBank.round, interviewQuestionsBank.displayOrder);

    res.json({ questions });
  } catch (err) {
    log.error('[Recruitment] questions list error:', err);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

router.post('/questions', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
  try {
    const parsed = insertInterviewQuestionBankSchema.safeParse({ ...req.body, workspaceId });
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    }
    const [question] = await db.insert(interviewQuestionsBank).values(parsed.data).returning();
    res.status(201).json({ question });
  } catch (err) {
    log.error('[Recruitment] create question error:', err);
    res.status(500).json({ error: 'Failed to create question' });
  }
});

router.patch('/questions/:id', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
  try {
    const [updated] = await db.update(interviewQuestionsBank)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(
        eq(interviewQuestionsBank.id, req.params.id),
        eq(interviewQuestionsBank.workspaceId, workspaceId),
      ))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Question not found or not editable' });
    res.json({ question: updated });
  } catch (err) {
    log.error('[Recruitment] update question error:', err);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

router.delete('/questions/:id', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
  try {
    const [updated] = await db.update(interviewQuestionsBank)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(interviewQuestionsBank.id, req.params.id),
        eq(interviewQuestionsBank.workspaceId, workspaceId),
      ))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Question not found or not deletable' });
    res.json({ success: true });
  } catch (err) {
    log.error('[Recruitment] delete question error:', err);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// ─── Chat Interview Room (DockChat Co-Pilot) ──────────────────────────────────

router.post('/candidates/:id/chat-room', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId as string;
  if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
  try {
    const { candidate } = await getCandidateById(req.params.id, workspaceId);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    const recruiterUserIds: string[] = Array.isArray(req.body.recruiterUserIds) ? req.body.recruiterUserIds : [];
    const result = await createChatInterviewRoom(candidate, workspaceId, recruiterUserIds);
    res.status(201).json(result);
  } catch (err) {
    log.error('[Recruitment] chat-room error:', err);
    res.status(500).json({ error: 'Failed to create chat interview room' });
  }
});

router.get('/candidates/:id/chat-copilot', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId as string;
  if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
  try {
    const { candidate } = await getCandidateById(req.params.id, workspaceId);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    if (!candidate.chatRoomId) return res.json({ events: [] });

    const events = await getCopilotEvents(candidate.chatRoomId, workspaceId);
    res.json({ events });
  } catch (err) {
    log.error('[Recruitment] chat-copilot error:', err);
    res.status(500).json({ error: 'Failed to fetch copilot events' });
  }
});

router.post('/candidates/:id/chat-analyze', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId as string;
  if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
  try {
    const { sessionId, messageContent } = req.body as { sessionId?: string; messageContent?: string };
    if (!messageContent) return res.status(400).json({ error: 'messageContent required' });

    let resolvedSessionId: string | undefined = sessionId;
    if (!resolvedSessionId) {
      const [chatSession] = await db.select({ id: candidateInterviewSessions.id })
        .from(candidateInterviewSessions)
        .where(and(
          eq(candidateInterviewSessions.candidateId, req.params.id),
          eq(candidateInterviewSessions.workspaceId, workspaceId),
          eq(candidateInterviewSessions.sessionType, 'chat_interview'),
        ))
        .orderBy(desc(candidateInterviewSessions.startedAt))
        .limit(1);
      resolvedSessionId = chatSession?.id;
    }

    if (!resolvedSessionId) return res.status(404).json({ error: 'No active chat interview session' });

    const { candidate } = await getCandidateById(req.params.id, workspaceId);
    if (!candidate?.chatRoomId) return res.status(400).json({ error: 'No chat room for candidate' });

    await analyzeChatResponse(resolvedSessionId, workspaceId, req.params.id, candidate.chatRoomId, messageContent);
    res.json({ success: true });
  } catch (err) {
    log.error('[Recruitment] chat-analyze error:', err);
    res.status(500).json({ error: 'Failed to analyze chat response' });
  }
});

router.post('/sessions/:sessionId/chat-close', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
  try {
    const [session] = await db.select({ id: candidateInterviewSessions.id, workspaceId: candidateInterviewSessions.workspaceId })
      .from(candidateInterviewSessions)
      .where(and(eq(candidateInterviewSessions.id, req.params.sessionId), eq(candidateInterviewSessions.workspaceId, workspaceId)))
      .limit(1);

    if (!session) return res.status(404).json({ error: 'Session not found' });

    const result = await closeChatInterviewSession(req.params.sessionId, workspaceId);
    res.json(result);
  } catch (err) {
    log.error('[Recruitment] chat-close error:', err);
    res.status(500).json({ error: 'Failed to close chat session' });
  }
});

// ─── Voice Interview Session Init ─────────────────────────────────────────────

router.post('/candidates/:id/voice-session', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId as string;
  if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });
  try {
    const { candidate } = await getCandidateById(req.params.id, workspaceId);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    const result = await createVoiceInterviewSession(candidate, workspaceId);

    const baseUrl = process.env.APP_BASE_URL

      || `https://${process.env.PLATFORM_DOMAIN || 'coaileague.com'}`;

    res.status(201).json({
      ...result,
      voiceWebhookUrl: `${baseUrl}/api/webhooks/twilio/voice-interview/start?sessionId=${result.sessionId}&workspaceId=${workspaceId}`,
      instructions: 'Configure this URL as the Voice webhook in your Twilio number settings.',
    });
  } catch (err) {
    log.error('[Recruitment] voice-session error:', err);
    res.status(500).json({ error: 'Failed to create voice interview session' });
  }
});

export default router;
