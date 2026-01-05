// 5-Tier Role Hierarchy for CoAIleague RBAC
// Tier 1: org_owner (undeletable), co_owner
// Tier 2: manager
// Tier 3: supervisor
// Tier 4: staff/employee

export type WorkspaceRole = 
  | 'org_owner' 
  | 'co_owner' 
  | 'org_admin'      // Legacy alias for co_owner
  | 'manager' 
  | 'department_manager' // Legacy alias for manager
  | 'supervisor' 
  | 'staff' 
  | 'employee'       // Alias for staff
  | 'auditor' 
  | 'contractor';

// Role tier levels (lower = higher authority)
export const ROLE_TIERS: Record<WorkspaceRole, number> = {
  'org_owner': 1,
  'co_owner': 1,
  'org_admin': 1,          // Legacy - same tier as co_owner
  'manager': 2,
  'department_manager': 2, // Legacy - same tier as manager
  'supervisor': 3,
  'staff': 4,
  'employee': 4,           // Same tier as staff
  'auditor': 5,            // Read-only, lowest authority
  'contractor': 5,         // Limited access
};

// Role display names
export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  'org_owner': 'Organization Owner',
  'co_owner': 'Co-Owner',
  'org_admin': 'Org Admin',
  'manager': 'Manager',
  'department_manager': 'Department Manager',
  'supervisor': 'Supervisor',
  'staff': 'Staff',
  'employee': 'Employee',
  'auditor': 'Auditor',
  'contractor': 'Contractor',
};

// Role descriptions for UI
export const ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  'org_owner': 'Full platform access, billing control, can delete org',
  'co_owner': 'Delegated authority, access controlled by owner',
  'org_admin': 'Day-to-day operations, user management',
  'manager': 'Schedule creation, payroll, client management, Trinity AI',
  'department_manager': 'Department tasks, staff, and reports',
  'supervisor': 'Team oversight, timesheet approval, no payroll access',
  'staff': 'Clock in/out, view own schedule, update own profile',
  'employee': 'Same as Staff - field worker access',
  'auditor': 'Read-only access to finances and compliance',
  'contractor': 'Limited access to assigned tasks only',
};

// Normalize legacy role names to current roles
export function normalizeRole(role: string | null | undefined): WorkspaceRole {
  if (!role) return 'staff';
  const normalized = role.toLowerCase();
  
  // Map legacy roles to current equivalents
  if (normalized === 'org_admin') return 'co_owner';
  if (normalized === 'department_manager') return 'manager';
  if (normalized === 'employee') return 'staff';
  
  return normalized as WorkspaceRole;
}

// Get role tier (1 = highest authority)
export function getRoleTier(role: WorkspaceRole | string | null | undefined): number {
  const normalized = normalizeRole(role as any);
  return ROLE_TIERS[normalized] ?? 4;
}

// Check if user can modify target user based on role hierarchy
export function canModifyUser(
  actorRole: WorkspaceRole | string | null | undefined,
  targetRole: WorkspaceRole | string | null | undefined
): boolean {
  const actorTier = getRoleTier(actorRole);
  const targetTier = getRoleTier(targetRole);
  
  // org_owner can modify everyone
  if (normalizeRole(actorRole as any) === 'org_owner') return true;
  
  // Users can only modify users in lower tiers (higher tier numbers)
  return actorTier < targetTier;
}

// Check if user can assign a specific role
export function canAssignRole(
  actorRole: WorkspaceRole | string | null | undefined,
  roleToAssign: WorkspaceRole | string
): boolean {
  const actorTier = getRoleTier(actorRole);
  const roleTier = getRoleTier(roleToAssign);
  
  // Only org_owner can assign org_owner or co_owner
  if (roleTier === 1) {
    return normalizeRole(actorRole as any) === 'org_owner';
  }
  
  // Manager/supervisor/employee can be assigned by co_owner and above
  // User can assign roles at their tier or below (higher tier numbers)
  return actorTier <= roleTier;
}

// Get list of roles a user can assign based on their role
export function getAssignableRoles(actorRole: WorkspaceRole | string | null | undefined): WorkspaceRole[] {
  const normalized = normalizeRole(actorRole as any);
  
  switch (normalized) {
    case 'org_owner':
      // Owner can assign all roles except creating another org_owner
      return ['co_owner', 'manager', 'supervisor', 'staff', 'auditor', 'contractor'];
    case 'co_owner':
    case 'org_admin':
      // Co-owner can assign manager and below (if granted permission by owner)
      return ['manager', 'supervisor', 'staff', 'auditor', 'contractor'];
    case 'manager':
    case 'department_manager':
      // Manager can assign supervisor and below
      return ['supervisor', 'staff', 'contractor'];
    case 'supervisor':
      // Supervisor cannot assign roles
      return [];
    default:
      return [];
  }
}

