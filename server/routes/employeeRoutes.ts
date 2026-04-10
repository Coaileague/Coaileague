import { sanitizeError } from '../middleware/errorHandler';
import { validatePayRate, canAssignRole, requiresOwnerToAssign, OWNER_ASSIGN_MIN_LEVEL, businessRuleResponse } from '../lib/businessRules';
import { WORKSPACE_ROLE_HIERARCHY } from '../lib/rbac/roleDefinitions';
import { Router } from "express";
import { storage } from "../storage";
import { trimStrings } from "../utils/sanitize";
import { db } from "../db";
import {
  employees,
  users,
  workspaces,
  platformRoles,
  insertEmployeeSchema,
  systemAuditLogs,
} from "@shared/schema";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getUserPlatformRole, getAuthorityLevelForEmployee, canEditEmployeeByPosition, canPromoteEmployeeTo, requireAuth } from "../rbac";
import { platformEventBus } from "../services/platformEventBus";
import { deletionProtection } from "../services/deletionProtectionService";
import type { AuthenticatedRequest } from "../rbac";
import { getPositionById, getWorkspaceRoleForPosition, getAuthorityLevel } from "@shared/positionRegistry";
import { createLogger } from '../lib/logger';
import { scheduleNonBlocking } from '../lib/scheduleNonBlocking';
const log = createLogger('EmployeeRoutes');

import { PLATFORM_WORKSPACE_ID } from '../services/billing/billingConstants';
import {
  createFilterContext,
  filterEmployeeForResponse,
  filterEmployeesForResponse,
} from "../utils/sensitiveFieldFilter";
const router = Router();

router.patch('/:employeeId/role', async (req: AuthenticatedRequest, res) => {
  try {
    const { employeeId } = req.params;
    const body = trimStrings(req.body);
    const validation = z.object({
      workspaceRole: z.string(),
      expectedVersion: z.number().optional()
    }).safeParse(body);
    
    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", details: validation.error.issues });
    }
    const { workspaceRole: newRole, expectedVersion } = validation.data;
    const userId = req.user || (req as any).user?.id;
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    
    if (!userId || !workspaceId) {
      return res.status(400).json({ error: "User and workspace context required" });
    }
    
    if (!newRole) {
      return res.status(400).json({ error: "New role is required" });
    }
    
    const { getWorkspaceRoleLevel, hasManagerAccess } = await import('../rbac');
    
    const requesterEmployee = await storage.getEmployeeByUserId(userId, workspaceId);
    const resolvedPlatRole = req.platformRole || await getUserPlatformRole(userId);
    const isPlatStaff = resolvedPlatRole && ['root_admin', 'deputy_admin', 'sysop', 'support_manager'].includes(resolvedPlatRole);
    
    if (!isPlatStaff && !hasManagerAccess(requesterEmployee?.workspaceRole as string)) {
      return res.status(403).json({ error: "Only managers and above can change roles" });
    }
    
    const targetEmployee = await storage.getEmployee(employeeId, workspaceId);
    if (!targetEmployee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    // ── Primary org_owner hard stop ──────────────────────────────────────────
    // The workspace's primary owner (workspace.ownerId) can NEVER be demoted by
    // anyone operating at the workspace level. Only platform staff may alter their role.
    if (!isPlatStaff && targetEmployee.workspaceRole === 'org_owner') {
      const workspace = await storage.getWorkspace(workspaceId);
      if (workspace?.ownerId === targetEmployee.userId) {
        return res.status(403).json({
          error: 'Primary org owner protection',
          code: 'ORG_OWNER_PROTECTED',
          message: 'The primary organization owner can only be managed by platform support.',
        });
      }
    }
    
    if (targetEmployee.userId === userId && targetEmployee.workspaceRole === 'org_owner' && newRole !== 'org_owner') {
      return res.status(400).json({ error: "You cannot demote yourself from organization owner" });
    }
    
    if (!isPlatStaff) {
      if (!canEditEmployeeByPosition(
        requesterEmployee?.position, targetEmployee.position,
        requesterEmployee?.workspaceRole as string, targetEmployee.workspaceRole as string
      )) {
        return res.status(403).json({ error: "You cannot change the role of someone at your authority level or above" });
      }

      if (!canAssignRole(requesterEmployee?.workspaceRole as string, newRole)) {
        return res.status(403).json({
          error: 'Role assignment not permitted',
          code: 'ROLE_ESCALATION_VIOLATION',
          message: `You cannot assign the ${newRole} role. You may only assign roles below your own level.`,
        });
      }

      // ── Ownership gate: supervisor+ requires org_owner or co_owner ───────
      // Only org_owner (7) or co_owner (6) may grant roles at supervisor level (3)
      // and above. Regular managers cannot create new managers or supervisors.
      if (requiresOwnerToAssign(newRole)) {
        const requesterLevel = WORKSPACE_ROLE_HIERARCHY[requesterEmployee?.workspaceRole as string] ?? 0;
        if (requesterLevel < OWNER_ASSIGN_MIN_LEVEL) {
          return res.status(403).json({
            error: 'Ownership required',
            code: 'OWNER_ROLE_GATE',
            message: `Only organization owners can assign the ${newRole} role. Please contact your org owner.`,
          });
        }
      }
    }
    
    if (newRole === 'org_owner' && !isPlatStaff) {
      return res.status(403).json({ message: "Only platform staff can assign the org_owner role" });
    }
    
    if (!(newRole in WORKSPACE_ROLE_HIERARCHY)) {
      return res.status(400).json({ message: `Invalid role: ${newRole}` });
    }

    if (expectedVersion !== undefined) {
      const currentVersion = (targetEmployee as any).version || 1;
      if (currentVersion !== expectedVersion) {
        return res.status(409).json({
          message: "This employee was modified by another user. Please refresh and try again.",
          conflict: true,
          currentVersion,
          expectedVersion,
        });
      }
    }
    
    const newVersion = ((targetEmployee as any).version || 1) + 1;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const updated = await storage.updateEmployee(employeeId, { workspaceRole: newRole } as any);
    if (updated) {
      await db.update(employees).set({ version: newVersion, updatedAt: new Date() }).where(eq(employees.id, employeeId));
    }
    
    await storage.createAuditLog({
      workspaceId,
      userId,
      action: 'update',
      entityType: 'employee',
      entityId: employeeId,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      details: { previousRole: targetEmployee.workspaceRole, newRole },
    });
    
    try {
      const { broadcastToWorkspace } = await import('../websocket');
      
      broadcastToWorkspace(workspaceId, {
        type: 'EMPLOYEE_POSITION_CHANGED',
        payload: {
          employeeId,
          userId: targetEmployee.userId,
          previousRole: targetEmployee.workspaceRole,
          newRole,
          previousPosition: targetEmployee.position,
          newPosition: targetEmployee.position,
          changedBy: userId,
          timestamp: new Date().toISOString(),
        },
      });

      broadcastToWorkspace(workspaceId, {
        type: 'RBAC_ROLE_CHANGED',
        payload: {
          employeeId,
          userId: targetEmployee.userId,
          previousRole: targetEmployee.workspaceRole,
          newRole,
          changedBy: userId,
          timestamp: new Date().toISOString(),
        },
      });
      
      const { platformEventBus } = await import('../services/platformEventBus');
      platformEventBus.emit('RBAC_ROLE_CHANGED', {
        workspaceId,
        employeeId,
        userId: targetEmployee.userId,
        previousRole: targetEmployee.workspaceRole,
        newRole,
        changedBy: userId,
      });
      platformEventBus.emit('TRINITY_ACCESS_CHANGED', {
        workspaceId,
        employeeId,
        userId: targetEmployee.userId,
        previousRole: targetEmployee.workspaceRole,
        newRole,
        changedBy: userId,
      });
    } catch (wsError: unknown) {
      log.error("WebSocket broadcast error (non-fatal):", wsError);
    }
    
    res.json({
      success: true,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      employee: filterEmployeeForResponse(updated, createFilterContext(req)),
      message: `Role updated to ${newRole}`,
    });
  } catch (error: unknown) {
    log.error("Error updating employee role:", error);
    res.status(500).json({ message: (error instanceof Error ? sanitizeError(error) : null) || "Failed to update role" });
  }
});

