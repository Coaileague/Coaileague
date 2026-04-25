import { sanitizeError } from '../middleware/errorHandler';
import { validateShiftTimes, validateShiftStartPast, validateShiftEndFuture, businessRuleResponse } from '../lib/businessRules';
import { Router } from "express";
import { requireAuth } from "../auth";
import { requireManager, requireManagerOrPlatformStaff, requireEmployee, attachWorkspaceId, type AuthenticatedRequest } from "../rbac";
import { storage } from "../storage";
import { db } from "../db";
import {
  chatConversations,
  clientContracts,
  clients,
  contractorPool,
  employees,
  insertShiftSchema,
  shiftChatrooms,
  shiftCoverageRequests,
  shiftOffers,
  shiftOrders,
  shiftRequests,
  shifts,
  sites,
  stagedShifts,
  timeEntries,
  users,
  workspaces
} from '@shared/schema';
import { eq, and, gte, lte, sql, desc, asc, or, between, inArray, ne, isNull, lt } from "drizzle-orm";
import { getUserPlatformRole, resolveWorkspaceForUser } from "../rbac";
import { broadcastShiftUpdate, broadcastNotificationToUser as broadcastNotification, broadcastToWorkspace } from "../websocket";
import { createNotification } from "../services/notificationService";
import { platformEventBus } from "../services/platformEventBus";
import { z } from "zod";
import { shiftChatroomWorkflowService } from "../services/shiftChatroomWorkflowService";
import { approveShift, rejectShift, getPendingShifts, bulkApproveShifts, getApprovalStats } from "../services/shiftApprovalService";
import { shiftRemindersService } from "../services/shiftRemindersService";
import * as notificationHelpers from "../notifications";
import { sendShiftAssignmentEmail } from "../services/emailCore";
import { employeeDocumentOnboardingService } from "../services/employeeDocumentOnboardingService";
import { checkSchedulingEligibility, checkRequiredCertifications } from "../services/compliance/trinityComplianceEngine";
import { shiftRoomBotOrchestrator } from "../services/bots/shiftRoomBotOrchestrator";
import { createLogger } from '../lib/logger';
const log = createLogger('ShiftRoutes');

const router = Router();

// Haversine distance between two GPS coordinates — returns metres
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const bulkShiftLocks = new Map<string, { userId: string; startedAt: number }>();
const BULK_SHIFT_LOCK_TTL_MS = 5 * 60 * 1000;

function acquireBulkShiftLock(workspaceId: string, userId: string): { acquired: boolean; holder?: string } {
  const existing = bulkShiftLocks.get(workspaceId);
  if (existing && Date.now() - existing.startedAt < BULK_SHIFT_LOCK_TTL_MS && existing.userId !== userId) {
    return { acquired: false, holder: existing.userId };
  }
  bulkShiftLocks.set(workspaceId, { userId, startedAt: Date.now() });
  return { acquired: true };
}

function releaseBulkShiftLock(workspaceId: string) {
  bulkShiftLocks.delete(workspaceId);
}

// Helper function to check shift access authorization
async function validateShiftAccess(shiftId: string, employeeId: string, workspaceId: string, storageRef: any): Promise<{ authorized: boolean; shift?: any; reason?: string }> {
  const shift = await storageRef.getShift(shiftId, workspaceId);
  if (!shift) {
    return { authorized: false, reason: "Shift not found" };
  }
  if (shift.workspaceId !== workspaceId) {
    return { authorized: false, reason: "Cross-workspace access denied" };
  }
  if (shift.employeeId !== employeeId) {
    const employee = await storageRef.getEmployee(employeeId, workspaceId);
    const isManager = ['org_owner', 'co_owner', 'org_manager', 'manager', 'department_manager', 'supervisor'].includes(employee?.workspaceRole || '');
    if (!isManager) {
      return { authorized: false, reason: "You are not assigned to this shift and do not have manager permissions" };
    }
  }
  return { authorized: true, shift };
}

  router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
    const startTime = Date.now();
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 200);
      const offset = (page - 1) * limit;
      
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const weekStart = req.query.weekStart as string | undefined;
      const weekEnd = req.query.weekEnd as string | undefined;
      const startDate = weekStart ? new Date(weekStart) : undefined;
      const endDate = weekEnd ? new Date(weekEnd) : undefined;

      const platformRole = await getUserPlatformRole(userId);
      let targetWorkspaceId: string | undefined;

      if (platformRole === 'root_admin' || platformRole === 'sysop' || platformRole === 'support_manager') {
        targetWorkspaceId = req.query.workspaceId as string | undefined;
        if (!targetWorkspaceId) {
          const allWorkspaces = await db.select().from(workspaces).limit(1);
          targetWorkspaceId = allWorkspaces[0]?.id;
        }
      } else {
        const result = await resolveWorkspaceForUser(userId, req.query.workspaceId as string | undefined);
        // @ts-expect-error — TS migration: fix in refactoring sprint
        targetWorkspaceId = result.workspaceId;
        if (!targetWorkspaceId) {
          return res.status(403).json({ error: result.error || 'No workspace access found' });
        }
      }

      if (!targetWorkspaceId) {
        return res.json({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
      }

      // GAP-SCHED-2: Determine caller's role — officers cannot see draft shifts.
      // Managers, owners, platform staff, and schedulers see all statuses.
      const MANAGER_ROLES = ['org_owner','co_owner','org_manager','manager','department_manager','supervisor','support_manager','platform_admin','root_admin','sysop'];
      let callerIsDraftVisible = MANAGER_ROLES.includes(platformRole || '');
      if (!callerIsDraftVisible) {
        const [callerEmp] = await db.select({ workspaceRole: employees.workspaceRole })
          .from(employees)
          .where(and(eq(employees.userId, userId!), eq(employees.workspaceId, targetWorkspaceId)))
          .limit(1);
        callerIsDraftVisible = MANAGER_ROLES.includes(callerEmp?.workspaceRole || '');
      }

      // Count total shifts with date filter
      const whereConditions: ReturnType<typeof eq>[] = [eq(shifts.workspaceId, targetWorkspaceId)];
      if (startDate) whereConditions.push(gte(shifts.startTime, startDate));
      if (endDate) whereConditions.push(lte(shifts.startTime, endDate));
      // Officers only see non-draft shifts (published/scheduled/confirmed)
      if (!callerIsDraftVisible) whereConditions.push(ne(shifts.status, 'draft'));

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(shifts)
        .where(and(...whereConditions));
      
      const total = countResult?.count || 0;

      const allShiftData = await storage.getShiftsByWorkspace(targetWorkspaceId, startDate, endDate, limit, offset);
      // For officers, strip draft shifts from the result (double-enforcement)
      const shiftData = callerIsDraftVisible ? allShiftData : allShiftData.filter((s: any) => s.status !== 'draft');
      
      const clientIds = [...new Set(shiftData.filter(s => s.clientId).map(s => s.clientId as string))];
      let clientNameMap: Record<string, string> = {};
      
      if (clientIds.length > 0) {
        const clientsData = await db
          .select({ id: clients.id, companyName: clients.companyName })
          .from(clients)
          .where(inArray(clients.id, clientIds));
        
        // @ts-expect-error — TS migration: fix in refactoring sprint
        clientNameMap = Object.fromEntries(
          clientsData.map(c => [c.id, c.companyName])
        );
      }
      
      const enrichedShifts = shiftData.map(shift => ({
        ...shift,
        clientName: shift.clientId ? clientNameMap[shift.clientId] || null : null,
      }));
      
      const duration = Date.now() - startTime;
      if (duration > 100) {
        log.info(`[PERF] GET /api/shifts took ${duration}ms for workspace ${targetWorkspaceId}`);
      }

      res.set('X-Total-Count', String(total));
      res.json({
        data: enrichedShifts,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    } catch (error) {
      log.error("Error fetching shifts:", error);
      res.status(500).json({ message: "Failed to fetch shifts" });
    }
  });

  router.get('/today', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const workspaceId = req.workspaceId;
      if (!workspaceId) return res.status(400).json({ error: 'Workspace context required' });

      const employee = await storage.getEmployeeByUserId(userId, workspaceId);
      if (!employee) return res.json([]);

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);

      const todayShifts = await storage.getShiftsByEmployeeAndDateRange(
        workspaceId, employee.id, todayStart, todayEnd
      );

      const mapped = todayShifts.map((s: any) => {
        const start = new Date(s.startTime);
        const end = new Date(s.endTime);
        let status: 'upcoming' | 'active' | 'completed' = 'upcoming';
        if (now >= start && now <= end) status = 'active';
        else if (now > end) status = 'completed';
        return {
          id: s.id,
          // Phase 26E — Surface acknowledgment state so the worker dashboard
          // can render accept/deny controls for shifts awaiting confirmation.
          requiresAcknowledgment: !!s.requiresAcknowledgment,
          acknowledgedAt: s.acknowledgedAt || null,
          deniedAt: s.deniedAt || null,
          rawStatus: s.status || null,
          siteName: s.title || 'Shift',
          siteAddress: '',
          startTime: s.startTime,
          endTime: s.endTime,
          status,
        };
      });

      res.json(mapped);
    } catch (error: unknown) {
      log.error("[ShiftRoute] Failed to fetch today's shifts:", error);
      res.status(500).json({ error: "Failed to fetch today's shifts" });
    }
  });

