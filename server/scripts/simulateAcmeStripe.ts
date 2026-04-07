/**
 * ACME Sandbox Stripe Simulation
 * ==============================
 * Simulates a full subscription lifecycle for the ACME workspace using
 * the Stripe TEST sandbox. Creates a real test customer, subscription,
 * and fires real webhook events back to our own running server.
 *
 * Usage: npx tsx server/scripts/simulateAcmeStripe.ts
 * (Run while the dev server is active on port 5000)
 */

import Stripe from 'stripe';
import { db } from '../db';
import { workspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

const ACME_WS_ID = 'dev-acme-security-ws';
const LOCAL_WEBHOOK_URL = 'http://localhost:5000/api/stripe/webhook';
// Live price IDs won't exist in test mode — we resolve or create one at runtime
const CONFIGURED_PRICE_ID = process.env.STRIPE_STARTER_MONTHLY_PRICE_ID || process.env.STRIPE_PRICE_ID_STARTER_MONTHLY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Use test key explicitly — STRIPE_SECRET_KEY may be the live key
const TEST_API_KEY = process.env.STRIPE_TEST_API_KEY
  || process.env.TESTING_STRIPE_SECRET_KEY
  || process.env.STRIPE_SECRET_KEY; // fallback (if it happens to be test)

function log(msg: string, data?: any) {
  console.log(`\n[ACME-SIM] ${msg}`, data ? JSON.stringify(data, null, 2) : '');
}

function sep(label: string) {
  console.log(`\n${'─'.repeat(60)}\n  ${label}\n${'─'.repeat(60)}`);
}

async function signAndDeliverWebhook(stripe: Stripe, event: object): Promise<void> {
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const sig = crypto
    .createHmac('sha256', WEBHOOK_SECRET!)
    .update(signedPayload)
    .digest('hex');
  const stripeSignature = `t=${timestamp},v1=${sig}`;

  const response = await fetch(LOCAL_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': stripeSignature,
    },
    body: payload,
  });

  const text = await response.text();
  log(`Webhook delivery: ${response.status} ${response.statusText}`, { response: text });
  if (!response.ok) {
    throw new Error(`Webhook delivery failed: ${response.status} ${text}`);
  }
}

/**
 * Returns a valid test-mode price ID for the Starter monthly plan.
 * First tries the configured price ID (may be a live ID — won't work in test mode).
 * If that fails, looks for an existing "CoAIleague Starter" product in test mode
 * and uses its first price. If none exists, creates a product + price on the fly.
 */
async function resolveTestPriceId(stripe: Stripe): Promise<string> {
  // 1. Try the configured price ID first
  if (CONFIGURED_PRICE_ID) {
    try {
      await stripe.prices.retrieve(CONFIGURED_PRICE_ID);
      log(`Using configured price ID: ${CONFIGURED_PRICE_ID}`);
      return CONFIGURED_PRICE_ID;
    } catch {
      log(`Configured price ${CONFIGURED_PRICE_ID} not found in test mode — will create a test price`);
    }
  }

  // 2. Search for existing test Starter product
  const products = await stripe.products.list({ active: true, limit: 20 });
  const starterProduct = products.data.find(
    p => p.name.toLowerCase().includes('starter') && p.metadata?.tier === 'starter'
  );

  if (starterProduct) {
    const prices = await stripe.prices.list({ product: starterProduct.id, active: true, limit: 5 });
    const monthly = prices.data.find(p => p.recurring?.interval === 'month');
    if (monthly) {
      log(`Found existing test Starter price: ${monthly.id}`);
      return monthly.id;
    }
  }

  // 3. Create a minimal test product + price
  log('Creating test Starter product + $199/month price in Stripe test mode...');
  const product = starterProduct || await stripe.products.create({
    name: 'CoAIleague Starter',
    metadata: { tier: 'starter', environment: 'test_sandbox' },
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 19900,
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: { tier: 'starter', environment: 'test_sandbox' },
  });
  log(`Created test price: ${price.id} ($${price.unit_amount! / 100}/month)`);
  return price.id;
}

