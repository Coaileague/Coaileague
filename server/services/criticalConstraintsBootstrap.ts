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