// Check if role is protected (cannot be deleted/demoted)
export function isProtectedRole(role: WorkspaceRole | string | null | undefined): boolean {
  return normalizeRole(role as any) === 'org_owner';
}

// Permission capabilities by role
export interface RolePermissions {
  canViewBilling: boolean;
  canModifyBilling: boolean;
  canDeleteOrg: boolean;
  canManageAllUsers: boolean;
  canManageSubordinates: boolean;
  canAccessTrinity: boolean;
  canProcessPayroll: boolean;
  canViewPayroll: boolean;
  canManageSchedules: boolean;
  canManageClients: boolean;
  canApproveTimesheets: boolean;
  canViewReports: boolean;
  canGenerateReports: boolean;
  canClockInOut: boolean;
  canViewOwnSchedule: boolean;
  canUpdateOwnProfile: boolean;
  canSuspendUsers: boolean;
  canRemoveUsers: boolean;
}

export function getRolePermissions(role: WorkspaceRole | string | null | undefined): RolePermissions {
  const normalized = normalizeRole(role as any);
  
  const basePermissions: RolePermissions = {
    canViewBilling: false,
    canModifyBilling: false,
    canDeleteOrg: false,
    canManageAllUsers: false,
    canManageSubordinates: false,
    canAccessTrinity: false,
    canProcessPayroll: false,
    canViewPayroll: false,
    canManageSchedules: false,
    canManageClients: false,
    canApproveTimesheets: false,
    canViewReports: false,
    canGenerateReports: false,
    canClockInOut: true,
    canViewOwnSchedule: true,
    canUpdateOwnProfile: true,
    canSuspendUsers: false,
    canRemoveUsers: false,
  };
  
  switch (normalized) {
    case 'org_owner':
      return {
        ...basePermissions,
        canViewBilling: true,
        canModifyBilling: true,
        canDeleteOrg: true,
        canManageAllUsers: true,
        canManageSubordinates: true,
        canAccessTrinity: true,
        canProcessPayroll: true,
        canViewPayroll: true,
        canManageSchedules: true,
        canManageClients: true,
        canApproveTimesheets: true,
        canViewReports: true,
        canGenerateReports: true,
        canSuspendUsers: true,
        canRemoveUsers: true,
      };
    
    case 'co_owner':
    case 'org_admin':
      return {
        ...basePermissions,
        canViewBilling: true,  // View only by default
        canManageAllUsers: false,
        canManageSubordinates: true,
        canAccessTrinity: true, // If enabled by owner
        canProcessPayroll: true, // If enabled by owner
        canViewPayroll: true,
        canManageSchedules: true,
        canManageClients: true,
        canApproveTimesheets: true,
        canViewReports: true,
        canGenerateReports: true,
        canSuspendUsers: true,
        canRemoveUsers: false, // Cannot permanently delete
      };
    
    case 'manager':
    case 'department_manager':
      return {
        ...basePermissions,
        canManageSubordinates: true,
        canAccessTrinity: true,
        canProcessPayroll: true,
        canViewPayroll: true,
        canManageSchedules: true,
        canManageClients: true,
        canApproveTimesheets: true,
        canViewReports: true,
        canGenerateReports: true,
        canSuspendUsers: true,
        canRemoveUsers: false,
      };
    
    case 'supervisor':
      return {
        ...basePermissions,
        canApproveTimesheets: true,
        canViewReports: true, // Limited to their team
      };
    
    case 'auditor':
      return {
        ...basePermissions,
        canViewBilling: true,
        canViewPayroll: true,
        canViewReports: true,
        canClockInOut: false,
      };
    
    case 'contractor':
      return {
        ...basePermissions,
        // Contractors have minimal access
      };
    
    default:
      return basePermissions;
  }
}

// Get role badge color for UI
export function getRoleBadgeColor(role: WorkspaceRole | string | null | undefined): string {
  const normalized = normalizeRole(role as any);
  
  switch (normalized) {
    case 'org_owner':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30';
    case 'co_owner':
    case 'org_admin':
      return 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30';
    case 'manager':
    case 'department_manager':
      return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30';
    case 'supervisor':
      return 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30';
    case 'auditor':
      return 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/30';
    case 'contractor':
      return 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30';
    default:
      return 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/30';
  }
}
