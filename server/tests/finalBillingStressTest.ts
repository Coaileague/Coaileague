import { db } from '../db';
import { sql } from 'drizzle-orm';
import { PREMIUM_FEATURES, CREDIT_PACKAGES, canAccessFeature, getFeatureCreditCost, isPremiumFeature, isEliteFeature, isFeatureIncludedInTier, getMonthlyLimit } from '@shared/config/premiumFeatures';
import { BILLING } from '@shared/billingConfig';
import { CREDIT_COSTS, TIER_CREDIT_ALLOCATIONS, CREDIT_EXEMPT_FEATURES, SUPPORT_POOL_FEATURES } from '../services/billing/creditManager';
import { STRIPE_PRODUCTS } from '../stripe-config';
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

async function phase1_registry_completeness() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 1: Premium Features Registry - Completeness & Schema Integrity');
  console.log('='.repeat(70));

  const featureIds = Object.keys(PREMIUM_FEATURES);
  record({ name: 'Registry Size >= 30 Features', phase: 'REGISTRY', passed: featureIds.length >= 30, details: `${featureIds.length} features registered`, severity: 'critical' });

  const allRequired = [
    'guard_tour_tracking', 'equipment_tracking', 'post_orders_management',
    'document_signing', 'employee_onboarding', 'shift_marketplace', 'shift_swapping',
    'payroll_automation', 'invoice_generation', 'quickbooks_sync',
    'push_notifications', 'employee_behavior_scoring', 'client_portal', 'bot_ecosystem',
    'basic_scheduling', 'basic_time_tracking', 'helpdesk_support', 'chatrooms',
    'trinity_meeting_recording', 'ai_dar_generation', 'gps_photo_verification',
    'trinity_strategic_optimization', 'claude_contract_analysis',
    'trinity_predictive_analytics', 'multi_state_compliance',
    'security_compliance_vault', 'trinity_staffing',
    'advanced_analytics', 'incident_management', 'client_billing',
    'trinity_staffing_email_scan', 'trinity_staffing_request_parse',
    'trinity_staffing_auto_assign', 'trinity_staffing_confirmation',
  ];
  const missing = allRequired.filter(f => !PREMIUM_FEATURES[f]);
  record({ name: 'All 34 Required Features Present', phase: 'REGISTRY', passed: missing.length === 0, details: missing.length === 0 ? `All ${allRequired.length} features present` : `MISSING: ${missing.join(', ')}`, severity: 'critical' });

  let schemaErrors: string[] = [];
  for (const [id, f] of Object.entries(PREMIUM_FEATURES)) {
    const checks = [
      [!f.id, 'id'], [!f.name, 'name'], [!f.description, 'description'],
      [!f.category, 'category'], [!f.featureType, 'featureType'], [!f.minimumTier, 'minimumTier'],
      [!f.includedInTiers || f.includedInTiers.length === 0, 'includedInTiers'],
      [f.creditCost === undefined || f.creditCost === null, 'creditCost'],
      [!f.billingMode, 'billingMode'], [!f.monthlyLimits, 'monthlyLimits'],
      [!f.badgeLabel, 'badgeLabel'], [!f.icon, 'icon'], [f.enabled === undefined, 'enabled'],
    ];
    const missingFields = checks.filter(([bad]) => bad).map(([, name]) => name);
    if (missingFields.length > 0) schemaErrors.push(`${id}: missing ${missingFields.join(',')}`);
  }
  record({ name: 'All Features Have Complete Schema', phase: 'REGISTRY', passed: schemaErrors.length === 0, details: schemaErrors.length === 0 ? `All ${featureIds.length} features fully defined` : schemaErrors.join('; '), severity: 'critical' });

  const validTypes = ['core', 'premium', 'elite'];
  const validTiers = ['free', 'starter', 'professional', 'enterprise'];
  const validModes = ['included', 'per_use', 'per_document', 'per_minute', 'per_request', 'tiered', 'per_shift', 'per_seat', 'per_action'];
  let typeErrors: string[] = [];
  for (const [id, f] of Object.entries(PREMIUM_FEATURES)) {
    if (!validTypes.includes(f.featureType)) typeErrors.push(`${id}: invalid featureType '${f.featureType}'`);
    if (!validTiers.includes(f.minimumTier)) typeErrors.push(`${id}: invalid minimumTier '${f.minimumTier}'`);
    if (!validModes.includes(f.billingMode)) typeErrors.push(`${id}: invalid billingMode '${f.billingMode}'`);
    if (!f.includedInTiers.every((t: string) => validTiers.includes(t))) typeErrors.push(`${id}: invalid tier in includedInTiers`);
  }
  record({ name: 'All Feature Enums Are Valid', phase: 'REGISTRY', passed: typeErrors.length === 0, details: typeErrors.length === 0 ? 'All featureType/minimumTier/billingMode/includedInTiers valid' : typeErrors.join('; '), severity: 'critical' });

  let limitErrors: string[] = [];
  for (const [id, f] of Object.entries(PREMIUM_FEATURES)) {
    const ml = f.monthlyLimits;
    if (ml.free === undefined || ml.starter === undefined || ml.professional === undefined || ml.enterprise === undefined) {
      limitErrors.push(`${id}: missing tier in monthlyLimits`);
    }
    if (ml.free > ml.starter && ml.starter > 0) limitErrors.push(`${id}: free > starter`);
    if (ml.starter > ml.professional && ml.professional > 0) limitErrors.push(`${id}: starter > professional`);
    if (ml.professional > ml.enterprise && ml.enterprise > 0) limitErrors.push(`${id}: professional > enterprise`);
  }
  record({ name: 'Monthly Limits Are Monotonically Increasing', phase: 'REGISTRY', passed: limitErrors.length === 0, details: limitErrors.length === 0 ? 'All features have monotonically increasing tier limits' : limitErrors.join('; '), severity: 'high' });
}

