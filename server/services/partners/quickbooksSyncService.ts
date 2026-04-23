import { db } from '../../db';
import { 
  partnerConnections,
  partnerDataMappings,
  clients,
  employees,
  timeEntries,
  invoices,
  onboardingInvites,
  workspaces,
  workspaceMembers,
  users,
  billingServices,
  InsertPartnerDataMapping,
  // @ts-expect-error — TS migration: fix in refactoring sprint
  InsertPartnerSyncLog,
} from '@shared/schema';
import { createNotification } from '../notificationService';
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
import { ownerManagerEmployeeService, ROLE_HOLDER_ROLES } from '../ownerManagerEmployeeService';
import { providerPreferenceService } from '../billing/providerPreferenceService';
import { quickbooksOrchestration } from '../orchestration/quickbooksOrchestration';
import { partnerInvoiceIdempotency, partnerManualReviewQueue, partnerSyncLogs } from '@shared/schema';
import { createLogger } from '../../lib/logger';
const log = createLogger('quickbooksSyncService');


// RC2 (Phase 2): Tx type so insert+mapping pairs can run inside the caller's transaction.
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
  matchType: 'email_exact' | 'name_exact' | 'name_fuzzy' | 'ambiguous' | 'user_match' | 'no_match';
  ambiguousCandidates?: { id: string; name: string; email?: string }[];
  userMatch?: { userId: string; email: string; firstName?: string | null; lastName?: string | null; role?: string | null };
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
    const environment = INTEGRATIONS.quickbooks.getEnvironment();
    
    const canProceed = await quickbooksRateLimiter.waitForSlot(realmId, environment, priority, 30000);
    if (!canProceed) {
      throw new Error('QuickBooks API rate limit exceeded - request timed out waiting for available slot');
    }

    const url = `${QBO_API_BASE}/${realmId}${endpoint}`;
    let success = false;

    try {
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
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const [log] = await db.insert(partnerSyncLogs).values({
      workspaceId: 'system',
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
    const result = await quickbooksOrchestration.executeOperation<SyncResult>(
      {
        workspaceId,
        userId,
        operationType: 'initial_sync',
        operationName: 'Initial QuickBooks Sync',
        triggeredBy: 'user',
        payload: { syncType: 'initial', entities: ['customers', 'employees', 'vendors', 'items'] },
      },
      async (connectionCtx, orchestrationCtx) => {
        return this.runInitialSyncInternal(workspaceId, userId, connectionCtx.accessToken, connectionCtx.realmId);
      }
    );

    if (!result.success) {
      throw new Error(result.error || 'Initial sync failed');
    }
    return result.data!;
  }

  private async runInitialSyncInternal(
    workspaceId: string,
    userId: string,
    accessToken: string,
    realmId: string
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const connection = await this.getConnection(workspaceId);

    const jobId = await this.createSyncLog({
      workspaceId,
      partnerConnectionId: connection.id,
      jobType: 'initial_sync',
      entityType: 'all',
      status: 'running',
      triggeredBy: userId,
    });

    // Use orchestration-provided accessToken and realmId for all sync operations

    let recordsProcessed = 0;
    let recordsMatched = 0;
    let recordsCreated = 0;
    let recordsReviewRequired = 0;
    const errors: string[] = [];

    try {
      const preSnapshot = await this.snapshotManuallyEditedTimeEntries(workspaceId);

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

      const reconciliation = await this.reconcileManualEditsAfterSync(workspaceId, preSnapshot);

      await this.updateSyncLog(jobId, {
        status: errors.length > 0 ? 'partial' : 'completed',
        recordsProcessed,
        recordsCreated,
        recordsFailed: errors.length,
        errorDetails: errors.length > 0 ? { errors, manualEditReconciliation: reconciliation } : (reconciliation.discrepancies.length > 0 ? { manualEditReconciliation: reconciliation } : null),
      });

      platformEventBus.publish({
        type: 'ai_brain_action',
        category: 'ai_brain',
        title: 'QuickBooks Initial Sync Complete',
        description: `Processed ${recordsProcessed} records: ${recordsMatched} matched, ${recordsCreated} created, ${recordsReviewRequired} need review`,
        workspaceId,
        metadata: { action: 'quickbooks.initial_sync_complete', jobId, recordsProcessed, recordsMatched, recordsCreated, recordsReviewRequired },
      }).catch((err) => log.warn('[quickbooksSyncService] Fire-and-forget failed:', err));

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
      ).catch(err => log.error('[QuickBooksSyncService] Audit log failed:', (err instanceof Error ? err.message : String(err))));

      // Emit platform event for monitoring
      platformEventBus.publish({
        type: 'ai_brain_action',
        category: 'ai_brain',
        title: 'QuickBooks Sync Error Analyzed',
        description: `Error analyzed: action=${errorAnalysis.action}, shouldRetry=${errorAnalysis.shouldRetry}`,
        workspaceId,
        metadata: { action: 'quickbooks.sync_error_analyzed', jobId, errorAnalysisAction: errorAnalysis.action, shouldRetry: errorAnalysis.shouldRetry },
      }).catch((err) => log.warn('[quickbooksSyncService] Fire-and-forget failed:', err));

      // Notify org owner when sync permanently fails (ABORT or ESCALATE)
      if (errorAnalysis.action === 'ABORT' || errorAnalysis.action === 'ESCALATE') {
        try {
          const ownerRows = await db
            .select({ userId: workspaceMembers.userId })
            .from(workspaceMembers)
            .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, 'owner')));
          await Promise.all(ownerRows.map(({ userId }) =>
            createNotification({
              userId,
              workspaceId,
              type: 'system',
              title: `QuickBooks Sync ${errorAnalysis.action === 'ABORT' ? 'Permanently Failed' : 'Requires Attention'}`,
              message: `${errorAnalysis.reasoning}${errorAnalysis.suggestedFix ? ` Suggested fix: ${errorAnalysis.suggestedFix}` : ''} Please review your QuickBooks integration settings.`,
              priority: 'urgent',
              idempotencyKey: `system-${Date.now()}-`
            }).catch(() => null)
          ));
        } catch (notifyErr: any) {
          log.error('[QuickBooksSyncService] Failed to notify org owner on ABORT/ESCALATE:', notifyErr.message);
        }
      }

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
        errors.push(`Customer ${qboCustomer.DisplayName}: ${(error instanceof Error ? error.message : String(error))}`);
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
    // DEDUPLICATION STEP 1: Ensure all workspace role holders (owner, managers, supervisors)
    // have employee records BEFORE we try to match QuickBooks employees.
    // This prevents duplicate employee creation for org_owner, co_owner, manager, supervisor.
    const roleHolderResult = await this.ensureRoleHoldersAreEmployees(workspaceId);
    log.info(`[QuickBooksSyncService] Pre-sync deduplication: ${roleHolderResult.details.length} actions taken`);
    roleHolderResult.details.forEach(d => log.info(`  - ${d}`));
    
    const qboEmployees = await this.queryWithPagination<QBOEmployee>(
      'Employee',
      realmId,
      accessToken,
      'where Active = true'
    );
    
    // Re-fetch employees after role holder sync to include any newly created/linked records
    const coaileagueEmployees = await db.select().from(employees)
      .where(eq(employees.workspaceId, workspaceId));

    let matched = 0;
    let created = 0;
    let reviewRequired = 0;
    const errors: string[] = [];
    const newEmployeesToInvite: Array<{ employeeId: string; email: string; firstName: string; lastName: string }> = [];

    for (const qboEmployee of qboEmployees) {
      try {
        const match = await this.findBestEmployeeMatch(qboEmployee, coaileagueEmployees, workspaceId);

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
        } else if (match.matchType === 'user_match' && match.userMatch) {
          // DEDUPLICATION: User exists but no employee record - create linked employee
          const userInfo = match.userMatch;
          const firstName = qboEmployee.GivenName || userInfo.firstName || (qboEmployee.DisplayName || '').split(' ')[0] || 'Unknown';
          const lastName = qboEmployee.FamilyName || userInfo.lastName || (qboEmployee.DisplayName || '').split(' ').slice(1).join(' ') || '';
          
          // RC2 (Phase 2): employee INSERT + mapping INSERT must be atomic —
          // a partial write leaves an employee with no QB mapping (sync gap).
          const newEmployee = await db.transaction(async (tx) => {
            const [newEmp] = await tx.insert(employees)
              // @ts-expect-error — TS migration: fix in refactoring sprint
              .values({
                workspaceId,
                userId: userInfo.userId, // Link to existing user
                firstName,
                lastName,
                email: userInfo.email,
                phone: qboEmployee.PrimaryPhone?.FreeFormNumber || null,
                role: this.getRoleTitleFromWorkspaceRole(userInfo.role || 'staff'),
                workspaceRole: this.mapUserRoleToWorkspaceRole(userInfo.role || 'staff'),
                organizationalTitle: this.mapRoleToOrgTitle(userInfo.role || 'staff'),
                workerType: 'employee',
                quickbooksEmployeeId: qboEmployee.Id,
                isActive: qboEmployee.Active !== false,
                onboardingStatus: 'completed', // Already has user account
              })
              .returning();
            await this.createOrUpdateMapping(
              workspaceId, connectionId, 'employee',
              newEmp.id, qboEmployee.Id, qboEmployee.DisplayName,
              qboEmployee.SyncToken, userInfo.email, match.confidence, userId, tx
            );
            return newEmp;
          });
          
          log.info(`[QuickBooksSyncService] Created employee record for existing user ${userInfo.email} (linked to QuickBooks)`);
          created++;
        } else if (match.matchType === 'no_match') {
          // DEDUPLICATION STEP 2: Before creating a new employee, check if a user with this email exists
          // This catches cases where the user exists but ensureRoleHoldersAreEmployees didn't catch them
          // (e.g., staff users who aren't role holders but still shouldn't be duplicated)
          const firstName = qboEmployee.GivenName || (qboEmployee.DisplayName || '').split(' ')[0] || 'Unknown';
          const lastName = qboEmployee.FamilyName || (qboEmployee.DisplayName || '').split(' ').slice(1).join(' ') || '';
          const email = qboEmployee.PrimaryEmailAddr?.Address || null;
          
          // Check for existing user with same email in this workspace (case-insensitive)
          let linkedUserId: string | null = null;
          if (email) {
            const [existingUser] = await db.select()
              .from(users)
              .where(
                and(
                  ilike(users.email, email), // Case-insensitive email match for consistency
                  eq(users.currentWorkspaceId, workspaceId)
                )
              )
              .limit(1);
            
            if (existingUser) {
              linkedUserId = existingUser.id;
              log.info(`[QuickBooksSyncService] Found existing user ${email} - will link to new employee record`);
            }
          }
          
          // RC2 (Phase 2): employee INSERT + mapping INSERT are atomic —
          // a partial write leaves an employee with no QB mapping (sync gap).
          const newEmployee = await db.transaction(async (tx) => {
            const [newEmp] = await tx.insert(employees)
              .values({
                workspaceId,
                userId: linkedUserId, // Link to existing user if found
                firstName,
                lastName,
                email,
                phone: qboEmployee.PrimaryPhone?.FreeFormNumber || null,
                workerType: 'employee',
                quickbooksEmployeeId: qboEmployee.Id,
                isActive: qboEmployee.Active !== false,
                onboardingStatus: linkedUserId ? 'completed' : 'pending', // Already completed if user exists
              })
              .returning();
            await this.createOrUpdateMapping(
              workspaceId, connectionId, 'employee',
              newEmp.id, qboEmployee.Id, qboEmployee.DisplayName,
              // @ts-expect-error — TS migration: fix in refactoring sprint
              qboEmployee.SyncToken, email, 1.0, userId, tx
            );
            return newEmp;
          });

          // Queue for invitation if they have an email AND no linked user
          if (email && !linkedUserId) {
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
        errors.push(`Employee ${qboEmployee.DisplayName}: ${(error instanceof Error ? error.message : String(error))}`);
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
        log.error('[QuickBooksSyncService] Cannot send invites - workspace not found');
        return;
      }
      
      const workspaceName = workspace.name || 'Your Organization';
      const inviterName = (inviter as any)?.fullName || inviter?.email || 'Your Admin';
      
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
            sendEmailOnCreate: true, // email-tracked
            sentBy: invitedByUserId,
          }).returning();
          
          // Send invitation email
          await emailService.sendEmployeeInvitation( // nds-exempt: one-time invite token delivery
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
          
          log.info(`[QuickBooksSyncService] Sent invite to ${emp.email} for employee ${emp.employeeId}`);
        } catch (inviteError: any) {
          log.error(`[QuickBooksSyncService] Failed to invite ${emp.email}: ${inviteError.message}`);
        }
      }
      
      log.info(`[QuickBooksSyncService] Sent ${employeesToInvite.length} employee invitations`);
    } catch (error: any) {
      log.error('[QuickBooksSyncService] Error sending employee invitations:', (error instanceof Error ? error.message : String(error)));
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
            // RC2 (Phase 2): billingService UPDATE + mapping INSERT are atomic.
            await db.transaction(async (tx) => {
              await tx.update(billingServices)
                .set({
                  quickbooksItemId: qboItem.Id,
                  quickbooksItemName: qboItem.Name || qboItem.FullyQualifiedName,
                  description: qboItem.Description || matchByName.description,
                  defaultHourlyRate: qboItem.UnitPrice?.toString() || matchByName.defaultHourlyRate,
                  updatedAt: new Date(),
                })
                .where(eq(billingServices.id, matchByName.id));
              await this.createOrUpdateMapping(
                workspaceId, connectionId, 'billing_service',
                matchByName.id, qboItem.Id, qboItem.Name,
                qboItem.SyncToken, undefined, 0.9, userId, tx
              );
            });
            matched++;
          } else {
            // Create new billing service from QB item
            const serviceCode = `QB-${qboItem.Id}`;
            const defaultRate = qboItem.UnitPrice?.toString() || '0.00';
            
            // RC2 (Phase 2): billingService INSERT + mapping INSERT are atomic.
            await db.transaction(async (tx) => {
              const [newService] = await tx.insert(billingServices)
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
              await this.createOrUpdateMapping(
                workspaceId, connectionId, 'billing_service',
                newService.id, qboItem.Id, qboItem.Name,
                qboItem.SyncToken, undefined, 1.0, userId, tx
              );
            });

            created++;
          }
        } catch (itemError: any) {
          errors.push(`Item ${qboItem.Name}: ${itemError.message}`);
        }
      }
      
      log.info(`[QuickBooksSyncService] Items sync: ${qboItems.length} processed, ${matched} matched, ${created} created`);
      
      return { processed: qboItems.length, matched, created, reviewRequired, errors };
    } catch (error: any) {
      log.error('[QuickBooksSyncService] Items sync failed:', (error instanceof Error ? error.message : String(error)));
      return { processed: 0, matched: 0, created: 0, reviewRequired: 0, errors: [(error instanceof Error ? error.message : String(error))] };
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
          
          // RC2 (Phase 2): contractor INSERT + mapping INSERT are atomic.
          await db.transaction(async (tx) => {
            const [newContractor] = await tx.insert(employees)
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
            await this.createOrUpdateMapping(
              workspaceId, connectionId, 'contractor',
              newContractor.id, qboVendor.Id, qboVendor.DisplayName,
              qboVendor.SyncToken, qboVendor.PrimaryEmailAddr?.Address,
              1.0, userId, tx
            );
          });
          created++;
        }
      } catch (error: any) {
        errors.push(`Vendor/Contractor ${qboVendor.DisplayName}: ${(error instanceof Error ? error.message : String(error))}`);
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
          coaileagueEntityName: emailMatch.companyName || [emailMatch.firstName, emailMatch.lastName].filter(Boolean).join(' ') || 'Unknown',
          coaileagueEmail: emailMatch.contactEmail,
          partnerEntityId: qboCustomer.Id,
          partnerEntityName: qboCustomer.DisplayName,
          partnerEmail: qboEmail,
          confidence: 1.0,
          matchType: 'email_exact',
        };
      }
    }

    const getClientDisplayName = (c: any) => c.companyName || [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unknown';

    const nameMatches = coaileagueClients.filter(c => 
      getClientDisplayName(c).toLowerCase() === qboName ||
      c.companyName?.toLowerCase() === qboName
    );

    if (nameMatches.length === 1) {
      return {
        coaileagueEntityId: nameMatches[0].id,
        coaileagueEntityName: getClientDisplayName(nameMatches[0]),
        coaileagueEmail: nameMatches[0].contactEmail,
        partnerEntityId: qboCustomer.Id,
        partnerEntityName: qboCustomer.DisplayName,
        partnerEmail: qboEmail,
        confidence: 0.9,
        matchType: 'name_exact',
      };
    }

    const fuzzyMatches = coaileagueClients.filter(c => 
      this.fuzzyNameMatch(getClientDisplayName(c), qboCustomer.DisplayName) > 0.7 ||
      (c.companyName && this.fuzzyNameMatch(c.companyName, qboCustomer.DisplayName) > 0.7)
    );

    if (fuzzyMatches.length === 1) {
      return {
        coaileagueEntityId: fuzzyMatches[0].id,
        coaileagueEntityName: getClientDisplayName(fuzzyMatches[0]),
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
        coaileagueEntityName: getClientDisplayName(fuzzyMatches[0]),
        coaileagueEmail: fuzzyMatches[0].contactEmail,
        partnerEntityId: qboCustomer.Id,
        partnerEntityName: qboCustomer.DisplayName,
        partnerEmail: qboEmail,
        confidence: 0.5,
        matchType: 'ambiguous',
        ambiguousCandidates: fuzzyMatches.map(m => ({
          id: m.id,
          name: getClientDisplayName(m),
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
    
    log.info(`[QuickBooksSync] Enriched client ${clientId} with QB data (address, contact, notes)`);
  }

  private async findBestEmployeeMatch(
    qboEmployee: QBOEmployee,
    coaileagueEmployees: any[],
    workspaceId: string
  ): Promise<EntityMatch> {
    const qboEmail = qboEmployee.PrimaryEmailAddr?.Address?.toLowerCase();
    const qboName = (qboEmployee.DisplayName || '').toLowerCase();
    const qboFirst = qboEmployee.GivenName?.toLowerCase();
    const qboLast = qboEmployee.FamilyName?.toLowerCase();

    // STEP 1: Check for exact email match in employees table
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

    // STEP 2: Check for exact name match in employees table
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

    // STEP 3: Fuzzy matching for employees
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

    // STEP 4: DEDUPLICATION - Check users table before returning no_match
    // This catches cases where a user exists but doesn't have an employee record yet
    // Use case-insensitive matching since emails may not be normalized in DB
    if (qboEmail) {
      const [existingUser] = await db.select()
        .from(users)
        .where(
          and(
            ilike(users.email, qboEmail), // Case-insensitive email match
            eq(users.currentWorkspaceId, workspaceId)
          )
        )
        .limit(1);
      
      if (existingUser) {
        // User exists but no employee record - flag for manual review
        // This prevents creating a duplicate and ensures proper linking
        log.info(`[QuickBooksSyncService] Found user ${qboEmail} without employee record - flagging for review`);
        return {
          coaileagueEntityId: '', // No employee ID yet
          coaileagueEntityName: `${existingUser.firstName || ''} ${existingUser.lastName || ''}`.trim() || existingUser.email,
          coaileagueEmail: existingUser.email,
          partnerEntityId: qboEmployee.Id,
          partnerEntityName: qboEmployee.DisplayName,
          partnerEmail: qboEmail,
          confidence: 0.85, // High confidence - same email
          matchType: 'user_match', // New match type for user-only matches
          userMatch: {
            userId: existingUser.id,
            email: existingUser.email,
            firstName: existingUser.firstName,
            lastName: existingUser.lastName,
            role: existingUser.role,
          }
        };
      }
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

  /**
   * DEDUPLICATION STEP 1: Ensure all workspace role holders have employee records
   * This prevents duplicate employees when syncing from QuickBooks by ensuring
   * org_owner, co_owner, manager, and supervisor users already have linked employee records.
   * 
   * 7-Step Pattern: FETCH → VALIDATE → PROCESS → MUTATE
   */
  /**
   * Ensures all role holders (owners, managers, supervisors) have employee records
   * Delegates to centralized OwnerManagerEmployeeService for consistency
   * Enhanced with QuickBooks merge logic for synced employees
   */
  private async ensureRoleHoldersAreEmployees(workspaceId: string): Promise<{
    created: number;
    linked: number;
    alreadyExist: number;
    details: string[];
  }> {
    log.info(`[QuickBooksSyncService] Starting ensureRoleHoldersAreEmployees for workspace ${workspaceId}`);
    
    // Use centralized service for role holder employee creation
    // This ensures consistent behavior with certification setup
    const syncResult = await ownerManagerEmployeeService.syncWorkspaceRoleHolders(workspaceId);
    
    // Map the result to the expected format
    const result = {
      created: (syncResult as any).created.length,
      linked: (syncResult as any).linked.length,
      alreadyExist: (syncResult as any).skipped.length,
      details: [
        ...(syncResult as any).created.map((e: any) => `Created employee record for ${e.role}: ${e.email} (${e.id})`),
        ...(syncResult as any).linked.map((e: any) => `Linked user ${e.email} to existing employee record (${e.firstName} ${e.lastName})`),
      ]
    };
    
    // Additional QuickBooks-specific merge logic for synced employees
    // Check for employees that came from QuickBooks that might match role holders
    const qboEmployees = await db.select().from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        isNull(employees.userId)
      ));
    
    // Get all workspace users who are role holders
    const workspaceUsers = await db.select()
      .from(users)
      .where(eq(users.currentWorkspaceId, workspaceId));
    
    for (const user of workspaceUsers) {
      const userRole = user.role?.toLowerCase();
      if (!userRole || !ROLE_HOLDER_ROLES.includes(userRole as any)) {
        continue;
      }
      
      // Check if user already has a linked employee record
      const hasEmployeeRecord = await db.select().from(employees)
        .where(and(
          eq(employees.workspaceId, workspaceId),
          eq(employees.userId, user.id)
        )).limit(1);
      
      if (hasEmployeeRecord.length > 0) {
        continue; // Already has an employee record
      }
      
      // Try phone number match (QuickBooks-specific enhancement)
      if (user.phone) {
        const normalizedPhone = user.phone.replace(/\D/g, '');
        const phoneMatch = qboEmployees.find(e => {
          const empPhone = e.phone?.replace(/\D/g, '') || '';
          return empPhone && empPhone === normalizedPhone;
        });
        
        if (phoneMatch) {
          await db.update(employees)
            .set({ 
              userId: user.id,
              // @ts-expect-error — TS migration: fix in refactoring sprint
              workspaceRole: this.mapUserRoleToWorkspaceRole(userRole),
              organizationalTitle: this.mapRoleToOrgTitle(userRole),
            })
            .where(eq(employees.id, phoneMatch.id));
          result.linked++;
          result.details.push(`Linked user ${user.email} to QuickBooks employee by phone (${phoneMatch.firstName} ${phoneMatch.lastName})`);
        }
      }
    }
    
    log.info(`[QuickBooksSyncService] ensureRoleHoldersAreEmployees: Created ${result.created}, Linked ${result.linked}, Already exist ${result.alreadyExist}`);
    return result;
  }

  private mapUserRoleToWorkspaceRole(userRole: string): 'org_owner' | 'co_owner' | 'manager' | 'department_manager' | 'supervisor' | 'staff' | 'employee' | 'contractor' | 'viewer' {
    const roleMap: Record<string, any> = {
      'org_owner': 'org_owner',
      'co_owner': 'co_owner',
      'manager': 'manager',
      'department_manager': 'department_manager',
      'supervisor': 'supervisor',
      'staff': 'staff',
      'employee': 'employee',
    };
    return roleMap[userRole.toLowerCase()] || 'staff';
  }

  private mapRoleToOrgTitle(userRole: string): string {
    const titleMap: Record<string, string> = {
      'org_owner': 'owner',
      'co_owner': 'owner',
      'manager': 'manager',
      'department_manager': 'manager',
      'supervisor': 'supervisor',
      'staff': 'staff',
      'employee': 'staff',
    };
    return titleMap[userRole.toLowerCase()] || 'staff';
  }

  private getRoleTitleFromWorkspaceRole(userRole: string): string {
    const titleMap: Record<string, string> = {
      'org_owner': 'Owner',
      'co_owner': 'Co-Owner',
      'manager': 'Manager',
      'department_manager': 'Department Manager',
      'supervisor': 'Supervisor',
      'staff': 'Staff',
      'employee': 'Employee',
    };
    return titleMap[userRole.toLowerCase()] || 'Staff';
  }

  // RC2 (Phase 2): Optional tx param so callers that insert an entity first can
  // include the mapping write in the same transaction — entity + mapping are atomic.
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
    userId: string,
    tx?: DbTransaction
  ): Promise<void> {
    const client = tx ?? db;

    const [existing] = await client.select()
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
      await client.update(partnerDataMappings)
        .set({
          partnerEntityId,
          partnerEntityName,
          syncToken,
          matchEmail,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          matchConfidence: confidence,
          syncStatus: 'synced',
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(partnerDataMappings.id, existing.id));
    } else {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await client.insert(partnerDataMappings).values({
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
          // @ts-expect-error — TS migration: fix in refactoring sprint
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
      coaileagueEntityEmail: partnerEmail,
      candidateMatches: candidates.map(c => ({ ...c, matchConfidence: confidence, partnerEntityId, partnerEntityName })),
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
    const result = await quickbooksOrchestration.executeOperation<{ invoiceId: string; wasCreated: boolean }>(
      {
        workspaceId,
        userId,
        operationType: 'push_invoice',
        operationName: 'Create QuickBooks Invoice',
        triggeredBy: 'user',
        payload: { clientId, weekEnding: weekEnding.toISOString(), lineItemCount: lineItems.length },
      },
      async (connectionCtx, orchestrationCtx) => {
        return this.createInvoiceWithIdempotencyInternal(
          workspaceId, clientId, weekEnding, lineItems, userId, 
          connectionCtx.accessToken, connectionCtx.realmId
        );
      }
    );

    if (!result.success) {
      throw new Error(result.error || 'Invoice creation failed');
    }
    return result.data!;
  }

  private async createInvoiceWithIdempotencyInternal(
    workspaceId: string,
    clientId: string,
    weekEnding: Date,
    lineItems: { description: string; amount: number; hours?: number }[],
    userId: string,
    accessToken: string,
    realmId: string
  ): Promise<{ invoiceId: string; wasCreated: boolean }> {
    const connection = await this.getConnection(workspaceId);

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
      // @ts-expect-error — TS migration: fix in refactoring sprint
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
      if (existingRequest.status === 'completed' && existingRequest.partnerInvoiceId) {
        return { invoiceId: existingRequest.partnerInvoiceId, wasCreated: false };
      }

      if (existingRequest.status === 'processing') {
        throw new Error('Invoice creation already in progress');
      }
    }

    const [idempotencyRecord] = existingRequest 
      ? [existingRequest]
      // @ts-expect-error — TS migration: fix in refactoring sprint
      : await db.insert(partnerInvoiceIdempotency).values({
          workspaceId,
          partnerConnectionId: connection.id,
          requestId,
          requestPayload: {
            weekEnding: weekEnding?.toISOString?.() || weekEnding,
            clientQboId: clientMapping.partnerEntityId,
            linesHash: requestId.split(':').pop()!,
          },
          status: 'processing',
        }).returning();

    try {
      const totalAmount = lineItems.reduce((sum, l) => sum + l.amount, 0);

      const { generateTrinityInvoiceNumber } = await import('../trinityInvoiceNumbering');
      const trinityDocNumber = (idempotencyRecord as any).partnerInvoiceNumber 
        || await generateTrinityInvoiceNumber(workspaceId, 'client', { date: weekEnding });

      if (!(idempotencyRecord as any).partnerInvoiceNumber) {
        await db.update(partnerInvoiceIdempotency)
          .set({ partnerInvoiceNumber: trinityDocNumber } as any)
          .where(eq(partnerInvoiceIdempotency.id, idempotencyRecord.id));
      }

      const qboInvoice = {
        DocNumber: trinityDocNumber,
        TxnDate: weekEnding.toISOString().split('T')[0],
        CustomerRef: { value: clientMapping.partnerEntityId },
        PrivateNote: `Trinity Automated Invoice | ${trinityDocNumber}`,
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
          partnerInvoiceId: response.Invoice.Id,
          partnerInvoiceNumber: trinityDocNumber,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          responsePayload: { syncToken: response.Invoice.SyncToken },
          updatedAt: new Date(),
        })
        .where(eq(partnerInvoiceIdempotency.id, idempotencyRecord.id));

      return { invoiceId: response.Invoice.Id, wasCreated: true };

    } catch (error: any) {
      await db.update(partnerInvoiceIdempotency)
        .set({
          status: 'failed',
          // @ts-expect-error — TS migration: fix in refactoring sprint
          lastError: (error instanceof Error ? error.message : String(error)),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          attempts: (existingRequest?.attempts || 0) + 1,
          lastAttemptAt: new Date(),
          updatedAt: new Date(),
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

    let event: any;
    try {
      event = JSON.parse(payload);
    } catch {
      throw new Error('Invalid webhook payload: malformed JSON');
    }
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
      log.info(`[QBO Webhook] No connection found for realm ${realmId}`);
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

    if (entity.name === 'Invoice') {
      if (entity.operation === 'Update' || entity.operation === 'Create') {
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
      } else if (entity.operation === 'Delete') {
        await db.update(partnerDataMappings)
          .set({
            syncStatus: 'deleted_in_partner',
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
  }

  async runCDCPoll(
    workspaceId: string,
    userId: string,
    sinceDate?: Date
  ): Promise<SyncResult> {
    const result = await quickbooksOrchestration.executeOperation<SyncResult>(
      {
        workspaceId,
        userId,
        operationType: 'incremental_sync',
        operationName: 'QuickBooks CDC Poll',
        triggeredBy: 'cron',
        payload: { sinceDateISO: sinceDate?.toISOString() || null },
      },
      async (connectionCtx, orchestrationCtx) => {
        return this.runCDCPollInternal(workspaceId, userId, connectionCtx.accessToken, connectionCtx.realmId, sinceDate);
      }
    );

    if (!result.success) {
      const error = new Error(result.error || 'CDC poll failed');
      (error as any).orchestrationId = result.orchestrationId;
      (error as any).errorCode = result.errorCode;
      (error as any).remediation = result.remediation;
      (error as any).retryable = result.retryable;
      throw error;
    }
    return result.data!;
  }

  private async runCDCPollInternal(
    workspaceId: string,
    userId: string,
    accessToken: string,
    realmId: string,
    sinceDate?: Date
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const connection = await this.getConnection(workspaceId);

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
        const customers: any[] = queryResponse.QueryResponse?.filter((q: any) => q.Customer)
          .flatMap((q: any) => q.Customer) || [];
        const employees: any[] = queryResponse.QueryResponse?.filter((q: any) => q.Employee)
          .flatMap((q: any) => q.Employee) || [];
        const invoiceEntities: any[] = queryResponse.QueryResponse?.filter((q: any) => q.Invoice)
          .flatMap((q: any) => q.Invoice) || [];

        recordsProcessed += customers.length + employees.length + invoiceEntities.length;

        for (const customer of customers) {
          if (!customer.Id) continue;
          await db.update(partnerDataMappings)
            .set({ syncStatus: 'stale', updatedAt: new Date() })
            .where(and(
              eq(partnerDataMappings.partnerConnectionId, connection.id),
              eq(partnerDataMappings.partnerEntityId, String(customer.Id)),
            )).catch((err) => log.warn('[quickbooksSyncService] Fire-and-forget failed:', err));
        }

        for (const emp of employees) {
          if (!emp.Id) continue;
          await db.update(partnerDataMappings)
            .set({ syncStatus: 'stale', updatedAt: new Date() })
            .where(and(
              eq(partnerDataMappings.partnerConnectionId, connection.id),
              eq(partnerDataMappings.partnerEntityId, String(emp.Id)),
            )).catch((err) => log.warn('[quickbooksSyncService] Fire-and-forget failed:', err));
        }

        for (const inv of invoiceEntities) {
          if (!inv.Id) continue;
          await db.update(partnerDataMappings)
            .set({ syncStatus: 'stale', updatedAt: new Date() })
            .where(and(
              eq(partnerDataMappings.partnerConnectionId, connection.id),
              eq(partnerDataMappings.entityType, 'invoice'),
              eq(partnerDataMappings.partnerEntityId, String(inv.Id)),
            )).catch((err) => log.warn('[quickbooksSyncService] Fire-and-forget failed:', err));
        }
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
        errorDetails: { message: (error instanceof Error ? error.message : String(error)) },
      });

      return {
        success: false,
        jobId,
        recordsProcessed: 0,
        recordsMatched: 0,
        recordsCreated: 0,
        recordsReviewRequired: 0,
        errors: [(error instanceof Error ? error.message : String(error))],
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
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const [mapping] = await db.insert(partnerDataMappings).values({
        workspaceId: item.workspaceId,
        partnerConnectionId: item.partnerConnectionId,
        partnerType: 'quickbooks',
        entityType: item.entityType,
        coaileagueEntityId: selectedCoaileagueEntityId,
        partnerEntityId: (item as any).partnerEntityId,
        partnerEntityName: (item as any).partnerEntityName,
        matchEmail: (item as any).partnerEmail,
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
  // TIME ENTRY MANUAL EDIT AUDIT TRAIL FOR QB SYNC
  // ---------------------------------------------------------------------------

  async snapshotManuallyEditedTimeEntries(
    workspaceId: string
  ): Promise<{ snapshotId: string; entries: any[]; timestamp: Date }> {
    const manuallyEditedEntries = await db.select({
      id: timeEntries.id,
      employeeId: timeEntries.employeeId,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
      totalHours: timeEntries.totalHours,
      hourlyRate: timeEntries.hourlyRate,
      totalAmount: timeEntries.totalAmount,
      notes: timeEntries.notes,
      manuallyEdited: timeEntries.manuallyEdited,
      manualEditedAt: timeEntries.manualEditedAt,
      manualEditedBy: timeEntries.manualEditedBy,
      manualEditReason: timeEntries.manualEditReason,
      preEditSnapshot: timeEntries.preEditSnapshot,
      quickbooksTimeActivityId: timeEntries.quickbooksTimeActivityId,
      quickbooksSyncStatus: timeEntries.quickbooksSyncStatus,
    })
    .from(timeEntries)
    .where(and(
      eq(timeEntries.workspaceId, workspaceId),
      eq(timeEntries.manuallyEdited, true)
    ));

    const snapshotId = crypto.randomUUID();
    const timestamp = new Date();

    await auditLogger.logEvent(
      {
        actorId: 'trinity-quickbooks-sync',
        actorType: 'AI_AGENT',
        actorName: 'Trinity QuickBooks Sync',
        workspaceId,
      },
      {
        eventType: 'quickbooks.pre_sync_snapshot',
        aggregateId: snapshotId,
        aggregateType: 'time_entry_snapshot',
        payload: {
          snapshotId,
          totalManuallyEditedEntries: manuallyEditedEntries.length,
          entryIds: manuallyEditedEntries.map(e => e.id),
          entrySummaries: manuallyEditedEntries.map(e => ({
            id: e.id,
            totalHours: e.totalHours,
            manualEditedAt: e.manualEditedAt,
            manualEditReason: e.manualEditReason,
            qbActivityId: e.quickbooksTimeActivityId,
          })),
          timestamp: timestamp.toISOString(),
        },
      },
      { generateHash: true }
    ).catch(err => log.error('[QuickBooksSyncService] Pre-sync snapshot audit log failed:', (err instanceof Error ? err.message : String(err))));

    log.info(`[QuickBooksSyncService] Pre-sync snapshot ${snapshotId}: ${manuallyEditedEntries.length} manually edited entries captured`);

    return { snapshotId, entries: manuallyEditedEntries, timestamp };
  }

  async reconcileManualEditsAfterSync(
    workspaceId: string,
    preSnapshot: { snapshotId: string; entries: any[]; timestamp: Date }
  ): Promise<{ preserved: number; overwritten: number; discrepancies: any[] }> {
    const discrepancies: any[] = [];
    let preserved = 0;
    let overwritten = 0;

    for (const snapshotEntry of preSnapshot.entries) {
      const [currentEntry] = await db.select({
        id: timeEntries.id,
        totalHours: timeEntries.totalHours,
        clockIn: timeEntries.clockIn,
        clockOut: timeEntries.clockOut,
        manuallyEdited: timeEntries.manuallyEdited,
        manualEditedAt: timeEntries.manualEditedAt,
        quickbooksSyncStatus: timeEntries.quickbooksSyncStatus,
        quickbooksLastSync: timeEntries.quickbooksLastSync,
        notes: timeEntries.notes,
      })
      .from(timeEntries)
      .where(eq(timeEntries.id, snapshotEntry.id))
      .limit(1);

      if (!currentEntry) {
        discrepancies.push({
          entryId: snapshotEntry.id,
          type: 'entry_deleted',
          snapshotHours: snapshotEntry.totalHours,
          currentHours: null,
        });
        overwritten++;
        continue;
      }

      if (!currentEntry.manuallyEdited) {
        discrepancies.push({
          entryId: snapshotEntry.id,
          type: 'manual_flag_cleared',
          snapshotHours: snapshotEntry.totalHours,
          currentHours: currentEntry.totalHours,
        });

        await db.update(timeEntries)
          .set({
            manuallyEdited: true,
            manualEditedAt: snapshotEntry.manualEditedAt,
            manualEditedBy: snapshotEntry.manualEditedBy,
            manualEditReason: snapshotEntry.manualEditReason,
            preEditSnapshot: snapshotEntry.preEditSnapshot,
          })
          .where(eq(timeEntries.id, snapshotEntry.id));

        overwritten++;
        continue;
      }

      const hoursMatch = String(currentEntry.totalHours) === String(snapshotEntry.totalHours);
      if (!hoursMatch) {
        discrepancies.push({
          entryId: snapshotEntry.id,
          type: 'hours_changed',
          snapshotHours: snapshotEntry.totalHours,
          currentHours: currentEntry.totalHours,
          editReason: snapshotEntry.manualEditReason,
        });
        overwritten++;
      } else {
        preserved++;
      }
    }

    await auditLogger.logEvent(
      {
        actorId: 'trinity-quickbooks-sync',
        actorType: 'AI_AGENT',
        actorName: 'Trinity QuickBooks Sync',
        workspaceId,
      },
      {
        eventType: 'quickbooks.post_sync_reconciliation',
        aggregateId: preSnapshot.snapshotId,
        aggregateType: 'time_entry_reconciliation',
        payload: {
          snapshotId: preSnapshot.snapshotId,
          totalEntries: preSnapshot.entries.length,
          preserved,
          overwritten,
          discrepancyCount: discrepancies.length,
          discrepancies,
          reconciliationTimestamp: new Date().toISOString(),
        },
      },
      { generateHash: true }
    ).catch(err => log.error('[QuickBooksSyncService] Post-sync reconciliation audit log failed:', (err instanceof Error ? err.message : String(err))));

    if (discrepancies.length > 0) {
      platformEventBus.publish({
        type: 'ai_brain_action',
        category: 'ai_brain',
        title: 'QuickBooks Manual Edit Discrepancy Detected',
        description: `Post-sync reconciliation: ${preserved} preserved, ${overwritten} overwritten, ${discrepancies.length} discrepancies`,
        workspaceId,
        metadata: { action: 'quickbooks.manual_edit_discrepancy', snapshotId: preSnapshot.snapshotId, preserved, overwritten, discrepancyCount: discrepancies.length },
      }).catch((err) => log.warn('[quickbooksSyncService] Fire-and-forget failed:', err));
    }

    log.info(`[QuickBooksSyncService] Post-sync reconciliation: ${preserved} preserved, ${overwritten} overwritten, ${discrepancies.length} discrepancies`);

    return { preserved, overwritten, discrepancies };
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
    log.info(`[QuickBooksSyncService] Analyzing error with Gemini AI: ${error.message}`);

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
        model: 'gemini-2.5-flash',
        temperature: 0.2,
        maxOutputTokens: 500,
        metadata: { operation: context.operation, entityType: context.entityType }
      });

      if (!result.success) {
        log.error(`[QuickBooksSyncService] AI analysis failed: ${result.error}`);
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
              log.info(`[QuickBooksSyncService] LLM Judge blocked retry: ${riskEval.reasoning}`);
              return {
                action: 'ESCALATE',
                reasoning: `LLM Judge blocked retry after ${context.retryCount} attempts: ${riskEval.reasoning}`,
                shouldRetry: false,
              };
            }
          } catch (judgeError) {
            log.error('[QuickBooksSyncService] LLM Judge evaluation failed:', judgeError);
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
      log.error('[QuickBooksSyncService] Gemini analysis failed:', aiError.message);
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
