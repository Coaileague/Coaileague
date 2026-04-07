/**
 * CoAIleague Master Price List — Stripe Full Sync Script
 * =======================================================
 * Creates all SUBSCRIPTION products and prices per the master price list.
 * Metered overage prices (seat, site, interaction, payroll, ACH) require
 * Stripe Billing Meters (new API as of 2025-03-31) and must be set up
 * manually in the Stripe Dashboard → Billing → Meters.
 *
 * This script handles:
 *   ✓ Monthly and annual subscription prices for all 5 tiers
 *   ✗ Metered overages — do these in Stripe Dashboard → Billing → Meters
 *
 * MASTER PRICE LIST:
 *   Trial:        $0 / 14 days / 10 seats / 500 interactions
 *   Starter:      $199/mo  | $1,990/yr  | 10 seats / 3 sites / 5K interactions
 *   Professional: $749/mo  | $7,490/yr  | 30 seats / 10 sites / 20K interactions
 *   Business:     $2,249/mo | $22,490/yr | 75 seats / 25 sites / 60K interactions
 *   Enterprise:   $6,999/mo | $69,990/yr | 200 seats / 75 sites / 200K interactions
 *   Strategic:    $15,000+ min / 300+ officers / contact required
 *
 * This script is IDEMPOTENT — safe to re-run.
 * Uses metadata['price_catalog'] tag for exact-match lookup to avoid
 * Stripe's fuzzy name search matching wrong products.
 *
 * Usage:
 *   npx tsx server/scripts/setup-new-pricing-products.ts
 */

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function findOrCreateProduct(
  name: string,
  description: string,
  tierKey: string,
  extraMetadata: Record<string, string> = {}
): Promise<string> {
  // Use a stable metadata tag for exact lookup — avoids Stripe's fuzzy name
  // search returning wrong products (e.g. "CoAIleague Starter" matching
  // "CoAIleague Starter Officer Overage (2026)")
  const tag = `master-2026-${tierKey}`;
  const results = await stripe.products.search({
    query: `metadata['price_catalog']:'${tag}'`,
  });

  if (results.data.length > 0) {
    const existing = results.data[0];
    console.log(`  [exists]  ${name} → ${existing.id}`);
    return existing.id;
  }

  const product = await stripe.products.create({
    name,
    description,
    metadata: {
      platform: 'coaileague',
      price_catalog: tag,
      tier: tierKey,
      ...extraMetadata,
    },
  });

  console.log(`  [created] ${name} → ${product.id}`);
  return product.id;
}

