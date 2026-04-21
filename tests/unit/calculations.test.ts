/**
 * UNIT TESTS — Business Logic Calculations
 * Domain: Workforce Management, Payroll, Scheduling
 * Phase 38 — Automated Test Suite
 */

import { describe, it, expect } from 'vitest';

// ─── Overtime Calculation ─────────────────────────────────────────────────────
function calculateOvertimePay(
  regularHours: number,
  overtimeHours: number,
  hourlyRate: number,
  overtimeMultiplier: number = 1.5
): { regular: number; overtime: number; total: number } {
  const regular = Math.min(regularHours, 40) * hourlyRate;
  const overtime = overtimeHours * hourlyRate * overtimeMultiplier;
  return { regular, overtime, total: regular + overtime };
}

describe('Overtime Pay Calculation', () => {
  it('calculates standard week (40 hours) with no overtime', () => {
    const result = calculateOvertimePay(40, 0, 15);
    expect(result.regular).toBe(600);
    expect(result.overtime).toBe(0);
    expect(result.total).toBe(600);
  });

  it('calculates pay with 10 hours overtime at 1.5x', () => {
    const result = calculateOvertimePay(40, 10, 20);
    expect(result.regular).toBe(800);
    expect(result.overtime).toBe(300);
    expect(result.total).toBe(1100);
  });

  it('uses default 1.5x multiplier for overtime', () => {
    const result = calculateOvertimePay(40, 5, 10);
    expect(result.overtime).toBe(75);
  });

  it('supports double-time multiplier', () => {
    const result = calculateOvertimePay(40, 8, 25, 2.0);
    expect(result.overtime).toBe(400);
  });

  it('handles zero hours correctly', () => {
    const result = calculateOvertimePay(0, 0, 20);
    expect(result.total).toBe(0);
  });
});

// ─── Shift Duration Calculation ───────────────────────────────────────────────
function calculateShiftDuration(
  startTime: string,
  endTime: string,
  breakMinutes: number = 0
): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  if (endMins < startMins) endMins += 24 * 60; // overnight shift
  return (endMins - startMins - breakMinutes) / 60;
}

describe('Shift Duration Calculation', () => {
  it('calculates standard 8-hour day shift', () => {
    expect(calculateShiftDuration('09:00', '17:00')).toBe(8);
  });

  it('calculates shift with 30-minute break', () => {
    expect(calculateShiftDuration('09:00', '17:00', 30)).toBeCloseTo(7.5);
  });

  it('calculates overnight shift correctly', () => {
    expect(calculateShiftDuration('22:00', '06:00')).toBe(8);
  });

  it('calculates 12-hour guard shift', () => {
    expect(calculateShiftDuration('06:00', '18:00')).toBe(12);
  });

  it('handles same start and end time as zero hours', () => {
    expect(calculateShiftDuration('09:00', '09:00')).toBe(0);
  });
});

// ─── SLA Countdown (DSR) ──────────────────────────────────────────────────────
function calculateDsrDeadline(
  requestType: 'access' | 'deletion' | 'correction' | 'portability',
  submittedAt: Date
): { deadlineDays: number; deadlineDate: Date; isOverdue: boolean } {
  const SLA: Record<string, number> = {
    access: 30,
    deletion: 30,
    correction: 30,
    portability: 30,
  };
  const days = SLA[requestType] ?? 30;
  const deadlineDate = new Date(submittedAt);
  deadlineDate.setDate(deadlineDate.getDate() + days);
  const now = new Date();
  const isOverdue = now > deadlineDate;
  return { deadlineDays: days, deadlineDate, isOverdue };
}

describe('DSR SLA Deadline Calculation', () => {
  it('access request has 30-day deadline', () => {
    const ref = new Date('2026-01-01T00:00:00Z');
    const result = calculateDsrDeadline('access', ref);
    expect(result.deadlineDays).toBe(30);
    // Use getUTCDate: input is a UTC ISO string; local-time getDate() is timezone-dependent
    expect(result.deadlineDate.getUTCDate()).toBe(31);
  });

  it('deletion request has 30-day deadline', () => {
    const ref = new Date('2026-01-01T00:00:00Z');
    const result = calculateDsrDeadline('deletion', ref);
    expect(result.deadlineDays).toBe(30);
  });

  it('marks overdue requests correctly', () => {
    const oldDate = new Date('2020-01-01T00:00:00Z');
    const result = calculateDsrDeadline('access', oldDate);
    expect(result.isOverdue).toBe(true);
  });

  it('marks future requests as not overdue', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    const result = calculateDsrDeadline('access', futureDate);
    expect(result.isOverdue).toBe(false);
  });
});

