/**
 * Critical Database Constraints Bootstrap
 *
 * Some database invariants the application relies on (race-condition
 * exclusion constraints, btree_gist extension, etc.) are not expressible
 * in Drizzle's TypeScript schema DSL. They live as raw SQL that must be
 * applied idempotently every time the server boots, after ensureRequiredTables()
 * has settled the canonical schema.
 *
 * This module is the registry of those critical constraints. Each entry
 * has a `name`, an `idempotentCheck` SQL fragment, and an `applySql`
 * statement. The runner queries the check, and if the constraint is
 * missing, applies the statement.
 *
 * 🔴 Why this exists:
 * Drizzle migrations (`drizzle-kit push`) syncs schema from the TypeScript
 * definition. Exclusion constraints (EXCLUDE USING gist with tstzrange)
 * are not part of the Drizzle DSL, so push will never create them. The
 * SQL migration files in ./migrations/ are leftovers from drizzle-kit
 * generate and are not executed by the deploy pipeline.
 *
 * Without this bootstrap, the shift-overlap exclusion constraint
 * referenced as the "sole enforcement" in shiftRoutes.ts (RC5 Phase 2)
 * silently disappears whenever the database is rebuilt — a critical
 * race condition vulnerability.
 *
 * Add new entries here when you introduce a new raw-SQL invariant the
 * Drizzle schema cannot express. Each entry must be idempotent.
 */

import { pool } from '../db';
import { createLogger } from '../lib/logger';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';

const log = createLogger('criticalConstraintsBootstrap');

interface CriticalConstraint {
  name: string;
  /** Reason this constraint cannot live in the Drizzle schema */
  rationale: string;
  /** Returns true if the constraint is already present in the live DB */
  isPresent: () => Promise<boolean>;
  /** Apply the constraint (must be idempotent — safe to re-run) */
  apply: () => Promise<void>;
}

