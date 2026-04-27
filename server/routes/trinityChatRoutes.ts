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
import multer from 'multer';
import { trinityChatService } from '../services/ai-brain/trinityChatService';
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

  // Canonical platform + org roles that may access Trinity
  // Trinity is for owners, managers, support agents, and compliance officers — NOT field workers
  const allowedOrgRoles = ['org_owner', 'co_owner', 'manager', 'supervisor'];
  const allowedPlatformRoles = [
    'root_admin', 'deputy_admin', 'sysop',          // canonical names
    'support_manager', 'support_agent',              // support staff — can use Trinity
    'compliance_officer',                            // audit/compliance access
    'co_admin', 'sysops',                           // legacy aliases (backward compat)
  ];
  
  // Check workspaceRole from attachWorkspaceId middleware (req.workspaceRole)
  // This is properly resolved from workspace ownership or employee record
  const orgRole = authReq.workspaceRole;
  const platformRole = authReq.platformRole || authReq.user?.platformRole;
  
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
// Mode is dissolved: Trinity is ONE unified intelligence. Contextual depth
// (guru-level reasoning, hypothesis engine, etc.) activates automatically
// from org state + emotional signals + keyword stakes — not a UI toggle.
const chatSchema = z.object({
  message: z.string().min(1).max(10000),
  sessionId: z.string().optional(),
  images: z.array(z.string()).max(5).optional(),
});

const updateSettingsSchema = z.object({
  personalDevelopmentEnabled: z.boolean().optional(),
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

    const { message, sessionId, images } = parsed.data;
    const userId = authReq.user!.id;
    const workspaceId = authReq.workspaceId;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace context required' });
    }

    // v2.0: Detect support mode from platform role
    const platformRole = authReq.platformRole || authReq.user?.platformRole || null;
    const SUPPORT_PLATFORM_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'compliance_officer', 'co_admin', 'sysops'];
    const isSupportMode = platformRole !== null && SUPPORT_PLATFORM_ROLES.includes(platformRole);

    // Map workspaceRole/platformRole to Trinity's trustTier so the thalamus
    // and ACC include the right data in their signal. Without this the
    // service defaults to 'officer' — co_owner then loses financial data,
    // payroll insight, and owner-level scheduling commands.
    const workspaceRole = authReq.workspaceRole || '';
    // Trust tier determines what data Trinity surfaces.
    // Support staff get owner-equivalent diagnostic access for platform support,
    // but are flagged as support mode so Trinity can respect support privacy rules.
    const trustTier: 'owner' | 'manager' | 'supervisor' | 'officer' =
      ['org_owner', 'co_owner'].includes(workspaceRole) ||
      ['root_admin', 'co_admin', 'deputy_admin', 'sysops', 'sysop'].includes(platformRole || '')
        ? 'owner'
        : ['support_manager', 'support_agent', 'compliance_officer'].includes(platformRole || '')
          ? 'owner' // Support staff: owner-level diagnostic context with isSupportMode flag
          : ['org_manager', 'department_manager', 'manager'].includes(workspaceRole)
            ? 'manager'
            : ['supervisor', 'shift_leader'].includes(workspaceRole)
              ? 'supervisor'
              : 'officer';

    const response = await trinityChatService.chat({
      userId,
      workspaceId,
      message,
      sessionId,
      images,
      isSupportMode,
      trustTier,
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
    const userId = (req as any).user?.id;
    const workspaceId = (req as any).workspaceId;
    if (!userId || !workspaceId) return res.status(401).json({ error: 'Auth context required' });
    const messages = await trinityChatService.getSessionMessages(sessionId, userId, workspaceId);
    return res.json({ messages });
  } catch (error: unknown) {
    log.error('[TrinityChat] Session messages error:', error);
    return res.status(500).json({ error: 'Failed to get session messages' });
  }
});

// Legacy POST /api/trinity/chat/mode removed. Trinity has no "modes" —
// she is one unified intelligence that calibrates depth, warmth, and
// rigor from context automatically.

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

// ─── Trinity File Upload — multimodal analysis via vision ───────────────────

const trinityUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB cap
  fileFilter: (_req, file, cb) => {
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    cb(null, ALLOWED.includes(file.mimetype));
  },
});

router.post('/chat/with-file', attachWorkspaceId, requireTrinityAccess, trinityUpload.single('file'), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    const workspaceId = authReq.workspaceId;
    const { message, sessionId } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }
    if (!userId || !workspaceId) {
      return res.status(401).json({ error: !userId ? 'Authentication required' : 'Workspace context required' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'file is required' });
    }

    const base64 = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64}`;

    const response = await trinityChatService.chat({
      userId,
      workspaceId,
      message,
      sessionId,
      images: [dataUrl],
    });

    return res.json(response);
  } catch (error: unknown) {
    log.error('[TrinityChat] File upload chat error:', error);
    return res.status(500).json({ error: sanitizeError(error) || 'Failed to process file' });
  }
});

export default router;
