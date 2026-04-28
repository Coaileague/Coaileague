/**
 * ENTERPRISE ONBOARDING API ROUTES
 * =================================
 * Routes for the 3-phase enterprise onboarding flow.
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response, NextFunction } from 'express';
import { enterpriseOnboardingOrchestrator } from '../services/enterpriseOnboardingOrchestrator';
import { inboundOpportunityAgent } from '../services/inboundOpportunityAgent';
import { employeeBehaviorScoring } from '../services/employeeBehaviorScoring';
import { executionPipeline } from '../services/executionPipeline';
import { requireAuth } from '../auth';
import { hasPlatformWideAccess, getUserPlatformRole } from '../rbac';
import { db } from '../db';
import { automatedShiftOffers, stagedShifts, employees, workspaces, inboundEmails, clientProspects, workspaceMembers } from '@shared/schema';
import { eq, desc, sql, and } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('EnterpriseOnboardingRoutes');


async function validateWorkspaceOwnership(req: Request, res: Response, next: NextFunction) {
  const paramWsId = req.params.workspaceId;
  if (!paramWsId) return next();
  const user = req.user;
  if (!user?.id) return res.status(401).json({ success: false, error: 'Authentication required' });
  const platformRole = await getUserPlatformRole(user.id);
  if (hasPlatformWideAccess(platformRole)) return next();
  if (user.currentWorkspaceId === paramWsId) return next();
  const [membership] = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.workspaceId, paramWsId))).limit(1);
  if (!membership) return res.status(403).json({ success: false, error: 'Access denied to this workspace' });
  next();
}

const router = Router();

// ============================================================================
// PUBLIC ROUTES (no auth required - accessed via email links)
// ============================================================================

router.get('/public/offer/:offerId', async (req, res) => {
  try {
    const { offerId } = req.params;
    const token = req.query.token as string;

    if (!token) {
      return res.status(400).json({ success: false, error: 'Missing verification token' });
    }
    
    const [offer] = await db.select()
      .from(automatedShiftOffers)
      .where(and(
        eq(automatedShiftOffers.id, offerId),
        eq(automatedShiftOffers.publicToken, token)
      ))
      .limit(1);

    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found or invalid token' });
    }

    const [shift] = await db.select()
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .where(eq(stagedShifts.id, offer.stagedShiftId))
      .limit(1);

    const [employee] = await db.select({
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
    .from(employees)
    .where(eq(employees.id, offer.employeeId))
    .limit(1);

    const [workspace] = await db.select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, offer.workspaceId))
      .limit(1);

    const isExpired = new Date(offer.offerExpiresAt) < new Date();
    const isAcceptable = offer.status === 'pending_response' && !isExpired;

    res.json({
      success: true,
      offer: {
        id: offer.id,
        status: offer.status,
        matchScore: offer.matchScore,
        matchReasoning: offer.matchReasoning,
        isExpired,
        isAcceptable,
        expiresAt: offer.offerExpiresAt,
        createdAt: offer.createdAt,
      },
      shift: shift ? {
        location: shift.location,
        date: shift.shiftDate,
        startTime: shift.startTime,
        endTime: shift.endTime,
        payRate: shift.payRate,
        clientName: shift.clientName,
        requirements: shift.requirements,
        status: shift.status,
      } : null,
      employee: employee ? {
        firstName: employee.firstName,
        lastName: employee.lastName,
      } : null,
      workspace: workspace?.name || 'Organization',
    });
  } catch (error: unknown) {
    log.error('[InboundOpportunity] Public offer view failed:', sanitizeError(error));
    res.status(500).json({ success: false, error: 'Failed to load offer details' });
  }
});

router.post('/public/offer/:offerId/accept', async (req, res) => {
  try {
    const { offerId } = req.params;
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ success: false, error: 'Missing verification token' });
    }

    const [offer] = await db.select()
      .from(automatedShiftOffers)
      .where(and(
        eq(automatedShiftOffers.id, offerId),
        eq(automatedShiftOffers.publicToken, token)
      ))
      .limit(1);

    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found or invalid token' });
    }

    if (offer.status !== 'pending_response') {
      return res.status(400).json({ success: false, error: `Offer has already been ${offer.status}` });
    }

    if (new Date(offer.offerExpiresAt) < new Date()) {
      return res.status(400).json({ success: false, error: 'This offer has expired' });
    }

    const result = await inboundOpportunityAgent.processOfferAcceptance(
      offer.workspaceId,
      offerId,
      offer.employeeId
    );
    
    res.json(result);
  } catch (error: unknown) {
    log.error('[InboundOpportunity] Public offer acceptance failed:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/public/offer/:offerId/decline', async (req, res) => {
  try {
    const { offerId } = req.params;
    const { token, reason } = req.body;
    
    if (!token) {
      return res.status(400).json({ success: false, error: 'Missing verification token' });
    }

    const [offer] = await db.select()
      .from(automatedShiftOffers)
      .where(and(
        eq(automatedShiftOffers.id, offerId),
        eq(automatedShiftOffers.publicToken, token)
      ))
      .limit(1);

    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found or invalid token' });
    }

    if (offer.status !== 'pending_response') {
      return res.status(400).json({ success: false, error: 'Offer is no longer pending' });
    }

    if (new Date(offer.offerExpiresAt) < new Date()) {
      return res.status(400).json({ success: false, error: 'This offer has expired' });
    }

    await db.update(automatedShiftOffers)
      .set({ 
        status: 'declined',
        respondedAt: new Date(),
        declineReason: reason || 'Declined by employee',
      })
      .where(eq(automatedShiftOffers.id, offerId));

    res.json({ 
      success: true, 
      message: 'Offer declined. Thank you for your response.',
    });
  } catch (error: unknown) {
    log.error('[InboundOpportunity] Public offer decline failed:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ============================================================================
// AUTHENTICATED ROUTES (require login)
// ============================================================================

router.use(requireAuth);
router.use(validateWorkspaceOwnership);

// ============================================================================
// ENTERPRISE ONBOARDING ROUTES
// ============================================================================

/**
 * Get available subscription tiers
 */
