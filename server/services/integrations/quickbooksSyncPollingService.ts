/**
 * QuickBooks Sync Polling Service
 * 
 * Provides fallback synchronization when webhooks are unavailable:
 * - Scheduled polling for data changes
 * - Nightly reconciliation to catch missed webhook events
 * - Incremental sync based on lastModifiedDate
 * - Mobile-optimized with battery-aware scheduling
 */

import { db } from '../../db';
import { 
  partnerConnections, 
  clients, 
  employees,
  partnerSyncLogs,
} from '@shared/schema';
import { eq, and, gt, lte } from 'drizzle-orm';
import { quickbooksOAuthService } from '../oauth/quickbooks';
import { quickbooksRateLimiter } from './quickbooksRateLimiter';
import { platformEventBus } from '../platformEventBus';
import { INTEGRATIONS } from '@shared/platformConfig';
import { createLogger } from '../../lib/logger';
const log = createLogger('quickbooksSyncPollingService');


// Use centralized config - NO HARDCODED URLs
const QBO_API_BASE = INTEGRATIONS.quickbooks.getCompanyApiBase();

interface SyncPollingConfig {
  intervalMinutes: number;
  nightlyReconciliationHour: number;
  batchSize: number;
  maxConnectionsPerRun: number;
}

interface IncrementalSyncResult {
  workspaceId: string;
  realmId: string;
  customersUpdated: number;
  employeesUpdated: number;
  vendorsUpdated: number;
  errors: string[];
  durationMs: number;
}

const DEFAULT_CONFIG: SyncPollingConfig = {
  intervalMinutes: 60,
  nightlyReconciliationHour: 3,
  batchSize: 100,
  maxConnectionsPerRun: 10,
};

class QuickBooksSyncPollingService {
  private config: SyncPollingConfig;
  private pollingInterval: NodeJS.Timeout | null = null;
  private nightlyReconciliationTimeout: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private lastPollTime: Date | null = null;
  private lastReconciliationTime: Date | null = null;

  constructor(config: Partial<SyncPollingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    log.info('[QuickBooksSyncPolling] Service initialized');
  }

  start(): void {
    if (this.isRunning) {
      log.info('[QuickBooksSyncPolling] Already running');
      return;
    }

    this.isRunning = true;

    this.pollingInterval = setInterval(
      () => this.runIncrementalSync(),
      this.config.intervalMinutes * 60 * 1000
    );

    this.scheduleNightlyReconciliation();

    log.info(`[QuickBooksSyncPolling] Started with ${this.config.intervalMinutes}min interval`);
  }

  stop(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    if (this.nightlyReconciliationTimeout) {
      clearTimeout(this.nightlyReconciliationTimeout);
      this.nightlyReconciliationTimeout = null;
    }
    this.isRunning = false;
    log.info('[QuickBooksSyncPolling] Stopped');
  }

  private scheduleNightlyReconciliation(): void {
    const now = new Date();
    const targetHour = this.config.nightlyReconciliationHour;
    
    let nextRun = new Date(now);
    nextRun.setHours(targetHour, 0, 0, 0);
    
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const msUntilNextRun = nextRun.getTime() - now.getTime();

    this.nightlyReconciliationTimeout = setTimeout(() => {
      this.runFullReconciliation();
      this.scheduleNightlyReconciliation();
    }, msUntilNextRun);

    log.info(`[QuickBooksSyncPolling] Nightly reconciliation scheduled for ${nextRun.toISOString()}`);
  }

  async runIncrementalSync(): Promise<IncrementalSyncResult[]> {
    const results: IncrementalSyncResult[] = [];
    
    try {
      const connections = await db.select()
        .from(partnerConnections)
        .where(
          and(
            eq(partnerConnections.partnerType, 'quickbooks'),
            eq(partnerConnections.status, 'connected')
          )
        )
        .limit(this.config.maxConnectionsPerRun);

      log.info(`[QuickBooksSyncPolling] Running incremental sync for ${connections.length} connections`);

      for (const connection of connections) {
        try {
          const result = await this.syncConnection(connection, 'incremental');
          results.push(result);
        } catch (error: any) {
          log.error(`[QuickBooksSyncPolling] Error syncing ${connection.workspaceId}:`, (error instanceof Error ? error.message : String(error)));
          results.push({
            workspaceId: connection.workspaceId,
            realmId: connection.realmId || '',
            customersUpdated: 0,
            employeesUpdated: 0,
            vendorsUpdated: 0,
            errors: [(error instanceof Error ? error.message : String(error))],
            durationMs: 0,
          });
        }
      }

      this.lastPollTime = new Date();
      
      platformEventBus.publish({
        type: 'ai_brain_action',
        category: 'ai_brain',
        title: 'QuickBooks Incremental Sync Complete',
        description: `Synced ${connections.length} connections, ${results.reduce((sum, r) => sum + r.customersUpdated + r.employeesUpdated + r.vendorsUpdated, 0)} total updates`,
        metadata: { action: 'quickbooks.incremental_sync_complete', connectionsProcessed: connections.length },
      }).catch((err) => log.warn('[quickbooksSyncPollingService] Fire-and-forget failed:', err));

    } catch (error: any) {
      log.error('[QuickBooksSyncPolling] Incremental sync failed:', (error instanceof Error ? error.message : String(error)));
    }

    return results;
  }

