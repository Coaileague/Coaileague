import { db } from "../db";
import { orgLedger } from "@shared/schema";
import { eq, sql, desc } from "drizzle-orm";
import { createLogger } from '../lib/logger';
const log = createLogger('orgLedgerService');


export type LedgerEntryType = 'invoice_created' | 'payment_received' | 'payroll_processed' | 'payroll_disbursed' | 'adjustment' | 'refund' | 'subscription_payment' | 'invoice_voided' | 'invoice_cancelled' | 'invoice_overdue' | 'transaction_fee' | 'revenue_recognized';
export type LedgerDirection = 'debit' | 'credit';

interface LedgerWriteParams {
  workspaceId: string;
  entryType: LedgerEntryType;
  direction: LedgerDirection;
  amount: number;
  referenceNumber?: string;
  createdBy?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  invoiceId?: string;
  payrollRunId?: string;
  description: string;
  metadata?: Record<string, unknown>;
  tx?: any;
}

async function getLastBalance(workspaceId: string, dbHandle: any = db): Promise<number> {
  const [last] = await dbHandle.select({ balanceAfter: orgLedger.balanceAfter })
    .from(orgLedger)
    .where(eq(orgLedger.workspaceId, workspaceId))
    .orderBy(desc(orgLedger.createdAt))
    .limit(1);
  return last?.balanceAfter ? parseFloat(last.balanceAfter) : 0;
}

/**
 * GAP-28 FIX: Per-workspace async mutex for ledger writes.
 *
 * writeLedgerEntry is a read-then-write: it reads the last balanceAfter,
 * computes a new balance, then inserts a row. Under concurrent writes for the
 * same workspace both threads can read the same lastBalance and produce
 * incorrect running totals (e.g. two threads both read $10k, write $9k and $8k
 * — correct answer $7k, stored answer $8k).
 *
 * Fix: serialise all ledger writes per workspace behind a JS-level async mutex.
 * Works correctly for single-process Node.js deployments. Within an explicit DB
 * transaction (params.tx) the mutex is still applied so the read→write remains
 * consistent with respect to other concurrent JS writes in the same process.
 */
const workspaceLedgerLocks = new Map<string, Promise<void>>();

async function withWorkspaceLedgerLock<T>(wsId: string, fn: () => Promise<T>): Promise<T> {
  const prev = workspaceLedgerLocks.get(wsId) ?? Promise.resolve();
  let release!: () => void;
  const lock = new Promise<void>(res => { release = res; });
  workspaceLedgerLocks.set(wsId, prev.then(() => lock));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

/**
 * LEDGER DIRECTION CONVENTION:
 *   debit  → balance INCREASES (+amount) — use for: invoice_created, charges
 *   credit → balance DECREASES (-amount) — use for: payment_received, refund, void, payroll
 *
 * The balance represents net financial exposure (AR-style): high balance = more receivable.
 */
export async function writeLedgerEntry(params: LedgerWriteParams) {
  return withWorkspaceLedgerLock(params.workspaceId, async () => {
    const dbHandle = params.tx || db;
    try {
      const lastBalance = await getLastBalance(params.workspaceId, dbHandle);
      const delta = params.direction === 'debit' ? params.amount : -params.amount;
      const newBalance = parseFloat((lastBalance + delta).toFixed(2));

      const [entry] = await dbHandle.insert(orgLedger).values({
        workspaceId: params.workspaceId,
        entryType: params.entryType,
        direction: params.direction,
        amount: params.amount.toFixed(2),
        balanceAfter: newBalance.toFixed(2),
        referenceNumber: params.referenceNumber,
        createdBy: params.createdBy || 'automation_system',
        relatedEntityType: params.relatedEntityType,
        relatedEntityId: params.relatedEntityId,
        invoiceId: params.invoiceId,
        payrollRunId: params.payrollRunId,
        description: params.description,
        metadata: params.metadata,
      }).returning();

      log.info(`[OrgLedger] ${params.entryType} | ${params.direction} $${params.amount.toFixed(2)} | balance: $${newBalance.toFixed(2)} | ${params.description}`);
      return entry;
    } catch (err: unknown) {
      log.error(`[OrgLedger] Write failed:`, (err instanceof Error ? err.message : String(err)));
      throw err;
    }
  });
}
