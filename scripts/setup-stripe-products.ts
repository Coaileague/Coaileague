/**
 * CoAIleague — Stripe Product & Price Setup Script
 * =================================================
 * Creates or retrieves all Stripe products and prices for the CoAIleague platform.
 * Run after pricing changes to ensure Stripe matches the master price list.
 *
 * MASTER PRICE LIST (source of truth — must match client/src/config/pricing.ts):
 *   Starter:      $199/mo  | $1,990/yr  | 10 seats | 3 sites  | 5K interactions
 *   Professional: $749/mo  | $7,490/yr  | 30 seats | 10 sites | 20K interactions
 *   Business:     $2,249/mo | $22,490/yr | 75 seats | 25 sites | 60K interactions
 *   Enterprise:   $6,999/mo | $69,990/yr | 200 seats | 75 sites | 200K interactions
 *   Strategic:    $15,000+ min / 300+ officers / contact required
 *
 * SEAT OVERAGES:
 *   Starter:      $20/seat/mo | $49/site/mo
 *   Professional: $25/seat/mo | $49/site/mo
 *   Business:     $30/seat/mo | $39/site/mo
 *   Enterprise:   $35/seat/mo | $29/site/mo
 *
 * USAGE:
 *   npx tsx scripts/setup-stripe-products.ts
 *
 * OUTPUT:
 *   Prints all env var keys with their Stripe price IDs.
 *   Copy the output into your Replit secrets / .env file.
 */

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as any,
});

interface ProductDef {
  name: string;
  description: string;
  metadata?: Record<string, string>;
}

interface PriceDef {
  productName: string;
  envVar: string;
  amount?: number;
  currency: string;
  interval?: 'month' | 'year';
  usageType?: 'metered' | 'licensed';
  aggregateUsage?: 'sum' | 'max' | 'last_during_period';
  isOneTime?: boolean;
  metadata?: Record<string, string>;
  nickname?: string;
}

// ── Product catalog ───────────────────────────────────────────────────────────

