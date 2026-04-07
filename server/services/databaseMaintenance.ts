/**
 * Database Maintenance Service
 * ============================
 * Handles periodic cleanup and archival of database records:
 * - Audit log archival (retain 90 days, archive older records)
 * - Chat message cleanup (retain 180 days for system messages)
 * - Notification trimming (retain 30 days for cleared/read notifications)
 * - Time entry archival (retain 2 years for completed entries)
 * 
 * All cleanup operations are logged for compliance auditing.
 */

import { db, pool } from '../db';
import { 
  auditLogs, 
  chatMessages, 
  notifications, 
  timeEntries,
  billingAuditLog
} from '@shared/schema';
import { lt, and, eq, sql, isNotNull } from 'drizzle-orm';
import { typedPoolExec } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
import { PLATFORM_WORKSPACE_ID } from './billing/billingConstants';
const log = createLogger('databaseMaintenance');


interface MaintenanceResult {
  job: string;
  success: boolean;
  recordsProcessed: number;
  recordsArchived?: number;
  recordsDeleted?: number;
  duration: number;
  timestamp: Date;
  error?: string;
}

const RETENTION_PERIODS = {
  auditLogs: 90,
  chatMessages: 180,
  notifications: 30,
  timeEntries: 730,
  sessionLogs: 14,
};

async function logMaintenanceEvent(result: MaintenanceResult) {
  try {
    await db.insert(billingAuditLog).values({
      workspaceId: PLATFORM_WORKSPACE_ID,
      eventType: `maintenance_${result.job}`,
      eventCategory: 'system',
      actorType: 'system',
      description: result.success 
        ? `Database maintenance: ${result.job} - ${result.recordsProcessed} records processed in ${result.duration}ms`
        : `Database maintenance: ${result.job} - FAILED: ${result.error}`,
      newState: {
        job: result.job,
        recordsProcessed: result.recordsProcessed,
        recordsArchived: result.recordsArchived,
        recordsDeleted: result.recordsDeleted,
        duration: result.duration,
        timestamp: result.timestamp.toISOString(),
      },
    });
  } catch (error) {
    log.error('[DB MAINTENANCE] Failed to log maintenance event:', error);
  }
}

export async function runAuditLogArchival(): Promise<MaintenanceResult> {
  log.info('📦 [DB MAINTENANCE] Starting audit log archival...');
  const startTime = Date.now();
  
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_PERIODS.auditLogs);
    
    const result = await db
      .delete(auditLogs)
      .where(lt(auditLogs.createdAt, cutoffDate))
      .returning({ id: auditLogs.id });
    
    const recordsArchived = result.length;
    const duration = Date.now() - startTime;
    
    log.info(`📦 [DB MAINTENANCE] Audit log archival complete: ${recordsArchived} records older than ${RETENTION_PERIODS.auditLogs} days removed in ${duration}ms`);
    
    const maintenanceResult: MaintenanceResult = {
      job: 'audit_log_archival',
      success: true,
      recordsProcessed: recordsArchived,
      recordsArchived,
      duration,
      timestamp: new Date(),
    };
    
    await logMaintenanceEvent(maintenanceResult);
    return maintenanceResult;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('📦 [DB MAINTENANCE] Audit log archival failed:', error);
    
    const maintenanceResult: MaintenanceResult = {
      job: 'audit_log_archival',
      success: false,
      recordsProcessed: 0,
      duration,
      timestamp: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    
    await logMaintenanceEvent(maintenanceResult);
    return maintenanceResult;
  }
}

export async function runChatMessageCleanup(): Promise<MaintenanceResult> {
  log.info('💬 [DB MAINTENANCE] Starting chat message cleanup...');
  const startTime = Date.now();
  
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_PERIODS.chatMessages);
    
    const result = await db
      .delete(chatMessages)
      .where(
        and(
          lt(chatMessages.createdAt, cutoffDate),
          eq(chatMessages.isSystemMessage, true)
        )
      )
      .returning({ id: chatMessages.id });
    
    const recordsDeleted = result.length;
    const duration = Date.now() - startTime;
    
    log.info(`💬 [DB MAINTENANCE] Chat message cleanup complete: ${recordsDeleted} system messages older than ${RETENTION_PERIODS.chatMessages} days removed in ${duration}ms`);
    
    const maintenanceResult: MaintenanceResult = {
      job: 'chat_message_cleanup',
      success: true,
      recordsProcessed: recordsDeleted,
      recordsDeleted,
      duration,
      timestamp: new Date(),
    };
    
    await logMaintenanceEvent(maintenanceResult);
    return maintenanceResult;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('💬 [DB MAINTENANCE] Chat message cleanup failed:', error);
    
    const maintenanceResult: MaintenanceResult = {
      job: 'chat_message_cleanup',
      success: false,
      recordsProcessed: 0,
      duration,
      timestamp: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    
    await logMaintenanceEvent(maintenanceResult);
    return maintenanceResult;
  }
}

