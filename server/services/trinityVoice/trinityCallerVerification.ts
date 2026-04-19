/**
 * Trinity Caller Verification — Phase 18C (Security)
 * ===================================================
 * Anti-fraud guard for SMS + voice flows that touch personal data.
 *
 * Rule: a caller is "verified" only when the From phone number is on file
 * for an active employee record AND that employee record is linked to a
 * user account (employees.user_id). This prevents a friend or family
 * member from using an officer's phone number context (clock in/out,
 * complaint, status check, etc.) without authorization.
 *
 * Verification is NOT required for:
 *   - Sales / Careers / Employment Verification (informational extensions)
 *   - Client support escalation lane
 *   - Auditor flow (separate /api/auditor/* surface with its own auth)
 *   - HELP / opt-in / opt-out keywords (TCPA-required)
 *
 * Verification IS required for:
 *   - SMS CLOCKIN, CLOCKOUT, COMPLAINT, REQUEST, STATUS
 *   - Voice "Press 1 — employee/user" personalized lane
 *   - Any Trinity action that mutates the officer's record from a phone
 */

import { createLogger } from '../../lib/logger';
const log = createLogger('TrinityCallerVerification');

export interface CallerVerification {
  verified: boolean;
  reason?: 'no_phone_match' | 'no_user_link' | 'inactive' | 'lookup_error';
  employeeId?: string;
  userId?: string;
  workspaceId?: string;
  firstName?: string;
  lastName?: string;
  employeeNumber?: string;
  /**
   * The tenant's universal organization ID (workspaces.org_id, format
   * `ORG-<code>-<seq>`). Populated for verified callers so Trinity, HelpAI,
   * and the agent dashboard can identify the owning tenant by its canonical
   * public code, not just by workspace UUID.
   */
  orgId?: string;
}

/**
 * Look up an employee record by the caller's From phone number. Returns
 * `verified: true` only when:
 *   - exactly one active employee row matches the (last 10 digits of the) phone
 *   - that row has a non-null user_id (i.e. the employee has claimed their account)
 */
export async function verifyCaller(fromPhone: string): Promise<CallerVerification> {
  if (!fromPhone) return { verified: false, reason: 'no_phone_match' };
  try {
    const { pool } = await import('../../db');
    const digits = fromPhone.replace(/\D/g, '').replace(/^1/, '');
    if (digits.length < 7) return { verified: false, reason: 'no_phone_match' };

    const r = await pool.query(
      `SELECT e.id, e.workspace_id, e.user_id, e.first_name, e.last_name,
              e.employee_number, e.is_active, w.org_id
         FROM employees e
         LEFT JOIN workspaces w ON w.id = e.workspace_id
        WHERE REGEXP_REPLACE(coalesce(e.phone, ''), '[^0-9]', '', 'g') LIKE $1
        ORDER BY (e.is_active = true) DESC, e.updated_at DESC NULLS LAST
        LIMIT 1`,
      [`%${digits.slice(-10)}`]
    );
    if (!r.rows.length) {
      // Phone not on any profile — second chance: check break-glass override.
      const { isPhoneOverridden } = await import('./verificationOverrideService');
      const ovr = await isPhoneOverridden(fromPhone);
      if (ovr.overridden && ovr.employeeId) {
        const e = await pool.query(
          `SELECT e.id, e.workspace_id, e.user_id, e.first_name, e.last_name,
                  e.employee_number, e.is_active, w.org_id
             FROM employees e
             LEFT JOIN workspaces w ON w.id = e.workspace_id
            WHERE e.id = $1 LIMIT 1`,
          [ovr.employeeId]
        );
        if (e.rows.length && e.rows[0].is_active) {
          const row = e.rows[0];
          return {
            verified: true,
            employeeId: row.id,
            userId: row.user_id,
            workspaceId: row.workspace_id,
            firstName: row.first_name,
            lastName: row.last_name,
            employeeNumber: row.employee_number,
            orgId: row.org_id,
          };
        }
      }
      return { verified: false, reason: 'no_phone_match' };
    }

    const row = r.rows[0];
    if (!row.is_active) return { verified: false, reason: 'inactive' };
    if (!row.user_id) {
      return {
        verified: false,
        reason: 'no_user_link',
        employeeId: row.id,
        workspaceId: row.workspace_id,
        firstName: row.first_name,
        lastName: row.last_name,
        employeeNumber: row.employee_number,
        orgId: row.org_id,
      };
    }
    return {
      verified: true,
      employeeId: row.id,
      userId: row.user_id,
      workspaceId: row.workspace_id,
      firstName: row.first_name,
      lastName: row.last_name,
      employeeNumber: row.employee_number,
      orgId: row.org_id,
    };
  } catch (err: any) {
    log.warn('[CallerVerify] lookup failed:', err?.message);
    return { verified: false, reason: 'lookup_error' };
  }
}

/** Standardized friendly failure message for both SMS and voice. */
export function verificationFailureMessageSms(): string {
  return (
    `Trinity: For your security, this number isn't on file for an active employee account. ` +
    `If you reached this by mistake, please visit coaileague.com or call (866) 464-4151 ` +
    `and choose option 2 for help. — Trinity`
  );
}

export function verificationFailureMessageVoice(lang: 'en' | 'es' = 'en'): string {
  if (lang === 'es') {
    return (
      'Por seguridad, este número no está vinculado a una cuenta de empleado activa. ' +
      'Si cree que llegó aquí por error, visite Co-League punto com o llame al ocho seis seis cuatro seis cuatro cuatro uno cinco uno y elija la opción dos para obtener ayuda. ' +
      'Pasando al menú general.'
    );
  }
  return (
    'For your security, this number is not linked to an active employee account. ' +
    'If you believe you reached this by mistake, please visit Co-League dot com or call back and choose option 2 for assistance. ' +
    'Taking you to the general menu now.'
  );
}
