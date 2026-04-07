/**
 * QUICKBOOKS RECEIPT SERVICE - Commit Confirmation & Payload Tracking
 * ====================================================================
 * Generates receipts for Trinity's QuickBooks commits with database persistence:
 * - Invoice syncs
 * - Payroll time activity syncs
 * - Customer/Vendor syncs
 * 
 * Provides:
 * - Unique receipt IDs
 * - Payload summaries
 * - QuickBooks external IDs
 * - Trinity verification signatures
 * - Audit trail for org owners
 * - Live sync via WebSocket/event bus
 * 
 * All receipts persisted in quickbooks_sync_receipts table with org isolation
 */

import { db } from '../db';
import { 
  quickbooksSyncReceipts, 
  InsertQuickbooksSyncReceipt,
  QuickbooksSyncReceipt 
} from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { platformEventBus } from './platformEventBus';

export interface QuickBooksReceipt {
  receiptId: string;
  workspaceId: string;
  syncType: 'invoice' | 'payroll' | 'customer' | 'vendor' | 'timeactivity' | 'employee';
  timestamp: Date;
  status: 'success' | 'partial' | 'failed';
  
  summary: {
    totalRecords: number;
    syncedRecords: number;
    failedRecords: number;
    totalValue?: number;
  };
  
  quickbooksDetails: {
    companyId?: string;
    externalIds: Array<{
      localId: string;
      quickbooksId: string;
      type: string;
    }>;
  };
  
  payload: {
    items: Array<{
      id: string;
      name: string;
      amount?: number;
      status: 'synced' | 'failed';
      error?: string;
      quickbooksId?: string;
    }>;
  };
  
  trinitySignature: string;
  viewInQuickBooksUrl?: string;
}

class QuickBooksReceiptService {
  private static instance: QuickBooksReceiptService;

  private constructor() {}

  static getInstance(): QuickBooksReceiptService {
    if (!this.instance) {
      this.instance = new QuickBooksReceiptService();
    }
    return this.instance;
  }

  generateReceiptId(): string {
    return `qb_rcpt_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`;
  }

  generateSignature(receipt: Omit<QuickBooksReceipt, 'trinitySignature'>): string {
    const data = JSON.stringify({
      receiptId: receipt.receiptId,
      syncType: receipt.syncType,
      timestamp: receipt.timestamp.toISOString(),
      totalRecords: receipt.summary.totalRecords,
      syncedRecords: receipt.summary.syncedRecords,
    });
    
    return `trinity_qb_${Buffer.from(data).toString('base64').substring(0, 24)}`;
  }

  /**
   * Create invoice sync receipt - persisted to database
   */
  async createInvoiceReceipt(params: {
    workspaceId: string;
    invoices: Array<{
      id: string;
      clientName: string;
      amount: number;
      status: 'synced' | 'failed';
      quickbooksId?: string;
      error?: string;
    }>;
    quickbooksCompanyId?: string;
  }): Promise<QuickBooksReceipt> {
    const receiptId = this.generateReceiptId();
    const syncedInvoices = params.invoices.filter(i => i.status === 'synced');
    const failedInvoices = params.invoices.filter(i => i.status === 'failed');
    const totalValue = syncedInvoices.reduce((sum, i) => sum + i.amount, 0);

    const receipt: Omit<QuickBooksReceipt, 'trinitySignature'> = {
      receiptId,
      workspaceId: params.workspaceId,
      syncType: 'invoice',
      timestamp: new Date(),
      status: failedInvoices.length === 0 ? 'success' : (syncedInvoices.length > 0 ? 'partial' : 'failed'),
      summary: {
        totalRecords: params.invoices.length,
        syncedRecords: syncedInvoices.length,
        failedRecords: failedInvoices.length,
        totalValue,
      },
      quickbooksDetails: {
        companyId: params.quickbooksCompanyId,
        externalIds: syncedInvoices.map(i => ({
          localId: i.id,
          quickbooksId: i.quickbooksId || '',
          type: 'Invoice',
        })),
      },
      payload: {
        items: params.invoices.map(i => ({
          id: i.id,
          name: i.clientName,
          amount: i.amount,
          status: i.status,
          error: i.error,
          quickbooksId: i.quickbooksId,
        })),
      },
      viewInQuickBooksUrl: params.quickbooksCompanyId 
        ? `https://app.qbo.intuit.com/app/invoices?company=${params.quickbooksCompanyId}`
        : undefined,
    };

    const fullReceipt: QuickBooksReceipt = {
      ...receipt,
      trinitySignature: this.generateSignature(receipt),
    };

    await this.persistReceipts(fullReceipt, params.invoices);

    await platformEventBus.publish({
      type: 'quickbooks_sync_receipt',
      category: 'integrations',
      title: 'QuickBooks Invoice Sync Complete',
      description: `Synced ${syncedInvoices.length}/${params.invoices.length} invoices ($${totalValue.toFixed(2)})`,
      workspaceId: params.workspaceId,
      metadata: {
        receiptId,
        syncType: 'invoice',
        status: fullReceipt.status,
        summary: fullReceipt.summary,
      },
    });

    await this.broadcastReceiptUpdate(params.workspaceId, fullReceipt);

    return fullReceipt;
  }