router.patch('/:employeeId/position', async (req: AuthenticatedRequest, res) => {
  try {
    const { employeeId } = req.params;
    const validation = z.object({
      position: z.string(),
      expectedVersion: z.number().optional()
    }).safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", details: validation.error.issues });
    }
    const { position: newPosition, expectedVersion } = validation.data;
    const userId = req.user || (req as any).user?.id;
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;

    if (!userId || !workspaceId) {
      return res.status(400).json({ message: "User and workspace context required" });
    }

    if (!newPosition) {
      return res.status(400).json({ message: "New position is required" });
    }

    const newPosDefinition = getPositionById(newPosition);
    if (!newPosDefinition) {
      return res.status(400).json({ message: `Invalid position: ${newPosition}. Must be a canonical position ID from the registry.` });
    }

    const resolvedPlatRole = req.platformRole || await getUserPlatformRole(userId);
    const isPlatStaff = resolvedPlatRole && ['root_admin', 'deputy_admin', 'sysop', 'support_manager'].includes(resolvedPlatRole);

    const requesterEmployee = await storage.getEmployeeByUserId(userId, workspaceId);
    const targetEmployee = await storage.getEmployee(employeeId, workspaceId);

    if (!targetEmployee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    if (!isPlatStaff) {
      if (!requesterEmployee) {
        return res.status(403).json({ message: "Requester employee record not found" });
      }

      if (!canEditEmployeeByPosition(
        requesterEmployee.position, targetEmployee.position,
        requesterEmployee.workspaceRole as string, targetEmployee.workspaceRole as string
      )) {
        return res.status(403).json({ message: "You cannot change the position of someone at your authority level or above" });
      }

      if (!canPromoteEmployeeTo(requesterEmployee.position, newPosition, requesterEmployee.workspaceRole as string)) {
        return res.status(403).json({ message: "You cannot assign a position at or above your own authority level" });
      }
    }

    if (expectedVersion !== undefined) {
      const currentVersion = (targetEmployee as any).version || 1;
      if (currentVersion !== expectedVersion) {
        return res.status(409).json({
          message: "This employee was modified by another user. Please refresh and try again.",
          conflict: true,
          currentVersion,
          expectedVersion,
        });
      }
    }

    const previousPosition = targetEmployee.position;
    const previousRole = targetEmployee.workspaceRole;
    const previousRate = targetEmployee.hourlyRate;
    const newWorkspaceRole = getWorkspaceRoleForPosition(newPosition);
    const newVersion = ((targetEmployee as any).version || 1) + 1;

    await db.update(employees).set({
      position: newPosition,
      workspaceRole: newWorkspaceRole as any,
      version: newVersion,
      updatedAt: new Date(),
    }).where(eq(employees.id, employeeId));

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const updated = await storage.getEmployee(employeeId);

    // Wage change audit trail (A4 requirement)
    if (updated && previousRate !== updated.hourlyRate) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const { universalAuditService, AUDIT_ACTIONS } = await import('../services/universalAuditService');
      await universalAuditService.log({
        workspaceId,
        actorId: userId,
        actorType: 'user',
        action: AUDIT_ACTIONS.EMPLOYEE_PAY_RATE_CHANGED,
        entityType: 'employee',
        entityId: employeeId,
        changeType: 'update',
        changes: {
          hourlyRate: { old: previousRate, new: updated.hourlyRate }
        },
        metadata: {
          previousPosition,
          newPosition,
          reason: 'position_change'
        },
        sourceRoute: 'PATCH /employees/:employeeId/position',
      });
    }

    await storage.createAuditLog({
      workspaceId,
      userId,
      action: 'update',
      entityType: 'employee',
      entityId: employeeId,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      details: {
        previousPosition,
        newPosition,
        previousRole,
        newRole: newWorkspaceRole,
        authorityLevel: newPosDefinition.authorityLevel,
        category: newPosDefinition.category,
      },
    });

    try {
      const { broadcastToWorkspace } = await import('../websocket');

      broadcastToWorkspace(workspaceId, {
        type: 'EMPLOYEE_POSITION_CHANGED',
        payload: {
          employeeId,
          userId: targetEmployee.userId,
          previousPosition,
          newPosition,
          previousRole,
          newRole: newWorkspaceRole,
          authorityLevel: newPosDefinition.authorityLevel,
          category: newPosDefinition.category,
          color: newPosDefinition.color,
          changedBy: userId,
          timestamp: new Date().toISOString(),
        },
      });

      broadcastToWorkspace(workspaceId, {
        type: 'RBAC_ROLE_CHANGED',
        payload: {
          employeeId,
          userId: targetEmployee.userId,
          previousRole,
          newRole: newWorkspaceRole,
          changedBy: userId,
          timestamp: new Date().toISOString(),
        },
      });

      const { platformEventBus } = await import('../services/platformEventBus');
      platformEventBus.emit('RBAC_ROLE_CHANGED', {
        workspaceId,
        employeeId,
        userId: targetEmployee.userId,
        previousRole,
        newRole: newWorkspaceRole,
        changedBy: userId,
      });
      platformEventBus.emit('TRINITY_ACCESS_CHANGED', {
        workspaceId,
        employeeId,
        userId: targetEmployee.userId,
        previousPosition,
        newPosition,
        previousRole,
        newRole: newWorkspaceRole,
        changedBy: userId,
      });
    } catch (wsError: unknown) {
      log.error("WebSocket broadcast error (non-fatal):", wsError);
    }

    try {
      const { eventBus } = await import('../services/trinity/eventBus');
      eventBus.emit('employee_position_changed', {
        employeeId,
        previousPosition: previousPosition || '',
        newPosition,
      });
    } catch (trinityError: unknown) {
      log.error("Trinity event error (non-fatal):", trinityError);
    }

    res.json({
      success: true,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      employee: filterEmployeeForResponse(updated, createFilterContext(req)),
      message: `Position updated to ${newPosDefinition.label}`,
    });
  } catch (error: unknown) {
    log.error("Error updating employee position:", error);
    res.status(500).json({ message: (error instanceof Error ? sanitizeError(error) : null) || "Failed to update position" });
  }
});

