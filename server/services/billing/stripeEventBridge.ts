/**
 * STRIPE EVENT BRIDGE
 * ====================
 * Connects Stripe webhook events to Trinity AI Brain for automated billing lifecycle management.
 * 
 * Events handled:
 * - payment_intent.succeeded → Mark invoice paid, unlock features
 * - payment_intent.payment_failed → Trigger escalation workflow
 * - invoice.paid → Update subscription status + reset credits on subscription_cycle renewal
 * - invoice.payment_failed → Enter grace period, send warnings
 * - subscription.created → Initialize billing tracking
 * - subscription.updated → Sync tier changes
 * - subscription.deleted → Handle churn workflow
 * - customer.subscription.trial_will_end → Pre-expiry notifications
 * 
 * Integrates with:
 * - platformEventBus for cross-platform notifications
 * - helpaiOrchestrator for AI Brain action triggering
 * - accountState for billing state machine
 */

import Stripe from 'stripe';
import { db } from '../../db';
import { workspaces, subscriptions, invoices, notifications, users } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { platformEventBus, type PlatformEvent } from '../platformEventBus';
import { helpaiOrchestrator } from '../helpai/platformActionHub';
import { AccountStateService } from './accountState';
import { universalNotificationEngine } from '../universalNotificationEngine';
import { createLogger } from '../../lib/logger';
import { getStripe, isStripeConfigured } from './stripeClient';

const log = createLogger('StripeEventBridge');

// Lazy proxy: avoids module-load crash if STRIPE_SECRET_KEY is missing (CLAUDE.md §F).
const stripe = new Proxy({} as Stripe, {
  get(_t, prop) {
    return (getStripe() as any)[prop];
  },
});

interface StripeEventResult {
  success: boolean;
  eventType: string;
  workspaceId?: string;
  action: string;
  message: string;
  error?: string;
}

class StripeEventBridge {
  private static instance: StripeEventBridge;
  private accountStateService: AccountStateService;
  // DB-backed dedup: stripeWebhookService.tryClaimEvent already guards the primary path;
  // this in-memory cache is only a fast-path to skip redundant DB lookups for events
  // that already came through in this process lifetime. On restart, the cache is empty
  // but the caller in stripeInlineRoutes already gates us on stripeWebhookService's
  // duplicate detection, so we never re-process after restart.
  private processedEvents: Set<string> = new Set();
  private readonly MAX_PROCESSED_CACHE = 1000;

  private constructor() {
    this.accountStateService = new AccountStateService();
  }

  static getInstance(): StripeEventBridge {
    if (!StripeEventBridge.instance) {
      StripeEventBridge.instance = new StripeEventBridge();
    }
    return StripeEventBridge.instance;
  }

  /**
   * Check if Stripe is configured
   */
  isConfigured(): boolean {
    return isStripeConfigured();
  }

