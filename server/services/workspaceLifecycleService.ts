/**
 * workspaceLifecycleService — owns workspace activation/deactivation transitions.
 *
 * Extracted from rbac.ts (Wave 1 architectural cleanup).
 * RBAC enforces permissions; lifecycle service mutates workspace state.
 */
import { db } from '../db';
import { workspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '../lib/logger';

const log = createLogger('WorkspaceLifecycle');

/**
 * Suspend or cancel a workspace subscription.
 * Sets subscriptionStatus to 'suspended' or 'cancelled'.
 */
export async function deactivateWorkspace(
  workspaceId: string,
  status: 'suspended' | 'cancelled' = 'suspended'
): Promise<void> {
  await db
    .update(workspaces)
    .set({ subscriptionStatus: status, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));
  log.info(`[WorkspaceLifecycle] Workspace ${workspaceId} → ${status}`);
}

/**
 * Re-activate a previously suspended workspace.
 * Sets subscriptionStatus back to 'active'.
 */
export async function reactivateWorkspace(workspaceId: string): Promise<void> {
  await db
    .update(workspaces)
    .set({ subscriptionStatus: 'active', updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));
  log.info(`[WorkspaceLifecycle] Workspace ${workspaceId} → active`);
}
