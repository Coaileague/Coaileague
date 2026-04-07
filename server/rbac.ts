import { Request, Response, NextFunction, RequestHandler } from 'express';
import { db } from './db';
import {
  employees,
  workspaces,
  platformRoles,
  users
} from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';
import './types';
/**
 * Global authentication guard.
 * Re-exported from auth.ts for centralized RBAC management.
 * 
 * Ensures the request has a valid session and user object.
 */
export { requireAuth } from './auth';

// Role types and hierarchy constants are the canonical source of truth.
// All role definitions live in server/lib/rbac/roleDefinitions.ts.
// Re-exported here for backward compatibility — import new code from roleDefinitions directly.
export type {
  WorkspaceRole,
  PlatformRole,
} from './lib/rbac/roleDefinitions';
export {
  WORKSPACE_ROLE_HIERARCHY,
  PLATFORM_ROLE_HIERARCHY,
  ORG_ACTION_MIN_LEVELS,
  PLATFORM_WIDE_ROLES,
  OWNER_ROLES,
  ADMIN_ROLES,
  MANAGER_ROLES,
  SUPERVISOR_ROLES,
  LEADER_ROLES,
  EMPLOYEE_ROLES,
  AUDITOR_ROLES,
  CONTRACTOR_ROLES,
} from './lib/rbac/roleDefinitions';
import type { WorkspaceRole, PlatformRole } from './lib/rbac/roleDefinitions';
import {
  WORKSPACE_ROLE_HIERARCHY,
  PLATFORM_ROLE_HIERARCHY,
  ORG_ACTION_MIN_LEVELS,
  PLATFORM_WIDE_ROLES,
  OWNER_ROLES,
  ADMIN_ROLES,
  MANAGER_ROLES,
  SUPERVISOR_ROLES,
  LEADER_ROLES,
  EMPLOYEE_ROLES,
  AUDITOR_ROLES,
  CONTRACTOR_ROLES,
} from './lib/rbac/roleDefinitions';

// ORG_ACTION_MIN_LEVELS sourced from roleDefinitions.ts (re-exported above)
export function getOrgActionMinLevel(action: string): number {
  return ORG_ACTION_MIN_LEVELS[action] || 5;
}

// Check if a workspace role has manager-level access (Tier 2+)
export function hasManagerAccess(role?: string): boolean {
  if (!role) return false;
  return (WORKSPACE_ROLE_HIERARCHY[role] || 0) >= WORKSPACE_ROLE_HIERARCHY['manager'];
}

// Check if a workspace role has supervisor-level access (Tier 3+)
export function hasSupervisorAccess(role?: string): boolean {
  if (!role) return false;
  return (WORKSPACE_ROLE_HIERARCHY[role] || 0) >= WORKSPACE_ROLE_HIERARCHY['supervisor'];
}

// Check if a workspace role has owner-level access (Tier 1)
export function hasOwnerAccess(role?: string): boolean {
  if (!role) return false;
  return (WORKSPACE_ROLE_HIERARCHY[role] || 0) >= WORKSPACE_ROLE_HIERARCHY['co_owner'];
}

// Get the hierarchy level for a workspace role
export function getWorkspaceRoleLevel(role?: string): number {
  if (!role) return 0;
  return WORKSPACE_ROLE_HIERARCHY[role] || 0;
}

// Get the hierarchy level for a platform role
export function getPlatformRoleLevel(role?: string): number {
  if (!role) return 0;
  return PLATFORM_ROLE_HIERARCHY[role] || 0;
}

// Position-aware access helpers using the canonical position registry
import { getPositionById, getAuthorityLevel, canEditTarget, canPromoteTo, getFeaturePermissions, getWorkspaceRoleForPosition, inferPositionFromTitle, type FeaturePermissions } from '@shared/positionRegistry';

export function hasCommandAccess(position?: string | null): boolean {
  if (!position) return false;
  return getAuthorityLevel(position) <= 6;
}

export function hasFieldSupervisorAccess(position?: string | null): boolean {
  if (!position) return false;
  return getAuthorityLevel(position) <= 8;
}

export function hasDispatchAccess(position?: string | null): boolean {
  if (!position) return false;
  const perms = getFeaturePermissions(position);
  return perms.cad_full_access || perms.cad_view_only;
}

