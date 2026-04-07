-- Schema audit dump for shared/schema.ts reconciliation
-- Run with:
--   psql "postgresql://postgres:...@junction.proxy.rlwy.net:52981/railway" -f scripts/db-audit-dump.sql > db-audit.txt
--
-- Then paste db-audit.txt back to Claude Code for diff against shared/schema.ts

\pset format unaligned
\pset tuples_only off
\pset fieldsep '|'

\echo
\echo === SECTION 1: ENUMS ===
SELECT
  t.typname AS enum_name,
  string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
GROUP BY t.typname
ORDER BY t.typname;

\echo
\echo === SECTION 2: TABLES + COLUMNS ===
SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  COALESCE(c.character_maximum_length::text, ''),
  c.is_nullable,
  COALESCE(c.column_default, ''),
  COALESCE(c.udt_name, '')
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_name = c.table_name AND t.table_schema = c.table_schema
WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
ORDER BY c.table_name, c.ordinal_position;

\echo
\echo === SECTION 3: INDEXES ===
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

\echo
\echo === SECTION 4: PRIMARY/FOREIGN KEYS ===
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position) AS columns,
  COALESCE(ccu.table_name, '') AS ref_table,
  COALESCE(string_agg(ccu.column_name, ',' ORDER BY kcu.ordinal_position), '') AS ref_columns
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
  AND tc.table_schema = ccu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')
GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type, ccu.table_name
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

\echo
\echo === SECTION 5: TABLE COUNTS ===
SELECT count(*) AS table_count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
SELECT count(*) AS enum_count FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e';

\echo
\echo === SECTION 6: SPECIFIC SPOT CHECKS (Replit's claimed fixes) ===

\echo --- automation_level enum ---
SELECT enumlabel FROM pg_enum WHERE enumtypid = 'public.automation_level'::regtype ORDER BY enumsortorder;

\echo --- alert_type enum ---
SELECT enumlabel FROM pg_enum WHERE enumtypid = 'public.alert_type'::regtype ORDER BY enumsortorder;

\echo --- workspace_ai_periods table ---
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspace_ai_periods') AS workspace_ai_periods_exists;

\echo --- rl_confidence_models table ---
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rl_confidence_models') AS rl_confidence_models_exists;

\echo --- workspace_holidays table ---
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspace_holidays') AS workspace_holidays_exists;

\echo
\echo === END OF AUDIT DUMP ===
