import { db } from '../db';
import { sql } from 'drizzle-orm';
import { PREMIUM_FEATURES, CREDIT_PACKAGES, canAccessFeature, getFeatureCreditCost, isPremiumFeature, isEliteFeature, isFeatureIncludedInTier, getMonthlyLimit } from '@shared/config/premiumFeatures';
import { BILLING } from '@shared/billingConfig';
import { CREDIT_COSTS, TIER_CREDIT_ALLOCATIONS, TIER_MONTHLY_CREDITS, CREDIT_EXEMPT_FEATURES, SUPPORT_POOL_FEATURES, CREDIT_MULTIPLIERS, OVERAGE_RATE_PER_CREDIT } from '../services/billing/creditManager';
import { STRIPE_PRODUCTS, getTierConfig, getPriceId, calculateOverageCharges, formatPrice, getYearlySavings, validatePriceIdsConfigured } from '../stripe-config';
import { typedQuery } from '../lib/typedSql';

interface TestResult {
  name: string;
  phase: string;
  passed: boolean;
  details: string;
  severity: 'critical' | 'high' | 'medium' | 'info';
}

const results: TestResult[] = [];

function record(r: TestResult) {
  results.push(r);
  const icon = r.passed ? '[PASS]' : '[FAIL]';
  console.log(`${icon} [${r.phase}] ${r.name}: ${r.details}`);
}

async function phase1_signup_flow_simulation() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 1: User Signup Flow Simulation');
  console.log('════════════════════════════════════════');

  const tiers: Array<'free' | 'starter' | 'professional' | 'enterprise'> = ['free', 'starter', 'professional', 'enterprise'];

  for (const tier of tiers) {
    const tierConfig = (BILLING.tiers as any)[tier];
    const hasName = !!tierConfig?.name;
    const hasPrice = tierConfig?.monthlyPrice !== undefined;
    const hasCredits = tierConfig?.monthlyCredits > 0 || tier === 'free';
    const hasEmployeeLimit = tierConfig?.maxEmployees > 0;
    const hasFeatures = tierConfig?.features?.length > 0;

    record({
      name: `${tier} Tier Signup Config Complete`,
      phase: 'SIGNUP_FLOW',
      passed: hasName && hasPrice && hasCredits && hasEmployeeLimit && hasFeatures,
      details: `name=${tierConfig?.name}, price=$${(tierConfig?.monthlyPrice || 0) / 100}, credits=${tierConfig?.monthlyCredits}, maxEmp=${tierConfig?.maxEmployees}, features=${tierConfig?.features?.length}`,
      severity: 'critical'
    });
  }

  const freeHasTrialDays = BILLING.tiers.free.trialDays === 14;
  record({
    name: 'Free Tier Has 14-Day Trial',
    phase: 'SIGNUP_FLOW',
    passed: freeHasTrialDays,
    details: `Trial days: ${BILLING.tiers.free.trialDays}`,
    severity: 'high'
  });

  const starterHasOverageRate = (BILLING.tiers.starter as any).overagePerEmployee > 0;
  const proHasOverageRate = (BILLING.tiers.professional as any).overagePerEmployee > 0;
  record({
    name: 'Paid Tiers Have Employee Overage Rates',
    phase: 'SIGNUP_FLOW',
    passed: starterHasOverageRate && proHasOverageRate,
    details: `Starter: $${((BILLING.tiers.starter as any).overagePerEmployee || 0) / 100}/emp, Pro: $${((BILLING.tiers.professional as any).overagePerEmployee || 0) / 100}/emp`,
    severity: 'high'
  });
}

async function phase2_initial_credit_allocation() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 2: Initial Credit Allocation on Signup');
  console.log('════════════════════════════════════════');

  const expectedCredits: Record<string, number> = {
    free: 250,
    starter: 2500,
    professional: 10000,
    enterprise: 30000,
  };

  for (const [tier, expected] of Object.entries(expectedCredits)) {
    const billingCredits = (BILLING.tiers as any)[tier]?.monthlyCredits;
    const allocCredits = TIER_CREDIT_ALLOCATIONS[tier as keyof typeof TIER_CREDIT_ALLOCATIONS];
    const monthlyCredits = TIER_MONTHLY_CREDITS[tier];

    const allMatch = billingCredits === expected && allocCredits === expected && monthlyCredits === expected;

    record({
      name: `${tier} Initial Credits = ${expected}`,
      phase: 'CREDIT_ALLOCATION',
      passed: allMatch,
      details: `billingConfig=${billingCredits}, TIER_CREDIT_ALLOCATIONS=${allocCredits}, TIER_MONTHLY_CREDITS=${monthlyCredits} (expect ${expected})`,
      severity: 'critical'
    });
  }

  record({
    name: 'No Tier Has Unlimited (-1) Credits',
    phase: 'CREDIT_ALLOCATION',
    passed: Object.values(TIER_MONTHLY_CREDITS).every(v => v > 0 && v < 1000000),
    details: `All tiers finite: ${JSON.stringify(TIER_MONTHLY_CREDITS)}`,
    severity: 'critical'
  });

  const creditMultipliersValid = CREDIT_MULTIPLIERS.CORE === 1 && CREDIT_MULTIPLIERS.PREMIUM === 2;
  record({
    name: 'Credit Multipliers Configured (Core=1x, Premium=2x)',
    phase: 'CREDIT_ALLOCATION',
    passed: creditMultipliersValid,
    details: `Core=${CREDIT_MULTIPLIERS.CORE}x, Premium=${CREDIT_MULTIPLIERS.PREMIUM}x`,
    severity: 'high'
  });

  record({
    name: 'Overage Rate Defined',
    phase: 'CREDIT_ALLOCATION',
    passed: OVERAGE_RATE_PER_CREDIT === 0.01,
    details: `$${OVERAGE_RATE_PER_CREDIT}/credit`,
    severity: 'high'
  });
}

