/**
 * Timesheet Invoice Service
 * Generate client invoices from approved time entries
 */

import { db } from '../db';
import { 
  timeEntries, 
  invoices, 
  invoiceLineItems, 
  clients, 
  employees,
  workspaces 
} from '@shared/schema';
import { eq, and, gte, lte, desc, sql, isNull } from 'drizzle-orm';
import { format, differenceInMinutes } from 'date-fns';

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
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  
  const lastInvoice = await db.query.invoices.findFirst({
    where: eq(invoices.workspaceId, workspaceId),
    orderBy: [desc(invoices.createdAt)],
  });

  let sequence = 1;
  if (lastInvoice?.invoiceNumber) {
    const match = lastInvoice.invoiceNumber.match(/-(\d+)$/);
    if (match) {
      sequence = parseInt(match[1], 10) + 1;
    }
  }

  return `INV-${year}${month}-${String(sequence).padStart(4, '0')}`;
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

    const hours = differenceInMinutes(entry.clockOut, entry.clockIn) / 60;
    const rate = entry.hourlyRate ? Number(entry.hourlyRate) : 0;
    const amount = hours * rate;

    const employeeName = entry.employee 
      ? `${entry.employee.firstName} ${entry.employee.lastName}` 
      : 'Unknown';
    const dateStr = format(entry.clockIn, 'MMM d, yyyy');

    lineItemsData.push({
      description: `${employeeName} - ${dateStr} (${hours.toFixed(2)} hrs)`,
      quantity: hours,
      unitPrice: rate,
      amount: amount,
      timeEntryId: entry.id,
    });

    totalHours += hours;
    subtotal += amount;

    if (!employeeBreakdown[entry.employeeId]) {
      employeeBreakdown[entry.employeeId] = {
        name: employeeName,
        hours: 0,
        amount: 0,
      };
    }
    employeeBreakdown[entry.employeeId].hours += hours;
    employeeBreakdown[entry.employeeId].amount += amount;
  }

  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const [invoice] = await db.insert(invoices)
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
      notes: notes || `Services rendered ${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`,
    })
    .returning();

  const insertedLineItems = await db.insert(invoiceLineItems)
    .values(
      lineItemsData.map(item => ({
        invoiceId: invoice.id,
        description: item.description,
        quantity: item.quantity.toFixed(2),
        unitPrice: item.unitPrice.toFixed(2),
        amount: item.amount.toFixed(2),
        timeEntryId: item.timeEntryId,
      }))
    )
    .returning();

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

  const approvedEntries = await db.query.timeEntries.findMany({
    where: and(...conditions),
    with: {
      employee: true,
      client: true,
    },
    orderBy: [desc(timeEntries.clockIn)],
  });

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

    const employeeName = entry.employee 
      ? `${entry.employee.firstName} ${entry.employee.lastName}` 
      : 'Unknown';
    const clientName = entry.client?.companyName || 'Unknown Client';

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

  return {
    success: true,
    invoice: updated,
  };
}
