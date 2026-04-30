/**
 * AtomicFinancialLockService
 * ==========================
 * The gatekeeper for the Shift -> Approval -> Invoice/Payroll pipeline.
 *
 * Enforces a one-way street:
 *   pending -> approved -> staged (invoiceId/payrollRunId set, draft) -> locked (invoice/run finalized)
 *
 * A time_entry is "locked" iff it is attached to an invoice or payroll_run whose
 * status has crossed the point of no return (sent/paid for invoices, processed/
 * disbursed/paid for payroll). Locked entries cannot be edited, re-invoiced,
 * or re-payrolled. Adjustments must flow through credit memos / payroll
 * adjustment entries.
 *
 * Why no `is_locked` column?
 *  - Lock state is fully derivable from invoice.status and payroll_runs.status.
 *  - A boolean would be a denormalisation that can drift; the JOIN-derived
 *    answer is always correct. If perf becomes an issue we add a generated
 *    column later, but never a hand-maintained one.
 *
 * Why advisory locks with a bounded wait?
 *  - Concurrent stage/finalize calls for the same workspace can race on the
 *    same time_entries. Without serialisation we either deadlock or starve.
 *  - `SET LOCAL lock_timeout` makes a stuck lock fail fast (FinancialLockTimeout)
 *    instead of hanging the request thread. This is the regression the
 *    `fix-financial-locking-timeout` branch is named after.
 */

import { db } from '../db';
import { timeEntries } from '@shared/schema';
import { invoices } from '@shared/schema';
import { payrollRuns } from '@shared/schema';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { createLogger } from '../lib/logger';

const log = createLogger('AtomicFinancialLockService');

// ─────────────────────────────────────────────────────────────────────────────
// Status taxonomies
// ─────────────────────────────────────────────────────────────────────────────

/** Invoice statuses that LOCK underlying time_entries (point of no return). */
export const INVOICE_LOCKED_STATUSES = [
  'sent',
  'pending',
  'paid',
  'partial',
  'overdue',
  'refunded',
  'disputed',
] as const;

/** Invoice statuses that allow underlying time_entries to be RELEASED. */
export const INVOICE_RELEASABLE_STATUSES = [
  'draft',
  'cancelled',
  'void',
  'failed',
] as const;

/** Payroll statuses that LOCK underlying time_entries. */
export const PAYROLL_LOCKED_STATUSES = [
  'approved',
  'processed',
  'disbursing',
  'paid',
  'completed',
  'partial',
] as const;

/** Payroll statuses that allow underlying time_entries to be RELEASED. */
export const PAYROLL_RELEASABLE_STATUSES = ['draft', 'pending'] as const;

export type InvoiceLockedStatus = typeof INVOICE_LOCKED_STATUSES[number];
export type PayrollLockedStatus = typeof PAYROLL_LOCKED_STATUSES[number];
export type FinancialLockKind = 'invoice' | 'payroll';

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export class FinancialLockConflict extends Error {
  constructor(public readonly reason: 'invoice' | 'payroll' | 'both', detail: string) {
    super(`Time entry is locked by ${reason}: ${detail}`);
    this.name = 'FinancialLockConflict';
  }
}

export class FinancialLockTimeout extends Error {
  constructor(public readonly workspaceId: string, public readonly kind: FinancialLockKind, timeoutMs: number) {
    super(`Could not acquire ${kind} lock for workspace ${workspaceId} within ${timeoutMs}ms`);
    this.name = 'FinancialLockTimeout';
  }
}

