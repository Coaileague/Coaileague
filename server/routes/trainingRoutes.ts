/**
 * Training Routes — real endpoints using training_modules, training_attempts,
 * training_certificates tables with seeded data
 */
import { Router } from 'express';
import { requireAuth } from '../rbac';
import { ensureWorkspaceAccess } from '../middleware/workspaceScope';
import type { AuthenticatedRequest } from '../rbac';
import { pool } from '../db';

const router = Router();

// GET /api/training/modules — all training modules for workspace
router.get('/modules', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT tm.*,
        COUNT(DISTINCT ta.employee_id) as enrolled_count,
        COUNT(DISTINCT ta.employee_id) FILTER (WHERE ta.passed=true) as passed_count
      FROM training_modules tm
      LEFT JOIN training_attempts ta ON ta.module_id = tm.id
      WHERE tm.workspace_id=$1 OR tm.workspace_id IS NULL
      GROUP BY tm.id
      ORDER BY tm.created_at DESC
    `, [req.workspaceId]);
    res.json({ modules: rows });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// GET /api/training/attempts/:employeeId — training attempts for an officer
router.get('/attempts/:employeeId', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT ta.*, tm.title as module_title, tm.passing_score
      FROM training_attempts ta
      JOIN training_modules tm ON tm.id = ta.module_id
      WHERE ta.employee_id=$1 AND ta.workspace_id=$2
      ORDER BY ta.started_at DESC
    `, [req.params.employeeId, req.workspaceId]);
    res.json({ attempts: rows });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// GET /api/training/certificates — all training certificates for workspace
router.get('/certificates', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT tc.*, tm.title as module_title,
             e.first_name, e.last_name, e.employee_number
      FROM training_certificates tc
      JOIN training_modules tm ON tm.id = tc.module_id
      JOIN employees e ON e.id = tc.employee_id
      WHERE tc.workspace_id=$1
      ORDER BY tc.issued_at DESC
      LIMIT 100
    `, [req.workspaceId]);
    res.json({ certificates: rows });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// GET /api/training/compliance-summary — training completion rates
router.get('/compliance-summary', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(DISTINCT e.id) as total_employees,
        COUNT(DISTINCT tc.employee_id) as certified_employees,
        COUNT(DISTINCT tc.id) as total_certs,
        COUNT(DISTINCT tc.id) FILTER (WHERE tc.expires_at < NOW() + INTERVAL '30 days' AND tc.expires_at > NOW()) as expiring_soon
      FROM employees e
      LEFT JOIN training_certificates tc ON tc.employee_id = e.id AND tc.workspace_id=$1
      WHERE e.workspace_id=$1 AND e.status='active'
    `, [req.workspaceId]);
    res.json(rows[0]);
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

export default router;
