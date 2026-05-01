/**
 * Chat Full-Text Search
 * GET /api/chat/search?q=&workspaceId=&conversationId=&before=&after=&limit=
 */
import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../auth';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { createLogger } from '../lib/logger';

const log = createLogger('ChatSearch');
const router = Router();

const searchSchema = z.object({
  q: z.string().min(1).max(500),
  conversationId: z.string().optional(),
  before: z.string().optional(),
  after: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.get('/search', requireAuth, async (req: AuthenticatedRequest, res) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(401).json({ error: 'Unauthorized' });

  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });

  const { q, conversationId, before, after, limit } = parsed.data;

  try {
    // Full-text search on chat_messages table
    // Uses PostgreSQL plainto_tsquery for safe tokenization
    const results = await db.execute(sql`
      SELECT
        cm.id,
        cm.conversation_id,
        cm.sender_name,
        cm.sender_type,
        cm.message,
        cm.created_at,
        cc.name AS room_name
      FROM chat_messages cm
      LEFT JOIN chat_conversations cc ON cc.id = cm.conversation_id
      WHERE cm.workspace_id = ${workspaceId}
        AND (${conversationId} IS NULL OR cm.conversation_id = ${conversationId})
        AND to_tsvector('english', COALESCE(cm.message, '')) @@ plainto_tsquery('english', ${q})
        AND (${before} IS NULL OR cm.created_at < ${before}::timestamptz)
        AND (${after} IS NULL OR cm.created_at > ${after}::timestamptz)
        AND cm.deleted_for_all = false
      ORDER BY cm.created_at DESC
      LIMIT ${limit}
    `);

    return res.json({
      query: q,
      results: results.rows ?? [],
      count: results.rows?.length ?? 0,
    });
  } catch (err: unknown) {
    // If chat_messages table doesn't have full-text index yet, fall back to ILIKE
    try {
      const fallback = await db.execute(sql`
        SELECT
          cm.id, cm.conversation_id, cm.sender_name, cm.sender_type,
          cm.message, cm.created_at,
          cc.name AS room_name
        FROM chat_messages cm
        LEFT JOIN chat_conversations cc ON cc.id = cm.conversation_id
        WHERE cm.workspace_id = ${workspaceId}
          AND (${conversationId} IS NULL OR cm.conversation_id = ${conversationId})
          AND cm.message ILIKE ${`%${q}%`}
        ORDER BY cm.created_at DESC
        LIMIT ${limit}
      `);
      return res.json({ query: q, results: fallback.rows ?? [], count: fallback.rows?.length ?? 0 });
    } catch (fallbackErr: unknown) {
      log.error('[ChatSearch] Search error:', fallbackErr?.message);
      return res.json({ query: q, results: [], count: 0 });
    }
  }
});

export default router;
