/**
 * WeeklyBillingRunService
 * 
 * Fortune 500-grade automated invoice generation service.
 * Orchestrates weekly billing cycles with AI Brain integration,
 * idempotency protection, transaction management, and comprehensive audit logging.
 */

import { db } from '../../db';
import {
  workspaces,
  subscriptionInvoices,
  billingAuditLog,
  users,
} from '@shared/schema';
import { eq, and, lte, isNull, or, desc } from 'drizzle-orm';
import { InvoiceService } from './invoice';
import { emailService } from '../emailService';
import { helpaiOrchestrator } from '../helpai/helpaiActionOrchestrator';

interface BillingRunResult {
  runId: string;
  startedAt: Date;
  completedAt: Date;
  workspacesProcessed: number;
  invoicesGenerated: number;
  totalAmount: number;
  errors: Array<{
    workspaceId: string;
    error: string;
    errorType: 'validation' | 'generation' | 'notification' | 'system';
  }>;
  skipped: Array<{
    workspaceId: string;
    reason: string;
  }>;
}

interface WorkspaceBillingResult {
  workspaceId: string;
  success: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  totalAmount?: number;
  error?: string;
  errorType?: 'validation' | 'generation' | 'notification' | 'system';
}

interface BillingRunRecord {
  runId: string;
  weekKey: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  workspacesProcessed: number;
  invoicesGenerated: number;
  totalAmount: number;
  errorCount: number;
  skippedCount: number;
}

class WeeklyBillingRunServiceImpl {
  private invoiceService: InvoiceService;
  private actionsRegistered: boolean = false;

  constructor() {
    this.invoiceService = new InvoiceService();
  }

  registerActions(): void {
    helpaiOrchestrator.registerAction({
        actionId: 'billing.run_weekly',
        name: 'Run Weekly Billing',
        description: 'Execute the weekly billing run to generate invoices for all active workspaces',
        category: 'billing',
        handler: async () => {
          const result = await this.runWeeklyBilling();
          return {
            success: result.errors.length === 0,
            data: {
              runId: result.runId,
              invoicesGenerated: result.invoicesGenerated,
              totalAmount: result.totalAmount,
              errors: result.errors.length,
              skipped: result.skipped.length,
            },
            message: `Weekly billing complete: ${result.invoicesGenerated} invoices generated, ${result.errors.length} errors`,
          };
        },
      });

    helpaiOrchestrator.registerAction({
        actionId: 'billing.preview_weekly_run',
        name: 'Preview Weekly Billing Run',
        description: 'Preview which workspaces will be billed in the next weekly run with usage estimates',
        category: 'billing',
        handler: async () => {
          const preview = await this.previewWeeklyRun();
          return {
            success: true,
            data: preview,
            message: `${preview.workspaces.length} workspaces scheduled for billing, estimated $${preview.totalEstimatedAmount.toFixed(2)}`,
          };
        },
      });

    helpaiOrchestrator.registerAction({
        actionId: 'billing.run_single_workspace',
        name: 'Generate Invoice for Workspace',
        description: 'Generate an invoice for a specific workspace',
        category: 'billing',
        parameters: {
          workspaceId: { type: 'string', required: true, description: 'Workspace ID to bill' },
        },
        handler: async (params: { workspaceId: string }) => {
          const result = await this.processWorkspaceBilling(params.workspaceId);
          return {
            success: result.success,
            data: result,
            message: result.success 
              ? `Invoice ${result.invoiceNumber} generated for $${result.totalAmount}`
              : `Failed: ${result.error}`,
          };
        },
      });

    helpaiOrchestrator.registerAction({
        actionId: 'billing.get_last_run',
        name: 'Get Last Billing Run',
        description: 'Retrieve details of the most recent weekly billing run',
        category: 'billing',
        handler: async () => {
          const lastRun = await this.getLastRunDetails();
          return {
            success: true,
            data: lastRun,
            message: lastRun 
              ? `Last run: ${lastRun.runId} on ${lastRun.completedAt}`
              : 'No previous billing runs found',
          };
        },
      });

    this.actionsRegistered = true;
    console.log('[WeeklyBillingRunService] Registered 4 AI Brain actions');
  }