const PRODUCTS: Record<string, ProductDef> = {
  starter: {
    name: 'CoAIleague Starter',
    description: 'Starter plan — $199/month. 10 seats, 3 sites, 5K AI interactions. Replaces manual scheduling, basic compliance, and incident tracking.',
    metadata: { tier: 'starter', platform: 'coaileague' },
  },
  professional: {
    name: 'CoAIleague Professional',
    description: 'Professional plan — $749/month. 30 seats, 10 sites, 20K AI interactions. Replaces your dedicated scheduler, payroll provider, and compliance tools.',
    metadata: { tier: 'professional', platform: 'coaileague' },
  },
  business: {
    name: 'CoAIleague Business',
    description: 'Business plan — $2,249/month. 75 seats, 25 sites, 60K AI interactions. Replaces your operations manager, HR admin, and full back-office stack.',
    metadata: { tier: 'business', platform: 'coaileague' },
  },
  enterprise: {
    name: 'CoAIleague Enterprise',
    description: 'Enterprise plan — $6,999/month. 200 seats, 75 sites, 200K AI interactions. Replaces entire middle management operations layer.',
    metadata: { tier: 'enterprise', platform: 'coaileague' },
  },
  seat_overage_starter: {
    name: 'CoAIleague Seat Overage — Starter',
    description: 'Additional seats above Starter plan (10 included). $20/seat/month.',
    metadata: { type: 'seat_overage', tier: 'starter', platform: 'coaileague' },
  },
  seat_overage_professional: {
    name: 'CoAIleague Seat Overage — Professional',
    description: 'Additional seats above Professional plan (30 included). $25/seat/month.',
    metadata: { type: 'seat_overage', tier: 'professional', platform: 'coaileague' },
  },
  seat_overage_business: {
    name: 'CoAIleague Seat Overage — Business',
    description: 'Additional seats above Business plan (75 included). $30/seat/month.',
    metadata: { type: 'seat_overage', tier: 'business', platform: 'coaileague' },
  },
  seat_overage_enterprise: {
    name: 'CoAIleague Seat Overage — Enterprise',
    description: 'Additional seats above Enterprise plan (200 included). $35/seat/month.',
    metadata: { type: 'seat_overage', tier: 'enterprise', platform: 'coaileague' },
  },
  site_overage_starter: {
    name: 'CoAIleague Site Overage — Starter',
    description: 'Additional sites above Starter plan (3 included). $49/site/month.',
    metadata: { type: 'site_overage', tier: 'starter', platform: 'coaileague' },
  },
  site_overage_professional: {
    name: 'CoAIleague Site Overage — Professional',
    description: 'Additional sites above Professional plan (10 included). $49/site/month.',
    metadata: { type: 'site_overage', tier: 'professional', platform: 'coaileague' },
  },
  site_overage_business: {
    name: 'CoAIleague Site Overage — Business',
    description: 'Additional sites above Business plan (25 included). $39/site/month.',
    metadata: { type: 'site_overage', tier: 'business', platform: 'coaileague' },
  },
  site_overage_enterprise: {
    name: 'CoAIleague Site Overage — Enterprise',
    description: 'Additional sites above Enterprise plan (75 included). $29/site/month.',
    metadata: { type: 'site_overage', tier: 'enterprise', platform: 'coaileague' },
  },
  interaction_overage: {
    name: 'CoAIleague AI Interaction Overage',
    description: 'Metered AI interaction overage above hard cap. Rate varies by tier.',
    metadata: { type: 'interaction_overage', platform: 'coaileague' },
  },
  payroll_processing: {
    name: 'CoAIleague Payroll Processing Fee',
    description: 'Internal payroll processing fee. $1.50–2.50/employee/run depending on tier. 60–75% less than ADP/Gusto/Paychex.',
    metadata: { type: 'payroll_fee', platform: 'coaileague' },
  },
  invoice_card_processing: {
    name: 'CoAIleague Card Payment Processing',
    description: 'Client invoice card payment processing. 2.0–2.4% + $0.15–0.25 depending on tier.',
    metadata: { type: 'invoice_card', platform: 'coaileague' },
  },
  invoice_ach_processing: {
    name: 'CoAIleague ACH Bank Transfer',
    description: 'Client invoice ACH bank transfer fee. $0.30–0.50/transaction depending on tier.',
    metadata: { type: 'invoice_ach', platform: 'coaileague' },
  },
  emergency_event_enterprise: {
    name: 'CoAIleague Emergency Event — Enterprise',
    description: 'Declared emergency event coverage — unlimited Trinity usage for 24–72 hours. Enterprise tier: $1,000 flat/event.',
    metadata: { type: 'emergency_event', tier: 'enterprise', platform: 'coaileague' },
  },
  emergency_event_strategic: {
    name: 'CoAIleague Emergency Event — Strategic',
    description: 'Declared emergency event coverage — unlimited Trinity usage for 24–72 hours. Strategic tier: $2,500 flat/event.',
    metadata: { type: 'emergency_event', tier: 'strategic', platform: 'coaileague' },
  },
};

// ── Price catalog ─────────────────────────────────────────────────────────────

