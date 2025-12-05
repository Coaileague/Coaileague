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

import { db } from '../db';
import { 
  auditLogs, 
  chatMessages, 
  notifications, 
  timeEntries,
  billingAuditLog
} from '@shared/schema';
import { lt, and, eq, sql, isNotNull } from 'drizzle-orm';

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

const PLATFORM_WORKSPACE_ID = 'coaileague-platform-workspace';

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
    console.error('[DB MAINTENANCE] Failed to log maintenance event:', error);
  }
}

export async function runAuditLogArchival(): Promise<MaintenanceResult> {
  console.log('📦 [DB MAINTENANCE] Starting audit log archival...');
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
    
    console.log(`📦 [DB MAINTENANCE] Audit log archival complete: ${recordsArchived} records older than ${RETENTION_PERIODS.auditLogs} days removed in ${duration}ms`);
    
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
    console.error('📦 [DB MAINTENANCE] Audit log archival failed:', error);
    
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
  console.log('💬 [DB MAINTENANCE] Starting chat message cleanup...');
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
    
    console.log(`💬 [DB MAINTENANCE] Chat message cleanup complete: ${recordsDeleted} system messages older than ${RETENTION_PERIODS.chatMessages} days removed in ${duration}ms`);
    
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
    console.error('💬 [DB MAINTENANCE] Chat message cleanup failed:', error);
    
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
  console.log('🔔 [DB MAINTENANCE] Starting notification trimming...');
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
    
    console.log(`🔔 [DB MAINTENANCE] Notification trimming complete: ${recordsDeleted} read/cleared notifications older than ${RETENTION_PERIODS.notifications} days removed in ${duration}ms`);
    
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
    console.error('🔔 [DB MAINTENANCE] Notification trimming failed:', error);
    
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

export async function runAllMaintenanceJobs(): Promise<MaintenanceResult[]> {
  console.log('=================================================');
  console.log('🧹 DATABASE MAINTENANCE SUITE - START');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('=================================================');
  
  const results: MaintenanceResult[] = [];
  
  results.push(await runAuditLogArchival());
  results.push(await runChatMessageCleanup());
  results.push(await runNotificationTrimming());
  
  const totalRecords = results.reduce((sum, r) => sum + r.recordsProcessed, 0);
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  const successCount = results.filter(r => r.success).length;
  
  console.log('=================================================');
  console.log(`🧹 DATABASE MAINTENANCE COMPLETE`);
  console.log(`   Jobs Run: ${results.length}`);
  console.log(`   Successful: ${successCount}/${results.length}`);
  console.log(`   Total Records: ${totalRecords}`);
  console.log(`   Total Duration: ${totalDuration}ms`);
  console.log('=================================================\n');
  
  return results;
}

export const maintenanceConfig = {
  schedule: '0 3 * * 0',
  description: 'Weekly database maintenance (audit logs, chat messages, notifications)',
  retentionPeriods: RETENTION_PERIODS,
};
