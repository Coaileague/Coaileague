/**
 * MASTER PLATFORM CONFIGURATION
 * =============================
 * Single source of truth for ALL platform settings, branding, and RBAC.
 * Edit values here to change behavior everywhere instantly.
 * NO HARDCODED VALUES ALLOWED - everything must reference this config.
 */

// ============================================================================
// PLATFORM IDENTITY
// ============================================================================
export const PLATFORM = {
  name: "CoAIleague",
  tagline: "AI-Powered Workforce Intelligence",
  description: "Fortune 500-grade multi-tenant autonomous workforce management platform",
  version: "2.0.0",
  copyright: `© ${new Date().getFullYear()} CoAIleague. All rights reserved.`,
  supportEmail: "support@coaileague.com",
  website: "https://www.coaileague.com",
} as const;

// ============================================================================
// PLATFORM DOMAINS & URLS — single source of truth for all URL construction
// ============================================================================
export const DOMAINS = {
  root: "coaileague.com",
  www: "www.coaileague.com",
  api: "api.coaileague.com",
  docs: "docs.coaileague.com",
  support: "support.coaileague.com",
  status: "status.coaileague.com",
  app: "https://www.coaileague.com",
  docsUrl: "https://docs.coaileague.com",
  supportUrl: "https://support.coaileague.com",
  statusUrl: "https://status.coaileague.com",
  apiUrl: "https://api.coaileague.com",
  privacyUrl: "https://www.coaileague.com/privacy",
  termsUrl: "https://www.coaileague.com/terms",
  cookiePolicyUrl: "https://www.coaileague.com/cookie-policy",
  dpaUrl: "https://www.coaileague.com/dpa",
  aupUrl: "https://www.coaileague.com/legal-aup",
  compareUrl: "https://www.coaileague.com/compare",
  featuresUrl: "https://www.coaileague.com/features",
  contactUrl: "https://www.coaileague.com/contact",
} as const;

// ============================================================================
// PLATFORM CONTACTS — all email addresses in one place
// ============================================================================
export const CONTACTS = {
  support: "support@coaileague.com",
  noreply: "noreply@coaileague.com",
  billing: "billing@coaileague.com",
  legal: "legal@coaileague.com",
  compliance: "compliance@coaileague.com",
  privacy: "privacy@coaileague.com",
  security: "security@coaileague.com",
  trust: "trust@coaileague.com",
  dpa: "dpa@coaileague.com",
  enterprise: "enterprise@coaileague.com",
  sales: "sales@coaileague.com",
  trinity: "trinity@coaileague.com",
  operations: "operations@coaileague.com",
  automation: "automation@coaileague.com",
  unsubscribe: "unsubscribe@coaileague.com",
  root: "root@coaileague.com",
  demo: "demo@coaileague.com",
} as const;

// ============================================================================
// WORKSPACE CONFIGURATION
// ============================================================================
export const WORKSPACE = {
  platformWorkspaceId: "coaileague-platform-workspace",
  defaultTimezone: "America/New_York",
  defaultCurrency: "USD",
  defaultLanguage: "en",
  maxEmployeesPerWorkspace: 10000,
  maxClientsPerWorkspace: 1000,
} as const;

// ============================================================================
// COMPLIANCE & LABOR LAW CONFIGURATION
// ============================================================================
export const COMPLIANCE = {
  overtime: {
    dailyThresholdHours: 8,        // Hours before overtime kicks in
    weeklyThresholdHours: 40,      // Weekly overtime threshold
    overtimeMultiplier: 1.5,       // Time-and-a-half
    doubleTimeMultiplier: 2.0,     // Double time after 12 hours
  },
  breaks: {
    minBreakAfterHours: 6,         // Require break after 6 hours
    minBreakDuration: 30,          // Minimum 30-minute break
    mealBreakDuration: 30,         // Standard meal break
    restBreakDuration: 15,         // Standard rest break
  },
  shifts: {
    maxDailyHours: 12,             // Maximum hours per day
    minRestBetweenShifts: 8,       // Minimum rest between shifts
    maxConsecutiveDays: 6,         // Max consecutive work days
  },
  scheduling: {
    minAdvanceNoticeHours: 24,     // Minimum notice for schedule changes
    maxWeeklyHours: 60,            // Maximum weekly hours allowed
  },
} as const;

// ============================================================================
// RESPONSIVE & MOBILE CONFIGURATION
// ============================================================================
export const RESPONSIVE = {
  breakpoints: {
    mobile: 320,
    small: 480,
    tablet: 768,
    desktop: 1024,
    wide: 1280,
    ultrawide: 1536,
  },
  touchTargetMinSize: 44,  // WCAG accessibility standard
  headerHeights: {
    mobile: 56,
    tablet: 64,
    desktop: 80,
  },
  safeAreaInsets: {
    top: "var(--safe-area-inset-top, 0px)",
    bottom: "var(--safe-area-inset-bottom, 0px)",
    left: "var(--safe-area-inset-left, 0px)",
    right: "var(--safe-area-inset-right, 0px)",
  },
  zoomLimits: {
    min: 0.8,
    max: 2.0,
  },
} as const;

// ============================================================================
// BRANDING & THEMING
// ============================================================================
export const BRANDING = {
  colors: {
    primary: "#3b82f6",      // Blue
    secondary: "#10b981",    // Green
    accent: "#06b6d4",       // Cyan
    gradient: "from-cyan-500 to-blue-600",
    darkBg: "#0f172a",
    lightBg: "#ffffff",
  },
  logo: {
    svg: "/logo.svg",           // CoAIleague AI network gradient logo
    icon192: "/icons/icon-192x192.png",   // 192px app icon
    icon512: "/icons/icon-512x512.png",   // 512px app icon
    favicon: "/favicon.svg",    // Browser tab favicon (SVG Trinity logo)
    brandColors: {
      primary: "#3b82f6",       // Blue (AI, trust, intelligence)
      secondary: "#10b981",     // Green (automation, growth)
      accent: "#06b6d4",        // Cyan (innovation, future)
    }
  },
  fonts: {
    heading: "Inter, system-ui, sans-serif",
    body: "Inter, system-ui, sans-serif",
    mono: "JetBrains Mono, monospace",
  },
} as const;

