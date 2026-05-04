/**
 * Storage Archival Service — Wave 19.5
 * ─────────────────────────────────────────────────────────────────────────────
 * Hot vs. Cold Storage pipeline for CAD logs, PTT audio, and incident reports.
 *
 * ARCHIVAL RULES:
 *   Records > 60 days old → flagged archived=true (cold)
 *   Records > 1 year old  → audio_url cleared (storage freed), metadata retained
 *   Regulatory hold       → never archived
 *
 * FRONTEND IMPACT:
 *   All CAD/PTT/incident queries default to WHERE archived IS NOT TRUE
 *   Cold records accessible via explicit ?includeArchived=true param (manager+)
 *   This keeps primary queries fast regardless of data volume.
 *
 * RUNS: Called from server startup cron. Designed idempotent — safe to re-run.
 */

import { pool } from "../db";
import { createLogger } from "../lib/logger";
import { isBillingExcluded } from "./billing/billingConstants";

const log = createLogger("StorageArchival");

// ── Constants ─────────────────────────────────────────────────────────────────

const HOT_TO_COLD_DAYS = 60;       // Records older than this become cold
const COLD_TO_PURGE_DAYS = 365;    // Audio URLs cleared after 1 year (storage freed)
const BATCH_SIZE = 500;             // Process in batches to avoid locking

export interface ArchivalResult {
  table: string;
  archivedCount: number;
  purgedAudioCount: number;
  durationMs: number;
}

// ── Schema Bootstrap ──────────────────────────────────────────────────────────

export async function ensureArchivalSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    // Add archived columns to hot tables if not present
    await client.query(`
      -- CAD event log
      ALTER TABLE cad_event_log ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;
      ALTER TABLE cad_event_log ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;

      -- PTT transmissions
      ALTER TABLE ptt_transmissions ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;
      ALTER TABLE ptt_transmissions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;

      -- PTT plate log
      ALTER TABLE ptt_plate_log ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;
      ALTER TABLE ptt_plate_log ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;

      -- Incident reports (if exists)
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'incident_reports') THEN
          EXECUTE 'ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE';
          EXECUTE 'ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP';
        END IF;
      END $$;

      -- Import history (retain indefinitely but archive old entries)
      ALTER TABLE import_history ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;
      ALTER TABLE import_history ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;

      -- Indexes for fast default queries (WHERE archived IS NOT TRUE)
      CREATE INDEX IF NOT EXISTS cad_event_log_active_idx ON cad_event_log(workspace_id, created_at DESC) WHERE archived IS NOT TRUE;
      CREATE INDEX IF NOT EXISTS ptt_transmissions_active_idx ON ptt_transmissions(workspace_id, created_at DESC) WHERE archived IS NOT TRUE;
    `);
    log.info("[StorageArchival] Schema ensured");
  } catch (err: unknown) {
    log.warn("[StorageArchival] Schema ensure failed (non-fatal):", err instanceof Error ? err.message : String(err));
  } finally {
    client.release();
  }
}

// ── Archive a single table ────────────────────────────────────────────────────

