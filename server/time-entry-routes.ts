// Time Platform - Universal Time Tracking & Clock System
// Comprehensive time tracking with clock in/out, break management, and approval workflow

import { Router } from 'express';
import { db } from "./db";
import { gamificationService } from "./services/gamification/gamificationService";
import { isFeatureEnabled } from '@shared/platformConfig';
import { eq, and, isNull, desc, gte, lte, sql } from "drizzle-orm";
import { startOfWeek, endOfWeek, subDays } from "date-fns";
import './types';
import { 
  timeEntries,
  timeEntryBreaks,
  timeEntryAuditEvents,
  employees,
  users,
  insertTimeEntrySchema,
  insertTimeEntryBreakSchema,
  insertTimeEntryAuditEventSchema,
  type TimeEntry,
  type TimeEntryBreak,
  type TimeEntryAuditEvent
} from "@shared/schema";
import { requireAuth } from "./auth";
import { requireWorkspaceRole, type AuthenticatedRequest } from "./rbac";
import { readLimiter, mutationLimiter } from "./middleware/rateLimiter";

export const timeEntryRouter = Router();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create audit event for time tracking action
 */
async function createAuditEvent(params: {
  workspaceId: string;
  timeEntryId?: string;
  breakId?: string;
  actorUserId: string;
  actorEmployeeId?: string;
  actorName: string;
  actionType: 'clock_in' | 'clock_out' | 'start_break' | 'end_break' | 'edit_time' | 'approve_time' | 'reject_time' | 'delete_time' | 'manual_entry' | 'system_adjustment';
  description: string;
  payload?: any;
  ipAddress?: string;
  userAgent?: string;
}) {
  return await db.insert(timeEntryAuditEvents).values({
    workspaceId: params.workspaceId,
    timeEntryId: params.timeEntryId,
    breakId: params.breakId,
    actorUserId: params.actorUserId,
    actorEmployeeId: params.actorEmployeeId,
    actorName: params.actorName,
    actionType: params.actionType,
    description: params.description,
    payload: params.payload,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  }).returning();
}

/**
 * Calculate total hours between two timestamps
 */
function calculateHours(start: Date, end: Date): number {
  const diff = end.getTime() - start.getTime();
  return parseFloat((diff / (1000 * 60 * 60)).toFixed(2));
}

/**
 * Check if user has permission to view time entry
 */
function canViewTimeEntry(entry: TimeEntry, employeeId: string | undefined, workspaceRole: string): boolean {
  // Staff can only view their own entries
  if (workspaceRole === 'staff') {
    return entry.employeeId === employeeId;
  }
  // Managers, admins, and owners can view all entries
  return ['manager', 'org_admin', 'org_owner'].includes(workspaceRole);
}

/**
 * Check if user can approve time entries
 */
function canApproveTimeEntries(workspaceRole: string): boolean {
  return ['manager', 'org_admin', 'org_owner'].includes(workspaceRole);
}

// ============================================================================
// CLOCK IN/OUT ENDPOINTS
// ============================================================================

/**
 * GET /api/time-entries/status - Get current clock status for logged-in employee
 * Returns active time entry if clocked in, null if clocked out
 */
timeEntryRouter.get('/status', requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    // Get employee record
    const [employee] = await db.select().from(employees)
      .where(and(
        eq(employees.userId, user.id),
        eq(employees.workspaceId, user.currentWorkspaceId)
      ))
      .limit(1);

    if (!employee) {
      return res.status(404).json({ error: 'Employee record not found' });
    }

    // Check for active time entry (clockOut is null)
    const [activeEntry] = await db.select().from(timeEntries)
      .where(and(
        eq(timeEntries.employeeId, employee.id),
        eq(timeEntries.workspaceId, user.currentWorkspaceId),
        isNull(timeEntries.clockOut)
      ))
      .limit(1);

    // Get active break if exists
    let activeBreak: TimeEntryBreak | null = null;
    if (activeEntry) {
      const [breakRecord] = await db.select().from(timeEntryBreaks)
        .where(and(
          eq(timeEntryBreaks.timeEntryId, activeEntry.id),
          isNull(timeEntryBreaks.endTime)
        ))
        .limit(1);
      activeBreak = breakRecord || null;
    }

    res.json({
      isClockedIn: !!activeEntry,
      activeTimeEntry: activeEntry || null,
      activeBreak: activeBreak,
      employeeId: employee.id,
      employeeName: `${employee.firstName} ${employee.lastName}`
    });
  } catch (error) {
    console.error('Error getting clock status:', error);
    res.status(500).json({ error: 'Failed to get clock status' });
  }
});

