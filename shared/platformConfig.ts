/**
 * MASTER PLATFORM CONFIGURATION
 * =============================
 * Single source of truth for ALL platform settings, branding, and RBAC.
 * Edit values here to change behavior everywhere instantly.
 * NO HARDCODED VALUES ALLOWED - everything must reference this config.
 */

// ============================================================================
// PLATFORM IDENTITY
// ============================================================================
export const PLATFORM = {
  name: "CoAIleague",
  tagline: "AI-Powered Workforce Intelligence",
  description: "Fortune 500-grade multi-tenant autonomous workforce management platform",
  version: "2.0.0",
  copyright: `© ${new Date().getFullYear()} CoAIleague. All rights reserved.`,
  supportEmail: "support@coaileague.com",
  website: "https://coaileague.com",
} as const;

// ============================================================================
// WORKSPACE CONFIGURATION
// ============================================================================
export const WORKSPACE = {
  platformWorkspaceId: "coaileague-platform-workspace",
  defaultTimezone: "America/New_York",
  defaultCurrency: "USD",
  defaultLanguage: "en",
  maxEmployeesPerWorkspace: 10000,
  maxClientsPerWorkspace: 1000,
} as const;

// ============================================================================
// RESPONSIVE & MOBILE CONFIGURATION
// ============================================================================
export const RESPONSIVE = {
  breakpoints: {
    mobile: 320,
    small: 480,
    tablet: 768,
    desktop: 1024,
    wide: 1280,
    ultrawide: 1536,
  },
  touchTargetMinSize: 44,  // WCAG accessibility standard
  headerHeights: {
    mobile: 56,
    tablet: 64,
    desktop: 80,
  },
  safeAreaInsets: {
    top: "var(--safe-area-inset-top, 0px)",
    bottom: "var(--safe-area-inset-bottom, 0px)",
    left: "var(--safe-area-inset-left, 0px)",
    right: "var(--safe-area-inset-right, 0px)",
  },
  zoomLimits: {
    min: 0.8,
    max: 2.0,
  },
} as const;

// ============================================================================
// BRANDING & THEMING
// ============================================================================
export const BRANDING = {
  colors: {
    primary: "#3b82f6",      // Blue
    secondary: "#10b981",    // Green
    accent: "#06b6d4",       // Cyan
    gradient: "from-blue-500 via-green-500 to-cyan-500",
    darkBg: "#0f172a",
    lightBg: "#ffffff",
  },
  logo: {
    svg: "/logo.svg",           // CoAIleague AI network gradient logo
    icon192: "/icon-192.png",   // 192px app icon
    icon512: "/icon-512.png",   // 512px app icon
    favicon: "/favicon.ico",    // Browser tab favicon
    brandColors: {
      primary: "#3b82f6",       // Blue (AI, trust, intelligence)
      secondary: "#10b981",     // Green (automation, growth)
      accent: "#06b6d4",        // Cyan (innovation, future)
    }
  },
  fonts: {
    heading: "Inter, system-ui, sans-serif",
    body: "Inter, system-ui, sans-serif",
    mono: "JetBrains Mono, monospace",
  },
} as const;

// ============================================================================
// RBAC ROLES & PERMISSIONS
// ============================================================================
export const ROLES = {
  PLATFORM_ADMIN: "platform_admin",
  ROOT_ADMIN: "root_admin",
  WORKSPACE_OWNER: "owner",
  ADMIN: "admin",
  MANAGER: "manager",
  SUPERVISOR: "supervisor",
  EMPLOYEE: "employee",
  CLIENT: "client",
  AUDITOR: "auditor",
  CONTRACTOR: "contractor",
} as const;

export const ROLE_HIERARCHY = {
  [ROLES.PLATFORM_ADMIN]: 100,
  [ROLES.ROOT_ADMIN]: 90,
  [ROLES.WORKSPACE_OWNER]: 80,
  [ROLES.ADMIN]: 70,
  [ROLES.MANAGER]: 60,
  [ROLES.SUPERVISOR]: 50,
  [ROLES.EMPLOYEE]: 30,
  [ROLES.CONTRACTOR]: 25,
  [ROLES.CLIENT]: 20,
  [ROLES.AUDITOR]: 10,
} as const;

