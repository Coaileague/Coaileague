#!/usr/bin/env tsx
/**
 * OMEGA CANARY CLEANUP DRY-RUN
 * Generates cleanup plan for ACME after GO.
 * NEVER executes without Bryan approval.
 * Always dry-run — no mutations.
 * Run: tsx scripts/omega/canary-cleanup-dryrun.ts
 */



const SPS_ID = process.env.STATEWIDE_WORKSPACE_ID || '37a04d24-51bd-4856-9faa-d26a2fe82094';

async function run() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log(' OMEGA CANARY CLEANUP — DRY-RUN ONLY');
  console.log(' NEVER executes without Bryan approval');
  console.log('═══════════════════════════════════════════════════\n');

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
    console.log('ACME workspace not found — nothing to clean up.');
    process.exit(0);
  }

  console.log(`ACME workspace: ${acme.name} (${acme.id})\n`);
  console.log('CLEANUP PLAN (DRY-RUN — not executed):\n');

  const tables = [
    'scheduling_shifts',
    'invoices',
    'invoice_line_items',
    'payroll_periods',
    'payroll_entries',
    'call_off_records',
    'workspace_notifications',
    'emails',
  ];

  for (const table of tables) {
    try {
      const countRows = await db.execute(
        sql.raw(`SELECT COUNT(*) as cnt FROM ${table} WHERE workspace_id = '${acme.id}'`)
      );
      const cnt = (countRows.rows || countRows)[0] as any;
      console.log(`  📋 DELETE FROM ${table} WHERE workspace_id = '${acme.id}' — ${cnt?.cnt || 0} rows would be deleted`);
    } catch {
      console.log(`  📋 DELETE FROM ${table} WHERE workspace_id = '${acme.id}' — (count unavailable)`);
    }
  }

  console.log('\n⚠ TO EXECUTE: Run reset-acme.ts --confirm after Bryan approval.');
  console.log('⚠ Statewide (SPS) is NEVER touched.\n');
}

run().catch(err => { console.error(err); process.exit(1); });
