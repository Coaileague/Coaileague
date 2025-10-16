import { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { employees, workspaces, platformRoles } from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';

export type WorkspaceRole = 'owner' | 'manager' | 'employee';
export type PlatformRole = 'root' | 'deputy_admin' | 'deputy_assistant' | 'sysop' | 'none';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  };
  workspaceId?: string;
  workspaceRole?: WorkspaceRole;
  employeeId?: string;
  platformRole?: PlatformRole;
}

export async function getUserWorkspaceRole(
  userId: string,
  workspaceId: string
): Promise<{ role: WorkspaceRole | null; employeeId: string | null }> {
  const employee = await db.query.employees.findFirst({
    where: and(
      eq(employees.userId, userId),
      eq(employees.workspaceId, workspaceId)
    ),
  });

  if (!employee) {
    return { role: null, employeeId: null };
  }

  return {
    role: (employee.workspaceRole as WorkspaceRole) || 'employee',
    employeeId: employee.id,
  };
}

export async function resolveWorkspaceForUser(userId: string, requestedWorkspaceId?: string): Promise<{
  workspaceId: string | null;
  role: WorkspaceRole | null;
  employeeId: string | null;
  error?: string;
}> {
  // If workspaceId is explicitly provided, validate user has access to it
  if (requestedWorkspaceId) {
    // Check if user owns this workspace
    const [ownedWorkspace] = await db
      .select()
      .from(workspaces)
      .where(and(
        eq(workspaces.id, requestedWorkspaceId),
        eq(workspaces.ownerId, userId)
      ))
      .limit(1);

    if (ownedWorkspace) {
      // User is the owner of this workspace
      const employee = await db.query.employees.findFirst({
        where: and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, requestedWorkspaceId)
        ),
      });
      return {
        workspaceId: requestedWorkspaceId,
        role: 'owner',
        employeeId: employee?.id || null,
      };
    }

    // Check if user has employee access to this workspace
    const { role, employeeId } = await getUserWorkspaceRole(userId, requestedWorkspaceId);
    if (!role) {
      return { 
        workspaceId: null, 
        role: null, 
        employeeId: null,
        error: 'You do not have access to this workspace' 
      };
    }
    return { workspaceId: requestedWorkspaceId, role, employeeId };
  }

  // No workspaceId provided - resolve from user's memberships
  const [ownedWorkspaces, userEmployees] = await Promise.all([
    db.select().from(workspaces).where(eq(workspaces.ownerId, userId)),
    db.query.employees.findMany({
      where: eq(employees.userId, userId),
    }),
  ]);

  // If user owns multiple workspaces, require explicit selection
  if (ownedWorkspaces.length > 1) {
    return {
      workspaceId: null,
      role: null,
      employeeId: null,
      error: 'Please specify workspaceId - you own multiple workspaces',
    };
  }

  // If user owns exactly one workspace, use it
  if (ownedWorkspaces.length === 1) {
    const workspace = ownedWorkspaces[0];
    const employee = userEmployees.find(e => e.workspaceId === workspace.id);
    return {
      workspaceId: workspace.id,
      role: 'owner',
      employeeId: employee?.id || null,
    };
  }

  // User doesn't own any workspaces - check employee memberships
  if (userEmployees.length === 0) {
    return { 
      workspaceId: null, 
      role: null, 
      employeeId: null,
      error: 'User is not a member of any workspace' 
    };
  }

  if (userEmployees.length === 1) {
    const emp = userEmployees[0];
    return {
      workspaceId: emp.workspaceId,
      role: (emp.workspaceRole as WorkspaceRole) || 'employee',
      employeeId: emp.id,
    };
  }

  // User has multiple employee records (multi-workspace scenario)
  return {
    workspaceId: null,
    role: null,
    employeeId: null,
    error: 'Please specify workspaceId - you have access to multiple workspaces',
  };
}

export function requireWorkspaceRole(allowedRoles: WorkspaceRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const requestedWorkspaceId = req.body.workspaceId || req.query.workspaceId || req.params.workspaceId;
    const { workspaceId, role, employeeId, error } = await resolveWorkspaceForUser(
      req.user.id,
      requestedWorkspaceId as string | undefined
    );

    if (!workspaceId || !role) {
      return res.status(error?.includes('specify workspaceId') ? 400 : 403).json({ error });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ 
        error: `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
        currentRole: role
      });
    }

    req.workspaceId = workspaceId;
    req.workspaceRole = role;
    req.employeeId = employeeId || undefined;
    next();
  };
}

export const requireOwner = requireWorkspaceRole(['owner']);
export const requireManager = requireWorkspaceRole(['owner', 'manager']);
export const requireEmployee = requireWorkspaceRole(['owner', 'manager', 'employee']);

export async function validateManagerAssignment(
  managerId: string,
  employeeId: string,
  workspaceId: string
): Promise<{ valid: boolean; error?: string }> {
  const [manager, employee] = await Promise.all([
    db.query.employees.findFirst({
      where: eq(employees.id, managerId),
    }),
    db.query.employees.findFirst({
      where: eq(employees.id, employeeId),
    }),
  ]);

  if (!manager) {
    return { valid: false, error: 'Manager not found' };
  }

  if (!employee) {
    return { valid: false, error: 'Employee not found' };
  }

  if (manager.workspaceId !== workspaceId || employee.workspaceId !== workspaceId) {
    return { valid: false, error: 'Manager and employee must belong to the same workspace' };
  }

  if (manager.workspaceRole !== 'manager' && manager.workspaceRole !== 'owner') {
    return { valid: false, error: 'Manager must have manager or owner role' };
  }

  if (manager.id === employee.id) {
    return { valid: false, error: 'Cannot assign manager to themselves' };
  }

  return { valid: true };
}

// ============================================================================
// PLATFORM ROLE MIDDLEWARE
// ============================================================================

export async function getUserPlatformRole(userId: string): Promise<PlatformRole> {
  const platformRole = await db.query.platformRoles.findFirst({
    where: and(
      eq(platformRoles.userId, userId),
      isNull(platformRoles.revokedAt)
    ),
  });

  return (platformRole?.role as PlatformRole) || 'none';
}

export function requirePlatformRole(allowedRoles: PlatformRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const platformRole = await getUserPlatformRole(req.user.id);
    
    if (!allowedRoles.includes(platformRole)) {
      return res.status(403).json({ 
        error: `This action requires platform role: ${allowedRoles.join(' or ')}`,
        currentPlatformRole: platformRole
      });
    }

    req.platformRole = platformRole;
    next();
  };
}

// Require platform admin role (highest level - root only)
export const requirePlatformAdmin = requirePlatformRole(['root']);

// Require any platform staff role (root, deputy admin, deputy assistant, or sysop)
export const requirePlatformStaff = requirePlatformRole([
  'root',
  'deputy_admin',
  'deputy_assistant',
  'sysop'
]);
