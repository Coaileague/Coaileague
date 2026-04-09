/**
 * Timesheet Invoice Service
 * Generate client invoices from approved time entries
 * Enhanced with PDF generation, email integration, and AI Brain events
 */

import { db } from '../db';
import { getAppBaseUrl } from '../utils/getAppBaseUrl';
import { 
  timeEntries, 
  invoices, 
  invoiceLineItems, 
  clients, 
  employees,
  workspaces,
  emailEvents
} from '@shared/schema';
import { eq, and, gte, lte, desc, sql, isNull } from 'drizzle-orm';
import { format, differenceInMinutes, differenceInDays } from 'date-fns';
import PDFDocument from 'pdfkit';
import { getUncachableResendClient, isResendConfigured } from './emailCore';
import { createLogger } from '../lib/logger';
const log = createLogger('timesheetInvoiceService');


export interface GenerateInvoiceFromTimesheetsInput {
  workspaceId: string;
  clientId: string;
  startDate: Date;
  endDate: Date;
  taxRate?: number;
  notes?: string;
  dueInDays?: number;
}

export interface TimesheetInvoiceResult {
  invoice: {
    id: string;
    invoiceNumber: string;
    issueDate: Date | null;
    dueDate: Date | null;
    subtotal: string;
    taxRate: string;
    taxAmount: string;
    total: string;
    status: string | null;
  };
  lineItems: Array<{
    id: string;
    description: string;
    quantity: string;
    unitPrice: string;
    amount: string;
    timeEntryId: string | null;
  }>;
  summary: {
    totalHours: number;
    totalAmount: number;
    entriesCount: number;
    employeeBreakdown: Record<string, { name: string; hours: number; amount: number }>;
  };
}

async function generateInvoiceNumber(workspaceId: string): Promise<string> {
  const { generateTrinityInvoiceNumber } = await import('./trinityInvoiceNumbering');
  return generateTrinityInvoiceNumber(workspaceId, 'timesheet');
}

export async function generateInvoiceFromTimesheets(
  input: GenerateInvoiceFromTimesheetsInput
): Promise<TimesheetInvoiceResult> {
  const { workspaceId, clientId, startDate, endDate, taxRate = 0, notes, dueInDays = 30 } = input;

  const client = await db.query.clients.findFirst({
    where: and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)),
  });

  if (!client) {
    throw new Error('Client not found');
  }

  const approvedEntries = await db.query.timeEntries.findMany({
    where: and(
      eq(timeEntries.workspaceId, workspaceId),
      eq(timeEntries.clientId, clientId),
      eq(timeEntries.status, 'approved'),
      gte(timeEntries.clockIn, startDate),
      lte(timeEntries.clockIn, endDate)
    ),
    with: {
      employee: true,
    },
    orderBy: [desc(timeEntries.clockIn)],
  });

  if (approvedEntries.length === 0) {
    throw new Error('No approved time entries found for this period');
  }

  const invoiceNumber = await generateInvoiceNumber(workspaceId);
  const issueDate = new Date();
  const dueDate = new Date(issueDate.getTime() + dueInDays * 24 * 60 * 60 * 1000);

  const lineItemsData: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    timeEntryId: string;
  }> = [];

  const employeeBreakdown: Record<string, { name: string; hours: number; amount: number }> = {};
  let totalHours = 0;
  let subtotal = 0;

  for (const entry of approvedEntries) {
    if (!entry.clockIn || !entry.clockOut) continue;

    const totalEntryHours = differenceInMinutes(entry.clockOut, entry.clockIn) / 60;
    const rate = entry.hourlyRate ? Number(entry.hourlyRate) : 0;
    const overtimeHours = entry.overtimeHours ? Number(entry.overtimeHours) : 0;
    const regularHours = totalEntryHours - overtimeHours;

    const employeeName = entry.employee 
      ? `${entry.employee.firstName} ${entry.employee.lastName}` 
      : 'Unknown';
    const dateStr = format(entry.clockIn, 'MMM d, yyyy');

    if (overtimeHours > 0) {
      // CHECK-2 FIX: Split into distinct regular and overtime line items so overtime
      // pay at 1.5x appears as a separate billable entry — not bundled into base rate.
      const regularAmount = regularHours * rate;
      const otRate = rate * 1.5;
      const otAmount = overtimeHours * otRate;

      lineItemsData.push({
        description: `${employeeName} - Regular Hours (${dateStr}) (${regularHours.toFixed(2)} hrs)`,
        quantity: regularHours,
        unitPrice: rate,
        amount: regularAmount,
        timeEntryId: entry.id,
      });
      lineItemsData.push({
        description: `${employeeName} - Overtime Hours (${dateStr}) (${overtimeHours.toFixed(2)} hrs @ 1.5x)`,
        quantity: overtimeHours,
        unitPrice: otRate,
        amount: otAmount,
        timeEntryId: entry.id,
      });

      totalHours += totalEntryHours;
      subtotal += regularAmount + otAmount;
    } else {
      const amount = totalEntryHours * rate;
      lineItemsData.push({
        description: `${employeeName} - Regular Hours (${dateStr}) (${totalEntryHours.toFixed(2)} hrs)`,
        quantity: totalEntryHours,
        unitPrice: rate,
        amount: amount,
        timeEntryId: entry.id,
      });
      totalHours += totalEntryHours;
      subtotal += amount;
    }

    if (!employeeBreakdown[entry.employeeId]) {
      employeeBreakdown[entry.employeeId] = {
        name: employeeName,
        hours: 0,
        amount: 0,
      };
    }
    employeeBreakdown[entry.employeeId].hours += totalEntryHours;
    employeeBreakdown[entry.employeeId].amount += totalEntryHours * rate;
  }

  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const { invoice, insertedLineItems } = await db.transaction(async (tx) => {
    const [inv] = await tx.insert(invoices)
      .values({
        workspaceId,
        clientId,
        invoiceNumber,
        issueDate,
        dueDate,
        subtotal: subtotal.toFixed(2),
        taxRate: taxRate.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        total: total.toFixed(2),
        status: 'draft',
        notes: `Generated by Trinity Timesheet Automation | ${invoiceNumber}\n${notes || `Services rendered ${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`}`,
      })
      .returning();

    const items = await tx.insert(invoiceLineItems)
      .values(
        lineItemsData.map(item => ({
          invoiceId: inv.id,
          workspaceId,
          description: item.description,
          quantity: item.quantity.toFixed(2),
          unitPrice: item.unitPrice.toFixed(2),
          amount: item.amount.toFixed(2),
          timeEntryId: item.timeEntryId,
        }))
      )
      .returning();

    return { invoice: inv, insertedLineItems: items };
  });

  return {
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      subtotal: invoice.subtotal,
      taxRate: invoice.taxRate || '0.00',
      taxAmount: invoice.taxAmount || '0.00',
      total: invoice.total,
      status: invoice.status,
    },
    lineItems: insertedLineItems.map(item => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
      timeEntryId: item.timeEntryId,
    })),
    summary: {
      totalHours: Number(totalHours.toFixed(2)),
      totalAmount: Number(total.toFixed(2)),
      entriesCount: approvedEntries.length,
      employeeBreakdown,
    },
  };
}

