/**
 * billingGateService — resolves billing-based access gates.
 *
 * Extracted from rbac.ts (Wave 1 architectural cleanup).
 * RBAC calls this service to check payment status without embedding
 * billing business logic in the access control layer.
 */
import { db } from '../../db';
import { workspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';

const log = createLogger('BillingGate');

export interface WorkspacePaymentStatus {
  isActive: boolean;
  subscriptionStatus: 'active' | 'trial' | 'suspended' | 'cancelled';
  subscriptionTier: string;
  trialEndsAt: Date | null;
  gracePeriodEndsAt: Date | null;
}

/**
 * Returns the payment/billing access status for a workspace.
 * Used by RBAC middleware to gate API access without embedding
 * billing logic in the permission layer.
 */
export async function getWorkspacePaymentStatus(
  workspaceId: string
): Promise<WorkspacePaymentStatus | null> {
  const [workspace] = await db
    .select({
      subscriptionStatus: workspaces.subscriptionStatus,
      subscriptionTier: workspaces.subscriptionTier,
      trialEndsAt: workspaces.trialEndsAt,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) return null;

  const status = (workspace.subscriptionStatus || 'active') as WorkspacePaymentStatus['subscriptionStatus'];
  const isActive = status === 'active' || status === 'trial';

  log.debug(`[BillingGate] ${workspaceId} → ${status}`);

  return {
    isActive,
    subscriptionStatus: status,
    subscriptionTier: workspace.subscriptionTier || 'starter',
    trialEndsAt: workspace.trialEndsAt ?? null,
    gracePeriodEndsAt: null,
  };
}

/**
 * Quick boolean: is this workspace allowed to use paid features?
 */
export async function isWorkspacePaymentActive(workspaceId: string): Promise<boolean> {
  const status = await getWorkspacePaymentStatus(workspaceId);
  return status?.isActive ?? false;
}
