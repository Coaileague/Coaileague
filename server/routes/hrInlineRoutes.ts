import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { requireAuth } from "../auth";
import { requireOwner, requireManager, requireLeader, getUserPlatformRole, validateManagerAssignment, type AuthenticatedRequest } from "../rbac";
import { canAssignRole } from '../lib/businessRules';
import { storage } from "../storage";
import { db } from "../db";
import {
  employees,
  employeeOnboardingProgress,
  workspaces,
  users,
  ptoRequests,
  leaderActions,
  escalationTickets,
  timeEntryDiscrepancies,
  disputes,
  platformRoles,
  workspaceInvites,
  insertManagerAssignmentSchema,
  reportTemplates,
  reportSubmissions,
  clients,
  shifts,
  employerRatings,
  stagedShifts,
  userNotificationPreferences,
  timeEntries as timeEntriesTable
} from '@shared/schema';
import { sql, eq, and, or, isNull, desc, asc, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { cacheManager } from "../services/platform/cacheManager";
import crypto from "crypto";
import { emailService } from "../services/emailService";
import { employeeDocumentOnboardingService } from '../services/employeeDocumentOnboardingService';
import { getAppBaseUrl } from '../utils/getAppBaseUrl';
import { getAllPtoBalances, calculatePtoAccrual, runWeeklyPtoAccrual } from "../services/ptoAccrual";
import { getReviewReminderSummary, getOverdueReviews, getUpcomingReviews } from "../services/performanceReviewReminders";
import { createLogger } from '../lib/logger';
const log = createLogger('HrInlineRoutes');

const ONBOARDING_DEADLINE_DAYS = 7;


const router = Router();

router.get("/i9-records", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const records = await storage.getI9RecordsByWorkspace(workspaceId);
    res.json(records);
  } catch (error: unknown) {
    log.error("Error fetching I-9 records:", error);
    res.status(500).json({ message: "Failed to fetch I-9 records" });
  }
});

router.get("/i9-records/expiring", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const daysAhead = Math.min(Math.max(1, parseInt(req.query.days as string) || 30), 365);
    const records = await storage.getExpiringI9Authorizations(workspaceId, daysAhead);
    res.json(records);
  } catch (error: unknown) {
    log.error("Error fetching expiring I-9 records:", error);
    res.status(500).json({ message: "Failed to fetch expiring I-9 records" });
  }
});

router.get("/i9-records/:employeeId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const user = await storage.getUser(userId);
    
    const employee = await storage.getEmployeeByUserId(userId, workspaceId);
    const hasManagerRole = ['org_owner', 'co_owner', 'org_manager', 'manager', 'department_manager'].includes(employee?.workspaceRole || '');
    if (!hasManagerRole && employee?.id !== req.params.employeeId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const record = await storage.getI9RecordByEmployee(req.params.employeeId, workspaceId);
    if (!record) {
      return res.status(404).json({ message: "I-9 record not found" });
    }
    
    res.json(record);
  } catch (error: unknown) {
    log.error("Error fetching I-9 record:", error);
    res.status(500).json({ message: "Failed to fetch I-9 record" });
  }
});

router.post("/manager-assignments", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;

    const parsed = insertManagerAssignmentSchema.safeParse({
      ...req.body,
      workspaceId,
    });

    if (!parsed.success) {
      return res.status(400).json({ 
        message: "Invalid manager assignment data",
        errors: parsed.error.errors 
      });
    }

    const validation = await validateManagerAssignment(
      parsed.data.managerId,
      parsed.data.employeeId,
      workspaceId
    );

    if (!validation.valid) {
      return res.status(400).json({ message: validation.error });
    }

    const assignment = await storage.createManagerAssignment(parsed.data);
    res.status(201).json(assignment);
  } catch (error) {
    log.error("Error creating manager assignment:", error);
    res.status(500).json({ message: "Failed to create manager assignment" });
  }
});

router.get("/manager-assignments", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const assignments = await storage.getManagerAssignmentsByWorkspace(workspaceId);
    res.json(assignments);
  } catch (error) {
    log.error("Error fetching manager assignments:", error);
    res.status(500).json({ message: "Failed to fetch manager assignments" });
  }
});

router.get("/manager-assignments/manager/:managerId", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const assignments = await storage.getManagerAssignmentsByManager(req.params.managerId, workspaceId);
    res.json(assignments);
  } catch (error) {
    log.error("Error fetching manager assignments:", error);
    res.status(500).json({ message: "Failed to fetch manager assignments" });
  }
});

router.get("/manager-assignments/employee/:employeeId", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const assignments = await storage.getManagerAssignmentsByEmployee(req.params.employeeId, workspaceId);
    res.json(assignments);
  } catch (error) {
    log.error("Error fetching manager assignments:", error);
    res.status(500).json({ message: "Failed to fetch manager assignments" });
  }
});

router.delete("/manager-assignments/:id", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const success = await storage.deleteManagerAssignment(req.params.id, workspaceId);
    
    if (!success) {
      return res.status(404).json({ message: "Manager assignment not found" });
    }

    res.status(204).send();
  } catch (error) {
    log.error("Error deleting manager assignment:", error);
    res.status(500).json({ message: "Failed to delete manager assignment" });
  }
});

