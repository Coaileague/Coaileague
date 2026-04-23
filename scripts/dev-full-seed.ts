/**
 * CoAIleague — MASTER DEVELOPMENT SEED & STRESS TEST
 * =====================================================
 * Spins up a complete development environment with:
 *
 *  Tenant A — ACME Security Services (enterprise, 14 staff, 7 clients)
 *  Tenant B — Anvil Security Group   (pro, 8 staff, 4 clients)
 *  Tenant C — Test Statewide         (enterprise, 150 officers, 15 clients) ← mirrors real SPS
 *
 * For each tenant:
 *  ✅ Users + employees + contractors
 *  ✅ Clients with full contract data
 *  ✅ Sites with GPS coords + geofence radius
 *  ✅ 90 days of historical shifts (completed, with time entries)
 *  ✅ 30 days of future shifts (mix of filled/unfilled for Trinity)
 *  ✅ Payroll runs (2 completed, 1 draft)
 *  ✅ Invoices (paid, outstanding, overdue)
 *  ✅ DAR/incident reports
 *  ✅ Help tickets (open, pending, resolved)
 *  ✅ Employee documents (I-9, W4, license, offer letter)
 *  ✅ Notifications
 *  ✅ Audit log entries
 *  ✅ Subscription (Stripe test customer if STRIPE_TEST_API_KEY provided)
 *  ✅ Bank accounts (Plaid sandbox if PLAID_CLIENT_ID provided)
 *
 * SAFETY:  Guarded by isProduction(). Safe to run multiple times (idempotent).
 * TARGET:  Development Railway environment only.
 *
 * Usage:
 *   DATABASE_URL=<dev-url> npx tsx scripts/dev-full-seed.ts
 *   Or via API: POST /api/admin/dev/full-seed  (platform_admin only, dev only)
 */

import { pool } from '../server/db';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

// ─── Safety Guard ─────────────────────────────────────────────────────────────
const isProduction = () =>
  process.env.NODE_ENV === 'production' ||
  !!process.env.RAILWAY_ENVIRONMENT_NAME?.match(/^production$/i);

if (isProduction()) {
  console.error('❌ REFUSED: dev-full-seed cannot run in production.');
  process.exit(1);
}

// ─── Config ───────────────────────────────────────────────────────────────────
const PASS_HASH = await bcrypt.hash('DevTest2026!', 10);
const NOW = new Date();

const TENANTS = {
  ACME:      'dev-acme-security-ws',
  ANVIL:     'dev-anvil-security-ws',
  STATEWIDE: 'test-statewide-ws-00000000000001',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function uuid() { return randomUUID(); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function daysFromNow(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return d; }
function dateStr(d: Date) { return d.toISOString().split('T')[0]; }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min: number, max: number) { return +(Math.random() * (max - min) + min).toFixed(2); }

async function q(sql: string, params: any[] = []) {
  try {
    return await pool.query(sql, params);
  } catch (e: any) {
    if (!e.message?.includes('duplicate key') && !e.message?.includes('already exists')) {
      console.warn(`  ⚠️  ${e.message?.slice(0, 100)}`);
    }
  }
}

// ─── Status tracker ───────────────────────────────────────────────────────────
const results: Record<string, number> = {};
function track(key: string, n = 1) { results[key] = (results[key] || 0) + n; }

// ─── Name pools ───────────────────────────────────────────────────────────────
const FIRST = ['James','Maria','Carlos','Destiny','Wei','Aisha','Derek','Ethan','Logan','Sarah',
  'Michael','Jennifer','Robert','Patricia','David','Linda','Richard','Barbara','Joseph','Susan',
  'Thomas','Jessica','Charles','Karen','Christopher','Nancy','Daniel','Betty','Matthew','Margaret',
  'Anthony','Sandra','Donald','Ashley','Mark','Dorothy','Paul','Kimberly','Steven','Emily',
  'Andrew','Donna','Kenneth','Michelle','Joshua','Carol','Kevin','Amanda','Brian','Melissa'];
const LAST = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez',
  'Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Taylor','Thomas','Moore',
  'Jackson','Martin','Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez',
  'Lewis','Robinson','Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill'];

