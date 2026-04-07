/**
 * ACME SECURITY — COMPREHENSIVE SEED SPRINT
 * Populates the dev-acme-security-ws workspace with rich, realistic data
 * covering every feature in the 35-series build and beyond.
 *
 * 100% IDEMPOTENT — safe to run multiple times with ON CONFLICT DO NOTHING.
 * Targets ONLY dev-acme-security-ws — never touches production.
 *
 * Run via: POST /api/admin/seed/acme (platform_staff, dev only)
 */

import { pool } from "../db";

const WS = "dev-acme-security-ws";
const OWNER_EMP = "dev-acme-emp-001";   // Marcus Rivera, org_owner
const MGR_EMP   = "dev-acme-emp-002";   // Sarah Chen, manager
const MGR2_EMP  = "dev-acme-emp-003";   // James Washington, scheduling manager

// ── Existing officer IDs (from developmentSeed.ts) ──────────────────────────
const OFFICERS = [
  "dev-acme-emp-004", "dev-acme-emp-005", "dev-acme-emp-006",
  "dev-acme-emp-007", "dev-acme-emp-008", "dev-acme-emp-009",
  "dev-acme-emp-010", "dev-acme-emp-011", "dev-acme-emp-012",
  "dev-acme-emp-013",
];

// ── Existing client IDs (from developmentSeed.ts) ───────────────────────────
const C1 = "dev-client-001"; // Riverside Shopping Center
const C2 = "dev-client-002"; // Pinnacle Tower LLC
const C3 = "dev-client-003"; // Lone Star Medical Center
const C4 = "dev-client-004"; // Texas Star Event Center
const C5 = "dev-client-005"; // Heritage National Bank
const C6 = "dev-client-006"; // Oakwood Residential Management
const C7 = "dev-client-007"; // DFW Distribution Center

