/**
 * BILLING ENFORCEMENT MIDDLEWARE
 * ================================
 * Wires billingTiersRegistry into Express route middleware.
 * Single canonical path for all billing enforcement decisions.
 *
 * Usage in routes:
 *   router.post('/some-feature', requireBillingFeature('advanced_analytics'), handler)
 *   router.post('/payroll/run', requireBillingTier('professional'), handler)
 *   router.post('/client-portal', enforceClientPortalSeats, handler)
 *
 * Rules:
 *   - NEVER_THROTTLE_ACTIONS always pass (payroll, calloffs, scheduling, invoicing)
 *   - Token usage is metered but never blocks core ops
 *   - Feature gates return 402 with upgrade URL on denial
 *   - Statewide has permanent founder exemption at enterprise tier
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AuthenticatedRequest } from '../rbac';
import {
  evaluateBillingFeatureGate,
  evaluateClientPortalSeatPolicy,
  evaluateTokenUsagePolicy,
  isNeverThrottleAction,
  getBillingTierSnapshot,
  normalizeBillingTier,
  type BillingTierKey,
} from '../services/billing/billingTiersRegistry';
import { getWorkspaceTier } from '../tierGuards';
import { createLogger } from '../lib/logger';

const log = createLogger('billingEnforcementMiddleware');

// ─── Feature Gate Middleware ──────────────────────────────────────────────────

/**
 * Require a specific billing feature to be available on the workspace tier.
 * Returns 402 with upgrade info if the feature is not available.
 *
 * @example
 *   router.get('/analytics/advanced', requireBillingFeature('advanced_analytics'), handler)
 */
export function requireBillingFeature(featureKey: string): RequestHandler {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.workspaceId || (req.user as any)?.workspaceId;
      if (!workspaceId) return next(); // No workspace context — let route handle auth

      const tier = await getWorkspaceTier(workspaceId);
      const activeAddons: string[] = (req as any).activeAddons || [];

      const result = evaluateBillingFeatureGate({ tier, featureKey, activeAddons });

      if (!result.allowed) {
        return res.status(402).json({
          error: 'Feature not available on your current plan',
          code: result.decision === 'addon_required' ? 'ADDON_REQUIRED' : 'TIER_REQUIRED',
          feature: featureKey,
          currentTier: result.tier,
          requiredTier: result.requiredTier,
          requiredAddon: result.requiredAddon,
          reason: result.reason,
          upgradeUrl: `/billing/upgrade?feature=${featureKey}&from=${result.tier}`,
        });
      }

      next();
    } catch (err: unknown) {
      log.warn('[BillingGate] Feature gate check failed (non-blocking):', (err as Error).message);
      next(); // Fail open — don't block users on billing check errors
    }
  };
}

// ─── Tier Requirement Middleware ──────────────────────────────────────────────

/**
 * Require workspace to be on a specific tier or higher.
 *
 * @example
 *   router.post('/payroll/run', requireBillingTier('professional'), handler)
 */
export function requireBillingTier(minimumTier: BillingTierKey): RequestHandler {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.workspaceId || (req.user as any)?.workspaceId;
      if (!workspaceId) return next();

      const tier = normalizeBillingTier(await getWorkspaceTier(workspaceId));
      const { hasTierAccess } = await import('../tierGuards');

      if (!hasTierAccess(tier, minimumTier)) {
        return res.status(402).json({
          error: `This feature requires the ${minimumTier} plan or higher`,
          code: 'TIER_REQUIRED',
          currentTier: tier,
          minimumTier,
          requiresTierUpgrade: true,
          upgradeUrl: `/billing/upgrade?from=${tier}&to=${minimumTier}`,
        });
      }

      next();
    } catch (err: unknown) {
      log.warn('[BillingGate] Tier check failed (non-blocking):', (err as Error).message);
      next(); // Fail open
    }
  };
}

// ─── Client Portal Seat Enforcement ──────────────────────────────────────────

