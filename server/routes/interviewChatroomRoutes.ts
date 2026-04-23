import { Router } from 'express';
import type { Request, Response } from 'express';
import { pool } from '../db';
import { requireAuth } from '../auth';
import { createLogger } from '../lib/logger';
import { scheduleNonBlocking } from '../lib/scheduleNonBlocking';
import { interviewChatOrchestrator } from '../services/interviewChatOrchestrator';

const log = createLogger('InterviewChatroomRoutes');
const router = Router();

function requireWorkspaceUser(req: Request, res: Response): (NonNullable<Request['user']> & { workspaceId: string }) | null {
  const user = req.user;
  const workspaceId = user?.workspaceId || req.workspaceId;
  if (!user || !workspaceId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return { ...user, workspaceId };
}

// POST /api/interview/chatrooms — create a new chatroom for a candidate
router.post('/chatrooms', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = requireWorkspaceUser(req, res);
    if (!user) return;
    const { candidateId, sessionId, humanCopilotUserId, roomType } = req.body;

    if (!candidateId) return res.status(400).json({ error: 'candidateId required' });

    // Verify candidate belongs to workspace
    const candidateCheck = await pool.query(
      `SELECT id, full_name, position_applied FROM interview_candidates
       WHERE id = $1 AND workspace_id = $2`,
      [candidateId, user.workspaceId]
    );
    if (!candidateCheck.rows[0]) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    const chatroom = await interviewChatOrchestrator.createChatroom({
      workspaceId: user.workspaceId,
      candidateId,
      sessionId,
      humanCopilotUserId,
      roomType,
    });

    log.info(`Chatroom created id=${chatroom.id} candidate=${candidateId}`);
    res.status(201).json(chatroom);
  } catch (err: any) {
    log.error('Failed to create chatroom:', err?.message);
    res.status(500).json({ error: 'Failed to create chatroom' });
  }
});

// POST /api/interview/chatrooms/:id/start — Trinity sends first message
router.post('/chatrooms/:id/start', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = requireWorkspaceUser(req, res);
    if (!user) return;
    const room = await interviewChatOrchestrator.getChatroom(req.params.id);
    if (!room || room.workspace_id !== user.workspaceId) {
      return res.status(404).json({ error: 'Chatroom not found' });
    }
    if (room.status !== 'pending') {
      return res.status(400).json({ error: 'Interview already started or completed' });
    }

    await interviewChatOrchestrator.startInterview(req.params.id);
    res.json({ success: true, message: 'Interview started' });
  } catch (err: any) {
    log.error('Failed to start interview:', err?.message);
    res.status(500).json({ error: 'Failed to start interview' });
  }
});

// GET /api/interview/chatrooms — list chatrooms for workspace
router.get('/chatrooms', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = requireWorkspaceUser(req, res);
    if (!user) return;
    const result = await pool.query(
      `SELECT ic.id, ic.status, ic.room_type, ic.overall_score,
              ic.trinity_recommendation, ic.human_decision,
              ic.started_at, ic.completed_at, ic.created_at, ic.access_token,
              (c.first_name || ' ' || c.last_name) AS candidate_name,
              COALESCE(c.position_title, c.position_type) AS position_applied,
              c.email AS candidate_email
       FROM interview_chatrooms ic
       JOIN interview_candidates c ON c.id = ic.candidate_id
       WHERE ic.workspace_id = $1
       ORDER BY ic.created_at DESC
       LIMIT 100`,
      [user.workspaceId]
    );
    res.json(result.rows);
  } catch (err: any) {
    log.error('Failed to list chatrooms:', err?.message);
    res.status(500).json({ error: 'Failed to list chatrooms' });
  }
});

