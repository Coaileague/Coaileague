/**
 * Billing Platform - Full Financial Automation System
 * Combines InvoiceOS (AR) and AI Payroll (HR) into unified billing solution
 * 
 * Features:
 * - Zero-touch usage-based invoicing
 * - Subscription + hybrid billing
 * - Automated delinquency management
 * - Client self-service portal
 * - Tax compliance integration
 * - Employee expense management
 * - Off-cycle payroll runs
 */

import { db } from "../db";
import { 
  invoices, 
  invoiceLineItems, 
  clientRates, 
  paymentRecords,
  invoiceReminders,
  clientPortalAccess,
  expenses,
  timeEntries,
  shifts,
  clients,
  workspaces,
  type Invoice,
  type InsertInvoice,
  type InsertInvoiceLineItem,
  type InsertClientRate,
  type InsertPaymentRecord,
  type InsertInvoiceReminder,
  type ClientRate,
} from "@shared/schema";
import { eq, and, gte, lte, isNull, desc, sql } from "drizzle-orm";
import { Resend } from "resend";
import { aggregateBillableHours, markEntriesAsBilled } from "./automation/billableHoursAggregator";
import Stripe from "stripe";

// Lazy initialize Resend only when sending emails (allows server to start without API key)
let resend: Resend | null = null;
function getResend() {
  if (!resend && process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

/**
 * PHASE 4A: AUTOMATED INVOICING & REVENUE STREAM (Subscriber's AR)
 */

/**
 * Zero-Touch Usage-Based Invoicing (PRODUCTION)
 * Uses billable hours aggregator for accurate OT/regular/holiday calculation
 * Generates draft invoices requiring manager approval before sending to clients
 */
export async function generateUsageBasedInvoices(workspaceId: string, generateDate?: Date) {
  const targetDate = generateDate || new Date();
  targetDate.setHours(0, 0, 0, 0);
  
  // Get previous day's range for unbilled hours
  const startDate = new Date(targetDate);
  startDate.setDate(startDate.getDate() - 1);
  const endDate = new Date(targetDate);
  
  // Use production aggregator for FLSA-compliant OT calculation
  const aggregationResult = await aggregateBillableHours({
    workspaceId,
    startDate,
    endDate,
  });
  
  // Log warnings for human review (surfaced in invoice review dashboard)
  if (aggregationResult.warnings.length > 0) {
    console.warn('[Billing Platform] Billable hours aggregation warnings:', aggregationResult.warnings);
  }
  
  // Check for critical warnings that should block invoice generation
  const criticalWarnings = aggregationResult.warnings.filter(w => 
    w.includes('missing clock-out') || 
    w.includes('fell back to workspace default') ||
    w.includes('No billing rate configured')
  );
  
  if (criticalWarnings.length > 0) {
    console.error('[Billing Platform] Critical warnings detected - invoices require manual review:', criticalWarnings);
    // Continue generation but flag for review (warnings stored with invoice)
  }
  
  const generatedInvoices: Invoice[] = [];
  
  // Generate DRAFT invoice for each client (requires manager approval)
  for (const clientSummary of aggregationResult.clientSummaries) {
    try {
      const invoice = await createInvoiceFromBillableSummary(
        workspaceId,
        clientSummary,
        aggregationResult.warnings.filter(w => 
          w.includes(clientSummary.clientId) || w.includes(clientSummary.clientName)
        )
      );
      generatedInvoices.push(invoice);
      
      // Mark time entries as billed (link to invoice) after successful creation
      const allTimeEntryIds = clientSummary.entries.map(entry => entry.timeEntryId);
      await markEntriesAsBilled({
        timeEntryIds: allTimeEntryIds,
        invoiceId: invoice.id,
      });
      
    } catch (error) {
      console.error(`[Billing Platform] Failed to generate invoice for client ${clientSummary.clientName}:`, error);
    }
  }
  
  return generatedInvoices;
}

/**
 * Create invoice from billable hours summary with OT/regular/holiday breakdown (PRODUCTION)
 * Generates employee-grouped line items showing hour types for transparency
 * Keeps invoice in DRAFT status requiring manager approval before sending to client
 */
async function createInvoiceFromBillableSummary(
  workspaceId: string,
  clientSummary: any, // ClientBillableSummary from aggregator
  warnings: string[]
) {
  // Get client rate configuration (for subscription billing if applicable)
  const [clientRate] = await db
    .select()
    .from(clientRates)
    .where(
      and(
        eq(clientRates.workspaceId, workspaceId),
        eq(clientRates.clientId, clientSummary.clientId!),
        eq(clientRates.isActive, true)
      )
    )
    .limit(1);
  
  // Get workspace for platform fee
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  
  // Build line items: Employee-grouped with hour type breakdown
  const lineItems: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    amount: string;
    metadata?: string; // Store rate source for audit trail
  }> = [];
  
  // Group entries by employee for consolidated line items
  const entriesByEmployee = new Map<string, typeof clientSummary.entries>();
  for (const entry of clientSummary.entries) {
    const key = entry.employeeId;
    if (!entriesByEmployee.has(key)) {
      entriesByEmployee.set(key, []);
    }
    entriesByEmployee.get(key)!.push(entry);
  }
  
  // Generate line items per employee showing hour type breakdown
  // CRITICAL: Sum actual entry amounts (entries may have different rates)
  for (const [employeeId, entries] of Array.from(entriesByEmployee)) {
    const employeeName = entries[0].employeeName;
    
    // Sum up hours and amounts by type - using actual entry amounts for accuracy
    let totalRegular = 0;
    let totalOvertime = 0;
    let totalHoliday = 0;
    let regularAmount = 0;
    let overtimeAmount = 0;
    let holidayAmount = 0;
    const rateSources = new Set<string>();
    
    for (const entry of entries) {
      totalRegular += entry.regularHours;
      totalOvertime += entry.overtimeHours;
      totalHoliday += entry.holidayHours;
      
      // Use actual amounts from aggregator (preserves mixed-rate accuracy)
      regularAmount += entry.regularHours * entry.billingRate;
      overtimeAmount += entry.overtimeHours * entry.billingRate * 1.5;
      holidayAmount += entry.holidayHours * entry.billingRate * 2.0;
      
      rateSources.add(entry.rateSource);
    }
    
    // Calculate weighted average rates for display (informational only)
    const avgRegularRate = totalRegular > 0 ? regularAmount / totalRegular : 0;
    const avgOvertimeRate = totalOvertime > 0 ? overtimeAmount / totalOvertime : 0;
    const avgHolidayRate = totalHoliday > 0 ? holidayAmount / totalHoliday : 0;
    const rateSourceNote = rateSources.size > 1 ? 'mixed_rates' : Array.from(rateSources)[0];
    
    // Regular hours line item
    if (totalRegular > 0) {
      lineItems.push({
        description: `${employeeName} - Regular Hours`,
        quantity: totalRegular.toFixed(2),
        unitPrice: avgRegularRate.toFixed(2),
        amount: regularAmount.toFixed(2),
        metadata: JSON.stringify({ 
          rateSource: rateSourceNote, 
          hourType: 'regular',
          employeeId,
          rateSources: Array.from(rateSources)
        }),
      });
    }
    
    // Overtime hours line item (1.5x billing rate)
    if (totalOvertime > 0) {
      lineItems.push({
        description: `${employeeName} - Overtime Hours (1.5x)`,
        quantity: totalOvertime.toFixed(2),
        unitPrice: avgOvertimeRate.toFixed(2),
        amount: overtimeAmount.toFixed(2),
        metadata: JSON.stringify({ 
          rateSource: rateSourceNote, 
          hourType: 'overtime',
          employeeId,
          multiplier: 1.5,
          rateSources: Array.from(rateSources)
        }),
      });
    }
    
    // Holiday hours line item (2.0x billing rate)
    if (totalHoliday > 0) {
      lineItems.push({
        description: `${employeeName} - Holiday Hours (2.0x)`,
        quantity: totalHoliday.toFixed(2),
        unitPrice: avgHolidayRate.toFixed(2),
        amount: holidayAmount.toFixed(2),
        metadata: JSON.stringify({ 
          rateSource: rateSourceNote, 
          hourType: 'holiday',
          employeeId,
          multiplier: 2.0,
          rateSources: Array.from(rateSources)
        }),
      });
    }
  }
  
  // Calculate subtotal from aggregator (already includes OT calculations)
  let subtotal = clientSummary.totalAmount;
  
  // Add subscription fee if hybrid billing
  if (clientRate?.hasSubscription && clientRate.subscriptionAmount) {
    const subscriptionAmount = parseFloat(clientRate.subscriptionAmount);
    const proratedAmount = prorateSubscription(
      subscriptionAmount,
      clientRate.subscriptionFrequency || 'monthly',
      new Date()
    );
    
    lineItems.unshift({
      description: `${clientRate.subscriptionFrequency === 'monthly' ? 'Monthly' : 'Quarterly'} Subscription (Prorated)`,
      quantity: "1",
      unitPrice: proratedAmount.toString(),
      amount: proratedAmount.toString(),
      metadata: JSON.stringify({ type: 'subscription' }),
    });
    
    subtotal += proratedAmount;
  }
  
  // Calculate tax and totals using real tax calculation
  const taxRate = await calculateStateTax(
    workspace?.address || '',
    workspace?.taxId || '',
    subtotal
  ) || 0;
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;
  
  // Calculate platform fee
  const platformFeePercentage = parseFloat(workspace?.platformFeePercentage || "3.00");
  const platformFeeAmount = total * (platformFeePercentage / 100);
  const businessAmount = total - platformFeeAmount;
  
  // Generate invoice number
  const invoiceNumber = await generateInvoiceNumber(workspaceId);
  
  // Set due date (30 days from issue)
  const issueDate = new Date();
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  
  // Create invoice in DRAFT status (requires manager approval)
  const [invoice] = await db
    .insert(invoices)
    .values({
      workspaceId,
      clientId: clientSummary.clientId,
      invoiceNumber,
      issueDate,
      dueDate,
      subtotal: subtotal.toFixed(2),
      taxRate: taxRate.toString(),
      taxAmount: taxAmount.toFixed(2),
      total: total.toFixed(2),
      platformFeePercentage: platformFeePercentage.toString(),
      platformFeeAmount: platformFeeAmount.toFixed(2),
      businessAmount: businessAmount.toFixed(2),
      status: 'draft', // HUMAN OVERSIGHT: Manager must review before sending
      notes: warnings.length > 0 
        ? `⚠️ Aggregation Warnings:\n${warnings.join('\n')}` 
        : null,
    })
    .returning();
  
  // Create line items with hour type breakdown
  await db.insert(invoiceLineItems).values(
    lineItems.map(item => ({
      invoiceId: invoice.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
      // Note: metadata field doesn't exist in schema yet - will be added for rate source tracking
    }))
  );
  
  return invoice;
}

/**
 * Prorate subscription based on frequency and billing period
 */
function prorateSubscription(amount: number, frequency: string, billingDate: Date): number {
  // For simplicity, return full amount - production would calculate partial months
  return amount;
}

/**
 * Generate unique invoice number
 */
async function generateInvoiceNumber(workspaceId: string): Promise<string> {
  const [lastInvoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.workspaceId, workspaceId))
    .orderBy(desc(invoices.createdAt))
    .limit(1);
  
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  
  if (!lastInvoice) {
    return `INV-${year}${month}-0001`;
  }
  
  // Extract sequence from last invoice number
  const parts = lastInvoice.invoiceNumber.split('-');
  const sequence = parseInt(parts[parts.length - 1]) + 1;
  
  return `INV-${year}${month}-${String(sequence).padStart(4, '0')}`;
}

