/**
 * Trinity Revenue Chain — Dev Repair & Simulation API
 *
 * Provides three endpoints for the Acme Security dev workspace:
 *
 *   POST /api/trinity/dev/repair-invoices
 *     Removes duplicate draft invoices, resets billedAt on time entries,
 *     then re-runs billing once with the race-condition-free atomic path.
 *
 *   POST /api/trinity/dev/run-payroll
 *     Runs payroll automation for a given period using approved time entries.
 *     Bypasses the human-approval gate that normally blocks automated payroll —
 *     safe for dev/simulation only.
 *
 *   POST /api/trinity/dev/simulate-week
 *     Generates realistic time entries for the current week's scheduled shifts
 *     that have no clock-in/out data yet, then chains billing + payroll.
 *
 * All endpoints are root_admin / org_owner only and blocked in production.
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { db } from '../db';
import {
  invoices,
  invoiceLineItems,
  timeEntries,
  shifts,
  employees,
  clients,
  payrollRuns,
  workspaces,
} from '@shared/schema';
import {
  and,
  eq,
  inArray,
  isNull,
  isNotNull,
  gte,
  lte,
  lt,
  sql,
  ne,
} from 'drizzle-orm';
import { generateWeeklyInvoices } from '../services/billingAutomation';
import { PayrollAutomationEngine } from '../services/payrollAutomation';
import { AtomicFinancialLockService } from '../services/atomicFinancialLockService';
import { requireOwner } from '../rbac';
import { requireWorkspaceId, requireUserId } from '../utils/apiResponse';
import { calculateInvoiceLineItem, calculateRegularPay, toFinancialString } from '../services/financialCalculator';
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('TrinityRevenueRoutes');


const router = Router();

router.use(requireOwner);

function isDevOnly(req: Request, res: Response): boolean {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({ error: 'Dev simulation endpoints disabled in production' });
    return true;
  }
  return false;
}

/**
 * POST /api/trinity/dev/repair-invoices
 *
 * Cleans up the duplicate draft invoices created by the concurrent billing race
 * condition. Steps:
 *   1. Delete all draft invoices + their line items for the dev workspace
 *   2. Reset billedAt + invoiceId on all time entries for the workspace
 *   3. Re-run billing once — the new atomic-claim code prevents duplicates
 */
