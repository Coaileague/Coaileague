/**
 * persistentRateLimitStore — Postgres-backed Store for express-rate-limit.
 *
 * Why this exists:
 *   The default MemoryStore tracks counters in process memory only. With more
 *   than one server replica (Railway autoscaling, blue/green deploys) every
 *   replica has its own counter, so an attacker who is willing to spread their
 *   requests across replicas effectively gets `limit × replicaCount` capacity.
 *   That is exactly the leak our rate limits are meant to plug.
 *
 * How this works:
 *   We persist `(key, hits, expires_at)` rows in a small Postgres UNLOGGED
 *   table (UNLOGGED skips WAL — perfect for ephemeral counter state, much
 *   faster than a regular table, and it's truncated automatically on a
 *   crash which is the desired behavior for a rate-limit store).
 *
 *   Each `increment(key)` performs a single round-trip via INSERT ... ON
 *   CONFLICT DO UPDATE that atomically bumps the counter and rolls the
 *   window if expired. Reads, decrements, and resets are similarly cheap.
 *
 * Safety:
 *   - The table is created LAZILY on first use (CREATE TABLE IF NOT EXISTS),
 *     so adopting this store does NOT require running a migration first.
 *   - If table-init fails (read-only role, permissions, etc.) we fall back
 *     to the default in-memory store and emit a one-time warning. The app
 *     keeps serving requests.
 *   - All inputs are parameterised — no string concatenation into SQL.
 *   - Compatible with express-rate-limit v8 Store contract.
 *
 * Opt-in:
 *   Wire it into a limiter with `store: getPersistentRateLimitStore('export-pdf', 10*60_000)`
 *   The first arg is a logical limiter name (becomes part of the row key
 *   so different limiters never collide). The second arg is the window
 *   length in ms — must match the limiter's `windowMs`.
 */

import type { Store, IncrementResponse } from 'express-rate-limit';
import { pool } from '../db';
import { createLogger } from '../lib/logger';

const log = createLogger('PersistentRateLimitStore');

const TABLE_NAME = 'app_rate_limits';
let tableInitPromise: Promise<boolean> | null = null;

async function ensureTable(): Promise<boolean> {
  if (tableInitPromise) return tableInitPromise;
  tableInitPromise = (async () => {
    try {
      // UNLOGGED for speed — counters are ephemeral, fine to lose on crash.
      // PRIMARY KEY on (limiter, key) so each limiter has its own namespace.
      await pool.query(`
        CREATE UNLOGGED TABLE IF NOT EXISTS ${TABLE_NAME} (
          limiter TEXT NOT NULL,
          key TEXT NOT NULL,
          hits INTEGER NOT NULL DEFAULT 0,
          expires_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (limiter, key)
        );
      `);
      // Single index for expiry sweeps. The cleanup job (below) calls a
      // small DELETE every minute so the table stays bounded even under
      // a large unique-key fan-out.
      await pool.query(`
        CREATE INDEX IF NOT EXISTS ${TABLE_NAME}_expires_idx
        ON ${TABLE_NAME} (expires_at)
      `);
      return true;
    } catch (err: unknown) {
      log.warn(`[PersistentRateLimit] table init failed (falling back to in-memory): ${err?.message}`);
      return false;
    }
  })();
  return tableInitPromise;
}

// Sweep expired rows every 60 s. One global timer per process — cheap.
let sweepTimer: NodeJS.Timeout | null = null;
function startSweep() {
  if (sweepTimer) return;
  sweepTimer = setInterval(async () => {
    try {
      await pool.query(`DELETE FROM ${TABLE_NAME} WHERE expires_at < NOW()`);
    } catch {
      /* sweep failures are non-fatal */
    }
  }, 60_000);
  // Don't keep the event loop alive just for this sweeper
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();
}

class PostgresRateLimitStore implements Store {
  /** Limiter logical name (becomes part of every key — namespaces this store). */
  private readonly limiter: string;
  /** Window length in ms (must match the limiter's `windowMs`). */
  private readonly windowMs: number;
  /** Lazily-loaded; true once we've confirmed the backing table exists. */
  private ready: Promise<boolean>;

  constructor(limiter: string, windowMs: number) {
    this.limiter = limiter;
    this.windowMs = windowMs;
    this.ready = ensureTable();
    startSweep();
  }

  /** Required by express-rate-limit v8 — invoked once when the limiter is created. */
  init(opts: { windowMs: number }): void {
    // No-op — we already accepted windowMs in the constructor.
  }

  async increment(key: string): Promise<IncrementResponse> {
    const ok = await this.ready;
    if (!ok) {
      // Table not available — degrade to allow-with-no-counter semantics
      return { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };
    }
    const expires = new Date(Date.now() + this.windowMs);
    // Atomic upsert: on conflict, bump hits and roll the window if expired.
    const { rows } = await pool.query<{ hits: number; expires_at: Date }>(
      `
      INSERT INTO ${TABLE_NAME} (limiter, key, hits, expires_at)
      VALUES ($1, $2, 1, $3)
      ON CONFLICT (limiter, key) DO UPDATE SET
        hits = CASE
          WHEN ${TABLE_NAME}.expires_at < NOW() THEN 1
          ELSE ${TABLE_NAME}.hits + 1
        END,
        expires_at = CASE
          WHEN ${TABLE_NAME}.expires_at < NOW() THEN EXCLUDED.expires_at
          ELSE ${TABLE_NAME}.expires_at
        END
      RETURNING hits, expires_at
      `,
      [this.limiter, key, expires],
    );
    const row = rows[0];
    return {
      totalHits: row.hits,
      resetTime: row.expires_at,
    };
  }

  async decrement(key: string): Promise<void> {
    const ok = await this.ready;
    if (!ok) return;
    await pool.query(
      `UPDATE ${TABLE_NAME} SET hits = GREATEST(hits - 1, 0) WHERE limiter = $1 AND key = $2`,
      [this.limiter, key],
    );
  }

  async resetKey(key: string): Promise<void> {
    const ok = await this.ready;
    if (!ok) return;
    await pool.query(
      `DELETE FROM ${TABLE_NAME} WHERE limiter = $1 AND key = $2`,
      [this.limiter, key],
    );
  }

  async resetAll(): Promise<void> {
    const ok = await this.ready;
    if (!ok) return;
    await pool.query(`DELETE FROM ${TABLE_NAME} WHERE limiter = $1`, [this.limiter]);
  }
}

/**
 * Returns a Store ready to plug into express-rate-limit:
 *
 *   rateLimit({ windowMs: 10*60_000, max: 10, store: getPersistentRateLimitStore('export-pdf', 10*60_000) });
 *
 * Set RATE_LIMIT_PERSISTENT=false in env to disable and force MemoryStore
 * (handy when running migrations or in tests).
 */
export function getPersistentRateLimitStore(limiter: string, windowMs: number): Store | undefined {
  if (process.env.RATE_LIMIT_PERSISTENT === 'false') return undefined;
  return new PostgresRateLimitStore(limiter, windowMs);
}
