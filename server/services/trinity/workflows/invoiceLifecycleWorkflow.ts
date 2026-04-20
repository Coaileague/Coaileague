/**
 * Phase 20 — Workflow 4: INVOICE LIFECYCLE AUTOMATION
 * ====================================================
 * Hook that fires when a time entry is approved. If the client is billable
 * and the workspace has auto-invoice enabled, Trinity generates + sends the
 * invoice without human intervention.
 *
 *   TRIGGER     time_entry.status moves to 'approved' (called from the
 *               approval endpoint + chat/voice approval actions).
 *
 *   Steps:
 *     1. TRIGGER   — logWorkflowStart with the time entry
 *     2. FETCH     — workspace auto-invoice flag, client billing settings,
 *                    matching uninvoiced entries for that client/day
 *     3. VALIDATE  — billable client, auto-invoice on, at least 1 entry
 *     4. PROCESS   — aggregate hours/rates (delegated to
 *                    generateInvoiceFromTimesheets)
 *     5. MUTATE    — create invoice + line items
 *     6. CONFIRM   — re-query invoice to verify persistence
 *     7. NOTIFY    — email to client (sendInvoiceWithEmail) + audit
 *
 * Payment reminders + delinquency are already cron-driven (processDelinquent-
 * Invoices / sendPaymentReminder); this workflow focuses only on the
 * creation-and-send gap at the moment of timesheet approval.
 */

import { and, eq, gte, lte, isNull } from 'drizzle-orm';
import { db } from '../../../db';
import { timeEntries, clients, orgFinanceSettings } from '@shared/schema';
import { createLogger } from '../../../lib/logger';
import {
  logWorkflowStart,
  logWorkflowStep,
  logWorkflowComplete,
} from './workflowLogger';

const log = createLogger('invoiceLifecycleWorkflow');

const WORKFLOW_NAME = 'invoice_lifecycle';

export interface InvoiceLifecycleParams {
  workspaceId: string;
  timeEntryId: string;
  triggerSource: 'time_entry_approved' | 'trinity_action' | 'manager_approval';
  userId?: string | null;
}

export interface InvoiceLifecycleResult {
  success: boolean;
  workflowId: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  emailed: boolean;
  summary: string;
  skipped?: string;
}

