/**
 * MASTER BILLING CONFIGURATION
 * =============================
 * Single source of truth for ALL billing, pricing, and subscription settings.
 * This file follows the same pattern as platformConfig.ts
 * 
 * NO HARDCODED VALUES - All pricing flows from this centralized config.
 * Edit values here to change billing behavior everywhere instantly.
 * 
 * VALUE-BASED PRICING: Captures 40-50% of $250K-$430K administrative salary replacement
 */

// ============================================================================
// PLATFORM IDENTITY (Billing Context)
// ============================================================================
export const BILLING = {
  platform: {
    name: "CoAIleague",
    currency: "USD",
    currencySymbol: "$",
    locale: "en-US",
  },

  // ==========================================================================
  // SUBSCRIPTION TIERS
  // ==========================================================================
  tiers: {
    free: {
      id: "free",
      name: "Free Trial",
      description: "Perfect for trying out CoAIleague",
      monthlyPrice: 0,
      yearlyPrice: 0,
      maxEmployees: 5,
      monthlyCredits: 100,
      trialDays: 30,
      adminReplacementValue: 0,
      features: [
        "Up to 5 employees",
        "Basic scheduling",
        "Time tracking",
        "100 AI credits/month",
        "Email support",
      ],
      limitations: [
        "Limited to 5 employees",
        "No payroll automation",
        "No client portal",
        "No advanced analytics",
      ],
    },
    
    starter: {
      id: "starter",
      name: "Starter",
      description: "For small teams ready to automate",
      monthlyPrice: 499900, // $4,999/month in cents
      yearlyPrice: 5998800, // $59,988/year in cents ($4,999 × 12)
      maxEmployees: 50,
      monthlyCredits: 500,
      adminReplacementValue: 252500, // Replaces 2-3 high-end admin positions
      features: [
        "Up to 50 employees",
        "AI Scheduling - Smart scheduling",
        "Time Platform - Full time tracking",
        "Billing Platform - Automated invoicing",
        "Basic payroll processing",
        "Client portal access",
        "Mobile app access",
        "500 AI credits/month",
        "Priority email support",
      ],
      popular: false,
    },
    
    professional: {
      id: "professional",
      name: "Professional",
      description: "For growing businesses needing full automation",
      monthlyPrice: 999900, // $9,999/month in cents
      yearlyPrice: 11998800, // $119,988/year in cents
      maxEmployees: 150,
      monthlyCredits: 2000,
      adminReplacementValue: 335000, // Replaces 3-4 high-end admin positions
      features: [
        "Up to 150 employees",
        "Everything in Starter",
        "AI Payroll - Full automation",
        "AI Training - LMS & certifications",
        "Performance reviews & PTO",
        "Benefits management",
        "Custom forms & reports",
        "Advanced AI integrations",
        "2,000 AI credits/month",
        "Priority support (24hr response)",
        "Advanced analytics dashboard",
      ],
      popular: true,
    },
    
    enterprise: {
      id: "enterprise",
      name: "Enterprise",
      description: "For large organizations with complex needs",
      monthlyPrice: 1799900, // $17,999/month in cents
      yearlyPrice: 21598800, // $215,988/year in cents
      maxEmployees: 999999, // Unlimited
      monthlyCredits: 10000,
      adminReplacementValue: 432500, // Replaces 4-5 high-end admin positions
      features: [
        "Unlimited employees",
        "Everything in Professional",
        "Advanced analytics dashboards",
        "API access & webhooks",
        "Custom reporting & exports",
        "Dedicated account manager",
        "Priority support (4hr response)",
        "Custom integration assistance",
        "Flexible billing & payment terms",
        "10,000 AI credits/month",
        "Credit rollover (up to 25%)",
        "White-label options",
      ],
      popular: false,
    },
  },

  // ==========================================================================
  // OVERAGE PRICING
  // ==========================================================================
  overages: {
    perEmployee: 5000, // $50/employee/month in cents
    description: "Additional employees beyond plan limit",
    billingCycle: "monthly",
  },

  // ==========================================================================
  // AI CREDIT PACKS (For purchasing additional credits)
  // ==========================================================================
  creditPacks: {
    starter: {
      id: "credits_500",
      name: "500 Credits",
      credits: 500,
      price: 4900, // $49 in cents
      pricePerCredit: 9.8, // cents per credit
      popular: false,
    },
    standard: {
      id: "credits_1500",
      name: "1,500 Credits",
      credits: 1500,
      price: 12900, // $129 in cents
      pricePerCredit: 8.6,
      popular: true,
    },
    professional: {
      id: "credits_5000",
      name: "5,000 Credits",
      credits: 5000,
      price: 39900, // $399 in cents
      pricePerCredit: 7.98,
      popular: false,
    },
    enterprise: {
      id: "credits_15000",
      name: "15,000 Credits",
      credits: 15000,
      price: 99900, // $999 in cents
      pricePerCredit: 6.66,
      popular: false,
    },
  },

  // ==========================================================================
  // CREDIT COSTS PER FEATURE
  // ==========================================================================
  creditCosts: {
    ai_scheduling: 25,
    ai_schedule_optimization: 15,
    ai_shift_matching: 5,
    ai_invoice_generation: 15,
    ai_invoice_review: 3,
    ai_payroll_processing: 15,
    ai_payroll_verification: 5,
    ai_chat_query: 5,
    ai_email_generation: 8,
    ai_analytics_report: 12,
    ai_predictions: 10,
    ai_migration: 10,
    ai_general: 3,
  },

  // ==========================================================================
  // BILLING SETTINGS
  // ==========================================================================
  settings: {
    trialWarningDays: 5, // Days before trial ends to show warning
    gracePeriodDays: 7, // Days after failed payment before suspension
    maxRetryAttempts: 3, // Payment retry attempts
    retryIntervalDays: 3, // Days between retry attempts
    invoiceDueDays: 30, // Days until invoice is due
    taxCalculation: "stripe_tax", // Use Stripe Tax for automatic calculation
    refundPolicy: "prorated", // Prorated refunds for downgrades
    upgradeBehavior: "immediate_prorate", // Immediate upgrade with proration
    downgradeBehavior: "end_of_period", // Downgrade at end of billing period
  },

  // ==========================================================================
  // EMAIL BILLING COSTS (for Resend integration)
  // ==========================================================================
  emailCosts: {
    transactional: 0.001, // $0.001 per email
    marketing: 0.002, // $0.002 per email
    bulk: 0.0008, // $0.0008 per email for bulk
    minimumCharge: 0.10, // Minimum charge per batch
  },

  // ==========================================================================
  // STRIPE ENVIRONMENT VARIABLE MAPPING
  // ==========================================================================
  stripeEnvVars: {
    starterMonthly: "STRIPE_STARTER_MONTHLY_PRICE_ID",
    starterYearly: "STRIPE_STARTER_YEARLY_PRICE_ID",
    professionalMonthly: "STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID",
    professionalYearly: "STRIPE_PROFESSIONAL_YEARLY_PRICE_ID",
    enterpriseMonthly: "STRIPE_ENTERPRISE_MONTHLY_PRICE_ID",
    enterpriseYearly: "STRIPE_ENTERPRISE_YEARLY_PRICE_ID",
    employeeOverage: "STRIPE_EMPLOYEE_OVERAGE_PRICE_ID",
    addonCredits: "STRIPE_ADDON_CREDITS_PRICE_ID",
    webhookSecret: "STRIPE_WEBHOOK_SECRET",
  },
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export type TierKey = keyof typeof BILLING.tiers;
export type BillingCycle = "monthly" | "yearly";

export function getTierById(tierId: TierKey) {
  return BILLING.tiers[tierId];
}

export function formatPrice(amountInCents: number): string {
  return `${BILLING.platform.currencySymbol}${(amountInCents / 100).toLocaleString(BILLING.platform.locale, { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  })}`;
}

export function formatPriceWithDecimals(amountInCents: number): string {
  return `${BILLING.platform.currencySymbol}${(amountInCents / 100).toLocaleString(BILLING.platform.locale, { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })}`;
}

export function getMonthlyEquivalent(yearlyPrice: number): number {
  return Math.round(yearlyPrice / 12);
}

export function getYearlySavings(tierId: TierKey): number {
  const tier = getTierById(tierId);
  if (!tier.monthlyPrice) return 0;
  const monthlyTotal = tier.monthlyPrice * 12;
  const yearlyPrice = tier.yearlyPrice || 0;
  return monthlyTotal - yearlyPrice;
}

export function getYearlySavingsPercent(tierId: TierKey): number {
  const tier = getTierById(tierId);
  if (!tier.monthlyPrice) return 0;
  const monthlyTotal = tier.monthlyPrice * 12;
  const savings = getYearlySavings(tierId);
  return Math.round((savings / monthlyTotal) * 100);
}

export function calculateOverageAmount(employeeCount: number, tierId: TierKey): number {
  const tier = getTierById(tierId);
  if (tier.maxEmployees === 999999) return 0; // Unlimited
  const overage = Math.max(0, employeeCount - tier.maxEmployees);
  return overage * BILLING.overages.perEmployee;
}

export function getCreditPackById(packId: string) {
  return Object.values(BILLING.creditPacks).find(pack => pack.id === packId);
}

export function getCreditCost(feature: keyof typeof BILLING.creditCosts): number {
  return BILLING.creditCosts[feature] || BILLING.creditCosts.ai_general;
}

export function getAllTiers() {
  return Object.values(BILLING.tiers);
}

export function getPaidTiers() {
  return Object.values(BILLING.tiers).filter(tier => tier.monthlyPrice > 0);
}

export function isEnterpriseUnlimited(tierId: TierKey): boolean {
  return tierId === "enterprise" && BILLING.tiers.enterprise.maxEmployees === 999999;
}

export function getTrialDaysRemaining(trialStartDate: Date): number {
  const trialDays = BILLING.tiers.free.trialDays;
  const now = new Date();
  const trialEnd = new Date(trialStartDate);
  trialEnd.setDate(trialEnd.getDate() + trialDays);
  const remaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, remaining);
}

export function shouldShowTrialWarning(trialStartDate: Date): boolean {
  const remaining = getTrialDaysRemaining(trialStartDate);
  return remaining <= BILLING.settings.trialWarningDays && remaining > 0;
}
