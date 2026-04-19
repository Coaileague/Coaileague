/**
 * VOICE VERIFICATION CODE SERVICE — Phase 21 (Voice 2FA)
 * =======================================================
 * Lightweight, in-memory 6-digit verification codes for the voice 2FA flow.
 *
 * When an employee calls in but their phone number is not yet linked to a user
 * account (`no_user_link` reason from trinityCallerVerification), Trinity can
 * offer to send a one-time code to the employee's email on file. This service
 * stores the code keyed on the employee id with a short TTL and exposes
 * helpers for masking the destination email and verifying the code.
 *
 * The code is sent via the canonical CAN-SPAM compliant email pipeline so
 * delivery is logged and unsubscribes / hard bounces are honored.
 */

import { createLogger } from '../../lib/logger';

const log = createLogger('voiceVerificationCodeService');

interface PendingCode {
  code: string;
  expiresAt: number;
  attempts: number;
}

// Per-process map. Codes expire after 10 minutes; max 3 verify attempts each.
const codes = new Map<string, PendingCode>();
const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
  } catch (err: any) {
    log.warn('[VoiceVerifyCode] Email lookup failed:', err?.message);
    return null;
  }
}

/**
 * Generate and email a verification code to the employee. The code is
 * persisted in-process and verifiable for ~10 minutes.
 */
export async function sendVerificationCode(params: {
  employeeId: string;
  workspaceId: string;
  lang: 'en' | 'es';
}): Promise<{ sent: boolean; reason?: string }> {
  const { employeeId, workspaceId, lang } = params;
  try {
    const { pool } = await import('../../db');
    const r = await pool.query(
      `SELECT email, first_name FROM employees WHERE id = $1 LIMIT 1`,
      [employeeId],
    );
    const email = r.rows[0]?.email;
    const firstName = r.rows[0]?.first_name || '';
    if (!email || !email.includes('@')) return { sent: false, reason: 'no_email' };

    const code = generateCode();
    codes.set(employeeId, {
      code,
      expiresAt: Date.now() + TTL_MS,
      attempts: 0,
    });

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
  } catch (err: any) {
    log.warn('[VoiceVerifyCode] sendVerificationCode failed:', err?.message);
    return { sent: false, reason: 'exception' };
  }
}

/**
 * Verify a 6-digit code for an employee. Returns true on match. Codes are
 * single-use — a successful match removes the entry. Three failed attempts
 * also invalidate the code.
 */
export function verifyCode(employeeId: string, submitted: string): boolean {
  const entry = codes.get(employeeId);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    codes.delete(employeeId);
    return false;
  }
  entry.attempts += 1;
  if (entry.code === submitted) {
    codes.delete(employeeId);
    return true;
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    codes.delete(employeeId);
  }
  return false;
}