uter.get('/stats', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

      const stats = await getApprovalStats(workspaceId);
      res.json({ success: true, data: stats });
    } catch (error: unknown) {
      log.error('[ShiftRoute] Error fetching shift stats:', error);
      res.status(500).json({ error: (error instanceof Error ? sanitizeError(error) : null) || String(error) });
    }
  });

  router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const shiftId = req.params.id;
      const workspaceId = req.workspaceId;
      const userId = req.user?.id;
      const workspaceRole = req.workspaceRole;

      if (!workspaceId || !userId) {
        return res.status(403).json({ message: 'Workspace or user context required' });
      }

      const shift = await db.query.shifts.findFirst({
        where: and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)),
      });

      if (!shift) {
        return res.status(404).json({ message: 'Shift not found' });
      }

      // RBAC: Managers/owners can view any shift, employees can only view their assigned shifts
      const isManager = ['org_owner', 'co_owner', 'owner', 'admin', 'manager', 'org_manager', 'department_manager', 'support_staff', 'support_manager', 'platform_admin'].includes(workspaceRole || '');
      const isAssigned = (shift as any).assignedEmployeeIds?.includes(req.employeeId || '') || shift.employeeId === req.employeeId;
      
      if (!isManager && !isAssigned) {
        return res.status(403).json({ error: 'Forbidden - not authorized to view this shift' });
      }

      // Include related employee data for all assigned employees
      let assignedEmployees: any[] = [];
      let client = null;

      // @ts-expect-error — TS migration: fix in refactoring sprint
      const employeeIdsToFetch = Array.isArray(shift.assignedEmployeeIds) 
        ? (shift as any).assignedEmployeeIds 
        : (shift.employeeId ? [shift.employeeId] : []);

      if (employeeIdsToFetch.length > 0) {
        assignedEmployees = await db.query.employees.findMany({
          where: and(
            inArray(employees.id, employeeIdsToFetch),
            eq(employees.workspaceId, workspaceId)
          ),
        });
      }

      if (shift.clientId) {
        client = await db.query.clients.findFirst({
          where: eq(clients.id, shift.clientId),
        });
      }

      res.json({ shift, assignedEmployees, client });
    } catch (error) {
      log.error("Error fetching shift by ID:", error);
      res.status(500).json({ message: "Failed to fetch shift" });
    }
  });

  router.post('/', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspaceId = req.workspaceId!;

      // Extract post orders array before validation (not part of shift schema)
      const { postOrders, ...shiftData } = req.body;

      const { enforceAttribution } = await import('../middleware/dataAttribution');
      const validationResult = insertShiftSchema.safeParse({
        ...shiftData,
        workspaceId,
      });

      if (!validationResult.success) {
        return res.status(400).json({ error: "Validation failed", details: validationResult.error.issues });
      }

      const rawValidated = validationResult.data;

      if (rawValidated.startTime && rawValidated.endTime) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const start = new Date(rawValidated as any).startTime;
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const end = new Date(rawValidated as any).endTime;
        if (businessRuleResponse(res, [
          validateShiftTimes(start, end),
          validateShiftStartPast(start),
          validateShiftEndFuture(end),
        ])) return;
      }

      const validated = enforceAttribution('shifts', rawValidated, req.attribution || {
        workspaceId,
        actorId: userId || null,
        actorType: 'user',
        actorRole: null,
        actorIp: null,
      });

      // OMEGA-L3: CONTRACT REQUIRED BEFORE SCHEDULING
      // On Professional and Enterprise tiers, a shift cannot be created for a client
      // until an executed contract exists for that client in this workspace.
      if (validated.clientId) {
        const [ws] = await db
          .select({ tier: workspaces.subscriptionTier })
          .from(workspaces)
          .where(eq(workspaces.id, workspaceId))
          .limit(1);
        const contractGatedTiers = ['professional', 'enterprise'];
        if (ws && contractGatedTiers.includes(ws.tier || '')) {
          const [executedContract] = await db
            .select({ id: clientContracts.id })
            .from(clientContracts)
            .where(and(
              eq(clientContracts.workspaceId, workspaceId),
              eq(clientContracts.clientId, validated.clientId),
              eq(clientContracts.status, 'executed'),
            ))
            .limit(1);
          if (!executedContract) {
            return res.status(422).json({
              error: {
                code: 'CONTRACT_REQUIRED',
                message: 'An executed contract is required for this client before scheduling shifts on Professional or Enterprise tier.',
              },
              request_id: req.requestId,
            });
          }
        }
      }

      const assignedEmployeeIds = validated.assignedEmployeeIds || (validated.employeeId ? [validated.employeeId] : []);
      if (assignedEmployeeIds.length > 0) {
        const ineligibleEmployees: string[] = [];
        const baseCerts = (validated.requiredCertifications as string[] | undefined) || [];
        // Armed posts automatically require armed certification — enforce regardless of requiredCertifications field
        const requiredCerts = validated.isArmed && !baseCerts.includes('armed')
          ? ['armed', ...baseCerts]
          : baseCerts;
        for (const empId of assignedEmployeeIds) {
          const emp = await storage.getEmployee(empId, workspaceId);
          if (!emp) continue;
          if (emp.workspaceId !== workspaceId) continue;
          // Layer 0: Employment status — terminated/inactive/pending/suspended cannot be assigned
          if (emp.isActive === false) {
            const empName = `${emp.firstName} ${emp.lastName}`;
            ineligibleEmployees.push(`${empName}: Employee is not active (terminated or deactivated)`);
            continue;
          }
          if ((emp as any).status === 'pending') {
            const empName = `${emp.firstName} ${emp.lastName}`;
            ineligibleEmployees.push(`${empName}: Employee is pending activation and cannot be scheduled`);
            continue;
          }
          if ((emp as any).status === 'suspended') {
            const empName = `${emp.firstName} ${emp.lastName}`;
            ineligibleEmployees.push(`${empName}: Employee is suspended and cannot be scheduled`);
            continue;
          }
          // RC5 (Phase 2): Application-level SELECT overlap check removed.
          // Overlap prevention is enforced atomically by the PostgreSQL exclusion constraint
          // `no_overlapping_employee_shifts` on the shifts table (btree_gist extension).
          // Any INSERT that violates the constraint throws error code 23P01, caught below.
          // Layer 1: 14-day onboarding compliance window
          const eligibility = await employeeDocumentOnboardingService.checkWorkEligibility(empId);
          if (!eligibility.eligible) {
            const empName = `${emp.firstName} ${emp.lastName}`;
            ineligibleEmployees.push(`${empName}: ${eligibility.reasons[0] || 'Missing required documents'}`);
            continue;
          }
          // Layer 2: Trinity Compliance — license expiry hard block
          const licenseCheck = await checkSchedulingEligibility(empId, workspaceId);
          if (!licenseCheck.eligible) {
            const empName = `${emp.firstName} ${emp.lastName}`;
            ineligibleEmployees.push(`${empName}: ${licenseCheck.blockReason || 'Security license expired or not on file'}`);
            continue;
          }
          // Layer 3: Required certification check for this shift/post (armed posts always checked)
          if (requiredCerts.length > 0) {
            const certCheck = await checkRequiredCertifications(empId, workspaceId, requiredCerts);
            if (!certCheck.eligible) {
              const empName = `${emp.firstName} ${emp.lastName}`;
              ineligibleEmployees.push(`${empName}: ${certCheck.blockReason || 'Missing required certifications for this post'}`);
            }
          }
          // ── S8: ARMED-SHIFT EMPLOYEE FLAG CHECK ──────────────────────────
          // Armed posts must be assigned to employees flagged `is_armed=true`
          // with a manager-verified armed license. The Layer 3 certification
          // check above validates credentials; this adds a direct check on
          // the employee's armed-worker flag so an officer with the "armed"
          // cert but isArmed=false (e.g. opted out) cannot be scheduled.
          if (validated.isArmed === true) {
            if (!(emp as any).isArmed) {
              const empName = `${emp.firstName} ${emp.lastName}`;
              ineligibleEmployees.push(`${empName}: Not flagged as an armed officer. Armed shifts require employees.is_armed = true.`);
            } else if (!(emp as any).armedLicenseVerified) {
              const empName = `${emp.firstName} ${emp.lastName}`;
              ineligibleEmployees.push(`${empName}: Armed license is not yet manager-verified.`);
            }
          }
        }
        if (ineligibleEmployees.length > 0) {
          return res.status(422).json({
            message: 'Cannot assign shift — employee(s) not work-eligible',
            ineligibleEmployees,
            code: 'COMPLIANCE_BLOCK',
          });
        }
      }

      // GAP-SCHED-3: MINIMUM REST PERIOD CHECK (hard block — labor law compliance)
      // 8 hours of rest required between end of last shift and start of new shift.
      // Only bypassed by org_owner with explicit acknowledgeRestPeriod=true flag,
      // which itself is logged as an audit event.
      const newShiftStart = new Date(validated.startTime);
      const assignedEmpIds2: string[] = validated.assignedEmployeeIds?.length
        ? validated.assignedEmployeeIds
        : validated.employeeId ? [validated.employeeId] : [];

      const MIN_REST_HOURS = 8;
      const restViolations: string[] = [];

      for (const empId of assignedEmpIds2) {
        // Query the most recent shift for this employee that ends before the new shift starts
        const [lastShift] = await db.select({
          id: shifts.id,
          endTime: shifts.endTime,
          startTime: shifts.startTime,
        })
          .from(shifts)
          .where(and(
            eq(shifts.workspaceId, workspaceId),
            eq(shifts.employeeId, empId),
            lt(shifts.endTime, newShiftStart),
            ne(shifts.status, 'cancelled'),
            ne(shifts.status, 'draft'),
          ))
          .orderBy(desc(shifts.endTime))
          .limit(1);

        if (lastShift) {
          const gapHours = (newShiftStart.getTime() - new Date(lastShift.endTime).getTime()) / (1000 * 60 * 60);
          if (gapHours < MIN_REST_HOURS) {
            const emp = await storage.getEmployee(empId, workspaceId);
            const empName = emp ? `${emp.firstName} ${emp.lastName}` : empId;
            restViolations.push(
              `${empName}: only ${gapHours.toFixed(1)}h rest since last shift (minimum ${MIN_REST_HOURS}h required)`
            );
          }
        }
      }

      if (restViolations.length > 0) {
        // org_owner may override with explicit acknowledgment — logs the bypass
        const callerEmpForRest = userId ? await storage.getEmployeeByUserId(userId, workspaceId) : null;
        const isOrgOwner = ['org_owner', 'co_owner'].includes(callerEmpForRest?.workspaceRole || '');
        const acknowledged = req.body.acknowledgeRestPeriod === true;

        if (!isOrgOwner || !acknowledged) {
          return res.status(422).json({
            message: 'Cannot assign shift — minimum rest period not met',
            restViolations,
            code: 'REST_PERIOD_VIOLATION',
            canOverride: isOrgOwner,
          });
        }
        // Org-owner override: log the bypass for compliance audit
        try {
          await storage.createAuditLog({
            workspaceId,
            action: 'rest_period_override',
            entityType: 'shift',
            entityId: validated.id || 'new',
            userId,
            // @ts-expect-error — TS migration: fix in refactoring sprint
            details: { restViolations, overriddenBy: userId, overrideTimestamp: new Date().toISOString() },
          });
        } catch (err: any) {
          log.warn('[Shifts] Failed to broadcast WebSocket update', { error: err.message });
        }
      }

      // GAP-SCHED-4: OVERTIME WARNING at manual assignment time
      // Fires before the INSERT — manager must acknowledge before proceeding.
      // Acknowledgment is recorded in audit log. Non-blocking (warning, not error).
      const OT_THRESHOLD_HOURS = 40;
      const overtimeWarnings: Array<{ employeeId: string; name: string; currentHours: number; shiftHours: number; projectedHours: number }> = [];

      if (newShiftStart) {
        const newShiftEnd = new Date(validated.endTime);
        const newShiftHours = (newShiftEnd.getTime() - newShiftStart.getTime()) / (1000 * 60 * 60);
        const weekStart = new Date(newShiftStart);
        weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
        weekStart.setUTCHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

        for (const empId of assignedEmpIds2) {
          const weekShifts = await storage.getShiftsByEmployeeAndDateRange(workspaceId, empId, weekStart, weekEnd);
          const currentHours = weekShifts
            .filter((s: any) => !['cancelled', 'draft'].includes(s.status))
            .reduce((sum: number, s: any) => {
              const sh = (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / (1000 * 60 * 60);
              return sum + sh;
            }, 0);
          const projected = currentHours + newShiftHours;
          if (projected > OT_THRESHOLD_HOURS) {
            const emp = await storage.getEmployee(empId, workspaceId);
            overtimeWarnings.push({
              employeeId: empId,
              name: emp ? `${emp.firstName} ${emp.lastName}` : empId,
              currentHours: Math.round(currentHours * 10) / 10,
              shiftHours: Math.round(newShiftHours * 10) / 10,
              projectedHours: Math.round(projected * 10) / 10,
            });
          }
        }
      }

      if (overtimeWarnings.length > 0 && req.body.acknowledgeOvertime !== true) {
        return res.status(200).json({
          overtimeWarning: true,
          overtimeWarnings,
          message: 'Assignment would push officer(s) into overtime. Acknowledge to proceed.',
          code: 'OVERTIME_WARNING',
        });
      }

      // GAP-SCHED-7: Record OT acknowledgment in audit log when manager proceeds past warning
      if (overtimeWarnings.length > 0 && req.body.acknowledgeOvertime === true) {
        try {
          await storage.createAuditLog({
            workspaceId,
            action: 'overtime_assignment_acknowledged',
            entityType: 'shift',
            entityId: 'new',
            userId,
            // @ts-expect-error — TS migration: fix in refactoring sprint
            details: {
              overtimeWarnings,
              acknowledgedBy: userId,
              acknowledgedAt: new Date().toISOString(),
            },
          });
        } catch (err: any) {
          log.warn('[Shifts] Failed to broadcast WebSocket update', { error: err.message });
        }
      }

      // ATOMIC DOUBLE-BOOKING GUARD:
      // Advisory lock per employee (released at tx end) + final overlap re-check inside the
      // transaction closes the TOCTOU window between the pre-check above and the INSERT.
      // Concurrent requests for the same employee block here until the first completes.
      const assignedEmpIds: string[] = validated.assignedEmployeeIds?.length
        ? validated.assignedEmployeeIds
        : validated.employeeId ? [validated.employeeId] : [];

      let shift: typeof import('@shared/schema').shifts.$inferSelect;
      try {
        shift = await db.transaction(async (tx) => {
          // RC5 (Phase 2): Advisory lock serializes concurrent requests per employee.
          // The PostgreSQL exclusion constraint `no_overlapping_employee_shifts` (btree_gist)
          // atomically rejects any INSERT that creates an overlap — 23P01 is caught below.
          // The application-level SELECT overlap check has been permanently retired.
          for (const empId of assignedEmpIds) {
            await tx.execute(sql`SELECT pg_advisory_xact_lock(abs(hashtext(${empId})))`);
          }

          // @ts-expect-error — TS migration: fix in refactoring sprint
          const [newShift] = await tx.insert(shifts).values(validated).returning();

          // T005: Create staged shift record for invoicing if client is billable
          if (newShift.clientId && newShift.billRate && parseFloat(newShift.billRate) > 0) {
            // @ts-expect-error — TS migration: fix in refactoring sprint
            await tx.insert(stagedShifts).values({
              workspaceId,
              shiftId: newShift.id,
              clientId: newShift.clientId,
              employeeId: newShift.employeeId,
              billRate: newShift.billRate,
              status: 'pending',
              createdAt: new Date(),
            });
          }
          return newShift;
        });
      } catch (err: unknown) {
        // RC5 (Phase 2): PostgreSQL exclusion constraint 23P01 — shift overlap detected atomically.
        // This is the sole enforcement mechanism for shift overlap prevention.
        if ((err as any)?.code === '23P01') {
          return res.status(409).json({
            error: 'This employee already has a shift during this time period',
            code: 'SHIFT_OVERLAP_CONFLICT',
          });
        }
        throw err;
      }

      // Emit webhook AFTER transaction commits successfully (prevents phantom webhooks on rollback)
      try {
        const { deliverWebhookEvent } = await import('../services/webhookDeliveryService');
        deliverWebhookEvent(workspaceId, 'shift.created', {
          shiftId: shift.id,
          employeeId: shift.employeeId,
          clientId: shift.clientId,
          startTime: shift.startTime,
          endTime: shift.endTime,
          date: shift.date,
        });
      } catch (webhookErr: any) {
        log.warn('[Shifts] Failed to log webhook error to audit log', { error: webhookErr.message });
      }

      // Pre-provision a pending shift chatroom so manager↔officer messaging
      // works the moment the shift hits the schedule — before clock-in.
      // Awaited try/catch (non-fatal): per TRINITY.md §B no fire-and-forget.
      try {
        const { shiftChatroomWorkflowService } = await import('../services/shiftChatroomWorkflowService');
        await shiftChatroomWorkflowService.provisionChatroom({
          shiftId: shift.id,
          workspaceId,
          siteId: shift.siteId ?? undefined,
          assignedEmployeeId: shift.employeeId ?? undefined,
        });
      } catch (provisionErr: any) {
        log.warn('[ShiftChatroom] provisionChatroom failed (non-blocking):', provisionErr?.message);
      }

      // Notify assigned employees about new shift
      try {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        if (shift.assignedEmployeeIds && Array.isArray(shift.assignedEmployeeIds)) {
          for (const empId of (shift as any).assignedEmployeeIds) {
            const empUser = await db.query.users.findFirst({
              where: eq(users.id, empId),
            });
            if (empUser) {
              await createNotification({
                workspaceId,
                userId: empId,
                type: 'shift_assigned' as any,
                title: '📅 New Shift Assigned',
                message: `You've been assigned to a shift on ${new Date(shift.startTime).toLocaleDateString()}`,
                actionUrl: `/schedule`,
                relatedEntityType: 'shift',
                relatedEntityId: shift.id,
                createdBy: userId,
                idempotencyKey: `shift_assigned-${shift.id}-${empId}`
              });
              try {
                const { NotificationDeliveryService } = await import("../services/notificationDeliveryService");
                await NotificationDeliveryService.send({
                  idempotencyKey: `notif-${Date.now()}`,
            type: "shift_assignment",
                  workspaceId,
                  recipientUserId: empId,
                  channel: "push",
                  subject: "New Shift Assigned",
                  body: {
                    title: "New Shift Assigned",
                    body: `You've been assigned to ${shift.title || 'a shift'} on ${new Date(shift.startTime).toLocaleDateString()}`,
                    idempotencyKey: `notif-${Date.now()}`,
            type: "shift_reminder",
                    url: "/schedule",
                    shiftId: shift.id,
                  }
                });
              } catch (_pushErr) {
                log.warn('[Shifts] Push notification failed for shift reminder via NDS:', _pushErr);
              }
            }
          }
        }
      } catch (notifyError) {
        log.error('Error sending shift notification:', notifyError);
      }

      // AUDIT LOG: Shift created
      try {
        await storage.createAuditLog({
          workspaceId,
          action: 'shift_created',
          entityType: 'shift',
          entityId: shift.id,
          userId,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          details: {
            date: new Date(shift.startTime).toISOString().split('T')[0],
            positions: (shift as any).assignedEmployeeIds?.length || 0,
            location: validated.location,
          },
        });
      } catch (auditError) {
        log.error('Audit log error:', auditError);
      }
      
      // Create shift orders (post orders) if provided
      if (postOrders && Array.isArray(postOrders) && postOrders.length > 0) {
        const POST_ORDER_TEMPLATES = [
          {
            id: '1',
            title: 'Security Patrol Requirements',
            description: 'Complete hourly patrols of all assigned areas',
            requiresAcknowledgment: true,
            requiresSignature: true,
            requiresPhotos: true,
            photoFrequency: 'hourly',
            photoInstructions: 'Take photos of each checkpoint during patrol'
          },
          {
            id: '2',
            title: 'Opening Procedures',
            description: 'Follow all opening checklist items',
            requiresAcknowledgment: true,
            requiresSignature: false,
            requiresPhotos: false,
            photoFrequency: null,
            photoInstructions: null
          },
          {
            id: '3',
            title: 'Closing Procedures',
            description: 'Complete all closing duties and security checks',
            requiresAcknowledgment: true,
            requiresSignature: true,
            requiresPhotos: true,
            photoFrequency: 'at_completion',
            photoInstructions: 'Document all secured areas before leaving'
          },
          {
            id: '4',
            title: 'Equipment Inspection',
            description: 'Inspect and document condition of all equipment',
            requiresAcknowledgment: true,
            requiresSignature: false,
            requiresPhotos: true,
            photoFrequency: 'hourly',
            photoInstructions: 'Photo evidence of equipment status'
          }
        ];

        for (const orderId of postOrders) {
          const template = POST_ORDER_TEMPLATES.find(t => t.id === orderId);
          if (template) {
            // @ts-expect-error — TS migration: fix in refactoring sprint
            await db.insert(shiftOrders).values({
              workspaceId,
              shiftId: shift.id,
              title: template.title,
              description: template.description,
              requiresAcknowledgment: template.requiresAcknowledgment,
              requiresSignature: template.requiresSignature,
              requiresPhotos: template.requiresPhotos,
              photoFrequency: template.photoFrequency,
              photoInstructions: template.photoInstructions,
              createdBy: userId,
            });
          }
        }

      }
      
      // Send shift assignment email if employee has email
      if (shift.employeeId) {
        const employee = await storage.getEmployee(shift.employeeId, workspaceId);
        const client = shift.clientId ? await storage.getClient(shift.clientId, workspaceId) : null;
        
        if (employee?.email) {
          const startTime = new Date(shift.startTime).toLocaleString('en-US', {
            dateStyle: 'full',
            timeStyle: 'short'
          });
          const endTime = new Date(shift.endTime).toLocaleString('en-US', {
            timeStyle: 'short'
          });
          
          sendShiftAssignmentEmail(employee.email, {
            employeeName: `${employee.firstName} ${employee.lastName}`,
            shiftTitle: shift.title || 'Shift',
            startTime,
            endTime,
            // @ts-expect-error — TS migration: fix in refactoring sprint
            clientName: client ? `${client.firstName} ${client.lastName}` : undefined
          }).catch(err => log.error('Failed to send shift assignment email:', err));
        }
      }
      
      // 📡 REAL-TIME: Broadcast shift creation ONLY after successful DB operation
      broadcastShiftUpdate(workspaceId, 'shift_created', shift);

      // Note: chatroom is pre-provisioned at the top of this handler (see
      // provisionChatroom call above) — no duplicate provision needed here.

      // 🧠 TRINITY: Publish to platformEventBus so Trinity and all service monitors see this shift
      platformEventBus.publish({
        type: 'shift_created',
        category: 'workforce',
        title: 'Shift Created',
        description: `New shift scheduled: ${shift.title || 'Unnamed shift'}`,
        workspaceId,
        metadata: {
          shiftId: shift.id,
          employeeId: shift.employeeId,
          clientId: shift.clientId,
          siteId: shift.siteId,
          startTime: shift.startTime,
          endTime: shift.endTime,
          status: shift.status,
          billRate: shift.billRate,
          payRate: shift.payRate,
          title: shift.title,
        },
        visibility: 'manager',
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      // 📡 REAL-TIME: Additional shift_assigned event so employee schedule views update instantly
      if (shift.employeeId) {
        broadcastToWorkspace(workspaceId, {
          type: 'shift_assigned',
          shiftId: shift.id,
          employeeId: shift.employeeId,
          workspaceId,
          startTime: shift.startTime,
          endTime: shift.endTime,
          title: shift.title,
          timestamp: new Date().toISOString(),
        });
      }

      // 🤖 TRINITY: When a shift is created with no assigned employee, trigger Trinity
      // to auto-fill it. Fire-and-forget — do not block the HTTP response.
      if (!shift.employeeId) {
        (async () => {
          try {
            const { autonomousSchedulingDaemon } = await import('../services/scheduling/autonomousSchedulingDaemon');
            await autonomousSchedulingDaemon.triggerManualRun(workspaceId, 'current_day');
            log.info(`[Trinity] Auto-fill triggered for uncovered shift ${shift.id} in workspace ${workspaceId}`);
          } catch (trinityErr: unknown) {
            log.warn('[Trinity] Auto-fill trigger failed for new uncovered shift:', (trinityErr as any)?.message);
          }
        })();
      }
      
      // 🔔 NOTIFICATION: Create notification for assigned employee
      if (shift.employeeId) {
        const shiftDate = new Date(shift.startTime).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
        
        await notificationHelpers.createShiftAssignedNotification(
          { storage, broadcastNotification },
          {
            workspaceId,
            userId: shift.employeeId,
            shiftId: shift.id,
            shiftTitle: shift.title || 'Shift',
            shiftDate,
            assignedBy: userId,
          }
        ).catch(err => log.error('Failed to create shift notification:', err));

        try {
          const { NotificationDeliveryService } = await import("../services/notificationDeliveryService");
          await NotificationDeliveryService.send({
            idempotencyKey: `notif-${Date.now()}`,
            type: "shift_assignment",
            workspaceId,
            recipientUserId: shift.employeeId,
            channel: "push",
            subject: "New Shift Assigned",
            body: {
              title: "New Shift Assigned",
              body: `You've been assigned to ${shift.title || 'a shift'} on ${shiftDate}`,
              idempotencyKey: `notif-${Date.now()}`,
            type: "shift_reminder",
              url: "/schedule",
              shiftId: shift.id,
            }
          });
        } catch (_pushErr) {
          log.warn('[Shifts] Push notification failed for shift update via NDS:', _pushErr);
        }
      }

      // 🤖 SHIFT ROOM: Auto-create shift room when an employee is assigned
      if (shift.employeeId) {
        (async () => {
          try {
            const [emp] = await db.select().from(employees).where(eq(employees.id, shift.employeeId!)).limit(1);
            if (emp && emp.userId) {
              const empName = emp.lastName ? `${emp.firstName} ${emp.lastName}` : (emp.firstName || 'Officer');
              const siteName = (shift as any).siteName || (shift as any).jobSiteName || shift.title || 'Site';
              await shiftRoomBotOrchestrator.createShiftRoomOnAssignment({
                workspaceId,
                shiftId: shift.id,
                shiftTitle: shift.title || 'Shift',
                siteName,
                shiftStart: new Date(shift.startTime),
                shiftEnd: new Date(shift.endTime),
                officerUserId: emp.userId,
                officerEmployeeId: emp.id,
                officerName: empName,
                createdBy: userId,
              });
            }
          } catch (roomErr: unknown) {
            log.warn('[Shifts] Shift room auto-creation failed (non-blocking):', (roomErr as any)?.message);
          }
        })();
      }

      res.status(201).json(shift);
    } catch (error: unknown) {
      log.error("Error creating shift:", error);
      res.status(400).json({ message: sanitizeError(error) || "Failed to create shift" });
    }
  });

  router.patch('/:id', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspaceId = req.workspaceId!;

      const { workspaceId: _, ...updateData } = req.body;
      const validationResult = insertShiftSchema.partial().safeParse(updateData);
      if (!validationResult.success) {
        return res.status(400).json({ error: "Validation failed", details: validationResult.error.issues });
      }
      const validated = validationResult.data;

      if (validated.startTime && validated.endTime) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const start = new Date(validated as any).startTime;
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const end = new Date(validated as any).endTime;
        if (businessRuleResponse(res, [
          validateShiftTimes(start, end),
          validateShiftStartPast(start),
          validateShiftEndFuture(end),
        ])) return;
      }

      const newAssignees = (validated as any).assignedEmployeeIds || (validated.employeeId ? [validated.employeeId] : []);
      if (newAssignees.length > 0) {
        const ineligibleEmployees: string[] = [];
        const invalidEmployees: string[] = [];
        const baseCerts = (validated.requiredCertifications as string[] | undefined) || [];
        // For PATCH: check if this or the existing shift is armed, auto-require armed cert
        let shiftIsArmed = (validated as any).isArmed;
        let existingShiftForValidation = null;
        if (shiftIsArmed === undefined || validated.startTime === undefined || validated.endTime === undefined) {
          existingShiftForValidation = await storage.getShift(req.params.id, workspaceId);
          if (shiftIsArmed === undefined) shiftIsArmed = (existingShiftForValidation as any)?.isArmed ?? false;
        }
        
        const requiredCerts = shiftIsArmed && !baseCerts.includes('armed')
          ? ['armed', ...baseCerts]
          : baseCerts;
        
        for (const empId of newAssignees) {
          const emp = await storage.getEmployee(empId, workspaceId);
          if (!emp || emp.workspaceId !== workspaceId) {
            invalidEmployees.push(empId);
            continue;
          }
          // Layer 0: Employment status — terminated/inactive cannot be assigned
          if (emp.isActive === false) {
            const empName = `${emp.firstName} ${emp.lastName}`;
            ineligibleEmployees.push(`${empName}: Employee is not active (terminated or deactivated)`);
            continue;
          }
          // RC5 (Phase 2): Application-level SELECT overlap check removed.
          // The PostgreSQL exclusion constraint `no_overlapping_employee_shifts` (btree_gist)
          // atomically rejects any UPDATE that creates an overlap — 23P01 is caught below.
          // Layer 1: 14-day onboarding compliance window
          const eligibility = await employeeDocumentOnboardingService.checkWorkEligibility(empId);
          if (!eligibility.eligible) {
            const empName = `${emp.firstName} ${emp.lastName}`;
            ineligibleEmployees.push(`${empName}: ${eligibility.reasons[0] || 'Missing required documents'}`);
            continue;
          }
          // Layer 2: Trinity Compliance — license expiry hard block
          const licenseCheck = await checkSchedulingEligibility(empId, workspaceId);
          if (!licenseCheck.eligible) {
            const empName = `${emp.firstName} ${emp.lastName}`;
            ineligibleEmployees.push(`${empName}: ${licenseCheck.blockReason || 'Security license expired or not on file'}`);
            continue;
          }
          // Layer 3: Required certification check for this shift/post
          if (requiredCerts.length > 0) {
            const certCheck = await checkRequiredCertifications(empId, workspaceId, requiredCerts);
            if (!certCheck.eligible) {
              const empName = `${emp.firstName} ${emp.lastName}`;
              ineligibleEmployees.push(`${empName}: ${certCheck.blockReason || 'Missing required certifications for this post'}`);
            }
          }
        }
        if (invalidEmployees.length > 0) {
          return res.status(400).json({
            message: 'One or more employee IDs are invalid or do not belong to this workspace',
            invalidEmployees,
            code: 'INVALID_EMPLOYEE',
          });
        }
        if (ineligibleEmployees.length > 0) {
          return res.status(422).json({
            message: 'Cannot assign shift — employee(s) not work-eligible',
            ineligibleEmployees,
            code: 'COMPLIANCE_BLOCK',
          });
        }
      }

      const isManualAssignment = !!(validated.employeeId && !validated.aiGenerated);
      if (isManualAssignment) {
        (validated as any).isManuallyLocked = true;
      }

      // T004: Atomic shift assignment using transactions with FOR UPDATE
      // Capture before-state for audit trail on manual corrections
      let shiftBeforeState: any = null;
      let shift: typeof import('@shared/schema').shifts.$inferSelect | null | undefined;
      try {
        shift = await db.transaction(async (tx) => {
          const [currentShift] = await tx
            .select()
            .from(shifts)
            .where(and(eq(shifts.id, req.params.id), eq(shifts.workspaceId, workspaceId)))
            .for('update')
            .limit(1);

          if (!currentShift) {
            return null;
          }

          shiftBeforeState = currentShift;

          // SHIFT STATE MACHINE: Enforce legal status transitions.
          // Valid transitions: OPEN→ASSIGNED, OPEN→CANCELLED, OPEN→DRAFT,
          //   ASSIGNED→OPEN, ASSIGNED→CANCELLED, DRAFT→OPEN, any→cancelled.
          // STARTED and COMPLETED are terminal — only reachable via /start and /end endpoints.
          // This PATCH handler MUST NOT allow jumping to STARTED or COMPLETED directly.
          if (validated.status && validated.status !== currentShift.status) {
            const from = currentShift.status as string;
            const to = validated.status as string;
            const ALLOWED_TRANSITIONS: Record<string, string[]> = {
              draft:     ['open', 'cancelled'],
              open:      ['assigned', 'cancelled', 'draft'],
              assigned:  ['open', 'cancelled'],
              started:   [],
              completed: [],
              cancelled: [],
            };
            const allowed = ALLOWED_TRANSITIONS[from] ?? [];
            if (!allowed.includes(to)) {
              throw Object.assign(
                new Error(`Illegal shift status transition: ${from} → ${to}. Use the dedicated /start or /end endpoint for STARTED/COMPLETED transitions.`),
                { statusCode: 422, code: 'ILLEGAL_SHIFT_TRANSITION' }
              );
            }
          }

          // If we're assigning to an employee, check if it's already assigned
          if (validated.employeeId && currentShift.employeeId && currentShift.employeeId !== validated.employeeId) {
            throw Object.assign(new Error("Shift is already assigned to another employee"), {
              statusCode: 409,
              code: 'SHIFT_ALREADY_ASSIGNED',
            });
          }

          const [updated] = await tx
            .update(shifts)
            // @ts-expect-error — TS migration: fix in refactoring sprint
            .set({ ...validated, updatedAt: new Date() })
            .where(eq(shifts.id, req.params.id))
            .returning();
          
          return updated;
        });
      } catch (err: unknown) {
        // RC5 (Phase 2): PostgreSQL exclusion constraint 23P01 — shift overlap on UPDATE.
        if ((err as any)?.code === '23P01') {
          return res.status(409).json({
            error: 'This employee already has a shift during this time period',
            code: 'SHIFT_OVERLAP_CONFLICT',
          });
        }
        const e = err as any;
        if (e?.code === 'ILLEGAL_SHIFT_TRANSITION' || e?.statusCode === 422) {
          return res.status(422).json({ error: e.message, code: e.code });
        }
        if (e?.code === 'SHIFT_ALREADY_ASSIGNED' || e?.statusCode === 409) {
          return res.status(409).json({ message: e.message, code: e.code });
        }
        throw err;
      }

      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }

      // Audit log: capture before/after diff for ALL manual shift edits (SOC2 compliance)
      // Trinity notes every manual correction to maintain accurate data lineage
      if (userId && shiftBeforeState) {
        const isManualEdit = isManualAssignment || Object.keys(validated).some(
          k => k !== 'aiGenerated' && (validated as any)[k] !== undefined
        );
        if (isManualEdit) {
          storage.createAuditLog({
            workspaceId,
            userId,
            action: 'manual_shift_edit',
            actionDescription: isManualAssignment
              ? `Manager manually assigned employee to shift "${shift.title || shift.id}" — Trinity locked from auto-reassignment`
              : `Manager manually edited shift "${shift.title || shift.id}"`,
            entityType: 'shift',
            entityId: shift.id,
            // @ts-expect-error — TS migration: fix in refactoring sprint
            before: shiftBeforeState,
            after: shift,
            metadata: {
              changedFields: Object.keys(validated),
              isManuallyLocked: isManualAssignment,
              complianceTag: 'trinity_correction_tracking',
            },
          }).catch(err => log.warn('[ShiftAudit] Failed to write audit log:', err));
        }
      }

      // GPS Out-of-Bounds check at shift completion — flags to scheduling audit trail
      // Genesis Step 8: shift completes but system records out-of-bounds GPS in audit log
      if (validated.status === 'completed') {
        const { completionGpsLat, completionGpsLng } = req.body;
        if (completionGpsLat != null && completionGpsLng != null) {
          (async () => {
            try {
              const siteId = shift.siteId;
              let geofenceLat: string | null = null;
              let geofenceLng: string | null = null;
              let geofenceRadiusMeters = 200;
              if (siteId) {
                const [site] = await db.select({
                  geofenceLat: sites.geofenceLat,
                  geofenceLng: sites.geofenceLng,
                  geofenceRadiusMeters: sites.geofenceRadiusMeters,
                }).from(sites).where(and(eq(sites.id, siteId), eq(sites.workspaceId, workspaceId))).limit(1);
                if (site) {
                  geofenceLat = site.geofenceLat;
                  geofenceLng = site.geofenceLng;
                  geofenceRadiusMeters = site.geofenceRadiusMeters ?? 200;
                }
              }
              if (geofenceLat && geofenceLng) {
                const distanceM = haversineMeters(
                  parseFloat(String(completionGpsLat)), parseFloat(String(completionGpsLng)),
                  parseFloat(String(geofenceLat)), parseFloat(String(geofenceLng))
                );
                if (distanceM > geofenceRadiusMeters) {
                  log.warn(`[ShiftGPS] Shift ${shift.id} completed ${distanceM.toFixed(0)}m outside site geofence (threshold: ${geofenceRadiusMeters}m) — flagging out-of-bounds`);
                  storage.createAuditLog({
                    workspaceId,
                    userId: userId!,
                    action: 'scheduling_gps_out_of_bounds',
                    actionDescription: `Shift completion GPS ${distanceM.toFixed(0)}m from site geofence (threshold: ${geofenceRadiusMeters}m)`,
                    entityType: 'shift',
                    entityId: shift.id,
                    metadata: {
                      completionGpsLat,
                      completionGpsLng,
                      siteGeofenceLat: geofenceLat,
                      siteGeofenceLng: geofenceLng,
                      distanceMeters: Math.round(distanceM),
                      thresholdMeters: geofenceRadiusMeters,
                      complianceTag: 'scheduling_gps_audit',
                    },
                  }).catch(err => log.warn('[ShiftGPS] Failed to write out-of-bounds audit log:', err));
                }
              }
            } catch (gpsErr) {
              log.warn('[ShiftGPS] GPS out-of-bounds check failed (non-blocking):', gpsErr);
            }
          })();
        }
      }

      // 📡 REAL-TIME: Broadcast shift update ONLY after successful DB operation
      broadcastShiftUpdate(workspaceId, 'shift_updated', shift);

      // 🧠 TRINITY: Publish to platformEventBus so Trinity monitors see the change
      platformEventBus.publish({
        type: 'shift_updated',
        category: 'workforce',
        title: 'Shift Updated',
        description: `Shift modified: ${shift.title || shift.id}`,
        workspaceId,
        metadata: {
          shiftId: shift.id,
          employeeId: shift.employeeId,
          clientId: shift.clientId,
          siteId: shift.siteId,
          changedFields: Object.keys(validated),
          status: shift.status,
          billRate: shift.billRate,
          payRate: shift.payRate,
          startTime: shift.startTime,
          endTime: shift.endTime,
          title: shift.title,
        },
        visibility: 'manager',
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      // 📡 REAL-TIME: If an employee was assigned/reassigned, fire specific shift_assigned event
      if (isManualAssignment && shift.employeeId) {
        broadcastToWorkspace(workspaceId, {
          type: 'shift_assigned',
          shiftId: shift.id,
          employeeId: shift.employeeId,
          workspaceId,
          startTime: shift.startTime,
          endTime: shift.endTime,
          title: shift.title,
          timestamp: new Date().toISOString(),
        });
      }
      
      // 🔔 NOTIFICATION: Notify assigned employee about changes
      if (shift.employeeId) {
        const changeDescriptions = [];
        if (validated.startTime || validated.endTime) changeDescriptions.push('time');
        if (validated.title) changeDescriptions.push('title');
        if (validated.clientId !== undefined) changeDescriptions.push('location/client');
        
        const changes = changeDescriptions.length > 0 
          ? changeDescriptions.join(', ')
          : 'details updated';
        
        await notificationHelpers.createShiftChangedNotification(
          { storage, broadcastNotification },
          {
            workspaceId,
            userId: shift.employeeId,
            shiftId: shift.id,
            shiftTitle: shift.title || 'Shift',
            changes,
            changedBy: userId,
          }
        ).catch(err => log.error('Failed to create shift update notification:', err));
      }

      // 🤖 SHIFT ROOM: Auto-create shift room when employee newly assigned in PATCH
      if (shift.employeeId) {
        (async () => {
          try {
            const [emp] = await db.select().from(employees).where(eq(employees.id, shift.employeeId!)).limit(1);
            if (emp && emp.userId) {
              const empName = emp.lastName ? `${emp.firstName} ${emp.lastName}` : (emp.firstName || 'Officer');
              const siteName = (shift as any).siteName || (shift as any).jobSiteName || shift.title || 'Site';
              await shiftRoomBotOrchestrator.createShiftRoomOnAssignment({
                workspaceId,
                shiftId: shift.id,
                shiftTitle: shift.title || 'Shift',
                siteName,
                shiftStart: new Date(shift.startTime),
                shiftEnd: new Date(shift.endTime),
                officerUserId: emp.userId,
                officerEmployeeId: emp.id,
                officerName: empName,
                createdBy: userId,
              });
            }
          } catch (roomErr: unknown) {
            log.warn('[Shifts] Shift room auto-creation failed (non-blocking):', (roomErr as any)?.message);
          }
        })();
      }

      res.json(shift);
    } catch (error: unknown) {
      log.error("Error updating shift:", error);
      res.status(400).json({ message: sanitizeError(error) || "Failed to update shift" });
    }
  });

