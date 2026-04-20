/**
 * Revenue Recognition Service
 * ============================
 * Implements ASC 606 / IFRS 15 revenue recognition with accrual and cash methods.
 *
 * Responsibilities:
 * - Monthly batch recognition job (1st of each month, cron '0 0 1 * *')
 * - Idempotency via processedRevenueEvents table (no double-recognition)
 * - Accrual: spread revenue over scheduled monthly periods
 * - Cash: recognize on invoice payment
 * - Deferred revenue: move from deferred_revenue → org_ledger when earned
 * - Audit trail on every mutation
 *
 * Per TRINITY.md §B: Every write awaited (no fire-and-forget).
 * Per TRINITY.md §G: All queries workspace-scoped.
 */

import { db } from '../../db';
import {
  revenueRecognitionSchedule,
  deferredRevenue,
  processedRevenueEvents,
  invoices,
  auditLogs,
  workspaces,
  type RevenueRecognitionSchedule,
  type DeferredRevenue,
} from '@shared/schema';
import { eq, and, gte, lte, lt, desc, sql, inArray } from 'drizzle-orm';
import { writeLedgerEntry } from '../orgLedgerService';
import { createLogger } from '../../lib/logger';

const log = createLogger('RevenueRecognitionService');

export interface RecognitionJobResult {
  workspaceId: string;
  year: number;
  month: number;
  skipped: boolean;
  skipReason?: string;
  schedulesProcessed: number;
  amountRecognized: number;
  deferredEntriesUpdated: number;
  errors: string[];
}

export interface RevenueRecognitionSummary {
  workspaceId: string;
  pendingAmount: number;
  recognizedAmount: number;
  deferredAmount: number;
  inProgressAmount: number;
  totalSchedules: number;
  pendingSchedules: number;
  recognizedSchedules: number;
}

/**
 * Generate a monthly accrual schedule for an invoice.
 * Splits totalAmount evenly over numMonths starting from startDate (1st of that month).
 */
export function generateMonthlySchedule(
  totalAmount: number,
  numMonths: number,
  startDate: Date,
): Array<{ date: string; amount: string }> {
  if (numMonths <= 0) return [];
  const perMonth = parseFloat((totalAmount / numMonths).toFixed(2));
  const remainder = parseFloat((totalAmount - perMonth * (numMonths - 1)).toFixed(2));
  const schedule: Array<{ date: string; amount: string }> = [];

  for (let i = 0; i < numMonths; i++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
    const amount = i === numMonths - 1 ? remainder : perMonth;
    schedule.push({ date: d.toISOString().split('T')[0], amount: amount.toFixed(2) });
  }
  return schedule;
}

/**
 * Create a revenue recognition schedule for a newly-created invoice.
 * Called transactionally from invoiceRoutes.ts during invoice creation.
 */
export async function createScheduleForInvoice(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: {
    workspaceId: string;
    invoiceId: string;
    clientId: string;
    totalAmount: number;
    recognitionMethod: 'accrual' | 'cash';
    periodMonths?: number; // for accrual: how many months to spread over (default: 1)
    startDate?: Date;
    createdBy?: string;
  },
): Promise<string | null> {
  try {
    const {
      workspaceId,
      invoiceId,
      clientId,
      totalAmount,
      recognitionMethod,
      periodMonths = 1,
      startDate = new Date(),
      createdBy,
    } = params;

    const scheduledDates =
      recognitionMethod === 'accrual'
        ? generateMonthlySchedule(totalAmount, periodMonths, startDate)
        : [];

    const periodStart = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const periodEnd = new Date(
      startDate.getFullYear(),
      startDate.getMonth() + (periodMonths > 1 ? periodMonths - 1 : 0),
      // last day of end month
      new Date(startDate.getFullYear(), startDate.getMonth() + (periodMonths > 1 ? periodMonths : 1), 0).getDate(),
    );

    const [schedule] = await tx
      .insert(revenueRecognitionSchedule)
      .values({
        workspaceId,
        invoiceId,
        clientId,
        totalAmount: totalAmount.toFixed(2),
        recognizedAmount: '0.00',
        remainingAmount: totalAmount.toFixed(2),
        recognitionMethod,
        scheduledDates,
        status: recognitionMethod === 'cash' ? 'pending' : 'pending',
        periodStart: periodStart.toISOString().split('T')[0],
        periodEnd: periodEnd.toISOString().split('T')[0],
        createdBy: createdBy ?? null,
        auditLog: [
          {
            timestamp: new Date().toISOString(),
            userId: createdBy ?? 'system',
            action: 'schedule_created',
            amount: totalAmount,
            note: `Schedule created via invoice ${invoiceId} (${recognitionMethod})`,
          },
        ],
      })
      .returning();

    // For accrual method: also create a deferred revenue entry
    if (recognitionMethod === 'accrual') {
      await tx.insert(deferredRevenue).values({
        workspaceId,
        invoiceId,
        scheduleId: schedule.id,
        amount: totalAmount.toFixed(2),
        deferralReason: `Accrual recognition over ${periodMonths} month(s)`,
        startDate: periodStart.toISOString().split('T')[0],
        endDate: periodEnd.toISOString().split('T')[0],
        recognizedAmount: '0.00',
        status: 'deferred',
        createdBy: createdBy ?? null,
      });
    }

    return schedule.id;
  } catch (err: any) {
    log.error('[RevenueRecognitionService] createScheduleForInvoice error', { error: err?.message });
    return null;
  }
}

