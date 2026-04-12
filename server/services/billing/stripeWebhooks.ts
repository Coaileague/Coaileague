/**
 * Stripe Webhook Handler Service
 * ================================
 * Comprehensive webhook handling for all Stripe events
 * Synced with billingConfig.ts and subscriptionManager.ts
 * 
 * Handles:
 * - Subscription lifecycle (created, updated, deleted)
 * - Payment events (succeeded, failed)
 * - Invoice events
 * - Credit purchases
 */

import Stripe from 'stripe';
import { getStripe } from './stripeClient';
import { db } from '../../db';
import {
  workspaces,
  subscriptionPayments,
  invoices,
  invoicePayments,
  users,
  employeePayrollInfo,
  processedStripeEvents as processedStripeEventsTable,
  platformRoles,
  notifications,
} from '@shared/schema';
import { eq, and, sql, lt, not, inArray, isNull } from 'drizzle-orm';
import { subscriptionManager, type SubscriptionTier } from './subscriptionManager';
import { creditManager } from './creditManager';
import { createLogger } from '../../lib/logger';
import { writeLedgerEntry } from '../orgLedgerService';
import { createNotification } from '../notificationService';
import { broadcastToWorkspace } from '../../websocket';
import { PLATFORM } from '../../config/platformConfig';
import { platformEventBus } from '../platformEventBus';
import { withDistributedLock, LOCK_KEYS } from '../distributedLock';

const log = createLogger('StripeWebhookService');

const memoryCache = new Map<string, number>();
const MEMORY_CACHE_MAX = 5000;

function evictMemoryCache(): void {
  const entries = [...memoryCache.entries()].sort((a, b) => a[1] - b[1]);
  for (const [key] of entries.slice(0, Math.floor(MEMORY_CACHE_MAX * 0.2))) {
    memoryCache.delete(key);
  }
}

/**
 * G18 FIX — Atomic event claim using INSERT ON CONFLICT DO NOTHING RETURNING.
 *
 * The prior implementation had a race window: SELECT (check) → INSERT (mark) as
 * two separate operations. Two concurrent webhook deliveries for the same event
 * could both pass the SELECT check before either committed the INSERT, producing
 * duplicate ledger entries and billing mutations.
 *
 * The new pattern collapses check + mark into one atomic DB round-trip:
 *   - If the eventId is new     → INSERT succeeds → we get rows back → proceed.
 *   - If the eventId is a dupe  → ON CONFLICT DO NOTHING → 0 rows back → skip.
 * No window exists between the check and the claim.
 *
 * The in-memory map is kept as a fast-path to avoid DB round-trips for events
 * already seen in this process lifetime (common on high-traffic webhooks).
 *
 * @returns true  if this call is the first processor (safe to handle)
 *          false if another request already claimed this event (skip)
 */
async function tryClaimEvent(eventId: string, eventType?: string): Promise<boolean> {
  if (memoryCache.has(eventId)) return false;
  try {
    const [inserted] = await db.insert(processedStripeEventsTable)
      .values({ eventId, eventType: eventType || null })
      .onConflictDoNothing()
      .returning({ eventId: processedStripeEventsTable.eventId });

    if (inserted) {
      memoryCache.set(eventId, Date.now());
      if (memoryCache.size > MEMORY_CACHE_MAX) evictMemoryCache();
      return true;
    }
    memoryCache.set(eventId, Date.now());
    return false;
  } catch {
    if (memoryCache.has(eventId)) return false;
    memoryCache.set(eventId, Date.now());
    return true;
  }
}

async function cleanupOldProcessedEvents(): Promise<void> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db.delete(processedStripeEventsTable)
      .where(lt(processedStripeEventsTable.processedAt, thirtyDaysAgo));
  } catch (err: any) {
    log.warn('[StripeWebhooks] Failed to cleanup old processed events (non-fatal):', err?.message);
  }
}
setInterval(() => {
  withDistributedLock(LOCK_KEYS.STRIPE_WEBHOOK_CLEANUP, 'StripeWebhookCleanup', () => cleanupOldProcessedEvents())
    .catch((err) => log.warn('[stripeWebhooks] Cleanup job failed:', err));
}, 24 * 60 * 60 * 1000).unref();

// Lazy proxy: avoids module-load crash if STRIPE_SECRET_KEY is missing.
const stripe = new Proxy({} as Stripe, {
  get(_t, prop) {
    return (getStripe() as any)[prop];
  },
});

export interface WebhookResult {
  success: boolean;
  handled: boolean;
  message?: string;
  error?: string;
}

export class StripeWebhookService {
  /**
   * Verify webhook signature and parse event
   */
  verifySignature(payload: Buffer | string, signature: string): Stripe.Event {
    const testSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const liveSecret = process.env.STRIPE_LIVE_WEBHOOK_SECRET;

    if (!testSecret && !liveSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET or STRIPE_LIVE_WEBHOOK_SECRET must be configured');
    }

    // Try test secret first, then live — same method handles both environments.
    const secretsToTry = [testSecret, liveSecret].filter(Boolean) as string[];
    for (const secret of secretsToTry) {
      try {
        return stripe.webhooks.constructEvent(payload, signature, secret);
      } catch {
        // signature did not match this secret — try next
      }
    }
    throw new Error('Webhook signature verification failed with all available secrets');
  }

