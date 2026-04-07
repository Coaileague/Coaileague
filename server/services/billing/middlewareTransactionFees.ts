/**
 * Middleware Transaction Fee Service
 * 
 * Charges REAL MONEY via Stripe for payroll and invoicing middleware services.
 * This is CoAIleague's passive income engine — separate from AI credit billing.
 * 
 * BILLING MODEL (Mar 2026):
 *   Layer 1: Real cash via Stripe — middleware transaction fee (this service)
 *   Layer 2: Credits from org balance — AI token usage at cost (no markup)
 * 
 * The org pays real dollars for financial processing (replacing QB/ADP/Gusto),
 * and their credit balance covers AI compute at cost. Fair, transparent, profitable.
 * 
 * Fee schedule (from billingConfig.ts):
 *   Payroll:  $2.50/employee per run (pro: 10% off, enterprise: 20% off)
 *   Invoice:  2.9% + $0.25 flat per invoice payment processed
 *   ACH:      1.0% capped at $10 per transaction
 *   Payouts:  0.25% for Stripe Connect direct-to-bank
 */

import Stripe from 'stripe';
import { getStripe } from './stripeClient';
import { db } from '../../db';
import { workspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { getMiddlewareFees, type TierKey } from '@shared/billingConfig';
import { createLogger } from '../../lib/logger';
import { isBillingExemptByRecord, logExemptedAction } from './founderExemption';
import { isBillingExcluded } from './billingConstants';

const log = createLogger('MiddlewareFees');

// GAP-62 FIX: timeout + maxNetworkRetries are configured inside getStripe().
// Lazy getter prevents module-load crash if STRIPE_SECRET_KEY is missing.
const stripe = new Proxy({} as Stripe, {
  get(_t, prop) {
    return (getStripe() as any)[prop];
  },
});

export interface MiddlewareFeeResult {
  success: boolean;
  amountCents: number;
  stripeInvoiceItemId?: string;
  description: string;
  error?: string;
}

async function getWorkspaceBillingInfo(workspaceId: string) {
  const [workspace] = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      stripeCustomerId: workspaces.stripeCustomerId,
      subscriptionTier: workspaces.subscriptionTier,
      billingExempt: workspaces.billingExempt,
      founderExemption: workspaces.founderExemption,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  return workspace || null;
}

async function ensureStripeCustomer(
  workspaceId: string,
  workspaceName: string,
): Promise<string | null> {
  const workspace = await getWorkspaceBillingInfo(workspaceId);
  if (!workspace) return null;

  if (workspace.stripeCustomerId) {
    return workspace.stripeCustomerId;
  }

  try {
    const customer = await stripe.customers.create({
      name: workspaceName,
      metadata: {
        workspaceId,
        platform: 'coaileague',
      },
    });

    await db.update(workspaces)
      .set({ stripeCustomerId: customer.id })
      .where(eq(workspaces.id, workspaceId));

    log.info(`Created Stripe customer ${customer.id} for workspace ${workspaceId}`);
    return customer.id;
  } catch (err: any) {
    log.error(`Failed to create Stripe customer for workspace ${workspaceId}: ${(err instanceof Error ? err.message : String(err))}`);
    return null;
  }
}

/**
 * Charge a payroll middleware fee via Stripe.
 * Creates an invoice item on the customer's next invoice.
 * 
 * Fee: $3.50–4.95/employee per payroll run (with tier discounts)
 * Example: 100 employees × $4.95 = $495/run. Bi-weekly = $990/month.
 * Customer saves 33–50% vs Gusto/QuickBooks. ADP/Paychex charge $8–15.
 */
export async function chargePayrollMiddlewareFee(params: {
  workspaceId: string;
  payrollRunId: string;
  employeeCount: number;
  payPeriod?: string;
}): Promise<MiddlewareFeeResult> {
  const { workspaceId, payrollRunId, employeeCount, payPeriod } = params;

  if (employeeCount <= 0) {
    return { success: true, amountCents: 0, description: 'No employees — no fee' };
  }

  // PLATFORM WORKSPACE GUARD: never charge internal/system workspaces
  if (isBillingExcluded(workspaceId)) {
    log.info(`[PayrollFee] Platform workspace excluded — skipping payroll fee for workspace ${workspaceId}`);
    return { success: true, amountCents: 0, description: 'Platform workspace — payroll fee excluded' };
  }

  const workspace = await getWorkspaceBillingInfo(workspaceId);
  if (!workspace) {
    return { success: false, amountCents: 0, description: 'Workspace not found', error: 'workspace_not_found' };
  }

  // FOUNDER EXEMPTION: skip all Stripe charges for billing-exempt workspaces
  if (isBillingExemptByRecord(workspace)) {
    log.info(`[PayrollFee] Founder exemption — skipping payroll fee for workspace ${workspaceId}`);
    await logExemptedAction({ workspaceId, action: 'chargePayrollMiddlewareFee', skippedAmount: employeeCount, skippedAmountUnit: 'cents' });
    return { success: true, amountCents: 0, description: 'Founder exemption — payroll fee skipped' };
  }

  const tier = (workspace.subscriptionTier || 'free') as TierKey;

  if (tier === 'free') {
    log.info(`[PayrollFee] Skipping for free tier workspace ${workspaceId}`);
    return { success: true, amountCents: 0, description: 'Free tier — no middleware fee' };
  }

  const fees = getMiddlewareFees(tier);
  const totalCents = fees.payrollMiddleware.perEmployeeCents * employeeCount;

  if (totalCents <= 0) {
    return { success: true, amountCents: 0, description: 'No fee calculated' };
  }

  const customerId = await ensureStripeCustomer(workspaceId, workspace.name || 'Workspace');
  if (!customerId) {
    log.warn(`[PayrollFee] No Stripe customer for workspace ${workspaceId} — fee recorded but not charged`);
    return {
      success: false,
      amountCents: totalCents,
      description: `Payroll fee: ${employeeCount} employees × $${(fees.payrollMiddleware.perEmployeeCents / 100).toFixed(2)} = $${(totalCents / 100).toFixed(2)}`,
      error: 'no_stripe_customer',
    };
  }

  try {
    const periodLabel = payPeriod || 'current period';
    const idempotencyKey = `payroll_${workspaceId}_${payrollRunId}`;
    const invoiceItem = await stripe.invoiceItems.create({
      customer: customerId,
      amount: totalCents,
      currency: 'usd',
      description: `Payroll processing — ${employeeCount} employees × $${(fees.payrollMiddleware.perEmployeeCents / 100).toFixed(2)}/ea (${periodLabel})${fees.tierDiscount > 0 ? ` [${fees.tierDiscount}% ${tier} discount applied]` : ''}`,
      metadata: {
        type: 'middleware_payroll',
        workspaceId,
        payrollRunId,
        employeeCount: String(employeeCount),
        perEmployeeCents: String(fees.payrollMiddleware.perEmployeeCents),
        tier,
        discount: String(fees.tierDiscount),
      },
    }, { idempotencyKey });

    log.info(`[PayrollFee] Charged $${(totalCents / 100).toFixed(2)} for ${employeeCount} employees — workspace ${workspaceId} (Stripe item: ${invoiceItem.id})`);

    return {
      success: true,
      amountCents: totalCents,
      stripeInvoiceItemId: invoiceItem.id,
      description: `Payroll processing: ${employeeCount} employees × $${(fees.payrollMiddleware.perEmployeeCents / 100).toFixed(2)} = $${(totalCents / 100).toFixed(2)}`,
    };
  } catch (err: any) {
    log.error(`[PayrollFee] Stripe charge failed for workspace ${workspaceId}: ${(err instanceof Error ? err.message : String(err))}`);
    return {
      success: false,
      amountCents: totalCents,
      description: `Payroll fee calculation: $${(totalCents / 100).toFixed(2)}`,
      error: (err instanceof Error ? err.message : String(err)),
    };
  }
}

/**
 * Charge an invoice middleware fee via Stripe.
 * Creates an invoice item on the customer's next Stripe invoice.
 * 
 * Fee: 2.9% + $0.25 flat per invoice processed (with tier discounts)
 * Example: $5,000 invoice → 2.9% = $145 + $0.25 = $145.25
 * Customer saves vs QB Payments (same rate but no monthly seat fee).
 */
export async function chargeInvoiceMiddlewareFee(params: {
  workspaceId: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceAmountCents: number;
  paymentMethod?: 'card' | 'ach' | 'manual';
}): Promise<MiddlewareFeeResult> {
  const { workspaceId, invoiceId, invoiceNumber, invoiceAmountCents, paymentMethod = 'card' } = params;

  if (invoiceAmountCents <= 0) {
    return { success: true, amountCents: 0, description: 'Zero amount invoice — no fee' };
  }

  // PLATFORM WORKSPACE GUARD: never charge internal/system workspaces
  if (isBillingExcluded(workspaceId)) {
    log.info(`[InvoiceFee] Platform workspace excluded — skipping invoice fee for workspace ${workspaceId}`);
    return { success: true, amountCents: 0, description: 'Platform workspace — invoice fee excluded' };
  }

  const workspace = await getWorkspaceBillingInfo(workspaceId);
  if (!workspace) {
    return { success: false, amountCents: 0, description: 'Workspace not found', error: 'workspace_not_found' };
  }

  // FOUNDER EXEMPTION: skip all Stripe charges for billing-exempt workspaces
  if (isBillingExemptByRecord(workspace)) {
    log.info(`[InvoiceFee] Founder exemption — skipping invoice fee for workspace ${workspaceId}`);
    await logExemptedAction({ workspaceId, action: 'chargeInvoiceMiddlewareFee', skippedAmount: invoiceAmountCents, skippedAmountUnit: 'cents' });
    return { success: true, amountCents: 0, description: 'Founder exemption — invoice fee skipped' };
  }

  const tier = (workspace.subscriptionTier || 'free') as TierKey;

  if (tier === 'free') {
    log.info(`[InvoiceFee] Skipping for free tier workspace ${workspaceId}`);
    return { success: true, amountCents: 0, description: 'Free tier — no middleware fee' };
  }

  const fees = getMiddlewareFees(tier);
  let totalCents: number;
  let feeDescription: string;

  if (paymentMethod === 'ach') {
    const achFee = Math.round(invoiceAmountCents * (fees.achPayments.ratePercent / 100));
    totalCents = Math.min(achFee, fees.achPayments.capCents);
    feeDescription = `ACH processing ${fees.achPayments.ratePercent}% (capped at $${(fees.achPayments.capCents / 100).toFixed(2)})`;
  } else if (paymentMethod === 'manual') {
    totalCents = 0;
    feeDescription = 'Manual payment — no processing fee';
  } else {
    const percentFee = Math.round(invoiceAmountCents * (fees.invoiceProcessing.ratePercent / 100));
    totalCents = percentFee + fees.invoiceProcessing.flatFeeCents;
    feeDescription = `Card processing ${fees.invoiceProcessing.ratePercent}% + $${(fees.invoiceProcessing.flatFeeCents / 100).toFixed(2)}`;
  }

  if (totalCents <= 0) {
    return { success: true, amountCents: 0, description: feeDescription };
  }

  const customerId = await ensureStripeCustomer(workspaceId, workspace.name || 'Workspace');
  if (!customerId) {
    log.warn(`[InvoiceFee] No Stripe customer for workspace ${workspaceId}`);
    return {
      success: false,
      amountCents: totalCents,
      description: `Invoice ${invoiceNumber}: ${feeDescription} = $${(totalCents / 100).toFixed(2)}`,
      error: 'no_stripe_customer',
    };
  }

  try {
    const idempotencyKey = `invoice_${workspaceId}_${invoiceId}`;
    const invoiceItem = await stripe.invoiceItems.create({
      customer: customerId,
      amount: totalCents,
      currency: 'usd',
      description: `Invoice ${invoiceNumber} — ${feeDescription} on $${(invoiceAmountCents / 100).toFixed(2)}${fees.tierDiscount > 0 ? ` [${fees.tierDiscount}% ${tier} discount]` : ''}`,
      metadata: {
        type: 'middleware_invoice',
        workspaceId,
        invoiceId,
        invoiceNumber,
        invoiceAmountCents: String(invoiceAmountCents),
        paymentMethod,
        tier,
        discount: String(fees.tierDiscount),
      },
    }, { idempotencyKey });

    log.info(`[InvoiceFee] Charged $${(totalCents / 100).toFixed(2)} for invoice ${invoiceNumber} — workspace ${workspaceId} (Stripe item: ${invoiceItem.id})`);

    return {
      success: true,
      amountCents: totalCents,
      stripeInvoiceItemId: invoiceItem.id,
      description: `Invoice ${invoiceNumber}: ${feeDescription} = $${(totalCents / 100).toFixed(2)}`,
    };
  } catch (err: any) {
    log.error(`[InvoiceFee] Stripe charge failed for workspace ${workspaceId}: ${(err instanceof Error ? err.message : String(err))}`);
    return {
      success: false,
      amountCents: totalCents,
      description: `Invoice fee: $${(totalCents / 100).toFixed(2)}`,
      error: (err instanceof Error ? err.message : String(err)),
    };
  }
}

/**
 * Charge a direct deposit / ACH payout fee via Stripe.
 * 
 * Fee: 0.25% of payout amount (with tier discounts)
 * Used when paying employees via Stripe Connect.
 */
export async function chargePayoutMiddlewareFee(params: {
  workspaceId: string;
  payoutId: string;
  payoutAmountCents: number;
  recipientName?: string;
}): Promise<MiddlewareFeeResult> {
  const { workspaceId, payoutId, payoutAmountCents, recipientName } = params;

  if (payoutAmountCents <= 0) {
    return { success: true, amountCents: 0, description: 'Zero payout — no fee' };
  }

  // PLATFORM WORKSPACE GUARD: never charge internal/system workspaces
  if (isBillingExcluded(workspaceId)) {
    log.info(`[PayoutFee] Platform workspace excluded — skipping payout fee for workspace ${workspaceId}`);
    return { success: true, amountCents: 0, description: 'Platform workspace — payout fee excluded' };
  }

  const workspace = await getWorkspaceBillingInfo(workspaceId);
  if (!workspace) {
    return { success: false, amountCents: 0, description: 'Workspace not found', error: 'workspace_not_found' };
  }

  // FOUNDER EXEMPTION: skip all Stripe charges for billing-exempt workspaces
  if (isBillingExemptByRecord(workspace)) {
    log.info(`[PayoutFee] Founder exemption — skipping payout fee for workspace ${workspaceId}`);
    await logExemptedAction({ workspaceId, action: 'chargePayoutMiddlewareFee', skippedAmount: payoutAmountCents, skippedAmountUnit: 'cents' });
    return { success: true, amountCents: 0, description: 'Founder exemption — payout fee skipped' };
  }

  const tier = (workspace.subscriptionTier || 'free') as TierKey;

  if (tier === 'free') {
    return { success: true, amountCents: 0, description: 'Free tier — no payout fee' };
  }

  const fees = getMiddlewareFees(tier);
  const totalCents = Math.max(1, Math.round(payoutAmountCents * (fees.stripePayouts.ratePercent / 100)));

  const customerId = await ensureStripeCustomer(workspaceId, workspace.name || 'Workspace');
  if (!customerId) {
    return {
      success: false,
      amountCents: totalCents,
      description: `Payout fee: ${fees.stripePayouts.ratePercent}% of $${(payoutAmountCents / 100).toFixed(2)} = $${(totalCents / 100).toFixed(2)}`,
      error: 'no_stripe_customer',
    };
  }

  try {
    const desc = recipientName
      ? `Direct deposit to ${recipientName} — ${fees.stripePayouts.ratePercent}% processing on $${(payoutAmountCents / 100).toFixed(2)}`
      : `Direct deposit — ${fees.stripePayouts.ratePercent}% processing on $${(payoutAmountCents / 100).toFixed(2)}`;

    const idempotencyKey = `payout_${workspaceId}_${payoutId}`;
    const invoiceItem = await stripe.invoiceItems.create({
      customer: customerId,
      amount: totalCents,
      currency: 'usd',
      description: `${desc}${fees.tierDiscount > 0 ? ` [${fees.tierDiscount}% ${tier} discount]` : ''}`,
      metadata: {
        type: 'middleware_payout',
        workspaceId,
        payoutId,
        payoutAmountCents: String(payoutAmountCents),
        tier,
        discount: String(fees.tierDiscount),
      },
    }, { idempotencyKey });

    log.info(`[PayoutFee] Charged $${(totalCents / 100).toFixed(2)} for payout — workspace ${workspaceId}`);

    return {
      success: true,
      amountCents: totalCents,
      stripeInvoiceItemId: invoiceItem.id,
      description: desc,
    };
  } catch (err: any) {
    log.error(`[PayoutFee] Stripe charge failed: ${(err instanceof Error ? err.message : String(err))}`);
    return {
      success: false,
      amountCents: totalCents,
      description: `Payout fee: $${(totalCents / 100).toFixed(2)}`,
      error: (err instanceof Error ? err.message : String(err)),
    };
  }
}

/**
 * Charge AI credit overage via Stripe and reset the negative credit balance.
 * Called at the end of each weekly billing run for soft-cap tiers (pro/enterprise).
 * 
 * Rate: $0.01 per credit used beyond the monthly allocation.
 * After charging, the credit balance is zeroed out so the next period starts clean.
 */
export async function chargeAiCreditOverageFee(params: {
  workspaceId: string;
  overageCredits: number;
  overageAmountCents: number;
  /** Weekly billing run's idempotency key — passed from weeklyBillingRunService to ensure
   *  exactly one Stripe charge per workspace per calendar week, matching the billing cadence. */
  weekKey?: string;
}): Promise<MiddlewareFeeResult> {
  const { workspaceId, overageCredits, overageAmountCents, weekKey } = params;

  if (overageCredits <= 0 || overageAmountCents <= 0) {
    return { success: true, amountCents: 0, description: 'No credit overage — nothing to charge' };
  }

  // PLATFORM WORKSPACE GUARD: never charge internal/system workspaces
  if (isBillingExcluded(workspaceId)) {
    log.info(`[CreditOverage] Platform workspace excluded — skipping credit overage fee for workspace ${workspaceId}`);
    return { success: true, amountCents: 0, description: 'Platform workspace — credit overage excluded' };
  }

  const workspace = await getWorkspaceBillingInfo(workspaceId);
  if (!workspace) {
    return { success: false, amountCents: 0, description: 'Workspace not found', error: 'workspace_not_found' };
  }

  // FOUNDER EXEMPTION: skip all Stripe charges for billing-exempt workspaces
  if (isBillingExemptByRecord(workspace)) {
    log.info(`[CreditOverage] Founder exemption — skipping credit overage fee for workspace ${workspaceId}`);
    await logExemptedAction({ workspaceId, action: 'chargeAiCreditOverageFee', skippedAmount: overageAmountCents, skippedAmountUnit: 'cents', metadata: { overageCredits } });
    return { success: true, amountCents: 0, description: 'Founder exemption — credit overage fee skipped' };
  }

  const tier = (workspace.subscriptionTier || 'free') as TierKey;
  const customerId = await ensureStripeCustomer(workspaceId, workspace.name || 'Workspace');
  if (!customerId) {
    log.warn(`[CreditOverage] No Stripe customer for workspace ${workspaceId} — overage not charged`);
    return {
      success: false,
      amountCents: overageAmountCents,
      description: `Credit overage: ${overageCredits} credits × $0.01 = $${(overageAmountCents / 100).toFixed(2)}`,
      error: 'no_stripe_customer',
    };
  }

  // WEEKLY idempotency — one charge per workspace per billing week (not per month).
  // Bug fix: the old monthly key (getMonth() 0-indexed) caused weeks 2–4 to silently hit
  // Stripe's cached response while still resetting the credit balance to 0, creating a
  // revenue leak of up to 3 weeks of overage charges per month.
  // Now uses the billing run's weekKey if provided (preferred), otherwise derives it locally.
  const now = new Date();
  let resolvedWeekKey: string;
  if (weekKey) {
    resolvedWeekKey = weekKey;
  } else {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    resolvedWeekKey = weekStart.toISOString().split('T')[0]; // e.g. '2026-03-08'
  }
  const idempotencyKey = `credit_overage_${workspaceId}_${resolvedWeekKey}`;

  try {
    const description = `AI credit overage — ${overageCredits.toLocaleString()} credits × $0.01 (${tier} soft-cap, week ${resolvedWeekKey})`;
    const invoiceItem = await stripe.invoiceItems.create({
      customer: customerId,
      amount: overageAmountCents,
      currency: 'usd',
      description,
      metadata: {
        type: 'credit_overage',
        workspaceId,
        tier,
        overageCredits: String(overageCredits),
        ratePerCredit: '0.01',
        weekKey: resolvedWeekKey,
      },
    }, { idempotencyKey });

    log.info(`[CreditOverage] Charged $${(overageAmountCents / 100).toFixed(2)} for ${overageCredits} overage credits — workspace ${workspaceId} (Stripe item: ${invoiceItem.id}, week: ${resolvedWeekKey})`);

    // workspace_credits / credit_transactions dropped (Phase 16) — no balance reset needed
    return {
      success: true,
      amountCents: overageAmountCents,
      stripeInvoiceItemId: invoiceItem.id,
      description,
    };
  } catch (err: any) {
    log.error(`[CreditOverage] Stripe charge failed for workspace ${workspaceId}: ${(err instanceof Error ? err.message : String(err))}`);
    return {
      success: false,
      amountCents: overageAmountCents,
      description: `Credit overage: ${overageCredits} credits = $${(overageAmountCents / 100).toFixed(2)}`,
      error: (err instanceof Error ? err.message : String(err)),
    };
  }
}

/**
 * Get a summary of middleware fees for display in the UI.
 * Shows what the workspace will be charged for payroll/invoicing.
 */
export function getMiddlewareFeePreview(
  tier: TierKey,
  employeeCount: number,
  invoiceAmountCents: number,
  paymentMethod: 'card' | 'ach' | 'manual' = 'card',
) {
  const fees = getMiddlewareFees(tier);

  const payrollFeeCents = fees.payrollMiddleware.perEmployeeCents * employeeCount;

  let invoiceFeeCents: number;
  if (paymentMethod === 'ach') {
    invoiceFeeCents = Math.min(
      Math.round(invoiceAmountCents * (fees.achPayments.ratePercent / 100)),
      fees.achPayments.capCents,
    );
  } else if (paymentMethod === 'manual') {
    invoiceFeeCents = 0;
  } else {
    invoiceFeeCents = Math.round(invoiceAmountCents * (fees.invoiceProcessing.ratePercent / 100)) + fees.invoiceProcessing.flatFeeCents;
  }

  return {
    payroll: {
      perEmployeeCents: fees.payrollMiddleware.perEmployeeCents,
      employeeCount,
      totalCents: payrollFeeCents,
      formatted: `$${(payrollFeeCents / 100).toFixed(2)}`,
    },
    invoice: {
      method: paymentMethod,
      invoiceAmountCents,
      feeCents: invoiceFeeCents,
      formatted: `$${(invoiceFeeCents / 100).toFixed(2)}`,
    },
    tierDiscount: fees.tierDiscount,
    tier,
  };
}

/**
 * Charge seat overage fees via Stripe.
 * Bills for active employees above the tier's included limit.
 * 
 * Rates (from billingConfig):
 *   Starter:     $10/employee above 15
 *   Professional: $8/employee above 50
 *   Enterprise:  $15/employee (all employees — per-seat model)
 *   Free:         hard cap, no overage
 */
export async function chargeSeatOverageFee(params: {
  workspaceId: string;
}): Promise<MiddlewareFeeResult> {
  const { workspaceId } = params;

  // PLATFORM WORKSPACE GUARD: never charge internal/system workspaces
  if (isBillingExcluded(workspaceId)) {
    log.info(`[SeatOverage] Platform workspace excluded — skipping seat overage fee for workspace ${workspaceId}`);
    return { success: true, amountCents: 0, description: 'Platform workspace — seat overage excluded' };
  }

  const workspace = await getWorkspaceBillingInfo(workspaceId);
  if (!workspace) {
    return { success: false, amountCents: 0, description: 'Workspace not found', error: 'workspace_not_found' };
  }

  // FOUNDER EXEMPTION: skip all Stripe charges for billing-exempt workspaces
  if (isBillingExemptByRecord(workspace)) {
    log.info(`[SeatOverage] Founder exemption — skipping seat overage fee for workspace ${workspaceId}`);
    await logExemptedAction({ workspaceId, action: 'chargeSeatOverageFee', skippedAmountUnit: 'cents' });
    return { success: true, amountCents: 0, description: 'Founder exemption — seat overage fee skipped' };
  }

  const tier = (workspace.subscriptionTier || 'free') as TierKey;

  if (tier === 'free') {
    return { success: true, amountCents: 0, description: 'Free tier — no overage billing' };
  }

  const { BILLING } = await import('@shared/billingConfig');
  const { employees: empTable } = await import('@shared/schema');
  const { eq: eqOp, and: andOp, sql: sqlHelper } = await import('drizzle-orm');

  const [countResult] = await db.select({ count: sqlHelper<number>`count(*)::int` })
    .from(empTable)
    .where(andOp(
      eqOp(empTable.workspaceId, workspaceId),
      eqOp(empTable.isActive, true)
    ));

  const activeCount = countResult?.count || 0;
  const tierConfig = BILLING.tiers[tier];
  const maxIncluded = tierConfig.maxEmployees;
  const overageRate = BILLING.overages[tier as keyof typeof BILLING.overages] || 0;

  if (typeof overageRate !== 'number' || overageRate <= 0) {
    return { success: true, amountCents: 0, description: 'No overage rate configured for tier' };
  }

  let overageCount: number;
  let totalCents: number;

  if (tier === 'enterprise') {
    // Enterprise charges per-seat for ALL employees
    overageCount = activeCount;
    totalCents = activeCount * overageRate;
  } else {
    overageCount = Math.max(0, activeCount - maxIncluded);
    totalCents = overageCount * overageRate;
  }

  if (totalCents <= 0) {
    return { success: true, amountCents: 0, description: `${activeCount} employees within ${maxIncluded} limit — no overage` };
  }

  const customerId = await ensureStripeCustomer(workspaceId, workspace.name || 'Workspace');
  if (!customerId) {
    log.warn(`[SeatOverage] No Stripe customer for workspace ${workspaceId} — overage recorded but not charged`);
    return {
      success: false,
      amountCents: totalCents,
      description: `Seat overage: ${overageCount} employees × $${(overageRate / 100).toFixed(2)} = $${(totalCents / 100).toFixed(2)}`,
      error: 'no_stripe_customer',
    };
  }

  try {
    const description = tier === 'enterprise'
      ? `Employee seats — ${activeCount} employees × $${(overageRate / 100).toFixed(2)}/ea (${tier} per-seat)`
      : `Employee overage — ${overageCount} employees above ${maxIncluded} limit × $${(overageRate / 100).toFixed(2)}/ea (${tier})`;

    const now = new Date();
    // Enterprise is a monthly per-seat model; use monthly dedup to prevent 4-5× charges
    // per month from weekly billing runs. Non-enterprise can still charge weekly (per overage).
    // Bug fix: getMonth() returns 0-indexed months (Jan=0, Dec=11). Use getMonth()+1 for
    // correct 1-indexed month values ('01'–'12') in the idempotency key.
    const monthStr = String(now.getMonth() + 1).padStart(2, '0');
    const idempotencyKey = tier === 'enterprise'
      ? `seat_overage_${workspaceId}_${now.getFullYear()}_${monthStr}`
      : `seat_overage_${workspaceId}_${now.getFullYear()}_${monthStr}_W${Math.ceil(now.getDate() / 7)}`;
    const invoiceItem = await stripe.invoiceItems.create({
      customer: customerId,
      amount: totalCents,
      currency: 'usd',
      description,
      metadata: {
        type: 'seat_overage',
        workspaceId,
        tier,
        activeEmployees: String(activeCount),
        includedLimit: String(maxIncluded),
        overageCount: String(overageCount),
        perSeatCents: String(overageRate),
      },
    }, { idempotencyKey });

    log.info(`[SeatOverage] Charged $${(totalCents / 100).toFixed(2)} for ${overageCount} overage seats — workspace ${workspaceId} (Stripe item: ${invoiceItem.id})`);

    return {
      success: true,
      amountCents: totalCents,
      stripeInvoiceItemId: invoiceItem.id,
      description,
    };
  } catch (err: any) {
    log.error(`[SeatOverage] Stripe charge failed for workspace ${workspaceId}: ${(err instanceof Error ? err.message : String(err))}`);
    return {
      success: false,
      amountCents: totalCents,
      description: `Seat overage calculation: $${(totalCents / 100).toFixed(2)}`,
      error: (err instanceof Error ? err.message : String(err)),
    };
  }
}

/**
 * Charge storage overage fees via Stripe.
 * Bills for GCS usage above the workspace's tier storage limits.
 *
 * Rate: $0.10/GB across all tiers (BILLING.storageQuotas.overageRatePerGB = 10 cents)
 * Noise floor: only billed when > 1 GB over (BILLING.storageQuotas.overageMinChargeGB)
 * Idempotency key: monthly — prevents double-billing across weekly runs.
 */
export async function chargeStorageOverageFee(params: {
  workspaceId: string;
}): Promise<MiddlewareFeeResult> {
  const { workspaceId } = params;

  if (isBillingExcluded(workspaceId)) {
    return { success: true, amountCents: 0, description: 'Platform workspace — storage overage excluded' };
  }

  const workspace = await getWorkspaceBillingInfo(workspaceId);
  if (!workspace) {
    return { success: false, amountCents: 0, description: 'Workspace not found', error: 'workspace_not_found' };
  }

  if (isBillingExemptByRecord(workspace)) {
    await logExemptedAction({ workspaceId, action: 'chargeStorageOverageFee', skippedAmountUnit: 'cents' });
    return { success: true, amountCents: 0, description: 'Founder exemption — storage overage skipped' };
  }

  const { BILLING } = await import('@shared/billingConfig');
  const { calculateStorageOverage } = await import('../storage/storageQuotaService');

  const overage = await calculateStorageOverage(workspaceId);

  const minChargeGB: number = BILLING.storageQuotas.overageMinChargeGB as unknown as number ?? 1;
  if (overage.overageGB < minChargeGB) {
    return {
      success: true,
      amountCents: 0,
      description: `Storage overage ${overage.overageGB.toFixed(2)} GB — below ${minChargeGB} GB noise floor, no charge`,
    };
  }

  const ratePerGB: number = BILLING.storageQuotas.overageRatePerGB as unknown as number ?? 10;
  const totalCents = Math.round(overage.overageGB * ratePerGB);

  if (totalCents <= 0) {
    return { success: true, amountCents: 0, description: 'No storage overage to bill' };
  }

  const customerId = await ensureStripeCustomer(workspaceId, workspace.name || 'Workspace');
  if (!customerId) {
    log.warn(`[StorageOverage] No Stripe customer for workspace ${workspaceId} — overage calculated but not charged`);
    return {
      success: false,
      amountCents: totalCents,
      description: `Storage overage: ${overage.overageGB.toFixed(2)} GB × $${(ratePerGB / 100).toFixed(2)}/GB = $${(totalCents / 100).toFixed(2)}`,
      error: 'no_stripe_customer',
    };
  }

  const breakdownStr = Object.entries(overage.breakdownGB)
    .filter(([, gb]) => gb > 0)
    .map(([cat, gb]) => `${cat}: ${gb.toFixed(2)} GB`)
    .join(', ');
  const description = `Storage overage — ${overage.overageGB.toFixed(2)} GB over limit × $${(ratePerGB / 100).toFixed(2)}/GB = $${(totalCents / 100).toFixed(2)} (${breakdownStr})`;

  try {
    const now = new Date();
    const monthStr = String(now.getMonth() + 1).padStart(2, '0');
    const idempotencyKey = `storage_overage_${workspaceId}_${now.getFullYear()}_${monthStr}`;

    const invoiceItem = await stripe.invoiceItems.create({
      customer: customerId,
      amount: totalCents,
      currency: 'usd',
      description,
      metadata: {
        type: 'storage_overage',
        workspaceId,
        overageGB: String(overage.overageGB),
        ratePerGB: String(ratePerGB),
        breakdown: JSON.stringify(overage.breakdownGB),
      },
    }, { idempotencyKey });

    log.info(`[StorageOverage] Charged $${(totalCents / 100).toFixed(2)} for ${overage.overageGB.toFixed(2)} GB — workspace ${workspaceId} (Stripe item: ${invoiceItem.id})`);

    return {
      success: true,
      amountCents: totalCents,
      stripeInvoiceItemId: invoiceItem.id,
      description,
    };
  } catch (err: any) {
    log.error(`[StorageOverage] Stripe charge failed for workspace ${workspaceId}: ${err?.message}`);
    return {
      success: false,
      amountCents: totalCents,
      description,
      error: err?.message ?? 'stripe_error',
    };
  }
}
