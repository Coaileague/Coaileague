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
import { db } from '../../db';
import { workspaces, subscriptionPayments, invoicePayments, invoices, users } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { subscriptionManager, type SubscriptionTier } from './subscriptionManager';
import { creditManager } from './creditManager';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
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
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET not configured');
    }
    
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  /**
   * Main webhook handler - routes events to appropriate handlers
   */
  async handleEvent(event: Stripe.Event): Promise<WebhookResult> {
    console.log(`[Stripe Webhook] Processing event: ${event.type}`);
    
    try {
      switch (event.type) {
        case 'customer.subscription.created':
          return await this.handleSubscriptionCreated(event);
        
        case 'customer.subscription.updated':
          return await this.handleSubscriptionUpdated(event);
        
        case 'customer.subscription.deleted':
          return await this.handleSubscriptionDeleted(event);
        
        case 'invoice.payment_succeeded':
          return await this.handleInvoicePaymentSucceeded(event);
        
        case 'invoice.payment_failed':
          return await this.handleInvoicePaymentFailed(event);
        
        case 'payment_intent.succeeded':
          return await this.handlePaymentIntentSucceeded(event);
        
        case 'payment_intent.payment_failed':
          return await this.handlePaymentIntentFailed(event);
        
        case 'checkout.session.completed':
          return await this.handleCheckoutSessionCompleted(event);
        
        case 'charge.refunded':
          return await this.handleChargeRefunded(event);
        
        default:
          console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
          return { success: true, handled: false, message: `Unhandled event type: ${event.type}` };
      }
    } catch (error: any) {
      console.error(`[Stripe Webhook] Error processing ${event.type}:`, error);
      return { success: false, handled: false, error: error.message };
    }
  }

  /**
   * Handle new subscription creation
   */
  private async handleSubscriptionCreated(event: Stripe.Event): Promise<WebhookResult> {
    const subscription = event.data.object as Stripe.Subscription;
    const workspaceId = subscription.metadata.workspaceId;
    const tier = subscription.metadata.tier as SubscriptionTier;
    const billingCycle = subscription.metadata.billingCycle || 'monthly';
    
    if (!workspaceId) {
      console.warn('[Stripe Webhook] Subscription created without workspaceId');
      return { success: true, handled: false, message: 'Missing workspaceId in metadata' };
    }
    
    console.log(`[Stripe Webhook] Subscription created for workspace ${workspaceId}, tier: ${tier}`);
    
    await db.update(workspaces)
      .set({
        subscriptionTier: tier,
        subscriptionStatus: 'active',
        stripeSubscriptionId: subscription.id,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));
    
    await creditManager.initializeCredits(workspaceId, tier);
    
    await this.logSubscriptionPayment({
      workspaceId,
      stripeSubscriptionId: subscription.id,
      tier,
      billingCycle,
      amount: subscription.items.data[0]?.price?.unit_amount || 0,
      status: 'active',
    });
    
    await this.sendSubscriptionEmail(workspaceId, 'subscription_created', { tier, billingCycle });
    
    return { success: true, handled: true, message: 'Subscription created successfully' };
  }

  /**
   * Handle subscription updates (upgrades, downgrades, renewals)
   */
  private async handleSubscriptionUpdated(event: Stripe.Event): Promise<WebhookResult> {
    const subscription = event.data.object as Stripe.Subscription;
    const workspaceId = subscription.metadata.workspaceId;
    const tier = subscription.metadata.tier as SubscriptionTier;
    
    if (!workspaceId) {
      console.warn('[Stripe Webhook] Subscription updated without workspaceId');
      return { success: true, handled: false, message: 'Missing workspaceId in metadata' };
    }
    
    const status = this.mapSubscriptionStatus(subscription.status);
    
    console.log(`[Stripe Webhook] Subscription updated for workspace ${workspaceId}, status: ${status}`);
    
    const [currentWorkspace] = await db.select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    
    const previousTier = currentWorkspace?.subscriptionTier;
    
    await db.update(workspaces)
      .set({
        subscriptionTier: tier,
        subscriptionStatus: status,
        stripeSubscriptionId: subscription.id,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));
    
    if (previousTier !== tier) {
      await creditManager.updateTierAllocation(workspaceId, tier);
      
      const isUpgrade = this.isUpgrade(previousTier as SubscriptionTier, tier);
      await this.sendSubscriptionEmail(workspaceId, isUpgrade ? 'subscription_upgraded' : 'subscription_downgraded', {
        previousTier,
        newTier: tier,
      });
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
      console.warn('[Stripe Webhook] Subscription deleted without workspaceId');
      return { success: true, handled: false, message: 'Missing workspaceId in metadata' };
    }
    
    console.log(`[Stripe Webhook] Subscription cancelled for workspace ${workspaceId}`);
    
    await db.update(workspaces)
      .set({
        subscriptionTier: 'free',
        subscriptionStatus: 'cancelled',
        stripeSubscriptionId: null,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));
    
    await creditManager.initializeCredits(workspaceId, 'free');
    
    await this.sendSubscriptionEmail(workspaceId, 'subscription_cancelled', {});
    
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
      console.error('[Stripe Webhook] Failed to retrieve subscription:', error);
    }
    
    if (workspaceId) {
      console.log(`[Stripe Webhook] Payment succeeded for workspace ${workspaceId}`);
      
      await db.update(workspaces)
        .set({
          subscriptionStatus: 'active',
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, workspaceId));
      
      await this.sendSubscriptionEmail(workspaceId, 'payment_succeeded', {
        amount: (invoice.amount_paid || 0) / 100,
        invoiceNumber: invoice.number,
      });
    }
    
    return { success: true, handled: true, message: 'Invoice payment succeeded' };
  }

  /**
   * Handle failed invoice payment
   */
  private async handleInvoicePaymentFailed(event: Stripe.Event): Promise<WebhookResult> {
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
      console.error('[Stripe Webhook] Failed to retrieve subscription:', error);
    }
    
    if (workspaceId) {
      console.log(`[Stripe Webhook] Payment failed for workspace ${workspaceId}`);
      
      await db.update(workspaces)
        .set({
          subscriptionStatus: 'past_due',
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, workspaceId));
      
      await this.sendSubscriptionEmail(workspaceId, 'payment_failed', {
        amount: (invoice.amount_due || 0) / 100,
        nextAttempt: invoice.next_payment_attempt 
          ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString()
          : 'N/A',
      });
    }
    
    return { success: true, handled: true, message: 'Invoice payment failed, workspace marked past_due' };
  }

  /**
   * Handle successful payment intent (one-time payments, credit purchases)
   */
  private async handlePaymentIntentSucceeded(event: Stripe.Event): Promise<WebhookResult> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const workspaceId = paymentIntent.metadata.workspaceId;
    
    console.log(`[Stripe Webhook] Payment intent succeeded: ${paymentIntent.id}`);
    
    await db.update(invoicePayments)
      .set({
        status: 'succeeded',
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(invoicePayments.stripePaymentIntentId, paymentIntent.id));
    
    const [payment] = await db.select()
      .from(invoicePayments)
      .where(eq(invoicePayments.stripePaymentIntentId, paymentIntent.id))
      .limit(1);
    
    if (payment) {
      await db.update(invoices)
        .set({
          status: 'paid',
          paidAt: new Date(),
          paymentIntentId: paymentIntent.id,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, payment.invoiceId));
    }
    
    return { success: true, handled: true, message: 'Payment intent succeeded' };
  }

  /**
   * Handle failed payment intent
   */
  private async handlePaymentIntentFailed(event: Stripe.Event): Promise<WebhookResult> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    
    console.log(`[Stripe Webhook] Payment intent failed: ${paymentIntent.id}`);
    
    await db.update(invoicePayments)
      .set({
        status: 'failed',
        failureCode: paymentIntent.last_payment_error?.code || 'unknown',
        failureMessage: paymentIntent.last_payment_error?.message || 'Payment failed',
        updatedAt: new Date(),
      })
      .where(eq(invoicePayments.stripePaymentIntentId, paymentIntent.id));
    
    return { success: true, handled: true, message: 'Payment intent failed, recorded failure' };
  }

  /**
   * Handle completed checkout session (for subscription creation or credit purchase)
   */
  private async handleCheckoutSessionCompleted(event: Stripe.Event): Promise<WebhookResult> {
    const session = event.data.object as Stripe.Checkout.Session;
    const workspaceId = session.metadata?.workspaceId;
    const userId = session.metadata?.userId;
    const creditPackId = session.metadata?.creditPackId;
    
    console.log(`[Stripe Webhook] Checkout session completed: ${session.id}`);
    
    if (creditPackId && workspaceId && userId) {
      const { creditPurchaseService } = await import('./creditPurchase');
      await creditPurchaseService.handlePaymentSuccess(session);
      
      return { success: true, handled: true, message: 'Credit purchase fulfilled' };
    }
    
    return { success: true, handled: true, message: 'Checkout session completed' };
  }

  /**
   * Handle refund
   */
  private async handleChargeRefunded(event: Stripe.Event): Promise<WebhookResult> {
    const charge = event.data.object as Stripe.Charge;
    const refundedAmount = charge.amount_refunded / 100;
    
    console.log(`[Stripe Webhook] Charge refunded: ${charge.id}, amount: $${refundedAmount}`);
    
    if (charge.payment_intent) {
      await db.update(invoicePayments)
        .set({
          status: refundedAmount === charge.amount / 100 ? 'refunded' : 'partially_refunded',
          refundedAmount: String(refundedAmount),
          refundedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(invoicePayments.stripePaymentIntentId, charge.payment_intent as string));
    }
    
    return { success: true, handled: true, message: 'Refund processed' };
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
      console.error('[Stripe Webhook] Failed to log subscription payment:', error);
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
      
      const { sendEmail } = await import('../emailAutomation');
      
      const templates: Record<string, { subject: string; html: string }> = {
        subscription_created: {
          subject: 'Welcome to CoAIleague! Your subscription is active',
          html: `<h1>Welcome to CoAIleague!</h1>
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
            <p>Thank you for being a CoAIleague customer!</p>`,
        },
        payment_failed: {
          subject: 'Action required: Payment failed',
          html: `<h1>Payment Issue</h1>
            <p>We couldn't process your payment of $${data.amount}.</p>
            <p>Next attempt: ${data.nextAttempt}</p>
            <p>Please update your payment method to avoid service interruption.</p>
            <p><a href="${process.env.BASE_URL || ''}/billing">Update Payment Method</a></p>`,
        },
      };
      
      const template = templates[emailType];
      if (!template) return;
      
      await sendEmail({
        to: owner.email,
        subject: template.subject,
        html: template.html,
      });
      
      console.log(`[Stripe Webhook] Sent ${emailType} email to ${owner.email}`);
    } catch (error) {
      console.error(`[Stripe Webhook] Failed to send ${emailType} email:`, error);
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
      paused: 'paused',
    };
    return statusMap[stripeStatus] || 'unknown';
  }

  /**
   * Determine if tier change is an upgrade
   */
  private isUpgrade(fromTier: SubscriptionTier, toTier: SubscriptionTier): boolean {
    const tierOrder = { free: 0, starter: 1, professional: 2, enterprise: 3 };
    return tierOrder[toTier] > tierOrder[fromTier];
  }
}

export const stripeWebhookService = new StripeWebhookService();
