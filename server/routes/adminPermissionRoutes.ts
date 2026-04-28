/**
 * Admin Permission Routes — Phase 9B Platform-Wide Expansion
 * ===========================================================
 * Platform-wide permission management for support agents, platform admins, and
 * system bots. All endpoints require requirePlatformStaff.
 *
 * GET  /api/admin/permissions/workspaces               — search/list all orgs
 * GET  /api/admin/permissions/workspaces/:wsId/matrix  — get full matrix for any org
 * PATCH /api/admin/permissions/workspaces/:wsId/matrix — toggle role+feature for any org (support_manager+)
 * DELETE /api/admin/permissions/workspaces/:wsId/matrix — reset to default for any org (support_manager+)
 * GET  /api/admin/permissions/workspaces/:wsId/users   — search users in org
 * PATCH /api/admin/permissions/workspaces/:wsId/users/:userId/role — change a user's workspace role
 * GET  /api/admin/permissions/meta                     — feature registry + matrix roles
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { workspacePermissions, workspaces, employees } from '@shared/schema';
import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { requirePlatformStaff, requireSupportManager } from '../rbac';
import { broadcastToWorkspace } from '../websocket';
import { resolveEffectivePermissions } from '../middleware/workspacePermissions';
import { FEATURE_REGISTRY, MATRIX_ROLES } from '../lib/rbac/featureRegistry';
import { upsertPermission, deletePermission } from './permissionMatrixRoutes';
import { universalAudit } from '../services/universalAuditService';
import type { AuthenticatedRequest } from '../rbac';
import { createLogger } from '../lib/logger';
const log = createLogger('AdminPermissionRoutes');


const router = Router();

const matrixUpdateSchema = z.object({
  role: z.string().min(1),
  featureKey: z.string().min(1),
  enabled: z.boolean(),
});

const matrixResetSchema = matrixUpdateSchema.omit({ enabled: true });

const userRoleUpdateSchema = z.object({
  workspaceRole: z.string().min(1),
  reason: z.string().optional(),
});

// ── GET /api/admin/permissions/meta ─────────────────────────────────────────
router.get('/meta', async (_req, res) => {
  return res.json({ features: FEATURE_REGISTRY, roles: MATRIX_ROLES });
});

// ── GET /api/admin/permissions/workspaces ────────────────────────────────────
// Search/list all workspaces (org picker for the universal editor).
router.get('/workspaces', requirePlatformStaff, async (req, res) => {
  const { search = '', limit = 50, offset = 0 } = req.query as {
    search?: string;
    limit?: number;
    offset?: number;
  };

  try {
    const query = db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        subscriptionTier: workspaces.subscriptionTier,
        subscriptionStatus: workspaces.subscriptionStatus,
        createdAt: workspaces.createdAt,
        employeeCount: sql<number>`(
          SELECT COUNT(*)::int FROM employees WHERE employees.workspace_id = ${workspaces.id} AND employees.is_active = true
        )`,
      })
      .from(workspaces)
      .limit(Number(limit))
      .offset(Number(offset));

    if (search) {
      const results = await query.where(ilike(workspaces.name, `%${search}%`));
      return res.json({ workspaces: results, total: results.length });
    }

    const results = await query;
    return res.json({ workspaces: results, total: results.length });
  } catch (err) {
    log.error('[AdminPerm] workspaces list error:', err);
    return res.status(500).json({ error: 'Failed to list workspaces' });
  }
});

// ── GET /api/admin/permissions/workspaces/:wsId/matrix ───────────────────────
// Get full effective permission matrix for any workspace.
router.get('/workspaces/:wsId/matrix', requirePlatformStaff, async (req, res) => {
  const { wsId } = req.params;
  try {
    const matrix = await resolveEffectivePermissions(wsId);
    return res.json({ matrix, workspaceId: wsId });
  } catch (err) {
    log.error('[AdminPerm] matrix GET error:', err);
    return res.status(500).json({ error: 'Failed to load matrix' });
  }
});

// ── PATCH /api/admin/permissions/workspaces/:wsId/matrix ─────────────────────
// Toggle a role+feature for any workspace. support_manager+ required.
router.patch('/workspaces/:wsId/matrix', requireSupportManager, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { wsId } = req.params;
  const parsed = matrixUpdateSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'role, featureKey, and enabled (boolean) are required',
      details: parsed.error.flatten(),
    });
  }

  const { role, featureKey, enabled } = parsed.data;

  const knownFeature = FEATURE_REGISTRY.find((f) => f.key === featureKey);
  if (!knownFeature) return res.status(400).json({ error: `Unknown featureKey: ${featureKey}` });

  if (!MATRIX_ROLES.includes(role as any)) {
    return res.status(400).json({
      error: `Role ${role} is not eligible for permission overrides.`,
    });
  }

  try {
    await upsertPermission(wsId, role, featureKey, enabled, authReq.user?.id ?? null);
    await universalAudit.log({
      workspaceId: wsId,
      actorId: authReq.user?.id ?? null,
      actorType: 'user',
      action: 'permission_matrix_updated',
      entityType: 'workspace_permission',
      entityId: wsId,
      changeType: 'update',
      metadata: { role, featureKey, enabled, source: 'platform_staff' },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    broadcastToWorkspace(wsId, {
      type: 'permission_update',
      role,
      featureKey,
      enabled,
      updatedBy: authReq.user?.id,
      source: 'platform_staff',
    });
    return res.json({ ok: true, workspaceId: wsId, role, featureKey, enabled });
  } catch (err) {
    log.error('[AdminPerm] matrix PATCH error:', err);
    return res.status(500).json({ error: 'Failed to update permission' });
  }
});

// ── DELETE /api/admin/permissions/workspaces/:wsId/matrix ────────────────────
// Reset a role+feature to registry default for any workspace.
router.delete('/workspaces/:wsId/matrix', requireSupportManager, async (req, res) => {
  const { wsId } = req.params;
  const parsed = matrixResetSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'role and featureKey are required',
      details: parsed.error.flatten(),
    });
  }

  const { role, featureKey } = parsed.data;

  try {
    const authReq2 = req as AuthenticatedRequest;
    await deletePermission(wsId, role, featureKey);
    await universalAudit.log({
      workspaceId: wsId,
      actorId: authReq2.user?.id ?? null,
      actorType: 'user',
      action: 'permission_matrix_reset',
      entityType: 'workspace_permission',
      entityId: wsId,
      changeType: 'delete',
      metadata: { role, featureKey, reset: true, source: 'platform_staff' },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    broadcastToWorkspace(wsId, {
      type: 'permission_update',
      role,
      featureKey,
      reset: true,
      source: 'platform_staff',
    });
    return res.json({ ok: true, reset: true, workspaceId: wsId, role, featureKey });
  } catch (err) {
    log.error('[AdminPerm] matrix DELETE error:', err);
    return res.status(500).json({ error: 'Failed to reset permission' });
  }
});

// ── GET /api/admin/permissions/workspaces/:wsId/users ────────────────────────
// Search all active users/employees in a workspace with their current roles.
router.get('/workspaces/:wsId/users', requirePlatformStaff, async (req, res) => {
  const { wsId } = req.params;
  const { search = '', limit = 100 } = req.query as { search?: string; limit?: number };

  try {
    const whereConditions = [eq(employees.workspaceId, wsId)];

    if (search) {
      whereConditions.push(
        or(
          ilike(employees.firstName, `%${search}%`),
          ilike(employees.lastName, `%${search}%`),
          ilike(employees.email, `%${search}%`),
        ) as any,
      );
    }

    const results = await db
      .select({
        id: employees.id,
        userId: employees.userId,
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: employees.email,
        workspaceRole: employees.workspaceRole,
        position: employees.position,
        isActive: employees.isActive,
      })
      .from(employees)
      .where(and(...whereConditions))
      .limit(Number(limit))
      .orderBy(employees.lastName);

    return res.json({ users: results, workspaceId: wsId, total: results.length });
  } catch (err) {
    log.error('[AdminPerm] users list error:', err);
    return res.status(500).json({ error: 'Failed to list users' });
  }
});

// ── PATCH /api/admin/permissions/workspaces/:wsId/users/:userId/role ──────────
// Change an individual user's workspace role. support_manager+ required.
router.patch('/workspaces/:wsId/users/:userId/role', requireSupportManager, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { wsId, userId } = req.params;
  const parsed = userRoleUpdateSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'workspaceRole is required',
      details: parsed.error.flatten(),
    });
  }

  const { workspaceRole, reason } = parsed.data;

  if (!MATRIX_ROLES.includes(workspaceRole as any)) {
    return res.status(400).json({
      error: `Role ${workspaceRole} is not a valid non-owner workspace role. Owner roles are managed separately.`,
    });
  }

  try {
    const [target] = await db
      .select()
      .from(employees)
      .where(and(eq(employees.id, userId), eq(employees.workspaceId, wsId)))
      .limit(1);

    if (!target) return res.status(404).json({ error: 'Employee not found in this workspace' });

    // ── Primary org_owner hard stop ──────────────────────────────────────────
    // Even platform staff must be sysop+ to touch the primary org_owner record.
    // support_manager (level 4) can change regular roles but NOT the primary owner.
    if (target.workspaceRole === 'org_owner') {
      const [ws] = await db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, wsId)).limit(1);
      if (ws?.ownerId === target.userId) {
        const actorPlatRole = (authReq as any).platformRole as string | undefined;
        const { PLATFORM_ROLE_HIERARCHY } = await import('../lib/rbac/roleDefinitions');
        const actorLevel = PLATFORM_ROLE_HIERARCHY[actorPlatRole ?? ''] ?? 0;
        if (actorLevel < 5) { // sysop (5) minimum
          return res.status(403).json({
            error: 'Elevated access required',
            code: 'PRIMARY_OWNER_PROTECTED',
            message: 'Changing the primary organization owner requires sysop-level platform access.',
          });
        }
      }
    }

    await db
      .update(employees)
      .set({ workspaceRole: workspaceRole as any })
      .where(eq(employees.id, userId));

    await universalAudit.log({
      workspaceId: wsId,
      actorId: authReq.user?.id ?? null,
      actorType: 'user',
      action: 'user_role_changed',
      entityType: 'employee',
      entityId: userId,
      changeType: 'update',
      changes: { workspaceRole: { old: target.workspaceRole, new: workspaceRole } },
      metadata: { reason: reason ?? 'Platform admin role change', source: 'platform_staff' },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    broadcastToWorkspace(wsId, {
      type: 'permission_update',
      userId,
      workspaceRole,
      source: 'platform_staff',
      updatedBy: authReq.user?.id,
      reason: reason ?? 'Platform admin role change',
    });

    return res.json({ ok: true, userId, workspaceId: wsId, workspaceRole });
  } catch (err) {
    log.error('[AdminPerm] user role PATCH error:', err);
    return res.status(500).json({ error: 'Failed to update user role' });
  }
});

export default router;
