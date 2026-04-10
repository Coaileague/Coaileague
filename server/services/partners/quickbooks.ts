import { db } from '../../db';
import { 
  partnerConnections,
  partnerDataMappings,
  clients,
  invoices,
  payrollRuns,
  InsertPartnerDataMapping
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { quickbooksOAuthService } from '../oauth/quickbooks';
import { withUsageTracking } from '../../middleware/usageTracking';
import { INTEGRATIONS } from '@shared/platformConfig';
import { isQuickbooksEnabled } from '../finance/financeSettingsService';

/**
 * QuickBooks Online API Service
 * 
 * Handles all QuickBooks API operations:
 * - Customer (Client) sync
 * - Invoice creation and sync
 * - Payment recording
 * - Account queries
 * 
 * All API calls are tracked for usage-based billing.
 */

// Use centralized config - NO HARDCODED URLs
const QBO_API_BASE = INTEGRATIONS.quickbooks.getCompanyApiBase();

interface QBOCustomer {
  Id?: string;
  DisplayName: string;
  GivenName?: string;
  FamilyName?: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  BillAddr?: {
    Line1?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
  };
}

interface QBOInvoice {
  Id?: string;
  DocNumber?: string;
  TxnDate: string;
  CustomerRef: { value: string };
  Line: Array<{
    DetailType: 'SalesItemLineDetail';
    Amount: number;
    Description?: string;
    SalesItemLineDetail: {
      ItemRef: { value: string; name?: string };
      Qty?: number;
      UnitPrice?: number;
    };
  }>;
  DueDate?: string;
  TotalAmt?: number;
}

interface QBOPayment {
  TotalAmt: number;
  CustomerRef: { value: string };
  Line: Array<{
    Amount: number;
    LinkedTxn: Array<{
      TxnId: string;
      TxnType: 'Invoice';
    }>;
  }>;
}

/**
 * QuickBooks API Service
 */
export class QuickBooksService {
  /**
   * Get active connection for workspace
   */
  private async getConnection(workspaceId: string) {
    const [connection] = await db.select()
      .from(partnerConnections)
      .where(
        and(
          eq(partnerConnections.workspaceId, workspaceId),
          eq(partnerConnections.partnerType, 'quickbooks'),
          eq(partnerConnections.status, 'connected')
        )
      )
      .limit(1);

    if (!connection) {
      throw new Error('No active QuickBooks connection found');
    }

    return connection;
  }

  /**
   * Get valid access token (refreshes if needed)
   */
  private async getAccessToken(connectionId: string): Promise<string> {
    return await quickbooksOAuthService.getValidAccessToken(connectionId);
  }

  /**
   * Make authenticated API request to QuickBooks
   */
  private async makeRequest<T>(
    method: 'GET' | 'POST' | 'PUT',
    endpoint: string,
    realmId: string,
    accessToken: string,
    body?: any,
    requestId?: string
  ): Promise<T> {
    const url = `${QBO_API_BASE}/${realmId}${endpoint}`;

    const response = await fetch(url, {
      method,
      signal: AbortSignal.timeout(15000),
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`QuickBooks API error (${response.status}): ${error}`);
    }

    return await response.json();
  }

  /**
   * Sync CoAIleague client to QuickBooks customer
   * 
   * @param workspaceId - Workspace ID
   * @param clientId - CoAIleague client ID
   * @param userId - User performing sync (for audit)
   * @returns QuickBooks customer ID
   */
  async syncClient(
    workspaceId: string,
    clientId: string,
    userId: string
  ): Promise<string> {
    if (!(await isQuickbooksEnabled(workspaceId))) {
      throw new Error('QuickBooks sync is not enabled for this workspace');
    }

    const connection = await this.getConnection(workspaceId);
    const accessToken = await this.getAccessToken(connection.id);
    const realmId = connection.realmId!;

    // Get CoAIleague client data
    const [client] = await db.select()
      .from(clients)
      .where(
        and(
          eq(clients.id, clientId),
          eq(clients.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (!client) {
      throw new Error('Client not found');
    }

    // Check if mapping already exists
    const [existingMapping] = await db.select()
      .from(partnerDataMappings)
      .where(
        and(
          eq(partnerDataMappings.workspaceId, workspaceId),
          eq(partnerDataMappings.partnerType, 'quickbooks'),
          eq(partnerDataMappings.entityType, 'client'),
          eq(partnerDataMappings.coaileagueEntityId, clientId)
        )
      )
      .limit(1);

    // Prepare QuickBooks customer data
    const qboCustomer: QBOCustomer = {
      DisplayName: client.companyName || `${client.firstName} ${client.lastName}`,
      CompanyName: client.companyName || `${client.firstName} ${client.lastName}`,
      PrimaryEmailAddr: client.email ? { Address: client.email } : undefined,
      PrimaryPhone: client.phone ? { FreeFormNumber: client.phone } : undefined,
      BillAddr: client.billingAddress ? {
        Line1: client.billingAddress,
      } : undefined,
    };

    let qboCustomerId: string;
    let operation: 'create' | 'update';

    // Use usage tracking wrapper
    const createOrUpdateCustomer = withUsageTracking(
      async (requestId: string) => {
        if (existingMapping) {
          // Update existing customer
          operation = 'update';
          const updatePayload = {
            ...qboCustomer,
            Id: existingMapping.partnerEntityId,
            SyncToken: '0', // Need to query first for real sync token
          };

          const result = await this.makeRequest<{ Customer: QBOCustomer }>(
            'POST',
            '/customer',
            realmId,
            accessToken,
            updatePayload,
            requestId
          );

          qboCustomerId = result.Customer.Id!;
        } else {
          // Create new customer
          operation = 'create';
          const result = await this.makeRequest<{ Customer: QBOCustomer }>(
            'POST',
            '/customer',
            realmId,
            accessToken,
            qboCustomer,
            requestId
          );

          qboCustomerId = result.Customer.Id!;
        }

        return { customerId: qboCustomerId };
      },
      {
        workspaceId,
        userId,
        partnerType: 'quickbooks',
        partnerConnectionId: connection.id,
        operationType: 'sync_client',
        featureKey: 'customer_sync',
        metadata: {
          clientId,
          operation: operation!,
        },
      }
    );

    // Execute with tracking
    const result = await createOrUpdateCustomer();

    // Create or update mapping
    if (existingMapping) {
      await db.update(partnerDataMappings)
        .set({
          partnerEntityId: result.customerId,
          partnerEntityName: client.companyName || `${client.firstName} ${client.lastName}`,
          syncStatus: 'synced',
          lastSyncAt: new Date(),
        })
        .where(eq(partnerDataMappings.id, existingMapping.id));
    } else {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await db.insert(partnerDataMappings).values({
        workspaceId,
        partnerConnectionId: connection.id,
        partnerType: 'quickbooks',
        entityType: 'client',
        coaileagueEntityId: clientId,
        partnerEntityId: result.customerId,
        partnerEntityName: client.companyName || `${client.firstName} ${client.lastName}`,
        syncStatus: 'synced',
        lastSyncAt: new Date(),
        mappingSource: 'auto',
        createdBy: userId,
      });
    }

    return result.customerId;
  }

  /**
   * Create invoice in QuickBooks from CoAIleague invoice
   * 
   * @param workspaceId - Workspace ID
   * @param invoiceId - CoAIleague invoice ID
   * @param userId - User performing operation
   * @returns QuickBooks invoice ID
   */
  async createInvoice(
    workspaceId: string,
    invoiceId: string,
    userId: string
  ): Promise<string> {
    if (!(await isQuickbooksEnabled(workspaceId))) {
      throw new Error('QuickBooks sync is not enabled for this workspace');
    }

    const connection = await this.getConnection(workspaceId);
    const accessToken = await this.getAccessToken(connection.id);
    const realmId = connection.realmId!;

    // Get CoAIleague invoice data
    const [invoice] = await db.select()
      .from(invoices)
      .where(
        and(
          eq(invoices.id, invoiceId),
          eq(invoices.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // Get or create customer mapping
    const [customerMapping] = await db.select()
      .from(partnerDataMappings)
      .where(
        and(
          eq(partnerDataMappings.workspaceId, workspaceId),
          eq(partnerDataMappings.partnerType, 'quickbooks'),
          eq(partnerDataMappings.entityType, 'client'),
          eq(partnerDataMappings.coaileagueEntityId, invoice.clientId)
        )
      )
      .limit(1);

    let qboCustomerId: string;

    if (!customerMapping) {
      // Sync client first
      qboCustomerId = await this.syncClient(workspaceId, invoice.clientId, userId);
    } else {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      qboCustomerId = customerMapping.partnerEntityId;
    }

    const qboInvoice: QBOInvoice = {
      DocNumber: invoice.invoiceNumber,
      TxnDate: (invoice.issueDate ? new Date(invoice.issueDate).toISOString() : new Date().toISOString()).split('T')[0],
      CustomerRef: { value: qboCustomerId },
      Line: [
        {
          DetailType: 'SalesItemLineDetail',
          Amount: Number(invoice.total),
          Description: `CoAIleague Invoice #${invoice.invoiceNumber}`,
          SalesItemLineDetail: {
            ItemRef: { value: '1', name: 'Services' },
            Qty: 1,
            UnitPrice: Number(invoice.total),
          },
        },
      ],
      DueDate: invoice.dueDate?.toISOString().split('T')[0],
    };

    // Create invoice with usage tracking
    const createQBOInvoice = withUsageTracking(
      async (requestId: string) => {
        const result = await this.makeRequest<{ Invoice: QBOInvoice }>(
          'POST',
          '/invoice',
          realmId,
          accessToken,
          qboInvoice,
          requestId
        );

        return { invoiceId: result.Invoice.Id! };
      },
      {
        workspaceId,
        userId,
        partnerType: 'quickbooks',
        partnerConnectionId: connection.id,
        operationType: 'create_invoice',
        featureKey: 'invoice_creation',
        metadata: {
          coaileagueInvoiceId: invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.total,
        },
      }
    );

    const result = await createQBOInvoice();

    // Create mapping
    // @ts-expect-error — TS migration: fix in refactoring sprint
    await db.insert(partnerDataMappings).values({
      workspaceId,
      partnerConnectionId: connection.id,
      partnerType: 'quickbooks',
      entityType: 'invoice',
      coaileagueEntityId: invoiceId,
      partnerEntityId: result.invoiceId,
      partnerEntityName: `Invoice #${invoice.invoiceNumber}`,
      syncStatus: 'synced',
      lastSyncAt: new Date(),
      mappingSource: 'auto',
      createdBy: userId,
    });

    return result.invoiceId;
  }

  /**
   * Record payment in QuickBooks
   */
  async recordPayment(
    workspaceId: string,
    invoiceId: string,
    amount: number,
    userId: string
  ): Promise<string> {
    if (!(await isQuickbooksEnabled(workspaceId))) {
      throw new Error('QuickBooks sync is not enabled for this workspace');
    }

    const connection = await this.getConnection(workspaceId);
    const accessToken = await this.getAccessToken(connection.id);
    const realmId = connection.realmId!;

    // Get invoice mapping
    const [invoiceMapping] = await db.select()
      .from(partnerDataMappings)
      .where(
        and(
          eq(partnerDataMappings.workspaceId, workspaceId),
          eq(partnerDataMappings.partnerType, 'quickbooks'),
          eq(partnerDataMappings.entityType, 'invoice'),
          eq(partnerDataMappings.coaileagueEntityId, invoiceId)
        )
      )
      .limit(1);

    if (!invoiceMapping) {
      throw new Error('Invoice not synced to QuickBooks');
    }

    // Get customer ID from invoice
    const getInvoice = withUsageTracking(
      async (requestId: string) => {
        const result = await this.makeRequest<{ Invoice: QBOInvoice }>(
          'GET',
          `/invoice/${invoiceMapping.partnerEntityId}`,
          realmId,
          accessToken,
          undefined,
          requestId
        );
        return result.Invoice;
      },
      {
        workspaceId,
        userId,
        partnerType: 'quickbooks',
        partnerConnectionId: connection.id,
        operationType: 'read',
        featureKey: 'invoice_query',
      }
    );

    const invoice = await getInvoice();

    // Create payment
    const qboPayment: QBOPayment = {
      TotalAmt: amount,
      CustomerRef: { value: invoice.CustomerRef.value },
      Line: [
        {
          Amount: amount,
          LinkedTxn: [
            {
              // @ts-expect-error — TS migration: fix in refactoring sprint
              TxnId: invoiceMapping.partnerEntityId,
              TxnType: 'Invoice',
            },
          ],
        },
      ],
    };

    const recordQBOPayment = withUsageTracking(
      async (requestId: string) => {
        const result = await this.makeRequest<{ Payment: { Id: string } }>(
          'POST',
          '/payment',
          realmId,
          accessToken,
          qboPayment,
          requestId
        );
        return { paymentId: result.Payment.Id };
      },
      {
        workspaceId,
        userId,
        partnerType: 'quickbooks',
        partnerConnectionId: connection.id,
        operationType: 'record_payment',
        featureKey: 'payment_recording',
        metadata: {
          invoiceId,
          amount,
        },
      }
    );

    const result = await recordQBOPayment();
    return result.paymentId;
  }

  /**
   * Sync a completed payroll run to QuickBooks as a journal entry.
   * Creates a JournalEntry in QBO: debit Payroll Expense, credit Payroll Liability (AP).
   */
  async syncPayroll(
    workspaceId: string,
    payrollRunId: string,
    userId: string
  ): Promise<string> {
    if (!(await isQuickbooksEnabled(workspaceId))) {
      throw new Error('QuickBooks sync is not enabled for this workspace');
    }

    const connection = await this.getConnection(workspaceId);
    const accessToken = await this.getAccessToken(connection.id);
    const realmId = connection.realmId!;

    const [run] = await db.select()
      .from(payrollRuns)
      .where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.workspaceId, workspaceId)))
      .limit(1);

    if (!run) throw new Error('Payroll run not found');

    const grossPay = parseFloat(run.totalGrossPay as string || '0');
    const netPay = parseFloat(run.totalNetPay as string || '0');
    const deductions = grossPay - netPay;

    const txnDate = (run.periodEnd
      ? new Date(run.periodEnd).toISOString()
      : new Date().toISOString()
    ).split('T')[0];

    const journalEntry = {
      TxnDate: txnDate,
      PrivateNote: `CoAIleague Payroll Run — period ${run.periodStart ? new Date(run.periodStart).toISOString().split('T')[0] : ''} to ${txnDate}`,
      Line: [
        {
          JournalEntryLineDetail: {
            PostingType: 'Debit',
            AccountRef: { name: 'Payroll Expenses' },
          },
          DetailType: 'JournalEntryLineDetail',
          Amount: grossPay,
          Description: `Gross payroll for period ending ${txnDate}`,
        },
        {
          JournalEntryLineDetail: {
            PostingType: 'Credit',
            AccountRef: { name: 'Payroll Liabilities' },
          },
          DetailType: 'JournalEntryLineDetail',
          Amount: netPay,
          Description: `Net pay disbursed for period ending ${txnDate}`,
        },
        ...(deductions > 0 ? [{
          JournalEntryLineDetail: {
            PostingType: 'Credit',
            AccountRef: { name: 'Payroll Tax Payable' },
          },
          DetailType: 'JournalEntryLineDetail',
          Amount: deductions,
          Description: `Taxes & deductions withheld for period ending ${txnDate}`,
        }] : []),
      ],
    };

    const createJournalEntry = withUsageTracking(
      async (requestId: string) => {
        const result = await this.makeRequest<{ JournalEntry: { Id: string } }>(
          'POST',
          '/journalentry',
          realmId,
          accessToken,
          journalEntry,
          requestId
        );
        return { journalEntryId: result.JournalEntry.Id };
      },
      {
        workspaceId,
        userId,
        partnerType: 'quickbooks',
        partnerConnectionId: connection.id,
        operationType: 'sync_payroll',
        featureKey: 'payroll_sync',
        metadata: { payrollRunId, grossPay, netPay, txnDate },
      }
    );

    const result = await createJournalEntry();

    // @ts-expect-error — TS migration: fix in refactoring sprint
    await db.insert(partnerDataMappings).values({
      workspaceId,
      partnerConnectionId: connection.id,
      partnerType: 'quickbooks',
      entityType: 'payroll_run',
      coaileagueEntityId: payrollRunId,
      partnerEntityId: result.journalEntryId,
      partnerEntityName: `Payroll JE — ${txnDate}`,
      syncStatus: 'synced',
      lastSyncAt: new Date(),
      mappingSource: 'auto',
      createdBy: userId,
    }).onConflictDoNothing();

    return result.journalEntryId;
  }
}

export const quickbooksService = new QuickBooksService();
