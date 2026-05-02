import { type Response } from 'express';
/**
 * featureStubRoutes.ts
 * ════════════════════
 * Graceful stub endpoints for features that are GENUINELY unbuilt.
 * 
 * IMPORTANT: Mounted LAST in routes.ts — after all real domain mounts.
 * Only fires when no real route matches the request path.
 *
 * Routes are removed from this file as features are built.
 * Use ACME simulation data or real DB queries instead of stubs where possible.
 *
 * Updated Phase 13 — removed 24 routes that were wrong-path bugs (real routes
 * already existed but stub was intercepting them). Remaining 11 are genuinely
 * unbuilt features with no backing service.
 */

import { Router } from 'express';
import { requireAuth } from '../auth';
import { ensureWorkspaceAccess } from '../middleware/workspaceScope';
import type { AuthenticatedRequest } from '../rbac';
import { createLogger } from '../lib/logger';

const log = createLogger('FeatureStubs');
const router = Router();

function stub(feature: string, eta?: string) {
  return async (req: AuthenticatedRequest, res: Response) => {
    log.info(`[FeatureStub] ${feature} accessed by workspace ${req.workspaceId || 'unknown'}`);
    // Fire Trinity demand-tracking event non-blocking
    Promise.resolve().then(async () => {
      try {
        const { platformEventBus } = await import('../services/platformEventBus');
        platformEventBus.publish({
          type: 'feature_accessed_stub',
          workspaceId: req.workspaceId || 'platform',
          metadata: { feature, path: req.path, method: req.method },
        }).catch(() => null);
      } catch (_) { /* non-blocking */ }
    });
    return res.status(503).json({
      available: false,
      feature,
      message: eta
        ? `${feature} is coming soon (ETA: ${eta}). Your interest has been noted.`
        : `${feature} is not yet available in this workspace tier.`,
    });
  };
}

// ── Genuinely unbuilt features (no backing service or route) ──────────────────

// CAD Console base — /api/cad/calls is real (cadRouter), but the base CAD
// dispatch console interface is not built yet.
router.get('/cad',        requireAuth, ensureWorkspaceAccess, stub('CAD Dispatch Console', 'Q3 2026'));
router.post('/cad',       requireAuth, ensureWorkspaceAccess, stub('CAD Dispatch Console', 'Q3 2026'));

// Audit Suite audits — auditSuiteRouter only has /visual-compliance/slots.
// The /audits CRUD (create, list, manage audit cases) is not yet in auditSuiteRoutes.ts.
router.get('/audit-suite/audits',  requireAuth, ensureWorkspaceAccess, stub('Audit Suite — Audit Cases', 'Q3 2026'));
router.post('/audit-suite/audits', requireAuth, ensureWorkspaceAccess, stub('Audit Suite — Audit Cases', 'Q3 2026'));

// Audit citations — not implemented in auditSuiteRouter yet.
router.get('/audit-suite/citations', requireAuth, ensureWorkspaceAccess, stub('Audit Citations', 'Q3 2026'));

// Contractor handoff — service logic exists but no HTTP route registered.
router.get('/accept-handoff',  requireAuth, stub('Contractor Handoff', 'Q3 2026'));
router.post('/accept-handoff', requireAuth, stub('Contractor Handoff', 'Q3 2026'));

// AI Brain extras — sentiment and diagnostics not exposed as HTTP endpoints yet.
router.get('/ai-brain/sentiment',              requireAuth, stub('AI Sentiment Analysis'));
router.post('/ai-brain/diagnostic/run-fast',   requireAuth, stub('AI Diagnostics'));

// Platform admin — financial provider top-off not routed.
router.post('/admin/financial/provider-topoff', requireAuth, stub('Platform Admin: Financial Top-off'));

// Auditor compliance trend — no service or route for this metric.
router.get('/auditor/compliance-trend', requireAuth, stub('Compliance Trend'));

// Auditor compliance score — training-compliance has it at a different path.
// Client currently calls /api/auditor/compliance-score; real route is at
// /api/training-compliance/compliance-score/:employeeId.
// Stub kept until client is updated to use the correct path.
router.get('/auditor/compliance-score', requireAuth, stub('Compliance Score'));

export default router;