/**
 * POST /api/time-entries/clock-in - Clock in (start new time entry)
 */
timeEntryRouter.post('/clock-in', requireAuth, mutationLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    // Validate request body
    const clockInSchema = insertTimeEntrySchema.pick({
      shiftId: true,
      clientId: true,
      clockInLatitude: true,
      clockInLongitude: true,
      clockInAccuracy: true,
      notes: true,
    }).partial();

    const validation = clockInSchema.safeParse({
      shiftId: req.body.shiftId,
      clientId: req.body.clientId,
      clockInLatitude: req.body.latitude,
      clockInLongitude: req.body.longitude,
      clockInAccuracy: req.body.accuracy,
      notes: req.body.notes,
    });

    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const { shiftId, clientId, clockInLatitude: latitude, clockInLongitude: longitude, clockInAccuracy: accuracy, notes } = validation.data;

    // Get employee record
    const [employee] = await db.select().from(employees)
      .where(and(
        eq(employees.userId, user.id),
        eq(employees.workspaceId, user.currentWorkspaceId)
      ))
      .limit(1);

    if (!employee) {
      return res.status(404).json({ error: 'Employee record not found' });
    }

    // Check if already clocked in
    const [existingEntry] = await db.select().from(timeEntries)
      .where(and(
        eq(timeEntries.employeeId, employee.id),
        eq(timeEntries.workspaceId, user.currentWorkspaceId),
        isNull(timeEntries.clockOut)
      ))
      .limit(1);

    if (existingEntry) {
      return res.status(400).json({ error: 'Already clocked in. Please clock out first.' });
    }

    // Create new time entry
    const clockInTime = new Date();
    const [newEntry] = await db.insert(timeEntries).values({
      workspaceId: user.currentWorkspaceId,
      employeeId: employee.id,
      shiftId: shiftId || null,
      clientId: clientId || null,
      clockIn: clockInTime,
      clockInLatitude: latitude || null,
      clockInLongitude: longitude || null,
      clockInAccuracy: accuracy || null,
      clockInIpAddress: req.ip || null,
      hourlyRate: employee.hourlyRate || null,
      notes: notes || null,
      status: 'pending'
    }).returning();

    // Create audit event
    await createAuditEvent({
      workspaceId: user.currentWorkspaceId,
      timeEntryId: newEntry.id,
      actorUserId: user.id,
      actorEmployeeId: employee.id,
      actorName: `${employee.firstName} ${employee.lastName}`,
      actionType: 'clock_in',
      description: `Clocked in at ${clockInTime.toLocaleTimeString()}`,
      payload: { latitude, longitude, accuracy, shiftId, clientId },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    // Gamification: Update streak and award points on clock-in
    if (isFeatureEnabled('enableGamification')) {
      try {
        const { streak, isNewRecord } = await gamificationService.updateStreak(
          user.currentWorkspaceId,
          employee.id
        );
        await gamificationService.awardPoints({
          workspaceId: user.currentWorkspaceId,
          employeeId: employee.id,
          points: 5,
          transactionType: 'clock_in',
          referenceId: newEntry.id,
          referenceType: 'time_entry',
          description: 'Daily clock-in bonus',
        });
        await gamificationService.checkStreakAchievements(
          user.currentWorkspaceId,
          employee.id,
          streak
        );
      } catch (gamError) {
        console.error('Gamification update failed (non-blocking):', gamError);
      }
    }

    res.status(201).json({ 
      message: 'Clocked in successfully',
      timeEntry: newEntry 
    });
  } catch (error) {
    console.error('Error clocking in:', error);
    res.status(500).json({ error: 'Failed to clock in' });
  }
});

/**
 * POST /api/time-entries/clock-out - Clock out (complete time entry)
 */
