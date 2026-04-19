/**
 * Error Tracker — Readiness Section 5 (Observability Baseline)
 * ============================================================
 * Pluggable external error sink. The platform already has an in-process
 * buffer in `monitoringService.logError` (server/monitoring.ts) that
 * flushes to the database. This adapter complements it by forwarding
 * high-severity errors to an external observability backend so operators
 * can see them without logging into the database.
 *
 * Design:
 *   - Purely additive: does NOT replace monitoringService.logError.
 *     It is called *from* that method (see server/monitoring.ts patch).
 *   - Pluggable: a real Sentry/Datadog SDK swap is ~20 lines. The default
 *     HTTP adapter POSTs to ERROR_TRACKING_WEBHOOK_URL if set, otherwise
 *     is a no-op.
 *   - Non-fatal: failures never throw; observability should never take
 *     down the request path.
 *   - Respects isProduction(): in dev, the no-op adapter runs unless a
 *     DSN is explicitly configured, so developers don't spam the sink
 *     with local noise.
 */

import { createLogger } from './logger';
import { isProduction } from './isProduction';

const log = createLogger('errorTracker');

export interface TrackedError {
  message: string;
  stack?: string;
  level: 'info' | 'warn' | 'error' | 'critical';
  tags?: Record<string, string | undefined>;
  context?: Record<string, any>;
  timestamp: Date;
}

export interface ErrorTrackerAdapter {
  name: string;
  capture(event: TrackedError): Promise<void> | void;
}

// ─── Default: no-op adapter ──────────────────────────────────────────────────

class NoopAdapter implements ErrorTrackerAdapter {
  name = 'noop';
  capture(): void { /* deliberately empty */ }
}

// ─── HTTP webhook adapter ────────────────────────────────────────────────────
// Forwards errors as JSON to ERROR_TRACKING_WEBHOOK_URL. Works with any
// provider that accepts a JSON payload (Sentry relay, Datadog HTTP intake,
// Slack webhook for ultra-minimal setups, custom S3 receiver, etc.).

class HttpWebhookAdapter implements ErrorTrackerAdapter {
  name = 'http-webhook';
  constructor(private readonly url: string, private readonly authHeader?: string) {}

  async capture(event: TrackedError): Promise<void> {
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (this.authHeader) headers.authorization = this.authHeader;
      await fetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          timestamp: event.timestamp.toISOString(),
          level: event.level,
          message: event.message,
          stack: event.stack,
          tags: event.tags,
          context: event.context,
          source: 'coaileague',
          env: process.env.NODE_ENV || 'unknown',
          host: process.env.HOSTNAME || undefined,
        }),
        // 2-second cap — observability must never block the request.
        signal: AbortSignal.timeout(2000),
      });
    } catch (err: any) {
      log.warn('[errorTracker] webhook capture failed (non-fatal):', err?.message);
    }
  }
}

// ─── Adapter selection ───────────────────────────────────────────────────────

let cachedAdapter: ErrorTrackerAdapter | null = null;

function selectAdapter(): ErrorTrackerAdapter {
  if (cachedAdapter) return cachedAdapter;

  const webhookUrl = process.env.ERROR_TRACKING_WEBHOOK_URL?.trim();
  const authHeader = process.env.ERROR_TRACKING_AUTH_HEADER?.trim();

  if (webhookUrl) {
    cachedAdapter = new HttpWebhookAdapter(webhookUrl, authHeader);
    log.info(`[errorTracker] Using HTTP webhook adapter → ${new URL(webhookUrl).host}`);
  } else {
    cachedAdapter = new NoopAdapter();
    // Only warn in prod — in dev, no-op is expected.
    if (isProduction()) {
      log.warn('[errorTracker] No ERROR_TRACKING_WEBHOOK_URL set. Running no-op adapter in production.');
    }
  }
  return cachedAdapter;
}

/**
 * Report an error to the external observability backend. Non-blocking,
 * non-fatal, and respects the pluggable adapter contract.
 */
export function captureError(event: TrackedError): void {
  try {
    const out = selectAdapter().capture(event);
    if (out instanceof Promise) {
      out.catch((err) => log.warn('[errorTracker] capture promise rejected', err));
    }
  } catch (err: any) {
    log.warn('[errorTracker] capture threw (non-fatal):', err?.message);
  }
}

/**
 * Test-only helper. Call from a diagnostic endpoint to verify the
 * configured adapter works end-to-end without waiting for a real error.
 */
export function captureTestEvent(): void {
  captureError({
    timestamp: new Date(),
    level: 'info',
    message: 'errorTracker test event',
    tags: { synthetic: 'true' },
  });
}

/** Reset for tests only. */
export function __resetErrorTrackerForTest(): void {
  cachedAdapter = null;
}
