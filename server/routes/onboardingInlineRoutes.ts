import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { idempotencyMiddleware } from "../middleware/idempotency";
import { mutationLimiter } from '../middleware/rateLimiter';
import { eq, and, gt, sql } from 'drizzle-orm';
import { storage } from '../storage';
import { db } from '../db';
import { documentSignatures, userOnboarding, onboardingInvites, employees, onboardingApplications, orgCreationProgress } from '@shared/schema';
import crypto from 'crypto';
import type { AuthenticatedRequest } from '../rbac';
import { requireManager } from '../rbac';
import { requireAuth } from '../auth';
import {
  sendOnboardingInviteEmail,
} from '../services/emailCore';
import { typedExec, typedQuery } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
import { scheduleNonBlocking } from '../lib/scheduleNonBlocking';
const log = createLogger('OnboardingInlineRoutes');

const router = Router();

const publicOnboardingPaths = [
  '/invite/',        // GET /invite/:token (token lookup)
  '/application',    // POST /application (submit), GET /application/:id, PATCH /application/:id
  '/signatures',     // POST /signatures, GET /signatures/:applicationId
  '/certifications', // POST /certifications, GET /certifications/:applicationId
  '/documents',      // POST upload-url/confirm, GET /:applicationId
  '/contracts/',     // GET /contracts/:applicationId, POST /contracts/:contractId/sign
  '/status',         // GET /status
  '/migration-capabilities', // GET
];

router.use((req, res, next) => {
  const path = req.path;
  if (path.startsWith('/invite/') && req.method === 'GET') return next();
  if (path === '/invite/' || (path.match(/^\/invite\/[^/]+\/opened$/) && req.method === 'POST')) return next();
  if (path.startsWith('/application')) return next();
  if (path.startsWith('/signatures')) return next();
  if (path.startsWith('/certifications')) return next();
  if (path.startsWith('/documents')) return next();
  if (path.startsWith('/contracts')) return next();
  if (path.startsWith('/submit/')) return next();
  if (path === '/status' && req.method === 'GET') return next();
  if (path === '/migration-capabilities' && req.method === 'GET') return next();
  return requireAuth(req, res, next);
});

router.post('/application', async (req, res) => {
  try {
    const { inviteToken, ...applicationData } = req.body;

    if (!inviteToken) {
      return res.status(400).json({ message: "Invite token is required" });
    }

    // G15 FIX: Atomic invite token claim — prevents two simultaneous submissions
    // from both passing the isUsed=false check and each creating a separate
    // onboarding application. The UPDATE only succeeds for one concurrent request;
    // any other request with the same token gets 0 rows back and is rejected.
    const now = new Date();
    const [claimedInvite] = await db
      .update(onboardingInvites)
      .set({ isUsed: true, acceptedAt: now, updatedAt: now, status: 'accepted' })
      .where(
        and(
          eq(onboardingInvites.inviteToken, inviteToken),
          eq(onboardingInvites.isUsed, false),
          gt(onboardingInvites.expiresAt, now)
        )
      )
      .returning();

    if (!claimedInvite) {
      return res.status(400).json({ message: "Invalid, expired, or already used invite" });
    }

    const employeeNumber = await storage.generateEmployeeNumber(claimedInvite.workspaceId);

    const application = await storage.createOnboardingApplication({
      workspaceId: claimedInvite.workspaceId,
      inviteId: claimedInvite.id,
      firstName: applicationData.firstName || claimedInvite.firstName,
      lastName: applicationData.lastName || claimedInvite.lastName,
      email: applicationData.email || claimedInvite.email,
      employeeNumber,
      currentStep: 'personal_info',
      status: 'in_progress',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      ...applicationData,
    });

    res.json(application);
  } catch (error: unknown) {
    log.error("Error creating application:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create application" });
  }
});