timeEntryRouter.post('/clock-out', requireAuth, mutationLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    // Validate request body
    const clockOutSchema = insertTimeEntrySchema.pick({
      clockOutLatitude: true,
      clockOutLongitude: true,
      clockOutAccuracy: true,
      notes: true,
    }).partial();

    const validation = clockOutSchema.safeParse({
      clockOutLatitude: req.body.latitude,
      clockOutLongitude: req.body.longitude,
      clockOutAccuracy: req.body.accuracy,
      notes: req.body.notes,
    });

    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const { clockOutLatitude: latitude, clockOutLongitude: longitude, clockOutAccuracy: accuracy, notes } = validation.data;

    // Get employee record
    const [employee] = await db.select().from(employees)
      .where(and(
        eq(employees.userId, user.id),
        eq(employees.workspaceId, user.currentWorkspaceId)
      ))
      .limit(1);

    if (!employee) {
      return res.status(404).json({ error: 'Employee record not found' });
    }

    // Find active time entry
    const [activeEntry] = await db.select().from(timeEntries)
      .where(and(
        eq(timeEntries.employeeId, employee.id),
        eq(timeEntries.workspaceId, user.currentWorkspaceId),
        isNull(timeEntries.clockOut)
      ))
      .limit(1);

    if (!activeEntry) {
      return res.status(400).json({ error: 'No active time entry found. Please clock in first.' });
    }

    // End any active breaks
    await db.update(timeEntryBreaks)
      .set({ endTime: new Date() })
      .where(and(
        eq(timeEntryBreaks.timeEntryId, activeEntry.id),
        isNull(timeEntryBreaks.endTime)
      ));

    // Calculate total hours
    const clockOutTime = new Date();
    const totalHours = calculateHours(new Date(activeEntry.clockIn), clockOutTime);

    // Update time entry with clock out
    const [updatedEntry] = await db.update(timeEntries)
      .set({
        clockOut: clockOutTime,
        clockOutLatitude: latitude || null,
        clockOutLongitude: longitude || null,
        clockOutAccuracy: accuracy || null,
        clockOutIpAddress: req.ip || null,
        totalHours: totalHours.toString(),
        totalAmount: activeEntry.hourlyRate 
          ? (parseFloat(activeEntry.hourlyRate) * totalHours).toFixed(2)
          : null,
        notes: notes || activeEntry.notes,
        updatedAt: new Date()
      })
      .where(eq(timeEntries.id, activeEntry.id))
      .returning();

    // Create audit event
    await createAuditEvent({
      workspaceId: user.currentWorkspaceId,
      timeEntryId: activeEntry.id,
      actorUserId: user.id,
      actorEmployeeId: employee.id,
      actorName: `${employee.firstName} ${employee.lastName}`,
      actionType: 'clock_out',
      description: `Clocked out at ${clockOutTime.toLocaleTimeString()} - Total: ${totalHours} hours`,
      payload: { latitude, longitude, accuracy, totalHours },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ 
      message: 'Clocked out successfully',
      timeEntry: updatedEntry,
      totalHours 
    });
  } catch (error) {
    console.error('Error clocking out:', error);
    res.status(500).json({ error: 'Failed to clock out' });
  }
});

// ============================================================================
// BREAK MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * POST /api/time-entries/break/start - Start a break
 */
timeEntryRouter.post('/break/start', requireAuth, mutationLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    // Validate request body
    const startBreakSchema = insertTimeEntryBreakSchema.pick({
      breakType: true,
      isPaid: true,
      notes: true,
    }).partial().extend({
      breakType: insertTimeEntryBreakSchema.shape.breakType.default('rest'),
      isPaid: insertTimeEntryBreakSchema.shape.isPaid.default(false),
    });

    const validation = startBreakSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const { breakType, isPaid, notes } = validation.data;

    // Get employee record
    const [employee] = await db.select().from(employees)
      .where(and(
        eq(employees.userId, user.id),
        eq(employees.workspaceId, user.currentWorkspaceId)
      ))
      .limit(1);

    if (!employee) {
      return res.status(404).json({ error: 'Employee record not found' });
    }

    // Find active time entry
    const [activeEntry] = await db.select().from(timeEntries)
      .where(and(
        eq(timeEntries.employeeId, employee.id),
        eq(timeEntries.workspaceId, user.currentWorkspaceId),
        isNull(timeEntries.clockOut)
      ))
      .limit(1);

    if (!activeEntry) {
      return res.status(400).json({ error: 'Must be clocked in to take a break' });
    }

    // Check if already on break
    const [existingBreak] = await db.select().from(timeEntryBreaks)
      .where(and(
        eq(timeEntryBreaks.timeEntryId, activeEntry.id),
        isNull(timeEntryBreaks.endTime)
      ))
      .limit(1);

    if (existingBreak) {
      return res.status(400).json({ error: 'Already on break' });
    }

    // Create break record
    const breakStartTime = new Date();
    const [newBreak] = await db.insert(timeEntryBreaks).values({
      workspaceId: user.currentWorkspaceId,
      timeEntryId: activeEntry.id,
      employeeId: employee.id,
      breakType,
      startTime: breakStartTime,
      isPaid,
      notes
    }).returning();

    // Create audit event
    await createAuditEvent({
      workspaceId: user.currentWorkspaceId,
      timeEntryId: activeEntry.id,
      breakId: newBreak.id,
      actorUserId: user.id,
      actorEmployeeId: employee.id,
      actorName: `${employee.firstName} ${employee.lastName}`,
      actionType: 'start_break',
      description: `Started ${breakType} break at ${breakStartTime.toLocaleTimeString()}`,
      payload: { breakType, isPaid },
      userAgent: req.get('user-agent')
    });

    res.status(201).json({ 
      message: 'Break started',
      break: newBreak 
    });
  } catch (error) {
    console.error('Error starting break:', error);
    res.status(500).json({ error: 'Failed to start break' });
  }
});

