/**
 * Subscription Management Service
 * 
 * Manages CoAIleague base subscriptions (Free/Starter/Professional/Enterprise)
 * - Monthly/yearly billing cycles
 * - Stripe subscription integration
 * - Credit allocation by tier
 * - Subscription upgrades/downgrades
 * - Renewal handling
 * - Overage calculations for weekly addon billing
 */

import Stripe from 'stripe';
import { db } from '../../db';
import { workspaces, users, type Workspace } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { CreditManager, TIER_CREDIT_ALLOCATIONS } from './creditManager';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

// Subscription tier pricing (monthly base prices)
// MIDDLEWARE PRICING: Fair value for automation layer connecting to HRIS/accounting
// Users already pay for QuickBooks, Gusto, etc. - we provide the AI automation
import { BILLING } from '@shared/billingConfig';

export const TIER_PRICING = {
  free: {
    monthlyPrice: BILLING.tiers.free.monthlyPrice,
    yearlyPrice: BILLING.tiers.free.yearlyPrice,
    stripePriceId: null,
    stripeYearlyPriceId: null,
    credits: TIER_CREDIT_ALLOCATIONS.free,
    maxEmployees: BILLING.tiers.free.maxEmployees,
    maxManagers: BILLING.tiers.free.maxManagers,
    adminReplacementValue: BILLING.tiers.free.adminReplacementValue,
  },
  starter: {
    monthlyPrice: BILLING.tiers.starter.monthlyPrice, // $349/month
    yearlyPrice: BILLING.tiers.starter.yearlyPrice, // $3,490/year (2 months free)
    stripePriceId: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
    stripeYearlyPriceId: process.env.STRIPE_STARTER_YEARLY_PRICE_ID,
    credits: TIER_CREDIT_ALLOCATIONS.starter,
    maxEmployees: BILLING.tiers.starter.maxEmployees, // 10 included
    maxManagers: BILLING.tiers.starter.maxManagers, // 2 included
    adminReplacementValue: BILLING.tiers.starter.adminReplacementValue,
  },
  professional: {
    monthlyPrice: BILLING.tiers.professional.monthlyPrice, // $999/month
    yearlyPrice: BILLING.tiers.professional.yearlyPrice, // $9,990/year (2 months free)
    stripePriceId: process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID,
    stripeYearlyPriceId: process.env.STRIPE_PROFESSIONAL_YEARLY_PRICE_ID,
    credits: TIER_CREDIT_ALLOCATIONS.professional,
    maxEmployees: BILLING.tiers.professional.maxEmployees, // 25 included
    maxManagers: BILLING.tiers.professional.maxManagers, // 5 included
    adminReplacementValue: BILLING.tiers.professional.adminReplacementValue,
  },
  enterprise: {
    monthlyPrice: BILLING.tiers.enterprise.monthlyPrice, // Contact sales
    yearlyPrice: BILLING.tiers.enterprise.yearlyPrice,
    stripePriceId: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID,
    stripeYearlyPriceId: process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID,
    credits: TIER_CREDIT_ALLOCATIONS.enterprise,
    maxEmployees: BILLING.tiers.enterprise.maxEmployees, // Unlimited
    maxManagers: BILLING.tiers.enterprise.maxManagers, // Unlimited
    adminReplacementValue: BILLING.tiers.enterprise.adminReplacementValue,
  },
} as const;

export type SubscriptionTier = 'free' | 'starter' | 'professional' | 'enterprise';
export type BillingCycle = 'monthly' | 'yearly';

export interface CreateSubscriptionInput {
  workspaceId: string;
  tier: SubscriptionTier;
  billingCycle: BillingCycle;
  paymentMethodId?: string; // Stripe payment method ID
}

export interface SubscriptionResult {
  success: boolean;
  subscriptionId?: string;
  clientSecret?: string; // For confirming payment on frontend
  error?: string;
}

export class SubscriptionManager {
  private static instance: SubscriptionManager;
  private creditManager: CreditManager;

  /**
   * Get singleton instance
   */
  static getInstance(): SubscriptionManager {
    if (!SubscriptionManager.instance) {
      SubscriptionManager.instance = new SubscriptionManager();
    }
    return SubscriptionManager.instance;
  }

  constructor() {
    this.creditManager = new CreditManager();
  }