router.get("/organizations/managed", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user || (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    const platformRole = req.platformRole || await getUserPlatformRole(userId);
    const isPlatformStaff = platformRole && ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'].includes(platformRole);

    const mapWorkspace = async (workspace: any, isOwner: boolean, canManage: boolean) => {
      const emps = await storage.getEmployeesByWorkspace(workspace.id);
      const clientList = await db.select().from(clients).where(eq(clients.workspaceId, workspace.id));
      return {
        id: workspace.id,
        name: workspace.name,
        memberCount: emps.length,
        clientCount: clientList.length,
        createdAt: workspace.createdAt,
        isOwner,
        canManage,
        subscriptionStatus: workspace.subscriptionStatus || 'active',
        isSuspended: workspace.isSuspended || false,
        suspendedReason: workspace.suspendedReason || null,
        isFrozen: workspace.isFrozen || false,
        frozenReason: workspace.frozenReason || null,
        isLocked: workspace.isLocked || false,
        lockedReason: workspace.lockedReason || null,
        accountState: workspace.accountState || 'active',
        workspaceType: workspace.workspaceType || 'business',
        isPlatformSupport: workspace.isPlatformSupport || false,
        isSubOrg: workspace.isSubOrg || false,
        parentWorkspaceId: workspace.parentWorkspaceId || null,
        subOrgLabel: workspace.subOrgLabel || null,
        primaryOperatingState: workspace.primaryOperatingState || null,
        operatingStates: workspace.operatingStates || [],
      };
    };

    if (isPlatformStaff) {
      const allWorkspaces = await db.select().from(workspaces).where(eq(workspaces.subscriptionStatus, 'active')).orderBy(workspaces.name);
      const orgs = await Promise.all(
        allWorkspaces.map(ws => mapWorkspace(ws, ws.ownerId === userId, true))
      );
      return res.json(orgs);
    }

    const ownedWorkspaces = await db.select().from(workspaces).where(eq(workspaces.ownerId, userId));
    const orgs: any[] = [];
    const processedIds = new Set<string>();

    for (const workspace of ownedWorkspaces) {
      if (processedIds.has(workspace.id)) continue;
      processedIds.add(workspace.id);
      orgs.push(await mapWorkspace(workspace, true, true));

      if (!workspace.isSubOrg) {
        const subOrgs = await db.select().from(workspaces).where(
          and(eq(workspaces.parentWorkspaceId, workspace.id), eq(workspaces.isSubOrg, true))
        );
        for (const sub of subOrgs) {
          if (processedIds.has(sub.id)) continue;
          processedIds.add(sub.id);
          orgs.push(await mapWorkspace(sub, true, true));
        }
      }
    }

    const userEmployeeRecords = await db.select().from(employees).where(
      and(eq(employees.userId, userId), eq(employees.isActive, true))
    );
    for (const emp of userEmployeeRecords) {
      if (processedIds.has(emp.workspaceId)) continue;
      if (emp.workspaceRole === 'org_owner' || emp.workspaceRole === 'co_owner') {
        const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, emp.workspaceId)).limit(1);
        if (ws) {
          processedIds.add(ws.id);
          orgs.push(await mapWorkspace(ws, emp.workspaceRole === 'org_owner', true));

          if (!ws.isSubOrg) {
            const subOrgs = await db.select().from(workspaces).where(
              and(eq(workspaces.parentWorkspaceId, ws.id), eq(workspaces.isSubOrg, true))
            );
            for (const sub of subOrgs) {
              if (processedIds.has(sub.id)) continue;
              processedIds.add(sub.id);
              orgs.push(await mapWorkspace(sub, true, true));
            }
          }
        }
      }
    }

    res.json(orgs);
  } catch (error: unknown) {
    log.error("Error fetching managed organizations:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to fetch organizations" });
  }
});

router.patch("/organizations/:orgId/status", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    const { status, action, reason } = req.body;
    const userId = req.user || (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, orgId)).limit(1);
    if (!workspace) {
      return res.status(404).json({ message: "Organization not found" });
    }

    const platformRole = req.platformRole;
    const isPlatformStaff = platformRole && ["root_admin", "deputy_admin", "sysop", "support_manager", "support_agent"].includes(platformRole);
    const isOwner = workspace.ownerId === userId;

    if (action) {
      if (!isPlatformStaff) {
        return res.status(403).json({ message: "Only platform staff can perform org management actions" });
      }

      const validActions = ["suspend", "unsuspend", "freeze", "unfreeze", "lock", "unlock", "maintenance", "activate", "deactivate"];
      if (!validActions.includes(action)) {
        return res.status(400).json({ message: `Invalid action. Must be one of: ${validActions.join(", ")}` });
      }

      const { getPlatformRoleLevel, getOrgActionMinLevel } = await import('../rbac');
      const requesterLevel = getPlatformRoleLevel(platformRole as string);
      const requiredLevel = getOrgActionMinLevel(action);
      if (requesterLevel < requiredLevel) {
        const tierNames: Record<number, string> = { 3: 'support_agent', 4: 'support_manager', 5: 'sysop' };
        return res.status(403).json({
          message: `The '${action}' action requires ${tierNames[requiredLevel] || 'sysop'}+ authority. Your role: ${platformRole}`,
        });
      }

      const requiresReason = ["suspend", "freeze", "lock", "maintenance", "deactivate"];
      if (requiresReason.includes(action) && !reason) {
        return res.status(400).json({ message: `Reason is required for ${action} action` });
      }

      let updateFields: any = {};
      let message = "";

      switch (action) {
        case "suspend":
          updateFields = { isSuspended: true, suspendedReason: reason, suspendedAt: new Date(), suspendedBy: userId, accountState: "suspended" };
          message = "Organization suspended";
          break;
        case "unsuspend":
          updateFields = { isSuspended: false, suspendedReason: null, suspendedAt: null, suspendedBy: null, accountState: "active" };
          message = "Organization unsuspended";
          break;
        case "freeze":
          updateFields = { isFrozen: true, frozenReason: reason, frozenAt: new Date(), frozenBy: userId };
          message = "Organization frozen";
          break;
        case "unfreeze":
          updateFields = { isFrozen: false, frozenReason: null, frozenAt: null, frozenBy: null };
          message = "Organization unfrozen";
          break;
        case "lock":
          updateFields = { isLocked: true, lockedReason: reason, lockedAt: new Date(), lockedBy: userId };
          message = "Organization locked";
          break;
        case "unlock":
          updateFields = { isLocked: false, lockedReason: null, lockedAt: null, lockedBy: null };
          message = "Organization unlocked";
          break;
        case "maintenance":
          updateFields = { accountState: "maintenance" };
          message = "Organization set to maintenance mode";
          break;
        case "activate":
          updateFields = { accountState: "active", subscriptionStatus: "active", isSuspended: false, suspendedReason: null, suspendedAt: null, suspendedBy: null };
          message = "Organization activated";
          break;
        case "deactivate":
          updateFields = { accountState: "deactivated", subscriptionStatus: "cancelled" };
          message = "Organization deactivated";
          break;
        default:
          return res.status(400).json({ message: "Unknown action" });
      }

      await db.update(workspaces).set(updateFields).where(eq(workspaces.id, orgId));
      // Phase 26: platform-admin state transitions (activate / deactivate /
      // suspend / maintenance) must flush the tier cache so the Trinity
      // subscription gate sees the new state on the next inbound webhook.
      if ('subscriptionStatus' in updateFields || 'accountState' in updateFields) {
        cacheManager.invalidateWorkspace(orgId);
      }

      const { auditLogs } = await import('@shared/schema');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await db.insert(auditLogs).values({
        workspaceId: orgId,
        rawAction: `org_${action}`,
        actorType: 'SUPPORT_STAFF',
        actorId: userId,
        actorName: req.user?.email || userId,
        aggregateType: 'workspace',
        aggregateId: orgId,
        status: 'completed',
        payload: {
          description: `Organization ${action}: ${reason || 'No reason provided'}`,
          action,
          reason: reason || null,
          performedBy: req.user?.email || userId,
          platformRole,
          orgName: workspace.name || workspace.companyName || orgId,
          previousState: {
            isSuspended: workspace.isSuspended,
            isFrozen: (workspace as any).isFrozen,
            isLocked: (workspace as any).isLocked,
            accountState: (workspace as any).accountState,
          },
        },
        ipAddress: req.ip || req.socket?.remoteAddress,
      });


      return res.json({ success: true, orgId, action, message });
    }

    if (!status || !["active", "suspended", "cancelled"].includes(status)) {
      return res.status(400).json({ message: "Invalid status. Must be: active, suspended, or cancelled" });
    }

    if (!isPlatformStaff && !isOwner) {
      return res.status(403).json({ message: "Only platform admins or org owners can change activation status" });
    }

    await db.update(workspaces).set({ subscriptionStatus: status }).where(eq(workspaces.id, orgId));

    res.json({
      success: true,
      workspaceId: orgId,
      status,
      message: status === "active" ? "Organization reactivated" : `Organization ${status}`
    });
  } catch (error: unknown) {
    log.error("Error updating organization status:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to update organization status" });
  }
});

