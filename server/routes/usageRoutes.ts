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
 * Priority: req.user?.currentWorkspaceId (session-bound) → req.workspaceId (middleware) → resolveWorkspaceForUser
 * This enforces session isolation so multi-workspace users see the correct org's data.
 */
async function resolveActiveWorkspace(req: AuthenticatedRequest): Promise<{ workspaceId: string | null; error?: string }> {
  const userId = req.user?.id;
  if (!userId) return { workspaceId: null, error: 'Unauthorized' };

  // 1. Workspace set by middleware (ensureWorkspaceAccess) — highest priority
  const middlewareWsId = req.workspaceId || req.user?.workspaceId;
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

// GET /api/usage/tokens — canonical token usage endpoint.
// Legacy aliases (/balance, also GET /api/credits/balance via route mount)
// return the same token-native payload.
router.get(['/tokens', '/balance'], requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { workspaceId, error } = await resolveActiveWorkspace(req);
    if (!workspaceId) {
      return res.status(400).json({ error: error || 'No workspace found' });
    }

    const { billingWorkspaceId, isSubOrg } = await resolveBillingWorkspace(workspaceId);

    const [workspace] = await db.select().from(workspaces)
      .where(eq(workspaces.id, billingWorkspaceId)).limit(1);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const tier = (workspace.subscriptionTier || 'free').toLowerCase();
    const allowance = getTokenAllowance(tier);
    const isUnlimited = allowance === null || !!(workspace as any).founderExemption;
    const nextReset = getNextMonthStart();
    const tokenSummary = await getMonthlyTokenSummary(billingWorkspaceId, tier);

    if (isUnlimited) {
      return res.json({
        workspaceId: billingWorkspaceId,
        tokensUsed: tokenSummary.totalTokensUsed,
        tokensAllowance: null,
        overageTokens: 0,
        overageAmountCents: 0,
        unlimited: true,
        subscriptionTier: tier,
        periodEnd: nextReset.toISOString(),
        isSubOrg,
        actorWorkspaceId: isSubOrg ? workspaceId : null,
      });
    }

    res.json({
      workspaceId: billingWorkspaceId,
      tokensUsed: tokenSummary.totalTokensUsed,
      tokensAllowance: allowance,
      overageTokens: tokenSummary.overageTokens,
      overageAmountCents: tokenSummary.overageAmountCents,
      overageRateCentsPer100k: TOKEN_OVERAGE_RATE_CENTS_PER_100K,
      unlimited: false,
      subscriptionTier: tier,
      periodEnd: nextReset.toISOString(),
      isSubOrg,
      actorWorkspaceId: isSubOrg ? workspaceId : null,
    });
  } catch (error) {
    log.error('[API] Error fetching token balance:', error);
    res.status(500).json({ message: 'Failed to fetch token balance' });
  }
});

// GET /api/usage/token-breakdown — per-feature monthly usage (legacy alias: /usage-breakdown).
router.get(['/token-breakdown', '/usage-breakdown'], requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { workspaceId, error } = await resolveActiveWorkspace(req);
    if (!workspaceId) {
      return res.status(400).json({ error: error || 'No workspace found' });
    }

    const { billingWorkspaceId } = await resolveBillingWorkspace(workspaceId);
    const monthYear = getCurrentMonthYear();

    const result = await pool.query(
      `SELECT action_type AS "featureKey",
              action_type AS "featureName",
              COALESCE(SUM(tokens_total), 0)::bigint AS "tokensUsed",
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
      tokensUsed: Number(r.tokensUsed),
      operationCount: Number(r.operationCount),
    })));
  } catch (error) {
    log.error('[API] Error fetching token usage breakdown:', error);
    res.status(500).json({ message: 'Failed to fetch usage breakdown' });
  }
});

// GET /api/usage/token-log — per-entry token usage history (legacy alias: /transactions).
router.get(['/token-log', '/transactions'], requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { workspaceId, error } = await resolveActiveWorkspace(req);
    if (!workspaceId) {
      return res.status(400).json({ error: error || 'No workspace found' });
    }

    const { resolveWorkspaceForUser } = await import('../rbac');
    const { role } = await resolveWorkspaceForUser(userId, workspaceId);
    if (role !== 'org_owner' && role !== 'co_owner') {
      return res.status(403).json({ error: 'Insufficient permissions to view usage history' });
    }

    const { billingWorkspaceId } = await resolveBillingWorkspace(workspaceId);

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await pool.query(
      `SELECT id,
              workspace_id AS "workspaceId",
              user_id AS "userId",
              action_type AS "actionType",
              tokens_total AS "tokensUsed",
              action_type AS "featureKey",
              feature_name AS "featureName",
              model_used AS "modelUsed",
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
      actionType: r.actionType,
      tokensUsed: Number(r.tokensUsed),
      featureKey: r.featureKey,
      featureName: r.featureName,
      modelUsed: r.modelUsed,
      createdAt: r.createdAt,
    })));
  } catch (error) {
    log.error('[API] Error fetching token usage history:', error);
    res.status(500).json({ message: 'Failed to fetch token log' });
  }
});

// /packs and /purchase removed — CoAIleague does not sell credits. Token
// overages are billed automatically on the monthly invoice.
// Legacy UI calls return 410 Gone with a clear deprecation message.
router.get('/packs', requireAuth, async (_req: AuthenticatedRequest, res) => {
  res.status(410).json({
    error: 'Credit packs are no longer sold. AI usage is billed as token overage on the monthly invoice.',
    migration: 'Use /api/usage/tokens for current monthly token usage.',
    packs: [],
  });
});

router.post('/purchase', requireAuth, async (_req: AuthenticatedRequest, res) => {
  res.status(410).json({
    error: 'Credit purchase is retired. AI usage is billed as monthly token overage.',
    migration: 'Use /api/usage/tokens for current monthly token usage.',
  });
});

export default router;
