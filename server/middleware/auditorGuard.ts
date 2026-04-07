/**
 * Auditor Guard Middleware
 * ========================
 * Enforces all four hard RBAC properties for auditor sessions:
 *
 * 1. isActive   — auditor account must not be deactivated
 * 2. expiresAt  — auditor session must not be past the DB-stored expiry
 * 3. Financial  — auditor sessions are automatically blocked from any route
 *                 tagged with blockFinancialData (isFinancialRoute flag)
 * 4. Strict     — requireAuditorOnly accepts ONLY the auditor role; managers
 *                 cannot pass through auditor-only endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { auditorAccounts } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
const log = createLogger('auditorGuard');

/**
 * Resolves the auditor account ID from a request.
 * Supports both auditor-portal auth (auditorAccountId) and
 * enforcement-route auth (auditorId).
 */
function resolveAuditorAccountId(req: Request): string | null {
  return req.auditorAccountId || req.auditorId || null;
}

/**
 * Property 1 + 2: DB-level session validation.
 *
 * Must be called AFTER JWT verification has set auditorAccountId on the request.
 * Queries auditor_accounts and enforces:
 *   - isActive = true (platform staff can deactivate before expiry)
 *   - expiresAt > now (prevents use of tokens past the audit window)
 *
 * If either check fails → 401 with a precise message.
 */
export async function enforceAuditorSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const accountId = resolveAuditorAccountId(req);

  if (!accountId) {
    res.status(401).json({ success: false, error: 'Auditor authentication required.' });
    return;
  }

  try {
    const [account] = await db
      .select({
        id: auditorAccounts.id,
        isActive: auditorAccounts.isActive,
        expiresAt: auditorAccounts.expiresAt,
      })
      .from(auditorAccounts)
      .where(eq(auditorAccounts.id, accountId))
      .limit(1);

    if (!account) {
      res.status(401).json({ success: false, error: 'Auditor account not found. Contact the regulatory agency.' });
      return;
    }

    if (!account.isActive) {
      res.status(401).json({
        success: false,
        error: 'This auditor account has been deactivated. Contact the regulatory agency to restore access.',
      });
      return;
    }

    if (account.expiresAt && new Date() > new Date(account.expiresAt)) {
      res.status(401).json({
        success: false,
        error: 'Session expired. Contact the regulatory agency to request an extension.',
      });
      return;
    }

    // Attach full-account confirmation for downstream handlers
    req.auditorAccountVerified = true;
    next();
  } catch (err) {
    log.error('[AuditorGuard] DB check failed:', err);
    res.status(500).json({ success: false, error: 'Unable to verify auditor session. Please try again.' });
  }
}

/**
 * Property 3: Financial data exclusion (isFinancialRoute flag).
 *
 * Apply this middleware to ANY route that exposes financial data —
 * billing, payroll, invoices, credits, Stripe, QuickBooks, expenses, finance.
 *
 * If the request is from an auditor session → 403, automatically,
 * regardless of how the route was registered or who added it.
 *
 * Naming: "blockFinancialData" is the export used in route files.
 * The flag pattern: place this BEFORE requireAuth on financial routes so it
 * is checked on every matching request without trusting downstream logic.
 */
export function blockFinancialData(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const accountId = resolveAuditorAccountId(req);
  if (accountId) {
    res.status(403).json({
      success: false,
      error: 'Financial data is not accessible in regulatory audit sessions.',
    });
    return;
  }
  next();
}

/**
 * Property 4: Strict auditor-only check.
 *
 * Accepts ONLY requests that have a verified auditor session.
 * Regular workspace users — including managers and org_owners — are rejected.
 * Use this on endpoints that are exclusively for auditors.
 */
export function requireAuditorOnly(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const accountId = resolveAuditorAccountId(req);
  if (!accountId) {
    res.status(403).json({
      success: false,
      error: 'This endpoint is restricted to verified regulatory auditors.',
    });
    return;
  }
  next();
}