router.get("/organizations/:orgId/members", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    const userId = req.user || (req as any).user?.id;
    const workspaceId = req.workspaceId;
    
    if (!userId) {
      return res.status(400).json({ message: "User context required" });
    }
    
    const platformRole = req.platformRole || await getUserPlatformRole(userId);
    const isPlatformStaff = platformRole && ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'].includes(platformRole);
    
    if (!isPlatformStaff) {
      const employeeInOrg = await storage.getEmployeeByUserId(userId, orgId);
      const hasAccessInOrg = employeeInOrg && (employeeInOrg.workspaceRole === 'org_owner' || employeeInOrg.workspaceRole === 'co_owner');
      
      const [ownedOrg] = await db.select().from(workspaces).where(eq(workspaces.id, orgId)).limit(1);
      const isOwnerOfOrg = ownedOrg && ownedOrg.ownerId === userId;
      
      if (!hasAccessInOrg && !isOwnerOfOrg) {
        return res.status(403).json({ message: "Only organization owners and admins can view member lists" });
      }
    }
    
    const emps = await storage.getEmployeesByWorkspace(orgId);
    
    const members = emps.map(emp => ({
      id: emp.id,
      userId: emp.userId || null,
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email || '',
      workspaceRole: emp.workspaceRole || 'staff',
      isActive: emp.state === 'active' || !emp.state,
      lastActive: (emp as any).lastLogin,
    }));
    
    res.json(members);
  } catch (error: unknown) {
    log.error("Error fetching organization members:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to fetch members" });
  }
});

router.get("/employee/audit-record", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const employee = await storage.getEmployeeByUserId(userId, user.currentWorkspaceId);
    if (!employee) {
      return res.status(403).json({ message: "Employee not found" });
    }

    const [
      shiftsData,
      reviewsData,
      writeUpsData,
      lockedRecordsData,
    ] = await Promise.all([
      storage.getShiftsByEmployeeAndDateRange(user.currentWorkspaceId, employee.id,
        new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        new Date(),
      ),
      
      storage.getPerformanceReviewsByEmployee(employee.id, user.currentWorkspaceId),
      
      storage.getReportSubmissions(user.currentWorkspaceId, {
        employeeId: employee.id,
        status: 'approved',
      }),
      
      storage.getLockedReportRecords(user.currentWorkspaceId, { employeeId: employee.id }),
    ]);

    const totalHours = shiftsData.reduce((sum: number, shift: any) => sum + (shift.hoursWorked || 0), 0);
    const overtimeHours = shiftsData.reduce((sum: number, shift: any) => {
      const hours = shift.hoursWorked || 0;
      return sum + (hours > 8 ? hours - 8 : 0);
    }, 0);

    const { timeEntryDiscrepancies, disputes } = await import('@shared/schema');
    const [violationsData, discrepanciesData] = await Promise.all([
      db
        .select()
        .from(timeEntryDiscrepancies)
        .where(
          and(
            eq(timeEntryDiscrepancies.employeeId, employee.id),
            eq(timeEntryDiscrepancies.workspaceId, user.currentWorkspaceId)
          )
        ),
      
      db
        .select()
        .from(disputes)
        .where(
          and(
            // @ts-expect-error — TS migration: fix in refactoring sprint
            eq(disputes.employeeId, employee.id),
            eq(disputes.workspaceId, user.currentWorkspaceId)
          )
        ),
    ]);
    
    const missedBreaks = shiftsData.filter((shift: any) => {
      const hoursWorked = shift.hoursWorked || 0;
      return hoursWorked > 6 && !shift.breakTaken;
    }).length;

    res.json({
      shifts: shiftsData,
      reviews: reviewsData,
      writeups: writeUpsData.filter((w: any) => w.formData?.isDisciplinary || w.templateId?.includes('disciplinary')),
      lockedRecords: lockedRecordsData,
      compliance: {
        totalHours,
        overtimeHours,
        missedBreaks,
        violations: violationsData.length + discrepanciesData.length,
      },
    });
  } catch (error) {
    log.error("Error fetching audit record:", error);
    res.status(500).json({ message: "Failed to fetch audit record" });
  }
});

router.get("/employee/disputeable-items", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const employee = await storage.getEmployeeByUserId(userId, user.currentWorkspaceId);
    if (!employee) {
      return res.status(403).json({ message: "Employee not found" });
    }

    const [reviews, writeUps] = await Promise.all([
      storage.getPerformanceReviewsByEmployee(employee.id, user.currentWorkspaceId),
      storage.getReportSubmissions(user.currentWorkspaceId, {
        employeeId: employee.id,
        status: 'approved',
      }),
    ]);

    res.json({
      reviews: reviews.map((r: any) => ({
        id: r.id,
        type: 'performance_review',
        title: `${r.reviewType} Review - ${r.reviewPeriodStart ? new Date(r.reviewPeriodStart).toLocaleDateString() : 'N/A'}`,
        date: r.completedAt || r.createdAt,
      })),
      writeups: writeUps.map((w: any) => ({
        id: w.id,
        type: 'report_submission',
        title: w.reportNumber || 'Incident Report',
        date: w.submittedAt,
      })),
    });
  } catch (error) {
    log.error("Error fetching disputeable items:", error);
    res.status(500).json({ message: "Failed to fetch disputeable items" });
  }
});

