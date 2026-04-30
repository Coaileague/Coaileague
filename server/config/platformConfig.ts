/**
 * Centralized Platform Configuration
 * Single source of truth for ALL operational constants across the platform.
 * Every hardcoded value that controls platform behavior lives here.
 * 
 * Environment variables override defaults where applicable.
 * Per-workspace overrides can be layered on top via the config registry.
 */

// ============================================================================
// PLATFORM IDENTITY & URLS
// ============================================================================
export const PLATFORM = {
  name: process.env.PLATFORM_DISPLAY_NAME || 'CoAIleague',
  domain: process.env.PLATFORM_DOMAIN || 'www.coaileague.com',
  appUrl: process.env.APP_URL || 'https://www.coaileague.com',
  supportUrl: process.env.SUPPORT_URL || process.env.APP_URL || 'https://www.coaileague.com',
};

// ============================================================================
// EMAIL CONFIGURATION
// ============================================================================
export const EMAIL = {
  senders: {
    noreply: process.env.EMAIL_NOREPLY || 'noreply@coaileague.com',
    billing: process.env.EMAIL_BILLING || 'billing@coaileague.com',
    automation: process.env.EMAIL_AUTOMATION || 'automation@coaileague.com',
    support: process.env.EMAIL_SUPPORT || 'support@coaileague.com',
    unsubscribe: process.env.EMAIL_UNSUBSCRIBE || 'unsubscribe@coaileague.com',
  },
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:admin@coaileague.com',
  companyName: process.env.COMPANY_NAME || 'CoAIleague',
  companyAddress: process.env.COMPANY_ADDRESS || 'CoAIleague, Inc. | 1999 Bryan St, Suite 900, Dallas, TX 75201',
  bounceRateThreshold: parseFloat(process.env.BOUNCE_RATE_THRESHOLD || '0.02'),
  complaintRateThreshold: parseFloat(process.env.COMPLAINT_RATE_THRESHOLD || '0.001'),
};

// ============================================================================
// AUTH & SESSION
// ============================================================================
export const AUTH = {
  sessionTtlMs: parseInt(process.env.SESSION_TTL_MS || String(7 * 24 * 60 * 60 * 1000)),      // 7 days
  rememberMeTtlMs: parseInt(process.env.REMEMBER_ME_TTL_MS || String(30 * 24 * 60 * 60 * 1000)), // 30 days
  maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5'),
  lockoutDurationMs: parseInt(process.env.LOCKOUT_DURATION_MS || String(15 * 60 * 1000)),       // 15 min
  handoffTokenExpiryHours: parseInt(process.env.HANDOFF_TOKEN_EXPIRY_HOURS || '72'),
  testModeRateLimitMax: parseInt(process.env.TEST_MODE_RATE_LIMIT || '100'),
};

// ============================================================================
// RATE LIMITS
// ============================================================================
export const STRESS_TEST_MODE = process.env.STRESS_TEST_MODE === 'true';

