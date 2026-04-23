/**
 * BOOTSTRAP ROUTES — /api/bootstrap/*
 * No authentication required. Protected by DEV_BOOTSTRAP_KEY env var.
 */

import { Router, type Request, type Response } from 'express';
import { pool } from '../db';
import { createLogger } from '../lib/logger';
import { isProduction } from '../lib/isProduction';
import { sanitizeError } from '../middleware/errorHandler';
import bcrypt from 'bcryptjs';

const log = createLogger('Bootstrap');
const router = Router();

router.post('/dev-seed', async (req: Request, res: Response) => {
  if (isProduction()) {
    return res.status(403).json({ error: 'Bootstrap refused — production environment' });
  }

  const key = req.headers['x-bootstrap-key'] || req.body?.bootstrapKey;
  const expectedKey = process.env.DEV_BOOTSTRAP_KEY;

  if (!expectedKey) {
    return res.status(503).json({
      error: 'DEV_BOOTSTRAP_KEY not set',
      hint: 'Add DEV_BOOTSTRAP_KEY to Railway development variables',
    });
  }

  if (key !== expectedKey) {
    return res.status(401).json({ error: 'Invalid bootstrap key' });
  }

  try {
    log.info('[Bootstrap] Creating dev accounts...');
    const PASS_HASH = await bcrypt.hash('admin123', 10);
    const created: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    // ── 1. Workspaces ────────────────────────────────────────────────────────
    const workspaces = [
      { id: 'platform-workspace-00000', name: 'CoAIleague Platform', owner: 'root-user-00000000', tier: 'enterprise' },
      { id: 'dev-acme-security-ws',     name: 'ACME Security Services', owner: 'dev-owner-001', tier: 'enterprise' },
      { id: 'dev-anvil-security-ws',    name: 'Anvil Security Group',   owner: 'dev-anvil-owner', tier: 'pro' },
      { id: 'dev-lonestar-security-ws', name: 'Lone Star Security Group', owner: 'dev-lonestar-owner', tier: 'pro' },
    ];

    for (const ws of workspaces) {
      await pool.query(
        `INSERT INTO workspaces (id, name, owner_id, subscription_tier, subscription_status,
         business_category, created_at, updated_at)
         VALUES ($1,$2,$3,$4,'active','security',NOW(),NOW())
         ON CONFLICT (id) DO NOTHING`,
        [ws.id, ws.name, ws.owner, ws.tier]
      ).catch(e => errors.push(`workspace ${ws.id}: ${e.message}`));
    }

    // ── 2. Users ─────────────────────────────────────────────────────────────
    const accounts = [
      { id: 'root-user-00000000',   email: 'root@coaileague.com',         first: 'Root',     last: 'Administrator', role: 'root_admin', wsId: 'platform-workspace-00000' },
      { id: 'dev-owner-001',        email: 'owner@acme-security.test',    first: 'Marcus',   last: 'Rivera',    role: 'user', wsId: 'dev-acme-security-ws' },
      { id: 'dev-manager-001',      email: 'manager@acme-security.test',  first: 'Sarah',    last: 'Chen',      role: 'user', wsId: 'dev-acme-security-ws' },
      { id: 'dev-manager-002',      email: 'ops@acme-security.test',      first: 'James',    last: 'Washington',role: 'user', wsId: 'dev-acme-security-ws' },
      { id: 'dev-emp-001',          email: 'garcia@acme-security.test',   first: 'Carlos',   last: 'Garcia',    role: 'user', wsId: 'dev-acme-security-ws' },
      { id: 'dev-emp-002',          email: 'johnson@acme-security.test',  first: 'Diana',    last: 'Johnson',   role: 'user', wsId: 'dev-acme-security-ws' },
      { id: 'dev-anvil-owner',      email: 'owner@anvil-security.test',   first: 'Brandon',  last: 'Steel',     role: 'user', wsId: 'dev-anvil-security-ws' },
      { id: 'dev-lonestar-owner',   email: 'owner@lonestar-security.test',first: 'Raymond',  last: 'Castillo',  role: 'user', wsId: 'dev-lonestar-security-ws' },
    ];

    for (const acc of accounts) {
      const existing = await pool.query(
        `SELECT id FROM users WHERE id = $1 OR email = $2 LIMIT 1`,
        [acc.id, acc.email]
      );
      if (existing.rows.length > 0) { skipped.push(acc.email); continue; }

      await pool.query(
        `INSERT INTO users (id, email, first_name, last_name, password_hash, role,
         email_verified, current_workspace_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,true,$7,NOW(),NOW())
         ON CONFLICT DO NOTHING`,
        [acc.id, acc.email, acc.first, acc.last, PASS_HASH, acc.role, acc.wsId]
      ).catch(e => errors.push(`user ${acc.email}: ${e.message}`));
      created.push(acc.email);

      // ── 3. Employee record for non-root accounts ───────────────────────────
      if (acc.role !== 'root_admin') {
        const wsRole = acc.id.includes('owner') ? 'org_owner'
          : acc.id.includes('manager') ? 'manager' : 'employee';
        await pool.query(
          `INSERT INTO employees (id, workspace_id, user_id, first_name, last_name, email,
           hourly_rate, workspace_role, status, is_active, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,'35.00',$7,'active',true,NOW(),NOW())
           ON CONFLICT DO NOTHING`,
          [`${acc.id}-emp`, acc.wsId, acc.id, acc.first, acc.last, acc.email, wsRole]
        ).catch(e => errors.push(`employee ${acc.email}: ${e.message}`));
      }

      // ── 4. Platform role for root ──────────────────────────────────────────
      if (acc.role === 'root_admin') {
        await pool.query(
          `INSERT INTO platform_roles (id, user_id, role, created_at, updated_at)
           VALUES (gen_random_uuid(),$1,'root_admin',NOW(),NOW())
           ON CONFLICT DO NOTHING`,
          [acc.id]
        ).catch(e => errors.push(`platform_role root: ${e.message}`));

        // Also insert workspace member record
        await pool.query(
          `INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at)
           VALUES (gen_random_uuid(),'platform-workspace-00000',$1,'org_owner',NOW())
           ON CONFLICT DO NOTHING`,
          [acc.id]
        ).catch(() => null);
      }
    }

    // ── 5. Workspace members for test orgs ────────────────────────────────────
    const memberMap = [
      { userId: 'dev-owner-001', wsId: 'dev-acme-security-ws', role: 'org_owner' },
      { userId: 'dev-manager-001', wsId: 'dev-acme-security-ws', role: 'manager' },
      { userId: 'dev-anvil-owner', wsId: 'dev-anvil-security-ws', role: 'org_owner' },
      { userId: 'dev-lonestar-owner', wsId: 'dev-lonestar-security-ws', role: 'org_owner' },
    ];
    for (const m of memberMap) {
      await pool.query(
        `INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at)
         VALUES (gen_random_uuid(),$1,$2,$3,NOW()) ON CONFLICT DO NOTHING`,
        [m.wsId, m.userId, m.role]
      ).catch(() => null);
    }

    log.info(`[Bootstrap] Done — created: ${created.length}, skipped: ${skipped.length}, errors: ${errors.length}`);

    return res.json({
      success: true,
      created,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      loginCredentials: {
        password: 'admin123',
        url: 'https://coaileague-development.up.railway.app',
        accounts: [
          { role: 'ACME Owner',        email: 'owner@acme-security.test' },
          { role: 'ACME Manager',      email: 'manager@acme-security.test' },
          { role: 'ACME Ops Manager',  email: 'ops@acme-security.test' },
          { role: 'ACME Officer',      email: 'garcia@acme-security.test' },
          { role: 'Anvil Owner',       email: 'owner@anvil-security.test' },
          { role: 'Lone Star Owner',   email: 'owner@lonestar-security.test' },
          { role: 'Root Admin',        email: 'root@coaileague.com' },
        ],
      },
      nextStep: 'Log in at the URL above with any account. Password: admin123',
    });
  } catch (error: unknown) {
    log.error('[Bootstrap] Failed:', error);
    return res.status(500).json({ error: 'Bootstrap failed', detail: sanitizeError(error) });
  }
});

router.get('/status', async (_req: Request, res: Response) => {
  if (isProduction()) return res.status(403).json({ error: 'Refused — production environment' });
  try {
    const [users, workspaces, employees, acmeOwner] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS n FROM users`),
      pool.query(`SELECT COUNT(*) AS n FROM workspaces`),
      pool.query(`SELECT COUNT(*) AS n FROM employees`),
      pool.query(`SELECT id FROM users WHERE email = 'owner@acme-security.test' LIMIT 1`),
    ]);
    return res.json({
      total_users: parseInt(users.rows[0].n),
      total_workspaces: parseInt(workspaces.rows[0].n),
      total_employees: parseInt(employees.rows[0].n),
      acme_owner_exists: acmeOwner.rows.length > 0,
      is_production: isProduction(),
      railway_environment: process.env.RAILWAY_ENVIRONMENT_NAME || 'not set',
      node_env: process.env.NODE_ENV,
      seeded: acmeOwner.rows.length > 0,
      action_needed: acmeOwner.rows.length === 0
        ? 'Run POST /api/bootstrap/dev-seed with X-Bootstrap-Key header'
        : 'Ready — log in with owner@acme-security.test / admin123',
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
});

export default router;