router.post('/certifications', async (req, res) => {
  try {
    const certificationData = req.body;
    const certification = await storage.createEmployeeCertification(certificationData);
    res.json(certification);
  } catch (error: unknown) {
    log.error("Error creating certification:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create certification" });
  }
});

router.get('/create-org/progress', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || (req.user)?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: org_creation_progress | Verified: 2026-03-23
    const result = await typedQuery(
      sql`SELECT progress_data FROM org_creation_progress WHERE user_id = ${userId} LIMIT 1`
    );
    const row = result[0] as any;
    const progress = row?.progress_data ?? null;
    res.json({ success: true, progress });
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post('/create-org/progress', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || (req.user)?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const data = req.body;
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(orgCreationProgress).values({
      userId,
      progressData: data,
      updatedAt: sql`now()`,
    }).onConflictDoUpdate({
      target: orgCreationProgress.userId,
      set: {
        progressData: data,
        updatedAt: sql`now()`,
      },
    });
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.delete('/create-org/progress', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || (req.user)?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    await db.delete(orgCreationProgress).where(eq(orgCreationProgress.userId, userId));
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post('/invite', mutationLimiter, idempotencyMiddleware, requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.user?.id || req.user?.id;

    const { email, firstName, lastName, role, workspaceRole, position, offeredPayRate } = req.body;

    if (!email || !firstName || !lastName) {
      return res.status(400).json({ message: "Email, first name, and last name are required" });
    }

    // ── Invite role gate ─────────────────────────────────────────────────────
    // org_owner / co_owner can invite into supervisor-and-above roles.
    // All other managers (org_admin and below) may only invite into staff-tier roles.
    // Nobody may invite into org_owner or co_owner — those are assigned directly.
    const STAFF_TIER_ROLES   = ['staff', 'employee', 'officer', 'contractor', 'auditor', 'dispatcher'];
    const OWNER_TIER_ROLES   = ['supervisor', 'manager', 'department_manager', 'org_manager', 'hr_manager', 'finance_manager', 'field_supervisor'];
    const PROTECTED_ROLES    = ['org_owner', 'co_owner', 'org_admin'];

    const requestedRole = workspaceRole || 'staff';

    if (PROTECTED_ROLES.includes(requestedRole)) {
      return res.status(403).json({ message: "Ownership-tier roles cannot be granted via invite. Contact platform support." });
    }

    if (OWNER_TIER_ROLES.includes(requestedRole)) {
      // Fetch the inviter's actual workspace role to enforce the ownership gate
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const inviterEmployee = await storage.getEmployeeByUserId(userId, workspaceId);
      const inviterRole = inviterEmployee?.workspaceRole as string;
      const isOwner = ['org_owner', 'co_owner'].includes(inviterRole);
      if (!isOwner) {
        return res.status(403).json({
          message: `Only organization owners can invite someone as ${requestedRole}. Contact your org owner.`,
          code: 'OWNER_ROLE_GATE',
        });
      }
    }

    if (!STAFF_TIER_ROLES.includes(requestedRole) && !OWNER_TIER_ROLES.includes(requestedRole)) {
      return res.status(403).json({ message: "You do not have permission to grant this role" });
    }

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const workspace = await storage.getWorkspace(workspaceId);

    const invite = await storage.createOnboardingInvite({
      workspaceId,
      email,
      firstName,
      lastName,
      role: role || null,
      workspaceRole: requestedRole,
      position: position || null,
      offeredPayRate: offeredPayRate ? String(offeredPayRate) : null,
      inviteToken,
      expiresAt,
      sentBy: userId,
    } as any);

    const protocol = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
    const host = req.get('host');
    const onboardingUrl = `${protocol}://${host}/onboarding/${inviteToken}`;

    await sendOnboardingInviteEmail(email, {
      employeeName: `${firstName} ${lastName}`,
      workspaceName: workspace?.name || 'Our Team',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      onboardingUrl,
      expiresIn: '7 days',
    });

    res.json(invite);
  } catch (error: unknown) {
    log.error("Error creating onboarding invite:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create invite" });
  }
})

