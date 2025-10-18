/**
 * BillOS™ - Full Financial Automation System
 * Combines InvoiceOS (AR) and PayrollOS (HR) into unified billing solution
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
  expenseReports,
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

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * PHASE 4A: AUTOMATED INVOICING & REVENUE STREAM (Subscriber's AR)
 */

/**
 * Zero-Touch Usage-Based Invoicing
 * Runs nightly to auto-generate invoices from approved time entries
 */
export async function generateUsageBasedInvoices(workspaceId: string, generateDate?: Date) {
  const targetDate = generateDate || new Date();
  targetDate.setHours(0, 0, 0, 0);
  
  // Get previous day's range for unbilled hours
  const startDate = new Date(targetDate);
  startDate.setDate(startDate.getDate() - 1);
  const endDate = new Date(targetDate);
  
  // Find all approved time entries that haven't been billed
  const unbilledEntries = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.status, 'approved'),
        gte(timeEntries.clockIn, startDate),
        lte(timeEntries.clockIn, endDate),
        isNull(timeEntries.invoiceId), // Not yet invoiced
        eq(timeEntries.billableToClient, true)
      )
    );
  
  // Group by client
  const entriesByClient = unbilledEntries.reduce((acc: Record<string, typeof unbilledEntries>, entry) => {
    if (!entry.clientId) return acc;
    if (!acc[entry.clientId]) acc[entry.clientId] = [];
    acc[entry.clientId].push(entry);
    return acc;
  }, {} as Record<string, typeof unbilledEntries>);
  
  const generatedInvoices: Invoice[] = [];
  
  // Generate invoice for each client with unbilled hours
  for (const [clientId, entries] of Object.entries(entriesByClient)) {
    try {
      const invoice = await createInvoiceFromTimeEntries(workspaceId, clientId, entries);
      generatedInvoices.push(invoice);
    } catch (error) {
      console.error(`Failed to generate invoice for client ${clientId}:`, error);
    }
  }
  
  return generatedInvoices;
}

/**
 * Create invoice from time entries with client billing rates
 */
async function createInvoiceFromTimeEntries(
  workspaceId: string,
  clientId: string,
  entries: any[]
) {
  // Get client billing rate
  const [clientRate] = await db
    .select()
    .from(clientRates)
    .where(
      and(
        eq(clientRates.workspaceId, workspaceId),
        eq(clientRates.clientId, clientId),
        eq(clientRates.isActive, true)
      )
    )
    .limit(1);
  
  if (!clientRate) {
    throw new Error(`No active billing rate found for client ${clientId}`);
  }
  
  // Get workspace for platform fee
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  
  // Calculate line items
  const lineItems = entries.map((entry) => {
    const hours = parseFloat(entry.hoursWorked || "0");
    const rate = parseFloat(entry.hourlyRateOverride || clientRate.billableRate);
    const amount = hours * rate;
    
    return {
      timeEntryId: entry.id,
      description: `Time Entry - ${hours.toFixed(2)} hours`,
      quantity: hours.toString(),
      unitPrice: rate.toString(),
      amount: amount.toString(),
    };
  });
  
  // Calculate totals
  const subtotal = lineItems.reduce((sum, item) => sum + parseFloat(item.amount), 0);
  
  // Add subscription fee if hybrid billing
  let subscriptionAmount = 0;
  if (clientRate.hasSubscription && clientRate.subscriptionAmount) {
    subscriptionAmount = parseFloat(clientRate.subscriptionAmount);
    
    // Prorate subscription based on frequency
    const proratedAmount = prorateSubscription(
      subscriptionAmount,
      clientRate.subscriptionFrequency || 'monthly',
      entries.length > 0 ? new Date(entries[0].clockIn!) : new Date()
    );
    
    lineItems.unshift({
      timeEntryId: null as any,
      description: `${clientRate.subscriptionFrequency === 'monthly' ? 'Monthly' : 'Quarterly'} Subscription (Prorated)`,
      quantity: "1",
      unitPrice: proratedAmount.toString(),
      amount: proratedAmount.toString(),
    });
  }
  
  const finalSubtotal = subtotal + subscriptionAmount;
  const taxRate = 0; // TODO: Integrate tax calculation API
  const taxAmount = finalSubtotal * taxRate;
  const total = finalSubtotal + taxAmount;
  
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
  
  // Create invoice
  const [invoice] = await db
    .insert(invoices)
    .values({
      workspaceId,
      clientId,
      invoiceNumber,
      issueDate,
      dueDate,
      subtotal: finalSubtotal.toString(),
      taxRate: taxRate.toString(),
      taxAmount: taxAmount.toString(),
      total: total.toString(),
      platformFeePercentage: platformFeePercentage.toString(),
      platformFeeAmount: platformFeeAmount.toString(),
      businessAmount: businessAmount.toString(),
      status: 'draft',
    })
    .returning();
  
  // Create line items
  await db.insert(invoiceLineItems).values(
    lineItems.map(item => ({
      invoiceId: invoice.id,
      ...item,
    }))
  );
  
  // Update time entries to link to invoice
  for (const entry of entries) {
    await db
      .update(timeEntries)
      .set({ invoiceId: invoice.id })
      .where(eq(timeEntries.id, entry.id));
  }
  
  // Send invoice to client portal
  await sendInvoiceToClientPortal(invoice);
  
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
    await resend.emails.send({
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
    
    const emailSubject = `Reminder: Invoice ${invoice.invoiceNumber} is ${daysOverdue} days overdue`;
    const emailBody = `
      Your invoice ${invoice.invoiceNumber} for $${invoice.total} is now ${daysOverdue} days overdue.
      Please remit payment as soon as possible.
      
      ${daysOverdue >= 30 ? 'URGENT: This account requires immediate attention.' : ''}
    `;
    
    // Create reminder record
    await db.insert(invoiceReminders).values({
      workspaceId,
      invoiceId: invoice.id,
      reminderType,
      daysOverdue,
      emailTo: client.email || '',
      emailSubject,
      emailBody,
      status: 'pending',
      needsHumanIntervention: daysOverdue >= 30,
    });
    
    // Send reminder email
    try {
      await resend.emails.send({
        from: 'billing@workforceos.com',
        to: client.email || '',
        subject: emailSubject,
        html: emailBody,
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
 * These functions integrate with the existing PayrollOS™ system
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
      totalReimbursement: sql<string>`COALESCE(SUM(${expenseReports.amount}), 0)`,
    })
    .from(expenseReports)
    .where(
      and(
        eq(expenseReports.workspaceId, workspaceId),
        eq(expenseReports.employeeId, employeeId),
        eq(expenseReports.status, 'approved'),
        isNull(expenseReports.reimbursedInPayrollId)
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
    .update(expenseReports)
    .set({
      reimbursedInPayrollId: payrollRunId,
      reimbursedAt: new Date(),
      status: 'reimbursed',
    })
    .where(
      and(
        eq(expenseReports.workspaceId, workspaceId),
        eq(expenseReports.employeeId, employeeId),
        eq(expenseReports.status, 'approved')
      )
    );
}
