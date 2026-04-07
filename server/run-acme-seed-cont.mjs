/**
 * Continuation seed — runs the missing parts of the Acme demo data.
 * Safe to run multiple times (ON CONFLICT DO NOTHING / ON CONFLICT (id) DO NOTHING).
 */
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

const DEMO_WORKSPACE_ID = "demo-workspace-00000000";
const DEMO_OWNER_USER_ID = "demo-user-00000000";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const EMP_IDS = ["demo-emp-001","demo-emp-002","demo-emp-003","demo-emp-004","demo-emp-005","demo-emp-006","demo-emp-007","demo-emp-008","demo-emp-009","demo-emp-010"];
const CLI_IDS = ["demo-cli-001","demo-cli-002","demo-cli-003","demo-cli-004","demo-cli-005"];

const EMPLOYEES = [
  { id: EMP_IDS[0], rate: "32.00" },
  { id: EMP_IDS[1], rate: "28.50" },
  { id: EMP_IDS[2], rate: "22.00" },
  { id: EMP_IDS[3], rate: "21.50" },
  { id: EMP_IDS[4], rate: "25.00" },
  { id: EMP_IDS[5], rate: "21.50" },
  { id: EMP_IDS[6], rate: "24.00" },
  { id: EMP_IDS[7], rate: "26.00" },
  { id: EMP_IDS[8], rate: "21.50" },
  { id: EMP_IDS[9], rate: "21.50" },
];

const CLIENTS = [
  { id: CLI_IDS[0], name: "Pacific Medical Center",     email: "security@pacificmedical.test"  },
  { id: CLI_IDS[1], name: "Westside Shopping Mall",     email: "ops@westsidemal.test"          },
  { id: CLI_IDS[2], name: "TechHub Corporate Campus",   email: "facilities@techhubl.test"      },
  { id: CLI_IDS[3], name: "LA Metro Transit Authority", email: "security@lametrota.test"       },
  { id: CLI_IDS[4], name: "Sunset Luxury Apartments",   email: "management@sunsetluxury.test"  },
];

const EMP_NAMES = [
  ["Marcus","Rodriguez"],["Jennifer","Torres"],["David","Kim"],["Alicia","Brown"],["Robert","Washington"],
  ["Carmen","Lopez"],["Anthony","Johnson"],["Nicole","Davis"],["Kevin","Smith"],["Maria","Garcia"],
];

