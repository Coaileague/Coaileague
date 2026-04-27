/**
 * API Endpoints Configuration
 * Single source of truth for EVERY API route
 * Change an endpoint here, it updates everywhere instantly
 * 
 * IMPORTANT: These paths MUST match the actual backend route mounts in server/routes.ts.
 * Backend mounts use these canonical prefixes:
 *   /api/auth/*          - Authentication
 *   /api/employees/*     - Employee management
 *   /api/shifts/*        - Scheduling/shifts
 *   /api/time-entries/*  - Time tracking
 *   /api/invoices/*      - Invoicing
 *   /api/billing/*       - Billing/subscriptions
 *   /api/ai-brain/*      - AI Brain system
 *   /api/trinity/*       - Trinity chat, alerts, maintenance, self-edit
 *   /api/mascot/*        - Trinity AI Mascot
 *   /api/trinity-staffing/* - Trinity Staffing
 *   /api/helpai/*        - HelpAI assistant
 *   /api/trinity-training/* - Trinity training scenarios
 */

export const API_ENDPOINTS = {
  auth: {
    login: "/api/auth/login",
    logout: "/api/auth/logout",
    register: "/api/auth/register",
    me: "/api/auth/me",
    current: "/api/auth/me",
    changePassword: "/api/auth/change-password"
  },

  workspace: {
    list: "/api/workspaces/all",
    switch: "/api/workspace/switch/:workspaceId",
    get: "/api/workspace/current",
    current: "/api/workspace/current",
    health: "/api/workspace/health",
    getHealth: "/api/workspace/health",
    status: "/api/workspace/status",
    customMessages: "/api/workspace/custom-messages",
    upgrade: "/api/workspace/upgrade",
    theme: "/api/workspace/theme",
    access: "/api/workspace/access"
  },

  employees: {
    list: "/api/employees",
    create: "/api/employees",
    get: "/api/employees/:id",
    update: "/api/employees/:id",
    delete: "/api/employees/:id",
    me: "/api/employees/me",
    bulk: "/api/employees/bulk"
  },

  shifts: {
    list: "/api/shifts",
    create: "/api/shifts",
    get: "/api/shifts/:id",
    update: "/api/shifts/:id",
    delete: "/api/shifts/:id",
    publish: "/api/shifts/:id/publish",
    approve: "/api/shifts/:shiftId/approve",
    bulkApprove: "/api/shifts/bulk-approve",
    pendingActions: "/api/shifts/actions/pending"
  },

  timeEntries: {
    list: "/api/time-entries",
    create: "/api/time-entries",
    get: "/api/time-entries/:id",
    update: "/api/time-entries/:id",
    delete: "/api/time-entries/:id",
    clockIn: "/api/time-entries/clock-in",
    clockOut: "/api/time-entries/:id/clock-out",
    pendingApprovals: "/api/time-entries/pending",
    approve: "/api/time-entries/:id/approve",
    reject: "/api/time-entries/:id/reject",
    bulkApprove: "/api/time-entries/bulk-approve",
    calculateHours: "/api/time-entries/calculate-hours",
    startBreak: "/api/time-entries/:id/start-break",
    endBreak: "/api/time-entries/:id/end-break"
  },

  invoices: {
    list: "/api/invoices",
    create: "/api/invoices",
    get: "/api/invoices/:id",
    update: "/api/invoices/:id",
    delete: "/api/invoices/:id",
    send: "/api/invoices/:id/send"
  },

  billing: {
    subscribe: "/api/billing/subscribe",
    invoices: "/api/billing/invoices",
    usage: "/api/billing/usage/summary"
  },

  payroll: {
    list: "/api/payroll",
    process: "/api/payroll/process",
    calculate: "/api/payroll/calculate",
    export: "/api/payroll/export"
  },

  reports: {
    list: "/api/reports",
    create: "/api/reports",
    get: "/api/reports/:id",
    update: "/api/reports/:id",
    delete: "/api/reports/:id",
    submit: "/api/reports/:id/submit"
  },

  support: {
    createTicket: "/api/support/create-ticket",
    escalate: "/api/support/escalate",
    faq: "/api/support/faq"
  },

  chat: {
    conversations: "/api/chat/conversations",
    messages: "/api/chat/conversations/:id/messages",
    gemini: "/api/chat/gemini",
    geminiStatus: "/api/chat/gemini/status",
    typing: "/api/chat/conversations/:id/typing",
    macros: "/api/chat/macros",
    unreadCount: "/api/chat/unread-count",
    markAsRead: "/api/chat/mark-as-read"
  },

  notifications: {
    list: "/api/notifications",
    markRead: "/api/notifications/:id/read",
    markAllRead: "/api/notifications/mark-all-read",
    delete: "/api/notifications/:id"
  },

  ai: {
    brain: "/api/ai-brain",
    schedule: "/api/ai-brain/schedule",
    predict: "/api/ai-brain/predict",
    sentiment: "/api/ai-brain/sentiment"
  },

  trinity: {
    chat: "/api/trinity/chat",
    alerts: "/api/trinity/alerts",
    status: "/api/trinity/status",
    insights: "/api/trinity/insights",
    session: "/api/trinity/session",
    maintenance: "/api/trinity/maintenance",
    scheduling: "/api/trinity/scheduling"
  },

  mascot: {
    ask: "/api/mascot/ask",
    insights: "/api/mascot/insights",
    faqs: "/api/mascot/faqs",
    tasks: "/api/mascot/tasks",
    completeTask: "/api/mascot/complete-task",
    holiday: "/api/mascot/holiday",
    seasonal: "/api/mascot/seasonal/state"
  },

  admin: {
    stats: "/api/analytics/stats",
    getStats: "/api/analytics/stats",
    health: "/api/health",
    featureUpdates: "/api/feature-updates",
    feedback: "/api/feedback",
    changeUserRole: "/api/admin/users/:id/role",
    lockAccount: "/api/admin/users/:id/lock",
    unlockAccount: "/api/admin/users/:id/unlock",
    suspendAccount: "/api/admin/users/:id/suspend",
    unsuspendAccount: "/api/admin/users/:id/unsuspend"
  },

  platform: {
    staff: "/api/platform/staff",
    revokeRole: "/api/platform/staff/:userId/revoke-role",
    changeRole: "/api/platform/staff/:userId/change-role"
  },

  analytics: {
    getStats: "/api/analytics/stats"
  },

  user: {
    me: "/api/auth/me",
    workspace: "/api/me/workspace-role",
    platform: "/api/me/platform-role",
    features: "/api/me/workspace-features"
  },

  tokens: {
    balance: "/api/usage/tokens",
    breakdown: "/api/usage/token-breakdown",
    log: "/api/usage/token-log"
  },

  benefits: {
    list: "/api/benefits",
    create: "/api/benefits",
    get: "/api/benefits/:id",
    update: "/api/benefits/:id",
    delete: "/api/benefits/:id"
  },

  disputes: {
    list: "/api/disputes",
    create: "/api/disputes",
    get: "/api/disputes/:id",
    myDisputes: "/api/disputes/my-disputes",
    pending: "/api/disputes/pending",
    pendingReview: "/api/disputes/pending-review",
    resolve: "/api/disputes/:id/resolve",
    approve: "/api/disputes/:disputeId/approve",
    reject: "/api/disputes/:disputeId/reject",
    assign: "/api/disputes/:id/assign",
    review: "/api/disputes/:id/review",
    aiAnalysis: "/api/disputes/:id/ai-analysis",
    analyzeSentiment: "/api/disputes/analyze-sentiment"
  },

  grievances: {
    list: "/api/disputes",
    file: "/api/disputes",
    get: "/api/disputes/:id",
    disputeable: "/api/disputes/pending",
    resolve: "/api/disputes/:id/resolve"
  },

  pto: {
    list: "/api/pto",
    create: "/api/pto",
    get: "/api/pto/:id",
    approve: "/api/pto/:id/approve",
    deny: "/api/pto/:id/deny"
  },

  timeOffRequests: {
    list: "/api/time-off-requests",
    create: "/api/time-off-requests",
    pending: "/api/time-off-requests/pending",
    updateStatus: "/api/time-off-requests/:id/status"
  },

  timesheetEditRequests: {
    list: "/api/timesheet-edit-requests",
    create: "/api/timesheet-edit-requests",
    pending: "/api/timesheet-edit-requests/pending",
    review: "/api/timesheet-edit-requests/:id/review"
  },

  reviews: {
    list: "/api/reviews",
    create: "/api/reviews",
    get: "/api/reviews/:id",
    update: "/api/reviews/:id",
    submit: "/api/reviews/:id/submit"
  },

  sales: {
    leads: "/api/sales/leads",
    addLead: "/api/sales/leads",
    getLead: "/api/sales/leads/:id",
    updateLead: "/api/sales/leads/:id",
    templates: "/api/sales/templates",
    sendEmail: "/api/sales/send-email"
  },

  contracts: {
    list: "/api/contracts",
    create: "/api/contracts",
    get: "/api/contracts/:id",
    portal: "/api/contracts/portal"
  },

  documents: {
    list: "/api/documents",
    create: "/api/documents",
    get: "/api/documents/:id",
    extract: "/api/documents/extract"
  },

  training: {
  },

  staffing: {
    settings: "/api/trinity-staffing/settings",
    workflows: "/api/trinity-staffing/workflows",
    escalationTiers: "/api/trinity-staffing/escalation-tiers"
  },

  helpai: {
    registry: "/api/helpai/registry",
    auditLog: "/api/helpai/audit-log",
    integrations: "/api/helpai/integrations/config"
  }
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