/**
 * POST /api/time-entries/break/end - End a break
 */
timeEntryRouter.post('/break/end', requireAuth, mutationLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    // Get employee record
    const [employee] = await db.select().from(employees)
      .where(and(
        eq(employees.userId, user.id),
        eq(employees.workspaceId, user.currentWorkspaceId)
      ))
      .limit(1);

    if (!employee) {
      return res.status(404).json({ error: 'Employee record not found' });
    }

    // Find active time entry
    const [activeEntry] = await db.select().from(timeEntries)
      .where(and(
        eq(timeEntries.employeeId, employee.id),
        eq(timeEntries.workspaceId, user.currentWorkspaceId),
        isNull(timeEntries.clockOut)
      ))
      .limit(1);

    if (!activeEntry) {
      return res.status(400).json({ error: 'No active time entry found' });
    }

    // Find active break
    const [activeBreak] = await db.select().from(timeEntryBreaks)
      .where(and(
        eq(timeEntryBreaks.timeEntryId, activeEntry.id),
        isNull(timeEntryBreaks.endTime)
      ))
      .limit(1);

    if (!activeBreak) {
      return res.status(400).json({ error: 'No active break found' });
    }

    // Calculate break duration
    const breakEndTime = new Date();
    const durationMinutes = (breakEndTime.getTime() - new Date(activeBreak.startTime).getTime()) / (1000 * 60);

    // Update break record
    const [updatedBreak] = await db.update(timeEntryBreaks)
      .set({
        endTime: breakEndTime,
        duration: durationMinutes.toFixed(2),
        updatedAt: new Date()
      })
      .where(eq(timeEntryBreaks.id, activeBreak.id))
      .returning();

    // Create audit event
    await createAuditEvent({
      workspaceId: user.currentWorkspaceId,
      timeEntryId: activeEntry.id,
      breakId: activeBreak.id,
      actorUserId: user.id,
      actorEmployeeId: employee.id,
      actorName: `${employee.firstName} ${employee.lastName}`,
      actionType: 'end_break',
      description: `Ended break at ${breakEndTime.toLocaleTimeString()} - Duration: ${durationMinutes.toFixed(0)} minutes`,
      payload: { durationMinutes: durationMinutes.toFixed(2) },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    res.json({ 
      message: 'Break ended',
      break: updatedBreak,
      durationMinutes: parseFloat(durationMinutes.toFixed(2))
    });
  } catch (error) {
    console.error('Error ending break:', error);
    res.status(500).json({ error: 'Failed to end break' });
  }
});

// ============================================================================
// TIMESHEET VIEWING & FILTERING
// ============================================================================

/**
 * GET /api/time-entries - Get time entries with filtering
 * Query params: employeeId, startDate, endDate, status
 */
timeEntryRouter.get('/entries', requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { employeeId, startDate, endDate, status } = req.query;

    // Get current employee record for RBAC
    const [currentEmployee] = await db.select().from(employees)
      .where(and(
        eq(employees.userId, user.id),
        eq(employees.workspaceId, user.currentWorkspaceId)
      ))
      .limit(1);

    if (!currentEmployee) {
      return res.status(404).json({ error: 'Employee record not found' });
    }

    // Build query conditions
    const conditions = [eq(timeEntries.workspaceId, user.currentWorkspaceId)];

    // Staff can only see their own entries
    if (currentEmployee.workspaceRole === 'staff') {
      conditions.push(eq(timeEntries.employeeId, currentEmployee.id));
    } else if (employeeId) {
      // Managers/admins can filter by employee
      conditions.push(eq(timeEntries.employeeId, employeeId as string));
    }

    // Date range filtering
    if (startDate) {
      conditions.push(gte(timeEntries.clockIn, new Date(startDate as string)));
    }
    if (endDate) {
      conditions.push(lte(timeEntries.clockIn, new Date(endDate as string)));
    }

    // Status filtering
    if (status) {
      conditions.push(eq(timeEntries.status, status as string));
    }

    // Fetch time entries
    const entries = await db.select({
      id: timeEntries.id,
      employeeId: timeEntries.employeeId,
      employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
      totalHours: timeEntries.totalHours,
      totalAmount: timeEntries.totalAmount,
      status: timeEntries.status,
      approvedBy: timeEntries.approvedBy,
      approvedAt: timeEntries.approvedAt,
      notes: timeEntries.notes,
      createdAt: timeEntries.createdAt
    })
    .from(timeEntries)
    .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
    .where(and(...conditions))
    .orderBy(desc(timeEntries.clockIn));

    res.json({ entries });
  } catch (error) {
    console.error('Error fetching time entries:', error);
    res.status(500).json({ error: 'Failed to fetch time entries' });
  }
});

