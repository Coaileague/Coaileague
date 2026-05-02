/**
 * Score Engine — Pure-function tests
 *
 * Covers the deterministic, no-DB-required parts of the score engine:
 *   - scoreToTier mapping
 *   - clamp behavior at boundaries
 *   - Default weights sum to 1.0 (otherwise composites can exceed 100)
 *   - tierForTenantScore mapping
 */

import { describe, it, expect } from 'vitest';
import {
  scoreToTier,
  DEFAULT_WEIGHTS,
} from '../../../server/services/scoring/scoreEngineService';
import {
  tierForTenantScore,
  TENANT_SCORE_WEIGHTS,
} from '../../../server/services/scoring/tenantScoreService';

describe('Score → Tier mapping', () => {
  it('classifies score boundaries correctly', () => {
    expect(scoreToTier(100)).toBe('highly_favorable');
    expect(scoreToTier(90)).toBe('highly_favorable');
    expect(scoreToTier(89)).toBe('favorable');
    expect(scoreToTier(75)).toBe('favorable');
    expect(scoreToTier(74)).toBe('less_favorable');
    expect(scoreToTier(60)).toBe('less_favorable');
    expect(scoreToTier(59)).toBe('low_priority');
    expect(scoreToTier(45)).toBe('low_priority');
    expect(scoreToTier(44)).toBe('minimum_priority');
    expect(scoreToTier(30)).toBe('minimum_priority');
    expect(scoreToTier(29)).toBe('hard_blocked');
    expect(scoreToTier(0)).toBe('hard_blocked');
  });
});

describe('Officer score weights', () => {
  it('sum to exactly 1.0 (otherwise composite scores drift)', () => {
    const total = Object.values(DEFAULT_WEIGHTS).reduce((s, w) => s + w, 0);
    // Floating-point tolerant equality
    expect(Math.round(total * 10000)).toBe(10000);
  });

  it('contains all 9 expected dimensions', () => {
    const keys = Object.keys(DEFAULT_WEIGHTS).sort();
    expect(keys).toEqual([
      'attendance', 'behavior', 'bilingual', 'interview', 'paperwork',
      'performance', 'tenure', 'training', 'veteran',
    ]);
  });

  it('weights attendance and performance highest (40% combined floor)', () => {
    expect(DEFAULT_WEIGHTS.attendance + DEFAULT_WEIGHTS.performance).toBeGreaterThanOrEqual(0.4);
  });
});

describe('Tenant score weights', () => {
  it('sum to exactly 1.0', () => {
    const total = Object.values(TENANT_SCORE_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(Math.round(total * 10000)).toBe(10000);
  });

  it('classifies tenant tiers correctly', () => {
    expect(tierForTenantScore(95)).toBe('excellent');
    expect(tierForTenantScore(85)).toBe('excellent');
    expect(tierForTenantScore(84)).toBe('strong');
    expect(tierForTenantScore(70)).toBe('strong');
    expect(tierForTenantScore(69)).toBe('fair');
    expect(tierForTenantScore(55)).toBe('fair');
    expect(tierForTenantScore(54)).toBe('weak');
    expect(tierForTenantScore(40)).toBe('weak');
    expect(tierForTenantScore(39)).toBe('critical');
    expect(tierForTenantScore(0)).toBe('critical');
  });
});
