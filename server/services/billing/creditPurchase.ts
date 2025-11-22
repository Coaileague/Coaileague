/**
 * Credit Purchase Service
 * Handles Stripe checkout for credit pack purchases and webhook fulfillment
 */

import Stripe from 'stripe';
import { db } from '../../db';
import { workspaces, creditPacks } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { creditManager } from './creditManager';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

export interface CreateCheckoutSessionParams {
  workspaceId: string;
  userId: string;
  creditPackId: string;
  successUrl: string;
  cancelUrl: string;
}

export class CreditPurchaseService {
  /**
   * Create Stripe Checkout session for credit pack purchase
   */
  async createCheckoutSession(params: CreateCheckoutSessionParams) {
    const { workspaceId, userId, creditPackId, successUrl, cancelUrl } = params;

    // Fetch workspace for customer info
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Fetch credit pack
    const [pack] = await db
      .select()
      .from(creditPacks)
      .where(eq(creditPacks.id, creditPackId))
      .limit(1);

    if (!pack || !pack.isActive) {
      throw new Error('Credit pack not found or inactive');
    }

    // Calculate total credits (base + bonus)
    const totalCredits = pack.creditsAmount + (pack.bonusCredits || 0);

    // Create or get Stripe customer
    let customerId = workspace.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: workspace.companyName || undefined,
        metadata: {
          workspaceId: workspace.id,
          organizationId: workspace.organizationId || '',
        },
      });
      customerId = customer.id;

      // Update workspace with customer ID
      await db
        .update(workspaces)
        .set({ stripeCustomerId: customerId })
        .where(eq(workspaces.id, workspaceId));
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(parseFloat(pack.priceUsd) * 100), // Convert to cents
            product_data: {
              name: pack.name,
              description: `${pack.creditsAmount} automation credits${pack.bonusCredits ? ` + ${pack.bonusCredits} bonus credits` : ''}`,
              metadata: {
                creditPackId: pack.id,
                creditsAmount: pack.creditsAmount.toString(),
                bonusCredits: (pack.bonusCredits || 0).toString(),
                totalCredits: totalCredits.toString(),
              },
            },
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        workspaceId,
        userId,
        creditPackId: pack.id,
        creditsAmount: pack.creditsAmount.toString(),
        bonusCredits: (pack.bonusCredits || 0).toString(),
        totalCredits: totalCredits.toString(),
        type: 'credit_purchase',
      },
    });

    return {
      sessionId: session.id,
      sessionUrl: session.url,
    };
  }

  /**
   * Handle successful payment webhook from Stripe
   * This is called by Stripe when payment succeeds
   */
  async handlePaymentSuccess(session: Stripe.Checkout.Session) {
    const { workspaceId, userId, creditsAmount, totalCredits } = session.metadata || {};

    if (!workspaceId || !userId || !creditsAmount) {
      console.error('[Credit Purchase] Missing metadata in checkout session:', session.id);
      return;
    }

    const credits = parseInt(totalCredits || creditsAmount);
    const amountPaid = (session.amount_total || 0) / 100; // Convert from cents

    try {
      // Add credits to workspace
      await creditManager.addPurchasedCredits({
        workspaceId,
        userId,
        amount: credits,
        creditPackId: session.metadata?.creditPackId || '',
        stripePaymentIntentId: session.payment_intent as string || session.id,
        amountPaid,
        description: `Purchased ${credits} automation credits for $${amountPaid.toFixed(2)}`,
      });

      console.log(`✅ [Credit Purchase] Added ${credits} credits to workspace ${workspaceId}`);
    } catch (error) {
      console.error('[Credit Purchase] Error adding credits:', error);
      throw error;
    }
  }

  /**
   * Verify webhook signature from Stripe
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): Stripe.Event {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET not configured');
    }

    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }
}

export const creditPurchaseService = new CreditPurchaseService();
