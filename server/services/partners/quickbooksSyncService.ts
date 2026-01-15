import { db } from '../../db';
import { 
  partnerConnections, 
  partnerDataMappings,
  partnerInvoiceIdempotency,
  partnerSyncLogs,
  partnerManualReviewQueue,
  clients,
  employees,
  timeEntries,
  invoices,
  onboardingInvites,
  workspaces,
  users,
  billingServices,
  InsertPartnerDataMapping,
  InsertPartnerInvoiceIdempotency,
  InsertPartnerSyncLog,
  InsertPartnerManualReviewQueue,
} from '@shared/schema';
import { eq, and, or, ilike, gte, lte, desc, isNull } from 'drizzle-orm';
import { quickbooksOAuthService } from '../oauth/quickbooks';
import { platformEventBus } from '../platformEventBus';
import { meteredGemini } from '../billing/meteredGeminiClient';
import { enhancedLLMJudge } from '../ai-brain/llmJudgeEnhanced';
import { auditLogger } from '../audit-logger';
import { quickbooksRateLimiter } from '../integrations/quickbooksRateLimiter';
import crypto from 'crypto';
import { INTEGRATIONS } from '@shared/platformConfig';
import { emailService } from '../emailService';

// Use centralized config - NO HARDCODED URLs
const QBO_API_BASE = INTEGRATIONS.quickbooks.getCompanyApiBase();

interface QBOCustomer {
  Id: string;
  SyncToken: string;
  DisplayName: string;
  GivenName?: string;
  FamilyName?: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  Active?: boolean;
  // Address fields for Trinity scheduling
  BillAddr?: {
    Line1?: string;
    Line2?: string;
    City?: string;
    CountrySubDivisionCode?: string; // State
    PostalCode?: string;
    Country?: string;
    Lat?: string;
    Long?: string;
  };
  ShipAddr?: {
    Line1?: string;
    Line2?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
    Country?: string;
    Lat?: string;
    Long?: string;
  };
  // Notes for post orders
  Notes?: string;
}

interface QBOEmployee {
  Id: string;
  SyncToken: string;
  DisplayName: string;
  GivenName?: string;
  FamilyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  Active?: boolean;
}

interface QBOVendor {
  Id: string;
  SyncToken: string;
  DisplayName: string;
  GivenName?: string;
  FamilyName?: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  Active?: boolean;
  Vendor1099?: boolean;
  TaxIdentifier?: string;
}

// QuickBooks Item/Service - Used for billing accuracy
interface QBOItem {
  Id: string;
  SyncToken: string;
  Name: string;
  Description?: string;
  FullyQualifiedName?: string;
  Type: 'Service' | 'Inventory' | 'NonInventory' | 'Group' | 'Category' | 'Bundle';
  Active: boolean;
  UnitPrice?: number;
  PurchaseCost?: number;
  Taxable?: boolean;
  SalesTaxIncluded?: boolean;
  ParentRef?: { value: string; name: string };
  SubItem?: boolean;
  IncomeAccountRef?: { value: string; name: string };
  ExpenseAccountRef?: { value: string; name: string };
  AssetAccountRef?: { value: string; name: string };
}

interface EntityMatch {
  coaileagueEntityId: string;
  coaileagueEntityName: string;
  coaileagueEmail?: string;
  partnerEntityId: string;
  partnerEntityName: string;
  partnerEmail?: string;
  confidence: number;
  matchType: 'email_exact' | 'name_exact' | 'name_fuzzy' | 'ambiguous' | 'no_match';
  ambiguousCandidates?: { id: string; name: string; email?: string }[];
}

interface SyncResult {
  success: boolean;
  jobId: string;
  recordsProcessed: number;
  recordsMatched: number;
  recordsCreated: number;
  recordsReviewRequired: number;
  errors: string[];
  durationMs: number;
}

export class QuickBooksSyncService {
  
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

  private async getAccessToken(connectionId: string): Promise<string> {
    return await quickbooksOAuthService.getValidAccessToken(connectionId);
  }

