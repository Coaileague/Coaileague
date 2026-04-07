/**
 * Stripe Test Sandbox — Full Product + Billing History Seeder
 * ===========================================================
 * Creates all 5 CoAIleague products with monthly + annual prices in Stripe
 * test mode (matching live), then seeds 1 month of realistic billing history
 * for ACME (Starter) and Anvil (Professional) including overage invoices.
 *
 * Usage: npx tsx server/scripts/seedStripeTestProducts.ts
 * (Run while dev server is active on port 5000)
 *
 * SAFE: Test mode only. Never touches live keys or SPS workspace.
 */

import Stripe from 'stripe';
import { db } from '../db';
import { workspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
const LOCAL_WEBHOOK = 'http://localhost:5000/api/stripe/webhook';

const TEST_KEY = process.env.STRIPE_TEST_API_KEY
  || process.env.TESTING_STRIPE_SECRET_KEY;

if (!TEST_KEY || TEST_KEY.startsWith('sk_live_')) {
  console.error('❌ STRIPE_TEST_API_KEY (sk_test_...) required. Set it in Secrets and retry.');
  process.exit(1);
}
if (!WEBHOOK_SECRET) {
  console.error('❌ STRIPE_WEBHOOK_SECRET not set. Aborting.');
  process.exit(1);
}

const stripe = new Stripe(TEST_KEY, { apiVersion: '2025-09-30.clover' as any });

// ── Pricing catalogue (mirrors billingConfig.ts exactly) ─────────────────────
const CATALOGUE = [
  {
    key: 'TRIAL',
    name: 'CoAIleague Trial',
    description: '14-day free trial — full access to Trinity AI automation',
    metadata: { tier: 'trial' },
    prices: [
      { nickname: 'Trial Free', amount: 0, interval: 'month' as const, envKey: 'STRIPE_TEST_PRICE_ID_TRIAL_FREE' },
    ],
  },
  {
    key: 'STARTER',
    name: 'CoAIleague Starter',
    description: 'AI-powered workforce management for growing security companies',
    metadata: { tier: 'starter' },
    prices: [
      { nickname: 'Starter Monthly', amount: 29900, interval: 'month' as const, envKey: 'STRIPE_TEST_PRICE_ID_STARTER_MONTHLY' },
      { nickname: 'Starter Annual', amount: 287040, interval: 'year' as const, envKey: 'STRIPE_TEST_PRICE_ID_STARTER_ANNUAL' },
    ],
  },
  {
    key: 'PROFESSIONAL',
    name: 'CoAIleague Professional',
    description: 'Full Trinity AI suite for established security operations',
    metadata: { tier: 'professional' },
    prices: [
      { nickname: 'Professional Monthly', amount: 99900, interval: 'month' as const, envKey: 'STRIPE_TEST_PRICE_ID_PROFESSIONAL_MONTHLY' },
      { nickname: 'Professional Annual', amount: 959040, interval: 'year' as const, envKey: 'STRIPE_TEST_PRICE_ID_PROFESSIONAL_ANNUAL' },
    ],
  },
  {
    key: 'BUSINESS',
    name: 'CoAIleague Business',
    description: 'Enterprise-grade security workforce management at scale',
    metadata: { tier: 'business' },
    prices: [
      { nickname: 'Business Monthly', amount: 299900, interval: 'month' as const, envKey: 'STRIPE_TEST_PRICE_ID_BUSINESS_MONTHLY' },
      { nickname: 'Business Annual', amount: 2879040, interval: 'year' as const, envKey: 'STRIPE_TEST_PRICE_ID_BUSINESS_ANNUAL' },
    ],
  },
  {
    key: 'ENTERPRISE',
    name: 'CoAIleague Enterprise',
    description: 'Custom AI deployment for large security organizations (300+ officers)',
    metadata: { tier: 'enterprise' },
    prices: [
      { nickname: 'Enterprise Monthly', amount: 799900, interval: 'month' as const, envKey: 'STRIPE_TEST_PRICE_ID_ENTERPRISE_MONTHLY' },
      { nickname: 'Enterprise Annual', amount: 7679040, interval: 'year' as const, envKey: 'STRIPE_TEST_PRICE_ID_ENTERPRISE_ANNUAL' },
    ],
  },
] as const;

// Overage price: $25/employee/month
const OVERAGE_PRICE_ENV = 'STRIPE_TEST_PRICE_ID_OVERAGE';
const OVERAGE_AMOUNT = 2500; // $25 in cents

function sep(label: string) {
  console.log(`\n${'═'.repeat(64)}\n  ${label}\n${'═'.repeat(64)}`);
}
function log(msg: string, data?: any) {
  console.log(`  ${msg}`, data ? JSON.stringify(data, null, 4).split('\n').map(l => '  ' + l).join('\n') : '');
}
function ok(msg: string) { console.log(`  ✅ ${msg}`); }
function warn(msg: string) { console.log(`  ⚠️  ${msg}`); }

// ── Webhook helper ─────────────────────────────────────────────────────────
async function fireWebhook(event: object): Promise<void> {
  const payload = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const sig = `t=${ts},v1=${crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${ts}.${payload}`).digest('hex')}`;
  const res = await fetch(LOCAL_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': sig },
    body: payload,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Webhook ${(event as any).type} failed ${res.status}: ${text}`);
  ok(`Webhook ${(event as any).type} → ${res.status} OK`);
}

