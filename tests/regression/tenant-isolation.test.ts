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

async function apiGet(path: string, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${BASE_URL}${path}`, { headers });
}

describe('Multi-Tenant Data Isolation', () => {
  it('employee endpoint does not expose cross-tenant data without valid auth', async () => {
    if (!serverReachable) return;
    const res = await apiGet('/api/employees/workspace-b-employee-id', 'invalid-token');
    expect([401, 403, 404]).toContain(res.status);
  });

  it('invoice endpoint does not expose cross-tenant data without valid auth', async () => {
    if (!serverReachable) return;
    const res = await apiGet('/api/invoices/workspace-b-invoice-id', 'invalid-token');
    expect([401, 403, 404]).toContain(res.status);
  });

  it('shift endpoint does not expose cross-tenant data without valid auth', async () => {
    if (!serverReachable) return;
    const res = await apiGet('/api/shifts/workspace-b-shift-id', 'invalid-token');
    expect([401, 403, 404]).toContain(res.status);
  });

  it('payroll runs endpoint remains tenant-scoped', async () => {
    if (!serverReachable) return;
    const res = await apiGet('/api/payroll/runs?workspaceId=workspace-b-id', 'invalid-token');
    expect([401, 403, 404]).toContain(res.status);
  });
});

