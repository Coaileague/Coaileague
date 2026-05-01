/**
 * Compliance Routes — real endpoints querying security_incidents,
 * company_policies, document_signatures, governance_approvals
 */
import { Router } from 'express';
import { requireAuth } from '../rbac';
import { ensureWorkspaceAccess } from '../middleware/workspaceScope';
import type { AuthenticatedRequest } from '../rbac';
import { pool } from '../db';

const router = Router();

// GET /api/compliance/incidents — security incidents for workspace
router.get('/incidents', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT si.*, c.name as client_name
      FROM security_incidents si
      LEFT JOIN clients c ON c.id = si.client_id
      WHERE si.workspace_id = $1
      ORDER BY si.reported_at DESC
      LIMIT 50
    `, [req.workspaceId]);
    res.json({ incidents: rows, total: rows.length });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// GET /api/compliance/policies — company policies
router.get('/policies', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT cp.*,
        COUNT(pa.id) as acknowledgment_count
      FROM company_policies cp
      LEFT JOIN policy_acknowledgments pa ON pa.policy_id = cp.id
      WHERE cp.workspace_id = $1
      GROUP BY cp.id
      ORDER BY cp.created_at DESC
    `, [req.workspaceId]);
    res.json({ policies: rows });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// GET /api/compliance/signatures — document signatures
router.get('/signatures', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT ds.*, e.first_name, e.last_name, e.employee_number
      FROM document_signatures ds
      LEFT JOIN employees e ON e.id = ds.signer_id
      WHERE ds.workspace_id = $1
      ORDER BY ds.signed_at DESC
      LIMIT 100
    `, [req.workspaceId]);
    res.json({ signatures: rows });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// GET /api/compliance/approvals — governance approvals pending/recent
router.get('/approvals', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT ga.*, u.email as requester_email
      FROM governance_approvals ga
      LEFT JOIN users u ON u.id = ga.requester_id
      WHERE ga.workspace_id = $1
      ORDER BY ga.created_at DESC
      LIMIT 50
    `, [req.workspaceId]);
    res.json({ approvals: rows, pending: rows.filter((r: any) => r.status === 'pending').length });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// GET /api/compliance/summary — aggregate compliance health
router.get('/summary', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM security_incidents WHERE workspace_id=$1 AND status='open') as open_incidents,
        (SELECT COUNT(*) FROM company_policies WHERE workspace_id=$1 AND is_active=true) as active_policies,
        (SELECT COUNT(*) FROM governance_approvals WHERE workspace_id=$1 AND status='pending') as pending_approvals,
        (SELECT COUNT(*) FROM employees WHERE workspace_id=$1 AND license_expiry < NOW() + INTERVAL '30 days' AND license_expiry > NOW()) as expiring_licenses
    `, [req.workspaceId]);
    res.json(rows[0]);
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

export default router;
