// Time Platform - Universal Time Tracking & Clock System
// Comprehensive time tracking with clock in/out, break management, and approval workflow

import { Router } from 'express';
// @ts-expect-error — TS migration: fix in refactoring sprint
import { db } from "../db";
import { gamificationService } from "../services/gamification/gamificationService";
import { emitGamificationEvent } from "../services/gamification/eventTracker";
import { aiBrainService } from "../services/ai-brain/aiBrainService";
import { isFeatureEnabled } from '@shared/platformConfig';
import { gpsGeofenceService } from "../services/gpsGeofenceService";
import { platformEventBus } from "../services/platformEventBus";
import { broadcastToWorkspace } from "../websocket";
import { eq, and, isNull, desc, gte, lte, sql, or } from "drizzle-orm";
import { calculateInvoiceLineItem, toFinancialString } from '../services/financialCalculator';
import { startOfWeek, endOfWeek, subDays, differenceInMinutes } from "date-fns";
import '../types';
import { 
  timeEntries,
  timeEntryBreaks,
  timeEntryAuditEvents,
  employees,
  clients,
  users,
  shifts,
  sites,
  shiftChatrooms,
  shiftChatroomMembers,
  shiftChatroomMessages,
  insertTimeEntrySchema,
  insertTimeEntryBreakSchema,
  insertTimeEntryAuditEventSchema,
  type TimeEntry,
  type TimeEntryBreak,
  type TimeEntryAuditEvent
} from "@shared/schema";
import { requireAuth } from "../auth";
import { requireWorkspaceRole, type AuthenticatedRequest } from "../rbac";
import { readLimiter, mutationLimiter } from "../middleware/rateLimiter";
import { universalNotificationEngine } from "../services/universalNotificationEngine";
// @ts-expect-error — TS migration: fix in refactoring sprint
import { db, pool } from '../db';
import { checkSchedulingEligibility } from '../services/compliance/trinityComplianceEngine';
import { storage } from '../storage';
import { createLogger } from '../lib/logger';
import { scheduleNonBlocking } from '../lib/scheduleNonBlocking';
import { loneWorkerSafetyService } from '../services/automation/loneWorkerSafetyService';
import { shiftHandoffService } from '../services/fieldOperations/shiftHandoffService';
import { presenceMonitorService } from '../services/fieldOperations/presenceMonitorService';
const log = createLogger('TimeEntryRoutes');

export const timeEntryRouter = Router();

// ============================================================================
// GEOFENCE HELPERS
// ============================================================================

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

type AuditEventTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
  tx?: AuditEventTx;
}) {
  const dbOrTx = params.tx ?? db;
  return await dbOrTx.insert(timeEntryAuditEvents).values({
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
 * Note: This returns GROSS hours - use calculateNetHours() to deduct breaks
 */
function calculateHours(start: Date, end: Date): number {
  // Validate inputs to prevent negative hours
  if (end.getTime() <= start.getTime()) {
    log.warn(`[TimeEntry] Warning: end time (${end.toISOString()}) is not after start time (${start.toISOString()})`);
    return 0;
  }
  const diff = end.getTime() - start.getTime();
  return parseFloat((diff / (1000 * 60 * 60)).toFixed(2));
}

/**
 * Calculate net hours after deducting break time
 * @param grossHours - Total hours worked (clock-in to clock-out)
 * @param breakMinutes - Total break time in minutes
 * @returns Net billable hours
 */
function calculateNetHours(grossHours: number, breakMinutes: number): number {
  const breakHours = breakMinutes / 60;
  const netHours = grossHours - breakHours;
  // Ensure non-negative
  return parseFloat(Math.max(0, netHours).toFixed(2));
}

/**
 * Get total break minutes for a time entry
 */
async function getTotalBreakMinutes(timeEntryId: string): Promise<number> {
  const breaks = await db.select({
    duration: timeEntryBreaks.duration,
  })
    .from(timeEntryBreaks)
    .where(eq(timeEntryBreaks.timeEntryId, timeEntryId));

  return breaks.reduce((total, b) => {
    const duration = parseFloat(b.duration?.toString() || '0');
    return total + (isNaN(duration) ? 0 : duration);
  }, 0);
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
  return ['manager', 'co_owner', 'org_owner'].includes(workspaceRole);
}

/**
 * Check if user can approve time entries
 */
function canApproveTimeEntries(workspaceRole: string): boolean {
  return ['manager', 'co_owner', 'org_owner'].includes(workspaceRole);
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
    const user = req.user!;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    // Get employee record
    const [employee] = await db.select().from(employees)
      .where(and(
        eq(employees.userId, user.id),
        eq(employees.workspaceId, workspaceId)
      ))
      .limit(1);

    if (!employee) {
      return res.json({
        isClockedIn: false,
        activeTimeEntry: null,
        activeBreak: null,
        employeeId: null,
        employeeName: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : null,
        shiftEligibility: { canClockIn: false, reason: 'no_employee_record' as any },
      });
    }

    // Check for active time entry (clockOut is null)
    const [activeEntry] = await db.select().from(timeEntries)
      .where(and(
        eq(timeEntries.employeeId, employee.id),
        eq(timeEntries.workspaceId, workspaceId),
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

    // Compute shift eligibility for clock-in gating (only relevant when not currently clocked in)
    // POLICY: org_owner and co_owner are exempt from all shift enforcement rules.
    type EligibilityReason = 'ok' | 'no_shift' | 'too_early' | 'late' | 'owner_exempt';
    let shiftEligibility: {
      canClockIn: boolean;
      reason: EligibilityReason;
      shiftStartTime?: string;
      minutesUntil?: number;
      minutesLate?: number;
    } = { canClockIn: true, reason: 'ok' };

    if (!activeEntry) {
      const isOwner = ['org_owner', 'co_owner'].includes(employee.workspaceRole || '');
      if (isOwner) {
        shiftEligibility = { canClockIn: true, reason: 'owner_exempt' };
      } else {
        const nowCheck = new Date();
        // Use both yesterday UTC and today UTC to avoid timezone edge cases
        // (e.g. officer clocking in at 8 PM PST = 4 AM UTC next day)
        const todayCheck = nowCheck.toISOString().split('T')[0];
        const yesterdayCheck = new Date(nowCheck.getTime() - 86400000).toISOString().split('T')[0];
        const [todayShiftCheck] = await db.select().from(shifts)
          .where(and(
            eq(shifts.workspaceId, workspaceId),
            eq(shifts.employeeId, employee.id),
            or(eq(shifts.date, todayCheck), eq(shifts.date, yesterdayCheck)),
            or(
              eq(shifts.status, 'scheduled'),
              eq(shifts.status, 'confirmed'),
              eq(shifts.status, 'published'),
              eq(shifts.status, 'pending')
            )
          ))
          .orderBy(shifts.startTime)
          .limit(1);

        if (!todayShiftCheck) {
          shiftEligibility = { canClockIn: false, reason: 'no_shift' };
        } else {
          const shiftStart = new Date(todayShiftCheck.startTime);
          if (nowCheck < shiftStart) {
            const minutesUntil = Math.round((shiftStart.getTime() - nowCheck.getTime()) / 60000);
            shiftEligibility = {
              canClockIn: false,
              reason: 'too_early',
              shiftStartTime: shiftStart.toISOString(),
              minutesUntil,
            };
          } else {
            const minutesLate = Math.round((nowCheck.getTime() - shiftStart.getTime()) / 60000);
            shiftEligibility = {
              canClockIn: true,
              reason: minutesLate > 0 ? 'late' : 'ok',
              minutesLate: minutesLate > 0 ? minutesLate : undefined,
            };
          }
        }
      }
    }

    res.json({
      isClockedIn: !!activeEntry,
      activeTimeEntry: activeEntry || null,
      activeBreak: activeBreak,
      employeeId: employee.id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      shiftEligibility,
    });
  } catch (error) {
    log.error('Error getting clock status:', error);
    res.status(500).json({ error: 'Failed to get clock status' });
  }
});

/**
 * POST /api/time-entries/clock-in - Clock in (start new time entry)
 */
timeEntryRouter.post('/clock-in', requireAuth, mutationLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    // Validate request body
    // Accept both payload shapes — web time-tracking UI sends `gpsLatitude/gpsLongitude/gpsAccuracy/photoUrl`,
    // while offline-queue replays and older callers send `latitude/longitude/accuracy`. Previously only the
    // second shape was read, so every GPS+photo from the main UI was silently discarded.
    const rawLatitude = req.body.gpsLatitude ?? req.body.latitude;
    const rawLongitude = req.body.gpsLongitude ?? req.body.longitude;
    const rawAccuracy = req.body.gpsAccuracy ?? req.body.accuracy;
    const rawPhotoUrl = typeof req.body.photoUrl === 'string' ? req.body.photoUrl : null;

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
      clockInLatitude: rawLatitude,
      clockInLongitude: rawLongitude,
      clockInAccuracy: rawAccuracy,
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
        eq(employees.workspaceId, workspaceId)
      ))
      .limit(1);

    if (!employee) {
      return res.status(404).json({ error: 'Employee record not found' });
    }

    // LIFECYCLE STATUS GATE — hard block on suspended or pending officers
    if ((employee as any).status === 'suspended') {
      return res.status(403).json({
        error: 'EMPLOYEE_SUSPENDED',
        message: 'Your access has been temporarily suspended. Contact your supervisor.',
      });
    }
    if ((employee as any).status === 'pending') {
      return res.status(403).json({
        error: 'EMPLOYEE_PENDING',
        message: 'Your account is pending activation. Contact your administrator.',
      });
    }

    // TIER 1 ONBOARDING GATE — block clock-in until required docs are complete
    // Owners/co-owners are exempt. Non-fatal: if DB check fails, proceed.
    if (!['org_owner', 'co_owner'].includes(employee.workspaceRole || '')) {
      try {
        const { rows: tier1Templates } = await pool.query(
          `SELECT id FROM onboarding_task_templates
           WHERE tier = 1 AND is_required = true AND is_active = true
             AND (workspace_id IS NULL OR workspace_id = $1)`,
          [workspaceId]
        );
        if (tier1Templates.length > 0) {
          const templateIds = tier1Templates.map((t: any) => t.id);
          const { rows: completions } = await pool.query(
            `SELECT task_template_id FROM employee_onboarding_completions
             WHERE employee_id = $1 AND status IN ('completed','waived')
               AND task_template_id = ANY($2)`,
            [employee.id, templateIds]
          );
          const completedIds = new Set(completions.map((c: any) => c.task_template_id));
          const pendingTier1 = tier1Templates.filter((t: any) => !completedIds.has(t.id));
          if (pendingTier1.length > 0) {
            return res.status(403).json({
              error: 'TIER1_ONBOARDING_INCOMPLETE',
              message: `You have ${pendingTier1.length} required onboarding task${pendingTier1.length > 1 ? 's' : ''} to complete before clocking in. Please complete your onboarding checklist.`,
              pendingCount: pendingTier1.length,
              canAskTrinity: true,
            });
          }
        }
      } catch (tier1Err) {
        // Non-fatal — onboarding tables may not exist yet; proceed with clock-in
      }
    }

    // SHIFT ENFORCEMENT: Employee must have a scheduled shift today
    // POLICY: org_owner and co_owner are exempt from all shift time rules.
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const trinityAssisted = req.body.trinityAssisted === true;
    const isOwner = ['org_owner', 'co_owner'].includes(employee.workspaceRole || '');

    const [todayShift] = await db.select().from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.employeeId, employee.id),
        eq(shifts.date, today),
        or(
          eq(shifts.status, 'scheduled'),
          eq(shifts.status, 'confirmed'),
          eq(shifts.status, 'published'),
          eq(shifts.status, 'pending')
        )
      ))
      .orderBy(shifts.startTime)
      .limit(1);

    if (!todayShift && !shiftId && !trinityAssisted && !isOwner) {
      return res.status(403).json({
        error: 'NO_SHIFT_TODAY',
        message: 'You are not scheduled to work today. If you believe this is an error, ask Trinity for help.',
        canAskTrinity: true,
      });
    }

    const resolvedShift = todayShift || null;

    // Track whether this is a late clock-in (requires manager notification + approval flag)
    let lateClockInMinutes = 0;

    if (resolvedShift && !trinityAssisted && !isOwner) {
      const shiftStart = new Date(resolvedShift.startTime);
      if (now < shiftStart) {
        const minutesUntil = Math.round((shiftStart.getTime() - now.getTime()) / 60000);
        return res.status(403).json({
          error: 'TOO_EARLY_TO_CLOCK_IN',
          message: `Your shift starts at ${shiftStart.toLocaleTimeString()}. Please clock in at that time.`,
          minutesUntil,
          shiftStartTime: shiftStart.toISOString(),
          canAskTrinity: true,
        });
      }
      lateClockInMinutes = Math.round((now.getTime() - shiftStart.getTime()) / 60000);
    }

    // POST ORDERS GATE — hard block if officer has not acknowledged site-specific post orders
    // Gate applies when the client has post orders text AND the employee has not acknowledged
    // them for THIS specific client. Owners/managers are exempt.
    const resolvedClientId = clientId || resolvedShift?.clientId || null;
    if (resolvedClientId && !isOwner) {
      const [clientForPostOrders] = await db
        .select({ postOrders: clients.postOrders })
        .from(clients)
        .where(and(eq(clients.id, resolvedClientId), eq(clients.workspaceId, workspaceId)))
        .limit(1);

      const hasPostOrders = !!(clientForPostOrders?.postOrders?.trim());
      const hasAcknowledged =
        employee.postOrdersAcknowledgedForClientId === resolvedClientId &&
        !!employee.postOrdersAcknowledgedAt;

      if (hasPostOrders && !hasAcknowledged) {
        return res.status(403).json({
          error: 'POST_ORDERS_NOT_ACKNOWLEDGED',
          message: 'You must review and acknowledge the post orders for this site before clocking in.',
          clientId: resolvedClientId,
          canAskTrinity: true,
        });
      }
    }

    // GAP-SCHED-8: LICENSE RE-VALIDATION AT CLOCK-IN
    // An officer's license may expire between assignment time and shift start.
    // This check catches that window. If expired, clock-in is blocked and the
    // supervisor receives an immediate in-app alert. Owners are exempt.
    if (!isOwner) {
      try {
        const licenseCheck = await checkSchedulingEligibility(employee.id, workspaceId);
        if (!licenseCheck.eligible) {
          // Alert all workspace supervisors/managers via in-app notification
          scheduleNonBlocking('time-entry.license-expired-supervisor-alert', async () => {
            const supervisors = await db.select({ userId: employees.userId, workspaceRole: employees.workspaceRole })
              .from(employees)
              .where(and(
                eq(employees.workspaceId, workspaceId),
                eq(employees.isActive, true),
              ));
            const supervisorIds = supervisors
              .filter(e => ['org_owner','co_owner','org_manager','manager','department_manager','supervisor'].includes(e.workspaceRole || ''))
              .map(e => e.userId)
              .filter(Boolean);

            for (const supUserId of supervisorIds) {
              await storage.createNotification({
                workspaceId,
                // @ts-expect-error — TS migration: fix in refactoring sprint
                userId: supUserId,
                type: 'compliance_alert',
                title: 'License Expired — Clock-In Blocked',
                message: `${employee.firstName} ${employee.lastName} was blocked from clocking in: ${licenseCheck.blockReason || 'security license expired'}. Immediate action required.`,
                actionUrl: `/employees/${employee.id}`,
                relatedEntityType: 'employee',
                relatedEntityId: employee.id,
                idempotencyKey: `compliance_alert-${employee.id}-${supUserId}`
              }).catch((err: any) => log.warn('[time-entry] supervisor notification failed', err?.message));
            }
          });

          return res.status(403).json({
            error: 'LICENSE_EXPIRED_CLOCK_IN_BLOCKED',
            message: licenseCheck.blockReason || 'Your security license has expired. You cannot clock in until your license is renewed. Your supervisor has been notified.',
            canAskTrinity: false,
          });
        }
      } catch (licenseErr: any) {
        log.warn('[ClockIn] License check error (non-blocking):', licenseErr.message);
      }
    }

    // GPS Geofence Validation - prevent clock-in if not at correct location
    let gpsVerificationStatus = isFeatureEnabled('enableGPS') ? 'no_gps_provided' : 'gps_disabled';

    if (latitude && longitude && isFeatureEnabled('enableGPS')) {
      try {
        const gpsValidation = await gpsGeofenceService.validateClockIn(
          workspaceId,
          employee.id,
          { latitude: Number(latitude), longitude: Number(longitude) }
        );

        if (!gpsValidation.allowed) {
          return res.status(403).json({
            error: 'GPS validation failed',
            message: gpsValidation.reason,
            distanceMeters: gpsValidation.distanceMeters,
            violationType: gpsValidation.violationType,
          });
        }
        gpsVerificationStatus = 'verified';
      } catch (gpsError) {
        log.error('GPS validation error (non-blocking):', gpsError);
        gpsVerificationStatus = 'gps_error';
      }
    } else if (isFeatureEnabled('enableGPS') && !(latitude && longitude)) {
      // GPS enforcement is on but no coordinates were supplied. Owners/co-owners
      // are exempt (they may clock in from a desk during admin work); everyone
      // else must provide GPS so the geo-compliance audit trail stays intact.
      if (!isOwner) {
        log.warn(`[GPS] Clock-in rejected — no coordinates for employee ${employee.id} (workspace ${workspaceId})`);
        return res.status(400).json({
          error: 'GPS_COORDINATES_REQUIRED',
          message: 'GPS is required to clock in. Enable location services and try again.',
        });
      }
    }

    // Snapshot bill rate from client contract at clock-in time — prevents rate drift at invoice time
    let capturedBillRate: string | null = null;
    if (clientId) {
      const [clientRecord] = await db
        .select({ contractRate: clients.contractRate })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);
      capturedBillRate = clientRecord?.contractRate || null;
    }

    // Atomic clock-in: check + insert in transaction to prevent double-punch
    const clockInTime = new Date();
    const empLockHash = Buffer.from(`clockin_${employee.id}`).reduce(
      (hash, byte) => ((hash << 5) - hash + byte) | 0, 0
    );

    const txResult = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${empLockHash})`);

      const [existingEntry] = await tx.select().from(timeEntries)
        .where(and(
          eq(timeEntries.employeeId, employee.id),
          eq(timeEntries.workspaceId, workspaceId),
          isNull(timeEntries.clockOut)
        ))
        .limit(1);

      if (existingEntry) {
        return { alreadyClockedIn: true as const, entry: existingEntry };
      }

      const [newEntry] = await tx.insert(timeEntries).values({
        workspaceId: workspaceId,
        employeeId: employee.id,
        shiftId: shiftId || resolvedShift?.id || null,
        clientId: clientId || resolvedShift?.clientId || null,
        clockIn: clockInTime,
        clockInLatitude: latitude || null,
        clockInLongitude: longitude || null,
        clockInAccuracy: accuracy || null,
        clockInIpAddress: req.ip || null,
        clockInPhotoUrl: rawPhotoUrl,
        hourlyRate: employee.hourlyRate || null,
        billableToClient: !!(clientId || resolvedShift?.clientId),
        capturedPayRate: employee.hourlyRate || null,
        capturedBillRate: capturedBillRate,
        notes: notes || null,
        status: 'pending',
        trinityAssistedClockin: trinityAssisted || false,
        trinityClockInReason: trinityAssisted
          ? (req.body.trinityClockInReason || 'Trinity verified shift and assisted clock-in')
          : lateClockInMinutes > 0
            ? `LATE_CLOCK_IN:${lateClockInMinutes}min — pending manager approval`
            : null,
        gpsVerificationStatus,
      } as any).returning();

      return { alreadyClockedIn: false as const, entry: newEntry };
    });

    if (txResult.alreadyClockedIn) {
      // For idempotency or reporting, if the user is already clocked in, return a 409
      return res.status(409).json({ 
        error: 'ALREADY_CLOCKED_IN',
        message: 'You are already clocked in. Please clock out first.',
        entry: txResult.entry
      });
    }

    const newEntry = txResult.entry!;

    // Auto-start lone worker safety for this officer (non-blocking)
    loneWorkerSafetyService.startForEmployee(employee.id, workspaceId, newEntry.id)
      .catch((e: any) => log.warn('[TimeEntry] Lone worker start failed (non-blocking):', e?.message || String(e)));

    // Auto-start presence monitoring for this time entry (non-blocking)
    presenceMonitorService.startMonitoring(newEntry.id, {
      id: newEntry.id,
      shiftId: newEntry.shiftId || newEntry.id,
      officerId: employee.id,
      orgId: workspaceId,
      postId: String((resolvedShift as any)?.siteId || newEntry.shiftId || newEntry.id),
      clockIn: {
        timestamp: clockInTime,
        type: 'in',
        gps: {
          latitude: Number(latitude || 0),
          longitude: Number(longitude || 0),
          accuracy: Number(accuracy || 999),
        },
        withinGeofence: gpsVerificationStatus === 'verified',
        distanceFromPost: 0,
        method: trinityAssisted ? 'clockbot' : (latitude && longitude ? 'gps' : 'manual'),
        deviceId: req.get('x-device-id') || 'web-client',
        ipAddress: req.ip || '',
      },
      presence: {
        monitoringEnabled: true,
        checkIntervalMinutes: 5,
        locationHistory: [],
        anomalies: [],
        timeOnSite: 0,
        timeOffSite: 0,
        percentOnSite: 100,
      },
      discrepancies: [],
      status: 'active',
    } as any).catch((e: any) => log.warn('[TimeEntry] Presence monitor start failed (non-blocking):', e?.message || String(e)));

    // Create audit event
    await createAuditEvent({
      workspaceId: workspaceId,
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
    // LATE CLOCK-IN: Notify field managers and flag the entry for manual approval
    if (lateClockInMinutes > 0) {
      scheduleNonBlocking('time-entry.late-clock-in-manager-alert', async () => {
        const managers = await db.select({ userId: employees.userId })
          .from(employees)
          .where(and(
            eq(employees.workspaceId, workspaceId),
            or(
              eq(employees.workspaceRole as any, 'manager'),
              eq(employees.workspaceRole as any, 'supervisor'),
              eq(employees.workspaceRole as any, 'department_manager'),
              eq(employees.workspaceRole as any, 'field_supervisor')
            )
          ));
        const employeeName = `${employee.firstName} ${employee.lastName}`;
        const shiftLabel = resolvedShift
          ? `${new Date(resolvedShift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : 'scheduled time';
        for (const mgr of managers) {
          if (!mgr.userId) continue;
          await universalNotificationEngine.sendNotification({
            workspaceId: workspaceId,
            userId: mgr.userId,
            type: 'issue_detected',
            title: `Late Clock-In — ${employeeName}`,
            message: `${employeeName} clocked in ${lateClockInMinutes} minute${lateClockInMinutes !== 1 ? 's' : ''} late (shift was ${shiftLabel}). This requires your approval.`,
            severity: 'warning',
            metadata: {
              alertType: 'late_clock_in',
              timeEntryId: newEntry.id,
              employeeId: employee.id,
              employeeName,
              minutesLate: lateClockInMinutes,
              source: 'clock_in_enforcement',
            },
          });
        }
      });
    }

    // ON-TIME CLOCK-IN: Notify assigned supervisors so they have real-time site awareness
    if (lateClockInMinutes === 0) {
      scheduleNonBlocking('time-entry.on-time-clock-in-supervisor-alert', async () => {
        const employeeName = `${employee.firstName} ${employee.lastName}`;
        const shiftLabel = resolvedShift
          ? `${new Date(resolvedShift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : 'scheduled time';
        // Notify supervisors and field supervisors in the workspace
        const workspaceSups = await db.select({ userId: employees.userId })
          .from(employees)
          .where(and(
            eq(employees.workspaceId, workspaceId),
            or(
              eq(employees.workspaceRole as any, 'supervisor'),
              eq(employees.workspaceRole as any, 'field_supervisor'),
              eq(employees.workspaceRole as any, 'department_manager'),
            )
          ));
        for (const s of workspaceSups) {
          if (!s.userId) continue;
          await universalNotificationEngine.sendNotification({
            workspaceId,
            userId: s.userId,
            type: 'shift_confirmed',
            title: `Officer On-Site — ${employeeName}`,
            message: `${employeeName} clocked in on time at ${shiftLabel}.`,
            severity: 'info',
            metadata: {
              alertType: 'clock_in_confirmed',
              timeEntryId: newEntry.id,
              employeeId: employee.id,
              employeeName,
              source: 'clock_in_enforcement',
            },
          });
        }
      });
    }

    // Gamification: Update streak and award points on clock-in
    if (isFeatureEnabled('enableGamification')) {
      try {
        const { streak, isNewRecord } = await gamificationService.updateStreak(
          workspaceId,
          employee.id
        );
        await gamificationService.awardPoints({
          workspaceId: workspaceId,
          employeeId: employee.id,
          points: 5,
          transactionType: 'clock_in',
          referenceId: newEntry.id,
          referenceType: 'time_entry',
          description: 'Daily clock-in bonus',
        });
        await gamificationService.checkStreakAchievements(
          workspaceId,
          employee.id,
          streak
        );
        
        // Emit event for centralized tracking
        const clockInHour = new Date().getHours();
        emitGamificationEvent('clock_in', {
          workspaceId: workspaceId,
          employeeId: employee.id,
          clockId: newEntry.id,
          isEarly: clockInHour < 7,
        });
      } catch (gamError) {
        log.error('Gamification update failed (non-blocking):', gamError);
      }
    }

    // AI Brain: Emit clock-in telemetry for anomaly detection
    try {
      await aiBrainService.enqueueJob({
        workspaceId: workspaceId,
        userId: user.id,
        skill: 'time_anomaly_detection',
        input: {
          action: 'clock_in',
          employeeId: employee.id,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          clockInTime: clockInTime.toISOString(),
          latitude: latitude || null,
          longitude: longitude || null,
          dayOfWeek: clockInTime.getDay(),
          hourOfDay: clockInTime.getHours(),
          shiftId: shiftId || null,
        },
        priority: 'low',
      });
    } catch (aiError) {
      log.error('[TimeTracking] AI Brain telemetry failed (non-blocking):', aiError);
    }

    // SHIFT CHATROOM: Auto-join or create shift chatroom on clock-in
    let shiftChatroomId: string | null = null;
    const effectiveShiftId = newEntry.shiftId || resolvedShift?.id;
    const effectiveClientId = newEntry.clientId || resolvedShift?.clientId;
    if (effectiveShiftId) {
      try {
        const [existingRoom] = await db.select({ id: shiftChatrooms.id })
          .from(shiftChatrooms)
          .where(eq(shiftChatrooms.shiftId, effectiveShiftId))
          .limit(1);

        if (existingRoom) {
          shiftChatroomId = existingRoom.id;
        } else {
          let clientName = 'Shift';
          if (effectiveClientId) {
            const [cl] = await db.select({ name: clients.companyName }).from(clients)
              .where(eq(clients.id, effectiveClientId)).limit(1);
            if (cl?.name) clientName = cl.name;
          }
          const [newRoom] = await db.insert(shiftChatrooms).values({
            workspaceId: workspaceId,
            shiftId: effectiveShiftId,
            name: `${clientName} — Shift Chat`,
            status: 'active',
            trinityRecordingEnabled: true,
          } as any).returning();
          shiftChatroomId = newRoom.id;
        }

        if (shiftChatroomId) {
          await db.insert(shiftChatroomMembers).values({
            chatroomId: shiftChatroomId,
            userId: user.id,
            employeeId: employee.id,
          } as any).onConflictDoNothing();

          await db.insert(shiftChatroomMessages).values({
            chatroomId: shiftChatroomId,
            workspaceId: workspaceId,
            senderId: 'trinity-bot',
            senderName: 'Trinity',
            content: `${employee.firstName} has clocked in. I'm monitoring this shift. Use this room to report incidents, request help, or communicate with your team.`,
            messageType: 'system',
          } as any);
        }
      } catch (chatroomErr: unknown) {
        log.error('[ClockIn] Chatroom auto-join failed (non-blocking):', (chatroomErr instanceof Error ? chatroomErr.message : String(chatroomErr)));
      }
    }

    // TRINITY-ASSISTED TRACKING: habitual issues raise a red flag
    if (trinityAssisted) {
      try {
        const newCount = (employee.clockinIssueCount || 0) + 1;
        await db.update(employees).set({ clockinIssueCount: newCount }).where(eq(employees.id, employee.id));
        if (newCount >= 3) {
          platformEventBus.publish({
            type: 'habitual_clockin_issue',
            workspaceId: workspaceId,
            payload: {
              employeeId: employee.id,
              employeeName: `${employee.firstName} ${employee.lastName}`,
              issueCount: newCount,
              message: `${employee.firstName} ${employee.lastName} has required Trinity clock-in assistance ${newCount} times. Review attendance patterns.`,
            },
          }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
        }
      } catch (trackErr: unknown) {
        log.error('[ClockIn] Issue tracking failed (non-blocking):', (trackErr instanceof Error ? trackErr.message : String(trackErr)));
      }
    }

    // Webhook Emission
    try {
      const { deliverWebhookEvent } = await import('../services/webhookDeliveryService');
      deliverWebhookEvent(workspaceId, 'clock_in', {
        timeEntryId: newEntry.id,
        employeeId: employee.id,
        shiftId: newEntry.shiftId,
        clockIn: newEntry.clockIn,
        latitude: newEntry.clockInLatitude,
        longitude: newEntry.clockInLongitude
      });
    } catch (webhookErr: any) {
      log.warn('[TimeEntry] Failed to log webhook error to audit log', { error: webhookErr.message });
    }

    platformEventBus.publish({
      type: 'officer_clocked_in',
      category: 'automation',
      title: 'Officer Clocked In',
      description: `${employee.firstName} ${employee.lastName} clocked in`,
      workspaceId: workspaceId,
      metadata: {
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        userId: user.id,
        timeEntryId: newEntry.id,
        shiftId: effectiveShiftId || null,
        clientId: effectiveClientId || null,
        timestamp: clockInTime.toISOString(),
        gpsLat: latitude || null,
        gpsLng: longitude || null,
      },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    broadcastToWorkspace(workspaceId, {
      type: 'clock_in',
      data: {
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        timeEntryId: newEntry.id,
        shiftId: effectiveShiftId || null,
        clientId: effectiveClientId || null,
        timestamp: clockInTime.toISOString(),
        gpsLat: latitude || null,
        gpsLng: longitude || null,
      },
    });

    res.status(201).json({ 
      message: 'Clocked in successfully',
      timeEntry: newEntry,
      shiftChatroomId,
    });

    // AUTO CLOCK-OUT DAEMON: Prevent infinite sessions by capping at 24 hours
    // This starts a background timer for THIS session. If no clock-out after 24h, system auto-closes.
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    setTimeout(async () => {
      try {
        const [currentStatus] = await db.select({ clockOut: timeEntries.clockOut })
          .from(timeEntries)
          .where(eq(timeEntries.id, newEntry.id))
          .limit(1);
        
        if (currentStatus && !currentStatus.clockOut) {
          log.info(`[TimeTracking] Auto-closing infinite session ${newEntry.id} for employee ${employee.id} (capped at 24h)`);
          const autoClockOutTime = new Date(clockInTime.getTime() + TWENTY_FOUR_HOURS);
          await db.update(timeEntries)
            .set({ 
              clockOut: autoClockOutTime,
              status: 'system_closed',
              notes: (notes || '') + '\n[SYSTEM] Automatically closed after 24-hour limit reached.',
              updatedAt: new Date()
            } as any)
            .where(eq(timeEntries.id, newEntry.id));
            
          broadcastToWorkspace(workspaceId!, { type: 'time_entries_updated', data: { action: 'system_closed', id: newEntry.id } });
        }
      } catch (autoCloseErr) {
        log.error('[TimeTracking] Failed to auto-close infinite session:', autoCloseErr);
      }
    }, TWENTY_FOUR_HOURS);
  } catch (error) {
    log.error('Error clocking in:', error);
    res.status(500).json({ error: 'Failed to clock in' });
  }
});