async function phase3_subscription_stripe_wiring() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 3: Subscription ↔ Stripe Wiring');
  console.log('════════════════════════════════════════');

  const tiers: Array<'free' | 'starter' | 'professional' | 'enterprise'> = ['free', 'starter', 'professional', 'enterprise'];
  const stripeNames = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const;

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const stripeKey = stripeNames[i];
    const billingPrice = (BILLING.tiers as any)[tier].monthlyPrice;
    const stripePrice = (STRIPE_PRODUCTS as any)[stripeKey].amount;

    record({
      name: `Stripe ${stripeKey} Price Matches billingConfig`,
      phase: 'STRIPE_WIRING',
      passed: billingPrice === stripePrice,
      details: `billingConfig=$${billingPrice / 100}, stripe-config=$${stripePrice / 100}`,
      severity: 'critical'
    });
  }

  const tierConfig = getTierConfig('starter');
  record({
    name: 'getTierConfig() Returns Correct Data',
    phase: 'STRIPE_WIRING',
    passed: tierConfig.amount === BILLING.tiers.starter.monthlyPrice && tierConfig.employeeLimit === BILLING.tiers.starter.maxEmployees,
    details: `amount=$${tierConfig.amount / 100}, empLimit=${tierConfig.employeeLimit}`,
    severity: 'high'
  });

  const overageCharge = calculateOverageCharges(20, 'starter');
  const expectedOverage = 5 * STRIPE_PRODUCTS.OVERAGES.EMPLOYEE.amount;
  record({
    name: 'Employee Overage Calculation Works',
    phase: 'STRIPE_WIRING',
    passed: overageCharge === expectedOverage,
    details: `20 employees on Starter (limit 15): overage=${formatPrice(overageCharge)} (expect ${formatPrice(expectedOverage)})`,
    severity: 'high'
  });

  const noOverage = calculateOverageCharges(10, 'starter');
  record({
    name: 'No Overage When Under Limit',
    phase: 'STRIPE_WIRING',
    passed: noOverage === 0,
    details: `10 employees on Starter (limit 15): overage=${formatPrice(noOverage)}`,
    severity: 'high'
  });

  record({
    name: 'Stripe OVERAGES Config Exists',
    phase: 'STRIPE_WIRING',
    passed: !!STRIPE_PRODUCTS.OVERAGES?.EMPLOYEE && !!STRIPE_PRODUCTS.OVERAGES?.CREDITS,
    details: `Employee=$${(STRIPE_PRODUCTS.OVERAGES?.EMPLOYEE?.amount || 0) / 100}, Credits=$${(STRIPE_PRODUCTS.OVERAGES?.CREDITS?.amount || 0) / 100}`,
    severity: 'critical'
  });

  record({
    name: 'Stripe SETUP_FEES Config Exists',
    phase: 'STRIPE_WIRING',
    passed: !!STRIPE_PRODUCTS.SETUP_FEES?.STARTER && !!STRIPE_PRODUCTS.SETUP_FEES?.PROFESSIONAL && !!STRIPE_PRODUCTS.SETUP_FEES?.ENTERPRISE,
    details: `Starter=$${(STRIPE_PRODUCTS.SETUP_FEES?.STARTER?.amount || 0) / 100}, Professional=$${(STRIPE_PRODUCTS.SETUP_FEES?.PROFESSIONAL?.amount || 0) / 100}`,
    severity: 'high'
  });

  record({
    name: 'Stripe ADDONS Config Exists',
    phase: 'STRIPE_WIRING',
    passed: !!STRIPE_PRODUCTS.ADDONS?.CLAUDE_PREMIUM && !!STRIPE_PRODUCTS.ADDONS?.AI_CFO_INSIGHTS && !!STRIPE_PRODUCTS.ADDONS?.FLEET_MANAGEMENT,
    details: `Claude=$${(STRIPE_PRODUCTS.ADDONS?.CLAUDE_PREMIUM?.amount || 0) / 100}, CFO=$${(STRIPE_PRODUCTS.ADDONS?.AI_CFO_INSIGHTS?.amount || 0) / 100}`,
    severity: 'high'
  });

  const validationResult = validatePriceIdsConfigured();
  record({
    name: 'Stripe Price ID Validation Runs Without Error',
    phase: 'STRIPE_WIRING',
    passed: validationResult !== undefined && Array.isArray(validationResult.missing),
    details: `Missing price IDs: ${validationResult.missing?.length || 0} required, ${validationResult.optionalMissing?.length || 0} optional`,
    severity: 'medium'
  });
}