uter.post('/:shiftId/pickup', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { shiftId } = req.params;
      const userId = req.user?.id;
      const workspaceId = req.workspaceId;

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      if (!workspaceId) {
        return res.status(400).json({ message: 'No workspace selected' });
      }

      const [shift] = await db.select().from(shifts).where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId))).limit(1);
      if (!shift) {
        return res.status(404).json({ message: 'Shift not found' });
      }

      if (shift.employeeId) {
        return res.status(409).json({ message: 'This shift is already assigned to an employee' });
      }

      const employee = await storage.getEmployeeByUserId(userId);
      if (!employee) {
        return res.status(404).json({ message: 'Employee record not found for current user' });
      }

      if (employee.workspaceId !== workspaceId) {
        return res.status(403).json({ message: 'Employee does not belong to this workspace' });
      }

      const eligibility = await employeeDocumentOnboardingService.checkWorkEligibility(employee.id);
      if (!eligibility.eligible) {
        return res.status(422).json({
          message: 'You cannot pick up shifts — your compliance documents are incomplete',
          reasons: eligibility.reasons,
          code: 'COMPLIANCE_BLOCK',
        });
      }

      const updatedShift = await db.transaction(async (tx) => {
        const [currentShift] = await tx
          .select({ id: shifts.id, employeeId: shifts.employeeId })
          .from(shifts)
          .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)))
          .for('update')
          .limit(1);

        if (!currentShift) {
          throw Object.assign(new Error("Shift not found"), { statusCode: 404 });
        }
        if (currentShift.employeeId) {
          throw Object.assign(new Error("Shift was already picked up by another employee"), {
            statusCode: 409,
            code: 'SHIFT_ALREADY_CLAIMED',
          });
        }

        const [updated] = await tx
          .update(shifts)
          .set({ employeeId: employee.id, updatedAt: new Date() })
          .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)))
          .returning();
        return updated;
      });

      res.json(updatedShift);
    } catch (error: unknown) {
      log.error('[Shift Marketplace] Pickup error:', error);
      res.status(500).json({ message: sanitizeError(error) || 'Failed to pick up shift' });
    }
  });