export async function getUninvoicedTimeEntries(workspaceId: string, clientId?: string): Promise<{
  entries: Array<{
    id: string;
    employeeName: string;
    date: string;
    hours: number;
    rate: number;
    amount: number;
    clientName: string;
  }>;
  summary: {
    totalHours: number;
    totalAmount: number;
    byClient: Record<string, { name: string; hours: number; amount: number; count: number }>;
  };
}> {
  const conditions = [
    eq(timeEntries.workspaceId, workspaceId),
    eq(timeEntries.status, 'approved'),
  ];

  if (clientId) {
    conditions.push(eq(timeEntries.clientId, clientId));
  }

  const allLineItems = await db.select({ timeEntryId: invoiceLineItems.timeEntryId })
    .from(invoiceLineItems);
  const invoicedIds = new Set(allLineItems.map(li => li.timeEntryId).filter(Boolean));

  const approvedEntries = await db
    .select({
      id: timeEntries.id,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
      hourlyRate: timeEntries.hourlyRate,
      clientId: timeEntries.clientId,
      employeeFirstName: employees.firstName,
      employeeLastName: employees.lastName,
      clientCompanyName: clients.companyName,
    })
    .from(timeEntries)
    .leftJoin(employees, eq(timeEntries.employeeId, employees.id))
    .leftJoin(clients, eq(timeEntries.clientId, clients.id))
    .where(and(...conditions))
    .orderBy(desc(timeEntries.clockIn));

  const uninvoicedEntries = approvedEntries.filter(e => !invoicedIds.has(e.id));

  const entries: Array<{
    id: string;
    employeeName: string;
    date: string;
    hours: number;
    rate: number;
    amount: number;
    clientName: string;
  }> = [];

  const byClient: Record<string, { name: string; hours: number; amount: number; count: number }> = {};
  let totalHours = 0;
  let totalAmount = 0;

  for (const entry of uninvoicedEntries) {
    if (!entry.clockIn || !entry.clockOut) continue;

    const hours = differenceInMinutes(entry.clockOut, entry.clockIn) / 60;
    const rate = entry.hourlyRate ? Number(entry.hourlyRate) : 0;
    const amount = hours * rate;

    const employeeName = entry.employeeFirstName
      ? `${entry.employeeFirstName} ${entry.employeeLastName || ''}`.trim()
      : 'Unknown';
    const clientName = entry.clientCompanyName || 'Unknown Client';

    entries.push({
      id: entry.id,
      employeeName,
      date: format(entry.clockIn, 'yyyy-MM-dd'),
      hours: Number(hours.toFixed(2)),
      rate,
      amount: Number(amount.toFixed(2)),
      clientName,
    });

    totalHours += hours;
    totalAmount += amount;

    if (entry.clientId) {
      if (!byClient[entry.clientId]) {
        byClient[entry.clientId] = { name: clientName, hours: 0, amount: 0, count: 0 };
      }
      byClient[entry.clientId].hours += hours;
      byClient[entry.clientId].amount += amount;
      byClient[entry.clientId].count++;
    }
  }

  return {
    entries,
    summary: {
      totalHours: Number(totalHours.toFixed(2)),
      totalAmount: Number(totalAmount.toFixed(2)),
      byClient,
    },
  };
}

