/**
 * Trinity Limbic System Routes — Phase 16
 *
 * Emotional intelligence endpoints for Trinity's limbic system.
 * All endpoints are workspace-scoped.
 *
 * Mounted at: /api/trinity/limbic
 *
 * Routes:
 *   POST   /detect                           — Detect emotional state from text
 *   POST   /officer-burnout/:officerId       — Assess officer burnout risk
 *   GET    /history/:entityId/:entityType    — Emotional history for an entity
 *   GET    /patterns/:entityId/:entityType   — Pattern learning + trend analysis
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Response } from 'express';
import { requireManager, type AuthenticatedRequest } from '../rbac';
import { trinityLimbicSystem } from '../services/ai-brain/trinityLimbicSystem';
import { createLogger } from '../lib/logger';

const log = createLogger('TrinityLimbicRoutes');
const router = Router();

// All limbic routes require at least manager-level access.
// (Workspace context is provided by ensureWorkspaceAccess, mounted in trinity.ts.)
router.use(requireManager);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/trinity/limbic/detect
// Detect emotional state from arbitrary text content.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/detect', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace context required' });
    }

    const { text, context, entityId, entityType, storeMemory } = req.body as {
      text: string;
      context?: { messageType?: 'email' | 'ticket' | 'chat'; senderId?: string };
      entityId?: string;
      entityType?: 'client' | 'officer' | 'ticket';
      storeMemory?: boolean;
    };

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: '`text` field is required' });
    }

    const messageType = context?.messageType ?? 'ticket';

    const signal = await trinityLimbicSystem.detectEmotionalState(text, {
      workspace_id: workspaceId,
      messageType,
      senderId: context?.senderId,
    });

    // Optionally persist this detection to emotional memory
    if (storeMemory && entityId && entityType) {
      await trinityLimbicSystem.storeEmotionalMemory(
        entityId,
        entityType,
        signal,
        workspaceId,
      );
    }

    res.json({ success: true, signal });
  } catch (err: unknown) {
    log.error('Failed to detect emotional state', err);
    res.status(500).json({ success: false, error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/trinity/limbic/officer-burnout/:officerId
// Assess burnout risk for a specific officer.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/officer-burnout/:officerId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace context required' });
    }

    const { officerId } = req.params;
    if (!officerId) {
      return res.status(400).json({ success: false, error: 'officerId param required' });
    }

    const assessment = await trinityLimbicSystem.detectOfficerBurnout(officerId, workspaceId);

    res.json({ success: true, assessment });
  } catch (err: unknown) {
    log.error('Failed to assess officer burnout', err);
    res.status(500).json({ success: false, error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trinity/limbic/history/:entityId/:entityType
// Retrieve the emotional history for an entity (client / officer / ticket).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/history/:entityId/:entityType', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace context required' });
    }

    const { entityId, entityType } = req.params;
    const days = parseInt((req.query.days as string) ?? '30', 10);

    if (!['client', 'officer', 'ticket'].includes(entityType)) {
      return res.status(400).json({ success: false, error: 'entityType must be client | officer | ticket' });
    }

    const history = await trinityLimbicSystem.getEmotionalHistory(
      entityId,
      entityType as 'client' | 'officer' | 'ticket',
      workspaceId,
      isNaN(days) ? 30 : Math.min(days, 365),
    );

    res.json({ success: true, history, count: history.length });
  } catch (err: unknown) {
    log.error('Failed to fetch emotional history', err);
    res.status(500).json({ success: false, error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trinity/limbic/patterns/:entityId/:entityType
// Analyse emotional trend patterns and return learning-derived recommendation.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/patterns/:entityId/:entityType', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace context required' });
    }

    const { entityId, entityType } = req.params;

    if (!['client', 'officer', 'ticket'].includes(entityType)) {
      return res.status(400).json({ success: false, error: 'entityType must be client | officer | ticket' });
    }

    const trend = await trinityLimbicSystem.learnFromPatterns(
      entityId,
      entityType as 'client' | 'officer' | 'ticket',
      workspaceId,
    );

    res.json({ success: true, ...trend });
  } catch (err: unknown) {
    log.error('Failed to analyse emotional patterns', err);
    res.status(500).json({ success: false, error: sanitizeError(err) });
  }
});

export default router;