  /**
   * Main webhook handler - routes events to appropriate handlers
   */
  async handleEvent(event: Stripe.Event): Promise<WebhookResult> {
    log.info('Processing event', { eventType: event.type, eventId: event.id });
    
    // G18 FIX: Atomic claim — single INSERT ON CONFLICT DO NOTHING RETURNING.
    // Returns false if another request already claimed this event (concurrent or post-restart).
    const isNewEvent = await tryClaimEvent(event.id, event.type);
    if (!isNewEvent) {
      log.info('Duplicate event skipped (atomic DB dedup)', { eventId: event.id });
      return { success: true, handled: true, message: `Duplicate event ${event.id} already processed` };
    }

    try {
      let result: WebhookResult;
      switch (event.type) {
        case 'customer.subscription.created':
          result = await this.handleSubscriptionCreated(event);
          break;
        case 'customer.subscription.updated':
          result = await this.handleSubscriptionUpdated(event);
          break;
        case 'customer.subscription.deleted':
          result = await this.handleSubscriptionDeleted(event);
          break;
        case 'invoice.payment_succeeded':
          result = await this.handleInvoicePaymentSucceeded(event);
          break;
        case 'invoice.payment_failed':
          result = await this.handleInvoicePaymentFailed(event);
          break;
        case 'payment_intent.succeeded':
          result = await this.handlePaymentIntentSucceeded(event);
          break;
        case 'payment_intent.payment_failed':
          result = await this.handlePaymentIntentFailed(event);
          break;
        case 'checkout.session.completed':
          result = await this.handleCheckoutSessionCompleted(event);
          break;
        case 'charge.refunded':
          result = await this.handleChargeRefunded(event);
          break;
        case 'charge.succeeded':
          result = await this.handleChargeSucceeded(event);
          break;
        case 'charge.dispute.created':
          result = await this.handleChargeDisputeCreated(event);
          break;
        case 'invoice.created':
          result = await this.handleInvoiceCreated(event);
          break;
        case 'invoice.finalized':
          result = await this.handleInvoiceFinalized(event);
          break;
        case 'customer.created':
          result = await this.handleCustomerCreated(event);
          break;
        case 'customer.updated':
          result = await this.handleCustomerUpdated(event);
          break;
        case 'customer.deleted':
          result = await this.handleCustomerDeleted(event);
          break;
        case 'customer.subscription.trial_will_end':
          result = await this.handleSubscriptionTrialWillEnd(event);
          break;
        case 'customer.subscription.paused':
          result = await this.handleSubscriptionPaused(event);
          break;
        case 'customer.subscription.resumed':
          result = await this.handleSubscriptionResumed(event);
          break;
        case 'invoice.upcoming':
          result = await this.handleInvoiceUpcoming(event);
          break;
        case 'account.updated':
          result = await this.handleConnectAccountUpdated(event);
          break;
        case 'capability.updated':
          result = await this.handleConnectCapabilityUpdated(event);
          break;
        default:
          log.info('Unhandled event type', { eventType: event.type });
          return { success: true, handled: false, message: `Unhandled event type: ${event.type}` };
      }

      return result;
    } catch (error: any) {
      // Do NOT delete from memoryCache or DB — event stays marked to prevent retry double-processing.
      // Stripe will NOT retry events that return 2xx. The error is logged for manual review.
      log.error('Error processing event', { eventType: event.type, eventId: event.id, error: (error instanceof Error ? error.message : String(error)) });
      return { success: false, handled: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  /**
   * Handle new subscription creation
   */
  private async handleSubscriptionCreated(event: Stripe.Event): Promise<WebhookResult> {
    const subscription = event.data.object as Stripe.Subscription;
    const workspaceId = subscription.metadata.workspaceId;
    const billingCycle = subscription.metadata.billingCycle || 'monthly';

    if (!workspaceId) {
      log.warn('Subscription created without workspaceId');
      return { success: true, handled: false, message: 'Missing workspaceId in metadata' };
    }

    // GAP-39 FIX (part 1): Validate tier before using it — undefined cast to SubscriptionTier
    // is silently accepted by TypeScript but causes invalid DB writes and credit allocation.
    const VALID_TIERS = new Set<string>(['trial', 'free', 'starter', 'professional', 'business', 'enterprise']);
    const rawTier = subscription.metadata.tier;
    if (!rawTier || !VALID_TIERS.has(rawTier)) {
      log.error('handleSubscriptionCreated: missing or invalid tier in subscription metadata', { rawTier, workspaceId });
      return { success: false, handled: false, message: `handleSubscriptionCreated rejected: tier '${rawTier}' is not valid` };
    }
    const tier = rawTier as SubscriptionTier;

    log.info('Subscription created', { workspaceId, tier });

    // GAP-39 FIX (part 2): Run initializeCredits BEFORE db.update(workspaces).
    // If the credit initialization fails (e.g. credit service throws), the workspace tier
    // is never upgraded — so Stripe retries the webhook and both operations run again.
    // initializeCredits is idempotent (UPSERT logic) so a retry is always safe.
    // Previously the order was reversed: workspace was updated first, then initializeCredits
    // was called. If initializeCredits failed, workspace was left with a new tier but zero
    // credit balance — the org owner had a paid plan but Trinity returned "no credits".
    await creditManager.initializeCredits(workspaceId, tier);

    await db.update(workspaces)
      .set({
        subscriptionTier: tier,
        subscriptionStatus: 'active',
        stripeSubscriptionId: subscription.id,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));
    
    await this.logSubscriptionPayment({
      workspaceId,
      stripeSubscriptionId: subscription.id,
      tier,
      billingCycle,
      amount: subscription.items.data[0]?.price?.unit_amount || 0,
      status: 'active',
    });
    
    await this.sendSubscriptionEmail(workspaceId, 'subscription_created', { tier, billingCycle });

    // Publish subscription_created event to platform event bus for Trinity automation
    platformEventBus.publish({
      type: 'subscription_created',
      category: 'billing',
      title: `Subscription Created — ${tier}`,
      description: `Workspace ${workspaceId} subscription created with ${tier} tier`,
      workspaceId,
      metadata: { tier, billingCycle, stripeSubscriptionId: subscription.id, status: 'active' },
    }).catch((err: any) => log.warn('[stripeWebhooks] publish subscription_created failed:', err.message));

    return { success: true, handled: true, message: 'Subscription created successfully' };
  }

  /**
   * Handle subscription updates (upgrades, downgrades, renewals)
   */
  private async handleSubscriptionUpdated(event: Stripe.Event): Promise<WebhookResult> {
    const subscription = event.data.object as Stripe.Subscription;
    const workspaceId = subscription.metadata.workspaceId;

    if (!workspaceId) {
      log.warn('Subscription updated without workspaceId');
      return { success: true, handled: false, message: 'Missing workspaceId in metadata' };
    }

    // GAP-39 extension: validate tier in subscription.updated as well — same as subscription.created
    const VALID_TIERS = new Set<string>(['trial', 'free', 'starter', 'professional', 'business', 'enterprise']);
    const rawTier = subscription.metadata.tier;
    if (!rawTier || !VALID_TIERS.has(rawTier)) {
      log.error('handleSubscriptionUpdated: missing or invalid tier in subscription metadata', { rawTier, workspaceId });
      return { success: false, handled: false, message: `handleSubscriptionUpdated rejected: tier '${rawTier}' is not valid` };
    }
    const tier = rawTier as SubscriptionTier;

    // Preserve 'pending_cancel' when Stripe reports 'active + cancel_at_period_end'.
    // mapSubscriptionStatus only knows about subscription.status ('active', 'trialing', etc.)
    // but Stripe keeps status='active' even after cancel_at_period_end is set.
    // Our DB status 'pending_cancel' is more precise and must not be overwritten.
    const rawStatus = this.mapSubscriptionStatus(subscription.status);
    const status = subscription.cancel_at_period_end ? 'pending_cancel' : rawStatus;
    
    log.info('Subscription updated', { workspaceId, status, cancelAtPeriodEnd: subscription.cancel_at_period_end });
    
    const [currentWorkspace] = await db.select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    
    const previousTier = currentWorkspace?.subscriptionTier;

    // GAP-39 extension: if tier changed, update credit allocation BEFORE workspace update.
    // updateTierAllocation is idempotent (UPSERT) — safe to retry if workspace update fails.
    if (previousTier !== tier) {
      await creditManager.updateTierAllocation(workspaceId, tier);
    }

    await db.update(workspaces)
      .set({
        subscriptionTier: tier,
        subscriptionStatus: status,
        stripeSubscriptionId: subscription.id,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));
    
    if (previousTier !== tier) {
      
      const isUpgrade = this.isUpgrade(previousTier as SubscriptionTier, tier);
      await this.sendSubscriptionEmail(workspaceId, isUpgrade ? 'subscription_upgraded' : 'subscription_downgraded', {
        previousTier,
        newTier: tier,
      });

      // In-platform notification
      try {
        const [ws] = await db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (ws?.ownerId) {
          await createNotification({
            userId: ws.ownerId,
            workspaceId,
            type: isUpgrade ? 'subscription_upgraded' : 'subscription_downgraded',
            title: isUpgrade ? 'Subscription Upgraded' : 'Subscription Changed',
            message: `Your plan has been ${isUpgrade ? 'upgraded to' : 'changed to'} ${tier}. ${isUpgrade ? 'New features are now available.' : 'This change takes effect immediately.'}`,
            actionUrl: '/settings',
            metadata: { previousTier, newTier: tier, isUpgrade },
          });
        }
      } catch (notifErr: any) { log.warn('Notification failed on subscription.updated', { error: notifErr.message }); }

      // WebSocket broadcast for live billing widget update
      try {
        broadcastToWorkspace(workspaceId, { type: 'subscription_updated', tier, status, previousTier, isUpgrade });
      } catch (wsErr: any) { log.warn('WebSocket failed on subscription.updated', { error: wsErr.message }); }

      // GAP-78 FIX: Ensure account is active after upgrade
      try {
        const { accountStateService } = await import('./accountState');
        await accountStateService.reactivateAccount(workspaceId, 'system', 'Subscription upgraded');
      } catch (err: any) {
        log.warn('[stripeWebhooks] Failed to reactivate account after upgrade (non-fatal):', err.message);
      }

      // Trinity publish — subscription tier change must be visible in event stream
      platformEventBus.publish({
        type: 'subscription_updated',
        category: 'billing',
        title: `Subscription ${isUpgrade ? 'Upgraded' : 'Changed'} — ${tier}`,
        description: `Workspace ${workspaceId} subscription changed from ${previousTier} to ${tier}`,
        workspaceId,
        metadata: { previousTier, newTier: tier, status, isUpgrade },
      }).catch((err: any) => log.warn('[stripeWebhooks] publish subscription_updated failed:', err.message));
    }
    
    return { success: true, handled: true, message: 'Subscription updated successfully' };
  }

  /**
   * Handle subscription cancellation
   */
  private async handleSubscriptionDeleted(event: Stripe.Event): Promise<WebhookResult> {
    const subscription = event.data.object as Stripe.Subscription;
    const workspaceId = subscription.metadata.workspaceId;
    
    if (!workspaceId) {
      log.warn('Subscription deleted without workspaceId');
      return { success: true, handled: false, message: 'Missing workspaceId in metadata' };
    }
    
    log.info('Subscription cancelled', { workspaceId });
    
    await db.update(workspaces)
      .set({
        subscriptionTier: 'free',
        subscriptionStatus: 'cancelled',
        stripeSubscriptionId: null,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));
    
    await creditManager.downgradeCreditsOnCancellation(workspaceId);
    
    await this.sendSubscriptionEmail(workspaceId, 'subscription_cancelled', {});

    // In-platform notification + WebSocket broadcast
    try {
      const [ws] = await db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      if (ws?.ownerId) {
        await createNotification({
          userId: ws.ownerId,
          workspaceId,
          type: 'subscription_cancelled',
          title: 'Subscription Cancelled',
          message: 'Your subscription has been cancelled. You now have access to free-tier features only.',
          actionUrl: '/settings',
          metadata: { previousSubscriptionId: subscription.id },
        });
      }
    } catch (notifErr: any) { log.warn('Notification failed on subscription.deleted', { error: notifErr.message }); }

    try {
      broadcastToWorkspace(workspaceId, { type: 'subscription_cancelled', tier: 'free', status: 'cancelled' });
    } catch (wsErr: any) { log.warn('WebSocket failed on subscription.deleted', { error: wsErr.message }); }

    // DUAL-EMIT LAW: publish so TrinitySubscriptionCancelledHandler fires (email to all org owners)
    platformEventBus.publish({
      type: 'subscription_cancelled',
      category: 'billing',
      title: 'Subscription Cancelled',
      description: `Workspace ${workspaceId} subscription cancelled — reverted to free tier`,
      workspaceId,
      metadata: {
        immediate: true,
        stripeSubscriptionId: subscription.id,
        cancelledAt: new Date().toISOString(),
      },
      visibility: 'org_leadership',
    }).catch((err: any) => log.warn('platformEventBus publish failed on subscription_cancelled', { error: err?.message }));
    
    return { success: true, handled: true, message: 'Subscription cancelled, reverted to free tier' };
  }

  /**
   * Handle successful invoice payment (subscription renewal)
   */
  private async handleInvoicePaymentSucceeded(event: Stripe.Event): Promise<WebhookResult> {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = (invoice as any).subscription as string;
    
    if (!subscriptionId) {
      return { success: true, handled: false, message: 'Not a subscription invoice' };
    }
    
    let workspaceId: string | undefined;
    
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      workspaceId = subscription.metadata.workspaceId;
    } catch (error) {
      log.error('Failed to retrieve subscription', { error: (error as any).message });
    }
    
    if (!workspaceId) {
      return { success: true, handled: false, message: 'Could not resolve workspaceId from subscription' };
    }

    const amountPaid = (invoice.amount_paid || 0) / 100;
    log.info('Subscription invoice payment succeeded', { workspaceId, amountPaid, invoiceNumber: invoice.number });

    // 1. Ensure workspace is marked active (catches past_due recovery)
    await db.update(workspaces)
      .set({ subscriptionStatus: 'active', updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));

    // 2. Revenue ledger entry for subscription renewal payment
    try {
      await writeLedgerEntry({
        workspaceId,
        entryType: 'subscription_payment',
        direction: 'credit',
        amount: amountPaid,
        referenceNumber: invoice.id || undefined,
        description: `Subscription renewal payment received — $${amountPaid.toFixed(2)} (Stripe invoice ${invoice.number || invoice.id})`,
        metadata: {
          stripeInvoiceId: invoice.id,
          invoiceNumber: invoice.number,
          subscriptionId,
          source: 'stripe_webhook_invoice_payment_succeeded',
        },
      });
    } catch (ledgerErr: any) {
      log.error('Ledger entry failed on invoice.payment_succeeded', { error: ledgerErr.message });
    }

    // 3. Email notification to org_owner
    await this.sendSubscriptionEmail(workspaceId, 'payment_succeeded', {
      amount: amountPaid,
      invoiceNumber: invoice.number,
    }).catch((emailErr: any) => log.warn('Email failed on invoice.payment_succeeded', { error: emailErr.message }));

    // 4. In-platform notification
    try {
      const [ws] = await db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      if (ws?.ownerId) {
        await createNotification({
          userId: ws.ownerId,
          workspaceId,
          type: 'payment_received',
          title: 'Subscription Payment Received',
          message: `Your subscription payment of $${amountPaid.toFixed(2)} was processed successfully.`,
          actionUrl: '/settings',
          metadata: { stripeInvoiceId: invoice.id, invoiceNumber: invoice.number, amount: amountPaid },
        });
      }
    } catch (notifErr: any) { log.warn('Notification failed on invoice.payment_succeeded', { error: notifErr.message }); }

    // 5. WebSocket broadcast so billing widget reflects active status immediately
    try {
      broadcastToWorkspace(workspaceId, {
        type: 'subscription_payment_succeeded',
        amountPaid,
        invoiceNumber: invoice.number,
        status: 'active',
      });
    } catch (wsErr: any) { log.warn('WebSocket failed on invoice.payment_succeeded', { error: wsErr.message }); }

    // 6. Dual-emit law: publish to platformEventBus so Trinity + automations hear Stripe payment
    platformEventBus.publish({
      type: 'stripe_payment_received',
      category: 'automation',
      title: `Stripe Payment Confirmed`,
      description: `$${amountPaid.toFixed(2)} received via Stripe for subscription (workspace ${workspaceId})`,
      workspaceId,
      metadata: {
        stripeInvoiceId: invoice.id,
        invoiceNumber: invoice.number,
        amount: amountPaid,
        subscriptionId: (invoice as any).subscription,
        source: 'stripe_webhook_invoice_payment_succeeded',
      },
      visibility: 'manager',
    }).catch((err: any) => log.warn('platformEventBus publish failed on invoice.payment_succeeded', { error: err?.message }));

    return { success: true, handled: true, message: `Subscription payment recorded — $${amountPaid.toFixed(2)} for workspace ${workspaceId}` };
  }

  /**
   * Handle failed invoice payment — GAP 13: Stripe retry audit trail 3/5/7 days
   *
   * Stripe retries failed payments automatically (smart retry logic). Each retry fires
   * another invoice.payment_failed webhook. We log each attempt with:
   *   - Attempt number (from invoice.attempt_count)
   *   - Day offset from first failure
   *   - Context-specific message based on retry window (3 / 5 / 7 days)
   */
  private async handleInvoicePaymentFailed(event: Stripe.Event): Promise<WebhookResult> {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = (invoice as any).subscription as string;
    const attemptCount = (invoice as any).attempt_count ?? 1;
    
    if (!subscriptionId) {
      return { success: true, handled: false, message: 'Not a subscription invoice' };
    }
    
    let workspaceId: string | undefined;
    
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      workspaceId = subscription.metadata.workspaceId;
    } catch (error) {
      log.error('Failed to retrieve subscription', { error: (error as any).message });
    }
    
    if (workspaceId) {
      // ── Retry window context messages ─────────────────────────────────────
      // Stripe typically retries at 3d, 5d, 7d after first failure (smart retry)
      const RETRY_MESSAGES: Record<number, string> = {
        1: 'This is the first payment attempt. Stripe will automatically retry. Please update your payment method at your earliest convenience.',
        2: 'Second payment attempt failed (approximately 3 days after first failure). Stripe will retry again. Update your payment method to restore service.',
        3: 'Third payment attempt failed (approximately 5 days after first failure). Your account is at risk of suspension. Please update your payment method immediately.',
        4: 'Final payment attempt failed (approximately 7 days after first failure). Your subscription may be cancelled if payment is not resolved.',
      };
      const urgency: Record<number, string> = {
        1: 'Action needed',
        2: 'Action needed — 2nd attempt',
        3: 'Urgent — 3rd attempt, account at risk',
        4: 'Critical — Final attempt, subscription at risk',
      };
      const retryMsg = RETRY_MESSAGES[attemptCount] || RETRY_MESSAGES[1];
      const urgencyMsg = urgency[attemptCount] || urgency[1];
      const amountDue = (invoice.amount_due || 0) / 100;
      const nextAttemptDate = invoice.next_payment_attempt
        ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString()
        : 'N/A';

      log.info('Payment failed — retry audit', { workspaceId, attemptCount, amountDue });

      await db.update(workspaces)
        .set({
          subscriptionStatus: 'past_due',
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, workspaceId));

      await this.sendSubscriptionEmail(workspaceId, 'payment_failed', {
        amount: amountDue,
        nextAttempt: nextAttemptDate,
        attemptCount,
        retryMsg,
      });

      // ── In-platform notification with retry context ────────────────────────
      try {
        const [ws] = await db.select({ ownerId: workspaces.ownerId })
          .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (ws?.ownerId) {
          await createNotification({
            userId: ws.ownerId,
            workspaceId,
            type: 'subscription_payment_failed',
            title: `Subscription Payment Failed — ${urgencyMsg}`,
            message: `Payment of $${amountDue.toFixed(2)} failed (attempt #${attemptCount}). ${retryMsg}${nextAttemptDate !== 'N/A' ? ` Next retry: ${nextAttemptDate}.` : ''}`,
            metadata: {
              attemptCount,
              amountDue,
              invoiceId: invoice.id,
              stripeEventId: event.id,
              nextRetryDate: nextAttemptDate,
              retryAuditTimestamp: new Date().toISOString(),
              retryWindow: attemptCount === 1 ? 'initial' : attemptCount === 2 ? '3d' : attemptCount === 3 ? '5d' : '7d',
            },
            actionUrl: '/settings',
          });
        }
      } catch (notifErr: any) {
        log.warn('In-platform notification failed on invoice.payment_failed', { error: notifErr.message });
      }

      // GAP-43 FIX: Notify platform admins about payment failures.
      // Previously only the org owner received notification; platform admins had no visibility
      // into recurring payment failures across workspaces. A workspace failing payment for
      // 7+ days could be at risk of churn with no platform-level awareness.
      // Now root_admin, deputy_admin, sysop, and support_manager roles all receive a direct
      // in-platform notification so the support team can proactively reach out.
      try {
        const adminRoleRows = await db.select({ userId: platformRoles.userId })
          .from(platformRoles)
          .where(
            and(
              inArray(platformRoles.role, ['root_admin', 'deputy_admin', 'sysop', 'support_manager'] as any[]),
              isNull(platformRoles.revokedAt),
              eq(platformRoles.isSuspended, false)
            )
          );

        if (adminRoleRows.length > 0) {
          const adminNotifications = adminRoleRows.map(({ userId }) => ({
            userId,
            workspaceId: 'system',
            type: 'subscription_payment_failed',
            title: `[Platform Alert] Payment Failure — Workspace ${workspaceId}`,
            message: `Subscription payment failed for workspace ${workspaceId} (attempt #${attemptCount}). Amount: $${amountDue.toFixed(2)}. The workspace has been marked past_due. Org owner has been notified.`,
            metadata: {
              targetWorkspaceId: workspaceId,
              attemptCount,
              amountDue,
              stripeInvoiceId: invoice.id,
              stripeEventId: event.id,
              alertType: 'payment_failure_admin',
            },
            isRead: false,
            createdAt: new Date(),
          }));
          await db.insert(notifications).values(adminNotifications as any);
          log.info('Platform admin notified of payment failure', { workspaceId, adminCount: adminRoleRows.length, attemptCount });
        }
      } catch (adminNotifErr: any) {
        log.warn('Failed to notify platform admins of payment failure', { error: adminNotifErr.message, workspaceId });
      }
    }

    // DUAL-EMIT LAW: publish payment_failed so TrinityPaymentFailedHandler fires (email to org owners)
    if (workspaceId) {
      platformEventBus.publish({
        type: 'payment_failed',
        category: 'billing',
        title: `Subscription Payment Failed — Attempt #${attemptCount}`,
        description: `Payment failed for workspace ${workspaceId} (attempt #${attemptCount})`,
        workspaceId,
        metadata: {
          failureReason: 'stripe_invoice_payment_failed',
          attemptCount,
          stripeInvoiceId: invoice.id,
          amountDue: (invoice.amount_due || 0) / 100,
        },
        visibility: 'org_leadership',
      }).catch((err: any) => log.warn('platformEventBus publish failed on payment_failed', { error: err?.message }));
    }

    return {
      success: true,
      handled: true,
      message: `Invoice payment failed (attempt #${attemptCount}), workspace marked past_due, retry audit logged`,
    };
  }

  /**
   * Handle successful payment intent (one-time payments, credit purchases)
   */
  private async handlePaymentIntentSucceeded(event: Stripe.Event): Promise<WebhookResult> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const workspaceId = paymentIntent.metadata.workspaceId;

    log.info('Payment intent succeeded', { paymentIntentId: paymentIntent.id });

    let paidInvoice: any = null;

    await db.transaction(async (tx) => {
      await tx.update(invoicePayments)
        .set({
          status: 'succeeded',
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(invoicePayments.stripePaymentIntentId, paymentIntent.id));

      const [payment] = await tx.select()
        .from(invoicePayments)
        .where(eq(invoicePayments.stripePaymentIntentId, paymentIntent.id))
        .limit(1);

      if (payment) {
        const stripeAmountPaid = String((paymentIntent.amount_received ?? paymentIntent.amount) / 100);
        // G16 FIX: Only update (and therefore only write the ledger entry below) if the
        // invoice is NOT already marked paid. Stripe retries webhooks for up to 72 h; if
        // the server restarts the in-memory dedup cache is lost, so the same event can
        // fire multiple times. Gating on status != 'paid' makes the entire flow idempotent:
        // the UPDATE returns 0 rows, paidInvoice stays null, and the ledger write is skipped.
        const [updated] = await tx.update(invoices)
          .set({
            status: 'paid',
            paidAt: new Date(),
            paymentIntentId: paymentIntent.id,
            amountPaid: stripeAmountPaid,
            updatedAt: new Date(),
          })
          .where(and(eq(invoices.id, payment.invoiceId), not(eq(invoices.status, 'paid'))))
          .returning();
        paidInvoice = updated || null;
      }
    });

    if (paidInvoice && workspaceId) {
      const amountPaid = parseFloat(paidInvoice.total || '0');

      // Write revenue ledger entry for Stripe online payment
      try {
        await writeLedgerEntry({
          workspaceId,
          entryType: 'payment_received',
          direction: 'credit',
          amount: amountPaid,
          referenceNumber: paymentIntent.id,
          relatedEntityType: 'invoice',
          relatedEntityId: paidInvoice.id,
          invoiceId: paidInvoice.id,
          description: `Online payment received for ${paidInvoice.invoiceNumber} via Stripe — $${amountPaid.toFixed(2)}`,
          metadata: { stripePaymentIntentId: paymentIntent.id, source: 'stripe_webhook' },
        });
      } catch (ledgerErr: any) {
        log.error('Revenue ledger write failed on payment_intent.succeeded', { error: ledgerErr.message });
      }

      // Write transaction fee to orgLedger so it appears in the finance dashboard
      try {
        const paymentMethodTypes = paymentIntent.payment_method_types ?? [];
        const isAch = paymentMethodTypes.includes('us_bank_account');
        // ACH: 1.0% capped at $10; Card: 2.9% + $0.25
        const feeAmount = isAch
          ? parseFloat(Math.min(amountPaid * 0.01, 10.00).toFixed(2))
          : parseFloat((amountPaid * 0.029 + 0.25).toFixed(2));
        if (feeAmount > 0) {
          await writeLedgerEntry({
            workspaceId,
            entryType: 'transaction_fee',
            direction: 'debit',
            amount: feeAmount,
            referenceNumber: paymentIntent.id,
            relatedEntityType: 'invoice',
            relatedEntityId: paidInvoice.id,
            invoiceId: paidInvoice.id,
            description: `${isAch ? 'ACH' : 'Card'} processing fee for ${paidInvoice.invoiceNumber} — $${feeAmount.toFixed(2)}`,
            metadata: { paymentMethod: isAch ? 'ach' : 'card', stripePaymentIntentId: paymentIntent.id, source: 'stripe_webhook' },
          });
        }
      } catch (feeErr: any) {
        log.warn('Transaction fee ledger write failed on payment_intent.succeeded', { error: feeErr.message });
      }

      // Notify org_owner in-platform
      try {
        const [ws] = await db.select({ ownerId: workspaces.ownerId })
          .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (ws?.ownerId) {
          await createNotification({
            userId: ws.ownerId,
            workspaceId,
            type: 'invoice_paid',
            title: 'Invoice Paid',
            message: `Invoice ${paidInvoice.invoiceNumber} has been paid online — $${amountPaid.toFixed(2)}.`,
            relatedEntityType: 'invoice',
            relatedEntityId: paidInvoice.id,
          });
        }
      } catch (notifErr: any) {
        log.warn('Org owner notification failed on payment_intent.succeeded', { error: notifErr.message });
      }

      // Broadcast dashboard update
      try {
        broadcastToWorkspace(workspaceId, {
          type: 'invoices_updated',
          action: 'paid',
          invoiceId: paidInvoice.id,
          invoiceNumber: paidInvoice.invoiceNumber,
          amount: paidInvoice.total,
          paymentMethod: 'stripe',
          stripePaymentIntentId: paymentIntent.id,
          paidAt: new Date().toISOString(),
        });
      } catch (wsErr: any) {
        log.warn('WebSocket broadcast failed on payment_intent.succeeded', { error: wsErr.message });
      }

      // Send payment receipt to client
      try {
        const { clients: clientsTable } = await import('@shared/schema');
        const { sendPaymentReceiptToClientEmail } = await import('../emailCore');
        if (paidInvoice.clientId) {
          const [clientRow] = await db.select({
            email: clientsTable.email,
            companyName: clientsTable.companyName,
            firstName: clientsTable.firstName,
            lastName: clientsTable.lastName,
          }).from(clientsTable).where(eq(clientsTable.id, paidInvoice.clientId)).limit(1);
          if (clientRow?.email) {
            const clientName = clientRow.companyName
              || [clientRow.firstName, clientRow.lastName].filter(Boolean).join(' ')
              || 'Valued Client';
            const paymentDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            await sendPaymentReceiptToClientEmail(clientRow.email, {
              clientName,
              invoiceNumber: paidInvoice.invoiceNumber || paidInvoice.id.substring(0, 8),
              amountPaid: amountPaid.toFixed(2),
              paymentDate,
              paymentMethod: 'online',
              referenceNumber: paymentIntent.id,
            }, workspaceId);
          }
        }
      } catch (emailErr: any) {
        log.warn('Client payment receipt email failed on payment_intent.succeeded', { error: emailErr.message });
      }
    }

    return { success: true, handled: true, message: 'Payment intent succeeded' };
  }

  /**
   * Handle successful Stripe charge — fires for both card captures and ACH debit confirmations.
   * Stores the charge ID on the payment record and, if the invoice was not already marked paid
   * by payment_intent.succeeded, marks it paid now and writes the revenue ledger entry.
   */
  private async handleChargeSucceeded(event: Stripe.Event): Promise<WebhookResult> {
    const charge = event.data.object as Stripe.Charge;

    // Charges not attached to a PaymentIntent don't correspond to invoice payments — skip.
    const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
    if (!paymentIntentId) {
      log.info('charge.succeeded has no payment_intent — skipping invoice processing', { chargeId: charge.id });
      return { success: true, handled: true, message: 'charge.succeeded — no payment intent, nothing to do' };
    }

    log.info('Charge succeeded', { chargeId: charge.id, paymentIntentId });

    let paidInvoice: any = null;
    let workspaceId: string | null = null;
    let wasAlreadyPaid = false;

    await db.transaction(async (tx) => {
      // Record the Stripe charge ID on the payment record.
      await tx.update(invoicePayments)
        .set({
          stripeChargeId: charge.id,
          status: 'succeeded',
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(invoicePayments.stripePaymentIntentId, paymentIntentId));

      const [payment] = await tx.select()
        .from(invoicePayments)
        .where(eq(invoicePayments.stripePaymentIntentId, paymentIntentId))
        .limit(1);

      if (!payment?.invoiceId) return;

      workspaceId = payment.workspaceId;
      const amountPaid = String(charge.amount / 100);

      // Idempotent mark-paid: only update if NOT already paid.
      const [updated] = await tx.update(invoices)
        .set({
          status: 'paid',
          paidAt: new Date(),
          amountPaid,
          updatedAt: new Date(),
        })
        .where(and(eq(invoices.id, payment.invoiceId), not(eq(invoices.status, 'paid'))))
        .returning();

      if (updated) {
        paidInvoice = updated;
      } else {
        // Invoice was already paid (payment_intent.succeeded ran first) — just record chargeId.
        wasAlreadyPaid = true;
      }
    });

    if (!workspaceId) {
      log.warn('charge.succeeded — no matching invoicePayments record', { paymentIntentId, chargeId: charge.id });
      return { success: true, handled: true, message: 'charge.succeeded — no matching invoice payment record' };
    }

    if (wasAlreadyPaid) {
      log.info('charge.succeeded — invoice already paid, stripeChargeId recorded', { chargeId: charge.id, paymentIntentId });
      return { success: true, handled: true, message: 'charge.succeeded — invoice already paid, chargeId recorded' };
    }

    if (paidInvoice) {
      const amountPaid = charge.amount / 100;

      // Write revenue ledger entry.
      try {
        await writeLedgerEntry({
          workspaceId,
          entryType: 'payment_received',
          direction: 'credit',
          amount: amountPaid,
          referenceNumber: charge.id,
          relatedEntityType: 'invoice',
          relatedEntityId: paidInvoice.id,
          invoiceId: paidInvoice.id,
          description: `Payment received for ${paidInvoice.invoiceNumber} via Stripe — $${amountPaid.toFixed(2)} (charge ${charge.id})`,
          metadata: { stripeChargeId: charge.id, paymentIntentId, source: 'stripe_webhook_charge_succeeded' },
        });
      } catch (ledgerErr: any) {
        log.error('Revenue ledger write failed on charge.succeeded', { error: ledgerErr.message });
      }

      // Write transaction fee to orgLedger.
      try {
        const isAch = charge.payment_method_details?.type === 'us_bank_account';
        const feeAmount = isAch
          ? parseFloat(Math.min(amountPaid * 0.01, 10.00).toFixed(2))
          : parseFloat((amountPaid * 0.029 + 0.25).toFixed(2));
        if (feeAmount > 0) {
          await writeLedgerEntry({
            workspaceId,
            entryType: 'transaction_fee',
            direction: 'debit',
            amount: feeAmount,
            referenceNumber: charge.id,
            relatedEntityType: 'invoice',
            relatedEntityId: paidInvoice.id,
            invoiceId: paidInvoice.id,
            description: `${isAch ? 'ACH' : 'Card'} processing fee for ${paidInvoice.invoiceNumber} — $${feeAmount.toFixed(2)}`,
            metadata: { paymentMethod: isAch ? 'ach' : 'card', stripeChargeId: charge.id, source: 'stripe_webhook_charge_succeeded' },
          });
        }
      } catch (feeErr: any) {
        log.warn('Transaction fee ledger write failed on charge.succeeded', { error: feeErr.message });
      }

      // Notify org_owner in-platform.
      try {
        const [ws] = await db.select({ ownerId: workspaces.ownerId })
          .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (ws?.ownerId) {
          await createNotification({
            userId: ws.ownerId,
            workspaceId,
            type: 'invoice_paid',
            title: 'Invoice Paid',
            message: `Invoice ${paidInvoice.invoiceNumber} has been paid — $${amountPaid.toFixed(2)}.`,
            relatedEntityType: 'invoice',
            relatedEntityId: paidInvoice.id,
          });
        }
      } catch (notifErr: any) {
        log.warn('Org owner notification failed on charge.succeeded', { error: notifErr.message });
      }

      // Broadcast dashboard update.
      try {
        broadcastToWorkspace(workspaceId, {
          type: 'invoices_updated',
          action: 'paid',
          invoiceId: paidInvoice.id,
          invoiceNumber: paidInvoice.invoiceNumber,
          amount: paidInvoice.total,
          paymentMethod: 'stripe',
          stripeChargeId: charge.id,
          paidAt: new Date().toISOString(),
        });
      } catch (wsErr: any) {
        log.warn('WebSocket broadcast failed on charge.succeeded', { error: wsErr.message });
      }

      platformEventBus.publish({
        type: 'invoice_paid',
        category: 'billing',
        title: `Invoice Paid — ${paidInvoice.invoiceNumber}`,
        description: `Invoice ${paidInvoice.invoiceNumber} paid — $${amountPaid.toFixed(2)}`,
        workspaceId,
        metadata: { chargeId: charge.id, invoiceId: paidInvoice.id, invoiceNumber: paidInvoice.invoiceNumber, amountPaid },
      }).catch((err: any) => log.warn('[stripeWebhooks] publish invoice_paid failed on charge.succeeded:', err.message));
    }

    return { success: true, handled: true, message: 'charge.succeeded — invoice marked paid, ledger updated' };
  }

  /**
   * Handle failed payment intent
   */
  private async handlePaymentIntentFailed(event: Stripe.Event): Promise<WebhookResult> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    
    log.info('Payment intent failed', { paymentIntentId: paymentIntent.id });
    
    // RC2 (Phase 2): Atomic — payment record + invoice status must reflect failure together.
    // If the invoice update fails, the payment update rolls back so the webhook can retry cleanly.
    const { updatedInvoiceId } = await db.transaction(async (tx) => {
      const [updatedPayment] = await tx.update(invoicePayments)
        .set({
          status: 'failed',
          failureCode: paymentIntent.last_payment_error?.code || 'unknown',
          failureMessage: paymentIntent.last_payment_error?.message || 'Payment failed',
          updatedAt: new Date(),
        })
        .where(eq(invoicePayments.stripePaymentIntentId, paymentIntent.id))
        .returning({ invoiceId: invoicePayments.invoiceId });

      // Propagate failure status to the parent invoice so the UI shows the correct state.
      // Without this, the invoice stays 'pending' indefinitely after a card decline.
      if (updatedPayment?.invoiceId) {
        await tx.update(invoices)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(invoices.id, updatedPayment.invoiceId));
        return { updatedInvoiceId: updatedPayment.invoiceId };
      }
      return { updatedInvoiceId: undefined as string | undefined };
    });
    if (updatedInvoiceId) {
      log.info('Invoice status updated to payment_failed', { invoiceId: updatedInvoiceId, paymentIntentId: paymentIntent.id });
    }
    
    return { success: true, handled: true, message: 'Payment intent failed, invoice and payment record updated' };
  }