/**
 * POST /api/time-entries/clock-out - Clock out (complete time entry)
 */
// ============================================================================
// BREAK MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * POST /api/time-entries/break/start - Start a break
 */

// ============================================================================
// TIMESHEET VIEWING & FILTERING
// ============================================================================

/**
 * GET /api/time-entries - Get time entries with filtering
 * Query params: employeeId, startDate, endDate, status
 */
timeEntryRouter.get('/entries', requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { employeeId, startDate, endDate, status } = req.query;

    // Get current employee record for RBAC
    const [currentEmployee] = await db.select().from(employees)
      .where(and(
        eq(employees.userId, user.id),
        eq(employees.workspaceId, workspaceId)
      ))
      .limit(1);

    if (!currentEmployee) {
      return res.status(404).json({ error: 'Employee record not found' });
    }

    // Build query conditions
    const conditions = [eq(timeEntries.workspaceId, workspaceId)];

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
    log.error('Error fetching time entries:', error);
    res.status(500).json({ error: 'Failed to fetch time entries' });
  }
});

/**
 * GET /api/time-entries/:id - Get single time entry with breaks and audit log
 */
timeEntryRouter.get('/entries/:id', requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { id } = req.params;

    // Get time entry
    const [entry] = await db.select().from(timeEntries)
      .where(and(
        eq(timeEntries.id, id),
        eq(timeEntries.workspaceId, workspaceId)
      ))
      .limit(1);

    if (!entry) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    // Get current employee for RBAC
    const [currentEmployee] = await db.select().from(employees)
      .where(and(
        eq(employees.userId, user.id),
        eq(employees.workspaceId, workspaceId)
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
    log.error('Error fetching time entry:', error);
    res.status(500).json({ error: 'Failed to fetch time entry' });
  }
});

