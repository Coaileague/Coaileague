/**
 * FIELD ENCRYPTION SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Application-level AES-256-GCM encryption for individual sensitive columns
 * (SSN, full TIN, bank account numbers, government ID numbers).
 *
 * This sits ALONGSIDE the existing OAuth tokenEncryption.ts — that module
 * is for OAuth tokens; this one is for PII columns surfaced through user
 * data flows. They share the same AES-GCM primitives but operate on
 * different envelopes so a leak of one ciphertext family doesn't help an
 * attacker with the other.
 *
 * Envelope:
 *
 *   pf1:<base64url(iv)>:<base64url(authTag)>:<base64url(ciphertext)>
 *      └─ "PII Field v1" tag — distinguishes this envelope from OAuth's
 *         token envelope and lets us bump versions safely later.
 *
 * Key derivation:
 *
 *   key = HKDF-style: sha256(FIELD_ENCRYPTION_KEY || ":pii-field:v1")
 *         where FIELD_ENCRYPTION_KEY is a hex-encoded 32-byte secret in
 *         the env. Falls back to ENCRYPTION_KEY (the OAuth master key)
 *         to avoid forcing a second secret in dev — but emits a one-time
 *         warning so prod operators know to set a dedicated key.
 *
 * Migration safety:
 *
 *   This service NEVER auto-encrypts existing rows. Read paths use
 *   decryptField() which is a no-op when the value lacks the `pf1:`
 *   prefix — so legacy plaintext values keep working, and operators can
 *   run scripts/encrypt-pii-at-rest.ts on a maintenance window to walk
 *   the DB and re-write each value through encryptField(). All writes
 *   go through encryptField() so new data is always encrypted when a
 *   key is configured.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { createLogger } from "../lib/logger";

const log = createLogger("FieldEncryption");

const ALGORITHM = "aes-256-gcm";
const IV_LEN = 12; // GCM recommended
const TAG_LEN = 16;
const KEY_LEN = 32;
const VERSION_TAG = "pf1";
const KDF_TAG = ":pii-field:v1";

let keyWarningEmitted = false;
let cachedKey: Buffer | null = null;

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

/** Resolve the per-process derived key, with a one-time warning when we
 *  fall back to the OAuth master because no dedicated PII key is set. */
function getKey(): Buffer | null {
  if (cachedKey) return cachedKey;

  const dedicated = process.env.FIELD_ENCRYPTION_KEY;
  const fallback = process.env.ENCRYPTION_KEY;
  const source = dedicated || fallback;
  if (!source) {
    if (!keyWarningEmitted) {
      keyWarningEmitted = true;
      log.warn(
        "[FieldEncryption] No FIELD_ENCRYPTION_KEY or ENCRYPTION_KEY set — " +
          "PII fields will be stored in plaintext. Set FIELD_ENCRYPTION_KEY " +
          "to a 32-byte hex string in production.",
      );
    }
    return null;
  }
  if (!dedicated && fallback && !keyWarningEmitted) {
    keyWarningEmitted = true;
    log.warn(
      "[FieldEncryption] Using ENCRYPTION_KEY as fallback PII key. Set a " +
        "dedicated FIELD_ENCRYPTION_KEY in production to isolate PII envelope " +
        "from OAuth token envelope.",
    );
  }

  // Derive a separate key per envelope tag so OAuth and PII never share
  // the same effective key bytes even when the env supplies one secret.
  cachedKey = createHash("sha256").update(source + KDF_TAG).digest();
  return cachedKey;
}

/** True if the supplied string looks like an envelope produced by this module. */
export function isEncryptedField(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(`${VERSION_TAG}:`);
}

/**
 * Encrypt a sensitive string. Returns the envelope; idempotent — calling
 * this on an already-encrypted value returns the same envelope unchanged.
 *
 * If no key is configured, returns the plaintext (with a one-time warning)
 * so the system stays functional in dev without crashing on every write.
 */
