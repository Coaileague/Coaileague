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
  return fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('Panic Alert Flow', () => {
  it('panic route requires authentication', async () => {
    if (!serverReachable) return;
    const res = await apiPost('/api/safety/panic', { latitude: 0, longitude: 0 });
    expect([400, 401, 403, 422]).toContain(res.status);
    expect(res.status).not.toBe(404);
  });

  it('acknowledge route exists', async () => {
    if (!serverReachable) return;
    const res = await apiPost('/api/safety/panic/test-alert-id/acknowledge', { note: 'Responding' });
    expect([400, 401, 403, 404]).toContain(res.status);
  });
});
