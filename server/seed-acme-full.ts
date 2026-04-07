/**
 * Comprehensive Acme Security Services demo data seeder.
 * Seeds the demo-workspace-00000000 with a full, realistic dataset for
 * a 10-officer security guard company in Los Angeles.
 *
 * Uses pool.query() (raw SQL) for reliability without drizzle-kit dependency.
 */

import { pool } from "./db";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

export const DEMO_WORKSPACE_ID = "demo-workspace-00000000";
export const DEMO_OWNER_USER_ID = "demo-user-00000000";

// ──────────────────────────────────────────────────────────────────────────────
// ID constants — stable so re-runs are idempotent
// ──────────────────────────────────────────────────────────────────────────────
const EMP_IDS = [
  "demo-emp-001", "demo-emp-002", "demo-emp-003", "demo-emp-004", "demo-emp-005",
  "demo-emp-006", "demo-emp-007", "demo-emp-008", "demo-emp-009", "demo-emp-010",
];
const USER_IDS = [
  "demo-uem-001", "demo-uem-002", "demo-uem-003", "demo-uem-004", "demo-uem-005",
  "demo-uem-006", "demo-uem-007", "demo-uem-008", "demo-uem-009", "demo-uem-010",
];
const CLI_IDS = [
  "demo-cli-001", "demo-cli-002", "demo-cli-003", "demo-cli-004", "demo-cli-005",
];

// ──────────────────────────────────────────────────────────────────────────────
// People & clients
// ──────────────────────────────────────────────────────────────────────────────
const EMPLOYEES = [
  { id: EMP_IDS[0], userId: USER_IDS[0], firstName: "Marcus",   lastName: "Rodriguez",   email: "marcus.rodriguez@acmesec.test",   phone: "213-555-0101", role: "supervisor",     hourlyRate: "32.00", empNum: "ACM-001", wsRole: "org_owner",    color: "#3B82F6" },
  { id: EMP_IDS[1], userId: USER_IDS[1], firstName: "Jennifer", lastName: "Torres",      email: "jennifer.torres@acmesec.test",    phone: "213-555-0102", role: "supervisor",     hourlyRate: "28.50", empNum: "ACM-002", wsRole: "manager",      color: "#8B5CF6" },
  { id: EMP_IDS[2], userId: USER_IDS[2], firstName: "David",    lastName: "Kim",         email: "david.kim@acmesec.test",          phone: "213-555-0103", role: "guard",          hourlyRate: "22.00", empNum: "ACM-003", wsRole: "employee",     color: "#10B981" },
  { id: EMP_IDS[3], userId: USER_IDS[3], firstName: "Alicia",   lastName: "Brown",       email: "alicia.brown@acmesec.test",       phone: "213-555-0104", role: "guard",          hourlyRate: "21.50", empNum: "ACM-004", wsRole: "employee",     color: "#F59E0B" },
  { id: EMP_IDS[4], userId: USER_IDS[4], firstName: "Robert",   lastName: "Washington",  email: "robert.washington@acmesec.test",  phone: "213-555-0105", role: "senior_guard",   hourlyRate: "25.00", empNum: "ACM-005", wsRole: "employee",     color: "#EF4444" },
  { id: EMP_IDS[5], userId: USER_IDS[5], firstName: "Carmen",   lastName: "Lopez",       email: "carmen.lopez@acmesec.test",       phone: "213-555-0106", role: "guard",          hourlyRate: "21.50", empNum: "ACM-006", wsRole: "employee",     color: "#06B6D4" },
  { id: EMP_IDS[6], userId: USER_IDS[6], firstName: "Anthony",  lastName: "Johnson",     email: "anthony.johnson@acmesec.test",    phone: "213-555-0107", role: "dispatcher",     hourlyRate: "24.00", empNum: "ACM-007", wsRole: "employee",     color: "#84CC16" },
  { id: EMP_IDS[7], userId: USER_IDS[7], firstName: "Nicole",   lastName: "Davis",       email: "nicole.davis@acmesec.test",       phone: "213-555-0108", role: "hr_coordinator", hourlyRate: "26.00", empNum: "ACM-008", wsRole: "manager",      color: "#F97316" },
  { id: EMP_IDS[8], userId: USER_IDS[8], firstName: "Kevin",    lastName: "Smith",       email: "kevin.smith@acmesec.test",        phone: "213-555-0109", role: "guard",          hourlyRate: "21.50", empNum: "ACM-009", wsRole: "employee",     color: "#A855F7" },
  { id: EMP_IDS[9], userId: USER_IDS[9], firstName: "Maria",    lastName: "Garcia",      email: "maria.garcia@acmesec.test",       phone: "213-555-0110", role: "guard",          hourlyRate: "21.50", empNum: "ACM-010", wsRole: "employee",     color: "#14B8A6" },
];

const CLIENTS = [
  { id: CLI_IDS[0], companyName: "Pacific Medical Center",          email: "security@pacificmedical.test",    phone: "310-555-2001", address: "3200 S Hoover St, Los Angeles, CA 90007",        contactFirst: "Dr. Helen",  contactLast: "Park",    code: "PMC", color: "#3B82F6" },
  { id: CLI_IDS[1], companyName: "Westside Shopping Mall",          email: "ops@westsidemal.test",            phone: "310-555-2002", address: "10800 W Pico Blvd, Los Angeles, CA 90064",       contactFirst: "Brian",      contactLast: "Foster",  code: "WSM", color: "#10B981" },
  { id: CLI_IDS[2], companyName: "TechHub Corporate Campus",        email: "facilities@techhubl.test",        phone: "323-555-2003", address: "633 W Fifth St, Los Angeles, CA 90071",          contactFirst: "Sandra",     contactLast: "Ng",      code: "THC", color: "#8B5CF6" },
  { id: CLI_IDS[3], companyName: "LA Metro Transit Authority",      email: "security@lametrota.test",         phone: "213-555-2004", address: "One Gateway Plaza, Los Angeles, CA 90012",       contactFirst: "James",      contactLast: "Okafor",  code: "LMT", color: "#F59E0B" },
  { id: CLI_IDS[4], companyName: "Sunset Luxury Apartments",        email: "management@sunsetluxury.test",    phone: "310-555-2005", address: "8470 Sunset Blvd, West Hollywood, CA 90069",     contactFirst: "Olivia",     contactLast: "Chen",    code: "SLA", color: "#EF4444" },
];

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}
function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