// ============================================================================
// RBAC ROLES & PERMISSIONS
//
// WORKSPACE AUTHORITY HIERARCHY (highest → lowest):
//   org_owner        — Primary organization owner. Controls mother org + all child orgs.
//                      Full authority over: spending, hiring, clients, contracts, billing,
//                      workspace config, integrations, child org management.
//   co_owner         — Deputy chief / partner. Near-full authority, second-in-command.
//                      Can act on owner's behalf; cannot remove the org_owner.
//   admin            — Secretary / operations director. Broad operational access.
//                      Can manage: hiring, clients, contracts, documents, schedules,
//                      invoices, staff. Cannot touch billing or workspace-level config.
//   org_manager      — Organization-wide manager. All departments, no ownership rights.
//   manager          — Department/team manager. Manages their direct reports.
//   department_manager — Department-scoped authority. Limited to their department.
//   supervisor       — Field/team supervisor. Oversees staff on the ground.
//   staff / employee — Frontline workers. View their own schedules and timesheets.
//   contractor       — External worker with limited shift-level access.
//   auditor          — Read-only compliance access. Cannot mutate anything.
//   client           — External client portal access. Invoices and reports only.
//
// MULTI-TENANT (CHILD ORG) ACCESS:
//   org_owner and co_owner of a PARENT workspace have cross-workspace authority
//   over all child workspaces linked via parentWorkspaceId. admin and below
//   are scoped to their own workspace only.
// ============================================================================
export const ROLES = {
  // Platform-level roles (cross-workspace, stored in users.platformRole)
  PLATFORM_ADMIN: "platform_admin",
  ROOT_ADMIN: "root_admin",

  // Workspace-level roles (stored in employees.workspaceRole — match DB values exactly)
  WORKSPACE_OWNER: "org_owner",             // Primary owner — DB: "org_owner"
  CO_OWNER: "co_owner",                     // Deputy chief — DB: "co_owner"
  ADMIN: "admin",                           // Secretary / operations director — DB: "admin"
  ORG_MANAGER: "org_manager",               // Org-wide manager — DB: "org_manager"
  MANAGER: "manager",                       // Team/dept manager — DB: "manager"
  DEPARTMENT_MANAGER: "department_manager", // Dept-scoped manager — DB: "department_manager"
  SUPERVISOR: "supervisor",                 // Field supervisor — DB: "supervisor"
  STAFF: "staff",                           // General staff — DB: "staff" (default)
  EMPLOYEE: "employee",                     // Explicit employee — DB: "employee"
  CLIENT: "client",                         // Client contact — DB: "client"
  AUDITOR: "auditor",                       // Read-only auditor — DB: "auditor"
  CONTRACTOR: "contractor",                 // External contractor — DB: "contractor"
} as const;

export const ROLE_HIERARCHY = {
  [ROLES.PLATFORM_ADMIN]: 100,
  [ROLES.ROOT_ADMIN]: 90,
  [ROLES.WORKSPACE_OWNER]: 80,        // org_owner — full authority
  [ROLES.CO_OWNER]: 75,               // co_owner — deputy chief
  [ROLES.ADMIN]: 70,                  // admin — secretary / ops director
  [ROLES.ORG_MANAGER]: 65,            // org_manager — cross-department manager
  [ROLES.MANAGER]: 60,                // manager — team manager
  [ROLES.DEPARTMENT_MANAGER]: 55,     // department_manager — dept manager
  [ROLES.SUPERVISOR]: 50,             // supervisor — field supervisor
  [ROLES.EMPLOYEE]: 30,
  [ROLES.STAFF]: 25,
  [ROLES.CONTRACTOR]: 20,
  [ROLES.CLIENT]: 15,
  [ROLES.AUDITOR]: 10,
} as const;

// ============================================================================
// CANONICAL ROLE GROUPS
// Use these constants instead of inline arrays everywhere in the codebase.
// ============================================================================

/**
 * Ownership authority: org_owner + co_owner.
 * For actions that require true organizational ownership (billing, workspace config,
 * child org management, integration management).
 */
export const OWNER_ROLES = [
  ROLES.WORKSPACE_OWNER,
  ROLES.CO_OWNER,
] as const;

/**
 * Administrative authority: owners + admin (secretary/ops director).
 * For actions that require broad operational control but not ownership rights
 * (chat room management, visibility changes, document/contract access).
 */
export const ADMIN_ROLES = [
  ROLES.WORKSPACE_OWNER,
  ROLES.CO_OWNER,
  ROLES.ADMIN,
] as const;

/**
 * Manager-tier and above: all roles with team authority.
 * For actions that require management access (shift approval, escalation routing,
 * hiring decisions, staffing notifications).
 */
export const MANAGER_ROLES = [
  ROLES.WORKSPACE_OWNER,
  ROLES.CO_OWNER,
  ROLES.ADMIN,
  ROLES.ORG_MANAGER,
  ROLES.MANAGER,
  ROLES.DEPARTMENT_MANAGER,
] as const;

/**
 * Approval authority: roles that can approve AI decisions, timesheets, payroll.
 * Subset of managers — department_manager excluded (dept managers approve at dept level,
 * cross-org approvals need org_manager+).
 */
export const APPROVER_ROLES = [
  ROLES.WORKSPACE_OWNER,
  ROLES.CO_OWNER,
  ROLES.ADMIN,
  ROLES.ORG_MANAGER,
  ROLES.MANAGER,
] as const;

/**
 * Supervisor and above: can oversee staff on the ground.
 */
export const SUPERVISOR_ROLES = [
  ROLES.WORKSPACE_OWNER,
  ROLES.CO_OWNER,
  ROLES.ADMIN,
  ROLES.ORG_MANAGER,
  ROLES.MANAGER,
  ROLES.DEPARTMENT_MANAGER,
  ROLES.SUPERVISOR,
] as const;

export const SUPPORT_ROLES = [
  'root_admin',
  'deputy_admin',
  'sysop',
  'support_manager',
  'support_agent',
] as const;

export const PLATFORM_SUPPORT_ROLES = [
  ...SUPPORT_ROLES,
  'compliance_officer',
] as const;

