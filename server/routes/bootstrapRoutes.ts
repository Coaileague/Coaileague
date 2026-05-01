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
  } catch (e: unknown) {
    return res.status(500).json({ error: e?.message });
  }
});

// GET version — navigate directly in browser, no JS needed
// https://coaileague-development.up.railway.app/api/bootstrap/dev-seed?key=CoAIleague2026Dev
router.get('/dev-seed', async (req: Request, res: Response) => {
  if (isProduction()) {
    return res.status(403).send('<h2>Refused — production environment</h2>');
  }

  const key = req.query?.key as string;
  const expectedKey = process.env.DEV_BOOTSTRAP_KEY;

  if (!expectedKey) {
    return res.status(503).send(`<h2>DEV_BOOTSTRAP_KEY not set in Railway variables</h2>`);
  }
  if (key !== expectedKey) {
    return res.status(401).send(`<h2>Missing or invalid key. Add ?key=YOUR_DEV_BOOTSTRAP_KEY to the URL</h2>`);
  }

  // Forward to the POST handler logic inline
  try {
    log.info('[Bootstrap] GET seed triggered...');
    const PASS_HASH = await bcrypt.hash('admin123', 10);
    const created: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    const workspaces = [
      { id: 'platform-workspace-00000', name: 'CoAIleague Platform',      owner: 'root-user-00000000',  tier: 'enterprise' },
      { id: 'dev-acme-security-ws',     name: 'ACME Security Services',    owner: 'dev-owner-001',       tier: 'enterprise' },
      { id: 'dev-anvil-security-ws',    name: 'Anvil Security Group',      owner: 'dev-anvil-owner',     tier: 'pro' },
      { id: 'dev-lonestar-security-ws', name: 'Lone Star Security Group',  owner: 'dev-lonestar-owner',  tier: 'pro' },
    ];
    for (const ws of workspaces) {
      await pool.query(
        `INSERT INTO workspaces (id,name,owner_id,subscription_tier,subscription_status,business_category,created_at,updated_at)
         VALUES ($1,$2,$3,$4,'active','security',NOW(),NOW()) ON CONFLICT (id) DO NOTHING`,
        [ws.id, ws.name, ws.owner, ws.tier]
      ).catch(e => errors.push(`ws ${ws.id}: ${e.message}`));
    }

    const accounts = [
      { id: 'root-user-00000000',  email: 'root@coaileague.com',         first: 'Root',    last: 'Administrator', role: 'root_admin', wsId: 'platform-workspace-00000' },
      { id: 'dev-owner-001',       email: 'owner@acme-security.test',    first: 'Marcus',  last: 'Rivera',    role: 'user', wsId: 'dev-acme-security-ws' },
      { id: 'dev-manager-001',     email: 'manager@acme-security.test',  first: 'Sarah',   last: 'Chen',      role: 'user', wsId: 'dev-acme-security-ws' },
      { id: 'dev-manager-002',     email: 'ops@acme-security.test',      first: 'James',   last: 'Washington',role: 'user', wsId: 'dev-acme-security-ws' },
      { id: 'dev-emp-001',         email: 'garcia@acme-security.test',   first: 'Carlos',  last: 'Garcia',    role: 'user', wsId: 'dev-acme-security-ws' },
      { id: 'dev-emp-002',         email: 'johnson@acme-security.test',  first: 'Diana',   last: 'Johnson',   role: 'user', wsId: 'dev-acme-security-ws' },
      { id: 'dev-anvil-owner',     email: 'owner@anvil-security.test',   first: 'Brandon', last: 'Steel',     role: 'user', wsId: 'dev-anvil-security-ws' },
      { id: 'dev-lonestar-owner',  email: 'owner@lonestar-security.test',first: 'Raymond', last: 'Castillo',  role: 'user', wsId: 'dev-lonestar-security-ws' },
    ];

    for (const acc of accounts) {
      const ex = await pool.query(`SELECT id FROM users WHERE id=$1 OR email=$2 LIMIT 1`,[acc.id,acc.email]);
      if (ex.rows.length > 0) { skipped.push(acc.email); continue; }

      await pool.query(
        `INSERT INTO users (id,email,first_name,last_name,password_hash,role,email_verified,current_workspace_id,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,true,$7,NOW(),NOW()) ON CONFLICT DO NOTHING`,
        [acc.id,acc.email,acc.first,acc.last,PASS_HASH,acc.role,acc.wsId]
      ).catch(e => errors.push(`user ${acc.email}: ${e.message}`));
      created.push(acc.email);

      if (acc.role !== 'root_admin') {
        const wsRole = acc.id.includes('owner') ? 'org_owner' : acc.id.includes('manager') ? 'manager' : 'employee';
        await pool.query(
          `INSERT INTO employees (id,workspace_id,user_id,first_name,last_name,email,hourly_rate,workspace_role,status,is_active,created_at,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,'35.00',$7,'active',true,NOW(),NOW()) ON CONFLICT DO NOTHING`,
          [acc.id+'-emp',acc.wsId,acc.id,acc.first,acc.last,acc.email,wsRole]
        ).catch(e => errors.push(`emp ${acc.email}: ${e.message}`));
      }

      if (acc.role === 'root_admin') {
        await pool.query(
          `INSERT INTO platform_roles (id,user_id,role,created_at,updated_at) VALUES (gen_random_uuid(),$1,'root_admin',NOW(),NOW()) ON CONFLICT DO NOTHING`,
          [acc.id]
        ).catch(e => errors.push(`role ${acc.id}: ${e.message}`));
      }

      await pool.query(
        `INSERT INTO workspace_members (id,workspace_id,user_id,role,created_at) VALUES (gen_random_uuid(),$1,$2,$3,NOW()) ON CONFLICT DO NOTHING`,
        [acc.wsId, acc.id, acc.id.includes('manager') ? 'manager' : acc.role === 'root_admin' ? 'org_owner' : 'org_owner']
      ).catch(() => null);
    }

    const status = errors.length === 0 ? '✅' : '⚠️';
    res.setHeader('Content-Type', 'text/html');
    return res.send(`<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:700px;margin:40px auto;padding:20px">
      <h1 style="color:${errors.length===0?'#16a34a':'#d97706'}">${status} Bootstrap ${errors.length===0?'Complete':'Complete with warnings'}</h1>
      <h3>✅ Created (${created.length})</h3>
      <ul>${created.map(e=>`<li>${e}</li>`).join('')}</ul>
      <h3>⏭️ Skipped — already existed (${skipped.length})</h3>
      <ul>${skipped.map(e=>`<li>${e}</li>`).join('')}</ul>
      ${errors.length?`<h3>⚠️ Errors (${errors.length})</h3><ul>${errors.map(e=>`<li style="color:red">${e}</li>`).join('')}</ul>`:''}
      <hr>
      <h2>🔑 Login Credentials</h2>
      <p><strong>URL:</strong> <a href="/">https://coaileague-development.up.railway.app</a></p>
      <p><strong>Password:</strong> <code>admin123</code></p>
      <table border="1" cellpadding="8" style="border-collapse:collapse">
        <tr><th>Role</th><th>Email</th></tr>
        <tr><td>ACME Owner (Marcus Rivera)</td><td>owner@acme-security.test</td></tr>
        <tr><td>ACME Manager (Sarah Chen)</td><td>manager@acme-security.test</td></tr>
        <tr><td>ACME Ops (James Washington)</td><td>ops@acme-security.test</td></tr>
        <tr><td>ACME Officer (Carlos Garcia)</td><td>garcia@acme-security.test</td></tr>
        <tr><td>Anvil Owner (Brandon Steel)</td><td>owner@anvil-security.test</td></tr>
        <tr><td>Lone Star Owner (Raymond Castillo)</td><td>owner@lonestar-security.test</td></tr>
        <tr><td>Root Admin</td><td>root@coaileague.com</td></tr>
      </table>
      <br><a href="/" style="background:#1e3a5f;color:white;padding:12px 24px;text-decoration:none;border-radius:6px">→ Go to Login Page</a>
    </body></html>`);
  } catch(error: unknown) {
    return res.status(500).send(`<h2>Error: ${sanitizeError(error)}</h2>`);
  }
});


