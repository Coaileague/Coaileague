// Time Platform - Universal Time Tracking & Clock System
// Comprehensive time tracking with clock in/out, break management, and approval workflow

import { Router } from 'express';
// @ts-expect-error — TS migration: fix in refactoring sprint
import { db } from "../db";
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
import { AtomicFinancialLockService, FinancialLockConflict } from '../services/atomicFinancialLockService';
import { z } from 'zod';
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
timeEntryRouter.post('/clock-out', requireAuth, mutationLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    // Validate request body — accept both payload shapes (see clock-in handler above).
    const rawLatitude = req.body.gpsLatitude ?? req.body.latitude;
    const rawLongitude = req.body.gpsLongitude ?? req.body.longitude;
    const rawAccuracy = req.body.gpsAccuracy ?? req.body.accuracy;
    const rawPhotoUrl = typeof req.body.photoUrl === 'string' ? req.body.photoUrl : null;

    const clockOutSchema = insertTimeEntrySchema.pick({
      clockOutLatitude: true,
      clockOutLongitude: true,
      clockOutAccuracy: true,
      notes: true,
    }).partial();

    const validation = clockOutSchema.safeParse({
      clockOutLatitude: rawLatitude,
      clockOutLongitude: rawLongitude,
      clockOutAccuracy: rawAccuracy,
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
        eq(employees.workspaceId, workspaceId)
      ))
      .limit(1);

    if (!employee) {
      return res.status(404).json({ error: 'Employee record not found' });
    }

    // Find active time entry
    const [activeEntry] = await db.select().from(timeEntries)
      .where(and(
        eq(timeEntries.employeeId, employee.id),
        eq(timeEntries.workspaceId, workspaceId),
        isNull(timeEntries.clockOut)
      ))
      .limit(1);

    if (!activeEntry) {
      return res.status(400).json({ error: 'No active time entry found. Please clock in first.' });
    }

    // GPS Geofence Validation for clock-out - prevent if not at correct location
    let clockOutGpsVerificationStatus = isFeatureEnabled('enableGPS') ? 'no_gps_provided' : 'gps_disabled';

    if (latitude && longitude && isFeatureEnabled('enableGPS')) {
      try {
        const gpsValidation = await gpsGeofenceService.validateClockOut(
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
        clockOutGpsVerificationStatus = 'verified';
      } catch (gpsError) {
        log.error('GPS validation error (non-blocking):', gpsError);
        clockOutGpsVerificationStatus = 'gps_error';
      }
    } else if (isFeatureEnabled('enableGPS') && !(latitude && longitude)) {
      log.warn(`[GPS] Clock-out allowed without coordinates for employee ${employee.id} (workspace ${workspaceId}). gpsVerificationStatus=no_gps_provided`);
    }

    // End any active breaks + update time entry atomically
    const clockOutTime = new Date();

    // Calculate total hours (gross hours without break deduction)
    const grossHours = calculateHours(new Date(activeEntry.clockIn), clockOutTime);

    // Get total break time and calculate net billable hours
    const totalBreakMinutes = await getTotalBreakMinutes(activeEntry.id);
    const netHours = calculateNetHours(grossHours, totalBreakMinutes);

    log.info(`[TimeEntry] Clock-out: gross=${grossHours}h, breaks=${totalBreakMinutes}min, net=${netHours}h`);

    const [updatedEntry] = await db.transaction(async (tx) => {
      // End any active breaks (only those without an endTime)
      await tx.update(timeEntryBreaks)
        .set({ endTime: clockOutTime })
        .where(and(
          eq(timeEntryBreaks.timeEntryId, activeEntry.id),
          isNull(timeEntryBreaks.endTime)
        ));

      // Update time entry with clock out - use NET hours for payroll calculations
      return tx.update(timeEntries)
        .set({
          clockOut: clockOutTime,
          clockOutLatitude: latitude || null,
          clockOutLongitude: longitude || null,
          clockOutAccuracy: accuracy || null,
          clockOutIpAddress: req.ip || null,
          clockOutPhotoUrl: rawPhotoUrl,
          totalHours: netHours.toString(), // NET hours (breaks deducted)
          totalAmount: activeEntry.hourlyRate
            ? (parseFloat(activeEntry.hourlyRate) * netHours).toFixed(2) // Pay for NET hours only
            : null,
          notes: notes || activeEntry.notes,
          gpsVerificationStatus: clockOutGpsVerificationStatus,
          updatedAt: new Date()
        } as any)
        .where(and(
          eq(timeEntries.id, activeEntry.id),
          eq(timeEntries.workspaceId, workspaceId)
        ))
        .returning();
    });

    // GEOFENCE CHECK: Verify clock-out location is within site geofence
    let geofenceWarning: { outsideGeofence: boolean; distanceMeters: number; approvalRequired: boolean; message: string } | null = null;
    if (latitude && longitude && activeEntry.shiftId) {
      try {
        const [shiftRecord] = await db.select({ siteId: shifts.siteId })
          .from(shifts).where(eq(shifts.id, activeEntry.shiftId)).limit(1);
        if (shiftRecord?.siteId) {
          const [siteRecord] = await db.select({
            lat: sites.geofenceLat, lng: sites.geofenceLng, radius: sites.geofenceRadiusMeters,
          }).from(sites).where(eq(sites.id, shiftRecord.siteId)).limit(1);
          if (siteRecord?.lat && siteRecord?.lng && siteRecord?.radius) {
            const dist = haversineDistance(
              Number(latitude), Number(longitude),
              Number(siteRecord.lat), Number(siteRecord.lng)
            );
            if (dist > siteRecord.radius) {
              await db.update(timeEntries).set({
                outsideGeofence: true,
                geofenceOverrideRequired: true,
                geofenceOverrideStatus: 'pending',
              }).where(eq(timeEntries.id, activeEntry.id));
              geofenceWarning = {
                outsideGeofence: true,
                distanceMeters: Math.round(dist),
                approvalRequired: true,
                message: `You clocked out ${Math.round(dist)}m outside the site geofence (allowed: ${siteRecord.radius}m). A supervisor must approve your time entry.`,
              };
              platformEventBus.publish({
                type: 'geofence_override_required',
                workspaceId: workspaceId,
                payload: {
                  employeeId: employee.id,
                  employeeName: `${employee.firstName} ${employee.lastName}`,
                  timeEntryId: activeEntry.id,
                  distanceMeters: Math.round(dist),
                  radiusMeters: siteRecord.radius,
                },
              }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
            }
          }
        }
      } catch (fenceErr: unknown) {
        log.error('[ClockOut] Geofence check failed (non-blocking):', (fenceErr instanceof Error ? fenceErr.message : String(fenceErr)));
      }
    }

    // Create audit event
    await createAuditEvent({
      workspaceId: workspaceId,
      timeEntryId: activeEntry.id,
      actorUserId: user.id,
      actorEmployeeId: employee.id,
      actorName: `${employee.firstName} ${employee.lastName}`,
      actionType: 'clock_out',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      description: `Clocked out at ${clockOutTime.toLocaleTimeString()} - Total: ${totalHours} hours${geofenceWarning ? ' [OUTSIDE GEOFENCE]' : ''}`,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      payload: { latitude, longitude, accuracy, totalHours, outsideGeofence: !!geofenceWarning },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // Gamification hook removed — emitGamificationEvent was never implemented
    // anywhere in the codebase, so this block would throw a ReferenceError
    // every time the (default-on) enableGamification flag was evaluated.
    // Re-add when the gamification subsystem ships.

    // AI Brain: Emit clock-out telemetry for anomaly detection (overtime alerts)
    try {
      const shiftDurationMinutes = differenceInMinutes(clockOutTime, new Date(activeEntry.clockIn));
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const isOvertime = totalHours > 8;
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const isExtendedShift = totalHours > 10;
      
      await aiBrainService.enqueueJob({
        workspaceId: workspaceId,
        userId: user.id,
        skill: 'time_anomaly_detection',
        input: {
          action: 'clock_out',
          employeeId: employee.id,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          timeEntryId: activeEntry.id,
          clockInTime: new Date(activeEntry.clockIn).toISOString(),
          clockOutTime: clockOutTime.toISOString(),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          totalHours,
          shiftDurationMinutes,
          isOvertime,
          isExtendedShift,
          latitude: latitude || null,
          longitude: longitude || null,
          dayOfWeek: clockOutTime.getDay(),
          hourOfDay: clockOutTime.getHours(),
        },
        priority: isExtendedShift ? 'high' : (isOvertime ? 'normal' : 'low'),
      });
    } catch (aiError) {
      log.error('[TimeTracking] AI Brain telemetry failed (non-blocking):', aiError);
    }

    // Webhook Emission
    try {
      const { deliverWebhookEvent } = await import('../services/webhookDeliveryService');
      deliverWebhookEvent(workspaceId, 'clock_out', {
        timeEntryId: activeEntry.id,
        employeeId: employee.id,
        shiftId: activeEntry.shiftId,
        clockIn: activeEntry.clockIn,
        clockOut: clockOutTime,
        totalHours: netHours,
        latitude: latitude || null,
        longitude: longitude || null
      });
    } catch (webhookErr: any) {
      log.warn('[TimeEntry] Failed to log webhook error to audit log', { error: webhookErr.message });
    }

    platformEventBus.publish({
      type: 'officer_clocked_out',
      category: 'automation',
      title: 'Officer Clocked Out',
      description: `${employee.firstName} ${employee.lastName} clocked out (${netHours.toFixed(2)}h)`,
      workspaceId: workspaceId,
      metadata: {
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        userId: user.id,
        timeEntryId: activeEntry.id,
        shiftId: activeEntry.shiftId || null,
        clientId: activeEntry.clientId || null,
        timestamp: clockOutTime.toISOString(),
        totalHours: netHours,
        grossHours,
        breakMinutes: totalBreakMinutes,
        gpsLat: latitude || null,
        gpsLng: longitude || null,
      },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    // Auto-stop lone worker safety for this officer (non-blocking)
    loneWorkerSafetyService.stopForEmployee(employee.id, workspaceId)
      .catch((e: any) => log.warn('[TimeEntry] Lone worker stop failed (non-blocking):', e?.message || String(e)));

    // Finalize presence monitoring session (non-blocking)
    presenceMonitorService.finalizeMonitoring(activeEntry.id)
      .catch((e: any) => log.warn('[TimeEntry] Presence monitor finalize failed (non-blocking):', e?.message || String(e)));

    // Auto-initiate shift handoff when an incoming shift starts within 30 minutes (non-blocking)
    if (activeEntry.shiftId) {
      scheduleNonBlocking('time-entry.shift-handoff-initiate', async () => {
        try {
          const [endingShift] = await db.select({
            id: shifts.id,
            workspaceId: shifts.workspaceId,
            siteId: shifts.siteId,
            startTime: shifts.startTime,
            endTime: shifts.endTime,
            title: shifts.title,
            siteName: sites.name,
          })
            .from(shifts)
            .leftJoin(sites, and(eq(sites.id, shifts.siteId), eq(sites.workspaceId, shifts.workspaceId)))
            .where(and(eq(shifts.id, activeEntry.shiftId as string), eq(shifts.workspaceId, workspaceId)))
            .limit(1);

          if (!endingShift?.siteId) return;

          const now = new Date();
          const inThirtyMinutes = new Date(now.getTime() + 30 * 60 * 1000);

          const [incomingShift] = await db.select({
            id: shifts.id,
            siteId: shifts.siteId,
            startTime: shifts.startTime,
            endTime: shifts.endTime,
            officerId: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
          })
            .from(shifts)
            .innerJoin(employees, eq(employees.id, shifts.employeeId))
            .where(and(
              eq(shifts.workspaceId, workspaceId),
              eq(shifts.siteId, endingShift.siteId),
              gte(shifts.startTime, now),
              lte(shifts.startTime, inThirtyMinutes),
              sql`${shifts.status} = 'scheduled'`,
            ))
            .orderBy(shifts.startTime)
            .limit(1);

          if (!incomingShift) return;
          if (incomingShift.id === endingShift.id) {
            log.debug('[TimeEntry] Skipping handoff — incoming shift matched ending shift');
            return;
          }
          if (incomingShift.officerId === employee.id) {
            log.debug('[TimeEntry] Skipping handoff — incoming officer is same as outgoing officer');
            return;
          }

          const outgoingOfficerName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'Outgoing Officer';
          const incomingOfficerName = `${incomingShift.firstName || ''} ${incomingShift.lastName || ''}`.trim() || 'Incoming Officer';
          const postName = endingShift.siteName || endingShift.title || 'Assigned Post';

          await shiftHandoffService.initiateHandoff(
            {
              id: endingShift.id,
              orgId: workspaceId,
              postId: String(endingShift.siteId),
              postName,
              officerId: employee.id,
              officerName: outgoingOfficerName,
              startTime: new Date(endingShift.startTime),
              endTime: clockOutTime,
            },
            {
              id: incomingShift.id,
              orgId: workspaceId,
              postId: String(incomingShift.siteId),
              postName,
              officerId: incomingShift.officerId,
              officerName: incomingOfficerName,
              startTime: new Date(incomingShift.startTime),
              endTime: new Date(incomingShift.endTime),
            }
          );
        } catch (handoffErr: any) {
          log.warn('[TimeEntry] Shift handoff initiation failed (non-blocking):', handoffErr?.message || String(handoffErr));
        }
      });
    }

    res.json({ 
      message: 'Clocked out successfully',
      timeEntry: updatedEntry,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      totalHours,
      ...(geofenceWarning ? { geofenceWarning } : {}),
    });
  } catch (error) {
    log.error('Error clocking out:', error);
    res.status(500).json({ error: 'Failed to clock out' });
  }
});

/**
 * PATCH /api/time-entries/geofence-override/:timeEntryId
 * Supervisor approves or denies an outside-geofence clock-out
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
timeEntryRouter.patch('/geofence-override/:timeEntryId', requireWorkspaceRole('manager'), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace selected' });
    const geofenceOverrideSchema = z.object({
      approved: z.boolean({ required_error: 'approved (boolean) required' }),
      reason: z.string().min(1, 'reason required'),
    });
    const geofenceParsed = geofenceOverrideSchema.safeParse(req.body);
    if (!geofenceParsed.success) return res.status(400).json({ error: 'Invalid request body', details: geofenceParsed.error.issues });
    const { approved, reason } = geofenceParsed.data;

    await db.update(timeEntries).set({
      geofenceOverrideStatus: approved ? 'approved' : 'denied',
      geofenceOverrideBy: user.id,
      geofenceOverrideReason: reason,
      geofenceOverrideAt: new Date(),
    }).where(and(
      eq(timeEntries.id, req.params.timeEntryId),
      eq(timeEntries.workspaceId, workspaceId),
      eq(timeEntries.geofenceOverrideRequired, true)
    ));

    platformEventBus.publish({
      type: 'geofence_override_resolved',
      workspaceId: workspaceId,
      payload: { timeEntryId: req.params.timeEntryId, approved, reason, resolvedBy: user.id },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json({ success: true, approved, message: approved ? 'Time entry approved despite geofence violation.' : 'Time entry denied — manual correction required.' });
  } catch (error) {
    log.error('Error resolving geofence override:', error);
    res.status(500).json({ error: 'Failed to resolve geofence override' });
  }
});

/**
 * POST /api/time-entries/geofence-override/:timeEntryId/submit
 * Officer-facing: attach an explanation reason to an outside-geofence
 * clock event. Moves status from 'required' → 'pending' so a manager
 * sees it in the approval queue.
 *
 * Readiness Section 9 bug #1 — the original single-PATCH endpoint was
 * gated to manager role, so the officer's explanation POST 403'd
 * silently and the modal got stuck.
 */
timeEntryRouter.post('/geofence-override/:timeEntryId/submit', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace selected' });
    const { reason } = req.body || {};
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({ error: 'reason (min 5 chars) required' });
    }

    const updated = await db.update(timeEntries).set({
      geofenceOverrideStatus: 'pending',
      geofenceOverrideReason: reason.trim(),
      geofenceOverrideAt: new Date(),
    }).where(and(
      eq(timeEntries.id, req.params.timeEntryId),
      eq(timeEntries.workspaceId, workspaceId),
      eq(timeEntries.geofenceOverrideRequired, true),
    )).returning();

    if (updated.length === 0) {
      return res.status(404).json({ error: 'Time entry not found or not awaiting an override' });
    }

    platformEventBus.publish({
      type: 'geofence_override_submitted',
      workspaceId,
      payload: { timeEntryId: req.params.timeEntryId, reason: reason.trim(), submittedBy: user.id },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json({ success: true, message: 'Explanation submitted to supervisor for review.' });
  } catch (error) {
    log.error('Error submitting geofence override:', error);
    res.status(500).json({ error: 'Failed to submit explanation' });
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
    const user = req.user!;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
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
        eq(employees.workspaceId, workspaceId)
      ))
      .limit(1);

    if (!employee) {
      return res.status(404).json({ error: 'Employee record not found' });
    }

    // Find active time entry
    const [activeEntry] = await db.select().from(timeEntries)
      .where(and(
        eq(timeEntries.employeeId, employee.id),
        eq(timeEntries.workspaceId, workspaceId),
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
      workspaceId: workspaceId,
      timeEntryId: activeEntry.id,
      employeeId: employee.id,
      breakType,
      startTime: breakStartTime,
      isPaid,
      notes
    }).returning();

    // Create audit event
    await createAuditEvent({
      workspaceId: workspaceId,
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
    log.error('Error starting break:', error);
    res.status(500).json({ error: 'Failed to start break' });
  }
});

/**
 * POST /api/time-entries/break/end - End a break
 */
timeEntryRouter.post('/break/end', requireAuth, mutationLimiter, async (req: AuthenticatedRequest, res) => {
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
      return res.status(404).json({ error: 'Employee record not found' });
    }

    // Find active time entry
    const [activeEntry] = await db.select().from(timeEntries)
      .where(and(
        eq(timeEntries.employeeId, employee.id),
        eq(timeEntries.workspaceId, workspaceId),
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
      workspaceId: workspaceId,
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
    log.error('Error ending break:', error);
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
timeEntryRouter.patch('/entries/:id', requireWorkspaceRole(['department_manager', 'co_owner', 'org_owner']), mutationLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { id } = req.params;
    const timeEntryEditSchema = z.object({
      clockIn: z.string().optional().nullable(),
      clockOut: z.string().optional().nullable(),
      totalHours: z.number().optional().nullable(),
      notes: z.string().optional().nullable(),
      reason: z.string().min(1, 'Edit reason is required for audit trail'),
      hourlyRate: z.number().optional().nullable(),
      clientId: z.string().optional().nullable(),
    });
    const editParsed = timeEntryEditSchema.safeParse(req.body);
    if (!editParsed.success) return res.status(400).json({ error: 'Invalid request body', details: editParsed.error.issues });
    const { clockIn, clockOut, totalHours, notes, reason, hourlyRate, clientId } = editParsed.data;

    const [entry] = await db.select().from(timeEntries)
      .where(and(
        eq(timeEntries.id, id),
        eq(timeEntries.workspaceId, workspaceId)
      ))
      .limit(1);

    if (!entry) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    // WORM lock: approved time entries cannot be edited — they are locked after payroll approval
    if (entry.status === 'approved') {
      return res.status(403).json({
        error: 'Cannot edit an approved time entry. Approved timesheets are locked after payroll approval.',
        code: 'TIMESHEET_LOCKED',
        entryId: id,
        status: entry.status,
      });
    }

    const isSupervisorOverride = false; // always false after WORM lock guard above

    const [employee] = await db.select().from(employees)
      .where(and(
        eq(employees.userId, user.id),
        eq(employees.workspaceId, workspaceId)
      ))
      .limit(1);

    const preEditSnapshot = {
      clockIn: entry.clockIn,
      clockOut: entry.clockOut,
      totalHours: entry.totalHours,
      hourlyRate: entry.hourlyRate,
      totalAmount: entry.totalAmount,
      notes: entry.notes,
      clientId: entry.clientId,
      status: entry.status,
      snapshotAt: new Date().toISOString(),
    };

    const updateData: Record<string, any> = {
      manuallyEdited: true,
      manualEditedAt: new Date(),
      manualEditedBy: user.id,
      manualEditReason: reason,
      preEditSnapshot: entry.preEditSnapshot || preEditSnapshot,
      updatedAt: new Date(),
    };

    if (clockIn) updateData.clockIn = new Date(clockIn);
    if (clockOut) updateData.clockOut = new Date(clockOut);
    if (notes !== undefined) updateData.notes = notes;
    if (hourlyRate !== undefined) updateData.hourlyRate = hourlyRate;
    if (clientId !== undefined) updateData.clientId = clientId;

    if (totalHours !== undefined && totalHours !== null) {
      updateData.totalHours = totalHours.toString();
    } else if (clockIn || clockOut) {
      const newClockIn = new Date(clockIn || entry.clockIn);
      const newClockOut = clockOut ? new Date(clockOut) : (entry.clockOut ? new Date(entry.clockOut) : null);
      if (newClockOut) {
        const hours = calculateHours(newClockIn, newClockOut);
        updateData.totalHours = hours.toString();
      }
    }

    const effectiveRate = hourlyRate ?? entry.hourlyRate;
    if (updateData.totalHours && effectiveRate != null) {
      updateData.totalAmount = calculateInvoiceLineItem(
        toFinancialString(updateData.totalHours),
        toFinancialString(effectiveRate),
      );
    }

    const [updatedEntry] = await db.transaction(async (tx) => {
      const [updated] = await tx.update(timeEntries)
        .set(updateData)
        .where(and(
          eq(timeEntries.id, id),
          eq(timeEntries.workspaceId, workspaceId)
        ))
        .returning();
      await createAuditEvent({
        workspaceId: workspaceId,
        timeEntryId: id,
        actorUserId: user.id,
        actorEmployeeId: employee?.id,
        actorName: employee ? `${employee.firstName} ${employee.lastName}` : user.email || 'Unknown',
        actionType: 'edit_time',
        description: isSupervisorOverride
          ? `SUPERVISOR OVERRIDE: Edited approved time entry - Reason: ${reason}`
          : `Manual time edit - Reason: ${reason}`,
        payload: {
          reason,
          supervisorOverride: isSupervisorOverride,
          previousStatus: preEditSnapshot.status,
          before: preEditSnapshot,
          after: {
            clockIn: updated.clockIn,
            clockOut: updated.clockOut,
            totalHours: updated.totalHours,
            hourlyRate: updated.hourlyRate,
            totalAmount: updated.totalAmount,
            notes: updated.notes,
            clientId: updated.clientId,
          },
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        tx,
      });
      return [updated];
    });

    let invoiceCascade: { action: string; invoiceId: string; details: string } | null = null;
    if (entry.invoiceId) {
      try {
        const { cascadeTimeEntryEditToInvoice } = await import('../services/billingAutomation');
        invoiceCascade = await cascadeTimeEntryEditToInvoice({
          timeEntryId: id,
          invoiceId: entry.invoiceId,
          workspaceId: workspaceId,
          oldTotalAmount: preEditSnapshot.totalAmount,
          newTotalAmount: updatedEntry.totalAmount,
          editReason: reason,
          editedBy: user.id,
        });
        log.info(`[GAP-016] Invoice cascade result: ${invoiceCascade.action} — ${invoiceCascade.details}`);
      } catch (cascadeErr: unknown) {
        log.error(`[GAP-016] Invoice cascade failed for entry ${id}:`, (cascadeErr instanceof Error ? cascadeErr.message : String(cascadeErr)));
      }
    }

    res.json({
      message: 'Time entry updated with audit trail',
      timeEntry: updatedEntry,
      auditTrail: {
        manuallyEdited: true,
        editedAt: updateData.manualEditedAt,
        editedBy: user.id,
        reason,
        preEditSnapshot,
      },
      invoiceCascade,
    });
  } catch (error) {
    log.error('Error editing time entry:', error);
    res.status(500).json({ error: 'Failed to edit time entry' });
  }
});

// ============================================================================
// APPROVAL WORKFLOW ENDPOINTS
// ============================================================================

/**
 * POST /api/time-entries/:id/approve - Approve a time entry
 */
timeEntryRouter.post('/entries/:id/approve', requireWorkspaceRole(['department_manager', 'co_owner', 'org_owner']), mutationLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
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
        eq(timeEntries.workspaceId, workspaceId)
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
        eq(employees.workspaceId, workspaceId)
      ))
      .limit(1);

    // Update time entry + audit event atomically
    const approvedAt = new Date();
    const [updatedEntry] = await db.transaction(async (tx) => {
      const [updated] = await tx.update(timeEntries)
        .set({
          status: 'approved',
          approvedBy: user.id,
          approvedAt,
          updatedAt: new Date()
        })
        .where(and(
          eq(timeEntries.id, id),
          eq(timeEntries.workspaceId, workspaceId)
        ))
        .returning();
      await createAuditEvent({
        workspaceId: workspaceId,
        timeEntryId: id,
        actorUserId: user.id,
        actorEmployeeId: employee?.id,
        actorName: employee ? `${employee.firstName} ${employee.lastName}` : user.email || 'Unknown',
        actionType: 'approve_time',
        description: `Approved time entry - ${entry.totalHours} hours`,
        payload: { notes, previousStatus: entry.status },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        tx,
      });
      return [updated];
    });
    // Fire automation event — triggers invoice creation + payroll processing pipeline
    platformEventBus.publish({
      type: 'time_entries_approved',
      workspaceId: workspaceId,
      payload: { count: 1, entryIds: [id], approvedBy: user.id },
      metadata: { source: 'timeEntryRouter.approve' },
    }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

    res.json({ 
      message: 'Time entry approved',
      timeEntry: updatedEntry
    });
  } catch (error) {
    log.error('Error approving time entry:', error);
    res.status(500).json({ error: 'Failed to approve time entry' });
  }
});

/**
 * POST /api/time-entries/:id/reject - Reject a time entry
 */
timeEntryRouter.post('/entries/:id/reject', requireWorkspaceRole(['department_manager', 'co_owner', 'org_owner']), mutationLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
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
        eq(timeEntries.workspaceId, workspaceId)
      ))
      .limit(1);

    if (!entry) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    // Refuse to reject an entry that has been billed or payrolled. Flipping
    // its status to 'rejected' while invoiceId/payrollRunId remain set
    // creates an inconsistent record — a rejected entry that's still funding
    // a real receivable or payable. Use a credit memo / payroll adjustment.
    try {
      await AtomicFinancialLockService.assertCanModify(id);
    } catch (err) {
      if (err instanceof FinancialLockConflict) {
        return res.status(409).json({
          error: err.message,
          code: 'FINANCIAL_LOCK',
          reason: err.reason,
        });
      }
      throw err;
    }

    // Get employee record
    const [employee] = await db.select().from(employees)
      .where(and(
        eq(employees.userId, user.id),
        eq(employees.workspaceId, workspaceId)
      ))
      .limit(1);

    // Update time entry + audit event atomically
    const rejectedAt = new Date();
    const [updatedEntry] = await db.transaction(async (tx) => {
      const [updated] = await tx.update(timeEntries)
        .set({
          status: 'rejected',
          rejectedBy: user.id,
          rejectedAt,
          rejectionReason: reason,
          updatedAt: new Date()
        })
        .where(and(
          eq(timeEntries.id, id),
          eq(timeEntries.workspaceId, workspaceId)
        ))
        .returning();
      await createAuditEvent({
        workspaceId: workspaceId,
        timeEntryId: id,
        actorUserId: user.id,
        actorEmployeeId: employee?.id,
        actorName: employee ? `${employee.firstName} ${employee.lastName}` : user.email || 'Unknown',
        actionType: 'reject_time',
        description: `Rejected time entry - Reason: ${reason}`,
        payload: { reason, previousStatus: entry.status },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        tx,
      });
      return [updated];
    });

    // Notify the employee whose time entry was rejected (Phase 10 requirement)
    if (entry.employeeId) {
      try {
        const [rejectedEmployee] = await db.select({ userId: employees.userId, firstName: employees.firstName, lastName: employees.lastName })
          .from(employees)
          .where(and(eq(employees.id, entry.employeeId), eq(employees.workspaceId, workspaceId)))
          .limit(1);
        if (rejectedEmployee?.userId) {
          const entryDate = entry.clockIn
            ? new Date(entry.clockIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'your time entry';
          await universalNotificationEngine.sendNotification({
            workspaceId: workspaceId,
            userId: rejectedEmployee.userId,
            type: 'timesheet_rejected' as any,
            title: 'Time Entry Rejected',
            message: `Your time entry for ${entryDate} was rejected. Reason: ${reason}`,
            severity: 'warning',
            actionUrl: `/time-tracking`,
            metadata: { timeEntryId: id, rejectionReason: reason, rejectedBy: user.id },
          });
        }
      } catch (notifErr: unknown) {
        log.warn('[TimeEntry] Rejection notification failed (non-blocking):', (notifErr instanceof Error ? notifErr.message : String(notifErr)));
      }
    }

    res.json({ 
      message: 'Time entry rejected',
      timeEntry: updatedEntry
    });
  } catch (error) {
    log.error('Error rejecting time entry:', error);
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
timeEntryRouter.get('/reports/summary', requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
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
      eq(timeEntries.workspaceId, workspaceId),
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
      totalBreakMinutes: sql<number>`COALESCE((SELECT SUM(CAST(duration AS DECIMAL)) FROM time_entry_breaks WHERE time_entry_breaks.time_entry_id IN (SELECT id FROM time_entries te WHERE te.employee_id = ${timeEntries.employeeId} AND te.workspace_id = ${timeEntries.workspaceId} AND te.clock_in >= ${rangeStart} AND te.clock_in <= ${rangeEnd})), 0)`,
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
    log.error('Error generating timesheet summary:', error);
    res.status(500).json({ error: 'Failed to generate timesheet summary' });
  }
});

