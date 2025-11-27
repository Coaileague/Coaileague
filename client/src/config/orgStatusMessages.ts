/**
 * Organization Status Messages Configuration
 * Per-organization dynamic toast notifications based on workspace status
 * 
 * Shows context-aware messages for:
 * - Active/Normal operation
 * - Suspended (non-payment)
 * - Suspended (other reasons)
 * - Maintenance mode
 * - Account restrictions
 * 
 * NO HARDCODED VALUES - All messages configurable per org
 */

export type OrgStatusType = 
  | "active" 
  | "suspended_payment" 
  | "suspended_violation" 
  | "suspended_other" 
  | "maintenance" 
  | "restricted" 
  | "trial_ending" 
  | "trial_expired";

export interface OrgStatusMessage {
  status: OrgStatusType;
  severity: "info" | "warning" | "error" | "success";
  title: string;
  description: string;
  actionLabel?: string;
  actionUrl?: string;
  icon: string;
  showWelcome: boolean;
  blockAccess: boolean;
  autoClose?: number | null; // ms, null = manual close
}

export const ORG_STATUS_MESSAGES_CONFIG: Record<OrgStatusType, OrgStatusMessage> = {
  // ✅ ACTIVE - Everything normal
  active: {
    status: "active",
    severity: "success",
    title: "Welcome back, {userName}!",
    description: "{orgName} is active and ready to use",
    icon: "Crown",
    showWelcome: true,
    blockAccess: false,
    autoClose: 3000,
  },

  // ⚠️ SUSPENDED FOR NON-PAYMENT
  suspended_payment: {
    status: "suspended_payment",
    severity: "error",
    title: "Payment Required",
    description: "Your organization is temporarily suspended due to an unpaid invoice. Please update your billing information to restore access.",
    actionLabel: "Update Payment Method",
    actionUrl: "/billing",
    icon: "AlertTriangle",
    showWelcome: false,
    blockAccess: true,
    autoClose: null, // Manual close until resolved
  },

  // ⚠️ SUSPENDED FOR POLICY VIOLATION
  suspended_violation: {
    status: "suspended_violation",
    severity: "error",
    title: "Account Suspended",
    description: "Your organization has been suspended due to a policy violation. Please contact our support team to discuss this matter.",
    actionLabel: "Contact Support",
    actionUrl: "/support",
    icon: "AlertCircle",
    showWelcome: false,
    blockAccess: true,
    autoClose: null,
  },

  // ⚠️ SUSPENDED FOR OTHER REASONS
  suspended_other: {
    status: "suspended_other",
    severity: "error",
    title: "Account Suspended",
    description: "Your organization is currently suspended. Please contact support for more information.",
    actionLabel: "Contact Support",
    actionUrl: "/support",
    icon: "Lock",
    showWelcome: false,
    blockAccess: true,
    autoClose: null,
  },

  // 🔧 MAINTENANCE MODE
  maintenance: {
    status: "maintenance",
    severity: "warning",
    title: "Scheduled Maintenance",
    description: "We're performing scheduled maintenance. Some features may be temporarily unavailable. Expected to be completed by {maintenanceEndTime}.",
    actionLabel: "View Status",
    actionUrl: "/status",
    icon: "Wrench",
    showWelcome: false,
    blockAccess: false,
    autoClose: null,
  },

  // 🚫 RESTRICTED - Limited access
  restricted: {
    status: "restricted",
    severity: "warning",
    title: "Account Restricted",
    description: "Your organization has limited access. Some features are temporarily unavailable.",
    actionLabel: "Learn More",
    actionUrl: "/support",
    icon: "Ban",
    showWelcome: false,
    blockAccess: false,
    autoClose: null,
  },

  // ⏰ TRIAL ENDING SOON
  trial_ending: {
    status: "trial_ending",
    severity: "warning",
    title: "Trial Period Ending Soon",
    description: "Your {daysRemaining}-day trial expires on {trialEndDate}. Upgrade now to continue using CoAIleague.",
    actionLabel: "View Plans",
    actionUrl: "/pricing",
    icon: "Clock",
    showWelcome: true,
    blockAccess: false,
    autoClose: null,
  },

  // ❌ TRIAL EXPIRED
  trial_expired: {
    status: "trial_expired",
    severity: "error",
    title: "Trial Expired",
    description: "Your trial period has ended. Subscribe to a plan to continue using CoAIleague.",
    actionLabel: "Choose Plan",
    actionUrl: "/pricing",
    icon: "AlertTriangle",
    showWelcome: false,
    blockAccess: true,
    autoClose: null,
  },
};

/**
 * Get status message for organization
 * Replaces template variables with actual data
 */
export function getOrgStatusMessage(
  status: OrgStatusType,
  context: {
    userName?: string;
    orgName?: string;
    daysRemaining?: number;
    trialEndDate?: string;
    maintenanceEndTime?: string;
  }
): OrgStatusMessage {
  const message = ORG_STATUS_MESSAGES_CONFIG[status];
  if (!message) return ORG_STATUS_MESSAGES_CONFIG.active;

  // Clone to avoid mutating config
  const enrichedMessage = { ...message };

  // Replace template variables
  enrichedMessage.title = enrichedMessage.title
    .replace("{userName}", context.userName || "User")
    .replace("{orgName}", context.orgName || "organization");

  enrichedMessage.description = enrichedMessage.description
    .replace("{orgName}", context.orgName || "organization")
    .replace("{daysRemaining}", String(context.daysRemaining || 0))
    .replace("{trialEndDate}", context.trialEndDate || "")
    .replace("{maintenanceEndTime}", context.maintenanceEndTime || "");

  return enrichedMessage;
}

/**
 * Get all org statuses (for admin configuration)
 */
export function getAllOrgStatuses(): OrgStatusType[] {
  return Object.keys(ORG_STATUS_MESSAGES_CONFIG) as OrgStatusType[];
}

/**
 * Check if status blocks access
 */
export function doesStatusBlockAccess(status: OrgStatusType): boolean {
  return ORG_STATUS_MESSAGES_CONFIG[status]?.blockAccess || false;
}

/**
 * Custom message override per organization
 * Allows orgs to have personalized status messages
 */
export interface OrgCustomization {
  workspaceId: string;
  statusOverrides?: Partial<Record<OrgStatusType, Partial<OrgStatusMessage>>>;
  customMessages?: Record<string, string>;
}

/**
 * Get customized message for org (if overrides exist)
 */
export function getCustomizedOrgMessage(
  status: OrgStatusType,
  orgCustomization?: OrgCustomization,
  context?: any
): OrgStatusMessage {
  const baseMessage = getOrgStatusMessage(status, context);

  if (!orgCustomization?.statusOverrides?.[status]) {
    return baseMessage;
  }

  // Merge org-specific overrides
  return {
    ...baseMessage,
    ...orgCustomization.statusOverrides[status],
  };
}

// API endpoints for org status
export const ORG_STATUS_API = {
  getOrgStatus: "/api/workspace/status",
  updateOrgStatus: "/api/workspace/status", // admin only
  getCustomMessages: "/api/workspace/custom-messages",
  setCustomMessages: "/api/workspace/custom-messages", // admin only
};

// Test IDs
export const ORG_STATUS_TEST_IDS = {
  toast: "toast-org-status",
  toastTitle: "text-org-status-title",
  toastDescription: "text-org-status-description",
  actionButton: "button-org-status-action",
  closeButton: "button-close-org-status",
};
