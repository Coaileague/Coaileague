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
  // Middleware pricing: Fair value for automation layer connecting to HRIS/accounting
  // Users already pay for QuickBooks, Gusto, etc. - we provide the AI automation
  // ==========================================================================
  tiers: {
    free: {
      id: "free",
      name: "Free Trial",
      description: "14-day trial to experience Trinity AI automation",
      monthlyPrice: 0,
      yearlyPrice: 0,
      maxEmployees: 5,
      maxManagers: 1,
      monthlyCredits: 500,
      trialDays: 14,
      adminReplacementValue: 0,
      features: [
        "Up to 5 employees, 1 manager",
        "Basic scheduling automation",
        "Time tracking",
        "500 AI credits for trial",
        "Email support",
      ],
      limitations: [
        "Limited to 5 employees",
        "No payroll automation",
        "No client billing",
        "No advanced analytics",
      ],
    },
    
    starter: {
      id: "starter",
      name: "Starter",
      description: "Perfect for small security teams (25-50 guards)",
      monthlyPrice: 29900, // $299/month in cents
      yearlyPrice: 299000, // $2,990/year (2 months free)
      maxEmployees: 25,
      maxManagers: 2,
      monthlyCredits: 5000,
      adminReplacementValue: 35000, // Saves ~$35K/year in admin time
      overagePerEmployee: 800, // $8/employee after 25
      features: [
        "Up to 25 employees included",
        "+$8/employee after 25",
        "2 managers included",
        "Trinity AI Scheduling",
        "Time tracking & approvals",
        "Basic compliance alerts",
        "5,000 AI credits/month",
        "Email support (48hr response)",
      ],
      popular: false,
    },
    
    professional: {
      id: "professional",
      name: "Professional",
      description: "Full automation for growing security companies (50-150 guards)",
      monthlyPrice: 79900, // $799/month in cents
      yearlyPrice: 799000, // $7,990/year (2 months free)
      maxEmployees: 50,
      maxManagers: 5,
      monthlyCredits: 25000,
      adminReplacementValue: 90000, // Saves ~$90K/year in admin time
      overagePerEmployee: 600, // $6/employee after 50
      features: [
        "Up to 50 employees included",
        "+$6/employee after 50",
        "5 managers included",
        "Everything in Starter",
        "AI Payroll automation",
        "Client billing & invoicing",
        "50-state compliance engine",
        "Unlimited HRIS/accounting integrations",
        "25,000 AI credits/month",
        "Priority support (24hr response)",
        "Advanced analytics dashboard",
      ],
      popular: true,
    },
    
    enterprise: {
      id: "enterprise",
      name: "Enterprise",
      description: "Custom solutions for large security companies (150+ guards)",
      monthlyPrice: 0, // Contact sales
      yearlyPrice: 0, // Contact sales
      maxEmployees: 999999, // Unlimited
      maxManagers: 999999, // Unlimited
      monthlyCredits: 100000,
      adminReplacementValue: 250000, // Saves ~$250K+/year in admin time
      isContactSales: true,
      overagePerEmployee: 400, // $4/employee at scale
      features: [
        "100+ employees at scale pricing",
        "+$4/employee (volume discount)",
        "Unlimited managers",
        "Everything in Professional",
        "Dedicated account manager",
        "Custom integrations",
        "SSO & advanced security",
        "SLA guarantees",
        "100,000+ AI credits/month",
        "Priority support (4hr response)",
      ],
      popular: false,
    },
  },

  // ==========================================================================
  // PER-SEAT ADD-ON PRICING (Beyond included users)
  // ==========================================================================
  seatPricing: {
    employee: {
      id: "seat_employee",
      name: "Additional Employee",
      pricePerMonth: 1800, // $18/employee/month in cents
      description: "Each employee uses scheduling, time tracking, compliance",
    },
    manager: {
      id: "seat_manager", 
      name: "Additional Manager",
      pricePerMonth: 3900, // $39/manager/month in cents
      description: "Managers use approvals, reports, advanced automation",
    },
  },

  // ==========================================================================
  // LEGACY OVERAGE PRICING (Deprecated - use seatPricing)
  // ==========================================================================
  overages: {
    perEmployee: 1800, // $18/employee/month in cents (aligned with seatPricing)
    description: "Additional employees beyond plan limit",
    billingCycle: "monthly",
  },

  // ==========================================================================
  // TRINITY AI CREDIT BUNDLES (Metered billing for AI usage)
  // Credits cover: scheduling optimization, invoice generation, payroll processing, etc.
  // ==========================================================================
  creditPacks: {
    starter: {
      id: "credits_5000",
      name: "5,000 Credits",
      credits: 5000,
      price: 4900, // $49 in cents
      pricePerCredit: 0.98, // cents per credit
      popular: false,
      description: "Light automation use",
    },
    standard: {
      id: "credits_25000",
      name: "25,000 Credits",
      credits: 25000,
      price: 19900, // $199 in cents
      pricePerCredit: 0.80,
      popular: true,
      description: "Standard business operations",
    },
    professional: {
      id: "credits_100000",
      name: "100,000 Credits",
      credits: 100000,
      price: 64900, // $649 in cents
      pricePerCredit: 0.65,
      popular: false,
      description: "Heavy AI usage for larger teams",
    },
    enterprise: {
      id: "credits_500000",
      name: "500,000 Credits",
      credits: 500000,
      price: 249900, // $2,499 in cents
      pricePerCredit: 0.50,
      popular: false,
      description: "Enterprise-scale automation",
    },
  },

  // ==========================================================================
  // AUTO TOP-UP SETTINGS (Prevents service interruption)
  // ==========================================================================
  autoTopUp: {
    thresholdPercent: 20, // Trigger when 20% credits remaining
    defaultPackId: "credits_25000",
    enabled: true,
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
