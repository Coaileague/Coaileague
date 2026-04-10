/**
 * Autonomous Scheduler API Routes
 * 
 * Provides REST endpoints for:
 * - Employee scoring events
 * - Profile management
 * - Pool membership
 * - Historical snapshots
 * - AI decision audit queries
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { 
  coaileagueEmployeeProfiles, 
  employeeEventLog,
  employeeScoreSnapshots,
  aiDecisionAudit,
  scoringWeightProfiles,
  schedulerNotificationEvents,
  shiftAcceptanceRecords,
  publishedSchedules,
  scheduleSnapshots,
  shifts,
  timeEntries,
  employees,
} from '@shared/schema';
import { eq, and, desc, sql, gte, lte, count, isNull, lt, isNotNull, notInArray } from 'drizzle-orm';
import { 
  coaileagueScoringService, 
  ScoringEventType, 
  SchedulerNotFoundError, 
  SchedulerAccessDeniedError 
} from '../services/automation/coaileagueScoringService';
import { scheduleRollbackService } from '../services/scheduleRollbackService';
import { requireAuth } from '../auth';
import { calculateInvoiceLineItem, calculateGrossPay, toFinancialString } from '../services/financialCalculator';
import { createLogger } from '../lib/logger';
const log = createLogger('SchedulerRoutes');


const router = Router();

router.use(requireAuth);

/**
 * Helper to handle scheduler errors consistently
 */
function handleSchedulerError(error: unknown, res: Response, defaultMessage: string) {
  log.error('[Scheduler API]', defaultMessage, error);
  
  if (error instanceof SchedulerNotFoundError) {
    return res.status(404).json({ error: 'Resource not found in this workspace' });
  }
  if (error instanceof SchedulerAccessDeniedError) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  return res.status(500).json({ error: defaultMessage });
}

// ============================================================================
// EMPLOYEE PROFILE ENDPOINTS
// ============================================================================

/**
 * GET /api/scheduler/profiles
 * List all employee profiles for a workspace
 */
router.get('/profiles', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || (req as any).session?.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ error: 'Workspace not identified' });
    }

    const { limit = '500' } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit as string) || 500, 1), 1000);

    const profiles = await db.query.coaileagueEmployeeProfiles.findMany({
      where: eq(coaileagueEmployeeProfiles.workspaceId, workspaceId),
      orderBy: desc(coaileagueEmployeeProfiles.overallScore),
      limit: parsedLimit,
    });

    res.json(profiles);
  } catch (error) {
    return handleSchedulerError(error, res, 'Failed to fetch profiles');
  }
});

/**
 * GET /api/scheduler/profiles/:employeeId
 * Get or create a specific employee's profile
 */
router.get('/profiles/:employeeId', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || (req as any).session?.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ error: 'Workspace not identified' });
    }

    const { employeeId } = req.params;
    const profile = await coaileagueScoringService.getOrCreateProfile(workspaceId, employeeId);
    res.json(profile);
  } catch (error) {
    return handleSchedulerError(error, res, 'Failed to fetch profile');
  }
});

/**
 * POST /api/scheduler/profiles/:employeeId/pool
 * Update pool membership for an employee
 */
router.post('/profiles/:employeeId/pool', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || (req as any).session?.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ error: 'Workspace not identified' });
    }

    const { employeeId } = req.params;
    const { isInOrgPool, isInGlobalPool, globalPoolCategories } = req.body;

    // Verify employee belongs to this workspace
    const profile = await db.query.coaileagueEmployeeProfiles.findFirst({
      where: and(
        eq(coaileagueEmployeeProfiles.employeeId, employeeId),
        eq(coaileagueEmployeeProfiles.workspaceId, workspaceId)
      ),
    });

    if (!profile) {
      return res.status(404).json({ error: 'Employee profile not found in this workspace' });
    }

    await coaileagueScoringService.updatePoolMembership(workspaceId, employeeId, {
      isInOrgPool,
      isInGlobalPool,
      globalPoolCategories,
    });

    res.json({ success: true, message: 'Pool membership updated' });
  } catch (error) {
    return handleSchedulerError(error, res, 'Failed to update pool membership');
  }
});

// ============================================================================
// SCORING EVENT ENDPOINTS
// ============================================================================

