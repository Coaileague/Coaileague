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
 *   /api/training/*      - Training courses
 *   /api/trinity-training/* - Trinity training scenarios
 */

export const API_ENDPOINTS = {
  auth: {
    login: "/api/auth/login",
    logout: "/api/auth/logout",
    register: "/api/auth/register",
    me: "/api/auth/me",
    current: "/api/auth/me",
    passwordResetRequest: "/api/auth/forgot-password",
    passwordResetConfirm: "/api/auth/reset-password",
    changePassword: "/api/auth/change-password",
    setupMfa: "/api/auth/mfa/setup",
    enableMfa: "/api/auth/mfa/enable",
    disableMfa: "/api/auth/mfa/disable",
    mfaStatus: "/api/auth/mfa/status",
    verifyMfa: "/api/auth/mfa/verify",
    regenerateBackupCodes: "/api/auth/mfa/regenerate-backup-codes",
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
    seedFormTemplates: "/api/workspace/seed-form-templates",
    theme: "/api/workspace/theme",
    access: "/api/workspace/access",
  },

  employees: {
    list: "/api/employees",
    create: "/api/employees",
    get: "/api/employees/:id",
    update: "/api/employees/:id",
    delete: "/api/employees/:id",
    me: "/api/employees/me",
    bulk: "/api/employees/bulk",
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
    pendingActions: "/api/shifts/actions/pending",
    approveAction: "/api/shifts/actions/:id/approve",
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
    exportCsv: "/api/time-entries/export/csv",
    startBreak: "/api/time-entries/:id/start-break",
    endBreak: "/api/time-entries/:id/end-break",
    approveEdit: "/api/time-entries/timesheet-edits/:id/review",
  },

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

  payroll: {
    list: "/api/payroll",
    process: "/api/payroll/process",
    calculate: "/api/payroll/calculate",
    export: "/api/payroll/export",
  },

  reports: {
    list: "/api/reports",
    create: "/api/reports",
    get: "/api/reports/:id",
    update: "/api/reports/:id",
    delete: "/api/reports/:id",
    submit: "/api/reports/:id/submit",
  },

  support: {
    createTicket: "/api/support/create-ticket",
    escalate: "/api/support/escalate",
    helposChat: "/api/support/helpos-chat",
    helposcoPilot: "/api/support/helpos-copilot",
    faq: "/api/support/faq",
  },

  chat: {
    conversations: "/api/chat/conversations",
    messages: "/api/chat/conversations/:id/messages",
    gemini: "/api/chat/gemini",
    geminiStatus: "/api/chat/gemini/status",
    createConversation: "/api/chat/conversations",
    closeConversation: "/api/chat/conversations/:id/close",
    grantVoice: "/api/chat/conversations/:id/grant-voice",
    typing: "/api/chat/conversations/:id/typing",
    mainRoom: "/api/chat/main-room",
    mainRoomMessages: "/api/chat/main-room/messages",
    macros: "/api/chat/macros",
    unreadCount: "/api/chat/unread-count",
    markAsRead: "/api/chat/mark-as-read",
  },

  notifications: {
    list: "/api/notifications",
    markRead: "/api/notifications/:id/read",
    markAllRead: "/api/notifications/mark-all-read",
    delete: "/api/notifications/:id",
  },

  ai: {
    brain: "/api/ai-brain",
    schedule: "/api/ai-brain/schedule",
    predict: "/api/ai-brain/predict",
    sentiment: "/api/ai-brain/sentiment",
  },

  trinity: {
    chat: "/api/trinity/chat",
    alerts: "/api/trinity/alerts",
    status: "/api/trinity/status",
    insights: "/api/trinity/insights",
    session: "/api/trinity/session",
    selfEdit: "/api/trinity/self-edit",
    maintenance: "/api/trinity/maintenance",
    memoryHealth: "/api/trinity/memory-health",
    scheduling: "/api/trinity/scheduling",
  },

  mascot: {
    ask: "/api/mascot/ask",
    insights: "/api/mascot/insights",
    faqs: "/api/mascot/faqs",
    tasks: "/api/mascot/tasks",
    completeTask: "/api/mascot/complete-task",
    holiday: "/api/mascot/holiday",
    seasonal: "/api/mascot/seasonal/state",
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
    unsuspendAccount: "/api/admin/users/:id/unsuspend",
    freezeAccount: "/api/admin/users/:id/freeze",
    unfreezeAccount: "/api/admin/users/:id/unfreeze",
  },

  platform: {
    staff: "/api/platform/staff",
    grantRole: "/api/platform/staff/grant-role",
    revokeRole: "/api/platform/staff/:userId/revoke-role",
    suspendStaff: "/api/platform/staff/:userId/suspend",
    unsuspendStaff: "/api/platform/staff/:userId/unsuspend",
    changeRole: "/api/platform/staff/:userId/change-role",
  },

  analytics: {
    getStats: "/api/analytics/stats",
  },

  user: {
    me: "/api/auth/me",
    workspace: "/api/me/workspace-role",
    platform: "/api/me/platform-role",
    features: "/api/me/workspace-features",
  },

  credits: {
    balance: "/api/credits/balance",
    usage: "/api/credits/usage-breakdown",
  },

  benefits: {
    list: "/api/benefits",
    create: "/api/benefits",
    get: "/api/benefits/:id",
    update: "/api/benefits/:id",
    delete: "/api/benefits/:id",
  },

  disputes: {
    list: "/api/disputes",
    create: "/api/disputes",
    get: "/api/disputes/:id",
    myDisputes: "/api/disputes/my-disputes",
    pending: "/api/disputes/pending",
    pendingReview: "/api/disputes/pending-review",
    assignedToMe: "/api/disputes/assigned-to-me",
    resolve: "/api/disputes/:id/resolve",
    approve: "/api/disputes/:disputeId/approve",
    reject: "/api/disputes/:disputeId/reject",
    assign: "/api/disputes/:id/assign",
    review: "/api/disputes/:id/review",
    aiAnalysis: "/api/disputes/:id/ai-analysis",
    analyzeSentiment: "/api/disputes/analyze-sentiment",
  },

  grievances: {
    list: "/api/disputes",
    file: "/api/disputes",
    get: "/api/disputes/:id",
    disputeable: "/api/disputes/pending",
    resolve: "/api/disputes/:id/resolve",
  },

  pto: {
    list: "/api/pto",
    create: "/api/pto",
    get: "/api/pto/:id",
    approve: "/api/pto/:id/approve",
    deny: "/api/pto/:id/deny",
  },

  timeOffRequests: {
    list: "/api/time-off-requests",
    create: "/api/time-off-requests",
    pending: "/api/time-off-requests/pending",
    updateStatus: "/api/time-off-requests/:id/status",
  },

  timesheetEditRequests: {
    list: "/api/timesheet-edit-requests",
    create: "/api/timesheet-edit-requests",
    pending: "/api/timesheet-edit-requests/pending",
    review: "/api/timesheet-edit-requests/:id/review",
  },

  reviews: {
    list: "/api/reviews",
    create: "/api/reviews",
    get: "/api/reviews/:id",
    update: "/api/reviews/:id",
    submit: "/api/reviews/:id/submit",
  },

  sales: {
    leads: "/api/sales/leads",
    addLead: "/api/sales/leads",
    getLead: "/api/sales/leads/:id",
    updateLead: "/api/sales/leads/:id",
    templates: "/api/sales/templates",
    sendEmail: "/api/sales/send-email",
  },

  contracts: {
    list: "/api/contracts",
    create: "/api/contracts",
    get: "/api/contracts/:id",
    portal: "/api/contracts/portal",
  },

  documents: {
    list: "/api/documents",
    create: "/api/documents",
    get: "/api/documents/:id",
    extract: "/api/documents/extract",
  },

  training: {
    courses: "/api/training/courses",
    enrollments: "/api/training/enrollments",
    certifications: "/api/training/certifications",
  },

  staffing: {
    settings: "/api/trinity-staffing/settings",
    workflows: "/api/trinity-staffing/workflows",
    escalationTiers: "/api/trinity-staffing/escalation-tiers",
  },

  helpai: {
    registry: "/api/helpai/registry",
    auditLog: "/api/helpai/audit-log",
    integrations: "/api/helpai/integrations/config",
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