export const RATE_LIMITS = {
  general: {
    windowMs: parseInt(process.env.RL_GENERAL_WINDOW_MS || String(15 * 60 * 1000)),  // 15 min
    max: STRESS_TEST_MODE ? 100000 : parseInt(process.env.RL_GENERAL_MAX || '1000'),
  },
  auth: {
    windowMs: parseInt(process.env.RL_AUTH_WINDOW_MS || String(15 * 60 * 1000)),     // 15 min
    max: STRESS_TEST_MODE ? 1000 : parseInt(process.env.RL_AUTH_MAX || '5'),
  },
  mutation: {
    windowMs: parseInt(process.env.RL_MUTATION_WINDOW_MS || String(60 * 1000)),       // 1 min
    // Raised 30→60: a single save can trigger 3-5 invalidations + re-fetches
    max: STRESS_TEST_MODE ? 10000 : parseInt(process.env.RL_MUTATION_MAX || '60'),
  },
  read: {
    windowMs: parseInt(process.env.RL_READ_WINDOW_MS || String(60 * 1000)),           // 1 min
    // Raised 60→300: dashboard pages fire 10-20 parallel reads on mount.
    // Railway proxies all requests through the same egress IP, making per-IP
    // limits useless — readLimiter now keys by userId (see rateLimiter.ts).
    max: STRESS_TEST_MODE ? 100000 : parseInt(process.env.RL_READ_MAX || '300'),
  },
  passwordReset: {
    windowMs: parseInt(process.env.RL_PWRESET_WINDOW_MS || String(60 * 60 * 1000)),  // 1 hr
    max: parseInt(process.env.RL_PWRESET_MAX || '3'),
  },
  chatMessages: {
    windowMs: parseInt(process.env.RL_CHAT_WINDOW_MS || String(60 * 1000)),           // 1 min
    max: parseInt(process.env.RL_CHAT_MAX || '30'),
  },
  chatUploads: {
    windowMs: parseInt(process.env.RL_UPLOAD_WINDOW_MS || String(60 * 60 * 1000)),   // 1 hr
    max: parseInt(process.env.RL_UPLOAD_MAX || '5'),
  },
  websocket: {
    maxConnectionsPerUser: parseInt(process.env.WS_MAX_CONN_PER_USER || '20'),
    maxConnectionsPerIp: parseInt(process.env.WS_MAX_CONN_PER_IP || '50'),
    maxBackoffMs: parseInt(process.env.WS_MAX_BACKOFF_MS || '300000'),
    backoffDecayMs: parseInt(process.env.WS_BACKOFF_DECAY_MS || '300000'),
    maxBackoffLevel: parseInt(process.env.WS_MAX_BACKOFF_LEVEL || '5'),
  },
};

