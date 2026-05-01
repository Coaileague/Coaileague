/**
 * IDENTITY INTEGRITY BOOTSTRAP — Phase 22
 * ========================================
 * Guarantees that every tenant (workspace), end-user (employee), and client
 * has a persistent, workspace-scoped-unique, immutable universal identity
 * code. The codes are the backbone of how Trinity, HelpAI, and human
 * support agents identify callers across voice, SMS, email, and dockchat.
 *
 * What this module enforces:
 *
 *  1. Partial-unique indexes on the three identity columns so duplicates
 *     cannot be introduced at the DB layer, even from a direct SQL path
 *     that bypasses the application. Uniqueness is scoped by:
 *       - workspaces.org_id       — globally unique
 *       - employees.employee_number — unique per (workspace_id)
 *       - clients.client_number     — unique per (workspace_id)
 *
 *  2. An immutability trigger on each table that blocks any UPDATE that
 *     changes the identity column once it has been set, unless the session
 *     has the `app.identity_override = 'true'` GUC set. Authorized support
 *     staff set this GUC before issuing a rewrite and unset it immediately
 *     after — the legitimate conflict-resolution path.
 *
 *  3. A backfill sweep that looks for rows missing their universal ID and
 *     populates them idempotently. This heals any workspace / employee /
 *     client created before Phase 22 shipped, and also protects against
 *     code paths that forget to call the identityService helpers at
 *     creation time.
 *
 * All operations are idempotent — safe to re-run on every boot.
 */

import { pool } from '../db';
import { createLogger } from '../lib/logger';

const log = createLogger('identityIntegrityBootstrap');

// ── Uniqueness indexes ───────────────────────────────────────────────────────

const UNIQUE_INDEXES: Array<{ name: string; sql: string }> = [
  {
    name: 'workspaces_org_id_unique_idx',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS workspaces_org_id_unique_idx
            ON workspaces (org_id)
            WHERE org_id IS NOT NULL`,
  },
  {
    name: 'employees_employee_number_workspace_unique_idx',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS employees_employee_number_workspace_unique_idx
            ON employees (workspace_id, employee_number)
            WHERE employee_number IS NOT NULL`,
  },
  {
    name: 'clients_client_number_workspace_unique_idx',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS clients_client_number_workspace_unique_idx
            ON clients (workspace_id, client_number)
            WHERE client_number IS NOT NULL`,
  },
];

// ── Immutability trigger ─────────────────────────────────────────────────────
//
// The trigger function raises an exception when an UPDATE attempts to change
// an identity column that is already populated, unless the session has set
// `app.identity_override = 'true'`. Support staff rewrite path is the only
// legitimate caller — see rewriteUniversalId() in identityOverrideService.ts.

const TRIGGER_FUNCTION_SQL = `
CREATE OR REPLACE FUNCTION coaileague_identity_guard() RETURNS trigger AS $$
DECLARE
  override_flag text;
  col_name text := TG_ARGV[0];
  old_val text;
  new_val text;
BEGIN
  BEGIN
    override_flag := current_setting('app.identity_override', true);
  EXCEPTION WHEN OTHERS THEN
    override_flag := NULL;
  END;

  IF override_flag = 'true' THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', col_name, col_name)
    USING OLD, NEW INTO old_val, new_val;

  IF old_val IS NOT NULL
     AND old_val <> ''
     AND (new_val IS DISTINCT FROM old_val) THEN
    RAISE EXCEPTION
      'Identity column %.% is immutable once assigned (old=% new=%). '
      'Use authorized support override to rewrite.',
      TG_TABLE_NAME, col_name, old_val, new_val
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`;

interface IdentityTrigger {
  name: string;
  table: string;
  column: string;
}

const TRIGGERS: IdentityTrigger[] = [
  { name: 'workspaces_org_id_immutable', table: 'workspaces', column: 'org_id' },
  { name: 'employees_employee_number_immutable', table: 'employees', column: 'employee_number' },
  { name: 'clients_client_number_immutable', table: 'clients', column: 'client_number' },
];

async function ensureTriggerFunction(): Promise<void> {
  await pool.query(TRIGGER_FUNCTION_SQL);
}

async function ensureTrigger(t: IdentityTrigger): Promise<void> {
  // DROP + CREATE is idempotent and lets us change TG_ARGV without migration.
  await pool.query(`DROP TRIGGER IF EXISTS ${t.name} ON ${t.table}`);
  await pool.query(
    `CREATE TRIGGER ${t.name}
       BEFORE UPDATE OF ${t.column} ON ${t.table}
       FOR EACH ROW EXECUTE FUNCTION coaileague_identity_guard('${t.column}')`,
  );
}

// ── Backfill sweep ───────────────────────────────────────────────────────────
//
// Any row missing its universal ID gets one now. We call through the
// canonical helpers so sequences and externalIdentifiers stay coherent.

async function backfillMissingIds(): Promise<{
  workspaces: number;
  employees: number;
  clients: number;
  failed: number;
}> {
  let wsCount = 0;
  let empCount = 0;
  let cliCount = 0;
  let failed = 0;

  const identityService = await import('./identityService');

  // 1. Workspaces without an orgId. The helper writes via externalIdentifiers
  //    and also updates workspaces.org_code when set — the trigger we installed
  //    above will block any later drift.
  try {
    const { rows } = await pool.query(
      `SELECT id, name FROM workspaces
        WHERE (org_id IS NULL OR org_id = '')
          AND id IS NOT NULL
        LIMIT 500`,
    );
    for (const r of rows) {
      try {
        await identityService.ensureOrgIdentifiers(r.id, r.name || 'Organization');
        wsCount++;
      } catch (err: unknown) {
        failed++;
        log.warn(`[IdentityBackfill] Workspace ${r.id} backfill failed: ${err?.message?.slice(0, 200)}`);
      }
    }
  } catch (err: unknown) {
    log.error(`[IdentityBackfill] Workspace scan failed: ${err?.message}`);
  }

  // 2. Employees missing employee_number.
  try {
    const { rows } = await pool.query(
      `SELECT id, workspace_id FROM employees
        WHERE (employee_number IS NULL OR employee_number = '')
          AND workspace_id IS NOT NULL
        LIMIT 2000`,
    );
    for (const r of rows) {
      try {
        await identityService.attachEmployeeExternalId(r.id, r.workspace_id);
        empCount++;
      } catch (err: unknown) {
        failed++;
        log.warn(`[IdentityBackfill] Employee ${r.id} backfill failed: ${err?.message?.slice(0, 200)}`);
      }
    }
  } catch (err: unknown) {
    log.error(`[IdentityBackfill] Employee scan failed: ${err?.message}`);
  }

  // 3. Clients missing client_number.
  try {
    const { rows } = await pool.query(
      `SELECT id, workspace_id FROM clients
        WHERE (client_number IS NULL OR client_number = '')
          AND workspace_id IS NOT NULL
        LIMIT 2000`,
    );
    for (const r of rows) {
      try {
        await identityService.attachClientExternalId(r.id, r.workspace_id);
        cliCount++;
      } catch (err: unknown) {
        failed++;
        log.warn(`[IdentityBackfill] Client ${r.id} backfill failed: ${err?.message?.slice(0, 200)}`);
      }
    }
  } catch (err: unknown) {
    log.error(`[IdentityBackfill] Client scan failed: ${err?.message}`);
  }

  return { workspaces: wsCount, employees: empCount, clients: cliCount, failed };
}

// ── Public entry point ───────────────────────────────────────────────────────

// ── Phase 23 — identity PIN columns ──────────────────────────────────────────
// workspaces.owner_pin_hash and clients.client_pin_hash are declared in the
// Drizzle schema (orgs/index.ts, clients/index.ts) but drizzle-kit push does
// not always backfill new varchar columns on existing deployments. These ALTERs
// are idempotent via IF NOT EXISTS so they are safe to run on every boot.

async function ensurePinColumns(): Promise<void> {
  await pool.query(
    `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS owner_pin_hash VARCHAR`,
  );
  await pool.query(
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_pin_hash VARCHAR`,
  );
}

