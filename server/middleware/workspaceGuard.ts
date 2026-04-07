import { db } from '../db';
import { workspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { hasPlatformWideAccess } from '../rbac';

export class WorkspaceNotFoundError extends Error {
  constructor(workspaceId: string) {
    super(`Workspace not found: ${workspaceId}`);
    this.name = 'WorkspaceNotFoundError';
  }
}

export class WorkspaceInactiveError extends Error {
  constructor(workspaceId: string, status: string) {
    super(`Workspace ${workspaceId} is not active (status: ${status})`);
    this.name = 'WorkspaceInactiveError';
  }
}

const INACTIVE_STATUSES = new Set(['suspended', 'cancelled']);

export interface WorkspaceActiveOptions {
  /**
   * Platform role of the actor. If the role has platform-wide access
   * (support_agent, sysop, root_admin, Bot, etc.) the suspension/cancellation
   * check is bypassed so system actors can always operate on any workspace.
   */
  actorPlatformRole?: string;
  /**
   * Explicit bypass for system actors (Trinity Bot, automated pipelines)
   * that operate without a human platform role in context.
   */
  bypassForSystemActor?: boolean;
}

export async function assertWorkspaceActive(
  workspaceId: string,
  options?: WorkspaceActiveOptions,
): Promise<void> {
  if (!workspaceId) return;

  // Platform-wide actors (support agents, bots, sysops) can operate on
  // any workspace regardless of subscription status. This lets support agents
  // diagnose and remediate issues on suspended/cancelled tenants without being
  // locked out, and lets Trinity Bot run autonomous operations on all workspaces.
  if (options?.bypassForSystemActor) return;
  if (hasPlatformWideAccess(options?.actorPlatformRole)) return;

  const [workspace] = await db
    .select({ id: workspaces.id, subscriptionStatus: workspaces.subscriptionStatus })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) {
    throw new WorkspaceNotFoundError(workspaceId);
  }

  if (workspace.subscriptionStatus && INACTIVE_STATUSES.has(workspace.subscriptionStatus)) {
    throw new WorkspaceInactiveError(workspaceId, workspace.subscriptionStatus);
  }
}
