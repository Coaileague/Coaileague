/**
 * SESSION SYNC SERVICE
 * ====================
 * Real-time multi-device synchronization for end users.
 * Ensures mobile and desktop clients see the same data.
 * 
 * Features:
 * - User connection tracking across multiple devices
 * - Workspace-scoped event broadcasting
 * - Query invalidation notifications for TanStack Query
 * - Domain event synchronization (shifts, payroll, approvals, etc.)
 */

import { WebSocket } from 'ws';
import { TTLCache } from './cacheUtils';

export type SyncEventType = 
  | 'data_sync'
  | 'query_invalidate'
  | 'notification_update'
  | 'shift_update'
  | 'schedule_change'
  | 'payroll_update'
  | 'approval_required'
  | 'approval_completed'
  | 'timesheet_update'
  | 'invoice_update'
  | 'employee_update'
  | 'client_update'
  | 'settings_change'
  | 'ai_action_complete'
  | 'connection_status';

export interface SyncEvent {
  type: SyncEventType;
  action: 'create' | 'update' | 'delete' | 'refresh';
  resource: string;
  resourceId?: string;
  workspaceId?: string;
  userId?: string;
  data?: Record<string, any>;
  queryKeys?: string[];
  timestamp: string;
  sessionId?: string;
}

interface UserConnection {
  ws: WebSocket;
  deviceType: 'mobile' | 'desktop' | 'tablet' | 'unknown';
  sessionId: string;
  connectedAt: Date;
  lastPing: Date;
  workspaceId?: string;
}

interface ConnectionStats {
  userId: string;
  totalConnections: number;
  devices: { deviceType: string; count: number }[];
  lastActivity: Date;
}

class SessionSyncService {
  private userConnections: Map<string, Map<string, UserConnection>> = new Map();
  private workspaceUsers: Map<string, Set<string>> = new Map();
  private eventHistory: TTLCache<string, SyncEvent[]>;
  private syncStats: Map<string, { eventsSent: number; lastSync: Date }> = new Map();

  constructor() {
    this.eventHistory = new TTLCache<string, SyncEvent[]>(60 * 5);
    console.log('[SessionSync] Service initialized');
  }

