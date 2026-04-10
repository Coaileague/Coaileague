import { Router } from "express";
import { db } from "../db";
import { workspaces } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../rbac";
import { createLogger } from '../lib/logger';
const log = createLogger('CreditRoutes');


const router = Router();

/**
 * Resolve the active workspace from the request.
 * Priority: (req as any).user?.currentWorkspaceId (session-bound) → req.workspaceId (middleware) → resolveWorkspaceForUser
 * This enforces session isolation so multi-workspace users see the correct org's data.
 */
async function resolveActiveWorkspace(req: AuthenticatedRequest): Promise<{ workspaceId: string | null; error?: string }> {
  const userId = req.user?.id;
  if (!userId) return { workspaceId: null, error: 'Unauthorized' };

  // 1. Workspace set by middleware (ensureWorkspaceAccess) — highest priority
  // @ts-expect-error — TS migration: fix in refactoring sprint
  const middlewareWsId = req.workspaceId || (req.user)?.workspaceId;
  if (middlewareWsId) {
    return { workspaceId: middlewareWsId };
  }

  // 2. Session-bound active workspace
  const sessionWsId = (req.user)?.currentWorkspaceId;
  if (sessionWsId) {
    return { workspaceId: sessionWsId };
  }

  // 3. DB lookup fallback
  const { resolveWorkspaceForUser } = await import('../rbac');
  const { workspaceId, error } = await resolveWorkspaceForUser(userId);
  return { workspaceId, error };
}

/**
 * Resolve the billing workspace for a given workspace.
 * For standalone orgs: returns same workspaceId.
 * For sub-orgs with shared credit pool: returns the parent (mother org) workspaceId.
 */
async function resolveBillingWorkspace(workspaceId: string): Promise<{ billingWorkspaceId: string; isSubOrg: boolean }> {
  try {
    const [ws] = await db.select({
      isSubOrg: workspaces.isSubOrg,
      parentWorkspaceId: workspaces.parentWorkspaceId,
      subOrgCreditPoolShared: workspaces.subOrgCreditPoolShared,
    }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);

    if (ws?.isSubOrg && ws.parentWorkspaceId && ws.subOrgCreditPoolShared) {
      return { billingWorkspaceId: ws.parentWorkspaceId, isSubOrg: true };
    }
  } catch {
    // Non-critical: fall back to direct workspace
  }
  return { billingWorkspaceId: workspaceId, isSubOrg: false };
}

router.get('/balance', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { workspaceId, error } = await resolveActiveWorkspace(req);
    if (!workspaceId) {
      return res.status(400).json({ error: error || 'No workspace found' });
    }

    // Resolve billing workspace (parent for sub-orgs with shared pool)
    const { billingWorkspaceId, isSubOrg } = await resolveBillingWorkspace(workspaceId);

    // Load workspace metadata from the billing owner
    const [workspace] = await db.select().from(workspaces)
      .where(eq(workspaces.id, billingWorkspaceId)).limit(1);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const { creditManager, isUnlimitedCreditUser, UNLIMITED_CREDITS_BALANCE } = await import('../services/billing/creditManager');

    // Short-circuit for unlimited users
    const userId = req.user?.id!;
    const hasUnlimited = await isUnlimitedCreditUser(userId, workspaceId);
    if (hasUnlimited) {
      return res.json({
        id: 'unlimited',
        workspaceId: billingWorkspaceId,
        currentBalance: UNLIMITED_CREDITS_BALANCE,
        monthlyAllocation: -1,
        totalCreditsEarned: UNLIMITED_CREDITS_BALANCE,
        totalCreditsSpent: 0,
        totalCreditsPurchased: 0,
        lastResetAt: new Date().toISOString(),
        nextResetAt: new Date().toISOString(),
        isActive: true,
        isSuspended: false,
        subscriptionTier: workspace.subscriptionTier || 'unlimited',
        unlimitedCredits: true,
        isSubOrg,
        actorWorkspaceId: isSubOrg ? workspaceId : null,
      });
    }

    // Fetch credit account from billing workspace
    let credits = await creditManager.getCreditsAccount(billingWorkspaceId);
    if (!credits) {
      credits = await creditManager.initializeCredits(billingWorkspaceId, workspace.subscriptionTier || 'free');
    }

    const now = new Date();
    let nextReset = credits.nextResetAt ? new Date(credits.nextResetAt) : null;
    if (!nextReset || nextReset.getTime() <= now.getTime()) {
      nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
      creditManager.repairNextResetAt(billingWorkspaceId, nextReset).catch((err) => {
        log.warn('[Credits] Failed to repair nextResetAt', { billingWorkspaceId, error: (err as any)?.message });
      });
    }

    // periodStartingBalance = monthly plan allocation + REMAINING purchased credits this cycle.
    // SSOT fix (Mar 2026): Previously used totalCreditsPurchased (all-time lifetime total) which
    // inflated the denominator by including fully-consumed past purchases, making the usage
    // progress bar appear nearly empty even at high consumption. Now we use purchasedCreditsBalance
    // (the remaining purchased credits balance, reset independently of the monthly cycle) so the
    // denominator correctly reflects: "how many credits are actually available to you right now".
    const purchasedRemaining = (credits as any).purchasedCreditsBalance ?? 0;
    const periodStartingBalance = Math.max(
      (credits.monthlyAllocation ?? 0) + purchasedRemaining,
      1,
    );

    // creditsUsedThisPeriod = sum of all deduction transactions since last_reset_at.
    // This is independent of any admin correction allocations mid-cycle, so it accurately
    // reflects actual AI feature consumption against the plan limit.
    // credit_transactions table dropped (Phase 16)
    let creditsUsedThisPeriod = 0;

    res.json({
      ...credits,
      workspaceId: billingWorkspaceId,
      nextResetAt: nextReset.toISOString(),
      subscriptionTier: workspace.subscriptionTier || 'free',
      creditsUsedThisPeriod,
      periodStartingBalance,
      isSubOrg,
      actorWorkspaceId: isSubOrg ? workspaceId : null,
    });
  } catch (error) {
    log.error('[API] Error fetching credit balance:', error);
    res.status(500).json({ message: 'Failed to fetch credit balance' });
  }
});