const constraints: CriticalConstraint[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 0: Ensure PostgreSQL enum types exist before any ALTER TYPE attempts
  // ═══════════════════════════════════════════════════════════════════════════
  // criticalConstraintsBootstrap previously failed with "type does not exist"
  // errors because it tried to ALTER TYPE before the types were created.
  // These must come FIRST in the constraints array.
  {
    name: 'create_enum_shift_status',
    rationale: 'shift_status enum must exist before any ALTER TYPE ADD VALUE calls; Drizzle migrations did not create it on this DB',
    isPresent: async () => {
      const { rows } = await pool.query(`SELECT 1 FROM pg_type WHERE typname = 'shift_status'`);
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(`
        DO $$ BEGIN
          CREATE TYPE shift_status AS ENUM (
            'draft','published','scheduled','in_progress','completed','cancelled',
            'confirmed','pending','approved','auto_approved','no_show','calloff',
            'denied'
          );
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `);
    },
  },
  {
    name: 'create_enum_audit_action',
    rationale: 'audit_action enum must exist before any ALTER TYPE ADD VALUE calls',
    isPresent: async () => {
      const { rows } = await pool.query(`SELECT 1 FROM pg_type WHERE typname = 'audit_action'`);
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(`
        DO $$ BEGIN
          CREATE TYPE audit_action AS ENUM (
            'create','update','delete','login','logout','clock_in','clock_out',
            'generate_invoice','payment_received','assign_manager','remove_manager',
            'kick_user','silence_user','give_voice','remove_voice','ban_user','unban_user',
            'reset_password','unlock_account','lock_account','change_role','change_permissions',
            'transfer_ownership','impersonate_user',
            'export_data','import_data','delete_data','restore_data',
            'update_motd','update_banner','change_settings','view_audit_logs',
            'escalate_ticket','transfer_ticket','view_documents','request_secure_info','release_spectator',
            'automation_job_start','automation_job_complete','automation_job_error','automation_artifact_generated',
            'scheduler_job_completed','scheduler_job_failed',
            'workspace_created','coi_request','contract_renewal_request',
            'approve','reject','bulk_update','deactivate','activate',
            'coverage_requested','shift_unassigned','shift_assigned',
            'payroll_approved','invoice_created','invoice_sent','invoice_paid',
            'schedule_notification','coverage_triggered','payroll_run_started','payroll_run_completed','alert_created',
            'service_unhealthy','alert_triggered'
          );
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `);
    },
  },
  {
    name: 'create_enum_automation_level',
    rationale: 'automation_level enum must exist before any ALTER TYPE ADD VALUE calls',
    isPresent: async () => {
      const { rows } = await pool.query(`SELECT 1 FROM pg_type WHERE typname = 'automation_level'`);
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(`
        DO $$ BEGIN
          CREATE TYPE automation_level AS ENUM (
            'hand_held','graduated','full_automation','notify_only'
          );
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `);
    },
  },
  {
    name: 'create_enum_knowledge_domain',
    rationale: 'knowledge_domain enum must exist before any ALTER TYPE ADD VALUE calls',
    isPresent: async () => {
      const { rows } = await pool.query(`SELECT 1 FROM pg_type WHERE typname = 'knowledge_domain'`);
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(`
        DO $$ BEGIN
          CREATE TYPE knowledge_domain AS ENUM (
            'scheduling','payroll','compliance','invoicing','employees',
            'clients','automation','security','performance','general',
            'onboarding','analytics','communication','time_tracking'
          );
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `);
    },
  },
  {
    name: 'create_enum_gap_severity',
    rationale: 'gap_severity enum must exist before any ALTER TYPE ADD VALUE calls',
    isPresent: async () => {
      const { rows } = await pool.query(`SELECT 1 FROM pg_type WHERE typname = 'gap_severity'`);
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(`
        DO $$ BEGIN
          CREATE TYPE gap_severity AS ENUM (
            'critical','high','medium','low','info','warning','error','blocker'
          );
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `);
    },
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 0B: Fix ai_call_log table schema (auto-created with minimal columns)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'ai_call_log_full_schema',
    rationale: 'ai_call_log was auto-created in index.ts with minimal columns; aiMeteringService.ts inserts 20 columns including period_id',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'ai_call_log' AND column_name = 'period_id'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      // Ensure the table exists first, then add all missing columns idempotently
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ai_call_log (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          workspace_id VARCHAR,
          period_id VARCHAR,
          model_name VARCHAR,
          model_role VARCHAR,
          call_type VARCHAR,
          feature VARCHAR,
          model VARCHAR,
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          total_tokens INTEGER DEFAULT 0,
          tokens_used INTEGER DEFAULT 0,
          cost_microcents BIGINT DEFAULT 0,
          cost_credits INTEGER DEFAULT 0,
          triggered_by_user_id VARCHAR,
          triggered_by_session_id VARCHAR,
          trinity_action_id VARCHAR,
          employee_id VARCHAR,
          response_time_ms INTEGER,
          was_cached BOOLEAN DEFAULT false,
          fallback_used BOOLEAN DEFAULT false,
          fallback_from VARCHAR,
          claude_validated BOOLEAN DEFAULT false,
          claude_validation_passed BOOLEAN,
          claude_validation_action VARCHAR,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS period_id VARCHAR;
        ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS model_name VARCHAR;
        ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS model_role VARCHAR;
        ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS call_type VARCHAR;
        ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS input_tokens INTEGER DEFAULT 0;
        ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS output_tokens INTEGER DEFAULT 0;
        ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0;
        ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS cost_microcents BIGINT DEFAULT 0;
        ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS triggered_by_user_id VARCHAR;
        ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS triggered_by_session_id VARCHAR;
        ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS trinity_action_id VARCHAR;
        ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS employee_id VARCHAR;
        ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS response_time_ms INTEGER;
        ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS was_cached BOOLEAN DEFAULT false;
        ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN DEFAULT false;
        ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS fallback_from VARCHAR;
        ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS claude_validated BOOLEAN DEFAULT false;
        ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS claude_validation_passed BOOLEAN;
        ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS claude_validation_action VARCHAR;
        CREATE INDEX IF NOT EXISTS idx_ai_call_log_ws ON ai_call_log (workspace_id);
        CREATE INDEX IF NOT EXISTS idx_ai_call_log_period ON ai_call_log (period_id);
        CREATE INDEX IF NOT EXISTS idx_ai_call_log_created ON ai_call_log (created_at);
      `);
    },
  },
  // ── Support login OTP table ──────────────────────────────────────────────
  // Stores daily-rotating SMS PINs for platform support role logins.
  // Created here (not in Drizzle schema) so it boots idempotently in all
  // environments without a separate migration step.
  {
    name: 'support_login_otps_table',
    rationale: 'Daily-rotating SMS OTP table for platform support logins — not expressible in Drizzle DSL without enum changes',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'support_login_otps'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS support_login_otps (
          id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id     VARCHAR     NOT NULL,
          otp_hash    VARCHAR     NOT NULL,
          expires_at  TIMESTAMP   NOT NULL,
          used_at     TIMESTAMP,
          created_at  TIMESTAMP   DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS support_login_otps_user_idx
          ON support_login_otps (user_id);
        CREATE INDEX IF NOT EXISTS support_login_otps_expires_idx
          ON support_login_otps (expires_at);
      `);
    },
  },
  {
    name: 'btree_gist_extension',
    rationale: 'Required by no_overlapping_employee_shifts gist exclusion constraint',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
    },
  },
  // ── Phase T enum-value backfills (production log forensics 2026-04-07) ──
  // The live PostgreSQL enums for `shift_status` and `audit_action` were
  // missing values the application code references at runtime, producing
  // "invalid input value for enum" errors every cycle and cascading
  // "Audit log failed" spam in Railway production logs. ALTER TYPE ADD
  // VALUE IF NOT EXISTS is idempotent and safe to run on every boot.
  {
    name: 'shift_status_value_confirmed',
    rationale: 'shift-monitoring-cycle uses status="confirmed" but the live enum was missing it (production log error)',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'shift_status' AND e.enumlabel = 'confirmed'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(`ALTER TYPE shift_status ADD VALUE IF NOT EXISTS 'confirmed'`);
    },
  },
  {
    name: 'shift_status_value_pending',
    rationale: 'shift_status enum was missing "pending" — application code references it (production log forensics 2026-04-08)',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'shift_status' AND e.enumlabel = 'pending'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(`ALTER TYPE shift_status ADD VALUE IF NOT EXISTS 'pending'`);
    },
  },
  {
    name: 'shift_status_value_denied',
    rationale: 'shift_status enum was missing "denied" — referenced by criticalConstraintsBootstrap exclusion constraint and shift trading flows',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'shift_status' AND e.enumlabel = 'denied'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(`ALTER TYPE shift_status ADD VALUE IF NOT EXISTS 'denied'`);
    },
  },
  {
    name: 'shift_status_value_approved',
    rationale: 'shift_status enum was missing "approved" — application code references it for approval flows',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'shift_status' AND e.enumlabel = 'approved'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(`ALTER TYPE shift_status ADD VALUE IF NOT EXISTS 'approved'`);
    },
  },
  {
    name: 'audit_action_value_service_unhealthy',
    rationale: 'healthCheckAggregation writes service_unhealthy audit rows but the live enum was missing it',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'audit_action' AND e.enumlabel = 'service_unhealthy'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(`ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'service_unhealthy'`);
    },
  },
  {
    name: 'audit_action_value_alert_triggered',
    rationale: 'metricsDashboard writes alert_triggered audit rows but the live enum was missing it',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'audit_action' AND e.enumlabel = 'alert_triggered'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(`ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'alert_triggered'`);
    },
  },
  {
    name: 'audit_action_value_test_audit_schema_insert',
    rationale: 'auditSchemaRegression test writes this value; missing from live enum',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'audit_action' AND e.enumlabel = 'test_audit_schema_insert'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(`ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'test_audit_schema_insert'`);
    },
  },
  // ── Phase V bulk enum backfill (Railway log forensics 2026-04-08) ─────
  // Fifteen audit_action values referenced by actual running code that were
  // never in the live enum. Every cycle was emitting "invalid input value
  // for enum audit_action" errors because orchestration lifecycle events,
  // scheduler job completions, platform event publishers, automation
  // daemons, and the Trinity autonomous runner all insert rows with these
  // action strings. Rather than 15 individual constraint entries, one
  // pass is cleaner and idempotent via ADD VALUE IF NOT EXISTS.
  {
    name: 'audit_action_phase_v_bulk_backfill',
    rationale: 'Phase V: 15 audit_action enum values referenced at runtime but missing from the live enum (orchestration lifecycle, platform events, automation daemons, Trinity autonomous runner). Railway log forensics 2026-04-08.',
    isPresent: async () => {
      const expected = [
        'orchestration.orchestration_started',
        'orchestration.orchestration_completed',
        'orchestration_state',
        'scheduler_job_completed',
        'platform_event_orchestration_lifecycle',
        'platform_event_automation_completed',
        'platform_event_agent_learning',
        'platform_event_experience_recorded',
        'platform_event_websocket_cleanup_completed',
        'platform_event_ai_brain_action',
        'platform_event_domain_supervisors_initialized',
        'trinity_autonomous:autonomous_ops_started',
        'automation.daemon.autonomous-scheduling-daemon',
        'automation.daemon.shift-monitoring-cycle',
        'automation.scheduled_task.shift-completion-bridge-cycle',
      ];
      const { rows } = await pool.query(
        `SELECT e.enumlabel FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'audit_action' AND e.enumlabel = ANY($1::text[])`,
        [expected],
      );
      return rows.length === expected.length;
    },
    apply: async () => {
      const toAdd = [
        'orchestration.orchestration_started',
        'orchestration.orchestration_completed',
        'orchestration_state',
        'scheduler_job_completed',
        'platform_event_orchestration_lifecycle',
        'platform_event_automation_completed',
        'platform_event_agent_learning',
        'platform_event_experience_recorded',
        'platform_event_websocket_cleanup_completed',
        'platform_event_ai_brain_action',
        'platform_event_domain_supervisors_initialized',
        'trinity_autonomous:autonomous_ops_started',
        'automation.daemon.autonomous-scheduling-daemon',
        'automation.daemon.shift-monitoring-cycle',
        'automation.scheduled_task.shift-completion-bridge-cycle',
      ];
      for (const value of toAdd) {
        try {
          await pool.query(
            `ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '${value.replace(/'/g, "''")}'`,
          );
        } catch (err: any) {
          log.warn(`[auditAction] Failed to add enum value ${value}: ${err?.message?.slice(0, 120)}`);
        }
      }
    },
  },
  {
    name: 'automation_level_value_notify_only',
    rationale: 'automation_level enum is missing NOTIFY_ONLY. Runtime code references it via automationOrchestration settings.',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'automation_level' AND e.enumlabel = 'NOTIFY_ONLY'`,
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(`ALTER TYPE automation_level ADD VALUE IF NOT EXISTS 'NOTIFY_ONLY'`);
    },
  },
  {
    name: 'knowledge_domain_value_time_tracking',
    rationale: 'knowledge_domain enum is missing time_tracking. Trinity knowledge writes with this domain value fail.',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'knowledge_domain' AND e.enumlabel = 'time_tracking'`,
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(`ALTER TYPE knowledge_domain ADD VALUE IF NOT EXISTS 'time_tracking'`);
    },
  },
  {
    name: 'gap_severity_value_error',
    rationale: 'gap_severity enum is missing "error" — queries using severity = "error" fail every cycle. Valid values were critical/warning/info; adding error aligns runtime behavior with code expectations.',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'gap_severity' AND e.enumlabel = 'error'`,
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(`ALTER TYPE gap_severity ADD VALUE IF NOT EXISTS 'error'`);
    },
  },
  // ── Phase V varchar-id defaults for trinity_knowledge_base / somatic_pattern_library ──
  {
    name: 'trinity_knowledge_base_id_default',
    rationale: 'trinity_knowledge_base.id column has no DEFAULT but seed INSERTs use DEFAULT for id. Railway log forensics 2026-04-08.',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'trinity_knowledge_base' AND column_name = 'id'
           AND column_default LIKE '%gen_random_uuid%'`,
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(
        `ALTER TABLE trinity_knowledge_base ALTER COLUMN id SET DEFAULT gen_random_uuid()::text`,
      );
    },
  },
  {
    name: 'somatic_pattern_library_id_default',
    rationale: 'somatic_pattern_library.id column has no DEFAULT — same pattern as trinity_knowledge_base. Railway log forensics 2026-04-08.',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'somatic_pattern_library' AND column_name = 'id'
           AND column_default LIKE '%gen_random_uuid%'`,
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(
        `ALTER TABLE somatic_pattern_library ALTER COLUMN id SET DEFAULT gen_random_uuid()::text`,
      );
    },
  },
  // ── Phase V missing partial unique index for RL confidence upserts ──
  {
    name: 'ai_learning_events_confidence_partial_unique',
    rationale: 'RLRepo upsert uses ON CONFLICT (agent_id, action_type) WHERE event_type = "confidence_update" but the matching partial unique index was never created in the live DB. Every RL confidence cycle fails. Railway log forensics 2026-04-08.',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM pg_indexes
         WHERE tablename = 'ai_learning_events'
           AND indexname = 'idx_ai_learning_events_confidence'`,
      );
      return rows.length > 0;
    },
    apply: async () => {
      // Remove any pre-existing duplicate rows that would violate the
      // new unique index before installing it.
      await pool.query(`
        DELETE FROM ai_learning_events a
        USING ai_learning_events b
        WHERE a.ctid < b.ctid
          AND a.event_type = 'confidence_update'
          AND b.event_type = 'confidence_update'
          AND a.agent_id = b.agent_id
          AND a.action_type = b.action_type
      `);
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_learning_events_confidence
           ON ai_learning_events (agent_id, action_type)
           WHERE event_type = 'confidence_update'`,
      );
    },
  },
  // ── Phase V durable_job_queue indexes with wrong column name ──
  //
  // Two indexes were defined against `run_at` but the column is named
  // `execute_at`. Boot fails with "column 'run_at' does not exist" on
  // every restart. The fix is: drop the stale index definitions (they
  // never existed in the live DB — the CREATE fails and silently
  // continues) and create the real indexes against the correct column.
  // We first inspect the live table to pick the right column name in
  // case the schema varies across environments.
  {
    name: 'durable_job_queue_indexes_correct_column',
    rationale: 'idx_job_queue_run_at and idx_job_queue_pending reference a column named run_at that does not exist on durable_job_queue. Detect the real column name (execute_at or scheduled_at) at runtime and create the indexes against it. Railway log forensics 2026-04-08.',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM pg_indexes
         WHERE tablename = 'durable_job_queue'
           AND indexname = 'idx_job_queue_run_at'`,
      );
      return rows.length > 0;
    },
    apply: async () => {
      // Detect the real time-column used by the job queue
      const { rows: cols } = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'durable_job_queue'
           AND column_name IN ('run_at', 'execute_at', 'scheduled_at', 'next_run_at')`,
      );
      const present = new Set(cols.map((r) => r.column_name));
      const runCol =
        present.has('execute_at') ? 'execute_at' :
        present.has('scheduled_at') ? 'scheduled_at' :
        present.has('next_run_at') ? 'next_run_at' :
        present.has('run_at') ? 'run_at' :
        null;
      if (!runCol) {
        log.warn('[durableJobQueue] No run/execute/scheduled column found — skipping index creation');
        return;
      }
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_job_queue_run_at ON durable_job_queue ("${runCol}")`,
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_job_queue_pending ON durable_job_queue (status, "${runCol}")`,
      );
      log.info(`[durableJobQueue] Created indexes on column "${runCol}"`);
    },
  },
  // ── Phase V time_entries index with wrong column name ──
  {
    name: 'time_entries_clock_in_index',
    rationale: 'idx_time_entries_clock_in references clock_in_at but the real column is likely clock_in_time or clocked_in_at. Detect at runtime and create the correct index. Railway log forensics 2026-04-08.',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM pg_indexes
         WHERE tablename = 'time_entries'
           AND indexname = 'idx_time_entries_clock_in'`,
      );
      return rows.length > 0;
    },
    apply: async () => {
      const { rows: cols } = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'time_entries'
           AND column_name IN ('clock_in_at', 'clock_in_time', 'clocked_in_at', 'clockin_at', 'clock_in')`,
      );
      const present = new Set(cols.map((r) => r.column_name));
      const clockCol =
        present.has('clock_in_time') ? 'clock_in_time' :
        present.has('clocked_in_at') ? 'clocked_in_at' :
        present.has('clock_in_at') ? 'clock_in_at' :
        present.has('clockin_at') ? 'clockin_at' :
        present.has('clock_in') ? 'clock_in' :
        null;
      if (!clockCol) {
        log.warn('[timeEntries] No clock-in column found — skipping index creation');
        return;
      }
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_time_entries_clock_in ON time_entries ("${clockCol}")`,
      );
      log.info(`[timeEntries] Created clock-in index on column "${clockCol}"`);
    },
  },
  // ── Phase V missing tables: workspace_credit_balance + workspace_holidays ──
  //
  // ALTER statements run against these two tables on every startup, but
  // the tables themselves were never created in the live DB. Create them
  // idempotently here so the ALTERs downstream can succeed. Columns are
  // inferred from the user's brief + queried usage patterns.
  {
    name: 'workspace_credit_balance_table',
    rationale: 'workspace_credit_balance table missing from live DB but ALTER TABLE statements run against it every startup. Create it idempotently.',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'workspace_credit_balance'`,
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS workspace_credit_balance (
          workspace_id varchar PRIMARY KEY,
          workspace_name varchar,
          credit_balance integer NOT NULL DEFAULT 0,
          monthly_credit_allocation integer NOT NULL DEFAULT 0,
          subscription_tier varchar,
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )
      `);
    },
  },
  {
    name: 'workspace_holidays_table',
    rationale: 'workspace_holidays table missing from live DB; holidayService queries reference it and fail. Create it idempotently.',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'workspace_holidays'`,
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS workspace_holidays (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
          workspace_id varchar NOT NULL,
          holiday_name varchar NOT NULL,
          holiday_date date NOT NULL,
          holiday_type varchar,
          state_code varchar,
          applies_to varchar,
          created_at timestamptz NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(
        `CREATE INDEX IF NOT EXISTS workspace_holidays_workspace_idx ON workspace_holidays (workspace_id)`,
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS workspace_holidays_date_idx ON workspace_holidays (holiday_date)`,
      );
    },
  },
  {
    name: 'payroll_status_value_completed',
    rationale: 'payroll_status enum is declared with "completed" in shared/schema/enums.ts but the live Railway enum is missing it. Every payroll run transition to "completed" errors with "invalid input value for enum payroll_status" and cascades into autonomousScheduler audit log failures (production log forensics 2026-04-08).',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'payroll_status' AND e.enumlabel = 'completed'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(`ALTER TYPE payroll_status ADD VALUE IF NOT EXISTS 'completed'`);
    },
  },
  // ── Phase X: Optimistic locking column (TRINITY.md §15) ─────────────────
  // Section 15 mandates optimistic locking for concurrent shift edits:
  //   UPDATE shifts SET ..., version = version + 1
  //   WHERE id = $1 AND version = $2 RETURNING *
  //   → 0 rows → another edit won the race, return 409 Conflict
  // This column is infrastructure — the route-level version-check pattern
  // is a separate follow-up. Adding the column first is idempotent and
  // non-breaking: unused columns default to 1 on existing rows.
  // ── Phase Y: id-column gen_random_uuid() defaults ──────────────────────
  // The Drizzle schema declares `varchar("id").primaryKey().default(sql`gen_random_uuid()`)`
  // for these tables, but drizzle-kit push does not reliably propagate the
  // default to the live PostgreSQL column when the column is varchar (only
  // for Drizzle's native uuid type). The result was INSERTs that omit `id`
  // failing with "null value in column \"id\" violates not-null constraint".
  // ALTER COLUMN ... SET DEFAULT is idempotent and safe to re-run.
  {
    name: 'audit_logs_id_default',
    rationale: 'audit_logs.id default missing in live DB (Drizzle declares it but drizzle-kit push skips varchar SQL defaults)',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'audit_logs' AND column_name = 'id'
           AND column_default LIKE '%gen_random_uuid%'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(
        `ALTER TABLE audit_logs ALTER COLUMN id SET DEFAULT gen_random_uuid()::text`
      );
    },
  },
  {
    name: 'token_usage_log_id_default',
    rationale: 'token_usage_log.id default missing in live DB (Drizzle declares it but drizzle-kit push skips varchar SQL defaults)',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'token_usage_log' AND column_name = 'id'
           AND column_default LIKE '%gen_random_uuid%'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(
        `ALTER TABLE token_usage_log ALTER COLUMN id SET DEFAULT gen_random_uuid()::text`
      );
    },
  },
  {
    name: 'token_usage_log_timestamp_default',
    rationale: 'token_usage_log.timestamp NOT NULL violation — TokenUsageService omits timestamp on every write because Drizzle declares defaultNow().notNull() but drizzle-kit push did not propagate the default. Fires constantly in production logs.',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'token_usage_log' AND column_name = 'timestamp'
           AND column_default LIKE '%now%'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(
        `ALTER TABLE token_usage_log ALTER COLUMN timestamp SET DEFAULT NOW()`
      );
    },
  },
  {
    name: 'audit_logs_user_id_nullable',
    rationale: 'audit_logs.user_id is NOT NULL in live DB but Drizzle declares it nullable. System-actor writes (payrollDeadlineNudgeService, healthCheckAggregation, metricsDashboard) omit user_id and fail constantly with "null value in column user_id violates not-null constraint" — every audit log write from a non-user actor errors out.',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'audit_logs' AND column_name = 'user_id'
           AND is_nullable = 'YES'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(
        `ALTER TABLE audit_logs ALTER COLUMN user_id DROP NOT NULL`
      );
    },
  },
  {
    name: 'audit_logs_user_email_nullable',
    rationale: 'audit_logs.user_email is NOT NULL in live DB but Drizzle declares it nullable. System-actor writes omit user_email and fail with "null value in column user_email violates not-null constraint" — testCorrectSchemaInsert regression test fails because of this. Drop the constraint.',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'audit_logs' AND column_name = 'user_email'
           AND is_nullable = 'YES'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(
        `ALTER TABLE audit_logs ALTER COLUMN user_email DROP NOT NULL`
      );
    },
  },
  {
    name: 'audit_logs_user_role_nullable',
    rationale: 'audit_logs.user_role is NOT NULL in live DB but Drizzle declares it nullable. System-actor writes (cron jobs, healthchecks, watchdogs) omit user_role and fail with "null value in column user_role violates not-null constraint". Covered by the generic audit_logs_drop_stale_not_nulls scanner below, but kept as an explicit entry per user directive so the intent is unambiguous.',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'audit_logs' AND column_name = 'user_role'
           AND is_nullable = 'YES'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(
        `ALTER TABLE audit_logs ALTER COLUMN user_role DROP NOT NULL`
      );
    },
  },
  {
    name: 'audit_logs_drop_stale_not_nulls',
    rationale: 'The Drizzle audit_logs schema only declares id and created_at as NOT NULL. The live DB has many additional NOT NULL columns (user_role, user_name, action, entity_type, entity_id, etc.) inherited from previous schema migrations that drizzle-kit push never reverted. System-actor writes omit most of these and fail with "null value in column ... violates not-null constraint". This generic scan finds every NOT NULL column on audit_logs except id and created_at and drops the constraint to match the schema.',
    isPresent: async () => {
      // Present (i.e. needs no work) when audit_logs has zero NOT NULL
      // columns other than id + created_at
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'audit_logs'
           AND is_nullable = 'NO'
           AND column_name NOT IN ('id', 'created_at')
         LIMIT 1`
      );
      return rows.length === 0;
    },
    apply: async () => {
      const { rows } = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'audit_logs'
           AND is_nullable = 'NO'
           AND column_name NOT IN ('id', 'created_at')`
      );
      for (const r of rows) {
        try {
          await pool.query(
            `ALTER TABLE audit_logs ALTER COLUMN "${r.column_name}" DROP NOT NULL`
          );
          log.info(`[criticalConstraints] dropped NOT NULL on audit_logs.${r.column_name}`);
        } catch (err: any) {
          log.warn(`[criticalConstraints] failed to drop NOT NULL on audit_logs.${r.column_name}: ${err?.message?.slice(0, 120)}`);
        }
      }
    },
  },
  {
    name: 'token_usage_monthly_ws_month_unique',
    rationale: 'tokenUsageMonthly.upsertMonthlyUsage() uses ON CONFLICT (workspace_id, month_year) DO UPDATE which requires a unique constraint or index on exactly those columns. The Drizzle schema declares unique("uq_token_usage_monthly_ws_month") but drizzle-kit push did not propagate it to the live DB, so monthly token rollups error every time TokenUsageService.recordUsage() runs.',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM pg_indexes
         WHERE tablename = 'token_usage_monthly'
           AND indexname = 'token_usage_monthly_ws_month_unique'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      // Dedupe any existing rows that would violate the new unique
      // constraint before installing it. Without this, CREATE on a
      // dirty table errors.
      await pool.query(`
        DELETE FROM token_usage_monthly a
        USING token_usage_monthly b
        WHERE a.ctid < b.ctid
          AND a.workspace_id = b.workspace_id
          AND a.month_year = b.month_year
      `);
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS token_usage_monthly_ws_month_unique
           ON token_usage_monthly (workspace_id, month_year)`
      );
    },
  },
  {
    name: 'cron_run_log_id_default',
    rationale: 'cron_run_log.id missing default — autonomousScheduler.trackJobExecution INSERT fails with "Failed to insert initial cron_run_log" because the id column lacks gen_random_uuid() default in the live DB.',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'cron_run_log' AND column_name = 'id'
           AND (column_default LIKE '%gen_random_uuid%' OR column_default LIKE '%nextval%')`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(
        `ALTER TABLE cron_run_log ALTER COLUMN id SET DEFAULT gen_random_uuid()::text`
      );
    },
  },
  {
    name: 'interview_questions_bank_id_default',
    rationale: 'interview_questions_bank.id default missing in live DB (Drizzle declares it but drizzle-kit push skips varchar SQL defaults)',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'interview_questions_bank' AND column_name = 'id'
           AND column_default LIKE '%gen_random_uuid%'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(
        `ALTER TABLE interview_questions_bank ALTER COLUMN id SET DEFAULT gen_random_uuid()::text`
      );
    },
  },
  {
    name: 'trinity_requests_id_default',
    rationale: 'trinity_requests.id default missing in live DB — TrinityOrchestrationGateway.flushRequestBuffer logs "Flush error" every 30s because INSERTs omit id and the column lacks gen_random_uuid() default',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'trinity_requests' AND column_name = 'id'
           AND column_default LIKE '%gen_random_uuid%'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(
        `ALTER TABLE trinity_requests ALTER COLUMN id SET DEFAULT gen_random_uuid()::text`
      );
    },
  },
  // ── Phase Z: trinity_self_awareness unique index ────────────────────────
  // trinitySelfAwarenessService.upsertFact uses ON CONFLICT (category, fact_key)
  // which requires a unique constraint or unique index on exactly those two
  // columns. The Drizzle schema declares it as uniqueIndex("tsa_category_key_unique")
  // but drizzle-kit push did not propagate it to the live DB, so 17 boot-time
  // upsertFact calls failed with "no unique or exclusion constraint matching
  // the ON CONFLICT specification". This bootstrap installs the index
  // idempotently. Also installs the trinity_self_awareness id default for the
  // same varchar(id) drizzle-kit-push limitation.
  {
    name: 'trinity_self_awareness_id_default',
    rationale: 'trinity_self_awareness.id default missing — upsertFact INSERTs omit id and rely on gen_random_uuid()',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'trinity_self_awareness' AND column_name = 'id'
           AND column_default LIKE '%gen_random_uuid%'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(
        `ALTER TABLE trinity_self_awareness ALTER COLUMN id SET DEFAULT gen_random_uuid()::text`
      );
    },
  },
  {
    name: 'trinity_self_awareness_category_key_unique',
    rationale: 'ON CONFLICT (category, fact_key) target in trinitySelfAwarenessService.upsertFact requires this unique index — 17 upsert errors at boot when missing',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM pg_indexes
         WHERE tablename = 'trinity_self_awareness'
           AND indexname = 'tsa_category_key_unique'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      // Drop any partial duplicates that would violate the new unique
      // constraint before installing it. Without this, ON a re-deploy where
      // the bootstrap failed previously and duplicates accumulated, the
      // CREATE would error.
      await pool.query(`
        DELETE FROM trinity_self_awareness a
        USING trinity_self_awareness b
        WHERE a.ctid < b.ctid
          AND a.category = b.category
          AND a.fact_key = b.fact_key
      `);
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS tsa_category_key_unique
           ON trinity_self_awareness (category, fact_key)`
      );
    },
  },
  {
    name: 'shifts_version_column',
    rationale: 'Optimistic locking for concurrent shift edits (TRINITY.md §15)',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'shifts' AND column_name = 'version'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(
        `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1`
      );
    },
  },
  // ── PHASE U: SchemaParity-SKIP bypass (production log forensics 2026-04-08) ──
  //
  // SchemaParityService.autoFix() at server/services/schemaParityService.ts:161
  // marks a missing column as `autoFixable: hasDefault || isNullable`. The
  // 18 columns below are declared in the Drizzle schema as NOT NULL with
  // no default, so the auto-fix marks them `autoFixable: false` and SKIPS
  // them every boot — emitting the notorious
  //     "Auto-fix complete: 0 fixed, 0 failed, 21 skipped"
  // line while the live database stays permanently broken. Every INSERT
  // that touches these tables aborts ("column does not exist") and
  // cascades into the audit-log / UniversalStepLogger / RLRepo error
  // storm on every automation cycle.
  //
  // Fix: add the columns UNCONDITIONALLY on boot, as NULLABLE (so existing
  // rows don't violate a new NOT NULL). The Drizzle INSERTs will always
  // provide values, so the nullable-ness in the live DB is a harmless
  // divergence from the schema declaration — NOT NULL is still enforced
  // at the application layer by Zod + Drizzle. Safer than either (a)
  // leaving the column missing or (b) trying to tighten NOT NULL on a
  // populated table without a default.
  //
  // `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is idempotent — once the
  // column exists, subsequent boots skip the operation silently.
  //
  // This entry is a belt-and-suspenders fallback to scanMissingColumns()
  // below. If the generic scanner catches these first, this no-ops.
  // If anything prevents the generic scanner from reaching these tables
  // (import resolution, getTableConfig throw, etc.), this explicit list
  // still runs because it bypasses all introspection.
  {
    name: 'missing_columns_phase_u_explicit',
    rationale: 'Explicitly add 18 columns declared in Drizzle but missing from live DB because SchemaParity.autoFix skips NOT-NULL-without-default columns (production log forensics).',
    isPresent: async () => {
      // Present only when EVERY target column is already in the live DB.
      const targets: Array<[string, string]> = [
        ['ai_brain_action_logs', 'action_type'],
        ['ai_workboard_tasks', 'task_type'],
        ['client_contract_access_tokens', 'workspace_id'],
        ['contractor_pool', 'workspace_id'],
        ['deals', 'workspace_id'],
        ['email_templates', 'workspace_id'],
        ['governance_approvals', 'workspace_id'],
        ['helpos_faqs', 'workspace_id'],
        ['internal_emails', 'workspace_id'],
        ['key_rotation_history', 'key_type'],
        ['managed_api_keys', 'key_name'],
        ['message_reactions', 'workspace_id'],
        ['onboarding_tasks', 'workspace_id'],
        ['rfps', 'workspace_id'],
        ['training_attempts', 'workspace_id'],
        ['training_attempts', 'employee_id'],
        ['training_attempts', 'module_id'],
        ['training_modules', 'category'],
      ];
      const { rows } = await pool.query(
        `SELECT table_name, column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND (table_name, column_name) IN (${targets.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')})`,
        targets.flat(),
      );
      return rows.length === targets.length;
    },
    apply: async () => {
      // Each ALTER is wrapped in its own try so a single failure (e.g.
      // parent table missing because an earlier bootstrap failed) does
      // not abort the entire pass. Added as NULLABLE — see the block
      // comment above for why.
      const additions: Array<{ table: string; column: string; type: string }> = [
        { table: 'ai_brain_action_logs', column: 'action_type', type: 'varchar(100)' },
        { table: 'ai_workboard_tasks', column: 'task_type', type: 'varchar(100)' },
        { table: 'client_contract_access_tokens', column: 'workspace_id', type: 'varchar' },
        { table: 'contractor_pool', column: 'workspace_id', type: 'varchar' },
        { table: 'deals', column: 'workspace_id', type: 'varchar' },
        { table: 'email_templates', column: 'workspace_id', type: 'varchar' },
        { table: 'governance_approvals', column: 'workspace_id', type: 'varchar' },
        { table: 'helpos_faqs', column: 'workspace_id', type: 'varchar' },
        { table: 'internal_emails', column: 'workspace_id', type: 'varchar' },
        { table: 'key_rotation_history', column: 'key_type', type: 'varchar(100)' },
        { table: 'managed_api_keys', column: 'key_name', type: 'varchar(255)' },
        { table: 'message_reactions', column: 'workspace_id', type: 'varchar' },
        { table: 'onboarding_tasks', column: 'workspace_id', type: 'varchar' },
        { table: 'rfps', column: 'workspace_id', type: 'varchar' },
        { table: 'training_attempts', column: 'workspace_id', type: 'varchar' },
        { table: 'training_attempts', column: 'employee_id', type: 'varchar' },
        { table: 'training_attempts', column: 'module_id', type: 'varchar' },
        { table: 'training_modules', column: 'category', type: 'varchar(100)' },
      ];
      let added = 0;
      let skipped = 0;
      let failed = 0;
      for (const a of additions) {
        try {
          // First verify the parent table exists — skip cleanly if not
          // (better than erroring on a missing table for a feature that
          // isn't installed in this environment).
          const { rows: tableRows } = await pool.query(
            `SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = $1`,
            [a.table],
          );
          if (tableRows.length === 0) {
            log.warn(
              `[phaseU] Parent table ${a.table} missing — cannot add ${a.column}`,
            );
            skipped++;
            continue;
          }
          await pool.query(
            `ALTER TABLE "${a.table}" ADD COLUMN IF NOT EXISTS "${a.column}" ${a.type}`,
          );
          log.info(`[phaseU] ensured ${a.table}.${a.column} (${a.type})`);
          added++;
        } catch (err: any) {
          failed++;
          log.warn(
            `[phaseU] Failed on ${a.table}.${a.column}: ${err?.message?.slice(0, 160)}`,
          );
        }
      }
      log.info(
        `[phaseU] explicit column backfill: ${added} ensured, ${skipped} skipped (missing table), ${failed} failed`,
      );
    },
  },
  {
    name: 'no_overlapping_employee_shifts',
    rationale: 'Sole atomic enforcement of shift overlap prevention (RC5 Phase 2 — see shiftRoutes.ts). Picks tsrange vs tstzrange at install time based on the live start_time/end_time column type so the GIST expression stays IMMUTABLE.',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_employee_shifts'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      // CRITICAL: `tstzrange(start_time, end_time)` requires timestamptz
      // columns. If start_time / end_time are declared as `timestamp`
      // without time zone (which the Drizzle schema currently does at
      // shared/schema/domains/scheduling/index.ts:113-114), PostgreSQL
      // inserts an implicit `timestamp → timestamptz` cast into the
      // GIST expression. That cast is STABLE (depends on the session
      // `TimeZone` GUC), NOT IMMUTABLE — and PostgreSQL refuses to use
      // non-immutable functions in an index expression with:
      //
      //   "functions in index expression must be marked IMMUTABLE"
      //
      // Fix: detect the live column type and pick the matching range
      // constructor. Both `tsrange` and `tstzrange` are IMMUTABLE when
      // called with arguments of their native type.
      const { rows } = await pool.query(`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'shifts'
          AND column_name = 'start_time'
        LIMIT 1
      `);
      const liveType = (rows[0]?.data_type || '').toLowerCase();
      const rangeFn = liveType.includes('with time zone') ? 'tstzrange' : 'tsrange';
      log.info(
        `[criticalConstraints] shifts.start_time live type is "${liveType}" — using ${rangeFn} for no_overlapping_employee_shifts`
      );
      // Scoped by (workspace_id, employee_id), ranged by (start_time, end_time).
      // Cancelled and denied shifts are excluded so a replacement shift can
      // occupy the same window as a previously-rejected one.
      await pool.query(`
        ALTER TABLE shifts
          ADD CONSTRAINT no_overlapping_employee_shifts
          EXCLUDE USING gist (
            workspace_id WITH =,
            employee_id  WITH =,
            ${rangeFn}(start_time, end_time, '[)') WITH &&
          )
          WHERE (
            employee_id IS NOT NULL
            AND status NOT IN ('cancelled', 'denied')
          )
      `);
    },
  },
  {
    name: 'shifts_deleted_at_column',
    rationale: 'Soft-delete column added after initial schema definition; ALTER TABLE is idempotent via IF NOT EXISTS',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'shifts' AND column_name = 'deleted_at'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      await pool.query(`ALTER TABLE shifts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
    },
  },
];

/**
 * GENERIC ID-DEFAULT BACKFILL
 *
 * Drizzle declares varchar("id").primaryKey().default(sql`gen_random_uuid()`)
 * for ~650 tables across the schema, but drizzle-kit push does NOT propagate
 * the SQL default to varchar columns (only to its native uuid type). The
 * result is a NOT NULL violation on every INSERT that omits id — the root
 * cause of the spam in production logs:
 *   - "Failed to log to database" (UniversalStepLogger)
 *   - "Failed to persist alert" (TrinityNotifier)
 *   - "Failed to record thought" (TrinityThoughtEngine)
 *   - "Failed to create execution" (AutomationExecutionTracker)
 *   - "[TrinityOrchestrationGateway] Flush error" (every 30s)
 *   - "Audit log failed" (every cron tick)
 *
 * Adding 650 individual bootstrap entries is impractical. This generic
 * backfill scans pg_attribute for every text/varchar `id` column on a
 * non-system schema table that lacks a default and applies
 * `gen_random_uuid()::text` to it in one pass. Idempotent — once a column
 * has the default, subsequent runs skip it via the WHERE clause.
 */
async function backfillGenRandomUuidDefaults(): Promise<{ scanned: number; patched: number; failed: number }> {
  let scanned = 0;
  let patched = 0;
  let failed = 0;
  try {
    const { rows } = await pool.query(`
      SELECT c.table_schema, c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND c.column_name = 'id'
        AND c.data_type IN ('character varying', 'text')
        AND (c.column_default IS NULL OR c.column_default = '')
    `);
    scanned = rows.length;
    for (const r of rows) {
      try {
        await pool.query(
          `ALTER TABLE "${r.table_name}" ALTER COLUMN id SET DEFAULT gen_random_uuid()::text`
        );
        patched++;
      } catch (err: any) {
        failed++;
        log.warn(`[idDefaultBackfill] Failed on ${r.table_name}.id: ${err?.message?.slice(0, 120)}`);
      }
    }
  } catch (err: any) {
    log.error(`[idDefaultBackfill] Scan failed: ${err?.message}`);
  }
  return { scanned, patched, failed };
}

/**
 * GENERIC NOT NULL DRIFT SCANNER
 *
 * Root cause (same class as the varchar id-default issue): drizzle-kit
 * push did not reliably propagate nullability changes from the Drizzle
 * schema to the live database. Many tables have columns marked
 * `notNull: false` in the Drizzle schema but NOT NULL in the live DB,
 * left over from previous schema migrations. Every write that omits
 * such a column fails with "null value in column ... violates not-null
 * constraint". Individual symptoms we've seen include:
 *   - audit_logs.user_id / user_email / user_role
 *   - Trinity flush errors on trinity_requests (and related)
 *   - UniversalStepLogger write failures
 *   - Gap finding persistence failures
 *
 * This scanner uses Drizzle's getTableConfig() to introspect the
 * schema at runtime, enumerate every column each imported table
 * declares as nullable, and drop the NOT NULL constraint on any
 * matching column in the live DB. Idempotent — subsequent runs skip
 * columns that already match.
 *
 * We explicitly DO NOT touch:
 *   - Columns that have `notNull: true` in Drizzle (legitimately required)
 *   - Columns whose live DB is_nullable is already 'YES' (no drift)
 *   - Columns named 'id' (primary keys are correctly NOT NULL)
 *   - Columns named 'created_at' / 'updated_at' when they have a default
 *     (typically NOT NULL with defaultNow(), which Drizzle also declares
 *     NOT NULL so they won't be in our scan set anyway)
 */
/**
 * GENERIC TIMESTAMP defaultNow() BACKFILL
 *
 * Same root cause class as the varchar id-default and NOT NULL drift
 * issues: drizzle-kit push didn't reliably propagate default expressions
 * to the live DB on some columns. Many tables have timestamp columns
 * declared `defaultNow().notNull()` in Drizzle but no DEFAULT in the
 * live DB. INSERTs that omit the timestamp then fail with
 * "null value in column ... violates not-null constraint".
 *
 * Concrete example: token_usage_log.timestamp errored every time
 * TokenUsageService.recordUsage() ran (every Trinity action, every
 * email classification, every metered API call).
 *
 * This scanner finds every NOT NULL timestamp column on any
 * Drizzle-mapped table that lacks a DEFAULT in the live DB and adds
 * DEFAULT NOW(). Idempotent — subsequent runs skip columns that
 * already have a default.
 */
async function scanTimestampDefaultDrift(schemaTables: Record<string, unknown>): Promise<{
  tablesScanned: number;
  columnsChecked: number;
  columnsPatched: number;
  columnsFailed: number;
}> {
  const result = { tablesScanned: 0, columnsChecked: 0, columnsPatched: 0, columnsFailed: 0 };

  for (const [, value] of Object.entries(schemaTables)) {
    if (!value || typeof value !== 'object') continue;
    if (!(value instanceof PgTable)) continue;

    let tableCfg;
    try {
      tableCfg = getTableConfig(value as PgTable);
    } catch {
      continue;
    }
    if (tableCfg.schema && tableCfg.schema !== 'public') continue;
    result.tablesScanned++;

    // Find columns that:
    //   - Drizzle marks as NOT NULL
    //   - Drizzle says hasDefault: true (so the schema author expected
    //     a default value to be applied automatically)
    //   - Are timestamp / timestamptz / date type
    const candidateColumnNames: string[] = [];
    for (const col of tableCfg.columns) {
      if (!col.notNull) continue;
      if (!(col as any).hasDefault) continue;
      const colType = (col as any).columnType?.toLowerCase?.() ?? '';
      const dataType = (col as any).dataType?.toLowerCase?.() ?? '';
      const isTimeType =
        colType.includes('timestamp') ||
        dataType.includes('timestamp') ||
        colType === 'pgdate' ||
        dataType === 'date';
      if (!isTimeType) continue;
      candidateColumnNames.push(col.name);
    }
    if (candidateColumnNames.length === 0) continue;
    result.columnsChecked += candidateColumnNames.length;

    let driftRows;
    try {
      const { rows } = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = $1
           AND column_name = ANY($2::text[])
           AND (column_default IS NULL OR column_default = '')`,
        [tableCfg.name, candidateColumnNames]
      );
      driftRows = rows;
    } catch (err: any) {
      log.warn(`[timestampDefaultDrift] Failed to scan ${tableCfg.name}: ${err?.message?.slice(0, 120)}`);
      continue;
    }

    for (const r of driftRows) {
      try {
        await pool.query(
          `ALTER TABLE "${tableCfg.name}" ALTER COLUMN "${r.column_name}" SET DEFAULT NOW()`
        );
        result.columnsPatched++;
        log.info(`[timestampDefaultDrift] set DEFAULT NOW() on ${tableCfg.name}.${r.column_name}`);
      } catch (err: any) {
        result.columnsFailed++;
        log.warn(`[timestampDefaultDrift] Failed on ${tableCfg.name}.${r.column_name}: ${err?.message?.slice(0, 120)}`);
      }
    }
  }
  return result;
}