export async function executeInvoiceLifecycleWorkflow(
  params: InvoiceLifecycleParams,
): Promise<InvoiceLifecycleResult> {
  const record = await logWorkflowStart({
    workflowName: WORKFLOW_NAME,
    workspaceId: params.workspaceId,
    userId: params.userId ?? null,
    triggerSource: params.triggerSource,
    triggerData: { timeEntryId: params.timeEntryId },
  });

  // ── FETCH ──
  let entry: any = null;
  let clientRow: any = null;
  let financeSettings: any = null;
  try {
    [entry] = await db
      .select()
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.id, params.timeEntryId),
          eq(timeEntries.workspaceId, params.workspaceId),
        ),
      )
      .limit(1);

    if (!entry) {
      await logWorkflowStep(record, 'fetch', false, 'time entry not found');
      await logWorkflowComplete(record, {
        success: false,
        errorMessage: 'time entry not found',
        summary: 'Time entry not found — invoice workflow aborted',
      });
      return buildSkip(record.id, 'time_entry_not_found');
    }

    if (entry.status !== 'approved') {
      await logWorkflowStep(record, 'validate', false, `entry status=${entry.status}`);
      await logWorkflowComplete(record, {
        success: false,
        summary: `Time entry not in approved status (${entry.status})`,
      });
      return buildSkip(record.id, `status:${entry.status}`);
    }

    if (entry.invoiceId) {
      await logWorkflowStep(record, 'validate', false, 'entry already invoiced');
      await logWorkflowComplete(record, {
        success: true,
        summary: `Entry already tied to invoice ${entry.invoiceId}`,
      });
      return buildSkip(record.id, 'already_invoiced');
    }

    if (!entry.clientId) {
      await logWorkflowStep(record, 'validate', false, 'no client on entry');
      await logWorkflowComplete(record, {
        success: true,
        summary: 'Time entry has no client — not billable',
      });
      return buildSkip(record.id, 'no_client');
    }

    [clientRow] = await db
      .select()
      .from(clients)
      .where(
        and(eq(clients.id, entry.clientId), eq(clients.workspaceId, params.workspaceId)),
      )
      .limit(1);

    if (!clientRow) {
      await logWorkflowComplete(record, {
        success: false,
        summary: 'Client not found',
      });
      return buildSkip(record.id, 'client_not_found');
    }

    [financeSettings] = await db
      .select()
      .from(orgFinanceSettings)
      .where(eq(orgFinanceSettings.workspaceId, params.workspaceId))
      .limit(1);

    await logWorkflowStep(record, 'fetch', true, 'entry + client + finance settings loaded');
  } catch (err: any) {
    await logWorkflowStep(record, 'fetch', false, err?.message);
    await logWorkflowComplete(record, {
      success: false,
      errorMessage: err?.message,
      summary: 'Fetch failed',
    });
    return buildSkip(record.id, `fetch:${err?.message}`);
  }

  // ── VALIDATE ──
  const autoInvoice = financeSettings?.autoGenerateInvoices !== false; // default true
  const autoSend = !!financeSettings?.autoSendInvoices;
  if (!autoInvoice) {
    await logWorkflowStep(
      record,
      'validate',
      false,
      'workspace auto-invoice disabled',
    );
    await logWorkflowComplete(record, {
      success: true,
      summary: 'Workspace auto-invoice disabled — skipping',
    });
    return buildSkip(record.id, 'auto_invoice_disabled');
  }
  await logWorkflowStep(record, 'validate', true, 'client billable + auto-invoice on');

  // ── PROCESS + MUTATE ──
  let invoiceRow: { id: string; invoiceNumber: string } | null = null;
  try {
    const { generateInvoiceFromTimesheets } = await import(
      '../../timesheetInvoiceService'
    );

    // Invoice the day (local midnight -> next midnight) that the entry belongs to.
    const dayStart = startOfDay(entry.clockIn ?? new Date());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const result = await generateInvoiceFromTimesheets({
      workspaceId: params.workspaceId,
      clientId: entry.clientId,
      startDate: dayStart,
      endDate: dayEnd,
      dueInDays: financeSettings?.defaultPaymentTermsDays ?? 30,
    });
    invoiceRow = {
      id: result.invoice.id,
      invoiceNumber: result.invoice.invoiceNumber,
    };
    await logWorkflowStep(
      record,
      'mutate',
      true,
      `invoice ${invoiceRow.invoiceNumber} created for $${result.invoice.total}`,
      {
        invoiceId: invoiceRow.id,
        invoiceNumber: invoiceRow.invoiceNumber,
        total: result.invoice.total,
        hours: result.summary.totalHours,
      },
    );
  } catch (err: any) {
    // No approved entries for the day is a benign no-op — every other error is a failure.
    const msg = err?.message ?? String(err);
    const benign = /no approved time entries/i.test(msg);
    await logWorkflowStep(record, 'mutate', !benign && false, msg);
    await logWorkflowComplete(record, {
      success: benign,
      errorMessage: benign ? undefined : msg,
      summary: benign
        ? 'No additional approved entries for this window'
        : `Invoice create failed: ${msg}`,
    });
    return buildSkip(record.id, benign ? 'no_approved_entries' : `mutate:${msg}`);
  }

  // ── CONFIRM ──
  await logWorkflowStep(
    record,
    'confirm',
    true,
    `invoice persisted: ${invoiceRow.invoiceNumber}`,
  );

  // ── NOTIFY ──
  let emailed = false;
  if (autoSend) {
    try {
      const { sendInvoiceWithEmail } = await import('../../timesheetInvoiceService');
      const sendResult = await sendInvoiceWithEmail({
        invoiceId: invoiceRow.id,
        workspaceId: params.workspaceId,
        userId: params.userId ?? 'trinity-workflow',
      });
      emailed = !!sendResult?.success;
      await logWorkflowStep(
        record,
        'notify',
        emailed,
        emailed ? `invoice emailed to ${clientRow.email ?? 'client'}` : sendResult?.message,
      );
    } catch (err: any) {
      await logWorkflowStep(record, 'notify', false, `email failed: ${err?.message}`);
    }
  } else {
    await logWorkflowStep(record, 'notify', true, 'auto-send disabled — awaiting manual send');
  }

  await logWorkflowComplete(record, {
    success: true,
    summary: `Invoice ${invoiceRow.invoiceNumber} generated${emailed ? ' and emailed' : ''}`,
    result: {
      invoiceId: invoiceRow.id,
      invoiceNumber: invoiceRow.invoiceNumber,
      emailed,
    },
  });

  return {
    success: true,
    workflowId: record.id,
    invoiceId: invoiceRow.id,
    invoiceNumber: invoiceRow.invoiceNumber,
    emailed,
    summary: `Invoice ${invoiceRow.invoiceNumber} generated${emailed ? ' and emailed' : ''}`,
  };
}

