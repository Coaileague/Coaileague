/**
 * Token Usage Routes — real token metering via tokenManager
 * Replaces legacy credit_balances system entirely.
 * Each tier gets a monthly token allotment; overages are tracked.
 */
import { Router } from 'express';
import { requireAuth } from '../rbac';
import { ensureWorkspaceAccess } from '../middleware/workspaceScope';
import type { AuthenticatedRequest } from '../rbac';
import { tokenManager, TOKEN_COSTS, TIER_TOKEN_ALLOCATIONS } from '../services/billing/tokenManager';

const router = Router();

// GET /api/tokens/balance — current token balance and tier
router.get('/balance', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const state = await tokenManager.getWorkspaceState(req.workspaceId!);
    res.json({
      workspaceId: req.workspaceId,
      tokenBalance: state?.currentBalance ?? 0,
      monthlyAllocation: state?.monthlyAllocation ?? 0,
      totalUsed: state?.totalTokensUsed ?? 0,
      inOverage: state?.inOverage ?? false,
      overageTokens: state?.overageTokens ?? 0,
      periodEnd: state?.periodEnd,
    });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// GET /api/tokens/usage — per-feature token usage
router.get('/usage', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const history = await tokenManager.getUsageHistory(req.workspaceId!, limit);
    res.json({ usage: history, period: '30d' });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// GET /api/tokens/tiers — all tier token allocations
router.get('/tiers', requireAuth, (_req, res) => {
  res.json({ tiers: TIER_TOKEN_ALLOCATIONS, featureCosts: TOKEN_COSTS });
});

// GET /api/tokens/state — full workspace token state
router.get('/state', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const state = await tokenManager.getWorkspaceState(req.workspaceId!);
    res.json(state ?? { workspaceId: req.workspaceId, tokenBalance: 0 });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

export default router;