router.get("/employee-reputation/:employeeId", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const { employeeId } = req.params;
    
    const employee = await storage.getEmployeeByUserId(userId, req.workspaceId);
    const isAuthorized = employee && ['org_owner', 'co_owner', 'org_admin', 'org_manager', 'department_manager'].includes(employee.role || '');
    
    if (!isAuthorized) {
      return res.status(403).json({ message: "Only HR/Managers can view employee reputation data" });
    }

    // SECURITY: workspace-scoped lookup — prevents cross-tenant data access.
    // A manager in Workspace A must NOT be able to read reputation data for Workspace B employees.
    const requesterWorkspaceId = req.workspaceId || employee?.workspaceId;
    if (!requesterWorkspaceId) {
      return res.status(403).json({ message: "Workspace context required" });
    }

    const targetEmployee = await db.select().from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, requesterWorkspaceId)))
      .limit(1);
    if (!targetEmployee.length) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const { performanceReviews } = await import('@shared/schema');
    const performanceReviewsData = await db.query.performanceReviews.findMany({
      where: (performanceReviews, { eq }) => eq(performanceReviews.employeeId, employeeId),
      columns: {
        overallRating: true,
        attendanceRating: true,
        attendanceRate: true,
        complianceViolations: true,
        reportsSubmitted: true,
        reportsApproved: true,
        reportsRejected: true,
        completedAt: true,
      }
    });

    const { stagedShifts } = await import('@shared/schema');
    const writeUps = await db.select({ count: sql<number>`count(*)` })
      .from(reportTemplates)
      .innerJoin(
        reportSubmissions,
        eq(reportSubmissions.templateId, reportTemplates.id)
      )
      .where(
        and(
          eq(reportSubmissions.employeeId, employeeId),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          eq(reportTemplates.isDisciplinary, true)
        )
      );

    const attendanceData = await db.select({
      totalEntries: sql<number>`count(*)`,
      lateClockIns: sql<number>`count(*) filter (where clock_in > (select start_time from ${shifts} where ${shifts.id} = ${timeEntriesTable.shiftId}))`,
      avgHoursPerWeek: sql<number>`avg(total_hours)`
    })
      .from(timeEntriesTable)
      .where(eq(timeEntriesTable.employeeId, employeeId));

    const employerRatingsCount = await db.select({ count: sql<number>`count(*)` })
      .from(employerRatings)
      .where(eq(employerRatings.employeeId, employeeId));

    const avgPerformanceRating = performanceReviewsData.length > 0
      ? performanceReviewsData.reduce((sum, r) => sum + (r.overallRating || 0), 0) / performanceReviewsData.length
      : 0;

    const avgAttendanceRating = performanceReviewsData.length > 0
      ? performanceReviewsData.reduce((sum, r) => sum + (r.attendanceRating || 0), 0) / performanceReviewsData.length
      : 0;

    const writeUpCount = writeUps[0]?.count || 0;
    const attendanceMetrics = attendanceData[0] || { totalEntries: 0, lateClockIns: 0, avgHoursPerWeek: 0 };

    const reputationData = {
      employeeId,
      employeeInitials: `${targetEmployee[0].firstName?.charAt(0) || ''}${targetEmployee[0].lastName?.charAt(0) || ''}`,
      role: targetEmployee[0].role,
      
      performanceMetrics: {
        avgOverallRating: Math.round(avgPerformanceRating * 10) / 10,
        avgAttendanceRating: Math.round(avgAttendanceRating * 10) / 10,
        totalReviewsCompleted: performanceReviewsData.length,
        avgAttendanceRate: performanceReviewsData.length > 0
          ? performanceReviewsData.reduce((sum, r) => sum + (Number(r.attendanceRate) || 0), 0) / performanceReviewsData.length
          : 0,
      },
      
      disciplinaryRecord: {
        totalWriteUps: writeUpCount,
        complianceViolations: performanceReviewsData.reduce((sum, r) => sum + (r.complianceViolations || 0), 0),
      },
      
      attendanceMetrics: {
        totalTimeEntries: attendanceMetrics.totalEntries,
        lateClockIns: attendanceMetrics.lateClockIns,
        lateClockInRate: attendanceMetrics.totalEntries > 0
          ? Math.round((attendanceMetrics.lateClockIns / attendanceMetrics.totalEntries) * 1000) / 10
          : 0,
        avgHoursPerWeek: Math.round(Number(attendanceMetrics.avgHoursPerWeek) * 10) / 10,
      },
      
      engagementMetrics: {
        employerRatingsSubmitted: employerRatingsCount[0]?.count || 0,
      },
      
      overallReputationScore: Math.min(100, Math.max(0, Math.round(
        (avgPerformanceRating * 15) +
        (avgAttendanceRating * 10) +
        (attendanceMetrics.totalEntries > 0 ? ((attendanceMetrics.totalEntries - attendanceMetrics.lateClockIns) / attendanceMetrics.totalEntries) * 20 : 0) -
        (writeUpCount * 5)
      ))),
      
      privacyNotice: "Sensitive information (names, comments, specific details) has been redacted for privacy. This data is aggregated for hiring decisions only."
    };

    res.json(reputationData);
  } catch (error) {
    log.error("Error fetching employee reputation:", error);
    res.status(500).json({ message: "Failed to fetch employee reputation data" });
  }
});

function generateInviteCode(): string {
  return crypto.randomBytes(32).toString('hex');
}

