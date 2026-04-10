import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { 
  workspaces, 
  users, 
  employees,
  orgSubscriptions,
  subscriptionTiers,
  creditBalances,
  usageCaps,
  workspaceUsageTracking,
} from '@shared/schema';
import { subscriptions } from '@shared/schema/domains/billing';
import { eq, and, or } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { requireAuth } from '../auth';
import { storage } from '../storage';
import { migrateEmployeeIdsToNewOrgCode } from '../services/identityService';
import { creditManager } from '../services/billing/creditManager';
import { platformEventBus } from '../services/platformEventBus';
import { sendWorkspaceWelcomeEmail } from '../services/emailCore';
import { sendWelcomeOrgNotification } from '../services/notificationService';
import { createLogger } from '../lib/logger';
const log = createLogger('Workspace');


// @ts-expect-error — TS migration: fix in refactoring sprint
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    workspaceId?: string;
    currentWorkspaceId?: string;
    platformRole?: string;
    [key: string]: any;
  };
  workspaceId?: string;
  session?: any;
  rawBody?: Buffer;
}

const router = Router();

// ============================================================================
// WORKSPACE ENDPOINTS
// ============================================================================

// Get all workspaces for current user
// @ts-expect-error — TS migration: fix in refactoring sprint
router.get('/all', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const ownedWorkspace = await storage.getWorkspaceByOwnerId(userId);
    const workspacesList = ownedWorkspace ? [ownedWorkspace] : [];
    
    res.json(workspacesList);
  } catch (error) {
    log.error('Error fetching workspaces:', error);
    res.status(500).json({ message: 'Failed to fetch workspaces' });
  }
});