export const PERMISSIONS = {
  VIEW_DASHBOARD: "view:dashboard",
  VIEW_EMPLOYEES: "view:employees",
  MANAGE_EMPLOYEES: "manage:employees",
  VIEW_SCHEDULES: "view:schedules",
  MANAGE_SCHEDULES: "manage:schedules",
  VIEW_TIMESHEETS: "view:timesheets",
  APPROVE_TIMESHEETS: "approve:timesheets",
  VIEW_PAYROLL: "view:payroll",
  MANAGE_PAYROLL: "manage:payroll",
  VIEW_INVOICES: "view:invoices",
  MANAGE_INVOICES: "manage:invoices",
  VIEW_CLIENTS: "view:clients",
  MANAGE_CLIENTS: "manage:clients",
  VIEW_REPORTS: "view:reports",
  MANAGE_REPORTS: "manage:reports",
  VIEW_SETTINGS: "view:settings",
  MANAGE_SETTINGS: "manage:settings",
  VIEW_BILLING: "view:billing",
  MANAGE_BILLING: "manage:billing",
  VIEW_ANALYTICS: "view:analytics",
  MANAGE_WORKSPACE: "manage:workspace",
  MANAGE_USERS: "manage:users",
  VIEW_AUDIT_LOGS: "view:audit_logs",
  MANAGE_INTEGRATIONS: "manage:integrations",
  ACCESS_AI_FEATURES: "access:ai_features",
  MANAGE_CONTRACTORS: "manage:contractors",
} as const;

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  [ROLES.PLATFORM_ADMIN]: Object.values(PERMISSIONS),
  [ROLES.ROOT_ADMIN]: Object.values(PERMISSIONS),
  [ROLES.WORKSPACE_OWNER]: Object.values(PERMISSIONS),
  [ROLES.ADMIN]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_EMPLOYEES,
    PERMISSIONS.MANAGE_EMPLOYEES,
    PERMISSIONS.VIEW_SCHEDULES,
    PERMISSIONS.MANAGE_SCHEDULES,
    PERMISSIONS.VIEW_TIMESHEETS,
    PERMISSIONS.APPROVE_TIMESHEETS,
    PERMISSIONS.VIEW_PAYROLL,
    PERMISSIONS.MANAGE_PAYROLL,
    PERMISSIONS.VIEW_INVOICES,
    PERMISSIONS.MANAGE_INVOICES,
    PERMISSIONS.VIEW_CLIENTS,
    PERMISSIONS.MANAGE_CLIENTS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_REPORTS,
    PERMISSIONS.VIEW_SETTINGS,
    PERMISSIONS.VIEW_BILLING,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.VIEW_AUDIT_LOGS,
    PERMISSIONS.ACCESS_AI_FEATURES,
    PERMISSIONS.MANAGE_CONTRACTORS,
  ],
  [ROLES.MANAGER]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_EMPLOYEES,
    PERMISSIONS.VIEW_SCHEDULES,
    PERMISSIONS.MANAGE_SCHEDULES,
    PERMISSIONS.VIEW_TIMESHEETS,
    PERMISSIONS.APPROVE_TIMESHEETS,
    PERMISSIONS.VIEW_CLIENTS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.ACCESS_AI_FEATURES,
  ],
  [ROLES.SUPERVISOR]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_EMPLOYEES,
    PERMISSIONS.VIEW_SCHEDULES,
    PERMISSIONS.VIEW_TIMESHEETS,
    PERMISSIONS.APPROVE_TIMESHEETS,
    PERMISSIONS.VIEW_REPORTS,
  ],
  [ROLES.EMPLOYEE]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_SCHEDULES,
    PERMISSIONS.VIEW_TIMESHEETS,
  ],
  [ROLES.CONTRACTOR]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_SCHEDULES,
    PERMISSIONS.VIEW_TIMESHEETS,
  ],
  [ROLES.CLIENT]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_INVOICES,
    PERMISSIONS.VIEW_REPORTS,
  ],
  [ROLES.AUDITOR]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_EMPLOYEES,
    PERMISSIONS.VIEW_SCHEDULES,
    PERMISSIONS.VIEW_TIMESHEETS,
    PERMISSIONS.VIEW_PAYROLL,
    PERMISSIONS.VIEW_INVOICES,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.VIEW_AUDIT_LOGS,
  ],
};

// ============================================================================
// UI CONFIGURATION
// ============================================================================
export const UI = {
  defaultTheme: "light" as "light" | "dark" | "system",
  animationDuration: 300,
  transitionDuration: 200,
  toastDuration: 3000,
  notificationDuration: 6000,
  sidebarWidth: "280px",
  sidebarCollapsedWidth: "64px",
  headerHeight: "64px",
  mobileBreakpoint: 768,
  tabletBreakpoint: 1024,
} as const;

