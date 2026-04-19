/**
 * PIN SERVICE — Phase 23
 * ======================
 * Shared, entity-agnostic PIN helpers. Used by:
 *   - server/services/trinityVoice/clockInPinService.ts (employee clock-in)
 *   - server/services/entityPinService.ts (unified owner/employee/client PIN)
 *
 * Consolidates the bcrypt configuration and the 4–8 digit validation rule so
 * every PIN in the platform (owner, employee, client) is hashed and validated
 * the same way.
 */

import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;
const MIN_PIN_DIGITS = 4;
const MAX_PIN_DIGITS = 8;

/** Strip non-digits and trim. Returns '' if no digits are present. */
export function normalizePin(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw).replace(/\D/g, '');
}

/** Returns a human-readable error message or null when the PIN is valid. */
export function validatePinFormat(raw: string | null | undefined): string | null {
  if (!raw) return 'PIN is required';
  const clean = normalizePin(raw);
  if (clean.length < MIN_PIN_DIGITS || clean.length > MAX_PIN_DIGITS) {
    return `PIN must be ${MIN_PIN_DIGITS}–${MAX_PIN_DIGITS} digits`;
  }
  if (/^(\d)\1+$/.test(clean)) {
    // Reject trivial PINs like 1111, 00000 — they defeat the purpose of a
    // secondary factor.
    return 'PIN must not be all the same digit';
  }
  return null;
}

/** bcrypt-hash a PIN. Caller must have already validated + normalized it. */
export async function hashPin(pin: string): Promise<string> {
  const clean = normalizePin(pin);
  return bcrypt.hash(clean, BCRYPT_ROUNDS);
}

/**
 * Constant-time PIN compare against a stored bcrypt hash. Returns false
 * (never throws) when the hash is missing or malformed.
 */
export async function verifyPin(pin: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false;
  const clean = normalizePin(pin);
  if (!clean) return false;
  try {
    return await bcrypt.compare(clean, hash);
  } catch {
    return false;
  }
}
