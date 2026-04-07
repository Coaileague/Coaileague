import type { Response } from 'express';

/**
 * PHASE 2 RC1 — Canonical authenticated request type.
 *
 * This is the ONLY import location for AuthenticatedRequest.
 * All authenticated route handlers import from here.
 * Never use (req as any) on request objects — permanently retired.
 *
 * Architecture Canon (replit.md): AuthenticatedRequest is the required type
 * for every authenticated route handler. req as any on request objects is
 * permanently retired.
 */
export type { AuthenticatedRequest } from '../rbac';

/**
 * Runtime workspace guard — required at the top of every workspace-scoped handler.
 *
 * Usage:
 *   const workspaceId = requireWorkspaceContext(req, res);
 *   if (!workspaceId) return;  // 401 already sent
 *
 * The returned string is guaranteed non-null, non-empty.
 */
export function requireWorkspaceContext(
  req: { workspaceId?: string },
  res: Response,
): string | null {
  if (!req.workspaceId) {
    res.status(401).json({
      error: 'Workspace context required',
      code: 'MISSING_WORKSPACE_CONTEXT',
    });
    return null;
  }
  return req.workspaceId;
}
