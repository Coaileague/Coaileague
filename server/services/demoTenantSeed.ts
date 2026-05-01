/**
 * Demo Tenant Seed — Readiness Section 16
 * =========================================
 * Sales / demo helper. Creates a realistic but generically-named workspace
 * that the sales team can drive during prospect calls WITHOUT exposing
 * Statewide's real data (the prior default demo).
 *
 * Intentionally small: 1 workspace, 5 clients, 6 employees, 5 shifts,
 * 2 invoices. Just enough for a compelling demo — not a full production
 * dataset.
 *
 * Callable from the platform admin surface via POST
 * /api/admin/demo-tenant-seed. Admin-gated. Idempotent via a sentinel
 * workspace ID.
 *
 * NOTE: Unlike developmentSeed.ts, this is *not* gated on
 * isProduction() — it's designed to run in production so sales has a
 * live demo in the real environment. The gate is role-based instead.
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { createLogger } from '../lib/logger';

const log = createLogger('demoTenantSeed');

export const DEMO_WORKSPACE_ID = 'demo-security-services-ws';
export const DEMO_WORKSPACE_NAME = 'Demo Security Services';

export interface DemoSeedResult {
  success: boolean;
  workspaceId: string;
  workspaceName: string;
  created: boolean;
  message: string;
  counts?: {
    clients: number;
    employees: number;
    shifts: number;
    invoices: number;
  };
}

async function exists(workspaceId: string): Promise<boolean> {
  const r = await db.execute(
    sql`SELECT 1 FROM workspaces WHERE id = ${workspaceId} LIMIT 1`,
  );
  return ((r as any).rows?.length ?? 0) > 0;
}

/**
 * Seed the demo tenant. Idempotent — a second call on an existing
 * workspace returns { created: false } without modifying data.
 */
export async function seedDemoTenant(): Promise<DemoSeedResult> {
  try {
    if (await exists(DEMO_WORKSPACE_ID)) {
      return {
        success: true,
        workspaceId: DEMO_WORKSPACE_ID,
        workspaceName: DEMO_WORKSPACE_NAME,
        created: false,
        message: 'Demo tenant already exists; no changes made.',
      };
    }

    await db.execute(sql`
      INSERT INTO workspaces (id, company_name, created_at, updated_at)
      VALUES (${DEMO_WORKSPACE_ID}, ${DEMO_WORKSPACE_NAME}, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);

    // Clients — five generic security clients covering common industries
    const clientRows = [
      ['demo-client-1', 'Harbor Industrial Park', 'Industrial'],
      ['demo-client-2', 'Maple Heights Apartments', 'Residential'],
      ['demo-client-3', 'Riverfront Medical Center', 'Healthcare'],
      ['demo-client-4', 'Tech Commons Office Park', 'Commercial'],
      ['demo-client-5', 'Stadium District Events', 'Event'],
    ];
    for (const [id, name, category] of clientRows) {
      await db.execute(sql`
        INSERT INTO clients (id, workspace_id, company_name, industry, status, created_at, updated_at)
        VALUES (${id}, ${DEMO_WORKSPACE_ID}, ${name}, ${category}, 'active', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `);
    }

    // Employees — six officers with common names (intentionally generic)
    const employeeRows = [
      ['demo-emp-1', 'Alex',    'Rivera',  'officer'],
      ['demo-emp-2', 'Jamie',   'Morgan',  'officer'],
      ['demo-emp-3', 'Taylor',  'Chen',    'supervisor'],
      ['demo-emp-4', 'Jordan',  'Patel',   'officer'],
      ['demo-emp-5', 'Morgan',  'Nguyen',  'officer'],
      ['demo-emp-6', 'Casey',   'Brooks',  'manager'],
    ];
    for (const [id, first, last, role] of employeeRows) {
      await db.execute(sql`
        INSERT INTO employees (id, workspace_id, first_name, last_name, role, status, created_at, updated_at)
        VALUES (${id}, ${DEMO_WORKSPACE_ID}, ${first}, ${last}, ${role}, 'active', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `);
    }

    // Shifts — a spread across the next 7 days
    for (let i = 0; i < 5; i++) {
      const start = new Date(Date.now() + i * 24 * 60 * 60 * 1000 + 16 * 60 * 60 * 1000);
      const end   = new Date(start.getTime() + 8 * 60 * 60 * 1000);
      await db.execute(sql`
        INSERT INTO shifts (id, workspace_id, client_id, employee_id, start_time, end_time, status, created_at, updated_at)
        VALUES (
          ${'demo-shift-' + (i + 1)},
          ${DEMO_WORKSPACE_ID},
          ${clientRows[i % clientRows.length][0]},
          ${employeeRows[i % employeeRows.length][0]},
          ${start.toISOString()},
          ${end.toISOString()},
          'scheduled', NOW(), NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `);
    }

    // Invoices — two, one paid + one sent
    await db.execute(sql`
      INSERT INTO invoices (id, workspace_id, client_id, amount, status, invoice_number, created_at, updated_at)
      VALUES (
        ${'demo-invoice-1'}, ${DEMO_WORKSPACE_ID}, ${'demo-client-1'}, 4820.00, 'paid', 'INV-DEMO-0001', NOW(), NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO invoices (id, workspace_id, client_id, amount, status, invoice_number, created_at, updated_at)
      VALUES (
        ${'demo-invoice-2'}, ${DEMO_WORKSPACE_ID}, ${'demo-client-3'}, 6240.00, 'sent', 'INV-DEMO-0002', NOW(), NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `);

    log.info(`[demoTenantSeed] Created demo tenant ${DEMO_WORKSPACE_ID}`);

    return {
      success: true,
      workspaceId: DEMO_WORKSPACE_ID,
      workspaceName: DEMO_WORKSPACE_NAME,
      created: true,
      message: 'Demo tenant created.',
      counts: { clients: 5, employees: 6, shifts: 5, invoices: 2 },
    };
  } catch (err: unknown) {
    log.error('[demoTenantSeed] failed:', err?.message);
    return {
      success: false,
      workspaceId: DEMO_WORKSPACE_ID,
      workspaceName: DEMO_WORKSPACE_NAME,
      created: false,
      message: err?.message || 'Demo tenant seed failed',
    };
  }
}
