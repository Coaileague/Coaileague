import { clients, shifts, sites, timeEntries } from '@shared/schema';
/**
 * Regulatory Auditor Portal Routes
 * ==================================
 * Public-facing API for the 6-step auditor verification flow,
 * auditor dashboard data (10 sections), and org compliance management.
 *
 * Public endpoints (no auth):
 *   POST /lookup          — Step 1: company lookup by license number
 *   POST /request         — Step 2: submit auditor credentials
 *   GET  /request/:id     — Check verification status
 *   POST /request/:id/dispute — Org owner disputes access
 *
 * Auditor-only endpoints (x-auditor-token required):
 *   GET  /dashboard/:workspaceId/overview       — Section 1
 *   GET  /dashboard/:workspaceId/insurance      — Section 2
 *   GET  /dashboard/:workspaceId/posting        — Section 3
 *   GET  /dashboard/:workspaceId/uniform        — Section 4
 *   GET  /dashboard/:workspaceId/vehicles       — Section 5
 *   GET  /dashboard/:workspaceId/officers       — Section 6
 *   GET  /dashboard/:workspaceId/violations     — Section 7
 *   GET  /dashboard/:workspaceId/shifts         — Section 8
 *   GET  /dashboard/:workspaceId/incidents      — Section 9
 *   GET  /dashboard/:workspaceId/documents      — Section 10
 *   POST /dashboard/:workspaceId/report         — Section 11 (audit report upload)
 *
 * Org-owner endpoints (standard auth):
 *   GET  /audit-readiness                       — Readiness score + checklist
 *   GET  /violations                            — Org's violation records
 *   GET  /violations/:id                        — Single violation
 *   GET  /officer-score/:employeeId             — Officer compliance score
 *   GET  /states                                — State knowledge base list
 *   GET  /states/:stateCode                     — Single state config
 */

import { sanitizeError } from '../../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { PLATFORM } from '../../config/platformConfig';
import crypto from 'crypto';
import multer from 'multer';
import { readLimiter } from '../../middleware/rateLimiter';
import { standardVirusScan } from '../../middleware/virusScan';
import { db } from '../../db';
import {
  workspaces,
  employees,
  trainingCertifications,
  complianceDocuments,
  auditorVerificationRequests,
  regulatoryViolations,
  complianceStates,
  incidentReports,
  auditorAccounts,
  employeeDocuments,
} from '@shared/schema';
import { eq, and, gte, lte, desc, sql, ilike, or } from 'drizzle-orm';
import { requireAuth } from '../../auth';
import { hasManagerAccess, hasPlatformWideAccess } from '../../rbac';
import { enforceAuditorSession } from '../../middleware/auditorGuard';
import { requirePlan, hasTierAccess, type SubscriptionTier } from '../../tierGuards';
import { cacheManager } from '../../services/platform/cacheManager';
import { calculateOfficerComplianceScore, calculateAuditReadinessScore } from '../../services/compliance/officerComplianceScoreService';
import { listRegulatoryViolations } from '../../services/compliance/regulatoryViolationService';
import { getStateConfig, verifyAuditorEmailDomain } from '../../services/compliance/stateRegulatoryKnowledgeBase';
import { createNotification } from '../../services/notificationService';
import { emailService } from '../../services/emailService';
import { NotificationDeliveryService } from '../../services/notificationDeliveryService';
import { uploadFileToObjectStorage } from '../../objectStorage';
import { universalAudit } from '../../services/universalAuditService';

const ALLOWED_DOC_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const ALLOWED_DOC_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx']);

const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_DOC_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error(`File type not allowed: ${file.mimetype}`), { code: 'LIMIT_FILE_TYPE' }));
    }
  },
});

const router = Router();

// Rate limit all portal routes — prevents bulk data scraping
router.use(readLimiter);

// ── Phase 30 Tier Enforcement ──────────────────────────────────────────────────
// Auditor dashboard routes verify the *audited workspace* is on Business+ tier.
// This prevents orgs on lower tiers from inadvertently exposing auditor portals.
router.use('/dashboard', async (req: any, res: any, next: any) => {
  try {
    // Extract workspaceId from path: /dashboard/:workspaceId/...
    const workspaceId = req.path.split('/').filter(Boolean)[0];
    if (!workspaceId) return res.status(400).json({ error: 'Workspace ID required in path' });

    const tierInfo = await cacheManager.getWorkspaceTierWithStatus(workspaceId);
    if (!tierInfo) return res.status(404).json({ error: 'Workspace not found' });

    if (!hasTierAccess(tierInfo.tier as SubscriptionTier, 'business')) {
      return res.status(403).json({
        error: 'TIER_UPGRADE_REQUIRED',
        currentTier: tierInfo.tier,
        requiredTier: 'business',
        upgradeUrl: '/billing/upgrade?tier=business',
        message: 'The SRA regulatory auditor portal requires the Business plan or higher.',
      });
    }
    next();
  } catch (err) {
    next(err);
  }
});

if (!process.env.SESSION_SECRET) {
  throw new Error('[Regulatory Portal] SESSION_SECRET env var is required for auditor token HMAC signing. Server cannot start without it.');
}
const AUDITOR_SECRET = process.env.SESSION_SECRET;

function issueAuditorPortalToken(accountId: string, workspaceId: string): string {
  const expires = Date.now() + 14 * 24 * 60 * 60 * 1000;
  const payload = `${accountId}:${workspaceId}:${expires}`;
  const sig = crypto.createHmac('sha256', AUDITOR_SECRET).update(payload).digest('hex').slice(0, 16);
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

function verifyAuditorPortalToken(token: string): { accountId: string; workspaceId: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 4) return null;
    const [accountId, workspaceId, expiresStr, sig] = parts;
    if (Date.now() > parseInt(expiresStr, 10)) return null;
    const payload = `${accountId}:${workspaceId}:${expiresStr}`;
    const expected = crypto.createHmac('sha256', AUDITOR_SECRET).update(payload).digest('hex').slice(0, 16);
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return { accountId, workspaceId };
  } catch { return null; }
}

/**
 * Per-section auditor access logger.
 * Called after successful auth — writes to audit_logs with actor, workspace, section, IP, and timestamp.
 */