  registerConnection(
    userId: string,
    ws: WebSocket,
    sessionId: string,
    deviceInfo?: { deviceType?: string; workspaceId?: string }
  ): void {
    const deviceType = this.parseDeviceType(deviceInfo?.deviceType);
    
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Map());
    }
    
    const userSessions = this.userConnections.get(userId)!;
    userSessions.set(sessionId, {
      ws,
      deviceType,
      sessionId,
      connectedAt: new Date(),
      lastPing: new Date(),
      workspaceId: deviceInfo?.workspaceId,
    });

    if (deviceInfo?.workspaceId) {
      if (!this.workspaceUsers.has(deviceInfo.workspaceId)) {
        this.workspaceUsers.set(deviceInfo.workspaceId, new Set());
      }
      this.workspaceUsers.get(deviceInfo.workspaceId)!.add(userId);
    }

    console.log(`[SessionSync] User ${userId} connected from ${deviceType} (session: ${sessionId})`);
    
    this.broadcastToUser(userId, {
      type: 'connection_status',
      action: 'update',
      resource: 'connection',
      data: { 
        connected: true, 
        deviceCount: userSessions.size,
        devices: Array.from(userSessions.values()).map(c => c.deviceType)
      },
      timestamp: new Date().toISOString(),
    }, sessionId);
  }

  unregisterConnection(userId: string, sessionId: string): void {
    const userSessions = this.userConnections.get(userId);
    if (!userSessions) return;

    const connection = userSessions.get(sessionId);
    if (connection?.workspaceId) {
      const wsUsers = this.workspaceUsers.get(connection.workspaceId);
      if (wsUsers && userSessions.size <= 1) {
        wsUsers.delete(userId);
      }
    }

    userSessions.delete(sessionId);
    
    if (userSessions.size === 0) {
      this.userConnections.delete(userId);
    }

    console.log(`[SessionSync] User ${userId} disconnected (session: ${sessionId})`);
  }

  broadcastToUser(userId: string, event: SyncEvent, excludeSessionId?: string): number {
    const userSessions = this.userConnections.get(userId);
    if (!userSessions) return 0;

    let sent = 0;
    const message = JSON.stringify({ 
      type: 'session_sync', 
      payload: event 
    });

    for (const [sid, conn] of userSessions) {
      if (excludeSessionId && sid === excludeSessionId) continue;
      if (conn.ws.readyState === WebSocket.OPEN) {
        try {
          conn.ws.send(message);
          sent++;
        } catch (err) {
          console.warn(`[SessionSync] Failed to send to ${userId}/${sid}:`, err);
        }
      }
    }

    this.updateSyncStats(userId);
    this.recordEventHistory(userId, event);
    
    return sent;
  }

  broadcastToWorkspace(workspaceId: string, event: SyncEvent): number {
    const users = this.workspaceUsers.get(workspaceId);
    if (!users) return 0;

    let totalSent = 0;
    for (const userId of users) {
      totalSent += this.broadcastToUser(userId, { ...event, workspaceId });
    }

    console.log(`[SessionSync] Workspace ${workspaceId} broadcast: ${totalSent} clients`);
    return totalSent;
  }

  notifyQueryInvalidation(
    userId: string | null,
    workspaceId: string | null,
    queryKeys: string[],
    resource: string,
    action: 'create' | 'update' | 'delete' = 'update'
  ): number {
    const event: SyncEvent = {
      type: 'query_invalidate',
      action,
      resource,
      queryKeys,
      workspaceId: workspaceId || undefined,
      timestamp: new Date().toISOString(),
    };

    if (userId) {
      return this.broadcastToUser(userId, event);
    } else if (workspaceId) {
      return this.broadcastToWorkspace(workspaceId, event);
    }
    return 0;
  }

  notifyShiftUpdate(
    workspaceId: string,
    action: 'create' | 'update' | 'delete',
    shiftId: string,
    data?: Record<string, any>
  ): number {
    return this.broadcastToWorkspace(workspaceId, {
      type: 'shift_update',
      action,
      resource: 'shift',
      resourceId: shiftId,
      data,
      queryKeys: ['/api/shifts', '/api/schedule', '/api/calendar'],
      timestamp: new Date().toISOString(),
    });
  }

  notifyApprovalRequired(
    userId: string,
    workspaceId: string,
    approvalType: string,
    resourceId: string
  ): number {
    return this.broadcastToUser(userId, {
      type: 'approval_required',
      action: 'create',
      resource: approvalType,
      resourceId,
      workspaceId,
      queryKeys: ['/api/approvals', `/api/${approvalType}s`],
      timestamp: new Date().toISOString(),
    });
  }

  notifyPayrollUpdate(
    workspaceId: string,
    action: 'create' | 'update',
    payrollId: string
  ): number {
    return this.broadcastToWorkspace(workspaceId, {
      type: 'payroll_update',
      action,
      resource: 'payroll',
      resourceId: payrollId,
      queryKeys: ['/api/payroll', '/api/payroll-runs'],
      timestamp: new Date().toISOString(),
    });
  }

  notifyTimesheetUpdate(
    userId: string,
    workspaceId: string,
    timesheetId: string
  ): number {
    let sent = this.broadcastToUser(userId, {
      type: 'timesheet_update',
      action: 'update',
      resource: 'timesheet',
      resourceId: timesheetId,
      queryKeys: ['/api/timesheets', '/api/time-entries'],
      timestamp: new Date().toISOString(),
    });

    sent += this.broadcastToWorkspace(workspaceId, {
      type: 'timesheet_update',
      action: 'update',
      resource: 'timesheet',
      resourceId: timesheetId,
      queryKeys: ['/api/timesheets/pending'],
      timestamp: new Date().toISOString(),
    });

    return sent;
  }

  notifyAIActionComplete(
    userId: string,
    workspaceId: string | undefined,
    actionType: string,
    result: Record<string, any>
  ): number {
    return this.broadcastToUser(userId, {
      type: 'ai_action_complete',
      action: 'update',
      resource: 'ai_action',
      data: { actionType, result },
      workspaceId,
      timestamp: new Date().toISOString(),
    });
  }

  getConnectionStats(userId: string): ConnectionStats | null {
    const userSessions = this.userConnections.get(userId);
    if (!userSessions) return null;

    const deviceCounts = new Map<string, number>();
    let lastActivity = new Date(0);

    for (const conn of userSessions.values()) {
      const count = deviceCounts.get(conn.deviceType) || 0;
      deviceCounts.set(conn.deviceType, count + 1);
      if (conn.lastPing > lastActivity) {
        lastActivity = conn.lastPing;
      }
    }

    return {
      userId,
      totalConnections: userSessions.size,
      devices: Array.from(deviceCounts.entries()).map(([deviceType, count]) => ({
        deviceType,
        count,
      })),
      lastActivity,
    };
  }

  getUserDeviceCount(userId: string): number {
    return this.userConnections.get(userId)?.size || 0;
  }

  getWorkspaceActiveUsers(workspaceId: string): string[] {
    return Array.from(this.workspaceUsers.get(workspaceId) || []);
  }

  getGlobalStats(): { totalUsers: number; totalConnections: number; workspaces: number } {
    let totalConnections = 0;
    for (const sessions of this.userConnections.values()) {
      totalConnections += sessions.size;
    }
    return {
      totalUsers: this.userConnections.size,
      totalConnections,
      workspaces: this.workspaceUsers.size,
    };
  }

  updatePing(userId: string, sessionId: string): void {
    const userSessions = this.userConnections.get(userId);
    const conn = userSessions?.get(sessionId);
    if (conn) {
      conn.lastPing = new Date();
    }
  }

  private parseDeviceType(input?: string): 'mobile' | 'desktop' | 'tablet' | 'unknown' {
    if (!input) return 'unknown';
    const lower = input.toLowerCase();
    if (lower.includes('mobile') || lower.includes('iphone') || lower.includes('android')) {
      return 'mobile';
    }
    if (lower.includes('tablet') || lower.includes('ipad')) {
      return 'tablet';
    }
    if (lower.includes('desktop') || lower.includes('windows') || lower.includes('mac')) {
      return 'desktop';
    }
    return 'unknown';
  }

  private updateSyncStats(userId: string): void {
    const stats = this.syncStats.get(userId) || { eventsSent: 0, lastSync: new Date() };
    stats.eventsSent++;
    stats.lastSync = new Date();
    this.syncStats.set(userId, stats);
  }

  private recordEventHistory(userId: string, event: SyncEvent): void {
    const key = `${userId}:history`;
    const history = this.eventHistory.get(key) || [];
    history.push(event);
    if (history.length > 50) {
      history.shift();
    }
    this.eventHistory.set(key, history);
  }

  cleanupStaleConnections(): number {
    const staleThreshold = Date.now() - (5 * 60 * 1000);
    let cleaned = 0;

    for (const [userId, sessions] of this.userConnections) {
      for (const [sessionId, conn] of sessions) {
        if (conn.lastPing.getTime() < staleThreshold || conn.ws.readyState !== WebSocket.OPEN) {
          this.unregisterConnection(userId, sessionId);
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      console.log(`[SessionSync] Cleaned up ${cleaned} stale connections`);
    }
    return cleaned;
  }
}

export const sessionSyncService = new SessionSyncService();
