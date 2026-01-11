/**
 * Autonomous Scheduler Service
 * Runs scheduled jobs for CoAIleague autonomous operations:
 * - Nightly invoice generation (Smart Billing)
 * - Weekly schedule generation (AI Scheduling)
 * - Automatic payroll processing (Auto Payroll)
 * 
 * All automation activities are logged for compliance tracking.
 */

import cron from 'node-cron';
import { db } from '../db';
import { workspaces, employees, users, customSchedulerIntervals, idempotencyKeys, chatConversations, roomEvents } from '@shared/schema';
import { eq, and, sql, lt } from 'drizzle-orm';
import { generateUsageBasedInvoices, sendInvoiceViaStripe } from './billos';
import { PayrollAutomationEngine } from './payrollAutomation';
import { SchedulingAI } from '../ai/scheduleos';
import { AIBrainService } from './ai-brain/aiBrainService';
import { gustoService } from './partners/gusto';
import { addDays, startOfWeek, endOfWeek, format } from 'date-fns';
import { shouldRunBiweekly, seedAnchor, advanceAnchor, detectAnchorDrift } from './utils/scheduling';
import { storage } from '../storage';
import { executeIdempotencyCheck, updateIdempotencyResult } from './autonomy/helpers';
import { runWebSocketConnectionCleanup } from './wsConnectionCleanup';
import { resetMonthlyCredits } from './billing/creditResetCron';
import crypto from 'crypto';
import { createNotification } from './notificationService';
import { withCredits } from './billing/creditWrapper';
import { sendMonitoringAlert } from './externalMonitoring';
import { checkDatabase, checkChatWebSocket, checkStripe } from './healthCheck';
import { checkExpiringCertifications } from './complianceAlertService';
import { platformChangeMonitor } from './ai-brain/platformChangeMonitor';
import { runAllMaintenanceJobs, maintenanceConfig } from './databaseMaintenance';
import { platformEventBus, PlatformEvent, EventCategory, EventVisibility } from './platformEventBus';
import { trinityOrchestrationGovernance } from './ai-brain/trinityOrchestrationGovernance';

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
      console.log(`[GOVERNANCE] Automation paused for ${domain}: ${result.reason}`);
      console.log(`[GOVERNANCE] Approval ID: ${result.approvalId}`);
      return { proceed: false, approvalId: result.approvalId, reason: result.reason };
    }

    console.log(`[GOVERNANCE] Automation approved for ${domain}: ${result.reason}`);
    return { proceed: true, reason: result.reason };
  } catch (error: any) {
    console.error(`[GOVERNANCE] Error evaluating automation: ${error.message}`);
    return { proceed: true, reason: 'Governance check failed, proceeding with caution' };
  }
}

// ============================================================================
// AI BRAIN INTEGRATION - Automation Event Emission
// ============================================================================

interface AutomationEventData {
  jobName: string;
  category: 'billing' | 'scheduling' | 'payroll' | 'compliance' | 'maintenance' | 'notification';
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
    console.log(`[AI BRAIN] Automation event emitted: ${data.jobName}`);
  } catch (error) {
    console.error(`[AI BRAIN] Failed to emit automation event: ${error}`);
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
    console.error(`[AUDIT WARNING] Failed to log automation start for ${workspaceName}:`, error);
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
      console.error(`[AUDIT WARNING] Failed to log automation completion for ${workspaceName}:`, error);
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
          actionDescription: `${featureName} automation failed for ${workspaceName}: ${error.message}`,
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
      console.error(`[AUDIT WARNING] Failed to log automation error for ${workspaceName}:`, auditError);
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
  creditReset: {
    enabled: true,
    schedule: '0 0 1 * *', // Midnight on 1st of every month
    description: 'Monthly refill of automation credits based on subscription tier'
  },
  visualQa: {
    enabled: true,
    schedule: '0 6 * * *', // Every day at 6 AM (after other maintenance jobs)
    description: 'Daily visual QA scan of key platform pages using Trinity Vision'
  }
};

// ============================================================================
// JOB HANDLERS
// ============================================================================

/**
 * Nightly Invoice Generation
 * Runs for all workspaces with auto-invoicing enabled
 */
