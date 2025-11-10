import { Response, NextFunction, RequestHandler } from 'express';
import { AuthenticatedRequest } from './rbac';
import { db } from './db';
import { workspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';

export type SubscriptionTier = 'free' | 'starter' | 'professional' | 'enterprise';

export const tierHierarchy: Record<SubscriptionTier, number> = {
  enterprise: 4,
  professional: 3,
  starter: 2,
  free: 1,
};

/**
 * Middleware factory to require minimum subscription tier for route access
 * Usage: app.get('/api/payroll', requireAuth, requireManager, requirePlan('professional'), handler)
 */
export function requirePlan(minimumTier: SubscriptionTier): RequestHandler {
  const middleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.workspaceId) {
      return res.status(400).json({ 
        error: 'Workspace ID required',
        requiresTierUpgrade: true,
        minimumTier,
      });
    }

    // Fetch workspace subscription tier
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, req.workspaceId),
      columns: {
        subscriptionTier: true,
        subscriptionStatus: true,
      },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Check subscription status
    if (workspace.subscriptionStatus !== 'active') {
      return res.status(402).json({ 
        error: 'Subscription inactive',
        subscriptionStatus: workspace.subscriptionStatus,
        requiresReactivation: true,
      });
    }

    // Validate tier access
    const currentTier = (workspace.subscriptionTier || 'free') as SubscriptionTier;
    const currentLevel = tierHierarchy[currentTier];
    const requiredLevel = tierHierarchy[minimumTier];

    if (currentLevel < requiredLevel) {
      return res.status(402).json({ 
        error: `This feature requires ${minimumTier} plan or higher`,
        currentTier,
        minimumTier,
        requiresTierUpgrade: true,
      });
    }

    // Attach tier to request for downstream usage
    (req as any).subscriptionTier = currentTier;
    next();
  };
  
  return middleware as unknown as RequestHandler;
}

// Convenience guards for common tier requirements
export const requireStarter = requirePlan('starter');
export const requireProfessional = requirePlan('professional');
export const requireEnterprise = requirePlan('enterprise');

/**
 * Helper to check tier access programmatically (non-middleware)
 */
export function hasTierAccess(
  currentTier: SubscriptionTier,
  requiredTier: SubscriptionTier
): boolean {
  const currentLevel = tierHierarchy[currentTier];
  const requiredLevel = tierHierarchy[requiredTier];
  return currentLevel >= requiredLevel;
}

/**
 * Get workspace tier for a given workspace ID
 */
export async function getWorkspaceTier(workspaceId: string): Promise<SubscriptionTier> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: {
      subscriptionTier: true,
    },
  });

  return (workspace?.subscriptionTier || 'free') as SubscriptionTier;
}