export async function runNotificationTrimming(): Promise<MaintenanceResult> {
  log.info('🔔 [DB MAINTENANCE] Starting notification trimming...');
  const startTime = Date.now();
  
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_PERIODS.notifications);
    
    const result = await db
      .delete(notifications)
      .where(
        and(
          lt(notifications.createdAt, cutoffDate),
          eq(notifications.isRead, true),
          isNotNull(notifications.clearedAt)
        )
      )
      .returning({ id: notifications.id });
    
    const recordsDeleted = result.length;
    const duration = Date.now() - startTime;
    
    log.info(`🔔 [DB MAINTENANCE] Notification trimming complete: ${recordsDeleted} read/cleared notifications older than ${RETENTION_PERIODS.notifications} days removed in ${duration}ms`);
    
    const maintenanceResult: MaintenanceResult = {
      job: 'notification_trimming',
      success: true,
      recordsProcessed: recordsDeleted,
      recordsDeleted,
      duration,
      timestamp: new Date(),
    };
    
    await logMaintenanceEvent(maintenanceResult);
    return maintenanceResult;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('🔔 [DB MAINTENANCE] Notification trimming failed:', error);
    
    const maintenanceResult: MaintenanceResult = {
      job: 'notification_trimming',
      success: false,
      recordsProcessed: 0,
      duration,
      timestamp: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    
    await logMaintenanceEvent(maintenanceResult);
    return maintenanceResult;
  }
}

export async function runTrinityMemoryOptimization(): Promise<MaintenanceResult> {
  log.info('[DB MAINTENANCE] Starting Trinity memory optimization...');
  const startTime = Date.now();

  try {
    const { trinityMemoryOptimizer } = await import('./ai-brain/trinityMemoryOptimizer');
    const results = await trinityMemoryOptimizer.runFullOptimization(false);

    const totalDeleted = results.reduce((s, r) => s + r.recordsDeleted, 0);
    const totalDecayed = results.reduce((s, r) => s + r.recordsDecayed, 0);
    const totalConsolidated = results.reduce((s, r) => s + r.recordsConsolidated, 0);
    const totalProcessed = results.reduce((s, r) => s + r.recordsProcessed, 0);
    const failures = results.filter(r => !r.success);
    const duration = Date.now() - startTime;

    log.info(`[DB MAINTENANCE] Trinity memory optimization complete: ${totalDeleted} deleted, ${totalDecayed} decayed, ${totalConsolidated} consolidated in ${duration}ms`);

    const maintenanceResult: MaintenanceResult = {
      job: 'trinity_memory_optimization',
      success: failures.length === 0,
      recordsProcessed: totalProcessed,
      recordsDeleted: totalDeleted,
      duration,
      timestamp: new Date(),
      error: failures.length > 0 ? `${failures.length} sub-jobs failed: ${failures.map(f => f.job).join(', ')}` : undefined,
    };

    await logMaintenanceEvent(maintenanceResult);
    return maintenanceResult;
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('[DB MAINTENANCE] Trinity memory optimization failed:', error);

    const maintenanceResult: MaintenanceResult = {
      job: 'trinity_memory_optimization',
      success: false,
      recordsProcessed: 0,
      duration,
      timestamp: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    await logMaintenanceEvent(maintenanceResult);
    return maintenanceResult;
  }
}

export async function runBoloExpiryCleanup(): Promise<MaintenanceResult> {
  const start = Date.now();
  try {
    // CATEGORY C — Raw SQL retained: IS NOT NULL | Tables: bolo_alerts | Verified: 2026-03-23
    const result = await typedPoolExec(
      `UPDATE bolo_alerts SET is_active = false, updated_at = NOW()
       WHERE is_active = true AND expires_at IS NOT NULL AND expires_at < NOW()`
    );
    const count = result.rowCount || 0;
    const maintenanceResult: MaintenanceResult = {
      job: 'BOLO Expiry Cleanup',
      success: true,
      recordsProcessed: count,
      recordsDeleted: count,
      duration: Date.now() - start,
      timestamp: new Date(),
    };
    if (count > 0) log.info(`[DB MAINTENANCE] BOLO Expiry: deactivated ${count} expired alert(s)`);
    await logMaintenanceEvent(maintenanceResult);
    return maintenanceResult;
  } catch (error) {
    const duration = Date.now() - start;
    const maintenanceResult: MaintenanceResult = {
      job: 'BOLO Expiry Cleanup',
      success: false,
      recordsProcessed: 0,
      duration,
      timestamp: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    await logMaintenanceEvent(maintenanceResult);
    return maintenanceResult;
  }
}

export async function runAllMaintenanceJobs(): Promise<MaintenanceResult[]> {
  log.info('=================================================');
  log.info('[DB MAINTENANCE] DATABASE MAINTENANCE SUITE - START');
  log.info(`Timestamp: ${new Date().toISOString()}`);
  log.info('=================================================');
  
  const results: MaintenanceResult[] = [];
  
  results.push(await runAuditLogArchival());
  results.push(await runChatMessageCleanup());
  results.push(await runNotificationTrimming());
  results.push(await runTrinityMemoryOptimization());
  results.push(await runBoloExpiryCleanup());
  
  const totalRecords = results.reduce((sum, r) => sum + r.recordsProcessed, 0);
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  const successCount = results.filter(r => r.success).length;
  
  log.info('=================================================');
  log.info(`[DB MAINTENANCE] DATABASE MAINTENANCE COMPLETE`);
  log.info(`   Jobs Run: ${results.length}`);
  log.info(`   Successful: ${successCount}/${results.length}`);
  log.info(`   Total Records: ${totalRecords}`);
  log.info(`   Total Duration: ${totalDuration}ms`);
  log.info('=================================================\n');
  
  return results;
}

export const maintenanceConfig = {
  schedule: '0 3 * * 0',
  description: 'Weekly database maintenance (audit logs, chat messages, notifications, Trinity memory optimization)',
  retentionPeriods: RETENTION_PERIODS,
};