// ── Create/find a test payment method via tok_visa ─────────────────────────
async function ensurePaymentMethod(customerId: string): Promise<string> {
  const pm = await stripe.paymentMethods.create({ type: 'card', card: { token: 'tok_visa' } as any });
  await stripe.paymentMethods.attach(pm.id, { customer: customerId });
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm.id } });
  log(`Payment method attached`, { pmId: pm.id, brand: pm.card?.brand, last4: pm.card?.last4 });
  return pm.id;
}

// ── Resolve or create a Stripe customer for a workspace ───────────────────
async function ensureCustomer(ws: any, email: string): Promise<string> {
  if (ws.stripeCustomerId?.startsWith('cus_')) {
    try {
      const c = await stripe.customers.retrieve(ws.stripeCustomerId);
      if (!c.deleted) { log(`Reusing customer`, { id: c.id }); return c.id; }
    } catch { /* fall through */ }
  }
  const c = await stripe.customers.create({
    name: ws.name,
    email,
    metadata: { workspaceId: ws.id, environment: 'test_sandbox' },
  });
  log(`Created customer`, { id: c.id, email });
  await db.update(workspaces).set({ stripeCustomerId: c.id } as any).where(eq(workspaces.id, ws.id));
  return c.id;
}

// ── Step 1: Sync all products + prices to test mode ───────────────────────
async function syncProducts(): Promise<Map<string, string>> {
  sep('Step 1 — Sync all products + prices to test sandbox');
  const priceMap = new Map<string, string>(); // envKey → priceId

  // Fetch existing test products
  const existingProds = await stripe.products.list({ active: true, limit: 100 });
  const existingPrices = await stripe.prices.list({ active: true, limit: 100 });

  for (const item of CATALOGUE) {
    log(`\n  Product: ${item.name}`);

    // Find or create product
    let product = existingProds.data.find(
      p => p.name === item.name || p.metadata?.tier === item.metadata.tier
    );
    if (!product) {
      product = await stripe.products.create({
        name: item.name,
        description: item.description,
        metadata: { ...item.metadata, environment: 'test_sandbox' },
      });
      ok(`Created product ${product.id}`);
    } else {
      ok(`Found existing product ${product.id}`);
    }

    // Find or create each price
    for (const priceSpec of item.prices) {
      const match = existingPrices.data.find(
        p =>
          p.product === product!.id &&
          p.recurring?.interval === priceSpec.interval &&
          (p.unit_amount ?? 0) === priceSpec.amount &&
          p.currency === 'usd'
      );
      let priceId: string;
      if (match) {
        priceId = match.id;
        ok(`  Found price ${match.id} (${priceSpec.nickname} $${priceSpec.amount / 100}/${priceSpec.interval})`);
      } else {
        const created = await stripe.prices.create({
          product: product!.id,
          nickname: priceSpec.nickname,
          unit_amount: priceSpec.amount,
          currency: 'usd',
          recurring: { interval: priceSpec.interval },
          metadata: { ...item.metadata, billing_cycle: priceSpec.interval, environment: 'test_sandbox' },
        });
        priceId = created.id;
        ok(`  Created price ${created.id} (${priceSpec.nickname} $${priceSpec.amount / 100}/${priceSpec.interval})`);
      }
      priceMap.set(priceSpec.envKey, priceId);
    }
  }

  // Overage price (metered per-seat)
  const overageProd = existingProds.data.find(p => p.metadata?.type === 'overage') ||
    await stripe.products.create({
      name: 'CoAIleague Employee Overage',
      description: '$25 per additional employee beyond plan limit',
      metadata: { type: 'overage', environment: 'test_sandbox' },
    });
  const overagePrice = existingPrices.data.find(
    p => p.product === overageProd.id && p.billing_scheme === 'per_unit' && (p.unit_amount ?? 0) === OVERAGE_AMOUNT
  ) || await stripe.prices.create({
    product: overageProd.id,
    nickname: 'Employee Overage $25/seat',
    unit_amount: OVERAGE_AMOUNT,
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: { type: 'overage', environment: 'test_sandbox' },
  });
  priceMap.set(OVERAGE_PRICE_ENV, overagePrice.id);
  ok(`Overage price: ${overagePrice.id}`);

  return priceMap;
}

