import { Router } from "express";
import { db, pool } from "../db";
import { workspaces } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../rbac";
import { createLogger } from '../lib/logger';
import { TOKEN_ALLOWANCES, TOKEN_OVERAGE_RATE_CENTS_PER_100K } from '../../shared/billingConfig';
const log = createLogger('CreditRoutes');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — token-based balance derived from token_usage_monthly
// ─────────────────────────────────────────────────────────────────────────────

function getCurrentMonthYear(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getNextMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function getTokenAllowance(tier: string): number | null {
  return (TOKEN_ALLOWANCES as Record<string, number | null>)[tier.toLowerCase()] ?? TOKEN_ALLOWANCES['trial'] ?? 5_000_000;
}

interface TokenSummary {
  totalTokensUsed: number;
  allowanceTokens: number | null;
  overageTokens: number;
  overageAmountCents: number;
  isUnlimited: boolean;
}

async function getMonthlyTokenSummary(workspaceId: string, tier: string): Promise<TokenSummary> {
  const monthYear = getCurrentMonthYear();
  const allowance = getTokenAllowance(tier);
  try {
    const result = await pool.query(
      `SELECT total_tokens_used, allowance_tokens, overage_tokens, overage_amount_cents
       FROM token_usage_monthly
       WHERE workspace_id = $1 AND month_year = $2`,
      [workspaceId, monthYear],
    );
    const row = result.rows[0];
    const totalTokensUsed = Number(row?.total_tokens_used ?? 0);
    const overageTokens = Number(row?.overage_tokens ?? 0);
    const overageAmountCents = Number(row?.overage_amount_cents ?? 0);
    return {
      totalTokensUsed,
      allowanceTokens: allowance,
      overageTokens,
      overageAmountCents,
      isUnlimited: allowance === null,
    };
  } catch {
    return { totalTokensUsed: 0, allowanceTokens: allowance, overageTokens: 0, overageAmountCents: 0, isUnlimited: allowance === null };
  }
}


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

    const tier = (workspace.subscriptionTier || 'free').toLowerCase();
    const allowance = getTokenAllowance(tier);
    const isUnlimited = allowance === null || !!(workspace as any).founderExemption;

    const nextReset = getNextMonthStart();

    // Short-circuit for unlimited tiers (strategic/grandfathered/founderExemption)
    if (isUnlimited) {
      const tokenSummary = await getMonthlyTokenSummary(billingWorkspaceId, tier);
      return res.json({
        id: 'unlimited',
        workspaceId: billingWorkspaceId,
        // Token fields (authoritative)
        tokensUsed: tokenSummary.totalTokensUsed,
        tokensAllowance: null,
        overageTokens: 0,
        overageAmountCents: 0,
        // Legacy-compat shape (used by existing UI)
        currentBalance: 0,
        monthlyAllocation: -1,
        totalCreditsEarned: 0,
        totalCreditsSpent: tokenSummary.totalTokensUsed,
        totalCreditsPurchased: 0,
        creditsUsedThisPeriod: tokenSummary.totalTokensUsed,
        periodStartingBalance: 1,
        lastResetAt: new Date().toISOString(),
        nextResetAt: nextReset.toISOString(),
        isActive: true,
        isSuspended: false,
        subscriptionTier: tier,
        unlimitedCredits: true,
        isSubOrg,
        actorWorkspaceId: isSubOrg ? workspaceId : null,
      });
    }

    // Token-based balance from token_usage_monthly
    const tokenSummary = await getMonthlyTokenSummary(billingWorkspaceId, tier);
    const remaining = Math.max(0, (allowance ?? 0) - tokenSummary.totalTokensUsed);

    res.json({
      id: billingWorkspaceId,
      workspaceId: billingWorkspaceId,
      // Token fields (authoritative)
      tokensUsed: tokenSummary.totalTokensUsed,
      tokensAllowance: allowance,
      overageTokens: tokenSummary.overageTokens,
      overageAmountCents: tokenSummary.overageAmountCents,
      overageRateCentsPer100k: TOKEN_OVERAGE_RATE_CENTS_PER_100K,
      // Legacy-compat shape (used by existing UI)
      currentBalance: remaining,
      monthlyAllocation: allowance ?? 0,
      totalCreditsEarned: allowance ?? 0,
      totalCreditsSpent: tokenSummary.totalTokensUsed,
      totalCreditsPurchased: 0,
      creditsUsedThisPeriod: tokenSummary.totalTokensUsed,
      periodStartingBalance: allowance ?? 0,
      lastResetAt: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString(),
      nextResetAt: nextReset.toISOString(),
      isActive: true,
      isSuspended: false,
      subscriptionTier: tier,
      unlimitedCredits: false,
      isSubOrg,
      actorWorkspaceId: isSubOrg ? workspaceId : null,
    });
  } catch (error) {
    log.error('[API] Error fetching token balance:', error);
    res.status(500).json({ message: 'Failed to fetch token balance' });
  }
});

router.get('/usage-breakdown', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { workspaceId, error } = await resolveActiveWorkspace(req);
    if (!workspaceId) {
      return res.status(400).json({ error: error || 'No workspace found' });
    }

    const { billingWorkspaceId } = await resolveBillingWorkspace(workspaceId);
    const monthYear = getCurrentMonthYear();

    // Return per-action token usage from token_usage_log for the current month
    const result = await pool.query(
      `SELECT action_type AS "featureKey",
              action_type AS "featureName",
              COALESCE(SUM(tokens_total), 0)::bigint AS "totalCredits",
              COUNT(*)::int AS "operationCount"
       FROM token_usage_log
       WHERE workspace_id = $1
         AND TO_CHAR(timestamp AT TIME ZONE 'UTC', 'YYYY-MM') = $2
       GROUP BY action_type
       ORDER BY SUM(tokens_total) DESC`,
      [billingWorkspaceId, monthYear],
    );

    res.json(result.rows.map((r: any) => ({
      featureKey: r.featureKey,
      featureName: r.featureName,
      totalCredits: Number(r.totalCredits),
      operationCount: Number(r.operationCount),
    })));
  } catch (error) {
    log.error('[API] Error fetching token usage breakdown:', error);
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

    // Validate role — must be owner/co-owner to view full token history
    const { resolveWorkspaceForUser } = await import('../rbac');
    const { role } = await resolveWorkspaceForUser(userId, workspaceId);
    if (role !== 'org_owner' && role !== 'co_owner') {
      return res.status(403).json({ error: 'Insufficient permissions to view usage history' });
    }

    const { billingWorkspaceId } = await resolveBillingWorkspace(workspaceId);

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    // Return token usage log entries as "transactions"
    const result = await pool.query(
      `SELECT id,
              workspace_id AS "workspaceId",
              user_id AS "userId",
              action_type AS "transactionType",
              tokens_total AS "amount",
              0 AS "balanceAfter",
              action_type AS "featureKey",
              feature_name AS "featureName",
              model_used AS "description",
              timestamp AS "createdAt"
       FROM token_usage_log
       WHERE workspace_id = $1
       ORDER BY timestamp DESC
       LIMIT $2 OFFSET $3`,
      [billingWorkspaceId, limit, offset],
    );

    res.json(result.rows.map((r: any) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      userId: r.userId,
      transactionType: r.transactionType,
      amount: Number(r.amount),
      balanceAfter: 0,
      featureKey: r.featureKey,
      featureName: r.featureName,
      description: r.description,
      createdAt: r.createdAt,
    })));
  } catch (error) {
    log.error('[API] Error fetching token usage history:', error);
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
