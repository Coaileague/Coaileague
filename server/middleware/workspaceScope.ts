import { Request, Response, NextFunction, RequestHandler } from 'express';
import { db } from '../db';
import { employees, workspaces, platformRoles } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { resolveWorkspaceForUser, hasPlatformWideAccess, getUserPlatformRole, type AuthenticatedRequest } from '../rbac';
import { assertWorkspaceActive } from './workspaceGuard';
import { storage } from '../storage';
import { createLogger } from '../lib/logger';
const log = createLogger('workspaceScope');

export async function enforceWorkspaceAccess(req: Request, res: Response, next: NextFunction) {
  const authReq = req as AuthenticatedRequest;
  
  if (!authReq.user?.id) {
    return next(); // Let auth middleware handle missing user
  }

  const workspaceId = authReq.workspaceId || authReq.params.workspaceId || authReq.query.workspaceId || authReq.body?.workspaceId;

  if (workspaceId) {
    const isMember = await storage.getWorkspaceMembership(authReq.user.id, workspaceId as string);
    if (!isMember) {
      // Check for platform-wide access as fallback
      const platformRole = await getUserPlatformRole(authReq.user.id);
      if (!hasPlatformWideAccess(platformRole)) {
        return res.status(403).json({ error: 'Access denied: you do not belong to this workspace' });
      }
    }
  }

  next();
}

export const ensureWorkspaceAccess: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  const method = req.method;
  const path = req.path;

  // Dev bypass: test mode uses the Acme Security sandbox org (dev-acme-security-ws)
  // Session workspace + role are set by the requireAuth bypass — skip all DB lookups.
  if (authReq.isTestMode) {
    authReq.workspaceId = req.session?.workspaceId || 'dev-acme-security-ws';
    authReq.workspaceRole = (req.session?.workspaceRole as any) || 'org_owner';
    authReq.employeeId = req.session?.employeeId || 'dev-acme-emp-004';
    log.debug('[ensureWorkspaceAccess] TEST MODE - workspace set to', { workspaceId: authReq.workspaceId });
    return next();
  }

  if (!authReq.user?.id) {
    log.warn('[ensureWorkspaceAccess] No authenticated user', { path, method });
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userId = authReq.user.id;

  const platformRole = await getUserPlatformRole(userId);
  if (hasPlatformWideAccess(platformRole)) {
    authReq.platformRole = platformRole;
    // For platform-wide access, check all sources for workspace ID
    // ORDER: query > params > body > already-set workspaceId > session
    const requestedWorkspaceId = (authReq.query?.workspaceId as string) ||
      (authReq.params?.workspaceId as string) ||
      authReq.body?.workspaceId ||
      authReq.workspaceId ||
      req.session?.workspaceId;
      
    if (requestedWorkspaceId) {
      authReq.workspaceId = requestedWorkspaceId;
      log.debug('[ensureWorkspaceAccess] Platform staff - workspace assigned', { 
        workspaceId: requestedWorkspaceId,
        userId,
        source: authReq.query?.workspaceId ? 'query' : authReq.params?.workspaceId ? 'params' : 'session'
      });
    }
    return next();
  }

  // For regular users: extract workspaceId with proper precedence
  // ORDER: query > params > body > already-set workspaceId > session
  const requestedWorkspaceId = (authReq.query?.workspaceId as string) ||
    (authReq.params?.workspaceId as string) ||
    authReq.body?.workspaceId ||
    authReq.workspaceId;

  if (!requestedWorkspaceId && req.session?.workspaceId && req.session?.workspaceRole) {
    authReq.workspaceId = req.session.workspaceId;
    authReq.workspaceRole = req.session.workspaceRole as any;
    authReq.employeeId = req.session.employeeId || undefined;

    log.debug('[ensureWorkspaceAccess] Using session workspace (fast-path)', {
      workspaceId: req.session.workspaceId,
      userId,
      role: req.session.workspaceRole,
    });

    // Still enforce suspension check for mutations even on session fast-path.
    // A cached session from before a workspace was suspended must not bypass this gate.
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      try {
        await assertWorkspaceActive(req.session.workspaceId);
      } catch (err: unknown) {
        if (err.name === 'WorkspaceNotFoundError') {
          log.warn('[ensureWorkspaceAccess] Workspace not found on suspension check', {
            workspaceId: req.session.workspaceId,
            userId,
          });
          return res.status(403).json({ error: err.message, code: 'WORKSPACE_NOT_FOUND' });
        }
        if (err.name === 'WorkspaceInactiveError') {
          log.warn('[ensureWorkspaceAccess] Workspace inactive on mutation', {
            workspaceId: req.session.workspaceId,
            userId,
          });
          return res.status(403).json({ error: err.message, code: 'WORKSPACE_INACTIVE' });
        }
        log.error('[workspaceScope] assertWorkspaceActive (session fast-path) unexpected error:', err);
        return res.status(500).json({ error: 'Internal error checking workspace status', code: 'INTERNAL_ERROR' });
      }
    }

    return next();
  }

  const resolved = await resolveWorkspaceForUser(userId, requestedWorkspaceId as string | undefined);

  if (!resolved.workspaceId || !resolved.role) {
    const isWorkspaceCreate = req.method === 'POST' && req.baseUrl === '/api/workspace' && req.path === '/';
    const isOrgCodeCheck = req.method === 'GET' && req.path?.startsWith('/org-code/check/');
    if (isWorkspaceCreate || isOrgCodeCheck) {
      return next();
    }
    return res.status(403).json({
      error: resolved.error || 'Access denied: you do not belong to any workspace',
    });
  }

  authReq.workspaceId = resolved.workspaceId;
  authReq.workspaceRole = resolved.role || undefined;
  authReq.employeeId = resolved.employeeId || undefined;

  if (req.session && !req.session.workspaceId) {
    req.session.workspaceId = resolved.workspaceId;
    req.session.workspaceRole = resolved.role || undefined;
    req.session.employeeId = resolved.employeeId || undefined;
  }

  // T005: Block suspended/frozen workspaces on mutation routes
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    try {
      await assertWorkspaceActive(resolved.workspaceId);
    } catch (err: unknown) {
      if (err.name === 'WorkspaceNotFoundError') {
        return res.status(403).json({ error: err.message, code: 'WORKSPACE_NOT_FOUND' });
      }
      if (err.name === 'WorkspaceInactiveError') {
        return res.status(403).json({ error: err.message, code: 'WORKSPACE_INACTIVE' });
      }
      // Unexpected error (DB failure, TypeError, etc.) — propagate as 500 instead of misreporting WORKSPACE_INACTIVE
      log.error('[workspaceScope] assertWorkspaceActive unexpected error:', err);
      return res.status(500).json({ error: 'Internal error checking workspace status', code: 'INTERNAL_ERROR' });
    }
  }

  next();
};