async function findOrCreateRecurringPrice(
  productId: string,
  unitAmountCents: number,
  interval: 'month' | 'year',
  nickname: string,
  metadata: Record<string, string> = {}
): Promise<string> {
  const list = await stripe.prices.list({ product: productId, active: true, limit: 100 });

  const existing = list.data.find(p =>
    p.unit_amount === unitAmountCents &&
    p.recurring?.interval === interval &&
    p.recurring?.usage_type === 'licensed' &&
    p.nickname === nickname
  );

  if (existing) {
    console.log(`    [exists]  ${nickname} → ${existing.id}`);
    return existing.id;
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: unitAmountCents,
    currency: 'usd',
    recurring: { interval, usage_type: 'licensed' },
    nickname,
    metadata,
  });

  console.log(`    [created] ${nickname} → ${price.id}`);
  return price.id;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  CoAIleague Stripe Master Price Sync');
  console.log('  (subscription prices only — overages via Meters)');
  console.log('═══════════════════════════════════════════════');
  console.log('');

  const envVars: Record<string, string> = {};

  // ────────────────────────────────────────────────────────────────────────────
  // TRIAL
  // ────────────────────────────────────────────────────────────────────────────
  console.log('📦 Trial');
  const trialProductId = await findOrCreateProduct(
    'CoAIleague Trial',
    '14-day free trial — full platform access up to 10 seats',
    'trial',
    { seats_included: '10', sites_included: '2', interactions_cap: '500', duration_days: '14' }
  );
  const trialFreeId = await findOrCreateRecurringPrice(
    trialProductId, 0, 'month', 'trial_free'
  );
  envVars['STRIPE_PRODUCT_ID_TRIAL'] = trialProductId;
  envVars['STRIPE_PRICE_ID_TRIAL_FREE'] = trialFreeId;

  // ────────────────────────────────────────────────────────────────────────────
  // STARTER — $199/mo | $1,910.40/yr (20% annual savings)
  // ────────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log('📦 Starter ($199/mo | $1,910.40/yr | 10 seats | 3 sites)');
  const starterProductId = await findOrCreateProduct(
    'CoAIleague Starter',
    'AI workforce management for small security companies — up to 10 seats, 3 sites',
    'starter',
    { seats_included: '10', sites_included: '3', interactions_monthly: '5000', hard_cap: '8000' }
  );
  const starterMonthlyId = await findOrCreateRecurringPrice(
    starterProductId, 19900, 'month', 'starter_monthly'
  );
  const starterAnnualId = await findOrCreateRecurringPrice(
    starterProductId, 191040, 'year', 'starter_annual'
  );
  envVars['STRIPE_PRODUCT_ID_STARTER'] = starterProductId;
  envVars['STRIPE_PRICE_ID_STARTER_MONTHLY'] = starterMonthlyId;
  envVars['STRIPE_PRICE_ID_STARTER_ANNUAL'] = starterAnnualId;

  // ────────────────────────────────────────────────────────────────────────────
  // PROFESSIONAL — $749/mo | $7,190.40/yr (20% annual savings)
  // ────────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log('📦 Professional ($749/mo | $7,190.40/yr | 30 seats | 10 sites)');
  const proProductId = await findOrCreateProduct(
    'CoAIleague Professional',
    'Full AI operations platform for growing security companies — up to 30 seats, 10 sites',
    'professional',
    { seats_included: '30', sites_included: '10', interactions_monthly: '20000', hard_cap: '35000' }
  );
  const proMonthlyId = await findOrCreateRecurringPrice(
    proProductId, 74900, 'month', 'professional_monthly'
  );
  const proAnnualId = await findOrCreateRecurringPrice(
    proProductId, 719040, 'year', 'professional_annual'
  );
  envVars['STRIPE_PRODUCT_ID_PROFESSIONAL'] = proProductId;
  envVars['STRIPE_PRICE_ID_PROFESSIONAL_MONTHLY'] = proMonthlyId;
  envVars['STRIPE_PRICE_ID_PROFESSIONAL_ANNUAL'] = proAnnualId;

  // ────────────────────────────────────────────────────────────────────────────
  // BUSINESS — $2,249/mo | $21,590.40/yr (20% annual savings)
  // ────────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log('📦 Business ($2,249/mo | $21,590.40/yr | 75 seats | 25 sites)');
  const bizProductId = await findOrCreateProduct(
    'CoAIleague Business',
    'Advanced AI operations for established security companies — up to 75 seats, 25 sites',
    'business',
    { seats_included: '75', sites_included: '25', interactions_monthly: '60000', hard_cap: '120000' }
  );
  const bizMonthlyId = await findOrCreateRecurringPrice(
    bizProductId, 224900, 'month', 'business_monthly'
  );
  const bizAnnualId = await findOrCreateRecurringPrice(
    bizProductId, 2159040, 'year', 'business_annual'
  );
  envVars['STRIPE_PRODUCT_ID_BUSINESS'] = bizProductId;
  envVars['STRIPE_PRICE_ID_BUSINESS_MONTHLY'] = bizMonthlyId;
  envVars['STRIPE_PRICE_ID_BUSINESS_ANNUAL'] = bizAnnualId;

  // ────────────────────────────────────────────────────────────────────────────
  // ENTERPRISE — $6,999/mo | $67,190.40/yr (20% annual savings)
  // ────────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log('📦 Enterprise ($6,999/mo | $67,190.40/yr | 200 seats | 75 sites)');
  const entProductId = await findOrCreateProduct(
    'CoAIleague Enterprise',
    'Maximum Trinity AI for large security operations — up to 200 seats, 75 sites',
    'enterprise',
    { seats_included: '200', sites_included: '75', interactions_monthly: '200000', hard_cap: '400000' }
  );
  const entMonthlyId = await findOrCreateRecurringPrice(
    entProductId, 699900, 'month', 'enterprise_monthly'
  );
  const entAnnualId = await findOrCreateRecurringPrice(
    entProductId, 6719040, 'year', 'enterprise_annual'
  );
  envVars['STRIPE_PRODUCT_ID_ENTERPRISE'] = entProductId;
  envVars['STRIPE_PRICE_ID_ENTERPRISE_MONTHLY'] = entMonthlyId;
  envVars['STRIPE_PRICE_ID_ENTERPRISE_ANNUAL'] = entAnnualId;

  // ────────────────────────────────────────────────────────────────────────────
  // STRATEGIC — contact / custom (no public price)
  // ────────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log('📦 Strategic (contact required | $15K+ min | 300+ officers)');
  const stratProductId = await findOrCreateProduct(
    'CoAIleague Strategic',
    'Custom enterprise solution for national security operations — 300+ officers, custom pricing',
    'strategic',
    { contact_required: 'true', minimum_monthly: '15000', no_public_price: 'true' }
  );
  // No public price for Strategic — checkout goes to sales contact form
  envVars['STRIPE_PRODUCT_ID_STRATEGIC'] = stratProductId;

  // ────────────────────────────────────────────────────────────────────────────
  // VERIFICATION MATRIX
  // ────────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  VERIFICATION MATRIX');
  console.log('═══════════════════════════════════════════════');
  console.log('');

  const checks: [string, string, number, string][] = [
    ['Starter',      'monthly', 19900,   starterMonthlyId],
    ['Starter',      'annual',  191040,  starterAnnualId],
    ['Professional', 'monthly', 74900,   proMonthlyId],
    ['Professional', 'annual',  719040,  proAnnualId],
    ['Business',     'monthly', 224900,  bizMonthlyId],
    ['Business',     'annual',  2159040, bizAnnualId],
    ['Enterprise',   'monthly', 699900,  entMonthlyId],
    ['Enterprise',   'annual',  6719040, entAnnualId],
  ];

  let allOk = true;
  for (const [tier, interval, expectedCents, priceId] of checks) {
    const price = await stripe.prices.retrieve(priceId);
    const match = price.unit_amount === expectedCents;
    if (!match) allOk = false;
    const expected = `$${(expectedCents / 100).toFixed(2)}`;
    const actual   = price.unit_amount !== null ? `$${(price.unit_amount / 100).toFixed(2)}` : 'null';
    console.log(`  ${match ? '✓' : '✗'} ${(tier + ' ' + interval).padEnd(25)} expected ${expected.padEnd(12)} got ${actual.padEnd(12)} ${priceId}`);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  ENV VARS — Copy to Replit Secrets');
  console.log('═══════════════════════════════════════════════');
  console.log('');
  for (const [key, val] of Object.entries(envVars)) {
    console.log(`${key}=${val}`);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  METERED OVERAGES — Set Up Manually');
  console.log('═══════════════════════════════════════════════');
  console.log('');
  console.log('  Stripe now requires Billing Meters for usage-based pricing.');
  console.log('  Go to: Stripe Dashboard → Billing → Meters → Create meter');
  console.log('');
  console.log('  Meters to create:');
  console.log('    seat_overage       — Seat overage (per seat above plan limit)');
  console.log('    site_overage       — Site overage (per site above plan limit)');
  console.log('    interaction_usage  — AI interactions (per interaction above hard cap)');
  console.log('    payroll_employee   — Payroll per employee per run');
  console.log('    direct_deposit     — Direct deposit per transaction');
  console.log('    tax_filing         — Quarterly tax filing fee');
  console.log('    year_end_form      — W-2/1099 per form');
  console.log('    ach_collection     — ACH invoice collection per transaction');
  console.log('    emergency_event    — On-call emergency dispatch');
  console.log('');
  console.log(`  Overall: ${allOk ? '✅ All subscription prices verified' : '⚠️  Some prices need review'}`);
  console.log('');
}

main().catch(err => {
  console.error('SCRIPT FAILED:', err);
  process.exit(1);
});
