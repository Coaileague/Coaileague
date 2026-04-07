/**
 * SRA Auth Middleware — Phase 33
 * ================================
 * Enforces session-token auth for the State Regulatory Auditor portal.
 * Completely separate from the existing auditorGuard.ts (which is for
 * org-owner-invited auditors). SRA accounts are government employees.
 *
 * Properties enforced:
 *  1. Session token present in Authorization header or cookie
 *  2. Token exists in sra_audit_sessions and is not expired
 *  3. Status of both session and account must be active/verified
 *  4. All SRA actions are logged to sra_audit_log (append-only)
 */

import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { sraAuditSessions, sraAccounts, sraAuditLog } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
const log = createLogger('sraAuth');

export interface SRARequest extends Request {
  sraSession?: {
    sessionId: string;
    sraAccountId: string;
    workspaceId: string;
    stateCode: string;
    accountStatus: string;
  };
}

/**
 * Append a log entry to sra_audit_log (never update, never delete).
 */
export async function logSraAction(
  sessionId: string,
  sraAccountId: string,
  workspaceId: string,
  actionType: string,
  metadata: Record<string, unknown> = {},
  req?: Request
): Promise<void> {
  try {
    await db.insert(sraAuditLog).values({
      sessionId,
      sraAccountId,
      workspaceId,
      actionType,
      ipAddress: req?.ip || req?.headers['x-forwarded-for']?.toString(),
      userAgent: req?.headers['user-agent'],
      metadata,
    });
  } catch (err) {
    log.error('[SRALog] Failed to write audit log entry:', err);
  }
}

/**
 * Main SRA auth middleware.
 * Reads the SRA session token from:
 *  - Authorization: Bearer <token>
 *  - Cookie: sra_session=<token>
 * Validates it against sra_audit_sessions and attaches sraSession to req.
 */
export async function requireSRAAuth(
  req: SRARequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token =
    (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null) ||
    (req.cookies?.sra_session as string | undefined);

  if (!token) {
    res.status(401).json({
      success: false,
      error: 'SRA session token required. Please log in at /regulatory-audit/login.',
    });
    return;
  }

  try {
    const [session] = await db
      .select({
        id: sraAuditSessions.id,
        sraAccountId: sraAuditSessions.sraAccountId,
        workspaceId: sraAuditSessions.workspaceId,
        stateCode: sraAuditSessions.stateCode,
        status: sraAuditSessions.status,
        tokenExpiresAt: sraAuditSessions.tokenExpiresAt,
        auditPeriodEnd: sraAuditSessions.auditPeriodEnd,
        accountStatus: sraAccounts.status,
      })
      .from(sraAuditSessions)
      .innerJoin(sraAccounts, eq(sraAuditSessions.sraAccountId, sraAccounts.id))
      .where(eq(sraAuditSessions.sessionToken, token))
      .limit(1);

    if (!session) {
      res.status(401).json({ success: false, error: 'Invalid or expired SRA session token.' });
      return;
    }

    if (session.status !== 'active') {
      res.status(401).json({ success: false, error: 'SRA audit session is no longer active.' });
      return;
    }

    if (session.accountStatus !== 'verified') {
      res.status(403).json({ success: false, error: 'SRA account is not verified. Contact your regulatory agency.' });
      return;
    }

    if (session.tokenExpiresAt && new Date() > new Date(session.tokenExpiresAt)) {
      res.status(401).json({ success: false, error: 'SRA session has expired. Please log in again.' });
      return;
    }

    // Check 8: Reject access if the declared audit period has ended
    if (session.auditPeriodEnd && new Date() > new Date(session.auditPeriodEnd)) {
      res.status(403).json({ success: false, error: 'The authorized audit period has ended. Access is no longer permitted.' });
      return;
    }

    req.sraSession = {
      sessionId: session.id,
      sraAccountId: session.sraAccountId,
      workspaceId: session.workspaceId,
      stateCode: session.stateCode,
      accountStatus: session.accountStatus,
    };

    next();
  } catch (err) {
    log.error('[SRAAuth] Session validation failed:', err);
    res.status(500).json({ success: false, error: 'Unable to verify SRA session. Please try again.' });
  }
}