  private async makeRequest<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    realmId: string,
    accessToken: string,
    body?: any,
    priority: number = 0
  ): Promise<T> {
    const environment = (process.env.QUICKBOOKS_ENVIRONMENT as 'production' | 'sandbox') || 'sandbox';
    
    const canProceed = await quickbooksRateLimiter.waitForSlot(realmId, environment, priority, 30000);
    if (!canProceed) {
      throw new Error('QuickBooks API rate limit exceeded - request timed out waiting for available slot');
    }

    const url = `${QBO_API_BASE}/${realmId}${endpoint}`;
    let success = false;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (response.status === 429) {
        quickbooksRateLimiter.recordThrottle(realmId, environment);
        throw new Error('QuickBooks API rate limit exceeded (429) - backing off');
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`QuickBooks API error (${response.status}): ${error}`);
      }

      success = true;
      return await response.json();
    } finally {
      quickbooksRateLimiter.completeRequest(realmId, environment, success);
    }
  }

  private async queryWithPagination<T>(
    entityType: string,
    realmId: string,
    accessToken: string,
    whereClause: string = 'where Active = true'
  ): Promise<T[]> {
    const pageSize = 1000;
    let startPosition = 1;
    let allRecords: T[] = [];
    let hasMore = true;

    while (hasMore) {
      const query = `select * from ${entityType} ${whereClause} STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
      const response = await this.makeRequest<{ QueryResponse: Record<string, T[]> }>(
        'GET',
        `/query?query=${encodeURIComponent(query)}`,
        realmId,
        accessToken
      );

      const records = response.QueryResponse[entityType] || [];
      allRecords = allRecords.concat(records);

      if (records.length < pageSize) {
        hasMore = false;
      } else {
        startPosition += pageSize;
      }
    }

    return allRecords;
  }

  private async createSyncLog(
    data: Omit<InsertPartnerSyncLog, 'id' | 'createdAt'>
  ): Promise<string> {
    const [log] = await db.insert(partnerSyncLogs).values({
      ...data,
      startedAt: new Date(),
    }).returning();
    return log.id;
  }

  private async updateSyncLog(
    jobId: string,
    updates: Partial<InsertPartnerSyncLog>
  ): Promise<void> {
    await db.update(partnerSyncLogs)
      .set({
        ...updates,
        completedAt: updates.status === 'completed' || updates.status === 'failed' ? new Date() : undefined,
      })
      .where(eq(partnerSyncLogs.id, jobId));
  }

  async runInitialSync(
    workspaceId: string,
    userId: string
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const connection = await this.getConnection(workspaceId);
    const accessToken = await this.getAccessToken(connection.id);
    const realmId = connection.realmId!;

    const jobId = await this.createSyncLog({
      workspaceId,
      partnerConnectionId: connection.id,
      jobType: 'initial_sync',
      entityType: 'all',
      status: 'running',
      triggeredBy: userId,
    });

    let recordsProcessed = 0;
    let recordsMatched = 0;
    let recordsCreated = 0;
    let recordsReviewRequired = 0;
    const errors: string[] = [];

    try {
      const customerResult = await this.syncQBOCustomers(
        workspaceId,
        connection.id,
        realmId,
        accessToken,
        userId
      );
      
      recordsProcessed += customerResult.processed;
      recordsMatched += customerResult.matched;
      recordsCreated += customerResult.created;
      recordsReviewRequired += customerResult.reviewRequired;
      errors.push(...customerResult.errors);

      const employeeResult = await this.syncQBOEmployees(
        workspaceId,
        connection.id,
        realmId,
        accessToken,
        userId
      );
      
      recordsProcessed += employeeResult.processed;
      recordsMatched += employeeResult.matched;
      recordsCreated += employeeResult.created;
      recordsReviewRequired += employeeResult.reviewRequired;
      errors.push(...employeeResult.errors);

      // Sync QuickBooks Vendors (1099 Contractors)
      const vendorResult = await this.syncQBOVendors(
        workspaceId,
        connection.id,
        realmId,
        accessToken,
        userId
      );
      
      recordsProcessed += vendorResult.processed;
      recordsMatched += vendorResult.matched;
      recordsCreated += vendorResult.created;
      recordsReviewRequired += vendorResult.reviewRequired;
      errors.push(...vendorResult.errors);

      // Sync QuickBooks Items/Services for billing accuracy
      const itemsResult = await this.syncQBOItems(
        workspaceId,
        connection.id,
        realmId,
        accessToken,
        userId
      );
      
      recordsProcessed += itemsResult.processed;
      recordsMatched += itemsResult.matched;
      recordsCreated += itemsResult.created;
      recordsReviewRequired += itemsResult.reviewRequired;
      errors.push(...itemsResult.errors);

      await this.updateSyncLog(jobId, {
        status: errors.length > 0 ? 'partial' : 'completed',
        recordsProcessed,
        recordsCreated,
        recordsFailed: errors.length,
        errorDetails: errors.length > 0 ? { errors } : null,
      });

      platformEventBus.emit({
        type: 'ai_brain_action',
        data: {
          action: 'quickbooks.initial_sync_complete',
          workspaceId,
          jobId,
          recordsProcessed,
          recordsMatched,
          recordsCreated,
          recordsReviewRequired,
        },
        timestamp: new Date(),
      });

      return {
        success: errors.length === 0,
        jobId,
        recordsProcessed,
        recordsMatched,
        recordsCreated,
        recordsReviewRequired,
        errors,
        durationMs: Date.now() - startTime,
      };
    } catch (error: any) {
      // Use intelligent error analysis to determine next action
      const errorAnalysis = await this.analyzeAndHandleSyncError(
        workspaceId,
        error,
        {
          operation: 'runInitialSync',
          entityType: 'all',
          retryCount: 0,
        }
      );

      // Log audit event for sync failure with AI analysis
      await auditLogger.logEvent(
        {
          actorId: 'trinity-quickbooks-sync',
          actorType: 'AI_AGENT',
          actorName: 'Trinity QuickBooks Sync',
          workspaceId,
        },
        {
          eventType: 'quickbooks.sync_error',
          aggregateId: jobId,
          aggregateType: 'sync_job',
          payload: {
            errorMessage: error.message,
            aiAction: errorAnalysis.action,
            aiReasoning: errorAnalysis.reasoning,
            shouldRetry: errorAnalysis.shouldRetry,
            suggestedFix: errorAnalysis.suggestedFix,
          },
        },
        { generateHash: true }
      ).catch(err => console.error('[QuickBooksSyncService] Audit log failed:', err.message));

      // Emit platform event for monitoring
      platformEventBus.emit({
        type: 'ai_brain_action',
        data: {
          action: 'quickbooks.sync_error_analyzed',
          workspaceId,
          jobId,
          errorAnalysisAction: errorAnalysis.action,
          shouldRetry: errorAnalysis.shouldRetry,
        },
        timestamp: new Date(),
      });

      await this.updateSyncLog(jobId, {
        status: 'failed',
        errorDetails: { 
          message: error.message,
          aiAnalysis: errorAnalysis,
        },
      });

      return {
        success: false,
        jobId,
        recordsProcessed,
        recordsMatched,
        recordsCreated,
        recordsReviewRequired,
        errors: [`${error.message} (AI: ${errorAnalysis.action} - ${errorAnalysis.reasoning})`],
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async syncQBOCustomers(
    workspaceId: string,
    connectionId: string,
    realmId: string,
    accessToken: string,
    userId: string
  ): Promise<{ processed: number; matched: number; created: number; reviewRequired: number; errors: string[] }> {
    const qboCustomers = await this.queryWithPagination<QBOCustomer>(
      'Customer',
      realmId,
      accessToken,
      'where Active = true'
    );
    const coaileagueClients = await db.select().from(clients)
      .where(eq(clients.workspaceId, workspaceId));

    let matched = 0;
    let created = 0;
    let reviewRequired = 0;
    const errors: string[] = [];

    for (const qboCustomer of qboCustomers) {
      try {
        const match = this.findBestClientMatch(qboCustomer, coaileagueClients);

        if (match.matchType === 'email_exact' || match.matchType === 'name_exact') {
          await this.createOrUpdateMapping(
            workspaceId,
            connectionId,
            'client',
            match.coaileagueEntityId,
            qboCustomer.Id,
            qboCustomer.DisplayName,
            qboCustomer.SyncToken,
            qboCustomer.PrimaryEmailAddr?.Address,
            match.confidence,
            userId
          );
          
          // Enrich client with QuickBooks data (address, contact, notes for post orders)
          if (match.coaileagueEntityId) {
            await this.enrichClientFromQBO(match.coaileagueEntityId, qboCustomer);
          }
          matched++;
        } else if (match.matchType === 'name_fuzzy' || match.matchType === 'ambiguous') {
          await this.createManualReviewItem(
            workspaceId,
            connectionId,
            'client',
            match.coaileagueEntityId,
            match.coaileagueEntityName,
            qboCustomer.Id,
            qboCustomer.DisplayName,
            qboCustomer.PrimaryEmailAddr?.Address,
            match.confidence,
            match.ambiguousCandidates || [],
            userId
          );
          reviewRequired++;
        }
      } catch (error: any) {
        errors.push(`Customer ${qboCustomer.DisplayName}: ${error.message}`);
      }
    }

    return { processed: qboCustomers.length, matched, created, reviewRequired, errors };
  }

  private async syncQBOEmployees(
    workspaceId: string,
    connectionId: string,
    realmId: string,
    accessToken: string,
    userId: string
  ): Promise<{ processed: number; matched: number; created: number; reviewRequired: number; errors: string[] }> {
    const qboEmployees = await this.queryWithPagination<QBOEmployee>(
      'Employee',
      realmId,
      accessToken,
      'where Active = true'
    );
    const coaileagueEmployees = await db.select().from(employees)
      .where(eq(employees.workspaceId, workspaceId));

    let matched = 0;
    let created = 0;
    let reviewRequired = 0;
    const errors: string[] = [];
    const newEmployeesToInvite: Array<{ employeeId: string; email: string; firstName: string; lastName: string }> = [];

    for (const qboEmployee of qboEmployees) {
      try {
        const match = this.findBestEmployeeMatch(qboEmployee, coaileagueEmployees);

        if (match.matchType === 'email_exact' || match.matchType === 'name_exact') {
          await this.createOrUpdateMapping(
            workspaceId,
            connectionId,
            'employee',
            match.coaileagueEntityId,
            qboEmployee.Id,
            qboEmployee.DisplayName,
            qboEmployee.SyncToken,
            qboEmployee.PrimaryEmailAddr?.Address,
            match.confidence,
            userId
          );
          matched++;
        } else if (match.matchType === 'name_fuzzy' || match.matchType === 'ambiguous') {
          await this.createManualReviewItem(
            workspaceId,
            connectionId,
            'employee',
            match.coaileagueEntityId,
            match.coaileagueEntityName,
            qboEmployee.Id,
            qboEmployee.DisplayName,
            qboEmployee.PrimaryEmailAddr?.Address,
            match.confidence,
            match.ambiguousCandidates || [],
            userId
          );
          reviewRequired++;
        } else if (match.matchType === 'no_match') {
          // Create new employee record for unmatched QuickBooks employees
          const firstName = qboEmployee.GivenName || (qboEmployee.DisplayName || '').split(' ')[0] || 'Unknown';
          const lastName = qboEmployee.FamilyName || (qboEmployee.DisplayName || '').split(' ').slice(1).join(' ') || '';
          const email = qboEmployee.PrimaryEmailAddr?.Address || null;
          
          const [newEmployee] = await db.insert(employees)
            .values({
              workspaceId,
              firstName,
              lastName,
              email,
              phone: qboEmployee.PrimaryPhone?.FreeFormNumber || null,
              workerType: 'employee',
              quickbooksEmployeeId: qboEmployee.Id,
              isActive: qboEmployee.Active !== false,
              onboardingStatus: 'pending',
            })
            .returning();
          
          // Create mapping for the new employee
          await this.createOrUpdateMapping(
            workspaceId,
            connectionId,
            'employee',
            newEmployee.id,
            qboEmployee.Id,
            qboEmployee.DisplayName,
            qboEmployee.SyncToken,
            email,
            1.0,
            userId
          );
          
          // Queue for invitation if they have an email
          if (email) {
            newEmployeesToInvite.push({
              employeeId: newEmployee.id,
              email,
              firstName,
              lastName,
            });
          }
          
          created++;
        }
      } catch (error: any) {
        errors.push(`Employee ${qboEmployee.DisplayName}: ${error.message}`);
      }
    }
    
    // Send invitations for newly created employees
    if (newEmployeesToInvite.length > 0) {
      await this.sendEmployeeInvitationsAfterSync(workspaceId, userId, newEmployeesToInvite);
    }

    return { processed: qboEmployees.length, matched, created, reviewRequired, errors };
  }
  
  /**
   * Auto-send employee invitations after QuickBooks migration
   * Creates invitation records and sends emails with unique login links
   */
  private async sendEmployeeInvitationsAfterSync(
    workspaceId: string,
    invitedByUserId: string,
    employeesToInvite: Array<{ employeeId: string; email: string; firstName: string; lastName: string }>
  ): Promise<void> {
    try {
      // Get workspace and inviter details
      const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
      const [inviter] = await db.select().from(users).where(eq(users.id, invitedByUserId));
      
      if (!workspace) {
        console.error('[QuickBooksSyncService] Cannot send invites - workspace not found');
        return;
      }
      
      const workspaceName = workspace.name || 'Your Organization';
      const inviterName = inviter?.fullName || inviter?.email || 'Your Admin';
      
      for (const emp of employeesToInvite) {
        try {
          // Generate secure invite token
          const inviteToken = crypto.randomBytes(32).toString('hex');
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
          
          // Create invitation record
          const [invite] = await db.insert(onboardingInvites).values({
            workspaceId,
            employeeId: emp.employeeId,
            email: emp.email,
            firstName: emp.firstName,
            lastName: emp.lastName,
            inviteToken,
            expiresAt,
            status: 'sent' as any,
            sendEmailOnCreate: true,
            sentBy: invitedByUserId,
          }).returning();
          
          // Send invitation email
          await emailService.sendEmployeeInvitation(
            workspaceId,
            emp.email,
            inviteToken,
            {
              firstName: emp.firstName,
              inviterName,
              workspaceName,
              roleName: 'Team Member',
              expiresInDays: 7,
            }
          );
          
          console.log(`[QuickBooksSyncService] Sent invite to ${emp.email} for employee ${emp.employeeId}`);
        } catch (inviteError: any) {
          console.error(`[QuickBooksSyncService] Failed to invite ${emp.email}: ${inviteError.message}`);
        }
      }
      
      console.log(`[QuickBooksSyncService] Sent ${employeesToInvite.length} employee invitations`);
    } catch (error: any) {
      console.error('[QuickBooksSyncService] Error sending employee invitations:', error.message);
    }
  }

  /**
   * Sync QuickBooks Items/Services for billing accuracy
   * Creates or updates billing services with QB item mapping for invoice line items
   */
  private async syncQBOItems(
    workspaceId: string,
    connectionId: string,
    realmId: string,
    accessToken: string,
    userId: string
  ): Promise<{ processed: number; matched: number; created: number; reviewRequired: number; errors: string[] }> {
    try {
      // Query service-type items from QuickBooks
      const qboItems = await this.queryWithPagination<QBOItem>(
        'Item',
        realmId,
        accessToken,
        "where Active = true and Type = 'Service'"
      );
      
      // Get existing billing services
      const existingServices = await db.select().from(billingServices)
        .where(eq(billingServices.workspaceId, workspaceId));
      
      let matched = 0;
      let created = 0;
      let reviewRequired = 0;
      const errors: string[] = [];
      
      for (const qboItem of qboItems) {
        try {
          // Check if we already have a mapping for this QB item
          const existingByQBId = existingServices.find(s => s.quickbooksItemId === qboItem.Id);
          
          if (existingByQBId) {
            // Update existing service with latest QB data
            await db.update(billingServices)
              .set({
                quickbooksItemName: qboItem.Name || qboItem.FullyQualifiedName,
                description: qboItem.Description || existingByQBId.description,
                defaultHourlyRate: qboItem.UnitPrice?.toString() || existingByQBId.defaultHourlyRate,
                updatedAt: new Date(),
              })
              .where(eq(billingServices.id, existingByQBId.id));
            matched++;
            continue;
          }
          
          // Try to match by name
          const matchByName = existingServices.find(s => 
            s.serviceName?.toLowerCase() === (qboItem.Name || '').toLowerCase() ||
            s.serviceCode?.toLowerCase() === (qboItem.Name || '').toLowerCase()
          );
          
          if (matchByName) {
            // Link existing service to QB item
            await db.update(billingServices)
              .set({
                quickbooksItemId: qboItem.Id,
                quickbooksItemName: qboItem.Name || qboItem.FullyQualifiedName,
                description: qboItem.Description || matchByName.description,
                defaultHourlyRate: qboItem.UnitPrice?.toString() || matchByName.defaultHourlyRate,
                updatedAt: new Date(),
              })
              .where(eq(billingServices.id, matchByName.id));
            
            // Create mapping record
            await this.createOrUpdateMapping(
              workspaceId,
              connectionId,
              'billing_service',
              matchByName.id,
              qboItem.Id,
              qboItem.Name,
              qboItem.SyncToken,
              undefined,
              0.9,
              userId
            );
            matched++;
          } else {
            // Create new billing service from QB item
            const serviceCode = `QB-${qboItem.Id}`;
            const defaultRate = qboItem.UnitPrice?.toString() || '0.00';
            
            const [newService] = await db.insert(billingServices)
              .values({
                workspaceId,
                serviceCode,
                serviceName: qboItem.Name || `QB Item ${qboItem.Id}`,
                description: qboItem.Description || null,
                defaultHourlyRate: defaultRate,
                serviceType: 'custom',
                quickbooksItemId: qboItem.Id,
                quickbooksItemName: qboItem.Name || qboItem.FullyQualifiedName,
                isActive: qboItem.Active,
              })
              .returning();
            
            // Create mapping record
            await this.createOrUpdateMapping(
              workspaceId,
              connectionId,
              'billing_service',
              newService.id,
              qboItem.Id,
              qboItem.Name,
              qboItem.SyncToken,
              undefined,
              1.0,
              userId
            );
            
            created++;
          }
        } catch (itemError: any) {
          errors.push(`Item ${qboItem.Name}: ${itemError.message}`);
        }
      }
      
      console.log(`[QuickBooksSyncService] Items sync: ${qboItems.length} processed, ${matched} matched, ${created} created`);
      
      return { processed: qboItems.length, matched, created, reviewRequired, errors };
    } catch (error: any) {
      console.error('[QuickBooksSyncService] Items sync failed:', error.message);
      return { processed: 0, matched: 0, created: 0, reviewRequired: 0, errors: [error.message] };
    }
  }

  /**
   * Sync QuickBooks Vendors (1099 Contractors) to employees table with workerType='contractor'
   * Maps to existing contractors or creates manual review items for ambiguous matches
   */
  private async syncQBOVendors(
    workspaceId: string,
    connectionId: string,
    realmId: string,
    accessToken: string,
    userId: string
  ): Promise<{ processed: number; matched: number; created: number; reviewRequired: number; errors: string[] }> {
    // Query only 1099-eligible vendors from QuickBooks
    const qboVendors = await this.queryWithPagination<QBOVendor>(
      'Vendor',
      realmId,
      accessToken,
      'where Active = true'
    );
    
    // Filter to only 1099-eligible vendors (contractors we pay)
    const contractors = qboVendors.filter(v => v.Vendor1099 === true);
    
    // Get existing contractors from our employees table
    const coaileagueContractors = await db.select().from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.workerType, 'contractor')
      ));

    let matched = 0;
    let created = 0;
    let reviewRequired = 0;
    const errors: string[] = [];

    for (const qboVendor of contractors) {
      try {
        const match = this.findBestContractorMatch(qboVendor, coaileagueContractors);

        if (match.matchType === 'email_exact' || match.matchType === 'name_exact') {
          // Update the existing contractor with QuickBooks vendor ID
          await this.createOrUpdateMapping(
            workspaceId,
            connectionId,
            'contractor',
            match.coaileagueEntityId,
            qboVendor.Id,
            qboVendor.DisplayName,
            qboVendor.SyncToken,
            qboVendor.PrimaryEmailAddr?.Address,
            match.confidence,
            userId
          );
          
          // Update contractor with QB vendor ID and 1099 flag
          if (match.coaileagueEntityId) {
            await db.update(employees)
              .set({
                quickbooksVendorId: qboVendor.Id,
                is1099Eligible: true,
                businessName: qboVendor.CompanyName || null,
              })
              .where(eq(employees.id, match.coaileagueEntityId));
          }
          matched++;
        } else if (match.matchType === 'name_fuzzy' || match.matchType === 'ambiguous') {
          await this.createManualReviewItem(
            workspaceId,
            connectionId,
            'contractor',
            match.coaileagueEntityId,
            match.coaileagueEntityName,
            qboVendor.Id,
            qboVendor.DisplayName,
            qboVendor.PrimaryEmailAddr?.Address,
            match.confidence,
            match.ambiguousCandidates || [],
            userId
          );
          reviewRequired++;
        } else if (match.matchType === 'no_match') {
          // Create new contractor record for unmatched QuickBooks vendors
          const firstName = qboVendor.GivenName || qboVendor.DisplayName.split(' ')[0] || 'Unknown';
          const lastName = qboVendor.FamilyName || qboVendor.DisplayName.split(' ').slice(1).join(' ') || '';
          
          const [newContractor] = await db.insert(employees)
            .values({
              workspaceId,
              firstName,
              lastName,
              email: qboVendor.PrimaryEmailAddr?.Address || null,
              phone: qboVendor.PrimaryPhone?.FreeFormNumber || null,
              workerType: 'contractor',
              quickbooksVendorId: qboVendor.Id,
              businessName: qboVendor.CompanyName || null,
              is1099Eligible: true,
              isActive: qboVendor.Active !== false,
              onboardingStatus: 'completed',
            })
            .returning();
          
          // Create mapping for the new contractor
          await this.createOrUpdateMapping(
            workspaceId,
            connectionId,
            'contractor',
            newContractor.id,
            qboVendor.Id,
            qboVendor.DisplayName,
            qboVendor.SyncToken,
            qboVendor.PrimaryEmailAddr?.Address,
            1.0,
            userId
          );
          created++;
        }
      } catch (error: any) {
        errors.push(`Vendor/Contractor ${qboVendor.DisplayName}: ${error.message}`);
      }
    }

    return { processed: contractors.length, matched, created, reviewRequired, errors };
  }

  /**
   * Find best match for a QuickBooks Vendor in existing contractors
   */
  private findBestContractorMatch(
    qboVendor: QBOVendor,
    coaileagueContractors: any[]
  ): EntityMatch {
    const qboEmail = qboVendor.PrimaryEmailAddr?.Address?.toLowerCase();
    const qboName = (qboVendor.DisplayName || '').toLowerCase();
    const qboCompany = qboVendor.CompanyName?.toLowerCase();

    // First try email match (highest confidence)
    if (qboEmail) {
      const emailMatch = coaileagueContractors.find(c => 
        c.email?.toLowerCase() === qboEmail
      );
      if (emailMatch) {
        return {
          coaileagueEntityId: emailMatch.id,
          coaileagueEntityName: `${emailMatch.firstName} ${emailMatch.lastName}`,
          coaileagueEmail: emailMatch.email,
          partnerEntityId: qboVendor.Id,
          partnerEntityName: qboVendor.DisplayName,
          partnerEmail: qboEmail,
          confidence: 1.0,
          matchType: 'email_exact',
        };
      }
    }

    // Then try exact name match
    const nameMatches = coaileagueContractors.filter(c => {
      const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
      return fullName === qboName || 
             c.businessName?.toLowerCase() === qboName ||
             c.businessName?.toLowerCase() === qboCompany;
    });

    if (nameMatches.length === 1) {
      return {
        coaileagueEntityId: nameMatches[0].id,
        coaileagueEntityName: `${nameMatches[0].firstName} ${nameMatches[0].lastName}`,
        coaileagueEmail: nameMatches[0].email,
        partnerEntityId: qboVendor.Id,
        partnerEntityName: qboVendor.DisplayName,
        partnerEmail: qboEmail,
        confidence: 0.9,
        matchType: 'name_exact',
      };
    }

    // Try fuzzy name matching
    const fuzzyMatches = coaileagueContractors.filter(c => {
      const fullName = `${c.firstName} ${c.lastName}`;
      return this.fuzzyNameMatch(fullName, qboVendor.DisplayName) > 0.7 ||
             (c.businessName && this.fuzzyNameMatch(c.businessName, qboVendor.DisplayName) > 0.7);
    });

    if (fuzzyMatches.length === 1) {
      return {
        coaileagueEntityId: fuzzyMatches[0].id,
        coaileagueEntityName: `${fuzzyMatches[0].firstName} ${fuzzyMatches[0].lastName}`,
        coaileagueEmail: fuzzyMatches[0].email,
        partnerEntityId: qboVendor.Id,
        partnerEntityName: qboVendor.DisplayName,
        partnerEmail: qboEmail,
        confidence: 0.75,
        matchType: 'name_fuzzy',
      };
    }

    if (fuzzyMatches.length > 1) {
      return {
        coaileagueEntityId: fuzzyMatches[0].id,
        coaileagueEntityName: `${fuzzyMatches[0].firstName} ${fuzzyMatches[0].lastName}`,
        coaileagueEmail: fuzzyMatches[0].email,
        partnerEntityId: qboVendor.Id,
        partnerEntityName: qboVendor.DisplayName,
        partnerEmail: qboEmail,
        confidence: 0.5,
        matchType: 'ambiguous',
        ambiguousCandidates: fuzzyMatches.map(m => ({
          id: m.id,
          name: `${m.firstName} ${m.lastName}`,
          email: m.email,
        })),
      };
    }

    // No match found
    return {
      coaileagueEntityId: '',
      coaileagueEntityName: '',
      partnerEntityId: qboVendor.Id,
      partnerEntityName: qboVendor.DisplayName,
      partnerEmail: qboEmail,
      confidence: 0,
      matchType: 'no_match',
    };
  }

  private findBestClientMatch(
    qboCustomer: QBOCustomer,
    coaileagueClients: any[]
  ): EntityMatch {
    const qboEmail = qboCustomer.PrimaryEmailAddr?.Address?.toLowerCase();
    const qboName = (qboCustomer.DisplayName || '').toLowerCase();

    if (qboEmail) {
      const emailMatch = coaileagueClients.find(c => 
        c.contactEmail?.toLowerCase() === qboEmail
      );
      if (emailMatch) {
        return {
          coaileagueEntityId: emailMatch.id,
          coaileagueEntityName: emailMatch.name,
          coaileagueEmail: emailMatch.contactEmail,
          partnerEntityId: qboCustomer.Id,
          partnerEntityName: qboCustomer.DisplayName,
          partnerEmail: qboEmail,
          confidence: 1.0,
          matchType: 'email_exact',
        };
      }
    }

    const nameMatches = coaileagueClients.filter(c => 
      c.name.toLowerCase() === qboName ||
      c.companyName?.toLowerCase() === qboName
    );

    if (nameMatches.length === 1) {
      return {
        coaileagueEntityId: nameMatches[0].id,
        coaileagueEntityName: nameMatches[0].name,
        coaileagueEmail: nameMatches[0].contactEmail,
        partnerEntityId: qboCustomer.Id,
        partnerEntityName: qboCustomer.DisplayName,
        partnerEmail: qboEmail,
        confidence: 0.9,
        matchType: 'name_exact',
      };
    }

    const fuzzyMatches = coaileagueClients.filter(c => 
      this.fuzzyNameMatch(c.name, qboCustomer.DisplayName) > 0.7 ||
      (c.companyName && this.fuzzyNameMatch(c.companyName, qboCustomer.DisplayName) > 0.7)
    );

    if (fuzzyMatches.length === 1) {
      return {
        coaileagueEntityId: fuzzyMatches[0].id,
        coaileagueEntityName: fuzzyMatches[0].name,
        coaileagueEmail: fuzzyMatches[0].contactEmail,
        partnerEntityId: qboCustomer.Id,
        partnerEntityName: qboCustomer.DisplayName,
        partnerEmail: qboEmail,
        confidence: 0.75,
        matchType: 'name_fuzzy',
      };
    }

    if (fuzzyMatches.length > 1) {
      return {
        coaileagueEntityId: fuzzyMatches[0].id,
        coaileagueEntityName: fuzzyMatches[0].name,
        coaileagueEmail: fuzzyMatches[0].contactEmail,
        partnerEntityId: qboCustomer.Id,
        partnerEntityName: qboCustomer.DisplayName,
        partnerEmail: qboEmail,
        confidence: 0.5,
        matchType: 'ambiguous',
        ambiguousCandidates: fuzzyMatches.map(m => ({
          id: m.id,
          name: m.name,
          email: m.contactEmail,
        })),
      };
    }

    return {
      coaileagueEntityId: '',
      coaileagueEntityName: '',
      partnerEntityId: qboCustomer.Id,
      partnerEntityName: qboCustomer.DisplayName,
      partnerEmail: qboEmail,
      confidence: 0,
      matchType: 'no_match',
    };
  }

  /**
   * Enrich a CoAIleague client with QuickBooks Customer data
   * Called after a successful client mapping to sync address, contact, and notes
   * This enables Trinity scheduling with accurate driving distance calculations
   */
  private async enrichClientFromQBO(
    clientId: string,
    qboCustomer: QBOCustomer
  ): Promise<void> {
    // Prefer ShipAddr (service location) over BillAddr for scheduling
    const addr = qboCustomer.ShipAddr || qboCustomer.BillAddr;
    
    const updateData: Record<string, any> = {
      quickbooksClientId: qboCustomer.Id,
      qboSyncToken: qboCustomer.SyncToken,
      lastQboSyncAt: new Date(),
      qboSyncStatus: 'synced',
      updatedAt: new Date(),
    };
    
    // Enrich with address data for Trinity driving distance
    if (addr) {
      if (addr.Line1) updateData.address = addr.Line1;
      if (addr.Line2) updateData.addressLine2 = addr.Line2;
      if (addr.City) updateData.city = addr.City;
      if (addr.CountrySubDivisionCode) updateData.state = addr.CountrySubDivisionCode;
      if (addr.PostalCode) updateData.postalCode = addr.PostalCode;
      if (addr.Country) updateData.country = addr.Country;
      
      // Geocoordinates for Trinity driving distance calculations
      if (addr.Lat) updateData.latitude = addr.Lat;
      if (addr.Long) updateData.longitude = addr.Long;
    }
    
    // Email and phone for POC
    if (qboCustomer.PrimaryEmailAddr?.Address) {
      updateData.email = qboCustomer.PrimaryEmailAddr.Address;
    }
    if (qboCustomer.PrimaryPhone?.FreeFormNumber) {
      updateData.phone = qboCustomer.PrimaryPhone.FreeFormNumber;
    }
    
    // Company name
    if (qboCustomer.CompanyName) {
      updateData.companyName = qboCustomer.CompanyName;
    }
    
    // Notes can contain post orders for security industry
    if (qboCustomer.Notes) {
      updateData.postOrders = qboCustomer.Notes;
    }
    
    await db.update(clients)
      .set(updateData)
      .where(eq(clients.id, clientId));
    
    console.log(`[QuickBooksSync] Enriched client ${clientId} with QB data (address, contact, notes)`);
  }

  private findBestEmployeeMatch(
    qboEmployee: QBOEmployee,
    coaileagueEmployees: any[]
  ): EntityMatch {
    const qboEmail = qboEmployee.PrimaryEmailAddr?.Address?.toLowerCase();
    const qboName = (qboEmployee.DisplayName || '').toLowerCase();
    const qboFirst = qboEmployee.GivenName?.toLowerCase();
    const qboLast = qboEmployee.FamilyName?.toLowerCase();

    if (qboEmail) {
      const emailMatch = coaileagueEmployees.find(e => 
        e.email?.toLowerCase() === qboEmail
      );
      if (emailMatch) {
        return {
          coaileagueEntityId: emailMatch.id,
          coaileagueEntityName: `${emailMatch.firstName} ${emailMatch.lastName}`,
          coaileagueEmail: emailMatch.email,
          partnerEntityId: qboEmployee.Id,
          partnerEntityName: qboEmployee.DisplayName,
          partnerEmail: qboEmail,
          confidence: 1.0,
          matchType: 'email_exact',
        };
      }
    }

    const nameMatches = coaileagueEmployees.filter(e => {
      const fullName = `${e.firstName} ${e.lastName}`.toLowerCase();
      return fullName === qboName ||
        (qboFirst && qboLast && 
         e.firstName?.toLowerCase() === qboFirst && 
         e.lastName?.toLowerCase() === qboLast);
    });

    if (nameMatches.length === 1) {
      return {
        coaileagueEntityId: nameMatches[0].id,
        coaileagueEntityName: `${nameMatches[0].firstName} ${nameMatches[0].lastName}`,
        coaileagueEmail: nameMatches[0].email,
        partnerEntityId: qboEmployee.Id,
        partnerEntityName: qboEmployee.DisplayName,
        partnerEmail: qboEmail,
        confidence: 0.9,
        matchType: 'name_exact',
      };
    }

    if (nameMatches.length > 1) {
      return {
        coaileagueEntityId: nameMatches[0].id,
        coaileagueEntityName: `${nameMatches[0].firstName} ${nameMatches[0].lastName}`,
        coaileagueEmail: nameMatches[0].email,
        partnerEntityId: qboEmployee.Id,
        partnerEntityName: qboEmployee.DisplayName,
        partnerEmail: qboEmail,
        confidence: 0.5,
        matchType: 'ambiguous',
        ambiguousCandidates: nameMatches.map(m => ({
          id: m.id,
          name: `${m.firstName} ${m.lastName}`,
          email: m.email,
        })),
      };
    }

    // Fuzzy matching for employees (consistent with clients/contractors)
    const fuzzyMatches = coaileagueEmployees.filter(e => {
      const fullName = `${e.firstName} ${e.lastName}`;
      return this.fuzzyNameMatch(fullName, qboEmployee.DisplayName) > 0.7;
    });

    if (fuzzyMatches.length === 1) {
      return {
        coaileagueEntityId: fuzzyMatches[0].id,
        coaileagueEntityName: `${fuzzyMatches[0].firstName} ${fuzzyMatches[0].lastName}`,
        coaileagueEmail: fuzzyMatches[0].email,
        partnerEntityId: qboEmployee.Id,
        partnerEntityName: qboEmployee.DisplayName,
        partnerEmail: qboEmail,
        confidence: 0.75,
        matchType: 'name_fuzzy',
      };
    }

    if (fuzzyMatches.length > 1) {
      return {
        coaileagueEntityId: fuzzyMatches[0].id,
        coaileagueEntityName: `${fuzzyMatches[0].firstName} ${fuzzyMatches[0].lastName}`,
        coaileagueEmail: fuzzyMatches[0].email,
        partnerEntityId: qboEmployee.Id,
        partnerEntityName: qboEmployee.DisplayName,
        partnerEmail: qboEmail,
        confidence: 0.5,
        matchType: 'ambiguous',
        ambiguousCandidates: fuzzyMatches.map(m => ({
          id: m.id,
          name: `${m.firstName} ${m.lastName}`,
          email: m.email,
        })),
      };
    }

    return {
      coaileagueEntityId: '',
      coaileagueEntityName: '',
      partnerEntityId: qboEmployee.Id,
      partnerEntityName: qboEmployee.DisplayName,
      partnerEmail: qboEmail,
      confidence: 0,
      matchType: 'no_match',
    };
  }

  private fuzzyNameMatch(a: string, b: string): number {
    const aLower = a.toLowerCase().trim();
    const bLower = b.toLowerCase().trim();
    
    if (aLower === bLower) return 1.0;
    if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.85;
    
    const aWords = new Set(aLower.split(/\s+/));
    const bWords = new Set(bLower.split(/\s+/));
    const intersection = [...aWords].filter(w => bWords.has(w));
    
    if (intersection.length > 0) {
      return intersection.length / Math.max(aWords.size, bWords.size);
    }
    
    return 0;
  }

  private async createOrUpdateMapping(
    workspaceId: string,
    connectionId: string,
    entityType: string,
    coaileagueEntityId: string,
    partnerEntityId: string,
    partnerEntityName: string,
    syncToken: string,
    matchEmail: string | undefined,
    confidence: number,
    userId: string
  ): Promise<void> {
    const [existing] = await db.select()
      .from(partnerDataMappings)
      .where(
        and(
          eq(partnerDataMappings.workspaceId, workspaceId),
          eq(partnerDataMappings.partnerType, 'quickbooks'),
          eq(partnerDataMappings.entityType, entityType),
          eq(partnerDataMappings.coaileagueEntityId, coaileagueEntityId)
        )
      )
      .limit(1);

    if (existing) {
      await db.update(partnerDataMappings)
        .set({
          partnerEntityId,
          partnerEntityName,
          syncToken,
          matchEmail,
          matchConfidence: confidence,
          syncStatus: 'synced',
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(partnerDataMappings.id, existing.id));
    } else {
      await db.insert(partnerDataMappings).values({
        workspaceId,
        partnerConnectionId: connectionId,
        partnerType: 'quickbooks',
        entityType,
        coaileagueEntityId,
        partnerEntityId,
        partnerEntityName,
        syncToken,
        matchEmail,
        matchConfidence: confidence,
        syncStatus: 'synced',
        lastSyncAt: new Date(),
        mappingSource: 'auto',
        createdBy: userId,
      });
    }
  }

  private async createManualReviewItem(
    workspaceId: string,
    connectionId: string,
    entityType: string,
    coaileagueEntityId: string,
    coaileagueEntityName: string,
    partnerEntityId: string,
    partnerEntityName: string,
    partnerEmail: string | undefined,
    confidence: number,
    candidates: { id: string; name: string; email?: string }[],
    userId: string
  ): Promise<void> {
    const [existing] = await db.select()
      .from(partnerManualReviewQueue)
      .where(
        and(
          eq(partnerManualReviewQueue.workspaceId, workspaceId),
          eq(partnerManualReviewQueue.partnerEntityId, partnerEntityId),
          eq(partnerManualReviewQueue.status, 'pending')
        )
      )
      .limit(1);

    if (existing) {
      return;
    }

    await db.insert(partnerManualReviewQueue).values({
      workspaceId,
      partnerConnectionId: connectionId,
      entityType,
      coaileagueEntityId,
      coaileagueEntityName,
      partnerEntityId,
      partnerEntityName,
      partnerEmail,
      matchConfidence: confidence,
      candidateMatches: candidates,
      status: 'pending',
    });
  }

  generateInvoiceRequestId(
    realmId: string,
    weekEnding: Date,
    clientQboId: string,
    lineItems: { description: string; amount: number }[]
  ): string {
    const linesHash = crypto.createHash('sha256')
      .update(JSON.stringify(lineItems.map(l => ({ d: l.description, a: l.amount }))))
      .digest('hex')
      .substring(0, 8);
    
    const weekEndingStr = weekEnding.toISOString().split('T')[0];
    
    return `invoice:${realmId}:${weekEndingStr}:${clientQboId}:${linesHash}`;
  }

  async createInvoiceWithIdempotency(
    workspaceId: string,
    clientId: string,
    weekEnding: Date,
    lineItems: { description: string; amount: number; hours?: number }[],
    userId: string
  ): Promise<{ invoiceId: string; wasCreated: boolean }> {
    const connection = await this.getConnection(workspaceId);
    const accessToken = await this.getAccessToken(connection.id);
    const realmId = connection.realmId!;

    const [clientMapping] = await db.select()
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

    if (!clientMapping) {
      throw new Error('Client not mapped to QuickBooks. Please sync client first.');
    }

    const requestId = this.generateInvoiceRequestId(
      realmId,
      weekEnding,
      clientMapping.partnerEntityId,
      lineItems
    );

    const [existingRequest] = await db.select()
      .from(partnerInvoiceIdempotency)
      .where(
        and(
          eq(partnerInvoiceIdempotency.partnerConnectionId, connection.id),
          eq(partnerInvoiceIdempotency.requestId, requestId)
        )
      )
      .limit(1);

    if (existingRequest) {
      if (existingRequest.status === 'completed' && existingRequest.qboInvoiceId) {
        return { invoiceId: existingRequest.qboInvoiceId, wasCreated: false };
      }

      if (existingRequest.status === 'processing') {
        throw new Error('Invoice creation already in progress');
      }
    }

    const [idempotencyRecord] = existingRequest 
      ? [existingRequest]
      : await db.insert(partnerInvoiceIdempotency).values({
          workspaceId,
          partnerConnectionId: connection.id,
          requestId,
          weekEnding,
          clientQboId: clientMapping.partnerEntityId,
          linesHash: requestId.split(':').pop()!,
          status: 'processing',
        }).returning();

    try {
      const totalAmount = lineItems.reduce((sum, l) => sum + l.amount, 0);

      const qboInvoice = {
        TxnDate: weekEnding.toISOString().split('T')[0],
        CustomerRef: { value: clientMapping.partnerEntityId },
        Line: lineItems.map(item => ({
          DetailType: 'SalesItemLineDetail',
          Amount: item.amount,
          Description: item.description,
          SalesItemLineDetail: {
            ItemRef: { value: '1', name: 'Services' },
            Qty: item.hours || 1,
            UnitPrice: item.hours ? item.amount / item.hours : item.amount,
          },
        })),
      };

      const response = await this.makeRequest<{ Invoice: { Id: string; SyncToken: string } }>(
        'POST',
        '/invoice',
        realmId,
        accessToken,
        qboInvoice
      );

      await db.update(partnerInvoiceIdempotency)
        .set({
          status: 'completed',
          qboInvoiceId: response.Invoice.Id,
          qboSyncToken: response.Invoice.SyncToken,
          completedAt: new Date(),
        })
        .where(eq(partnerInvoiceIdempotency.id, idempotencyRecord.id));

      return { invoiceId: response.Invoice.Id, wasCreated: true };

    } catch (error: any) {
      await db.update(partnerInvoiceIdempotency)
        .set({
          status: 'failed',
          errorMessage: error.message,
          retryCount: (existingRequest?.retryCount || 0) + 1,
        })
        .where(eq(partnerInvoiceIdempotency.id, idempotencyRecord.id));

      throw error;
    }
  }

  async handleWebhook(
    signature: string,
    payload: string,
    webhookSecret: string
  ): Promise<{ processed: boolean; entities: string[] }> {
    const computedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('base64');

    if (signature !== computedSignature) {
      throw new Error('Invalid webhook signature');
    }

    const event = JSON.parse(payload);
    const entities: string[] = [];

    if (event.eventNotifications) {
      for (const notification of event.eventNotifications) {
        const realmId = notification.realmId;
        const dataChangeEvents = notification.dataChangeEvent?.entities || [];

        for (const entity of dataChangeEvents) {
          entities.push(`${entity.name}:${entity.id}`);
          
          await this.processWebhookEntity(realmId, entity);
        }
      }
    }

    return { processed: true, entities };
  }

  private async processWebhookEntity(
    realmId: string,
    entity: { name: string; id: string; operation: string }
  ): Promise<void> {
    const [connection] = await db.select()
      .from(partnerConnections)
      .where(eq(partnerConnections.realmId, realmId))
      .limit(1);

    if (!connection) {
      console.log(`[QBO Webhook] No connection found for realm ${realmId}`);
      return;
    }

    if (entity.name === 'Customer' || entity.name === 'Employee') {
      await db.update(partnerDataMappings)
        .set({ 
          syncStatus: 'stale',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(partnerDataMappings.partnerConnectionId, connection.id),
            eq(partnerDataMappings.partnerEntityId, entity.id)
          )
        );
    }

    if (entity.name === 'Invoice' && entity.operation === 'Update') {
      await db.update(partnerDataMappings)
        .set({
          syncStatus: 'stale',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(partnerDataMappings.partnerConnectionId, connection.id),
            eq(partnerDataMappings.entityType, 'invoice'),
            eq(partnerDataMappings.partnerEntityId, entity.id)
          )
        );
    }
  }

  async runCDCPoll(
    workspaceId: string,
    userId: string,
    sinceDate?: Date
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const connection = await this.getConnection(workspaceId);
    const accessToken = await this.getAccessToken(connection.id);
    const realmId = connection.realmId!;

    const since = sinceDate || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sinceStr = since.toISOString();

    const jobId = await this.createSyncLog({
      workspaceId,
      partnerConnectionId: connection.id,
      jobType: 'cdc_poll',
      entityType: 'all',
      status: 'running',
      triggeredBy: userId,
    });

    try {
      const response = await this.makeRequest<{ CDCResponse: any[] }>(
        'GET',
        `/cdc?changedSince=${sinceStr}&entities=Customer,Employee,Invoice`,
        realmId,
        accessToken
      );

      let recordsProcessed = 0;

      for (const queryResponse of response.CDCResponse || []) {
        const customers = queryResponse.QueryResponse?.filter((q: any) => q.Customer)
          .flatMap((q: any) => q.Customer) || [];
        const employees = queryResponse.QueryResponse?.filter((q: any) => q.Employee)
          .flatMap((q: any) => q.Employee) || [];

        recordsProcessed += customers.length + employees.length;
      }

      await this.updateSyncLog(jobId, {
        status: 'completed',
        recordsProcessed,
      });

      return {
        success: true,
        jobId,
        recordsProcessed,
        recordsMatched: 0,
        recordsCreated: 0,
        recordsReviewRequired: 0,
        errors: [],
        durationMs: Date.now() - startTime,
      };

    } catch (error: any) {
      await this.updateSyncLog(jobId, {
        status: 'failed',
        errorDetails: { message: error.message },
      });

      return {
        success: false,
        jobId,
        recordsProcessed: 0,
        recordsMatched: 0,
        recordsCreated: 0,
        recordsReviewRequired: 0,
        errors: [error.message],
        durationMs: Date.now() - startTime,
      };
    }
  }

  async getManualReviewQueue(
    workspaceId: string,
    status: 'pending' | 'resolved' | 'skipped' = 'pending'
  ): Promise<any[]> {
    return await db.select()
      .from(partnerManualReviewQueue)
      .where(
        and(
          eq(partnerManualReviewQueue.workspaceId, workspaceId),
          eq(partnerManualReviewQueue.status, status)
        )
      )
      .orderBy(desc(partnerManualReviewQueue.createdAt));
  }

  async resolveManualReview(
    reviewItemId: string,
    resolution: 'linked_existing' | 'created_new' | 'skipped',
    selectedCoaileagueEntityId: string | null,
    userId: string
  ): Promise<void> {
    const [item] = await db.select()
      .from(partnerManualReviewQueue)
      .where(eq(partnerManualReviewQueue.id, reviewItemId))
      .limit(1);

    if (!item) {
      throw new Error('Review item not found');
    }

    if (resolution === 'linked_existing' && selectedCoaileagueEntityId) {
      const [mapping] = await db.insert(partnerDataMappings).values({
        workspaceId: item.workspaceId,
        partnerConnectionId: item.partnerConnectionId,
        partnerType: 'quickbooks',
        entityType: item.entityType,
        coaileagueEntityId: selectedCoaileagueEntityId,
        partnerEntityId: item.partnerEntityId,
        partnerEntityName: item.partnerEntityName,
        matchEmail: item.partnerEmail,
        matchConfidence: 1.0,
        syncStatus: 'synced',
        lastSyncAt: new Date(),
        mappingSource: 'manual',
        createdBy: userId,
      }).returning();

      await db.update(partnerManualReviewQueue)
        .set({
          status: 'resolved',
          resolution,
          resolvedMappingId: mapping.id,
          resolvedBy: userId,
          resolvedAt: new Date(),
        })
        .where(eq(partnerManualReviewQueue.id, reviewItemId));
    } else {
      await db.update(partnerManualReviewQueue)
        .set({
          status: resolution === 'skipped' ? 'skipped' : 'resolved',
          resolution,
          resolvedBy: userId,
          resolvedAt: new Date(),
        })
        .where(eq(partnerManualReviewQueue.id, reviewItemId));
    }
  }

  // ---------------------------------------------------------------------------
  // INTELLIGENT ERROR HANDLING WITH GEMINI AI
  // ---------------------------------------------------------------------------
  
  /**
   * Analyze QuickBooks sync errors using Gemini AI and determine retry strategy
   * Returns: RETRY (with modifications), FIX_DATA, ESCALATE, or ABORT
   */
  async analyzeAndHandleSyncError(
    workspaceId: string,
    error: Error | any,
    context: {
      operation: string;
      entityType?: string;
      payload?: any;
      retryCount: number;
    }
  ): Promise<{
    action: 'RETRY' | 'FIX_DATA' | 'ESCALATE' | 'ABORT';
    reasoning: string;
    modifications?: Record<string, any>;
    suggestedFix?: string;
    shouldRetry: boolean;
    retryDelayMs?: number;
  }> {
    console.log(`[QuickBooksSyncService] Analyzing error with Gemini AI: ${error.message}`);

    try {
      const prompt = `You are a QuickBooks integration specialist. Analyze this sync error and recommend an action.

ERROR DETAILS:
- Message: ${error.message}
- Code: ${error.code || 'unknown'}
- Operation: ${context.operation}
- Entity Type: ${context.entityType || 'unknown'}
- Retry Count: ${context.retryCount}

PAYLOAD SAMPLE (if any):
${context.payload ? JSON.stringify(context.payload, null, 2).substring(0, 500) : 'N/A'}

DECISION FRAMEWORK:
- RETRY: Temporary issue (rate limit, timeout, network) - safe to retry with delay
- FIX_DATA: Data validation issue (missing required fields, format errors)
- ESCALATE: Authentication/authorization issue or unknown error requiring human attention
- ABORT: Permanent failure, data corruption, or exceeded max retries (${context.retryCount >= 3})

Respond in JSON format:
{
  "action": "RETRY" | "FIX_DATA" | "ESCALATE" | "ABORT",
  "reasoning": "Brief explanation",
  "modifications": { "field": "corrected_value" },
  "suggestedFix": "What needs to change for FIX_DATA cases",
  "retryDelayMs": 1000
}`;

      // Use metered client for proper billing tracking
      const result = await meteredGemini.generate({
        workspaceId,
        featureKey: 'quickbooks_error_analysis',
        prompt,
        model: 'gemini-1.5-flash',
        temperature: 0.2,
        maxOutputTokens: 500,
        metadata: { operation: context.operation, entityType: context.entityType }
      });

      if (!result.success) {
        console.error(`[QuickBooksSyncService] AI analysis failed: ${result.error}`);
        return {
          action: 'ESCALATE',
          reasoning: 'AI analysis failed, escalating for human review',
          shouldRetry: false,
        };
      }

      const responseText = result.text;
      
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // LLM Judge validation for retry decisions
        if (parsed.action === 'RETRY' && context.retryCount >= 2) {
          try {
            await enhancedLLMJudge.initialize();
            const riskEval = await enhancedLLMJudge.evaluateRisk({
              subjectId: `qb-retry-${workspaceId}-${Date.now()}`,
              subjectType: 'action',
              content: {
                operation: context.operation,
                retryCount: context.retryCount,
                errorMessage: error.message,
                aiRecommendation: parsed.action,
              },
              context: { entityType: context.entityType },
              workspaceId,
              domain: 'quickbooks',
              actionType: 'quickbooks.retry_sync',
            });

            if (riskEval.verdict === 'blocked' || riskEval.verdict === 'rejected') {
              console.log(`[QuickBooksSyncService] LLM Judge blocked retry: ${riskEval.reasoning}`);
              return {
                action: 'ESCALATE',
                reasoning: `LLM Judge blocked retry after ${context.retryCount} attempts: ${riskEval.reasoning}`,
                shouldRetry: false,
              };
            }
          } catch (judgeError) {
            console.error('[QuickBooksSyncService] LLM Judge evaluation failed:', judgeError);
          }
        }

        return {
          action: parsed.action,
          reasoning: parsed.reasoning,
          modifications: parsed.modifications,
          suggestedFix: parsed.suggestedFix,
          shouldRetry: parsed.action === 'RETRY',
          retryDelayMs: parsed.retryDelayMs || 2000,
        };
      }
    } catch (aiError: any) {
      console.error('[QuickBooksSyncService] Gemini analysis failed:', aiError.message);
    }

    // Fallback: Basic error classification without AI
    const isRateLimit = error.message?.includes('rate') || error.message?.includes('429');
    const isAuth = error.message?.includes('auth') || error.message?.includes('401') || error.message?.includes('403');
    const isTimeout = error.message?.includes('timeout') || error.message?.includes('ETIMEDOUT');

    if (context.retryCount >= 3) {
      return { action: 'ABORT', reasoning: 'Max retries exceeded', shouldRetry: false };
    }
    if (isAuth) {
      return { action: 'ESCALATE', reasoning: 'Authentication issue detected', shouldRetry: false };
    }
    if (isRateLimit || isTimeout) {
      return { action: 'RETRY', reasoning: 'Temporary issue detected', shouldRetry: true, retryDelayMs: 5000 };
    }

    return { action: 'ESCALATE', reasoning: 'Unknown error requires human review', shouldRetry: false };
  }
}

export const quickbooksSyncService = new QuickBooksSyncService();