export function getAuthorityLevelForEmployee(employee: { position?: string | null; workspaceRole?: string | null }): number {
  if (employee.position) {
    return getAuthorityLevel(employee.position);
  }
  const roleLevel = WORKSPACE_ROLE_HIERARCHY[employee.workspaceRole || 'staff'] || 2;
  if (roleLevel >= 6) return 1;
  if (roleLevel >= 5) return 3;
  if (roleLevel >= 4) return 5;
  if (roleLevel >= 3) return 7;
  return 10;
}

export function canEditEmployeeByPosition(editorPosition: string | null | undefined, targetPosition: string | null | undefined, editorRole?: string, targetRole?: string): boolean {
  if (editorPosition && targetPosition) {
    return canEditTarget(editorPosition, targetPosition);
  }
  const editorLevel = editorPosition ? getAuthorityLevel(editorPosition) : getAuthorityLevelForEmployee({ position: null, workspaceRole: editorRole });
  const targetLevel = targetPosition ? getAuthorityLevel(targetPosition) : getAuthorityLevelForEmployee({ position: null, workspaceRole: targetRole });
  return editorLevel < targetLevel;
}

export function canPromoteEmployeeTo(editorPosition: string | null | undefined, newPosition: string, editorRole?: string): boolean {
  if (editorPosition) {
    return canPromoteTo(editorPosition, newPosition);
  }
  const editorLevel = getAuthorityLevelForEmployee({ position: null, workspaceRole: editorRole });
  const targetLevel = getAuthorityLevel(newPosition);
  return editorLevel < targetLevel;
}

export function requirePositionAuthority(minLevel: number) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.isTestMode) {
      return next();
    }

    const platformRole = req.platformRole;
    if (platformRole && hasPlatformWideAccess(platformRole)) {
      return next();
    }

    if (!req.employeeId) {
      return res.status(403).json({ error: 'No employee context found' });
    }

    const [emp] = await db.select({ position: employees.position, workspaceRole: employees.workspaceRole })
      .from(employees).where(eq(employees.id, req.employeeId)).limit(1);

    if (!emp) {
      return res.status(403).json({ error: 'Employee not found' });
    }

    const level = getAuthorityLevelForEmployee({ position: emp.position, workspaceRole: emp.workspaceRole });
    if (level > minLevel) {
      return res.status(403).json({
        error: `This action requires authority level ${minLevel} or higher. Your level: ${level}`,
        requiredLevel: minLevel,
        currentLevel: level,
      });
    }

    next();
  };
}

// PLATFORM_WIDE_ROLES sourced from roleDefinitions.ts (re-exported above)

// Check if a platform role has platform-wide access (bypasses workspace requirements)
export function hasPlatformWideAccess(platformRole?: PlatformRole | string): boolean {
  if (!platformRole) return false;
  return PLATFORM_WIDE_ROLES.includes(platformRole as PlatformRole);
}

import type { User, users } from "@shared/schema";

export interface AuthenticatedRequest extends Request {
  user?: typeof users.$inferSelect;
  workspaceId?: string;
  currentWorkspaceId?: string;
  workspaceRole?: WorkspaceRole;
  employeeId?: string;
  platformRole?: PlatformRole;
  isTestMode?: boolean;
  assertOwnsResource?: (resourceWorkspaceId: string | null | undefined, resourceType?: string) => void;
  getWorkspaceId?: () => string;
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

import { storage } from './storage';

export async function resolveWorkspaceForUser(userId: string, requestedWorkspaceId?: string): Promise<{
  workspaceId: string | null;
  role: WorkspaceRole | null;
  employeeId: string | null;
  error?: string;
}> {
  return await storage.resolveWorkspaceForUser(userId, requestedWorkspaceId);
}


/**
 * Middleware factory for workspace-level Role-Based Access Control (RBAC).
 * 
 * @param allowedRoles - Array of roles permitted to access the route
 * @returns Express RequestHandler
 * 
 * Flow:
 * 1. Validates user authentication
 * 2. Checks for platform-wide role bypass (platform staff/bots)
 * 3. Resolves the requested workspace context from body/query/params
 * 4. Verifies the user's membership and specific role in that workspace
 * 5. Attaches resolved workspaceId, workspaceRole, and employeeId to req object
 */
export function requireWorkspaceRole(allowedRoles: WorkspaceRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Check for test mode - crawlers get full access
    if (req.isTestMode) {
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
      // This is the ONLY path where unauthenticated-source workspaceId is accepted
      const requestedWorkspaceId = req.body?.workspaceId || req.query?.workspaceId || req.params?.workspaceId;
      if (requestedWorkspaceId) {
        req.workspaceId = requestedWorkspaceId as string;
      }
      
      // Platform staff bypass role checks - they have full access
      return next();
    }

    // MANDATORY SECURITY: For non-platform staff, workspace context MUST come from req.user
    // or req.session. We ignore req.body/query/params to prevent parameter pollution
    // and cross-tenant ID injection attacks.
    const requestedWorkspaceId = req.user.currentWorkspaceId || (req as any).session?.workspaceId;
    
    const { workspaceId, role, employeeId, error } = await resolveWorkspaceForUser(
      userId,
      requestedWorkspaceId as string | undefined
    );

    if (!workspaceId || !role) {
      return res.status(error?.includes('specify workspaceId') ? 400 : 403).json({ error });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        error: `Your role (${role}) does not have permission to perform this action.`,
        requiredRoles: allowedRoles,
        currentRole: role,
        hint: 'Contact your organization owner or an administrator to request elevated access.',
        code: 'INSUFFICIENT_WORKSPACE_ROLE',
      });
    }

    req.workspaceId = workspaceId;
    req.workspaceRole = role;
    req.employeeId = employeeId || undefined;
    next();
  };
}