router.get('/tiers', async (req, res) => {
  try {
    const tiers = await enterpriseOnboardingOrchestrator.getAvailableTiers();
    res.json({ success: true, tiers });
  } catch (error: unknown) {
    log.error('[Onboarding] Failed to get tiers:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * Get available addons
 */
router.get('/addons', async (req, res) => {
  try {
    const addons = await enterpriseOnboardingOrchestrator.getAvailableAddons();
    res.json({ success: true, addons });
  } catch (error: unknown) {
    log.error('[Onboarding] Failed to get addons:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * Get onboarding status for a workspace
 */
router.get('/status/:workspaceId', async (req, res) => {
  try {
    const status = await enterpriseOnboardingOrchestrator.getOnboardingStatus(
      req.params.workspaceId
    );
    res.json({ success: true, ...status });
  } catch (error: unknown) {
    log.error('[Onboarding] Failed to get status:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * Phase 1: Process signup
 */
router.post('/signup', async (req, res) => {
  try {
    const userId = req.user?.id || req.session?.userId || 'anonymous';
    const result = await enterpriseOnboardingOrchestrator.processSignup(
      req.body,
      userId
    );
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: unknown) {
    log.error('[Onboarding] Signup failed:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * Phase 2: Configure addons
 */
router.post('/configure/:workspaceId', async (req, res) => {
  try {
    const userId = req.user?.id || req.session?.userId || 'anonymous';
    const { selectedAddons } = req.body;
    
    const result = await enterpriseOnboardingOrchestrator.processAddonSelection(
      req.params.workspaceId,
      selectedAddons || [],
      userId
    );
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: unknown) {
    log.error('[Onboarding] Configuration failed:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * Phase 3: Process payment and activate
 */
router.post('/activate/:workspaceId', async (req, res) => {
  try {
    const userId = req.user?.id || req.session?.userId || 'anonymous';
    
    const result = await enterpriseOnboardingOrchestrator.processPaymentAndActivation(
      req.params.workspaceId,
      req.body,
      userId
    );
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: unknown) {
    log.error('[Onboarding] Activation failed:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ============================================================================
// INBOUND OPPORTUNITY AUTOMATION ROUTES
// ============================================================================

/**
 * Webhook for inbound emails
 */
router.post('/inbound-email/:workspaceId', async (req, res) => {
  try {
    const result = await inboundOpportunityAgent.processInboundEmail(
      req.params.workspaceId,
      req.body
    );
    res.json(result);
  } catch (error: unknown) {
    log.error('[InboundOpportunity] Email processing failed:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * Trigger auto-staffing for a workspace
 */
router.post('/auto-staff/:workspaceId', async (req, res) => {
  try {
    const results = await inboundOpportunityAgent.triggerAutoStaffing(
      req.params.workspaceId
    );
    res.json({ success: true, results });
  } catch (error: unknown) {
    log.error('[InboundOpportunity] Auto-staffing failed:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * Staff a specific staged shift
 */
router.post('/staff-shift/:workspaceId/:stagedShiftId', async (req, res) => {
  try {
    const result = await inboundOpportunityAgent.staffSingleShift(
      req.params.workspaceId,
      req.params.stagedShiftId
    );
    res.json(result);
  } catch (error: unknown) {
    log.error('[InboundOpportunity] Shift staffing failed:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * Accept a shift offer
 */
router.post('/accept-offer/:workspaceId/:offerId', async (req, res) => {
  try {
    const employeeId = req.body.employeeId || req.session?.userId;
    
    if (!employeeId) {
      return res.status(400).json({ success: false, error: 'Employee ID required' });
    }
    
    const result = await inboundOpportunityAgent.processOfferAcceptance(
      req.params.workspaceId,
      req.params.offerId,
      employeeId
    );
    res.json(result);
  } catch (error: unknown) {
    log.error('[InboundOpportunity] Offer acceptance failed:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * Notify contractor about filled shift
 */
router.post('/notify-contractor/:workspaceId/:stagedShiftId', async (req, res) => {
  try {
    const result = await inboundOpportunityAgent.notifyContractor(
      req.params.workspaceId,
      req.params.stagedShiftId
    );
    res.json(result);
  } catch (error: unknown) {
    log.error('[InboundOpportunity] Contractor notification failed:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ============================================================================
// EMPLOYEE BEHAVIOR SCORING ROUTES
// ============================================================================

/**
 * Get employee behavior score
 */
router.get('/employee-score/:employeeId', async (req, res) => {
  try {
    const score = await employeeBehaviorScoring.getEmployeeScore(
      req.params.employeeId
    );
    
    if (score) {
      res.json({ success: true, score });
    } else {
      res.status(404).json({ success: false, error: 'No score found for employee' });
    }
  } catch (error: unknown) {
    log.error('[BehaviorScoring] Failed to get score:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * Get all employee scores for a workspace
 */
router.get('/workspace-scores/:workspaceId', async (req, res) => {
  try {
    const scores = await employeeBehaviorScoring.getWorkspaceScores(
      req.params.workspaceId
    );
    res.json({ success: true, scores });
  } catch (error: unknown) {
    log.error('[BehaviorScoring] Failed to get workspace scores:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * Get top performers for a workspace
 */
router.get('/top-performers/:workspaceId', async (req, res) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 10), 500);
    const topPerformers = await employeeBehaviorScoring.getTopPerformers(
      req.params.workspaceId,
      limit
    );
    res.json({ success: true, topPerformers });
  } catch (error: unknown) {
    log.error('[BehaviorScoring] Failed to get top performers:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * Get behavior analytics for a workspace
 */
router.get('/behavior-analytics/:workspaceId', async (req, res) => {
  try {
    const analytics = await employeeBehaviorScoring.getWorkspaceAnalytics(
      req.params.workspaceId
    );
    res.json({ success: true, analytics });
  } catch (error: unknown) {
    log.error('[BehaviorScoring] Failed to get analytics:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * Rank employees for a shift
 */
router.post('/rank-employees/:workspaceId', async (req, res) => {
  try {
    const { criteria, candidateEmployeeIds } = req.body;
    
    const rankedEmployees = await employeeBehaviorScoring.rankEmployeesForShift(
      req.params.workspaceId,
      criteria || {},
      candidateEmployeeIds
    );
    res.json({ success: true, rankedEmployees });
  } catch (error: unknown) {
    log.error('[BehaviorScoring] Failed to rank employees:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * Record a behavior event
 */
router.post('/record-behavior', async (req, res) => {
  try {
    await employeeBehaviorScoring.recordBehavior(req.body);
    res.json({ success: true, message: 'Behavior recorded' });
  } catch (error: unknown) {
    log.error('[BehaviorScoring] Failed to record behavior:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ============================================================================
// EXECUTION PIPELINE MONITORING ROUTES
// ============================================================================

/**
 * Get execution log by ID
 */
router.get('/execution/:executionId', async (req, res) => {
  try {
    const log = await executionPipeline.getExecutionLog(req.params.executionId);
    
    if (log) {
      res.json({ success: true, log });
    } else {
      res.status(404).json({ success: false, error: 'Execution not found' });
    }
  } catch (error: unknown) {
    log.error('[ExecutionPipeline] Failed to get log:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * Get recent executions for a workspace
 */
router.get('/executions/:workspaceId', async (req, res) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 500);
    const executions = await executionPipeline.getRecentExecutions(
      req.params.workspaceId,
      limit
    );
    res.json({ success: true, executions });
  } catch (error: unknown) {
    log.error('[ExecutionPipeline] Failed to get executions:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * Get execution statistics
 */
router.get('/execution-stats/:workspaceId?', async (req, res) => {
  try {
    const stats = await executionPipeline.getExecutionStats(
      req.params.workspaceId
    );
    res.json({ success: true, stats });
  } catch (error: unknown) {
    log.error('[ExecutionPipeline] Failed to get stats:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ============================================================================
// STAFFING PIPELINE MANAGEMENT DASHBOARD ROUTES
// ============================================================================

router.get('/pipeline/inbound-emails/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;

    let query = db.select({
      id: inboundEmails.id,
      fromEmail: inboundEmails.fromEmail,
      fromName: inboundEmails.fromName,
      subject: inboundEmails.subject,
      status: inboundEmails.status,
      isShiftRequest: inboundEmails.isShiftRequest,
      classificationConfidence: inboundEmails.classificationConfidence,
      hasAttachments: inboundEmails.hasAttachments,
      attachmentCount: inboundEmails.attachmentCount,
      processedAt: inboundEmails.processedAt,
      createdAt: inboundEmails.createdAt,
    })
    .from(inboundEmails)
    .where(eq(inboundEmails.workspaceId, workspaceId))
    .orderBy(desc(inboundEmails.createdAt))
    .limit(limit)
    .offset(offset);

    const emails = await query;

    const [countResult] = await db.select({ count: sql`count(*)` })
      .from(inboundEmails)
      .where(eq(inboundEmails.workspaceId, workspaceId));

    res.json({
      success: true,
      emails,
      total: Number(countResult?.count || 0),
      limit,
      offset,
    });
  } catch (error: unknown) {
    log.error('[Pipeline] Inbound emails fetch error:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/pipeline/staged-shifts/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const status = req.query.status as string;

    const shifts = await db.select({
      id: stagedShifts.id,
      location: stagedShifts.location,
      shiftDate: stagedShifts.shiftDate,
      startTime: stagedShifts.startTime,
      endTime: stagedShifts.endTime,
      payRate: stagedShifts.payRate,
      clientName: stagedShifts.clientName,
      status: stagedShifts.status,
      assignedEmployeeId: stagedShifts.assignedEmployeeId,
      assignedAt: stagedShifts.assignedAt,
      sourceType: stagedShifts.sourceType,
      overallConfidence: stagedShifts.overallConfidence,
      needsManualReview: stagedShifts.needsManualReview,
      manualReviewReason: stagedShifts.manualReviewReason,
      processedByAi: stagedShifts.processedByAi,
      createdAt: stagedShifts.createdAt,
    })
    // @ts-expect-error — TS migration: fix in refactoring sprint
    .where(eq(stagedShifts.workspaceId, workspaceId))
    .orderBy(desc(stagedShifts.createdAt))
    .limit(100);

    const shiftsWithEmployees = await Promise.all(shifts.map(async (shift: any) => {
      let assignedEmployeeName = null;
      if (shift.assignedEmployeeId) {
        const [emp] = await db.select({
          firstName: employees.firstName,
          lastName: employees.lastName,
        })
        .from(employees)
        .where(eq(employees.id, shift.assignedEmployeeId))
        .limit(1);
        if (emp) {
          assignedEmployeeName = `${emp.firstName} ${emp.lastName}`.trim();
        }
      }
      return { ...shift, assignedEmployeeName };
    }));

    res.json({
      success: true,
      shifts: shiftsWithEmployees,
      total: shiftsWithEmployees.length,
    });
  } catch (error: unknown) {
    log.error('[Pipeline] Staged shifts fetch error:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/pipeline/offers/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const offers = await db.select({
      id: automatedShiftOffers.id,
      stagedShiftId: automatedShiftOffers.stagedShiftId,
      employeeId: automatedShiftOffers.employeeId,
      offerRank: automatedShiftOffers.offerRank,
      matchScore: automatedShiftOffers.matchScore,
      matchReasoning: automatedShiftOffers.matchReasoning,
      status: automatedShiftOffers.status,
      offerExpiresAt: automatedShiftOffers.offerExpiresAt,
      respondedAt: automatedShiftOffers.respondedAt,
      aiApprovalStatus: automatedShiftOffers.aiApprovalStatus,
      aiApprovalConfidence: automatedShiftOffers.aiApprovalConfidence,
      emailNotificationSent: automatedShiftOffers.emailNotificationSent,
      createdAt: automatedShiftOffers.createdAt,
    })
    .from(automatedShiftOffers)
    .where(eq(automatedShiftOffers.workspaceId, workspaceId))
    .orderBy(desc(automatedShiftOffers.createdAt))
    .limit(100);

    const offersWithNames = await Promise.all(offers.map(async (offer) => {
      const [emp] = await db.select({
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: employees.email,
      })
      .from(employees)
      .where(eq(employees.id, offer.employeeId))
      .limit(1);

      return {
        ...offer,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}`.trim() : 'Unknown',
        employeeEmail: emp?.email || null,
      };
    }));

    res.json({
      success: true,
      offers: offersWithNames,
      total: offersWithNames.length,
    });
  } catch (error: unknown) {
    log.error('[Pipeline] Offers fetch error:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/pipeline/prospects/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const prospects = await db.select()
      .from(clientProspects)
      .where(eq(clientProspects.workspaceId, workspaceId))
      .orderBy(desc(clientProspects.createdAt))
      .limit(100);

    res.json({
      success: true,
      prospects,
      total: prospects.length,
    });
  } catch (error: unknown) {
    log.error('[Pipeline] Prospects fetch error:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/pipeline/dashboard/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const [emailStats] = await db.select({
      total: sql`count(*)`,
      shiftRequests: sql`count(*) filter (where ${inboundEmails.isShiftRequest} = true)`,
      contracts: sql`count(*) filter (where ${inboundEmails.status} = 'contract_pending_review')`,
    })
    .from(inboundEmails)
    .where(eq(inboundEmails.workspaceId, workspaceId));

    const [shiftStats] = await db.select({
      total: sql`count(*)`,
      readyToStaff: sql`count(*) filter (where ${stagedShifts.status} = 'ready_to_staff')`,
      staffingInProgress: sql`count(*) filter (where ${stagedShifts.status} = 'staffing_in_progress')`,
      assigned: sql`count(*) filter (where ${stagedShifts.status} = 'assigned')`,
      contractorNotified: sql`count(*) filter (where ${stagedShifts.status} = 'contractor_notified')`,
      pendingReview: sql`count(*) filter (where ${stagedShifts.status} = 'pending_review')`,
    })
    // @ts-expect-error — TS migration: fix in refactoring sprint
    .where(eq(stagedShifts.workspaceId, workspaceId));

    const [offerStats] = await db.select({
      total: sql`count(*)`,
      pending: sql`count(*) filter (where ${automatedShiftOffers.status} = 'pending_response')`,
      accepted: sql`count(*) filter (where ${automatedShiftOffers.status} = 'accepted')`,
      declined: sql`count(*) filter (where ${automatedShiftOffers.status} = 'declined')`,
      withdrawn: sql`count(*) filter (where ${automatedShiftOffers.status} = 'withdrawn')`,
    })
    .from(automatedShiftOffers)
    .where(eq(automatedShiftOffers.workspaceId, workspaceId));

    const [prospectStats] = await db.select({
      total: sql`count(*)`,
      temp: sql`count(*) filter (where ${clientProspects.accessStatus} = 'temp')`,
      converted: sql`count(*) filter (where ${clientProspects.accessStatus} = 'converted')`,
      totalShiftsFilled: sql`coalesce(sum(${clientProspects.totalShiftsFilled}), 0)`,
    })
    .from(clientProspects)
    .where(eq(clientProspects.workspaceId, workspaceId));

    res.json({
      success: true,
      dashboard: {
        emails: {
          total: Number(emailStats?.total || 0),
          shiftRequests: Number(emailStats?.shiftRequests || 0),
          contracts: Number(emailStats?.contracts || 0),
        },
        shifts: {
          total: Number(shiftStats?.total || 0),
          readyToStaff: Number(shiftStats?.readyToStaff || 0),
          staffingInProgress: Number(shiftStats?.staffingInProgress || 0),
          assigned: Number(shiftStats?.assigned || 0),
          contractorNotified: Number(shiftStats?.contractorNotified || 0),
          pendingReview: Number(shiftStats?.pendingReview || 0),
        },
        offers: {
          total: Number(offerStats?.total || 0),
          pending: Number(offerStats?.pending || 0),
          accepted: Number(offerStats?.accepted || 0),
          declined: Number(offerStats?.declined || 0),
          withdrawn: Number(offerStats?.withdrawn || 0),
        },
        prospects: {
          total: Number(prospectStats?.total || 0),
          temp: Number(prospectStats?.temp || 0),
          converted: Number(prospectStats?.converted || 0),
          totalShiftsFilled: Number(prospectStats?.totalShiftsFilled || 0),
        },
      },
    });
  } catch (error: unknown) {
    log.error('[Pipeline] Dashboard fetch error:', sanitizeError(error));
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

export default router;
