import { and, eq } from 'drizzle-orm';
import { db } from 'server/db';
import { storage } from 'server/storage';
import { payrollProposals } from '@shared/schema';
import { toFinancialString } from '../financialCalculator';
import { platformEventBus } from '../platformEventBus';
import { createLogger } from '../../lib/logger';

const log = createLogger('PayrollProposalApprovalService');

export interface ApprovePayrollProposalParams {
  proposalId: string;
  workspaceId: string;
  userId: string;
  userEmail?: string | null;
  userRole?: string | null;
}

export interface ApprovePayrollProposalResult {
  success: true;
  proposalId: string;
  message: string;
  anomalyWarning?: string;
}

const PAYROLL_ANOMALY_THRESHOLD = 100000;
const PAYROLL_EXTREME_THRESHOLD = 500000;
const PROPOSAL_STALE_MS = 30 * 24 * 60 * 60 * 1000;

function statusError(message: string, status: number, extra?: Record<string, unknown>): Error & { status?: number; extra?: Record<string, unknown> } {
  return Object.assign(new Error(message), { status, extra });
}

function buildPayrollAnomalyWarning(proposalId: string, proposalData: Record<string, any>): string | null {
  const payrollTotal = parseFloat(toFinancialString(proposalData.totalGross ?? proposalData.totalAmount ?? proposalData.total ?? '0'));
  if (payrollTotal >= PAYROLL_EXTREME_THRESHOLD) {
    log.warn(`[FinancialAnomaly] Payroll proposal ${proposalId} total $${payrollTotal} ≥ $${PAYROLL_EXTREME_THRESHOLD} threshold`);
    return `EXTREME_PAYROLL: Total payroll $${payrollTotal.toLocaleString()} far exceeds normal range ($500k+). Verify with finance team before processing.`;
  }
  if (payrollTotal >= PAYROLL_ANOMALY_THRESHOLD) {
    log.warn(`[FinancialAnomaly] Payroll proposal ${proposalId} total $${payrollTotal} ≥ $${PAYROLL_ANOMALY_THRESHOLD} threshold`);
    return `HIGH_PAYROLL: Total payroll $${payrollTotal.toLocaleString()} is above typical range ($100k+). Please confirm this is correct.`;
  }
  return null;
}

function mapApprovalTransactionError(error: any): never {
  const status = error?.status || 500;
  if (status === 404) throw statusError('Proposal not found', 404);
  if (status === 409 && error?.message === 'ALREADY_PROCESSED') {
    throw statusError('Proposal was already processed by another user', 409);
  }
  if (status === 403 && error?.message === 'SELF_APPROVAL_FORBIDDEN') {
    throw statusError('You cannot approve a payroll proposal that you created. A different authorised manager must approve it.', 403, {
      code: 'SELF_APPROVAL_FORBIDDEN',
    });
  }
  if (status === 409 && error?.message === 'PROPOSAL_EXPIRED') {
    throw statusError('This payroll proposal is more than 30 days old and can no longer be approved. Please create a new proposal with current data.', 409, {
      code: 'PROPOSAL_EXPIRED',
      ...(error?.extra || {}),
    });
  }
  throw error;
}

/**
 * Approve a pending payroll proposal with concurrency, four-eyes, and stale guards.
 *
 * Keeps the row-locking mutation in one payroll-domain service so the route can
 * become a thin auth/workspace wrapper while audit/webhook/websocket/event traces
 * stay attached to the business operation.
 */