/**
 * POST /api/scheduler/events
 * Process a scoring event for an employee
 */
router.post('/events', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || (req as any).session?.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ error: 'Workspace not identified' });
    }

    const { employeeId, eventType, referenceId, referenceType, metadata, triggeredBy, isAutomatic } = req.body;

    if (!employeeId || !eventType) {
      return res.status(400).json({ error: 'employeeId and eventType are required' });
    }

    const validEventTypes: ScoringEventType[] = [
      'clock_in_on_time', 'clock_in_late', 'clock_out_on_time', 'clock_out_early', 'clock_out_late',
      'shift_completed', 'shift_perfect', 'shift_no_show', 'shift_call_off', 'shift_call_off_late',
      'shift_accepted', 'shift_rejected', 'shift_dropped',
      'client_positive_feedback', 'client_negative_feedback', 'client_neutral_feedback',
      'overtime_compliance', 'overtime_violation',
      'certification_added', 'certification_expired', 'certification_renewed',
      'training_completed', 'skill_verified',
      'manual_adjustment',
    ];

    if (!validEventTypes.includes(eventType)) {
      return res.status(400).json({ error: `Invalid eventType. Must be one of: ${validEventTypes.join(', ')}` });
    }

    const result = await coaileagueScoringService.processEvent(workspaceId, employeeId, eventType, {
      referenceId,
      referenceType,
      metadata,
      triggeredBy: triggeredBy || (req as any).session?.userId,
      isAutomatic: isAutomatic ?? false,
    });

    res.json(result);
  } catch (error) {
    return handleSchedulerError(error, res, 'Failed to process event');
  }
});

/**
 * GET /api/scheduler/events/:employeeId
 * Get event history for an employee
 */
router.get('/events/:employeeId', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || (req as any).session?.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ error: 'Workspace not identified' });
    }

    const { employeeId } = req.params;
    const { limit = '50', offset = '0' } = req.query;

    const events = await db.query.employeeEventLog.findMany({
      where: and(
        eq(employeeEventLog.employeeId, employeeId),
        eq(employeeEventLog.workspaceId, workspaceId)
      ),
      orderBy: desc(employeeEventLog.createdAt),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    res.json(events);
  } catch (error) {
    return handleSchedulerError(error, res, 'Failed to fetch events');
  }
});

// ============================================================================
// SNAPSHOT ENDPOINTS
// ============================================================================

/**
 * POST /api/scheduler/snapshots
 * Create a historical snapshot for an employee
 */
router.post('/snapshots', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || (req as any).session?.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ error: 'Workspace not identified' });
    }

    const { employeeId, periodType, periodStart, periodEnd } = req.body;

    if (!employeeId || !periodType || !periodStart || !periodEnd) {
      return res.status(400).json({ error: 'employeeId, periodType, periodStart, and periodEnd are required' });
    }

    await coaileagueScoringService.createSnapshot(
      workspaceId,
      employeeId,
      periodType,
      new Date(periodStart),
      new Date(periodEnd)
    );

    res.json({ success: true, message: 'Snapshot created' });
  } catch (error) {
    return handleSchedulerError(error, res, 'Failed to create snapshot');
  }
});

/**
 * GET /api/scheduler/snapshots/:employeeId
 * Get historical snapshots for an employee
 */
router.get('/snapshots/:employeeId', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || (req as any).session?.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ error: 'Workspace not identified' });
    }

    const { employeeId } = req.params;
    const { periodType, limit = '12' } = req.query;

    const whereConditions = [
      eq(employeeScoreSnapshots.employeeId, employeeId),
      eq(employeeScoreSnapshots.workspaceId, workspaceId)
    ];
    if (periodType) {
      whereConditions.push(eq(employeeScoreSnapshots.periodType, periodType as string));
    }

    const snapshots = await db.query.employeeScoreSnapshots.findMany({
      where: and(...whereConditions),
      orderBy: desc(employeeScoreSnapshots.periodStart),
      limit: parseInt(limit as string),
    });

    res.json(snapshots);
  } catch (error) {
    return handleSchedulerError(error, res, 'Failed to fetch snapshots');
  }
});

// ============================================================================
// WEIGHT PROFILE ENDPOINTS
// ============================================================================