export const PERMISSIONS = {
  VIEW_DASHBOARD: "view:dashboard",
  VIEW_EMPLOYEES: "view:employees",
  MANAGE_EMPLOYEES: "manage:employees",
  VIEW_SCHEDULES: "view:schedules",
  MANAGE_SCHEDULES: "manage:schedules",
  VIEW_TIMESHEETS: "view:timesheets",
  APPROVE_TIMESHEETS: "approve:timesheets",
  VIEW_PAYROLL: "view:payroll",
  MANAGE_PAYROLL: "manage:payroll",
  VIEW_INVOICES: "view:invoices",
  MANAGE_INVOICES: "manage:invoices",
  VIEW_CLIENTS: "view:clients",
  MANAGE_CLIENTS: "manage:clients",
  VIEW_REPORTS: "view:reports",
  MANAGE_REPORTS: "manage:reports",
  VIEW_SETTINGS: "view:settings",
  MANAGE_SETTINGS: "manage:settings",
  VIEW_BILLING: "view:billing",
  MANAGE_BILLING: "manage:billing",
  VIEW_ANALYTICS: "view:analytics",
  MANAGE_WORKSPACE: "manage:workspace",
  MANAGE_USERS: "manage:users",
  VIEW_AUDIT_LOGS: "view:audit_logs",
  MANAGE_INTEGRATIONS: "manage:integrations",
  ACCESS_AI_FEATURES: "access:ai_features",
  MANAGE_CONTRACTORS: "manage:contractors",
} as const;

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  // Platform-level — unrestricted
  [ROLES.PLATFORM_ADMIN]: Object.values(PERMISSIONS),
  [ROLES.ROOT_ADMIN]: Object.values(PERMISSIONS),

  // org_owner — full authority over everything including billing, workspace, child orgs
  [ROLES.WORKSPACE_OWNER]: Object.values(PERMISSIONS),

  // co_owner — deputy chief; same as org_owner minus ability to change workspace ownership
  [ROLES.CO_OWNER]: Object.values(PERMISSIONS),

  // admin — secretary / operations director
  // Full operational access: hiring, clients, contracts, documents, schedules, invoices
  // NO: billing management, workspace configuration, system integrations
  [ROLES.ADMIN]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_EMPLOYEES,
    PERMISSIONS.MANAGE_EMPLOYEES,       // hiring, onboarding, termination
    PERMISSIONS.VIEW_SCHEDULES,
    PERMISSIONS.MANAGE_SCHEDULES,       // scheduling operations
    PERMISSIONS.VIEW_TIMESHEETS,
    PERMISSIONS.APPROVE_TIMESHEETS,     // timesheet approval
    PERMISSIONS.VIEW_PAYROLL,           // view only — cannot process payroll
    PERMISSIONS.VIEW_INVOICES,
    PERMISSIONS.MANAGE_INVOICES,        // contracts, invoices, billing documents
    PERMISSIONS.VIEW_CLIENTS,
    PERMISSIONS.MANAGE_CLIENTS,         // client relationship management
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_REPORTS,
    PERMISSIONS.VIEW_SETTINGS,
    PERMISSIONS.MANAGE_SETTINGS,        // operational settings (not workspace-level config)
    PERMISSIONS.VIEW_BILLING,           // view only — cannot change billing plan
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.MANAGE_USERS,           // user account management
    PERMISSIONS.VIEW_AUDIT_LOGS,
    PERMISSIONS.ACCESS_AI_FEATURES,
    PERMISSIONS.MANAGE_CONTRACTORS,     // contractor management
  ],

  // org_manager — organization-wide manager; cross-department authority, no ownership
  [ROLES.ORG_MANAGER]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_EMPLOYEES,
    PERMISSIONS.MANAGE_EMPLOYEES,
    PERMISSIONS.VIEW_SCHEDULES,
    PERMISSIONS.MANAGE_SCHEDULES,
    PERMISSIONS.VIEW_TIMESHEETS,
    PERMISSIONS.APPROVE_TIMESHEETS,
    PERMISSIONS.VIEW_PAYROLL,
    PERMISSIONS.VIEW_INVOICES,
    PERMISSIONS.MANAGE_INVOICES,
    PERMISSIONS.VIEW_CLIENTS,
    PERMISSIONS.MANAGE_CLIENTS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_REPORTS,
    PERMISSIONS.VIEW_SETTINGS,
    PERMISSIONS.VIEW_BILLING,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.VIEW_AUDIT_LOGS,
    PERMISSIONS.ACCESS_AI_FEATURES,
    PERMISSIONS.MANAGE_CONTRACTORS,
  ],

  // manager — team/department manager
  [ROLES.MANAGER]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_EMPLOYEES,
    PERMISSIONS.MANAGE_EMPLOYEES,
    PERMISSIONS.VIEW_SCHEDULES,
    PERMISSIONS.MANAGE_SCHEDULES,
    PERMISSIONS.VIEW_TIMESHEETS,
    PERMISSIONS.APPROVE_TIMESHEETS,
    PERMISSIONS.VIEW_CLIENTS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.ACCESS_AI_FEATURES,
  ],

  // department_manager — dept-scoped authority
  [ROLES.DEPARTMENT_MANAGER]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_EMPLOYEES,
    PERMISSIONS.MANAGE_EMPLOYEES,
    PERMISSIONS.VIEW_SCHEDULES,
    PERMISSIONS.MANAGE_SCHEDULES,
    PERMISSIONS.VIEW_TIMESHEETS,
    PERMISSIONS.APPROVE_TIMESHEETS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.ACCESS_AI_FEATURES,
  ],

  // supervisor — field supervisor
  [ROLES.SUPERVISOR]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_EMPLOYEES,
    PERMISSIONS.VIEW_SCHEDULES,
    PERMISSIONS.VIEW_TIMESHEETS,
    PERMISSIONS.APPROVE_TIMESHEETS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.ACCESS_AI_FEATURES,
  ],

  // staff / employee — frontline workers
  [ROLES.EMPLOYEE]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_SCHEDULES,
    PERMISSIONS.VIEW_TIMESHEETS,
    PERMISSIONS.ACCESS_AI_FEATURES,
  ],
  [ROLES.STAFF]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_SCHEDULES,
    PERMISSIONS.VIEW_TIMESHEETS,
    PERMISSIONS.ACCESS_AI_FEATURES,
  ],

  // contractor — external worker, shift-level access only
  [ROLES.CONTRACTOR]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_SCHEDULES,
    PERMISSIONS.VIEW_TIMESHEETS,
  ],

  // client — external client portal
  [ROLES.CLIENT]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_INVOICES,
    PERMISSIONS.VIEW_REPORTS,
  ],

  // auditor — read-only compliance access
  [ROLES.AUDITOR]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_EMPLOYEES,
    PERMISSIONS.VIEW_SCHEDULES,
    PERMISSIONS.VIEW_TIMESHEETS,
    PERMISSIONS.VIEW_PAYROLL,
    PERMISSIONS.VIEW_INVOICES,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.VIEW_AUDIT_LOGS,
  ],
};

// ============================================================================
// UI CONFIGURATION
// ============================================================================
export const UI = {
  defaultTheme: "light" as "light" | "dark" | "system",
  animationDuration: 300,
  transitionDuration: 200,
  toastDuration: 3000,
  notificationDuration: 6000,
  sidebarWidth: "280px",
  sidebarCollapsedWidth: "64px",
  headerHeight: "64px",
  mobileBreakpoint: 768,
  tabletBreakpoint: 1024,
} as const;

// ============================================================================
// PAGINATION & LISTS
// ============================================================================
export const PAGINATION = {
  defaultPageSize: 10,
  maxPageSize: 100,
  pageSizeOptions: [5, 10, 20, 50, 100] as const,
} as const;