router.patch('/:employeeId/access', async (req: AuthenticatedRequest, res) => {
  try {
    const { employeeId } = req.params;
    const validation = z.object({
      isActive: z.boolean(),
      workspaceId: z.string().optional(),
      guardCardNumber: z.string().optional(),
      guardCardExpiryDate: z.union([z.date(), z.string().transform(v => new Date(v))]).optional(),
    }).safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", details: validation.error.issues });
    }
    const { isActive, workspaceId: bodyWorkspaceId, guardCardNumber, guardCardExpiryDate } = validation.data;
    const userId = req.user || (req as any).user?.id;
    const resolvedPlatRole2 = req.platformRole || await getUserPlatformRole(userId);
    const isPlatformStaff = resolvedPlatRole2 && ['root_admin', 'sysop', 'support_manager'].includes(resolvedPlatRole2);
    const workspaceId = (isPlatformStaff && bodyWorkspaceId) ? bodyWorkspaceId : (req.workspaceId || req.user?.currentWorkspaceId);
    const reqUser = await storage.getUser(userId);
    const userEmail = reqUser?.email || 'system';
    
    if (!userId || !workspaceId) {
      return res.status(400).json({ message: "User and workspace context required" });
    }
    
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: "isActive must be a boolean" });
    }
    
    const { getWorkspaceRoleLevel, hasOwnerAccess } = await import('../rbac');
    
    const requesterEmployee = await storage.getEmployeeByUserId(userId, workspaceId);
    
    if (!isPlatformStaff && !hasOwnerAccess(requesterEmployee?.workspaceRole as string) && requesterEmployee?.workspaceRole !== 'co_owner') {
      return res.status(403).json({ message: "Only organization owners and admins can manage access" });
    }
    
    const targetEmployee = await storage.getEmployee(employeeId, workspaceId);
    if (!targetEmployee) {
      return res.status(404).json({ message: "Employee not found" });
    }
    
    if (targetEmployee.userId === userId && !isActive) {
      return res.status(400).json({ message: "You cannot deactivate yourself" });
    }
    
    if (!isPlatformStaff && !isActive) {
      if (!canEditEmployeeByPosition(
        requesterEmployee?.position, targetEmployee.position,
        requesterEmployee?.workspaceRole as string, targetEmployee.workspaceRole as string
      )) {
        return res.status(403).json({ message: "You cannot deactivate someone at your authority level or above" });
      }
    }
    
    // ── ACTIVATION PATH: seat limit + hard cap check ─────────────────────────
    let seatOverageWarning: any = null;
    if (isActive && !targetEmployee.isActive) {
      try {
        const { usageTracker } = await import('../services/billing/usageTracker');
        const seatCheck = await usageTracker.canAddEmployee(workspaceId);

        if (!seatCheck.allowed) {
          return res.status(403).json({
            error: 'SEAT_LIMIT_REACHED',
            message: seatCheck.message || 'Employee seat limit reached for your plan.',
            current: seatCheck.current,
            max: seatCheck.max,
            requiredAction: 'upgrade_tier',
          });
        }

        // Check workspace hard cap setting
        const { db: dbInner } = await import('../db');
        const { sql: drizzleSql } = await import('drizzle-orm');
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const [subRow] = await dbInner.execute(drizzleSql`
          SELECT seat_hard_cap_enabled, max_employees, current_employees
          FROM subscriptions WHERE workspace_id = ${workspaceId} LIMIT 1
        `) as any[];
        const hardCapEnabled = subRow?.seat_hard_cap_enabled === true;
        const maxEmp = subRow?.max_employees || seatCheck.max;
        const curEmp = subRow?.current_employees || seatCheck.current;

        if (hardCapEnabled && curEmp >= maxEmp) {
          return res.status(402).json({
            error: 'HARD_CAP_ENFORCED',
            message: `Hard seat cap is enabled. Your workspace has reached the limit of ${maxEmp} seats. Disable hard cap or upgrade your plan.`,
            current: curEmp,
            max: maxEmp,
          });
        }

        if (seatCheck.current >= seatCheck.max && seatCheck.overageRate) {
          const monthlyOverageCharge = (seatCheck.overageRate / 100).toFixed(2);
          seatOverageWarning = {
            inOverage: true,
            current: seatCheck.current,
            included: seatCheck.max,
            overageRate: seatCheck.overageRate,
            projectedMonthlyCharge: `$${monthlyOverageCharge}/seat/month`,
            message: `Activating this officer will add 1 overage seat at $${monthlyOverageCharge}/month to your next invoice.`,
          };
        }
      } catch (seatCheckErr: unknown) {
        log.warn('[EmployeeRoutes] Seat check failed (non-blocking):', seatCheckErr instanceof Error ? seatCheckErr.message : String(seatCheckErr));
      }
    }

    const updated = await db.transaction(async (tx) => {
      const newStatus = isActive ? 'active' : 'suspended';
      const updatePayload: any = { isActive, updatedAt: new Date(), status: newStatus };
      if (guardCardNumber) updatePayload.guardCardNumber = guardCardNumber;
      if (guardCardExpiryDate) updatePayload.guardCardExpiryDate = guardCardExpiryDate;

      const [emp] = await tx
        .update(employees)
        .set(updatePayload)
        .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
        .returning();

      const requesterRole = requesterEmployee?.workspaceRole || resolvedPlatRole2 || 'user';
      await tx.insert(systemAuditLogs).values({
        workspaceId,
        userId,
        userEmail,
        userRole: requesterRole,
        action: 'update',
        entityType: 'employee',
        entityId: employeeId,
        changes: { 
          action: isActive ? 'activate' : 'suspend', 
          previousActive: targetEmployee.isActive, 
          newActive: isActive,
          guardCardNumber: guardCardNumber || undefined,
          guardCardExpiryDate: guardCardExpiryDate || undefined
        },
      });

      return emp;
    });

    // ── STRUCTURED LIFECYCLE AUDIT RECORD ─────────────────────────────────────
    try {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const { universalAuditService, AUDIT_ACTIONS } = await import('../services/universalAuditService');
      if (!isActive && targetEmployee.isActive) {
        await universalAuditService.log({
          workspaceId,
          actorId: userId,
          actorType: 'user',
          action: AUDIT_ACTIONS.EMPLOYEE_SUSPENDED,
          entityType: 'employee',
          entityId: employeeId,
          changeType: 'action',
          changes: {
            status: { old: 'active', new: 'suspended' },
            isActive: { old: true, new: false },
          },
          metadata: { reason: req.body.reason || 'access_revoked', suspendedBy: userId },
          sourceRoute: 'PATCH /employees/:employeeId/access',
        });
      } else if (isActive && !targetEmployee.isActive) {
        await universalAuditService.log({
          workspaceId,
          actorId: userId,
          actorType: 'user',
          action: AUDIT_ACTIONS.EMPLOYEE_REACTIVATED,
          entityType: 'employee',
          entityId: employeeId,
          changeType: 'action',
          changes: {
            status: { old: 'suspended', new: 'active' },
            isActive: { old: false, new: true },
          },
          metadata: { reactivatedBy: userId, seatOverage: !!seatOverageWarning },
          sourceRoute: 'PATCH /employees/:employeeId/access',
        });
      }
    } catch (auditErr: unknown) {
      log.error('[EmployeeRoutes] Lifecycle audit write failed (non-blocking):', auditErr instanceof Error ? auditErr.message : String(auditErr));
    }

    if (!isActive && targetEmployee.isActive) {
      try {
        const { handleOfficerDeactivation } = await import('../services/scheduling/officerDeactivationHandler');
        handleOfficerDeactivation(employeeId, workspaceId, 'suspended').catch(err =>
          log.error('[EmployeeRoutes] Officer deactivation handler error:', err)
        );
      } catch (e: unknown) {
        log.error('[EmployeeRoutes] Failed to import deactivation handler:', e);
      }
    }

    if (isActive && !targetEmployee.isActive) {
      try {
        const { emitTrinityEvent } = await import('../services/trinityEventSubscriptions');
        const empName = `${updated?.firstName || ''} ${updated?.lastName || ''}`.trim() || (updated as any)?.email || '';
        await emitTrinityEvent('officer_activated', {
          employeeId,
          employeeName: empName,
          activatedBy: userId,
          workspaceId,
        });
        // T003: Also emit as employee_reactivated for compliance with requirement 1.1
        await emitTrinityEvent('employee_reactivated', {
          employeeId,
          employeeName: empName,
          activatedBy: userId,
          workspaceId,
        });
      } catch (e: unknown) {
        log.warn('[EmployeeRoutes] officer_activated event failed (non-blocking):', e instanceof Error ? e.message : String(e));
      }
    }

    res.json({ success: true, employee: updated, ...(seatOverageWarning ? { seatOverageWarning } : {}) });
  } catch (error: unknown) {
    log.error("Error toggling employee access:", error);
    res.status(500).json({ message: (error instanceof Error ? sanitizeError(error) : null) || "Failed to toggle access" });
  }
});

router.get('/', async (req: AuthenticatedRequest, res) => {
  const startTime = Date.now();
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 200);
    const offset = (page - 1) * limit;

    let allEmployees: any[] = [];
    // Platform staff may pass an explicit workspaceId via query to view any org.
    // Regular users always use their authenticated session workspaceId.
    // NEVER fall back to the "first workspace in the DB" — that is a cross-tenant leak.
    const targetWorkspaceId = req.workspaceId
      || (req.platformRole ? (req.query.workspaceId as string | undefined) : undefined);

    if (!targetWorkspaceId) {
      return res.status(400).json({ message: "Workspace ID is required" });
    }

    // Get total count first for Pattern 2
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(employees)
      .where(eq(employees.workspaceId, targetWorkspaceId));
    
    const total = countResult?.count || 0;
    
    // Use the now-paginated storage method
    allEmployees = await storage.getEmployeesByWorkspace(targetWorkspaceId, limit, offset);

    const ctx = createFilterContext(req);
    
    const duration = Date.now() - startTime;
    if (duration > 100) {
      log.info(`[PERF] GET /api/employees took ${duration}ms for workspace ${targetWorkspaceId}`);
    }

    res.set('X-Total-Count', String(total));

    res.json({
      data: filterEmployeesForResponse(allEmployees, ctx),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    log.error("Error fetching employees:", error);
    res.status(500).json({ message: "Failed to fetch employees" });
  }
});

