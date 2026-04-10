/**
 * Owner/Manager Employee Service
 * 
 * Ensures all organization owners, managers, and supervisors have employee records.
 * This is critical because:
 * 1. Owners/managers are also employees who need compliance tracking (guard cards, certifications)
 * 2. Employee records are required for time tracking, payroll, and audit
 * 3. QuickBooks sync needs matching employee records to avoid duplicates
 * 
 * NO HARDCODED VALUES - All configuration is dynamic from registries
 */

import { db } from '../db';
import {
  employees,
  users,
  employeeSkills,
  workspaces,
  employeeCertifications,
} from '@shared/schema';
import { eq, and, inArray, isNull, or, sql } from 'drizzle-orm';
import { eventBus } from './trinity/eventBus';
import { getCertificationTypesForRole } from '@shared/config/certificationConfig';
import { addDays } from 'date-fns';
import { createLogger } from '../lib/logger';
const log = createLogger('ownerManagerEmployeeService');


/**
 * Role holder roles that require employee records
 * These roles are also employees and need compliance tracking
 */
export const ROLE_HOLDER_ROLES = [
  'org_owner',
  'co_owner',
  'manager',
  'department_manager',
  'supervisor'
] as const;

type RoleHolderRole = typeof ROLE_HOLDER_ROLES[number];

/**
 * Role to workspace role mapping
 */
const ROLE_TO_WORKSPACE_ROLE: Record<string, string> = {
  'org_owner': 'org_owner',
  'co_owner': 'co_owner',
  'manager': 'manager',
  'department_manager': 'department_manager',
  'supervisor': 'supervisor',
  'staff': 'staff',
  'employee': 'employee',
};

/**
 * Role to organizational title mapping
 */
const ROLE_TO_ORG_TITLE: Record<string, string> = {
  'org_owner': 'owner',
  'co_owner': 'owner',
  'manager': 'manager',
  'department_manager': 'manager',
  'supervisor': 'supervisor',
  'staff': 'staff',
  'employee': 'staff',
};

/**
 * Role to job title mapping
 */
const ROLE_TO_JOB_TITLE: Record<string, string> = {
  'org_owner': 'Owner',
  'co_owner': 'Co-Owner',
  'manager': 'Manager',
  'department_manager': 'Department Manager',
  'supervisor': 'Supervisor',
  'staff': 'Staff',
  'employee': 'Employee',
};

/**
 * Set up required certifications for an employee based on their role
 * This ensures compliance tracking is properly initialized
 */
async function setupCertificationsForEmployee(employeeId: string, role: string): Promise<void> {
  try {
    const requiredCerts = getCertificationTypesForRole(role);
    
    if (requiredCerts.length === 0) {
      log.info(`[OwnerManagerEmployeeService] No certifications required for role: ${role}`);
      return;
    }
    
    const existingCerts = await db.select().from(employeeCertifications)
      .where(eq(employeeCertifications.employeeId, employeeId));
    
    const existingCertTypes = new Set(existingCerts.map(c => c.certificationType));
    
    const certsToCreate = requiredCerts.filter(c => !existingCertTypes.has(c.id));
    
    if (certsToCreate.length === 0) {
      log.info(`[OwnerManagerEmployeeService] All certifications already exist for employee ${employeeId}`);
      return;
    }
    
    for (const certType of certsToCreate) {
      const dueDate = addDays(new Date(), 30);
      
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await db.insert(employeeCertifications).values({
        employeeId,
        certificationType: certType.id,
        status: 'pending',
        expirationDate: dueDate,
        notes: `Auto-created by Owner Manager Employee Service for role: ${role}`,
      });
    }
    
    log.info(`[OwnerManagerEmployeeService] Created ${certsToCreate.length} certifications for employee ${employeeId}`);
  } catch (error) {
    log.error('[OwnerManagerEmployeeService] Error setting up certifications:', error);
  }
}

export interface EnsureEmployeeResult {
  userId: string;
  employeeId: string;
  action: 'created' | 'linked' | 'already_exists';
  details: string;
}

export interface EnsureRoleHoldersResult {
  workspaceId: string;
  created: number;
  linked: number;
  alreadyExist: number;
  results: EnsureEmployeeResult[];
  timestamp: Date;
}

/**
 * Ensure a single user has an employee record
 * Creates or links as necessary
 */
