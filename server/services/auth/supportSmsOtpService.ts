/**
 * Support Login SMS OTP Service
 *
 * Generates a daily-rotating 6-digit PIN delivered via SMS for platform-role
 * (root_admin, deputy_admin, sysop, support_manager, support_agent,
 * compliance_officer) logins.
 *
 * Security properties:
 *  - Cryptographically-random 6-digit PIN (crypto.randomBytes, not Math.random)
 *  - Hashed at rest with bcrypt (cost 10 — fast enough for auth, still hardened)
 *  - One-time use: consuming the PIN marks it used so replay is impossible
 *  - Daily TTL: expires at midnight UTC of the day it was issued; a fresh PIN
 *    is required each calendar day
 *  - Superseded on re-request: requesting a new PIN revokes any unused prior
 *    PIN for the same user
 *  - SMS delivery via the canonical sendSMS() primitive (TRINITY.md §B)
 *
 * Storage: `support_login_otps` table, created by criticalConstraintsBootstrap.ts
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../../db';
import { sendSMS } from '../smsService';
import { createLogger } from '../../lib/logger';

const log = createLogger('supportSmsOtpService');

export const SUPPORT_PLATFORM_ROLES = new Set([
  'root_admin',
  'deputy_admin',
  'sysop',
  'support_manager',
  'support_agent',
  'compliance_officer',
]);

function endOfDayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

function generateOtp(): string {
  // Cryptographically secure 6-digit PIN in range [100000, 999999]
  const buf = crypto.randomBytes(4);
  const num = buf.readUInt32BE(0);
  return String(100000 + (num % 900000));
}

function isSmsConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_PHONE_NUMBER);
}

export interface OtpSendResult {
  success: boolean;
  error?: string;
  /** true when SMS infra is not configured — caller should skip the OTP gate */
  notConfigured?: boolean;
}

/**
 * Generate a new 6-digit PIN, replace any prior unused OTP for the user,
 * and deliver it via SMS to the given phone number.
 */
export async function generateAndSendSupportOtp(
  userId: string,
  phone: string
): Promise<OtpSendResult> {
  if (!isSmsConfigured()) {
    log.warn(`[SupportSmsOtp] Twilio not configured — skipping SMS OTP for user ${userId}`);
    return { success: false, notConfigured: true, error: 'SMS not configured' };
  }

  try {
    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = endOfDayUtc();

    // Supersede any unused OTP for this user, then insert the new one.
    await pool.query(
      `DELETE FROM support_login_otps WHERE user_id = $1 AND used_at IS NULL`,
      [userId]
    );
    await pool.query(
      `INSERT INTO support_login_otps (user_id, otp_hash, expires_at, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [userId, otpHash, expiresAt]
    );

    const result = await sendSMS({
      to: phone,
      body: `CoAIleague Support PIN: ${otp}. Valid until midnight UTC today. Do NOT share this code.`,
      type: 'support_login_otp',
      userId,
    });

    if (!result.success) {
      log.error(`[SupportSmsOtp] SMS delivery failed for user ${userId}: ${result.error}`);
      return { success: false, error: 'Failed to deliver SMS' };
    }

    log.info(`[SupportSmsOtp] Daily PIN issued for user ${userId}`);
    return { success: true };
  } catch (err) {
    log.error('[SupportSmsOtp] Unexpected error generating/sending OTP:', err);
    return { success: false, error: 'Internal error' };
  }
}

/**
 * Verify a submitted 6-digit PIN against the stored hash.
 * Marks the PIN as used on success (one-time use within the day).
 */
export async function verifySupportOtp(userId: string, code: string): Promise<boolean> {
  try {
    const { rows } = await pool.query<{ id: string; otp_hash: string }>(
      `SELECT id, otp_hash FROM support_login_otps
       WHERE user_id = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (!rows.length) return false;

    const { id, otp_hash } = rows[0];
    const isValid = await bcrypt.compare(code, otp_hash);

    if (isValid) {
      await pool.query(
        `UPDATE support_login_otps SET used_at = NOW() WHERE id = $1`,
        [id]
      );
    }

    return isValid;
  } catch (err) {
    log.error('[SupportSmsOtp] Error verifying OTP:', err);
    return false;
  }
}
