/**
 * Invoice Adjustment Service - Billing Dispute Resolution
 * Handles invoice modifications, credits, refunds, and adjustments
 *
 * GAP-7: creditInvoice / discountInvoice now write ledger entries (entryType: 'adjustment') and
 *         publish platform events so Trinity and QB sync pipelines are notified.
 * GAP-8: refundInvoice now calls stripe.refunds.create() when a paymentIntentId is on record,
 *         writes a ledger debit entry (entryType: 'refund'), and publishes a platform event.
 *         Without this fix, "refunds" only modified the DB — money never left Stripe.
 */

import { db } from "../db";
import {
  invoices,
  invoiceLineItems,
  invoiceAdjustments,
} from '@shared/schema';
import { eq, desc } from "drizzle-orm";
import type { Invoice } from "@shared/schema";
import { writeLedgerEntry } from './orgLedgerService';
import { platformEventBus } from './platformEventBus';
// RC4 (Phase 2): All stored financial arithmetic uses Decimal.js to prevent floating-point drift.
import {
  toFinancialString,
  subtractFinancialValues,
  addFinancialValues,
  multiplyFinancialValues,
  divideFinancialValues,
  formatCurrency,
} from './financialCalculator';
import { createLogger } from '../lib/logger';
const log = createLogger('invoiceAdjustmentService');


export interface InvoiceAdjustment {
  type: "credit" | "discount" | "refund" | "correction";
  amount: number;
  description: string;
  adjustedBy: string; // user ID
}

export interface AdjustmentResult {
  success: boolean;
  previousTotal: number;
  newTotal: number;
  adjustmentAmount: number;
  invoice: Invoice;
  errors?: string[];
  stripeRefundId?: string;
}

/**
 * Apply a credit to an invoice
 * GAP-7: Ledger entry + platform event now fire so QB/Trinity stay in sync.
 */
