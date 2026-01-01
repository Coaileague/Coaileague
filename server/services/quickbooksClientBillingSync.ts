/**
 * QuickBooks Client Billing Sync
 * ==============================
 * Syncs CoAIleague invoices to QuickBooks automatically.
 * Completes the billing automation loop:
 * 
 * Time Entries → Invoice Generation → QuickBooks Sync → Email to Client
 * 
 * Core Value Prop: "Automated payroll → QuickBooks sync. Zero manual data entry."
 */

import { db } from '../db';
import { invoices, clients, workspaces, integrationCredentials } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { platformEventBus } from './platformEventBus';

interface QuickBooksInvoice {
  CustomerRef: { value: string };
  Line: Array<{
    Amount: number;
    DetailType: string;
    SalesItemLineDetail: {
      ItemRef: { value: string };
      Qty: number;
      UnitPrice: number;
      Description: string;
    };
  }>;
  DueDate: string;
  TxnDate: string;
  DocNumber: string;
}

interface SyncResult {
  success: boolean;
  qbInvoiceId?: string;
  error?: string;
  retryable?: boolean;
}

/**
 * Get QuickBooks OAuth client for a workspace
 */
async function getQuickBooksClient(workspaceId: string): Promise<any | null> {
  const credentials = await db.query.integrationCredentials.findFirst({
    where: and(
      eq(integrationCredentials.workspaceId, workspaceId),
      eq(integrationCredentials.provider, 'quickbooks')
    ),
  });

  if (!credentials?.accessToken) {
    console.log('[QBSync] No QuickBooks credentials found for workspace');
    return null;
  }

  return {
    accessToken: credentials.accessToken,
    refreshToken: credentials.refreshToken,
    realmId: credentials.realmId || (credentials as any).companyId,
    expiresAt: credentials.expiresAt,
  };
}

/**
 * Make authenticated request to QuickBooks API
 */