export function requireWorkspaceParam(paramName: string = 'workspaceId'): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const suppliedId = req.params[paramName] || req.query[paramName] || req.body?.[paramName];

    if (!suppliedId) {
      return res.status(400).json({ error: `Missing required parameter: ${paramName}` });
    }

    if (!authReq.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const platformRole = await getUserPlatformRole(authReq.user.id);
    if (hasPlatformWideAccess(platformRole)) {
      authReq.platformRole = platformRole;
      authReq.workspaceId = suppliedId as string;
      return next();
    }

    const resolved = await resolveWorkspaceForUser(authReq.user.id, suppliedId as string);

    if (!resolved.workspaceId || !resolved.role) {
      return res.status(403).json({
        error: resolved.error || 'Access denied to the specified workspace',
      });
    }

    authReq.workspaceId = resolved.workspaceId;
    authReq.workspaceRole = resolved.role || undefined;
    authReq.employeeId = resolved.employeeId || undefined;
    next();
  };
}

export async function verifyResourceWorkspace(
  userId: string,
  resourceWorkspaceId: string,
): Promise<{ authorized: boolean; error?: string }> {
  const platformRole = await getUserPlatformRole(userId);
  if (hasPlatformWideAccess(platformRole)) {
    return { authorized: true };
  }

  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.userId, userId),
        eq(employees.workspaceId, resourceWorkspaceId),
      ),
    )
    .limit(1);

  if (emp) {
    return { authorized: true };
  }

  const [ownedWorkspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.id, resourceWorkspaceId),
        eq(workspaces.ownerId, userId),
      ),
    )
    .limit(1);

  if (ownedWorkspace) {
    return { authorized: true };
  }

  return {
    authorized: false,
    error: 'Access denied: you do not belong to this workspace',
  };
}