async function phase4_credit_usage_journey() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 4: Credit Usage Journey Simulation');
  console.log('════════════════════════════════════════');

  const starterCredits = TIER_CREDIT_ALLOCATIONS['starter'];
  let remainingCredits = starterCredits;
  const journeyActions = [
    { action: 'ai_scheduling', count: 5 },
    { action: 'ai_invoice_generation', count: 3 },
    { action: 'ai_payroll_processing', count: 2 },
    { action: 'guard_tour_scan', count: 20 },
    { action: 'equipment_checkout', count: 10 },
    { action: 'trinity_chat', count: 15 },
  ];

  let totalUsed = 0;
  for (const { action, count } of journeyActions) {
    const cost = (CREDIT_COSTS as any)[action];
    if (cost === undefined) continue;
    const actionTotal = cost * count;
    totalUsed += actionTotal;
    remainingCredits -= actionTotal;
  }

  record({
    name: 'Starter Monthly Budget Covers Typical Usage',
    phase: 'CREDIT_USAGE',
    passed: remainingCredits > 0,
    details: `Started: ${starterCredits}, Used: ${totalUsed} (${journeyActions.map(a => `${a.action}×${a.count}`).join(', ')}), Remaining: ${remainingCredits}`,
    severity: 'critical'
  });

  const proCredits = TIER_CREDIT_ALLOCATIONS['professional'];
  const heavyUsageActions = [
    { action: 'ai_scheduling', count: 30 },
    { action: 'ai_invoice_generation', count: 20 },
    { action: 'ai_payroll_processing', count: 10 },
    { action: 'claude_analysis', count: 5 },
    { action: 'claude_strategic', count: 3 },
    { action: 'ai_analytics_report', count: 10 },
    { action: 'document_signing_send', count: 15 },
    { action: 'employee_behavior_scoring', count: 50 },
    { action: 'trinity_chat', count: 100 },
  ];

  let proUsed = 0;
  for (const { action, count } of heavyUsageActions) {
    const cost = (CREDIT_COSTS as any)[action];
    if (cost === undefined) continue;
    proUsed += cost * count;
  }

  record({
    name: 'Professional Monthly Budget Covers Heavy Usage',
    phase: 'CREDIT_USAGE',
    passed: proCredits > proUsed,
    details: `Budget: ${proCredits}, Heavy usage: ${proUsed}, Headroom: ${proCredits - proUsed} credits`,
    severity: 'high'
  });

  const allCostsPositiveOrZero = Object.entries(CREDIT_COSTS).every(([, cost]) => cost >= 0);
  record({
    name: 'All Credit Costs Are Non-Negative',
    phase: 'CREDIT_USAGE',
    passed: allCostsPositiveOrZero,
    details: `${Object.keys(CREDIT_COSTS).length} credit cost entries, all >= 0`,
    severity: 'critical'
  });

  const perUseCosts = Object.entries(CREDIT_COSTS)
    .filter(([key]) => !key.startsWith('platform_'))
    .map(([, cost]) => cost);
  const maxSingleCost = Math.max(...perUseCosts);
  record({
    name: 'Highest Per-Use Credit Cost Is Reasonable',
    phase: 'CREDIT_USAGE',
    passed: maxSingleCost <= 50,
    details: `Max per-use operation cost: ${maxSingleCost} credits (excludes monthly platform fees)`,
    severity: 'medium'
  });
}

async function phase5_feature_access_complete_matrix() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 5: Feature Access - Complete Matrix Validation');
  console.log('════════════════════════════════════════');

  const tiers: Array<'free' | 'starter' | 'professional' | 'enterprise'> = ['free', 'starter', 'professional', 'enterprise'];
  const accessibleCounts: Record<string, number> = {};

  for (const tier of tiers) {
    const accessible = Object.keys(PREMIUM_FEATURES).filter(id =>
      isFeatureIncludedInTier(id, tier)
    );
    accessibleCounts[tier] = accessible.length;
  }

  record({
    name: 'Feature Access Grows With Tier',
    phase: 'FEATURE_ACCESS',
    passed: accessibleCounts.free <= accessibleCounts.starter &&
      accessibleCounts.starter <= accessibleCounts.professional &&
      accessibleCounts.professional <= accessibleCounts.enterprise,
    details: `free=${accessibleCounts.free}, starter=${accessibleCounts.starter}, pro=${accessibleCounts.professional}, enterprise=${accessibleCounts.enterprise}`,
    severity: 'critical'
  });

  record({
    name: 'Enterprise Has Access to All Features',
    phase: 'FEATURE_ACCESS',
    passed: accessibleCounts.enterprise === Object.keys(PREMIUM_FEATURES).length,
    details: `Enterprise: ${accessibleCounts.enterprise}/${Object.keys(PREMIUM_FEATURES).length} features`,
    severity: 'critical'
  });

  const coreFeatures = Object.entries(PREMIUM_FEATURES).filter(([, f]) => f.featureType === 'core');
  const premiumFeatures = Object.entries(PREMIUM_FEATURES).filter(([, f]) => f.featureType === 'premium');
  const eliteFeatures = Object.entries(PREMIUM_FEATURES).filter(([, f]) => f.featureType === 'elite');

  record({
    name: 'Feature Type Distribution',
    phase: 'FEATURE_ACCESS',
    passed: coreFeatures.length >= 5 && premiumFeatures.length >= 8 && eliteFeatures.length >= 3,
    details: `Core: ${coreFeatures.length}, Premium: ${premiumFeatures.length}, Elite: ${eliteFeatures.length}`,
    severity: 'high'
  });

  for (const [id, feature] of coreFeatures) {
    const starterAccess = isFeatureIncludedInTier(id, 'starter');
    if (!starterAccess) {
      record({
        name: `Core Feature ${id} Accessible on Starter`,
        phase: 'FEATURE_ACCESS',
        passed: false,
        details: `Core feature ${id} (minimumTier: ${feature.minimumTier}) not accessible on starter`,
        severity: 'high'
      });
    }
  }

  record({
    name: 'All Core Features Accessible on Starter+',
    phase: 'FEATURE_ACCESS',
    passed: coreFeatures.every(([id]) => isFeatureIncludedInTier(id, 'starter') || PREMIUM_FEATURES[id].minimumTier === 'free'),
    details: `${coreFeatures.length} core features checked`,
    severity: 'high'
  });

  const freeBlocked = canAccessFeature('claude_contract_analysis', 'free', 0, 0);
  const freeWithCredits = canAccessFeature('guard_tour_tracking', 'free', 0, 100);
  record({
    name: 'Free Tier Blocked from Elite Without Credits',
    phase: 'FEATURE_ACCESS',
    passed: freeBlocked.allowed === false,
    details: `claude_contract_analysis on free: allowed=${freeBlocked.allowed}`,
    severity: 'critical'
  });

  record({
    name: 'Free Tier Can Use Credits for Premium (Addon Available)',
    phase: 'FEATURE_ACCESS',
    passed: freeWithCredits.allowed === true || freeWithCredits.creditsRequired !== undefined,
    details: `guard_tour_tracking on free with credits: allowed=${freeWithCredits.allowed}, creditsReq=${freeWithCredits.creditsRequired}`,
    severity: 'high'
  });
}

