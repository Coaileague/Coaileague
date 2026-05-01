/**
 * VOICE VERIFICATION CODE SERVICE — Phase 21 (Voice 2FA)
 * =======================================================
 * DB-backed 6-digit verification codes for the voice 2FA flow.
 *
 * When an employee calls in but their phone number is not yet linked to a user
 * account (`no_user_link` reason from trinityCallerVerification), Trinity can
 * offer to send a one-time code to the employee's email on file. Codes are
 * persisted in `voice_verification_codes` so they survive across server
 * instances in a load-balanced deploy.
 *
 * Security:
 *   - Codes are stored as SHA-256 hashes, not plaintext
 *   - 10-minute TTL enforced by expires_at
 *   - Max 3 verify attempts per code
 *   - Rate limit: max 3 code sends per employee per 15 minutes
 *   - Email delivery goes through the canonical CAN-SPAM compliant pipeline
 */

import { createHash, randomInt } from 'crypto';
import { createLogger } from '../../lib/logger';

const log = createLogger('voiceVerificationCodeService');

const TTL_MS = 10 * 60 * 1000;           // 10 minutes
const MAX_ATTEMPTS = 3;
const RATE_WINDOW_MS = 15 * 60 * 1000;   // 15-minute rate window
const MAX_SENDS_PER_WINDOW = 3;

function generateCode(): string {
  return String(randomInt(100000, 1000000));
}

function hashCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${local[1]}***@${domain}`;
}

/**
 * Look up the email-on-file for an employee and return a masked version
 * suitable for reading aloud. Returns null when no usable email is on file.
 */
export async function getMaskedEmailForEmployee(employeeId: string): Promise<string | null> {
  try {
    const { pool } = await import('../../db');
    const r = await pool.query(
      `SELECT email FROM employees WHERE id = $1 LIMIT 1`,
      [employeeId],
    );
    const email = r.rows[0]?.email;
    if (!email || !email.includes('@')) return null;
    return maskEmail(email);
  } catch (err: unknown) {
    log.warn('[VoiceVerifyCode] Email lookup failed:', err?.message);
    return null;
  }
}

/**
 * Generate and email a verification code to the employee. The code hash is
 * persisted in the `voice_verification_codes` table and verifiable for ~10
 * minutes via the corresponding `verifyCode` call. Enforces a rate limit of
 * {@link MAX_SENDS_PER_WINDOW} sends per {@link RATE_WINDOW_MS} per employee
 * so an attacker cannot spam the email quota.
 */
export async function sendVerificationCode(params: {
  employeeId: string;
  workspaceId: string;
  lang: 'en' | 'es';
}): Promise<{ sent: boolean; reason?: string }> {
  const { employeeId, workspaceId, lang } = params;
  try {
    const { pool } = await import('../../db');

    // Rate-limit check: how many codes issued in the last window?
    const windowStart = new Date(Date.now() - RATE_WINDOW_MS);
    const countRow = await pool.query(
      `SELECT COUNT(*)::int AS n FROM voice_verification_codes
        WHERE employee_id = $1 AND created_at >= $2`,
      [employeeId, windowStart],
    );
    const recentCount = countRow.rows[0]?.n ?? 0;
    if (recentCount >= MAX_SENDS_PER_WINDOW) {
      log.warn(`[VoiceVerifyCode] Rate limit hit for employee ${employeeId} (${recentCount} sends in window)`);
      return { sent: false, reason: 'rate_limited' };
    }

    const empRow = await pool.query(
      `SELECT email, first_name FROM employees WHERE id = $1 LIMIT 1`,
      [employeeId],
    );
    const email = empRow.rows[0]?.email;
    const firstName = empRow.rows[0]?.first_name || '';
    if (!email || !email.includes('@')) return { sent: false, reason: 'no_email' };

    const code = generateCode();
    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + TTL_MS);

    await pool.query(
      `INSERT INTO voice_verification_codes
          (employee_id, workspace_id, code_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [employeeId, workspaceId, codeHash, expiresAt],
    );

    const subject = lang === 'es'
      ? 'Su código de verificación de Co-League'
      : 'Your Co-League verification code';
    const greeting = lang === 'es'
      ? `Hola${firstName ? ` ${firstName}` : ''},`
      : `Hi${firstName ? ` ${firstName}` : ''},`;
    const body = lang === 'es'
      ? `Su código de verificación por voz es: <strong style="font-size:24px;letter-spacing:4px">${code}</strong><br><br>El código expira en 10 minutos. Si no solicitó este código, puede ignorar este correo.`
      : `Your voice verification code is: <strong style="font-size:24px;letter-spacing:4px">${code}</strong><br><br>This code expires in 10 minutes. If you did not request this code, you can safely ignore this email.`;
    const html = `<p>${greeting}</p><p>${body}</p><p>— Trinity, Co-League</p>`;

    const { sendCanSpamCompliantEmail } = await import('../emailCore');
    const result = await sendCanSpamCompliantEmail({
      to: email,
      subject,
      html,
      emailType: 'transactional_verification',
      workspaceId,
      skipUnsubscribeCheck: true,
    });

    if (!result.success) {
      log.warn(`[VoiceVerifyCode] Email send failed for employee ${employeeId}: ${result.reason || 'unknown'}`);
      return { sent: false, reason: 'email_failed' };
    }

    log.info(`[VoiceVerifyCode] Code sent to employee ${employeeId} (workspace ${workspaceId})`);
    return { sent: true };
  } catch (err: unknown) {
    log.warn('[VoiceVerifyCode] sendVerificationCode failed:', err?.message);
    return { sent: false, reason: 'exception' };
  }
}

/**
 * Verify a 6-digit code for an employee. Returns true on match. Matching
 * codes are marked consumed and cannot be re-used. Codes exceeding
 * {@link MAX_ATTEMPTS} failed attempts are invalidated.
 */
export async function verifyCode(employeeId: string, submitted: string): Promise<boolean> {
  try {
    const { pool } = await import('../../db');
    const submittedHash = hashCode(submitted);

    // Look up the most recent unconsumed, unexpired code for this employee.
    const r = await pool.query(
      `SELECT id, code_hash, attempts
         FROM voice_verification_codes
        WHERE employee_id = $1
          AND consumed_at IS NULL
          AND expires_at > NOW()
          AND attempts < $2
        ORDER BY created_at DESC
        LIMIT 1`,
      [employeeId, MAX_ATTEMPTS],
    );
    if (!r.rows.length) return false;

    const row = r.rows[0];
    const newAttempts = (row.attempts ?? 0) + 1;

    if (row.code_hash === submittedHash) {
      await pool.query(
        `UPDATE voice_verification_codes
            SET consumed_at = NOW(), attempts = $1
          WHERE id = $2`,
        [newAttempts, row.id],
      );
      return true;
    }

    await pool.query(
      `UPDATE voice_verification_codes SET attempts = $1 WHERE id = $2`,
      [newAttempts, row.id],
    );
    return false;
  } catch (err: unknown) {
    log.warn('[VoiceVerifyCode] verifyCode failed:', err?.message);
    return false;
  }
}