router.post("/invites/create", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    const workspace = await storage.getWorkspace(user.currentWorkspaceId);
    let inviterRole = 'org_owner'; // default for workspace primary owner
    if (!workspace || workspace.ownerId !== userId) {
      // Scope the employee lookup to the current workspace to prevent cross-tenant RBAC bypass
      const [employee] = await db
        .select()
        .from(employees)
        .where(and(eq(employees.userId, userId), eq(employees.workspaceId, user.currentWorkspaceId)))
        .limit(1);
      if (!employee || !['org_owner', 'co_owner'].includes(employee.workspaceRole || '')) {
        return res.status(403).json({ message: "Only organization owners or admins can create invites" });
      }
      inviterRole = employee.workspaceRole || 'co_owner';
    }

    // Accept both field name conventions from the frontend, with Zod validation
    const inviteBodySchema = z.object({
      inviteeEmail: z.string().email().max(254).optional(),
      email: z.string().email().max(254).optional(),
      inviteeRole: z.string().max(50).optional(),
      role: z.string().max(50).optional(),
      inviteeName: z.string().max(200).optional(),
      name: z.string().max(200).optional(),
      organizationalTitle: z.string().max(100).optional(),
    });
    const bodyParsed = inviteBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return res.status(400).json({ message: 'Invalid invite data', errors: bodyParsed.error.flatten().fieldErrors });
    }
    const rawEmail = bodyParsed.data.inviteeEmail || bodyParsed.data.email;
    const rawRole = bodyParsed.data.inviteeRole || bodyParsed.data.role || 'manager';
    const rawName = bodyParsed.data.inviteeName || bodyParsed.data.name;
    const inviteeEmail = rawEmail ? rawEmail.trim().toLowerCase() : null;
    const inviteeName = rawName ? rawName.trim() : null;
    const organizationalTitle = bodyParsed.data.organizationalTitle?.trim() || null;

    const ROLE_DISPLAY_NAMES: Record<string, string> = {
      manager: 'Manager',
      co_owner: 'Co-Owner',
      org_admin: 'Administrator',
      employee: 'Employee',
      staff: 'Staff Member',
      supervisor: 'Supervisor',
    };

    // Allowlist: only roles in ROLE_DISPLAY_NAMES are valid for invites.
    // This prevents privilege escalation via invite (e.g. inviteeRole='org_owner'/'sysop').
    const inviteeRole = String(rawRole).trim();
    if (!Object.keys(ROLE_DISPLAY_NAMES).includes(inviteeRole)) {
      return res.status(400).json({
        message: `Invalid role. Valid invite roles: ${Object.keys(ROLE_DISPLAY_NAMES).join(', ')}`,
      });
    }

    // Hierarchy enforcement: inviter must be strictly above the role they are granting.
    // Prevents co-owners from creating peer co-owner accounts.
    if (!canAssignRole(inviterRole, inviteeRole)) {
      return res.status(403).json({
        message: `Your role (${inviterRole}) cannot grant the ${inviteeRole} role. You may only invite to roles below your own level.`,
      });
    }

    // Guard: reject if a pending invite already exists for this email in this workspace
    if (inviteeEmail) {
      const existingPending = await db
        .select({ id: workspaceInvites.id })
        .from(workspaceInvites)
        .where(
          and(
            eq(workspaceInvites.workspaceId, user.currentWorkspaceId),
            eq(workspaceInvites.inviteeEmail, inviteeEmail),
            eq(workspaceInvites.status, 'pending')
          )
        )
        .limit(1);
      if (existingPending.length > 0) {
        return res.status(409).json({ message: "A pending invite already exists for this email address. Revoke it first or wait for it to expire." });
      }
    }

    let inviteCode = generateInviteCode();
    let attempts = 0;
    while (attempts < 5) {
      const existing = await db.select().from(workspaceInvites).where(eq(workspaceInvites.inviteCode, inviteCode)).limit(1);
      if (existing.length === 0) break;
      inviteCode = generateInviteCode();
      attempts++;
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Generate UUID explicitly — DB default may not be set for existing tables
    const inviteId = crypto.randomUUID();

    const [invite] = await db.insert(workspaceInvites).values({
      id: inviteId,
      workspaceId: user.currentWorkspaceId,
      inviteCode,
      inviterUserId: userId,
      inviteeEmail: inviteeEmail || null,
      inviteeRole,
      organizationalTitle,
      status: 'pending',
      expiresAt,
    }).returning();

    // Build invite link from request so it works in every environment
    const appBase = process.env.APP_URL ||
      `${req.protocol}://${req.get('host')}`;
    const inviteLink = `${appBase}/accept-invite?code=${invite.inviteCode}`;

    if (inviteeEmail) {
      const inviterEmployee = await storage.getEmployeeByUserId(userId, user.currentWorkspaceId);
      const inviterName = inviterEmployee
        ? `${inviterEmployee.firstName} ${inviterEmployee.lastName}`.trim()
        : (user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Your Manager');
      emailService.sendEmployeeInvitation( // nds-exempt: one-time invite token delivery
        user.currentWorkspaceId,
        inviteeEmail,
        inviteCode,
        {
          firstName: inviteeName || inviteeEmail.split('@')[0],
          inviterName,
          workspaceName: workspace?.name || 'Your Organization',
          roleName: ROLE_DISPLAY_NAMES[inviteeRole] || inviteeRole,
          expiresInDays: 7,
        }
      ).catch((err: Error) => log.error('[Invite] Email send failed:', sanitizeError(err)));
    }

    res.json({
      success: true,
      invite: {
        id: invite.id,
        inviteCode: invite.inviteCode,
        inviteeEmail: invite.inviteeEmail,
        inviteeRole: invite.inviteeRole,
        expiresAt: invite.expiresAt,
        status: invite.status,
        inviteLink,
      },
      workspaceName: workspace?.name || 'Unknown',
      emailSent: !!inviteeEmail,
    });
  } catch (error) {
    log.error("Error creating invite:", error);
    res.status(500).json({ message: "Failed to create invite" });
  }
});

