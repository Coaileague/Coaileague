/**
 * Workflow Execution Routes — real endpoints using agent_tasks, agent_task_logs,
 * workflow_artifacts tables
 */
import { Router } from 'express';
import { requireAuth } from '../rbac';
import { ensureWorkspaceAccess } from '../middleware/workspaceScope';
import type { AuthenticatedRequest } from '../rbac';
import { pool } from '../db';

const router = Router();

// GET /api/workflows/runs — recent workflow runs (agent tasks)
router.get('/runs', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT at.*, ar.name as agent_name,
             COUNT(atl.id) as log_count
      FROM agent_tasks at
      LEFT JOIN agent_registry ar ON ar.id = at.agent_id
      LEFT JOIN agent_task_logs atl ON atl.task_id = at.id
      WHERE at.workspace_id=$1
      GROUP BY at.id, ar.name
      ORDER BY at.created_at DESC
      LIMIT 50
    `, [req.workspaceId]);
    res.json({ runs: rows });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// GET /api/workflows/runs/:taskId/logs — logs for a specific workflow run
router.get('/runs/:taskId/logs', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM agent_task_logs
      WHERE task_id=$1
      ORDER BY created_at ASC
    `, [req.params.taskId]);
    res.json({ logs: rows });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// GET /api/workflows/artifacts — workflow output artifacts
router.get('/artifacts', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT wa.*, at.name as task_name
      FROM workflow_artifacts wa
      LEFT JOIN agent_tasks at ON at.id = wa.task_id
      WHERE wa.workspace_id=$1
      ORDER BY wa.created_at DESC
      LIMIT 50
    `, [req.workspaceId]);
    res.json({ artifacts: rows });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// GET /api/workflows/stats — workflow execution summary
router.get('/stats', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) as total_runs,
        COUNT(*) FILTER (WHERE status='completed') as completed,
        COUNT(*) FILTER (WHERE status='failed') as failed,
        COUNT(*) FILTER (WHERE status='running') as running,
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_duration_seconds
      FROM agent_tasks WHERE workspace_id=$1
    `, [req.workspaceId]);
    res.json(rows[0]);
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

export default router;