  /**
   * Create or update Stripe customer for workspace
   */
  async ensureStripeCustomer(workspaceId: string): Promise<string> {
    const [workspace] = await db.select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Return existing customer if already created
    if (workspace.stripeCustomerId) {
      return workspace.stripeCustomerId;
    }

    // Get owner's email for Stripe customer
    const [owner] = await db.select()
      .from(users)
      .where(eq(users.id, workspace.ownerId))
      .limit(1);

    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email: owner?.email || undefined,
      metadata: {
        workspaceId: workspace.id,
        organizationId: workspace.organizationId || workspace.id,
        subscriptionTier: workspace.subscriptionTier,
      },
    });

    // Save customer ID
    await db.update(workspaces)
      .set({ stripeCustomerId: customer.id })
      .where(eq(workspaces.id, workspaceId));

    return customer.id;
  }

  /**
   * Create a new subscription (monthly or yearly)
   */
  async createSubscription(input: CreateSubscriptionInput): Promise<SubscriptionResult> {
    try {
      const { workspaceId, tier, billingCycle, paymentMethodId } = input;

      // Free tier doesn't need Stripe subscription
      if (tier === 'free') {
        await db.update(workspaces)
          .set({
            subscriptionTier: 'free',
            subscriptionStatus: 'active',
          })
          .where(eq(workspaces.id, workspaceId));

        // Initialize free tier credits
        await this.creditManager.initializeCredits(workspaceId, 'free');

        return { success: true };
      }

      // Ensure Stripe customer exists
      const customerId = await this.ensureStripeCustomer(workspaceId);

      // Get pricing for tier
      const pricing = TIER_PRICING[tier];
      const priceId = billingCycle === 'yearly' ? pricing.stripeYearlyPriceId : pricing.stripePriceId;

      if (!priceId) {
        throw new Error(`Stripe price ID not configured for ${tier} ${billingCycle}`);
      }

      // Attach payment method if provided
      if (paymentMethodId) {
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: customerId,
        });

        await stripe.customers.update(customerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        });
      }

      // Create subscription
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          workspaceId,
          tier,
          billingCycle,
        },
      });

      // Update workspace
      await db.update(workspaces)
        .set({
          subscriptionTier: tier,
          subscriptionStatus: 'active',
          stripeSubscriptionId: subscription.id,
        })
        .where(eq(workspaces.id, workspaceId));

      // Initialize credits for tier
      await this.creditManager.initializeCredits(workspaceId, tier);

      // Extract client secret for payment confirmation
      let clientSecret: string | undefined;
      if (subscription.latest_invoice) {
        const invoice = subscription.latest_invoice as any;
        if (invoice.payment_intent && typeof invoice.payment_intent === 'object') {
          clientSecret = invoice.payment_intent.client_secret;
        }
      }

      return {
        success: true,
        subscriptionId: subscription.id,
        clientSecret,
      };
    } catch (error: any) {
      console.error('Subscription creation error:', error);
      return {
        success: false,
        error: error.message || 'Failed to create subscription',
      };
    }
  }

  /**
   * Upgrade or downgrade subscription tier
   */
  async changeSubscriptionTier(
    workspaceId: string,
    newTier: SubscriptionTier,
    billingCycle: BillingCycle
  ): Promise<SubscriptionResult> {
    try {
      const [workspace] = await db.select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      if (!workspace) {
        throw new Error('Workspace not found');
      }

      const currentTier = workspace.subscriptionTier as SubscriptionTier;

      // Handle downgrade to free
      if (newTier === 'free') {
        if (workspace.stripeSubscriptionId) {
          await stripe.subscriptions.cancel(workspace.stripeSubscriptionId);
        }

        await db.update(workspaces)
          .set({
            subscriptionTier: 'free',
            subscriptionStatus: 'active',
            stripeSubscriptionId: null,
          })
          .where(eq(workspaces.id, workspaceId));

        // Reset to free tier credits
        await this.creditManager.initializeCredits(workspaceId, 'free');

        return { success: true };
      }

      // Handle upgrade from free
      if (currentTier === 'free') {
        return await this.createSubscription({
          workspaceId,
          tier: newTier,
          billingCycle,
        });
      }

      // Modify existing subscription
      if (!workspace.stripeSubscriptionId) {
        throw new Error('No active subscription to modify');
      }

      const pricing = TIER_PRICING[newTier];
      const priceId = billingCycle === 'yearly' ? pricing.stripeYearlyPriceId : pricing.stripePriceId;

      if (!priceId) {
        throw new Error(`Stripe price ID not configured for ${newTier} ${billingCycle}`);
      }

      const subscription = await stripe.subscriptions.retrieve(workspace.stripeSubscriptionId);
      const currentItem = subscription.items.data[0];

      await stripe.subscriptions.update(workspace.stripeSubscriptionId, {
        items: [
          {
            id: currentItem.id,
            price: priceId,
          },
        ],
        proration_behavior: 'always_invoice', // Immediately charge/credit difference
        metadata: {
          workspaceId,
          tier: newTier,
          billingCycle,
        },
      });

      await db.update(workspaces)
        .set({
          subscriptionTier: newTier,
        })
        .where(eq(workspaces.id, workspaceId));

      // Update credit allocation to new tier
      await this.creditManager.initializeCredits(workspaceId, newTier);

      return { success: true, subscriptionId: workspace.stripeSubscriptionId };
    } catch (error: any) {
      console.error('Subscription change error:', error);
      return {
        success: false,
        error: error.message || 'Failed to change subscription',
      };
    }
  }

  /**
   * Cancel subscription (at end of billing period)
   */
  async cancelSubscription(workspaceId: string, immediate: boolean = false): Promise<SubscriptionResult> {
    try {
      const [workspace] = await db.select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      if (!workspace?.stripeSubscriptionId) {
        throw new Error('No active subscription to cancel');
      }

      if (immediate) {
        await stripe.subscriptions.cancel(workspace.stripeSubscriptionId);

        await db.update(workspaces)
          .set({
            subscriptionTier: 'free',
            subscriptionStatus: 'cancelled',
            stripeSubscriptionId: null,
          })
          .where(eq(workspaces.id, workspaceId));

        // Reset to free tier
        await this.creditManager.initializeCredits(workspaceId, 'free');
      } else {
        // Cancel at period end
        await stripe.subscriptions.update(workspace.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });

        await db.update(workspaces)
          .set({
            subscriptionStatus: 'cancelled',
          })
          .where(eq(workspaces.id, workspaceId));
      }

      return { success: true };
    } catch (error: any) {
      console.error('Subscription cancellation error:', error);
      return {
        success: false,
        error: error.message || 'Failed to cancel subscription',
      };
    }
  }

  /**
   * Handle Stripe webhook for subscription updates
   */
  async handleSubscriptionWebhook(event: Stripe.Event): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const workspaceId = subscription.metadata.workspaceId;

    if (!workspaceId) {
      console.error('Subscription webhook missing workspaceId');
      return;
    }

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        const tier = subscription.metadata.tier as SubscriptionTier;
        const status = subscription.status === 'active' ? 'active' : 'suspended';

        await db.update(workspaces)
          .set({
            subscriptionTier: tier,
            subscriptionStatus: status,
            stripeSubscriptionId: subscription.id,
          })
          .where(eq(workspaces.id, workspaceId));

        // Ensure credits are updated to new tier
        if (status === 'active') {
          await this.creditManager.initializeCredits(workspaceId, tier);
        }
        break;

      case 'customer.subscription.deleted':
        await db.update(workspaces)
          .set({
            subscriptionTier: 'free',
            subscriptionStatus: 'cancelled',
            stripeSubscriptionId: null,
          })
          .where(eq(workspaces.id, workspaceId));

        // Reset to free tier
        await this.creditManager.initializeCredits(workspaceId, 'free');
        break;

      case 'invoice.payment_failed':
        await db.update(workspaces)
          .set({
            subscriptionStatus: 'suspended',
          })
          .where(eq(workspaces.id, workspaceId));
        break;

      case 'invoice.payment_succeeded':
        await db.update(workspaces)
          .set({
            subscriptionStatus: 'active',
          })
          .where(eq(workspaces.id, workspaceId));
        break;
    }
  }

  /**
   * Calculate weekly overage billing (for excessive credit usage beyond monthly allocation)
   * 
   * This is called weekly to bill for credit purchases beyond base subscription
   */
  async calculateWeeklyOverages(workspaceId: string): Promise<number> {
    // Get credit purchases from this week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const creditBalance = await this.creditManager.getBalance(workspaceId);
    
    // Weekly overage billing is handled separately via credit purchases
    // Stripe webhooks for credit_pack purchases already handle payment
    // This method can be used for reporting/analytics
    
    return 0; // Overages already billed via credit purchase flow
  }

  /**
   * Get subscription details for workspace
   */
  async getSubscriptionDetails(workspaceId: string) {
    const [workspace] = await db.select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const tier = workspace.subscriptionTier as SubscriptionTier;
    const pricing = TIER_PRICING[tier];

    let stripeSubscription: Stripe.Subscription | null = null;
    if (workspace.stripeSubscriptionId) {
      try {
        stripeSubscription = await stripe.subscriptions.retrieve(workspace.stripeSubscriptionId);
      } catch (error) {
        console.error('Failed to retrieve Stripe subscription:', error);
      }
    }

    const creditBalance = await this.creditManager.getBalance(workspaceId);

    return {
      tier,
      status: workspace.subscriptionStatus,
      monthlyPrice: pricing.monthlyPrice,
      yearlyPrice: pricing.yearlyPrice,
      monthlyCredits: pricing.credits,
      currentBalance: creditBalance,
      stripeSubscription,
      billingCycle: stripeSubscription?.items.data[0]?.price?.recurring?.interval || 'monthly',
      currentPeriodEnd: stripeSubscription && (stripeSubscription as any).current_period_end
        ? new Date((stripeSubscription as any).current_period_end * 1000) 
        : null,
    };
  }
}

export const subscriptionManager = new SubscriptionManager();