router.post('/:id/acknowledge', requireEmployee, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const employeeId = req.employeeId;

      const shift = await storage.getShift(req.params.id, workspaceId);
      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }

      // OWNERSHIP CHECK: Employee can only acknowledge their own shifts
      if (shift.employeeId !== employeeId) {
        return res.status(403).json({ message: "You can only acknowledge shifts assigned to you" });
      }

      // Update shift with acknowledgment
      const updated = await storage.updateShift(req.params.id, workspaceId, {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        acknowledgedAt: new Date().toISOString(),
        status: 'scheduled',
      });

      // 📡 REAL-TIME: Broadcast so all managers/dashboards update instantly
      broadcastShiftUpdate(workspaceId, 'shift_updated', updated);
      broadcastToWorkspace(workspaceId, {
        type: 'shift_acknowledged',
        shiftId: req.params.id,
        employeeId,
        workspaceId,
        timestamp: new Date().toISOString(),
      });

      // 🧠 TRINITY: Trinity needs to see acknowledgments to track coverage confidence
      platformEventBus.publish({
        type: 'shift_updated',
        category: 'workforce',
        title: 'Shift Acknowledged',
        description: `Officer confirmed shift assignment`,
        workspaceId,
        metadata: { shiftId: req.params.id, employeeId, action: 'acknowledged' },
        visibility: 'manager',
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      res.json({
        success: true,
        shift: updated,
        message: "Shift acknowledged successfully"
      });
    } catch (error: unknown) {
      log.error("Error acknowledging shift:", error);
      res.status(500).json({ message: "Failed to acknowledge shift" });
    }
  });