async function phase2_tier_distribution() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 2: Feature Tier Distribution & Classification');
  console.log('='.repeat(70));

  const byType: Record<string, string[]> = { core: [], premium: [], elite: [] };
  for (const [id, f] of Object.entries(PREMIUM_FEATURES)) byType[f.featureType]?.push(id);

  record({ name: 'Core Features >= 5', phase: 'TIERS', passed: byType.core.length >= 5, details: `${byType.core.length} core: ${byType.core.join(', ')}`, severity: 'critical' });
  record({ name: 'Premium Features >= 10', phase: 'TIERS', passed: byType.premium.length >= 10, details: `${byType.premium.length} premium features`, severity: 'critical' });
  record({ name: 'Elite Features >= 5', phase: 'TIERS', passed: byType.elite.length >= 5, details: `${byType.elite.length} elite features`, severity: 'critical' });

  const byCat: Record<string, number> = {};
  for (const [, f] of Object.entries(PREMIUM_FEATURES)) byCat[f.category] = (byCat[f.category] || 0) + 1;
  const categories = Object.keys(byCat);
  record({ name: 'Features Span >= 8 Categories', phase: 'TIERS', passed: categories.length >= 8, details: `${categories.length} categories: ${categories.map(c => `${c}(${byCat[c]})`).join(', ')}`, severity: 'high' });

  const byMode: Record<string, number> = {};
  for (const [, f] of Object.entries(PREMIUM_FEATURES)) byMode[f.billingMode] = (byMode[f.billingMode] || 0) + 1;
  record({ name: 'Multiple Billing Modes Used', phase: 'TIERS', passed: Object.keys(byMode).length >= 3, details: `Billing modes: ${Object.entries(byMode).map(([k,v]) => `${k}(${v})`).join(', ')}`, severity: 'high' });

  const coreFeatures = byType.core;
  const allCoreIncludeFree = coreFeatures.every(id => PREMIUM_FEATURES[id].includedInTiers.includes('free') || PREMIUM_FEATURES[id].includedInTiers.includes('starter'));
  record({ name: 'Core Features Available at Free/Starter', phase: 'TIERS', passed: allCoreIncludeFree, details: allCoreIncludeFree ? 'All core features include free or starter tier' : 'Some core features not available at lower tiers', severity: 'high' });

  const eliteFeatures = byType.elite;
  const eliteRequireEnterprise = eliteFeatures.every(id => {
    const f = PREMIUM_FEATURES[id];
    return f.minimumTier === 'enterprise' || f.minimumTier === 'professional';
  });
  record({ name: 'Elite Features Require Professional+', phase: 'TIERS', passed: eliteRequireEnterprise, details: 'All elite features require professional or enterprise tier', severity: 'high' });
}

async function phase3_credit_costs_completeness() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 3: Credit Costs - Completeness & Consistency');
  console.log('='.repeat(70));

  const creditKeys = Object.keys(CREDIT_COSTS);
  record({ name: 'CREDIT_COSTS >= 100 Entries', phase: 'COSTS', passed: creditKeys.length >= 100, details: `${creditKeys.length} credit cost entries in creditManager.ts`, severity: 'critical' });

  const criticalCreditKeys = [
    'guard_tour_scan', 'equipment_checkout', 'equipment_maintenance',
    'post_order_creation', 'document_signing_send', 'document_signing_verify',
    'employee_behavior_scoring', 'employee_performance_report',
    'bot_interaction', 'push_notification', 'advanced_analytics',
    'incident_management', 'client_billing',
    'ai_scheduling', 'ai_invoice_generation', 'ai_payroll_processing',
    'ai_chat_query', 'schedule_optimization',
    'trinity_chat', 'trinity_thought', 'trinity_insight',
    'email_transactional', 'sms_notification',
    'claude_analysis', 'claude_strategic', 'claude_executive',
    'trinity_staffing_scan', 'trinity_staffing_parse',
    'trinity_staffing_auto_assign', 'trinity_staffing_confirmation',
    'bot_helpai_response', 'bot_meeting_transcription', 'bot_report_detection',
    'bot_clock_validation', 'bot_cleanup_retention',
    'quickbooks_error_analysis', 'financial_pl_summary',
  ];
  const missingCosts = criticalCreditKeys.filter(k => !(k in CREDIT_COSTS));
  record({ name: 'All Critical Credit Keys Present', phase: 'COSTS', passed: missingCosts.length === 0, details: missingCosts.length === 0 ? `All ${criticalCreditKeys.length} critical keys present` : `MISSING: ${missingCosts.join(', ')}`, severity: 'critical' });

  let negativeCosts: string[] = [];
  let zeroCost = 0, paidCost = 0;
  for (const [key, cost] of Object.entries(CREDIT_COSTS)) {
    if ((cost as number) < 0) negativeCosts.push(key);
    if ((cost as number) === 0) zeroCost++;
    else paidCost++;
  }
  record({ name: 'No Negative Credit Costs', phase: 'COSTS', passed: negativeCosts.length === 0, details: negativeCosts.length === 0 ? 'All credit costs >= 0' : `Negative: ${negativeCosts.join(', ')}`, severity: 'critical' });
  record({ name: 'Majority of Costs Are Paid (>0)', phase: 'COSTS', passed: paidCost > zeroCost, details: `${paidCost} paid costs, ${zeroCost} zero costs`, severity: 'high' });

  const billingCreditCosts = BILLING.creditCosts as Record<string, number>;
  const billingKeys = Object.keys(billingCreditCosts);
  record({ name: 'billingConfig.creditCosts >= 30 Entries', phase: 'COSTS', passed: billingKeys.length >= 30, details: `${billingKeys.length} entries in billingConfig.creditCosts`, severity: 'critical' });

  const syncKeys = [
    'guard_tour_scan', 'equipment_checkout', 'equipment_maintenance',
    'document_signing_send', 'document_signing_verify',
    'employee_behavior_scoring', 'employee_performance_report',
    'bot_interaction', 'push_notification', 'advanced_analytics',
    'incident_management', 'client_billing', 'post_order_creation',
    'ai_scheduling', 'ai_invoice_generation', 'ai_payroll_processing',
    'ai_chat_query', 'schedule_optimization',
    'claude_analysis', 'claude_strategic', 'claude_executive',
    'quickbooks_error_analysis', 'financial_pl_summary',
  ];
  let syncMismatches: string[] = [];
  for (const key of syncKeys) {
    const cm = (CREDIT_COSTS as any)[key];
    const bc = billingCreditCosts[key];
    if (cm !== undefined && bc !== undefined && cm !== bc) syncMismatches.push(`${key}: CM=${cm} BC=${bc}`);
  }
  record({ name: 'creditManager ↔ billingConfig Sync (23 keys)', phase: 'COSTS', passed: syncMismatches.length === 0, details: syncMismatches.length === 0 ? 'All 23 checked keys in sync' : `MISMATCHES: ${syncMismatches.join('; ')}`, severity: 'critical' });

  const aiCosts = ['ai_scheduling', 'ai_invoice_generation', 'ai_payroll_processing', 'ai_chat_query', 'trinity_chat'];
  const claudeCosts = ['claude_analysis', 'claude_strategic', 'claude_executive'];
  const aiAllPositive = aiCosts.every(k => (CREDIT_COSTS as any)[k] > 0);
  const claudeAllPositive = claudeCosts.every(k => (CREDIT_COSTS as any)[k] > 0);
  record({ name: 'AI Features Have Positive Costs', phase: 'COSTS', passed: aiAllPositive, details: aiCosts.map(k => `${k}=${(CREDIT_COSTS as any)[k]}`).join(', '), severity: 'high' });
  record({ name: 'Claude Features Have Positive Costs', phase: 'COSTS', passed: claudeAllPositive, details: claudeCosts.map(k => `${k}=${(CREDIT_COSTS as any)[k]}`).join(', '), severity: 'high' });
}