/**
 * GET /api/time-entries/:id - Get single time entry with breaks and audit log
 */
timeEntryRouter.get('/entries/:id', requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { id } = req.params;

    // Get time entry
    const [entry] = await db.select().from(timeEntries)
      .where(and(
        eq(timeEntries.id, id),
        eq(timeEntries.workspaceId, user.currentWorkspaceId)
      ))
      .limit(1);

    if (!entry) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    // Get current employee for RBAC
    const [currentEmployee] = await db.select().from(employees)
      .where(and(
        eq(employees.userId, user.id),
        eq(employees.workspaceId, user.currentWorkspaceId)
      ))
      .limit(1);

    if (!currentEmployee) {
      return res.status(404).json({ error: 'Employee record not found' });
    }

    // Check permissions
    if (!canViewTimeEntry(entry, currentEmployee.id, currentEmployee.workspaceRole || 'staff')) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Get breaks for this entry
    const breaks = await db.select().from(timeEntryBreaks)
      .where(eq(timeEntryBreaks.timeEntryId, id))
      .orderBy(desc(timeEntryBreaks.startTime));

    // Get audit events
    const auditEvents = await db.select().from(timeEntryAuditEvents)
      .where(eq(timeEntryAuditEvents.timeEntryId, id))
      .orderBy(desc(timeEntryAuditEvents.occurredAt));

    res.json({ 
      entry,
      breaks,
      auditEvents
    });
  } catch (error) {
    console.error('Error fetching time entry:', error);
    res.status(500).json({ error: 'Failed to fetch time entry' });
  }
});

// ============================================================================
// APPROVAL WORKFLOW ENDPOINTS
// ============================================================================

/**
 * POST /api/time-entries/:id/approve - Approve a time entry
 */
timeEntryRouter.post('/entries/:id/approve', requireAuth, requireWorkspaceRole(['department_manager', 'org_admin', 'org_owner']), mutationLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { id } = req.params;
    
    // Validate optional notes field
    const approveSchema = insertTimeEntrySchema.pick({ notes: true }).partial();
    const validation = approveSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const { notes } = validation.data;

    // Get time entry
    const [entry] = await db.select().from(timeEntries)
      .where(and(
        eq(timeEntries.id, id),
        eq(timeEntries.workspaceId, user.currentWorkspaceId)
      ))
      .limit(1);

    if (!entry) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    if (entry.status === 'approved') {
      return res.status(400).json({ error: 'Time entry already approved' });
    }

    // Get employee record
    const [employee] = await db.select().from(employees)
      .where(and(
        eq(employees.userId, user.id),
        eq(employees.workspaceId, user.currentWorkspaceId)
      ))
      .limit(1);

    // Update time entry
    const approvedAt = new Date();
    const [updatedEntry] = await db.update(timeEntries)
      .set({
        status: 'approved',
        approvedBy: user.id,
        approvedAt,
        updatedAt: new Date()
      })
      .where(eq(timeEntries.id, id))
      .returning();

    // Create audit event
    await createAuditEvent({
      workspaceId: user.currentWorkspaceId,
      timeEntryId: id,
      actorUserId: user.id,
      actorEmployeeId: employee?.id,
      actorName: employee ? `${employee.firstName} ${employee.lastName}` : user.email || 'Unknown',
      actionType: 'approve_time',
      description: `Approved time entry - ${entry.totalHours} hours`,
      payload: { notes, previousStatus: entry.status },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    res.json({ 
      message: 'Time entry approved',
      timeEntry: updatedEntry
    });
  } catch (error) {
    console.error('Error approving time entry:', error);
    res.status(500).json({ error: 'Failed to approve time entry' });
  }
});