async function qbRequest(
  client: any,
  method: string,
  endpoint: string,
  body?: any
): Promise<any> {
  const baseUrl = `https://quickbooks.api.intuit.com/v3/company/${client.realmId}`;
  
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${client.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`QuickBooks API error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Sync a CoAIleague invoice to QuickBooks
 */
export async function syncInvoiceToQuickBooks(invoiceId: string): Promise<SyncResult> {
  console.log(`[QBSync] Syncing invoice ${invoiceId} to QuickBooks...`);

  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
  });

  if (!invoice) {
    return { success: false, error: 'Invoice not found' };
  }

  const qbClient = await getQuickBooksClient(invoice.workspaceId);

  if (!qbClient) {
    return { success: false, error: 'QuickBooks not connected', retryable: true };
  }

  const client = await db.query.clients.findFirst({
    where: eq(clients.id, invoice.clientId),
  });

  if (!client) {
    return { success: false, error: 'Client not found' };
  }

  const qbCustomerId = (client as any).quickbooksCustomerId || (client as any).qbCustomerId;

  if (!qbCustomerId) {
    console.log(`[QBSync] Client ${client.id} not mapped to QuickBooks - skipping sync`);
    return { success: false, error: 'Client not mapped to QuickBooks', retryable: false };
  }

  const lineItems = (invoice.lineItems as any[]) || [];
  
  const qbInvoice: QuickBooksInvoice = {
    CustomerRef: { value: qbCustomerId },
    Line: lineItems.map((item) => ({
      Amount: item.amount || item.total || 0,
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        ItemRef: { value: item.qbItemId || '1' },
        Qty: item.hours || item.quantity || 1,
        UnitPrice: item.rate || item.unitPrice || 0,
        Description: item.description || `${item.employeeName || 'Employee'} - ${item.siteName || 'Site'} - ${item.date || ''}`,
      },
    })),
    DueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().split('T')[0] : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    TxnDate: invoice.createdAt ? new Date(invoice.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    DocNumber: invoice.invoiceNumber || `INV-${invoice.id.slice(0, 8)}`,
  };

  if (qbInvoice.Line.length === 0) {
    qbInvoice.Line = [
      {
        Amount: Number(invoice.total) || 0,
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          ItemRef: { value: '1' },
          Qty: 1,
          UnitPrice: Number(invoice.total) || 0,
          Description: `Security services - ${invoice.periodStart || 'Current period'}`,
        },
      },
    ];
  }

  try {
    const qbResponse = await qbRequest(qbClient, 'POST', '/invoice', { Invoice: qbInvoice });

    const qbInvoiceId = qbResponse.Invoice?.Id;

    await db.update(invoices)
      .set({
        quickbooksInvoiceId: qbInvoiceId,
        quickbooksSyncStatus: 'synced',
        quickbooksSyncedAt: new Date(),
      } as any)
      .where(eq(invoices.id, invoiceId));

    await platformEventBus.publish({
      type: 'automation_completed',
      category: 'ai_brain',
      title: 'Invoice Synced to QuickBooks',
      description: `Invoice ${invoice.invoiceNumber || invoiceId} synced to QuickBooks successfully`,
      workspaceId: invoice.workspaceId,
      metadata: {
        automationType: 'quickbooks_sync',
        invoiceId,
        qbInvoiceId,
        amount: invoice.total,
        clientName: client.companyName || client.name,
      },
    });

    console.log(`[QBSync] Invoice ${invoiceId} synced as QB Invoice ${qbInvoiceId}`);

    return { success: true, qbInvoiceId };

  } catch (error: any) {
    console.error(`[QBSync] Failed to sync invoice ${invoiceId}:`, error.message);

    await db.update(invoices)
      .set({
        quickbooksSyncStatus: 'failed',
        quickbooksSyncError: error.message,
      } as any)
      .where(eq(invoices.id, invoiceId));

    const retryable = error.message.includes('401') || error.message.includes('token');

    return { success: false, error: error.message, retryable };
  }
}

/**
 * Sync all pending invoices for a workspace
 */
export async function syncPendingInvoices(workspaceId: string): Promise<{ synced: number; failed: number }> {
  const pendingInvoices = await db.query.invoices.findMany({
    where: and(
      eq(invoices.workspaceId, workspaceId),
      eq(invoices.status, 'sent')
    ),
  });

  const unsyncedInvoices = pendingInvoices.filter(
    (inv) => !(inv as any).quickbooksInvoiceId && (inv as any).quickbooksSyncStatus !== 'synced'
  );

  let synced = 0;
  let failed = 0;

  for (const invoice of unsyncedInvoices) {
    const result = await syncInvoiceToQuickBooks(invoice.id);
    if (result.success) {
      synced++;
    } else {
      failed++;
    }
  }

  console.log(`[QBSync] Workspace ${workspaceId}: synced ${synced}, failed ${failed}`);

  return { synced, failed };
}

/**
 * Run weekly billing cycle - generate invoices and sync to QB
 */
export async function runWeeklyBillingCycle(workspaceId: string): Promise<void> {
  console.log(`[QBSync] Running weekly billing cycle for workspace ${workspaceId}`);

  const { synced, failed } = await syncPendingInvoices(workspaceId);

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  if (workspace?.ownerEmail) {
    await platformEventBus.publish({
      type: 'automation_completed',
      category: 'ai_brain',
      title: 'Weekly Billing Complete',
      description: `Trinity synced ${synced} invoices to QuickBooks${failed > 0 ? ` (${failed} failed)` : ''}`,
      workspaceId,
      metadata: {
        automationType: 'weekly_billing',
        invoicesSynced: synced,
        invoicesFailed: failed,
      },
    });
  }
}

export const quickbooksClientBillingSync = {
  syncInvoiceToQuickBooks,
  syncPendingInvoices,
  runWeeklyBillingCycle,
};