async function logAuditorSectionAccess(req: Request, workspaceId: string, section: string): Promise<void> {
  try {
    const auditorId = req.auditorAccountId || 'unknown';
    const ip = (req.ip || req.socket?.remoteAddress || 'unknown').substring(0, 45);
    const ua = (req.headers['user-agent'] || '').substring(0, 255);
    await universalAudit.log({
      workspaceId,
      actorId: auditorId,
      actorType: 'user', // Auditor is a user in the portal context
      action: 'auditor_portal_section_viewed',
      entityType: 'auditor_portal',
      entityId: section,
      changeType: 'read',
      metadata: { auditorAccountId: auditorId, section, workspaceId, source: 'auditor_portal' },
      actorIp: ip,
    });
  } catch (err) {
    log.warn('[AuditorPortal] Audit log write failed (non-fatal):', (err as any)?.message);
  }
}

async function requireAuditorPortalAuth(req: Request, res: Response, next: Function) {
  const raw = req.headers['x-auditor-portal-token'] as string
    || (req.headers.authorization || '').replace('Bearer ', '');
  if (!raw) return res.status(401).json({ success: false, error: 'Auditor portal token required' });
  const parsed = verifyAuditorPortalToken(raw);
  if (!parsed) return res.status(401).json({ success: false, error: 'Invalid or expired auditor token' });
  req.auditorAccountId = parsed.accountId;
  req.auditorWorkspaceId = parsed.workspaceId;
  // Wrap next() to log access after successful auth
  const loggingNext = async () => {
    const workspaceId = parsed.workspaceId;
    const section = req.path.split('/').filter(Boolean).pop() || 'unknown';
    await logAuditorSectionAccess(req, workspaceId, section);
    next();
  };
  await enforceAuditorSession(req, res, loggingNext);
}

function requireManagerRole(req: Request, res: Response, next: Function) {
  const workspaceRole = req.workspaceRole;
  const platformRole = req.platformRole;
  if (hasPlatformWideAccess(platformRole) || hasManagerAccess(workspaceRole)) return next();
  return res.status(403).json({ success: false, error: 'Manager or higher access required' });
}

// ── PUBLIC: Step 1 — Company lookup ─────────────────────────────────────────

router.post('/lookup', async (req: Request, res: Response) => {
  try {
    const { licenseNumber } = req.body;
    if (!licenseNumber?.trim()) {
      return res.status(400).json({ success: false, error: 'License number is required' });
    }

    const [workspace] = await db.select({
      id: workspaces.id,
      name: workspaces.name,
      stateLicenseState: workspaces.stateLicenseState,
      stateLicenseNumber: workspaces.stateLicenseNumber,
    }).from(workspaces)
      .where(ilike(workspaces.stateLicenseNumber, licenseNumber.trim()))
      .limit(1);

    if (!workspace) {
      return res.json({ success: true, found: false, message: 'No organization found with that license number. Please verify the number and try again.' });
    }

    return res.json({
      success: true,
      found: true,
      company: {
        name: workspace.name,
        stateCode: workspace.stateLicenseState,
        licenseNumber: workspace.stateLicenseNumber,
      },
    });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Lookup failed' });
  }
});

// ── PUBLIC: Step 2 — Submit auditor credentials ──────────────────────────────

router.post('/request', async (req: Request, res: Response) => {
  try {
    const {
      licenseNumber, auditorFullName, auditorAgencyName, auditorEmail,
      auditorBadgeNumber, auditPurpose, authorizationDocUrl,
    } = req.body;

    if (!licenseNumber || !auditorFullName || !auditorAgencyName || !auditorEmail || !auditorBadgeNumber || !auditPurpose) {
      return res.status(400).json({ success: false, error: 'All credential fields are required' });
    }

    const [workspace] = await db.select({
      id: workspaces.id,
      name: workspaces.name,
      stateLicenseState: workspaces.stateLicenseState,
    }).from(workspaces).where(ilike(workspaces.stateLicenseNumber, licenseNumber)).limit(1);

    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }

    const stateCode = workspace.stateLicenseState ?? '';

    // Step 3 — Domain verification
    const emailDomainVerified = verifyAuditorEmailDomain(auditorEmail, stateCode);
    const stateConfig = await getStateConfig(stateCode);

    const verificationNotes: string[] = [];
    if (!emailDomainVerified) {
      verificationNotes.push(
        stateConfig
          ? `Email domain does not match ${stateConfig.regulatoryBody} (expected ${stateConfig.auditorEmailDomain})`
          : `Email domain could not be verified — state ${stateCode} requires manual verification`,
      );
    }

    const status = emailDomainVerified ? 'verified_pending' : 'domain_mismatch';
    const accessExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const [request] = await db.insert(auditorVerificationRequests).values({
      workspaceId: workspace.id,
      companyLicenseNumber: licenseNumber,
      auditorFullName,
      auditorAgencyName,
      auditorEmail,
      auditorBadgeNumber,
      auditPurpose,
      authorizationDocUrl,
      emailDomainVerified,
      verificationNotes: verificationNotes.join('\n'),
      status,
      stateCode,
      accessExpiresAt,
    }).returning({ id: auditorVerificationRequests.id });

    if (emailDomainVerified) {
      // Step 4 — Notify org_owner (they have 24h to dispute)
      await notifyOrgOwnerOfAuditRequest(workspace.id, workspace.name, {
        requestId: request.id,
        auditorFullName,
        auditorAgencyName,
        auditorEmail,
        auditPurpose,
        stateCode,
      }).catch ((err: unknown) => {
        log.warn('[RegulatoryPortal] Owner notification email failed (non-fatal):', (err as any)?.message);
      });

      await db.update(auditorVerificationRequests)
        .set({ ownerNotifiedAt: new Date() })
        .where(eq(auditorVerificationRequests.id, request.id));

      // Schedule auto-grant after 24 hours (lightweight: cron picks it up)
    }

    return res.json({
      success: true,
      requestId: request.id,
      status,
      emailDomainVerified,
      message: emailDomainVerified
        ? 'Credentials verified. The organization owner has been notified and has 24 hours to dispute. Access will be granted automatically if no dispute is received.'
        : `Email domain verification failed. ${verificationNotes.join(' ')} Please contact your agency IT for a corrected email address or contact ${PLATFORM.name} platform support.`,
    });
  } catch (err: unknown) {
    log.error('[RegulatoryPortal] request error:', err);
    return res.status(500).json({ success: false, error: 'Request submission failed' });
  }
});

