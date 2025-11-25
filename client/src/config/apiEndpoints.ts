/**
 * API Endpoints Configuration
 * Single source of truth for EVERY API route
 * Change an endpoint here, it updates everywhere instantly
 */

export const API_ENDPOINTS = {
  // Authentication
  auth: {
    login: "/api/auth/login",
    logout: "/api/auth/logout",
    register: "/api/auth/register",
    me: "/api/auth/me",
    current: "/api/auth/me",
    passwordResetRequest: "/api/auth/reset-password-request",
    passwordResetConfirm: "/api/auth/reset-password-confirm",
    changePassword: "/api/auth/change-password",
    // MFA endpoints
    setupMfa: "/api/auth/mfa/setup",
    enableMfa: "/api/auth/mfa/enable",
    disableMfa: "/api/auth/mfa/disable",
    mfaStatus: "/api/auth/mfa/status",
    regenerateBackupCodes: "/api/auth/mfa/backup-codes/regenerate",
  },

  // Workspace
  workspace: {
    list: "/api/workspaces/all",
    switch: "/api/workspace/switch/:workspaceId",
    get: "/api/workspace",
    current: "/api/workspace",
    health: "/api/workspace/health",
    getHealth: "/api/workspace/health",
    status: "/api/workspace/status",
    customMessages: "/api/workspace/custom-messages",
    upgrade: "/api/workspace/upgrade",
    seedFormTemplates: "/api/workspace/seed-form-templates",
    theme: "/api/workspace/theme",
    access: "/api/workspace/access",
  },

  // Employees
  employees: {
    list: "/api/employees",
    create: "/api/employees",
    get: "/api/employees/:id",
    update: "/api/employees/:id",
    delete: "/api/employees/:id",
    me: "/api/employees/me",
    bulk: "/api/employees/bulk",
  },

  // Shifts
  shifts: {
    list: "/api/shifts",
    create: "/api/shifts",
    get: "/api/shifts/:id",
    update: "/api/shifts/:id",
    delete: "/api/shifts/:id",
    publish: "/api/shifts/:id/publish",
    pendingActions: "/api/shifts/approvals/pending",
    approveAction: "/api/shifts/approvals/:id/approve",
  },

  // Time Entries
  timeEntries: {
    list: "/api/time-entries",
    create: "/api/time-entries",
    get: "/api/time-entries/:id",
    update: "/api/time-entries/:id",
    delete: "/api/time-entries/:id",
    clockIn: "/api/time-entries/clock-in",
    clockOut: "/api/time-entries/clock-out",
    startBreak: "/api/time-entries/start-break",
    endBreak: "/api/time-entries/end-break",
    pendingApprovals: "/api/time-entries/pending-approvals",
    approve: "/api/time-entries/:id/approve",
    reject: "/api/time-entries/:id/reject",
    approveEdit: "/api/time-entries/:id/approve-edit",
  },

  // Invoices & Billing
  invoices: {
    list: "/api/invoices",
    create: "/api/invoices",
    get: "/api/invoices/:id",
    update: "/api/invoices/:id",
    delete: "/api/invoices/:id",
    send: "/api/invoices/:id/send",
  },

  billing: {
    subscribe: "/api/billing/subscribe",
    updateCard: "/api/billing/update-card",
    invoices: "/api/billing/invoices",
    usage: "/api/billing/usage",
  },

  // Payroll
  payroll: {
    list: "/api/payroll",
    process: "/api/payroll/process",
    calculate: "/api/payroll/calculate",
    export: "/api/payroll/export",
  },

  // Reports
  reports: {
    list: "/api/reports",
    create: "/api/reports",
    get: "/api/reports/:id",
    update: "/api/reports/:id",
    delete: "/api/reports/:id",
    submit: "/api/reports/:id/submit",
  },

  // Support & Help
  support: {
    createTicket: "/api/support/create-ticket",
    escalate: "/api/support/escalate",
    helposChat: "/api/support/helpos-chat",
    helposcoPilot: "/api/support/helpos-copilot",
    faq: "/api/support/faq",
  },

  // Chat & Messaging
  chat: {
    conversations: "/api/chat/conversations",
    messages: "/api/chat/messages",
    gemini: "/api/chat/gemini",
    geminiStatus: "/api/chat/gemini/status",
    createConversation: "/api/chat/conversations/create",
    closeConversation: "/api/chat/conversations/:id/close",
    sendMessage: "/api/chat/messages/send",
    grantVoice: "/api/chat/conversations/:id/grant-voice",
  },

  // Notifications
  notifications: {
    list: "/api/notifications",
    markRead: "/api/notifications/:id/read",
    markAllRead: "/api/notifications/mark-all-read",
    delete: "/api/notifications/:id",
  },

  // AI & Analytics
  ai: {
    brain: "/api/ai-brain",
    schedule: "/api/ai-brain/schedule",
    predict: "/api/ai-brain/predict",
    sentiment: "/api/ai-brain/sentiment",
  },

  // Platform/Admin
  admin: {
    stats: "/api/analytics/stats",
    getStats: "/api/analytics/stats",
    health: "/api/health",
    featureUpdates: "/api/feature-updates",
    feedback: "/api/feedback",
    // User management
    changeUserRole: "/api/admin/users/:id/role",
    lockAccount: "/api/admin/users/:id/lock",
    unlockAccount: "/api/admin/users/:id/unlock",
    suspendAccount: "/api/admin/users/:id/suspend",
    unsuspendAccount: "/api/admin/users/:id/unsuspend",
    freezeAccount: "/api/admin/users/:id/freeze",
    unfreezeAccount: "/api/admin/users/:id/unfreeze",
  },
  
  // Analytics
  analytics: {
    getStats: "/api/analytics/stats",
  },

  // User Settings
  user: {
    me: "/api/auth/me",
    workspace: "/api/me/workspace-role",
    platform: "/api/me/platform-role",
    features: "/api/me/workspace-features",
  },

  // Credits
  credits: {
    balance: "/api/credits/balance/:workspaceId",
    usage: "/api/credits/usage-breakdown/:workspaceId",
  },

  // Benefits
  benefits: {
    list: "/api/benefits",
    create: "/api/benefits",
    get: "/api/benefits/:id",
    update: "/api/benefits/:id",
    delete: "/api/benefits/:id",
  },

  // Grievances/Disputes
  grievances: {
    list: "/api/grievances",
    file: "/api/grievances/file",
    get: "/api/grievances/:id",
    disputeable: "/api/grievances/disputeable",
    resolve: "/api/grievances/:id/resolve",
  },

  // PTO (Paid Time Off)
  pto: {
    list: "/api/pto",
    create: "/api/pto",
    get: "/api/pto/:id",
    approve: "/api/pto/:id/approve",
    deny: "/api/pto/:id/deny",
    cancel: "/api/pto/:id/cancel",
  },

  // Performance Reviews
  reviews: {
    list: "/api/reviews",
    create: "/api/reviews",
    get: "/api/reviews/:id",
    update: "/api/reviews/:id",
    submit: "/api/reviews/:id/submit",
  },

  // Sales/CRM
  sales: {
    leads: "/api/sales/leads",
    addLead: "/api/sales/leads",
    getLead: "/api/sales/leads/:id",
    updateLead: "/api/sales/leads/:id",
    templates: "/api/sales/templates",
    sendEmail: "/api/sales/send-email",
  },
};