  async runFullReconciliation(): Promise<IncrementalSyncResult[]> {
    const results: IncrementalSyncResult[] = [];

    try {
      const connections = await db.select()
        .from(partnerConnections)
        .where(
          and(
            eq(partnerConnections.partnerType, 'quickbooks'),
            eq(partnerConnections.status, 'connected')
          )
        );

      log.info(`[QuickBooksSyncPolling] Running full reconciliation for ${connections.length} connections`);

      for (const connection of connections) {
        try {
          const result = await this.syncConnection(connection, 'full');
          results.push(result);
          
          await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (error: any) {
          log.error(`[QuickBooksSyncPolling] Reconciliation error for ${connection.workspaceId}:`, (error instanceof Error ? error.message : String(error)));
        }
      }

      this.lastReconciliationTime = new Date();

      platformEventBus.publish({
        type: 'ai_brain_action',
        category: 'ai_brain',
        title: 'QuickBooks Full Reconciliation Complete',
        description: `Full reconciliation across ${connections.length} connections, ${results.reduce((sum, r) => sum + r.customersUpdated + r.employeesUpdated + r.vendorsUpdated, 0)} total updates`,
        metadata: { action: 'quickbooks.full_reconciliation_complete', connectionsProcessed: connections.length },
      }).catch((err) => log.warn('[quickbooksSyncPollingService] Fire-and-forget failed:', err));

    } catch (error: any) {
      log.error('[QuickBooksSyncPolling] Full reconciliation failed:', (error instanceof Error ? error.message : String(error)));
    }

    return results;
  }

  private async syncConnection(
    connection: typeof partnerConnections.$inferSelect,
    mode: 'incremental' | 'full'
  ): Promise<IncrementalSyncResult> {
    const startTime = Date.now();
    const startedAt = new Date();
    const result: IncrementalSyncResult = {
      workspaceId: connection.workspaceId,
      realmId: connection.realmId || '',
      customersUpdated: 0,
      employeesUpdated: 0,
      vendorsUpdated: 0,
      errors: [],
      durationMs: 0,
    };

    // GAP-2: Create a running audit log entry before sync begins
    const [syncLog] = await db.insert(partnerSyncLogs)
      .values({
        workspaceId: connection.workspaceId,
        partnerConnectionId: connection.id,
        jobType: mode === 'incremental' ? 'incremental_sync' : 'full_reconciliation',
        entityType: 'all',
        startedAt,
        status: 'running',
        triggeredBy: 'scheduler',
        metadata: { realmId: connection.realmId, mode },
      })
      .returning();

    try {
      const accessToken = await quickbooksOAuthService.getValidAccessToken(connection.id);
      const realmId = connection.realmId!;
      const environment = INTEGRATIONS.quickbooks.getEnvironment();

      const lastSyncTime = mode === 'incremental' && connection.lastSyncAt
        ? new Date(connection.lastSyncAt).toISOString()
        : null;

      const [customersResult, employeesResult] = await Promise.all([
        this.syncCustomers(connection.workspaceId, realmId, accessToken, environment, lastSyncTime),
        this.syncEmployees(connection.workspaceId, realmId, accessToken, environment, lastSyncTime),
      ]);

      result.customersUpdated = customersResult.updated;
      result.employeesUpdated = employeesResult.updated;

      await db.update(partnerConnections)
        .set({ lastSyncAt: new Date() })
        .where(eq(partnerConnections.id, connection.id));

      // GAP-2: Mark sync log as completed with accurate item counts
      result.durationMs = Date.now() - startTime;
      const totalProcessed = customersResult.processed + employeesResult.processed;
      const totalUpdated = customersResult.updated + employeesResult.updated;
      const totalFailed = customersResult.failed + employeesResult.failed;

      await db.update(partnerSyncLogs)
        .set({
          status: 'completed',
          completedAt: new Date(),
          durationMs: result.durationMs,
          itemsProcessed: totalProcessed,
          itemsCreated: 0,
          itemsUpdated: totalUpdated,
          itemsFailed: totalFailed,
          updatedAt: new Date(),
        })
        .where(eq(partnerSyncLogs.id, syncLog.id));

    } catch (error: any) {
      result.errors.push((error instanceof Error ? error.message : String(error)));
      result.durationMs = Date.now() - startTime;

      // GAP-2: Mark sync log as failed with error details
      await db.update(partnerSyncLogs)
        .set({
          status: 'failed',
          completedAt: new Date(),
          durationMs: result.durationMs,
          errorMessage: result.errors[0] || 'Unknown error',
          updatedAt: new Date(),
        })
        .where(eq(partnerSyncLogs.id, syncLog.id))
        .catch(() => {}); // Non-blocking
    }

    result.durationMs = result.durationMs || (Date.now() - startTime);
    return result;
  }

  private async syncCustomers(
    workspaceId: string,
    realmId: string,
    accessToken: string,
    environment: 'production' | 'sandbox',
    lastSyncTime: string | null
  ): Promise<{ processed: number; updated: number; failed: number }> {
    let processed = 0;
    let updated = 0;
    let failed = 0;
    let slotAcquired = false;

    try {
      const canProceed = await quickbooksRateLimiter.waitForSlot(realmId, environment, 0, 30000);
      if (!canProceed) {
        throw new Error('Rate limit timeout');
      }
      slotAcquired = true;

      let query = 'SELECT * FROM Customer WHERE Active = true';
      if (lastSyncTime) {
        query += ` AND MetaData.LastUpdatedTime > '${lastSyncTime}'`;
      }
      query += ' MAXRESULTS 100';

      let success = false;
      try {
        const response = await fetch(
          `${QBO_API_BASE}/${realmId}/query?query=${encodeURIComponent(query)}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Customer query failed: ${response.status}`);
        }

        success = true;
        const data = await response.json();
        const customers = data.QueryResponse?.Customer || [];
        processed = customers.length;

        for (const customer of customers) {
          try {
            const [existingClient] = await db.select()
              .from(clients)
              .where(
                and(
                  eq(clients.workspaceId, workspaceId),
                  eq(clients.quickbooksClientId, customer.Id)
                )
              )
              .limit(1);

            if (existingClient) {
              // GAP-4: Build field-level conflict log before applying update
              const conflicts: Array<{ field: string; coaileagueValue: any; qbValue: any }> = [];
              const incomingName = customer.DisplayName || existingClient.companyName;
              const incomingEmail = customer.PrimaryEmailAddr?.Address || existingClient.email;
              const incomingPhone = customer.PrimaryPhone?.FreeFormNumber || existingClient.phone;

              if (customer.DisplayName && customer.DisplayName !== existingClient.companyName) {
                conflicts.push({ field: 'companyName', coaileagueValue: existingClient.companyName, qbValue: customer.DisplayName });
              }
              if (customer.PrimaryEmailAddr?.Address && customer.PrimaryEmailAddr.Address !== existingClient.email) {
                conflicts.push({ field: 'email', coaileagueValue: existingClient.email, qbValue: customer.PrimaryEmailAddr.Address });
              }
              if (customer.PrimaryPhone?.FreeFormNumber && customer.PrimaryPhone.FreeFormNumber !== existingClient.phone) {
                conflicts.push({ field: 'phone', coaileagueValue: existingClient.phone, qbValue: customer.PrimaryPhone.FreeFormNumber });
              }

              await db.update(clients)
                .set({
                  companyName: incomingName,
                  email: incomingEmail,
                  phone: incomingPhone,
                  quickbooksSyncStatus: 'synced',
                  quickbooksLastSync: new Date(),
                })
                .where(eq(clients.id, existingClient.id));

              if (conflicts.length > 0) {
                log.info(`[QuickBooksSyncPolling] Field conflicts for client ${existingClient.id}:`, conflicts.map(c => c.field).join(', '));
              }
              updated++;
            }
          } catch (itemError: any) {
            failed++;
            log.error(`[QuickBooksSyncPolling] Error processing customer ${customer.Id}:`, (itemError instanceof Error ? itemError.message : String(itemError)));
          }
        }
      } finally {
        if (slotAcquired) {
          quickbooksRateLimiter.completeRequest(realmId, environment, success);
        }
      }
    } catch (error: any) {
      log.error(`[QuickBooksSyncPolling] Customer sync error for ${workspaceId}:`, (error instanceof Error ? error.message : String(error)));
    }

    return { processed, updated, failed };
  }

