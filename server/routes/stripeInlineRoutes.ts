import { sanitizeError } from '../middleware/errorHandler';
import { Router, RequestHandler } from "express";
import crypto from 'crypto';
import Stripe from 'stripe';
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { BILLING, getMiddlewareFees, getCompetitorPricing, type TierKey } from '@shared/billingConfig';
import { broadcastToWorkspace } from "../websocket";
import { db } from "../db";
import { billingAuditLog } from "@shared/schema";
import { platformEventBus } from "../services/platformEventBus";
import { multiplyFinancialValues, toFinancialString } from '../services/financialCalculator';
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';
import { getStripe, isStripeConfigured } from '../services/billing/stripeClient';
const log = createLogger('StripeInlineRoutes');


const router = Router();

// ── Stripe webhook event-ID deduplication ─────────────────────────────────────
// Stripe retries webhooks if it doesn't receive a 2xx response within 30 s.
// Without deduplication, a slow handler can result in the same event being
// processed twice (double-credit / double-debit). We keep the last 2 000
// processed event IDs for 24 h — sufficient to cover all Stripe retry windows.
const _processedStripeEvents = new Map<string, number>(); // event.id → processedAt ms
const _STRIPE_DEDUP_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
function _pruneStripeEventCache() {
  const cutoff = Date.now() - _STRIPE_DEDUP_TTL_MS;
  for (const [id, ts] of _processedStripeEvents.entries()) {
    if (ts < cutoff) _processedStripeEvents.delete(id);
  }
}
setInterval(_pruneStripeEventCache, 60 * 60 * 1000).unref(); // hourly cleanup

// Lazy proxy: avoids module-load crash if STRIPE_SECRET_KEY is missing (TRINITY.md §F).
const stripe = new Proxy({} as Stripe, {
  get(_t, prop) {
    return (getStripe() as any)[prop];
  },
});

if (!isStripeConfigured()) {
  log.warn('STRIPE_SECRET_KEY not found. Payment processing disabled. Add keys to activate.');
}

function resolveUserId(req: any): string | undefined {
  return req.user?.id || req.user?.claims?.sub || req.session?.userId;
}

async function resolveWorkspace(req: any) {
  const wsId = req.user?.currentWorkspaceId || req.session?.currentWorkspaceId || req.workspaceId;
  if (wsId) {
    const ws = await storage.getWorkspace(wsId);
    if (ws) return ws;
  }
  const userId = resolveUserId(req);
  if (!userId) return undefined;
  const ownerWs = await storage.getWorkspaceByOwnerId(userId);
  if (ownerWs) return ownerWs;
  return undefined;
}

const flexAuth: RequestHandler = async (req: any, res, next) => {
  if (req.session?.userId) {
    if (!req.user) {
      const user = await storage.getUser(req.session.userId);
      if (user) {
        req.user = {
          id: user.id,
          email: user.email,
          claims: { sub: user.id },
          currentWorkspaceId: req.session.currentWorkspaceId,
        };
      }
    }
    return next();
  }
  return requireAuth(req, res, next);
};

router.get('/config', async (req, res) => {
  res.json({
    publishableKey: process.env.VITE_STRIPE_PUBLIC_KEY || null,
    isConfigured: isStripeConfigured(),
  });
});

router.post('/connect-account', flexAuth, async (req: any, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({ 
        message: "Stripe integration requires STRIPE_SECRET_KEY. Please add your Stripe keys to activate payment processing." 
      });
    }

    const workspace = await resolveWorkspace(req);
    
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (workspace.stripeConnectedAccountId) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const account = await stripe.accounts.retrieve(workspace.stripeConnectedAccountId);
      return res.json({ 
        accountId: account.id,
        chargesEnabled: account.charges_enabled,
        detailsSubmitted: account.details_submitted,
      });
    }

    const account = await stripe.accounts.create({
      type: 'standard',
      email: req.user?.email || '',
      business_type: 'company',
      metadata: {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
      },
    }, { idempotencyKey: `connect-acct-${workspace.id}` });

    await storage.updateWorkspace(workspace.id, {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      stripeConnectedAccountId: account.id,
    });

    res.json({ 
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      detailsSubmitted: account.details_submitted,
    });
  } catch (error: unknown) {
    log.error("Error creating Stripe Connect account:", error);
    res.status(500).json({ message: "Failed to create Stripe account" });
  }
});