// ── PUBLIC: Check verification status ────────────────────────────────────────

router.get('/request/:id/status', async (req: Request, res: Response) => {
  try {
    const [request] = await db.select({
      id: auditorVerificationRequests.id,
      status: auditorVerificationRequests.status,
      emailDomainVerified: auditorVerificationRequests.emailDomainVerified,
      verificationNotes: auditorVerificationRequests.verificationNotes,
      ownerNotifiedAt: auditorVerificationRequests.ownerNotifiedAt,
      accessGrantedAt: auditorVerificationRequests.accessGrantedAt,
      ownerDisputedAt: auditorVerificationRequests.ownerDisputedAt,
    }).from(auditorVerificationRequests).where(eq(auditorVerificationRequests.id, req.params.id)).limit(1);

    if (!request) return res.status(404).json({ success: false, error: 'Request not found' });

    return res.json({ success: true, request });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Status check failed' });
  }
});

// ── ORG OWNER: Dispute auditor access request ────────────────────────────────

router.post('/request/:id/dispute', requireAuth, async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const actor = req.user;
    const actorWorkspaceId = req.workspaceId || (actor as any)?.workspaceId || actor?.currentWorkspaceId;
    if (!actorWorkspaceId) return res.status(400).json({ success: false, error: 'Workspace context required' });

    const [request] = await db.select().from(auditorVerificationRequests)
      .where(and(
        eq(auditorVerificationRequests.id, req.params.id),
        eq(auditorVerificationRequests.workspaceId, actorWorkspaceId),
      )).limit(1);

    if (!request) return res.status(404).json({ success: false, error: 'Request not found' });

    if (request.accessExpiresAt && new Date() > new Date(request.accessExpiresAt)) {
      return res.status(410).json({ success: false, error: 'Verification request has expired' });
    }

    await db.update(auditorVerificationRequests).set({
      ownerDisputedAt: new Date(),
      ownerDisputeReason: reason || 'No reason provided',
      status: 'disputed',
    }).where(and(
      eq(auditorVerificationRequests.id, req.params.id),
      eq(auditorVerificationRequests.workspaceId, actorWorkspaceId),
    ));

    return res.json({ success: true, message: `Dispute submitted. ${PLATFORM.name} platform staff will review within 1 business day.` });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Dispute submission failed' });
  }
});

// ── INTERNAL: Grant auditor access (called by cron after 24h) ───────────────

