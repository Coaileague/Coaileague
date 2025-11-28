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

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { 
  coaileagueEmployeeProfiles, 
  employeeEventLog,
  employeeScoreSnapshots,
  scoringWeightProfiles,
  aiDecisionAudit,
  schedulerNotificationEvents,
  shiftAcceptanceRecords,
} from '@shared/schema';
import { eq, and, desc, sql, gte, lte, count } from 'drizzle-orm';
import { 
  coaileagueScoringService, 
  ScoringEventType, 
  SchedulerNotFoundError, 
  SchedulerAccessDeniedError 
} from '../services/automation/coaileagueScoringService';

const router = Router();

/**
 * Helper to handle scheduler errors consistently
 */
function handleSchedulerError(error: unknown, res: Response, defaultMessage: string) {
  console.error('[Scheduler API]', defaultMessage, error);
  
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
    const workspaceId = (req.session as any)?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Workspace not identified' });
    }

    const profiles = await db.query.coaileagueEmployeeProfiles.findMany({
      where: eq(coaileagueEmployeeProfiles.workspaceId, workspaceId),
      orderBy: desc(coaileagueEmployeeProfiles.overallScore),
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
    const workspaceId = (req.session as any)?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Workspace not identified' });
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
    const workspaceId = (req.session as any)?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Workspace not identified' });
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
    const workspaceId = (req.session as any)?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Workspace not identified' });
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
      triggeredBy: triggeredBy || (req.session as any)?.userId,
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
    const workspaceId = (req.session as any)?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Workspace not identified' });
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
    const workspaceId = (req.session as any)?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Workspace not identified' });
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
    const workspaceId = (req.session as any)?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Workspace not identified' });
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
    const workspaceId = (req.session as any)?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Workspace not identified' });
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
    const workspaceId = (req.session as any)?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Workspace not identified' });
    }

    const userId = (req.session as any)?.userId;
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
    const workspaceId = (req.session as any)?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Workspace not identified' });
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
    const workspaceId = (req.session as any)?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Workspace not identified' });
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
    const workspaceId = (req.session as any)?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Workspace not identified' });
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
    const workspaceId = (req.session as any)?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Workspace not identified' });
    }

    const { severity, recipientUserId, limit = '50' } = req.query;

    const whereConditions = [eq(schedulerNotificationEvents.workspaceId, workspaceId)];
    if (severity) {
      whereConditions.push(eq(schedulerNotificationEvents.severity, severity as string));
    }
    if (recipientUserId) {
      whereConditions.push(eq(schedulerNotificationEvents.recipientUserId, recipientUserId as string));
    }

    const notifications = await db.query.schedulerNotificationEvents.findMany({
      where: and(...whereConditions),
      orderBy: desc(schedulerNotificationEvents.createdAt),
      limit: parseInt(limit as string),
    });

    res.json(notifications);
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
    const workspaceId = (req.session as any)?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Workspace not identified' });
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
    const workspaceId = (req.session as any)?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Workspace not identified' });
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

export default router;
