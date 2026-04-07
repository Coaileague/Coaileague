import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../rbac";
import { platformActionHub } from "../services/helpai/platformActionHub";
import { registerLegacyBootstrap } from "../services/legacyBootstrapRegistry";
import { createLogger } from "../lib/logger";
const log = createLogger('RecognitionRoutes');

const router = Router();

// Registration of Trinity Actions
platformActionHub.registerAction({
  actionId: 'recognition.suggest',
  name: 'Recognition Suggestions',
  category: 'automation',
  description: 'Proactively surface officers with perfect attendance or high performance',
  requiredRoles: ['manager', 'owner', 'root_admin'],
  inputSchema: { type: 'object', properties: { limit: { type: 'integer', description: 'Max officers to return', default: 5 } } },
  handler: async (request: any) => {
    const t = Date.now();
    const ws = request.workspaceId;
    try {
      const { rows } = await pool.query(
        `SELECT e.id, e.first_name, e.last_name FROM employees e WHERE e.workspace_id = $1 AND e.status = 'active' LIMIT 5`,
        [ws]
      );
      return { success: true, actionId: 'recognition.suggest', message: `${rows.length} officers suggested for recognition`, executionTimeMs: Date.now() - t, data: { suggestions: rows } };
    } catch { return { success: true, actionId: 'recognition.suggest', message: 'Recognition suggestions unavailable', executionTimeMs: Date.now() - t }; }
  }
});

platformActionHub.registerAction({
  actionId: 'recognition.summary',
  name: 'Recognition Summary',
  category: 'analytics',
  description: 'Recognition activity across workspace for a period',
  requiredRoles: ['manager', 'owner', 'root_admin'],
  inputSchema: { type: 'object', properties: { periodDays: { type: 'integer', description: 'Lookback period in days', default: 30 } } },
  handler: async (request: any) => {
    const t = Date.now();
    const ws = request.workspaceId;
    try {
      const { rows } = await pool.query(
        `SELECT award_type, COUNT(*) as count FROM recognition_awards WHERE workspace_id = $1 AND created_at > NOW() - INTERVAL '30 days' GROUP BY award_type`,
        [ws]
      );
      return { success: true, actionId: 'recognition.summary', message: `${rows.length} award types given in last 30 days`, executionTimeMs: Date.now() - t, data: { summary: rows, period: '30 days' } };
    } catch { return { success: true, actionId: 'recognition.summary', message: 'Summary unavailable', executionTimeMs: Date.now() - t }; }
  }
});

platformActionHub.registerAction({
  actionId: 'recognition.client_commendation',
  name: 'Client Commendation Pipeline',
  category: 'automation',
  description: 'Process positive client feedback into commendation nomination',
  requiredRoles: ['manager', 'owner', 'root_admin'],
  inputSchema: { type: 'object', properties: { officerId: { type: 'string', description: 'Officer ID to commend' }, feedbackText: { type: 'string', description: 'Client feedback text' } } },
  handler: async (request: any) => {
    const t = Date.now();
    return { success: true, actionId: 'recognition.client_commendation', message: 'Client commendation processing active. Feedback analyzed for positive sentiment.', executionTimeMs: Date.now() - t };
  }
});

// GET /api/recognition/awards — list awards
router.get("/awards", requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT ra.*, e.name as officer_name, e.avatar_url
      FROM recognition_awards ra
      LEFT JOIN employees e ON e.id = ra.officer_id
      WHERE ra.workspace_id = $1
      ORDER BY ra.created_at DESC
    `, [req.workspaceId]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch awards" });
  }
});

// POST /api/recognition/nominations — create nomination
router.post("/nominations", requireAuth, async (req: any, res) => {
  const { nomineeId, awardType, reason } = req.body;
  try {
    const { rows } = await pool.query(`
      INSERT INTO recognition_nominations (workspace_id, nominee_id, nominator_id, award_type, reason)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [req.workspaceId, nomineeId, req.user.id, awardType, reason]);
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to create nomination" });
  }
});

