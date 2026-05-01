/**
 * SRA Authentication Routes — Phase 33
 * POST /api/sra/auth/apply  — Submit new SRA account application
 * POST /api/sra/auth/login  — Step 1: badge + email + password
 * POST /api/sra/auth/verify-totp — Step 2: 6-digit TOTP code
 * GET  /api/sra/auth/me     — Current session info
 * POST /api/sra/auth/logout — Invalidate session token
 * GET  /api/sra/auth/setup-totp — Get QR code URL for TOTP setup (admin use)
 */

import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { sraAccounts, sraAuditSessions, sraAuditLog, workspaceMembers, notifications } from '@shared/schema';
import { eq, and, gt } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import { requireSRAAuth, SRARequest, logSraAction } from '../../middleware/sraAuth';
import { getStateConfigStatic } from '../../services/compliance/stateRegulatoryKnowledgeBase';
import { createLogger } from '../../lib/logger';
import { PLATFORM } from '../../config/platformConfig';
import { z } from 'zod';
const log = createLogger('SraAuthRoutes');


const router = Router();

// ── Utility ──────────────────────────────────────────────────────────────────

function generateSessionToken(): string {
  return `sra_${crypto.randomBytes(32).toString('hex')}`;
}

const LOCKOUT_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;
const SESSION_HOURS = 8;

// ── POST /api/sra/auth/apply ─────────────────────────────────────────────────

