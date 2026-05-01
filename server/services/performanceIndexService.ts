/**
 * PERFORMANCE INDEX SERVICE — Phase 39
 * =====================================
 * Ensures all high-frequency query columns have CONCURRENT indexes.
 * Runs at startup after DB probe confirms connection is live.
 * All indexes are IF NOT EXISTS — safe to re-run on every startup.
 * All CREATE INDEX use CONCURRENTLY — non-blocking on production tables.
 *
 * Covered tables (most frequently queried in a 300-officer deployment):
 *  employees, shifts, time_entries, notifications, audit_log,
 *  shift_acceptance_records, payroll_runs, incidents, durable_job_queue,
 *  data_subject_requests, retention_policies, sra_audit_log
 */

import { pool } from '../db';
import { createLogger } from '../lib/logger';

const log = createLogger('PerformanceIndex');

interface IndexDefinition {
  name: string;
  table: string;
  columns: string;
  where?: string;
  unique?: boolean;
}

// ── High-priority index definitions ──────────────────────────────────────────
// Every entry here is idempotent (IF NOT EXISTS) and non-blocking (CONCURRENTLY)
const CRITICAL_INDEXES: IndexDefinition[] = [
  // ── employees ──────────────────────────────────────────────────────────────
  { name: 'idx_employees_workspace_id',      table: 'employees',        columns: 'workspace_id' },
  { name: 'idx_employees_user_id',           table: 'employees',        columns: 'user_id' },
  { name: 'idx_employees_status',            table: 'employees',        columns: 'status' },
  { name: 'idx_employees_ws_status',         table: 'employees',        columns: 'workspace_id, status' },

  // ── shifts ─────────────────────────────────────────────────────────────────
  { name: 'idx_shifts_workspace_id',         table: 'shifts',           columns: 'workspace_id' },
  { name: 'idx_shifts_employee_id',          table: 'shifts',           columns: 'employee_id' },
  { name: 'idx_shifts_date',                 table: 'shifts',           columns: 'date' },
  { name: 'idx_shifts_ws_date',              table: 'shifts',           columns: 'workspace_id, date' },
  { name: 'idx_shifts_status',               table: 'shifts',           columns: 'status' },
  { name: 'idx_shifts_site_id',              table: 'shifts',           columns: 'site_id' },

  // ── time_entries ───────────────────────────────────────────────────────────
  { name: 'idx_time_entries_workspace_id',   table: 'time_entries',     columns: 'workspace_id' },
  { name: 'idx_time_entries_employee_id',    table: 'time_entries',     columns: 'employee_id' },
  { name: 'idx_time_entries_clock_in',       table: 'time_entries',     columns: 'clock_in_at' },
  { name: 'idx_time_entries_ws_emp',         table: 'time_entries',     columns: 'workspace_id, employee_id' },
  { name: 'idx_time_entries_status',         table: 'time_entries',     columns: 'status' },

  // ── notifications (NDS) ────────────────────────────────────────────────────
  { name: 'idx_notifications_workspace_id',  table: 'notifications',    columns: 'workspace_id' },
  { name: 'idx_notifications_user_id',       table: 'notifications',    columns: 'user_id' },
  { name: 'idx_notifications_is_read',       table: 'notifications',    columns: 'is_read',     where: 'is_read = false' },
  { name: 'idx_notifications_created_at',    table: 'notifications',    columns: 'created_at' },
  { name: 'idx_notifications_ws_user',       table: 'notifications',    columns: 'workspace_id, user_id' },

  // ── audit_log ──────────────────────────────────────────────────────────────
  { name: 'idx_audit_log_workspace_id',      table: 'audit_log',        columns: 'workspace_id' },
  { name: 'idx_audit_log_user_id',           table: 'audit_log',        columns: 'user_id' },
  { name: 'idx_audit_log_created_at',        table: 'audit_log',        columns: 'created_at' },
  { name: 'idx_audit_log_event_type',        table: 'audit_log',        columns: 'event_type' },

  // ── sra_audit_log (Phase 22 — regulatory portal) ──────────────────────────
  // Column name is `timestamp`, not `created_at`. All live queries (statusRoutes,
  // privacyRoutes, searchRoutes) use the `timestamp` column. Railway log forensics
  // 2026-04-08.
  { name: 'idx_sra_audit_log_workspace_id',  table: 'sra_audit_log',    columns: 'workspace_id' },
  { name: 'idx_sra_audit_log_user_id',       table: 'sra_audit_log',    columns: 'user_id' },
  { name: 'idx_sra_audit_log_timestamp',     table: 'sra_audit_log',    columns: 'timestamp' },

  // ── payroll_runs ───────────────────────────────────────────────────────────
  { name: 'idx_payroll_runs_workspace_id',   table: 'payroll_runs',     columns: 'workspace_id' },
  { name: 'idx_payroll_runs_status',         table: 'payroll_runs',     columns: 'status' },
  { name: 'idx_payroll_runs_ws_status',      table: 'payroll_runs',     columns: 'workspace_id, status' },

  // ── incidents (RMS) ────────────────────────────────────────────────────────
  { name: 'idx_incidents_workspace_id',      table: 'incidents',        columns: 'workspace_id' },
  { name: 'idx_incidents_reported_at',       table: 'incidents',        columns: 'reported_at' },
  { name: 'idx_incidents_status',            table: 'incidents',        columns: 'status' },

  // ── durable_job_queue (NDS / Phase 26) ────────────────────────────────────
  { name: 'idx_job_queue_status',            table: 'durable_job_queue', columns: 'status' },
  { name: 'idx_job_queue_workspace_id',      table: 'durable_job_queue', columns: 'workspace_id' },
  { name: 'idx_job_queue_run_at',            table: 'durable_job_queue', columns: 'run_at' },
  { name: 'idx_job_queue_pending',           table: 'durable_job_queue', columns: 'status, run_at', where: "status = 'pending'" },

  // ── data_subject_requests (Phase 36 — GDPR/CCPA) ─────────────────────────
  { name: 'idx_dsr_workspace_id',            table: 'data_subject_requests', columns: 'workspace_id' },
  { name: 'idx_dsr_status',                  table: 'data_subject_requests', columns: 'status' },
  { name: 'idx_dsr_created_at',              table: 'data_subject_requests', columns: 'created_at' },

  // ── analytics_daily_snapshots (Phase 34 BI) ───────────────────────────────
  { name: 'idx_analytics_ws_date',           table: 'analytics_daily_snapshots', columns: 'workspace_id, snapshot_date' },
  { name: 'idx_analytics_date',              table: 'analytics_daily_snapshots', columns: 'snapshot_date' },

  // ── workspace_subscriptions (Phase 41) ────────────────────────────────────
  { name: 'idx_ws_subs_workspace_id',        table: 'workspace_subscriptions', columns: 'workspace_id' },
  { name: 'idx_ws_subs_status',              table: 'workspace_subscriptions', columns: 'status' },
  { name: 'idx_ws_subs_stripe_sub_id',       table: 'workspace_subscriptions', columns: 'stripe_subscription_id' },
];

