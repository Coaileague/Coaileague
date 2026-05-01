/**
 * Upsell + Feature Addon Routes
 * Mounted at /api/billing/upsell
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import type { AuthenticatedRequest } from '../types';
import { requireAuth } from '../auth';
import {
  getWorkspaceAddons,
  activateAddon,
  cancelAddon,
  getUpsellRecommendations,
  ADDON_PLANS,
} from '../services/billing/upsellService';
import { supportLookupFull } from '../services/identityService';
import { hasPlatformWideAccess, requireOwner } from '../rbac';
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('UpsellRoutes');


const router = Router();

// ============================================================================
// UPSELL RECOMMENDATIONS
// ============================================================================

/** GET /api/billing/upsell/recommendations — org's upsell suggestions + 30d stats */
router.get('/recommendations', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace required' });

    const data = await getUpsellRecommendations(workspaceId);
    res.json({ success: true, ...data });
  } catch (err: unknown) {
    log.error('[UpsellRoutes] recommendations error:', err);
    res.status(500).json({ message: 'Failed to load recommendations' });
  }
});

/** POST /api/billing/upsell/dismiss/:id — dismiss a suggestion */
router.post('/dismiss/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace context required' });
    const { db } = await import('../db');
    const { upsellEvents } = await import('@shared/schema');
    const { eq, and } = await import('drizzle-orm');
    const [updated] = await db.update(upsellEvents)
      .set({ resolved: true, updatedAt: new Date() })
      .where(and(eq(upsellEvents.id, req.params.id), eq(upsellEvents.workspaceId, workspaceId)))
      .returning({ id: upsellEvents.id });
    if (!updated) return res.status(404).json({ message: 'Event not found' });
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ message: 'Failed to dismiss' });
  }
});

// ============================================================================
// FEATURE ADDONS
// ============================================================================

/** GET /api/billing/upsell/addons — list workspace's addons */
router.get('/addons', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace required' });

    const addons = await getWorkspaceAddons(workspaceId);
    res.json({ success: true, addons, availablePlans: ADDON_PLANS });
  } catch (err: unknown) {
    res.status(500).json({ message: 'Failed to load addons' });
  }
});

/** GET /api/billing/upsell/addon-plans — all available addon plans */
router.get('/addon-plans', async (_req, res) => {
  res.json({ success: true, plans: ADDON_PLANS });
});

/** POST /api/billing/upsell/addons — activate an addon plan */
router.post('/addons', requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace required' });

    const { featureKey } = req.body;
    if (!featureKey) return res.status(400).json({ message: 'featureKey required' });
    if (!ADDON_PLANS[featureKey]) return res.status(400).json({ message: `No addon plan for feature: ${featureKey}` });

    const addon = await activateAddon(workspaceId, featureKey);
    res.json({ success: true, addon });
  } catch (err: unknown) {
    log.error('[UpsellRoutes] activate addon error:', err);
    res.status(500).json({ message: sanitizeError(err) || 'Failed to activate addon' });
  }
});

/** DELETE /api/billing/upsell/addons/:featureKey — cancel an addon */
router.delete('/addons/:featureKey', requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace required' });

    await cancelAddon(workspaceId, req.params.featureKey);
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ message: 'Failed to cancel addon' });
  }
});

// ============================================================================
// SUPPORT AGENT IDENTITY LOOKUP
// ============================================================================

/** GET /api/billing/upsell/identity-lookup?q= — full identity for support agents */
router.get('/identity-lookup', async (req: AuthenticatedRequest, res) => {
  try {
    // Must be platform staff
    if (!hasPlatformWideAccess(req.platformRole)) {
      return res.status(403).json({ message: 'Support access required' });
    }

    const query = String(req.query.q || '').trim();
    if (!query || query.length < 2) return res.status(400).json({ message: 'Query must be at least 2 characters' });

    const results = await supportLookupFull(query);
    res.json({ success: true, results });
  } catch (err: unknown) {
    log.error('[UpsellRoutes] identity-lookup error:', err);
    res.status(500).json({ message: 'Failed to perform identity lookup' });
  }
});

export default router;
