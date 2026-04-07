/**
 * scripts/prod/get-statewide-ids.ts
 *
 * PURPOSE: Look up the Statewide workspace UUID and owner user ID from the
 *          production database, then print the exact env var lines to paste.
 *
 * READ-ONLY — no mutations. Safe to run at any time.
 *
 * Usage:
 *   npx tsx scripts/prod/get-statewide-ids.ts
 */

import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DIVIDER = '═'.repeat(60);

async function main() {
  console.log('\n' + DIVIDER);
  console.log(' GET STATEWIDE IDS');
  console.log(DIVIDER + '\n');

  const currentId = process.env.GRANDFATHERED_TENANT_ID;

  try {
    if (currentId) {
      // Env var already set — verify it and look up owner
      console.log(`ℹ️  GRANDFATHERED_TENANT_ID is already set: ${currentId}`);
      console.log('    Verifying workspace in database...\n');

      const wsResult = await pool.query(
        `SELECT id, name, company_name, email_slug, owner_id,
                billing_exempt, founder_exemption, subscription_tier, account_state
         FROM workspaces WHERE id = $1`,
        [currentId]
      );

      if (wsResult.rows.length === 0) {
        console.error('❌  WORKSPACE NOT FOUND in database for GRANDFATHERED_TENANT_ID=' + currentId);
        console.error('    This env var is pointing to a non-existent workspace.');
        process.exit(1);
      }

      const ws = wsResult.rows[0];
      console.log('✅  Workspace found:');
      console.log(`    ID:               ${ws.id}`);
      console.log(`    Name:             ${ws.name}`);
      console.log(`    Company:          ${ws.company_name || '(not set)'}`);
      console.log(`    Email slug:       ${ws.email_slug || '(not set)'}`);
      console.log(`    Tier:             ${ws.subscription_tier}`);
      console.log(`    Account state:    ${ws.account_state}`);
      console.log(`    billing_exempt:   ${ws.billing_exempt}`);
      console.log(`    founder_exemption:${ws.founder_exemption}`);

      if (!ws.billing_exempt && !ws.founder_exemption) {
        console.warn('\n⚠️   WARNING: This workspace has neither billing_exempt nor founder_exemption set.');
        console.warn('    The billing protection guard is present but this workspace is NOT exempt.');
        console.warn('    If this is Statewide, you need to set billing_exempt=true or founder_exemption=true in the DB.');
      }

      if (ws.owner_id) {
        const ownerResult = await pool.query(
          `SELECT id, email, first_name, last_name FROM users WHERE id = $1`,
          [ws.owner_id]
        );
        const owner = ownerResult.rows[0];
        if (owner) {
          console.log(`\n✅  Owner:`);
          console.log(`    ID:    ${owner.id}`);
          console.log(`    Email: ${owner.email}`);
          console.log(`    Name:  ${owner.first_name} ${owner.last_name}`);
          console.log('\n' + DIVIDER);
          console.log(' COPY-PASTE READY ENV VARS:');
          console.log(DIVIDER);
          console.log(`GRANDFATHERED_TENANT_ID=${ws.id}`);
          console.log(`GRANDFATHERED_TENANT_OWNER_ID=${owner.id}`);
        } else {
          console.warn(`⚠️   owner_id=${ws.owner_id} not found in users table`);
        }
      } else {
        console.warn('⚠️   Workspace has no owner_id set.');
      }

    } else {
      // Env var not set — list all workspaces so Bryan can identify Statewide
      console.log('ℹ️  GRANDFATHERED_TENANT_ID is not set in this environment.');
      console.log('    Listing all workspaces so you can identify Statewide:\n');

      const wsResult = await pool.query(
        `SELECT w.id, w.name, w.company_name, w.email_slug,
                w.billing_exempt, w.founder_exemption, w.subscription_tier,
                w.account_state, w.created_at,
                u.email AS owner_email, u.id AS owner_id,
                u.first_name, u.last_name
         FROM workspaces w
         LEFT JOIN users u ON u.id = w.owner_id
         ORDER BY w.created_at ASC`
      );

      if (wsResult.rows.length === 0) {
        console.log('    No workspaces found in database.');
        console.log('    → Create the Statewide workspace first, then re-run this script.\n');
        process.exit(0);
      }

      console.log(`Found ${wsResult.rows.length} workspace(s):\n`);
      wsResult.rows.forEach((ws, i) => {
        const exempt = ws.billing_exempt || ws.founder_exemption ? '⭐ EXEMPT' : '';
        console.log(`[${i + 1}] ${ws.name || '(unnamed)'} ${exempt}`);
        console.log(`    Workspace ID:  ${ws.id}`);
        console.log(`    Company:       ${ws.company_name || '(not set)'}`);
        console.log(`    Email slug:    ${ws.email_slug || '(not set)'}`);
        console.log(`    Owner email:   ${ws.owner_email || '(no owner)'}`);
        console.log(`    Owner ID:      ${ws.owner_id || '(none)'}`);
        console.log(`    Tier:          ${ws.subscription_tier} | State: ${ws.account_state}`);
        console.log(`    Created:       ${new Date(ws.created_at).toLocaleDateString()}`);
        console.log('');
      });

      console.log(DIVIDER);
      console.log(' ONCE YOU IDENTIFY STATEWIDE, SET THESE ENV VARS:');
      console.log(DIVIDER);
      console.log('GRANDFATHERED_TENANT_ID=<workspace id from above>');
      console.log('GRANDFATHERED_TENANT_OWNER_ID=<owner id from above>');
    }

  } finally {
    await pool.end();
  }

  console.log('\n' + DIVIDER + '\n');
}

main().catch(err => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
