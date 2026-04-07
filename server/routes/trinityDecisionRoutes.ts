import { Router, type Request, type Response } from 'express';
import { trinityDecisionLogger } from '../services/trinityDecisionLogger';
import { requireAuth } from '../auth';
import { hasManagerAccess } from '../rbac';
import { createLogger } from '../lib/logger';
const log = createLogger('TrinityDecisionRoutes');

const router = Router();

function sanitizeDecision(d: Record<string, any>): Record<string, any> {
  const { claudeVerdict, claudeReasoning, claudeSuggestedAlternative, judgeModel, primaryModel, ...rest } = d;
  return {
    ...rest,
    verifierVerdict: claudeVerdict ?? null,
    verifierReasoning: claudeReasoning ?? null,
    verifierSuggestedAlternative: claudeSuggestedAlternative ?? null,
  };
}

function sanitizeDecisions(result: { decisions: Record<string, any>[]; total: number }) {
  return { ...result, decisions: result.decisions.map(sanitizeDecision) };
}

router.get('/decisions', requireAuth, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    const workspaceRole = req.workspaceRole;

    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace context required' });
    }

    if (!hasManagerAccess(workspaceRole)) {
      return res.status(403).json({ message: 'Manager or higher access required' });
    }

    const domain = req.query.domain as string | undefined;
    const triggerEvent = req.query.triggerEvent as string | undefined;
    const triadOnly = req.query.triadOnly === 'true';
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await trinityDecisionLogger.getDecisionsForWorkspace(workspaceId, {
      domain,
      triggerEvent,
      triadOnly,
      limit,
      offset,
    });

    const sanitized = sanitizeDecisions(result);
    res.set('X-Total-Count', String(sanitized.total));
    res.json(sanitized);
  } catch (error: unknown) {
    log.error('[TrinityDecisions] Failed to fetch decisions:', error);
    res.status(500).json({ message: 'Failed to fetch decisions' });
  }
});

router.get('/decisions/:entityType/:entityId', requireAuth, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    const workspaceRole = req.workspaceRole;

    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace context required' });
    }

    if (!hasManagerAccess(workspaceRole)) {
      return res.status(403).json({ message: 'Manager or higher access required' });
    }

    const { entityType, entityId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const decisions = await trinityDecisionLogger.getDecisionsForEntity(
      entityType, entityId, workspaceId, limit
    );

    res.json({ decisions: decisions.map(sanitizeDecision) });
  } catch (error: unknown) {
    log.error('[TrinityDecisions] Failed to fetch entity decisions:', error);
    res.status(500).json({ message: 'Failed to fetch decisions' });
  }
});

router.post('/decisions/:decisionId/override', requireAuth, async (req: any, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    const workspaceRole = req.workspaceRole;
    const userId = req.user?.id;

    if (!workspaceId || !userId) {
      return res.status(400).json({ message: 'Workspace context required' });
    }

    if (!hasManagerAccess(workspaceRole)) {
      return res.status(403).json({ message: 'Manager or higher access required' });
    }

    const { decisionId } = req.params;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({ message: 'Override reason required (min 5 characters)' });
    }

    await trinityDecisionLogger.markHumanOverride(decisionId, workspaceId, userId, reason.trim());

    res.json({ success: true, message: 'Decision override recorded' });
  } catch (error: unknown) {
    log.error('[TrinityDecisions] Failed to record override:', error);
    res.status(500).json({ message: 'Failed to record override' });
  }
});

export default router;