export async function ensureIdentityIntegrity(): Promise<void> {
  log.info('[identityIntegrity] Verifying universal identity invariants');

  let indexOk = 0;
  let triggerOk = 0;
  let failed = 0;

  try {
    await ensurePinColumns();
  } catch (err: unknown) {
    failed++;
    log.error(`[identityIntegrity] Failed to ensure PIN columns: ${err?.message}`);
  }

  for (const idx of UNIQUE_INDEXES) {
    try {
      await pool.query(idx.sql);
      indexOk++;
    } catch (err: unknown) {
      failed++;
      // Typical failure: a duplicate pre-existing row. Log and continue —
      // the backfill pass below may resolve it, but a manual review is
      // warranted because we cannot enforce uniqueness until the dup is gone.
      log.error(
        `[identityIntegrity] Failed to install ${idx.name}: ${err?.message?.slice(0, 300)}`,
      );
    }
  }

  try {
    await ensureTriggerFunction();
    for (const t of TRIGGERS) {
      try {
        await ensureTrigger(t);
        triggerOk++;
      } catch (err: unknown) {
        failed++;
        log.error(`[identityIntegrity] Failed to install trigger ${t.name}: ${err?.message}`);
      }
    }
  } catch (err: unknown) {
    failed++;
    log.error(`[identityIntegrity] Failed to install trigger function: ${err?.message}`);
  }

  const back = await backfillMissingIds();
  log.info(
    `[identityIntegrity] Indexes: ${indexOk}/${UNIQUE_INDEXES.length}, triggers: ${triggerOk}/${TRIGGERS.length}, backfilled workspaces=${back.workspaces} employees=${back.employees} clients=${back.clients} (failed=${back.failed}), bootstrap failures=${failed}`,
  );
}