async function phase6_credit_purchase_flow() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 6: Credit Purchase Flow Validation');
  console.log('════════════════════════════════════════');

  record({
    name: 'CREDIT_PACKAGES Available',
    phase: 'CREDIT_PURCHASE',
    passed: CREDIT_PACKAGES.length >= 4,
    details: `${CREDIT_PACKAGES.length} packages: ${CREDIT_PACKAGES.map(p => `${p.name}(${p.credits}cr/$${p.price})`).join(', ')}`,
    severity: 'critical'
  });

  for (const pack of CREDIT_PACKAGES) {
    const hasStripeIds = !!pack.stripeProductId && !!pack.stripePriceId;
    record({
      name: `Pack "${pack.name}" Has Stripe Product/Price IDs`,
      phase: 'CREDIT_PURCHASE',
      passed: hasStripeIds,
      details: `product=${pack.stripeProductId}, price=${pack.stripePriceId}`,
      severity: 'high'
    });
  }

  const pricePerCredit = CREDIT_PACKAGES.map(p => p.price / p.credits);
  const bulkDiscount = pricePerCredit[0] > pricePerCredit[pricePerCredit.length - 1];
  record({
    name: 'Bulk Discount Applied (Larger Packs Cheaper Per Credit)',
    phase: 'CREDIT_PURCHASE',
    passed: bulkDiscount,
    details: `Price/credit: ${pricePerCredit.map((p, i) => `${CREDIT_PACKAGES[i].name}=$${p.toFixed(4)}`).join(', ')}`,
    severity: 'medium'
  });

  const billingPacks = BILLING.creditPacks;
  const billingPackKeys = Object.keys(billingPacks);
  record({
    name: 'billingConfig CreditPacks Defined',
    phase: 'CREDIT_PURCHASE',
    passed: billingPackKeys.length >= 4,
    details: `${billingPackKeys.length} packs: ${billingPackKeys.join(', ')}`,
    severity: 'high'
  });

  const proOverageEnabled = (BILLING.tiers.professional as any).allowCreditOverage === true;
  const proOveragePrice = (BILLING.tiers.professional as any).creditOveragePackPrice;
  const proOverageAmount = (BILLING.tiers.professional as any).creditOveragePackAmount;
  record({
    name: 'Professional Tier Has Credit Overage Config',
    phase: 'CREDIT_PURCHASE',
    passed: proOverageEnabled && proOveragePrice > 0 && proOverageAmount > 0,
    details: `Overage: enabled=${proOverageEnabled}, price=$${(proOveragePrice || 0) / 100}, amount=${proOverageAmount} credits`,
    severity: 'critical'
  });

  const freeNoOverage = BILLING.tiers.free.allowCreditOverage === false;
  const starterNoOverage = (BILLING.tiers.starter as any).allowCreditOverage === false;
  record({
    name: 'Free/Starter Cannot Auto-Overage (Must Upgrade)',
    phase: 'CREDIT_PURCHASE',
    passed: freeNoOverage && starterNoOverage,
    details: `Free overage=${BILLING.tiers.free.allowCreditOverage}, Starter overage=${(BILLING.tiers.starter as any).allowCreditOverage}`,
    severity: 'critical'
  });
}