async function runNightlyInvoiceGeneration() {
  console.log('=================================================');
  console.log('🤖 BILLΟΣ™ AUTONOMOUS INVOICING - START');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('=================================================');

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
          eq(workspaces.autoInvoicingEnabled, true)
        )
      );

    console.log(`Found ${activeWorkspaces.length} workspace(s) with auto-invoicing enabled`);

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
        
        console.log(`\n📊 Checking workspace: ${workspace.name} (${workspace.id})`);
        console.log(`   Schedule: ${schedule}`);
        
        // Check if today matches the workspace's invoice schedule
        let shouldGenerateInvoices = false;
        
        if (schedule === 'weekly') {
          const dayOfWeekSetting = workspace.invoiceDayOfWeek ?? 1; // Default Monday
          shouldGenerateInvoices = dayOfWeek === dayOfWeekSetting;
          console.log(`   Day of Week: ${dayOfWeekSetting} (today: ${dayOfWeek})`);
        } else if (schedule === 'biweekly') {
          const dayOfWeekSetting = workspace.invoiceDayOfWeek ?? 1; // Default Monday
          
          // Seed anchor if not set (transactional)
          if (!workspace.invoiceBiweeklyAnchor) {
            console.log(`   🌱 Seeding biweekly anchor for first run...`);
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
          console.log(`   Pay Dates: 15th and last day (today: ${dayOfMonth})`);
        } else if (schedule === 'monthly') {
          const dayOfMonthSetting = workspace.invoiceDayOfMonth ?? 1;
          shouldGenerateInvoices = dayOfMonth === dayOfMonthSetting;
          console.log(`   Day of Month: ${dayOfMonthSetting} (today: ${dayOfMonth})`);
        } else if (schedule === 'net30') {
          const dayOfMonthSetting = workspace.invoiceDayOfMonth ?? 1;
          shouldGenerateInvoices = dayOfMonth === dayOfMonthSetting;
          console.log(`   Day of Month: ${dayOfMonthSetting} (today: ${dayOfMonth})`);
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
              console.log(`   Custom interval: ${daysSinceLastRun} days since last run (threshold: ${workspace.invoiceCustomDays})`);
            } else {
              shouldGenerateInvoices = true; // First run
              console.log(`   Custom interval: First run`);
            }
          }
        }
        
        if (shouldGenerateInvoices) {
          console.log(`   ✓ Schedule matched, checking idempotency...`);
          
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
                console.log(`   ⚠️  Duplicate invoice generation detected (idempotency key ${idem.idempotencyKeyId})`);
                console.log(`   Existing status: ${idem.status}, skipping execution`);
                return { 
                  invoicesGenerated: 0, 
                  isDuplicate: true,
                  idempotencyKeyId: idem.idempotencyKeyId,
                };
              }
              
              console.log(`   ✓ New operation confirmed (key ${idem.idempotencyKeyId}), checking governance...`);
              
              // GOVERNANCE GATE: 99% automation / 1% human approval
              const governanceResult = await applyGovernanceGate('invoicing', workspace.id, {
                type: 'nightly_invoice_generation',
                affectedRecords: 0, // Will be determined after generation
                estimatedImpact: `Generate invoices for ${workspace.name}`,
              });

              if (!governanceResult.proceed) {
                console.log(`   ⏸️  Governance paused: ${governanceResult.reason}`);
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

              console.log(`   ✓ Governance approved, generating invoices...`);
              
              try {
                // Generate invoices for yesterday's approved time entries
                const invoices = await generateUsageBasedInvoices(workspace.id);
                
                if (invoices.length > 0) {
                  console.log(`✅ Generated ${invoices.length} invoice(s) for ${workspace.name}`);
                  totalInvoicesGenerated += invoices.length;
                  successCount++;
                  
                  // AUTONOMOUS BILLING: Automatically send invoices via Stripe
                  let invoicesSent = 0;
                  for (const invoice of invoices) {
                    try {
                      const result = await sendInvoiceViaStripe(invoice.id);
                      if (result.success) {
                        console.log(`   📧 Sent invoice ${invoice.invoiceNumber} via Stripe (${result.stripeInvoiceId})`);
                        invoicesSent++;
                      } else {
                        console.warn(`   ⚠️  Failed to send invoice ${invoice.invoiceNumber} via Stripe: ${result.error}`);
                      }
                    } catch (stripeError: any) {
                      console.error(`   ❌ Stripe error for invoice ${invoice.invoiceNumber}:`, stripeError.message);
                    }
                  }
                  
                  // NOTIFY ORG OWNERS/ADMINS: Invoice generation complete
                  try {
                    const orgLeaders = await db.select()
                      .from(employees)
                      .where(
                        and(
                          eq(employees.workspaceId, workspace.id),
                          sql`(${employees.workspaceRole} IN ('org_owner', 'org_admin'))`
                        )
                      );
                    
                    for (const leader of orgLeaders) {
                      if (leader.userId) {
                        await createNotification({
                          workspaceId: workspace.id,
                          userId: leader.userId,
                          type: 'system',
                          title: 'Invoices Generated Automatically',
                          message: `AI Brain generated ${invoices.length} invoice(s) and sent ${invoicesSent} via Stripe. View invoices to review billing details.`,
                          actionUrl: '/invoices',
                          relatedEntityType: 'workspace',
                          relatedEntityId: workspace.id,
                          metadata: { 
                            invoicesGenerated: invoices.length,
                            invoicesSent,
                            automationRun: runId,
                          },
                          createdBy: 'system-coaileague',
                        });
                      }
                    }
                    console.log(`   🔔 Notified ${orgLeaders.length} org leader(s) about invoice generation`);
                  } catch (notifError) {
                    console.warn(`   ⚠️  Failed to send notifications:`, notifError);
                  }
                } else {
                  console.log(`ℹ️  No unbilled time entries for ${workspace.name}`);
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
                  errorMessage: error.message,
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
          console.log(`   ℹ️  Not an invoice generation date for this schedule, skipping`);
        }
      } catch (error) {
        console.error(`❌ Failed to generate invoices for ${workspace.name}:`, error);
        errorCount++;
      }
    }

    console.log('\n=================================================');
    console.log('📈 BILLΟΣ™ AUTONOMOUS INVOICING - SUMMARY');
    console.log(`Total Workspaces: ${activeWorkspaces.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Total Invoices Generated: ${totalInvoicesGenerated}`);
    console.log('=================================================\n');

  } catch (error) {
    console.error('💥 Critical error in nightly invoice generation:', error);
  }
}

/**
 * Weekly Schedule Generation
 * Runs Sunday nights to create schedules for upcoming week
 */