/**
 * GET /api/time-entries/reports/export - Export timesheet data as CSV
 */
timeEntryRouter.get('/reports/export', requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { startDate, endDate, format: exportFormat = 'csv', employeeId } = req.query;

    // Build conditions
    const conditions = [eq(timeEntries.workspaceId, workspaceId)];

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
    log.error('Error exporting timesheet:', error);
    res.status(500).json({ error: 'Failed to export timesheet' });
  }
});

/**
 * GET /api/time-entries/reports/compliance - Compliance report for labor law tracking
 */
timeEntryRouter.get('/reports/compliance', requireWorkspaceRole(['department_manager', 'co_owner', 'org_owner']), readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
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
      breakMinutes: sql<number>`COALESCE((SELECT SUM(CAST(duration AS DECIMAL)) FROM time_entry_breaks WHERE time_entry_breaks.time_entry_id IN (SELECT id FROM time_entries te WHERE te.employee_id = ${timeEntries.employeeId} AND DATE(te.clock_in) = DATE(${timeEntries.clockIn}) AND te.workspace_id = ${timeEntries.workspaceId} AND te.clock_in >= ${rangeStart} AND te.clock_in <= ${rangeEnd})), 0)`,
      entriesCount: sql<number>`COUNT(${timeEntries.id})`
    })
    .from(timeEntries)
    .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
    .where(and(
      eq(timeEntries.workspaceId, workspaceId),
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
    log.error('Error generating compliance report:', error);
    res.status(500).json({ error: 'Failed to generate compliance report' });
  }
});

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
timeEntryRouter.get('/workspace/all', requireWorkspaceRole(['org_owner', 'co_owner', 'support_manager']), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { employeeId, startDate, endDate, status, page = '1', limit = '50' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    const pageSize = parseInt(limit as string);

    let query = db.select({
      id: timeEntries.id,
      employeeId: timeEntries.employeeId,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
      totalHours: timeEntries.totalHours,
      status: timeEntries.status,
      createdAt: timeEntries.createdAt,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
    })
    .from(timeEntries)
    .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
    .where(eq(timeEntries.workspaceId, workspaceId));

    // Apply filters
    const conditions = [];
    if (employeeId) {
      conditions.push(eq(timeEntries.employeeId, employeeId as string));
    }
    if (status) {
      conditions.push(eq(timeEntries.status, status as string));
    }
    if (startDate) {
      conditions.push(gte(timeEntries.clockIn, new Date(startDate as string)));
    }
    if (endDate) {
      conditions.push(lte(timeEntries.clockOut, new Date(endDate as string)));
    }

    if (conditions.length > 0) {
      query = (query as any).where(and(...conditions) as any);
    }

    const entries = await query.orderBy(desc(timeEntries.clockIn)).limit(pageSize).offset(offset);
    
    // Get total count
    let countQuery = db.select({ count: sql<number>`cast(count(*) as integer)` })
      .from(timeEntries)
      .where(eq(timeEntries.workspaceId, workspaceId));

    if (conditions.length > 0) {
      countQuery = (countQuery as any).where(and(...conditions) as any);
    }

    const [{ count }] = await countQuery;

    res.json({
      entries: entries.map(e => ({
        ...e,
        employeeName: `${e.firstName || ''} ${e.lastName || ''}`.trim(),
      })),
      pagination: {
        page: parseInt(page as string),
        limit: pageSize,
        total: count,
        pages: Math.ceil(count / pageSize),
      },
    });
  } catch (error) {
    log.error('Error fetching workspace time entries:', error);
    res.status(500).json({ error: 'Failed to fetch time entries' });
  }
});

