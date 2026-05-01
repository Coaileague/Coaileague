/**
 * Workflow Config Routes — real endpoints using report_workflow_configs,
 * onboarding_workflow_templates, and agent_tasks tables
 */
import { Router } from 'express';
import { requireAuth } from '../rbac';
import { ensureWorkspaceAccess } from '../middleware/workspaceScope';
import type { AuthenticatedRequest } from '../rbac';
import { pool } from '../db';

const router = Router();

// GET /api/workflow-configs — all report workflow configs for workspace
router.get('/', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM report_workflow_configs
      WHERE workspace_id=$1
      ORDER BY created_at DESC
    `, [req.workspaceId]);
    res.json({ configs: rows });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// GET /api/workflow-configs/onboarding-templates — onboarding workflow templates
router.get('/onboarding-templates', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM onboarding_workflow_templates
      WHERE workspace_id=$1 OR workspace_id IS NULL
      ORDER BY created_at DESC
    `, [req.workspaceId]);
    res.json({ templates: rows });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// GET /api/workflow-configs/agent-tasks — Trinity agent tasks and status
router.get('/agent-tasks', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT at.*, ar.name as agent_name, ar.type as agent_type
      FROM agent_tasks at
      LEFT JOIN agent_registry ar ON ar.id = at.agent_id
      WHERE at.workspace_id=$1
      ORDER BY at.created_at DESC
      LIMIT 50
    `, [req.workspaceId]);
    res.json({ tasks: rows });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

// POST /api/workflow-configs — create a new workflow config
router.post('/', requireAuth, ensureWorkspaceAccess, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, type, config, isActive } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'name and type required' });
    const { rows } = await pool.query(`
      INSERT INTO report_workflow_configs (id, workspace_id, name, type, config, is_active, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW()) RETURNING *
    `, [req.workspaceId, name, type, JSON.stringify(config ?? {}), isActive ?? true]);
    res.status(201).json({ config: rows[0] });
  } catch (err: unknown) { res.status(500).json({ error: err.message }); }
});

export default router;