// ============================================================================
// PAGINATION & LISTS
// ============================================================================
export const PAGINATION = {
  defaultPageSize: 10,
  maxPageSize: 100,
  pageSizeOptions: [5, 10, 20, 50, 100] as const,
} as const;

// ============================================================================
// TIMEOUTS & RETRIES
// ============================================================================
export const TIMING = {
  requestTimeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
  cacheExpiry: 5 * 60 * 1000, // 5 minutes
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  tokenRefreshBuffer: 5 * 60 * 1000, // 5 minutes before expiry
} as const;

// ============================================================================
// FEATURE TOGGLES - Production Ready
// ============================================================================
// Edit these to enable/disable features across the entire platform
// Changes take effect immediately on restart
export const FEATURES = {
  // Core AI Features
  enableAI: true,
  enableDocumentExtraction: true,
  enableSentimentAnalysis: true,
  enableAutonomousScheduling: true,
  
  // Autonomous Jobs
  enableAutonomousBilling: true,
  enablePayrollAutomation: true,
  enableInvoiceAutomation: true,
  enableComplianceAlerts: true,
  
  // Billing System (NEW)
  enableBillingAPI: true,
  enableStripeWebhooks: true,
  enableTrialSystem: true,
  enableUsageTracking: true,
  enableOverageBilling: true,
  enableCreditSystem: true,
  
  // Real-Time Features
  enableWebSocket: true,
  enableNotifications: true,
  enableDisputeResolution: true,
  
  // Workforce Features
  enableContractorPool: true,
  enableGPS: true,
  enableGamification: true,  // Employee engagement & recognition
  
  // Time Tracking & Timesheets
  enableTimeTracking: true,
  enableTimesheetReports: true,
  enableTimesheetExport: true,
  enableDragDropTimesheets: true,
  
  // Communication Features
  enableSMSNotifications: true,  // Twilio SMS integration
  enableEmailNotifications: true,
  enablePushNotifications: false,  // PWA push - future
  
  // Calendar Integration
  enableCalendarExport: true,  // ICS export
  enableGoogleCalendar: true,  // Google Calendar sync
  enableCalendarImport: true,
  
  // Advanced Scheduling
  enableRecurringShifts: true,
  enableShiftSwapping: true,
  enableAvailabilityRequests: true,
  enableOpenShifts: true,
  
  // Client Billing
  enableClientBilling: true,
  enableInvoiceFromTimeEntries: true,
  enableAutomatedReminders: true,
  
  // Platform Features
  enableWhatsNew: true,  // Dynamic What's New feed
  enableRealTimeUpdates: true,
  
  // Enterprise Features
  enableMFA: false,
  enableAdvancedAnalytics: true,
  enableCustomReporting: true,
} as const;

// ============================================================================
// AI CONFIGURATION
// ============================================================================
export const AI = {
  provider: "gemini" as const,
  model: "gemini-2.0-flash-exp",
  maxTokens: 8192,
  temperature: 0.7,
  schedulingConfidenceThreshold: 0.8,
  sentimentThreshold: 0.3,
  documentExtractionConfidence: 0.85,
} as const;

// ============================================================================
// API ENDPOINTS (relative paths)
// ============================================================================
export const API = {
  auth: {
    login: "/api/login",
    logout: "/api/logout",
    register: "/api/register",
    me: "/api/auth/me",
    refresh: "/api/auth/refresh",
  },
  employees: "/api/employees",
  schedules: "/api/schedules",
  timesheets: "/api/timesheets",
  payroll: "/api/payroll",
  invoices: "/api/invoices",
  clients: "/api/clients",
  workspaces: "/api/workspaces",
  reports: "/api/reports",
  analytics: "/api/analytics",
  billing: "/api/billing",
  notifications: "/api/notifications",
  ai: {
    schedule: "/api/ai/schedule",
    sentiment: "/api/ai/sentiment",
    extract: "/api/ai/extract",
    chat: "/api/ai/chat",
  },
} as const;

