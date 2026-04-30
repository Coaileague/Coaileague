/**
 * Financial Staging Service
 * =========================
 * The canonical "Trinity Financial Pipeline" service. Provides four atomic
 * mutators that move work-performed → revenue (invoices) and work-performed →
 * payroll, with a chain-of-custody audit at every stage.
 *
 *   stage_billing_run     → Draft invoices from approved time entries
 *   stage_payroll_batch   → Draft payroll run aggregating hours w/ 40h OT logic
 *   finalize_financial_batch → Lock drafts; entries become read-only via WORM
 *   generate_margin_report → Compare total bill vs total pay; flag <20% margin
 *
 * Atomic locking guarantees:
 *  - Invoice staging atomically claims source time entries via billedAt
 *    (timesheetInvoiceService transaction).
 *  - Payroll staging atomically claims source time entries via payrolledAt
 *    (claimPayrollTimeEntries inside the run transaction).
 *  - Finalization marks invoices `sent` and payroll runs `approved`. Once
 *    approved, edits to the linked time entries are blocked at the route layer
 *    (TIMESHEET_LOCKED in /api/time-entries/entries/:id PATCH).
 *
 * This service is a thin orchestrator on top of:
 *  - timesheetInvoiceService.generateInvoiceFromTimesheets
 *  - PayrollAutomationEngine.processAutomatedPayroll
 *  - PayrollAutomationEngine.approvePayrollRun
 *  - claimPayrollTimeEntries
 *
 * It does NOT duplicate calculation logic — the FinancialCalculator and the
 * payroll aggregator remain the only sources of truth for arithmetic.
 */