router.post('/request/:id/grant', requireAuth, async (req: Request, res: Response) => {
  try {
    // Only platform-wide admins (cron or internal staff) may grant auditor access.
    const platformRole = req.platformRole || req.user?.platformRole || undefined;
    if (!hasPlatformWideAccess(platformRole)) {
      return res.status(403).json({ success: false, error: 'Platform admin access required' });
    }
    const [request] = await db.select().from(auditorVerificationRequests)
      .where(and(
        eq(auditorVerificationRequests.id, req.params.id),
        eq(auditorVerificationRequests.status, 'verified_pending'),
      )).limit(1);

    if (!request) return res.status(404).json({ success: false, error: 'Request not found or not in verified_pending state' });

    // ── Phase 30: verify the workspace being audited is on Business+ tier ──────
    const auditedTierInfo = await cacheManager.getWorkspaceTierWithStatus(request.workspaceId);
    if (!auditedTierInfo || !hasTierAccess(auditedTierInfo.tier as SubscriptionTier, 'business')) {
      return res.status(403).json({
        success: false,
        error: 'TIER_UPGRADE_REQUIRED',
        currentTier: auditedTierInfo?.tier ?? 'unknown',
        requiredTier: 'business',
        upgradeUrl: '/billing/upgrade?tier=business',
        message: 'The SRA regulatory auditor portal requires the audited organization to be on the Business plan or higher.',
      });
    }

    const notifiedAt = request.ownerNotifiedAt;
    if (notifiedAt && Date.now() - new Date(notifiedAt).getTime() < 24 * 60 * 60 * 1000) {
      return res.status(400).json({ success: false, error: '24-hour dispute window has not elapsed yet' });
    }

    // Create or update auditor account
    const tempPassword = crypto.randomBytes(12).toString('base64').slice(0, 16);
    const passwordHash = crypto.createHash('sha256').update(tempPassword + AUDITOR_SECRET).digest('hex');
    const accessToken = issueAuditorPortalToken(
      request.id,
      request.workspaceId,
    );

    await db.update(auditorVerificationRequests).set({
      status: 'access_granted',
      accessGrantedAt: new Date(),
      tempPasswordSentAt: new Date(),
      auditorAccountId: request.id,
    }).where(eq(auditorVerificationRequests.id, request.id));

    // Send credentials to auditor — tracked through NDS for retry on failure
    const _wsName = (await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, request.workspaceId)).limit(1))[0]?.name;
    const _auditGrantHtml = `
        <div style="font-family:sans-serif;max-width:640px;margin:0 auto">
          <div style="background:#0f172a;padding:24px;border-radius:8px 8px 0 0">
            <h1 style="color:#ffc83c;margin:0;font-size:20px">Audit Access Granted</h1>
          </div>
          <div style="background:#1e293b;padding:24px;color:#e2e8f0;border-radius:0 0 8px 8px">
            <p>Your request to audit <strong>${_wsName}</strong> has been approved.</p>
            <p><strong>Your portal token:</strong></p>
            <div style="background:#0f172a;padding:16px;border-radius:4px;font-family:monospace;font-size:12px;word-break:break-all;color:#ffc83c">${accessToken}</div>
            <p style="margin-top:16px">Use this token in the <code>x-auditor-portal-token</code> header or as a Bearer token to access the Regulatory Compliance Dashboard.</p>
            <p>Access expires: <strong>${request.accessExpiresAt?.toLocaleDateString()}</strong></p>
            <p style="font-size:12px;color:#64748b">Navigate to your platform's regulatory portal to begin your audit review.</p>
          </div>
        </div>`;
    await NotificationDeliveryService.send({ idempotencyKey: `notif-${Date.now()}`,
            type: 'regulatory_notification', workspaceId: request.workspaceId, recipientUserId: request.auditorEmail!, channel: 'email', body: { to: request.auditorEmail!, subject: `${PLATFORM.name} Regulatory Portal — Audit Access Granted`, html: _auditGrantHtml } })
      .catch((err: unknown) => {
        log.warn('[RegulatoryPortal] Credentials email to auditor failed:', (err as any)?.message);
      });

    return res.json({ success: true, message: 'Access granted and credentials sent', accessToken });
  } catch (err: unknown) {
    log.error('[RegulatoryPortal] grant error:', err);
    return res.status(500).json({ success: false, error: 'Grant failed' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// AUDITOR DASHBOARD — 10 Sections (read-only, auditor token required)
// ════════════════════════════════════════════════════════════════════════════

// Section 1 — Company Overview
router.get('/dashboard/:workspaceId/overview', requireAuditorPortalAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const auditorWorkspaceId = req.auditorWorkspaceId;
    if (auditorWorkspaceId !== workspaceId) {
      return res.status(403).json({ success: false, error: 'Access denied — not scoped to this organization' });
    }

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (!ws) return res.status(404).json({ success: false, error: 'Organization not found' });

    // CATEGORY C — Raw SQL retained: GROUP BY | Tables: employees | Verified: 2026-03-23
    const activeEmpCount = await typedCount(sql`
      SELECT COUNT(*) AS total, worker_type
      FROM employees WHERE workspace_id = ${workspaceId} AND status = 'active'
      GROUP BY worker_type
    `);

    // CATEGORY C — Raw SQL retained: Count( | Tables: clients | Verified: 2026-03-23
    const clientCount = await typedCount(sql`
      SELECT COUNT(*) AS count FROM clients WHERE workspace_id = ${workspaceId} AND status = 'active'
    `);

    // CATEGORY C — Raw SQL retained: Count( | Tables: sites | Verified: 2026-03-23
    const siteCount = await typedCount(sql`
      SELECT COUNT(*) AS count FROM sites WHERE workspace_id = ${workspaceId} AND is_active = true
    `);

    const readinessData = await calculateAuditReadinessScore(workspaceId).catch(() => null);

    return res.json({
      success: true,
      data: {
        legalName: ws.name,
        stateLicenseNumber: ws.stateLicenseNumber,
        stateLicenseState: ws.stateLicenseState,
        stateLicenseExpiry: ws.stateLicenseExpiry,
        registeredOn: ws.createdAt,
        employeeBreakdown: ((activeEmpCount as any).rows || (activeEmpCount as any)) ?? [],
        activeClients: Number(((clientCount as any).rows || (clientCount as any))?.[0]?.count ?? 0),
        activeSites: Number(((siteCount as any).rows || (siteCount as any))?.[0]?.count ?? 0),
        auditReadinessScore: readinessData?.score ?? 0,
        overallComplianceScore: readinessData?.score ?? 0,
      },
    });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Failed to load company overview' });
  }
});

// Section 2 — Insurance Documentation
router.get('/dashboard/:workspaceId/insurance', requireAuditorPortalAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    if (req.auditorWorkspaceId !== workspaceId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const insuranceDocs = await db.select().from(complianceDocuments)
      .where(and(
        eq(complianceDocuments.workspaceId, workspaceId),
        or(
          ilike(complianceDocuments.documentTypeId, '%insurance%'),
          ilike(complianceDocuments.documentTypeId, '%liability%'),
          ilike(complianceDocuments.documentTypeId, '%workers_comp%'),
        ),
      ));

    const [ws] = await db.select({ stateLicenseState: workspaces.stateLicenseState })
      .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);

    const stateConfig = ws?.stateLicenseState ? await getStateConfig(ws.stateLicenseState) : null;

    return res.json({
      success: true,
      data: {
        insuranceDocuments: insuranceDocs,
        stateMinimumCoverage: stateConfig?.minimumInsuranceCoverage ?? [],
      },
    });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Failed to load insurance documentation' });
  }
});

// Section 3 — Labor Law Posters
router.get('/dashboard/:workspaceId/posting', requireAuditorPortalAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    if (req.auditorWorkspaceId !== workspaceId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const [posterDoc] = await db.select().from(complianceDocuments)
      .where(and(
        eq(complianceDocuments.workspaceId, workspaceId),
        eq(complianceDocuments.documentTypeId, 'labor_law_posters_photo'),
      )).orderBy(desc(complianceDocuments.createdAt)).limit(1);

    return res.json({
      success: true,
      data: {
        document: posterDoc ?? null,
        status: posterDoc ? (posterDoc.status === 'approved' ? 'compliant' : 'pending_review') : 'missing',
        uploadedAt: posterDoc?.createdAt ?? null,
        requiredPosters: [
          'Fair Labor Standards Act (FLSA)',
          'Family and Medical Leave Act (FMLA)',
          'Equal Employment Opportunity',
          'Occupational Safety and Health (OSHA)',
          'National Labor Relations Act (NLRA)',
        ],
      },
    });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Failed to load posting compliance' });
  }
});

// Section 4 — Uniform Compliance
router.get('/dashboard/:workspaceId/uniform', requireAuditorPortalAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    if (req.auditorWorkspaceId !== workspaceId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const [uniformDoc] = await db.select().from(complianceDocuments)
      .where(and(
        eq(complianceDocuments.workspaceId, workspaceId),
        eq(complianceDocuments.documentTypeId, 'uniform_compliance_photo'),
      )).orderBy(desc(complianceDocuments.createdAt)).limit(1);

    const [ws] = await db.select({ stateLicenseState: workspaces.stateLicenseState })
      .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    const stateConfig = ws?.stateLicenseState ? await getStateConfig(ws.stateLicenseState) : null;

    return res.json({
      success: true,
      data: {
        document: uniformDoc ?? null,
        status: uniformDoc ? (uniformDoc.status === 'approved' ? 'compliant' : 'pending_review') : 'missing',
        uploadedAt: uniformDoc?.createdAt ?? null,
        stateRequirement: stateConfig?.uniformRequirement ?? 'Must display SECURITY and company name. Must not resemble law enforcement.',
      },
    });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Failed to load uniform compliance' });
  }
});