/**
 * GENERIC MISSING-COLUMN DRIFT SCANNER
 *
 * Same root cause class as the other drift scanners: drizzle-kit push
 * does not reliably propagate ADD COLUMN changes to the live database
 * when the column was added after the table already existed. Columns
 * the application expects (and writes to on every cycle) end up missing
 * from the live schema, producing cascading "undefined column" errors
 * across every write path that touches the table.
 *
 * Concrete example: `ai_brain_action_logs.action_type` — Drizzle declares
 * it as `varchar(100) NOT NULL`, but drizzle-kit push never added it to
 * the live Railway database. Every INSERT into the table failed, which
 * cascaded into:
 *   - "Audit log failed" (platformEventBus)
 *   - "Audit log persistence failed" (autonomousScheduler)
 *   - "[UniversalStepLogger] Failed to log to database"
 *   - "[HelpAIProactiveMonitor] Cycle error"
 * Every single automation cycle produced 8-12 of these errors on loop.
 *
 * This scanner walks every Drizzle-declared table via `getTableConfig()`,
 * queries `information_schema.columns` to find columns declared in the
 * schema but missing from the live DB, and runs idempotent
 * `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` using the column's own
 * `getSQLType()` method so the added column matches Drizzle exactly.
 *
 * Guard rails:
 *   - Only ADDs columns — never drops, never changes existing type
 *   - Uses ADD COLUMN IF NOT EXISTS so concurrent bootstraps are safe
 *   - If the Drizzle column has a default, applies it (so existing rows
 *     backfill cleanly and NOT NULL constraints don't fail)
 *   - If the Drizzle column is NOT NULL with no default, the column is
 *     added as NULL-allowed and then tightened to NOT NULL only if the
 *     table is empty — otherwise leave as nullable and log a warning so
 *     ops can fix it manually (we never want to block an INSERT on a
 *     drift-recovery step that nukes data)
 *   - System tables (information_schema, pg_catalog) are skipped
 *   - If `getSQLType()` throws for any reason, that column is skipped
 *     and logged (better to leave the drift than crash the scanner)
 */