// Role lists sourced from roleDefinitions.ts — see OWNER_ROLES, ADMIN_ROLES, etc.
// Tier 0: Owner-level access (org_owner + co_owner)
// Use for: billing, workspace config, child org management, integration management
export const requireOwner = requireWorkspaceRole(OWNER_ROLES);

// Tier 0.5: Org Admin-level access (owners + org_admin/office secretary)
// Use for: operational decisions requiring broad authority but not ownership rights
// org_admin = office administrator (hiring, contracts, clients, docs) — no financial, no scheduling
export const requireAdmin = requireWorkspaceRole(ADMIN_ROLES);

// Tier 1: Manager-level access (owners + org_admin + all manager tiers + supervisor)
// supervisor is included: district managers carry supervisor role and must have full management access
export const requireManager = requireWorkspaceRole(MANAGER_ROLES);

// HR Manager access — same as requireManager (HR features need manager+ access)
export const requireHRManager = requireWorkspaceRole(MANAGER_ROLES);

// Tier 1 (alias): Supervisor-level access — intentionally identical to requireManager.
// Both guards resolve to the same role list (SUPERVISOR_ROLES === MANAGER_ROLES) because
// "supervisor" is the lowest privileged management tier that still requires full
// management-level feature access. See SUPERVISOR_ROLES in roleDefinitions.ts for details.
// Phase 9 F-1: intentional equivalence documented here.
export const requireSupervisor = requireWorkspaceRole(SUPERVISOR_ROLES);

// Tier 2: Employee-level access (all active workspace members except auditor/contractor)
export const requireEmployee = requireWorkspaceRole(EMPLOYEE_ROLES);

// Leaders Hub — Organization Leaders for self-service admin.
// org_admin included: Office Administrators (level 5) have higher authority than org_managers
// and need Leader Hub access. Phase 9 F-2 fix: org_admin was previously excluded.
export const requireLeader = requireWorkspaceRole(LEADER_ROLES);

// Auditor access — Read-only access for compliance/auditing purposes
export const requireAuditor = requireWorkspaceRole(AUDITOR_ROLES);

// Contractor access — All active workspace members including contractors
export const requireContractor = requireWorkspaceRole(CONTRACTOR_ROLES);

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
  // MANDATORY SECURITY: For non-platform staff, workspace context MUST come from req.user
  // or req.session. We ignore req.body/query/params to prevent parameter pollution
  // and cross-tenant ID injection attacks.
  const requestedWorkspaceId = authReq.user.currentWorkspaceId || (authReq as any).session?.workspaceId;
  const resolved = await resolveWorkspaceForUser(userId, requestedWorkspaceId as string | undefined);
  
  if (!resolved.workspaceId || !resolved.role) {
    return res.status(403).json({ 
      message: resolved.error || 'No workspace access found' 
    });
  }
  
  if (!hasSupervisorAccess(resolved.role)) {
    return res.status(403).json({ 
      message: 'Insufficient permissions - requires supervisor role or higher' 
    });
  }
  
  authReq.workspaceId = resolved.workspaceId;
  authReq.workspaceRole = resolved.role;
  authReq.employeeId = resolved.employeeId || undefined;
  
  next();
};

