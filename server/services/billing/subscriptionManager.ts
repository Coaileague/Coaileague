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
import crypto from 'crypto';
import { db } from '../../db';
import { platformEventBus } from '../platformEventBus';
import {
  workspaces,
  subscriptions,
  users,
  employees,
  billingAuditLog,
} from '@shared/schema';
import { eq, and, desc, count } from 'drizzle-orm';
import { CreditManager, TIER_CREDIT_ALLOCATIONS } from './creditManager';
import { createLogger } from '../../lib/logger';
import { isBillingExemptByRecord, logExemptedAction } from './founderExemption';
import { universalAudit } from '../universalAuditService';

const log = createLogger('SubscriptionManager');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
  timeout: 10000,
  maxNetworkRetries: 2,
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
    monthlyPrice: BILLING.tiers.starter.monthlyPrice,
    yearlyPrice: BILLING.tiers.starter.yearlyPrice,
    stripePriceId: process.env.STRIPE_PRICE_STARTER_MONTHLY || process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
    stripeYearlyPriceId: process.env.STRIPE_PRICE_STARTER_ANNUAL || process.env.STRIPE_STARTER_YEARLY_PRICE_ID || process.env.STRIPE_PRICE_ID_STARTER_ANNUAL,
    seatOveragePriceId: process.env.STRIPE_PRICE_STARTER_SEAT_OVERAGE || process.env.STRIPE_PRICE_SEAT_OVERAGE,
    credits: TIER_CREDIT_ALLOCATIONS.starter,
    maxEmployees: BILLING.tiers.starter.maxEmployees,
    maxManagers: BILLING.tiers.starter.maxManagers,
    adminReplacementValue: BILLING.tiers.starter.adminReplacementValue,
  },
  professional: {
    monthlyPrice: BILLING.tiers.professional.monthlyPrice,
    yearlyPrice: BILLING.tiers.professional.yearlyPrice,
    stripePriceId: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY || process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID,
    stripeYearlyPriceId: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL || process.env.STRIPE_PROFESSIONAL_YEARLY_PRICE_ID || process.env.STRIPE_PRICE_ID_PROFESSIONAL_ANNUAL,
    seatOveragePriceId: process.env.STRIPE_PRICE_PROFESSIONAL_SEAT_OVERAGE || process.env.STRIPE_PRICE_SEAT_OVERAGE,
    credits: TIER_CREDIT_ALLOCATIONS.professional,
    maxEmployees: BILLING.tiers.professional.maxEmployees,
    maxManagers: BILLING.tiers.professional.maxManagers,
    adminReplacementValue: BILLING.tiers.professional.adminReplacementValue,
  },
  business: {
    monthlyPrice: BILLING.tiers.business.monthlyPrice,
    yearlyPrice: BILLING.tiers.business.yearlyPrice,
    stripePriceId: process.env.STRIPE_PRICE_BUSINESS_MONTHLY || process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID,
    stripeYearlyPriceId: process.env.STRIPE_PRICE_BUSINESS_ANNUAL || process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID || process.env.STRIPE_PRICE_ID_BUSINESS_ANNUAL,
    seatOveragePriceId: process.env.STRIPE_PRICE_BUSINESS_SEAT_OVERAGE || process.env.STRIPE_PRICE_SEAT_OVERAGE,
    credits: TIER_CREDIT_ALLOCATIONS.business,
    maxEmployees: BILLING.tiers.business.maxEmployees,
    maxManagers: BILLING.tiers.business.maxManagers,
    adminReplacementValue: BILLING.tiers.business.adminReplacementValue,
  },
  enterprise: {
    monthlyPrice: BILLING.tiers.enterprise.monthlyPrice,
    yearlyPrice: BILLING.tiers.enterprise.yearlyPrice,
    stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID,
    stripeYearlyPriceId: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL || process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID || process.env.STRIPE_PRICE_ID_ENTERPRISE_ANNUAL,
    seatOveragePriceId: process.env.STRIPE_PRICE_ENTERPRISE_SEAT_OVERAGE || process.env.STRIPE_PRICE_SEAT_OVERAGE,
    credits: TIER_CREDIT_ALLOCATIONS.enterprise,
    maxEmployees: BILLING.tiers.enterprise.maxEmployees,
    maxManagers: BILLING.tiers.enterprise.maxManagers,
    adminReplacementValue: BILLING.tiers.enterprise.adminReplacementValue,
  },
  strategic: {
    monthlyPrice: BILLING.tiers.strategic.startsAt,
    yearlyPrice: 0,
    stripePriceId: process.env.STRIPE_STRATEGIC_MONTHLY_PRICE_ID || null,
    stripeYearlyPriceId: null,
    credits: TIER_CREDIT_ALLOCATIONS.strategic,
    maxEmployees: 0,
    maxManagers: 0,
    adminReplacementValue: 0,
  },
} as const;

