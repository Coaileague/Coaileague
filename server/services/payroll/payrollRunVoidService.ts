import { and, eq } from 'drizzle-orm';
import { db } from 'server/db';
import { payrollEntries, payrollRuns } from '@shared/schema';
import { storage } from 'server/storage';
import { platformEventBus } from '../platformEventBus';
import { createLogger } from '../../lib/logger';

const log = createLogger('PayrollRunVoidService');

export interface VoidPayrollRunParams {
  workspaceId: string;
  payrollRunId: string;
  userId: string;
  userEmail?: string | null;
  userRole?: string | null;
  reason: string;
  voidedAt?: Date;
  reversalReference?: string | null;
}

export interface VoidPayrollRunResult {
  success: true;
  payrollRunId: string;
  previousStatus: string | null;
  disbursementStatus: string;
  voidedAt: string;
  reversedEntries: number;
  alreadyVoided: boolean;
}

function statusError(message: string, status: number, extra?: Record<string, unknown>) {
  return Object.assign(new Error(message), { status, extra });
}

function canVoidStatus(status: string | null | undefined): boolean {
  return ['approved', 'processed', 'disbursing', 'paid', 'completed', 'partial'].includes(String(status || ''));
}

/**
 * Record a payroll run void/reversal without inventing a non-existent payroll status.
 *
 * The payroll_status enum does not currently include `voided`. This service keeps
 * the payroll run's lifecycle status intact and records the reversal through
 * disbursementStatus/providerData plus entry payout reversal markers.
 */
export async function voidPayrollRun({
  workspaceId,
  payrollRunId,
  userId,
  userEmail = 'unknown',
  userRole = 'user',
  reason,
  voidedAt = new Date(),
  reversalReference = null,
}: VoidPayrollRunParams): Promise<VoidPayrollRunResult> {
  if (!workspaceId) throw statusError('workspaceId is required', 400);
  if (!payrollRunId) throw statusError('payrollRunId is required', 400);
  if (!userId) throw statusError('userId is required', 401);
  if (!reason?.trim()) {
    throw statusError('Void reason is required', 400, { code: 'PAYROLL_VOID_REASON_REQUIRED' });
  }

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
    const previousProviderData = (run.providerData as Record<string, unknown> | null) || {};
    const previousDisbursementStatus = run.disbursementStatus || null;

    if ((previousProviderData as any).voided === true || previousDisbursementStatus === 'voided') {
      return {
        success: true as const,
        payrollRunId,
        previousStatus,
        disbursementStatus: 'voided',
        voidedAt: String((previousProviderData as any).voidedAt || voidedAt.toISOString()),
        reversedEntries: 0,
        alreadyVoided: true,
      };
    }

    if (!canVoidStatus(previousStatus)) {
      throw statusError(`Payroll run ${payrollRunId} is ${previousStatus || 'unknown'} and cannot be voided. Delete draft runs or process a valid reversal workflow.`, 409, {
        code: 'PAYROLL_RUN_NOT_VOIDABLE',
        previousStatus,
      });
    }

    const providerData = {
      ...previousProviderData,
      voided: true,
      voidedAt: voidedAt.toISOString(),
      voidedBy: userId,
      voidReason: reason,
      reversalReference,
      voidSource: 'payrollRunVoidService',
      previousStatus,
      previousDisbursementStatus,
    };

    const [updatedRun] = await tx.update(payrollRuns)
      .set({
        disbursementStatus: 'voided',
        providerData,
        updatedAt: voidedAt,
      })
      .where(and(
        eq(payrollRuns.workspaceId, workspaceId),
        eq(payrollRuns.id, payrollRunId),
      ))
      .returning({ id: payrollRuns.id });

    if (!updatedRun) throw statusError('Payroll run void update failed', 500);

    const reversedEntries = await tx.update(payrollEntries)
      .set({
        payoutStatus: 'reversed',
        payoutFailureReason: reason,
        payoutFailedAt: voidedAt,
        plaidTransferStatus: 'reversed',
        plaidTransferFailureReason: reason,
        updatedAt: voidedAt,
      } as any)
      .where(and(
        eq(payrollEntries.workspaceId, workspaceId),
        eq(payrollEntries.payrollRunId, payrollRunId),
      ))
      .returning({ id: payrollEntries.id });

    return {
      success: true as const,
      payrollRunId,
      previousStatus,
      disbursementStatus: 'voided',
      voidedAt: voidedAt.toISOString(),
      reversedEntries: reversedEntries.length,
      alreadyVoided: false,
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
    actionDescription: `Payroll run ${payrollRunId} voided`,
    changes: {
      before: { status: result.previousStatus },
      after: {
        disbursementStatus: result.disbursementStatus,
        voidedAt: result.voidedAt,
        reversedEntries: result.reversedEntries,
        reversalReference,
      },
    },
    isSensitiveData: true,
    complianceTag: 'soc2',
  }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for payroll void', { error: err?.message }));

  try {
    const { broadcastToWorkspace } = await import('../websocket');
    broadcastToWorkspace(workspaceId, {
      type: 'payroll_updated',
      action: 'voided',
      runId: payrollRunId,
      payrollRunId,
    });
  } catch (broadcastErr: any) {
    log.warn('[PayrollRunVoidService] Failed to broadcast void update (non-blocking):', broadcastErr?.message);
  }

  platformEventBus.publish({
    type: 'payroll_run_voided',
    category: 'payroll',
    title: 'Payroll Run Voided',
    description: `Payroll run ${payrollRunId} voided`,
    workspaceId,
    userId,
    metadata: {
      payrollRunId,
      previousStatus: result.previousStatus,
      disbursementStatus: result.disbursementStatus,
      voidedAt: result.voidedAt,
      reversedEntries: result.reversedEntries,
      alreadyVoided: result.alreadyVoided,
      reversalReference,
      source: 'payrollRunVoidService',
    },
  }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

  return result;
}