  /**
   * Create payroll/time activity sync receipt - persisted to database
   */
  async createPayrollReceipt(params: {
    workspaceId: string;
    payrollRunId: string;
    entries: Array<{
      id: string;
      employeeName: string;
      hours: number;
      amount: number;
      status: 'synced' | 'failed';
      quickbooksId?: string;
      error?: string;
    }>;
    quickbooksCompanyId?: string;
  }): Promise<QuickBooksReceipt> {
    const receiptId = this.generateReceiptId();
    const syncedEntries = params.entries.filter(e => e.status === 'synced');
    const failedEntries = params.entries.filter(e => e.status === 'failed');
    const totalHours = syncedEntries.reduce((sum, e) => sum + e.hours, 0);
    const totalValue = syncedEntries.reduce((sum, e) => sum + e.amount, 0);

    const receipt: Omit<QuickBooksReceipt, 'trinitySignature'> = {
      receiptId,
      workspaceId: params.workspaceId,
      syncType: 'timeactivity',
      timestamp: new Date(),
      status: failedEntries.length === 0 ? 'success' : (syncedEntries.length > 0 ? 'partial' : 'failed'),
      summary: {
        totalRecords: params.entries.length,
        syncedRecords: syncedEntries.length,
        failedRecords: failedEntries.length,
        totalValue,
      },
      quickbooksDetails: {
        companyId: params.quickbooksCompanyId,
        externalIds: syncedEntries.map(e => ({
          localId: e.id,
          quickbooksId: e.quickbooksId || '',
          type: 'TimeActivity',
        })),
      },
      payload: {
        items: params.entries.map(e => ({
          id: e.id,
          name: e.employeeName,
          amount: e.amount,
          status: e.status,
          error: e.error,
          quickbooksId: e.quickbooksId,
        })),
      },
      viewInQuickBooksUrl: params.quickbooksCompanyId 
        ? `https://app.qbo.intuit.com/app/timeactivity?company=${params.quickbooksCompanyId}`
        : undefined,
    };

    const fullReceipt: QuickBooksReceipt = {
      ...receipt,
      trinitySignature: this.generateSignature(receipt),
    };

    await this.persistPayrollReceipts(fullReceipt, params.entries, params.payrollRunId);

    await platformEventBus.publish({
      type: 'quickbooks_sync_receipt',
      category: 'integrations',
      title: 'QuickBooks Payroll Sync Complete',
      description: `Synced ${syncedEntries.length}/${params.entries.length} time activities (${totalHours.toFixed(1)} hrs, $${totalValue.toFixed(2)})`,
      workspaceId: params.workspaceId,
      metadata: {
        receiptId,
        payrollRunId: params.payrollRunId,
        syncType: 'timeactivity',
        status: fullReceipt.status,
        summary: fullReceipt.summary,
      },
    });

    await this.broadcastReceiptUpdate(params.workspaceId, fullReceipt);

    return fullReceipt;
  }

  /**
   * Get a single receipt from database with workspace isolation
   */
  async getReceipt(receiptId: string, workspaceId: string): Promise<QuickBooksReceipt | undefined> {
    const receipts = await db.query.quickbooksSyncReceipts.findMany({
      where: and(
        eq(quickbooksSyncReceipts.workspaceId, workspaceId),
        sql`${quickbooksSyncReceipts.trinitySignature} LIKE '%' || ${receiptId.substring(0, 20)} || '%'`
      ),
      limit: 10,
    });

    if (receipts.length === 0) return undefined;

    return this.mapDbReceiptToQuickBooksReceipt(receipts);
  }

