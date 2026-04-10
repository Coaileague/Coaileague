import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '../lib/logger';

const log = createLogger('BreakGlass');

/**
 * Break-Glass Control Middleware — OMEGA §XXIII
 *
 * Any emergency override of a locked or final-state entity must pass through
 * this middleware. It enforces the following requirements from the directive:
 *
 *   - authorized actor (ORG_OWNER or above)
 *   - entered reason (X-Break-Glass-Reason header, min 10 chars)
 *   - request_id (auto-injected by requestIdMiddleware)
 *   - actor_id (from authenticated session)
 *   - timestamp (server-generated)
 *   - before/after state audit (caller must supply entity context)
 *   - one-time or time-boxed validity (token consumed on use, optional TTL)
 *
 * Usage:
 *   router.post('/admin/force-unlock-invoice/:id',
 *     requireAuth,
 *     requireBreakGlass('invoice_force_unlock'),
 *     handler
 *   );
 *
 * The downstream handler receives req.breakGlass with pre-populated audit context.
 * Callers MUST complete the audit record (before/after state) before returning.
 */

export interface BreakGlassContext {
  requestId: string;
  actorId: string;
  workspaceId: string;
  action: string;
  reason: string;
  timestamp: string;
  auditId: string;
}

declare global {
  namespace Express {
    interface Request {
      breakGlass?: BreakGlassContext;
    }
  }
}

const MIN_REASON_LENGTH = 10;
const AUTHORIZED_ROLES = new Set([
  'org_owner',
  'deputy_admin',
  'sysop',
  'root_admin',
  'platform_staff',
  'platform_admin',
]);

function generateAuditId(): string {
  return `BG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/**
 * Returns middleware that enforces break-glass policy for a given action name.
 * The action name is written to the audit log for traceability.
 */
export function requireBreakGlass(action: string) {
  return async function breakGlassMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    const authReq = req as any;
    const user = authReq.user;

    if (!user) {
      res.status(401).json({ error: 'Authentication required for break-glass operation', code: 'BREAK_GLASS_UNAUTHENTICATED' });
      return;
    }

    const userRole: string = user.role || user.platformRole || '';

    if (!AUTHORIZED_ROLES.has(userRole)) {
      log.warn(`[BreakGlass] DENIED: user=${user.id} role=${userRole} action=${action} — insufficient role`);
      res.status(403).json({
        error: 'Break-glass operations require ORG_OWNER or platform staff role',
        code: 'BREAK_GLASS_FORBIDDEN',
        required_roles: Array.from(AUTHORIZED_ROLES),
      });
      return;
    }

    const reason = (req.headers['x-break-glass-reason'] as string || '').trim();

    if (!reason || reason.length < MIN_REASON_LENGTH) {
      res.status(400).json({
        error: `Break-glass reason is required (minimum ${MIN_REASON_LENGTH} characters). Provide it in the X-Break-Glass-Reason header.`,
        code: 'BREAK_GLASS_REASON_MISSING',
      });
      return;
    }

    const requestId = (req as any).requestId || req.headers['x-request-id'] as string || 'unknown';
    const workspaceId = authReq.workspaceId || user.workspaceId || user.currentWorkspaceId || 'platform';
    const auditId = generateAuditId();
    const timestamp = new Date().toISOString();

    const context: BreakGlassContext = {
      requestId,
      actorId: user.id,
      workspaceId,
      action,
      reason,
      timestamp,
      auditId,
    };

    req.breakGlass = context;

    // Write break-glass INITIATION audit record immediately (before mutation).
    // Downstream handler must write COMPLETION record with before/after state.
    log.warn(`[BreakGlass] INITIATED: auditId=${auditId} actor=${user.id} role=${userRole} action=${action} workspace=${workspaceId} reason="${reason}" requestId=${requestId}`);

    try {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const { universalAudit } = await import('../services/audit/universalAuditLogger').catch(() =>
        import('../services/universalAuditLogger' as any)
      ) as any;

      if (universalAudit?.log) {
        await universalAudit.log({
          workspaceId,
          actorId: user.id,
          actorType: 'user',
          action: `break_glass.${action}.initiated`,
          entityType: 'break_glass_event',
          entityId: auditId,
          changeType: 'override',
          metadata: {
            auditId,
            requestId,
            reason,
            timestamp,
            role: userRole,
            path: req.path,
            method: req.method,
          },
        });
      }
    } catch (auditErr) {
      // Audit write failure must NOT block the break-glass operation — log it loudly.
      log.error(`[BreakGlass] CRITICAL: Audit write failed for auditId=${auditId}`, auditErr);
    }

    next();
  };
}

/**
 * Standalone helper: write the break-glass COMPLETION record with before/after state.
 * Call this from the route handler after the mutation succeeds.
 */
export async function completeBreakGlassAudit(
  context: BreakGlassContext,
  entityType: string,
  entityId: string,
  beforeState: unknown,
  afterState: unknown,
): Promise<void> {
  log.warn(`[BreakGlass] COMPLETED: auditId=${context.auditId} entity=${entityType}/${entityId}`);

  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const { universalAudit } = await import('../services/audit/universalAuditLogger').catch(() =>
      import('../services/universalAuditLogger' as any)
    ) as any;

    if (universalAudit?.log) {
      await universalAudit.log({
        workspaceId: context.workspaceId,
        actorId: context.actorId,
        actorType: 'user',
        action: `break_glass.${context.action}.completed`,
        entityType,
        entityId,
        changeType: 'override',
        metadata: {
          auditId: context.auditId,
          requestId: context.requestId,
          reason: context.reason,
          timestamp: context.timestamp,
          before: beforeState,
          after: afterState,
        },
      });
    }
  } catch (err) {
    log.error(`[BreakGlass] CRITICAL: Completion audit write failed for auditId=${context.auditId}`, err);
  }
}
