/**
 * Integrations Configuration
 * Centralized settings for all external service integrations
 * API endpoints, keys, and integration-specific settings
 */

export const INTEGRATIONS = {
  // Stripe - Payment Processing
  stripe: {
    enabled: true,
    publicKey: import.meta.env.VITE_STRIPE_PUBLIC_KEY || "",
    apiVersion: "2023-10-16",
    webhook: {
      endpoint: "/api/webhooks/stripe",
      events: ["payment_intent.succeeded", "charge.refunded", "customer.subscription.updated"],
    },
    features: {
      subscriptions: true,
      invoices: true,
      payouts: true,
    },
  },

  // Resend - Email Service
  resend: {
    enabled: true,
    apiUrl: "https://api.resend.com",
    features: {
      transactional: true,
      templates: true,
      webhooks: true,
    },
    templates: {
      passwordReset: "password-reset",
      emailVerification: "email-verification",
      supportTicket: "support-ticket",
      payrollNotification: "payroll-notification",
      onboarding: "employee-onboarding",
    },
  },

  // Google Gemini - AI
  gemini: {
    enabled: true,
    apiUrl: "https://generativelanguage.googleapis.com/v1",
    model: "gemini-2.0-flash-exp",
    apiKeyEnv: "GEMINI_API_KEY",
    features: {
      textGeneration: true,
      scheduling: true,
      sentiment: true,
      analytics: true,
    },
  },

  // OpenAI - Alternative AI
  openai: {
    enabled: false,
    apiUrl: "https://api.openai.com/v1",
    model: "gpt-4",
    apiKeyEnv: "OPENAI_API_KEY",
    features: {
      textGeneration: true,
      embeddings: true,
      functions: true,
    },
  },

  // Anthropic Claude - Alternative AI
  anthropic: {
    enabled: false,
    apiUrl: "https://api.anthropic.com",
    model: "claude-3-sonnet-20240229",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    features: {
      textGeneration: true,
      longContext: true,
    },
  },

  // Twilio - SMS & Voice
  twilio: {
    enabled: false,
    apiUrl: "https://api.twilio.com",
    accountSidEnv: "TWILIO_ACCOUNT_SID",
    authTokenEnv: "TWILIO_AUTH_TOKEN",
    features: {
      sms: true,
      voice: true,
      whatsapp: false,
    },
  },

  // QuickBooks - Accounting
  quickbooks: {
    enabled: true,
    clientIdEnv: "QUICKBOOKS_CLIENT_ID",
    clientSecretEnv: "QUICKBOOKS_CLIENT_SECRET",
    apiUrl: "https://quickbooks.api.intuit.com",
    scopes: [
      "com.intuit.quickbooks.accounting",
      "openid",
      "profile",
      "email",
      "phone",
      "address",
    ],
    features: {
      invoices: true,
      expenses: true,
      taxes: true,
      reporting: true,
    },
  },

  // Gusto - Payroll
  gusto: {
    enabled: true,
    clientIdEnv: "GUSTO_CLIENT_ID",
    clientSecretEnv: "GUSTO_CLIENT_SECRET",
    apiUrl: "https://api.gusto.com",
    features: {
      payroll: true,
      benefits: true,
      tax: true,
      directDeposit: true,
    },
  },

  // Slack - Communication
  slack: {
    enabled: false,
    botTokenEnv: "SLACK_BOT_TOKEN",
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
    apiUrl: "https://slack.com/api",
    features: {
      notifications: true,
      commands: true,
      interactive: true,
    },
  },

  // Google Cloud Storage
  gcs: {
    enabled: true,
    projectIdEnv: "GOOGLE_CLOUD_PROJECT",
    bucketNameEnv: "DEFAULT_OBJECT_STORAGE_BUCKET_ID",
    features: {
      fileUpload: true,
      imageStorage: true,
      documentStorage: true,
    },
  },

  // PostgreSQL Database
  postgres: {
    enabled: true,
    urlEnv: "DATABASE_URL",
    features: {
      queries: true,
      transactions: true,
      backups: true,
    },
  },

  // Redis Cache
  redis: {
    enabled: false,
    urlEnv: "REDIS_URL",
    features: {
      caching: true,
      sessions: true,
      pubsub: true,
    },
  },

  // Sentry - Error Tracking
  sentry: {
    enabled: false,
    dsnEnv: "SENTRY_DSN",
    apiUrl: "https://sentry.io/api",
    features: {
      errorTracking: true,
      performance: true,
      releases: true,
    },
  },

  // DataDog - Monitoring
  datadog: {
    enabled: false,
    apiKeyEnv: "DATADOG_API_KEY",
    appKeyEnv: "DATADOG_APP_KEY",
    apiUrl: "https://api.datadoghq.com/api",
    features: {
      metrics: true,
      logs: true,
      tracing: true,
    },
  },
};

/**
 * Get integration config
 * Usage: getIntegration('stripe')
 */
export function getIntegration(name: keyof typeof INTEGRATIONS) {
  return INTEGRATIONS[name];
}

/**
 * Check if integration is enabled
 * Usage: isIntegrationEnabled('stripe')
 */
export function isIntegrationEnabled(name: keyof typeof INTEGRATIONS): boolean {
  return INTEGRATIONS[name]?.enabled === true;
}

/**
 * Get integration API URL
 * Usage: getIntegrationUrl('stripe')
 */
export function getIntegrationUrl(name: keyof typeof INTEGRATIONS): string {
  return (INTEGRATIONS[name] as any)?.apiUrl || "";
}

/**
 * Get integration API key from environment
 * Usage: getIntegrationApiKey('gemini')
 */
export function getIntegrationApiKey(name: keyof typeof INTEGRATIONS): string | null {
  const integration = INTEGRATIONS[name] as any;
  if (!integration?.apiKeyEnv) return null;
  
  // Get from environment - client-side only has access to VITE_ prefixed vars
  const key = import.meta.env[`VITE_${integration.apiKeyEnv}`];
  return key || null;
}

/**
 * Get all enabled integrations
 */
export function getEnabledIntegrations(): string[] {
  return Object.entries(INTEGRATIONS)
    .filter(([_, config]) => (config as any).enabled)
    .map(([name]) => name);
}

/**
 * Get integration for a feature
 * Usage: getIntegrationForFeature('payroll') -> 'gusto'
 */
export function getIntegrationForFeature(feature: string): string | null {
  for (const [name, config] of Object.entries(INTEGRATIONS)) {
    const features = (config as any).features;
    if (features && features[feature]) {
      return name;
    }
  }
  return null;
}

/**
 * Check if feature is supported by any enabled integration
 * Usage: isFeatureSupported('payroll')
 */
export function isFeatureSupported(feature: string): boolean {
  const integration = getIntegrationForFeature(feature);
  return integration !== null && isIntegrationEnabled(integration as any);
}