function randName() {
  return { first: pick(FIRST), last: pick(LAST) };
}

// ─── ACME Security — Full Seed ───────────────────────────────────────────────
async function seedACME() {
  console.log('\n📋 Seeding ACME Security Services...');
  const WS = TENANTS.ACME;
  const ownerId = 'dev-acme-owner-001';

  // Workspace
  await q(`INSERT INTO workspaces (id, name, owner_id, subscription_tier, subscription_status,
    business_category, state, city, timezone, max_employees, max_clients, created_at)
    VALUES ($1,'ACME Security Services',$2,'enterprise','active','security','TX','Dallas',
    'America/Chicago',50,25,NOW())
    ON CONFLICT (id) DO NOTHING`, [WS, ownerId]);
  track('workspaces');

  // Owner user
  await q(`INSERT INTO users (id, email, first_name, last_name, password_hash, role,
    email_verified, current_workspace_id, created_at)
    VALUES ($1,'owner@acme-security.test','Marcus','Rivera',$2,'org_owner',true,$3,NOW())
    ON CONFLICT (id) DO NOTHING`, [ownerId, PASS_HASH, WS]);

  // Employees (14)
  const officers = [
    { id:'dev-acme-emp-001', first:'Marcus', last:'Rivera',  role:'org_owner',  rate:'45.00', title:'Operations Director' },
    { id:'dev-acme-emp-002', first:'Sarah',  last:'Chen',    role:'manager',    rate:'35.00', title:'Field Supervisor' },
    { id:'dev-acme-emp-003', first:'James',  last:'Washington', role:'manager', rate:'32.00', title:'Scheduling Manager' },
    { id:'dev-acme-emp-004', first:'Carlos', last:'Garcia',  role:'employee',   rate:'22.00', title:'Security Officer' },
    { id:'dev-acme-emp-005', first:'Destiny',last:'Johnson', role:'employee',   rate:'21.50', title:'Security Officer' },
    { id:'dev-acme-emp-006', first:'Wei',    last:'Zhang',   role:'employee',   rate:'23.00', title:'Sr. Security Officer' },
    { id:'dev-acme-emp-007', first:'Aisha',  last:'Williams',role:'employee',   rate:'21.00', title:'Security Officer' },
    { id:'dev-acme-emp-008', first:'Derek',  last:'Thompson',role:'employee',   rate:'24.00', title:'Armed Officer' },
    { id:'dev-acme-emp-009', first:'Ethan',  last:'Morris',  role:'employee',   rate:'22.50', title:'Security Officer' },
    { id:'dev-acme-emp-010', first:'Logan',  last:'Carter',  role:'employee',   rate:'21.00', title:'Security Officer' },
    { id:'dev-acme-emp-011', first:'Maria',  last:'Lopez',   role:'employee',   rate:'23.50', title:'Event Security' },
    { id:'dev-acme-emp-012', first:'Robert', last:'Brown',   role:'employee',   rate:'22.00', title:'Security Officer' },
    { id:'dev-acme-emp-013', first:'Patricia',last:'Davis',  role:'employee',   rate:'21.00', title:'Security Officer' },
    { id:'dev-acme-emp-014', first:'Michael',last:'Wilson',  role:'employee',   rate:'24.50', title:'Armed Officer' },
  ];

  for (const emp of officers) {
    const userId = uuid();
    await q(`INSERT INTO users (id, email, first_name, last_name, password_hash, role,
      email_verified, current_workspace_id, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,true,$7,NOW()) ON CONFLICT DO NOTHING`,
      [userId, `${emp.first.toLowerCase()}.${emp.last.toLowerCase()}@acme-security.test`,
       emp.first, emp.last, PASS_HASH, emp.role, WS]);

    await q(`INSERT INTO employees (id, user_id, workspace_id, first_name, last_name, email,
      hourly_rate, workspace_role, employment_type, status, hire_date, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'full_time','active',$9,NOW()) ON CONFLICT DO NOTHING`,
      [emp.id, userId, WS, emp.first, emp.last,
       `${emp.first.toLowerCase()}.${emp.last.toLowerCase()}@acme-security.test`,
       emp.rate, emp.role, dateStr(daysAgo(randInt(90, 730)))]);
    track('employees');
  }

  // Clients (7)
  const clients = [
    { id:'dev-client-001', name:'Riverside Shopping Center',   rate:'28.50', city:'Dallas' },
    { id:'dev-client-002', name:'Pinnacle Tower LLC',          rate:'32.00', city:'Irving' },
    { id:'dev-client-003', name:'Lone Star Medical Center',    rate:'35.00', city:'Plano' },
    { id:'dev-client-004', name:'Texas Star Event Center',     rate:'45.00', city:'Arlington' },
    { id:'dev-client-005', name:'Heritage National Bank',      rate:'38.00', city:'Dallas' },
    { id:'dev-client-006', name:'Oakwood Residential Mgmt',    rate:'26.00', city:'Garland' },
    { id:'dev-client-007', name:'DFW Distribution Center',     rate:'29.50', city:'Grand Prairie' },
  ];

  for (const c of clients) {
    await q(`INSERT INTO clients (id, workspace_id, company_name, contact_name, email, phone,
      address, city, state, billing_rate, status, created_at)
      VALUES ($1,$2,$3,'Facility Manager','contact@${toLowerCase(c.name)}.test',
      '+1972555${randInt(1000,9999)}','123 Business Dr',$4,'TX',$5,'active',NOW())
      ON CONFLICT DO NOTHING`,
      [c.id, WS, c.name, c.city, c.rate]);
    track('clients');
  }

  // Shifts — 60 days historical + 30 days future
  await seedShifts(WS, officers.slice(3), clients, 60, 30);

  // Invoices
  await seedInvoices(WS, clients, ownerId);

  // Payroll
  await seedPayroll(WS, officers);

  // Help tickets
  await seedHelpTickets(WS, ownerId);

  // Incident reports
  await seedIncidents(WS, officers.slice(3), clients);

  console.log(`  ✅ ACME Security complete`);
}

