import { Request, Response, NextFunction, RequestHandler } from 'express';
import { db } from './db';
import { employees, workspaces, platformRoles, users, type User } from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';
import './types';

export type WorkspaceRole = 'org_owner' | 'org_admin' | 'department_manager' | 'supervisor' | 'staff' | 'auditor' | 'contractor';
export type PlatformRole = 'root_admin' | 'deputy_admin' | 'sysop' | 'support_manager' | 'support_agent' | 'compliance_officer' | 'Bot' | 'none';

// Platform-level roles that have platform-wide access (bypass workspace requirements)
export const PLATFORM_WIDE_ROLES: PlatformRole[] = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'Bot'];

// Check if a platform role has platform-wide access (bypasses workspace requirements)
export function hasPlatformWideAccess(platformRole?: PlatformRole | string): boolean {
  if (!platformRole) return false;
  return PLATFORM_WIDE_ROLES.includes(platformRole as PlatformRole);
}

export interface AuthenticatedRequest extends Request {
  user?: User;
  workspaceId?: string;
  currentWorkspaceId?: string;
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
    role: (employee.workspaceRole as WorkspaceRole) || 'staff',
    employeeId: employee.id,
  };
}

export async function resolveWorkspaceForUser(userId: string, requestedWorkspaceId?: string): Promise<{
  workspaceId: string | null;
  role: WorkspaceRole | null;
  employeeId: string | null;
  error?: string;
}> {
  // Root user always gets org_owner access to the default workspace
  if (userId === 'root-user-00000000') {
    // Get or find the default workspace for root
    const [workspace] = await db.select().from(workspaces).limit(1);
    if (workspace) {
      const employee = await db.query.employees.findFirst({
        where: and(
          eq(employees.userId, userId),
          eq(employees.workspaceId, workspace.id)
        ),
      });
      return {
        workspaceId: requestedWorkspaceId || workspace.id,
        role: 'org_owner',
        employeeId: employee?.id || null,
      };
    }
  }

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
        role: 'org_owner',
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
      role: 'org_owner',
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
      role: (emp.workspaceRole as WorkspaceRole) || 'staff',
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

export const requireOwner = requireWorkspaceRole(['org_owner']);
export const requireManager = requireWorkspaceRole(['org_owner', 'department_manager']);
export const requireHRManager = requireWorkspaceRole(['org_owner', 'department_manager', 'org_admin']);
export const requireSupervisor = requireWorkspaceRole(['org_owner', 'department_manager', 'supervisor']);
export const requireEmployee = requireWorkspaceRole(['org_owner', 'department_manager', 'org_admin', 'supervisor', 'staff']);

// Leaders Hub - Organization Leaders (Owner/Manager only) for self-service admin
export const requireLeader = requireWorkspaceRole(['org_owner', 'department_manager']);

// Hybrid guard: Allows EITHER workspace managers/owners OR platform staff (for diagnostics)
export const requireManagerOrPlatformStaff: RequestHandler = async (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  
  if (!authReq.user?.id) {
    return res.status(401).json({ message: 'Unauthorized - Please login' });
  }
  
  const userId = authReq.user.id;
  
  // Check platform role first - platform staff get full access for diagnostics
  const platformRole = await getUserPlatformRole(userId);
  
  if (platformRole === 'root_admin' || platformRole === 'sysop' || platformRole === 'support_manager') {
    authReq.platformRole = platformRole;
    
    // Platform staff can optionally specify workspace via query/body for POST/PATCH operations
    const requestedWorkspaceId = authReq.body?.workspaceId || authReq.query?.workspaceId || authReq.params?.workspaceId;
    if (requestedWorkspaceId) {
      authReq.workspaceId = requestedWorkspaceId as string;
    }
    
    return next();
  }
  
  // Not platform staff - check workspace role
  // Read workspaceId from body, query, or params (like requireWorkspaceRole)
  const requestedWorkspaceId = authReq.body?.workspaceId || authReq.query?.workspaceId || authReq.params?.workspaceId;
  const resolved = await resolveWorkspaceForUser(userId, requestedWorkspaceId as string | undefined);
  
  if (!resolved.workspaceId || !resolved.role) {
    return res.status(403).json({ 
      message: resolved.error || 'No workspace access found' 
    });
  }
  
  const allowedRoles: WorkspaceRole[] = ['org_owner', 'department_manager'];
  if (!allowedRoles.includes(resolved.role)) {
    return res.status(403).json({ 
      message: 'Insufficient permissions - requires manager role or higher' 
    });
  }
  
  authReq.workspaceId = resolved.workspaceId;
  authReq.workspaceRole = resolved.role;
  authReq.employeeId = resolved.employeeId || undefined;
  
  next();
};

/**
 * Middleware to attach workspace ID to request for ALL authenticated users
 * Unlike requireManagerOrPlatformStaff, this doesn't check role - just resolves workspace
 * Use this for endpoints that need workspace scoping but don't require manager permissions
 */
export const attachWorkspaceId: RequestHandler = async (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  
  if (!authReq.user?.id) {
    return res.status(401).json({ message: 'Unauthorized - Please login' });
  }
  
  const userId = authReq.user.id;
  
  // Check platform role first - platform staff can specify workspace via query
  const platformRole = await getUserPlatformRole(userId);
  
  if (platformRole === 'root_admin' || platformRole === 'sysop' || platformRole === 'support_manager') {
    authReq.platformRole = platformRole;
    
    // Platform staff can specify workspace via query/body
    const requestedWorkspaceId = authReq.body?.workspaceId || authReq.query?.workspaceId || authReq.params?.workspaceId;
    if (requestedWorkspaceId) {
      authReq.workspaceId = requestedWorkspaceId as string;
      return next();
    }
    
    // If no workspace specified, try to get from user's currentWorkspaceId
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user?.currentWorkspaceId) {
      authReq.workspaceId = user.currentWorkspaceId;
      return next();
    }
    
    // Platform staff without workspace - allow (they'll get platform-wide stats)
    authReq.workspaceId = undefined;
    return next();
  }
  
  // Regular users - resolve workspace from their membership
  const requestedWorkspaceId = authReq.body?.workspaceId || authReq.query?.workspaceId || authReq.params?.workspaceId;
  const resolved = await resolveWorkspaceForUser(userId, requestedWorkspaceId as string | undefined);
  
  if (!resolved.workspaceId) {
    // User has no workspace - this is okay for some endpoints
    authReq.workspaceId = undefined;
    authReq.workspaceRole = undefined;
    authReq.employeeId = undefined;
    return next();
  }
  
  authReq.workspaceId = resolved.workspaceId;
  authReq.workspaceRole = resolved.role || undefined;
  authReq.employeeId = resolved.employeeId || undefined;
  
  next();
};

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

  if (manager.workspaceRole !== 'department_manager' && manager.workspaceRole !== 'org_owner' && manager.workspaceRole !== 'supervisor') {
    return { valid: false, error: 'Manager must have department_manager, org_owner, or supervisor role' };
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

// Helper function to check if user has platform staff role
// (root_admin, deputy_admin, support_manager, sysop, or support_agent)
export function isPlatformStaff(user?: { platformRole?: PlatformRole | string }): boolean {
  if (!user || !user.platformRole) {
    return false;
  }
  
  const staffRoles: PlatformRole[] = ['root_admin', 'deputy_admin', 'support_manager', 'sysop', 'support_agent', 'compliance_officer'];
  return staffRoles.includes(user.platformRole as PlatformRole);
}

export function requirePlatformRole(allowedRoles: PlatformRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Check session-based authentication first
    if (!req.session?.userId && !req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get userId from session or req.user
    const userId = req.session?.userId || req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // If req.user is not set, populate it from the session
    if (!req.user) {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      req.user = user;
    }

    const platformRole = await getUserPlatformRole(req.user!.id);
    
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

// Require platform admin role (highest level - root_admin only)
export const requirePlatformAdmin = requirePlatformRole(['root_admin']);

// Require any platform staff role (root_admin, deputy_admin, support_manager, sysop, or support_agent)
export const requirePlatformStaff = requirePlatformRole([
  'root_admin',
  'deputy_admin',
  'support_manager',
  'sysop',
  'support_agent',
  'compliance_officer'
]);