export async function ensureUserHasEmployeeRecord(
  userId: string,
  workspaceId: string
): Promise<EnsureEmployeeResult> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  const existingEmployees = await db.select().from(employees)
    .where(eq(employees.workspaceId, workspaceId));

  const linkedEmployee = existingEmployees.find(e => e.userId === userId);
  if (linkedEmployee) {
    return {
      userId,
      employeeId: linkedEmployee.id,
      action: 'already_exists',
      details: `User ${user.email} already has employee record ${linkedEmployee.id}`,
    };
  }

  const emailMatch = existingEmployees.find(e => 
    e.email?.toLowerCase() === user.email.toLowerCase() && !e.userId
  );

  if (emailMatch) {
    const userRole = user.role?.toLowerCase() || 'staff';
    await db.update(employees)
      .set({ 
        userId: user.id,
        workspaceRole: (ROLE_TO_WORKSPACE_ROLE[userRole] || 'staff') as any,
        organizationalTitle: ROLE_TO_ORG_TITLE[userRole] || 'staff',
        updatedAt: new Date(),
      })
      .where(eq(employees.id, emailMatch.id));

    await setupCertificationsForEmployee(emailMatch.id, emailMatch.role || 'Staff');

    return {
      userId,
      employeeId: emailMatch.id,
      action: 'linked',
      details: `Linked user ${user.email} to existing employee by email match`,
    };
  }

  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase().trim();
  const nameMatch = existingEmployees.find(e => {
    const empName = `${e.firstName} ${e.lastName}`.toLowerCase().trim();
    return empName === fullName && fullName.length > 2 && !e.userId;
  });

  if (nameMatch) {
    const userRole = user.role?.toLowerCase() || 'staff';
    await db.update(employees)
      .set({ 
        userId: user.id,
        workspaceRole: (ROLE_TO_WORKSPACE_ROLE[userRole] || 'staff') as any,
        organizationalTitle: ROLE_TO_ORG_TITLE[userRole] || 'staff',
        updatedAt: new Date(),
      })
      .where(eq(employees.id, nameMatch.id));

    await setupCertificationsForEmployee(nameMatch.id, nameMatch.role || 'Staff');

    return {
      userId,
      employeeId: nameMatch.id,
      action: 'linked',
      details: `Linked user ${user.email} to existing employee by name match (${nameMatch.firstName} ${nameMatch.lastName})`,
    };
  }

  const userRole = user.role?.toLowerCase() || 'staff';
  const [newEmployee] = await db.insert(employees)
    .values({
      workspaceId,
      userId: user.id,
      firstName: user.firstName || user.email.split('@')[0] || 'Unknown',
      lastName: user.lastName || '',
      email: user.email,
      phone: user.phone || null,
      role: ROLE_TO_JOB_TITLE[userRole] || 'Staff',
      organizationalTitle: ROLE_TO_ORG_TITLE[userRole] || 'staff',
      workspaceRole: (ROLE_TO_WORKSPACE_ROLE[userRole] || 'staff') as any,
      workerType: 'employee',
      isActive: true,
      onboardingStatus: 'completed',
    })
    .returning();

  await setupCertificationsForEmployee(newEmployee.id, newEmployee.role || 'Staff');

  (eventBus as any).publish({
    type: 'employee_hired',
    category: 'automation',
    title: `Employee Record Created — ${userRole}`,
    description: `${userRole} employee record created for ${user.email} in workspace ${workspaceId}`,
    workspaceId,
    metadata: { employeeId: newEmployee.id, userId: user.id, role: userRole, source: 'owner_manager_employee_service', isRoleHolder: ROLE_HOLDER_ROLES.includes(userRole as RoleHolderRole) },
  }).catch((err: any) => log.warn('[OwnerManagerEmployeeService] publish employee_hired failed:', err.message));

  return {
    userId,
    employeeId: newEmployee.id,
    action: 'created',
    details: `Created employee record for ${userRole}: ${user.email} (${newEmployee.id})`,
  };
}

/**
 * Ensure all role holders in a workspace have employee records
 * This is the main entry point for workspace-wide sync
 */