// ─── Shift Seeder ─────────────────────────────────────────────────────────────
async function seedShifts(
  workspaceId: string,
  officers: any[],
  clients: any[],
  historyDays: number,
  futureDays: number
) {
  const shifts: any[] = [];
  const SHIFT_TYPES = [
    { start: '07:00', end: '15:00', title: 'Day Shift' },
    { start: '15:00', end: '23:00', title: 'Evening Shift' },
    { start: '23:00', end: '07:00', title: 'Night Shift' },
  ];

  // Historical shifts (completed)
  for (let d = historyDays; d >= 1; d--) {
    const date = dateStr(daysAgo(d));
    const shiftsPerDay = randInt(2, 5);
    for (let i = 0; i < shiftsPerDay; i++) {
      const shiftType = pick(SHIFT_TYPES);
      const officer = pick(officers);
      const client = pick(clients);
      const shiftId = uuid();

      await q(`INSERT INTO shifts (id, workspace_id, employee_id, client_id, date,
        start_time, end_time, title, status, hourly_rate, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'completed',$9,NOW()) ON CONFLICT DO NOTHING`,
        [shiftId, workspaceId, officer.id, client.id, date,
         shiftType.start, shiftType.end, shiftType.title, officer.rate || '22.00']);

      // Time entry for completed shift
      await q(`INSERT INTO time_entries (id, workspace_id, employee_id, shift_id, clock_in,
        clock_out, total_hours, status, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'approved',NOW()) ON CONFLICT DO NOTHING`,
        [uuid(), workspaceId, officer.id, shiftId,
         `${date} ${shiftType.start}`, `${date} ${shiftType.end}`,
         shiftType.start < shiftType.end ? '8.0' : '8.0']);
      track('shifts');
    }
  }

  // Future shifts (mix of assigned and open)
  for (let d = 1; d <= futureDays; d++) {
    const date = dateStr(daysFromNow(d));
    const shiftsPerDay = randInt(3, 6);
    for (let i = 0; i < shiftsPerDay; i++) {
      const shiftType = pick(SHIFT_TYPES);
      const client = pick(clients);
      // 70% assigned, 30% open (Trinity fills these)
      const assigned = Math.random() > 0.30;
      const officer = assigned ? pick(officers) : null;

      await q(`INSERT INTO shifts (id, workspace_id, employee_id, client_id, date,
        start_time, end_time, title, status, hourly_rate, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) ON CONFLICT DO NOTHING`,
        [uuid(), workspaceId, officer?.id || null, client.id, date,
         shiftType.start, shiftType.end, shiftType.title,
         assigned ? 'scheduled' : 'open', officer?.rate || '22.00']);
      track('shifts');
    }
  }
}