// ── Step 2: ACME — Starter $299/month + 5-seat overage ───────────────────
async function seedAcme(priceMap: Map<string, string>): Promise<void> {
  sep('Step 2 — ACME Security Services (Starter, $299/month)');
  const [acme] = await db.select().from(workspaces).where(eq(workspaces.id, 'dev-acme-security-ws')).limit(1);
  if (!acme) { warn('ACME workspace not found — skipping'); return; }

  const starterMonthlyPrice = priceMap.get('STRIPE_TEST_PRICE_ID_STARTER_MONTHLY')!;
  const customerId = await ensureCustomer(acme, 'owner@acme-security-test.com');
  await ensurePaymentMethod(customerId);

  // Cancel old incorrect subscription if still active
  const existingSubId = (acme as any).stripeSubscriptionId as string | undefined;
  if (existingSubId?.startsWith('sub_')) {
    try {
      const existingSub = await stripe.subscriptions.retrieve(existingSubId);
      if (['active', 'trialing'].includes(existingSub.status)) {
        // Check if it's on the correct price
        const currentPriceId = existingSub.items.data[0]?.price?.id;
        if (currentPriceId === starterMonthlyPrice) {
          ok(`Reusing existing correct Starter subscription ${existingSubId}`);
          await fireMonthlyBillingCycle(customerId, existingSubId, 'dev-acme-security-ws', 'starter', 29900, 5, priceMap);
          return;
        }
        warn(`Cancelling old subscription ${existingSubId} (wrong price: ${currentPriceId})`);
        await stripe.subscriptions.cancel(existingSubId);
      }
    } catch { /* already gone */ }
  }

  // Create subscription at correct price
  const sub = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: starterMonthlyPrice }],
    metadata: { workspaceId: 'dev-acme-security-ws', tier: 'starter' },
    expand: ['latest_invoice'],
  });
  ok(`Created Starter subscription ${sub.id} ($299/month)`);

  await db.update(workspaces)
    .set({ stripeSubscriptionId: sub.id, stripeCustomerId: customerId } as any)
    .where(eq(workspaces.id, 'dev-acme-security-ws'));

  await fireMonthlyBillingCycle(customerId, sub.id, 'dev-acme-security-ws', 'starter', 29900, 5, priceMap);
}

