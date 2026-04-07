/**
 * COMPLIANCE DATA SEED — Both Acme Security and Anvil Security
 * Compliance documents, alerts, post order templates for both orgs.
 * Uses existing compliance_document_types and compliance_requirements.
 * Idempotent — sentinel: compliance_alerts.id = 'comp-alert-acme-001'
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { typedExec, typedQuery } from '../lib/typedSql';
import { complianceDocuments, complianceAlerts, postOrderTemplates, employeeCertifications, employees } from '@shared/schema';

const ACME = "dev-acme-security-ws";
const ANVIL = "dev-anvil-security-ws";

function daysAgo(d: number): string {
  const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString();
}
function daysFromNow(d: number): string {
  const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString();
}

async function seedTable(name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); }
  catch (err) { console.error(`[ComplianceSeed] ERROR in ${name}:`, (err as Error).message); }
}

export async function runComplianceSeed(): Promise<{ success: boolean; message: string }> {
  const { isProduction } = await import('../lib/isProduction');
  if (isProduction()) return { success: true, message: "Skipped — production" };

  // CATEGORY C — Raw SQL retained: LIMIT | Tables: compliance_alerts | Verified: 2026-03-23
  const check = await typedQuery(sql`
    SELECT id FROM compliance_alerts WHERE id = 'comp-alert-acme-001' LIMIT 1
  `);
  if (check.length > 0) {
    return { success: true, message: "Compliance data already seeded — skipped" };
  }

  console.log("[ComplianceSeed] Seeding compliance data for Acme + Anvil...");

  // Known valid document_type_ids (from compliance_document_types table)
  // and requirement_ids (from compliance_requirements table)
  const DT_GUARD  = "doctype-guard-card-001";
  const DT_DL     = "doctype-dl-001";
  const DT_SSN    = "doctype-ssn-001";
  const DT_TRAIN  = "doctype-training-cert-001";
  const DT_ARMED  = "doctype-armed-license-001";

  const REQ_GUARD = "req-tx-guard-001";
  const REQ_DL    = "req-tx-dl-001";
  const REQ_TRAIN = "req-tx-training-001";
  const REQ_ARMED = "req-tx-armed-001";

  // =====================================================================
  // HELPER: Insert one compliance document
  // =====================================================================
  async function insertDoc(params: {
    id: string; ws: string; empId: string; docTypeId: string; reqId: string | null;
    docName: string; docNumber: string; authority: string;
    issuedDaysAgo: number; expiryDaysFromNow: number | null;
    status: string; verifiedBy: string | null;
  }) {
    const issued   = daysAgo(params.issuedDaysAgo);
    const expiry   = params.expiryDaysFromNow !== null ? daysFromNow(params.expiryDaysFromNow) : null;
    const storageKey = `compliance/${params.ws}/${params.empId}/${params.id}.pdf`;
    const fakeHash = params.id.replace(/-/g,"").padEnd(64,"0").substring(0,64);
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(complianceDocuments).values({
      id: params.id,
      workspaceId: params.ws,
      employeeId: params.empId,
      complianceRecordId: params.id + "-rec",
      requirementId: params.reqId,
      documentTypeId: params.docTypeId,
      documentName: params.docName,
      documentNumber: params.docNumber,
      issuingAuthority: params.authority,
      issuedDate: issued ? new Date(issued) : null,
      expirationDate: expiry ? new Date(expiry) : null,
      storageKey: storageKey,
      fileName: params.id + ".pdf",
      fileType: 'application/pdf',
      fileSizeBytes: 245760,
      fileHashSha256: fakeHash,
      isLocked: false,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();
  }

  // =====================================================================
  // 1. ACME SECURITY — COMPLIANCE DOCUMENTS
  // =====================================================================
  await seedTable("acme_compliance_docs", async () => {
    // Carlos Garcia (dev-acme-emp-004) — all current
    await insertDoc({ id: "cd-acme-001", ws: ACME, empId: "dev-acme-emp-004", docTypeId: DT_DL,    reqId: REQ_DL,    docName: "Texas Driver's License",        docNumber: "TX-DL-4420091", authority: "Texas DPS", issuedDaysAgo: 180, expiryDaysFromNow: 1825, status: "approved", verifiedBy: "dev-acme-emp-002" });
    await insertDoc({ id: "cd-acme-002", ws: ACME, empId: "dev-acme-emp-004", docTypeId: DT_GUARD, reqId: REQ_GUARD, docName: "TX Security Guard License",       docNumber: "TXG-2024-84421", authority: "Texas DPS PSB", issuedDaysAgo: 90, expiryDaysFromNow: 275, status: "approved", verifiedBy: "dev-acme-emp-002" });
    await insertDoc({ id: "cd-acme-003", ws: ACME, empId: "dev-acme-emp-004", docTypeId: DT_TRAIN, reqId: REQ_TRAIN, docName: "Level II Training Certificate",  docNumber: "L2-2024-41882", authority: "TX DPS PSB", issuedDaysAgo: 90, expiryDaysFromNow: 275, status: "approved", verifiedBy: null });

    // Diana Johnson (dev-acme-emp-005) — guard card expiring soon
    await insertDoc({ id: "cd-acme-004", ws: ACME, empId: "dev-acme-emp-005", docTypeId: DT_DL,    reqId: REQ_DL,    docName: "Texas Driver's License",       docNumber: "TX-DL-5530182", authority: "Texas DPS", issuedDaysAgo: 730, expiryDaysFromNow: 1095, status: "approved", verifiedBy: "dev-acme-emp-002" });
    await insertDoc({ id: "cd-acme-005", ws: ACME, empId: "dev-acme-emp-005", docTypeId: DT_GUARD, reqId: REQ_GUARD, docName: "TX Security Guard License",      docNumber: "TXG-2022-31129", authority: "Texas DPS PSB", issuedDaysAgo: 720, expiryDaysFromNow: 10, status: "approved", verifiedBy: "dev-acme-emp-002" });
    await insertDoc({ id: "cd-acme-006", ws: ACME, empId: "dev-acme-emp-005", docTypeId: DT_TRAIN, reqId: REQ_TRAIN, docName: "Level II Training Certificate", docNumber: "L2-2022-20913", authority: "TX DPS PSB", issuedDaysAgo: 720, expiryDaysFromNow: 10, status: "approved", verifiedBy: null });

    // Robert Williams (dev-acme-emp-006) — guard card expired
    await insertDoc({ id: "cd-acme-007", ws: ACME, empId: "dev-acme-emp-006", docTypeId: DT_DL,    reqId: REQ_DL,    docName: "Texas Driver's License",       docNumber: "TX-DL-6641273", authority: "Texas DPS", issuedDaysAgo: 400, expiryDaysFromNow: 1460, status: "approved", verifiedBy: "dev-acme-emp-002" });
    await insertDoc({ id: "cd-acme-008", ws: ACME, empId: "dev-acme-emp-006", docTypeId: DT_GUARD, reqId: REQ_GUARD, docName: "TX Security Guard License",      docNumber: "TXG-2021-19847", authority: "Texas DPS PSB", issuedDaysAgo: 740, expiryDaysFromNow: -20, status: "approved", verifiedBy: "dev-acme-emp-002" });

    // Elena Martinez (dev-acme-emp-007) — armed guard
    await insertDoc({ id: "cd-acme-009", ws: ACME, empId: "dev-acme-emp-007", docTypeId: DT_DL,    reqId: REQ_DL,    docName: "Texas Driver's License",       docNumber: "TX-DL-7752364", authority: "Texas DPS", issuedDaysAgo: 200, expiryDaysFromNow: 1800, status: "approved", verifiedBy: "dev-acme-emp-002" });
    await insertDoc({ id: "cd-acme-010", ws: ACME, empId: "dev-acme-emp-007", docTypeId: DT_GUARD, reqId: REQ_GUARD, docName: "TX Security Guard License",      docNumber: "TXG-2023-55211", authority: "Texas DPS PSB", issuedDaysAgo: 300, expiryDaysFromNow: 430, status: "approved", verifiedBy: "dev-acme-emp-002" });
    await insertDoc({ id: "cd-acme-011", ws: ACME, empId: "dev-acme-emp-007", docTypeId: DT_ARMED, reqId: REQ_ARMED, docName: "TX Level III Armed Guard License", docNumber: "TXA-2023-88901", authority: "Texas DPS PSB", issuedDaysAgo: 300, expiryDaysFromNow: 430, status: "approved", verifiedBy: "dev-acme-emp-001" });

    // Michael Thompson (dev-acme-emp-008) — training expiring in 14 days
    await insertDoc({ id: "cd-acme-012", ws: ACME, empId: "dev-acme-emp-008", docTypeId: DT_DL,    reqId: REQ_DL,    docName: "Texas Driver's License",       docNumber: "TX-DL-8863455", authority: "Texas DPS", issuedDaysAgo: 100, expiryDaysFromNow: 1900, status: "approved", verifiedBy: null });
    await insertDoc({ id: "cd-acme-013", ws: ACME, empId: "dev-acme-emp-008", docTypeId: DT_GUARD, reqId: REQ_GUARD, docName: "TX Security Guard License",      docNumber: "TXG-2023-66312", authority: "Texas DPS PSB", issuedDaysAgo: 350, expiryDaysFromNow: 380, status: "approved", verifiedBy: "dev-acme-emp-002" });
    await insertDoc({ id: "cd-acme-014", ws: ACME, empId: "dev-acme-emp-008", docTypeId: DT_TRAIN, reqId: REQ_TRAIN, docName: "Level II Training Certificate", docNumber: "L2-2023-77403", authority: "TX DPS PSB", issuedDaysAgo: 716, expiryDaysFromNow: 14, status: "approved", verifiedBy: null });
  });

  // =====================================================================
  // 2. ANVIL SECURITY — COMPLIANCE DOCUMENTS
  // =====================================================================
  await seedTable("anvil_compliance_docs", async () => {
    // Rafael Castillo (anvil-e-003)
    await insertDoc({ id: "cd-anvil-001", ws: ANVIL, empId: "anvil-e-003", docTypeId: DT_DL,    reqId: REQ_DL,    docName: "Texas Driver's License",        docNumber: "TX-DL-A100001", authority: "Texas DPS", issuedDaysAgo: 200, expiryDaysFromNow: 1800, status: "approved", verifiedBy: "anvil-e-001" });
    await insertDoc({ id: "cd-anvil-002", ws: ANVIL, empId: "anvil-e-003", docTypeId: DT_GUARD, reqId: REQ_GUARD, docName: "TX Security Guard License",       docNumber: "TXG-2024-A1001", authority: "Texas DPS PSB", issuedDaysAgo: 120, expiryDaysFromNow: 610, status: "approved", verifiedBy: "anvil-e-001" });
    await insertDoc({ id: "cd-anvil-003", ws: ANVIL, empId: "anvil-e-003", docTypeId: DT_TRAIN, reqId: REQ_TRAIN, docName: "Level II Training Certificate",  docNumber: "L2-ANV-2024-001", authority: "TX DPS PSB", issuedDaysAgo: 120, expiryDaysFromNow: 610, status: "approved", verifiedBy: null });

    // Maria Flores (anvil-e-004) — guard card expiring in 12 days
    await insertDoc({ id: "cd-anvil-004", ws: ANVIL, empId: "anvil-e-004", docTypeId: DT_DL,    reqId: REQ_DL,    docName: "Texas Driver's License",       docNumber: "TX-DL-A200002", authority: "Texas DPS", issuedDaysAgo: 365, expiryDaysFromNow: 1460, status: "approved", verifiedBy: "anvil-e-001" });
    await insertDoc({ id: "cd-anvil-005", ws: ANVIL, empId: "anvil-e-004", docTypeId: DT_GUARD, reqId: REQ_GUARD, docName: "TX Security Guard License",      docNumber: "TXG-2022-A2001", authority: "Texas DPS PSB", issuedDaysAgo: 718, expiryDaysFromNow: 12, status: "approved", verifiedBy: "anvil-e-001" });

    // Jorge Herrera (anvil-e-005) — all current
    await insertDoc({ id: "cd-anvil-006", ws: ANVIL, empId: "anvil-e-005", docTypeId: DT_DL,    reqId: REQ_DL,    docName: "Texas Driver's License",       docNumber: "TX-DL-A300003", authority: "Texas DPS", issuedDaysAgo: 90, expiryDaysFromNow: 1800, status: "approved", verifiedBy: "anvil-e-001" });
    await insertDoc({ id: "cd-anvil-007", ws: ANVIL, empId: "anvil-e-005", docTypeId: DT_GUARD, reqId: REQ_GUARD, docName: "TX Security Guard License",      docNumber: "TXG-2024-A3001", authority: "Texas DPS PSB", issuedDaysAgo: 60, expiryDaysFromNow: 670, status: "approved", verifiedBy: "anvil-e-001" });

    // Marcus Kim (anvil-e-009) — armed guard, all current
    await insertDoc({ id: "cd-anvil-008", ws: ANVIL, empId: "anvil-e-009", docTypeId: DT_DL,    reqId: REQ_DL,    docName: "Texas Driver's License",          docNumber: "TX-DL-A900009", authority: "Texas DPS", issuedDaysAgo: 150, expiryDaysFromNow: 1850, status: "approved", verifiedBy: "anvil-e-001" });
    await insertDoc({ id: "cd-anvil-009", ws: ANVIL, empId: "anvil-e-009", docTypeId: DT_GUARD, reqId: REQ_GUARD, docName: "TX Security Guard License",         docNumber: "TXG-2023-A9001", authority: "Texas DPS PSB", issuedDaysAgo: 200, expiryDaysFromNow: 530, status: "approved", verifiedBy: "anvil-e-001" });
    await insertDoc({ id: "cd-anvil-010", ws: ANVIL, empId: "anvil-e-009", docTypeId: DT_ARMED, reqId: REQ_ARMED, docName: "TX Level III Armed Guard License",  docNumber: "TXA-2023-A9001", authority: "Texas DPS PSB", issuedDaysAgo: 200, expiryDaysFromNow: 530, status: "approved", verifiedBy: "anvil-e-001" });

    // Tiffany Nguyen (anvil-e-006) — pending document upload
    await insertDoc({ id: "cd-anvil-011", ws: ANVIL, empId: "anvil-e-006", docTypeId: DT_DL,    reqId: REQ_DL,    docName: "Texas Driver's License",       docNumber: "TX-DL-A600006", authority: "Texas DPS", issuedDaysAgo: 50, expiryDaysFromNow: 1900, status: "approved", verifiedBy: null });
    // Guard card pending (recently submitted)
    await insertDoc({ id: "cd-anvil-012", ws: ANVIL, empId: "anvil-e-006", docTypeId: DT_GUARD, reqId: REQ_GUARD, docName: "TX Security Guard License (Pending)", docNumber: "TXG-PENDING-A6001", authority: "Texas DPS PSB", issuedDaysAgo: 5, expiryDaysFromNow: 725, status: "approved", verifiedBy: null });
  });

  // =====================================================================
  // 3. COMPLIANCE ALERTS — Acme
  // =====================================================================
  await seedTable("acme_compliance_alerts", async () => {
    const alerts = [
      { id: "comp-alert-acme-001", ws: ACME, emp: "dev-acme-emp-005", recId: "cd-acme-005", type: "expiring_soon",  sev: "critical", title: "Guard License Expiring in 10 Days",      msg: "Diana Johnson's TX Security Guard License (TXG-2022-31129) expires in 10 days. Renewal required immediately." },
      { id: "comp-alert-acme-002", ws: ACME, emp: "dev-acme-emp-005", recId: "cd-acme-006", type: "expiring_soon",  sev: "critical", title: "Training Cert Expiring in 10 Days",       msg: "Diana Johnson's Level II Training Certificate expires in 10 days." },
      { id: "comp-alert-acme-003", ws: ACME, emp: "dev-acme-emp-006", recId: "cd-acme-008", type: "expired",        sev: "critical", title: "Guard License EXPIRED — Robert Williams",  msg: "Robert Williams's TX Security Guard License expired 20 days ago. Employee cannot legally work guarded posts until renewed." },
      { id: "comp-alert-acme-004", ws: ACME, emp: "dev-acme-emp-008", recId: "cd-acme-014", type: "expiring_soon",  sev: "high",     title: "Training Cert Expiring in 14 Days",       msg: "Michael Thompson's Level II Training Certificate expires in 14 days. Schedule renewal training." },
      { id: "comp-alert-acme-005", ws: ACME, emp: "dev-acme-emp-007", recId: "cd-acme-011", type: "renewed",        sev: "info",     title: "Armed License Renewed — Elena Martinez",  msg: "Elena Martinez successfully renewed her TX Level III Armed Guard License. Expires in 430 days." },
    ];
    for (const a of alerts) {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(complianceAlerts).values({
        id: a.id,
        workspaceId: a.ws,
        employeeId: a.emp,
        complianceRecordId: a.recId,
        alertType: a.type,
        severity: a.sev,
        title: a.title,
        message: a.msg,
        actionRequired: true,
        isRead: false,
        isDismissed: false,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();
    }
  });

  // =====================================================================
  // 4. COMPLIANCE ALERTS — Anvil
  // =====================================================================
  await seedTable("anvil_compliance_alerts", async () => {
    const alerts = [
      { id: "comp-alert-anvil-001", ws: ANVIL, emp: "anvil-e-004", recId: "cd-anvil-005", type: "expiring_soon", sev: "critical", title: "Guard License Expiring in 12 Days",       msg: "Maria Flores's TX Security Guard License (TXG-2022-A2001) expires in 12 days. Initiate renewal now." },
      { id: "comp-alert-anvil-002", ws: ANVIL, emp: "anvil-e-006", recId: "cd-anvil-012", type: "pending_review", sev: "medium",   title: "Guard License Pending Verification",     msg: "Tiffany Nguyen's guard license is pending supervisor verification. Review uploaded document." },
      { id: "comp-alert-anvil-003", ws: ANVIL, emp: "anvil-e-009", recId: "cd-anvil-010", type: "renewed",       sev: "info",     title: "Armed License Verified — Marcus Kim",    msg: "Marcus Kim's TX Level III Armed Guard License has been verified and is current for 530 days." },
    ];
    for (const a of alerts) {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(complianceAlerts).values({
        id: a.id,
        workspaceId: a.ws,
        employeeId: a.emp,
        complianceRecordId: a.recId,
        alertType: a.type,
        severity: a.sev,
        title: a.title,
        message: a.msg,
        actionRequired: true,
        isRead: false,
        isDismissed: false,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();
    }
  });

  // =====================================================================
  // 5. POST ORDER TEMPLATES — Acme
  // =====================================================================
  await seedTable("acme_post_orders", async () => {
    const orders = [
      {
        id: "po-acme-001", ws: ACME,
        title: "NorthPark Mall — General Post Orders",
        desc: "Standard patrol and access control procedures for NorthPark Mall. Officers must conduct full perimeter patrol every 2 hours, log all incidents, and maintain visitor access log at main entrance.",
        priority: "high", reqAck: true, reqSig: true, reqPhotos: true,
        photoFreq: "every_patrol", photoInstr: "Photograph each checkpoint marker and any notable conditions.",
        createdBy: "dev-acme-emp-001",
      },
      {
        id: "po-acme-002", ws: ACME,
        title: "Dallas Medical Center — Armed Post Orders",
        desc: "Armed post protocol for Dallas Medical Center emergency department and main lobby. Officers are Level III armed. All firearms must be holstered unless threat requires otherwise. Coordinate with hospital security lead on any incident.",
        priority: "critical", reqAck: true, reqSig: true, reqPhotos: false,
        photoFreq: null, photoInstr: null,
        createdBy: "dev-acme-emp-001",
      },
      {
        id: "po-acme-003", ws: ACME,
        title: "DFW Corporate Park — Parking Lot Patrol",
        desc: "Parking lot security for DFW Corporate Park. Cover lots A, B, C on rotating 90-minute cycle. Document all suspicious vehicles. Escort requests available on-call.",
        priority: "medium", reqAck: true, reqSig: false, reqPhotos: false,
        photoFreq: null, photoInstr: null,
        createdBy: "dev-acme-emp-002",
      },
    ];
    for (const o of orders) {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(postOrderTemplates).values({
        id: o.id,
        workspaceId: o.ws,
        title: o.title,
        description: o.desc,
        priority: o.priority as any,
        requiresAcknowledgment: o.reqAck,
        requiresSignature: o.reqSig,
        requiresPhotos: o.reqPhotos,
        photoFrequency: o.photoFreq as any,
        photoInstructions: o.photoInstr,
        isActive: true,
        createdBy: o.createdBy,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();
    }
  });

  // =====================================================================
  // 6. POST ORDER TEMPLATES — Anvil
  // =====================================================================
  await seedTable("anvil_post_orders", async () => {
    const orders = [
      {
        id: "po-anvil-001", ws: ANVIL,
        title: "SA Medical Center — Full Post Orders",
        desc: "Complete patrol and access control for San Antonio Medical Center. Conduct hourly perimeter checks, maintain ER bay exclusion zone, manage parking garage access from 0600-2200. Report all medical emergencies immediately to charge nurse.",
        priority: "critical", reqAck: true, reqSig: true, reqPhotos: true,
        photoFreq: "every_patrol", photoInstr: "Photograph all checkpoint markers and document any access violations.",
        createdBy: "anvil-e-001",
      },
      {
        id: "po-anvil-002", ws: ANVIL,
        title: "Frost Bank Tower — Armed Security Protocol",
        desc: "Armed Level III post for Frost Bank Tower lobby and vault corridor. Maintain weapon in Level III security holster at all times. Log all after-hours access badge events. Coordinate with bank management on any anomalies.",
        priority: "critical", reqAck: true, reqSig: true, reqPhotos: false,
        photoFreq: null, photoInstr: null,
        createdBy: "anvil-e-001",
      },
      {
        id: "po-anvil-003", ws: ANVIL,
        title: "UTSA Campus — Campus Safety Protocol",
        desc: "Patrol and incident response for UTSA main campus. Priority areas: Student Union, Library, Parking Structures 1-4. Assist campus police on all Code Blue activations. Conduct bike/scooter enforcement on pedestrian paths.",
        priority: "medium", reqAck: true, reqSig: false, reqPhotos: false,
        photoFreq: null, photoInstr: null,
        createdBy: "anvil-e-002",
      },
    ];
    for (const o of orders) {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(postOrderTemplates).values({
        id: o.id,
        workspaceId: o.ws,
        title: o.title,
        description: o.desc,
        priority: o.priority as any,
        requiresAcknowledgment: o.reqAck,
        requiresSignature: o.reqSig,
        requiresPhotos: o.reqPhotos,
        photoFrequency: o.photoFreq as any,
        photoInstructions: o.photoInstr,
        isActive: true,
        createdBy: o.createdBy,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();
    }
  });

  // =====================================================================
  // 7. TRINITY COMPLIANCE SCENARIOS — employee_certifications
  //    Idempotent sentinel: cert-scenario-sentinel-v1
  // =====================================================================
  await seedTable("compliance_scenario_certs", async () => {
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: employee_certifications | Verified: 2026-03-23
    const sentinelCheck = await typedQuery(sql`
      SELECT id FROM employee_certifications WHERE id = 'cert-scenario-sentinel-v1' LIMIT 1
    `);
    if (sentinelCheck.length > 0) {
      console.log("[ComplianceSeed] Scenario certs already seeded — skipped");
      return;
    }

    // Scenario 1 — Diana Johnson (dev-acme-emp-005): guard card expiring in 25 days (30-day URGENT)
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(employeeCertifications).values({
      id: 'cert-diana-guard',
      workspaceId: ACME,
      employeeId: 'dev-acme-emp-005',
      certificationType: 'guard_card',
      certificationName: 'TX Security Guard License',
      certificationNumber: 'TXG-2022-31129',
      issuingAuthority: 'Texas DPS PSB',
      issuedDate: new Date(daysAgo(720)),
      expirationDate: new Date(daysFromNow(25)),
      status: 'active' as any,
      isRequired: true,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoUpdate({
      target: employeeCertifications.id,
      set: { expirationDate: new Date(daysFromNow(25)), updatedAt: sql`now()` },
    });

    // Scenario 2 — Robert Williams (dev-acme-emp-006): guard card expired yesterday
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(employeeCertifications).values({
      id: 'cert-robert-guard',
      workspaceId: ACME,
      employeeId: 'dev-acme-emp-006',
      certificationType: 'guard_card',
      certificationName: 'TX Security Guard License',
      certificationNumber: 'TXG-2021-19847',
      issuingAuthority: 'Texas DPS PSB',
      issuedDate: new Date(daysAgo(740)),
      expirationDate: new Date(daysFromNow(-1)),
      status: 'active' as any,
      isRequired: true,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoUpdate({
      target: employeeCertifications.id,
      set: { expirationDate: new Date(daysFromNow(-1)), updatedAt: sql`now()` },
    });

    // Scenario 4 — Carlos Garcia (dev-acme-emp-004): guard card active, NO First Aid cert
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(employeeCertifications).values({
      id: 'cert-carlos-guard',
      workspaceId: ACME,
      employeeId: 'dev-acme-emp-004',
      certificationType: 'guard_card',
      certificationName: 'TX Security Guard License',
      certificationNumber: 'TXG-2024-84421',
      issuingAuthority: 'Texas DPS PSB',
      issuedDate: new Date(daysAgo(90)),
      expirationDate: new Date(daysFromNow(275)),
      status: 'active' as any,
      isRequired: true,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();
    // Note: Carlos deliberately has NO first_aid cert in employee_certifications

    // Scenario 4 — Elena Martinez (dev-acme-emp-007): guard card + First Aid cert (for comparison)
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(employeeCertifications).values({
      id: 'cert-elena-guard',
      workspaceId: ACME,
      employeeId: 'dev-acme-emp-007',
      certificationType: 'guard_card',
      certificationName: 'TX Security Guard License',
      certificationNumber: 'TXG-2023-55211',
      issuingAuthority: 'Texas DPS PSB',
      issuedDate: new Date(daysAgo(300)),
      expirationDate: new Date(daysFromNow(430)),
      status: 'active' as any,
      isRequired: true,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(employeeCertifications).values({
      id: 'cert-elena-firstaid',
      workspaceId: ACME,
      employeeId: 'dev-acme-emp-007',
      certificationType: 'first_aid',
      certificationName: 'American Red Cross First Aid Certification',
      certificationNumber: 'ARC-FA-2024-7731',
      issuingAuthority: 'American Red Cross',
      issuedDate: new Date(daysAgo(120)),
      expirationDate: new Date(daysFromNow(245)),
      status: 'active' as any,
      isRequired: false,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();

    // Scenario 5 — Org-level insurance cert for Acme (expires in 45 days — 60-day WARNING)
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(employeeCertifications).values({
      id: 'cert-acme-insurance',
      workspaceId: ACME,
      employeeId: 'dev-acme-emp-001',
      certificationType: 'company_insurance',
      certificationName: 'Acme Security General Liability + Umbrella Policy',
      certificationNumber: 'POLICY-GL-2024-ACME-00291',
      issuingAuthority: 'Hartford Fire Insurance Company',
      issuedDate: new Date(daysAgo(320)),
      expirationDate: new Date(daysFromNow(45)),
      status: 'active' as any,
      isRequired: true,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();

    // Scenario 6 — James Fontenot: Louisiana guard license (out-of-state flag)
    // First ensure the employee record exists
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(employees).values({
      id: 'dev-acme-emp-oos',
      workspaceId: ACME,
      userId: 'dev-acme-emp-oos-user',
      firstName: 'James',
      lastName: 'Fontenot',
      email: 'fontenot@acme-security.test',
      phone: '985-555-0177',
      employeeNumber: 'EMP-ACME-00099',
      role: 'Security Officer',
      workspaceRole: 'employee' as any,
      hourlyRate: '20.00',
      isActive: true,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(employeeCertifications).values({
      id: 'cert-james-guard',
      workspaceId: ACME,
      employeeId: 'dev-acme-emp-oos',
      certificationType: 'guard_card',
      certificationName: 'Louisiana Security Guard License',
      certificationNumber: 'LA-PSS-2023-18847',
      issuingAuthority: 'Louisiana State Police Private Security Bureau',
      issuedDate: new Date(daysAgo(180)),
      expirationDate: new Date(daysFromNow(185)),
      status: 'active' as any,
      isRequired: true,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();

    // Sentinel
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(employeeCertifications).values({
      id: 'cert-scenario-sentinel-v1',
      workspaceId: ACME,
      employeeId: 'dev-acme-emp-001',
      certificationType: 'seed_sentinel',
      certificationName: 'Compliance Scenario Seed Sentinel',
      certificationNumber: 'SENTINEL-V1',
      issuingAuthority: 'System',
      issuedDate: sql`now()`,
      expirationDate: null,
      status: 'active' as any,
      isRequired: false,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();

    console.log("[ComplianceSeed] Scenario certifications seeded (6 scenarios ready)");
  });

  console.log("[ComplianceSeed] Compliance data seeded successfully.");
  return { success: true, message: "Compliance data seeded for Acme + Anvil" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Guard Card & Employee Compliance Enrichment
// Sentinel: employees.guard_card_number for dev-acme-emp-001 must be NULL
// Safe to re-run — uses WHERE id = ... (exact row match)
// ─────────────────────────────────────────────────────────────────────────────
export async function runGuardCardEnrichment(): Promise<{ success: boolean; message: string }> {
  const { isProduction } = await import('../lib/isProduction');
  if (isProduction()) return { success: true, message: "Skipped — production" };

  // CATEGORY C — Raw SQL retained: LIMIT | Tables: employees | Verified: 2026-03-23
  const check = await typedQuery(sql`
    SELECT guard_card_number FROM employees WHERE id = 'dev-acme-emp-001' LIMIT 1
  `);
  if ((check as any[])[0]?.guard_card_number) {
    return { success: true, message: "Guard card data already enriched — skipped" };
  }

  const guards: Array<{ id: string; fullLegal: string; gcNum: string | null; gcIssued: string | null; gcExpiry: string | null; licType: string | null; payType: string }> = [
    { id: 'dev-acme-emp-001', fullLegal: 'Marcus Anthony Rivera',   gcNum: 'G-CA-2021-0001847', gcIssued: '2021-05-12', gcExpiry: '2027-05-12', licType: 'level4_ppo',      payType: 'w2' },
    { id: 'dev-acme-emp-003', fullLegal: 'James Elmore Washington', gcNum: 'G-CA-2020-0004221', gcIssued: '2020-08-19', gcExpiry: '2026-08-19', licType: 'level2_unarmed', payType: 'w2' },
    { id: 'dev-acme-emp-004', fullLegal: 'Carlos Miguel Garcia',    gcNum: 'G-CA-2022-0009341', gcIssued: '2022-03-07', gcExpiry: '2028-03-07', licType: 'level2_unarmed', payType: 'w2' },
    { id: 'dev-acme-emp-005', fullLegal: 'Diana Louise Johnson',    gcNum: 'G-CA-2019-0011562', gcIssued: '2019-11-25', gcExpiry: '2025-11-25', licType: 'level3_armed',   payType: 'w2' },
    { id: 'dev-acme-emp-006', fullLegal: 'Robert James Williams',   gcNum: 'G-CA-2023-0002887', gcIssued: '2023-01-14', gcExpiry: '2029-01-14', licType: 'level2_unarmed', payType: 'w2' },
    { id: 'dev-acme-emp-007', fullLegal: 'Elena Sofia Martinez',    gcNum: 'G-CA-2021-0007743', gcIssued: '2021-07-30', gcExpiry: '2027-07-30', licType: 'level3_armed',   payType: 'w2' },
    { id: 'dev-acme-emp-008', fullLegal: 'Michael David Thompson',  gcNum: 'G-CA-2022-0016491', gcIssued: '2022-09-02', gcExpiry: '2028-09-02', licType: 'level2_unarmed', payType: 'w2' },
    { id: 'dev-acme-emp-009', fullLegal: 'Angela Marie Davis',      gcNum: 'G-CA-2020-0018832', gcIssued: '2020-06-11', gcExpiry: '2026-06-11', licType: 'level2_unarmed', payType: 'w2' },
    { id: 'dev-acme-emp-010', fullLegal: 'Kevin Michael Brown',     gcNum: 'G-CA-2023-0005174', gcIssued: '2023-04-18', gcExpiry: '2029-04-18', licType: 'level2_unarmed', payType: 'w2' },
    { id: 'dev-acme-emp-011', fullLegal: 'Jennifer Su-Yeon Lee',    gcNum: 'G-CA-2021-0013658', gcIssued: '2021-02-22', gcExpiry: '2027-02-22', licType: 'level2_unarmed', payType: 'w2' },
    { id: 'dev-acme-emp-012', fullLegal: 'David Alan Wilson',       gcNum: 'G-CA-2022-0021003', gcIssued: '2022-11-08', gcExpiry: '2028-11-08', licType: 'level2_unarmed', payType: 'w2' },
    { id: 'dev-acme-emp-013', fullLegal: 'Lisa Jean Anderson',      gcNum: null,                gcIssued: null,          gcExpiry: null,          licType: null,             payType: 'w2' },
  ];

  for (const g of guards) {
    if (g.gcIssued && g.gcExpiry) {
      // CATEGORY C — Raw SQL retained: ::date | Tables: employees | Verified: 2026-03-23
      await typedExec(sql`
        UPDATE employees SET
          full_legal_name      = ${g.fullLegal},
          guard_card_number    = ${g.gcNum},
          guard_card_issue_date  = ${g.gcIssued}::date,
          guard_card_expiry_date = ${g.gcExpiry}::date,
          license_type         = ${g.licType},
          compliance_pay_type  = ${g.payType}
        WHERE id = ${g.id}
      `);
    } else {
      // CATEGORY C — Raw SQL retained: Seed data multi-field UPDATE | Tables: employees | Verified: 2026-03-23
      await typedExec(sql`
        UPDATE employees SET
          full_legal_name      = ${g.fullLegal},
          guard_card_number    = ${g.gcNum},
          license_type         = ${g.licType},
          compliance_pay_type  = ${g.payType}
        WHERE id = ${g.id}
      `);
    }
  }

  console.log("[GuardCardEnrich] Acme guard card data populated for 12 employees.");
  return { success: true, message: "Guard card data enriched for Acme Security" };
}
