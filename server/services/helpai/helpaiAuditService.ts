/**
 * HelpAI Audit Service - Phases 2-5
 * Comprehensive audit logging for all HelpAI operations
 */

import { db } from '../../db';
import {
  helpaiAuditLog,
  type InsertHelpaiAuditLog,
  type HelpaiAuditLog,
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'crypto';

export interface AuditLogEntry {
  workspaceId: string;
  userId?: string;
  integrationId?: string;
  action:
    | 'api_call'
    | 'config_update'
    | 'credential_create'
    | 'credential_revoke'
    | 'integration_enable'
    | 'integration_disable'
    | 'api_registration'
    | 'error';
  apiName?: string;
  status: 'success' | 'error' | 'pending';
  requestPayload?: Record<string, any>;
  responseStatus?: number;
  responseMessage?: string;
  durationMs?: number;
  tokensUsed?: number;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  metadata?: Record<string, any>;
}

export class HelpaiAuditService {
  /**
   * Log an audit event
   */
  async logAuditEvent(entry: AuditLogEntry): Promise<HelpaiAuditLog> {
    // Generate action hash for AI-generated actions (deterministic, no timestamps)
    let actionHash: string | undefined;
    if (entry.status === 'success' && entry.requestPayload) {
      actionHash = this.generateActionHash({
        action: entry.action,
        apiName: entry.apiName,
        requestPayload: entry.requestPayload,
        integrationId: entry.integrationId,
      });
    }

    const auditEntry: InsertHelpaiAuditLog = {
      workspaceId: entry.workspaceId,
      userId: entry.userId,
      integrationId: entry.integrationId,
      action: entry.action,
      apiName: entry.apiName,
      status: entry.status,
      requestPayload: (entry.requestPayload || {}) as any,
      responseStatus: entry.responseStatus,
      responseMessage: entry.responseMessage,
      durationMs: entry.durationMs,
      tokensUsed: entry.tokensUsed,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      requestId: entry.requestId,
      actionHash,
      metadata: (entry.metadata || {}) as any,
    };

    const [logged] = await db.insert(helpaiAuditLog).values(auditEntry).returning();

    // Log to console for monitoring
    if (entry.status === 'error') {
      console.error(
        `🚨 [HelpAI Audit] Error logged - ${entry.action}: ${entry.responseMessage}`
      );
    } else if (entry.status === 'success') {
      console.log(
        `✅ [HelpAI Audit] ${entry.action} - ${entry.apiName || 'N/A'} (${entry.durationMs}ms)`
      );
    }

    return logged;
  }

  /**
   * Get audit logs for a workspace
   */
  async getWorkspaceAuditLogs(
    workspaceId: string,
    options?: {
      limit?: number;
      offset?: number;
      action?: string;
      status?: 'success' | 'error' | 'pending';
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<HelpaiAuditLog[]> {
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;

    let query = db
      .select()
      .from(helpaiAuditLog)
      .where(eq(helpaiAuditLog.workspaceId, workspaceId));

    // Add optional filters
    if (options?.action) {
      query = query.where(eq(helpaiAuditLog.action, options.action as any));
    }
    if (options?.status) {
      query = query.where(eq(helpaiAuditLog.status, options.status));
    }

    // Execute query
    const results = await query
      .orderBy(desc(helpaiAuditLog.createdAt))
      .limit(limit)
      .offset(offset);

    // Filter by date range in-memory if needed
    if (options?.startDate || options?.endDate) {
      return results.filter(log => {
        if (options.startDate && log.createdAt < options.startDate) return false;
        if (options.endDate && log.createdAt > options.endDate) return false;
        return true;
      });
    }

    return results;
  }

  /**
   * Get audit logs for a specific integration
   */
  async getIntegrationAuditLogs(
    integrationId: string,
    limit: number = 100
  ): Promise<HelpaiAuditLog[]> {
    return db
      .select()
      .from(helpaiAuditLog)
      .where(eq(helpaiAuditLog.integrationId, integrationId))
      .orderBy(desc(helpaiAuditLog.createdAt))
      .limit(limit);
  }

  /**
   * Get audit logs for a specific user
   */
  async getUserAuditLogs(
    userId: string,
    limit: number = 100
  ): Promise<HelpaiAuditLog[]> {
    return db
      .select()
      .from(helpaiAuditLog)
      .where(eq(helpaiAuditLog.userId, userId))
      .orderBy(desc(helpaiAuditLog.createdAt))
      .limit(limit);
  }

  /**
   * Get error audit logs for a workspace (for monitoring/debugging)
   */
  async getErrorLogs(
    workspaceId: string,
    limit: number = 100
  ): Promise<HelpaiAuditLog[]> {
    return db
      .select()
      .from(helpaiAuditLog)
      .where(
        and(
          eq(helpaiAuditLog.workspaceId, workspaceId),
          eq(helpaiAuditLog.status, 'error')
        )
      )
      .orderBy(desc(helpaiAuditLog.createdAt))
      .limit(limit);
  }

  /**
   * Get audit statistics for a workspace
   */
  async getAuditStats(workspaceId: string): Promise<{
    totalEvents: number;
    successfulEvents: number;
    failedEvents: number;
    successRate: number;
    eventsByAction: Record<string, number>;
    eventsByAPI: Record<string, number>;
    averageResponseTime: number;
  }> {
    const logs = await db
      .select()
      .from(helpaiAuditLog)
      .where(eq(helpaiAuditLog.workspaceId, workspaceId));

    const totalEvents = logs.length;
    const successful = logs.filter(l => l.status === 'success').length;
    const failed = logs.filter(l => l.status === 'error').length;

    const eventsByAction: Record<string, number> = {};
    const eventsByAPI: Record<string, number> = {};
    let totalDuration = 0;
    let durationCount = 0;

    logs.forEach(log => {
      eventsByAction[log.action] = (eventsByAction[log.action] || 0) + 1;
      if (log.apiName) {
        eventsByAPI[log.apiName] = (eventsByAPI[log.apiName] || 0) + 1;
      }
      if (log.durationMs) {
        totalDuration += log.durationMs;
        durationCount++;
      }
    });

    return {
      totalEvents,
      successfulEvents: successful,
      failedEvents: failed,
      successRate: totalEvents > 0 ? (successful / totalEvents) * 100 : 0,
      eventsByAction,
      eventsByAPI,
      averageResponseTime: durationCount > 0 ? totalDuration / durationCount : 0,
    };
  }

  /**
   * Verify audit action integrity (SHA-256 hash validation)
   */
  async verifyActionIntegrity(logId: string): Promise<boolean> {
    const log = await db.query.helpaiAuditLog.findFirst({
      where: eq(helpaiAuditLog.id, logId),
    });

    if (!log || !log.actionHash) {
      return false;
    }

    // Recalculate hash
    const recalculatedHash = this.generateActionHash({
      action: log.action,
      apiName: log.apiName || undefined,
      requestPayload: log.requestPayload as Record<string, any>,
      integrationId: log.integrationId || undefined,
    });

    return recalculatedHash === log.actionHash;
  }

  /**
   * Export audit logs as CSV
   */
  async exportAuditLogsAsCSV(
    workspaceId: string,
    options?: { action?: string; startDate?: Date; endDate?: Date }
  ): Promise<string> {
    const logs = await this.getWorkspaceAuditLogs(workspaceId, {
      limit: 10000,
      action: options?.action,
      startDate: options?.startDate,
      endDate: options?.endDate,
    });

    // CSV headers
    const headers = [
      'ID',
      'Timestamp',
      'User ID',
      'Action',
      'API Name',
      'Status',
      'Response Status',
      'Duration (ms)',
      'Tokens Used',
      'IP Address',
      'Message',
    ];

    // CSV rows
    const rows = logs.map(log => [
      log.id,
      log.createdAt.toISOString(),
      log.userId || 'N/A',
      log.action,
      log.apiName || 'N/A',
      log.status,
      log.responseStatus?.toString() || 'N/A',
      log.durationMs?.toString() || 'N/A',
      log.tokensUsed?.toString() || 'N/A',
      log.ipAddress || 'N/A',
      (log.responseMessage || '').replace(/"/g, '""'), // Escape quotes
    ]);

    // Build CSV
    const csv = [
      headers.map(h => `"${h}"`).join(','),
      ...rows.map(row =>
        row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    return csv;
  }

  /**
   * Generate deterministic SHA-256 hash for action verification
   */
  private generateActionHash(data: {
    action: string;
    apiName?: string;
    requestPayload: Record<string, any>;
    integrationId?: string;
  }): string {
    // Sort keys deterministically
    const sorted = {
      action: data.action,
      apiName: data.apiName,
      integrationId: data.integrationId,
      payload: this.sortObjectKeys(data.requestPayload),
    };

    const hashInput = JSON.stringify(sorted);
    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Sort object keys recursively for consistent hashing
   */
  private sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item));
    }
    return Object.keys(obj)
      .sort()
      .reduce((sorted: any, key) => {
        sorted[key] = this.sortObjectKeys(obj[key]);
        return sorted;
      }, {});
  }
}

export const helpaiAuditService = new HelpaiAuditService();
