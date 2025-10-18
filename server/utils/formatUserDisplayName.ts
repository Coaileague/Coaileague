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
 * Extract first name from email if first name not provided
 */
function extractFirstNameFromEmail(email?: string): string {
  if (!email) return 'User';
  
  const username = email.split('@')[0];
  const cleanName = username.replace(/[._-]/g, ' ');
  return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
}