// Create a new workspace/organization
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = req.user;
    if (!userId || !user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { name, description, industry, size, companyName, sectorId, industryGroupId, subIndustryId, complianceTemplates, certifications, orgCode } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ message: 'Organization name is required' });
    }

    const MAX_WORKSPACES_PER_USER = 10;
    const ownedWorkspaceCount = await db.select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.ownerId, userId));
    if (ownedWorkspaceCount.length >= MAX_WORKSPACES_PER_USER) {
      return res.status(429).json({ message: `You have reached the maximum of ${MAX_WORKSPACES_PER_USER} workspaces. Please contact support to request an increase.` });
    }

    // Validate and check org code if provided
    let validatedOrgCode = null;
    if (orgCode) {
      const upperCode = String(orgCode).toUpperCase().trim();
      if (!/^[A-Z0-9]{3,8}$/.test(upperCode)) {
        return res.status(400).json({ message: 'Organization code must be 3-8 alphanumeric characters' });
      }
      
      // Check if org code is already taken
      const [existing] = await db.select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.orgCode, upperCode))
        .limit(1);
      
      if (existing) {
        return res.status(409).json({ message: 'This organization code is already taken' });
      }
      
      validatedOrgCode = upperCode;
    }

    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14-day trial per OMEGA L1:836
    const workspace = await storage.createWorkspace({
      name: name.trim(),
      ownerId: userId,
      companyName: companyName || name.trim(),
      industryDescription: description || null,
      businessCategory: industry || 'general',
      subscriptionTier: 'trial',
      subscriptionStatus: 'active',
      orgCode: validatedOrgCode,
      trialEndsAt,
    });

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const employee = await storage.createEmployee({
      userId: userId,
      workspaceId: workspace.id,
      email: user.email,
      firstName: user.firstName || 'Owner',
      lastName: user.lastName || '',
      workspaceRole: 'org_owner',
      isActive: true,
    });

    await db.update(users).set({ currentWorkspaceId: workspace.id }).where(eq(users.id, userId));

    if (req.session) {
      (req as any).session.workspaceId = workspace.id;
      (req as any).session.activeWorkspaceId = workspace.id;
    }

    try {
      const { attachEmployeeExternalId } = await import('../services/identityService');
      await attachEmployeeExternalId(employee.id, workspace.id);
    } catch (extIdError: unknown) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      log.error(`[Workspace Create] Failed to attach external ID:`, extIdError.message);
    }

    try {
      // Use 'trial' tier — gives 10 officers + 500 AI interactions per the 2026 pricing
      await creditManager.initializeCredits(workspace.id, 'trial');
    } catch (creditError: unknown) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      log.error(`[Workspace Create] Credit init failed (non-blocking):`, creditError.message);
      // Non-blocking: workspace still usable; billing will self-heal on first login
    }

    // OMEGA L1:836 — Create trial subscription record so trialConversionOrchestrator can find this workspace
    try {
      await db.insert(subscriptions).values({
        workspaceId: workspace.id,
        plan: 'free',
        status: 'trial',
        trialStartedAt: new Date(),
        trialEndsAt,
        maxEmployees: 10,
      }).onConflictDoNothing();
      log.info(`[Workspace Create] Trial subscription record created for workspace ${workspace.id}, expires ${trialEndsAt.toISOString()}`);
    } catch (subErr: unknown) {
      log.error(`[Workspace Create] Trial subscription record creation failed (non-blocking):`, (subErr as any)?.message);
    }

    // Initialize interaction tracking row for new workspace (2026 fair-use billing)
    try {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      await db.insert(workspaceUsageTracking).values({
        workspaceId: workspace.id,
        planTier: 'trial',
        interactionsIncludedMonthly: 500,
        interactionsUsedCurrentPeriod: 0,
        interactionsRemaining: 500,
        hardCapLimit: 1000,
        overageInteractions: 0,
        overageRatePerInteraction: '0.1500',
        billingPeriodStart: periodStart,
        billingPeriodEnd: periodEnd,
      }).onConflictDoNothing();
    } catch (usageErr: unknown) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      log.error(`[Workspace Create] Usage tracking init failed (non-blocking):`, usageErr.message);
    }

    try {
      const [freeTier] = await db
        .select({ id: subscriptionTiers.id, baseCredits: subscriptionTiers.baseCredits })
        .from(subscriptionTiers)
        .where(eq(subscriptionTiers.tierName, 'free_trial'));

      if (freeTier) {
        await db.insert(orgSubscriptions).values({
          workspaceId: workspace.id,
          tierId: freeTier.id,
          status: 'active',
          creditAllocation: freeTier.baseCredits,
        }).onConflictDoNothing();

        await db.insert(creditBalances).values({
          workspaceId: workspace.id,
          subscriptionCredits: freeTier.baseCredits,
          carryoverCredits: 0,
          purchasedCredits: 0,
        }).onConflictDoNothing();

        // Create current-period usage cap
        const now = new Date();
        const billingCycle = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        await db.insert(usageCaps).values({
          workspaceId: workspace.id,
          billingCycle,
          aiScheduledShiftsUsed: 0,
          aiScheduledShiftsCap: 100,
          analyticsReportsUsed: 0,
          analyticsReportsCap: 50,
          contractReviewsUsed: 0,
          contractReviewsCap: 25,
          botInteractionsToday: 0,
          botInteractionsDailyCap: 500,
          botInteractionsLastReset: now,
        }).onConflictDoNothing();
      }
    } catch (subError: unknown) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      log.error(`[Workspace Create] Subscription/balance init failed (non-blocking):`, subError.message);
    }

    try {
      await storage.createAuditLog({
        userId,
        workspaceId: workspace.id,
        action: 'workspace_created',
        entityType: 'workspace',
        entityId: workspace.id,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        details: {
          name: workspace.name,
          industry,
          size,
          sectorId,
          industryGroupId,
          subIndustryId,
          organizationId: workspace.organizationId,
        },
        ipAddress: req.ip || req.socket.remoteAddress,
      });
    } catch (auditError: unknown) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      log.error(`[Workspace Create] Audit log failed (non-blocking):`, auditError.message);
    }

    try {
      // CANONICAL: publish() so TrinityWorkspaceBootstrap subscriber fires (onWorkspaceCreated)
      platformEventBus.publish({
        type: 'workspace.created',
        category: 'automation',
        title: 'Workspace Created',
        description: `New workspace ${workspace.name} created`,
        workspaceId: workspace.id,
        metadata: {
          workspaceId: workspace.id,
          name: workspace.name,
          ownerId: userId,
          industry,
          size,
        },
      }).catch((eventError: unknown) => {
        log.error(`[Workspace Create] Event publish failed (non-blocking):`, (eventError as any)?.message);
      });

      // D2-GAP-FIX: Publish onboarding_completed so Trinity can start the post-onboarding
      // pipeline (memory profile initialization, automation triggers, welcome sequences).
      platformEventBus.publish({
        type: 'onboarding_completed',
        category: 'automation',
        title: 'Onboarding Completed',
        description: `Organization onboarding completed for ${workspace.name}`,
        workspaceId: workspace.id,
        metadata: {
          workspaceId: workspace.id,
          ownerId: userId,
          completedAt: new Date().toISOString(),
        },
      }).catch((eventError: unknown) => {
        log.error(`[Workspace Create] onboarding_completed event failed (non-blocking):`, (eventError as any)?.message);
      });
    } catch (eventError: unknown) {
      log.error(`[Workspace Create] Event publish failed (non-blocking):`, (eventError as any)?.message);
    }

    // Welcome notification bundle (in-platform) — fires immediately on workspace creation
    try {
      await sendWelcomeOrgNotification(workspace.id, userId, workspace.name);
    } catch (notifError: unknown) {
      log.error(`[Workspace Create] Welcome notification failed (non-blocking):`, (notifError as any)?.message);
    }

    // Welcome email — fetch owner email and send
    try {
      const ownerEmail = user?.email || user?.claims?.email;
      if (ownerEmail) {
        const ownerName = user?.firstName && user?.lastName
          ? `${user.firstName} ${user.lastName}`
          : (user?.firstName || user?.claims?.firstName || undefined);
        await sendWorkspaceWelcomeEmail(ownerEmail, { orgName: workspace.name, ownerName }, workspace.id);
        log.info(`[Workspace Create] Welcome email sent to ${ownerEmail} for workspace ${workspace.id}`);
      }
    } catch (emailError: unknown) {
      log.error(`[Workspace Create] Welcome email failed (non-blocking):`, (emailError as any)?.message);
    }

    res.status(201).json({
      success: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        organizationId: workspace.organizationId,
        organizationSerial: workspace.organizationSerial,
      },
    });
  } catch (error: unknown) {
    log.error('Error creating workspace:', (error as any)?.message || error);
    log.error('Error stack:', (error as any)?.stack);
    log.error('Error code:', (error as any)?.code);
    log.error('Error detail:', (error as any)?.detail);
    res.status(500).json({ message: 'Failed to create organization' });
  }
});

