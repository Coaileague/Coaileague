/**
 * MVP Feature Flag System - Client Side
 * Controls which UI elements are visible for MVP launch
 * 
 * IMPORTANT: Enterprise features are hidden, not deleted
 * They will be reactivated for Fortune 500 customers
 */

export const MVP_FEATURE_FLAGS = {
  // =============================================
  // MVP Features (VISIBLE) - Core Workforce Management
  // =============================================
  DASHBOARD: true,
  EMPLOYEES: true,
  SCHEDULE: true,
  TIME_TRACKING: true,
  PAYROLL: true,
  INVOICES: true,
  TRINITY_AI_CHAT: true,
  SETTINGS: true,
  CHATROOMS: true,
  HELPDESK: true,
  CLIENTS: true,
  BASIC_REPORTS: true,
  
  // =============================================
  // Enterprise Features (HIDDEN for MVP)
  // =============================================
  INFRASTRUCTURE_DASHBOARD: false,
  LAUNCH_READINESS: false,
  CHAOS_TESTING: false,
  COMPLIANCE_TRACKING: false,
  ADVANCED_ANALYTICS: false,
  SLA_MONITORING: false,
  PLATFORM_ADMIN: false,  // Only visible to internal staff
  SYSTEM_HEALTH: false,
  AI_CONSOLE: false,
  TRINITY_COMMAND_CENTER: false,
  AUDIT_LOGS: false,
  ORG_MANAGEMENT: false,
};

/**
 * Routes to hide from MVP navigation
 * These map to route IDs in sidebarModules.ts
 */
export const HIDDEN_ROUTE_IDS = [
  'infrastructure-monitoring',
  'system-health',
  'support-ai-console',
  'trinity-command-center',
  'admin-command-center',
  'end-user-controls',
  'org-management',
  'platform-users',
  'root-admin-dashboard',
  'audit-logs',
  'analytics', // Enterprise analytics
];

/**
 * Sidebar families to hide for MVP
 * 'platform' section is hidden for regular users
 */
export const HIDDEN_FAMILIES_FOR_MVP = [
  // 'platform' family routes are hidden unless user is platform staff
];

/**
 * Check if a route should be visible in MVP
 */
export function isRouteVisibleInMVP(routeId: string): boolean {
  return !HIDDEN_ROUTE_IDS.includes(routeId);
}

/**
 * Check if MVP feature is enabled
 */
export function isMVPFeatureEnabled(feature: keyof typeof MVP_FEATURE_FLAGS): boolean {
  return MVP_FEATURE_FLAGS[feature] ?? false;
}
