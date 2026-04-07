/**
 * Shared permission mutation helpers
 * ===================================
 * Extracted from permissionMatrixRoutes to break the circular dependency:
 *   services/rbac/permissionManagementActions → routes/permissionMatrixRoutes (VIOLATION)
 *
 * Both the routes layer and the services layer import from here.
 */
import { db } from '../../db';
import { workspacePermissions } from '@shared/schema';
import { and, eq } from 'drizzle-orm';

export async function upsertPermission(
  workspaceId: string,
  role: string,
  featureKey: string,
  enabled: boolean,
  updatedBy: string | null,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(workspacePermissions)
    .where(
      and(
        eq(workspacePermissions.workspaceId, workspaceId),
        eq(workspacePermissions.role, role),
        eq(workspacePermissions.featureKey, featureKey),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(workspacePermissions)
      .set({ enabled, updatedBy, updatedAt: new Date() })
      .where(eq(workspacePermissions.id, existing.id));
  } else {
    await db.insert(workspacePermissions).values({ workspaceId, role, featureKey, enabled, updatedBy });
  }
}

export async function deletePermission(
  workspaceId: string,
  role: string,
  featureKey: string,
): Promise<void> {
  await db
    .delete(workspacePermissions)
    .where(
      and(
        eq(workspacePermissions.workspaceId, workspaceId),
        eq(workspacePermissions.role, role),
        eq(workspacePermissions.featureKey, featureKey),
      ),
    );
}