// ── Phase 26H — one-click supervisor mark-calloff ─────────────────────────
  // Wraps fireCallOffSequence so the supervisor deep-link from
  // missedClockInWorkflow's escalation notification (Phase 26G) does not
  // require the caller to assemble the full calloff payload. The shift +
  // officer + supervisor context is resolved internally and tenant-scoped
  // (§G). Manager role or higher.
router.post('/:shiftId/acknowledgments', requireManager, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const { eq, and } = await import("drizzle-orm");

      // Verify shift belongs to workspace
      const shift = await db.query.shifts.findFirst({
        where: and(
          eq(shifts.id, req.params.shiftId),
          eq(shifts.workspaceId, workspaceId)
        ),
      });

      if (!shift) {
        return res.status(404).json({ message: "Shift not found in this workspace" });
      }

      // Get the current employee (who is creating the acknowledgment)
      const currentEmployee = await db.query.employees.findFirst({
        where: eq(employees.userId, userId),
      });

      if (!currentEmployee) {
        return res.status(404).json({ message: "Employee record not found" });
      }

      // Validate request body
      const ackBodySchema = z.object({
        employeeId: z.string().optional(),
      });
      const ackBodyParsed = ackBodySchema.safeParse(req.body);
      if (!ackBodyParsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: ackBodyParsed.error.flatten() });
      }

      // Verify target employee belongs to workspace
      if (ackBodyParsed.data.employeeId) {
        const targetEmployee = await db.query.employees.findFirst({
          where: and(
            eq(employees.id, ackBodyParsed.data.employeeId),
            eq(employees.workspaceId, workspaceId)
          ),
        });

        if (!targetEmployee) {
          return res.status(404).json({ message: "Target employee not found in this workspace" });
        }
      }

      const { insertShiftAcknowledgmentSchema, shiftAcknowledgments } = await import("@shared/schema");
      
      const validatedData = insertShiftAcknowledgmentSchema.parse({
        ...req.body,
        workspaceId,
        shiftId: req.params.shiftId,
        createdBy: currentEmployee.id,
      });

      const [acknowledgment] = await db.insert(shiftAcknowledgments)
        .values(validatedData)
        .returning();

      res.json(acknowledgment);
    } catch (error: unknown) {
      log.error("Error creating shift acknowledgment:", error);
      res.status(400).json({ message: sanitizeError(error) || "Failed to create acknowledgment" });
    }
  });