router.post("/invites/accept", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.currentWorkspaceId) {
      return res.status(400).json({ message: "You already belong to an organization" });
    }

    const { inviteCode } = req.body;
    if (!inviteCode || typeof inviteCode !== 'string') {
      return res.status(400).json({ message: "Invite code is required" });
    }

    const normalizedCode = inviteCode.toUpperCase().trim();

    const [invite] = await db.select().from(workspaceInvites)
      .where(eq(workspaceInvites.inviteCode, normalizedCode))
      .limit(1);

    if (!invite) {
      return res.status(404).json({ message: "Invalid invite code" });
    }

    if (new Date() > new Date(invite.expiresAt)) {
      return res.status(400).json({ message: "This invite code has expired" });
    }

    if (invite.status !== 'pending') {
      return res.status(400).json({ message: "This invite code has already been used" });
    }

    if (invite.inviteeEmail && invite.inviteeEmail.toLowerCase() !== user.email.toLowerCase()) {
      return res.status(403).json({ message: "This invite code is for a different email address" });
    }

    const workspace = await storage.getWorkspace(invite.workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: "Organization no longer exists" });
    }

    const onboardingPosition = employeeDocumentOnboardingService.getPositionFromRole((invite as any).inviteeRole || 'staff');
    const onboardingRequiredDocs = employeeDocumentOnboardingService.getRequiredDocuments(onboardingPosition);
    const onboardingRequiredStepIds = onboardingRequiredDocs.map((doc) => doc.id);

    let newEmployeeId: string | null = null;
    await db.transaction(async (tx) => {
      await tx.update(workspaceInvites)
        .set({
          status: 'accepted',
          acceptedByUserId: userId,
          acceptedAt: new Date(),
        })
        .where(eq(workspaceInvites.id, invite.id));

      await tx.update(users)
        .set({ currentWorkspaceId: invite.workspaceId })
        .where(eq(users.id, userId));

      // @ts-expect-error — TS migration: fix in refactoring sprint
      const [createdEmployee] = await tx.insert(employees).values({
        workspaceId: invite.workspaceId,
        userId: userId,
        firstName: user.firstName || 'New',
        lastName: user.lastName || 'Employee',
        email: user.email,
        workspaceRole: (invite as any).inviteeRole || 'staff',
        isActive: true,
        hireDate: new Date().toISOString().split('T')[0],
      }).returning({ id: employees.id });

      newEmployeeId = createdEmployee?.id || null;

      if (newEmployeeId) {
        await tx.insert(employeeOnboardingProgress).values({
          workspaceId: invite.workspaceId,
          employeeId: newEmployeeId,
          status: onboardingRequiredStepIds.length > 0 ? 'in_progress' : 'complete',
          stepsCompleted: [],
          stepsRemaining: onboardingRequiredStepIds,
          overallProgressPct: 0,
          invitationAcceptedAt: new Date(),
          lastUpdatedAt: new Date(),
        }).onConflictDoNothing();
      }
    });

    if (newEmployeeId) {
      const inviteEmail = invite.inviteeEmail || user.email;
      if (!inviteEmail) {
        log.warn('[Invite] Onboarding welcome email skipped: missing invitee email');
      } else {
      const localPart = inviteEmail.includes('@') ? inviteEmail.split('@')[0].trim() : inviteEmail.trim();
      const fallbackName = localPart || 'Team Member';
      const employeeName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || fallbackName;
      const onboardingToken = invite.inviteCode;
      const portalUrl = `${getAppBaseUrl()}/employee-portal?token=${onboardingToken}`;
      const deadlineDate = new Date(Date.now() + ONBOARDING_DEADLINE_DAYS * 24 * 60 * 60 * 1000)
        .toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      const requiredList = onboardingRequiredDocs.map((doc) => `<li>${doc.name}</li>`).join('');

      await emailService.sendCustomEmail(
        inviteEmail,
        `Welcome to ${workspace.name} — Complete Your Onboarding`,
        `
          <p>Hi ${employeeName},</p>
          <p>Welcome to ${workspace.name}. Complete your onboarding to start taking shifts.</p>
          <p><a href="${portalUrl}">Open your onboarding portal</a></p>
          <p><strong>Required documents:</strong></p>
          <ul>${requiredList}</ul>
          <p>Please complete everything by <strong>${deadlineDate}</strong>.</p>
        `,
        'employee_onboarding_welcome',
        invite.workspaceId,
        userId,
      ).catch((err: Error) => log.warn('[Invite] Onboarding welcome email failed:', sanitizeError(err)));
      }
    }


    // Seed onboarding progress + send welcome email with portal link (non-blocking)
    ;(async () => {
      try {
        const [newEmployee] = await db.select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.userId, userId), eq(employees.workspaceId, invite.workspaceId)))
          .limit(1);
        if (!newEmployee) return;

        // insert.*employeeOnboardingProgress
        await db.insert(employeeOnboardingProgress).values({
          workspaceId: invite.workspaceId,
          employeeId: newEmployee.id,
          status: 'invited',
          overallProgressPct: 0,
          invitationAcceptedAt: new Date(),
          stepsRemaining: ['profile_photo', 'government_id', 'guard_card', 'ssn_card',
            'employment_application', 'i9_verification', 'tax_withholding', 'direct_deposit',
            'background_check', 'drug_free_policy', 'handbook_acknowledgment',
            'sop_acknowledgment', 'emergency_contact', 'equipment_issuance', 'references'] as any,
        }).onConflictDoNothing();

        // Send welcome email with portal link — employee_onboarding_welcome
        const portalUrl = `${getAppBaseUrl()}/employee-portal`;
        await emailService.sendTemplatedEmail(
          user.email,
          'employee_onboarding_welcome',
          {
            subject: `Welcome to ${workspace.name} — Complete Your Onboarding`,
            employeeName: `${user.firstName || 'New'} ${user.lastName || 'Employee'}`,
            orgName: workspace.name,
            portalUrl,
          },
          invite.workspaceId
        );
      } catch (err: any) {
        log.warn('[InviteAccept] Post-accept onboarding setup failed (non-blocking):', err?.message);
      }
    })();

    res.json({
      success: true,
      workspaceId: invite.workspaceId,
      workspaceName: workspace.name,
      role: invite.inviteeRole,
      message: `Welcome to ${workspace.name}!`,
    });
  } catch (error) {
    log.error("Error accepting invite:", error);
    res.status(500).json({ message: "Failed to accept invite" });
  }
});

router.get("/invites", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    const workspace = await storage.getWorkspace(user.currentWorkspaceId);
    const isOwner = workspace?.ownerId === userId;
    const employee = await storage.getEmployeeByUserId(userId, user.currentWorkspaceId);
    const isAdmin = employee && ['org_owner', 'co_owner'].includes(employee.workspaceRole || '');

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Access denied" });
    }

    const invites = await db.select().from(workspaceInvites)
      .where(eq(workspaceInvites.workspaceId, user.currentWorkspaceId))
      .orderBy(desc(workspaceInvites.createdAt));

    res.json({
      invites: invites.map(inv => ({
        id: inv.id,
        inviteCode: inv.inviteCode,
        inviteeEmail: inv.inviteeEmail,
        inviteeRole: inv.inviteeRole,
        status: inv.status,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
        acceptedAt: inv.acceptedAt,
      })),
    });
  } catch (error) {
    log.error("Error listing invites:", error);
    res.status(500).json({ message: "Failed to list invites" });
  }
});

router.delete("/invites/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    const inviteId = req.params.id;
    const [invite] = await db.select().from(workspaceInvites)
      .where(eq(workspaceInvites.id, inviteId))
      .limit(1);

    if (!invite || invite.workspaceId !== user.currentWorkspaceId) {
      return res.status(404).json({ message: "Invite not found" });
    }

    if (invite.status !== 'pending') {
      return res.status(400).json({ message: "Only pending invites can be revoked" });
    }

    await db.update(workspaceInvites)
      .set({ status: 'revoked' })
      .where(eq(workspaceInvites.id, inviteId));


    res.json({ success: true, message: "Invite revoked" });
  } catch (error) {
    log.error("Error revoking invite:", error);
    res.status(500).json({ message: "Failed to revoke invite" });
  }
});

router.get("/hr/pto-balances", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const balances = await getAllPtoBalances(workspaceId);
    res.json(balances);
  } catch (error: unknown) {
    log.error("Error fetching PTO balances:", error);
    res.status(500).json({ message: "Failed to fetch PTO balances" });
  }
});

router.get("/hr/pto-balances/:employeeId", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { employeeId } = req.params;
    const workspaceId = req.workspaceId!;
    
    const balance = await calculatePtoAccrual(workspaceId, employeeId);
    
    if (!balance) {
      return res.status(404).json({ message: "Employee or PTO benefit not found" });
    }
    
    res.json(balance);
  } catch (error: unknown) {
    log.error("Error fetching employee PTO balance:", error);
    res.status(500).json({ message: "Failed to fetch PTO balance" });
  }
});

