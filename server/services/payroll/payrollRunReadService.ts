import { and, desc, eq } from 'drizzle-orm';
import { db } from 'server/db';
import { payrollEntries, payrollRuns } from '@shared/schema';

export interface PayrollRunListParams {
  workspaceId: string;
  status?: string | null;
  limit?: number | null;
}

export interface PayrollRunDetailParams {
  workspaceId: string;
  payrollRunId: string;
  includeEntries?: boolean;
}

export interface PayrollRunWithEntries {
  run: typeof payrollRuns.$inferSelect;
  entries?: Array<typeof payrollEntries.$inferSelect>;
}

function requireWorkspaceId(workspaceId: string): void {
  if (!workspaceId) {
    throw Object.assign(new Error('workspaceId is required'), { status: 400 });
  }
}

function normalizeLimit(limit?: number | null): number {
  if (!limit || Number.isNaN(limit)) return 100;
  return Math.max(1, Math.min(250, Math.floor(limit)));
}

/**
 * List payroll runs for a workspace.
 *
 * Keeps the manager/admin payroll run read path workspace-scoped and out of the
 * giant payroll route file. Mutations such as approve/delete should remain in
 * dedicated services with their own policy and transaction rules.
 */
export async function listPayrollRuns({
  workspaceId,
  status,
  limit,
}: PayrollRunListParams): Promise<Array<typeof payrollRuns.$inferSelect>> {
  requireWorkspaceId(workspaceId);

  return db.select()
    .from(payrollRuns)
    .where(and(
      eq(payrollRuns.workspaceId, workspaceId),
      ...(status ? [eq(payrollRuns.status, status as any)] : []),
    ))
    .orderBy(desc(payrollRuns.createdAt))
    .limit(normalizeLimit(limit));
}

/**
 * Fetch a payroll run by ID with workspace scoping.
 */
export async function getPayrollRun({
  workspaceId,
  payrollRunId,
  includeEntries = true,
}: PayrollRunDetailParams): Promise<PayrollRunWithEntries> {
  requireWorkspaceId(workspaceId);
  if (!payrollRunId) {
    throw Object.assign(new Error('payrollRunId is required'), { status: 400 });
  }

  const [run] = await db.select()
    .from(payrollRuns)
    .where(and(
      eq(payrollRuns.workspaceId, workspaceId),
      eq(payrollRuns.id, payrollRunId),
    ))
    .limit(1);

  if (!run) {
    throw Object.assign(new Error('Payroll run not found'), { status: 404 });
  }

  if (!includeEntries) {
    return { run };
  }

  const entries = await db.select()
    .from(payrollEntries)
    .where(and(
      eq(payrollEntries.workspaceId, workspaceId),
      eq(payrollEntries.payrollRunId, payrollRunId),
    ));

  return { run, entries };
}
