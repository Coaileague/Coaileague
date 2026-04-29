/**
 * Autonomous Scheduler Service
 * Runs scheduled jobs for CoAIleague autonomous operations:
 * - Nightly invoice generation (Smart Billing)
 * - Weekly schedule generation (AI Scheduling)
 * - Automatic payroll processing (Auto Payroll)
 * 
 * All automation activities are logged for compliance tracking.
 */

import { NotificationDeliveryService } from './notificationDeliveryService';
import cron from 'node-cron';
import { CRON } from '../config/platformConfig';
import { db } from '../db';
import { getAppBaseUrl } from '../utils/getAppBaseUrl';
import {
  workspaces,
  employees,
  users,
  platformRoles,
  customSchedulerIntervals,
  idempotencyKeys,
  chatConversations,
  roomEvents,
  clients,
  invoices,
  paymentReminders,
  timeEntries,
  shifts,
  clientBillingSettings
} from '@shared/schema';
import { eq, and, sql, lt, lte, gte, ne, isNotNull, inArray, isNull } from 'drizzle-orm';
import { generateUsageBasedInvoices, generateWeeklyInvoices, generateInvoiceForClient, sendInvoiceViaStripe } from './billingAutomation';
import { PayrollAutomationEngine } from './payrollAutomation';
import { SchedulingAI } from '../ai/scheduleos';
import { AIBrainService } from './ai-brain/aiBrainService';
import { gustoService } from './partners/gusto';
import { addDays, startOfWeek, endOfWeek, format } from 'date-fns';
import { shouldRunBiweekly, seedAnchor, advanceAnchor, detectAnchorDrift } from './utils/scheduling';
import { storage } from '../storage';
import { executeIdempotencyCheck, updateIdempotencyResult } from './autonomy/helpers';
import { runWebSocketConnectionCleanup } from './wsConnectionCleanup';
import { runShiftCompletionBridge } from './automation/shiftCompletionBridge';
import { platformServicesMeter } from './billing/platformServicesMeter';
import crypto from 'crypto';
import { createNotification } from './notificationService';
import { withTokens } from './billing/tokenWrapper';
import { sendMonitoringAlert } from './externalMonitoring';
import { syncInvoiceToQuickBooks, syncPayrollToQuickBooks } from './quickbooksClientBillingSync';
import { checkDatabase, checkChatWebSocket, checkStripe } from './healthCheck';
import { checkExpiringCertifications, scanShiftLicenseConflicts } from './complianceAlertService';
import { runCertificationExpiryCheck } from './automation/notificationEventCoverage';
import { platformChangeMonitor } from './ai-brain/platformChangeMonitor';
import { runAllMaintenanceJobs, maintenanceConfig } from './databaseMaintenance';
import { cronRunLog } from '@shared/schema';
import { runDailyAnalyticsSnapshot } from './analyticsSnapshotService';
import { runCleanupTasks } from './notificationCleanupService';
import { runTokenCleanup } from './tokenCleanupService';
import { runSundayWeeklyReports } from './weeklyReportCronService';
import { runScheduledClientInvoiceAutoGeneration } from './timesheetInvoiceService';
import { runPayrollAutoClose, detectOrphanedPayrollRuns } from './billing/payrollAutoCloseService';
import { platformEventBus, PlatformEvent, EventCategory, EventVisibility } from './platformEventBus';
import { trinityOrchestrationGovernance } from './ai-brain/trinityOrchestrationGovernance';
import { scanOverdueI9s } from './ai-brain/trinityDocumentActions';
import { weeklyPlatformAudit } from './trinity/weeklyPlatformAudit';
import { createLogger } from '../lib/logger';
import { PLATFORM_WORKSPACE_ID } from './billing/billingConstants';

const log = createLogger('AutonomousScheduler');

// ============================================================================
// JOB EXECUTION HISTORY TRACKING
// ============================================================================

interface JobExecutionEntry {
  jobName: string;
  startedAt: Date;
  completedAt: Date | null;
  status: 'running' | 'completed' | 'failed';
  durationMs: number | null;
  error: string | null;
}

interface ScheduledJobInfo {
  jobName: string;
  schedule: string;
  description: string;
  lastRunAt: Date | null;
  lastStatus: 'running' | 'completed' | 'failed' | null;
  enabled: boolean;
}

const MAX_HISTORY_ENTRIES = 500;
const jobExecutionHistory: JobExecutionEntry[] = [];
const registeredJobs: Map<string, ScheduledJobInfo> = new Map();

const activeJobs = new Set<string>();

async function trackJobExecution(jobName: string, fn: () => Promise<any>): Promise<void> {
  if (activeJobs.has(jobName)) {
    log.debug('Skipping job - previous run still in progress', { jobName });
    return;
  }

  const entry: JobExecutionEntry = {
    jobName,
    startedAt: new Date(),
    completedAt: null,
    status: 'running',
    durationMs: null,
    error: null,
  };

  if (jobExecutionHistory.length >= MAX_HISTORY_ENTRIES) {
    jobExecutionHistory.shift();
  }
  jobExecutionHistory.push(entry);

  const jobInfo = registeredJobs.get(jobName);
  if (jobInfo) {
    jobInfo.lastRunAt = entry.startedAt;
    jobInfo.lastStatus = 'running';
  }

  activeJobs.add(jobName);

  // Write to DB cron_run_log
  let dbLogId: string | null = null;
  try {
    const [inserted] = await db.insert(cronRunLog).values({
      jobName: jobName,
      status: 'running',
      startedAt: entry.startedAt,
    }).returning({ id: cronRunLog.id });
    dbLogId = inserted?.id;
  } catch (err) {
    log.error('Failed to insert initial cron_run_log', { jobName, error: err });
  }

  try {
    const result = await fn();
    entry.completedAt = new Date();
    entry.status = 'completed';
    entry.durationMs = entry.completedAt.getTime() - entry.startedAt.getTime();
    if (jobInfo) jobInfo.lastStatus = 'completed';
    
    if (dbLogId) {
      await db.update(cronRunLog).set({
        status: 'completed',
        completedAt: entry.completedAt,
        durationMs: entry.durationMs,
        resultSummary: typeof result === 'object' ? JSON.stringify(result) : String(result),
      }).where(eq(cronRunLog.id, dbLogId));
    }

    persistJobResult(entry).catch((e) =>
      log.error('Failed to persist completed result', { jobName, error: e instanceof Error ? e.message : String(e) })
    );
  } catch (err: any) {
    entry.completedAt = new Date();
    entry.status = 'failed';
    entry.durationMs = entry.completedAt.getTime() - entry.startedAt.getTime();
    entry.error = err?.message || String(err);
    if (jobInfo) jobInfo.lastStatus = 'failed';

    if (dbLogId) {
      await db.update(cronRunLog).set({
        status: 'failed',
        completedAt: entry.completedAt,
        durationMs: entry.durationMs,
        errorMessage: entry.error,
      }).where(eq(cronRunLog.id, dbLogId));
    }

    handleJobFailure(entry).catch((e) =>
      log.error('Failed to handle job failure', { jobName, error: e instanceof Error ? e.message : String(e) })
    );
  } finally {
    activeJobs.delete(jobName);
  }
}

