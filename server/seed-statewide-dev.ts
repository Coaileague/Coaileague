/**
 * Development seeder for "Test Statewide" workspace.
 *
 * Generates a full simulated dataset for end-to-end testing before the
 * Statewide launch:
 *   - 1 workspace  (Test Statewide, TX, Enterprise, America/Chicago)
 *   - 150 officers (license types, availability, bank accounts, SSN, pay type)
 *   - 15 clients   (contract rates, armed/unarmed requirements)
 *   - 40 sites     (Texas GPS coords, geofence, site_type)
 *   - 50 shifts    (next 7 days, unassigned — ready for Trinity to fill)
 *
 * SAFETY:  Production-gated via isProduction(). Always safe to run in dev.
 * IDEMPOTENCY: Drops all workspace data first, then re-seeds fresh.
 *
 * Run:
 *   DATABASE_URL=<dev-postgres-url> npx tsx server/seed-statewide-dev.ts
 */

import { pool } from "./db";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

// ─── Constants (dev-only — never import these in production code) ─────────────

const STATEWIDE_WORKSPACE_ID = "test-statewide-ws-00000000000001";
const STATEWIDE_OWNER_USER_ID = "test-statewide-owner-000000000001";

// ─── Name pools ──────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  "James","John","Robert","Michael","William","David","Richard","Joseph","Thomas","Charles",
  "Christopher","Daniel","Matthew","Anthony","Donald","Mark","Paul","Steven","Andrew","Kenneth",
  "Mary","Patricia","Jennifer","Linda","Barbara","Elizabeth","Susan","Jessica","Sarah","Karen",
  "Lisa","Nancy","Betty","Margaret","Sandra","Ashley","Dorothy","Kimberly","Emily","Donna",
  "Michelle","Carol","Amanda","Melissa","Deborah","Stephanie","Rebecca","Sharon","Laura","Cynthia",
  "Carlos","Luis","Jorge","Juan","Miguel","Pedro","Antonio","Ricardo","Fernando","Francisco",
  "Destiny","Brianna","Jasmine","Vanessa","Latisha","Shondra","Tamara","Yolanda","Monique","Keisha",
  "Derek","Darnell","Marcus","Terrence","Lamar","Brandon","DeShawn","Malik","Jordan","Isaiah",
  "Wei","Mei","Jun","Yuki","Kenji","Ling","Aisha","Fatima","Hassan","Omar",
  "Ethan","Mason","Logan","Lucas","Noah","Aiden","Oliver","Liam","Elijah","Harper",
];

const LAST_NAMES = [
  "Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez",
  "Hernandez","Lopez","Gonzalez","Wilson","Anderson","Taylor","Thomas","Moore","Jackson","Martin",
  "Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson",
  "Walker","Young","Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores",
  "Green","Adams","Nelson","Baker","Hall","Rivera","Campbell","Mitchell","Carter","Roberts",
  "Turner","Phillips","Evans","Collins","Edwards","Stewart","Morris","Morales","Murphy","Cook",
  "Rogers","Gutierrez","Ortiz","Morgan","Cooper","Peterson","Bailey","Reed","Kelly","Howard",
  "Ramos","Kim","Cox","Ward","Richardson","Watson","Brooks","Chavez","Wood","James",
  "Bennett","Gray","Mendoza","Ruiz","Hughes","Price","Alvarez","Castillo","Sanders","Patel",
  "Myers","Long","Ross","Foster","Jimenez","Powell","Jenkins","Perry","Russell","Sullivan",
];

// Texas GPS bounding box (South Texas / Rio Grande Valley region)
const TX_LAT_MIN = 25.5;
const TX_LAT_MAX = 26.5;
const TX_LNG_MIN = -98.0;
const TX_LNG_MAX = -97.0;

const SITE_NAMES = [
  "Downtown HQ", "North Warehouse", "South Distribution Center",
  "East Medical Campus", "West Corporate Park", "Central Mall Security",
  "Airport Terminal A", "Port Authority Gate 1", "Industrial Complex Alpha",
  "Riverside Office Tower", "Market District Plaza", "Tech Park Building B",
  "Convention Center West", "Stadium Parking Annex", "Lakefront Resort",
  "University Main Campus", "Community Hospital", "Government Services Building",
  "Shipping Yard Delta", "Power Substation 7", "Retail Hub North",
  "Data Center Sector 2", "Chemical Plant Gate", "Grain Elevator Complex",
  "Shopping Center South", "Police Precinct Annex", "School District Admin",
  "Bus Terminal Hub", "Rail Yard Entrance", "Oil Refinery Gate 4",
  "Hotel Grand Entrance", "Event Venue Pavilion", "Research Lab Facility",
  "Waterfront Security Post", "Heritage Museum Guard", "Courthouse Lobby",
  "Military Surplus Depot", "Cold Storage Facility", "Auto Auction Lot",
  "Fitness Center Night Watch",
];

