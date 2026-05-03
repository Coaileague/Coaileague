/**
 * requireActiveClientAgreement — Wave 4 RBAC Guillotine (G-1, G-5)
 * ─────────────────────────────────────────────────────────────────
 * Applied to Client Portal routes. Enforces the canonical client
 * lifecycle state machine:
 *
 *   terminated → 403 + session revocation (hard block, permanent)
 *   past_due   → 403 (payment failure block — cleared on payment)
 *   Any other non-active state → 403
 *
 * Exempt routes: /billing, /support — so clients can pay and get help.
 *
 * On TERMINATED: also calls authEvents.revokeClientSessions(clientId)
 * to invalidate active session tokens.
 */

import type { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { clients } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
import type { AuthenticatedRequest } from '../rbac';

const log = createLogger('requireActiveClientAgreement');

// Routes the guillotine never blocks — payment recovery + support
const EXEMPT_SUFFIXES = [
  '/billing',
  '/support',
  '/health',
  '/coi',       // certificate of insurance read — always allowed
];

function isExempt(path: string): boolean {
  return EXEMPT_SUFFIXES.some(suffix => path.endsWith(suffix) || path.includes(suffix + '/'));
}

export async function requireActiveClientAgreement(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (isExempt(req.path)) return next();

  const authReq = req as AuthenticatedRequest;
  const clientId = req.params?.clientId || authReq.params?.clientId;
  const workspaceId = authReq.workspaceId;

  // No clientId in route params — this middleware is not applicable here
  if (!clientId || !workspaceId) return next();

  try {
    const [client] = await db
      .select({
        id: clients.id,
        clientLifecycleStatus: clients.clientLifecycleStatus,
        name: clients.name,
      })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
      .limit(1);

    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    const status = client.clientLifecycleStatus;

    if (status === 'terminated') {
      log.warn('[ClientGuillotine] TERMINATED client attempted access', {
        clientId,
        workspaceId,
        path: req.path,
      });

      // Revoke sessions for this client asynchronously (non-blocking)
      try {
        const { revokeClientPortalSessions } = await import('../lib/authEvents');
        await revokeClientPortalSessions(clientId).catch(() => null);
      } catch {
        // Non-fatal — the 403 is still returned
      }

      res.status(403).json({
        error: 'CLIENT_TERMINATED',
        message:
          'This client account has been terminated and all access has been permanently revoked. ' +
          'Contact your account representative for assistance.',
        code: 'CLIENT_TERMINATED',
      });
      return;
    }

    if (status === 'past_due') {
      log.warn('[ClientGuillotine] PAST_DUE client attempted access', {
        clientId,
        workspaceId,
        path: req.path,
      });

      res.status(403).json({
        error: 'CLIENT_PAST_DUE',
        message:
          'Your account is past due. Access is suspended until outstanding invoices are settled. ' +
          'Please contact billing or visit the billing section to resolve your balance.',
        code: 'CLIENT_PAST_DUE',
        actionUrl: '/client-portal/billing',
      });
      return;
    }

    // pending_onboarding or pending_approval on write routes
    if (
      status !== 'active' &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
    ) {
      res.status(403).json({
        error: 'CLIENT_NOT_ACTIVE',
        message:
          'Your account is not yet active. Please complete the onboarding process and sign the Service Agreement.',
        code: 'CLIENT_NOT_ACTIVE',
        currentStatus: status,
      });
      return;
    }

    return next();
  } catch (err: unknown) {
    log.error('[ClientGuillotine] DB error — failing open to not block legitimate access', { err });
    return next();
  }
}