  /**
   * Handle completed checkout session (for subscription creation or credit purchase)
   */
  private async handleCheckoutSessionCompleted(event: Stripe.Event): Promise<WebhookResult> {
    const session = event.data.object as Stripe.Checkout.Session;
    const workspaceId = session.metadata?.workspaceId;
    const userId = session.metadata?.userId;
    const creditPackId = session.metadata?.creditPackId;
    
    log.info('Checkout session completed', { sessionId: session.id });
    
    if (creditPackId && workspaceId && userId) {
      const { creditPurchaseService } = await import('./creditPurchase');
      await (creditPurchaseService as any).handlePaymentSuccess(session);
      return { success: true, handled: true, message: 'Credit purchase fulfilled' };
    }

    // Subscription checkout completed — activate workspace
    if (workspaceId && session.subscription) {
      try {
        const { storage } = await import('../../storage');
        // GAP-38 FIX: Never default to 'enterprise'. If metadata.tier is missing or invalid,
        // reject the webhook so Stripe retries rather than silently granting enterprise access
        // to a customer who may have purchased a lower tier.
        const VALID_TIERS = new Set<string>(['trial', 'free', 'starter', 'professional', 'business', 'enterprise']);
        const rawTier = session.metadata?.tier;
        if (!rawTier || !VALID_TIERS.has(rawTier)) {
          log.error('checkout.session.completed: missing or invalid tier — rejecting to prevent accidental enterprise grant', {
            rawTier,
            workspaceId,
            sessionId: session.id,
          });
          return { success: false, handled: false, message: `checkout.session.completed rejected: tier '${rawTier}' is not a valid subscription tier` };
        }
        const tier = rawTier as SubscriptionTier;

        const updatePayload: Record<string, any> = {
          subscriptionStatus: 'active',
          subscriptionTier: tier,
          stripeSubscriptionId: session.subscription as string,
        };

        // 1. Store Stripe customer ID — prevents creating duplicate Stripe customers on future checkouts
        if (session.customer) {
          updatePayload.stripeCustomerId = session.customer as string;
        }

        await storage.updateWorkspace(workspaceId, updatePayload);

        // 2. Reinitialize credits for the new tier
        try {
          const { creditManager } = await import('./creditManager');
          await creditManager.initializeCredits(workspaceId, tier as any);
        } catch (_) { /* non-fatal */ }
        log.info('Workspace activated via checkout', { workspaceId, tier, customerId: session.customer });

        // 3. Fire welcome subscription email to org_owner
        await this.sendSubscriptionEmail(workspaceId, 'subscription_created', {
          tier,
          billingCycle: session.metadata?.billingCycle || 'monthly',
        }).catch((emailErr: any) =>
          log.warn('Welcome email failed on checkout.session.completed', { error: emailErr.message })
        );

        // 4. In-platform notification so org_owner sees confirmation even if email is delayed
        try {
          const [ws] = await db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
          if (ws?.ownerId) {
            await createNotification({
              userId: ws.ownerId,
              workspaceId,
              type: 'subscription_activated',
              title: 'Subscription Activated',
              message: `Your ${tier} subscription is now active. All features are unlocked.`,
              actionUrl: '/settings',
              metadata: { tier, billingCycle: session.metadata?.billingCycle || 'monthly', sessionId: session.id },
            });
          }
        } catch (notifErr: any) { log.warn('Notification failed on checkout.session.completed', { error: notifErr.message }); }

        // 5. WebSocket broadcast so billing widget updates in real-time
        try {
          broadcastToWorkspace(workspaceId, {
            type: 'subscription_activated',
            tier,
            status: 'active',
            stripeSubscriptionId: session.subscription,
          });
        } catch (wsErr: any) { log.warn('WebSocket failed on checkout.session.completed', { error: wsErr.message }); }

        // Trinity publish — checkout activation must be visible in event stream
        platformEventBus.publish({
          type: 'subscription_activated',
          category: 'billing',
          title: `Subscription Activated — ${tier}`,
          description: `Workspace ${workspaceId} activated ${tier} plan via checkout`,
          workspaceId,
          metadata: { tier, billingCycle: session.metadata?.billingCycle || 'monthly', sessionId: session.id, stripeSubscriptionId: session.subscription },
        }).catch((err: any) => log.warn('[stripeWebhooks] publish subscription_activated failed:', err.message));

      } catch (activateErr: any) {
        log.error('Failed to activate workspace', { error: activateErr.message });
      }
    }

    return { success: true, handled: true, message: 'Checkout session completed' };
  }