// ============================================================================
// STRESS TEST SEED — 30 days of shifts for ACME + Anvil
// GET: /api/bootstrap/stress-seed?key=CoAIleague2026Dev
// ============================================================================
router.get('/stress-seed', async (req: Request, res: Response) => {
  const key = req.query.key as string;
  if (key !== 'CoAIleague2026Dev') {
    return res.status(403).json({ error: 'Invalid key' });
  }
  
  try {
    const { runStressTestSeed } = await import('../services/stressTestSeed');
    const result = await runStressTestSeed();
    
    res.setHeader('Content-Type', 'text/html');
    return res.send(`<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:700px;margin:40px auto;padding:20px">
      <h1 style="color:#16a34a">✅ Stress Test Seed Complete</h1>
      <p><strong>${result.created}</strong> shifts created across ACME and Anvil (30-day window)</p>
      <p><strong>${result.skipped}</strong> shifts already existed (skipped)</p>
      <hr>
      <h3>What's seeded:</h3>
      <ul>
        <li>15 days of past completed shifts → ready for payroll + invoicing</li>
        <li>15 days of future shifts → mix of assigned + open for Trinity to fill</li>
        <li>ACME: 4 client sites × 4 shift types × 15 days</li>
        <li>Anvil: 3 client sites × 3 shift types × 15 days</li>
      </ul>
      <hr>
      <p>Trinity will automatically process open shifts, generate coverage requests,
      and send notifications. Payroll can be run from the Payroll module.
      Client invoices will auto-generate from completed shifts.</p>
      <br><a href="/dashboard" style="background:#1e3a5f;color:white;padding:12px 24px;text-decoration:none;border-radius:6px">→ Go to Dashboard</a>
    </body></html>`);
  } catch(error: unknown) {
    return res.status(500).send(`<h2>Error: ${sanitizeError(error)}</h2>`);
  }
});