uter.post('/:shiftId/start', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      
      // Get workspace from user's employee record
      const employee = await storage.getEmployeeByUserId(userId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      // Validate shift access and authorization
      const accessCheck = await validateShiftAccess(req.params.shiftId, employee.id, employee.workspaceId, storage);
      if (!accessCheck.authorized) {
        return res.status(403).json({ message: accessCheck.reason });
      }

      // ── GUARD CARD COMPLIANCE CHECK AT CLOCK-IN ─────────────────────────────
      // Enforce the 5-tier guardCardStatus system on every clock-in.
      {
        const gcStatus = (employee as any).guardCardStatus || 'expired_hard_block';
        const isArmed = !!(employee as any).isArmed;

        if (gcStatus === 'expired_hard_block') {
          return res.status(403).json({
            error: 'clock_in_blocked',
            code: 'LICENSE_EXPIRED',
            message:
              'Your security license has expired or is invalid. You cannot be assigned to shifts until your license is renewed and verified. Please contact your manager.',
          });
        }

        if (isArmed && !['licensed_card_on_file', 'licensed_pending_card'].includes(gcStatus)) {
          return res.status(403).json({
            error: 'clock_in_blocked',
            code: 'ARMED_LICENSE_REQUIRED',
            message:
              'Armed officers must have an active, verified license on file. Please upload your TOPS screenshot showing ACTIVE status or your physical card.',
          });
        }

        if (gcStatus === 'substantially_complete' && (employee as any).workAuthorizationWindowExpires) {
          const windowExpires = new Date((employee as any).workAuthorizationWindowExpires);
          if (new Date() > windowExpires) {
            await db
              .update(employees)
              .set({ guardCardStatus: 'expired_hard_block' } as any)
              .where(eq(employees.id, employee.id))
              .catch((err: any) =>
                log.warn('[ClockIn] Failed to auto-escalate expired window:', err?.message),
              );
            return res.status(403).json({
              error: 'clock_in_blocked',
              code: 'AUTHORIZATION_WINDOW_EXPIRED',
              message:
                'Your 14-day provisional work authorization window has expired. Please contact your manager to resolve your license status.',
            });
          }
        }
      }

      // ── EARLY CLOCK-IN BUFFER: 15 MINUTES BEFORE SHIFT ─────────────────────
      {
        const [shiftForBuffer] = await db
          .select({ startTime: shifts.startTime })
          .from(shifts)
          .where(
            and(
              eq(shifts.id, req.params.shiftId),
              eq(shifts.workspaceId, employee.workspaceId),
            ),
          )
          .limit(1);
        if (shiftForBuffer?.startTime) {
          const shiftStart = new Date(shiftForBuffer.startTime);
          const now = new Date();
          const minutesBefore = (shiftStart.getTime() - now.getTime()) / 60000;
          if (minutesBefore > 15) {
            return res.status(400).json({
              error: 'too_early',
              code: 'CLOCK_IN_TOO_EARLY',
              message: `You can clock in up to 15 minutes before your shift. Your shift starts at ${shiftStart.toLocaleTimeString()}.`,
              minutesUntilEligible: Math.ceil(minutesBefore - 15),
            });
          }
        }
      }

      // ── GPS GEO-FENCE ENFORCEMENT AT SHIFT START ──────────────────────────
      // Directive L3.D: Shift start events require GPS coordinates.
      // Distance > 200m from site geofence = Out-of-Bounds event in audit log +
      // manager NDS alert. Non-blocking — shift still starts.
      const { latitude: startGpsLat, longitude: startGpsLng } = req.body || {};
      if (startGpsLat != null && startGpsLng != null) {
        (async () => {
          try {
            const [shiftRow] = await db.select({
              siteId: shifts.siteId,
              title: shifts.title,
            }).from(shifts).where(
              and(eq(shifts.id, req.params.shiftId), eq(shifts.workspaceId, employee.workspaceId))
            ).limit(1);

            if (shiftRow?.siteId) {
              const [site] = await db.select({
                geofenceLat: sites.geofenceLat,
                geofenceLng: sites.geofenceLng,
                geofenceRadiusMeters: sites.geofenceRadiusMeters,
                name: sites.name,
              }).from(sites).where(
                and(eq(sites.id, shiftRow.siteId), eq(sites.workspaceId, employee.workspaceId))
              ).limit(1);

              const geofenceLat = site?.geofenceLat;
              const geofenceLng = site?.geofenceLng;
              const geofenceRadius = site?.geofenceRadiusMeters ?? 200;

              if (geofenceLat && geofenceLng) {
                const distanceM = haversineMeters(
                  parseFloat(String(startGpsLat)), parseFloat(String(startGpsLng)),
                  parseFloat(String(geofenceLat)), parseFloat(String(geofenceLng))
                );

                if (distanceM > geofenceRadius) {
                  log.warn(`[ShiftGPS] Shift ${req.params.shiftId} started ${distanceM.toFixed(0)}m outside site geofence (threshold: ${geofenceRadius}m)`);

                  // Write audit log entry (non-blocking)
                  storage.createAuditLog({
                    workspaceId: employee.workspaceId,
                    userId: userId!,
                    action: 'scheduling_clock_in_out_of_bounds',
                    actionDescription: `Shift START GPS ${distanceM.toFixed(0)}m from site geofence (threshold: ${geofenceRadius}m) at ${site?.name || shiftRow.siteId}`,
                    entityType: 'shift',
                    entityId: req.params.shiftId,
                    metadata: {
                      startGpsLat,
                      startGpsLng,
                      siteGeofenceLat: geofenceLat,
                      siteGeofenceLng: geofenceLng,
                      distanceMeters: Math.round(distanceM),
                      thresholdMeters: geofenceRadius,
                      siteName: site?.name,
                      complianceTag: 'scheduling_gps_audit',
                      event: 'clock_in',
                    },
                  }).catch(err => log.warn('[ShiftGPS] Failed to write out-of-bounds audit log:', err));

                  // NDS alert to workspace managers (non-blocking)
                  (async () => {
                    try {
                      const { NotificationDeliveryService } = await import("../services/notificationDeliveryService");
                      const mgrs = await db.select({ userId: employees.userId }).from(employees)
                        .where(and(
                          eq(employees.workspaceId, employee.workspaceId),
                          inArray(employees.workspaceRole, ['org_owner', 'co_owner', 'org_manager', 'manager', 'department_manager', 'supervisor']),
                          eq(employees.status, 'active'),
                        )).limit(10);

                      for (const mgr of mgrs) {
                        if (!mgr.userId) continue;
                        await NotificationDeliveryService.send({
                          idempotencyKey: `notif-${Date.now()}`,
                          type: 'incident_alert',
                          workspaceId: employee.workspaceId,
                          recipientUserId: mgr.userId,
                          channel: 'push',
                          subject: 'GPS Out-of-Bounds Alert',
                          body: {
                            title: 'GPS Out-of-Bounds Alert',
                            body: `Officer clocked in ${distanceM.toFixed(0)}m outside site geofence for shift at ${site?.name || 'assigned site'}`,
                            idempotencyKey: `notif-${Date.now()}`,
            type: 'geo_alert',
                            url: '/schedule',
                            shiftId: req.params.shiftId,
                            employeeId: employee.id,
                            distanceMeters: Math.round(distanceM),
                          },
                        }).catch(() => {});
                      }
                    } catch (ndsErr) {
                      log.warn('[ShiftGPS] NDS manager alert failed (non-blocking):', ndsErr);
                    }
                  })();
                }
              }
            }
          } catch (gpsErr) {
            log.warn('[ShiftGPS] Shift-start GPS geo-fence check failed (non-blocking):', gpsErr);
          }
        })();
      }

      const result = await shiftChatroomWorkflowService.startShift({
        workspaceId: employee.workspaceId,
        shiftId: req.params.shiftId,
        userId,
        employeeId: employee.id,
      });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error,
          steps: result.steps
        });
      }

      // ── LONE WORKER SAFETY MONITORING ───────────────────────────────────────
      // Start welfare-check session when an officer begins a shift via the
      // shift-room workflow. Service is idempotent — safe to call alongside
      // the time-entry clock-in path. Non-blocking.
      import('../services/automation/loneWorkerSafetyService')
        .then(({ loneWorkerSafetyService }) =>
          loneWorkerSafetyService.startForEmployee(employee.id, employee.workspaceId, req.params.shiftId)
            .catch((err: unknown) => log.warn('[ShiftRoutes] Lone worker start failed (non-blocking):', (err as any)?.message))
        )
        .catch((err: unknown) => log.warn('[ShiftRoutes] Lone worker service import failed (non-blocking):', (err as any)?.message));

      res.json({
        success: true,
        chatroomId: result.chatroomId,
        steps: result.steps,
      });
    } catch (error: unknown) {
      log.error("Error starting shift:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to start shift" });
    }
  });

