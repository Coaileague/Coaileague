/**
 * Dev account seeder — creates the two primary dev/test accounts for
 * the CoAIleague platform:
 *
 *   1. Statewide Dev Sandbox (saraybebo@gmail.com / org_owner)
 *   2. CoAIleague Support Org (root@coaileague.com / root_admin + org_owner)
 *
 * Idempotent: skips any account whose email already exists in the DB.
 *
 * Usage (standalone):
 *   DATABASE_URL='postgresql://...' npx tsx create-dev-accounts.ts
 *
 * Also callable from the /api/admin/dev-execute endpoint.
 *
 * SECURITY: Never hardcode the connection string — always pass via env.
 */

import { pool } from './server/db';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const DEV_PASSWORD = 'SPS2024!';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Logger = (...args: unknown[]) => void;

async function userExists(email: string): Promise<{ id: string; currentWorkspaceId: string | null } | null> {
  const result = await pool.query<{ id: string; current_workspace_id: string | null }>(
    `SELECT id, current_workspace_id FROM users WHERE email = $1 LIMIT 1`,
    [email]
  );
  if (result.rows[0]) {
    return { id: result.rows[0].id, currentWorkspaceId: result.rows[0].current_workspace_id };
  }
  return null;
}

// ─── Account creators ────────────────────────────────────────────────────────

async function createStatewideDevAccount(passwordHash: string, log: Logger = console.log): Promise<void> {
  log('1️⃣  Creating Statewide Dev Sandbox Account...');

  const existing = await userExists('saraybebo@gmail.com');
  if (existing) {
    log('   ⚠️  User saraybebo@gmail.com already exists — skipping.');
    log(`   User ID: ${existing.id}`);
    log(`   Workspace ID: ${existing.currentWorkspaceId ?? '(none)'}`);
    return;
  }

  const userId = `user-statewide-dev-${randomUUID()}`;
  const workspaceId = `statewide-dev-sandbox-${randomUUID()}`;

  await pool.query(
    `INSERT INTO users (
       id, email, first_name, last_name, role,
       password_hash, email_verified, current_workspace_id,
       created_at, updated_at
     ) VALUES ($1,$2,$3,$4,'user',$5,true,$6,NOW(),NOW())
     ON CONFLICT (email) DO NOTHING`,
    [userId, 'saraybebo@gmail.com', 'Saray', 'Bebo', passwordHash, workspaceId]
  );

  await pool.query(
    `INSERT INTO workspaces (
       id, name, owner_id, company_name,
       timezone, subscription_tier, subscription_status,
       business_category,
       max_employees, max_clients,
       created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
     ON CONFLICT (id) DO NOTHING`,
    [
      workspaceId,
      'Statewide Protective Services - Dev Sandbox',
      userId,
      'Statewide Protective Services',
      'America/Chicago',
      'enterprise',
      'active',
      'security',
      500,
      100,
    ]
  );

  await pool.query(
    `INSERT INTO workspace_members (id, user_id, workspace_id, role, status, joined_at, created_at, updated_at)
     VALUES ($1,$2,$3,'org_owner','active',NOW(),NOW(),NOW())
     ON CONFLICT DO NOTHING`,
    [randomUUID(), userId, workspaceId]
  );

  log('✅ Statewide Dev Account Created:');
  log('   Email: saraybebo@gmail.com');
  log(`   Password: ${DEV_PASSWORD}`);
  log('   Workspace: Statewide Protective Services - Dev Sandbox');
  log('   Role: org_owner');
  log(`   User ID: ${userId}`);
  log(`   Workspace ID: ${workspaceId}`);
}

async function createCoAIleagueSupportAccount(passwordHash: string, log: Logger = console.log): Promise<void> {
  log('2️⃣  Creating CoAIleague Support Org Account...');

  const existing = await userExists('root@coaileague.com');
  if (existing) {
    log('   ⚠️  User root@coaileague.com already exists — skipping.');
    log(`   User ID: ${existing.id}`);
    log(`   Workspace ID: ${existing.currentWorkspaceId ?? '(none)'}`);
    return;
  }

  const userId = `user-root-support-${randomUUID()}`;
  const workspaceId = `coaileague-support-org-${randomUUID()}`;

  await pool.query(
    `INSERT INTO users (
       id, email, first_name, last_name, role,
       password_hash, email_verified, current_workspace_id,
       created_at, updated_at
     ) VALUES ($1,$2,$3,$4,'user',$5,true,$6,NOW(),NOW())
     ON CONFLICT (email) DO NOTHING`,
    [userId, 'root@coaileague.com', 'CoAIleague', 'Root', passwordHash, workspaceId]
  );

  await pool.query(
    `INSERT INTO workspaces (
       id, name, owner_id, company_name,
       timezone, subscription_tier, subscription_status,
       workspace_type, is_platform_support,
       max_employees, max_clients,
       created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
     ON CONFLICT (id) DO NOTHING`,
    [
      workspaceId,
      'CoAIleague Support Organization',
      userId,
      'CoAIleague',
      'UTC',
      'enterprise',
      'active',
      'platform_support',
      true,
      9999,
      9999,
    ]
  );

  await pool.query(
    `INSERT INTO workspace_members (id, user_id, workspace_id, role, status, joined_at, created_at, updated_at)
     VALUES ($1,$2,$3,'org_owner','active',NOW(),NOW(),NOW())
     ON CONFLICT DO NOTHING`,
    [randomUUID(), userId, workspaceId]
  );

  // Grant root_admin platform role
  await pool.query(
    `INSERT INTO platform_roles (user_id, role, granted_reason, created_at, updated_at)
     VALUES ($1,'root_admin','Created via dev-account seeder',NOW(),NOW())
     ON CONFLICT ON CONSTRAINT unique_user_platform_role DO NOTHING`,
    [userId]
  );

  log('✅ CoAIleague Support Org Account Created:');
  log('   Email: root@coaileague.com');
  log(`   Password: ${DEV_PASSWORD}`);
  log('   Workspace: CoAIleague Support Organization (org_type=support)');
  log('   Platform Role: root_admin');
  log('   Workspace Role: org_owner');
  log(`   User ID: ${userId}`);
  log(`   Workspace ID: ${workspaceId}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function createDevAccounts(log: Logger = console.log): Promise<void> {
  log('🚀 Creating dev accounts...\n');

  // Hash once and reuse for both accounts — intentional dev-only shortcut.
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  await createStatewideDevAccount(passwordHash, log);
  log('');
  await createCoAIleagueSupportAccount(passwordHash, log);

  log('');
  log('═══════════════════════════════════════════════════════');
  log('✅ ALL DEV ACCOUNTS CREATED SUCCESSFULLY');
  log('═══════════════════════════════════════════════════════');
}

// Run directly when invoked with `npx tsx create-dev-accounts.ts`
if (process.argv[1]?.endsWith('create-dev-accounts.ts')) {
  createDevAccounts()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('❌ Failed to create dev accounts:', e);
      process.exit(1);
    });
}
