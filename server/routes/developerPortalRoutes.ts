import { Router } from "express";
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool } from "../db";
import { requireAuth } from "../rbac";
import { platformActionHub } from '../services/helpai/platformActionHub';
import { registerLegacyBootstrap } from '../services/legacyBootstrapRegistry';
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('DeveloperPortalRoutes');


const router = Router();

// === DB migrations (deferred to post-DB-ready bootstrap phase) ===
registerLegacyBootstrap('developerPortal', async (p) => {
  await p.query(`
    CREATE TABLE IF NOT EXISTS developer_api_keys (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      workspace_id varchar NOT NULL,
      name varchar NOT NULL,
      key_hash varchar NOT NULL,
      key_prefix varchar(8) NOT NULL,
      scopes text[] DEFAULT '{}',
      last_used_at timestamptz,
      expires_at timestamptz,
      is_active boolean DEFAULT true,
      created_by varchar,
      created_at timestamptz DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS developer_api_key_usage (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      api_key_id varchar NOT NULL,
      workspace_id varchar NOT NULL,
      endpoint varchar,
      method varchar,
      response_status integer,
      response_time_ms integer,
      timestamp timestamptz DEFAULT NOW()
    );
  `);
});

// === Trinity Actions ===
platformActionHub.registerAction({
  actionId: 'api.usage.summary',
  name: 'API Usage Summary',
  category: 'analytics',
  description: 'API usage metrics and top consumers for workspace',
  requiredRoles: ['owner', 'root_admin'],
  handler: async (request: any) => {
    const t = Date.now();
    const ws = request.workspaceId;
    try {
      const result = await pool.query(`SELECT COUNT(*) as total_calls FROM developer_api_key_usage WHERE workspace_id = $1 AND timestamp > NOW() - INTERVAL '24 hours'`, [ws]);
      return { success: true, actionId: 'api.usage.summary', message: `${result.rows[0].total_calls} API calls in last 24h`, executionTimeMs: Date.now() - t, data: { totalCalls24h: parseInt(result.rows[0].total_calls) } };
    } catch { return { success: true, actionId: 'api.usage.summary', message: 'Usage data unavailable', executionTimeMs: Date.now() - t }; }
  }
});

platformActionHub.registerAction({
  actionId: 'api.keys.status',
  name: 'API Keys Status',
  category: 'analytics',
  description: 'Active API keys, their scopes, and recent usage',
  requiredRoles: ['owner', 'root_admin'],
  handler: async (request: any) => {
    const t = Date.now();
    const ws = request.workspaceId;
    try {
      const result = await pool.query(`SELECT name, scopes FROM developer_api_keys WHERE workspace_id = $1 AND is_active = true`, [ws]);
      return { success: true, actionId: 'api.keys.status', message: `${result.rows.length} active API keys`, executionTimeMs: Date.now() - t, data: { activeKeysCount: result.rows.length, keys: result.rows } };
    } catch { return { success: true, actionId: 'api.keys.status', message: 'Key status unavailable', executionTimeMs: Date.now() - t }; }
  }
});

// === Routes ===

// GET /api/developers/keys
router.get('/keys', requireAuth, async (req: any, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, key_prefix, scopes, last_used_at, expires_at, is_active, created_at 
      FROM developer_api_keys 
      WHERE workspace_id = $1 
      ORDER BY created_at DESC
    `, [req.workspaceId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

// POST /api/developers/keys
router.post('/keys', requireAuth, async (req: any, res) => {
  try {
    const { name, scopes, expiresAt } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const rawKey = 'sk_live_' + crypto.randomBytes(16).toString('hex');
    const keyHash = await bcrypt.hash(rawKey, 10);
    const keyPrefix = rawKey.substring(0, 8);

    const result = await pool.query(`
      INSERT INTO developer_api_keys (workspace_id, name, key_hash, key_prefix, scopes, expires_at, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, key_prefix, scopes, created_at
    `, [req.workspaceId, name, keyHash, keyPrefix, scopes || [], expiresAt || null, req.user?.id]);

    res.status(201).json({
      ...result.rows[0],
      key: rawKey // ONLY returned here
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// DELETE /api/developers/keys/:id
router.delete('/keys/:id', requireAuth, async (req: any, res) => {
  try {
    const result = await pool.query(`
      UPDATE developer_api_keys 
      SET is_active = false 
      WHERE id = $1 AND workspace_id = $2
      RETURNING id
    `, [req.params.id, req.workspaceId]);

    if (result.rowCount === 0) return res.status(404).json({ error: 'Key not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// GET /api/developers/keys/:id/usage
router.get('/keys/:id/usage', requireAuth, async (req: any, res) => {
  try {
    const result = await pool.query(`
      SELECT endpoint, method, response_status, COUNT(*) as count 
      FROM developer_api_key_usage 
      WHERE api_key_id = $1 AND workspace_id = $2
      GROUP BY endpoint, method, response_status 
      ORDER BY count DESC 
      LIMIT 20
    `, [req.params.id, req.workspaceId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch key usage' });
  }
});

// GET /api/developers/status
router.get('/status', requireAuth, async (req: any, res) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) as count 
      FROM developer_api_keys 
      WHERE workspace_id = $1 AND is_active = true
    `, [req.workspaceId]);

    res.json({
      status: 'operational',
      rateLimitDefault: 1000,
      activeKeys: parseInt(result.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

export default router;
