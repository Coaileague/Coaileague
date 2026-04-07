/**
 * CONTRACTS & INCIDENTS SEED — Both Acme Security and Anvil Security
 * Client contracts (with e-signature tokens), incident reports for both orgs.
 * Idempotent — sentinel: client_contracts.id = 'contract-acme-002'
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import crypto from "crypto";
import { typedQuery } from '../lib/typedSql';
import { clientContracts, clientContractAccessTokens, incidentReports } from '@shared/schema';

const ACME = "dev-acme-security-ws";
const ANVIL = "dev-anvil-security-ws";

function daysAgo(d: number): string {
  const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString();
}
function daysFromNow(d: number): string {
  const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString();
}
function genToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

async function seedTable(name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); }
  catch (err) { console.error(`[ContractsSeed] ERROR in ${name}:`, (err as Error).message); }
}

const CONTRACT_CONTENT_TEMPLATE = (clientName: string, services: string, rate: string, term: string) => `
SECURITY SERVICES AGREEMENT

This Security Services Agreement ("Agreement") is entered into as of the date of execution between the parties identified below.

CLIENT: ${clientName}
SERVICES: ${services}
RATE: $${rate} per hour
TERM: ${term}

1. SERVICES
The security company agrees to provide professional security guard services at the client's designated site(s) as specified in Schedule A attached hereto.

2. PERFORMANCE STANDARDS
All security personnel shall be licensed, trained, and comply with all applicable Texas Department of Public Safety Private Security Bureau requirements.

3. PAYMENT TERMS
Client shall pay invoices within thirty (30) days of receipt. Late payments accrue interest at 1.5% per month.

4. INSURANCE
Security company maintains general liability coverage of $2,000,000 per occurrence and workers' compensation as required by Texas law.

5. TERMINATION
Either party may terminate this agreement with thirty (30) days written notice.

IN WITNESS WHEREOF, the parties execute this Agreement as of the date signed below.
`.trim();

export async function runContractsAndIncidentsSeed(): Promise<{ success: boolean; message: string }> {
  const { isProduction } = await import('../lib/isProduction');
  if (isProduction()) return { success: true, message: "Skipped — production" };

  // CATEGORY C — Raw SQL retained: LIMIT | Tables: client_contracts | Verified: 2026-03-23
  const check = await typedQuery(sql`
    SELECT id FROM client_contracts WHERE id = 'contract-acme-002' LIMIT 1
  `);
  if (check.length > 0) {
    return { success: true, message: "Contracts/incidents data already seeded — skipped" };
  }

  console.log("[ContractsSeed] Seeding contracts and incidents...");

  // =====================================================================
  // 1. ACME — CLIENT CONTRACTS
  // =====================================================================
  await seedTable("acme_contracts", async () => {
    // Contract 2: Sent for e-signature (with valid access token)
    const sigToken = genToken();
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(clientContracts).values({
      id: 'contract-acme-002',
      workspaceId: ACME,
      docType: 'contract' as any,
      clientId: 'dev-client-001',
      clientName: 'NorthPark Mall Management',
      clientEmail: 'contracts@northpark-mall.test',
      title: 'NorthPark Mall Security Services — Renewal 2026',
      content: CONTRACT_CONTENT_TEMPLATE("NorthPark Mall Management", "Patrol, Access Control, Incident Response", "32.00", "12 months"),
      summary: 'Annual renewal for security services at NorthPark Mall. Patrol, access control, and incident response at $32/hr.',
      services: [{ name: "Patrol Guards", qty: 2, rate: 32 }, { name: "Access Control", qty: 1, rate: 32 }],
      billingTerms: { netDays: 30, lateFeePct: 1.5 },
      totalValue: '149760.00',
      status: 'sent' as any,
      sentAt: new Date(daysAgo(3)),
      statusChangedAt: new Date(daysAgo(3)),
      statusChangedBy: 'dev-owner-001',
      expiresAt: new Date(daysFromNow(27)),
      effectiveDate: sql`NOW()::date`,
      termEndDate: sql`(NOW() + INTERVAL '12 months')::date`,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();

    // Access token for the e-signature link
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(clientContractAccessTokens).values({
      id: 'ccat-acme-001',
      workspaceId: ACME,
      contractId: 'contract-acme-002',
      clientId: 'dev-client-001',
      token: sigToken,
      tokenType: 'sign',
      recipientEmail: 'contracts@northpark-mall.test',
      permissions: { canSign: true, canView: true },
      expiresAt: new Date(daysFromNow(27)),
      createdBy: 'dev-owner-001',
      useCount: 0,
    }).onConflictDoNothing();

    // Contract 3: Executed (signed)
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(clientContracts).values({
      id: 'contract-acme-003',
      workspaceId: ACME,
      docType: 'contract' as any,
      clientId: 'dev-client-002',
      clientName: 'Dallas Medical Center',
      clientEmail: 'legal@dallas-medical.test',
      title: 'Dallas Medical Center Armed Security Services 2025',
      content: CONTRACT_CONTENT_TEMPLATE("Dallas Medical Center", "Armed Security Guard Services - Level III", "42.00", "24 months"),
      summary: 'Two-year armed security contract for Dallas Medical Center ER and lobby posts.',
      services: [{ name: "Armed Guard L3", qty: 3, rate: 42 }],
      billingTerms: { netDays: 30 },
      totalValue: '367416.00',
      status: 'executed' as any,
      sentAt: new Date(daysAgo(180)),
      acceptedAt: new Date(daysAgo(170)),
      executedAt: new Date(daysAgo(168)),
      statusChangedAt: new Date(daysAgo(168)),
      statusChangedBy: 'dev-owner-001',
      effectiveDate: sql`(NOW() - INTERVAL '6 months')::date`,
      termEndDate: sql`(NOW() + INTERVAL '18 months')::date`,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();

    // Contract 4: Active (ongoing)
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(clientContracts).values({
      id: 'contract-acme-004',
      workspaceId: ACME,
      docType: 'contract' as any,
      clientId: 'dev-client-004',
      clientName: 'Alliance National Security',
      clientEmail: 'contracts@alliance-security.test',
      title: 'Alliance Agency Staffing Agreement 2025-2026',
      content: CONTRACT_CONTENT_TEMPLATE("Alliance National Security", "Guard Staffing — Agency Rate", "40.00", "12 months"),
      summary: 'Agency staffing agreement with Alliance National Security for supplemental guard coverage.',
      services: [{ name: "Agency Guard Rate", qty: 5, rate: 40 }],
      billingTerms: { netDays: 15 },
      totalValue: '208000.00',
      status: 'executed' as any,
      sentAt: new Date(daysAgo(90)),
      acceptedAt: new Date(daysAgo(85)),
      executedAt: new Date(daysAgo(83)),
      statusChangedAt: new Date(daysAgo(83)),
      statusChangedBy: 'dev-owner-001',
      effectiveDate: sql`(NOW() - INTERVAL '3 months')::date`,
      termEndDate: sql`(NOW() + INTERVAL '9 months')::date`,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();
  });

  // =====================================================================
  // 2. ANVIL — CLIENT CONTRACTS
  // =====================================================================
  await seedTable("anvil_contracts", async () => {
    // Contract 1: Sent for e-signature
    const sigToken2 = genToken();
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(clientContracts).values({
      id: 'contract-anvil-001',
      workspaceId: ANVIL,
      docType: 'contract' as any,
      clientId: 'anvil-c-001',
      clientName: 'San Antonio Medical Center',
      clientEmail: 'security@samedcenter.test',
      title: 'SA Medical Center Security Services Agreement 2026',
      content: CONTRACT_CONTENT_TEMPLATE("San Antonio Medical Center", "Uniformed Patrol, ER Bay Control, Parking Enforcement", "28.00", "12 months"),
      summary: 'Comprehensive security for SA Medical Center — patrol, ER access control, parking. $28/hr.',
      services: [{ name: "Uniformed Officers", qty: 3, rate: 28 }],
      billingTerms: { netDays: 30 },
      totalValue: '174720.00',
      status: 'sent' as any,
      sentAt: new Date(daysAgo(5)),
      statusChangedAt: new Date(daysAgo(5)),
      statusChangedBy: 'anvil-owner-001',
      expiresAt: new Date(daysFromNow(25)),
      effectiveDate: sql`NOW()::date`,
      termEndDate: sql`(NOW() + INTERVAL '12 months')::date`,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();

    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(clientContractAccessTokens).values({
      id: 'ccat-anvil-001',
      workspaceId: ANVIL,
      contractId: 'contract-anvil-001',
      clientId: 'anvil-c-001',
      token: sigToken2,
      tokenType: 'sign',
      recipientEmail: 'security@samedcenter.test',
      permissions: { canSign: true, canView: true },
      expiresAt: new Date(daysFromNow(25)),
      createdBy: 'anvil-owner-001',
      useCount: 0,
    }).onConflictDoNothing();

    // Contract 2: Executed
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(clientContracts).values({
      id: 'contract-anvil-002',
      workspaceId: ANVIL,
      docType: 'contract' as any,
      clientId: 'anvil-c-004',
      clientName: 'Frost Bank Tower',
      clientEmail: 'facilities@frostbank.test',
      title: 'Frost Bank Tower Armed Security Contract 2025',
      content: CONTRACT_CONTENT_TEMPLATE("Frost Bank Tower", "Armed Security — Level III Post", "26.00", "24 months"),
      summary: 'Two-year armed post agreement for Frost Bank Tower lobby and vault corridor.',
      services: [{ name: "Armed Guard L3", qty: 2, rate: 26 }],
      billingTerms: { netDays: 30 },
      totalValue: '108160.00',
      status: 'executed' as any,
      sentAt: new Date(daysAgo(120)),
      acceptedAt: new Date(daysAgo(112)),
      executedAt: new Date(daysAgo(110)),
      statusChangedAt: new Date(daysAgo(110)),
      statusChangedBy: 'anvil-owner-001',
      effectiveDate: sql`(NOW() - INTERVAL '4 months')::date`,
      termEndDate: sql`(NOW() + INTERVAL '20 months')::date`,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();

    // Contract 3: Draft
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(clientContracts).values({
      id: 'contract-anvil-003',
      workspaceId: ANVIL,
      docType: 'contract' as any,
      clientId: 'anvil-c-006',
      clientName: 'UTSA Main Campus',
      clientEmail: 'security@utsa.test',
      title: 'UTSA Campus Safety Services Proposal 2026',
      content: CONTRACT_CONTENT_TEMPLATE("UTSA Main Campus", "Campus Patrol, Bike Path Enforcement, Student Center Post", "23.00", "12 months"),
      summary: 'Draft proposal for UTSA campus security services. Awaiting internal approval before sending.',
      services: [{ name: "Campus Officers", qty: 4, rate: 23 }],
      billingTerms: { netDays: 30 },
      totalValue: '191040.00',
      status: 'draft' as any,
      statusChangedAt: sql`now()`,
      statusChangedBy: 'anvil-owner-001',
      effectiveDate: sql`NOW()::date`,
      termEndDate: sql`(NOW() + INTERVAL '12 months')::date`,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();
  });

  // =====================================================================
  // 3. ACME — INCIDENT REPORTS
  // =====================================================================
  await seedTable("acme_incidents", async () => {
    const incidents = [
      {
        id: "inc-acme-001",
        num: "INC-ACME-2026-001",
        reporter: "dev-acme-emp-004",
        title: "Shoplifter Detained — NorthPark Mall",
        type: "theft",
        severity: "medium",
        desc: "At approximately 1432 hours, observed subject concealing merchandise (3 items, est. value $287) in a backpack near the northeast entrance of Macy's. Subject detained, mall management notified, NPPD responded at 1449. Subject issued criminal trespass notice.",
        polished: "Security Officer C. Garcia detained a theft suspect at NorthPark Mall at 14:32 hours. Three items valued at approximately $287 were recovered. Subject was issued a criminal trespass notice after NPPD response.",
        photos: JSON.stringify([{ url: "https://placehold.co/800x600/png?text=Incident+Evidence+Photo", caption: "Recovered merchandise", timestamp: daysAgo(5) }]),
        lat: 32.8673, lng: -96.7701,
        addr: "NorthPark Center, 8687 N Central Expy, Dallas TX",
        status: "reviewed",
        sentToClient: daysAgo(4),
        daysAgo: 5,
      },
      {
        id: "inc-acme-002",
        num: "INC-ACME-2026-002",
        reporter: "dev-acme-emp-007",
        title: "Unauthorized Vehicle in Restricted Zone",
        type: "unauthorized_access",
        severity: "low",
        desc: "White sedan (TX plate RZX-4471) observed in physician-only parking at Dallas Medical Center for 3+ hours. Vehicle not registered to any known physician. Left warning notice on windshield. Vehicle removed at 1615 hours.",
        polished: "An unauthorized vehicle occupied a restricted physician parking space at Dallas Medical Center for over three hours. Officer Martinez placed a warning notice; the vehicle was voluntarily removed at 16:15.",
        photos: JSON.stringify([]),
        lat: 32.8062, lng: -96.7799,
        addr: "Dallas Medical Center, 7 Medical Pkwy, Dallas TX",
        status: "reviewed",
        sentToClient: daysAgo(10),
        daysAgo: 11,
      },
      {
        id: "inc-acme-003",
        num: "INC-ACME-2026-003",
        reporter: "dev-acme-emp-009",
        title: "Medical Emergency — Patron Fall",
        type: "medical",
        severity: "high",
        desc: "Female patron (approx. 70 years) slipped near the food court restrooms. Officer Davis rendered first aid, called 911 at 1312. AMR arrived at 1318. Patron transported to Baylor Scott & White. Incident report filed with mall management, area secured and floor mopped.",
        polished: "A patron sustained a fall injury near the food court at approximately 13:12 hours. Officer A. Davis administered first aid and coordinated EMS response. Patron was transported to Baylor Scott & White Medical Center. Scene was secured and hazard corrected.",
        photos: JSON.stringify([{ url: "https://placehold.co/800x600/png?text=Scene+Documentation", caption: "Fall location - wet floor area", timestamp: daysAgo(15) }]),
        lat: 32.8673, lng: -96.7701,
        addr: "NorthPark Center Food Court, Dallas TX",
        status: "reviewed",
        sentToClient: daysAgo(14),
        daysAgo: 15,
      },
      {
        id: "inc-acme-004",
        num: "INC-ACME-2026-004",
        reporter: "dev-acme-emp-005",
        title: "Suspicious Package — DFW Corporate Park",
        type: "suspicious_activity",
        severity: "high",
        desc: "Unattended backpack found at Building C entrance at 0742. Surrounding area evacuated (est. 45 employees). DFW PD bomb squad notified and responded at 0801. Package determined to be abandoned gym bag with no hazardous contents. All clear issued at 0834.",
        polished: "An unattended backpack at Building C entrance triggered a precautionary evacuation of 45+ employees at 07:42. Officer D. Johnson coordinated with DFW PD bomb squad. Package was cleared at 08:34 with no hazardous contents found.",
        photos: JSON.stringify([]),
        lat: 32.8970, lng: -97.0414,
        addr: "DFW Corporate Park, Building C, Grapevine TX",
        status: "draft",
        sentToClient: null,
        daysAgo: 2,
      },
      {
        id: "inc-acme-005",
        num: "INC-ACME-2026-005",
        reporter: "dev-acme-emp-006",
        title: "Property Damage — Graffiti Tagged Exterior Wall",
        type: "property_damage",
        severity: "low",
        desc: "Graffiti spray paint (approx. 8 sq ft) discovered on the east exterior wall of Building A during 0600 patrol. Area photographed, management notified. Estimated damage $400-600. Reviewed CCTV footage from 0200-0330, identified suspect vehicle.",
        polished: "Graffiti was discovered on the east exterior of Building A during the morning patrol. Officer R. Williams documented the damage, notified property management, and reviewed CCTV footage identifying a suspect vehicle.",
        photos: JSON.stringify([{ url: "https://placehold.co/800x600/png?text=Graffiti+Documentation", caption: "East wall graffiti", timestamp: daysAgo(20) }]),
        lat: 32.7357, lng: -97.108,
        addr: "Sundance Square, Building A, Fort Worth TX",
        status: "reviewed",
        sentToClient: daysAgo(18),
        daysAgo: 20,
      },
    ];
    for (const inc of incidents) {
      const createdAt = daysAgo(inc.daysAgo);
      // CATEGORY C — Genuine schema mismatch: SQL uses polished_summary=inc.title but schema polishedSummary is separate field; photos passed as string with ::jsonb cast; sent_to_client_at/occurred_at need ::timestamptz casts
      await typedExec(sql`
        INSERT INTO incident_reports (id, workspace_id, incident_number, reported_by,
          title, severity, incident_type,
          raw_description, polished_description, polished_summary,
          photos, gps_latitude, gps_longitude, location_address,
          status, sent_to_client_at, occurred_at, updated_at)
        VALUES (
          ${inc.id}, ${ACME}, ${inc.num}, ${inc.reporter},
          ${inc.title}, ${inc.severity}, ${inc.type},
          ${inc.desc}, ${inc.polished}, ${inc.title},
          ${inc.photos}::jsonb, ${inc.lat}, ${inc.lng}, ${inc.addr},
          ${inc.status}, ${inc.sentToClient}::timestamptz,
          ${createdAt}::timestamptz, NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `);
    }
  });

  // =====================================================================
  // 4. ANVIL — INCIDENT REPORTS
  // =====================================================================
  await seedTable("anvil_incidents", async () => {
    const incidents = [
      {
        id: "inc-anvil-001",
        num: "INC-ANV-2026-001",
        reporter: "anvil-e-003",
        title: "Trespasser Removed — SA Medical Center Parking",
        type: "trespassing",
        severity: "medium",
        desc: "Individual without medical ID refused to leave physician parking at 1510 hours. Subject became verbally aggressive. SAPD contacted, arrived at 1522. Subject escorted off premises and issued criminal trespass warning.",
        polished: "A trespasser was removed from physician parking at SA Medical Center at 15:10. The subject became verbally aggressive and SAPD was called. A criminal trespass warning was issued.",
        photos: JSON.stringify([]),
        lat: 29.4941, lng: -98.5743,
        addr: "SA Medical Center, 4502 Medical Dr, San Antonio TX",
        status: "reviewed",
        sentToClient: daysAgo(7),
        daysAgo: 8,
      },
      {
        id: "inc-anvil-002",
        num: "INC-ANV-2026-002",
        reporter: "anvil-e-009",
        title: "After-Hours Access Attempt — Frost Bank Vault Floor",
        type: "unauthorized_access",
        severity: "critical",
        desc: "At 0224 hours, badge access attempt on vault floor corridor denied for credential not on authorized list. Two individuals observed on lobby CCTV approaching elevator. Officer Kim confronted individuals who claimed to be maintenance. Credentials unverifiable. SAPD notified, individuals detained until 0311. Bank security director contacted.",
        polished: "An unauthorized badge access attempt occurred on the vault floor at 02:24. Two individuals were detained by Officer M. Kim and held until SAPD arrival at 03:11. Investigation ongoing with bank security director.",
        photos: JSON.stringify([{ url: "https://placehold.co/800x600/png?text=CCTV+Capture", caption: "Lobby CCTV capture 02:24", timestamp: daysAgo(3) }]),
        lat: 29.4246, lng: -98.4937,
        addr: "Frost Bank Tower, 100 W Houston St, San Antonio TX",
        status: "reviewed",
        sentToClient: daysAgo(2),
        daysAgo: 3,
      },
      {
        id: "inc-anvil-003",
        num: "INC-ANV-2026-003",
        reporter: "anvil-e-011",
        title: "Vehicle Theft from Riverwalk Hotel Valet Area",
        type: "theft",
        severity: "high",
        desc: "Guest vehicle (BMW 5-series, white) reported missing from valet staging area at 2145 hours. Valet ticket presented but no record of vehicle drop-off found in valet system. SAPD Case #2026-SA-44821 filed. Hotel GM notified.",
        polished: "A guest vehicle was reported stolen from the valet staging area at 21:45. Discrepancy found in valet records. SAPD case filed and hotel general manager notified.",
        photos: JSON.stringify([]),
        lat: 29.4246, lng: -98.4897,
        addr: "Riverwalk Marriott Hotel, 889 E Market St, San Antonio TX",
        status: "draft",
        sentToClient: null,
        daysAgo: 1,
      },
      {
        id: "inc-anvil-004",
        num: "INC-ANV-2026-004",
        reporter: "anvil-e-004",
        title: "Patient Elopement — SA Medical Center ER",
        type: "medical",
        severity: "high",
        desc: "ER nursing staff requested assistance at 1103 for patient who left without discharge. Patient last seen exiting east ER bay doors. Officer Flores conducted perimeter search, located patient in parking garage level 1. Patient returned to ER care.",
        polished: "An ER patient eloped through the east bay at 11:03. Officer M. Flores located the patient in Parking Level 1 and safely returned them to nursing staff.",
        photos: JSON.stringify([]),
        lat: 29.4941, lng: -98.5743,
        addr: "SA Medical Center ER, 4502 Medical Dr, San Antonio TX",
        status: "reviewed",
        sentToClient: daysAgo(12),
        daysAgo: 13,
      },
      {
        id: "inc-anvil-005",
        num: "INC-ANV-2026-005",
        reporter: "anvil-e-007",
        title: "Vandalism — UTSA Bike Rack",
        type: "property_damage",
        severity: "low",
        desc: "Three bike locks cut, two bikes stolen from rack near Engineering Building. Discovered during 0615 patrol. UTSA PD notified, CCTV reviewed from 0300-0600 showing two suspects. Campus security case filed.",
        polished: "Two bicycles were stolen from the Engineering Building bike rack overnight. Officer D. Patel notified UTSA PD and reviewed CCTV footage identifying two suspects.",
        photos: JSON.stringify([{ url: "https://placehold.co/800x600/png?text=Scene+Evidence", caption: "Cut bike locks", timestamp: daysAgo(18) }]),
        lat: 29.5833, lng: -98.6194,
        addr: "UTSA Main Campus, Engineering Building, San Antonio TX",
        status: "reviewed",
        sentToClient: daysAgo(16),
        daysAgo: 18,
      },
    ];
    for (const inc of incidents) {
      const createdAt = daysAgo(inc.daysAgo);
      // CATEGORY C — Genuine schema mismatch: SQL uses polished_summary=inc.title but schema polishedSummary is separate field; photos passed as string with ::jsonb cast; sent_to_client_at/occurred_at need ::timestamptz casts
      await typedExec(sql`
        INSERT INTO incident_reports (id, workspace_id, incident_number, reported_by,
          title, severity, incident_type,
          raw_description, polished_description, polished_summary,
          photos, gps_latitude, gps_longitude, location_address,
          status, sent_to_client_at, occurred_at, updated_at)
        VALUES (
          ${inc.id}, ${ANVIL}, ${inc.num}, ${inc.reporter},
          ${inc.title}, ${inc.severity}, ${inc.type},
          ${inc.desc}, ${inc.polished}, ${inc.title},
          ${inc.photos}::jsonb, ${inc.lat}, ${inc.lng}, ${inc.addr},
          ${inc.status}, ${inc.sentToClient}::timestamptz,
          ${createdAt}::timestamptz, NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `);
    }
  });

  console.log("[ContractsSeed] Contracts and incidents seeded for Acme + Anvil.");
  return { success: true, message: "Contracts and incidents seeded" };
}
