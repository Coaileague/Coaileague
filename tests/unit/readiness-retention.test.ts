/**
 * Readiness Section 23 — retention decision invariants
 *
 * Pure-function tests of the retention policy service. These guard the
 * contract documented in docs/SECURITY_AND_DR.md §6.
 */

import { describe, it, expect } from 'vitest';
import { decideRetentionAction, decideRetentionBatch } from '@server/services/retentionPolicyService';

const NOW = new Date('2026-04-19T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);

describe('decideRetentionAction', () => {
  it('active tenant is always retained', () => {
    const r = decideRetentionAction({
      workspaceId: 'ws-1',
      status: 'active',
      statusChangedAt: daysAgo(180),
      regulatoryHold: false,
      now: NOW,
    });
    expect(r.action).toBe('retain');
  });

  it('regulatory hold overrides cancelled-beyond-grace', () => {
    const r = decideRetentionAction({
      workspaceId: 'ws-2',
      status: 'cancelled',
      statusChangedAt: daysAgo(90),
      regulatoryHold: true,
      now: NOW,
    });
    expect(r.action).toBe('hold');
  });

  it('suspended tenant retained within 90-day grace, archived after', () => {
    expect(
      decideRetentionAction({
        workspaceId: 'ws-3', status: 'suspended', statusChangedAt: daysAgo(45),
        regulatoryHold: false, now: NOW,
      }).action,
    ).toBe('retain');
    expect(
      decideRetentionAction({
        workspaceId: 'ws-4', status: 'suspended', statusChangedAt: daysAgo(91),
        regulatoryHold: false, now: NOW,
      }).action,
    ).toBe('archive');
  });

  it('cancelled tenant retained within 30-day grace, hard-deleted after', () => {
    expect(
      decideRetentionAction({
        workspaceId: 'ws-5', status: 'cancelled', statusChangedAt: daysAgo(15),
        regulatoryHold: false, now: NOW,
      }).action,
    ).toBe('retain');
    const deleteDecision = decideRetentionAction({
      workspaceId: 'ws-6', status: 'cancelled', statusChangedAt: daysAgo(45),
      regulatoryHold: false, now: NOW,
    });
    expect(deleteDecision.action).toBe('hard_delete');
    expect((deleteDecision as any).reason).toBe('cancelled_30d_elapsed');
  });

  it('no statusChangedAt defaults to retain (cannot reason about age)', () => {
    const r = decideRetentionAction({
      workspaceId: 'ws-7',
      status: 'cancelled',
      statusChangedAt: null,
      regulatoryHold: false,
      now: NOW,
    });
    expect(r.action).toBe('retain');
  });
});

describe('decideRetentionBatch', () => {
  it('returns only non-retain decisions', () => {
    const results = decideRetentionBatch([
      { workspaceId: 'a', status: 'active',    statusChangedAt: daysAgo(500), regulatoryHold: false, now: NOW },
      { workspaceId: 'b', status: 'suspended', statusChangedAt: daysAgo(120), regulatoryHold: false, now: NOW },
      { workspaceId: 'c', status: 'cancelled', statusChangedAt: daysAgo(40),  regulatoryHold: false, now: NOW },
      { workspaceId: 'd', status: 'cancelled', statusChangedAt: daysAgo(15),  regulatoryHold: false, now: NOW },
    ]);
    expect(results.map((r) => r.workspaceId).sort()).toEqual(['b', 'c']);
  });
});
