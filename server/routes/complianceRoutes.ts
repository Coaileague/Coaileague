/**
 * Compliance Enforcement + Regulatory Auditor Routes
 * ====================================================
 * /api/compliance/*  — org owners + officers (window status, doc upload, appeal)
 * /api/auditor/*     — state regulatory auditors (read-only portal, audit sessions)
 * /api/admin/compliance/* — support staff (freeze lift, manual review)
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, type Request, type Response } from 'express';
// @ts-expect-error — TS migration: fix in refactoring sprint
import type { AuthenticatedRequest } from '../types';
import { hasManagerAccess, requirePlatformStaff } from '../rbac';
import { complianceEnforcementService } from '../services/compliance/complianceEnforcementService';
import { auditorService } from '../services/compliance/auditorService';
import { db } from '../db';
import {
  complianceWindows,
  accountFreezes,
  freezeAppeals,
  auditorAccounts,
  auditSessions,
  auditFindings,
  auditorFollowups,
  auditorDocumentRequests,
  auditorDocumentSafe,
  documentRetentionLog,
  complianceRegistryEntries,
  stateLicenseVerifications,
  multiStateComplianceWindows,
  users,
  workspaces,
  workspaces as workspacesTable,
  complianceScoreHistory,
  complianceAlerts,
} from '@shared/schema';
import { eq, and, desc, gte, lte, isNull, sql as drizzleSql } from 'drizzle-orm';
import crypto from 'crypto';
import Stripe from 'stripe';
import { universalAudit } from '../services/universalAuditService';
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';
import { getStripe, isStripeConfigured } from '../services/billing/stripeClient';
const log = createLogger('ComplianceRoutes');


const router = Router();

// Lazy proxy: avoids module-load crash if STRIPE_SECRET_KEY is missing (TRINITY.md §F).
const stripe = new Proxy({} as Stripe, {
  get(_t, prop) {
    return (getStripe() as any)[prop];
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// AUDITOR TOKEN UTILITIES  (stateless HMAC-signed tokens)
// ─────────────────────────────────────────────────────────────────────────────
// FIX: Removed insecure hardcoded fallback. The startup validator enforces
// SESSION_SECRET before routes are mounted, so absence here is always a bug.
if (!process.env.SESSION_SECRET) {
  throw new Error('[ComplianceRoutes] FATAL: SESSION_SECRET env var is required for auditor token signing.');
}
const AUDITOR_SECRET = process.env.SESSION_SECRET;
const AUDITOR_TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function generateAuditorToken(auditorId: string): string {
  const expires = Date.now() + AUDITOR_TOKEN_TTL_MS;
  const payload = `${auditorId}:${expires}`;
  const sig = crypto.createHmac('sha256', AUDITOR_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

function verifyAuditorToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 3) return null;
    const [auditorId, expiresStr, sig] = parts;
    if (Date.now() > parseInt(expiresStr, 10)) return null;
    const payload = `${auditorId}:${expiresStr}`;
    const expected = crypto.createHmac('sha256', AUDITOR_SECRET).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
    return auditorId;
  } catch {
    return null;
  }
}

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100_000, 32, 'sha256').toString('hex');
}

/** Resolves auditor ID from Bearer token or x-auditor-token header (both require signature verification) */
function resolveAuditorId(req: Request): string | null {
  const authHeader = req.headers.authorization ?? '';
  if (authHeader.startsWith('Bearer ')) {
    return verifyAuditorToken(authHeader.slice(7));
  }
  const headerToken = req.headers['x-auditor-token'] as string | undefined;
  if (headerToken) return verifyAuditorToken(headerToken);
  // x-auditor-id header removed — it allowed unverified pass-through (security fix)
  return null;
}

/**
 * POST /api/enforcement/auditor/login
 * State regulatory auditor login — returns a signed token
 */
