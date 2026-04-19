/**
 * Readiness Section 21 — error tracker adapter invariants
 *
 * Tests the pluggable adapter in server/lib/errorTracker.ts:
 *   - No-op by default when no DSN is set
 *   - HTTP webhook adapter is selected when ERROR_TRACKING_WEBHOOK_URL is set
 *   - capture() is non-throwing on malformed input
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  captureError,
  captureTestEvent,
  __resetErrorTrackerForTest,
} from '@server/lib/errorTracker';

describe('errorTracker adapter', () => {
  beforeEach(() => {
    delete process.env.ERROR_TRACKING_WEBHOOK_URL;
    delete process.env.ERROR_TRACKING_AUTH_HEADER;
    __resetErrorTrackerForTest();
  });
  afterEach(() => {
    __resetErrorTrackerForTest();
  });

  it('no-op adapter never throws when nothing is configured', () => {
    expect(() => captureTestEvent()).not.toThrow();
    expect(() =>
      captureError({
        timestamp: new Date(),
        level: 'error',
        message: 'a synthetic error',
      }),
    ).not.toThrow();
  });

  it('webhook adapter attempts the POST when DSN is configured', async () => {
    process.env.ERROR_TRACKING_WEBHOOK_URL = 'https://example.invalid/ingest';
    __resetErrorTrackerForTest();
    const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
    // @ts-expect-error — test-only global stub
    globalThis.fetch = fetchSpy;

    captureError({
      timestamp: new Date(),
      level: 'critical',
      message: 'boom',
      tags: { workspaceId: 'ws-1' },
    });

    // Give the non-blocking promise a tick.
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchSpy).toHaveBeenCalled();
    const [, init] = fetchSpy.mock.calls[0];
    expect((init as any).method).toBe('POST');
    expect((init as any).headers['content-type']).toBe('application/json');
  });

  it('capture never throws even when the fetch itself throws', async () => {
    process.env.ERROR_TRACKING_WEBHOOK_URL = 'https://example.invalid/ingest';
    __resetErrorTrackerForTest();
    // @ts-expect-error — test-only global stub
    globalThis.fetch = () => { throw new Error('network dead'); };

    expect(() =>
      captureError({
        timestamp: new Date(),
        level: 'warn',
        message: 'will the wrapper swallow this?',
      }),
    ).not.toThrow();
  });
});
