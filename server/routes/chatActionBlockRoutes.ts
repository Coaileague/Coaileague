/**
 * Chat Action Block Routes — Wave 7 / Task 4
 * ─────────────────────────────────────────────────────────────────────────────
 * PATCH /api/chat/messages/:messageId/respond
 * Records a user's response to a uiComponent Action Block in a chat message.
 * Updates the message's uiComponent JSONB with respondedAt, respondedBy, response.
 * Broadcasts the updated message to all room participants via broadcastToWorkspace.
 */

import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { chatMessages } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../auth';
import { ensureWorkspaceAccess } from '../middleware/workspaceScope';
import { createLogger } from '../lib/logger';
import type { AuthenticatedRequest } from '../rbac';
import { broadcastToWorkspace } from '../websocket';

const log = createLogger('chatActionBlockRoutes');
const router = Router();

const respondSchema = z.object({
  response: z.unknown(), // Free-form — each block type has its own shape
});

// PATCH /api/chat/messages/:messageId/respond
router.patch('/:messageId/respond', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const workspaceId = req.workspaceId!;
    const userId = req.user?.id || (req.session as unknown as { userId?: string })?.userId;
    const userName = (req.user as Record<string, string> | undefined)?.name || userId || 'Unknown';

    const parsed = respondSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request' });

    const [msg] = await db
      .select({ id: chatMessages.id, uiComponent: chatMessages.uiComponent, conversationId: chatMessages.conversationId })
      .from(chatMessages)
      .where(and(eq(chatMessages.id, messageId), eq(chatMessages.workspaceId, workspaceId)))
      .limit(1);

    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const existing = (msg.uiComponent as Record<string, unknown> | null) ?? {};
    if (existing.respondedAt) {
      return res.status(409).json({ error: 'Message already responded to', respondedAt: existing.respondedAt });
    }

    const updatedComponent = {
      ...existing,
      response: parsed.data.response,
      respondedAt: new Date().toISOString(),
      respondedBy: userName,
      respondedById: userId,
    };

    await db.update(chatMessages)
      .set({ uiComponent: updatedComponent as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(chatMessages.id, messageId));

    // Broadcast updated message to room so all participants see the response state
    broadcastToWorkspace(workspaceId, {
      type: 'message_action_block_responded',
      messageId,
      conversationId: msg.conversationId || '',
      uiComponent: updatedComponent,
      respondedBy: userName,
      respondedAt: updatedComponent.respondedAt,
    });

    log.info('[ActionBlock] Response recorded', { messageId, workspaceId, respondedBy: userName });
    return res.json({ success: true, messageId, respondedAt: updatedComponent.respondedAt });
  } catch (err: unknown) {
    log.error('[ActionBlock] Respond failed:', err);
    return res.status(500).json({ error: 'Failed to record response' });
  }
});

export default router;
