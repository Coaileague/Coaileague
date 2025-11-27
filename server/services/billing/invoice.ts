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
  invoices,
  invoiceLineItems,
  clients,
  type InsertSubscriptionInvoice,
  type SubscriptionInvoice,
  type InsertSubscriptionLineItem,
  type SubscriptionLineItem,
  type Invoice,
  type InvoiceLineItem,
} from '@shared/schema';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import { emailService } from '../emailService';

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

export interface ClientLineItemInput {
  description: string;
  quantity: number;
  rate: number;
}

export interface GenerateClientInvoiceInput {
  clientId: string;
  workspaceId: string;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  lineItems: ClientLineItemInput[];
  notes?: string;
  dueDate?: Date;
}

export interface ClientInvoiceResult {
  invoice: Invoice;
  lineItems: InvoiceLineItem[];
  calculations: {
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    total: number;
  };
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

  // ============================================================================
  // CLIENT-FACING INVOICE GENERATION
  // ============================================================================

  /**
   * Generate a professional client-facing invoice
   * Uses the existing 'invoices' table for client billing
   * 
   * Invoice Number Format: CLT-INV-YYYY-MM-{sequence}
   * Tax Rate: Client-specific lookup or default 8.875%
   */
  async generateClientInvoice(input: GenerateClientInvoiceInput): Promise<ClientInvoiceResult> {
    const { 
      clientId, 
      workspaceId, 
      billingPeriodStart, 
      billingPeriodEnd, 
      lineItems, 
      notes, 
      dueDate 
    } = input;

    console.log('[InvoiceService] Starting client invoice generation...');
    console.log('[InvoiceService] Input parameters:', {
      clientId,
      workspaceId,
      billingPeriodStart: billingPeriodStart.toISOString(),
      billingPeriodEnd: billingPeriodEnd.toISOString(),
      lineItemCount: lineItems.length,
      notes: notes ? 'provided' : 'not provided',
      dueDate: dueDate ? dueDate.toISOString() : 'not provided',
    });

    // Step 1: Look up client for tax rate information
    const [client] = await db.select()
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }

    console.log('[InvoiceService] Client found:', {
      id: client.id,
      name: `${client.firstName} ${client.lastName}`,
      companyName: client.companyName || 'N/A',
    });

    // Step 2: Determine tax rate
    // Priority: Client-specific rate (if available in future) > Workspace rate > Default 8.875%
    const DEFAULT_TAX_RATE = 0.08875; // 8.875% - NY average
    const taxRate = DEFAULT_TAX_RATE; // Future: lookup from client or workspace settings
    
    console.log('[InvoiceService] Tax rate determination:');
    console.log(`  - Default rate: ${(DEFAULT_TAX_RATE * 100).toFixed(3)}%`);
    console.log(`  - Applied rate: ${(taxRate * 100).toFixed(3)}%`);

    // Step 3: Calculate line item amounts and subtotal
    console.log('[InvoiceService] Calculating line items...');
    