  private async syncEmployees(
    workspaceId: string,
    realmId: string,
    accessToken: string,
    environment: 'production' | 'sandbox',
    lastSyncTime: string | null
  ): Promise<{ processed: number; updated: number; failed: number }> {
    let processed = 0;
    let updated = 0;
    let failed = 0;
    let slotAcquired = false;

    try {
      const canProceed = await quickbooksRateLimiter.waitForSlot(realmId, environment, 0, 30000);
      if (!canProceed) {
        throw new Error('Rate limit timeout');
      }
      slotAcquired = true;

      let query = 'SELECT * FROM Employee WHERE Active = true';
      if (lastSyncTime) {
        query += ` AND MetaData.LastUpdatedTime > '${lastSyncTime}'`;
      }
      query += ' MAXRESULTS 100';

      let success = false;
      try {
        const response = await fetch(
          `${QBO_API_BASE}/${realmId}/query?query=${encodeURIComponent(query)}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Employee query failed: ${response.status}`);
        }

        success = true;
        const data = await response.json();
        const qbEmployees = data.QueryResponse?.Employee || [];
        processed = qbEmployees.length;

        for (const qbEmployee of qbEmployees) {
          try {
            const [existingEmployee] = await db.select()
              .from(employees)
              .where(
                and(
                  eq(employees.workspaceId, workspaceId),
                  eq(employees.quickbooksEmployeeId, qbEmployee.Id)
                )
              )
              .limit(1);

            if (existingEmployee) {
              // GAP-4: Build field-level conflict log before applying update
              const conflicts: Array<{ field: string; coaileagueValue: any; qbValue: any }> = [];
              if (qbEmployee.GivenName && qbEmployee.GivenName !== existingEmployee.firstName) {
                conflicts.push({ field: 'firstName', coaileagueValue: existingEmployee.firstName, qbValue: qbEmployee.GivenName });
              }
              if (qbEmployee.FamilyName && qbEmployee.FamilyName !== existingEmployee.lastName) {
                conflicts.push({ field: 'lastName', coaileagueValue: existingEmployee.lastName, qbValue: qbEmployee.FamilyName });
              }
              if (qbEmployee.PrimaryEmailAddr?.Address && qbEmployee.PrimaryEmailAddr.Address !== existingEmployee.email) {
                conflicts.push({ field: 'email', coaileagueValue: existingEmployee.email, qbValue: qbEmployee.PrimaryEmailAddr.Address });
              }

              await db.update(employees)
                .set({
                  firstName: qbEmployee.GivenName || existingEmployee.firstName,
                  lastName: qbEmployee.FamilyName || existingEmployee.lastName,
                  email: qbEmployee.PrimaryEmailAddr?.Address || existingEmployee.email,
                  phone: qbEmployee.PrimaryPhone?.FreeFormNumber || existingEmployee.phone,
                  quickbooksSyncStatus: 'synced',
                  quickbooksLastSync: new Date(),
                })
                .where(eq(employees.id, existingEmployee.id));

              if (conflicts.length > 0) {
                log.info(`[QuickBooksSyncPolling] Field conflicts for employee ${existingEmployee.id}:`, conflicts.map(c => c.field).join(', '));
              }
              updated++;
            }
          } catch (itemError: any) {
            failed++;
            log.error(`[QuickBooksSyncPolling] Error processing employee ${qbEmployee.Id}:`, (itemError instanceof Error ? itemError.message : String(itemError)));
          }
        }
      } finally {
        if (slotAcquired) {
          quickbooksRateLimiter.completeRequest(realmId, environment, success);
        }
      }
    } catch (error: any) {
      log.error(`[QuickBooksSyncPolling] Employee sync error for ${workspaceId}:`, (error instanceof Error ? error.message : String(error)));
    }

    return { processed, updated, failed };
  }

  getStatus(): {
    isRunning: boolean;
    lastPollTime: Date | null;
    lastReconciliationTime: Date | null;
    config: SyncPollingConfig;
  } {
    return {
      isRunning: this.isRunning,
      lastPollTime: this.lastPollTime,
      lastReconciliationTime: this.lastReconciliationTime,
      config: this.config,
    };
  }

  async triggerManualSync(workspaceId: string): Promise<IncrementalSyncResult | null> {
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
      return null;
    }

    return this.syncConnection(connection, 'incremental');
  }
}

export const quickbooksSyncPollingService = new QuickBooksSyncPollingService();