/**
 * Recognize cash-method revenue when an invoice is marked paid.
 * Called from invoiceRoutes.ts mark-paid endpoint.
 */
export async function recognizeCashRevenueOnPayment(
  workspaceId: string,
  invoiceId: string,
  paidAmount: number,
  userId: string,
): Promise<void> {
  const [schedule] = await db
    .select()
    .from(revenueRecognitionSchedule)
    .where(
      and(
        eq(revenueRecognitionSchedule.workspaceId, workspaceId),
        eq(revenueRecognitionSchedule.invoiceId, invoiceId),
        eq(revenueRecognitionSchedule.recognitionMethod, 'cash'),
        inArray(revenueRecognitionSchedule.status, ['pending', 'in_progress']),
      ),
    )
    .limit(1);

  if (!schedule) return;

  const newRecognized = parseFloat(String(schedule.recognizedAmount)) + paidAmount;
  const newRemaining = Math.max(0, parseFloat(String(schedule.totalAmount)) - newRecognized);
  const newStatus = newRemaining <= 0 ? 'recognized' : 'in_progress';

  const auditEntry = {
    timestamp: new Date().toISOString(),
    userId,
    action: 'cash_recognized',
    amount: paidAmount,
    note: `Cash payment received for invoice ${invoiceId}`,
  };

  await db
    .update(revenueRecognitionSchedule)
    .set({
      recognizedAmount: newRecognized.toFixed(2),
      remainingAmount: newRemaining.toFixed(2),
      status: newStatus,
      recognizedAt: newStatus === 'recognized' ? new Date() : schedule.recognizedAt,
      lastProcessedAt: new Date(),
      auditLog: sql`${revenueRecognitionSchedule.auditLog} || ${JSON.stringify([auditEntry])}::jsonb`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(revenueRecognitionSchedule.id, schedule.id),
        eq(revenueRecognitionSchedule.workspaceId, workspaceId),
      ),
    );

  // Write to org ledger
  try {
    await writeLedgerEntry({
      workspaceId,
      entryType: 'revenue_recognized',
      direction: 'credit',
      amount: paidAmount,
      relatedEntityType: 'revenue_recognition_schedule',
      relatedEntityId: schedule.id,
      invoiceId,
      createdBy: userId,
      description: `Cash revenue recognized: $${paidAmount.toFixed(2)} for invoice`,
      metadata: { invoiceId, scheduleId: schedule.id, method: 'cash' },
    });
  } catch (err: any) {
    log.warn('[RevenueRecognitionService] Ledger write failed (non-fatal)', { error: err?.message });
  }

  // Audit log
  try {
    await db.insert(auditLogs).values({
      workspaceId,
      userId,
      action: 'revenue_recognized',
      entityType: 'revenue_recognition_schedule',
      entityId: schedule.id,
      actionDescription: `Cash revenue recognized: $${paidAmount.toFixed(2)}`,
      changes: { invoiceId, amount: paidAmount, method: 'cash' },
      source: 'system',
    });
  } catch (err: any) {
    log.warn('[RevenueRecognitionService] Audit log write failed (non-fatal)', { error: err?.message });
  }
}

/**
 * Run the monthly accrual recognition job for a single workspace.
 * Idempotent: will skip if already processed for this year/month.
 */