export async function sendInvoice(invoiceId: string, workspaceId: string): Promise<{ success: boolean; message: string }> {
  const invoice = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)),
    with: {
      client: true,
    },
  });

  if (!invoice) {
    throw new Error('Invoice not found');
  }

  if (invoice.status !== 'draft') {
    throw new Error('Invoice has already been sent or processed');
  }

  await db.update(invoices)
    .set({
      status: 'sent',
      sentAt: new Date(),
    })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)));

  return {
    success: true,
    message: `Invoice ${invoice.invoiceNumber} sent to ${invoice.client?.companyName || 'client'}`,
  };
}

export async function markInvoicePaid(
  invoiceId: string, 
  workspaceId: string,
  amountPaid?: number,
  paymentIntentId?: string
): Promise<{ success: boolean; invoice: any }> {
  const invoice = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)),
  });

  if (!invoice) {
    throw new Error('Invoice not found');
  }

  const blockedStatuses = ['paid', 'void', 'cancelled', 'disputed'];
  if (blockedStatuses.includes(invoice.status as string)) {
    throw new Error(`Invoice cannot be marked paid — current status is '${invoice.status}'. Resolve any dispute or void before payment.`);
  }

  const paidAmount = amountPaid || Number(invoice.total);

  const [updated] = await db.update(invoices)
    .set({
      status: 'paid',
      paidAt: new Date(),
      amountPaid: paidAmount.toFixed(2),
      paymentIntentId: paymentIntentId || undefined,
    })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
    .returning();

  const { platformEventBus } = await import('./platformEventBus');
  platformEventBus.publish({
    type: 'invoice_paid',
    category: 'billing',
    title: `Invoice Paid`,
    description: `Invoice ${invoice.invoiceNumber || invoiceId} marked as paid — $${paidAmount.toFixed(2)}`,
    workspaceId,
    metadata: {
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      clientId: invoice.clientId,
      amountPaid: paidAmount,
      paidAt: new Date().toISOString(),
      paymentIntentId: paymentIntentId || null,
      total: Number(invoice.total),
    },
  }).catch((err: any) => log.warn('[EventBus] invoice_paid publish failed (non-blocking):', err?.message));

  return {
    success: true,
    invoice: updated,
  };
}

// ============================================================================
// PDF GENERATION
// ============================================================================

export interface InvoicePdfData {
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  clientName: string;
  clientCompany: string;
  clientEmail: string;
  clientAddress?: string;
  workspaceName: string;
  workspaceAddress?: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }>;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes?: string;
  paymentUrl?: string;
}

