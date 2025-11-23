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
    passwordResetRequest: "/api/auth/reset-password-request",
    passwordResetConfirm: "/api/auth/reset-password-confirm",
    changePassword: "/api/auth/change-password",
  },

  // Workspace
  workspace: {
    list: "/api/workspaces/all",
    switch: "/api/workspace/switch/:workspaceId",
    get: "/api/workspace",
    health: "/api/workspace/health",
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
    health: "/api/health",
    featureUpdates: "/api/feature-updates",
    feedback: "/api/feedback",
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
