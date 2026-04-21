/**
 * API INTEGRATION TESTS — Phase 16A: Trinity Billing Routes
 * Sends HTTP requests against the running server (port 5000).
 *
 * Without a valid auth session + workspace header, every protected route
 * returns 401. These tests verify the routes exist and guard correctly.
 * Full billing-data assertions require an authenticated test session.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';

// Skip all tests when no server is reachable (unit-test runs, CI without server)
let serverAvailable = false;
beforeAll(async () => {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
    serverAvailable = res.status < 600;
  } catch {
    serverAvailable = false;
  }
});

async function apiGet(path: string, headers: Record<string, string> = {}) {
  return fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// ─── Auth guard — unauthenticated requests ────────────────────────────────────

describe.skipIf(() => !serverAvailable)('Trinity Billing API — auth guard', () => {
  it('GET /api/billing/trinity/today returns 401 without auth', async () => {
    const res = await apiGet('/api/billing/trinity/today');
    expect([401, 403]).toContain(res.status);
  });

  it('GET /api/billing/trinity/month/2026/4 returns 401 without auth', async () => {
    const res = await apiGet('/api/billing/trinity/month/2026/4');
    expect([401, 403]).toContain(res.status);
  });

  it('GET /api/billing/trinity/unbilled returns 401 without auth', async () => {
    const res = await apiGet('/api/billing/trinity/unbilled');
    expect([401, 403]).toContain(res.status);
  });
});

// ─── Route existence (404 means route not registered) ────────────────────────

describe.skipIf(() => !serverAvailable)('Trinity Billing API — routes exist', () => {
  it('GET /api/billing/trinity/today does not return 404', async () => {
    const res = await apiGet('/api/billing/trinity/today');
    expect(res.status).not.toBe(404);
  });

  it('GET /api/billing/trinity/month/2026/4 does not return 404', async () => {
    const res = await apiGet('/api/billing/trinity/month/2026/4');
    expect(res.status).not.toBe(404);
  });

  it('GET /api/billing/trinity/unbilled does not return 404', async () => {
    const res = await apiGet('/api/billing/trinity/unbilled');
    expect(res.status).not.toBe(404);
  });
});

// ─── Input validation ─────────────────────────────────────────────────────────

describe.skipIf(() => !serverAvailable)('Trinity Billing API — input validation', () => {
  it('GET /api/billing/trinity/month with non-numeric month returns 401 or 400', async () => {
    // Non-numeric params → parseInt returns NaN → 400, but auth guard fires first → 401
    const res = await apiGet('/api/billing/trinity/month/2026/notamonth');
    expect([400, 401, 403]).toContain(res.status);
  });

  it('GET /api/billing/trinity/month with out-of-range month returns 401 or 400', async () => {
    const res = await apiGet('/api/billing/trinity/month/2026/13');
    expect([400, 401, 403]).toContain(res.status);
  });
});
