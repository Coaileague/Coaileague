/**
 * Universal API Response Helpers
 *
 * Canonical response shapes for all route handlers:
 *   Success:   { success: true, data: T }
 *   Error:     { success: false, error: string, code?: string }
 *   Not Found: { success: false, error: "X not found" }
 *
 * Establishes a single consistent contract for every API consumer.
 */

import type { Response } from "express";
import type { AuthenticatedRequest } from '../rbac';

export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

export function sendError(
  res: Response,
  message: string,
  status = 500,
  code?: string
): void {
  const body: { success: false; error: string; code?: string } = {
    success: false,
    error: message,
  };
  if (code) body.code = code;
  res.status(status).json(body);
}

export function sendNotFound(res: Response, entity = "Resource"): void {
  res.status(404).json({ success: false, error: `${entity} not found` });
}

export function sendUnauthorized(res: Response, message = "Not authenticated"): void {
  res.status(401).json({ success: false, error: message });
}

export function sendForbidden(res: Response, message = "Access denied"): void {
  res.status(403).json({ success: false, error: message });
}

export function sendBadRequest(res: Response, message: string): void {
  res.status(400).json({ success: false, error: message });
}

/**
 * Require a workspaceId from the authenticated request context, request body,
 * or query string. Sends a 400 and returns false if absent — callers must
 * return immediately when this returns false.
 *
 *   const workspaceId = requireWorkspaceId(req, res);
 *   if (!workspaceId) return;
 */
export function requireWorkspaceId(req: AuthenticatedRequest, res: Response): string | false {
  const id =
    req.workspaceId ||
    req.body?.workspaceId ||
    (req.query?.workspaceId as string | undefined);
  if (!id) {
    res.status(400).json({ success: false, error: "workspaceId is required" });
    return false;
  }
  return id as string;
}

/**
 * Require an authenticated userId from the request. Sends 401 and returns
 * false if absent — callers must return immediately when this returns false.
 *
 *   const userId = requireUserId(req, res);
 *   if (!userId) return;
 */
export function requireUserId(req: AuthenticatedRequest, res: Response): string | false {
  const id = req.user?.id;
  if (!id) {
    res.status(401).json({ success: false, error: "Authentication required" });
    return false;
  }
  return id as string;
}