// ============================================================================
// MESSAGE TEMPLATES
// ============================================================================
export const MESSAGES = {
  loading: {
    default: "Loading...",
    dashboard: "Preparing your dashboard...",
    schedule: "Loading schedule data...",
    employees: "Fetching employee information...",
    reports: "Generating reports...",
    ai: "AI is thinking...",
  },
  errors: {
    generic: "Something went wrong. Please try again.",
    network: "Network error. Please check your connection.",
    unauthorized: "You don't have permission to access this resource.",
    notFound: "The requested resource was not found.",
    validation: "Please check your input and try again.",
    timeout: "Request timed out. Please try again.",
  },
  success: {
    saved: "Changes saved successfully.",
    created: "Created successfully.",
    updated: "Updated successfully.",
    deleted: "Deleted successfully.",
    sent: "Sent successfully.",
  },
  confirmations: {
    delete: "Are you sure you want to delete this? This action cannot be undone.",
    unsaved: "You have unsaved changes. Are you sure you want to leave?",
    logout: "Are you sure you want to log out?",
  },
} as const;

// ============================================================================
// NAVIGATION STRUCTURE
// ============================================================================
export const NAVIGATION = {
  main: [
    { label: "Dashboard", path: "/dashboard", icon: "LayoutDashboard", permission: PERMISSIONS.VIEW_DASHBOARD },
    { label: "Schedule", path: "/schedule", icon: "Calendar", permission: PERMISSIONS.VIEW_SCHEDULES },
    { label: "Time Tracking", path: "/time-tracking", icon: "Clock", permission: PERMISSIONS.VIEW_TIMESHEETS },
    { label: "Employees", path: "/employees", icon: "Users", permission: PERMISSIONS.VIEW_EMPLOYEES },
    { label: "Clients", path: "/clients", icon: "Building", permission: PERMISSIONS.VIEW_CLIENTS },
    { label: "Invoices", path: "/invoices", icon: "FileText", permission: PERMISSIONS.VIEW_INVOICES },
    { label: "Reports", path: "/reports", icon: "BarChart", permission: PERMISSIONS.VIEW_REPORTS },
    { label: "Analytics", path: "/analytics", icon: "TrendingUp", permission: PERMISSIONS.VIEW_ANALYTICS },
  ],
  admin: [
    { label: "Settings", path: "/settings", icon: "Settings", permission: PERMISSIONS.VIEW_SETTINGS },
    { label: "Billing", path: "/billing", icon: "CreditCard", permission: PERMISSIONS.VIEW_BILLING },
    { label: "Workspace", path: "/workspace", icon: "Building2", permission: PERMISSIONS.MANAGE_WORKSPACE },
  ],
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: string, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions ? permissions.includes(permission) : false;
}

/**
 * Check if role A is higher than role B in hierarchy
 */
export function isHigherRole(roleA: string, roleB: string): boolean {
  const hierarchyA = ROLE_HIERARCHY[roleA as keyof typeof ROLE_HIERARCHY] ?? 0;
  const hierarchyB = ROLE_HIERARCHY[roleB as keyof typeof ROLE_HIERARCHY] ?? 0;
  return hierarchyA > hierarchyB;
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: string): string[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof typeof FEATURES): boolean {
  return FEATURES[feature] ?? false;
}

/**
 * Get the full platform name with tagline
 */
export function getFullPlatformName(): string {
  return `${PLATFORM.name} - ${PLATFORM.tagline}`;
}

/**
 * Get branding gradient class
 */
export function getBrandGradient(): string {
  return `bg-gradient-to-r ${BRANDING.colors.gradient}`;
}

// ============================================================================
// AI BOT CONFIGURATION
// ============================================================================
export const BOT_CONFIG = {
  name: "CoAIleague AI",
  trademark: "™",
  description: "Autonomous workforce management AI assistant",
  greeting: "Welcome to CoAIleague™ Support. I'm here to help with any questions about workforce management, scheduling, payroll, and more.",
  systemPrompt: "You are CoAIleague™ AI, an elite autonomous workforce management platform assistant. You provide expert guidance on employee management, scheduling, payroll, analytics, and compliance. Be professional, helpful, and accurate in all responses.",
  features: [
    "Employee management guidance",
    "Shift scheduling assistance",
    "Payroll inquiries",
    "Analytics interpretation",
    "Compliance support",
    "Technical troubleshooting",
  ],
  rbacEnabled: true, // AI responses respect RBAC roles
  dataSync: true,    // Bot data syncs across mobile/desktop
  contextAware: true, // Bot understands workspace context
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================
export type Role = typeof ROLES[keyof typeof ROLES];
export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];
export type Feature = keyof typeof FEATURES;