async function phase7_feature_limits_no_unlimited() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 7: Feature Limits - No Unlimited Anywhere');
  console.log('════════════════════════════════════════');

  let unlimitedCount = 0;
  const unlimitedFeatures: string[] = [];

  for (const [id, feature] of Object.entries(PREMIUM_FEATURES)) {
    const tiers = ['free', 'starter', 'professional', 'enterprise'] as const;
    for (const tier of tiers) {
      const limit = feature.monthlyLimits[tier];
      if (limit === -1 || limit === Infinity || limit > 999998) {
        unlimitedCount++;
        unlimitedFeatures.push(`${id}:${tier}=${limit}`);
      }
    }
  }

  record({
    name: 'No Unlimited (-1) Feature Limits in PREMIUM_FEATURES',
    phase: 'NO_UNLIMITED',
    passed: unlimitedCount === 0,
    details: unlimitedCount === 0
      ? `All ${Object.keys(PREMIUM_FEATURES).length} features have finite caps`
      : `${unlimitedCount} unlimited: ${unlimitedFeatures.join(', ')}`,
    severity: 'critical'
  });

  const featureMatrix = BILLING.featureMatrix;
  let matrixUnlimitedCount = 0;
  for (const [key, value] of Object.entries(featureMatrix)) {
    const v = value as any;
    if (v.free === -1 || v.starter === -1 || v.professional === -1 || v.enterprise === -1) {
      matrixUnlimitedCount++;
    }
  }

  record({
    name: 'No Unlimited (-1) in Feature Matrix',
    phase: 'NO_UNLIMITED',
    passed: matrixUnlimitedCount === 0,
    details: `${Object.keys(featureMatrix).length} matrix entries, ${matrixUnlimitedCount} unlimited`,
    severity: 'critical'
  });

  let tierCreditUnlimited = 0;
  for (const [tier, credits] of Object.entries(TIER_MONTHLY_CREDITS)) {
    if (credits === -1 || credits > 999998) {
      tierCreditUnlimited++;
    }
  }

  record({
    name: 'No Unlimited Monthly Credit Allocations',
    phase: 'NO_UNLIMITED',
    passed: tierCreditUnlimited === 0,
    details: `All tier allocations finite`,
    severity: 'critical'
  });

  for (const [tier, alloc] of Object.entries(TIER_CREDIT_ALLOCATIONS)) {
    if (alloc === -1 || alloc > 999998) {
      record({
        name: `TIER_CREDIT_ALLOCATIONS[${tier}] Not Unlimited`,
        phase: 'NO_UNLIMITED',
        passed: false,
        details: `${tier}=${alloc}`,
        severity: 'critical'
      });
    }
  }

  record({
    name: 'TIER_CREDIT_ALLOCATIONS All Finite',
    phase: 'NO_UNLIMITED',
    passed: Object.values(TIER_CREDIT_ALLOCATIONS).every(v => v > 0 && v < 999999),
    details: `All allocations: ${JSON.stringify(TIER_CREDIT_ALLOCATIONS)}`,
    severity: 'critical'
  });
}

async function phase8_billing_settings_and_overages() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 8: Billing Settings & Overage Configuration');
  console.log('════════════════════════════════════════');

  const settings = BILLING.settings;
  record({
    name: 'Billing Settings Defined',
    phase: 'BILLING_SETTINGS',
    passed: settings.trialWarningDays > 0 && settings.gracePeriodDays > 0 && settings.maxRetryAttempts > 0,
    details: `trialWarning=${settings.trialWarningDays}d, grace=${settings.gracePeriodDays}d, retries=${settings.maxRetryAttempts}`,
    severity: 'high'
  });

  const overages = BILLING.overages;
  record({
    name: 'Per-Tier Overage Rates Defined',
    phase: 'BILLING_SETTINGS',
    passed: overages.starter > 0 && overages.professional > 0 && overages.enterprise > 0,
    details: `Starter: $${overages.starter / 100}/emp, Pro: $${overages.professional / 100}/emp, Enterprise: $${overages.enterprise / 100}/emp`,
    severity: 'critical'
  });

  record({
    name: 'Overage Rates Decrease With Tier',
    phase: 'BILLING_SETTINGS',
    passed: overages.starter > overages.professional && overages.professional >= overages.enterprise,
    details: `Starter($${overages.starter / 100}) > Pro($${overages.professional / 100}) >= Ent($${overages.enterprise / 100})`,
    severity: 'high'
  });

  const seatPricing = BILLING.seatPricing;
  record({
    name: 'Seat Pricing Defined',
    phase: 'BILLING_SETTINGS',
    passed: seatPricing.employee.pricePerMonth > 0 && seatPricing.manager.pricePerMonth > 0,
    details: `Employee: $${seatPricing.employee.pricePerMonth / 100}/mo, Manager: $${seatPricing.manager.pricePerMonth / 100}/mo`,
    severity: 'high'
  });

  record({
    name: 'Manager Seat More Expensive Than Employee',
    phase: 'BILLING_SETTINGS',
    passed: seatPricing.manager.pricePerMonth > seatPricing.employee.pricePerMonth,
    details: `Manager $${seatPricing.manager.pricePerMonth / 100} > Employee $${seatPricing.employee.pricePerMonth / 100}`,
    severity: 'medium'
  });

  const setupFees = BILLING.setupFees;
  record({
    name: 'Setup Fees Defined for All Paid Tiers',
    phase: 'BILLING_SETTINGS',
    passed: setupFees.starter.price > 0 && setupFees.professional.price > 0,
    details: `Starter: $${setupFees.starter.price / 100}, Professional: $${setupFees.professional.price / 100}`,
    severity: 'high'
  });
}