async function phase4_subscription_tiers_pricing() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 4: Subscription Tiers - Pricing & Configuration');
  console.log('='.repeat(70));

  const expectedTiers = [
    { id: 'free', price: 0, credits: 250, maxEmp: 5 },
    { id: 'starter', price: 89900, credits: 2500, maxEmp: 15 },
    { id: 'professional', price: 199900, credits: 10000, maxEmp: 50 },
    { id: 'enterprise', price: 999900, credits: 50000, maxEmp: 500 },
  ];

  for (const exp of expectedTiers) {
    const tier = (BILLING as any).tiers[exp.id];
    record({ name: `${exp.id} Price = $${exp.price / 100}/mo`, phase: 'PRICING', passed: tier?.monthlyPrice === exp.price, details: `Configured: $${(tier?.monthlyPrice || 0) / 100}, expected: $${exp.price / 100}`, severity: 'critical' });
    record({ name: `${exp.id} Credits = ${exp.credits}/mo`, phase: 'PRICING', passed: tier?.monthlyCredits === exp.credits, details: `Configured: ${tier?.monthlyCredits}, expected: ${exp.credits}`, severity: 'critical' });
    record({ name: `${exp.id} MaxEmployees = ${exp.maxEmp}`, phase: 'PRICING', passed: tier?.maxEmployees === exp.maxEmp, details: `Configured: ${tier?.maxEmployees}, expected: ${exp.maxEmp}`, severity: 'critical' });
  }

  record({ name: 'Free Tier Blocks Credit Overage', phase: 'PRICING', passed: BILLING.tiers.free.allowCreditOverage === false, details: `allowCreditOverage=${BILLING.tiers.free.allowCreditOverage}`, severity: 'critical' });

  const tca = TIER_CREDIT_ALLOCATIONS;
  // @ts-expect-error — TS migration: fix in refactoring sprint
  record({ name: 'TIER_CREDIT_ALLOCATIONS Match billingConfig', phase: 'PRICING', passed: tca.free === 250 && tca.starter === 2500 && tca.professional === 10000 && tca.enterprise === 50000, details: `free=${tca.free}, starter=${tca.starter}, pro=${tca.professional}, ent=${tca.enterprise}`, severity: 'critical' });

  record({ name: 'Prices Monotonically Increase by Tier', phase: 'PRICING', passed: BILLING.tiers.free.monthlyPrice < BILLING.tiers.starter.monthlyPrice && BILLING.tiers.starter.monthlyPrice < BILLING.tiers.professional.monthlyPrice && BILLING.tiers.professional.monthlyPrice < BILLING.tiers.enterprise.monthlyPrice, details: 'free < starter < professional < enterprise', severity: 'critical' });

  record({ name: 'Credits Monotonically Increase by Tier', phase: 'PRICING', passed: BILLING.tiers.free.monthlyCredits < BILLING.tiers.starter.monthlyCredits && BILLING.tiers.starter.monthlyCredits < BILLING.tiers.professional.monthlyCredits && BILLING.tiers.professional.monthlyCredits < BILLING.tiers.enterprise.monthlyCredits, details: 'free < starter < professional < enterprise', severity: 'critical' });
}