  /**
   * Get recent receipts for a workspace from database
   */
  async getRecentReceipts(workspaceId: string, limit = 10): Promise<QuickBooksReceipt[]> {
    const receipts = await db.query.quickbooksSyncReceipts.findMany({
      where: eq(quickbooksSyncReceipts.workspaceId, workspaceId),
      orderBy: desc(quickbooksSyncReceipts.syncedAt),
      limit: limit * 10, // Get more to group by sync batch
    });

    const groupedReceipts = this.groupReceiptsByBatch(receipts);
    return groupedReceipts.slice(0, limit);
  }

  /**
   * Get receipts by sync type for a workspace
   */
  async getReceiptsBySyncType(workspaceId: string, syncType: string, limit = 20): Promise<QuickbooksSyncReceipt[]> {
    return db.query.quickbooksSyncReceipts.findMany({
      where: and(
        eq(quickbooksSyncReceipts.workspaceId, workspaceId),
        eq(quickbooksSyncReceipts.syncType, syncType)
      ),
      orderBy: desc(quickbooksSyncReceipts.syncedAt),
      limit,
    });
  }

  /**
   * Get sync statistics for a workspace
   */
  async getSyncStats(workspaceId: string): Promise<{
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    totalAmount: number;
    bySyncType: Record<string, { count: number; successRate: number }>;
  }> {
    const receipts = await db.query.quickbooksSyncReceipts.findMany({
      where: eq(quickbooksSyncReceipts.workspaceId, workspaceId),
    });

    const stats = {
      totalSyncs: receipts.length,
      successfulSyncs: receipts.filter(r => r.success).length,
      failedSyncs: receipts.filter(r => !r.success).length,
      totalAmount: receipts.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0),
      bySyncType: {} as Record<string, { count: number; successRate: number }>,
    };

    const typeGroups = receipts.reduce((acc, r) => {
      if (!acc[r.syncType]) acc[r.syncType] = { total: 0, success: 0 };
      acc[r.syncType].total++;
      if (r.success) acc[r.syncType].success++;
      return acc;
    }, {} as Record<string, { total: number; success: number }>);

    for (const [type, data] of Object.entries(typeGroups)) {
      stats.bySyncType[type] = {
        count: data.total,
        successRate: data.total > 0 ? (data.success / data.total) * 100 : 0,
      };
    }