// Section 5 — Patrol Vehicles
router.get('/dashboard/:workspaceId/vehicles', requireAuditorPortalAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    if (req.auditorWorkspaceId !== workspaceId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const vehicleDocs = await db.select().from(complianceDocuments)
      .where(and(
        eq(complianceDocuments.workspaceId, workspaceId),
        or(
          eq(complianceDocuments.documentTypeId, 'patrol_vehicle_photos'),
          eq(complianceDocuments.documentTypeId, 'patrol_vehicle_not_applicable'),
        ),
      )).orderBy(desc(complianceDocuments.createdAt));

    const [ws] = await db.select({ stateLicenseState: workspaces.stateLicenseState })
      .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    const stateConfig = ws?.stateLicenseState ? await getStateConfig(ws.stateLicenseState) : null;

    const notApplicable = vehicleDocs.some((d) => d.documentTypeId === 'patrol_vehicle_not_applicable');
    const vehiclePhotos = vehicleDocs.filter((d) => d.documentTypeId === 'patrol_vehicle_photos');

    return res.json({
      success: true,
      data: {
        notApplicable,
        vehiclePhotos,
        stateRequirement: stateConfig?.vehicleMarkingRequirement ?? 'Vehicle markings must include SECURITY and company name.',
      },
    });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Failed to load vehicle documentation' });
  }
});

// Section 6 — Full Officer Roster with compliance details
router.get('/dashboard/:workspaceId/officers', requireAuditorPortalAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    if (req.auditorWorkspaceId !== workspaceId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const officerList = await db.select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
      dateOfBirth: employees.dateOfBirth,
      placeOfBirth: employees.placeOfBirth,
      address: employees.address,
      addressLine2: employees.addressLine2,
      city: employees.city,
      state: employees.state,
      zipCode: employees.zipCode,
      phone: employees.phone,
      emergencyContactName: employees.emergencyContactName,
      emergencyContactPhone: employees.emergencyContactPhone,
      emergencyContactRelation: employees.emergencyContactRelation,
      workerType: employees.workerType,
      is1099Eligible: employees.is1099Eligible,
      hireDate: employees.hireDate,
      position: employees.position,
      role: employees.role,
      status: employees.status,
      isArmed: employees.isArmed,
      guardCardVerified: employees.guardCardVerified,
      armedLicenseVerified: employees.armedLicenseVerified,
      onboardingStatus: employees.onboardingStatus,
    }).from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.status, 'active'),
      ));

    const officerScores = await Promise.all(
      officerList.map(async (officer) => {
        const score = await calculateOfficerComplianceScore(officer.id, workspaceId).catch(() => null);
        const certs = await db.select().from(trainingCertifications)
          .where(and(
            eq(trainingCertifications.employeeId, officer.id),
            eq(trainingCertifications.workspaceId, workspaceId),
          ));
        const docs = await db.select().from(complianceDocuments)
          .where(and(
            eq(complianceDocuments.employeeId, officer.id),
            eq(complianceDocuments.workspaceId, workspaceId),
          ));
        return {
          ...officer,
          complianceScore: score,
          certifications: certs,
          documents: docs,
        };
      }),
    );

    return res.json({ success: true, data: { officers: officerScores, total: officerScores.length } });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Failed to load officer roster' });
  }
});

// Section 7 — Violation Records (WORM-locked, always visible)
router.get('/dashboard/:workspaceId/violations', requireAuditorPortalAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    if (req.auditorWorkspaceId !== workspaceId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { from, to } = req.query;
    const violations = await listRegulatoryViolations(workspaceId, {
      from: from ? new Date(from as string) : undefined,
      to: to ? new Date(to as string) : undefined,
    });

    return res.json({ success: true, data: { violations, total: violations.length } });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Failed to load violations' });
  }
});

// Section 8 — Shift and Assignment Records
router.get('/dashboard/:workspaceId/shifts', requireAuditorPortalAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    if (req.auditorWorkspaceId !== workspaceId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { from, to, employeeId, siteId, page = '1', limit = '50' } = req.query;
    const safeLimit = Math.min(Math.max(1, parseInt(limit as string) || 50), 200);
    const safePage = Math.max(1, parseInt(page as string) || 1);
    const offset = (safePage - 1) * safeLimit;

    const conditions = [sql`s.workspace_id = ${workspaceId}`];
    if (from) conditions.push(sql`s.start_time >= ${from}`);
    if (to) conditions.push(sql`s.start_time <= ${to}`);
    if (employeeId) conditions.push(sql`s.employee_id = ${employeeId}`);
    if (siteId) conditions.push(sql`s.site_id = ${siteId}`);

    // Converted to Drizzle ORM: LEFT JOIN → db.leftJoin()
    const shiftsRows = await db.select({
      id: shifts.id,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      status: shifts.status,
      officerName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
      siteName: sites.name,
      clientName: sql<string>`COALESCE(${clients.companyName}, ${clients.firstName} || ' ' || ${clients.lastName}, 'Unknown')`,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
      gpsVerificationStatus: timeEntries.gpsVerificationStatus,
      totalHours: timeEntries.totalHours
    })
      .from(shifts)
      .leftJoin(employees, eq(employees.id, shifts.employeeId))
      .leftJoin(sites, eq(sites.id, shifts.siteId))
      .leftJoin(clients, eq(clients.id, shifts.clientId))
      .leftJoin(timeEntries, eq(timeEntries.shiftId, shifts.id))
      .where(eq(shifts.workspaceId, workspaceId))
      .orderBy(desc(shifts.startTime))
      .limit(safeLimit)
      .offset(offset);

    return res.json({ success: true, data: { shifts: shiftsRows } });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Failed to load shift records' });
  }
});

// Section 9 — Incident Reports
router.get('/dashboard/:workspaceId/incidents', requireAuditorPortalAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    if (req.auditorWorkspaceId !== workspaceId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const incidents = await db.select().from(incidentReports)
      .where(eq(incidentReports.workspaceId, workspaceId))
      .orderBy(desc(incidentReports.reportedBy));

    return res.json({ success: true, data: { incidents, total: incidents.length } });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Failed to load incident reports' });
  }
});