/**
 * GET /api/scheduler/weight-profiles
 * Get all weight profiles for a workspace
 */
router.get('/weight-profiles', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || (req as any).session?.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ error: 'Workspace not identified' });
    }

    const profiles = await db.query.scoringWeightProfiles.findMany({
      where: eq(scoringWeightProfiles.workspaceId, workspaceId),
      orderBy: desc(scoringWeightProfiles.isDefault),
    });

    res.json(profiles);
  } catch (error) {
    return handleSchedulerError(error, res, 'Failed to fetch weight profiles');
  }
});

/**
 * POST /api/scheduler/weight-profiles
 * Create a new weight profile
 */
router.post('/weight-profiles', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || (req as any).session?.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ error: 'Workspace not identified' });
    }

    const userId = req.user?.id || (req as any).session?.userId;
    const { profileName, description, isDefault, ...weights } = req.body;

    if (!profileName) {
      return res.status(400).json({ error: 'profileName is required' });
    }

    // If this is default, unset other defaults
    if (isDefault) {
      await db.update(scoringWeightProfiles)
        .set({ isDefault: false })
        .where(and(
          eq(scoringWeightProfiles.workspaceId, workspaceId),
          eq(scoringWeightProfiles.isDefault, true)
        ));
    }

    const [profile] = await db.insert(scoringWeightProfiles).values({
      workspaceId,
      profileName,
      description,
      isDefault: isDefault ?? false,
      createdBy: userId,
      ...weights,
    }).returning();

    res.json(profile);
  } catch (error) {
    return handleSchedulerError(error, res, 'Failed to create weight profile');
  }
});

// ============================================================================
// AI DECISION AUDIT ENDPOINTS
// ============================================================================

/**
 * GET /api/scheduler/ai-decisions
 * Get AI decision audit log
 */
router.get('/ai-decisions', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || (req as any).session?.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ error: 'Workspace not identified' });
    }

    const { decisionType, employeeId, limit = '50', offset = '0' } = req.query;

    const whereConditions = [eq(aiDecisionAudit.workspaceId, workspaceId)];
    if (decisionType) {
      whereConditions.push(eq(aiDecisionAudit.decisionType, decisionType as string));
    }
    if (employeeId) {
      whereConditions.push(eq(aiDecisionAudit.selectedEmployeeId, employeeId as string));
    }

    const decisions = await db.query.aiDecisionAudit.findMany({
      where: and(...whereConditions),
      orderBy: desc(aiDecisionAudit.createdAt),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    res.json(decisions);
  } catch (error) {
    return handleSchedulerError(error, res, 'Failed to fetch AI decisions');
  }
});

// ============================================================================
// SHIFT ACCEPTANCE ENDPOINTS
// ============================================================================

/**
 * GET /api/scheduler/acceptances/:shiftId
 * Get acceptance records for a shift
 */
router.get('/acceptances/:shiftId', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || (req as any).session?.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ error: 'Workspace not identified' });
    }

    const { shiftId } = req.params;

    const records = await db.query.shiftAcceptanceRecords.findMany({
      where: and(
        eq(shiftAcceptanceRecords.shiftId, shiftId),
        eq(shiftAcceptanceRecords.workspaceId, workspaceId)
      ),
      orderBy: desc(shiftAcceptanceRecords.createdAt),
    });

    res.json(records);
  } catch (error) {
    return handleSchedulerError(error, res, 'Failed to fetch acceptance records');
  }
});

/**
 * POST /api/scheduler/acceptances/:recordId/respond
 * Respond to a shift offer (accept/decline)
 */
