/**
 * scripts/prod/bootstrap-statewide-workspace.ts
 *
 * PURPOSE: Idempotently create (or repair) the Statewide Protective Services
 *          production workspace and its owner account so Bryan can log in.
 *
 * Safe to run multiple times — every statement is ON CONFLICT DO NOTHING /
 * DO UPDATE so no duplicate rows are ever created.
 *
 * What it creates / fixes:
 *   1. Workspace  — enterprise/active/billing_exempt=TRUE/founder_exemption=TRUE
 *   2. Owner user — txpsinvestigations@gmail.com, email_verified=TRUE,
 *                   login_attempts=0, locked_until=NULL
 *   3. Workspace member row (org_owner role)
 *   4. Employee record
 *
 * IDs are read from env vars first; the script prints the env var lines to
 * copy-paste into Railway / Replit so that GRANDFATHERED_TENANT_ID is set.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx scripts/prod/bootstrap-statewide-workspace.ts
 *
 * Optionally override the IDs:
 *   GRANDFATHERED_TENANT_ID=<uuid> \
 *   GRANDFATHERED_TENANT_OWNER_ID=<id> \
 *   DATABASE_URL=... npx tsx scripts/prod/bootstrap-statewide-workspace.ts
 */

import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const DIVIDER = '═'.repeat(60);

// Canonical production IDs — established in production-migration.sql.
// These are the real values for the Statewide Protective Services org.
const DEFAULT_WS_ID   = '37a04d24-51bd-4856-9faa-d26a2fe82094';
const DEFAULT_USER_ID = '48003611';
const DEFAULT_EMP_ID  = '3fd50980-85f8-4f18-8b7a-5906ba8ccfe0';

const WS_ID   = process.env.GRANDFATHERED_TENANT_ID      || DEFAULT_WS_ID;
const USER_ID = process.env.GRANDFATHERED_TENANT_OWNER_ID || DEFAULT_USER_ID;
const EMP_ID  = DEFAULT_EMP_ID;
const EMAIL   = 'txpsinvestigations@gmail.com';

// The known bcrypt hash for this account (from production-migration.sql).
// Only inserted when creating a brand-new row — never overwrites an existing
// password so Bryan's current password is preserved on re-runs.
const PW_HASH = '$2b$10$r3GT8OdoCwxosnHVWfQmFeMRnvv1BOhJIKA5BjWQ3g2eG3LQ4ko0K';

async function main(): Promise<void> {
  console.log('\n' + DIVIDER);
  console.log(' STATEWIDE PROTECTIVE SERVICES — PRODUCTION BOOTSTRAP');
  console.log(DIVIDER + '\n');
  console.log(`Workspace ID : ${WS_ID}`);
  console.log(`Owner ID     : ${USER_ID}`);
  console.log(`Owner email  : ${EMAIL}`);
  console.log('');

  try {
    // ── 1. Workspace ─────────────────────────────────────────────────────────
    console.log('[1/4] Upserting workspace...');
    const wsResult = await pool.query(`
      INSERT INTO workspaces (
        id, name, owner_id,
        subscription_tier, subscription_status,
        billing_exempt, founder_exemption,
        created_at, updated_at
      )
      VALUES (
        $1, 'Statewide Protective Services', $2,
        'enterprise', 'active',
        TRUE, TRUE,
        NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE
        SET subscription_tier   = 'enterprise',
            subscription_status = 'active',
            billing_exempt      = TRUE,
            founder_exemption   = TRUE,
            trial_ends_at       = NULL,
            updated_at          = NOW()
      RETURNING id, name, subscription_tier, subscription_status,
                billing_exempt, founder_exemption
    `, [WS_ID, USER_ID]);

    const ws = wsResult.rows[0];
    console.log(`  ✅ Workspace: "${ws.name}" | tier=${ws.subscription_tier} | status=${ws.subscription_status}`);
    console.log(`     billing_exempt=${ws.billing_exempt} | founder_exemption=${ws.founder_exemption}`);

    // ── 2. Owner user ─────────────────────────────────────────────────────────
    console.log('\n[2/4] Upserting owner user...');
    const userResult = await pool.query(`
      INSERT INTO users (
        id, email, first_name, last_name, role,
        password_hash, email_verified, current_workspace_id,
        login_attempts, mfa_enabled,
        created_at, updated_at
      )
      VALUES (
        $1, $2, 'Brigido', 'Guillen', 'user',
        $3, TRUE, $4,
        0, FALSE,
        NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE
        SET email_verified       = TRUE,
            login_attempts       = 0,
            locked_until         = NULL,
            current_workspace_id = $4,
            updated_at           = NOW()
      RETURNING id, email, email_verified, login_attempts, locked_until
    `, [USER_ID, EMAIL, PW_HASH, WS_ID]);

    const u = userResult.rows[0];
    console.log(`  ✅ User: ${u.email} | email_verified=${u.email_verified} | login_attempts=${u.login_attempts}`);
    if (u.locked_until) {
      console.log(`  ⚠️  locked_until was ${u.locked_until} — now cleared`);
    }

    // ── 3. Workspace member ───────────────────────────────────────────────────
    console.log('\n[3/4] Ensuring workspace_member row...');
    // Try the unique constraint path first; fall back to a SELECT guard if the
    // table has a different constraint name or if the user already has a member
    // row with a different workspace.
    const memResult = await pool.query(`
      INSERT INTO workspace_members (user_id, workspace_id, role, status, joined_at, created_at, updated_at)
      SELECT $1, $2, 'org_owner', 'active', NOW(), NOW(), NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM workspace_members
        WHERE user_id = $1 AND workspace_id = $2
      )
      RETURNING id
    `, [USER_ID, WS_ID]);

    if (memResult.rowCount && memResult.rowCount > 0) {
      console.log(`  ✅ Workspace member row created (org_owner)`);
    } else {
      console.log(`  ✅ Workspace member row already exists`);
    }

    // ── 4. Employee record ────────────────────────────────────────────────────
    console.log('\n[4/4] Ensuring employee record...');
    const empResult = await pool.query(`
      INSERT INTO employees (
        id, user_id, workspace_id,
        first_name, last_name, email,
        role, workspace_role, employee_number,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3,
        'Brigido', 'Guillen', $4,
        'Owner', 'org_owner', 'EMP-SPS-00001',
        NOW(), NOW()
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `, [EMP_ID, USER_ID, WS_ID, EMAIL]);

    if (empResult.rowCount && empResult.rowCount > 0) {
      console.log(`  ✅ Employee record created`);
    } else {
      console.log(`  ✅ Employee record already exists`);
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log('\n' + DIVIDER);
    console.log(' BOOTSTRAP COMPLETE');
    console.log(DIVIDER);
    console.log('\n✅ Statewide Protective Services is ready.\n');
    console.log('Login credentials:');
    console.log(`  Email    : ${EMAIL}`);
    console.log('  Password : use the current password (unchanged) or reset via /forgot-password');
    console.log('');
    console.log('Copy-paste these env vars into Railway / Replit:');
    console.log(`GRANDFATHERED_TENANT_ID=${WS_ID}`);
    console.log(`GRANDFATHERED_TENANT_OWNER_ID=${USER_ID}`);
    console.log('');

  } finally {
    await pool.end();
  }

  console.log(DIVIDER + '\n');
}

main().catch(err => {
  console.error('\n❌ Bootstrap failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
