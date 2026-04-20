/**
 * scheduleNonBlocking — single canonical fire-and-forget helper.
 *
 * TRINITY.md §B (NotificationDeliveryService Sole Sender / Phase F) bans
 * truly silent fire-and-forget patterns. The platform-wide rule is:
 *   "Zero fire-and-forget calls. Every notification logged."
 *
 * Many routes legitimately need to defer non-critical work to AFTER
 * the HTTP response goes out (e.g., notification dispatch, audit
 * persistence, AI enrichment) — making the response wait for that work
 * would slow user-visible latency by hundreds of milliseconds. The
 * pattern previously used was:
 *
 *   setImmediate(async () => {
 *     try {
 *       await sendSomething(...);
 *     } catch (err) {
 *       log.warn('failed', err);
 *     }
 *   });
 *
 * This is OK in principle but it's:
 *   - Repeated across 39+ sites with subtly different error handling
 *   - Unenforceable — if anyone forgets the try/catch the rejection
 *     becomes an unhandled promise rejection (caught by the global
 *     handler in server/index.ts but with no source label)
 *   - Hard to grep for / audit
 *
 * scheduleNonBlocking centralizes the pattern with a known label, full
 * Postgres-error capture (code/detail/column/constraint), stack trace,
 * and a consistent log prefix. Every deferred async block in the
 * codebase should call this instead of raw setImmediate.
 *
 * Usage:
 *   import { scheduleNonBlocking } from '../lib/scheduleNonBlocking';
 *
 *   scheduleNonBlocking('twilio.inbound-sms-reply', async () => {
 *     await sendSMS({ to, body, type: 'system_alert' });
 *   });
 *
 * Errors are logged at WARN with the prefix [scheduleNonBlocking:label]
 * so they're searchable in production logs.
 */

import { createLogger } from './logger';

const log = createLogger('scheduleNonBlocking');

export function scheduleNonBlocking(label: string, fn: () => Promise<unknown>): void {
  setImmediate(() => {
    Promise.resolve()
      .then(fn)
      .catch((err: any) => {
        // Capture the full Postgres error context if present, otherwise
        // fall back to the basic message + stack.
        log.warn(`[scheduleNonBlocking:${label}] task failed`, {
          message: err?.message,
          code: err?.code,
          detail: err?.detail,
          column: err?.column,
          constraint: err?.constraint,
          table: err?.table,
          stack: err?.stack?.split('\n').slice(0, 6).join(' | '),
        });
      });
  });
}
