/**
 * scripts/prod/generate-db-role-sql.ts
 *
 * PURPOSE: Generate safe SQL to create the app_db_user role with limited
 *          privileges — specifically REVOKE UPDATE/DELETE on audit/financial
 *          tables to enforce physical immutability at the DB level.
 *
 * READ-ONLY (except writing the output SQL file). Does NOT execute anything.
 *
 * Usage:
 *   npx tsx scripts/prod/generate-db-role-sql.ts
 *   # Output: scripts/prod/app-db-user.sql
 *   # Then run: psql $DATABASE_URL < scripts/prod/app-db-user.sql
 */

import * as fs from 'fs';
import * as path from 'path';

const DIVIDER = '═'.repeat(60);

// Tables that must be append-only — no UPDATE or DELETE ever
const IMMUTABLE_TABLES = [
  'universal_audit_log',
  'universal_audit_trail',
  'financial_processing_fees',
  'platform_revenue',
  'scheduling_audit_log',
  'billing_audit_log',
  'audit_logs',
];

// Tables that must never be deleted from (but UPDATE is OK for status changes)
const NO_DELETE_TABLES = [
  'invoices',
  'payroll_periods',
  'time_entries',
];

function generateSQL(password: string): string {
  const revokeImmutable = IMMUTABLE_TABLES.map(t =>
    `REVOKE UPDATE, DELETE ON TABLE ${t} FROM app_db_user;`
  ).join('\n');

  const revokeNoDelete = NO_DELETE_TABLES.map(t =>
    `REVOKE DELETE ON TABLE ${t} FROM app_db_user;`
  ).join('\n');

  return `-- ============================================================
-- CoAIleague Production DB Role Setup
-- Generated: ${new Date().toISOString()}
--
-- PURPOSE: Create app_db_user with limited privileges.
--          Critical audit and financial tables are made
--          physically immutable (no UPDATE/DELETE).
--
-- Run as superuser or DB owner:
--   psql $DATABASE_URL < scripts/prod/app-db-user.sql
-- ============================================================

-- 1. Create the role (skip if already exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_db_user') THEN
    CREATE ROLE app_db_user LOGIN PASSWORD '${password}';
    RAISE NOTICE 'Created role: app_db_user';
  ELSE
    RAISE NOTICE 'Role app_db_user already exists — skipping CREATE';
  END IF;
END
$$;

-- 2. Grant base table privileges (SELECT, INSERT, UPDATE, DELETE on all tables)
GRANT CONNECT ON DATABASE CURRENT_DATABASE() TO app_db_user;
GRANT USAGE ON SCHEMA public TO app_db_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_db_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_db_user;

-- 3. Ensure future tables also grant base access
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_db_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_db_user;

-- 4. REVOKE UPDATE + DELETE on immutable audit/financial tables
--    These tables are append-only by design (OMEGA Law).
${revokeImmutable}

-- 5. REVOKE DELETE on financial records (UPDATE allowed for status changes)
${revokeNoDelete}

-- 6. Verify the setup
SELECT
  grantee,
  table_name,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE grantee = 'app_db_user'
  AND table_name = ANY(ARRAY[${IMMUTABLE_TABLES.map(t => `'${t}'`).join(', ')}])
GROUP BY grantee, table_name
ORDER BY table_name;
`;
}

function main() {
  console.log('\n' + DIVIDER);
  console.log(' GENERATE DB ROLE SQL');
  console.log(DIVIDER + '\n');

  // Check if a password was passed as arg, otherwise prompt
  const passArg = process.argv[2];
  const password = passArg || 'CHANGE_THIS_PASSWORD_BEFORE_RUNNING';

  if (!passArg) {
    console.log('⚠️   No password argument provided.');
    console.log('    Usage: npx tsx scripts/prod/generate-db-role-sql.ts <password>');
    console.log('    Using placeholder — EDIT THE SQL FILE before running.\n');
  }

  const sql = generateSQL(password);
  const outputPath = path.join(process.cwd(), 'scripts/prod/app-db-user.sql');

  fs.writeFileSync(outputPath, sql, 'utf8');

  console.log('✅  SQL file generated: scripts/prod/app-db-user.sql\n');
  console.log('Immutable tables (no UPDATE or DELETE):');
  IMMUTABLE_TABLES.forEach(t => console.log(`  • ${t}`));
  console.log('\nNo-delete tables (UPDATE allowed, DELETE blocked):');
  NO_DELETE_TABLES.forEach(t => console.log(`  • ${t}`));

  console.log('\n' + DIVIDER);
  console.log(' NEXT STEPS');
  console.log(DIVIDER);
  console.log('');
  if (!passArg) {
    console.log('1. Edit scripts/prod/app-db-user.sql and replace:');
    console.log('   CHANGE_THIS_PASSWORD_BEFORE_RUNNING');
    console.log('   with a strong password (32+ chars recommended)\n');
    console.log('2. Run against your production database:');
  } else {
    console.log('1. Run against your production database:');
  }
  console.log('   psql $DATABASE_URL < scripts/prod/app-db-user.sql\n');
  console.log('3. Update DATABASE_URL to use app_db_user credentials');
  console.log('   (or keep using the existing superuser for now and run');
  console.log('    this as a hardening step after go-live)\n');
  console.log(DIVIDER + '\n');
}

main();
