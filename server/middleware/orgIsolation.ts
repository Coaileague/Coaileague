/**
 * Org Isolation Middleware
 * Prevents cross-org data access by:
 * 1. Validating workspaceId in request body/query matches session workspace
 * 2. Providing assertOwnsResource() helper that throws 403 on mismatch
 * 3. Enforcing suspended workspace blocks
 */
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AuthenticatedRequest, hasPlatformWideAccess } from '../rbac';
import { assertWorkspaceActive } from './workspaceGuard';
import { createLogger } from '../lib/logger';

const log = createLogger('OrgIsolation');

export class OrgIsolationError extends Error {
  name = 'OrgIsolationError';
  status = 403;
  constructor(message: string) {
    super(message);
  }
}

/**
 * Attaches assertOwnsResource() and scoped query helpers to req.
 * Must run AFTER workspaceScope middleware (req.workspaceId must be set).
 */
export const orgIsolationMiddleware: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  const sessionWorkspaceId: string | undefined = authReq.workspaceId;

  // Skip for platform-wide admin access — use the canonical hasPlatformWideAccess() check
  // so this is always in sync with the rest of the RBAC system.
  if (hasPlatformWideAccess(authReq.platformRole)) {
    attachHelpers(authReq, sessionWorkspaceId);
    next();
    return;
  }

  if (!sessionWorkspaceId) {
    next();
    return;
  }

  // Detect workspaceId spoofing: if body/query has a different workspaceId, reject
  const bodyWs = req.body?.workspaceId;
  const queryWs = (req.query?.workspaceId) as string | undefined;
  const requestedWs = bodyWs || queryWs;

  if (requestedWs && requestedWs !== sessionWorkspaceId) {
    log.warn('WorkspaceId spoofing attempt blocked', {
      sessionWorkspaceId,
      requestedWorkspaceId: requestedWs,
      path: req.path,
      userId: authReq.user?.id,
      requestId: (authReq as any).requestId,
    });
    // SECURITY: regenerate session on workspace switch attempt/spoofing
    if (req.session) {
      const oldSession = { ...req.session };
      req.session.regenerate((err) => {
        if (err) log.error('Session regeneration error on spoofing attempt:', err);
        Object.assign(req.session, oldSession);
        // But we still reject the request after regeneration
      });
    }
    res.status(403).json({
      error: 'Access denied: requested workspace does not match your session',
      code: 'ORG_ISOLATION_VIOLATION',
      requestId: (authReq as any).requestId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Enforce suspended workspace check on mutation routes
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      await assertWorkspaceActive(sessionWorkspaceId);
    } catch (err: unknown) {
      next(err);
      return;
    }
  }

  attachHelpers(authReq, sessionWorkspaceId);
  next();
};

function attachHelpers(req: AuthenticatedRequest, workspaceId: string | undefined): void {
  /**
   * Throws OrgIsolationError if resourceWorkspaceId != session workspaceId.
   * Use this before returning any DB record to the client.
   */
  req.assertOwnsResource = (resourceWorkspaceId: string | null | undefined, resourceType?: string) => {
    if (!workspaceId || !resourceWorkspaceId) return;
    if (resourceWorkspaceId !== workspaceId && (!req.platformRole || req.platformRole === 'none')) {
      throw new OrgIsolationError(
        `Access denied: ${resourceType || 'resource'} belongs to a different organization`
      );
    }
  };

  /**
   * Returns the validated workspace ID for the current session.
   * Throws if no workspace in context.
   */
  req.getWorkspaceId = (): string => {
    if (!workspaceId) throw new OrgIsolationError('No workspace context for this request');
    return workspaceId;
  };
}