async function persistJobResult(entry: JobExecutionEntry): Promise<void> {
  try {
    await storage.createAuditLog({
      workspaceId: SYSTEM_WORKSPACE_ID,
      ...COAILEAGUE_AUTOMATION_USER,
      action: entry.status === 'completed' ? 'scheduler_job_completed' : 'scheduler_job_failed',
      actionDescription: entry.status === 'completed'
        ? `Scheduled job "${entry.jobName}" completed in ${entry.durationMs}ms`
        : `Scheduled job "${entry.jobName}" failed: ${entry.error}`,
      entityType: 'scheduler_job',
      entityId: entry.jobName,
      metadata: {
        jobName: entry.jobName,
        status: entry.status,
        startedAt: entry.startedAt.toISOString(),
        completedAt: entry.completedAt?.toISOString() ?? null,
        durationMs: entry.durationMs,
        error: entry.error,
      },
    });
  } catch (err) {
    log.error('Audit log persistence failed', { jobName: entry.jobName, error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleJobFailure(entry: JobExecutionEntry): Promise<void> {
  await persistJobResult(entry);

  try {
    const event: PlatformEvent = {
      type: 'scheduler_job_failed',
      category: 'error',
      title: `Scheduled Job Failed: ${entry.jobName}`,
      description: `Job "${entry.jobName}" failed after ${entry.durationMs}ms: ${entry.error}`,
      metadata: {
        jobName: entry.jobName,
        startedAt: entry.startedAt.toISOString(),
        completedAt: entry.completedAt?.toISOString() ?? null,
        durationMs: entry.durationMs,
        error: entry.error,
        severity: 'high' as const,
        audience: 'staff' as const,
      },
      visibility: 'org_leadership',
    };
    await platformEventBus.publish(event);
  } catch (err) {
    log.error('Failed to emit scheduler_job_failed event', { jobName: entry.jobName, error: err instanceof Error ? err.message : String(err) });
  }

  try {
    const adminRoleRows = await db
      .select({ userId: platformRoles.userId })
      .from(platformRoles)
      .where(
        and(
          inArray(platformRoles.role, ['root_admin', 'deputy_admin', 'sysop', 'support_manager'] as any),
          isNull(platformRoles.revokedAt),
          eq(platformRoles.isSuspended, false)
        )
      );
    const platformAdmins = adminRoleRows.map(r => ({ id: r.userId }));

    for (const admin of platformAdmins) {
      try {
        await createNotification({
          workspaceId: SYSTEM_WORKSPACE_ID,
          userId: admin.id,
          type: 'scheduler_job_failed',
          title: `Scheduled Job Failed: ${entry.jobName}`,
          message: `Job "${entry.jobName}" failed after ${entry.durationMs}ms. Error: ${entry.error}`,
          metadata: {
            jobName: entry.jobName,
            durationMs: entry.durationMs,
            error: entry.error,
          },
        });
      } catch (notifErr) {
        log.error('Failed to notify admin about job failure', { adminId: admin.id, error: notifErr instanceof Error ? notifErr.message : String(notifErr) });
      }
    }
  } catch (err) {
    log.error('Failed to query platform admins for failure notification', { error: err instanceof Error ? err.message : String(err) });
  }
}

function registerJobInfo(jobName: string, schedule: string, description: string, enabled: boolean) {
  registeredJobs.set(jobName, {
    jobName,
    schedule,
    description,
    lastRunAt: null,
    lastStatus: null,
    enabled,
  });
}

export function getJobExecutionHistory(): JobExecutionEntry[] {
  return [...jobExecutionHistory];
}

export function getScheduledJobsSummary(): ScheduledJobInfo[] {
  return Array.from(registeredJobs.values());
}

// ============================================================================
// GOVERNANCE GATE - 99% Automation / 1% Human Approval
// ============================================================================

/**
 * Apply governance gate before automation execution
 * Returns true if automation should proceed, false if paused for approval
 */
async function applyGovernanceGate(
  domain: 'scheduling' | 'payroll' | 'invoicing',
  workspaceId: string,
  actionDetails: {
    type: string;
    affectedRecords: number;
    estimatedImpact: string;
  }
): Promise<{ proceed: boolean; approvalId?: string; reason: string }> {
  try {
    const result = await trinityOrchestrationGovernance.evaluateAutomation(
      domain,
      workspaceId,
      actionDetails
    );

    if (result.requiresHumanApproval) {
      log.info('Automation paused by governance', { domain, reason: result.reason });
      log.info('Governance approval required', { approvalId: result.approvalId });
      return { proceed: false, approvalId: result.approvalId, reason: result.reason };
    }

    log.info('Automation approved by governance', { domain, reason: result.reason });
    return { proceed: true, reason: result.reason };
  } catch (error: any) {
    log.error('Governance check failed — blocking automation for safety', { error: (error instanceof Error ? error.message : String(error)), domain, workspaceId });
    return { proceed: false, reason: `Governance check error: ${(error instanceof Error ? error.message : String(error))} — automation blocked (fail-safe)` };
  }
}

// ============================================================================
// AI BRAIN INTEGRATION - Automation Event Emission
// ============================================================================

interface AutomationEventData {
  jobName: string;
  category: 'billing' | 'scheduling' | 'payroll' | 'compliance' | 'maintenance' | 'notification' | 'automation' | 'governance';
  success: boolean;
  recordsProcessed?: number;
  duration?: number;
  details?: Record<string, any>;
  workspaceId?: string;
}

async function emitAutomationEvent(data: AutomationEventData) {
  const categoryToEventCategory: Record<string, EventCategory> = {
    billing: 'feature',
    scheduling: 'feature',
    payroll: 'feature',
    compliance: 'announcement',
    maintenance: 'improvement',
    notification: 'announcement',
  };

  const categoryToVisibility: Record<string, EventVisibility> = {
    billing: 'manager',
    scheduling: 'staff',
    payroll: 'manager',
    compliance: 'manager',
    maintenance: 'admin',
    notification: 'all',
  };

  // Generate Trinity-style humanized descriptions
  const successDescriptions = [
    `Done! ${data.jobName} ran smoothly${data.recordsProcessed ? ` - ${data.recordsProcessed} records handled` : ''}.`,
    `${data.jobName} just finished up${data.duration ? ` (took ${data.duration}ms)` : ''}.`,
    `All good - ${data.jobName} completed${data.recordsProcessed ? `, processed ${data.recordsProcessed} records` : ''}.`,
    `Finished running ${data.jobName}. Everything looks good.`,
  ];
  
  const failDescriptions = [
    `Heads up: ${data.jobName} hit a snag. Looking into it.`,
    `${data.jobName} ran into an issue. Will investigate.`,
    `Hmm, ${data.jobName} didn't complete. Checking what happened.`,
  ];

  const event: PlatformEvent = {
    type: 'automation_completed',
    category: categoryToEventCategory[data.category] || 'feature',
    title: `${data.jobName} ${data.success ? 'Completed' : 'Failed'}`,
    description: data.success 
      ? successDescriptions[Math.floor(Math.random() * successDescriptions.length)]
      : failDescriptions[Math.floor(Math.random() * failDescriptions.length)],
    workspaceId: data.workspaceId,
    metadata: {
      jobName: data.jobName,
      category: data.category,
      success: data.success,
      recordsProcessed: data.recordsProcessed,
      duration: data.duration,
      timestamp: new Date().toISOString(),
      ...data.details,
      audience: data.category === 'maintenance' ? 'staff' : 'all',
      severity: data.success ? 'low' : 'high',
    },
    visibility: categoryToVisibility[data.category] || 'manager',
  };

  try {
    await platformEventBus.publish(event);
    log.debug('Automation event emitted', { jobName: data.jobName });
  } catch (error) {
    log.error('Failed to emit automation event', { error: error instanceof Error ? error.message : String(error) });
  }
}

// ============================================================================
// IDEMPOTENCY FINGERPRINTING
// ============================================================================

/**
 * Build idempotency fingerprint for invoice generation
 * Includes: workspace, period boundaries (start/end dates), schedule config hash
 */
function buildInvoiceFingerprintData(workspace: any, date: Date) {
  // Calculate billing period boundaries (yesterday's work)
  const periodEnd = new Date(date);
  periodEnd.setHours(0, 0, 0, 0);
  const periodStart = new Date(periodEnd);
  periodStart.setDate(periodStart.getDate() - 1);
  
  return {
    workspaceId: workspace.id,
    runDate: date.toISOString().split('T')[0], // YYYY-MM-DD
    periodStart: periodStart.toISOString().split('T')[0],
    periodEnd: periodEnd.toISOString().split('T')[0],
    schedule: workspace.invoiceSchedule,
    dayOfWeek: workspace.invoiceDayOfWeek,
    dayOfMonth: workspace.invoiceDayOfMonth,
    biweeklyAnchor: workspace.invoiceBiweeklyAnchor?.toISOString(),
    configHash: crypto
      .createHash('sha256')
      .update(JSON.stringify({
        schedule: workspace.invoiceSchedule,
        dayOfWeek: workspace.invoiceDayOfWeek,
        dayOfMonth: workspace.invoiceDayOfMonth,
      }))
      .digest('hex')
      .substring(0, 16),
  };
}

function buildPayrollFingerprintData(workspace: any, date: Date) {
  // Calculate payroll period boundaries  
  const periodEnd = new Date(date);
  periodEnd.setHours(0, 0, 0, 0);
  const periodStart = new Date(periodEnd);
  periodStart.setDate(periodStart.getDate() - 1);
  
  return {
    workspaceId: workspace.id,
    runDate: date.toISOString().split('T')[0], // YYYY-MM-DD
    periodStart: periodStart.toISOString().split('T')[0],
    periodEnd: periodEnd.toISOString().split('T')[0],
    schedule: workspace.payrollSchedule,
    dayOfWeek: workspace.payrollDayOfWeek,
    dayOfMonth: workspace.payrollDayOfMonth,
    cutoffDay: workspace.payrollCutoffDay,
    biweeklyAnchor: workspace.payrollBiweeklyAnchor?.toISOString(),
    configHash: crypto
      .createHash('sha256')
      .update(JSON.stringify({
        schedule: workspace.payrollSchedule,
        dayOfWeek: workspace.payrollDayOfWeek,
        dayOfMonth: workspace.payrollDayOfMonth,
        cutoffDay: workspace.payrollCutoffDay,
      }))
      .digest('hex')
      .substring(0, 16),
  };
}

/**
 * Build idempotency fingerprint for schedule generation
 * Includes: workspace, period boundaries (next week), schedule config hash
 */
function buildScheduleFingerprintData(workspace: any, date: Date, nextWeekStart: Date, nextWeekEnd: Date) {
  return {
    workspaceId: workspace.id,
    runDate: date.toISOString().split('T')[0], // YYYY-MM-DD
    periodStart: nextWeekStart.toISOString().split('T')[0],
    periodEnd: nextWeekEnd.toISOString().split('T')[0],
    interval: workspace.scheduleGenerationInterval,
    dayOfWeek: workspace.scheduleDayOfWeek,
    dayOfMonth: workspace.scheduleDayOfMonth,
    advanceNoticeDays: workspace.scheduleAdvanceNoticeDays,
    biweeklyAnchor: workspace.scheduleBiweeklyAnchor?.toISOString(),
    configHash: crypto
      .createHash('sha256')
      .update(JSON.stringify({
        interval: workspace.scheduleGenerationInterval,
        dayOfWeek: workspace.scheduleDayOfWeek,
        dayOfMonth: workspace.scheduleDayOfMonth,
        advanceNoticeDays: workspace.scheduleAdvanceNoticeDays,
      }))
      .digest('hex')
      .substring(0, 16),
  };
}

// ============================================================================
// AUTOMATION AUDIT LOGGING
// ============================================================================

/**
 * System workspace ID constant
 * Used for system-wide operations that don't belong to a specific workspace
 * Note: This ID should NOT be used for audit logging as it doesn't exist in the workspaces table
 */
const SYSTEM_WORKSPACE_ID = 'system';

/**
 * System user context for automation jobs
 * Used for all AuditOS audit logs generated by autonomous processes
 */
const COAILEAGUE_AUTOMATION_USER = {
  userId: 'system-coaileague',
  userName: 'CoAIleague Automation',
  userEmail: 'automation@coaileague.ai',
  userRole: 'system' as const,
};

/**
 * Log automation job lifecycle (start, complete, error) to AuditOS
 * 
 * Ensures all automation activities are auditable and never fails the main job
 * if audit logging encounters errors.
 */
async function logAutomationLifecycle<T>(
  params: {
    jobType: 'invoicing' | 'scheduling' | 'payroll' | 'idempotency_cleanup' | 'room_auto_close';
    workspaceId: string;
    workspaceName: string;
    runId: string;
  },
  runner: () => Promise<T>
): Promise<T> {
  const { jobType, workspaceId, workspaceName, runId } = params;
  const startTime = Date.now();

  // Map job types to AI Brain feature names
  const featureNameMap = {
    invoicing: 'Smart Billing',
    scheduling: 'AI Scheduling',
    payroll: 'Auto Payroll',
    idempotency_cleanup: 'Compliance Auditing',
    room_auto_close: 'Chat Workrooms',
  };
  const featureName = featureNameMap[jobType];

  // Log job start (don't fail if audit logging fails)
  // Skip audit logging for system-wide operations (workspaceId=SYSTEM_WORKSPACE_ID)
  try {
    if (workspaceId !== SYSTEM_WORKSPACE_ID) {
      await storage.createAuditLog({
        workspaceId,
        ...COAILEAGUE_AUTOMATION_USER,
        action: 'automation_job_start',
        actionDescription: `${featureName} automation started for ${workspaceName}`,
        entityType: 'automation_job',
        entityId: runId,
        metadata: {
          jobType,
          featureName,
          timestamp: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    log.warn('Failed to log automation start', { workspaceName, error: error instanceof Error ? error.message : String(error) });
  }

  try {
    // Execute the actual job
    const result = await runner();
    const duration = Date.now() - startTime;

    // Log job completion
    // Skip audit logging for system-wide operations (workspaceId=SYSTEM_WORKSPACE_ID)
    try {
      if (workspaceId !== SYSTEM_WORKSPACE_ID) {
        await storage.createAuditLog({
          workspaceId,
          ...COAILEAGUE_AUTOMATION_USER,
          action: 'automation_job_complete',
          actionDescription: `${featureName} automation completed for ${workspaceName}`,
          entityType: 'automation_job',
          entityId: runId,
          metadata: {
            jobType,
            featureName,
            duration,
            timestamp: new Date().toISOString(),
            result: typeof result === 'object' ? result : { value: result },
          },
        });
      }
    } catch (error) {
      log.warn('Failed to log automation completion', { workspaceName, error: error instanceof Error ? error.message : String(error) });
    }

    return result;
  } catch (error: any) {
    const duration = Date.now() - startTime;

    // Log job error
    // Skip audit logging for system-wide operations (workspaceId=SYSTEM_WORKSPACE_ID)
    try {
      if (workspaceId !== SYSTEM_WORKSPACE_ID) {
        await storage.createAuditLog({
          workspaceId,
          ...COAILEAGUE_AUTOMATION_USER,
          action: 'automation_job_error',
          actionDescription: `${featureName} automation failed for ${workspaceName}: ${(error instanceof Error ? error.message : String(error))}`,
          entityType: 'automation_job',
          entityId: runId,
          metadata: {
            jobType,
            featureName,
            duration,
            error: error.message,
            stack: error.stack?.substring(0, 500), // Truncate stack trace
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (auditError) {
      log.warn('Failed to log automation error', { workspaceName, error: auditError instanceof Error ? auditError.message : String(auditError) });
    }

    throw error; // Re-throw to maintain original error handling
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const SCHEDULER_CONFIG = {
  invoicing: {
    enabled: true,
    schedule: '0 2 * * *', // Every day at 2 AM
    description: 'Daily check for invoice generation based on workspace schedules'
  },
  scheduling: {
    enabled: true,
    schedule: '0 23 * * *', // Every day at 11 PM
    description: 'Daily check for schedule generation based on workspace intervals'
  },
  payroll: {
    enabled: true,
    schedule: '0 3 * * *', // Every day at 3 AM (after invoicing)
    description: 'Daily check for payroll processing based on workspace pay periods'
  },
  cleanup: {
    enabled: true,
    schedule: '0 4 * * *', // Every day at 4 AM (after all automation jobs)
    description: 'Daily cleanup of expired idempotency keys based on TTL'
  },
  roomAutoClose: {
    enabled: true,
    schedule: '*/5 * * * *', // Every 5 minutes
    description: 'Auto-close expired shift rooms based on autoCloseAt timestamp'
  },
  wsConnectionCleanup: {
    enabled: true,
    schedule: '*/5 * * * *', // Every 5 minutes
    description: 'Auto-close orphaned WebSocket connections (>5min) and purge stale records (>24h)'
  },
  visualQa: {
    enabled: true,
    schedule: '0 6 * * *', // Every day at 6 AM (after other maintenance jobs)
    description: 'Daily visual QA scan of key platform pages using Trinity Vision'
  },
  autoClockOut: {
    enabled: true,
    schedule: '*/30 * * * *', // Every 30 minutes
    description: 'Auto clock-out officers whose shift ended >30 minutes ago with no clock-out'
  },
  shiftCompletionBridge: {
    enabled: true,
    schedule: '*/30 * * * *', // Every 30 minutes (runs after autoClockOut fills open clock-outs)
    description: 'Create pending time entries for assigned shifts with no clock-in/out recorded'
  },
  loneWorkerMonitor: {
    enabled: true,
    schedule: '*/5 * * * *', // Every 5 minutes
    description: 'Check lone worker sessions for missed check-ins and fire wellness alerts'
  },
  paymentReminders: {
    enabled: true,
    schedule: '0 9 * * *', // Every day at 9 AM
    description: 'Daily check for overdue invoices and send payment reminders'
  },
  lateFees: {
    enabled: true,
    schedule: '30 2 * * *', // Every day at 2:30 AM (after nightly invoice gen at 2 AM)
    description: 'Daily late fee application to overdue invoices based on workspace settings'
  },
  payrollReadiness: {
    enabled: true,
    schedule: '0 8 * * *', // Every day at 8 AM — surfaces issues with enough notice for same-day fixes
    description: 'Pre-payroll 48-hour data readiness scan: missing pay rates, bank accounts, worker types'
  },
  trainingRenewal: {
    enabled: true,
    schedule: '0 7 * * *', // Every day at 7 AM — before shift start
    description: 'Daily training certificate renewal scan: flag expired certs, notify officers, create interventions'
  },
  approvalExpiry: {
    enabled: true,
    schedule: '*/15 * * * *', // Every 15 minutes
    description: 'Mark pending AI approvals as expired once they pass their expiresAt timestamp. Prevents stale approvals from accumulating indefinitely and blocking automation — ai_approval_requests.expiresAt was never being enforced before this job was wired in (workflow audit 2026-04-08).'
  },
  revenueRecognition: {
    enabled: true,
    schedule: '0 1 1 * *', // 1 AM on the 1st of every month (after creditReset at midnight)
    description: 'Monthly ASC 606 accrual revenue recognition: process scheduled entries, update deferred revenue, write org ledger'
  },
};

// ============================================================================
// JOB HANDLERS
// ============================================================================

/**
 * Nightly Invoice Generation
 * Runs for all workspaces with auto-invoicing enabled
 */
async function runNightlyInvoiceGeneration() {
  log.info('Autonomous invoicing started', { timestamp: new Date().toISOString() });

  try {
    // Get all active workspaces with auto-invoicing enabled
    const activeWorkspaces = await db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.isSuspended, false),
          eq(workspaces.isFrozen, false),
          eq(workspaces.isLocked, false),
          eq(workspaces.autoInvoicingEnabled, true),
          ne(workspaces.subscriptionStatus, 'cancelled'),
        )
      );

    log.info('Found workspaces with auto-invoicing', { count: activeWorkspaces.length });

    let totalInvoicesGenerated = 0;
    let successCount = 0;
    let errorCount = 0;

    const today = new Date();
    const dayOfMonth = today.getDate();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    
    for (const workspace of activeWorkspaces) {
      try {
        const schedule = workspace.invoiceSchedule || 'monthly';
        
        log.debug('Checking workspace', { workspaceName: workspace.name, workspaceId: workspace.id });
        log.debug('Workspace schedule', { schedule });
        
        // Check if today matches the workspace's invoice schedule
        let shouldGenerateInvoices = false;
        
        if (schedule === 'weekly') {
          const dayOfWeekSetting = workspace.invoiceDayOfWeek ?? 1; // Default Monday
          shouldGenerateInvoices = dayOfWeek === dayOfWeekSetting;
          log.debug('Day of week check', { setting: dayOfWeekSetting, today: dayOfWeek });
        } else if (schedule === 'biweekly') {
          const dayOfWeekSetting = workspace.invoiceDayOfWeek ?? 1; // Default Monday
          
          // Seed anchor if not set (transactional)
          if (!workspace.invoiceBiweeklyAnchor) {
            log.info('Seeding biweekly anchor for first run');
            const anchor = seedAnchor(dayOfWeekSetting, today);
            await db.transaction(async (tx) => {
              await tx.update(workspaces)
                .set({ invoiceBiweeklyAnchor: anchor })
                .where(eq(workspaces.id, workspace.id));
            });
            workspace.invoiceBiweeklyAnchor = anchor;
          }
          
          // Check anchor drift
          detectAnchorDrift(workspace.invoiceBiweeklyAnchor, today);
          
          // Use anchor-based calculation
          shouldGenerateInvoices = shouldRunBiweekly(workspace.invoiceBiweeklyAnchor, dayOfWeekSetting, today);
        } else if (schedule === 'semi-monthly') {
          // 15th and last day of month
          shouldGenerateInvoices = dayOfMonth === 15 || dayOfMonth === lastDayOfMonth;
          log.debug('Semi-monthly pay dates check', { today: dayOfMonth });
        } else if (schedule === 'monthly') {
          const dayOfMonthSetting = workspace.invoiceDayOfMonth ?? 1;
          shouldGenerateInvoices = dayOfMonth === dayOfMonthSetting;
          log.debug('Day of month check', { setting: dayOfMonthSetting, today: dayOfMonth });
        } else if (schedule === 'net30') {
          const dayOfMonthSetting = workspace.invoiceDayOfMonth ?? 1;
          shouldGenerateInvoices = dayOfMonth === dayOfMonthSetting;
          log.debug('Day of month check', { setting: dayOfMonthSetting, today: dayOfMonth });
        } else if (schedule === 'custom' && workspace.invoiceCustomDays) {
          // PHASE 4B: Custom interval tracking using database table
          const customIntervals = await db
            .select()
            .from(customSchedulerIntervals)
            .where(eq(customSchedulerIntervals.workspaceId, workspace.id));
          
          if (customIntervals.length > 0) {
            const interval = customIntervals[0];
            if (interval.lastRunAt) {
              const daysSinceLastRun = Math.floor((today.getTime() - new Date(interval.lastRunAt).getTime()) / (1000 * 60 * 60 * 24));
              shouldGenerateInvoices = daysSinceLastRun >= workspace.invoiceCustomDays;
              log.debug('Custom invoice interval check', { daysSinceLastRun, threshold: workspace.invoiceCustomDays });
            } else {
              shouldGenerateInvoices = true; // First run
              log.debug('Custom interval first run');
            }
          }
        }
        
        if (shouldGenerateInvoices) {
          log.info('Schedule matched, checking idempotency');
          
          // Wrap automation in audit logging lifecycle
          const runId = `billos-${workspace.id}-${Date.now()}`;
          
          await logAutomationLifecycle(
            {
              jobType: 'invoicing',
              workspaceId: workspace.id,
              workspaceName: workspace.name,
              runId,
            },
            async () => {
              // IDEMPOTENCY: Check if this operation already ran today (14-day TTL for retry window)
              const idem = await executeIdempotencyCheck({
                workspaceId: workspace.id,
                operationType: 'invoice_generation',
                requestData: buildInvoiceFingerprintData(workspace, today),
                ttlDays: 14,
              });
              
              if (!idem.isNew) {
                log.warn('Duplicate invoice generation detected', { idempotencyKeyId: idem.idempotencyKeyId });
                log.warn('Skipping execution due to existing status', { status: idem.status });
                return { 
                  invoicesGenerated: 0, 
                  isDuplicate: true,
                  idempotencyKeyId: idem.idempotencyKeyId,
                };
              }
              
              log.info('New operation confirmed, checking governance', { idempotencyKeyId: idem.idempotencyKeyId });
              
              // GOVERNANCE GATE: 99% automation / 1% human approval
              const governanceResult = await applyGovernanceGate('invoicing', workspace.id, {
                type: 'nightly_invoice_generation',
                affectedRecords: 0, // Will be determined after generation
                estimatedImpact: `Generate invoices for ${workspace.name}`,
              });

              if (!governanceResult.proceed) {
                log.info('Governance paused automation', { reason: governanceResult.reason });
                await updateIdempotencyResult({
                  idempotencyKeyId: idem.idempotencyKeyId,
                  status: 'pending_approval',
                  resultMetadata: {
                    governanceApprovalId: governanceResult.approvalId,
                    pausedReason: governanceResult.reason,
                  },
                });
                return {
                  invoicesGenerated: 0,
                  isPendingApproval: true,
                  approvalId: governanceResult.approvalId,
                  idempotencyKeyId: idem.idempotencyKeyId,
                };
              }

              log.info('Governance approved, generating invoices');
              
              try {
                // Route to correct invoice generator based on billing schedule
                let invoices: any[] = [];
                if (schedule === 'weekly') {
                  const result = await generateWeeklyInvoices(workspace.id, new Date(), 7);
                  invoices = result.invoices || [];
                  log.info('Weekly invoice generated', { periodStart: result.periodStart, periodEnd: result.periodEnd, invoicesGenerated: result.invoicesGenerated });
                } else if (schedule === 'biweekly') {
                  const result = await generateWeeklyInvoices(workspace.id, new Date(), 14);
                  invoices = result.invoices || [];
                  log.info('Biweekly invoice generated', { periodStart: result.periodStart, periodEnd: result.periodEnd, invoicesGenerated: result.invoicesGenerated });
                } else if (schedule === 'semi-monthly') {
                  const daysSinceStart = today.getDate() <= 15 ? today.getDate() : today.getDate() - 15;
                  const result = await generateWeeklyInvoices(workspace.id, new Date(), daysSinceStart);
                  invoices = result.invoices || [];
                  log.info('Semi-monthly invoice generated', { periodStart: result.periodStart, periodEnd: result.periodEnd, invoicesGenerated: result.invoicesGenerated });
                } else {
                  // Monthly / Net30 / Custom: use daily aggregation (backwards compatible)
                  invoices = await generateUsageBasedInvoices(workspace.id);
                }
                
                if (invoices.length > 0) {
                  log.info('Invoices generated', { count: invoices.length, workspaceName: workspace.name });
                  totalInvoicesGenerated += invoices.length;
                  successCount++;
                  
                  // AUTONOMOUS BILLING: Automatically send invoices via Stripe
                  let invoicesSent = 0;
                  for (const invoice of invoices) {
                    try {
                      const result = await sendInvoiceViaStripe(invoice.id);
                      if (result.success) {
                        log.info('Invoice sent via Stripe', { invoiceNumber: invoice.invoiceNumber, stripeInvoiceId: result.stripeInvoiceId });
                        invoicesSent++;
                      } else {
                        log.warn('Failed to send invoice via Stripe', { invoiceNumber: invoice.invoiceNumber, error: result.error });
                      }
                    } catch (stripeError: any) {
                      log.error('Stripe error for invoice', { invoiceNumber: invoice.invoiceNumber, error: stripeError.message });
                    }
                  }
                  
                  // AUTONOMOUS BILLING: Sync invoices to QuickBooks (if connected)
                  let invoicesQBSynced = 0;
                  for (const invoice of invoices) {
                    try {
                      const qbResult = await syncInvoiceToQuickBooks(invoice.id);
                      if (qbResult.success) {
                        log.info('Invoice synced to QuickBooks', { invoiceNumber: invoice.invoiceNumber, qbInvoiceId: qbResult.qbInvoiceId });
                        invoicesQBSynced++;
                      } else if (qbResult.error === 'QuickBooks not connected') {
                        break;
                      } else {
                        log.warn('QuickBooks sync failed for invoice', { invoiceNumber: invoice.invoiceNumber, error: qbResult.error });
                      }
                    } catch (qbError: any) {
                      log.warn('QuickBooks sync error for invoice', { invoiceNumber: invoice.invoiceNumber, error: qbError.message });
                    }
                  }

                  // NOTIFY ORG OWNERS/ADMINS: Invoice generation complete
                  try {
                    const orgLeaders = await db.select()
                      .from(employees)
                      .where(
                        and(
                          eq(employees.workspaceId, workspace.id),
                          sql`(${employees.workspaceRole} IN ('org_owner', 'co_owner'))`
                        )
                      );
                    
                    for (const leader of orgLeaders) {
                      if (leader.userId) {
                        await createNotification({
                          workspaceId: workspace.id,
                          userId: leader.userId,
                          type: 'system',
                          title: 'Invoices Generated Automatically',
                          message: `AI Brain generated ${invoices.length} invoice(s), sent ${invoicesSent} via Stripe${invoicesQBSynced > 0 ? `, synced ${invoicesQBSynced} to QuickBooks` : ''}. View invoices to review billing details.`,
                          actionUrl: '/invoices',
                          relatedEntityType: 'workspace',
                          relatedEntityId: workspace.id,
                          metadata: { 
                            invoicesGenerated: invoices.length,
                            invoicesSent,
                            invoicesQBSynced,
                            automationRun: runId,
                          },
                          createdBy: 'system-coaileague',
                          idempotencyKey: `system-${workspace.id}-${leader.userId}`
                        });
                      }
                    }
                    log.info('Notified org leaders about invoice generation', { count: orgLeaders.length });
                  } catch (notifError) {
                    log.warn('Failed to send notifications', { error: notifError instanceof Error ? notifError.message : String(notifError) });
                  }
                } else {
                  log.info('No unbilled time entries', { workspaceName: workspace.name });
                }
                
                // Update lastRunAt, advance anchor, and mark idempotency complete (ATOMIC)
                await db.transaction(async (tx) => {
                  const updateData: any = { lastInvoiceRunAt: today };
                  
                  // Advance biweekly anchor if applicable (maintains 14-day cadence)
                  if (schedule === 'biweekly' && workspace.invoiceBiweeklyAnchor) {
                    const newAnchor = advanceAnchor(workspace.invoiceBiweeklyAnchor);
                    updateData.invoiceBiweeklyAnchor = newAnchor;
                  }
                  
                  await tx.update(workspaces)
                    .set(updateData)
                    .where(eq(workspaces.id, workspace.id));
                  
                  // Mark idempotency complete in SAME transaction using transaction-aware helper
                  await updateIdempotencyResult({
                    idempotencyKeyId: idem.idempotencyKeyId,
                    status: 'completed',
                    resultId: invoices.length > 0 ? String(invoices[0].id) : undefined,
                    resultMetadata: {
                      invoicesGenerated: invoices.length,
                      isDuplicate: false,
                      workspaceName: workspace.name,
                      schedule,
                      periodStart: buildInvoiceFingerprintData(workspace, today).periodStart,
                      periodEnd: buildInvoiceFingerprintData(workspace, today).periodEnd,
                    },
                  }, tx); // Pass transaction client for atomic update
                });
                
                return { 
                  invoicesGenerated: invoices.length,
                  isDuplicate: false,
                  idempotencyKeyId: idem.idempotencyKeyId,
                };
              } catch (error: any) {
                // Mark idempotency operation failed with full error context
                await updateIdempotencyResult({
                  idempotencyKeyId: idem.idempotencyKeyId,
                  status: 'failed',
                  errorMessage: (error instanceof Error ? error.message : String(error)),
                  errorStack: error.stack,
                  resultMetadata: {
                    isDuplicate: false,
                    workspaceName: workspace.name,
                    schedule,
                  },
                });
                throw error; // Re-throw to trigger audit log error
              }
            }
          );
        } else {
          log.debug('Not an invoice generation date, skipping');
        }
      } catch (error) {
        log.error('Failed to generate invoices', { workspaceName: workspace.name, error: error instanceof Error ? error.message : String(error) });
        errorCount++;
      }
    }

    // ====================================================================
    // PER-CLIENT BILLING CYCLE PASS
    // Generates invoices for clients whose individual billing cycle is due
    // today, even if the workspace-level schedule didn't trigger above.
    // ====================================================================
    let clientCycleInvoices = 0;
    for (const workspace of activeWorkspaces) {
      try {
        const clientSettings = await db
          .select()
          .from(clientBillingSettings)
          .where(
            and(
              eq(clientBillingSettings.workspaceId, workspace.id),
              eq(clientBillingSettings.isActive, true)
            )
          );

        if (clientSettings.length === 0) continue;

        for (const cs of clientSettings) {
          try {
            const cycle = cs.billingCycle || 'monthly';
            let shouldInvoiceClient = false;
            let periodDays = 30;

            if (cycle === 'daily') {
              shouldInvoiceClient = true;
              periodDays = 1;
            } else if (cycle === 'weekly') {
              const targetDay = cs.billingDayOfWeek ?? 1;
              shouldInvoiceClient = dayOfWeek === targetDay;
              periodDays = 7;
            } else if (cycle === 'bi_weekly') {
              const targetDay = cs.billingDayOfWeek ?? 1;
              if (dayOfWeek === targetDay) {
                const weekNum = Math.floor(today.getTime() / (7 * 24 * 60 * 60 * 1000));
                shouldInvoiceClient = weekNum % 2 === 0;
              }
              periodDays = 14;
            } else if (cycle === 'monthly') {
              const targetDom = cs.billingDayOfMonth ?? 1;
              shouldInvoiceClient = dayOfMonth === targetDom;
              periodDays = lastDayOfMonth;
            }

            const wsSchedule = workspace.invoiceSchedule || 'monthly';
            const wsAlreadyRanToday = (() => {
              if (wsSchedule === 'weekly' && dayOfWeek === (workspace.invoiceDayOfWeek ?? 1)) return true;
              if (wsSchedule === 'monthly' && dayOfMonth === (workspace.invoiceDayOfMonth ?? 1)) return true;
              return false;
            })();

            if (shouldInvoiceClient && !wsAlreadyRanToday) {
              log.info('Generating per-client invoice', { clientId: cs.clientId, cycle });
              const invoices = await generateInvoiceForClient(workspace.id, cs.clientId, periodDays, today);
              clientCycleInvoices += invoices.length;

              for (const invoice of invoices) {
                if (cs.autoSendInvoice) {
                  try {
                    await sendInvoiceViaStripe(invoice.id);
                  } catch (e: any) {
                    log.warn('Per-client auto-send failed', { invoiceId: invoice.id, error: e.message });
                  }
                }
              }
            }
          } catch (clientErr: any) {
            log.error('Per-client billing error', { clientId: cs.clientId, error: clientErr.message });
          }
        }
      } catch (wsErr: any) {
        log.error('Per-client billing workspace error', { workspaceId: workspace.id, error: wsErr.message });
      }
    }

    if (clientCycleInvoices > 0) {
      totalInvoicesGenerated += clientCycleInvoices;
      log.info('Per-client invoices generated', { count: clientCycleInvoices });
    }

    log.info('Autonomous invoicing summary', { totalWorkspaces: activeWorkspaces.length, successful: successCount, errors: errorCount, totalInvoicesGenerated });

  } catch (error) {
    log.error('Critical error in nightly invoice generation', { error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Weekly Schedule Generation
 * Runs Sunday nights to create schedules for upcoming week
 */
async function runWeeklyScheduleGeneration() {
  log.info('Autonomous scheduling started', { timestamp: new Date().toISOString() });

  try {
    // Get all active workspaces with auto-scheduling enabled
    const activeWorkspaces = await db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.isSuspended, false),
          eq(workspaces.isFrozen, false),
          eq(workspaces.isLocked, false),
          eq(workspaces.autoSchedulingEnabled, true)
        )
      );

    const { isBillingExcluded } = await import('./billing/billingConstants');
    const billableWorkspaces = activeWorkspaces.filter(ws => {
      return !isBillingExcluded(ws.id);
    });

    log.info('Found workspaces with auto-scheduling', { count: billableWorkspaces.length, filtered: activeWorkspaces.length - billableWorkspaces.length });

    const today = new Date();
    const dayOfMonth = today.getDate();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday
    
    // Calculate next week's date range
    const nextWeekStart = startOfWeek(addDays(new Date(), 7)); // Next Monday
    const nextWeekEnd = endOfWeek(nextWeekStart); // Following Sunday

    log.info(`\n📅 Target schedule period:`);
    log.info(`   Start: ${format(nextWeekStart, 'MMM dd, yyyy')}`);
    log.info(`   End:   ${format(nextWeekEnd, 'MMM dd, yyyy')}\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const workspace of billableWorkspaces) {
      try {
        const interval = workspace.scheduleGenerationInterval || 'weekly';
        const advanceNoticeDays = workspace.scheduleAdvanceNoticeDays || 7;
        
        log.debug('Checking workspace', { workspaceName: workspace.name, workspaceId: workspace.id });
        log.debug('Schedule interval', { interval });
        log.debug('Advance notice days', { advanceNoticeDays });
        
        // Check if today matches the workspace's schedule generation interval
        let shouldGenerateSchedule = false;
        
        if (interval === 'weekly') {
          const dayOfWeekSetting = workspace.scheduleDayOfWeek ?? 0; // Default Sunday
          shouldGenerateSchedule = dayOfWeek === dayOfWeekSetting;
          log.debug('Day of week check', { setting: dayOfWeekSetting, today: dayOfWeek });
        } else if (interval === 'biweekly') {
          const dayOfWeekSetting = workspace.scheduleDayOfWeek ?? 0; // Default Sunday
          
          // Seed anchor if not set (transactional)
          if (!workspace.scheduleBiweeklyAnchor) {
            log.info('Seeding biweekly anchor for first run');
            const anchor = seedAnchor(dayOfWeekSetting, today);
            await db.transaction(async (tx) => {
              await tx.update(workspaces)
                .set({ scheduleBiweeklyAnchor: anchor })
                .where(eq(workspaces.id, workspace.id));
            });
            workspace.scheduleBiweeklyAnchor = anchor;
          }
          
          // Check anchor drift
          detectAnchorDrift(workspace.scheduleBiweeklyAnchor, today);
          
          // Use anchor-based calculation
          shouldGenerateSchedule = shouldRunBiweekly(workspace.scheduleBiweeklyAnchor, dayOfWeekSetting, today);
        } else if (interval === 'monthly') {
          const dayOfMonthSetting = workspace.scheduleDayOfMonth ?? 25; // Default 25th
          shouldGenerateSchedule = dayOfMonth === dayOfMonthSetting;
          log.debug('Day of month check', { setting: dayOfMonthSetting, today: dayOfMonth });
        } else if (interval === 'custom' && workspace.scheduleCustomDays) {
          // PHASE 4B: Custom interval tracking using database table
          const customIntervals = await db
            .select()
            .from(customSchedulerIntervals)
            .where(eq(customSchedulerIntervals.workspaceId, workspace.id));
          
          if (customIntervals.length > 0) {
            const intervalRecord = customIntervals[0];
            if (intervalRecord.lastRunAt) {
              const daysSinceLastRun = Math.floor((today.getTime() - new Date(intervalRecord.lastRunAt).getTime()) / (1000 * 60 * 60 * 24));
              shouldGenerateSchedule = daysSinceLastRun >= workspace.scheduleCustomDays;
              log.debug('Custom schedule interval check', { daysSinceLastRun, threshold: workspace.scheduleCustomDays });
            } else {
              shouldGenerateSchedule = true; // First run
              log.debug('Custom interval first run');
            }
          }
        }
        
        if (shouldGenerateSchedule) {
          log.info('Schedule interval matched, checking idempotency');
          
          // Wrap automation in audit logging lifecycle
          const runId = `operationsos-${workspace.id}-${Date.now()}`;
          
          await logAutomationLifecycle(
            {
              jobType: 'scheduling',
              workspaceId: workspace.id,
              workspaceName: workspace.name,
              runId,
            },
            async () => {
              // IDEMPOTENCY: Check if this operation already ran today (14-day TTL)
              const idem = await executeIdempotencyCheck({
                workspaceId: workspace.id,
                operationType: 'schedule_generation',
                requestData: buildScheduleFingerprintData(workspace, today, nextWeekStart, nextWeekEnd),
                ttlDays: 14,
              });
              
              if (!idem.isNew) {
                log.warn('Duplicate schedule generation detected', { idempotencyKeyId: idem.idempotencyKeyId });
                log.warn('Skipping execution due to existing status', { status: idem.status });
                return { 
                  shiftsGenerated: 0, 
                  isDuplicate: true,
                  idempotencyKeyId: idem.idempotencyKeyId,
                };
              }
              
              log.info('New operation confirmed, checking governance', { idempotencyKeyId: idem.idempotencyKeyId });
              
              // GOVERNANCE GATE: 99% automation / 1% human approval
              const governanceResult = await applyGovernanceGate('scheduling', workspace.id, {
                type: 'weekly_schedule_generation',
                affectedRecords: 0,
                estimatedImpact: `Generate schedules for ${workspace.name}`,
              });

              if (!governanceResult.proceed) {
                log.info('Governance paused automation', { reason: governanceResult.reason });
                await updateIdempotencyResult({
                  idempotencyKeyId: idem.idempotencyKeyId,
                  status: 'pending_approval',
                  resultMetadata: {
                    governanceApprovalId: governanceResult.approvalId,
                    pausedReason: governanceResult.reason,
                  },
                });
                return {
                  shiftsGenerated: 0,
                  isPendingApproval: true,
                  approvalId: governanceResult.approvalId,
                  idempotencyKeyId: idem.idempotencyKeyId,
                };
              }

              log.info('Governance approved, generating schedules');
              
              try {
                // AUTONOMOUS SCHEDULING: Use AI Brain to generate optimal schedules
                let shiftsGenerated = 0;
                
                try {
                  // Fetch employees for workspace
                  const workspaceEmployees = await db
                    .select()
                    .from(employees)
                    .where(eq(employees.workspaceId, workspace.id));
                  
                  if (workspaceEmployees.length === 0) {
                    log.info('No employees found, skipping schedule generation', { workspaceName: workspace.name });
                  } else {
                    log.info('Calling AI Brain for schedule generation', { employeeCount: workspaceEmployees.length });
                    
                    // Get workspace owner for credit tracking
                    const owner = workspaceEmployees.find(e => e.workspaceRole === 'org_owner');
                    const ownerUserId = owner?.userId || undefined;
                    
                    // Fetch shifts in outer scope so they're accessible after withTokens returns
                    const existingShifts = await db.select().from(shifts)
                      .where(and(
                        eq(shifts.workspaceId, workspace.id),
                        gte(shifts.startTime, nextWeekStart),
                        lte(shifts.startTime, nextWeekEnd),
                      ));

                    // Call AI Brain WITH TOKEN USAGE TRACKING
                    const creditResult = await withTokens(
                      {
                        workspaceId: workspace.id,
                        featureKey: 'ai_scheduling',
                        description: `Autonomous AI schedule generation (${format(nextWeekStart, 'MMM dd')} - ${format(nextWeekEnd, 'MMM dd')})`,
                        userId: ownerUserId,
                      },
                      async () => {
                        const { employeeAvailability, employeeSkills } = await import('@shared/schema');
                        const allAvailability = await db.select().from(employeeAvailability)
                          .where(eq(employeeAvailability.workspaceId, workspace.id));
                        const allSkills = await db.select().from(employeeSkills)
                          .where(eq(employeeSkills.workspaceId, workspace.id));

                        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                        const availMap = new Map<string, Array<{ day: string; start: string; end: string }>>();
                        for (const a of allAvailability) {
                          const arr = availMap.get(a.employeeId) || [];
                          arr.push({ day: dayNames[a.dayOfWeek] || String(a.dayOfWeek), start: a.startTime || '00:00', end: a.endTime || '23:59' });
                          availMap.set(a.employeeId, arr);
                        }

                        const skillMap = new Map<string, string[]>();
                        for (const s of allSkills) {
                          const arr = skillMap.get(s.employeeId) || [];
                          arr.push(s.skillName);
                          skillMap.set(s.employeeId, arr);
                        }

                        const aiBrain = new AIBrainService();
                        return await aiBrain.enqueueJob({
                          workspaceId: workspace.id,
                          skill: 'scheduleos_generation',
                          input: {
                            shifts: existingShifts.map(s => ({
                              id: s.id,
                              clientId: s.clientId,
                              siteId: s.siteId,
                              startTime: s.startTime,
                              endTime: s.endTime,
                              assignedEmployeeIds: (s as any).assignedEmployeeIds || [],
                              position: (s as any).position,
                            })),
                            employees: workspaceEmployees.map(e => ({
                              id: e.id,
                              name: `${e.firstName} ${e.lastName}`,
                              position: e.position || null,
                              availability: availMap.get(e.id) || [],
                              skills: skillMap.get(e.id) || [],
                              // Armed officer attributes for scheduling eligibility
                              isArmed: (e as any).isArmed ?? false,
                              armedLicenseVerified: (e as any).armedLicenseVerified ?? false,
                              guardCardExpiryDate: (e as any).guardCardExpiryDate ?? null,
                            })),
                            constraints: {
                              weekStart: nextWeekStart.toISOString(),
                              weekEnd: nextWeekEnd.toISOString(),
                            },
                          },
                        });
                      }
                    );
                    
                    // Handle insufficient credits
                    if (!creditResult.success) {
                      // @ts-expect-error — TS migration: fix in refactoring sprint
                      if (creditResult.insufficientCredits) {
                        log.warn('Insufficient credits for autonomous schedule generation', { creditsRequired: 25 });
                        log.info('Purchase more credits to resume AI automations');
                      } else {
                        log.error('Credit deduction failed', { error: creditResult.error });
                      }
                    } else {
                      const result = creditResult.result!;
                      
                      // AI Brain processes job immediately and returns result
                      if (result.status === 'completed') {
                        // Armed shift validation: strip any AI-generated assignment where
                        // an armed shift was assigned to an unarmed or unverified officer.
                        const now = new Date();
                        const empMap = new Map(workspaceEmployees.map(e => [e.id, e]));
                        if (result.output?.assignments) {
                          result.output.assignments = result.output.assignments.filter((a: any) => {
                            const shift = existingShifts.find(s => s.id === a.shiftId);
                            const isArmedShift = shift && (
                              String((shift as any).position || '').toLowerCase().includes('armed') ||
                              String((shift as any).position || '') === 'armed_guard'
                            );
                            if (!isArmedShift) return true; // unarmed shifts — always valid
                            const officer = empMap.get(a.employeeId);
                            if (!officer) return false;
                            const isArmedOfficer = (officer as any).isArmed && (officer as any).armedLicenseVerified;
                            const guardCardExpiry = (officer as any).guardCardExpiryDate;
                            const licenseExpired = guardCardExpiry && new Date(guardCardExpiry) < now;
                            if (!isArmedOfficer || licenseExpired) {
                              log.warn(`[Scheduler] Armed shift ${a.shiftId} — officer ${a.employeeId} ineligible: armed=${(officer as any).isArmed}, verified=${(officer as any).armedLicenseVerified}, expired=${licenseExpired}`);
                              return false;
                            }
                            return true;
                          });
                        }
                        shiftsGenerated = result.output?.assignments?.length || 0;
                        log.info('AI Brain generated shift assignments', { shiftsGenerated, creditsDeducted: creditResult.tokensUsed });
                      } else if (result.status === 'failed') {
                        log.error('AI Brain job failed', { error: result.error });
                      }
                    }
                  }
                } catch (aiError: any) {
                  log.error('AI Brain error', { error: aiError.message });
                  // Continue to mark operation as completed even if AI fails
                }
                
                // Update lastRunAt, advance anchor, and mark idempotency complete (ATOMIC)
                await db.transaction(async (tx) => {
                  const updateData: any = { lastScheduleRunAt: today };
                  
                  // Advance biweekly anchor if applicable
                  if (interval === 'biweekly' && workspace.scheduleBiweeklyAnchor) {
                    const newAnchor = advanceAnchor(workspace.scheduleBiweeklyAnchor);
                    updateData.scheduleBiweeklyAnchor = newAnchor;
                  }
                  
                  await tx.update(workspaces)
                    .set(updateData)
                    .where(eq(workspaces.id, workspace.id));
                  
                  // Mark idempotency operation complete (with transaction)
                  await updateIdempotencyResult({
                    idempotencyKeyId: idem.idempotencyKeyId,
                    status: 'completed',
                    resultId: undefined, // No specific result ID for schedule generation yet
                    resultMetadata: {
                      shiftsGenerated,
                      periodStart: nextWeekStart.toISOString().split('T')[0],
                      periodEnd: nextWeekEnd.toISOString().split('T')[0],
                      interval,
                    },
                  }, tx);
                });
                
                if (shiftsGenerated > 0) {
                  log.info('Shifts generated', { count: shiftsGenerated, workspaceName: workspace.name });
                  successCount++;
                  
                  // NOTIFY ORG LEADERS: Schedule generation complete
                  try {
                    const orgLeaders = await db.select()
                      .from(employees)
                      .where(
                        and(
                          eq(employees.workspaceId, workspace.id),
                          sql`(${employees.workspaceRole} IN ('org_owner', 'co_owner', 'department_manager'))`
                        )
                      );
                    
                    for (const leader of orgLeaders) {
                      if (leader.userId) {
                        await createNotification({
                          workspaceId: workspace.id,
                          userId: leader.userId,
                          type: 'system',
                          title: 'Schedule Generated Automatically',
                          message: `AI Brain generated ${shiftsGenerated} shift assignment(s) for ${format(nextWeekStart, 'MMM d')} - ${format(nextWeekEnd, 'MMM d')}. Review the schedule to ensure accuracy.`,
                          actionUrl: '/schedule',
                          relatedEntityType: 'workspace',
                          relatedEntityId: workspace.id,
                          metadata: { 
                            shiftsGenerated,
                            weekStart: nextWeekStart.toISOString(),
                            weekEnd: nextWeekEnd.toISOString(),
                            automationRun: runId,
                          },
                          createdBy: 'system-coaileague',
                          idempotencyKey: `system-${workspace.id}-${leader.userId}`
                        });
                      }
                    }
                    log.info('Notified leaders about schedule generation', { count: orgLeaders.length });
                  } catch (notifError) {
                    log.warn('Failed to send notifications', { error: notifError instanceof Error ? notifError.message : String(notifError) });
                  }
                } else {
                  log.info('No shifts generated - templates not configured');
                }
                
                return { shiftsGenerated };
                
              } catch (error) {
                // Mark idempotency operation failed (no transaction on error path)
                await updateIdempotencyResult({
                  idempotencyKeyId: idem.idempotencyKeyId,
                  status: 'failed',
                  errorMessage: error instanceof Error ? error.message : String(error),
                  errorStack: error instanceof Error ? error.stack : undefined,
                });
                throw error; // Re-throw to trigger audit log error handling
              }
            }
          );
          
          // Example of how it would work:
          /*
          const scheduleOSAI = new SchedulingAI();
          const result = await scheduleOSAI.generateSchedule({
            workspaceId: workspace.id,
            weekStartDate: nextWeekStart,
            shiftRequirements: workspace.shiftTemplates // Would come from settings
          });
          
          if (result.success) {
            log.info(`✅ Generated ${result.shiftsGenerated} shifts for ${workspace.name}`);
            successCount++;
          }
          */
        } else {
          log.debug('Not a schedule generation date, skipping');
        }
        
      } catch (error) {
        log.error('Failed to generate schedule', { workspaceName: workspace.name, error: error instanceof Error ? error.message : String(error) });
        errorCount++;
      }
    }

    log.info('Autonomous scheduling summary', { totalWorkspaces: activeWorkspaces.length, successful: successCount, errors: errorCount });

  } catch (error) {
    log.error('Critical error in weekly schedule generation', { error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Automatic Payroll Processing
 * Runs on configured pay period dates
 */
async function runAutomaticPayrollProcessing() {
  log.info('Autonomous payroll processing started', { timestamp: new Date().toISOString() });

  try {
    // Get all active workspaces with auto-payroll enabled (exclude cancelled subscriptions)
    const activeWorkspaces = await db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.isSuspended, false),
          eq(workspaces.isFrozen, false),
          eq(workspaces.isLocked, false),
          eq(workspaces.autoPayrollEnabled, true),
          ne(workspaces.subscriptionStatus, 'cancelled')
        )
      );

    log.info('Found workspaces with auto-payroll', { count: activeWorkspaces.length });

    const today = new Date();
    const dayOfMonth = today.getDate();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday

    let totalPayrollRuns = 0;
    let successCount = 0;
    let errorCount = 0;

    for (const workspace of activeWorkspaces) {
      try {
        // Get payroll schedule from workspace settings
        const paySchedule = workspace.payrollSchedule || 'biweekly';
        const cutoffDay = workspace.payrollCutoffDay ?? 15;
        let shouldProcessPayroll = false;

        log.debug('Checking workspace', { workspaceName: workspace.name, workspaceId: workspace.id });
        log.debug('Payroll schedule', { paySchedule });

        // Check if today is a pay period date based on schedule
        if (paySchedule === 'weekly') {
          const dayOfWeekSetting = workspace.payrollDayOfWeek ?? 1; // Default Monday
          shouldProcessPayroll = dayOfWeek === dayOfWeekSetting;
          log.debug('Day of week check', { setting: dayOfWeekSetting, today: dayOfWeek });
        } else if (paySchedule === 'biweekly') {
          const dayOfWeekSetting = workspace.payrollDayOfWeek ?? 1; // Default Monday
          
          // Seed anchor if not set (transactional)
          if (!workspace.payrollBiweeklyAnchor) {
            log.info('Seeding biweekly anchor for first run');
            const anchor = seedAnchor(dayOfWeekSetting, today);
            await db.transaction(async (tx) => {
              await tx.update(workspaces)
                .set({ payrollBiweeklyAnchor: anchor })
                .where(eq(workspaces.id, workspace.id));
            });
            workspace.payrollBiweeklyAnchor = anchor;
          }
          
          // Check anchor drift
          detectAnchorDrift(workspace.payrollBiweeklyAnchor, today);
          
          // Use anchor-based calculation
          shouldProcessPayroll = shouldRunBiweekly(workspace.payrollBiweeklyAnchor, dayOfWeekSetting, today);
        } else if (paySchedule === 'semi-monthly') {
          const processDay = workspace.payrollDayOfMonth ?? 1;
          shouldProcessPayroll = dayOfMonth === processDay || dayOfMonth === cutoffDay;
          log.debug('Semi-monthly pay dates check', { processDay, cutoffDay, today: dayOfMonth });
        } else if (paySchedule === 'monthly') {
          const dayOfMonthSetting = workspace.payrollDayOfMonth ?? 1;
          shouldProcessPayroll = dayOfMonth === dayOfMonthSetting;
          log.debug('Day of month check', { setting: dayOfMonthSetting, today: dayOfMonth });
        } else if (paySchedule === 'custom' && workspace.payrollCustomDays) {
          // PHASE 4B: Custom interval tracking using database table
          const customIntervals = await db
            .select()
            .from(customSchedulerIntervals)
            .where(eq(customSchedulerIntervals.workspaceId, workspace.id));
          
          if (customIntervals.length > 0) {
            const intervalRecord = customIntervals[0];
            if (intervalRecord.lastRunAt) {
              const daysSinceLastRun = Math.floor((today.getTime() - new Date(intervalRecord.lastRunAt).getTime()) / (1000 * 60 * 60 * 24));
              shouldProcessPayroll = daysSinceLastRun >= workspace.payrollCustomDays;
              log.debug('Custom payroll interval check', { daysSinceLastRun, threshold: workspace.payrollCustomDays });
            } else {
              shouldProcessPayroll = true; // First run
              log.debug('Custom interval first run');
            }
          }
        }

        if (shouldProcessPayroll) {
          log.info('Pay period date matched, processing payroll');
          
          // Wrap automation in audit logging lifecycle
          const runId = `payrollos-${workspace.id}-${Date.now()}`;
          
          await logAutomationLifecycle(
            {
              jobType: 'payroll',
              workspaceId: workspace.id,
              workspaceName: workspace.name,
              runId,
            },
            async () => {
              // Idempotency check (45-day TTL for payroll)
              const idem = await executeIdempotencyCheck({
                workspaceId: workspace.id,
                operationType: 'payroll_run',
                requestData: buildPayrollFingerprintData(workspace, today),
                ttlDays: 45, // Longer TTL for critical payroll operations
              });
              
              if (!idem.isNew) {
                log.warn('Duplicate payroll processing detected', { idempotencyKeyId: idem.idempotencyKeyId });
                log.warn('Skipping execution due to existing status', { status: idem.status });
                return { 
                  employeesProcessed: 0,
                  grossPay: 0,
                  netPay: 0,
                  isDuplicate: true,
                  idempotencyKeyId: idem.idempotencyKeyId,
                };
              }
              
              log.info('New operation confirmed, checking governance', { idempotencyKeyId: idem.idempotencyKeyId });
              
              // GOVERNANCE GATE: 99% automation / 1% human approval
              const governanceResult = await applyGovernanceGate('payroll', workspace.id, {
                type: 'automatic_payroll_processing',
                affectedRecords: 0,
                estimatedImpact: `Process payroll for ${workspace.name}`,
              });

              if (!governanceResult.proceed) {
                log.info('Governance paused automation', { reason: governanceResult.reason });
                await updateIdempotencyResult({
                  idempotencyKeyId: idem.idempotencyKeyId,
                  status: 'pending_approval',
                  resultMetadata: {
                    governanceApprovalId: governanceResult.approvalId,
                    pausedReason: governanceResult.reason,
                  },
                });
                return {
                  employeesProcessed: 0,
                  grossPay: 0,
                  netPay: 0,
                  isPendingApproval: true,
                  approvalId: governanceResult.approvalId,
                  idempotencyKeyId: idem.idempotencyKeyId,
                };
              }

              log.info('Governance approved, processing payroll');
              
              try {
                // Get workspace owner to attribute payroll run
                const [owner] = await db
                  .select()
                  .from(employees)
                  .where(
                    and(
                      eq(employees.workspaceId, workspace.id),
                      eq(employees.workspaceRole, 'org_owner')
                    )
                  )
                  .limit(1);

                if (owner && owner.userId) {
                  const { orchestratedPayroll } = await import('./orchestration/orchestratedBusinessOps');
                  const orchResult = await orchestratedPayroll.processPayroll(
                    workspace.id,
                    owner.userId
                  );
                  if (!orchResult.success) {
                    throw new Error(orchResult.error || 'Orchestrated payroll failed');
                  }
                  const result = orchResult.data!;

                  // Notify all employees that payroll was processed
                  try {
                    const { createNotification } = await import('./notificationService');
                    const workspaceEmployees = await db.query.users.findMany({
                      where: eq(users.currentWorkspaceId, workspace.id),
                    });

                    for (const emp of workspaceEmployees) {
                      await createNotification({
                        workspaceId: workspace.id,
                        userId: emp.id,
                        type: 'payroll_processed' as any,
                        title: '💰 Payroll Processed',
                        message: `Your payroll has been processed. Check your account for payment details.`,
                        actionUrl: `/my-paychecks`,
                        relatedEntityType: 'payroll_run',
                        relatedEntityId: result.payrollRunId,
                        createdBy: owner.userId,
                        idempotencyKey: `payroll_processed-${result.payrollRunId}-${emp.id}`
                      });
                    }
                  } catch (notifyError) {
                    log.error('Error sending payroll notification', { error: notifyError instanceof Error ? notifyError.message : String(notifyError) });
                  }

                  log.info('Payroll processed', { workspaceName: workspace.name, employees: result.totalEmployees, grossPay: result.totalGrossPay.toFixed(2), netPay: result.totalNetPay.toFixed(2) });
                  
                  // AUTONOMOUS PAYROLL: Always route through approval gate — never bypass to Gusto directly.
                  // The approval gate system (automationTriggerService → approvalGateEnforcement) handles
                  // risk scoring and auto-approval for low-risk runs. Once a gate is approved, the
                  // executeApprovedPayroll path processes the run. Direct Gusto submission is forbidden
                  // outside of the gate flow to prevent unaudited disbursements.
                  if (result.payrollRunId) {
                    log.info('Payroll run created — routed to approval gate (never bypasses to Gusto directly)', { payrollRunId: result.payrollRunId });
                  }
                  
                  // AUTONOMOUS PAYROLL: Sync payroll to QuickBooks (if connected)
                  if (result.payrollRunId) {
                    try {
                      const qbPayrollResult = await syncPayrollToQuickBooks(String(result.payrollRunId));
                      if (qbPayrollResult.success) {
                        log.info('Payroll synced to QuickBooks', { qbInvoiceId: qbPayrollResult.qbInvoiceId });
                      } else if (qbPayrollResult.error !== 'QuickBooks not connected') {
                        log.warn('QuickBooks payroll sync failed', { error: qbPayrollResult.error });
                      }
                    } catch (qbError: any) {
                      log.warn('QuickBooks payroll sync error', { error: qbError.message });
                    }
                  }

                  totalPayrollRuns++;
                  successCount++;
                  
                  // Update lastRunAt, advance anchor, and mark idempotency complete (ATOMIC)
                  await db.transaction(async (tx) => {
                    const updateData: any = { lastPayrollRunAt: today };
                    
                    // Advance biweekly anchor if applicable
                    if (paySchedule === 'biweekly' && workspace.payrollBiweeklyAnchor) {
                      const newAnchor = advanceAnchor(workspace.payrollBiweeklyAnchor);
                      updateData.payrollBiweeklyAnchor = newAnchor;
                    }
                    
                    await tx.update(workspaces)
                      .set(updateData)
                      .where(eq(workspaces.id, workspace.id));
                    
                    // Mark idempotency complete in SAME transaction
                    await updateIdempotencyResult({
                      idempotencyKeyId: idem.idempotencyKeyId,
                      status: 'completed',
                      resultId: result.payrollRunId ? String(result.payrollRunId) : undefined,
                      resultMetadata: {
                        employeesProcessed: result.totalEmployees,
                        grossPay: result.totalGrossPay,
                        netPay: result.totalNetPay,
                        isDuplicate: false,
                        workspaceName: workspace.name,
                        schedule: paySchedule,
                        periodStart: buildPayrollFingerprintData(workspace, today).periodStart,
                        periodEnd: buildPayrollFingerprintData(workspace, today).periodEnd,
                      },
                    }, tx); // Pass transaction client for atomic update
                  });
                  
                  return {
                    employeesProcessed: result.totalEmployees,
                    grossPay: result.totalGrossPay,
                    netPay: result.totalNetPay,
                    isDuplicate: false,
                    idempotencyKeyId: idem.idempotencyKeyId,
                  };
                } else {
                  log.warn('No owner found, skipping payroll', { workspaceName: workspace.name });
                  
                  // Still mark idempotency as complete (zero result is valid)
                  await updateIdempotencyResult({
                    idempotencyKeyId: idem.idempotencyKeyId,
                    status: 'completed',
                    resultMetadata: {
                      employeesProcessed: 0,
                      grossPay: 0,
                      netPay: 0,
                      isDuplicate: false,
                      workspaceName: workspace.name,
                      schedule: paySchedule,
                      reason: 'no_owner',
                    },
                  });
                  
                  return { employeesProcessed: 0, grossPay: 0, netPay: 0 };
                }
              } catch (error: any) {
                // Mark idempotency operation failed with full error context
                await updateIdempotencyResult({
                  idempotencyKeyId: idem.idempotencyKeyId,
                  status: 'failed',
                  errorMessage: (error instanceof Error ? error.message : String(error)),
                  errorStack: error.stack,
                  resultMetadata: {
                    isDuplicate: false,
                    workspaceName: workspace.name,
                    schedule: paySchedule,
                  },
                });
                throw error; // Re-throw to trigger audit log error
              }
            }
          );
        } else {
          log.debug('Not a pay period date, skipping');
        }

      } catch (error) {
        log.error('Failed to process payroll', { workspaceName: workspace.name, error: error instanceof Error ? error.message : String(error) });
        errorCount++;
      }
    }

    log.info('Autonomous payroll summary', { totalWorkspaces: activeWorkspaces.length, payrollRuns: totalPayrollRuns, successful: successCount, errors: errorCount });

  } catch (error) {
    log.error('Critical error in automatic payroll processing', { error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Daily Idempotency Key Cleanup
 * Removes expired keys based on TTL to prevent database bloat
 * Runs at 4 AM after all automation jobs complete
 */
async function runIdempotencyKeyCleanup() {
  log.info('Idempotency key cleanup started', { timestamp: new Date().toISOString() });
  
  try {
    const runId = `cleanup-${Date.now()}`;
    
    await logAutomationLifecycle(
      {
        jobType: 'idempotency_cleanup',
        workspaceId: SYSTEM_WORKSPACE_ID,
        workspaceName: 'System-wide Cleanup',
        runId,
      },
      async () => {
        // Calculate expiration threshold
        // Use 60 days as max retention (beyond longest TTL of 45 days for payroll)
        const maxRetentionDays = 60;
        const expirationThreshold = new Date();
        expirationThreshold.setDate(expirationThreshold.getDate() - maxRetentionDays);
        
        log.info('Removing expired idempotency keys', { maxRetentionDays });
        log.debug('Expiration threshold', { threshold: expirationThreshold.toISOString() });
        
        // Delete expired keys
        const deletedKeys = await db
          .delete(idempotencyKeys)
          .where(sql`${idempotencyKeys.createdAt} < ${expirationThreshold}`)
          .returning({ id: idempotencyKeys.id });
        
        const deletedCount = deletedKeys.length;
        
        if (deletedCount > 0) {
          log.info('Cleaned up expired idempotency keys', { deletedCount });
        } else {
          log.debug('No expired idempotency keys found');
        }
        
        return { 
          keysDeleted: deletedCount,
          retentionDays: maxRetentionDays,
          expirationThreshold: expirationThreshold.toISOString(),
        };
      }
    );
    
  } catch (error) {
    log.error('Critical error in idempotency key cleanup', { error: error instanceof Error ? error.message : String(error) });
  }
  
  }

/**
 * Room Auto-Close Automation
 * Runs every 5 minutes to close expired shift rooms
 */
async function runRoomAutoClose() {
  log.info('Chat workroom auto-close started', { timestamp: new Date().toISOString() });

  try {
    const now = new Date();
    
    // Truncate to 5-minute window for idempotency
    const windowStart = new Date(now);
    windowStart.setMinutes(Math.floor(now.getMinutes() / 5) * 5, 0, 0);
    const windowEnd = new Date(windowStart);
    windowEnd.setMinutes(windowStart.getMinutes() + 5);
    
    // Find all expired rooms that are still active
    const expiredRooms = await db
      .select({
        id: chatConversations.id,
        workspaceId: chatConversations.workspaceId,
        subject: chatConversations.subject,
        conversationType: chatConversations.conversationType,
        autoCloseAt: chatConversations.autoCloseAt,
        status: chatConversations.status,
      })
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.status, 'active'),
          lt(chatConversations.autoCloseAt, now),
          sql`${chatConversations.autoCloseAt} IS NOT NULL`
        )
      )
      .orderBy(chatConversations.workspaceId);

    log.info('Found expired rooms to auto-close', { count: expiredRooms.length });

    if (expiredRooms.length === 0) {
      log.debug('No expired rooms found');
      return;
    }

    // Build idempotency fingerprint
    const roomCountHash = crypto
      .createHash('sha256')
      .update(expiredRooms.map(r => r.id).join(','))
      .digest('hex')
      .substring(0, 16);

    const fingerprintData = {
      jobType: 'room_auto_close',
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      roomCount: expiredRooms.length,
      roomCountHash,
    };

    const runId = `room-auto-close-${windowStart.toISOString().replace(/[:.]/g, '-')}`;
    const idempotencyKey = `automation:room_auto_close:${crypto
      .createHash('sha256')
      .update(JSON.stringify(fingerprintData))
      .digest('hex')}`;

    // Check idempotency
    const idempotencyResult = await executeIdempotencyCheck({
      workspaceId: 'system', // System-wide job
      operationType: 'room_auto_close',
      requestData: fingerprintData,
      ttlDays: 7 // TTL: 7 days (short retention for frequent job)
    });

    if (!idempotencyResult.isNew) {
      log.debug('Skipping room auto-close - already processed this batch');
      return;
    }

    // Group rooms by workspace for batch processing
    const roomsByWorkspace = new Map<string, typeof expiredRooms>();
    for (const room of expiredRooms) {
      if (!roomsByWorkspace.has(room.workspaceId)) {
        roomsByWorkspace.set(room.workspaceId, []);
      }
      roomsByWorkspace.get(room.workspaceId)!.push(room);
    }

    let totalRoomsClosed = 0;
    let successWorkspaces = 0;
    let errorWorkspaces = 0;

    // Process each workspace
    for (const [workspaceId, rooms] of Array.from(roomsByWorkspace.entries())) {
      try {
        // Get workspace name for audit logging
        const [workspace] = await db
          .select({ name: workspaces.name })
          .from(workspaces)
          .where(eq(workspaces.id, workspaceId))
          .limit(1);

        const workspaceName = workspace?.name || 'Unknown Workspace';
        
        log.debug('Processing workspace for room auto-close', { workspaceName, workspaceId });
        log.debug('Rooms to close', { count: rooms.length });

        // Use transaction for atomic updates
        await db.transaction(async (tx) => {
          for (const room of rooms) {
            // Update room status
            await tx
              .update(chatConversations)
              .set({ 
                status: 'closed',
                updatedAt: now,
              })
              .where(eq(chatConversations.id, room.id));

            // Create room event
            await tx.insert(roomEvents).values({
              workspaceId: room.workspaceId,
              conversationId: room.id,
              actorId: null, // System automation
              actorName: COAILEAGUE_AUTOMATION_USER.userName,
              actorRole: COAILEAGUE_AUTOMATION_USER.userRole,
              eventType: 'room_closed',
              description: `Room auto-closed at ${now.toISOString()} (scheduled: ${room.autoCloseAt})`,
              eventPayload: {
                previousStatus: room.status,
                autoCloseAt: room.autoCloseAt,
                conversationType: room.conversationType,
                automationRunId: runId,
              },
              ipAddress: 'system-scheduler',
            });

            log.info('Room auto-closed', { roomId: room.id, subject: room.subject });
            totalRoomsClosed++;
          }
        });

        // Log to AuditOS for workspace
        await logAutomationLifecycle(
          {
            jobType: 'room_auto_close',
            workspaceId,
            workspaceName,
            runId,
          },
          async () => ({
            roomsClosed: rooms.length,
            roomIds: rooms.map((r: any) => r.id),
          })
        );

        successWorkspaces++;
      } catch (error: any) {
        log.error('Error processing workspace for room auto-close', { workspaceId, error: (error instanceof Error ? error.message : String(error)) });
        errorWorkspaces++;
      }
    }

    // Mark idempotency key as completed
    await updateIdempotencyResult({
      idempotencyKeyId: idempotencyResult.idempotencyKeyId,
      status: 'completed',
      resultMetadata: {
        totalRoomsClosed,
        successWorkspaces,
        errorWorkspaces,
        timestamp: now.toISOString(),
      },
    });

    log.info('Room auto-close complete', { totalRoomsClosed });
    log.info('Room auto-close workspaces summary', { successWorkspaces, errorWorkspaces });

  } catch (error) {
    log.error('Critical error in room auto-close', { error: error instanceof Error ? error.message : String(error) });
  }

  }

// ============================================================================
// PAYMENT REMINDER AUTOMATION
// ============================================================================

type ReminderTier = {
  type: 'upcoming_due' | 'due_today' | 'overdue_3d' | 'overdue_7d' | 'overdue_14d' | 'overdue_30d' | 'final_notice';
  daysOverdue: number;
  label: string;
};

const REMINDER_TIERS: ReminderTier[] = [
  { type: 'overdue_3d', daysOverdue: 3, label: '3 days overdue' },
  { type: 'overdue_7d', daysOverdue: 7, label: '7 days overdue' },
  { type: 'overdue_14d', daysOverdue: 14, label: '14 days overdue' },
  { type: 'overdue_30d', daysOverdue: 30, label: '30 days overdue' },
  { type: 'final_notice', daysOverdue: 45, label: 'Final notice (45+ days overdue)' },
];

async function runLateFeeApplication() {
  log.info('Late fee application started', { timestamp: new Date().toISOString() });
  let totalApplied = 0;
  let workspacesProcessed = 0;

  try {
    const { invoiceService } = await import('./billing/invoice');
    const { workspaces: wsTable } = await import('@shared/schema');
    const { gt, and: andOp, isNotNull, sql: drizzleSql } = await import('drizzle-orm');

    const activeWs = await db
      .select({ id: wsTable.id, lateFeePercentage: (wsTable as any).lateFeePercentage, lateFeeDays: (wsTable as any).lateFeeDays })
      .from(wsTable)
      .where(
        andOp(
          (wsTable as any).lateFeePercentage ? gt((wsTable as any).lateFeePercentage, 0) : drizzleSql`1=1`,
          drizzleSql`(${wsTable as any}.subscription_status IS NULL OR ${wsTable as any}.subscription_status != 'suspended')`
        )
      );

    for (const ws of activeWs) {
      try {
        const lateFeePercentage = parseFloat(String((ws as any).lateFeePercentage || 0));
        if (lateFeePercentage <= 0) continue;

        const lateFeeDays = parseInt(String((ws as any).lateFeeDays || 30), 10);
        const results = await invoiceService.applyLateFees(ws.id, {
          gracePeriodDays: lateFeeDays,
          lateFeeType: 'percentage',
          lateFeeAmount: lateFeePercentage,
        });

        if (results.length > 0) {
          log.info('Late fees applied', { workspaceId: ws.id, count: results.length, rate: lateFeePercentage });
          totalApplied += results.length;
        }
        workspacesProcessed++;
      } catch (wsErr: any) {
        log.warn('Late fee application failed for workspace', { workspaceId: ws.id, error: wsErr.message });
      }
    }

    log.info('Late fee application complete', { workspacesProcessed, invoicesAffected: totalApplied });
    return { workspacesProcessed, invoicesAffected: totalApplied };
  } catch (err: any) {
    log.error('Late fee application failed', { error: (err instanceof Error ? err.message : String(err)) });
    throw err;
  }
}

async function runPaymentReminderCheck() {
  log.info('Payment reminder check started', { timestamp: new Date().toISOString() });

  try {
    const now = new Date();
    const activeWorkspaces = await db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.isSuspended, false),
          eq(workspaces.isFrozen, false),
          eq(workspaces.isLocked, false)
        )
      );

    log.info('Checking workspaces for overdue invoices', { count: activeWorkspaces.length });

    let totalReminders = 0;
    let totalNotifications = 0;

    for (const workspace of activeWorkspaces) {
      try {
        const overdueInvoices = await db
          .select()
          .from(invoices)
          .where(
            and(
              eq(invoices.workspaceId, workspace.id),
              eq(invoices.status, 'sent'),
              isNotNull(invoices.dueDate),
              lte(invoices.dueDate, now)
            )
          );

        if (overdueInvoices.length === 0) continue;

        for (const invoice of overdueInvoices) {
          try {
            const dueDate = new Date(invoice.dueDate!);
            const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

            let applicableTier: ReminderTier | null = null;
            for (let i = REMINDER_TIERS.length - 1; i >= 0; i--) {
              if (daysOverdue >= REMINDER_TIERS[i].daysOverdue) {
                applicableTier = REMINDER_TIERS[i];
                break;
              }
            }

            if (!applicableTier) continue;

            const existingReminders = await db
              .select()
              .from(paymentReminders)
              .where(
                and(
                  eq(paymentReminders.invoiceId, invoice.id),
                  eq(paymentReminders.reminderType, applicableTier.type)
                )
              );

            if (existingReminders.length > 0) {
              const lastReminder = existingReminders[existingReminders.length - 1];
              const meta = (lastReminder as any).metadata;
              const emailFailed = meta && meta.emailSent === false && meta.emailError;
              if (!emailFailed) continue;
              await db.delete(paymentReminders).where(eq(paymentReminders.id, lastReminder.id));
              log.info('Retrying payment reminder after previous email failure', { invoiceId: invoice.id, previousError: meta.emailError });
            }

            const client = await db
              .select()
              .from(clients)
              .where(eq(clients.id, invoice.clientId))
              .limit(1);

            const clientRecord = client[0];
            if (!clientRecord) continue;

            const recipientEmail = clientRecord.billingEmail || clientRecord.email || '';

            const clientName = `${clientRecord.firstName || ''} ${clientRecord.lastName || ''}`.trim() || clientRecord.companyName || 'Client';

            let emailSent = false;
            let emailError: string | null = null;
            if (recipientEmail) {
              try {
                const { emailService } = await import('./emailService');
                const outstanding = Number(invoice.total) - Number((invoice as any).amountPaid || '0');
                const subject = daysOverdue > 0
                  ? `[Overdue] Invoice ${invoice.invoiceNumber} is ${daysOverdue} day(s) past due - $${outstanding.toFixed(2)}`
                  : `[Reminder] Invoice ${invoice.invoiceNumber} payment due - $${outstanding.toFixed(2)}`;

                await NotificationDeliveryService.send({ type: 'payment_reminder', workspaceId: workspace.id || 'system', recipientUserId: recipientEmail, channel: 'email', body: { to: recipientEmail, subject, html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><h2 style="color: #1e293b;">${daysOverdue > 0 ? 'Overdue Notice' : 'Payment Reminder'}</h2><p>Dear ${clientName},</p><p>Invoice <strong>${invoice.invoiceNumber}</strong> for <strong>$${outstanding.toFixed(2)}</strong> ${daysOverdue > 0 ? `was due on ${dueDate.toLocaleDateString()} and is now ${daysOverdue} days past due.` : `is due on ${dueDate.toLocaleDateString()}.`}</p><p>Please arrange payment at your earliest convenience.</p><div style="margin-top: 20px; padding: 15px; background-color: #f8fafc; border-radius: 8px;"><p><strong>Invoice:</strong> ${invoice.invoiceNumber}</p><p><strong>Amount Due:</strong> $${outstanding.toFixed(2)}</p><p><strong>Due Date:</strong> ${dueDate.toLocaleDateString()}</p></div></div>` } });
                emailSent = true;
                log.debug('Sent payment reminder email to client', { invoiceId: invoice.id, clientEmail: recipientEmail });
              } catch (emailErr) {
                emailError = emailErr instanceof Error ? emailErr.message : String(emailErr);
                log.warn('Failed to send client reminder email — will retry next run', { invoiceId: invoice.id, error: emailError });
              }
            }

            await db.insert(paymentReminders).values({
              workspaceId: workspace.id,
              invoiceId: invoice.id,
              clientId: invoice.clientId,
              reminderType: applicableTier.type,
              sentVia: emailSent ? 'email' : 'platform',
              recipientEmail,
              sentAt: now,
              metadata: {
                daysOverdue,
                invoiceNumber: invoice.invoiceNumber,
                invoiceTotal: invoice.total,
                clientName,
                emailSent,
                emailError,
              },
            });

            totalReminders++;

            try {
              const workspaceOwner = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.id, workspace.ownerId))
                .limit(1);

              if (workspaceOwner[0]) {
                await createNotification({
                  workspaceId: workspace.id,
                  userId: workspaceOwner[0].id,
                  type: 'payment_overdue',
                  title: `Payment Overdue: Invoice #${invoice.invoiceNumber}`,
                  message: `Invoice #${invoice.invoiceNumber} for ${clientName} is ${applicableTier.label}. Total: $${invoice.total}`,
                  metadata: {
                    invoiceId: invoice.id,
                    clientId: invoice.clientId,
                    daysOverdue,
                    reminderType: applicableTier.type,
                  },
                });
                totalNotifications++;
              }
            } catch (notifErr) {
              log.warn('Failed to send payment reminder notification', { invoiceId: invoice.id, error: notifErr instanceof Error ? notifErr.message : String(notifErr) });
            }

          } catch (invoiceErr) {
            log.warn('Failed to process reminder for invoice', { invoiceId: invoice.id, error: invoiceErr instanceof Error ? invoiceErr.message : String(invoiceErr) });
          }
        }
      } catch (wsErr) {
        log.warn('Failed to process reminders for workspace', { workspaceId: workspace.id, error: wsErr instanceof Error ? wsErr.message : String(wsErr) });
      }
    }

    log.info('Payment reminder check complete', { totalReminders, totalNotifications });
    return { totalReminders, totalNotifications };
  } catch (error) {
    log.error('Critical error in payment reminder check', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

// ============================================================================
// SCHEDULER INITIALIZATION
// ============================================================================

let isSchedulerRunning = false;

/**
 * Start all autonomous job schedulers
 */
export function startAutonomousScheduler() {
  log.info('Autonomous scheduler initialization started');
  
  try {
    if (isSchedulerRunning) {
      log.warn('Autonomous scheduler is already running');
      return;
    }

    // Define scheduler configuration (was previously called customSchedulerIntervals)
    const SCHEDULER_CONFIG = {
    invoicing: { enabled: true, schedule: CRON.smartBilling, description: 'Nightly invoice generation' },
    scheduling: { enabled: true, schedule: CRON.aiScheduling, description: 'Weekly AI schedule generation' },
    payroll: { enabled: true, schedule: CRON.autoPayroll, description: 'Automatic payroll processing' },
    paymentReminders: { enabled: true, schedule: '0 9 * * *', description: 'Daily overdue invoice payment reminders' },
    lateFees: { enabled: true, schedule: '30 2 * * *', description: 'Daily late fee application to overdue invoices based on workspace settings' },
    cleanup: { enabled: true, schedule: CRON.idempotencyCleanup, description: 'Idempotency key cleanup' },
    roomAutoClose: { enabled: true, schedule: CRON.chatAutoClose, description: 'Room auto-close' },
    wsConnectionCleanup: { enabled: true, schedule: CRON.wsCleanup, description: 'WebSocket cleanup' },
    visualQa: { enabled: true, schedule: CRON.visualQa, description: 'Daily visual QA scanning' },
    autoClockOut: { enabled: true, schedule: '*/30 * * * *', description: 'Auto clock-out officers whose shift ended >30 minutes ago with no clock-out' },
    shiftCompletionBridge: { enabled: true, schedule: '*/30 * * * *', description: 'Create pending time entries for assigned shifts with no clock-in/out recorded' },
    payrollReadiness: { enabled: true, schedule: '0 8 * * *', description: 'Pre-payroll 48-hour data readiness scan: missing pay rates, bank accounts, worker types' },
    trainingRenewal: { enabled: true, schedule: '0 7 * * *', description: 'Daily training certificate renewal scan: flag expired certs, notify officers, create interventions' },
    dailyDigest: { enabled: true, schedule: CRON.dailyDigest, description: 'Daily manager digest' },
    qbTokenHealth: { enabled: true, schedule: CRON.qbTokenHealth, description: 'QuickBooks token health check' },
    platformChangeMonitor: { enabled: true, schedule: CRON.platformChangeMonitor, description: 'Platform change monitor' },
    weeklyAudit: { enabled: true, schedule: CRON.weeklyAudit, description: 'Weekly platform audit' },
    dbMaintenance: { enabled: true, schedule: CRON.dbMaintenance, description: 'Database maintenance' },
    analyticsSnapshot: { enabled: true, schedule: '0 2 * * *', description: 'Daily analytics snapshot generation' },
    notificationCleanupTasks: { enabled: true, schedule: '0 2 * * *', description: 'Daily notification cleanup tasks' },
    tokenCleanup: { enabled: true, schedule: '0 3 * * *', description: 'Daily token cleanup' },
    sundayWeeklyReports: { enabled: true, schedule: '0 8 * * 0', description: 'Sunday weekly reports generation' },
    revenueRecognition: { enabled: true, schedule: '0 1 1 * *', description: 'Monthly ASC 606 accrual revenue recognition: process scheduled entries, update deferred revenue, write org ledger' },
    // Phase 26F — hourly retry sweep for event-driven invoiceLifecycleWorkflow.
    // Event-driven approvals can leave entries with status=approved, invoiceId=NULL
    // if the workflow aborts mid-flight. runNightlyInvoiceGeneration is
    // schedule-gated (weekly/monthly), so this hourly sweep is the real safety net.
    invoiceLifecycleSweep: { enabled: true, schedule: '17 * * * *', description: 'Hourly retry for approved time entries stuck without an invoice (Phase 26F)' },
    approvalExpiry: { enabled: true, schedule: '*/15 * * * *', description: 'Mark pending AI approvals as expired once they pass their expiresAt timestamp' },
  };

  log.info('CoAIleague autonomous scheduler starting');

  // 1. Nightly Invoice Generation (2 AM daily)
  registerJobInfo('CoAIleague Smart Billing', SCHEDULER_CONFIG.invoicing.schedule, SCHEDULER_CONFIG.invoicing.description, SCHEDULER_CONFIG.invoicing.enabled);
  if (SCHEDULER_CONFIG.invoicing.enabled) {
    cron.schedule(SCHEDULER_CONFIG.invoicing.schedule, () => {
      trackJobExecution('CoAIleague Smart Billing', async () => {
        log.debug('Invoice generation triggered', { timestamp: new Date().toISOString() });
        const startTime = Date.now();
        try {
          await runNightlyInvoiceGeneration();
          // G26-01 FIX: Phase 10 client timesheet invoice auto-generation — was never wired to scheduler.
          // Runs immediately after the main nightly gen so both fire in the same billing window.
          await runScheduledClientInvoiceAutoGeneration().catch((err: Error) => {
            log.warn('Client timesheet invoice auto-generation failed (non-blocking)', { error: err.message });
          });
          emitAutomationEvent({
            jobName: 'CoAIleague Smart Billing',
            category: 'billing',
            success: true,
            duration: Date.now() - startTime,
          });
        } catch (err: any) {
          emitAutomationEvent({
            jobName: 'CoAIleague Smart Billing',
            category: 'billing',
            success: false,
            details: { error: (err instanceof Error ? err.message : String(err)) },
          });
          throw err;
        }
      });
    });
    log.info('Smart Billing Automation registered', { schedule: SCHEDULER_CONFIG.invoicing.schedule, description: SCHEDULER_CONFIG.invoicing.description });
  }

  // 2. Schedule Generation (11 PM daily)
  registerJobInfo('AI Schedule Generation', SCHEDULER_CONFIG.scheduling.schedule, SCHEDULER_CONFIG.scheduling.description, SCHEDULER_CONFIG.scheduling.enabled);
  if (SCHEDULER_CONFIG.scheduling.enabled) {
    cron.schedule(SCHEDULER_CONFIG.scheduling.schedule, () => {
      trackJobExecution('AI Schedule Generation', async () => {
        log.debug('Schedule generation triggered', { timestamp: new Date().toISOString() });
        const startTime = Date.now();
        try {
          await runWeeklyScheduleGeneration();
          emitAutomationEvent({
            jobName: 'AI Schedule Generation',
            category: 'scheduling',
            success: true,
            duration: Date.now() - startTime,
          });
        } catch (err: any) {
          emitAutomationEvent({
            jobName: 'AI Schedule Generation',
            category: 'scheduling',
            success: false,
            details: { error: (err instanceof Error ? err.message : String(err)) },
          });
          throw err;
        }
      });
    });
    log.info('AI Scheduling Automation registered', { schedule: SCHEDULER_CONFIG.scheduling.schedule, description: SCHEDULER_CONFIG.scheduling.description });
  }

  // 3. Automatic Payroll Processing (3 AM daily)
  registerJobInfo('Automatic Payroll Processing', SCHEDULER_CONFIG.payroll.schedule, SCHEDULER_CONFIG.payroll.description, SCHEDULER_CONFIG.payroll.enabled);
  if (SCHEDULER_CONFIG.payroll.enabled) {
    cron.schedule(SCHEDULER_CONFIG.payroll.schedule, () => {
      trackJobExecution('Automatic Payroll Processing', async () => {
        log.debug('Payroll processing triggered', { timestamp: new Date().toISOString() });
        const startTime = Date.now();
        try {
          await runAutomaticPayrollProcessing();
          // G26-02 FIX: payrollAutoClose and detectOrphanedPayrollRuns were only called from
          // an automation trigger handler — never from a scheduled cron. Wired here so pay period
          // close detection and orphan detection run every night at 3 AM (same window as auto payroll).
          await runPayrollAutoClose().catch((err: Error) => {
            log.warn('Payroll auto-close failed (non-blocking)', { error: err.message });
          });
          await detectOrphanedPayrollRuns().catch((err: Error) => {
            log.warn('Orphaned payroll run detection failed (non-blocking)', { error: err.message });
          });
          emitAutomationEvent({
            jobName: 'Automatic Payroll Processing',
            category: 'payroll',
            success: true,
            duration: Date.now() - startTime,
          });
        } catch (err: any) {
          emitAutomationEvent({
            jobName: 'Automatic Payroll Processing',
            category: 'payroll',
            success: false,
            details: { error: (err instanceof Error ? err.message : String(err)) },
          });
          throw err;
        }
      });
    });
    log.info('Auto Payroll Automation registered', { schedule: SCHEDULER_CONFIG.payroll.schedule, description: SCHEDULER_CONFIG.payroll.description });
  }

  // 3b. Payment Reminder Check (9 AM daily)
  // SCOPE: Sends OVERDUE invoice reminders only (dueDate <= now). Uses the `paymentReminders`
  // table for deduplication (tier 1/2/3 based on days overdue). Does NOT send pre-due reminders.
  // NOTE: The "Email Automation" job (below) calls invoiceService.processPaymentReminders()
  // which covers BOTH pre-due AND overdue emails using a separate `invoiceReminders` dedup table.
  // Overlap zone: invoices in the overdue range may get emails from BOTH jobs.
  // If double-emails become a production issue, consolidate into Email Automation only and
  // disable the Payment Reminder Check cron, or make them share the same dedup table.
  registerJobInfo('Payment Reminder Check', SCHEDULER_CONFIG.paymentReminders.schedule, SCHEDULER_CONFIG.paymentReminders.description, SCHEDULER_CONFIG.paymentReminders.enabled);
  if (SCHEDULER_CONFIG.paymentReminders.enabled) {
    cron.schedule(SCHEDULER_CONFIG.paymentReminders.schedule, () => {
      trackJobExecution('Payment Reminder Check', async () => {
        log.debug('Payment reminder check triggered', { timestamp: new Date().toISOString() });
        const startTime = Date.now();
        try {
          const result = await runPaymentReminderCheck();
          emitAutomationEvent({
            jobName: 'Payment Reminder Check',
            category: 'billing',
            success: true,
            duration: Date.now() - startTime,
            recordsProcessed: result.totalReminders,
            details: { notifications: result.totalNotifications },
          });
        } catch (err: any) {
          emitAutomationEvent({
            jobName: 'Payment Reminder Check',
            category: 'billing',
            success: false,
            details: { error: (err instanceof Error ? err.message : String(err)) },
          });
          throw err;
        }
      });
    });
    log.info('Payment Reminder Check registered', { schedule: SCHEDULER_CONFIG.paymentReminders.schedule, description: SCHEDULER_CONFIG.paymentReminders.description });
  }

  // 3c. Late Fee Application (2:30 AM daily — after nightly invoice generation)
  registerJobInfo('Late Fee Application', SCHEDULER_CONFIG.lateFees.schedule, SCHEDULER_CONFIG.lateFees.description, SCHEDULER_CONFIG.lateFees.enabled);
  if (SCHEDULER_CONFIG.lateFees.enabled) {
    cron.schedule(SCHEDULER_CONFIG.lateFees.schedule, () => {
      trackJobExecution('Late Fee Application', async () => {
        const startTime = Date.now();
        try {
          const result = await runLateFeeApplication();
          emitAutomationEvent({
            jobName: 'Late Fee Application',
            category: 'billing',
            success: true,
            duration: Date.now() - startTime,
            recordsProcessed: result.invoicesAffected,
            details: { workspacesProcessed: result.workspacesProcessed },
          });
        } catch (err: any) {
          emitAutomationEvent({
            jobName: 'Late Fee Application',
            category: 'billing',
            success: false,
            details: { error: (err instanceof Error ? err.message : String(err)) },
          });
          throw err;
        }
      });
    });
    log.info('Late Fee Application registered', { schedule: SCHEDULER_CONFIG.lateFees.schedule, description: SCHEDULER_CONFIG.lateFees.description });
  }

  // 3d. Payroll Readiness Scan (8 AM daily — 48h pre-payroll employee data check)
  registerJobInfo('Payroll Readiness Scan', SCHEDULER_CONFIG.payrollReadiness.schedule, SCHEDULER_CONFIG.payrollReadiness.description, SCHEDULER_CONFIG.payrollReadiness.enabled);
  if (SCHEDULER_CONFIG.payrollReadiness.enabled) {
    cron.schedule(SCHEDULER_CONFIG.payrollReadiness.schedule, () => {
      trackJobExecution('Payroll Readiness Scan', async () => {
        const startTime = Date.now();
        try {
          const { runPayrollReadinessScanAllWorkspaces } = await import('./automation/payrollReadinessScanner');
          const result = await runPayrollReadinessScanAllWorkspaces();
          emitAutomationEvent({
            jobName: 'Payroll Readiness Scan',
            category: 'payroll',
            success: true,
            duration: Date.now() - startTime,
            recordsProcessed: result.workspacesScanned,
            details: { totalFlagged: result.totalFlagged, totalCritical: result.totalCritical },
          });
        } catch (err: any) {
          emitAutomationEvent({
            jobName: 'Payroll Readiness Scan',
            category: 'payroll',
            success: false,
            details: { error: (err instanceof Error ? err.message : String(err)) },
          });
          throw err;
        }
      });
    });
    log.info('Payroll Readiness Scan registered', { schedule: SCHEDULER_CONFIG.payrollReadiness.schedule, description: SCHEDULER_CONFIG.payrollReadiness.description });
  }

  // 3e. Training Certificate Renewal Scan (7 AM daily — before shift start)
  registerJobInfo('Training Certificate Renewal', SCHEDULER_CONFIG.trainingRenewal.schedule, SCHEDULER_CONFIG.trainingRenewal.description, SCHEDULER_CONFIG.trainingRenewal.enabled);
  if (SCHEDULER_CONFIG.trainingRenewal.enabled) {
    cron.schedule(SCHEDULER_CONFIG.trainingRenewal.schedule, () => {
      trackJobExecution('Training Certificate Renewal', async () => {
        const startTime = Date.now();
        try {
          const { runTrainingRenewalScan } = await import('./training/trainingRenewalService');
          const result = await runTrainingRenewalScan();
          emitAutomationEvent({
            jobName: 'Training Certificate Renewal',
            category: 'compliance',
            success: true,
            duration: Date.now() - startTime,
            recordsProcessed: result.workspacesScanned,
            details: {
              expiredFound: result.expiredFound,
              expiringSoonFound: result.expiringSoonFound,
              notificationsCreated: result.notificationsCreated,
              interventionsCreated: result.interventionsCreated,
            },
          });
        } catch (err: any) {
          emitAutomationEvent({
            jobName: 'Training Certificate Renewal',
            category: 'compliance',
            success: false,
            details: { error: (err instanceof Error ? err.message : String(err)) },
          });
          throw err;
        }
      });
    });
    log.info('Training Certificate Renewal registered', { schedule: SCHEDULER_CONFIG.trainingRenewal.schedule, description: SCHEDULER_CONFIG.trainingRenewal.description });
  }

  // 3f. Approval Expiry Sweep (every 15 minutes)
  //
  // Marks pending AI approvals as expired once they pass their
  // expiresAt timestamp. Without this, the `expireOldApprovals` method
  // on approvalRequestService existed but was never invoked by any
  // cron — so stale approvals accumulated in the aiApprovalRequests
  // table indefinitely and blocked automation that was waiting on
  // them. Workflow audit 2026-04-08 flagged this as "approval workflows
  // / expireOldApprovals never called by cron" — this is the fix.
  registerJobInfo('Approval Expiry Sweep', SCHEDULER_CONFIG.approvalExpiry.schedule, SCHEDULER_CONFIG.approvalExpiry.description, SCHEDULER_CONFIG.approvalExpiry.enabled);
  if (SCHEDULER_CONFIG.approvalExpiry.enabled) {
    cron.schedule(SCHEDULER_CONFIG.approvalExpiry.schedule, () => {
      trackJobExecution('Approval Expiry Sweep', async () => {
        const startTime = Date.now();
        try {
          const { approvalRequestService } = await import('./ai-brain/approvalRequestService');
          const expiredCount = await approvalRequestService.expireOldApprovals();
          emitAutomationEvent({
            jobName: 'Approval Expiry Sweep',
            category: 'governance',
            success: true,
            duration: Date.now() - startTime,
            recordsProcessed: expiredCount,
            details: { expiredCount },
          });
        } catch (err: any) {
          emitAutomationEvent({
            jobName: 'Approval Expiry Sweep',
            category: 'governance',
            success: false,
            details: { error: (err instanceof Error ? err.message : String(err)) },
          });
          throw err;
        }
      });
    });
    log.info('Approval Expiry Sweep registered', { schedule: SCHEDULER_CONFIG.approvalExpiry.schedule, description: SCHEDULER_CONFIG.approvalExpiry.description });
  }

  // 4. Idempotency Key Cleanup (4 AM daily)
  registerJobInfo('Idempotency Key Cleanup', SCHEDULER_CONFIG.cleanup.schedule, SCHEDULER_CONFIG.cleanup.description, SCHEDULER_CONFIG.cleanup.enabled);
  if (SCHEDULER_CONFIG.cleanup.enabled) {
    cron.schedule(SCHEDULER_CONFIG.cleanup.schedule, () => {
      trackJobExecution('Idempotency Key Cleanup', () => runIdempotencyKeyCleanup());
    });
    log.info('Idempotency Key Cleanup registered', { schedule: SCHEDULER_CONFIG.cleanup.schedule, description: SCHEDULER_CONFIG.cleanup.description });
  }

  // Phase 26F — Invoice lifecycle retry sweep (hourly at :17)
  registerJobInfo('Invoice Lifecycle Retry Sweep', (SCHEDULER_CONFIG as any).invoiceLifecycleSweep.schedule, (SCHEDULER_CONFIG as any).invoiceLifecycleSweep.description, (SCHEDULER_CONFIG as any).invoiceLifecycleSweep.enabled);
  if ((SCHEDULER_CONFIG as any).invoiceLifecycleSweep.enabled) {
    cron.schedule((SCHEDULER_CONFIG as any).invoiceLifecycleSweep.schedule, () => {
      trackJobExecution('Invoice Lifecycle Retry Sweep', async () => {
        const { sweepStuckInvoiceLifecycleEntries } = await import('./trinity/workflows/invoiceLifecycleWorkflow');
        await sweepStuckInvoiceLifecycleEntries();
      });
    });
    log.info('Invoice Lifecycle Retry Sweep registered', { schedule: (SCHEDULER_CONFIG as any).invoiceLifecycleSweep.schedule });
  }

  // License Expiry Alert Sweep (Daily 6 AM)
  // Scans expiring guard cards and approaching Tier 3 window endings.
  registerJobInfo('License Expiry Alerts', '0 6 * * *', 'Daily scan for expiring guard cards + Tier 3 authorization windows', true);
  cron.schedule('0 6 * * *', () => {
    trackJobExecution('License Expiry Alerts', async () => {
      try {
        const { runLicenseExpiryAlerts } = await import('./trinity/workflows/licenseExpiryWorkflow');
        await runLicenseExpiryAlerts();
      } catch (err) {
        log.warn('[Cron] License expiry sweep failed:', (err as any)?.message);
      }
    });
  });
  log.info('License Expiry Alert registered', { schedule: '0 6 * * *' });

  // 4b. Terminated Employee Access Expiry (Daily 4:30 AM UTC)
  // Finds employees whose document_access_expires_at has passed and
  // ensures their sessions are purged and accounts fully locked.
  registerJobInfo('Terminated Access Expiry', '30 4 * * *', 'Remove expired terminated-employee document access', true);
  cron.schedule('30 4 * * *', () => {
    trackJobExecution('Terminated Access Expiry', async () => {
      try {
        const { db: dbInst } = await import('../db');
        const { sql: drizzleSql, eq } = await import('drizzle-orm');

        // Find employees past grace period who still have userId
        const expired = await dbInst.execute(drizzleSql`
          SELECT e.id, e.workspace_id, e.user_id, e.first_name, e.last_name, e.email
          FROM employees e
          WHERE e.is_active = false
            AND e.document_access_expires_at IS NOT NULL
            AND e.document_access_expires_at < NOW()
            AND e.user_id IS NOT NULL
        `);

        const rows: any[] = (expired as any).rows || [];
        log.info('[TerminationExpiry] Processing expired document access', { count: rows.length });

        for (const row of rows) {
          try {
            // Delete any lingering sessions
            if (row.user_id) {
              await dbInst.execute(drizzleSql`
                DELETE FROM sessions WHERE user_id = ${row.user_id}
              `).catch(() => null);

              // Mark as fully deactivated — clear document access expiry flag
              // to prevent re-processing on next run
              await dbInst.execute(drizzleSql`
                UPDATE employees
                SET document_access_expires_at = NULL
                WHERE id = ${row.id}
              `).catch(() => null);
            }

            log.info('[TerminationExpiry] Deactivated expired access', {
              employeeId: row.id,
              workspaceId: row.workspace_id,
              userId: row.user_id,
            });
          } catch (rowErr: unknown) {
            log.warn('[TerminationExpiry] Row processing failed', {
              employeeId: row.id,
              error: rowErr instanceof Error ? rowErr.message : String(rowErr),
            });
          }
        }

        log.info('[TerminationExpiry] Cleanup complete', { processed: rows.length });
      } catch (err: unknown) {
        log.error('[TerminationExpiry] Daily job failed', { error: err instanceof Error ? err.message : String(err) });
      }
    });
  });
  log.info('Terminated Access Expiry registered', { schedule: '30 4 * * *' });

  // 4b-2. Contract Signing Reminder (Daily 10 AM UTC)
  // Scans pending contract signatures and sends chase emails at D+3/7/14 with
  // the portal link. Idempotent via idempotencyKey so reruns are safe.
  registerJobInfo('Contract Signing Reminder', '0 10 * * *', 'Email pending contract signers at D+3/7/14', true);
  cron.schedule('0 10 * * *', () => {
    trackJobExecution('Contract Signing Reminder', async () => {
      const startTime = Date.now();
      try {
        const { sendContractSigningReminders } = await import(
          './contracts/contractPipelineService'
        );
        const result = await sendContractSigningReminders();
        emitAutomationEvent({
          jobName: 'Contract Signing Reminder',
          category: 'notification',
          success: true,
          duration: Date.now() - startTime,
          recordsProcessed: result.sent,
          details: { scanned: result.scanned, sent: result.sent },
        });
      } catch (err: unknown) {
        emitAutomationEvent({
          jobName: 'Contract Signing Reminder',
          category: 'notification',
          success: false,
          details: { error: err instanceof Error ? err.message : String(err) },
        });
        throw err;
      }
    });
  });
  log.info('Contract Signing Reminder registered', { schedule: '0 10 * * *' });

  // 4b-3. Overdue Collections Sweep (9 AM daily)
  // Scans all workspaces for overdue invoices and escalates through the three
  // collection tiers (reminder → demand → escalation). Registered here because
  // runOverdueCollectionsSweep() existed in overdueCollectionsService but was
  // never wired to a cron schedule.
  registerJobInfo('Overdue Collections Sweep', '0 9 * * *', 'Daily AR sweep — sends tiered collection notices for overdue invoices', true);
  cron.schedule('0 9 * * *', () => {
    trackJobExecution('Overdue Collections Sweep', async () => {
      const startTime = Date.now();
      try {
        const { runOverdueCollectionsSweep } = await import('./billing/overdueCollectionsService');
        const result = await runOverdueCollectionsSweep();
        emitAutomationEvent({
          jobName: 'Overdue Collections Sweep',
          category: 'billing',
          success: true,
          duration: Date.now() - startTime,
          recordsProcessed: result.workspacesScanned,
          details: {
            tier1Sent: result.tier1Sent,
            tier2Sent: result.tier2Sent,
            tier3Sent: result.tier3Sent,
          },
        });
      } catch (err: unknown) {
        emitAutomationEvent({
          jobName: 'Overdue Collections Sweep',
          category: 'billing',
          success: false,
          details: { error: err instanceof Error ? err.message : String(err) },
        });
        throw err;
      }
    });
  });
  log.info('Overdue Collections Sweep registered', { schedule: '0 9 * * *' });

  // 4c. Hourly Proof-of-Service Prompt (Every 15 minutes)
  // Scans active shift chatrooms and nudges officers who have gone >60 min
  // without submitting a GPS photo. Escalates to supervisors at >120 min.
  registerJobInfo(
    'Hourly Proof-of-Service Prompt',
    '*/15 * * * *',
    'Prompts officers in active shifts to submit GPS photo if none in last 60 min',
    true,
  );
  cron.schedule('*/15 * * * *', () => {
    trackJobExecution('Hourly Proof-of-Service Prompt', async () => {
      try {
        const { promptOverdueShiftPhotos } = await import('./automation/shiftPhotoPromptService');
        const result = await promptOverdueShiftPhotos();
        emitAutomationEvent({
          jobName: 'Hourly Proof-of-Service Prompt',
          category: 'scheduling',
          success: true,
          recordsProcessed: result.prompted,
          details: { checked: result.checked, prompted: result.prompted, supervisorAlerts: result.supervisorAlerts },
        });
      } catch (err: any) {
        log.error('[PhotoPrompt] cron failed', { error: err instanceof Error ? err.message : String(err) });
        emitAutomationEvent({
          jobName: 'Hourly Proof-of-Service Prompt',
          category: 'scheduling',
          success: false,
          details: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    });
  });
  log.info('Hourly Proof-of-Service Prompt registered', { schedule: '*/15 * * * *' });

  // 5. Chat Workroom Auto-Close (Every 5 minutes)
  registerJobInfo('Room Auto-Close', SCHEDULER_CONFIG.roomAutoClose.schedule, SCHEDULER_CONFIG.roomAutoClose.description, SCHEDULER_CONFIG.roomAutoClose.enabled);
  if (SCHEDULER_CONFIG.roomAutoClose.enabled) {
    cron.schedule(SCHEDULER_CONFIG.roomAutoClose.schedule, () => {
      trackJobExecution('Room Auto-Close', () => runRoomAutoClose());
    });
    log.info('Chat Workroom Auto-Close registered', { schedule: SCHEDULER_CONFIG.roomAutoClose.schedule, description: SCHEDULER_CONFIG.roomAutoClose.description });
  }

  // 6. WebSocket Connection Cleanup (Every 5 minutes)
  registerJobInfo('WebSocket Cleanup', SCHEDULER_CONFIG.wsConnectionCleanup.schedule, SCHEDULER_CONFIG.wsConnectionCleanup.description, SCHEDULER_CONFIG.wsConnectionCleanup.enabled);
  if (SCHEDULER_CONFIG.wsConnectionCleanup.enabled) {
    cron.schedule(SCHEDULER_CONFIG.wsConnectionCleanup.schedule, () => {
      trackJobExecution('WebSocket Cleanup', () => runWebSocketConnectionCleanup());
    });
    log.info('WebSocket Connection Cleanup registered', { schedule: SCHEDULER_CONFIG.wsConnectionCleanup.schedule, description: SCHEDULER_CONFIG.wsConnectionCleanup.description });
  }

  // 7. SMS Outbox Worker (every minute) — drains queued broadcast SMS within
  // Twilio A2P 10DLC rate limits. Non-blocking: skips cleanly if outbox table
  // is unavailable or no messages are queued.
  cron.schedule('* * * * *', async () => {
    try {
      const { processSMSOutbox } = await import('./sms/smsQueueService');
      await processSMSOutbox();
    } catch (err: any) {
      log.warn('[Cron] SMS outbox worker error:', err?.message);
    }
  });
  log.info('SMS Outbox Worker registered', { schedule: '* * * * * (every minute)' });

  // Token allowance resets naturally via token_usage_monthly (a new row is
  // created on the 1st of each month as soon as the first AI call of the
  // month runs) — no dedicated cron is required.

  // FLSA Overtime Approaching Alert (weekdays at 7 AM)
  registerJobInfo('FLSA Overtime Approaching Alert', '0 7 * * 1-5', 'Weekday 7 AM scan for officers approaching FLSA overtime thresholds', true);
  cron.schedule('0 7 * * 1-5', () => {
    trackJobExecution('FLSA Overtime Approaching Alert', async () => {
      const { runOvertimeApproachingAlert } = await import(
        './trinity/workflows/overtimeAlertWorkflow'
      );
      await runOvertimeApproachingAlert();
      return { success: true };
    });
  });
  log.info('Overtime Approaching Alert registered', { schedule: '0 7 * * 1-5 (weekdays 7am)' });

  // 7b. Monthly Platform Infrastructure Billing (1st of month at 1 AM)
  registerJobInfo('Platform Infrastructure Billing', CRON.monthlyInfraBilling, 'Cost recovery for email, domain, and infrastructure', true);
  cron.schedule(CRON.monthlyInfraBilling, () => {
    trackJobExecution('Platform Infrastructure Billing', async () => {
      log.debug('Platform infrastructure billing triggered', { timestamp: new Date().toISOString() });
      try {
        const result = await platformServicesMeter.chargeMonthlyInfrastructure();
        log.info('Platform billing complete', { workspacesProcessed: result.processed, tokensUsed: result.totalCredits });
        emitAutomationEvent({
          jobName: 'Monthly Platform Infrastructure Billing',
          category: 'billing',
          success: true,
          recordsProcessed: result.processed,
          details: { tokensUsed: result.totalCredits },
        });
      } catch (error: any) {
        log.error('Platform billing error', { error: (error instanceof Error ? error.message : String(error)) });
        emitAutomationEvent({
          jobName: 'Monthly Platform Infrastructure Billing',
          category: 'billing',
          success: false,
          details: { error: (error instanceof Error ? error.message : String(error)) },
        });
        throw error;
      }
    });
  });
  log.info('Monthly Platform Infrastructure Billing registered', { schedule: '0 1 1 * *', description: 'Cost recovery for email, domain, and infrastructure' });

  // 7c. Monthly ASC 606 Revenue Recognition (1st of month at 1:30 AM)
  registerJobInfo('Monthly Revenue Recognition', SCHEDULER_CONFIG.revenueRecognition.schedule, SCHEDULER_CONFIG.revenueRecognition.description, SCHEDULER_CONFIG.revenueRecognition.enabled);
  if (SCHEDULER_CONFIG.revenueRecognition.enabled) {
    cron.schedule(SCHEDULER_CONFIG.revenueRecognition.schedule, () => {
      trackJobExecution('Monthly Revenue Recognition', async () => {
        log.info('Monthly revenue recognition triggered', { timestamp: new Date().toISOString() });
        try {
          const { runMonthlyRecognitionAllWorkspaces } = await import('./billing/revenueRecognitionService');
          const results = await runMonthlyRecognitionAllWorkspaces();
          const processed = results.reduce((s, r) => s + r.schedulesProcessed, 0);
          const amount = results.reduce((s, r) => s + r.amountRecognized, 0);
          log.info('Monthly revenue recognition complete', { workspaces: results.length, schedulesProcessed: processed, totalAmount: amount.toFixed(2) });
          emitAutomationEvent({
            jobName: 'Monthly Revenue Recognition',
            category: 'billing',
            success: true,
            recordsProcessed: processed,
            details: { workspacesProcessed: results.length, totalAmount: amount.toFixed(2) },
          });
        } catch (error: any) {
          log.error('Monthly revenue recognition error', { error: (error instanceof Error ? error.message : String(error)) });
          emitAutomationEvent({
            jobName: 'Monthly Revenue Recognition',
            category: 'billing',
            success: false,
            details: { error: (error instanceof Error ? error.message : String(error)) },
          });
          throw error;
        }
      });
    });
    log.info('Monthly Revenue Recognition registered', { schedule: SCHEDULER_CONFIG.revenueRecognition.schedule });
  }
  // Trial Expiry & Conversion Job - Daily at 6 AM (process expiring trials with 7/3/1 day warnings)
  registerJobInfo('Trial Conversion Processing', CRON.trialExpiry, 'Processes trial conversions, warnings, and suspensions', true);
  cron.schedule(CRON.trialExpiry, () => {
    trackJobExecution('Trial Conversion Processing', async () => {
      log.debug('Trial conversion check triggered', { timestamp: new Date().toISOString() });
      const { trialConversionOrchestrator } = await import('./billing/trialConversionOrchestrator');
      const result = await trialConversionOrchestrator.processExpiringTrials();
      log.info('Trial conversion complete', { processed: result.processed, converted: result.converted, suspended: result.suspended });
      emitAutomationEvent({
        jobName: 'Trial Conversion Processing',
        category: 'billing',
        success: true,
        duration: 0,
        recordsProcessed: result.processed,
        details: {
          converted: result.converted,
          gracePeriod: result.gracePeriod,
          suspended: result.suspended,
          notified: result.notified,
        },
      });
    });
  });
  log.info("Trial Expiry Warning Job registered", { schedule: "0 6 * * *", description: "Processes trial conversions, warnings, and suspensions" });
  
  // Billing Exception Queue Processing - Daily at 5 AM
  cron.schedule(CRON.billingExceptionQueue, () => {
    log.debug('Exception queue processing triggered', { timestamp: new Date().toISOString() });
    (async () => {
      try {
        const { exceptionQueueProcessor } = await import('./billing/exceptionQueueProcessor');
        const result = await exceptionQueueProcessor.processQueue();
        log.info('Exception queue processed', { processed: result.processed, autoResolved: result.autoResolved, escalated: result.escalated });
        emitAutomationEvent({
          jobName: 'Billing Exception Processing',
          category: 'billing',
          success: true,
          duration: 0,
          recordsProcessed: result.processed,
          details: {
            autoResolved: result.autoResolved,
            escalated: result.escalated,
            expired: result.expired,
          },
        });
      } catch (err) {
        log.error("Exception queue processing error", { error: (err as Error).message });
        emitAutomationEvent({
          jobName: 'Billing Exception Processing',
          category: 'billing',
          success: false,
          details: { error: (err as Error).message },
        });
      }
    })();
  });
  log.info("Billing Exception Queue Processing registered", { schedule: "0 5 * * *", description: "Auto-resolves and escalates billing exceptions" });
  
  cron.schedule(CRON.emailAutomation, () => {
    trackJobExecution('Email Automation', async () => {
      log.info('Email automation triggered — processing scheduled notifications');
      const activeWs = await db.select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.isSuspended, false), eq(workspaces.isLocked, false)));

      let totalSent = 0;
      for (const ws of activeWs) {
        try {
          const { invoiceService } = await import('./billing/invoice');
          const result = await invoiceService.processPaymentReminders(ws.id);
          totalSent += result.remindersSent;
        } catch (err) {
          log.warn('Email automation: reminder processing failed for workspace', { workspaceId: ws.id, error: err instanceof Error ? err.message : String(err) });
        }
      }
      log.info('Email automation complete', { workspacesProcessed: activeWs.length, emailsSent: totalSent });
    });
  });
  log.info("Email Automation Job registered", { schedule: "0 9,15 * * *", description: "Sends scheduled email notifications" });

  // Compliance Alert Job — Daily at 8 AM
  // SCOPE: Manager/HR-facing alerts only. Sends emails to workspace managers and org owners
  // when employee certifications are within 30 days of expiry. Does NOT notify the employee.
  // NOTE: This job is intentionally separate from the 7am "Notification Event Coverage" job
  // below, which sends employee-facing push/in-app notifications. They serve different audiences.
  // Any change to this job must be tested against complianceAlertService.ts — not notificationEventCoverage.ts.
  cron.schedule(CRON.complianceAlerts, () => {
    log.debug('Compliance check triggered', { timestamp: new Date().toISOString() });
    const startTime = Date.now();
    Promise.allSettled([
      checkExpiringCertifications(),
      scanShiftLicenseConflicts(),
      import('./compliance/officerComplianceScoreService').then(m => m.checkAuditReadinessReminders()),
      db.select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.isSuspended, false), eq(workspaces.isLocked, false)))
        .then((rows) => Promise.all(rows.map((ws) => scanOverdueI9s(ws.id)))),
    ]).then(([certResult, shiftConflictResult, readinessResult, overdueI9Result]) => {
      const certValue = certResult.status === 'fulfilled' ? certResult.value : null;
      const conflictsFound = shiftConflictResult.status === 'fulfilled' ? shiftConflictResult.value.conflictsFound : 0;
      const readiness = readinessResult.status === 'fulfilled' ? readinessResult.value : null;
      if (shiftConflictResult.status === 'rejected') {
        log.error('Shift-license conflict scan error', { error: shiftConflictResult.reason?.message });
      }
      if (readinessResult.status === 'rejected') {
        log.error('Audit readiness reminder error', { error: readinessResult.reason?.message });
      }
      if (overdueI9Result.status === 'rejected') {
        log.error('Overdue I-9 scan error', { error: overdueI9Result.reason?.message });
      }
      emitAutomationEvent({
        jobName: 'Compliance Certification Check',
        category: 'compliance',
        success: true,
        duration: Date.now() - startTime,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        recordsProcessed: (certValue?.alertsSent || 0) + conflictsFound,
        details: { shiftLicenseConflicts: conflictsFound, auditReadinessReminded: readiness?.reminded ?? 0 },
      });
    }).catch(err => {
      log.error('Compliance check error', { error: err instanceof Error ? err.message : String(err) });
      emitAutomationEvent({
        jobName: 'Compliance Certification Check',
        category: 'compliance',
        success: false,
        details: { error: (err instanceof Error ? err.message : String(err)) },
      });
    });
  });
  log.info('Compliance Alert Automation registered', { schedule: '0 8 * * *', description: 'Alerts HR 30 days before certification expiry; scans shift-license date conflicts; Trinity audit readiness reminder' });

  // Notification Event Coverage — Daily at 7 AM
  // SCOPE: Employee-facing push/in-app notifications only. Sends 30/14/7-day warnings to the
  // individual employee whose certification is expiring. Does NOT send emails to managers.
  // NOTE: This job is intentionally separate from the 8am "Compliance Alert" job above,
  // which emails workspace managers. Different audience, different channel, different timing.
  registerJobInfo('Notification Event Coverage - Certification Expiry', '0 7 * * *', 'Daily certification expiry check with 30/14/7-day warnings via notification event coverage', true);
  cron.schedule('0 7 * * *', () => {
    trackJobExecution('Notification Event Coverage - Certification Expiry', async () => {
      log.debug('Notification event coverage certification expiry check', { timestamp: new Date().toISOString() });
      const startTime = Date.now();
      const result = await runCertificationExpiryCheck();
      emitAutomationEvent({
        jobName: 'Notification Event Coverage - Certification Expiry',
        category: 'notification',
        success: true,
        duration: Date.now() - startTime,
        recordsProcessed: result.notified,
        details: { checked: result.checked, notified: result.notified },
      });
    });
  });
  log.info('Notification Event Coverage - Certification Expiry registered', { schedule: '0 7 * * *', description: 'Sends 30/14/7-day certification expiry warnings' });

  registerJobInfo('GPS Inactivity Monitor (Silent Supervisor)', '*/10 * * * *', 'Checks active shifts for GPS inactivity and alerts guards/supervisors', true);
  cron.schedule('*/10 * * * *', () => {
    trackJobExecution('GPS Inactivity Monitor (Silent Supervisor)', async () => {
      log.debug('GPS inactivity check', { timestamp: new Date().toISOString() });
      const startTime = Date.now();
      const { gpsInactivityMonitor } = await import('./fieldOperations/gpsInactivityMonitor');
      const result = await gpsInactivityMonitor.checkActiveShiftsForInactivity();
      emitAutomationEvent({
        jobName: 'GPS Inactivity Monitor (Silent Supervisor)',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        category: 'monitoring',
        success: true,
        duration: Date.now() - startTime,
        recordsProcessed: result.alertsSent,
        details: { checked: result.checked, alertsSent: result.alertsSent, inactiveGuards: result.alerts.length },
      });
    });
  });
  log.info('GPS Inactivity Monitor registered', { schedule: '*/10 * * * *', description: 'Alerts guards after 30min GPS inactivity' });

  // Shift Reminder Automation - Every 5 minutes to process reminders based on user preferences
  cron.schedule(CRON.shiftReminders, () => {
    (async () => {
      try {
        const { processShiftReminders } = await import('./shiftRemindersService');
        const result = await processShiftReminders();
        if (result.processed > 0) {
          log.info('Shift reminders processed', { processed: result.processed, successful: result.successful, failed: result.failed });
        }
      } catch (error) {
        log.error('Error processing shift reminders', { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });
  log.info('Shift Reminder Automation registered', { schedule: '*/5 * * * *', description: 'Sends shift reminders based on user preferences' });

  // Document Signature Reminder & Expiry Automation - Daily at 10 AM
  cron.schedule(CRON.signatureReminders, () => {
    (async () => {
      try {
        const { documentSigningService } = await import('./documentSigningService');
        const { db } = await import('../db');
        const { orgDocumentSignatures, orgDocuments } = await import('@shared/schema');
        const { eq, and, isNull, lt, gte } = await import('drizzle-orm');

        const pending = await db.select({
          signature: orgDocumentSignatures,
          document: orgDocuments,
        })
        .from(orgDocumentSignatures)
        .leftJoin(orgDocuments, eq(orgDocumentSignatures.documentId, orgDocuments.id))
        .where(
          and(
            isNull(orgDocumentSignatures.signedAt),
            // @ts-expect-error — TS migration: fix in refactoring sprint
            eq(orgDocumentSignatures.status, 'pending')
          )
        );

        let remindersSent = 0;
        let expired = 0;
        const now = new Date();
        const processedDocs = new Set<string>();

        for (const item of pending) {
          const docId = item.signature.documentId;
          if (!docId || processedDocs.has(docId)) continue;

          if (item.signature.expiresAt && new Date(item.signature.expiresAt) < now) {
            expired++;
            continue;
          }

          processedDocs.add(docId);
          try {
            const result = await (documentSigningService as any).sendDocumentReminders(docId);
            remindersSent += result.sent;
          } catch (err) {
            // Skip individual failures
          }
        }

        if (remindersSent > 0 || expired > 0) {
          log.info('Document automation daily run', { remindersSent, expired });
        }
      } catch (error) {
        log.error('Error in document signature automation', { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });
  log.info('Document Signature Reminder Automation registered', { schedule: '0 10 * * *', description: 'Sends signature reminders and processes expired requests' });

  // Weekly AI Overage Billing - Every Sunday at midnight
  cron.schedule(CRON.aiOverageBilling, () => {
    log.debug('Weekly AI overage billing triggered', { timestamp: new Date().toISOString() });
    (async () => {
      try {
        const { usageMeteringService } = await import('./billing/usageMetering');
        const { workspaces, billingAuditLog, invoices } = await import('@shared/schema');
        const { db } = await import('../db');
        const { eq, and } = await import('drizzle-orm');
        
        // Get all active workspaces (not suspended or frozen)
        const activeWorkspaces = await db.select().from(workspaces).where(
          and(
            eq(workspaces.subscriptionStatus, 'active'),
            eq(workspaces.isSuspended, false),
            eq(workspaces.isFrozen, false)
          )
        );
        let totalBilled = 0;
        let workspacesBilled = 0;
        let invoicesCreated = 0;
        
        const weekEnd = new Date();
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() - 7);
        const weekKey = `ai-overage-${weekStart.toISOString().split('T')[0]}`;
        
        for (const workspace of activeWorkspaces) {
          try {
            // Check idempotency - skip if already processed this week
            const [existingAudit] = await db.select().from(billingAuditLog).where(
              and(
                eq(billingAuditLog.workspaceId, workspace.id),
                eq(billingAuditLog.eventType, 'weekly_ai_overage_processed'),
                sql`${billingAuditLog.metadata}->>'idempotencyKey' = ${weekKey}`
              )
            ).limit(1);
            
            if (existingAudit) {
              log.debug('Skipping workspace - already processed', { workspaceName: workspace.name, weekKey });
              continue;
            }
            
            // Get this week's usage metrics
            const metrics = await usageMeteringService.getUsageMetrics(workspace.id, weekStart, weekEnd);
            
            if (metrics.totalCost > 0) {
              // Create invoice line item for AI overage
              const [invoice] = await db.insert(invoices).values({
                workspaceId: workspace.id,
                clientId: workspace.id,
                invoiceNumber: `AI-${Date.now()}-${workspace.id.substring(0, 8)}`,
                status: 'pending',
                subtotal: metrics.totalCost.toString(),
                total: metrics.totalCost.toString(),
                taxAmount: '0',
                notes: `AI Token Overage: ${metrics.totalUsage.toLocaleString()} tokens (${weekStart.toISOString()} - ${weekEnd.toISOString()})`,
              }).returning();
              
              invoicesCreated++;
              totalBilled += metrics.totalCost;
              workspacesBilled++;
              
              // Log audit event with idempotency key
              await db.insert(billingAuditLog).values({
                workspaceId: workspace.id,
                eventType: 'weekly_ai_overage_processed',
                eventCategory: 'billing',
                actorType: 'system',
                description: `Weekly AI overage invoice created: $${metrics.totalCost.toFixed(2)} for ${metrics.totalUsage.toLocaleString()} tokens`,
                relatedEntityType: 'invoice',
                relatedEntityId: invoice.id,
                newState: {
                  invoiceId: invoice.id,
                  totalCost: metrics.totalCost,
                  totalTokens: metrics.totalUsage,
                  periodStart: weekStart.toISOString(),
                  periodEnd: weekEnd.toISOString(),
                },
                metadata: { idempotencyKey: weekKey },
              });
              
              log.info('AI overage invoice created', { workspaceName: workspace.name, cost: metrics.totalCost.toFixed(2), tokens: metrics.totalUsage });
            }
          } catch (wsError) {
            log.error('AI billing error processing workspace', { workspaceId: workspace.id, error: wsError instanceof Error ? wsError.message : String(wsError) });
          }
        }
        
        log.info('Weekly AI billing complete', { workspacesBilled, invoicesCreated, totalBilled: totalBilled.toFixed(2) });
      } catch (error) {
        log.error('Weekly AI billing error', { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });
  log.info('AI Overage Billing Automation registered', { schedule: '30 0 * * 0', description: 'Creates weekly AI token overage invoices (offset 30min from Gamification Reset to prevent DB contention)' });

  // Database Maintenance - Weekly on Sundays at 3 AM
  cron.schedule(CRON.dbMaintenance, () => {
    log.debug('Database maintenance triggered', { timestamp: new Date().toISOString() });
    const startTime = Date.now();
    (async () => {
      try {
        const results = await runAllMaintenanceJobs();
        const successCount = results.filter(r => r.success).length;
        const totalRecords = results.reduce((sum, r) => sum + r.recordsProcessed, 0);
        log.info('Database maintenance complete', { successful: successCount, total: results.length });
        
        await emitAutomationEvent({
          jobName: 'Database Maintenance',
          category: 'maintenance',
          success: successCount === results.length,
          duration: Date.now() - startTime,
          recordsProcessed: totalRecords,
          details: {
            jobsRun: results.length,
            jobsSuccessful: successCount,
            results: results.map(r => ({ job: r.job, success: r.success, records: r.recordsProcessed })),
          },
        });
      } catch (error: any) {
        log.error('Database maintenance error', { error: error instanceof Error ? error.message : String(error) });
        await emitAutomationEvent({
          jobName: 'Database Maintenance',
          category: 'maintenance',
          success: false,
          details: { error: (error instanceof Error ? error.message : String(error)) },
        });
      }
    })();
  });
  log.info('Database Maintenance Automation registered', { schedule: maintenanceConfig.schedule, description: maintenanceConfig.description });

  // Analytics Snapshot (2 AM daily)
  registerJobInfo('Analytics Snapshot', SCHEDULER_CONFIG.analyticsSnapshot.schedule, SCHEDULER_CONFIG.analyticsSnapshot.description, SCHEDULER_CONFIG.analyticsSnapshot.enabled);
  if (SCHEDULER_CONFIG.analyticsSnapshot.enabled) {
    cron.schedule(SCHEDULER_CONFIG.analyticsSnapshot.schedule, () => {
      trackJobExecution('Analytics Snapshot', async () => {
        await runDailyAnalyticsSnapshot();
        return { success: true };
      });
    });
  }

  // Notification Cleanup (2 AM daily)
  registerJobInfo('Notification Cleanup Tasks', SCHEDULER_CONFIG.notificationCleanupTasks.schedule, SCHEDULER_CONFIG.notificationCleanupTasks.description, SCHEDULER_CONFIG.notificationCleanupTasks.enabled);
  if (SCHEDULER_CONFIG.notificationCleanupTasks.enabled) {
    cron.schedule(SCHEDULER_CONFIG.notificationCleanupTasks.schedule, () => {
      trackJobExecution('Notification Cleanup Tasks', async () => {
        return await runCleanupTasks();
      });
    });
  }

  // Token Cleanup (3 AM daily)
  registerJobInfo('Token Cleanup', SCHEDULER_CONFIG.tokenCleanup.schedule, SCHEDULER_CONFIG.tokenCleanup.description, SCHEDULER_CONFIG.tokenCleanup.enabled);
  if (SCHEDULER_CONFIG.tokenCleanup.enabled) {
    cron.schedule(SCHEDULER_CONFIG.tokenCleanup.schedule, () => {
      trackJobExecution('Token Cleanup', async () => {
        return await runTokenCleanup();
      });
    });
  }

  // Sunday Weekly Reports (8 AM Sundays)
  registerJobInfo('Sunday Weekly Reports', SCHEDULER_CONFIG.sundayWeeklyReports.schedule, SCHEDULER_CONFIG.sundayWeeklyReports.description, SCHEDULER_CONFIG.sundayWeeklyReports.enabled);
  if (SCHEDULER_CONFIG.sundayWeeklyReports.enabled) {
    cron.schedule(SCHEDULER_CONFIG.sundayWeeklyReports.schedule, () => {
      trackJobExecution('Sunday Weekly Reports', async () => {
        await runSundayWeeklyReports();
        return { success: true };
      });
    });
  }

  // G26-03 FIX: NDS Retry Queue Processor — every 15 minutes
  // The notification_deliveries table has attemptCount/maxAttempts/nextRetryAt/status fields
  // designed for retry scheduling, but no scheduled processor ever swept them.
  // This cron picks up 'failed' records where nextRetryAt <= now and retries them,
  // escalating to 'permanently_failed' once attemptCount >= maxAttempts.
  registerJobInfo('NDS Retry Queue Processor', '*/15 * * * *', 'Retry failed notification deliveries with exponential backoff', true);
  cron.schedule('*/15 * * * *', () => {
    (async () => {
      try {
        const { notificationDeliveries } = await import('@shared/schema');
        const { eq, lte, lt, and } = await import('drizzle-orm');
        const now = new Date();
        const retryable = await db
          .select()
          .from(notificationDeliveries)
          .where(and(
            eq(notificationDeliveries.status, 'failed'),
            lte(notificationDeliveries.nextRetryAt, now),
            lt(notificationDeliveries.attemptCount, notificationDeliveries.maxAttempts),
          ))
          .limit(50);
        if (retryable.length === 0) return;
        log.debug('NDS retry sweep', { found: retryable.length });
        const { NotificationDeliveryService } = await import('./notificationDeliveryService');
        let retried = 0;
        let deadLettered = 0;
        for (const record of retryable) {
          try {
            const newAttemptCount = (record.attemptCount || 0) + 1;
            const maxAttempts = record.maxAttempts || 3;
            if (newAttemptCount >= maxAttempts) {
              await db.update(notificationDeliveries)
                .set({ status: 'permanently_failed', updatedAt: now })
                .where(eq(notificationDeliveries.id, record.id));
              deadLettered++;
            } else {
              const backoffMs = Math.min(300000, 60000 * Math.pow(2, newAttemptCount - 1));
              const nextRetryAt = new Date(now.getTime() + backoffMs);
              await db.update(notificationDeliveries)
                .set({ status: 'pending', attemptCount: newAttemptCount, nextRetryAt, updatedAt: now })
                .where(eq(notificationDeliveries.id, record.id));
              retried++;
            }
          } catch (_err) { /* non-blocking per-record */ }
        }
        if (retried > 0 || deadLettered > 0) {
          log.info('NDS retry sweep complete', { retried, deadLettered });
        }
      } catch (err: any) {
        log.warn('NDS retry sweep error (non-blocking)', { error: err instanceof Error ? err.message : String(err) });
      }
    })();
  });

  // GAP-S30-04 FIX: Email Deliverability Health Check — every 6 hours
  // checkDeliverabilityRates() previously only ran reactively on bounce/complaint webhook events.
  // This proactive cron ensures deliverability health is assessed independently, feeding Trinity
  // proactive monitoring. Confirms Phase 29 deliverability monitoring integrates with Phase 26 cron layer.
  registerJobInfo('Email Deliverability Health Check', '0 */6 * * *', 'Proactive 24-hour bounce/complaint rate check — alerts if thresholds exceeded', true);
  cron.schedule('0 */6 * * *', () => {
    (async () => {
      try {
        const { checkDeliverabilityRates } = await import('../routes/resendWebhooks');
        await checkDeliverabilityRates();
      } catch (err: any) {
        log.warn('Deliverability health check error (non-blocking)', { error: err instanceof Error ? err.message : String(err) });
      }
    })();
  });

  // G26-04 FIX: Daily session cleanup cron — 1 AM every day
  // Sessions expire naturally via pg-connect-session TTL, but the table can grow unbounded
  // with stale rows until they are vacuumed. This cron hard-deletes rows past their
  // expire timestamp so the table stays bounded without waiting for the weekly DB maintenance sweep.
  registerJobInfo('Session Cleanup', '0 1 * * *', 'Delete expired session rows to prevent unbounded table growth', true);
  cron.schedule('0 1 * * *', () => {
    (async () => {
      try {
        const result = await db.execute(
          sql`DELETE FROM sessions WHERE expire < NOW() RETURNING sid`
        );
        const deleted = (result.rows || []).length;
        if (deleted > 0) {
          log.info('Session cleanup complete', { deletedSessions: deleted });
        }
      } catch (err: any) {
        log.warn('Session cleanup error (non-blocking)', { error: err instanceof Error ? err.message : String(err) });
      }
    })();
  });

  cron.schedule('0 5 * * *', () => {
    log.debug('Notification cleanup triggered');
    (async () => {
      try {
        const { cleanupAllUsersSystemNotifications } = await import('./notificationService');
        const cleaned = await cleanupAllUsersSystemNotifications(3);
        if (cleaned > 0) {
          log.info('Notification cleanup complete', { notificationsCleaned: cleaned });
        }
      } catch (error: any) {
        log.error('Notification cleanup error', { error: (error instanceof Error ? error.message : String(error)) });
      }
    })();
  });
  log.info('Notification Cleanup registered', { schedule: '0 5 * * *', description: 'Daily cleanup of excess system notifications' });

  // Daily Digest Email - Every day at 7 AM
  cron.schedule(CRON.dailyDigest, () => {
    log.debug('Daily digest job triggered', { timestamp: new Date().toISOString() });
    const startTime = Date.now();
    (async () => {
      try {
        const { runDailyDigestJob } = await import('./dailyDigestService');
        const stats = await runDailyDigestJob();
        log.info('Daily digest complete', { sent: stats.sent, failed: stats.failed, skipped: stats.skipped });
        
        await emitAutomationEvent({
          jobName: 'Daily Digest Emails',
          category: 'notification',
          success: stats.failed === 0,
          duration: Date.now() - startTime,
          recordsProcessed: stats.sent,
          details: {
            sent: stats.sent,
            failed: stats.failed,
            skipped: stats.skipped,
          },
        });
      } catch (error: any) {
        log.error('Daily digest job error', { error: error instanceof Error ? error.message : String(error) });
        await emitAutomationEvent({
          jobName: 'Daily Digest Emails',
          category: 'notification',
          success: false,
          details: { error: (error instanceof Error ? error.message : String(error)) },
        });
      }
    })();
  });
  log.info('Daily Digest Email Automation registered', { schedule: '0 7 * * *', description: 'Sends personalized daily digest emails' });

  // AI Usage Daily Summary Rollup — Every day at 3 AM
  cron.schedule('0 3 * * *', () => {
    (async () => {
      try {
        const { pool } = await import('../db');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];

        const { rows: wsRows } = await pool.query(
          `SELECT id FROM workspaces WHERE subscription_status NOT IN ('cancelled','deleted') AND (workspace_type IS NULL OR workspace_type != 'trial_expired') LIMIT 500`
        );
        const { aiMeteringService } = await import('./billing/aiMeteringService');
        let rolled = 0;
        for (const ws of wsRows) {
          try {
            await aiMeteringService.rollupDailySummary(ws.id, dateStr);
            rolled++;
          } catch (rollupErr: any) {
            log.warn('[AutonomousScheduler] AI usage rollup failed for workspace', { workspaceId: ws.id, date: dateStr, error: rollupErr?.message });
          }
        }
        log.info('AI usage daily summary rollup complete', { date: dateStr, workspaces: rolled });
      } catch (err: any) {
        log.error('AI usage daily summary rollup error', { error: err instanceof Error ? err.message : String(err) });
      }
    })();
  });
  log.info('AI Usage Daily Summary Rollup registered', { schedule: '0 3 * * *', description: 'Nightly token usage rollup for AI metering dashboard' });

  // QuickBooks Token Health Check - Daily at 5 AM
  cron.schedule(CRON.qbTokenHealth, () => {
    log.debug('QuickBooks token health check triggered', { timestamp: new Date().toISOString() });
    const startTime = Date.now();
    (async () => {
      try {
        const { quickbooksTokenRefresh } = await import('./integrations/quickbooksTokenRefresh');
        
        // Check token health (warns about tokens expiring in 30 days)
        const healthResult = await quickbooksTokenRefresh.checkTokenHealth();
        
        // Proactively refresh all tokens to prevent 100-day refresh token expiry
        const refreshResult = await quickbooksTokenRefresh.keepAllTokensFresh();
        
        log.info('QuickBooks token health check result', { healthy: healthResult.healthy, expiringSoon: healthResult.expiringSoon, expired: healthResult.expired });
        log.info('QuickBooks token refresh result', { refreshed: refreshResult.refreshed, failed: refreshResult.failed, skipped: refreshResult.skipped });
        
        await emitAutomationEvent({
          jobName: 'QuickBooks Token Health',
          // @ts-expect-error — TS migration: fix in refactoring sprint
          category: 'integration',
          success: healthResult.expired === 0 && refreshResult.failed === 0,
          duration: Date.now() - startTime,
          recordsProcessed: healthResult.healthy + healthResult.expiringSoon + healthResult.expired,
          details: {
            health: healthResult,
            refresh: refreshResult,
          },
        });
      } catch (error: any) {
        log.error('QuickBooks token health check error', { error: error instanceof Error ? error.message : String(error) });
        await emitAutomationEvent({
          jobName: 'QuickBooks Token Health',
          // @ts-expect-error — TS migration: fix in refactoring sprint
          category: 'integration',
          success: false,
          details: { error: (error instanceof Error ? error.message : String(error)) },
        });
      }
    })();
  });
  log.info('QuickBooks Token Health Automation registered', { schedule: '0 5 * * *', description: 'Checks token health and refreshes QuickBooks connections' });

  // QuickBooks Weekly Staffing Client Scan - Every Monday at 6 AM
  cron.schedule('0 6 * * 1', () => {
    (async () => {
      try {
        const { db } = await import('../db');
        const { inboundEmails, clients, auditLogs, partnerConnections } = await import('@shared/schema');
        const { gte, and, eq, sql: sqlFn } = await import('drizzle-orm');

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        // Get all workspaces that have active QB connections
        const connections = await db.select().from(partnerConnections).limit(50);
        const workspaceIds = [...new Set(connections.map(c => c.workspaceId).filter(Boolean))];

        let totalSynced = 0;

        for (const wsId of workspaceIds) {
          if (!wsId) continue;
          const recentEmails = await db
            .select({ fromEmail: inboundEmails.fromEmail, fromName: inboundEmails.fromName })
            .from(inboundEmails)
            .where(and(eq(inboundEmails.workspaceId, wsId), gte(inboundEmails.receivedAt, sevenDaysAgo)));

          const uniqueMap = new Map<string, { fromEmail: string; fromName: string | null }>();
          for (const em of recentEmails) {
            if (em.fromEmail && !uniqueMap.has(em.fromEmail.toLowerCase())) {
              uniqueMap.set(em.fromEmail.toLowerCase(), em);
            }
          }

          const existing = await db.select({ email: clients.email }).from(clients).where(eq(clients.workspaceId, wsId));
          const existingSet = new Set(existing.map(c => (c.email || '').toLowerCase()));
          const toCreate = Array.from(uniqueMap.values()).filter(c => !existingSet.has(c.fromEmail.toLowerCase()));

          for (const nc of toCreate) {
            try {
              await db.insert(clients).values({
                workspaceId: wsId,
                email: nc.fromEmail,
                companyName: nc.fromName || nc.fromEmail.split('@')[1] || 'Staffing Client',
                firstName: (nc.fromName || '').split(' ')[0] || '',
                lastName: (nc.fromName || '').split(' ').slice(1).join(' ') || '',
                status: 'lead',
                source: 'inbound_email',
              } as any);
              totalSynced++;
            } catch { /* duplicate — skip */ }
          }
        }

        log.info('QB weekly staffing scan complete', { clientsSynced: totalSynced, workspaces: workspaceIds.length });
        if (totalSynced > 0) {
          await emitAutomationEvent({
            jobName: 'QuickBooks Weekly Staffing Client Scan',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            category: 'integration',
            success: true,
            recordsProcessed: totalSynced,
            details: { clientsSynced: totalSynced, workspacesScanned: workspaceIds.length },
          });
          try {
            await platformEventBus.publish({
              type: 'client.created',
              category: 'feature',
              title: 'New staffing leads discovered',
              description: `QB staffing scan found ${totalSynced} new inbound email contact${totalSynced !== 1 ? 's' : ''} and added them as leads.`,
              workspaceId: workspaceIds[0] || undefined,
              metadata: { source: 'qb_staffing_scan', clientsSynced: totalSynced, workspaces: workspaceIds.length },
            });
          } catch (err) {
            log.warn('[autonomousScheduler] Event publish failed (non-fatal):', err);
          }
        }
      } catch (err: any) {
        log.error('QB weekly staffing scan error', { error: (err instanceof Error ? err.message : String(err)) });
        await emitAutomationEvent({
          jobName: 'QuickBooks Weekly Staffing Client Scan',
          // @ts-expect-error — TS migration: fix in refactoring sprint
          category: 'integration',
          success: false,
          details: { error: (err instanceof Error ? err.message : String(err)) },
        });
      }
    })();
  });
  log.info('QuickBooks Weekly Staffing Client Scan registered', { schedule: '0 6 * * 1', description: 'Scans inbound emails and syncs staffing clients' });

  // Platform Change Monitor - Every 15 minutes
  cron.schedule(CRON.platformChangeMonitor, () => {
    log.debug('Scheduled platform scan triggered', { timestamp: new Date().toISOString() });
    (async () => {
      try {
        const result = await platformChangeMonitor.scanPlatform('scheduled');
        log.info('Scheduled platform scan result', { changesDetected: result.changesDetected, notificationsSent: result.notificationsSent });
      } catch (error) {
        log.error('Scheduled platform scan error', { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });

  // Visual QA Scheduled Scanning - Daily at 6 AM
  cron.schedule(SCHEDULER_CONFIG.visualQa.schedule, () => {
    log.debug('Visual QA scan triggered', { timestamp: new Date().toISOString() });
    const startTime = Date.now();
    (async () => {
      try {
        const { visualQaSubagent } = await import('./ai-brain/subagents/visualQaSubagent');
        
        // Key platform pages to scan (use first active workspace for VQA records)
        const vqaBaseUrl = getAppBaseUrl();
        const pagesToScan = [
          { url: `${vqaBaseUrl}/`, name: 'Landing Page' },
          { url: `${vqaBaseUrl}/dashboard`, name: 'Dashboard' },
          { url: `${vqaBaseUrl}/schedule`, name: 'Schedule' },
          { url: `${vqaBaseUrl}/usage`, name: 'Usage Dashboard' },
        ];
        
        const platformWorkspaceId = PLATFORM_WORKSPACE_ID;
        
        let totalFindings = 0;
        let criticalFindings = 0;
        const scanResults: Array<{ page: string; findings: number; critical: number }> = [];
        
        for (const page of pagesToScan) {
          try {
            log.debug('Scanning page for VQA', { page: page.name });
            const result = await visualQaSubagent.runVisualCheck({
              url: page.url,
              workspaceId: platformWorkspaceId,
              triggerSource: 'scheduled',
              triggeredBy: null,
            });
            
            const pageFindings = result.findings.length;
            const pageCritical = result.findings.filter(f => f.severity === 'critical' || f.severity === 'high').length;
            
            totalFindings += pageFindings;
            criticalFindings += pageCritical;
            scanResults.push({ page: page.name, findings: pageFindings, critical: pageCritical });
            
            log.info('VQA page scan result', { page: page.name, findings: pageFindings, critical: pageCritical });
          } catch (pageError) {
            log.error('VQA scan error', { page: page.name, error: pageError instanceof Error ? pageError.message : String(pageError) });
          }
        }
        
        // Notify org owners/admins if critical issues found
        if (criticalFindings > 0) {
          log.warn('Critical VQA findings detected, notifying admins', { criticalFindings });
          
          // Get org owners and admins from all workspaces
          const admins = await db.select()
            .from(employees)
            .where(
              and(
                sql`${employees.workspaceRole} IN ('org_owner', 'co_owner')`,
                sql`${employees.userId} IS NOT NULL`
              )
            );
          
          for (const admin of admins) {
            if (admin.userId) {
              try {
                await createNotification({
                  workspaceId: admin.workspaceId,
                  userId: admin.userId,
                  type: 'system',
                  title: 'Visual QA Alert: Critical Issues Detected',
                  message: `I detected ${criticalFindings} critical/high visual issues across ${scanResults.filter(r => r.critical > 0).length} page(s). Review the VQA findings for details.`,
                  actionUrl: '/ai/audit-log-viewer',
                  priority: 'high',
                  relatedEntityType: 'visual_qa',
                  metadata: { 
                    totalFindings,
                    criticalFindings,
                    pagesScanned: pagesToScan.length,
                    scanResults,
                  },
                  createdBy: 'system-coaileague',
                  idempotencyKey: `system-${Date.now()}-${admin.userId}`
                });
              } catch (notifError) {
                log.warn('Failed to notify admin about VQA findings', { adminId: admin.userId, error: notifError instanceof Error ? notifError.message : String(notifError) });
              }
            }
          }
        }
        
        log.info('VQA scan complete', { totalFindings, criticalFindings });
        
        await emitAutomationEvent({
          jobName: 'Visual QA Scan',
          category: 'maintenance',
          success: true,
          duration: Date.now() - startTime,
          recordsProcessed: pagesToScan.length,
          details: {
            pagesScanned: pagesToScan.length,
            totalFindings,
            criticalFindings,
            scanResults,
          },
        });
      } catch (error: any) {
        log.error('VQA scheduled scan error', { error: error instanceof Error ? error.message : String(error) });
        await emitAutomationEvent({
          jobName: 'Visual QA Scan',
          category: 'maintenance',
          success: false,
          details: { error: (error instanceof Error ? error.message : String(error)) },
        });
      }
    })();
  });
  log.info('Visual QA Automation registered', { schedule: SCHEDULER_CONFIG.visualQa.schedule, description: 'Scans platform pages for visual anomalies' });

  // Auto Clock-Out: Close orphaned time entries for shifts that ended >30 min ago
  // Officers must clock in/out via GPS on-site. This catches missed clock-outs (app crash,
  // signal loss, officer forgot) by closing the entry at the shift's scheduled end time.
  // Entries remain 'pending' — manager must still approve. Trinity never marks them approved.
  if (SCHEDULER_CONFIG.autoClockOut.enabled) {
    cron.schedule(SCHEDULER_CONFIG.autoClockOut.schedule, () => {
      log.debug('Auto clock-out scan triggered', { timestamp: new Date().toISOString() });
      (async () => {
        try {
          const now = new Date();
          const gracePeriodMs = 30 * 60 * 1000; // 30 min grace after shift end

          // Get all active workspaces
          const activeWorkspaces = await db
            .select({ id: workspaces.id, name: workspaces.name })
            .from(workspaces)
            .where(and(
              eq(workspaces.isSuspended, false),
              eq(workspaces.isFrozen, false),
              eq(workspaces.isLocked, false),
            ));

          let totalClosed = 0;

          for (const workspace of activeWorkspaces) {
            try {
              // Find open time entries (no clockOut) linked to shifts that ended >30 min ago
              const openEntries = await db
                .select({
                  entry: timeEntries,
                  shiftEndTime: shifts.endTime,
                  shiftTitle: shifts.title,
                })
                .from(timeEntries)
                .innerJoin(shifts, eq(timeEntries.shiftId, shifts.id))
                .where(and(
                  eq(timeEntries.workspaceId, workspace.id),
                  sql`${timeEntries.clockOut} IS NULL`,
                  eq(timeEntries.status, 'pending'),
                  sql`${shifts.endTime} < ${new Date(now.getTime() - gracePeriodMs)}`
                ));

              for (const { entry, shiftEndTime, shiftTitle } of openEntries) {
                try {
                  const clockOutTime = new Date(shiftEndTime);
                  const totalMs = clockOutTime.getTime() - new Date(entry.clockIn).getTime();
                  const totalHours = Math.max(0, totalMs / (1000 * 60 * 60));

                  await db
                    .update(timeEntries)
                    .set({
                      clockOut: clockOutTime,
                      totalHours: totalHours.toFixed(4),
                      notes: `[AUTO-CLOSED] Shift ended at ${clockOutTime.toISOString()} — officer did not clock out. Manager review required before approval.`,
                      updatedAt: new Date(),
                    })
                    .where(and(
                      eq(timeEntries.id, entry.id),
                      sql`${timeEntries.clockOut} IS NULL` // Race condition guard
                    ));

                  totalClosed++;
                  log.info('Auto clock-out applied', {
                    workspaceId: workspace.id,
                    entryId: entry.id,
                    employeeId: entry.employeeId,
                    shiftTitle,
                    closedAt: clockOutTime.toISOString(),
                    totalHours: totalHours.toFixed(2),
                  });
                } catch (entryError) {
                  log.warn('Failed to auto-close time entry', { entryId: entry.id, error: String(entryError) });
                }
              }
            } catch (wsError) {
              log.warn('Auto clock-out workspace error', { workspaceId: workspace.id, error: String(wsError) });
            }
          }

          if (totalClosed > 0) {
            log.info('Auto clock-out complete', { totalClosed, workspacesChecked: activeWorkspaces.length });
            await emitAutomationEvent({
              jobName: 'Auto Clock-Out',
              category: 'scheduling',
              success: true,
              recordsProcessed: totalClosed,
              details: { totalClosed, workspacesChecked: activeWorkspaces.length },
            });
          }
        } catch (error: any) {
          log.error('Auto clock-out scan error', { error: error instanceof Error ? error.message : String(error) });
          await emitAutomationEvent({
            jobName: 'Auto Clock-Out',
            category: 'scheduling',
            success: false,
            details: { error: error instanceof Error ? error.message : String(error) },
          });
        }
      })();
    });
    log.info('Auto Clock-Out registered', { schedule: SCHEDULER_CONFIG.autoClockOut.schedule, description: SCHEDULER_CONFIG.autoClockOut.description });
  }

  // Shift Completion Bridge: create pending time entries for assigned shifts with no clock-in/out
  // Runs at the same cadence as autoClockOut but after it (scheduled at same interval, separate task)
  registerJobInfo('Shift Completion Bridge', SCHEDULER_CONFIG.shiftCompletionBridge.schedule, SCHEDULER_CONFIG.shiftCompletionBridge.description, SCHEDULER_CONFIG.shiftCompletionBridge.enabled);
  if (SCHEDULER_CONFIG.shiftCompletionBridge.enabled) {
    cron.schedule(SCHEDULER_CONFIG.shiftCompletionBridge.schedule, () => {
      log.debug('Shift completion bridge triggered', { timestamp: new Date().toISOString() });
      (async () => {
        try {
          const bridgeResult = await runShiftCompletionBridge();
          if (bridgeResult.timeEntriesCreated > 0) {
            log.info('Shift Completion Bridge complete', {
              timeEntriesCreated: bridgeResult.timeEntriesCreated,
              autoApproved: bridgeResult.autoApproved,
              workspacesScanned: bridgeResult.workspacesScanned,
            });
            await emitAutomationEvent({
              jobName: 'Shift Completion Bridge',
              category: 'scheduling',
              success: true,
              recordsProcessed: bridgeResult.timeEntriesCreated,
              details: {
                timeEntriesCreated: bridgeResult.timeEntriesCreated,
                autoApproved: bridgeResult.autoApproved,
                workspacesScanned: bridgeResult.workspacesScanned,
              },
            });
          }
        } catch (err: any) {
          log.error('Shift Completion Bridge error', { error: (err instanceof Error ? err.message : String(err)) });
          await emitAutomationEvent({
            jobName: 'Shift Completion Bridge',
            category: 'scheduling',
            success: false,
            details: { error: (err instanceof Error ? err.message : String(err)) },
          });
        }
      })();
    });
    log.info('Shift Completion Bridge registered', { schedule: SCHEDULER_CONFIG.shiftCompletionBridge.schedule, description: SCHEDULER_CONFIG.shiftCompletionBridge.description });
  }

  // Weekly Platform Audit - Every Sunday at 2 AM
  cron.schedule(CRON.weeklyAudit, () => {
    log.debug('Weekly platform audit triggered', { timestamp: new Date().toISOString() });
    const startTime = Date.now();
    (async () => {
      try {
        const report = await weeklyPlatformAudit.runFullAudit();
        
        log.info('Weekly platform audit complete', { healthScore: report.summary.overallHealthScore });
        log.info('Weekly platform audit findings', { critical: report.summary.criticalCount, high: report.summary.highCount, medium: report.summary.mediumCount });
        
        // Notify platform admins about the audit results
        const admins = await db.select()
          .from(employees)
          .where(
            and(
              sql`${employees.workspaceRole} IN ('org_owner', 'co_owner')`,
              sql`${employees.userId} IS NOT NULL`
            )
          );
        
        for (const admin of admins.slice(0, 10)) {
          if (admin.userId) {
            try {
              await createNotification({
                workspaceId: admin.workspaceId,
                userId: admin.userId,
                type: 'system',
                title: 'Weekly Platform Audit Report',
                message: `Platform health: ${report.summary.overallHealthScore}/100. ${report.summary.totalFindings} issues found (${report.summary.criticalCount} critical). View full report for details.`,
                actionUrl: '/audit-logs',
                priority: report.summary.criticalCount > 0 ? 'high' : 'normal',
                relatedEntityType: 'platform_audit',
                metadata: {
                  reportId: report.reportId,
                  healthScore: report.summary.overallHealthScore,
                  totalFindings: report.summary.totalFindings,
                  criticalCount: report.summary.criticalCount,
                },
                createdBy: 'system-coaileague',
                idempotencyKey: `system-${Date.now()}-${admin.userId}`
              });
            } catch (notifError) {
              log.warn('Failed to notify admin about weekly audit', { adminId: admin.userId, error: notifError instanceof Error ? notifError.message : String(notifError) });
            }
          }
        }
        
        await emitAutomationEvent({
          jobName: 'Weekly Platform Audit',
          category: 'maintenance',
          success: true,
          duration: Date.now() - startTime,
          details: {
            reportId: report.reportId,
            healthScore: report.summary.overallHealthScore,
            totalFindings: report.summary.totalFindings,
            categories: {
              ui: report.categories.ui.length,
              api: report.categories.api.length,
              data: report.categories.data.length,
              performance: report.categories.performance.length,
              ux: report.categories.ux.length,
            },
            recommendations: report.recommendations.slice(0, 5),
          },
        });
      } catch (error: any) {
        log.error('Weekly platform audit error', { error: error instanceof Error ? error.message : String(error) });
        await emitAutomationEvent({
          jobName: 'Weekly Platform Audit',
          category: 'maintenance',
          success: false,
          details: { error: (error instanceof Error ? error.message : String(error)) },
        });
      }
    })();
  });
  log.info('Weekly Platform Audit registered', { schedule: '0 2 * * 0', description: 'Comprehensive platform health check' });

  log.info('Gamification Weekly Reset registered', { schedule: '0 0 * * 0', description: 'Resets weekly leaderboard points' });

  log.info('Gamification Monthly Reset registered', { schedule: '0 0 1 * *', description: 'Resets monthly leaderboard points' });

  // Trinity Proactive Daily Scan — 6am every day (COO morning briefing)
  registerJobInfo('Trinity Daily Intelligence Scan', '0 6 * * *', 'Daily 6am scan: uncovered shifts, missed punches, compliance expiry, overdue invoices, pending approvals', true);
  cron.schedule('0 6 * * *', () => {
    (async () => {
      try {
        const { trinityProactiveScanner } = await import('./ai-brain/trinityProactiveScanner');
        await trinityProactiveScanner.runAllWorkspacesDailyScan();
        log.info('Trinity Daily Intelligence Scan complete');
      } catch (error: any) {
        log.error('Trinity Daily Intelligence Scan error', { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });
  log.info('Trinity Daily Intelligence Scan registered', { schedule: '0 6 * * *', description: 'Daily COO morning briefing: coverage, compliance, invoices, approvals' });

  // Trinity Proactive Weekly Scan — Every Monday at 7am
  registerJobInfo('Trinity Weekly Intelligence Scan', '0 7 * * 1', 'Monday 7am scan: OT risk, next-week completeness, 30-day compliance, workforce summary, SLA compliance, marketplace stale offers', true);
  cron.schedule('0 7 * * 1', () => {
    (async () => {
      try {
        const { trinityProactiveScanner } = await import('./ai-brain/trinityProactiveScanner');
        await trinityProactiveScanner.runAllWorkspacesWeeklyScan();
        log.info('Trinity Weekly Intelligence Scan complete');
      } catch (error: any) {
        log.error('Trinity Weekly Intelligence Scan error', { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });
  log.info('Trinity Weekly Intelligence Scan registered', { schedule: '0 7 * * 1', description: 'Monday weekly: OT risk, open shifts, compliance 30d, workforce summary, SLA check' });

  // ════════════════════════════════════════════════════════════════════════════
  // TRINITY DREAM CYCLE — Nightly cognitive overnight processing (2–5:30 AM)
  // ════════════════════════════════════════════════════════════════════════════
  // While the org sleeps, Trinity's brain continues working: memory consolidation,
  // social graph recalculation, incubation problem solving, temporal arc updates,
  // and narrative self-reflection. The insights produced flow into the first
  // user interaction of the day via buildMorningBrief().

  const loadActiveWorkspaceIds = async (): Promise<string[]> => {
    const rows = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(
        eq(workspaces.isSuspended, false),
        eq(workspaces.isFrozen, false),
        eq(workspaces.isLocked, false),
        ne(workspaces.subscriptionStatus, 'cancelled'),
      ))
      .catch(() => []);
    return rows.map(r => r.id).filter((id): id is string => typeof id === 'string');
  };

  // 2:00 AM — Memory consolidation (compression, decay, pattern surfacing)
  registerJobInfo(
    'Trinity Memory Consolidation',
    '0 2 * * *',
    'Nightly memory compression, decay, and pattern surfacing for all workspaces',
    true,
  );
  cron.schedule('0 2 * * *', () => {
    trackJobExecution('Trinity Memory Consolidation', async () => {
      const { trinityMemoryOptimizer } = await import('./ai-brain/trinityMemoryOptimizer');
      const workspaceIds = await loadActiveWorkspaceIds();
      let processed = 0;
      for (const wsId of workspaceIds) {
        await trinityMemoryOptimizer.runNightlyConsolidation(wsId)
          .then(() => { processed++; })
          .catch((e) => log.warn('DreamCycle memory consolidation failed', { wsId, error: e?.message ?? e }));
      }
      log.info('Trinity Memory Consolidation complete', { workspacesProcessed: processed });
    });
  });

  // 2:30 AM — Social graph recalculation (influence, isolation risk, connectors)
  registerJobInfo(
    'Trinity Social Graph Recalculation',
    '30 2 * * *',
    'Rebuild team relationship graphs, isolation risk, and influence scores for all workspaces',
    true,
  );
  cron.schedule('30 2 * * *', () => {
    trackJobExecution('Trinity Social Graph Recalculation', async () => {
      const { trinitySocialGraphEngine } = await import('./ai-brain/trinitySocialGraphEngine');
      const workspaceIds = await loadActiveWorkspaceIds();
      let totalInsights = 0;
      for (const wsId of workspaceIds) {
        const insights = await trinitySocialGraphEngine.recalculateWorkspaceGraph(wsId)
          .catch((e) => {
            log.warn('DreamCycle social graph recalc failed', { wsId, error: e?.message ?? e });
            return [] as any[];
          });
        totalInsights += insights.length;
      }
      log.info('Trinity Social Graph Recalculation complete', { workspaces: workspaceIds.length, totalInsights });
    });
  });

  // 3:00 AM — Incubation cycle (Trinity works on hard problems overnight)
  registerJobInfo(
    'Trinity Incubation Cycle',
    '0 3 * * *',
    'Background problem solving — Trinity approaches queued problems from new angles',
    true,
  );
  cron.schedule('0 3 * * *', () => {
    trackJobExecution('Trinity Incubation Cycle', async () => {
      const { trinityIncubationEngine } = await import('./ai-brain/trinityIncubationEngine');
      const workspaceIds = await loadActiveWorkspaceIds();
      let totalBreakthroughs = 0;
      for (const wsId of workspaceIds) {
        const breakthroughs = await trinityIncubationEngine.runDreamCycle(wsId)
          .catch((e) => {
            log.warn('DreamCycle incubation failed', { wsId, error: e?.message ?? e });
            return [] as any[];
          });
        totalBreakthroughs += breakthroughs.length;
      }
      log.info('Trinity Incubation Cycle complete', { workspaces: workspaceIds.length, totalBreakthroughs });
    });
  });

  // 3:30 AM — Temporal arc updates (officer/client/org trajectories)
  registerJobInfo(
    'Trinity Temporal Arc Update',
    '30 3 * * *',
    'Update officer, client, and org temporal trajectory arcs for all workspaces',
    true,
  );
  cron.schedule('30 3 * * *', () => {
    trackJobExecution('Trinity Temporal Arc Update', async () => {
      const { trinityTemporalConsciousnessEngine } = await import('./ai-brain/trinityTemporalConsciousnessEngine');
      const workspaceIds = await loadActiveWorkspaceIds();
      let processed = 0;
      for (const wsId of workspaceIds) {
        await trinityTemporalConsciousnessEngine.runNightlyArcUpdate(wsId)
          .then(() => { processed++; })
          .catch((e) => log.warn('DreamCycle arc update failed', { wsId, error: e?.message ?? e }));
      }
      log.info('Trinity Temporal Arc Update complete', { workspacesProcessed: processed });
    });
  });

  // 5:00 AM — Narrative identity update (Trinity writes today's chapter)
  registerJobInfo(
    'Trinity Narrative Update',
    '0 5 * * *',
    'Trinity reflects on yesterday and writes a daily chapter in her workspace narrative',
    true,
  );
  cron.schedule('0 5 * * *', () => {
    trackJobExecution('Trinity Narrative Update', async () => {
      const { trinityNarrativeIdentityEngine } = await import('./ai-brain/trinityNarrativeIdentityEngine');
      const workspaceIds = await loadActiveWorkspaceIds();
      let processed = 0;
      for (const wsId of workspaceIds) {
        await trinityNarrativeIdentityEngine.writeNightlyChapter(wsId)
          .then(() => { processed++; })
          .catch((e) => log.warn('DreamCycle narrative update failed', { wsId, error: e?.message ?? e }));
      }
      log.info('Trinity Narrative Update complete', { workspacesProcessed: processed });
    });
  });

  // Trinity Monthly Business Cycle — 25th of each month at 6am
  registerJobInfo('Trinity Monthly Business Cycle', '0 6 25 * *', 'Monthly 25th: build next month schedule, generate payroll, send invoices, QB sync, executive summary to owner', true);
  cron.schedule('0 6 25 * *', () => {
    (async () => {
      try {
        const { trinityProactiveScanner } = await import('./ai-brain/trinityProactiveScanner');
        await trinityProactiveScanner.runAllWorkspacesMonthlyCycle();
        log.info('Trinity Monthly Business Cycle complete');
      } catch (error: any) {
        log.error('Trinity Monthly Business Cycle error', { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });
  log.info('Trinity Monthly Business Cycle registered', { schedule: '0 6 25 * *', description: '25th: schedule build, payroll, invoices, QB sync, executive summary to owner' });

  registerJobInfo('Trinity Night-Before Confirmation Sweep', '0 20 * * *', 'Nightly 8PM: send shift confirmation requests to all officers scheduled tomorrow', true);
  cron.schedule('0 20 * * *', () => {
    (async () => {
      try {
        const { trinityProactiveScanner } = await import('./ai-brain/trinityProactiveScanner');
        await trinityProactiveScanner.runAllWorkspacesNightBefore();
        log.info('Trinity Night-Before Confirmation Sweep complete');
      } catch (error: any) {
        log.error('Trinity Night-Before Confirmation Sweep error', { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });
  log.info('Trinity Night-Before Confirmation Sweep registered', { schedule: '0 20 * * *', description: 'Nightly: send confirmation requests to officers scheduled tomorrow' });

  // Trinity Autonomous Task Queue — scans every 15 minutes for new self-assigned tasks
  // Coverage gaps, OT prevention, compliance expiry, incident followup, financial alerts
  registerJobInfo('Trinity Autonomous Task Scanner', '*/15 * * * *', 'Every 15 minutes: scan all active workspaces for new autonomous tasks (coverage gaps, OT, compliance expiry)', true);
  cron.schedule('*/15 * * * *', () => {
    (async () => {
      try {
        const { trinityAutonomousTaskQueue } = await import('./ai-brain/trinityAutonomousTaskQueue');
        const { db } = await import('../db');
        const { eq } = await import('drizzle-orm');
        const { workspaces: workspacesTable } = await import('@shared/schema');
        const activeWorkspaces = await db.select({ id: workspacesTable.id })
          .from(workspacesTable)
          // @ts-expect-error — TS migration: fix in refactoring sprint
          .where(eq(workspacesTable.status, 'active'))
          .limit(20)
          .catch(() => [] as { id: string }[]);
        let totalNew = 0;
        for (const ws of activeWorkspaces) {
          try {
            const newTasks = await trinityAutonomousTaskQueue.scanForNewTasks(ws.id);
            totalNew += newTasks.length;
          } catch {
          }
        }
        if (totalNew > 0) {
          log.info('Trinity Autonomous Task Scanner complete', { newTasksIdentified: totalNew, workspacesScanned: activeWorkspaces.length });
        }
      } catch (error: any) {
        log.error('Trinity Autonomous Task Scanner error', { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });
  log.info('Trinity Autonomous Task Scanner registered', { schedule: '*/15 * * * *', description: 'Every 15 min: coverage gap, OT, compliance expiry, incident followup self-assignment' });

  registerJobInfo('Trinity Overdue Task Escalation Scan', '*/30 * * * *', 'Every 30 minutes: scan for delegated tasks past due date and escalate to next level', true);
  cron.schedule('*/30 * * * *', () => {
    (async () => {
      try {
        const { helpaiOrchestrator } = await import('./helpai/platformActionHub');
        const overdueResult = await helpaiOrchestrator.executeAction({ actionId: 'task.track_overdue', params: {}, userId: 'trinity-system' } as any).catch(() => null);
        const overdueTasks = overdueResult?.data?.overdueTasks || [];
        let escalated = 0;
        for (const task of overdueTasks) {
          if (task.hoursOverdue >= 2 && task.escalationLevel < 3) {
            await helpaiOrchestrator.executeAction({ actionId: 'task.escalate', params: {
              taskId: task.taskId,
              workspaceId: task.workspaceId,
              reason: `Task overdue by ${task.hoursOverdue} hours — auto-escalating to level ${task.escalationLevel + 1}`,
            } } as any).catch(() => null);
            escalated++;
          }
        }
        if (overdueTasks.length > 0) {
          log.info('Trinity Overdue Task Escalation Scan complete', { overdueTasks: overdueTasks.length, escalated });
        }
      } catch (error: any) {
        log.error('Trinity Overdue Task Escalation Scan error', { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });
  log.info('Trinity Overdue Task Escalation Scan registered', { schedule: '*/30 * * * *', description: 'Every 30 min: scan and auto-escalate overdue delegation tasks' });

  // Initial platform scan DEFERRED - runs 15 seconds after startup for faster boot
  setTimeout(async () => {
    log.info('Running deferred platform scan');
    try {
      const result = await platformChangeMonitor.scanPlatform('full');
      log.info('Initial platform scan complete', { changesDetected: result.changesDetected, notificationsSent: result.notificationsSent });
    } catch (error) {
      log.error('Initial platform scan error', { error: error instanceof Error ? error.message : String(error) });
    }
  }, 15000);
  log.info('AI Brain Platform Change Monitor registered', { schedule: '*/15 * * * *', description: 'Scans platform for changes' });

  platformChangeMonitor.initEventDrivenScanning().then(() => {
    log.info('Platform Change Monitor event-driven scanning activated — significant events trigger immediate scans');
  }).catch((err: any) => {
    log.error('Failed to initialize event-driven scanning', { error: err?.message || String(err) });
  });

  // Shift Escalation Scanner — every 30 min: fire 72h/24h/4h unassigned-shift alerts
  registerJobInfo('Shift Escalation Scanner', CRON.shiftEscalation, 'Time-based escalating alerts for unassigned shifts at 72h/24h/4h thresholds', true);
  cron.schedule(CRON.shiftEscalation, () => {
    trackJobExecution('Shift Escalation Scanner', async () => {
      const { runShiftEscalationScan } = await import('./shiftEscalationService');
      const result = await runShiftEscalationScan();
      if (result.alertsSent > 0 || result.coveragePipelinesTriggered > 0) {
        log.info('Shift escalation scan', {
          workspacesScanned: result.workspacesScanned,
          shiftsChecked: result.shiftsChecked,
          alertsSent: result.alertsSent,
          coveragePipelinesTriggered: result.coveragePipelinesTriggered,
        });
      }
      emitAutomationEvent({
        jobName: 'Shift Escalation Scanner',
        category: 'scheduling',
        success: true,
        recordsProcessed: result.alertsSent,
        details: {
          workspacesScanned: result.workspacesScanned,
          shiftsChecked: result.shiftsChecked,
          coveragePipelinesTriggered: result.coveragePipelinesTriggered,
        },
      });
    });
  });
  log.info('Shift Escalation Scanner registered', { schedule: CRON.shiftEscalation, description: '72h/24h/4h unassigned shift escalation alerts' });

  // ── REPORTBOT: Hourly check-in reminder scanner — every 5 min (sends reminder if >55min inactive)
  registerJobInfo('ReportBot Hourly Check-In', '*/5 * * * *', 'ReportBot hourly check-in reminders for active shift rooms', true);
  cron.schedule('*/5 * * * *', () => {
    trackJobExecution('ReportBot Hourly Check-In', async () => {
      const { shiftRoomBotOrchestrator } = await import('./bots/shiftRoomBotOrchestrator');
      await shiftRoomBotOrchestrator.runHourlyCheckInCron();
      shiftRoomBotOrchestrator.cleanExpiredPending();
    });
  });

  // ── REPORTBOT: End-of-shift detection — every 5 min (fires 30-min warning + report generation)
  registerJobInfo('ReportBot End-of-Shift', '*/5 * * * *', 'ReportBot end-of-shift report trigger', true);
  cron.schedule('*/5 * * * *', () => {
    trackJobExecution('ReportBot End-of-Shift', async () => {
      const { shiftRoomBotOrchestrator } = await import('./bots/shiftRoomBotOrchestrator');
      await shiftRoomBotOrchestrator.runEndOfShiftCron();
    });
  });

  // ── HELPAI: Overnight intel brief — at midnight, 2 AM, and 4 AM
  // Sends BOLOs, site history, team coverage, and situational context to active overnight shift rooms.
  registerJobInfo('HelpAI Overnight Intel Brief', '0 0,2,4 * * *', 'HelpAI proactive overnight intel brief with BOLOs, site history, and team coverage', true);
  cron.schedule('0 0,2,4 * * *', () => {
    trackJobExecution('HelpAI Overnight Intel Brief', async () => {
      const { shiftRoomBotOrchestrator } = await import('./bots/shiftRoomBotOrchestrator');
      await shiftRoomBotOrchestrator.runOvernightIntelBrief();
    });
  });

  // ── CLOCKBOT: 12-hour clock-out warning — every hour
  registerJobInfo('ClockBot 12h Clock-Out Check', '0 * * * *', 'ClockBot warns officers who have been clocked in for 12+ hours without clocking out', true);
  cron.schedule('0 * * * *', () => {
    trackJobExecution('ClockBot 12h Clock-Out Check', async () => {
      const { shiftRoomBotOrchestrator } = await import('./bots/shiftRoomBotOrchestrator');
      await shiftRoomBotOrchestrator.runTwelveHourClockOutCheck();
    });
  });

  // ── CLOCKBOT: Force Clock Weekly PDF Report — every Monday at 7:30 AM
  registerJobInfo('ClockBot Force Clock Weekly Report', '30 7 * * 1', 'Weekly force clock-in PDF report covering all supervisor-authorized overrides in the past 7 days', true);
  cron.schedule('30 7 * * 1', () => {
    trackJobExecution('ClockBot Force Clock Weekly Report', async () => {
      const { forceClockPdfService } = await import('./bots/forceClockPdfService');
      await forceClockPdfService.runWeeklyReport();
    });
  });

  log.info('[ShiftRoomBots] ReportBot cron jobs registered (hourly check-in + end-of-shift + overnight intel brief + 12h clock-out + weekly force clock report)');

  // ── COLLECTIONS: Daily outreach to clients in active collections pipeline — 9 AM
  registerJobInfo('Client Collections Outreach', CRON.collectionsOutreach, 'Automated collections emails for deactivated clients with outstanding balances', true);
  cron.schedule(CRON.collectionsOutreach, () => {
    trackJobExecution('Client Collections Outreach', async () => {
      const { runDailyCollectionsCron } = await import('./clientCollectionsService');
      await runDailyCollectionsCron();
      emitAutomationEvent({
        jobName: 'Client Collections Outreach',
        category: 'billing',
        success: true,
        recordsProcessed: 0,
        details: { message: 'Collections outreach run complete' },
      });
    });
  });
  log.info('Client Collections Outreach cron registered', { schedule: CRON.collectionsOutreach });

  // ════════════════════════════════════════════════════════════════════════════
  // Phase 20 — Trinity autonomous workflow crons
  // ════════════════════════════════════════════════════════════════════════════

  // Missed clock-in sweep — every 5 minutes. For each shift started >15 min ago
  // without a clock-in, Trinity texts the officer, then calls, then escalates
  // to a supervisor. State machine lives in the workflow audit row's metadata.
  registerJobInfo(
    'Trinity Missed Clock-In Sweep',
    '*/5 * * * *',
    'Detects officers who haven\'t clocked in and runs Trinity\'s welfare-check cascade',
    true,
  );
  cron.schedule('*/5 * * * *', () => {
    trackJobExecution('Trinity Missed Clock-In Sweep', async () => {
      const { runMissedClockInSweep } = await import('./trinity/workflows/missedClockInWorkflow');
      const result = await runMissedClockInSweep();
      emitAutomationEvent({
        jobName: 'Trinity Missed Clock-In Sweep',
        category: 'scheduling',
        success: result.errors.length === 0,
        recordsProcessed: result.scanned,
        details: result as any,
      });
    });
  });
  log.info('Trinity Missed Clock-In Sweep registered', { schedule: '*/5 * * * *' });

  // Stale calloff escalation — every 5 minutes. Finds calloff workflows past
  // their 15-minute SLA and fires the escalation path.
  registerJobInfo(
    'Trinity Stale Calloff Escalation',
    '*/5 * * * *',
    'Escalates calloff workflows that remain unfilled past the 15-minute SLA',
    true,
  );
  cron.schedule('*/5 * * * *', () => {
    trackJobExecution('Trinity Stale Calloff Escalation', async () => {
      const { scanStaleCalloffWorkflows } = await import('./trinity/workflows/calloffCoverageWorkflow');
      const result = await scanStaleCalloffWorkflows();
      emitAutomationEvent({
        jobName: 'Trinity Stale Calloff Escalation',
        category: 'scheduling',
        success: true,
        recordsProcessed: result.scanned,
        details: result as any,
      });
    });
  });
  log.info('Trinity Stale Calloff Escalation registered', { schedule: '*/5 * * * *' });

  // Trinity shift reminders — every 5 minutes. 4h and 1h reminder buckets
  // (idempotent via shift-reminder audit rows).
  registerJobInfo(
    'Trinity Shift Reminders',
    '*/5 * * * *',
    'Sends 4-hour and 1-hour shift reminder SMS; CALLOFF-enabled replies',
    true,
  );
  cron.schedule('*/5 * * * *', () => {
    trackJobExecution('Trinity Shift Reminders', async () => {
      const { runShiftReminderSweep } = await import('./trinity/workflows/shiftReminderWorkflow');
      const result = await runShiftReminderSweep();
      emitAutomationEvent({
        jobName: 'Trinity Shift Reminders',
        category: 'notification',
        success: result.errors.length === 0,
        recordsProcessed: result.fourHourSent + result.oneHourSent,
        details: result as any,
      });
    });
  });
  log.info('Trinity Shift Reminders registered', { schedule: '*/5 * * * *' });

  // Trinity compliance expiry monitor — daily at 6 AM. Tiered notifications
  // at 30/15/7/1d + expired.
  registerJobInfo(
    'Trinity Compliance Expiry Monitor',
    '0 6 * * *',
    'Daily cert / license / insurance expiry scan with tiered notifications',
    true,
  );
  cron.schedule('0 6 * * *', () => {
    trackJobExecution('Trinity Compliance Expiry Monitor', async () => {
      const { runComplianceMonitorWorkflow } = await import('./trinity/workflows/complianceMonitorWorkflow');
      const result = await runComplianceMonitorWorkflow();
      emitAutomationEvent({
        jobName: 'Trinity Compliance Expiry Monitor',
        category: 'compliance',
        success: result.errors.length === 0,
        recordsProcessed: result.notified,
        details: result as any,
      });
    });
  });
  log.info('Trinity Compliance Expiry Monitor registered', { schedule: '0 6 * * *' });

  // Annual 1099 contractor scan — runs Jan 1 at 6 AM.
  // Flags prior-year contractors who exceeded $600 with a filing-deadline
  // reminder to the org owner. Filing deadline: Jan 31.
  registerJobInfo(
    '1099 January Contractor Scan',
    '0 6 1 1 *',
    'Annual scan of prior-year contractor payroll for 1099-NEC filing candidates',
    true,
  );
  cron.schedule('0 6 1 1 *', () => {
    trackJobExecution('1099 January Contractor Scan', async () => {
      const { run1099JanuaryScan } = await import('./billing/contractorTaxAutomationService');
      const priorYear = new Date().getFullYear() - 1;
      const result = await run1099JanuaryScan(priorYear);
      emitAutomationEvent({
        jobName: '1099 January Contractor Scan',
        category: 'payroll',
        success: true,
        recordsProcessed: result.flagged,
        details: result as any,
      });
    });
  });
  log.info('1099 January Contractor Scan registered', { schedule: '0 6 1 1 *' });

  // Trinity tax deadline monitor — daily at 7 AM. Alerts org owners at
  // 30/14/7/1 days before federal filing deadlines (W-2, 1099-NEC, 941, 940).
  registerJobInfo(
    'Trinity Tax Deadline Monitor',
    '0 7 * * *',
    'Daily tax filing deadline alerts (30/14/7/1 day warnings to owners)',
    true,
  );
  cron.schedule('0 7 * * *', () => {
    trackJobExecution('Trinity Tax Deadline Monitor', async () => {
      const { runTaxDeadlineMonitor } = await import('./trinity/workflows/taxDeadlineMonitor');
      const result = await runTaxDeadlineMonitor();
      emitAutomationEvent({
        jobName: 'Trinity Tax Deadline Monitor',
        category: 'compliance',
        success: result.errors.length === 0,
        recordsProcessed: result.notified,
        details: result as any,
      });
    });
  });
  log.info('Trinity Tax Deadline Monitor registered', { schedule: '0 7 * * *' });

  // Trinity payroll anomaly scan — hourly while approvals are possible. Scans
  // pending runs; each gets a severity-graded response.
  registerJobInfo(
    'Trinity Payroll Anomaly Scan',
    '0 * * * *',
    'Hourly anomaly scan across pending payroll runs; flags/blocks per severity',
    true,
  );
  cron.schedule('0 * * * *', () => {
    trackJobExecution('Trinity Payroll Anomaly Scan', async () => {
      const { runPayrollAnomalyScan } = await import('./trinity/workflows/payrollAnomalyWorkflow');
      const result = await runPayrollAnomalyScan();
      emitAutomationEvent({
        jobName: 'Trinity Payroll Anomaly Scan',
        category: 'payroll',
        success: result.errors.length === 0,
        recordsProcessed: result.scanned,
        details: result as any,
      });
    });
  });
  log.info('Trinity Payroll Anomaly Scan registered', { schedule: '0 * * * *' });

  // ════════════════════════════════════════════════════════════════════════════
  // Phase 24 — Trinity Proactive Intelligence monitors
  // ════════════════════════════════════════════════════════════════════════════
  // Five proactive monitors (pre-shift intel, revenue-at-risk, officer wellness,
  // anomaly watch, weekly brief) are registered in one shot by the orchestrator
  // so their cron schedules live alongside the existing Phase 20 workflows and
  // feed the same job-history tracking surface. Load via dynamic import to keep
  // the scheduler's module-load cost unchanged.
  (async () => {
    try {
      const { registerProactiveMonitors } = await import('./trinity/proactive/proactiveOrchestrator');
      registerProactiveMonitors({ registerJobInfo, trackJobExecution });
      log.info('Trinity Phase 24 proactive monitors registered');
    } catch (err: any) {
      log.error('Failed to register Phase 24 proactive monitors', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();

  // ══════════════════════════════════════════════════════════════════════
  // TRINITY ANNUAL LEGAL KNOWLEDGE REVIEW
  // Every January 1st at 06:00, Trinity re-verifies every regulatory rule
  // older than 365 days against its authoritative source URL. Stale rules
  // get refreshed in place; ones that no longer return a match are flagged
  // in logs for human review. The chat path never depends on this cron.
  // ══════════════════════════════════════════════════════════════════════
  registerJobInfo(
    'Trinity Annual Legal Knowledge Review',
    '0 6 1 1 *',
    'Re-verify all regulatory_rules against source URLs; update stale entries',
    true,
  );
  cron.schedule('0 6 1 1 *', () => {
    trackJobExecution('Trinity Annual Legal Knowledge Review', async () => {
      const { trinityLegalResearch } = await import('./ai-brain/trinityLegalResearch');
      const { lt } = await import('drizzle-orm');
      const { regulatoryRules } = await import('@shared/schema');
      const staleCutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .substring(0, 10);

      const stale = await db.select()
        .from(regulatoryRules)
        .where(lt(regulatoryRules.lastVerified, staleCutoff));

      let updated = 0;
      for (const rule of stale) {
        const result = await trinityLegalResearch.researchAndLearn({
          question: rule.ruleName,
          state: rule.state,
          category: rule.category,
          workspaceId: 'system',
        }).catch(() => ({ found: false }));
        if (result.found) updated++;
      }
      log.info(`[LegalReview] Updated ${updated}/${stale.length} stale regulatory rules`);
    });
  });

  // ── Audit Cure Period Heartbeat — AI Regulatory Audit Suite Phase 6 ──────────
  // Runs daily at 6:30 AM (after the Trinity Compliance Expiry Monitor at 6:00).
  // Scans all active audit_condition_timers, sends 3-strike reminders, and
  // auto-converts expired timers to FAIL with the default fine.
  registerJobInfo(
    'Audit Cure Period Heartbeat',
    '30 6 * * *',
    'Daily: scan PASS_WITH_CONDITIONS audit timers, send 7d/72h/24h reminders, auto-FAIL on expiry',
    true,
  );
  cron.schedule('30 6 * * *', () => {
    trackJobExecution('Audit Cure Period Heartbeat', async () => {
      const { runCureHeartbeat } = await import('./auditor/curePeriodTrackerService');
      const result = await runCureHeartbeat();
      return {
        processed:     result.processed,
        reminders7d:   result.reminders7d,
        reminders72h:  result.reminders72h,
        reminders24h:  result.reminders24h,
        autoFailed:    result.autoFailed,
      };
    });
  });
  log.info('Audit Cure Period Heartbeat registered', { schedule: '30 6 * * *' });

  isSchedulerRunning = true;

  log.info('Autonomous scheduler running successfully');
  
  } catch (error) {
    // Capture full diagnostic detail — the prior single-line log lost the stack
    // and caller line, which made the root cause undiagnosable from Railway logs.
    const errObj = error instanceof Error ? error : new Error(String(error));
    log.error('Critical error during scheduler initialization', {
      errorName: errObj.name,
      errorMessage: errObj.message,
      stack: errObj.stack,
      cause: (errObj as { cause?: unknown }).cause,
    });
    // Do not swallow: the scheduler owns dozens of cron jobs, and a half-initialized
    // scheduler is worse than a visible hard failure. Re-throw so startup surfaces it.
    throw errObj;
  }
}

/**
 * Manually trigger jobs for testing
 */
export const manualTriggers = {
  invoicing: runNightlyInvoiceGeneration,
  scheduling: runWeeklyScheduleGeneration,
  payroll: runAutomaticPayrollProcessing,
  cleanup: runIdempotencyKeyCleanup,
  roomAutoClose: runRoomAutoClose,
  wsConnectionCleanup: runWebSocketConnectionCleanup,
  compliance: checkExpiringCertifications,
  gamificationWeeklyReset: async () => {
    await gamificationService.resetWeeklyPoints();
    return { success: true, resetType: 'weekly', resetAt: new Date().toISOString() };
  },
  gamificationMonthlyReset: async () => {
    await gamificationService.resetMonthlyPoints();
    return { success: true, resetType: 'monthly', resetAt: new Date().toISOString() };
  },
  paymentReminders: runPaymentReminderCheck,
  shiftCompletionBridge: () => runShiftCompletionBridge(),
  shiftReminders: async () => { const { processShiftReminders } = await import('./shiftRemindersService'); return processShiftReminders(); },
  dailyDigest: async () => { const { runDailyDigestJob } = await import('./dailyDigestService'); return runDailyDigestJob(); },
  platformScan: async () => platformChangeMonitor.triggerManualScan(),
  databaseMaintenance: runAllMaintenanceJobs,
  notificationCleanup: async () => {
    const { cleanupAllUsersSystemNotifications } = await import('./notificationService');
    const cleaned = await cleanupAllUsersSystemNotifications(3);
    return { success: true, notificationsCleaned: cleaned };
  },
  engagementAlerts: async (workspaceId: string) => {
    const { checkEngagementAlertsForWorkspace } = await import('./engagementCalculations');
    return checkEngagementAlertsForWorkspace(workspaceId);
  },
  trinityProactiveScan: async () => {
    const { aiAnalyticsEngine } = await import('./ai-brain/aiAnalyticsEngine');
    const allWorkspaces = await db.select().from(workspaces).where(
      and(eq(workspaces.isSuspended, false), ne(workspaces.subscriptionStatus, 'cancelled'))
    );
    let totalInsights = 0;
    for (const ws of allWorkspaces) {
      try {
        const insights = await aiAnalyticsEngine.runProactiveScan(ws.id);
        totalInsights += insights.length;
      } catch (e) {
        log.warn('Trinity scan failed for workspace', { workspaceId: ws.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { workspacesScanned: allWorkspaces.length, insightsGenerated: totalInsights };
  },
  visualQaScan: async () => {
    const { visualQaSubagent } = await import('./ai-brain/subagents/visualQaSubagent');
    const scanBaseUrl = getAppBaseUrl();
    const pagesToScan = [
      { url: `${scanBaseUrl}/`, name: 'Landing Page' },
      { url: `${scanBaseUrl}/dashboard`, name: 'Dashboard' },
      { url: `${scanBaseUrl}/usage`, name: 'Usage Dashboard' },
    ];
    let totalFindings = 0;
    const results: Array<{ page: string; findings: number }> = [];
    for (const page of pagesToScan) {
      try {
        const result = await visualQaSubagent.runVisualCheck({
          url: page.url,
          workspaceId: PLATFORM_WORKSPACE_ID,
          triggerSource: 'manual',
          triggeredBy: 'admin',
        });
        totalFindings += result.findings.length;
        results.push({ page: page.name, findings: result.findings.length });
      } catch (e) {
        log.warn('VQA failed for page', { page: page.name, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { pagesScanned: pagesToScan.length, totalFindings, results };
  },
  weeklyPlatformAudit: async () => {
    return await weeklyPlatformAudit.runFullAudit();
  },
  aiOverageBilling: async () => {
    const { usageMeteringService } = await import('./billing/usageMetering');
    const { workspaces, billingAuditLog, invoices } = await import('@shared/schema');
    const { db } = await import('../db');
    const { eq, and } = await import('drizzle-orm');
    
    const activeWorkspaces = await db.select().from(workspaces).where(
      and(
        eq(workspaces.subscriptionStatus, 'active'),
        eq(workspaces.isSuspended, false),
        eq(workspaces.isFrozen, false)
      )
    );
    
    const weekEnd = new Date();
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 7);
    const weekPeriod = weekStart.toISOString().split('T')[0];
    
    let totalBilled = 0;
    let invoicesCreated = 0;
    let invoicesSkipped = 0;
    
    for (const workspace of activeWorkspaces) {
      const idempotencyKey = `ai-overage-${workspace.id}-${weekPeriod}`;
      
      // Idempotency check: skip if we already billed this workspace for this week
      const { sql: sqlRaw } = await import('drizzle-orm');
      const existing = await db.select({ id: billingAuditLog.id })
        .from(billingAuditLog)
        .where(and(
          eq(billingAuditLog.workspaceId, workspace.id),
          eq(billingAuditLog.eventType, 'manual_ai_overage_processed'),
          sqlRaw`metadata->>'idempotencyKey' = ${idempotencyKey}`,
        ))
        .limit(1)
        .catch(() => []);
      
      if (existing.length > 0) {
        invoicesSkipped++;
        continue;
      }
      
      const metrics = await usageMeteringService.getUsageMetrics(workspace.id, weekStart, weekEnd);
      
      if (metrics.totalCost > 0) {
        const [invoice] = await db.insert(invoices).values({
          workspaceId: workspace.id,
          clientId: workspace.id,
          invoiceNumber: `AI-MANUAL-${weekPeriod}-${workspace.id.substring(0, 8)}`,
          status: 'pending',
          subtotal: metrics.totalCost.toString(),
          total: metrics.totalCost.toString(),
          taxAmount: '0',
          notes: `AI Token Overage: ${metrics.totalUsage.toLocaleString()} tokens (${weekStart.toISOString()} - ${weekEnd.toISOString()})`,
        }).returning();
        
        await db.insert(billingAuditLog).values({
          workspaceId: workspace.id,
          eventType: 'manual_ai_overage_processed',
          eventCategory: 'billing',
          actorType: 'system',
          description: `Manual AI overage invoice: $${metrics.totalCost.toFixed(2)}`,
          relatedEntityType: 'invoice',
          relatedEntityId: invoice.id,
          metadata: { idempotencyKey },
        });
        
        invoicesCreated++;
        totalBilled += metrics.totalCost;
      }
    }
    
    return { workspacesProcessed: activeWorkspaces.length, invoicesCreated, invoicesSkipped, totalBilled };
  },
  payrollReadinessScan: async (workspaceId?: string) => {
    const { runPayrollReadinessScanAllWorkspaces, runPayrollReadinessScanForWorkspace } = await import('./automation/payrollReadinessScanner');
    if (workspaceId) {
      const report = await runPayrollReadinessScanForWorkspace(workspaceId);
      return { workspacesScanned: 1, totalFlagged: report.flaggedCount, totalCritical: report.criticalCount, reports: [report] };
    }
    return runPayrollReadinessScanAllWorkspaces();
  },
};