/**
 * POST /api/time-entries/acknowledge-post-orders
 * Employee acknowledges post orders for a specific client site.
 * Required before clock-in if the client has post orders text set.
 * Stores clientId + timestamp on the employee record.
 */
timeEntryRouter.post('/acknowledge-post-orders', requireAuth, mutationLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const postOrdersSchema = z.object({ clientId: z.string().min(1, 'clientId is required') });
    const postOrdersParsed = postOrdersSchema.safeParse(req.body);
    if (!postOrdersParsed.success) return res.status(400).json({ error: 'Invalid request body', details: postOrdersParsed.error.issues });
    const { clientId } = postOrdersParsed.data;

    // Verify client exists in this workspace and has post orders
    const [clientRecord] = await db
      .select({ postOrders: clients.postOrders, id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
      .limit(1);

    if (!clientRecord) {
      return res.status(404).json({ error: 'Client not found in workspace' });
    }

    // Get employee record
    const [employee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.userId, user.id), eq(employees.workspaceId, workspaceId)))
      .limit(1);

    if (!employee) {
      return res.status(404).json({ error: 'Employee record not found' });
    }

    // Stamp acknowledgment on employee record
    await db
      .update(employees)
      .set({
        postOrdersAcknowledgedAt: new Date(),
        postOrdersAcknowledgedForClientId: clientId,
        updatedAt: new Date(),
      })
      .where(and(eq(employees.id, employee.id), eq(employees.workspaceId, workspaceId)));

    res.json({
      success: true,
      acknowledgedAt: new Date().toISOString(),
      clientId,
      message: 'Post orders acknowledged. You may now clock in.',
    });
  } catch (error) {
    log.error('Error acknowledging post orders:', error);
    res.status(500).json({ error: 'Failed to acknowledge post orders' });
  }
});