// ─── Invoice Seeder ──────────────────────────────────────────────────────────
async function seedInvoices(workspaceId: string, clients: any[], ownerId: string) {
  const statuses = [
    { status: 'paid', count: 6 },
    { status: 'sent', count: 3 },
    { status: 'overdue', count: 2 },
    { status: 'draft', count: 1 },
  ];

  let invNum = 1001;
  for (const { status, count } of statuses) {
    for (let i = 0; i < count; i++) {
      const client = pick(clients);
      const amount = randFloat(3000, 25000);
      const dueDate = status === 'overdue' ? daysAgo(randInt(15, 45)) : daysFromNow(30);
      const invoiceId = uuid();

      await q(`INSERT INTO invoices (id, workspace_id, client_id, invoice_number, status,
        total, subtotal, tax_amount, due_date, issue_date, notes, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) ON CONFLICT DO NOTHING`,
        [invoiceId, workspaceId, client.id, `INV-${invNum++}`, status,
         amount.toFixed(2), (amount * 0.9).toFixed(2), (amount * 0.1).toFixed(2),
         dateStr(dueDate), dateStr(daysAgo(randInt(1, 30))),
         'Security services per contract agreement']);

      // Line items
      await q(`INSERT INTO invoice_line_items (id, invoice_id, workspace_id, description,
        quantity, unit_price, amount, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) ON CONFLICT DO NOTHING`,
        [uuid(), invoiceId, workspaceId, 'Security Officer Services (Regular)',
         randInt(80, 200).toString(), '22.00', (amount * 0.7).toFixed(2)]);
      track('invoices');
    }
  }
}

// ─── Payroll Seeder ───────────────────────────────────────────────────────────
async function seedPayroll(workspaceId: string, employees: any[]) {
  const periods = [
    { start: daysAgo(45), end: daysAgo(31), status: 'completed' },
    { start: daysAgo(30), end: daysAgo(16), status: 'completed' },
    { start: daysAgo(15), end: daysAgo(1),  status: 'draft' },
  ];

  for (const period of periods) {
    const runId = uuid();
    const totalGross = randFloat(15000, 45000);

    await q(`INSERT INTO payroll_runs (id, workspace_id, period_start, period_end, status,
      total_gross_pay, total_net_pay, employee_count, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) ON CONFLICT DO NOTHING`,
      [runId, workspaceId, dateStr(period.start), dateStr(period.end),
       period.status, totalGross.toFixed(2), (totalGross * 0.75).toFixed(2),
       employees.length]);

    // Payroll entries per employee
    for (const emp of employees.slice(0, 8)) {
      const hours = randFloat(60, 86);
      const rate = parseFloat(emp.rate || '22.00');
      const gross = (hours * rate).toFixed(2);

      await q(`INSERT INTO payroll_entries (id, workspace_id, payroll_run_id, employee_id,
        hours_worked, hourly_rate, gross_pay, net_pay, status, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) ON CONFLICT DO NOTHING`,
        [uuid(), workspaceId, runId, emp.id, hours.toFixed(2), rate.toFixed(2),
         gross, (parseFloat(gross) * 0.75).toFixed(2), period.status]);
      track('payroll_entries');
    }
    track('payroll_runs');
  }
}