  /**
   * Handle refund — reverts invoice status, writes ledger reversal, notifies org_owner.
   */
  private async handleChargeRefunded(event: Stripe.Event): Promise<WebhookResult> {
    const charge = event.data.object as Stripe.Charge;
    const chargeTotal = charge.amount / 100;
    const refundedAmount = charge.amount_refunded / 100;
    const isFullRefund = refundedAmount >= chargeTotal;
    const newInvoiceStatus = isFullRefund ? 'refunded' : 'partially_refunded';

    log.info('Charge refunded', { chargeId: charge.id, refundedAmount, isFullRefund });

    // RC2 (Phase 2): Atomic — invoicePayments + invoices revert must both succeed or both
    // roll back so a retried charge.refunded webhook doesn't produce split state.
    const { refundedInvoice, workspaceId } = charge.payment_intent
      ? await db.transaction(async (tx) => {
          const paymentIntentId = charge.payment_intent as string;

          // 1. Update invoicePayments record
          await tx.update(invoicePayments)
            .set({
              status: newInvoiceStatus as any,
              refundedAmount: String(refundedAmount),
              refundedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(invoicePayments.stripePaymentIntentId, paymentIntentId));

          // 2. Find the linked invoice via invoicePayments (within same tx for snapshot isolation)
          const [payment] = await tx.select({ invoiceId: invoicePayments.invoiceId })
            .from(invoicePayments)
            .where(eq(invoicePayments.stripePaymentIntentId, paymentIntentId))
            .limit(1);

          if (!payment?.invoiceId) {
            return { refundedInvoice: null as any, workspaceId: undefined as string | undefined };
          }

          // 3. Revert invoice.status — paid invoices must not stay 'paid' after a refund
          const [updated] = await tx.update(invoices)
            .set({ status: newInvoiceStatus as any, updatedAt: new Date() })
            .where(eq(invoices.id, payment.invoiceId))
            .returning();

          return { refundedInvoice: updated || null, workspaceId: updated?.workspaceId as string | undefined };
        })
      : { refundedInvoice: null as any, workspaceId: undefined as string | undefined };

    if (refundedInvoice && workspaceId) {
      // 4. Write revenue ledger reversal — cash leaves the business so balance decreases
      try {
        await writeLedgerEntry({
          workspaceId,
          entryType: 'refund',
          // GAP-26 FIX: Stripe refund is cash LEAVING → balance must go down → direction: 'credit'.
          // Previous 'debit' (with misleading comment "money leaving") incorrectly INCREASED
          // the org ledger balance on every Stripe-backed refund processed via this webhook.
          direction: 'credit',
          amount: refundedAmount,
          referenceNumber: charge.id,
          relatedEntityType: 'invoice',
          relatedEntityId: refundedInvoice.id,
          invoiceId: refundedInvoice.id,
          description: `Stripe refund of $${refundedAmount.toFixed(2)} for invoice ${refundedInvoice.invoiceNumber} (${isFullRefund ? 'full' : 'partial'} refund) — charge ${charge.id}`,
          metadata: { chargeId: charge.id, isFullRefund, originalAmount: chargeTotal, refundedAmount, source: 'stripe_webhook' },
        });
      } catch (ledgerErr: any) {
        log.error('Revenue ledger reversal failed on charge.refunded', { error: ledgerErr.message });
      }

      // 5. Notify org_owner in-platform
      try {
        const [ws] = await db.select({ ownerId: workspaces.ownerId })
          .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (ws?.ownerId) {
          await createNotification({
            userId: ws.ownerId,
            workspaceId,
            type: 'invoice_refunded',
            title: isFullRefund ? 'Invoice Refunded' : 'Invoice Partially Refunded',
            message: `A ${isFullRefund ? 'full' : 'partial'} refund of $${refundedAmount.toFixed(2)} was issued for invoice ${refundedInvoice.invoiceNumber}. Revenue ledger has been updated.`,
            actionUrl: `/invoices/${refundedInvoice.id}`,
            relatedEntityType: 'invoice',
            relatedEntityId: refundedInvoice.id,
            metadata: { chargeId: charge.id, refundedAmount, isFullRefund },
          });
        }
      } catch (notifErr: any) {
        log.warn('Org owner notification failed on charge.refunded', { error: notifErr.message });
      }

      // 6. Broadcast dashboard update
      try {
        broadcastToWorkspace(workspaceId, {
          type: 'invoices_updated',
          action: newInvoiceStatus,
          invoiceId: refundedInvoice.id,
          invoiceNumber: refundedInvoice.invoiceNumber,
          refundedAmount,
          isFullRefund,
        });
      } catch (wsErr: any) {
        log.warn('WebSocket broadcast failed on charge.refunded', { error: wsErr.message });
      }

      // Trinity publish — refund must be visible in financial event stream (dual-emit: canonical + legacy)
      platformEventBus.publish({
        type: 'refund_issued',
        category: 'billing',
        title: isFullRefund ? `Invoice Refunded — ${refundedInvoice.invoiceNumber}` : `Invoice Partially Refunded — ${refundedInvoice.invoiceNumber}`,
        description: `${isFullRefund ? 'Full' : 'Partial'} refund of $${refundedAmount.toFixed(2)} processed for invoice ${refundedInvoice.invoiceNumber}`,
        workspaceId,
        metadata: { chargeId: charge.id, invoiceId: refundedInvoice.id, invoiceNumber: refundedInvoice.invoiceNumber, refundedAmount, isFullRefund, newStatus: newInvoiceStatus },
      }).catch((err: any) => log.warn('[stripeWebhooks] publish refund_issued failed:', err.message));
      platformEventBus.publish({
        type: 'payment_refunded',
        category: 'billing',
        title: isFullRefund ? `Invoice Refunded — ${refundedInvoice.invoiceNumber}` : `Invoice Partially Refunded — ${refundedInvoice.invoiceNumber}`,
        description: `${isFullRefund ? 'Full' : 'Partial'} refund of $${refundedAmount.toFixed(2)} processed for invoice ${refundedInvoice.invoiceNumber}`,
        workspaceId,
        metadata: { chargeId: charge.id, invoiceId: refundedInvoice.id, invoiceNumber: refundedInvoice.invoiceNumber, refundedAmount, isFullRefund, newStatus: newInvoiceStatus },
      }).catch((err: any) => log.warn('[stripeWebhooks] publish payment_refunded failed:', err.message));
    }

    return { success: true, handled: true, message: `Refund processed — invoice status reverted to '${newInvoiceStatus}', ledger reversed, owner notified` };
  }

  /**
   * Handle chargeback/dispute — notify org owner, flag invoice for review
   */
  private async handleChargeDisputeCreated(event: Stripe.Event): Promise<WebhookResult> {
    const dispute = event.data.object as Stripe.Dispute;
    const disputeAmount = dispute.amount / 100;
    const disputeReason = dispute.reason;
    const chargeId = dispute.charge as string;

    log.warn('Chargeback received', { disputeId: dispute.id, chargeId, disputeAmount, disputeReason });

    let disputedInvoice: any = null;
    let workspaceId: string | undefined;

    // Find the invoice linked to the disputed charge
    const [payment] = await db.select({
      invoiceId: invoicePayments.invoiceId,
      invoice: invoices
    })
      .from(invoicePayments)
      .innerJoin(invoices, eq(invoicePayments.invoiceId, invoices.id))
      .where(eq(invoicePayments.stripeChargeId, chargeId))
      .limit(1);

    if (payment) {
      disputedInvoice = payment.invoice;
      workspaceId = disputedInvoice.workspaceId;

      // Notify org_owner about chargeback
      try {
        const [ws] = await db.select({ ownerId: workspaces.ownerId })
          // @ts-expect-error — TS migration: fix in refactoring sprint
          .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (ws?.ownerId) {
          await createNotification({
            userId: ws.ownerId,
            // @ts-expect-error — TS migration: fix in refactoring sprint
            workspaceId,
            type: 'chargeback_received',
            title: `⚠️ Chargeback Received`,
            message: `A chargeback for $${disputeAmount.toFixed(2)} was filed on invoice ${disputedInvoice.invoiceNumber}. Reason: ${disputeReason}. Immediate action required.`,
            actionUrl: `/invoices/${disputedInvoice.id}`,
            relatedEntityType: 'invoice',
            relatedEntityId: disputedInvoice.id,
            metadata: { disputeId: dispute.id, chargeId, disputeAmount, disputeReason, status: dispute.status },
          });
        }
      } catch (notifErr: any) {
        log.warn('Org owner notification failed on charge.dispute.created', { error: notifErr.message });
      }

      // Trinity publish — chargeback must be visible for escalation
      platformEventBus.publish({
        type: 'chargeback_received',
        category: 'billing',
        title: `Chargeback Received — ${disputedInvoice.invoiceNumber}`,
        description: `Chargeback for $${disputeAmount.toFixed(2)} filed on invoice ${disputedInvoice.invoiceNumber}. Reason: ${disputeReason}`,
        workspaceId,
        metadata: {
          disputeId: dispute.id,
          chargeId,
          invoiceId: disputedInvoice.id,
          invoiceNumber: disputedInvoice.invoiceNumber,
          disputeAmount,
          disputeReason,
          disputeStatus: dispute.status,
        },
        visibility: 'org_leadership',
      }).catch((err: any) => log.warn('[stripeWebhooks] publish chargeback_received failed:', err.message));

      // Broadcast dashboard alert
      try {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        broadcastToWorkspace(workspaceId, {
          type: 'chargeback_alert',
          invoiceId: disputedInvoice.id,
          invoiceNumber: disputedInvoice.invoiceNumber,
          disputeAmount,
          disputeReason,
        });
      } catch (wsErr: any) {
        log.warn('WebSocket broadcast failed on charge.dispute.created', { error: wsErr.message });
      }
    }

    return { success: true, handled: true, message: 'Chargeback notification sent to org owner' };
  }

  /**
   * Handle invoice.created — Stripe creates a draft invoice for the upcoming subscription charge.
   * We log this event for audit traceability but take no billing action.
   */
  private async handleInvoiceCreated(event: Stripe.Event): Promise<WebhookResult> {
    const invoice = event.data.object as Stripe.Invoice;
    log.info('Stripe invoice created (draft)', { stripeInvoiceId: invoice.id, status: invoice.status, subscriptionId: (invoice as any).subscription });
    return { success: true, handled: true, message: `invoice.created acknowledged — Stripe invoice ${invoice.id} (status: ${invoice.status})` };
  }

  /**
   * Handle invoice.finalized — Stripe has finalized the invoice and will now attempt payment.
   * We log this for audit traceability. The actual payment outcome arrives via invoice.payment_succeeded
   * or invoice.payment_failed.
   */
  private async handleInvoiceFinalized(event: Stripe.Event): Promise<WebhookResult> {
    const invoice = event.data.object as Stripe.Invoice;
    const amountDue = (invoice.amount_due || 0) / 100;
    log.info('Stripe invoice finalized — payment will be attempted', { stripeInvoiceId: invoice.id, amountDue, subscriptionId: (invoice as any).subscription });
    return { success: true, handled: true, message: `invoice.finalized acknowledged — $${amountDue.toFixed(2)} will be collected via Stripe` };
  }

  /**
   * Handle customer.created — Stripe customer record created (e.g., during checkout).
   * We store the stripeCustomerId on the matching workspace if not already set.
   */
  private async handleCustomerCreated(event: Stripe.Event): Promise<WebhookResult> {
    const customer = event.data.object as Stripe.Customer;
    const workspaceId = customer.metadata?.workspaceId;
    log.info('Stripe customer created', { customerId: customer.id, workspaceId });

    if (workspaceId) {
      try {
        const [ws] = await db.select({ id: workspaces.id, stripeCustomerId: workspaces.stripeCustomerId })
          .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (ws && !ws.stripeCustomerId) {
          await db.update(workspaces).set({ stripeCustomerId: customer.id, updatedAt: new Date() }).where(eq(workspaces.id, workspaceId));
          log.info('Stored Stripe customer ID on workspace', { workspaceId, customerId: customer.id });
        }
      } catch (err: any) {
        log.warn('Failed to store Stripe customer ID on workspace', { error: (err instanceof Error ? err.message : String(err)) });
      }
    }

    return { success: true, handled: true, message: `customer.created — Stripe customer ${customer.id}${workspaceId ? ` linked to workspace ${workspaceId}` : ' (no workspaceId in metadata)'}` };
  }

  /**
   * Handle customer.deleted — Stripe customer record permanently deleted.
   * We clear the stripeCustomerId from the workspace so future checkouts create a fresh customer.
   */
  private async handleCustomerDeleted(event: Stripe.Event): Promise<WebhookResult> {
    const customer = event.data.object as Stripe.Customer;
    const workspaceId = customer.metadata?.workspaceId;
    log.info('Stripe customer deleted', { customerId: customer.id, workspaceId });

    if (workspaceId) {
      try {
        await db.update(workspaces)
          .set({ stripeCustomerId: null, updatedAt: new Date() })
          .where(and(eq(workspaces.id, workspaceId), eq(workspaces.stripeCustomerId, customer.id)));
        log.info('Cleared stripeCustomerId from workspace', { workspaceId, customerId: customer.id });
      } catch (err: any) {
        log.warn('Failed to clear stripeCustomerId from workspace', { error: (err instanceof Error ? err.message : String(err)) });
      }
    }

    return { success: true, handled: true, message: `customer.deleted — stripeCustomerId cleared from workspace ${workspaceId || '(unknown)'}` };
  }

  /**
   * Handle customer.updated — email, name, or default payment method changed in Stripe.
   * Syncs updated customer email back to the workspace billing contact if it changed.
   * T010 FIX: This event was previously unhandled; changes to the Stripe customer object
   * were silently dropped and never synced to the local workspace record.
   */
  private async handleCustomerUpdated(event: Stripe.Event): Promise<WebhookResult> {
    const customer = event.data.object as Stripe.Customer;
    const workspaceId = customer.metadata?.workspaceId;
    log.info('Stripe customer updated', { customerId: customer.id, workspaceId, email: customer.email });

    if (!workspaceId) {
      return { success: true, handled: true, message: 'customer.updated — no workspaceId in metadata, skipping' };
    }

    try {
      const updates: Record<string, unknown> = { updatedAt: new Date() };

      // Sync billing email if customer email changed
      if (customer.email) {
        updates.billingEmail = customer.email;
      }

      // Sync customer name if available (company name from Stripe)
      if (customer.name) {
        updates.billingName = customer.name;
      }

      await db.update(workspaces)
        .set(updates as any)
        .where(and(eq(workspaces.id, workspaceId), eq(workspaces.stripeCustomerId, customer.id)));

      log.info('Synced customer update to workspace', { workspaceId, customerId: customer.id, email: customer.email });
    } catch (err: any) {
      log.warn('Failed to sync customer.updated to workspace', {
        customerId: customer.id,
        workspaceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return { success: true, handled: true, message: `customer.updated — synced to workspace ${workspaceId}` };
  }

  /**
   * Log subscription payment record
   */
  private async logSubscriptionPayment(params: {
    workspaceId: string;
    stripeSubscriptionId: string;
    tier: string;
    billingCycle: string;
    amount: number;
    status: string;
  }): Promise<void> {
    try {
      await db.insert(subscriptionPayments).values({
        workspaceId: params.workspaceId,
        stripePaymentIntentId: params.stripeSubscriptionId,
        amount: String(params.amount / 100),
        status: params.status,
        currency: 'usd',
        paidAt: new Date(),
      });
    } catch (error) {
      log.error('Failed to log subscription payment', { error: (error as any).message });
    }
  }

  /**
   * Send subscription-related email via email automation
   */
  private async sendSubscriptionEmail(
    workspaceId: string,
    emailType: string,
    data: Record<string, any>
  ): Promise<void> {
    try {
      const [workspace] = await db.select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      
      if (!workspace?.ownerId) return;
      
      const [owner] = await db.select()
        .from(users)
        .where(eq(users.id, workspace.ownerId))
        .limit(1);
      
      if (!owner?.email) return;
      
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const { sendEmail } = await import('../emailAutomation'); // infra
      
      const templates: Record<string, { subject: string; html: string }> = {
        subscription_created: {
          subject: `Welcome to ${PLATFORM.name}! Your subscription is active`,
          html: `<h1>Welcome to ${PLATFORM.name}!</h1>
            <p>Your ${data.tier} subscription is now active.</p>
            <p>Billing cycle: ${data.billingCycle}</p>
            <p>Start exploring your AI-powered workforce management features today!</p>`,
        },
        subscription_upgraded: {
          subject: 'Subscription upgraded successfully',
          html: `<h1>Upgrade Complete!</h1>
            <p>You've upgraded from ${data.previousTier} to ${data.newTier}.</p>
            <p>Your new features are now available.</p>`,
        },
        subscription_downgraded: {
          subject: 'Subscription plan changed',
          html: `<h1>Plan Changed</h1>
            <p>Your subscription has been changed from ${data.previousTier} to ${data.newTier}.</p>
            <p>This change will take effect at the end of your billing period.</p>`,
        },
        subscription_cancelled: {
          subject: 'We\'re sorry to see you go',
          html: `<h1>Subscription Cancelled</h1>
            <p>Your subscription has been cancelled.</p>
            <p>You'll continue to have access to the free tier features.</p>
            <p>We'd love to have you back - reach out if you have any questions!</p>`,
        },
        payment_succeeded: {
          subject: 'Payment received - Thank you!',
          html: `<h1>Payment Confirmed</h1>
            <p>We've received your payment of $${data.amount}.</p>
            <p>Invoice: ${data.invoiceNumber || 'N/A'}</p>
            <p>Thank you for being a ${PLATFORM.name} customer!</p>`,
        },
        payment_failed: {
          subject: 'Action required: Payment failed',
          html: `<h1>Payment Issue</h1>
            <p>We couldn't process your payment of $${data.amount}.</p>
            <p>Next attempt: ${data.nextAttempt}</p>
            <p>Please update your payment method to avoid service interruption.</p>
            <p><a href="${process.env.BASE_URL || ''}/billing">Update Payment Method</a></p>`,
        },
        // Phase 41 — new lifecycle email templates
        trial_ending: {
          subject: `Your ${PLATFORM.name} trial ends in ${data.daysRemaining ?? 3} day${data.daysRemaining !== 1 ? 's' : ''}`,
          html: `<h1>Trial Ending Soon</h1>
            <p>Your free trial expires ${data.trialEnd ? `on <strong>${data.trialEnd}</strong>` : 'soon'}.</p>
            <p>Add a payment method now to continue using ${PLATFORM.name} without interruption.</p>
            <p><a href="${process.env.BASE_URL || ''}/settings?tab=billing">Add Payment Method</a></p>`,
        },
        subscription_suspended: {
          subject: `Your ${PLATFORM.name} account has been suspended`,
          html: `<h1>Account Suspended</h1>
            <p>Your subscription has been paused due to a payment issue. Your account is now in read-only mode.</p>
            <p>Update your payment method to restore full access.</p>
            <p><a href="${process.env.BASE_URL || ''}/settings?tab=billing">Resolve Payment Issue</a></p>`,
        },
        subscription_reactivated: {
          subject: `Your ${PLATFORM.name} account is back!`,
          html: `<h1>Account Reactivated</h1>
            <p>Your subscription has been resumed. Full access to ${PLATFORM.name} is restored.</p>
            <p>Thank you for updating your payment method.</p>`,
        },
      };
      
      const template = templates[emailType];
      if (!template) return;
      
      const { NotificationDeliveryService } = await import('../notificationDeliveryService');
      await NotificationDeliveryService.send({
        type: 'billing_notification',
        workspaceId,
        recipientUserId: owner.id,
        channel: 'email',
        subject: template.subject,
        body: {
          to: owner.email,
          subject: template.subject,
          html: template.html,
        },
      });
      
      log.info('Sent subscription email via NDS', { emailType, recipientEmail: owner.email });
    } catch (error) {
      log.error('Failed to send subscription email', { emailType, error: (error as any).message });
    }
  }

  /**
   * Map Stripe subscription status to internal status
   */
  private mapSubscriptionStatus(stripeStatus: Stripe.Subscription.Status): string {
    const statusMap: Record<string, string> = {
      active: 'active',
      past_due: 'past_due',
      unpaid: 'suspended',
      canceled: 'cancelled',
      incomplete: 'pending',
      incomplete_expired: 'expired',
      trialing: 'trial',
      paused: 'suspended', // Phase 41: Stripe "paused" → our "suspended" FSM state
    };
    return statusMap[stripeStatus] || 'unknown';
  }

  /**
   * Determine if tier change is an upgrade
   */
  private isUpgrade(fromTier: SubscriptionTier, toTier: SubscriptionTier): boolean {
    const tierOrder = { free: 0, starter: 1, professional: 2, enterprise: 3 };
    // @ts-expect-error — TS migration: fix in refactoring sprint
    return tierOrder[toTier] > tierOrder[fromTier];
  }

  // ── Phase 41 — Subscription Lifecycle FSM Handlers ───────────────────────

  /**
   * Handle customer.subscription.trial_will_end
   * Stripe fires this 3 days before the trial expires.
   * FSM: trial → (this fires) → active (on payment) or cancelled (on expiry)
   */
  private async handleSubscriptionTrialWillEnd(event: Stripe.Event): Promise<WebhookResult> {
    const subscription = event.data.object as Stripe.Subscription;
    const workspaceId = subscription.metadata.workspaceId;
    if (!workspaceId) {
      log.warn('trial_will_end: missing workspaceId in subscription metadata');
      return { success: true, handled: false, message: 'No workspaceId in metadata' };
    }

    const trialEndTs = subscription.trial_end;
    const trialEndDate = trialEndTs ? new Date(trialEndTs * 1000) : null;
    const daysRemaining = trialEndDate
      ? Math.max(0, Math.ceil((trialEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : 3;

    log.info('Trial will end soon', { workspaceId, daysRemaining, trialEnd: trialEndDate?.toISOString() });

    // Notify workspace owner via in-platform notification
    try {
      const [ws] = await db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      if (ws?.ownerId) {
        await createNotification({
          userId: ws.ownerId,
          workspaceId,
          type: 'trial_ending_soon',
          title: `Trial Ending in ${daysRemaining} Day${daysRemaining !== 1 ? 's' : ''}`,
          message: `Your free trial expires ${trialEndDate ? `on ${trialEndDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : 'soon'}. Add a payment method to continue using ${PLATFORM.name} without interruption.`,
          metadata: { daysRemaining, trialEnd: trialEndDate?.toISOString(), stripeSubscriptionId: subscription.id },
          actionUrl: '/settings?tab=billing',
        });
      }
    } catch (notifErr: any) {
      log.warn('Notification failed on trial_will_end', { error: notifErr.message });
    }

    // Email
    await this.sendSubscriptionEmail(workspaceId, 'trial_ending', { daysRemaining, trialEnd: trialEndDate?.toLocaleDateString() });

    // WebSocket broadcast
    try {
      broadcastToWorkspace(workspaceId, { type: 'trial_ending_soon', daysRemaining, trialEnd: trialEndDate?.toISOString() });
    } catch (wsErr: any) { log.warn('[StripeWebhooks] trial_ending_soon broadcast failed (non-blocking):', wsErr?.message); }

    // Platform event for Trinity awareness
    platformEventBus.publish({
      type: 'trial_ending_soon',
      category: 'billing',
      title: `Trial Expiring — ${daysRemaining} Days Remaining`,
      description: `Workspace ${workspaceId} trial ends in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`,
      workspaceId,
      metadata: { daysRemaining, trialEnd: trialEndDate?.toISOString() },
    }).catch((err) => log.warn('[StripeWebhookService] Fire-and-forget failed:', err));

    return { success: true, handled: true, message: `Trial ending warning sent — ${daysRemaining} days remaining` };
  }

  /**
   * Handle customer.subscription.paused
   * Stripe pauses when operator manually pauses or smart retry collection exhausted.
   * FSM: active/past_due → suspended
   */
  private async handleSubscriptionPaused(event: Stripe.Event): Promise<WebhookResult> {
    const subscription = event.data.object as Stripe.Subscription;
    const workspaceId = subscription.metadata.workspaceId;
    if (!workspaceId) {
      return { success: true, handled: false, message: 'No workspaceId in metadata' };
    }

    log.info('Subscription paused — marking workspace suspended', { workspaceId });

    await db.update(workspaces)
      .set({ subscriptionStatus: 'suspended', updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));

    // Notify owner
    try {
      const [ws] = await db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      if (ws?.ownerId) {
        await createNotification({
          userId: ws.ownerId,
          workspaceId,
          type: 'subscription_suspended',
          title: 'Account Suspended',
          message: 'Your subscription has been paused. The platform is now in read-only mode. Update your payment method to resume full access.',
          metadata: { stripeSubscriptionId: subscription.id },
          actionUrl: '/settings?tab=billing',
        });
      }
    } catch (notifErr: any) {
      log.warn('Notification failed on subscription.paused', { error: notifErr.message });
    }

    await this.sendSubscriptionEmail(workspaceId, 'subscription_suspended', {});

    try {
      broadcastToWorkspace(workspaceId, { type: 'subscription_suspended', status: 'suspended' });
    } catch (wsErr: any) { log.warn('[StripeWebhooks] subscription_suspended broadcast failed (non-blocking):', wsErr?.message); }

    platformEventBus.publish({
      type: 'subscription_suspended',
      category: 'billing',
      title: 'Subscription Suspended',
      description: `Workspace ${workspaceId} subscription paused — read-only mode active`,
      workspaceId,
      metadata: { suspendedAt: new Date().toISOString() },
    }).catch((err) => log.warn('[StripeWebhookService] Fire-and-forget failed:', err));

    return { success: true, handled: true, message: 'Workspace suspended — read-only mode engaged' };
  }

  /**
   * Handle customer.subscription.resumed
   * Stripe fires when a paused subscription is resumed (payment caught up).
   * FSM: suspended → active
   */
  private async handleSubscriptionResumed(event: Stripe.Event): Promise<WebhookResult> {
    const subscription = event.data.object as Stripe.Subscription;
    const workspaceId = subscription.metadata.workspaceId;
    if (!workspaceId) {
      return { success: true, handled: false, message: 'No workspaceId in metadata' };
    }

    log.info('Subscription resumed — marking workspace active', { workspaceId });

    await db.update(workspaces)
      .set({ subscriptionStatus: 'active', updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));

    // Notify owner
    try {
      const [ws] = await db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      if (ws?.ownerId) {
        await createNotification({
          userId: ws.ownerId,
          workspaceId,
          type: 'subscription_reactivated',
          title: 'Account Reactivated',
          message: `Your subscription has been resumed. Full access to ${PLATFORM.name} is restored.`,
          metadata: { stripeSubscriptionId: subscription.id },
          actionUrl: '/dashboard',
        });
      }
    } catch (notifErr: any) {
      log.warn('Notification failed on subscription.resumed', { error: notifErr.message });
    }

    try {
      broadcastToWorkspace(workspaceId, { type: 'subscription_reactivated', status: 'active' });
    } catch (wsErr: any) { log.warn('[StripeWebhooks] subscription_reactivated broadcast failed (non-blocking):', wsErr?.message); }

    platformEventBus.publish({
      type: 'subscription_reactivated',
      category: 'billing',
      title: 'Subscription Resumed',
      description: `Workspace ${workspaceId} subscription resumed — full access restored`,
      workspaceId,
      metadata: { resumedAt: new Date().toISOString() },
    }).catch((err) => log.warn('[StripeWebhookService] Fire-and-forget failed:', err));

    return { success: true, handled: true, message: 'Workspace reactivated — full access restored' };
  }

  /**
   * Handle invoice.upcoming
   * Stripe fires this 7 days before the next subscription invoice is generated.
   * Gives workspace owners advance notice to verify payment details.
   */
  private async handleInvoiceUpcoming(event: Stripe.Event): Promise<WebhookResult> {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = (invoice as any).subscription as string;
    const amountDue = (invoice.amount_due || 0) / 100;
    const dueDate = invoice.period_end
      ? new Date(invoice.period_end * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'the end of your billing period';

    let workspaceId: string | undefined;
    if (subscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        workspaceId = subscription.metadata.workspaceId;
      } catch (stripeErr: any) {
        log.warn('[StripeWebhooks] subscription.retrieve failed for upcoming invoice — cannot notify workspace:', { subscriptionId, error: stripeErr?.message });
      }
    }

    if (!workspaceId) {
      return { success: true, handled: false, message: 'No workspaceId — skipping upcoming invoice notification' };
    }

    log.info('Upcoming invoice', { workspaceId, amountDue, dueDate });

    try {
      const [ws] = await db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      if (ws?.ownerId) {
        await createNotification({
          userId: ws.ownerId,
          workspaceId,
          type: 'invoice_upcoming',
          title: 'Upcoming Invoice',
          message: `Your next subscription invoice of $${amountDue.toFixed(2)} will be charged on ${dueDate}. Ensure your payment method is up to date.`,
          metadata: { amountDue, dueDate, stripeInvoiceId: invoice.id },
          actionUrl: '/settings?tab=billing',
        });
      }
    } catch (notifErr: any) {
      log.warn('Notification failed on invoice.upcoming', { error: notifErr.message });
    }

    return { success: true, handled: true, message: `Upcoming invoice notification sent — $${amountDue.toFixed(2)} due ${dueDate}` };
  }

  /**
   * Sync Stripe Connect account verification status to local DB.
   * Fired whenever a connected account's details change — including
   * when KYC verification passes/fails and payouts become enabled/disabled.
   *
   * Gap closed: Without this handler, an employee who completes Stripe onboarding
   * would remain marked as "payouts disabled" in the platform until the next
   * manual payout attempt, blocking payroll disbursement silently.
   */
  private async handleConnectAccountUpdated(event: Stripe.Event): Promise<WebhookResult> {
    const account = event.data.object as Stripe.Account;
    const accountId = account.id;

    if (!accountId) {
      return { success: false, handled: false, error: 'Missing account ID in account.updated event' };
    }

    const payoutsEnabled = account.payouts_enabled ?? false;
    const detailsSubmitted = account.details_submitted ?? false;

    const [updated] = await db.update(employeePayrollInfo)
      .set({
        stripeConnectPayoutsEnabled: payoutsEnabled,
        stripeConnectOnboardingComplete: detailsSubmitted,
        updatedAt: new Date(),
      })
      .where(eq(employeePayrollInfo.stripeConnectAccountId, accountId))
      .returning({ id: employeePayrollInfo.id, employeeId: employeePayrollInfo.employeeId });

    if (updated) {
      log.info('Synced Connect account status', {
        accountId,
        employeeId: updated.employeeId,
        payoutsEnabled,
        detailsSubmitted,
      });
    } else {
      log.warn('account.updated: no matching employeePayrollInfo for Connect account', { accountId });
    }

    return { success: true, handled: true, message: `Connect account ${accountId} synced (payoutsEnabled=${payoutsEnabled})` };
  }

  /**
   * Handle capability.updated for Connect accounts.
   * Stripe fires this when a specific capability (e.g., "transfers") changes status.
   * We re-derive payout eligibility based on the account's capabilities.
   */
  private async handleConnectCapabilityUpdated(event: Stripe.Event): Promise<WebhookResult> {
    const capability = event.data.object as Stripe.Capability;
    const accountId = typeof capability.account === 'string' ? capability.account : capability.account?.id;

    if (!accountId) {
      return { success: false, handled: false, error: 'Missing account in capability.updated event' };
    }

    const transfersActive = capability.id === 'transfers' && capability.status === 'active';

    if (transfersActive) {
      await db.update(employeePayrollInfo)
        .set({
          stripeConnectPayoutsEnabled: true,
          updatedAt: new Date(),
        })
        .where(eq(employeePayrollInfo.stripeConnectAccountId, accountId));

      log.info('Transfers capability activated for Connect account', { accountId });
    }

    return { success: true, handled: true, message: `capability.updated processed for account ${accountId} (${capability.id}=${capability.status})` };
  }
}

export const stripeWebhookService = new StripeWebhookService();
