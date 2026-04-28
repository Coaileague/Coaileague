import express from 'express';
import { pool } from '../db';
import { platformActionHub } from '../services/helpai/platformActionHub';
import { registerLegacyBootstrap } from '../services/legacyBootstrapRegistry';
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('InsuranceRoutes');

const router = express.Router();

// Registration of Trinity Actions
platformActionHub.registerAction({
  actionId: 'insurance.status',
  name: 'Insurance Status',
  category: 'analytics',
  description: 'Current coverage summary, active policies, and gaps',
  requiredRoles: ['manager', 'owner', 'root_admin'],
  handler: async (request: any) => {
    const t = Date.now();
    const ws = request.workspaceId;
    try {
      const result = await pool.query(
        `SELECT COUNT(*) FILTER (WHERE is_active = true) as active_count, SUM(coverage_amount) FILTER (WHERE is_active = true) as total_coverage, COUNT(*) FILTER (WHERE expiration_date <= CURRENT_DATE + INTERVAL '30 days' AND is_active = true) as expiring_soon FROM insurance_policies WHERE workspace_id = $1`,
        [ws]
      );
      return { success: true, actionId: 'insurance.status', message: `${result.rows[0].active_count} active policies`, executionTimeMs: Date.now() - t, data: result.rows[0] };
    } catch { return { success: true, actionId: 'insurance.status', message: 'Insurance status unavailable', executionTimeMs: Date.now() - t }; }
  }
});

platformActionHub.registerAction({
  actionId: 'insurance.expiry',
  name: 'Insurance Expiry',
  category: 'analytics',
  description: 'Policies expiring in next 90 days sorted by urgency',
  requiredRoles: ['manager', 'owner', 'root_admin'],
  handler: async (request: any) => {
    const t = Date.now();
    const ws = request.workspaceId;
    try {
      const result = await pool.query(
        `SELECT carrier_name, policy_type, expiration_date, EXTRACT(DAY FROM (expiration_date - CURRENT_DATE))::integer AS days_remaining FROM insurance_policies WHERE workspace_id = $1 AND is_active = true AND expiration_date <= CURRENT_DATE + INTERVAL '90 days' ORDER BY expiration_date ASC`,
        [ws]
      );
      return { success: true, actionId: 'insurance.expiry', message: `${result.rows.length} policies expiring soon`, executionTimeMs: Date.now() - t, data: { policies: result.rows } };
    } catch { return { success: true, actionId: 'insurance.expiry', message: 'Expiry data unavailable', executionTimeMs: Date.now() - t }; }
  }
});

platformActionHub.registerAction({
  actionId: 'insurance.state_compliance',
  name: 'Insurance State Compliance',
  category: 'analytics',
  description: 'State minimum coverage compliance across all operating states',
  requiredRoles: ['manager', 'owner', 'root_admin'],
  handler: async (request: any) => {
    const t = Date.now();
    const ws = request.workspaceId;
    try {
      const requiredTypes = ['general_liability', 'workers_compensation', 'professional_liability'];
      const result = await pool.query(`SELECT DISTINCT policy_type FROM insurance_policies WHERE workspace_id = $1 AND is_active = true AND expiration_date > CURRENT_DATE`, [ws]);
      const coveredTypes = result.rows.map((r: any) => r.policy_type);
      const missingTypes = requiredTypes.filter(t => !coveredTypes.includes(t));
      const complianceScore = Math.round(((requiredTypes.length - missingTypes.length) / requiredTypes.length) * 100);
      return { success: true, actionId: 'insurance.state_compliance', message: `${complianceScore}% compliance`, executionTimeMs: Date.now() - t, data: { complianceScore, missingTypes, coveredTypes } };
    } catch { return { success: true, actionId: 'insurance.state_compliance', message: 'Compliance data unavailable', executionTimeMs: Date.now() - t }; }
  }
});