// ============================================================================
// BILLING & FAIR-USE INTERACTION LIMITS
// Credit system removed — flat monthly pricing with interaction caps.
// Overage billed as a line item; critical operations NEVER stop.
// ============================================================================
export const BILLING = {
  // Kept for payroll/invoicing math (not credit billing)
  overtimeMultiplier: parseFloat(process.env.OVERTIME_MULTIPLIER || '1.5'),
  doubleTimeMultiplier: parseFloat(process.env.DOUBLE_TIME_MULTIPLIER || '2.0'),

  // Monthly interaction allowances by tier
  interactionsIncludedMonthly: {
    trial:        parseInt(process.env.INTERACTIONS_TRIAL        || '500'),
    starter:      parseInt(process.env.INTERACTIONS_STARTER      || '8000'),
    professional: parseInt(process.env.INTERACTIONS_PRO         || '30000'),
    business:     parseInt(process.env.INTERACTIONS_BUSINESS     || '60000'),
    enterprise:   parseInt(process.env.INTERACTIONS_ENTERPRISE   || '120000'),
    strategic:    parseInt(process.env.INTERACTIONS_STRATEGIC    || '500000'),
  },

  // Hard caps — at cap: queue autonomous work, allow critical ops, start overage counter
  hardCapLimits: {
    trial:        parseInt(process.env.CAP_TRIAL        || '500'),
    starter:      parseInt(process.env.CAP_STARTER      || '15000'),
    professional: parseInt(process.env.CAP_PRO         || '50000'),
    business:     parseInt(process.env.CAP_BUSINESS     || '120000'),
    enterprise:   parseInt(process.env.CAP_ENTERPRISE   || '999999999'),
    strategic:    parseInt(process.env.CAP_STRATEGIC    || '999999999'),
  },

  // Overage rates per interaction above hard cap (USD)
  overageRatesPerInteraction: {
    trial:        0,
    starter:      parseFloat(process.env.OVERAGE_RATE_STARTER      || '0.15'),
    professional: parseFloat(process.env.OVERAGE_RATE_PRO         || '0.12'),
    business:     parseFloat(process.env.OVERAGE_RATE_BUSINESS     || '0.10'),
    enterprise:   0, // custom negotiated
    strategic:    0, // custom negotiated
  },

  // Officers included per tier (overage billed separately)
  officersIncluded: {
    trial:        parseInt(process.env.OFFICERS_TRIAL        || '10'),
    starter:      parseInt(process.env.OFFICERS_STARTER      || '10'),
    professional: parseInt(process.env.OFFICERS_PRO         || '30'),
    business:     parseInt(process.env.OFFICERS_BUSINESS     || '75'),
    enterprise:   parseInt(process.env.OFFICERS_ENTERPRISE   || '200'),
    strategic:    parseInt(process.env.OFFICERS_STRATEGIC    || '999999'),
  },

  // Per-officer overage rates (USD/month)
  officerOverageRates: {
    trial:        0,
    starter:      parseFloat(process.env.OFFICER_OVERAGE_STARTER      || '79'),
    professional: parseFloat(process.env.OFFICER_OVERAGE_PRO         || '99'),
    business:     parseFloat(process.env.OFFICER_OVERAGE_BUSINESS     || '89'),
    enterprise:   0, // custom negotiated
    strategic:    0, // custom negotiated
  },

  // Cap notification throttle — notify owner max once per 24 hours
  capNotificationThrottleHours: parseInt(process.env.CAP_NOTIFY_THROTTLE_HOURS || '24'),

  // ── Legacy credit tracking shims (tables kept for audit trail; billing deduction removed) ──
  // These properties remain so credit-tracking services compile without modification.
  // They no longer drive any payment charges — they are monitoring/analytics only.
  creditsToUsdRate: 0.01,           // retained for analytics cost display only
  lowBalanceThreshold: 50,          // retained for legacy credit tracking service
  defaultCreditCost: 1,             // retained for legacy credit tracking service
  supportPoolMonthlyCredits: 100000,// retained for support pool initialization
  tierMultipliers: { free: 1.0, starter: 1.0, professional: 0.8, enterprise: 0.5, trial: 1.0, business: 0.7, strategic: 0.4 },
  creditPackages: [
    { credits: 100,  priceUsd: 9.99 },
    { credits: 500,  priceUsd: 39.99 },
    { credits: 1000, priceUsd: 69.99 },
    { credits: 5000, priceUsd: 299.99 },
  ],

  // Payroll internal service fees (Professional+)
  // Base: $3.50/employee/run (shared/billingConfig.ts middlewareFees.payrollMiddleware)
  // Tier discounts: professional 15%, business 20%
  payrollFees: {
    professional: {
      perEmployeePerRun: parseFloat(process.env.PAYROLL_FEE_PRO_PER_EMP  || '2.975'), // $3.50 × 0.85
      directDeposit:     parseFloat(process.env.PAYROLL_FEE_PRO_DD        || '0.20'),
      taxFiling:         parseFloat(process.env.PAYROLL_FEE_PRO_TAX       || '49.00'),
      yearEndForm:       parseFloat(process.env.PAYROLL_FEE_PRO_W2        || '4.25'),  // $5.00 × 0.85
    },
    business: {
      perEmployeePerRun: parseFloat(process.env.PAYROLL_FEE_BIZ_PER_EMP  || '2.80'),  // $3.50 × 0.80
      directDeposit:     parseFloat(process.env.PAYROLL_FEE_BIZ_DD        || '0.15'),
      taxFiling:         parseFloat(process.env.PAYROLL_FEE_BIZ_TAX       || '39.00'),
      yearEndForm:       parseFloat(process.env.PAYROLL_FEE_BIZ_W2        || '4.00'),  // $5.00 × 0.80
    },
  },

  // Invoicing collection fees (Professional+)
  // Base: 3.4% + $0.80 card / 1.3% ACH (shared/billingConfig.ts middlewareFees)
  // Tier discounts: professional 15%, business 20%
  invoicingFees: {
    professional: {
      cardRate:          parseFloat(process.env.INVOICE_FEE_PRO_CARD_RATE || '0.0289'), // 3.4% × 0.85
      cardFixed:         parseFloat(process.env.INVOICE_FEE_PRO_CARD_FIXED|| '0.68'),   // $0.80 × 0.85
      achPerTransaction: parseFloat(process.env.INVOICE_FEE_PRO_ACH       || '0.68'),
    },
    business: {
      cardRate:          parseFloat(process.env.INVOICE_FEE_BIZ_CARD_RATE || '0.0272'), // 3.4% × 0.80
      cardFixed:         parseFloat(process.env.INVOICE_FEE_BIZ_CARD_FIXED|| '0.64'),   // $0.80 × 0.80
      achPerTransaction: parseFloat(process.env.INVOICE_FEE_BIZ_ACH       || '0.64'),
    },
  },
};

