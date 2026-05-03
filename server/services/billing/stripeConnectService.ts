/**
 * Stripe Connect — Multi-Party Routing (Wave 4 / Task 3 G-3)
 * ─────────────────────────────────────────────────────────────────────────────
 * When a client pays an invoice, funds route via Destination Charges:
 *   Client → CoAIleague platform Stripe account → (minus platform fee) → Tenant's connected account
 *
 * The platform_fee_amount is the CoAIleague SaaS margin.
 * The net (total - fee) lands in the tenant's Stripe connected account automatically.
 *
 * ISOLATION: The tenant's corporate bank account is never touched by platform ops.
 * Their guards are paid from their Plaid-linked bank via achTransferService (separate flow).
 */

import { db } from '../../db';
import { workspaces, orgFinanceSettings } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { getStripe } from './stripeClient';
import { createLogger } from '../../lib/logger';

const log = createLogger('stripeConnectService');

/** Platform fee — percentage of invoice total kept by CoAIleague */
const PLATFORM_FEE_PERCENT = 0.025; // 2.5% platform cut (configurable via env)

export interface ConnectPaymentResult {
  success: boolean;
  paymentIntentId?: string;
  destinationAccountId?: string;
  platformFeeAmount?: number;
  error?: string;
}

/**
 * createDestinationCharge
 * Routes client invoice payment to the tenant's Stripe Connect account.
 * Uses Destination Charges — platform takes a fee, tenant gets the rest instantly.
 */
export async function createDestinationCharge(params: {
  workspaceId: string;
  amountCents: number;             // total invoice amount in cents
  currency?: string;
  invoiceId: string;
  stripeCustomerId: string;        // client's Stripe customer ID
  paymentMethodId: string;         // client's saved payment method
  description?: string;
}): Promise<ConnectPaymentResult> {
  const {
    workspaceId,
    amountCents,
    currency = 'usd',
    invoiceId,
    stripeCustomerId,
    paymentMethodId,
    description = 'Security Services Invoice',
  } = params;

  try {
    // Look up the tenant's Stripe Connect account ID
    const [finSettings] = await db
      .select({ stripeConnectAccountId: orgFinanceSettings.stripeConnectAccountId })
      .from(orgFinanceSettings)
      .where(eq(orgFinanceSettings.workspaceId, workspaceId))
      .limit(1);

    const tenantStripeAccountId = finSettings?.stripeConnectAccountId;

    const stripe = getStripe();
    const platformFeeAmount = Math.round(amountCents * PLATFORM_FEE_PERCENT);

    if (tenantStripeAccountId) {
      // ── Destination Charge: client pays, tenant gets net, platform keeps fee ──
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency,
        customer: stripeCustomerId,
        payment_method: paymentMethodId,
        confirm: true,
        description: `${description} | Invoice: ${invoiceId}`,
        transfer_data: {
          destination: tenantStripeAccountId,
        },
        application_fee_amount: platformFeeAmount,
        metadata: {
          invoiceId,
          workspaceId,
          coaileague_payment_type: 'destination_charge',
        },
      });

      log.info('[StripeConnect] Destination charge created', {
        paymentIntentId: paymentIntent.id,
        amountCents,
        platformFeeAmount,
        destinationAccount: tenantStripeAccountId,
        invoiceId,
      });

      return {
        success: true,
        paymentIntentId: paymentIntent.id,
        destinationAccountId: tenantStripeAccountId,
        platformFeeAmount,
      };
    } else {
      // Fallback: no Connect account yet — standard charge to platform account
      log.warn('[StripeConnect] No Connect account for workspace — using platform charge', { workspaceId });

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency,
        customer: stripeCustomerId,
        payment_method: paymentMethodId,
        confirm: true,
        description: `${description} | Invoice: ${invoiceId} [no-connect-fallback]`,
        metadata: {
          invoiceId,
          workspaceId,
          coaileague_payment_type: 'platform_charge_no_connect',
        },
      });

      return {
        success: true,
        paymentIntentId: paymentIntent.id,
        destinationAccountId: undefined,
        platformFeeAmount: 0,
      };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('[StripeConnect] Destination charge failed', { invoiceId, workspaceId, error: msg });
    return { success: false, error: msg };
  }
}

/**
 * onboardTenantConnectAccount
 * Creates a Stripe Express Connect account for a tenant and returns the OAuth link.
 * Called during workspace onboarding or from billing settings.
 */
export async function onboardTenantConnectAccount(params: {
  workspaceId: string;
  email: string;
  businessName: string;
  returnUrl: string;
  refreshUrl: string;
}): Promise<{ success: boolean; onboardingUrl?: string; accountId?: string; error?: string }> {
  const { workspaceId, email, businessName, returnUrl, refreshUrl } = params;

  try {
    const stripe = getStripe();

    // Create the Express account
    const account = await stripe.accounts.create({
      type: 'express',
      email,
      business_profile: { name: businessName },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { workspaceId },
    });

    // Save the account ID to org finance settings
    await db.update(orgFinanceSettings)
      .set({ stripeConnectAccountId: account.id, updatedAt: new Date() })
      .where(eq(orgFinanceSettings.workspaceId, workspaceId));

    // Generate the onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    log.info('[StripeConnect] Connect account created', { accountId: account.id, workspaceId });

    return { success: true, onboardingUrl: accountLink.url, accountId: account.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('[StripeConnect] Account onboarding failed', { workspaceId, error: msg });
    return { success: false, error: msg };
  }
}