// ─── Retention Policy Evaluation ─────────────────────────────────────────────
function isRecordExpired(
  createdAt: Date,
  retentionDays: number
): boolean {
  const expiryDate = new Date(createdAt);
  expiryDate.setDate(expiryDate.getDate() + retentionDays);
  return new Date() > expiryDate;
}

describe('Data Retention Policy Evaluation', () => {
  it('marks old record as expired', () => {
    const oldDate = new Date('2020-01-01');
    expect(isRecordExpired(oldDate, 365)).toBe(true);
  });

  it('marks recent record as not expired', () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 10);
    expect(isRecordExpired(recent, 365)).toBe(false);
  });

  it('marks record exactly on expiry boundary correctly', () => {
    const borderline = new Date();
    borderline.setDate(borderline.getDate() - 366);
    expect(isRecordExpired(borderline, 365)).toBe(true);
  });

  it('7-year audit log retention (2555 days)', () => {
    const sixYearsAgo = new Date();
    sixYearsAgo.setFullYear(sixYearsAgo.getFullYear() - 6);
    expect(isRecordExpired(sixYearsAgo, 2555)).toBe(false);
  });
});

// ─── Pay Period Calculation ───────────────────────────────────────────────────
function getPayPeriod(date: Date, type: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'): {
  start: Date;
  end: Date;
  label: string;
} {
  const d = new Date(date);
  if (type === 'weekly') {
    const dow = d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() - dow);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end, label: `Week of ${start.toISOString().slice(0, 10)}` };
  }
  if (type === 'monthly') {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { start, end, label: `${d.toLocaleString('default', { month: 'long' })} ${d.getFullYear()}` };
  }
  // biweekly default
  const start = new Date(d);
  start.setDate(1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start, end, label: `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}` };
}

describe('Pay Period Boundaries', () => {
  it('weekly period starts on Sunday', () => {
    const wednesday = new Date('2026-03-25'); // Wednesday
    const result = getPayPeriod(wednesday, 'weekly');
    expect(result.start.getDay()).toBe(0); // Sunday
  });

  it('weekly period ends on Saturday', () => {
    const wednesday = new Date('2026-03-25');
    const result = getPayPeriod(wednesday, 'weekly');
    expect(result.end.getDay()).toBe(6); // Saturday
  });

  it('monthly period starts on day 1', () => {
    const mid = new Date('2026-03-15');
    const result = getPayPeriod(mid, 'monthly');
    expect(result.start.getDate()).toBe(1);
  });

  it('monthly period includes correct month label', () => {
    const mid = new Date('2026-03-15');
    const result = getPayPeriod(mid, 'monthly');
    expect(result.label).toContain('2026');
  });
});

// ─── Coverage Ratio Calculation ───────────────────────────────────────────────
function calculateCoverageRatio(
  scheduledGuards: number,
  requiredGuards: number
): { ratio: number; status: 'understaffed' | 'adequate' | 'overstaffed' } {
  if (requiredGuards === 0) return { ratio: 1, status: 'adequate' };
  const ratio = scheduledGuards / requiredGuards;
  const status = ratio < 1 ? 'understaffed' : ratio > 1.2 ? 'overstaffed' : 'adequate';
  return { ratio, status };
}

describe('Site Coverage Ratio', () => {
  it('perfect coverage ratio', () => {
    const result = calculateCoverageRatio(4, 4);
    expect(result.ratio).toBe(1);
    expect(result.status).toBe('adequate');
  });

  it('understaffed when ratio < 1', () => {
    const result = calculateCoverageRatio(2, 4);
    expect(result.status).toBe('understaffed');
    expect(result.ratio).toBe(0.5);
  });

  it('overstaffed when ratio > 1.2', () => {
    const result = calculateCoverageRatio(6, 4);
    expect(result.status).toBe('overstaffed');
  });

  it('handles zero required gracefully', () => {
    const result = calculateCoverageRatio(0, 0);
    expect(result.status).toBe('adequate');
  });
});