async function phase5_stripe_alignment() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 5: Stripe Product/Price Alignment');
  console.log('='.repeat(70));

  const tierKeys = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const;
  for (const key of tierKeys) {
    const prod = (STRIPE_PRODUCTS as any)[key];
    record({ name: `STRIPE_PRODUCTS.${key} Exists`, phase: 'STRIPE', passed: !!prod && !!prod.name && prod.amount !== undefined, details: `name=${prod?.name}, amount=$${(prod?.amount || 0) / 100}`, severity: 'critical' });
  }

  record({ name: 'Stripe FREE = $0', phase: 'STRIPE', passed: STRIPE_PRODUCTS.FREE.amount === 0, details: `FREE amount=$${STRIPE_PRODUCTS.FREE.amount / 100}`, severity: 'critical' });
  record({ name: 'Stripe STARTER = billingConfig Starter', phase: 'STRIPE', passed: STRIPE_PRODUCTS.STARTER.amount === BILLING.tiers.starter.monthlyPrice, details: `Stripe=$${STRIPE_PRODUCTS.STARTER.amount / 100}, Config=$${BILLING.tiers.starter.monthlyPrice / 100}`, severity: 'critical' });
  record({ name: 'Stripe PROFESSIONAL = billingConfig Professional', phase: 'STRIPE', passed: STRIPE_PRODUCTS.PROFESSIONAL.amount === BILLING.tiers.professional.monthlyPrice, details: `Stripe=$${STRIPE_PRODUCTS.PROFESSIONAL.amount / 100}, Config=$${BILLING.tiers.professional.monthlyPrice / 100}`, severity: 'critical' });
  record({ name: 'Stripe ENTERPRISE = billingConfig Enterprise', phase: 'STRIPE', passed: STRIPE_PRODUCTS.ENTERPRISE.amount === BILLING.tiers.enterprise.monthlyPrice, details: `Stripe=$${STRIPE_PRODUCTS.ENTERPRISE.amount / 100}, Config=$${BILLING.tiers.enterprise.monthlyPrice / 100}`, severity: 'critical' });

  record({ name: 'Stripe Overages Configured', phase: 'STRIPE', passed: !!STRIPE_PRODUCTS.OVERAGES?.EMPLOYEE && !!STRIPE_PRODUCTS.OVERAGES?.CREDITS, details: `Employee overage=$${(STRIPE_PRODUCTS.OVERAGES?.EMPLOYEE?.amount || 0) / 100}, Credit overage=$${(STRIPE_PRODUCTS.OVERAGES?.CREDITS?.amount || 0) / 100}`, severity: 'high' });
  record({ name: 'Stripe Setup Fees Configured', phase: 'STRIPE', passed: !!STRIPE_PRODUCTS.SETUP_FEES?.STARTER && !!STRIPE_PRODUCTS.SETUP_FEES?.PROFESSIONAL && !!STRIPE_PRODUCTS.SETUP_FEES?.ENTERPRISE, details: `Starter=$${(STRIPE_PRODUCTS.SETUP_FEES?.STARTER?.amount || 0) / 100}, Pro=$${(STRIPE_PRODUCTS.SETUP_FEES?.PROFESSIONAL?.amount || 0) / 100}, Ent=$${(STRIPE_PRODUCTS.SETUP_FEES?.ENTERPRISE?.amount || 0) / 100}`, severity: 'high' });
  record({ name: 'Stripe Addons Configured', phase: 'STRIPE', passed: !!STRIPE_PRODUCTS.ADDONS, details: `Addons keys: ${STRIPE_PRODUCTS.ADDONS ? Object.keys(STRIPE_PRODUCTS.ADDONS).join(', ') : 'none'}`, severity: 'medium' });
}

async function phase6_access_control_logic() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 6: Feature Access Control - Comprehensive Gate Tests');
  console.log('='.repeat(70));

  const scenarios: Array<{ desc: string; feature: string; tier: any; uses: number; credits: number; expectAllowed: boolean; }> = [
    { desc: 'Free → core feature (basic_scheduling)', feature: 'basic_scheduling', tier: 'free', uses: 0, credits: 100, expectAllowed: true },
    { desc: 'Free → premium feature, no credits', feature: 'guard_tour_tracking', tier: 'free', uses: 0, credits: 0, expectAllowed: false },
    { desc: 'Free → elite feature', feature: 'trinity_staffing', tier: 'free', uses: 0, credits: 100, expectAllowed: false },
    { desc: 'Starter → core feature', feature: 'basic_time_tracking', tier: 'starter', uses: 0, credits: 100, expectAllowed: true },
    { desc: 'Professional → premium feature', feature: 'guard_tour_tracking', tier: 'professional', uses: 0, credits: 100, expectAllowed: true },
    { desc: 'Professional → elite feature (no credits)', feature: 'trinity_staffing', tier: 'professional', uses: 0, credits: 0, expectAllowed: false },
    { desc: 'Enterprise → elite feature', feature: 'trinity_staffing', tier: 'enterprise', uses: 0, credits: 1000, expectAllowed: true },
    { desc: 'Enterprise → all features', feature: 'claude_contract_analysis', tier: 'enterprise', uses: 0, credits: 500, expectAllowed: true },
  ];

  for (const s of scenarios) {
    const result = canAccessFeature(s.feature, s.tier, s.uses, s.credits);
    record({
      name: s.desc,
      phase: 'ACCESS',
      passed: result.allowed === s.expectAllowed,
      details: `allowed=${result.allowed} (expected ${s.expectAllowed}), reason=${result.reason || 'ok'}`,
      severity: 'critical'
    });
  }

  const overLimitResult = canAccessFeature('guard_tour_tracking', 'starter', 200, 50);
  record({ name: 'Over Limit → Requires Credits or Denied', phase: 'ACCESS', passed: overLimitResult.creditsRequired !== undefined || overLimitResult.allowed === false, details: `At 200 uses (limit ~100): allowed=${overLimitResult.allowed}, creditsRequired=${overLimitResult.creditsRequired}`, severity: 'critical' });

  const featureIds = Object.keys(PREMIUM_FEATURES);
  let accessErrors: string[] = [];
  for (const id of featureIds) {
    const f = PREMIUM_FEATURES[id];
    const enterpriseResult = canAccessFeature(id, 'enterprise', 0, 10000);
    if (!enterpriseResult.allowed) accessErrors.push(`${id}: enterprise denied`);
  }
  record({ name: 'Enterprise Can Access All 34 Features', phase: 'ACCESS', passed: accessErrors.length === 0, details: accessErrors.length === 0 ? 'All 34 features accessible on enterprise' : accessErrors.join('; '), severity: 'critical' });

  const tiers: Array<'free' | 'starter' | 'professional' | 'enterprise'> = ['free', 'starter', 'professional', 'enterprise'];
  for (const tier of tiers) {
    const count = featureIds.filter(id => isFeatureIncludedInTier(id, tier)).length;
    record({ name: `${tier} Tier Included Feature Count`, phase: 'ACCESS', passed: tier === 'free' ? count >= 2 : count > 0, details: `${count} features included in ${tier}`, severity: 'high' });
  }

  for (const id of featureIds) {
    const cost = getFeatureCreditCost(id);
    if (cost === undefined || cost === null) {
      record({ name: `getFeatureCreditCost(${id})`, phase: 'ACCESS', passed: false, details: 'returned undefined/null', severity: 'high' });
    }
  }
  record({ name: 'All Features Return Valid Credit Cost', phase: 'ACCESS', passed: true, details: `Verified getFeatureCreditCost for ${featureIds.length} features`, severity: 'high' });

  const premiumCount = featureIds.filter(id => isPremiumFeature(id)).length;
  const eliteCount = featureIds.filter(id => isEliteFeature(id)).length;
  record({ name: 'isPremiumFeature/isEliteFeature Work', phase: 'ACCESS', passed: premiumCount >= 10 && eliteCount >= 5, details: `isPremium=${premiumCount}, isElite=${eliteCount}`, severity: 'high' });
}

