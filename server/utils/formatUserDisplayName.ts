// Utility to format user display names for chat with role suffix in parentheses
// Shows: "Brigido (RAdmin)", "James (Sysop)", "Mary (Guest)", "Robin (Subscriber)", etc.

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
 * Format user display name with role suffix in parentheses for chat messages
 * Examples:
 * - "Brigido (RAdmin)" (platform root - role in parentheses)
 * - "James (Sysop)" (platform staff - role in parentheses)
 * - "Tom (Manager)" (workspace staff - role in parentheses)
 * - "Sarah (Employee)" (workspace employee - role in parentheses)
 * - "Mary (Guest)" (ticket guest - role in parentheses)
 * - "Robin (Subscriber)" (verified customer - role in parentheses)
 */
export function formatUserDisplayName(user: UserInfo): string {
  const firstName = user.firstName || extractFirstNameFromEmail(user.email);
  
  // Platform roles (WorkforceOS staff) - name first, then (Role)
  if (user.platformRole && user.platformRole !== 'none') {
    const roleTitle = formatPlatformRole(user.platformRole);
    return `${firstName} (${roleTitle})`;
  }
  
  // Workspace roles (organizational roles) - name first, then (Role)
  if (user.workspaceRole && user.workspaceRole !== 'employee') {
    const roleTitle = formatWorkspaceRole(user.workspaceRole);
    return `${firstName} (${roleTitle})`;
  }
  
  // Guest (ticket holder) - name first, then (Guest)
  if (user.isGuest) {
    return `${firstName} (Guest)`;
  }
  
  // Subscriber (verified customer account) - name first, then (Subscriber)
  if (user.isSubscriber) {
    return `${firstName} (Subscriber)`;
  }
  
  // Default: Employee or regular user
  return `${firstName} (Employee)`;
}

/**
 * Format platform role
 * Note: Client-side will render WorkforceOS logo icon for staff
 * 
 * Hierarchy:
 * 1. root → Root Admin (highest authority)
 * 2. deputy_admin → Deputy Admin (deputy to root)
 * 3. deputy_assistant → Assistant (deputy's assistant)
 * 4. sysop → System Operator (backbone support)
 */
function formatPlatformRole(role: string): string {
  const roleMap: Record<string, string> = {
    'root': 'RAdmin',             // Root Admin (you - highest authority)
    'deputy_admin': 'DAdmin',     // Deputy Admin (your deputy)
    'deputy_assistant': 'Assistant', // Assistant (deputy's assistant)
    'sysop': 'Sysop',            // System Operator (backbone support)
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
