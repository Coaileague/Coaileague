/**
 * Verification Override (Break-Glass) — Phase 18D
 * ================================================
 * A supervisor or org owner can grant a time-boxed bypass for an officer
 * whose phone is broken/replaced/temporarily unreachable so they can still
 * use SMS/voice flows from a different number.
 *
 *   POST grantOverride({ workspaceId, employeeId, fromPhone, supervisorPin,
 *                         hours = 24 })
 *      → verifies the supervisor's clock-in PIN belongs to a workspace
 *        member with manager+ role, then writes a row that the verifier
 *        will treat as if the phone were on file. Default 24h, max 7 days.
 *
 *   isPhoneOverridden(fromPhone, workspaceId?) → boolean
 *      → consulted by trinityCallerVerification.verifyCaller as a second
 *        chance after the standard phone-on-profile lookup fails.
 *
 * Every override is audited (who granted, who for, when expires, what
 * phone) so the trail is defensible if abused.
 */

import bcrypt from 'bcryptjs';
import { createLogger } from '../../lib/logger';
const log = createLogger('VerificationOverride');

const MAX_OVERRIDE_HOURS = 24 * 7;

let bootstrapped = false;
async function ensureTables(): Promise<void> {
  if (bootstrapped) return;
  try {
    const { pool } = await import('../../db');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS verification_overrides (
        id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        workspace_id  VARCHAR NOT NULL,
        employee_id   VARCHAR NOT NULL,
        from_phone    VARCHAR NOT NULL,
        granted_by    VARCHAR,
        granted_by_role VARCHAR,
        reason        TEXT,
        expires_at    TIMESTAMP NOT NULL,
        revoked_at    TIMESTAMP,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS verification_overrides_phone_idx
        ON verification_overrides(from_phone, expires_at);
      CREATE INDEX IF NOT EXISTS verification_overrides_workspace_idx
        ON verification_overrides(workspace_id);
    `);
    bootstrapped = true;
  } catch (err: unknown) {
    log.warn('[VerificationOverride] Bootstrap failed:', err?.message);
  }
}

export async function grantOverride(params: {
  workspaceId: string;
  employeeId: string;
  fromPhone: string;
  supervisorEmployeeNumber: string;
  supervisorPin: string;
  hours?: number;
  reason?: string;
}): Promise<{ success: boolean; expiresAt?: Date; reason?: string }> {
  await ensureTables();
  const hours = Math.min(Math.max(params.hours ?? 24, 1), MAX_OVERRIDE_HOURS);

  try {
    const { pool } = await import('../../db');

    // 1. Verify the supervisor's PIN
    const supRes = await pool.query(
      `SELECT e.id, e.first_name, e.last_name, e.clockin_pin_hash, e.workspace_role,
              e.organizational_title
         FROM employees e
        WHERE UPPER(e.employee_number) = UPPER($1)
          AND e.workspace_id = $2
          AND e.is_active = true
        LIMIT 1`,
      [params.supervisorEmployeeNumber, params.workspaceId]
    );
    if (!supRes.rows.length) return { success: false, reason: 'Supervisor not found' };
    const sup = supRes.rows[0];
    if (!sup.clockin_pin_hash) return { success: false, reason: 'Supervisor PIN not set' };
    const okPin = await bcrypt.compare(params.supervisorPin.replace(/\D/g, ''), sup.clockin_pin_hash);
    if (!okPin) return { success: false, reason: 'Supervisor PIN incorrect' };

    const role = (sup.workspace_role || sup.organizational_title || '').toLowerCase();
    const allowed = ['supervisor', 'manager', 'department_manager', 'org_admin', 'org_manager', 'co_owner', 'org_owner'];
    if (!allowed.some(r => role.includes(r))) {
      return { success: false, reason: 'Caller does not have authority to grant overrides' };
    }

    // 2. Confirm the target employee exists in this workspace
    const empRes = await pool.query(
      `SELECT 1 FROM employees WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [params.employeeId, params.workspaceId]
    );
    if (!empRes.rows.length) return { success: false, reason: 'Target employee not in this workspace' };

    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO verification_overrides
          (workspace_id, employee_id, from_phone, granted_by, granted_by_role, reason, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        params.workspaceId,
        params.employeeId,
        params.fromPhone,
        sup.id,
        role,
        params.reason || null,
        expiresAt,
      ]
    );

    log.info(`[VerificationOverride] Granted ${hours}h override for employee=${params.employeeId} phone=${params.fromPhone}`);
    return { success: true, expiresAt };
  } catch (err: unknown) {
    log.error('[VerificationOverride] grant failed:', err?.message);
    return { success: false, reason: err?.message };
  }
}

export async function isPhoneOverridden(fromPhone: string, workspaceId?: string): Promise<{
  overridden: boolean;
  employeeId?: string;
  workspaceId?: string;
  expiresAt?: Date;
}> {
  if (!fromPhone) return { overridden: false };
  try {
    await ensureTables();
    const { pool } = await import('../../db');
    const r = await pool.query(
      `SELECT employee_id, workspace_id, expires_at
         FROM verification_overrides
        WHERE from_phone = $1
          AND expires_at > NOW()
          AND revoked_at IS NULL
          ${workspaceId ? `AND workspace_id = $2` : ''}
        ORDER BY expires_at DESC
        LIMIT 1`,
      workspaceId ? [fromPhone, workspaceId] : [fromPhone]
    );
    if (!r.rows.length) return { overridden: false };
    return {
      overridden: true,
      employeeId: r.rows[0].employee_id,
      workspaceId: r.rows[0].workspace_id,
      expiresAt: r.rows[0].expires_at,
    };
  } catch (err: unknown) {
    log.warn('[VerificationOverride] check failed:', err?.message);
    return { overridden: false };
  }
}

export async function revokeOverride(id: string, revokedBy?: string): Promise<{ success: boolean }> {
  await ensureTables();
  try {
    const { pool } = await import('../../db');
    await pool.query(
      `UPDATE verification_overrides
          SET revoked_at = NOW()
        WHERE id = $1`,
      [id]
    );
    log.info(`[VerificationOverride] Revoked override ${id} by ${revokedBy || 'system'}`);
    return { success: true };
  } catch { return { success: false }; }
}

export async function listActiveOverrides(workspaceId: string): Promise<any[]> {
  await ensureTables();
  try {
    const { pool } = await import('../../db');
    const r = await pool.query(
      `SELECT vo.id, vo.employee_id, vo.from_phone, vo.granted_by, vo.granted_by_role,
              vo.reason, vo.expires_at, vo.created_at,
              e.first_name AS employee_first, e.last_name AS employee_last
         FROM verification_overrides vo
         LEFT JOIN employees e ON e.id = vo.employee_id
        WHERE vo.workspace_id = $1
          AND vo.expires_at > NOW()
          AND vo.revoked_at IS NULL
        ORDER BY vo.expires_at DESC`,
      [workspaceId]
    );
    return r.rows;
  } catch { return []; }
}