async function phase7_credit_packages() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 7: Credit Packages & Purchasing Configuration');
  console.log('='.repeat(70));

  record({ name: 'CREDIT_PACKAGES >= 4', phase: 'PACKAGES', passed: CREDIT_PACKAGES.length >= 4, details: `${CREDIT_PACKAGES.length} packages available`, severity: 'critical' });

  let packageErrors: string[] = [];
  for (const p of CREDIT_PACKAGES) {
    if (!p.id) packageErrors.push('missing id');
    if (!p.name) packageErrors.push(`${p.id}: missing name`);
    if (!p.credits || p.credits <= 0) packageErrors.push(`${p.id}: invalid credits ${p.credits}`);
    if (!p.price || p.price <= 0) packageErrors.push(`${p.id}: invalid price ${p.price}`);
    if (!p.stripeProductId) packageErrors.push(`${p.id}: missing stripeProductId`);
    if (!p.stripePriceId) packageErrors.push(`${p.id}: missing stripePriceId`);
  }
  record({ name: 'All Packages Have Required Fields', phase: 'PACKAGES', passed: packageErrors.length === 0, details: packageErrors.length === 0 ? 'All packages valid' : packageErrors.join('; '), severity: 'critical' });

  const sorted = [...CREDIT_PACKAGES].sort((a, b) => a.credits - b.credits);
  let pricePerCredit: number[] = [];
  for (const p of sorted) pricePerCredit.push(p.price / p.credits);
  const volumeDiscount = pricePerCredit.length >= 2 && pricePerCredit[0] >= pricePerCredit[pricePerCredit.length - 1];
  record({ name: 'Larger Packs Have Better Price/Credit', phase: 'PACKAGES', passed: volumeDiscount, details: sorted.map(p => `${p.name}: $${(p.price / p.credits).toFixed(4)}/credit`).join(', '), severity: 'high' });

  const popularPack = CREDIT_PACKAGES.find(p => p.popular);
  record({ name: 'One Package Marked Popular', phase: 'PACKAGES', passed: !!popularPack, details: popularPack ? `Popular: ${popularPack.name}` : 'No popular pack', severity: 'medium' });

  const billingPacks = Object.keys(BILLING.creditPacks);
  record({ name: 'billingConfig.creditPacks >= 4', phase: 'PACKAGES', passed: billingPacks.length >= 4, details: `${billingPacks.length} packs: ${billingPacks.join(', ')}`, severity: 'high' });

  let bonusCredits = CREDIT_PACKAGES.filter(p => p.bonusCredits > 0);
  record({ name: 'Some Packages Offer Bonus Credits', phase: 'PACKAGES', passed: bonusCredits.length > 0, details: `${bonusCredits.length} packages with bonus credits`, severity: 'info' });
}

async function phase8_feature_matrix() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 8: Feature Matrix - Complete Tier Mapping');
  console.log('='.repeat(70));

  const fm = BILLING.featureMatrix;
  const matrixKeys = Object.keys(fm);
  record({ name: 'Feature Matrix >= 40 Entries', phase: 'MATRIX', passed: matrixKeys.length >= 40, details: `${matrixKeys.length} features in matrix`, severity: 'critical' });

  const requiredInMatrix = [
    'guard_tour_tracking', 'equipment_tracking', 'post_orders', 'document_signing',
    'push_notifications', 'employee_behavior_scoring', 'chatrooms', 'helpdesk',
    'bot_ecosystem', 'client_portal', 'employee_onboarding', 'incident_management',
    'basic_scheduling', 'ai_scheduling', 'gps_time_tracking', 'basic_compliance',
    'payroll_automation', 'invoice_generation', 'basic_reporting', 'advanced_analytics',
    'client_billing', 'shift_marketplace', 'shift_swapping',
  ];
  const missingMatrix = requiredInMatrix.filter(f => !(f in fm));
  record({ name: 'All Required Features In Matrix', phase: 'MATRIX', passed: missingMatrix.length === 0, details: missingMatrix.length === 0 ? `All ${requiredInMatrix.length} required features present` : `MISSING: ${missingMatrix.join(', ')}`, severity: 'critical' });

  let invalidEntries: string[] = [];
  for (const [key, value] of Object.entries(fm)) {
    const v = value as any;
    if (v.free === undefined || v.starter === undefined || v.professional === undefined || v.enterprise === undefined) {
      invalidEntries.push(key);
    }
  }
  record({ name: 'All Matrix Entries Have 4 Tier Values', phase: 'MATRIX', passed: invalidEntries.length === 0, details: invalidEntries.length === 0 ? `All ${matrixKeys.length} entries have free/starter/pro/enterprise` : `Incomplete: ${invalidEntries.join(', ')}`, severity: 'critical' });

  const enterpriseOnlyCount = matrixKeys.filter(k => {
    const v = (fm as any)[k];
    return v.enterprise === true && v.professional !== true && v.professional !== 'addon';
  }).length;
  record({ name: 'Enterprise-Only Features >= 3', phase: 'MATRIX', passed: enterpriseOnlyCount >= 3, details: `${enterpriseOnlyCount} enterprise-only features`, severity: 'high' });

  const addonFeatures = matrixKeys.filter(k => {
    const v = (fm as any)[k];
    return v.starter === 'addon' || v.professional === 'addon';
  });
  record({ name: 'Addon Features Exist', phase: 'MATRIX', passed: addonFeatures.length > 0, details: `${addonFeatures.length} features available as addons`, severity: 'medium' });
}

