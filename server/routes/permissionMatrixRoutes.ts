import { z } from 'zod';
/**
 * Permission Matrix Routes — Phase 9B
 * =====================================
 * GET  /api/workspace/permissions        — list effective permissions for workspace
 * GET  /api/workspace/permissions/meta   — feature registry + matrix roles (for editor UI)
 * PATCH /api/workspace/permissions       — toggle a single role+feature; owner OR platform staff
 * DELETE /api/workspace/permissions      — reset a role+feature to registry default; owner OR platform staff
 *
 * Write endpoints accept: org_owner, co_owner, or any platform staff role.
 * Reads allow any authenticated workspace member.
 */

import type { RequestHandler } from 'express';
import { Router } from 'express';
import { db } from '../db';
import { workspacePermissions } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import { broadcastToWorkspace } from '../websocket';
import { resolveEffectivePermissions } from '../middleware/workspacePermissions';
import { FEATURE_REGISTRY, MATRIX_ROLES } from '../lib/rbac/featureRegistry';
import { hasPlatformWideAccess , requireOwnerOrPlatformStaff } from '../rbac';
import type { AuthenticatedRequest } from '../rbac';
import { createLogger } from '../lib/logger';
const log = createLogger('PermissionMatrixRoutes');


const router = Router();

const OWNER_ROLES = new Set(['org_owner', 'co_owner']);

// ── Auth helper: owner OR platform staff ────────────────────────────────────
const requireOwnerOrPlatformStaff: RequestHandler = (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  if (OWNER_ROLES.has(authReq.workspaceRole ?? '')) return next();
  const platformRole = (authReq as any).platformRole;
  if (platformRole && hasPlatformWideAccess(platformRole)) return next();
  return res.status(403).json({ error: 'Only workspace owners or platform staff can edit permissions' });
};

// ── GET /api/workspace/permissions ─────────────────────────────────────────
// Returns the full effective permission matrix for the current workspace.
router.get('/', async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const workspaceId = authReq.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'Workspace context required' });

  try {
    const matrix = await resolveEffectivePermissions(workspaceId);
    return res.json({ matrix });
  } catch (err) {
    log.error('[PermMatrix] GET error:', err);
    return res.status(500).json({ error: 'Failed to load permission matrix' });
  }
});

// ── GET /api/workspace/permissions/meta ────────────────────────────────────
// Returns the feature registry and matrix-eligible roles for building the editor.
router.get('/meta', async (_req, res) => {
  return res.json({
    features: FEATURE_REGISTRY,
    roles: MATRIX_ROLES,
  });
});

// ── PATCH /api/workspace/permissions ───────────────────────────────────────
// Toggle enabled state for a specific role+feature in this workspace.
// Accepted: org_owner, co_owner, or any platform staff.
router.patch('/', requireOwnerOrPlatformStaff, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const workspaceId = authReq.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'Workspace context required' });

  const permUpdateSchema = z.object({
      role: z.string().min(1).max(100),
      featureKey: z.string().min(1).max(100),
      enabled: z.boolean(),
    });
    const permParsed = permUpdateSchema.safeParse(req.body);
    if (!permParsed.success) return res.status(400).json({ error: 'Validation failed', details: permParsed.error.flatten() });
    const { role, featureKey, enabled } = permParsed.data;

  if (!role || !featureKey || typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'role, featureKey, and enabled (boolean) are required' });
  }

  const knownFeature = FEATURE_REGISTRY.find((f) => f.key === featureKey);
  if (!knownFeature) {
    return res.status(400).json({ error: `Unknown featureKey: ${featureKey}` });
  }

  if (!MATRIX_ROLES.includes(role as any)) {
    return res.status(400).json({
      error: `Role ${role} is not eligible for permission overrides. Owner roles are always granted full access.`,
    });
  }

  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    await upsertPermission(workspaceId, role, featureKey, enabled, authReq.user?.id ?? null);
    broadcastToWorkspace(workspaceId, {
      type: 'permission_update',
      role,
      featureKey,
      enabled,
      updatedBy: authReq.user?.id,
      source: 'workspace_owner',
    });
    return res.json({ ok: true, role, featureKey, enabled });
  } catch (err) {
    log.error('[PermMatrix] PATCH error:', err);
    return res.status(500).json({ error: 'Failed to update permission' });
  }
});

// ── DELETE /api/workspace/permissions ──────────────────────────────────────
// Reset a role+feature override back to registry default (removes the DB row).
router.delete('/', requireOwnerOrPlatformStaff, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const workspaceId = authReq.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'Workspace context required' });

  const permGetSchema = z.object({ role: z.string().optional(), featureKey: z.string().optional() });
    const permGetParsed = permGetSchema.safeParse(req.body);
    const { role, featureKey } = permGetParsed.success ? permGetParsed.data : { role: undefined, featureKey: undefined };

  if (!role || !featureKey) {
    return res.status(400).json({ error: 'role and featureKey are required' });
  }

  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    await deletePermission(workspaceId, role, featureKey);
    broadcastToWorkspace(workspaceId, { type: 'permission_update', role, featureKey, reset: true });
    return res.json({ ok: true, reset: true, role, featureKey });
  } catch (err) {
    log.error('[PermMatrix] DELETE error:', err);
    return res.status(500).json({ error: 'Failed to reset permission' });
  }
});

export default router;

// ── Shared helpers (also exported for admin routes) ────────────────────────

export { upsertPermission, deletePermission } from '../lib/rbac/permissionActions';