// ============================================================================
// TIMEOUTS & RETRIES
// ============================================================================
export const TIMING = {
  requestTimeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
  cacheExpiry: 5 * 60 * 1000, // 5 minutes
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  tokenRefreshBuffer: 5 * 60 * 1000, // 5 minutes before expiry
} as const;

// ============================================================================
// FEATURE TOGGLES - Production Ready
// ============================================================================
// Edit these to enable/disable features across the entire platform
// Changes take effect immediately on restart
export const FEATURES = {
  // Core AI Features
  enableAI: true,
  enableDocumentExtraction: true,
  enableSentimentAnalysis: true,
  enableAutonomousScheduling: true,
  
  // Autonomous Jobs
  enableAutonomousBilling: true,
  enablePayrollAutomation: true,
  enableInvoiceAutomation: true,
  enableComplianceAlerts: true,
  
  // Billing System (NEW)
  enableBillingAPI: true,
  enableStripeWebhooks: true,
  enableTrialSystem: true,
  enableUsageTracking: true,
  enableOverageBilling: true,
  enableCreditSystem: true,
  
  // Real-Time Features
  enableWebSocket: true,
  enableNotifications: true,
  enableDisputeResolution: true,
  
  // Workforce Features
  enableContractorPool: true,
  enableGPS: true,
  enableGamification: true,  // Employee engagement & recognition
  
  // Time Tracking & Timesheets
  enableTimeTracking: true,
  enableTimesheetReports: true,
  enableTimesheetExport: true,
  enableDragDropTimesheets: true,
  
  // Communication Features
  enableSMSNotifications: true,  // Twilio SMS integration
  enableEmailNotifications: true,
  enablePushNotifications: false,  // PWA push - future
  
  // Email Testing Mode - logs emails instead of sending via Resend
  // Set EMAIL_SIMULATION_MODE=true env var on server to enable
  // This flag is checked server-side in emailService.ts
  emailSimulationMode: false,
  
  // Calendar Integration
  enableCalendarExport: true,  // ICS export
  enableGoogleCalendar: true,  // Google Calendar sync
  enableCalendarImport: true,
  
  // Advanced Scheduling
  enableRecurringShifts: true,
  enableShiftSwapping: true,
  enableAvailabilityRequests: true,
  enableOpenShifts: true,
  
  // Client Billing
  enableClientBilling: true,
  enableInvoiceFromTimeEntries: true,
  enableAutomatedReminders: true,

  // Trinity Automation Invoice Identification
  // All platform-generated invoices use this prefix so end users can distinguish
  // Trinity-automated invoices from manually-entered ones in QuickBooks.
  // Format: COai-{year}-{type}-{sequential} e.g. COai-2026-CLT-0001
  trinityInvoicePrefix: "COai",
  trinityInvoiceTypes: {
    client: "CLT",        // Client billing invoices from time entries
    subscription: "SUB",  // Subscription/addon billing invoices
    payroll: "PAY",       // Payroll-related invoices
    timesheet: "TSH",     // Timesheet-generated invoices
  } as Record<string, string>,
  
  // Platform Features
  enableWhatsNew: true,  // Dynamic What's New feed
  enableRealTimeUpdates: true,
  
  // Sales/Onboarding Pipeline
  enableOnboardingPipeline: true,  // Gamified onboarding with rewards
  enableTrialPipeline: true,       // Trial tracking and expiry
  enableOnboardingRewards: true,   // 10% discount for task completion
  
  // Enterprise Features
  enableMFA: false,
  enableAdvancedAnalytics: true,
  enableCustomReporting: true,
} as const;

// ============================================================================
// AI CONFIGURATION
// ============================================================================
export const AI_DEFAULT_MODEL = "gemini-2.0-flash-exp" as const;

export const AI = {
  provider: "gemini" as const,
  model: AI_DEFAULT_MODEL,
  maxTokens: 8192,
  temperature: 0.7,
  schedulingConfidenceThreshold: 0.8,
  sentimentThreshold: 0.3,
  documentExtractionConfidence: 0.85,
} as const;

// ============================================================================
// ONBOARDING PIPELINE CONFIGURATION
// ============================================================================
export const ONBOARDING = {
  TRIAL: {
    DAYS: 14,               // Default trial length
    WARNING_DAYS: [3, 1],   // Days before expiry to send warnings
    CREDITS: 100,           // AI credits included in trial
  },
  REWARD: {
    DISCOUNT_PERCENT: 10,   // 10% off first month
    EXPIRY_DAYS: 30,        // Reward expires after 30 days
  },
  TASKS: {
    MIN_POINTS: 5,          // Minimum points per task
    MAX_POINTS: 50,         // Maximum points per task
  },
  PIPELINE_STAGES: [
    'invited',
    'email_opened', 
    'trial_started',
    'trial_active',
    'trial_expired',
    'accepted',
    'rejected',
    'churned',
  ] as const,
} as const;

// ============================================================================
// EXTERNAL INTEGRATIONS CONFIGURATION
// Server-side only values - DO NOT use in client code directly
// ============================================================================

// Safe environment check for SSR/browser compatibility
const getEnv = (key: string, defaultValue: string): string => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || defaultValue;
  }
  return defaultValue;
};

