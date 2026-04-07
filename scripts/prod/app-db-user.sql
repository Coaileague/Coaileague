-- ============================================================
-- CoAIleague Production DB Role Setup
-- Generated: 2026-04-04T04:26:28.463Z
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
    CREATE ROLE app_db_user LOGIN PASSWORD 'CHANGE_THIS_PASSWORD_BEFORE_RUNNING';
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
REVOKE UPDATE, DELETE ON TABLE universal_audit_log FROM app_db_user;
REVOKE UPDATE, DELETE ON TABLE universal_audit_trail FROM app_db_user;
REVOKE UPDATE, DELETE ON TABLE financial_processing_fees FROM app_db_user;
REVOKE UPDATE, DELETE ON TABLE platform_revenue FROM app_db_user;
REVOKE UPDATE, DELETE ON TABLE scheduling_audit_log FROM app_db_user;
REVOKE UPDATE, DELETE ON TABLE billing_audit_log FROM app_db_user;
REVOKE UPDATE, DELETE ON TABLE audit_logs FROM app_db_user;

-- 5. REVOKE DELETE on financial records (UPDATE allowed for status changes)
REVOKE DELETE ON TABLE invoices FROM app_db_user;
REVOKE DELETE ON TABLE payroll_periods FROM app_db_user;
REVOKE DELETE ON TABLE time_entries FROM app_db_user;

-- 6. Verify the setup
SELECT
  grantee,
  table_name,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE grantee = 'app_db_user'
  AND table_name = ANY(ARRAY['universal_audit_log', 'universal_audit_trail', 'financial_processing_fees', 'platform_revenue', 'scheduling_audit_log', 'billing_audit_log', 'audit_logs'])
GROUP BY grantee, table_name
ORDER BY table_name;
