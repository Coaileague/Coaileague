/**
 * Workspace Permission Middleware — Phase 9B
 * ===========================================
 * Checks workspace_permissions overrides before falling back to featureRegistry defaults.
 *
 * RULES:
 * 1. org_owner and co_owner are ALWAYS allowed — never blocked by this table.
 * 2. Trinity Bot is always allowed.
 * 3. Platform-wide roles (root_admin, deputy_admin, sysop, etc.) bypass checks.
 * 4. If a workspace_permissions record exists → use it.
 * 5. If no record → fall back to hasDefaultAccess() from featureRegistry.
 */

import type { RequestHandler } from 'express';
import { db } from '../db';
import { workspacePermissions } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import { hasDefaultAccess } from '../lib/rbac/featureRegistry';
import type { AuthenticatedRequest } from '../rbac';
import { hasPlatformWideAccess } from '../rbac';

const OWNER_ROLES = new Set(['org_owner', 'co_owner']);

/** In-memory per-request cache key; cleared per request lifecycle automatically */
const PERM_CACHE_KEY = Symbol('workspacePermCache');

interface PermCache {
  [key: string]: boolean;
}

/**
 * Returns a middleware that blocks access if the current user's workspace role
 * does not have permission to use the given featureKey.
 */
export function checkFeaturePermission(featureKey: string): RequestHandler {
  return async (req, res, next) => {
    const authReq = req as AuthenticatedRequest;

    // --- Trinity Bot bypass ---
    if ((authReq as any).isTrinityBot) return next();

    // --- Platform-wide role bypass ---
    const platformRole = (authReq as any).platformRole;
    if (platformRole && hasPlatformWideAccess(platformRole)) return next();

    const role = authReq.workspaceRole;
    const workspaceId = authReq.workspaceId;

    if (!role || !workspaceId) {
      return res.status(403).json({ error: 'Workspace context required' });
    }

    // --- Owner bypass (immutable) ---
    if (OWNER_ROLES.has(role)) return next();

    // --- Per-request cache ---
    let cache = (req as any)[PERM_CACHE_KEY] as PermCache | undefined;
    if (!cache) {
      cache = {};
      (req as any)[PERM_CACHE_KEY] = cache;
    }
    const cacheKey = `${workspaceId}:${role}:${featureKey}`;
    if (cacheKey in cache) {
      return cache[cacheKey] ? next() : res.status(403).json({ error: 'Feature access denied for your role', featureKey });
    }

    // --- DB lookup ---
    const [override] = await db
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

    let allowed: boolean;
    if (override !== undefined) {
      allowed = override.enabled;
    } else {
      allowed = hasDefaultAccess(featureKey, role);
    }

    cache[cacheKey] = allowed;

    if (!allowed) {
      return res.status(403).json({
        error: `Your role (${role}) does not have access to the "${featureKey}" feature in this workspace.`,
        featureKey,
        currentRole: role,
        hint: 'Contact your organization owner to request access, or ask them to adjust workspace permissions.',
        code: 'FEATURE_ACCESS_DENIED',
      });
    }
    return next();
  };
}

/**
 * Resolves the effective permission for a single role+feature combination in a workspace.
 * Used internally by the read endpoint to build the matrix without N+1 queries.
 */
export async function resolveEffectivePermissions(
  workspaceId: string,
): Promise<{ role: string; featureKey: string; enabled: boolean; isOverride: boolean }[]> {
  const overrides = await db
    .select()
    .from(workspacePermissions)
    .where(eq(workspacePermissions.workspaceId, workspaceId));

  const { FEATURE_REGISTRY, MATRIX_ROLES, hasDefaultAccess } = await import('../lib/rbac/featureRegistry');

  const result: { role: string; featureKey: string; enabled: boolean; isOverride: boolean }[] = [];

  for (const role of MATRIX_ROLES) {
    for (const feature of FEATURE_REGISTRY) {
      const override = overrides.find(
        (o) => o.role === role && o.featureKey === feature.key,
      );
      if (override) {
        result.push({ role, featureKey: feature.key, enabled: override.enabled, isOverride: true });
      } else {
        result.push({
          role,
          featureKey: feature.key,
          enabled: hasDefaultAccess(feature.key, role),
          isOverride: false,
        });
      }
    }
  }

  return result;
}
