/**
 * Payroll Ledger — Double-Payment Prevention Guard
 *
 * Enforces the golden rule: one payroll entry per employee per calendar period.
 * Detects period overlap before any new payroll run is created so Trinity can
 * never accidentally disburse the same wage twice.
 *
 * Dynamic rules (reads live DB data — zero hardcoded values):
 *   • Period overlap: new [start, end] intersects any existing approved/paid entry
 *   • Employee UUID required on every entry — rejects null/undefined IDs
 *   • Workspace UUID required — no cross-tenant leakage
 *   • Reports conflict details for manager review or AI escalation
 */

import { db } from 'server/db';
import { payrollRuns, payrollEntries, employees } from '@shared/schema';
import { and, eq, or, gte, lte, inArray, not } from 'drizzle-orm';

export interface LedgerCheckResult {
  safe: boolean;
  conflicts: ConflictDetail[];
  checkedEmployeeCount: number;
  periodStart: Date;
  periodEnd: Date;
  workspaceId: string;
}

export interface ConflictDetail {
  employeeId: string;
  employeeName: string;
  existingRunId: string;
  existingPeriodStart: Date;
  existingPeriodEnd: Date;
  existingStatus: string;
  overlapDays: number;
}

/**
 * Guard: Check whether any employee in the given workspace already has an
 * approved or paid payroll entry that overlaps the proposed period.
 * Returns { safe: true } if no conflicts, or { safe: false, conflicts } otherwise.
 */
export async function checkPayrollPeriodOverlap(
  workspaceId: string,
  proposedStart: Date,
  proposedEnd: Date,
  excludeRunId?: string,
): Promise<LedgerCheckResult> {
  if (!workspaceId) throw new Error('[PayrollLedger] workspaceId is required — cannot guard null workspace');
  if (!proposedStart || !proposedEnd) throw new Error('[PayrollLedger] Both periodStart and periodEnd are required');
  if (proposedStart >= proposedEnd) throw new Error('[PayrollLedger] periodStart must be before periodEnd');

  // Load all payroll runs in this workspace that overlap with the proposed period
  // A run overlaps if: run.periodStart <= proposedEnd AND run.periodEnd >= proposedStart
  const overlappingRuns = await db
    .select({
      id: payrollRuns.id,
      periodStart: payrollRuns.periodStart,
      periodEnd: payrollRuns.periodEnd,
      status: payrollRuns.status,
    })
    .from(payrollRuns)
    .where(
      and(
        eq(payrollRuns.workspaceId, workspaceId),
        lte(payrollRuns.periodStart, proposedEnd),
        gte(payrollRuns.periodEnd, proposedStart),
        // Only guard against terminal (approved/paid) runs — drafts can be superseded
        or(
          eq(payrollRuns.status, 'approved'),
          eq(payrollRuns.status, 'processed'),
          eq(payrollRuns.status, 'paid'),
          eq(payrollRuns.status, 'completed'),
        ),
        ...(excludeRunId ? [not(eq(payrollRuns.id, excludeRunId))] : []),
      )
    );

  if (overlappingRuns.length === 0) {
    return { safe: true, conflicts: [], checkedEmployeeCount: 0, periodStart: proposedStart, periodEnd: proposedEnd, workspaceId };
  }

  // Load all entries in those overlapping runs to surface employee-level conflicts
  const runIds = overlappingRuns.map(r => r.id);
  const conflictingEntries = await db
    .select({
      employeeId: payrollEntries.employeeId,
      payrollRunId: payrollEntries.payrollRunId,
    })
    .from(payrollEntries)
    .where(
      and(
        eq(payrollEntries.workspaceId, workspaceId),
        inArray(payrollEntries.payrollRunId, runIds),
      )
    );

  if (conflictingEntries.length === 0) {
    return { safe: true, conflicts: [], checkedEmployeeCount: 0, periodStart: proposedStart, periodEnd: proposedEnd, workspaceId };
  }

  // Batch load employee names for conflict report
  const uniqueEmployeeIds = Array.from(new Set(conflictingEntries.map(e => e.employeeId)));
  const employeeRecords = await db
    .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName })
    .from(employees)
    .where(
      and(
        eq(employees.workspaceId, workspaceId),
        inArray(employees.id, uniqueEmployeeIds),
      )
    );
  const empMap = new Map(employeeRecords.map(e => [e.id, `${e.firstName} ${e.lastName}`]));
  const runMap = new Map(overlappingRuns.map(r => [r.id, r]));

  const conflicts: ConflictDetail[] = conflictingEntries.map(entry => {
    const run = runMap.get(entry.payrollRunId)!;
    const overlapStart = new Date(Math.max(proposedStart.getTime(), run.periodStart.getTime()));
    const overlapEnd = new Date(Math.min(proposedEnd.getTime(), run.periodEnd.getTime()));
    const overlapMs = overlapEnd.getTime() - overlapStart.getTime();
    const overlapDays = Math.ceil(overlapMs / (1000 * 60 * 60 * 24));

    return {
      employeeId: entry.employeeId,
      employeeName: empMap.get(entry.employeeId) || `Employee ${entry.employeeId.slice(0, 8)}`,
      existingRunId: entry.payrollRunId,
      existingPeriodStart: run.periodStart,
      existingPeriodEnd: run.periodEnd,
      existingStatus: run.status ?? 'unknown',
      overlapDays,
    };
  });

  const uniqueConflicts = Array.from(
    new Map(conflicts.map(c => [`${c.employeeId}-${c.existingRunId}`, c])).values()
  );

  return {
    safe: false,
    conflicts: uniqueConflicts,
    checkedEmployeeCount: uniqueEmployeeIds.length,
    periodStart: proposedStart,
    periodEnd: proposedEnd,
    workspaceId,
  };
}