router.get('/status', async (req, res) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any).activeWorkspaceId || (user as any).defaultWorkspaceId;

    if (!workspaceId) {
      return res.json({ status: 'not_started' });
    }

    const { onboardingOrchestrator } = await import('../services/ai-brain/subagents/onboardingOrchestrator');
    const status = await onboardingOrchestrator.getOnboardingStatus(workspaceId);

    res.json(status);
  } catch (error: unknown) {
    log.error("[Onboarding Status] Error:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
})

router.get('/progress', async (req: any, res) => {
  try {
    let userId: string;

    if (req.requireAuth && req.requireAuth() && req.user?.claims) {
      userId = req.user?.id;
    } else if (req.session?.userId) {
      userId = req.session.userId;
    } else {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const progress = await db.select()
      .from(userOnboarding)
      .where(eq(userOnboarding.userId, userId))
      .limit(1);

    if (progress.length === 0) {
      const newProgress = await db.insert(userOnboarding)
        // @ts-expect-error — TS migration: fix in refactoring sprint
        .values({ userId, workspaceId })
        .returning();
      return res.json(newProgress[0]);
    }

    res.json(progress[0]);
  } catch (error) {
    log.error("Error fetching onboarding progress:", error);
    res.status(500).json({ message: "Failed to fetch onboarding progress" });
  }
})

router.post('/skip', async (req: any, res) => {
  try {
    let userId: string;

    if (req.requireAuth && req.requireAuth() && req.user?.claims) {
      userId = req.user?.id;
    } else if (req.session?.userId) {
      userId = req.session.userId;
    } else {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const updated = await db.update(userOnboarding)
      .set({
        hasSkipped: true,
        lastViewedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(userOnboarding.userId, userId))
      .returning();

    if (updated.length === 0) {
      const created = await db.insert(userOnboarding)
        .values({
          // @ts-expect-error — TS migration: fix in refactoring sprint
          workspaceId: workspaceId,
          userId,
          hasSkipped: true,
          lastViewedAt: new Date()
        })
        .returning();
      return res.json(created[0]);
    }

    res.json(updated[0]);
  } catch (error) {
    log.error("Error skipping onboarding:", error);
    res.status(500).json({ message: "Failed to skip onboarding" });
  }
})

router.post('/complete', async (req: any, res) => {
  try {
    let userId: string;

    if (req.requireAuth && req.requireAuth() && req.user?.claims) {
      userId = req.user?.id;
    } else if (req.session?.userId) {
      userId = req.session.userId;
    } else {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      completedSteps,
      communicationProgress,
      operationsProgress,
      growthProgress,
      platformProgress
    } = req.body;

    const progressPercentage = 100;

    const updated = await db.update(userOnboarding)
      .set({
        completedSteps: completedSteps || [],
        hasCompleted: true,
        progressPercentage,
        communicationProgress: communicationProgress || 0,
        operationsProgress: operationsProgress || 0,
        growthProgress: growthProgress || 0,
        platformProgress: platformProgress || 0,
        lastViewedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(userOnboarding.userId, userId))
      .returning();

    if (updated.length === 0) {
      const created = await db.insert(userOnboarding)
        .values({
          // @ts-expect-error — TS migration: fix in refactoring sprint
          workspaceId: workspaceId,
          userId,
          completedSteps: completedSteps || [],
          hasCompleted: true,
          progressPercentage,
          communicationProgress: communicationProgress || 0,
          operationsProgress: operationsProgress || 0,
          growthProgress: growthProgress || 0,
          platformProgress: platformProgress || 0,
          lastViewedAt: new Date()
        })
        .returning();
      return res.json(created[0]);
    }

    res.json(updated[0]);
  } catch (error) {
    log.error("Error completing onboarding:", error);
    res.status(500).json({ message: "Failed to complete onboarding" });
  }
})

export default router;