// ============================================================================
// AI & AUTOMATION THRESHOLDS
// ============================================================================
export const AI = {
  autoApproveThreshold: parseFloat(process.env.AI_AUTO_APPROVE_THRESHOLD || '0.95'),
  defaultConfidenceScore: parseFloat(process.env.AI_DEFAULT_CONFIDENCE || '0.85'),
  faqConfidenceTiers: {
    high: parseFloat(process.env.FAQ_CONFIDENCE_HIGH || '0.9'),
    medium: parseFloat(process.env.FAQ_CONFIDENCE_MEDIUM || '0.7'),
    low: parseFloat(process.env.FAQ_CONFIDENCE_LOW || '0.6'),
    threshold: parseFloat(process.env.FAQ_CONFIDENCE_THRESHOLD || '0.15'),
  },
  lateArrivalThresholdMinutes: parseInt(process.env.LATE_ARRIVAL_THRESHOLD_MIN || '15'),
  targetResponseTimeMs: parseInt(process.env.AI_TARGET_RESPONSE_MS || '10000'),
  maxDiscountPercent: parseInt(process.env.MAX_DISCOUNT_PERCENT || '50'),
};

// ============================================================================
// TIMEOUTS & INTERVALS
// ============================================================================
export const TIMEOUTS = {
  aiJobTimeoutMs: parseInt(process.env.AI_JOB_TIMEOUT_MS || '60000'),
  wsHeartbeatIntervalMs: parseInt(process.env.WS_HEARTBEAT_INTERVAL_MS || '30000'),
  wsConnectionTimeoutMs: parseInt(process.env.WS_CONNECTION_TIMEOUT_MS || '300000'),
  gracefulShutdownMs: parseInt(process.env.GRACEFUL_SHUTDOWN_MS || '10000'),
  trinityNotifierDelayMs: parseInt(process.env.TRINITY_NOTIFIER_DELAY_MS || '2000'),
  circuitBreakerResetMs: parseInt(process.env.CIRCUIT_BREAKER_RESET_MS || '60000'),
  featureFlagCacheTtlMs: parseInt(process.env.FF_CACHE_TTL_MS || '60000'),
  featureFlagStaleTtlMs: parseInt(process.env.FF_STALE_TTL_MS || '300000'),
  healthCheckCacheTtlMs: parseInt(process.env.HEALTH_CACHE_TTL_MS || '30000'),
  healthCheckFailCacheTtlMs: parseInt(process.env.HEALTH_FAIL_CACHE_TTL_MS || '5000'),
  healthCheckGracePeriodMs: parseInt(process.env.HEALTH_GRACE_PERIOD_MS || '60000'),
  healthCheckLatencyThresholdMs: parseInt(process.env.HEALTH_LATENCY_THRESHOLD_MS || '5000'),
  unreadMessageCacheTtlMs: parseInt(process.env.UNREAD_CACHE_TTL_MS || '30000'),
  dynamicMessageCacheTtlMs: parseInt(process.env.DYN_MSG_CACHE_TTL_MS || '60000'),
  dataScanIntervalMs: parseInt(process.env.DATA_SCAN_INTERVAL_MS || '300000'),
};

// ============================================================================
// RETRY & RESILIENCE
// ============================================================================
export const RETRIES = {
  dbMaxRetries: parseInt(process.env.DB_MAX_RETRIES || '3'),
  serverStartMaxRetries: parseInt(process.env.SERVER_START_MAX_RETRIES || '5'),
  portCheckMaxRetries: parseInt(process.env.PORT_CHECK_MAX_RETRIES || '10'),
  qbSyncMaxRetries: parseInt(process.env.QB_SYNC_MAX_RETRIES || '3'),
  jobDefaultRetryDelayMs: parseInt(process.env.JOB_RETRY_DELAY_MS || '30000'),
  jobPollIntervalMs: parseInt(process.env.JOB_POLL_INTERVAL_MS || '5000'),
};