export type SubscriptionTier = 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic';
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
  private creditManager: CreditManager;

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
    // GAP-58 FIX: workspaceId alone is deterministic for customer creation — one customer per workspace.
    }, { idempotencyKey: `cust-create-${workspaceId}` });

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

      const [workspace] = await db.select({
        billingExempt: workspaces.billingExempt,
        founderExemption: workspaces.founderExemption
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

      // FOUNDER EXEMPTION: Statewide Protective Services is permanently enterprise
      // Block creation of any other tier/subscription.
      if (workspace && isBillingExemptByRecord(workspace)) {
        log.info(`[SubscriptionManager] Founder exemption — blocking subscription creation for workspace ${workspaceId}`);
        return { success: true }; // Silently succeed as they are already on the best "tier"
      }

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
      // GAP-58 FIX: Remove random UUID suffix — workspaceId+tier+billingCycle is already unique
      // for any given subscription creation attempt. Random suffix caused duplicate subscriptions
      // on retry (network timeout → new UUID → Stripe saw new request → second subscription created).
      }, { idempotencyKey: `sub-create-${workspaceId}-${tier}-${billingCycle}` });

      // Update workspace
      await db.update(workspaces)
        .set({
          subscriptionTier: tier,
          subscriptionStatus: 'active',
          stripeSubscriptionId: subscription.id,
        })
        .where(eq(workspaces.id, workspaceId));

      // Upgrade credit allocation to the new paid tier. The workspace already
      // has a credits record from free-tier initialization, so we use
      // updateTierAllocation (safe UPDATE) rather than initializeCredits
      // (plain INSERT that would throw a unique constraint violation).
      await this.creditManager.updateTierAllocation(workspaceId, tier);

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
      log.error('Subscription creation error', { error: (error instanceof Error ? error.message : String(error)) });
      return {
        success: false,
        error: (error instanceof Error ? error.message : String(error)) || 'Failed to create subscription',
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

      // FOUNDER EXEMPTION: Statewide Protective Services is permanently enterprise
      // No tier changes, no downgrades, no cancellations — ever.
      if (isBillingExemptByRecord(workspace)) {
        log.info(`[SubscriptionManager] Founder exemption — blocking tier change for workspace ${workspaceId}`);
        await logExemptedAction({ workspaceId, action: 'changeSubscriptionTier:BLOCKED', metadata: { requestedTier: newTier } });
        return { success: false, error: 'Founder exemption: subscription tier is permanently enterprise and cannot be changed.' };
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

        // Downgrade credits to free tier — preserves purchased credit packs.
        // Uses downgradeCreditsOnCancellation (safe UPDATE) rather than
        // initializeCredits (plain INSERT that throws if record already exists).
        await this.creditManager.downgradeCreditsOnCancellation(workspaceId);

        platformEventBus.publish({
          type: 'workspace_downgraded',
          category: 'automation',
          title: 'Workspace Downgraded to Free',
          description: `Workspace ${workspaceId} subscription cancelled and tier reverted to free`,
          workspaceId,
          metadata: { previousTier: currentTier, newTier: 'free', reason: 'tier_change_to_free' },
          visibility: 'org_leadership',
        }).catch(err => log.warn('workspace_downgraded event publish failed (non-blocking)', { error: (err instanceof Error ? err.message : String(err)) }));

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

      // Update credit allocation to new tier. Safe UPDATE — does not disturb
      // currentBalance or purchasedCreditsBalance. The next monthly reset will
      // apply the new monthlyAllocation as the refresh ceiling.
      await this.creditManager.updateTierAllocation(workspaceId, newTier);

      // Phase 30: Tier change audit record (non-blocking)
      universalAudit.log({
        workspaceId,
        actorType: 'system',
        action: 'subscription.tier_changed',
        entityType: 'workspace',
        entityId: workspaceId,
        changeType: 'update',
        changes: { subscriptionTier: { old: currentTier, new: newTier } },
        metadata: { billingCycle, stripeSubscriptionId: workspace.stripeSubscriptionId },
        sourceRoute: '/api/billing/subscription/change',
      }).catch((err) => log.warn('[subscriptionManager] Fire-and-forget failed:', err));

      return { success: true, subscriptionId: workspace.stripeSubscriptionId };
    } catch (error: any) {
      log.error('Subscription change error', { error: (error instanceof Error ? error.message : String(error)) });
      return {
        success: false,
        error: (error instanceof Error ? error.message : String(error)) || 'Failed to change subscription',
      };
    }
  }

  /**
   * Add or update metered seat subscription items in Stripe.
   * This is used for personal/client email addresses which are billed per seat.
   */
  async updateMeteredSeats(workspaceId: string, quantity: number, priceId?: string): Promise<void> {
    const [workspace] = await db.select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace?.stripeSubscriptionId) {
      log.warn(`[SubscriptionManager] No active subscription for workspace ${workspaceId} to update metered seats.`);
      return;
    }

    // Default to the tier-specific seat overage price if not provided
    const tier = workspace.subscriptionTier as SubscriptionTier;
    const pricing = TIER_PRICING[tier];
    const effectivePriceId = priceId || (pricing as any).seatOveragePriceId;

    if (!effectivePriceId) {
      log.warn(`[SubscriptionManager] No seat overage price ID configured for ${tier}.`);
      return;
    }

    const subscription = await stripe.subscriptions.retrieve(workspace.stripeSubscriptionId);
    const existingItem = subscription.items.data.find(item => item.price.id === effectivePriceId);

    if (existingItem) {
      if (quantity === 0) {
        // Remove item if quantity is zero
        await stripe.subscriptionItems.del(existingItem.id);
      } else {
        // Update quantity
        await stripe.subscriptionItems.update(existingItem.id, {
          quantity,
        });
      }
    } else if (quantity > 0) {
      // Add new item
      await stripe.subscriptionItems.create({
        subscription: workspace.stripeSubscriptionId,
        price: effectivePriceId,
        quantity,
      });
    }
    
    log.info(`[SubscriptionManager] Updated metered seats for workspace ${workspaceId}: quantity=${quantity}`);
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

      // FOUNDER EXEMPTION: Statewide Protective Services cannot be cancelled — ever.
      if (workspace && isBillingExemptByRecord(workspace)) {
        log.info(`[SubscriptionManager] Founder exemption — blocking cancellation for workspace ${workspaceId}`);
        await logExemptedAction({ workspaceId, action: 'cancelSubscription:BLOCKED' });
        return { success: false, error: 'Founder exemption: subscription cannot be cancelled.' };
      }

      if (!workspace?.stripeSubscriptionId) {
        throw new Error('No active subscription to cancel');
      }

      if (immediate) {
        const cancelledSubId = workspace.stripeSubscriptionId;
        await stripe.subscriptions.cancel(cancelledSubId);

        await db.transaction(async (tx) => {
          await tx.update(workspaces)
            .set({
              subscriptionTier: 'free',
              subscriptionStatus: 'cancelled',
              stripeSubscriptionId: null,
            })
            .where(eq(workspaces.id, workspaceId));
          await tx.insert(billingAuditLog).values({
            workspaceId,
            eventType: 'subscription_cancelled_immediate',
            eventCategory: 'billing',
            actorType: 'system',
            description: 'Subscription cancelled immediately — workspace reverted to free tier',
            relatedEntityType: 'subscription',
            relatedEntityId: cancelledSubId,
            previousState: { subscriptionTier: workspace.subscriptionTier, subscriptionStatus: workspace.subscriptionStatus, stripeSubscriptionId: cancelledSubId },
            newState: { subscriptionTier: 'free', subscriptionStatus: 'cancelled', stripeSubscriptionId: null },
          });
        });

        // Downgrade to free tier — preserves purchased credit packs.
        await this.creditManager.downgradeCreditsOnCancellation(workspaceId);

        platformEventBus.publish({
          type: 'subscription_cancelled',
          category: 'automation',
          title: 'Subscription Cancelled Immediately',
          description: `Workspace ${workspaceId} subscription cancelled immediately — reverted to free tier`,
          workspaceId,
          metadata: { immediate: true, previousTier: workspace.subscriptionTier, cancelledSubId },
          visibility: 'org_leadership',
        }).catch(err => log.warn('subscription_cancelled event publish failed (non-blocking)', { error: (err instanceof Error ? err.message : String(err)) }));
      } else {
        // Cancel at period end — Stripe call first, DB update only on success
        const updatedSub = await stripe.subscriptions.update(workspace.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });

        // BUG FIX: Keep stripeSubscriptionId intact so the subscription can be resumed
        // (un-cancelled) before the period ends. Clearing it here broke `resumeSubscription`
        // which requires the ID to call Stripe. The ID will be nulled when the
        // `customer.subscription.deleted` webhook fires after the billing period ends.
        // Status 'pending_cancel' signals the subscription is still active but
        // scheduled to terminate — this is distinct from fully 'cancelled'.
        await db.transaction(async (tx) => {
          await tx.update(workspaces)
            .set({
              subscriptionStatus: 'pending_cancel',
              // stripeSubscriptionId preserved intentionally — needed for resume
            })
            .where(eq(workspaces.id, workspaceId));
          await tx.insert(billingAuditLog).values({
            workspaceId,
            eventType: 'subscription_cancel_period_end',
            eventCategory: 'billing',
            actorType: 'system',
            description: `Subscription set to cancel at period end. Stripe cancel_at: ${updatedSub.cancel_at ? new Date(updatedSub.cancel_at * 1000).toISOString() : 'unknown'}`,
            relatedEntityType: 'subscription',
            relatedEntityId: workspace.stripeSubscriptionId,
            previousState: { subscriptionStatus: workspace.subscriptionStatus, stripeSubscriptionId: workspace.stripeSubscriptionId },
            newState: { subscriptionStatus: 'pending_cancel', stripeSubscriptionId: workspace.stripeSubscriptionId, cancelAtPeriodEnd: true },
          });
        });

        platformEventBus.publish({
          type: 'subscription_cancelled',
          category: 'automation',
          title: 'Subscription Set to Cancel at Period End',
          description: `Workspace ${workspaceId} subscription will cancel at period end`,
          workspaceId,
          metadata: { immediate: false, cancelAtPeriodEnd: true, stripeSubscriptionId: workspace.stripeSubscriptionId },
          visibility: 'org_leadership',
        }).catch(err => log.warn('subscription_cancelled (period-end) event publish failed (non-blocking)', { error: (err instanceof Error ? err.message : String(err)) }));
      }

      return { success: true };
    } catch (error: any) {
      log.error('Subscription cancellation error', { error: (error instanceof Error ? error.message : String(error)) });
      return {
        success: false,
        error: (error instanceof Error ? error.message : String(error)) || 'Failed to cancel subscription',
      };
    }
  }

  /**
   * Resume a suspended or cancelled subscription
   * Handles different Stripe subscription states:
   * - Active: Already good, optionally removes cancel_at_period_end
   * - Paused: Uses stripe.subscriptions.resume()
   * - Past_due/unpaid: Returns failure (requires payment resolution first)
   * - Fully cancelled: Returns error (caller should create new subscription)
   * 
   * IMPORTANT: Does NOT mutate local state - caller is responsible for updating
   * local records only after this returns success=true
   */
  async resumeSubscription(workspaceId: string, tier?: SubscriptionTier): Promise<SubscriptionResult> {
    try {
      const [workspace] = await db.select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      if (!workspace?.stripeSubscriptionId) {
        return {
          success: false,
          error: 'No existing subscription to resume - create a new subscription instead',
        };
      }

      // Retrieve current Stripe subscription state
      const subscription = await stripe.subscriptions.retrieve(workspace.stripeSubscriptionId);
      
      const targetTier = tier || workspace.subscriptionTier as SubscriptionTier || 'starter';
      const stripeSubId = workspace.stripeSubscriptionId;

      // Handle based on subscription status - only return success for confirmed resumable states
      switch (subscription.status) {
        case 'active':
          // Already active - update tier if different and remove pending cancellation
          if (subscription.cancel_at_period_end) {
            await stripe.subscriptions.update(stripeSubId, {
              cancel_at_period_end: false,
              metadata: {
                ...subscription.metadata,
                tier: targetTier,
                resumed: new Date().toISOString(),
              },
            });
          }
          // Subscription is active - success
          log.info('Stripe subscription confirmed active', { stripeSubId });
          return { success: true, subscriptionId: stripeSubId };

        case 'trialing':
          // Trial subscriptions are also considered active
          log.info('Stripe subscription is in trial - confirmed active', { stripeSubId });
          return { success: true, subscriptionId: stripeSubId };

        case 'paused':
          // Resume paused subscription - this activates it in Stripe
          await stripe.subscriptions.resume(stripeSubId, {
            billing_cycle_anchor: 'now',
          });
          log.info('Stripe subscription resumed from paused', { stripeSubId });
          return { success: true, subscriptionId: stripeSubId };

        case 'past_due':
        case 'unpaid':
          // Cannot resume until payment succeeds - do NOT update local state
          log.warn('Subscription cannot resume until payment succeeds', { stripeSubId, status: subscription.status });
          return {
            success: false,
            error: `Subscription is ${subscription.status} - payment must be resolved before reactivation`,
            subscriptionId: stripeSubId,
          };

        case 'canceled':
        case 'incomplete_expired':
          // Fully cancelled - cannot resume, must create new
          return {
            success: false,
            error: `Subscription is fully cancelled (${subscription.status}) - create a new subscription instead`,
            subscriptionId: stripeSubId,
          };

        case 'incomplete':
          // Initial payment never completed
          return {
            success: false,
            error: 'Subscription is incomplete - initial payment never completed',
            subscriptionId: stripeSubId,
          };

        default:
          log.warn('Unexpected subscription status', { stripeSubId, status: subscription.status });
          return {
            success: false,
            error: `Unexpected subscription status: ${subscription.status}`,
            subscriptionId: stripeSubId,
          };
      }
    } catch (error: any) {
      log.error('Subscription resume error', { error: (error instanceof Error ? error.message : String(error)) });
      return {
        success: false,
        error: (error instanceof Error ? error.message : String(error)) || 'Failed to resume subscription',
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
      log.error('Subscription webhook missing workspaceId');
      return;
    }

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const tier = subscription.metadata.tier as SubscriptionTier;
        // Map Stripe status to our internal enum values:
        //   'active'   → 'active'
        //   'trialing' → 'trial'  (DB enum uses 'trial', not 'trialing')
        //   everything else (paused, past_due, unpaid, incomplete, etc.) → 'suspended'
        const status = subscription.status === 'active'
          ? 'active'
          : subscription.status === 'trialing'
            ? 'trial'
            : 'suspended';

        // RC2 (Phase 2): workspace tier + credits allocation must be updated atomically.
        // If the credits update fails the workspace still shows the new tier — making
        // the user pay a higher price but get the old allocation (silent over-charge).
        await db.transaction(async (tx) => {
          await tx.update(workspaces)
            .set({
              subscriptionTier: tier,
              subscriptionStatus: status,
              stripeSubscriptionId: subscription.id,
            })
            .where(eq(workspaces.id, workspaceId));

          // Safe UPDATE path — workspace already has a credits record; initializeCredits
          // (plain INSERT) would throw a unique constraint violation here.
          if (status === 'active' || status === 'trial') {
            await this.creditManager.updateTierAllocation(workspaceId, tier, tx);
          }
        });
        break;
      }

      case 'customer.subscription.deleted': {
        // RC2 (Phase 2): workspace revert + credit downgrade must be atomic.
        // If the credit downgrade fails but the workspace is already marked 'cancelled',
        // the user loses their subscription tier but keeps a premium credit allocation.
        await db.transaction(async (tx) => {
          await tx.update(workspaces)
            .set({
              subscriptionTier: 'free',
              subscriptionStatus: 'cancelled',
              stripeSubscriptionId: null,
              // Reset billing cycle fields — stale period data causes phantom invoice
              // generation and incorrect "days remaining" in the billing dashboard.
              currentPeriodEnd: null,
              billingCycleDay: null,
            })
            .where(eq(workspaces.id, workspaceId));

          // Downgrade to free tier — preserves purchased credit packs.
          await this.creditManager.downgradeCreditsOnCancellation(workspaceId, tx);
        });

        // Platform event is a non-DB side-effect — intentionally outside the transaction.
        platformEventBus.publish({
          type: 'subscription_cancelled',
          category: 'automation',
          title: 'Subscription Deleted via Stripe Webhook',
          description: `Workspace ${workspaceId} subscription deleted — reverted to free tier`,
          workspaceId,
          metadata: { source: 'stripe_webhook', stripeEventType: 'customer.subscription.deleted', stripeSubId: subscription.id },
          visibility: 'org_leadership',
        }).catch(err => log.warn('subscription_cancelled webhook event publish failed (non-blocking)', { error: (err instanceof Error ? err.message : String(err)) }));
        break;
      }

      case 'invoice.payment_failed': {
        // FOUNDER EXEMPTION: Never suspend billing-exempt workspaces (e.g. Statewide Protective Services)
        const [wsCheck] = await db.select({ billingExempt: workspaces.billingExempt, founderExemption: workspaces.founderExemption })
          .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (wsCheck && isBillingExemptByRecord(wsCheck)) {
          await logExemptedAction({ workspaceId, action: 'stripe_payment_failed_suspension_skipped', metadata: { stripeSubId: subscription.id, reason: 'founder_exemption' } });
          log.info('EXEMPTED: Skipping payment_failed suspension for founder workspace', { workspaceId });
          break;
        }

        await db.update(workspaces)
          .set({
            subscriptionStatus: 'suspended',
          })
          .where(eq(workspaces.id, workspaceId));

        platformEventBus.publish({
          type: 'workspace_suspended',
          category: 'automation',
          title: 'Workspace Suspended — Payment Failed',
          description: `Workspace ${workspaceId} suspended due to invoice payment failure`,
          workspaceId,
          metadata: { source: 'stripe_webhook', stripeEventType: 'invoice.payment_failed', stripeSubId: subscription.id },
          visibility: 'org_leadership',
          priority: 3,
        }).catch(err => log.warn('workspace_suspended event publish failed (non-blocking)', { error: (err instanceof Error ? err.message : String(err)) }));
        break;
      }

      case 'invoice.payment_succeeded':
        await db.update(workspaces)
          .set({
            subscriptionStatus: 'active',
          })
          .where(eq(workspaces.id, workspaceId));

        platformEventBus.publish({
          type: 'workspace_reactivated',
          category: 'automation',
          title: 'Workspace Reactivated — Payment Succeeded',
          description: `Workspace ${workspaceId} reactivated after successful invoice payment`,
          workspaceId,
          metadata: { source: 'stripe_webhook', stripeEventType: 'invoice.payment_succeeded', stripeSubId: subscription.id },
          visibility: 'org_leadership',
        }).catch(err => log.warn('workspace_reactivated event publish failed (non-blocking)', { error: (err instanceof Error ? err.message : String(err)) }));
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
        log.error('Failed to retrieve Stripe subscription', { error: String(error) });
      }
    }

    const creditBalance = await this.creditManager.getBalance(workspaceId);

    let trialEndsAt: Date | null = null;
    let trialStartedAt: Date | null = null;
    try {
      const [sub] = await db.select({
        trialEndsAt: subscriptions.trialEndsAt,
        trialStartedAt: subscriptions.trialStartedAt,
      })
        .from(subscriptions)
        .where(eq(subscriptions.workspaceId, workspaceId))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);
      if (sub) {
        trialEndsAt = sub.trialEndsAt;
        trialStartedAt = sub.trialStartedAt;
      }
    } catch (e) {
      log.warn('[SubscriptionManager] Failed to fetch trial dates:', e);
    }

    let currentEmployees = 0;
    try {
      const [empCount] = await db.select({ value: count() })
        .from(employees)
        .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)));
      currentEmployees = empCount?.value || 0;
    } catch (e) {
      log.warn('[SubscriptionManager] Failed to count employees:', e);
    }

    // workspace_credits table dropped (Phase 16)
    let monthlyAllocation = pricing.credits;

    const maxEmployees = pricing.maxEmployees || 999999;
    const employeesRemaining = maxEmployees === 999999 ? 999999 : Math.max(0, maxEmployees - currentEmployees);
    const creditsUsed = Math.max(0, monthlyAllocation - creditBalance);

    return {
      tier,
      status: workspace.subscriptionStatus,
      monthlyPrice: pricing.monthlyPrice,
      yearlyPrice: pricing.yearlyPrice,
      monthlyCredits: monthlyAllocation,
      currentBalance: creditBalance,
      stripeSubscription,
      billingCycle: stripeSubscription?.items.data[0]?.price?.recurring?.interval || 'monthly',
      currentPeriodEnd: stripeSubscription && (stripeSubscription as any).current_period_end
        ? new Date((stripeSubscription as any).current_period_end * 1000) 
        : null,
      trialEndsAt,
      trialStartedAt,
      credits: {
        total: monthlyAllocation,
        used: creditsUsed,
        remaining: creditBalance,
      },
      limits: {
        maxEmployees,
        currentEmployees,
        employeesRemaining,
      },
    };
  }

  /**
   * Create Stripe Billing Portal session for org self-service
   * Allows orgs to manage payment methods, view invoices, cancel subscriptions
   */
  async createBillingPortalSession(workspaceId: string, returnUrl: string): Promise<{ url: string }> {
    const [workspace] = await db.select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    if (!workspace.stripeCustomerId) {
      throw new Error('No Stripe customer associated with this workspace');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: workspace.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  /**
   * Sync subscription state from Stripe (fallback if webhook missed)
   * Called periodically or on-demand to ensure database matches Stripe
   */
  async syncSubscriptionFromStripe(workspaceId: string): Promise<{ synced: boolean; changes: string[] }> {
    const [workspace] = await db.select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const changes: string[] = [];

    // If no Stripe subscription, check if there should be one
    if (!workspace.stripeSubscriptionId && workspace.stripeCustomerId) {
      // Look for active subscriptions for this customer
      const subscriptions = await stripe.subscriptions.list({
        customer: workspace.stripeCustomerId,
        status: 'active',
        limit: 1,
      });

      if (subscriptions.data.length > 0) {
        const sub = subscriptions.data[0];
        await db.update(workspaces)
          .set({
            stripeSubscriptionId: sub.id,
            subscriptionStatus: 'active',
            subscriptionTier: (sub.metadata.tier as SubscriptionTier) || workspace.subscriptionTier,
            updatedAt: new Date(),
          })
          .where(eq(workspaces.id, workspaceId));
        changes.push(`Found missing subscription: ${sub.id}`);
      }
    }

    // If has Stripe subscription, verify it's in sync
    if (workspace.stripeSubscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(workspace.stripeSubscriptionId);
        const stripeStatus = this.mapStripeStatus(subscription.status);
        const stripeTier = (subscription.metadata.tier as SubscriptionTier) || workspace.subscriptionTier;

        const updates: Partial<typeof workspace> = {};

        if (workspace.subscriptionStatus !== stripeStatus) {
          updates.subscriptionStatus = stripeStatus;
          changes.push(`Status: ${workspace.subscriptionStatus} → ${stripeStatus}`);
        }

        if (workspace.subscriptionTier !== stripeTier) {
          updates.subscriptionTier = stripeTier;
          changes.push(`Tier: ${workspace.subscriptionTier} → ${stripeTier}`);
        }

        if (Object.keys(updates).length > 0) {
          await db.update(workspaces)
            .set({ ...updates, updatedAt: new Date() })
            .where(eq(workspaces.id, workspaceId));
        }
      } catch (error: any) {
        if (error.code === 'resource_missing') {
          // Subscription was deleted in Stripe but we still have record
          await db.update(workspaces)
            .set({
              stripeSubscriptionId: null,
              subscriptionStatus: 'cancelled',
              subscriptionTier: 'free',
              updatedAt: new Date(),
            })
            .where(eq(workspaces.id, workspaceId));
          changes.push('Subscription deleted in Stripe - reverted to free');
        } else {
          throw error;
        }
      }
    }

    return { synced: true, changes };
  }

  /**
   * Map Stripe subscription status to our internal status
   */
  private mapStripeStatus(stripeStatus: string): string {
    const statusMap: Record<string, string> = {
      active: 'active',
      past_due: 'past_due',
      canceled: 'cancelled',
      unpaid: 'suspended',
      incomplete: 'pending',
      incomplete_expired: 'expired',
      trialing: 'trial',
      paused: 'paused',
    };
    return statusMap[stripeStatus] || 'unknown';
  }

  /**
   * Validate Stripe configuration for production readiness
   */
  static validateProductionReadiness(): {
    ready: boolean;
    checks: Array<{ name: string; status: 'pass' | 'fail' | 'warn'; message: string }>;
  } {
    const checks: Array<{ name: string; status: 'pass' | 'fail' | 'warn'; message: string }> = [];

    // Check API key
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      checks.push({ name: 'STRIPE_SECRET_KEY', status: 'fail', message: 'Not configured' });
    } else if (apiKey.startsWith('sk_test_')) {
      checks.push({ name: 'STRIPE_SECRET_KEY', status: 'warn', message: 'Using TEST mode key' });
    } else if (apiKey.startsWith('sk_live_')) {
      checks.push({ name: 'STRIPE_SECRET_KEY', status: 'pass', message: 'Using LIVE mode key' });
    }

    // Check publishable key
    const pubKey = process.env.VITE_STRIPE_PUBLIC_KEY;
    if (!pubKey) {
      checks.push({ name: 'VITE_STRIPE_PUBLIC_KEY', status: 'fail', message: 'Not configured - frontend checkout will fail' });
    } else if (pubKey.startsWith('pk_test_')) {
      checks.push({ name: 'VITE_STRIPE_PUBLIC_KEY', status: 'warn', message: 'Using TEST mode key' });
    } else if (pubKey.startsWith('pk_live_')) {
      checks.push({ name: 'VITE_STRIPE_PUBLIC_KEY', status: 'pass', message: 'Using LIVE mode key' });
    }

    // Check webhook secret
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      checks.push({ name: 'STRIPE_WEBHOOK_SECRET', status: 'fail', message: 'CRITICAL: Not configured - webhooks cannot be verified' });
    } else if (webhookSecret.startsWith('whsec_')) {
      checks.push({ name: 'STRIPE_WEBHOOK_SECRET', status: 'pass', message: 'Configured' });
    }

    // Check price IDs (canonical names with legacy fallbacks)
    const priceIds = {
      'Starter Monthly': process.env.STRIPE_PRICE_STARTER_MONTHLY || process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
      'Starter Annual': process.env.STRIPE_PRICE_STARTER_ANNUAL || process.env.STRIPE_STARTER_YEARLY_PRICE_ID,
      'Professional Monthly': process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY || process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID,
      'Professional Annual': process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL || process.env.STRIPE_PROFESSIONAL_YEARLY_PRICE_ID,
      'Business Monthly': process.env.STRIPE_PRICE_BUSINESS_MONTHLY || process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID,
      'Enterprise Monthly': process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID,
      'Seat Overage': process.env.STRIPE_PRICE_SEAT_OVERAGE,
      'Voice Platinum Starter': process.env.STRIPE_PRICE_VOICE_PLATINUM_STARTER,
      'Voice Platinum Professional': process.env.STRIPE_PRICE_VOICE_PLATINUM_PROFESSIONAL,
      'Voice Platinum Business': process.env.STRIPE_PRICE_VOICE_PLATINUM_BUSINESS,
      'Voice Platinum Enterprise': process.env.STRIPE_PRICE_VOICE_PLATINUM_ENTERPRISE,
    };

    for (const [name, priceId] of Object.entries(priceIds)) {
      if (!priceId) {
        checks.push({ name: `Price: ${name}`, status: 'fail', message: 'Not configured' });
      } else if (priceId.startsWith('price_')) {
        checks.push({ name: `Price: ${name}`, status: 'pass', message: priceId.substring(0, 20) + '...' });
      }
    }

    const ready = checks.every(c => c.status !== 'fail');

    return { ready, checks };
  }
}

export const subscriptionManager = new SubscriptionManager();
