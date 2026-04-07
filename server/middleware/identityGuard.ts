/**
 * Identity Guard Middleware
 * =========================
 * Enforces profile access scoping so that:
 *
 * 1. requireSelf — the authenticated user can only access their own resource.
 *    Use for self-service profile endpoints (PATCH /profile, GET /profile/me).
 *
 * 2. requireManagerOrSelf — managers (tier 2+) and platform staff may access
 *    any employee within their workspace; lower-tier users can only access
 *    their own resource.
 *
 * 3. requireOwnerOrSelf — org owners / co-owners may access any user in their
 *    workspace; lower-tier users can only access their own resource.
 *
 * Usage:
 *   router.get('/employees/:userId/profile', requireAuth, ensureWorkspaceAccess, requireManagerOrSelf('userId'), handler);
 */

import { Request, Response, NextFunction } from 'express';
import { WORKSPACE_ROLE_HIERARCHY, hasPlatformWideAccess, type AuthenticatedRequest } from '../rbac';

/**
 * Resolves the target userId from the request.
 * Checks params, then body, then query. Falls back to 'me' → authenticated user.
 */
function resolveTargetUserId(req: AuthenticatedRequest, paramName: string): string | null {
  const raw: string | undefined =
    (req.params as any)[paramName] ||
    (req.body as any)?.[paramName] ||
    (req.query as any)?.[paramName];

  if (!raw || raw === 'me') {
    return req.user?.id || null;
  }
  return raw;
}

/**
 * requireSelf — Only the authenticated user may access this resource.
 * Platform staff with platform-wide access are allowed through unconditionally.
 *
 * @param paramName  The request param/body/query key that holds the target userId (default: 'userId')
 */
export function requireSelf(paramName = 'userId') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    const actorId = authReq.user?.id;

    if (!actorId) {
      res.status(401).json({ success: false, error: 'Authentication required.' });
      return;
    }

    // Platform-wide staff bypass
    if (hasPlatformWideAccess(authReq.platformRole)) {
      return next();
    }

    const targetId = resolveTargetUserId(authReq, paramName);

    if (!targetId || targetId !== actorId) {
      res.status(403).json({ success: false, error: 'You may only access your own profile.' });
      return;
    }

    next();
  };
}

/**
 * requireManagerOrSelf — Managers (tier 2+) may access any profile in their
 * workspace. Lower-tier users may only access their own resource.
 *
 * @param paramName  The request param/body/query key that holds the target userId (default: 'userId')
 * @param minLevel   Minimum role hierarchy level for "manager" access (default: 4 = manager)
 */
export function requireManagerOrSelf(paramName = 'userId', minLevel = 4) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    const actorId = authReq.user?.id;

    if (!actorId) {
      res.status(401).json({ success: false, error: 'Authentication required.' });
      return;
    }

    // Platform-wide staff bypass
    if (hasPlatformWideAccess(authReq.platformRole)) {
      return next();
    }

    const roleLevel = WORKSPACE_ROLE_HIERARCHY[authReq.workspaceRole || ''] || 0;

    // Manager-level access → allow all
    if (roleLevel >= minLevel) {
      return next();
    }

    // Self-access fallback
    const targetId = resolveTargetUserId(authReq, paramName);
    if (targetId && targetId === actorId) {
      return next();
    }

    res.status(403).json({
      success: false,
      error: 'You do not have permission to access this profile.',
    });
  };
}

/**
 * requireOwnerOrSelf — Org owners / co-owners (tier 1, level 6+) may access
 * any profile. Lower-tier users may only access their own resource.
 *
 * @param paramName  The request param/body/query key that holds the target userId (default: 'userId')
 */
export function requireOwnerOrSelf(paramName = 'userId') {
  return requireManagerOrSelf(paramName, 6);
}