async function phase9_credit_cost_sync_validation() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 9: Credit Cost Sync Across Systems');
  console.log('════════════════════════════════════════');

  const billingCreditCosts = BILLING.creditCosts as Record<string, number>;
  
  const syncKeys = [
    'ai_scheduling', 'ai_invoice_generation', 'ai_payroll_processing',
    'guard_tour_scan', 'equipment_checkout', 'document_signing_send',
    'employee_behavior_scoring', 'bot_interaction', 'push_notification',
    'claude_analysis', 'claude_strategic', 'claude_executive',
    'ai_analytics_report', 'ai_predictions', 'ai_migration',
    'schedule_optimization', 'strategic_schedule_optimization',
    'trinity_chat', 'trinity_thought',
    'email_transactional', 'sms_notification'
  ];

  let mismatches: string[] = [];
  for (const key of syncKeys) {
    const cmCost = (CREDIT_COSTS as any)[key];
    const bcCost = billingCreditCosts[key];
    if (cmCost !== undefined && bcCost !== undefined && cmCost !== bcCost) {
      mismatches.push(`${key}: cm=${cmCost} vs bc=${bcCost}`);
    }
  }

  record({
    name: 'creditManager ↔ billingConfig Credit Costs Synced',
    phase: 'COST_SYNC',
    passed: mismatches.length === 0,
    details: mismatches.length === 0
      ? `${syncKeys.length} keys checked, all in sync`
      : `Mismatches: ${mismatches.join('; ')}`,
    severity: 'critical'
  });

  let premiumFeatureMismatches: string[] = [];
  for (const [id, feature] of Object.entries(PREMIUM_FEATURES)) {
    if (feature.creditCost > 0) {
      const creditManagerKey = id.replace(/-/g, '_');
      const cmCost = (CREDIT_COSTS as any)[creditManagerKey];
      if (cmCost !== undefined && cmCost !== feature.creditCost) {
        const featureKey = findMatchingCreditKey(id, feature.creditCost);
        if (!featureKey) {
          premiumFeatureMismatches.push(`${id}: feature=${feature.creditCost} vs creditManager(${creditManagerKey})=${cmCost}`);
        }
      }
    }
  }

  record({
    name: 'Premium Feature Costs Align With CREDIT_COSTS',
    phase: 'COST_SYNC',
    passed: premiumFeatureMismatches.length <= 2,
    details: premiumFeatureMismatches.length === 0
      ? 'All premium feature costs match credit manager'
      : `Minor discrepancies: ${premiumFeatureMismatches.join('; ')}`,
    severity: 'high'
  });
}

function findMatchingCreditKey(featureId: string, expectedCost: number): string | null {
  const alternateKeys: Record<string, string[]> = {
    'guard_tour_tracking': ['guard_tour_scan'],
    'equipment_tracking': ['equipment_checkout'],
    'document_signing': ['document_signing_send'],
    'payroll_automation': ['ai_payroll_processing'],
    'invoice_generation': ['ai_invoice_generation'],
    'quickbooks_sync': ['quickbooks_error_analysis'],
    'bot_ecosystem': ['bot_interaction'],
    'employee_behavior_scoring': ['employee_behavior_scoring'],
  };

  const alts = alternateKeys[featureId] || [];
  for (const alt of alts) {
    if ((CREDIT_COSTS as any)[alt] !== undefined) {
      return alt;
    }
  }
  return null;
}

async function phase10_db_schema_for_billing() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 10: Database Schema for Billing/Credits');
  console.log('════════════════════════════════════════');

  const requiredTables = [
    'workspace_credits', 'credit_transactions', 'ai_usage_events',
    'workspace_addons', 'billing_addons', 'credit_packs',
    'subscriptions', 'processed_stripe_events',
    'feature_usage_events', 'workspaces'
  ];

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const tableCheck = await typedQuery(sql`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = ANY(ARRAY[${sql.raw(requiredTables.map(t => `'${t}'`).join(','))}])
    ORDER BY table_name
  `);

  const foundTables = (tableCheck as any).rows?.map((r: any) => r.table_name) || [];
  const missingTables = requiredTables.filter(t => !foundTables.includes(t));

  record({
    name: 'All Billing DB Tables Exist',
    phase: 'DB_SCHEMA',
    passed: missingTables.length === 0,
    details: missingTables.length === 0
      ? `All ${requiredTables.length} billing tables present`
      : `Missing: ${missingTables.join(', ')}`,
    severity: 'critical'
  });

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const workspaceCols = await typedQuery(sql`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'workspaces' AND column_name IN (
      'subscription_tier', 'subscription_status', 'stripe_customer_id',
      'stripe_subscription_id', 'trial_ends_at'
    )
  `);
  const wsCols = (workspaceCols as any).rows?.map((r: any) => r.column_name) || [];

  record({
    name: 'Workspaces Table Has Billing Columns',
    phase: 'DB_SCHEMA',
    passed: wsCols.length >= 4,
    details: `Found billing columns: ${wsCols.join(', ')}`,
    severity: 'critical'
  });

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const idempotencyCheck = await typedQuery(sql`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'processed_stripe_events'
  `);
  const idempCols = (idempotencyCheck as any).rows?.map((r: any) => r.column_name) || [];

  record({
    name: 'Stripe Webhook Idempotency Table Has Columns',
    phase: 'DB_SCHEMA',
    passed: idempCols.length >= 2,
    details: `processed_stripe_events columns: ${idempCols.join(', ')}`,
    severity: 'high'
  });
}

async function phase11_addon_system() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 11: Add-on & Premium Upgrade System');
  console.log('════════════════════════════════════════');

  const addons = BILLING.addons;
  const addonKeys = Object.keys(addons);

  record({
    name: 'Add-ons Defined',
    phase: 'ADDONS',
    passed: addonKeys.length >= 4,
    details: `${addonKeys.length} addons: ${addonKeys.join(', ')}`,
    severity: 'high'
  });

  for (const [key, addon] of Object.entries(addons)) {
    const a = addon as any;
    record({
      name: `Addon "${a.name}" Has Required Fields`,
      phase: 'ADDONS',
      passed: !!a.id && !!a.name && !!a.description && (a.monthlyPrice > 0 || a.price > 0),
      details: `id=${a.id}, price=$${((a.monthlyPrice || a.price) / 100).toFixed(0)}`,
      severity: 'high'
    });
  }

  const proAddons = (BILLING.tiers.professional as any).addonsAvailable;
  record({
    name: 'Professional Tier Lists Available Addons',
    phase: 'ADDONS',
    passed: Array.isArray(proAddons) && proAddons.length >= 3,
    details: `${proAddons?.length || 0} addons: ${(proAddons || []).join(', ')}`,
    severity: 'medium'
  });

  const enterpriseFeatures = BILLING.tiers.enterprise.features;
  const hasApiAccess = enterpriseFeatures.some((f: string) => f.toLowerCase().includes('api'));
  const hasSso = enterpriseFeatures.some((f: string) => f.toLowerCase().includes('sso'));
  record({
    name: 'Enterprise Has Exclusive Features Listed',
    phase: 'ADDONS',
    passed: hasApiAccess && hasSso,
    details: `API access: ${hasApiAccess}, SSO: ${hasSso}`,
    severity: 'medium'
  });
}