router.get('/usage-breakdown', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { workspaceId, error } = await resolveActiveWorkspace(req);
    if (!workspaceId) {
      return res.status(400).json({ error: error || 'No workspace found' });
    }

    // viewAs param allows parent orgs to request billing_owner view explicitly
    const viewAs = (req.query.viewAs as string) === 'billing_owner' ? 'billing_owner' : undefined;

    const { creditManager } = await import('../services/billing/creditManager');
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const breakdown = await creditManager.getMonthlyUsageBreakdown(workspaceId, viewAs);

    res.json(breakdown);
  } catch (error) {
    log.error('[API] Error fetching credit usage breakdown:', error);
    res.status(500).json({ message: 'Failed to fetch usage breakdown' });
  }
});

router.get('/transactions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { workspaceId, error } = await resolveActiveWorkspace(req);
    if (!workspaceId) {
      return res.status(400).json({ error: error || 'No workspace found' });
    }

    // Validate role — must be owner/co-owner to view full transaction history
    const { resolveWorkspaceForUser } = await import('../rbac');
    const { role } = await resolveWorkspaceForUser(userId, workspaceId);
    if (role !== 'org_owner' && role !== 'co_owner') {
      return res.status(403).json({ error: 'Insufficient permissions to view transaction history' });
    }

    // Transactions are stored on the billing workspace — resolve to parent if sub-org
    const { billingWorkspaceId } = await resolveBillingWorkspace(workspaceId);

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const { creditManager } = await import('../services/billing/creditManager');
    const transactions = await creditManager.getTransactionHistory(billingWorkspaceId, limit, offset);

    res.json(transactions);
  } catch (error) {
    log.error('[API] Error fetching credit transactions:', error);
    res.status(500).json({ message: 'Failed to fetch transactions' });
  }
});

router.get('/packs', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // creditPacks table dropped (Phase 16)
    res.json([]);
  } catch (error) {
    log.error('[API] Error fetching credit packs:', error);
    res.status(500).json({ message: 'Failed to fetch credit packs' });
  }
});

router.post('/purchase', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { workspaceId, error } = await resolveActiveWorkspace(req);
    if (!workspaceId) {
      return res.status(400).json({ error: error || 'No workspace found' });
    }

    // Only owner/co-owner of the billing workspace can purchase
    const { billingWorkspaceId } = await resolveBillingWorkspace(workspaceId);
    const { resolveWorkspaceForUser } = await import('../rbac');
    const { role } = await resolveWorkspaceForUser(userId, billingWorkspaceId);
    if (role !== 'org_owner' && role !== 'co_owner') {
      return res.status(403).json({ error: 'Only the organization owner can purchase credits' });
    }

    const { creditPackId, successUrl, cancelUrl } = req.body;
    if (!creditPackId || !successUrl || !cancelUrl) {
      return res.status(400).json({ error: 'Missing required fields: creditPackId, successUrl, cancelUrl' });
    }

    const isValidRedirect = (url: string) => {
      if (url.startsWith('/')) return true;
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
        const devDomain = process.env.APP_BASE_URL;
        if (devDomain && (parsed.hostname === devDomain || parsed.hostname.endsWith(`.${devDomain}`))) return true;
        if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return true;
        if (parsed.hostname.endsWith('.replit.app')) return true;
        return false;
      } catch { return false; }
    };
    if (!isValidRedirect(successUrl) || !isValidRedirect(cancelUrl)) {
      return res.status(400).json({ error: 'Invalid redirect URL' });
    }

    const { creditPurchaseService } = await import('../services/billing/creditPurchase');
    const session = await creditPurchaseService.createCheckoutSession({
      workspaceId: billingWorkspaceId,
      userId,
      creditPackId,
      successUrl,
      cancelUrl,
    });

    res.json(session);
  } catch (error) {
    log.error('[API] Error creating credit purchase session:', error);
    res.status(500).json({ message: 'Failed to create checkout session' });
  }
});

export default router;
