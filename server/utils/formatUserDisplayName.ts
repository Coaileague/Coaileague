// Utility to format user display names for chat
// Shows: "Root Brigido", "Sysop James", "Manager Tom", "Guest Mary", etc.

interface UserInfo {
  firstName?: string | null;
  lastName?: string | null;
  email?: string;
  platformRole?: string | null;
  workspaceRole?: string | null;
  isGuest?: boolean;
  isSubscriber?: boolean;
}

/**
 * Format user display name with role prefix for chat messages
 * Examples:
 * - "Root Brigido" (platform staff)
 * - "Sysop James" (platform staff)
 * - "Manager Tom" (workspace staff)
 * - "Employee Sarah" (workspace employee)
 * - "Guest Mary" (ticket guest)
 * - "Subscriber Robin" (verified customer)
 */
export function formatUserDisplayName(user: UserInfo): string {
  const firstName = user.firstName || extractFirstNameFromEmail(user.email);
  
  // Platform roles (WorkforceOS staff)
  if (user.platformRole && user.platformRole !== 'none') {
    const roleTitle = formatPlatformRole(user.platformRole);
    return `${roleTitle} ${firstName}`;
  }
  
  // Workspace roles (organizational roles)
  if (user.workspaceRole && user.workspaceRole !== 'employee') {
    const roleTitle = formatWorkspaceRole(user.workspaceRole);
    return `${roleTitle} ${firstName}`;
  }
  
  // Guest (ticket holder)
  if (user.isGuest) {
    return `Guest ${firstName}`;
  }
  
  // Subscriber (verified customer account)
  if (user.isSubscriber) {
    return `Subscriber ${firstName}`;
  }
  
  // Default: Employee or regular user
  return `Employee ${firstName}`;
}

/**
 * Format platform role to titlecase
 */
function formatPlatformRole(role: string): string {
  const roleMap: Record<string, string> = {
    'root': 'Root',
    'platform_admin': 'Admin',
    'deputy_admin': 'Deputy',
    'deputy_assistant': 'Assistant',
    'sysop': 'Sysop',
  };
  
  return roleMap[role] || 'Staff';
}

/**
 * Format workspace role to titlecase
 */
function formatWorkspaceRole(role: string): string {
  const roleMap: Record<string, string> = {
    'owner': 'Owner',
    'manager': 'Manager',
    'supervisor': 'Supervisor',
    'employee': 'Employee',
    'auditor': 'Auditor',
    'billing': 'Billing',
    'apar': 'ApAr',
  };
  
  return roleMap[role] || role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * Extract first name from email if first name not provided
 */
function extractFirstNameFromEmail(email?: string): string {
  if (!email) return 'User';
  
  const username = email.split('@')[0];
  const cleanName = username.replace(/[._-]/g, ' ');
  return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
}
