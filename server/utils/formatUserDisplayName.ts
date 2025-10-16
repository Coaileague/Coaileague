// Utility to format user display names for chat with role-based icons
// Shows: "⚖️ Root Brigido", "🛡️ Sysop James", "👤 Guest Mary", "⭐ Subscriber Robin", etc.

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
 * Format user display name with role prefix and icon for chat messages
 * Examples:
 * - "⚖️ Root Brigido" (platform root - judge gavel icon like MSN chat host)
 * - "🛡️ Sysop James" (platform staff - shield icon for backbone/defense)
 * - "Manager Tom" (workspace staff - no icon)
 * - "Employee Sarah" (workspace employee - no icon)
 * - "👤 Guest Mary" (ticket guest - person icon)
 * - "⭐ Subscriber Robin" (verified customer - star icon)
 */
export function formatUserDisplayName(user: UserInfo): string {
  const firstName = user.firstName || extractFirstNameFromEmail(user.email);
  
  // Platform roles (WorkforceOS staff) with icons
  if (user.platformRole && user.platformRole !== 'none') {
    const roleWithIcon = formatPlatformRole(user.platformRole);
    return `${roleWithIcon} ${firstName}`;
  }
  
  // Workspace roles (organizational roles) - no icons
  if (user.workspaceRole && user.workspaceRole !== 'employee') {
    const roleTitle = formatWorkspaceRole(user.workspaceRole);
    return `${roleTitle} ${firstName}`;
  }
  
  // Guest (ticket holder) with icon
  if (user.isGuest) {
    return `👤 Guest ${firstName}`;
  }
  
  // Subscriber (verified customer account) with icon
  if (user.isSubscriber) {
    return `⭐ Subscriber ${firstName}`;
  }
  
  // Default: Employee or regular user (no icon)
  return `Employee ${firstName}`;
}

/**
 * Format platform role with special marker
 * Staff roles get 🔨 gavel marker (authority indicator)
 * Note: Client-side will render actual gavel icon image
 * 
 * Hierarchy:
 * 1. root → Root Admin (highest authority)
 * 2. deputy_admin → Deputy Admin (deputy to root)
 * 3. deputy_assistant → Assistant (deputy's assistant)
 * 4. sysop → System Operator (backbone support)
 */
function formatPlatformRole(role: string): string {
  const roleMap: Record<string, string> = {
    'root': '🔨 RAdmin',             // Root Admin (you - highest authority)
    'deputy_admin': '🔨 DAdmin',     // Deputy Admin (your deputy)
    'deputy_assistant': '🔨 Assistant', // Assistant (deputy's assistant)
    'sysop': '🔨 Sysop',            // System Operator (backbone support)
  };
  
  return roleMap[role] || '🔨 Staff';
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
