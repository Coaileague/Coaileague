import { sanitizeError } from '../middleware/errorHandler';
import { validatePayRate, canAssignRole, requiresOwnerToAssign, OWNER_ASSIGN_MIN_LEVEL, businessRuleResponse } from '../lib/businessRules';
import { WORKSPACE_ROLE_HIERARCHY } from '../lib/rbac/roleDefinitions';
import { Router } from "express";
import multer from "multer";
import { storage } from "../storage";
import { trimStrings } from "../utils/sanitize";
import { db } from "../db";
import {
  employees,
  employeeDocuments,
  users,
  workspaces,
  platformRoles,
  insertEmployeeSchema,
  systemAuditLogs,
} from "@shared/schema";
import { objectStorageClient, parseObjectPath } from "../objectStorage";
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

// ── Financial-field strip for employee responses ──────────────────────────────
// Backed by the existing sensitiveFieldFilter utility; this thin wrapper keeps
// the name-based access-model explicit at the route layer.
const FINANCIAL_FIELDS_SENSITIVE = [
  'hourlyRate', 'billRate', 'payRate', 'overtimeRate', 'salaryAmount',
  'taxWithholdingInfo', 'bankAccountInfo', 'socialSecurityNumber',
  'directDepositAccount',
] as const;

function stripFinancialFields(
  employee: Record<string, unknown>,
  callerRole: string,
  callerPlatformRole: string,
  callerUserId: string,
): Record<string, unknown> {
  if (!employee) return employee;
  const isOwnerLevel = ['org_owner', 'co_owner'].includes(callerRole);
  const isPlatformStaff = ['root_admin', 'deputy_admin', 'sysop',
    'support_manager', 'support_agent', 'compliance_officer'].includes(callerPlatformRole);
  const isSelf = employee.userId === callerUserId;
  if (isOwnerLevel || isPlatformStaff || isSelf) return employee;
  const sanitized = { ...employee };
  for (const field of FINANCIAL_FIELDS_SENSITIVE) {
    delete (sanitized as any)[field];
  }
  return sanitized;
}

// ── S10: MANAGER GUARD-CARD VERIFICATION ─────────────────────────────────────
// Manager flips guardCardVerified=true after physically confirming the
// uploaded card matches the officer's name + license number. Emits a Trinity
// event so the compliance engine clears any "unverified guard card" flag and
// the officer becomes eligible for armed/armed-site shifts (combined with
// S8's employees.is_armed check).
// ── TOPS Screenshot Verification Upload ────────────────────────────────────
// POST /:employeeId/tops-verification
// Officer or manager/owner uploads a TOPS screenshot; Trinity vision verifies
// the screenshot and sets the employee's guardCardStatus tier.
const topsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

// ── Background Check Record ────────────────────────────────────────────────
// POST /:employeeId/background-check — manager/owner records a completed check

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
    const userId = req.user?.id;
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

    // ── S5: REQUIRE MANAGER+ TO CREATE EMPLOYEES ───────────────────────────
    // Previously the only gates were requireAuth + ensureWorkspaceAccess at
    // the mount. That let any authenticated user (officer, supervisor)
    // create employees. Platform staff still bypass via platform role.
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    {
      const { hasManagerAccess: _hasManagerAccess } = await import('../rbac');
      const platRole = req.platformRole || await getUserPlatformRole(userId);
      const isPlatformStaff = !!platRole && platRole !== 'none';
      if (!isPlatformStaff) {
        const requesterEmployee = await storage.getEmployeeByUserId(userId, workspaceId);
        if (!_hasManagerAccess(requesterEmployee?.workspaceRole as string)) {
          return res.status(403).json({ message: 'Only managers and owners can create employees' });
        }
      }
    }
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

    // ── S2: EMPLOYEE NUMBER GENERATION ─────────────────────────────────────
    // Direct POST /api/employees skipped employee_number generation — only
    // the onboarding-invite-accept path called generateEmployeeNumber. That
    // left manager-created records with NULL employee_number (orphan IDs
    // unusable for clock-in, PIN verify, reports). Generate here so every
    // create-path produces a canonical number.
    if (!validatedData.employeeNumber) {
      try {
        const generatedNumber = await storage.generateEmployeeNumber(workspaceId);
        validatedData.employeeNumber = generatedNumber;
      } catch (numErr: unknown) {
        log.warn('[EmployeeRoutes] generateEmployeeNumber failed (non-blocking):', (numErr as any)?.message || String(numErr));
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

    // Platform email is provisioned by the system and locked — only support roles can change it.
    if (updateData.platformEmail !== undefined) {
      const platRole = req.platformRole || await getUserPlatformRole(userId || '');
      const isSupportRole = ['root_admin', 'sysop', 'support_manager'].includes(platRole || '');
      if (!isSupportRole) {
        return res.status(403).json({
          message: 'Platform email addresses can only be changed by support. Contact support@coaileague.com.',
        });
      }
    }

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
    const employee = await storage.getEmployeeByUserId(userId, req.workspaceId);

    if (!employee) {
      return res.status(404).json({ message: "Employee profile not found" });
    }

    // ── S3: BLOCK UNVERIFIED EMAIL SELF-EDIT ───────────────────────────────
    // Email is an identity field. Changing it without re-verification is an
    // account-takeover vector. Route callers to the verified-change flow
    // instead of silently persisting.
    if (req.body.email !== undefined && req.body.email !== employee.email) {
      return res.status(403).json({
        error: 'EMAIL_CHANGE_REQUIRES_VERIFICATION',
        message: 'Email changes require verification. Use POST /api/auth/request-email-change to start the flow.',
      });
    }

    // ── S3: allowedFields no longer includes 'email' ───────────────────────
    const allowedFields = ['phone', 'address', 'addressLine2', 'city', 'state', 'zipCode', 'country',
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

    // ── S11: phone sync to users.phone when user is linked ─────────────────
    // The parallel route PATCH /api/auth/profile already syncs phone both
    // ways. This route didn't, leaving users.phone stale. Keep the two
    // tables in step when the employee has a linked user account.
    if (employee.userId && Object.prototype.hasOwnProperty.call(filteredData, 'phone')) {
      try {
        const trimmedPhone = typeof filteredData.phone === 'string' ? filteredData.phone.trim() : filteredData.phone;
        await storage.updateUser(employee.userId, { phone: trimmedPhone ?? null });
      } catch (userSyncErr: unknown) {
        log.warn('[EmployeeRoutes] users.phone sync from /me/contact-info failed (non-blocking):', (userSyncErr as any)?.message || String(userSyncErr));
      }
    }

    res.json(updated);
  } catch (error: unknown) {
    log.error("Error updating contact info:", error);
    res.status(400).json({ message: (error instanceof Error ? sanitizeError(error) : null) || "Failed to update contact information" });
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
// Phase 4 — GET /api/employees/my/career-score
// Self-service career score for the currently authenticated employee.
// Returns the cross-tenant coaileague score plus active disciplinary counts
// so HelpAI can answer "what's my score" by SMS / chat.
export default router;