async function scanMissingColumns(schemaTables: Record<string, unknown>): Promise<{
  tablesScanned: number;
  columnsChecked: number;
  columnsAdded: number;
  columnsFailed: number;
}> {
  const result = { tablesScanned: 0, columnsChecked: 0, columnsAdded: 0, columnsFailed: 0 };

  for (const [, value] of Object.entries(schemaTables)) {
    if (!value || typeof value !== 'object') continue;
    if (!(value instanceof PgTable)) continue;

    let tableCfg;
    try {
      tableCfg = getTableConfig(value as PgTable);
    } catch {
      continue;
    }
    if (tableCfg.schema && tableCfg.schema !== 'public') continue;
    result.tablesScanned++;

    // Build the set of column names Drizzle declares for this table
    const declaredColumns = tableCfg.columns;
    if (declaredColumns.length === 0) continue;
    const declaredNames = declaredColumns.map((c) => c.name);
    result.columnsChecked += declaredNames.length;

    // Find which of those columns are actually present in the live DB
    let liveRows: Array<{ column_name: string }>;
    try {
      const { rows } = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = $1
           AND column_name = ANY($2::text[])`,
        [tableCfg.name, declaredNames]
      );
      liveRows = rows;
    } catch (err: any) {
      log.warn(`[missingColumnDrift] Failed to scan ${tableCfg.name}: ${err?.message?.slice(0, 120)}`);
      continue;
    }
    const livePresent = new Set(liveRows.map((r) => r.column_name));

    // Anything declared in Drizzle but absent from the live DB is drift
    const missing = declaredColumns.filter((c) => !livePresent.has(c.name));
    if (missing.length === 0) continue;

    for (const col of missing) {
      let sqlType: string;
      try {
        // `.getSQLType()` is a public method on every PgColumn subclass
        // (varchar, text, integer, timestamp, jsonb, etc.) and returns
        // the exact SQL type string we need for ADD COLUMN.
        sqlType = (col as any).getSQLType();
      } catch (err: any) {
        log.warn(
          `[missingColumnDrift] ${tableCfg.name}.${col.name}: could not resolve SQL type (${err?.message?.slice(0, 80)}), skipping`
        );
        result.columnsFailed++;
        continue;
      }
      if (!sqlType || typeof sqlType !== 'string') {
        log.warn(
          `[missingColumnDrift] ${tableCfg.name}.${col.name}: getSQLType returned empty, skipping`
        );
        result.columnsFailed++;
        continue;
      }

      // If Drizzle says the column has a default, pull it through so
      // backfills don't explode on NOT NULL.
      //
      // We do NOT try to serialize arbitrary `default` expressions (too
      // brittle across the Drizzle DSL). Instead we cover the three
      // real-world cases: literal scalar, sql`...` template, and none.
      let defaultClause = '';
      const anyCol = col as any;
      if (anyCol.hasDefault) {
        const def = anyCol.default;
        if (def && typeof def === 'object' && typeof def.queryChunks !== 'undefined') {
          // Drizzle sql`...` template: serialize the string chunks.
          try {
            const chunks = def.queryChunks as unknown[];
            const raw = chunks
              .map((c) => (typeof c === 'string' ? c : (c as any)?.value?.[0] ?? ''))
              .join('')
              .trim();
            if (raw) defaultClause = ` DEFAULT ${raw}`;
          } catch {
            // Give up and skip default — column added without it
          }
        } else if (typeof def === 'string') {
          defaultClause = ` DEFAULT ${pgQuoteLiteral(def)}`;
        } else if (typeof def === 'number' || typeof def === 'boolean') {
          defaultClause = ` DEFAULT ${String(def)}`;
        }
      }

      // Add the column NULL-allowed first (safe on non-empty tables).
      // Then, if Drizzle marks it NOT NULL AND we can populate it, tighten.
      // For NOT NULL columns with defaults, Postgres backfills on ALTER.
      const addSql = `ALTER TABLE "${tableCfg.name}" ADD COLUMN IF NOT EXISTS "${col.name}" ${sqlType}${defaultClause}`;

      try {
        await pool.query(addSql);
        result.columnsAdded++;
        log.info(
          `[missingColumnDrift] added column ${tableCfg.name}.${col.name} (${sqlType}${defaultClause ? ' w/ default' : ''})`
        );
      } catch (err: any) {
        result.columnsFailed++;
        log.warn(
          `[missingColumnDrift] Failed on ${tableCfg.name}.${col.name}: ${err?.message?.slice(0, 160)}`
        );
        continue;
      }

      // If the column is NOT NULL per Drizzle AND we have a default,
      // tighten the constraint. If no default, leave it nullable —
      // tightening on an existing non-empty table without a default
      // would throw and roll back the whole scan.
      if (col.notNull && defaultClause) {
        try {
          await pool.query(
            `ALTER TABLE "${tableCfg.name}" ALTER COLUMN "${col.name}" SET NOT NULL`
          );
          log.info(
            `[missingColumnDrift] tightened ${tableCfg.name}.${col.name} to NOT NULL`
          );
        } catch (err: any) {
          log.warn(
            `[missingColumnDrift] Could not tighten ${tableCfg.name}.${col.name} to NOT NULL (existing NULL rows?): ${err?.message?.slice(0, 120)}`
          );
        }
      }
    }
  }
  return result;
}

/**
 * Escape a string value for inline inclusion in a SQL DEFAULT clause.
 * Used only by scanMissingColumns for literal-string defaults. Not a
 * general-purpose SQL escape.
 */
function pgQuoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function scanNotNullDrift(schemaTables: Record<string, unknown>): Promise<{
  tablesScanned: number;
  columnsChecked: number;
  columnsPatched: number;
  columnsFailed: number;
}> {
  const result = { tablesScanned: 0, columnsChecked: 0, columnsPatched: 0, columnsFailed: 0 };

  for (const [exportName, value] of Object.entries(schemaTables)) {
    // Filter out non-table exports (enums, schemas, insertSchemas, types, etc)
    if (!value || typeof value !== 'object') continue;
    if (!(value instanceof PgTable)) continue;

    let tableCfg;
    try {
      tableCfg = getTableConfig(value as PgTable);
    } catch {
      continue;
    }
    // Only scan public-schema base tables
    if (tableCfg.schema && tableCfg.schema !== 'public') continue;

    result.tablesScanned++;
    const nullableColumnNames: string[] = [];
    for (const col of tableCfg.columns) {
      // Only scan columns the Drizzle schema declares as NULLABLE
      if (col.notNull) continue;
      nullableColumnNames.push(col.name);
    }
    if (nullableColumnNames.length === 0) continue;

    // Single query per table: find columns that are NOT NULL in live DB
    // AND appear in the Drizzle-nullable list
    let driftRows;
    try {
      const { rows } = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = $1
           AND is_nullable = 'NO'
           AND column_name = ANY($2::text[])`,
        [tableCfg.name, nullableColumnNames]
      );
      driftRows = rows;
    } catch (err: any) {
      log.warn(`[notNullDrift] Failed to scan ${tableCfg.name}: ${err?.message?.slice(0, 120)}`);
      continue;
    }

    result.columnsChecked += nullableColumnNames.length;
    for (const r of driftRows) {
      try {
        await pool.query(
          `ALTER TABLE "${tableCfg.name}" ALTER COLUMN "${r.column_name}" DROP NOT NULL`
        );
        result.columnsPatched++;
        log.info(`[notNullDrift] dropped NOT NULL on ${tableCfg.name}.${r.column_name} (schema says nullable, live DB had NOT NULL)`);
      } catch (err: any) {
        result.columnsFailed++;
        log.warn(`[notNullDrift] Failed on ${tableCfg.name}.${r.column_name}: ${err?.message?.slice(0, 120)}`);
      }
    }
  }
  return result;
}