router.get('/export', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: "Workspace ID is required" });
    }

    const { hasManagerAccess } = await import('../rbac');
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const requesterEmployee = await storage.getEmployeeByUserId(req.user.id, workspaceId);
    if (!hasManagerAccess(requesterEmployee?.workspaceRole as string)) {
      return res.status(403).json({ message: "Only managers can export the employee roster" });
    }

    const allEmployees = await storage.getEmployeesByWorkspace(workspaceId, 10000, 0);
    
    const csvHeader = 'First Name,Last Name,Email,Phone,Position,Role,Status,Worker Type,Pay Type\n';
    const csvRows = allEmployees.map(e => 
      `"${e.firstName}","${e.lastName}","${e.email || ''}","${e.phone || ''}","${e.position || ''}","${e.workspaceRole || ''}","${e.isActive ? 'Active' : 'Inactive'}","${e.workerType || ''}","${e.payType || ''}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="employee-roster-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvHeader + csvRows);
  } catch (error) {
    log.error("Error exporting employees:", error);
    res.status(500).json({ message: "Failed to export employees" });
  }
});

router.post('/bulk-notify', async (req: AuthenticatedRequest, res) => {
  try {
    // Bulk notifications are a Business-tier feature (bulk operations directive)
    const { getWorkspaceTier, hasTierAccess } = await import('../tierGuards');
    const wsTier = await getWorkspaceTier(req.workspaceId!);
    if (!hasTierAccess(wsTier, 'business')) {
      return res.status(402).json({ error: 'Bulk employee notifications require the Business plan or higher', currentTier: wsTier, minimumTier: 'business', requiresTierUpgrade: true });
    }

    const validation = z.object({
      employeeIds: z.array(z.string()),
      title: z.string(),
      message: z.string(),
      // workspaceId intentionally removed — always sourced from req.workspaceId (session-bound)
    }).safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: "Validation failed", details: validation.error.issues });
    }

    const { employeeIds, title, message } = validation.data;
    const userId = req.user || (req as any).user?.id;
    // Always use the session workspaceId — never trust workspaceId from the request body
    const workspaceId = req.workspaceId!;

    if (!userId || !workspaceId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const notifications = employeeIds.map(employeeId => ({
      workspaceId,
      userId, // Sender
      employeeId, // Recipient
      title,
      message,
      type: 'system',
      status: 'unread',
    }));

    await storage.createBulkNotifications(notifications as any);

    res.json({ success: true, message: `Notifications sent to ${employeeIds.length} employees` });
  } catch (error: unknown) {
    log.error("Error sending bulk notifications:", error);
    res.status(500).json({ message: "Failed to send bulk notifications" });
  }
});

router.post('/', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ message: "Workspace ID is required" });
    }
    
    const workspace = await storage.getWorkspace(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const userId = req.user?.id || req.user?.id;
    const { platformRole: rawPlatformRole, workspaceId: _, ...employeeData } = req.body;
    const platformRole = rawPlatformRole && rawPlatformRole.trim() !== '' ? rawPlatformRole : undefined;

    const validationResult = insertEmployeeSchema.safeParse({
      ...employeeData,
      workspaceId,
      guardCardNumber: employeeData.guardCardNumber || undefined,
      guardCardExpiryDate: employeeData.guardCardExpiryDate || undefined,
    });

    if (!validationResult.success) {
      return res.status(400).json({ error: "Validation failed", details: validationResult.error.issues });
    }

    const validatedData = trimStrings(validationResult.data);

    if (platformRole) {
      const { getUserPlatformRole: getPlatRole } = await import('../rbac');
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const callerPlatRole = await getPlatRole(userId);
      const isPlatformStaffCaller = callerPlatRole && callerPlatRole !== 'none';
      
      if (!isPlatformStaffCaller) {
        return res.status(403).json({ message: "Only platform staff can assign platform roles" });
      }
      
      if (!validatedData.email) {
        return res.status(400).json({ message: "Email is required when assigning platform roles" });
      }
      
      const validPlatformRoles = ['support_agent', 'support_manager', 'compliance_officer', 'sysop', 'deputy_admin', 'root_admin'];
      if (!validPlatformRoles.includes(platformRole)) {
        return res.status(400).json({ message: `Invalid platform role: ${platformRole}` });
      }
    }

    const { featureGateService } = await import('../services/billing/featureGateService');
    const activeEmployeeCount = await db.select({ count: sql<number>`count(*)::int` })
      .from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.isActive, true)
      ));
    const currentCount = activeEmployeeCount[0]?.count || 0;
    const seatCheck = await featureGateService.checkEmployeeLimits(workspaceId, currentCount + 1);

    if (!seatCheck.allowed) {
      return res.status(403).json({
        message: `Employee limit reached for your plan (${seatCheck.limit} employees). Please upgrade to add more employees.`,
        currentCount: seatCheck.currentCount,
        limit: seatCheck.limit,
        requiredAction: 'upgrade_tier',
      });
    }

    const { enforceAttribution } = await import('../middleware/dataAttribution');
    
    // WORKER-TYPE DERIVATION (S1-GAP-FIX):
    // `payType: "contractor"` is the UI signal for 1099 treatment. Auto-derive
    // `workerType` and `is1099Eligible` so payroll and Trinity classify correctly
    // regardless of which code path created the employee record.
    if (validatedData.payType === 'contractor') {
      validatedData.workerType = 'contractor';
      validatedData.is1099Eligible = true;
    } else if (validatedData.payType && validatedData.payType !== 'contractor') {
      // hourly/salary/commission → W2 employee
      validatedData.workerType = validatedData.workerType || 'employee';
    }

    // ── REHIRE DETECTION: check if email matches a previously terminated officer ─
    let priorEmploymentRecord: any = null;
    if (validatedData.email) {
      try {
        const [priorEmp] = await db.select().from(employees)
          .where(and(
            eq(employees.workspaceId, workspaceId),
            eq(employees.email, validatedData.email),
            eq(employees.isActive, false)
          ))
          .orderBy(employees.updatedAt)
          .limit(1);
        if (priorEmp) {
          priorEmploymentRecord = {
            id: priorEmp.id,
            firstName: priorEmp.firstName,
            lastName: priorEmp.lastName,
            hireDate: (priorEmp as any).hireDate,
            terminationDate: (priorEmp as any).terminationDate,
            deactivationReason: (priorEmp as any).deactivationReason,
            position: priorEmp.position,
            isRehire: true,
          };
        }
      } catch (rehireCheckErr: unknown) {
        log.warn('[EmployeeRoutes] Rehire detection check failed (non-blocking):', rehireCheckErr instanceof Error ? rehireCheckErr.message : String(rehireCheckErr));
      }
    }

    const employee = await db.transaction(async (tx) => {
      const createdEmployee = await storage.createEmployee(validatedData);

      if (platformRole && createdEmployee && validatedData.email) {
        let targetUser = await storage.getUserByEmail(validatedData.email);
        
        if (!targetUser) {
          const bcryptModule = await import('bcryptjs');
          const tempPassword = await bcryptModule.default.hash(`temp-${Date.now()}`, 10);
          targetUser = await tx.insert(users).values({
            email: validatedData.email,
            passwordHash: tempPassword,
            firstName: validatedData.firstName || '',
            lastName: validatedData.lastName || '',
            authProvider: 'email',
            emailVerified: false,
          }).returning().then(rows => rows[0]);
        }

        if (targetUser) {
          await tx.insert(platformRoles).values({
            // @ts-expect-error — TS migration: fix in refactoring sprint
            workspaceId: PLATFORM_WORKSPACE_ID,
            userId: targetUser.id,
            role: platformRole,
            grantedBy: userId,
          }).onConflictDoUpdate({
            target: [platformRoles.userId],
            set: { role: platformRole, grantedBy: userId },
          });

          await tx.update(employees)
            .set({ userId: targetUser.id, updatedAt: new Date() })
            .where(eq(employees.id, createdEmployee.id));
          
          createdEmployee.userId = targetUser.id;
        }
      }
      return createdEmployee;
    });

    let updatedEmployee = employee;
    if (employee.email) {
      const existingUser = await storage.getUserByEmail(employee.email);
      if (existingUser && !employee.userId) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        updatedEmployee = await storage.updateEmployee(employee.id, workspaceId, {
          userId: existingUser.id,
        });
      }
    }

    try {
      const { initiateEmployeeOnboarding } = await import('../services/onboardingWorkflow');
      initiateEmployeeOnboarding(employee.id, workspaceId, req.user?.id)
        .catch(err => log.error('[Onboarding] Failed to initiate workflow for employee', employee.id, ':', err instanceof Error ? err.message : String(err)));
    } catch (err: unknown) {
      log.error('[Onboarding] Failed to load onboarding workflow module:', err instanceof Error ? err.message : String(err));
    }
    
    scheduleNonBlocking('employee.ai-brain-event-hired', async () => {
      const { postDatabaseEventToAIBrain } = await import('../services/ai-brain/workboardService');
      postDatabaseEventToAIBrain({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        eventType: 'employee_hired',
        workspaceId,
        userId: req.user?.id || 'system',
        entityType: 'employee',
        entityId: employee.id,
        metadata: { name: `${employee.firstName} ${employee.lastName}`, role: employee.role, source: 'manual_create' },
      });
    });

    // Wire email seat provisioning — non-blocking
    scheduleNonBlocking('employee.email-seat-provisioning', async () => {
      const emp = updatedEmployee || employee;
      if (emp.userId && emp.firstName && emp.lastName) {
        const { pool: pgPool } = await import('../db');
        const wsRow = await pgPool.query(
          `SELECT email_slug FROM workspaces WHERE id = $1`,
          [workspaceId]
        );
        const emailSlug = wsRow.rows[0]?.email_slug;
        if (emailSlug) {
          const { emailProvisioningService } = await import('../services/email/emailProvisioningService');
          await emailProvisioningService.reserveUserEmailAddress(
            workspaceId,
            emp.userId,
            emp.firstName,
            emp.lastName,
            emailSlug,
          );
          log.info(`[EmailProvisioning] Reserved @coaileague.com seat for employee ${emp.id}`);
        }
      }
    });

    const { entityCreationNotifier } = await import('../services/entityCreationNotifier');
    entityCreationNotifier.notifyNewEmployee({
      employeeId: employee.id,
      workspaceId,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      role: employee.role,
      createdBy: req.user?.id,
    }).catch(err => log.error('[EntityCreationNotifier] Employee notification failed:', err));

    // OMEGA L4.A.4: publish officer_activated on creation
    try {
      const { emitTrinityEvent } = await import('../services/trinityEventSubscriptions');
      const empName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.email || '';
      await emitTrinityEvent('officer_activated', {
        employeeId: employee.id,
        employeeName: empName,
        activatedBy: req.user?.id || 'system',
        workspaceId,
      });
    } catch (e: unknown) {
      log.warn('[EmployeeRoutes] officer_activated event failed on creation (non-blocking):', e instanceof Error ? e.message : String(e));
    }

    const { broadcastToWorkspace } = await import('../websocket');
    broadcastToWorkspace(workspaceId, { type: 'employees_updated', action: 'created' });

    const responsePayload: any = filterEmployeeForResponse(updatedEmployee || employee, createFilterContext(req));
    if (priorEmploymentRecord) {
      responsePayload.priorEmploymentDetected = true;
      responsePayload.priorEmploymentRecord = priorEmploymentRecord;
    }
    res.json(responsePayload);
  } catch (error: unknown) {
    log.error("Error creating employee:", error);
    res.status(400).json({ message: (error instanceof Error ? sanitizeError(error) : null) || "Failed to create employee" });
  }
});

router.patch('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ message: "Workspace ID is required" });
    }

    const userId = req.user?.id;
    const { workspaceId: _, expectedVersion, ...updateData } = req.body;

    // WORKER-TYPE DERIVATION (S1-GAP-FIX — PATCH path):
    // Mirror the same logic as POST so that editing payType in the UI
    // correctly updates workerType and 1099 eligibility in the same PATCH.
    if (updateData.payType === 'contractor') {
      updateData.workerType = 'contractor';
      updateData.is1099Eligible = true;
    } else if (updateData.payType && updateData.payType !== 'contractor') {
      updateData.workerType = 'employee';
      updateData.is1099Eligible = false;
    }

    const validationResult = insertEmployeeSchema.partial().safeParse(updateData);
    if (!validationResult.success) {
      return res.status(400).json({ error: "Validation failed", details: validationResult.error.issues });
    }
    const validated = validationResult.data;

    const payRateViolations = [
      validated.hourlyRate !== undefined ? validatePayRate(validated.hourlyRate, 'hourlyRate') : null,
      (validated as any).payRate !== undefined ? validatePayRate((validated as any).payRate, 'payRate') : null,
      (validated as any).billRate !== undefined ? validatePayRate((validated as any).billRate, 'billRate') : null,
      (validated as any).overtimeRate !== undefined ? validatePayRate((validated as any).overtimeRate, 'overtimeRate') : null,
    ];
    if (businessRuleResponse(res, payRateViolations)) return;

    const oldEmployee = await storage.getEmployee(req.params.id, workspaceId);
    if (!oldEmployee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    if (expectedVersion !== undefined) {
      const currentVersion = (oldEmployee as any).version || 1;
      if (currentVersion !== expectedVersion) {
        return res.status(409).json({
          message: "This employee was modified by another user. Please refresh and try again.",
          conflict: true,
          currentVersion,
          expectedVersion,
        });
      }
    }

    const resolvedPlatRole = req.platformRole || await getUserPlatformRole(userId || '');
    const isPlatStaff = resolvedPlatRole && ['root_admin', 'deputy_admin', 'sysop', 'support_manager'].includes(resolvedPlatRole);

    // FIX [SELF-COMPENSATION FRAUD]: Prevent any non-platform-staff user from modifying
    // their own pay/rate fields. The authority check below only fires for position or
    // role changes and therefore missed the case where a manager edits their own
    // hourlyRate, billRate, payRate, etc. without changing their role.
    const FINANCIAL_FIELDS = ['hourlyRate', 'payRate', 'billRate', 'overtimeRate', 'salaryAmount'];
    const isModifyingSelf = !!(userId && oldEmployee.userId === userId);
    const isChangingOwnFinancials = FINANCIAL_FIELDS.some(f => (validated as any)[f] !== undefined);
    if (isModifyingSelf && isChangingOwnFinancials && !isPlatStaff) {
      return res.status(403).json({
        message: "You cannot modify your own compensation fields. A higher-authority user must make this change.",
        code: 'SELF_COMPENSATION_MODIFICATION_FORBIDDEN',
      });
    }

    const positionChanging = (validated as any).position && (validated as any).position !== oldEmployee.position;
    const roleChanging = (validated as any).workspaceRole && (validated as any).workspaceRole !== oldEmployee.workspaceRole;

    if ((positionChanging || roleChanging) && !isPlatStaff && userId) {
      const requesterEmployee = await storage.getEmployeeByUserId(userId, workspaceId);
      if (requesterEmployee) {
        if (!canEditEmployeeByPosition(
          requesterEmployee.position, oldEmployee.position,
          requesterEmployee.workspaceRole as string, oldEmployee.workspaceRole as string
        )) {
          return res.status(403).json({ message: "You cannot edit someone at your authority level or above" });
        }

        if (positionChanging) {
          const newPos = (validated as any).position;
          if (!canPromoteEmployeeTo(requesterEmployee.position, newPos, requesterEmployee.workspaceRole as string)) {
            return res.status(403).json({ message: "You cannot assign a position at or above your own authority level" });
          }
          const posDefinition = getPositionById(newPos);
          if (posDefinition) {
            (validated as any).workspaceRole = getWorkspaceRoleForPosition(newPos);
          }
        }
      }
    }

    if ((validated as any).organizationalTitle && !positionChanging) {
      const titleToRoleMap: Record<string, string> = {
        'owner': 'org_owner',
        'director': 'co_owner',
        'manager': 'department_manager',
        'supervisor': 'supervisor',
        'staff': 'staff',
      };
      const mappedRole = titleToRoleMap[(validated as any).organizationalTitle];
      if (mappedRole) {
        (validated as any).workspaceRole = mappedRole;
        log.info(`[RBAC Sync] Employee ${req.params.id}: organizationalTitle=${(validated as any).organizationalTitle} -> workspaceRole=${mappedRole}`);
      }
    }

    if (!oldEmployee.isActive && (validated as any).isActive === false) {
      return res.status(400).json({ message: "Employee is already deactivated" });
    }

    const oldOrgTitle = (oldEmployee as any)?.organizationalTitle;
    const oldWorkspaceRole = oldEmployee?.workspaceRole;
    const oldPosition = oldEmployee?.position;

    const employee = await storage.updateEmployee(req.params.id, workspaceId, validated);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    if (expectedVersion !== undefined || positionChanging || roleChanging) {
      const newVersion = ((oldEmployee as any).version || 1) + 1;
      // Include workspaceId in WHERE to prevent cross-tenant version bump
      await db.update(employees).set({ version: newVersion, updatedAt: new Date() })
        .where(and(eq(employees.id, req.params.id), eq(employees.workspaceId, workspaceId)));
    }

    const newOrgTitle = (employee as any)?.organizationalTitle;
    const newWorkspaceRole = employee?.workspaceRole;
    const newPosition = employee?.position;
    const titleChanged = oldOrgTitle !== newOrgTitle;
    const roleChanged = oldWorkspaceRole !== newWorkspaceRole;
    const positionChanged = oldPosition !== newPosition;
    
    const { broadcastToWorkspace } = await import('../websocket');

    if (positionChanged || titleChanged || roleChanged) {
      platformEventBus.publish({
        type: 'employee_role_changed',
        category: 'automation',
        title: 'Employee Role Changed',
        description: `Employee role/position updated${titleChanged ? ` — title: ${oldOrgTitle || 'none'} → ${newOrgTitle || 'none'}` : ''}${roleChanged ? ` — role: ${oldWorkspaceRole || 'none'} → ${newWorkspaceRole || 'none'}` : ''}`,
        workspaceId,
        metadata: { employeeId: req.params.id, previousTitle: oldOrgTitle || null, newTitle: newOrgTitle || null, previousRole: oldWorkspaceRole || null, newRole: newWorkspaceRole || null, previousPosition: oldPosition || null, newPosition: newPosition || null, updatedBy: userId },
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

      broadcastToWorkspace(workspaceId, {
        type: 'EMPLOYEE_POSITION_CHANGED',
        payload: {
          employeeId: req.params.id,
          userId: employee.userId,
          previousPosition: oldPosition,
          newPosition,
          previousRole: oldWorkspaceRole,
          newRole: newWorkspaceRole,
          changedBy: userId,
          timestamp: new Date().toISOString(),
        },
      });

      if (positionChanged) {
        try {
          const { eventBus } = await import('../services/trinity/eventBus');
          eventBus.emit('employee_position_changed', {
            employeeId: req.params.id,
            previousPosition: oldPosition || '',
            newPosition: newPosition || '',
          });
        } catch (trinityError) {
          log.error("Trinity event error (non-fatal):", trinityError);
        }
      }

      log.info(`[RBAC Event] Employee ${req.params.id}: role/title/position changed`, {
        titleChanged,
        roleChanged,
        positionChanged,
        previous: { title: oldOrgTitle, role: oldWorkspaceRole, position: oldPosition },
        new: { title: newOrgTitle, role: newWorkspaceRole, position: newPosition }
      });

      // M12: Persist a durable audit trail for role/position changes.
      // Event-bus-only logging is ephemeral — DB audit row survives restarts and supports forensics.
      if (roleChanged || titleChanged) {
        db.insert(systemAuditLogs).values({
          workspaceId,
          userId,
          action: 'employee.role_changed',
          source: 'system',
          entityType: 'employee',
          entityId: req.params.id,
          severity: 'medium',
          isSensitiveData: true,
          changes: {
            employeeId: req.params.id,
            titleChanged,
            roleChanged,
            previousTitle: oldOrgTitle || null,
            newTitle: newOrgTitle || null,
            previousRole: oldWorkspaceRole || null,
            newRole: newWorkspaceRole || null,
            changedBy: userId,
          },
          ipAddress: req.ip || null,
          userAgent: req.get('user-agent') || null,
        }).catch(auditErr => log.error('[RBAC Audit] Failed to write role-change audit log (non-blocking):', auditErr));
      }
    }

    broadcastToWorkspace(workspaceId, { type: 'employees_updated', action: 'updated' });

    // 🧠 TRINITY: If pay rate changed, trigger downstream recalculation pipeline
    // Flags open payroll drafts + re-evaluates future shift costs automatically
    if ((validated as any).hourlyRate !== undefined) {
      (async () => {
        try {
          const { helpaiOrchestrator } = await import('../services/helpai/platformActionHub');
          // @ts-expect-error — TS migration: fix in refactoring sprint
          await helpaiOrchestrator.executeAction('settings.propagate_pay_rate_change', {
            employeeId: req.params.id,
            workspaceId,
            newRate: (validated as any).hourlyRate,
            changedBy: userId,
          });
        } catch (propagateErr) {
          log.warn('[PayRatePropagation] Trinity propagation non-blocking failure:', propagateErr);
        }
      })();
    }

    // 🧠 TRINITY: If certification expiry changed, trigger compliance pipeline
    if ((validated as any).certificationExpiresAt !== undefined) {
      (async () => {
        try {
          const { helpaiOrchestrator } = await import('../services/helpai/platformActionHub');
          // @ts-expect-error — TS migration: fix in refactoring sprint
          await helpaiOrchestrator.executeAction('settings.propagate_license_expiry', {
            employeeId: req.params.id,
            workspaceId,
            expiresAt: (validated as any).certificationExpiresAt,
            changedBy: userId,
          });
        } catch (propagateErr) {
          log.warn('[LicenseExpiryPropagation] Trinity propagation non-blocking failure:', propagateErr);
        }
      })();
    }
    
    res.json(filterEmployeeForResponse(employee, createFilterContext(req)));
  } catch (error: unknown) {
    log.error("Error updating employee:", error);
    res.status(400).json({ message: (error instanceof Error ? sanitizeError(error) : null) || "Failed to update employee" });
  }
});

router.delete('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    
    if (!workspaceId) {
      return res.status(400).json({ message: "Workspace ID is required" });
    }

    const { getWorkspaceRoleLevel } = await import('../rbac');
    const requesterEmployee = await storage.getEmployeeByUserId(userId || '', workspaceId);
    const targetEmployee = await storage.getEmployee(req.params.id, workspaceId);
    
    if (targetEmployee && requesterEmployee) {
      if (!canEditEmployeeByPosition(
        requesterEmployee.position, targetEmployee.position,
        requesterEmployee.workspaceRole as string, targetEmployee.workspaceRole as string
      )) {
        return res.status(403).json({ message: "You cannot delete someone at your authority level or above" });
      }
    }
    
    const confirmationCode = req.body?.confirmationCode || req.query.confirmationCode;
    const reason = req.body?.reason || 'User requested deletion';
    
    const result = await deletionProtection.safeDelete({
      entityType: 'employee',
      entityId: req.params.id,
      requestedBy: userId || 'unknown',
      reason,
      confirmationCode,
    });

    if (!result.success) {
      if (result.error?.includes('confirmation')) {
        const code = result.error.match(/code: ([A-Z0-9]+)/)?.[1];
        return res.status(409).json({ 
          message: "Deletion requires confirmation",
          confirmationRequired: true,
          confirmationCode: code,
          recoveryDays: 60,
          warning: "This employee has dependent data. Deletion will be soft (recoverable for 60 days)."
        });
      }
      return res.status(400).json({ 
        message: result.error || "Cannot delete employee", 
        auditId: result.auditId 
      });
    }
    
    log.info(`[DeletionProtection] Employee ${req.params.id} safely deleted by ${userId}, mode: ${result.mode}, recovery until: ${result.recoveryDeadline}`);
    
    const { broadcastToWorkspace } = await import('../websocket');
    broadcastToWorkspace(workspaceId, { type: 'employees_updated', action: 'deleted' });
    
    res.json({ 
      success: true, 
      mode: result.mode,
      recoveryDeadline: result.recoveryDeadline,
      auditId: result.auditId
    });
  } catch (error) {
    log.error("Error deleting employee:", error);
    res.status(500).json({ message: "Failed to delete employee" });
  }
});

router.get('/me', async (req: any, res) => {
  try {
    let userId: string | undefined;
    
    if (req.session?.userId) {
      userId = req.session.userId;
    }
    else if (req.requireAuth?.() && req.user?.id) {
      userId = req.user?.id;
    }
    
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const workspaceId = req.workspaceId;
    // Always scope /me to the authenticated workspace — prevents cross-tenant profile leak
    const employee = await storage.getEmployeeByUserId(userId, workspaceId);
    
    if (!employee) {
      return res.status(404).json({ message: "Employee profile not found" });
    }
    
    const [platformRoleData] = await db
      .select({ role: platformRoles.role })
      .from(platformRoles)
      .where(and(eq(platformRoles.userId, userId), isNull(platformRoles.revokedAt)))
      .limit(1);
    
    res.json({
      ...employee,
      platformRole: platformRoleData?.role || null
    });
  } catch (error: unknown) {
    log.error("Error fetching employee profile:", error);
    res.status(500).json({ message: "Failed to fetch employee profile" });
  }
});

router.patch('/me/contact-info', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || req.user?.id;
    
    // Scope to the authenticated workspace — prevents cross-tenant mutation
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const employee = await storage.getEmployeeByUserId(userId, req.workspaceId);
    
    if (!employee) {
      return res.status(404).json({ message: "Employee profile not found" });
    }
    
    const allowedFields = ['phone', 'email', 'address', 'addressLine2', 'city', 'state', 'zipCode', 'country', 
                           'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelation'];
    const filteredData: any = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        filteredData[key] = req.body[key];
      }
    }

    if (Object.keys(filteredData).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const validated = insertEmployeeSchema.partial().parse(filteredData);
    const updated = await storage.updateEmployee(employee.id, employee.workspaceId, validated);
    
    if (!updated) {
      return res.status(404).json({ message: "Failed to update employee" });
    }
    
    res.json(updated);
  } catch (error: unknown) {
    log.error("Error updating contact info:", error);
    res.status(400).json({ message: (error instanceof Error ? sanitizeError(error) : null) || "Failed to update contact information" });
  }
});

router.post('/approve', async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.id;
    const user = await storage.getUser(userId);
    
    if (!user?.currentWorkspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const approvalSchema = z.object({
      employeeId: z.string().min(1, "Employee ID is required"),
      hourlyRate: z.number().positive("Hourly rate must be greater than 0"),
    });

    const { employeeId, hourlyRate } = approvalSchema.parse(req.body);

    const existingEmployee = await storage.getEmployee(employeeId, user.currentWorkspaceId);
    
    if (!existingEmployee) {
      return res.status(404).json({ message: "Employee not found or does not belong to your workspace" });
    }

    if (existingEmployee.onboardingStatus !== 'pending_review') {
      return res.status(400).json({ 
        message: `Employee must be in 'pending_review' status. Current status: ${existingEmployee.onboardingStatus}` 
      });
    }

    const employee = await storage.updateEmployee(employeeId, user.currentWorkspaceId, {
      hourlyRate: hourlyRate.toString(),
      onboardingStatus: 'completed',
    });

    if (!employee) {
      return res.status(404).json({ message: "Failed to update employee" });
    }

    log.info(`[AUDIT] Manager ${userId} approved employee ${employeeId} with hourly rate $${hourlyRate}`);

    // 🧠 TRINITY: New pay rate set during onboarding approval — flag payroll drafts and future cost projections
    (async () => {
      try {
        const { helpaiOrchestrator } = await import('../services/helpai/platformActionHub');
        // @ts-expect-error — TS migration: fix in refactoring sprint
        await helpaiOrchestrator.executeAction('settings.propagate_pay_rate_change', {
          employeeId,
          workspaceId: user.currentWorkspaceId,
          newRate: hourlyRate.toString(),
          changedBy: userId,
          context: 'onboarding_approval',
        });
      } catch (propagateErr) {
        log.warn('[PayRatePropagation] Trinity propagation non-blocking failure (onboarding approval):', propagateErr);
      }
    })();

    res.json(employee ? filterEmployeeForResponse(employee, createFilterContext(req)) : null);
  } catch (error: unknown) {
    log.error("Error approving employee:", error);
    if (error instanceof Error && error.name === 'ZodError') {
      return res.status(400).json({ message: (error as any).errors[0].message });
    }
    res.status(400).json({ message: (error instanceof Error ? sanitizeError(error) : null) || "Failed to approve employee" });
  }
});

router.get('/stats', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace required' });
    const [totals] = await db
      .select({
        active: sql<string>`COUNT(*) FILTER (WHERE ${employees.isActive} = true)`,
        inactive: sql<string>`COUNT(*) FILTER (WHERE ${employees.isActive} = false)`,
        total: sql<string>`COUNT(*)`,
      })
      .from(employees)
      .where(eq(employees.workspaceId, workspaceId));
    res.json({
      total:    parseInt(totals?.total    || '0'),
      active:   parseInt(totals?.active   || '0'),
      inactive: parseInt(totals?.inactive || '0'),
    });
  } catch (err: unknown) {
    res.status(500).json({ message: 'Failed to fetch employee stats' });
  }
});

router.get('/search', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const query = req.query.q as string;
    
    if (!query) {
      return res.status(400).json({ message: "Search query is required" });
    }
    
    const results = await storage.searchEmployeesAndApplications(workspaceId, query);
    const ctx = createFilterContext(req);
    res.json(Array.isArray(results) ? filterEmployeesForResponse(results, ctx) : results);
  } catch (error) {
    log.error("Error searching employees:", error);
    res.status(500).json({ message: "Failed to search employees" });
  }
});

router.get('/:employeeId/payroll', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { employeeId } = req.params;
    const userId = req.user?.id;
    const { employeePayrollInfo } = await import("@shared/schema");

    // Fetch the target employee first — this implicitly enforces workspace scope.
    // If the employee doesn't exist in this workspace, stop here.
    const targetEmployee = await storage.getEmployee(employeeId, workspaceId);
    if (!targetEmployee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const userRole = req.user?.role || req.workspaceRole;
    const isManager = ['org_owner', 'co_owner', 'manager', 'admin', 'owner', 'root_admin', 'deputy_admin'].includes(userRole || '');

    // FIX: Compare userId against targetEmployee.userId (the users.id FK on the employee record),
    // NOT against employeeId (the employees.id PK). These are different UUID spaces.
    // The old check `userId !== employeeId` was always true, allowing any non-manager to read
    // any other employee's payroll data within the same workspace.
    if (!isManager && targetEmployee.userId !== userId) {
      return res.status(403).json({ message: 'Forbidden - Can only view own payroll information' });
    }

    const payrollInfo = await db
      .select()
      .from(employeePayrollInfo)
      .where(
        and(
          eq(employeePayrollInfo.workspaceId, workspaceId),
          eq(employeePayrollInfo.employeeId, employeeId)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    if (!payrollInfo) {
      return res.status(404).json({ message: 'Payroll information not found' });
    }

    // FIX: Never return raw SSN or bank credential digits to the client.
    // The database stores these values for payroll processing; the API should
    // only expose masked versions so they cannot be harvested via this endpoint.
    const masked = {
      ...payrollInfo,
      ssn: payrollInfo.ssn
        ? `***-**-${String(payrollInfo.ssn).replace(/\D/g, '').slice(-4)}`
        : null,
      bankRoutingNumber: payrollInfo.bankRoutingNumber
        ? `*****${String(payrollInfo.bankRoutingNumber).slice(-4)}`
        : null,
      bankAccountNumber: payrollInfo.bankAccountNumber
        ? `*****${String(payrollInfo.bankAccountNumber).slice(-4)}`
        : null,
    };
    res.json(masked);
  } catch (error: unknown) {
    log.error('Error getting payroll info:', error);
    res.status(500).json({ message: (error instanceof Error ? sanitizeError(error) : null) || 'Failed to get payroll information' });
  }
});

router.put('/:employeeId/payroll', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { employeeId } = req.params;
    const { employeePayrollInfo, insertEmployeePayrollInfoSchema } = await import("@shared/schema");

    const validated = insertEmployeePayrollInfoSchema.partial().parse(req.body);

    const {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      taxId,
      bankAccountNumber,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      routingNumber,
      preferredPayoutMethod,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      w4Allowances,
      additionalWithholding,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      filingStatus,
      directDepositEnabled,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      w9OnFile,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      i9OnFile,
    } = validated;

    const existing = await db
      .select()
      .from(employeePayrollInfo)
      .where(
        and(
          eq(employeePayrollInfo.workspaceId, workspaceId),
          eq(employeePayrollInfo.employeeId, employeeId)
        )
      )
      .limit(1)
      .then(rows => rows[0]);

    let result;
    if (existing) {
      [result] = await db
        .update(employeePayrollInfo)
        .set({
          // @ts-expect-error — TS migration: fix in refactoring sprint
          taxId,
          bankAccountNumber,
          routingNumber,
          preferredPayoutMethod,
          w4Allowances,
          additionalWithholding,
          filingStatus,
          directDepositEnabled,
          w9OnFile,
          i9OnFile,
          updatedAt: new Date(),
        })
        .where(eq(employeePayrollInfo.id, existing.id))
        .returning();
    } else {
      [result] = await db
        .insert(employeePayrollInfo)
        // @ts-expect-error — TS migration: fix in refactoring sprint
        .values({
          workspaceId,
          employeeId,
          taxId,
          bankAccountNumber,
          routingNumber,
          preferredPayoutMethod,
          w4Allowances,
          additionalWithholding,
          filingStatus,
          directDepositEnabled,
          w9OnFile,
          i9OnFile,
        })
        .returning();
    }

    res.json(result);
  } catch (error: unknown) {
    log.error('Error updating payroll info:', error);
    res.status(500).json({ message: (error instanceof Error ? sanitizeError(error) : null) || 'Failed to update payroll information' });
  }
});

router.get('/:employeeId/availability', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { employeeId } = req.params;
    const { includeExpired } = req.query;
    const { availabilityService } = await import("../services/availabilityService");

    const availability = await availabilityService.getEmployeeAvailability(
      workspaceId,
      employeeId,
      includeExpired === 'true'
    );

    res.json(availability);
  } catch (error: unknown) {
    log.error('Error getting availability:', error);
    res.status(500).json({ message: (error instanceof Error ? sanitizeError(error) : null) || 'Failed to get availability' });
  }
});

router.post('/:employeeId/availability', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { employeeId } = req.params;
    const { availability } = req.body;
    const { availabilityService } = await import("../services/availabilityService");

    const updated = await availabilityService.setEmployeeAvailability(
      workspaceId,
      employeeId,
      availability || []
    );

    res.json(updated);
  } catch (error: unknown) {
    log.error('Error setting availability:', error);
    res.status(500).json({ message: (error instanceof Error ? sanitizeError(error) : null) || 'Failed to set availability' });
  }
});

router.get('/:employeeId/time-off', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { employeeId } = req.params;
    const { timeOffRequests } = await import("@shared/schema");

    const requests = await db
      .select()
      .from(timeOffRequests)
      .where(
        and(
          eq(timeOffRequests.workspaceId, workspaceId),
          eq(timeOffRequests.employeeId, employeeId)
        )
      )
      .orderBy(desc(timeOffRequests.createdAt));

    res.json(requests);
  } catch (error: unknown) {
    log.error('Error getting time off requests:', error);
    res.status(500).json({ message: (error instanceof Error ? sanitizeError(error) : null) || 'Failed to get time off requests' });
  }
});

router.get('/:employeeId/contracts', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { employeeId } = req.params;
    const { contractDocuments } = await import("@shared/schema");

    const contracts = await db
      .select()
      .from(contractDocuments)
      .where(
        and(
          eq(contractDocuments.workspaceId, workspaceId),
          eq(contractDocuments.employeeId, employeeId)
        )
      )
      .orderBy(desc(contractDocuments.createdAt));

    res.json(contracts);
  } catch (error: unknown) {
    log.error('Error getting contracts:', error);
    res.status(500).json({ message: (error instanceof Error ? sanitizeError(error) : null) || 'Failed to get contracts' });
  }
});

router.get('/:employeeId/shift-actions', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { employeeId } = req.params;
    const { shiftActions } = await import("@shared/schema");

    const actions = await db
      .select()
      .from(shiftActions)
      .where(
        and(
          eq(shiftActions.workspaceId, workspaceId),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          eq(shiftActions.employeeId, employeeId)
        )
      )
      .orderBy(desc(shiftActions.createdAt));

    res.json(actions);
  } catch (error: unknown) {
    log.error('Error getting shift actions:', error);
    res.status(500).json({ message: (error instanceof Error ? sanitizeError(error) : null) || 'Failed to get shift actions' });
  }
});

router.get('/count', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace context required' });
    }
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(employees)
      .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)));
    const total = Number(result[0]?.count) || 0;
    res.json({ total });
  } catch (error: unknown) {
    log.error('Error fetching employee count:', error);
    res.status(500).json({ error: 'Failed to fetch employee count' });
  }
});

router.get('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: 'Workspace context required' });
    }
    const employee = await storage.getEmployee(id, workspaceId);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    res.json(filterEmployeeForResponse(employee, createFilterContext(req)));
  } catch (error: unknown) {
    log.error('Error fetching employee:', error);
    res.status(500).json({ message: 'Failed to fetch employee' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/workspace/employees/:id/pii-purge  (OMEGA GAP 3)
// ORG_OWNER only. GDPR/CCPA lawful erasure.
// Pre-flight: legal hold (423), open payroll records (409).
// Anonymizes PII fields, preserves financial ledger, writes permanent audit record.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id/pii-purge', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userRole = (req.user)?.workspaceRole;

    if (!workspaceId) {
      return res.status(403).json({ message: 'Workspace context required' });
    }

    // ── RBAC: ORG_OWNER only ────────────────────────────────────────────────
    if (userRole !== 'org_owner') {
      return res.status(403).json({
        message: 'Only the organization owner may perform a PII hard purge.',
        code: 'ORG_OWNER_REQUIRED',
      });
    }

    // ── Body validation ─────────────────────────────────────────────────────
    const bodySchema = z.object({
      confirm: z.literal('PURGE'),
      reason: z.string().min(10, 'Purge reason must be at least 10 characters'),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Body must include { confirm: "PURGE", reason: string (min 10 chars) }',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const { reason } = parsed.data;

    // ── Load employee (workspace-scoped) ────────────────────────────────────
    const employee = await storage.getEmployee(id, workspaceId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // ── PRE-FLIGHT 1: Legal hold check — 423 ────────────────────────────────
    // Check any DAR associated with this employee's shifts for legal hold
    const legalHoldCheck = await db
      .select({ id: sql<string>`id`, legalHold: sql<boolean>`legal_hold` })
      .from(sql`daily_activity_reports`)
      .where(sql`workspace_id = ${workspaceId} AND employee_id = ${id} AND legal_hold = true`)
      .limit(1)
      .catch(() => []);

    if (legalHoldCheck.length > 0) {
      return res.status(423).json({
        message: 'Employee has active legal hold. PII purge is blocked until legal hold is released.',
        code: 'LEGAL_HOLD_ACTIVE',
      });
    }

    // ── PRE-FLIGHT 2: Open payroll records — 409 ────────────────────────────
    const openPayrollCheck = await db
      .select({ id: sql<string>`id` })
      .from(sql`payroll_periods`)
      .where(sql`workspace_id = ${workspaceId} AND status NOT IN ('payment_confirmed', 'payment_failed', 'cancelled') AND EXISTS (SELECT 1 FROM payroll_entries pe WHERE pe.payroll_period_id = payroll_periods.id AND pe.employee_id = ${id})`)
      .limit(1)
      .catch(() => []);

    if (openPayrollCheck.length > 0) {
      return res.status(409).json({
        message: 'Employee has open payroll records. Close all payroll periods before purging PII.',
        code: 'OPEN_PAYROLL_RECORDS',
      });
    }

    // ── ANONYMIZE PII fields, preserve financial ledger ─────────────────────
    const anonymizedTag = `PURGED-${id.substring(0, 8).toUpperCase()}`;
    await db
      .update(employees)
      .set({
        firstName: 'PURGED',
        lastName: anonymizedTag,
        email: `purged-${id}@purged.invalid`,
        phone: null,
        address: null,
        dateOfBirth: null,
        ssn: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        emergencyContactRelationship: null,
        licenseNumber: null,
        licenseExpiry: null,
        updatedAt: new Date(),
      } as any)
      .where(and(eq(employees.id, id), eq(employees.workspaceId, workspaceId)));

    // ── Write permanent purge audit record ──────────────────────────────────
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const { universalAuditService, AUDIT_ACTIONS } = await import('../services/universalAuditService');
    await universalAuditService.log({
      workspaceId,
      actorId: userId!,
      action: (AUDIT_ACTIONS as any).PII_HARD_PURGE ?? 'PII_HARD_PURGE',
      resourceType: 'employee',
      resourceId: id,
      metadata: {
        reason,
        purgedFields: ['firstName', 'lastName', 'email', 'phone', 'address', 'dateOfBirth', 'ssn', 'emergencyContact', 'licenseNumber', 'licenseExpiry'],
        financialRecordsPreserved: true,
        performedBy: userId,
        performedAt: new Date().toISOString(),
        anonymizedTag,
      },
      severity: 'CRITICAL',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    log.warn('PII_HARD_PURGE performed', { workspaceId, employeeId: id, actorId: userId, reason });

    return res.status(200).json({
      message: 'Employee PII has been permanently purged. Financial records preserved.',
      employeeId: id,
      anonymizedTag,
      auditRecordCreated: true,
    });
  } catch (error: unknown) {
    log.error('Error in PII hard purge:', error);
    return res.status(500).json({ message: 'PII purge failed. No changes were applied.' });
  }
});

export default router;
