import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AtomicFinancialLockService,
  FinancialLockConflict,
  FinancialLockTimeout,
  FinancialStageError,
  INVOICE_LOCKED_STATUSES,
  INVOICE_RELEASABLE_STATUSES,
  PAYROLL_LOCKED_STATUSES,
  PAYROLL_RELEASABLE_STATUSES,
  __test__,
} from '../../server/services/atomicFinancialLockService';
import { invoiceStatusEnum, payrollStatusEnum } from '../../shared/schema/enums';

describe('AtomicFinancialLockService', () => {
  describe('status taxonomies', () => {
    it('invoice locked and releasable status sets are disjoint', () => {
      const overlap = (INVOICE_LOCKED_STATUSES as readonly string[]).filter((s) =>
        (INVOICE_RELEASABLE_STATUSES as readonly string[]).includes(s),
      );
      expect(overlap).toEqual([]);
    });

    it('payroll locked and releasable status sets are disjoint', () => {
      const overlap = (PAYROLL_LOCKED_STATUSES as readonly string[]).filter((s) =>
        (PAYROLL_RELEASABLE_STATUSES as readonly string[]).includes(s),
      );
      expect(overlap).toEqual([]);
    });

    it('draft is the canonical staging-allowed status for both pipelines', () => {
      expect((INVOICE_RELEASABLE_STATUSES as readonly string[]).includes('draft')).toBe(true);
      expect((PAYROLL_RELEASABLE_STATUSES as readonly string[]).includes('draft')).toBe(true);
    });

    it('sent and paid invoices lock underlying time entries', () => {
      expect((INVOICE_LOCKED_STATUSES as readonly string[]).includes('sent')).toBe(true);
      expect((INVOICE_LOCKED_STATUSES as readonly string[]).includes('paid')).toBe(true);
    });

    it('disbursing and paid payroll runs lock underlying time entries', () => {
      expect((PAYROLL_LOCKED_STATUSES as readonly string[]).includes('disbursing')).toBe(true);
      expect((PAYROLL_LOCKED_STATUSES as readonly string[]).includes('paid')).toBe(true);
    });

    it('approved and processed payroll runs are still releasable (matches existing void path)', () => {
      // The void path in payrollAutomation.ts allows voiding pending/approved/
      // processed runs back to draft and releasing time_entries. Disbursement
      // is the actual point of no return.
      expect((PAYROLL_RELEASABLE_STATUSES as readonly string[]).includes('approved')).toBe(true);
      expect((PAYROLL_RELEASABLE_STATUSES as readonly string[]).includes('processed')).toBe(true);
    });
  });

  describe('financialLockKey()', () => {
    const { financialLockKey } = __test__;

    it('is deterministic for the same inputs', () => {
      const a = financialLockKey('ws-1', 'invoice');
      const b = financialLockKey('ws-1', 'invoice');
      expect(a).toBe(b);
    });

    it('disambiguates invoice vs payroll for the same workspace', () => {
      const inv = financialLockKey('ws-1', 'invoice');
      const pay = financialLockKey('ws-1', 'payroll');
      expect(inv).not.toBe(pay);
    });

    it('disambiguates different workspaces for the same kind', () => {
      const a = financialLockKey('ws-1', 'invoice');
      const b = financialLockKey('ws-2', 'invoice');
      expect(a).not.toBe(b);
    });

    it('produces a value within signed bigint range', () => {
      const key = financialLockKey('ws-edge', 'payroll');
      const MIN_BIGINT = -(1n << 63n);
      const MAX_BIGINT = (1n << 63n) - 1n;
      expect(key >= MIN_BIGINT).toBe(true);
      expect(key <= MAX_BIGINT).toBe(true);
    });
  });

  describe('error types', () => {
    it('FinancialLockConflict carries a structured reason', () => {
      const err = new FinancialLockConflict('invoice', 'entry x is part of invoice y');
      expect(err.name).toBe('FinancialLockConflict');
      expect(err.reason).toBe('invoice');
      expect(err.message).toContain('invoice');
    });

    it('FinancialLockTimeout carries workspace + kind + timeout', () => {
      const err = new FinancialLockTimeout('ws-1', 'payroll', 5000);
      expect(err.name).toBe('FinancialLockTimeout');
      expect(err.workspaceId).toBe('ws-1');
      expect(err.kind).toBe('payroll');
      expect(err.message).toContain('5000ms');
    });

    it('FinancialStageError reports how many entries were missing', () => {
      const err = new FinancialStageError('aborted', 3);
      expect(err.name).toBe('FinancialStageError');
      expect(err.missingCount).toBe(3);
    });
  });

  describe('public surface', () => {
    it('exposes the expected method set', () => {
      expect(typeof AtomicFinancialLockService.isLocked).toBe('function');
      expect(typeof AtomicFinancialLockService.assertCanModify).toBe('function');
      expect(typeof AtomicFinancialLockService.stageForInvoice).toBe('function');
      expect(typeof AtomicFinancialLockService.releaseFromInvoice).toBe('function');
      expect(typeof AtomicFinancialLockService.stageForPayroll).toBe('function');
      expect(typeof AtomicFinancialLockService.releaseFromPayroll).toBe('function');
      expect(typeof AtomicFinancialLockService.withFinancialLock).toBe('function');
    });

    it('stageForInvoice short-circuits for empty input without touching the DB', async () => {
      const result = await AtomicFinancialLockService.stageForInvoice({
        workspaceId: 'ws-1',
        clientId: 'c-1',
        invoiceId: 'inv-1',
        timeEntryIds: [],
      });
      expect(result).toEqual({ attached: 0 });
    });

    it('stageForPayroll short-circuits for empty input without touching the DB', async () => {
      const result = await AtomicFinancialLockService.stageForPayroll({
        workspaceId: 'ws-1',
        payrollRunId: 'run-1',
        timeEntryIds: [],
      });
      expect(result).toEqual({ attached: 0 });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Schema-drift guards — every value the DB enums can hold must be classified
  // as either LOCKED or RELEASABLE. If someone adds a status to the enum and
  // forgets to extend the taxonomy, this catches it instead of letting an
  // unclassified status slip through (would default-to-not-locked, allowing
  // edits on a billed entry).
  // ─────────────────────────────────────────────────────────────────────────
  describe('schema-drift guards', () => {
    it('every invoice_status enum value is classified by the service', () => {
      const allInvoiceStatuses = invoiceStatusEnum.enumValues;
      const classified = new Set<string>([
        ...INVOICE_LOCKED_STATUSES,
        ...INVOICE_RELEASABLE_STATUSES,
      ]);
      const unclassified = allInvoiceStatuses.filter((s) => !classified.has(s));
      expect(unclassified).toEqual([]);
    });

    it('every payroll_status enum value is classified by the service', () => {
      const allPayrollStatuses = payrollStatusEnum.enumValues;
      const classified = new Set<string>([
        ...PAYROLL_LOCKED_STATUSES,
        ...PAYROLL_RELEASABLE_STATUSES,
      ]);
      const unclassified = allPayrollStatuses.filter((s) => !classified.has(s));
      expect(unclassified).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // assertCanModify behavioural tests — patch the executor used internally
  // by isLocked so we never touch Postgres but still exercise the real
  // taxonomy + branching logic.
  // ─────────────────────────────────────────────────────────────────────────
  describe('assertCanModify behavioural', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    function fakeTx(row: { invoice_id: string | null; invoice_status: string | null; payroll_run_id: string | null; payroll_status: string | null; } | null) {
      return {
        execute: vi.fn().mockResolvedValue({ rows: row ? [row] : [] }),
      } as unknown as Parameters<typeof AtomicFinancialLockService.assertCanModify>[1];
    }

    it('passes when entry has no invoice and no payroll attachment', async () => {
      const tx = fakeTx({ invoice_id: null, invoice_status: null, payroll_run_id: null, payroll_status: null });
      await expect(
        AtomicFinancialLockService.assertCanModify('te-1', tx),
      ).resolves.toBeUndefined();
    });

    it('passes when invoice is in a releasable status', async () => {
      const tx = fakeTx({ invoice_id: 'inv-1', invoice_status: 'draft', payroll_run_id: null, payroll_status: null });
      await expect(
        AtomicFinancialLockService.assertCanModify('te-1', tx),
      ).resolves.toBeUndefined();
    });

    it('throws FinancialLockConflict with reason=invoice when invoice is sent', async () => {
      const tx = fakeTx({ invoice_id: 'inv-1', invoice_status: 'sent', payroll_run_id: null, payroll_status: null });
      await expect(
        AtomicFinancialLockService.assertCanModify('te-1', tx),
      ).rejects.toMatchObject({ name: 'FinancialLockConflict', reason: 'invoice' });
    });

    it('throws FinancialLockConflict with reason=payroll when payroll run is disbursing', async () => {
      const tx = fakeTx({ invoice_id: null, invoice_status: null, payroll_run_id: 'run-1', payroll_status: 'disbursing' });
      await expect(
        AtomicFinancialLockService.assertCanModify('te-1', tx),
      ).rejects.toMatchObject({ name: 'FinancialLockConflict', reason: 'payroll' });
    });

    it('throws FinancialLockConflict with reason=both when invoice and payroll are both locked', async () => {
      const tx = fakeTx({ invoice_id: 'inv-1', invoice_status: 'paid', payroll_run_id: 'run-1', payroll_status: 'paid' });
      await expect(
        AtomicFinancialLockService.assertCanModify('te-1', tx),
      ).rejects.toMatchObject({ name: 'FinancialLockConflict', reason: 'both' });
    });

    it('passes when payroll run is processed (reversible until disbursement)', async () => {
      const tx = fakeTx({ invoice_id: null, invoice_status: null, payroll_run_id: 'run-1', payroll_status: 'processed' });
      await expect(
        AtomicFinancialLockService.assertCanModify('te-1', tx),
      ).resolves.toBeUndefined();
    });
  });
});