router.post('/onboarding-link', flexAuth, async (req: any, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({ message: "Stripe keys required" });
    }

    const workspace = await resolveWorkspace(req);
    
    if (!workspace || !(workspace as any).stripeConnectedAccountId) {
      return res.status(400).json({ message: "Connect account must be created first" });
    }

    const accountLink = await stripe.accountLinks.create({
      account: (workspace as any).stripeConnectedAccountId,
      refresh_url: `${req.protocol}://${req.get('host')}/settings`,
      return_url: `${req.protocol}://${req.get('host')}/settings?stripe_onboarding=success`,
      type: 'account_onboarding',
    }, { idempotencyKey: `onboard-link-${(workspace as any).stripeConnectedAccountId}-${Math.floor(Date.now() / 60000)}` });

    res.json({ url: accountLink.url });
  } catch (error: unknown) {
    log.error("Error creating onboarding link:", error);
    res.status(500).json({ message: "An internal error occurred" });
  }
});

router.post('/pay-invoice', requireAuth, async (req: any, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({ message: "Stripe keys required" });
    }

    const { invoiceId, paymentMethodId } = req.body;

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    if (invoice.status === 'paid') {
      return res.status(409).json({ message: "Invoice has already been paid" });
    }

    if (invoice.status === 'cancelled' || invoice.status === 'void') {
      return res.status(400).json({ message: "Cannot pay a cancelled or voided invoice" });
    }

    const workspace = await storage.getWorkspace(invoice.workspaceId);
    if (!workspace || !(workspace as any).stripeConnectedAccountId) {
      return res.status(400).json({ message: "Workspace Stripe account not configured" });
    }

    const totalCents = parseInt(multiplyFinancialValues(toFinancialString(invoice.total as string), '100'));
    const platformFeeCents = parseInt(multiplyFinancialValues(toFinancialString(invoice.platformFeeAmount as string || '0'), '100'));

    const invoiceCurrency = ((invoice as any).currency || 'usd').toLowerCase();
    const paymentIntent = await stripe.paymentIntents.create({
      automatic_payment_methods: { enabled: true },
      amount: totalCents,
      currency: invoiceCurrency,
      payment_method: paymentMethodId,
      confirm: true,
      application_fee_amount: platformFeeCents,
      transfer_data: {
        destination: (workspace as any).stripeConnectedAccountId,
      },
      metadata: {
        invoiceId: invoice.id,
        workspaceId: workspace.id,
      },
    }, { idempotencyKey: `pi-invoice-${invoice.id}` });

    // GAP-6 FIX: Explicit requires_action handling.
    // When Stripe needs 3DS authentication, paymentIntent.status is 'requires_action'.
    // Previously we returned { success: true } regardless of status — the frontend
    // interpreted this as "payment complete" and showed a success message while the
    // invoice was never actually marked paid. Now we surface the clientSecret so the
    // frontend can complete the 3DS challenge via Stripe.js confirmCardPayment().
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_source_action') {
      return res.json({
        success: false,
        requiresAction: true,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        status: paymentIntent.status,
      });
    }

    if (paymentIntent.status === 'succeeded') {
      const paidAt = new Date();
      await storage.updateInvoice(invoiceId, invoice.workspaceId, {
        status: 'paid',
        paidAt,
        paymentIntentId: paymentIntent.id,
      });

      await db.insert(billingAuditLog).values({
        workspaceId: workspace.id,
        eventType: 'invoice_paid',
        eventCategory: 'billing',
        actorType: 'user',
        actorId: req.userId || 'unknown',
        description: `Invoice ${invoice.invoiceNumber || invoiceId} paid via Stripe`,
        relatedEntityType: 'invoice',
        relatedEntityId: invoiceId,
        previousState: { status: invoice.status },
        newState: { status: 'paid', paymentIntentId: paymentIntent.id },
        metadata: { paymentIntentId: paymentIntent.id, amount: invoice.total },
      }).catch((err: Error) => log.error('[BillingAudit] Failed to write invoice_paid log:', err));

      await storage.createPlatformRevenue({
        workspaceId: workspace.id,
        revenueType: 'invoice_fee',
        sourceId: invoice.id,
        amount: invoice.platformFeeAmount as string,
        feePercentage: invoice.platformFeePercentage as string,
        collectedAt: new Date(),
        status: 'collected',
      });

      // WIRE: charge the middleware processing fee for this invoice payment (non-blocking).
      // This is the 2.9% + $0.25 flat fee billed to the tenant for using the invoicing
      // pipeline. Previously this service existed but was never called on the Stripe path.
      try {
        const { chargeInvoiceMiddlewareFee } = await import('../services/billing/middlewareTransactionFees');
        const feeResult = await chargeInvoiceMiddlewareFee({
          workspaceId: workspace.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber || invoice.id,
          invoiceAmountCents: totalCents,
          paymentMethod: 'card',
        });
        log.info(`[PayInvoice] Middleware fee: ${feeResult.description} (success: ${feeResult.success})`);
        if (feeResult.success && feeResult.amountCents > 0) {
          // DB ledger: record in financial_processing_fees so platformBillService sees it
          import('../services/billing/financialProcessingFeeService').then(({ financialProcessingFeeService }) =>
            financialProcessingFeeService.recordInvoiceFee({ workspaceId: workspace.id, referenceId: invoice.id })
              .catch((err: Error) => log.warn('[PayInvoice] Fee ledger record failed (non-blocking):', err.message))
          ).catch((err: Error) => log.warn('[PayInvoice] Fee ledger import failed:', err.message));
        }
      } catch (feeErr: any) {
        log.warn('[PayInvoice] Middleware fee charge failed (non-blocking):', feeErr?.message);
      }

      broadcastToWorkspace(workspace.id, {
        type: 'invoice_paid',
        data: {
          invoiceId: invoice.id,
          workspaceId: workspace.id,
          paymentIntentId: paymentIntent.id,
          paidAt: paidAt.toISOString(),
        },
      });

      // GAP-3 FIX: Publish invoice_paid platform event on the Stripe payment path.
      // Previously, when a client paid via POST /api/stripe/pay-invoice, the code
      // updated the DB, wrote the audit log, and broadcast to WS — but never published
      // the invoice_paid PlatformEvent. This meant Trinity never received notification,
      // the QB invoice sync pipeline was never triggered, and invoice_overdue cleanup
      // logic never fired. The payment_intent.succeeded Stripe webhook fires stripe_payment_received
      // (not invoice_paid), so without this publish, the invoice_paid event was entirely
      // missing from the platform event stream for Stripe-originated payments.
      platformEventBus.publish({
        type: 'invoice_paid',
        category: 'automation',
        title: `Invoice Paid via Stripe`,
        description: `Invoice ${invoice.invoiceNumber || invoiceId} paid — $${parseFloat(invoice.total as string).toFixed(2)} received via Stripe`,
        workspaceId: workspace.id,
        userId: req.userId || undefined,
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          paymentIntentId: paymentIntent.id,
          amount: invoice.total,
          paidAt: paidAt.toISOString(),
          source: 'stripe_pay_invoice',
        },
        visibility: 'manager',
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    }

    res.json({ 
      success: true,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
    });
  } catch (error: unknown) {
    log.error("Error processing payment:", error);
    res.status(500).json({ message: "Payment processing failed" });
  }
});

