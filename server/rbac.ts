import { Request, Response, NextFunction, RequestHandler } from 'express';
import { db } from './db';
import { employees, workspaces, platformRoles, users, type User } from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';
import './types';

export type WorkspaceRole = 'org_owner' | 'org_admin' | 'department_manager' | 'supervisor' | 'staff' | 'auditor' | 'contractor';
export type PlatformRole = 'root_admin' | 'deputy_admin' | 'sysop' | 'support_manager' | 'support_agent' | 'compliance_officer' | 'Bot' | 'none';

// Platform-level roles that have platform-wide access (bypass workspace requirements)
// Note: compliance_officer added for consistency with isPlatformStaff()
export const PLATFORM_WIDE_ROLES: PlatformRole[] = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'compliance_officer', 'Bot'];

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

  // If user owns multiple workspaces, auto-select the first one (sorted by creation)
  // User can switch workspaces via workspace selector in the UI
  if (ownedWorkspaces.length > 1) {
    // Sort by createdAt to pick the oldest (primary) workspace
    const sortedWorkspaces = ownedWorkspaces.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateA - dateB;
    });
    const workspace = sortedWorkspaces[0];
    const employee = userEmployees.find(e => e.workspaceId === workspace.id);
    return {
      workspaceId: workspace.id,
      role: 'org_owner',
      employeeId: employee?.id || null,
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
  // Auto-select the first one by creation date
  const sortedEmployees = userEmployees.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateA - dateB;
  });
  const emp = sortedEmployees[0];
  return {
    workspaceId: emp.workspaceId,
    role: (emp.workspaceRole as WorkspaceRole) || 'staff',
    employeeId: emp.id,
  };
}

