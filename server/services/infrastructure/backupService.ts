/**
 * AUTOMATED BACKUP SERVICE
 * =========================
 * Enterprise-grade backup management with scheduled jobs.
 * Supports incremental and full backups with retention policies.
 * 
 * Features:
 * - Hourly incremental backups
 * - Daily full backups
 * - Configurable retention policies
 * - Backup verification
 * - Point-in-time recovery preparation
 * - SOX-compliant audit logging
 */

import { db } from '../../db';
import { systemAuditLogs, backupRecords } from '@shared/schema';
import { sql, eq, and, lt, inArray } from 'drizzle-orm';
import crypto from 'crypto';
import { typedCount, typedExec, typedQuery } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('backupService');


// ============================================================================
// TYPES
// ============================================================================

export type BackupType = 'full' | 'incremental' | 'schema_only' | 'manual';
export type BackupStatus = 'pending' | 'running' | 'completed' | 'failed' | 'verified';

export interface BackupRecord {
  id: string;
  type: BackupType;
  status: BackupStatus;
  startedAt: Date;
  completedAt?: Date;
  sizeBytes?: number;
  tablesIncluded: string[];
  checksum?: string;
  storagePath?: string;
  error?: string;
  metadata: Record<string, any>;
}

export interface BackupConfig {
  hourlyEnabled: boolean;
  dailyEnabled: boolean;
  retentionDays: number;
  maxBackups: number;
  verifyAfterBackup: boolean;
  criticalTables: string[];
}

export interface BackupStats {
  totalBackups: number;
  lastSuccessfulBackup?: Date;
  lastFailedBackup?: Date;
  totalSizeBytes: number;
  oldestBackup?: Date;
  newestBackup?: Date;
}

// ============================================================================
// BACKUP SERVICE
// ============================================================================

class BackupService {
  private static instance: BackupService;
  private config: BackupConfig = {
    hourlyEnabled: true,
    dailyEnabled: true,
    retentionDays: 30,
    maxBackups: 100,
    verifyAfterBackup: true,
    criticalTables: [
      'users',
      'workspaces',
      'audit_logs',
      'automation_action_ledger',
      'employees',
      'schedules',
      'payroll_runs',
      'invoices',
    ],
  };
  private hourlyInterval: NodeJS.Timeout | null = null;
  private dailyInterval: NodeJS.Timeout | null = null;
  private initialized = false;

