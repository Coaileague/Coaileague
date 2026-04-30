import { describe, expect, it } from 'vitest';
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

    it('processed and paid payroll runs lock underlying time entries', () => {
      expect((PAYROLL_LOCKED_STATUSES as readonly string[]).includes('processed')).toBe(true);
      expect((PAYROLL_LOCKED_STATUSES as readonly string[]).includes('paid')).toBe(true);
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
});