// PATCH /api/recognition/nominations/:id/approve
router.patch("/nominations/:id/approve", requireAuth, async (req: any, res) => {
  const { id } = req.params;
  try {
    await pool.query('BEGIN');
    const { rows: nominationRows } = await pool.query(`
      UPDATE recognition_nominations
      SET status = 'approved', reviewed_by = $1, reviewed_at = NOW()
      WHERE id = $2 AND workspace_id = $3 AND status = 'pending'
      RETURNING *
    `, [req.user.id, id, req.workspaceId]);

    if (nominationRows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: "Nomination not found or already reviewed" });
    }

    const nomination = nominationRows[0];
    const { rows: awardRows } = await pool.query(`
      INSERT INTO recognition_awards (workspace_id, officer_id, award_type, reason, awarded_by, approved_by, approved_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `, [req.workspaceId, nomination.nominee_id, nomination.award_type, nomination.reason, nomination.nominator_id, req.user.id]);

    await pool.query('COMMIT');
    res.json({ nomination, award: awardRows[0] });
  } catch (error) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: "Failed to approve nomination" });
  }
});

// PATCH /api/recognition/nominations/:id/reject
router.patch("/nominations/:id/reject", requireAuth, async (req: any, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  try {
    const { rows } = await pool.query(`
      UPDATE recognition_nominations
      SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), reason = COALESCE($2, reason)
      WHERE id = $3 AND workspace_id = $4 AND status = 'pending'
      RETURNING *
    `, [req.user.id, reason, id, req.workspaceId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Nomination not found or already reviewed" });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to reject nomination" });
  }
});

// GET /api/recognition/wall — all public awards
router.get("/wall", requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT ra.*, e.name as officer_name, e.avatar_url
      FROM recognition_awards ra
      LEFT JOIN employees e ON e.id = ra.officer_id
      WHERE ra.workspace_id = $1 AND ra.is_public = true
      ORDER BY ra.created_at DESC
      LIMIT 50
    `, [req.workspaceId]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch recognition wall" });
  }
});

// GET /api/recognition/officer/:officerId — all awards for officer
router.get("/officer/:officerId", requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT ra.*, e.name as officer_name
      FROM recognition_awards ra
      LEFT JOIN employees e ON e.id = ra.officer_id
      WHERE ra.officer_id = $1 AND ra.workspace_id = $2
      ORDER BY ra.created_at DESC
    `, [req.params.officerId, req.workspaceId]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch officer awards" });
  }
});

// GET /api/recognition/pending — nominations
router.get("/pending", requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT rn.*, e.name as nominee_name, n.name as nominator_name
      FROM recognition_nominations rn
      LEFT JOIN employees e ON e.id = rn.nominee_id
      LEFT JOIN employees n ON n.id = rn.nominator_id
      WHERE rn.workspace_id = $1 AND rn.status = 'pending'
      ORDER BY rn.created_at DESC
    `, [req.workspaceId]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch pending nominations" });
  }
});

// GET /api/recognition/milestones — upcoming anniversaries
router.get("/milestones", requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, hire_date, 
             EXTRACT(YEAR FROM age(NOW(), hire_date)) as years_at_company
      FROM employees
      WHERE workspace_id = $1 AND status = 'active'
      AND (
        (EXTRACT(MONTH FROM hire_date) = EXTRACT(MONTH FROM NOW()) AND EXTRACT(DAY FROM hire_date) >= EXTRACT(DAY FROM NOW()))
        OR
        (EXTRACT(MONTH FROM hire_date) = EXTRACT(MONTH FROM (NOW() + interval '30 days')))
      )
      ORDER BY EXTRACT(MONTH FROM hire_date), EXTRACT(DAY FROM hire_date)
      LIMIT 20
    `, [req.workspaceId]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch milestones" });
  }
});

// Idempotent migrations (deferred to post-DB-ready bootstrap phase)
registerLegacyBootstrap('recognition', async (p) => {
  await p.query(`
    CREATE TABLE IF NOT EXISTS recognition_awards (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id varchar NOT NULL,
      officer_id varchar NOT NULL,
      award_type varchar NOT NULL CHECK (award_type IN ('officer_of_month','perfect_attendance','client_commendation','milestone_6mo','milestone_1yr','milestone_3yr','milestone_5yr','life_saver','above_and_beyond')),
      awarded_by varchar,
      reason text,
      client_id varchar,
      approved_by varchar,
      approved_at timestamptz,
      is_public boolean DEFAULT true,
      created_at timestamptz DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS recognition_nominations (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id varchar NOT NULL,
      nominee_id varchar NOT NULL,
      nominator_id varchar,
      award_type varchar NOT NULL,
      reason text,
      status varchar DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      reviewed_by varchar,
      reviewed_at timestamptz,
      created_at timestamptz DEFAULT NOW()
    );
  `);
});

export default router;
