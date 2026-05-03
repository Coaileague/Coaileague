/**
 * Trinity Financial Conscience (Wave 4 — Task 5)
 * ─────────────────────────────────────────────────────────────────────────────
 * Trinity stages financial operations (invoice generation, payroll runs) as
 * DRAFTS, notifies the workspace owner with exact math, and waits for a strict
 * human APPROVE click before touching Stripe or Plaid.
 *
 * Flow:
 *   1. Trinity calls stageInvoiceGeneration() or stagePayrollRun()
 *   2. Service computes the full math snapshot, saves to trinityFinancialDrafts
 *   3. In-platform notification sent to owner: "APPROVE or REJECT"
 *   4. Owner clicks APPROVE → executeApprovedDraft() runs the real API calls
 *   5. Owner clicks REJECT → draft expires, nothing moves
 *
 * Trinity never makes financial API calls directly. The human APPROVE is the
 * only key that unlocks Stripe/Plaid execution.
 */

import { db } from '../../db';
import {
  trinityFinancialDrafts,
  invoices,
  payrollRuns,
  workspaces,
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
import { createNotification } from '../../notifications';
import { randomUUID } from 'crypto';
import Decimal from 'decimal.js';

const log = createLogger('trinityFinancialConscience');

// Drafts expire after 24 hours if not acted on
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StagedInvoicePayload {
  period: { start: string; end: string };
  clientCount: number;
  invoiceCount: number;
  totalBillable: string;
  totalHours: number;
  autoPayDiscountTotal: string;
  netTotal: string;
  invoices: Array<{
    clientId: string;
    clientName: string;
    amount: string;
    hours: number;
    hasAutoPayDiscount: boolean;
  }>;
}

export interface StagedPayrollPayload {
  period: { start: string; end: string };
  employeeCount: number;
  totalGrossPay: string;
  totalDeductions: string;
  totalNetPay: string;
  employees: Array<{
    employeeId: string;
    name: string;
    grossPay: string;
    netPay: string;
    hours: number;
  }>;
}

export interface FinancialDraftResult {
  success: true;
  draftId: string;
  operationType: string;
  summaryText: string;
  approvalPrompt: string;
  notificationId?: string;
  expiresAt: string;
}

// ─── Stage Invoice Generation ──────────────────────────────────────────────

export async function stageInvoiceGeneration(params: {
  workspaceId: string;
  stagedBy: string;
  payload: StagedInvoicePayload;
}): Promise<FinancialDraftResult> {
  const { workspaceId, stagedBy, payload } = params;

  const draftId = randomUUID();
  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);

  const summaryText =
    `Trinity has prepared ${payload.invoiceCount} invoice(s) for ${payload.clientCount} client(s). ` +
    `Total billable: $${payload.totalBillable} over ${payload.totalHours.toFixed(1)} hours. ` +
    (payload.autoPayDiscountTotal !== '0.00'
      ? `Auto-pay discounts applied: -$${payload.autoPayDiscountTotal}. Net: $${payload.netTotal}. `
      : '') +
    `Period: ${payload.period.start} → ${payload.period.end}.`;

  const approvalPrompt =
    `APPROVE to generate and send ${payload.invoiceCount} invoice(s) totaling $${payload.netTotal}. ` +
    `REJECT to cancel. This draft expires in 24 hours.`;

  // Save the draft
  await db.insert(trinityFinancialDrafts).values({
    id: draftId,
    workspaceId,
    operationType: 'invoice_generation',
    approvalStatus: 'pending_approval',
    draftPayload: payload as unknown as Record<string, unknown>,
    summaryText,
    approvalPrompt,
    createdBy: stagedBy,
    expiresAt,
  });

  // Notify the workspace owner
  let notificationId: string | undefined;
  try {
    const [ws] = await db
      .select({ ownerId: workspaces.ownerId })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (ws?.ownerId) {
      const notif = await createNotification({
        userId: ws.ownerId,
        workspaceId,
        type: 'trinity_financial_approval_required',
        title: `Trinity: Invoice Generation Ready for Approval`,
        message: summaryText,
        idempotencyKey: `trinity_invoice_draft_${draftId}`,
        metadata: {
          draftId,
          operationType: 'invoice_generation',
          approvalPrompt,
          totalAmount: payload.netTotal,
          expiresAt: expiresAt.toISOString(),
        },
        actionUrl: `/finance-hub?tab=approvals&draftId=${draftId}`,
      });
      notificationId = (notif as unknown as Record<string, string>)?.id;
    }
  } catch (notifErr: unknown) {
    log.warn('[FinancialConscience] Non-fatal: notification failed', {
      draftId,
      error: notifErr instanceof Error ? notifErr.message : String(notifErr),
    });
  }

  // Link notification id to draft
  if (notificationId) {
    await db.update(trinityFinancialDrafts)
      .set({ notificationId, updatedAt: new Date() })
      .where(eq(trinityFinancialDrafts.id, draftId))
      .catch(() => null);
  }

  log.info('[FinancialConscience] Invoice draft staged', {
    draftId,
    workspaceId,
    invoiceCount: payload.invoiceCount,
    netTotal: payload.netTotal,
  });

  return {
    success: true,
    draftId,
    operationType: 'invoice_generation',
    summaryText,
    approvalPrompt,
    notificationId,
    expiresAt: expiresAt.toISOString(),
  };
}

