/**
 * Trinity Financial Draft Routes — Approval Gateway (Wave 4 / Task 5)
 * ─────────────────────────────────────────────────────────────────────────────
 * These routes are the ONLY path to execute staged financial operations.
 * Trinity stages the math, owner approves or rejects via these endpoints.
 *
 * GET  /api/trinity/financial-drafts              — list pending drafts
 * POST /api/trinity/financial-drafts/:id/approve  — owner approves → Stripe/Plaid fires
 * POST /api/trinity/financial-drafts/:id/reject   — owner rejects → draft cancelled
 */

import { Router } from 'express';
import { requireAuth } from '../auth';
import { ensureWorkspaceAccess } from '../middleware/workspaceScope';
import { db } from '../db';
import { trinityFinancialDrafts } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
import type { AuthenticatedRequest } from '../rbac';

const log = createLogger('trinityFinancialDraftRoutes');
const router = Router();

// ── GET /api/trinity/financial-drafts ─────────────────────────────────────
router.get('/', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { getPendingFinancialDrafts } = await import('../services/trinity/trinityFinancialConscience');
    const drafts = await getPendingFinancialDrafts(workspaceId);
    return res.json({ drafts, count: drafts.length });
  } catch (err: unknown) {
    log.error('[FinancialDraftRoutes] Failed to list drafts', { err });
    return res.status(500).json({ error: 'Failed to load financial drafts' });
  }
});

// ── POST /api/trinity/financial-drafts/:id/approve ────────────────────────
// The HUMAN APPROVE click. This is the only way Stripe/Plaid fires.
router.post('/:draftId/approve', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { draftId } = req.params;
    const workspaceId = req.workspaceId!;
    const userId = req.user?.id || (req.session as unknown as { userId?: string })?.userId;

    if (!userId) return res.status(401).json({ error: 'User identity required' });

    // Verify requester is owner or root_admin
    const user = req.user as { workspaceRole?: string; role?: string } | undefined;
    const role = user?.workspaceRole || user?.role;
    if (role && !['owner', 'root_admin', 'deputy_admin'].includes(role)) {
      return res.status(403).json({
        error: 'APPROVAL_FORBIDDEN',
        message: 'Only workspace owners and platform admins can approve financial operations.',
      });
    }

    const { executeApprovedDraft } = await import('../services/trinity/trinityFinancialConscience');
    const result = await executeApprovedDraft({ draftId, workspaceId, approvedBy: userId });

    if (!result.success) {
      return res.status(409).json({ error: result.error });
    }

    log.info('[FinancialDraftRoutes] Draft approved and executed', { draftId, approvedBy: userId });
    return res.json({
      success: true,
      message: result.message,
      draftId,
      approvedBy: userId,
      result: result.result,
    });
  } catch (err: unknown) {
    log.error('[FinancialDraftRoutes] Approve failed', { err });
    return res.status(500).json({ error: 'Failed to execute approved draft' });
  }
});

// ── POST /api/trinity/financial-drafts/:id/reject ─────────────────────────
router.post('/:draftId/reject', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { draftId } = req.params;
    const workspaceId = req.workspaceId!;
    const userId = req.user?.id || (req.session as unknown as { userId?: string })?.userId;
    const { reason } = req.body;

    const [draft] = await db
      .select({ id: trinityFinancialDrafts.id, approvalStatus: trinityFinancialDrafts.approvalStatus })
      .from(trinityFinancialDrafts)
      .where(and(eq(trinityFinancialDrafts.id, draftId), eq(trinityFinancialDrafts.workspaceId, workspaceId)))
      .limit(1);

    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (draft.approvalStatus !== 'pending_approval') {
      return res.status(409).json({ error: `Draft cannot be rejected (status: ${draft.approvalStatus})` });
    }

    await db.update(trinityFinancialDrafts)
      .set({
        approvalStatus: 'rejected',
        rejectedBy: userId || 'unknown',
        rejectedAt: new Date(),
        rejectionReason: reason || 'Rejected by owner',
        updatedAt: new Date(),
      })
      .where(eq(trinityFinancialDrafts.id, draftId));

    log.info('[FinancialDraftRoutes] Draft rejected', { draftId, rejectedBy: userId });
    return res.json({ success: true, message: 'Financial draft rejected. No funds moved.', draftId });
  } catch (err: unknown) {
    log.error('[FinancialDraftRoutes] Reject failed', { err });
    return res.status(500).json({ error: 'Failed to reject draft' });
  }
});

export default router;
