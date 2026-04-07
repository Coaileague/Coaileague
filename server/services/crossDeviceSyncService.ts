/**
 * Cross-Device Sync Service
 * 
 * Ensures data consistency between mobile and desktop clients.
 * Manages sync state, conflict resolution, and offline capability.
 * 
 * Sync Strategy:
 * - Server is source of truth
 * - Clients receive push notifications for changes
 * - Last-write-wins for conflicts (with audit trail)
 * - Offline changes queued and synced on reconnect
 */

import { db } from '../db';
import { employees, users, workspaces, shifts, timeEntries, clients } from '@shared/schema';
import { eq, and, gte, desc } from 'drizzle-orm';
import { AI_BRAIN } from '../config/platformConfig';
import { eventBus } from './trinity/eventBus';
import { sessionSyncService } from './ai-brain/sessionSyncService';
import { createLogger } from '../lib/logger';
const log = createLogger('crossDeviceSyncService');


interface SyncState {
  userId: string;
  workspaceId: string;
  lastSyncTimestamp: Date;
  deviceId: string;
  deviceType: 'mobile' | 'desktop' | 'tablet';
  syncVersion: number;
}

interface SyncPayload {
  type: 'full' | 'incremental';
  timestamp: Date;
  version: number;
  changes: {
    employees?: any[];
    shifts?: any[];
    timeEntries?: any[];
    clients?: any[];
    notifications?: any[];
    platformUpdates?: any[];
  };
  deletions?: {
    entity: string;
    ids: string[];
  }[];
}

interface ConflictResolution {
  entityType: string;
  entityId: string;
  serverVersion: any;
  clientVersion: any;
  resolution: 'server_wins' | 'client_wins' | 'merged';
  resolvedAt: Date;
}

class CrossDeviceSyncService {
  private syncStates: Map<string, SyncState> = new Map();
  private pendingPushes: Map<string, SyncPayload[]> = new Map();
  private initialized = false;
  private entityBatch: Map<string, Map<string, any[]>> = new Map();
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  async initialize(): Promise<void> {
    if (this.initialized) return;

    eventBus.on('employee_created', this.handleEntityChange.bind(this, 'employees'));
    eventBus.on('employee_updated', this.handleEntityChange.bind(this, 'employees'));
    eventBus.on('employee_role_changed', this.handleRoleChange.bind(this));
    eventBus.on('shift_created', this.handleEntityChange.bind(this, 'shifts'));
    eventBus.on('shift_updated', this.handleEntityChange.bind(this, 'shifts'));
    eventBus.on('time_entry_created', this.handleEntityChange.bind(this, 'timeEntries'));
    eventBus.on('time_entry_updated', this.handleEntityChange.bind(this, 'timeEntries'));
    eventBus.on('client_created', this.handleEntityChange.bind(this, 'clients'));
    eventBus.on('client_updated', this.handleEntityChange.bind(this, 'clients'));
    
    // Notification and platform update sync events for mobile/desktop consistency
    eventBus.on('notification_created', this.handleEntityChange.bind(this, 'notifications'));
    eventBus.on('notification_read', this.handleEntityChange.bind(this, 'notifications'));
    eventBus.on('platform_update_created', this.handleEntityChange.bind(this, 'platformUpdates'));
    eventBus.on('notifications_cleared', this.handleEntityChange.bind(this, 'notifications'));

    sessionSyncService.onDeviceDisconnect((userId, workspaceId, deviceId) => {
      this.unregisterDevice(userId, workspaceId, deviceId);
    });

    sessionSyncService.onWorkspaceSwitch((userId, oldWorkspaceId, newWorkspaceId, deviceId) => {
      this.unregisterDevice(userId, oldWorkspaceId, deviceId);
      log.info(`[CrossDeviceSync] Workspace switch: user ${userId} moved from ${oldWorkspaceId} to ${newWorkspaceId}`);
    });

    log.info('[CrossDeviceSync] Service initialized - listening for data changes');
    this.initialized = true;
  }