/**
 * Workspace State Enforcement Middleware
 * Blocks mutating operations on workspaces that are frozen, locked, suspended, or in maintenance.
 * Platform staff bypass this check to perform administrative actions.
 * GET/HEAD/OPTIONS requests always pass through (read-only).
 *
 * Enforced states:
 * - suspended: Organization is suspended (e.g., policy violation). Returns 423.
 * - frozen: Organization is frozen (e.g., non-payment). Returns 423.
 * - locked: Organization is locked for emergency review. Returns 423.
 * - maintenance: Organization is under scheduled maintenance. Returns 503.
 */
export const enforceWorkspaceState: RequestHandler = async (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  if (authReq.platformRole && hasPlatformWideAccess(authReq.platformRole)) {
    return next();
  }

  const workspaceId = authReq.workspaceId || authReq.body?.workspaceId || authReq.query?.workspaceId || authReq.params?.workspaceId;
  if (!workspaceId) {
    return next();
  }

  try {
    const [workspace] = await db.select({
      isSuspended: workspaces.isSuspended,
      isFrozen: workspaces.isFrozen,
      isLocked: workspaces.isLocked,
      accountState: workspaces.accountState,
    }).from(workspaces).where(eq(workspaces.id, workspaceId as string)).limit(1);

    if (!workspace) {
      return next();
    }

    if (workspace.isSuspended) {
      return res.status(423).json({
        message: 'This organization is currently suspended. Contact support to restore access.',
        state: 'suspended',
      });
    }

    if (workspace.isFrozen) {
      return res.status(423).json({
        message: 'This organization is currently frozen. Contact support to unfreeze.',
        state: 'frozen',
      });
    }

    if (workspace.isLocked) {
      return res.status(423).json({
        message: 'This organization is currently locked for emergency review. Contact support.',
        state: 'locked',
      });
    }

    if (workspace.accountState === 'maintenance') {
      return res.status(503).json({
        message: 'This organization is under maintenance. Please try again later.',
        state: 'maintenance',
      });
    }

    next();
  } catch (error) {
    log.error('[WorkspaceStateEnforcement] Error checking workspace state:', error);
    next();
  }
};

/**
 * Middleware to attach workspace ID to request for ALL authenticated users
 * Unlike requireManagerOrPlatformStaff, this doesn't check role - just resolves workspace
 * Use this for endpoints that need workspace scoping but don't require manager permissions
 * Uses hasPlatformWideAccess for consistent platform role handling across all guards
 */
/**
 * Multi-tenant isolation middleware.
 * Attaches workspace ID to request for ALL authenticated users without checking roles.
 * 
 * Essential for endpoints that need workspace scoping (e.g., searches, lists)
 * but are accessible to general staff/employees.
 * 
 * Approach:
 * 1. Authenticate user.
 * 2. Resolve requested workspace from request parameters.
 * 3. Verify membership to prevent cross-tenant data leakage.
 * 4. Attach resolved ID to the request object for downstream domain logic.
 * 
 * Supports platform staff bypass for cross-tenant diagnostics.
 */
