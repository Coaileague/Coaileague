#!/usr/bin/env tsx
/**
 * OMEGA RESET-ACME
 * Wipes ACME Security workspace to clean baseline.
 * Requires --confirm flag. NEVER touches Statewide.
 * Run: tsx scripts/omega/reset-acme.ts --confirm [--dry-run]
 */



const CONFIRMED = process.argv.includes('--confirm');
const DRY_RUN = process.argv.includes('--dry-run');
const SPS_ID = process.env.STATEWIDE_WORKSPACE_ID || '37a04d24-51bd-4856-9faa-d26a2fe82094';

async function run() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log(' OMEGA RESET-ACME');
  console.log(` Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
  console.log('═══════════════════════════════════════════════════\n');

  if (!CONFIRMED) {
    console.error('❌ --confirm flag required. This destructive operation wipes ACME workspace data.');
    console.error('   Usage: tsx scripts/omega/reset-acme.ts --confirm [--dry-run]');
    process.exit(1);
  }

  console.log('Finding ACME workspace...');
  let db: any;
  try {
    const dbModule = await import('../../server/db');
    db = dbModule.db;
  } catch (err: any) {
    console.error('Cannot connect to DB:', err.message);
    process.exit(1);
  }

  const { sql } = await import('drizzle-orm');

  // Find ACME workspace
  const rows = await db.execute(sql`
    SELECT id, name, slug FROM workspaces 
    WHERE (slug ILIKE 'acme%' OR name ILIKE 'ACME%') 
    AND id != ${SPS_ID}
    LIMIT 1
  `);
  const acme = (rows.rows || rows)[0] as any;

  if (!acme) {
    console.error('❌ ACME workspace not found. Cannot proceed.');
    process.exit(1);
  }

  const ACME_ID = acme.id;
  console.log(`✅ Found ACME: ${acme.name} (${ACME_ID})\n`);

  // Safety: Double-check we are NOT touching Statewide
  if (ACME_ID === SPS_ID) {
    console.error('🚨 ABORT: ACME ID matches SPS_ID. This would destroy Statewide. Exiting.');
    process.exit(1);
  }

  const tables = [
    'universal_audit_log',
    'scheduling_shifts',
    'invoices',
    'invoice_line_items',
    'payroll_periods',
    'payroll_entries',
    'call_off_records',
    'workspace_notifications',
    'emails',
  ];

  console.log(`Tables to clear for workspace ${ACME_ID}:\n${tables.map(t => `  - ${t}`).join('\n')}\n`);

  if (DRY_RUN) {
    console.log('DRY-RUN: No data deleted. Remove --dry-run to execute.');
    process.exit(0);
  }

  for (const table of tables) {
    try {
      const result = await db.execute(
        sql.raw(`DELETE FROM ${table} WHERE workspace_id = '${ACME_ID}'`)
      );
      console.log(`✅ Cleared ${table}: ${result.rowCount ?? 'ok'} rows`);
    } catch (err: any) {
      console.warn(`⚠ Could not clear ${table}: ${err.message}`);
    }
  }

  console.log('\n✅ ACME workspace reset complete. Statewide untouched.\n');
}

run().catch(err => {
  console.error('Uncaught error:', err);
  process.exit(1);
});