// ============================================================================
// MANUAL TIME EDIT ENDPOINT
// ============================================================================

/**
 * PATCH /api/time-entries/entries/:id - Edit a time entry (manual edit with audit trail)
 * Records before/after snapshot, sets manuallyEdited flag for QB sync preservation
 */
// ============================================================================
// APPROVAL WORKFLOW ENDPOINTS
// ============================================================================

/**
 * POST /api/time-entries/:id/approve - Approve a time entry
 */

// ============================================================================
// ACTIVE STATUS ENDPOINTS
// ============================================================================

/**
 * GET /api/time-entries/active - Get all currently clocked-in employees (for managers)
 */
timeEntryRouter.get('/active', requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
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
      eq(timeEntries.workspaceId, workspaceId),
      isNull(timeEntries.clockOut)
    ))
    .orderBy(desc(timeEntries.clockIn));

    res.json({ activeEntries });
  } catch (error) {
    log.error('Error fetching active employees:', error);
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

// Note: This is a named export, not default export
// Used in server/routes.ts as: import { timeEntryRouter } from "../time-entry-routes";

// ============================================================================
// ADMIN & SUPPORT STAFF ENDPOINTS - Full workspace visibility
// ============================================================================

/**
 * GET /api/time-entries/workspace/all - Admin/support: Search all time entries in workspace
 * Searchable by employee, date range, status - for payroll/billing/compliance
 */
// @ts-expect-error — TS migration: fix in refactoring sprint