router.get('/:shiftId/site-info', requireAuth, async (req: any, res) => {
    try {
      const siteInfo = await shiftChatroomWorkflowService.getSiteInfo(req.params.shiftId);
      res.json(siteInfo);
    } catch (error: unknown) {
      log.error("Error fetching site info:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to fetch site info" });
    }
  });

router.post('/:shiftId/switch', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { shiftId } = req.params;
      const { targetEmployeeId, reason } = req.body;
      const employeeId = req.user?.id;
      const { shiftActions } = await import("@shared/schema");

      const [switchRequest] = await db
        .insert(shiftActions)
        // @ts-expect-error — TS migration: fix in refactoring sprint
        .values({
          workspaceId,
          shiftId,
          employeeId: employeeId!,
          targetEmployeeId,
          actionType: 'switch',
          status: 'pending',
          reason,
        })
        .returning();

      res.json(switchRequest);
    } catch (error: unknown) {
      log.error('Error requesting shift switch:', error);
      res.status(500).json({ message: sanitizeError(error) || 'Failed to request shift switch' });
    }
  });

uter.post("/bulk-approve", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { shiftIds } = req.body;
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    if (!shiftIds || !Array.isArray(shiftIds) || shiftIds.length === 0) {
      return res.status(400).json({ error: 'shiftIds must be a non-empty array' });
    }

    // Bulk approval is a Business-tier feature
    const { getWorkspaceTier, hasTierAccess } = await import('../tierGuards');
    const wsTier = await getWorkspaceTier(workspaceId);
    if (!hasTierAccess(wsTier, 'business')) {
      return res.status(402).json({ error: 'Bulk shift approval requires the Business plan or higher', currentTier: wsTier, minimumTier: 'business', requiresTierUpgrade: true });
    }

    // FIX: pass workspaceId so approveShift enforces workspace isolation per shift.
    const result = await bulkApproveShifts(shiftIds, userId, workspaceId);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    log.error('Error bulk approving shifts:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

router.post("/send-reminders/bulk", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate required' });
    }

    const results = await shiftRemindersService.sendBulkShiftReminders(
      workspaceId,
      new Date(startDate),
      new Date(endDate)
    );

    const successCount = results.filter(r => r.status === 'sent').length;

    res.json({ 
      success: true,
      data: {
        totalReminders: results.length,
        successful: successCount,
        failed: results.length - successCount,
        details: results,
      }
    });
  } catch (error: unknown) {
    log.error('Error sending bulk shift reminders:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// SHIFT OFFER ENDPOINTS — officer accepts/declines via UNS or email reply
// offerId is the notif.relatedEntityId set when coverage_offer UNS is fired
// ============================================================================

/**
 * GET /api/shifts/offers/my/pending — Readiness Section 15
 * Lists the authenticated worker's open (not accepted, not declined, not
 * expired) shift offers. The worker-dashboard banner calls this to surface
 * day-one shift offers instead of relying on SMS.
 */
uter.post("/offers/:offerId/accept", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { offerId } = req.params;
    const workspaceId = req.workspaceId!;
    const userId = req.user?.id;
    const { db } = await import('../db');
    const { notifications } = await import('@shared/schema');
    const { eq, and } = await import('drizzle-orm');

    const [notif] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, workspaceId),
          eq(notifications.relatedEntityId, offerId),
        ),
      )
      .limit(1);

    if (!notif) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    if (notif.userId !== userId) {
      return res.status(403).json({ error: 'This offer was not sent to you' });
    }

    const currentMeta = (notif as any).metadata || {};
    if (currentMeta.accepted) {
      return res.json({ success: true, message: 'Already accepted' });
    }
    if (currentMeta.declined) {
      return res.status(400).json({ error: 'This offer has already been declined' });
    }

    await db
      .update(notifications)
      .set({
        isRead: true,
        readAt: new Date(),
        metadata: { ...currentMeta, accepted: true, acceptedAt: new Date().toISOString(), acceptedByUserId: userId },
      })
      .where(and(eq(notifications.id, notif.id), eq(notifications.workspaceId, workspaceId)));

    log.info(`[ShiftOffer] Officer ${userId} accepted offer ${offerId} in workspace ${workspaceId}`);
    return res.json({ success: true, message: 'Shift offer accepted. You will receive confirmation details shortly.' });
  } catch (error: unknown) {
    log.error('[ShiftOffer] Accept error:', error);
    return res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get('/upcoming', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      const workspaceId = req.workspaceId;
      if (!workspaceId) return res.status(400).json({ error: 'Workspace context required' });

      const employee = await storage.getEmployeeByUserId(userId!, workspaceId);
      if (!employee) return res.json([]);

      const now = new Date();
      const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const futureEnd = new Date(tomorrowStart);
      futureEnd.setDate(futureEnd.getDate() + 3);

      const upcoming = await storage.getShiftsByEmployeeAndDateRange(
        workspaceId, employee.id, tomorrowStart, futureEnd
      );

      const mapped = upcoming.map((s: any) => ({
        id: s.id,
        date: s.date || new Date(s.startTime).toISOString().split('T')[0],
        siteName: s.title || 'Shift',
        startTime: s.startTime,
        endTime: s.endTime,
        // Phase 26E — acknowledgment state for worker-side accept/deny UI.
        requiresAcknowledgment: !!s.requiresAcknowledgment,
        acknowledgedAt: s.acknowledgedAt || null,
        deniedAt: s.deniedAt || null,
        rawStatus: s.status || null,
      }));

      res.json(mapped);
    } catch (error: unknown) {
      log.error("[ShiftRoute] Failed to fetch upcoming shifts:", error);
      res.status(500).json({ error: "Failed to fetch upcoming shifts" });
    }
  });