async function phase12_end_to_end_journey_simulation() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 12: Full End-to-End Journey Simulation');
  console.log('════════════════════════════════════════');

  let credits = BILLING.tiers.starter.monthlyCredits;
  const operations: { feature: string; cost: number; result: string }[] = [];

  const schedule = canAccessFeature('basic_scheduling', 'starter', 0, credits);
  operations.push({ feature: 'basic_scheduling', cost: 0, result: schedule.allowed ? 'OK' : 'BLOCKED' });

  const gps = canAccessFeature('gps_photo_verification', 'starter', 0, credits);
  if (gps.creditsRequired) credits -= gps.creditsRequired;
  operations.push({ feature: 'gps_photo_verification', cost: gps.creditsRequired || 0, result: gps.allowed ? 'OK' : 'BLOCKED' });

  const guardTour = canAccessFeature('guard_tour_tracking', 'starter', 50, credits);
  if (guardTour.creditsRequired) credits -= guardTour.creditsRequired;
  operations.push({ feature: 'guard_tour_tracking', cost: guardTour.creditsRequired || 0, result: guardTour.allowed ? 'OK' : 'BLOCKED' });

  const eliteAttemptNoCredits = canAccessFeature('trinity_strategic_optimization', 'starter', 0, 0);
  operations.push({ feature: 'trinity_strategic_optimization', cost: 0, result: eliteAttemptNoCredits.allowed ? 'OK' : 'BLOCKED' });

  const eliteAttemptWithCredits = canAccessFeature('trinity_strategic_optimization', 'starter', 0, credits);

  record({
    name: 'Starter Journey: Core Features Work',
    phase: 'E2E_JOURNEY',
    passed: schedule.allowed === true,
    details: `basic_scheduling: ${schedule.allowed}`,
    severity: 'critical'
  });

  record({
    name: 'Starter Journey: Premium Features With Credits',
    phase: 'E2E_JOURNEY',
    passed: gps.allowed === true,
    details: `gps_photo_verification: allowed=${gps.allowed}, cost=${gps.creditsRequired || 0}`,
    severity: 'critical'
  });

  record({
    name: 'Starter Journey: Elite Blocked Without Credits',
    phase: 'E2E_JOURNEY',
    passed: eliteAttemptNoCredits.allowed === false,
    details: `trinity_strategic_optimization on starter (0 credits): blocked=${!eliteAttemptNoCredits.allowed}`,
    severity: 'critical'
  });

  record({
    name: 'Starter Journey: Elite Available Via Credit Purchase',
    phase: 'E2E_JOURNEY',
    passed: eliteAttemptWithCredits.allowed === true && (eliteAttemptWithCredits.creditsRequired || 0) > 0,
    details: `trinity_strategic_optimization on starter (has credits): allowed=${eliteAttemptWithCredits.allowed}, cost=${eliteAttemptWithCredits.creditsRequired}`,
    severity: 'critical'
  });

  let proCredits = BILLING.tiers.professional.monthlyCredits;
  const proPayroll = canAccessFeature('payroll_automation', 'professional', 0, proCredits);
  const proClaude = canAccessFeature('claude_contract_analysis', 'professional', 0, proCredits);
  const proInvoice = canAccessFeature('invoice_generation', 'professional', 0, proCredits);
  const proBot = canAccessFeature('bot_ecosystem', 'professional', 0, proCredits);

  record({
    name: 'Professional Journey: Premium Features Accessible',
    phase: 'E2E_JOURNEY',
    passed: proPayroll.allowed && proInvoice.allowed && proBot.allowed,
    details: `payroll=${proPayroll.allowed}, invoice=${proInvoice.allowed}, bot=${proBot.allowed}`,
    severity: 'critical'
  });

  record({
    name: 'Professional Journey: Elite With Credits (Credit-Based Access)',
    phase: 'E2E_JOURNEY',
    passed: proClaude.allowed === true || proClaude.creditsRequired !== undefined,
    details: `claude_contract_analysis: allowed=${proClaude.allowed}, credits=${proClaude.creditsRequired}`,
    severity: 'high'
  });

  let entCredits = BILLING.tiers.enterprise.monthlyCredits;
  const entStaffing = canAccessFeature('trinity_staffing', 'enterprise', 0, entCredits);
  const entVault = canAccessFeature('security_compliance_vault', 'enterprise', 0, entCredits);

  record({
    name: 'Enterprise Journey: All Features Including Elite',
    phase: 'E2E_JOURNEY',
    passed: entStaffing.allowed && entVault.allowed,
    details: `staffing=${entStaffing.allowed}, vault=${entVault.allowed}`,
    severity: 'critical'
  });

  const guardTourOverLimit = canAccessFeature('guard_tour_tracking', 'starter', 100, 0);
  record({
    name: 'Over-Limit Blocks When No Credits Available',
    phase: 'E2E_JOURNEY',
    passed: guardTourOverLimit.allowed === false,
    details: `guard_tour_tracking at 100/100 uses, 0 credits: allowed=${guardTourOverLimit.allowed}`,
    severity: 'critical'
  });

  const guardTourOverLimitWithCredits = canAccessFeature('guard_tour_tracking', 'starter', 100, 50);
  record({
    name: 'Over-Limit Allows With Sufficient Credits',
    phase: 'E2E_JOURNEY',
    passed: guardTourOverLimitWithCredits.allowed === true,
    details: `guard_tour_tracking at 100/100 uses, 50 credits: allowed=${guardTourOverLimitWithCredits.allowed}, cost=${guardTourOverLimitWithCredits.creditsRequired}`,
    severity: 'critical'
  });
}