router.post("/hr/pto-accrual/run", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const updatedCount = await runWeeklyPtoAccrual(workspaceId);
    
    res.json({ 
      success: true, 
      message: `PTO accrual updated for ${updatedCount} employees`,
      updatedCount 
    });
  } catch (error: unknown) {
    log.error("Error running PTO accrual:", error);
    res.status(500).json({ message: "Failed to run PTO accrual" });
  }
});

router.get("/hr/review-reminders/summary", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const summary = await getReviewReminderSummary(workspaceId);
    res.json(summary);
  } catch (error: unknown) {
    log.error("Error fetching review reminder summary:", error);
    res.status(500).json({ message: "Failed to fetch review reminders" });
  }
});

router.get("/hr/review-reminders/overdue", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const overdueReviews = await getOverdueReviews(workspaceId);
    res.json(overdueReviews);
  } catch (error: unknown) {
    log.error("Error fetching overdue reviews:", error);
    res.status(500).json({ message: "Failed to fetch overdue reviews" });
  }
});

router.get("/hr/review-reminders/upcoming", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const daysAhead = Math.min(Math.max(1, parseInt(req.query.days as string) || 30), 365);
    const upcomingReviews = await getUpcomingReviews(workspaceId, daysAhead);
    res.json(upcomingReviews);
  } catch (error: unknown) {
    log.error("Error fetching upcoming reviews:", error);
    res.status(500).json({ message: "Failed to fetch upcoming reviews" });
  }
});

router.post("/organization-onboarding/start", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
    const {
      organizationName,
      industry,
      employeeCount,
      subscriptionTier,
      billingEmail,
      adminEmail,
    } = req.body;
    const { organizationOnboarding } = await import("@shared/schema");

    const [onboarding] = await db
      .insert(organizationOnboarding)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .values({
        workspaceId,
        userId: userId!,
        organizationName,
        industry,
        employeeCount,
        subscriptionTier,
        billingEmail,
        adminEmail,
        status: 'in_progress',
        currentStep: 'profile_setup',
      })
      .returning();

    res.json(onboarding);
  } catch (error: unknown) {
    log.error('Error starting onboarding:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to start onboarding' });
  }
});

router.put("/organization-onboarding/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;
    const {
      currentStep,
      completedSteps,
      setupData,
      status,
    } = req.body;
    const { organizationOnboarding } = await import("@shared/schema");

    const [updated] = await db
      .update(organizationOnboarding)
      .set({
        currentStep,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        completedSteps,
        setupData,
        status,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(organizationOnboarding.id, id),
          eq(organizationOnboarding.workspaceId, workspaceId)
        )
      )
      .returning();

    if (!updated) {
      return res.status(404).json({ message: 'Onboarding record not found' });
    }

    res.json(updated);
  } catch (error: unknown) {
    log.error('Error updating onboarding:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to update onboarding' });
  }
});

router.post("/organization-onboarding/:id/complete", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;
    const { organizationOnboarding } = await import("@shared/schema");

    const [completed] = await db
      .update(organizationOnboarding)
      .set({
        isCompleted: true,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(organizationOnboarding.id, id),
          eq(organizationOnboarding.workspaceId, workspaceId)
        )
      )
      .returning();

    if (!completed) {
      return res.status(404).json({ message: 'Onboarding record not found' });
    }

    res.json(completed);
  } catch (error: unknown) {
    log.error('Error completing onboarding:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to complete onboarding' });
  }
});

router.get("/organization-onboarding/status", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { organizationOnboarding } = await import("@shared/schema");

    const onboarding = await db
      .select()
      .from(organizationOnboarding)
      .where(eq(organizationOnboarding.workspaceId, workspaceId))
      .orderBy(desc(organizationOnboarding.createdAt))
      .limit(1)
      .then(rows => rows[0]);

    if (!onboarding) {
      return res.json({ status: 'not_started' });
    }

    res.json(onboarding);
  } catch (error: unknown) {
    log.error('Error getting onboarding status:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to get onboarding status' });
  }
});