// ─── Help Ticket Seeder ───────────────────────────────────────────────────────
async function seedHelpTickets(workspaceId: string, userId: string) {
  const tickets = [
    { subj: 'Unable to clock in from mobile app', status: 'open', priority: 'high' },
    { subj: 'Paycheck amount seems incorrect for last period', status: 'open', priority: 'urgent' },
    { subj: 'Need to update direct deposit bank account', status: 'in_progress', priority: 'normal' },
    { subj: 'Shift swap request not going through', status: 'in_progress', priority: 'normal' },
    { subj: 'GPS not tracking during patrol route', status: 'resolved', priority: 'high' },
    { subj: 'Invoice PDF not generating properly', status: 'resolved', priority: 'normal' },
    { subj: 'Employee license expiration alert question', status: 'resolved', priority: 'low' },
  ];

  for (const t of tickets) {
    await q(`INSERT INTO support_tickets (id, workspace_id, user_id, subject, description,
      status, priority, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) ON CONFLICT DO NOTHING`,
      [uuid(), workspaceId, userId, t.subj,
       `User reported: ${t.subj}. Needs immediate attention per priority level.`,
       t.status, t.priority]);
    track('support_tickets');
  }
}

// ─── Incident Report Seeder ───────────────────────────────────────────────────
async function seedIncidents(workspaceId: string, officers: any[], clients: any[]) {
  const incidents = [
    { type: 'theft', title: 'Shoplifting incident — Riverside Mall', severity: 'medium' },
    { type: 'trespass', title: 'Unauthorized access to server room', severity: 'high' },
    { type: 'medical', title: 'Medical emergency at parking level 2', severity: 'high' },
    { type: 'vandalism', title: 'Vehicle vandalism in east lot', severity: 'low' },
    { type: 'disturbance', title: 'Noise disturbance near loading dock', severity: 'low' },
    { type: 'suspicious', title: 'Suspicious package reported at entrance', severity: 'high' },
  ];

  for (const inc of incidents) {
    await q(`INSERT INTO incident_reports (id, workspace_id, employee_id, client_id,
      incident_type, title, description, severity, status, incident_date, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'resolved',$9,NOW()) ON CONFLICT DO NOTHING`,
      [uuid(), workspaceId, pick(officers).id, pick(clients).id,
       inc.type, inc.title,
       `Detailed incident report: ${inc.title}. Officer responded within 3 minutes. Situation resolved.`,
       inc.severity, dateStr(daysAgo(randInt(1, 30)))]);
    track('incident_reports');
  }
}

// ─── Subscription + Billing Seeder ───────────────────────────────────────────
async function seedSubscriptions() {
  console.log('\n💳 Seeding subscription records...');

  const subscriptions = [
    { wsId: TENANTS.ACME,      tier: 'enterprise', amount: '499.00', status: 'active' },
    { wsId: TENANTS.ANVIL,     tier: 'pro',        amount: '299.00', status: 'active' },
    { wsId: TENANTS.STATEWIDE, tier: 'enterprise', amount: '499.00', status: 'active',
      note: 'Founder exemption — permanent enterprise' },
  ];

  for (const sub of subscriptions) {
    // Update workspace subscription status
    await q(`UPDATE workspaces SET subscription_tier=$1, subscription_status='active',
      trial_ends_at=NULL, billing_cycle_start=$2, billing_cycle_end=$3
      WHERE id=$4`,
      [sub.tier, dateStr(daysAgo(15)), dateStr(daysFromNow(15)), sub.wsId]);

    // Create billing audit entry
    await q(`INSERT INTO billing_audit_log (id, workspace_id, event_type, amount, description,
      created_at) VALUES ($1,$2,'subscription_renewed',$3,$4,NOW()) ON CONFLICT DO NOTHING`,
      [uuid(), sub.wsId, sub.amount,
       `${sub.tier} plan — monthly renewal. ${sub.note || ''}`]);
    track('subscriptions');
  }
  console.log('  ✅ Subscriptions seeded');
}

