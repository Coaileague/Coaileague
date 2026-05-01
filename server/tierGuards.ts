import { Response, NextFunction, RequestHandler } from 'express';
import { AuthenticatedRequest } from './rbac';
import { cacheManager } from './services/platform/cacheManager';
import { universalAudit } from './services/universalAuditService';
import { GRANDFATHERED_TENANT_ID } from './lib/tiers/tierDefinitions';
import { getUpgradeUrl } from './lib/tiers/tierDefinitions';
import { PLATFORM_WORKSPACE_ID } from './services/billing/billingConstants';

export type SubscriptionTier = 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic';

export const tierHierarchy: Record<SubscriptionTier, number> = {
  strategic:    7,
  enterprise:   6,
  business:     5,
  professional: 4,
  starter:      3,
  trial:        2,
  free:         1,
};

/**
 * Middleware factory to require minimum subscription tier for route access.
 * Usage: router.get('/api/payroll', requireAuth, requireManager, requirePlan('professional'), handler)
 *
 * Response contract (Phase 30):
 *   403 { error: 'TIER_UPGRADE_REQUIRED', currentTier, requiredTier, upgradeUrl }
 *
 * Special cases:
 *   - Statewide Protective Services (STATEWIDE_WS_ID): permanently exempt — always passes.
 *   - Inactive subscription: 402 { error: 'SUBSCRIPTION_INACTIVE' }
 *
 * Uses cacheManager for optimized tier lookups (10-min TTL).
 * All failed checks are written to universalAuditTrail (non-blocking).
 */
export function requirePlan(minimumTier: SubscriptionTier): RequestHandler {
  const middleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.workspaceId) {
      return res.status(400).json({ 
        error: 'WORKSPACE_REQUIRED',
        message: 'Workspace context is required to access this resource.',
      });
    }

    // ── FOUNDER EXEMPTION — Grandfathered Tenant ─────────────────────────────
    // Permanently exempt from all tier checks — passes every gate unconditionally.
    // This override cannot be removed by any subscription change, cron, or downgrade.
    if (GRANDFATHERED_TENANT_ID && req.workspaceId === GRANDFATHERED_TENANT_ID) {
      req.subscriptionTier = 'enterprise';
      return next();
    }

    // ── PLATFORM WORKSPACE EXEMPTION — CoAIleague internal support org ────────
    // The platform's own support/ops workspace is always treated as enterprise.
    if (PLATFORM_WORKSPACE_ID && req.workspaceId === PLATFORM_WORKSPACE_ID) {
      req.subscriptionTier = 'enterprise';
      return next();
    }

    // ── Cached tier lookup ────────────────────────────────────────────────────
    const tierInfo = await cacheManager.getWorkspaceTierWithStatus(req.workspaceId);

    if (!tierInfo) {
      return res.status(404).json({ error: 'WORKSPACE_NOT_FOUND' });
    }

    // ── Inactive subscription ─────────────────────────────────────────────────
    if (tierInfo.status !== 'active') {
      return res.status(402).json({ 
        error: 'SUBSCRIPTION_INACTIVE',
        subscriptionStatus: tierInfo.status,
        requiresReactivation: true,
        message: 'Your subscription is not active. Please update your billing to continue.',
      });
    }

    // ── Tier level check ──────────────────────────────────────────────────────
    const currentTier = tierInfo.tier as SubscriptionTier;
    const currentLevel = tierHierarchy[currentTier] ?? 0;
    const requiredLevel = tierHierarchy[minimumTier];

    if (currentLevel < requiredLevel) {
      // Non-blocking violation log
      universalAudit.log({
        workspaceId: req.workspaceId,
        actorId: req.user?.id ?? null,
        actorType: 'user',
        action: 'tier.violation',
        entityType: 'workspace',
        entityId: req.workspaceId,
        changeType: 'read',
        metadata: {
          currentTier,
          requiredTier: minimumTier,
          route: req.path,
          method: req.method,
          userId: req.user?.id,
        },
        sourceRoute: req.path,
      }).catch((auditErr: unknown) => {
        log.warn('[TierGuard] Failed to write tier.violation audit log (non-blocking)', {
          workspaceId: req.workspaceId,
          currentTier,
          requiredTier: minimumTier,
          route: req.path,
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
        });
      });

      return res.status(403).json({ 
        error: 'TIER_UPGRADE_REQUIRED',
        currentTier,
        requiredTier: minimumTier,
        upgradeUrl: getUpgradeUrl(minimumTier),
        message: `This feature requires the ${minimumTier} plan or higher. You are currently on the ${currentTier} plan.`,
      });
    }

    // Attach tier to request for downstream use
    req.subscriptionTier = currentTier;
    next();
  };
  
  return middleware as unknown as RequestHandler;
}

// ── Convenience guards ─────────────────────────────────────────────────────────

export const requireStarter      = requirePlan('starter');
export const requireProfessional = requirePlan('professional');
export const requireBusiness     = requirePlan('business');
export const requireEnterprise   = requirePlan('enterprise');

/**
 * checkTierAccess — alias for requirePlan, preferred naming per Phase 30 spec.
 * Usage: router.get('/api/feature', requireAuth, checkTierAccess('business'), handler)
 */
export const checkTierAccess = requirePlan;

/**
 * hasTierAccess — programmatic (non-middleware) tier check.
 */
export function hasTierAccess(
  currentTier: SubscriptionTier,
  requiredTier: SubscriptionTier
): boolean {
  const currentLevel = tierHierarchy[currentTier] ?? 0;
  const requiredLevel = tierHierarchy[requiredTier] ?? 0;
  return currentLevel >= requiredLevel;
}

/**
 * getWorkspaceTier — get workspace tier from cache (non-middleware helper).
 */
export async function getWorkspaceTier(workspaceId: string): Promise<SubscriptionTier> {
  // Grandfathered founding tenant always has enterprise access
  if (GRANDFATHERED_TENANT_ID && workspaceId === GRANDFATHERED_TENANT_ID) return 'enterprise';
  // Platform support org always has enterprise access
  if (PLATFORM_WORKSPACE_ID && workspaceId === PLATFORM_WORKSPACE_ID) return 'enterprise';
  const tier = await cacheManager.getWorkspaceTier(workspaceId);
  return tier as SubscriptionTier;
}