// ─── Stage Payroll Run ────────────────────────────────────────────────────────

export async function stagePayrollRun(params: {
  workspaceId: string;
  stagedBy: string;
  payload: StagedPayrollPayload;
}): Promise<FinancialDraftResult> {
  const { workspaceId, stagedBy, payload } = params;

  const draftId = randomUUID();
  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS);

  const summaryText =
    `Trinity has prepared payroll for ${payload.employeeCount} employee(s). ` +
    `Gross pay: $${payload.totalGrossPay}. Deductions: $${payload.totalDeductions}. ` +
    `Net pay to disberse: $${payload.totalNetPay}. ` +
    `Period: ${payload.period.start} → ${payload.period.end}.`;

  const approvalPrompt =
    `APPROVE to initiate ACH payroll transfers totaling $${payload.totalNetPay} to ` +
    `${payload.employeeCount} employee(s). Funds will be drawn from your connected Plaid bank account. ` +
    `REJECT to cancel. This draft expires in 24 hours.`;

  await db.insert(trinityFinancialDrafts).values({
    id: draftId,
    workspaceId,
    operationType: 'payroll_run',
    approvalStatus: 'pending_approval',
    draftPayload: payload as unknown as Record<string, unknown>,
    summaryText,
    approvalPrompt,
    createdBy: stagedBy,
    expiresAt,
  });

  let notificationId: string | undefined;
  try {
    const [ws] = await db
      .select({ ownerId: workspaces.ownerId })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (ws?.ownerId) {
      const notif = await createNotification({
        userId: ws.ownerId,
        workspaceId,
        type: 'trinity_financial_approval_required',
        title: `Trinity: Payroll Run Ready for Approval — $${payload.totalNetPay}`,
        message: summaryText,
        idempotencyKey: `trinity_payroll_draft_${draftId}`,
        metadata: {
          draftId,
          operationType: 'payroll_run',
          approvalPrompt,
          totalNetPay: payload.totalNetPay,
          employeeCount: payload.employeeCount,
          expiresAt: expiresAt.toISOString(),
        },
        actionUrl: `/payroll-dashboard?tab=approvals&draftId=${draftId}`,
      });
      notificationId = (notif as unknown as Record<string, string>)?.id;
    }
  } catch (notifErr: unknown) {
    log.warn('[FinancialConscience] Non-fatal: payroll notification failed', {
      draftId,
      error: notifErr instanceof Error ? notifErr.message : String(notifErr),
    });
  }

  if (notificationId) {
    await db.update(trinityFinancialDrafts)
      .set({ notificationId, updatedAt: new Date() })
      .where(eq(trinityFinancialDrafts.id, draftId))
      .catch(() => null);
  }

  log.info('[FinancialConscience] Payroll draft staged', {
    draftId,
    workspaceId,
    employeeCount: payload.employeeCount,
    totalNetPay: payload.totalNetPay,
  });

  return {
    success: true,
    draftId,
    operationType: 'payroll_run',
    summaryText,
    approvalPrompt,
    notificationId,
    expiresAt: expiresAt.toISOString(),
  };
}

