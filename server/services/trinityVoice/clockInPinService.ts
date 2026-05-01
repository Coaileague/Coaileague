/**
 * server/services/trinityVoice/clockInPinService.ts
 * Phase 56/57 — Shared PIN Verification Service
 *
 * Single source of truth for clock-in PIN lookup and bcrypt comparison.
 * Used by:
 *   - Phase 57 clockinPinRoutes.ts (HTTP verify endpoint)
 *   - Phase 56 staffExtension.ts (voice clock-in IVR flow)
 */

import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
import { normalizePin, verifyPin as verifyPinHash } from '../../lib/pinService';
const log = createLogger('clockInPinService');


export interface PinVerifyResult {
  valid: boolean;
  reason?: 'no_employee' | 'no_pin' | 'wrong_pin' | 'ok';
  employee?: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    clockinPinHash: string;
  };
}

/**
 * Verify a clock-in PIN for a given employee number within a workspace.
 * Returns a structured result — never throws.
 */
export async function verifyClockInPin(
  workspaceId: string,
  employeeNumber: string,
  pin: string,
): Promise<PinVerifyResult> {
  try {
    const clean = normalizePin(pin);

    const result = await pool.query(
      `SELECT id, workspace_id, first_name, last_name, employee_number, clockin_pin_hash
       FROM employees
       WHERE UPPER(employee_number) = $1 AND workspace_id = $2
       LIMIT 1`,
      [employeeNumber.toUpperCase(), workspaceId],
    );
    const emp = result.rows[0];

    if (!emp) return { valid: false, reason: 'no_employee' };
    if (!emp.clockin_pin_hash) return { valid: false, reason: 'no_pin' };

    const match = await verifyPinHash(clean, emp.clockin_pin_hash);
    if (!match) return { valid: false, reason: 'wrong_pin' };

    return {
      valid: true,
      reason: 'ok',
      employee: {
        id: emp.id,
        employeeNumber: emp.employee_number,
        firstName: emp.first_name,
        lastName: emp.last_name,
        clockinPinHash: emp.clockin_pin_hash,
      },
    };
  } catch (err: unknown) {
    log.error('[ClockInPinService] PIN verification error:', err.message);
    return { valid: false, reason: 'wrong_pin' };
  }
}