    let subtotal = 0;
    const calculatedLineItems: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      amount: number;
    }> = [];

    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const lineAmount = item.quantity * item.rate;
      
      console.log(`  Line ${i + 1}:`);
      console.log(`    Description: ${item.description}`);
      console.log(`    Quantity: ${item.quantity}`);
      console.log(`    Rate: $${item.rate.toFixed(2)}`);
      console.log(`    Amount: ${item.quantity} × $${item.rate.toFixed(2)} = $${lineAmount.toFixed(2)}`);

      calculatedLineItems.push({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.rate,
        amount: lineAmount,
      });

      subtotal += lineAmount;
    }

    console.log('[InvoiceService] Subtotal calculation:');
    console.log(`  Subtotal: $${subtotal.toFixed(2)}`);

    // Step 4: Calculate tax and total
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;

    console.log('[InvoiceService] Tax calculation:');
    console.log(`  Subtotal: $${subtotal.toFixed(2)}`);
    console.log(`  Tax Rate: ${(taxRate * 100).toFixed(3)}%`);
    console.log(`  Tax Amount: $${subtotal.toFixed(2)} × ${taxRate} = $${taxAmount.toFixed(2)}`);
    console.log('[InvoiceService] Total calculation:');
    console.log(`  Total: $${subtotal.toFixed(2)} + $${taxAmount.toFixed(2)} = $${total.toFixed(2)}`);

    // Step 5: Generate invoice number
    const invoiceNumber = await this.generateClientInvoiceNumber(workspaceId, billingPeriodStart);
    console.log(`[InvoiceService] Generated invoice number: ${invoiceNumber}`);

    // Step 6: Determine due date (default: 30 days from billing period end)
    const calculatedDueDate = dueDate || new Date(billingPeriodEnd.getTime() + 30 * 24 * 60 * 60 * 1000);
    console.log(`[InvoiceService] Due date: ${calculatedDueDate.toISOString()}`);

    // Step 7: Create invoice record in database
    const [invoice] = await db.insert(invoices)
      .values({
        workspaceId,
        clientId,
        invoiceNumber,
        issueDate: new Date(),
        dueDate: calculatedDueDate,
        subtotal: subtotal.toFixed(2),
        taxRate: (taxRate * 100).toFixed(2), // Store as percentage
        taxAmount: taxAmount.toFixed(2),
        total: total.toFixed(2),
        status: 'draft',
        notes: notes || null,
      })
      .returning();

    console.log(`[InvoiceService] Invoice created with ID: ${invoice.id}`);

    // Step 8: Create line item records
    const createdLineItems: InvoiceLineItem[] = [];
    for (const item of calculatedLineItems) {
      const [lineItem] = await db.insert(invoiceLineItems)
        .values({
          invoiceId: invoice.id,
          description: item.description,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toFixed(2),
          amount: item.amount.toFixed(2),
        })
        .returning();
      
      createdLineItems.push(lineItem);
    }

    console.log(`[InvoiceService] Created ${createdLineItems.length} line items`);

    // Step 9: Log audit event
    await db.insert(billingAuditLog).values({
      workspaceId,
      eventType: 'client_invoice_generated',
      eventCategory: 'invoice',
      actorType: 'system',
      description: `Generated client invoice ${invoiceNumber} for ${client.firstName} ${client.lastName}`,
      relatedEntityType: 'invoice',
      relatedEntityId: invoice.id,
      newState: {
        invoiceNumber,
        clientId,
        subtotal,
        taxRate: taxRate * 100,
        taxAmount,
        total,
        lineItemCount: lineItems.length,
        billingPeriod: {
          start: billingPeriodStart.toISOString(),
          end: billingPeriodEnd.toISOString(),
        },
      },
    });

    console.log('[InvoiceService] Client invoice generation complete!');
    console.log('=== INVOICE SUMMARY ===');
    console.log(`  Invoice Number: ${invoiceNumber}`);
    console.log(`  Client: ${client.firstName} ${client.lastName}`);
    console.log(`  Subtotal: $${subtotal.toFixed(2)}`);
    console.log(`  Tax (${(taxRate * 100).toFixed(3)}%): $${taxAmount.toFixed(2)}`);
    console.log(`  Total: $${total.toFixed(2)}`);
    console.log('========================');

    return {
      invoice,
      lineItems: createdLineItems,
      calculations: {
        subtotal,
        taxRate: taxRate * 100, // Return as percentage
        taxAmount,
        total,
      },
    };
  }

  /**
   * Generate unique client invoice number
   * Format: CLT-INV-YYYY-MM-{sequence}
   */
  private async generateClientInvoiceNumber(workspaceId: string, date: Date): Promise<string> {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    
    // Get count of invoices for this workspace in the same month
    const monthStart = new Date(year, date.getMonth(), 1);
    const monthEnd = new Date(year, date.getMonth() + 1, 0, 23, 59, 59, 999);
    
    const existingInvoices = await db.select()
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, workspaceId),
          gte(invoices.issueDate, monthStart),
          lte(invoices.issueDate, monthEnd)
        )
      );

    const sequence = (existingInvoices.length + 1).toString().padStart(4, '0');
    
    // Format: CLT-INV-2024-11-0001
    return `CLT-INV-${year}-${month}-${sequence}`;
  }

  /**
   * Send invoice email notification to recipient
   * Uses the EmailService for delivery with audit trail
   */
  async sendInvoiceEmail(
    invoiceId: string,
    recipientEmail: string
  ): Promise<{ success: boolean; error?: string }> {
    console.log('[InvoiceService] Sending invoice email...');
    console.log(`  Invoice ID: ${invoiceId}`);
    console.log(`  Recipient: ${recipientEmail}`);

    // Step 1: Fetch invoice details
    const [invoice] = await db.select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!invoice) {
      console.error(`[InvoiceService] Invoice not found: ${invoiceId}`);
      return { success: false, error: 'Invoice not found' };
    }

    // Step 2: Fetch client details
    const [client] = await db.select()
      .from(clients)
      .where(eq(clients.id, invoice.clientId))
      .limit(1);

    if (!client) {
      console.error(`[InvoiceService] Client not found for invoice: ${invoice.clientId}`);
      return { success: false, error: 'Client not found' };
    }

    // Step 3: Fetch line items
    const lineItemsData = await db.select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoiceId));

    // Step 4: Build invoice view/pay link
    const baseUrl = process.env.APP_BASE_URL || 
      (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'http://localhost:5000');
    const invoiceUrl = `${baseUrl}/invoices/${invoiceId}`;

    // Step 5: Format due date
    const dueDate = invoice.dueDate 
      ? new Date(invoice.dueDate).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      : 'Upon Receipt';

    // Step 6: Build line items HTML table
    const lineItemsHtml = lineItemsData.map(item => `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 12px; text-align: left;">${item.description}</td>
        <td style="padding: 12px; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px; text-align: right;">$${Number(item.unitPrice).toFixed(2)}</td>
        <td style="padding: 12px; text-align: right;">$${Number(item.amount).toFixed(2)}</td>
      </tr>
    `).join('');

    // Step 7: Build email HTML
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2563eb; margin: 0;">Invoice</h1>
          <p style="color: #64748b; margin: 5px 0;">${invoice.invoiceNumber}</p>
        </div>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; flex-wrap: wrap;">
            <div style="margin-bottom: 15px;">
              <h3 style="color: #334155; margin: 0 0 5px 0;">Bill To:</h3>
              <p style="margin: 0; color: #1e293b;">
                ${client.firstName} ${client.lastName}<br>
                ${client.companyName ? `${client.companyName}<br>` : ''}
                ${client.email || recipientEmail}
              </p>
            </div>
            <div style="text-align: right;">
              <p style="margin: 5px 0; color: #64748b;">
                <strong>Issue Date:</strong> ${new Date(invoice.issueDate || new Date()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              <p style="margin: 5px 0; color: #64748b;">
                <strong>Due Date:</strong> ${dueDate}
              </p>
            </div>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #f1f5f9;">
              <th style="padding: 12px; text-align: left; color: #334155;">Description</th>
              <th style="padding: 12px; text-align: center; color: #334155;">Qty</th>
              <th style="padding: 12px; text-align: right; color: #334155;">Rate</th>
              <th style="padding: 12px; text-align: right; color: #334155;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${lineItemsHtml}
          </tbody>
        </table>

        <div style="text-align: right; margin-bottom: 30px;">
          <table style="margin-left: auto;">
            <tr>
              <td style="padding: 8px 20px; color: #64748b;">Subtotal:</td>
              <td style="padding: 8px 0; text-align: right; color: #1e293b;">$${Number(invoice.subtotal).toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 20px; color: #64748b;">Tax (${Number(invoice.taxRate).toFixed(2)}%):</td>
              <td style="padding: 8px 0; text-align: right; color: #1e293b;">$${Number(invoice.taxAmount).toFixed(2)}</td>
            </tr>
            <tr style="font-weight: bold; font-size: 18px;">
              <td style="padding: 12px 20px; color: #1e293b; border-top: 2px solid #e5e7eb;">Total Due:</td>
              <td style="padding: 12px 0; text-align: right; color: #2563eb; border-top: 2px solid #e5e7eb;">$${Number(invoice.total).toFixed(2)}</td>
            </tr>
          </table>
        </div>

        ${invoice.notes ? `
          <div style="background-color: #fffbeb; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b; margin-bottom: 20px;">
            <p style="margin: 0; color: #92400e;"><strong>Notes:</strong></p>
            <p style="margin: 5px 0 0 0; color: #78350f;">${invoice.notes}</p>
          </div>
        ` : ''}

        <div style="text-align: center; margin-top: 30px;">
          <a href="${invoiceUrl}" 
             style="background-color: #2563eb; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px;">
            View Invoice & Pay Online
          </a>
        </div>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #94a3b8; font-size: 12px; text-align: center;">
          <p style="margin: 5px 0;">This is an automated invoice notification from CoAIleague</p>
          <p style="margin: 5px 0;">If you have questions about this invoice, please contact your service provider.</p>
        </div>
      </div>
    `;

    // Step 8: Send email using EmailService
    const result = await emailService.sendCustomEmail(
      recipientEmail,
      `Invoice ${invoice.invoiceNumber} - $${Number(invoice.total).toFixed(2)} Due`,
      emailHtml,
      'client_invoice',
      invoice.workspaceId
    );

    if (result.success) {
      // Update invoice status to indicate it was sent
      await db.update(invoices)
        .set({
          status: 'sent',
          sentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoiceId));

      // Log audit event
      await db.insert(billingAuditLog).values({
        workspaceId: invoice.workspaceId,
        eventType: 'invoice_email_sent',
        eventCategory: 'invoice',
        actorType: 'system',
        description: `Invoice ${invoice.invoiceNumber} sent to ${recipientEmail}`,
        relatedEntityType: 'invoice',
        relatedEntityId: invoiceId,
        newState: {
          recipientEmail,
          sentAt: new Date().toISOString(),
          resendId: result.resendId,
        },
      });

      console.log(`[InvoiceService] Invoice email sent successfully to ${recipientEmail}`);
    } else {
      console.error(`[InvoiceService] Failed to send invoice email: ${result.error}`);
    }

    return {
      success: result.success,
      error: result.error,
    };
  }

  /**
   * Get client invoice with all details
   */
  async getClientInvoice(invoiceId: string): Promise<ClientInvoiceResult | null> {
    const [invoice] = await db.select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!invoice) {
      return null;
    }

    const lineItemsData = await db.select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoiceId));

    return {
      invoice,
      lineItems: lineItemsData,
      calculations: {
        subtotal: Number(invoice.subtotal),
        taxRate: Number(invoice.taxRate),
        taxAmount: Number(invoice.taxAmount),
        total: Number(invoice.total),
      },
    };
  }

  /**
   * Get all invoices for a specific client
   */
  async getClientInvoices(
    clientId: string,
    limit: number = 50
  ): Promise<Invoice[]> {
    return db.select()
      .from(invoices)
      .where(eq(invoices.clientId, clientId))
      .orderBy(desc(invoices.createdAt))
      .limit(limit);
  }
}

// Singleton instance
export const invoiceService = new InvoiceService();