// ── Step 3: Anvil — Professional $999/month + 10-seat overage ────────────
async function seedAnvil(priceMap: Map<string, string>): Promise<void> {
  sep('Step 3 — Anvil Security Group (Professional, $999/month)');
  const [anvil] = await db.select().from(workspaces).where(eq(workspaces.id, 'dev-anvil-security-ws')).limit(1);
  if (!anvil) { warn('Anvil workspace not found — skipping'); return; }

  const proMonthlyPrice = priceMap.get('STRIPE_TEST_PRICE_ID_PROFESSIONAL_MONTHLY')!;
  const customerId = await ensureCustomer(anvil, 'owner@anvil-security-test.com');
  await ensurePaymentMethod(customerId);

  let subId: string;
  const existingSubId = (anvil as any).stripeSubscriptionId as string | undefined;
  if (existingSubId?.startsWith('sub_')) {
    try {
      const existingSub = await stripe.subscriptions.retrieve(existingSubId);
      if (['active', 'trialing'].includes(existingSub.status)) {
        subId = existingSub.id;
        ok(`Reusing existing Professional subscription ${subId}`);
        await fireMonthlyBillingCycle(customerId, subId, 'dev-anvil-security-ws', 'professional', 99900, 10, priceMap);
        return;
      }
    } catch { /* create fresh */ }
  }

  const sub = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: proMonthlyPrice }],
    metadata: { workspaceId: 'dev-anvil-security-ws', tier: 'professional' },
    expand: ['latest_invoice'],
  });
  subId = sub.id;
  ok(`Created Professional subscription ${sub.id} ($999/month)`);

  await db.update(workspaces)
    .set({ stripeSubscriptionId: sub.id, stripeCustomerId: customerId } as any)
    .where(eq(workspaces.id, 'dev-anvil-security-ws'));

  await fireMonthlyBillingCycle(customerId, subId, 'dev-anvil-security-ws', 'professional', 99900, 10, priceMap);
}

