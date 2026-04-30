import { db } from 'server/db';
import { timeEntries } from '@shared/schema';
import { and, eq, inArray, isNull } from 'drizzle-orm';

// Accept either the top-level db handle or a Drizzle transaction handle —
// callers compose this helper inside an outer db.transaction(...) and the
// tx parameter there is structurally narrower than typeof db.
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbExecutor = typeof db | DbTransaction;

export interface PayrollTimeEntryClaimResult {
  requestedCount: number;
  claimedCount: number;
  claimedIds: string[];
  unclaimedIds: string[];
}

export interface ClaimPayrollTimeEntriesParams {
  workspaceId: string;
  timeEntryIds: string[];
  payrollRunId: string;
  requireAll?: boolean;
  claimedAt?: Date;
  tx?: DbExecutor;
}

/**
 * Canonical payroll time-entry claim helper.
 *
 * Use this when a payroll path needs to mark source time entries as consumed by
 * a payroll run. It performs one bulk update, scopes by workspace, and refuses
 * to touch entries that were already payrolled.
 *
 * This service is intentionally small so larger payroll files can call one
 * shared claim path instead of carrying repeated for-loop update logic.
 */
export async function claimPayrollTimeEntries({
  workspaceId,
  timeEntryIds,
  payrollRunId,
  requireAll = true,
  claimedAt = new Date(),
  tx: client,
}: ClaimPayrollTimeEntriesParams): Promise<PayrollTimeEntryClaimResult> {
  const client_ = client ?? db;
  if (!workspaceId) {
    throw new Error('[PayrollTimeEntryClaimer] workspaceId is required');
  }
  if (!payrollRunId) {
    throw new Error('[PayrollTimeEntryClaimer] payrollRunId is required');
  }

  const uniqueIds = Array.from(new Set(timeEntryIds)).filter(Boolean);
  if (uniqueIds.length === 0) {
    return { requestedCount: 0, claimedCount: 0, claimedIds: [], unclaimedIds: [] };
  }

  const claimed = await client_
    .update(timeEntries)
    .set({
      payrolledAt: claimedAt,
      payrollRunId,
      updatedAt: claimedAt,
    })
    .where(and(
      eq(timeEntries.workspaceId, workspaceId),
      inArray(timeEntries.id, uniqueIds),
      isNull(timeEntries.payrolledAt),           // Not already payrolled
      eq(timeEntries.status as any, 'approved'), // Only approved entries can be payrolled
    ))
    .returning({ id: timeEntries.id });

  const claimedIds = claimed.map(entry => entry.id);
  const claimedIdSet = new Set(claimedIds);
  const unclaimedIds = uniqueIds.filter(id => !claimedIdSet.has(id));

  if (requireAll && unclaimedIds.length > 0) {
    throw new Error(
      `[PayrollTimeEntryClaimer] Payroll claim aborted: ${unclaimedIds.length} of ${uniqueIds.length} ` +
      `time entries were already payrolled, unavailable, or outside workspace scope: ${unclaimedIds.slice(0, 10).join(', ')}` +
      `${unclaimedIds.length > 10 ? ` +${unclaimedIds.length - 10} more` : ''}`
    );
  }

  return {
    requestedCount: uniqueIds.length,
    claimedCount: claimedIds.length,
    claimedIds,
    unclaimedIds,
  };
}