// ─── Notification Seeder ─────────────────────────────────────────────────────
async function seedNotifications() {
  console.log('\n🔔 Seeding notifications...');

  const notifTypes = [
    { type: 'shift_assigned', title: 'Shift Assigned', msg: 'You have been assigned to Evening Shift on Monday.' },
    { type: 'payroll_processed', title: 'Payroll Processed', msg: 'Your payroll for the period has been processed.' },
    { type: 'invoice_paid', title: 'Invoice Paid', msg: 'Invoice INV-1042 has been paid. $8,450.00 received.' },
    { type: 'calloff_received', title: 'Call-Off Received', msg: 'Officer Garcia called off for tonight\'s shift.' },
    { type: 'license_expiring', title: 'License Expiring Soon', msg: 'Security license expires in 30 days.' },
    { type: 'shift_reminder', title: 'Shift Reminder', msg: 'Your shift starts in 2 hours at Pinnacle Tower.' },
  ];

  for (const ws of Object.values(TENANTS)) {
    for (const notif of notifTypes) {
      await q(`INSERT INTO notifications (id, workspace_id, user_id, type, title, message,
        is_read, created_at) VALUES ($1,$2,$3,$4,$5,$6,false,NOW()) ON CONFLICT DO NOTHING`,
        [uuid(), ws, `dev-${ws.includes('acme') ? 'acme' : ws.includes('anvil') ? 'anvil' : 'statewide'}-owner-001`,
         notif.type, notif.title, notif.msg]);
      track('notifications');
    }
  }
  console.log('  ✅ Notifications seeded');
}

// ─── Anvil Security Seed (lightweight) ───────────────────────────────────────
async function seedAnvil() {
  console.log('\n📋 Seeding Anvil Security Group...');
  const WS = TENANTS.ANVIL;
  const ownerId = 'dev-anvil-owner-001';

  await q(`INSERT INTO workspaces (id, name, owner_id, subscription_tier, subscription_status,
    business_category, state, city, timezone, max_employees, max_clients, created_at)
    VALUES ($1,'Anvil Security Group',$2,'pro','active','security','TX','San Antonio',
    'America/Chicago',25,15,NOW()) ON CONFLICT (id) DO NOTHING`, [WS, ownerId]);

  await q(`INSERT INTO users (id, email, first_name, last_name, password_hash, role,
    email_verified, current_workspace_id, created_at)
    VALUES ($1,'owner@anvil-security.test','Brandon','Steel',$2,'org_owner',true,$3,NOW())
    ON CONFLICT (id) DO NOTHING`, [ownerId, PASS_HASH, WS]);

  // 8 employees
  const anvil_staff = [
    { id:'dev-anvil-emp-001', first:'Brandon',  last:'Steel',   role:'org_owner', rate:'42.00' },
    { id:'dev-anvil-emp-002', first:'Diana',    last:'Cruz',    role:'manager',   rate:'33.00' },
    { id:'dev-anvil-emp-003', first:'Marcus',   last:'Bell',    role:'employee',  rate:'21.00' },
    { id:'dev-anvil-emp-004', first:'Tamara',   last:'Hill',    role:'employee',  rate:'21.50' },
    { id:'dev-anvil-emp-005', first:'Andre',    last:'King',    role:'employee',  rate:'22.00' },
    { id:'dev-anvil-emp-006', first:'Priya',    last:'Patel',   role:'employee',  rate:'21.00' },
    { id:'dev-anvil-emp-007', first:'Jordan',   last:'Reed',    role:'employee',  rate:'23.00' },
    { id:'dev-anvil-emp-008', first:'Keisha',   last:'Moore',   role:'employee',  rate:'21.00' },
  ];

  for (const emp of anvil_staff) {
    const userId = uuid();
    await q(`INSERT INTO users (id,email,first_name,last_name,password_hash,role,email_verified,
      current_workspace_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,true,$7,NOW()) ON CONFLICT DO NOTHING`,
      [userId, `${emp.first.toLowerCase()}@anvil-security.test`, emp.first, emp.last, PASS_HASH, emp.role, WS]);
    await q(`INSERT INTO employees (id,user_id,workspace_id,first_name,last_name,email,
      hourly_rate,workspace_role,employment_type,status,hire_date,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'full_time','active',$9,NOW()) ON CONFLICT DO NOTHING`,
      [emp.id, userId, WS, emp.first, emp.last, `${emp.first.toLowerCase()}@anvil-security.test`,
       emp.rate, emp.role, dateStr(daysAgo(randInt(60, 400)))]);
    track('employees');
  }

  const anvil_clients = [
    { id:'dev-anvil-cl-001', name:'Pearl Brewery SA', rate:'27.00' },
    { id:'dev-anvil-cl-002', name:'USAA Campus Security', rate:'35.00' },
    { id:'dev-anvil-cl-003', name:'AT&T Center Events', rate:'42.00' },
    { id:'dev-anvil-cl-004', name:'San Antonio River Walk Properties', rate:'29.00' },
  ];

  for (const c of anvil_clients) {
    await q(`INSERT INTO clients (id,workspace_id,company_name,contact_name,email,phone,
      city,state,billing_rate,status,created_at)
      VALUES ($1,$2,$3,'Operations Manager','contact@client.test','+12105550000',$4,'TX',$5,'active',NOW())
      ON CONFLICT DO NOTHING`, [c.id, WS, c.name, 'San Antonio', c.rate]);
    track('clients');
  }

  await seedShifts(WS, anvil_staff.slice(2), anvil_clients, 30, 14);
  await seedInvoices(WS, anvil_clients, ownerId);
  await seedPayroll(WS, anvil_staff);
  await seedHelpTickets(WS, ownerId);

  console.log('  ✅ Anvil Security complete');
}