// GET /api/interview/chatrooms/:id — get chatroom with messages (manager view)
router.get('/chatrooms/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = requireWorkspaceUser(req, res);
    if (!user) return;
    const room = await interviewChatOrchestrator.getChatroom(req.params.id);
    if (!room || room.workspace_id !== user.workspaceId) {
      return res.status(404).json({ error: 'Chatroom not found' });
    }

    const messages = await interviewChatOrchestrator.getMessages(req.params.id, true);
    res.json({ ...room, messages });
  } catch (err: any) {
    log.error('Failed to get chatroom:', err?.message);
    res.status(500).json({ error: 'Failed to get chatroom' });
  }
});

// PATCH /api/interview/chatrooms/:id/decision — manager records hire decision
router.patch('/chatrooms/:id/decision', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = requireWorkspaceUser(req, res);
    if (!user) return;
    const { decision, notes } = req.body;
    if (!decision) return res.status(400).json({ error: 'decision required' });

    const room = await interviewChatOrchestrator.getChatroom(req.params.id);
    if (!room || room.workspace_id !== user.workspaceId) {
      return res.status(404).json({ error: 'Chatroom not found' });
    }

    await pool.query(
      `UPDATE interview_chatrooms SET human_decision = $1, human_notes = $2 WHERE id = $3`,
      [decision, notes || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err: any) {
    log.error('Failed to record decision:', err?.message);
    res.status(500).json({ error: 'Failed to record decision' });
  }
});

// ─── Public Candidate-Facing Routes (token-based) ─────────────────────────────

// GET /api/interview/room/:token — candidate accesses their interview room
router.get('/room/:token', async (req: Request, res: Response) => {
  try {
    const room = await interviewChatOrchestrator.getChatroomByToken(req.params.token);
    if (!room) return res.status(404).json({ error: 'Interview room not found' });

    const candidate = await interviewChatOrchestrator.getCandidate(room.candidate_id);
    const messages = await interviewChatOrchestrator.getMessages(room.id, false);

    res.json({
      id: room.id,
      status: room.status,
      roomType: room.room_type,
      trinityActive: room.trinity_active,
      currentQuestionIndex: room.current_question_index,
      totalQuestions: (room.questions_asked as any[]).length,
      overallScore: room.overall_score,
      trinityRecommendation: room.trinity_recommendation,
      candidateName: candidate?.full_name || 'Candidate',
      position: candidate?.position_applied || '',
      messages,
      startedAt: room.started_at,
      completedAt: room.completed_at,
    });
  } catch (err: any) {
    log.error('Failed to load interview room:', err?.message);
    res.status(500).json({ error: 'Failed to load interview room' });
  }
});

// POST /api/interview/room/:token/message — candidate sends a message
router.post('/room/:token/message', async (req: Request, res: Response) => {
  try {
    const room = await interviewChatOrchestrator.getChatroomByToken(req.params.token);
    if (!room) return res.status(404).json({ error: 'Interview room not found' });
    if (room.status === 'completed') {
      return res.status(400).json({ error: 'Interview is already complete' });
    }
    if (room.status === 'pending') {
      return res.status(400).json({ error: 'Interview has not started yet' });
    }

    const { text } = req.body;
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Message text required' });
    }

    const candidate = await interviewChatOrchestrator.getCandidate(room.candidate_id);
    const msg = await interviewChatOrchestrator.sendCandidateMessage(
      room.id,
      room.workspace_id,
      candidate?.email || room.candidate_id,
      text.trim()
    );

    // Process response async
    scheduleNonBlocking('interview.process-candidate-response', async () => {
      await interviewChatOrchestrator.processCandidateResponse(room.id, text.trim());
    });

    res.json({ success: true, message: msg });
  } catch (err: any) {
    log.error('Failed to send interview message:', err?.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GET /api/interview/room/:token/messages — poll for new messages
router.get('/room/:token/messages', async (req: Request, res: Response) => {
  try {
    const room = await interviewChatOrchestrator.getChatroomByToken(req.params.token);
    if (!room) return res.status(404).json({ error: 'Interview room not found' });

    const messages = await interviewChatOrchestrator.getMessages(room.id, false);
    res.json({ messages, status: room.status });
  } catch (err: any) {
    log.error('Failed to poll messages:', err?.message);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

export default router;