async function main() {
  sep('ACME Stripe Simulation — Start');

  if (!TEST_API_KEY) {
    console.error('❌ No Stripe test API key found (tried STRIPE_TEST_API_KEY, TESTING_STRIPE_SECRET_KEY, STRIPE_SECRET_KEY). Aborting.');
    process.exit(1);
  }
  const isLiveKey = TEST_API_KEY.startsWith('sk_live_');
  if (isLiveKey) {
    console.warn('⚠️  WARNING: Only live key found. Using live key — tok_visa test tokens will NOT work.');
    console.warn('   This simulation will fire webhook events locally but cannot create real test Stripe objects.');
    console.warn('   Add STRIPE_TEST_API_KEY (sk_test_...) to Secrets for full sandbox simulation.\n');
  } else {
    log(`Using test key: sk_test_...${TEST_API_KEY.slice(-6)}`);
  }
  if (!WEBHOOK_SECRET) {
    console.error('❌ STRIPE_WEBHOOK_SECRET not set. Aborting.');
    process.exit(1);
  }

  const stripe = new Stripe(TEST_API_KEY!, {
    apiVersion: '2025-09-30.clover' as any,
  });

  // ── 1. Look up ACME workspace ─────────────────────────────────────────────
  sep('Step 1: Fetch ACME workspace from DB');
  const [acme] = await db.select().from(workspaces).where(eq(workspaces.id, ACME_WS_ID)).limit(1);
  if (!acme) {
    console.error(`❌ Workspace ${ACME_WS_ID} not found in DB`);
    process.exit(1);
  }
  log('ACME workspace found', {
    id: acme.id,
    name: acme.name,
    tier: (acme as any).subscriptionTier,
    stripeCustomerId: (acme as any).stripeCustomerId,
    stripeSubscriptionId: (acme as any).stripeSubscriptionId,
  });

  // ── 2. Create or reuse test Stripe customer ───────────────────────────────
  sep('Step 2: Create test Stripe customer');
  let customerId = (acme as any).stripeCustomerId as string | undefined;
  let customer: Stripe.Customer;

  if (customerId?.startsWith('cus_')) {
    try {
      const existing = await stripe.customers.retrieve(customerId);
      if (!existing.deleted) {
        customer = existing as Stripe.Customer;
        log('Reusing existing test customer', { id: customer.id, email: customer.email });
      } else {
        customerId = undefined;
      }
    } catch {
      customerId = undefined;
    }
  }

  if (!customerId) {
    customer = await stripe.customers.create({
      name: acme.name || 'ACME Security',
      email: 'owner@acme-security-test.com',
      metadata: { workspaceId: ACME_WS_ID, environment: 'test_sandbox' },
    });
    customerId = customer.id;
    log('Created new test customer', { id: customer.id });

    // Update workspace with the new customer ID
    await db.update(workspaces)
      .set({ stripeCustomerId: customer.id } as any)
      .where(eq(workspaces.id, ACME_WS_ID));
    log('Updated ACME workspace stripeCustomerId in DB');
  } else {
    // customer was already set above
  }

  // ── 3. Add a test payment method ─────────────────────────────────────────
  sep('Step 3: Attach test payment method (4242 card)');
  let pmId: string;
  if (isLiveKey) {
    log('Skipping real payment method (live key) — webhook simulation will proceed without it');
    pmId = 'pm_sim_visa_4242';
  } else {
    // Use tok_visa (Stripe's pre-built test token) — raw card numbers are blocked by the API
    const pm = await stripe.paymentMethods.create({
      type: 'card',
      card: { token: 'tok_visa' } as any,
    });
    await stripe.paymentMethods.attach(pm.id, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: pm.id },
    });
    pmId = pm.id;
    log('Payment method attached', { pmId: pm.id, brand: pm.card?.brand, last4: pm.card?.last4 });
  }

  // ── 4. Create Stripe test subscription ───────────────────────────────────
  let TEST_PRICE_ID: string;
  if (!isLiveKey) {
    TEST_PRICE_ID = await resolveTestPriceId(stripe);
  } else {
    TEST_PRICE_ID = CONFIGURED_PRICE_ID || 'price_sim_starter_monthly';
  }
  sep(`Step 4: Create Stripe Starter subscription (${TEST_PRICE_ID})`);
  let subscriptionId: string;
  let invoiceId: string;

  if (isLiveKey) {
    subscriptionId = `sub_sim_acme_starter_${Date.now()}`;
    invoiceId = `in_sim_acme_${Date.now()}`;
    log('Live key detected — using simulated subscription/invoice IDs for webhook events', { subscriptionId, invoiceId });
  } else {
    const existingSubId = (acme as any).stripeSubscriptionId as string | undefined;
    let subscription: Stripe.Subscription | null = null;

    if (existingSubId?.startsWith('sub_')) {
      try {
        const existingSub = await stripe.subscriptions.retrieve(existingSubId);
        if (existingSub.status === 'active' || existingSub.status === 'trialing') {
          subscription = existingSub;
          log('Reusing existing active test subscription', { id: subscription.id, status: subscription.status });
        }
      } catch { /* fall through to create */ }
    }

    if (!subscription) {
      subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: TEST_PRICE_ID }],
        default_payment_method: pmId,
        metadata: { workspaceId: ACME_WS_ID, tier: 'starter' },
        expand: ['latest_invoice'],
      });
      log('Created new test subscription', { id: subscription.id, status: subscription.status });
    }

    subscriptionId = subscription.id;
    invoiceId = (subscription as any).latest_invoice?.id || `in_auto_${Date.now()}`;

    // Update workspace with subscription ID
    await db.update(workspaces)
      .set({ stripeSubscriptionId: subscriptionId } as any)
      .where(eq(workspaces.id, ACME_WS_ID));
    log('Updated ACME workspace stripeSubscriptionId in DB');
  }

  // ── 5. Fire webhook events locally ───────────────────────────────────────
  sep('Step 5: Fire webhook events to local server');

  // Build minimal-but-valid Stripe event objects
  const now = Math.floor(Date.now() / 1000);
  const periodStart = now;
  const periodEnd = now + 30 * 24 * 60 * 60; // +30 days

  // 5a. customer.subscription.created
  const subCreatedEvent = {
    id: `evt_sim_sub_created_${Date.now()}`,
    object: 'event',
    type: 'customer.subscription.created',
    created: now,
    livemode: false,
    data: {
      object: {
        id: subscriptionId,
        object: 'subscription',
        customer: customerId,
        status: 'active',
        items: { data: [{ price: { id: TEST_PRICE_ID, recurring: { interval: 'month' } } }] },
        current_period_start: periodStart,
        current_period_end: periodEnd,
        metadata: { workspaceId: ACME_WS_ID, tier: 'starter' },
      },
    },
  };
  log('Firing customer.subscription.created');
  await signAndDeliverWebhook(stripe, subCreatedEvent);

  // 5b. invoice.payment_succeeded
  const invoiceSucceededEvent = {
    id: `evt_sim_inv_paid_${Date.now()}`,
    object: 'event',
    type: 'invoice.payment_succeeded',
    created: now,
    livemode: false,
    data: {
      object: {
        id: invoiceId,
        object: 'invoice',
        customer: customerId,
        subscription: subscriptionId,
        status: 'paid',
        amount_paid: 19900,
        currency: 'usd',
        metadata: { workspaceId: ACME_WS_ID },
      },
    },
  };
  log('Firing invoice.payment_succeeded');
  await signAndDeliverWebhook(stripe, invoiceSucceededEvent);

  // 5c. customer.subscription.updated (simulate upgrade activation)
  const subUpdatedEvent = {
    id: `evt_sim_sub_updated_${Date.now()}`,
    object: 'event',
    type: 'customer.subscription.updated',
    created: now,
    livemode: false,
    data: {
      object: {
        id: subscriptionId,
        object: 'subscription',
        customer: customerId,
        status: 'active',
        metadata: { workspaceId: ACME_WS_ID, tier: 'starter' },
      },
      previous_attributes: { status: 'trialing' },
    },
  };
  log('Firing customer.subscription.updated');
  await signAndDeliverWebhook(stripe, subUpdatedEvent);

  // ── 6. Verify final DB state ──────────────────────────────────────────────
  sep('Step 6: Verify DB state after webhooks');
  const [updated] = await db.select().from(workspaces).where(eq(workspaces.id, ACME_WS_ID)).limit(1);
  log('ACME workspace final state', {
    id: updated.id,
    name: updated.name,
    tier: (updated as any).subscriptionTier,
    status: (updated as any).subscriptionStatus,
    stripeCustomerId: (updated as any).stripeCustomerId,
    stripeSubscriptionId: (updated as any).stripeSubscriptionId,
  });

  sep('✅ Simulation Complete');
  console.log(`
  Stripe Test Dashboard:
  ─────────────────────
  Customer:       https://dashboard.stripe.com/test/customers/${customerId}
  Subscription:   https://dashboard.stripe.com/test/subscriptions/${subscriptionId}
  Webhook Events: https://dashboard.stripe.com/test/webhooks

  3 events fired:
    ✅ customer.subscription.created
    ✅ invoice.payment_succeeded  ($199.00)
    ✅ customer.subscription.updated
  `);

  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ Simulation failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