const PRICES: PriceDef[] = [
  // ── STARTER ──────────────────────────────────────────────────────────────────
  {
    productName: 'starter',
    envVar: 'STRIPE_STARTER_MONTHLY_PRICE_ID',
    amount: 19900,        // $199/month
    currency: 'usd',
    interval: 'month',
    usageType: 'licensed',
    nickname: 'Starter Monthly ($199/mo)',
    metadata: { tier: 'starter', cycle: 'monthly' },
  },
  {
    productName: 'starter',
    envVar: 'STRIPE_STARTER_ANNUAL_PRICE_ID',
    amount: 199000,       // $1,990/year (2 months free)
    currency: 'usd',
    interval: 'year',
    usageType: 'licensed',
    nickname: 'Starter Annual ($1,990/yr)',
    metadata: { tier: 'starter', cycle: 'annual' },
  },

  // ── PROFESSIONAL ─────────────────────────────────────────────────────────────
  {
    productName: 'professional',
    envVar: 'STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID',
    amount: 74900,        // $749/month
    currency: 'usd',
    interval: 'month',
    usageType: 'licensed',
    nickname: 'Professional Monthly ($749/mo)',
    metadata: { tier: 'professional', cycle: 'monthly' },
  },
  {
    productName: 'professional',
    envVar: 'STRIPE_PROFESSIONAL_ANNUAL_PRICE_ID',
    amount: 749000,       // $7,490/year (2 months free)
    currency: 'usd',
    interval: 'year',
    usageType: 'licensed',
    nickname: 'Professional Annual ($7,490/yr)',
    metadata: { tier: 'professional', cycle: 'annual' },
  },

  // ── BUSINESS ─────────────────────────────────────────────────────────────────
  {
    productName: 'business',
    envVar: 'STRIPE_BUSINESS_MONTHLY_PRICE_ID',
    amount: 224900,       // $2,249/month
    currency: 'usd',
    interval: 'month',
    usageType: 'licensed',
    nickname: 'Business Monthly ($2,249/mo)',
    metadata: { tier: 'business', cycle: 'monthly' },
  },
  {
    productName: 'business',
    envVar: 'STRIPE_BUSINESS_ANNUAL_PRICE_ID',
    amount: 2249000,      // $22,490/year (2 months free)
    currency: 'usd',
    interval: 'year',
    usageType: 'licensed',
    nickname: 'Business Annual ($22,490/yr)',
    metadata: { tier: 'business', cycle: 'annual' },
  },

  // ── ENTERPRISE ───────────────────────────────────────────────────────────────
  {
    productName: 'enterprise',
    envVar: 'STRIPE_ENTERPRISE_MONTHLY_PRICE_ID',
    amount: 699900,       // $6,999/month
    currency: 'usd',
    interval: 'month',
    usageType: 'licensed',
    nickname: 'Enterprise Monthly ($6,999/mo)',
    metadata: { tier: 'enterprise', cycle: 'monthly' },
  },
  {
    productName: 'enterprise',
    envVar: 'STRIPE_ENTERPRISE_ANNUAL_PRICE_ID',
    amount: 6999000,      // $69,990/year (2 months free)
    currency: 'usd',
    interval: 'year',
    usageType: 'licensed',
    nickname: 'Enterprise Annual ($69,990/yr)',
    metadata: { tier: 'enterprise', cycle: 'annual' },
  },

  // ── SEAT OVERAGES ─────────────────────────────────────────────────────────────
  {
    productName: 'seat_overage_starter',
    envVar: 'STRIPE_STARTER_SEAT_OVERAGE_PRICE_ID',
    amount: 2000,         // $20/seat/month
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
    aggregateUsage: 'max',
    nickname: 'Starter Seat Overage ($20/seat/mo)',
    metadata: { type: 'seat_overage', tier: 'starter' },
  },
  {
    productName: 'seat_overage_professional',
    envVar: 'STRIPE_PROFESSIONAL_SEAT_OVERAGE_PRICE_ID',
    amount: 2500,         // $25/seat/month
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
    aggregateUsage: 'max',
    nickname: 'Professional Seat Overage ($25/seat/mo)',
    metadata: { type: 'seat_overage', tier: 'professional' },
  },
  {
    productName: 'seat_overage_business',
    envVar: 'STRIPE_BUSINESS_SEAT_OVERAGE_PRICE_ID',
    amount: 3000,         // $30/seat/month
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
    aggregateUsage: 'max',
    nickname: 'Business Seat Overage ($30/seat/mo)',
    metadata: { type: 'seat_overage', tier: 'business' },
  },
  {
    productName: 'seat_overage_enterprise',
    envVar: 'STRIPE_ENTERPRISE_SEAT_OVERAGE_PRICE_ID',
    amount: 3500,         // $35/seat/month
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
    aggregateUsage: 'max',
    nickname: 'Enterprise Seat Overage ($35/seat/mo)',
    metadata: { type: 'seat_overage', tier: 'enterprise' },
  },

  // ── SITE OVERAGES ─────────────────────────────────────────────────────────────
  {
    productName: 'site_overage_starter',
    envVar: 'STRIPE_STARTER_SITE_OVERAGE_PRICE_ID',
    amount: 4900,         // $49/site/month
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
    aggregateUsage: 'max',
    nickname: 'Starter Site Overage ($49/site/mo)',
    metadata: { type: 'site_overage', tier: 'starter' },
  },
  {
    productName: 'site_overage_professional',
    envVar: 'STRIPE_PROFESSIONAL_SITE_OVERAGE_PRICE_ID',
    amount: 4900,         // $49/site/month
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
    aggregateUsage: 'max',
    nickname: 'Professional Site Overage ($49/site/mo)',
    metadata: { type: 'site_overage', tier: 'professional' },
  },
  {
    productName: 'site_overage_business',
    envVar: 'STRIPE_BUSINESS_SITE_OVERAGE_PRICE_ID',
    amount: 3900,         // $39/site/month
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
    aggregateUsage: 'max',
    nickname: 'Business Site Overage ($39/site/mo)',
    metadata: { type: 'site_overage', tier: 'business' },
  },
  {
    productName: 'site_overage_enterprise',
    envVar: 'STRIPE_ENTERPRISE_SITE_OVERAGE_PRICE_ID',
    amount: 2900,         // $29/site/month
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
    aggregateUsage: 'max',
    nickname: 'Enterprise Site Overage ($29/site/mo)',
    metadata: { type: 'site_overage', tier: 'enterprise' },
  },

  // ── AI INTERACTION OVERAGES ───────────────────────────────────────────────────
  {
    productName: 'interaction_overage',
    envVar: 'STRIPE_STARTER_INTERACTION_OVERAGE_PRICE_ID',
    amount: 15,           // $0.15/interaction above hard cap
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
    aggregateUsage: 'sum',
    nickname: 'Starter Interaction Overage ($0.15/interaction)',
    metadata: { type: 'interaction_overage', tier: 'starter' },
  },
  {
    productName: 'interaction_overage',
    envVar: 'STRIPE_PROFESSIONAL_INTERACTION_OVERAGE_PRICE_ID',
    amount: 12,           // $0.12/interaction above hard cap
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
    aggregateUsage: 'sum',
    nickname: 'Professional Interaction Overage ($0.12/interaction)',
    metadata: { type: 'interaction_overage', tier: 'professional' },
  },
  {
    productName: 'interaction_overage',
    envVar: 'STRIPE_BUSINESS_INTERACTION_OVERAGE_PRICE_ID',
    amount: 10,           // $0.10/interaction above hard cap
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
    aggregateUsage: 'sum',
    nickname: 'Business Interaction Overage ($0.10/interaction)',
    metadata: { type: 'interaction_overage', tier: 'business' },
  },
  {
    productName: 'interaction_overage',
    envVar: 'STRIPE_ENTERPRISE_INTERACTION_OVERAGE_PRICE_ID',
    amount: 8,            // $0.08/interaction above hard cap
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
    aggregateUsage: 'sum',
    nickname: 'Enterprise Interaction Overage ($0.08/interaction)',
    metadata: { type: 'interaction_overage', tier: 'enterprise' },
  },

  // ── PAYROLL PROCESSING (metered, per employee per run) ────────────────────────
  {
    productName: 'payroll_processing',
    envVar: 'STRIPE_PROFESSIONAL_PAYROLL_PRICE_ID',
    amount: 250,          // $2.50/employee/run (Professional)
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
    aggregateUsage: 'sum',
    nickname: 'Payroll Fee — Professional ($2.50/employee/run)',
    metadata: { type: 'payroll_fee', tier: 'professional', per: 'employee_per_run' },
  },
  {
    productName: 'payroll_processing',
    envVar: 'STRIPE_BUSINESS_PAYROLL_PRICE_ID',
    amount: 175,          // $1.75/employee/run (Business)
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
    aggregateUsage: 'sum',
    nickname: 'Payroll Fee — Business ($1.75/employee/run)',
    metadata: { type: 'payroll_fee', tier: 'business', per: 'employee_per_run' },
  },
  {
    productName: 'payroll_processing',
    envVar: 'STRIPE_ENTERPRISE_PAYROLL_PRICE_ID',
    amount: 150,          // $1.50/employee/run (Enterprise)
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
    aggregateUsage: 'sum',
    nickname: 'Payroll Fee — Enterprise ($1.50/employee/run)',
    metadata: { type: 'payroll_fee', tier: 'enterprise', per: 'employee_per_run' },
  },

  // ── INVOICING CARD PROCESSING ─────────────────────────────────────────────────
  {
    productName: 'invoice_card_processing',
    envVar: 'STRIPE_PROFESSIONAL_CARD_RATE_PRICE_ID',
    amount: 25,           // $0.25 flat component (2.4% computed server-side)
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
    aggregateUsage: 'sum',
    nickname: 'Card Processing — Professional (2.4% + $0.25)',
    metadata: { type: 'invoice_card', tier: 'professional', pct: '2.4', flat_cents: '25' },
  },
  {
    productName: 'invoice_card_processing',
    envVar: 'STRIPE_BUSINESS_CARD_RATE_PRICE_ID',
    amount: 20,           // $0.20 flat component (2.2% computed server-side)
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
    aggregateUsage: 'sum',
    nickname: 'Card Processing — Business (2.2% + $0.20)',
    metadata: { type: 'invoice_card', tier: 'business', pct: '2.2', flat_cents: '20' },
  },
  {
    productName: 'invoice_card_processing',
    envVar: 'STRIPE_ENTERPRISE_CARD_RATE_PRICE_ID',
    amount: 15,           // $0.15 flat component (2.0% computed server-side)
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
    aggregateUsage: 'sum',
    nickname: 'Card Processing — Enterprise (2.0% + $0.15)',
    metadata: { type: 'invoice_card', tier: 'enterprise', pct: '2.0', flat_cents: '15' },
  },

  // ── ACH BANK TRANSFER FEES ────────────────────────────────────────────────────
  {
    productName: 'invoice_ach_processing',
    envVar: 'STRIPE_PROFESSIONAL_ACH_PRICE_ID',
    amount: 50,           // $0.50/ACH transaction (Professional)
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
    aggregateUsage: 'sum',
    nickname: 'ACH Transfer — Professional ($0.50/txn)',
    metadata: { type: 'invoice_ach', tier: 'professional' },
  },
  {
    productName: 'invoice_ach_processing',
    envVar: 'STRIPE_BUSINESS_ACH_PRICE_ID',
    amount: 40,           // $0.40/ACH transaction (Business)
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
    aggregateUsage: 'sum',
    nickname: 'ACH Transfer — Business ($0.40/txn)',
    metadata: { type: 'invoice_ach', tier: 'business' },
  },
  {
    productName: 'invoice_ach_processing',
    envVar: 'STRIPE_ENTERPRISE_ACH_PRICE_ID',
    amount: 30,           // $0.30/ACH transaction (Enterprise)
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
    aggregateUsage: 'sum',
    nickname: 'ACH Transfer — Enterprise ($0.30/txn)',
    metadata: { type: 'invoice_ach', tier: 'enterprise' },
  },

  // ── EMERGENCY EVENTS (one-time, billed as invoice items) ─────────────────────
  {
    productName: 'emergency_event_enterprise',
    envVar: 'STRIPE_EMERGENCY_EVENT_ENTERPRISE_PRICE_ID',
    amount: 100000,       // $1,000 flat per event
    currency: 'usd',
    isOneTime: true,
    nickname: 'Emergency Event — Enterprise ($1,000/event)',
    metadata: { type: 'emergency_event', tier: 'enterprise' },
  },
  {
    productName: 'emergency_event_strategic',
    envVar: 'STRIPE_EMERGENCY_EVENT_STRATEGIC_PRICE_ID',
    amount: 250000,       // $2,500 flat per event
    currency: 'usd',
    isOneTime: true,
    nickname: 'Emergency Event — Strategic ($2,500/event)',
    metadata: { type: 'emergency_event', tier: 'strategic' },
  },
];

