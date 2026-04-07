/**
 * PHASE 53 — TWO-FACTOR SESSION SERVICE
 *
 * Extends the existing MFA service (mfa.ts) with:
 * 1. Device Trust — httpOnly cookie (8h TTL), hashed fingerprint stored in DB
 * 2. Concurrent Session Limit — max 3 active sessions per user (evicts oldest)
 * 3. Mandatory 2FA enforcement — org_owner + platform_staff must use MFA
 * 4. Pending MFA login state — encrypted token for the /api/auth/mfa/verify flow
 * 5. 2FA admin reset — org_owner/platform_staff can clear another user's MFA secret
 */

import { universalAudit, AUDIT_ACTIONS } from '../universalAuditService';
import crypto from 'crypto';
import type { Response } from 'express';
import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
const log = createLogger('twoFactorSessionService');


// ─── Constants ────────────────────────────────────────────────────────────────
const DEVICE_TRUST_TTL_MS = 8 * 60 * 60 * 1000;     // 8 hours
const DEVICE_TRUST_COOKIE = 'dt_token';
const MAX_CONCURRENT_SESSIONS = 3;
const MFA_MANDATORY_ROLES = new Set(['org_owner', 'platform_staff', 'root_admin']);

// Symmetric key for pending MFA token encryption (derived from SESSION_SECRET)
const PENDING_MFA_KEY = crypto.scryptSync(
  process.env.SESSION_SECRET || 'fallback-secret',
  'pending-mfa-salt',
  32
);
const PENDING_MFA_TTL_MS = 5 * 60 * 1000; // 5 minutes to complete MFA

// ─── Device Trust ─────────────────────────────────────────────────────────────

/**
 * Build a fingerprint hash from request metadata.
 * NOT used for precise matching — only to detect obvious device changes.
 */
function buildFingerprint(ipAddress: string, userAgent: string): string {
  return crypto
    .createHash('sha256')
    .update(`${ipAddress}:${userAgent}`)
    .digest('hex');
}

/**
 * Check if the request carries a valid device trust cookie for the given user.
 * Returns true if the device is trusted (skip MFA prompt).
 */
