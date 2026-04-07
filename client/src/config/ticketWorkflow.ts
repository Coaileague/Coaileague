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

/**
 * 7-Step Pipeline Configuration
 * Universal orchestration pattern for ticket creation workflow
 * TRIGGER → FETCH → VALIDATE → PROCESS → MUTATE → CONFIRM → NOTIFY
 * 
 * NO HARDCODED VALUES - All timing and display configurable here
 */

// Pipeline animation timing configuration
export const PIPELINE_TIMING = {
  stepDelay: 200, // Delay between steps in ms
  initialDelay: 150, // Initial delay before starting
  clearDelay: 1500, // Delay before clearing completed pipeline
} as const;

// Pipeline status styling configuration  
export const PIPELINE_STATUS_STYLES = {
  completed: {
    bg: 'bg-emerald-500',
    border: 'border-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    textWhite: 'text-white',
    dot: 'bg-emerald-500',
    connector: 'bg-emerald-500',
  },
  current: {
    dotAnimation: 'animate-pulse',
    iconAnimation: 'animate-spin',
  },
  pending: {
    bg: 'bg-slate-100 dark:bg-slate-800',
    border: 'border-slate-300 dark:border-slate-600',
    text: 'text-slate-400',
    dot: 'bg-slate-300 dark:bg-slate-600',
    connector: 'bg-slate-300 dark:bg-slate-600',
  },
  error: {
    bg: 'bg-red-500/10',
    border: 'border-red-500',
    text: 'text-red-500',
    dot: 'bg-red-500',
    containerBg: 'bg-red-50 dark:bg-red-950/30',
    containerBorder: 'border-red-200 dark:border-red-800',
    containerText: 'text-red-700 dark:text-red-300',
  },
} as const;

export const TICKET_PIPELINE_STEPS = [
  {
    id: 'trigger',
    label: 'Trigger',
    description: 'Ticket submission received',
    icon: 'Play',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500',
  },
  {
    id: 'fetch',
    label: 'Fetch',
    description: 'Loading context & user data',
    icon: 'Download',
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500',
  },
  {
    id: 'validate',
    label: 'Validate',
    description: 'Verifying ticket data',
    icon: 'Shield',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500',
  },
  {
    id: 'process',
    label: 'Process',
    description: 'AI categorization & routing',
    icon: 'Cpu',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500',
  },
  {
    id: 'mutate',
    label: 'Mutate',
    description: 'Creating ticket record',
    icon: 'Database',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500',
  },
  {
    id: 'confirm',
    label: 'Confirm',
    description: 'Ticket saved successfully',
    icon: 'CheckCircle',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500',
  },
  {
    id: 'notify',
    label: 'Notify',
    description: 'Sending confirmation',
    icon: 'Bell',
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
    borderColor: 'border-pink-500',
  },
] as const;

export type PipelineStepId = typeof TICKET_PIPELINE_STEPS[number]['id'];

export interface PipelineState {
  currentStep: PipelineStepId;
  completedSteps: PipelineStepId[];
  error?: { step: PipelineStepId; message: string };
  isComplete: boolean;
}

export function getInitialPipelineState(): PipelineState {
  return {
    currentStep: 'trigger',
    completedSteps: [],
    isComplete: false,
  };
}

export function advancePipeline(state: PipelineState): PipelineState {
  const stepIndex = TICKET_PIPELINE_STEPS.findIndex(s => s.id === state.currentStep);
  if (stepIndex === -1 || stepIndex >= TICKET_PIPELINE_STEPS.length - 1) {
    return { ...state, isComplete: true, completedSteps: [...state.completedSteps, state.currentStep] };
  }
  
  return {
    ...state,
    currentStep: TICKET_PIPELINE_STEPS[stepIndex + 1].id,
    completedSteps: [...state.completedSteps, state.currentStep],
  };
}

export function setStepError(state: PipelineState, message: string): PipelineState {
  return {
    ...state,
    error: { step: state.currentStep, message },
  };
}
