/**
 * Centralized React Query Keys
 * Single source of truth for all query caching strategies
 * Prevents cache invalidation bugs and ensures consistency
 */

export const queryKeys = {
  // Auth
  auth: {
    me: ["auth", "me"],
    workspaceRole: ["auth", "workspaceRole"],
    platformRole: ["auth", "platformRole"],
    features: ["auth", "features"],
  },

  // Workspace
  workspace: {
    current: ["workspace", "current"],
    all: ["workspace", "all"],
    status: ["workspace", "status"],
    health: ["workspace", "health"],
    customMessages: ["workspace", "customMessages"],
  },

  // Employees
  employees: {
    all: ["employees"],
    get: (id: string) => ["employees", id],
    list: (page: number, limit: number) => ["employees", "list", page, limit],
    me: ["employees", "me"],
  },

  // Shifts
  shifts: {
    all: ["shifts"],
    get: (id: string) => ["shifts", id],
    list: (page: number, limit: number) => ["shifts", "list", page, limit],
    proposals: ["shifts", "proposals"],
  },

  // Time Entries
  timeEntries: {
    all: ["time-entries"],
    get: (id: string) => ["time-entries", id],
    list: (page: number, limit: number) => ["time-entries", "list", page, limit],
  },

  // Chat
  chat: {
    conversations: ["chat", "conversations"],
    messages: (conversationId: string) => ["chat", "messages", conversationId],
    geminiStatus: ["chat", "gemini", "status"],
  },

  // Support
  support: {
    tickets: ["support", "tickets"],
    chatrooms: ["support", "chatrooms"],
    faq: ["support", "faq"],
  },

  // Notifications
  notifications: {
    all: ["notifications"],
    unread: ["notifications", "unread"],
  },

  // Analytics
  analytics: {
    stats: ["analytics", "stats"],
    dashboard: ["analytics", "dashboard"],
    reports: ["analytics", "reports"],
  },

  // Invoices
  invoices: {
    all: ["invoices"],
    get: (id: string) => ["invoices", id],
    list: (page: number, limit: number) => ["invoices", "list", page, limit],
  },

  // Dashboard
  dashboard: {
    stats: ["dashboard", "stats"],
    overview: ["dashboard", "overview"],
  },
};

/**
 * Get query key for invalidation
 * Usage: invalidateQuery(queryKeys.employees.all)
 */
export function getQueryKey(path: string[]): string[] {
  return path;
}