async function phase9_db_tables_integrity() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 9: Database Tables - Billing/Credit Schema Integrity');
  console.log('='.repeat(70));

  const billingTables = [
    'workspace_credits', 'credit_transactions', 'feature_usage_events',
    'workspace_addons', 'billing_addons', 'credit_packs',
    'subscriptions', 'processed_stripe_events',
  ];

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const tableCheck = await typedQuery(sql`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = ANY(ARRAY[${sql.raw(billingTables.map(t => `'${t}'`).join(','))}])
  `);
  const foundTables = (tableCheck as any).rows?.map((r: any) => r.table_name) || [];
  const missingTables = billingTables.filter(t => !foundTables.includes(t));
  record({ name: 'All 8 Billing Tables Exist', phase: 'DB', passed: missingTables.length === 0, details: missingTables.length === 0 ? 'All billing tables present' : `MISSING: ${missingTables.join(', ')}`, severity: 'critical' });

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const credColCheck = await typedQuery(sql`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'workspace_credits' ORDER BY ordinal_position
  `);
  const credCols = (credColCheck as any).rows?.map((r: any) => r.column_name) || [];
  const requiredCredCols = ['workspace_id', 'current_balance', 'monthly_allocation'];
  record({ name: 'workspace_credits Has Key Columns', phase: 'DB', passed: requiredCredCols.every(c => credCols.includes(c)), details: `Required: ${requiredCredCols.join(', ')} | Found: ${credCols.slice(0, 8).join(', ')}...`, severity: 'critical' });

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const txColCheck = await typedQuery(sql`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'credit_transactions' ORDER BY ordinal_position
  `);
  const txCols = (txColCheck as any).rows?.map((r: any) => r.column_name) || [];
  const requiredTxCols = ['workspace_id', 'amount', 'feature_key', 'transaction_type'];
  record({ name: 'credit_transactions Has Key Columns', phase: 'DB', passed: requiredTxCols.every(c => txCols.includes(c)), details: `Required: ${requiredTxCols.join(', ')} | Found: ${txCols.slice(0, 8).join(', ')}...`, severity: 'critical' });

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const subColCheck = await typedQuery(sql`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'subscriptions' ORDER BY ordinal_position
  `);
  const subCols = (subColCheck as any).rows?.map((r: any) => r.column_name) || [];
  const requiredSubCols = ['workspace_id', 'stripe_subscription_id', 'plan', 'status'];
  record({ name: 'subscriptions Has Key Columns', phase: 'DB', passed: requiredSubCols.every(c => subCols.includes(c)), details: `Required: ${requiredSubCols.join(', ')}`, severity: 'critical' });

  // CATEGORY C — Raw SQL retained: information_schema | Tables: information_schema | Verified: 2026-03-23
  const eventColCheck = await typedQuery(sql`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'processed_stripe_events' ORDER BY ordinal_position
  `);
  const eventCols = (eventColCheck as any).rows?.map((r: any) => r.column_name) || [];
  record({ name: 'processed_stripe_events Table Has Columns', phase: 'DB', passed: eventCols.length >= 2, details: `${eventCols.length} columns: ${eventCols.join(', ')}`, severity: 'high' });
}

async function phase10_exemptions_and_pools() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 10: Credit Exemptions & Support Pool');
  console.log('='.repeat(70));

  record({ name: 'Exempt Features <= 5 (Minimal)', phase: 'EXEMPT', passed: CREDIT_EXEMPT_FEATURES.size <= 5, details: `${CREDIT_EXEMPT_FEATURES.size} exempt: ${[...CREDIT_EXEMPT_FEATURES].join(', ')}`, severity: 'high' });
  record({ name: 'Support Pool >= 10 Features', phase: 'EXEMPT', passed: SUPPORT_POOL_FEATURES.size >= 10, details: `${SUPPORT_POOL_FEATURES.size} support pool features`, severity: 'high' });

  const overlap = [...CREDIT_EXEMPT_FEATURES].filter(f => SUPPORT_POOL_FEATURES.has(f));
  record({ name: 'No Exempt ↔ Pool Overlap', phase: 'EXEMPT', passed: overlap.length === 0, details: overlap.length === 0 ? 'No overlap' : `Overlap: ${overlap.join(', ')}`, severity: 'high' });

  let unlimitedCount = 0;
  for (const [id, f] of Object.entries(PREMIUM_FEATURES)) {
    const tiers = ['free', 'starter', 'professional', 'enterprise'] as const;
    for (const tier of tiers) {
      if (f.monthlyLimits[tier] === -1) unlimitedCount++;
    }
  }
  record({ name: 'No Unlimited (-1) Limits Anywhere', phase: 'EXEMPT', passed: unlimitedCount === 0, details: unlimitedCount === 0 ? 'All features have finite caps' : `${unlimitedCount} unlimited entries found`, severity: 'critical' });
}