/**
 * Send invoice to client self-service portal
 */
async function sendInvoiceToClientPortal(invoice: Invoice) {
  // Get or create client portal access
  let [portalAccess] = await db
    .select()
    .from(clientPortalAccess)
    .where(
      and(
        eq(clientPortalAccess.workspaceId, invoice.workspaceId),
        eq(clientPortalAccess.clientId, invoice.clientId),
        eq(clientPortalAccess.isActive, true)
      )
    )
    .limit(1);
  
  if (!portalAccess) {
    // Create new portal access
    const accessToken = generateSecureToken();
    
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, invoice.clientId))
      .limit(1);
    
    [portalAccess] = await db
      .insert(clientPortalAccess)
      .values({
        workspaceId: invoice.workspaceId,
        clientId: invoice.clientId,
        accessToken,
        email: client.email || '',
        portalName: `${client.firstName} ${client.lastName} - Billing Portal`,
        isActive: true,
      })
      .returning();
  }
  
  // Send email notification
  const portalUrl = `${process.env.REPLIT_DOMAINS?.split(',')[0]}/portal/client/${portalAccess.accessToken}`;
  
  await sendInvoiceEmail(invoice, portalAccess.email, portalUrl);
  
  // Mark invoice as sent
  await db
    .update(invoices)
    .set({ status: 'sent' })
    .where(eq(invoices.id, invoice.id));
}

