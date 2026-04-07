/**
 * Stripe Product & Price Configuration
 * =====================================
 * DYNAMIC CONFIGURATION - All pricing from environment variables
 * Synced with subscriptionManager.ts and shared/billingConfig.ts
 * 
 * To configure: Add Stripe Price IDs to environment variables
 * (See TESTING_RESULTS.md for required environment variable names)
 */

import { BILLING } from '@shared/billingConfig';

export const STRIPE_PRODUCTS = {
  FREE: {
    name: `${BILLING.platform.name} Free Trial`,
    priceId: null,
    yearlyPriceId: null,
    amount: BILLING.tiers.free.monthlyPrice,
    yearlyAmount: BILLING.tiers.free.yearlyPrice,
    employeeLimit: BILLING.tiers.free.maxEmployees,
    trialDays: BILLING.tiers.free.trialDays,
    features: BILLING.tiers.free.features,
  },
  
  STARTER: {
    name: `${BILLING.platform.name} Starter`,
    priceId: process.env.STRIPE_PRICE_STARTER_MONTHLY || process.env.STRIPE_STARTER_MONTHLY_PRICE_ID || null,
    yearlyPriceId: process.env.STRIPE_PRICE_STARTER_ANNUAL || process.env.STRIPE_STARTER_YEARLY_PRICE_ID || null,
    amount: BILLING.tiers.starter.monthlyPrice,
    yearlyAmount: BILLING.tiers.starter.yearlyPrice,
    employeeLimit: BILLING.tiers.starter.maxEmployees,
    features: BILLING.tiers.starter.features,
  },
  
  PROFESSIONAL: {
    name: `${BILLING.platform.name} Professional`,
    priceId: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY || process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID || null,
    yearlyPriceId: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL || process.env.STRIPE_PROFESSIONAL_YEARLY_PRICE_ID || null,
    amount: BILLING.tiers.professional.monthlyPrice,
    yearlyAmount: BILLING.tiers.professional.yearlyPrice,
    employeeLimit: BILLING.tiers.professional.maxEmployees,
    features: BILLING.tiers.professional.features,
  },
  
  BUSINESS: {
    name: `${BILLING.platform.name} Business`,
    priceId: process.env.STRIPE_PRICE_BUSINESS_MONTHLY || process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID || null,
    yearlyPriceId: process.env.STRIPE_PRICE_BUSINESS_ANNUAL || process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID || null,
    amount: BILLING.tiers.business.monthlyPrice,
    yearlyAmount: BILLING.tiers.business.yearlyPrice,
    employeeLimit: BILLING.tiers.business.maxEmployees,
    features: BILLING.tiers.business.features,
  },

  ENTERPRISE: {
    name: `${BILLING.platform.name} Enterprise`,
    priceId: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID || null,
    yearlyPriceId: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL || process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID || null,
    amount: BILLING.tiers.enterprise.monthlyPrice,
    yearlyAmount: BILLING.tiers.enterprise.yearlyPrice,
    employeeLimit: BILLING.tiers.enterprise.maxEmployees,
    features: BILLING.tiers.enterprise.features,
    isContactSales: false,
  },
  
  OVERAGES: {
    EMPLOYEE: {
      priceId: process.env.STRIPE_EMPLOYEE_OVERAGE_PRICE_ID || null,
      amount: BILLING.overages.starter,
      description: 'Additional employee beyond plan limit',
    },
    CREDITS: {
      priceId: process.env.STRIPE_ADDON_CREDITS_PRICE_ID || null,
      amount: BILLING.creditPacks.starter.price,
      description: 'Additional AI automation credits',
    },
  },
  
  SETUP_FEES: {
    STARTER: {
      priceId: process.env.STRIPE_SETUP_STARTER_PRICE_ID || null,
      amount: BILLING.setupFees.starter.price,
      name: BILLING.setupFees.starter.name,
      description: BILLING.setupFees.starter.description,
    },
    PROFESSIONAL: {
      priceId: process.env.STRIPE_SETUP_PROFESSIONAL_PRICE_ID || null,
      amount: BILLING.setupFees.professional.price,
      name: BILLING.setupFees.professional.name,
      description: BILLING.setupFees.professional.description,
    },
    ENTERPRISE: {
      priceId: process.env.STRIPE_SETUP_ENTERPRISE_PRICE_ID || null,
      amount: BILLING.setupFees.enterprise.startsAt,
      name: BILLING.setupFees.enterprise.name,
      description: BILLING.setupFees.enterprise.description,
      isContactSales: true,
    },
  },
  
  ADDONS: {
    CLAUDE_PREMIUM: {
      priceId: process.env.STRIPE_ADDON_CLAUDE_PREMIUM_PRICE_ID || null,
      amount: BILLING.addons.claude_premium_unlimited.monthlyPrice,
      name: BILLING.addons.claude_premium_unlimited.name,
      description: BILLING.addons.claude_premium_unlimited.description,
      availableTiers: BILLING.addons.claude_premium_unlimited.availableTiers,
    },
    AI_CFO_INSIGHTS: {
      priceId: process.env.STRIPE_ADDON_AI_CFO_PRICE_ID || null,
      amount: BILLING.addons.ai_cfo_insights.monthlyPrice,
      name: BILLING.addons.ai_cfo_insights.name,
      description: BILLING.addons.ai_cfo_insights.description,
      availableTiers: BILLING.addons.ai_cfo_insights.availableTiers,
    },
    ADDITIONAL_LOCATION: {
      priceId: process.env.STRIPE_ADDON_LOCATION_PRICE_ID || null,
      amount: BILLING.addons.multi_location.monthlyPrice,
      name: BILLING.addons.multi_location.name,
      description: BILLING.addons.multi_location.description,
      availableTiers: BILLING.addons.multi_location.availableTiers,
      isMetered: true,
    },
    FLEET_MANAGEMENT: {
      priceId: process.env.STRIPE_ADDON_FLEET_PRICE_ID || null,
      amount: BILLING.addons.fleet_management.monthlyPrice,
      name: BILLING.addons.fleet_management.name,
      description: BILLING.addons.fleet_management.description,
      availableTiers: BILLING.addons.fleet_management.availableTiers,
    },
  },
} as const;