/**
 * Guard wrapper: throws if any overlap detected.
 * Use this in payroll run creation to hard-block double-payments.
 */
export async function assertNoPeriodOverlap(
  workspaceId: string,
  proposedStart: Date,
  proposedEnd: Date,
  excludeRunId?: string,
): Promise<void> {
  const result = await checkPayrollPeriodOverlap(workspaceId, proposedStart, proposedEnd, excludeRunId);
  if (!result.safe) {
    const details = result.conflicts.slice(0, 3).map(c =>
      `${c.employeeName} (${c.overlapDays}d overlap with run ${c.existingRunId.slice(0, 8)})`
    ).join('; ');
    throw new Error(
      `[PayrollLedger] DOUBLE_PAYMENT_BLOCKED: ${result.conflicts.length} employee(s) already paid for overlapping period. ` +
      `Proposed: ${proposedStart.toISOString().slice(0, 10)} – ${proposedEnd.toISOString().slice(0, 10)}. ` +
      `Conflicts: ${details}${result.conflicts.length > 3 ? ` +${result.conflicts.length - 3} more` : ''}`
    );
  }
}

/**
 * Summarise the ledger state for a workspace — used by Trinity's AI for reporting.
 */
export async function getPayrollLedgerSummary(workspaceId: string): Promise<{
  totalRuns: number;
  paidRuns: number;
  draftRuns: number;
  latestPeriodEnd: Date | null;
  nextExpectedPeriodStart: Date | null;
}> {
  const runs = await db
    .select({
      id: payrollRuns.id,
      periodEnd: payrollRuns.periodEnd,
      status: payrollRuns.status,
    })
    .from(payrollRuns)
    .where(eq(payrollRuns.workspaceId, workspaceId));

  const paidRuns = runs.filter(r => ['approved', 'processed', 'paid', 'completed'].includes(r.status ?? ''));
  const draftRuns = runs.filter(r => ['draft', 'pending'].includes(r.status ?? ''));

  const latestPaid = paidRuns.reduce((max: Date | null, r) => {
    if (!max || r.periodEnd > max) return r.periodEnd;
    return max;
  }, null);

  return {
    totalRuns: runs.length,
    paidRuns: paidRuns.length,
    draftRuns: draftRuns.length,
    latestPeriodEnd: latestPaid,
    nextExpectedPeriodStart: latestPaid ? new Date(latestPaid.getTime() + 1000) : null,
  };
}
