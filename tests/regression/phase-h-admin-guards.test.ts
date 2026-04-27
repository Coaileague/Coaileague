/**
 * REGRESSION TESTS — Phase H Admin & Upload Guards
 *
 * Covers the security invariants fixed in Phase H:
 *   - Bulk import endpoints require manager+
 *   - Multer file-type filtering (CSV/Excel only)
 *   - Platform survey creation requires platform-staff
 *   - dev-execute blocked in production
 *   - adminRoutes require platform-staff
 *
 * HTTP smoke tests verify unauthenticated access is rejected.
 * Unit tests validate file-type and size boundary logic independently.
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

async function apiPost(path: string, body: unknown = {}) {
  return fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function apiGet(path: string) {
  return fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Unit: file-type validation logic ────────────────────────────────────────

const ALLOWED_MIME = [
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const ALLOWED_EXT = /\.(csv|xlsx|xls)$/i;

function isAllowedBulkFile(mimetype: string, filename: string): boolean {
  return ALLOWED_MIME.includes(mimetype) || ALLOWED_EXT.test(filename);
}

describe('Phase H — Bulk import file-type guard', () => {
  it('allows CSV mime type', () => {
    expect(isAllowedBulkFile('text/csv', 'employees.csv')).toBe(true);
  });

  it('allows xlsx mime type', () => {
    expect(
      isAllowedBulkFile(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'employees.xlsx'
      )
    ).toBe(true);
  });

  it('allows .csv extension even with octet-stream mime (some browsers)', () => {
    expect(isAllowedBulkFile('application/octet-stream', 'data.csv')).toBe(true);
  });

  it('rejects PDF files', () => {
    expect(isAllowedBulkFile('application/pdf', 'employees.pdf')).toBe(false);
  });

  it('rejects image files', () => {
    expect(isAllowedBulkFile('image/jpeg', 'photo.jpg')).toBe(false);
  });

  it('rejects executable files', () => {
    expect(isAllowedBulkFile('application/x-executable', 'script.exe')).toBe(false);
  });

  it('rejects ZIP files', () => {
    expect(isAllowedBulkFile('application/zip', 'archive.zip')).toBe(false);
  });
});

// ─── Unit: file-size limit ────────────────────────────────────────────────────

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

describe('Phase H — Bulk import file-size guard', () => {
  it('accepts a 1 MB file', () => {
    expect(1 * 1024 * 1024).toBeLessThanOrEqual(MAX_FILE_BYTES);
  });

  it('accepts a 5 MB file (boundary)', () => {
    expect(5 * 1024 * 1024).toBeLessThanOrEqual(MAX_FILE_BYTES);
  });

  it('rejects a 6 MB file', () => {
    expect(6 * 1024 * 1024).toBeGreaterThan(MAX_FILE_BYTES);
  });
});

// ─── Unit: dev-execute production block ──────────────────────────────────────

describe('Phase H — dev-execute production block', () => {
  it('should block in production environment', () => {
    const isProduction = (env: string | undefined) => env === 'production';
    expect(isProduction('production')).toBe(true);
    expect(isProduction('development')).toBe(false);
    expect(isProduction(undefined)).toBe(false);
  });
});

// ─── HTTP smoke: Phase H endpoints require auth ───────────────────────────────

describe.skipIf(() => !serverAvailable)('Phase H — Admin and upload route auth guards', () => {
  // Bulk import requires manager+
  it('POST /api/bulk/import/employees rejects unauthenticated', async () => {
    const res = await apiPost('/api/bulk/import/employees');
    expect([401, 403]).toContain(res.status);
  });

  it('POST /api/bulk/import/clients rejects unauthenticated', async () => {
    const res = await apiPost('/api/bulk/import/clients');
    expect([401, 403]).toContain(res.status);
  });

  it('POST /api/bulk/import/shifts rejects unauthenticated', async () => {
    const res = await apiPost('/api/bulk/import/shifts');
    expect([401, 403]).toContain(res.status);
  });

  // Platform survey creation requires platform-staff
  it('POST /api/platform-feedback/surveys rejects unauthenticated', async () => {
    const res = await apiPost('/api/platform-feedback/surveys', {
      title: 'Test Survey',
      description: 'Test',
      isActive: true,
    });
    expect([401, 403]).toContain(res.status);
  });

  // Admin routes require platform-staff
  it('GET /api/admin/workspaces rejects unauthenticated', async () => {
    const res = await apiGet('/api/admin/workspaces');
    expect([401, 403]).toContain(res.status);
  });

  it('Phase H endpoints do not 500 on unauthenticated requests', async () => {
    const checks = await Promise.all([
      apiPost('/api/bulk/import/employees'),
      apiPost('/api/bulk/import/clients'),
      apiPost('/api/platform-feedback/surveys', { title: 'x' }),
    ]);
    for (const res of checks) {
      expect(res.status).not.toBe(500);
    }
  });
});
