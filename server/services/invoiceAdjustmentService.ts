/**
 * Invoice Adjustment Service - Billing Dispute Resolution
 * Handles invoice modifications, credits, refunds, and adjustments
 */

import { db } from "../db";
import { invoices, invoiceLineItems, creditLedger } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import type { Invoice } from "@shared/schema";

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
}

/**
 * Apply a credit to an invoice
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

  if (amount > invoice.total) {
    errors.push(`Credit amount (${amount}) exceeds invoice total (${invoice.total})`);
  }

  if (errors.length > 0) {
    return {
      success: false,
      previousTotal: invoice.total,
      newTotal: invoice.total,
      adjustmentAmount: 0,
      invoice,
      errors,
    };
  }

  const newTotal = invoice.total - amount;

  // Update invoice
  const updated = await db
    .update(invoices)
    .set({
      total: newTotal,
      amountDue: Math.max(0, (invoice.amountDue || 0) - amount),
      notes: `${invoice.notes || ""}\n[CREDIT] ${description} (-$${amount.toFixed(2)}) by ${adjustedBy} at ${new Date().toISOString()}`,
    })
    .where(eq(invoices.id, invoiceId))
    .returning();

  // Log in credit ledger
  await db.insert(creditLedger).values({
    workspaceId: invoice.workspaceId,
    transactionId: invoiceId,
    transactionType: "invoice_credit",
    amount: amount,
    description,
    createdBy: adjustedBy,
    createdAt: new Date(),
  });

  return {
    success: true,
    previousTotal: invoice.total,
    newTotal,
    adjustmentAmount: -amount,
    invoice: updated[0],
  };
}

/**
 * Apply a discount to an invoice before payment
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

  const discountAmount = (invoice.total * discountPercent) / 100;
  const newTotal = invoice.total - discountAmount;

  const updated = await db
    .update(invoices)
    .set({
      total: newTotal,
      amountDue: Math.max(0, newTotal),
      notes: `${invoice.notes || ""}\n[DISCOUNT] ${discountPercent}% discount (${reason}) approved by ${approvedBy}`,
    })
    .where(eq(invoices.id, invoiceId))
    .returning();

  return {
    success: true,
    previousTotal: invoice.total,
    newTotal,
    adjustmentAmount: -discountAmount,
    invoice: updated[0],
  };
}

/**
 * Process a refund for a paid invoice
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

  if (refundAmount > invoice.total) {
    throw new Error(
      `Refund amount (${refundAmount}) cannot exceed invoice total (${invoice.total})`
    );
  }

  const newTotal = invoice.total - refundAmount;

  // Update invoice status to partial/refunded
  const newStatus = newTotal === 0 ? "refunded" : "partial";

  const updated = await db
    .update(invoices)
    .set({
      status: newStatus as any,
      total: newTotal,
      notes: `${invoice.notes || ""}\n[REFUND] $${refundAmount.toFixed(2)} refunded (${reason}) by ${processedBy}`,
    })
    .where(eq(invoices.id, invoiceId))
    .returning();

  // Log refund in credit ledger
  await db.insert(creditLedger).values({
    workspaceId: invoice.workspaceId,
    transactionId: invoiceId,
    transactionType: "refund",
    amount: -refundAmount,
    description: `Refund: ${reason}`,
    createdBy: processedBy,
    createdAt: new Date(),
  });

  return {
    success: true,
    previousTotal: invoice.total,
    newTotal,
    adjustmentAmount: -refundAmount,
    invoice: updated[0],
  };
}

/**
 * Correct invoice line items (e.g., wrong quantity, rate, etc.)
 */
export async function correctInvoiceLineItem(
  invoiceId: string,
  lineItemIndex: number,
  newQuantity?: number,
  newRate?: number,
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

  const item = lineItems[lineItemIndex];
  const oldAmount = (item.quantity || 0) * (item.rate || 0);
  const newItemQuantity = newQuantity ?? item.quantity;
  const newItemRate = newRate ?? item.rate;
  const newAmount = newItemQuantity * newItemRate;
  const difference = newAmount - oldAmount;

  // Update line item
  await db
    .update(invoiceLineItems)
    .set({
      quantity: newItemQuantity,
      rate: newItemRate,
    })
    .where(eq(invoiceLineItems.id, item.id));

  // Update invoice total
  const newTotal = invoice.total + difference;

  const updated = await db
    .update(invoices)
    .set({
      total: newTotal,
      amountDue: newTotal,
      notes: `${invoice.notes || ""}\n[CORRECTION] Line item adjusted: ${reason || "Manual correction"} by ${approvedBy}`,
    })
    .where(eq(invoices.id, invoiceId))
    .returning();

  return {
    success: true,
    previousTotal: invoice.total,
    newTotal,
    adjustmentAmount: difference,
    invoice: updated[0],
  };
}

/**
 * Get adjustment history for an invoice
 */
export async function getInvoiceAdjustmentHistory(
  invoiceId: string
): Promise<{ adjustments: string[]; currentTotal: number }> {
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
  });

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  const adjustments = (invoice.notes || "")
    .split("\n")
    .filter(line => line.includes("["));

  return {
    adjustments,
    currentTotal: invoice.total,
  };
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
      console.error(`Failed to credit invoice ${invoiceId}:`, error);
      failedCount++;
    }
  }

  return {
    success: failedCount === 0,
    processedCount,
    failedCount,
  };
}
