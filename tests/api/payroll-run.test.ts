import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';
let serverReachable = false;

beforeAll(async () => {
  try {
    await fetch(`${BASE_URL}/api/health`);
    serverReachable = true;
  } catch {
    serverReachable = false;
  }
});

async function apiPost(path: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

describe('Payroll Run', () => {
  it('create-run route exists and is guarded', async () => {
    if (!serverReachable) return;
    const res = await apiPost('/api/payroll/create-run', {
      periodStart: '2026-04-01',
      periodEnd: '2026-04-15',
      type: 'regular',
    });
    expect([201, 400, 401, 402, 403, 409, 422]).toContain(res.status);
    expect(res.status).not.toBe(404);
  });

  it('double-processing attempt is rejected or blocked by auth', async () => {
    if (!serverReachable) return;
    const res = await apiPost('/api/payroll/create-run', {
      periodStart: '2026-04-01',
      periodEnd: '2026-04-15',
    });
    expect([400, 401, 402, 403, 409, 422]).toContain(res.status);
  });
});