export async function runMonthlyRecognitionForWorkspace(
  workspaceId: string,
  year: number,
  month: number, // 1-12
): Promise<RecognitionJobResult> {
  const result: RecognitionJobResult = {
    workspaceId,
    year,
    month,
    skipped: false,
    schedulesProcessed: 0,
    amountRecognized: 0,
    deferredEntriesUpdated: 0,
    errors: [],
  };

  // Idempotency check
  const idempotencyKey = `revenue-${workspaceId}-${year}-${String(month).padStart(2, '0')}`;
  const [existing] = await db
    .select()
    .from(processedRevenueEvents)
    .where(eq(processedRevenueEvents.idempotencyKey, idempotencyKey))
    .limit(1);

  if (existing) {
    result.skipped = true;
    result.skipReason = `Already processed for ${year}-${String(month).padStart(2, '0')}`;
    return result;
  }

  const periodDate = new Date(year, month - 1, 1).toISOString().split('T')[0];

  // Fetch all accrual schedules for this workspace that have a scheduled entry for this period
  const schedules = await db
    .select()
    .from(revenueRecognitionSchedule)
    .where(
      and(
        eq(revenueRecognitionSchedule.workspaceId, workspaceId),
        eq(revenueRecognitionSchedule.recognitionMethod, 'accrual'),
        inArray(revenueRecognitionSchedule.status, ['pending', 'in_progress']),
      ),
    );

  for (const schedule of schedules) {
    try {
      const scheduledDates = (schedule.scheduledDates as Array<{ date: string; amount: string }>) ?? [];
      const entry = scheduledDates.find((e) => e.date === periodDate);
      if (!entry) continue;

      const recognizeAmount = parseFloat(entry.amount);
      if (recognizeAmount <= 0) continue;

      const newRecognized =
        parseFloat(String(schedule.recognizedAmount)) + recognizeAmount;
      const newRemaining = Math.max(
        0,
        parseFloat(String(schedule.totalAmount)) - newRecognized,
      );
      const newStatus = newRemaining <= 0 ? 'recognized' : 'in_progress';

      const auditEntry = {
        timestamp: new Date().toISOString(),
        userId: 'system',
        action: 'monthly_accrual_recognized',
        amount: recognizeAmount,
        note: `Monthly accrual for ${year}-${String(month).padStart(2, '0')}`,
      };

      await db
        .update(revenueRecognitionSchedule)
        .set({
          recognizedAmount: newRecognized.toFixed(2),
          remainingAmount: newRemaining.toFixed(2),
          status: newStatus,
          recognizedAt: newStatus === 'recognized' ? new Date() : schedule.recognizedAt,
          lastProcessedAt: new Date(),
          auditLog: sql`${revenueRecognitionSchedule.auditLog} || ${JSON.stringify([auditEntry])}::jsonb`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(revenueRecognitionSchedule.id, schedule.id),
            eq(revenueRecognitionSchedule.workspaceId, workspaceId),
          ),
        );

      // Update matching deferred revenue entry
      const deferredEntries = await db
        .select()
        .from(deferredRevenue)
        .where(
          and(
            eq(deferredRevenue.scheduleId, schedule.id),
            eq(deferredRevenue.workspaceId, workspaceId),
            inArray(deferredRevenue.status, ['deferred', 'partially_recognized']),
          ),
        )
        .limit(1);

      if (deferredEntries.length > 0) {
        const dr = deferredEntries[0];
        const newDrRecognized =
          parseFloat(String(dr.recognizedAmount)) + recognizeAmount;
        const drTotal = parseFloat(String(dr.amount));
        const newDrStatus =
          newDrRecognized >= drTotal ? 'recognized' : 'partially_recognized';

        await db
          .update(deferredRevenue)
          .set({
            recognizedAmount: newDrRecognized.toFixed(2),
            status: newDrStatus,
            recognizedAt: newDrStatus === 'recognized' ? new Date() : dr.recognizedAt,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(deferredRevenue.id, dr.id),
              eq(deferredRevenue.workspaceId, workspaceId),
            ),
          );
        result.deferredEntriesUpdated++;
      }

      // Write to org ledger
      try {
        await writeLedgerEntry({
          workspaceId,
          entryType: 'revenue_recognized',
          direction: 'credit',
          amount: recognizeAmount,
          relatedEntityType: 'revenue_recognition_schedule',
          relatedEntityId: schedule.id,
          invoiceId: schedule.invoiceId,
          createdBy: 'system',
          description: `Accrual revenue recognized: $${recognizeAmount.toFixed(2)} for ${year}-${String(month).padStart(2, '0')}`,
          metadata: { scheduleId: schedule.id, invoiceId: schedule.invoiceId, period: periodDate, method: 'accrual' },
        });
      } catch (err: any) {
        log.warn('[RevenueRecognitionService] Ledger write failed', { error: err?.message, scheduleId: schedule.id });
      }

      result.schedulesProcessed++;
      result.amountRecognized += recognizeAmount;
    } catch (err: any) {
      result.errors.push(`Schedule ${schedule.id}: ${err?.message}`);
      log.error('[RevenueRecognitionService] Error processing schedule', {
        scheduleId: schedule.id,
        error: err?.message,
      });
    }
  }

  // Record idempotency marker
  if (result.schedulesProcessed > 0 || result.errors.length === 0) {
    try {
      await db.insert(processedRevenueEvents).values({
        idempotencyKey,
        workspaceId,
        year,
        month,
        schedulesProcessed: result.schedulesProcessed,
        amountRecognized: result.amountRecognized.toFixed(2),
      });
    } catch (err: any) {
      // If idempotency key already exists due to race condition, ignore
      log.warn('[RevenueRecognitionService] Idempotency insert failed (race?)', { error: err?.message });
    }
  }

  // Write batch audit log
  if (result.schedulesProcessed > 0) {
    try {
      await db.insert(auditLogs).values({
        workspaceId,
        userId: 'system',
        action: 'monthly_revenue_recognition_run',
        entityType: 'workspace',
        entityId: workspaceId,
        actionDescription: `Monthly accrual recognition: ${result.schedulesProcessed} schedules, $${result.amountRecognized.toFixed(2)}`,
        changes: { year, month, schedulesProcessed: result.schedulesProcessed, amountRecognized: result.amountRecognized },
        source: 'system',
      });
    } catch (err: any) {
      log.warn('[RevenueRecognitionService] Audit batch write failed (non-fatal)', { error: err?.message });
    }
  }

  return result;
}

