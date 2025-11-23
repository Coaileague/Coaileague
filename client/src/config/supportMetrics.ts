/**
 * Support Team Metrics & Performance Configuration
 * Defines KPIs, metrics display, and targets
 * 
 * NO HARDCODED VALUES - All metrics configurable
 */

export const SUPPORT_METRICS_CONFIG = {
  // Agent performance metrics
  agentMetrics: {
    resolutionRate: {
      label: "Resolution Rate",
      unit: "%",
      target: 95,
      icon: "TrendingUp",
      description: "% of tickets resolved vs reopened",
    },
    averageResolutionTime: {
      label: "Avg Resolution Time",
      unit: "hours",
      target: 24,
      icon: "Clock",
      description: "Average time to resolve ticket",
    },
    firstResponseTime: {
      label: "First Response Time",
      unit: "minutes",
      target: 30,
      icon: "MessageSquare",
      description: "Time to first agent response",
    },
    customerSatisfaction: {
      label: "Customer Satisfaction",
      unit: "%",
      target: 90,
      icon: "Star",
      description: "CSAT score from customer surveys",
    },
    ticketsPerDay: {
      label: "Tickets Handled",
      unit: "count",
      target: null,
      icon: "Inbox",
      description: "Number of tickets handled daily",
    },
    slaCompliance: {
      label: "SLA Compliance",
      unit: "%",
      target: 98,
      icon: "CheckCircle",
      description: "% of tickets meeting SLA",
    },
  },

  // Team metrics
  teamMetrics: {
    totalTickets: {
      label: "Total Tickets",
      unit: "count",
      icon: "Inbox",
    },
    openTickets: {
      label: "Open Tickets",
      unit: "count",
      icon: "AlertCircle",
    },
    avgWaitTime: {
      label: "Avg Wait Time",
      unit: "minutes",
      icon: "Hourglass",
    },
    teamSatisfaction: {
      label: "Team CSAT",
      unit: "%",
      target: 90,
      icon: "Users",
    },
    backlog: {
      label: "Backlog",
      unit: "count",
      icon: "TrendingUp",
      threshold: 10, // alert if > 10
    },
  },

  // Queue metrics
  queueMetrics: {
    queueLength: {
      label: "Queue Length",
      unit: "count",
      alertThreshold: 20,
      icon: "List",
    },
    averageWaitTime: {
      label: "Average Wait Time",
      unit: "minutes",
      alertThreshold: 15,
      icon: "Clock",
    },
    oldestTicketAge: {
      label: "Oldest Ticket",
      unit: "hours",
      alertThreshold: 24,
      icon: "AlertTriangle",
    },
    ticketsPerHour: {
      label: "Throughput",
      unit: "tickets/hour",
      icon: "TrendingUp",
    },
  },

  // Dashboard display settings
  dashboard: {
    refreshInterval: 30000, // ms
    chartsPerRow: 3,
    defaultTimeRange: "7days", // 7days, 30days, 90days, year
    defaultSort: "satisfactionDesc", // resolutionRateDesc, satisfactionDesc, etc
    showLeaderboard: true,
    leaderboardSize: 10,
    enableComparisons: true,
  },

  // Report generation
  reports: {
    types: [
      {
        id: "agent-performance",
        label: "Agent Performance Report",
        frequency: "weekly",
        metrics: ["resolutionRate", "customerSatisfaction", "firstResponseTime"],
      },
      {
        id: "team-summary",
        label: "Team Summary",
        frequency: "daily",
        metrics: ["totalTickets", "openTickets", "teamSatisfaction"],
      },
      {
        id: "sla-compliance",
        label: "SLA Compliance Report",
        frequency: "weekly",
        metrics: ["slaCompliance", "averageResolutionTime"],
      },
      {
        id: "customer-satisfaction",
        label: "Customer Satisfaction Analysis",
        frequency: "monthly",
        metrics: ["customerSatisfaction", "npsScore", "csat"],
      },
    ],
    formats: ["pdf", "csv", "excel"],
    emailRecipients: ["support-manager@company.com"],
  },

  // Alerts & Thresholds
  alerts: {
    criticalIssues: {
      slaBreachRate: 0.1, // Alert if 10% of tickets breach SLA
      zeroResolution: true, // Alert if any ticket unresolved for 48h
      customerDissatisfaction: 0.3, // Alert if CSAT drops below 70%
    },
    warnings: {
      highQueueLength: 15,
      slowFirstResponse: 60, // minutes
      lowSatisfaction: 0.75, // 75%
    },
  },

  // Benchmark data
  benchmarks: {
    industry: {
      avgResolutionTime: 24, // hours
      satisfactionRate: 85, // %
      firstResponseTime: 45, // minutes
    },
    topPerformers: {
      resolutionRate: 98,
      satisfactionRate: 95,
      slaCompliance: 99,
    },
  },

  // API endpoints
  endpoints: {
    agentMetrics: "/api/support/metrics/agent/:id",
    teamMetrics: "/api/support/metrics/team",
    queueMetrics: "/api/support/metrics/queue",
    reports: "/api/support/reports",
    satisfaction: "/api/support/metrics/satisfaction",
    sla: "/api/support/metrics/sla",
  },

  // Test IDs
  testIds: {
    metricCard: "card-metric",
    leaderboard: "list-leaderboard",
    reportButton: "button-generate-report",
    alertBell: "icon-alerts",
  },
};

export function getAgentMetricTarget(metricId: string) {
  const metric = SUPPORT_METRICS_CONFIG.agentMetrics[metricId as keyof typeof SUPPORT_METRICS_CONFIG.agentMetrics];
  return metric?.target || null;
}

export function getMetricAlertThreshold(metricId: string) {
  const queueMetric = SUPPORT_METRICS_CONFIG.queueMetrics[metricId as keyof typeof SUPPORT_METRICS_CONFIG.queueMetrics];
  return queueMetric?.alertThreshold || null;
}
