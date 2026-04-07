/**
 * Legacy Table Bootstrap Registry
 *
 * Replaces the anti-pattern of route files running `CREATE TABLE IF NOT EXISTS`
 * SQL inside a top-level IIFE at module load. That pattern fired DB queries
 * before the connection pool / circuit breaker were ready, generating noisy
 * `ECONNREFUSED` errors and potential boot-time race conditions.
 *
 * Usage from a route file:
 *
 *   import { registerLegacyBootstrap } from '../services/legacyBootstrapRegistry';
 *
 *   registerLegacyBootstrap('wellness', async (pool) => {
 *     await pool.query(`CREATE TABLE IF NOT EXISTS wellness_check_configs (...)`);
 *   });
 *
 * Then in server/index.ts, after the DB pool is verified up and after
 * ensureRequiredTables() has run:
 *
 *   await runLegacyBootstraps();
 *
 * Each callback runs at most once. Failures are logged but do not abort
 * subsequent bootstraps — these are best-effort backfills for tables that
 * are not yet in the canonical Drizzle schema.
 *
 * NOTE: This is a transitional shim. The proper long-term fix is to move
 * each of these table definitions into shared/schema/domains/* and let
 * SchemaParityService manage them through ensureRequiredTables().
 */

import type { Pool } from 'pg';
import { pool, isDbCircuitOpen } from '../db';
import { createLogger } from '../lib/logger';

const log = createLogger('legacyBootstrap');

type BootstrapFn = (pool: Pool) => Promise<void>;

interface BootstrapEntry {
  name: string;
  fn: BootstrapFn;
  ran: boolean;
}

const registry: BootstrapEntry[] = [];

export function registerLegacyBootstrap(name: string, fn: BootstrapFn): void {
  registry.push({ name, fn, ran: false });
}

export async function runLegacyBootstraps(): Promise<void> {
  if (registry.length === 0) return;

  if (isDbCircuitOpen()) {
    log.warn(`[legacyBootstrap] DB circuit is open, skipping ${registry.length} bootstraps`);
    return;
  }

  log.info(`[legacyBootstrap] Running ${registry.length} legacy table bootstraps`);

  const results = { ok: 0, failed: 0 };

  for (const entry of registry) {
    if (entry.ran) continue;
    try {
      await entry.fn(pool as unknown as Pool);
      entry.ran = true;
      results.ok++;
    } catch (err: any) {
      results.failed++;
      log.error(`[legacyBootstrap] ${entry.name} failed`, { error: err?.message });
    }
  }

  log.info(`[legacyBootstrap] Complete: ${results.ok} ok, ${results.failed} failed`);
}

/** Test-only: clear the registry. */
export function _resetLegacyBootstrapsForTesting(): void {
  registry.length = 0;
}
