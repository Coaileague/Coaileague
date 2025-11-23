/**
 * Application Defaults
 * Edit here to change default values everywhere
 */

export const DEFAULTS = {
  // Pagination
  pagination: {
    page: 1,
    pageSize: 10,
    sort: "createdAt",
    order: "desc" as const,
  },

  // Date & Time
  timezone: "UTC",
  dateFormat: "MM/dd/yyyy",
  timeFormat: "HH:mm:ss",
  dayStart: 9,
  dayEnd: 17,

  // Currency & Numbers
  currency: "USD",
  currencyFormat: "$#,##0.00",
  numberFormat: "#,##0.00",
  decimalPlaces: 2,

  // Workspace
  workspace: {
    maxEmployees: 10,
    maxClients: 50,
    maxProjects: 100,
  },

  // Time Entry
  timeEntry: {
    minDuration: 15,
    roundingInterval: 15,
    autoBreak: 30,
  },

  // Payroll
  payroll: {
    payCycle: "weekly" as const,
    payDay: "friday" as const,
    overtimeThreshold: 40,
    overtimeMultiplier: 1.5,
    maxHoursPerDay: 12,
    maxHoursPerWeek: 60,
  },

  // Shifts
  shifts: {
    minDuration: 2,
    maxDuration: 12,
    defaultDuration: 8,
  },

  // Scheduling
  scheduling: {
    lookAheadDays: 30,
    minNoticeHours: 24,
    maxAdvanceBooking: 90,
  },

  // Break & Rest
  breaks: {
    minBreakDuration: 15,
    restPeriodAfterShift: 11,
    maxConsecutiveDays: 6,
  },

  // Performance
  thresholds: {
    slowQueryMs: 500,
    slowApiMs: 1000,
    errorRatePercent: 1,
  },

  // UI Defaults
  ui: {
    pageSize: 10,
    maxNotifications: 50,
    autoRefreshInterval: 30000,
    sessionWarningMinutes: 5,
  },

  // Features
  features: {
    enableAiScheduling: true,
    enableSentimentAnalysis: true,
    enablePredictiveAnalytics: false,
  },

  // Support
  support: {
    maxUploadSize: 10 * 1024 * 1024,
    allowedFileTypes: [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".png", ".jpg"],
  },
};

/**
 * Get default value by path
 */
export function getDefault(path: string): any {
  const parts = path.split(".");
  let current: any = DEFAULTS;
  
  for (const part of parts) {
    current = current[part];
    if (current === undefined) return null;
  }
  
  return current;
}

/**
 * Get all defaults for a category
 */
export function getDefaults(category: string): any {
  return (DEFAULTS as any)[category] || null;
}
