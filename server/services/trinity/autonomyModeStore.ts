/**
 * Trinity Autonomy Mode Store
 * ─────────────────────────────────────────────────────────────────────────────
 * Persists per-workspace autonomy mode (off | advisory | order_execution |
 * supervised_autonomous) in a tiny self-bootstrapping table. Cached in-process
 * so reads on every chat turn are free.
 *
 * Hard ceilings (dollar thresholds, public-safety boundary, conscience vetoes)
 * are NOT in this store — they live in code that cannot be toggled.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
import {
  type TrinityAutonomyMode,
  TRINITY_AUTONOMY_DEFAULT,
} from '../../trinity/personality';

const log = createLogger('AutonomyModeStore');
const cache = new Map<string, TrinityAutonomyMode>();
let bootstrapped = false;

const VALID: ReadonlyArray<TrinityAutonomyMode> = [
  'off', 'advisory', 'order_execution', 'supervised_autonomous',
];

async function ensureTable(): Promise<void> {
  if (bootstrapped) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trinity_workspace_autonomy (
        workspace_id VARCHAR PRIMARY KEY,
        mode         VARCHAR NOT NULL DEFAULT 'order_execution',
        updated_by   VARCHAR,
        updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    bootstrapped = true;
  } catch (err) {
    log.warn('Could not create trinity_workspace_autonomy table; falling back to in-memory only.', err);
  }
}

export function isValidAutonomyMode(v: unknown): v is TrinityAutonomyMode {
  return typeof v === 'string' && VALID.includes(v as TrinityAutonomyMode);
}

export async function getAutonomyMode(workspaceId: string): Promise<TrinityAutonomyMode> {
  if (cache.has(workspaceId)) return cache.get(workspaceId)!;
  await ensureTable();
  try {
    const { rows } = await pool.query<{ mode: string }>(
      `SELECT mode FROM trinity_workspace_autonomy WHERE workspace_id = $1`,
      [workspaceId],
    );
    const mode = rows[0]?.mode;
    if (mode && isValidAutonomyMode(mode)) {
      cache.set(workspaceId, mode);
      return mode;
    }
  } catch (err) {
    log.warn(`getAutonomyMode read failed for ${workspaceId}`, err);
  }
  cache.set(workspaceId, TRINITY_AUTONOMY_DEFAULT);
  return TRINITY_AUTONOMY_DEFAULT;
}

export async function setAutonomyMode(
  workspaceId: string,
  mode: TrinityAutonomyMode,
  updatedBy?: string,
): Promise<void> {
  if (!isValidAutonomyMode(mode)) {
    throw new Error(`Invalid autonomy mode: ${String(mode)}`);
  }
  await ensureTable();
  try {
    await pool.query(
      `INSERT INTO trinity_workspace_autonomy (workspace_id, mode, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (workspace_id) DO UPDATE
         SET mode = EXCLUDED.mode,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()`,
      [workspaceId, mode, updatedBy ?? null],
    );
  } catch (err) {
    log.warn(`setAutonomyMode persist failed for ${workspaceId}; cache-only.`, err);
  }
  cache.set(workspaceId, mode);
}