export const INTEGRATIONS = {
  quickbooks: {
    // API Base URLs - SINGLE SOURCE OF TRUTH - never hardcode elsewhere
    apiUrls: {
      sandbox: 'https://sandbox-quickbooks.api.intuit.com',
      production: 'https://quickbooks.api.intuit.com',
    },
    
    // OAuth URLs - SINGLE SOURCE OF TRUTH - never hardcode elsewhere
    oauthUrls: {
      authorization: 'https://appcenter.intuit.com/connect/oauth2',
      token: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      revoke: 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke',
      userinfo: 'https://accounts.platform.intuit.com/v1/openid_connect/userinfo',
      userinfoSandbox: 'https://sandbox-accounts.platform.intuit.com/v1/openid_connect/userinfo',
      jwks: 'https://oauth.platform.intuit.com/op/v1/jwks',
      issuer: 'https://oauth.platform.intuit.com/op/v1',
    },
    
    // OpenID Connect Discovery URLs
    discoveryUrls: {
      production: 'https://developer.api.intuit.com/.well-known/openid_configuration',
      sandbox: 'https://developer.api.intuit.com/.well-known/openid_sandbox_configuration',
    },
    
    // Required OAuth scopes
    scopes: {
      accounting: 'com.intuit.quickbooks.accounting',
      payment: 'com.intuit.quickbooks.payment',
      payroll: 'com.intuit.quickbooks.payroll',
    },
    
    // Get environment (server-side only)
    // Uses NODE_ENV and RAILWAY_ENVIRONMENT as production signals (canonical per isProduction.ts).
    // This prevents shared secrets from forcing production mode in development.
    getEnvironment(): 'sandbox' | 'production' {
      const nodeEnv = getEnv('NODE_ENV', 'development');
      const railwayEnv = getEnv('RAILWAY_ENVIRONMENT', '');
      const isProductionRuntime = nodeEnv === 'production' || railwayEnv === 'production' ||
        !!getEnv('K_SERVICE', '') || !!getEnv('K_REVISION', '');

      // In development runtime, ALWAYS use sandbox regardless of QUICKBOOKS_ENVIRONMENT
      if (!isProductionRuntime) {
        return 'sandbox';
      }

      // In production runtime, check explicit override first
      const explicitEnv = getEnv('QUICKBOOKS_ENVIRONMENT', '');
      if (explicitEnv === 'sandbox' || explicitEnv === 'production') {
        return explicitEnv;
      }

      // Production runtime defaults to production QuickBooks
      return 'production';
    },
    
    /**
     * Validate and sanitize request host against allowed domains
     * Returns validated host or null if untrusted
     * SECURITY: Prevents host header injection attacks
     */
    validateRequestHost(rawHost?: string): string | null {
      if (!rawHost) return null;
      
      // Remove port number for comparison
      const hostWithoutPort = rawHost.split(':')[0].toLowerCase();
      
      // Get allowed domains from environment
      const allowedDomains = getEnv('REPLIT_DOMAINS', '').split(',').filter(Boolean);
      
      // Add known valid patterns
      const validPatterns = [
        /\.replit\.app$/,           // Production Replit domains
        /\.riker\.replit\.dev$/,    // Dev Replit domains
        /\.replit\.dev$/,           // Replit dev domains
        /^coaileague\.com$/,        // Production custom domain
        /^www\.coaileague\.com$/,   // Production custom domain (www)
        /^localhost$/,              // Local development
        /^127\.0\.0\.1$/,           // Local loopback
      ];
      
      // Check if host matches allowed domains list
      if (allowedDomains.some(domain => {
        const domainWithoutPort = domain.split(':')[0].toLowerCase();
        return hostWithoutPort === domainWithoutPort;
      })) {
        return rawHost;
      }
      
      // Check if host matches valid patterns
      if (validPatterns.some(pattern => pattern.test(hostWithoutPort))) {
        return rawHost;
      }
      
      // Untrusted host - return null
      console.warn(`[QuickBooks] Untrusted host rejected: ${rawHost}`);
      return null;
    },
    
    /**
     * Get canonical host for OAuth redirect URIs
     * Falls back to REPLIT_DOMAINS if request host is untrusted
     */
    getCanonicalHost(requestHost?: string): string {
      // Try to validate the request host first
      const validatedHost = this.validateRequestHost(requestHost);
      if (validatedHost) {
        return validatedHost;
      }
      
      // Fall back to configured domains
      const replitDomains = getEnv('REPLIT_DOMAINS', '');
      if (replitDomains) {
        const primaryDomain = replitDomains.split(',')[0];
        if (primaryDomain) {
          return primaryDomain;
        }
      }
      
      // Last resort - use explicit redirect URI
      const explicitRedirect = getEnv('QUICKBOOKS_REDIRECT_URI', '');
      if (explicitRedirect) {
        try {
          const url = new URL(explicitRedirect);
          return url.host;
        } catch {
          // Invalid URL, continue
        }
      }
      
      // Default fallback
      return 'localhost:5000';
    },

    // Dynamic environment detection based on request domain
    // Use this when you need per-request environment detection
    // Uses NODE_ENV and RAILWAY_ENVIRONMENT as production signals (canonical per isProduction.ts).
    getEnvironmentForDomain(domain?: string): 'sandbox' | 'production' {
      const nodeEnv = getEnv('NODE_ENV', 'development');
      const railwayEnv = getEnv('RAILWAY_ENVIRONMENT', '');
      const isProductionRuntime = nodeEnv === 'production' || railwayEnv === 'production' ||
        !!getEnv('K_SERVICE', '') || !!getEnv('K_REVISION', '');

      // In development runtime, ALWAYS use sandbox - no domain override
      if (!isProductionRuntime) {
        return 'sandbox';
      }

      // In production runtime, check explicit override
      const explicitEnv = getEnv('QUICKBOOKS_ENVIRONMENT', '');
      if (explicitEnv === 'sandbox' || explicitEnv === 'production') {
        return explicitEnv;
      }
      
      // SECURITY: Validate the domain first
      const validatedDomain = this.validateRequestHost(domain) || this.getCanonicalHost(domain);
      
      // If domain provided, check if it's a production domain
      if (validatedDomain) {
        const isProductionDomain = validatedDomain.includes('.replit.app') || 
          (!validatedDomain.includes('.riker.') && !validatedDomain.includes('.replit.dev') && !validatedDomain.includes('localhost'));
        if (isProductionDomain) {
          return 'production';
        }
      }

      // Production runtime defaults to production QuickBooks
      return 'production';
    },
    
    // Get the correct API base URL based on environment
    getApiBase(): string {
      const env = this.getEnvironment();
      return env === 'production' 
        ? this.apiUrls.production 
        : this.apiUrls.sandbox;
    },
    
    // Resolve API base with optional sandbox override (for functions needing explicit control)
    resolveApiBase(options?: { forceSandbox?: boolean }): string {
      if (options?.forceSandbox !== undefined) {
        return options.forceSandbox 
          ? this.apiUrls.sandbox 
          : this.apiUrls.production;
      }
      return this.getApiBase();
    },
    
    // Get full company API path
    getCompanyApiBase(): string {
      return `${this.getApiBase()}/v3/company`;
    },
    
    // Get versioned API base (with /v3)
    getVersionedApiBase(): string {
      return `${this.getApiBase()}/v3`;
    },
    
    // API versioning
    minorVersion: 75, // Updated to 75 as per QB requirements Aug 2025
    
    // Rate limiting
    rateLimits: {
      tokensPerMinute: 500,
      maxBatchSize: 30,
      concurrency: {
        standard: 3,
        fast: 5,
        turbo: 8,
      },
    },
    
    // Timeouts
    timeouts: {
      requestMs: 30000,
      batchMs: 120000,
    },
    
    // Sandbox/Testing configuration
    testing: {
      // Default pay rate for employees without rates (used in sandbox push)
      defaultPayRate: 25.00,
      // Pay rate range for sandbox employee generation
      payRateRange: {
        min: 18.00,
        max: 45.00,
      },
      // Sandbox workspace ID
      sandboxWorkspaceId: 'sandbox-test-workspace',
    },
  },
  
  gusto: {
    apiUrls: {
      sandbox: 'https://api.gusto-demo.com',
      production: 'https://api.gusto.com',
    },
    getEnvironment(): 'sandbox' | 'production' {
      return getEnv('GUSTO_ENVIRONMENT', 'sandbox') as 'sandbox' | 'production';
    },
    getApiBase(): string {
      const env = this.getEnvironment();
      return env === 'production' 
        ? this.apiUrls.production 
        : this.apiUrls.sandbox;
    },
  },
  
  stripe: {
    // Stripe uses mode based on API key prefix (sk_test_ vs sk_live_)
    getMode(): 'live' | 'test' {
      const key = getEnv('STRIPE_SECRET_KEY', '');
      return key.startsWith('sk_live_') ? 'live' : 'test';
    },
  },
};

