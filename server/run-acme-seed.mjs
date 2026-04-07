/**
 * Standalone runner for the Acme Security demo seed.
 * Run with: node server/run-acme-seed.mjs
 */
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { randomUUID, createHash } from 'crypto';

const DEMO_WORKSPACE_ID = "demo-workspace-00000000";
const DEMO_OWNER_USER_ID = "demo-user-00000000";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
  { id: CLI_IDS[0], companyName: "Pacific Medical Center",     email: "security@pacificmedical.test", phone: "310-555-2001", address: "3200 S Hoover St, Los Angeles, CA 90007",    contactFirst: "Dr. Helen", contactLast: "Park",   code: "PMC", color: "#3B82F6" },
  { id: CLI_IDS[1], companyName: "Westside Shopping Mall",     email: "ops@westsidemal.test",         phone: "310-555-2002", address: "10800 W Pico Blvd, Los Angeles, CA 90064",   contactFirst: "Brian",     contactLast: "Foster", code: "WSM", color: "#10B981" },
  { id: CLI_IDS[2], companyName: "TechHub Corporate Campus",   email: "facilities@techhubl.test",     phone: "323-555-2003", address: "633 W Fifth St, Los Angeles, CA 90071",      contactFirst: "Sandra",    contactLast: "Ng",     code: "THC", color: "#8B5CF6" },
  { id: CLI_IDS[3], companyName: "LA Metro Transit Authority", email: "security@lametrota.test",      phone: "213-555-2004", address: "One Gateway Plaza, Los Angeles, CA 90012",   contactFirst: "James",     contactLast: "Okafor", code: "LMT", color: "#F59E0B" },
  { id: CLI_IDS[4], companyName: "Sunset Luxury Apartments",   email: "management@sunsetluxury.test", phone: "310-555-2005", address: "8470 Sunset Blvd, West Hollywood, CA 90069", contactFirst: "Olivia",    contactLast: "Chen",   code: "SLA", color: "#EF4444" },
];

function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n); return d;
}
function daysFromNow(n) {
  const d = new Date(); d.setDate(d.getDate() + n); return d;
}
function isoDate(d) {
  return d.toISOString().split("T")[0];
}

