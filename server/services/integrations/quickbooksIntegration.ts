/**
 * QuickBooks Data Sync Service
 * 
 * Handles data synchronization operations with QuickBooks Online.
 * ALL OAuth operations are delegated to QuickBooksOAuthService (server/services/oauth/quickbooks.ts).
 * This service is ONLY responsible for:
 * - Batch API operations
 * - Invoice sync
 * - Employee sync
 * - Customer sync
 * - Edition detection
 * - Rate-limited API requests
 * 
 * Supports ALL QuickBooks editions:
 * - QuickBooks Online: Simple Start, Essentials, Plus, Advanced
 * - QuickBooks Desktop: Pro, Premier, Enterprise (via Web Connector)
 * 
 * CRITICAL: API Version 75+ required as of August 1, 2025
 * @see https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/minor-versions
 */

import { db } from '../../db';
import { eq } from 'drizzle-orm';
import { 
  QB_API_VERSION, 
  QB_EDITIONS, 
  QBEditionType, 
  getEditionByCompanyInfo,
  analyzeQBMigration,
  type QBEditionConfig
} from '@shared/quickbooks-editions';
import { quickbooksRateLimiter } from './quickbooksRateLimiter';
import { quotaEnforcementService } from './quotaEnforcementService';
import { INTEGRATIONS } from '@shared/platformConfig';
import { createLogger } from '../../lib/logger';
const log = createLogger('quickbooksIntegration');


const API_MINOR_VERSION = INTEGRATIONS.quickbooks.minorVersion;

export interface QuickBooksCredentials {
  workspaceId: string;
  accessToken: string;
  refreshToken: string;
  realmId: string;
  expiresAt: Date;
  edition?: QBEditionType;
  editionConfig?: QBEditionConfig;
}

export class QuickBooksIntegration {
  private getBaseUrl(environment?: 'sandbox' | 'production'): string {
    const env = environment || INTEGRATIONS.quickbooks.getEnvironment();
    return env === 'production' 
      ? INTEGRATIONS.quickbooks.apiUrls.production
      : INTEGRATIONS.quickbooks.apiUrls.sandbox;
  }

  async makeRateLimitedRequest<T>(
    workspaceId: string,
    realmId: string,
    requestFn: () => Promise<T>,
    priority: number = 0
  ): Promise<{ success: boolean; data?: T; error?: string; rateLimited?: boolean; waitMs?: number }> {
    const quotaCheck = await quotaEnforcementService.checkQuota(workspaceId, 'quickbooks_api', 1, realmId);
    
    if (!quotaCheck.allowed) {
      return {
        success: false,
        error: quotaCheck.reason || 'QuickBooks quota exceeded',
        rateLimited: true,
        waitMs: quotaCheck.waitMs,
      };
    }
    
    const environment = INTEGRATIONS.quickbooks.getEnvironment();
    const canProceed = await quickbooksRateLimiter.waitForSlot(
      realmId,
      environment,
      priority,
      30000
    );
    
    if (!canProceed) {
      return {
        success: false,
        error: 'Rate limit timeout - please try again later',
        rateLimited: true,
      };
    }
    
    try {
      const data = await requestFn();
      quickbooksRateLimiter.completeRequest(realmId, environment, true);
      await quotaEnforcementService.recordQBApiUsage(workspaceId, realmId, 1);
      return { success: true, data };
    } catch (error: any) {
      quickbooksRateLimiter.completeRequest(realmId, environment, false);
      
      if (error.status === 429) {
        quickbooksRateLimiter.recordThrottle(realmId, environment);
        return {
          success: false,
          error: 'QuickBooks rate limit exceeded',
          rateLimited: true,
        };
      }
      
      return {
        success: false,
        error: (error instanceof Error ? error.message : String(error)),
      };
    }
  }