// ============================================================================
// BATCH SIZES & PAGINATION
// ============================================================================
export const BATCHES = {
  notificationCleanupBatch: parseInt(process.env.NOTIFICATION_CLEANUP_BATCH || '500'),
  qbPushBatchSize: parseInt(process.env.QB_PUSH_BATCH_SIZE || '25'),
  qbPushConcurrency: parseInt(process.env.QB_PUSH_CONCURRENCY || '3'),
  qbQueryPageSize: parseInt(process.env.QB_QUERY_PAGE_SIZE || '1000'),
  qbSyncPollingBatch: parseInt(process.env.QB_SYNC_POLLING_BATCH || '100'),
  emailProcessingBatch: parseInt(process.env.EMAIL_PROCESSING_BATCH || '50'),
  onboardingBatch: parseInt(process.env.ONBOARDING_BATCH || '10'),
  diagnosticFastBatch: parseInt(process.env.DIAGNOSTIC_FAST_BATCH || '10'),
  auditArchiveThreshold: parseInt(process.env.AUDIT_ARCHIVE_THRESHOLD || '10000'),
  billingBatchIntervalMs: parseInt(process.env.BILLING_BATCH_INTERVAL_MS || '5000'),
};

// ============================================================================
// FILE UPLOAD LIMITS
// ============================================================================
export const UPLOADS = {
  maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE_BYTES || String(25 * 1024 * 1024)),    // 25 MB
  maxSignatureSizeBytes: parseInt(process.env.MAX_SIGNATURE_SIZE_BYTES || String(1 * 1024 * 1024)), // 1 MB
  maxDescriptionLength: parseInt(process.env.MAX_DESCRIPTION_LENGTH || '5000'),
  maxPhotosPerReport: parseInt(process.env.MAX_PHOTOS_PER_REPORT || '10'),
  maxLocationLength: parseInt(process.env.MAX_LOCATION_LENGTH || '500'),
};

// ============================================================================
// CACHING
// ============================================================================
export const CACHING = {
  staticAssetMaxAgeSec: parseInt(process.env.STATIC_ASSET_MAX_AGE || '604800'),   // 7 days
  bundleMaxAgeSec: parseInt(process.env.BUNDLE_MAX_AGE || '86400'),               // 1 day
};

// ============================================================================
// MEMORY & RESOURCE THRESHOLDS
// ============================================================================
export const RESOURCES = {
  memoryPressureThreshold: parseFloat(process.env.MEMORY_PRESSURE_THRESHOLD || '0.9'),
};

// ============================================================================
// SCHEDULING ENGINE — Tier-aware caps (Trinity reads these dynamically)
// ============================================================================
export const SCHEDULING = {
  maxShiftsPerWeekByTier: {
    free: parseInt(process.env.SCHED_MAX_SHIFTS_FREE || '7'),
    starter: parseInt(process.env.SCHED_MAX_SHIFTS_STARTER || '14'),
    professional: parseInt(process.env.SCHED_MAX_SHIFTS_PRO || '28'),
    enterprise: parseInt(process.env.SCHED_MAX_SHIFTS_ENTERPRISE || '42'),
  },
  sessionTimeoutByTier: {
    free: parseInt(process.env.SCHED_TIMEOUT_FREE || String(5 * 60 * 1000)),
    starter: parseInt(process.env.SCHED_TIMEOUT_STARTER || String(15 * 60 * 1000)),
    professional: parseInt(process.env.SCHED_TIMEOUT_PRO || String(30 * 60 * 1000)),
    enterprise: parseInt(process.env.SCHED_TIMEOUT_ENTERPRISE || String(60 * 60 * 1000)),
  },
  candidatePoolSize: parseInt(process.env.SCHED_CANDIDATE_POOL || '200'),
  contractorPoolSize: parseInt(process.env.SCHED_CONTRACTOR_POOL || '100'),
  escalationPoolSize: parseInt(process.env.SCHED_ESCALATION_POOL || '100'),
  patternAnalysisSampleSize: parseInt(process.env.SCHED_PATTERN_SAMPLE || '500'),
  notificationRateLimitByTier: {
    free: parseInt(process.env.NOTIF_RATE_FREE || '20'),
    starter: parseInt(process.env.NOTIF_RATE_STARTER || '50'),
    professional: parseInt(process.env.NOTIF_RATE_PRO || '100'),
    enterprise: parseInt(process.env.NOTIF_RATE_ENTERPRISE || '500'),
  },
  circuitBreakerThreshold: parseInt(process.env.CIRCUIT_BREAKER_FAILURES || '5'),
  aiCandidatePoolForGemini: parseInt(process.env.SCHED_AI_CANDIDATE_POOL || '10'),
  daemonMaxShiftsPerEmployee: parseInt(process.env.DAEMON_MAX_SHIFTS_PER_EMP || '0'),
  daemonManualMaxShiftsPerEmployee: parseInt(process.env.DAEMON_MANUAL_MAX_SHIFTS_PER_EMP || '0'),
};