router.post('/acceptances/:recordId/respond', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || (req as any).session?.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ error: 'Workspace not identified' });
    }

    const { recordId } = req.params;
    const { response, declinedReason, acceptanceNotes } = req.body;

    if (!response || !['accepted', 'declined'].includes(response)) {
      return res.status(400).json({ error: 'response must be "accepted" or "declined"' });
    }

    // First verify the record belongs to this workspace
    const existingRecord = await db.query.shiftAcceptanceRecords.findFirst({
      where: and(
        eq(shiftAcceptanceRecords.id, recordId),
        eq(shiftAcceptanceRecords.workspaceId, workspaceId)
      ),
    });

    if (!existingRecord) {
      return res.status(404).json({ error: 'Acceptance record not found in this workspace' });
    }

    const now = new Date();
    const updateData: any = {
      action: response,
      acknowledgedAt: now,
    };

    if (response === 'declined') {
      updateData.notes = declinedReason;
    } else {
      updateData.notes = acceptanceNotes;
    }

    const [record] = await db.update(shiftAcceptanceRecords)
      .set(updateData)
      .where(and(
        eq(shiftAcceptanceRecords.id, recordId),
        eq(shiftAcceptanceRecords.workspaceId, workspaceId)
      ))
      .returning();

    // Trigger scoring event based on response
    const eventType: ScoringEventType = response === 'accepted' ? 'shift_accepted' : 'shift_rejected';

    await coaileagueScoringService.processEvent(workspaceId, record.employeeId, eventType, {
      referenceId: record.shiftId ?? undefined,
      referenceType: 'shift',
      isAutomatic: true,
    });

    res.json(record);
  } catch (error) {
    return handleSchedulerError(error, res, 'Failed to respond to offer');
  }
});

// ============================================================================
// NOTIFICATION ENDPOINTS
// ============================================================================

/**
 * GET /api/scheduler/notifications
 * Get scheduler notifications for a workspace
 */
router.get('/notifications', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || (req as any).session?.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ error: 'Workspace not identified' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 200);
    const offset = (page - 1) * limit;
    const { severity, recipientUserId } = req.query;

    const whereConditions = [eq(schedulerNotificationEvents.workspaceId, workspaceId)];
    if (severity) {
      whereConditions.push(eq(schedulerNotificationEvents.severity, severity as string));
    }
    if (recipientUserId) {
      whereConditions.push(eq(schedulerNotificationEvents.recipientUserId, recipientUserId as string));
    }

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schedulerNotificationEvents)
      .where(and(...whereConditions));
    
    const total = countResult?.count || 0;

    const notifications = await db.query.schedulerNotificationEvents.findMany({
      where: and(...whereConditions),
      orderBy: desc(schedulerNotificationEvents.createdAt),
      limit,
      offset,
    });

    res.json({
      data: notifications,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    return handleSchedulerError(error, res, 'Failed to fetch notifications');
  }
});

// ============================================================================
// ANALYTICS ENDPOINTS
// ============================================================================

/**
 * GET /api/scheduler/analytics/reliability-trend/:employeeId
 * Get reliability trend for an employee
 */
router.get('/analytics/reliability-trend/:employeeId', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || (req as any).session?.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ error: 'Workspace not identified' });
    }

    const { employeeId } = req.params;
    
    // Verify employee profile belongs to this workspace
    const profile = await db.query.coaileagueEmployeeProfiles.findFirst({
      where: and(
        eq(coaileagueEmployeeProfiles.employeeId, employeeId),
        eq(coaileagueEmployeeProfiles.workspaceId, workspaceId)
      ),
    });

    if (!profile) {
      return res.status(404).json({ error: 'Employee profile not found in this workspace' });
    }

    const trend = await coaileagueScoringService.detectReliabilityTrend(workspaceId, employeeId);
    res.json({ employeeId, trend });
  } catch (error) {
    return handleSchedulerError(error, res, 'Failed to fetch trend');
  }
});

/**
 * GET /api/scheduler/analytics/leaderboard
 * Get top performers in a workspace
 */
router.get('/analytics/leaderboard', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || (req as any).session?.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ error: 'Workspace not identified' });
    }

    const { limit = '10', sortBy = 'overallScore' } = req.query;

    let leaderboard;
    if (sortBy === 'reliability') {
      leaderboard = await db.query.coaileagueEmployeeProfiles.findMany({
        where: eq(coaileagueEmployeeProfiles.workspaceId, workspaceId),
        orderBy: desc(coaileagueEmployeeProfiles.reliabilityScore),
        limit: parseInt(limit as string),
      });
    } else if (sortBy === 'netPoints') {
      leaderboard = await db.query.coaileagueEmployeeProfiles.findMany({
        where: eq(coaileagueEmployeeProfiles.workspaceId, workspaceId),
        orderBy: desc(coaileagueEmployeeProfiles.netPoints),
        limit: parseInt(limit as string),
      });
    } else {
      leaderboard = await db.query.coaileagueEmployeeProfiles.findMany({
        where: eq(coaileagueEmployeeProfiles.workspaceId, workspaceId),
        orderBy: desc(coaileagueEmployeeProfiles.overallScore),
        limit: parseInt(limit as string),
      });
    }

    res.json(leaderboard);
  } catch (error) {
    return handleSchedulerError(error, res, 'Failed to fetch leaderboard');
  }
});