// ── Table existence check (skip indexes for tables that haven't been created yet)
async function tableExists(tableName: string): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT 1 FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
      [tableName]
    );
    return result.rowCount != null && result.rowCount > 0;
  } catch {
    return false;
  }
}

// ── Main index enforcement ─────────────────────────────────────────────────
export async function ensurePerformanceIndexes(): Promise<void> {
  log.info('[PerformanceIndex] Starting critical index enforcement...');
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const idx of CRITICAL_INDEXES) {
    try {
      const exists = await tableExists(idx.table);
      if (!exists) {
        skipped++;
        continue;
      }

      const whereClause = idx.where ? ` WHERE ${idx.where}` : '';
      const uniqueKeyword = idx.unique ? 'UNIQUE ' : '';

      // CONCURRENTLY: non-blocking — works on live tables without table locks
      // IF NOT EXISTS: safe to re-run on every startup
      await pool.query(
        `CREATE ${uniqueKeyword}INDEX CONCURRENTLY IF NOT EXISTS ${idx.name} ON ${idx.table} (${idx.columns})${whereClause}`
      );
      created++;
    } catch (err: unknown) {
      // Silently skip errors — column may not exist in older schema versions
      if (!err.message?.includes('column') && !err.message?.includes('does not exist')) {
        log.warn(`[PerformanceIndex] ${idx.name}: ${err.message?.substring(0, 80)}`);
      }
      errors++;
    }
  }

  log.info(`[PerformanceIndex] Index enforcement complete — ${created} ensured, ${skipped} skipped (table absent), ${errors} non-fatal errors`);
}

// ── NDS Queue Depth Monitoring ─────────────────────────────────────────────
const NDS_QUEUE_ALERT_THRESHOLD = 1000;

export async function checkNdsQueueDepth(): Promise<void> {
  try {
    const tabExists = await tableExists('durable_job_queue');
    if (!tabExists) return;

    const result = await pool.query(
      `SELECT COUNT(*) AS cnt FROM durable_job_queue WHERE status = 'pending'`
    );
    const depth = parseInt(result.rows[0]?.cnt ?? '0', 10);

    if (depth >= NDS_QUEUE_ALERT_THRESHOLD) {
      log.warn(`[NDS QueueAlert] Queue depth CRITICAL: ${depth} pending jobs (threshold: ${NDS_QUEUE_ALERT_THRESHOLD}). Possible delivery backlog.`);
    } else if (depth >= NDS_QUEUE_ALERT_THRESHOLD * 0.8) {
      log.warn(`[NDS QueueAlert] Queue depth WARNING: ${depth} pending jobs (${Math.round(depth / NDS_QUEUE_ALERT_THRESHOLD * 100)}% of alert threshold).`);
    }
  } catch {
    // Non-fatal — monitoring should never crash the server
  }
}

// Register NDS queue depth check — runs every 15 minutes
export function registerNdsQueueMonitor(): void {
  // Initial check after 30s warm-up
  setTimeout(() => checkNdsQueueDepth(), 30_000);
  // Then every 15 minutes
  setInterval(() => checkNdsQueueDepth(), 15 * 60_000);
  log.info('[NDS QueueAlert] Queue depth monitor registered (threshold: 1000, interval: 15 min)');
}
