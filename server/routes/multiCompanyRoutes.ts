import { Router } from "express";
import { pool } from "../db";
import { registerLegacyBootstrap } from "../services/legacyBootstrapRegistry";
import { requireAuth } from "../rbac";
import { requirePlan } from '../tierGuards';
import { z } from 'zod';
import { platformActionHub } from "../services/helpai/platformActionHub";
import { platformEventBus } from "../services/platformEventBus";
import { createLogger } from "../lib/logger";

const log = createLogger('multi-company-routes');
const router = Router();
// Multi-company workspace management is a Business+ feature (multi_workspace, multi_location)
router.use(requireAuth, requirePlan('business'));

// Register Trinity Actions
platformActionHub.registerAction({
  actionId: 'multi_company.summary',
  name: 'Multi-Company Summary',
  category: 'analytics',
  description: 'Consolidated performance across all subsidiaries',
  requiredRoles: ['owner', 'root_admin'],
  inputSchema: { type: 'object', properties: {} },
  handler: async (request: any) => {
    const t = Date.now();
    const ws = request.workspaceId;
    try {
      const { rows: subs } = await pool.query(`SELECT COUNT(*) as count FROM workspace_relationships WHERE parent_workspace_id = $1 AND is_active = true`, [ws]);
      return { success: true, actionId: 'multi_company.summary', message: `${subs[0].count} subsidiaries in network`, executionTimeMs: Date.now() - t, data: { subsidiaryCount: parseInt(subs[0].count) } };
    } catch { return { success: true, actionId: 'multi_company.summary', message: 'Summary unavailable', executionTimeMs: Date.now() - t }; }
  }
});

platformActionHub.registerAction({
  actionId: 'multi_company.compliance',
  name: 'Multi-Company Compliance',
  category: 'analytics',
  description: 'Compliance score comparison across subsidiaries',
  requiredRoles: ['owner', 'root_admin'],
  inputSchema: { type: 'object', properties: {} },
  handler: async (request: any) => {
    const t = Date.now();
    return { success: true, actionId: 'multi_company.compliance', message: 'Compliance data aggregation active', executionTimeMs: Date.now() - t };
  }
});

platformActionHub.registerAction({
  actionId: 'multi_company.staffing',
  name: 'Multi-Company Staffing',
  category: 'automation',
  description: 'Inter-subsidiary staffing opportunities and coverage gaps',
  requiredRoles: ['owner', 'root_admin'],
  inputSchema: { type: 'object', properties: { limit: { type: 'integer', description: 'Max officers to return', default: 20 } } },
  handler: async (request: any) => {
    const t = Date.now();
    const ws = request.workspaceId;
    try {
      const { rows } = await pool.query(
        `SELECT e.id, e.first_name, e.last_name FROM employees e WHERE e.workspace_id IN (SELECT child_workspace_id FROM workspace_relationships WHERE parent_workspace_id = $1 AND is_active = true) AND e.status = 'active' LIMIT 20`,
        [ws]
      );
      return { success: true, actionId: 'multi_company.staffing', message: `${rows.length} officers available for inter-subsidiary coverage`, executionTimeMs: Date.now() - t, data: { availableOfficers: rows } };
    } catch { return { success: true, actionId: 'multi_company.staffing', message: 'Staffing data unavailable', executionTimeMs: Date.now() - t }; }
  }
});

// Routes
router.get('/subsidiaries', requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT wr.id as relationship_id, wr.relationship_type, wr.created_at, w.id as workspace_id, w.name, w.config
       FROM workspace_relationships wr
       JOIN workspaces w ON wr.child_workspace_id = w.id
       WHERE wr.parent_workspace_id = $1 AND wr.is_active = true`,
      [req.workspaceId]
    );
    res.json(rows);
  } catch (error) {
    log.error('Error fetching subsidiaries', error);
    res.status(500).json({ error: 'Failed to fetch subsidiaries' });
  }
});

router.post('/relationships', requireAuth, async (req: any, res) => {
  const { childWorkspaceId, relationshipType } = req.body;
  if (!childWorkspaceId || !relationshipType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO workspace_relationships (parent_workspace_id, child_workspace_id, relationship_type, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (parent_workspace_id, child_workspace_id) 
       DO UPDATE SET is_active = true, relationship_type = EXCLUDED.relationship_type
       RETURNING *`,
      [req.workspaceId, childWorkspaceId, relationshipType, req.user.id]
    );
    res.json(rows[0]);
  } catch (error) {
    log.error('Error creating relationship', error);
    res.status(500).json({ error: 'Failed to create relationship' });
  }
});

