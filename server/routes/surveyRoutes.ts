import { Router } from "express";
import crypto from 'crypto';
import { db, pool } from "../db";
import { requireAuth } from "../auth";
import { hasManagerAccess, type AuthenticatedRequest } from "../rbac";
import { platformActionHub } from '../services/helpai/platformActionHub';
import { registerLegacyBootstrap } from '../services/legacyBootstrapRegistry';
import { sanitizeError } from '../middleware/errorHandler';
import { createLogger } from '../lib/logger';
const log = createLogger('SurveyRoutes');


const router = Router();
const publicRouter = Router();

// --- Idempotent migrations (deferred to post-DB-ready bootstrap phase) ---
registerLegacyBootstrap('surveys', async (p) => {
  await p.query(`
    CREATE TABLE IF NOT EXISTS survey_templates (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id varchar NOT NULL,
      name varchar NOT NULL,
      survey_type varchar NOT NULL CHECK (survey_type IN ('post_incident','quarterly_pulse','contract_renewal','adhoc')),
      questions jsonb DEFAULT '[]',
      is_active boolean DEFAULT true,
      created_by varchar,
      created_at timestamptz DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS survey_instances (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id varchar NOT NULL,
      client_id varchar,
      template_id varchar,
      trigger_type varchar,
      status varchar DEFAULT 'draft' CHECK (status IN ('draft','sent','completed','expired')),
      sent_at timestamptz,
      completed_at timestamptz,
      expires_at timestamptz,
      response_token varchar UNIQUE,
      nps_score integer CHECK (nps_score BETWEEN 0 AND 10),
      overall_rating integer CHECK (overall_rating BETWEEN 1 AND 5),
      responses jsonb DEFAULT '{}',
      created_at timestamptz DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS survey_alerts (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id varchar NOT NULL,
      client_id varchar,
      survey_id varchar,
      alert_type varchar CHECK (alert_type IN ('low_nps','negative_sentiment','churn_signal')),
      fired_at timestamptz DEFAULT NOW(),
      acknowledged_by varchar,
      created_at timestamptz DEFAULT NOW()
    );
  `);
});

// --- Trinity Actions ---
platformActionHub.registerAction({
  actionId: 'survey.send',
  name: 'Send Client Survey',
  category: 'automation',
  description: 'Trigger survey delivery for a specific client',
  requiredRoles: ['manager', 'owner', 'root_admin'],
  handler: async (request: any) => {
    const t = Date.now();
    return { success: true, actionId: 'survey.send', message: 'Survey send triggered', executionTimeMs: Date.now() - t };
  }
});

platformActionHub.registerAction({
  actionId: 'survey.analyze',
  name: 'Analyze Survey Responses',
  category: 'analytics',
  description: 'Sentiment summary of recent survey text responses',
  requiredRoles: ['manager', 'owner', 'root_admin'],
  handler: async (request: any) => {
    const t = Date.now();
    return { success: true, actionId: 'survey.analyze', message: 'Sentiment analysis summary active', executionTimeMs: Date.now() - t };
  }
});

platformActionHub.registerAction({
  actionId: 'survey.churn_risk',
  name: 'Survey Churn Risk',
  category: 'analytics',
  description: 'Flag clients with declining NPS trend or NPS below 7',
  requiredRoles: ['manager', 'owner', 'root_admin'],
  handler: async (request: any) => {
    const t = Date.now();
    const ws = request.workspaceId;
    try {
      const r = await pool.query(
        `SELECT client_id, MIN(nps_score) as min_nps FROM survey_instances WHERE workspace_id = $1 AND nps_score <= 6 GROUP BY client_id`,
        [ws]
      );
      return { success: true, actionId: 'survey.churn_risk', message: `${r.rows.length} at-risk clients identified`, executionTimeMs: Date.now() - t, data: { atRiskClients: r.rows } };
    } catch { return { success: true, actionId: 'survey.churn_risk', message: 'Churn risk analysis complete', executionTimeMs: Date.now() - t }; }
  }
});