export const attachWorkspaceId: RequestHandler = async (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  
  if (!authReq.user?.id) {
    return res.status(401).json({ message: 'Unauthorized - Please login' });
  }
  
  const userId = authReq.user.id;
  
  // MANDATORY SECURITY: For non-platform staff, workspace context MUST come from req.user
  // or req.session. We ignore req.body/query/params to prevent parameter pollution
  // and cross-tenant ID injection attacks.
  const requestedWorkspaceId = authReq.user.currentWorkspaceId || (authReq as any).session?.workspaceId;
  
  // Check platform role first - platform staff can specify workspace via query
  const platformRole = await getUserPlatformRole(userId);
  
  if (hasPlatformWideAccess(platformRole)) {
    authReq.platformRole = platformRole;
    
    // Platform staff can optionally override via query/body
    const explicitOverride = authReq.body?.workspaceId || authReq.query?.workspaceId || authReq.params?.workspaceId;
    if (explicitOverride) {
      authReq.workspaceId = explicitOverride as string;
      return next();
    }
    
    if (requestedWorkspaceId) {
      authReq.workspaceId = requestedWorkspaceId as string;
      return next();
    }
    
    // Use session cache first, then fall back to DB lookup
    if (req.session?.workspaceId) {
      authReq.workspaceId = req.session.workspaceId;
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
  
  // Fast path: Use session-cached workspace context when no explicit workspace is requested
  if (!requestedWorkspaceId && req.session?.workspaceId && req.session?.workspaceRole) {
    authReq.workspaceId = req.session.workspaceId;
    authReq.workspaceRole = req.session.workspaceRole as any;
    authReq.employeeId = req.session.employeeId || undefined;
    return next();
  }
  
  // Full resolution path: resolve workspace from membership (and cache result)
  const resolved = await resolveWorkspaceForUser(userId, requestedWorkspaceId as string | undefined);
  
  if (!resolved.workspaceId) {
    authReq.workspaceId = undefined;
    authReq.workspaceRole = undefined;
    authReq.employeeId = undefined;
    return next();
  }
  
  authReq.workspaceId = resolved.workspaceId;
  authReq.workspaceRole = resolved.role || undefined;
  authReq.employeeId = resolved.employeeId || undefined;
  
  // Cache in session for subsequent requests
  if (req.session && !req.session.workspaceId) {
    req.session.workspaceId = resolved.workspaceId;
    req.session.workspaceRole = resolved.role || undefined;
    req.session.employeeId = resolved.employeeId || undefined;
  }
  
  next();
};

/**
 * Optional version of attachWorkspaceId that allows unauthenticated requests to pass through.
 * Useful for endpoints that need to support both authenticated workspace-scoped access
 * AND unauthenticated public access (e.g., platform-wide chat rooms like HelpDesk).
 */
export const attachWorkspaceIdOptional: RequestHandler = async (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  
  if (!authReq.user?.id) {
    authReq.workspaceId = undefined;
    authReq.workspaceRole = undefined;
    authReq.employeeId = undefined;
    return next();
  }
  
  const userId = authReq.user.id;
  
  // MANDATORY SECURITY: For non-platform staff, workspace context MUST come from req.user
  // or req.session. We ignore req.body/query/params to prevent parameter pollution
  // and cross-tenant ID injection attacks.
  const requestedWorkspaceId = authReq.user.currentWorkspaceId || (authReq as any).session?.workspaceId;
  
  const platformRole = await getUserPlatformRole(userId);
  
  if (hasPlatformWideAccess(platformRole)) {
    authReq.platformRole = platformRole;
    
    // Platform staff can optionally override via query/body
    const explicitOverride = authReq.body?.workspaceId || authReq.query?.workspaceId || authReq.params?.workspaceId;
    if (explicitOverride) {
      authReq.workspaceId = explicitOverride as string;
      return next();
    }
    
    if (requestedWorkspaceId) {
      authReq.workspaceId = requestedWorkspaceId as string;
      return next();
    }
    
    if (req.session?.workspaceId) {
      authReq.workspaceId = req.session.workspaceId;
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
  
  // Fast path: session-cached workspace context
  if (!requestedWorkspaceId && req.session?.workspaceId && req.session?.workspaceRole) {
    authReq.workspaceId = req.session.workspaceId;
    authReq.workspaceRole = req.session.workspaceRole as any;
    authReq.employeeId = req.session.employeeId || undefined;
    return next();
  }
  
  const resolved = await resolveWorkspaceForUser(userId, requestedWorkspaceId as string | undefined);
  
  authReq.workspaceId = resolved.workspaceId || undefined;
  authReq.workspaceRole = resolved.role || undefined;
  authReq.employeeId = resolved.employeeId || undefined;
  
  if (req.session && resolved.workspaceId && !req.session.workspaceId) {
    req.session.workspaceId = resolved.workspaceId;
    req.session.workspaceRole = resolved.role || undefined;
    req.session.employeeId = resolved.employeeId || undefined;
  }
  
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

  if (!hasSupervisorAccess(manager.workspaceRole as string)) {
    return { valid: false, error: 'Manager must have supervisor role or higher' };
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

// Helper function to check if user has platform staff role (any human platform role)
// Excludes 'Bot' (automated runtime role) and 'none' (regular subscriber)
export function isPlatformStaff(user?: { platformRole?: PlatformRole | string }): boolean {
  if (!user || !user.platformRole) {
    return false;
  }
  
  const staffRoles: PlatformRole[] = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'compliance_officer'];
  return staffRoles.includes(user.platformRole as PlatformRole);
}

export function requirePlatformRole(allowedRoles: PlatformRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Check for test mode - crawlers get full access
    if (req.isTestMode) {
      req.platformRole = "root_admin" as any;
      return next();
    }

    // Trinity Bot bypass — the bot token was already validated by requireAuth which
    // set isTrinityBot=true and platformRole='Bot'.  We honour it only if 'Bot' is
    // explicitly listed in this route's allowedRoles; otherwise the bot is denied.
    if (req.isTrinityBot) {
      if (!allowedRoles.includes('Bot')) {
        return res.status(403).json({
          error: 'Trinity bot actors cannot access this endpoint',
          code: 'BOT_ACCESS_DENIED',
        });
      }
      req.platformRole = 'Bot' as any;
      return next();
    }

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

    const platformRole = await getUserPlatformRole(req.user.id);
    
    if (!allowedRoles.includes(platformRole)) {
      return res.status(403).json({
        error: `Your platform role (${platformRole || 'none'}) does not have access to this system action.`,
        requiredRoles: allowedRoles,
        currentPlatformRole: platformRole || 'none',
        hint: allowedRoles.includes('support_agent')
          ? 'This requires support agent level access or higher. Contact a platform administrator.'
          : allowedRoles.includes('sysop')
          ? 'This requires sysop level access or higher. Contact a deputy or root administrator.'
          : 'This requires elevated platform access. Contact a root administrator.',
        code: 'INSUFFICIENT_PLATFORM_ROLE',
      });
    }

    req.platformRole = platformRole;
    next();
  };
}

// Require platform admin role (highest level - root_admin only)
export const requirePlatformAdmin = requirePlatformRole(['root_admin']);

// Require any platform staff role (all human platform roles, excludes Bot and none)
export const requirePlatformStaff = requirePlatformRole([
  'root_admin',
  'deputy_admin',
  'sysop',
  'support_manager',
  'support_agent',
  'compliance_officer'
]);

// Tiered platform role guards for graduated access control
// Each tier includes all roles at that level and above in the hierarchy
// Tier 6: Deputy Admin+ (full ops control, no destructive)
export const requireDeputyAdmin = requirePlatformRole(['root_admin', 'deputy_admin']);

// Tier 5: SysOp+ (backend, deployment, diagnostics, service restarts)
export const requireSysop = requirePlatformRole(['root_admin', 'deputy_admin', 'sysop']);

// Tier 4: Support Manager+ (manages support team, ticket assignment, client escalations)
export const requireSupportManager = requirePlatformRole(['root_admin', 'deputy_admin', 'sysop', 'support_manager']);

// Tier 3: Support Agent+ (handles client tickets, assists organizations)
export const requireSupportAgent = requirePlatformRole(['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent']);

// Tier 2: Compliance Officer+ (audits, documentation, AI governance — includes all human staff)
export const requireComplianceOfficer = requirePlatformRole([
  'root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'compliance_officer'
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

  // Check if user is the org owner — direct ownership check first
  let isOwner = workspace.ownerId === userId;

  // Fallback: if direct ownership didn't match, check employees table for org_owner role
  // This handles cases where workspace.ownerId drifted due to seed/migration edge cases
  if (!isOwner) {
    const [empRecord] = await db
      .select({ workspaceRole: employees.workspaceRole })
      .from(employees)
      .where(and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId)))
      .limit(1);
    if (empRecord?.workspaceRole === 'org_owner' || empRecord?.workspaceRole === 'co_owner') {
      isOwner = true;
    }
  }

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
    log.info(`[PaymentEnforcement] Trial expired for workspace ${workspace.id} (ended: ${trialEndsAt})`);
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
    log.info(`[PaymentEnforcement] Workspace ${workspaceId} set to ${status}`);
    return true;
  } catch (error) {
    log.error('[PaymentEnforcement] Failed to deactivate workspace:', error);
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
    log.info(`[PaymentEnforcement] Workspace ${workspaceId} reactivated`);
    return true;
  } catch (error) {
    log.error('[PaymentEnforcement] Failed to reactivate workspace:', error);
    return false;
  }
}

// ============================================================================
// SUPPORT SESSION ENFORCEMENT
// Controls cross-org admin access with audit logging and org freeze capability
// ============================================================================

import { storage } from './storage';
import { createLogger } from './lib/logger';
const log = createLogger('rbac');


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
    log.error('[SupportSession] Error checking org frozen status:', error);
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
    log.error('[SupportSession] Error attaching session context:', error);
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
      log.error('[SupportSession] Error checking support session:', error);
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
    log.error('[SupportAudit] CRITICAL: Failed to write audit log:', error);
    log.error('[SupportAudit] Action:', { sessionId, adminUserId, workspaceId, action, severity });
  }
}