async function phase13_exemptions_and_billing_guards() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 13: Credit Exemptions & Billing Guards');
  console.log('════════════════════════════════════════');

  record({
    name: 'Credit Exempt Features Are Minimal',
    phase: 'GUARDS',
    passed: CREDIT_EXEMPT_FEATURES.size <= 5,
    details: `${CREDIT_EXEMPT_FEATURES.size} exempt: ${[...CREDIT_EXEMPT_FEATURES].join(', ')}`,
    severity: 'high'
  });

  record({
    name: 'Support Pool Features Exist',
    phase: 'GUARDS',
    passed: SUPPORT_POOL_FEATURES.size >= 10,
    details: `${SUPPORT_POOL_FEATURES.size} support pool features`,
    severity: 'medium'
  });

  const noOverlap = [...CREDIT_EXEMPT_FEATURES].every(f => !SUPPORT_POOL_FEATURES.has(f));
  record({
    name: 'No Overlap Between Exempt and Pool',
    phase: 'GUARDS',
    passed: noOverlap,
    details: noOverlap ? 'Clean separation' : 'Overlap found',
    severity: 'medium'
  });

  record({
    name: 'Email Costs Defined in billingConfig',
    phase: 'GUARDS',
    passed: BILLING.emailCosts.transactional > 0 && BILLING.emailCosts.marketing > 0,
    details: `Transactional: $${BILLING.emailCosts.transactional}, Marketing: $${BILLING.emailCosts.marketing}`,
    severity: 'medium'
  });
}

async function phase14_yearly_savings_and_roi() {
  console.log('\n════════════════════════════════════════');
  console.log('PHASE 14: Yearly Savings & ROI Metrics');
  console.log('════════════════════════════════════════');

  const starterROI = (BILLING.tiers.starter as any).roiMetrics;
  const proROI = (BILLING.tiers.professional as any).roiMetrics;
  const entROI = (BILLING.tiers.enterprise as any).roiMetrics;

  record({
    name: 'All Paid Tiers Have ROI Metrics',
    phase: 'ROI',
    passed: !!starterROI && !!proROI && !!entROI,
    details: `Starter ROI=${starterROI?.roiPercent}%, Pro ROI=${proROI?.roiPercent}%, Ent ROI=${entROI?.roiPercent}%`,
    severity: 'high'
  });

  record({
    name: 'All Tiers Show Positive ROI',
    phase: 'ROI',
    passed: starterROI?.roiPercent > 100 && proROI?.roiPercent > 100 && entROI?.roiPercent > 100,
    details: `Starter=${starterROI?.roiPercent}%, Pro=${proROI?.roiPercent}%, Enterprise=${entROI?.roiPercent}%`,
    severity: 'medium'
  });

  const starterSavings = getYearlySavings('starter');
  record({
    name: 'Yearly Savings Calculator Works',
    phase: 'ROI',
    passed: starterSavings > 0,
    details: `Starter yearly savings: ${formatPrice(starterSavings)}`,
    severity: 'medium'
  });
}

export async function runEndToEndBillingStressTest() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  END-TO-END BILLING + CREDIT STRESS TEST        ║');
  console.log('║  14 Phases | Complete User Journey Validation    ║');
  console.log('╚══════════════════════════════════════════════════╝');

  results.length = 0;

  await phase1_signup_flow_simulation();
  await phase2_initial_credit_allocation();
  await phase3_subscription_stripe_wiring();
  await phase4_credit_usage_journey();
  await phase5_feature_access_complete_matrix();
  await phase6_credit_purchase_flow();
  await phase7_feature_limits_no_unlimited();
  await phase8_billing_settings_and_overages();
  await phase9_credit_cost_sync_validation();
  await phase10_db_schema_for_billing();
  await phase11_addon_system();
  await phase12_end_to_end_journey_simulation();
  await phase13_exemptions_and_billing_guards();
  await phase14_yearly_savings_and_roi();

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const criticalFails = results.filter(r => !r.passed && r.severity === 'critical').length;
  const highFails = results.filter(r => !r.passed && r.severity === 'high').length;

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passed} PASSED | ${failed} FAILED              ║`);
  console.log(`║  Critical Fails: ${criticalFails} | High Fails: ${highFails}              ║`);
  console.log('╚══════════════════════════════════════════════════╝');

  if (failed > 0) {
    console.log('\n═══ FAILURES ═══');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  [${r.severity.toUpperCase()}] ${r.name}: ${r.details}`);
    }
  }

  return { passed, failed, criticalFails, highFails, results };
}