// ── Fire a full monthly billing cycle via webhooks ────────────────────────
async function fireMonthlyBillingCycle(
  customerId: string,
  subscriptionId: string,
  workspaceId: string,
  tier: string,
  baseAmountCents: number,
  overageEmployees: number,
  priceMap: Map<string, string>,
): Promise<void> {
  const overagePriceId = priceMap.get(OVERAGE_PRICE_ENV)!;
  const overageAmount = overageEmployees * OVERAGE_AMOUNT;
  const now = Math.floor(Date.now() / 1000);
  const periodStart = now - 30 * 24 * 60 * 60;
  const periodEnd = now;

  log(`\n  Firing billing cycle for ${workspaceId} (${tier})`);
  log(`  Base: $${baseAmountCents / 100} | Overage: ${overageEmployees} seats × $25 = $${overageAmount / 100}`);

  // 1. subscription.created
  await fireWebhook({
    id: `evt_test_sub_created_${Date.now()}`,
    object: 'event', type: 'customer.subscription.created',
    created: periodStart, livemode: false,
    data: {
      object: {
        id: subscriptionId, object: 'subscription', customer: customerId,
        status: 'active',
        items: { data: [{ price: { id: priceMap.get(`STRIPE_TEST_PRICE_ID_${tier.toUpperCase()}_MONTHLY`), recurring: { interval: 'month' } } }] },
        current_period_start: periodStart, current_period_end: periodEnd,
        metadata: { workspaceId, tier },
      },
    },
  });
  await delay(200);

  // 2. invoice.payment_succeeded — base subscription
  const baseInvoiceId = `in_test_base_${Date.now()}`;
  await fireWebhook({
    id: `evt_test_inv_base_${Date.now()}`,
    object: 'event', type: 'invoice.payment_succeeded',
    created: periodStart + 60, livemode: false,
    data: {
      object: {
        id: baseInvoiceId, object: 'invoice', customer: customerId,
        subscription: subscriptionId, status: 'paid',
        amount_paid: baseAmountCents, currency: 'usd',
        period_start: periodStart, period_end: periodEnd,
        description: `${tier.charAt(0).toUpperCase() + tier.slice(1)} plan — monthly subscription`,
        lines: {
          data: [{
            amount: baseAmountCents, currency: 'usd',
            description: `1 × ${tier.charAt(0).toUpperCase() + tier.slice(1)} Monthly`,
            period: { start: periodStart, end: periodEnd },
          }],
        },
        metadata: { workspaceId, invoiceType: 'subscription' },
      },
    },
  });
  await delay(200);

  // 3. invoice.payment_succeeded — employee overage
  const overageInvoiceId = `in_test_ovg_${Date.now()}`;
  await fireWebhook({
    id: `evt_test_inv_ovg_${Date.now()}`,
    object: 'event', type: 'invoice.payment_succeeded',
    created: periodStart + 86400 * 5, livemode: false,
    data: {
      object: {
        id: overageInvoiceId, object: 'invoice', customer: customerId,
        subscription: subscriptionId, status: 'paid',
        amount_paid: overageAmount, currency: 'usd',
        period_start: periodStart, period_end: periodEnd,
        description: `Employee overage — ${overageEmployees} additional seats × $25`,
        lines: {
          data: [{
            amount: overageAmount, currency: 'usd',
            price: { id: overagePriceId },
            quantity: overageEmployees,
            description: `${overageEmployees} additional employees × $25/seat`,
            period: { start: periodStart, end: periodEnd },
          }],
        },
        metadata: { workspaceId, invoiceType: 'overage', overageEmployees: String(overageEmployees) },
      },
    },
  });
  await delay(200);

  // 4. customer.subscription.updated — confirms active state
  await fireWebhook({
    id: `evt_test_sub_updated_${Date.now()}`,
    object: 'event', type: 'customer.subscription.updated',
    created: now, livemode: false,
    data: {
      object: {
        id: subscriptionId, object: 'subscription', customer: customerId,
        status: 'active', metadata: { workspaceId, tier },
      },
      previous_attributes: { status: 'active' },
    },
  });

  const total = baseAmountCents + overageAmount;
  ok(`Billing cycle complete — total charged: $${total / 100} (base $${baseAmountCents / 100} + overage $${overageAmount / 100})`);
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Final DB + Stripe dashboard summary ───────────────────────────────────
async function printSummary(priceMap: Map<string, string>): Promise<void> {
  sep('Summary — Test Sandbox State');

  const ws = await db.select().from(workspaces);
  for (const w of ws) {
    const any = w as any;
    if (!['dev-acme-security-ws', 'dev-anvil-security-ws'].includes(any.id)) continue;
    console.log(`\n  ${any.name} (${any.id})`);
    console.log(`    Tier:           ${any.subscriptionTier}`);
    console.log(`    Status:         ${any.subscriptionStatus}`);
    console.log(`    Stripe Customer:${any.stripeCustomerId}`);
    console.log(`    Stripe Sub:     ${any.stripeSubscriptionId}`);
  }

  console.log('\n\n  Test Price IDs (save these as env vars):');
  console.log('  ' + '─'.repeat(60));
  for (const [key, val] of priceMap.entries()) {
    console.log(`    ${key}=${val}`);
  }

  console.log('\n\n  Stripe Test Dashboard Links:');
  console.log('  ' + '─'.repeat(60));
  console.log('    All customers:     https://dashboard.stripe.com/test/customers');
  console.log('    All products:      https://dashboard.stripe.com/test/products');
  console.log('    All subscriptions: https://dashboard.stripe.com/test/subscriptions');
  console.log('    All invoices:      https://dashboard.stripe.com/test/invoices');

  // Write price map to a local file for env var import
  const outPath = path.join(process.cwd(), '.stripe-test-prices.json');
  fs.writeFileSync(outPath, JSON.stringify(Object.fromEntries(priceMap), null, 2));
  console.log(`\n  Price map saved to: ${outPath}`);
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  sep('CoAIleague Stripe Test Seeder — Start');
  console.log(`  Using test key: sk_test_...${TEST_KEY.slice(-6)}`);
  console.log(`  Webhook target: ${LOCAL_WEBHOOK}`);

  const priceMap = await syncProducts();
  await seedAcme(priceMap);
  await seedAnvil(priceMap);
  await printSummary(priceMap);

  sep('✅ All done — test sandbox fully seeded');
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ Seeder failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