export type SubscriptionTier = 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic';
export type BillingCycle = 'monthly' | 'yearly';

export function getTierConfig(tier: SubscriptionTier) {
  const configs: Record<SubscriptionTier, typeof STRIPE_PRODUCTS.FREE | typeof STRIPE_PRODUCTS.STARTER | typeof STRIPE_PRODUCTS.PROFESSIONAL | typeof STRIPE_PRODUCTS.BUSINESS | typeof STRIPE_PRODUCTS.ENTERPRISE> = {
    free:         STRIPE_PRODUCTS.FREE,
    trial:        STRIPE_PRODUCTS.FREE,
    starter:      STRIPE_PRODUCTS.STARTER,
    professional: STRIPE_PRODUCTS.PROFESSIONAL,
    business:     STRIPE_PRODUCTS.BUSINESS,
    enterprise:   STRIPE_PRODUCTS.ENTERPRISE,
    strategic:    STRIPE_PRODUCTS.ENTERPRISE,
  };
  return configs[tier] ?? STRIPE_PRODUCTS.FREE;
}

export function getPriceId(tier: SubscriptionTier, cycle: BillingCycle): string | null {
  const config = getTierConfig(tier);
  return cycle === 'yearly' ? config.yearlyPriceId : config.priceId;
}

export function calculateOverageCharges(employeeCount: number, tier: SubscriptionTier): number {
  const config = getTierConfig(tier);
  if (!config.employeeLimit) return 0;
  
  const overage = Math.max(0, employeeCount - config.employeeLimit);
  const tierKey = tier as keyof typeof BILLING.overages;
  const perEmployeeRate = (typeof BILLING.overages[tierKey] === 'number' ? BILLING.overages[tierKey] : BILLING.overages.starter) as number;
  return overage * perEmployeeRate;
}