// ============================================================================
// API ENDPOINTS (relative paths)
// ============================================================================
export const API = {
  auth: {
    login: "/api/login",
    logout: "/api/logout",
    register: "/api/register",
    me: "/api/auth/me",
    refresh: "/api/auth/refresh",
  },
  employees: "/api/employees",
  schedules: "/api/schedules",
  timesheets: "/api/timesheets",
  payroll: "/api/payroll",
  invoices: "/api/invoices",
  clients: "/api/clients",
  workspaces: "/api/workspaces",
  reports: "/api/reports",
  analytics: "/api/analytics",
  billing: "/api/billing",
  notifications: "/api/notifications",
  ai: {
    schedule: "/api/ai/schedule",
    sentiment: "/api/ai/sentiment",
    extract: "/api/ai/extract",
    chat: "/api/ai/chat",
  },
} as const;

// ============================================================================
// MESSAGE TEMPLATES
// ============================================================================
export const MESSAGES = {
  loading: {
    default: "Loading...",
    dashboard: "Preparing your dashboard...",
    schedule: "Loading schedule data...",
    employees: "Fetching employee information...",
    reports: "Generating reports...",
    ai: "AI is thinking...",
  },
  errors: {
    generic: "Something went wrong. Please try again.",
    network: "Network error. Please check your connection.",
    unauthorized: "You don't have permission to access this resource.",
    notFound: "The requested resource was not found.",
    validation: "Please check your input and try again.",
    timeout: "Request timed out. Please try again.",
  },
  success: {
    saved: "Changes saved successfully.",
    created: "Created successfully.",
    updated: "Updated successfully.",
    deleted: "Deleted successfully.",
    sent: "Sent successfully.",
  },
  confirmations: {
    delete: "Are you sure you want to delete this? This action cannot be undone.",
    unsaved: "You have unsaved changes. Are you sure you want to leave?",
    logout: "Are you sure you want to log out?",
  },
} as const;

// ============================================================================
// NAVIGATION STRUCTURE
// ============================================================================
export const NAVIGATION = {
  main: [
    { label: "Dashboard", path: "/dashboard", icon: "LayoutDashboard", permission: PERMISSIONS.VIEW_DASHBOARD },
    { label: "Schedule", path: "/schedule", icon: "Calendar", permission: PERMISSIONS.VIEW_SCHEDULES },
    { label: "Time Tracking", path: "/time-tracking", icon: "Clock", permission: PERMISSIONS.VIEW_TIMESHEETS },
    { label: "Employees", path: "/employees", icon: "Users", permission: PERMISSIONS.VIEW_EMPLOYEES },
    { label: "Clients", path: "/clients", icon: "Building", permission: PERMISSIONS.VIEW_CLIENTS },
    { label: "Invoices", path: "/invoices", icon: "FileText", permission: PERMISSIONS.VIEW_INVOICES },
    { label: "Reports", path: "/reports", icon: "BarChart", permission: PERMISSIONS.VIEW_REPORTS },
    { label: "Analytics", path: "/analytics", icon: "TrendingUp", permission: PERMISSIONS.VIEW_ANALYTICS },
  ],
  admin: [
    { label: "Settings", path: "/settings", icon: "Settings", permission: PERMISSIONS.VIEW_SETTINGS },
    { label: "Billing", path: "/billing", icon: "CreditCard", permission: PERMISSIONS.VIEW_BILLING },
    { label: "Workspace", path: "/workspace", icon: "Building2", permission: PERMISSIONS.MANAGE_WORKSPACE },
  ],
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: string, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions ? permissions.includes(permission) : false;
}

/**
 * Check if role A is higher than role B in hierarchy
 */
export function isHigherRole(roleA: string, roleB: string): boolean {
  const hierarchyA = ROLE_HIERARCHY[roleA as keyof typeof ROLE_HIERARCHY] ?? 0;
  const hierarchyB = ROLE_HIERARCHY[roleB as keyof typeof ROLE_HIERARCHY] ?? 0;
  return hierarchyA > hierarchyB;
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: string): string[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof typeof FEATURES): boolean {
  // @ts-expect-error — TS migration: fix in refactoring sprint
  return FEATURES[feature] ?? false;
}

/**
 * Get the full platform name with tagline
 */
export function getFullPlatformName(): string {
  return `${PLATFORM.name} - ${PLATFORM.tagline}`;
}

/**
 * Get branding gradient class
 */
export function getBrandGradient(): string {
  return `bg-gradient-to-r ${BRANDING.colors.gradient}`;
}

// ============================================================================
// AI BOT CONFIGURATION - UNIVERSAL HELPAI BOT
// ============================================================================
export const BOT_CONFIG = {
  name: "HelpAI",
  trademark: "",
  description: "Universal AI assistant for CoAIleague platform",
  greeting: "Welcome to CoAIleague Support. I'm HelpAI, here to help with any questions about workforce management, scheduling, payroll, and more.",
  systemPrompt: "You are HelpAI, the universal AI assistant for CoAIleague - an elite autonomous workforce management platform. You provide expert guidance on employee management, scheduling, payroll, analytics, and compliance. Be professional, helpful, and accurate in all responses.",
  features: [
    "Employee management guidance",
    "Shift scheduling assistance",
    "Payroll inquiries",
    "Analytics interpretation",
    "Compliance support",
    "Technical troubleshooting",
  ],
  rbacEnabled: true, // AI responses respect RBAC roles
  dataSync: true,    // Bot data syncs across mobile/desktop
  contextAware: true, // Bot understands workspace context
} as const;