router.post('/auditor/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const [account] = await db.select().from(auditorAccounts)
      .where(eq(auditorAccounts.email, email.toLowerCase().trim()))
      .limit(1);

    if (!account) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!account.isActive) {
      return res.status(403).json({ error: `Account is inactive. Contact ${PLATFORM.name} support.` });
    }

    if (account.expiresAt && new Date() > account.expiresAt) {
      return res.status(403).json({ error: `Auditor credential has expired. Contact ${PLATFORM.name} support.` });
    }

    // Verify password
    if (!account.passwordHash) {
      return res.status(403).json({ error: 'Account has no password set. Contact your administrator.' });
    }

    // passwordHash stored as salt:hash
    const [salt, storedHash] = (account.passwordHash as string).split(':');
    const computedHash = hashPassword(password, salt);
    if (computedHash !== storedHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await db.update(auditorAccounts)
      .set({ lastLoginAt: new Date() } as any)
      .where(eq(auditorAccounts.id, account.id));

    const token = generateAuditorToken(account.id);
    return res.json({
      success: true,
      token,
      auditor: {
        id: account.id,
        name: account.name,
        email: account.email,
        agencyName: account.agencyName,
        stateCode: account.stateCode,
        stateCodeList: account.stateCodeList,
      },
    });
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * POST /api/enforcement/auditor/set-password
 * Platform admin sets initial password for a new auditor account
 */
router.post('/auditor/set-password', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { auditorId, password } = req.body;
    if (!auditorId || !password || password.length < 8) {
      return res.status(400).json({ error: 'auditorId and password (min 8 chars) required' });
    }

    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const [auditor] = await db.select().from(auditorAccounts).where(and(eq(auditorAccounts.id, auditorId), eq(auditorAccounts.workspaceId, workspaceId)));
    if (!auditor) return res.status(404).json({ error: 'Auditor not found in your workspace' });

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    const passwordHash = `${salt}:${hash}`;

    await db.update(auditorAccounts)
      .set({ passwordHash } as any)
      .where(and(eq(auditorAccounts.id, auditorId), eq(auditorAccounts.workspaceId, workspaceId)));

    return res.json({ success: true });
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * GET /api/enforcement/auditor/me
 * Returns current auditor profile from token
 */
router.get('/auditor/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (req.headers['x-auditor-token'] as string);
    if (!token) return res.status(401).json({ error: 'Auditor token required' });

    const auditorId = verifyAuditorToken(token);
    if (!auditorId) return res.status(401).json({ error: 'Invalid or expired token' });

    const [account] = await db.select({
      id: auditorAccounts.id,
      name: auditorAccounts.name,
      email: auditorAccounts.email,
      agencyName: auditorAccounts.agencyName,
      stateCode: auditorAccounts.stateCode,
      stateCodeList: auditorAccounts.stateCodeList,
      isActive: auditorAccounts.isActive,
      lastLoginAt: auditorAccounts.lastLoginAt,
    }).from(auditorAccounts).where(eq(auditorAccounts.id, auditorId)).limit(1);

    if (!account) return res.status(404).json({ error: 'Account not found' });
    return res.json(account);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE WINDOW ROUTES  (org owners + officers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/compliance/status/:entityType/:entityId
 * Returns compliance window status including days remaining, missing docs, freeze state
 */
router.get('/status/:entityType/:entityId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entityType, entityId } = req.params;
    if (!['organization', 'officer'].includes(entityType)) {
      return res.status(400).json({ error: 'entityType must be "organization" or "officer"' });
    }

    const status = await complianceEnforcementService.getComplianceStatus(
      entityType as 'organization' | 'officer',
      entityId,
    );

    if (!status) {
      return res.status(404).json({ error: 'No compliance window found for this entity' });
    }

    return res.json(status);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * GET /api/compliance/my-status
 * Returns compliance status for the current user's workspace (org) and themselves (officer)
 */
router.get('/my-status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspaceId || req.user?.workspaceId;

    const results: any = {};

    if (workspaceId) {
      results.organization = await complianceEnforcementService.getComplianceStatus('organization', workspaceId);
    }

    if (userId) {
      results.officer = await complianceEnforcementService.getComplianceStatus('officer', userId);
    }

    return res.json(results);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * GET /api/compliance/score
 * Workspace compliance score (0-100) with deductions breakdown.
 * Visible to: org_owner, co_owner, platform staff, and auditors.
 * NON-BLOCKING — low score surfaces alerts/visibility but never blocks ops.
 */
router.get('/score', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const callerRole = (req as any).workspaceRole || '';
    const callerPlatformRole = (req as any).platformRole || '';
    const isOwner = ['org_owner', 'co_owner'].includes(callerRole);
    const isPlatform = ['root_admin', 'deputy_admin', 'sysop',
      'support_manager', 'support_agent'].includes(callerPlatformRole);
    const isAuditor = callerRole === 'auditor';

    if (!isOwner && !isPlatform && !isAuditor) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { calculateComplianceScore } = await import(
      '../services/compliance/workspaceComplianceScore'
    );
    const score = await calculateComplianceScore(workspaceId);
    res.json(score);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * GET /api/compliance/tasks/pending
 * Returns pending compliance items that require the user's attention.
 * Used by TrinityTaskWidget (useTrinityTasks hook).
 */
router.get('/tasks/pending', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const alerts = await db
      .select({
        id: complianceAlerts.id,
        alertType: complianceAlerts.alertType,
        severity: complianceAlerts.severity,
        title: complianceAlerts.title,
        message: complianceAlerts.message,
        actionRequired: complianceAlerts.actionRequired,
        actionUrl: complianceAlerts.actionUrl,
        actionLabel: complianceAlerts.actionLabel,
        createdAt: complianceAlerts.createdAt,
      })
      .from(complianceAlerts)
      .where(
        and(
          eq(complianceAlerts.workspaceId, workspaceId),
          eq(complianceAlerts.isDismissed, false),
          eq(complianceAlerts.isResolved, false),
          eq(complianceAlerts.actionRequired, true),
        )
      )
      .orderBy(desc(complianceAlerts.createdAt))
      .limit(50);

    const tasks = alerts.map((a) => ({
      id: a.id,
      type: a.alertType,
      severity: a.severity,
      priority: a.severity === 'critical' ? 'urgent' : a.severity === 'warning' ? 'high' : 'normal',
      title: a.title,
      description: a.message,
      actionUrl: a.actionUrl,
      actionLabel: a.actionLabel,
      createdAt: a.createdAt,
    }));

    return res.json(tasks);
  } catch (err: unknown) {
    log.error('[Compliance] tasks/pending error:', err);
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * POST /api/compliance/appeal
 * Submit a one-time appeal to extend freeze to end of current month
 */
router.post('/appeal', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entityType, entityId, appealReason } = req.body;
    const submittedBy = req.user?.id;

    if (!entityType || !entityId || !appealReason) {
      return res.status(400).json({ error: 'entityType, entityId, and appealReason are required' });
    }
    if (!submittedBy) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await complianceEnforcementService.submitAppeal({
      entityType,
      entityId,
      submittedBy,
      appealReason,
      workspaceId: req.workspaceId || req.user?.workspaceId,
    });

    // RC2 (Phase 2): Log compliance appeal in universal audit trail
    await universalAudit.log({
      workspaceId: req.workspaceId || req.user?.workspaceId || 'system',
      actorId: submittedBy,
      actorType: 'user',
      action: 'COMPLIANCE:APPEAL_SUBMITTED',
      entityType: 'compliance_window',
      entityId: result.appealId || entityId,
      changeType: 'action',
      metadata: { entityType, entityId, appealReason, extensionDeadline: result.extensionDeadline },
    });

    return res.json(result);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * POST /api/compliance/document-approved
 * Called internally when a document is verified as approved
 * Records the approval and checks if entity is now fully compliant
 */
router.post('/document-approved', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entityType, entityId, docType } = req.body;
    if (!entityType || !entityId || !docType) {
      return res.status(400).json({ error: 'entityType, entityId, and docType are required' });
    }

    const result = await complianceEnforcementService.recordDocumentApproved(entityType, entityId, docType);

    // RC2 (Phase 2): Log compliance document approval
    await universalAudit.log({
      workspaceId: req.workspaceId || req.user?.workspaceId || 'system',
      actorId: req.user?.id || 'system',
      actorType: req.user ? 'user' : 'system',
      action: 'COMPLIANCE:DOCUMENT_APPROVED',
      entityType: 'compliance_window',
      entityId: entityId,
      changeType: 'update',
      metadata: { entityType, docType, isNowCompliant: result.isNowCompliant },
    });

    return res.json(result);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * GET /api/compliance/windows
 * List all compliance windows (admin only)
 */
router.get('/windows', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const windows = await db.select()
      .from(complianceWindows)
      .where(eq(complianceWindows.workspaceId, workspaceId))
      .orderBy(desc(complianceWindows.createdAt))
      .limit(100);
    return res.json(windows);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * GET /api/compliance/freezes
 * List active freezes (admin + support staff)
 */
router.get('/freezes', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const { status = 'active' } = req.query;
    const freezes = await db.select()
      .from(accountFreezes)
      .where(and(eq(accountFreezes.workspaceId, workspaceId), eq(accountFreezes.status, status as any)))
      .orderBy(desc(accountFreezes.frozenAt))
      .limit(100);
    return res.json(freezes);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * GET /api/compliance/appeals
 * List submitted appeals
 */
router.get('/appeals', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
    const appeals = await db.select()
      .from(freezeAppeals)
      .where(eq(freezeAppeals.workspaceId, workspaceId))
      .orderBy(desc(freezeAppeals.submittedAt))
      .limit(100);
    return res.json(appeals);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * POST /api/compliance/initialize-window
 * Creates a new 14-day compliance window for an org or officer
 */
router.post('/initialize-window', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entityType, entityId, workspaceId, isContractor } = req.body;
    if (!entityType || !entityId) {
      return res.status(400).json({ error: 'entityType and entityId are required' });
    }

    const window = await complianceEnforcementService.initializeWindow({
      entityType,
      entityId,
      workspaceId,
      isContractor,
    });
    return res.json(window);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN COMPLIANCE ROUTES  (support staff only)
// ─────────────────────────────────────────────────────────────────────────────

router.use('/admin', requirePlatformStaff);

/**
 * POST /api/compliance/admin/lift-freeze
 * Support staff lifts a compliance freeze — requires open HelpDesk ticket reference
 */
router.post('/admin/lift-freeze', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entityType, entityId, liftReason, relatedTicketId } = req.body;
    const liftedBy = req.user?.id;

    if (!entityType || !entityId || !liftReason || !relatedTicketId) {
      return res.status(400).json({
        error: 'entityType, entityId, liftReason, and relatedTicketId are required',
      });
    }
    if (!liftedBy) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Role check — support staff only
    const workspaceRole = req.user?.workspaceRole ?? req.workspaceRole;
    const allowedRoles = ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'];
    if (!allowedRoles.includes(workspaceRole)) {
      return res.status(403).json({ error: 'Only support staff can lift compliance freezes' });
    }

    const result = await complianceEnforcementService.liftFreeze({
      entityType,
      entityId,
      liftedBy,
      liftReason,
      relatedTicketId,
    });

    // RC2 (Phase 2): Log manual freeze lift in universal audit trail
    await universalAudit.log({
      workspaceId: req.workspaceId || req.user?.workspaceId || 'system',
      actorId: liftedBy,
      actorType: 'user',
      action: 'COMPLIANCE:FREEZE_LIFTED',
      entityType: 'account_freeze',
      entityId,
      changeType: 'action',
      metadata: { entityType, liftReason, relatedTicketId },
    });

    return res.json(result);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * POST /api/compliance/admin/run-daily-check
 * Manually trigger the daily compliance check (normally cron-driven)
 */
router.post('/admin/run-daily-check', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await complianceEnforcementService.runDailyComplianceCheck();
    return res.json({ success: true, ...result });
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * POST /api/compliance/admin/analyze-coi
 * Trinity AI analysis of a COI document text
 */
router.post('/admin/analyze-coi', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { documentText, workspaceId } = req.body;
    if (!documentText) return res.status(400).json({ error: 'documentText is required' });

    const result = await complianceEnforcementService.analyzeCOI(
      documentText,
      workspaceId ?? req.workspaceId ?? req.user?.workspaceId ?? 'system',
    );
    return res.json(result);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * POST /api/compliance/admin/analyze-license
 * Trinity AI analysis of a state license document
 */
router.post('/admin/analyze-license', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { documentText, stateCode, workspaceId } = req.body;
    if (!documentText || !stateCode) return res.status(400).json({ error: 'documentText and stateCode are required' });

    const result = await complianceEnforcementService.analyzeStateLicense(
      documentText,
      stateCode,
      workspaceId ?? req.workspaceId ?? req.user?.workspaceId ?? 'system',
    );
    return res.json(result);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AUDITOR PORTAL ROUTES  (/api/auditor/*)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/auditor/orgs
 * State-scoped org search for authenticated auditor
 */
router.get('/auditor/orgs', async (req: Request, res: Response) => {
  try {
    const auditorId = resolveAuditorId(req);
    const { q } = req.query;

    if (!auditorId) return res.status(401).json({ error: 'Auditor authentication required' });

    const orgs = await auditorService.searchOrgsForAuditor(auditorId as string, q as string | undefined);
    return res.json(orgs);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * POST /api/auditor/sessions
 * Start a new audit session for an org
 */
router.post('/auditor/sessions', async (req: Request, res: Response) => {
  try {
    const auditorId = resolveAuditorId(req);
    const { workspaceId, sessionLabel } = req.body;

    if (!auditorId) return res.status(401).json({ error: 'Auditor authentication required' });
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });

    const session = await auditorService.startAuditSession({
      auditorId: auditorId as string,
      workspaceId,
      sessionLabel,
    });
    return res.status(201).json(session);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * GET /api/auditor/sessions
 * List all audit sessions for authenticated auditor
 */
router.get('/auditor/sessions', async (req: Request, res: Response) => {
  try {
    const auditorId = resolveAuditorId(req);
    if (!auditorId) return res.status(401).json({ error: 'Auditor authentication required' });

    const sessions = await auditorService.getAuditorSessions(auditorId as string);
    return res.json(sessions);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * GET /api/auditor/sessions/:sessionId
 * Get single audit session details
 */
router.get('/auditor/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const auditorId = resolveAuditorId(req);
    if (!auditorId) return res.status(401).json({ error: 'Auditor authentication required' });
    const session = await auditorService.getAuditSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.auditorId !== auditorId) return res.status(403).json({ error: 'Unauthorized to view this session' });
    return res.json(session);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * PATCH /api/auditor/sessions/:sessionId/complete
 * Mark audit session as complete with outcome
 */
router.patch('/auditor/sessions/:sessionId/complete', async (req: Request, res: Response) => {
  try {
    const auditorId = resolveAuditorId(req);
    if (!auditorId) return res.status(401).json({ error: 'Auditor authentication required' });
    const { overallOutcome, summaryNotes, totalFineAmount } = req.body;
    if (!overallOutcome) return res.status(400).json({ error: 'overallOutcome is required' });

    // Verify session belongs to auditor before completion
    const sessionCheck = await auditorService.getAuditSession(req.params.sessionId);
    if (!sessionCheck) return res.status(404).json({ error: 'Session not found' });
    if (sessionCheck.auditorId !== auditorId) return res.status(403).json({ error: 'Unauthorized' });

    const session = await auditorService.completeAuditSession(req.params.sessionId, {
      overallOutcome,
      summaryNotes,
      totalFineAmount,
    });
    return res.json(session);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * GET /api/auditor/sessions/:sessionId/summary
 * Get full audit session summary (for PDF download)
 */
router.get('/auditor/sessions/:sessionId/summary', async (req: Request, res: Response) => {
  try {
    const auditorId = resolveAuditorId(req);
    if (!auditorId) return res.status(401).json({ error: 'Auditor authentication required' });

    const sessionCheck = await auditorService.getAuditSession(req.params.sessionId);
    if (!sessionCheck) return res.status(404).json({ error: 'Session not found' });
    if (sessionCheck.auditorId !== auditorId) return res.status(403).json({ error: 'Unauthorized' });

    const summary = await auditorService.generateSessionSummary(req.params.sessionId);
    return res.json(summary);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * POST /api/auditor/sessions/:sessionId/requests
 * Create a document request within an audit session
 */
router.post('/auditor/sessions/:sessionId/requests', async (req: Request, res: Response) => {
  try {
    const auditorId = resolveAuditorId(req);
    if (!auditorId) return res.status(401).json({ error: 'Auditor authentication required' });

    const { workspaceId, requestedDocType, requestNotes, daysToSubmit } = req.body;

    if (!requestedDocType || !workspaceId) {
      return res.status(400).json({ error: 'requestedDocType and workspaceId are required' });
    }

    // Verify session belongs to auditor
    const sessionCheck = await auditorService.getAuditSession(req.params.sessionId);
    if (!sessionCheck) return res.status(404).json({ error: 'Session not found' });
    if (sessionCheck.auditorId !== auditorId) return res.status(403).json({ error: 'Unauthorized' });

    const request = await auditorService.createDocumentRequest({
      auditSessionId: req.params.sessionId,
      auditorId: auditorId as string,
      workspaceId,
      requestedDocType,
      requestNotes,
      daysToSubmit,
    });
    return res.status(201).json(request);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * GET /api/auditor/sessions/:sessionId/requests
 * List document requests for a session
 */
router.get('/auditor/sessions/:sessionId/requests', async (req: Request, res: Response) => {
  try {
    const auditorId = resolveAuditorId(req);
    if (!auditorId) return res.status(401).json({ error: 'Auditor authentication required' });

    // Verify session belongs to auditor
    const sessionCheck = await auditorService.getAuditSession(req.params.sessionId);
    if (!sessionCheck) return res.status(404).json({ error: 'Session not found' });
    if (sessionCheck.auditorId !== auditorId) return res.status(403).json({ error: 'Unauthorized' });

    const requests = await auditorService.getSessionDocumentRequests(req.params.sessionId);
    return res.json(requests);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * PATCH /api/auditor/requests/:requestId/resolve
 * Resolve a document request with outcome
 */
router.patch('/auditor/requests/:requestId/resolve', async (req: Request, res: Response) => {
  try {
    const auditorId = resolveAuditorId(req);
    if (!auditorId) return res.status(401).json({ error: 'Auditor authentication required' });

    const { status, outcomeNotes, conditions } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required' });

    const updated = await auditorService.resolveDocumentRequest(req.params.requestId, {
      status,
      outcomeNotes,
      conditions,
    });
    return res.json(updated);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * POST /api/auditor/sessions/:sessionId/findings
 * Add a finding (violation, fine, condition, warning) to an audit session
 */
router.post('/auditor/sessions/:sessionId/findings', async (req: Request, res: Response) => {
  try {
    const auditorId = resolveAuditorId(req);
    if (!auditorId) return res.status(401).json({ error: 'Auditor authentication required' });

    const { workspaceId, findingType, title, description, severity, fineAmount, conditionDeadline, relatedDocType } = req.body;

    if (!findingType || !title || !description) {
      return res.status(400).json({ error: 'findingType, title, and description are required' });
    }

    // Verify session belongs to auditor
    const sessionCheck = await auditorService.getAuditSession(req.params.sessionId);
    if (!sessionCheck) return res.status(404).json({ error: 'Session not found' });
    if (sessionCheck.auditorId !== auditorId) return res.status(403).json({ error: 'Unauthorized' });

    const fineAmountCents = fineAmount ? Math.round(fineAmount * 100) : 0;

    const finding = await auditorService.addFinding({
      auditSessionId: req.params.sessionId,
      auditorId: auditorId as string,
      workspaceId,
      findingType,
      title,
      description,
      severity: severity ?? 'medium',
      fineAmount: fineAmountCents,
      conditionDeadline: conditionDeadline ? new Date(conditionDeadline) : undefined,
      relatedDocType,
    } as any);

    // Auto-generate Stripe invoice for fines > $0
    let stripeInvoiceId: string | undefined;
    if (fineAmountCents > 0 && stripe && workspaceId) {
      try {
        const [workspace] = await db.select({ stripeCustomerId: workspaces.stripeCustomerId })
          .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);

        if (workspace?.stripeCustomerId) {
          await stripe.invoiceItems.create({
            customer: workspace.stripeCustomerId,
            amount: fineAmountCents,
            currency: 'usd',
            description: `Regulatory Fine: ${title} (Finding ID: ${(finding as any).id ?? 'N/A'})`,
          });
          const invoice = await stripe.invoices.create({
            customer: workspace.stripeCustomerId,
            auto_advance: true,
            collection_method: 'send_invoice',
            days_until_due: 30,
            description: `Regulatory compliance finding — ${findingType}: ${title}`,
            metadata: { findingId: (finding as any).id ?? '', workspaceId, source: 'auditor_finding' },
          });
          await stripe.invoices.finalizeInvoice(invoice.id);
          stripeInvoiceId = invoice.id;
        }
      } catch (stripeErr: unknown) {
        log.error(`[ComplianceFine] Stripe invoice failed for finding: ${(stripeErr instanceof Error ? stripeErr.message : String(stripeErr))}`);
      }
    }

    return res.status(201).json({ ...finding, stripeInvoiceId });
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * GET /api/auditor/sessions/:sessionId/findings
 * List findings for a session
 */
router.get('/auditor/sessions/:sessionId/findings', async (req: Request, res: Response) => {
  try {
    const auditorId = resolveAuditorId(req);
    if (!auditorId) return res.status(401).json({ error: 'Auditor authentication required' });

    // Verify session belongs to auditor
    const sessionCheck = await auditorService.getAuditSession(req.params.sessionId);
    if (!sessionCheck) return res.status(404).json({ error: 'Session not found' });
    if (sessionCheck.auditorId !== auditorId) return res.status(403).json({ error: 'Unauthorized' });

    const findings = await auditorService.getSessionFindings(req.params.sessionId);
    return res.json(findings);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * POST /api/auditor/sessions/:sessionId/followups
 * Schedule a follow-up call/email/visit
 */
router.post('/auditor/sessions/:sessionId/followups', async (req: Request, res: Response) => {
  try {
    const auditorId = resolveAuditorId(req);
    if (!auditorId) return res.status(401).json({ error: 'Auditor authentication required' });

    const { workspaceId, scheduledFor, followupType, contactName, contactPhone, contactEmail, notes } = req.body;

    if (!scheduledFor) return res.status(400).json({ error: 'scheduledFor is required' });

    // Verify session belongs to auditor
    const sessionCheck = await auditorService.getAuditSession(req.params.sessionId);
    if (!sessionCheck) return res.status(404).json({ error: 'Session not found' });
    if (sessionCheck.auditorId !== auditorId) return res.status(403).json({ error: 'Unauthorized' });

    const followup = await auditorService.scheduleFollowup({
      auditSessionId: req.params.sessionId,
      auditorId: auditorId as string,
      workspaceId,
      scheduledFor: new Date(scheduledFor),
      followupType: followupType ?? 'phone_call',
      contactName,
      contactPhone,
      contactEmail,
      notes,
    } as any);
    return res.status(201).json(followup);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * PATCH /api/auditor/followups/:followupId/complete
 * Mark a follow-up as completed with outcome notes
 */
router.patch('/auditor/followups/:followupId/complete', async (req: Request, res: Response) => {
  try {
    const auditorId = resolveAuditorId(req);
    if (!auditorId) return res.status(401).json({ error: 'Auditor authentication required' });

    const { outcome } = req.body;
    const updated = await auditorService.completeFollowup(req.params.followupId, outcome ?? '');
    return res.json(updated);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * GET /api/auditor/sessions/:sessionId/followups
 * List follow-ups for a session
 */
router.get('/auditor/sessions/:sessionId/followups', async (req: Request, res: Response) => {
  try {
    const auditorId = resolveAuditorId(req);
    if (!auditorId) return res.status(401).json({ error: 'Auditor authentication required' });

    // Verify session belongs to auditor
    const sessionCheck = await auditorService.getAuditSession(req.params.sessionId);
    if (!sessionCheck) return res.status(404).json({ error: 'Session not found' });
    if (sessionCheck.auditorId !== auditorId) return res.status(403).json({ error: 'Unauthorized' });

    const followups = await auditorService.getSessionFollowups(req.params.sessionId);
    return res.json(followups);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * POST /api/auditor/accounts
 * Create a new auditor account (platform admin only)
 */
router.post('/auditor/accounts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, email, agencyName, agencyType, badgeNumber, stateCode, expiresAt } = req.body;
    if (!name || !email || !agencyName || !stateCode) {
      return res.status(400).json({ error: 'name, email, agencyName, and stateCode are required' });
    }

    const [account] = await db.insert(auditorAccounts).values({
      workspaceId: req.workspaceId,
      name,
      email,
      agencyName,
      agencyType: agencyType ?? 'state_bureau',
      badgeNumber,
      stateCode,
      issuedBy: req.user?.id ?? null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    } as any).returning();

    return res.status(201).json(account);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * GET /api/auditor/accounts
 * List all auditor accounts (platform admin only)
 */
router.get('/auditor/accounts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const accounts = await db.select({
      id: auditorAccounts.id,
      name: auditorAccounts.name,
      email: auditorAccounts.email,
      agencyName: auditorAccounts.agencyName,
      stateCode: auditorAccounts.stateCode,
      isActive: auditorAccounts.isActive,
      lastLoginAt: auditorAccounts.lastLoginAt,
      issuedAt: auditorAccounts.issuedAt,
      expiresAt: auditorAccounts.expiresAt,
    }).from(auditorAccounts)
      .where(eq(auditorAccounts.workspaceId, workspaceId))
      .orderBy(desc(auditorAccounts.issuedAt));
    return res.json(accounts);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AUDITOR INVITE LIFECYCLE (org-owner initiated)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/compliance/auditors/invite
 * Org owner invites a state auditor by email or SMS
 */
router.post('/compliance/auditors/invite', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, email, phone, agencyName, stateCode, inviteMethod = 'email' } = req.body;
    if (!name || !stateCode || (!email && !phone)) {
      return res.status(400).json({ error: 'name, stateCode, and email or phone are required' });
    }
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const token = crypto.randomBytes(32).toString('hex');

    const [account] = await db.insert(auditorAccounts).values({
      name,
      email: email ?? null,
      phone: phone ?? null,
      agencyName: agencyName ?? 'State Agency',
      agencyType: 'state_bureau',
      stateCode,
      isActive: false,
      inviteToken: token,
      inviteMethod,
      invitedWorkspaceId: workspaceId,
      invitedByUserId: req.user?.id ?? null,
      issuedBy: req.user?.id ?? null,
    } as any).returning();

    const activationUrl = `${process.env.BASE_URL ?? 'https://www.coaileague.com'}/auditor/activate?token=${token}`;

    // Send email invite if method is email
    if (inviteMethod === 'email' && email) {
      try {
        const { emailService } = await import('../services/emailService');
        const inviteHtml = `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
            <h2>Auditor Access Invitation</h2>
            <p>Hello ${name},</p>
            <p>You have been invited by an organization on ${PLATFORM.name} to review their compliance documentation.</p>
            <p><strong>State:</strong> ${stateCode}</p>
            <p>Click the button below to activate your secure auditor account:</p>
            <a href="${activationUrl}" style="display:inline-block;padding:12px 24px;background:#1a56db;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Activate Auditor Account</a>
            <p style="margin-top:24px;font-size:12px;color:#666">This link expires in 72 hours. If you did not expect this invitation, please disregard this email.</p>
          </div>
        `;
        await emailService.sendCustomEmail(email, `You have been invited to audit a ${PLATFORM.name} organization`, inviteHtml, 'auditor_invite'); // nds-exempt: one-time auditor activation token
      } catch (emailErr: unknown) {
        log.error('[AuditorInvite] Email send error:', (emailErr instanceof Error ? emailErr.message : String(emailErr)));
      }
    }

    // Send SMS invite if method is sms via NDS
    if ((inviteMethod === 'sms' || inviteMethod === 'both') && phone) {
      try {
        const { NotificationDeliveryService } = await import('../services/notificationDeliveryService');
        await NotificationDeliveryService.send({
          type: 'onboarding_notification',
          workspaceId: account.workspaceId || 'system',
          recipientUserId: account.id,
          channel: 'sms',
          body: {
            to: phone,
            body: `${PLATFORM.name}: You've been invited to audit an organization in ${stateCode}. Activate your access: ${activationUrl}`,
          },
          idempotencyKey: `auditor-invite-sms-${account.id}`,
        });
      } catch (smsErr: unknown) {
        log.error('[AuditorInvite] SMS send error:', (smsErr instanceof Error ? smsErr.message : String(smsErr)));
      }
    }

    return res.status(201).json({ auditorId: account.id, activationUrl, message: 'Invite sent' });
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * POST /api/compliance/auditors/activate
 * Auditor activates their account using invite token
 */
router.post('/compliance/auditors/activate', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'token and password are required' });

    // G15-pattern FIX: Atomic UPDATE WHERE inviteToken=token AND isActive=false.
    // Two concurrent activations would both pass a SELECT+check pattern; using
    // a single conditional UPDATE ensures only one request sets the password.
    const salt = crypto.randomBytes(32).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');

    const [activated] = await db.update(auditorAccounts)
      .set({
        isActive: true,
        passwordHash: `${salt}:${hash}`,
        activatedAt: new Date(),
        inviteToken: null,
      } as any)
      .where(and(
        eq(auditorAccounts.inviteToken as any, token),
        // @ts-expect-error — TS migration: fix in refactoring sprint
        isNull(auditorAccounts as any).activatedAt,
      ))
      .returning();

    if (!activated) {
      // Check if the token exists to give a more specific error
      const [existing] = await db.select().from(auditorAccounts)
        .where(eq(auditorAccounts.inviteToken as any, token))
        .limit(1);
      if (!existing) return res.status(404).json({ error: 'Invalid or expired invite token' });
      return res.status(409).json({ error: 'Account already activated' });
    }

    // RC2 (Phase 2): Log auditor account activation
    await universalAudit.log({
      workspaceId: (activated as any).invitedWorkspaceId || 'system',
      actorId: (activated as any).id,
      actorType: 'user',
      action: 'AUDITOR:ACCOUNT_ACTIVATED',
      entityType: 'auditor_account',
      entityId: (activated as any).id,
      changeType: 'update',
      metadata: { auditorName: (activated as any).name },
    });

    return res.json({ message: 'Account activated successfully', auditorId: (activated as any).id });
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * PATCH /api/compliance/auditors/:auditorId/deactivate
 * Org owner deactivates an auditor (removes live access, preserves document safe)
 */
router.patch('/compliance/auditors/:auditorId/deactivate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: 'Manager access required to deactivate auditors' });
    }
    const workspaceId = req.workspaceId || req.user?.workspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const { auditorId } = req.params;
    const { reason } = req.body;

    const [account] = await db.select().from(auditorAccounts).where(eq(auditorAccounts.id, auditorId));
    if (!account) return res.status(404).json({ error: 'Auditor not found' });

    // Preserve document safe for 7 years (state-mandated retention default)
    const safeExpiry = new Date();
    safeExpiry.setFullYear(safeExpiry.getFullYear() + 7);

    // RC2 (Phase 2): Wrap account deactivation + retention log in a transaction —
    // compliance audit trail must be written atomically with the deactivation record
    // so we never have a deactivated auditor without an audit trail.
    const refNum = `AUD-DEACT-${Date.now().toString(36).toUpperCase()}`;
    await db.transaction(async (tx) => {
      await tx.update(auditorAccounts).set({
        isActive: false,
        deactivatedAt: new Date(),
        deactivatedBy: req.user?.id ?? null,
        documentSafeExpiresAt: safeExpiry,
      } as any).where(eq(auditorAccounts.id, auditorId));

      // Log the deactivation in retention log (atomic with deactivation)
      await tx.insert(documentRetentionLog).values({
        referenceNumber: refNum,
        entityType: 'auditor_account',
        entityId: auditorId,
        documentType: 'auditor_access_lifecycle',
        documentTitle: `Auditor ${account.name} deactivated`,
        workspaceId,
        retentionCategory: 'regulatory',
        retentionYears: 7,
        purgeAt: safeExpiry,
        softDeleteReason: reason ?? 'Deactivated by org owner',
      } as any);
    });

    return res.json({ message: 'Auditor deactivated. Document safe preserved.', documentSafeExpiresAt: safeExpiry });
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * PATCH /api/compliance/auditors/:auditorId/reactivate
 * Org owner reactivates a previously deactivated auditor
 */
router.patch('/compliance/auditors/:auditorId/reactivate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: 'Manager access required to reactivate auditors' });
    }
    const { auditorId } = req.params;
    await db.update(auditorAccounts).set({
      isActive: true,
      deactivatedAt: null,
      deactivatedBy: null,
    } as any).where(eq(auditorAccounts.id, auditorId));
    return res.json({ message: 'Auditor reactivated' });
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * GET /api/compliance/auditors
 * List auditors for this workspace
 */
router.get('/compliance/auditors', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const accounts = await db.select({
      id: auditorAccounts.id,
      name: auditorAccounts.name,
      email: auditorAccounts.email,
      phone: (auditorAccounts as any).phone,
      agencyName: auditorAccounts.agencyName,
      stateCode: auditorAccounts.stateCode,
      isActive: auditorAccounts.isActive,
      inviteMethod: (auditorAccounts as any).inviteMethod,
      activatedAt: (auditorAccounts as any).activatedAt,
      deactivatedAt: (auditorAccounts as any).deactivatedAt,
      documentSafeExpiresAt: (auditorAccounts as any).documentSafeExpiresAt,
      finalOutcome: (auditorAccounts as any).finalOutcome,
      lastLoginAt: auditorAccounts.lastLoginAt,
    }).from(auditorAccounts)
      .where(eq((auditorAccounts as any).invitedWorkspaceId, workspaceId!))
      .orderBy(desc(auditorAccounts.issuedAt));
    return res.json(accounts);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT SAFE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/compliance/auditors/:auditorId/document-safe
 * View document safe (read-only, with soft-delete awareness)
 */
router.get('/compliance/auditors/:auditorId/document-safe', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { auditorId } = req.params;
    const currentAuditorId = resolveAuditorId(req);
    const workspaceId = req.workspaceId || req.user?.workspaceId;

    // Access control: either the auditor themselves or a manager in the workspace
    const isAuditor = currentAuditorId === auditorId;
    const isManager = workspaceId && hasManagerAccess(req.workspaceRole || '');

    if (!isAuditor && !isManager) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const docs = await db.select().from(auditorDocumentSafe as any)
      .where(
        and(
          eq((auditorDocumentSafe as any).auditorId, auditorId),
          isNull((auditorDocumentSafe as any).softDeletedAt)
        )
      )
      .orderBy(desc((auditorDocumentSafe as any).createdAt));
    return res.json(docs);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * POST /api/compliance/auditors/:auditorId/document-safe
 * Add a document entry to the safe (system only — triggered by audit session close)
 */
router.post('/compliance/auditors/:auditorId/document-safe', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { auditorId } = req.params;
    const { label, documentType, storageKey, downloadUrl, auditSessionId, stateMandatedYears = 3 } = req.body;
    if (!label) return res.status(400).json({ error: 'label is required' });

    const refNum = `DOC-SAFE-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const retentionUntil = new Date();
    retentionUntil.setFullYear(retentionUntil.getFullYear() + stateMandatedYears);
    const purgeAt = new Date(retentionUntil);
    purgeAt.setFullYear(purgeAt.getFullYear() + 1); // 1yr grace after retention

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const [doc] = await db.insert(auditorDocumentSafe as any).values({
      auditorId,
      auditSessionId: auditSessionId ?? null,
      workspaceId: req.workspaceId || req.user?.workspaceId || null,
      documentType: documentType ?? 'audit_summary_pdf',
      label,
      storageKey: storageKey ?? null,
      downloadUrl: downloadUrl ?? null,
      stateMandatedYears,
      retentionRequiredUntil: retentionUntil,
      purgeAt,
      referenceNumber: refNum,
    }).returning();

    return res.status(201).json(doc);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE SCORE HISTORY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/compliance/score-history
 * Compliance score trend for the current org
 */
router.get('/compliance/score-history', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const { stateCode, limit = '30' } = req.query as Record<string, string>;

    const conditions = [eq(complianceScoreHistory.workspaceId, workspaceId!)];
    if (stateCode) conditions.push(eq(complianceScoreHistory.stateCode, stateCode));

    const history = await db.select().from(complianceScoreHistory)
      .where(and(...conditions))
      .orderBy(desc(complianceScoreHistory.scoredAt))
      .limit(Math.min(parseInt(limit), 365));

    return res.json(history);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * POST /api/compliance/score-history/record
 * Record a compliance score snapshot (triggered by compliance checks)
 */
router.post('/compliance/score-history/record', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    const {
      stateCode, overallScore, documentsScore, licensingScore,
      employeeComplianceScore, trainingScore, isCompliant, isFrozen,
      hasAppeal, activeFindings, pendingDocuments, approvedDocuments,
      triggerEvent, notes,
    } = req.body;

    if (!stateCode || overallScore === undefined) {
      return res.status(400).json({ error: 'stateCode and overallScore are required' });
    }

    const [entry] = await db.insert(complianceScoreHistory).values({
      workspaceId: workspaceId!,
      stateCode,
      overallScore: Math.min(100, Math.max(0, parseInt(overallScore))),
      documentsScore: documentsScore ?? 0,
      licensingScore: licensingScore ?? 0,
      employeeComplianceScore: employeeComplianceScore ?? 0,
      trainingScore: trainingScore ?? 0,
      isCompliant: isCompliant ?? false,
      isFrozen: isFrozen ?? false,
      hasAppeal: hasAppeal ?? false,
      activeFindings: activeFindings ?? 0,
      pendingDocuments: pendingDocuments ?? 0,
      approvedDocuments: approvedDocuments ?? 0,
      scoringMethod: 'automated',
      triggerEvent: triggerEvent ?? null,
      notes: notes ?? null,
    } as any).returning();

    return res.status(201).json(entry);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC COMPLIANCE REGISTRY ("CoAIleague Verified" badge)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/compliance/registry
 * Public registry of CoAIleague-verified organizations (no auth required)
 */
router.get('/compliance/registry', async (req: Request, res: Response) => {
  try {
    const { stateCode, city, q } = req.query as Record<string, string>;

    let query = db.select({
      id: complianceRegistryEntries.id,
      orgName: complianceRegistryEntries.orgName,
      orgLicenseNumber: complianceRegistryEntries.orgLicenseNumber,
      stateCode: complianceRegistryEntries.stateCode,
      stateName: complianceRegistryEntries.stateName,
      city: complianceRegistryEntries.city,
      county: complianceRegistryEntries.county,
      verifiedStatus: complianceRegistryEntries.verifiedStatus,
      lastVerifiedAt: complianceRegistryEntries.lastVerifiedAt,
      verificationBadge: complianceRegistryEntries.verificationBadge,
      certifications: complianceRegistryEntries.certifications,
      serviceTypes: complianceRegistryEntries.serviceTypes,
    }).from(complianceRegistryEntries)
      .where(eq(complianceRegistryEntries.isPubliclyVisible, true))
      .$dynamic();

    const results = await query.orderBy(desc(complianceRegistryEntries.lastVerifiedAt)).limit(100);

    // Filter client-side for simplicity (small dataset expected)
    let filtered = results;
    if (stateCode) filtered = filtered.filter(r => r.stateCode === stateCode);
    if (city) filtered = filtered.filter(r => r.city?.toLowerCase().includes(city.toLowerCase()));
    if (q) filtered = filtered.filter(r =>
      r.orgName.toLowerCase().includes(q.toLowerCase()) ||
      r.orgLicenseNumber?.toLowerCase().includes(q.toLowerCase())
    );

    return res.json(filtered);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * POST /api/compliance/registry/enroll
 * Org opts into the public compliance registry
 */
router.post('/compliance/registry/enroll', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const { orgLicenseNumber, stateCode, stateName, city, county, certifications, serviceTypes } = req.body;
    if (!stateCode || !stateName) return res.status(400).json({ error: 'stateCode and stateName are required' });

    // Get org name from workspace
    const [ws] = await db.select({ name: workspacesTable.name })
      .from(workspacesTable).where(eq(workspacesTable.id, workspaceId));

    // Upsert registry entry
    const existing = await db.select().from(complianceRegistryEntries)
      .where(and(
        eq(complianceRegistryEntries.workspaceId, workspaceId),
        eq(complianceRegistryEntries.stateCode, stateCode)
      ));

    if (existing.length > 0) {
      const [updated] = await db.update(complianceRegistryEntries).set({
        orgName: ws?.name ?? 'Organization',
        orgLicenseNumber: orgLicenseNumber ?? null,
        stateName,
        city: city ?? null,
        county: county ?? null,
        verifiedStatus: 'verified',
        lastVerifiedAt: new Date(),
        isPubliclyVisible: true,
        certifications: certifications ?? [],
        serviceTypes: serviceTypes ?? [],
        updatedAt: new Date(),
      } as any).where(eq(complianceRegistryEntries.id, existing[0].id)).returning();
      return res.json({ action: 'updated', entry: updated });
    }

    const [entry] = await db.insert(complianceRegistryEntries).values({
      workspaceId,
      orgName: ws?.name ?? 'Organization',
      orgLicenseNumber: orgLicenseNumber ?? null,
      stateCode,
      stateName,
      city: city ?? null,
      county: county ?? null,
      verifiedStatus: 'verified',
      isPubliclyVisible: true,
      certifications: certifications ?? [],
      serviceTypes: serviceTypes ?? [],
    } as any).returning();

    return res.status(201).json({ action: 'created', entry });
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// STATE LICENSE VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/compliance/license-verify
 * Request a guard card / state license verification
 */
router.post('/compliance/license-verify', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    const { licenseType, licenseNumber, stateCode, licenseHolderName, employeeId, verificationMethod = 'manual' } = req.body;

    if (!licenseType || !licenseNumber || !stateCode) {
      return res.status(400).json({ error: 'licenseType, licenseNumber, and stateCode are required' });
    }

    const refNum = `LIC-VER-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // Determine API endpoint and attempt verification
    const stateApiMap: Record<string, string> = {
      CA: 'https://www.bsis.ca.gov/verification',
      TX: 'https://www.dps.texas.gov/rsd/pspb/license_verification',
      FL: 'https://www.myfloridalicense.com/CheckDetail.asp',
      NY: 'https://www.dos.ny.gov/licensing/lookup.html',
      IL: 'https://verify.idfpr.com',
    };

    const apiEndpoint = stateApiMap[stateCode.toUpperCase()] ?? null;
    let status = 'pending';
    let isVerified: boolean | null = null;
    let rawApiResponse = null;

    // If manual verification or no API, create as pending for staff review
    if (verificationMethod === 'manual' || !apiEndpoint) {
      status = 'pending_manual';
    } else {
      // Placeholder: real API integration would go here
      // For now mark as pending_api until integration is wired
      status = 'pending_api';
    }

    const [verification] = await db.insert(stateLicenseVerifications as any).values({
      workspaceId: workspaceId!,
      employeeId: employeeId ?? null,
      userId: req.user?.id ?? null,
      requestedBy: req.user?.id ?? null,
      licenseType,
      licenseNumber,
      stateCode: stateCode.toUpperCase(),
      licenseHolderName: licenseHolderName ?? null,
      verificationMethod,
      verificationSource: apiEndpoint ? 'state_api' : 'manual',
      apiEndpoint,
      status,
      isVerified,
      rawApiResponse,
      referenceNumber: refNum,
    }).returning();

    return res.status(201).json(verification);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * GET /api/compliance/license-verify
 * List license verifications for this workspace
 */
router.get('/compliance/license-verify', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const { stateCode, status, employeeId } = req.query as Record<string, string>;

    const conditions: any[] = [eq((stateLicenseVerifications as any).workspaceId, workspaceId!)];
    if (stateCode) conditions.push(eq((stateLicenseVerifications as any).stateCode, stateCode));
    if (status) conditions.push(eq((stateLicenseVerifications as any).status, status));
    if (employeeId) conditions.push(eq((stateLicenseVerifications as any).employeeId, employeeId));

    const results = await db.select().from(stateLicenseVerifications as any)
      .where(and(...conditions))
      .orderBy(desc((stateLicenseVerifications as any).createdAt))
      .limit(200);

    return res.json(results);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * PATCH /api/compliance/license-verify/:id/manual-result
 * Staff records manual verification outcome
 */
router.patch('/compliance/license-verify/:id/manual-result', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: 'Manager access required to record license verification results' });
    }
    const { id } = req.params;
    const { isVerified, licenseExpiresAt, verificationNotes, rejectionReason } = req.body;

    const [updated] = await db.update(stateLicenseVerifications as any).set({
      isVerified: isVerified ?? null,
      status: isVerified ? 'verified' : 'rejected',
      verifiedAt: isVerified ? new Date() : null,
      licenseExpiresAt: licenseExpiresAt ? new Date(licenseExpiresAt) : null,
      verificationNotes: verificationNotes ?? null,
      rejectionReason: rejectionReason ?? null,
      updatedAt: new Date(),
    }).where(eq((stateLicenseVerifications as any).id, id)).returning();

    return res.json(updated);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-STATE COMPLIANCE WINDOWS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/compliance/states
 * List all state compliance windows for this workspace
 */
router.get('/compliance/states', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const windows = await db.select().from(multiStateComplianceWindows as any)
      .where(eq((multiStateComplianceWindows as any).workspaceId, workspaceId!))
      .orderBy((multiStateComplianceWindows as any).stateCode);
    return res.json(windows);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * POST /api/compliance/states
 * Open a new state compliance window (org operating in a new state)
 */
router.post('/compliance/states', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    const { stateCode, stateName, licenseNumber, licenseExpiresAt, requiredDocTypes } = req.body;

    if (!stateCode || !stateName) return res.status(400).json({ error: 'stateCode and stateName are required' });

    const windowDeadline = new Date();
    windowDeadline.setDate(windowDeadline.getDate() + 14);

    // Upsert on (workspaceId, stateCode)
    const existing = await db.select().from(multiStateComplianceWindows as any)
      .where(and(
        eq((multiStateComplianceWindows as any).workspaceId, workspaceId!),
        eq((multiStateComplianceWindows as any).stateCode, stateCode)
      ));

    if (existing.length > 0) {
      return res.status(409).json({ error: 'Compliance window for this state already exists', existing: existing[0] });
    }

    const [window] = await db.insert(multiStateComplianceWindows as any).values({
      workspaceId: workspaceId!,
      stateCode,
      stateName,
      licenseNumber: licenseNumber ?? null,
      licenseExpiresAt: licenseExpiresAt ? new Date(licenseExpiresAt) : null,
      windowDeadline,
      daysRemaining: 14,
      requiredDocTypes: requiredDocTypes ?? [],
      approvedDocTypes: [],
      pendingDocTypes: [],
      isCompliant: false,
      isFrozen: false,
    }).returning();

    return res.status(201).json(window);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * PATCH /api/compliance/states/:stateCode/status
 * Update compliance status for a specific state window
 */
router.patch('/compliance/states/:stateCode/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: 'Manager access required to update compliance state status' });
    }
    const workspaceId = req.workspaceId || req.user?.workspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const { stateCode } = req.params;
    const { approvedDocTypes, pendingDocTypes, isCompliant, isFrozen, complianceScore, notes } = req.body;

    const [existing] = await db.select().from(multiStateComplianceWindows as any)
      .where(and(
        eq((multiStateComplianceWindows as any).workspaceId, workspaceId!),
        eq((multiStateComplianceWindows as any).stateCode, stateCode)
      ));

    if (!existing) return res.status(404).json({ error: 'No compliance window found for this state' });

    const now = new Date();
    const deadline = new Date((existing as any).windowDeadline);
    const daysRemaining = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 86400000));

    const [updated] = await db.update(multiStateComplianceWindows as any).set({
      approvedDocTypes: approvedDocTypes ?? (existing as any).approvedDocTypes,
      pendingDocTypes: pendingDocTypes ?? (existing as any).pendingDocTypes,
      isCompliant: isCompliant ?? (existing as any).isCompliant,
      isFrozen: isFrozen ?? (existing as any).isFrozen,
      complianceScore: complianceScore ?? (existing as any).complianceScore,
      daysRemaining,
      lastCheckedAt: now,
      notes: notes ?? (existing as any).notes,
      updatedAt: now,
    }).where(eq((multiStateComplianceWindows as any).id, (existing as any).id)).returning();

    // Auto-record score history
    try {
      await db.insert(complianceScoreHistory).values({
        workspaceId: workspaceId!,
        stateCode,
        overallScore: complianceScore ?? (existing as any).complianceScore ?? 0,
        isCompliant: isCompliant ?? (existing as any).isCompliant ?? false,
        isFrozen: isFrozen ?? (existing as any).isFrozen ?? false,
        approvedDocuments: (approvedDocTypes ?? (existing as any).approvedDocTypes ?? []).length,
        pendingDocuments: (pendingDocTypes ?? (existing as any).pendingDocTypes ?? []).length,
        triggerEvent: 'state_status_update',
        scoringMethod: 'automated',
      } as any);
    } catch (_) { /* non-fatal */ }

    return res.json(updated);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT RETENTION LOG (admin + auditor view)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/compliance/retention-log
 * View document retention log entries for this workspace
 */
router.get('/compliance/retention-log', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const entries = await db.select().from(documentRetentionLog as any)
      .where(eq((documentRetentionLog as any).workspaceId, workspaceId!))
      .orderBy(desc((documentRetentionLog as any).createdAt))
      .limit(200);
    return res.json(entries);
  } catch (err: unknown) {
    return res.status(500).json({ error: sanitizeError(err) });
  }
});


export default router;
