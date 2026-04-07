/**
 * Feature Toggles Configuration
 * Control what features are enabled/disabled without code changes
 * Turn features on/off instantly by editing this file
 */

export const FEATURE_TOGGLES = {
  // AI Features
  ai: {
    autoScheduling: true,
    sentimentAnalysis: true,
    predictiveAnalytics: true, // ENABLED: Sold in Professional tier
    smartMatching: true,
    aiCopilot: true,
  },

  // Workspace Features
  workspace: {
    multiWorkspace: true,
    customBranding: false,
    advancedReporting: true,
    customFields: true,
    apiAccess: false,
  },

  // Core Features
  core: {
    scheduling: true,
    timeTracking: true,
    payroll: true,
    billing: true,
    invoicing: true,
    employees: true,
    clients: true,
    shifts: true,
  },

  // Communications
  communications: {
    emailNotifications: true,
    smsNotifications: true, // ENABLED: Sold in Professional tier
    inAppNotifications: true,
    chatSupport: true,
    webhooks: true, // ENABLED: Sold in Enterprise tier
  },

  // Analytics
  analytics: {
    basicReports: true,
    advancedAnalytics: true, // ENABLED: Sold in Enterprise tier
    customReports: true,
    dataExport: true,
    dashboards: true,
  },

  // Integrations
  integrations: {
    quickbooks: true,
    gusto: true,
    slack: false,
    zapier: false,
    stripe: true,
  },

  // Security
  security: {
    mfa: true,
    sso: false,
    apiKeys: false,
    auditLogs: true,
    dataEncryption: true,
  },

  // Development/Testing
  development: {
    debugMode: false,
    testDataGeneration: false,
    errorTracking: true,
    performanceMonitoring: true,
  },

  // Automation
  automation: {
    autoTicketCreation: true, // Auto-create support tickets for critical health check failures
  },

  // Phase 4: Advanced Automation & Compliance
  phase4: {
    disputeResolution: true, // Phase 4C: Time entry dispute resolution with AI analysis
    payrollDeductions: true, // Phase 4D: Advanced pre-tax/post-tax deductions management
    payrollGarnishments: true, // Phase 4D: Court-ordered wage garnishments with priority ordering
    realTimeShiftNotifications: true, // Phase 4A: WebSocket-powered real-time shift alerts
    customSchedulerTracking: true, // Phase 4B: Autonomous scheduler with custom intervals
    aiDisputeAnalysis: true, // Phase 4C: AI-powered dispute summarization with confidence scores
  },
};

/**
 * Check if a feature is enabled
 * Usage: isFeatureEnabled('ai.autoScheduling')
 */
export function isFeatureEnabled(path: string): boolean {
  const parts = path.split(".");
  let feature: any = FEATURE_TOGGLES;

  for (const part of parts) {
    feature = feature[part];
    if (feature === undefined) {
      console.warn(`Feature not found: ${path}`);
      return false;
    }
  }

  return feature === true;
}

/**
 * Check if multiple features are ALL enabled
 * Usage: allFeaturesEnabled(['ai.autoScheduling', 'scheduling.enabled'])
 */
export function allFeaturesEnabled(paths: string[]): boolean {
  return paths.every((path) => isFeatureEnabled(path));
}

/**
 * Check if ANY of the features are enabled
 * Usage: anyFeatureEnabled(['ai.sentimentAnalysis', 'analytics.advancedAnalytics'])
 */
export function anyFeatureEnabled(paths: string[]): boolean {
  return paths.some((path) => isFeatureEnabled(path));
}

/**
 * Get all enabled features for a category
 * Usage: getEnabledFeatures('ai')
 */
export function getEnabledFeatures(category: string): string[] {
  const features: string[] = [];
  const group = (FEATURE_TOGGLES as any)[category];

  if (!group) return [];

  Object.entries(group).forEach(([key, value]) => {
    if (value === true) {
      features.push(key);
    }
  });

  return features;
}

/**
 * Get feature toggle group by category
 */
export function getFeatureGroup(category: string): any {
  return (FEATURE_TOGGLES as any)[category] || null;
}

/**
 * Check if workspace tier has access to feature
 */
export function tierHasFeature(
  tier: "free" | "starter" | "professional" | "enterprise",
  featurePath: string
): boolean {
  const tierFeatures: Record<string, string[]> = {
    free: ["core.timeTracking", "core.scheduling", "core.employees"],
    starter: [
      "core.timeTracking",
      "core.scheduling",
      "core.employees",
      "core.invoicing",
      "communications.emailNotifications",
      "analytics.basicReports",
    ],
    professional: [
      "core.timeTracking",
      "core.scheduling",
      "core.employees",
      "core.invoicing",
      "core.payroll",
      "communications.emailNotifications",
      "communications.chatSupport",
      "analytics.basicReports",
      "analytics.advancedAnalytics",
      "ai.autoScheduling",
    ],
    enterprise: [
      ...Object.keys(FEATURE_TOGGLES)
        .flatMap((category) =>
          Object.keys((FEATURE_TOGGLES as any)[category]).map(
            (feature) => `${category}.${feature}`
          )
        ),
    ],
  };

  return tierFeatures[tier]?.includes(featurePath) || false;
}