export function encryptField(plaintext: string | null | undefined): string | null {
  if (plaintext == null) return null;
  if (typeof plaintext !== "string") plaintext = String(plaintext);
  if (plaintext === "") return "";

  if (isEncryptedField(plaintext)) return plaintext;

  const key = getKey();
  if (!key) return plaintext; // dev fallback, warning emitted above

  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION_TAG}:${b64url(iv)}:${b64url(tag)}:${b64url(ct)}`;
}

/**
 * Decrypt a value. If the value lacks our envelope prefix, it is assumed
 * to be legacy plaintext and returned unchanged — this is what makes the
 * migration safe to run online.
 *
 * Throws on a malformed envelope or an authentication-tag mismatch (which
 * indicates either tampering or wrong-key) — callers should treat that as
 * a server error, not surface the raw exception to the user.
 */
export function decryptField(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value !== "string") value = String(value);
  if (value === "") return "";

  if (!isEncryptedField(value)) return value;

  const key = getKey();
  if (!key) {
    // We have an encrypted value but no key — refuse to leak ciphertext
    // by returning it as plaintext. Surface a generic error instead.
    throw new Error("Encrypted PII field present but FIELD_ENCRYPTION_KEY not configured");
  }

  const parts = value.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION_TAG) {
    throw new Error("Invalid PII field envelope");
  }
  const iv = fromB64url(parts[1]);
  const tag = fromB64url(parts[2]);
  const ct = fromB64url(parts[3]);

  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error("Invalid PII field envelope length");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/**
 * Mask a value for display. Accepts encrypted or plaintext; decrypts on
 * the fly when needed. Returns a fixed-length placeholder for SSN-shaped
 * inputs (XXX-XX-1234) and a length-preserving bullet pattern otherwise.
 *
 * Use this in any read path that surfaces a PII column to a user-facing
 * response. The caller never sees the underlying secret unless they have
 * a separate authorized "reveal" path that calls decryptField directly.
 */
export function maskField(
  value: string | null | undefined,
  kind: "ssn" | "tin" | "account" | "generic" = "generic",
): string {
  if (value == null || value === "") return "";
  let plain: string;
  try {
    plain = decryptField(value) ?? "";
  } catch {
    return "•".repeat(8);
  }
  const digits = plain.replace(/\D/g, "");
  if (kind === "ssn" || kind === "tin") {
    if (digits.length >= 4) return `XXX-XX-${digits.slice(-4)}`;
    return "XXX-XX-XXXX";
  }
  if (kind === "account") {
    if (digits.length >= 4) return `••••${digits.slice(-4)}`;
    return "••••";
  }
  if (plain.length <= 4) return "••••";
  return `${"•".repeat(Math.max(plain.length - 4, 4))}${plain.slice(-4)}`;
}

/**
 * Last-4 helper. Returns just the trailing 4 digits — handy for storing
 * in a separate non-encrypted column (e.g. employees.ssnLast4) so the UI
 * can render "ending in 1234" without ever needing to decrypt.
 */
export function lastFourDigits(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  let plain: string;
  try {
    plain = decryptField(value) ?? "";
  } catch {
    return null;
  }
  const digits = plain.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/** True when the runtime has a key configured (i.e. encryption is real, not a no-op). */
export function isFieldEncryptionConfigured(): boolean {
  return getKey() !== null;
}

/**
 * Throw unless field encryption is wired up. Call this at startup in
 * production so a missing key fails fast instead of silently leaving
 * SSNs in plaintext.
 *
 *   import { requireFieldEncryption } from './security/fieldEncryption';
 *   if (process.env.NODE_ENV === 'production') requireFieldEncryption();
 */
export function requireFieldEncryption(): void {
  if (!isFieldEncryptionConfigured()) {
    throw new Error(
      "FieldEncryption: no key configured. Set FIELD_ENCRYPTION_KEY " +
        "(32-byte hex) in the environment.",
    );
  }
}