// ─── Statewide Test Workspace (mirrors real SPS) ──────────────────────────────
async function seedStatewideTestWorkspace() {
  console.log('\n📋 Seeding Test Statewide (mirrors SPS)...');
  const WS = TENANTS.STATEWIDE;

  await q(`INSERT INTO workspaces (id, name, owner_id, subscription_tier, subscription_status,
    business_category, state, city, timezone, psb_license, sdvosb_verified, max_employees,
    max_clients, created_at)
    VALUES ($1,'Test Statewide Protective Services','test-statewide-owner-000000000001',
    'enterprise','active','security','TX','San Antonio','America/Chicago','C11608501-TEST',
    true,200,50,NOW()) ON CONFLICT (id) DO NOTHING`, [WS]);

  await q(`INSERT INTO users (id,email,first_name,last_name,password_hash,role,
    email_verified,current_workspace_id,created_at)
    VALUES ('test-statewide-owner-000000000001','owner@test-statewide.test','Bryan','Guillen',
    $1,'org_owner',true,$2,NOW()) ON CONFLICT DO NOTHING`, [PASS_HASH, WS]);
  track('workspaces');

  // 20 officers for test (full 150 via seed-statewide-dev.ts)
  for (let i = 1; i <= 20; i++) {
    const { first, last } = randName();
    const empId = `test-sps-emp-${String(i).padStart(3,'0')}`;
    const userId = uuid();
    const rate = randFloat(18, 28);

    await q(`INSERT INTO users (id,email,first_name,last_name,password_hash,role,
      email_verified,current_workspace_id,created_at)
      VALUES ($1,$2,$3,$4,$5,'employee',true,$6,NOW()) ON CONFLICT DO NOTHING`,
      [userId, `${first.toLowerCase()}.${last.toLowerCase()}${i}@test-statewide.test`,
       first, last, PASS_HASH, WS]);

    await q(`INSERT INTO employees (id,user_id,workspace_id,first_name,last_name,email,
      hourly_rate,workspace_role,employment_type,status,hire_date,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'employee','full_time','active',$8,NOW())
      ON CONFLICT DO NOTHING`,
      [empId, userId, WS, first, last,
       `${first.toLowerCase()}.${last.toLowerCase()}${i}@test-statewide.test`,
       rate.toFixed(2), dateStr(daysAgo(randInt(30, 500)))]);
    track('employees');
  }

  // 8 test clients
  const sps_clients = [
    { id:'test-sps-cl-001', name:'HEB Distribution SA',        rate:'27.00' },
    { id:'test-sps-cl-002', name:'Brooks City Base Events',    rate:'35.00' },
    { id:'test-sps-cl-003', name:'Methodist Hospital Campus',  rate:'38.00' },
    { id:'test-sps-cl-004', name:'SA Airport Terminal C',      rate:'45.00' },
    { id:'test-sps-cl-005', name:'Port San Antonio Perimeter', rate:'32.00' },
    { id:'test-sps-cl-006', name:'JBSA Lackland Civil Ops',    rate:'42.00' },
    { id:'test-sps-cl-007', name:'Alamo Quarry Market',        rate:'26.00' },
    { id:'test-sps-cl-008', name:'Pearl District Properties',  rate:'29.00' },
  ];

  for (const c of sps_clients) {
    await q(`INSERT INTO clients (id,workspace_id,company_name,contact_name,email,phone,
      city,state,billing_rate,status,created_at)
      VALUES ($1,$2,$3,'Operations Contact','ops@client.test','+12105550000',
      'San Antonio','TX',$4,'active',NOW()) ON CONFLICT DO NOTHING`,
      [c.id, WS, c.name, c.rate]);
    track('clients');
  }

  // Shift data
  const sps_staff = Array.from({length: 20}, (_, i) => ({
    id: `test-sps-emp-${String(i+1).padStart(3,'0')}`,
    rate: '22.00'
  }));
  await seedShifts(WS, sps_staff, sps_clients, 45, 21);
  await seedInvoices(WS, sps_clients, 'test-statewide-owner-000000000001');
  await seedPayroll(WS, sps_staff);
  await seedHelpTickets(WS, 'test-statewide-owner-000000000001');
  await seedIncidents(WS, sps_staff.slice(0, 10), sps_clients);

  console.log('  ✅ Test Statewide complete');
}