// ──────────────────────────────────────────────────────────────────────────────
// Main seeder
// ──────────────────────────────────────────────────────────────────────────────
export async function seedAcmeFullDemo(): Promise<void> {
  // ── -1. Production guard: dev tenants must NEVER be created in production ─
  // (CLAUDE.md §12 — Acme Security is only a dev/test tenant)
  const { isProduction } = await import('./lib/isProduction');
  if (isProduction()) {
    console.log("🌱 [ACME] Skipped — production environment");
    return;
  }

  console.log("🌱 [ACME] Starting comprehensive Acme Security demo seed...");

  // ── 0. Guard: skip if already seeded ─────────────────────────────────────
  const existing = await pool.query(
    `SELECT id FROM workspaces WHERE id = $1`, [DEMO_WORKSPACE_ID]
  );
  const contractCheck = await pool.query(`SELECT COUNT(*) AS cnt FROM client_contracts WHERE workspace_id = $1`, [DEMO_WORKSPACE_ID]);
  if (existing.rows.length > 0 && parseInt(contractCheck.rows[0].cnt) >= 5) {
    console.log("✅ [ACME] Full demo seed already present — skipping.");
    return;
  }
  if (existing.rows.length > 0) {
    console.log("ℹ️  [ACME] Workspace exists but data incomplete — continuing seed.");
  }

  const passwordHash = await bcrypt.hash("Demo1234!", 10);

  // ── 1. Demo owner user ────────────────────────────────────────────────────
  await pool.query(`
    INSERT INTO users (id, email, first_name, last_name, role, password_hash, email_verified, current_workspace_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, true, $7, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `, [DEMO_OWNER_USER_ID, "demo@coaileague.test", "Demo", "User", "user", passwordHash, DEMO_WORKSPACE_ID]);

  // ── 2. Workspace ──────────────────────────────────────────────────────────
  await pool.query(`
    INSERT INTO workspaces (id, name, owner_id, company_name, address, phone, website,
      subscription_tier, subscription_status, max_employees, max_clients, business_category, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
    ON CONFLICT (id) DO NOTHING
  `, [
    DEMO_WORKSPACE_ID,
    "Acme Security Services",
    DEMO_OWNER_USER_ID,
    "Acme Security Services, LLC",
    "1800 Century Park E, Los Angeles, CA 90067",
    "213-555-9800",
    "https://acmesecurity.demo",
    "professional",
    "active",
    50,
    20,
    "security",
  ]);

  console.log("✅ [ACME] Workspace created");

  // ── 3. Employee users ─────────────────────────────────────────────────────
  for (const e of EMPLOYEES) {
    await pool.query(`
      INSERT INTO users (id, email, first_name, last_name, role, password_hash, email_verified, current_workspace_id, created_at, updated_at)
      VALUES ($1,$2,$3,$4,'user',$5,true,$6,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [e.userId, e.email, e.firstName, e.lastName, passwordHash, DEMO_WORKSPACE_ID]);
  }

  // ── 4. Workspace member for owner ─────────────────────────────────────────
  await pool.query(`
    INSERT INTO workspace_members (id, user_id, workspace_id, role, status, joined_at, created_at, updated_at)
    VALUES ($1,$2,$3,'org_owner','active',NOW(),NOW(),NOW())
    ON CONFLICT DO NOTHING
  `, [randomUUID(), DEMO_OWNER_USER_ID, DEMO_WORKSPACE_ID]);

  // ── 5. Employees ──────────────────────────────────────────────────────────
  for (let i = 0; i < EMPLOYEES.length; i++) {
    const e = EMPLOYEES[i];
    await pool.query(`
      INSERT INTO employees (id, workspace_id, user_id, first_name, last_name, email, phone, role,
        hourly_rate, color, is_active, employee_number, workspace_role, onboarding_status,
        address, city, state, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,'completed',$13,'Los Angeles','CA',NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      e.id, DEMO_WORKSPACE_ID, e.userId, e.firstName, e.lastName, e.email, e.phone, e.role,
      e.hourlyRate, e.color, e.empNum, e.wsRole,
      `${100 + i} ${["Main St","Oak Ave","Maple Dr","Cedar Blvd","Elm Way"][i % 5]}, Los Angeles, CA 9000${i + 1}`,
    ]);

    await pool.query(`
      INSERT INTO workspace_members (id, user_id, workspace_id, role, status, joined_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,'active',NOW(),NOW(),NOW())
      ON CONFLICT DO NOTHING
    `, [randomUUID(), e.userId, DEMO_WORKSPACE_ID, e.wsRole]);
  }

  console.log("✅ [ACME] Employees created");

  // ── 6. Clients ────────────────────────────────────────────────────────────
  for (const c of CLIENTS) {
    await pool.query(`
      INSERT INTO clients (id, workspace_id, first_name, last_name, company_name, email, phone, address,
        is_active, client_code, color, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [c.id, DEMO_WORKSPACE_ID, c.contactFirst, c.contactLast, c.companyName, c.email, c.phone, c.address, c.code, c.color]);
  }

  console.log("✅ [ACME] Clients created");

  // ── 7. SPS Documents — Employee Onboarding Packets ───────────────────────
  const spsEmpData = [
    { empIdx: 2, status: "completed",        dob: "1992-03-15", licNum: "B1092847", licType: "Unarmed",   site: "Pacific Medical Center",    hireDate: daysAgo(180), completedAt: daysAgo(170) },
    { empIdx: 3, status: "completed",        dob: "1994-07-22", licNum: "B1093412", licType: "Unarmed",   site: "Westside Shopping Mall",    hireDate: daysAgo(150), completedAt: daysAgo(145) },
    { empIdx: 4, status: "completed",        dob: "1988-11-08", licNum: "B1089234", licType: "Armed",     site: "TechHub Corporate Campus",  hireDate: daysAgo(365), completedAt: daysAgo(358) },
    { empIdx: 5, status: "completed",        dob: "1996-05-30", licNum: "B1097831", licType: "Unarmed",   site: "LA Metro Transit Authority", hireDate: daysAgo(90),  completedAt: daysAgo(85)  },
    { empIdx: 6, status: "completed",        dob: "1990-01-18", licNum: "B1091456", licType: "Unarmed",   site: "Sunset Luxury Apartments",  hireDate: daysAgo(200), completedAt: daysAgo(193) },
    { empIdx: 7, status: "completed",        dob: "1985-09-04", licNum: "B1086023", licType: "Armed",     site: "Pacific Medical Center",    hireDate: daysAgo(400), completedAt: daysAgo(394) },
    { empIdx: 8, status: "partially_signed", dob: "1998-12-25", licNum: "B1099201", licType: "Unarmed",   site: "Westside Shopping Mall",    hireDate: daysAgo(14),  completedAt: null },
    { empIdx: 9, status: "sent",             dob: "1993-06-10", licNum: "B1094567", licType: "Unarmed",   site: "TechHub Corporate Campus",  hireDate: daysAgo(7),   completedAt: null },
  ];

  for (const item of spsEmpData) {
    const emp = EMPLOYEES[item.empIdx];
    const spsId = `demo-sps-emp-00${item.empIdx}`;
    await pool.query(`
      INSERT INTO sps_documents (
        id, workspace_id, document_type, document_number, status,
        access_token, access_token_hash, expires_at,
        org_signer_name, org_signer_email,
        recipient_name, recipient_email,
        employee_dob, employee_pob, employee_ssn_last4,
        employee_address, employee_phone,
        guard_license_number, guard_license_expiry, guard_license_type,
        assignment_site, assignment_address,
        hire_date, position, pay_rate, uniform_size,
        state_code, sent_at, viewed_at, completed_at, created_at, updated_at
      ) VALUES (
        $1,$2,'employee_packet',$3,$4,
        $5,$6,$7,
        'Marcus Rodriguez','marcus.rodriguez@acmesec.test',
        $8,$9,
        $10,'Los Angeles, CA','4521',
        $11,$12,
        $13,$14,$15,
        $16,'See Assignment Details',
        $17,$18,$19,'M',
        'CA',$20,$21,$22,NOW(),NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `, [
      spsId, DEMO_WORKSPACE_ID,
      `EP-2025-${String(item.empIdx).padStart(3, "0")}`,
      item.status,
      randomUUID().replace(/-/g, ""),
      randomUUID().replace(/-/g, ""),
      item.completedAt ? isoDate(daysFromNow(30)) : isoDate(daysFromNow(30)),
      `${emp.firstName} ${emp.lastName}`, emp.email,
      isoDate(new Date(item.dob)),
      `${100 + item.empIdx} Main St, Los Angeles, CA 90001`,
      emp.phone,
      item.licNum,
      isoDate(daysFromNow(365)),
      item.licType,
      item.site,
      isoDate(item.hireDate),
      emp.role, emp.hourlyRate,
      item.hireDate,
      item.completedAt ?? null,
      item.completedAt,
    ]);
  }

  // ── 8. SPS Documents — Client Service Agreements ─────────────────────────
  const spsClientData = [
    { cliIdx: 0, status: "completed",  startDate: daysAgo(365), completedAt: daysAgo(358), docNum: "CSA-2024-001", officers: 6, rateP: 22.00, rateA: 20.00 },
    { cliIdx: 1, status: "completed",  startDate: daysAgo(300), completedAt: daysAgo(295), docNum: "CSA-2024-002", officers: 4, rateP: 21.00, rateA: 19.50 },
    { cliIdx: 2, status: "sent",       startDate: daysFromNow(14), completedAt: null,       docNum: "CSA-2025-003", officers: 3, rateP: 23.00, rateA: 21.00 },
    { cliIdx: 3, status: "completed",  startDate: daysAgo(180), completedAt: daysAgo(174), docNum: "CSA-2024-004", officers: 5, rateP: 20.50, rateA: 19.00 },
    { cliIdx: 4, status: "partially_signed", startDate: daysFromNow(7), completedAt: null,  docNum: "CSA-2025-005", officers: 2, rateP: 25.00, rateA: 23.00 },
  ];

  for (const item of spsClientData) {
    const cli = CLIENTS[item.cliIdx];
    const spsId = `demo-sps-cli-00${item.cliIdx}`;
    await pool.query(`
      INSERT INTO sps_documents (
        id, workspace_id, document_type, document_number, status,
        access_token, access_token_hash, expires_at,
        org_signer_name, org_signer_email,
        recipient_name, recipient_email,
        client_company_name, client_address, client_contact_name,
        service_type, rate_primary, rate_additional,
        service_location, service_hours,
        contract_start_date, contract_term, officers_required,
        state_code, sent_at, viewed_at, completed_at, created_at, updated_at
      ) VALUES (
        $1,$2,'client_service_agreement',$3,$4,
        $5,$6,$7,
        'Marcus Rodriguez','marcus.rodriguez@acmesec.test',
        $8,$9,
        $10,$11,$12,
        'Security Guard Services',$13,$14,
        $15,'24/7 rotating shifts',
        $16,'12 months',$17,
        'CA',$18,$19,$20,NOW(),NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `, [
      spsId, DEMO_WORKSPACE_ID,
      item.docNum, item.status,
      randomUUID().replace(/-/g, ""),
      randomUUID().replace(/-/g, ""),
      isoDate(daysFromNow(90)),
      `${cli.contactFirst} ${cli.contactLast}`, cli.email,
      cli.companyName, cli.address, `${cli.contactFirst} ${cli.contactLast}`,
      item.rateP, item.rateA,
      cli.address,
      isoDate(item.startDate),
      item.officers,
      item.startDate,
      item.completedAt ?? null,
      item.completedAt,
    ]);
  }

  console.log("✅ [ACME] SPS Documents (employee packets + client service agreements) created");

  // ── 9. Client Contracts ───────────────────────────────────────────────────
  const contractStatuses = ["executed", "executed", "sent", "executed", "draft"];
  const contractTitles = [
    "Security Services Agreement — Pacific Medical Center",
    "Security Services Agreement — Westside Shopping Mall",
    "Security Services Agreement — TechHub Corporate Campus",
    "Security Services Agreement — LA Metro Transit Authority",
    "Security Services Agreement — Sunset Luxury Apartments",
  ];

  for (let i = 0; i < CLIENTS.length; i++) {
    const cli = CLIENTS[i];
    const cid = `demo-contract-00${i}`;
    const status = contractStatuses[i];
    const startDate = status === "executed" ? isoDate(daysAgo(180 - i * 30)) : isoDate(daysFromNow(14));
    const endDate = isoDate(daysFromNow(365 - i * 10));
    const contractValue = (18000 + i * 6000).toString();
    const contractContent = `# Security Services Agreement\n\nThis Security Services Agreement ("Agreement") is entered into between Acme Security Services, LLC ("Company") and ${cli.companyName} ("Client").\n\n## 1. Services\nCompany shall provide licensed security officer services as described herein.\n\n## 2. Term\nThis Agreement is effective for one (1) year from the execution date.\n\n## 3. Compensation\nClient shall pay Company at the agreed billing rate. Total contract value: $${contractValue}.\n\n## 4. Governing Law\nThis Agreement shall be governed by the laws of the State of California.`;
    await pool.query(`
      INSERT INTO client_contracts (
        id, workspace_id, doc_type, client_id, client_name, client_email,
        title, content, status, effective_date, term_end_date,
        total_value, annual_value, version,
        created_by, created_at, updated_at,
        executed_at, sent_at
      ) VALUES (
        $1,$2,'contract',$3,$4,$5,
        $6,$7,$8,$9,$10,
        $11,$12,1,
        $13,NOW(),NOW(),
        $14,$15
      )
      ON CONFLICT (id) DO NOTHING
    `, [
      cid, DEMO_WORKSPACE_ID, cli.id, cli.companyName, cli.email,
      contractTitles[i], contractContent, status, startDate, endDate,
      contractValue, contractValue,
      DEMO_OWNER_USER_ID,
      status === "executed" ? daysAgo(175 - i * 28) : null,
      status !== "draft" ? daysAgo(180 - i * 30) : null,
    ]);
  }

  console.log("✅ [ACME] Client contracts created");

  // ── 10. Payroll Runs ──────────────────────────────────────────────────────
  const payrollRunDefs = [
    { id: "demo-pr-001", periodStart: daysAgo(76), periodEnd: daysAgo(63), status: "paid",       payDate: daysAgo(60) },
    { id: "demo-pr-002", periodStart: daysAgo(48), periodEnd: daysAgo(35), status: "paid",       payDate: daysAgo(32) },
    { id: "demo-pr-003", periodStart: daysAgo(20), periodEnd: daysAgo(7),  status: "processed", payDate: daysAgo(4)  },
  ];

  for (const run of payrollRunDefs) {
    // Calculate totals for this run
    let totalGross = 0;
    for (const e of EMPLOYEES) {
      const hours = 80;
      const ot = 4;
      const gross = parseFloat(e.hourlyRate) * hours + parseFloat(e.hourlyRate) * 1.5 * ot;
      totalGross += gross;
    }
    const totalTaxes = totalGross * 0.2;
    const totalNet = totalGross - totalTaxes;

    await pool.query(`
      INSERT INTO payroll_runs (
        id, workspace_id, period_start, period_end, status,
        total_gross_pay, total_taxes, total_net_pay,
        processed_by, processed_at, payment_schedule,
        disbursement_status, run_type, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,
        $9,$10,'bi_weekly',
        $11,'regular',NOW(),NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `, [
      run.id, DEMO_WORKSPACE_ID, run.periodStart, run.periodEnd, run.status,
      totalGross.toFixed(2), totalTaxes.toFixed(2), totalNet.toFixed(2),
      DEMO_OWNER_USER_ID, run.payDate,
      run.status === "paid" ? "completed" : "pending",
    ]);

    // ── 11. Payroll Entries + Pay Stubs per employee ──────────────────────
    for (let i = 0; i < EMPLOYEES.length; i++) {
      const emp = EMPLOYEES[i];
      const entryId = `demo-pe-${run.id}-emp${i}`;
      const payStubId = `demo-ps-${run.id}-emp${i}`;
      const regHours = 80;
      const otHours = 4;
      const rate = parseFloat(emp.hourlyRate);
      const gross = rate * regHours + rate * 1.5 * otHours;
      const fedTax = gross * 0.12;
      const stateTax = gross * 0.05;
      const ss = gross * 0.062;
      const medicare = gross * 0.0145;
      const net = gross - fedTax - stateTax - ss - medicare;

      await pool.query(`
        INSERT INTO payroll_entries (
          id, payroll_run_id, employee_id, workspace_id,
          regular_hours, overtime_hours, hourly_rate,
          gross_pay, federal_tax, state_tax, social_security, medicare, net_pay,
          worker_type, payout_status, paid_period_start, paid_period_end, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,
          $5,$6,$7,
          $8,$9,$10,$11,$12,$13,
          'employee',$14,$15,$16,NOW(),NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `, [
        entryId, run.id, emp.id, DEMO_WORKSPACE_ID,
        regHours, otHours, rate.toFixed(2),
        gross.toFixed(2), fedTax.toFixed(2), stateTax.toFixed(2), ss.toFixed(2), medicare.toFixed(2), net.toFixed(2),
        run.status === "paid" ? "completed" : "pending",
        run.periodStart, run.periodEnd,
      ]);

      const totalDeductions = fedTax + stateTax + ss + medicare;
      await pool.query(`
        INSERT INTO pay_stubs (
          id, workspace_id, payroll_run_id, payroll_entry_id, employee_id,
          pay_period_start, pay_period_end, pay_date,
          gross_pay, total_deductions, net_pay,
          deductions_breakdown, earnings_breakdown, employer_costs,
          status, created_by, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,
          $6,$7,$8,
          $9,$10,$11,
          $12,$13,$14,
          $15,$16,NOW(),NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `, [
        payStubId, DEMO_WORKSPACE_ID, run.id, entryId, emp.id,
        run.periodStart, run.periodEnd, run.payDate,
        gross.toFixed(2), totalDeductions.toFixed(2), net.toFixed(2),
        JSON.stringify({ federal_tax: fedTax.toFixed(2), state_tax: stateTax.toFixed(2), social_security: ss.toFixed(2), medicare: medicare.toFixed(2) }),
        JSON.stringify({ regular: (rate * regHours).toFixed(2), overtime: (rate * 1.5 * otHours).toFixed(2) }),
        JSON.stringify({ employer_ss: ss.toFixed(2), employer_medicare: medicare.toFixed(2), workers_comp: (gross * 0.02).toFixed(2) }),
        run.status === "paid" ? "generated" : "pending",
        DEMO_OWNER_USER_ID,
      ]);
    }
  }

  console.log("✅ [ACME] Payroll runs, entries, and pay stubs created");

  // ── 12. Company Policies ──────────────────────────────────────────────────
  const policies = [
    {
      id: "demo-pol-001", title: "Employee Handbook 2025", category: "general",
      desc: "Comprehensive guide covering employment terms, benefits, and workplace conduct.",
      content: `# Acme Security Services Employee Handbook 2025\n\n## Welcome\nWelcome to Acme Security Services. This handbook outlines your rights, responsibilities, and the standards we uphold.\n\n## Employment At-Will\nEmployment is at-will unless otherwise stated in a written agreement.\n\n## Work Hours\nStandard shifts are 8 hours. Overtime must be approved by your supervisor.\n\n## Benefits\n- Health insurance after 90-day probation\n- Paid time off: 10 days/year (accrued)\n- Retirement: 401(k) with 3% match after 1 year`,
      requiresAck: true, ackDays: 7, version: "2025.1", publishedAt: daysAgo(30),
    },
    {
      id: "demo-pol-002", title: "Code of Conduct", category: "conduct",
      desc: "Standards for professional behavior, ethics, and interaction with clients and coworkers.",
      content: `# Code of Conduct\n\n## Professionalism\nAll officers are expected to maintain a professional demeanor at all times.\n\n## Uniform Standards\nUniform must be clean, pressed, and worn correctly during every shift.\n\n## Client Interaction\nOfficers must be respectful, calm, and professional when interacting with clients and the public.\n\n## Zero Tolerance\nHarassment, discrimination, and misconduct will result in immediate termination.`,
      requiresAck: true, ackDays: 5, version: "3.2", publishedAt: daysAgo(30),
    },
    {
      id: "demo-pol-003", title: "Drug-Free Workplace Policy", category: "safety",
      desc: "Policy prohibiting use, possession, or distribution of controlled substances.",
      content: `# Drug-Free Workplace Policy\n\nAcme Security Services maintains a drug-free workplace. All employees are subject to pre-employment and random drug testing.\n\n## Prohibited Conduct\n- Being under the influence during work hours\n- Possession of controlled substances on company premises or client sites\n\n## Consequences\nViolation will result in immediate suspension pending investigation and possible termination.`,
      requiresAck: true, ackDays: 3, version: "2.0", publishedAt: daysAgo(30),
    },
    {
      id: "demo-pol-004", title: "Uniform & Appearance Policy", category: "appearance",
      desc: "Detailed requirements for uniform, grooming, and personal presentation.",
      content: `# Uniform & Appearance Policy\n\n## Issued Uniform\nEach officer receives: 2 shirts, 2 pants, 1 jacket, 1 hat, 1 badge holder.\n\n## Grooming\nHair must be neat and professional. Tattoos on hands or face must be covered.\n\n## Footwear\nBlack boots or polished black shoes — no open-toe footwear.\n\n## ID Badge\nID badge must be visible and worn at all times while on duty.`,
      requiresAck: false, ackDays: 0, version: "1.5", publishedAt: daysAgo(45),
    },
    {
      id: "demo-pol-005", title: "Incident Reporting Policy", category: "safety",
      desc: "Procedures for reporting security incidents, accidents, and emergency situations.",
      content: `# Incident Reporting Policy\n\n## Required Reporting\nAll incidents must be reported within 2 hours of occurrence via the CoAIleague reporting system.\n\n## Types of Incidents\n- Security breaches\n- Accidents or injuries\n- Property damage\n- Suspicious activity\n\n## Report Contents\nIncident reports must include: date/time, location, persons involved, description of events, actions taken, and witnesses.`,
      requiresAck: true, ackDays: 5, version: "2.1", publishedAt: daysAgo(60),
    },
  ];

  for (const pol of policies) {
    await pool.query(`
      INSERT INTO company_policies (
        id, workspace_id, title, description, category, content_markdown,
        version, requires_acknowledgment, acknowledgment_deadline_days,
        published_at, published_by, status, created_by, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,
        $10,$11,'published',$12,NOW(),NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `, [
      pol.id, DEMO_WORKSPACE_ID, pol.title, pol.desc, pol.category, pol.content,
      pol.version, pol.requiresAck, pol.ackDays,
      pol.publishedAt, DEMO_OWNER_USER_ID, DEMO_OWNER_USER_ID,
    ]);
  }

  // Policy acknowledgments — most employees acknowledged the key policies
  const policiesRequiringAck = policies.filter(p => p.requiresAck).map(p => p.id);
  for (let ei = 0; ei < EMPLOYEES.length; ei++) {
    const emp = EMPLOYEES[ei];
    for (const polId of policiesRequiringAck) {
      // First 7 employees acknowledged; last 3 have pending
      if (ei < 7) {
        await pool.query(`
          INSERT INTO policy_acknowledgments (
            id, workspace_id, policy_id, employee_id,
            acknowledged_at, policy_version, policy_title, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,'2025.1','Employee Handbook 2025',NOW(),NOW())
          ON CONFLICT DO NOTHING
        `, [randomUUID(), DEMO_WORKSPACE_ID, polId, emp.id, daysAgo(25 - ei)]);
      }
    }
  }

  console.log("✅ [ACME] Company policies and acknowledgments created");

  // ── 13. Employee Documents — Guard Licenses, I9, W4 ──────────────────────
  const docTypes = [
    { type: "guard_card",      name: "Security Guard License",      ext: "application/pdf" },
    { type: "i9_form",                 name: "I-9 Employment Eligibility",  ext: "application/pdf" },
    { type: "w4_form",                 name: "W-4 Tax Withholding Form",    ext: "application/pdf" },
  ];

  for (let ei = 0; ei < EMPLOYEES.length; ei++) {
    const emp = EMPLOYEES[ei];
    for (const dt of docTypes) {
      const docId = `demo-edoc-${dt.type}-emp${ei}`;
      const isExpired = dt.type === "guard_card" && ei === 7;
      await pool.query(`
        INSERT INTO employee_documents (
          id, workspace_id, employee_id, document_type, document_name,
          document_description, file_url, file_size, file_type,
          original_file_name, uploaded_by, uploaded_by_email, uploaded_by_role,
          uploaded_at, upload_ip_address, status, is_compliance_document, is_verified, verified_by,
          expiration_date, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,
          $6,$7,245000,'application/pdf',
          $8,$9,$10,'hr',
          $11,'127.0.0.1',$12,true,true,$13,
          $14,NOW(),NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `, [
        docId, DEMO_WORKSPACE_ID, emp.id, dt.type, `${dt.name} — ${emp.firstName} ${emp.lastName}`,
        `${dt.name} for ${emp.firstName} ${emp.lastName}`,
        `https://storage.demo/docs/${docId}.pdf`,
        `${emp.firstName.toLowerCase()}_${emp.lastName.toLowerCase()}_${dt.type}.pdf`,
        DEMO_OWNER_USER_ID, "nicole.davis@acmesec.test",
        daysAgo(180 - ei * 5),
        isExpired ? "expired" : "approved",
        DEMO_OWNER_USER_ID,
        dt.type === "guard_card" ? (isExpired ? daysAgo(30) : daysFromNow(335)) : null,
      ]);
    }
  }

  console.log("✅ [ACME] Employee documents (licenses, I9, W4) created");

  // ── 14. Org Documents ─────────────────────────────────────────────────────
  const orgDocs = [
    { id: "demo-org-001", cat: "policy",     name: "Employee Handbook 2025.pdf",         size: 1842000, desc: "Annual employee handbook" },
    { id: "demo-org-002", cat: "compliance", name: "BSIS License Certificate.pdf",        size: 512000,  desc: "Bureau of Security and Investigative Services license" },
    { id: "demo-org-003", cat: "compliance", name: "General Liability Insurance.pdf",     size: 328000,  desc: "Commercial general liability policy" },
    { id: "demo-org-004", cat: "compliance", name: "Workers Comp Insurance.pdf",          size: 294000,  desc: "Workers compensation policy certificate" },
    { id: "demo-org-005", cat: "template",   name: "Post Orders Template.docx",           size: 124000,  desc: "Standard post orders template for new sites" },
    { id: "demo-org-006", cat: "template",   name: "Daily Activity Report Template.pdf",  size: 98000,   desc: "DAR template for officer field reports" },
    { id: "demo-org-007", cat: "legal",      name: "Business License 2025.pdf",           size: 156000,  desc: "City of Los Angeles business license" },
  ];

  for (const od of orgDocs) {
    await pool.query(`
      INSERT INTO org_documents (
        id, workspace_id, uploaded_by, category, file_name, file_path,
        file_size_bytes, file_type, description, is_active,
        version, requires_signature, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,'application/pdf',$8,true,
        1,false,NOW(),NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `, [od.id, DEMO_WORKSPACE_ID, DEMO_OWNER_USER_ID, od.cat, od.name, `/org/${DEMO_WORKSPACE_ID}/${od.id}`, od.size, od.desc]);
  }

  console.log("✅ [ACME] Org documents created");

  // ── 15. Report Templates ──────────────────────────────────────────────────
  const reportTemplates = [
    {
      id: "demo-rt-001", name: "Daily Activity Report (DAR)",
      desc: "Field officer daily activity log — incidents, patrols, observations",
      category: "operations",
      fields: [
        { id: "patrol_areas", label: "Areas Patrolled", type: "textarea", required: true },
        { id: "incidents", label: "Incidents / Observations", type: "textarea", required: false },
        { id: "visitors", label: "Visitor Log Count", type: "number", required: true },
        { id: "equipment_check", label: "Equipment Status", type: "select", options: ["OK","Needs Attention","Out of Service"], required: true },
      ],
      isCompliance: false, isSystem: true,
    },
    {
      id: "demo-rt-002", name: "Incident Report",
      desc: "Formal incident documentation — required within 2 hours of any event",
      category: "incident",
      fields: [
        { id: "incident_type", label: "Incident Type", type: "select", options: ["Theft","Trespass","Disturbance","Medical","Vandalism","Other"], required: true },
        { id: "description", label: "Detailed Description", type: "textarea", required: true },
        { id: "persons_involved", label: "Persons Involved", type: "textarea", required: true },
        { id: "actions_taken", label: "Actions Taken", type: "textarea", required: true },
        { id: "police_notified", label: "Police Notified?", type: "select", options: ["Yes","No"], required: true },
        { id: "case_number", label: "Police Case Number (if applicable)", type: "text", required: false },
      ],
      isCompliance: true, isSystem: true,
    },
    {
      id: "demo-rt-003", name: "Payroll Hours Certification",
      desc: "Manager certification of employee hours for payroll processing",
      category: "payroll",
      fields: [
        { id: "period_start", label: "Pay Period Start", type: "date", required: true },
        { id: "period_end", label: "Pay Period End", type: "date", required: true },
        { id: "total_regular_hours", label: "Total Regular Hours", type: "number", required: true },
        { id: "total_overtime_hours", label: "Total Overtime Hours", type: "number", required: false },
        { id: "discrepancies", label: "Any Discrepancies?", type: "textarea", required: false },
      ],
      isCompliance: false, isSystem: true,
    },
    {
      id: "demo-rt-004", name: "Clock-In Compliance Audit",
      desc: "Weekly audit of officer clock-in/out adherence and GPS verification",
      category: "compliance",
      fields: [
        { id: "week_of", label: "Week Of", type: "date", required: true },
        { id: "late_arrivals", label: "Late Arrivals Count", type: "number", required: true },
        { id: "missed_clock_outs", label: "Missed Clock-Outs", type: "number", required: true },
        { id: "gps_failures", label: "GPS Verification Failures", type: "number", required: true },
        { id: "notes", label: "Audit Notes", type: "textarea", required: false },
      ],
      isCompliance: true, isSystem: true,
    },
  ];

  for (const tmpl of reportTemplates) {
    await pool.query(`
      INSERT INTO report_templates (
        id, workspace_id, name, description, category, fields,
        is_compliance_report, is_active, is_system_template,
        created_by, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      tmpl.id, DEMO_WORKSPACE_ID, tmpl.name, tmpl.desc, tmpl.category,
      JSON.stringify(tmpl.fields),
      tmpl.isCompliance, tmpl.isSystem, DEMO_OWNER_USER_ID,
    ]);
  }

  // ── 16. Report Submissions ─────────────────────────────────────────────────
  const reportSubs = [
    // Daily Activity Reports
    { id: "demo-rs-001", templateId: "demo-rt-001", empIdx: 2, cliIdx: 0, status: "approved", daysAgoN: 1, type: "daily_activity", formData: { patrol_areas: "Lobby, ER entrance, Parking Garage A & B", incidents: "None", visitors: "47", equipment_check: "OK" } },
    { id: "demo-rs-002", templateId: "demo-rt-001", empIdx: 3, cliIdx: 1, status: "approved", daysAgoN: 1, type: "daily_activity", formData: { patrol_areas: "Main entrance, Food court, South parking", incidents: "Shoplifting attempt — subject left without merchandise", visitors: "312", equipment_check: "OK" } },
    { id: "demo-rs-003", templateId: "demo-rt-001", empIdx: 4, cliIdx: 2, status: "submitted", daysAgoN: 0, type: "daily_activity", formData: { patrol_areas: "Building A-C perimeter, Server room corridor", incidents: "None", visitors: "89", equipment_check: "Needs Attention" } },
    // Incident Report
    { id: "demo-rs-004", templateId: "demo-rt-002", empIdx: 3, cliIdx: 1, status: "approved", daysAgoN: 5, type: "incident", formData: { incident_type: "Theft", description: "Observed individual concealing merchandise in bag. Approached and escorted to security office. Police contacted.", persons_involved: "Unknown male, approx 35, 5'10\"", actions_taken: "Detained subject, called LAPD, completed loss prevention report", police_notified: "Yes", case_number: "LAPD-2025-04812" } },
    { id: "demo-rs-005", templateId: "demo-rt-002", empIdx: 5, cliIdx: 3, status: "submitted", daysAgoN: 2, type: "incident", formData: { incident_type: "Trespass", description: "Individual refused to show transit pass and became verbally aggressive.", persons_involved: "Unknown female, approx 28", actions_taken: "Requested individual leave the premises. Subject complied.", police_notified: "No", case_number: "" } },
    // Payroll Certification
    { id: "demo-rs-006", templateId: "demo-rt-003", empIdx: 0, cliIdx: null, status: "approved", daysAgoN: 35, type: "payroll", formData: { period_start: isoDate(daysAgo(48)), period_end: isoDate(daysAgo(35)), total_regular_hours: "800", total_overtime_hours: "40", discrepancies: "None" } },
    // Clock-In Compliance
    { id: "demo-rs-007", templateId: "demo-rt-004", empIdx: 1, cliIdx: null, status: "approved", daysAgoN: 7, type: "compliance", formData: { week_of: isoDate(daysAgo(14)), late_arrivals: "2", missed_clock_outs: "1", gps_failures: "0", notes: "Two late arrivals due to LA traffic — documented with supervisor approval." } },
  ];

  for (const sub of reportSubs) {
    const emp = EMPLOYEES[sub.empIdx];
    const cli = sub.cliIdx !== null ? CLIENTS[sub.cliIdx] : null;
    await pool.query(`
      INSERT INTO report_submissions (
        id, workspace_id, template_id, report_number, employee_id, client_id,
        form_data, status, submitted_at, created_at, updated_at, report_type
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,NOW(),NOW(),$10
      )
      ON CONFLICT (id) DO NOTHING
    `, [
      sub.id, DEMO_WORKSPACE_ID, sub.templateId,
      `RPT-${new Date().getFullYear()}-${sub.id.split("-").pop()?.padStart(4, "0")}`,
      emp.id, cli?.id ?? null,
      JSON.stringify(sub.formData),
      sub.status, daysAgo(sub.daysAgoN), sub.type,
    ]);
  }

  console.log("✅ [ACME] Report templates and submissions created");

  // ── 17. Proposals ─────────────────────────────────────────────────────────
  const proposals = [
    {
      id: "demo-prop-001",
      name: "Security Services Proposal — LA Unified School District",
      status: "sent",
      type: "outbound",
      clientName: "LA Unified School District",
      clientEmail: "facilities@lausd.demo",
      totalValue: "48000.00",
      validUntil: daysFromNow(30),
      desc: "Comprehensive security services for 3 LAUSD campuses in South LA",
    },
    {
      id: "demo-prop-002",
      name: "Security Services Proposal — Century City Mall",
      status: "accepted",
      type: "outbound",
      clientName: "Century City Mall",
      clientEmail: "ops@centurycity.demo",
      totalValue: "72000.00",
      validUntil: daysAgo(10),
      desc: "Full-coverage security for Century City Mall — 24/7, 8 officers",
    },
    {
      id: "demo-prop-003",
      name: "RFP Response — Port of Los Angeles Security",
      status: "submitted",
      type: "rfp_response",
      clientName: "Port of Los Angeles",
      clientEmail: "procurement@portofla.demo",
      totalValue: "180000.00",
      validUntil: daysFromNow(60),
      desc: "Response to Port of LA RFP #2025-SEC-007 for maritime security services",
    },
  ];

  for (const prop of proposals) {
    await pool.query(`
      INSERT INTO proposals (
        id, workspace_id, proposal_name, status, proposal_type,
        client_name, client_email, total_value, valid_until,
        description, company_name, company_email, company_phone,
        created_by, created_at, updated_at, submitted_at
      ) VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,
        $10,'Acme Security Services, LLC','info@acmesec.test','213-555-9800',
        $11,NOW(),NOW(),$12
      )
      ON CONFLICT (id) DO NOTHING
    `, [
      prop.id, DEMO_WORKSPACE_ID, prop.name, prop.status, prop.type,
      prop.clientName, prop.clientEmail, prop.totalValue, prop.validUntil,
      prop.desc,
      DEMO_OWNER_USER_ID,
      prop.status !== "draft" ? daysAgo(5) : null,
    ]);
  }

  // ── 18. RFPs ──────────────────────────────────────────────────────────────
  await pool.query(`
    INSERT INTO rfps (
      id, workspace_id, title, rfp_number, buyer, source,
      posted_date, due_date, estimated_value, industry, location,
      ai_summary, scope_of_work, status, created_at, updated_at
    ) VALUES
    ('demo-rfp-001',$1,'Security Services for Government Complex','RFP-2025-GOV-0042','City of Los Angeles Dept. of General Services','government_portal',
      $2,$3,'250000','government','Los Angeles, CA',
      'Multi-year contract for security guard services at 4 city government buildings, 24/7 coverage, approx 12 officers.',
      '24/7 security at 4 government office buildings, approx 80,000 sq ft combined','open',NOW(),NOW()),
    ('demo-rfp-002',$1,'Hospital Campus Security Services','RFP-2025-HLT-0018','Cedars-Sinai Medical Center','direct',
      $4,$5,'95000','healthcare','Beverly Hills, CA',
      'Security services for hospital campus, focus on visitor management and emergency response.','Campus perimeter and interior security, visitor management, emergency response support','tracking',NOW(),NOW()),
    ('demo-rfp-003',$1,'Transit Authority Security Guards','RFP-2025-TRN-0031','LA County Metropolitan Transportation Authority','government_portal',
      $6,$7,'380000','government','Los Angeles, CA',
      'Large-scale transit security contract covering 12 metro stations and 3 bus depots.','12 metro stations + 3 bus depots, fare enforcement support, emergency response','won',NOW(),NOW())
    ON CONFLICT (id) DO NOTHING
  `, [
    DEMO_WORKSPACE_ID,
    isoDate(daysAgo(20)), isoDate(daysFromNow(40)),
    isoDate(daysAgo(45)), isoDate(daysFromNow(15)),
    isoDate(daysAgo(180)), isoDate(daysAgo(90)),
  ]);

  console.log("✅ [ACME] Proposals and RFPs created");

  // ── 19. Basic Shifts ──────────────────────────────────────────────────────
  const shiftDefs = [
    { empIdx: 2, cliIdx: 0, startH: 7,  endH: 15, daysBack: 1,  status: "completed" },
    { empIdx: 3, cliIdx: 1, startH: 8,  endH: 16, daysBack: 1,  status: "completed" },
    { empIdx: 4, cliIdx: 2, startH: 15, endH: 23, daysBack: 1,  status: "completed" },
    { empIdx: 5, cliIdx: 3, startH: 6,  endH: 14, daysBack: 1,  status: "completed" },
    { empIdx: 6, cliIdx: 4, startH: 22, endH: 6,  daysBack: 1,  status: "completed" },
    { empIdx: 7, cliIdx: 0, startH: 7,  endH: 15, daysBack: 0,  status: "in_progress" },
    { empIdx: 8, cliIdx: 1, startH: 8,  endH: 16, daysBack: 0,  status: "scheduled" },
    { empIdx: 9, cliIdx: 2, startH: 15, endH: 23, daysBack: 0,  status: "scheduled" },
    { empIdx: 2, cliIdx: 3, startH: 7,  endH: 15, daysBack: -1, status: "scheduled" },
    { empIdx: 4, cliIdx: 4, startH: 8,  endH: 16, daysBack: -1, status: "scheduled" },
  ];

  for (let i = 0; i < shiftDefs.length; i++) {
    const s = shiftDefs[i];
    const emp = EMPLOYEES[s.empIdx];
    const cli = CLIENTS[s.cliIdx];
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - s.daysBack);
    const start = new Date(baseDate);
    start.setHours(s.startH, 0, 0, 0);
    const end = new Date(baseDate);
    if (s.endH <= s.startH) end.setDate(end.getDate() + 1);
    end.setHours(s.endH, 0, 0, 0);
    const shiftId = `demo-shift-${String(i).padStart(3, "0")}`;
    await pool.query(`
      INSERT INTO shifts (
        id, workspace_id, employee_id, client_id,
        start_time, end_time, status, hourly_rate_override, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [shiftId, DEMO_WORKSPACE_ID, emp.id, cli.id, start, end, s.status, emp.hourlyRate]);
  }

  console.log("✅ [ACME] Shifts created");
  console.log("🎉 [ACME] Comprehensive Acme Security demo seed COMPLETE!");
}