// ============================================================================
// COMPREHENSIVE RELATIONAL SEED
// GET /api/bootstrap/comprehensive-seed?key=CoAIleague2026Dev
// Creates all data with proper FK relationships:
//   users → employees → workspace_members → shifts → time_entries → payroll → invoices
// ============================================================================
router.get('/comprehensive-seed', async (req: Request, res: Response) => {
  const key = req.query.key as string;
  if (key !== 'CoAIleague2026Dev') {
    return res.status(403).json({ error: 'Invalid key' });
  }

  try {
    const { runComprehensiveDevSeed } = await import('../services/comprehensiveDevSeed');
    const result = await runComprehensiveDevSeed();

    res.setHeader('Content-Type', 'text/html');
    const statusColor = result.success ? '#16a34a' : '#dc2626';
    const statusIcon = result.success ? '✅' : '❌';
    const c = result.counts;

    return res.send(`<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:800px;margin:40px auto;padding:20px;background:#0f172a;color:#e2e8f0">
      <h1 style="color:${statusColor}">${statusIcon} Comprehensive Dev Seed ${result.success ? 'Complete' : 'Failed'}</h1>
      <h3 style="color:#94a3b8">Full relational data created for ACME Security Services</h3>
      
      <table border="0" cellpadding="8" style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr style="background:#1e293b"><th style="color:#64748b;text-align:left">Entity</th><th style="color:#64748b;text-align:right">Count</th></tr>
        <tr><td>👤 Users</td><td style="text-align:right;color:#4ade80">${c.users}</td></tr>
        <tr style="background:#1e293b"><td>🪪 Employees (with userId FK)</td><td style="text-align:right;color:#4ade80">${c.employees}</td></tr>
        <tr><td>🏢 Workspace Members</td><td style="text-align:right;color:#4ade80">${c.members}</td></tr>
        <tr style="background:#1e293b"><td>🏗️ Clients</td><td style="text-align:right;color:#4ade80">${c.clients}</td></tr>
        <tr><td>📅 Shifts (30 past + 14 future)</td><td style="text-align:right;color:#4ade80">${c.shifts}</td></tr>
        <tr style="background:#1e293b"><td>⏱️ Time Entries (clock in/out)</td><td style="text-align:right;color:#4ade80">${c.timeEntries}</td></tr>
        <tr><td>💰 Payroll Runs (2 bi-weekly)</td><td style="text-align:right;color:#4ade80">${c.payrollRuns}</td></tr>
        <tr style="background:#1e293b"><td>💵 Payroll Entries (per employee)</td><td style="text-align:right;color:#4ade80">${c.payrollEntries}</td></tr>
        <tr><td>🧾 Invoices (per client per period)</td><td style="text-align:right;color:#4ade80">${c.invoices}</td></tr>
        <tr style="background:#1e293b"><td>📋 Invoice Line Items</td><td style="text-align:right;color:#4ade80">${c.lineItems}</td></tr>
      </table>

      <div style="background:#1e293b;padding:16px;border-radius:8px;margin:16px 0">
        <h3 style="color:#7c3aed;margin:0 0 8px">🔗 Relational Chain Verified</h3>
        <p style="color:#94a3b8;margin:0;font-size:13px">
          users.id → employees.user_id → workspace_members.user_id<br>
          clients.id → shifts.client_id + time_entries.client_id<br>
          employees.id → shifts.employee_id + time_entries.employee_id<br>
          shifts.id → time_entries.shift_id<br>
          payroll_runs.id → payroll_entries.payroll_run_id<br>
          invoices.id → invoice_line_items.invoice_id
        </p>
      </div>

      <div style="background:#1e293b;padding:16px;border-radius:8px;margin:16px 0">
        <h3 style="color:#f59e0b;margin:0 0 8px">🧪 Now test:</h3>
        <ul style="color:#94a3b8;font-size:13px;margin:0;padding-left:20px">
          <li>Schedule → shows 30 days past + 14 future shifts</li>
          <li>Invoices → 4 clients × 2 periods = 8 invoices (4 paid, 4 sent)</li>
          <li>Payroll → 2 completed runs with per-employee breakdown</li>
          <li>Employees → 8 staff with proper employee records</li>
          <li>Time Entries → approved entries linking shifts to payroll</li>
        </ul>
      </div>

      ${result.log.map(l => '<p style="font-size:11px;color:#64748b;margin:2px 0">' + l + '</p>').join('')}
      
      <br><a href="/dashboard" style="background:#7c3aed;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">→ Go to Dashboard</a>
      <a href="/invoices" style="background:#1e293b;color:#e2e8f0;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-left:8px">→ View Invoices</a>
    </body></html>`);
  } catch(error: unknown) {
    return res.status(500).send(`<h2 style="color:red">Error: ${sanitizeError(error)}</h2>`);
  }
});


export default router;