router.get('/approvals/pending-count', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) return res.json({ count: 0 });
      const result = await db.select({ count: sql<number>`count(*)` })
        .from(shifts)
        .where(and(eq(shifts.workspaceId, workspaceId), eq(shifts.status, 'draft')));
      res.json({ count: Number(result[0]?.count) || 0 });
    } catch (error) {
      log.error('Shifts pending count error:', error);
      res.status(500).json({ count: 0, error: true });
    }
  });

router.post('/:id/mark-calloff', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const supervisorUserId = req.user?.id;
      const { reason } = req.body || {};

      const shift = await storage.getShift(req.params.id, workspaceId);
      if (!shift) return res.status(404).json({ message: 'Shift not found' });
      if (!shift.employeeId) {
        return res.status(400).json({ message: 'Shift has no assigned officer to call off' });
      }
      if (shift.status === 'cancelled') {
        return res.status(400).json({ message: 'Shift is already cancelled' });
      }

      // Resolve site name. storage may return the raw shift row; the title
      // is the tenant's per-shift identifier, which is what fireCallOffSequence
      // expects as siteName.
      const siteName = shift.title || shift.description || 'Unknown Site';

      // Workspace name for the broadcast signoff.
      const ws = await db.select({ companyName: workspaces.companyName, name: workspaces.name })
        .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      const orgName = ws[0]?.companyName || ws[0]?.name || 'Your Security Company';

      const { fireCallOffSequence } = await import('../services/staffingBroadcastService');
      const result = await fireCallOffSequence({
        workspaceId,
        shiftId: shift.id,
        officerEmployeeId: shift.employeeId,
        siteName,
        shiftDate: new Date(shift.startTime).toISOString().split('T')[0],
        shiftStart: new Date(shift.startTime).toISOString(),
        shiftEnd: new Date(shift.endTime).toISOString(),
        supervisorUserId: supervisorUserId || '',
        orgName,
        reason: reason || 'supervisor_marked_calloff',
      });

      platformEventBus.publish({
        type: 'shift_cancelled',
        category: 'workforce',
        title: 'Shift Marked Calloff by Supervisor',
        description: `Supervisor marked shift as calloff — replacement broadcast fired`,
        workspaceId,
        metadata: {
          shiftId: shift.id,
          officerEmployeeId: shift.employeeId,
          reason: reason || 'supervisor_marked_calloff',
        },
        visibility: 'manager',
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      return res.json({
        success: true,
        broadcastId: result.broadcastId,
        officerEmailSent: result.officerEmailSent,
        managerEmailSent: result.managerEmailSent,
        message: 'Shift marked as calloff — replacement broadcast fired',
      });
    } catch (error: unknown) {
      log.error('[ShiftRoute] mark-calloff error:', error);
      return res.status(500).json({ message: sanitizeError(error) || 'Failed to mark shift as calloff' });
    }
  });

router.post('/bulk', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const userId = req.user?.id || 'unknown';

      // Bulk shift creation is a Business-tier feature
      const { getWorkspaceTier, hasTierAccess } = await import('../tierGuards');
      const wsTier = await getWorkspaceTier(workspaceId);
      if (!hasTierAccess(wsTier, 'business')) {
        return res.status(402).json({ error: 'Bulk shift creation requires the Business plan or higher', currentTier: wsTier, minimumTier: 'business', requiresTierUpgrade: true });
      }

      const lockResult = acquireBulkShiftLock(workspaceId, userId);
      if (!lockResult.acquired) {
        return res.status(409).json({ error: "A bulk shift creation is already in progress for this workspace", lockedBy: lockResult.holder });
      }

      try {
        const { employeeId, clientId, title, description, startDate, endDate, startTime, endTime, recurrence, days } = req.body;
        
        const createdShifts = [];
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        while (start <= end) {
          let shouldCreate = false;
          if (recurrence === 'daily') {
            shouldCreate = true;
          } else if (recurrence === 'weekly' && days?.includes(start.getDay())) {
            shouldCreate = true;
          }
          
          if (shouldCreate) {
            const shiftStart = new Date(start);
            const [hours, minutes] = startTime.split(':');
            shiftStart.setHours(parseInt(hours), parseInt(minutes), 0);
            
            const shiftEnd = new Date(start);
            const [endHours, endMinutes] = endTime.split(':');
            shiftEnd.setHours(parseInt(endHours), parseInt(endMinutes), 0);
            
            const shift = await storage.createShift({
              workspaceId,
              employeeId,
              clientId: clientId || null,
              title: title || null,
              description: description || null,
              // @ts-expect-error — TS migration: fix in refactoring sprint
              startTime: shiftStart.toISOString(),
              // @ts-expect-error — TS migration: fix in refactoring sprint
              endTime: shiftEnd.toISOString(),
              status: 'scheduled',
            });
            
            createdShifts.push(shift);
          }
          
          start.setDate(start.getDate() + 1);
        }
        
        res.json({ shifts: createdShifts, count: createdShifts.length });
      } finally {
        releaseBulkShiftLock(workspaceId);
      }
    } catch (error: unknown) {
      log.error("Error creating bulk shifts:", error);
      res.status(400).json({ message: sanitizeError(error) || "Failed to create bulk shifts" });
    }
  });

router.patch("/:shiftId/approve", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { shiftId } = req.params;
    const { notes } = req.body;
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const shift = await approveShift(shiftId, userId, workspaceId, notes);
    res.json({ success: true, data: shift });
  } catch (error: unknown) {
    log.error('Error approving shift:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

router.post("/bulk-approve", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { shiftIds } = req.body;
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    if (!shiftIds || !Array.isArray(shiftIds) || shiftIds.length === 0) {
      return res.status(400).json({ error: 'shiftIds must be a non-empty array' });
    }

    // Bulk approval is a Business-tier feature
    const { getWorkspaceTier, hasTierAccess } = await import('../tierGuards');
    const wsTier = await getWorkspaceTier(workspaceId);
    if (!hasTierAccess(wsTier, 'business')) {
      return res.status(402).json({ error: 'Bulk shift approval requires the Business plan or higher', currentTier: wsTier, minimumTier: 'business', requiresTierUpgrade: true });
    }

    // FIX: pass workspaceId so approveShift enforces workspace isolation per shift.
    const result = await bulkApproveShifts(shiftIds, userId, workspaceId);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    log.error('Error bulk approving shifts:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

router.get("/offers/my/pending", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace' });

    const { notifications } = await import('@shared/schema');
    const { and, eq, desc } = await import('drizzle-orm');

    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, workspaceId),
          eq(notifications.userId, userId),
          eq(notifications.type, 'coverage_offer'),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(25);

    const now = Date.now();
    const offers = rows
      .map((n) => {
        const meta = (n as any).metadata || {};
        const expiresAt = meta.expiresAt ? new Date(meta.expiresAt).getTime() : null;
        const expired = expiresAt !== null && expiresAt < now;
        const accepted = !!meta.accepted;
        const declined = !!meta.declined;
        return {
          offerId: n.relatedEntityId,
          workflowId: meta.workflowId || '',
          location: meta.location || 'See details',
          date: meta.date || null,
          startTime: meta.startTime || null,
          endTime: meta.endTime || null,
          positionType: meta.positionType || 'Security Officer',
          officerPayRate: meta.officerPayRate ? parseFloat(meta.officerPayRate) : undefined,
          expiresAt: meta.expiresAt || null,
          status: accepted ? 'accepted' : declined ? 'declined' : expired ? 'expired' : 'pending',
        };
      })
      .filter((o) => o.status === 'pending' && o.offerId);

    res.json({ offers, count: offers.length });
  } catch (error: unknown) {
    log.error('[ShiftOffer] list-my-pending error:', error);
    res.status(500).json({ error: 'Failed to list pending offers' });
  }
});

export default router;