function daysAgo(n)    { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function daysFromNow(n){ const d = new Date(); d.setDate(d.getDate() + n); return d; }
function isoDate(d)    { return d.toISOString().split("T")[0]; }

async function run() {
  console.log("🔄 [ACME] Running continuation seed for missing demo data...");

  // ── 1. Client Contracts ───────────────────────────────────────────────────
  const contractDefs = [
    { status:"executed", daysBack:180, value:"72000.00" },
    { status:"executed", daysBack:150, value:"84000.00" },
    { status:"sent",     daysBack:10,  value:"96000.00" },
    { status:"executed", daysBack:200, value:"108000.00"},
    { status:"draft",    daysBack:2,   value:"60000.00" },
  ];

  for (let i = 0; i < CLIENTS.length; i++) {
    const cli = CLIENTS[i];
    const def = contractDefs[i];
    const contractId = `demo-contract-00${i}`;
    const content = `# Security Services Agreement\n\nThis Security Services Agreement ("Agreement") is entered into between Acme Security Services, LLC ("Company") and ${cli.name} ("Client").\n\n## 1. Services\nCompany shall provide licensed security officer services as described herein.\n\n## 2. Term\nThis Agreement is effective for one (1) year from the execution date.\n\n## 3. Compensation\nClient shall pay Company at the agreed billing rate. Total contract value: $${def.value}.\n\n## 4. Governing Law\nThis Agreement shall be governed by the laws of the State of California.`;
    await pool.query(`
      INSERT INTO client_contracts
        (id, workspace_id, doc_type, client_id, client_name, client_email,
         title, content, status, effective_date, term_end_date,
         total_value, annual_value, version, created_by,
         created_at, updated_at, executed_at, sent_at)
      VALUES ($1,$2,'contract',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1,$13,NOW(),NOW(),$14,$15)
      ON CONFLICT (id) DO NOTHING
    `, [
      contractId, DEMO_WORKSPACE_ID, cli.id, cli.name, cli.email,
      `Security Services Agreement — ${cli.name}`,
      content, def.status,
      isoDate(def.status === "draft" ? daysFromNow(14) : daysAgo(def.daysBack)),
      isoDate(daysFromNow(365 - i * 10)),
      def.value, def.value,
      DEMO_OWNER_USER_ID,
      def.status === "executed" ? daysAgo(def.daysBack - 5) : null,
      def.status !== "draft"    ? daysAgo(def.daysBack)     : null,
    ]);
  }
  console.log("✅ [ACME] 5 client contracts created");

  // ── 2. Payroll Runs + Entries + Pay Stubs ─────────────────────────────────
  const payrollRuns = [
    { id:"demo-pr-001", periodStart:daysAgo(76), periodEnd:daysAgo(63), status:"paid",       payDate:daysAgo(60) },
    { id:"demo-pr-002", periodStart:daysAgo(48), periodEnd:daysAgo(35), status:"paid",       payDate:daysAgo(32) },
    { id:"demo-pr-003", periodStart:daysAgo(20), periodEnd:daysAgo(7),  status:"processed",  payDate:daysAgo(4)  },
  ];

  for (const run of payrollRuns) {
    let totalGross = 0;
    for (const e of EMPLOYEES) {
      totalGross += parseFloat(e.rate) * 80 + parseFloat(e.rate) * 1.5 * 4;
    }
    const totalTaxes = totalGross * 0.2;
    await pool.query(`
      INSERT INTO payroll_runs
        (id, workspace_id, period_start, period_end, status,
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
      const rate = parseFloat(emp.rate);
      const gross     = rate * 80 + rate * 1.5 * 4;
      const fedTax    = gross * 0.12;
      const stateTax  = gross * 0.05;
      const ss        = gross * 0.062;
      const medicare  = gross * 0.0145;
      const net       = gross - fedTax - stateTax - ss - medicare;
      const totalDed  = fedTax + stateTax + ss + medicare;

      await pool.query(`
        INSERT INTO payroll_entries
          (id, payroll_run_id, employee_id, workspace_id,
           regular_hours, overtime_hours, hourly_rate, gross_pay,
           federal_tax, state_tax, social_security, medicare, net_pay,
           worker_type, payout_status, paid_period_start, paid_period_end, created_at, updated_at)
        VALUES ($1,$2,$3,$4,80,4,$5,$6,$7,$8,$9,$10,$11,'employee',$12,$13,$14,NOW(),NOW())
        ON CONFLICT (id) DO NOTHING
      `, [
        entryId, run.id, emp.id, DEMO_WORKSPACE_ID,
        rate.toFixed(2), gross.toFixed(2),
        fedTax.toFixed(2), stateTax.toFixed(2), ss.toFixed(2), medicare.toFixed(2), net.toFixed(2),
        run.status === "paid" ? "completed" : "pending",
        run.periodStart, run.periodEnd,
      ]);

      await pool.query(`
        INSERT INTO pay_stubs
          (id, workspace_id, payroll_run_id, payroll_entry_id, employee_id,
           pay_period_start, pay_period_end, pay_date, gross_pay, total_deductions, net_pay,
           deductions_breakdown, earnings_breakdown, employer_costs, status, created_by, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),NOW())
        ON CONFLICT (id) DO NOTHING
      `, [
        stubId, DEMO_WORKSPACE_ID, run.id, entryId, emp.id,
        run.periodStart, run.periodEnd, run.payDate,
        gross.toFixed(2), totalDed.toFixed(2), net.toFixed(2),
        JSON.stringify({ federal_tax: fedTax.toFixed(2), state_tax: stateTax.toFixed(2), social_security: ss.toFixed(2), medicare: medicare.toFixed(2) }),
        JSON.stringify({ regular: (rate * 80).toFixed(2), overtime: (rate * 1.5 * 4).toFixed(2) }),
        JSON.stringify({ employer_ss: ss.toFixed(2), employer_medicare: medicare.toFixed(2) }),
        run.status === "paid" ? "generated" : "pending",
        DEMO_OWNER_USER_ID,
      ]);
    }
  }
  console.log("✅ [ACME] 3 payroll runs + 30 entries + 30 pay stubs created");

  // ── 3. Company Policies + Acknowledgments ─────────────────────────────────
  const policies = [
    { id:"demo-pol-001", title:"Employee Handbook 2025",     cat:"general",    reqAck:true,  ackDays:7, ver:"2025.1", pubDaysAgo:30 },
    { id:"demo-pol-002", title:"Code of Conduct",            cat:"conduct",    reqAck:true,  ackDays:5, ver:"3.2",    pubDaysAgo:30 },
    { id:"demo-pol-003", title:"Drug-Free Workplace Policy", cat:"safety",     reqAck:true,  ackDays:3, ver:"2.0",    pubDaysAgo:30 },
    { id:"demo-pol-004", title:"Uniform & Appearance Policy",cat:"appearance", reqAck:false, ackDays:0, ver:"1.5",    pubDaysAgo:45 },
    { id:"demo-pol-005", title:"Incident Reporting Policy",  cat:"safety",     reqAck:true,  ackDays:5, ver:"2.1",    pubDaysAgo:60 },
  ];

  for (const pol of policies) {
    const content = `# ${pol.title}\n\nThis policy has been established by Acme Security Services, LLC to ensure professional standards across all operations.\n\n## Policy Statement\n\nAll personnel are required to comply with the guidelines set forth in this ${pol.title}.\n\n## Scope\n\nThis policy applies to all employees, contractors, and temporary staff.\n\n## Effective Date\n\nVersion ${pol.ver} — effective as of publication date.`;
    await pool.query(`
      INSERT INTO company_policies
        (id, workspace_id, title, description, category, content_markdown,
         version, requires_acknowledgment, acknowledgment_deadline_days,
         published_at, published_by, status, created_by, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'published',$12,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      pol.id, DEMO_WORKSPACE_ID, pol.title, pol.title, pol.cat, content,
      pol.ver, pol.reqAck, pol.ackDays,
      daysAgo(pol.pubDaysAgo), DEMO_OWNER_USER_ID, DEMO_OWNER_USER_ID,
    ]);
  }

  const ackPolicies = policies.filter(p => p.reqAck);
  for (let ei = 0; ei < 7; ei++) {
    for (const pol of ackPolicies) {
      await pool.query(`
        INSERT INTO policy_acknowledgments
          (id, workspace_id, policy_id, employee_id,
           acknowledged_at, policy_version, policy_title, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) ON CONFLICT DO NOTHING
      `, [randomUUID(), DEMO_WORKSPACE_ID, pol.id, EMP_IDS[ei], daysAgo(25 - ei), pol.ver, pol.title]);
    }
  }
  console.log("✅ [ACME] 5 company policies + acknowledgments created");

  // ── 4. Employee Documents ─────────────────────────────────────────────────
  const docTypes = [
    { type:"guard_card", name:"Security Guard License" },
    { type:"i9_form",    name:"I-9 Employment Eligibility" },
    { type:"w4_form",    name:"W-4 Tax Withholding Form" },
  ];

  for (let ei = 0; ei < EMPLOYEES.length; ei++) {
    const emp = EMPLOYEES[ei];
    const [fn, ln] = EMP_NAMES[ei];
    for (const dt of docTypes) {
      const docId = `demo-edoc-${dt.type.replace(/_/g, "-")}-emp${ei}`;
      const isExpired = dt.type === "guard_card" && ei === 7;
      const status    = isExpired ? "expired" : "approved";
      const expDate   = dt.type === "guard_card"
        ? (isExpired ? daysAgo(30) : daysFromNow(335))
        : null;

      await pool.query(`
        INSERT INTO employee_documents
          (id, workspace_id, employee_id, document_type, document_name,
           document_description, file_url, file_size, file_type, original_file_name,
           uploaded_by, uploaded_by_email, uploaded_by_role, uploaded_at,
           upload_ip_address,
           status, is_compliance_document, is_verified, verified_by,
           expiration_date, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,245000,'application/pdf',$8,$9,$10,'hr',$11,'127.0.0.1',$12,true,true,$13,$14,NOW(),NOW())
        ON CONFLICT (id) DO NOTHING
      `, [
        docId, DEMO_WORKSPACE_ID, emp.id, dt.type,
        `${dt.name} — ${fn} ${ln}`,
        `${dt.name} for ${fn} ${ln}`,
        `https://storage.demo/docs/${docId}.pdf`,
        `${fn.toLowerCase()}_${ln.toLowerCase()}_${dt.type}.pdf`,
        DEMO_OWNER_USER_ID, "nicole.davis@acmesec.test",
        daysAgo(180 - ei * 5),
        status, DEMO_OWNER_USER_ID, expDate,
      ]);
    }
  }
  console.log("✅ [ACME] 30 employee documents (guard cards, I9, W4) created");

  // ── 5. Report Templates + Submissions ────────────────────────────────────
  const reportTemplates = [
    {
      id: "demo-rt-001", name: "Daily Activity Report (DAR)", cat: "operations", isCompliance: false,
      fields: [
        { id:"patrol_areas",    label:"Areas Patrolled",      type:"textarea", required:true  },
        { id:"incidents",       label:"Incidents/Observations",type:"textarea", required:false },
        { id:"visitors",        label:"Visitor Count",         type:"number",   required:true  },
        { id:"equipment_check", label:"Equipment Status",      type:"select",   options:["OK","Needs Attention","Out of Service"], required:true },
      ],
    },
    {
      id: "demo-rt-002", name: "Incident Report", cat: "incident", isCompliance: true,
      fields: [
        { id:"incident_type",  label:"Incident Type",  type:"select",   options:["Theft","Trespass","Disturbance","Medical","Vandalism","Other"], required:true },
        { id:"description",    label:"Description",    type:"textarea", required:true  },
        { id:"actions_taken",  label:"Actions Taken",  type:"textarea", required:true  },
        { id:"police_notified",label:"Police Notified?",type:"select",  options:["Yes","No"], required:true },
      ],
    },
    {
      id: "demo-rt-003", name: "Payroll Hours Certification", cat: "payroll", isCompliance: false,
      fields: [
        { id:"period_start",         label:"Period Start",     type:"date",   required:true  },
        { id:"period_end",           label:"Period End",       type:"date",   required:true  },
        { id:"total_regular_hours",  label:"Regular Hours",    type:"number", required:true  },
        { id:"total_overtime_hours", label:"Overtime Hours",   type:"number", required:false },
      ],
    },
    {
      id: "demo-rt-004", name: "Clock-In Compliance Audit", cat: "compliance", isCompliance: true,
      fields: [
        { id:"week_of",          label:"Week Of",          type:"date",   required:true  },
        { id:"late_arrivals",    label:"Late Arrivals",    type:"number", required:true  },
        { id:"missed_clock_outs",label:"Missed Clock-Outs",type:"number", required:true  },
        { id:"gps_failures",     label:"GPS Failures",     type:"number", required:true  },
        { id:"notes",            label:"Notes",            type:"textarea",required:false },
      ],
    },
  ];

  for (const t of reportTemplates) {
    await pool.query(`
      INSERT INTO report_templates
        (id, workspace_id, name, description, category, fields,
         is_compliance_report, is_active, is_system_template, created_by, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,true,true,$8,NOW(),NOW()) ON CONFLICT (id) DO NOTHING
    `, [t.id, DEMO_WORKSPACE_ID, t.name, t.name, t.cat, JSON.stringify(t.fields), t.isCompliance, DEMO_OWNER_USER_ID]);
  }

  const subs = [
    { id:"demo-rs-001", tId:"demo-rt-001", eIdx:2, cIdx:0, status:"approved",  daysAgoN:1, rType:"daily_activity",
      data:{ patrol_areas:"Lobby, ER entrance, Parking Garage A & B", incidents:"None", visitors:"47", equipment_check:"OK" } },
    { id:"demo-rs-002", tId:"demo-rt-001", eIdx:3, cIdx:1, status:"approved",  daysAgoN:1, rType:"daily_activity",
      data:{ patrol_areas:"Main entrance, Food court, South parking", incidents:"Shoplifting attempt — subject left premises", visitors:"312", equipment_check:"OK" } },
    { id:"demo-rs-003", tId:"demo-rt-001", eIdx:4, cIdx:2, status:"submitted", daysAgoN:0, rType:"daily_activity",
      data:{ patrol_areas:"Building A-C perimeter, Server room corridor", incidents:"None", visitors:"89", equipment_check:"Needs Attention" } },
    { id:"demo-rs-004", tId:"demo-rt-002", eIdx:3, cIdx:1, status:"approved",  daysAgoN:5, rType:"incident",
      data:{ incident_type:"Theft", description:"Shoplifting incident — subject detained and LAPD notified", actions_taken:"Detained subject and called LAPD, subject was charged", police_notified:"Yes" } },
    { id:"demo-rs-005", tId:"demo-rt-002", eIdx:5, cIdx:3, status:"submitted", daysAgoN:2, rType:"incident",
      data:{ incident_type:"Trespass", description:"Individual refused to present transit pass and became hostile", actions_taken:"Requested individual to leave premises, complied without further incident", police_notified:"No" } },
    { id:"demo-rs-006", tId:"demo-rt-003", eIdx:0, cIdx:null, status:"approved", daysAgoN:35, rType:"payroll",
      data:{ period_start: isoDate(daysAgo(48)), period_end: isoDate(daysAgo(35)), total_regular_hours:"800", total_overtime_hours:"40" } },
    { id:"demo-rs-007", tId:"demo-rt-004", eIdx:1, cIdx:null, status:"approved", daysAgoN:7, rType:"compliance",
      data:{ week_of: isoDate(daysAgo(14)), late_arrivals:"2", missed_clock_outs:"1", gps_failures:"0", notes:"Two late arrivals due to heavy LA traffic on I-405" } },
  ];

  for (const s of subs) {
    const rNum = `RPT-2025-${s.id.split("-").pop().padStart(4, "0")}`;
    await pool.query(`
      INSERT INTO report_submissions
        (id, workspace_id, template_id, report_number, employee_id, client_id,
         form_data, status, submitted_at, created_at, updated_at, report_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW(),$10) ON CONFLICT (id) DO NOTHING
    `, [
      s.id, DEMO_WORKSPACE_ID, s.tId, rNum,
      EMP_IDS[s.eIdx], s.cIdx !== null ? CLI_IDS[s.cIdx] : null,
      JSON.stringify(s.data), s.status, daysAgo(s.daysAgoN), s.rType,
    ]);
  }
  console.log("✅ [ACME] 4 report templates + 7 submissions created");

  // ── 6. Proposals ──────────────────────────────────────────────────────────
  const proposals = [
    { id:"demo-prop-001", name:"Security Services Proposal — LA Unified School District", status:"sent",      type:"outbound",     clientName:"LA Unified School District", clientEmail:"facilities@lausd.demo",    value:"48000.00"  },
    { id:"demo-prop-002", name:"Security Services Proposal — Century City Mall",          status:"accepted",   type:"outbound",     clientName:"Century City Mall",          clientEmail:"ops@centurycity.demo",     value:"72000.00"  },
    { id:"demo-prop-003", name:"RFP Response — Port of Los Angeles Security",             status:"submitted",  type:"rfp_response",  clientName:"Port of Los Angeles",        clientEmail:"procurement@portofla.demo",value:"180000.00" },
  ];

  for (const p of proposals) {
    await pool.query(`
      INSERT INTO proposals
        (id, workspace_id, proposal_name, status, proposal_type,
         client_name, client_email, total_value, valid_until, description,
         company_name, company_email, company_phone, created_by, created_at, updated_at, submitted_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Acme Security Services, LLC','info@acmesec.test','213-555-9800',$11,NOW(),NOW(),$12)
      ON CONFLICT (id) DO NOTHING
    `, [
      p.id, DEMO_WORKSPACE_ID, p.name, p.status, p.type,
      p.clientName, p.clientEmail, p.value, isoDate(daysFromNow(60)),
      `Professional security services proposal for ${p.clientName}`,
      DEMO_OWNER_USER_ID,
      p.status !== "draft" ? daysAgo(5) : null,
    ]);
  }
  console.log("✅ [ACME] 3 proposals created");

  // ── 7. Org Documents ──────────────────────────────────────────────────────
  const orgDocs = [
    { id:"demo-org-001", cat:"policy",    name:"Employee Handbook 2025.pdf",        size:1842000 },
    { id:"demo-org-002", cat:"compliance",name:"BSIS License Certificate.pdf",       size:512000  },
    { id:"demo-org-003", cat:"compliance",name:"General Liability Insurance.pdf",    size:328000  },
    { id:"demo-org-004", cat:"compliance",name:"Workers Comp Insurance.pdf",         size:294000  },
    { id:"demo-org-005", cat:"template",  name:"Post Orders Template.docx",          size:124000  },
    { id:"demo-org-006", cat:"template",  name:"Daily Activity Report Template.pdf", size:98000   },
    { id:"demo-org-007", cat:"legal",     name:"Business License 2025.pdf",          size:156000  },
  ];

  for (const od of orgDocs) {
    await pool.query(`
      INSERT INTO org_documents
        (id, workspace_id, uploaded_by, category, file_name, file_path,
         file_size_bytes, file_type, description, is_active, version, requires_signature, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'application/pdf',$8,true,1,false,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      od.id, DEMO_WORKSPACE_ID, DEMO_OWNER_USER_ID, od.cat, od.name,
      `/org/${DEMO_WORKSPACE_ID}/${od.id}`, od.size, `Company ${od.cat} document`,
    ]);
  }
  console.log("✅ [ACME] 7 org documents created");

  // ── 8. Shifts ─────────────────────────────────────────────────────────────
  const shiftDefs = [
    { eIdx:2, cIdx:0, startH:7,  endH:15, daysBack:1,  status:"completed"   },
    { eIdx:3, cIdx:1, startH:8,  endH:16, daysBack:1,  status:"completed"   },
    { eIdx:4, cIdx:2, startH:15, endH:23, daysBack:1,  status:"completed"   },
    { eIdx:5, cIdx:3, startH:6,  endH:14, daysBack:1,  status:"completed"   },
    { eIdx:6, cIdx:4, startH:22, endH:6,  daysBack:1,  status:"completed"   },
    { eIdx:7, cIdx:0, startH:7,  endH:15, daysBack:0,  status:"in_progress" },
    { eIdx:8, cIdx:1, startH:8,  endH:16, daysBack:0,  status:"scheduled"   },
    { eIdx:9, cIdx:2, startH:15, endH:23, daysBack:0,  status:"scheduled"   },
    { eIdx:2, cIdx:3, startH:7,  endH:15, daysBack:-1, status:"scheduled"   },
    { eIdx:4, cIdx:4, startH:8,  endH:16, daysBack:-1, status:"scheduled"   },
  ];

  const shiftTitles = ["Day Shift","Day Shift","Evening Shift","Morning Shift","Night Shift","Day Shift","Day Shift","Evening Shift","Day Shift","Day Shift"];

  for (let i = 0; i < shiftDefs.length; i++) {
    const s = shiftDefs[i];
    const emp = EMPLOYEES[s.eIdx];
    const base = new Date(); base.setDate(base.getDate() - s.daysBack);
    const start = new Date(base); start.setHours(s.startH, 0, 0, 0);
    const end   = new Date(base);
    if (s.endH <= s.startH) end.setDate(end.getDate() + 1);
    end.setHours(s.endH, 0, 0, 0);

    await pool.query(`
      INSERT INTO shifts
        (id, workspace_id, employee_id, client_id, title,
         start_time, end_time, status, hourly_rate_override, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW()) ON CONFLICT (id) DO NOTHING
    `, [
      `demo-shift-${String(i).padStart(3, "0")}`, DEMO_WORKSPACE_ID,
      emp.id, CLI_IDS[s.cIdx], shiftTitles[i],
      start, end, s.status, emp.rate,
    ]);
  }
  console.log("✅ [ACME] 10 shifts created");

  console.log("\n🎉 [ACME] Continuation seed COMPLETE — all demo data inserted!");
  await pool.end();
}

run().catch(err => {
  console.error("❌ Continuation seed failed:", err.message);
  pool.end();
  process.exit(1);
});
