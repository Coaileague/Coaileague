/**
 * TRINITY CHAT ROUTES
 * ===================
 * API endpoints for Trinity conversational interface with BUDDY mode support.
 * 
 * RBAC: org_owner, co_owner, manager only (supervisors and employees excluded)
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { trinityChatService, ConversationMode } from '../services/ai-brain/trinityChatService';
import { attachWorkspaceId, AuthenticatedRequest } from '../rbac';
import { requireAuth } from '../auth';
import { createLogger } from '../lib/logger';
import { db } from '../db';
import { trinityThoughtSignatures } from '@shared/schema';
import { and, desc, eq, gte } from 'drizzle-orm';
import { trinityGlobalWorkspace } from '../services/ai-brain/trinityGlobalWorkspace';
const log = createLogger('TrinityChatRoutes');


const router = Router();

router.use(requireAuth);

// RBAC Middleware - Only allow org_owner, co_owner, manager (and platform staff)
const requireTrinityAccess = (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  
  if (!authReq.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const allowedOrgRoles = ['org_owner', 'co_owner', 'manager'];
  const allowedPlatformRoles = ['root_admin', 'co_admin', 'sysops', 'deputy_admin'];
  
  // Check workspaceRole from attachWorkspaceId middleware (req.workspaceRole)
  // This is properly resolved from workspace ownership or employee record
  const orgRole = authReq.workspaceRole;
  // @ts-expect-error — TS migration: fix in refactoring sprint
  const platformRole = (authReq as any).platformRole || (authReq.user).platformRole;
  
  // Allow if user has an allowed org role OR platform role
  const hasOrgAccess = orgRole && allowedOrgRoles.includes(orgRole);
  const hasPlatformAccess = platformRole && allowedPlatformRoles.includes(platformRole);
  
  if (!hasOrgAccess && !hasPlatformAccess) {
    log.info('[TrinityChat] Access denied:', {
      userId: authReq.user.id,
      workspaceRole: orgRole,
      platformRole,
    });
    return res.status(403).json({ 
      error: 'Access denied',
      message: 'Trinity Chat is available for org owners, co-owners, and managers only',
    });
  }

  next();
};

// Request schemas
const chatSchema = z.object({
  message: z.string().min(1).max(10000),
  mode: z.enum(['business', 'personal', 'integrated', 'guru']).default('business'),
  sessionId: z.string().optional(),
  images: z.array(z.string()).max(5).optional(),
});

const updateSettingsSchema = z.object({
  personalDevelopmentEnabled: z.boolean().optional(),
  spiritualGuidance: z.enum(['none', 'general', 'christian']).optional(),
  accountabilityLevel: z.enum(['gentle', 'balanced', 'challenging']).optional(),
  weeklyCheckInEnabled: z.boolean().optional(),
  checkInDay: z.string().optional(),
  checkInTime: z.string().optional(),
  showThoughtProcess: z.boolean().optional(),
  proactiveInsights: z.boolean().optional(),
  memoryRecallDepth: z.enum(['minimal', 'moderate', 'deep']).optional(),
  preferredCommunicationStyle: z.enum(['direct', 'supportive', 'challenging']).optional(),
  allowPersonalQuestions: z.boolean().optional(),
});

/**
 * POST /api/trinity/chat/chat
 * Send a message to Trinity and get a response
 */
router.post('/chat', attachWorkspaceId, requireTrinityAccess, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    }

    const { message, mode, sessionId, images } = parsed.data;
    const userId = authReq.user!.id;
    const workspaceId = authReq.workspaceId;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace context required' });
    }

    // v2.0: Detect support mode from platform role
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const platformRole = (authReq.user)?.platformRole || null;
    const SUPPORT_PLATFORM_ROLES = ['root_admin', 'co_admin', 'sysops', 'deputy_admin'];
    const isSupportMode = platformRole !== null && SUPPORT_PLATFORM_ROLES.includes(platformRole);

    const response = await trinityChatService.chat({
      userId,
      workspaceId,
      message,
      mode: mode as ConversationMode,
      sessionId,
      images,
      isSupportMode,
    });

    return res.json(response);
  } catch (error: unknown) {
    log.error('[TrinityChat] Error:', error);
    return res.status(500).json({ error: 'Failed to process message', details: sanitizeError(error) });
  }
});

/**
 * GET /api/trinity/chat/history
 * Get user's conversation history
 */
