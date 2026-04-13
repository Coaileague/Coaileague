/**
 * TRINITY AUDIT SERVICE
 * =====================
 * Append-only audit trail for all Trinity autonomous skill executions.
 * Logs skill executions, permission checks, results, and errors with full
 * context for regulatory compliance and workspace-scoped querying.
 *
 * COMPLIANCE:
 *  - All entries are append-only (no deletions)
 *  - Every entry is workspace-scoped (§G tenant isolation)
 *  - Every log is awaited, not fire-and-forget (§B NDS sole sender law)
 */

import { db } from '../../db';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { trinityAuditLogs } from '@shared/schema';
import { createLogger, type Logger } from '../../lib/logger';

const log = createLogger('TrinityAuditService');

// ── Audit entry types ────────────────────────────────────────────────────────

export interface AuditLogEntry {
  type: 'skill_execution' | 'permission_check' | 'skill_result' | 'skill_error';
  workspaceId: string;
  skillName: string;
  executionId: string;
  timestamp?: Date;
}

export interface SkillExecutionLog extends AuditLogEntry {
  type: 'skill_execution';
  status: 'approved' | 'denied';
  reason?: string;
}

export interface PermissionCheckLog extends AuditLogEntry {
  type: 'permission_check';
  permissionGranted: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface SkillResultLog extends AuditLogEntry {
  type: 'skill_result';
  success: boolean;
  resultData?: Record<string, unknown>;
  durationMs?: number;
}

export interface SkillErrorLog extends AuditLogEntry {
  type: 'skill_error';
  errorMessage: string;
  errorCode?: string;
  stackTrace?: string;
}

// ── Service ──────────────────────────────────────────────────────────────────

export class TrinityAuditService {
  /**
   * Log a skill execution decision (approved/denied).
   */
  async logSkillExecution(entry: SkillExecutionLog): Promise<void> {
    try {
      await db.insert(trinityAuditLogs).values({
        type: entry.type,
        workspaceId: entry.workspaceId,
        skillName: entry.skillName,
        executionId: entry.executionId,
        status: entry.status,
        reason: entry.reason ?? null,
        createdAt: entry.timestamp ?? new Date(),
      });

      log.debug('Trinity skill execution logged', {
        workspaceId: entry.workspaceId,
        skillName: entry.skillName,
        status: entry.status,
      });
    } catch (error) {
      log.error('Failed to log skill execution', error);
    }
  }

  /**
   * Log a permission check (risk level + grant decision).
   */
  async logPermissionCheck(entry: PermissionCheckLog): Promise<void> {
    try {
      await db.insert(trinityAuditLogs).values({
        type: entry.type,
        workspaceId: entry.workspaceId,
        skillName: entry.skillName,
        executionId: entry.executionId,
        permissionGranted: entry.permissionGranted,
        riskLevel: entry.riskLevel,
        createdAt: entry.timestamp ?? new Date(),
      });

      log.debug('Trinity permission check logged', {
        workspaceId: entry.workspaceId,
        skillName: entry.skillName,
        granted: entry.permissionGranted,
        riskLevel: entry.riskLevel,
      });
    } catch (error) {
      log.error('Failed to log permission check', error);
    }
  }

  /**
   * Log a skill execution result (success + data + duration).
   */
  async logSkillResult(entry: SkillResultLog): Promise<void> {
    try {
      await db.insert(trinityAuditLogs).values({
        type: entry.type,
        workspaceId: entry.workspaceId,
        skillName: entry.skillName,
        executionId: entry.executionId,
        success: entry.success,
        resultData: entry.resultData ?? null,
        durationMs: entry.durationMs ?? null,
        createdAt: entry.timestamp ?? new Date(),
      });

      log.info('Trinity skill result logged', {
        workspaceId: entry.workspaceId,
        skillName: entry.skillName,
        success: entry.success,
        durationMs: entry.durationMs,
      });
    } catch (error) {
      log.error('Failed to log skill result', error);
    }
  }

  /**
   * Log a skill execution error.
   */
  async logSkillError(entry: SkillErrorLog): Promise<void> {
    try {
      await db.insert(trinityAuditLogs).values({
        type: entry.type,
        workspaceId: entry.workspaceId,
        skillName: entry.skillName,
        executionId: entry.executionId,
        errorMessage: entry.errorMessage,
        errorCode: entry.errorCode ?? null,
        stackTrace: entry.stackTrace ?? null,
        createdAt: entry.timestamp ?? new Date(),
      });

      log.error('Trinity skill error logged', {
        workspaceId: entry.workspaceId,
        skillName: entry.skillName,
        errorCode: entry.errorCode,
      });
    } catch (error) {
      log.error('Failed to log skill error', error);
    }
  }

  /**
   * Get audit trail for a workspace within a date range.
   */
  async getAuditTrail(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<typeof trinityAuditLogs.$inferSelect[]> {
    try {
      return await db
        .select()
        .from(trinityAuditLogs)
        .where(
          and(
            eq(trinityAuditLogs.workspaceId, workspaceId),
            gte(trinityAuditLogs.createdAt, startDate),
            lte(trinityAuditLogs.createdAt, endDate),
          ),
        )
        .orderBy(desc(trinityAuditLogs.createdAt));
    } catch (error) {
      log.error('Failed to retrieve audit trail', error);
      return [];
    }
  }

  /**
   * Get audit trail for a specific skill within a workspace.
   */
  async getSkillAuditTrail(
    workspaceId: string,
    skillName: string,
  ): Promise<typeof trinityAuditLogs.$inferSelect[]> {
    try {
      return await db
        .select()
        .from(trinityAuditLogs)
        .where(
          and(
            eq(trinityAuditLogs.workspaceId, workspaceId),
            eq(trinityAuditLogs.skillName, skillName),
          ),
        )
        .orderBy(desc(trinityAuditLogs.createdAt));
    } catch (error) {
      log.error('Failed to retrieve skill audit trail', error);
      return [];
    }
  }

  /**
   * Get failed executions for a workspace within a date range.
   */
  async getFailedExecutions(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<typeof trinityAuditLogs.$inferSelect[]> {
    try {
      return await db
        .select()
        .from(trinityAuditLogs)
        .where(
          and(
            eq(trinityAuditLogs.workspaceId, workspaceId),
            eq(trinityAuditLogs.type, 'skill_error'),
            gte(trinityAuditLogs.createdAt, startDate),
            lte(trinityAuditLogs.createdAt, endDate),
          ),
        )
        .orderBy(desc(trinityAuditLogs.createdAt));
    } catch (error) {
      log.error('Failed to retrieve failed executions', error);
      return [];
    }
  }
}

// Singleton
export const trinityAuditService = new TrinityAuditService();