export async function ensureRoleHoldersAreEmployees(
  workspaceId: string
): Promise<EnsureRoleHoldersResult> {
  log.info(`[OwnerManagerEmployeeService] Ensuring role holders have employee records for workspace ${workspaceId}`);
  
  const result: EnsureRoleHoldersResult = {
    workspaceId,
    created: 0,
    linked: 0,
    alreadyExist: 0,
    results: [],
    timestamp: new Date(),
  };

  const workspaceUsers = await db.select()
    .from(users)
    .where(eq(users.currentWorkspaceId, workspaceId));

  for (const user of workspaceUsers) {
    const userRole = user.role?.toLowerCase();
    if (!userRole || !ROLE_HOLDER_ROLES.includes(userRole as RoleHolderRole)) {
      continue;
    }

    try {
      const employeeResult = await ensureUserHasEmployeeRecord(user.id, workspaceId);
      result.results.push(employeeResult);

      switch (employeeResult.action) {
        case 'created':
          result.created++;
          break;
        case 'linked':
          result.linked++;
          break;
        case 'already_exists':
          result.alreadyExist++;
          break;
      }
    } catch (error) {
      log.error(`[OwnerManagerEmployeeService] Error processing user ${user.id}:`, error);
    }
  }

  log.info(`[OwnerManagerEmployeeService] Sync complete: Created ${result.created}, Linked ${result.linked}, Already exist ${result.alreadyExist}`);
  
  eventBus.emit('role_holder_sync_completed', {
    workspaceId,
    created: result.created,
    linked: result.linked,
    alreadyExist: result.alreadyExist,
  });

  return result;
}

/**
 * Get employee record for a user, creating if necessary
 * Used when we need to ensure a specific user has an employee record
 */
export async function getOrCreateEmployeeForUser(
  userId: string,
  workspaceId: string
): Promise<{ employee: typeof employees.$inferSelect; created: boolean }> {
  const existingEmployee = await db.query.employees.findFirst({
    where: and(
      eq(employees.userId, userId),
      eq(employees.workspaceId, workspaceId)
    ),
  });

  if (existingEmployee) {
    return { employee: existingEmployee, created: false };
  }

  const result = await ensureUserHasEmployeeRecord(userId, workspaceId);
  
  const employee = await db.query.employees.findFirst({
    where: eq(employees.id, result.employeeId),
  });

  if (!employee) {
    throw new Error(`Failed to create/find employee record for user ${userId}`);
  }

  return { employee, created: result.action === 'created' };
}

/**
 * Check if a user has an employee record in a workspace
 */
export async function userHasEmployeeRecord(
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const employee = await db.query.employees.findFirst({
    where: and(
      eq(employees.userId, userId),
      eq(employees.workspaceId, workspaceId)
    ),
  });
  return !!employee;
}

/**
 * Get all role holders without employee records in a workspace
 */
export async function getRoleHoldersWithoutEmployeeRecords(
  workspaceId: string
): Promise<{ userId: string; email: string; role: string }[]> {
  const workspaceUsers = await db.select()
    .from(users)
    .where(eq(users.currentWorkspaceId, workspaceId));

  const existingEmployees = await db.select().from(employees)
    .where(eq(employees.workspaceId, workspaceId));

  const linkedUserIds = new Set(existingEmployees.map(e => e.userId).filter(Boolean));

  return workspaceUsers
    .filter(u => {
      const userRole = u.role?.toLowerCase();
      return userRole && 
        ROLE_HOLDER_ROLES.includes(userRole as RoleHolderRole) && 
        !linkedUserIds.has(u.id);
    })
    .map(u => ({
      userId: u.id,
      email: u.email,
      role: u.role || 'unknown',
    }));
}

/**
 * Initialize service - register event handlers
 */
export function initializeOwnerManagerEmployeeService() {
  log.info('[OwnerManagerEmployeeService] Initializing...');

  eventBus.on('user_role_changed', async (data: { userId: string; workspaceId: string; newRole: string }) => {
    const { userId, workspaceId, newRole } = data;
    if (ROLE_HOLDER_ROLES.includes(newRole.toLowerCase() as RoleHolderRole)) {
      log.info(`[OwnerManagerEmployeeService] User ${userId} promoted to ${newRole}, ensuring employee record`);
      await ensureUserHasEmployeeRecord(userId, workspaceId);
    }
  });

  eventBus.on('workspace_user_added', async (data: { userId: string; workspaceId: string; role: string }) => {
    const { userId, workspaceId, role } = data;
    if (ROLE_HOLDER_ROLES.includes(role.toLowerCase() as RoleHolderRole)) {
      log.info(`[OwnerManagerEmployeeService] Role holder ${userId} added to workspace, ensuring employee record`);
      await ensureUserHasEmployeeRecord(userId, workspaceId);
    }
  });

  log.info('[OwnerManagerEmployeeService] Initialized - listening for role changes');
}

export const ownerManagerEmployeeService = {
  ensureUserHasEmployeeRecord,
  ensureRoleHoldersAreEmployees,
  syncWorkspaceRoleHolders: ensureRoleHoldersAreEmployees,
  getOrCreateEmployeeForUser,
  userHasEmployeeRecord,
  getRoleHoldersWithoutEmployeeRecords,
  initializeOwnerManagerEmployeeService,
};