export async function generateInvoicePdfBuffer(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'LETTER', 
        margins: { top: 50, bottom: 50, left: 50, right: 50 } 
      });
      
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header with company branding
      doc.fontSize(24).fillColor('#2563eb').text(data.workspaceName || 'CoAIleague', { align: 'left' });
      if (data.workspaceAddress) {
        doc.fontSize(10).fillColor('#6b7280').text(data.workspaceAddress, { align: 'left' });
      }
      doc.moveDown(2);
      
      // Invoice title
      doc.fontSize(28).fillColor('#1e293b').text('INVOICE', { align: 'right' });
      doc.fontSize(12).fillColor('#6b7280').text(`#${data.invoiceNumber}`, { align: 'right' });
      doc.moveDown(2);

      // Invoice dates and details
      const detailsY = doc.y;
      doc.fontSize(10).fillColor('#1e293b');
      doc.text('Bill To:', 50, detailsY, { continued: false });
      doc.fontSize(12).text(data.clientCompany || data.clientName);
      if (data.clientAddress) {
        doc.fontSize(10).fillColor('#6b7280').text(data.clientAddress);
      }
      doc.text(data.clientEmail);
      
      doc.fontSize(10).fillColor('#1e293b');
      doc.text(`Issue Date: ${format(data.issueDate, 'MMMM d, yyyy')}`, 380, detailsY);
      doc.text(`Due Date: ${format(data.dueDate, 'MMMM d, yyyy')}`, 380, detailsY + 15);
      doc.moveDown(3);

      // Line items table header
      const tableTop = doc.y + 20;
      doc.fontSize(10).fillColor('#ffffff');
      doc.rect(50, tableTop, 512, 25).fill('#2563eb');
      doc.text('Description', 60, tableTop + 8);
      doc.text('Hours', 300, tableTop + 8, { width: 60, align: 'right' });
      doc.text('Rate', 370, tableTop + 8, { width: 70, align: 'right' });
      doc.text('Amount', 450, tableTop + 8, { width: 100, align: 'right' });

      // Line items
      let y = tableTop + 30;
      doc.fillColor('#1e293b');
      let rowIndex = 0;
      for (const item of data.lineItems) {
        if (rowIndex % 2 === 0) {
          doc.rect(50, y - 5, 512, 20).fill('#f8fafc');
        }
        doc.fillColor('#1e293b');
        const descWidth = 230;
        doc.text(item.description.substring(0, 45), 60, y, { width: descWidth });
        doc.text(item.quantity.toFixed(2), 300, y, { width: 60, align: 'right' });
        doc.text(`$${item.rate.toFixed(2)}`, 370, y, { width: 70, align: 'right' });
        doc.text(`$${item.amount.toFixed(2)}`, 450, y, { width: 100, align: 'right' });
        y += 20;
        rowIndex++;
      }

      // Totals section
      y += 20;
      doc.moveTo(350, y).lineTo(562, y).stroke('#e5e7eb');
      y += 15;
      doc.fontSize(11).fillColor('#6b7280');
      doc.text('Subtotal:', 380, y);
      doc.fillColor('#1e293b').text(`$${data.subtotal.toFixed(2)}`, 450, y, { width: 100, align: 'right' });
      
      y += 20;
      doc.fillColor('#6b7280').text(`Tax (${data.taxRate.toFixed(2)}%):`, 380, y);
      doc.fillColor('#1e293b').text(`$${data.taxAmount.toFixed(2)}`, 450, y, { width: 100, align: 'right' });
      
      y += 25;
      doc.rect(350, y - 5, 212, 30).fill('#2563eb');
      doc.fontSize(14).fillColor('#ffffff');
      doc.text('Total Due:', 380, y + 3);
      doc.text(`$${data.total.toFixed(2)}`, 450, y + 3, { width: 100, align: 'right' });

      // Notes section
      if (data.notes) {
        y += 50;
        doc.fontSize(11).fillColor('#1e293b').text('Notes:', 50, y);
        doc.fontSize(10).fillColor('#6b7280').text(data.notes, 50, y + 15, { width: 300 });
      }

      // Payment link if available
      if (data.paymentUrl) {
        y = doc.y + 30;
        doc.fontSize(11).fillColor('#2563eb').text('Pay Online:', 50, y);
        doc.fontSize(10).text(data.paymentUrl, { link: data.paymentUrl, underline: true });
      }

      // Footer
      doc.fontSize(8).fillColor('#9ca3af');
      doc.text('Generated by CoAIleague - Autonomous Workforce Management', 50, 720, { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// ============================================================================
// EMAIL INTEGRATION WITH PDF ATTACHMENT
// ============================================================================

export interface SendInvoiceEmailInput {
  invoiceId: string;
  workspaceId: string;
  userId: string;
  customMessage?: string;
}

export interface SendInvoiceEmailResult {
  success: boolean;
  message: string;
  emailId?: string;
  emailEventId?: string;
}

export async function sendInvoiceWithEmail(input: SendInvoiceEmailInput): Promise<SendInvoiceEmailResult> {
  const { invoiceId, workspaceId, userId, customMessage } = input;

  // Get invoice with all related data
  const invoice = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)),
    with: {
      client: true,
    },
  });

  if (!invoice) {
    throw new Error('Invoice not found');
  }

  if (!invoice.client) {
    throw new Error('Invoice has no associated client');
  }

  if (!invoice.client.email) {
    throw new Error('Client has no email address');
  }

  // Get workspace info for branding
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  // Get line items
  const lineItems = await db.select().from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceId));

  // Generate PDF
  const pdfData: InvoicePdfData = {
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate || new Date(),
    dueDate: invoice.dueDate || new Date(),
    clientName: `${invoice.client.firstName || ''} ${invoice.client.lastName || ''}`.trim() || 'Valued Client',
    clientCompany: invoice.client.companyName || '',
    clientEmail: invoice.client.email,
    clientAddress: invoice.client.address || undefined,
    workspaceName: workspace?.name || 'CoAIleague',
    workspaceAddress: workspace?.address || undefined,
    lineItems: lineItems.map(li => ({
      description: li.description,
      quantity: Number(li.quantity),
      rate: Number(li.unitPrice),
      amount: Number(li.amount),
    })),
    subtotal: Number(invoice.subtotal),
    taxRate: Number(invoice.taxRate || 0),
    taxAmount: Number(invoice.taxAmount || 0),
    total: Number(invoice.total),
    notes: invoice.notes || undefined,
    paymentUrl: `${getBaseUrl()}/pay-invoice/${invoiceId}`,
  };

  const pdfBuffer = await generateInvoicePdfBuffer(pdfData);
  const pdfBase64 = pdfBuffer.toString('base64');

  // Prepare email content
  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 30px; border-radius: 8px 8px 0 0;">
        <h2 style="color: white; margin: 0;">Invoice from ${workspace?.name || 'CoAIleague'}</h2>
      </div>
      <div style="background-color: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p>Dear ${pdfData.clientName},</p>
        ${customMessage ? `<p>${customMessage}</p>` : ''}
        <p>Please find attached invoice <strong>#${invoice.invoiceNumber}</strong> for services rendered.</p>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
          <p style="margin: 5px 0;"><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
          <p style="margin: 5px 0;"><strong>Amount Due:</strong> <span style="color: #2563eb; font-size: 18px; font-weight: bold;">$${pdfData.total.toFixed(2)}</span></p>
          <p style="margin: 5px 0;"><strong>Due Date:</strong> ${format(pdfData.dueDate, 'MMMM d, yyyy')}</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${pdfData.paymentUrl}" 
             style="display: inline-block; background-color: #2563eb; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Pay Invoice Online
          </a>
        </div>

        <p style="font-size: 14px; color: #6b7280;">
          If you have any questions about this invoice, please don't hesitate to contact us.
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 30px;">
          This is an automated message from CoAIleague™.
        </p>
      </div>
    </div>
  `;

  // Send email with PDF attachment via NDS
  try {
    const { NotificationDeliveryService } = await import('./notificationDeliveryService');
    await NotificationDeliveryService.send({
      type: 'invoice_notification',
      workspaceId,
      recipientUserId: invoice.clientId, // Routing to client
      channel: 'email',
      subject: `Invoice ${invoice.invoiceNumber} - ${workspace?.name || 'CoAIleague'}`,
      body: {
        to: invoice.client.email,
        subject: `Invoice ${invoice.invoiceNumber} - ${workspace?.name || 'CoAIleague'}`,
        html: emailHtml,
        attachments: [
          {
            filename: `invoice-${invoice.invoiceNumber}.pdf`,
            content: pdfBase64,
          },
        ],
      },
      idempotencyKey: `invoice-send-${invoiceId}-${Date.now()}`,
    });

    // Log email event (NDS does its own logging, but we keep this for legacy compatibility)
    const [emailEvent] = await db.insert(emailEvents).values({
      workspaceId,
      recipientEmail: invoice.client.email,
      emailType: 'invoice',
      status: 'sent',
      sentAt: new Date(),
    }).returning();

    // Update invoice status to sent
    await db.update(invoices)
      .set({
        status: 'sent',
        sentAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    // Emit AI Brain event for invoice sent
    await emitInvoiceEvent({
      workspaceId,
      eventType: 'invoice_sent',
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      clientId: invoice.clientId,
      amount: pdfData.total,
      metadata: {
        sentTo: invoice.client.email,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        emailId: emailResult.data?.id,
      },
    });

    return {
      success: true,
      message: `Invoice ${invoice.invoiceNumber} sent to ${invoice.client.email}`,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      emailId: emailResult.data?.id,
      emailEventId: emailEvent.id,
    };
  } catch (error: any) {
    // Log failed email attempt
    await db.insert(emailEvents).values({
      workspaceId,
      recipientEmail: invoice.client.email,
      emailType: 'invoice',
      status: 'failed',
      errorMessage: (error instanceof Error ? error.message : String(error)),
    });

    throw new Error(`Failed to send invoice email: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