export function formatPrice(amountInCents: number): string {
  return `$${(amountInCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function getYearlySavings(tier: SubscriptionTier): number {
  const config = getTierConfig(tier);
  if (!config.amount) return 0;
  const monthlyTotal = config.amount * 12;
  const yearlyPrice = config.yearlyAmount || 0;
  return monthlyTotal - yearlyPrice;
}

export function getYearlySavingsPercent(tier: SubscriptionTier): number {
  const config = getTierConfig(tier);
  if (!config.amount) return 0;
  const monthlyTotal = config.amount * 12;
  const savings = getYearlySavings(tier);
  return Math.round((savings / monthlyTotal) * 100);
}

export function validatePriceIdsConfigured(): { 
  isConfigured: boolean; 
  missing: string[];
  optionalMissing: string[];
} {
  const missing: string[] = [];
  const optionalMissing: string[] = [];
  
  // Required: Subscription tiers
  if (!STRIPE_PRODUCTS.STARTER.priceId) missing.push('STRIPE_STARTER_MONTHLY_PRICE_ID');
  if (!STRIPE_PRODUCTS.STARTER.yearlyPriceId) missing.push('STRIPE_STARTER_YEARLY_PRICE_ID');
  if (!STRIPE_PRODUCTS.PROFESSIONAL.priceId) missing.push('STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID');
  if (!STRIPE_PRODUCTS.PROFESSIONAL.yearlyPriceId) missing.push('STRIPE_PROFESSIONAL_YEARLY_PRICE_ID');
  if (!STRIPE_PRODUCTS.BUSINESS.priceId) missing.push('STRIPE_BUSINESS_MONTHLY_PRICE_ID');
  if (!STRIPE_PRODUCTS.BUSINESS.yearlyPriceId) missing.push('STRIPE_BUSINESS_YEARLY_PRICE_ID');
  if (!STRIPE_PRODUCTS.ENTERPRISE.priceId) missing.push('STRIPE_ENTERPRISE_MONTHLY_PRICE_ID');
  if (!STRIPE_PRODUCTS.ENTERPRISE.yearlyPriceId) missing.push('STRIPE_ENTERPRISE_YEARLY_PRICE_ID');
  
  // Required: Overages
  if (!STRIPE_PRODUCTS.OVERAGES.EMPLOYEE.priceId) missing.push('STRIPE_EMPLOYEE_OVERAGE_PRICE_ID');
  if (!STRIPE_PRODUCTS.OVERAGES.CREDITS.priceId) missing.push('STRIPE_ADDON_CREDITS_PRICE_ID');
  
  // Required: Setup fees
  if (!STRIPE_PRODUCTS.SETUP_FEES.STARTER.priceId) missing.push('STRIPE_SETUP_STARTER_PRICE_ID');
  if (!STRIPE_PRODUCTS.SETUP_FEES.PROFESSIONAL.priceId) missing.push('STRIPE_SETUP_PROFESSIONAL_PRICE_ID');
  
  if (!STRIPE_PRODUCTS.ADDONS.CLAUDE_PREMIUM.priceId) optionalMissing.push('STRIPE_ADDON_CLAUDE_PREMIUM_PRICE_ID');
  if (!STRIPE_PRODUCTS.ADDONS.AI_CFO_INSIGHTS.priceId) optionalMissing.push('STRIPE_ADDON_AI_CFO_PRICE_ID');
  if (!STRIPE_PRODUCTS.ADDONS.ADDITIONAL_LOCATION.priceId) optionalMissing.push('STRIPE_ADDON_LOCATION_PRICE_ID');
  if (!STRIPE_PRODUCTS.ADDONS.FLEET_MANAGEMENT.priceId) optionalMissing.push('STRIPE_ADDON_FLEET_PRICE_ID');
  
  return {
    isConfigured: missing.length === 0,
    missing,
    optionalMissing,
  };
}

export type AddonKey = keyof typeof STRIPE_PRODUCTS.ADDONS;

export function getAddonConfig(addonKey: AddonKey) {
  return STRIPE_PRODUCTS.ADDONS[addonKey];
}

export function getAddonPriceId(addonKey: AddonKey): string | null {
  return getAddonConfig(addonKey).priceId;
}

export type SetupFeeTier = 'starter' | 'professional' | 'enterprise';

export function getSetupFeeConfig(tier: SetupFeeTier) {
  const configs = {
    starter: STRIPE_PRODUCTS.SETUP_FEES.STARTER,
    professional: STRIPE_PRODUCTS.SETUP_FEES.PROFESSIONAL,
    enterprise: STRIPE_PRODUCTS.SETUP_FEES.ENTERPRISE,
  };
  return configs[tier];
}

export function getSetupFeePriceId(tier: SetupFeeTier): string | null {
  return getSetupFeeConfig(tier).priceId;
}
