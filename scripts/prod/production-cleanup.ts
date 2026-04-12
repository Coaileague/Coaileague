#!/usr/bin/env tsx
/**
 * scripts/prod/production-cleanup.ts
 *
 * PURPOSE: Remove ALL seeded/test/demo data from the production database.
 *
 * PRESERVES:
 *   1. Statewide Protective Services (GRANDFATHERED_TENANT_ID)
 *   2. CoAIleague Support workspace (PLATFORM_WORKSPACE_ID)
 *   3. System Automation workspace ("system")
 *
 * REMOVES:
 *   - All dev/test/demo/sandbox workspaces and their child data
 *   - Phantom users (dev-*, demo-*, tenant-*, txps-*, anvil-*)
 *   - Users with test email domains (*.test, *@acme*, *@frostbank*, etc.)
 *   - Test platform emails, SMS attempts, seed sentinels
 *   - Sandbox employees injected into protected workspaces
 *
 * SAFETY:
 *   - Runs in DRY-RUN mode by default (pass --confirm to execute)
 *   - Refuses to run if protected workspace has financial records
 *   - Every DELETE is wrapped in a savepoint for partial-failure tolerance
 *   - Pre/post verification logging with row counts
 *
 * Usage:
 *   npx tsx scripts/prod/production-cleanup.ts              # dry-run
 *   npx tsx scripts/prod/production-cleanup.ts --confirm    # execute
 */