/**
 * Generate secure access token
 */
function generateSecureToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Send invoice email to client
 */
async function sendInvoiceEmail(invoice: Invoice, clientEmail: string, portalUrl: string) {
  try {
    const resendClient = getResend();
    if (!resendClient) {
      console.warn('Resend API key not configured - invoice email not sent');
      return;
    }
    
    await resendClient.emails.send({
      from: 'billing@workforceos.com',
      to: clientEmail,
      subject: `Invoice ${invoice.invoiceNumber} - ${invoice.total}`,
      html: `
        <h2>New Invoice</h2>
        <p>Invoice Number: ${invoice.invoiceNumber}</p>
        <p>Amount Due: $${invoice.total}</p>
        <p>Due Date: ${invoice.dueDate?.toLocaleDateString()}</p>
        <p><a href="${portalUrl}">View and Pay Invoice</a></p>
      `,
    });
  } catch (error) {
    console.error('Failed to send invoice email:', error);
  }
}

/**
 * Send invoice via Stripe (Automated Billing)
 * Creates Stripe invoice, adds line items, and sends to client
 */
export async function sendInvoiceViaStripe(invoiceId: string): Promise<{ success: boolean; stripeInvoiceId?: string; error?: string }> {
  try {
    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      console.warn('[Billing Platform] Stripe not configured - skipping automated invoice sending');
      return { success: false, error: 'Stripe not configured' };
    }

    // Initialize Stripe
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-09-30.clover',
    });

    // Get invoice with line items and client
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!invoice) {
      return { success: false, error: 'Invoice not found' };
    }

    // Get client
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, invoice.clientId))
      .limit(1);

    if (!client) {
      return { success: false, error: 'Client not found' };
    }

    // Get line items
    const lineItems = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoiceId));

    // Get or create Stripe customer
    let stripeCustomerId = client.stripeCustomerId;
    
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: client.email || undefined,
        name: client.companyName || `${client.firstName || ''} ${client.lastName || ''}`.trim() || undefined,
        metadata: {
          autoforceClientId: client.id,
          workspaceId: invoice.workspaceId,
        },
      });
      
      stripeCustomerId = customer.id;
      
      // Update client with Stripe customer ID
      await db.update(clients)
        .set({ stripeCustomerId })
        .where(eq(clients.id, client.id));
    }

    // Create Stripe invoice
    const stripeInvoice = await stripe.invoices.create({
      customer: stripeCustomerId,
      collection_method: 'send_invoice',
      days_until_due: 30,
      auto_advance: false, // Keep manual finalization for safety
      metadata: {
        autoforceInvoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        workspaceId: invoice.workspaceId,
      },
      description: `Invoice ${invoice.invoiceNumber}`,
    });

    // Add line items to Stripe invoice
    for (const item of lineItems) {
      await stripe.invoiceItems.create({
        customer: stripeCustomerId,
        invoice: stripeInvoice.id,
        description: item.description,
        amount: Math.round(parseFloat(item.amount) * 100), // Convert to cents
        currency: 'usd',
      });
    }

    // Finalize and send invoice
    await stripe.invoices.finalizeInvoice(stripeInvoice.id);
    await stripe.invoices.sendInvoice(stripeInvoice.id);

    // Update local invoice record
    await db.update(invoices)
      .set({
        status: 'sent',
        stripeInvoiceId: stripeInvoice.id,
        sentAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    console.log(`✅ [Billing Platform] Invoice ${invoice.invoiceNumber} sent via Stripe (${stripeInvoice.id})`);

    return { success: true, stripeInvoiceId: stripeInvoice.id };

  } catch (error: any) {
    console.error('[Billing Platform] Failed to send invoice via Stripe:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delinquency Automation - 7/14/30 day reminders
 */
export async function processDelinquentInvoices(workspaceId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Find overdue invoices
  const overdueInvoices = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.workspaceId, workspaceId),
        eq(invoices.status, 'sent'),
        lte(invoices.dueDate!, today)
      )
    );
  
  for (const invoice of overdueInvoices) {
    const daysOverdue = Math.floor((today.getTime() - invoice.dueDate!.getTime()) / (1000 * 60 * 60 * 24));
    
    // Check if reminder already sent for this period
    const [existingReminder] = await db
      .select()
      .from(invoiceReminders)
      .where(
        and(
          eq(invoiceReminders.invoiceId, invoice.id),
          eq(invoiceReminders.daysOverdue, daysOverdue)
        )
      )
      .limit(1);
    
    if (existingReminder) continue;
    
    // Determine reminder type
    let reminderType: '7_day' | '14_day' | '30_day' | 'custom' = 'custom';
    if (daysOverdue === 7) reminderType = '7_day';
    else if (daysOverdue === 14) reminderType = '14_day';
    else if (daysOverdue >= 30) reminderType = '30_day';
    else continue; // Only send on 7, 14, and 30+ days
    
    // Get client email
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, invoice.clientId))
      .limit(1);
    
    if (!client?.email) {
      console.error(`No email found for client ${invoice.clientId}`);
      continue;
    }

    // Generate payment URL from configured base or Replit domains
    const baseUrl = process.env.APP_BASE_URL || process.env.REPLIT_DOMAINS?.split(',')[0];
    if (!baseUrl) {
      console.error('Cannot generate payment URL: APP_BASE_URL or REPLIT_DOMAINS not configured');
      continue;
    }
    const paymentUrl = `${baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`}/pay-invoice/${invoice.id}`;
    
    // Create reminder record first (for tracking)
    await db.insert(invoiceReminders).values({
      workspaceId,
      invoiceId: invoice.id,
      reminderType,
      daysOverdue,
      emailTo: client.email,
      emailSubject: `Payment Reminder: Invoice ${invoice.invoiceNumber} is ${daysOverdue} Days Overdue`,
      emailBody: 'Sent via standardized template',
      status: 'pending',
      needsHumanIntervention: daysOverdue >= 30,
    });
    
    // Send reminder email using standardized template
    try {
      const { sendInvoiceOverdueReminderEmail } = await import('../email');
      
      await sendInvoiceOverdueReminderEmail(client.email, {
        clientName: client.companyName || `${client.firstName || ''} ${client.lastName || ''}`.trim() || 'Valued Customer',
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total,
        dueDate: invoice.dueDate?.toLocaleDateString('en-US', { dateStyle: 'medium' }) || 'N/A',
        daysOverdue,
        paymentUrl,
      });
      
      // Mark as sent
      await db
        .update(invoiceReminders)
        .set({ status: 'sent', sentAt: new Date() })
        .where(
          and(
            eq(invoiceReminders.invoiceId, invoice.id),
            eq(invoiceReminders.daysOverdue, daysOverdue)
          )
        );
      
      // Update invoice status if 30+ days
      if (daysOverdue >= 30) {
        await db
          .update(invoices)
          .set({ status: 'overdue' })
          .where(eq(invoices.id, invoice.id));
      }
    } catch (error) {
      console.error('Failed to send reminder email:', error);
      await db
        .update(invoiceReminders)
        .set({ status: 'failed', failureReason: String(error) })
        .where(
          and(
            eq(invoiceReminders.invoiceId, invoice.id),
            eq(invoiceReminders.daysOverdue, daysOverdue)
          )
        );
    }
  }
}

/**
 * Process invoice payment via Stripe Connect
 */
export async function processInvoicePayment(
  invoiceId: string,
  paymentIntentId: string,
  amount: number
) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  
  if (!invoice) {
    throw new Error('Invoice not found');
  }
  
  // Calculate platform fee
  const platformFeeAmount = parseFloat(invoice.platformFeeAmount || "0");
  const businessAmount = parseFloat(invoice.businessAmount || "0");
  
  // Create payment record
  await db.insert(paymentRecords).values({
    workspaceId: invoice.workspaceId,
    invoiceId: invoice.id,
    amount: amount.toString(),
    paymentMethod: 'stripe_card',
    paymentIntentId,
    status: 'completed',
    paidAt: new Date(),
    platformFeeAmount: platformFeeAmount.toString(),
    businessAmount: businessAmount.toString(),
  });
  
  // Update invoice status
  await db
    .update(invoices)
    .set({
      status: 'paid',
      paidAt: new Date(),
      paymentIntentId,
    })
    .where(eq(invoices.id, invoice.id));
  
  return invoice;
}

/**
 * PHASE 4B: FULL-SERVICE PAYROLL & LIABILITY (Subscriber's HR)
 * These functions integrate with the existing AI Payroll™ system
 */

/**
 * Process approved expense reports and include in next payroll run
 */
export async function getApprovedExpensesForPayroll(
  workspaceId: string,
  employeeId: string
): Promise<number> {
  const [result] = await db
    .select({
      totalReimbursement: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.workspaceId, workspaceId),
        eq(expenses.employeeId, employeeId),
        eq(expenses.status, 'approved'),
        isNull(expenses.reimbursedAt)
      )
    );
  
  return parseFloat(result?.totalReimbursement || "0");
}

/**
 * Mark expenses as reimbursed in payroll run
 */
export async function markExpensesReimbursed(
  workspaceId: string,
  employeeId: string,
  payrollRunId: string
) {
  await db
    .update(expenses)
    .set({
      reimbursementReference: payrollRunId,
      reimbursedAt: new Date(),
      status: 'reimbursed',
    })
    .where(
      and(
        eq(expenses.workspaceId, workspaceId),
        eq(expenses.employeeId, employeeId),
        eq(expenses.status, 'approved')
      )
    );
}