/**
 * Run monthly recognition for ALL workspaces.
 * Scheduled by autonomousScheduler on '0 0 1 * *'.
 */
export async function runMonthlyRecognitionAllWorkspaces(
  year?: number,
  month?: number,
): Promise<RecognitionJobResult[]> {
  const now = new Date();
  const targetYear = year ?? now.getFullYear();
  const targetMonth = month ?? now.getMonth() + 1;

  log.info('[RevenueRecognitionService] Starting monthly recognition run', {
    year: targetYear,
    month: targetMonth,
  });

  // Fetch all active workspaces
  const allWorkspaces = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.subscriptionStatus, 'active'));

  const results: RecognitionJobResult[] = [];
  for (const ws of allWorkspaces) {
    try {
      const result = await runMonthlyRecognitionForWorkspace(ws.id, targetYear, targetMonth);
      results.push(result);
    } catch (err: any) {
      log.error('[RevenueRecognitionService] Workspace job failed', { workspaceId: ws.id, error: err?.message });
      results.push({
        workspaceId: ws.id,
        year: targetYear,
        month: targetMonth,
        skipped: false,
        schedulesProcessed: 0,
        amountRecognized: 0,
        deferredEntriesUpdated: 0,
        errors: [err?.message ?? 'Unknown error'],
      });
    }
  }

  const totalProcessed = results.reduce((sum, r) => sum + r.schedulesProcessed, 0);
  const totalAmount = results.reduce((sum, r) => sum + r.amountRecognized, 0);
  const totalSkipped = results.filter((r) => r.skipped).length;
  log.info('[RevenueRecognitionService] Monthly recognition complete', {
    workspaces: results.length,
    skipped: totalSkipped,
    totalSchedules: totalProcessed,
    totalAmount: totalAmount.toFixed(2),
  });

  return results;
}

/**
 * Get revenue recognition summary for a workspace.
 */
export async function getRevenueRecognitionSummary(
  workspaceId: string,
): Promise<RevenueRecognitionSummary> {
  const schedules = await db
    .select()
    .from(revenueRecognitionSchedule)
    .where(eq(revenueRecognitionSchedule.workspaceId, workspaceId));

  let pendingAmount = 0;
  let recognizedAmount = 0;
  let deferredAmount = 0;
  let inProgressAmount = 0;
  let pendingSchedules = 0;
  let recognizedSchedules = 0;

  for (const s of schedules) {
    const remaining = parseFloat(String(s.remainingAmount));
    const recognized = parseFloat(String(s.recognizedAmount));
    switch (s.status) {
      case 'pending':
        pendingAmount += remaining;
        pendingSchedules++;
        break;
      case 'recognized':
        recognizedAmount += recognized;
        recognizedSchedules++;
        break;
      case 'in_progress':
        inProgressAmount += remaining;
        pendingSchedules++;
        break;
      case 'deferred':
        deferredAmount += remaining;
        break;
    }
  }

  // Add deferred_revenue table amounts
  const deferredRows = await db
    .select()
    .from(deferredRevenue)
    .where(
      and(
        eq(deferredRevenue.workspaceId, workspaceId),
        inArray(deferredRevenue.status, ['deferred', 'partially_recognized']),
      ),
    );

  const deferredTableAmount = deferredRows.reduce(
    (sum, dr) =>
      sum + parseFloat(String(dr.amount)) - parseFloat(String(dr.recognizedAmount)),
    0,
  );

  return {
    workspaceId,
    pendingAmount,
    recognizedAmount,
    deferredAmount: deferredTableAmount,
    inProgressAmount,
    totalSchedules: schedules.length,
    pendingSchedules,
    recognizedSchedules,
  };
}

/** Singleton export */
export const revenueRecognitionService = {
  createScheduleForInvoice,
  recognizeCashRevenueOnPayment,
  runMonthlyRecognitionForWorkspace,
  runMonthlyRecognitionAllWorkspaces,
  getRevenueRecognitionSummary,
  generateMonthlySchedule,
};
