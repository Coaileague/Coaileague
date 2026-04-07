/**
 * Staff Hierarchy & Protection System
 * Ensures lower-level staff cannot take action against higher-level staff
 */

// Platform role hierarchy (higher number = higher authority)
const ROLE_HIERARCHY = {
  'root_admin': 100,              // Highest authority - can do anything
  'deputy_admin': 80,             // Second highest - can manage all below
  'support_manager': 60,          // Can manage sysops and regular staff
  'compliance_officer': 50,       // Compliance and audit oversight
  'sysop': 40,                    // Can manage regular staff
  'support_agent': 20,            // Basic support staff
  'customer': 0,                  // Regular users
  'guest': 0,                     // Temporary access
} as const;

export type PlatformRole = keyof typeof ROLE_HIERARCHY;

/**
 * Get the authority level for a platform role
 */
export function getRoleLevel(role: string | null | undefined): number {
  if (!role) return 0;
  return ROLE_HIERARCHY[role as PlatformRole] || 0;
}

/**
 * Check if actorRole can take action against targetRole
 * Returns true if actor has higher authority than target
 */
export function canActOnStaff(actorRole: string | null | undefined, targetRole: string | null | undefined): boolean {
  const actorLevel = getRoleLevel(actorRole);
  const targetLevel = getRoleLevel(targetRole);
  
  // Actor must have higher authority than target
  return actorLevel > targetLevel;
}

/**
 * Check if a role is considered support staff
 */
export function isStaffRole(role: string | null | undefined): boolean {
  if (!role) return false;
  const level = getRoleLevel(role);
  return level >= ROLE_HIERARCHY.support_agent;
}

/**
 * Check if a role has emergency/admin privileges
 */
export function hasEmergencyPrivileges(role: string | null | undefined): boolean {
  if (!role) return false;
  const level = getRoleLevel(role);
  // Only root and deputy_admin can access emergency commands
  return level >= ROLE_HIERARCHY.deputy_admin;
}

/**
 * Check if a role can use moderation commands
 */
export function canUseModerationCommands(role: string | null | undefined): boolean {
  if (!role) return false;
  const level = getRoleLevel(role);
  // Staff level and above can use basic moderation
  return level >= ROLE_HIERARCHY.support_agent;
}

/**
 * Get human-readable role description
 */
export function getRoleDescription(role: string | null | undefined): string {
  if (!role) return 'Guest';
  
  switch (role) {
    case 'root_admin':
      return 'Root Administrator';
    case 'deputy_admin':
      return 'Deputy Administrator';
    case 'support_manager':
      return 'Support Manager';
    case 'compliance_officer':
      return 'Compliance Officer';
    case 'sysop':
      return 'System Operator';
    case 'support_agent':
      return 'Support Staff';
    case 'customer':
      return 'Customer';
    case 'guest':
      return 'Guest';
    default:
      return 'User';
  }
}

/**
 * Get staff action authorization result with detailed message
 */
export function checkStaffActionAuthorization(
  actorRole: string | null | undefined,
  targetRole: string | null | undefined,
  actionType: string
): { authorized: boolean; reason?: string } {
  
  // Check if actor is staff
  if (!isStaffRole(actorRole)) {
    return {
      authorized: false,
      reason: `You must be support staff to use ${actionType} commands.`
    };
  }
  
  // Check if target is also staff
  if (!isStaffRole(targetRole)) {
    // Regular users can be acted upon by any staff
    return { authorized: true };
  }
  
  // Both are staff - check hierarchy
  if (!canActOnStaff(actorRole, targetRole)) {
    const actorDesc = getRoleDescription(actorRole);
    const targetDesc = getRoleDescription(targetRole);
    return {
      authorized: false,
      reason: `${actorDesc} cannot ${actionType} ${targetDesc}. Only higher-ranking staff can take action against other staff members.`
    };
  }
  
  return { authorized: true };
}
