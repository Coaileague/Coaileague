/**
 * Generic Webhook Idempotency Claim Service
 *
 * Per CLAUDE.md §15 (Idempotency Layer):
 *   "Stripe webhooks have idempotency keys. Every other external service
 *    must too. Network failures cause duplicate deliveries. Duplicate
 *    deliveries cause duplicate actions. This is a financial and
 *    operational risk."
 *
 * Required for:
 *   - Twilio  — MessageSid / CallSid on inbound SMS/voice webhooks
 *   - Resend  — email_id on inbound email + delivery status webhooks
 *   - Plaid   — transfer_id / event_id on ACH + link webhooks
 *   - Any other third-party webhook that may retry on network failure
 *
 * Stripe already has its own dedicated `processed_stripe_events` table and
 * `tryClaimEvent` helper in server/services/billing/stripeWebhooks.ts — that
 * one is NOT changed here. This module adds the equivalent guarantee for
 * every other webhook source via a shared `processed_webhook_events` table.
 *
 * Usage:
 *
 *   import { tryClaimWebhookEvent } from '../services/infrastructure/webhookIdempotency';
 *
 *   router.post('/api/webhooks/twilio/sms', async (req, res) => {
 *     const messageSid = req.body?.MessageSid;
 *     if (messageSid) {
 *       const claimed = await tryClaimWebhookEvent('twilio', messageSid, 'sms.inbound');
 *       if (!claimed) {
 *         log.info('Duplicate Twilio webhook skipped', { messageSid });
 *         return res.status(200).send('<Response/>'); // acknowledge, no work
 *       }
 *     }
 *     // ... proceed with normal handling
 *   });
 *
 * The table is created idempotently by the legacyBootstrapRegistry at boot
 * so no Drizzle schema change or migration is required for this commit.
 *
 * The claim pattern uses INSERT ... ON CONFLICT DO NOTHING which is atomic
 * at the database level — no window exists between a check and a write
 * where two concurrent handlers could both think they won. The in-memory
 * cache is a fast-path to avoid DB round-trips for repeated events in the
 * same process lifetime.
 */

import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
import { registerLegacyBootstrap } from '../legacyBootstrapRegistry';

const log = createLogger('webhookIdempotency');

// ── Table bootstrap ──────────────────────────────────────────────────────────
// Registered with legacyBootstrapRegistry so it's created idempotently at boot
// without requiring a Drizzle schema migration. Safe to re-run.
registerLegacyBootstrap('processed_webhook_events', async (p) => {
  await p.query(`
    CREATE TABLE IF NOT EXISTS processed_webhook_events (
      source       varchar(64)  NOT NULL,
      event_id     varchar(255) NOT NULL,
      event_type   varchar(128),
      processed_at timestamptz  DEFAULT NOW() NOT NULL,
      PRIMARY KEY (source, event_id)
    );
    CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_time
      ON processed_webhook_events (processed_at);
  `);
});

// ── In-process fast-path cache ───────────────────────────────────────────────
// Prevents DB round-trip for events already seen in this process.
// Cleared on server restart. The DB table is the source of truth.

const memoryCache = new Map<string, number>();
const MEMORY_CACHE_MAX = 10_000;
const MEMORY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function evictMemoryCache(): void {
  const now = Date.now();
  let evicted = 0;
  for (const [key, timestamp] of memoryCache.entries()) {
    if (now - timestamp > MEMORY_CACHE_TTL_MS) {
      memoryCache.delete(key);
      evicted++;
    }
    if (memoryCache.size < MEMORY_CACHE_MAX * 0.8) break;
  }
  if (memoryCache.size > MEMORY_CACHE_MAX) {
    // Hard eviction — drop oldest entries
    const entries = Array.from(memoryCache.entries()).sort((a, b) => a[1] - b[1]);
    const toDrop = memoryCache.size - Math.floor(MEMORY_CACHE_MAX * 0.8);
    for (let i = 0; i < toDrop; i++) memoryCache.delete(entries[i][0]);
    evicted += toDrop;
  }
  if (evicted > 0) {
    log.debug(`[webhookIdempotency] Memory cache evicted ${evicted} entries`);
  }
}

/**
 * Try to atomically claim an incoming webhook event as "first to process".
 *
 * @param source    — the webhook source identifier (e.g., 'twilio', 'resend', 'plaid')
 * @param eventId   — the provider's own event identifier (MessageSid, email_id, transfer_id, etc.)
 * @param eventType — optional human-readable event type for debugging/analytics
 * @returns true if this is the first time we've seen this event (caller should process it)
 *          false if another handler already claimed it (caller should skip and return 200)
 *
 * Safe to call from concurrent handlers — the INSERT ... ON CONFLICT DO NOTHING
 * ensures atomic claim at the DB level.
 *
 * Fails open on database error: returns true (process the event) so that a DB
 * outage doesn't silently drop legitimate webhooks. The caller's own idempotency
 * (update-only-if-not-already-done patterns) should still catch duplicates in
 * the rare DB-outage-plus-retry case.
 */
export async function tryClaimWebhookEvent(
  source: string,
  eventId: string,
  eventType?: string,
): Promise<boolean> {
  if (!eventId) {
    // No event id available — caller must fall back to its own idempotency
    return true;
  }
  const cacheKey = `${source}:${eventId}`;
  if (memoryCache.has(cacheKey)) return false;

  try {
    const result = await pool.query(
      `INSERT INTO processed_webhook_events (source, event_id, event_type, processed_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (source, event_id) DO NOTHING
       RETURNING event_id`,
      [source, eventId, eventType || null],
    );

    const claimed = (result.rowCount || 0) > 0;
    memoryCache.set(cacheKey, Date.now());
    if (memoryCache.size > MEMORY_CACHE_MAX) evictMemoryCache();
    return claimed;
  } catch (err: any) {
    // Fail open — DB outage should not silently drop webhooks.
    // Log loudly so operators can see when this happens.
    log.error(
      `[webhookIdempotency] claim probe failed for ${source}:${eventId} — failing open`,
      { error: err?.message },
    );
    memoryCache.set(cacheKey, Date.now());
    return true;
  }
}

/**
 * Cleanup helper — removes webhook claim records older than retentionDays.
 * Call from a scheduled job (e.g., daily) to keep the table bounded.
 */
export async function cleanupOldWebhookClaims(retentionDays: number = 30): Promise<void> {
  try {
    const result = await pool.query(
      `DELETE FROM processed_webhook_events
       WHERE processed_at < NOW() - ($1 || ' days')::interval`,
      [String(retentionDays)],
    );
    log.info(
      `[webhookIdempotency] Cleanup removed ${result.rowCount || 0} claims older than ${retentionDays} days`,
    );
  } catch (err: any) {
    log.error('[webhookIdempotency] cleanup failed', { error: err?.message });
  }
}

/** Test/debug helper — clears the in-memory fast-path cache. */
export function _clearWebhookIdempotencyCacheForTesting(): void {
  memoryCache.clear();
}
