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
  // ── Phase X: Optimistic locking column (CLAUDE.md §15) ─────────────────
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
    rationale: 'Optimistic locking for concurrent shift edits (CLAUDE.md §15)',
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
  {
    name: 'no_overlapping_employee_shifts',
    rationale: 'Sole atomic enforcement of shift overlap prevention (RC5 Phase 2 — see shiftRoutes.ts)',
    isPresent: async () => {
      const { rows } = await pool.query(
        `SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_employee_shifts'`
      );
      return rows.length > 0;
    },
    apply: async () => {
      // Scoped by (workspace_id, employee_id), ranged by (start_time, end_time).
      // Cancelled and denied shifts are excluded so a replacement shift can
      // occupy the same window as a previously-rejected one.
      await pool.query(`
        ALTER TABLE shifts
          ADD CONSTRAINT no_overlapping_employee_shifts
          EXCLUDE USING gist (
            workspace_id WITH =,
            employee_id  WITH =,
            tstzrange(start_time, end_time, '[)') WITH &&
          )
          WHERE (
            employee_id IS NOT NULL
            AND status NOT IN ('cancelled', 'denied')
          )
      `);
    },
  },
];

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
}