router.post('/apply', async (req: Request, res: Response) => {
  const {
    badgeNumber, fullLegalName, regulatoryBody,
    stateCode, governmentEmail, password,
    authorizationLetterUrl, governmentIdUrl,
  } = req.body;

  if (!badgeNumber || !fullLegalName || !regulatoryBody || !stateCode || !governmentEmail || !password) {
    return res.status(400).json({ success: false, error: 'All required fields must be provided.' });
  }

  // Validate state code
  const stateConfig = getStateConfigStatic(stateCode.toUpperCase());
  if (!stateConfig) {
    return res.status(400).json({ success: false, error: `State code "${stateCode}" is not recognized.` });
  }

  // Validate government email domain matches state
  const emailAtDomain = governmentEmail.split('@')[1]?.toLowerCase() || '';
  const allowedDomain = (stateConfig.auditorEmailDomain || '').replace('@', '');
  const domainValid = allowedDomain
    ? emailAtDomain === allowedDomain.toLowerCase()
    : emailAtDomain.endsWith('.gov');

  if (!domainValid) {
    return res.status(400).json({
      success: false,
      error: `Government email must be from the ${stateCode} regulatory domain (e.g., ${allowedDomain || '*.gov'}).`,
    });
  }

  try {
    // Check for duplicate
    const [existing] = await db.select({ id: sraAccounts.id })
      .from(sraAccounts)
      .where(eq(sraAccounts.governmentEmail, governmentEmail.toLowerCase()))
      .limit(1);

    if (existing) {
      return res.status(409).json({ success: false, error: 'An account with this government email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Generate TOTP secret for future 2FA setup
    const totpSecret = speakeasy.generateSecret({ length: 20 });

    await db.insert(sraAccounts).values({
      badgeNumber: badgeNumber.trim().toUpperCase(),
      fullLegalName: fullLegalName.trim(),
      regulatoryBody: regulatoryBody.trim(),
      stateCode: stateCode.toUpperCase(),
      governmentEmail: governmentEmail.toLowerCase().trim(),
      authorizationLetterUrl: authorizationLetterUrl || null,
      governmentIdUrl: governmentIdUrl || null,
      status: 'pending_verification',
      credentialHash: passwordHash,
      twoFactorSecret: totpSecret.base32,
    });

    return res.status(201).json({
      success: true,
      message: `Application submitted. A ${PLATFORM.name} administrator will review and verify your credentials within 1-2 business days. You will receive confirmation at your government email.`,
    });
  } catch (err) {
    log.error('[SRA Apply] Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to submit application. Please try again.' });
  }
});

// ── POST /api/sra/auth/login ─────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response) => {
  const { governmentEmail, password, badgeNumber } = req.body;

  if (!governmentEmail || !password) {
    return res.status(400).json({ success: false, error: 'Government email and password are required.' });
  }

  try {
    const [account] = await db.select()
      .from(sraAccounts)
      .where(eq(sraAccounts.governmentEmail, governmentEmail.toLowerCase().trim()))
      .limit(1);

    if (!account) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    // Check lockout
    if (account.lockedUntil && new Date() < new Date(account.lockedUntil)) {
      const minutesLeft = Math.ceil((new Date(account.lockedUntil).getTime() - Date.now()) / 60000);
      return res.status(429).json({
        success: false,
        error: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute(s).`,
      });
    }

    if (account.status === 'pending_verification') {
      return res.status(403).json({
        success: false,
        error: 'Your account is pending verification. Please wait for administrator approval.',
      });
    }

    if (account.status !== 'verified') {
      return res.status(403).json({
        success: false,
        error: `Account status: ${account.status}. Contact your regulatory agency.`,
      });
    }

    const passwordValid = await bcrypt.compare(password, account.credentialHash || '');
    if (!passwordValid) {
      const attempts = (account.failedLoginAttempts || 0) + 1;
      const updates: Record<string, unknown> = { failedLoginAttempts: attempts, updatedAt: new Date() };
      if (attempts >= LOCKOUT_ATTEMPTS) {
        updates.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      }
      await db.update(sraAccounts).set(updates).where(eq(sraAccounts.id, account.id));
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    // Reset failed attempts on successful password check
    await db.update(sraAccounts)
      .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(sraAccounts.id, account.id));

    return res.json({
      success: true,
      requiresTotp: true,
      accountId: account.id,
      stateCode: account.stateCode,
      message: 'Password verified. Enter your authenticator app code to complete login.',
    });
  } catch (err) {
    log.error('[SRA Login] Error:', err);
    return res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
});

// ── POST /api/sra/auth/verify-totp ───────────────────────────────────────────

router.post('/verify-totp', async (req: Request, res: Response) => {
  const { accountId, totpCode, workspaceId, auditPeriodStart, auditPeriodEnd } = req.body;

  if (!accountId || !totpCode) {
    return res.status(400).json({ success: false, error: 'Account ID and TOTP code are required.' });
  }

  try {
    const [account] = await db.select()
      .from(sraAccounts)
      .where(eq(sraAccounts.id, accountId))
      .limit(1);

    if (!account || account.status !== 'verified') {
      return res.status(401).json({ success: false, error: 'Invalid account.' });
    }

    if (!account.twoFactorSecret) {
      return res.status(400).json({ success: false, error: 'TOTP not configured. Contact your administrator.' });
    }

    const verified = speakeasy.totp.verify({
      secret: account.twoFactorSecret,
      encoding: 'base32',
      token: totpCode.toString().replace(/\s/g, ''),
      window: 2,
    });

    if (!verified) {
      return res.status(401).json({ success: false, error: 'Invalid authentication code. Please try again.' });
    }

    // Create audit session
    const sessionToken = generateSessionToken();
    const tokenExpiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
    const periodStart = auditPeriodStart ? new Date(auditPeriodStart) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const periodEnd = auditPeriodEnd ? new Date(auditPeriodEnd) : new Date();

    // D04: Atomic session start — session record + account last-login update.
    // If the session insert succeeds but lastLoginAt update fails, the audit
    // trail is inconsistent; rollback prevents that.
    const session = await db.transaction(async (tx) => {
      const [s] = await tx.insert(sraAuditSessions).values({
        sraAccountId: account.id,
        workspaceId: workspaceId || 'unspecified',
        stateCode: account.stateCode,
        auditPeriodStart: periodStart,
        auditPeriodEnd: periodEnd,
        status: 'active',
        sessionToken,
        tokenExpiresAt,
      }).returning();

      await tx.update(sraAccounts)
        .set({ lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(sraAccounts.id, account.id));

      return s;
    });

    // Log the login
    await logSraAction(session.id, account.id, workspaceId || 'unspecified', 'login', {
      badgeNumber: account.badgeNumber,
      regulatoryBody: account.regulatoryBody,
      stateCode: account.stateCode,
    }, req);

    // Check 3: NDS notification to org_owner(s) of the audited workspace
    if (workspaceId && workspaceId !== 'unspecified') {
      try {
        const owners = await db
          .select({ userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.role, 'org_owner')
          ));
        const now = new Date();
        for (const owner of owners) {
          await db.insert(notifications).values({
            userId: owner.userId,
            workspaceId,
            scope: 'workspace',
            category: 'compliance',
            type: 'audit_access_request',
            title: 'State Regulatory Auditor Login',
            message: `${account.fullLegalName} (Badge: ${account.badgeNumber}) from ${account.regulatoryBody} has begun a regulatory audit session for your workspace. Audit period: ${periodStart.toLocaleDateString()} – ${periodEnd.toLocaleDateString()}.`,
            isRead: false,
            createdAt: now,
          } as any);
        }
      } catch (notifErr) {
        log.error('[SRA Login] NDS notification failed (non-fatal):', notifErr);
      }
    }

    // Set session cookie
    res.cookie('sra_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_HOURS * 60 * 60 * 1000,
      sameSite: 'lax',
    });

    return res.json({
      success: true,
      sessionToken,
      sessionId: session.id,
      account: {
        id: account.id,
        fullLegalName: account.fullLegalName,
        badgeNumber: account.badgeNumber,
        regulatoryBody: account.regulatoryBody,
        stateCode: account.stateCode,
        governmentEmail: account.governmentEmail,
      },
      auditPeriod: { start: periodStart, end: periodEnd },
      expiresAt: tokenExpiresAt,
    });
  } catch (err) {
    log.error('[SRA TOTP] Error:', err);
    return res.status(500).json({ success: false, error: 'Authentication failed. Please try again.' });
  }
});

// ── GET /api/sra/auth/me ──────────────────────────────────────────────────────

router.get('/me', requireSRAAuth, async (req: SRARequest, res: Response) => {
  const { sraSession } = req;
  if (!sraSession) return res.status(401).json({ success: false });

  try {
    const [account] = await db.select({
      id: sraAccounts.id,
      fullLegalName: sraAccounts.fullLegalName,
      badgeNumber: sraAccounts.badgeNumber,
      regulatoryBody: sraAccounts.regulatoryBody,
      stateCode: sraAccounts.stateCode,
      governmentEmail: sraAccounts.governmentEmail,
      status: sraAccounts.status,
    }).from(sraAccounts).where(eq(sraAccounts.id, sraSession.sraAccountId)).limit(1);

    const [session] = await db.select({
      id: sraAuditSessions.id,
      workspaceId: sraAuditSessions.workspaceId,
      auditPeriodStart: sraAuditSessions.auditPeriodStart,
      auditPeriodEnd: sraAuditSessions.auditPeriodEnd,
      tokenExpiresAt: sraAuditSessions.tokenExpiresAt,
    }).from(sraAuditSessions).where(eq(sraAuditSessions.id, sraSession.sessionId)).limit(1);

    return res.json({ success: true, account, session });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to load account.' });
  }
});

// ── POST /api/sra/auth/logout ─────────────────────────────────────────────────

router.post('/logout', requireSRAAuth, async (req: SRARequest, res: Response) => {
  const { sraSession } = req;
  if (!sraSession) return res.status(401).json({ success: false });

  try {
    await db.update(sraAuditSessions)
      .set({ status: 'closed', closedAt: new Date() })
      .where(eq(sraAuditSessions.id, sraSession.sessionId));

    await logSraAction(sraSession.sessionId, sraSession.sraAccountId, sraSession.workspaceId, 'logout', {}, req);

    res.clearCookie('sra_session');
    return res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Logout failed.' });
  }
});

// ── GET /api/sra/auth/setup-totp ─────────────────────────────────────────────
// Returns TOTP setup info for a verified account (used after admin verification)

router.get('/setup-totp/:accountId', async (req: Request, res: Response) => {
  const { accountId } = req.params;
  const { adminToken } = req.query;

  const requiredToken = process.env.SRA_ADMIN_TOKEN;
  if (!requiredToken || adminToken !== requiredToken) {
    return res.status(403).json({ success: false, error: 'Unauthorized.' });
  }

  try {
    const [account] = await db.select({
      id: sraAccounts.id,
      fullLegalName: sraAccounts.fullLegalName,
      governmentEmail: sraAccounts.governmentEmail,
      twoFactorSecret: sraAccounts.twoFactorSecret,
    }).from(sraAccounts).where(eq(sraAccounts.id, accountId)).limit(1);

    if (!account) return res.status(404).json({ success: false, error: 'Account not found.' });

    const secret = account.twoFactorSecret || speakeasy.generateSecret({ length: 20 }).base32;

    // Update secret if not set
    if (!account.twoFactorSecret) {
      await db.update(sraAccounts).set({ twoFactorSecret: secret, updatedAt: new Date() }).where(eq(sraAccounts.id, accountId));
    }

    const otpauthUrl = speakeasy.otpauthURL({
      secret,
      label: `${PLATFORM.name}:${account.governmentEmail}`,
      issuer: `${PLATFORM.name} SRA Portal`,
      encoding: 'base32',
    });

    return res.json({
      success: true,
      otpauthUrl,
      secret,
      instructions: 'Scan the QR code with Google Authenticator or Authy. Store the secret securely as a backup.',
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to generate TOTP setup.' });
  }
});

export default router;
