/**
 * Pricing & Subscription Tiers Configuration
 * Maps tiers to features, pricing, and limits
 * Edit here to change tier definitions, features, or pricing
 */

export type SubscriptionTier = "free" | "starter" | "professional" | "enterprise";

interface PricingTier {
  name: string;
  description: string;
  price: number | null;
  annualPrice?: number;
  currency: string;
  billingPeriod: string;
  features: string[];
  limits: {
    employees: number | null;
    shifts: number | null;
    monthlyInvoices: number | null;
    storageGB: number;
    apiCalls: number | null;
  };
}

/**
 * COPILOT AUTOMATION PRICING
 * ==========================
 * CoAIleague is middleware automation - users already pay for QuickBooks, Gusto, etc.
 * We provide the AI-powered automation layer with 99% automation / 1% human approval.
 * 
 * IMPORTANT: AI makes errors. All automation requires designated approver sign-off.
 * This is "copilot automation" NOT "fully automated" - keeping orgs legally safe.
 */
export const PRICING_TIERS: Record<SubscriptionTier, PricingTier> = {
  free: {
    name: "Free Trial",
    description: "14-day trial to experience Trinity AI automation",
    price: 0,
    currency: "USD",
    billingPeriod: "month",
    features: [
      "core.timeTracking",
      "core.scheduling",
      "core.employees",
      "analytics.basicReports",
      "ai.trinityAssistant",
    ],
    limits: {
      employees: 5,
      shifts: 20,
      monthlyInvoices: 0,
      storageGB: 1,
      apiCalls: 500,
    },
  },

  starter: {
    name: "Starter",
    description: "Perfect for small teams automating workforce management",
    price: 349,
    annualPrice: 3490,
    currency: "USD",
    billingPeriod: "month",
    features: [
      "core.timeTracking",
      "core.scheduling",
      "core.employees",
      "core.invoicing",
      "communications.emailNotifications",
      "analytics.basicReports",
      "ai.trinityAssistant",
      "ai.autoScheduling",
      "integrations.oneHRIS",
    ],
    limits: {
      employees: 10,
      shifts: 100,
      monthlyInvoices: 50,
      storageGB: 5,
      apiCalls: 5000,
    },
  },

  professional: {
    name: "Professional",
    description: "Full automation suite for growing businesses",
    price: 999,
    annualPrice: 9990,
    currency: "USD",
    billingPeriod: "month",
    features: [
      "core.timeTracking",
      "core.scheduling",
      "core.employees",
      "core.invoicing",
      "core.payroll",
      "communications.emailNotifications",
      "communications.chatSupport",
      "analytics.basicReports",
      "analytics.advancedAnalytics",
      "ai.trinityAssistant",
      "ai.autoScheduling",
      "ai.smartMatching",
      "ai.payrollAutomation",
      "integrations.unlimitedHRIS",
      "compliance.fiftyState",
    ],
    limits: {
      employees: 25,
      shifts: 500,
      monthlyInvoices: 250,
      storageGB: 25,
      apiCalls: 25000,
    },
  },

  enterprise: {
    name: "Enterprise",
    description: "Everything you need to scale",
    price: null,
    currency: "USD",
    billingPeriod: "month",
    features: [
      "core.timeTracking",
      "core.scheduling",
      "core.employees",
      "core.invoicing",
      "core.payroll",
      "core.billing",
      "core.clients",
      "communications.emailNotifications",
      "communications.smsNotifications",
      "communications.inAppNotifications",
      "communications.chatSupport",
      "communications.webhooks",
      "analytics.basicReports",
      "analytics.advancedAnalytics",
      "analytics.customReports",
      "analytics.dataExport",
      "analytics.dashboards",
      "ai.autoScheduling",
      "ai.sentimentAnalysis",
      "ai.predictiveAnalytics",
      "ai.smartMatching",
      "ai.aiCopilot",
      "integrations.quickbooks",
      "integrations.gusto",
      "integrations.stripe",
      "security.mfa",
      "security.sso",
      "security.apiKeys",
      "security.auditLogs",
      "workspace.multiWorkspace",
      "workspace.customBranding",
      "workspace.advancedReporting",
      "workspace.customFields",
    ],
    limits: {
      employees: null,
      shifts: null,
      monthlyInvoices: null,
      storageGB: 1000,
      apiCalls: null,
    },
  },
};

/**
 * Get pricing tier by name
 */
export function getPricingTier(tier: SubscriptionTier) {
  return PRICING_TIERS[tier];
}

/**
 * Get features for a tier
 */
export function getTierFeatures(tier: SubscriptionTier): string[] {
  const tierConfig = PRICING_TIERS[tier];
  return tierConfig?.features || [];
}

/**
 * Check if feature is in a tier
 */
export function isFeatureInTier(featurePath: string, tier: SubscriptionTier): boolean {
  const features = getTierFeatures(tier);
  return features.includes(featurePath);
}

/**
 * Get all tiers
 */
export function getAllTiers(): SubscriptionTier[] {
  return Object.keys(PRICING_TIERS) as SubscriptionTier[];
}

/**
 * Get tier limit value
 */
export function getTierLimit(tier: SubscriptionTier, limit: keyof PricingTier["limits"]) {
  return PRICING_TIERS[tier].limits[limit];
}

/**
 * Check if user has reached tier limit
 */
export function hasReachedLimit(tier: SubscriptionTier, limitName: keyof PricingTier["limits"], currentValue: number): boolean {
  const limit = getTierLimit(tier, limitName);
  if (limit === null) return false;
  return currentValue >= limit;
}

/**
 * Get price formatted as string
 */
export function formatPrice(tier: SubscriptionTier, annual: boolean = false): string {
  const tierConfig = PRICING_TIERS[tier];
  if (!tierConfig) return "";
  
  const price = annual && tierConfig.annualPrice ? tierConfig.annualPrice : tierConfig.price;
  if (price === null) return "Custom";
  
  return `$${(price / 100).toFixed(2)}`;
}

/**
 * Get monthly price from annual
 */
export function getMonthlyPrice(tier: SubscriptionTier, annual: boolean = false): number {
  const tierConfig = PRICING_TIERS[tier];
  if (!tierConfig) return 0;
  
  const price = annual && tierConfig.annualPrice ? tierConfig.annualPrice : tierConfig.price;
  if (price === null) return 0;
  
  return annual ? price / 12 / 100 : price / 100;
}

/**
 * Get tier that includes all features
 */
export function getTierForFeatures(features: string[]): SubscriptionTier | null {
  for (const tier of getAllTiers()) {
    if (features.every((f) => isFeatureInTier(f, tier))) {
      return tier;
    }
  }
  return null;
}