/**
 * POST /api/time-entries/:id/reject - Reject a time entry
 */
timeEntryRouter.post('/entries/:id/reject', requireAuth, requireWorkspaceRole(['department_manager', 'org_admin', 'org_owner']), mutationLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { id } = req.params;
    
    // Validate rejection reason
    const rejectSchema = insertTimeEntrySchema.pick({ rejectionReason: true }).required();
    const validation = rejectSchema.safeParse({ rejectionReason: req.body.reason });

    if (!validation.success) {
      return res.status(400).json({ error: 'Rejection reason is required', details: validation.error.errors });
    }

    const { rejectionReason: reason } = validation.data;

    // Get time entry
    const [entry] = await db.select().from(timeEntries)
      .where(and(
        eq(timeEntries.id, id),
        eq(timeEntries.workspaceId, user.currentWorkspaceId)
      ))
      .limit(1);

    if (!entry) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    // Get employee record
    const [employee] = await db.select().from(employees)
      .where(and(
        eq(employees.userId, user.id),
        eq(employees.workspaceId, user.currentWorkspaceId)
      ))
      .limit(1);

    // Update time entry
    const rejectedAt = new Date();
    const [updatedEntry] = await db.update(timeEntries)
      .set({
        status: 'rejected',
        rejectedBy: user.id,
        rejectedAt,
        rejectionReason: reason,
        updatedAt: new Date()
      })
      .where(eq(timeEntries.id, id))
      .returning();

    // Create audit event
    await createAuditEvent({
      workspaceId: user.currentWorkspaceId,
      timeEntryId: id,
      actorUserId: user.id,
      actorEmployeeId: employee?.id,
      actorName: employee ? `${employee.firstName} ${employee.lastName}` : user.email || 'Unknown',
      actionType: 'reject_time',
      description: `Rejected time entry - Reason: ${reason}`,
      payload: { reason, previousStatus: entry.status },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    res.json({ 
      message: 'Time entry rejected',
      timeEntry: updatedEntry
    });
  } catch (error) {
    console.error('Error rejecting time entry:', error);
    res.status(500).json({ error: 'Failed to reject time entry' });
  }
});

// ============================================================================
// ACTIVE STATUS ENDPOINTS
// ============================================================================

/**
 * GET /api/time-entries/active - Get all currently clocked-in employees (for managers)
 */
timeEntryRouter.get('/active', requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    // Get active time entries (clockOut is null)
    const activeEntries = await db.select({
      entryId: timeEntries.id,
      employeeId: employees.id,
      employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
      clockIn: timeEntries.clockIn,
      hoursSoFar: sql<number>`EXTRACT(EPOCH FROM (NOW() - ${timeEntries.clockIn})) / 3600`,
      isOnBreak: sql<boolean>`EXISTS(SELECT 1 FROM ${timeEntryBreaks} WHERE ${timeEntryBreaks.timeEntryId} = ${timeEntries.id} AND ${timeEntryBreaks.endTime} IS NULL)`
    })
    .from(timeEntries)
    .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
    .where(and(
      eq(timeEntries.workspaceId, user.currentWorkspaceId),
      isNull(timeEntries.clockOut)
    ))
    .orderBy(desc(timeEntries.clockIn));

    res.json({ activeEntries });
  } catch (error) {
    console.error('Error fetching active employees:', error);
    res.status(500).json({ error: 'Failed to fetch active employees' });
  }
});

// ============================================================================
// TIMESHEET REPORTS ENDPOINTS
// ============================================================================

/**
 * GET /api/time-entries/reports/summary - Get timesheet summary report
 * Aggregates hours by employee for a date range (weekly, bi-weekly, monthly)
 */
