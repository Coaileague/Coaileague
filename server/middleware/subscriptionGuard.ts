/**
 * Phase 41 — Subscription Guards
 *
 * subscriptionReadOnlyGuard:
 *   'suspended' workspace → read-only mode (402 on mutations).
 *
 * cancelledWorkspaceGuard:
 *   'cancelled' workspace → full block (403) for all /api routes.
 *   Auth and health routes are always exempt so operators can re-activate.
 *
 * Wire AFTER authentication middleware so req.workspaceId is populated.
 */

import type { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { workspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';

import { GRANDFATHERED_TENANT_ID, PLATFORM_WORKSPACE_ID } from '../services/billing/billingConstants';

// Routes that are always allowed even in read-only mode (payment recovery paths)
const BILLING_EXEMPT_PREFIXES = [
  '/api/billing',
  '/api/stripe',
  '/api/webhook',
  '/api/webhooks',
  '/api/metrics',
  '/api/platform',
  '/api/health',
  '/api/auth',
];

// Routes always exempt for cancelled workspaces (auth + health + billing recovery)
const CANCELLED_EXEMPT_PREFIXES = [
  '/api/auth',
  '/api/health',
  '/api/status',
  '/api/billing',
  '/api/stripe',
  '/api/webhook',
  '/api/webhooks',
  '/api/platform',
  '/api/csrf-token',
];

// HTTP methods that mutate state
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isBillingExempt(path: string): boolean {
  return BILLING_EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

// @ts-expect-error — TS migration: fix in refactoring sprint
interface AuthenticatedRequest extends Request {
  workspaceId?: string;
  currentWorkspaceId?: string;
  user?: { workspaceId?: string };
}

export function subscriptionReadOnlyGuard(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  // Only mutating methods trigger the guard
  if (!MUTATING_METHODS.has(req.method)) return next();

  // Exempt billing/payment recovery routes
  if (isBillingExempt(req.path)) return next();

  const workspaceId =
    req.workspaceId || req.currentWorkspaceId || req.user?.workspaceId;

  // No workspace context — not applicable to this route
  if (!workspaceId) return next();

  // Grandfathered founder exemption — always passes
  if (GRANDFATHERED_TENANT_ID && workspaceId === GRANDFATHERED_TENANT_ID) return next();
  // Platform support org exemption — always passes
  if (workspaceId === PLATFORM_WORKSPACE_ID) return next();

  // Async check — must not await synchronously; kick off and handle in callback
  db.select({ subscriptionStatus: workspaces.subscriptionStatus })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)
    .then(([ws]) => {
      if (ws?.subscriptionStatus === 'suspended') {
        res.status(402).json({
          error: 'read_only_mode',
          message:
            'Your account is suspended due to a payment issue. The platform is in read-only mode. ' +
            'Please update your payment method to restore full access.',
          code: 'SUBSCRIPTION_SUSPENDED',
          actionUrl: '/settings?tab=billing',
        });
        return;
      }
      next();
    })
    .catch(() => {
      // If DB check fails, fail closed to prevent suspended accounts from writing during outages
      res.status(503).json({
        error: 'service_unavailable',
        message: 'Unable to verify account status. Please try again shortly.',
        code: 'SUBSCRIPTION_CHECK_FAILED',
      });
    });
}

/**
 * Cancelled Workspace Guard
 *
 * When a workspace subscription is 'cancelled', ALL /api access is blocked
 * (403) except auth/health/billing routes so operators can sign in and
 * re-activate their account.
 *
 * Wire AFTER requireAuth and AFTER subscriptionReadOnlyGuard.
 */
export function cancelledWorkspaceGuard(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  // Exempt auth/health/billing — always pass through
  if (CANCELLED_EXEMPT_PREFIXES.some(p => req.path.startsWith(p))) return next();

  const workspaceId =
    req.workspaceId || req.currentWorkspaceId || req.user?.workspaceId;

  if (!workspaceId) return next();
  if (GRANDFATHERED_TENANT_ID && workspaceId === GRANDFATHERED_TENANT_ID) return next();
  if (workspaceId === PLATFORM_WORKSPACE_ID) return next();

  db.select({ subscriptionStatus: workspaces.subscriptionStatus })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)
    .then(([ws]) => {
      if (ws?.subscriptionStatus === 'cancelled') {
        res.status(403).json({
          error: 'workspace_cancelled',
          message:
            'This workspace subscription has been cancelled and access has been revoked. ' +
            'Contact your administrator or visit billing to re-activate.',
          code: 'WORKSPACE_CANCELLED',
          actionUrl: '/settings?tab=billing',
        });
        return;
      }
      next();
    })
    .catch(() => next());
}
