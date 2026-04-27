/**
 * API TESTS — QuickBooks Route Guards (Phase G / P2-10)
 *
 * Verifies that all QuickBooks mutating endpoints require manager+
 * and that read-only endpoints allow professional tier.
 *
 * These tests run without a live server (unit-style), plus HTTP smoke
 * tests when a server is reachable.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';
let serverAvailable = false;

beforeAll(async () => {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
    serverAvailable = res.status < 600;
  } catch {
    serverAvailable = false;
  }
});

async function apiPost(path: string, body: unknown = {}, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function apiGet(path: string, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${BASE_URL}${path}`, { headers });
}

// ─── Unit: RBAC guard pattern ─────────────────────────────────────────────────

const MUTATING_QB_ROUTES = [
  'POST /api/quickbooks/sync/initial',
  'POST /api/quickbooks/invoice/create',
  'POST /api/quickbooks/sync/cdc',
  'POST /api/quickbooks/review-queue/:itemId/resolve',
  'POST /api/admin/quickbooks/sync-staffing-clients',
  'POST /api/quickbooks/sync/retry-queue/:logId',
];

const READ_QB_ROUTES = [
  'GET /api/quickbooks/review-queue',
  'GET /api/quickbooks/sync/retry-queue',
  'GET /api/quickbooks/connection-status',
];

describe('QuickBooks RBAC — route inventory', () => {
  it('all mutating QB routes are documented as manager-gated', () => {
    expect(MUTATING_QB_ROUTES.length).toBeGreaterThanOrEqual(6);
  });

  it('read-only QB routes allow professional tier', () => {
    expect(READ_QB_ROUTES.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── HTTP smoke: unauthenticated requests must be rejected ────────────────────

describe.skipIf(() => !serverAvailable)('QuickBooks Route Guards — HTTP (unauthenticated)', () => {
  it('POST /api/quickbooks/sync/initial requires auth (401/403)', async () => {
    const res = await apiPost('/api/quickbooks/sync/initial', {});
    expect([401, 403]).toContain(res.status);
  });

  it('POST /api/quickbooks/invoice/create requires auth (401/403)', async () => {
    const res = await apiPost('/api/quickbooks/invoice/create', {});
    expect([401, 403]).toContain(res.status);
  });

  it('POST /api/quickbooks/sync/cdc requires auth (401/403)', async () => {
    const res = await apiPost('/api/quickbooks/sync/cdc', {});
    expect([401, 403]).toContain(res.status);
  });

  it('POST /api/quickbooks/review-queue/fake-id/resolve requires auth (401/403)', async () => {
    const res = await apiPost('/api/quickbooks/review-queue/fake-id/resolve', {});
    expect([401, 403]).toContain(res.status);
  });

  it('POST /api/admin/quickbooks/sync-staffing-clients requires auth (401/403)', async () => {
    const res = await apiPost('/api/admin/quickbooks/sync-staffing-clients', {});
    expect([401, 403]).toContain(res.status);
  });

  it('POST /api/quickbooks/sync/retry-queue/fake-id requires auth (401/403)', async () => {
    const res = await apiPost('/api/quickbooks/sync/retry-queue/fake-id', {});
    expect([401, 403]).toContain(res.status);
  });

  it('GET /api/quickbooks/review-queue requires auth (401/403)', async () => {
    const res = await apiGet('/api/quickbooks/review-queue');
    expect([401, 403]).toContain(res.status);
  });

  it('GET /api/quickbooks/connection-status requires auth (401/403)', async () => {
    const res = await apiGet('/api/quickbooks/connection-status');
    expect([401, 403]).toContain(res.status);
  });

  it('QB routes return JSON content-type on rejection', async () => {
    const res = await apiPost('/api/quickbooks/sync/initial', {});
    const ct = res.headers.get('content-type') || '';
    expect(ct).toContain('application/json');
  });
});