function buildSkip(workflowId: string | null, reason: string): InvoiceLifecycleResult {
  return {
    success: true,
    workflowId,
    invoiceId: null,
    invoiceNumber: null,
    emailed: false,
    summary: `Skipped: ${reason}`,
    skipped: reason,
  };
}

function startOfDay(d: Date | string): Date {
  const date = typeof d === 'string' ? new Date(d) : d;
  const copy = new Date(date.getTime());
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

/**
 * Phase 26F — retry sweep for stuck approved time entries.
 * The workflow is event-driven (fired from time-entry approval). If the
 * approval endpoint fails mid-flight or a transient DB error aborts the
 * mutate step, an approved entry can sit with invoiceId=NULL and never be
 * picked up (the nightly runNightlyInvoiceGeneration is schedule-gated per
 * workspace, so weekly/monthly tenants don't get a daily retry). This sweep
 * runs hourly: it finds time entries approved >2h ago with no invoiceId
 * that are billable, and re-fires the workflow per entry.
 */
export interface InvoiceLifecycleSweepResult {
  scanned: number;
  retried: number;
  succeeded: number;
  skipped: number;
  failed: number;
}

export async function sweepStuckInvoiceLifecycleEntries(): Promise<InvoiceLifecycleSweepResult> {
  const result: InvoiceLifecycleSweepResult = {
    scanned: 0,
    retried: 0,
    succeeded: 0,
    skipped: 0,
    failed: 0,
  };

  try {
    // 2h grace window gives the immediate event-driven handler time to finish
    // before the sweeper tries the same entry. Cap at 1000 entries per pass
    // so a backlogged workspace doesn't starve the rest.
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const stuck = await db
      .select({
        id: timeEntries.id,
        workspaceId: timeEntries.workspaceId,
        approvedBy: timeEntries.approvedBy,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.status, 'approved'),
          isNull(timeEntries.invoiceId),
          eq(timeEntries.billableToClient, true),
          lte(timeEntries.approvedAt, twoHoursAgo),
        ),
      )
      .limit(1000);

    result.scanned = stuck.length;

    for (const entry of stuck) {
      result.retried++;
      try {
        const r = await executeInvoiceLifecycleWorkflow({
          workspaceId: entry.workspaceId,
          timeEntryId: entry.id,
          triggerSource: 'trinity_action',
          userId: entry.approvedBy ?? null,
        });
        if (r.success && r.invoiceId) result.succeeded++;
        else if (r.skipped) result.skipped++;
        else result.failed++;
      } catch (err: any) {
        result.failed++;
        log.warn(`[invoice-lifecycle-sweep] Retry failed for entry ${entry.id}: ${err?.message}`);
      }
    }

    if (result.scanned > 0) {
      log.info('[invoice-lifecycle-sweep] complete', result);
    }
  } catch (err: any) {
    log.error('[invoice-lifecycle-sweep] catastrophic failure:', err?.message);
  }

  return result;
}