/**
 * Enforce client portal seat limits before provisioning a new client portal login.
 * Reads current seat count from the workspace and compares to tier limit.
 *
 * @example
 *   router.post('/client-portal/invite', enforceClientPortalSeats, handler)
 */
export const enforceClientPortalSeats: RequestHandler = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const workspaceId = req.workspaceId || (req.user as any)?.workspaceId;
    if (!workspaceId) return next();

    const tier = await getWorkspaceTier(workspaceId);
    // currentClientPortalSeats should be passed from route context or fetched
    const currentSeats = (req as any).currentClientPortalSeats ?? 0;

    const result = evaluateClientPortalSeatPolicy({
      tier,
      currentClientPortalSeats: currentSeats,
      seatsToAdd: 1,
    });

    if (!result.allowed) {
      return res.status(402).json({
        error: result.reason || 'Client portal seat limit reached for your plan',
        code: 'SEAT_LIMIT_REACHED',
        currentTier: result.tier,
        seatLimit: result.seatLimit,
        currentSeats: result.currentClientPortalSeats,
        requiredTier: result.requiredTier,
        upgradeUrl: `/billing/upgrade?feature=client_portal&from=${result.tier}`,
      });
    }

    next();
  } catch (err: unknown) {
    log.warn('[BillingGate] Client portal seat check failed (non-blocking):', (err as Error).message);
    next(); // Fail open
  }
};

// ─── Token Usage Policy ───────────────────────────────────────────────────────

/**
 * Soft token gate — checks if workspace has tokens available.
 * Core ops (payroll, calloffs, scheduling, invoicing) ALWAYS pass through.
 * At 100% usage non-core AI features are soft-blocked.
 *
 * @example
 *   router.post('/trinity/analyze', enforceTokenPolicy('trinity.analyze'), handler)
 */
export function enforceTokenPolicy(actionId: string): RequestHandler {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Core ops are never throttled regardless of token state
      if (isNeverThrottleAction(actionId)) return next();

      const workspaceId = req.workspaceId || (req.user as any)?.workspaceId;
      if (!workspaceId) return next();

      const tier = await getWorkspaceTier(workspaceId);
      const usedTokensBefore = (req as any).workspaceTokensUsed ?? 0;

      const result = evaluateTokenUsagePolicy({
        workspaceId,
        tier,
        actionId,
        usedTokensBefore,
        additionalTokens: 1000, // estimate — actual metering happens in service
        userId: req.user?.id,
      });

      if (!result.allowed) {
        return res.status(429).json({
          error: result.reason || 'Token allowance exceeded for this billing period',
          code: 'TOKEN_LIMIT_EXCEEDED',
          currentTier: result.tier,
          usagePercent: result.usagePercent,
          autoRefillEnabled: result.autoRefillEnabled,
          upgradeUrl: `/billing/upgrade?reason=tokens&from=${result.tier}`,
        });
      }

      // Attach warning level for Trinity to surface proactive messages
      if (result.warningLevel && result.warningLevel !== 'none') {
        (req as any).tokenWarningLevel = result.warningLevel;
        (req as any).tokenUsagePercent = result.usagePercent;
      }

      next();
    } catch (err: unknown) {
      log.warn('[BillingGate] Token policy check failed (non-blocking):', (err as Error).message);
      next(); // Fail open — never block on metering errors
    }
  };
}

// ─── Tier Snapshot Attachment ─────────────────────────────────────────────────

/**
 * Attach billing tier snapshot to request for downstream use.
 * Use as early middleware on routes that need tier context.
 *
 * @example
 *   router.use(attachBillingContext)
 */
export const attachBillingContext: RequestHandler = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const workspaceId = req.workspaceId || (req.user as any)?.workspaceId;
    if (!workspaceId) return next();

    const tier = await getWorkspaceTier(workspaceId);
    const snapshot = getBillingTierSnapshot(tier);
    (req as any).billingTier = tier;
    (req as any).billingSnapshot = snapshot;

    next();
  } catch (err: unknown) {
    next(); // Non-blocking
  }
};