// ─── Execute Approved Draft ───────────────────────────────────────────────────

export async function executeApprovedDraft(params: {
  draftId: string;
  workspaceId: string;
  approvedBy: string;
}): Promise<{ success: boolean; message: string; result?: unknown; error?: string }> {
  const { draftId, workspaceId, approvedBy } = params;

  // Load the draft
  const [draft] = await db
    .select()
    .from(trinityFinancialDrafts)
    .where(
      and(
        eq(trinityFinancialDrafts.id, draftId),
        eq(trinityFinancialDrafts.workspaceId, workspaceId),
      )
    )
    .limit(1);

  if (!draft) {
    return { success: false, error: 'Draft not found' };
  }

  if (draft.approvalStatus !== 'pending_approval') {
    return {
      success: false,
      error: `Draft is not pending approval (current status: ${draft.approvalStatus})`,
    };
  }

  const now = new Date();
  if (draft.expiresAt && draft.expiresAt < now) {
    await db.update(trinityFinancialDrafts)
      .set({ approvalStatus: 'expired', updatedAt: new Date() })
      .where(eq(trinityFinancialDrafts.id, draftId));
    return { success: false, error: 'Draft has expired. Please re-stage the operation.' };
  }

  // Mark as approved (prevents double-execution)
  await db.update(trinityFinancialDrafts)
    .set({
      approvalStatus: 'approved',
      approvedBy,
      approvedAt: now,
      updatedAt: now,
    })
    .where(eq(trinityFinancialDrafts.id, draftId));

  log.info('[FinancialConscience] Draft approved — executing', {
    draftId,
    operationType: draft.operationType,
    approvedBy,
  });

  // Execute the actual operation
  try {
    let result: unknown;

    if (draft.operationType === 'invoice_generation') {
      const { generateWeeklyInvoices } = await import('../billingAutomation');
      const payload = draft.draftPayload as unknown as StagedInvoicePayload;
      result = await generateWeeklyInvoices(workspaceId, new Date(payload.period.end));
    } else if (draft.operationType === 'payroll_run') {
      const { PayrollAutomationEngine } = await import('../payrollAutomation');
      const payload = draft.draftPayload as unknown as StagedPayrollPayload;
      result = await PayrollAutomationEngine.processAutomatedPayroll(workspaceId, {
        periodStart: new Date(payload.period.start),
        periodEnd: new Date(payload.period.end),
        triggeredBy: approvedBy,
      });
    } else {
      throw new Error(`Unknown operationType: ${draft.operationType}`);
    }

    await db.update(trinityFinancialDrafts)
      .set({
        approvalStatus: 'executed',
        executionResult: result as Record<string, unknown>,
        executedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(trinityFinancialDrafts.id, draftId));

    log.info('[FinancialConscience] Draft executed successfully', { draftId, operationType: draft.operationType });
    return { success: true, message: `${draft.operationType} executed successfully.`, result };
  } catch (execErr: unknown) {
    const errMsg = execErr instanceof Error ? execErr.message : String(execErr);
    await db.update(trinityFinancialDrafts)
      .set({
        approvalStatus: 'failed',
        executionError: errMsg,
        updatedAt: new Date(),
      })
      .where(eq(trinityFinancialDrafts.id, draftId));

    log.error('[FinancialConscience] Draft execution failed', { draftId, error: errMsg });
    return { success: false, error: errMsg };
  }
}

// ─── Get Pending Drafts ───────────────────────────────────────────────────────

export async function getPendingFinancialDrafts(workspaceId: string) {
  return db
    .select()
    .from(trinityFinancialDrafts)
    .where(
      and(
        eq(trinityFinancialDrafts.workspaceId, workspaceId),
        eq(trinityFinancialDrafts.approvalStatus, 'pending_approval'),
      )
    )
    .orderBy(trinityFinancialDrafts.createdAt);
}