export async function creditInvoice(
  invoiceId: string,
  amount: number,
  description: string,
  adjustedBy: string
): Promise<AdjustmentResult> {
  const errors: string[] = [];

  // Get invoice
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
  });

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  if (invoice.status === "paid") {
    errors.push("Cannot adjust paid invoices - process as refund instead");
  }

  // RC4: Decimal.js for stored credit arithmetic.
  const invoiceTotalStr = toFinancialString(String(invoice.total || 0));
  const invoiceTotal = parseFloat(invoiceTotalStr);
  if (amount > invoiceTotal) {
    errors.push(`Credit amount (${amount}) exceeds invoice total (${invoiceTotal})`);
  }

  if (errors.length > 0) {
    return {
      success: false,
      previousTotal: invoiceTotal,
      newTotal: invoiceTotal,
      adjustmentAmount: 0,
      invoice,
      errors,
    };
  }

  const newTotalStr = subtractFinancialValues(invoiceTotalStr, toFinancialString(String(amount)));
  const newTotal = parseFloat(newTotalStr);

  // Atomically update invoice + insert adjustment record
  const [updated] = await db.transaction(async (tx) => {
    const [inv] = await tx
      .update(invoices)
      .set({
        total: newTotalStr,
        notes: `${invoice.notes || ""}\n[CREDIT] ${description} (${formatCurrency(toFinancialString(String(-amount)))}) by ${adjustedBy} at ${new Date().toISOString()}`,
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    await tx.insert(invoiceAdjustments).values({
      invoiceId,
      workspaceId: invoice.workspaceId,
      adjustmentType: 'credit',
      description,
      amount: String(-amount), // Negative for credit
      reason: description,
      createdBy: adjustedBy,
      approvedBy: adjustedBy,
      approvedAt: new Date(),
      status: 'applied',
    });

    return [inv];
  });

  // GAP-7 FIX: Write ledger entry so the AR reduction is reflected in the org ledger.
  // Without this, the P&L and ledger audit trail show full revenue even after credits.
  try {
    await writeLedgerEntry({
      workspaceId: invoice.workspaceId,
      entryType: 'adjustment',
      // GAP-25 FIX: creditInvoice REDUCES AR (balance must go down) → direction: 'credit'.
      // Previous 'debit' incorrectly INCREASED balance on every credit applied to an invoice.
      direction: 'credit',
      amount,
      relatedEntityType: 'invoice',
      relatedEntityId: invoiceId,
      invoiceId,
      description: `Credit applied to ${invoice.invoiceNumber || invoiceId}: ${description} — -$${amount.toFixed(2)}`,
      metadata: { adjustmentType: 'credit', adjustedBy, source: 'invoiceAdjustmentService' },
    });
  } catch (ledgerErr: any) {
    log.error(`[INVOICE ADJUSTMENT] Ledger write failed for credit on ${invoiceId}:`, ledgerErr.message);
  }

  // GAP-7 FIX: Publish platform event so Trinity and QB sync pipelines are notified.
  try {
    await platformEventBus.publish({
      type: 'billing_adjustment_applied',
      category: 'billing',
      workspaceId: invoice.workspaceId,
      title: 'Invoice Credit Applied',
      description: `Credit of $${amount.toFixed(2)} applied to invoice ${invoice.invoiceNumber || invoiceId}: ${description}`,
      payload: { invoiceId, adjustmentType: 'credit', amount, adjustedBy },
      metadata: { source: 'invoiceAdjustmentService' },
    });
  } catch (eventErr: any) {
    log.warn(`[INVOICE ADJUSTMENT] Platform event failed for credit on ${invoiceId}:`, eventErr.message);
  }

  log.info(`[INVOICE ADJUSTMENT] Credit applied: ${invoiceId} -$${amount.toFixed(2)} by ${adjustedBy}`);

  return {
    success: true,
    // @ts-expect-error — TS migration: fix in refactoring sprint
    previousTotal: invoice.total,
    newTotal,
    adjustmentAmount: -amount,
    invoice: updated[0],
  };
}

/**
 * Apply a discount to an invoice before payment
 * GAP-7: Ledger entry + platform event now fire so QB/Trinity stay in sync.
 */
export async function discountInvoice(
  invoiceId: string,
  discountPercent: number,
  reason: string,
  approvedBy: string
): Promise<AdjustmentResult> {
  if (discountPercent < 0 || discountPercent > 100) {
    throw new Error("Discount percent must be between 0-100");
  }

  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
  });

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  if (invoice.status === "paid") {
    throw new Error("Cannot discount paid invoices");
  }

  // RC4: Decimal.js for stored discount arithmetic.
  const invoiceTotalStr = toFinancialString(String(invoice.total || 0));
  const invoiceTotal = parseFloat(invoiceTotalStr);
  const discountAmountStr = divideFinancialValues(
    multiplyFinancialValues(invoiceTotalStr, toFinancialString(String(discountPercent))),
    '100'
  );
  const discountAmount = parseFloat(discountAmountStr);
  const newTotalStr = subtractFinancialValues(invoiceTotalStr, discountAmountStr);
  const newTotal = parseFloat(newTotalStr);

  // Atomically update invoice + insert adjustment record
  const [updated] = await db.transaction(async (tx) => {
    const [inv] = await tx
      .update(invoices)
      .set({
        total: newTotalStr,
        notes: `${invoice.notes || ""}\n[DISCOUNT] ${discountPercent}% discount (${reason}) approved by ${approvedBy}`,
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    await tx.insert(invoiceAdjustments).values({
      invoiceId,
      workspaceId: invoice.workspaceId,
      adjustmentType: 'discount',
      description: `${discountPercent}% discount: ${reason}`,
      amount: String(-discountAmount), // Negative for discount
      reason,
      createdBy: approvedBy,
      approvedBy,
      approvedAt: new Date(),
      status: 'applied',
    });

    return [inv];
  });

  // GAP-7 FIX: Write ledger entry so the AR reduction is reflected in the org ledger.
  try {
    await writeLedgerEntry({
      workspaceId: invoice.workspaceId,
      entryType: 'adjustment',
      // GAP-25 FIX: discountInvoice REDUCES AR (balance must go down) → direction: 'credit'.
      // Previous 'debit' incorrectly INCREASED balance on every discount applied to an invoice.
      direction: 'credit',
      amount: discountAmount,
      relatedEntityType: 'invoice',
      relatedEntityId: invoiceId,
      invoiceId,
      description: `Discount of ${discountPercent}% applied to ${invoice.invoiceNumber || invoiceId}: ${reason} — -$${discountAmount.toFixed(2)}`,
      metadata: { adjustmentType: 'discount', discountPercent, approvedBy, source: 'invoiceAdjustmentService' },
    });
  } catch (ledgerErr: any) {
    log.error(`[INVOICE ADJUSTMENT] Ledger write failed for discount on ${invoiceId}:`, ledgerErr.message);
  }

  // GAP-7 FIX: Publish platform event so Trinity and QB sync pipelines are notified.
  try {
    await platformEventBus.publish({
      type: 'billing_adjustment_applied',
      category: 'billing',
      workspaceId: invoice.workspaceId,
      title: 'Invoice Discount Applied',
      description: `Discount of ${discountPercent}% ($${discountAmount.toFixed(2)}) applied to invoice ${invoice.invoiceNumber || invoiceId}: ${reason}`,
      payload: { invoiceId, adjustmentType: 'discount', discountPercent, discountAmount, approvedBy },
      metadata: { source: 'invoiceAdjustmentService' },
    });
  } catch (eventErr: any) {
    log.warn(`[INVOICE ADJUSTMENT] Platform event failed for discount on ${invoiceId}:`, eventErr.message);
  }

  return {
    success: true,
    // @ts-expect-error — TS migration: fix in refactoring sprint
    previousTotal: invoice.total,
    newTotal,
    adjustmentAmount: -discountAmount,
    invoice: updated[0],
  };
}

/**
 * Process a refund for a paid invoice
 * GAP-8: Now calls stripe.refunds.create() when a paymentIntentId is recorded (money actually
 *        returns to the payer's card), writes a ledger debit entry, and publishes a platform event.
 */
export async function refundInvoice(
  invoiceId: string,
  refundAmount: number,
  reason: string,
  processedBy: string
): Promise<AdjustmentResult> {
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
  });

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  if (invoice.status !== "paid") {
    throw new Error("Can only refund paid invoices");
  }

  // RC4: Decimal.js for stored refund arithmetic.
  const invoiceTotalStr = toFinancialString(String(invoice.total || 0));
  const invoiceTotal = parseFloat(invoiceTotalStr);
  if (refundAmount > invoiceTotal) {
    throw new Error(
      `Refund amount (${refundAmount}) cannot exceed invoice total (${invoiceTotal})`
    );
  }

  const refundAmountStr = toFinancialString(String(refundAmount));
  const newTotalStr = subtractFinancialValues(invoiceTotalStr, refundAmountStr);
  const newTotal = parseFloat(newTotalStr);
  const newStatus = newTotal === 0 ? "refunded" : "partial";

  // GAP-8 FIX: Issue the actual Stripe refund before modifying our DB.
  // Previously this function only updated the database — money never left Stripe.
  let stripeRefundId: string | undefined;
  const stripePaymentIntentId: string | null = (invoice as any).paymentIntentId || null;
  if (stripePaymentIntentId) {
    try {
      // Use canonical lazy Stripe factory (TRINITY.md §F).
      const { getStripe: getLazyStripe, isStripeConfigured: isConfigured } = await import('./billing/stripeClient');
      const stripe = isConfigured() ? getLazyStripe() : null;

      if (stripe) {
        const stripeRefund = await stripe.refunds.create({
          payment_intent: stripePaymentIntentId,
          amount: Math.round(refundAmount * 100), // cents
          reason: 'requested_by_customer',
          metadata: {
            invoiceId,
            workspaceId: invoice.workspaceId,
            processedBy,
            reason,
          },
        });
        stripeRefundId = stripeRefund.id;
        log.info(`[INVOICE ADJUSTMENT] Stripe refund issued: ${stripeRefund.id} — $${refundAmount.toFixed(2)} for invoice ${invoiceId}`);
      }
    } catch (stripeErr: any) {
      // Stripe refund failure is critical — block the operation so the DB isn't updated
      // while the money isn't actually returned. Operator must resolve in Stripe dashboard.
      throw new Error(`Stripe refund failed for invoice ${invoiceId}: ${stripeErr.message}. DB not modified — no money was returned yet.`);
    }
  }

  // Atomically update invoice + insert adjustment record
  // Stripe refund (external call) is intentionally outside this transaction —
  // external side effects cannot be rolled back. If the Stripe call succeeds
  // but the DB write fails, the stripeRefundId is logged and the operator can
  // reconcile. This is the industry-standard pattern for Stripe + DB ordering.
  const [updated] = await db.transaction(async (tx) => {
    const [inv] = await tx
      .update(invoices)
      .set({
        status: newStatus as any,
        total: newTotalStr,
        notes: `${invoice.notes || ""}\n[REFUND] ${formatCurrency(refundAmountStr)} refunded (${reason}) by ${processedBy}${stripeRefundId ? ` — Stripe refund ${stripeRefundId}` : ' — manual/offline refund (no Stripe PI recorded)'}`,
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    await tx.insert(invoiceAdjustments).values({
      invoiceId,
      workspaceId: invoice.workspaceId,
      adjustmentType: 'refund',
      description: `Refund: ${reason}`,
      amount: String(-refundAmount), // Negative for refund
      reason,
      createdBy: processedBy,
      approvedBy: processedBy,
      approvedAt: new Date(),
      status: 'applied',
    });

    return [inv];
  });

  // GAP-11 FIX: Only write the ledger entry here for offline/manual refunds (no Stripe PI).
  // When a Stripe PI is present, stripe.refunds.create() above triggers a `charge.refunded`
  // Stripe webhook which is the authoritative writer of the refund/debit ledger entry via
  // handleChargeRefunded() in stripeWebhooks.ts. Writing it here too would produce a double
  // debit, doubling the revenue reversal on the org P&L.
  if (!stripePaymentIntentId) {
    try {
      await writeLedgerEntry({
        workspaceId: invoice.workspaceId,
        entryType: 'refund',
        // GAP-25b FIX: Offline refund sends cash OUT → balance must go down → direction: 'credit'.
        // Previous 'debit' incorrectly INCREASED balance for every manual/offline refund issued.
        direction: 'credit',
        amount: refundAmount,
        referenceNumber: stripeRefundId,
        relatedEntityType: 'invoice',
        relatedEntityId: invoiceId,
        invoiceId,
        description: `Refund of $${refundAmount.toFixed(2)} for ${invoice.invoiceNumber || invoiceId}: ${reason} (offline/manual — no Stripe PI)`,
        metadata: { adjustmentType: 'refund', processedBy, stripeRefundId, stripePaymentIntentId, source: 'invoiceAdjustmentService_offline' },
      });
    } catch (ledgerErr: any) {
      log.error(`[INVOICE ADJUSTMENT] Ledger write failed for offline refund on ${invoiceId}:`, ledgerErr.message);
    }
  }
  // For Stripe-backed refunds: the charge.refunded webhook writes the ledger entry via
  // handleChargeRefunded(). No action needed here — avoids double-debit on the P&L.

  // GAP-8 FIX: Publish platform event so Trinity QB sync and dashboard subscribers are notified.
  try {
    await platformEventBus.publish({
      type: newStatus === 'refunded' ? 'invoice_voided' : 'billing_adjustment_applied',
      category: 'billing',
      workspaceId: invoice.workspaceId,
      title: newStatus === 'refunded' ? 'Invoice Fully Refunded' : 'Invoice Partially Refunded',
      description: `Refund of $${refundAmount.toFixed(2)} issued for invoice ${invoice.invoiceNumber || invoiceId}: ${reason}`,
      payload: { invoiceId, adjustmentType: 'refund', refundAmount, newStatus, stripeRefundId, processedBy },
      metadata: { source: 'invoiceAdjustmentService' },
    });
  } catch (eventErr: any) {
    log.warn(`[INVOICE ADJUSTMENT] Platform event failed for refund on ${invoiceId}:`, eventErr.message);
  }

  log.info(`[INVOICE ADJUSTMENT] Refund processed: ${invoiceId} -$${refundAmount.toFixed(2)} by ${processedBy}${stripeRefundId ? ` (Stripe refund ${stripeRefundId})` : ''}`);

  return {
    success: true,
    // @ts-expect-error — TS migration: fix in refactoring sprint
    previousTotal: invoice.total,
    newTotal,
    adjustmentAmount: -refundAmount,
    invoice: updated[0],
    stripeRefundId,
  };
}

/**
 * Correct invoice line items (e.g., wrong quantity, rate, etc.)
 */
export async function correctInvoiceLineItem(
  invoiceId: string,
  lineItemIndex: number,
  newQuantity?: number,
  newUnitPrice?: number,
  reason?: string,
  approvedBy?: string
): Promise<AdjustmentResult> {
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
  });

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  if (invoice.status === "paid") {
    throw new Error("Cannot modify paid invoices - process as credit instead");
  }

  // Get line items
  const lineItems = await db.query.invoiceLineItems.findMany({
    where: eq(invoiceLineItems.invoiceId, invoiceId),
  });

  if (lineItemIndex >= lineItems.length) {
    throw new Error("Line item index out of range");
  }

  // RC4: Decimal.js for stored line item correction arithmetic.
  const item = lineItems[lineItemIndex];
  const oldQuantityStr = toFinancialString(String(item.quantity || 0));
  const oldUnitPriceStr = toFinancialString(String(item.unitPrice || 0));
  const oldAmountStr = multiplyFinancialValues(oldQuantityStr, oldUnitPriceStr);

  const newItemQuantity = newQuantity ?? parseFloat(oldQuantityStr);
  const newItemUnitPrice = newUnitPrice ?? parseFloat(oldUnitPriceStr);
  const newItemQuantityStr = toFinancialString(String(newItemQuantity));
  const newItemUnitPriceStr = toFinancialString(String(newItemUnitPrice));
  const newAmountStr = multiplyFinancialValues(newItemQuantityStr, newItemUnitPriceStr);
  const newAmount = parseFloat(newAmountStr);
  const differenceStr = subtractFinancialValues(newAmountStr, oldAmountStr);
  const difference = parseFloat(differenceStr);

  // Atomically update line item + invoice total + insert adjustment record
  const invoiceTotalStr = toFinancialString(String(invoice.total || 0));
  const invoiceTotal = parseFloat(invoiceTotalStr);
  const newTotalStr = addFinancialValues(invoiceTotalStr, differenceStr);
  const newTotal = parseFloat(newTotalStr);

  const [updated] = await db.transaction(async (tx) => {
    await tx
      .update(invoiceLineItems)
      .set({
        quantity: newItemQuantityStr,
        unitPrice: newItemUnitPriceStr,
        amount: newAmountStr,
      })
      .where(eq(invoiceLineItems.id, item.id));

    const [inv] = await tx
      .update(invoices)
      .set({
        total: newTotalStr,
        notes: `${invoice.notes || ""}\n[CORRECTION] Line item adjusted: ${reason || "Manual correction"} by ${approvedBy}`,
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    await tx.insert(invoiceAdjustments).values({
      invoiceId,
      workspaceId: invoice.workspaceId,
      adjustmentType: 'correction',
      description: reason || 'Line item correction',
      amount: String(difference), // Can be positive or negative
      reason: reason || 'Manual correction',
      createdBy: approvedBy || 'system',
      approvedBy: approvedBy || 'system',
      approvedAt: new Date(),
      status: 'applied',
    });

    return [inv];
  });

  return {
    success: true,
    previousTotal: invoiceTotal,
    newTotal,
    adjustmentAmount: difference,
    invoice: updated[0],
  };
}

/**
 * Get adjustment history for an invoice (UI-compatible format)
 * Returns formatted strings for backward compatibility with existing UI code
 */
export async function getInvoiceAdjustmentHistory(
  invoiceId: string
): Promise<{ adjustments: string[]; currentTotal: number }> {
  const records = await db.select()
    .from(invoiceAdjustments)
    .where(eq(invoiceAdjustments.invoiceId, invoiceId))
    .orderBy(desc(invoiceAdjustments.createdAt));
  
  const adjustments = records.map(record => {
    const amount = parseFloat(record.amount);
    const sign = amount < 0 ? '-' : '+';
    const absAmount = Math.abs(amount);
    const type = record.adjustmentType.toUpperCase();
    const date = record.createdAt?.toISOString() || '';
    const approver = record.approvedBy || 'system';
    
    return `[${type}] ${record.description} (${sign}$${absAmount.toFixed(2)}) by ${approver} at ${date}`;
  });
  
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
  });
  
  return {
    adjustments,
    currentTotal: parseFloat(String(invoice?.total || 0)),
  };
}