router.post('/create-subscription', requireAuth, async (req: any, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({ message: "Stripe keys required" });
    }

    const { tier, paymentMethodId } = req.body;
    const workspace = await resolveWorkspace(req);
    
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    // DEDUP GUARD: if workspace already has an active subscription, never create a second one.
    // Stripe idempotency keys only protect within a 24-hour window and are tier-scoped —
    // after expiry or on a tier change, a naive call would create a duplicate subscription.
    if (workspace.stripeSubscriptionId) {
      try {
        const existingSub = await stripe!.subscriptions.retrieve(workspace.stripeSubscriptionId);
        if (existingSub.status === 'active' || existingSub.status === 'trialing') {
          if (tier === workspace.subscriptionTier) {
            // Same tier — return existing subscription; do not create a duplicate.
            return res.json({
              success: true,
              subscriptionId: existingSub.id,
              tier: workspace.subscriptionTier,
              alreadyActive: true,
            });
          }
          // Different tier — caller must use the billing portal or upgrade endpoint.
          return res.status(409).json({
            message: 'Workspace already has an active subscription. Use the billing portal to change your plan.',
            subscriptionId: existingSub.id,
            currentTier: workspace.subscriptionTier,
            currentStatus: existingSub.status,
          });
        }
        // Subscription exists but is not active (cancelled, past_due) — fall through to create new.
      } catch (subLookupErr: any) {
        // Stripe does not know this ID — the stored value is stale. Clear it and continue.
        log.warn(`[CreateSubscription] Stale stripeSubscriptionId on workspace ${workspace.id}: ${subLookupErr.message}`);
        await storage.updateWorkspace(workspace.id, { stripeSubscriptionId: null });
      }
    }

    const { BILLING } = await import('@shared/billingConfig');
    const { STRIPE_PRODUCTS, getPriceId } = await import('../stripe-config');
    
    const validTiers = ['starter', 'professional', 'business', 'enterprise'] as const;
    if (!validTiers.includes(tier as any)) {
      return res.status(400).json({ message: "Invalid tier" });
    }
    
    const billingTier = BILLING.tiers[tier as keyof typeof BILLING.tiers];
    if (!billingTier || !billingTier.monthlyPrice) {
      return res.status(400).json({ message: "Invalid tier configuration" });
    }

    let customerId = workspace.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user?.email || '',
        metadata: {
          workspaceId: workspace.id,
          workspaceName: workspace.name,
        },
      }, { idempotencyKey: `cust-create-${workspace.id}` });
      customerId = customer.id;
      await storage.updateWorkspace(workspace.id, { stripeCustomerId: customerId });
    }

    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const stripePriceId = getPriceId(tier as any, 'monthly');
    
    const subscriptionParams: any = {
      customer: customerId,
      metadata: {
        workspaceId: workspace.id,
        tier: tier,
        billingCycle: 'monthly',
      },
    };
    
    if (stripePriceId) {
      subscriptionParams.items = [{ price: stripePriceId }];
    } else {
      subscriptionParams.items = [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${PLATFORM.name} ${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan`,
          },
          recurring: { interval: 'month' },
          unit_amount: billingTier.monthlyPrice,
        },
      }];
    }
    
    const subscription = await stripe.subscriptions.create(
      subscriptionParams,
      { idempotencyKey: `sub-create-${workspace.id}-${tier}` }
    );

    const platformFeeMap: Record<string, string> = {
      free: "10",
      starter: "7",
      professional: "5",
      business: "4",
      enterprise: "3",
      strategic: "2",
    };

    await storage.updateWorkspace(workspace.id, {
      subscriptionTier: tier,
      subscriptionStatus: 'active',
      stripeSubscriptionId: subscription.id,
      platformFeePercentage: platformFeeMap[tier as keyof typeof platformFeeMap] || "5",
    });

    // Token tracking is event-driven — no per-subscription initialization needed.

    // Publish subscription_created event so Trinity and billing subscribers react (non-blocking)
    import('../services/platformEventBus').then(({ platformEventBus }) =>
      platformEventBus.publish({
        type: 'subscription_created',
        workspaceId: workspace.id,
        metadata: {
          subscriptionId: subscription.id,
          tier,
          stripeCustomerId: workspace.stripeCustomerId || undefined,
          workspaceName: workspace.name,
        },
      }).catch((err: Error) => log.warn('[Stripe] subscription_created publish failed (non-blocking):', err.message))
    ).catch((err: Error) => log.warn('[Stripe] subscription_created import failed:', err.message));

    res.json({ 
      success: true,
      subscriptionId: subscription.id,
      tier: tier,
    });
  } catch (error: unknown) {
    log.error("Error creating subscription:", error);
    res.status(500).json({ message: "An internal error occurred" });
  }
});

router.post('/webhook', async (req: any, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).send('Stripe not configured');
    }
    const sig = req.headers['stripe-signature'];
    if (!sig || typeof sig !== 'string') {
      return res.status(401).send('Unauthorized - Invalid signature');
    }
    const payload = req.rawBody || JSON.stringify(req.body);

    // Try test webhook secret first, then live — same endpoint handles both environments.
    const testSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const liveSecret = process.env.STRIPE_LIVE_WEBHOOK_SECRET;
    if (!testSecret && !liveSecret) {
      return res.status(400).send('Webhook secret required');
    }

    let event: Stripe.Event | null = null;
    const secretsToTry = [testSecret, liveSecret].filter(Boolean) as string[];
    for (const secret of secretsToTry) {
      try {
        event = stripe.webhooks.constructEvent(payload, sig, secret);
        break; // verified — stop trying
      } catch {
        // try next secret
      }
    }
    if (!event) {
      log.warn('[Stripe Webhook] Signature verification failed with all available secrets');
      return res.status(400).send('Webhook Error: Invalid signature');
    }

    // M03: In-memory fast-path dedup. The authoritative dedup is the DB-backed
    // tryClaimEvent() inside stripeWebhookService.handleEvent(). This in-memory
    // cache is a performance optimization only — it must NOT return early with 200
    // before the DB dedup runs, because the memory cache is lost on server restart
    // while Stripe retries for up to 72 h.
    const isMemoryDuplicate = _processedStripeEvents.has(event.id);
    _processedStripeEvents.set(event.id, Date.now());
    if (_processedStripeEvents.size > 2000) _pruneStripeEventCache();

    if (isMemoryDuplicate) {
      log.info(`[Stripe Webhook] Memory-cache duplicate ${event.id} (${event.type}) — still delegating to DB dedup`);
    }

    const MONEY_CRITICAL_EVENTS = new Set([
      'invoice.payment_failed',
      'invoice.payment_succeeded',
      'payment_intent.payment_failed',
      'payment_intent.succeeded',
      'customer.subscription.deleted',
      'customer.subscription.updated',
      'checkout.session.completed',
      'charge.succeeded',
      'charge.refunded',
    ]);

    // GAP-10 FIX: Hoist result so we can gate the AI Brain bridge on duplicate detection.
    let mainWebhookResult: { success: boolean; handled?: boolean; message?: string; error?: string } | null = null;
    try {
      const { stripeWebhookService } = await import('../services/billing/stripeWebhooks');
      mainWebhookResult = await stripeWebhookService.handleEvent(event);
      if (!mainWebhookResult.success && MONEY_CRITICAL_EVENTS.has(event.type)) {
        log.error(`[Stripe Webhook] CRITICAL: handler failed for ${event.type} (${event.id}): ${mainWebhookResult.error}`);
        return res.status(500).json({ error: `Handler failed: ${mainWebhookResult.error}` });
      }
    } catch (routeErr: unknown) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      log.error('[Stripe Webhook] Main pipeline threw for event:', event.type, routeErr.message);
      if (MONEY_CRITICAL_EVENTS.has(event.type)) {
        return res.status(500).json({ error: `Handler error: ${sanitizeError(routeErr)}` });
      }
    }

    // stripeWebhookService uses a DB insert (processedStripeEvents table) to claim events.
    // stripeEventBridge only had an in-memory Set that resets on server restart — so on any
    // restart, Stripe retries would re-fire AI Brain events (duplicate notifications, etc.)
    // even though stripeWebhookService correctly skips the already-claimed event.
    // Skip the bridge if stripeWebhookService flagged this as a duplicate event.
    const isAlreadyProcessedByWebhookService =
      mainWebhookResult?.message?.startsWith('Duplicate event') === true;

    if (!isAlreadyProcessedByWebhookService) {
      try {
        const { stripeEventBridge } = await import('../services/billing/stripeEventBridge');
        await stripeEventBridge.processEvent(event);
      } catch (bridgeError) {
        log.warn('[Stripe Webhook] AI Brain processing failed (non-blocking):', bridgeError);
      }
    } else {
      log.info(`[Stripe Webhook] Skipping AI Brain bridge for duplicate event ${event.id}`);
    }

    res.json({ received: true });
  } catch (error: unknown) {
    log.error('Webhook error:', sanitizeError(error));
    res.status(400).send(`Webhook Error: ${sanitizeError(error)}`);
  }
});

/**
 * POST /api/stripe/billing-portal
 * Create a Stripe Customer Portal session so the org owner can manage billing
 */
router.post('/billing-portal', requireAuth, async (req: any, res) => {
  try {
    if (!isStripeConfigured()) return res.status(503).json({ message: 'Payment processing not configured' });

    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    const returnUrl = req.body.returnUrl;
    if (!workspaceId) return res.status(400).json({ message: 'workspaceId required - must be logged into a workspace' });

    const workspace = await storage.getWorkspace(workspaceId);
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });

    let customerId = workspace.stripeCustomerId;

    // Auto-create Stripe customer if one doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: undefined,
        name: workspace.name,
        metadata: { workspaceId },
      });
      customerId = customer.id;
      await storage.updateWorkspace(workspaceId, { stripeCustomerId: customerId });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || `${process.env.BASE_URL || 'https://www.coaileague.com'}/org-management`,
    });

    return res.json({ url: session.url });
  } catch (error: unknown) {
    log.error('[Stripe] Billing portal error:', sanitizeError(error));
    return res.status(500).json({ message: sanitizeError(error) });
  }
});

/**
 * POST /api/stripe/create-subscription-checkout
 * Create a Stripe Checkout session for subscription renewal or upgrade
 */
router.post('/create-subscription-checkout', requireAuth, async (req: any, res) => {
  try {
    if (!isStripeConfigured()) return res.status(503).json({ message: 'Payment processing not configured' });

    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    const { tier = 'enterprise', successUrl, cancelUrl } = req.body;
    if (!workspaceId) return res.status(400).json({ message: 'workspaceId required - must be logged into a workspace' });

    const workspace = await storage.getWorkspace(workspaceId);
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });

    const TIER_PRICE_IDS: Record<string, string | undefined> = {
      starter:      process.env.STRIPE_PRICE_STARTER_MONTHLY || process.env.STRIPE_STARTER_MONTHLY_PRICE_ID || process.env.STRIPE_STARTER_2026_MONTHLY_PRICE_ID,
      professional: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY || process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID || process.env.STRIPE_PROFESSIONAL_2026_MONTHLY_PRICE_ID,
      business:     process.env.STRIPE_PRICE_BUSINESS_MONTHLY || process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID || process.env.STRIPE_BUSINESS_2026_MONTHLY_PRICE_ID,
      enterprise:   process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID,
    };
    const TIER_FALLBACK_AMOUNTS: Record<string, { amount: number; name: string }> = {
      starter:      { amount: BILLING.tiers.starter.monthlyPrice,      name: `${BILLING.platform.name} Starter` },
      professional: { amount: BILLING.tiers.professional.monthlyPrice, name: `${BILLING.platform.name} Professional` },
      business:     { amount: BILLING.tiers.business.monthlyPrice,     name: `${BILLING.platform.name} Business` },
    };

    if (tier === 'enterprise') {
      return res.status(400).json({ message: 'Enterprise plans require a sales consultation. Please contact sales@coaileague.com.' });
    }
    if (!TIER_FALLBACK_AMOUNTS[tier]) {
      return res.status(400).json({ message: `Invalid tier: ${tier}` });
    }

    const baseUrl = process.env.BASE_URL || 'https://www.coaileague.com';

    let customerId = workspace.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: workspace.name,
        metadata: { workspaceId },
      });
      customerId = customer.id;
      await storage.updateWorkspace(workspaceId, { stripeCustomerId: customerId });
    }

    const priceId = TIER_PRICE_IDS[tier];
    const lineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          price_data: {
            currency: 'usd',
            product_data: { name: TIER_FALLBACK_AMOUNTS[tier].name },
            recurring: { interval: 'month' as const },
            unit_amount: TIER_FALLBACK_AMOUNTS[tier].amount,
          },
          quantity: 1,
        };

    const idempotencyKey = `checkout-sub-${workspaceId}-${tier}-${Math.floor(Date.now() / 60000)}`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [lineItem],
      success_url: successUrl || `${baseUrl}/org-management?payment=success`,
      cancel_url: cancelUrl || `${baseUrl}/org-management?payment=cancelled`,
      metadata: { workspaceId, tier },
      subscription_data: {
        metadata: { workspaceId, tier },
      },
    }, { idempotencyKey });

    return res.json({ url: session.url, sessionId: session.id });
  } catch (error: unknown) {
    log.error('[Stripe] Checkout session error:', sanitizeError(error));
    return res.status(500).json({ message: sanitizeError(error) });
  }
});


router.get('/connect-status', flexAuth, async (req: any, res) => {
  try {
    const workspace = await resolveWorkspace(req);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    if (!(workspace as any).stripeConnectedAccountId) {
      return res.json({
        status: 'not_started',
        accountId: null,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        onboardingComplete: false,
      });
    }

    if (!isStripeConfigured()) {
      return res.json({
        status: 'stripe_not_configured',
        accountId: (workspace as any).stripeConnectedAccountId,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        onboardingComplete: false,
      });
    }

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const account = await stripe.accounts.retrieve(workspace.stripeConnectedAccountId);

    let status: string;
    if (account.charges_enabled && account.payouts_enabled) {
      status = 'active';
    } else if (account.details_submitted) {
      status = 'pending_verification';
    } else {
      status = 'onboarding_incomplete';
    }

    res.json({
      status,
      accountId: account.id,
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
      detailsSubmitted: account.details_submitted ?? false,
      onboardingComplete: account.charges_enabled && account.payouts_enabled,
    });
  } catch (error: unknown) {
    log.error("Error fetching Connect status:", error);
    res.status(500).json({ message: "Failed to fetch Connect account status" });
  }
});

router.get('/fee-schedule', flexAuth, async (req: any, res) => {
  try {
    const workspace = await resolveWorkspace(req);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const tier = (workspace.subscriptionTier || 'free') as TierKey;
    const fees = getMiddlewareFees(tier);
    const competitors = getCompetitorPricing();

    const competitorInvoiceRates = [
      competitors.quickbooks.invoiceRate,
      competitors.square.invoiceRate,
    // @ts-expect-error — TS migration: fix in refactoring sprint
    ].filter((r): r is number => r !== null);
    const maxCompetitorRate = competitorInvoiceRates.length > 0 ? Math.max(...competitorInvoiceRates) : 0;
    const savingsPercent = maxCompetitorRate > 0
      ? Math.round(((maxCompetitorRate - fees.invoiceProcessing.ratePercent) / maxCompetitorRate) * 100)
      : 0;

    const competitorPayrollPerEmployee = [
      competitors.quickbooks.payrollPerEmployee,
      competitors.gusto.payrollPerEmployee,
      competitors.patriot.payrollPerEmployee,
      competitors.square.payrollPerEmployee,
    // @ts-expect-error — TS migration: fix in refactoring sprint
    ].filter((r): r is number => r !== null);
    const maxPayrollPerEmployee = competitorPayrollPerEmployee.length > 0 ? Math.max(...competitorPayrollPerEmployee) : 0;
    const payrollSavingsPercent = maxPayrollPerEmployee > 0
      ? Math.round(((maxPayrollPerEmployee - fees.payrollMiddleware.perEmployeeCents) / maxPayrollPerEmployee) * 100)
      : 0;

    const { calculateInvoiceFee, calculatePayrollFee } = await import('../services/finance/middlewareFeeService');
    const sampleInvoiceFee = calculateInvoiceFee(100000, tier);
    const samplePayrollFee = calculatePayrollFee(25, tier);

    res.json({
      tier,
      tierDiscount: fees.tierDiscount,
      fees: {
        invoiceProcessing: fees.invoiceProcessing,
        achPayments: fees.achPayments,
        payrollMiddleware: fees.payrollMiddleware,
        stripePayouts: fees.stripePayouts,
      },
      examples: {
        invoiceFee_1000: sampleInvoiceFee,
        payrollFee_25employees: samplePayrollFee,
      },
      competitors,
      savings: {
        invoiceProcessingSavingsPercent: Math.max(0, savingsPercent),
        payrollSavingsPercent: Math.max(0, payrollSavingsPercent),
        headline: `Save up to ${Math.max(savingsPercent, payrollSavingsPercent)}% vs competitors`,
      },
    });
  } catch (error: unknown) {
    log.error("Error fetching fee schedule:", error);
    res.status(500).json({ message: "Failed to fetch fee schedule" });
  }
});

router.post('/connect-dashboard', flexAuth, async (req: any, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({ message: "Stripe keys required" });
    }

    const workspace = await resolveWorkspace(req);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    if (!(workspace as any).stripeConnectedAccountId) {
      return res.status(400).json({ message: "No Stripe Connect account linked to this workspace" });
    }

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const loginLink = await stripe.accounts.createLoginLink(workspace.stripeConnectedAccountId);

    res.json({ url: loginLink.url });
  } catch (error: unknown) {
    log.error("Error creating Connect dashboard link:", error);
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (error?.type === 'StripeInvalidRequestError' && (error as any)?.message?.includes('standard')) {
      const dashboardUrl = `https://dashboard.stripe.com`;
      return res.json({ url: dashboardUrl, note: 'Standard accounts use the main Stripe Dashboard' });
    }
    res.status(500).json({ message: "Failed to create dashboard link" });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// GET /api/billing/stripe-health — platform staff only
// Verifies Stripe environment variables, API connectivity, livemode status,
// and that our webhook endpoint is registered with Stripe.
// ══════════════════════════════════════════════════════════════════════════
router.get('/stripe-health', requireAuth, async (req, res) => {
  const platformRole = (req as any).platformRole || '';
  const isPlatformStaff = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent']
    .includes(platformRole);
  if (!isPlatformStaff) {
    return res.status(403).json({ error: 'Platform staff only' });
  }

  const issues: string[] = [];
  const checks: Record<string, any> = {};

  const requiredEnvVars = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_STARTER_MONTHLY_PRICE_ID',
    'STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID',
    'STRIPE_MIDDLEWARE_PAYROLL_PRICE_ID',
    'STRIPE_EMPLOYMENT_VERIFY_PRICE_ID',
    'STRIPE_TAC_DOCUMENT_PRICE_ID',
    'STRIPE_TOPS_VERIFY_PRICE_ID',
    'STRIPE_W2_FORM_PRICE_ID',
    'STRIPE_1099_NEC_PRICE_ID',
  ];

  checks.envVars = {};
  for (const envVar of requiredEnvVars) {
    const present = !!process.env[envVar];
    checks.envVars[envVar] = present ? 'present' : 'missing';
    if (!present) issues.push(`Missing env var: ${envVar}`);
  }

  try {
    const balance = await stripe.balance.retrieve();
    checks.stripeConnected = 'connected';
    checks.stripeLiveMode = balance.livemode ? 'live' : 'test';
  } catch (stripeErr: any) {
    checks.stripeConnected = `failed: ${stripeErr?.message || 'unknown'}`;
    issues.push('Stripe API connection failed');
  }

  try {
    const webhooks = await stripe.webhookEndpoints.list({ limit: 10 });
    const ourWebhook = webhooks.data.find((w: any) =>
      typeof w.url === 'string' &&
      w.url.includes('coaileague.com') &&
      w.status === 'enabled'
    );
    checks.webhookRegistered = ourWebhook ? ourWebhook.url : 'not found';
    if (!ourWebhook) issues.push('Stripe webhook not registered');
  } catch (err: any) {
    checks.webhookRegistered = `unverified: ${err?.message || 'unknown'}`;
  }

  res.json({
    healthy: issues.length === 0,
    issues,
    checks,
    timestamp: new Date().toISOString(),
  });
});

export default router;
