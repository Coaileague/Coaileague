/**
 * Platform Staff & Bot Audit Interceptor
 * ========================================
 * Automatically logs every mutating request (POST, PATCH, PUT, DELETE)
 * made by support agents, system operators, and Trinity Bot to the
 * admin_audit_log table.
 *
 * This middleware MUST run after requireAuth so that req.user, req.platformRole,
 * and req.isTrinityBot are already populated.
 *
 * Design:
 *  - Only fires for platform-wide actors (support_agent, sysop, Bot, etc.)
 *  - Regular tenant users are tracked by the standard audit.ts middleware
 *  - Never blocks the request — audit failure is logged and swallowed
 *  - Captures: actor, target workspace, method, path, status, duration
 */

import type { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { hasPlatformWideAccess } from '../rbac';
import type { AuthenticatedRequest } from '../rbac';
import { createLogger } from '../lib/logger';

const log = createLogger('platformStaffAudit');

const MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export function platformStaffAuditMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;

  // Only audit platform-wide actors (support agents, sysops, bots, etc.)
  const isPlatformActor =
    (authReq.isTrinityBot === true) ||
    (authReq.platformRole && hasPlatformWideAccess(authReq.platformRole));

  if (!isPlatformActor) {
    return next();
  }

  // Only log mutating operations — reads are not action-worthy for this log
  if (!MUTATION_METHODS.has(req.method)) {
    return next();
  }

  const startedAt = Date.now();

  // Capture response status after the handler runs
  const originalEnd = res.end.bind(res);
  (res as any).end = function (...args: any[]) {
    const duration = Date.now() - startedAt;
    const status = res.statusCode;

    const actorId =
      (authReq as any).isTrinityBot ? 'trinity-bot-system' : (authReq.user?.id || 'unknown');

    const platformRole =
      (authReq as any).isTrinityBot ? 'Bot' : (authReq.platformRole || 'unknown');

    const targetWorkspace =
      authReq.workspaceId ||
      (req as any).params?.workspaceId ||
      (req as any).body?.workspaceId ||
      ((req as any).query)?.workspaceId ||
      null;

    const metadata = {
      actorEmail: authReq.user?.email || (authReq.isTrinityBot ? 'trinity@system' : null),
      platformRole,
      method: req.method,
      path: req.path,
      targetWorkspaceId: targetWorkspace,
      statusCode: status,
      durationMs: duration,
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    };

    // Fire-and-forget — never block the response
    db.execute(
      sql`INSERT INTO admin_audit_log (action, actor_id, metadata, created_at)
          VALUES (
            ${`platform_staff_${req.method.toLowerCase()}`},
            ${actorId},
            ${JSON.stringify(metadata)}::jsonb,
            NOW()
          )`
    ).catch((err: unknown) => {
      log.warn({ err, actorId, path: req.path }, '[PlatformStaffAudit] Failed to write audit entry');
    });

    return originalEnd(...args);
  };

  next();
}
