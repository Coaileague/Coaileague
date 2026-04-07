// Utility to format user display names for chat
// Returns clean name without role suffixes - frontend handles role badges via superscript
// PRIVACY: Platform/support staff show FIRST NAME ONLY to end users

interface UserInfo {
  firstName?: string | null;
  lastName?: string | null;
  email?: string;
  platformRole?: string | null;
  workspaceRole?: string | null;
  isGuest?: boolean;
  isSubscriber?: boolean;
}

const PLATFORM_STAFF_ROLES = [
  'root_admin',
  'deputy_admin',
  'support_manager',
  'sysop',
  'support_agent',
  'compliance_officer',
];

export function isPlatformStaffRole(role?: string | null): boolean {
  if (!role) return false;
  return PLATFORM_STAFF_ROLES.includes(role);
}

/**
 * Format user display name - returns clean FULL name
 * Used internally (admin panels, internal staff views, audit logs)
 * Examples: "Jane Root", "Sarah Martinez", "John Doe"
 */
export function formatUserDisplayName(user: UserInfo): string {
  const firstName = user.firstName || extractFirstNameFromEmail(user.email);
  const lastName = user.lastName || '';
  const fullName = lastName ? `${firstName} ${lastName}` : firstName;
  return fullName;
}

/**
 * Format user display name for end-user-facing contexts
 * PRIVACY: Platform/support staff see FIRST NAME ONLY — their role badge
 * identifies them as platform representatives. Full names are never exposed
 * to regular end users in chat, emails, tickets, or announcements.
 * Regular users: "FirstName LastName" (e.g., "Sarah Martinez")
 * Platform staff: "FirstName" only (e.g., "Jane")
 */
export function formatUserDisplayNameForChat(user: UserInfo): string {
  if (isPlatformStaffRole(user.platformRole)) {
    return user.firstName || extractFirstNameFromEmail(user.email);
  }
  return formatUserDisplayName(user);
}

/**
 * Format staff name for support sessions, ticket correspondence, and emails
 * Returns first name only for privacy — role badge shows platform affiliation
 */
export function formatStaffDisplayNameForEndUser(user: UserInfo): string {
  return user.firstName || extractFirstNameFromEmail(user.email);
}

/**
 * Get role title prefix for support staff
 */
function getRoleTitlePrefix(role: string): string {
  switch(role) {
    case 'root_admin': return 'Admin';
    case 'deputy_admin': return 'Deputy';
    case 'support_manager': return 'Assistant';
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