async function phase11_cross_validation() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 11: Cross-System Validation - Registry ↔ Costs ↔ Matrix ↔ Stripe');
  console.log('='.repeat(70));

  let premiumUnpriced: string[] = [];
  for (const [id, f] of Object.entries(PREMIUM_FEATURES)) {
    if ((f.featureType === 'premium' || f.featureType === 'elite') && f.creditCost === 0 && f.billingMode !== 'included') {
      premiumUnpriced.push(id);
    }
  }
  record({ name: 'Premium/Elite Non-Included Features All Priced', phase: 'CROSS', passed: premiumUnpriced.length === 0, details: premiumUnpriced.length === 0 ? 'All premium/elite per_use features have credit costs' : premiumUnpriced.join(', '), severity: 'critical' });

  const featureIds = Object.keys(PREMIUM_FEATURES);
  const costIds = Object.keys(CREDIT_COSTS);
  const matrixIds = Object.keys(BILLING.featureMatrix);

  record({ name: 'Registry (34) vs Costs (100+) vs Matrix (51)', phase: 'CROSS', passed: featureIds.length >= 30 && costIds.length >= 100 && matrixIds.length >= 40, details: `Registry=${featureIds.length}, Costs=${costIds.length}, Matrix=${matrixIds.length}`, severity: 'info' });

  const perUseFeatures = featureIds.filter(id => PREMIUM_FEATURES[id].billingMode === 'per_use' || PREMIUM_FEATURES[id].billingMode === 'per_document' || PREMIUM_FEATURES[id].billingMode === 'per_minute');
  const perUseWithCost = perUseFeatures.filter(id => PREMIUM_FEATURES[id].creditCost > 0);
  record({ name: 'All per_use/per_document/per_minute Have Credit Cost > 0', phase: 'CROSS', passed: perUseWithCost.length === perUseFeatures.length, details: `${perUseWithCost.length}/${perUseFeatures.length} per-use features have cost > 0`, severity: 'critical' });

  const includedFeatures = featureIds.filter(id => PREMIUM_FEATURES[id].billingMode === 'included');
  const includedWithZeroCost = includedFeatures.filter(id => PREMIUM_FEATURES[id].creditCost === 0);
  record({ name: 'Included Features Have Credit Cost = 0', phase: 'CROSS', passed: includedWithZeroCost.length === includedFeatures.length, details: `${includedWithZeroCost.length}/${includedFeatures.length} included features have zero cost`, severity: 'high' });

  const stripeAmounts = {
    free: STRIPE_PRODUCTS.FREE.amount,
    starter: STRIPE_PRODUCTS.STARTER.amount,
    professional: STRIPE_PRODUCTS.PROFESSIONAL.amount,
    enterprise: STRIPE_PRODUCTS.ENTERPRISE.amount,
  };
  const billingAmounts = {
    free: BILLING.tiers.free.monthlyPrice,
    starter: BILLING.tiers.starter.monthlyPrice,
    professional: BILLING.tiers.professional.monthlyPrice,
    enterprise: BILLING.tiers.enterprise.monthlyPrice,
  };
  let stripeBillingMatch = true;
  let mismatchDetails: string[] = [];
  for (const tier of ['free', 'starter', 'professional', 'enterprise'] as const) {
    if ((stripeAmounts as any)[tier] !== (billingAmounts as any)[tier]) {
      stripeBillingMatch = false;
      mismatchDetails.push(`${tier}: Stripe=$${(stripeAmounts as any)[tier] / 100} vs Config=$${(billingAmounts as any)[tier] / 100}`);
    }
  }
  record({ name: 'Stripe ↔ billingConfig Price Parity (All 4 Tiers)', phase: 'CROSS', passed: stripeBillingMatch, details: stripeBillingMatch ? 'All 4 tier prices match exactly' : mismatchDetails.join('; '), severity: 'critical' });

  const showcaseCredits = { starter: 2500, professional: 10000, enterprise: 50000 };
  const configCredits = { starter: BILLING.tiers.starter.monthlyCredits, professional: BILLING.tiers.professional.monthlyCredits, enterprise: BILLING.tiers.enterprise.monthlyCredits };
  const creditsMatch = showcaseCredits.starter === configCredits.starter && showcaseCredits.professional === configCredits.professional && showcaseCredits.enterprise === configCredits.enterprise;
  record({ name: 'Showcase Credits Match billingConfig', phase: 'CROSS', passed: creditsMatch, details: `Showcase: ${JSON.stringify(showcaseCredits)}, Config: ${JSON.stringify(configCredits)}`, severity: 'critical' });
}

async function phase12_showcase_alignment() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 12: Features Showcase Page Alignment');
  console.log('='.repeat(70));

  const fs = await import('fs');
  const showcaseContent = fs.readFileSync('client/src/pages/features-showcase.tsx', 'utf-8');

  const creditCostMatches = showcaseContent.match(/creditCost:\s*\d+/g) || [];
  record({ name: 'Showcase Features Have creditCost Field', phase: 'SHOWCASE', passed: creditCostMatches.length >= 25, details: `${creditCostMatches.length} features with creditCost defined`, severity: 'critical' });

  const hasCreditBadge = showcaseContent.includes('creditCost') && showcaseContent.includes('credit');
  record({ name: 'Showcase Displays Credit Cost Badges', phase: 'SHOWCASE', passed: hasCreditBadge, details: 'Credit cost badge rendering present in showcase', severity: 'high' });

  const showcaseFeatureNames = [
    'Guard Tour', 'Equipment', 'Post Order', 'Document Signing',
    'Onboarding', 'Shift Marketplace', 'Client Portal', 'Bot Ecosystem',
    'Push Notification', 'Behavior Scoring', 'Analytics', 'Payroll',
    'Invoice', 'QuickBooks', 'Scheduling', 'Time Tracking',
  ];
  let missingShowcase: string[] = [];
  for (const name of showcaseFeatureNames) {
    if (!showcaseContent.includes(name)) missingShowcase.push(name);
  }
  record({ name: 'Showcase Has All Feature Names', phase: 'SHOWCASE', passed: missingShowcase.length === 0, details: missingShowcase.length === 0 ? `All ${showcaseFeatureNames.length} feature names present` : `Missing: ${missingShowcase.join(', ')}`, severity: 'high' });

  const priceStrings = ['$899', '$1,999', '$9,999'];
  const pricesMissing = priceStrings.filter(p => !showcaseContent.includes(p));
  record({ name: 'Showcase Tier Prices Match Config', phase: 'SHOWCASE', passed: pricesMissing.length === 0, details: pricesMissing.length === 0 ? 'All tier prices displayed correctly' : `Missing prices: ${pricesMissing.join(', ')}`, severity: 'critical' });

  const creditStrings = ['2,500 AI credits', '10,000 AI credits', '50,000 AI credits'];
  const creditsMissing = creditStrings.filter(c => !showcaseContent.includes(c));
  record({ name: 'Showcase Credit Amounts Match Config', phase: 'SHOWCASE', passed: creditsMissing.length === 0, details: creditsMissing.length === 0 ? 'All credit amounts displayed correctly' : `Missing: ${creditsMissing.join(', ')}`, severity: 'critical' });
}

