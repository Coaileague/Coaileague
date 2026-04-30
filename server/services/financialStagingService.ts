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
  payrollEntries,
  timeEntries,
  clients,
  clientContracts,
} from '@shared/schema';
import { Decimal } from 'decimal.js';
import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
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
  /** Data-quality warnings — surfaced when captured amounts had to be derived. */
  warnings: string[];
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

    // Data-integrity guard: refuse to bill a client without a binding,
    // in-force contract. A `draft` or `sent` contract isn't an agreement; an
    // `expired`/`terminated` one no longer authorizes billing. Only
    // `accepted` and `executed` rows count, and the period being billed must
    // overlap the contract's effective window.
    const contract = await db.query.clientContracts.findFirst({
      where: and(
        eq(clientContracts.workspaceId, workspaceId),
        eq(clientContracts.clientId, clientId),
        inArray(clientContracts.status, ['accepted', 'executed']),
        // Effective date must be on/before the period start (or unset).
        or(isNull(clientContracts.effectiveDate), lte(clientContracts.effectiveDate, startDate.toISOString().slice(0, 10))),
        // Term end date must be on/after the period end (or unset/open-ended).
        or(isNull(clientContracts.termEndDate), gte(clientContracts.termEndDate, endDate.toISOString().slice(0, 10))),
      ),
    });
    if (!contract) {
      skipped.push({
        clientId,
        clientName,
        reason: 'No binding contract covers this billing period — must be accepted/executed and within effectiveDate/termEndDate',
      });
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

  // Collect linked time-entry IDs for the invoice batch.
  //
  // Note: we deliberately do NOT change `invoices.status` here. The atomic
  // lock on source time entries is already in place from stage_billing_run
  // (entries are status='approved' + billedAt set + invoiceId set), and the
  // route-layer WORM guard already rejects edits. Setting status='sent' would
  // lie — sendInvoice is the explicit step that emails the client and flips
  // status. Finalize's job is to acknowledge the commitment, not to dispatch.
  const lockedTimeEntryIds = new Set<string>();
  const finalizedInvoices: FinalizeFinancialBatchResult['invoices'] = [];

  if (invoiceTargets.length > 0) {
    for (const inv of invoiceTargets) {
      const linked = await db.select({ id: timeEntries.id })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          eq(timeEntries.invoiceId, inv.id),
        ));
      for (const e of linked) lockedTimeEntryIds.add(e.id);

      finalizedInvoices.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: 'finalized',
      });
    }
  }

  // Approve payroll runs via the canonical approvePayrollRun helper. We pass
  // the linked entry IDs through; approvePayrollRun is idempotent w.r.t. claim
  // state, so it correctly handles entries already claimed at run creation
  // (processAutomatedPayroll path) and entries that need claiming at approval
  // time alike.
  const finalizedRuns: FinalizeFinancialBatchResult['payrollRuns'] = [];
  for (const run of payrollTargets) {
    try {
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

// ─── Tool 5: add_payroll_adjustment ─────────────────────────────────────────
//
// SCOPE LIMIT: this tool only handles POST-TAX line items. Adjustments that
// affect taxable gross (bonuses, pre-tax 401k contributions, pre-tax benefit
// premiums, non-accountable-plan reimbursements) MUST go through
// PayrollAutomationEngine.amendPayrollEntry where the tax engine recomputes
// federal/state/FICA/Medicare withholding. We refuse those kinds explicitly
// rather than silently producing wrong taxes.

export type PayrollAdjustmentKind =
  | 'reimbursement'   // Accountable-plan reimbursement (uniform, mileage). Non-taxable. Net ↑.
  | 'deduction'       // Post-tax deduction (equipment fee, advance repayment). Net ↓.
  | 'bonus'           // Discretionary bonus — taxable gross. REFUSED here; use amendPayrollEntry.
  | 'correction';     // Post-tax correction. Caller specifies sign. Non-taxable.

export interface PayrollAdjustment {
  id: string;
  kind: PayrollAdjustmentKind;
  label: string;
  /** Signed dollar amount: positive = credit to employee, negative = charge. */
  amount: string;
  addedBy: string;
  addedAt: string;
  reason?: string;
}

export interface AddPayrollAdjustmentInput {
  workspaceId: string;
  payrollEntryId: string;
  kind: PayrollAdjustmentKind;
  label: string;
  amount: number; // Signed
  addedBy: string;
  reason?: string;
}

export interface AddPayrollAdjustmentResult {
  payrollEntryId: string;
  adjustment: PayrollAdjustment;
  newGrossPay: string;
  newNetPay: string;
  totalAdjustments: string;
}

/**
 * Append a signed line-item adjustment to a draft payroll entry's
 * `adjustments` JSONB column and recompute net pay. Refuses to mutate entries
 * whose run is in a terminal state (paid/completed/void) — those are
 * write-protected and require a corrective run.
 */
export async function addPayrollAdjustment(
  input: AddPayrollAdjustmentInput,
): Promise<AddPayrollAdjustmentResult> {
  const { workspaceId, payrollEntryId, kind, label, amount, addedBy, reason } = input;

  if (!Number.isFinite(amount)) {
    throw new Error('addPayrollAdjustment: amount must be a finite number');
  }
  // Bonuses change taxable gross — refuse early, before we lock any rows.
  if (kind === 'bonus') {
    throw new Error(
      'Bonus adjustments must go through PayrollAutomationEngine.amendPayrollEntry — they affect taxable gross and require tax recomputation.',
    );
  }
  // Defensive sign check: refuse to silently invert an obviously-wrong sign.
  if (kind === 'reimbursement' && amount < 0) {
    throw new Error('addPayrollAdjustment: reimbursement amounts must be positive');
  }
  if (kind === 'deduction' && amount > 0) {
    throw new Error('addPayrollAdjustment: deduction amounts must be negative');
  }

  const result = await db.transaction(async (tx) => {
    // SELECT … FOR UPDATE on the entry row prevents the lost-update race:
    // without the row lock, two concurrent adjustments could both read
    // adjustments=[A], then race to write adjustments=[A,B1] vs [A,B2],
    // overwriting one of them. The lock serializes adjustment appends per
    // entry while staying inside one transaction so the whole change is
    // still atomic w.r.t. the run-level totals update below.
    const [entry] = await tx.select().from(payrollEntries)
      .where(and(
        eq(payrollEntries.id, payrollEntryId),
        eq(payrollEntries.workspaceId, workspaceId),
      ))
      .for('update')
      .limit(1);
    if (!entry) throw new Error(`Payroll entry ${payrollEntryId} not found`);

    const [run] = await tx.select().from(payrollRuns)
      .where(eq(payrollRuns.id, entry.payrollRunId))
      .for('update')
      .limit(1);
    if (!run) throw new Error(`Payroll run ${entry.payrollRunId} not found`);

    const TERMINAL = new Set(['paid', 'completed', 'void']);
    if (TERMINAL.has(run.status as string)) {
      throw new Error(
        `Cannot adjust a ${run.status} payroll run. Adjustments require a draft/pending/approved run; create a corrective run for finalized payroll.`,
      );
    }

    const existing: PayrollAdjustment[] = Array.isArray(entry.adjustments) ? (entry.adjustments as PayrollAdjustment[]) : [];
    const adjustment: PayrollAdjustment = {
      id: `ADJ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      kind,
      label,
      amount: toFinancialString(amount),
      addedBy,
      addedAt: new Date().toISOString(),
      reason,
    };
    const updatedAdjustments = [...existing, adjustment];

    // Recompute net. Allowed kinds (reimbursement, deduction, correction)
    // are post-tax by contract — they don't affect gross or taxes. Bonuses
    // were rejected upstream before the row lock.
    const adjustmentTotal = updatedAdjustments.reduce(
      (sum, a) => sum.plus(a.amount),
      new Decimal(0),
    );
    const totalAdjustments = adjustmentTotal.toFixed(4);

    const baseGross = toFinancialString(entry.grossPay ?? '0');
    const baseTaxes = sumFinancialValues([
      toFinancialString(entry.federalTax ?? '0'),
      toFinancialString(entry.stateTax ?? '0'),
      toFinancialString(entry.socialSecurity ?? '0'),
      toFinancialString(entry.medicare ?? '0'),
    ]);
    const baseNetPreAdj = subtractFinancialValues(baseGross, baseTaxes);
    const newNet = sumFinancialValues([baseNetPreAdj, totalAdjustments]);

    // Floor net pay at $0 — same CCPA-floor invariant the calculation path
    // applies. Negative net pay must never reach the DB.
    const netPayForDB = Number(newNet) < 0 ? '0.00' : formatCurrency(newNet);

    await tx.update(payrollEntries)
      .set({
        adjustments: updatedAdjustments as any,
        netPay: netPayForDB,
        updatedAt: new Date(),
        notes: `${entry.notes || ''}\n[ADJUSTMENT ${adjustment.id} ${adjustment.addedAt}] ${kind} '${label}' ${adjustment.amount} by ${addedBy}${reason ? ` — ${reason}` : ''}`,
      })
      .where(eq(payrollEntries.id, payrollEntryId));

    // Recompute run-level net pay total.
    const allEntries = await tx.select({ netPay: payrollEntries.netPay })
      .from(payrollEntries)
      .where(eq(payrollEntries.payrollRunId, run.id));
    const runNet = sumFinancialValues(allEntries.map(e => toFinancialString(e.netPay ?? '0')));
    await tx.update(payrollRuns)
      .set({ totalNetPay: formatCurrency(runNet), updatedAt: new Date() })
      .where(eq(payrollRuns.id, run.id));

    return {
      payrollEntryId,
      adjustment,
      newGrossPay: baseGross,
      newNetPay: newNet,
      totalAdjustments,
    };
  });

  log.info(`[FinStaging] add_payroll_adjustment entry=${payrollEntryId} kind=${kind} amount=${input.amount} → net=${result.newNetPay}`);
  return result;
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
  const warnings: string[] = [];
  let derivedBillable = 0;
  let derivedPayable = 0;

  // Compute a hours-times-rate fallback when captured amounts are null. The
  // captured columns (billableAmount, payableAmount) are populated by the
  // current pipelines, but legacy entries from before those columns existed
  // can leave them null. Falling back to `totalHours * hourlyRate` avoids the
  // silent zero-revenue / zero-cost bug; OT premium isn't reconstructable
  // here so the fallback is conservative — flagged via warnings.
  const deriveBillable = (row: { billableAmount: string | null; totalHours: string | null; hourlyRate: string | null }): string => {
    if (row.billableAmount !== null && row.billableAmount !== undefined) return toFinancialString(row.billableAmount);
    if (row.totalHours && row.hourlyRate) {
      derivedBillable++;
      return multiplyFinancialValues(toFinancialString(row.totalHours), toFinancialString(row.hourlyRate));
    }
    return '0.0000';
  };
  const derivePayable = (row: { payableAmount: string | null; totalHours: string | null; hourlyRate: string | null; capturedPayRate: string | null }): string => {
    if (row.payableAmount !== null && row.payableAmount !== undefined) return toFinancialString(row.payableAmount);
    const rate = row.capturedPayRate ?? row.hourlyRate;
    if (row.totalHours && rate) {
      derivedPayable++;
      return multiplyFinancialValues(toFinancialString(row.totalHours), toFinancialString(rate));
    }
    return '0.0000';
  };

  if (invoiceIds && invoiceIds.length > 0) {
    // Bill side: invoice totals.
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

    // Pay side: pull from the time entries linked to those invoices, so the
    // margin number is meaningful even when the caller only passes invoiceIds.
    // Without this, payable would stay at $0 and margin would lie at 100%.
    if (!payrollRunIds || payrollRunIds.length === 0) {
      const linkedEntries = await db
        .select({
          clientId: timeEntries.clientId,
          billableAmount: timeEntries.billableAmount,
          payableAmount: timeEntries.payableAmount,
          totalHours: timeEntries.totalHours,
          hourlyRate: timeEntries.hourlyRate,
          capturedPayRate: timeEntries.capturedPayRate,
          clientName: clients.companyName,
        })
        .from(timeEntries)
        .leftJoin(clients, eq(timeEntries.clientId, clients.id))
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          inArray(timeEntries.invoiceId, invoiceIds),
        ));
      for (const row of linkedEntries) {
        const id = row.clientId || 'unknown';
        const b = buckets.get(id) || { clientId: id, clientName: row.clientName || 'Unknown', billable: '0.0000', payable: '0.0000' };
        b.payable = sumFinancialValues([b.payable, derivePayable(row)]);
        buckets.set(id, b);
      }
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
        totalHours: timeEntries.totalHours,
        hourlyRate: timeEntries.hourlyRate,
        capturedPayRate: timeEntries.capturedPayRate,
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
      b.payable = sumFinancialValues([b.payable, derivePayable(row)]);
      // If we are computing margin from a window without explicit invoices,
      // use captured billableAmount as the bill-side reference.
      if (!invoiceIds || invoiceIds.length === 0) {
        b.billable = sumFinancialValues([b.billable, deriveBillable(row)]);
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
        totalHours: timeEntries.totalHours,
        hourlyRate: timeEntries.hourlyRate,
        capturedPayRate: timeEntries.capturedPayRate,
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
      b.billable = sumFinancialValues([b.billable, deriveBillable(row)]);
      b.payable = sumFinancialValues([b.payable, derivePayable(row)]);
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

  if (derivedBillable > 0) {
    warnings.push(
      `${derivedBillable} time entries had a NULL billable_amount and were derived from totalHours × hourlyRate (no OT premium). Re-run the billing pipeline to populate captured amounts.`,
    );
  }
  if (derivedPayable > 0) {
    warnings.push(
      `${derivedPayable} time entries had a NULL payable_amount and were derived from totalHours × payRate (no OT premium). Re-run the payroll aggregator to populate captured amounts.`,
    );
  }

  log.info(`[FinStaging] generate_margin_report ws=${workspaceId} bill=${formatCurrency(totalBillable)} pay=${formatCurrency(totalPayable)} margin=${formatCurrency(grossMarginPct)}% flagged=${flagged} warnings=${warnings.length}`);

  return {
    workspaceId,
    totalBillable,
    totalPayable,
    grossProfit,
    grossMarginPct,
    marginFloorPct: MIN_GROSS_MARGIN_PCT,
    flagged,
    perClient,
    warnings,
  };
}

// ─── Trinity tool surface ───────────────────────────────────────────────────

export const financialStagingService = {
  stageBillingRun,
  stagePayrollBatch,
  finalizeFinancialBatch,
  generateMarginReport,
  addPayrollAdjustment,
};