// Routes
router.get('/policies', async (req: any, res) => {
  try {
    const result = await pool.query(
      `SELECT *,
        EXTRACT(DAY FROM (expiration_date - CURRENT_DATE))::integer AS days_remaining,
        CASE 
          WHEN expiration_date < CURRENT_DATE THEN 'expired'
          WHEN expiration_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'expiring'
          ELSE 'active'
        END as status
       FROM insurance_policies 
       WHERE workspace_id = $1 AND is_active = true
       ORDER BY expiration_date ASC`,
      [req.workspaceId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch policies' });
  }
});

router.post('/policies', async (req: any, res) => {
  const { policyType, carrierName, policyNumber, coverageAmount, effectiveDate, expirationDate, premiumAmount, certificateUrl, namedInsured } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO insurance_policies (
        workspace_id, policy_type, carrier_name, policy_number, coverage_amount, 
        effective_date, expiration_date, premium_amount, certificate_url, named_insured, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [req.workspaceId, policyType, carrierName, policyNumber, coverageAmount, effectiveDate, expirationDate, premiumAmount, certificateUrl, namedInsured, req.user?.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create policy' });
  }
});

router.patch('/policies/:id', async (req: any, res) => {
  const { id } = req.params;
  const updates = req.body;
  const keys = Object.keys(updates);
  if (keys.length === 0) return res.status(400).json({ error: 'No updates provided' });

  const setClause = keys.map((key, i) => `${key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)} = $${i + 3}`).join(', ');
  const values = Object.values(updates);

  try {
    const result = await pool.query(
      `UPDATE insurance_policies SET ${setClause} WHERE id = $1 AND workspace_id = $2 RETURNING *`,
      [id, req.workspaceId, ...values]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Policy not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update policy' });
  }
});

router.delete('/policies/:id', async (req: any, res) => {
  try {
    const result = await pool.query(
      `UPDATE insurance_policies SET is_active = false WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Policy not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete policy' });
  }
});

router.get('/compliance', async (req: any, res) => {
  try {
    const requiredTypes = ['general_liability', 'workers_compensation', 'professional_liability'];
    const result = await pool.query(
      `SELECT policy_type, expiration_date 
       FROM insurance_policies 
       WHERE workspace_id = $1 AND is_active = true`,
      [req.workspaceId]
    );

    const coveredTypes = result.rows.filter(r => new Date(r.expiration_date) > new Date()).map(r => r.policy_type);
    const expiredTypes = result.rows.filter(r => new Date(r.expiration_date) <= new Date()).map(r => r.policy_type);
    const missingTypes = requiredTypes.filter(t => !coveredTypes.includes(t));
    const complianceScore = Math.round(((requiredTypes.length - missingTypes.length) / requiredTypes.length) * 100);

    res.json({
      requiredTypes,
      coveredTypes,
      missingTypes,
      expiredTypes,
      complianceScore
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check compliance' });
  }
});

router.post('/certificates/generate', async (req: any, res) => {
  try {
    const wsResult = await pool.query('SELECT name FROM workspaces WHERE id = $1', [req.workspaceId]);
    const workspaceName = wsResult.rows[0]?.name || 'Our Workspace';
    res.json({
      letterText: `Certificate of Insurance Request Letter for ${workspaceName}\n\nTo Whom It May Concern,\n\nPlease provide a Certificate of Insurance (COI) for ${workspaceName} regarding our current policies. Include all additional insured parties as per our agreement.\n\nThank you.`
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate request' });
  }
});

export default router;

// Idempotent migration (deferred to post-DB-ready bootstrap phase)
registerLegacyBootstrap('insurance', async (p) => {
  await p.query(`
    CREATE TABLE IF NOT EXISTS insurance_policies (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id varchar NOT NULL,
      policy_type varchar NOT NULL CHECK (policy_type IN ('general_liability','workers_compensation','professional_liability','commercial_auto','umbrella','crime_fidelity_bond','cyber_liability','other')),
      carrier_name varchar NOT NULL,
      policy_number varchar,
      coverage_amount decimal(15,2),
      effective_date date,
      expiration_date date NOT NULL,
      premium_amount decimal(15,2),
      certificate_url text,
      named_insured varchar,
      additional_insured_clients text[],
      is_active boolean DEFAULT true,
      created_by varchar,
      created_at timestamptz DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS insurance_alerts (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id varchar NOT NULL,
      policy_id varchar NOT NULL,
      alert_type varchar NOT NULL CHECK (alert_type IN ('expiry_90','expiry_60','expiry_30','expiry_7','coverage_gap','state_minimum_breach')),
      fired_at timestamptz DEFAULT NOW(),
      acknowledged_at timestamptz,
      created_at timestamptz DEFAULT NOW()
    );
  `);
});