const SITE_TYPES = ["commercial", "residential", "industrial"];

const BANK_NAMES = [
  "Chase Bank", "Bank of America", "Wells Fargo", "Citibank",
  "US Bank", "TD Bank", "Capital One", "PNC Bank",
  "Regions Bank", "Truist Bank",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number, decimals = 6): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function randPhone(): string {
  const area = randInt(200, 999);
  const prefix = randInt(200, 999);
  const line = randInt(1000, 9999);
  return `${area}-${prefix}-${line}`;
}

// Known-valid ABA routing numbers for test/dev use only
const TEST_ROUTING_NUMBERS = [
  "021000021", // JPMorgan Chase
  "021001208", // Citibank
  "026009593", // Bank of America
  "121000248", // Wells Fargo
  "122105155", // US Bank
  "071000013", // Chase (IL)
  "322271627", // Chase (CA)
  "267084131", // Bank of America (FL)
  "063100277", // Bank of America (GA)
  "111000025", // US Bank (TX)
];

function randRoutingNumber(): string {
  return TEST_ROUTING_NUMBERS[randInt(0, TEST_ROUTING_NUMBERS.length - 1)];
}

function randAccountNumber(): string {
  return String(randInt(10000000, 999999999));
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

// ─── Main seeder ─────────────────────────────────────────────────────────────

async function seedStatewideDevData(): Promise<void> {
  // ── Production guard (TRINITY.md §A) ──────────────────────────────────────
  const { isProduction } = await import("./lib/isProduction");
  if (isProduction()) {
    console.log("🌱 [STATEWIDE] Skipped — production environment");
    return;
  }

  console.log("🌱 [STATEWIDE] Starting Test Statewide development seed...");

  // ── 0. Clean: remove prior test run ──────────────────────────────────────
  console.log("🗑️  [STATEWIDE] Dropping prior test workspace data...");
  const cascadeDelete = async (table: string) => {
    await pool.query(
      `DELETE FROM ${table} WHERE workspace_id = $1`,
      [STATEWIDE_WORKSPACE_ID]
    );
  };

  await cascadeDelete("shifts");
  await cascadeDelete("employee_availability");
  await cascadeDelete("employee_bank_accounts");
  await cascadeDelete("employees");
  await cascadeDelete("sites");
  await cascadeDelete("clients");
  await cascadeDelete("workspace_members");

  // Delete users created for this workspace (including the owner)
  await pool.query(
    `DELETE FROM users WHERE current_workspace_id = $1 OR id = $2`,
    [STATEWIDE_WORKSPACE_ID, STATEWIDE_OWNER_USER_ID]
  );
  await pool.query(
    `DELETE FROM workspaces WHERE id = $1`,
    [STATEWIDE_WORKSPACE_ID]
  );
  console.log("✅ [STATEWIDE] Prior data cleared");

  // ── 1. Owner user ─────────────────────────────────────────────────────────
  // A single password hash is computed once and reused across all dev accounts
  // for performance — intentional dev-only shortcut, never replicate in production code.
  const passwordHash = await bcrypt.hash("Statewide2024!", 10);
  await pool.query(`
    INSERT INTO users (
      id, email, first_name, last_name, role,
      password_hash, email_verified, current_workspace_id,
      created_at, updated_at
    ) VALUES ($1,$2,$3,$4,'user',$5,true,$6,NOW(),NOW())
    ON CONFLICT (id) DO NOTHING
  `, [
    STATEWIDE_OWNER_USER_ID,
    "admin@statewide-test.example.com",
    "Statewide",
    "Admin",
    passwordHash,
    STATEWIDE_WORKSPACE_ID,
  ]);

  // ── 2. Workspace ──────────────────────────────────────────────────────────
  await pool.query(`
    INSERT INTO workspaces (
      id, name, owner_id, company_name,
      timezone, subscription_tier, subscription_status,
      company_state,
      max_employees, max_clients,
      business_category,
      auto_scheduling_enabled,
      created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,NOW(),NOW())
    ON CONFLICT (id) DO NOTHING
  `, [
    STATEWIDE_WORKSPACE_ID,
    "Test Statewide",
    STATEWIDE_OWNER_USER_ID,
    "Test Statewide Security LLC",
    "America/Chicago",
    "enterprise",
    "active",
    "TX",
    500,
    100,
    "security",
  ]);

  // ── 3. Owner workspace member ─────────────────────────────────────────────
  await pool.query(`
    INSERT INTO workspace_members (id, user_id, workspace_id, role, status, joined_at, created_at, updated_at)
    VALUES ($1,$2,$3,'org_owner','active',NOW(),NOW(),NOW())
    ON CONFLICT DO NOTHING
  `, [randomUUID(), STATEWIDE_OWNER_USER_ID, STATEWIDE_WORKSPACE_ID]);

  console.log("✅ [STATEWIDE] Workspace created");

  // ── 4. 15 Clients ─────────────────────────────────────────────────────────
  // 8 require armed, 7 unarmed; rates $40-$85/hr; staffing 1-3
  const clientIds: string[] = [];
  const clientArmedMap: boolean[] = [];

  for (let i = 1; i <= 15; i++) {
    const clientId = randomUUID();
    clientIds.push(clientId);

    const requiresArmed = i <= 8;
    clientArmedMap.push(requiresArmed);

    const contractRate = (40 + Math.floor((i - 1) * 3.21)).toFixed(2); // $40–$84 spread across 15 clients
    const minimumStaffing = ((i % 3) + 1); // 1, 2, 3 cycling

    await pool.query(`
      INSERT INTO clients (
        id, workspace_id,
        first_name, last_name, company_name,
        email, phone,
        contract_rate, contract_rate_type,
        requires_armed, minimum_staffing,
        is_active,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'hourly',$9,$10,true,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      clientId,
      STATEWIDE_WORKSPACE_ID,
      "Contact",
      `Client${i}`,
      `Test Client ${i}`,
      `client${i}@statewide-test.example.com`,
      randPhone(),
      contractRate,
      requiresArmed,
      minimumStaffing,
    ]);
  }

  console.log("✅ [STATEWIDE] 15 clients created");

  // ── 5. 40 Sites (linked to clients) ───────────────────────────────────────
  const siteIds: string[] = [];

  for (let i = 0; i < 40; i++) {
    const siteId = randomUUID();
    siteIds.push(siteId);

    const clientId = clientIds[i % 15];
    const lat = randFloat(TX_LAT_MIN, TX_LAT_MAX, 7);
    const lng = randFloat(TX_LNG_MIN, TX_LNG_MAX, 7);
    const siteType = SITE_TYPES[i % 3];
    const siteName = SITE_NAMES[i] ?? `Site ${i + 1}`;

    await pool.query(`
      INSERT INTO sites (
        id, workspace_id, client_id,
        name, site_type,
        latitude, longitude,
        geofence_lat, geofence_lng,
        geofence_radius_meters,
        status,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$6,$7,$8,'active',NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      siteId,
      STATEWIDE_WORKSPACE_ID,
      clientId,
      siteName,
      siteType,
      lat,
      lng,
      100, // geofence_radius_meters default
    ]);
  }

  console.log("✅ [STATEWIDE] 40 sites created");

  // ── 6. 150 Officers ───────────────────────────────────────────────────────
  // License distribution: 50% level2_unarmed, 30% level3_armed, 20% level4_ppo
  // Employment: 80% w2, 20% 1099
  const empIds: string[] = [];
  const empUserIds: string[] = [];

  // Pre-build license type array for deterministic distribution
  const licenseTypes: string[] = [];
  for (let i = 0; i < 150; i++) {
    if (i < 75) licenseTypes.push("level2_unarmed");       // 50%
    else if (i < 120) licenseTypes.push("level3_armed");   // 30%
    else licenseTypes.push("level4_ppo");                  // 20%
  }

  for (let i = 0; i < 150; i++) {
    const empId = randomUUID();
    const userId = randomUUID();
    empIds.push(empId);
    empUserIds.push(userId);

    const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
    const lastName  = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
    const email = `test${i + 1}@example.com`;
    const phone = randPhone();

    const licenseType = licenseTypes[i];
    const isArmed = licenseType !== "level2_unarmed";
    const compliancePayType = i < 120 ? "w2" : "1099"; // 80% W-2, 20% 1099
    const ssnLast4 = String(randInt(1000, 9999));
    const guardCardNumber = `TX-${String(randInt(100000, 999999))}`;
    const guardCardExpiryDate = isoDate(daysFromNow(randInt(180, 730)));
    const hourlyRate = (randInt(1600, 2800) / 100).toFixed(2); // $16–$28/hr

    // Create auth user
    await pool.query(`
      INSERT INTO users (
        id, email, first_name, last_name, role,
        password_hash, email_verified, current_workspace_id,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,'user',$5,true,$6,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [userId, email, firstName, lastName, passwordHash, STATEWIDE_WORKSPACE_ID]);

    // Workspace member
    await pool.query(`
      INSERT INTO workspace_members (id, user_id, workspace_id, role, status, joined_at, created_at, updated_at)
      VALUES ($1,$2,$3,'employee','active',NOW(),NOW(),NOW())
      ON CONFLICT DO NOTHING
    `, [randomUUID(), userId, STATEWIDE_WORKSPACE_ID]);

    // Employee record
    await pool.query(`
      INSERT INTO employees (
        id, workspace_id, user_id,
        first_name, last_name, email, phone,
        role, workspace_role,
        hourly_rate, is_active,
        employee_number,
        onboarding_status,
        availability_mode,
        is_armed, armed_license_verified, guard_card_verified,
        guard_card_number, guard_card_issue_date, guard_card_expiry_date,
        license_type,
        ssn_last4,
        compliance_pay_type,
        city, state,
        scheduling_score,
        color,
        created_at, updated_at
      ) VALUES (
        $1,$2,$3,
        $4,$5,$6,$7,
        'guard','employee',
        $8,true,
        $9,
        'completed',
        'schedule_based',
        $10,$10,$10,
        $11,CURRENT_DATE,$12::date,
        $13,
        $14,
        $15,
        'San Antonio','TX',
        $16,
        $17,
        NOW(),NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `, [
      empId, STATEWIDE_WORKSPACE_ID, userId,
      firstName, lastName, email, phone,
      hourlyRate,
      `SW-${String(i + 1).padStart(4, "0")}`,
      isArmed,
      guardCardNumber,
      guardCardExpiryDate,
      licenseType,
      ssnLast4,
      compliancePayType,
      randInt(60, 95),
      `#${Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, "0")}`,
    ]);

    // Availability: Mon–Fri 06:00–18:00, Sat–Sun 12:00–20:00
    // day_of_week: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    const weekdaySlots = [
      { day: 1, start: "06:00", end: "18:00" },
      { day: 2, start: "06:00", end: "18:00" },
      { day: 3, start: "06:00", end: "18:00" },
      { day: 4, start: "06:00", end: "18:00" },
      { day: 5, start: "06:00", end: "18:00" },
      { day: 6, start: "12:00", end: "20:00" },
      { day: 0, start: "12:00", end: "20:00" },
    ];

    for (const slot of weekdaySlots) {
      await pool.query(`
        INSERT INTO employee_availability (
          id, workspace_id, employee_id,
          day_of_week, start_time, end_time,
          status,
          created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,'available',NOW(),NOW())
        ON CONFLICT DO NOTHING
      `, [
        randomUUID(), STATEWIDE_WORKSPACE_ID, empId,
        slot.day, slot.start, slot.end,
      ]);
    }

    // Bank account
    const bankName = BANK_NAMES[i % BANK_NAMES.length];
    await pool.query(`
      INSERT INTO employee_bank_accounts (
        id, workspace_id, employee_id,
        account_holder_name, bank_name,
        routing_number, account_number,
        account_type,
        is_active, is_verified,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'checking',true,true,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      randomUUID(), STATEWIDE_WORKSPACE_ID, empId,
      `${firstName} ${lastName}`,
      bankName,
      randRoutingNumber(),
      randAccountNumber(),
    ]);
  }

  console.log("✅ [STATEWIDE] 150 officers created (with availability + bank accounts)");

  // ── 7. 50 Unassigned Shifts (next 7 days) ────────────────────────────────
  // Start times: 06:00, 14:00, 22:00 (CST) — 8-hour shifts
  // Distributed across clients and sites
  const startHours = [6, 14, 22];
  let shiftsCreated = 0;

  for (let i = 0; i < 50; i++) {
    const daysAhead = (i % 7) + 1; // days 1–7 from now
    const startHour = startHours[i % 3];

    const start = new Date();
    start.setDate(start.getDate() + daysAhead);
    start.setHours(startHour, 0, 0, 0);

    const end = new Date(start);
    end.setHours(start.getHours() + 8);

    const clientIdx = i % 15;
    const clientId = clientIds[clientIdx];
    const siteId = siteIds[i % 40];
    const billRate = (40 + (clientIdx * 3)).toFixed(2);

    const shiftId = randomUUID();
    const dateStr = isoDate(start);
    const shiftTitle = `Statewide Shift ${String(i + 1).padStart(3, "0")}`;

    await pool.query(`
      INSERT INTO shifts (
        id, workspace_id,
        client_id, site_id,
        title,
        start_time, end_time,
        date,
        status,
        bill_rate,
        billable_to_client,
        ai_generated,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,true,false,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      shiftId,
      STATEWIDE_WORKSPACE_ID,
      clientId,
      siteId,
      shiftTitle,
      start.toISOString(),
      end.toISOString(),
      dateStr,
      billRate,
    ]);

    shiftsCreated++;
  }

  console.log(`✅ [STATEWIDE] ${shiftsCreated} unassigned shifts created (next 7 days)`);

  // ── 8. Summary output ─────────────────────────────────────────────────────
  const [empCount, clientCount, siteCount, shiftCount] = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM employees WHERE workspace_id = $1`, [STATEWIDE_WORKSPACE_ID]),
    pool.query(`SELECT COUNT(*) FROM clients WHERE workspace_id = $1`, [STATEWIDE_WORKSPACE_ID]),
    pool.query(`SELECT COUNT(*) FROM sites WHERE workspace_id = $1`, [STATEWIDE_WORKSPACE_ID]),
    pool.query(`SELECT COUNT(*) FROM shifts WHERE workspace_id = $1`, [STATEWIDE_WORKSPACE_ID]),
  ]);

  const sampleOfficer = await pool.query(
    `SELECT id, first_name, last_name, email, license_type, compliance_pay_type
     FROM employees WHERE workspace_id = $1 LIMIT 3`,
    [STATEWIDE_WORKSPACE_ID]
  );
  const sampleClient = await pool.query(
    `SELECT id, company_name, contract_rate, requires_armed, minimum_staffing
     FROM clients WHERE workspace_id = $1 LIMIT 3`,
    [STATEWIDE_WORKSPACE_ID]
  );
  const sampleSite = await pool.query(
    `SELECT id, name, site_type, latitude, longitude
     FROM sites WHERE workspace_id = $1 LIMIT 3`,
    [STATEWIDE_WORKSPACE_ID]
  );

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("✅  STATEWIDE DEV SEED COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Workspace ID : ${STATEWIDE_WORKSPACE_ID}`);
  console.log(`  Workspace    : Test Statewide (TX, Enterprise, America/Chicago)`);
  console.log(`  Admin login  : admin@statewide-test.example.com / Statewide2024!`);
  console.log(`  Officers     : ${empCount.rows[0].count}`);
  console.log(`  Clients      : ${clientCount.rows[0].count}`);
  console.log(`  Sites        : ${siteCount.rows[0].count}`);
  console.log(`  Shifts       : ${shiftCount.rows[0].count} (unassigned — ready for Trinity)`);
  console.log("\n  Sample officers:");
  for (const r of sampleOfficer.rows) {
    console.log(`    [${r.id.slice(0, 8)}]  ${r.first_name} ${r.last_name}  ${r.email}  ${r.license_type}  ${r.compliance_pay_type}`);
  }
  console.log("\n  Sample clients:");
  for (const r of sampleClient.rows) {
    console.log(`    [${r.id.slice(0, 8)}]  ${r.company_name}  $${r.contract_rate}/hr  armed=${r.requires_armed}  min=${r.minimum_staffing}`);
  }
  console.log("\n  Sample sites:");
  for (const r of sampleSite.rows) {
    console.log(`    [${r.id.slice(0, 8)}]  ${r.name}  (${r.site_type})  ${r.latitude}, ${r.longitude}`);
  }
  console.log("═══════════════════════════════════════════════════════════\n");
}

// ─── Entry point (when run directly with tsx) ────────────────────────────────
seedStatewideDevData()
  .then(() => {
    console.log("🎉 [STATEWIDE] Seed script exiting.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ [STATEWIDE] Seed failed:", err);
    process.exit(1);
  });