  async executeBatch(
    credentials: QuickBooksCredentials,
    batchItems: Array<{ bId: string; operation: 'create' | 'update' | 'delete' | 'query'; entity: string; payload?: any }>
  ): Promise<{ success: boolean; responses: Array<{ bId: string; success: boolean; data?: any; error?: string }> }> {
    if (batchItems.length > 30) {
      return { success: false, responses: batchItems.map(b => ({ bId: b.bId, success: false, error: 'Max 30 items per batch' })) };
    }

    try {
      const batchRequest = {
        BatchItemRequest: batchItems.map(item => ({
          bId: item.bId,
          operation: item.operation,
          [item.entity]: item.payload,
        })),
      };

      const response = await fetch(
        `${this.getBaseUrl()}/v3/company/${credentials.realmId}/batch?minorversion=${API_MINOR_VERSION}`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(30000),
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${credentials.accessToken}`,
          },
          body: JSON.stringify(batchRequest),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        log.error('[QuickBooks] Batch request failed:', errorText);
        return { success: false, responses: batchItems.map(b => ({ bId: b.bId, success: false, error: errorText })) };
      }

      const result = await response.json();
      const responses: Array<{ bId: string; success: boolean; data?: any; error?: string }> = [];

      for (const item of result.BatchItemResponse || []) {
        if (item.Fault) {
          responses.push({
            bId: item.bId,
            success: false,
            error: item.Fault.Error?.[0]?.Message || 'Unknown error',
          });
        } else {
          responses.push({
            bId: item.bId,
            success: true,
            data: item.Employee || item.Customer || item.Invoice || item.TimeActivity || item,
          });
        }
      }

      const allSuccess = responses.every(r => r.success);
      log.info(`[QuickBooks] Batch completed: ${responses.filter(r => r.success).length}/${responses.length} succeeded`);
      
      return { success: allSuccess, responses };
    } catch (error: any) {
      log.error('[QuickBooks] Batch execution error:', error);
      return { success: false, responses: batchItems.map(b => ({ bId: b.bId, success: false, error: (error instanceof Error ? error.message : String(error)) })) };
    }
  }

  async processBatched<T>(
    items: T[],
    batchSize: number,
    concurrency: number,
    mapFn: (item: T, index: number) => any,
    entity: string,
    credentials: QuickBooksCredentials,
    onProgress?: (processed: number, total: number, errors: string[]) => void
  ): Promise<{ success: boolean; synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;
    const total = items.length;

    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    log.info(`[QuickBooks] Processing ${total} items in ${batches.length} batches (size=${batchSize}, concurrency=${concurrency})`);

    let activeCount = 0;
    const queue: (() => void)[] = [];
    
    const acquire = (): Promise<void> => {
      return new Promise((resolve) => {
        if (activeCount < concurrency) {
          activeCount++;
          resolve();
        } else {
          queue.push(resolve);
        }
      });
    };
    
    const release = (): void => {
      if (queue.length > 0) {
        const next = queue.shift()!;
        next();
      } else {
        activeCount--;
      }
    };

    const processBatch = async (batch: T[], batchIndex: number): Promise<void> => {
      await acquire();
      
      try {
        const batchItems = batch.map((item, idx) => ({
          bId: `${batchIndex}-${idx}`,
          operation: 'create' as const,
          entity,
          payload: mapFn(item, batchIndex * batchSize + idx),
        }));

        const result = await this.makeRateLimitedRequest(
          credentials.workspaceId,
          credentials.realmId,
          () => this.executeBatch(credentials, batchItems),
          0
        );

        if (result.success && result.data) {
          for (const resp of result.data.responses) {
            if (resp.success) {
              synced++;
            } else {
              errors.push(`Item ${resp.bId}: ${resp.error}`);
            }
          }
        } else {
          for (const item of batchItems) {
            errors.push(`Item ${item.bId}: ${result.error || 'Batch failed'}`);
          }
        }

        if (onProgress) {
          onProgress(synced + errors.length, total, errors);
        }
      } finally {
        release();
      }
    };

    await Promise.all(batches.map((batch, idx) => processBatch(batch, idx)));

    log.info(`[QuickBooks] Batch processing complete: ${synced} synced, ${errors.length} errors`);
    return { success: errors.length === 0, synced, errors };
  }
  
  async syncInvoicesToQuickBooks(credentials: QuickBooksCredentials, invoices: any[]): Promise<{ success: boolean; synced: number; errors: string[] }> {
    const editionConfig = credentials.editionConfig || QB_EDITIONS[credentials.edition || 'unknown'];
    if (!editionConfig.syncCapabilities.invoices) {
      return { success: false, synced: 0, errors: [`Invoice sync not supported for ${editionConfig.displayName}`] };
    }
    
    const errors: string[] = [];
    let synced = 0;
    
    for (const invoice of invoices) {
      try {
        const qbInvoice = this.mapInvoiceToQuickBooks(invoice);
        const response = await fetch(
          `${this.getBaseUrl()}/v3/company/${credentials.realmId}/invoice?minorversion=${API_MINOR_VERSION}`,
          {
            method: 'POST',
            signal: AbortSignal.timeout(15000),
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${credentials.accessToken}`,
            },
            body: JSON.stringify(qbInvoice),
          }
        );
        