export function requireWorkspaceRole(allowedRoles: WorkspaceRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Check for test mode - crawlers get full access
    if ((req as any).isTestMode) {
      req.platformRole = "root_admin" as any;
      return next();
    }

    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userId = req.user.id;
    
    // Check platform role first - platform staff bypass workspace requirements
    const platformRole = await getUserPlatformRole(userId);
    if (hasPlatformWideAccess(platformRole)) {
      req.platformRole = platformRole;
      
      // Platform staff can optionally specify workspace via query/body
      const requestedWorkspaceId = req.body?.workspaceId || req.query?.workspaceId || req.params?.workspaceId;
      if (requestedWorkspaceId) {
        req.workspaceId = requestedWorkspaceId as string;
      }
      
      // Platform staff bypass role checks - they have full access
      return next();
    }

    const requestedWorkspaceId = req.body.workspaceId || req.query.workspaceId || req.params.workspaceId;
    const { workspaceId, role, employeeId, error } = await resolveWorkspaceForUser(
      userId,
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

// Auditor access - Read-only access for compliance/auditing purposes
export const requireAuditor = requireWorkspaceRole(['org_owner', 'department_manager', 'org_admin', 'auditor']);

// Contractor access - Limited access for external contractors
export const requireContractor = requireWorkspaceRole(['org_owner', 'department_manager', 'supervisor', 'staff', 'contractor']);

// Hybrid guard: Allows EITHER workspace managers/owners OR platform staff (for diagnostics)
// Uses hasPlatformWideAccess for consistent platform role handling across all guards
export const requireManagerOrPlatformStaff: RequestHandler = async (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  
  // Check for test mode - crawlers get full access
  if ((authReq as any).isTestMode) {
    authReq.platformRole = "root_admin";
    return next();
  }

  
  if (!authReq.user?.id) {
    return res.status(401).json({ message: 'Unauthorized - Please login' });
  }
  
  const userId = authReq.user.id;
  
  // Check platform role first - platform staff get full access for diagnostics
  const platformRole = await getUserPlatformRole(userId);
  
  // Use hasPlatformWideAccess for consistent role bypass across all guards
  if (hasPlatformWideAccess(platformRole)) {
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
 * Uses hasPlatformWideAccess for consistent platform role handling across all guards
 */
export const attachWorkspaceId: RequestHandler = async (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  
  if (!authReq.user?.id) {
    return res.status(401).json({ message: 'Unauthorized - Please login' });
  }
  
  const userId = authReq.user.id;
  
  // Check platform role first - platform staff can specify workspace via query
  // Use hasPlatformWideAccess for consistent role bypass across all guards
  const platformRole = await getUserPlatformRole(userId);
  
  if (hasPlatformWideAccess(platformRole)) {
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

/**
 * Optional version of attachWorkspaceId that allows unauthenticated requests to pass through.
 * Useful for endpoints that need to support both authenticated workspace-scoped access
 * AND unauthenticated public access (e.g., platform-wide chat rooms like HelpDesk).
 */
export const attachWorkspaceIdOptional: RequestHandler = async (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  
  // If no user, allow request to continue without workspace (public access)
  if (!authReq.user?.id) {
    authReq.workspaceId = undefined;
    authReq.workspaceRole = undefined;
    authReq.employeeId = undefined;
    return next();
  }
  
  // User is authenticated - proceed with normal workspace resolution
  const userId = authReq.user.id;
  
  // Check platform role first
  const platformRole = await getUserPlatformRole(userId);
  
  if (hasPlatformWideAccess(platformRole)) {
    authReq.platformRole = platformRole;
    
    const requestedWorkspaceId = authReq.body?.workspaceId || authReq.query?.workspaceId || authReq.params?.workspaceId;
    if (requestedWorkspaceId) {
      authReq.workspaceId = requestedWorkspaceId as string;
      return next();
    }
    
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user?.currentWorkspaceId) {
      authReq.workspaceId = user.currentWorkspaceId;
      return next();
    }
    
    authReq.workspaceId = undefined;
    return next();
  }
  
  // Regular users - resolve workspace
  const requestedWorkspaceId = authReq.body?.workspaceId || authReq.query?.workspaceId || authReq.params?.workspaceId;
  const resolved = await resolveWorkspaceForUser(userId, requestedWorkspaceId as string | undefined);
  
  authReq.workspaceId = resolved.workspaceId || undefined;
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

// ============================================================================
// TRINITY (MASCOT) ACCESS CONTROL
// Trinity is restricted to org creators and root/support roles
// Uses shared constants for consistency with client-side checks
// ============================================================================

import { 
  TRINITY_ALLOWED_PLATFORM_ROLES, 
  TRINITY_ALLOWED_WORKSPACE_ROLES 
} from '@shared/types';

/**
 * Check if a user has access to Trinity mascot features
 * Access granted to:
 * - Platform staff (root_admin, deputy_admin, sysop, support_manager, support_agent)
 * - Org owners (workspace creators)
 */
export async function canAccessTrinity(userId: string): Promise<{
  hasAccess: boolean;
  platformRole?: PlatformRole;
  workspaceRole?: WorkspaceRole;
  isOrgOwner?: boolean;
}> {
  // Check platform role first
  const platformRole = await getUserPlatformRole(userId);
  
  if (TRINITY_ALLOWED_PLATFORM_ROLES.includes(platformRole)) {
    return { hasAccess: true, platformRole };
  }
  
  // Check if user owns any workspace (org creator)
  const [ownedWorkspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.ownerId, userId))
    .limit(1);
  
  if (ownedWorkspace) {
    return { hasAccess: true, workspaceRole: 'org_owner', isOrgOwner: true };
  }
  
  // Check workspace role if they have employee access
  const employee = await db.query.employees.findFirst({
    where: eq(employees.userId, userId),
  });
  
  if (employee && TRINITY_ALLOWED_WORKSPACE_ROLES.includes(employee.workspaceRole as WorkspaceRole)) {
    return { hasAccess: true, workspaceRole: employee.workspaceRole as WorkspaceRole };
  }
  
  return { hasAccess: false };
}

/**
 * Middleware to require Trinity access
 * Returns 403 if user doesn't have required role/ownership
 */
export const requireTrinityAccess: RequestHandler = async (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  
  if (!authReq.user?.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const accessResult = await canAccessTrinity(authReq.user.id);
  
  if (!accessResult.hasAccess) {
    return res.status(403).json({ 
      error: 'Trinity access requires org owner role or platform staff permissions',
      code: 'TRINITY_ACCESS_DENIED'
    });
  }
  
  // Attach access info to request for downstream use
  if (accessResult.platformRole) {
    authReq.platformRole = accessResult.platformRole;
  }
  if (accessResult.workspaceRole) {
    authReq.workspaceRole = accessResult.workspaceRole;
  }
  
  next();
};

// ============================================================================
// PAYMENT ENFORCEMENT
// Blocks access to deactivated/suspended organizations
// - End users: 404 error, force logout, redirect to homepage
// - Org owners: Notify payment needed, redirect to payment page
// ============================================================================

export interface PaymentEnforcementResult {
  allowed: boolean;
  reason?: 'active' | 'suspended' | 'cancelled' | 'no_workspace';
  isOwner: boolean;
  workspaceId?: string;
  workspaceName?: string;
}

/**
 * Check if workspace is active and user can access it
 * Returns enforcement result with user's owner status
 */
export async function checkWorkspacePaymentStatus(
  userId: string,
  workspaceId: string
): Promise<PaymentEnforcementResult> {
  // Get workspace with subscription status
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) {
    return { allowed: false, reason: 'no_workspace', isOwner: false };
  }

  // Check if user is the org owner
  const isOwner = workspace.ownerId === userId;
  const status = (workspace.subscriptionStatus || 'active') as 'active' | 'trial' | 'suspended' | 'cancelled';

  // Active workspaces always allowed
  if (status === 'active') {
    return { 
      allowed: true, 
      reason: 'active', 
      isOwner,
      workspaceId: workspace.id,
      workspaceName: workspace.name
    };
  }

  // Trial workspaces: allowed if trial hasn't expired
  if (status === 'trial') {
    const trialEndsAt = workspace.trialEndsAt;
    const now = new Date();
    
    // If no trial end date set, or trial is still valid, allow access
    if (!trialEndsAt || new Date(trialEndsAt) > now) {
      return { 
        allowed: true, 
        reason: 'active', // Treat valid trial as active for permissions
        isOwner,
        workspaceId: workspace.id,
        workspaceName: workspace.name
      };
    }
    
    // Trial has expired - treat as suspended
    console.log(`[PaymentEnforcement] Trial expired for workspace ${workspace.id} (ended: ${trialEndsAt})`);
    return {
      allowed: false,
      reason: 'suspended',
      isOwner,
      workspaceId: workspace.id,
      workspaceName: workspace.name
    };
  }

  // Suspended or cancelled - block with appropriate response
  return {
    allowed: false,
    reason: status as 'suspended' | 'cancelled',
    isOwner,
    workspaceId: workspace.id,
    workspaceName: workspace.name
  };
}

/**
 * Middleware to enforce payment status on protected routes
 * - End users get 404 + logout signal
 * - Org owners get payment required message with redirect
 * 
 * Apply this AFTER requireAuth and workspace resolution
 */
export const enforcePaymentStatus: RequestHandler = async (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  
  // Skip for unauthenticated requests (handled by requireAuth)
  if (!authReq.user?.id) {
    return next();
  }

  // Skip for platform staff - they can access everything
  if (authReq.platformRole && hasPlatformWideAccess(authReq.platformRole)) {
    return next();
  }

  // No workspace context - skip (some routes don't need workspace)
  const workspaceId = authReq.workspaceId || authReq.user?.defaultWorkspaceId;
  if (!workspaceId) {
    return next();
  }

  const result = await checkWorkspacePaymentStatus(authReq.user.id, workspaceId);

  // Active workspace - proceed normally
  if (result.allowed) {
    return next();
  }

  // Suspended/cancelled workspace - different responses for owner vs end user
  if (result.isOwner) {
    // Org owner: Tell them payment is needed, redirect to payment
    return res.status(402).json({
      code: 'PAYMENT_REQUIRED',
      message: 'Your organization subscription is inactive. Please update your payment to continue.',
      reason: result.reason,
      workspaceId: result.workspaceId,
      workspaceName: result.workspaceName,
      redirectTo: '/org-management',
      isOwner: true
    });
  }

  // End user: 404 + force logout signal
  return res.status(404).json({
    code: 'ORGANIZATION_INACTIVE',
    message: 'This organization is currently unavailable.',
    reason: result.reason,
    forceLogout: true,
    redirectTo: '/',
    isOwner: false
  });
};

/**
 * Deactivate a workspace (for testing or admin use)
 * Sets subscriptionStatus to 'suspended' or 'cancelled'
 */
export async function deactivateWorkspace(
  workspaceId: string, 
  status: 'suspended' | 'cancelled' = 'suspended'
): Promise<boolean> {
  try {
    await db
      .update(workspaces)
      .set({ subscriptionStatus: status })
      .where(eq(workspaces.id, workspaceId));
    console.log(`[PaymentEnforcement] Workspace ${workspaceId} set to ${status}`);
    return true;
  } catch (error) {
    console.error('[PaymentEnforcement] Failed to deactivate workspace:', error);
    return false;
  }
}

/**
 * Reactivate a workspace after payment
 * Sets subscriptionStatus back to 'active'
 */
export async function reactivateWorkspace(workspaceId: string): Promise<boolean> {
  try {
    await db
      .update(workspaces)
      .set({ subscriptionStatus: 'active' })
      .where(eq(workspaces.id, workspaceId));
    console.log(`[PaymentEnforcement] Workspace ${workspaceId} reactivated`);
    return true;
  } catch (error) {
    console.error('[PaymentEnforcement] Failed to reactivate workspace:', error);
    return false;
  }
}

// ============================================================================
// SUPPORT SESSION ENFORCEMENT
// Controls cross-org admin access with audit logging and org freeze capability
// ============================================================================

import { storage } from './storage';

// Extended request with support session context
export interface SupportSessionRequest extends AuthenticatedRequest {
  supportSession?: {
    id: string;
    adminUserId: string;
    targetWorkspaceId: string;
    scope: string;
    isOrgFrozen: boolean;
    freezeReason?: string;
  };
}

/**
 * Middleware: Check if organization is frozen (for regular users)
 * During support sessions, platform staff can freeze an org to prevent
 * concurrent modifications by regular users
 */
export const checkOrgFrozen: RequestHandler = async (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  
  // Platform staff bypass org freeze checks
  if (authReq.platformRole && hasPlatformWideAccess(authReq.platformRole)) {
    return next();
  }
  
  // Get workspace ID from various sources
  const workspaceId = authReq.workspaceId || 
    authReq.body?.workspaceId || 
    authReq.query?.workspaceId || 
    authReq.params?.workspaceId;
  
  if (!workspaceId) {
    return next(); // No workspace context, nothing to check
  }
  
  try {
    const frozenStatus = await storage.isOrgFrozen(workspaceId as string);
    
    if (frozenStatus.frozen) {
      return res.status(503).json({
        code: 'ORGANIZATION_FROZEN',
        message: 'This organization is temporarily locked for platform maintenance.',
        reason: frozenStatus.reason,
        retryAfter: 300 // Suggest retry after 5 minutes
      });
    }
    
    next();
  } catch (error) {
    console.error('[SupportSession] Error checking org frozen status:', error);
    next(); // Fail open to avoid blocking all requests
  }
};

/**
 * Middleware: Attach support session context for platform staff
 * When platform staff accesses a workspace, this middleware:
 * 1. Finds or validates their active support session
 * 2. Attaches session context for audit logging
 */
export const attachSupportSessionContext: RequestHandler = async (req, res, next) => {
  const authReq = req as SupportSessionRequest;
  
  // Only applies to platform staff
  if (!authReq.platformRole || !hasPlatformWideAccess(authReq.platformRole)) {
    return next();
  }
  
  const userId = authReq.user?.id;
  if (!userId) {
    return next();
  }
  
  try {
    // Check if admin has an active support session
    const activeSession = await storage.getActiveSupportSessionByAdmin(userId);
    
    if (activeSession) {
      authReq.supportSession = {
        id: activeSession.id,
        adminUserId: activeSession.adminUserId,
        targetWorkspaceId: activeSession.workspaceId,
        scope: activeSession.scope,
        isOrgFrozen: activeSession.isOrgFrozen || false,
        freezeReason: activeSession.freezeReason || undefined,
      };
    }
    
    next();
  } catch (error) {
    console.error('[SupportSession] Error attaching session context:', error);
    next(); // Fail open
  }
};

/**
 * Require active support session for cross-org operations
 * Platform staff must have an active session to access another org's data
 */
export const requireActiveSupport = (scopes: string[]): RequestHandler => {
  return async (req, res, next) => {
    const authReq = req as SupportSessionRequest;
    
    // Must be platform staff
    if (!authReq.platformRole || !hasPlatformWideAccess(authReq.platformRole)) {
      return res.status(403).json({ 
        error: 'This operation requires platform staff role',
        code: 'PLATFORM_ROLE_REQUIRED'
      });
    }
    
    const userId = authReq.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
      const activeSession = await storage.getActiveSupportSessionByAdmin(userId);
      
      if (!activeSession) {
        return res.status(403).json({
          error: 'Active support session required for this operation',
          code: 'SUPPORT_SESSION_REQUIRED',
          hint: 'Start a support session before accessing organization data'
        });
      }
      
      // Check if the scope is allowed
      if (!scopes.includes(activeSession.scope)) {
        return res.status(403).json({
          error: `Operation requires scope: ${scopes.join(' or ')}`,
          code: 'INSUFFICIENT_SCOPE',
          currentScope: activeSession.scope
        });
      }
      
      // Attach session context
      authReq.supportSession = {
        id: activeSession.id,
        adminUserId: activeSession.adminUserId,
        targetWorkspaceId: activeSession.workspaceId,
        scope: activeSession.scope,
        isOrgFrozen: activeSession.isOrgFrozen || false,
        freezeReason: activeSession.freezeReason || undefined,
      };
      
      next();
    } catch (error) {
      console.error('[SupportSession] Error checking support session:', error);
      return res.status(500).json({ error: 'Failed to validate support session' });
    }
  };
};

// Preset scopes for common operations
export const requireReadOnlySupport = requireActiveSupport(['read_only', 'full_access', 'emergency']);
export const requireFullAccessSupport = requireActiveSupport(['full_access', 'emergency']);
export const requireEmergencySupport = requireActiveSupport(['emergency']);

/**
 * Helper to log support actions (use in route handlers)
 * Creates an immutable audit trail for all support operations
 */
export async function logSupportAction(
  sessionId: string,
  adminUserId: string,
  workspaceId: string,
  action: string,
  severity: 'read' | 'write' | 'delete',
  details?: Record<string, any>
): Promise<void> {
  try {
    await storage.createSupportAuditLog({
      sessionId,
      adminUserId,
      workspaceId,
      action,
      severity,
      targetResource: details?.targetResource,
      targetId: details?.targetId,
      previousState: details?.previousState,
      newState: details?.newState,
      ipAddress: details?.ipAddress,
      userAgent: details?.userAgent,
      metadata: details?.metadata,
    });
  } catch (error) {
    // Never fail the request due to audit log failure - but do alert
    console.error('[SupportAudit] CRITICAL: Failed to write audit log:', error);
    console.error('[SupportAudit] Action:', { sessionId, adminUserId, workspaceId, action, severity });
  }
}
