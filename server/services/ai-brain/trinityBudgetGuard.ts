/**
 * TRINITY BUDGET GUARD
 * =====================
 * Reads the tenant's current token balance against their monthly soft cap
 * and tells the triad how to self-regulate model tier selection.
 *
 * Conservative mode kicks in at >90% cap utilization:
 *   - Forces agents to low/medium tiers only
 *   - Blocks tier upgrades even for high-complexity requests
 *   - Still answers — no interruption — but economically
 *
 * Overages are always enabled (platform never stops Trinity mid-conversation).
 * Cost goes against the tenant's next monthly invoice.
 */

import { tokenManager } from '../billing/tokenManager';
import { isFreeForTrinity } from '../billing/trinityTokenMeteringService';
import { createLogger } from '../../lib/logger';

const log = createLogger('TrinityBudgetGuard');

export interface TrinityBudget {
  remaining: number;         // tokens left before overage
  monthlyAllocation: number; // total monthly token pool
  totalUsed: number;         // tokens consumed this period
  softCapPercent: number;    // 0–100, e.g. 87 = 87% used
  overageEnabled: true;      // always true — no hard stop
  isConservative: boolean;   // true when >90% cap used
  isFree: boolean;           // platform/grandfathered workspaces
  maxTierOverride: 'low' | 'medium' | 'high' | null; // null = no override
}

const CONSERVATIVE_THRESHOLD = 0.90; // 90% of soft cap
const CACHE_TTL_MS = 15_000; // 15s cache — budget changes slowly

interface CachedBudget {
  budget: TrinityBudget;
  expiresAt: number;
}

const budgetCache = new Map<string, CachedBudget>();

export async function getTriniityBudget(workspaceId: string): Promise<TrinityBudget> {
  const cached = budgetCache.get(workspaceId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.budget;
  }

  const isFree = isFreeForTrinity(workspaceId);

  if (isFree) {
    const budget: TrinityBudget = {
      remaining: Number.MAX_SAFE_INTEGER,
      monthlyAllocation: Number.MAX_SAFE_INTEGER,
      totalUsed: 0,
      softCapPercent: 0,
      overageEnabled: true,
      isConservative: false,
      isFree: true,
      maxTierOverride: null,
    };
    budgetCache.set(workspaceId, { budget, expiresAt: Date.now() + CACHE_TTL_MS });
    return budget;
  }

  try {
    const state = await tokenManager.getWorkspaceState(workspaceId);

    if (!state) {
      // Can't read budget — default to non-conservative so Trinity still answers
      const fallback: TrinityBudget = {
        remaining: 1000,
        monthlyAllocation: 1000,
        totalUsed: 0,
        softCapPercent: 0,
        overageEnabled: true,
        isConservative: false,
        isFree: false,
        maxTierOverride: null,
      };
      return fallback;
    }

    const softCapPercent = state.monthlyAllocation > 0
      ? Math.min(100, (state.totalTokensUsed / state.monthlyAllocation) * 100)
      : 0;
    const isConservative = softCapPercent >= CONSERVATIVE_THRESHOLD * 100;

    const budget: TrinityBudget = {
      remaining: Math.max(0, state.currentBalance),
      monthlyAllocation: state.monthlyAllocation,
      totalUsed: state.totalTokensUsed,
      softCapPercent: Math.round(softCapPercent * 10) / 10,
      overageEnabled: true,
      isConservative,
      isFree: false,
      maxTierOverride: isConservative ? 'medium' : null,
    };

    budgetCache.set(workspaceId, { budget, expiresAt: Date.now() + CACHE_TTL_MS });

    if (isConservative) {
      log.info(`[BudgetGuard] workspace=${workspaceId} at ${softCapPercent.toFixed(1)}% cap — conservative mode active`);
    }

    return budget;
  } catch (err) {
    log.warn('[BudgetGuard] Failed to read budget, defaulting to non-conservative:', (err as Error).message);
    return {
      remaining: 1000,
      monthlyAllocation: 1000,
      totalUsed: 0,
      softCapPercent: 0,
      overageEnabled: true,
      isConservative: false,
      isFree: false,
      maxTierOverride: null,
    };
  }
}

/**
 * Apply budget constraints to the requested tier.
 * Conservative mode caps at 'medium'; free workspaces always get the full tier.
 */
export function applyBudgetConstraint(
  requestedTier: 'low' | 'medium' | 'high',
  budget: TrinityBudget,
): 'low' | 'medium' | 'high' {
  if (!budget.maxTierOverride) return requestedTier;
  const tierRank = { low: 0, medium: 1, high: 2 } as const;
  const maxRank = tierRank[budget.maxTierOverride];
  const requested = tierRank[requestedTier];
  return requested <= maxRank ? requestedTier : budget.maxTierOverride;
}

export function invalidateBudgetCache(workspaceId: string): void {
  budgetCache.delete(workspaceId);
}