export async function approvePayrollProposal({
  proposalId,
  workspaceId,
  userId,
  userEmail = 'unknown',
  userRole = 'user',
}: ApprovePayrollProposalParams): Promise<ApprovePayrollProposalResult> {
  if (!proposalId) throw statusError('proposalId is required', 400);
  if (!workspaceId) throw statusError('workspaceId is required', 400);
  if (!userId) throw statusError('userId is required', 401);

  let proposal: any;
  let approvedProposal: any;

  try {
    ({ proposal, approvedProposal } = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(payrollProposals)
        .where(and(
          eq(payrollProposals.id, proposalId),
          eq(payrollProposals.workspaceId, workspaceId),
        ))
        .for('update')
        .limit(1);

      if (!locked) throw statusError('NOT_FOUND', 404);
      if (locked.status !== 'pending') throw statusError('ALREADY_PROCESSED', 409);
      if (locked.createdBy && locked.createdBy === userId) throw statusError('SELF_APPROVAL_FORBIDDEN', 403);

      if (locked.createdAt) {
        const proposalAgeMs = Date.now() - new Date(locked.createdAt).getTime();
        if (proposalAgeMs > PROPOSAL_STALE_MS) {
          throw statusError('PROPOSAL_EXPIRED', 409, {
            createdAt: locked.createdAt,
            ageInDays: Math.floor(proposalAgeMs / (24 * 60 * 60 * 1000)),
          });
        }
      }

      const [approved] = await tx.update(payrollProposals).set({
        status: 'approved',
        approvedBy: userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(payrollProposals.id, proposalId),
        eq(payrollProposals.workspaceId, workspaceId),
        eq(payrollProposals.status, 'pending'),
      )).returning();

      if (!approved) throw statusError('ALREADY_PROCESSED', 409);
      return { proposal: locked, approvedProposal: approved };
    }));
  } catch (error: any) {
    mapApprovalTransactionError(error);
  }

  if (!approvedProposal) {
    throw statusError('Proposal was already processed by another user', 409);
  }

  const proposalData = (proposal as any).data ?? {};
  const payrollAnomalyWarning = buildPayrollAnomalyWarning(proposalId, proposalData);

  storage.createAuditLog({
    workspaceId,
    userId,
    userEmail: userEmail || 'unknown',
    userRole: userRole || 'user',
    action: 'update',
    entityType: 'payroll_proposal',
    entityId: proposalId,
    actionDescription: `Payroll proposal ${proposalId} approved`,
    changes: { before: { status: 'pending' }, after: { status: 'approved', approvedBy: userId } },
    isSensitiveData: true,
    complianceTag: 'soc2',
  }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for payroll proposal approval', { error: err?.message }));

  try {
    const { deliverWebhookEvent } = await import('../webhookDeliveryService');
    deliverWebhookEvent(workspaceId, 'payroll.run_completed', {
      proposalId,
      approvedBy: userId,
      totalGross: proposalData?.totalGross,
      approvedAt: new Date().toISOString(),
    });
  } catch (webhookErr: any) {
    log.warn('[PayrollProposalApprovalService] Failed to emit payroll approval webhook (non-blocking):', { error: webhookErr?.message });
  }

  try {
    const { broadcastToWorkspace } = await import('../websocketService');
    broadcastToWorkspace(workspaceId, { type: 'payroll_updated', action: 'proposal_approved', proposalId });
  } catch (broadcastErr: any) {
    log.warn('[PayrollProposalApprovalService] Failed to broadcast proposal approval (non-blocking):', broadcastErr?.message);
  }

  platformEventBus.publish({
    type: 'payroll_run_approved',
    category: 'automation',
    title: 'Payroll Proposal Approved',
    description: `Payroll proposal ${proposalId} approved by ${userId} — payroll will be processed`,
    workspaceId,
    userId,
    metadata: {
      proposalId,
      approvedBy: userId,
      source: 'proposal_approve',
    },
  }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

  try {
    const { universalNotificationEngine } = await import('../universalNotificationEngine');
    await universalNotificationEngine.sendNotification({
      workspaceId,
      type: 'payroll_approved',
      priority: 'high',
      title: 'Payroll Approved',
      message: `Payroll proposal ${proposalId} has been approved and is moving to processing.`,
      severity: 'info',
      metadata: { proposalId, approvedBy: userId },
    });
  } catch (notificationErr: any) {
    log.error('[PayrollProposalApprovalService] Failed to send approval notification:', notificationErr?.message);
  }

  return {
    success: true,
    proposalId,
    message: 'Payroll proposal approved. Payroll will be processed.',
    ...(payrollAnomalyWarning ? { anomalyWarning: payrollAnomalyWarning } : {}),
  };
}