// Section 10 — Document Safe (compliance documents, no financial data)
router.get('/dashboard/:workspaceId/documents', requireAuditorPortalAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    if (req.auditorWorkspaceId !== workspaceId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Excluded categories — financial data must never surface to auditors
    const excludedTypes = [
      'payroll', 'invoice', 'billing', 'pay_stub', 'pay_rate', 'wage',
      'tax_return', 'bank_statement', 'credit', 'revenue',
    ];

    const documents = await db.select({
      id: complianceDocuments.id,
      documentType: complianceDocuments.documentTypeId,
      documentTitle: (complianceDocuments as any).documentTitle,
      status: complianceDocuments.status,
      fileUrl: (complianceDocuments as any).fileUrl,
      employeeId: complianceDocuments.employeeId,
      createdAt: complianceDocuments.createdAt,
      expirationDate: complianceDocuments.expirationDate,
    }).from(complianceDocuments)
      .where(and(
        eq(complianceDocuments.workspaceId, workspaceId),
        sql`document_type NOT ILIKE ANY(ARRAY[${sql.join(excludedTypes.map((t) => sql`${'%' + t + '%'}`), sql`,`)}])`,
      ))
      .orderBy(desc(complianceDocuments.createdAt));

    return res.json({ success: true, data: { documents, total: documents.length } });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Failed to load document safe' });
  }
});

// Section 11 — Audit Report Upload + Trinity corrective action plan
router.post('/dashboard/:workspaceId/report', requireAuditorPortalAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    if (req.auditorWorkspaceId !== workspaceId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { reportUrl, auditOutcome, findings, correctiveActions } = req.body;

    const requestId = req.auditorAccountId;
    if (!requestId) {
      return res.status(400).json({ success: false, error: 'Auditor account context missing' });
    }
    await db.update(auditorVerificationRequests).set({
      auditReportUrl: reportUrl,
      auditReportUploadedAt: new Date(),
      trinityCorrectiveActionPlan: correctiveActions ? JSON.stringify(correctiveActions) : null,
      correctiveActionSentAt: new Date(),
    }).where(eq(auditorVerificationRequests.id, requestId));

    // Notify org_owner
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: users, workspace_users | Verified: 2026-03-23
    const ownerResult = await typedQuery(sql`
      SELECT u.id, u.email FROM users u
      JOIN workspace_users wu ON wu.user_id = u.id
      WHERE wu.workspace_id = ${workspaceId} AND wu.role = 'org_owner'
      LIMIT 1
    `);
    const owner = ((ownerResult as any).rows || (ownerResult as any))?.[0];

    if (owner) {
      await createNotification({
        workspaceId,
        userId: owner.id,
        type: 'audit_report_uploaded',
        title: 'Regulatory Audit Report Uploaded',
        message: `Your regulatory audit has been completed. Outcome: ${auditOutcome ?? 'See report'}. Trinity has generated a corrective action plan for you.`,
        metadata: { reportUrl, auditOutcome, requestId },
        idempotencyKey: `audit_report_uploaded-${Date.now()}-${owner.id}`
      }).catch ((err: unknown) => {
        log.warn('[RegulatoryPortal] In-app audit report notification failed (non-fatal):', (err as any)?.message);
      });
    }

    return res.json({
      success: true,
      message: 'Audit report recorded. Corrective action plan generated and org owner notified.',
    });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Failed to process audit report' });
  }
});

// ── ORG-FACING: Audit readiness + violations + officer scores ─────────────────

router.get('/audit-readiness', requireAuth, requirePlan('business'), async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const result = await calculateAuditReadinessScore(workspaceId);
    return res.json({ success: true, data: result });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Readiness calculation failed' });
  }
});

// ── Company document upload (org_owner / manager uploads compliance docs) ──
router.post(
  '/upload-document',
  requireAuth,
  docUpload.single('file'),
  standardVirusScan,
  async (req: Request, res: Response) => {
    try {
      const workspaceId = req.workspaceId;
      const userId = req.user?.id;
      const userEmail = req.user?.email;
      const userRole = (req.user)?.workspaceRole || req.workspaceRole;

      const { docKey, docLabel } = req.body as { docKey?: string; docLabel?: string };
      if (!docKey) return res.status(400).json({ success: false, error: 'docKey is required' });
      if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

      const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (!bucketId) return res.status(500).json({ success: false, error: 'Object storage not configured' });

      const ext = (req.file.originalname.split('.').pop() ?? 'bin').toLowerCase();
      if (!ALLOWED_DOC_EXTENSIONS.has(ext)) {
        return res.status(400).json({ success: false, error: 'File extension not allowed' });
      }
      const objectName = `.private/compliance/${workspaceId}/company/${docKey}-${crypto.randomUUID()}.${ext}`;
      const fileUrl = `gs://${bucketId}/${objectName}`;

      // STORAGE QUOTA CHECK: Enforce documents quota before writing (audit_reserve is always allowed)
      const { checkCategoryQuota, recordStorageUsage } = await import('../../services/storage/storageQuotaService');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const quotaCheck = await checkCategoryQuota(workspaceId, 'documents', req.file.buffer.length);
      if (!quotaCheck.allowed) {
        return res.status(507).json({
          success: false,
          error: `Document storage quota exceeded. Used: ${Math.round(quotaCheck.usedBytes / 1048576)}MB of ${Math.round(quotaCheck.limitBytes / 1048576)}MB.`,
          code: 'STORAGE_QUOTA_EXCEEDED',
        });
      }

      await uploadFileToObjectStorage({
        objectPath: objectName,
        buffer: req.file.buffer,
        metadata: { contentType: req.file.mimetype },
      });

      // Record usage AFTER successful upload — never skipped
      // @ts-expect-error — TS migration: fix in refactoring sprint
      recordStorageUsage(workspaceId, 'documents', req.file.buffer.length).catch(() => null);

      const existing = await db
        .select({ id: employeeDocuments.id })
        .from(employeeDocuments)
        .where(and(
          // @ts-expect-error — TS migration: fix in refactoring sprint
          eq(employeeDocuments.workspaceId, workspaceId),
          eq(employeeDocuments.employeeId, 'company'),
          eq(employeeDocuments.documentType, docKey as any),
        ))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(employeeDocuments)
          .set({
            fileUrl,
            fileSize: req.file.size,
            fileType: req.file.mimetype,
            originalFileName: req.file.originalname,
            uploadedBy: userId,
            uploadedByEmail: userEmail,
            uploadedByRole: userRole,
            uploadedAt: new Date(),
            uploadIpAddress: req.ip ?? '0.0.0.0',
            uploadUserAgent: req.get('user-agent') ?? '',
          })
          .where(eq(employeeDocuments.id, existing[0].id));
      } else {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await db.insert(employeeDocuments).values({
          id: crypto.randomUUID(),
          workspaceId,
          employeeId: 'company',
          documentType: docKey as any,
          documentName: docLabel || docKey,
          fileUrl,
          fileSize: req.file.size,
          fileType: req.file.mimetype,
          originalFileName: req.file.originalname,
          uploadedBy: userId,
          uploadedByEmail: userEmail,
          uploadedByRole: userRole,
          uploadedAt: new Date(),
          uploadIpAddress: req.ip ?? '0.0.0.0',
          uploadUserAgent: req.get('user-agent') ?? '',
        });
      }

      return res.json({ success: true, message: 'Document uploaded successfully', fileUrl });
    } catch (err: unknown) {
      log.error('[upload-document]', err);
      return res.status(500).json({ success: false, error: 'Upload failed: ' + sanitizeError(err) });
    }
  },
);