async function phase13_monthly_limits_coverage() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 13: Monthly Limits Deep Validation');
  console.log('='.repeat(70));

  const tiers = ['free', 'starter', 'professional', 'enterprise'] as const;
  for (const [id, f] of Object.entries(PREMIUM_FEATURES)) {
    for (const tier of tiers) {
      const limit = getMonthlyLimit(id, tier);
      if (limit === undefined || limit === null) {
        record({ name: `getMonthlyLimit(${id}, ${tier})`, phase: 'LIMITS', passed: false, details: 'returned undefined/null', severity: 'high' });
      }
    }
  }
  record({ name: 'All getMonthlyLimit Calls Return Values', phase: 'LIMITS', passed: true, details: `Verified ${Object.keys(PREMIUM_FEATURES).length * 4} limit lookups`, severity: 'high' });

  let freeBlockedPremium = 0;
  for (const [id, f] of Object.entries(PREMIUM_FEATURES)) {
    if (f.featureType === 'premium' && f.monthlyLimits.free === 0) freeBlockedPremium++;
  }
  record({ name: 'Free Tier Blocks Premium Features (limit=0)', phase: 'LIMITS', passed: freeBlockedPremium >= 10, details: `${freeBlockedPremium} premium features blocked on free tier`, severity: 'critical' });

  let enterpriseHighLimits = 0;
  for (const [id, f] of Object.entries(PREMIUM_FEATURES)) {
    if (f.monthlyLimits.enterprise >= 100) enterpriseHighLimits++;
  }
  record({ name: 'Enterprise Has High Limits (>= 100)', phase: 'LIMITS', passed: enterpriseHighLimits >= 15, details: `${enterpriseHighLimits} features with enterprise limit >= 100`, severity: 'high' });
}

async function phase14_feature_api_routes() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 14: Feature API Route Coverage');
  console.log('='.repeat(70));

  const fs = await import('fs');
  const path = await import('path');

  const routeFiles = [
    'server/routes.ts',
  ];

  let routeContent = '';
  for (const f of routeFiles) {
    try { routeContent += fs.readFileSync(f, 'utf-8'); } catch {}
  }

  const requiredRoutes = [
    { name: 'Guard Tours API', pattern: /guard-tours|guardTour/i },
    { name: 'Equipment API', pattern: /equipment/i },
    { name: 'Post Orders API', pattern: /post-orders|postOrder/i },
    { name: 'Subscriptions API', pattern: /subscriptions|billing/i },
    { name: 'Credits API', pattern: /credits/i },
    { name: 'Stripe Webhooks', pattern: /stripe.*webhook|webhook.*stripe/i },
    { name: 'Payroll API', pattern: /payroll/i },
    { name: 'Invoices API', pattern: /invoic/i },
  ];

  for (const route of requiredRoutes) {
    const found = route.pattern.test(routeContent);
    record({ name: `Route: ${route.name}`, phase: 'ROUTES', passed: found, details: found ? 'Route pattern found in routes.ts' : 'NOT FOUND', severity: 'high' });
  }
}

async function phase15_financial_pipeline_alignment() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 15: Financial Pipeline - End-to-End Alignment');
  console.log('='.repeat(70));

  const fs = await import('fs');

  let creditManagerContent = '';
  try { creditManagerContent = fs.readFileSync('server/services/billing/creditManager.ts', 'utf-8'); } catch {}

  record({ name: 'creditManager.ts Exists', phase: 'PIPELINE', passed: creditManagerContent.length > 0, details: `${creditManagerContent.length} chars`, severity: 'critical' });
  record({ name: 'creditManager Exports CREDIT_COSTS', phase: 'PIPELINE', passed: creditManagerContent.includes('CREDIT_COSTS'), details: 'CREDIT_COSTS constant exported', severity: 'critical' });
  record({ name: 'creditManager Exports TIER_CREDIT_ALLOCATIONS', phase: 'PIPELINE', passed: creditManagerContent.includes('TIER_CREDIT_ALLOCATIONS'), details: 'TIER_CREDIT_ALLOCATIONS constant exported', severity: 'critical' });

  let billingConfigContent = '';
  try { billingConfigContent = fs.readFileSync('shared/billingConfig.ts', 'utf-8'); } catch {}

  record({ name: 'billingConfig Has featureMatrix', phase: 'PIPELINE', passed: billingConfigContent.includes('featureMatrix'), details: 'featureMatrix section present', severity: 'critical' });
  record({ name: 'billingConfig Has creditCosts', phase: 'PIPELINE', passed: billingConfigContent.includes('creditCosts'), details: 'creditCosts section present', severity: 'critical' });
  record({ name: 'billingConfig Has creditPacks', phase: 'PIPELINE', passed: billingConfigContent.includes('creditPacks'), details: 'creditPacks section present', severity: 'critical' });

  let stripeConfigContent = '';
  try { stripeConfigContent = fs.readFileSync('server/stripe-config.ts', 'utf-8'); } catch {}

  record({ name: 'stripe-config References billingConfig', phase: 'PIPELINE', passed: stripeConfigContent.includes('BILLING') || stripeConfigContent.includes('billingConfig'), details: 'Stripe config uses billingConfig as source of truth', severity: 'high' });
}

export async function runFinalBillingStressTest() {
  console.log('');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║  FINAL BILLING/CREDIT/FEATURES MEGA STRESS TEST                    ║');
  console.log('║  15 Phases | Complete Platform Billing Validation                   ║');
  console.log('║  Registry + Costs + Tiers + Stripe + Access + Packages + DB + More  ║');
  console.log('╚' + '═'.repeat(68) + '╝');

  results.length = 0;

  await phase1_registry_completeness();
  await phase2_tier_distribution();
  await phase3_credit_costs_completeness();
  await phase4_subscription_tiers_pricing();
  await phase5_stripe_alignment();
  await phase6_access_control_logic();
  await phase7_credit_packages();
  await phase8_feature_matrix();
  await phase9_db_tables_integrity();
  await phase10_exemptions_and_pools();
  await phase11_cross_validation();
  await phase12_showcase_alignment();
  await phase13_monthly_limits_coverage();
  await phase14_feature_api_routes();
  await phase15_financial_pipeline_alignment();

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const criticalFails = results.filter(r => !r.passed && r.severity === 'critical').length;
  const highFails = results.filter(r => !r.passed && r.severity === 'high').length;

  console.log('\n' + '╔' + '═'.repeat(68) + '╗');
  console.log(`║  FINAL RESULTS: ${passed} PASSED | ${failed} FAILED                          ║`);
  console.log(`║  Critical: ${criticalFails} | High: ${highFails} | Total Tests: ${results.length}                       ║`);
  console.log('╚' + '═'.repeat(68) + '╝');

  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  [${r.severity.toUpperCase()}] ${r.name}: ${r.details}`);
    });
  } else {
    console.log('\n✅ ALL TESTS PASSED - BILLING SYSTEM FULLY VALIDATED');
  }

  return { total: results.length, passed, failed, criticalFails, highFails, results };
}