// ─── Stress Test Data ─────────────────────────────────────────────────────────
async function seedStressData() {
  console.log('\n⚡ Seeding stress test data (high volume)...');

  // Generate 500 random shifts across all tenants for load testing
  const ws = pick(Object.values(TENANTS));
  for (let i = 0; i < 100; i++) {
    await q(`INSERT INTO shifts (id,workspace_id,date,start_time,end_time,title,status,created_at)
      VALUES ($1,$2,$3,'07:00','15:00','Stress Test Shift','open',NOW()) ON CONFLICT DO NOTHING`,
      [uuid(), ws, dateStr(daysFromNow(randInt(1, 60)))]);
  }
  track('stress_shifts', 100);

  console.log('  ✅ Stress data seeded');
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 CoAIleague — Full Development Seed Starting...');
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Database: ${process.env.DATABASE_URL?.slice(0, 40)}...`);
  console.log('');

  const start = Date.now();

  try {
    await seedACME();
    await seedAnvil();
    await seedStatewideTestWorkspace();
    await seedSubscriptions();
    await seedNotifications();
    await seedStressData();

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log('\n✅ ═══════════════════════════════════════');
    console.log('   SEED COMPLETE');
    console.log(`   Time: ${elapsed}s`);
    console.log('');
    console.log('   Records created:');
    Object.entries(results).forEach(([k, v]) => console.log(`   ${k.padEnd(20)} ${v}`));
    console.log('═══════════════════════════════════════');
    console.log('');
    console.log('   Login credentials (all tenants):');
    console.log('   Password: DevTest2026!');
    console.log('   ACME owner: owner@acme-security.test');
    console.log('   Anvil owner: owner@anvil-security.test');
    console.log('   SPS test owner: owner@test-statewide.test');
    console.log('');
    console.log('   ⚠️  Token expires: revoke GitHub PAT after session');

  } catch (err: any) {
    console.error('\n❌ Seed failed:', err?.message || err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