export class FinancialStageError extends Error {
  constructor(message: string, public readonly missingCount: number) {
    super(message);
    this.name = 'FinancialStageError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Advisory-lock key derivation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hash a workspace + kind into a stable signed bigint suitable for
 * pg_advisory_xact_lock(bigint). Top byte encodes kind so invoice and payroll
 * locks for the same workspace cannot collide.
 *
 * Uses FNV-1a 64-bit (good distribution, deterministic across processes).
 */
function financialLockKey(workspaceId: string, kind: FinancialLockKind): bigint {
  const FNV_OFFSET = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;
  const MASK_64 = (1n << 64n) - 1n;

  let hash = FNV_OFFSET;
  const seed = `financial:${kind}:${workspaceId}`;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash ^ BigInt(seed.charCodeAt(i))) & MASK_64;
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  // pg advisory lock uses signed bigint — convert via two's complement
  return hash >= 1n << 63n ? hash - (1n << 64n) : hash;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export const AtomicFinancialLockService = {
  INVOICE_LOCKED_STATUSES,
  INVOICE_RELEASABLE_STATUSES,
  PAYROLL_LOCKED_STATUSES,
  PAYROLL_RELEASABLE_STATUSES,

  /**
   * Read-only lock probe. Returns whether the entry is currently locked and,
   * if so, by which side of the pipeline.
   */
  async isLocked(timeEntryId: string): Promise<{ locked: boolean; reason?: 'invoice' | 'payroll' | 'both' }> {
    const rows = await db.execute(sql`
      SELECT
        te.invoice_id        AS invoice_id,
        i.status             AS invoice_status,
        te.payroll_run_id    AS payroll_run_id,
        pr.status            AS payroll_status
      FROM time_entries te
      LEFT JOIN invoices i      ON i.id  = te.invoice_id
      LEFT JOIN payroll_runs pr ON pr.id = te.payroll_run_id
      WHERE te.id = ${timeEntryId}
      LIMIT 1
    `);
    const row = (rows as any).rows?.[0] as
      | { invoice_id: string | null; invoice_status: string | null; payroll_run_id: string | null; payroll_status: string | null }
      | undefined;
    if (!row) return { locked: false };

    const invoiceLocked =
      !!row.invoice_id && !!row.invoice_status && (INVOICE_LOCKED_STATUSES as readonly string[]).includes(row.invoice_status);
    const payrollLocked =
      !!row.payroll_run_id && !!row.payroll_status && (PAYROLL_LOCKED_STATUSES as readonly string[]).includes(row.payroll_status);

    if (invoiceLocked && payrollLocked) return { locked: true, reason: 'both' };
    if (invoiceLocked) return { locked: true, reason: 'invoice' };
    if (payrollLocked) return { locked: true, reason: 'payroll' };
    return { locked: false };
  },

  /**
   * Throws FinancialLockConflict if the entry is locked. Call this from any
   * mutation path on time_entries (manual edit, supervisor correction,
   * QuickBooks reverse-sync, etc.) before performing the write.
   */
  async assertCanModify(timeEntryId: string): Promise<void> {
    const status = await AtomicFinancialLockService.isLocked(timeEntryId);
    if (status.locked) {
      throw new FinancialLockConflict(
        status.reason ?? 'invoice',
        `time_entry ${timeEntryId} is part of a finalized financial batch; use a credit memo or payroll adjustment.`,
      );
    }
  },

  /**
   * STAGE: atomically attach a set of approved, unbilled time_entries to an
   * invoice that must currently be in `draft` status. Sets billedAt + invoiceId.
   *
   * Aborts the entire transaction if any candidate is missing, already billed,
   * or not in approved status — no partial stages.
   */
  async stageForInvoice(opts: {
    workspaceId: string;
    clientId: string;
    invoiceId: string;
    timeEntryIds: string[];
  }): Promise<{ attached: number }> {
    const { workspaceId, clientId, invoiceId, timeEntryIds } = opts;
    if (timeEntryIds.length === 0) return { attached: 0 };
    const uniqueIds = [...new Set(timeEntryIds)];

    return await db.transaction(async (tx) => {
      const inv = await tx
        .select({ id: invoices.id, status: invoices.status, workspaceId: invoices.workspaceId, clientId: invoices.clientId })
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .for('update')
        .limit(1);

      if (inv.length === 0) throw new FinancialStageError(`Invoice ${invoiceId} not found`, uniqueIds.length);
      const invoice = inv[0];
      if (invoice.workspaceId !== workspaceId)
        throw new FinancialStageError(`Invoice ${invoiceId} belongs to a different workspace`, uniqueIds.length);
      if (invoice.clientId !== clientId)
        throw new FinancialStageError(`Invoice ${invoiceId} belongs to a different client`, uniqueIds.length);
      if (invoice.status !== 'draft')
        throw new FinancialStageError(`Invoice ${invoiceId} is ${invoice.status}; only draft invoices accept staging`, uniqueIds.length);

      // Lock candidate time_entries before reading — prevents races with a
      // concurrent stage call.
      await tx.execute(sql`
        SELECT id FROM time_entries
        WHERE workspace_id = ${workspaceId}
          AND id = ANY(${uniqueIds}::text[])
        FOR UPDATE
      `);

      const claimed = await tx
        .update(timeEntries)
        .set({ invoiceId, billedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(timeEntries.workspaceId, workspaceId),
            eq(timeEntries.clientId, clientId),
            eq(timeEntries.status, 'approved'),
            isNull(timeEntries.invoiceId),
            isNull(timeEntries.billedAt),
            inArray(timeEntries.id, uniqueIds),
          ),
        )
        .returning({ id: timeEntries.id });

      if (claimed.length !== uniqueIds.length) {
        throw new FinancialStageError(
          `Stage aborted: ${uniqueIds.length - claimed.length} of ${uniqueIds.length} entries were already billed, ` +
            `not approved, or did not belong to this client.`,
          uniqueIds.length - claimed.length,
        );
      }

      log.info('Staged time entries for invoice', { workspaceId, invoiceId, attached: claimed.length });
      return { attached: claimed.length };
    });
  },

  /**
   * RELEASE: detach time_entries from an invoice and return them to the
   * "approved but unbilled" pool. Only valid while the invoice is in a
   * releasable status (draft/cancelled/void/failed). Used for ghost prevention
   * when a draft invoice is voided or deleted before being sent.
   */
  async releaseFromInvoice(invoiceId: string): Promise<{ released: number }> {
    return await db.transaction(async (tx) => {
      const inv = await tx
        .select({ id: invoices.id, status: invoices.status, workspaceId: invoices.workspaceId })
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .for('update')
        .limit(1);
      if (inv.length === 0) return { released: 0 };
      const invoice = inv[0];

      if (!(INVOICE_RELEASABLE_STATUSES as readonly string[]).includes(invoice.status ?? '')) {
        throw new FinancialLockConflict(
          'invoice',
          `cannot release entries from invoice ${invoiceId} in status ${invoice.status}; issue a credit memo instead.`,
        );
      }

      const released = await tx
        .update(timeEntries)
        .set({ invoiceId: null, billedAt: null, updatedAt: new Date() })
        .where(and(eq(timeEntries.workspaceId, invoice.workspaceId), eq(timeEntries.invoiceId, invoiceId)))
        .returning({ id: timeEntries.id });

      log.info('Released time entries from invoice', { invoiceId, released: released.length });
      return { released: released.length };
    });
  },

  /**
   * Mirror of stageForInvoice for payroll. Attaches approved, unpayrolled
   * time_entries to a draft payroll_run.
   */
  async stageForPayroll(opts: {
    workspaceId: string;
    payrollRunId: string;
    timeEntryIds: string[];
  }): Promise<{ attached: number }> {
    const { workspaceId, payrollRunId, timeEntryIds } = opts;
    if (timeEntryIds.length === 0) return { attached: 0 };
    const uniqueIds = [...new Set(timeEntryIds)];

    return await db.transaction(async (tx) => {
      const run = await tx
        .select({ id: payrollRuns.id, status: payrollRuns.status, workspaceId: payrollRuns.workspaceId })
        .from(payrollRuns)
        .where(eq(payrollRuns.id, payrollRunId))
        .for('update')
        .limit(1);

      if (run.length === 0) throw new FinancialStageError(`Payroll run ${payrollRunId} not found`, uniqueIds.length);
      const pr = run[0];
      if (pr.workspaceId !== workspaceId)
        throw new FinancialStageError(`Payroll run ${payrollRunId} belongs to a different workspace`, uniqueIds.length);
      if (pr.status !== 'draft')
        throw new FinancialStageError(
          `Payroll run ${payrollRunId} is ${pr.status}; only draft runs accept staging`,
          uniqueIds.length,
        );

      await tx.execute(sql`
        SELECT id FROM time_entries
        WHERE workspace_id = ${workspaceId}
          AND id = ANY(${uniqueIds}::text[])
        FOR UPDATE
      `);

      const claimed = await tx
        .update(timeEntries)
        .set({ payrollRunId, payrolledAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(timeEntries.workspaceId, workspaceId),
            eq(timeEntries.status, 'approved'),
            isNull(timeEntries.payrollRunId),
            isNull(timeEntries.payrolledAt),
            inArray(timeEntries.id, uniqueIds),
          ),
        )
        .returning({ id: timeEntries.id });

      if (claimed.length !== uniqueIds.length) {
        throw new FinancialStageError(
          `Payroll stage aborted: ${uniqueIds.length - claimed.length} of ${uniqueIds.length} entries were already ` +
            `payrolled or not approved.`,
          uniqueIds.length - claimed.length,
        );
      }

      log.info('Staged time entries for payroll run', { workspaceId, payrollRunId, attached: claimed.length });
      return { attached: claimed.length };
    });
  },

  /**
   * RELEASE: detach time_entries from a draft/pending payroll run. Used when
   * a payroll batch is discarded before processing.
   */
  async releaseFromPayroll(payrollRunId: string): Promise<{ released: number }> {
    return await db.transaction(async (tx) => {
      const run = await tx
        .select({ id: payrollRuns.id, status: payrollRuns.status, workspaceId: payrollRuns.workspaceId })
        .from(payrollRuns)
        .where(eq(payrollRuns.id, payrollRunId))
        .for('update')
        .limit(1);
      if (run.length === 0) return { released: 0 };
      const pr = run[0];

      if (!(PAYROLL_RELEASABLE_STATUSES as readonly string[]).includes(pr.status ?? '')) {
        throw new FinancialLockConflict(
          'payroll',
          `cannot release entries from payroll run ${payrollRunId} in status ${pr.status}; use a payroll adjustment.`,
        );
      }

      const released = await tx
        .update(timeEntries)
        .set({ payrollRunId: null, payrolledAt: null, updatedAt: new Date() })
        .where(and(eq(timeEntries.workspaceId, pr.workspaceId), eq(timeEntries.payrollRunId, payrollRunId)))
        .returning({ id: timeEntries.id });

      log.info('Released time entries from payroll run', { payrollRunId, released: released.length });
      return { released: released.length };
    });
  },

  /**
   * SERIALISATION GUARD: run `fn` while holding a per-workspace, per-kind
   * advisory lock with a bounded wait. The lock is held for the lifetime of
   * the transaction the callback opens (we use pg_advisory_xact_lock so it is
   * released automatically on commit/rollback).
   *
   * If the lock cannot be acquired within `timeoutMs`, throws
   * FinancialLockTimeout instead of hanging.
   *
   * Use this around any compound stage+finalize flow that touches multiple
   * tables and must not interleave with another finalize for the same
   * workspace.
   */
  async withFinancialLock<T>(opts: {
    workspaceId: string;
    kind: FinancialLockKind;
    jobName: string;
    timeoutMs?: number;
    fn: () => Promise<T>;
  }): Promise<T> {
    const timeoutMs = opts.timeoutMs ?? 5_000;
    const key = financialLockKey(opts.workspaceId, opts.kind);

    return await db.transaction(async (tx) => {
      // Bound the wait. SET LOCAL is scoped to this transaction.
      await tx.execute(sql.raw(`SET LOCAL lock_timeout = '${Math.max(1, Math.floor(timeoutMs))}ms'`));

      try {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${key.toString()}::bigint)`);
      } catch (err) {
        const msg = String((err as Error)?.message ?? err);
        if (/lock_timeout|canceling statement due to lock timeout/i.test(msg)) {
          log.warn('Financial advisory lock timeout', {
            workspaceId: opts.workspaceId,
            kind: opts.kind,
            jobName: opts.jobName,
            timeoutMs,
          });
          throw new FinancialLockTimeout(opts.workspaceId, opts.kind, timeoutMs);
        }
        throw err;
      }

      log.debug('Financial advisory lock acquired', {
        workspaceId: opts.workspaceId,
        kind: opts.kind,
        jobName: opts.jobName,
      });

      return await opts.fn();
    });
  },
};

export type AtomicFinancialLockServiceType = typeof AtomicFinancialLockService;

// Internal export for tests only.
export const __test__ = { financialLockKey };
