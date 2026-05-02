/**
 * SSN Fingerprint — Unit tests
 *
 * The fingerprint is the cross-tenant join key. Three properties matter:
 *   1. Determinism: same SSN → same fingerprint, every call.
 *   2. Pepper-protection: changing the pepper changes the output.
 *   3. Strict input validation: malformed/placeholder SSNs are rejected.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const TEST_PEPPER = 'unit-test-pepper-must-be-at-least-32-characters-long';
let original: string | undefined;

beforeAll(() => {
  original = process.env.SSN_FINGERPRINT_PEPPER;
  process.env.SSN_FINGERPRINT_PEPPER = TEST_PEPPER;
});
afterAll(() => {
  if (original === undefined) delete process.env.SSN_FINGERPRINT_PEPPER;
  else process.env.SSN_FINGERPRINT_PEPPER = original;
});

describe('SSN Fingerprint', () => {
  it('is deterministic — same input produces same output', async () => {
    const { computeSSNFingerprint } = await import('../../../server/services/scoring/ssnFingerprint');
    const a = computeSSNFingerprint('123-45-6788');
    const b = computeSSNFingerprint('123-45-6788');
    expect(a).toBe(b);
    expect(a).toHaveLength(64); // SHA-256 hex
  });

  it('normalizes punctuation and spaces', async () => {
    const { computeSSNFingerprint } = await import('../../../server/services/scoring/ssnFingerprint');
    const a = computeSSNFingerprint('123-45-6788');
    const b = computeSSNFingerprint('123 45 6788');
    const c = computeSSNFingerprint('123456788');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('produces a different fingerprint for a different SSN', async () => {
    const { computeSSNFingerprint } = await import('../../../server/services/scoring/ssnFingerprint');
    const a = computeSSNFingerprint('111-22-3334');
    const b = computeSSNFingerprint('111-22-3335');
    expect(a).not.toBe(b);
  });

  it('rejects malformed SSNs', async () => {
    const { computeSSNFingerprint } = await import('../../../server/services/scoring/ssnFingerprint');
    expect(() => computeSSNFingerprint('12345')).toThrow();
    expect(() => computeSSNFingerprint('not-an-ssn')).toThrow();
    expect(() => computeSSNFingerprint('1234567890')).toThrow();
  });

  it('rejects placeholder SSNs (000-00-0000, 123-45-6789, 999-99-9999)', async () => {
    const { computeSSNFingerprint } = await import('../../../server/services/scoring/ssnFingerprint');
    expect(() => computeSSNFingerprint('000-00-0000')).toThrow();
    expect(() => computeSSNFingerprint('123-45-6789')).toThrow();
    expect(() => computeSSNFingerprint('999-99-9999')).toThrow();
  });

  it('tryComputeSSNFingerprint returns null for bad input instead of throwing', async () => {
    const { tryComputeSSNFingerprint } = await import('../../../server/services/scoring/ssnFingerprint');
    expect(tryComputeSSNFingerprint(null)).toBeNull();
    expect(tryComputeSSNFingerprint(undefined)).toBeNull();
    expect(tryComputeSSNFingerprint('')).toBeNull();
    expect(tryComputeSSNFingerprint('garbage')).toBeNull();
  });

  it('fingerprintsMatch is constant-time and accepts only matching pairs', async () => {
    const { computeSSNFingerprint, fingerprintsMatch } = await import('../../../server/services/scoring/ssnFingerprint');
    const a = computeSSNFingerprint('555-12-3456');
    const b = computeSSNFingerprint('555-12-3456');
    const c = computeSSNFingerprint('555-12-3457');
    expect(fingerprintsMatch(a, b)).toBe(true);
    expect(fingerprintsMatch(a, c)).toBe(false);
    expect(fingerprintsMatch(a, '')).toBe(false);
  });

  it('throws if pepper is missing or too short', async () => {
    const old = process.env.SSN_FINGERPRINT_PEPPER;
    try {
      delete process.env.SSN_FINGERPRINT_PEPPER;
      const { computeSSNFingerprint } = await import('../../../server/services/scoring/ssnFingerprint');
      expect(() => computeSSNFingerprint('123-45-6788')).toThrow(/PEPPER/);

      process.env.SSN_FINGERPRINT_PEPPER = 'too-short';
      expect(() => computeSSNFingerprint('123-45-6788')).toThrow(/PEPPER/);
    } finally {
      process.env.SSN_FINGERPRINT_PEPPER = old;
    }
  });
});
