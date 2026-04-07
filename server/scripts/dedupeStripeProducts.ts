/**
 * Live Stripe Product Deduplication
 * ==================================
 * Archives duplicate products created Apr 2 (prod_UGQM* set) in favour of
 * the original Mar 18/19 products (prod_UGPf* set).
 * Also archives legacy (2026) overage products.
 * 
 * SAFE: Checks for active subscriptions before archiving anything.
 * Run: npx tsx server/scripts/dedupeStripeProducts.ts
 */

import Stripe from 'stripe';

const LIVE_KEY = process.env.STRIPE_LIVE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
if (!LIVE_KEY?.startsWith('sk_live_')) {
  console.error('❌ Live Stripe key required (STRIPE_LIVE_SECRET_KEY). Aborting.');
  process.exit(1);
}

const stripe = new Stripe(LIVE_KEY, { apiVersion: '2025-09-30.clover' as any });

function sep(s: string) { console.log(`\n${'═'.repeat(64)}\n  ${s}\n${'═'.repeat(64)}`); }
function ok(s: string) { console.log(`  ✅ ${s}`); }
function skip(s: string) { console.log(`  ⚠️  SKIPPED: ${s}`); }
function info(s: string) { console.log(`     ${s}`); }

async function hasActiveSubscriptions(productId: string): Promise<number> {
  // Check prices on this product, then check subscriptions using each price
  const prices = await stripe.prices.list({ product: productId, limit: 10 });
  let count = 0;
  for (const price of prices.data) {
    const subs = await stripe.subscriptions.list({
      price: price.id, status: 'active', limit: 1,
    });
    count += subs.data.length;
    const trialing = await stripe.subscriptions.list({
      price: price.id, status: 'trialing', limit: 1,
    });
    count += trialing.data.length;
  }
  return count;
}

async function safeArchive(product: Stripe.Product, reason: string): Promise<void> {
  const activeSubs = await hasActiveSubscriptions(product.id);
  if (activeSubs > 0) {
    skip(`${product.id} (${product.name}) — has ${activeSubs} active subscription(s), cannot archive`);
    return;
  }
  await stripe.products.update(product.id, { active: false });
  ok(`Archived ${product.id} (${product.name}) — ${reason}`);
}

async function main() {
  sep('Live Stripe Product Dedup — Start');

  // Fetch all products (paginate through all)
  const allProducts: Stripe.Product[] = [];
  for await (const p of stripe.products.list({ limit: 100 })) {
    allProducts.push(p);
  }
  console.log(`  Found ${allProducts.length} total products (active + inactive)`);

  // ── 1. Group by normalized name, identify duplicates ─────────────────────
  sep('Step 1 — Identify duplicate core tier products');

  const TIER_NAMES = ['CoAIleague Trial', 'CoAIleague Starter', 'CoAIleague Professional',
                      'CoAIleague Business', 'CoAIleague Enterprise', 'CoAIleague Strategic'];

  for (const tierName of TIER_NAMES) {
    const matches = allProducts.filter(
      p => p.name === tierName && p.active
    ).sort((a, b) => a.created - b.created); // oldest first

    if (matches.length <= 1) {
      info(`${tierName}: ${matches.length === 1 ? `OK (${matches[0].id})` : 'not found'}`);
      continue;
    }

    const keeper = matches[0]; // oldest = original Mar 18/19
    const dupes = matches.slice(1); // newer ones = Apr 2 duplicates we created

    ok(`${tierName}: keeping ${keeper.id} (created ${new Date(keeper.created * 1000).toDateString()})`);
    for (const dupe of dupes) {
      info(`→ archiving ${dupe.id} (created ${new Date(dupe.created * 1000).toDateString()})`);
      await safeArchive(dupe, `duplicate of ${keeper.id}`);
    }
  }

  // ── 2. Archive (2026) legacy products ────────────────────────────────────
  sep('Step 2 — Archive legacy (2026) products');

  const legacyProducts = allProducts.filter(
    p => p.name.includes('(2026)') && p.active
  );

  if (legacyProducts.length === 0) {
    info('No (2026) legacy products found or already archived');
  } else {
    for (const p of legacyProducts) {
      await safeArchive(p, 'legacy (2026) product');
    }
  }

  // ── 3. Final clean state ──────────────────────────────────────────────────
  sep('Step 3 — Final active product list');

  const finalProducts: Stripe.Product[] = [];
  for await (const p of stripe.products.list({ active: true, limit: 100 })) {
    finalProducts.push(p);
  }

  for (const p of finalProducts.sort((a, b) => a.name.localeCompare(b.name))) {
    const prices = await stripe.prices.list({ product: p.id, active: true, limit: 10 });
    const priceSummary = prices.data.map(pr =>
      `${pr.nickname || pr.id} ($${(pr.unit_amount ?? 0) / 100}/${pr.recurring?.interval || 'one-time'})`
    ).join(', ');
    info(`${p.id}  ${p.name}  [${priceSummary || 'no active prices'}]`);
  }

  sep('✅ Dedup complete');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