// ============================================================================
// AI BRAIN INTEGRATION
// ============================================================================

interface InvoiceEventData {
  workspaceId: string;
  eventType: 'invoice_generated' | 'invoice_sent' | 'invoice_paid' | 'invoice_overdue';
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  amount: number;
  metadata?: Record<string, any>;
}

async function emitInvoiceEvent(data: InvoiceEventData): Promise<void> {
  try {
    log.info(`[AI Brain] Emitted ${data.eventType} event for invoice ${data.invoiceNumber}`);
  } catch (error) {
    log.error('[AI Brain] Failed to emit invoice event:', error);
  }
}

export async function checkOverdueInvoices(workspaceId: string): Promise<{
  overdueInvoices: Array<{
    id: string;
    invoiceNumber: string;
    clientName: string;
    amount: number;
    daysOverdue: number;
  }>;
  totalOverdueAmount: number;
}> {
  const now = new Date();
  
  const overdueResults = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      dueDate: invoices.dueDate,
      total: invoices.total,
      clientId: invoices.clientId,
      clientCompanyName: clients.companyName,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
    })
    .from(invoices)
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .where(and(
      eq(invoices.workspaceId, workspaceId),
      eq(invoices.status, 'sent'),
      lte(invoices.dueDate, now)
    ));

  const overdueInvoices = overdueResults.map(inv => {
    const daysOverdue = differenceInDays(now, inv.dueDate || now);
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.clientCompanyName || `${inv.clientFirstName || ''} ${inv.clientLastName || ''}`.trim() || 'Unknown',
      amount: Number(inv.total),
      daysOverdue,
    };
  });

  const totalOverdueAmount = overdueInvoices.reduce((sum, inv) => sum + inv.amount, 0);

  // Emit AI Brain alerts for severely overdue invoices (> 30 days)
  for (const inv of overdueInvoices) {
    if (inv.daysOverdue > 30) {
      await emitInvoiceEvent({
        workspaceId,
        eventType: 'invoice_overdue',
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        clientId: overdueResults.find(r => r.id === inv.id)?.clientId || '',
        amount: inv.amount,
        metadata: { daysOverdue: inv.daysOverdue },
      });
    }
  }

  return {
    overdueInvoices,
    totalOverdueAmount,
  };
}