async function run() {
  console.log("🌱 [ACME] Starting comprehensive Acme Security demo seed...");

  const existing = await pool.query(`SELECT id FROM workspaces WHERE id = $1`, [DEMO_WORKSPACE_ID]);
  if (existing.rows.length > 0) {
    console.log("ℹ️  [ACME] Demo workspace already exists — running idempotent re-seed.");
  }

  const passwordHash = await bcrypt.hash("Demo1234!", 10);

  // 1. Demo owner user
  await pool.query(`
    INSERT INTO users (id, email, first_name, last_name, role, password_hash, email_verified, current_workspace_id, created_at, updated_at)
    VALUES ($1,$2,'Demo','User','user',$3,true,$4,NOW(),NOW()) ON CONFLICT (id) DO NOTHING
  `, [DEMO_OWNER_USER_ID, "demo@coaileague.test", passwordHash, DEMO_WORKSPACE_ID]);

  // 2. Workspace
  await pool.query(`
    INSERT INTO workspaces (id, name, owner_id, company_name, address, phone, website,
      subscription_tier, subscription_status, max_employees, max_clients, business_category, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW()) ON CONFLICT (id) DO NOTHING
  `, [
    DEMO_WORKSPACE_ID, "Acme Security Services", DEMO_OWNER_USER_ID, "Acme Security Services, LLC",
    "1800 Century Park E, Los Angeles, CA 90067", "213-555-9800", "https://acmesecurity.demo",
    "professional", "active", 50, 20, "security",
  ]);

  console.log("✅ [ACME] Workspace + owner created");

  // 3. Employee users + workspace members + employees
  for (let i = 0; i < EMPLOYEES.length; i++) {
    const e = EMPLOYEES[i];
    await pool.query(`
      INSERT INTO users (id, email, first_name, last_name, role, password_hash, email_verified, current_workspace_id, created_at, updated_at)
      VALUES ($1,$2,$3,$4,'user',$5,true,$6,NOW(),NOW()) ON CONFLICT (id) DO NOTHING
    `, [e.userId, e.email, e.firstName, e.lastName, passwordHash, DEMO_WORKSPACE_ID]);

    await pool.query(`
      INSERT INTO workspace_members (id, user_id, workspace_id, role, status, joined_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,'active',NOW(),NOW(),NOW()) ON CONFLICT DO NOTHING
    `, [randomUUID(), e.userId, DEMO_WORKSPACE_ID, e.wsRole]);

    await pool.query(`
      INSERT INTO employees (id, workspace_id, user_id, first_name, last_name, email, phone, role,
        hourly_rate, color, is_active, employee_number, workspace_role, onboarding_status,
        address, city, state, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,'completed',$13,'Los Angeles','CA',NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      e.id, DEMO_WORKSPACE_ID, e.userId, e.firstName, e.lastName, e.email, e.phone, e.role,
      e.hourlyRate, e.color, e.empNum, e.wsRole,
      `${100 + i} Main St, Los Angeles, CA 9000${i + 1}`,
    ]);
  }

  // Owner workspace member
  await pool.query(`
    INSERT INTO workspace_members (id, user_id, workspace_id, role, status, joined_at, created_at, updated_at)
    VALUES ($1,$2,$3,'org_owner','active',NOW(),NOW(),NOW()) ON CONFLICT DO NOTHING
  `, [randomUUID(), DEMO_OWNER_USER_ID, DEMO_WORKSPACE_ID]);

  console.log("✅ [ACME] 10 employees created");

  // 4. Clients
  for (const c of CLIENTS) {
    await pool.query(`
      INSERT INTO clients (id, workspace_id, first_name, last_name, company_name, email, phone, address,
        is_active, client_code, color, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,NOW(),NOW()) ON CONFLICT (id) DO NOTHING
    `, [c.id, DEMO_WORKSPACE_ID, c.contactFirst, c.contactLast, c.companyName, c.email, c.phone, c.address, c.code, c.color]);
  }

  console.log("✅ [ACME] 5 clients created");

  // 5. SPS Documents — Employee Onboarding Packets
  const spsEmpData = [
    { empIdx: 2, status: "completed",        licNum: "B1092847", licType: "Unarmed", site: "Pacific Medical Center",    hireDate: daysAgo(180), completedAt: daysAgo(170) },
    { empIdx: 3, status: "completed",        licNum: "B1093412", licType: "Unarmed", site: "Westside Shopping Mall",    hireDate: daysAgo(150), completedAt: daysAgo(145) },
    { empIdx: 4, status: "completed",        licNum: "B1089234", licType: "Armed",   site: "TechHub Corporate Campus",  hireDate: daysAgo(365), completedAt: daysAgo(358) },
    { empIdx: 5, status: "completed",        licNum: "B1097831", licType: "Unarmed", site: "LA Metro Transit Authority",hireDate: daysAgo(90),  completedAt: daysAgo(85)  },
    { empIdx: 6, status: "completed",        licNum: "B1091456", licType: "Unarmed", site: "Sunset Luxury Apartments",  hireDate: daysAgo(200), completedAt: daysAgo(193) },
    { empIdx: 7, status: "completed",        licNum: "B1086023", licType: "Armed",   site: "Pacific Medical Center",    hireDate: daysAgo(400), completedAt: daysAgo(394) },
    { empIdx: 8, status: "partially_signed", licNum: "B1099201", licType: "Unarmed", site: "Westside Shopping Mall",    hireDate: daysAgo(14),  completedAt: null },
    { empIdx: 9, status: "sent",             licNum: "B1094567", licType: "Unarmed", site: "TechHub Corporate Campus",  hireDate: daysAgo(7),   completedAt: null },
  ];

  for (const item of spsEmpData) {
    const emp = EMPLOYEES[item.empIdx];
    const spsId = `demo-sps-emp-00${item.empIdx}`;
    await pool.query(`
      INSERT INTO sps_documents (
        id, workspace_id, document_type, document_number, status,
        access_token, access_token_hash, expires_at,
        org_signer_name, org_signer_email, recipient_name, recipient_email,
        employee_address, employee_phone, employee_ssn_last4,
        guard_license_number, guard_license_expiry, guard_license_type,
        assignment_site, hire_date, position, pay_rate, uniform_size, state_code,
        sent_at, completed_at, created_at, updated_at
      ) VALUES (
        $1,$2,'employee_packet',$3,$4,
        $5,$6,$7,
        'Marcus Rodriguez','marcus.rodriguez@acmesec.test',$8,$9,
        $10,$11,'4521',
        $12,$13,$14,
        $15,$16,$17,$18,'M','CA',
        $19,$20,NOW(),NOW()
      ) ON CONFLICT (id) DO NOTHING
    `, [
      spsId, DEMO_WORKSPACE_ID,
      `EP-2025-${String(item.empIdx).padStart(3,"0")}`, item.status,
      randomUUID().replace(/-/g,""), randomUUID().replace(/-/g,""),
      isoDate(daysFromNow(30)),
      `${emp.firstName} ${emp.lastName}`, emp.email,
      `${100 + item.empIdx} Main St, Los Angeles, CA 90001`,
      emp.phone,
      item.licNum, isoDate(daysFromNow(365)), item.licType,
      item.site, isoDate(item.hireDate), emp.role, emp.hourlyRate,
      item.hireDate, item.completedAt,
    ]);
  }

  // SPS Documents — Client Service Agreements
  const spsCliData = [
    { cliIdx: 0, status: "completed",        docNum: "CSA-2024-001", officers: 6, rateP: 22.00, rateA: 20.00, startDate: daysAgo(365), completedAt: daysAgo(358) },
    { cliIdx: 1, status: "completed",        docNum: "CSA-2024-002", officers: 4, rateP: 21.00, rateA: 19.50, startDate: daysAgo(300), completedAt: daysAgo(295) },
    { cliIdx: 2, status: "sent",             docNum: "CSA-2025-003", officers: 3, rateP: 23.00, rateA: 21.00, startDate: daysFromNow(14), completedAt: null },
    { cliIdx: 3, status: "completed",        docNum: "CSA-2024-004", officers: 5, rateP: 20.50, rateA: 19.00, startDate: daysAgo(180), completedAt: daysAgo(174) },
    { cliIdx: 4, status: "partially_signed", docNum: "CSA-2025-005", officers: 2, rateP: 25.00, rateA: 23.00, startDate: daysFromNow(7), completedAt: null },
  ];

  for (const item of spsCliData) {
    const cli = CLIENTS[item.cliIdx];
    const spsId = `demo-sps-cli-00${item.cliIdx}`;
    await pool.query(`
      INSERT INTO sps_documents (
        id, workspace_id, document_type, document_number, status,
        access_token, access_token_hash, expires_at,
        org_signer_name, org_signer_email, recipient_name, recipient_email,
        client_company_name, client_address, client_contact_name,
        service_type, rate_primary, rate_additional,
        service_location, service_hours, contract_start_date, contract_term, officers_required,
        state_code, sent_at, completed_at, created_at, updated_at
      ) VALUES (
        $1,$2,'client_service_agreement',$3,$4,
        $5,$6,$7,
        'Marcus Rodriguez','marcus.rodriguez@acmesec.test',$8,$9,
        $10,$11,$12,
        'Security Guard Services',$13,$14,
        $15,'24/7 rotating shifts',$16,'12 months',$17,
        'CA',$18,$19,NOW(),NOW()
      ) ON CONFLICT (id) DO NOTHING
    `, [
      spsId, DEMO_WORKSPACE_ID, item.docNum, item.status,
      randomUUID().replace(/-/g,""), randomUUID().replace(/-/g,""),
      isoDate(daysFromNow(90)),
      `${cli.contactFirst} ${cli.contactLast}`, cli.email,
      cli.companyName, cli.address, `${cli.contactFirst} ${cli.contactLast}`,
      item.rateP, item.rateA,
      cli.address, isoDate(item.startDate), item.officers,
      item.startDate, item.completedAt,
    ]);
  }

  console.log("✅ [ACME] 13 SPS Documents (8 packets + 5 client agreements) created");

  // 6. Client Contracts
  const contractStatuses = ["executed","executed","sent","executed","draft"];
  const contractTitles = [
    "Security Services Agreement — Pacific Medical Center",
    "Security Services Agreement — Westside Shopping Mall",
    "Security Services Agreement — TechHub Corporate Campus",
    "Security Services Agreement — LA Metro Transit Authority",
    "Security Services Agreement — Sunset Luxury Apartments",
  ];
  for (let i = 0; i < CLIENTS.length; i++) {
    const cli = CLIENTS[i];
    const status = contractStatuses[i];
    await pool.query(`
      INSERT INTO client_contracts (
        id, workspace_id, doc_type, client_id, client_name, client_email,
        title, status, effective_date, term_end_date, total_value, annual_value, version,
        created_by, created_at, updated_at, executed_at, sent_at
      ) VALUES ($1,$2,'contract',$3,$4,$5,$6,$7,$8,$9,$10,$11,1,$12,NOW(),NOW(),$13,$14)
      ON CONFLICT (id) DO NOTHING
    `, [
      `demo-contract-00${i}`, DEMO_WORKSPACE_ID, cli.id, cli.companyName, cli.email,
      contractTitles[i], status,
      isoDate(status === "executed" ? daysAgo(180 - i*30) : daysFromNow(14)),
      isoDate(daysFromNow(365 - i*10)),
      (18000 + i*6000).toString(), (18000 + i*6000).toString(),
      DEMO_OWNER_USER_ID,
      status === "executed" ? daysAgo(175 - i*28) : null,
      status !== "draft" ? daysAgo(180 - i*30) : null,
    ]);
  }

  console.log("✅ [ACME] 5 client contracts created");

  // 7. Payroll Runs + Entries + Pay Stubs
  const payrollRuns = [
    { id: "demo-pr-001", periodStart: daysAgo(76), periodEnd: daysAgo(63), status: "paid",       payDate: daysAgo(60) },
    { id: "demo-pr-002", periodStart: daysAgo(48), periodEnd: daysAgo(35), status: "paid",       payDate: daysAgo(32) },
    { id: "demo-pr-003", periodStart: daysAgo(20), periodEnd: daysAgo(7),  status: "processing", payDate: daysAgo(4)  },
  ];

  for (const run of payrollRuns) {
    let totalGross = 0;
    for (const e of EMPLOYEES) {
      const gross = parseFloat(e.hourlyRate) * 80 + parseFloat(e.hourlyRate) * 1.5 * 4;
      totalGross += gross;
    }
    const totalTaxes = totalGross * 0.2;

    await pool.query(`
      INSERT INTO payroll_runs (id, workspace_id, period_start, period_end, status,
        total_gross_pay, total_taxes, total_net_pay, processed_by, processed_at,
        payment_schedule, disbursement_status, run_type, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'bi_weekly',$11,'regular',NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      run.id, DEMO_WORKSPACE_ID, run.periodStart, run.periodEnd, run.status,
      totalGross.toFixed(2), totalTaxes.toFixed(2), (totalGross - totalTaxes).toFixed(2),
      DEMO_OWNER_USER_ID, run.payDate,
      run.status === "paid" ? "completed" : "pending",
    ]);

    for (let i = 0; i < EMPLOYEES.length; i++) {
      const emp = EMPLOYEES[i];
      const entryId = `demo-pe-${run.id.slice(-3)}-emp${i}`;
      const stubId  = `demo-ps-${run.id.slice(-3)}-emp${i}`;
      const rate = parseFloat(emp.hourlyRate);
      const gross = rate*80 + rate*1.5*4;
      const fedTax = gross*0.12, stateTax = gross*0.05, ss = gross*0.062, medicare = gross*0.0145;
      const net = gross - fedTax - stateTax - ss - medicare;
      const totalDed = fedTax + stateTax + ss + medicare;

      await pool.query(`
        INSERT INTO payroll_entries (id, payroll_run_id, employee_id, workspace_id,
          regular_hours, overtime_hours, hourly_rate, gross_pay,
          federal_tax, state_tax, social_security, medicare, net_pay,
          worker_type, payout_status, paid_period_start, paid_period_end, created_at, updated_at)
        VALUES ($1,$2,$3,$4,80,4,$5,$6,$7,$8,$9,$10,$11,'employee',$12,$13,$14,NOW(),NOW())
        ON CONFLICT (id) DO NOTHING
      `, [
        entryId, run.id, emp.id, DEMO_WORKSPACE_ID,
        rate.toFixed(2), gross.toFixed(2),
        fedTax.toFixed(2), stateTax.toFixed(2), ss.toFixed(2), medicare.toFixed(2), net.toFixed(2),
        run.status==="paid"?"completed":"pending",
        run.periodStart, run.periodEnd,
      ]);

      await pool.query(`
        INSERT INTO pay_stubs (id, workspace_id, payroll_run_id, payroll_entry_id, employee_id,
          pay_period_start, pay_period_end, pay_date, gross_pay, total_deductions, net_pay,
          deductions_breakdown, earnings_breakdown, employer_costs,
          status, created_by, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),NOW())
        ON CONFLICT (id) DO NOTHING
      `, [
        stubId, DEMO_WORKSPACE_ID, run.id, entryId, emp.id,
        run.periodStart, run.periodEnd, run.payDate,
        gross.toFixed(2), totalDed.toFixed(2), net.toFixed(2),
        JSON.stringify({federal_tax:fedTax.toFixed(2),state_tax:stateTax.toFixed(2),social_security:ss.toFixed(2),medicare:medicare.toFixed(2)}),
        JSON.stringify({regular:(rate*80).toFixed(2),overtime:(rate*1.5*4).toFixed(2)}),
        JSON.stringify({employer_ss:ss.toFixed(2),employer_medicare:medicare.toFixed(2),workers_comp:(gross*0.02).toFixed(2)}),
        run.status==="paid"?"generated":"pending",
        DEMO_OWNER_USER_ID,
      ]);
    }
  }

  console.log("✅ [ACME] 3 payroll runs + 30 entries + 30 pay stubs created");

  // 8. Company Policies
  const policies = [
    { id: "demo-pol-001", title: "Employee Handbook 2025",     category: "general",    requiresAck: true,  ackDays: 7, version: "2025.1", content: "# Acme Security Services Employee Handbook 2025\n\nWelcome to Acme Security Services...", publishedAt: daysAgo(30) },
    { id: "demo-pol-002", title: "Code of Conduct",            category: "conduct",    requiresAck: true,  ackDays: 5, version: "3.2",    content: "# Code of Conduct\n\nAll officers are expected to maintain a professional demeanor...", publishedAt: daysAgo(30) },
    { id: "demo-pol-003", title: "Drug-Free Workplace Policy", category: "safety",     requiresAck: true,  ackDays: 3, version: "2.0",    content: "# Drug-Free Workplace Policy\n\nAcme Security Services maintains a drug-free workplace...", publishedAt: daysAgo(30) },
    { id: "demo-pol-004", title: "Uniform & Appearance Policy",category: "appearance", requiresAck: false, ackDays: 0, version: "1.5",    content: "# Uniform & Appearance Policy\n\nEach officer receives standard uniform...", publishedAt: daysAgo(45) },
    { id: "demo-pol-005", title: "Incident Reporting Policy",  category: "safety",     requiresAck: true,  ackDays: 5, version: "2.1",    content: "# Incident Reporting Policy\n\nAll incidents must be reported within 2 hours...", publishedAt: daysAgo(60) },
  ];

  for (const pol of policies) {
    await pool.query(`
      INSERT INTO company_policies (id, workspace_id, title, description, category, content_markdown,
        version, requires_acknowledgment, acknowledgment_deadline_days,
        published_at, published_by, status, created_by, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'published',$12,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      pol.id, DEMO_WORKSPACE_ID, pol.title, pol.title, pol.category, pol.content,
      pol.version, pol.requiresAck, pol.ackDays,
      pol.publishedAt, DEMO_OWNER_USER_ID, DEMO_OWNER_USER_ID,
    ]);
  }

  // Policy acknowledgments — first 7 employees acknowledged
  const ackPolicies = policies.filter(p => p.requiresAck).map(p => p.id);
  for (let ei = 0; ei < 7; ei++) {
    for (const polId of ackPolicies) {
      await pool.query(`
        INSERT INTO policy_acknowledgments (id, workspace_id, policy_id, employee_id,
          acknowledged_at, policy_version, policy_title, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,'2025.1','Acme Policy',NOW(),NOW()) ON CONFLICT DO NOTHING
      `, [randomUUID(), DEMO_WORKSPACE_ID, polId, EMPLOYEES[ei].id, daysAgo(25 - ei)]);
    }
  }

  console.log("✅ [ACME] 5 company policies + acknowledgments created");

  // 9. Employee Documents (guard license, I9, W4 per employee)
  const docTypes = [
    { type: "guard_card", name: "Security Guard License" },
    { type: "i9_form",            name: "I-9 Employment Eligibility" },
    { type: "w4_form",            name: "W-4 Tax Withholding Form" },
  ];

  for (let ei = 0; ei < EMPLOYEES.length; ei++) {
    const emp = EMPLOYEES[ei];
    for (const dt of docTypes) {
      const docId = `demo-edoc-${dt.type.replace(/_form$/,"")}-emp${ei}`;
      const isExpiredLicense = dt.type === "guard_card" && ei === 7;
      await pool.query(`
        INSERT INTO employee_documents (
          id, workspace_id, employee_id, document_type, document_name,
          document_description, file_url, file_size, file_type, original_file_name,
          uploaded_by, uploaded_by_email, uploaded_by_role, uploaded_at,
          status, is_compliance_document, is_verified, verified_by,
          expiration_date, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,245000,'application/pdf',$8,$9,$10,'hr',$11,$12,true,true,$13,$14,NOW(),NOW()
        ) ON CONFLICT (id) DO NOTHING
      `, [
        docId, DEMO_WORKSPACE_ID, emp.id, dt.type,
        `${dt.name} — ${emp.firstName} ${emp.lastName}`,
        `${dt.name} for ${emp.firstName} ${emp.lastName}`,
        `https://storage.demo/docs/${docId}.pdf`,
        `${emp.firstName.toLowerCase()}_${emp.lastName.toLowerCase()}_${dt.type}.pdf`,
        DEMO_OWNER_USER_ID, "nicole.davis@acmesec.test",
        daysAgo(180 - ei*5),
        isExpiredLicense ? "expired" : "approved",
        DEMO_OWNER_USER_ID,
        dt.type === "guard_card" ? (isExpiredLicense ? daysAgo(30) : daysFromNow(335)) : null,
      ]);
    }
  }

  console.log("✅ [ACME] 30 employee documents (licenses, I9, W4) created");

  // 10. Report Templates
  const reportTemplates = [
    { id: "demo-rt-001", name: "Daily Activity Report (DAR)", desc: "Field officer daily activity log", category: "operations",  isCompliance: false, fields: [{id:"patrol_areas",label:"Areas Patrolled",type:"textarea",required:true},{id:"incidents",label:"Incidents/Observations",type:"textarea",required:false},{id:"visitors",label:"Visitor Count",type:"number",required:true},{id:"equipment_check",label:"Equipment Status",type:"select",options:["OK","Needs Attention","Out of Service"],required:true}] },
    { id: "demo-rt-002", name: "Incident Report",             desc: "Formal incident documentation",   category: "incident",    isCompliance: true,  fields: [{id:"incident_type",label:"Incident Type",type:"select",options:["Theft","Trespass","Disturbance","Medical","Vandalism","Other"],required:true},{id:"description",label:"Description",type:"textarea",required:true},{id:"actions_taken",label:"Actions Taken",type:"textarea",required:true},{id:"police_notified",label:"Police Notified?",type:"select",options:["Yes","No"],required:true}] },
    { id: "demo-rt-003", name: "Payroll Hours Certification", desc: "Manager certification of hours",   category: "payroll",     isCompliance: false, fields: [{id:"period_start",label:"Period Start",type:"date",required:true},{id:"period_end",label:"Period End",type:"date",required:true},{id:"total_regular_hours",label:"Regular Hours",type:"number",required:true},{id:"total_overtime_hours",label:"Overtime Hours",type:"number",required:false}] },
    { id: "demo-rt-004", name: "Clock-In Compliance Audit",   desc: "Weekly clock-in/out audit",        category: "compliance",  isCompliance: true,  fields: [{id:"week_of",label:"Week Of",type:"date",required:true},{id:"late_arrivals",label:"Late Arrivals",type:"number",required:true},{id:"missed_clock_outs",label:"Missed Clock-Outs",type:"number",required:true},{id:"gps_failures",label:"GPS Failures",type:"number",required:true},{id:"notes",label:"Notes",type:"textarea",required:false}] },
  ];

  for (const t of reportTemplates) {
    await pool.query(`
      INSERT INTO report_templates (id, workspace_id, name, description, category, fields,
        is_compliance_report, is_active, is_system_template, created_by, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,true,true,$8,NOW(),NOW()) ON CONFLICT (id) DO NOTHING
    `, [t.id, DEMO_WORKSPACE_ID, t.name, t.desc, t.category, JSON.stringify(t.fields), t.isCompliance, DEMO_OWNER_USER_ID]);
  }

  // 11. Report Submissions
  const subs = [
    { id:"demo-rs-001", tId:"demo-rt-001", eIdx:2, cIdx:0, status:"approved",  daysAgo:1, type:"daily_activity", data:{patrol_areas:"Lobby, ER entrance, Parking Garage A & B",incidents:"None",visitors:"47",equipment_check:"OK"} },
    { id:"demo-rs-002", tId:"demo-rt-001", eIdx:3, cIdx:1, status:"approved",  daysAgo:1, type:"daily_activity", data:{patrol_areas:"Main entrance, Food court, South parking",incidents:"Shoplifting attempt — subject left",visitors:"312",equipment_check:"OK"} },
    { id:"demo-rs-003", tId:"demo-rt-001", eIdx:4, cIdx:2, status:"submitted", daysAgo:0, type:"daily_activity", data:{patrol_areas:"Building A-C perimeter, Server room corridor",incidents:"None",visitors:"89",equipment_check:"Needs Attention"} },
    { id:"demo-rs-004", tId:"demo-rt-002", eIdx:3, cIdx:1, status:"approved",  daysAgo:5, type:"incident",      data:{incident_type:"Theft",description:"Shoplifting incident",actions_taken:"Detained and called LAPD",police_notified:"Yes"} },
    { id:"demo-rs-005", tId:"demo-rt-002", eIdx:5, cIdx:3, status:"submitted", daysAgo:2, type:"incident",      data:{incident_type:"Trespass",description:"Individual refused transit pass",actions_taken:"Requested to leave, complied",police_notified:"No"} },
    { id:"demo-rs-006", tId:"demo-rt-003", eIdx:0, cIdx:null, status:"approved",daysAgo:35, type:"payroll",    data:{period_start:isoDate(daysAgo(48)),period_end:isoDate(daysAgo(35)),total_regular_hours:"800",total_overtime_hours:"40"} },
    { id:"demo-rs-007", tId:"demo-rt-004", eIdx:1, cIdx:null, status:"approved",daysAgo:7, type:"compliance",  data:{week_of:isoDate(daysAgo(14)),late_arrivals:"2",missed_clock_outs:"1",gps_failures:"0",notes:"Two late arrivals due to LA traffic"} },
  ];

  for (const s of subs) {
    await pool.query(`
      INSERT INTO report_submissions (id, workspace_id, template_id, report_number, employee_id, client_id,
        form_data, status, submitted_at, created_at, updated_at, report_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW(),$10) ON CONFLICT (id) DO NOTHING
    `, [
      s.id, DEMO_WORKSPACE_ID, s.tId,
      `RPT-2025-${s.id.split("-").pop().padStart(4,"0")}`,
      EMPLOYEES[s.eIdx].id, s.cIdx !== null ? CLIENTS[s.cIdx].id : null,
      JSON.stringify(s.data), s.status, daysAgo(s.daysAgo), s.type,
    ]);
  }

  console.log("✅ [ACME] 4 report templates + 7 submissions created");

  // 12. Proposals
  const proposals = [
    { id:"demo-prop-001", name:"Security Services Proposal — LA Unified School District", status:"sent",     type:"outbound",     clientName:"LA Unified School District",  clientEmail:"facilities@lausd.demo", value:"48000.00", desc:"3 LAUSD campuses" },
    { id:"demo-prop-002", name:"Security Services Proposal — Century City Mall",           status:"accepted", type:"outbound",     clientName:"Century City Mall",           clientEmail:"ops@centurycity.demo",   value:"72000.00", desc:"Full-coverage 24/7" },
    { id:"demo-prop-003", name:"RFP Response — Port of Los Angeles Security",              status:"submitted",type:"rfp_response", clientName:"Port of Los Angeles",         clientEmail:"procurement@portofla.demo",value:"180000.00",desc:"Maritime security services" },
  ];

  for (const p of proposals) {
    await pool.query(`
      INSERT INTO proposals (id, workspace_id, proposal_name, status, proposal_type,
        client_name, client_email, total_value, valid_until, description,
        company_name, company_email, company_phone, created_by, created_at, updated_at, submitted_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Acme Security Services, LLC','info@acmesec.test','213-555-9800',$11,NOW(),NOW(),$12)
      ON CONFLICT (id) DO NOTHING
    `, [
      p.id, DEMO_WORKSPACE_ID, p.name, p.status, p.type,
      p.clientName, p.clientEmail, p.value, daysFromNow(60), p.desc,
      DEMO_OWNER_USER_ID, p.status !== "draft" ? daysAgo(5) : null,
    ]);
  }

  console.log("✅ [ACME] 3 proposals created");

  // 13. Org Documents
  const orgDocs = [
    { id:"demo-org-001", cat:"policy",    name:"Employee Handbook 2025.pdf",        size:1842000, desc:"Annual employee handbook" },
    { id:"demo-org-002", cat:"compliance",name:"BSIS License Certificate.pdf",       size:512000,  desc:"Bureau of Security and Investigative Services license" },
    { id:"demo-org-003", cat:"compliance",name:"General Liability Insurance.pdf",    size:328000,  desc:"Commercial general liability policy" },
    { id:"demo-org-004", cat:"compliance",name:"Workers Comp Insurance.pdf",         size:294000,  desc:"Workers compensation policy certificate" },
    { id:"demo-org-005", cat:"template",  name:"Post Orders Template.docx",          size:124000,  desc:"Standard post orders template" },
    { id:"demo-org-006", cat:"template",  name:"Daily Activity Report Template.pdf", size:98000,   desc:"DAR template for field officers" },
    { id:"demo-org-007", cat:"legal",     name:"Business License 2025.pdf",          size:156000,  desc:"City of Los Angeles business license" },
  ];

  for (const od of orgDocs) {
    await pool.query(`
      INSERT INTO org_documents (id, workspace_id, uploaded_by, category, file_name, file_path,
        file_size_bytes, file_type, description, is_active, version, requires_signature, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'application/pdf',$8,true,1,false,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [od.id, DEMO_WORKSPACE_ID, DEMO_OWNER_USER_ID, od.cat, od.name, `/org/${DEMO_WORKSPACE_ID}/${od.id}`, od.size, od.desc]);
  }

  console.log("✅ [ACME] 7 org documents created");

  // 14. Shifts
  const shiftDefs = [
    {eIdx:2,cIdx:0,startH:7, endH:15,daysBack:1, status:"completed"},
    {eIdx:3,cIdx:1,startH:8, endH:16,daysBack:1, status:"completed"},
    {eIdx:4,cIdx:2,startH:15,endH:23,daysBack:1, status:"completed"},
    {eIdx:5,cIdx:3,startH:6, endH:14,daysBack:1, status:"completed"},
    {eIdx:6,cIdx:4,startH:22,endH:6, daysBack:1, status:"completed"},
    {eIdx:7,cIdx:0,startH:7, endH:15,daysBack:0, status:"in_progress"},
    {eIdx:8,cIdx:1,startH:8, endH:16,daysBack:0, status:"scheduled"},
    {eIdx:9,cIdx:2,startH:15,endH:23,daysBack:0, status:"scheduled"},
    {eIdx:2,cIdx:3,startH:7, endH:15,daysBack:-1,status:"scheduled"},
    {eIdx:4,cIdx:4,startH:8, endH:16,daysBack:-1,status:"scheduled"},
  ];

  for (let i = 0; i < shiftDefs.length; i++) {
    const s = shiftDefs[i];
    const emp = EMPLOYEES[s.eIdx];
    const cli = CLIENTS[s.cIdx];
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - s.daysBack);
    const start = new Date(baseDate); start.setHours(s.startH,0,0,0);
    const end = new Date(baseDate);
    if (s.endH <= s.startH) end.setDate(end.getDate() + 1);
    end.setHours(s.endH,0,0,0);

    await pool.query(`
      INSERT INTO shifts (id, workspace_id, employee_id, client_id,
        start_time, end_time, status, hourly_rate_override, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW()) ON CONFLICT (id) DO NOTHING
    `, [`demo-shift-${String(i).padStart(3,"0")}`, DEMO_WORKSPACE_ID, emp.id, cli.id, start, end, s.status, emp.hourlyRate]);
  }

  console.log("✅ [ACME] 10 shifts created");
  console.log("🎉 [ACME] Comprehensive Acme Security demo seed COMPLETE!");

  await pool.end();
}

run().catch(err => {
  console.error("❌ Seed failed:", err.message);
  console.error(err.stack);
  pool.end();
  process.exit(1);
});