// ============================================================================
// ORG CODE MANAGEMENT - Inbound Email Routing
// NOTE: Routes for /switch, /health, /status, /current, GET /, PATCH /,
//       /custom-messages, /reactivate, /automation/*, /theme,
//       /seed-form-templates, /upgrade are handled by workspaceInlineRoutes.ts
// ============================================================================


import {
  validateOrgCodeFormat,
  validateOrgCodeAvailability,
  claimOrgCode,
  releaseOrgCode,
} from '../utils/orgCodeValidator';

/**
 * Check if an org code is available (for validation before claiming)
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.get('/org-code/check/:code', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.params;
    const currentWorkspaceId = req.user?.currentWorkspaceId || req.workspaceId;

    const result = await validateOrgCodeAvailability(code, currentWorkspaceId);

    res.json({
      code,
      normalizedCode: result.normalizedCode,
      available: result.valid,
      error: result.error,
      errorCode: result.errorCode,
    });
  } catch (error: unknown) {
    log.error("Error checking org code:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to check org code" });
  }
});

/**
 * Claim an org code for the current workspace
 * Only workspace owners/managers can claim codes
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/org-code/claim', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.body;
    const workspaceId = req.user?.currentWorkspaceId || req.workspaceId;

    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    // Check user has permission (owner or manager)
    const userRole = req.user?.workspaceRole;
    if (!['org_owner', 'co_owner', 'org_admin', 'manager'].includes(userRole || '')) {
      return res.status(403).json({ message: "Only workspace owners and managers can claim org codes" });
    }

    const result = await claimOrgCode(workspaceId, code);

    if (!result.success) {
      return res.status(400).json({
        message: result.error,
        available: false,
      });
    }

    // Fetch updated workspace to return the claimed code
    const [workspace] = await db.select({
      orgCode: workspaces.orgCode,
      orgCodeStatus: workspaces.orgCodeStatus,
      orgCodeClaimedAt: workspaces.orgCodeClaimedAt,
    })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    res.json({
      message: `Successfully claimed org code: ${workspace?.orgCode}`,
      orgCode: workspace?.orgCode,
      orgCodeStatus: workspace?.orgCodeStatus,
      claimedAt: workspace?.orgCodeClaimedAt,
      emailAddress: `staffing-${workspace?.orgCode}@coaileague.com`,
    });
  } catch (error: unknown) {
    log.error("Error claiming org code:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to claim org code" });
  }
});

/**
 * Get current workspace's org code configuration
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.get('/org-code', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.user?.currentWorkspaceId || req.workspaceId;

    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    const [workspace] = await db.select({
      orgCode: workspaces.orgCode,
      orgCodeStatus: workspaces.orgCodeStatus,
      orgCodeClaimedAt: workspaces.orgCodeClaimedAt,
      orgCodeReleasedAt: workspaces.orgCodeReleasedAt,
    })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    res.json({
      orgCode: workspace.orgCode,
      orgCodeStatus: workspace.orgCodeStatus,
      claimedAt: workspace.orgCodeClaimedAt,
      releasedAt: workspace.orgCodeReleasedAt,
      emailAddress: workspace.orgCode ? `staffing-${workspace.orgCode}@coaileague.com` : null,
      instructions: workspace.orgCode
        ? `Send work requests to: staffing-${workspace.orgCode}@coaileague.com`
        : 'Claim an org code to enable inbound email routing',
    });
  } catch (error: unknown) {
    log.error("Error fetching org code:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to fetch org code" });
  }
});

/**
 * Release an org code (admin action - makes code available for others)
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.delete('/org-code', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.user?.currentWorkspaceId || req.workspaceId;

    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    // Check user has permission (owner only for releasing)
    const userRole = req.user?.workspaceRole;
    if (!['owner', 'org_owner'].includes(userRole || '')) {
      return res.status(403).json({ message: "Only workspace owners can release org codes" });
    }

    await releaseOrgCode(workspaceId);

    res.json({
      message: "Org code released successfully",
      released: true,
    });
  } catch (error: unknown) {
    log.error("Error releasing org code:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to release org code" });
  }
});

/**
 * Update org code for a workspace
 * This allows changing the org code (e.g., from ORG-TXPS to STATEWIDE)
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.put('/org-code', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.user?.currentWorkspaceId || req.workspaceId;
    const userId = req.user?.id;
    const { newOrgCode } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    if (!newOrgCode || typeof newOrgCode !== 'string') {
      return res.status(400).json({ message: "New org code is required" });
    }

    // Check user has permission (owner only)
    const userRole = req.user?.workspaceRole;
    if (!['owner', 'org_owner'].includes(userRole || '')) {
      return res.status(403).json({ message: "Only workspace owners can change org codes" });
    }

    // Validate org code format using the canonical validator
    const orgCodeUpper = newOrgCode.toUpperCase().trim();
    const formatResult = validateOrgCodeFormat(newOrgCode);
    if (!formatResult.valid) {
      return res.status(400).json({ 
        message: formatResult.error || "Invalid org code format",
        errorCode: formatResult.errorCode,
      });
    }

    // Check if org code is already claimed by another workspace
    const [existing] = await db.select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(and(
        eq(workspaces.orgCode, orgCodeUpper),
        sql`${workspaces.id} != ${workspaceId}`
      ))
      .limit(1);

    if (existing) {
      return res.status(409).json({ 
        message: `Org code ${orgCodeUpper} is already claimed by another organization`,
        conflictingOrg: existing.name
      });
    }

    // Update the org code - MUST set 'active' status for email routing to work
    // lookupWorkspaceByOrgCode requires orgCodeStatus === 'active'
    await db.update(workspaces)
      .set({
        orgCode: orgCodeUpper,
        orgCodeStatus: 'active',
        orgCodeClaimedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));

    // CRITICAL: Migrate all employee IDs to use the new org code
    // This updates EMP-OLDCODE-00001 -> EMP-NEWCODE-00001 for all employees
    const migrationResult = await migrateEmployeeIdsToNewOrgCode(workspaceId, orgCodeUpper);
    
    if (migrationResult.errors.length > 0) {
      log.warn(`[Workspace] Migration warnings:`, migrationResult.errors);
    }

    res.json({
      message: `Org code updated to: ${orgCodeUpper}`,
      orgCode: orgCodeUpper,
      emailAddress: `staffing-${orgCodeUpper}@coaileague.com`,
      instructions: `Send work requests to: staffing-${orgCodeUpper}@coaileague.com`,
      employeesMigrated: migrationResult.migratedCount,
    });
  } catch (error: unknown) {
    log.error("Error updating org code:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to update org code" });
  }
});

/**
 * Claim the generic staffing email (staffing@coaileague.com without org code)
 * Only ONE workspace can claim this at a time
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/claim-generic-staffing-email', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.user?.currentWorkspaceId || req.workspaceId;
    const userId = req.user?.id;

    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    // Check user has permission (owner only)
    const userRole = req.user?.workspaceRole;
    if (!['owner', 'org_owner'].includes(userRole || '')) {
      return res.status(403).json({ message: "Only workspace owners can claim the generic staffing email" });
    }

    // Check if any other workspace has claimed the generic email
    const [existingClaim] = await db.select({ 
      id: workspaces.id, 
      name: workspaces.name,
      orgCode: workspaces.orgCode 
    })
      .from(workspaces)
      .where(and(
        eq(workspaces.hasStaffingEmailClaim, true),
        sql`${workspaces.id} != ${workspaceId}`
      ))
      .limit(1);

    if (existingClaim) {
      return res.status(409).json({ 
        message: `Generic staffing email is already claimed by: ${existingClaim.name} (${existingClaim.orgCode})`,
        claimedBy: existingClaim.name,
        claimedByOrgCode: existingClaim.orgCode
      });
    }

    // Claim the generic staffing email
    await db.update(workspaces)
      .set({
        staffingEmail: 'staffing@coaileague.com',
        hasStaffingEmailClaim: true,
        staffingEmailClaimedAt: new Date(),
        staffingEmailClaimedBy: userId,
      })
      .where(eq(workspaces.id, workspaceId));

    // Get updated workspace info
    const [workspace] = await db.select({
      orgCode: workspaces.orgCode,
      name: workspaces.name,
    })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    res.json({
      message: `Generic staffing email claimed for: ${workspace?.name}`,
      claimed: true,
      orgCode: workspace?.orgCode,
      genericEmail: 'staffing@coaileague.com',
      orgEmail: workspace?.orgCode ? `staffing-${workspace.orgCode}@coaileague.com` : null,
    });
  } catch (error: unknown) {
    log.error("Error claiming generic staffing email:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to claim generic staffing email" });
  }
});

/**
 * Release the generic staffing email claim
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.delete('/claim-generic-staffing-email', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.user?.currentWorkspaceId || req.workspaceId;

    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    // Check user has permission (owner only)
    const userRole = req.user?.workspaceRole;
    if (!['owner', 'org_owner'].includes(userRole || '')) {
      return res.status(403).json({ message: "Only workspace owners can release the generic staffing email" });
    }

    await db.update(workspaces)
      .set({
        staffingEmail: null,
        hasStaffingEmailClaim: false,
        staffingEmailClaimedAt: null,
        staffingEmailClaimedBy: null,
      })
      .where(eq(workspaces.id, workspaceId));

    res.json({
      message: "Generic staffing email released successfully",
      released: true,
    });
  } catch (error: unknown) {
    log.error("Error releasing generic staffing email:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to release generic staffing email" });
  }
});

/**
 * Get staffing email configuration for current workspace
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.get('/staffing-email-config', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.user?.currentWorkspaceId || req.workspaceId;

    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    // Get current workspace info
    const [workspace] = await db.select({
      orgCode: workspaces.orgCode,
      name: workspaces.name,
      hasStaffingEmailClaim: workspaces.hasStaffingEmailClaim,
      staffingEmailClaimedAt: workspaces.staffingEmailClaimedAt,
    })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    // Check who has the generic email claimed (if not this workspace)
    let genericEmailClaimedBy = null;
    if (!workspace?.hasStaffingEmailClaim) {
      const [claimHolder] = await db.select({ 
        name: workspaces.name,
        orgCode: workspaces.orgCode 
      })
        .from(workspaces)
        .where(eq(workspaces.hasStaffingEmailClaim, true))
        .limit(1);
      
      if (claimHolder) {
        genericEmailClaimedBy = {
          name: claimHolder.name,
          orgCode: claimHolder.orgCode,
        };
      }
    }

    res.json({
      orgCode: workspace?.orgCode,
      orgEmail: workspace?.orgCode ? `staffing-${workspace.orgCode}@coaileague.com` : null,
      hasGenericEmailClaim: workspace?.hasStaffingEmailClaim || false,
      genericEmail: 'staffing@coaileague.com',
      genericEmailClaimedAt: workspace?.staffingEmailClaimedAt,
      genericEmailClaimedBy: genericEmailClaimedBy,
      canClaimGenericEmail: !genericEmailClaimedBy && !workspace?.hasStaffingEmailClaim,
    });
  } catch (error: unknown) {
    log.error("Error fetching staffing email config:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to fetch staffing email config" });
  }
});

export default router;