import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('FATAL: DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const CONFIRM = process.argv.includes('--confirm');
const DIVIDER = '═'.repeat(70);

// ── Protected workspace IDs ─────────────────────────────────────────────────
const GRANDFATHERED_WS = process.env.GRANDFATHERED_TENANT_ID
  || process.env.STATEWIDE_WORKSPACE_ID
  || '37a04d24-51bd-4856-9faa-d26a2fe82094';

const GRANDFATHERED_OWNER = process.env.GRANDFATHERED_TENANT_OWNER_ID || '48003611';
const PLATFORM_WS = process.env.PLATFORM_WORKSPACE_ID || 'coaileague-platform-workspace';
const SYSTEM_WS = 'system';

const KEEP_WORKSPACES = [GRANDFATHERED_WS, PLATFORM_WS, SYSTEM_WS];

// Known system employee IDs in the platform workspace
const PLATFORM_EMPLOYEE_IDS = [
  '8d31a497-e9fe-48d9-b819-9c6869948c39', // root admin
  'helpai-employee',
  'trinity-employee',
];

// Phantom user ID patterns
const PHANTOM_ID_PATTERNS = `id LIKE 'dev-%' OR id LIKE 'tenant-%' OR id LIKE 'txps-%' OR id LIKE 'demo-%' OR id LIKE 'anvil-%' OR id = 'root-admin-workfos'`;

// Test email domain patterns
const TEST_EMAIL_PATTERNS = `email LIKE '%.test' OR email LIKE '%@acme%' OR email LIKE '%@frostbank%' OR email LIKE '%@anvilsecurity%' OR email LIKE '%@metroplex%'`;

// ── Helpers ─────────────────────────────────────────────────────────────────

async function query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

async function count(text: string, params?: unknown[]): Promise<number> {
  const rows = await query<{ cnt: string }>(text, params);
  return parseInt(rows[0]?.cnt || '0');
}

async function exec(text: string, params?: unknown[]): Promise<number> {
  if (!CONFIRM) return 0; // dry-run: don't execute mutations
  const result = await pool.query(text, params);
  return result.rowCount ?? 0;
}

/** Wraps a mutation in a savepoint so partial failures don't abort the whole cleanup. */
async function safeExec(label: string, text: string, params?: unknown[]): Promise<number> {
  if (!CONFIRM) {
    // Dry-run: show what would happen
    const countQuery = text.replace(/^DELETE FROM/, 'SELECT COUNT(*) AS cnt FROM');
    try {
      const cnt = await count(countQuery, params);
      if (cnt > 0) console.log(`  [DRY-RUN] ${label}: ${cnt} rows would be deleted`);
      return cnt;
    } catch {
      console.log(`  [DRY-RUN] ${label}: (count unavailable — table may not exist)`);
      return 0;
    }
  }

  const client = await pool.connect();
  try {
    await client.query('SAVEPOINT cleanup_sp');
    const result = await client.query(text, params);
    await client.query('RELEASE SAVEPOINT cleanup_sp');
    const deleted = result.rowCount ?? 0;
    if (deleted > 0) console.log(`  ${label}: ${deleted} rows deleted`);
    return deleted;
  } catch (err: any) {
    await client.query('ROLLBACK TO SAVEPOINT cleanup_sp').catch(() => {});
    if (err?.code !== '42P01') { // 42P01 = table does not exist — expected
      console.log(`  ${label}: FAILED (non-fatal) — ${err?.message}`);
    }
    return 0;
  } finally {
    client.release();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + DIVIDER);
  console.log(CONFIRM
    ? ' PRODUCTION DATA CLEANUP — LIVE EXECUTION'
    : ' PRODUCTION DATA CLEANUP — DRY-RUN (pass --confirm to execute)'
  );
  console.log(DIVIDER + '\n');

  console.log('Protected workspaces:');
  console.log(`  Grandfathered (Statewide): ${GRANDFATHERED_WS}`);
  console.log(`  Grandfathered owner:       ${GRANDFATHERED_OWNER}`);
  console.log(`  Platform (CoAIleague):     ${PLATFORM_WS}`);
  console.log(`  System Automation:         ${SYSTEM_WS}`);
  console.log();

  // ── Financial protection check ──────────────────────────────────────────
  const sentInvoices = await count(
    `SELECT COUNT(*) AS cnt FROM invoices WHERE status = 'sent' AND workspace_id = $1`,
    [GRANDFATHERED_WS]
  );
  const payrollCount = await count(
    `SELECT COUNT(*) AS cnt FROM payroll_entries WHERE workspace_id = $1`,
    [GRANDFATHERED_WS]
  );
  const ledgerCount = await count(
    `SELECT COUNT(*) AS cnt FROM org_ledger WHERE workspace_id = $1`,
    [GRANDFATHERED_WS]
  );

  if (sentInvoices > 0 || payrollCount > 0 || ledgerCount > 0) {
    console.error('[BLOCKED] Cannot run cleanup — financial records exist in protected workspace:');
    console.error(`  Sent invoices: ${sentInvoices}`);
    console.error(`  Payroll entries: ${payrollCount}`);
    console.error(`  Ledger entries: ${ledgerCount}`);
    console.error('  These records are PROTECTED from bulk deletion.');
    process.exit(1);
  }
  console.log('Financial protection check: PASSED (no financial records in protected ws)\n');

  // ── Pre-cleanup snapshot ────────────────────────────────────────────────
  const allWorkspaces = await query<{ id: string; name: string }>(
    'SELECT id, name FROM workspaces ORDER BY created_at'
  );
  const devWorkspaces = allWorkspaces.filter(ws => !KEEP_WORKSPACES.includes(ws.id));
  const totalUsers = await count('SELECT COUNT(*) AS cnt FROM users');
  const totalEmployees = await count('SELECT COUNT(*) AS cnt FROM employees');
  const phantomUsers = await count(`SELECT COUNT(*) AS cnt FROM users WHERE ${PHANTOM_ID_PATTERNS}`);
  const testEmailUsers = await count(`SELECT COUNT(*) AS cnt FROM users WHERE ${TEST_EMAIL_PATTERNS}`);

  // Discover all workspace-scoped tables dynamically
  const wsTableRows = await query<{ table_name: string }>(`
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.column_name = 'workspace_id'
      AND c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name != 'workspaces'
    ORDER BY c.table_name
  `);
  const workspaceScopedTables = wsTableRows.map(r => r.table_name);

  console.log('── Pre-cleanup snapshot ──────────────────────');
  console.log(`  Total workspaces:              ${allWorkspaces.length}`);
  for (const ws of allWorkspaces) {
    const marker = KEEP_WORKSPACES.includes(ws.id) ? 'KEEP' : 'DELETE';
    console.log(`    [${marker}] ${ws.id} — ${ws.name}`);
  }
  console.log(`  Total users:                   ${totalUsers}`);
  console.log(`  Total employees:               ${totalEmployees}`);
  console.log(`  Phantom users (dev/test IDs):  ${phantomUsers}`);
  console.log(`  Users with test emails:        ${testEmailUsers}`);
  console.log(`  Workspace-scoped tables found: ${workspaceScopedTables.length}`);
  console.log('──────────────────────────────────────────────\n');

  if (devWorkspaces.length === 0 && phantomUsers === 0 && testEmailUsers === 0) {
    console.log('Database is already clean — nothing to do.');
    return;
  }

  // ── Step 1: Remove contaminated workspaces ──────────────────────────────
  if (devWorkspaces.length > 0) {
    console.log(`Step 1: Removing ${devWorkspaces.length} contaminated workspace(s)...\n`);
    for (const ws of devWorkspaces) {
      console.log(`  Workspace: ${ws.id} (${ws.name})`);
      const escapedId = ws.id.replace(/'/g, "''");

      for (const table of workspaceScopedTables) {
        await safeExec(
          `    ${table}`,
          `DELETE FROM "${table}" WHERE workspace_id = '${escapedId}'`
        );
      }
      // workspace_members
      await safeExec(
        '    workspace_members',
        `DELETE FROM workspace_members WHERE workspace_id = '${escapedId}'`
      );
      // the workspace row itself
      await safeExec(
        '    workspaces',
        `DELETE FROM workspaces WHERE id = '${escapedId}'`
      );
      console.log();
    }
    console.log('Step 1: Complete\n');
  }

  // ── Step 2: Clean grandfathered workspace sandbox data ──────────────────
  console.log('Step 2: Cleaning grandfathered workspace of sandbox data...\n');
  // Employees: keep only the real owner
  await safeExec(
    '  sandbox employees',
    `DELETE FROM employees WHERE workspace_id = $1 AND user_id IS DISTINCT FROM $2`,
    [GRANDFATHERED_WS, GRANDFATHERED_OWNER]
  );
  // All other workspace-scoped tables
  for (const table of workspaceScopedTables) {
    if (table === 'employees') continue;
    await safeExec(
      `  ${table}`,
      `DELETE FROM "${table}" WHERE workspace_id = $1`,
      [GRANDFATHERED_WS]
    );
  }
  console.log('\nStep 2: Complete\n');

  // ── Step 3: Remove phantom users ────────────────────────────────────────
  console.log('Step 3: Removing phantom users...\n');
  await safeExec(
    '  platform_roles (phantom)',
    `DELETE FROM platform_roles WHERE user_id IN (SELECT id FROM users WHERE ${PHANTOM_ID_PATTERNS})`
  );
  await safeExec(
    '  workspace_members (phantom)',
    `DELETE FROM workspace_members WHERE user_id IN (SELECT id FROM users WHERE ${PHANTOM_ID_PATTERNS})`
  );
  await safeExec(
    '  employees (phantom)',
    `DELETE FROM employees WHERE user_id IN (SELECT id FROM users WHERE ${PHANTOM_ID_PATTERNS})`
  );
  await safeExec(
    '  users (phantom IDs)',
    `DELETE FROM users WHERE ${PHANTOM_ID_PATTERNS}`
  );
  // Also clean users with test email domains
  await safeExec(
    '  employees (test emails)',
    `DELETE FROM employees WHERE user_id IN (SELECT id FROM users WHERE ${TEST_EMAIL_PATTERNS})`
  );
  await safeExec(
    '  users (test emails)',
    `DELETE FROM users WHERE ${TEST_EMAIL_PATTERNS}`
  );
  console.log('\nStep 3: Complete\n');

  // ── Step 4: Clean platform workspace ────────────────────────────────────
  console.log('Step 4: Cleaning platform workspace of non-system employees...\n');
  const placeholders = PLATFORM_EMPLOYEE_IDS.map((_, i) => `$${i + 2}`).join(', ');
  await safeExec(
    '  platform employees',
    `DELETE FROM employees WHERE workspace_id = $1 AND id NOT IN (${placeholders})`,
    [PLATFORM_WS, ...PLATFORM_EMPLOYEE_IDS]
  );
  console.log('\nStep 4: Complete\n');

  // ── Step 5: Clean platform-level test data ──────────────────────────────
  console.log('Step 5: Cleaning platform-level test data...\n');
  await safeExec(
    '  platform_emails (test domains)',
    `DELETE FROM platform_emails WHERE to_addr LIKE '%.test' OR to_addr LIKE '%@frostbank%' OR to_addr LIKE '%@acme%' OR to_addr LIKE '%@anvilsecurity%' OR to_addr LIKE '%@metroplex%' OR from_addr LIKE '%.test' OR from_addr LIKE '%@frostbank%'`
  );
  await safeExec(
    '  sms_attempt_log (test numbers)',
    `DELETE FROM sms_attempt_log WHERE to_number LIKE '555-%' OR to_number LIKE '%555-0%'`
  );
  await safeExec(
    '  idempotency_keys (seed sentinels)',
    `DELETE FROM idempotency_keys WHERE key LIKE 'dev-%' OR key LIKE 'seed-%' OR key LIKE 'demo-%'`
  );
  console.log('\nStep 5: Complete\n');

  // ── Post-cleanup verification ───────────────────────────────────────────
  const postWorkspaces = await query<{ id: string; name: string }>(
    'SELECT id, name FROM workspaces ORDER BY created_at'
  );
  const postUsers = await count('SELECT COUNT(*) AS cnt FROM users');
  const postEmployees = await count('SELECT COUNT(*) AS cnt FROM employees');
  const postPhantoms = await count(`SELECT COUNT(*) AS cnt FROM users WHERE ${PHANTOM_ID_PATTERNS}`);
  const postTestEmails = await count(`SELECT COUNT(*) AS cnt FROM users WHERE ${TEST_EMAIL_PATTERNS}`);

  console.log(DIVIDER);
  console.log(CONFIRM ? ' CLEANUP COMPLETE' : ' DRY-RUN COMPLETE (no changes made)');
  console.log(DIVIDER);
  console.log('\n── Post-cleanup verification ─────────────────');
  console.log(`  Workspaces: ${postWorkspaces.length}`);
  for (const ws of postWorkspaces) {
    console.log(`    - ${ws.id} (${ws.name})`);
  }
  console.log(`  Total users:            ${postUsers}`);
  console.log(`  Total employees:        ${postEmployees}`);
  console.log(`  Phantom users:          ${postPhantoms}`);
  console.log(`  Test email users:       ${postTestEmails}`);
  console.log('──────────────────────────────────────────────\n');

  if (!CONFIRM) {
    console.log('To execute the cleanup, re-run with --confirm:');
    console.log('  npx tsx scripts/prod/production-cleanup.ts --confirm\n');
  }
}

main()
  .catch(err => { console.error('FATAL:', err); process.exit(1); })
  .finally(() => pool.end());