router.post('/dev/repair-invoices', async (req: Request, res: Response) => {
  if (isDevOnly(req, res)) return;

  const workspaceId = requireWorkspaceId(req, res);
  if (!workspaceId) return;

  try {
    log.info(`[TrinityRevenue] Starting invoice repair for workspace ${workspaceId}`);

    // Step 1: Find all draft invoices for the workspace.
    const draftInvoiceIds = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.workspaceId, workspaceId), eq(invoices.status, 'draft')));

    // Step 2: Release time_entries from each draft invoice via the canonical
    // gatekeeper BEFORE deleting anything. The previous version did a bulk
    // `UPDATE time_entries SET billedAt=NULL WHERE billedAt IS NOT NULL`,
    // which would orphan time_entries that were attached to sent/paid
    // invoices — silently breaking real receivables. releaseFromInvoice
    // refuses to release entries from non-draft invoices, so this can only
    // affect draft inventory now.
    let entriesReleased = 0;
    for (const { id } of draftInvoiceIds) {
      const { released } = await AtomicFinancialLockService.releaseFromInvoice(id);
      entriesReleased += released;
    }

    // Step 3: Delete line items for the now-released draft invoices.
    let lineItemsDeleted = 0;
    if (draftInvoiceIds.length > 0) {
      const ids = draftInvoiceIds.map(i => i.id);
      const deleted = await db
        .delete(invoiceLineItems)
        .where(inArray(invoiceLineItems.invoiceId, ids))
        .returning({ id: invoiceLineItems.id });
      lineItemsDeleted = deleted.length;
    }

    // Step 4: Delete the draft invoice rows themselves.
    const deletedInvoices = await db
      .delete(invoices)
      .where(and(eq(invoices.workspaceId, workspaceId), eq(invoices.status, 'draft')))
      .returning({ id: invoices.id });

    log.info(`[TrinityRevenue] Cleaned: ${deletedInvoices.length} invoices, ${lineItemsDeleted} line items, ${entriesReleased} entries released`);

    // Step 5: Re-run billing with the atomic-claim fix
    const now = new Date();
    const periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - 30); // cover last 30 days
    periodStart.setHours(0, 0, 0, 0);

    const newInvoices = await generateWeeklyInvoices(workspaceId, now, 30);

    res.json({
      success: true,
      repair: {
        invoicesDeleted: deletedInvoices.length,
        lineItemsDeleted,
        entriesReleased,
      },
      billing: {
        invoicesGenerated: newInvoices.invoicesGenerated,
        totalBillable: newInvoices.totalInvoiced,
        skippedClients: newInvoices.skippedClients,
      },
    });
  } catch (err: unknown) {
    log.error('[TrinityRevenue] repair-invoices failed:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * POST /api/trinity/dev/run-payroll
 *
 * Runs PayrollAutomationEngine.processAutomatedPayroll for a given period
 * directly — bypassing the approval gate that blocks automated payroll in prod.
 * Dev only.
 *
 * Body: { workspaceId?, periodStart?, periodEnd? }
 *   periodStart/periodEnd: ISO date strings. Defaults to current bi-weekly period.
 */
router.post('/dev/run-payroll', async (req: Request, res: Response) => {
  if (isDevOnly(req, res)) return;

  const workspaceId = requireWorkspaceId(req, res);
  if (!workspaceId) return;
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const periodStart = req.body?.periodStart
      ? new Date(req.body.periodStart)
      : undefined;
    const periodEnd = req.body?.periodEnd
      ? new Date(req.body.periodEnd)
      : undefined;

    log.info(`[TrinityRevenue] Running payroll for ${workspaceId}`, { periodStart, periodEnd });

    const result = await PayrollAutomationEngine.processAutomatedPayroll(
      workspaceId,
      userId,
      periodStart,
      periodEnd
    );

    res.json({
      success: true,
      payrollRunId: result.payrollRunId,
      totalEmployees: result.totalEmployees,
      totalGrossPay: result.totalGrossPay,
      totalNetPay: result.totalNetPay,
      timeEntryIds: result.timeEntryIds,
      warnings: result.warnings,
    });
  } catch (err: unknown) {
    log.error('[TrinityRevenue] run-payroll failed:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * POST /api/trinity/dev/simulate-week
 *
 * Generates time entries for all scheduled shifts in the current week that
 * have no clock-in/out recorded. Uses actual shift times, bill_rate, and
 * employee hourly_rate from the database — no hardcoded values.
 *
 * After creating entries, chains billing + payroll.
 *
 * Body: { workspaceId?, weekStart?, weekEnd? }
 */
router.post('/dev/simulate-week', async (req: Request, res: Response) => {
  if (isDevOnly(req, res)) return;

  const workspaceId = requireWorkspaceId(req, res);
  if (!workspaceId) return;
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    // Default week: today ± 3 days (Monday–Sunday of current week)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = req.body?.weekStart
      ? new Date(req.body.weekStart)
      : (() => { const d = new Date(now); d.setDate(d.getDate() + daysToMonday); d.setHours(0, 0, 0, 0); return d; })();
    const weekEnd = req.body?.weekEnd
      ? new Date(req.body.weekEnd)
      : (() => { const d = new Date(weekStart); d.setDate(d.getDate() + 6); d.setHours(23, 59, 59, 999); return d; })();

    log.info(`[TrinityRevenue] Simulating week ${weekStart.toISOString()} – ${weekEnd.toISOString()} for ${workspaceId}`);

    // Get workspace defaults
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Find all shifts with employees assigned that ended before now and have no time entry
    const cutoff = new Date(Math.min(now.getTime(), weekEnd.getTime()));

    // Get all shift IDs that already have time entries
    const existingEntries = await db
      .select({ shiftId: timeEntries.shiftId })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          isNotNull(timeEntries.shiftId),
        )
      );
    const coveredShiftIds = new Set(existingEntries.map(r => r.shiftId).filter(Boolean) as string[]);

    // Find scheduled shifts in the week with employees that ended before cutoff
    const weekShifts = await db
      .select({
        shift: shifts,
        employee: employees,
        client: clients,
      })
      .from(shifts)
      .leftJoin(employees, eq(shifts.employeeId, employees.id))
      .leftJoin(clients, eq(shifts.clientId, clients.id))
      .where(
        and(
          eq(shifts.workspaceId, workspaceId),
          isNotNull(shifts.employeeId),
          gte(shifts.startTime, weekStart),
          lte(shifts.startTime, weekEnd),
          lt(shifts.endTime, cutoff),
          sql`${shifts.status} NOT IN ('draft', 'cancelled')`,
          eq(shifts.isTrainingShift, false),
        )
      );

    const unprocessed = weekShifts.filter(row => !coveredShiftIds.has(row.shift.id));

    if (unprocessed.length === 0) {
      return res.json({
        success: true,
        message: 'No unprocessed scheduled shifts found in the selected week.',
        timeEntriesCreated: 0,
        billing: null,
        payroll: null,
      });
    }

    // Generate time entries from actual shift data
    const createdEntryIds: string[] = [];
    let entriesSkipped = 0;
    const now2 = new Date();

    for (const { shift, employee, client } of unprocessed) {
      try {
        const startTime = new Date(shift.startTime);
        const endTime = new Date(shift.endTime);
        const totalMs = endTime.getTime() - startTime.getTime();
        const totalHours = Math.max(0, totalMs / (1000 * 60 * 60));

        if (totalHours <= 0) { entriesSkipped++; continue; }
        if (!shift.employeeId) { entriesSkipped++; continue; }

        // Rate resolution precedence:
        // 1. shift.billRate (most specific — set by scheduler)
        // 2. shift.contractRate (from client contract)
        // 3. client.contractRate (client default)
        // 4. workspace.defaultBillableRate (fallback)
        const capturedBillRate =
          shift.billRate ||
          shift.contractRate ||
          client?.contractRate ||
          workspace.defaultBillableRate ||
          null;

        // Pay rate: shift.payRate → employee.hourlyRate → workspace default
        const capturedPayRate =
          shift.payRate ||
          employee?.hourlyRate ||
          workspace.defaultHourlyRate ||
          null;

        // Convert time-arithmetic result to financial string before any calculation
        const totalHoursStr = toFinancialString(totalHours);
        // Use FinancialCalculator — no native arithmetic on financial values
        const billableAmountStr = capturedBillRate ? calculateInvoiceLineItem(totalHoursStr, String(capturedBillRate)) : null;
        const payableAmountStr = capturedPayRate ? calculateRegularPay(totalHoursStr, String(capturedPayRate)) : null;

        const [inserted] = await db
          .insert(timeEntries)
          .values({
            workspaceId,
            shiftId: shift.id,
            employeeId: shift.employeeId,
            clientId: shift.clientId ?? null,
            subClientId: shift.subClientId ?? null,
            siteId: shift.siteId ?? null,
            clockIn: startTime,
            clockOut: endTime,
            totalHours: totalHoursStr,
            regularHours: totalHoursStr,
            capturedBillRate,
            capturedPayRate,
            billableAmount: billableAmountStr,
            payableAmount: payableAmountStr,
            totalAmount: billableAmountStr,
            billableToClient: shift.billableToClient ?? true,
            status: 'approved',
            approvedAt: now2,
            notes: `[TRINITY-SIM] Simulated from scheduled shift ${shift.id}. Rates from ${capturedBillRate ? 'shift/client' : 'workspace defaults'}.`,
            createdAt: now2,
            updatedAt: now2,
          })
          .returning({ id: timeEntries.id });

        if (inserted?.id) {
          createdEntryIds.push(inserted.id);
        }
      } catch (entryErr: unknown) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        log.error(`[TrinityRevenue] Failed to create entry for shift ${shift.id}:`, entryErr.message);
        entriesSkipped++;
      }
    }

    log.info(`[TrinityRevenue] Created ${createdEntryIds.length} time entries, skipped ${entriesSkipped}`);

    // Run billing for the week period
    let billingResult: any = null;
    try {
      billingResult = await generateWeeklyInvoices(workspaceId, weekEnd, 7);
    } catch (billErr: unknown) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      log.error('[TrinityRevenue] Billing failed after simulation:', billErr.message);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      billingResult = { error: billErr.message };
    }

    // Run payroll for the week period
    let payrollResult: any = null;
    try {
      payrollResult = await PayrollAutomationEngine.processAutomatedPayroll(
        workspaceId,
        userId,
        weekStart,
        weekEnd,
      );
    } catch (prErr: unknown) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      log.error('[TrinityRevenue] Payroll failed after simulation:', prErr.message);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      payrollResult = { error: prErr.message };
    }

    res.json({
      success: true,
      week: { start: weekStart.toISOString(), end: weekEnd.toISOString() },
      simulation: {
        shiftsEvaluated: weekShifts.length,
        shiftsAlreadyCovered: coveredShiftIds.size,
        timeEntriesCreated: createdEntryIds.length,
        skipped: entriesSkipped,
      },
      billing: billingResult
        ? {
            invoicesGenerated: billingResult.invoicesGenerated ?? 0,
            totalBillable: billingResult.totalInvoiced ?? 0,
            error: billingResult.error ?? null,
          }
        : null,
      payroll: payrollResult
        ? {
            payrollRunId: payrollResult.payrollRunId ?? null,
            totalEmployees: payrollResult.totalEmployees ?? 0,
            totalGrossPay: payrollResult.totalGrossPay ?? 0,
            totalNetPay: payrollResult.totalNetPay ?? 0,
            warnings: payrollResult.warnings ?? [],
            error: payrollResult.error ?? null,
          }
        : null,
    });
  } catch (err: unknown) {
    log.error('[TrinityRevenue] simulate-week failed:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * GET /api/trinity/dev/pipeline-status
 *
 * Returns the current state of the Trinity revenue chain for a workspace:
 * shifts → time entries → invoices → payroll.
 */
router.get('/dev/pipeline-status', async (req: Request, res: Response) => {
  if (isDevOnly(req, res)) return;

  // @ts-expect-error — TS migration: fix in refactoring sprint
  const workspaceId: string = (req.query?.workspaceId as string) || DEV_WS;

  try {
    const statusResult = await db.execute<any>(sql`
      SELECT
        (SELECT COUNT(*) FROM shifts WHERE workspace_id = ${workspaceId} AND status = 'scheduled') AS scheduled_shifts,
        (SELECT COUNT(*) FROM shifts WHERE workspace_id = ${workspaceId} AND status = 'draft') AS draft_shifts,
        (SELECT COUNT(*) FROM time_entries WHERE workspace_id = ${workspaceId}) AS total_entries,
        (SELECT COUNT(*) FROM time_entries WHERE workspace_id = ${workspaceId} AND status = 'approved') AS approved_entries,
        (SELECT COUNT(*) FROM time_entries WHERE workspace_id = ${workspaceId} AND status = 'approved' AND billed_at IS NULL) AS unbilled_entries,
        (SELECT COUNT(*) FROM time_entries WHERE workspace_id = ${workspaceId} AND status = 'approved' AND payrolled_at IS NULL) AS unpayrolled_entries,
        (SELECT COALESCE(SUM(billable_amount::numeric), 0) FROM time_entries WHERE workspace_id = ${workspaceId} AND status = 'approved') AS total_billable,
        (SELECT COALESCE(SUM(payable_amount::numeric), 0) FROM time_entries WHERE workspace_id = ${workspaceId} AND status = 'approved') AS total_payable,
        (SELECT COUNT(*) FROM invoices WHERE workspace_id = ${workspaceId} AND status = 'draft') AS draft_invoices,
        (SELECT COUNT(*) FROM invoices WHERE workspace_id = ${workspaceId} AND status != 'draft') AS sent_invoices,
        (SELECT COALESCE(SUM(total::numeric), 0) FROM invoices WHERE workspace_id = ${workspaceId} AND status = 'draft') AS draft_invoice_total,
        (SELECT COUNT(*) FROM payroll_runs WHERE workspace_id = ${workspaceId} AND status = 'pending') AS pending_payroll_runs,
        (SELECT COUNT(*) FROM payroll_runs WHERE workspace_id = ${workspaceId} AND status = 'completed') AS completed_payroll_runs,
        (SELECT COALESCE(SUM(total_gross_pay::numeric), 0) FROM payroll_runs WHERE workspace_id = ${workspaceId} AND status = 'pending') AS pending_payroll_total
    `);
    const status = ((statusResult as any).rows ?? [])[0];

    res.json({ success: true, workspaceId, pipeline: status });
  } catch (err: unknown) {
    log.error('[TrinityRevenue] pipeline-status failed:', err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