/**
 * Get endpoint with path parameter substitution
 * Usage: getEndpoint('employees.get', { id: '123' })
 * Returns: "/api/employees/123"
 */
export function getEndpoint(
  path: string,
  params?: Record<string, string>
): string {
  const parts = path.split(".");
  let endpoint: any = API_ENDPOINTS;

  for (const part of parts) {
    endpoint = endpoint[part];
    if (!endpoint) {
      console.warn(`Endpoint not found: ${path}`);
      return path;
    }
  }

  // Replace path parameters
  if (params && typeof endpoint === "string") {
    Object.entries(params).forEach(([key, value]) => {
      endpoint = endpoint.replace(`:${key}`, value);
    });
  }

  return endpoint;
}

/**
 * Build API URL with query parameters
 * Usage: buildApiUrl("/api/employees", { page: 1, limit: 10 })
 * Returns: "/api/employees?page=1&limit=10"
 */
export function buildApiUrl(
  endpoint: string,
  params?: Record<string, any>
): string {
  if (!params || Object.keys(params).length === 0) {
    return endpoint;
  }

  const queryString = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");

  return queryString ? `${endpoint}?${queryString}` : endpoint;
}

/**
 * Get endpoint group by category
 */
export function getEndpointGroup(category: string): any {
  return (API_ENDPOINTS as any)[category] || null;
}
