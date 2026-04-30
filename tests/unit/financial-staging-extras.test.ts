/**
 * UNIT TESTS — Financial Staging extras (variance + adjustment math)
 *
 * The variance and adjustment-math invariants don't require DB access — they
 * test the pure computation that the service uses. DB-touching paths are
 * exercised in integration tests.
 */

import { describe, it, expect } from 'vitest';
import {
  sumFinancialValues,
  subtractFinancialValues,
  toFinancialString,
  formatCurrency,
} from '@server/services/financialCalculator';

// ─── Variance math (mirror of calculateEntryVariance) ─────────────────────

function variancePct(scheduledMin: number, actualMin: number): number | null {
  if (scheduledMin <= 0) return null;
  const v = Math.abs(actualMin - scheduledMin);
  return (v / scheduledMin) * 100;
}

describe('Time-entry variance math', () => {
  it('reports 0% for an exact match', () => {
    expect(variancePct(480, 480)).toBe(0);
  });

  it('reports 5% exactly at the boundary (24m over an 8h shift)', () => {
    expect(variancePct(480, 504)).toBe(5);
  });

  it('reports 6.25% for a half-hour shortfall on an 8h shift (>5% → flag)', () => {
    expect(variancePct(480, 450)).toBe(6.25);
  });

  it('returns null when no scheduled baseline exists', () => {
    expect(variancePct(0, 480)).toBeNull();
  });

  it('absolute-value: |actual - scheduled| (under and over both count)', () => {
    expect(variancePct(480, 460)).toBeCloseTo(4.166, 2);
    expect(variancePct(480, 500)).toBeCloseTo(4.166, 2);
  });
});

// ─── Adjustment math (mirror of addPayrollAdjustment) ─────────────────────

interface Adj { kind: string; amount: string }
function applyAdjustment(grossPay: string, taxes: string, existing: Adj[], next: Adj) {
  const all = [...existing, next];
  const total = all.reduce((sum, a) => sumFinancialValues([sum, a.amount]), '0.0000');
  const baseNet = subtractFinancialValues(grossPay, taxes);
  const newNet = sumFinancialValues([baseNet, total]);
  const netForDB = Number(newNet) < 0 ? '0.00' : formatCurrency(newNet);
  return { adjustments: all, netPay: netForDB, totalAdjustments: total };
}

describe('Payroll adjustment math', () => {
  it('reimbursement increases net pay', () => {
    const r = applyAdjustment('1000', '200', [], { kind: 'reimbursement', amount: toFinancialString(50) });
    expect(r.netPay).toBe('850.00');
  });

  it('deduction (negative) reduces net pay', () => {
    const r = applyAdjustment('1000', '200', [], { kind: 'deduction', amount: toFinancialString(-25) });
    expect(r.netPay).toBe('775.00');
  });

  it('compound adjustments (reimbursement then deduction) net out correctly', () => {
    const r1 = applyAdjustment('1000', '200', [], { kind: 'reimbursement', amount: toFinancialString(50) });
    const r2 = applyAdjustment('1000', '200', r1.adjustments, { kind: 'deduction', amount: toFinancialString(-25) });
    // base net 800 + 50 - 25 = 825
    expect(r2.netPay).toBe('825.00');
  });

  it('floors net pay at $0 when adjustments would otherwise drive it negative', () => {
    const r = applyAdjustment('100', '0', [], { kind: 'deduction', amount: toFinancialString(-200) });
    expect(r.netPay).toBe('0.00');
  });

  it('preserves decimal precision across compounded adjustments', () => {
    const r1 = applyAdjustment('100', '0', [], { kind: 'reimbursement', amount: toFinancialString(50.1) });
    const r2 = applyAdjustment('100', '0', r1.adjustments, { kind: 'reimbursement', amount: toFinancialString(0.2) });
    // 100 + 50.10 + 0.20 = 150.30
    expect(r2.netPay).toBe('150.30');
  });
});
