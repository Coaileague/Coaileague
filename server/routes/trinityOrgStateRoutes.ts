/**
 * Trinity Org State API — PFC (Prefrontal Cortex) endpoints
 * ==========================================================
 * Exposes the org survival state, priority stack, and threat signals
 * so the UI can surface Trinity's situational awareness to org owners.
 *
 * GET  /api/trinity/org-state/:workspaceId   — Full org state (admin/support only)
 * GET  /api/trinity/org-vitals/:workspaceId  — Quick vitals summary (org owner)
 * POST /api/trinity/org-state/:workspaceId/refresh — Force cache invalidation
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../auth';
import { requirePlatformRole , requirePlatformStaff } from '../rbac';
import { trinityPrefrontalCortex } from '../services/ai-brain/trinityPrefrontalCortex';
import { createLogger } from '../lib/logger';

const log = createLogger('TrinityOrgStateRoutes');
const router = Router();

const requirePlatformStaff = requirePlatformRole([
  'root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent',
  'platform_staff', 'compliance_officer',
]);

// ─── Full org survival state (platform staff only) ───────────────────────

router.get('/org-state/:workspaceId', requirePlatformStaff, async (req: Request, res: Response) => {
  const { workspaceId } = req.params;
  try {
    const state = await trinityPrefrontalCortex.getOrgState(workspaceId);
    res.json(state);
  } catch (err) {
    log.error(`[OrgState] Failed for ${workspaceId}: ${err}`);
    res.status(500).json({ error: 'Failed to compute org state' });
  }
});

// ─── Quick vitals (org owners can see their own workspace) ───────────────

router.get('/org-vitals/:workspaceId', requireAuth, async (req: any, res: Response) => {
  const { workspaceId } = req.params;
  const requestingUser = req.userId || req.user?.id;

  // Org owners can view their own workspace vitals; platform staff can view any
  const platformRole = req.platformRole;
  const isPlatformStaff = ['root_admin', 'deputy_admin', 'sysop', 'support_manager',
    'support_agent', 'platform_staff'].includes(platformRole || '');
  const isOwnWorkspace = req.workspaceId === workspaceId;

  if (!isPlatformStaff && !isOwnWorkspace) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const state = await trinityPrefrontalCortex.getOrgState(workspaceId);
    // Return a scoped view — no internal reasoning details for regular org owners
    res.json({
      workspaceId: state.workspaceId,
      mode: state.mode,
      survivalScore: state.survivalScore,
      modeRationale: state.modeRationale,
      domainScores: state.domainScores,
      threatSignals: state.threatSignals.slice(0, 5),
      priorityStack: state.priorityStack.slice(0, 8),
      calculatedAt: state.calculatedAt,
    });
  } catch (err) {
    log.error(`[OrgVitals] Failed for ${workspaceId}: ${err}`);
    res.status(500).json({ error: 'Failed to compute org vitals' });
  }
});

// ─── Force refresh (platform staff) ─────────────────────────────────────

router.post('/org-state/:workspaceId/refresh', requirePlatformStaff, async (req: Request, res: Response) => {
  const { workspaceId } = req.params;
  try {
    trinityPrefrontalCortex.invalidateCache(workspaceId);
    const state = await trinityPrefrontalCortex.getOrgState(workspaceId, true);
    res.json({ success: true, state });
  } catch (err) {
    res.status(500).json({ error: 'Failed to refresh org state' });
  }
});

export default router;