router.get('/violations', requireAuth, requireManagerRole, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const violations = await listRegulatoryViolations(workspaceId);
    return res.json({ success: true, data: violations });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Failed to load violations' });
  }
});

router.get('/officer-score/:employeeId', requireAuth, requireManagerRole, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const score = await calculateOfficerComplianceScore(req.params.employeeId, workspaceId);
    return res.json({ success: true, data: score });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Score calculation failed' });
  }
});

router.get('/states', async (_req: Request, res: Response) => {
  try {
    const states = await db.select({
      stateCode: complianceStates.stateCode,
      stateName: complianceStates.stateName,
      regulatoryBody: complianceStates.regulatoryBody,
      auditorEmailDomain: (complianceStates as any).auditorEmailDomain,
      fallbackToManualVerification: (complianceStates as any).fallbackToManualVerification,
    }).from(complianceStates).where(eq(complianceStates.status, 'active'));

    return res.json({ success: true, data: states });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Failed to load states' });
  }
});

router.get('/states/:stateCode', async (req: Request, res: Response) => {
  try {
    const config = await getStateConfig(req.params.stateCode.toUpperCase());
    if (!config) return res.status(404).json({ success: false, error: 'State not found' });
    return res.json({ success: true, data: config });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Failed to load state config' });
  }
});

