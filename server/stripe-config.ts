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
    priceId: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID || null,
    yearlyPriceId: process.env.STRIPE_STARTER_YEARLY_PRICE_ID || null,
    amount: BILLING.tiers.starter.monthlyPrice,
    yearlyAmount: BILLING.tiers.starter.yearlyPrice,
    employeeLimit: BILLING.tiers.starter.maxEmployees,
    features: BILLING.tiers.starter.features,
  },
  
  PROFESSIONAL: {
    name: `${BILLING.platform.name} Professional`,
    priceId: process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID || null,
    yearlyPriceId: process.env.STRIPE_PROFESSIONAL_YEARLY_PRICE_ID || null,
    amount: BILLING.tiers.professional.monthlyPrice,
    yearlyAmount: BILLING.tiers.professional.yearlyPrice,
    employeeLimit: BILLING.tiers.professional.maxEmployees,
    features: BILLING.tiers.professional.features,
  },
  
  ENTERPRISE: {
    name: `${BILLING.platform.name} Enterprise`,
    priceId: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID || null,
    yearlyPriceId: process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID || null,
    amount: BILLING.tiers.enterprise.monthlyPrice,
    yearlyAmount: BILLING.tiers.enterprise.yearlyPrice,
    employeeLimit: BILLING.tiers.enterprise.maxEmployees,
    features: BILLING.tiers.enterprise.features,
    isContactSales: false,
  },
  
  OVERAGES: {
    EMPLOYEE: {
      priceId: process.env.STRIPE_EMPLOYEE_OVERAGE_PRICE_ID || null,
      amount: BILLING.overages.perEmployee,
      description: 'Additional employee beyond plan limit',
    },
    CREDITS: {
      priceId: process.env.STRIPE_ADDON_CREDITS_PRICE_ID || null,
      amount: BILLING.creditPacks.starter.price,
      description: 'Additional AI automation credits',
    },
  },
} as const;

export type SubscriptionTier = 'free' | 'starter' | 'professional' | 'enterprise';
export type BillingCycle = 'monthly' | 'yearly';

export function getTierConfig(tier: SubscriptionTier) {
  const configs = {
    free: STRIPE_PRODUCTS.FREE,
    starter: STRIPE_PRODUCTS.STARTER,
    professional: STRIPE_PRODUCTS.PROFESSIONAL,
    enterprise: STRIPE_PRODUCTS.ENTERPRISE,
  };
  return configs[tier];
}

export function getPriceId(tier: SubscriptionTier, cycle: BillingCycle): string | null {
  const config = getTierConfig(tier);
  return cycle === 'yearly' ? config.yearlyPriceId : config.priceId;
}

export function calculateOverageCharges(employeeCount: number, tier: SubscriptionTier): number {
  const config = getTierConfig(tier);
  if (!config.employeeLimit || config.employeeLimit === 999999) return 0;
  
  const overage = Math.max(0, employeeCount - config.employeeLimit);
  return overage * STRIPE_PRODUCTS.OVERAGES.EMPLOYEE.amount;
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
} {
  const missing: string[] = [];
  
  if (!STRIPE_PRODUCTS.STARTER.priceId) missing.push('STRIPE_STARTER_MONTHLY_PRICE_ID');
  if (!STRIPE_PRODUCTS.STARTER.yearlyPriceId) missing.push('STRIPE_STARTER_YEARLY_PRICE_ID');
  if (!STRIPE_PRODUCTS.PROFESSIONAL.priceId) missing.push('STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID');
  if (!STRIPE_PRODUCTS.PROFESSIONAL.yearlyPriceId) missing.push('STRIPE_PROFESSIONAL_YEARLY_PRICE_ID');
  if (!STRIPE_PRODUCTS.ENTERPRISE.priceId) missing.push('STRIPE_ENTERPRISE_MONTHLY_PRICE_ID');
  if (!STRIPE_PRODUCTS.ENTERPRISE.yearlyPriceId) missing.push('STRIPE_ENTERPRISE_YEARLY_PRICE_ID');
  if (!STRIPE_PRODUCTS.OVERAGES.EMPLOYEE.priceId) missing.push('STRIPE_EMPLOYEE_OVERAGE_PRICE_ID');
  if (!STRIPE_PRODUCTS.OVERAGES.CREDITS.priceId) missing.push('STRIPE_ADDON_CREDITS_PRICE_ID');
  
  return {
    isConfigured: missing.length === 0,
    missing,
  };
}
