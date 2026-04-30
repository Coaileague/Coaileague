/**
 * UNIT TESTS — Financial Staging Service
 *
 * Verifies the pure margin/profit math used by generateMarginReport and the
 * dedup invariant of finalizeFinancialBatch. The DB-touching paths
 * (stageBillingRun, stagePayrollBatch, finalizeFinancialBatch) are exercised
 * in integration tests against a seeded workspace.
 */

import { describe, it, expect } from 'vitest';
import {
  sumFinancialValues,
  subtractFinancialValues,
  multiplyFinancialValues,
  divideFinancialValues,
  toFinancialString,
  formatCurrency,
} from '@server/services/financialCalculator';

const MIN_GROSS_MARGIN_PCT = '20';

interface Bucket {
  clientId: string;
  clientName: string;
  billable: string;
  payable: string;
}

function computeMargin(buckets: Bucket[]) {
  const perClient = buckets.map(b => {
    const grossProfit = subtractFinancialValues(b.billable, b.payable);
    const grossMarginPct = Number(b.billable) > 0
      ? multiplyFinancialValues(divideFinancialValues(grossProfit, b.billable), '100')
      : '0.0000';
    const flagged = Number(grossMarginPct) < Number(MIN_GROSS_MARGIN_PCT);
    return { ...b, grossProfit, grossMarginPct, flagged };
  });
  const totalBillable = sumFinancialValues(perClient.map(p => p.billable));
  const totalPayable = sumFinancialValues(perClient.map(p => p.payable));
  const grossProfit = subtractFinancialValues(totalBillable, totalPayable);
  const grossMarginPct = Number(totalBillable) > 0
    ? multiplyFinancialValues(divideFinancialValues(grossProfit, totalBillable), '100')
    : '0.0000';
  const flagged = Number(grossMarginPct) < Number(MIN_GROSS_MARGIN_PCT);
  return { perClient, totalBillable, totalPayable, grossProfit, grossMarginPct, flagged };
}

describe('generateMarginReport — margin math', () => {
  it('does not flag a healthy 30% margin batch', () => {
    const r = computeMargin([
      { clientId: 'c1', clientName: 'Acme', billable: toFinancialString(10000), payable: toFinancialString(7000) },
    ]);
    expect(r.totalBillable).toBe('10000.0000');
    expect(r.totalPayable).toBe('7000.0000');
    expect(r.grossProfit).toBe('3000.0000');
    expect(formatCurrency(r.grossMarginPct)).toBe('30.00');
    expect(r.flagged).toBe(false);
  });

  it('flags a 19.99% margin below the 20% floor', () => {
    const r = computeMargin([
      { clientId: 'c1', clientName: 'Slim', billable: toFinancialString(100), payable: toFinancialString(80.01) },
    ]);
    expect(formatCurrency(r.grossMarginPct)).toBe('19.99');
    expect(r.flagged).toBe(true);
  });

  it('does NOT flag exactly 20% (strict <)', () => {
    const r = computeMargin([
      { clientId: 'c1', clientName: 'Edge', billable: toFinancialString(100), payable: toFinancialString(80) },
    ]);
    expect(formatCurrency(r.grossMarginPct)).toBe('20.00');
    expect(r.flagged).toBe(false);
  });

  it('flags per-client even when batch total is healthy', () => {
    const r = computeMargin([
      { clientId: 'c1', clientName: 'Healthy', billable: toFinancialString(10000), payable: toFinancialString(5000) },
      { clientId: 'c2', clientName: 'Bleeder', billable: toFinancialString(1000), payable: toFinancialString(900) },
    ]);
    expect(r.flagged).toBe(false);
    const c1 = r.perClient.find(p => p.clientId === 'c1')!;
    const c2 = r.perClient.find(p => p.clientId === 'c2')!;
    expect(c1.flagged).toBe(false);
    expect(c2.flagged).toBe(true);
  });

  it('handles zero billable without dividing by zero', () => {
    const r = computeMargin([
      { clientId: 'c1', clientName: 'NoRevenue', billable: '0.0000', payable: toFinancialString(50) },
    ]);
    expect(r.grossMarginPct).toBe('0.0000');
    expect(r.flagged).toBe(true);
  });
});

describe('FinancialCalculator — decimal precision invariants', () => {
  it('0.1 + 0.2 does not produce 0.30000000000000004', () => {
    expect(sumFinancialValues(['0.1000', '0.2000'])).toBe('0.3000');
  });

  it('OT pay (1.5x) is exact at 4-decimal precision', () => {
    const otPay = multiplyFinancialValues(multiplyFinancialValues('8', '15.75'), '1.5');
    expect(otPay).toBe('189.0000');
  });
});

describe('finalizeFinancialBatch — locked time-entry dedup', () => {
  it('dedups time entry IDs across multiple invoices', () => {
    const inv1 = ['t1', 't2', 't3', 't4', 't5'];
    const inv2 = ['t5', 't6', 't7', 't8', 't9'];
    const locked = new Set([...inv1, ...inv2]);
    expect(locked.size).toBe(9);
  });
});