    return stats;
  }

  /**
   * Persist invoice receipts to database
   */
  private async persistReceipts(
    receipt: QuickBooksReceipt, 
    invoices: Array<{ id: string; amount: number; status: 'synced' | 'failed'; quickbooksId?: string; error?: string }>
  ): Promise<void> {
    const insertValues: InsertQuickbooksSyncReceipt[] = invoices.map(inv => ({
      workspaceId: receipt.workspaceId,
      syncType: 'invoice',
      direction: 'outbound',
      localEntityId: inv.id,
      localEntityType: 'invoice',
      quickbooksEntityId: inv.quickbooksId,
      quickbooksEntityType: 'Invoice',
      success: inv.status === 'synced',
      amount: inv.amount.toString(),
      description: `Invoice sync - ${inv.status}`,
      quickbooksUrl: receipt.viewInQuickBooksUrl,
      errorCode: inv.error ? 'SYNC_ERROR' : undefined,
      errorMessage: inv.error,
      trinityVerified: true,
      trinitySignature: receipt.trinitySignature,
      syncedAt: new Date(),
    }));

    if (insertValues.length > 0) {
      await db.insert(quickbooksSyncReceipts).values(insertValues);
    }
  }

  /**
   * Persist payroll receipts to database
   */
  private async persistPayrollReceipts(
    receipt: QuickBooksReceipt,
    entries: Array<{ id: string; amount: number; status: 'synced' | 'failed'; quickbooksId?: string; error?: string }>,
    payrollRunId: string
  ): Promise<void> {
    const insertValues: InsertQuickbooksSyncReceipt[] = entries.map(entry => ({
      workspaceId: receipt.workspaceId,
      syncType: 'timeactivity',
      direction: 'outbound',
      localEntityId: entry.id,
      localEntityType: 'payrollRun',
      quickbooksEntityId: entry.quickbooksId,
      quickbooksEntityType: 'TimeActivity',
      success: entry.status === 'synced',
      amount: entry.amount.toString(),
      description: `Payroll sync (run: ${payrollRunId}) - ${entry.status}`,
      quickbooksUrl: receipt.viewInQuickBooksUrl,
      errorCode: entry.error ? 'SYNC_ERROR' : undefined,
      errorMessage: entry.error,
      trinityVerified: true,
      trinitySignature: receipt.trinitySignature,
      syncedAt: new Date(),
    }));

    if (insertValues.length > 0) {
      await db.insert(quickbooksSyncReceipts).values(insertValues);
    }
  }

  /**
   * Group database receipts by batch (same signature = same batch)
   */
  private groupReceiptsByBatch(receipts: QuickbooksSyncReceipt[]): QuickBooksReceipt[] {
    const batches = new Map<string, QuickbooksSyncReceipt[]>();
    
    for (const r of receipts) {
      const key = r.trinitySignature || r.id;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key)!.push(r);
    }

    return Array.from(batches.values()).map(batch => this.mapDbReceiptToQuickBooksReceipt(batch));
  }

  /**
   * Convert database records to QuickBooksReceipt format
   */
  private mapDbReceiptToQuickBooksReceipt(records: QuickbooksSyncReceipt[]): QuickBooksReceipt {
    const first = records[0];
    const syncedRecords = records.filter(r => r.success);
    const failedRecords = records.filter(r => !r.success);
    const totalValue = records.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);

    return {
      receiptId: first.trinitySignature?.split('_')[2] || first.id,
      workspaceId: first.workspaceId,
      syncType: first.syncType as QuickBooksReceipt['syncType'],
      timestamp: first.syncedAt,
      status: failedRecords.length === 0 ? 'success' : (syncedRecords.length > 0 ? 'partial' : 'failed'),
      summary: {
        totalRecords: records.length,
        syncedRecords: syncedRecords.length,
        failedRecords: failedRecords.length,
        totalValue,
      },
      quickbooksDetails: {
        externalIds: syncedRecords.map(r => ({
          localId: r.localEntityId || '',
          quickbooksId: r.quickbooksEntityId || '',
          type: r.quickbooksEntityType || '',
        })),
      },
      payload: {
        items: records.map(r => ({
          id: r.localEntityId || r.id,
          name: r.description || '',
          amount: parseFloat(r.amount || '0'),
          status: r.success ? 'synced' : 'failed',
          error: r.errorMessage || undefined,
          quickbooksId: r.quickbooksEntityId || undefined,
        })),
      },
      trinitySignature: first.trinitySignature || '',
      viewInQuickBooksUrl: first.quickbooksUrl || undefined,
    };
  }

  /**
   * Broadcast receipt update via WebSocket for live sync
   */
  private async broadcastReceiptUpdate(workspaceId: string, receipt: QuickBooksReceipt): Promise<void> {
    await platformEventBus.publish({
      type: 'quickbooks_receipt_sync',
      category: 'live_sync',
      title: 'QuickBooks Receipt Updated',
      description: `${receipt.syncType} sync ${receipt.status}`,
      workspaceId,
      metadata: {
        syncType: 'receipt',
        receiptId: receipt.receiptId,
        status: receipt.status,
        summary: receipt.summary,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Format receipt for display in UI
   */
  formatReceiptForDisplay(receipt: QuickBooksReceipt): {
    title: string;
    status: string;
    statusColor: string;
    summary: string;
    details: string[];
    viewUrl?: string;
    signature: string;
  } {
    const statusColors: Record<string, string> = {
      success: 'green',
      partial: 'yellow',
      failed: 'red',
    };

    const typeLabels: Record<string, string> = {
      invoice: 'Invoice Sync',
      payroll: 'Payroll Sync',
      timeactivity: 'Time Activity Sync',
      customer: 'Customer Sync',
      vendor: 'Vendor Sync',
      employee: 'Employee Sync',
    };

    return {
      title: typeLabels[receipt.syncType] || receipt.syncType,
      status: receipt.status.toUpperCase(),
      statusColor: statusColors[receipt.status] || 'gray',
      summary: `${receipt.summary.syncedRecords}/${receipt.summary.totalRecords} records synced${
        receipt.summary.totalValue ? ` ($${receipt.summary.totalValue.toFixed(2)})` : ''
      }`,
      details: receipt.payload.items.map(item => 
        `${item.name}: ${item.status === 'synced' ? '✓' : '✗'} ${item.amount ? `$${item.amount.toFixed(2)}` : ''}${item.error ? ` - ${item.error}` : ''}`
      ),
      viewUrl: receipt.viewInQuickBooksUrl,
      signature: receipt.trinitySignature,
    };
  }
}

export const quickbooksReceiptService = QuickBooksReceiptService.getInstance();
