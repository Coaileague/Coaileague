// Utility to format user display names for chat
// Returns clean name without role suffixes - frontend handles role badges via superscript

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
 * Format user display name - returns clean name only
 * Frontend handles role display with superscript badges
 * Examples: "Brigido Root", "Sarah Martinez", "John Doe"
 */
export function formatUserDisplayName(user: UserInfo): string {
  const firstName = user.firstName || extractFirstNameFromEmail(user.email);
  const lastName = user.lastName || '';
  const fullName = lastName ? `${firstName} ${lastName}` : firstName;
  
  // Return just the name - frontend handles role display with superscript badges
  return fullName;
}

/**
 * Format user display name for chat user lists and join/leave messages
 * Support staff: "Title FirstName" (e.g., "Admin Brigido", "SysOp James")
 * Regular users: "FirstName LastName" (e.g., "Sarah Martinez", "John Doe")
 */
export function formatUserDisplayNameForChat(user: UserInfo): string {
  const firstName = user.firstName || extractFirstNameFromEmail(user.email);
  const lastName = user.lastName || '';
  
  // Check if user is support staff with a platform role
  const isStaff = user.platformRole && ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(user.platformRole);
  
  if (isStaff && user.platformRole) {
    // Format: "Title FirstName" for support staff
    const title = getRoleTitlePrefix(user.platformRole);
    return `${title} ${firstName}`;
  } else {
    // Format: "FirstName LastName" for regular users
    return lastName ? `${firstName} ${lastName}` : firstName;
  }
}

/**
 * Get role title prefix for support staff
 */
function getRoleTitlePrefix(role: string): string {
  switch(role) {
    case 'root': return 'Admin';
    case 'deputy_admin': return 'Deputy';
    case 'deputy_assistant': return 'Assistant';
    case 'sysop': return 'SysOp';
    default: return '';
  }
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