// ============================================================================
// COAI TWIN - INTERACTIVE AI MASCOT WITH BOT-LEVEL AUTHORITY
// ============================================================================
export const COAI_TWIN = {
  // Bot Identity - Same authority as HelpAI (one level under root_admin)
  name: "Trinity AI",
  fullName: "Trinity AI Mascot",
  description: "Interactive AI mascot with BOT-level platform authority",
  workId: "CoAI-00-BOT-01-0001",
  
  // Platform Role - Same as HelpAI Bot
  role: {
    platformRole: "Bot" as const,
    authorityLevel: 2, // Level 1: root_admin, Level 2: Bot (same as HelpAI)
    workspaceAccess: "platform_wide" as const,
    supportOrgMember: true,
  },
  
  // Visual Identity - Two glowing stars
  visual: {
    primaryColor: "#a855f7",   // Purple star
    secondaryColor: "#38bdf8", // Cyan star
    glowIntensity: 0.6,
    backgroundTransparent: true,
    sizes: {
      desktop: { default: 120, expanded: 180 },
      mobile: { default: 90, expanded: 140 },
    },
  },
  
  // AI Model Configuration (uses Gemini via AI Brain)
  model: {
    provider: "gemini" as const,
    modelId: AI_DEFAULT_MODEL,
    maxTokens: 256,
    temperature: 0.8,
  },

  // Bot Feature Flags
  capabilities: {
    enabled: true,
    followUsers: true,
    contextualAdvice: true,
    taskCreation: true,
    navigationTracking: true,
    autonomousRoaming: true,
    transportEffects: true,
    smartMovement: true,
  },
  
  // Transport Effects
  transportEffects: {
    glide: { duration: 2200, glowColor: "#38bdf8" },
    zap: { duration: 400, glowColor: "#a855f7" },
    float: { duration: 3000, glowColor: "#38bdf8" },
    dash: { duration: 900, glowColor: "#a855f7" },
  },
  
  // Greeting Templates
  greetings: {
    default: "Hi! I'm your Trinity AI, here to help navigate and assist!",
    returning: "Welcome back! Ready to help you today.",
    newPage: "I see you're exploring. Need any guidance?",
    idle: "Just floating around... tap me if you need anything!",
  },
} as const;

// ============================================================================
// HELPAI - UNIVERSAL AI ASSISTANT & ORCHESTRATION SYSTEM
// ============================================================================
export const HELPAI = {
  // Bot Identity
  name: "HelpAI",
  fullName: "HelpAI Assistant",
  description: "AI-powered support assistant for CoAIleague",
  
  // AI Model Configuration (uses Gemini via AI Brain)
  model: {
    provider: "gemini" as const,
    modelId: AI_DEFAULT_MODEL,
    maxTokens: 512,
    temperature: 0.7,
  },
  
  // Response Settings
  responses: {
    maxLength: 300,
    conciseMode: true,
    useMarkdown: true,
  },
  
  // Bot Feature Flags
  bot: {
    enabled: true,
    faqSearch: true,
    ticketCreation: true,
    urgencyDetection: true,
    sentimentAnalysis: true,
    learningEnabled: true,
    autoEscalation: true,
  },
  
  // Escalation Thresholds
  escalation: {
    lowConfidenceThreshold: 0.5,
    maxBotTurns: 5,
    frustrationSignalCount: 2,
  },
  
  // Guest Limits
  guestLimits: {
    freeResponses: 3,
    promptUpgrade: true,
  },
  
  // Greeting Templates
  greetings: {
    default: "Hello! I'm HelpAI, your AI assistant. How can I help you today?",
    returning: "Welcome back! I'm HelpAI, ready to assist you.",
    guest: "Welcome! I'm HelpAI, your AI assistant. You have {remaining} free responses available.",
    afterHours: "Hello! I'm HelpAI. Our support team is currently offline, but I'll do my best to help you.",
  },
  
  // Knowledge Domains
  domains: {
    scheduling: ["schedule", "shift", "calendar", "time off", "availability"],
    billing: ["invoice", "payment", "charge", "bill", "subscription", "price"],
    payroll: ["payroll", "salary", "wage", "pay", "deduction", "tax"],
    employees: ["employee", "staff", "team", "onboarding", "hire"],
    technical: ["error", "bug", "issue", "problem", "not working", "broken"],
    account: ["login", "password", "account", "access", "permission"],
  },
  
  // Sentiment Signals
  signals: {
    satisfaction: [
      "thanks", "thank you", "perfect", "solved", "done", "great", "awesome",
      "got it", "understand", "clear", "helpful", "works", "fixed",
      "appreciate", "good", "ok", "okay", "yes", "yep", "yeah"
    ],
    frustration: [
      "human", "person", "agent", "representative", "staff",
      "not working", "still broken", "doesn't work", "confused", "urgent",
      "escalate", "manager", "speak to", "talk to",
      "no", "nope", "wrong", "incorrect", "not helpful"
    ],
  },
  
  // Platform Knowledge for AI Context
  platformKnowledge: {
    products: [
      { name: "Time Tracking", description: "Time tracking and clock-in/out" },
      { name: "AI Scheduling", description: "AI-powered scheduling" },
      { name: "AI Payroll", description: "Automated payroll processing" },
      { name: "Billing Platform", description: "Automated invoicing with Stripe" },
      { name: "Employee Onboarding", description: "Employee onboarding workflows" },
      { name: "Reports & Forms", description: "Report templates and submissions" },
      { name: "Business Analytics", description: "Business insights dashboards" },
      { name: "HelpAI", description: "AI-powered support assistant" },
    ],
    capabilities: [
      "Answer platform questions",
      "Create support tickets",
      "Search FAQ knowledge base",
      "Detect urgency and escalate",
      "Guide users through features",
      "Provide queue status updates",
    ],
  },
  
  // Orchestration Feature Flags
  enabled: true,
  registryEnabled: true,
  integrationEnabled: true,
  auditLogEnabled: true,
  
  // API Registry Defaults
  registry: {
    defaultRateLimitPerMinute: 60,
    defaultRateLimitPerDay: 10000,
    categories: ['hr', 'payroll', 'scheduling', 'compliance', 'benefits', 'time_tracking'] as const,
  },
  
  // Integration Settings
  integration: {
    defaultSyncIntervalMinutes: 60,
    maxSyncIntervalMinutes: 1440,
    minSyncIntervalMinutes: 5,
    credentialEncryption: 'aes-256-gcm' as const,
  },
  
  // Audit Log Configuration
  audit: {
    retentionDays: 365,
    maxEntriesPerQuery: 10000,
    hashAlgorithm: 'sha256' as const,
    enableIntegrityVerification: true,
  },
  
  // Credential Management
  credentials: {
    supportedTypes: ['api_key', 'oauth2', 'bearer', 'basic_auth'] as const,
    expiryWarningDays: 7,
  },
  
  // Per-Organization Limits
  limits: {
    maxIntegrationsPerOrg: 50,
    maxCredentialsPerIntegration: 3,
    maxAuditLogsPerDay: 100000,
  },
  
  // Performance
  performance: {
    cacheTTLSeconds: 300,
    maxConcurrentRequests: 10,
  },
} as const;

