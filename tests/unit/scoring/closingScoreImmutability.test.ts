/**
 * Closing Score Immutability — Bias firewall tests
 *
 * The closing score, once frozen on separation, is immutable. Two layers
 * enforce this:
 *   1. closingScoreService.wouldViolateImmutability() — input validation
 *   2. trinityConscience.evaluateConscience() — categorical refusal of
 *      score.modify_closing / score.delete_closing / direct table mutation
 *
 * These tests exercise both layers without touching the DB.
 */

import { describe, it, expect } from 'vitest';
import { wouldViolateImmutability, type ClosingScoreEntry } from '../../../server/services/scoring/closingScoreService';
import { evaluateConscience } from '../../../server/services/ai-brain/trinityConscience';

function entry(overrides: Partial<ClosingScoreEntry> = {}): ClosingScoreEntry {
  return {
    tenantId: 'tenant-a',
    tenantName: 'Tenant A',
    score: 82,
    tier: 'favorable',
    separationType: 'voluntary',
    separationDate: '2026-01-15T00:00:00.000Z',
    computedAt: '2026-01-15T00:00:00.000Z',
    factorBreakdown: {
      attendance: 90, performance: 80, behavior: 100, paperwork: 75,
      training: 70, interview: 80, veteran: 0, bilingual: 0, tenure: 50,
    },
    engineVersion: 'v1.0',
    immutable: true,
    ...overrides,
  };
}

describe('wouldViolateImmutability', () => {
  it('allows append-only growth', () => {
    const existing = [entry()];
    const proposed = [entry(), entry({ tenantId: 'tenant-b', tenantName: 'Tenant B' })];
    expect(wouldViolateImmutability(existing, proposed)).toBe(false);
  });

  it('blocks shrinkage (deletion)', () => {
    const existing = [entry(), entry({ tenantId: 'tenant-b' })];
    const proposed = [entry()];
    expect(wouldViolateImmutability(existing, proposed)).toBe(true);
  });

  it('blocks rewriting an existing score', () => {
    const existing = [entry({ score: 82 })];
    const proposed = [entry({ score: 95 })];
    expect(wouldViolateImmutability(existing, proposed)).toBe(true);
  });

  it('blocks reordering an existing entry', () => {
    const existing = [entry({ tenantId: 'tenant-a' }), entry({ tenantId: 'tenant-b' })];
    const proposed = [entry({ tenantId: 'tenant-b' }), entry({ tenantId: 'tenant-a' })];
    expect(wouldViolateImmutability(existing, proposed)).toBe(true);
  });

  it('blocks changing the computedAt of an existing entry', () => {
    const existing = [entry({ computedAt: '2026-01-15T00:00:00.000Z' })];
    const proposed = [entry({ computedAt: '2026-02-01T00:00:00.000Z' })];
    expect(wouldViolateImmutability(existing, proposed)).toBe(true);
  });
});

describe('Trinity Conscience — Closing-score immutability principle', () => {
  it('blocks score.modify_closing categorically', async () => {
    const result = await evaluateConscience({
      actionId: 'score.modify_closing',
      workspaceId: 'ws-a',
      userId: 'u-1',
      userRole: 'org_owner',
      callerType: 'user',
      payload: { confirmed: true }, // even with confirmed flag
    });
    expect(result.verdict).toBe('block');
    expect(result.principle).toBe('CLOSING_SCORE_IMMUTABILITY');
  });

  it('blocks score.delete_closing categorically', async () => {
    const result = await evaluateConscience({
      actionId: 'score.delete_closing',
      workspaceId: 'ws-a',
      userId: 'u-1',
      userRole: 'org_owner',
      callerType: 'user',
    });
    expect(result.verdict).toBe('block');
    expect(result.principle).toBe('CLOSING_SCORE_IMMUTABILITY');
  });

  it('blocks score.recompute_closing (closing score is frozen)', async () => {
    const result = await evaluateConscience({
      actionId: 'score.recompute_closing',
      workspaceId: 'ws-a',
      userId: 'u-1',
      userRole: 'root_admin',
      callerType: 'user',
    });
    expect(result.verdict).toBe('block');
    expect(result.principle).toBe('CLOSING_SCORE_IMMUTABILITY');
  });

  it('blocks direct table mutation on global_officers.closing_scores', async () => {
    const result = await evaluateConscience({
      actionId: 'globalOfficers.update_closing_scores',
      workspaceId: 'ws-a',
      userId: 'u-1',
      userRole: 'root_admin',
      callerType: 'user',
    });
    expect(result.verdict).toBe('block');
    expect(result.principle).toBe('CLOSING_SCORE_IMMUTABILITY');
  });

  it('allows score.append_closing (the only legitimate write path)', async () => {
    const result = await evaluateConscience({
      actionId: 'score.append_closing',
      workspaceId: 'ws-a',
      userId: 'u-1',
      userRole: 'org_owner',
      callerType: 'user',
    });
    // Should pass conscience — actual auth/business validation happens downstream.
    expect(result.verdict).not.toBe('block');
  });
});