timeEntryRouter.get('/reports/summary', requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { startDate, endDate, period = 'weekly', employeeId } = req.query;

    // Calculate date range based on period
    let rangeStart: Date;
    let rangeEnd: Date;
    const now = new Date();

    if (startDate && endDate) {
      rangeStart = new Date(startDate as string);
      rangeEnd = new Date(endDate as string);
    } else {
      switch (period) {
        case 'biweekly':
          rangeStart = subDays(now, 14);
          rangeEnd = now;
          break;
        case 'monthly':
          rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
          rangeEnd = now;
          break;
        case 'weekly':
        default:
          rangeStart = startOfWeek(now, { weekStartsOn: 1 });
          rangeEnd = endOfWeek(now, { weekStartsOn: 1 });
      }
    }

    // Build query conditions
    const conditions = [
      eq(timeEntries.workspaceId, user.currentWorkspaceId),
      gte(timeEntries.clockIn, rangeStart),
      lte(timeEntries.clockIn, rangeEnd)
    ];

    if (employeeId) {
      conditions.push(eq(timeEntries.employeeId, employeeId as string));
    }

    // Aggregate by employee
    const summary = await db.select({
      employeeId: timeEntries.employeeId,
      employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
      email: employees.email,
      totalEntries: sql<number>`COUNT(${timeEntries.id})`,
      totalHours: sql<number>`COALESCE(SUM(CAST(${timeEntries.totalHours} AS DECIMAL)), 0)`,
      regularHours: sql<number>`LEAST(COALESCE(SUM(CAST(${timeEntries.totalHours} AS DECIMAL)), 0), 40)`,
      overtimeHours: sql<number>`GREATEST(COALESCE(SUM(CAST(${timeEntries.totalHours} AS DECIMAL)), 0) - 40, 0)`,
      approvedHours: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.status} = 'approved' THEN CAST(${timeEntries.totalHours} AS DECIMAL) ELSE 0 END), 0)`,
      pendingHours: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.status} = 'pending' THEN CAST(${timeEntries.totalHours} AS DECIMAL) ELSE 0 END), 0)`,
      rejectedHours: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.status} = 'rejected' THEN CAST(${timeEntries.totalHours} AS DECIMAL) ELSE 0 END), 0)`,
      avgHoursPerDay: sql<number>`COALESCE(AVG(CAST(${timeEntries.totalHours} AS DECIMAL)), 0)`,
      totalBreakMinutes: sql<number>`COALESCE(SUM(CAST((SELECT SUM(CAST(duration AS DECIMAL)) FROM time_entry_breaks WHERE time_entry_breaks.time_entry_id = ${timeEntries.id}) AS DECIMAL)), 0)`,
      earliestClockIn: sql<Date>`MIN(${timeEntries.clockIn})`,
      latestClockOut: sql<Date>`MAX(${timeEntries.clockOut})`
    })
    .from(timeEntries)
    .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
    .where(and(...conditions))
    .groupBy(timeEntries.employeeId, employees.firstName, employees.lastName, employees.email);

    // Calculate workspace totals
    const workspaceTotals = summary.reduce((acc, emp) => ({
      totalEmployees: acc.totalEmployees + 1,
      totalHours: acc.totalHours + (typeof emp.totalHours === 'number' ? emp.totalHours : 0),
      totalRegularHours: acc.totalRegularHours + (typeof emp.regularHours === 'number' ? emp.regularHours : 0),
      totalOvertimeHours: acc.totalOvertimeHours + (typeof emp.overtimeHours === 'number' ? emp.overtimeHours : 0),
      totalApprovedHours: acc.totalApprovedHours + (typeof emp.approvedHours === 'number' ? emp.approvedHours : 0),
      totalPendingHours: acc.totalPendingHours + (typeof emp.pendingHours === 'number' ? emp.pendingHours : 0)
    }), {
      totalEmployees: 0,
      totalHours: 0,
      totalRegularHours: 0,
      totalOvertimeHours: 0,
      totalApprovedHours: 0,
      totalPendingHours: 0
    });

    res.json({
      period: {
        type: period,
        startDate: rangeStart,
        endDate: rangeEnd
      },
      employees: summary,
      totals: workspaceTotals,
      generatedAt: new Date()
    });
  } catch (error) {
    console.error('Error generating timesheet summary:', error);
    res.status(500).json({ error: 'Failed to generate timesheet summary' });
  }
});

/**
 * GET /api/time-entries/reports/export - Export timesheet data as CSV
 */
timeEntryRouter.get('/reports/export', requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { startDate, endDate, format: exportFormat = 'csv', employeeId } = req.query;

    // Build conditions
    const conditions = [eq(timeEntries.workspaceId, user.currentWorkspaceId)];

    if (startDate) {
      conditions.push(gte(timeEntries.clockIn, new Date(startDate as string)));
    }
    if (endDate) {
      conditions.push(lte(timeEntries.clockIn, new Date(endDate as string)));
    }
    if (employeeId) {
      conditions.push(eq(timeEntries.employeeId, employeeId as string));
    }

    // Fetch all time entries for export
    const entries = await db.select({
      id: timeEntries.id,
      employeeId: timeEntries.employeeId,
      employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
      employeeEmail: employees.email,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
      totalHours: timeEntries.totalHours,
      hourlyRate: timeEntries.hourlyRate,
      totalAmount: timeEntries.totalAmount,
      status: timeEntries.status,
      approvedBy: timeEntries.approvedBy,
      approvedAt: timeEntries.approvedAt,
      notes: timeEntries.notes
    })
    .from(timeEntries)
    .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
    .where(and(...conditions))
    .orderBy(desc(timeEntries.clockIn));

    if (exportFormat === 'csv') {
      // Generate CSV content
      const headers = [
        'Employee Name',
        'Employee Email',
        'Clock In',
        'Clock Out',
        'Total Hours',
        'Hourly Rate',
        'Total Amount',
        'Status',
        'Approved At',
        'Notes'
      ];

      const rows = entries.map(entry => [
        entry.employeeName,
        entry.employeeEmail || '',
        entry.clockIn ? new Date(entry.clockIn).toISOString() : '',
        entry.clockOut ? new Date(entry.clockOut).toISOString() : '',
        entry.totalHours || '',
        entry.hourlyRate || '',
        entry.totalAmount || '',
        entry.status || 'pending',
        entry.approvedAt ? new Date(entry.approvedAt).toISOString() : '',
        (entry.notes || '').replace(/"/g, '""')
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="timesheet_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
    } else {
      // Return JSON for other processing
      res.json({ entries, exportedAt: new Date() });
    }
  } catch (error) {
    console.error('Error exporting timesheet:', error);
    res.status(500).json({ error: 'Failed to export timesheet' });
  }
});

/**
 * GET /api/time-entries/reports/compliance - Compliance report for labor law tracking
 */
timeEntryRouter.get('/reports/compliance', requireAuth, requireWorkspaceRole(['department_manager', 'org_admin', 'org_owner']), readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { startDate, endDate } = req.query;
    const rangeStart = startDate ? new Date(startDate as string) : subDays(new Date(), 7);
    const rangeEnd = endDate ? new Date(endDate as string) : new Date();

    // Check for compliance issues
    const complianceData = await db.select({
      employeeId: timeEntries.employeeId,
      employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
      date: sql<string>`DATE(${timeEntries.clockIn})`,
      dailyHours: sql<number>`SUM(CAST(${timeEntries.totalHours} AS DECIMAL))`,
      breakMinutes: sql<number>`COALESCE(SUM(CAST((SELECT SUM(CAST(duration AS DECIMAL)) FROM time_entry_breaks WHERE time_entry_breaks.time_entry_id = ${timeEntries.id}) AS DECIMAL)), 0)`,
      entriesCount: sql<number>`COUNT(${timeEntries.id})`
    })
    .from(timeEntries)
    .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
    .where(and(
      eq(timeEntries.workspaceId, user.currentWorkspaceId),
      gte(timeEntries.clockIn, rangeStart),
      lte(timeEntries.clockIn, rangeEnd)
    ))
    .groupBy(timeEntries.employeeId, employees.firstName, employees.lastName, sql`DATE(${timeEntries.clockIn})`);

    // Identify violations
    const violations = complianceData.filter(entry => {
      const dailyHours = typeof entry.dailyHours === 'number' ? entry.dailyHours : 0;
      const breakMinutes = typeof entry.breakMinutes === 'number' ? entry.breakMinutes : 0;
      
      return (
        dailyHours > 12 || // Over 12 hours in a day
        (dailyHours > 6 && breakMinutes < 30) // Worked over 6 hours without adequate break
      );
    }).map(entry => ({
      ...entry,
      violations: [
        ...(typeof entry.dailyHours === 'number' && entry.dailyHours > 12 
          ? ['Exceeded 12 hours daily limit'] 
          : []),
        ...(typeof entry.dailyHours === 'number' && entry.dailyHours > 6 && 
           typeof entry.breakMinutes === 'number' && entry.breakMinutes < 30 
          ? ['Insufficient break time (requires 30min for 6+ hour shift)'] 
          : [])
      ]
    }));

    res.json({
      period: { startDate: rangeStart, endDate: rangeEnd },
      totalEmployees: new Set(complianceData.map(e => e.employeeId)).size,
      totalViolations: violations.length,
      violations,
      generatedAt: new Date()
    });
  } catch (error) {
    console.error('Error generating compliance report:', error);
    res.status(500).json({ error: 'Failed to generate compliance report' });
  }
});

// Note: This is a named export, not default export
// Used in server/routes.ts as: import { timeEntryRouter } from "./time-entry-routes";
