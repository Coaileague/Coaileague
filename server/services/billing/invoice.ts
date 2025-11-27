import { db } from '../../db';
import {
  subscriptionInvoices,
  subscriptionLineItems,
  subscriptionPayments,
  workspaceAddons,
  billingAddons,
  aiUsageDailyRollups,
  workspaces,
  billingAuditLog,
  invoiceAdjustments,
  type InsertSubscriptionInvoice,
  type SubscriptionInvoice,
  type InsertSubscriptionLineItem,
  type SubscriptionLineItem,
} from '@shared/schema';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';

export interface InvoiceLineItemInput {
  itemType: 'subscription' | 'addon' | 'usage' | 'overage' | 'credit' | 'adjustment';
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  addonId?: string;
  featureKey?: string;
  metadata?: any;
}

export interface GenerateInvoiceInput {
  workspaceId: string;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  dueDate?: Date;
}

export class InvoiceService {
  /**
   * Generate weekly invoice for a workspace
   * Aggregates subscription fees, add-on charges, and usage-based charges
   */
  async generateInvoice(input: GenerateInvoiceInput): Promise<SubscriptionInvoice> {
    const { workspaceId, billingPeriodStart, billingPeriodEnd } = input;

    // Check if invoice already exists for this period
    const existing = await db.select()
      .from(subscriptionInvoices)
      .where(
        and(
          eq(subscriptionInvoices.workspaceId, workspaceId),
          eq(subscriptionInvoices.billingPeriodStart, billingPeriodStart),
          eq(subscriptionInvoices.billingPeriodEnd, billingPeriodEnd)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    // Generate invoice number
    const invoiceNumber = await this.generateInvoiceNumber(workspaceId, billingPeriodStart);

    // Calculate due date (7 days from billing period end)
    const dueDate = input.dueDate || new Date(billingPeriodEnd.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Create invoice
    const [invoice] = await db.insert(subscriptionInvoices)
      .values({
        workspaceId,
        invoiceNumber,
        billingPeriodStart,
        billingPeriodEnd,
        subtotal: '0.00',
        taxAmount: '0.00',
        discountAmount: '0.00',
        totalAmount: '0.00',
        status: 'draft',
        dueDate,
      })
      .returning();

    // Collect line items
    const lineItems: InvoiceLineItemInput[] = [];

    // 1. Add subscription base fees (if any)
    // Note: Base subscription handled by Stripe directly, not invoiced here

    // 2. Add add-on charges
    const addons = await this.getActiveAddons(workspaceId, billingPeriodStart, billingPeriodEnd);
    for (const addon of addons) {
      lineItems.push({
        itemType: 'addon',
        description: `${addon.name} - ${this.formatPeriod(billingPeriodStart, billingPeriodEnd)}`,
        quantity: 1,
        unitPrice: addon.price,
        amount: addon.price,
        addonId: addon.id,
        metadata: {
          pricingType: addon.pricingType,
          usageUnit: addon.usageUnit,
        },
      });
    }

    // 3. Add usage-based charges
    const usageCharges = await this.calculateUsageCharges(workspaceId, billingPeriodStart, billingPeriodEnd);
    lineItems.push(...usageCharges);

    // 4. Add any adjustments or credits
    const adjustments = await db.select()
      .from(invoiceAdjustments)
      .where(and(
        eq(invoiceAdjustments.invoiceId, invoice.id),
        eq(invoiceAdjustments.status, 'approved')
      ));
    
    let adjustmentTotal = 0;
    for (const adjustment of adjustments) {
      const adjustmentAmount = Number(adjustment.amount) || 0;
      adjustmentTotal += adjustment.adjustmentType === 'credit' ? -adjustmentAmount : adjustmentAmount;
      
      // Log adjustment application
      await db.insert(billingAuditLog).values({
        workspaceId,
        eventType: 'invoice_adjustment',
        eventCategory: 'invoice',
        actorType: 'system',
        description: `Applied ${adjustment.adjustmentType}: ${adjustment.description}`,
        relatedEntityType: 'invoice_adjustment',
        relatedEntityId: adjustment.id,
        newState: {
          adjustmentAmount,
          adjustmentType: adjustment.adjustmentType,
          status: 'applied',
        },
      });
    }

    // Save line items and calculate totals
    let subtotal = 0;
    for (const item of lineItems) {
      await db.insert(subscriptionLineItems).values({
        invoiceId: invoice.id,
        itemType: item.itemType,
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        amount: item.amount.toString(),
        addonId: item.addonId,
        featureKey: item.featureKey,
        metadata: item.metadata,
      });

      subtotal += item.amount;
    }

    // Calculate real federal tax (8.875% - NY average as default, should be configurable per workspace)
    const taxRate = 0.08875; // 8.875% federal/state average
    const subtotalAfterAdjustments = Math.max(0, subtotal + adjustmentTotal);
    const taxAmount = subtotalAfterAdjustments * taxRate;
    const totalAmount = subtotalAfterAdjustments + taxAmount;

    // Update invoice with totals
    const [updatedInvoice] = await db.update(subscriptionInvoices)
      .set({
        subtotal: subtotal.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        status: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(subscriptionInvoices.id, invoice.id))
      .returning();

    // Log audit event
    await db.insert(billingAuditLog).values({
      workspaceId,
      eventType: 'invoice_generated',
      eventCategory: 'subscription',
      actorType: 'system',
      description: `Generated invoice ${invoiceNumber} for ${this.formatPeriod(billingPeriodStart, billingPeriodEnd)}`,
      relatedEntityType: 'invoice',
      relatedEntityId: invoice.id,
      newState: {
        invoiceNumber,
        subtotal,
        totalAmount,
        lineItemCount: lineItems.length,
      },
    });

    return updatedInvoice;
  }

  /**
   * Get active add-ons for billing period
   */
  private async getActiveAddons(
    workspaceId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<Array<{ id: string; name: string; price: number; pricingType: string; usageUnit: string }>> {
    const activeAddons = await db.select({
      id: billingAddons.id,
      name: billingAddons.name,
      price: billingAddons.basePrice,
      pricingType: billingAddons.pricingType,
      usageUnit: billingAddons.usageUnit,
    })
      .from(workspaceAddons)
      .innerJoin(billingAddons, eq(workspaceAddons.addonId, billingAddons.id))
      .where(
        and(
          eq(workspaceAddons.workspaceId, workspaceId),
          eq(workspaceAddons.status, 'active')
        )
      );

    return activeAddons.map(addon => ({
      id: addon.id,
      name: addon.name,
      price: Number(addon.price) || 0,
      pricingType: addon.pricingType,
      usageUnit: addon.usageUnit || 'session',
    }));
  }

  /**
   * Calculate usage charges from daily rollups
   */
  private async calculateUsageCharges(
    workspaceId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<InvoiceLineItemInput[]> {
    const rollups = await db.select()
      .from(aiUsageDailyRollups)
      .where(
        and(
          eq(aiUsageDailyRollups.workspaceId, workspaceId),
          gte(aiUsageDailyRollups.usageDate, periodStart),
          lte(aiUsageDailyRollups.usageDate, periodEnd)
        )
      );

    // Group by feature
    const featureMap = new Map<string, { totalCost: number; totalUsage: number; totalEvents: number }>();

    for (const rollup of rollups) {
      const existing = featureMap.get(rollup.featureKey) || { totalCost: 0, totalUsage: 0, totalEvents: 0 };
      existing.totalCost += Number(rollup.totalCost) || 0;
      existing.totalUsage += Number(rollup.totalUsageAmount) || 0;
      existing.totalEvents += rollup.totalEvents || 0;
      featureMap.set(rollup.featureKey, existing);
    }

    // Create line items
    const lineItems: InvoiceLineItemInput[] = [];

    const entries = Array.from(featureMap.entries());
    for (let i = 0; i < entries.length; i++) {
      const [featureKey, data] = entries[i];
      if (data.totalCost > 0) {
        lineItems.push({
          itemType: 'usage',
          description: `${this.formatFeatureName(featureKey)} - ${data.totalEvents} events`,
          quantity: data.totalUsage,
          unitPrice: data.totalUsage > 0 ? data.totalCost / data.totalUsage : 0,
          amount: data.totalCost,
          featureKey,
          metadata: {
            totalEvents: data.totalEvents,
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
          },
        });
      }
    }

    return lineItems;
  }

  /**
   * Get invoice by ID with line items
   */
  async getInvoiceWithLineItems(invoiceId: string): Promise<{
    invoice: SubscriptionInvoice;
    lineItems: SubscriptionLineItem[];
  } | null> {
    const [invoice] = await db.select()
      .from(subscriptionInvoices)
      .where(eq(subscriptionInvoices.id, invoiceId))
      .limit(1);

    if (!invoice) {
      return null;
    }

    const lineItems = await db.select()
      .from(subscriptionLineItems)
      .where(eq(subscriptionLineItems.invoiceId, invoiceId));

    return { invoice, lineItems };
  }

  /**
   * Get invoices for workspace
   */
  async getInvoicesForWorkspace(
    workspaceId: string,
    limit: number = 50
  ): Promise<SubscriptionInvoice[]> {
    return db.select()
      .from(subscriptionInvoices)
      .where(eq(subscriptionInvoices.workspaceId, workspaceId))
      .orderBy(desc(subscriptionInvoices.createdAt))
      .limit(limit);
  }

  /**
   * Mark invoice as paid
   */
  async markInvoicePaid(
    invoiceId: string,
    paymentIntentId: string
  ): Promise<SubscriptionInvoice> {
    const [invoice] = await db.update(subscriptionInvoices)
      .set({
        status: 'paid',
        paidAt: new Date(),
        stripePaymentIntentId: paymentIntentId,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionInvoices.id, invoiceId))
      .returning();

    // Log audit event
    const [invoiceRecord] = await db.select()
      .from(subscriptionInvoices)
      .where(eq(subscriptionInvoices.id, invoiceId))
      .limit(1);

    if (invoiceRecord) {
      await db.insert(billingAuditLog).values({
        workspaceId: invoiceRecord.workspaceId,
        eventType: 'payment_succeeded',
        eventCategory: 'payment',
        actorType: 'webhook',
        description: `Invoice ${invoiceRecord.invoiceNumber} marked as paid`,
        relatedEntityType: 'invoice',
        relatedEntityId: invoiceId,
        newState: {
          status: 'paid',
          paidAt: new Date().toISOString(),
        },
      });
    }

    return invoice;
  }

  /**
   * Mark invoice as overdue
   */
  async markInvoiceOverdue(invoiceId: string): Promise<SubscriptionInvoice> {
    const [invoice] = await db.update(subscriptionInvoices)
      .set({
        status: 'overdue',
        updatedAt: new Date(),
      })
      .where(eq(subscriptionInvoices.id, invoiceId))
      .returning();

    return invoice;
  }

  /**
   * Generate unique invoice number
   */
  private async generateInvoiceNumber(workspaceId: string, date: Date): Promise<string> {
    const year = date.getFullYear();
    const weekNumber = this.getWeekNumber(date);
    const workspaceShort = workspaceId.substring(0, 8).toUpperCase();
    
    // Format: SUB-INV-2024-W14-WORKSPACE
    return `SUB-INV-${year}-W${weekNumber.toString().padStart(2, '0')}-${workspaceShort}`;
  }

  /**
   * Get week number of year
   */
  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  /**
   * Format period for display
   */
  private formatPeriod(start: Date, end: Date): string {
    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }

  /**
   * Format feature name for display
   */
  private formatFeatureName(featureKey: string): string {
    const names: Record<string, string> = {
      'scheduleos_ai_generation': 'AI Scheduling AI Generation',
      'scheduleos_optimization': 'AI Scheduling Optimization',
      'recordos_search': 'AI Records Search',
      'recordos_ai_query': 'AI Records AI Query',
      'insightos_prediction': 'AI Analytics Prediction',
      'insightos_analytics': 'AI Analytics Analytics',
    };

    return names[featureKey] || featureKey;
  }

  /**
   * Get upcoming invoices that need to be generated
   */
  async getUpcomingInvoices(): Promise<Array<{ workspaceId: string; dueDate: Date }>> {
    // Get all active workspaces that need weekly invoicing
    const workspacesList = await db.select({
      id: workspaces.id,
      billingCycleDay: workspaces.billingCycleDay,
      nextInvoiceAt: workspaces.nextInvoiceAt,
    })
      .from(workspaces)
      .where(eq(workspaces.accountState, 'active'));

    const now = new Date();
    const upcoming: Array<{ workspaceId: string; dueDate: Date }> = [];

    for (const workspace of workspacesList) {
      const nextInvoice = workspace.nextInvoiceAt;
      if (!nextInvoice || nextInvoice <= now) {
        upcoming.push({
          workspaceId: workspace.id,
          dueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        });
      }
    }

    return upcoming;
  }
}

// Singleton instance
export const invoiceService = new InvoiceService();