/**
 * Get structured adjustment records (for APIs, reports, analytics)
 * Returns raw database records for programmatic access
 */
export async function getInvoiceAdjustmentRecords(invoiceId: string) {
  return await db.select()
    .from(invoiceAdjustments)
    .where(eq(invoiceAdjustments.invoiceId, invoiceId))
    .orderBy(desc(invoiceAdjustments.createdAt));
}

/**
 * Apply bulk credits to invoices (e.g., for service issue affecting multiple invoices)
 */
export async function bulkCreditInvoices(
  workspaceId: string,
  invoiceIds: string[],
  creditPerInvoice: number,
  reason: string,
  approvedBy: string
): Promise<{ success: boolean; processedCount: number; failedCount: number }> {
  let processedCount = 0;
  let failedCount = 0;

  for (const invoiceId of invoiceIds) {
    try {
      await creditInvoice(invoiceId, creditPerInvoice, reason, approvedBy);
      processedCount++;
    } catch (error) {
      log.error(`[INVOICE ADJUSTMENT] Failed to credit invoice ${invoiceId}:`, error);
      failedCount++;
    }
  }

  log.info(`[INVOICE ADJUSTMENT] Bulk credit completed: ${processedCount} success, ${failedCount} failed`);
  
  return {
    success: failedCount === 0,
    processedCount,
    failedCount,
  };
}

/**
 * Get all adjustments for a workspace
 */
export async function getWorkspaceAdjustments(workspaceId: string) {
  return await db.select()
    .from(invoiceAdjustments)
    .where(eq(invoiceAdjustments.workspaceId, workspaceId))
    .orderBy(desc(invoiceAdjustments.createdAt));
}
