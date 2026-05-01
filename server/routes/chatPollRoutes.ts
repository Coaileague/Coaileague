/**
 * Chat Polls — HelpAI drops coverage polls, officers vote
 * 
 * POST /api/chat/conversations/:id/polls        — create poll
 * GET  /api/chat/conversations/:id/polls        — list polls
 * POST /api/chat/polls/:pollId/vote             — vote on option
 * GET  /api/chat/polls/:pollId                  — poll result
 */
import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../auth';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { createLogger } from '../lib/logger';
import { supportTickets } from '@shared/schema';

const log = createLogger('ChatPolls');
const router = Router();

const createPollSchema = z.object({
  question: z.string().min(1).max(500),
  options: z.array(z.string().min(1).max(200)).min(2).max(6),
  expiresInMinutes: z.number().int().min(5).max(1440).default(60),
  allowMultiple: z.boolean().default(false),
});

const voteSchema = z.object({
  optionIndex: z.number().int().min(0).max(5),
});

// Create poll — runs in a conversation room
router.post('/conversations/:conversationId/polls', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { conversationId } = req.params;
  const workspaceId = req.workspaceId;
  const userId = req.user?.id;
  if (!workspaceId || !userId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = createPollSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });

  const { question, options, expiresInMinutes, allowMultiple } = parsed.data;

  try {
    const pollId = randomUUID();
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS chat_polls (
        id UUID PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        question TEXT NOT NULL,
        options JSONB NOT NULL,
        votes JSONB NOT NULL DEFAULT '{}',
        allow_multiple BOOLEAN NOT NULL DEFAULT false,
        expires_at TIMESTAMPTZ NOT NULL,
        is_closed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      INSERT INTO chat_polls (id, workspace_id, conversation_id, created_by, question, options, allow_multiple, expires_at)
      VALUES (${pollId}, ${workspaceId}, ${conversationId}, ${userId}, ${question}, ${JSON.stringify(options)}, ${allowMultiple}, ${expiresAt})
    `);

    const poll = { id: pollId, question, options, votes: {}, allowMultiple, expiresAt, isClosed: false, createdBy: userId };
    log.info(`[ChatPolls] Poll created: ${pollId} in ${conversationId}`);
    return res.status(201).json(poll);
  } catch (err: unknown) {
    log.error('[ChatPolls] Create error:', err?.message);
    return res.status(500).json({ error: 'Failed to create poll' });
  }
});

// Get polls for a conversation
router.get('/conversations/:conversationId/polls', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { conversationId } = req.params;
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS chat_polls (id UUID PRIMARY KEY, workspace_id TEXT, conversation_id TEXT, created_by TEXT, question TEXT, options JSONB, votes JSONB DEFAULT '{}', allow_multiple BOOLEAN DEFAULT false, expires_at TIMESTAMPTZ, is_closed BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW())`);
    const result = await db.execute(sql`
      SELECT * FROM chat_polls
      WHERE conversation_id = ${conversationId} AND workspace_id = ${workspaceId}
      ORDER BY created_at DESC LIMIT 20
    `);
    return res.json(result.rows ?? []);
  } catch (err: unknown) {
    log.error('[ChatPolls] Failed to fetch polls:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch polls' });
  }
});

// Vote
router.post('/polls/:pollId/vote', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { pollId } = req.params;
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = voteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed' });
  const { optionIndex } = parsed.data;

  try {
    // Atomic vote upsert
    await db.execute(sql`
      UPDATE chat_polls
      SET votes = jsonb_set(
        COALESCE(votes, '{}'),
        ARRAY[${userId}],
        to_jsonb(${optionIndex}::int)
      )
      WHERE id = ${pollId} AND is_closed = false AND expires_at > NOW()
    `);
    const result = await db.execute(sql`SELECT * FROM chat_polls WHERE id = ${pollId}`);
    if (!result.rows?.[0]) return res.status(404).json({ error: 'Poll not found or expired' });
    return res.json(result.rows[0]);
  } catch (err: unknown) {
    log.error('[ChatPolls] Vote error:', err?.message);
    return res.status(500).json({ error: 'Failed to record vote' });
  }
});

// Get single poll result
router.get('/polls/:pollId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await db.execute(sql`SELECT * FROM chat_polls WHERE id = ${req.params.pollId}`);
    if (!result.rows?.length) return res.status(404).json({ error: 'Poll not found' });
    return res.json(result.rows[0]);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Failed to fetch poll' });
  }
});

// GET /api/chat/tickets/:ticketId — used by HelpDeskProgressHeader
router.get('/tickets/:ticketId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { ticketId } = req.params;
    const ticket = await db.query.supportTickets.findFirst({
      where: eq(supportTickets.id, ticketId),
      columns: {
        id: true,
        ticketNumber: true,
        status: true,
        subject: true,
        priority: true,
        isEscalated: true,
        createdAt: true,
        updatedAt: true,
        workspaceId: true,
      },
    });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    return res.json(ticket);
  } catch (err: unknown) {
    log.error('[ChatTickets] Fetch error:', err?.message);
    return res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

export default router;
