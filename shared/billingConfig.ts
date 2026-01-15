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
  // SUBSCRIPTION TIERS - PREMIUM VALUE-BASED PRICING (Jan 2026)
  // Trinity AI replaces 3-5 admin positions. Pricing reflects 40-50% of value.
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
      description: "AI scheduling for small security companies (5-25 guards)",
      monthlyPrice: 49900, // $499/month in cents
      yearlyPrice: 499000, // $4,990/year (17% discount)
      maxEmployees: 15,
      maxManagers: 2,
      monthlyCredits: 2000,
      adminReplacementValue: 10000, // Saves ~$10K/year in admin time
      overagePerEmployee: 1500, // $15/employee after 15
      features: [
        "Up to 15 employees included",
        "+$15/employee after 15",
        "Trinity AI scheduling",
        "GPS time tracking",
        "Basic compliance alerts",
        "Mobile app for guards",
        "Email/SMS notifications",
        "2,000 AI credits/month",
        "Email support (72hr response)",
      ],
      popular: false,
    },
    
    professional: {
      id: "professional",
      name: "Professional",
      description: "Full automation for growing security companies (25-150 guards)",
      monthlyPrice: 149900, // $1,499/month in cents
      yearlyPrice: 1439000, // $14,390/year (20% discount)
      maxEmployees: 50,
      maxManagers: 5,
      monthlyCredits: 10000,
      adminReplacementValue: 35000, // Saves ~$35K/year in admin time
      overagePerEmployee: 1200, // $12/employee after 50
      features: [
        "Up to 50 employees included",
        "+$12/employee after 50",
        "FULL Trinity AI automation",
        "Profit-first scheduling optimization",
        "Automated payroll processing",
        "Client billing automation",
        "QuickBooks integration",
        "Advanced compliance (SOX audit trails)",
        "Incident management",
        "Strategic business insights",
        "10,000 AI credits/month",
        "Priority support (24hr response)",
      ],
      popular: true,
    },
    
    enterprise: {
      id: "enterprise",
      name: "Enterprise",
      description: "Custom solutions for large security companies (150+ guards)",
      monthlyPrice: 0, // Contact sales (starts at $3,500/month)
      yearlyPrice: 0, // Contact sales
      maxEmployees: 999999, // Unlimited
      maxManagers: 999999, // Unlimited
      monthlyCredits: -1, // Unlimited
      adminReplacementValue: 250000, // Saves ~$250K+/year in admin time
      isContactSales: true,
      startsAt: 350000, // Starts at $3,500/month
      overagePerEmployee: 0, // Negotiated
      features: [
        "150+ employees",
        "Multi-location management",
        "Strategic profit optimization",
        "Custom integrations (ADP, Workday, etc.)",
        "White-label options",
        "API access",
        "Dedicated account manager",
        "Custom SLAs",
        "Unlimited AI credits",
        "On-demand support",
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
      pricePerMonth: 1500, // $15/employee/month in cents (Starter tier overage)
      description: "Additional employees beyond plan limit",
    },
    manager: {
      id: "seat_manager", 
      name: "Additional Manager",
      pricePerMonth: 2500, // $25/manager/month in cents
      description: "Managers use approvals, reports, advanced automation",
    },
  },

  // ==========================================================================
  // TIERED OVERAGE PRICING (Per-tier employee overage rates)
  // ==========================================================================
  overages: {
    starter: 1500, // $15/employee after 15 (Starter tier)
    professional: 1200, // $12/employee after 50 (Professional tier)
    enterprise: 0, // Negotiated (Enterprise tier)
    description: "Additional employees beyond plan limit - rate based on tier",
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
  // CREDIT COSTS PER FEATURE (Synced with creditManager.ts - Jan 2026)
  // 1 credit = $0.01 | Gemini 3 Pro vs Flash model usage with 4x margin
  // ==========================================================================
  creditCosts: {
    // AI Scheduling (Flash)
    ai_scheduling: 8,
    ai_schedule_optimization: 6,
    ai_shift_matching: 3,
    ai_open_shift_fill: 5,
    // AI Invoicing (Flash)
    ai_invoice_generation: 6,
    ai_invoice_review: 3,
    invoice_gap_analysis: 5,
    // AI Payroll (Flash)
    ai_payroll_processing: 8,
    ai_payroll_verification: 3,
    payroll_anomaly_insights: 5,
    // AI Communications (Flash)
    ai_chat_query: 3,
    ai_email_generation: 4,
    // AI Analytics (Pro - complex reasoning)
    ai_analytics_report: 15,
    ai_predictions: 12,
    // AI Migration (Pro Vision)
    ai_migration: 25,
    // QuickBooks (Flash)
    quickbooks_error_analysis: 5,
    // Financial Intelligence (Pro - complex P&L analysis)
    financial_pl_summary: 12,
    financial_insights: 15,
    financial_client_profitability: 10,
    financial_trend_analysis: 8,
    // Scheduling (Flash/Pro)
    schedule_optimization: 6,
    strategic_schedule_optimization: 20,
    // Domain/General (Flash)
    log_analysis: 3,
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
  // TRINITY ONE-TIME SETUP FEES (Business Ready-to-Work Configuration)
  // Trinity AI configures the entire platform for the business
  // ==========================================================================
  setupFees: {
    starter: {
      id: "setup_starter",
      name: "Trinity Starter Setup",
      price: 49900, // $499 one-time
      description: "Trinity configures basic scheduling, time tracking, and employee onboarding",
      includes: [
        "Organization setup & branding",
        "Employee roster import (up to 15)",
        "Basic schedule templates",
        "Time tracking configuration",
        "Mobile app setup for team",
        "1-hour training session",
      ],
      estimatedHours: 4,
    },
    professional: {
      id: "setup_professional",
      name: "Trinity Professional Setup",
      price: 149900, // $1,499 one-time
      description: "Full platform configuration with QuickBooks, payroll, and compliance",
      includes: [
        "Everything in Starter Setup",
        "QuickBooks integration & sync",
        "Payroll automation configuration",
        "Client billing setup",
        "Compliance rules for your state",
        "Custom schedule optimization",
        "Advanced reporting dashboards",
        "2-hour training session",
      ],
      estimatedHours: 12,
      popular: true,
    },
    enterprise: {
      id: "setup_enterprise",
      name: "Trinity Enterprise Setup",
      price: 0, // Custom pricing - contact sales
      isContactSales: true,
      startsAt: 499900, // Starts at $4,999
      description: "White-glove setup with custom integrations and dedicated support",
      includes: [
        "Everything in Professional Setup",
        "Multi-location configuration",
        "Custom integrations (ADP, Workday, etc.)",
        "Data migration from legacy systems",
        "White-label branding setup",
        "API configuration",
        "Dedicated onboarding specialist",
        "Team training sessions (up to 10 hours)",
        "30-day post-launch support",
      ],
      estimatedHours: 40,
    },
  },

  // ==========================================================================
  // CONTRACT PIPELINE - Premium Feature Quotas & Credits
  // Tier-based monthly quota with credit overage for extra contracts
  // ==========================================================================
  contractPipeline: {
    // Monthly contract quotas per tier (proposals + contracts count against quota)
    tierQuotas: {
      free: 0,           // No contract pipeline access
      starter: 10,       // 10 contracts/month included
      professional: 50,  // 50 contracts/month included
      enterprise: -1,    // Unlimited
    },
    // Credit cost per contract after quota exhausted
    overageCreditsPerContract: 25, // 25 credits = ~$0.25 per extra contract
    // Feature flags
    features: {
      templates: { free: false, starter: true, professional: true, enterprise: true },
      customTemplates: { free: false, starter: false, professional: true, enterprise: true },
      digitalSignatures: { free: false, starter: true, professional: true, enterprise: true },
      drawnSignatures: { free: false, starter: false, professional: true, enterprise: true },
      auditTrail: { free: false, starter: true, professional: true, enterprise: true },
      evidenceExport: { free: false, starter: false, professional: true, enterprise: true },
      amendments: { free: false, starter: true, professional: true, enterprise: true },
      attachments: { free: false, starter: true, professional: true, enterprise: true },
      trinityQueries: { free: false, starter: true, professional: true, enterprise: true },
      autoReminders: { free: false, starter: true, professional: true, enterprise: true },
    },
    // Document retention (days)
    retentionDays: {
      free: 0,
      starter: 365 * 3,     // 3 years
      professional: 365 * 7, // 7 years (default legal standard)
      enterprise: 365 * 10,  // 10 years
    },
    description: "Legal-grade contract management with digital signatures and audit trails",
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
    setupStarter: "STRIPE_SETUP_STARTER_PRICE_ID",
    setupProfessional: "STRIPE_SETUP_PROFESSIONAL_PRICE_ID",
    setupEnterprise: "STRIPE_SETUP_ENTERPRISE_PRICE_ID",
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
  const overageRate = BILLING.overages[tierId as keyof typeof BILLING.overages] || 0;
  if (typeof overageRate === 'number') {
    return overage * overageRate;
  }
  return 0;
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

export type SetupFeeKey = keyof typeof BILLING.setupFees;

export function getSetupFeeById(setupId: SetupFeeKey) {
  return BILLING.setupFees[setupId];
}

export function getAllSetupFees() {
  return Object.values(BILLING.setupFees);
}

export function getRecommendedSetupFee(tierId: TierKey): SetupFeeKey {
  const tierToSetup: Record<TierKey, SetupFeeKey> = {
    free: "starter",
    starter: "starter", 
    professional: "professional",
    enterprise: "enterprise",
  };
  return tierToSetup[tierId];
}

// ============================================================================
// CONTRACT PIPELINE HELPER FUNCTIONS
// ============================================================================

export function getContractPipelineQuota(tierId: TierKey): number {
  return BILLING.contractPipeline.tierQuotas[tierId] ?? 0;
}

export function hasContractPipelineAccess(tierId: TierKey): boolean {
  return getContractPipelineQuota(tierId) !== 0;
}

export function isContractPipelineUnlimited(tierId: TierKey): boolean {
  return getContractPipelineQuota(tierId) === -1;
}

export function getContractPipelineOverageCredits(): number {
  return BILLING.contractPipeline.overageCreditsPerContract;
}

export function canUseContractFeature(
  tierId: TierKey, 
  feature: keyof typeof BILLING.contractPipeline.features
): boolean {
  return BILLING.contractPipeline.features[feature]?.[tierId] ?? false;
}

export function getContractRetentionDays(tierId: TierKey): number {
  return BILLING.contractPipeline.retentionDays[tierId] ?? 0;
}
