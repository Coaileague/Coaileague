/**
 * COMPREHENSIVE DEV SEED — Full Relational Integrity
 * ====================================================
 * Creates a complete production-like dataset:
 *   users → employees (userId FK) → workspace_members
 *   clients → shifts (clientId FK, employeeId FK)  
 *   shifts → time_entries (shiftId FK, employeeId FK)
 *   time_entries → payroll_runs → payroll_entries
 *   time_entries → invoices → invoice_line_items
 */

import { pool } from '../db';

const WS = 'dev-acme-security-ws';

interface StaffMember {
  userId: string; email: string; firstName: string; lastName: string;
  empId: string; wsRole: string; payRate: string; billRate: string; position: string;
}

const STAFF: StaffMember[] = [
  { userId: 'dev-owner-001', email: 'owner@acme-security.test', firstName: 'Marcus', lastName: 'Rivera', empId: 'dev-acme-emp-marcus', wsRole: 'org_owner', payRate: '22.00', billRate: '35.00', position: 'Owner / Chief Operating Officer' },
  { userId: 'dev-manager-001', email: 'manager@acme-security.test', firstName: 'Sarah', lastName: 'Chen', empId: 'dev-manager-001-emp', wsRole: 'manager', payRate: '20.00', billRate: '32.00', position: 'Operations Manager' },
  { userId: 'dev-manager-002', email: 'ops@acme-security.test', firstName: 'James', lastName: 'Washington', empId: 'dev-manager-002-emp', wsRole: 'supervisor', payRate: '19.00', billRate: '30.00', position: 'Shift Supervisor' },
  { userId: 'dev-emp-001', email: 'garcia@acme-security.test', firstName: 'Carlos', lastName: 'Garcia', empId: 'dev-emp-001-emp', wsRole: 'staff', payRate: '17.00', billRate: '28.00', position: 'Security Officer' },
  { userId: 'dev-emp-002', email: 'johnson@acme-security.test', firstName: 'Diana', lastName: 'Johnson', empId: 'dev-emp-002-emp', wsRole: 'staff', payRate: '17.00', billRate: '28.00', position: 'Security Officer' },
  { userId: 'dev-emp-003', email: 'williams@acme-security.test', firstName: 'Robert', lastName: 'Williams', empId: 'dev-emp-003-emp', wsRole: 'staff', payRate: '16.50', billRate: '27.00', position: 'Security Officer' },
  { userId: 'dev-emp-004', email: 'martinez@acme-security.test', firstName: 'Maria', lastName: 'Martinez', empId: 'dev-emp-004-emp', wsRole: 'staff', payRate: '16.50', billRate: '27.00', position: 'Security Officer' },
  { userId: 'dev-acme-emp-oos', email: 'fontenot@acme-security.test', firstName: 'James', lastName: 'Fontenot', empId: 'dev-acme-emp-oos-emp', wsRole: 'staff', payRate: '16.00', billRate: '26.00', position: 'Patrol Officer' },
];

const CLIENTS = [
  { id: 'dev-client-downtown-mall', firstName: 'Downtown', lastName: 'Mall Security', companyName: 'Downtown SA Mall', billRate: '28.50', email: 'security@dtmall.com', address: '255 E Commerce St, San Antonio, TX 78205' },
  { id: 'dev-client-tech-corp', firstName: 'TechCorp', lastName: 'Facilities', companyName: 'TechCorp HQ', billRate: '32.00', email: 'facilities@techcorp.com', address: '7800 IH-10 W, San Antonio, TX 78230' },
  { id: 'dev-client-hospital', firstName: 'Memorial', lastName: 'Hospital Security', companyName: 'Memorial Hospital', billRate: '35.00', email: 'safety@memorial.health', address: '4502 Medical Dr, San Antonio, TX 78229' },
  { id: 'dev-client-airport', firstName: 'SAT', lastName: 'Airport Security', companyName: 'SAT Regional Airport', billRate: '38.00', email: 'ops@satairport.com', address: '9800 Airport Blvd, San Antonio, TX 78216' },
];