// ============================================================================
// AI BRAIN — Orchestration capacity & memory (Trinity reads these dynamically)
// ============================================================================
export const AI_BRAIN = {
  maxConcurrentIntents: parseInt(process.env.AI_MAX_CONCURRENT_INTENTS || '50'),
  intentHistorySize: parseInt(process.env.AI_INTENT_HISTORY_SIZE || '2000'),
  thoughtChainCap: parseInt(process.env.AI_THOUGHT_CHAIN_CAP || '100'),
  recentThoughtsDefault: parseInt(process.env.AI_RECENT_THOUGHTS || '40'),
  conversationTurnLimit: parseInt(process.env.AI_CONVERSATION_TURNS || '20'),
  crossDeviceSyncShifts: parseInt(process.env.SYNC_SHIFTS_LIMIT || '2000'),
  crossDeviceSyncTimeEntries: parseInt(process.env.SYNC_TIME_ENTRIES_LIMIT || '5000'),
  businessInsightsEmployeeLimit: parseInt(process.env.BI_EMPLOYEE_LIMIT || '1000'),
  businessInsightsClientLimit: parseInt(process.env.BI_CLIENT_LIMIT || '1000'),
  businessInsightsInvoiceLimit: parseInt(process.env.BI_INVOICE_LIMIT || '500'),
};

// ============================================================================
// CRON SCHEDULES
// ============================================================================
export const CRON = {
  smartBilling: process.env.CRON_SMART_BILLING || '0 2 * * *',
  aiScheduling: process.env.CRON_AI_SCHEDULING || '0 23 * * *',
  autoPayroll: process.env.CRON_AUTO_PAYROLL || '0 3 * * *',
  idempotencyCleanup: process.env.CRON_IDEMPOTENCY_CLEANUP || '0 4 * * *',
  chatAutoClose: process.env.CRON_CHAT_AUTO_CLOSE || '*/5 * * * *',
  wsCleanup: process.env.CRON_WS_CLEANUP || '*/5 * * * *',
  monthlyInfraBilling: process.env.CRON_MONTHLY_INFRA_BILLING || '0 1 1 * *',
  trialExpiry: process.env.CRON_TRIAL_EXPIRY || '0 6 * * *',
  billingExceptionQueue: process.env.CRON_BILLING_EXCEPTIONS || '0 5 * * *',
  emailAutomation: process.env.CRON_EMAIL_AUTOMATION || '0 9,15 * * *',
  complianceAlerts: process.env.CRON_COMPLIANCE_ALERTS || '0 8 * * *',
  shiftReminders: process.env.CRON_SHIFT_REMINDERS || '*/5 * * * *',
  signatureReminders: process.env.CRON_SIGNATURE_REMINDERS || '0 10 * * *',
  aiOverageBilling: process.env.CRON_AI_OVERAGE_BILLING || '30 0 * * 0',
  dbMaintenance: process.env.CRON_DB_MAINTENANCE || '0 3 * * 0',
  dailyDigest: process.env.CRON_DAILY_DIGEST || '0 7 * * *',
  qbTokenHealth: process.env.CRON_QB_TOKEN_HEALTH || '0 5 * * *',
  visualQa: process.env.CRON_VISUAL_QA || '0 6 * * *',
  weeklyAudit: process.env.CRON_WEEKLY_AUDIT || '0 2 * * 0',
  gamificationWeeklyReset: process.env.CRON_GAMIFICATION_WEEKLY || '0 0 * * 0',
  gamificationMonthlyReset: process.env.CRON_GAMIFICATION_MONTHLY || '0 0 1 * *',
  platformChangeMonitor: process.env.CRON_PLATFORM_MONITOR || '*/15 * * * *',
  shiftEscalation: process.env.CRON_SHIFT_ESCALATION || '*/30 * * * *',
  collectionsOutreach: process.env.CRON_COLLECTIONS_OUTREACH || '0 9 * * *',
};
