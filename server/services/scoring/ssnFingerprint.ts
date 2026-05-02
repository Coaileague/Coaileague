/**
 * SSN Fingerprint
 * ===============
 * Deterministic, searchable identifier for cross-tenant officer linkage.
 *
 * The bcrypt `employees.ssn_hash` stays for verification flows (constant-time
 * compare against a single row). It is NOT searchable across tenants because
 * each row has a different salt.
 *
 * For the cross-tenant officer score to follow a person regardless of email
 * or name changes, we need a deterministic value that maps the same SSN to
 * the same opaque token every time. That is what this fingerprint provides:
 *
 *   fingerprint = HMAC-SHA256(normalizedSSN, platformPepper)
 *
 * Properties:
 *   - Deterministic: same SSN → same fingerprint, every call.
 *   - Pepper-protected: an attacker who steals the database still cannot
 *     pre-compute fingerprints from a list of SSNs without the pepper.
 *   - Indexable: stored as a hex string, enabling unique-index lookups.
 *
 * The pepper MUST be loaded from a secret manager (KMS / Vault / env), never
 * hard-coded. Rotating the pepper is a deliberate, planned migration.
 */

import { createHmac, timingSafeEqual } from 'crypto';

const PEPPER_ENV_VAR = 'SSN_FINGERPRINT_PEPPER';

function loadPepper(): string {
  const pepper = process.env[PEPPER_ENV_VAR];
  if (!pepper || pepper.length < 32) {
    throw new Error(
      `[ssnFingerprint] ${PEPPER_ENV_VAR} must be set and be at least 32 characters. ` +
      'Provision via KMS / secret manager. See docs/scoring/cross-tenant-identity.md.'
    );
  }
  return pepper;
}

function normalizeSSN(raw: string): string {
  // Strip everything except digits. Reject anything that isn't a 9-digit US SSN.
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 9) {
    throw new Error('[ssnFingerprint] SSN must contain exactly 9 digits.');
  }
  // Block obviously-invalid placeholder SSNs.
  if (digits === '000000000' || digits === '123456789' || digits === '999999999') {
    throw new Error('[ssnFingerprint] SSN appears to be a placeholder, not a real value.');
  }
  return digits;
}

/**
 * Compute the deterministic fingerprint for an SSN. Returns a 64-char hex string.
 * Throws on malformed or missing inputs — never returns a partial value.
 */
export function computeSSNFingerprint(rawSSN: string): string {
  const pepper = loadPepper();
  const normalized = normalizeSSN(rawSSN);
  return createHmac('sha256', pepper).update(normalized).digest('hex');
}

/**
 * Constant-time compare for fingerprints. Use when comparing user-provided
 * fingerprint candidates rather than relying on string equality.
 */
export function fingerprintsMatch(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/**
 * Best-effort lookup: given a raw SSN, return the fingerprint without throwing
 * on placeholder values. Useful for migrations / backfills where a tenant may
 * have legacy bad data — the caller decides whether to skip or fail.
 */
export function tryComputeSSNFingerprint(rawSSN: string | null | undefined): string | null {
  if (!rawSSN) return null;
  try {
    return computeSSNFingerprint(rawSSN);
  } catch {
    return null;
  }
}
