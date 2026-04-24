import { db } from 'server/db';
import { timeEntries } from '@shared/schema';
import { and, eq, inArray, isNull } from 'drizzle-orm';

export interface PayrollTimeEntryClaimResult {
  requestedCount: number;
  claimedCount: number;
  claimedIds: string[];
}

export interface ClaimPayrollTimeEntriesParams {
  workspaceId: string;
  timeEntryIds: string[];
  payrollRunId: string;
  requireAll?: boolean;
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
  tx: client,
}: ClaimPayrollTimeEntriesParams & { tx?: typeof db }): Promise<PayrollTimeEntryClaimResult> {
  const client_ = client ?? db;
  if (!workspaceId) {
    throw new Error('[PayrollTimeEntryClaimer] workspaceId is required');
  }
  if (!payrollRunId) {
    throw new Error('[PayrollTimeEntryClaimer] payrollRunId is required');
  }

  const uniqueIds = Array.from(new Set(timeEntryIds)).filter(Boolean);
  if (uniqueIds.length === 0) {
    return { requestedCount: 0, claimedCount: 0, claimedIds: [] };
  }

  const claimed = await client_
    .update(timeEntries)
    .set({
      payrolledAt: new Date(),
      payrollRunId,
      updatedAt: new Date(),
    })
    .where(and(
      eq(timeEntries.workspaceId, workspaceId),
      inArray(timeEntries.id, uniqueIds),
      isNull(timeEntries.payrolledAt),
    ))
    .returning({ id: timeEntries.id });

  if (requireAll && claimed.length !== uniqueIds.length) {
    throw new Error(
      `[PayrollTimeEntryClaimer] Payroll claim aborted: ${uniqueIds.length - claimed.length} of ${uniqueIds.length} ` +
      'time entries were already payrolled, unavailable, or outside workspace scope'
    );
  }

  return {
    requestedCount: uniqueIds.length,
    claimedCount: claimed.length,
    claimedIds: claimed.map(entry => entry.id),
  };
}