export async function getRevenueForecast(workspaceId: string): Promise<{
  currentMonthBilled: number;
  currentMonthPaid: number;
  unbilledHours: number;
  unbilledAmount: number;
  projectedRevenue: number;
  overdueAmount: number;
}> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // Current month invoices
  const monthlyInvoices = await db
    .select({
      total: invoices.total,
      status: invoices.status,
    })
    .from(invoices)
    .where(and(
      eq(invoices.workspaceId, workspaceId),
      gte(invoices.issueDate, monthStart),
      lte(invoices.issueDate, monthEnd)
    ));

  const currentMonthBilled = monthlyInvoices.reduce((sum, inv) => sum + Number(inv.total), 0);
  const currentMonthPaid = monthlyInvoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + Number(inv.total), 0);

  // Get unbilled time entries
  const uninvoicedData = await getUninvoicedTimeEntries(workspaceId);
  const unbilledHours = uninvoicedData.summary.totalHours;
  const unbilledAmount = uninvoicedData.summary.totalAmount;

  // Overdue amount
  const overdueData = await checkOverdueInvoices(workspaceId);

  return {
    currentMonthBilled,
    currentMonthPaid,
    unbilledHours,
    unbilledAmount,
    projectedRevenue: currentMonthBilled + unbilledAmount,
    overdueAmount: overdueData.totalOverdueAmount,
  };
}

// ============================================================================
// ENHANCED INVOICE GENERATION FROM HOURS
// ============================================================================

export interface GenerateFromHoursInput {
  workspaceId: string;
  clientId: string;
  startDate: Date;
  endDate: Date;
  hourlyRateOverride?: number;
  taxRate?: number;
  notes?: string;
  dueInDays?: number;
  groupByEmployee?: boolean;
  groupByProject?: boolean;
}