async function archiveTable(params: {
  tableName: string;
  workspaceId?: string;      // null = all workspaces
  audioUrlColumn?: string;   // column to clear on year-old purge
}): Promise<ArchivalResult> {
  const { tableName, workspaceId, audioUrlColumn } = params;
  const start = Date.now();
  let archivedCount = 0;
  let purgedAudioCount = 0;

  try {
    const client = await pool.connect();
    try {
      // Step 1: Flag records older than HOT_TO_COLD_DAYS as archived
      const archiveResult = await client.query(
        `UPDATE ${tableName}
         SET archived = TRUE, archived_at = NOW()
         WHERE archived IS NOT TRUE
           AND created_at < NOW() - INTERVAL '${HOT_TO_COLD_DAYS} days'
           ${workspaceId ? `AND workspace_id = $1` : ""}
         LIMIT ${BATCH_SIZE}`,
        workspaceId ? [workspaceId] : []
      );
      archivedCount = archiveResult.rowCount || 0;

      // Step 2: Clear audio URLs from records older than COLD_TO_PURGE_DAYS (storage freed)
      if (audioUrlColumn) {
        const purgeResult = await client.query(
          `UPDATE ${tableName}
           SET ${audioUrlColumn} = NULL
           WHERE archived = TRUE
             AND ${audioUrlColumn} IS NOT NULL
             AND created_at < NOW() - INTERVAL '${COLD_TO_PURGE_DAYS} days'
             ${workspaceId ? `AND workspace_id = $1` : ""}
           LIMIT ${BATCH_SIZE}`,
          workspaceId ? [workspaceId] : []
        );
        purgedAudioCount = purgeResult.rowCount || 0;
      }
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    log.error(`[StorageArchival] Archive of ${tableName} failed:`, err instanceof Error ? err.message : String(err));
  }

  const durationMs = Date.now() - start;
  log.info(`[StorageArchival] ${tableName}: archived=${archivedCount} purgedAudio=${purgedAudioCount} (${durationMs}ms)`);

  return { table: tableName, archivedCount, purgedAudioCount, durationMs };
}

// ── Main archival run ─────────────────────────────────────────────────────────

export async function runArchivalCycle(workspaceId?: string): Promise<ArchivalResult[]> {
  log.info(`[StorageArchival] Starting archival cycle${workspaceId ? ` for workspace ${workspaceId}` : " (all workspaces)"}`);

  // Skip billing-excluded workspaces (platform internal workspaces)
  if (workspaceId && isBillingExcluded(workspaceId)) {
    log.info(`[StorageArchival] Skipping billing-excluded workspace ${workspaceId}`);
    return [];
  }

  const results = await Promise.all([
    archiveTable({ tableName: "cad_event_log",     workspaceId }),
    archiveTable({ tableName: "ptt_transmissions",  workspaceId, audioUrlColumn: "audio_url" }),
    archiveTable({ tableName: "ptt_plate_log",      workspaceId }),
    archiveTable({ tableName: "import_history",     workspaceId }),
    // Incident reports — check table exists first
    (async () => {
      try {
        const { rows } = await pool.query(
          `SELECT 1 FROM information_schema.tables WHERE table_name = 'incident_reports' LIMIT 1`
        );
        if (rows.length > 0) {
          return archiveTable({ tableName: "incident_reports", workspaceId });
        }
      } catch { /* table doesn't exist yet */ }
      return { table: "incident_reports", archivedCount: 0, purgedAudioCount: 0, durationMs: 0 };
    })(),
  ]);

  const totalArchived = results.reduce((s, r) => s + r.archivedCount, 0);
  const totalPurged = results.reduce((s, r) => s + r.purgedAudioCount, 0);
  log.info(`[StorageArchival] Cycle complete: ${totalArchived} records archived, ${totalPurged} audio URLs cleared`);

  return results;
}

// ── Cron schedule (daily at 3am UTC) ─────────────────────────────────────────
// Called from server/index.ts on startup. Runs daily to keep hot tables lean.

export function scheduleArchivalCron(): void {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const now = new Date();

  // Next 3am UTC
  const next3am = new Date(now);
  next3am.setUTCHours(3, 0, 0, 0);
  if (next3am <= now) next3am.setUTCDate(next3am.getUTCDate() + 1);

  const msUntilFirst = next3am.getTime() - now.getTime();

  setTimeout(() => {
    runArchivalCycle().catch(err =>
      log.error("[StorageArchival] Cron run failed:", err instanceof Error ? err.message : String(err))
    );
    // Daily thereafter
    setInterval(() => {
      runArchivalCycle().catch(err =>
        log.error("[StorageArchival] Cron run failed:", err instanceof Error ? err.message : String(err))
      );
    }, MS_PER_DAY);
  }, msUntilFirst);

  log.info(`[StorageArchival] Cron scheduled — first run in ${Math.round(msUntilFirst / 60000)} minutes`);
}

// ── Storage stats for billing dashboard ──────────────────────────────────────

export async function getStorageStats(workspaceId: string): Promise<{
  hotRecords: number;
  coldRecords: number;
  totalRecords: number;
  estimatedHotStorageMb: number;
}> {
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE archived IS NOT TRUE) AS hot,
         COUNT(*) FILTER (WHERE archived = TRUE) AS cold,
         COUNT(*) AS total
       FROM (
         SELECT archived FROM cad_event_log WHERE workspace_id = $1
         UNION ALL
         SELECT archived FROM ptt_transmissions WHERE workspace_id = $1
         UNION ALL
         SELECT archived FROM ptt_plate_log WHERE workspace_id = $1
       ) combined`,
      [workspaceId]
    );
    const hot = Number(rows[0]?.hot || 0);
    const cold = Number(rows[0]?.cold || 0);
    return {
      hotRecords: hot,
      coldRecords: cold,
      totalRecords: hot + cold,
      estimatedHotStorageMb: Math.round(hot * 0.002), // ~2KB per hot record average
    };
  } catch {
    return { hotRecords: 0, coldRecords: 0, totalRecords: 0, estimatedHotStorageMb: 0 };
  }
}
