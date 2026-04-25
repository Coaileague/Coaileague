import { and, eq } from 'drizzle-orm';
import { db } from 'server/db';
import { billingAuditLog, payrollEntries, payrollRuns } from '@shared/schema';
import { storage } from 'server/storage';
import { platformEventBus } from '../platformEventBus';
import { createLogger } from '../../lib/logger';

const log = createLogger('PayrollRunMarkPaidService');

export interface MarkPayrollRunPaidParams {
  workspaceId: string;
  payrollRunId: string;
  userId: string;
  userEmail?: string | null;
  userRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  paidAt?: Date;
  reason?: string | null;
}

export interface MarkPayrollRunPaidResult {
  success: true;
  payrollRunId: string;
  previousStatus: string | null;
  status: 'paid';
  paidAt: string;
  updatedEntries: number;
  alreadyPaid: boolean;
}

function statusError(message: string, status: number, extra?: Record<string, unknown>) {
  return Object.assign(new Error(message), { status, extra });
}

function isPaidStatus(status: string | null | undefined): boolean {
  return status === 'paid' || status === 'completed';
}

function canMarkPaid(status: string | null | undefined): boolean {
  return ['approved', 'processed', 'disbursing', 'paid', 'completed'].includes(String(status || ''));
}

/**
 * Mark a payroll run as paid and stamp all run entries as disbursed.
 *
 * This is the canonical post-disbursement/manual-confirmation path. It is
 * intentionally separate from ACH/NACHA initiation. Payment initiation belongs
 * to process/execute services; this service records that payment is complete.
 */
export async function markPayrollRunPaid({
  workspaceId,
  payrollRunId,
  userId,
  userEmail = 'unknown',
  userRole = 'user',
  ipAddress = null,
  userAgent = null,
  paidAt = new Date(),
  reason = null,
}: MarkPayrollRunPaidParams): Promise<MarkPayrollRunPaidResult> {
  if (!workspaceId) throw statusError('workspaceId is required', 400);
  if (!payrollRunId) throw statusError('payrollRunId is required', 400);
  if (!userId) throw statusError('userId is required', 401);

  const result = await db.transaction(async (tx) => {
    const [run] = await tx.select()
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.workspaceId, workspaceId),
        eq(payrollRuns.id, payrollRunId),
      ))
      .for('update')
      .limit(1);

    if (!run) throw statusError('Payroll run not found', 404);

    const previousStatus = run.status ?? null;

    if (!canMarkPaid(previousStatus)) {
      throw statusError(`Payroll run ${payrollRunId} is ${previousStatus || 'unknown'} and cannot be marked paid yet. Process or approve the run first.`, 409, {
        code: 'PAYROLL_RUN_NOT_READY_FOR_PAID',
        previousStatus,
      });
    }

    if (isPaidStatus(previousStatus)) {
      return {
        success: true as const,
        payrollRunId,
        previousStatus,
        status: 'paid' as const,
        paidAt: (run.disbursedAt || run.disbursementDate || paidAt).toISOString(),
        updatedEntries: 0,
        alreadyPaid: true,
      };
    }

    const [updatedRun] = await tx.update(payrollRuns)
      .set({
        status: 'paid',
        disbursementStatus: 'completed',
        disbursementDate: paidAt,
        disbursedAt: paidAt,
        processedBy: run.processedBy || userId,
        processedAt: run.processedAt || paidAt,
        updatedAt: paidAt,
      })
      .where(and(
        eq(payrollRuns.workspaceId, workspaceId),
        eq(payrollRuns.id, payrollRunId),
      ))
      .returning({ id: payrollRuns.id });

    if (!updatedRun) throw statusError('Payroll run mark-paid update failed', 500);

    const updatedEntries = await tx.update(payrollEntries)
      .set({
        disbursedAt: paidAt,
        payoutStatus: 'completed',
        payoutCompletedAt: paidAt,
        updatedAt: paidAt,
      })
      .where(and(
        eq(payrollEntries.workspaceId, workspaceId),
        eq(payrollEntries.payrollRunId, payrollRunId),
      ))
      .returning({ id: payrollEntries.id });

    return {
      success: true as const,
      payrollRunId,
      previousStatus,
      status: 'paid' as const,
      paidAt: paidAt.toISOString(),
      updatedEntries: updatedEntries.length,
      alreadyPaid: false,
    };
  });

  storage.createAuditLog({
    workspaceId,
    userId,
    userEmail: userEmail || 'unknown',
    userRole: userRole || 'user',
    action: 'update',
    entityType: 'payroll_run',
    entityId: payrollRunId,
    actionDescription: `Payroll run ${payrollRunId} marked paid`,
    changes: {
      before: { status: result.previousStatus },
      after: { status: 'paid', disbursementStatus: 'completed', paidAt: result.paidAt, reason },
    },
    isSensitiveData: true,
    complianceTag: 'soc2',
  }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for payroll mark-paid', { error: err?.message }));

  db.insert(billingAuditLog).values({
    workspaceId,
    eventType: 'payroll_run_marked_paid',
    eventCategory: 'payroll',
    actorType: 'user',
    actorId: userId,
    actorEmail: userEmail || null,
    description: `Payroll run marked paid`,
    relatedEntityType: 'payroll_run',
    relatedEntityId: payrollRunId,
    oldState: { status: result.previousStatus },
    newState: { status: 'paid', paidAt: result.paidAt, updatedEntries: result.updatedEntries, alreadyPaid: result.alreadyPaid },
    ipAddress,
    userAgent,
  }).catch(err => log.error('[BillingAudit] billing_audit_log write failed for payroll mark-paid', { error: err?.message }));

  try {
    const { broadcastToWorkspace } = await import('../websocket');
    broadcastToWorkspace(workspaceId, {
      type: 'payroll_updated',
      action: 'paid',
      runId: payrollRunId,
      payrollRunId,
    });
  } catch (broadcastErr: any) {
    log.warn('[PayrollRunMarkPaidService] Failed to broadcast mark-paid update (non-blocking):', broadcastErr?.message);
  }

  platformEventBus.publish({
    type: 'payroll_run_paid',
    category: 'payroll',
    title: 'Payroll Run Paid',
    description: `Payroll run ${payrollRunId} marked paid`,
    workspaceId,
    userId,
    metadata: {
      payrollRunId,
      previousStatus: result.previousStatus,
      paidAt: result.paidAt,
      updatedEntries: result.updatedEntries,
      alreadyPaid: result.alreadyPaid,
      reason,
      source: 'payrollRunMarkPaidService',
    },
  }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

  return result;
}
