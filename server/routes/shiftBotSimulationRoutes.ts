/**
 * SHIFT BOT SIMULATION ROUTES
 * ============================
 * Admin-only endpoint to run the shift room bot simulation
 * against the Acme Security Services dev workspace.
 *
 * POST /api/bots/simulate
 *   Runs all 9 simulation scenarios and returns PASS/FAIL results.
 *
 * Auth: platform admin only (sysop / deputy_admin / root_admin)
 */

import { Router } from 'express';
import { hasPlatformWideAccess } from '../rbac';
import { storage } from '../storage';
import { sanitizeError } from '../middleware/errorHandler';

const router = Router();

router.post('/simulate', async (req, res) => {
  try {
    // Require platform admin session
    const userId = req.user?.id || (req as any).session?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const platformRole = await storage.getUserPlatformRole(userId).catch(() => null);
    if (!hasPlatformWideAccess(platformRole ?? undefined)) {
      return res.status(403).json({ error: 'Platform admin access required' });
    }

    const { runShiftBotSimulation } = await import('../services/bots/shiftBotSimulationRunner');
    const result = await runShiftBotSimulation();

    return res.json({
      success: true,
      summary: {
        passed: result.passed,
        failed: result.failed,
        total: result.total,
        passRate: `${Math.round((result.passed / result.total) * 100)}%`,
        conversationId: result.conversationId,
      },
      results: result.results,
    });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: sanitizeError(err) });
  }
});

export default router;
