/**
 * Invoice Adjustment Service - Billing Dispute Resolution
 * Handles invoice modifications, credits, refunds, and adjustments
 */

import { db } from "../db";
import { invoices, invoiceLineItems } from "@shared/schema";
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

  const invoiceTotal = parseFloat(String(invoice.total || 0));
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

  const newTotal = invoiceTotal - amount;

  // Update invoice
  const updated = await db
    .update(invoices)
    .set({
      total: String(newTotal),
      notes: `${invoice.notes || ""}\n[CREDIT] ${description} (-$${amount.toFixed(2)}) by ${adjustedBy} at ${new Date().toISOString()}`,
    })
    .where(eq(invoices.id, invoiceId))
    .returning();

  // Log credit action
  console.log(`[INVOICE ADJUSTMENT] Credit applied: ${invoiceId} -$${amount.toFixed(2)} by ${adjustedBy}`);

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

  const invoiceTotal = parseFloat(String(invoice.total || 0));
  const discountAmount = (invoiceTotal * discountPercent) / 100;
  const newTotal = invoiceTotal - discountAmount;

  const updated = await db
    .update(invoices)
    .set({
      total: String(newTotal),
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

  const invoiceTotal = parseFloat(String(invoice.total || 0));
  if (refundAmount > invoiceTotal) {
    throw new Error(
      `Refund amount (${refundAmount}) cannot exceed invoice total (${invoiceTotal})`
    );
  }

  const newTotal = invoiceTotal - refundAmount;

  // Update invoice status to partial/refunded
  const newStatus = newTotal === 0 ? "refunded" : "partial";

  const updated = await db
    .update(invoices)
    .set({
      status: newStatus as any,
      total: String(newTotal),
      notes: `${invoice.notes || ""}\n[REFUND] $${refundAmount.toFixed(2)} refunded (${reason}) by ${processedBy}`,
    })
    .where(eq(invoices.id, invoiceId))
    .returning();

  // Log refund action
  console.log(`[INVOICE ADJUSTMENT] Refund processed: ${invoiceId} -$${refundAmount.toFixed(2)} by ${processedBy}`);

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

  const item = lineItems[lineItemIndex];
  const oldQuantity = parseFloat(String(item.quantity || 0));
  const oldUnitPrice = parseFloat(String(item.unitPrice || 0));
  const oldAmount = oldQuantity * oldUnitPrice;
  
  const newItemQuantity = newQuantity ?? oldQuantity;
  const newItemUnitPrice = newUnitPrice ?? oldUnitPrice;
  const newAmount = newItemQuantity * newItemUnitPrice;
  const difference = newAmount - oldAmount;

  // Update line item
  await db
    .update(invoiceLineItems)
    .set({
      quantity: String(newItemQuantity),
      unitPrice: String(newItemUnitPrice),
      amount: String(newAmount),
    })
    .where(eq(invoiceLineItems.id, item.id));

  // Update invoice total
  const invoiceTotal = parseFloat(String(invoice.total || 0));
  const newTotal = invoiceTotal + difference;

  const updated = await db
    .update(invoices)
    .set({
      total: String(newTotal),
      notes: `${invoice.notes || ""}\n[CORRECTION] Line item adjusted: ${reason || "Manual correction"} by ${approvedBy}`,
    })
    .where(eq(invoices.id, invoiceId))
    .returning();

  return {
    success: true,
    previousTotal: invoiceTotal,
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
    currentTotal: parseFloat(String(invoice.total || 0)),
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
      console.error(`[INVOICE ADJUSTMENT] Failed to credit invoice ${invoiceId}:`, error);
      failedCount++;
    }
  }

  console.log(`[INVOICE ADJUSTMENT] Bulk credit completed: ${processedCount} success, ${failedCount} failed`);
  
  return {
    success: failedCount === 0,
    processedCount,
    failedCount,
  };
}
