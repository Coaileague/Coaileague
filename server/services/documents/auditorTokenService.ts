/**
 * AUDITOR TOKEN SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Stateless, signed, time-bound tokens that grant a single named regulator
 * the ability to view and download exactly one vault document — without
 * giving them a CoAIleague login.
 *
 * Why stateless:
 *   - No new schema migration. Token is its own credential — payload + HMAC.
 *   - Revocation is by short expiry (default 7 days, max 30) plus
 *     SESSION_SECRET rotation if a leak is suspected.
 *
 * Why HMAC over JWT:
 *   - We control both ends, no third-party verification needed.
 *   - JWTs invite alg=none / key confusion attacks. HMAC-SHA256 with a
 *     derived key is simpler and audit-friendly.
 *
 * Token format:
 *   <base64url(payload)>.<base64url(hmac_sha256(key, payload))>
 *
 * Payload JSON (compact):
 *   {
 *     v:    vaultDocumentId,
 *     w:    workspaceId,
 *     iss:  issuingUserId,
 *     aud:  regulatorEmail (lower-cased),
 *     name: regulatorName,
 *     exp:  unix-ms,
 *     iat:  unix-ms,
 *     nonce: 12 random bytes (so two tokens for the same doc/regulator differ)
 *   }
 *
 * Key derivation:
 *   key = sha256(SESSION_SECRET || ":auditor-token:v1")
 *
 *   This isolates the auditor-token key from the session signing key —
 *   compromising one doesn't compromise the other (without knowing the
 *   constant tag) and rotation of SESSION_SECRET cleanly invalidates all
 *   outstanding auditor tokens.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

const TAG = ":auditor-token:v1";

function getDerivedKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AuditorTokenService: SESSION_SECRET is missing or too short (need ≥32 chars)",
    );
  }
  return createHash("sha256").update(secret + TAG).digest();
}

function b64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export interface AuditorTokenPayload {
  v: string;       // vault document id
  w: string;       // workspace id
  iss: string;     // issuing user id
  aud: string;     // regulator email (lowercased)
  name?: string;   // regulator display name
  exp: number;     // unix ms
  iat: number;     // unix ms
  nonce: string;   // base64url 12 bytes
}

export interface IssueOptions {
  vaultDocumentId: string;
  workspaceId: string;
  issuingUserId: string;
  regulatorEmail: string;
  regulatorName?: string;
  expiresInHours?: number;   // 1..720 (max 30 days), default 168 (7d)
}

export interface IssuedToken {
  token: string;
  expiresAt: Date;
  payload: AuditorTokenPayload;
}

const MAX_HOURS = 30 * 24;
const DEFAULT_HOURS = 7 * 24;

export function issueAuditorToken(opts: IssueOptions): IssuedToken {
  const hours = Math.min(Math.max(opts.expiresInHours ?? DEFAULT_HOURS, 1), MAX_HOURS);
  const now = Date.now();
  const exp = now + hours * 60 * 60 * 1000;

  const payload: AuditorTokenPayload = {
    v: opts.vaultDocumentId,
    w: opts.workspaceId,
    iss: opts.issuingUserId,
    aud: opts.regulatorEmail.trim().toLowerCase(),
    name: opts.regulatorName?.trim() || null,
    exp,
    iat: now,
    nonce: b64urlEncode(randomBytes(12)),
  };

  const payloadB64 = b64urlEncode(JSON.stringify(payload));
  const sig = createHmac("sha256", getDerivedKey()).update(payloadB64).digest();
  const sigB64 = b64urlEncode(sig);

  return {
    token: `${payloadB64}.${sigB64}`,
    expiresAt: new Date(exp),
    payload,
  };
}

export type VerifyResult =
  | { ok: true; payload: AuditorTokenPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "internal" };

export function verifyAuditorToken(token: string): VerifyResult {
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) {
    return { ok: false, reason: "malformed" };
  }
  const dot = token.indexOf(".");
  if (dot < 1 || dot >= token.length - 1) return { ok: false, reason: "malformed" };

  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  let expected: Buffer;
  let provided: Buffer;
  try {
    expected = createHmac("sha256", getDerivedKey()).update(payloadB64).digest();
    provided = b64urlDecode(sigB64);
  } catch {
    return { ok: false, reason: "internal" };
  }

  if (provided.length !== expected.length) return { ok: false, reason: "bad_signature" };
  if (!timingSafeEqual(expected, provided)) return { ok: false, reason: "bad_signature" };

  let payload: AuditorTokenPayload;
  try {
    const json = b64urlDecode(payloadB64).toString("utf8");
    payload = JSON.parse(json);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (
    typeof payload.v !== "string" ||
    typeof payload.w !== "string" ||
    typeof payload.iss !== "string" ||
    typeof payload.aud !== "string" ||
    typeof payload.exp !== "number" ||
    typeof payload.iat !== "number" ||
    typeof payload.nonce !== "string"
  ) {
    return { ok: false, reason: "malformed" };
  }

  if (Date.now() > payload.exp) return { ok: false, reason: "expired" };

  return { ok: true, payload };
}