        if (response.ok) {
          synced++;
          log.info(`[QuickBooks] Synced invoice ${invoice.id}`);
        } else {
          const error = await response.text();
          errors.push(`Invoice ${invoice.id}: ${error}`);
        }
      } catch (error) {
        errors.push(`Invoice ${invoice.id}: ${error}`);
      }
    }
    
    return { success: errors.length === 0, synced, errors };
  }
  
  private mapInvoiceToQuickBooks(invoice: any): any {
    return {
      Line: [{
        Amount: parseFloat(invoice.total),
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          ItemRef: { value: '1' },
          Qty: 1,
          UnitPrice: parseFloat(invoice.total),
        },
      }],
      CustomerRef: {
        value: invoice.clientId,
        name: invoice.clientName,
      },
      DocNumber: invoice.invoiceNumber,
      TxnDate: invoice.issueDate?.toISOString().split('T')[0],
      DueDate: invoice.dueDate?.toISOString().split('T')[0],
    };
  }
  
  async getCompanyInfo(credentials: QuickBooksCredentials): Promise<any | null> {
    try {
      const response = await fetch(
        `${this.getBaseUrl()}/v3/company/${credentials.realmId}/companyinfo/${credentials.realmId}?minorversion=${API_MINOR_VERSION}`,
        {
          signal: AbortSignal.timeout(15000),
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${credentials.accessToken}`,
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        return data.CompanyInfo;
      }
      
      return null;
    } catch (error) {
      log.error('[QuickBooks] Error getting company info:', error);
      return null;
    }
  }

  async detectEdition(credentials: QuickBooksCredentials): Promise<{ edition: QBEditionType; config: QBEditionConfig; migrationAnalysis: ReturnType<typeof analyzeQBMigration> }> {
    const companyInfo = await this.getCompanyInfo(credentials);
    
    const edition = companyInfo 
      ? getEditionByCompanyInfo({
          subscriptionStatus: companyInfo.SubscriptionStatus,
          offeringSku: companyInfo.OfferingSku,
          industryType: companyInfo.IndustryType,
        })
      : 'unknown';
    
    const config = QB_EDITIONS[edition];
    const migrationAnalysis = analyzeQBMigration(edition);
    
    log.info(`[QuickBooks] Detected edition: ${config.displayName}`);
    log.info(`[QuickBooks] Migration compatibility: ${migrationAnalysis.targetCompatibility}`);
    
    return { edition, config, migrationAnalysis };
  }

  getSupportedEditions(): typeof QB_EDITIONS {
    return QB_EDITIONS;
  }

  getApiVersion(): typeof QB_API_VERSION {
    return QB_API_VERSION;
  }

  async syncTimeActivities(credentials: QuickBooksCredentials, timeEntries: any[]): Promise<{ success: boolean; synced: number; errors: string[] }> {
    const editionConfig = credentials.editionConfig || QB_EDITIONS[credentials.edition || 'unknown'];
    if (!editionConfig.syncCapabilities.timeActivities) {
      return { success: false, synced: 0, errors: [`Time Activities sync not supported for ${editionConfig.displayName}. Upgrade to Essentials or higher.`] };
    }
    
    const errors: string[] = [];
    let synced = 0;
    
    for (const entry of timeEntries) {
      try {
        const qbTimeActivity = this.mapTimeEntryToQuickBooks(entry);
        const response = await fetch(
          `${this.getBaseUrl()}/v3/company/${credentials.realmId}/timeactivity?minorversion=${API_MINOR_VERSION}`,
          {
            method: 'POST',
            signal: AbortSignal.timeout(15000),
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${credentials.accessToken}`,
            },
            body: JSON.stringify(qbTimeActivity),
          }
        );
        
        if (response.ok) {
          synced++;
          log.info(`[QuickBooks] Synced time entry ${entry.id}`);
        } else {
          const error = await response.text();
          errors.push(`Time entry ${entry.id}: ${error}`);
        }
      } catch (error) {
        errors.push(`Time entry ${entry.id}: ${error}`);
      }
    }
    
    return { success: errors.length === 0, synced, errors };
  }

  private mapTimeEntryToQuickBooks(entry: any): any {
    return {
      NameOf: 'Employee',
      EmployeeRef: { value: entry.employeeQbId },
      CustomerRef: entry.customerQbId ? { value: entry.customerQbId } : undefined,
      ItemRef: entry.serviceItemQbId ? { value: entry.serviceItemQbId } : undefined,
      TxnDate: entry.date?.toISOString().split('T')[0],
      Hours: entry.hours,
      Minutes: entry.minutes || 0,
      Description: entry.description,
      BillableStatus: entry.billable ? 'Billable' : 'NotBillable',
    };
  }

  async syncCustomers(
    credentials: QuickBooksCredentials, 
    customers: any[],
    onProgress?: (processed: number, total: number, errors: string[]) => void
  ): Promise<{ success: boolean; synced: number; errors: string[] }> {
    const editionConfig = credentials.editionConfig || QB_EDITIONS[credentials.edition || 'unknown'];
    if (!editionConfig.syncCapabilities.customers) {
      return { success: false, synced: 0, errors: [`Customer sync not supported for ${editionConfig.displayName}`] };
    }

    return this.processBatched(
      customers,
      25,
      3,
      (customer) => ({
        DisplayName: customer.name || customer.displayName,
        CompanyName: customer.companyName,
        PrimaryEmailAddr: customer.email ? { Address: customer.email } : undefined,
        PrimaryPhone: customer.phone ? { FreeFormNumber: customer.phone } : undefined,
        BillAddr: customer.address ? {
          Line1: customer.address.line1,
          City: customer.address.city,
          CountrySubDivisionCode: customer.address.state,
          PostalCode: customer.address.postalCode,
        } : undefined,
      }),
      'Customer',
      credentials,
      onProgress
    );
  }

  async syncEmployees(
    credentials: QuickBooksCredentials, 
    employees: any[],
    onProgress?: (processed: number, total: number, errors: string[]) => void
  ): Promise<{ success: boolean; synced: number; errors: string[] }> {
    const editionConfig = credentials.editionConfig || QB_EDITIONS[credentials.edition || 'unknown'];
    if (!editionConfig.syncCapabilities.employees) {
      return { success: false, synced: 0, errors: [`Employee sync not supported for ${editionConfig.displayName}. Upgrade to Plus or higher.`] };
    }

    return this.processBatched(
      employees,
      25,
      3,
      (employee) => ({
        DisplayName: `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'Unknown Employee',
        GivenName: employee.firstName,
        FamilyName: employee.lastName,
        PrimaryEmailAddr: employee.email ? { Address: employee.email } : undefined,
        PrimaryPhone: employee.phone ? { FreeFormNumber: employee.phone } : undefined,
        SSN: employee.ssn,
        BirthDate: employee.birthDate?.toISOString().split('T')[0],
        HiredDate: employee.hireDate?.toISOString().split('T')[0],
        PrimaryAddr: employee.address ? {
          Line1: employee.address.line1,
          City: employee.address.city,
          CountrySubDivisionCode: employee.address.state,
          PostalCode: employee.address.postalCode,
        } : undefined,
      }),
      'Employee',
      credentials,
      onProgress
    );
  }

  async pushSandboxDataToQuickBooks(
    credentials: QuickBooksCredentials, 
    workspaceId: string
  ): Promise<{ 
    success: boolean; 
    customers: { synced: number; errors: string[] }; 
    employees: { synced: number; errors: string[] };
    invoices: { synced: number; errors: string[] };
  }> {
    const { clients: clientsTable, employees: employeesTable, invoices: invoicesTable } = await import('@shared/schema');
    const { clients, employees: dbEmployees, invoices } = await db.transaction(async (tx) => {
      const clients = await tx.query.clients.findMany({
        where: eq(clientsTable.workspaceId, workspaceId),
        limit: 50,
      });
      
      const employees = await tx.query.employees.findMany({
        where: eq(employeesTable.workspaceId, workspaceId),
        limit: 100,
      });
      
      const invoices = await tx.query.invoices.findMany({
        where: eq(invoicesTable.workspaceId, workspaceId),
        limit: 50,
      });
      
      return { clients, employees, invoices };
    });

    log.info(`[QuickBooks] Pushing sandbox data: ${clients.length} clients, ${dbEmployees.length} employees, ${invoices.length} invoices`);

    const customersResult = await this.syncCustomers(credentials, clients.map(c => ({
      id: c.id,
      name: c.companyName || [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unknown',
      displayName: c.companyName || [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unknown',
      companyName: c.companyName || [c.firstName, c.lastName].filter(Boolean).join(' '),
      email: c.email,
      phone: c.phone,
      address: c.address ? {
        line1: (c.address as any).street || (c.address as any).line1,
        city: (c.address as any).city,
        state: (c.address as any).state,
        postalCode: (c.address as any).zip || (c.address as any).postalCode,
      } : undefined,
    })));

    const employeesResult = await this.syncEmployees(credentials, dbEmployees.map(e => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      name: `${e.firstName} ${e.lastName}`,
      email: e.email,
      phone: e.phone,
      hireDate: e.hireDate,
    })));

    const invoicesResult = await this.syncInvoicesToQuickBooks(credentials, invoices.map(inv => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientId: inv.clientId,
      clientName: 'Client',
      total: inv.total,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
    })));

    return {
      success: customersResult.success || employeesResult.success || invoicesResult.success,
      customers: { synced: customersResult.synced, errors: customersResult.errors },
      employees: { synced: employeesResult.synced, errors: employeesResult.errors },
      invoices: { synced: invoicesResult.synced, errors: invoicesResult.errors },
    };
  }
}

export const quickbooksIntegration = new QuickBooksIntegration();
