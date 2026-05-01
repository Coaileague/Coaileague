/**
 * Scheduler Routes — real endpoints for autonomous scheduler status,
 * schedule templates, and shift coverage using shifts/schedules tables
 */
import { Router } from 'express';
import { requireAuth } from '../rbac';
import { ensureWorkspaceAccess } from '../middleware/workspaceScope';
import type { AuthenticatedRequest } from '../rbac';
import { pool } from '../db';

const router = Router();

// GET /api/scheduler/status — current scheduler state for workspace
router.get('/status', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM shifts WHERE workspace_id=$1 AND status='open' AND start_time > NOW()) as open_shifts,
        (SELECT COUNT(*) FROM shifts WHERE workspace_id=$1 AND status='completed' AND start_time > NOW()-INTERVAL '7 days') as completed_7d,
        (SELECT COUNT(*) FROM shift_offers WHERE workspace_id=$1 AND status='pending') as pending_offers,
        (SELECT COUNT(*) FROM shift_requests WHERE workspace_id=$1 AND status='pending') as pending_requests,
        (SELECT COUNT(*) FROM schedules WHERE workspace_id=$1 AND is_published=true) as published_schedules
    `, [req.workspaceId]);
    res.json({ status: 'running', metrics: rows[0] });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// GET /api/scheduler/templates — schedule templates
router.get('/templates', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT st.*, c.name as client_name
      FROM schedule_templates st
      LEFT JOIN clients c ON c.id = st.client_id
      WHERE st.workspace_id=$1 AND st.is_active=true
      ORDER BY st.name
    `, [req.workspaceId]);
    res.json({ templates: rows });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// GET /api/scheduler/coverage-gaps — open shifts needing coverage
router.get('/coverage-gaps', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.*, c.name as client_name, c.address as client_address
      FROM shifts s
      LEFT JOIN clients c ON c.id = s.client_id
      WHERE s.workspace_id=$1 AND s.status='open'
        AND s.start_time > NOW()
        AND s.start_time < NOW() + INTERVAL '14 days'
      ORDER BY s.start_time ASC
      LIMIT 50
    `, [req.workspaceId]);
    res.json({ gaps: rows, count: rows.length });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// GET /api/scheduler/offers — active shift offers
router.get('/offers', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT so.*, s.start_time, s.end_time, s.position,
             e.first_name, e.last_name, e.employee_number
      FROM shift_offers so
      JOIN shifts s ON s.id = so.shift_id
      LEFT JOIN employees e ON e.id = so.employee_id
      WHERE so.workspace_id=$1 AND so.status='pending'
        AND so.expires_at > NOW()
      ORDER BY so.created_at DESC
      LIMIT 50
    `, [req.workspaceId]);
    res.json({ offers: rows });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

export default router;
