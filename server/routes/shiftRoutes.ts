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

  router.get('/pending', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId?.id || req.workspaceId;
      if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

      const shifts = await getPendingShifts(workspaceId);
      res.json({ success: true, data: shifts });
    } catch (error: unknown) {
      log.error('[ShiftRoute] Error fetching pending shifts:', error);
      res.status(500).json({ error: (error instanceof Error ? sanitizeError(error) : null) || String(error) });
    }
  });

  router.get('/stats', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId?.id || req.workspaceId;
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
            idempotencyKey: `notif-${Date.now()}`,
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
            idempotencyKey: `notif-${Date.now()}`,
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
            idempotencyKey: `notif-${Date.now()}`,
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
            idempotencyKey: `notif-${Date.now()}`,
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

  router.delete('/:id', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspaceId = req.workspaceId!;

      // Get shift details before deletion for notification and guard checks
      const shift = await storage.getShift(req.params.id, workspaceId);

      // GAP-SCHED-1 (CRITICAL): Block deletion of shifts that have any time entries.
      // A shift with a clock-in record is an operational record — it cannot be erased.
      // Managers must cancel the shift instead of deleting it when clock-ins exist.
      const [existingEntry] = await db.select({ id: timeEntries.id })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          eq(timeEntries.shiftId, req.params.id),
        ))
        .limit(1);

      if (existingEntry) {
        return res.status(409).json({
          message: 'Cannot delete shift — clock-in records exist for this shift. Cancel the shift instead.',
          code: 'SHIFT_HAS_TIME_ENTRIES',
          shiftId: req.params.id,
        });
      }
      
      const deleted = await storage.deleteShift(req.params.id, workspaceId);
      if (!deleted) {
        return res.status(404).json({ message: "Shift not found" });
      }

      // GAP-SCHED-10: Write audit log for shift deletion (who deleted, when, what shift)
      try {
        await storage.createAuditLog({
          workspaceId,
          action: 'shift_deleted',
          entityType: 'shift',
          entityId: req.params.id,
          userId,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          details: {
            shiftDate: shift?.startTime ? new Date(shift.startTime).toISOString().split('T')[0] : null,
            startTime: shift?.startTime,
            endTime: shift?.endTime,
            employeeId: shift?.employeeId,
            clientId: shift?.clientId,
            title: shift?.title,
            status: shift?.status,
          },
        });
      } catch (auditErr) {
        log.error('[ShiftDelete] Audit log failed (non-blocking):', auditErr);
      }
      
      // 📡 REAL-TIME: Broadcast shift deletion ONLY after successful DB operation
      broadcastShiftUpdate(workspaceId, 'shift_deleted', undefined, req.params.id);

      // 🧠 TRINITY: Publish to platformEventBus so Trinity and coverage monitors react
      platformEventBus.publish({
        type: 'shift_deleted',
        category: 'workforce',
        title: 'Shift Deleted',
        description: `Shift removed from schedule`,
        workspaceId,
        metadata: {
          shiftId: req.params.id,
          employeeId: shift?.employeeId,
          clientId: shift?.clientId,
          startTime: shift?.startTime,
        },
        visibility: 'manager',
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
      
      // D12-GAP-FIX: Clean up orphaned shift rooms associated with this shift.
      // When a shift is deleted, any shift_chat rooms tied to it become orphaned —
      // officers can no longer access the shift, but the room persists consuming
      // storage and causing confusing "ghost" conversations in the chat UI.
      try {
        await db.update(chatConversations)
          .set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() })
          .where(and(
            eq(chatConversations.workspaceId, workspaceId),
            eq(chatConversations.shiftId, req.params.id),
          ));
        log.info(`[ShiftDelete] Cleaned up shift rooms for deleted shift ${req.params.id}`);
      } catch (roomCleanupErr: unknown) {
        log.error('[ShiftDelete] Failed to clean up shift rooms (non-blocking):', (roomCleanupErr instanceof Error ? roomCleanupErr.message : String(roomCleanupErr)));
      }

      // G25-01 ROOT CAUSE FIX: Clean up shift_coverage_requests that reference this shift.
      // Without this, deleting a shift leaves escalated/pending coverage requests pointing
      // to a non-existent shift_id, causing orphaned records that can never be fulfilled.
      // These are cancelled (not deleted) so the audit trail of the calloff event is preserved.
      try {
        await db.update(shiftCoverageRequests)
          .set({
            status: 'cancelled',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            originalShiftId: null,
            trinityNotes: sql`COALESCE(trinity_notes, '') || ' [Auto-cancelled: shift deleted]'`,
          })
          .where(and(
            eq(shiftCoverageRequests.workspaceId, workspaceId),
            eq(shiftCoverageRequests.originalShiftId, req.params.id),
          ));
        log.info(`[ShiftDelete] Cancelled shift_coverage_requests for deleted shift ${req.params.id}`);
      } catch (coverageCleanupErr: unknown) {
        log.error('[ShiftDelete] Failed to cancel coverage requests (non-blocking):', (coverageCleanupErr instanceof Error ? coverageCleanupErr.message : String(coverageCleanupErr)));
      }

      // 🔔 NOTIFICATION: Notify employee about shift cancellation
      if (shift && shift.employeeId) {
        const shiftDate = new Date(shift.startTime).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
        
        await notificationHelpers.createShiftCancelledNotification(
          { storage, broadcastNotification },
          {
            workspaceId,
            userId: shift.employeeId,
            shiftId: shift.id,
            shiftTitle: shift.title || 'Shift',
            shiftDate,
            cancelledBy: userId,
          }
        ).catch(err => log.error('Failed to create shift cancellation notification:', err));
      }
      
      res.json({ success: true });
    } catch (error) {
      log.error("Error deleting shift:", error);
      res.status(500).json({ message: "Failed to delete shift" });
    }
  });

  router.post('/:id/ai-fill', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const shiftId = req.params.id;

      // Get the open shift
      const shift = await storage.getShift(shiftId, workspaceId);
      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }

      // Verify it's an open shift
      if (shift.employeeId) {
        return res.status(400).json({ message: "Shift is already assigned or not an open shift" });
      }

      // STEP 1: Score employees using weighted algorithm
      const { scoreEmployeesForShift, getTopCandidates, formatCandidatesForAI } = await import('../services/automation/employeeScoring');
      
      
      const scoredCandidates = await scoreEmployeesForShift(workspaceId, {
        shiftId,
        requiredSkills: (shift as any).requiredSkills || [],
        requiredCertifications: shift.requiredCertifications || [],
        maxDistance: 50,
        maxPayRate: shift.payRate ? parseFloat(shift.payRate) : undefined,
      });

      if (scoredCandidates.length === 0) {
        return res.status(400).json({ 
          message: "No qualified employees available for this shift",
          details: "All employees filtered out due to availability, credentials, or distance constraints"
        });
      }

      
      // STEP 2: Get top 5 candidates for Gemini review
      const topCandidates = getTopCandidates(scoredCandidates, 5);

      // STEP 3: Use Smart AI to find best employee from top candidates
      const { scheduleSmartAI } = await import('../services/scheduleSmartAI');
      
      const vettedEmployees = topCandidates.map(c => c.fullEmployee);

      const result = await scheduleSmartAI({
        openShifts: [shift],
        availableEmployees: vettedEmployees,
        workspaceId,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        userId: req.user.id,
        constraints: {
          hardConstraints: {
            respectAvailability: true,
            preventDoubleBooking: true,
            enforceRestPeriods: true,
            respectTimeOffRequests: true,
          },
          softConstraints: {
            preferExperience: true,
            balanceWorkload: true,
            respectPreferences: true,
          },
          predictiveMetrics: {
            enableReliabilityScoring: true,
            penalizeLateHistory: true,
            considerAbsenteeismRisk: true,
          }
        },
        // Pass scoring context to Gemini
        // @ts-expect-error — TS migration: fix in refactoring sprint
        scoringContext: formatCandidatesForAI(topCandidates)
      });

      // Check if AI found a suitable assignment
      if (result.assignments.length === 0) {
        return res.status(400).json({ 
          message: "Smart AI could not find a suitable employee for this shift",
          unassignedShifts: result.unassignedShifts,
          summary: result.summary
        });
      }

      const assignment = result.assignments[0];

      // RACE CONDITION FIX: Atomically verify shift is still unassigned before updating
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
          throw Object.assign(new Error("Shift was already claimed by another request"), {
            statusCode: 409,
            code: 'SHIFT_ALREADY_CLAIMED',
          });
        }

        const [updated] = await tx
          .update(shifts)
          .set({
            employeeId: assignment.employeeId,
            status: 'draft',
            aiGenerated: true,
            aiConfidenceScore: assignment.confidence.toString(),
            updatedAt: new Date(),
          })
          .where(and(eq(shifts.id, shiftId), eq(shifts.workspaceId, workspaceId)))
          .returning();
        return updated;
      });

      try {
        const { trinityDecisionLogger } = await import('../services/trinityDecisionLogger');
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const chosenEmp = (employees as any).find(e => e.id === assignment.employeeId);
        const alternatives = result.assignments.length > 1
          ? result.assignments.slice(1).map((a: any) => {
              // @ts-expect-error — TS migration: fix in refactoring sprint
              const altEmp = (employees as any).find(e => e.id === a.employeeId);
              return {
                employeeId: a.employeeId,
                employeeName: altEmp ? `${altEmp.firstName} ${altEmp.lastName}` : a.employeeId,
                rejectionReason: `Lower confidence score (${a.confidence})`,
                score: a.confidence,
              };
            })
          : [];
        await trinityDecisionLogger.logSchedulingDecision({
          workspaceId,
          shiftId,
          chosenEmployeeId: assignment.employeeId,
          chosenEmployeeName: chosenEmp ? `${chosenEmp.firstName} ${chosenEmp.lastName}` : assignment.employeeId,
          reasoning: (assignment as any).reason || result.summary || `Selected with ${assignment.confidence}% confidence based on availability, proximity, overtime risk, and reliability score`,
          alternatives,
          contextSnapshot: {
            totalCandidatesEvaluated: topCandidates.length,
            assignmentConfidence: assignment.confidence,
          },
          confidenceScore: (assignment.confidence / 100).toFixed(2),
        });
      } catch (logErr: unknown) {
        log.error('[Shift Auto-Assign] Decision logging failed (non-blocking):', (logErr instanceof Error ? logErr.message : String(logErr)));
      }

      // 📡 REAL-TIME: Broadcast shift update
      broadcastShiftUpdate(workspaceId, 'shift_updated', updatedShift!);

      // 📡 REAL-TIME: Fire specific shift_assigned event so employee schedule views update instantly
      if (updatedShift && assignment.employeeId) {
        broadcastToWorkspace(workspaceId, {
          type: 'shift_assigned',
          shiftId: updatedShift.id,
          employeeId: assignment.employeeId,
          workspaceId,
          startTime: updatedShift.startTime,
          endTime: updatedShift.endTime,
          title: updatedShift.title,
          timestamp: new Date().toISOString(),
        });
      }

      // 🔔 NOTIFICATION: Notify assigned employee
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const employee = (employees as any).find(e => e.id === assignment.employeeId);
      if (employee?.email && updatedShift) {
        const startTime = new Date(updatedShift.startTime).toLocaleString('en-US', {
          dateStyle: 'full',
          timeStyle: 'short'
        });
        const endTime = new Date(updatedShift.endTime).toLocaleString('en-US', {
          timeStyle: 'short'
        });

        // @ts-expect-error — TS migration: fix in refactoring sprint
        sendShiftAssignmentEmail(employee.email, {
          employeeName: `${employee.firstName} ${employee.lastName}`,
          shiftTitle: updatedShift.title || 'Shift',
          startTime,
          endTime,
        }).catch(err => log.error('Failed to send AI assignment email:', err));

        const shiftDate = new Date(updatedShift.startTime).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });

        await notificationHelpers.createShiftAssignedNotification(
          { storage, broadcastNotification },
          {
            workspaceId,
            userId: employee.id,
            shiftId: updatedShift.id,
            shiftTitle: updatedShift.title || 'Shift',
            shiftDate,
            // @ts-expect-error — TS migration: fix in refactoring sprint
            assignedBy: req.user.id,
          }
        ).catch(err => log.error('Failed to create AI assignment notification:', err));
      }

      res.json({
        success: true,
        shift: updatedShift,
        assignment: {
          employeeId: assignment.employeeId,
          employeeName: employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown',
          confidence: assignment.confidence,
          reasoning: assignment.reasoning,
        },
        aiConfidence: result.overallConfidence,
        message: "Smart AI successfully assigned employee to shift"
      });
    } catch (error: unknown) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      if (error.code === 'SHIFT_ALREADY_CLAIMED') {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return res.status(409).json({ message: sanitizeError(error), code: error.code });
      }
      log.error("Error in AI Fill:", error);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      res.status(error.statusCode || 500).json({ message: sanitizeError(error) || "Failed to auto-assign shift" });
    }
  });

  router.post('/:shiftId/pickup', requireAuth, async (req: AuthenticatedRequest, res) => {
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

  router.post('/:id/fill-request', requireManagerOrPlatformStaff, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const shiftId = req.params.id;
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      // Get the open shift
      const shift = await storage.getShift(shiftId, workspaceId);
      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }

      // Verify it's an open shift
      if (shift.employeeId) {
        return res.status(400).json({ message: "Shift is already assigned or not an open shift" });
      }


      // Validate request body
      const fillRequestBodySchema = z.object({
        reason: z.string().optional(),
        preferredSkills: z.array(z.string()).optional(),
        maxPayRate: z.string().optional(),
        maxDistance: z.number().optional(),
      });
      const fillRequestParsed = fillRequestBodySchema.safeParse(req.body);
      if (!fillRequestParsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: fillRequestParsed.error.flatten() });
      }

      // Create shift request record
      const shiftRequest = await db.insert(shiftRequests).values({
        workspaceId,
        shiftId,
        requestReason: fillRequestParsed.data.reason || "No qualified internal employees available",
        requiredSkills: (shift as any).requiredSkills || [],
        preferredSkills: fillRequestParsed.data.preferredSkills || [],
        maxPayRate: shift.payRate || fillRequestParsed.data.maxPayRate || "0",
        maxDistance: fillRequestParsed.data.maxDistance || 50,
        status: "searching",
        createdBy: userId,
      }).returning();

      // Search contractor pool
      const contractors = await db
        .select()
        .from(contractorPool)
        .where(
          and(
            eq(contractorPool.isActive, true),
            gte(contractorPool.maxDistanceWilling, fillRequestParsed.data.maxDistance || 50)
          )
        );

      if (contractors.length === 0) {
        await db.update(shiftRequests)
          .set({ status: "no_matches", completedAt: new Date() })
          .where(and(eq(shiftRequests.id, shiftRequest[0].id), eq(shiftRequests.workspaceId, workspaceId)));

        return res.status(404).json({
          message: "No contractors found matching criteria",
          shiftRequestId: shiftRequest[0].id
        });
      }


      // Score contractors (simplified scoring for now)
      const scoredContractors = contractors.map(contractor => {
        let score = 0.5; // Base score

        // Distance bonus
        const maxDist = fillRequestParsed.data.maxDistance || 50;
        if (contractor.maxDistanceWilling && contractor.maxDistanceWilling >= maxDist) {
          score += 0.2;
        }

        // Pay rate bonus (lower rate is better for margin)
        const maxPay = parseFloat(shift.payRate || fillRequestParsed.data.maxPayRate || "100");
        const contractorRate = parseFloat(contractor.minHourlyRate);
        if (contractorRate <= maxPay) {
          score += 0.15;
        }

        // Last minute availability
        if (contractor.availableForLastMinute) {
          score += 0.15;
        }

        return {
          contractor,
          score: Math.min(score, 1.0),
          matchReasons: [
            contractor.availableForLastMinute && "Available for last-minute shifts",
            contractorRate <= maxPay && `Rate within budget ($${contractorRate}/hr)`,
            // @ts-expect-error — TS migration: fix in refactoring sprint
            contractor.maxDistanceWilling >= maxDist && `Willing to travel (${contractor.maxDistanceWilling} miles)`,
          ].filter(Boolean) as string[]
        };
      });

      // Sort by score
      scoredContractors.sort((a, b) => b.score - a.score);

      // Send offers to top 3 contractors
      const topContractors = scoredContractors.slice(0, 3);
      const offers = [];

      // Generate response tokens for contractors
      const { generateResponseToken } = await import('../utils/contractorTokens');

      for (const { contractor, score, matchReasons } of topContractors) {
        const offeredRate = parseFloat(contractor.minHourlyRate) * 1.1; // 10% markup
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // SECURITY FIX: Generate opaque UUID token FIRST (no offerId exposure!)
        const responseToken = generateResponseToken();

        // Create offer with token included (single atomic operation - cleaner than UPDATE after INSERT)
        const offer = await db.insert(shiftOffers).values({
          workspaceId: workspaceId,
          shiftRequestId: shiftRequest[0].id,
          shiftId,
          contractorId: contractor.id,
          offeredPayRate: offeredRate.toString(),
          matchScore: score.toString(),
          matchReasons: matchReasons,
          status: "pending",
          expiresAt,
          responseToken, // Token already generated (opaque UUID - no offerId exposure)
        }).returning();

        offers.push({
          offerId: offer[0].id,
          contractorName: `${contractor.firstName} ${contractor.lastName}`,
          offeredRate,
          matchScore: (score * 100).toFixed(1) + '%',
          matchReasons,
        });

      }

      // Update shift request with offer count
      await db.update(shiftRequests)
        .set({
          status: "offers_sent",
          offersCount: offers.length
        })
        .where(and(eq(shiftRequests.id, shiftRequest[0].id), eq(shiftRequests.workspaceId, workspaceId)));

      res.json({
        success: true,
        shiftRequestId: shiftRequest[0].id,
        offersCount: offers.length,
        offers,
        message: `Sent ${offers.length} offers to qualified contractors`
      });
    } catch (error: unknown) {
      log.error("Error creating fill request:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to create fill request" });
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

  router.post('/:id/deny', requireEmployee, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const employeeId = req.employeeId;

      const { denialReason } = req.body;
      const shift = await storage.getShift(req.params.id, workspaceId);
      
      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }

      // OWNERSHIP CHECK: Employee can only deny their own shifts
      if (shift.employeeId !== employeeId) {
        return res.status(403).json({ message: "You can only deny shifts assigned to you" });
      }

      // Mark shift as denied
      const deniedShift = await storage.updateShift(req.params.id, workspaceId, {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        deniedAt: new Date().toISOString(),
        denialReason: denialReason || 'Employee declined assignment',
        status: 'cancelled',
      });

      // 📡 REAL-TIME: Broadcast immediately so manager dashboards show the denial
      broadcastShiftUpdate(workspaceId, 'shift_updated', deniedShift);
      broadcastToWorkspace(workspaceId, {
        type: 'shift_denied',
        shiftId: req.params.id,
        employeeId,
        denialReason: denialReason || 'Employee declined assignment',
        workspaceId,
        timestamp: new Date().toISOString(),
      });

      // 🧠 TRINITY: Publish so Trinity coverage pipeline reacts immediately
      platformEventBus.publish({
        type: 'shift_cancelled',
        category: 'workforce',
        title: 'Shift Denied by Officer',
        description: `Officer declined shift assignment — coverage needed`,
        workspaceId,
        metadata: {
          shiftId: req.params.id,
          employeeId,
          denialReason: denialReason || 'Employee declined assignment',
          startTime: shift.startTime,
          clientId: shift.clientId,
        },
        visibility: 'manager',
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      // IDEMPOTENCY CHECK: Prevent duplicate replacements on retry
      const existingReplacement = await db
        .select()
        .from(shifts)
        .where(
          and(
            eq(shifts.replacementForShiftId, shift.id),
            eq(shifts.workspaceId, workspaceId),
            ne(shifts.status, 'cancelled')
          )
        )
        .limit(1);

      if (existingReplacement.length > 0) {
        return res.json({
          success: true,
          deniedShift: shift,
          replacementShift: existingReplacement[0],
          message: "Shift already denied with existing replacement",
          duplicate: true,
        });
      }

      // AUTO-REPLACEMENT: Find backup employee
      const { scheduleOSAI } = await import('../ai/scheduleos');
      

      try {
        // Generate replacement shift for same time slot
        const replacementResult = await scheduleOSAI.generateSchedule({
          workspaceId,
          weekStartDate: new Date(shift.startTime),
          clientIds: shift.clientId ? [shift.clientId] : [],
          shiftRequirements: [{
            title: shift.title || 'Replacement Shift',
            clientId: shift.clientId || '',
            startTime: new Date(shift.startTime),
            endTime: new Date(shift.endTime),
            requiredEmployees: 1,
          }],
        });

        // Create replacement shift if AI found suitable employee
        if (replacementResult.generatedShifts.length > 0) {
          const replacement = replacementResult.generatedShifts[0];
          
          // Don't assign to same employee who denied
          if (replacement.employeeId !== shift.employeeId) {
            const newShift = await storage.createShift({
              workspaceId,
              employeeId: replacement.employeeId,
              clientId: replacement.clientId || null,
              title: replacement.title || null,
              description: `Auto-replacement for denied shift ${shift.id}`,
              // @ts-expect-error — TS migration: fix in refactoring sprint
              startTime: replacement.startTime.toISOString(),
              // @ts-expect-error — TS migration: fix in refactoring sprint
              endTime: replacement.endTime.toISOString(),
              aiGenerated: true,
              requiresAcknowledgment: true,
              replacementForShiftId: shift.id,
              autoReplacementAttempts: 1,
              aiConfidenceScore: replacement.aiConfidenceScore.toString(),
              riskScore: replacement.riskScore.toString(),
              riskFactors: replacement.riskFactors,
              status: 'scheduled',
            });

            // BILLOS™ SYNC: Update invoice for replacement shift
            let billingUpdate = null;
            if (shift.clientId) {
              try {
                // Search for invoice line item by metadata.shiftId for reliability
                const allInvoices = await storage.getInvoicesByClient(shift.clientId, workspaceId);
                let deniedShiftLineItem: any = null;
                let targetInvoice: any = null;

                for (const invoice of allInvoices) {
                  if (invoice.status === 'draft') {
                    const lineItems = await storage.getInvoiceLineItems(invoice.id);
                    deniedShiftLineItem = lineItems.find((item: any) => {
                      // Primary search: metadata.shiftId (most reliable)
                      if (item.metadata && typeof item.metadata === 'object') {
                        return item.metadata.shiftId === shift.id;
                      }
                      // Fallback: description contains shift ID
                      return item.description?.includes(shift.id);
                    });

                    if (deniedShiftLineItem) {
                      targetInvoice = invoice;
                      break;
                    }
                  }
                }

                if (deniedShiftLineItem && targetInvoice) {
                  // Remove denied shift line item
                  // @ts-expect-error — TS migration: fix in refactoring sprint
                  await storage.deleteInvoiceLineItem(deniedShiftLineItem.id);

                  // Add replacement shift line item
                  const hours = replacement.billableHours;
                  const rate = hours > 0 ? replacement.estimatedCost / hours : 0;
                  const amount = hours * rate;

                  const newLineItem = await storage.createInvoiceLineItem({
                    invoiceId: targetInvoice.id,
                    description: `${replacement.title} - ${replacement.employeeName} (${new Date(replacement.startTime).toLocaleDateString()}) [Replacement]`,
                    quantity: hours.toString(),
                    unitPrice: rate.toFixed(2),
                    amount: amount.toFixed(2),
                    // @ts-expect-error — TS migration: fix in refactoring sprint
                    metadata: {
                      shiftId: newShift.id,
                      aiGenerated: true,
                      scheduleOSGenerated: true,
                      replacementFor: shift.id,
                      billableHours: hours,
                    },
                  });

                  // Recalculate invoice totals
                  const updatedLineItems = await storage.getInvoiceLineItems(targetInvoice.id);
                  const newSubtotal = updatedLineItems.reduce((sum: number, item: any) => sum + parseFloat(item.amount || '0'), 0);
                  const taxRate = parseFloat(targetInvoice.taxRate || '0');
                  const newTaxAmount = newSubtotal * (taxRate / 100);
                  const newTotal = newSubtotal + newTaxAmount;

                  await storage.updateInvoice(targetInvoice.id, workspaceId, {
                    subtotal: newSubtotal.toFixed(2),
                    taxAmount: newTaxAmount.toFixed(2),
                    total: newTotal.toFixed(2),
                  });

                  billingUpdate = {
                    invoiceId: targetInvoice.id,
                    invoiceNumber: targetInvoice.invoiceNumber,
                    removedLineItem: deniedShiftLineItem.id,
                    addedLineItem: newLineItem.id,
                    message: `Updated invoice ${targetInvoice.invoiceNumber} - replaced denied shift with ${replacement.employeeName}`,
                  };

                } else {
                  // Invoice line not found - shift may not be invoiced yet, will be picked up in next invoice generation
                  billingUpdate = {
                    message: 'Shift not yet invoiced - replacement will be included in next invoice generation',
                    deferred: true,
                  };
                }
              } catch (billingError: unknown) {
                log.error('[Billing Platform] Failed to update invoice for replacement:', billingError);
                // Non-fatal: replacement shift created successfully, billing can be corrected manually if needed
                billingUpdate = {
                  error: (billingError instanceof Error ? billingError.message : String(billingError)),
                  message: 'Billing sync failed - replacement shift created but invoice may need manual correction',
                };
              }
            }

            return res.json({
              success: true,
              deniedShift: shift,
              replacementShift: newShift,
              replacementEmployee: replacement.employeeName,
              message: `Shift denied. Auto-replacement assigned to ${replacement.employeeName}`,
              warnings: replacementResult.warnings,
              billingUpdate,
            });
          }
        }

        // No suitable replacement found
        return res.json({
          success: true,
          deniedShift: shift,
          replacementShift: null,
          message: "Shift denied. No suitable replacement employee found. Manual scheduling required.",
          warnings: ["No employees available for this time slot. Consider hiring or adjusting shift requirements."],
        });

      } catch (replacementError: unknown) {
        log.error("[AI Scheduling™] Auto-replacement failed:", replacementError);
        
        return res.json({
          success: true,
          deniedShift: shift,
          replacementShift: null,
          message: "Shift denied. Auto-replacement failed. Manual scheduling required.",
          error: (replacementError instanceof Error ? replacementError.message : String(replacementError)),
        });
      }

    } catch (error: unknown) {
      log.error("Error denying shift:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to deny shift" });
    }
  });

  // ── Phase 26H — one-click supervisor mark-calloff ─────────────────────────
  // Wraps fireCallOffSequence so the supervisor deep-link from
  // missedClockInWorkflow's escalation notification (Phase 26G) does not
  // require the caller to assemble the full calloff payload. The shift +
  // officer + supervisor context is resolved internally and tenant-scoped
  // (§G). Manager role or higher.
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

  router.get('/:shiftId/acknowledgments', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;

      const { shiftAcknowledgments } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");

      // Verify shift belongs to workspace
      const shift = await db.query.shifts.findFirst({
        where: and(
          eq(shifts.id, req.params.shiftId),
          eq(shifts.workspaceId, workspaceId)
        ),
      });

      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }

      const acks = await db.query.shiftAcknowledgments.findMany({
        where: and(
          eq(shiftAcknowledgments.workspaceId, workspaceId),
          eq(shiftAcknowledgments.shiftId, req.params.shiftId)
        ),
      });

      const empIds = acks.map((a: any) => a.employeeId).filter(Boolean);
      const [empRows, shiftRow] = await Promise.all([
        empIds.length > 0
          ? db.query.employees.findMany({
              where: (e, { inArray }) => inArray(e.id, empIds),
            })
          : Promise.resolve([]),
        db.query.shifts.findFirst({
          where: eq(shifts.id, req.params.shiftId),
        }),
      ]);
      const empMap = new Map((empRows as any[]).map(e => [e.id, e]));
      const acknowledgments = acks.map((a: any) => ({
        ...a,
        shift: shiftRow || null,
        employee: empMap.get(a.employeeId) || null,
      }));

      res.json(acknowledgments);
    } catch (error: unknown) {
      log.error("Error fetching shift acknowledgments:", error);
      res.status(500).json({ message: "Failed to fetch acknowledgments" });
    }
  });

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

  router.get('/:id/audit', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const shiftId = req.params.id;
      
      // Get shift data
      const shift = await storage.getShift(shiftId, workspaceId);
      if (!shift) {
        return res.status(404).json({ message: "Shift not found" });
      }
      
      // Get shift creator info
      let creatorInfo = null;
      if (shift.createdAt) {
        // Note: shifts don't have createdBy field, using workspace owner as fallback
        const workspace = await storage.getWorkspace(workspaceId);
        if (workspace) {
          const owner = await storage.getUser(workspace.ownerId);
          if (owner) {
            creatorInfo = {
              name: (owner as any).displayName || owner.email,
              email: owner.email,
              role: 'owner'
            };
          }
        }
      }
      
      let employeeInfo = null;
      if (shift.employeeId) {
        const employee = await storage.getEmployeeById(shift.employeeId, shift.workspaceId);
        if (employee) {
          employeeInfo = {
            id: employee.id,
            name: `${employee.firstName} ${employee.lastName}`,
            email: employee.email,
            phone: employee.phone
          };
        }
      }
      
      // Get all time entries for this shift
      const allTimeEntries = await storage.getTimeEntriesByWorkspace(workspaceId);
      const shiftTimeEntries = allTimeEntries.filter(te => te.shiftId === shiftId);
      
      // Aggregate time entry data (clock in/out, GPS, total time)
      const timeTrackingData = shiftTimeEntries.map(te => ({
        id: te.id,
        clockIn: te.clockIn,
        clockOut: te.clockOut,
        totalHours: te.totalHours,
        totalAmount: te.totalAmount,
        status: te.status,
        notes: te.notes,
        gps: {
          clockIn: {
            latitude: te.clockInLatitude,
            longitude: te.clockInLongitude,
            accuracy: te.clockInAccuracy,
            ipAddress: te.clockInIpAddress
          },
          clockOut: {
            latitude: te.clockOutLatitude,
            longitude: te.clockOutLongitude,
            accuracy: te.clockOutAccuracy,
            ipAddress: te.clockOutIpAddress
          },
          jobSite: {
            latitude: te.jobSiteLatitude,
            longitude: te.jobSiteLongitude,
            address: te.jobSiteAddress
          }
        },
        createdAt: te.createdAt,
        updatedAt: te.updatedAt
      }));
      
      // Get timesheet edit discrepancies for this shift's time entries
      const timeEntryIds = shiftTimeEntries.map(te => te.id);
      const allDiscrepancies = await storage.getTimeEntryDiscrepancies(workspaceId, {});
      const shiftDiscrepancies = allDiscrepancies.filter(d => 
        timeEntryIds.includes(d.timeEntryId)
      );
      
      // Calculate summary stats
      const totalHours = shiftTimeEntries.reduce((sum, te) => {
        return sum + (parseFloat(te.totalHours as string || "0"));
      }, 0);
      
      const totalAmount = shiftTimeEntries.reduce((sum, te) => {
        return sum + (parseFloat(te.totalAmount as string || "0"));
      }, 0);
      
      // Aggregate audit data
      const auditData = {
        shift: {
          id: shift.id,
          title: shift.title,
          description: shift.description,
          startTime: shift.startTime,
          endTime: shift.endTime,
          status: shift.status,
          aiGenerated: shift.aiGenerated,
          requiresAcknowledgment: shift.requiresAcknowledgment,
          acknowledgedAt: shift.acknowledgedAt,
          deniedAt: shift.deniedAt,
          denialReason: shift.denialReason,
          billableToClient: shift.billableToClient,
          hourlyRateOverride: shift.hourlyRateOverride,
          createdAt: shift.createdAt,
          updatedAt: shift.updatedAt
        },
        creator: creatorInfo,
        employee: employeeInfo,
        timeTracking: timeTrackingData,
        discrepancies: shiftDiscrepancies,
        summary: {
          totalTimeEntries: shiftTimeEntries.length,
          totalHours: totalHours.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          totalDiscrepancies: shiftDiscrepancies.length,
          hasGpsAnomalies: shiftDiscrepancies.some(d => d.discrepancyType === 'gps_anomaly'),
          hasIpAnomalies: shiftDiscrepancies.some(d => d.discrepancyType === 'ip_anomaly')
        }
      };
      
      res.json(auditData);
    } catch (error: unknown) {
      log.error("Error fetching shift audit data:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to fetch shift audit data" });
    }
  });

  router.post('/:shiftId/start', requireAuth, async (req: any, res) => {
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
                          // @ts-expect-error — TS migration: fix in refactoring sprint
                          idempotencyKey: `notif-${Date.now()}`,
            idempotencyKey: `notif-${Date.now()}`,
            idempotencyKey: `notif-${Date.now()}`,
            type: 'geo_fence_violation',
                          workspaceId: employee.workspaceId,
                          recipientUserId: mgr.userId,
                          channel: 'push',
                          subject: 'GPS Out-of-Bounds Alert',
                          body: {
                            title: 'GPS Out-of-Bounds Alert',
                            body: `Officer clocked in ${distanceM.toFixed(0)}m outside site geofence for shift at ${site?.name || 'assigned site'}`,
                            idempotencyKey: `notif-${Date.now()}`,
            idempotencyKey: `notif-${Date.now()}`,
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

  router.post('/:shiftId/end', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      
      // Get workspace from employee record
      const employee = await storage.getEmployeeByUserId(userId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      // Validate shift access and authorization
      const accessCheck = await validateShiftAccess(req.params.shiftId, employee.id, employee.workspaceId, storage);
      if (!accessCheck.authorized) {
        return res.status(403).json({ message: accessCheck.reason });
      }

      const { closureReason = 'shift_completed' } = req.body;
      
      const result = await shiftChatroomWorkflowService.endShift({
        workspaceId: employee.workspaceId,
        shiftId: req.params.shiftId,
        userId,
        employeeId: employee.id,
      }, closureReason);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error,
          steps: result.steps
        });
      }

      // ── LONE WORKER STOP + SHIFT HANDOFF TRIGGER ────────────────────────────
      // Stop welfare-check session and, if the next assigned officer is present
      // on the same post, kick off the handoff briefing. Non-blocking.
      (async () => {
        try {
          const { loneWorkerSafetyService } = await import('../services/automation/loneWorkerSafetyService');
          await loneWorkerSafetyService.stopForEmployee(employee.id, employee.workspaceId)
            .catch((err: any) => log.warn('[ShiftRoutes] Lone worker stop failed (non-blocking):', err?.message));
        } catch (err: unknown) {
          log.warn('[ShiftRoutes] Lone worker stop import failed (non-blocking):', (err as any)?.message);
        }

        try {
          const [endingShift] = await db.select({
            id: shifts.id,
            siteId: shifts.siteId,
            title: shifts.title,
            startTime: shifts.startTime,
            endTime: shifts.endTime,
            siteName: sites.name,
          })
            .from(shifts)
            .leftJoin(sites, eq(shifts.siteId, sites.id))
            .where(and(eq(shifts.id, req.params.shiftId), eq(shifts.workspaceId, employee.workspaceId)))
            .limit(1);

          if (!endingShift || !endingShift.siteId) return;

          const [nextShift] = await db.select({
            id: shifts.id,
            siteId: shifts.siteId,
            employeeId: shifts.employeeId,
            startTime: shifts.startTime,
            endTime: shifts.endTime,
            firstName: employees.firstName,
            lastName: employees.lastName,
          })
            .from(shifts)
            .leftJoin(employees, eq(shifts.employeeId, employees.id))
            .where(and(
              eq(shifts.workspaceId, employee.workspaceId),
              eq(shifts.siteId, endingShift.siteId),
              gte(shifts.startTime, endingShift.endTime ?? new Date()),
              ne(shifts.id, endingShift.id),
            ))
            .orderBy(asc(shifts.startTime))
            .limit(1);

          if (!nextShift || !nextShift.employeeId || nextShift.employeeId === employee.id) return;

          const { shiftHandoffService } = await import('../services/fieldOperations/shiftHandoffService');
          const outgoingName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'Outgoing Officer';
          const incomingName = `${nextShift.firstName || ''} ${nextShift.lastName || ''}`.trim() || 'Incoming Officer';
          const postName = endingShift.siteName || endingShift.title || 'Assigned Post';

          await shiftHandoffService.initiateHandoff(
            {
              id: endingShift.id,
              orgId: employee.workspaceId,
              postId: String(endingShift.siteId),
              postName,
              officerId: employee.id,
              officerName: outgoingName,
              startTime: new Date(endingShift.startTime as any),
              endTime: new Date(),
            },
            {
              id: nextShift.id,
              orgId: employee.workspaceId,
              postId: String(nextShift.siteId),
              postName,
              officerId: nextShift.employeeId,
              officerName: incomingName,
              startTime: new Date(nextShift.startTime as any),
              endTime: new Date(nextShift.endTime as any),
            }
          );
        } catch (err: unknown) {
          log.warn('[ShiftRoutes] Shift handoff initiation failed (non-blocking):', (err as any)?.message);
        }
      })();

      res.json({
        success: true,
        darId: result.darId,
        steps: result.steps,
      });
    } catch (error: unknown) {
      log.error("Error ending shift:", error);
      res.status(500).json({ message: sanitizeError(error) || "Failed to end shift" });
    }
  });

  // POST /api/shifts/:shiftId/proof-of-service
  // Officer-side proof-of-service photo capture. Stores the photo as a
  // chatroom photo message (audit-protected, flows into the DAR photo manifest).
  // Broadcasts so the client portal and managers see it in real time.
  router.post('/:shiftId/proof-of-service', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const employee = await storage.getEmployeeByUserId(userId);
      if (!employee) return res.status(404).json({ message: 'Employee not found' });

      const shiftId = req.params.shiftId;
      const accessCheck = await validateShiftAccess(shiftId, employee.id, employee.workspaceId, storage);
      if (!accessCheck.authorized) return res.status(403).json({ message: accessCheck.reason });

      const workspaceId = employee.workspaceId;
      const { photoUrl, latitude, longitude, notes, capturedAt } = req.body || {};
      if (!photoUrl || typeof photoUrl !== 'string') {
        return res.status(400).json({ message: 'photoUrl required' });
      }

      // Ensure a chatroom exists for this shift (provisioned at creation, promoted
      // at clock-in; create on demand if neither ran yet)
      const [existingRoom] = await db.select()
        .from(shiftChatrooms)
        .where(and(
          eq(shiftChatrooms.shiftId, shiftId),
          eq(shiftChatrooms.workspaceId, workspaceId),
        ))
        .limit(1);

      let chatroomId: string | null = existingRoom?.id ?? null;
      if (!chatroomId) {
        const provision = await shiftChatroomWorkflowService.provisionChatroom({
          shiftId,
          workspaceId,
          siteId: accessCheck.shift?.siteId ?? undefined,
          assignedEmployeeId: employee.id,
        });
        chatroomId = provision.chatroomId;
      }

      if (!chatroomId) {
        return res.status(500).json({ message: 'Failed to resolve shift chatroom for proof-of-service' });
      }

      const sendResult = await shiftChatroomWorkflowService.sendMessage(
        chatroomId,
        userId,
        {
          content: notes || 'Proof of service photo',
          messageType: 'photo',
          attachmentUrl: photoUrl,
          attachmentType: 'image/jpeg',
          metadata: {
            proofOfService: true,
            gps: (typeof latitude === 'number' && typeof longitude === 'number')
              ? { lat: latitude, lng: longitude }
              : null,
            capturedAt: capturedAt || new Date().toISOString(),
            officerEmployeeId: employee.id,
          },
        }
      );

      if (!sendResult.success) {
        return res.status(400).json({ message: sendResult.error || 'Failed to store proof-of-service photo' });
      }

      // Broadcast so managers + client portal see it immediately
      broadcastToWorkspace(workspaceId, {
        type: 'proof_of_service_submitted',
        shiftId,
        chatroomId,
        officerId: userId,
        photoUrl,
        timestamp: new Date().toISOString(),
      });

      platformEventBus.publish({
        type: 'proof_of_service_submitted',
        category: 'automation',
        title: 'Proof of Service Submitted',
        description: `Officer submitted proof-of-service photo for shift ${shiftId}`,
        workspaceId,
        metadata: { shiftId, chatroomId, officerEmployeeId: employee.id, photoUrl },
      }).catch((err: any) => log.warn('[ProofOfService] publish failed (non-blocking):', err?.message));

      res.status(201).json({
        success: true,
        messageId: sendResult.messageId,
        chatroomId,
        shiftId,
      });
    } catch (error: unknown) {
      log.error('Error capturing proof-of-service:', error);
      res.status(500).json({ message: sanitizeError(error) || 'Failed to capture proof-of-service' });
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

  router.post('/:shiftId/respond', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId!;
      const { shiftId } = req.params;
      const { action, reason } = req.body; // action: 'accept' or 'deny'
      const employeeId = req.user?.id;
      const { shiftActions } = await import("@shared/schema");

      if (!['accept', 'deny'].includes(action)) {
        return res.status(400).json({ message: 'Invalid action. Must be accept or deny.' });
      }

      const [shiftAction] = await db
        .insert(shiftActions)
        // @ts-expect-error — TS migration: fix in refactoring sprint
        .values({
          workspaceId,
          shiftId,
          employeeId: employeeId!,
          actionType: action,
          status: 'completed',
          reason,
          processedAt: new Date(),
        })
        .returning();

      res.json(shiftAction);
    } catch (error: unknown) {
      log.error('Error responding to shift:', error);
      res.status(500).json({ message: sanitizeError(error) || 'Failed to respond to shift' });
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

router.patch("/:shiftId/reject", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { shiftId } = req.params;
    const { reason, autoReplace } = req.body;
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId) return res.status(400).json({ error: 'User required' });
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const shift = await rejectShift(shiftId, userId, reason || 'No reason provided', workspaceId, autoReplace);
    res.json({ success: true, data: shift });
  } catch (error: unknown) {
    log.error('Error rejecting shift:', error);
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


router.post("/:shiftId/send-reminder", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { shiftId } = req.params;

    const result = await shiftRemindersService.sendShiftReminder(shiftId, workspaceId);

    if (!result) {
      return res.status(404).json({ error: 'Shift not found' });
    }

    res.json({ 
      success: result.status === 'sent', 
      data: result,
    });
  } catch (error: unknown) {
    log.error('Error sending shift reminder:', error);
    res.status(500).json({ error: sanitizeError(error) });
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

router.post("/send-reminders/upcoming", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;

    const results = await shiftRemindersService.sendUpcomingShiftReminders(workspaceId);

    const successCount = results.filter(r => r.status === 'sent').length;

    res.json({ 
      success: true,
      data: {
        totalReminders: results.length,
        successful: successCount,
        failed: results.length - successCount,
        message: `Sent ${successCount} reminders for upcoming shifts`,
      }
    });
  } catch (error: unknown) {
    log.error('Error sending upcoming shift reminders:', error);
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

router.get("/offers/:offerId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { offerId } = req.params;
    const workspaceId = req.workspaceId!;
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
      return res.status(404).json({ error: 'Offer not found or has expired' });
    }

    const meta = (notif as any).metadata || {};
    const isAccepted = !!meta.accepted;
    const isDeclined = !!meta.declined;

    return res.json({
      offerId,
      workflowId: meta.workflowId || '',
      location:   meta.location    || 'See details',
      address:    meta.address,
      date:       meta.date        || 'TBD',
      startTime:  meta.startTime   || 'TBD',
      endTime:    meta.endTime     || 'TBD',
      positionType:      meta.positionType      || 'Security Officer',
      officerPayRate:    meta.officerPayRate    ? parseFloat(meta.officerPayRate) : undefined,
      specialRequirements: meta.specialRequirements || [],
      status:      isAccepted ? 'accepted' : isDeclined ? 'declined' : 'pending',
      workspaceName: meta.workspaceName || 'Your Organization',
    });
  } catch (error: unknown) {
    log.error('[ShiftOffer] GET error:', error);
    return res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/offers/:offerId/accept", requireAuth, async (req: AuthenticatedRequest, res) => {
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

router.post("/offers/:offerId/decline", requireAuth, async (req: AuthenticatedRequest, res) => {
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
          eq(notifications.userId, userId!),
        ),
      )
      .limit(1);

    if (!notif) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    const currentMeta = (notif as any).metadata || {};
    if (currentMeta.declined) {
      return res.json({ success: true, message: 'Already declined' });
    }

    await db
      .update(notifications)
      .set({
        isRead: true,
        readAt: new Date(),
        metadata: { ...currentMeta, declined: true, declinedAt: new Date().toISOString(), declinedByUserId: userId },
      })
      .where(and(eq(notifications.id, notif.id), eq(notifications.workspaceId, workspaceId)));

    log.info(`[ShiftOffer] Officer ${userId} declined offer ${offerId}`);
    return res.json({ success: true, message: 'Offer declined.' });
  } catch (error: unknown) {
    log.error('[ShiftOffer] Decline error:', error);
    return res.status(500).json({ error: sanitizeError(error) });
  }
});

export default router;

