import { Router } from 'express';
import { pool } from '../db';
import { platformActionHub } from '../services/helpai/platformActionHub';
import { requireAuth } from '../auth';
import { createLogger } from '../lib/logger';
const log = createLogger('SiteSurveyRoutes');


const router = Router();

// Schema Migration
const initSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_surveys (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
        workspace_id varchar NOT NULL,
        client_id varchar,
        site_name varchar NOT NULL,
        address text,
        conducted_by varchar,
        conducted_at timestamptz DEFAULT NOW(),
        status varchar DEFAULT 'draft' CHECK (status IN ('draft','in_progress','completed','archived')),
        overall_risk_level varchar DEFAULT 'low' CHECK (overall_risk_level IN ('low','medium','high','critical')),
        summary text,
        recommendations text,
        created_at timestamptz DEFAULT NOW(),
        updated_at timestamptz DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS site_survey_zones (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
        workspace_id varchar NOT NULL,
        survey_id varchar NOT NULL,
        zone_name varchar NOT NULL,
        zone_type varchar CHECK (zone_type IN ('entry','perimeter','interior','parking','server_room','high_value','other')),
        risk_level varchar DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
        notes text,
        created_at timestamptz DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS site_survey_requirements (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
        workspace_id varchar NOT NULL,
        survey_id varchar NOT NULL,
        requirement_type varchar NOT NULL CHECK (requirement_type IN ('access_control','cctv','lighting','patrol_frequency','guard_post','alarm_system','visitor_management','other')),
        description text,
        is_met boolean DEFAULT false,
        priority varchar DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
        created_at timestamptz DEFAULT NOW()
      );
    `);
    log.info('Site Survey schema initialized');
  } catch (err) {
    log.error('Error initializing Site Survey schema:', err);
  }
};

initSchema();

// Trinity Actions
platformActionHub.registerAction({
  actionId: 'site_survey.pending',
  name: 'Pending Site Surveys',
  category: 'automation',
  description: 'Count of draft/in_progress surveys for workspace',
  requiredRoles: ['guard', 'supervisor', 'manager', 'owner', 'root_admin'],
  handler: async (request: any) => {
    const t = Date.now();
    const ws = request.workspaceId;
    try {
      const { rows } = await pool.query(
        "SELECT COUNT(*)::int as count FROM site_surveys WHERE workspace_id = $1 AND status IN ('draft', 'in_progress')",
        [ws]
      );
      return { success: true, actionId: 'site_survey.pending', message: `Found ${rows[0].count} pending surveys`, executionTimeMs: Date.now() - t, data: { count: rows[0].count } };
    } catch (err) {
      return { success: false, actionId: 'site_survey.pending', message: 'Data unavailable', executionTimeMs: Date.now() - t };
    }
  }
});

platformActionHub.registerAction({
  actionId: 'site_survey.high_risk',
  name: 'High Risk Site Surveys',
  category: 'automation',
  description: 'Surveys with overall_risk_level IN (\'high\',\'critical\')',
  requiredRoles: ['guard', 'supervisor', 'manager', 'owner', 'root_admin'],
  handler: async (request: any) => {
    const t = Date.now();
    const ws = request.workspaceId;
    try {
      const { rows } = await pool.query(
        "SELECT COUNT(*)::int as count FROM site_surveys WHERE workspace_id = $1 AND overall_risk_level IN ('high', 'critical')",
        [ws]
      );
      return { success: true, actionId: 'site_survey.high_risk', message: `Found ${rows[0].count} high risk surveys`, executionTimeMs: Date.now() - t, data: { count: rows[0].count } };
    } catch (err) {
      return { success: false, actionId: 'site_survey.high_risk', message: 'Data unavailable', executionTimeMs: Date.now() - t };
    }
  }
});

platformActionHub.registerAction({
  actionId: 'site_survey.completion_rate',
  name: 'Site Survey Completion Rate',
  category: 'automation',
  description: 'Percentage of completed surveys',
  requiredRoles: ['guard', 'supervisor', 'manager', 'owner', 'root_admin'],
  handler: async (request: any) => {
    const t = Date.now();
    const ws = request.workspaceId;
    try {
      const { rows } = await pool.query(
        "SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE status = 'completed')::int as completed FROM site_surveys WHERE workspace_id = $1",
        [ws]
      );
      const total = rows[0].total;
      const completed = rows[0].completed;
      const rate = total > 0 ? (completed / total) * 100 : 0;
      return { success: true, actionId: 'site_survey.completion_rate', message: `Completion rate is ${rate.toFixed(1)}%`, executionTimeMs: Date.now() - t, data: { rate, total, completed } };
    } catch (err) {
      return { success: false, actionId: 'site_survey.completion_rate', message: 'Data unavailable', executionTimeMs: Date.now() - t };
    }
  }
});

// API Routes
router.get('/', requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM site_surveys WHERE workspace_id = $1 ORDER BY created_at DESC',
      [req.workspaceId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch surveys' });
  }
});

router.post('/', requireAuth, async (req: any, res) => {
  const { siteName, clientId, address, conductedBy } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO site_surveys (workspace_id, site_name, client_id, address, conducted_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.workspaceId, siteName, clientId, address, conductedBy]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create survey' });
  }
});

router.get('/stats', requireAuth, async (req: any, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'draft') as draft,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE overall_risk_level IN ('high', 'critical')) as high_risk
       FROM site_surveys WHERE workspace_id = $1`,
      [req.workspaceId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.get('/:id', requireAuth, async (req: any, res) => {
  try {
    const surveyRes = await pool.query(
      'SELECT * FROM site_surveys WHERE id = $1 AND workspace_id = $2',
      [req.params.id, req.workspaceId]
    );
    if (surveyRes.rows.length === 0) return res.status(404).json({ error: 'Survey not found' });

    const zonesRes = await pool.query(
      'SELECT * FROM site_survey_zones WHERE survey_id = $1 AND workspace_id = $2',
      [req.params.id, req.workspaceId]
    );

    const requirementsRes = await pool.query(
      'SELECT * FROM site_survey_requirements WHERE survey_id = $1 AND workspace_id = $2',
      [req.params.id, req.workspaceId]
    );

    res.json({
      ...surveyRes.rows[0],
      zones: zonesRes.rows,
      requirements: requirementsRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch survey details' });
  }
});

router.patch('/:id', requireAuth, async (req: any, res) => {
  const { status, overall_risk_level, summary, recommendations } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE site_surveys SET 
        status = COALESCE($1, status), 
        overall_risk_level = COALESCE($2, overall_risk_level), 
        summary = COALESCE($3, summary), 
        recommendations = COALESCE($4, recommendations),
        updated_at = NOW()
       WHERE id = $5 AND workspace_id = $6 RETURNING *`,
      [status, overall_risk_level, summary, recommendations, req.params.id, req.workspaceId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update survey' });
  }
});

router.post('/:id/zones', requireAuth, async (req: any, res) => {
  const { zoneName, zoneType, riskLevel, notes } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO site_survey_zones (workspace_id, survey_id, zone_name, zone_type, risk_level, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.workspaceId, req.params.id, zoneName, zoneType, riskLevel, notes]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add zone' });
  }
});

router.post('/:id/requirements', requireAuth, async (req: any, res) => {
  const { requirementType, description, priority, isMet } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO site_survey_requirements (workspace_id, survey_id, requirement_type, description, priority, is_met) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.workspaceId, req.params.id, requirementType, description, priority, isMet]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add requirement' });
  }
});

router.patch('/requirements/:reqId', requireAuth, async (req: any, res) => {
  const { isMet, description, priority } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE site_survey_requirements SET 
        is_met = COALESCE($1, is_met), 
        description = COALESCE($2, description), 
        priority = COALESCE($3, priority)
       WHERE id = $4 AND workspace_id = $5 RETURNING *`,
      [isMet, description, priority, req.params.reqId, req.workspaceId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update requirement' });
  }
});

export default router;