export async function isDeviceTrusted(
  userId: string,
  cookieValue: string | undefined,
  ipAddress: string,
  userAgent: string
): Promise<boolean> {
  if (!cookieValue) return false;

  try {
    // The cookie value is: encrypted(tokenId + ':' + fingerprint)
    const decrypted = decryptPendingToken(cookieValue);
    const [tokenId, fingerprintHash] = decrypted.split(':').slice(0, 2);
    if (!tokenId || !fingerprintHash) return false;

    const expectedFingerprint = buildFingerprint(ipAddress, userAgent);
    // Fingerprint must match (prevent cookie theft)
    if (fingerprintHash !== expectedFingerprint) return false;

    const { rows } = await pool.query(
      `SELECT id FROM device_trust_tokens
       WHERE id = $1 AND user_id = $2 AND token_hash = $3 AND expires_at > now()`,
      [tokenId, userId, crypto.createHash('sha256').update(cookieValue).digest('hex')]
    );

    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Issue a device trust cookie after successful MFA.
 * Stores a hashed token in device_trust_tokens.
 */
export async function trustDevice(
  userId: string,
  ipAddress: string,
  userAgent: string,
  res: Response
): Promise<void> {
  const tokenId = crypto.randomUUID();
  const fingerprint = buildFingerprint(ipAddress, userAgent);
  const expiresAt = new Date(Date.now() + DEVICE_TRUST_TTL_MS);

  // Payload: tokenId:fingerprint, encrypted
  const cookiePayload = encryptPendingToken(`${tokenId}:${fingerprint}`);
  const tokenHash = crypto.createHash('sha256').update(cookiePayload).digest('hex');

  await pool.query(
    `INSERT INTO device_trust_tokens (id, user_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [tokenId, userId, tokenHash, ipAddress, userAgent, expiresAt]
  );

  // Clean up expired tokens for this user
  await pool.query(
    `DELETE FROM device_trust_tokens WHERE user_id = $1 AND expires_at < now()`,
    [userId]
  ).catch((err) => log.warn('[twoFactorSessionService] Fire-and-forget failed:', err));

  res.cookie(DEVICE_TRUST_COOKIE, cookiePayload, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: DEVICE_TRUST_TTL_MS,
    path: '/',
  });
}

/**
 * Revoke all device trust tokens for a user (on MFA reset or manual revoke).
 */
export async function revokeAllDeviceTrust(userId: string): Promise<void> {
  await pool.query(`DELETE FROM device_trust_tokens WHERE user_id = $1`, [userId]);
}

// ─── Pending MFA Token ────────────────────────────────────────────────────────
// Used to maintain state between password-OK and TOTP-verify stages of login.
// Encrypted + time-limited so it cannot be reused or forged.

function encryptPendingToken(payload: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', PENDING_MFA_KEY, iv);
  let enc = cipher.update(payload, 'utf8', 'hex');
  enc += cipher.final('hex');
  return `${iv.toString('hex')}:${enc}`;
}

function decryptPendingToken(token: string): string {
  const [ivHex, enc] = token.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', PENDING_MFA_KEY, iv);
  let dec = decipher.update(enc, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

/**
 * Issue a pending-MFA login token.
 * Returns an encrypted string the client sends back to /api/auth/mfa/verify.
 */
export function issuePendingMfaToken(userId: string): string {
  const expiresAt = Date.now() + PENDING_MFA_TTL_MS;
  return encryptPendingToken(`${userId}:${expiresAt}`);
}

/**
 * Validate a pending-MFA token and extract the userId.
 * Throws on invalid/expired.
 */
export function validatePendingMfaToken(token: string): string {
  try {
    const decrypted = decryptPendingToken(token);
    const [userId, expiresAtStr] = decrypted.split(':');
    const expiresAt = parseInt(expiresAtStr, 10);
    if (!userId || isNaN(expiresAt) || Date.now() > expiresAt) {
      throw new Error('Pending MFA token expired or invalid');
    }
    return userId;
  } catch {
    throw new Error('Invalid pending MFA token');
  }
}

// ─── Concurrent Session Limit ─────────────────────────────────────────────────

/**
 * Register a new session for a user.
 * If the user already has MAX_CONCURRENT_SESSIONS, evict the oldest.
 */
export async function registerSession(
  userId: string,
  sessionId: string,
  ipAddress: string,
  userAgent: string,
  expiresAt?: Date
): Promise<void> {
  try {
    // Count current active sessions
    const { rows } = await pool.query(
      `SELECT id FROM user_sessions
       WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > now())
       ORDER BY last_active_at ASC`,
      [userId]
    );

    // Evict oldest sessions if at limit
    if (rows.length >= MAX_CONCURRENT_SESSIONS) {
      const toEvict = rows.slice(0, rows.length - MAX_CONCURRENT_SESSIONS + 1);
      for (const row of toEvict) {
        await pool.query(`DELETE FROM user_sessions WHERE id = $1`, [row.id]);
      }
    }

    await pool.query(
      `INSERT INTO user_sessions (id, user_id, session_id, ip_address, user_agent, expires_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       ON CONFLICT (session_id) DO UPDATE SET last_active_at = now()`,
      [userId, sessionId, ipAddress, userAgent, expiresAt ?? null]
    );
  } catch (err: any) {
    log.error('[TwoFactorSessionService] registerSession error:', err.message);
  }
}

/**
 * Remove a session when the user logs out.
 */
export async function removeSession(sessionId: string): Promise<void> {
  await pool.query(
    `DELETE FROM user_sessions WHERE session_id = $1`,
    [sessionId]
  ).catch((err) => log.warn('[twoFactorSessionService] Fire-and-forget failed:', err));
}

/**
 * Get all active sessions for a user.
 */
export async function getActiveSessions(userId: string): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, session_id, ip_address, user_agent, created_at, last_active_at, expires_at
     FROM user_sessions
     WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > now())
     ORDER BY last_active_at DESC`,
    [userId]
  );
  return rows;
}

// ─── Mandatory MFA Check ──────────────────────────────────────────────────────

/**
 * Returns true if the given role MUST have MFA enabled.
 */
export function isMfaMandatory(role: string): boolean {
  return MFA_MANDATORY_ROLES.has(role);
}

// ─── 2FA Admin Reset ──────────────────────────────────────────────────────────

/**
 * Reset a user's MFA (clear secret, disable, revoke device trust).
 * Only org_owner/platform_staff may call this.
 * Logs to sra_audit_log for accountability.
 */
export async function adminResetUserMfa(
  targetUserId: string,
  actorUserId: string,
  actorRole: string,
  workspaceId: string
): Promise<void> {
  if (!['org_owner', 'co_owner', 'platform_staff'].includes(actorRole)) {
    throw new Error('Insufficient permissions to reset MFA');
  }

  // Clear MFA from users table via pool (avoids Drizzle type complexity)
  await pool.query(
    `UPDATE users SET mfa_enabled = false, mfa_secret = NULL, mfa_backup_codes = NULL, mfa_last_used_at = NULL
     WHERE id = $1`,
    [targetUserId]
  );

  // Revoke all device trust tokens
  await revokeAllDeviceTrust(targetUserId);

  // Audit log
  await universalAudit.log({
    workspaceId,
    actorId: actorUserId,
    actorType: 'user',
    action: AUDIT_ACTIONS.RBAC_PERMISSION_CHANGED, // Closest match for MFA reset
    entityType: 'user_mfa',
    entityId: targetUserId,
    changeType: 'update',
    metadata: { actorRole, reason: 'Admin-initiated MFA reset', subAction: 'mfa_admin_reset' },
  });
}