router.get("/experience/notification-preferences", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    if (!userId || !workspaceId) {
      return res.json({ email: true, push: true, sms: false, inApp: true, digest: 'daily' });
    }

    const [prefs] = await db
      .select()
      .from(userNotificationPreferences)
      .where(
        and(
          eq(userNotificationPreferences.userId, userId),
          eq(userNotificationPreferences.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (!prefs) {
      return res.json({ email: true, push: true, sms: false, inApp: true, digest: 'realtime' });
    }

    res.json({
      email: prefs.enableEmail ?? true,
      push: prefs.enablePush ?? true,
      sms: prefs.enableSms ?? false,
      inApp: prefs.enablePush ?? true,
      digest: prefs.digestFrequency ?? 'realtime',
      shiftReminders: prefs.enableShiftReminders ?? true,
      shiftReminderTiming: prefs.shiftReminderTiming ?? '1hour',
      scheduleChangeNotifications: prefs.enableScheduleChangeNotifications ?? true,
      approvalNotifications: prefs.enableApprovalNotifications ?? true,
      quietHoursStart: prefs.quietHoursStart,
      quietHoursEnd: prefs.quietHoursEnd,
    });
  } catch (error: unknown) {
    log.error('Error fetching notification preferences:', error);
    res.json({ email: true, push: true, sms: false, inApp: true, digest: 'daily' });
  }
});

router.post("/experience/notification-preferences", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    if (!userId || !workspaceId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { email, push, sms, digest, shiftReminders, shiftReminderTiming, scheduleChangeNotifications, approvalNotifications, quietHoursStart, quietHoursEnd } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (email !== undefined) updateData.enableEmail = email;
    if (push !== undefined) updateData.enablePush = push;
    if (sms !== undefined) updateData.enableSms = sms;
    if (digest !== undefined) updateData.digestFrequency = digest;
    if (shiftReminders !== undefined) updateData.enableShiftReminders = shiftReminders;
    if (shiftReminderTiming !== undefined) updateData.shiftReminderTiming = shiftReminderTiming;
    if (scheduleChangeNotifications !== undefined) updateData.enableScheduleChangeNotifications = scheduleChangeNotifications;
    if (approvalNotifications !== undefined) updateData.enableApprovalNotifications = approvalNotifications;
    if (quietHoursStart !== undefined) updateData.quietHoursStart = quietHoursStart;
    if (quietHoursEnd !== undefined) updateData.quietHoursEnd = quietHoursEnd;

    const [existing] = await db
      .select({ id: userNotificationPreferences.id })
      .from(userNotificationPreferences)
      .where(
        and(
          eq(userNotificationPreferences.userId, userId),
          eq(userNotificationPreferences.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(userNotificationPreferences)
        .set(updateData)
        .where(eq(userNotificationPreferences.id, existing.id));
    } else {
      await db.insert(userNotificationPreferences).values({
        userId,
        workspaceId,
        enableEmail: email ?? true,
        enablePush: push ?? true,
        enableSms: sms ?? false,
        digestFrequency: digest ?? 'realtime',
        enableShiftReminders: shiftReminders ?? true,
        enableScheduleChangeNotifications: scheduleChangeNotifications ?? true,
        enableApprovalNotifications: approvalNotifications ?? true,
        ...updateData,
      });
    }

    res.json({ success: true, ...req.body });
  } catch (error: unknown) {
    log.error('Error saving notification preferences:', error);
    res.status(500).json({ error: 'Failed to save notification preferences' });
  }
});

// GET /api/manager/command-center — Manager Command Center daily ops summary
router.get("/manager/command-center", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const { notifications, documentSignatures, incidents } = await import('@shared/schema');
    const { gte: gteOp, lte: lteOp, ne: neOp } = await import('drizzle-orm');

    const todayShiftsRaw = await db.select({
      id: shifts.id,
      employeeId: shifts.employeeId,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      status: shifts.status,
      siteName: (shifts as any).siteName,
    }).from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        // @ts-expect-error — TS migration: fix in refactoring sprint
        gte(shifts.startTime, todayStart.toISOString()),
        // @ts-expect-error — TS migration: fix in refactoring sprint
        lteOp(shifts.startTime, todayEnd.toISOString()),
        neOp(shifts.status, 'cancelled' as any),
      ))
      .orderBy(shifts.startTime)
      .limit(50);

    const todayShiftIds = todayShiftsRaw.map(s => s.id);
    let clockedInShiftIds = new Set<string>();
    if (todayShiftIds.length > 0) {
      const clockedInEntries = await db.select({ shiftId: timeEntriesTable.shiftId })
        .from(timeEntriesTable)
        .where(and(
          eq(timeEntriesTable.workspaceId, workspaceId),
          inArray(timeEntriesTable.shiftId, todayShiftIds),
        ));
      clockedInEntries.forEach(e => { if (e.shiftId) clockedInShiftIds.add(e.shiftId); });
    }

    const clockedInOfficers = todayShiftsRaw.filter(s => clockedInShiftIds.has(s.id));
    const notClockedIn = todayShiftsRaw.filter(s => !clockedInShiftIds.has(s.id));
    const missedAlerts = notClockedIn.filter(s => {
      const startTime = new Date(s.startTime);
      return (now.getTime() - startTime.getTime()) > 15 * 60 * 1000;
    });

    const pendingTimesheets = await db.select({ id: timeEntriesTable.id })
      .from(timeEntriesTable)
      .where(and(
        eq(timeEntriesTable.workspaceId, workspaceId),
        eq(timeEntriesTable.status, 'pending'),
      ))
      .limit(50);

    let pendingDocCount = 0;
    try {
      const pendingDocs = await db.select({ id: documentSignatures.id })
        .from(documentSignatures)
        .where(and(
          eq(documentSignatures.workspaceId, workspaceId),
          eq(documentSignatures.status, 'pending'),
        ))
        .limit(20);
      pendingDocCount = pendingDocs.length;
    } catch (err: any) {
      log.warn('[HRInline] Failed to update onboarding status', { error: err.message });
    }

    let openIncidents: any[] = [];
    try {
      openIncidents = await db.select({
        id: incidents.id,
        title: incidents.title,
        severity: incidents.severity,
        createdAt: incidents.createdAt,
      }).from(incidents)
        .where(and(
          eq(incidents.workspaceId, workspaceId),
          eq(incidents.status, 'open'),
        ))
        .orderBy(desc(incidents.createdAt))
        .limit(10);
    } catch (err: any) {
      log.warn('[HRInline] Failed to update onboarding status', { error: err.message });
    }

    const recentNotifications = await db.select({
      id: notifications.id,
      title: notifications.title,
      message: notifications.message,
      type: notifications.type,
      createdAt: notifications.createdAt,
    }).from(notifications)
      .where(and(
        eq(notifications.workspaceId, workspaceId),
        gte(notifications.createdAt, todayStart),
      ))
      .orderBy(desc(notifications.createdAt))
      .limit(5);

    res.json({
      todayShifts: {
        total: todayShiftsRaw.length,
        clockedIn: clockedInOfficers.length,
        notClockedIn: notClockedIn.length,
        officers: todayShiftsRaw.map(s => ({
          shiftId: s.id,
          employeeId: s.employeeId,
          siteName: s.siteName,
          startTime: s.startTime,
          endTime: s.endTime,
          clockedIn: clockedInShiftIds.has(s.id),
          missedAlert: !clockedInShiftIds.has(s.id) && (now.getTime() - new Date(s.startTime).getTime()) > 15 * 60 * 1000,
        })),
      },
      pendingActions: {
        timesheets: pendingTimesheets.length,
        incidents: openIncidents.length,
        documentsToSign: pendingDocCount,
        total: pendingTimesheets.length + openIncidents.length + pendingDocCount,
      },
      activeAlerts: {
        missedClockIns: missedAlerts.map(s => ({
          shiftId: s.id,
          employeeId: s.employeeId,
          siteName: s.siteName,
          scheduledStart: s.startTime,
          minutesLate: Math.floor((now.getTime() - new Date(s.startTime).getTime()) / 60000),
        })),
        openIncidents: openIncidents.slice(0, 5),
        count: missedAlerts.length + openIncidents.length,
      },
      trinityBrief: {
        items: recentNotifications.slice(0, 3).map(n => ({
          title: n.title,
          message: n.message,
          type: n.type,
          time: n.createdAt,
        })),
      },
      generatedAt: now.toISOString(),
    });
  } catch (error: unknown) {
    log.error('[manager/command-center]', sanitizeError(error));
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// GET /api/shift-actions/pending — Pending shift action requests for manager review
router.get("/shift-actions/pending", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { shiftActions } = await import("@shared/schema");
    const { eq, and } = await import("drizzle-orm");
    const pending = await db
      .select()
      .from(shiftActions)
      .where(and(eq(shiftActions.workspaceId, workspaceId), eq(shiftActions.status, "pending")))
      .orderBy(shiftActions.createdAt);
    res.json(pending);
  } catch (err: unknown) {
    log.error("[shift-actions/pending]", sanitizeError(err));
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