const SHIFT_TEMPLATES = [
  { startH: 7, endH: 15, label: 'Day Shift' },
  { startH: 15, endH: 23, label: 'Evening Shift' },
  { startH: 23, endH: 7, label: 'Night Shift' },
];

function daysAgo(n: number, h: number = 8): string {
  const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 0, 0, 0); return d.toISOString();
}
function daysFromNow(n: number, h: number = 8): string {
  const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d.toISOString();
}
function dateStr(iso: string): string { return iso.split('T')[0]; }
function calcHours(startH: number, endH: number): number {
  return endH > startH ? endH - startH : (24 - startH) + endH;
}

const log: string[] = [];
function info(msg: string) { console.log('[ComprehensiveSeed] ' + msg); log.push(msg); }

export async function runComprehensiveDevSeed(): Promise<{ success: boolean; log: string[]; counts: Record<string, number> }> {
  const counts: Record<string, number> = { users: 0, employees: 0, members: 0, clients: 0, shifts: 0, timeEntries: 0, payrollRuns: 0, payrollEntries: 0, invoices: 0, lineItems: 0 };

  try {
    info('Starting...');

    info('Repairing stale finance data for workspace...');
    await pool.query(`DELETE FROM invoice_line_items WHERE workspace_id = $1`, [WS]);
    await pool.query(`DELETE FROM invoices WHERE workspace_id = $1`, [WS]);
    await pool.query(`DELETE FROM payroll_entries WHERE workspace_id = $1`, [WS]);
    await pool.query(`DELETE FROM payroll_runs WHERE workspace_id = $1`, [WS]);
    await pool.query(`DELETE FROM time_entries WHERE workspace_id = $1`, [WS]);
    await pool.query(
      `DELETE FROM shifts
       WHERE workspace_id = $1
         AND id LIKE 'dev-shift-%'`,
      [WS]
    );

    // 1. Workspace
    await pool.query(
      `INSERT INTO workspaces (id, name, owner_id, company_name, subscription_tier, subscription_status, max_employees, platform_fee_percentage, created_at, updated_at)
       VALUES ($1,'ACME Security Services','dev-owner-001','ACME Security Services, LLC','enterprise','active',500,'8.00',NOW(),NOW())
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, subscription_tier=EXCLUDED.subscription_tier, updated_at=NOW()`,
      [WS]
    );

    // 2. Users
    for (const s of STAFF) {
      await pool.query(
        `INSERT INTO users (id, email, first_name, last_name, password_hash, current_workspace_id, role, created_at, updated_at)
         VALUES ($1,$2,$3,$4,'$2b$10$rMNn5sVW7Kbxe8HJ9QlZpOeD8kqAx1m7oR3vNtYwIi6jGhUzPs4Ke',$5,$6,NOW(),NOW())
         ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, role=EXCLUDED.role, current_workspace_id=EXCLUDED.current_workspace_id, updated_at=NOW()`,
        [s.userId, s.email, s.firstName, s.lastName, WS, s.wsRole]
      );
      counts.users++;
    }
    info(counts.users + ' users');

    // 3. Employees with userId FK
    for (const s of STAFF) {
      const empNum = 'EMP-ACME-' + s.empId.replace(/[^0-9]/g, '').padStart(5, '0');
      await pool.query(
        `INSERT INTO employees (id, workspace_id, user_id, employee_number, first_name, last_name, email, position, hourly_rate, status, workspace_role, hire_date, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,NOW()-interval '180 days',NOW(),NOW())
         ON CONFLICT (id) DO UPDATE SET user_id=EXCLUDED.user_id, hourly_rate=EXCLUDED.hourly_rate, workspace_role=EXCLUDED.workspace_role, updated_at=NOW()`,
        [s.empId, WS, s.userId, empNum, s.firstName, s.lastName, s.email, s.position, s.payRate, s.wsRole]
      );
      counts.employees++;
    }
    info(counts.employees + ' employees');

    // 4. Workspace members
    for (const s of STAFF) {
      await pool.query(
        `INSERT INTO workspace_members (id, workspace_id, user_id, role, status, joined_at, created_at, updated_at)
         VALUES (gen_random_uuid(),$1,$2,$3,'active',NOW()-interval '180 days',NOW(),NOW())
         ON CONFLICT (user_id, workspace_id) DO UPDATE SET role=EXCLUDED.role, status=EXCLUDED.status, updated_at=NOW()`,
        [WS, s.userId, s.wsRole]
      );
      counts.members++;
    }
    info(counts.members + ' workspace members');

    // 5. Clients
    for (const c of CLIENTS) {
      await pool.query(
        `INSERT INTO clients (id, workspace_id, first_name, last_name, company_name, contract_rate, billable_hourly_rate, email, address, is_active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6::numeric,$7::numeric,$8,$9,true,NOW(),NOW())
         ON CONFLICT (id) DO UPDATE
         SET company_name=EXCLUDED.company_name,
             contract_rate=EXCLUDED.contract_rate,
             billable_hourly_rate=EXCLUDED.billable_hourly_rate,
             email=EXCLUDED.email,
             address=EXCLUDED.address,
             is_active=true,
             updated_at=NOW()`,
        [c.id, WS, c.firstName, c.lastName, c.companyName, c.billRate, c.billRate, c.email, c.address]
      );
      counts.clients++;
    }
    info(counts.clients + ' clients');

    // 6. Shifts + Time Entries (past 30 days completed)
    const fieldStaff = STAFF.filter(s => ['staff', 'supervisor'].includes(s.wsRole));
    // Assign employees by TEMPLATE to prevent overlapping shifts per employee per day.
    // Each template group uses different starting employees so no overlap within a day.
    const tmplEmpOffset = [0, 2, 4]; // Different starting offset per template

    for (let day = 30; day >= 1; day--) {
      for (let tIdx = 0; tIdx < SHIFT_TEMPLATES.length; tIdx++) {
        const tmpl = SHIFT_TEMPLATES[tIdx];
        for (let cIdx = 0; cIdx < CLIENTS.length; cIdx++) {
          const client = CLIENTS[cIdx];
          // Employee assigned by: which template × which client × which day
          // Using template offset + client index to pick different employees per client/template
          const empIdx = (tmplEmpOffset[tIdx] + cIdx) % fieldStaff.length;
          const emp = fieldStaff[empIdx];
          const startISO = daysAgo(day, tmpl.startH);
          const endISO = daysAgo(day, tmpl.endH < tmpl.startH ? tmpl.endH + 24 : tmpl.endH);
          const shiftNum = (30 - day) * CLIENTS.length * SHIFT_TEMPLATES.length + tIdx * CLIENTS.length + cIdx + 1;
          const shiftId = 'dev-shift-past-' + String(shiftNum).padStart(4, '0');
          const teId = 'dev-te-' + String(shiftNum).padStart(4, '0');
          const hours = calcHours(tmpl.startH, tmpl.endH);
          const regularH = Math.min(hours, 8);
          const otH = Math.max(hours - 8, 0);
          const br = parseFloat(client.billRate);
          const pr = parseFloat(emp.payRate);
          const billable = (regularH * br + otH * br * 1.5).toFixed(2);
          const payable = (regularH * pr + otH * pr * 1.5).toFixed(2);

          await pool.query(
            `INSERT INTO shifts (id, workspace_id, employee_id, client_id, title, date, start_time, end_time, status, pay_rate, bill_rate, billable_to_client, ai_generated, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz,'completed',$9,$10,true,false,NOW(),NOW())
             ON CONFLICT (id) DO NOTHING`,
            [shiftId, WS, emp.empId, client.id, (client.companyName || client.firstName) + ' — ' + tmpl.label, dateStr(startISO), startISO, endISO, emp.payRate, client.billRate]
          );
          counts.shifts++;

          await pool.query(
            `INSERT INTO time_entries (id, workspace_id, shift_id, employee_id, client_id, captured_bill_rate, captured_pay_rate, regular_hours, overtime_hours, billable_amount, payable_amount, clock_in, clock_out, total_hours, hourly_rate, total_amount, status, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6::numeric,$7::numeric,$8::numeric,$9::numeric,$10::numeric,$11::numeric,$12::timestamptz,$13::timestamptz,$14::numeric,$15::numeric,$16::numeric,'approved',NOW(),NOW())
             ON CONFLICT (id) DO NOTHING`,
            [teId, WS, shiftId, emp.empId, client.id, client.billRate, emp.payRate, regularH.toFixed(2), otH.toFixed(2), billable, payable, startISO, endISO, hours.toFixed(2), emp.payRate, payable]
          );
          counts.timeEntries++;
        }
      }
    }

    // Future 14 days (open + assigned)
    for (let day = 1; day <= 14; day++) {
      for (let tIdx2 = 0; tIdx2 < SHIFT_TEMPLATES.length; tIdx2++) {
        const tmpl = SHIFT_TEMPLATES[tIdx2];
        for (let cIdx2 = 0; cIdx2 < CLIENTS.length; cIdx2++) {
          const client = CLIENTS[cIdx2];
          // ~50% open, 50% assigned — use day+client index to vary
          const startISO = daysFromNow(day, tmpl.startH);
          const endISO = daysFromNow(day, tmpl.endH < tmpl.startH ? tmpl.endH + 24 : tmpl.endH);
          const employeeId = null;
          const payRate = '17.00';
          const emp = { empId: employeeId, payRate };
          const isOpen = true;
          const futureNum = (day - 1) * CLIENTS.length * SHIFT_TEMPLATES.length + tIdx2 * CLIENTS.length + cIdx2 + 1;
          const shiftId = 'dev-shift-future-' + String(futureNum).padStart(4, '0');

          await pool.query(
            `INSERT INTO shifts (id, workspace_id, employee_id, client_id, title, date, start_time, end_time, status, pay_rate, bill_rate, billable_to_client, ai_generated, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz,$9,$10,$11,true,false,NOW(),NOW())
             ON CONFLICT (id) DO NOTHING`,
            [shiftId, WS, emp?.empId || null, client.id, (client.companyName || client.firstName) + ' — ' + tmpl.label, dateStr(startISO), startISO, endISO, isOpen ? 'published' : 'scheduled', emp?.payRate || '17.00', client.billRate]
          );
          counts.shifts++;
        }
      }
    }
    info(counts.shifts + ' shifts, ' + counts.timeEntries + ' time entries');

    // 7. Payroll Runs (2 bi-weekly periods)
    const payPeriods = [
      { id: 'dev-payroll-run-001', start: daysAgo(30), end: daysAgo(16) },
      { id: 'dev-payroll-run-002', start: daysAgo(15), end: daysAgo(1) },
    ];

    for (const pp of payPeriods) {
      let totalGross = 0;
      const perEmp: Record<string, number> = {};
      for (const emp of fieldStaff) {
        const gross = 15 * 3 * 8 * parseFloat(emp.payRate);
        perEmp[emp.empId] = gross;
        totalGross += gross;
      }
      const totalTaxes = totalGross * 0.22;
      const totalNet = totalGross - totalTaxes;

      await pool.query(
        `INSERT INTO payroll_runs (id, workspace_id, period_start, period_end, status, total_gross_pay, total_taxes, total_net_pay, processed_by, processed_at, payment_schedule, run_type, disbursement_status, created_at, updated_at)
         VALUES ($1,$2,$3::timestamptz,$4::timestamptz,'completed',$5,$6,$7,'dev-owner-001',NOW(),'biweekly','regular','disbursed',NOW(),NOW())
         ON CONFLICT (id) DO UPDATE SET status='completed', total_gross_pay=EXCLUDED.total_gross_pay, updated_at=NOW()`,
        [pp.id, WS, pp.start, pp.end, totalGross.toFixed(2), totalTaxes.toFixed(2), totalNet.toFixed(2)]
      );
      counts.payrollRuns++;

      for (const emp of fieldStaff) {
        const gross = perEmp[emp.empId];
        const federal = gross * 0.12; const state = gross * 0.05;
        const ss = gross * 0.062; const medicare = gross * 0.0145;
        const net = gross - federal - state - ss - medicare;
        await pool.query(
          `INSERT INTO payroll_entries (id, payroll_run_id, employee_id, workspace_id, regular_hours, overtime_hours, hourly_rate, gross_pay, federal_tax, state_tax, social_security, medicare, net_pay, worker_type, disbursement_method, is_off_cycle, paid_period_start, paid_period_end, created_at, updated_at)
           VALUES (gen_random_uuid(),$1,$2,$3,'180','20',$4,$5,$6,$7,$8,$9,$10,'employee','direct_deposit',false,$11::timestamptz,$12::timestamptz,NOW(),NOW())
           ON CONFLICT DO NOTHING`,
          [pp.id, emp.empId, WS, emp.payRate, gross.toFixed(2), federal.toFixed(2), state.toFixed(2), ss.toFixed(2), medicare.toFixed(2), net.toFixed(2), pp.start, pp.end]
        );
        counts.payrollEntries++;
      }
    }
    info(counts.payrollRuns + ' payroll runs, ' + counts.payrollEntries + ' entries');

    // 8. Invoices (per client per period)
    let invNum = 1;
    for (const client of CLIENTS) {
      for (const pp of payPeriods) {
        const invId = 'dev-invoice-' + client.id.replace('dev-client-', '') + '-' + String(invNum).padStart(3, '0');
        const invoiceNumber = 'INV-ACME-2026-' + String(invNum + 1000).padStart(4, '0');
        invNum++;
        const subtotal = 15 * 3 * 8 * parseFloat(client.billRate);
        const platformFee = subtotal * 0.08;
        const businessAmt = subtotal - platformFee;
        const isPaid = pp.id === 'dev-payroll-run-001';
        const issueDate = new Date(pp.end);
        const dueDate = new Date(issueDate); dueDate.setDate(dueDate.getDate() + 30);

        await pool.query(
          `INSERT INTO invoices (id, workspace_id, client_id, invoice_number, issue_date, due_date, subtotal, tax_rate, tax_amount, total, platform_fee_percentage, platform_fee_amount, business_amount, status, paid_at, amount_paid, sent_at, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5::timestamptz,$6::timestamptz,$7::numeric,'0.00','0.00',$8::numeric,'8.00',$9::numeric,$10::numeric,$11,$12::timestamptz,$13::numeric,$14::timestamptz,NOW(),NOW())
           ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, paid_at=EXCLUDED.paid_at, amount_paid=EXCLUDED.amount_paid, updated_at=NOW()`,
          [invId, WS, client.id, invoiceNumber, issueDate.toISOString(), dueDate.toISOString(), subtotal.toFixed(2), subtotal.toFixed(2), platformFee.toFixed(2), businessAmt.toFixed(2), isPaid ? 'paid' : 'sent', isPaid ? issueDate.toISOString() : null, subtotal.toFixed(2), issueDate.toISOString()]
        );
        counts.invoices++;

        for (const tmpl of SHIFT_TEMPLATES) {
          const qty = 15;
          const unitPrice = (8 * parseFloat(client.billRate)).toFixed(2);
          const lineTotal = (qty * parseFloat(unitPrice)).toFixed(2);
          await pool.query(
            `INSERT INTO invoice_line_items (id, invoice_id, workspace_id, description, quantity, unit_price, amount, created_at, updated_at)
             VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,NOW(),NOW())
             ON CONFLICT DO NOTHING`,
            [invId, WS, (client.companyName || client.firstName) + ' — ' + tmpl.label + ' (' + qty + ' days x 8h @ $' + client.billRate + '/hr)', qty, unitPrice, lineTotal]
          );
          counts.lineItems++;
        }
      }
    }
    info(counts.invoices + ' invoices, ' + counts.lineItems + ' line items');
    info('COMPLETE! Full relational seed done.');
    return { success: true, log, counts };

  } catch (err: unknown) {
    info('FAILED: ' + err.message);
    console.error(err.stack);
    return { success: false, log, counts };
  }
}