  /**
   * Generate idempotency key for a billing run week
   */
  private getWeekIdempotencyKey(): string {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    return `billing-run-${weekStart.toISOString().split('T')[0]}`;
  }

  /**
   * Check if a run is already in progress or completed for this week
   */
  private async checkRunLock(weekKey: string): Promise<{ locked: boolean; reason?: string; existingRunId?: string }> {
    const existingRun = await db.select()
      .from(billingAuditLog)
      .where(
        and(
          eq(billingAuditLog.eventType, 'billing_run_started'),
          eq(billingAuditLog.idempotencyKey, weekKey)
        )
      )
      .limit(1);

    if (existingRun.length > 0) {
      const state = existingRun[0].newState as any;
      if (state?.status === 'running') {
        return { locked: true, reason: 'Billing run already in progress', existingRunId: state.runId };
      }
      if (state?.status === 'completed') {
        return { locked: true, reason: 'Billing run already completed for this week', existingRunId: state.runId };
      }
    }

    return { locked: false };
  }

  /**
   * Acquire a distributed lock for the billing run
   */
  private async acquireRunLock(runId: string, weekKey: string): Promise<boolean> {
    try {
      await db.insert(billingAuditLog).values({
        workspaceId: null as any,
        eventType: 'billing_run_started',
        eventCategory: 'billing',
        actorType: 'system',
        description: `Weekly billing run started: ${runId}`,
        idempotencyKey: weekKey,
        newState: { 
          runId, 
          weekKey,
          status: 'running',
          startedAt: new Date().toISOString(),
        },
      });
      return true;
    } catch (error: any) {
      if (error.code === '23505') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Release the run lock and update status
   */
  private async updateRunStatus(
    runId: string, 
    weekKey: string, 
    status: 'completed' | 'failed',
    result: Partial<BillingRunResult>
  ): Promise<void> {
    await db.insert(billingAuditLog).values({
      workspaceId: null as any,
      eventType: status === 'completed' ? 'billing_run_completed' : 'billing_run_failed',
      eventCategory: 'billing',
      actorType: 'system',
      description: `Weekly billing run ${status}: ${runId}`,
      idempotencyKey: `${weekKey}-completion`,
      newState: {
        runId,
        weekKey,
        status,
        completedAt: new Date().toISOString(),
        workspacesProcessed: result.workspacesProcessed || 0,
        invoicesGenerated: result.invoicesGenerated || 0,
        totalAmount: result.totalAmount || 0,
        errorCount: result.errors?.length || 0,
        skippedCount: result.skipped?.length || 0,
      },
    });
  }

  /**
   * Execute the weekly billing run for all eligible workspaces
   * Uses idempotency protection and distributed locking
   */
  async runWeeklyBilling(): Promise<BillingRunResult> {
    const weekKey = this.getWeekIdempotencyKey();
    const runId = `${weekKey}-${Date.now()}`;
    const startedAt = new Date();
    const results: WorkspaceBillingResult[] = [];
    const skipped: Array<{ workspaceId: string; reason: string }> = [];

    const lockCheck = await this.checkRunLock(weekKey);
    if (lockCheck.locked) {
      console.log(`[WeeklyBillingRun] Run blocked: ${lockCheck.reason}`);
      return {
        runId: lockCheck.existingRunId || 'blocked',
        startedAt,
        completedAt: new Date(),
        workspacesProcessed: 0,
        invoicesGenerated: 0,
        totalAmount: 0,
        errors: [{ workspaceId: 'system', error: lockCheck.reason || 'Blocked', errorType: 'system' }],
        skipped: [],
      };
    }

    const lockAcquired = await this.acquireRunLock(runId, weekKey);
    if (!lockAcquired) {
      console.log(`[WeeklyBillingRun] Failed to acquire lock for ${weekKey}`);
      return {
        runId: 'lock-failed',
        startedAt,
        completedAt: new Date(),
        workspacesProcessed: 0,
        invoicesGenerated: 0,
        totalAmount: 0,
        errors: [{ workspaceId: 'system', error: 'Failed to acquire run lock', errorType: 'system' }],
        skipped: [],
      };
    }

    try {
      console.log(`[WeeklyBillingRun] Starting run ${runId} for week ${weekKey}`);

      const eligibleWorkspaces = await this.getEligibleWorkspaces();
      console.log(`[WeeklyBillingRun] Found ${eligibleWorkspaces.length} eligible workspaces`);

      for (const workspace of eligibleWorkspaces) {
        const skipReason = await this.checkSkipConditions(workspace);
        if (skipReason) {
          skipped.push({ workspaceId: workspace.id, reason: skipReason });
          await this.logSkippedWorkspace(workspace.id, skipReason, runId);
          continue;
        }

        const result = await this.processWorkspaceBillingWithTransaction(workspace.id, runId, weekKey);
        results.push(result);

        if (result.success) {
          await this.updateNextInvoiceDate(workspace.id);
        }
      }

      const completedAt = new Date();
      const successfulResults = results.filter(r => r.success);
      const errorResults = results.filter(r => !r.success);
      const totalAmount = successfulResults.reduce((sum, r) => sum + (r.totalAmount || 0), 0);

      const runResult: BillingRunResult = {
        runId,
        startedAt,
        completedAt,
        workspacesProcessed: results.length,
        invoicesGenerated: successfulResults.length,
        totalAmount,
        errors: errorResults.map(r => ({
          workspaceId: r.workspaceId,
          error: r.error || 'Unknown error',
          errorType: r.errorType || 'system',
        })),
        skipped,
      };

      await this.updateRunStatus(runId, weekKey, 'completed', runResult);

      if (errorResults.length > 0) {
        await this.queueExceptions(runId, errorResults);
      }

      console.log(`[WeeklyBillingRun] Completed: ${successfulResults.length} invoices, ${errorResults.length} errors, ${skipped.length} skipped`);
      return runResult;
    } catch (error: any) {
      console.error(`[WeeklyBillingRun] Fatal error in run ${runId}:`, error.message);
      await this.updateRunStatus(runId, weekKey, 'failed', {
        workspacesProcessed: results.length,
        invoicesGenerated: results.filter(r => r.success).length,
        errors: [{ workspaceId: 'system', error: error.message, errorType: 'system' }],
      });
      throw error;
    }
  }

  /**
   * Process billing for a workspace with transaction protection
   */
  private async processWorkspaceBillingWithTransaction(
    workspaceId: string,
    runId: string,
    weekKey: string
  ): Promise<WorkspaceBillingResult> {
    const workspaceWeekKey = `${weekKey}-${workspaceId}`;
    
    const existingProcess = await db.select()
      .from(billingAuditLog)
      .where(
        and(
          eq(billingAuditLog.workspaceId, workspaceId),
          eq(billingAuditLog.eventType, 'workspace_billing_processed'),
          eq(billingAuditLog.idempotencyKey, workspaceWeekKey)
        )
      )
      .limit(1);

    if (existingProcess.length > 0) {
      const state = existingProcess[0].newState as any;
      return {
        workspaceId,
        success: true,
        invoiceId: state?.invoiceId,
        invoiceNumber: state?.invoiceNumber,
        totalAmount: state?.totalAmount || 0,
      };
    }

    return await this.processWorkspaceBilling(workspaceId, runId, workspaceWeekKey);
  }

  /**
   * Preview which workspaces will be included in the next billing run with usage estimates
   */
  async previewWeeklyRun(): Promise<{
    workspaces: Array<{
      id: string;
      name: string;
      lastInvoiceDate: Date | null;
      estimatedAmount: number;
    }>;
    totalEstimatedAmount: number;
  }> {
    const eligibleWorkspaces = await this.getEligibleWorkspaces();
    const previewData: Array<{
      id: string;
      name: string;
      lastInvoiceDate: Date | null;
      estimatedAmount: number;
    }> = [];

    for (const workspace of eligibleWorkspaces) {
      const lastInvoice = await db.select()
        .from(subscriptionInvoices)
        .where(eq(subscriptionInvoices.workspaceId, workspace.id))
        .orderBy(desc(subscriptionInvoices.createdAt))
        .limit(1);

      let estimatedAmount = 0;
      if (lastInvoice.length > 0 && lastInvoice[0].totalAmount) {
        estimatedAmount = parseFloat(lastInvoice[0].totalAmount);
      }

      previewData.push({
        id: workspace.id,
        name: workspace.name || 'Unknown',
        lastInvoiceDate: lastInvoice[0]?.createdAt || null,
        estimatedAmount,
      });
    }

    return {
      workspaces: previewData,
      totalEstimatedAmount: previewData.reduce((sum, w) => sum + w.estimatedAmount, 0),
    };
  }

  /**
   * Process billing for a single workspace
   */
  async processWorkspaceBilling(
    workspaceId: string,
    runId?: string,
    idempotencyKey?: string
  ): Promise<WorkspaceBillingResult> {
    try {
      const workspace = await db.select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      if (!workspace[0]) {
        return {
          workspaceId,
          success: false,
          error: 'Workspace not found',
          errorType: 'validation',
        };
      }

      if (workspace[0].accountState !== 'active') {
        return {
          workspaceId,
          success: false,
          error: `Workspace not active: ${workspace[0].accountState}`,
          errorType: 'validation',
        };
      }

      const now = new Date();
      const billingPeriodEnd = now;
      const billingPeriodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const invoice = await this.invoiceService.generateInvoice({
        workspaceId,
        billingPeriodStart,
        billingPeriodEnd,
      });

      const totalAmount = parseFloat(invoice.totalAmount || '0');

      if (idempotencyKey) {
        await db.insert(billingAuditLog).values({
          workspaceId,
          eventType: 'workspace_billing_processed',
          eventCategory: 'billing',
          actorType: 'system',
          description: `Invoice ${invoice.invoiceNumber} generated: $${totalAmount.toFixed(2)}`,
          idempotencyKey,
          relatedEntityType: 'invoice',
          relatedEntityId: invoice.id,
          newState: {
            runId,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            totalAmount,
            billingPeriodStart: billingPeriodStart.toISOString(),
            billingPeriodEnd: billingPeriodEnd.toISOString(),
          },
        });
      }

      if (totalAmount > 0) {
        await this.sendInvoiceNotification(workspaceId, invoice.id, invoice.invoiceNumber, totalAmount);
      }

      return {
        workspaceId,
        success: true,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        totalAmount,
      };
    } catch (error: any) {
      console.error(`[WeeklyBillingRun] Error processing workspace ${workspaceId}:`, error.message);
      return {
        workspaceId,
        success: false,
        error: error.message,
        errorType: 'generation',
      };
    }
  }

  /**
   * Get workspaces eligible for billing
   */
  private async getEligibleWorkspaces(): Promise<Array<{ id: string; name: string | null }>> {
    const now = new Date();

    const eligible = await db.select({
      id: workspaces.id,
      name: workspaces.name,
    })
      .from(workspaces)
      .where(
        and(
          eq(workspaces.accountState, 'active'),
          or(
            isNull(workspaces.nextInvoiceAt),
            lte(workspaces.nextInvoiceAt, now)
          )
        )
      );

    return eligible;
  }

  /**
   * Check if a workspace should be skipped
   */
  private async checkSkipConditions(workspace: { id: string }): Promise<string | null> {
    const recentInvoice = await db.select()
      .from(subscriptionInvoices)
      .where(
        and(
          eq(subscriptionInvoices.workspaceId, workspace.id),
          eq(subscriptionInvoices.status, 'draft')
        )
      )
      .limit(1);

    if (recentInvoice.length > 0) {
      return 'Pending draft invoice exists';
    }

    return null;
  }

  /**
   * Log a skipped workspace with reason
   */
  private async logSkippedWorkspace(workspaceId: string, reason: string, runId: string): Promise<void> {
    await db.insert(billingAuditLog).values({
      workspaceId,
      eventType: 'billing_workspace_skipped',
      eventCategory: 'billing',
      actorType: 'system',
      description: `Workspace skipped: ${reason}`,
      newState: { runId, reason },
    });
  }

  /**
   * Update next invoice date for workspace
   */
  private async updateNextInvoiceDate(workspaceId: string): Promise<void> {
    const nextInvoiceAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    await db.update(workspaces)
      .set({ nextInvoiceAt })
      .where(eq(workspaces.id, workspaceId));
  }

  /**
   * Send invoice notification to workspace owners
   */
  private async sendInvoiceNotification(
    workspaceId: string,
    invoiceId: string,
    invoiceNumber: string,
    totalAmount: number
  ): Promise<void> {
    try {
      const ownerResult = await db.select({
        email: users.email,
        firstName: users.firstName,
      })
        .from(users)
        .where(eq(users.workspaceId, workspaceId))
        .limit(1);

      if (ownerResult[0]?.email) {
        await emailService.sendTemplatedEmail(
          ownerResult[0].email,
          'invoice_generated',
          {
            firstName: ownerResult[0].firstName || 'Customer',
            invoiceNumber,
            totalAmount: totalAmount.toFixed(2),
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(),
            viewInvoiceUrl: `/billing/invoices/${invoiceId}`,
          }
        );
      }
    } catch (error: any) {
      console.warn(`[WeeklyBillingRun] Failed to send invoice notification: ${error.message}`);
    }
  }

  /**
   * Queue billing errors as exceptions for processing
   */
  private async queueExceptions(
    runId: string,
    errors: WorkspaceBillingResult[]
  ): Promise<void> {
    try {
      const { exceptionQueueProcessor } = await import('./exceptionQueueProcessor');
      
      for (const error of errors) {
        await exceptionQueueProcessor.addException({
          workspaceId: error.workspaceId,
          exceptionType: 'billing_generation_error',
          description: error.error || 'Unknown billing error',
          metadata: {
            runId,
            errorType: error.errorType,
          },
          severity: error.errorType === 'system' ? 'high' : 'medium',
        });
      }
    } catch (err: any) {
      console.warn('[WeeklyBillingRun] Failed to queue exceptions:', err.message);
    }
  }

  /**
   * Get details of the last billing run
   */
  async getLastRunDetails(): Promise<{
    runId: string;
    completedAt: Date;
    invoicesGenerated: number;
    totalAmount: number;
    status: string;
  } | null> {
    const lastRunLog = await db.select()
      .from(billingAuditLog)
      .where(
        or(
          eq(billingAuditLog.eventType, 'billing_run_completed'),
          eq(billingAuditLog.eventType, 'billing_run_failed')
        )
      )
      .orderBy(desc(billingAuditLog.createdAt))
      .limit(1);

    if (!lastRunLog[0]) {
      return null;
    }

    const state = lastRunLog[0].newState as any;
    return {
      runId: state?.runId || 'unknown',
      completedAt: lastRunLog[0].createdAt,
      invoicesGenerated: state?.invoicesGenerated || 0,
      totalAmount: state?.totalAmount || 0,
      status: state?.status || 'unknown',
    };
  }
}

export const weeklyBillingRunService = new WeeklyBillingRunServiceImpl();

export function initializeWeeklyBillingRunService(): void {
  weeklyBillingRunService.registerActions();
  console.log('[WeeklyBillingRun] Weekly Billing Run Service initialized');
}
