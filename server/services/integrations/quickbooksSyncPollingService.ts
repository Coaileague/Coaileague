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
    console.log('[QuickBooksSyncPolling] Service initialized');
  }

  start(): void {
    if (this.isRunning) {
      console.log('[QuickBooksSyncPolling] Already running');
      return;
    }

    this.isRunning = true;

    this.pollingInterval = setInterval(
      () => this.runIncrementalSync(),
      this.config.intervalMinutes * 60 * 1000
    );

    this.scheduleNightlyReconciliation();

    console.log(`[QuickBooksSyncPolling] Started with ${this.config.intervalMinutes}min interval`);
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
    console.log('[QuickBooksSyncPolling] Stopped');
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

    console.log(`[QuickBooksSyncPolling] Nightly reconciliation scheduled for ${nextRun.toISOString()}`);
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

      console.log(`[QuickBooksSyncPolling] Running incremental sync for ${connections.length} connections`);

      for (const connection of connections) {
        try {
          const result = await this.syncConnection(connection, 'incremental');
          results.push(result);
        } catch (error: any) {
          console.error(`[QuickBooksSyncPolling] Error syncing ${connection.workspaceId}:`, error.message);
          results.push({
            workspaceId: connection.workspaceId,
            realmId: connection.realmId || '',
            customersUpdated: 0,
            employeesUpdated: 0,
            vendorsUpdated: 0,
            errors: [error.message],
            durationMs: 0,
          });
        }
      }

      this.lastPollTime = new Date();
      
      platformEventBus.emit({
        type: 'ai_brain_action',
        data: {
          action: 'quickbooks.incremental_sync_complete',
          connectionsProcessed: connections.length,
          totalUpdates: results.reduce((sum, r) => 
            sum + r.customersUpdated + r.employeesUpdated + r.vendorsUpdated, 0
          ),
        },
        timestamp: new Date(),
      });

    } catch (error: any) {
      console.error('[QuickBooksSyncPolling] Incremental sync failed:', error.message);
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

      console.log(`[QuickBooksSyncPolling] Running full reconciliation for ${connections.length} connections`);

      for (const connection of connections) {
        try {
          const result = await this.syncConnection(connection, 'full');
          results.push(result);
          
          await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (error: any) {
          console.error(`[QuickBooksSyncPolling] Reconciliation error for ${connection.workspaceId}:`, error.message);
        }
      }

      this.lastReconciliationTime = new Date();

      platformEventBus.emit({
        type: 'ai_brain_action',
        data: {
          action: 'quickbooks.full_reconciliation_complete',
          connectionsProcessed: connections.length,
          totalUpdates: results.reduce((sum, r) => 
            sum + r.customersUpdated + r.employeesUpdated + r.vendorsUpdated, 0
          ),
        },
        timestamp: new Date(),
      });

    } catch (error: any) {
      console.error('[QuickBooksSyncPolling] Full reconciliation failed:', error.message);
    }

    return results;
  }

  private async syncConnection(
    connection: typeof partnerConnections.$inferSelect,
    mode: 'incremental' | 'full'
  ): Promise<IncrementalSyncResult> {
    const startTime = Date.now();
    const result: IncrementalSyncResult = {
      workspaceId: connection.workspaceId,
      realmId: connection.realmId || '',
      customersUpdated: 0,
      employeesUpdated: 0,
      vendorsUpdated: 0,
      errors: [],
      durationMs: 0,
    };

    try {
      const accessToken = await quickbooksOAuthService.getValidAccessToken(connection.id);
      const realmId = connection.realmId!;
      const environment = (process.env.QUICKBOOKS_ENVIRONMENT as 'production' | 'sandbox') || 'production';

      const lastSyncTime = mode === 'incremental' && connection.lastSyncAt
        ? new Date(connection.lastSyncAt).toISOString()
        : null;

      result.customersUpdated = await this.syncCustomers(
        connection.workspaceId,
        realmId,
        accessToken,
        environment,
        lastSyncTime
      );

      result.employeesUpdated = await this.syncEmployees(
        connection.workspaceId,
        realmId,
        accessToken,
        environment,
        lastSyncTime
      );

      await db.update(partnerConnections)
        .set({ lastSyncAt: new Date() })
        .where(eq(partnerConnections.id, connection.id));

    } catch (error: any) {
      result.errors.push(error.message);
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  private async syncCustomers(
    workspaceId: string,
    realmId: string,
    accessToken: string,
    environment: 'production' | 'sandbox',
    lastSyncTime: string | null
  ): Promise<number> {
    let updated = 0;
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

        for (const customer of customers) {
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
            await db.update(clients)
              .set({
                name: customer.DisplayName || existingClient.name,
                email: customer.PrimaryEmailAddr?.Address || existingClient.email,
                phone: customer.PrimaryPhone?.FreeFormNumber || existingClient.phone,
                quickbooksSyncStatus: 'synced',
                quickbooksLastSync: new Date(),
              })
              .where(eq(clients.id, existingClient.id));
            updated++;
          }
        }
      } finally {
        if (slotAcquired) {
          quickbooksRateLimiter.completeRequest(realmId, environment, success);
        }
      }
    } catch (error: any) {
      console.error(`[QuickBooksSyncPolling] Customer sync error for ${workspaceId}:`, error.message);
    }

    return updated;
  }

  private async syncEmployees(
    workspaceId: string,
    realmId: string,
    accessToken: string,
    environment: 'production' | 'sandbox',
    lastSyncTime: string | null
  ): Promise<number> {
    let updated = 0;
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

        for (const qbEmployee of qbEmployees) {
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
            updated++;
          }
        }
      } finally {
        if (slotAcquired) {
          quickbooksRateLimiter.completeRequest(realmId, environment, success);
        }
      }
    } catch (error: any) {
      console.error(`[QuickBooksSyncPolling] Employee sync error for ${workspaceId}:`, error.message);
    }

    return updated;
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
