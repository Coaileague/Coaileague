import { db } from '../../db';
import { 
  partnerConnections, 
  partnerDataMappings,
  clients,
  invoices,
  InsertPartnerDataMapping
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { quickbooksOAuthService } from '../oauth/quickbooks';
import { withUsageTracking } from '../../middleware/usageTracking';

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

const QBO_API_BASE = 'https://quickbooks.api.intuit.com/v3/company';

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
    // Get connection
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
      DisplayName: client.name,
      CompanyName: client.companyName || client.name,
      PrimaryEmailAddr: client.contactEmail ? { Address: client.contactEmail } : undefined,
      PrimaryPhone: client.contactPhone ? { FreeFormNumber: client.contactPhone } : undefined,
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
          partnerEntityName: client.name,
          syncStatus: 'synced',
          lastSyncAt: new Date(),
        })
        .where(eq(partnerDataMappings.id, existingMapping.id));
    } else {
      await db.insert(partnerDataMappings).values({
        workspaceId,
        partnerConnectionId: connection.id,
        partnerType: 'quickbooks',
        entityType: 'client',
        coaileagueEntityId: clientId,
        partnerEntityId: result.customerId,
        partnerEntityName: client.name,
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
    // Get connection
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
      qboCustomerId = customerMapping.partnerEntityId;
    }

    // Create QuickBooks invoice
    const qboInvoice: QBOInvoice = {
      TxnDate: invoice.invoiceDate.toISOString().split('T')[0],
      CustomerRef: { value: qboCustomerId },
      Line: [
        {
          DetailType: 'SalesItemLineDetail',
          Amount: Number(invoice.totalAmount),
          Description: `CoAIleague Invoice #${invoice.invoiceNumber}`,
          SalesItemLineDetail: {
            ItemRef: { value: '1', name: 'Services' }, // Default service item
            Qty: 1,
            UnitPrice: Number(invoice.totalAmount),
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
          amount: invoice.totalAmount,
        },
      }
    );

    const result = await createQBOInvoice();

    // Create mapping
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
}

export const quickbooksService = new QuickBooksService();
