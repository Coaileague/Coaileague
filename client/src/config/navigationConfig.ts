/**
 * Universal Navigation Configuration
 * Single source of truth for all navigation paths
 * EDIT THIS FILE TO UPDATE NAVIGATION EVERYWHERE
 */

export const navConfig = {
  // Authentication Routes
  auth: {
    login: "/login",
    register: "/register",
    customLogin: "/custom-login",
    customRegister: "/custom-register",
    forgotPassword: "/forgot-password",
    resetPassword: "/reset-password",
    mfaSetup: "/security/setup-2fa",
  },

  // Public Routes
  public: {
    landing: "/",
    homepage: "/homepage",
    pricing: "/pricing",
    contact: "/contact",
    support: "/support",
    terms: "/terms-of-service",
    privacy: "/privacy-policy",
  },

  // Core App Routes
  app: {
    dashboard: "/dashboard",
    schedule: "/schedule",
    dailySchedule: "/schedule/daily",
    mobileSchedule: "/schedule/mobile",
    timeTracking: "/time-tracking",
    employees: "/employees",
    clients: "/clients",
    invoices: "/invoices",
    analytics: "/analytics",
    settings: "/settings",
    reports: "/reports",
    chat: "/chat",
    chatrooms: "/chatrooms",
    notifications: "/notifications",
  },

  // Workspace Management
  workspace: {
    create: "/create-org",
    settings: "/workspace",
    billing: "/billing",
    usage: "/usage-dashboard",
    health: "/health-check",
  },

  // HR & Payroll
  hr: {
    benefits: "/hr-benefits",
    reviews: "/hr-reviews",
    pto: "/hr-pto",
    terminations: "/hr-terminations",
    payroll: "/payroll-dashboard",
    paychecks: "/my-paychecks",
    expenses: "/expenses",
    expenseApprovals: "/expense-approvals",
    fileGrievance: "/file-grievance",
  },

  // Compliance & Admin
  admin: {
    platform: "/platform-admin",
    root: "/root-admin-portal",
    dashboard: "/root-admin-dashboard",
    users: "/platform-users",
    commands: "/admin-command-center",
    usage: "/admin-usage",
    customForms: "/admin-custom-forms",
    banners: "/admin-banners",
    ticketReviews: "/admin-ticket-reviews",
    i9Compliance: "/i9-compliance",
    policies: "/policies",
    roleManagement: "/role-management",
    auditLogs: "/audit-logs",
  },

  // Employee/Portal Routes
  employee: {
    profile: "/profile",
    portal: "/employee-portal",
    fileCabinet: "/employee-file-cabinet",
    unavailability: "/unavailability",
    myAuditRecord: "/my-audit-record",
    pendingTimeEntries: "/pending-time-entries",
    timesheetApprovals: "/timesheet-approvals",
  },

  // Special Portals
  portal: {
    sales: "/sales-portal",
    client: "/client-portal",
    auditor: "/auditor-portal",
    helpDesk: "/helpdesk",
  },

  // AI/OS Routes
  ai: {
    communications: "/comm-os",
    communicationsOnboarding: "/comm-os-onboarding",
    diagnostics: "/query-os",
    training: "/training-os",
    budgeting: "/budget-os",
    integrations: "/integration-os",
    records: "/record-os",
    analytics: "/insight-os",
    commandCenter: "/ai-command-center",
  },

  // OS Families
  osFamily: {
    communication: "/os-family-communication",
    operations: "/os-family-operations",
    growth: "/os-family-growth",
    platform: "/os-family-platform",
  },

  // Manager/Leadership Routes
  manager: {
    hub: "/leaders-hub",
    dashboard: "/manager-dashboard",
    workflowApprovals: "/workflow-approvals",
    engagement: "/engagement-dashboard",
    engagementEmployee: "/engagement-employee",
  },

  // Misc Routes
  misc: {
    onboarding: "/onboarding",
    hiringWorkflow: "/hireos-workflow-builder",
    helpCenter: "/help",
    updates: "/updates",
    feedback: "/feedback",
    whatsNew: "/whats-new",
    disputes: "/disputes",
    reviewDisputes: "/review-disputes",
    privateMessages: "/private-messages",
    payInvoice: "/pay-invoice",
    companyReports: "/company-reports",
    analyticsReports: "/analytics-reports",
    logoShowcase: "/logo-showcase",
    oversightHub: "/oversight-hub",
    automationControl: "/automation-control",
    automationAuditLog: "/automation-audit-log",
    integrations: "/integrations-page",
    salesDashboard: "/sales/dashboard",
  },

  // Error Routes
  error: {
    notFound: "/not-found",
    forbidden: "/error-403",
    unauthorized: "/error-404",
    serverError: "/error-500",
  },

  // External URLs
  external: {
    docs: "https://docs.autoforce.com",
    support: "https://support.autoforce.com",
    status: "https://status.autoforce.com",
  },
} as const;

/**
 * Helper functions for navigation
 */

export function getNavPath(path: string): string {
  return path;
}

export function buildPath(base: string, params: Record<string, string>): string {
  let result = base;
  Object.entries(params).forEach(([key, value]) => {
    result = result.replace(`:${key}`, value);
  });
  return result;
}

export function isPublicRoute(path: string): boolean {
  const publicPaths = Object.values(navConfig.public);
  const authPaths = Object.values(navConfig.auth);
  return publicPaths.includes(path as any) || authPaths.includes(path as any);
}

export function redirectTo(path: string, replace = false): void {
  if (replace) {
    window.location.replace(path);
  } else {
    window.location.href = path;
  }
}