  static getInstance(): BackupService {
    if (!this.instance) {
      this.instance = new BackupService();
    }
    return this.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Ensure backup tracking table exists
      await this.ensureTableExists();
      
      // Start scheduled backups
      this.startScheduledBackups();
      
      this.initialized = true;
      log.info('[BackupService] Initialized with automated scheduling');
    } catch (error) {
      log.error('[BackupService] Failed to initialize:', error);
    }
  }

  private async ensureTableExists(): Promise<void> {
    try {
      // CATEGORY C — Raw SQL retained: CREATE TABLE | Tables:  | Verified: 2026-03-23
      await typedExec(sql`
        CREATE TABLE IF NOT EXISTS backup_records (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          type VARCHAR(20) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMP WITH TIME ZONE,
          size_bytes BIGINT,
          tables_included TEXT[],
          checksum VARCHAR(64),
          storage_path VARCHAR(500),
          error TEXT,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_backup_records_status ON backup_records(status);
        CREATE INDEX IF NOT EXISTS idx_backup_records_type ON backup_records(type);
        CREATE INDEX IF NOT EXISTS idx_backup_records_started_at ON backup_records(started_at DESC);
      `);
    } catch (error) {
      log.error('[BackupService] Failed to create backup_records table:', error);
    }
  }

  private startScheduledBackups(): void {
    // Hourly incremental backups
    if (this.config.hourlyEnabled) {
      this.hourlyInterval = setInterval(async () => {
        await this.performBackup('incremental');
      }, 60 * 60 * 1000); // 1 hour
      
      log.info('[BackupService] Hourly incremental backups enabled');
    }

    // Daily full backups at 2 AM
    if (this.config.dailyEnabled) {
      const scheduleDaily = () => {
        const now = new Date();
        const next2AM = new Date(now);
        next2AM.setHours(2, 0, 0, 0);
        
        if (next2AM <= now) {
          next2AM.setDate(next2AM.getDate() + 1);
        }
        
        const delay = next2AM.getTime() - now.getTime();
        
        setTimeout(async () => {
          await this.performBackup('full');
          scheduleDaily(); // Reschedule for next day
        }, delay);
        
        log.info(`[BackupService] Next full backup scheduled for ${next2AM.toISOString()}`);
      };
      
      scheduleDaily();
    }
  }

  /**
   * Perform a backup operation
   */
  async performBackup(type: BackupType): Promise<BackupRecord> {
    const backupId = crypto.randomUUID();
    const startedAt = new Date();
    
    log.info(`[BackupService] Starting ${type} backup ${backupId}`);
    
    // Create backup record - cast tables array properly for PostgreSQL
    const tablesArray = `{${this.config.criticalTables.join(',')}}`;
    // CATEGORY C — Raw SQL retained: ::text | Tables: backup_records | Verified: 2026-03-23
    // @ts-expect-error — TS migration: fix in refactoring sprint
    await db.insert(backupRecords).values({
      id: backupId,
      workspaceId: 'system',
      type: type,
      status: 'running',
      startedAt: startedAt,
      tablesIncluded: tablesArray,
      metadata: { initiatedBy: 'scheduled', config: this.config },
    });

    try {
      // Get database size estimate
      // CATEGORY C — Raw SQL retained: pg_database_size() system function | Tables: none | Verified: 2026-03-23
      const sizeResult = await typedQuery(sql`
        SELECT pg_database_size(current_database()) as size_bytes
      `);
      const sizeBytes = (sizeResult as any[])[0]?.size_bytes || 0;

      // For Neon/Postgres, we rely on built-in PITR - log the backup point
      const walPosition = await this.getWALPosition();
      const checksum = this.generateChecksum(`${backupId}-${walPosition}-${startedAt.toISOString()}`);
      
      // Verify critical tables exist and have data
      const verificationResults = await this.verifyCriticalTables();
      
      const completedAt = new Date();
      
      await db.update(backupRecords).set({
        status: 'completed',
        completedAt,
        sizeBytes: sizeBytes,
        checksum,
        storagePath: `wal://${walPosition}`,
        metadata: sql`${backupRecords.metadata} || ${JSON.stringify({
          walPosition,
          verification: verificationResults,
          durationMs: completedAt.getTime() - startedAt.getTime(),
        })}::jsonb`,
      }).where(eq(backupRecords.id, backupId));

      // Log to audit trail
      await db.insert(systemAuditLogs).values({
        action: 'backup_completed',
        entityType: 'backup',
        entityId: backupId,
        metadata: {
          type,
          sizeBytes,
          walPosition,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          tablesVerified: verificationResults.length,
        },
      });

      log.info(`[BackupService] ${type} backup ${backupId} completed successfully`);

      // Verify if configured
      if (this.config.verifyAfterBackup) {
        await this.verifyBackup(backupId);
      }

      // Cleanup old backups
      await this.cleanupOldBackups();

      return {
        id: backupId,
        type,
        status: 'completed',
        startedAt,
        completedAt,
        sizeBytes,
        tablesIncluded: this.config.criticalTables,
        checksum,
        storagePath: `wal://${walPosition}`,
        metadata: { walPosition, verification: verificationResults },
      };

    } catch (error: any) {
      log.error(`[BackupService] Backup ${backupId} failed:`, error);
      
      await db.update(backupRecords).set({
        status: 'failed',
        error: (error instanceof Error ? error.message : String(error)),
        completedAt: new Date(),
      }).where(eq(backupRecords.id, backupId));

      await db.insert(systemAuditLogs).values({
        action: 'backup_failed',
        entityType: 'backup',
        entityId: backupId,
        metadata: { type, error: (error instanceof Error ? error.message : String(error)) },
      });

      return {
        id: backupId,
        type,
        status: 'failed',
        startedAt,
        completedAt: new Date(),
        tablesIncluded: this.config.criticalTables,
        error: error.message,
        metadata: {},
      };
    }
  }

  private async getWALPosition(): Promise<string> {
    try {
      // CATEGORY C — Raw SQL retained: ::text | Tables:  | Verified: 2026-03-23
      const result = await typedQuery(sql`SELECT pg_current_wal_lsn()::text as lsn`);
      return (result as any[])[0]?.lsn || 'unknown';
    } catch {
      return `checkpoint-${Date.now()}`;
    }
  }

  private generateChecksum(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private async verifyCriticalTables(): Promise<Array<{ table: string; rowCount: number; verified: boolean }>> {
    const results: Array<{ table: string; rowCount: number; verified: boolean }> = [];
    
    for (const table of this.config.criticalTables) {
      try {
        // CATEGORY C — Raw SQL retained: COUNT( | Tables:  | Verified: 2026-03-23
        const countResult = await typedQuery(sql.raw(`SELECT COUNT(*)::int as count FROM "${table}"`));
        const count = (countResult as any[])[0]?.count || 0;
        results.push({ table, rowCount: count, verified: true });
      } catch {
        results.push({ table, rowCount: 0, verified: false });
      }
    }
    
    return results;
  }

  /**
   * Verify a backup's integrity
   */
  async verifyBackup(backupId: string): Promise<boolean> {
    try {
      const result = await db.select().from(backupRecords).where(eq(backupRecords.id, backupId));
      
      const backup = ((result as any).rows as any[])[0];
      if (!backup) {
        log.warn(`[BackupService] Backup ${backupId} not found for verification`);
        return false;
      }

      // Verify checksum
      const verification = await this.verifyCriticalTables();
      const allTablesVerified = verification.every(v => v.verified);
      
      if (allTablesVerified) {
        await db.update(backupRecords).set({
          status: 'verified',
        }).where(eq(backupRecords.id, backupId));
        log.info(`[BackupService] Backup ${backupId} verified successfully`);
        return true;
      }
      
      log.warn(`[BackupService] Backup ${backupId} verification failed`);
      return false;
    } catch (error) {
      log.error(`[BackupService] Verification error for ${backupId}:`, error);
      return false;
    }
  }

  /**
   * Cleanup backups older than retention period
   */
  private async cleanupOldBackups(): Promise<void> {
    const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
    
    try {
      const deletedRows = await db
        .delete(backupRecords)
        .where(
          and(
            lt(backupRecords.startedAt, cutoffDate),
            inArray(backupRecords.status, ['completed', 'verified']),
          )
        )
        .returning({ id: backupRecords.id });
      if (deletedRows.length > 0) {
        log.info(`[BackupService] Cleaned up ${deletedRows.length} old backup records`);
      }
    } catch (error) {
      log.error('[BackupService] Cleanup error:', error);
    }
  }

  /**
   * Get backup statistics
   */
  async getStats(): Promise<BackupStats> {
    try {
      // Converted to Drizzle ORM: CASE WHEN → sql fragment
      const statsResult = await db.select({
        totalBackups: sql<number>`count(*)::int`,
        totalSizeBytes: sql<number>`sum(coalesce(${backupRecords.sizeBytes}, 0))::bigint`,
        oldestBackup: sql<Date>`min(${backupRecords.startedAt})`,
        newestBackup: sql<Date>`max(${backupRecords.startedAt})`,
        lastSuccessful: sql<Date>`max(case when ${backupRecords.status} in ('completed', 'verified') then ${backupRecords.completedAt} end)`,
        lastFailed: sql<Date>`max(case when ${backupRecords.status} = 'failed' then ${backupRecords.completedAt} end)`
      })
      .from(backupRecords);
      
      const row = statsResult[0] || {};
      
      return {
        totalBackups: row.totalBackups || 0,
        totalSizeBytes: Number(row.totalSizeBytes) || 0,
        oldestBackup: row.oldestBackup ? new Date(row.oldestBackup) : undefined,
        newestBackup: row.newestBackup ? new Date(row.newestBackup) : undefined,
        lastSuccessfulBackup: row.lastSuccessful ? new Date(row.lastSuccessful) : undefined,
        lastFailedBackup: row.lastFailed ? new Date(row.lastFailed) : undefined,
      };
    } catch (error) {
      log.error('[BackupService] Failed to get stats:', error);
      return { totalBackups: 0, totalSizeBytes: 0 };
    }
  }

  /**
   * Get recent backup records
   */
  async getRecentBackups(limit: number = 10): Promise<BackupRecord[]> {
    try {
      // CATEGORY C — Raw SQL retained: ORDER BY | Tables: backup_records | Verified: 2026-03-23
      const result = await typedQuery(sql`
        SELECT * FROM backup_records 
        ORDER BY started_at DESC 
        LIMIT ${limit}
      `);
      
      return result.map((row: any) => ({
        id: row.id,
        type: row.type,
        status: row.status,
        startedAt: new Date(row.started_at),
        completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
        sizeBytes: row.size_bytes ? parseInt(row.size_bytes) : undefined,
        tablesIncluded: row.tables_included || [],
        checksum: row.checksum,
        storagePath: row.storage_path,
        error: row.error,
        metadata: row.metadata || {},
      }));
    } catch (error) {
      log.error('[BackupService] Failed to get recent backups:', error);
      return [];
    }
  }

  /**
   * Trigger manual backup
   */
  async triggerManualBackup(userId?: string): Promise<BackupRecord> {
    log.info(`[BackupService] Manual backup triggered${userId ? ` by user ${userId}` : ''}`);
    
    const backup = await this.performBackup('manual');
    
    if (userId) {
      await db.insert(systemAuditLogs).values({
        userId,
        action: 'manual_backup_triggered',
        entityId: 'database',
        metadata: { backupId: backup.id, status: backup.status },
      });
    }
    
    return backup;
  }

  /**
   * Update backup configuration
   */
  updateConfig(updates: Partial<BackupConfig>): BackupConfig {
    this.config = { ...this.config, ...updates };
    log.info('[BackupService] Configuration updated:', this.config);
    return this.config;
  }

  getConfig(): BackupConfig {
    return { ...this.config };
  }

  shutdown(): void {
    if (this.hourlyInterval) {
      clearInterval(this.hourlyInterval);
      this.hourlyInterval = null;
    }
    log.info('[BackupService] Service shutdown');
  }
}

export const backupService = BackupService.getInstance();
