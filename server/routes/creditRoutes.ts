/**
 * Credit/Token Usage Routes — real token usage via tokenManager (tier-based)
 * NOT credit_balances — that table is legacy and not in use.
 * Uses ai_usage_events table via tokenManager.
 */
import { Router } from 'express';
import { requireAuth } from '../rbac';
import { ensureWorkspaceAccess } from '../middleware/workspaceScope';
import type { AuthenticatedRequest } from '../rbac';
import { tokenManager, TIER_TOKEN_ALLOCATIONS } from '../services/billing/tokenManager';

const router = Router();

// GET /api/credits/balance — workspace token state (tier-based, not credit-based)
router.get('/balance', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const state = await tokenManager.getWorkspaceTokenState(req.workspaceId!);
    res.json({
      model: 'tier_based',
      currentBalance: state.currentBalance,
      monthlyAllocation: state.monthlyAllocation,
      totalUsed: state.totalTokensUsed,
      inOverage: state.inOverage,
      overageTokens: state.overageTokens,
      periodStart: state.periodStart,
      periodEnd: state.periodEnd,
      unlimited: state.unlimited ?? false,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/credits/usage — token usage history from ai_usage_events
router.get('/usage', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const history = await tokenManager.getUsageHistory(req.workspaceId!, limit);
    res.json({ usage: history, model: 'tier_based' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/credits/tiers — show all tier allocations (public reference)
router.get('/tiers', requireAuth, (_req, res) => {
  res.json({ tiers: TIER_TOKEN_ALLOCATIONS, model: 'tier_based' });
});

export default router;
