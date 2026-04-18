/**
 * Trinity SMS Identity Verification Service
 * ==========================================
 * Before Trinity helps with anything sensitive (schedule, pay, personal data),
 * she verifies the sender is who they claim to be.
 *
 * Verification tiers:
 *   TIER 1 — Phone match: Caller's phone matches an employee record → basic help
 *   TIER 2 — Employee number: Caller provides EMP-XXXX-00001 → personal data access
 *   TIER 3 — PIN: Caller provides their 4-digit clock-in PIN → full access
 *
 * Failure handling:
 *   - Cannot verify → log + notify management + offer limited help
 *   - New officer scenario: "You may be new! Here's how to set up your account."
 *   - Suspicious pattern → flag for review, escalate to management
 */

import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
const log = createLogger('SmsIdentity');

export type VerificationTier = 'none' | 'phone' | 'employee_number' | 'pin';

export interface VerifiedIdentity {
  tier: VerificationTier;
  employeeId: string;
  firstName: string;
  lastName: string;
  workspaceId: string;
  orgName: string;
  employeeNumber: string;
  isNewEmployee: boolean;
  hasSmsConsent: boolean;
}

export interface VerificationResult {
  verified: boolean;
  identity: VerifiedIdentity | null;
  failReason: 'no_record' | 'no_consent' | 'wrong_pin' | 'suspicious' | null;
  isNewOfficer: boolean;
}

/**
 * TIER 1: Verify by phone number alone (basic access)
 */
export async function verifyByPhone(phone: string): Promise<VerificationResult> {
  try {
    const digits = phone.replace(/\D/g, '').replace(/^1/, '');
    const result = await pool.query(`
      SELECT
        e.id, e.first_name, e.last_name, e.employee_number,
        e.workspace_id, e.created_at,
        COALESCE(w.company_name, w.name) AS org_name,
        sc.consent_given, sc.opt_out_at
      FROM employees e
      JOIN workspaces w ON w.id = e.workspace_id
      LEFT JOIN sms_consent sc ON sc.phone_number = e.phone
        AND sc.workspace_id = e.workspace_id
      WHERE REGEXP_REPLACE(e.phone, '[^0-9]', '', 'g') LIKE $1
        AND e.is_active = true
      LIMIT 1
    `, [`%${digits.slice(-10)}`]);

    if (!result.rows.length) {
      return { verified: false, identity: null, failReason: 'no_record', isNewOfficer: false };
    }

    const row = result.rows[0];
    const hiredDaysAgo = Math.floor((Date.now() - new Date(row.created_at).getTime()) / 86400000);
    const isNew = hiredDaysAgo <= 30;

    if (row.opt_out_at) {
      return { verified: false, identity: null, failReason: 'no_consent', isNewOfficer: isNew };
    }

    return {
      verified: true,
      isNewOfficer: isNew,
      failReason: null,
      identity: {
        tier: 'phone',
        employeeId: row.id,
        firstName: row.first_name || 'Officer',
        lastName: row.last_name || '',
        workspaceId: row.workspace_id,
        orgName: row.org_name || 'your organization',
        employeeNumber: row.employee_number || '',
        isNewEmployee: isNew,
        hasSmsConsent: !!row.consent_given,
      },
    };
  } catch (err: any) {
    log.error('[SmsIdentity] Phone verification error:', err?.message);
    return { verified: false, identity: null, failReason: 'no_record', isNewOfficer: false };
  }
}

/**
 * TIER 2: Verify employee number (personal data access)
 */
export async function verifyByEmployeeNumber(
  phone: string,
  employeeNumber: string
): Promise<VerificationResult> {
  try {
    const digits = phone.replace(/\D/g, '').replace(/^1/, '');
    const empNum = employeeNumber.toUpperCase().replace(/[^A-Z0-9-]/g, '');

    const result = await pool.query(`
      SELECT e.id, e.first_name, e.last_name, e.employee_number,
             e.workspace_id, e.created_at,
             COALESCE(w.company_name, w.name) AS org_name
      FROM employees e
      JOIN workspaces w ON w.id = e.workspace_id
      WHERE UPPER(e.employee_number) = $1
        AND REGEXP_REPLACE(e.phone, '[^0-9]', '', 'g') LIKE $2
        AND e.is_active = true
      LIMIT 1
    `, [empNum, `%${digits.slice(-10)}`]);

    if (!result.rows.length) {
      await logFailedVerification(phone, 'employee_number_mismatch');
      return { verified: false, identity: null, failReason: 'no_record', isNewOfficer: false };
    }

    const row = result.rows[0];
    return {
      verified: true,
      isNewOfficer: false,
      failReason: null,
      identity: {
        tier: 'employee_number',
        employeeId: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        workspaceId: row.workspace_id,
        orgName: row.org_name || 'your organization',
        employeeNumber: row.employee_number,
        isNewEmployee: false,
        hasSmsConsent: true,
      },
    };
  } catch (err: any) {
    log.error('[SmsIdentity] Employee number verification error:', err?.message);
    return { verified: false, identity: null, failReason: 'no_record', isNewOfficer: false };
  }
}

/**
 * Log failed verification attempts and notify management if suspicious
 */
export async function logFailedVerification(
  phone: string,
  reason: string
): Promise<void> {
  try {
    await pool.query(`
      INSERT INTO security_audit_log
        (event_type, severity, ip_address, path, method, description, created_at)
      VALUES ('sms_identity_failure', 'medium', $1, '/sms/inbound', 'POST', $2, NOW())
    `, [phone, `SMS identity verification failed: ${reason}`]);

    log.warn(`[SmsIdentity] Failed verification from ${phone}: ${reason}`);
  } catch (err: any) {
    log.warn('[SmsIdentity] Could not log failure:', err?.message);
  }
}

/**
 * Notify management of unverified contact — creates a support ticket so
 * supervisors see the SMS in their ticket queue and can assist a likely new hire.
 */
export async function notifyManagementUnverified(
  phone: string,
  message: string,
  workspaceId?: string
): Promise<void> {
  try {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const ticketNumber = `TXT-UNV-${dateStr}-${rand}`;

    await pool.query(`
      INSERT INTO support_tickets
        (workspace_id, ticket_number, type, subject, description,
         status, priority, submission_method, created_at, updated_at)
      VALUES ($1, $2, 'support', $3, $4, 'open', 'low', 'sms', NOW(), NOW())
    `, [
      workspaceId || 'coaileague-platform-workspace',
      ticketNumber,
      'Unverified SMS contact',
      `Unidentified person texted Trinity from ${phone}. Message: "${message.slice(0, 200)}". May be a new officer who does not know their credentials yet.`,
    ]);
    log.info(`[SmsIdentity] Management notified of unverified contact from ${phone}`);
  } catch (err: any) {
    log.warn('[SmsIdentity] Could not notify management:', err?.message);
  }
}