// ── Helper: find or create product ───────────────────────────────────────────

async function ensureProduct(key: string, def: ProductDef): Promise<string> {
  const existing = await stripe.products.search({
    query: `metadata['platform']:'coaileague' AND name:'${def.name}'`,
    limit: 1,
  });

  if (existing.data.length > 0) {
    console.log(`  ✓ Product exists: ${def.name} (${existing.data[0].id})`);
    return existing.data[0].id;
  }

  const product = await stripe.products.create({
    name: def.name,
    description: def.description,
    metadata: def.metadata,
  });
  console.log(`  + Created product: ${def.name} (${product.id})`);
  return product.id;
}

// ── Helper: find or create price ─────────────────────────────────────────────

async function ensurePrice(productId: string, def: PriceDef): Promise<string> {
  const existing = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100,
  });

  const match = existing.data.find(p =>
    p.nickname === def.nickname || p.metadata?.envVar === def.envVar
  );

  if (match) {
    console.log(`  ✓ Price exists: ${def.nickname} (${match.id})`);
    return match.id;
  }

  const priceParams: Stripe.PriceCreateParams = {
    product: productId,
    currency: def.currency,
    nickname: def.nickname,
    metadata: { ...def.metadata, envVar: def.envVar },
  };

  if (def.isOneTime) {
    priceParams.unit_amount = def.amount!;
  } else if (def.interval) {
    priceParams.recurring = {
      interval: def.interval,
      usage_type: def.usageType || 'licensed',
    };
    if (def.usageType === 'metered' && def.aggregateUsage) {
      (priceParams.recurring as any).aggregate_usage = def.aggregateUsage;
    }
    priceParams.billing_scheme = 'per_unit';
    priceParams.unit_amount = def.amount!;
  }

  const price = await stripe.prices.create(priceParams);
  console.log(`  + Created price: ${def.nickname} (${price.id})`);
  return price.id;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('  CoAIleague — Stripe Products & Prices Setup');
  console.log('  Master Price List — March 2026');
  console.log('═'.repeat(70));

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('\nERROR: STRIPE_SECRET_KEY is not set. Set it in your Replit secrets first.\n');
    process.exit(1);
  }

  const mode = process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'LIVE' : 'TEST';
  console.log(`\nStripe mode: ${mode}`);
  if (mode === 'LIVE') {
    console.log('WARNING: Running against LIVE Stripe. Products will be created in production.');
  }
  console.log('');

  console.log('── Step 1: Products ─────────────────────────────────────────────────');
  const productIds: Record<string, string> = {};
  for (const [key, def] of Object.entries(PRODUCTS)) {
    productIds[key] = await ensureProduct(key, def);
  }

  console.log('\n── Step 2: Prices ───────────────────────────────────────────────────');
  const envVarMap: Record<string, string> = {};
  for (const priceDef of PRICES) {
    const productId = productIds[priceDef.productName];
    if (!productId) {
      console.error(`  ERROR: No product found for '${priceDef.productName}' — skipping ${priceDef.envVar}`);
      continue;
    }
    const priceId = await ensurePrice(productId, priceDef);
    envVarMap[priceDef.envVar] = priceId;
  }

  console.log('\n' + '═'.repeat(70));
  console.log('  COPY THESE INTO YOUR REPLIT SECRETS / .env FILE');
  console.log('═'.repeat(70) + '\n');

  for (const [envKey, priceId] of Object.entries(envVarMap)) {
    console.log(`${envKey}=${priceId}`);
  }

  console.log('\n' + '═'.repeat(70));
  console.log('  PRICING SUMMARY — CoAIleague Master Price List');
  console.log('═'.repeat(70));
  console.log(`
  SUBSCRIPTION TIERS
  ─────────────────────────────────────────────────────────────────
  Starter       $199/mo  | $1,990/yr  | 10 seats | 3 sites  | 5K interactions
  Professional  $749/mo  | $7,490/yr  | 30 seats | 10 sites | 20K interactions
  Business      $2,249/mo | $22,490/yr | 75 seats | 25 sites | 60K interactions
  Enterprise    $6,999/mo | $69,990/yr | 200 seats | 75 sites | 200K interactions
  Strategic     $15,000+ min — contact required — 300+ officers

  SEAT OVERAGES (monthly, metered)
  ─────────────────────────────────────────────────────────────────
  Starter       $20/seat/mo | $49/site/mo
  Professional  $25/seat/mo | $49/site/mo
  Business      $30/seat/mo | $39/site/mo
  Enterprise    $35/seat/mo | $29/site/mo

  PAYROLL PROCESSING (per employee per run)
  ─────────────────────────────────────────────────────────────────
  Professional  $2.50/employee/run  (ADP charges $8–15)
  Business      $1.75/employee/run
  Enterprise    $1.50/employee/run

  INVOICING FEES (card rate + ACH)
  ─────────────────────────────────────────────────────────────────
  Professional  2.4% + $0.25 card | $0.50 ACH
  Business      2.2% + $0.20 card | $0.40 ACH
  Enterprise    2.0% + $0.15 card | $0.30 ACH

  AI INTERACTION OVERAGES (above hard cap)
  ─────────────────────────────────────────────────────────────────
  Starter       $0.15/interaction (hard cap: 8,000/mo)
  Professional  $0.12/interaction (hard cap: 35,000/mo)
  Business      $0.10/interaction (hard cap: 120,000/mo)
  Enterprise    $0.08/interaction (hard cap: 400,000/mo)

  EMERGENCY EVENTS (one-time, Enterprise+ only)
  ─────────────────────────────────────────────────────────────────
  Enterprise    $1,000/event
  Strategic     $2,500/event
`);

  console.log('Setup complete. Configure the printed env vars in Replit Secrets.\n');
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
