import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../lib/logger';
import { pool } from '../db';
import { GRANDFATHERED_TENANT_ID } from '../services/billing/billingConstants';

const log = createLogger('grandfatheredTenantGuard');

export function statewideWriteGuard(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!GRANDFATHERED_TENANT_ID) {
    next();
    return;
  }

  const workspaceId =
    (req as any).user?.workspaceId ||
    (req as any).body?.workspaceId ||
    req.params?.workspaceId ||
    (req.query?.workspaceId as string | undefined);

  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const isAuthRoute = req.path.startsWith('/api/auth');
  const isHealthRoute = req.path === '/health' || req.path === '/api/platform/readiness';
  const isWebhookRoute = req.path.startsWith('/api/webhook') || req.path.startsWith('/api/stripe');

  if (
    workspaceId === GRANDFATHERED_TENANT_ID &&
    isMutation &&
    !isAuthRoute &&
    !isHealthRoute &&
    !isWebhookRoute
  ) {
    log.error('PRODUCTION TENANT WRITE BLOCKED', {
      path: req.path,
      method: req.method,
      userId: (req as any).user?.userId,
      body: JSON.stringify((req as any).body || {}).slice(0, 200),
      ip: req.ip,
    });

    pool.query(
      `INSERT INTO admin_audit_log (action, actor_id, metadata, created_at)
       VALUES ('grandfathered_tenant_write_blocked', $1, $2, NOW())`,
      [
        (req as any).user?.userId || 'anonymous',
        JSON.stringify({
          path: req.path,
          method: req.method,
          ip: req.ip,
        }),
      ]
    ).catch((err) => {
      log.warn('grandfatheredTenantGuard audit log write failed', { err: err?.message });
    });

    res.status(403).json({
      error: 'Write operations are blocked on this workspace.',
      code: 'TENANT_PROTECTED',
    });
    return;
  }

  next();
}
