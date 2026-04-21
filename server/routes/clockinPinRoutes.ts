/**
 * server/routes/clockinPinRoutes.ts
 * Phase 57 — Clock-in PIN API
 *
 * Endpoints:
 *   POST /api/employees/:employeeId/pin/set    — Set or update clock-in PIN (manager+)
 *   POST /api/employees/:employeeId/pin/verify — Verify PIN for clock-in (returns employee info)
 *   DELETE /api/employees/:employeeId/pin      — Clear PIN (manager+)
 *   GET  /api/employees/:employeeId/pin/status — Has PIN set? (manager+)
 *   POST /api/employees/me/pin/set             — Self-service: set own PIN (any active employee)
 *   DELETE /api/employees/me/pin               — Self-service: clear own PIN
 *   GET  /api/employees/me/pin/status          — Self-service: check if own PIN is set
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db';
import { requireAuth } from '../auth';
import { requireWorkspaceRole } from '../rbac';
import { createLogger } from '../lib/logger';
import { verifyClockInPin } from '../services/trinityVoice/clockInPinService';
import { pinVerifyLimiter } from '../middleware/rateLimiter';
const log = createLogger('ClockinPinRoutes');


export const clockinPinRouter = Router();

const BCRYPT_ROUNDS = 10;

function validatePin(pin: string): string | null {
  if (!pin) return 'PIN is required';
  const clean = pin.replace(/\D/g, '');
  if (clean.length < 4 || clean.length > 8) return 'PIN must be 4–8 digits';
  return null;
}

// ─── Helper: fetch employee with workspace guard ──────────────────────────────
async function getEmployee(employeeId: string, workspaceId: string) {
  const res = await pool.query(
    `SELECT id, workspace_id, first_name, last_name, employee_number, clockin_pin_hash
     FROM employees WHERE id = $1 AND workspace_id = $2`,
    [employeeId, workspaceId],
  );
  return res.rows[0] ?? null;
}

// ─── SET PIN ────────────────────────────────────────────────────────────────
clockinPinRouter.post(
  '/:employeeId/pin/set',
  requireAuth,
  // @ts-expect-error — TS migration: fix in refactoring sprint
  requireWorkspaceRole(['manager', 'owner', 'root_admin']),
  async (req: any, res) => {
    try {
      const { employeeId } = req.params;
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
      const { pin } = req.body;

      const err = validatePin(pin ?? '');
      if (err) return res.status(400).json({ error: err });

      const emp = await getEmployee(employeeId, workspaceId);
      if (!emp) return res.status(404).json({ error: 'Employee not found' });

      const hash = await bcrypt.hash(pin.replace(/\D/g, ''), BCRYPT_ROUNDS);
      await pool.query(
        `UPDATE employees SET clockin_pin_hash = $1 WHERE id = $2`,
        [hash, employeeId],
      );

      res.json({
        success: true,
        message: `Clock-in PIN set for ${emp.first_name} ${emp.last_name}`,
        employeeNumber: emp.employee_number,
      });
    } catch (err: any) {
      log.error('[PIN] set error:', err);
      res.status(500).json({ error: 'Failed to set PIN' });
    }
  },
);

// ─── VERIFY PIN (used at clock-in kiosk / voice) ─────────────────────────────
clockinPinRouter.post(
  '/:employeeId/pin/verify',
  requireAuth,
  pinVerifyLimiter,
  async (req: any, res) => {
    try {
      const { employeeId } = req.params;
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
      const { pin } = req.body;

      if (!pin) return res.status(400).json({ error: 'PIN is required', valid: false });

      const emp = await getEmployee(employeeId, workspaceId);
      if (!emp) return res.status(404).json({ error: 'Employee not found', valid: false });

      if (!emp.clockin_pin_hash) {
        return res.status(400).json({ error: 'No PIN configured for this employee', valid: false });
      }

      const clean = pin.replace(/\D/g, '');
      const valid = await bcrypt.compare(clean, emp.clockin_pin_hash);

      if (!valid) {
        return res.status(401).json({ valid: false, error: 'Incorrect PIN' });
      }

      res.json({
        valid: true,
        employee: {
          id: emp.id,
          employeeNumber: emp.employee_number,
          firstName: emp.first_name,
          lastName: emp.last_name,
        },
      });
    } catch (err: any) {
      log.error('[PIN] verify error:', err);
      res.status(500).json({ error: 'PIN verification failed', valid: false });
    }
  },
);

// ─── VERIFY BY EMPLOYEE NUMBER (voice / Trinity pathway) ─────────────────────
clockinPinRouter.post(
  '/pin/verify-by-number',
  requireAuth,
  pinVerifyLimiter,
  async (req: any, res) => {
    try {
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
      const { employeeNumber, pin } = req.body;

      if (!employeeNumber || !pin) {
        return res.status(400).json({ error: 'employeeNumber and pin are required', valid: false });
      }

      const result = await verifyClockInPin(workspaceId, employeeNumber, pin);

      if (result.reason === 'no_employee') {
        return res.status(404).json({ error: 'Employee not found', valid: false });
      }
      if (result.reason === 'no_pin') {
        return res.status(400).json({ error: 'No PIN configured', valid: false });
      }
      if (!result.valid) {
        return res.status(401).json({ valid: false, error: 'Incorrect PIN' });
      }

      res.json({
        valid: true,
        employee: {
          id: result.employee!.id,
          employeeNumber: result.employee!.employeeNumber,
          firstName: result.employee!.firstName,
          lastName: result.employee!.lastName,
        },
      });
    } catch (err: any) {
      log.error('[PIN] verify-by-number error:', err);
      res.status(500).json({ error: 'PIN verification failed', valid: false });
    }
  },
);

// ─── CLEAR PIN ───────────────────────────────────────────────────────────────
clockinPinRouter.delete(
  '/:employeeId/pin',
  requireAuth,
  // @ts-expect-error — TS migration: fix in refactoring sprint
  requireWorkspaceRole(['manager', 'owner', 'root_admin']),
  async (req: any, res) => {
    try {
      const { employeeId } = req.params;
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;

      const emp = await getEmployee(employeeId, workspaceId);
      if (!emp) return res.status(404).json({ error: 'Employee not found' });

      await pool.query(`UPDATE employees SET clockin_pin_hash = NULL WHERE id = $1`, [employeeId]);
      res.json({ success: true, message: 'PIN cleared' });
    } catch (err: any) {
      log.error('[PIN] clear error:', err);
      res.status(500).json({ error: 'Failed to clear PIN' });
    }
  },
);

// ─── STATUS (has pin?) ───────────────────────────────────────────────────────
clockinPinRouter.get(
  '/:employeeId/pin/status',
  requireAuth,
  // @ts-expect-error — TS migration: fix in refactoring sprint
  requireWorkspaceRole(['manager', 'owner', 'root_admin']),
  async (req: any, res) => {
    try {
      const { employeeId } = req.params;
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;

      const emp = await getEmployee(employeeId, workspaceId);
      if (!emp) return res.status(404).json({ error: 'Employee not found' });

      res.json({
        hasPin: !!emp.clockin_pin_hash,
        employeeNumber: emp.employee_number,
      });
    } catch (err: any) {
      log.error('[PIN] status error:', err);
      res.status(500).json({ error: 'Failed to check PIN status' });
    }
  },
);

// ─── SELF-SERVICE: SET OWN PIN ────────────────────────────────────────────────
// Any active employee can set their own clock-in PIN without manager involvement.
clockinPinRouter.post(
  '/me/pin/set',
  requireAuth,
  async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
      if (!userId || !workspaceId) return res.status(401).json({ error: 'Unauthorized' });

      const { pin } = req.body;
      const err = validatePin(pin ?? '');
      if (err) return res.status(400).json({ error: err });

      const empRes = await pool.query(
        `SELECT id, first_name, last_name, employee_number
         FROM employees
         WHERE user_id = $1 AND workspace_id = $2 AND is_active = TRUE
         LIMIT 1`,
        [userId, workspaceId],
      );
      if (!empRes.rows[0]) {
        return res.status(404).json({ error: 'No employee record found for your account' });
      }

      const emp = empRes.rows[0];
      const hash = await bcrypt.hash(pin.replace(/\D/g, ''), BCRYPT_ROUNDS);
      await pool.query(
        `UPDATE employees SET clockin_pin_hash = $1, updated_at = NOW() WHERE id = $2`,
        [hash, emp.id],
      );

      res.json({ success: true, message: 'Clock-in PIN updated successfully', employeeNumber: emp.employee_number });
    } catch (err: any) {
      log.error('[PIN] self-service set error:', err);
      res.status(500).json({ error: 'Failed to set PIN' });
    }
  },
);

// ─── SELF-SERVICE: CLEAR OWN PIN ─────────────────────────────────────────────
clockinPinRouter.delete(
  '/me/pin',
  requireAuth,
  async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
      if (!userId || !workspaceId) return res.status(401).json({ error: 'Unauthorized' });

      await pool.query(
        `UPDATE employees SET clockin_pin_hash = NULL, updated_at = NOW()
         WHERE user_id = $1 AND workspace_id = $2`,
        [userId, workspaceId],
      );
      res.json({ success: true, message: 'PIN cleared' });
    } catch (err: any) {
      log.error('[PIN] self-service clear error:', err);
      res.status(500).json({ error: 'Failed to clear PIN' });
    }
  },
);

// ─── SELF-SERVICE: GET OWN PIN STATUS ────────────────────────────────────────
clockinPinRouter.get(
  '/me/pin/status',
  requireAuth,
  async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
      if (!userId || !workspaceId) return res.status(401).json({ error: 'Unauthorized' });

      const empRes = await pool.query(
        `SELECT clockin_pin_hash IS NOT NULL AS has_pin
         FROM employees
         WHERE user_id = $1 AND workspace_id = $2 AND is_active = TRUE
         LIMIT 1`,
        [userId, workspaceId],
      );

      res.json({ hasPin: empRes.rows[0]?.has_pin ?? false });
    } catch (err: any) {
      log.error('[PIN] self-service status error:', err);
      res.status(500).json({ error: 'Failed to get PIN status' });
    }
  },
);