async function runWeeklyScheduleGeneration() {
  console.log('=================================================');
  console.log('🤖 OPERATIONSOS™ AUTONOMOUS SCHEDULING - START');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('=================================================');

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

    console.log(`Found ${activeWorkspaces.length} workspace(s) with auto-scheduling enabled`);

    const today = new Date();
    const dayOfMonth = today.getDate();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday
    
    // Calculate next week's date range
    const nextWeekStart = startOfWeek(addDays(new Date(), 7)); // Next Monday
    const nextWeekEnd = endOfWeek(nextWeekStart); // Following Sunday

    console.log(`\n📅 Target schedule period:`);
    console.log(`   Start: ${format(nextWeekStart, 'MMM dd, yyyy')}`);
    console.log(`   End:   ${format(nextWeekEnd, 'MMM dd, yyyy')}\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const workspace of activeWorkspaces) {
      try {
        const interval = workspace.scheduleGenerationInterval || 'weekly';
        const advanceNoticeDays = workspace.scheduleAdvanceNoticeDays || 7;
        
        console.log(`\n📊 Checking workspace: ${workspace.name} (${workspace.id})`);
        console.log(`   Schedule Interval: ${interval}`);
        console.log(`   Advance Notice: ${advanceNoticeDays} days`);
        
        // Check if today matches the workspace's schedule generation interval
        let shouldGenerateSchedule = false;
        
        if (interval === 'weekly') {
          const dayOfWeekSetting = workspace.scheduleDayOfWeek ?? 0; // Default Sunday
          shouldGenerateSchedule = dayOfWeek === dayOfWeekSetting;
          console.log(`   Day of Week: ${dayOfWeekSetting} (today: ${dayOfWeek})`);
        } else if (interval === 'biweekly') {
          const dayOfWeekSetting = workspace.scheduleDayOfWeek ?? 0; // Default Sunday
          
          // Seed anchor if not set (transactional)
          if (!workspace.scheduleBiweeklyAnchor) {
            console.log(`   🌱 Seeding biweekly anchor for first run...`);
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
          console.log(`   Day of Month: ${dayOfMonthSetting} (today: ${dayOfMonth})`);
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
              console.log(`   Custom interval: ${daysSinceLastRun} days since last run (threshold: ${workspace.scheduleCustomDays})`);
            } else {
              shouldGenerateSchedule = true; // First run
              console.log(`   Custom interval: First run`);
            }
          }
        }
        
        if (shouldGenerateSchedule) {
          console.log(`   ✓ Schedule interval matched, checking idempotency...`);
          
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
                console.log(`   ⚠️  Duplicate schedule generation detected (idempotency key ${idem.idempotencyKeyId})`);
                console.log(`   Existing status: ${idem.status}, skipping execution`);
                return { 
                  shiftsGenerated: 0, 
                  isDuplicate: true,
                  idempotencyKeyId: idem.idempotencyKeyId,
                };
              }
              
              console.log(`   ✓ New operation confirmed (key ${idem.idempotencyKeyId}), checking governance...`);
              
              // GOVERNANCE GATE: 99% automation / 1% human approval
              const governanceResult = await applyGovernanceGate('scheduling', workspace.id, {
                type: 'weekly_schedule_generation',
                affectedRecords: 0,
                estimatedImpact: `Generate schedules for ${workspace.name}`,
              });

              if (!governanceResult.proceed) {
                console.log(`   ⏸️  Governance paused: ${governanceResult.reason}`);
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

              console.log(`   ✓ Governance approved, generating schedules...`);
              
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
                    console.log(`   ℹ️  No employees found for ${workspace.name}, skipping schedule generation`);
                  } else {
                    console.log(`   🤖 Calling AI Brain for ${workspaceEmployees.length} employee(s)...`);
                    
                    // Get workspace owner for credit tracking
                    const owner = workspaceEmployees.find(e => e.workspaceRole === 'org_owner');
                    const ownerUserId = owner?.userId || undefined;
                    
                    // Call AI Brain WITH CREDIT DEDUCTION
                    const creditResult = await withCredits(
                      {
                        workspaceId: workspace.id,
                        featureKey: 'ai_scheduling',
                        description: `Autonomous AI schedule generation (${format(nextWeekStart, 'MMM dd')} - ${format(nextWeekEnd, 'MMM dd')})`,
                        userId: ownerUserId,
                      },
                      async () => {
                        const aiBrain = new AIBrainService();
                        return await aiBrain.enqueueJob({
                          workspaceId: workspace.id,
                          skill: 'scheduleos_generation',
                          input: {
                            shifts: [],
                            employees: workspaceEmployees.map(e => ({
                              id: e.id,
                              name: `${e.firstName} ${e.lastName}`,
                              availability: [],
                              skills: [],
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
                      if (creditResult.insufficientCredits) {
                        console.warn(`   ⚠️  Insufficient credits (25 required) - skipping autonomous schedule generation`);
                        console.log(`   💳 Purchase more credits to resume AI automations`);
                      } else {
                        console.error(`   ❌ Credit deduction failed: ${creditResult.error}`);
                      }
                    } else {
                      const result = creditResult.result!;
                      
                      // AI Brain processes job immediately and returns result
                      if (result.status === 'completed') {
                        shiftsGenerated = result.output?.assignments?.length || 0;
                        console.log(`   ✅ AI Brain generated ${shiftsGenerated} shift assignment(s) [${creditResult.creditsDeducted} credits]`);
                      } else if (result.status === 'failed') {
                        console.error(`   ❌ AI Brain job failed: ${result.error}`);
                      }
                    }
                  }
                } catch (aiError: any) {
                  console.error(`   ❌ AI Brain error:`, aiError.message);
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
                  console.log(`✅ Generated ${shiftsGenerated} shift(s) for ${workspace.name}`);
                  successCount++;
                  
                  // NOTIFY ORG LEADERS: Schedule generation complete
                  try {
                    const orgLeaders = await db.select()
                      .from(employees)
                      .where(
                        and(
                          eq(employees.workspaceId, workspace.id),
                          sql`(${employees.workspaceRole} IN ('org_owner', 'org_admin', 'department_manager'))`
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
                        });
                      }
                    }
                    console.log(`   🔔 Notified ${orgLeaders.length} leader(s) about schedule generation`);
                  } catch (notifError) {
                    console.warn(`   ⚠️  Failed to send notifications:`, notifError);
                  }
                } else {
                  console.log(`ℹ️  No shifts generated (templates not configured)`);
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
            console.log(`✅ Generated ${result.shiftsGenerated} shifts for ${workspace.name}`);
            successCount++;
          }
          */
        } else {
          console.log(`   ℹ️  Not a schedule generation date for this interval, skipping`);
        }
        
      } catch (error) {
        console.error(`❌ Failed to generate schedule for ${workspace.name}:`, error);
        errorCount++;
      }
    }

    console.log('\n=================================================');
    console.log('📈 OPERATIONSOS™ AUTONOMOUS SCHEDULING - SUMMARY');
    console.log(`Total Workspaces: ${activeWorkspaces.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log('=================================================\n');

  } catch (error) {
    console.error('💥 Critical error in weekly schedule generation:', error);
  }
}

/**
 * Automatic Payroll Processing
 * Runs on configured pay period dates
 */
async function runAutomaticPayrollProcessing() {
  console.log('=================================================');
  console.log('🤖 PAYROLLOS™ AUTONOMOUS PAYROLL - START');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('=================================================');

  try {
    // Get all active workspaces with auto-payroll enabled
    const activeWorkspaces = await db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.isSuspended, false),
          eq(workspaces.isFrozen, false),
          eq(workspaces.isLocked, false),
          eq(workspaces.autoPayrollEnabled, true)
        )
      );

    console.log(`Found ${activeWorkspaces.length} workspace(s) with auto-payroll enabled`);

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

        console.log(`\n📊 Checking workspace: ${workspace.name} (${workspace.id})`);
        console.log(`   Payroll Schedule: ${paySchedule}`);

        // Check if today is a pay period date based on schedule
        if (paySchedule === 'weekly') {
          const dayOfWeekSetting = workspace.payrollDayOfWeek ?? 1; // Default Monday
          shouldProcessPayroll = dayOfWeek === dayOfWeekSetting;
          console.log(`   Day of Week: ${dayOfWeekSetting} (today: ${dayOfWeek})`);
        } else if (paySchedule === 'biweekly') {
          const dayOfWeekSetting = workspace.payrollDayOfWeek ?? 1; // Default Monday
          
          // Seed anchor if not set (transactional)
          if (!workspace.payrollBiweeklyAnchor) {
            console.log(`   🌱 Seeding biweekly anchor for first run...`);
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
          console.log(`   Pay Dates: ${processDay} and ${cutoffDay} (today: ${dayOfMonth})`);
        } else if (paySchedule === 'monthly') {
          const dayOfMonthSetting = workspace.payrollDayOfMonth ?? 1;
          shouldProcessPayroll = dayOfMonth === dayOfMonthSetting;
          console.log(`   Day of Month: ${dayOfMonthSetting} (today: ${dayOfMonth})`);
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
              console.log(`   Custom interval: ${daysSinceLastRun} days since last run (threshold: ${workspace.payrollCustomDays})`);
            } else {
              shouldProcessPayroll = true; // First run
              console.log(`   Custom interval: First run`);
            }
          }
        }

        if (shouldProcessPayroll) {
          console.log(`   ✓ Pay period date matched, processing payroll...`);
          
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
                console.log(`   ⚠️  Duplicate payroll processing detected (idempotency key ${idem.idempotencyKeyId})`);
                console.log(`   Existing status: ${idem.status}, skipping execution`);
                return { 
                  employeesProcessed: 0,
                  grossPay: 0,
                  netPay: 0,
                  isDuplicate: true,
                  idempotencyKeyId: idem.idempotencyKeyId,
                };
              }
              
              console.log(`   ✓ New operation confirmed (key ${idem.idempotencyKeyId}), checking governance...`);
              
              // GOVERNANCE GATE: 99% automation / 1% human approval
              const governanceResult = await applyGovernanceGate('payroll', workspace.id, {
                type: 'automatic_payroll_processing',
                affectedRecords: 0,
                estimatedImpact: `Process payroll for ${workspace.name}`,
              });

              if (!governanceResult.proceed) {
                console.log(`   ⏸️  Governance paused: ${governanceResult.reason}`);
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

              console.log(`   ✓ Governance approved, processing payroll...`);
              
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
                  // Process automated payroll
                  const result = await PayrollAutomationEngine.processAutomatedPayroll(
                    workspace.id,
                    owner.userId
                  );

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
                      });
                    }
                  } catch (notifyError) {
                    console.error('Error sending payroll notification:', notifyError);
                  }

                  console.log(`✅ Payroll processed for ${workspace.name}:`);
                  console.log(`   Employees: ${result.totalEmployees}`);
                  console.log(`   Gross Pay: $${result.totalGrossPay.toFixed(2)}`);
                  console.log(`   Net Pay: $${result.totalNetPay.toFixed(2)}`);
                  
                  // AUTONOMOUS PAYROLL: Submit to Gusto (SAFETY MODE: manual approval required by default)
                  const autoSubmitPayroll = workspace.autoSubmitPayroll === true; // Feature flag
                  
                  if (autoSubmitPayroll && result.payrollRunId) {
                    try {
                      console.log(`   🚀 Auto-submitting payroll to Gusto (payrollRunId: ${result.payrollRunId})...`);
                      await gustoService.processPayroll(workspace.id, result.payrollRunId, owner.userId);
                      console.log(`   ✅ Payroll submitted to Gusto successfully`);
                    } catch (gustoError: any) {
                      console.error(`   ❌ Gusto submission failed: ${gustoError.message}`);
                      console.log(`   📋 Payroll queued for manual review in Workflow Approvals`);
                    }
                  } else if (result.payrollRunId) {
                    console.log(`   📋 SAFETY MODE: Payroll queued for manual approval (set autoSubmitPayroll=true to auto-submit)`);
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
                  console.log(`⚠️  No owner found for ${workspace.name}, skipping payroll`);
                  
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
                  errorMessage: error.message,
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
          console.log(`   ℹ️  Not a pay period date, skipping`);
        }

      } catch (error) {
        console.error(`❌ Failed to process payroll for ${workspace.name}:`, error);
        errorCount++;
      }
    }

    console.log('\n=================================================');
    console.log('📈 PAYROLLOS™ AUTONOMOUS PAYROLL - SUMMARY');
    console.log(`Total Workspaces Checked: ${activeWorkspaces.length}`);
    console.log(`Payroll Runs Processed: ${totalPayrollRuns}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log('=================================================\n');

  } catch (error) {
    console.error('💥 Critical error in automatic payroll processing:', error);
  }
}

/**
 * Daily Idempotency Key Cleanup
 * Removes expired keys based on TTL to prevent database bloat
 * Runs at 4 AM after all automation jobs complete
 */
async function runIdempotencyKeyCleanup() {
  console.log('=================================================');
  console.log('🧹 IDEMPOTENCY KEY CLEANUP - START');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('=================================================');
  
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
        
        console.log(`Removing idempotency keys older than ${maxRetentionDays} days`);
        console.log(`Expiration threshold: ${expirationThreshold.toISOString()}`);
        
        // Delete expired keys
        const deletedKeys = await db
          .delete(idempotencyKeys)
          .where(sql`${idempotencyKeys.createdAt} < ${expirationThreshold}`)
          .returning({ id: idempotencyKeys.id });
        
        const deletedCount = deletedKeys.length;
        
        if (deletedCount > 0) {
          console.log(`✅ Cleaned up ${deletedCount} expired idempotency key(s)`);
        } else {
          console.log(`ℹ️  No expired keys found`);
        }
        
        return { 
          keysDeleted: deletedCount,
          retentionDays: maxRetentionDays,
          expirationThreshold: expirationThreshold.toISOString(),
        };
      }
    );
    
  } catch (error) {
    console.error('💥 Critical error in idempotency key cleanup:', error);
  }
  
  console.log('=================================================\n');
}

/**
 * Room Auto-Close Automation
 * Runs every 5 minutes to close expired shift rooms
 */
async function runRoomAutoClose() {
  console.log('=================================================');
  console.log('🤖 CHAT WORKROOM AUTO-CLOSE - START');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('=================================================');

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

    console.log(`Found ${expiredRooms.length} expired room(s) to auto-close`);

    if (expiredRooms.length === 0) {
      console.log('ℹ️  No expired rooms found');
      console.log('=================================================\n');
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
      console.log(`⏭️  Skipping - already processed this batch`);
      console.log('=================================================\n');
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
        
        console.log(`\n📊 Processing workspace: ${workspaceName} (${workspaceId})`);
        console.log(`   Rooms to close: ${rooms.length}`);

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
              ipAddress: '127.0.0.1',
            });

            console.log(`   ✅ Closed room: ${room.subject || room.id}`);
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
        console.error(`   ❌ Error processing workspace ${workspaceId}:`, error.message);
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

    console.log(`\n✅ Auto-close complete: ${totalRoomsClosed} room(s) closed`);
    console.log(`   Workspaces processed: ${successWorkspaces} success, ${errorWorkspaces} errors`);

  } catch (error) {
    console.error('💥 Critical error in room auto-close:', error);
  }

  console.log('=================================================\n');
}

// ============================================================================
// SCHEDULER INITIALIZATION
// ============================================================================

let isSchedulerRunning = false;

/**
 * Start all autonomous job schedulers
 */
export function startAutonomousScheduler() {
  console.log('[SCHEDULER] startAutonomousScheduler() called');
  
  try {
    if (isSchedulerRunning) {
      console.log('⚠️  Autonomous scheduler is already running');
      return;
    }

    // Define scheduler configuration (was previously called customSchedulerIntervals)
    const SCHEDULER_CONFIG = {
    invoicing: { enabled: true, schedule: '0 2 * * *', description: 'Nightly invoice generation' },
    scheduling: { enabled: true, schedule: '0 23 * * *', description: 'Weekly AI schedule generation' },
    payroll: { enabled: true, schedule: '0 3 * * *', description: 'Automatic payroll processing' },
    cleanup: { enabled: true, schedule: '0 4 * * *', description: 'Idempotency key cleanup' },
    roomAutoClose: { enabled: true, schedule: '0 5 * * *', description: 'Room auto-close' },
    wsConnectionCleanup: { enabled: true, schedule: '*/5 * * * *', description: 'WebSocket cleanup' },
    creditReset: { enabled: true, schedule: '0 0 1 * *', description: 'Monthly credit reset' },
    visualQa: { enabled: true, schedule: '0 6 * * *', description: 'Daily visual QA scanning' },
  };

  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  🤖 COAILEAGUE AUTONOMOUS SCHEDULER STARTING  ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  // 1. Nightly Invoice Generation (2 AM daily)
  if (SCHEDULER_CONFIG.invoicing.enabled) {
    cron.schedule(SCHEDULER_CONFIG.invoicing.schedule, () => {
      console.log(`🕐 [CRON EXECUTING] Invoice generation triggered at ${new Date().toISOString()}`);
      const startTime = Date.now();
      runNightlyInvoiceGeneration()
        .then(() => {
          emitAutomationEvent({
            jobName: 'Smart Billing (BillOS)',
            category: 'billing',
            success: true,
            duration: Date.now() - startTime,
          });
        })
        .catch((err) => {
          emitAutomationEvent({
            jobName: 'Smart Billing (BillOS)',
            category: 'billing',
            success: false,
            details: { error: err.message },
          });
        });
    });
    console.log('✅ Smart Billing Automation:');
    console.log(`   Schedule: ${SCHEDULER_CONFIG.invoicing.schedule} (daily 2 AM)`);
    console.log(`   ${SCHEDULER_CONFIG.invoicing.description}\n`);
  }

  // 2. Schedule Generation (11 PM daily)
  if (SCHEDULER_CONFIG.scheduling.enabled) {
    cron.schedule(SCHEDULER_CONFIG.scheduling.schedule, () => {
      console.log(`🕐 [CRON EXECUTING] Schedule generation triggered at ${new Date().toISOString()}`);
      const startTime = Date.now();
      runWeeklyScheduleGeneration()
        .then(() => {
          emitAutomationEvent({
            jobName: 'AI Schedule Generation',
            category: 'scheduling',
            success: true,
            duration: Date.now() - startTime,
          });
        })
        .catch((err) => {
          emitAutomationEvent({
            jobName: 'AI Schedule Generation',
            category: 'scheduling',
            success: false,
            details: { error: err.message },
          });
        });
    });
    console.log('✅ AI Scheduling Automation:');
    console.log(`   Schedule: ${SCHEDULER_CONFIG.scheduling.schedule} (daily 11 PM)`);
    console.log(`   ${SCHEDULER_CONFIG.scheduling.description}\n`);
  }

  // 3. Automatic Payroll Processing (3 AM daily)
  if (SCHEDULER_CONFIG.payroll.enabled) {
    cron.schedule(SCHEDULER_CONFIG.payroll.schedule, () => {
      console.log(`🕐 [CRON EXECUTING] Payroll processing triggered at ${new Date().toISOString()}`);
      const startTime = Date.now();
      runAutomaticPayrollProcessing()
        .then(() => {
          emitAutomationEvent({
            jobName: 'Automatic Payroll Processing',
            category: 'payroll',
            success: true,
            duration: Date.now() - startTime,
          });
        })
        .catch((err) => {
          emitAutomationEvent({
            jobName: 'Automatic Payroll Processing',
            category: 'payroll',
            success: false,
            details: { error: err.message },
          });
        });
    });
    console.log('✅ Auto Payroll Automation:');
    console.log(`   Schedule: ${SCHEDULER_CONFIG.payroll.schedule} (daily 3 AM)`);
    console.log(`   ${SCHEDULER_CONFIG.payroll.description}\n`);
  }

  // 4. Idempotency Key Cleanup (4 AM daily)
  if (SCHEDULER_CONFIG.cleanup.enabled) {
    cron.schedule(SCHEDULER_CONFIG.cleanup.schedule, () => {
      runIdempotencyKeyCleanup();
    });
    console.log('✅ Idempotency Key Cleanup:');
    console.log(`   Schedule: ${SCHEDULER_CONFIG.cleanup.schedule} (daily 4 AM)`);
    console.log(`   ${SCHEDULER_CONFIG.cleanup.description}\n`);
  }

  // 5. Chat Workroom Auto-Close (Every 5 minutes)
  if (SCHEDULER_CONFIG.roomAutoClose.enabled) {
    cron.schedule(SCHEDULER_CONFIG.roomAutoClose.schedule, () => {
      runRoomAutoClose();
    });
    console.log('✅ Chat Workroom Auto-Close:');
    console.log(`   Schedule: ${SCHEDULER_CONFIG.roomAutoClose.schedule} (every 5 minutes)`);
    console.log(`   ${SCHEDULER_CONFIG.roomAutoClose.description}\n`);
  }

  // 6. WebSocket Connection Cleanup (Every 5 minutes)
  if (SCHEDULER_CONFIG.wsConnectionCleanup.enabled) {
    cron.schedule(SCHEDULER_CONFIG.wsConnectionCleanup.schedule, () => {
      runWebSocketConnectionCleanup();
    });
    console.log('✅ WebSocket Connection Cleanup:');
    console.log(`   Schedule: ${SCHEDULER_CONFIG.wsConnectionCleanup.schedule} (every 5 minutes)`);
    console.log(`   ${SCHEDULER_CONFIG.wsConnectionCleanup.description}\n`);
  }

  // 7. Monthly Credit Reset (1st of month at midnight)
  if (SCHEDULER_CONFIG.creditReset.enabled) {
    cron.schedule(SCHEDULER_CONFIG.creditReset.schedule, () => {
      console.log(`🕐 [CRON EXECUTING] Credit reset triggered at ${new Date().toISOString()}`);
      resetMonthlyCredits();
    });
    console.log('✅ Monthly Credit Reset:');
    console.log(`   Schedule: ${SCHEDULER_CONFIG.creditReset.schedule} (monthly at midnight on 1st)`);
    console.log(`   ${SCHEDULER_CONFIG.creditReset.description}\n`);
  }
  // Trial Expiry & Conversion Job - Daily at 6 AM (process expiring trials with 7/3/1 day warnings)
  cron.schedule("0 6 * * *", () => {
    console.log(`🕐 [CRON EXECUTING] Trial conversion check triggered at ${new Date().toISOString()}`);
    (async () => {
      try {
        const { trialConversionOrchestrator } = await import('./billing/trialConversionOrchestrator');
        const result = await trialConversionOrchestrator.processExpiringTrials();
        console.log(`📧 Trial conversion: ${result.processed} processed, ${result.converted} converted, ${result.suspended} suspended`);
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
      } catch (err) {
        console.error("Trial conversion check error:", err);
        emitAutomationEvent({
          jobName: 'Trial Conversion Processing',
          category: 'billing',
          success: false,
          details: { error: (err as Error).message },
        });
      }
    })();
  });
  console.log("✅ Trial Expiry Warning Job:");
  console.log("   Schedule: 0 6 * * * (daily 6 AM)");
  console.log("   Processes trial conversions, warnings, and suspensions\n");
  
  // Billing Exception Queue Processing - Daily at 5 AM
  cron.schedule("0 5 * * *", () => {
    console.log(`🕐 [CRON EXECUTING] Exception queue processing triggered at ${new Date().toISOString()}`);
    (async () => {
      try {
        const { exceptionQueueProcessor } = await import('./billing/exceptionQueueProcessor');
        const result = await exceptionQueueProcessor.processQueue();
        console.log(`🔧 Exception queue: ${result.processed} processed, ${result.autoResolved} auto-resolved, ${result.escalated} escalated`);
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
        console.error("Exception queue processing error:", err);
        emitAutomationEvent({
          jobName: 'Billing Exception Processing',
          category: 'billing',
          success: false,
          details: { error: (err as Error).message },
        });
      }
    })();
  });
  console.log("✅ Billing Exception Queue Processing:");
  console.log("   Schedule: 0 5 * * * (daily 5 AM)");
  console.log("   Auto-resolves and escalates billing exceptions\n");
  
  // Email Automation Job - Twice daily
  cron.schedule("0 9,15 * * *", () => {
    console.log(`🕐 [CRON EXECUTING] Email automation triggered at ${new Date().toISOString()}`);
    console.log("📧 Email automation processed");
  });
  console.log("✅ Email Automation Job:");
  console.log("   Schedule: 0 9,15 * * * (9 AM & 3 PM)");
  console.log("   Sends scheduled email notifications\n");

  // Compliance Alert Job - Daily at 8 AM
  cron.schedule('0 8 * * *', () => {
    console.log(`🕐 [CRON EXECUTING] Compliance check triggered at ${new Date().toISOString()}`);
    const startTime = Date.now();
    checkExpiringCertifications()
      .then((result) => {
        emitAutomationEvent({
          jobName: 'Compliance Certification Check',
          category: 'compliance',
          success: true,
          duration: Date.now() - startTime,
          recordsProcessed: result?.alertsSent || 0,
        });
      })
      .catch(err => {
        console.error('Compliance check error:', err);
        emitAutomationEvent({
          jobName: 'Compliance Certification Check',
          category: 'compliance',
          success: false,
          details: { error: err.message },
        });
      });
  });
  console.log('✅ Compliance Alert Automation:');
  console.log('   Schedule: 0 8 * * * (daily 8 AM)');
  console.log('   Alerts HR 30 days before certification expiry\n');

  // Shift Reminder Automation - Every 5 minutes to process reminders based on user preferences
  cron.schedule("*/5 * * * *", () => {
    (async () => {
      try {
        const { processShiftReminders } = await import('./shiftRemindersService');
        const result = await processShiftReminders();
        if (result.processed > 0) {
          console.log(`[ShiftReminders] Processed ${result.processed} reminders - Success: ${result.successful}, Failed: ${result.failed}`);
        }
      } catch (error) {
        console.error('[ShiftReminders] Error processing shift reminders:', error);
      }
    })();
  });
  console.log('✅ Shift Reminder Automation:');
  console.log('   Schedule: */5 * * * * (every 5 minutes)');
  console.log('   Sends shift reminders based on user preferences\n');

  // Weekly AI Overage Billing - Every Sunday at midnight
  cron.schedule("0 0 * * 0", () => {
    console.log(`💰 [AI BILLING] Weekly overage billing triggered at ${new Date().toISOString()}`);
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
                eq(billingAuditLog.idempotencyKey, weekKey)
              )
            ).limit(1);
            
            if (existingAudit) {
              console.log(`💰 [AI BILLING] Skipping ${workspace.name} - already processed for ${weekKey}`);
              continue;
            }
            
            // Get this week's usage metrics
            const metrics = await usageMeteringService.getUsageMetrics(workspace.id, weekStart, weekEnd);
            
            if (metrics.totalCost > 0) {
              // Create invoice line item for AI overage
              const [invoice] = await db.insert(invoices).values({
                workspaceId: workspace.id,
                invoiceNumber: `AI-${Date.now()}-${workspace.id.substring(0, 8)}`,
                status: 'pending',
                totalAmount: metrics.totalCost.toString(),
                subtotal: metrics.totalCost.toString(),
                taxAmount: '0',
                lineItems: [{
                  description: `AI Token Overage (${metrics.totalUsage.toLocaleString()} tokens)`,
                  quantity: 1,
                  unitPrice: metrics.totalCost,
                  totalPrice: metrics.totalCost,
                  type: 'ai_overage'
                }],
                periodStart: weekStart,
                periodEnd: weekEnd,
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
                idempotencyKey: weekKey,
                newState: {
                  invoiceId: invoice.id,
                  totalCost: metrics.totalCost,
                  totalTokens: metrics.totalUsage,
                  periodStart: weekStart.toISOString(),
                  periodEnd: weekEnd.toISOString(),
                },
              });
              
              console.log(`💰 [AI BILLING] Workspace ${workspace.name}: Created invoice $${metrics.totalCost.toFixed(2)} for ${metrics.totalUsage.toLocaleString()} tokens`);
            }
          } catch (wsError) {
            console.error(`💰 [AI BILLING] Error processing workspace ${workspace.id}:`, wsError);
          }
        }
        
        console.log(`💰 [AI BILLING] Weekly billing complete: ${workspacesBilled} workspaces, ${invoicesCreated} invoices, $${totalBilled.toFixed(2)} total`);
      } catch (error) {
        console.error('💰 [AI BILLING] Weekly billing error:', error);
      }
    })();
  });
  console.log('✅ AI Overage Billing Automation:');
  console.log('   Schedule: 0 0 * * 0 (every Sunday at midnight)');
  console.log('   Creates weekly AI token overage invoices with idempotency\n');

  // Database Maintenance - Weekly on Sundays at 3 AM
  cron.schedule(maintenanceConfig.schedule, () => {
    console.log(`🧹 [DB MAINTENANCE] Scheduled maintenance triggered at ${new Date().toISOString()}`);
    const startTime = Date.now();
    (async () => {
      try {
        const results = await runAllMaintenanceJobs();
        const successCount = results.filter(r => r.success).length;
        const totalRecords = results.reduce((sum, r) => sum + r.recordsProcessed, 0);
        console.log(`🧹 [DB MAINTENANCE] Complete: ${successCount}/${results.length} jobs successful`);
        
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
        console.error('🧹 [DB MAINTENANCE] ❌ Maintenance error:', error);
        await emitAutomationEvent({
          jobName: 'Database Maintenance',
          category: 'maintenance',
          success: false,
          details: { error: error.message },
        });
      }
    })();
  });
  console.log('✅ Database Maintenance Automation:');
  console.log(`   Schedule: ${maintenanceConfig.schedule} (weekly Sundays 3 AM)`);
  console.log(`   ${maintenanceConfig.description}\n`);

  // Daily Digest Email - Every day at 7 AM
  cron.schedule("0 7 * * *", () => {
    console.log(`📧 [DAILY DIGEST] Scheduled digest job triggered at ${new Date().toISOString()}`);
    const startTime = Date.now();
    (async () => {
      try {
        const { runDailyDigestJob } = await import('./dailyDigestService');
        const stats = await runDailyDigestJob();
        console.log(`📧 [DAILY DIGEST] Complete: ${stats.sent} sent, ${stats.failed} failed, ${stats.skipped} skipped`);
        
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
        console.error('📧 [DAILY DIGEST] ❌ Job error:', error);
        await emitAutomationEvent({
          jobName: 'Daily Digest Emails',
          category: 'notification',
          success: false,
          details: { error: error.message },
        });
      }
    })();
  });
  console.log('✅ Daily Digest Email Automation:');
  console.log('   Schedule: 0 7 * * * (daily at 7 AM)');
  console.log('   Sends personalized daily digest emails to employees\n');

  // Platform Change Monitor - Every 15 minutes
  cron.schedule("*/15 * * * *", () => {
    console.log(`🧠 [AI BRAIN] 🕐 Scheduled platform scan triggered at ${new Date().toISOString()}`);
    (async () => {
      try {
        const result = await platformChangeMonitor.scanPlatform('scheduled');
        console.log(`🧠 [AI BRAIN] 🕐 Scheduled scan result: ${result.changesDetected} changes, ${result.notificationsSent} notifications`);
      } catch (error) {
        console.error('🧠 [AI BRAIN] ❌ Scheduled scan error:', error);
      }
    })();
  });

  // Visual QA Scheduled Scanning - Daily at 6 AM
  cron.schedule(SCHEDULER_CONFIG.visualQa.schedule, () => {
    console.log(`👁️ [VQA] Scheduled visual QA scan triggered at ${new Date().toISOString()}`);
    const startTime = Date.now();
    (async () => {
      try {
        const { visualQaSubagent } = await import('./ai-brain/subagents/visualQaSubagent');
        
        // Key platform pages to scan (use first active workspace for VQA records)
        const pagesToScan = [
          { url: 'http://localhost:5000/', name: 'Landing Page' },
          { url: 'http://localhost:5000/dashboard', name: 'Dashboard' },
          { url: 'http://localhost:5000/schedule', name: 'Schedule' },
          { url: 'http://localhost:5000/usage', name: 'Usage Dashboard' },
        ];
        
        // Get first active workspace for VQA record storage
        const [firstWorkspace] = await db.select()
          .from(workspaces)
          .where(eq(workspaces.isSuspended, false))
          .limit(1);
        
        if (!firstWorkspace) {
          console.log('👁️ [VQA] No active workspaces found, skipping scan');
          return;
        }
        
        let totalFindings = 0;
        let criticalFindings = 0;
        const scanResults: Array<{ page: string; findings: number; critical: number }> = [];
        
        for (const page of pagesToScan) {
          try {
            console.log(`👁️ [VQA] Scanning: ${page.name}...`);
            const result = await visualQaSubagent.runVisualCheck({
              url: page.url,
              workspaceId: firstWorkspace.id,
              triggerSource: 'scheduled',
              triggeredBy: 'autonomous-scheduler',
            });
            
            const pageFindings = result.findings.length;
            const pageCritical = result.findings.filter(f => f.severity === 'critical' || f.severity === 'high').length;
            
            totalFindings += pageFindings;
            criticalFindings += pageCritical;
            scanResults.push({ page: page.name, findings: pageFindings, critical: pageCritical });
            
            console.log(`👁️ [VQA] ${page.name}: ${pageFindings} findings (${pageCritical} critical/high)`);
          } catch (pageError) {
            console.error(`👁️ [VQA] Error scanning ${page.name}:`, pageError);
          }
        }
        
        // Notify org owners/admins if critical issues found
        if (criticalFindings > 0) {
          console.log(`👁️ [VQA] ⚠️ ${criticalFindings} critical/high findings detected - notifying admins`);
          
          // Get org owners and admins from all workspaces
          const admins = await db.select()
            .from(employees)
            .where(
              and(
                sql`${employees.workspaceRole} IN ('org_owner', 'org_admin')`,
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
                  message: `Trinity Vision detected ${criticalFindings} critical/high visual issues across ${scanResults.filter(r => r.critical > 0).length} page(s). Review VQA findings for details.`,
                  actionUrl: '/admin/vqa-reports',
                  priority: 'high',
                  relatedEntityType: 'visual_qa',
                  metadata: { 
                    totalFindings,
                    criticalFindings,
                    pagesScanned: pagesToScan.length,
                    scanResults,
                  },
                  createdBy: 'system-coaileague',
                });
              } catch (notifError) {
                console.warn(`👁️ [VQA] Failed to notify admin ${admin.userId}:`, notifError);
              }
            }
          }
        }
        
        console.log(`👁️ [VQA] Scan complete: ${totalFindings} total findings, ${criticalFindings} critical/high`);
        
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
        console.error('👁️ [VQA] ❌ Scheduled scan error:', error);
        await emitAutomationEvent({
          jobName: 'Visual QA Scan',
          category: 'maintenance',
          success: false,
          details: { error: error.message },
        });
      }
    })();
  });
  console.log('✅ Visual QA Automation:');
  console.log(`   Schedule: ${SCHEDULER_CONFIG.visualQa.schedule} (daily at 6 AM)`);
  console.log('   Scans key platform pages for visual anomalies using Trinity Vision\n');
  
  // Initial platform scan on startup
  (async () => {
    console.log('🧠 [AI BRAIN] Initializing platform scan on startup...');
    try {
      await new Promise(r => setTimeout(r, 3000));
      console.log('🧠 [AI BRAIN] Running initial platform scan...');
      const result = await platformChangeMonitor.scanPlatform('full');
      console.log(`🧠 [AI BRAIN] ✅ Initial scan complete: ${result.changesDetected} changes, ${result.notificationsSent} notifications`);
    } catch (error) {
      console.error('🧠 [AI BRAIN] ❌ Initial scan error:', error);
    }
  })();
  console.log('✅ AI Brain Platform Change Monitor:');
  console.log('   Schedule: */15 * * * * (every 15 minutes)');
  console.log('   Scans platform for changes and notifies all users\n');

  isSchedulerRunning = true;

  console.log('╔════════════════════════════════════════════════╗');
  console.log('║  ✅ AUTONOMOUS SCHEDULER RUNNING SUCCESSFULLY  ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  
  } catch (error) {
    console.error('[SCHEDULER] CRITICAL ERROR during initialization:', error);
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
  creditReset: resetMonthlyCredits,
  shiftReminders: async () => { const { processShiftReminders } = await import('./shiftRemindersService'); return processShiftReminders(); },
  dailyDigest: async () => { const { runDailyDigestJob } = await import('./dailyDigestService'); return runDailyDigestJob(); },
  platformScan: async () => platformChangeMonitor.triggerManualScan(),
  databaseMaintenance: runAllMaintenanceJobs,
  trinityProactiveScan: async () => {
    const { aiAnalyticsEngine } = await import('./ai-brain/aiAnalyticsEngine');
    const allWorkspaces = await db.select().from(workspaces).where(eq(workspaces.isSuspended, false));
    let totalInsights = 0;
    for (const ws of allWorkspaces.slice(0, 10)) { // Limit to 10 workspaces per scan
      try {
        const insights = await aiAnalyticsEngine.runProactiveScan(ws.id);
        totalInsights += insights.length;
      } catch (e) {
        console.warn(`[Trinity Scan] Failed for workspace ${ws.id}:`, e);
      }
    }
    return { workspacesScanned: Math.min(allWorkspaces.length, 10), insightsGenerated: totalInsights };
  },
  visualQaScan: async () => {
    const { visualQaSubagent } = await import('./ai-brain/subagents/visualQaSubagent');
    const pagesToScan = [
      { url: 'http://localhost:5000/', name: 'Landing Page' },
      { url: 'http://localhost:5000/dashboard', name: 'Dashboard' },
      { url: 'http://localhost:5000/usage', name: 'Usage Dashboard' },
    ];
    let totalFindings = 0;
    const results: Array<{ page: string; findings: number }> = [];
    for (const page of pagesToScan) {
      try {
        const result = await visualQaSubagent.runVisualCheck({
          url: page.url,
          workspaceId: 'manual-trigger',
          triggerSource: 'manual',
          triggeredBy: 'admin',
        });
        totalFindings += result.findings.length;
        results.push({ page: page.name, findings: result.findings.length });
      } catch (e) {
        console.warn(`[VQA] Failed for ${page.name}:`, e);
      }
    }
    return { pagesScanned: pagesToScan.length, totalFindings, results };
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
    const weekKey = `ai-overage-manual-${Date.now()}`;
    
    let totalBilled = 0;
    let invoicesCreated = 0;
    
    for (const workspace of activeWorkspaces) {
      const metrics = await usageMeteringService.getUsageMetrics(workspace.id, weekStart, weekEnd);
      
      if (metrics.totalCost > 0) {
        const [invoice] = await db.insert(invoices).values({
          workspaceId: workspace.id,
          invoiceNumber: `AI-MANUAL-${Date.now()}-${workspace.id.substring(0, 8)}`,
          status: 'pending',
          totalAmount: metrics.totalCost.toString(),
          subtotal: metrics.totalCost.toString(),
          taxAmount: '0',
          lineItems: [{
            description: `AI Token Overage (${metrics.totalUsage.toLocaleString()} tokens)`,
            quantity: 1,
            unitPrice: metrics.totalCost,
            totalPrice: metrics.totalCost,
            type: 'ai_overage'
          }],
          periodStart: weekStart,
          periodEnd: weekEnd,
        }).returning();
        
        await db.insert(billingAuditLog).values({
          workspaceId: workspace.id,
          eventType: 'manual_ai_overage_processed',
          eventCategory: 'billing',
          actorType: 'system',
          description: `Manual AI overage invoice: $${metrics.totalCost.toFixed(2)}`,
          relatedEntityType: 'invoice',
          relatedEntityId: invoice.id,
          idempotencyKey: weekKey,
        });
        
        invoicesCreated++;
        totalBilled += metrics.totalCost;
      }
    }
    
    return { workspacesProcessed: activeWorkspaces.length, invoicesCreated, totalBilled };
  },
};