// ============================================================================
// SCHEDULE ROLLBACK ENDPOINTS
// ============================================================================

/**
 * GET /api/scheduler/schedules/published
 * Get published schedules for a workspace (with rollback availability)
 */
router.get('/schedules/published', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || (req as any).session?.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ error: 'Workspace not identified' });
    }

    const published = await db.query.publishedSchedules.findMany({
      where: eq(publishedSchedules.workspaceId, workspaceId),
      orderBy: desc(publishedSchedules.publishedAt),
      limit: 20,
    });

    const snapshots = await scheduleRollbackService.getSnapshots(workspaceId);
    const snapshotMap = new Map(snapshots.map(s => [s.publishedScheduleId, s]));

    const enriched = published.map(p => ({
      ...p,
      hasSnapshot: snapshotMap.has(p.id),
      isRolledBack: snapshotMap.get(p.id)?.isRolledBack || false,
      rollbackAvailable: snapshotMap.has(p.id) && !snapshotMap.get(p.id)?.isRolledBack,
    }));

    res.json(enriched);
  } catch (error) {
    return handleSchedulerError(error, res, 'Failed to fetch published schedules');
  }
});

/**
 * GET /api/scheduler/schedules/:scheduleId/snapshots
 * Get snapshots for a specific published schedule
 */
router.get('/schedules/:scheduleId/snapshots', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || (req as any).session?.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ error: 'Workspace not identified' });
    }

    const { scheduleId } = req.params;
    
    const schedule = await db.query.publishedSchedules.findFirst({
      where: and(
        eq(publishedSchedules.id, scheduleId),
        eq(publishedSchedules.workspaceId, workspaceId)
      ),
    });

    if (!schedule) {
      return res.status(404).json({ error: 'Published schedule not found' });
    }

    const snapshots = await scheduleRollbackService.getSnapshots(workspaceId, scheduleId);
    res.json(snapshots);
  } catch (error) {
    return handleSchedulerError(error, res, 'Failed to fetch snapshots');
  }
});

/**
 * POST /api/scheduler/schedules/:scheduleId/rollback
 * Rollback a published schedule to its previous snapshot
 */
router.post('/schedules/:scheduleId/rollback', async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || (req as any).session?.workspaceId;
    const userId = req.user?.id || (req as any).session?.userId;
    const userRole = (req as any).session?.role;
    
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const allowedRoles = ['org_owner', 'co_owner', 'org_admin', 'manager', 'root_admin', 'deputy_admin', 'sysop'];
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Only admins and managers can rollback schedules' });
    }

    const { scheduleId } = req.params;
    const { reason, notifyEmployees = true } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({ error: 'A rollback reason is required (at least 5 characters)' });
    }

    const schedule = await db.query.publishedSchedules.findFirst({
      where: and(
        eq(publishedSchedules.id, scheduleId),
        eq(publishedSchedules.workspaceId, workspaceId)
      ),
    });

    if (!schedule) {
      return res.status(404).json({ error: 'Published schedule not found' });
    }

    const result = await scheduleRollbackService.rollback(
      workspaceId,
      scheduleId,
      userId,
      reason.trim(),
      notifyEmployees
    );

    if (!result.success) {
      return res.status(400).json({ 
        error: result.message,
        code: result.error 
      });
    }

    res.json({
      success: true,
      message: result.message,
      affectedEmployees: result.affectedEmployees,
      restoredShifts: result.restoredShifts,
    });
  } catch (error) {
    return handleSchedulerError(error, res, 'Failed to rollback schedule');
  }
});

/**
 * POST /api/scheduler/dev/simulate-clockins
 * DEV-ONLY: Creates approved time_entries for all past assigned shifts that
 * don't already have a time_entry. This closes Gap 3 — without clock-in data
 * there are no time_entries, so invoice and payroll generation have nothing to process.
 *
 * Skipped in production (NODE_ENV=production).
 */