  /**
   * Process a Stripe webhook event and route to appropriate handler
   * Includes idempotency check to prevent duplicate processing
   */
  async processEvent(event: Stripe.Event): Promise<StripeEventResult> {
    log.info('Processing event', { eventType: event.type, eventId: event.id });

    if (!isStripeConfigured()) {
      log.warn('Stripe not configured, skipping event');
      return { success: false, eventType: event.type, action: 'skipped', message: 'Stripe not configured', error: 'STRIPE_SECRET_KEY not set' };
    }

    if (this.processedEvents.has(event.id)) {
      log.info('Duplicate event, skipping', { eventId: event.id });
      return { success: true, eventType: event.type, action: 'skipped', message: 'Duplicate event (idempotency check)' };
    }

    this.processedEvents.add(event.id);
    if (this.processedEvents.size > this.MAX_PROCESSED_CACHE) {
      const firstKey = this.processedEvents.values().next().value;
      if (firstKey) this.processedEvents.delete(firstKey);
    }

    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          return this.handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        case 'payment_intent.payment_failed':
          return this.handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        case 'invoice.paid':
          return this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        case 'invoice.payment_failed':
          return this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        case 'customer.subscription.created':
          return this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        case 'customer.subscription.updated':
          return this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        case 'customer.subscription.deleted':
          return this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        case 'customer.subscription.trial_will_end':
          return this.handleTrialWillEnd(event.data.object as Stripe.Subscription);
        default:
          return { success: true, eventType: event.type, action: 'ignored', message: 'Event type not handled' };
      }
    } catch (error: any) {
      log.error('Error processing event', { eventType: event.type, error: (error instanceof Error ? error.message : String(error)) });
      return {
        success: false,
        eventType: event.type,
        action: 'error',
        message: 'Event processing failed',
        error: (error instanceof Error ? error.message : String(error)),
      };
    }
  }

  /**
   * Handle successful payment
   */
  private async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<StripeEventResult> {
    const customerId = paymentIntent.customer as string;
    const workspace = await this.getWorkspaceByStripeCustomer(customerId);
    
    if (!workspace) {
      return { success: false, eventType: 'payment_intent.succeeded', action: 'skipped', message: 'Workspace not found' };
    }

    await platformEventBus.publish({
      type: 'payment_succeeded',
      category: 'billing',
      title: 'Payment Successful',
      description: `Payment of $${((paymentIntent.amount || 0) / 100).toFixed(2)} received for ${workspace.name}`,
      workspaceId: workspace.id,
      metadata: {
        amount: paymentIntent.amount,
        paymentIntentId: paymentIntent.id,
      },
      visibility: 'workspace',
    });

    await this.notifyWorkspaceOwner(workspace.id, {
      type: 'billing',
      title: 'Payment Successful',
      message: `Your payment of $${((paymentIntent.amount || 0) / 100).toFixed(2)} has been processed successfully.`,
      priority: 'medium',
    });

    return {
      success: true,
      eventType: 'payment_intent.succeeded',
      workspaceId: workspace.id,
      action: 'payment_recorded',
      message: `Payment of $${((paymentIntent.amount || 0) / 100).toFixed(2)} recorded`,
    };
  }

  /**
   * Handle failed payment
   */
  private async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent): Promise<StripeEventResult> {
    const customerId = paymentIntent.customer as string;
    const workspace = await this.getWorkspaceByStripeCustomer(customerId);
    
    if (!workspace) {
      return { success: false, eventType: 'payment_intent.payment_failed', action: 'skipped', message: 'Workspace not found' };
    }

    const failureMessage = paymentIntent.last_payment_error?.message || 'Payment failed';

    await platformEventBus.publish({
      type: 'payment_failed',
      category: 'billing',
      title: 'Payment Failed',
      description: `Payment failed for ${workspace.name}: ${failureMessage}`,
      workspaceId: workspace.id,
      metadata: {
        amount: paymentIntent.amount,
        failureReason: failureMessage,
      },
      visibility: 'org_leadership',
    });

    await this.notifyWorkspaceOwner(workspace.id, {
      type: 'billing',
      title: 'Payment Failed',
      message: `Your payment of $${((paymentIntent.amount || 0) / 100).toFixed(2)} failed. Please update your payment method.`,
      priority: 'urgent',
      actionUrl: '/settings',
    });

    try {
      await helpaiOrchestrator.executeAction('resume_approval.request', {
        title: 'Payment Failure - Human Review Required',
        description: `Payment failed for workspace ${workspace.name}. Reason: ${failureMessage}`,
        riskLevel: 'medium',
        workspaceId: workspace.id,
      }, { userId: 'system', userRole: 'sysop', workspaceId: workspace.id });
    } catch (error) {
      log.warn('Could not create resume approval request', { error: (error as any).message });
    }

    return {
      success: true,
      eventType: 'payment_intent.payment_failed',
      workspaceId: workspace.id,
      action: 'escalation_triggered',
      message: `Payment failure escalated: ${failureMessage}`,
    };
  }

  /**
   * Handle invoice paid
   * For subscription renewal invoices (billing_reason = 'subscription_cycle'):
   *   → Trigger credit reset so the org receives their new monthly allocation
   *   → Reset overage accumulator to 0 (weekly billing already charged it via Stripe)
   * For one-time invoices (billing_reason = 'manual' or 'subscription_create'):
   *   → Just activate the subscription, no credit reset needed
   */
  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<StripeEventResult> {
    const customerId = invoice.customer as string;
    const workspace = await this.getWorkspaceByStripeCustomer(customerId);
    
    if (!workspace) {
      return { success: false, eventType: 'invoice.paid', action: 'skipped', message: 'Workspace not found' };
    }

    await db.update(workspaces)
      .set({ subscriptionStatus: 'active' })
      .where(eq(workspaces.id, workspace.id));

    await db.update(subscriptions)
      .set({ status: 'active' })
      .where(eq(subscriptions.workspaceId, workspace.id));

    // CREDIT RESET — fires on subscription renewal events only.
    // Guarantees credits reset is tied to actual Stripe payment, not just a cron date.
    // 'subscription_cycle' = renewal; 'subscription_create' = first payment (no reset yet).
    const billingReason = (invoice as any).billing_reason as string | undefined;
    const isRenewal = billingReason === 'subscription_cycle';
    if (isRenewal) {
      try {
        const { resetCreditsNow } = await import('./creditResetCron');
        await resetCreditsNow(workspace.id);
        log.info('[StripeEventBridge] Credit reset triggered on subscription renewal', {
          workspaceId: workspace.id,
          invoiceId: invoice.id,
          billingReason,
        });
      } catch (resetErr: any) {
        log.warn('[StripeEventBridge] Credit reset failed on invoice.paid — cron fallback will handle on 1st of month', {
          workspaceId: workspace.id,
          error: resetErr.message,
        });
      }
    }

    await platformEventBus.publish({
      type: 'invoice_paid',
      category: 'billing',
      title: 'Invoice Paid',
      description: `Invoice ${invoice.number} paid for ${workspace.name}`,
      workspaceId: workspace.id,
      metadata: {
        invoiceId: invoice.id,
        amount: invoice.amount_paid,
        billingReason,
        creditResetTriggered: isRenewal,
      },
      visibility: 'workspace',
    });

    return {
      success: true,
      eventType: 'invoice.paid',
      workspaceId: workspace.id,
      action: isRenewal ? 'subscription_renewed_credits_reset' : 'subscription_activated',
      message: `Invoice ${invoice.number} paid, subscription active${isRenewal ? ', credits reset to new monthly allocation' : ''}`,
    };
  }

  /**
   * Handle invoice payment failed
   */
  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<StripeEventResult> {
    const customerId = invoice.customer as string;
    const workspace = await this.getWorkspaceByStripeCustomer(customerId);
    
    if (!workspace) {
      return { success: false, eventType: 'invoice.payment_failed', action: 'skipped', message: 'Workspace not found' };
    }

    await db.update(subscriptions)
      .set({ status: 'past_due' })
      .where(eq(subscriptions.workspaceId, workspace.id));

    await db.update(workspaces)
      .set({ subscriptionStatus: 'past_due' })
      .where(eq(workspaces.id, workspace.id));

    await this.notifyWorkspaceOwner(workspace.id, {
      type: 'billing',
      title: 'Invoice Payment Failed',
      message: `Your invoice payment failed. Please update your payment method to avoid service interruption.`,
      priority: 'urgent',
      actionUrl: '/settings',
    });

    await platformEventBus.publish({
      type: 'invoice_payment_failed',
      category: 'billing',
      title: 'Invoice Payment Failed',
      description: `Invoice ${invoice.number} payment failed for ${workspace.name}`,
      workspaceId: workspace.id,
      metadata: {
        invoiceId: invoice.id,
        attemptCount: invoice.attempt_count,
      },
      visibility: 'org_leadership',
    });

    return {
      success: true,
      eventType: 'invoice.payment_failed',
      workspaceId: workspace.id,
      action: 'past_due_set',
      message: `Invoice payment failed, status set to past_due`,
    };
  }

  /**
   * Handle subscription created
   */
  private async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<StripeEventResult> {
    const customerId = subscription.customer as string;
    const workspace = await this.getWorkspaceByStripeCustomer(customerId);
    
    if (!workspace) {
      return { success: false, eventType: 'customer.subscription.created', action: 'skipped', message: 'Workspace not found' };
    }

    await db.update(workspaces)
      .set({ 
        subscriptionStatus: subscription.status,
        stripeSubscriptionId: subscription.id,
      })
      .where(eq(workspaces.id, workspace.id));

    await platformEventBus.publish({
      type: 'subscription_created',
      category: 'billing',
      title: 'Subscription Created',
      description: `New subscription created for ${workspace.name}`,
      workspaceId: workspace.id,
      metadata: {
        subscriptionId: subscription.id,
        status: subscription.status,
      },
      visibility: 'org_leadership',
    });

    return {
      success: true,
      eventType: 'customer.subscription.created',
      workspaceId: workspace.id,
      action: 'subscription_recorded',
      message: 'Subscription created and recorded',
    };
  }

  /**
   * Handle subscription updated
   */
  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<StripeEventResult> {
    const customerId = subscription.customer as string;
    const workspace = await this.getWorkspaceByStripeCustomer(customerId);
    
    if (!workspace) {
      return { success: false, eventType: 'customer.subscription.updated', action: 'skipped', message: 'Workspace not found' };
    }

    await db.update(workspaces)
      .set({ subscriptionStatus: subscription.status })
      .where(eq(workspaces.id, workspace.id));

    await db.update(subscriptions)
      .set({ status: subscription.status })
      .where(eq(subscriptions.workspaceId, workspace.id));

    return {
      success: true,
      eventType: 'customer.subscription.updated',
      workspaceId: workspace.id,
      action: 'subscription_synced',
      message: `Subscription updated to ${subscription.status}`,
    };
  }

  /**
   * Handle subscription deleted (churn)
   */
  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<StripeEventResult> {
    const customerId = subscription.customer as string;
    const workspace = await this.getWorkspaceByStripeCustomer(customerId);
    
    if (!workspace) {
      return { success: false, eventType: 'customer.subscription.deleted', action: 'skipped', message: 'Workspace not found' };
    }

    await db.update(workspaces)
      .set({ 
        subscriptionStatus: 'canceled',
        subscriptionTier: 'free',
      })
      .where(eq(workspaces.id, workspace.id));

    await db.update(subscriptions)
      .set({ status: 'canceled' })
      .where(eq(subscriptions.workspaceId, workspace.id));

    // GAP-10 FIX: Clear credits on cancellation
    const { creditManager } = await import('./creditManager');
    await creditManager.downgradeCreditsOnCancellation(workspace.id);

    await platformEventBus.publish({
      type: 'subscription_canceled',
      category: 'billing',
      title: 'Subscription Canceled',
      description: `Subscription canceled for ${workspace.name}`,
      workspaceId: workspace.id,
      metadata: {
        subscriptionId: subscription.id,
        cancelReason: subscription.cancellation_details?.reason,
      },
      visibility: 'org_leadership',
    });

    return {
      success: true,
      eventType: 'customer.subscription.deleted',
      workspaceId: workspace.id,
      action: 'churn_recorded',
      message: 'Subscription canceled, workspace downgraded to free',
    };
  }

  /**
   * Handle trial ending soon notification from Stripe
   */
  private async handleTrialWillEnd(subscription: Stripe.Subscription): Promise<StripeEventResult> {
    const customerId = subscription.customer as string;
    const workspace = await this.getWorkspaceByStripeCustomer(customerId);
    
    if (!workspace) {
      return { success: false, eventType: 'customer.subscription.trial_will_end', action: 'skipped', message: 'Workspace not found' };
    }

    const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : new Date();
    const daysRemaining = Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    await this.notifyWorkspaceOwner(workspace.id, {
      type: 'billing',
      title: 'Trial Ending Soon',
      message: `Your free trial ends in ${daysRemaining} days. Add a payment method to continue your service.`,
      priority: 'high',
      actionUrl: '/settings',
    });

    return {
      success: true,
      eventType: 'customer.subscription.trial_will_end',
      workspaceId: workspace.id,
      action: 'trial_warning_sent',
      message: `Trial ending notification sent (${daysRemaining} days remaining)`,
    };
  }

  /**
   * Get workspace by Stripe customer ID
   */
  private async getWorkspaceByStripeCustomer(customerId: string): Promise<{ id: string; name: string; ownerId: string } | null> {
    const [workspace] = await db.select({
      id: workspaces.id,
      name: workspaces.name,
      ownerId: workspaces.ownerId,
    })
    .from(workspaces)
    .where(eq(workspaces.stripeCustomerId, customerId))
    .limit(1);

    return workspace || null;
  }

  /**
   * Send notification to workspace owner
   */
  private async notifyWorkspaceOwner(workspaceId: string, notification: {
    type: string;
    title: string;
    message: string;
    priority: string;
    actionUrl?: string;
  }): Promise<void> {
    const [workspace] = await db.select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) return;

    // Route through Trinity AI for contextual enrichment
    await universalNotificationEngine.sendNotification({
      workspaceId,
      userId: workspace.ownerId,
      type: 'system',
      title: notification.title,
      message: notification.message,
      severity: notification.priority === 'urgent' ? 'critical' : notification.priority === 'high' ? 'warning' : 'info',
      actionUrl: notification.actionUrl,
      metadata: {
        notificationType: notification.type,
        source: 'stripe_event_bridge',
      },
    });
  }

  /**
   * Register AI Brain actions
   */
  registerActions(): void {
    helpaiOrchestrator.registerAction({
      actionId: 'stripe.process_event',
      name: 'Process Stripe Event',
      category: 'billing',
      description: 'Process a Stripe webhook event through the event bridge',
      requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        return { success: true, actionId: request.actionId, message: 'Use webhook endpoint for Stripe events' };
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'stripe.sync_subscription',
      name: 'Sync Subscription',
      category: 'billing',
      description: 'Sync subscription status from Stripe',
      requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        const { workspaceId } = request.payload;
        const [workspace] = await db.select()
          .from(workspaces)
          .where(eq(workspaces.id, workspaceId))
          .limit(1);

        if (!workspace?.stripeSubscriptionId || !isStripeConfigured()) {
          return { success: false, actionId: request.actionId, message: 'No Stripe subscription found' };
        }

        const subscription = await stripe.subscriptions.retrieve(workspace.stripeSubscriptionId);
        await db.update(workspaces)
          .set({ subscriptionStatus: subscription.status })
          .where(eq(workspaces.id, workspaceId));

        return { success: true, actionId: request.actionId, message: `Synced: ${subscription.status}`, data: { status: subscription.status } };
      },
    });

    log.info('Registered 2 AI Brain actions');
  }
}

export const stripeEventBridge = StripeEventBridge.getInstance();

export async function initializeStripeEventBridge(): Promise<void> {
  log.info('Initializing Stripe Event Bridge');
  stripeEventBridge.registerActions();
  log.info('Stripe Event Bridge initialized');
}

export { StripeEventBridge };