  async registerDevice(
    userId: string,
    workspaceId: string,
    deviceId: string,
    deviceType: 'mobile' | 'desktop' | 'tablet'
  ): Promise<SyncState & { pendingUpdates: SyncPayload[] }> {
    const key = `${userId}:${workspaceId}:${deviceId}`;
    
    const state: SyncState = {
      userId,
      workspaceId,
      lastSyncTimestamp: new Date(),
      deviceId,
      deviceType,
      syncVersion: 1,
    };

    this.syncStates.set(key, state);

    const pendingUpdates = await this.drainPendingPushes(userId, workspaceId, deviceId);

    log.info(`[CrossDeviceSync] Device registered: ${deviceType} (${deviceId}) for user ${userId} in workspace ${workspaceId}, ${pendingUpdates.length} pending updates delivered`);

    return { ...state, pendingUpdates };
  }

  private async drainPendingPushes(userId: string, workspaceId: string, deviceId?: string): Promise<SyncPayload[]> {
    if (deviceId) {
      const key = `${userId}:${workspaceId}:${deviceId}:pending`;
      const pending = this.pendingPushes.get(key) || [];
      this.pendingPushes.delete(key);
      return pending;
    }
    
    const allPending: SyncPayload[] = [];
    const keysToDelete: string[] = [];
    const keyPrefix = `${userId}:${workspaceId}:`;
    
    for (const [key, payloads] of this.pendingPushes.entries()) {
      if (key.startsWith(keyPrefix) && key.endsWith(':pending')) {
        allPending.push(...payloads);
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.pendingPushes.delete(key);
    }
    
    return allPending;
  }

  async getFullSync(userId: string, workspaceId: string): Promise<SyncPayload> {
    const [
      workspaceEmployees,
      workspaceShifts,
      workspaceClients,
      userTimeEntries,
    ] = await Promise.all([
      db.select().from(employees).where(eq(employees.workspaceId, workspaceId)),
      db.select().from(shifts).where(eq(shifts.workspaceId, workspaceId)).limit(AI_BRAIN.crossDeviceSyncShifts),
      db.select().from(clients).where(eq(clients.workspaceId, workspaceId)),
      db.select().from(timeEntries).where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        )
      ).limit(AI_BRAIN.crossDeviceSyncTimeEntries),
    ]);