// ============================================================================
// CHAT SERVER HUB - UNIFIED GATEWAY CONFIGURATION
// ============================================================================
// Central hub connecting ALL chatroom types to AI Brain, Notifications, Tickets, and What's New
export const CHAT_SERVER_HUB = {
  // Gateway Identity
  name: "ChatServerHub",
  fullName: "Chat Server Unified Gateway",
  description: "Central orchestration layer for all chat rooms across the platform",
  version: "1.0.0", // Versioned with platform
  
  // Gateway Status
  enabled: true,
  heartbeatIntervalMs: 30000, // Check active rooms every 30s
  
  // Supported Room Types - ALL chat room types connect through this gateway
  roomTypes: {
    support: {
      name: "Support Rooms",
      description: "Customer support chatrooms with ticket tracking",
      table: "support_rooms",
      enabled: true,
    },
    work: {
      name: "Work Rooms",
      description: "Team collaboration and shift-based work chat",
      table: "chat_conversations", // conversation_type: 'shift_chat' or 'open_chat'
      enabled: true,
    },
    meeting: {
      name: "Meeting Rooms",
      description: "Meeting and event discussion rooms",
      table: "chat_conversations", // conversation_type: 'open_chat' with meeting context
      enabled: true,
    },
    org: {
      name: "Organization Rooms",
      description: "Company-wide communication and announcements",
      table: "organization_chat_rooms",
      enabled: true,
    },
  } as const,
  
  // Connected Systems
  connectedSystems: {
    airbrain: {
      name: "AI Brain",
      enabled: true,
      purpose: "Intelligent responses and escalation detection",
    },
    notifications: {
      name: "Notification System",
      enabled: true,
      purpose: "Push alerts and user notifications",
    },
    tickets: {
      name: "Support Ticket System",
      enabled: true,
      purpose: "Issue tracking and lifecycle management",
    },
    whatsnew: {
      name: "What's New Feed",
      enabled: true,
      purpose: "Platform-wide event announcements",
    },
    analytics: {
      name: "Analytics Service",
      enabled: true,
      purpose: "Chat metrics and usage tracking",
    },
  } as const,
  
  // Gateway Endpoints
  endpoints: {
    // Room Management
    rooms: "/api/chat/rooms",
    roomStatus: "/api/chat/rooms/{roomId}/status",
    activeRooms: "/api/chat/rooms/active",
    roomMetrics: "/api/chat/rooms/{roomId}/metrics",
    
    // Gateway Health
    health: "/api/chat/gateway/health",
    status: "/api/chat/gateway/status",
    
    // Event Broadcasting
    events: "/api/chat/events",
    eventSubscribe: "/api/chat/events/subscribe",
    
    // Support Rooms (specific)
    supportRooms: "/api/support/rooms",
    supportRoomStatus: "/api/support/rooms/{roomId}/status",
    
    // Organization Rooms (specific)
    orgRooms: "/api/org/rooms",
    orgRoomStatus: "/api/org/rooms/{roomId}/status",
  } as const,
  
  // Event Configuration
  events: {
    // Chat Events
    messagePosted: "chat:message_posted",
    messageEdited: "chat:message_edited",
    messageDeleted: "chat:message_deleted",
    userJoined: "chat:user_joined",
    userLeft: "chat:user_left",
    
    // Ticket Events
    ticketCreated: "ticket:created",
    ticketAssigned: "ticket:assigned",
    ticketEscalated: "ticket:escalated",
    ticketResolved: "ticket:resolved",
    
    // AI Events
    aiResponse: "ai:response",
    aiEscalation: "ai:escalation",
    aiSuggestion: "ai:suggestion",
    
    // Room Events
    roomStatusChanged: "room:status_changed",
    roomCreated: "room:created",
    roomClosed: "room:closed",
  } as const,
  
  // Rate Limiting
  rateLimits: {
    chatMessages: 30, // Per minute
    eventPublishing: 100, // Per minute
    roomCreation: 20, // Per minute
  } as const,
  
  // Timeouts
  timeouts: {
    connectionTimeout: 5000, // 5 seconds
    roomHeartbeat: 30000, // 30 seconds
    eventProcessing: 10000, // 10 seconds
    messageAck: 5000, // 5 seconds
  } as const,
} as const;

// ============================================================================
// PLATFORM DISCLAIMERS
// ============================================================================
export const DISCLAIMERS = {
  middleware: 'CoAIleague is AI-powered workforce management middleware. CoAIleague is not a financial institution, bank, CPA firm, tax preparer, payroll provider, or legal advisor.',
  aiAccuracy: 'AI systems can make errors. All AI-generated content, calculations, reports, and recommendations must be reviewed and verified by a qualified human before use, filing, or submission.',
  orgResponsibility: 'It is the sole responsibility of the organization representative or owner to review and verify all work product generated by CoAIleague before acting on it, filing it, or submitting it to any government agency, financial institution, or third party.',
  noLiability: 'CoAIleague is not responsible nor will be held responsible for errors, omissions, inaccuracies, or mistakes in any AI-generated content unless directly caused by a verifiable defect in the CoAIleague processing engine or AI brain service.',
  taxForms: 'Tax forms generated by CoAIleague are for informational and preparation purposes only. Consult a qualified tax professional or CPA before filing any tax documents with the IRS or state agencies.',
  payroll: 'Payroll calculations are AI-assisted estimates. A qualified human must verify all payroll figures, tax withholdings, and deductions before processing payments.',
  financial: 'Financial reports and dashboards display AI-calculated estimates. These figures are not audited and should be verified by a qualified accountant before use in official filings or business decisions.',
  full: 'IMPORTANT DISCLAIMER: CoAIleague is AI-powered workforce management middleware — not a financial institution, CPA firm, tax preparer, payroll provider, or legal advisor. AI systems can make errors. All content, calculations, reports, tax forms, and recommendations generated by CoAIleague are for informational and preparation purposes only and must be reviewed and verified by a qualified human before use. It is the sole responsibility of the organization representative or owner to verify all work product. CoAIleague is not responsible for errors, omissions, or inaccuracies unless directly caused by a verifiable defect in the CoAIleague processing engine. Consult qualified professionals before filing tax documents, processing payroll, or making financial decisions based on AI-generated data.',
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================
export type Role = typeof ROLES[keyof typeof ROLES];
export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];
export type Feature = keyof typeof FEATURES;
export type HelpAICredentialType = typeof HELPAI.credentials.supportedTypes[number];
export type HelpAICategory = typeof HELPAI.registry.categories[number];
export type ChatServerHubRoomType = keyof typeof CHAT_SERVER_HUB.roomTypes;
