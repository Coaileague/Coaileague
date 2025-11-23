/**
 * Support Ticket Status Workflow Configuration
 * Defines ticket lifecycle, statuses, and transitions
 * 
 * NO HARDCODED VALUES - All workflow states configurable
 */

export const TICKET_STATUS_CONFIG = {
  // Status definitions
  statuses: {
    open: {
      id: "open",
      label: "Open",
      description: "New ticket, not yet assigned",
      color: "hsl(var(--destructive))",
      icon: "AlertCircle",
      order: 1,
      allowedTransitions: ["in-progress", "waiting", "closed"],
      requiresAssignment: false,
    },
    "in-progress": {
      id: "in-progress",
      label: "In Progress",
      description: "Assigned to agent, actively being resolved",
      color: "hsl(var(--warning))",
      icon: "Clock",
      order: 2,
      allowedTransitions: ["waiting", "resolved", "open", "closed"],
      requiresAssignment: true,
    },
    waiting: {
      id: "waiting",
      label: "Waiting for Customer",
      description: "Awaiting customer response or information",
      color: "hsl(var(--info))",
      icon: "Hourglass",
      order: 3,
      allowedTransitions: ["in-progress", "resolved", "closed"],
      requiresAssignment: true,
      slaMultiplier: 0.5, // SLA pause while waiting
    },
    resolved: {
      id: "resolved",
      label: "Resolved",
      description: "Issue resolved, awaiting customer confirmation",
      color: "hsl(var(--success))",
      icon: "CheckCircle",
      order: 4,
      allowedTransitions: ["closed", "in-progress", "open"],
      requiresAssignment: true,
      autoCloseDays: 3,
    },
    closed: {
      id: "closed",
      label: "Closed",
      description: "Ticket completed and closed",
      color: "hsl(var(--muted))",
      icon: "X",
      order: 5,
      allowedTransitions: ["open"],
      requiresAssignment: false,
      isFinal: true,
    },
  },

  // Priority levels
  priorities: {
    critical: {
      id: "critical",
      label: "Critical",
      value: 5,
      color: "hsl(var(--destructive))",
      slaHours: 1,
      icon: "AlertTriangle",
    },
    high: {
      id: "high",
      label: "High",
      value: 4,
      color: "hsl(var(--destructive))",
      slaHours: 4,
      icon: "Alert",
    },
    medium: {
      id: "medium",
      label: "Medium",
      value: 3,
      color: "hsl(var(--warning))",
      slaHours: 24,
      icon: "AlertCircle",
    },
    low: {
      id: "low",
      label: "Low",
      value: 2,
      color: "hsl(var(--info))",
      slaHours: 72,
      icon: "Info",
    },
    minimal: {
      id: "minimal",
      label: "Minimal",
      value: 1,
      color: "hsl(var(--muted))",
      slaHours: 168, // 1 week
      icon: "HelpCircle",
    },
  },

  // Ticket categories
  categories: {
    billing: {
      id: "billing",
      label: "Billing & Payments",
      icon: "CreditCard",
      autoAssignTeam: "billing",
    },
    technical: {
      id: "technical",
      label: "Technical Issue",
      icon: "Zap",
      autoAssignTeam: "technical",
    },
    account: {
      id: "account",
      label: "Account Help",
      icon: "User",
      autoAssignTeam: "support",
    },
    feature: {
      id: "feature",
      label: "Feature Request",
      icon: "Lightbulb",
      autoAssignTeam: null,
    },
    other: {
      id: "other",
      label: "Other",
      icon: "HelpCircle",
      autoAssignTeam: null,
    },
  },

  // SLA configuration
  sla: {
    firstResponseTime: 4, // hours
    resolutionTime: 24, // hours per priority (multiplied by priority)
    warningThreshold: 0.8, // 80% through SLA
    criticalThreshold: 0.95, // 95% through SLA
  },

  // Escalation rules
  escalation: {
    onSLABreach: true,
    onInactivity: { days: 3, targetRole: "supervisor" },
    onCustomerDissatisfaction: true,
    onReopen: true,
  },

  // API endpoints
  endpoints: {
    getTickets: "/api/support/tickets",
    getTicket: "/api/support/tickets/:id",
    createTicket: "/api/support/tickets",
    updateTicket: "/api/support/tickets/:id",
    updateStatus: "/api/support/tickets/:id/status",
    assignTicket: "/api/support/tickets/:id/assign",
    addNote: "/api/support/tickets/:id/notes",
    addInternalNote: "/api/support/tickets/:id/internal-notes",
    closeTicket: "/api/support/tickets/:id/close",
    reopenTicket: "/api/support/tickets/:id/reopen",
  },

  // Test IDs
  testIds: {
    ticketList: "list-tickets",
    ticketCard: "card-ticket",
    statusSelect: "select-ticket-status",
    prioritySelect: "select-ticket-priority",
    assignButton: "button-assign-ticket",
    closeButton: "button-close-ticket",
  },
};

export function getStatusTransitions(currentStatus: string) {
  const status = TICKET_STATUS_CONFIG.statuses[currentStatus as keyof typeof TICKET_STATUS_CONFIG.statuses];
  return status?.allowedTransitions || [];
}

export function getSLAForTicket(priority: string) {
  const priorityConfig = TICKET_STATUS_CONFIG.priorities[priority as keyof typeof TICKET_STATUS_CONFIG.priorities];
  return priorityConfig?.slaHours || 24;
}