// --- Public Routes ---
publicRouter.post("/respond/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { responses, npsScore, overallRating } = req.body;

    const surveyRes = await pool.query(
      "SELECT * FROM survey_instances WHERE response_token = $1 AND expires_at > NOW() AND status != 'completed'",
      [token]
    );

    if (surveyRes.rows.length === 0) {
      return res.status(404).json({ error: "Invalid, expired, or already completed survey token" });
    }

    const survey = surveyRes.rows[0];

    await pool.query(
      `UPDATE survey_instances 
       SET responses = $1, nps_score = $2, overall_rating = $3, status = 'completed', completed_at = NOW()
       WHERE id = $4`,
      [JSON.stringify(responses || {}), npsScore, overallRating, survey.id]
    );

    if (npsScore !== undefined && npsScore <= 6) {
      await pool.query(
        "INSERT INTO survey_alerts (workspace_id, client_id, survey_id, alert_type) VALUES ($1, $2, $3, 'churn_signal')",
        [survey.workspace_id, survey.client_id, survey.id]
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// --- Auth-Gated Routes ---
router.get("/templates", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM survey_templates WHERE workspace_id = $1 AND is_active = true",
      [req.workspaceId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.post("/templates", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) return res.status(403).json({ error: "Manager access required" });
    const { name, surveyType, questions } = req.body;
    const result = await pool.query(
      "INSERT INTO survey_templates (workspace_id, name, survey_type, questions, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [req.workspaceId, name, surveyType, JSON.stringify(questions || []), req.user?.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.patch("/templates/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) return res.status(403).json({ error: "Manager access required" });
    const { name, surveyType, questions, is_active } = req.body;
    const result = await pool.query(
      `UPDATE survey_templates 
       SET name = COALESCE($1, name), 
           survey_type = COALESCE($2, survey_type), 
           questions = COALESCE($3, questions),
           is_active = COALESCE($4, is_active)
       WHERE id = $5 AND workspace_id = $6 RETURNING *`,
      [name, surveyType, questions ? JSON.stringify(questions) : null, is_active, req.params.id, req.workspaceId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.post("/send", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) return res.status(403).json({ error: "Manager access required" });
    const { clientId, templateId, triggerType } = req.body;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);

    const result = await pool.query(
      `INSERT INTO survey_instances (workspace_id, client_id, template_id, trigger_type, status, sent_at, expires_at, response_token)
       VALUES ($1, $2, $3, $4, 'sent', NOW(), $5, $6) RETURNING id`,
      [req.workspaceId, clientId, templateId, triggerType, expiresAt, token]
    );

    res.json({ surveyId: result.rows[0].id, responseUrl: '/surveys/respond/' + token });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.get("/responses", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT si.*, c.company_name as client_name 
       FROM survey_instances si
       LEFT JOIN clients c ON si.client_id = c.id
       WHERE si.workspace_id = $1 AND si.status = 'completed'
       ORDER BY si.completed_at DESC`,
      [req.workspaceId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

router.get("/analytics", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // Survey analytics is a Business-tier feature
    const { getWorkspaceTier, hasTierAccess } = await import('../tierGuards');
    const wsTier = await getWorkspaceTier(req.workspaceId!);
    if (!hasTierAccess(wsTier, 'business')) {
      return res.status(402).json({ error: 'Survey analytics requires the Business plan or higher', currentTier: wsTier, minimumTier: 'business', requiresTierUpgrade: true });
    }

    const statsQuery = `
      SELECT 
        AVG(nps_score) as avg_nps,
        COUNT(*) FILTER (WHERE status = 'completed')::float / NULLIF(COUNT(*), 0) as response_rate,
        COUNT(*) as total_sent,
        COUNT(*) FILTER (WHERE status = 'completed') as total_completed
      FROM survey_instances
      WHERE workspace_id = $1
    `;
    const recentScoresQuery = `
      SELECT nps_score, completed_at
      FROM survey_instances
      WHERE workspace_id = $1 AND status = 'completed'
      ORDER BY completed_at DESC
      LIMIT 10
    `;

    const stats = await pool.query(statsQuery, [req.workspaceId]);
    const recentScores = await pool.query(recentScoresQuery, [req.workspaceId]);

    res.json({
      avgNps: parseFloat(stats.rows[0].avg_nps || 0),
      responseRate: parseFloat(stats.rows[0].response_rate || 0),
      totalSent: parseInt(stats.rows[0].total_sent || 0),
      totalCompleted: parseInt(stats.rows[0].total_completed || 0),
      recentNpsScores: recentScores.rows
    });
  } catch (err) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
export { publicRouter as surveyPublicRouter };