import { db } from '../db';
import {
  invoices,
  payrollRuns,
  timeEntries,
  clients,
  clientContracts,
} from '@shared/schema';
import { and, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import {
  formatCurrency,
  sumFinancialValues,
  toFinancialString,
  divideFinancialValues,
  multiplyFinancialValues,
  subtractFinancialValues,
} from './financialCalculator';
import { generateInvoiceFromTimesheets } from './timesheetInvoiceService';
import { PayrollAutomationEngine } from './payrollAutomation';
import { createLogger } from '../lib/logger';

const log = createLogger('financialStagingService');

const MIN_GROSS_MARGIN_PCT = '20'; // Margin floor — anything below is flagged.

// ─── Public types ───────────────────────────────────────────────────────────

export interface StageBillingRunInput {
  workspaceId: string;
  startDate: Date;
  endDate: Date;
  clientIds?: string[]; // optional scope; defaults to every client with hours
  taxRate?: number;
  dueInDays?: number;
  notes?: string;
}

export interface StageBillingRunResult {
  batchId: string;
  workspaceId: string;
  periodStart: Date;
  periodEnd: Date;
  draftInvoices: Array<{
    invoiceId: string;
    invoiceNumber: string;
    clientId: string;
    clientName: string;
    totalHours: number;
    billable: string; // 4-decimal financial string
    entriesCount: number;
  }>;
  skipped: Array<{ clientId: string; clientName: string; reason: string }>;
  totals: {
    invoiceCount: number;
    totalBillable: string;
    totalHours: number;
  };
}

export interface StagePayrollBatchInput {
  workspaceId: string;
  userId: string;
  periodStart?: Date;
  periodEnd?: Date;
}

export interface StagePayrollBatchResult {
  batchId: string;
  payrollRunId: string;
  workspaceId: string;
  periodStart: Date;
  periodEnd: Date;
  totals: {
    employeeCount: number;
    totalGrossPay: string;
    totalNetPay: string;
    totalHours: number;
  };
  warnings: string[];
}

export interface FinalizeFinancialBatchInput {
  workspaceId: string;
  approvedBy: string;
  invoiceIds?: string[]; // explicit list — defaults to every draft from the period
  payrollRunIds?: string[];
  reason?: string;
}

export interface FinalizeFinancialBatchResult {
  workspaceId: string;
  finalizedAt: Date;
  invoices: Array<{ invoiceId: string; invoiceNumber: string; status: string }>;
  payrollRuns: Array<{ payrollRunId: string; status: string }>;
  lockedTimeEntryIds: string[];
}

export interface MarginReportInput {
  workspaceId: string;
  invoiceIds?: string[];
  payrollRunIds?: string[];
  startDate?: Date;
  endDate?: Date;
}

export interface MarginReportResult {
  workspaceId: string;
  totalBillable: string;
  totalPayable: string;
  grossProfit: string;
  grossMarginPct: string;
  marginFloorPct: string;
  flagged: boolean;
  perClient: Array<{
    clientId: string;
    clientName: string;
    billable: string;
    payable: string;
    grossProfit: string;
    grossMarginPct: string;
    flagged: boolean;
  }>;
}

// ─── Tool 1: stage_billing_run ──────────────────────────────────────────────

/**
 * Generates draft invoices grouped by client for the given period.
 * Refuses to bill clients that have no contract or no bill rate (data-integrity
 * guard from the spec). Atomic claim of source time entries is delegated to
 * timesheetInvoiceService — that service performs the SELECT FOR UPDATE-style
 * billedAt claim inside a DB transaction.
 */
export async function stageBillingRun(
  input: StageBillingRunInput,
): Promise<StageBillingRunResult> {
  const { workspaceId, startDate, endDate, clientIds, taxRate = 0, dueInDays = 30, notes } = input;
  const batchId = `BILL-${Date.now().toString(36).toUpperCase()}`;

  log.info(`[FinStaging] stage_billing_run batchId=${batchId} ws=${workspaceId} period=${startDate.toISOString()}..${endDate.toISOString()}`);

  // Find every client with approved-and-unbilled hours in the period.
  const candidates = await db
    .selectDistinct({ clientId: timeEntries.clientId })
    .from(timeEntries)
    .where(and(
      eq(timeEntries.workspaceId, workspaceId),
      eq(timeEntries.status, 'approved'),
      isNull(timeEntries.billedAt),
      isNull(timeEntries.invoiceId),
      gte(timeEntries.clockIn, startDate),
      lte(timeEntries.clockIn, endDate),
    ));

  const candidateIds = candidates
    .map(c => c.clientId)
    .filter((id): id is string => Boolean(id))
    .filter(id => !clientIds || clientIds.includes(id));

  const drafts: StageBillingRunResult['draftInvoices'] = [];
  const skipped: StageBillingRunResult['skipped'] = [];

  for (const clientId of candidateIds) {
    const client = await db.query.clients.findFirst({
      where: and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)),
    });
    if (!client) {
      skipped.push({ clientId, clientName: 'unknown', reason: 'Client record missing' });
      continue;
    }
    const clientName = client.companyName || `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim() || clientId;

    // Data-integrity guard: refuse to bill a client without an executed contract.
    const contract = await db.query.clientContracts.findFirst({
      where: and(
        eq(clientContracts.workspaceId, workspaceId),
        eq(clientContracts.clientId, clientId),
      ),
    });
    if (!contract) {
      skipped.push({ clientId, clientName, reason: 'No client contract on file — billing requires a contract' });
      continue;
    }

    try {
      const generated = await generateInvoiceFromTimesheets({
        workspaceId,
        clientId,
        startDate,
        endDate,
        taxRate,
        dueInDays,
        notes: notes ?? `Trinity batch ${batchId}`,
      });
      drafts.push({
        invoiceId: generated.invoice.id,
        invoiceNumber: generated.invoice.invoiceNumber,
        clientId,
        clientName,
        totalHours: generated.summary.totalHours,
        billable: toFinancialString(generated.summary.totalAmount),
        entriesCount: generated.summary.entriesCount,
      });
    } catch (err: any) {
      const reason = err?.message || 'Unknown error';
      log.warn(`[FinStaging] Skipped client ${clientId}: ${reason}`);
      skipped.push({ clientId, clientName, reason });
    }
  }

  const totalBillable = sumFinancialValues(drafts.map(d => d.billable));
  const totalHours = drafts.reduce((sum, d) => sum + d.totalHours, 0);

  log.info(`[FinStaging] stage_billing_run batchId=${batchId} drafted=${drafts.length} skipped=${skipped.length} total=${formatCurrency(totalBillable)}`);

  return {
    batchId,
    workspaceId,
    periodStart: startDate,
    periodEnd: endDate,
    draftInvoices: drafts,
    skipped,
    totals: {
      invoiceCount: drafts.length,
      totalBillable,
      totalHours: Number(totalHours.toFixed(2)),
    },
  };
}

// ─── Tool 2: stage_payroll_batch ────────────────────────────────────────────

/**
 * Aggregates approved time entries into a draft payroll run. The 40-hour
 * weekly OT split + daily 8h OT logic is enforced upstream by
 * aggregatePayrollHours (FLSA-compliant). The run is created with
 * status='pending' and source time entries are atomically claimed inside the
 * same DB transaction as the run insert (see PayrollAutomationEngine.processAutomatedPayroll).
 */
export async function stagePayrollBatch(
  input: StagePayrollBatchInput,
): Promise<StagePayrollBatchResult> {
  const { workspaceId, userId, periodStart, periodEnd } = input;
  const batchId = `PAY-${Date.now().toString(36).toUpperCase()}`;

  log.info(`[FinStaging] stage_payroll_batch batchId=${batchId} ws=${workspaceId}`);

  const result = await PayrollAutomationEngine.processAutomatedPayroll(
    workspaceId,
    userId,
    periodStart,
    periodEnd,
  );

  // Read back the run to surface the period bounds the engine picked.
  const run = await db.query.payrollRuns.findFirst({
    where: eq(payrollRuns.id, result.payrollRunId),
  });
  if (!run) throw new Error(`Payroll run ${result.payrollRunId} disappeared after creation`);

  const totalHours = result.calculations.reduce(
    (sum, c) => sum + (c.regularHours || 0) + (c.overtimeHours || 0) + (c.holidayHours || 0),
    0,
  );

  log.info(`[FinStaging] stage_payroll_batch batchId=${batchId} runId=${result.payrollRunId} employees=${result.totalEmployees} gross=${result.totalGrossPay}`);

  return {
    batchId,
    payrollRunId: result.payrollRunId,
    workspaceId,
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    totals: {
      employeeCount: result.totalEmployees,
      totalGrossPay: toFinancialString(result.totalGrossPay),
      totalNetPay: toFinancialString(result.totalNetPay),
      totalHours: Number(totalHours.toFixed(2)),
    },
    warnings: result.warnings,
  };
}

// ─── Tool 3: finalize_financial_batch ───────────────────────────────────────

/**
 * Locks a draft batch:
 *   - Draft invoices → status='sent', sentAt=NOW
 *   - Draft/pending payroll runs → status='approved' via approvePayrollRun
 *
 * Once invoices are sent and payroll runs approved, the linked time entries
 * remain status='approved' and the route-layer WORM guard
 * (PATCH /api/time-entries/entries/:id) blocks any further edits with the
 * TIMESHEET_LOCKED error code. This is the "atomic lockout" the
 * Chain-of-Custody contract promises.
 */
export async function finalizeFinancialBatch(
  input: FinalizeFinancialBatchInput,
): Promise<FinalizeFinancialBatchResult> {
  const { workspaceId, approvedBy, reason } = input;
  const finalizedAt = new Date();

  // Resolve target IDs — caller can pass explicit lists or we finalize every
  // draft we can find in the workspace.
  const invoiceConditions = [
    eq(invoices.workspaceId, workspaceId),
    eq(invoices.status, 'draft'),
  ];
  if (input.invoiceIds && input.invoiceIds.length > 0) {
    invoiceConditions.push(inArray(invoices.id, input.invoiceIds));
  }
  const invoiceTargets = await db
    .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(and(...invoiceConditions));

  const payrollConditions = [
    eq(payrollRuns.workspaceId, workspaceId),
    inArray(payrollRuns.status, ['draft', 'pending']),
  ];
  if (input.payrollRunIds && input.payrollRunIds.length > 0) {
    payrollConditions.push(inArray(payrollRuns.id, input.payrollRunIds));
  }
  const payrollTargets = await db
    .select({ id: payrollRuns.id, status: payrollRuns.status })
    .from(payrollRuns)
    .where(and(...payrollConditions));

  log.info(`[FinStaging] finalize_financial_batch ws=${workspaceId} invoices=${invoiceTargets.length} payroll=${payrollTargets.length} reason=${reason ?? 'n/a'}`);

  // Lock invoices in a single transaction; collect linked time-entry IDs.
  const lockedTimeEntryIds = new Set<string>();
  const finalizedInvoices: FinalizeFinancialBatchResult['invoices'] = [];

  if (invoiceTargets.length > 0) {
    await db.transaction(async (tx) => {
      for (const inv of invoiceTargets) {
        await tx.update(invoices)
          .set({ status: 'sent', sentAt: finalizedAt, updatedAt: finalizedAt })
          .where(and(eq(invoices.id, inv.id), eq(invoices.workspaceId, workspaceId)));

        // Collect time entry IDs already linked via invoiceId.
        const linked = await tx.select({ id: timeEntries.id })
          .from(timeEntries)
          .where(and(
            eq(timeEntries.workspaceId, workspaceId),
            eq(timeEntries.invoiceId, inv.id),
          ));
        for (const e of linked) lockedTimeEntryIds.add(e.id);

        finalizedInvoices.push({ invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, status: 'sent' });
      }
    });
  }

  // Approve payroll runs via the canonical approvePayrollRun helper so the
  // approval audit + secondary time-entry claim runs through the same path
  // every other caller uses.
  const finalizedRuns: FinalizeFinancialBatchResult['payrollRuns'] = [];
  for (const run of payrollTargets) {
    try {
      // Pull the time entry IDs that belong to this run so the canonical
      // claimer can re-mark them within the approval transaction.
      const runEntries = await db
        .select({ id: timeEntries.id })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          eq(timeEntries.payrollRunId, run.id),
        ));
      const runEntryIds = runEntries.map(e => e.id);

      await PayrollAutomationEngine.approvePayrollRun(run.id, approvedBy, runEntryIds);
      runEntryIds.forEach(id => lockedTimeEntryIds.add(id));
      finalizedRuns.push({ payrollRunId: run.id, status: 'approved' });
    } catch (err: any) {
      log.warn(`[FinStaging] Payroll run ${run.id} approve failed: ${err?.message}`);
      finalizedRuns.push({ payrollRunId: run.id, status: `failed: ${err?.message ?? 'unknown'}` });
    }
  }

  log.info(`[FinStaging] finalize_financial_batch locked ${lockedTimeEntryIds.size} time entries (read-only via WORM guard)`);

  return {
    workspaceId,
    finalizedAt,
    invoices: finalizedInvoices,
    payrollRuns: finalizedRuns,
    lockedTimeEntryIds: Array.from(lockedTimeEntryIds),
  };
}

// ─── Tool 4: generate_margin_report ─────────────────────────────────────────

/**
 * Compares total billable vs total payable across a batch and per client.
 * Margin = (billable - payable) / billable * 100. Flags any cohort where
 * margin falls below MIN_GROSS_MARGIN_PCT.
 *
 * Inputs can be invoice IDs, payroll run IDs, or a date window. When given a
 * date window, the report computes per-client margin from approved time
 * entries' captured rates — bypassing the invoice/payroll join so the report
 * can run before drafts are even staged.
 */
export async function generateMarginReport(
  input: MarginReportInput,
): Promise<MarginReportResult> {
  const { workspaceId, invoiceIds, payrollRunIds, startDate, endDate } = input;

  type Bucket = { clientId: string; clientName: string; billable: string; payable: string };
  const buckets = new Map<string, Bucket>();

  if (invoiceIds && invoiceIds.length > 0) {
    const rows = await db
      .select({
        clientId: invoices.clientId,
        total: invoices.total,
        clientName: clients.companyName,
      })
      .from(invoices)
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(and(eq(invoices.workspaceId, workspaceId), inArray(invoices.id, invoiceIds)));
    for (const row of rows) {
      const id = row.clientId || 'unknown';
      const b = buckets.get(id) || { clientId: id, clientName: row.clientName || 'Unknown', billable: '0.0000', payable: '0.0000' };
      b.billable = sumFinancialValues([b.billable, toFinancialString(row.total ?? '0')]);
      buckets.set(id, b);
    }
  }

  if (payrollRunIds && payrollRunIds.length > 0) {
    // Sum payroll cost back to clients via the time entries linked to each
    // payroll entry. This keeps the report client-aware even though payroll
    // runs are workspace-scoped, not client-scoped.
    const entryRows = await db
      .select({
        clientId: timeEntries.clientId,
        billableAmount: timeEntries.billableAmount,
        payableAmount: timeEntries.payableAmount,
        clientName: clients.companyName,
      })
      .from(timeEntries)
      .leftJoin(clients, eq(timeEntries.clientId, clients.id))
      .where(and(
        eq(timeEntries.workspaceId, workspaceId),
        inArray(timeEntries.payrollRunId, payrollRunIds),
      ));
    for (const row of entryRows) {
      const id = row.clientId || 'unknown';
      const b = buckets.get(id) || { clientId: id, clientName: row.clientName || 'Unknown', billable: '0.0000', payable: '0.0000' };
      b.payable = sumFinancialValues([b.payable, toFinancialString(row.payableAmount ?? '0')]);
      // If we are computing margin from a window without explicit invoices,
      // use captured billableAmount as the bill-side reference.
      if (!invoiceIds || invoiceIds.length === 0) {
        b.billable = sumFinancialValues([b.billable, toFinancialString(row.billableAmount ?? '0')]);
      }
      buckets.set(id, b);
    }
  }

  if ((!invoiceIds || invoiceIds.length === 0) && (!payrollRunIds || payrollRunIds.length === 0) && startDate && endDate) {
    const rows = await db
      .select({
        clientId: timeEntries.clientId,
        billableAmount: timeEntries.billableAmount,
        payableAmount: timeEntries.payableAmount,
        clientName: clients.companyName,
      })
      .from(timeEntries)
      .leftJoin(clients, eq(timeEntries.clientId, clients.id))
      .where(and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.status, 'approved'),
        gte(timeEntries.clockIn, startDate),
        lte(timeEntries.clockIn, endDate),
      ));
    for (const row of rows) {
      const id = row.clientId || 'unknown';
      const b = buckets.get(id) || { clientId: id, clientName: row.clientName || 'Unknown', billable: '0.0000', payable: '0.0000' };
      b.billable = sumFinancialValues([b.billable, toFinancialString(row.billableAmount ?? '0')]);
      b.payable = sumFinancialValues([b.payable, toFinancialString(row.payableAmount ?? '0')]);
      buckets.set(id, b);
    }
  }

  const perClient = Array.from(buckets.values()).map(b => {
    const grossProfit = subtractFinancialValues(b.billable, b.payable);
    const grossMarginPct = Number(b.billable) > 0
      ? multiplyFinancialValues(divideFinancialValues(grossProfit, b.billable), '100')
      : '0.0000';
    const flagged = Number(grossMarginPct) < Number(MIN_GROSS_MARGIN_PCT);
    return {
      clientId: b.clientId,
      clientName: b.clientName,
      billable: b.billable,
      payable: b.payable,
      grossProfit,
      grossMarginPct,
      flagged,
    };
  });

  const totalBillable = sumFinancialValues(perClient.map(p => p.billable));
  const totalPayable = sumFinancialValues(perClient.map(p => p.payable));
  const grossProfit = subtractFinancialValues(totalBillable, totalPayable);
  const grossMarginPct = Number(totalBillable) > 0
    ? multiplyFinancialValues(divideFinancialValues(grossProfit, totalBillable), '100')
    : '0.0000';
  const flagged = Number(grossMarginPct) < Number(MIN_GROSS_MARGIN_PCT);

  log.info(`[FinStaging] generate_margin_report ws=${workspaceId} bill=${formatCurrency(totalBillable)} pay=${formatCurrency(totalPayable)} margin=${formatCurrency(grossMarginPct)}% flagged=${flagged}`);

  return {
    workspaceId,
    totalBillable,
    totalPayable,
    grossProfit,
    grossMarginPct,
    marginFloorPct: MIN_GROSS_MARGIN_PCT,
    flagged,
    perClient,
  };
}

// ─── Trinity tool surface ───────────────────────────────────────────────────

export const financialStagingService = {
  stageBillingRun,
  stagePayrollBatch,
  finalizeFinancialBatch,
  generateMarginReport,
};