router.get('/history', attachWorkspaceId, requireTrinityAccess, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;
    const workspaceId = authReq.workspaceId;
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 500);

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace context required' });
    }

    const history = await trinityChatService.getUserConversationHistory(userId, workspaceId, limit);
    return res.json(history);
  } catch (error: unknown) {
    log.error('[TrinityChat] History error:', error);
    return res.status(500).json({ error: 'Failed to get history' });
  }
});

/**
 * GET /api/trinity/chat/session/:sessionId/messages
 * Get messages for a specific session
 */
router.get('/session/:sessionId/messages', attachWorkspaceId, requireTrinityAccess, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const messages = await trinityChatService.getSessionMessages(sessionId);
    return res.json({ messages });
  } catch (error: unknown) {
    log.error('[TrinityChat] Session messages error:', error);
    return res.status(500).json({ error: 'Failed to get session messages' });
  }
});

/**
 * POST /api/trinity/chat/mode
 * Switch conversation mode
 */
router.post('/mode', attachWorkspaceId, requireTrinityAccess, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { mode } = req.body;
    if (!['business', 'personal', 'integrated', 'guru'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode' });
    }

    const userId = authReq.user!.id;
    const workspaceId = authReq.workspaceId;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace context required' });
    }

    const session = await trinityChatService.switchMode(userId, workspaceId, mode as ConversationMode);
    return res.json({ session, mode });
  } catch (error: unknown) {
    log.error('[TrinityChat] Mode switch error:', error);
    return res.status(500).json({ error: 'Failed to switch mode' });
  }
});

/**
 * GET /api/trinity/chat/settings
 * Get BUDDY settings for current user
 */
router.get('/settings', attachWorkspaceId, requireTrinityAccess, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.id;
    const workspaceId = authReq.workspaceId;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace context required' });
    }

    const settings = await trinityChatService.getOrCreateBuddySettings(userId, workspaceId);
    return res.json(settings);
  } catch (error: unknown) {
    log.error('[TrinityChat] Settings error:', error);
    return res.status(500).json({ error: 'Failed to get settings' });
  }
});

/**
 * PATCH /api/trinity/chat/settings
 * Update BUDDY settings
 */
router.patch('/settings', attachWorkspaceId, requireTrinityAccess, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid settings', details: parsed.error.issues });
    }

    const userId = authReq.user!.id;
    const workspaceId = authReq.workspaceId;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace context required' });
    }

    const settings = await trinityChatService.updateBuddySettings(userId, workspaceId, parsed.data as any);
    return res.json(settings);
  } catch (error: unknown) {
    log.error('[TrinityChat] Settings update error:', error);
    return res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * GET /api/trinity/chat/thought-stream?sessionId=<id>
 *
 * Returns Trinity's active thought phase plus the most recent thought
 * entries from the thought engine for the session. Used by the
 * TrinityThoughtBar to render "Reading your message / Considering options /
 * Forming a plan / Taking action" in real time while a chat request is
 * in-flight.
 */
router.get('/thought-stream', attachWorkspaceId, requireTrinityAccess, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : null;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace context required' });
    }

    // Look for thoughts in the last 2 minutes for this session/workspace.
    const since = new Date(Date.now() - 120_000);
    const conditions = sessionId
      ? and(
          eq(trinityThoughtSignatures.workspaceId, workspaceId),
          eq(trinityThoughtSignatures.sessionId, sessionId),
          gte(trinityThoughtSignatures.createdAt, since),
        )
      : and(
          eq(trinityThoughtSignatures.workspaceId, workspaceId),
          gte(trinityThoughtSignatures.createdAt, since),
        );

    const rows = await db
      .select()
      .from(trinityThoughtSignatures)
      .where(conditions)
      .orderBy(desc(trinityThoughtSignatures.createdAt))
      .limit(8);

    const mostRecent = rows[0] ?? null;
    // @ts-expect-error — context is jsonb
    const currentPhase: string | null = mostRecent?.context?.phase ?? null;

    return res.json({
      sessionId,
      workspaceId,
      currentPhase,
      isThinking: rows.length > 0,
      lastThoughtAt: mostRecent?.createdAt ?? null,
      thoughts: rows.map((r: any) => ({
        id: r.id,
        thoughtType: r.thoughtType,
        content: String(r.content ?? '').substring(0, 240),
        confidence: r.confidence,
        phase: r.context?.phase ?? null,
        createdAt: r.createdAt,
      })),
      activeSignals: trinityGlobalWorkspace.getSignalSummary(workspaceId),
    });
  } catch (error: unknown) {
    log.error('[TrinityChat] Thought stream error:', error);
    return res.status(500).json({ error: 'Failed to get thought stream' });
  }
});

export default router;