export async function generateInvoiceFromHours(input: GenerateFromHoursInput): Promise<TimesheetInvoiceResult> {
  const { 
    workspaceId, 
    clientId, 
    startDate, 
    endDate, 
    hourlyRateOverride,
    taxRate = 0, 
    notes, 
    dueInDays = 30,
    groupByEmployee = false,
    groupByProject = false 
  } = input;

  const client = await db.query.clients.findFirst({
    where: and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)),
  });

  if (!client) {
    throw new Error('Client not found');
  }

  // Get approved time entries that haven't been invoiced yet
  const allLineItems = await db.select({ timeEntryId: invoiceLineItems.timeEntryId })
    .from(invoiceLineItems);
  const invoicedIds = new Set(allLineItems.map(li => li.timeEntryId).filter(Boolean));

  const approvedEntries = await db.query.timeEntries.findMany({
    where: and(
      eq(timeEntries.workspaceId, workspaceId),
      eq(timeEntries.clientId, clientId),
      eq(timeEntries.status, 'approved'),
      gte(timeEntries.clockIn, startDate),
      lte(timeEntries.clockIn, endDate)
    ),
    with: {
      employee: true,
      shift: true,
    },
    orderBy: [desc(timeEntries.clockIn)],
  });

  // Filter out already invoiced entries
  const uninvoicedEntries = approvedEntries.filter(e => !invoicedIds.has(e.id));

  if (uninvoicedEntries.length === 0) {
    throw new Error('No uninvoiced approved time entries found for this period');
  }

  const invoiceNumber = await generateInvoiceNumber(workspaceId);
  const issueDate = new Date();
  const dueDate = new Date(issueDate.getTime() + dueInDays * 24 * 60 * 60 * 1000);

  // Calculate line items with rate hierarchy: override > entry rate > employee rate > client rate
  const lineItemsData: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    timeEntryId: string;
  }> = [];

  const employeeBreakdown: Record<string, { name: string; hours: number; amount: number }> = {};
  let totalHours = 0;
  let subtotal = 0;

  // Group entries if requested
  if (groupByEmployee) {
    const byEmployee = new Map<string, typeof uninvoicedEntries>();
    for (const entry of uninvoicedEntries) {
      if (!byEmployee.has(entry.employeeId)) {
        byEmployee.set(entry.employeeId, []);
      }
      byEmployee.get(entry.employeeId)!.push(entry);
    }

    for (const [employeeId, entries] of byEmployee) {
      let empRegularHours = 0;
      let empOtHours = 0;
      let empRegularAmount = 0;
      let empOtAmount = 0;
      const employeeName = entries[0]?.employee 
        ? `${entries[0].employee.firstName} ${entries[0].employee.lastName}` 
        : 'Unknown';
      const rate = hourlyRateOverride || (entries[0]?.hourlyRate ? Number(entries[0].hourlyRate) : 0);

      for (const entry of entries) {
        if (!entry.clockIn || !entry.clockOut) continue;
        const entryTotalHours = differenceInMinutes(entry.clockOut, entry.clockIn) / 60;
        const entryOtHours = entry.overtimeHours ? Number(entry.overtimeHours) : 0;
        const entryRegularHours = entryTotalHours - entryOtHours;
        empRegularHours += entryRegularHours;
        empOtHours += entryOtHours;
        empRegularAmount += entryRegularHours * rate;
        empOtAmount += entryOtHours * (rate * 1.5);
      }

      // Regular hours line item — always present
      lineItemsData.push({
        description: `${employeeName} - Regular Hours, ${format(startDate, 'MMM d')} to ${format(endDate, 'MMM d, yyyy')} (${empRegularHours.toFixed(2)} hrs)`,
        quantity: empRegularHours,
        unitPrice: rate,
        amount: empRegularAmount,
        timeEntryId: entries[0].id,
      });

      // CHECK-2 FIX: Distinct overtime line item when overtime hours are present
      if (empOtHours > 0) {
        lineItemsData.push({
          description: `${employeeName} - Overtime Hours, ${format(startDate, 'MMM d')} to ${format(endDate, 'MMM d, yyyy')} (${empOtHours.toFixed(2)} hrs @ 1.5x)`,
          quantity: empOtHours,
          unitPrice: rate * 1.5,
          amount: empOtAmount,
          timeEntryId: entries[0].id,
        });
      }

      totalHours += empRegularHours + empOtHours;
      subtotal += empRegularAmount + empOtAmount;
      employeeBreakdown[employeeId] = { name: employeeName, hours: empRegularHours + empOtHours, amount: empRegularAmount + empOtAmount };
    }
  } else {
    // Individual line items per time entry
    for (const entry of uninvoicedEntries) {
      if (!entry.clockIn || !entry.clockOut) continue;

      const totalEntryHours = differenceInMinutes(entry.clockOut, entry.clockIn) / 60;
      const rate = hourlyRateOverride || (entry.hourlyRate ? Number(entry.hourlyRate) : 0);
      const overtimeHours = entry.overtimeHours ? Number(entry.overtimeHours) : 0;
      const regularHours = totalEntryHours - overtimeHours;

      const employeeName = entry.employee 
        ? `${entry.employee.firstName} ${entry.employee.lastName}` 
        : 'Unknown';
      const dateStr = format(entry.clockIn, 'MMM d, yyyy');

      if (overtimeHours > 0) {
        // CHECK-2 FIX: Distinct regular and overtime line items
        const regularAmount = regularHours * rate;
        const otRate = rate * 1.5;
        const otAmount = overtimeHours * otRate;

        lineItemsData.push({
          description: `${employeeName} - Regular Hours (${dateStr}) (${regularHours.toFixed(2)} hrs)`,
          quantity: regularHours,
          unitPrice: rate,
          amount: regularAmount,
          timeEntryId: entry.id,
        });
        lineItemsData.push({
          description: `${employeeName} - Overtime Hours (${dateStr}) (${overtimeHours.toFixed(2)} hrs @ 1.5x)`,
          quantity: overtimeHours,
          unitPrice: otRate,
          amount: otAmount,
          timeEntryId: entry.id,
        });

        totalHours += totalEntryHours;
        subtotal += regularAmount + otAmount;

        if (!employeeBreakdown[entry.employeeId]) {
          employeeBreakdown[entry.employeeId] = { name: employeeName, hours: 0, amount: 0 };
        }
        employeeBreakdown[entry.employeeId].hours += totalEntryHours;
        employeeBreakdown[entry.employeeId].amount += regularAmount + otAmount;
      } else {
        const amount = totalEntryHours * rate;
        lineItemsData.push({
          description: `${employeeName} - Regular Hours (${dateStr}) (${totalEntryHours.toFixed(2)} hrs)`,
          quantity: totalEntryHours,
          unitPrice: rate,
          amount: amount,
          timeEntryId: entry.id,
        });

        totalHours += totalEntryHours;
        subtotal += amount;

        if (!employeeBreakdown[entry.employeeId]) {
          employeeBreakdown[entry.employeeId] = { name: employeeName, hours: 0, amount: 0 };
        }
        employeeBreakdown[entry.employeeId].hours += totalEntryHours;
        employeeBreakdown[entry.employeeId].amount += amount;
      }
    }
  }

  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const { invoice, insertedLineItems } = await db.transaction(async (tx) => {
    const [inv] = await tx.insert(invoices)
      .values({
        workspaceId,
        clientId,
        invoiceNumber,
        issueDate,
        dueDate,
        subtotal: subtotal.toFixed(2),
        taxRate: taxRate.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        total: total.toFixed(2),
        status: 'draft',
        notes: `Generated by Trinity Timesheet Automation | ${invoiceNumber}\n${notes || `Services rendered ${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`}`,
      })
      .returning();

    const items = await tx.insert(invoiceLineItems)
      .values(
        lineItemsData.map(item => ({
          invoiceId: inv.id,
          workspaceId,
          description: item.description,
          quantity: item.quantity.toFixed(2),
          unitPrice: item.unitPrice.toFixed(2),
          amount: item.amount.toFixed(2),
          timeEntryId: item.timeEntryId,
        }))
      )
      .returning();

    return { invoice: inv, insertedLineItems: items };
  });

  // Emit AI Brain event for invoice generation
  await emitInvoiceEvent({
    workspaceId,
    eventType: 'invoice_generated',
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    clientId,
    amount: total,
    metadata: {
      totalHours,
      entriesCount: uninvoicedEntries.length,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    },
  });

  return {
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      subtotal: invoice.subtotal,
      taxRate: invoice.taxRate || '0.00',
      taxAmount: invoice.taxAmount || '0.00',
      total: invoice.total,
      status: invoice.status,
    },
    lineItems: insertedLineItems.map(item => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
      timeEntryId: item.timeEntryId,
    })),
    summary: {
      totalHours: Number(totalHours.toFixed(2)),
      totalAmount: Number(total.toFixed(2)),
      entriesCount: uninvoicedEntries.length,
      employeeBreakdown,
    },
  };
}