export async function ensureCriticalConstraints(): Promise<void> {
  log.info(`[criticalConstraints] Verifying ${constraints.length} critical constraints`);
  let installed = 0;
  let alreadyPresent = 0;
  let failed = 0;

  for (const c of constraints) {
    try {
      const present = await c.isPresent();
      if (present) {
        alreadyPresent++;
        continue;
      }
      log.warn(`[criticalConstraints] MISSING: ${c.name} — installing now (${c.rationale})`);
      await c.apply();
      installed++;
      log.info(`[criticalConstraints] Installed: ${c.name}`);
    } catch (err: any) {
      failed++;
      log.error(`[criticalConstraints] Failed to install ${c.name}: ${err?.message}`, { error: err });
    }
  }

  log.info(
    `[criticalConstraints] Complete: ${alreadyPresent} already present, ${installed} installed, ${failed} failed`
  );

  // Generic id-default backfill — patches any varchar/text id column on a
  // public-schema table that lacks a default. Idempotent and self-skipping.
  const back = await backfillGenRandomUuidDefaults();
  if (back.scanned > 0) {
    log.info(
      `[idDefaultBackfill] Scanned ${back.scanned} columns missing id defaults — patched ${back.patched}, failed ${back.failed}`
    );
  } else {
    log.info(`[idDefaultBackfill] All public-schema id columns have defaults — no patches needed`);
  }

  // Generic schema drift scanners — all lazy-import @shared/schema once
  // and use Drizzle's getTableConfig() to introspect every table at runtime.
  // Three distinct drift modes are checked, in this order:
  //   1. MISSING COLUMNS — column is declared in the Drizzle schema but
  //      absent from the live DB. Adds the column via ALTER TABLE ADD
  //      COLUMN IF NOT EXISTS. This must run FIRST so the NOT NULL and
  //      timestamp-default scanners below can operate on complete tables.
  //   2. NOT NULL drift — column is NOT NULL in live DB but the Drizzle
  //      schema declares it nullable. Drops the constraint.
  //   3. Timestamp default drift — column is NOT NULL with a Drizzle
  //      `defaultNow()` annotation but no DEFAULT in the live DB.
  //      Adds DEFAULT NOW().
  // All three are root causes for the drizzle-kit-push-skipped-something
  // class of errors that have been hitting production logs.
  try {
    const schemaModule = await import('@shared/schema');
    const schemaRecord = schemaModule as Record<string, unknown>;

    const missingDrift = await scanMissingColumns(schemaRecord);
    if (missingDrift.columnsAdded > 0 || missingDrift.columnsFailed > 0) {
      log.info(
        `[missingColumnDrift] Scanned ${missingDrift.tablesScanned} tables, ${missingDrift.columnsChecked} declared columns — added ${missingDrift.columnsAdded}, failed ${missingDrift.columnsFailed}`
      );
    } else {
      log.info(
        `[missingColumnDrift] Scanned ${missingDrift.tablesScanned} tables, ${missingDrift.columnsChecked} declared columns — no drift detected`
      );
    }

    const nullDrift = await scanNotNullDrift(schemaRecord);
    if (nullDrift.columnsPatched > 0 || nullDrift.columnsFailed > 0) {
      log.info(
        `[notNullDrift] Scanned ${nullDrift.tablesScanned} tables, ${nullDrift.columnsChecked} nullable columns — patched ${nullDrift.columnsPatched}, failed ${nullDrift.columnsFailed}`
      );
    } else {
      log.info(
        `[notNullDrift] Scanned ${nullDrift.tablesScanned} tables, ${nullDrift.columnsChecked} nullable columns — no drift detected`
      );
    }

    const tsDrift = await scanTimestampDefaultDrift(schemaRecord);
    if (tsDrift.columnsPatched > 0 || tsDrift.columnsFailed > 0) {
      log.info(
        `[timestampDefaultDrift] Scanned ${tsDrift.tablesScanned} tables, ${tsDrift.columnsChecked} candidate columns — patched ${tsDrift.columnsPatched}, failed ${tsDrift.columnsFailed}`
      );
    } else {
      log.info(
        `[timestampDefaultDrift] Scanned ${tsDrift.tablesScanned} tables, ${tsDrift.columnsChecked} candidate columns — no drift detected`
      );
    }
  } catch (err: any) {
    log.error(`[schemaDrift] Scan failed: ${err?.message}`, { error: err });
  }
}