    return {
      type: 'full',
      timestamp: new Date(),
      version: Date.now(),
      changes: {
        employees: workspaceEmployees,
        shifts: workspaceShifts,
        clients: workspaceClients,
        timeEntries: userTimeEntries,
      },
    };
  }

  async getIncrementalSync(
    userId: string,
    workspaceId: string,
    lastSyncTimestamp: Date
  ): Promise<SyncPayload> {
    const [
      updatedEmployees,
      updatedShifts,
      updatedClients,
      updatedTimeEntries,
    ] = await Promise.all([
      db.select().from(employees).where(
        and(
          eq(employees.workspaceId, workspaceId),
          gte(employees.updatedAt, lastSyncTimestamp)
        )
      ),
      db.select().from(shifts).where(
        and(
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.updatedAt, lastSyncTimestamp)
        )
      ),
      db.select().from(clients).where(
        and(
          eq(clients.workspaceId, workspaceId),
          gte(clients.updatedAt, lastSyncTimestamp)
        )
      ),
      db.select().from(timeEntries).where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.updatedAt, lastSyncTimestamp)
        )
      ),
    ]);

    return {
      type: 'incremental',
      timestamp: new Date(),
      version: Date.now(),
      changes: {
        employees: updatedEmployees.length > 0 ? updatedEmployees : undefined,
        shifts: updatedShifts.length > 0 ? updatedShifts : undefined,
        clients: updatedClients.length > 0 ? updatedClients : undefined,
        timeEntries: updatedTimeEntries.length > 0 ? updatedTimeEntries : undefined,
      },
    };
  }

  async pushToAllDevices(
    userId: string,
    workspaceId: string,
    payload: Partial<SyncPayload>
  ): Promise<void> {
    const fullPayload: SyncPayload = {
      type: 'incremental',
      timestamp: new Date(),
      version: Date.now(),
      ...payload,
      changes: payload.changes || {},
    };

    try {
      const sent = sessionSyncService.broadcastToWorkspace(workspaceId, {
        type: 'sync_update',
        action: 'update',
        resource: 'cross_device_sync',
        data: fullPayload,
        workspaceId,
        timestamp: new Date().toISOString(),
      });
      
      if (sent === 0) {
        throw new Error('No active connections');
      }
    } catch (error) {
      const userDevices = Array.from(this.syncStates.entries())
        .filter(([key, state]) => {
          if (!key.startsWith(`${userId}:`)) return false;
          if (state.workspaceId !== workspaceId) return false;
          return true;
        })
        .map(([key, state]) => ({ key, deviceId: state.deviceId }));
      
      for (const { deviceId } of userDevices) {
        const pendingKey = `${userId}:${workspaceId}:${deviceId}:pending`;
        const pending = this.pendingPushes.get(pendingKey) || [];
        pending.push(fullPayload);
        this.pendingPushes.set(pendingKey, pending);
      }
    }

    log.info(`[CrossDeviceSync] Pushed sync update to workspace ${workspaceId}`);
  }

  unregisterDevice(userId: string, workspaceId: string, deviceId: string): void {
    const key = `${userId}:${workspaceId}:${deviceId}`;
    this.syncStates.delete(key);
    
    const pendingKey = `${userId}:${workspaceId}:${deviceId}:pending`;
    this.pendingPushes.delete(pendingKey);
    
    log.info(`[CrossDeviceSync] Device unregistered: ${deviceId} for user ${userId} in workspace ${workspaceId}`);
  }

  clearUserWorkspaceDevices(userId: string, workspaceId: string): void {
    const keysToDelete: string[] = [];
    const keyPrefix = `${userId}:${workspaceId}:`;
    
    for (const key of this.syncStates.keys()) {
      if (key.startsWith(keyPrefix)) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.syncStates.delete(key);
    }
    
    for (const key of Array.from(this.pendingPushes.keys())) {
      if (key.startsWith(keyPrefix)) {
        this.pendingPushes.delete(key);
      }
    }
    
    log.info(`[CrossDeviceSync] Cleared ${keysToDelete.length} devices for user ${userId} in workspace ${workspaceId}`);
  }

  async syncOfflineChanges(
    userId: string,
    workspaceId: string,
    offlineChanges: any[]
  ): Promise<{
    applied: number;
    conflicts: ConflictResolution[];
    errors: string[];
  }> {
    let applied = 0;
    const conflicts: ConflictResolution[] = [];
    const errors: string[] = [];

    for (const change of offlineChanges) {
      try {
        const result = await this.applyChange(workspaceId, change);
        if (result.success) {
          applied++;
        } else if (result.conflict) {
          conflicts.push(result.conflict);
        }
      } catch (error: any) {
        errors.push(`Failed to apply change: ${(error instanceof Error ? error.message : String(error))}`);
      }
    }

    log.info(`[CrossDeviceSync] Synced ${applied} offline changes, ${conflicts.length} conflicts, ${errors.length} errors`);

    return { applied, conflicts, errors };
  }

  private async applyChange(
    workspaceId: string,
    change: { entity: string; action: 'create' | 'update' | 'delete'; data: any; timestamp: Date }
  ): Promise<{ success: boolean; conflict?: ConflictResolution }> {
    const tables: Record<string, any> = {
      employees,
      shifts,
      timeEntries,
      clients,
    };

    const table = tables[change.entity];
    if (!table) {
      throw new Error(`Unknown entity type: ${change.entity}`);
    }

    if (change.action === 'update' && change.data.id) {
      const [existing] = await db
        .select()
        .from(table)
        .where(eq(table.id, change.data.id))
        .limit(1);

      if (existing && existing.updatedAt > change.timestamp) {
        return {
          success: false,
          conflict: {
            entityType: change.entity,
            entityId: change.data.id,
            serverVersion: existing,
            clientVersion: change.data,
            resolution: 'server_wins',
            resolvedAt: new Date(),
          },
        };
      }
    }

    switch (change.action) {
      case 'create':
        await db.insert(table).values({
          ...change.data,
          workspaceId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        break;
      case 'update':
        await db.update(table)
          .set({ ...change.data, updatedAt: new Date() })
          .where(eq(table.id, change.data.id));
        break;
      case 'delete':
        await db.delete(table).where(eq(table.id, change.data.id));
        break;
    }

    return { success: true };
  }

  private handleEntityChange(entityType: string, data: any): void {
    if (!data.workspaceId) return;
    const wid = data.workspaceId;

    if (!this.entityBatch.has(wid)) {
      this.entityBatch.set(wid, new Map());
    }
    const batch = this.entityBatch.get(wid)!;
    if (!batch.has(entityType)) batch.set(entityType, []);
    batch.get(entityType)!.push(data);

    const existing = this.debounceTimers.get(wid);
    if (existing) clearTimeout(existing);
    this.debounceTimers.set(wid, setTimeout(() => this.flushEntityBatch(wid), 500));
  }

  private async flushEntityBatch(workspaceId: string): Promise<void> {
    this.debounceTimers.delete(workspaceId);
    const batch = this.entityBatch.get(workspaceId);
    if (!batch || batch.size === 0) return;
    this.entityBatch.delete(workspaceId);

    const changes: Record<string, any[]> = {};
    for (const [entityType, items] of batch.entries()) {
      changes[entityType] = items;
    }

    try {
      const workspaceUsers = await db
        .select({ userId: employees.userId })
        .from(employees)
        .where(eq(employees.workspaceId, workspaceId));

      for (const { userId } of workspaceUsers) {
        if (userId) {
          await this.pushToAllDevices(userId, workspaceId, { changes });
        }
      }

      log.info(`[CrossDeviceSync] Batch flush for workspace ${workspaceId}: ${Object.keys(changes).join(', ')} (${workspaceUsers.length} users)`);
    } catch (err: any) {
      log.warn(`[CrossDeviceSync] Batch flush failed for workspace ${workspaceId}:`, (err instanceof Error ? err.message : String(err)));
    }
  }

  private async handleRoleChange(data: any): Promise<void> {
    if (!data.userId || !data.workspaceId) return;

    await this.pushToAllDevices(data.userId, data.workspaceId, {
      changes: {
        employees: [{
          id: data.employeeId,
          workspaceRole: data.newRole,
          updatedAt: new Date(),
        }],
      },
    });

    log.info(`[CrossDeviceSync] Pushed role change to user ${data.userId}: ${data.newRole}`);
  }

  async getPendingSync(userId: string, workspaceId: string): Promise<SyncPayload[]> {
    const allPending: SyncPayload[] = [];
    const keysToDelete: string[] = [];
    const keyPrefix = `${userId}:${workspaceId}:`;
    
    for (const [key, payloads] of this.pendingPushes.entries()) {
      if (key.startsWith(keyPrefix) && key.endsWith(':pending')) {
        allPending.push(...payloads);
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.pendingPushes.delete(key);
    }
    
    return allPending;
  }

  getSyncStatus(userId: string, workspaceId: string, deviceId: string): SyncState | null {
    const key = `${userId}:${workspaceId}:${deviceId}`;
    return this.syncStates.get(key) || null;
  }
}

export const crossDeviceSyncService = new CrossDeviceSyncService();
export default crossDeviceSyncService;