// ── Helper functions ──────────────────────────────────────────────────────────
function ago(days: number, extraHours = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  if (extraHours !== 0) d.setHours(d.getHours() - extraHours);
  return d.toISOString();
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function dateAgo(days: number): string {
  return ago(days).split('T')[0];
}

async function q(sql: string, params?: any[]): Promise<void> {
  try {
    await pool.query(sql, params);
  } catch (err: any) {
    const msg = (err.message || '').substring(0, 200);
    // Only log non-trivial errors (not unique violations from idempotent runs)
    if (!msg.includes('duplicate key')) {
      console.error(`[SeedACME] SQL error: ${msg}`);
    }
  }
}

async function seedSection(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(`[SeedACME] Seeding ${name}...`);
  try {
    await fn();
    console.log(`[SeedACME] ✓ ${name}`);
  } catch (err: any) {
    console.error(`[SeedACME] ✗ ${name}: ${(err.message || '').substring(0, 300)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════
export async function seedAcmeComplete(): Promise<{ success: boolean; message: string; counts: Record<string, number> }> {
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production';
  if (isProduction) {
    return { success: false, message: 'Refused — production environment', counts: {} };
  }

  console.log('[SeedACME] ════════ ACME COMPLETE SEED SPRINT ════════');
  const counts: Record<string, number> = {};

  // ──────────────────────────────────────────────────────────────────────────
  // 1. ADDITIONAL USERS & EMPLOYEES (bypass accounts + 2 pending onboarding)
  // ──────────────────────────────────────────────────────────────────────────
  await seedSection('additional users & employees', async () => {
    const HASH = '$2b$10$XEUX3wL9wI2VEjEoUdCSw.O8xFVIfhUJAGahknql8PdWYj0DITrSe';
    const additionalUsers = [
      { id: 'dev-officer-bypass', email: 'officer@acme-security.test', fn: 'Officer', ln: 'Bypass' },
      { id: 'dev-supervisor-bypass', email: 'supervisor@acme-security.test', fn: 'Supervisor', ln: 'Bypass' },
      { id: 'dev-compliance-bypass', email: 'compliance@acme-security.test', fn: 'Compliance', ln: 'Bypass' },
      { id: 'dev-emp-new-001', email: 'pending1@acme-security.test', fn: 'Jordan', ln: 'Reyes' },
      { id: 'dev-emp-new-002', email: 'pending2@acme-security.test', fn: 'Tyler', ln: 'Nguyen' },
    ];
    for (const u of additionalUsers) {
      await q(`
        INSERT INTO users (id, email, first_name, last_name, password_hash, role, email_verified, current_workspace_id, created_at, updated_at, login_attempts, mfa_enabled)
        VALUES ($1, $2, $3, $4, $5, 'user', TRUE, $6, NOW(), NOW(), 0, FALSE)
        ON CONFLICT (id) DO NOTHING
      `, [u.id, u.email, u.fn, u.ln, HASH, WS]);
    }

    const newEmps = [
      { id: 'dev-acme-emp-014', userId: 'dev-emp-new-001', fn: 'Jordan', ln: 'Reyes', email: 'pending1@acme-security.test', role: 'Security Officer', wsRole: 'employee', status: 'pending', empNum: 'EMP-ACME-00014', rate: '20.00' },
      { id: 'dev-acme-emp-015', userId: 'dev-emp-new-002', fn: 'Tyler', ln: 'Nguyen', email: 'pending2@acme-security.test', role: 'Security Officer', wsRole: 'employee', status: 'pending', empNum: 'EMP-ACME-00015', rate: '21.00' },
      { id: 'dev-acme-emp-officer-bp', userId: 'dev-officer-bypass', fn: 'Officer', ln: 'Bypass', email: 'officer@acme-security.test', role: 'Security Officer', wsRole: 'employee', status: 'active', empNum: 'EMP-ACME-00016', rate: '22.00' },
      { id: 'dev-acme-emp-super-bp',  userId: 'dev-supervisor-bypass', fn: 'Supervisor', ln: 'Bypass', email: 'supervisor@acme-security.test', role: 'Field Supervisor', wsRole: 'manager', status: 'active', empNum: 'EMP-ACME-00017', rate: '32.00' },
      { id: 'dev-acme-emp-comp-bp',   userId: 'dev-compliance-bypass', fn: 'Compliance', ln: 'Bypass', email: 'compliance@acme-security.test', role: 'Compliance Officer', wsRole: 'manager', status: 'active', empNum: 'EMP-ACME-00018', rate: '34.00' },
    ];
    for (const e of newEmps) {
      await q(`
        INSERT INTO employees (id, workspace_id, user_id, first_name, last_name, email, role, workspace_role, status, employee_number, hourly_rate, hire_date, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW() - INTERVAL '30 days', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `, [e.id, WS, e.userId, e.fn, e.ln, e.email, e.role, e.wsRole, e.status, e.empNum, e.rate]);
    }

    // Enrich existing employees with emergency contacts and dates
    const updates = [
      { id: 'dev-acme-emp-004', ec: 'Rosa Garcia',      ep: '214-555-9901', er: 'Spouse' },
      { id: 'dev-acme-emp-005', ec: 'Brian Johnson',    ep: '214-555-9902', er: 'Brother' },
      { id: 'dev-acme-emp-006', ec: 'Patricia Williams', ep: '214-555-9903', er: 'Mother' },
      { id: 'dev-acme-emp-007', ec: 'Jose Martinez',    ep: '214-555-9904', er: 'Father' },
      { id: 'dev-acme-emp-008', ec: 'Linda Thompson',   ep: '214-555-9905', er: 'Spouse' },
      { id: 'dev-acme-emp-009', ec: 'Marcus Davis',     ep: '214-555-9906', er: 'Spouse' },
      { id: 'dev-acme-emp-010', ec: 'Nancy Brown',      ep: '214-555-9907', er: 'Mother' },
      { id: 'dev-acme-emp-011', ec: 'Tom Lee',          ep: '214-555-9908', er: 'Spouse' },
      { id: 'dev-acme-emp-012', ec: 'Angela Wilson',    ep: '214-555-9909', er: 'Spouse' },
      { id: 'dev-acme-emp-013', ec: 'Steve Anderson',   ep: '214-555-9910', er: 'Brother' },
    ];
    for (const u of updates) {
      await q(`
        UPDATE employees SET
          emergency_contact_name = $2,
          emergency_contact_phone = $3,
          emergency_contact_relation = $4,
          hire_date = COALESCE(hire_date, NOW() - INTERVAL '18 months'),
          address = COALESCE(address, '1234 Oak Lane'),
          city = COALESCE(city, 'Dallas'),
          state = COALESCE(state, 'TX'),
          zip_code = COALESCE(zip_code, '75201')
        WHERE id = $1 AND workspace_id = $5
      `, [u.id, u.ec, u.ep, u.er, WS]);
    }
    counts.employees = newEmps.length;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. INVOICE HISTORY — 25 invoices in various states
  // ──────────────────────────────────────────────────────────────────────────
  await seedSection('invoices (25)', async () => {
    const invoices = [
      // Paid (8)
      { id: 'acme-inv-p001', cli: C1, num: 'INV-2025-1001', sub: '8400.00', status: 'paid',     iss: ago(90), due: ago(75) },
      { id: 'acme-inv-p002', cli: C2, num: 'INV-2025-1002', sub: '6200.00', status: 'paid',     iss: ago(82), due: ago(67) },
      { id: 'acme-inv-p003', cli: C3, num: 'INV-2025-1003', sub: '9100.00', status: 'paid',     iss: ago(75), due: ago(60) },
      { id: 'acme-inv-p004', cli: C5, num: 'INV-2025-1004', sub: '11200.00', status: 'paid',    iss: ago(68), due: ago(53) },
      { id: 'acme-inv-p005', cli: C1, num: 'INV-2025-1005', sub: '8600.00', status: 'paid',     iss: ago(60), due: ago(45) },
      { id: 'acme-inv-p006', cli: C4, num: 'INV-2025-1006', sub: '4800.00', status: 'paid',     iss: ago(52), due: ago(37) },
      { id: 'acme-inv-p007', cli: C6, num: 'INV-2025-1007', sub: '3600.00', status: 'paid',     iss: ago(45), due: ago(30) },
      { id: 'acme-inv-p008', cli: C7, num: 'INV-2025-1008', sub: '5200.00', status: 'paid',     iss: ago(38), due: ago(23) },
      // Sent (5)
      { id: 'acme-inv-s001', cli: C1, num: 'INV-2026-2001', sub: '8800.00', status: 'sent',     iss: ago(14), due: ago(-16) },
      { id: 'acme-inv-s002', cli: C2, num: 'INV-2026-2002', sub: '6400.00', status: 'sent',     iss: ago(12), due: ago(-18) },
      { id: 'acme-inv-s003', cli: C3, num: 'INV-2026-2003', sub: '9400.00', status: 'sent',     iss: ago(10), due: ago(-20) },
      { id: 'acme-inv-s004', cli: C5, num: 'INV-2026-2004', sub: '11600.00', status: 'sent',    iss: ago(8),  due: ago(-22) },
      { id: 'acme-inv-s005', cli: C6, num: 'INV-2026-2005', sub: '3800.00', status: 'sent',     iss: ago(6),  due: ago(-24) },
      // Overdue (3)
      { id: 'acme-inv-o001', cli: C4, num: 'INV-2026-3001', sub: '5100.00', status: 'overdue',  iss: ago(35), due: ago(5) },
      { id: 'acme-inv-o002', cli: C7, num: 'INV-2026-3002', sub: '5500.00', status: 'overdue',  iss: ago(40), due: ago(10) },
      { id: 'acme-inv-o003', cli: C1, num: 'INV-2026-3003', sub: '4200.00', status: 'overdue',  iss: ago(38), due: ago(8) },
      // Disputed (2)
      { id: 'acme-inv-d001', cli: C2, num: 'INV-2026-4001', sub: '6800.00', status: 'disputed', iss: ago(25), due: ago(10) },
      { id: 'acme-inv-d002', cli: C5, num: 'INV-2026-4002', sub: '10500.00', status: 'disputed', iss: ago(20), due: ago(5) },
      // Void (2)
      { id: 'acme-inv-v001', cli: C3, num: 'INV-2026-5001', sub: '2200.00', status: 'void',     iss: ago(50), due: ago(35) },
      { id: 'acme-inv-v002', cli: C4, num: 'INV-2026-5002', sub: '1800.00', status: 'void',     iss: ago(45), due: ago(30) },
      // Draft (5)
      { id: 'acme-inv-dr01', cli: C1, num: 'INV-2026-6001', sub: '9000.00', status: 'draft',    iss: ago(2),  due: ago(-28) },
      { id: 'acme-inv-dr02', cli: C2, num: 'INV-2026-6002', sub: '6600.00', status: 'draft',    iss: ago(2),  due: ago(-28) },
      { id: 'acme-inv-dr03', cli: C3, num: 'INV-2026-6003', sub: '9600.00', status: 'draft',    iss: ago(1),  due: ago(-29) },
      { id: 'acme-inv-dr04', cli: C5, num: 'INV-2026-6004', sub: '12000.00', status: 'draft',   iss: ago(1),  due: ago(-29) },
      { id: 'acme-inv-dr05', cli: C7, num: 'INV-2026-6005', sub: '5600.00', status: 'draft',    iss: ago(0),  due: ago(-30) },
    ];
    for (const inv of invoices) {
      await q(`
        INSERT INTO invoices (id, workspace_id, client_id, invoice_number, issue_date, due_date, subtotal, tax_rate, tax_amount, total, status, amount_paid, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, '0.00', '0.00', $7, $8, CASE WHEN $8 = 'paid' THEN $7 ELSE '0.00' END, $5, NOW())
        ON CONFLICT (id) DO NOTHING
      `, [inv.id, WS, inv.cli, inv.num, inv.iss, inv.due, inv.sub, inv.status]);
    }
    counts.invoices = invoices.length;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. PAYROLL RUNS — 6 biweekly runs over 3 months
  // ──────────────────────────────────────────────────────────────────────────
  await seedSection('payroll runs (6)', async () => {
    const runs = [
      { id: 'acme-pr-001', ps: ago(84), pe: ago(70), status: 'completed', gross: '28400.00', taxes: '5960.00', net: '22440.00' },
      { id: 'acme-pr-002', ps: ago(70), pe: ago(56), status: 'completed', gross: '29200.00', taxes: '6132.00', net: '23068.00' },
      { id: 'acme-pr-003', ps: ago(56), pe: ago(42), status: 'completed', gross: '27600.00', taxes: '5796.00', net: '21804.00' },
      { id: 'acme-pr-004', ps: ago(42), pe: ago(28), status: 'completed', gross: '30100.00', taxes: '6321.00', net: '23779.00' },
      { id: 'acme-pr-005', ps: ago(28), pe: ago(14), status: 'approved',  gross: '29800.00', taxes: '6258.00', net: '23542.00' },
      { id: 'acme-pr-006', ps: ago(14), pe: ago(0),  status: 'draft',    gross: '0.00',     taxes: '0.00',    net: '0.00' },
    ];
    for (const r of runs) {
      await q(`
        INSERT INTO payroll_runs (id, workspace_id, period_start, period_end, status, total_gross_pay, total_taxes, total_net_pay, processed_by, processed_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $5 IN ('completed','approved') THEN NOW() - INTERVAL '3 days' ELSE NULL END, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `, [r.id, WS, r.ps, r.pe, r.status, r.gross, r.taxes, r.net, OWNER_EMP]);
    }

    // Payroll entries for completed runs
    const completedRuns = ['acme-pr-001', 'acme-pr-002', 'acme-pr-003', 'acme-pr-004'];
    const activeOfficers = OFFICERS.slice(0, 8);
    for (const runId of completedRuns) {
      for (const empId of activeOfficers) {
        const entryId = `pe-${runId}-${empId}`;
        const hoursBase = 75 + Math.floor(Math.random() * 10);
        const rate = 21 + Math.floor(Math.random() * 5);
        const gross = (hoursBase * rate).toFixed(2);
        const net = (parseFloat(gross) * 0.79).toFixed(2);
        await q(`
          INSERT INTO payroll_entries (id, workspace_id, payroll_run_id, employee_id, regular_hours, overtime_hours, gross_pay, net_pay, tax_withholding, status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, 'processed', NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `, [entryId, WS, runId, empId, hoursBase, gross, net, (parseFloat(gross) * 0.21).toFixed(2)]);
      }
    }
    counts.payrollRuns = runs.length;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. VISITOR MANAGEMENT LOGS
  // ──────────────────────────────────────────────────────────────────────────
  await seedSection('visitor logs', async () => {
    const visitors = [
      { id: 'acme-vl-001', site: C3, siteName: 'Lone Star Medical Center', name: 'Dr. Michael Foster', company: 'Medline Supplies', type: 'vendor', purpose: 'Medical supply delivery', badge: 'V-0841', inAt: ago(0, 4), outAt: ago(0, 2), by: 'dev-acme-emp-007' },
      { id: 'acme-vl-002', site: C3, siteName: 'Lone Star Medical Center', name: 'Rebecca Nguyen', company: 'LabCorp', type: 'vendor', purpose: 'Lab sample pickup', badge: 'V-0842', inAt: ago(0, 5), outAt: ago(0, 4), by: 'dev-acme-emp-007' },
      { id: 'acme-vl-003', site: C3, siteName: 'Lone Star Medical Center', name: 'Carlos Vega', company: 'Biotech Solutions', type: 'contractor', purpose: 'Equipment maintenance', badge: 'V-0843', inAt: ago(0, 6), outAt: null, by: 'dev-acme-emp-007' },
      { id: 'acme-vl-004', site: C2, siteName: 'Pinnacle Tower LLC', name: 'Sandra Park', company: 'CBRE Group', type: 'guest', purpose: 'Office tour', badge: 'V-1201', inAt: ago(0, 3), outAt: ago(0, 1), by: 'dev-acme-emp-006' },
      { id: 'acme-vl-005', site: C2, siteName: 'Pinnacle Tower LLC', name: 'James O\'Brien', company: 'Tech Consulting LLC', type: 'guest', purpose: 'Tenant meeting', badge: 'V-1202', inAt: ago(0, 4), outAt: ago(0, 2), by: 'dev-acme-emp-006' },
      { id: 'acme-vl-006', site: C1, siteName: 'Riverside Shopping Center', name: 'Luis Hernandez', company: 'City Fire Marshal', type: 'law_enforcement', purpose: 'Annual fire inspection', badge: 'V-0501', inAt: ago(1, 3), outAt: ago(1, 1), by: 'dev-acme-emp-004' },
      { id: 'acme-vl-007', site: C1, siteName: 'Riverside Shopping Center', name: 'Amy Chen', company: null, type: 'guest', purpose: 'Retail vendor interview', badge: 'V-0502', inAt: ago(1, 5), outAt: ago(1, 3), by: 'dev-acme-emp-004' },
      { id: 'acme-vl-008', site: C2, siteName: 'Pinnacle Tower LLC', name: 'David Kowalski', company: 'Apex Cleaning', type: 'vendor', purpose: 'Cleaning contract renewal', badge: 'V-1203', inAt: ago(0, 2), outAt: null, by: 'dev-acme-emp-006' },
      { id: 'acme-vl-009', site: C3, siteName: 'Lone Star Medical Center', name: 'Victor Salazar', company: 'MedTech Corp', type: 'vendor', purpose: 'Equipment demo', badge: 'V-0844', inAt: ago(1, 2), outAt: null, by: 'dev-acme-emp-007' },
    ];
    for (const v of visitors) {
      await q(`
        INSERT INTO visitor_logs (id, workspace_id, site_id, site_name, visitor_name, visitor_company, visitor_type, purpose, visitor_badge_number, checked_in_at, checked_out_at, checked_in_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        ON CONFLICT (id) DO NOTHING
      `, [v.id, WS, v.site, v.siteName, v.name, v.company, v.type, v.purpose, v.badge, v.inAt, v.outAt, v.by]);
    }

    // Pre-registrations for tomorrow
    const preRegs = [
      { id: 'acme-pr-v001', site: C2, siteName: 'Pinnacle Tower LLC', name: 'Karen Williams', company: 'JLL Property Mgmt', type: 'guest', purpose: 'Lease negotiation', host: 'Rebecca Stone', scheduled: daysFromNow(1) },
      { id: 'acme-pr-v002', site: C3, siteName: 'Lone Star Medical Center', name: 'Dr. Paul Richards', company: 'Texas Health', type: 'guest', purpose: 'Board meeting', host: 'Dr. Karen Mitchell', scheduled: daysFromNow(1) },
      { id: 'acme-pr-v003', site: C1, siteName: 'Riverside Shopping Center', name: 'Frank Deluca', company: 'Retail Consultants', type: 'vendor', purpose: 'Sales presentation', host: 'Tom Bradley', scheduled: daysFromNow(1) },
    ];
    for (const p of preRegs) {
      await q(`
        INSERT INTO visitor_pre_registrations (id, workspace_id, site_id, site_name, visitor_name, visitor_company, visitor_type, purpose, host_name, scheduled_arrival, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', NOW())
        ON CONFLICT (id) DO NOTHING
      `, [p.id, WS, p.site, p.siteName, p.name, p.company, p.type, p.purpose, p.host, p.scheduled]);
    }
    counts.visitorLogs = visitors.length;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. EQUIPMENT INVENTORY + ASSIGNMENTS
  // ──────────────────────────────────────────────────────────────────────────
  await seedSection('equipment inventory & assignments', async () => {
    const items = [
      { id: 'eq-u001', name: 'Uniform Set - Large',          cat: 'uniform',    status: 'in_service',  serial: 'UNI-L-001' },
      { id: 'eq-u002', name: 'Uniform Set - Large',          cat: 'uniform',    status: 'in_service',  serial: 'UNI-L-002' },
      { id: 'eq-u003', name: 'Uniform Set - Medium',         cat: 'uniform',    status: 'in_service',  serial: 'UNI-M-001' },
      { id: 'eq-u004', name: 'Uniform Set - Medium',         cat: 'uniform',    status: 'in_service',  serial: 'UNI-M-002' },
      { id: 'eq-u005', name: 'Uniform Set - Medium',         cat: 'uniform',    status: 'in_service',  serial: 'UNI-M-003' },
      { id: 'eq-u006', name: 'Uniform Set - Small',          cat: 'uniform',    status: 'in_service',  serial: 'UNI-S-001' },
      { id: 'eq-u007', name: 'Uniform Set - XL',             cat: 'uniform',    status: 'in_service',  serial: 'UNI-XL-001' },
      { id: 'eq-u008', name: 'Uniform Set - XL',             cat: 'uniform',    status: 'in_service',  serial: 'UNI-XL-002' },
      { id: 'eq-u009', name: 'Uniform Set - Large',          cat: 'uniform',    status: 'damaged',     serial: 'UNI-L-003' },
      { id: 'eq-r001', name: 'Motorola APX 900 Radio',       cat: 'radio',      status: 'in_service',  serial: 'RAD-900-001' },
      { id: 'eq-r002', name: 'Motorola APX 900 Radio',       cat: 'radio',      status: 'in_service',  serial: 'RAD-900-002' },
      { id: 'eq-r003', name: 'Motorola APX 900 Radio',       cat: 'radio',      status: 'in_service',  serial: 'RAD-900-003' },
      { id: 'eq-r004', name: 'Motorola APX 900 Radio',       cat: 'radio',      status: 'in_service',  serial: 'RAD-900-004' },
      { id: 'eq-r005', name: 'Motorola APX 900 Radio',       cat: 'radio',      status: 'in_service',  serial: 'RAD-900-005' },
      { id: 'eq-r006', name: 'Kenwood TK-3400 Radio',        cat: 'radio',      status: 'maintenance', serial: 'RAD-K34-001' },
      { id: 'eq-r007', name: 'Kenwood TK-3400 Radio',        cat: 'radio',      status: 'in_service',  serial: 'RAD-K34-002' },
      { id: 'eq-h001', name: 'Peerless 750 Handcuffs',       cat: 'restraint',  status: 'in_service',  serial: 'HC-P750-001' },
      { id: 'eq-h002', name: 'Peerless 750 Handcuffs',       cat: 'restraint',  status: 'in_service',  serial: 'HC-P750-002' },
      { id: 'eq-b001', name: 'Streamlight ProTac Flashlight', cat: 'equipment', status: 'in_service',  serial: 'FL-PT-001' },
      { id: 'eq-b002', name: 'Streamlight ProTac Flashlight', cat: 'equipment', status: 'in_service',  serial: 'FL-PT-002' },
      { id: 'eq-c001', name: 'Body Camera - Axon Body 3',    cat: 'camera',     status: 'in_service',  serial: 'CAM-AX3-001' },
      { id: 'eq-c002', name: 'Body Camera - Axon Body 3',    cat: 'camera',     status: 'in_service',  serial: 'CAM-AX3-002' },
      { id: 'eq-o001', name: 'OC Pepper Spray',              cat: 'equipment',  status: 'in_service',  serial: 'OC-001' },
    ];
    for (const item of items) {
      await q(`
        INSERT INTO equipment_items (id, workspace_id, name, category, quantity, status, serial_number, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 1, $5, $6, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `, [item.id, WS, item.name, item.cat, item.status, item.serial]);
    }

    const assignments = [
      { id: 'ea-001', emp: 'dev-acme-emp-004', item: 'eq-u001', at: ago(300) },
      { id: 'ea-002', emp: 'dev-acme-emp-005', item: 'eq-u002', at: ago(280) },
      { id: 'ea-003', emp: 'dev-acme-emp-006', item: 'eq-u003', at: ago(260) },
      { id: 'ea-004', emp: 'dev-acme-emp-007', item: 'eq-u004', at: ago(250) },
      { id: 'ea-005', emp: 'dev-acme-emp-008', item: 'eq-u005', at: ago(240) },
      { id: 'ea-006', emp: 'dev-acme-emp-009', item: 'eq-u006', at: ago(230) },
      { id: 'ea-007', emp: 'dev-acme-emp-010', item: 'eq-u007', at: ago(220) },
      { id: 'ea-008', emp: 'dev-acme-emp-011', item: 'eq-u008', at: ago(210) },
      { id: 'ea-r01', emp: 'dev-acme-emp-004', item: 'eq-r001', at: ago(300) },
      { id: 'ea-r02', emp: 'dev-acme-emp-005', item: 'eq-r002', at: ago(280) },
      { id: 'ea-r03', emp: 'dev-acme-emp-006', item: 'eq-r003', at: ago(260) },
      { id: 'ea-r04', emp: 'dev-acme-emp-007', item: 'eq-r004', at: ago(250) },
      { id: 'ea-r05', emp: 'dev-acme-emp-009', item: 'eq-r005', at: ago(230) },
    ];
    for (const a of assignments) {
      await q(`
        INSERT INTO equipment_assignments (id, workspace_id, equipment_item_id, employee_id, assigned_at, status, created_at)
        VALUES ($1, $2, $3, $4, $5, 'active', NOW())
        ON CONFLICT (id) DO NOTHING
      `, [a.id, WS, a.item, a.emp, a.at]);
    }
    counts.equipmentItems = items.length;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. CLIENT SATISFACTION / NPS SURVEYS
  // ──────────────────────────────────────────────────────────────────────────
  await seedSection('client satisfaction surveys', async () => {
    const surveys = [
      { id: 'csr-001', cli: C1, date: dateAgo(30), score: '9.0', nps: 9,  feedback: 'Very professional. Officers always on time and properly uniformed.', conductor: OWNER_EMP, followUp: false },
      { id: 'csr-002', cli: C2, date: dateAgo(25), score: '7.0', nps: 7,  feedback: 'Good service overall. Would appreciate faster incident response.', conductor: MGR_EMP, followUp: false },
      { id: 'csr-003', cli: C3, date: dateAgo(20), score: '4.0', nps: 4,  feedback: 'Officer frequently late for morning shift. Communication needs improvement.', conductor: OWNER_EMP, followUp: true },
      { id: 'csr-004', cli: C5, date: dateAgo(15), score: '9.0', nps: 9,  feedback: 'Excellent security presence. No incidents this quarter.', conductor: MGR_EMP, followUp: false },
      { id: 'csr-005', cli: C6, date: dateAgo(10), score: '8.0', nps: 8,  feedback: 'Officers handle residents with great professionalism.', conductor: MGR_EMP, followUp: false },
      { id: 'csr-006', cli: C4, date: dateAgo(5),  score: '7.0', nps: 7,  feedback: 'Event coverage adequate. More officers needed for large events.', conductor: OWNER_EMP, followUp: false },
    ];
    for (const s of surveys) {
      await q(`
        INSERT INTO client_satisfaction_records (id, workspace_id, client_id, check_in_type, check_in_date, conducted_by, satisfaction_score, nps_score, feedback_text, issues_resolved, follow_up_required, created_at)
        VALUES ($1, $2, $3, 'scheduled', $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (id) DO NOTHING
      `, [s.id, WS, s.cli, s.date, s.conductor, s.score, s.nps, s.feedback, !s.followUp, s.followUp]);
    }
    counts.clientSurveys = surveys.length;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. EMPLOYEE RECOGNITION
  // ──────────────────────────────────────────────────────────────────────────
  await seedSection('employee recognition awards', async () => {
    const awards = [
      { id: 'acme-rec-001', emp: 'dev-acme-emp-004', by: OWNER_EMP, reason: 'Perfect attendance for Q4 2025 — zero calloffs, zero tardiness.', cat: 'attendance', client: C1 },
      { id: 'acme-rec-002', emp: 'dev-acme-emp-009', by: MGR_EMP,   reason: 'Apprehended shoplifter at Riverside Mall. Professional de-escalation without incident.', cat: 'performance', client: C1 },
      { id: 'acme-rec-003', emp: 'dev-acme-emp-006', by: OWNER_EMP, reason: 'Client commendation from Pinnacle Tower — went above and beyond during medical emergency.', cat: 'client_commendation', client: C2 },
      { id: 'acme-rec-004', emp: 'dev-acme-emp-011', by: MGR_EMP,   reason: '6-month anniversary — consistent performance and zero incident reports.', cat: 'milestone', client: null },
      { id: 'acme-rec-005', emp: 'dev-acme-emp-005', by: OWNER_EMP, reason: 'Covered 3 emergency calloff shifts in one week without complaint.', cat: 'reliability', client: null },
    ];
    for (const a of awards) {
      await q(`
        INSERT INTO employee_recognition (id, workspace_id, recognized_employee_id, recognized_by_employee_id, reason, category, related_client_id, is_public, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW() - (RANDOM() * 30 || ' days')::INTERVAL)
        ON CONFLICT (id) DO NOTHING
      `, [a.id, WS, a.emp, a.by, a.reason, a.cat, a.client]);
    }
    counts.recognition = awards.length;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. TRESPASS NOTICES
  // ──────────────────────────────────────────────────────────────────────────
  await seedSection('trespass notices', async () => {
    const notices = [
      { id: 'tn-001', site: C1, siteName: 'Riverside Shopping Center', subject: 'Kevin Flores', desc: 'Male, 5\'10", 180 lbs, brown hair, tattoo on left forearm. Suspected shoplifter.', reason: 'Repeated shoplifting. Altercation with staff on 2026-01-14.', notice: 'TRN-ACME-0001', perm: false, until: daysFromNow(180), issuedBy: 'dev-acme-emp-004', issuedByName: 'Carlos Garcia' },
      { id: 'tn-002', site: C1, siteName: 'Riverside Shopping Center', subject: 'Maria Delgado', desc: 'Female, 5\'4", 130 lbs, black hair. Known associate of Flores.', reason: 'Trespassing and creating disturbance on 2026-01-20.', notice: 'TRN-ACME-0002', perm: false, until: daysFromNow(90), issuedBy: 'dev-acme-emp-004', issuedByName: 'Carlos Garcia' },
      { id: 'tn-003', site: C1, siteName: 'Riverside Shopping Center', subject: 'Unknown — Tag: ABC-1234', desc: 'Red 2018 Honda Civic, TX plate ABC-1234. Driver threatened security after hours.', reason: 'Parking lot trespass after hours. Threatened security officer.', notice: 'TRN-ACME-0003', perm: true, until: null, issuedBy: 'dev-acme-emp-009', issuedByName: 'Angela Davis' },
    ];
    for (const n of notices) {
      await q(`
        INSERT INTO trespass_notices (id, workspace_id, notice_number, site_id, site_name, subject_name, subject_description, reason, is_permanent, valid_until, issued_by_employee_id, issued_by_name, issued_at, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW() - INTERVAL '30 days', NOW())
        ON CONFLICT (id) DO NOTHING
      `, [n.id, WS, n.notice, n.site, n.siteName, n.subject, n.desc, n.reason, n.perm, n.until, n.issuedBy, n.issuedByName]);
    }
    counts.trespassNotices = notices.length;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 9. LONE WORKER / WELLNESS CHECK SESSIONS
  // ──────────────────────────────────────────────────────────────────────────
  await seedSection('lone worker sessions', async () => {
    const sessions = [
      { id: 'lws-001', emp: 'dev-acme-emp-007', status: 'active', interval: 30, lastIn: ago(0, 0), nextDue: ago(0, -1) },
      { id: 'lws-002', emp: 'dev-acme-emp-011', status: 'active', interval: 30, lastIn: ago(0, 1), nextDue: ago(0, 0) },
      { id: 'lws-003', emp: 'dev-acme-emp-006', status: 'ended',  interval: 30, lastIn: ago(1, 2), nextDue: null },
    ];
    for (const s of sessions) {
      await q(`
        INSERT INTO lone_worker_sessions (id, workspace_id, employee_id, status, check_in_interval, last_check_in, next_check_in_due, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `, [s.id, WS, s.emp, s.status, s.interval, s.lastIn, s.nextDue]);
    }
    counts.wellnessSessions = sessions.length;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 10. ANALYTICS DAILY SNAPSHOTS — 90 days
  // ──────────────────────────────────────────────────────────────────────────
  await seedSection('analytics snapshots (90 days)', async () => {
    const metrics = [
      { name: 'active_officers',  base: 10, variance: 2 },
      { name: 'shifts_completed', base: 8,  variance: 2 },
      { name: 'shifts_calloff',   base: 1,  variance: 1 },
      { name: 'invoice_revenue',  base: 12000, variance: 3000 },
      { name: 'payroll_cost',     base: 8000,  variance: 1500 },
      { name: 'client_count',     base: 7,  variance: 0 },
      { name: 'compliance_score', base: 87, variance: 5 },
      { name: 'attendance_rate',  base: 92, variance: 4 },
    ];
    for (let d = 0; d < 90; d++) {
      const snapDate = dateAgo(90 - d);
      for (const m of metrics) {
        const val = Math.max(0, m.base + (Math.random() * m.variance * 2 - m.variance));
        await q(`
          INSERT INTO analytics_daily_snapshots (workspace_id, snapshot_date, metric_name, metric_value, created_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT DO NOTHING
        `, [WS, snapDate, m.name, val.toFixed(2)]);
      }
    }
    counts.analyticsSnapshots = 90 * metrics.length;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 11. EXPENSE CATEGORIES + BUSINESS EXPENSES (3 months)
  // ──────────────────────────────────────────────────────────────────────────
  await seedSection('expense categories & expenses', async () => {
    const cats = [
      { id: 'ec-rent',      name: 'Office Rent',           code: 'RENT',  approve: false },
      { id: 'ec-insurance', name: 'Insurance Premiums',    code: 'INS',   approve: false },
      { id: 'ec-fuel',      name: 'Vehicle Fuel',          code: 'FUEL',  approve: true  },
      { id: 'ec-equip',     name: 'Equipment Purchases',   code: 'EQUIP', approve: true  },
      { id: 'ec-software',  name: 'Software Subscriptions',code: 'SWR',   approve: false },
    ];
    for (const c of cats) {
      await q(`
        INSERT INTO expense_categories (id, workspace_id, name, code, requires_approval, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `, [c.id, WS, c.name, c.code, c.approve]);
    }

    const expenses = [
      { id: 'exp-001', cat: 'ec-rent',      desc: 'Monthly office rent — January 2026',             merchant: 'Oak Building LLC',           amount: '1200.00', date: ago(90) },
      { id: 'exp-002', cat: 'ec-insurance', desc: 'General liability insurance — January 2026',      merchant: 'Texas Mutual Insurance',      amount: '450.00',  date: ago(88) },
      { id: 'exp-003', cat: 'ec-fuel',      desc: 'Fuel reimbursements — January 2026',              merchant: 'Exxon / Shell',               amount: '120.00',  date: ago(85) },
      { id: 'exp-004', cat: 'ec-software',  desc: 'CoAIleague subscription — January 2026',          merchant: 'CoAIleague Inc.',             amount: '299.00',  date: ago(84) },
      { id: 'exp-005', cat: 'ec-rent',      desc: 'Monthly office rent — February 2026',             merchant: 'Oak Building LLC',           amount: '1200.00', date: ago(60) },
      { id: 'exp-006', cat: 'ec-insurance', desc: 'General liability insurance — February 2026',     merchant: 'Texas Mutual Insurance',      amount: '450.00',  date: ago(58) },
      { id: 'exp-007', cat: 'ec-fuel',      desc: 'Fuel reimbursements — February 2026',             merchant: 'Exxon / Shell',               amount: '98.00',   date: ago(55) },
      { id: 'exp-008', cat: 'ec-software',  desc: 'CoAIleague subscription — February 2026',         merchant: 'CoAIleague Inc.',             amount: '299.00',  date: ago(54) },
      { id: 'exp-009', cat: 'ec-equip',     desc: 'Motorola radio battery packs (4x)',               merchant: 'Radio Communications Plus',   amount: '340.00',  date: ago(50) },
      { id: 'exp-010', cat: 'ec-rent',      desc: 'Monthly office rent — March 2026',                merchant: 'Oak Building LLC',           amount: '1200.00', date: ago(30) },
      { id: 'exp-011', cat: 'ec-insurance', desc: 'General liability insurance — March 2026',        merchant: 'Texas Mutual Insurance',      amount: '450.00',  date: ago(28) },
      { id: 'exp-012', cat: 'ec-fuel',      desc: 'Fuel reimbursements — March 2026',                merchant: 'Exxon / Shell',               amount: '145.00',  date: ago(25) },
      { id: 'exp-013', cat: 'ec-software',  desc: 'CoAIleague subscription — March 2026',            merchant: 'CoAIleague Inc.',             amount: '299.00',  date: ago(24) },
    ];
    for (const e of expenses) {
      await q(`
        INSERT INTO expenses (id, workspace_id, employee_id, category_id, expense_date, merchant, description, amount, currency, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'USD', 'approved', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `, [e.id, WS, OWNER_EMP, e.cat, e.date, e.merchant, e.desc, e.amount]);
    }
    counts.expenses = expenses.length;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 12. NOTIFICATIONS (25 mixed read/unread)
  // ──────────────────────────────────────────────────────────────────────────
  await seedSection('notifications', async () => {
    const notifs = [
      // Unread
      { id: 'notif-001', type: 'license_expiry_warning', title: 'License Expiring Soon', body: 'Carlos Garcia guard card expires in 25 days. Schedule renewal now.', read: false, cat: 'alerts', at: ago(0, 1) },
      { id: 'notif-002', type: 'license_expiry_warning', title: 'License Expiring Soon', body: 'Diana Johnson guard card expires in 28 days. Action required.', read: false, cat: 'alerts', at: ago(0, 2) },
      { id: 'notif-003', type: 'invoice_overdue', title: 'Invoice Overdue', body: 'INV-2026-3001 for Texas Star Event Center is 5 days overdue. Total: $5,100.', read: false, cat: 'alerts', at: ago(1, 3) },
      { id: 'notif-004', type: 'shift_calloff', title: 'Shift Calloff Received', body: 'Michael Thompson called off for tonight shift at Heritage National Bank.', read: false, cat: 'activity', at: ago(0, 3) },
      { id: 'notif-005', type: 'system', title: 'Payroll Run Ready for Approval', body: 'Payroll run for Mar 15-29 is ready. Review and approve before Friday.', read: false, cat: 'activity', at: ago(0, 4) },
      // Read
      { id: 'notif-006', type: 'shift_assigned', title: 'Shift Assigned', body: 'Assigned to Riverside Shopping Center — Saturday 6 AM.', read: true, cat: 'activity', at: ago(1) },
      { id: 'notif-007', type: 'invoice_paid', title: 'Invoice Paid', body: 'INV-2025-1008 paid by DFW Distribution Center. Amount: $5,200.', read: true, cat: 'activity', at: ago(2) },
      { id: 'notif-008', type: 'system', title: 'New Client Contract Signed', body: 'Client contract with Oakwood Residential signed digitally.', read: true, cat: 'activity', at: ago(3) },
      { id: 'notif-009', type: 'license_expiry_warning', title: 'License Renewed', body: 'Kevin Brown guard card renewed. Next expiry: 2027-03-15.', read: true, cat: 'activity', at: ago(4) },
      { id: 'notif-010', type: 'shift_calloff', title: 'Shift Covered', body: 'Open shift at DFW Distribution Center filled by Robert Williams.', read: true, cat: 'activity', at: ago(5) },
      { id: 'notif-011', type: 'system', title: 'Payroll Run Completed', body: 'Payroll run Mar 1-14 completed. $29,800 disbursed to 10 employees.', read: true, cat: 'activity', at: ago(6) },
      { id: 'notif-012', type: 'system', title: 'Guard Tour Alert', body: 'Guard tour at Riverside Mall has 2 missed checkpoints. Review required.', read: true, cat: 'alerts', at: ago(7) },
      { id: 'notif-013', type: 'system', title: 'Compliance Report Ready', body: 'March 2026 compliance report is ready for your review.', read: true, cat: 'activity', at: ago(8) },
      { id: 'notif-014', type: 'system', title: 'Client NPS Alert', body: 'Lone Star Medical Center NPS score dropped to 4. Churn risk flagged.', read: true, cat: 'alerts', at: ago(9) },
      { id: 'notif-015', type: 'shift_assigned', title: 'Schedule Published', body: 'Week of March 25 schedule published. 8 officers assigned.', read: true, cat: 'activity', at: ago(10) },
      { id: 'notif-016', type: 'invoice_overdue', title: 'Invoice Sent', body: 'INV-2026-2001 sent to Riverside Shopping Center. Due in 30 days.', read: true, cat: 'activity', at: ago(11) },
      { id: 'notif-017', type: 'system', title: 'Training Session Reminder', body: 'TCOLE refresher training scheduled for next Tuesday at 9 AM.', read: true, cat: 'activity', at: ago(12) },
      { id: 'notif-018', type: 'system', title: 'New Applicant', body: 'Jordan Reyes submitted application for Security Officer position.', read: true, cat: 'activity', at: ago(14) },
      { id: 'notif-019', type: 'system', title: 'Incident Report Filed', body: 'Incident report #SEC-0042 filed at Riverside Shopping Center.', read: true, cat: 'activity', at: ago(15) },
      { id: 'notif-020', type: 'system', title: 'Recognition Award Posted', body: 'Recognition award for Carlos Garcia approved and posted.', read: true, cat: 'activity', at: ago(16) },
      { id: 'notif-021', type: 'shift_assigned', title: 'Emergency Coverage Needed', body: 'Hospital night shift uncovered. 3 officers have been notified.', read: true, cat: 'alerts', at: ago(17) },
      { id: 'notif-022', type: 'system', title: 'Equipment Return', body: 'Radio RAD-K34-001 returned damaged by Kevin Brown. Deduction record created.', read: true, cat: 'activity', at: ago(20) },
      { id: 'notif-023', type: 'invoice_paid', title: 'Invoice Paid', body: 'INV-2025-1005 paid by Riverside Shopping Center. Amount: $8,600.', read: true, cat: 'activity', at: ago(22) },
      { id: 'notif-024', type: 'system', title: 'Payroll Approved', body: 'Payroll run Feb 15-28 approved by Marcus Rivera. Processing initiated.', read: true, cat: 'activity', at: ago(25) },
      { id: 'notif-025', type: 'system', title: 'New Client Onboarded', body: 'Oakwood Residential setup complete. Portal access provisioned.', read: true, cat: 'activity', at: ago(30) },
    ];
    for (const n of notifs) {
      await q(`
        INSERT INTO notifications (id, scope, category, workspace_id, user_id, type, title, message, is_read, created_at, updated_at)
        VALUES ($1, 'workspace', $2, $3, 'dev-owner-001', $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (id) DO NOTHING
      `, [n.id, n.cat, WS, n.type, n.title, n.body, n.read, n.at]);
    }
    counts.notifications = notifs.length;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 13. SALES PIPELINE LEADS
  // ──────────────────────────────────────────────────────────────────────────
  await seedSection('sales pipeline leads', async () => {
    const leads = [
      { id: 'sl-001', company: 'Southwest Retail Plaza',      contact: 'Dan Torres',     email: 'dtorres@swretail.test',  phone: '214-555-7001', stage: 'captured',          score: 55, value: '3200.00', notes: 'Inquiry via website. Looking for weekend coverage.' },
      { id: 'sl-002', company: 'Greenfield Corporate Park',   contact: 'Lisa Owens',     email: 'lowens@greenfield.test', phone: '214-555-7002', stage: 'qualified',          score: 78, value: '8500.00', notes: 'Scored 78/100. Assigned to Sarah Chen for follow-up.' },
      { id: 'sl-003', company: 'North Dallas Apartments',     contact: 'Robert Kim',     email: 'rkim@ndallas.test',      phone: '214-555-7003', stage: 'outreach_active',    score: 65, value: '4200.00', notes: '2 emails sent, 1 response. Site visit scheduled.' },
      { id: 'sl-004', company: 'West End Convention Center',  contact: 'Maria Castillo', email: 'mcastillo@westend.test', phone: '214-555-7004', stage: 'proposal_sent',      score: 82, value: '15000.00', notes: 'Proposal generated 14 days ago. Awaiting GM signature.' },
      { id: 'sl-005', company: 'Lakewood Business District',  contact: 'James Porter',   email: 'jporter@lakewood.test',  phone: '214-555-7005', stage: 'proposal_approved',  score: 91, value: '12000.00', notes: 'Proposal approved. Contract being generated.' },
      { id: 'sl-006', company: 'DFW Airport Contractor Village', contact: 'Nancy Wu',   email: 'nwu@dfwcv.test',         phone: '214-555-7006', stage: 'contract_executed',  score: 95, value: '22000.00', notes: 'Contract signed. Onboarding workflow triggered.' },
      { id: 'sl-007', company: 'Riverside Shopping Center',   contact: 'Tom Bradley',    email: 'tbradley@riverside.test',phone: '555-100-2002', stage: 'onboarded',          score: 100, value: '28000.00', notes: 'Fully onboarded. First invoices sent.' },
      { id: 'sl-008', company: 'Garland Tech Hub',            contact: 'Victor Sanchez', email: 'vsanchez@gartech.test',  phone: '214-555-7008', stage: 'lost',               score: 45, value: '5000.00', notes: 'Lost — price too high. Competitor won.' },
      { id: 'sl-009', company: 'McKinney Logistics Park',     contact: 'Helen Ford',     email: 'hford@mckinney.test',    phone: '214-555-7009', stage: 'lost',               score: 50, value: '7500.00', notes: 'Lost — client chose in-house security team.' },
    ];
    for (const l of leads) {
      await q(`
        INSERT INTO sales_leads (id, workspace_id, company_name, contact_name, contact_email, contact_phone, pipeline_stage, lead_score, estimated_value, notes, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW() - (RANDOM() * 60 || ' days')::INTERVAL, NOW())
        ON CONFLICT (id) DO NOTHING
      `, [l.id, WS, l.company, l.contact, l.email, l.phone, l.stage, l.score, l.value, l.notes]);
    }
    counts.salesLeads = leads.length;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 14. TRAINING SESSIONS + ATTENDANCE
  // ──────────────────────────────────────────────────────────────────────────
  await seedSection('training sessions & attendance', async () => {
    const sessions = [
      { id: 'ts-001', title: 'TCOLE Annual Refresher — Use of Force', type: 'tcole_mandated', status: 'completed', sessionDate: ago(28), hours: 8,  instructor: 'James Washington' },
      { id: 'ts-002', title: 'Active Shooter Response & Evacuation',  type: 'other',           status: 'completed', sessionDate: ago(14), hours: 4,  instructor: 'DPS Certified Trainer' },
      { id: 'ts-003', title: 'Customer Service & De-escalation',      type: 'de_escalation',   status: 'completed', sessionDate: ago(7),  hours: 3,  instructor: 'Sarah Chen' },
      { id: 'ts-004', title: 'TCOLE Advanced Patrol Techniques',      type: 'tcole_mandated',  status: 'scheduled', sessionDate: daysFromNow(7), hours: 8, instructor: 'DPS Certified Trainer' },
    ];
    for (const s of sessions) {
      await q(`
        INSERT INTO training_sessions (id, workspace_id, title, training_type, status, session_date, duration_hours, instructor_name, location, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACME Training Room', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `, [s.id, WS, s.title, s.type, s.status, s.sessionDate, s.hours, s.instructor]);
    }

    // Attendance for completed sessions
    for (const sess of sessions.filter(s => s.status === 'completed')) {
      for (const empId of OFFICERS.slice(0, 6)) {
        await q(`
          INSERT INTO training_attendance (id, workspace_id, session_id, employee_id, status, tcole_hours_awarded, created_at)
          VALUES ($1, $2, $3, $4, 'attended', $5, NOW())
          ON CONFLICT (id) DO NOTHING
        `, [`ta-${sess.id}-${empId}`, WS, sess.id, empId, sess.hours]);
      }
    }
    // Upcoming registrations
    for (const empId of OFFICERS.slice(0, 8)) {
      await q(`
        INSERT INTO training_attendance (id, workspace_id, session_id, employee_id, status, tcole_hours_awarded, created_at)
        VALUES ($1, $2, $3, $4, 'registered', 0, NOW())
        ON CONFLICT (id) DO NOTHING
      `, [`ta-ts-004-${empId}`, WS, 'ts-004', empId]);
    }
    counts.trainingSessions = sessions.length;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 15. COMPLIANCE ALERTS (active violations)
  // ──────────────────────────────────────────────────────────────────────────
  await seedSection('compliance alerts', async () => {
    const alerts = [
      { id: 'ca-001', type: 'license_expiry', severity: 'high',   title: 'Guard Card Expiring in 25 Days', message: 'Carlos Garcia guard card GC-TX-2891034 expires 2026-04-23.', status: 'active', emp: 'dev-acme-emp-004' },
      { id: 'ca-002', type: 'license_expiry', severity: 'high',   title: 'Guard Card Expiring in 28 Days', message: 'Diana Johnson guard card GC-TX-3892045 expires 2026-04-26.', status: 'active', emp: 'dev-acme-emp-005' },
      { id: 'ca-003', type: 'policy_violation', severity: 'medium', title: 'Missed Patrol Checkpoint', message: 'Guard tour at Riverside Mall incomplete — 2 checkpoints not scanned.', status: 'active', emp: 'dev-acme-emp-004' },
      { id: 'ca-004', type: 'overstay_alert',  severity: 'low',   title: 'Visitor Overstay Detected', message: 'Victor Salazar (MedTech Corp) checked in at Lone Star Medical 24+ hours ago with no checkout.', status: 'active', emp: null },
      { id: 'ca-005', type: 'policy_violation', severity: 'low',  title: 'Late Incident Report', message: 'Incident at Riverside Mall on 2026-03-20 — report submitted 48 hours late.', status: 'resolved', emp: 'dev-acme-emp-004' },
    ];
    for (const a of alerts) {
      await q(`
        INSERT INTO compliance_alerts (id, workspace_id, employee_id, alert_type, severity, title, message, action_required, is_read, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, CASE WHEN $8 = 'resolved' THEN TRUE ELSE FALSE END, NOW() - (RANDOM() * 7 || ' days')::INTERVAL, NOW())
        ON CONFLICT (id) DO NOTHING
      `, [a.id, WS, a.emp, a.type, a.severity, a.title, a.message, a.status]);
    }
    counts.complianceAlerts = alerts.length;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 16. OPEN SHIFTS (marketplace)
  // ──────────────────────────────────────────────────────────────────────────
  await seedSection('open marketplace shifts', async () => {
    const shiftDefs = [
      { id: 'open-shift-acme-001', cli: C1, name: 'Riverside Shopping Center', dayOffset: 0 },
      { id: 'open-shift-acme-002', cli: C2, name: 'Pinnacle Tower LLC',        dayOffset: 1 },
      { id: 'open-shift-acme-003', cli: C3, name: 'Lone Star Medical Center',  dayOffset: 1 },
      { id: 'open-shift-acme-004', cli: C4, name: 'Texas Star Event Center',   dayOffset: 2 },
      { id: 'open-shift-acme-005', cli: C5, name: 'Heritage National Bank',    dayOffset: 3 },
    ];
    for (const s of shiftDefs) {
      await q(`
        INSERT INTO shifts (id, workspace_id, client_id, title, start_time, end_time, status, category, pay_rate, created_at, updated_at)
        VALUES ($1, $2, $3, $4,
          NOW() + ($5 || ' days')::INTERVAL + INTERVAL '8 hours',
          NOW() + ($5 || ' days')::INTERVAL + INTERVAL '16 hours',
          'published', 'security', '22.00', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `, [s.id, WS, s.cli, `Open Shift — ${s.name}`, s.dayOffset]);
    }
    counts.openShifts = 5;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 17. BOLO ALERTS
  // ──────────────────────────────────────────────────────────────────────────
  await seedSection('BOLO alerts', async () => {
    const bolos = [
      { id: 'bolo-001', subject: 'Kevin Flores', desc: 'Suspected shoplifter. Male, 5\'10", brown hair, tattoo left forearm. Active trespass at Riverside.', reason: 'Shoplifting — multiple incidents', creatorName: 'Marcus Rivera' },
      { id: 'bolo-002', subject: 'TX Plate ABC-1234', desc: 'Red 2018 Honda Civic. Trespass notice active — do not allow entry to Riverside parking lot.', reason: 'Parking lot trespass', creatorName: 'Angela Davis' },
      { id: 'bolo-003', subject: 'Maria Delgado', desc: 'Known associate of Flores. Trespass notice active at Riverside.', reason: 'Trespassing — associate of Flores', creatorName: 'Marcus Rivera' },
    ];
    for (const b of bolos) {
      await q(`
        INSERT INTO bolo_alerts (id, workspace_id, subject_name, subject_description, reason, is_active, created_by_id, created_by_name, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7, NOW() - INTERVAL '30 days', NOW())
        ON CONFLICT (id) DO NOTHING
      `, [b.id, WS, b.subject, b.desc, b.reason, OWNER_EMP, b.creatorName]);
    }
    counts.boloAlerts = bolos.length;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 18. ANALYTICS CLIENT HEALTH SCORES
  // ──────────────────────────────────────────────────────────────────────────
  await seedSection('analytics client health scores', async () => {
    const scores = [
      { id: 'hs-001', cli: C1, ps: '88', ds: '82', cs: '90', ts: '85', comp: '86.25', churn: 'low' },
      { id: 'hs-002', cli: C2, ps: '72', ds: '80', cs: '75', ts: '78', comp: '76.25', churn: 'low' },
      { id: 'hs-003', cli: C3, ps: '40', ds: '50', cs: '42', ts: '48', comp: '45.00', churn: 'high' },
      { id: 'hs-004', cli: C4, ps: '70', ds: '72', cs: '71', ts: '73', comp: '71.50', churn: 'low' },
      { id: 'hs-005', cli: C5, ps: '95', ds: '90', cs: '92', ts: '88', comp: '91.25', churn: 'low' },
      { id: 'hs-006', cli: C6, ps: '78', ds: '76', cs: '80', ts: '79', comp: '78.25', churn: 'low' },
    ];
    const snapDate = dateAgo(0);
    for (const h of scores) {
      await q(`
        INSERT INTO analytics_client_health_scores (id, workspace_id, client_id, snapshot_date, payment_velocity_score, dispute_rate_score, post_coverage_score, ticket_volume_score, composite_score, churn_risk, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (id) DO NOTHING
      `, [h.id, WS, h.cli, snapDate, h.ps, h.ds, h.cs, h.ts, h.comp, h.churn]);
    }
    counts.clientHealthScores = scores.length;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 19. TRINITY ACTIVITY LOGS
  // ──────────────────────────────────────────────────────────────────────────
  await seedSection('Trinity activity logs', async () => {
    const logs = [
      { id: 'tlog-001', action: 'license_expiry_check',    result: 'Scanned 15 officers. 2 guard cards expiring in <30 days. Alerts sent.' },
      { id: 'tlog-002', action: 'client_health_analysis',  result: 'Scored 6 clients. Lone Star Medical churn risk elevated. Follow-up recommended.' },
      { id: 'tlog-003', action: 'schedule_optimization',   result: 'Optimized 12 shifts for next week. 4.2h overtime saved.' },
      { id: 'tlog-004', action: 'compliance_scan',         result: '2 active violations. 5 resolved. Overall score: 87%.' },
      { id: 'tlog-005', action: 'invoice_collections',     result: '3 overdue invoices flagged. Automated payment reminders sent.' },
      { id: 'tlog-006', action: 'lead_scoring',            result: 'Scored 9 sales leads. 2 high-priority (>80) flagged for immediate outreach.' },
      { id: 'tlog-007', action: 'payroll_verification',    result: 'Payroll run acme-pr-005 verified. Calculations correct. Ready for approval.' },
      { id: 'tlog-008', action: 'incident_pattern_analysis', result: 'Detected pattern: 3 incidents at Riverside Mall on Friday evenings. Recommend additional coverage.' },
      { id: 'tlog-009', action: 'attendance_analysis',     result: 'Q1 attendance rate: 92.3%. Top performers: Garcia, Davis, Johnson.' },
      { id: 'tlog-010', action: 'shift_calloff_response',  result: 'Thompson calloff processed. 3 eligible officers notified. Shift filled within 45 minutes.' },
    ];
    for (const l of logs) {
      await q(`
        INSERT INTO ai_brain_action_logs (id, workspace_id, action_type, result, created_at)
        VALUES ($1, $2, $3, $4, NOW() - (RANDOM() * 7 || ' days')::INTERVAL)
        ON CONFLICT (id) DO NOTHING
      `, [l.id, WS, l.action, l.result]);
    }
    counts.trinityLogs = logs.length;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ──────────────────────────────────────────────────────────────────────────
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log('[SeedACME] ════════ SEED COMPLETE ════════');
  console.log('[SeedACME]', JSON.stringify(counts, null, 2));
  console.log(`[SeedACME] Total: ~${total} records seeded`);

  return { success: true, message: `ACME seed complete. ~${total} records inserted.`, counts };
}