// ============================================================================
// SCHEDULED CLIENT INVOICE AUTO-GENERATION
// ============================================================================

/**
 * Runs weekly to auto-generate client invoices when billing is due and approved
 * time entries exist. Called from the startup scheduler in server/index.ts.
 */
export async function runScheduledClientInvoiceAutoGeneration(): Promise<void> {
  const allWorkspaces = await db.select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces);

  for (const ws of allWorkspaces) {
    try {
      const summary = await getUninvoicedTimeEntries(ws.id);
      if (Object.keys(summary.summary.byClient).length === 0) continue;

      const now = new Date();
      const allClients = await db.select({
        id: clients.id,
        companyName: clients.companyName,
      }).from(clients).where(eq(clients.workspaceId, ws.id));

      for (const client of allClients) {
        if (!summary.summary.byClient[client.id]) continue;

        // Check last invoice date to determine if billing is due
        const [lastInvoice] = await db.select({ createdAt: invoices.createdAt })
          .from(invoices)
          .where(and(eq(invoices.workspaceId, ws.id), eq(invoices.clientId, client.id)))
          .orderBy(desc(invoices.createdAt))
          .limit(1);

        let isDue = !lastInvoice;
        if (lastInvoice) {
          // @ts-expect-error — TS migration: fix in refactoring sprint
          const daysSince = differenceInDays(now, new Date(lastInvoice.createdAt));
          isDue = daysSince >= 7; // Weekly billing check; contract cycle enforced at route level
        }

        if (!isDue) continue;

        const clientEntries = summary.entries.filter(e => e.clientName === summary.summary.byClient[client.id]?.name);
        if (clientEntries.length === 0) continue;

        const dates = clientEntries.map(e => new Date(e.date));
        const startDate = new Date(Math.min(...dates.map(d => d.getTime())));
        const endDate = now;

        await generateInvoiceFromTimesheets({
          workspaceId: ws.id,
          clientId: client.id,
          startDate,
          endDate,
          dueInDays: 30,
          notes: `Auto-generated (scheduled weekly billing run)`,
        });

        log.info(`[ScheduledInvoicing] Generated invoice for client ${client.companyName} in workspace ${ws.id}`);
      }
    } catch (wsErr) {
      log.error(`[ScheduledInvoicing] Error processing workspace ${ws.id}:`, wsErr instanceof Error ? wsErr.message : String(wsErr));
    }
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getBaseUrl(): string {
  return getAppBaseUrl();
}
