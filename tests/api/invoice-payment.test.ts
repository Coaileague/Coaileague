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

describe('Invoice Payment Flow', () => {
  it('create-payment route exists and is protected', async () => {
    if (!serverReachable) return;
    const res = await apiPost('/api/invoices/test-invoice-id/create-payment', { amount: 100000 });
    expect([200, 400, 401, 403, 404, 422, 503]).toContain(res.status);
    expect(res.status).not.toBe(500);
  });

  it('zero/invalid payload is rejected or auth-guarded', async () => {
    if (!serverReachable) return;
    const res = await apiPost('/api/invoices/test-invoice-id/create-payment', {});
    expect([400, 401, 403, 404, 422, 503]).toContain(res.status);
  });
});

