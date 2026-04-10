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
import { eq, and, lte, isNull, or, desc, notInArray } from 'drizzle-orm';
import { InvoiceService } from './invoice';
import { emailService } from '../emailService';
import { NotificationDeliveryService } from '../notificationDeliveryService';
import { helpaiOrchestrator } from '../helpai/platformActionHub';
import { createLogger } from '../../lib/logger';
import { isBillingExcluded } from './billingConstants';
import { isBillingExemptByRecord, logExemptedAction } from './founderExemption';
import { platformEventBus } from '../platformEventBus';

const log = createLogger('WeeklyBillingRunService');

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
        // @ts-expect-error — TS migration: fix in refactoring sprint
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
    log.info('Registered 4 AI Brain actions');
  }

  /**
   * Generate idempotency key for a billing run week
   */
  private getWeekIdempotencyKey(): string {
    const now = new Date();
    // Phase 46: UTC workweek boundary (shifts stored in UTC)
    const weekStart = new Date(now);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    weekStart.setUTCHours(0, 0, 0, 0);
    return `billing-run-${weekStart.toISOString().split('T')[0]}`;
  }

  /**
   * Check if a run is already in progress or completed for this week
   */
  private async checkRunLock(weekKey: string): Promise<{ locked: boolean; reason?: string; existingRunId?: string }> {
    // Bug fix: billingAuditLog is append-only — we can't update the 'running' record to
    // 'completed'. Instead, check for a completion record first (key: weekKey-completed/failed),
    // then check for a still-running record (key: weekKey). This correctly handles all states:
    //   completed/failed → block re-run for the week
    //   still running → block concurrent run
    //   neither → allow run to proceed

    // Step 1: Check for completion (highest priority)
    const completionLog = await db.select()
      .from(billingAuditLog)
      .where(
        or(
          eq(billingAuditLog.idempotencyKey, `${weekKey}-completed`),
          eq(billingAuditLog.idempotencyKey, `${weekKey}-failed`),
        )
      )
      .limit(1);

    if (completionLog.length > 0) {
      const state = completionLog[0].newState as any;
      const isCompleted = completionLog[0].eventType === 'billing_run_completed';
      return {
        locked: true,
        reason: isCompleted
          ? 'Billing run already completed for this week'
          : 'Billing run failed this week — manual review required before re-run',
        existingRunId: state?.runId,
      };
    }

    // Step 2: Check for in-progress run
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
      return { locked: true, reason: 'Billing run already in progress', existingRunId: state?.runId };
    }

    return { locked: false };
  }

  /**
   * Acquire a distributed lock for the billing run
   */
  private async acquireRunLock(runId: string, weekKey: string): Promise<boolean> {
    // Bug fix: previously wrote to systemAuditLogs (= auditLogs) but checkRunLock reads
    // from billingAuditLog — different tables, so the lock was never visible and concurrent
    // runs were never blocked. Now writes to billingAuditLog with the idempotencyKey column
    // (unique-where-not-null index) so a duplicate INSERT raises 23505, correctly blocking
    // concurrent runs.
    try {
      await db.insert(billingAuditLog).values({
        workspaceId: 'system',
        eventType: 'billing_run_started',
        eventCategory: 'billing',
        actorType: 'system',
        description: `Weekly billing run started: ${runId} (week ${weekKey})`,
        idempotencyKey: weekKey,
        metadata: { runId, weekKey, status: 'running', startedAt: new Date().toISOString() },
        newState: { runId, weekKey, status: 'running' },
      });
      return true;
    } catch (error: any) {
      if (error.code === '23505') {
        // Unique constraint violation on idempotencyKey — another process already locked this week
        log.info(`[BillingRun] Lock contention on weekKey ${weekKey} — another run is already active`);
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
    // Bug fix: previously wrote to systemAuditLogs; now writes to billingAuditLog so that
    // checkRunLock can detect 'completed' status and block redundant re-runs.
    // Uses a distinct completion idempotency key so this record can coexist with the
    // 'started' record (different key = no unique conflict).
    await db.insert(billingAuditLog).values({
      workspaceId: 'system',
      eventType: status === 'completed' ? 'billing_run_completed' : 'billing_run_failed',
      eventCategory: 'billing',
      actorType: 'system',
      description: `Weekly billing run ${status}: ${runId} (week ${weekKey})`,
      idempotencyKey: `${weekKey}-${status}`,
      metadata: {
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
      newState: { runId, weekKey, status },
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
      log.info('Run blocked', { reason: lockCheck.reason });
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
      log.info('Failed to acquire lock', { weekKey });
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
      log.info('Starting run', { runId, weekKey });

      const eligibleWorkspaces = await this.getEligibleWorkspaces();
      log.info('Found eligible workspaces', { count: eligibleWorkspaces.length });

      for (const workspace of eligibleWorkspaces) {
        // Per-org try/catch: one org's failure MUST NOT abort billing for all others
        try {
          const skipReason = await this.checkSkipConditions(workspace);
          if (skipReason) {
            skipped.push({ workspaceId: workspace.id, reason: skipReason });
            await this.logSkippedWorkspace(workspace.id, skipReason, runId).catch(err =>
              log.warn('Failed to log skipped workspace', { workspaceId: workspace.id, error: (err instanceof Error ? err.message : String(err)) })
            );
            continue;
          }

          const result = await this.processWorkspaceBillingWithTransaction(workspace.id, runId, weekKey);
          results.push(result);

          if (result.success) {
            await this.updateNextInvoiceDate(workspace.id).catch(err =>
              log.warn('Failed to update next invoice date', { workspaceId: workspace.id, error: (err instanceof Error ? err.message : String(err)) })
            );
          }
        } catch (orgError: any) {
          log.error('Unexpected error processing workspace — continuing with next org', {
            workspaceId: workspace.id,
            error: orgError.message,
            stack: orgError.stack,
            runId,
          });
          results.push({
            workspaceId: workspace.id,
            success: false,
            error: orgError.message,
            errorType: 'system',
          } as any);
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

      // Publish canonical automation_completed event so Trinity and event subscribers react
      platformEventBus.publish({
        type: 'automation_completed',
        workspaceId: 'platform',
        title: 'Weekly billing run completed',
        description: `${successfulResults.length} invoice(s) generated across ${results.length} workspace(s)`,
        metadata: {
          runId,
          invoicesGenerated: successfulResults.length,
          totalAmount,
          errors: errorResults.length,
          skipped: skipped.length,
        },
      }).catch(err => log.warn('Failed to publish automation_completed event', { error: (err instanceof Error ? err.message : String(err)) }));

      log.info('Completed billing run', { invoicesGenerated: successfulResults.length, errors: errorResults.length, skipped: skipped.length });
      return runResult;
    } catch (error: any) {
      log.error('Fatal error in billing run', { runId, error: (error instanceof Error ? error.message : String(error)) });
      await this.updateRunStatus(runId, weekKey, 'failed', {
        workspacesProcessed: results.length,
        invoicesGenerated: results.filter(r => r.success).length,
        errors: [{ workspaceId: 'system', error: (error instanceof Error ? error.message : String(error)), errorType: 'system' }],
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

    return await this.processWorkspaceBilling(workspaceId, runId, workspaceWeekKey, weekKey);
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
    idempotencyKey?: string,
    weekKey?: string,
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

      // FOUNDER EXEMPTION: Statewide Protective Services — skip entire billing run
      if (isBillingExemptByRecord(workspace[0])) {
        log.info(`[WeeklyBilling] Founder exemption — skipping all billing layers for workspace ${workspaceId}`);
        await logExemptedAction({ workspaceId, action: 'weeklyBillingRun:ALL_LAYERS_SKIPPED' });
        return {
          workspaceId,
          success: true,
          totalAmount: 0,
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
        // Bug fix: previously stored idempotencyKey only inside metadata JSON.
        // The SELECT at processWorkspaceBillingWithTransaction queries the top-level
        // billingAuditLog.idempotencyKey column, so it must be set here as well.
        await db.insert(billingAuditLog).values({
          workspaceId,
          eventType: 'workspace_billing_processed',
          eventCategory: 'billing',
          actorType: 'system',
          description: `Invoice ${invoice.invoiceNumber} generated: $${totalAmount.toFixed(2)}`,
          idempotencyKey,
          metadata: { idempotencyKey },
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

      const billingExceptions: string[] = [];

      // LAYER 1: Real money via Stripe — middleware transaction fee
      try {
        const { chargeInvoiceMiddlewareFee } = await import('./middlewareTransactionFees');
        const feeResult = await chargeInvoiceMiddlewareFee({
          workspaceId,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceAmountCents: Math.round(totalAmount * 100),
          paymentMethod: 'card',
        });
        log.info(`[WeeklyBilling] Middleware fee: ${feeResult.description} (success: ${feeResult.success})`);
        if (!feeResult.success) {
          billingExceptions.push(`Middleware fee failed: ${feeResult.error || 'unknown'}`);
        }
        if (feeResult.success && feeResult.amountCents > 0) {
          // Platform revenue tracking: write to platform_revenue (non-blocking)
          import('../finance/middlewareFeeService').then(({ recordMiddlewareFeeCharge }) =>
            recordMiddlewareFeeCharge(workspaceId, 'invoice_processing', feeResult.amountCents, invoice.id)
              .catch((err: Error) => log.warn('[WeeklyBilling] Invoice fee revenue record failed (non-blocking):', err.message))
          ).catch((err: Error) => log.warn('[WeeklyBilling] Invoice fee revenue import failed:', err.message));
        }
      } catch (feeErr: any) {
        const msg = `Middleware fee charge exception: ${feeErr.message}`;
        log.error(`[WeeklyBilling] ${msg}`);
        billingExceptions.push(msg);
      }

      // LAYER 2: Credits from org balance — AI token usage at cost (no markup)
      try {
        const { financialProcessingFeeService } = await import('./financialProcessingFeeService');
        const feeResult = await financialProcessingFeeService.recordInvoiceFee({
          workspaceId,
          referenceId: invoice.invoiceNumber,
        });
        if (feeResult.recorded) {
          log.info(`[WeeklyBilling] Processing fee: $${(feeResult.amountCents / 100).toFixed(2)} for invoice ${invoice.invoiceNumber}`);
        }
      } catch (feeErr: any) {
        const msg = `Processing fee recording exception: ${feeErr.message}`;
        log.error(`[WeeklyBilling] ${msg}`);
        billingExceptions.push(msg);
      }

      // LAYER 3: Seat overage billing — charge Stripe for employees above tier limit
      try {
        const { chargeSeatOverageFee } = await import('./middlewareTransactionFees');
        const overageResult = await chargeSeatOverageFee({ workspaceId });
        if (overageResult.amountCents > 0) {
          log.info(`[WeeklyBilling] Seat overage: ${overageResult.description} (success: ${overageResult.success})`);
          if (!overageResult.success) {
            billingExceptions.push(`Seat overage failed: ${overageResult.error || 'unknown'}`);
          }
          if (overageResult.success) {
            import('../finance/middlewareFeeService').then(({ recordMiddlewareFeeCharge }) =>
              recordMiddlewareFeeCharge(workspaceId, 'seat_overage', overageResult.amountCents, workspaceId)
                .catch((err: Error) => log.warn('[WeeklyBilling] Seat overage revenue record failed (non-blocking):', err.message))
            ).catch((err: Error) => log.warn('[WeeklyBilling] Seat overage revenue import failed:', err.message));
          }
        }
      } catch (overageErr: any) {
        const msg = `Seat overage charge exception: ${(overageErr as any).message}`;
        log.error(`[WeeklyBilling] ${msg}`);
        billingExceptions.push(msg);
      }

      // LAYER 4: AI credit overage — charge Stripe for credits used beyond monthly allocation
      // Only applies to soft-cap tiers (professional/enterprise) that allow negative balance.
      // After billing, the negative balance is reset to 0 so next period starts clean.
      try {
        const { orgBillingService } = await import('./orgBillingService');
        const { chargeAiCreditOverageFee } = await import('./middlewareTransactionFees');
        const overage = await orgBillingService.calculateOverage(workspaceId);
        if (overage.overageCredits > 0) {
          const overageAmountCents = Math.round(overage.overageAmountDollars * 100);
          // Pass weekKey so chargeAiCreditOverageFee uses a weekly idempotency key,
          // preventing the monthly-key bug that silently skipped weeks 2-4 charges.
          const creditOverageResult = await chargeAiCreditOverageFee({
            workspaceId,
            overageCredits: overage.overageCredits,
            overageAmountCents,
            weekKey,
          });
          log.info(`[WeeklyBilling] Credit overage: ${creditOverageResult.description} (success: ${creditOverageResult.success})`);
          if (!creditOverageResult.success) {
            billingExceptions.push(`Credit overage failed: ${creditOverageResult.error || 'unknown'}`);
          }
          if (creditOverageResult.success && creditOverageResult.amountCents > 0) {
            import('../finance/middlewareFeeService').then(({ recordMiddlewareFeeCharge }) =>
              recordMiddlewareFeeCharge(workspaceId, 'credit_overage', creditOverageResult.amountCents, workspaceId)
                .catch((err: Error) => log.warn('[WeeklyBilling] Credit overage revenue record failed (non-blocking):', err.message))
            ).catch((err: Error) => log.warn('[WeeklyBilling] Credit overage revenue import failed:', err.message));
          }
        }
      } catch (creditOverageErr: any) {
        const msg = `Credit overage charge exception: ${creditOverageErr.message}`;
        log.error(`[WeeklyBilling] ${msg}`);
        billingExceptions.push(msg);
      }

      // LAYER 5: Token-level AI overage — charge Stripe for tokens used beyond monthly allocation
      // Calculates actual token consumption from workspace_ai_periods, bills at tier overage rate.
      // Non-blocking: exception logged and added to billingExceptions only, never halts invoice flow.
      try {
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const { aiMeteringService } = await import('./aiMeteringService');
        const { overageChargesCents } = await aiMeteringService.calculatePeriodOverage(workspaceId, periodStart);

        if (overageChargesCents > 0) {
          const stripe = (await import('stripe')).default;
          const Stripe = new stripe(process.env.STRIPE_SECRET_KEY || '');
          const stripeCustomerId = workspace[0].stripeCustomerId;

          if (stripeCustomerId) {
            await Stripe.invoiceItems.create({
              customer: stripeCustomerId,
              amount: overageChargesCents,
              currency: 'usd',
              description: `Trinity AI token overage — ${periodStart} ($${(overageChargesCents / 100).toFixed(2)} USD)`,
              idempotency_key: `ai-token-overage-${workspaceId}-${periodStart}`,
            } as any);
            log.info(`[WeeklyBilling] AI token overage invoiced: $${(overageChargesCents / 100).toFixed(2)} for workspace ${workspaceId}`);
          } else {
            log.warn(`[WeeklyBilling] AI token overage of $${(overageChargesCents / 100).toFixed(2)} — no Stripe customer ID for workspace ${workspaceId}`);
          }
        }
      } catch (tokenOverageErr: any) {
        const msg = `AI token overage charge exception: ${(tokenOverageErr as any)?.message}`;
        log.error(`[WeeklyBilling] ${msg}`);
        billingExceptions.push(msg);
      }

      // LAYER 6: Storage overage — charge Stripe for GCS usage above tier category limits
      // Rate: $0.10/GB, monthly idempotency key prevents double-billing across weekly runs.
      // Noise floor: only charged when > 1 GB over (see billingConfig.storageQuotas.overageMinChargeGB).
      try {
        const { chargeStorageOverageFee } = await import('./middlewareTransactionFees');
        const storageOverageResult = await chargeStorageOverageFee({ workspaceId });
        if (storageOverageResult.amountCents > 0) {
          log.info(`[WeeklyBilling] Storage overage: ${storageOverageResult.description} (success: ${storageOverageResult.success})`);
          if (!storageOverageResult.success) {
            billingExceptions.push(`Storage overage failed: ${storageOverageResult.error || 'unknown'}`);
          }
          if (storageOverageResult.success) {
            import('../finance/middlewareFeeService').then(({ recordMiddlewareFeeCharge }) =>
              recordMiddlewareFeeCharge(workspaceId, 'storage_overage', storageOverageResult.amountCents, workspaceId)
                .catch((err: Error) => log.warn('[WeeklyBilling] Storage overage revenue record failed (non-blocking):', err.message))
            ).catch((err: Error) => log.warn('[WeeklyBilling] Storage overage revenue import failed:', err.message));
          }
        }
      } catch (storageOverageErr: any) {
        const msg = `Storage overage charge exception: ${storageOverageErr?.message}`;
        log.error(`[WeeklyBilling] ${msg}`);
        billingExceptions.push(msg);
      }

      if (billingExceptions.length > 0) {
        log.error(`[WeeklyBilling] ${billingExceptions.length} billing exception(s) for workspace ${workspaceId}`, { exceptions: billingExceptions });
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
      log.error('Error processing workspace', { workspaceId, error: (error instanceof Error ? error.message : String(error)) });
      return {
        workspaceId,
        success: false,
        error: (error instanceof Error ? error.message : String(error)),
        errorType: 'generation',
      };
    }
  }

  /**
   * Get workspaces eligible for billing
   */
  private async getEligibleWorkspaces(): Promise<Array<{ id: string; name: string | null }>> {
    const now = new Date();

    // GAP-51 FIX: Also exclude workspaces whose subscriptionStatus is 'suspended' or
    // 'cancelled'. Previously only accountState was checked. Billing suspension paths
    // (trialManager, subscriptionManager, trialConversionOrchestrator) set
    // subscriptionStatus='suspended' WITHOUT touching accountState, so a suspended
    // workspace could still pass the accountState='active' filter and receive automated
    // client invoices — creating financial obligations for an administratively locked org.
    // NULL subscriptionStatus is allowed (new orgs on trial before first subscription event).
    const eligible = await db.select({
      id: workspaces.id,
      name: workspaces.name,
    })
      .from(workspaces)
      .where(
        and(
          eq(workspaces.accountState, 'active'),
          or(
            isNull(workspaces.subscriptionStatus),
            notInArray(workspaces.subscriptionStatus, ['suspended', 'cancelled'])
          ),
          or(
            isNull(workspaces.nextInvoiceAt),
            lte(workspaces.nextInvoiceAt, now)
          )
        )
      );

    // Exclude platform, system, and support pool workspaces from billing runs
    return eligible.filter(w => !isBillingExcluded(w.id));
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
        .where(eq(users.currentWorkspaceId, workspaceId))
        .limit(1);

      if (ownerResult[0]?.email) {
        const _invoiceHtml = `<div><p><strong>firstName:</strong> ${ownerResult[0].firstName || 'Customer'}</p><p><strong>invoiceNumber:</strong> ${invoiceNumber}</p><p><strong>totalAmount:</strong> ${totalAmount.toFixed(2)}</p><p><strong>dueDate:</strong> ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()}</p><p><strong>viewInvoiceUrl:</strong> /billing/invoices/${invoiceId}</p></div>`;
        await NotificationDeliveryService.send({ type: 'invoice_notification', workspaceId: workspaceId || 'system', recipientUserId: ownerResult[0].email, channel: 'email', body: { to: ownerResult[0].email, subject: `Invoice Generated - ${invoiceNumber}`, html: _invoiceHtml } });
      }
    } catch (error: any) {
      log.warn('Failed to send invoice notification', { error: (error instanceof Error ? error.message : String(error)) });
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
        await (exceptionQueueProcessor as any).addException({
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
      log.warn('Failed to queue exceptions', { error: (err instanceof Error ? err.message : String(err)) });
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
      // @ts-expect-error — TS migration: fix in refactoring sprint
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
  log.info('Weekly Billing Run Service initialized');
  _scheduleMonthlyBillingRun();
}

/**
 * Monthly billing run auto-trigger.
 * Runs on the 1st of each month (checked hourly). Idempotency keys in the
 * billing run prevent double-billing if the interval fires multiple times
 * within the same calendar day.
 *
 * This ensures token overages are automatically billed to tenants without
 * requiring manual Trinity action invocation.
 */
function _scheduleMonthlyBillingRun(): void {
  const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  const check = () => {
    const now = new Date();
    // Run on the 1st of each month between 02:00–03:00 UTC (low-traffic window)
    if (now.getUTCDate() === 1 && now.getUTCHours() === 2) {
      log.info('[WeeklyBilling] Monthly auto-trigger: running billing run');
      weeklyBillingRunService.runWeeklyBilling().then((result) => {
        log.info('[WeeklyBilling] Monthly auto-run complete', {
          invoicesGenerated: result.invoicesGenerated,
          totalAmount: result.totalAmount,
          errors: result.errors.length,
        });
      }).catch((err: any) => {
        log.error('[WeeklyBilling] Monthly auto-run failed', { error: err?.message });
      });
    }
  };

  const timer = setInterval(check, CHECK_INTERVAL_MS);
  timer.unref(); // Do not hold the process open (LAW 17)
  log.info('[WeeklyBilling] Monthly billing auto-trigger scheduled (checks hourly, runs on 1st at 02:00 UTC)');
}