/**
 * GET /api/time-entries/workspace/stats - Admin: Payroll/billing stats for workspace
 * Total hours, pending approvals, compliance issues by employee
 */
timeEntryRouter.get('/workspace/stats', requireWorkspaceRole(['org_owner', 'co_owner']), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const { startDate, endDate } = req.query;

    // Build date filters
    let dateConditions = [];
    if (startDate) {
      dateConditions.push(gte(timeEntries.clockIn, new Date(startDate as string)));
    }
    if (endDate) {
      dateConditions.push(lte(timeEntries.clockOut, new Date(endDate as string)));
    }

    // Aggregate stats by employee
    const stats = await db.select({
      employeeId: timeEntries.employeeId,
      employeeName: sql<string>`CONCAT(${employees.firstName}, ' ', ${employees.lastName})`,
      totalHours: sql<number>`COALESCE(SUM(${timeEntries.totalHours}), 0)`,
      totalEntries: sql<number>`COUNT(${timeEntries.id})`,
      approvedEntries: sql<number>`SUM(CASE WHEN ${eq(timeEntries.status, 'approved')} THEN 1 ELSE 0 END)`,
      pendingEntries: sql<number>`SUM(CASE WHEN ${eq(timeEntries.status, 'pending')} THEN 1 ELSE 0 END)`,
      rejectedEntries: sql<number>`SUM(CASE WHEN ${eq(timeEntries.status, 'rejected')} THEN 1 ELSE 0 END)`,
    })
    .from(timeEntries)
    .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
    .where(and(
      eq(timeEntries.workspaceId, workspaceId),
      ...(dateConditions.length > 0 ? [and(...dateConditions)] : [])
    ) as any)
    .groupBy(timeEntries.employeeId, employees.firstName, employees.lastName);

    const totalStats = {
      totalEmployeesWithEntries: stats.length,
      totalHours: stats.reduce((sum, s) => sum + (s.totalHours || 0), 0),
      totalEntries: stats.reduce((sum, s) => sum + (s.totalEntries || 0), 0),
      pendingApprovals: stats.reduce((sum, s) => sum + (s.pendingEntries || 0), 0),
      rejectedCount: stats.reduce((sum, s) => sum + (s.rejectedEntries || 0), 0),
    };

    res.json({
      period: { startDate, endDate },
      totalStats,
      byEmployee: stats,
      generatedAt: new Date(),
    });
  } catch (error) {
    log.error('Error fetching workspace stats:', error);
    res.status(500).json({ error: 'Failed to generate stats' });
  }
});