router.post('/dev/simulate-clockins', async (req: any, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Dev simulation not available in production' });
  }

  const workspaceId = req.workspaceId || req.user?.workspaceId;
  if (!workspaceId) {
    return res.status(400).json({ error: 'No workspace context in session' });
  }

  try {
    const now = new Date();

    // 1. Find all assigned past shifts with no time_entry
    const shiftsWithEntries = await db
      .select({ shiftId: timeEntries.shiftId })
      .from(timeEntries)
      .where(and(
        eq(timeEntries.workspaceId, workspaceId),
        isNotNull(timeEntries.shiftId)
      ));
    const coveredShiftIds = shiftsWithEntries.map(r => r.shiftId!).filter(Boolean);

    const pastShifts = await db
      .select()
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        isNotNull(shifts.employeeId),
        lt(shifts.endTime, now),
        ...(coveredShiftIds.length > 0 ? [notInArray(shifts.id, coveredShiftIds)] : [])
      ));

    if (pastShifts.length === 0) {
      return res.json({ success: true, created: 0, message: 'No uncovered past shifts found' });
    }

    // 2. Load employees for pay rate lookup
    const empIds = [...new Set(pastShifts.map(s => s.employeeId!).filter(Boolean))];
    const empRecords = await db.select().from(employees).where(
      and(eq(employees.workspaceId, workspaceId))
    );
    const empMap = new Map(empRecords.map(e => [e.id, e]));

    // 3. Build time_entry rows
    let created = 0;
    const errors: string[] = [];

    for (const shift of pastShifts) {
      try {
        if (!shift.employeeId || !shift.startTime || !shift.endTime) continue;

        const emp = empMap.get(shift.employeeId);
        const clockIn = new Date(shift.startTime);
        const clockOut = new Date(shift.endTime);
        const totalHoursNum = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
        const regularHours = Math.min(totalHoursNum, 8);
        const overtimeHours = Math.max(0, totalHoursNum - 8);

        const billRateRaw = parseFloat(shift.billRate || '0') || 0;
        const payRateRaw = parseFloat(shift.payRate || (emp as any)?.hourlyRate || '0') || 0;

        const billableAmountStr = billRateRaw > 0
          ? calculateInvoiceLineItem(toFinancialString(totalHoursNum), toFinancialString(billRateRaw))
          : null;
        const payableAmountStr = payRateRaw > 0
          ? calculateGrossPay(toFinancialString(regularHours), toFinancialString(overtimeHours), toFinancialString(payRateRaw))
          : null;

        await db.insert(timeEntries).values({
          workspaceId,
          shiftId: shift.id,
          employeeId: shift.employeeId,
          clientId: shift.clientId || null,
          clockIn,
          clockOut,
          totalHours: toFinancialString(totalHoursNum),
          regularHours: toFinancialString(regularHours),
          overtimeHours: toFinancialString(overtimeHours),
          capturedBillRate: billRateRaw > 0 ? toFinancialString(billRateRaw) : null,
          capturedPayRate: payRateRaw > 0 ? toFinancialString(payRateRaw) : null,
          hourlyRate: payRateRaw > 0 ? toFinancialString(payRateRaw) : (billRateRaw > 0 ? toFinancialString(billRateRaw) : null),
          billableAmount: billableAmountStr,
          payableAmount: payableAmountStr,
          totalAmount: billableAmountStr,
          billableToClient: true,
          status: 'approved',
          approvedBy: 'system-sim',
          approvedAt: now,
          notes: '[DEV] Auto-generated by simulate-clockins endpoint',
        });

        // Mark shift as completed
        await db.update(shifts)
          .set({ status: 'completed' })
          .where(eq(shifts.id, shift.id));

        created++;
      } catch (rowErr: unknown) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        errors.push(`shift ${shift.id}: ${rowErr.message}`);
      }
    }

    return res.json({
      success: true,
      created,
      total: pastShifts.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Created ${created} approved time entries from ${pastShifts.length} past shifts`,
    });
  } catch (err: unknown) {
    log.error('[Dev simulate-clockins]', err);
    return res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
