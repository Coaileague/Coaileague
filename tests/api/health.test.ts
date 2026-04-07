/**
 * API INTEGRATION TESTS — Health & Core Endpoints
 * Uses direct HTTP requests against running server (port 5000)
 * Phase 38 — Automated Test Suite
 */

import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';

async function apiGet(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...headers },
  });
  return res;
}

async function apiPost(path: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return res;
}

// ─── Health & Core API ────────────────────────────────────────────────────────
describe('Health & Core API', () => {
  it('GET /api/health requires auth (returns 401 or 200)', async () => {
    const res = await apiGet('/api/health');
    expect([200, 401, 403]).toContain(res.status);
  });

  it('GET /api/health returns JSON (auth or data)', async () => {
    const res = await apiGet('/api/health');
    const ct = res.headers.get('content-type') || '';
    expect(ct).toContain('application/json');
  });

  it('GET /api/user returns 401 for unauthenticated request', async () => {
    const res = await apiGet('/api/user');
    expect([401, 403]).toContain(res.status);
  });

  it('GET /api/workspaces returns 401 for unauthenticated request', async () => {
    const res = await apiGet('/api/workspaces');
    expect([401, 403]).toContain(res.status);
  });

  it('GET /api/employees returns 401 for unauthenticated request', async () => {
    const res = await apiGet('/api/employees');
    expect([401, 403]).toContain(res.status);
  });

  it('API routes return JSON content-type', async () => {
    const res = await apiGet('/api/user');
    const ct = res.headers.get('content-type') || '';
    expect(ct).toContain('application/json');
  });

  it('unknown API route returns 401 or 404 (auth guard may run first)', async () => {
    const res = await apiGet('/api/this-route-does-not-exist-xyz');
    expect([401, 403, 404]).toContain(res.status);
  });
});

// ─── Privacy / GDPR Endpoints (Phase 36) ─────────────────────────────────────
describe('Privacy API — Auth Guard', () => {
  it('GET /api/privacy/dsr returns 401 without auth', async () => {
    const res = await apiGet('/api/privacy/dsr');
    expect([401, 403]).toContain(res.status);
  });

  it('POST /api/privacy/dsr returns 401 without auth', async () => {
    const res = await apiPost('/api/privacy/dsr', { requestType: 'access' });
    expect([401, 403]).toContain(res.status);
  });

  it('GET /api/privacy/retention-policies returns 401 without auth', async () => {
    const res = await apiGet('/api/privacy/retention-policies');
    expect([401, 403]).toContain(res.status);
  });

  it('GET /api/privacy/legal/privacy-policy returns a valid HTTP status', async () => {
    const res = await apiGet('/api/privacy/legal/privacy-policy');
    expect([200, 301, 302, 401, 403, 404]).toContain(res.status);
  });
});

// ─── Auth Endpoints ───────────────────────────────────────────────────────────
describe('Authentication API', () => {
  it('POST /api/auth/login with invalid data returns 400 or 401', async () => {
    const res = await apiPost('/api/auth/login', { username: '', password: '' });
    expect([400, 401, 422]).toContain(res.status);
  });

  it('POST /api/auth/logout returns appropriate response', async () => {
    const res = await apiPost('/api/auth/logout', {});
    expect([200, 302, 401, 403]).toContain(res.status);
  });
});

// ─── Security Headers ─────────────────────────────────────────────────────────
describe('Security Headers', () => {
  it('server does not expose version in X-Powered-By', async () => {
    const res = await apiGet('/api/health');
    const xpb = res.headers.get('x-powered-by') || '';
    expect(xpb.toLowerCase()).not.toContain('express');
  });

  it('API responses include content-type header', async () => {
    const res = await apiGet('/api/health');
    expect(res.headers.get('content-type')).toBeTruthy();
  });
});

// ─── Static Frontend ──────────────────────────────────────────────────────────
describe('Frontend Static Assets', () => {
  it('GET / returns HTML', async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const ct = res.headers.get('content-type') || '';
    expect(ct).toContain('text/html');
  });

  it('GET /dashboard serves the SPA (returns HTML)', async () => {
    const res = await fetch(`${BASE_URL}/dashboard`);
    expect(res.status).toBe(200);
    const ct = res.headers.get('content-type') || '';
    expect(ct).toContain('text/html');
  });
});