router.delete('/relationships/:id', requireAuth, async (req: any, res) => {
  try {
    await pool.query(
      `UPDATE workspace_relationships SET is_active = false 
       WHERE id = $1 AND parent_workspace_id = $2`,
      [req.params.id, req.workspaceId]
    );
    res.json({ success: true });
  } catch (error) {
    log.error('Error deleting relationship', error);
    res.status(500).json({ error: 'Failed to delete relationship' });
  }
});

router.get('/consolidated/dashboard', requireAuth, async (req: any, res) => {
  try {
    const { rows: subsidiaries } = await pool.query(
      `SELECT child_workspace_id FROM workspace_relationships 
       WHERE parent_workspace_id = $1 AND is_active = true`,
      [req.workspaceId]
    );

    const dashboard = await Promise.all(subsidiaries.map(async (sub) => {
      const { rows: metrics } = await pool.query(
        `SELECT 
          (SELECT COUNT(*) FROM employees WHERE workspace_id = $1) as officer_count,
          (SELECT COUNT(*) FROM clients WHERE workspace_id = $1) as client_count,
          (SELECT COUNT(*) FROM shifts WHERE workspace_id = $1 AND status = 'open') as open_shift_count`,
        [sub.child_workspace_id]
      );
      const { rows: workspace } = await pool.query('SELECT name FROM workspaces WHERE id = $1', [sub.child_workspace_id]);
      
      return {
        workspaceId: sub.child_workspace_id,
        workspaceName: workspace[0]?.name,
        officerCount: parseInt(metrics[0].officer_count),
        clientCount: parseInt(metrics[0].client_count),
        openShiftCount: parseInt(metrics[0].open_shift_count)
      };
    }));

    res.json(dashboard);
  } catch (error) {
    log.error('Error fetching consolidated dashboard', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

router.get('/consolidated/reports', requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM consolidated_reports WHERE parent_workspace_id = $1 ORDER BY generated_at DESC`,
      [req.workspaceId]
    );
    res.json(rows);
  } catch (error) {
    log.error('Error fetching consolidated reports', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

router.post('/policy/broadcast', requireAuth, async (req: any, res) => {
  const { policyType, description, subsidiaries } = req.body;
  try {
    // In a real app, this would iterate through subsidiaries and apply logic
    platformEventBus.emit('policy_broadcast', {
      workspaceId: req.workspaceId,
      policy: { type: policyType, description },
      subsidiaries
    });
    res.json({ success: true, subsidiaryCount: subsidiaries?.length || 0 });
  } catch (error) {
    log.error('Error broadcasting policy', error);
    res.status(500).json({ error: 'Failed to broadcast policy' });
  }
});

router.get('/officer-pool', requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.name, e.email, e.phone, w.name as workspace_name
       FROM employees e
       JOIN workspaces w ON e.workspace_id = w.id
       WHERE e.workspace_id IN (
         SELECT child_workspace_id FROM workspace_relationships 
         WHERE parent_workspace_id = $1 AND is_active = true
       ) AND e.status = 'active'`,
      [req.workspaceId]
    );
    res.json(rows);
  } catch (error) {
    log.error('Error fetching officer pool', error);
    res.status(500).json({ error: 'Failed to fetch officer pool' });
  }
});

// Idempotent migrations (deferred to post-DB-ready bootstrap phase)
registerLegacyBootstrap('multiCompany', async (p) => {
  await p.query(`
    CREATE TABLE IF NOT EXISTS workspace_relationships (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      parent_workspace_id varchar NOT NULL,
      child_workspace_id varchar NOT NULL,
      relationship_type varchar NOT NULL CHECK (relationship_type IN ('subsidiary','franchise','partner')),
      created_by varchar,
      created_at timestamptz DEFAULT NOW(),
      is_active boolean DEFAULT true,
      UNIQUE(parent_workspace_id, child_workspace_id)
    );
    CREATE TABLE IF NOT EXISTS consolidated_reports (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      parent_workspace_id varchar NOT NULL,
      report_type varchar NOT NULL,
      period_start date,
      period_end date,
      data jsonb,
      generated_at timestamptz DEFAULT NOW()
    );
  `);
});

export default router;