router.get('/states/:stateCode/workers-comp', async (req: Request, res: Response) => {
  try {
    const { getWorkersCompRequirement } = await import('../../services/compliance/stateComplianceConfig');
    const result = getWorkersCompRequirement(req.params.stateCode);
    return res.json({ success: true, data: result });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Failed to check workers comp requirement' });
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────

async function notifyOrgOwnerOfAuditRequest(
  workspaceId: string,
  orgName: string,
  info: {
    requestId: string;
    auditorFullName: string;
    auditorAgencyName: string;
    auditorEmail: string;
    auditPurpose: string;
    stateCode: string;
  },
) {
  // CATEGORY C — Raw SQL retained: LIMIT | Tables: users, workspace_users | Verified: 2026-03-23
  const ownerResult = await typedQuery(sql`
    SELECT u.id, u.email FROM users u
    JOIN workspace_users wu ON wu.user_id = u.id
    WHERE wu.workspace_id = ${workspaceId} AND wu.role = 'org_owner'
    LIMIT 1
  `);
  const owner = ((ownerResult as any).rows || (ownerResult as any))?.[0];
  if (!owner) return;

  await createNotification({
    workspaceId,
    userId: owner.id,
    type: 'audit_access_request',
    title: 'State Regulatory Audit Access Requested',
    message: `${info.auditorFullName} from ${info.auditorAgencyName} has requested audit access to ${orgName}. Audit type: ${info.auditPurpose}. You have 24 hours to dispute this access. If no dispute is received, access will be granted automatically.`,
    metadata: { requestId: info.requestId, auditorEmail: info.auditorEmail },
  });

  const _auditRequestHtml = `
      <div style="font-family:sans-serif;max-width:640px;margin:0 auto">
        <div style="background:#0f172a;padding:24px;border-radius:8px 8px 0 0">
          <h1 style="color:#ffc83c;margin:0;font-size:20px">Regulatory Audit Access Requested</h1>
          <p style="color:#94a3b8;margin:8px 0 0">You have 24 hours to dispute. No action = access granted automatically.</p>
        </div>
        <div style="background:#1e293b;padding:24px;color:#e2e8f0;border-radius:0 0 8px 8px">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px 0;color:#94a3b8;width:40%">Auditor Name</td><td style="padding:8px 0">${info.auditorFullName}</td></tr>
            <tr><td style="padding:8px 0;color:#94a3b8">Agency</td><td style="padding:8px 0">${info.auditorAgencyName}</td></tr>
            <tr><td style="padding:8px 0;color:#94a3b8">Email</td><td style="padding:8px 0">${info.auditorEmail}</td></tr>
            <tr><td style="padding:8px 0;color:#94a3b8">Audit Type</td><td style="padding:8px 0">${info.auditPurpose}</td></tr>
            <tr><td style="padding:8px 0;color:#94a3b8">State</td><td style="padding:8px 0">${info.stateCode}</td></tr>
          </table>
          <p style="margin-top:24px;color:#ef4444;font-weight:600">If this audit request is not legitimate, log in to your ${PLATFORM.name} platform and dispute this request within 24 hours.</p>
          <p style="font-size:12px;color:#64748b;margin-top:16px">Request ID: ${info.requestId}</p>
        </div>
      </div>`;
  await NotificationDeliveryService.send({ idempotencyKey: `notif-${Date.now()}`,
            type: 'regulatory_notification', workspaceId: (info as any).workspaceId, recipientUserId: owner.id, channel: 'email', body: { to: owner.email, subject: `[ACTION REQUIRED] State Regulatory Audit Access Requested for ${orgName}`, html: _auditRequestHtml } })
    .catch((err: unknown) => {
      log.warn('[RegulatoryPortal] Org owner audit notification email failed (non-fatal):', (err as any)?.message);
    });
}

// ── PUBLIC: Step 6 — Portal report submission (public, keyed by requestId) ────

router.post('/complete-report', requireAuditorPortalAuth, async (req: Request, res: Response) => {
  // Auditor token authentication required — requestId alone is insufficient
  // The auditor session includes workspaceId binding; verify it matches
  try {
    const { requestId, reportUrl, auditOutcome, findings, correctiveActions } = req.body;

    if (!requestId || !reportUrl || !auditOutcome) {
      return res.status(400).json({ success: false, error: 'requestId, reportUrl, and auditOutcome are required' });
    }

    const [request] = await db.select({
      id: auditorVerificationRequests.id,
      workspaceId: auditorVerificationRequests.workspaceId,
      auditorEmail: auditorVerificationRequests.auditorEmail,
      status: auditorVerificationRequests.status,
      accessExpiresAt: auditorVerificationRequests.accessExpiresAt,
    }).from(auditorVerificationRequests)
      .where(eq(auditorVerificationRequests.id, requestId))
      .limit(1);

    if (!request) {
      return res.status(404).json({ success: false, error: 'Verification request not found' });
    }

    if (request.status !== 'access_granted') {
      return res.status(403).json({ success: false, error: 'Access not granted for this request' });
    }

    // Verify auditor token workspace matches the request workspace
    const tokenWorkspaceId = (req as any).auditorWorkspaceId;
    if (tokenWorkspaceId && tokenWorkspaceId !== request.workspaceId) {
      return res.status(403).json({ success: false, error: 'Workspace mismatch — token does not authorize this request' });
    }

    if (request.accessExpiresAt && new Date() > new Date(request.accessExpiresAt)) {
      return res.status(410).json({ success: false, error: 'Audit access has expired' });
    }

    await db.update(auditorVerificationRequests).set({
      auditReportUrl: reportUrl,
      auditReportUploadedAt: new Date(),
      trinityCorrectiveActionPlan: correctiveActions ?? null,
      correctiveActionSentAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(auditorVerificationRequests.id, requestId));

    // Notify org_owner of audit completion
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: users, workspace_users | Verified: 2026-03-23
    const ownerResult = await typedQuery(sql`
      SELECT u.id, u.email FROM users u
      JOIN workspace_users wu ON wu.user_id = u.id
      WHERE wu.workspace_id = ${request.workspaceId} AND wu.role = 'org_owner'
      LIMIT 1
    `);
    const owner = ((ownerResult as any).rows || (ownerResult as any))?.[0];

    if (owner) {
      await createNotification({
        workspaceId: request.workspaceId,
        userId: owner.id,
        type: 'audit_report_uploaded',
        title: 'Regulatory Audit Report Submitted',
        message: `A regulatory audit has been completed. Outcome: ${auditOutcome}. ${correctiveActions ? 'Corrective actions have been noted.' : ''} Review the report in your Audit Readiness dashboard.`,
        metadata: { requestId, reportUrl, auditOutcome },
        idempotencyKey: `audit_report_uploaded-${Date.now()}-${owner.id}`
      }).catch ((err: unknown) => {
        log.warn('[RegulatoryPortal] In-app audit submitted notification failed (non-fatal):', (err as any)?.message);
      });
    }

    return res.json({
      success: true,
      message: 'Audit report submitted. Organization owner has been notified.',
    });
  } catch (err: unknown) {
    return res.status(500).json({ success: false, error: 'Failed to submit audit report' });
  }
});

import { runTaxComplianceAudit, getTaxRules, getSUTAInfo, TAX_REGISTRY_VERSION, TAX_REGISTRY_EFFECTIVE_YEAR, TAX_REGISTRY_LAST_VERIFIED } from '../../services/tax/taxRulesRegistry';
import { typedCount, typedQuery } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('RegulatoryPortal');


router.get('/tax-compliance/audit', async (_req, res) => {
  try {
    const report = runTaxComplianceAudit();
    return res.json({ success: true, report });
  } catch (err: any) {
    log.error('[RegulatoryPortal] Tax compliance audit error:', err);
    return res.status(500).json({ success: false, error: 'Tax compliance audit failed' });
  }
});

router.get('/tax-compliance/registry', async (_req, res) => {
  try {
    const rules = getTaxRules();
    return res.json({
      success: true,
      registry: {
        version: TAX_REGISTRY_VERSION,
        effectiveYear: TAX_REGISTRY_EFFECTIVE_YEAR,
        lastVerified: TAX_REGISTRY_LAST_VERIFIED,
        source: rules.source,
        fica: rules.fica,
        futa: rules.futa,
        standardDeductions: rules.standardDeductions,
        stateCount: Object.keys(rules.stateTaxRules).length,
        localityCount: Object.keys(rules.localTaxRules).length,
        sutaCount: rules.sutaDefaults.length,
      },
    });
  } catch (err: any) {
    log.error('[RegulatoryPortal] Registry status error:', err);
    return res.status(500).json({ success: false, error: 'Failed to get registry status' });
  }
});

router.get('/tax-compliance/states/:stateCode', async (req, res) => {
  try {
    const code = req.params.stateCode.toUpperCase();
    const rules = getTaxRules();
    const stateRule = rules.stateTaxRules[code];
    if (!stateRule) return res.status(404).json({ success: false, error: `No tax rules for state ${code}` });

    const sutaInfo = getSUTAInfo(code);
    const reciprocity = rules.reciprocalAgreements[code] || [];
    const localTaxes = Object.entries(rules.localTaxRules)
      .filter(([, r]) => r.state === code)
      .map(([key, r]) => ({ code: key, name: r.name, rate: r.rate, type: r.type }));

    return res.json({
      success: true,
      state: code,
      taxYear: rules.year,
      incomeTax: stateRule,
      suta: sutaInfo || null,
      reciprocity,
      localTaxes,
    });
  } catch (err: any) {
    log.error('[RegulatoryPortal] State tax details error:', err);
    return res.status(500).json({ success: false, error: 'Failed to get state tax details' });
  }
});

export { router as regulatoryPortalRoutes };
