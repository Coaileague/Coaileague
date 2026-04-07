/**
 * ACME SECURITY — OPERATIONAL DATA SEED
 * Populates all mission-critical operational tables with realistic simulated data.
 * 100% idempotent — safe to re-run on every server restart.
 * Data lives in PostgreSQL and persists across restarts.
 * Each table section is isolated — one failure does not block others.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { typedCount, typedExec, typedQuery } from '../lib/typedSql';
import {
  automationExecutions, managerAssignments, employeePayrollInfo, complianceScores,
  guardTours, guardTourScans, gpsLocations, loneWorkerSessions,
  darReports, boloAlerts, rmsCases, postOrderTemplates, escalationChains, shiftOffers
} from '@shared/schema';

const WS = "dev-acme-security-ws";

const SITE_COORDS: Record<string, { lat: number; lng: number }> = {
  "dev-client-001": { lat: 32.7767, lng: -96.797 },
  "dev-client-002": { lat: 32.7474, lng: -97.331 },
  "dev-client-003": { lat: 32.7357, lng: -97.108 },
  "dev-client-004": { lat: 32.746,  lng: -97.016 },
  "dev-client-005": { lat: 32.7791, lng: -96.804 },
  "dev-client-006": { lat: 32.8162, lng: -96.8   },
  "dev-client-007": { lat: 32.8567, lng: -96.973 },
};

function ago(days: number, hours = 0, mins = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours);
  d.setMinutes(d.getMinutes() - mins);
  return d.toISOString();
}

function fromNow(hours: number, mins = 0): string {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  d.setMinutes(d.getMinutes() + mins);
  return d.toISOString();
}

function jitter(base: number, range: number): number {
  return +(base + (Math.random() * range * 2 - range)).toFixed(7);
}

async function seedTable(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[AcmeOps] ERROR seeding ${name}:`, (err as Error).message);
  }
}

export async function runAcmeOperationalSeed(): Promise<{ success: boolean; message: string }> {
  // CATEGORY C — Raw SQL retained: LIMIT | Tables: guard_tours | Verified: 2026-03-23
  const check = await typedQuery(sql`
    SELECT id FROM guard_tours WHERE id = 'dev-tour-001' LIMIT 1
  `);
  if (check.length > 0) {
    return { success: true, message: "Acme operational data already seeded — skipped" };
  }

  console.log("[AcmeOps] Seeding Acme operational data...");

  // ============================================================
  // 1. MANAGER ASSIGNMENTS
  // ============================================================
  await seedTable("manager_assignments", async () => {
    const rows = [
      { id: "dev-ma-001", mgr: "dev-acme-emp-002", emp: "dev-acme-emp-004" },
      { id: "dev-ma-002", mgr: "dev-acme-emp-002", emp: "dev-acme-emp-005" },
      { id: "dev-ma-003", mgr: "dev-acme-emp-002", emp: "dev-acme-emp-006" },
      { id: "dev-ma-004", mgr: "dev-acme-emp-002", emp: "dev-acme-emp-007" },
      { id: "dev-ma-005", mgr: "dev-acme-emp-003", emp: "dev-acme-emp-008" },
      { id: "dev-ma-006", mgr: "dev-acme-emp-003", emp: "dev-acme-emp-009" },
      { id: "dev-ma-007", mgr: "dev-acme-emp-003", emp: "dev-acme-emp-010" },
      { id: "dev-ma-008", mgr: "dev-acme-emp-003", emp: "dev-acme-emp-011" },
      { id: "dev-ma-009", mgr: "dev-acme-emp-002", emp: "dev-acme-emp-012" },
      { id: "dev-ma-010", mgr: "dev-acme-emp-003", emp: "dev-acme-emp-013" },
    ];
    for (const r of rows) {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(managerAssignments).values({
        id: r.id,
        workspaceId: WS,
        managerId: r.mgr,
        employeeId: r.emp,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();
    }
    console.log("[AcmeOps] Manager assignments: 10");
  });

  // ============================================================
  // 2. EMPLOYEE PAYROLL INFO
  // ============================================================
  await seedTable("employee_payroll_info", async () => {
    const rows = [
      { id: "dev-pay-001", emp: "dev-acme-emp-001", status: "married",  fed: 2, state: 2, addl: 0,  w4: true  },
      { id: "dev-pay-002", emp: "dev-acme-emp-002", status: "married",  fed: 1, state: 1, addl: 25, w4: true  },
      { id: "dev-pay-003", emp: "dev-acme-emp-003", status: "single",   fed: 1, state: 1, addl: 0,  w4: true  },
      { id: "dev-pay-004", emp: "dev-acme-emp-004", status: "single",   fed: 0, state: 0, addl: 0,  w4: true  },
      { id: "dev-pay-005", emp: "dev-acme-emp-005", status: "married",  fed: 2, state: 2, addl: 10, w4: true  },
      { id: "dev-pay-006", emp: "dev-acme-emp-006", status: "single",   fed: 0, state: 0, addl: 0,  w4: false },
      { id: "dev-pay-007", emp: "dev-acme-emp-007", status: "single",   fed: 1, state: 0, addl: 0,  w4: true  },
      { id: "dev-pay-008", emp: "dev-acme-emp-008", status: "married",  fed: 3, state: 2, addl: 50, w4: true  },
      { id: "dev-pay-009", emp: "dev-acme-emp-009", status: "single",   fed: 1, state: 1, addl: 15, w4: true  },
      { id: "dev-pay-010", emp: "dev-acme-emp-010", status: "single",   fed: 0, state: 0, addl: 0,  w4: true  },
      { id: "dev-pay-011", emp: "dev-acme-emp-011", status: "married",  fed: 2, state: 1, addl: 20, w4: true  },
      { id: "dev-pay-012", emp: "dev-acme-emp-012", status: "single",   fed: 0, state: 0, addl: 0,  w4: false },
      { id: "dev-pay-013", emp: "dev-acme-emp-013", status: "married",  fed: 1, state: 1, addl: 0,  w4: true  },
    ];
    for (const r of rows) {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(employeePayrollInfo).values({
        id: r.id,
        workspaceId: WS,
        employeeId: r.emp,
        taxFilingStatus: r.status,
        federalAllowances: r.fed,
        stateAllowances: r.state,
        additionalWithholding: String(r.addl),
        w4Completed: r.w4,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();
    }
    console.log("[AcmeOps] Employee payroll info: 13");
  });

  // ============================================================
  // 3. COMPLIANCE SCORES
  // ============================================================
  await seedTable("compliance_scores", async () => {
    const rows = [
      { id: "dev-cs-001", emp: "dev-acme-emp-004", overall: 78,  doc: 80,  exp: 75, audit: 80, train: 75, total: 5, done: 4, expd: 0, e30: 0, e90: 1 },
      { id: "dev-cs-002", emp: "dev-acme-emp-005", overall: 92,  doc: 95,  exp: 90, audit: 92, train: 88, total: 5, done: 5, expd: 0, e30: 0, e90: 0 },
      { id: "dev-cs-003", emp: "dev-acme-emp-006", overall: 71,  doc: 70,  exp: 72, audit: 70, train: 73, total: 4, done: 3, expd: 1, e30: 1, e90: 1 },
      { id: "dev-cs-004", emp: "dev-acme-emp-007", overall: 88,  doc: 90,  exp: 85, audit: 90, train: 85, total: 5, done: 5, expd: 0, e30: 0, e90: 0 },
      { id: "dev-cs-005", emp: "dev-acme-emp-008", overall: 83,  doc: 85,  exp: 80, audit: 85, train: 80, total: 5, done: 4, expd: 0, e30: 1, e90: 1 },
      { id: "dev-cs-006", emp: "dev-acme-emp-009", overall: 96,  doc: 98,  exp: 95, audit: 96, train: 94, total: 6, done: 6, expd: 0, e30: 0, e90: 0 },
      { id: "dev-cs-007", emp: "dev-acme-emp-010", overall: 62,  doc: 60,  exp: 65, audit: 60, train: 65, total: 4, done: 2, expd: 1, e30: 0, e90: 1 },
      { id: "dev-cs-008", emp: "dev-acme-emp-011", overall: 91,  doc: 93,  exp: 88, audit: 92, train: 90, total: 5, done: 5, expd: 0, e30: 0, e90: 0 },
      { id: "dev-cs-009", emp: "dev-acme-emp-012", overall: 69,  doc: 65,  exp: 72, audit: 68, train: 70, total: 4, done: 3, expd: 1, e30: 1, e90: 1 },
      { id: "dev-cs-010", emp: "dev-acme-emp-013", overall: 85,  doc: 88,  exp: 82, audit: 86, train: 83, total: 5, done: 5, expd: 0, e30: 0, e90: 0 },
    ];
    for (const r of rows) {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(complianceScores).values({
        id: r.id,
        workspaceId: WS,
        employeeId: r.emp,
        scoreType: 'employee',
        overallScore: r.overall,
        documentScore: r.doc,
        expirationScore: r.exp,
        auditReadinessScore: r.audit,
        trainingScore: r.train,
        totalRequirements: r.total,
        completedRequirements: r.done,
        expiredItems: r.expd,
        expiringWithin30Days: r.e30,
        expiringWithin90Days: r.e90,
        calculatedAt: sql`now()`,
        calculatedBy: 'trinity-ai',
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();
    }
    console.log("[AcmeOps] Compliance scores: 10");
  });

  // ============================================================
  // 4. GUARD TOURS — uses sql.raw() for text[] array column
  // ============================================================
  await seedTable("guard_tours", async () => {
    const tours = [
      { id: "dev-tour-001", cId: "dev-client-001", eId: "dev-acme-emp-004", name: "Riverside Mall Interior Patrol",
        desc: "Full interior circuit covering food court, anchor stores, and all emergency exits.",
        start: "06:00", end: "14:00", days: ["mon","tue","wed","thu","fri","sat","sun"], interval: 45 },
      { id: "dev-tour-002", cId: "dev-client-001", eId: "dev-acme-emp-005", name: "Riverside Mall Parking Patrol",
        desc: "Exterior parking lot sweep covering all 6 sections, handicap zones, and loading docks.",
        start: "14:00", end: "22:00", days: ["mon","tue","wed","thu","fri","sat","sun"], interval: 30 },
      { id: "dev-tour-003", cId: "dev-client-002", eId: "dev-acme-emp-006", name: "Pinnacle Tower Floor Check",
        desc: "Every-other-floor lobby checks, stairwell inspections, and rooftop access verification.",
        start: "07:00", end: "15:00", days: ["mon","tue","wed","thu","fri"], interval: 60 },
      { id: "dev-tour-004", cId: "dev-client-003", eId: "dev-acme-emp-007", name: "Lone Star Medical ER Perimeter",
        desc: "ER entrance, ambulance bay, pharmacy secure area, and ICU corridor patrol.",
        start: "22:00", end: "06:00", days: ["mon","tue","wed","thu","fri","sat","sun"], interval: 30 },
      { id: "dev-tour-005", cId: "dev-client-005", eId: "dev-acme-emp-009", name: "Heritage Bank Vault and ATM Check",
        desc: "Vault room inspection, all ATM locations, and night depository verification.",
        start: "08:00", end: "17:00", days: ["mon","tue","wed","thu","fri"], interval: 120 },
    ];
    for (const t of tours) {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(guardTours).values({
        id: t.id,
        workspaceId: WS,
        name: t.name,
        description: t.desc,
        clientId: t.cId,
        assignedEmployeeId: t.eId,
        status: 'active',
        intervalMinutes: t.interval,
        startTime: t.start,
        endTime: t.end,
        daysOfWeek: t.days,
        createdBy: 'dev-owner-001',
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();
    }
    console.log("[AcmeOps] Guard tours: 5");
  });

  // ============================================================
  // 5. GUARD TOUR CHECKPOINTS
  // ============================================================
  await seedTable("guard_tour_checkpoints", async () => {
    const cps = [
      { id: "dev-cp-001", tId: "dev-tour-001", name: "Main Entrance / Info Desk",        lat: 32.7770, lng: -96.7972, sort: 1, r: 30 },
      { id: "dev-cp-002", tId: "dev-tour-001", name: "Food Court — North End",            lat: 32.7773, lng: -96.7975, sort: 2, r: 30 },
      { id: "dev-cp-003", tId: "dev-tour-001", name: "Anchor Store A — East Wing",        lat: 32.7769, lng: -96.7968, sort: 3, r: 30 },
      { id: "dev-cp-004", tId: "dev-tour-001", name: "Emergency Exit E-3",                lat: 32.7765, lng: -96.7974, sort: 4, r: 20 },
      { id: "dev-cp-005", tId: "dev-tour-001", name: "Jewelry Row — Center Court",        lat: 32.7767, lng: -96.7971, sort: 5, r: 25 },
      { id: "dev-cp-006", tId: "dev-tour-002", name: "Parking Section A — Entry Gate",   lat: 32.7760, lng: -96.7980, sort: 1, r: 40 },
      { id: "dev-cp-007", tId: "dev-tour-002", name: "Handicap Zone — West Lot",         lat: 32.7758, lng: -96.7982, sort: 2, r: 35 },
      { id: "dev-cp-008", tId: "dev-tour-002", name: "Loading Dock — Rear",              lat: 32.7762, lng: -96.7978, sort: 3, r: 40 },
      { id: "dev-cp-009", tId: "dev-tour-003", name: "Lobby Reception — Ground Floor",   lat: 32.7474, lng: -97.3312, sort: 1, r: 30 },
      { id: "dev-cp-010", tId: "dev-tour-003", name: "Stairwell B — 5th Floor Landing",  lat: 32.7475, lng: -97.3310, sort: 2, r: 25 },
      { id: "dev-cp-011", tId: "dev-tour-003", name: "Rooftop Access Door",              lat: 32.7476, lng: -97.3308, sort: 3, r: 20 },
      { id: "dev-cp-012", tId: "dev-tour-004", name: "ER Ambulance Bay",                 lat: 32.7357, lng: -97.1083, sort: 1, r: 40 },
      { id: "dev-cp-013", tId: "dev-tour-004", name: "Pharmacy — Secure Window",         lat: 32.7359, lng: -97.1080, sort: 2, r: 25 },
      { id: "dev-cp-014", tId: "dev-tour-004", name: "ICU Corridor — Nurse Station",     lat: 32.7355, lng: -97.1078, sort: 3, r: 30 },
      { id: "dev-cp-015", tId: "dev-tour-005", name: "Vault Room Access Panel",          lat: 32.7791, lng: -96.8040, sort: 1, r: 15 },
      { id: "dev-cp-016", tId: "dev-tour-005", name: "ATM — Main Lobby",                lat: 32.7793, lng: -96.8038, sort: 2, r: 20 },
      { id: "dev-cp-017", tId: "dev-tour-005", name: "Night Depository — East Side",     lat: 32.7789, lng: -96.8036, sort: 3, r: 20 },
    ];
    for (const cp of cps) {
      // CATEGORY C — Genuine schema mismatch: SQL inserts checkpoint_type column which does not exist in guardTourCheckpoints Drizzle schema
      await typedExec(sql`
        INSERT INTO guard_tour_checkpoints
          (id, tour_id, workspace_id, name, latitude, longitude, sort_order, radius_meters, checkpoint_type, created_at, updated_at)
        VALUES (${cp.id}, ${cp.tId}, ${WS}, ${cp.name}, ${cp.lat}, ${cp.lng}, ${cp.sort}, ${cp.r}, 'checkpoint', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `);
    }
    console.log("[AcmeOps] Guard tour checkpoints: 17");
  });

  // ============================================================
  // 6. GUARD TOUR SCANS — last 48 hours
  // ============================================================
  await seedTable("guard_tour_scans", async () => {
    const scans = [
      { id: "dev-scan-001", tId: "dev-tour-001", cpId: "dev-cp-001", eId: "dev-acme-emp-004", hAgo: 26, lat: 32.7770, lng: -96.7972 },
      { id: "dev-scan-002", tId: "dev-tour-001", cpId: "dev-cp-002", eId: "dev-acme-emp-004", hAgo: 25, lat: 32.7773, lng: -96.7975 },
      { id: "dev-scan-003", tId: "dev-tour-001", cpId: "dev-cp-003", eId: "dev-acme-emp-004", hAgo: 25, lat: 32.7769, lng: -96.7968 },
      { id: "dev-scan-004", tId: "dev-tour-001", cpId: "dev-cp-004", eId: "dev-acme-emp-004", hAgo: 24, lat: 32.7765, lng: -96.7974 },
      { id: "dev-scan-005", tId: "dev-tour-001", cpId: "dev-cp-005", eId: "dev-acme-emp-004", hAgo: 24, lat: 32.7767, lng: -96.7971 },
      { id: "dev-scan-006", tId: "dev-tour-004", cpId: "dev-cp-012", eId: "dev-acme-emp-007", hAgo: 8,  lat: 32.7357, lng: -97.1083 },
      { id: "dev-scan-007", tId: "dev-tour-004", cpId: "dev-cp-013", eId: "dev-acme-emp-007", hAgo: 7,  lat: 32.7359, lng: -97.1080 },
      { id: "dev-scan-008", tId: "dev-tour-004", cpId: "dev-cp-014", eId: "dev-acme-emp-007", hAgo: 7,  lat: 32.7355, lng: -97.1078 },
      { id: "dev-scan-009", tId: "dev-tour-005", cpId: "dev-cp-015", eId: "dev-acme-emp-009", hAgo: 4,  lat: 32.7791, lng: -96.8040 },
      { id: "dev-scan-010", tId: "dev-tour-005", cpId: "dev-cp-016", eId: "dev-acme-emp-009", hAgo: 3,  lat: 32.7793, lng: -96.8038 },
      { id: "dev-scan-011", tId: "dev-tour-005", cpId: "dev-cp-017", eId: "dev-acme-emp-009", hAgo: 3,  lat: 32.7789, lng: -96.8036 },
      { id: "dev-scan-012", tId: "dev-tour-003", cpId: "dev-cp-009", eId: "dev-acme-emp-006", hAgo: 2,  lat: 32.7474, lng: -97.3312 },
      { id: "dev-scan-013", tId: "dev-tour-003", cpId: "dev-cp-010", eId: "dev-acme-emp-006", hAgo: 1,  lat: 32.7475, lng: -97.3310 },
    ];
    for (const s of scans) {
      const scannedAt = new Date();
      scannedAt.setTime(scannedAt.getTime() - s.hAgo * 3600000);
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(guardTourScans).values({
        id: s.id,
        tourId: s.tId,
        checkpointId: s.cpId,
        workspaceId: WS,
        employeeId: s.eId,
        scannedAt: scannedAt,
        latitude: String(s.lat),
        longitude: String(s.lng),
        status: 'completed',
        scanMethod: 'qr_code',
      }).onConflictDoNothing();
    }
    console.log("[AcmeOps] Guard tour scans: 13");
  });

  // ============================================================
  // 7. GPS LOCATIONS — officer pings last 4 hours
  // ============================================================
  await seedTable("gps_locations", async () => {
    const pings = [
      { id: "dev-gps-001", eId: "dev-acme-emp-004", cId: "dev-client-001", hAgo: 3.5 },
      { id: "dev-gps-002", eId: "dev-acme-emp-004", cId: "dev-client-001", hAgo: 3.2 },
      { id: "dev-gps-003", eId: "dev-acme-emp-004", cId: "dev-client-001", hAgo: 2.9 },
      { id: "dev-gps-004", eId: "dev-acme-emp-004", cId: "dev-client-001", hAgo: 2.5 },
      { id: "dev-gps-005", eId: "dev-acme-emp-004", cId: "dev-client-001", hAgo: 2.1 },
      { id: "dev-gps-006", eId: "dev-acme-emp-009", cId: "dev-client-005", hAgo: 2.8 },
      { id: "dev-gps-007", eId: "dev-acme-emp-009", cId: "dev-client-005", hAgo: 2.3 },
      { id: "dev-gps-008", eId: "dev-acme-emp-009", cId: "dev-client-005", hAgo: 1.9 },
      { id: "dev-gps-009", eId: "dev-acme-emp-007", cId: "dev-client-003", hAgo: 1.5 },
      { id: "dev-gps-010", eId: "dev-acme-emp-007", cId: "dev-client-003", hAgo: 1.0 },
      { id: "dev-gps-011", eId: "dev-acme-emp-007", cId: "dev-client-003", hAgo: 0.5 },
      { id: "dev-gps-012", eId: "dev-acme-emp-006", cId: "dev-client-002", hAgo: 1.2 },
      { id: "dev-gps-013", eId: "dev-acme-emp-006", cId: "dev-client-002", hAgo: 0.7 },
    ];
    for (const g of pings) {
      const base = SITE_COORDS[g.cId];
      const ts = new Date();
      ts.setTime(ts.getTime() - g.hAgo * 3600000);
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(gpsLocations).values({
        id: g.id,
        workspaceId: WS,
        employeeId: g.eId,
        latitude: String(jitter(base.lat, 0.0005)),
        longitude: String(jitter(base.lng, 0.0005)),
        timestamp: ts,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();
    }
    console.log("[AcmeOps] GPS locations: 13");
  });

  // ============================================================
  // 8. LONE WORKER SESSIONS
  // ============================================================
  await seedTable("lone_worker_sessions", async () => {
    const sessions = [
      { id: "dev-lw-001", eId: "dev-acme-emp-007", sId: "dev-shift-004", status: "active",  interval: 30, lastCI: ago(0, 0, 25), nextDue: fromNow(0, 5),  lat: 32.7357, lng: -97.1081 },
      { id: "dev-lw-002", eId: "dev-acme-emp-009", sId: "dev-shift-006", status: "active",  interval: 30, lastCI: ago(0, 0, 18), nextDue: fromNow(0, 12), lat: 32.7791, lng: -96.8038 },
      { id: "dev-lw-003", eId: "dev-acme-emp-006", sId: "dev-shift-003", status: "active",  interval: 60, lastCI: ago(0, 0, 45), nextDue: fromNow(0, 15), lat: 32.7474, lng: -97.3310 },
      { id: "dev-lw-004", eId: "dev-acme-emp-010", sId: "dev-shift-007", status: "ended",   interval: 30, lastCI: ago(1, 2),     nextDue: null,           lat: 32.8162, lng: -96.8000 },
      { id: "dev-lw-005", eId: "dev-acme-emp-011", sId: "dev-shift-008", status: "missed",  interval: 30, lastCI: ago(0, 1, 15), nextDue: ago(0, 0, 45), lat: 32.8567, lng: -96.9730 },
    ];
    for (const lw of sessions) {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(loneWorkerSessions).values({
        id: lw.id,
        workspaceId: WS,
        employeeId: lw.eId,
        shiftId: lw.sId,
        status: lw.status,
        checkInInterval: lw.interval,
        lastCheckIn: new Date(lw.lastCI),
        nextCheckInDue: lw.nextDue ? new Date(lw.nextDue) : null,
        latitude: String(lw.lat),
        longitude: String(lw.lng),
        createdAt: sql`now()`,
      }).onConflictDoNothing();
    }
    console.log("[AcmeOps] Lone worker sessions: 5");
  });

  // ============================================================
  // 9. DAR REPORTS
  // ============================================================
  await seedTable("dar_reports", async () => {
    const reports = [
      {
        id: "dev-dar-001", sId: "dev-shift-001", cId: "dev-client-001",
        title: "Mall Patrol — Day Shift Summary",
        summary: "Routine patrol completed. Unauthorized vehicle in fire lane (Section B-7) — removed after verbal warning. All emergency exits clear.",
        content: "06:00 — Shift begin, badge-in verified.\n06:30 — Food court walkthrough, all clear.\n07:15 — Suspicious loitering at entrance E-1, subject moved on voluntarily.\n09:40 — Unauthorized vehicle in fire lane Section B-7. License TX ABC-1234. Verbal warning, vehicle departed at 09:52.\n11:00 — All emergency exits verified clear.\n13:50 — Shift handoff.",
        photos: 3, msgs: 8, daysAgo: 1
      },
      {
        id: "dev-dar-002", sId: "dev-shift-002", cId: "dev-client-001",
        title: "Mall Patrol — Evening Shift Summary",
        summary: "Assisted with shoplifting apprehension at Anchor Store A. Police called and responded. Report filed.",
        content: "14:00 — Shift begin.\n16:30 — Shoplifting at Anchor Store A. Suspect detained by store LP. Assisted with documentation.\n17:05 — DFPD arrived, report #2026-3042 filed.\n21:45 — Final sweep, all clear.\n22:00 — Shift handoff.",
        photos: 5, msgs: 14, daysAgo: 1
      },
      {
        id: "dev-dar-003", sId: "dev-shift-003", cId: "dev-client-002",
        title: "Pinnacle Tower — Day Security Report",
        summary: "Routine lobby security. Issued 3 visitor badges. Denied access to 1 visitor with invalid ID.",
        content: "07:00 — Shift begin.\n08:15 — Visitor badge: FedEx delivery (3 packages).\n09:30 — Suite 1200 meeting, 2 visitor badges issued.\n10:45 — Individual with invalid ID denied access to 8th floor. Logged.\n15:00 — Shift handoff.",
        photos: 1, msgs: 6, daysAgo: 2
      },
      {
        id: "dev-dar-004", sId: "dev-shift-004", cId: "dev-client-003",
        title: "Lone Star Medical — ER Security Report",
        summary: "Assisted ER staff with disruptive patient at 02:15. De-escalated without police contact. All zones secured.",
        content: "22:00 — Shift begin.\n00:30 — Pharmacy check, all secure.\n02:15 — Disruptive patient in ER bay 3. Verbal de-escalation successful. No police contact.\n04:00 — ICU corridor check, quiet.\n06:00 — Shift handoff.",
        photos: 0, msgs: 11, daysAgo: 2
      },
      {
        id: "dev-dar-005", sId: "dev-shift-006", cId: "dev-client-005",
        title: "Heritage Bank — Security Daily Report",
        summary: "Vault check completed. ATM inspection reveals possible card skimmer on ATM-2 — removed, bank notified, incident filed.",
        content: "08:00 — Shift begin.\n08:15 — Vault inspection secure.\n10:30 — ATM-2 tamper evidence on card slot. Possible skimmer. VP Harper notified.\n10:45 — Device removed. ATM taken offline. PD notified.\n17:00 — End of day vault check secure.",
        photos: 4, msgs: 19, daysAgo: 3
      },
      {
        id: "dev-dar-006", sId: "dev-shift-007", cId: "dev-client-006",
        title: "Oakwood Apartments — Night Patrol Report",
        summary: "Noise complaint resolved. Pool area secured. 2 unauthorized vehicles towed.",
        content: "22:00 — Shift begin.\n23:15 — Noise complaint Apt 312. Music reduced after warning.\n00:30 — Pool area — unauthorized entry, lock replaced.\n02:00 — 2 unauthorized vehicles towed per management standing order.\n06:00 — Shift end.",
        photos: 2, msgs: 7, daysAgo: 4
      },
      {
        id: "dev-dar-007", sId: "dev-shift-008", cId: "dev-client-007",
        title: "DFW Logistics — Access Control Daily Report",
        summary: "48 inbound trucks logged. 2 rejected (invalid documentation). No security incidents.",
        content: "06:00 — Shift begin. Gate roster verified.\n09:45 — Truck TX-48821 rejected — bill of lading mismatch.\n11:30 — Truck NM-00432 rejected — driver lacked valid CDL.\n14:00 — Total: 48 trucks, 46 cleared, 2 rejected.",
        photos: 1, msgs: 5, daysAgo: 5
      },
    ];
    for (const r of reports) {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - r.daysAgo);
      const darStatus = (r as any).status ?? 'verified';
      // CATEGORY C — Genuine schema mismatch: SQL omits shiftStartTime and shiftEndTime which are NOT NULL in darReports Drizzle schema
      await typedExec(sql`
        INSERT INTO dar_reports
          (id, workspace_id, shift_id, client_id, title, summary, content, photo_count, message_count, status, created_at, updated_at)
        VALUES (${r.id}, ${WS}, ${r.sId}, ${r.cId}, ${r.title}, ${r.summary}, ${r.content}, ${r.photos}, ${r.msgs}, ${darStatus}, ${createdAt.toISOString()}, ${createdAt.toISOString()})
        ON CONFLICT (id) DO NOTHING
      `);
    }
    // ── Marcus Rodriguez Phase 0 DAR ─────────────────────────────────────────
    const marcusDarContent = `# DAILY ACTIVITY REPORT

**Officer:** Marcus Rodriguez
**Badge:** GC-2024-001
**Date:** March 18, 2026
**Shift:** 08:00 AM – 08:00 PM (12-hour patrol)
**Location:** Downtown Commerce Center — Multi-tenant retail complex
**Client:** Downtown Commerce Center Management

---

## ACTIVITY LOG

**08:00** — Shift commenced. Badge-in verified at security desk. Received briefing from off-going officer. No outstanding issues from overnight shift.

**08:22** — Completed initial walkthrough of all entrances (North, South, East, West). All entrances clear and secure. Emergency exit lighting verified operational.

**09:15** — Two individuals observed loitering near North Entrance. Subjects were approached and asked to move along. Both complied without incident and departed the premises.

**09:48** — Wet floor condition identified near food court fountain (East Wing). No wet floor signage present. Maintenance notified immediately via radio. Hazard area photographically documented. Maintenance confirmed response within 12 minutes.

**10:30** — Report received from store 114 (Foot Locker) of a possible theft in progress. Officer responded immediately. Subject had already exited the premises by time of arrival. Store staff reviewed camera footage; shoplifting event suspected. Management advised to file police report and footage preservation guidance provided.

**11:41** — INCIDENT: Altercation reported in food court between two adult males. Officer responded.

---

## INCIDENT REPORTS

INCIDENT SUMMARY:
Time of incident: 11:41
Location: Food court, center seating area near beverage kiosks
Description: Two adult males engaged in a verbal altercation that escalated to physical shoving. Officer arrived within 2 minutes of initial report.
Persons involved: Male 1 — approximately 30-35 years, 6 feet, 190 lbs, black jacket, jeans. Male 2 — approximately 25-30 years, 5 feet 9 inches, 175 lbs, grey hoodie.
Use of force: None required. Subjects were separated verbally. Both complied with officer instructions.
Police contact: None required. Subjects separated and matter resolved on scene.
Injuries: None observed. Both subjects declined medical attention.
Evidence collected: Officer photographs of incident location post-incident. Foot traffic camera coverage area documented.
Current status: Resolved. Both subjects departed premises separately. No further contact.

Filed by: Marcus Rodriguez
Filed at: March 18, 2026 12:05

---

**12:15** — Resumed patrol following food court incident. All areas clear. Incident area returned to normal operations.

**14:00** — Routine perimeter check completed. All access points secure. No anomalies.

---

## PHOTO DOCUMENTATION

2 photo(s) documented during this shift.

Photo 1 — 09:48: Wet floor hazard area — food court fountain [GPS: 29.42410, -98.49360]
Photo 2 — 12:00: Food court incident location — post-incident clear [GPS: 29.42415, -98.49342]

---

*Report generated: March 18, 2026 20:00*`;

    const marcusPhotoManifest = JSON.stringify([
      { timestamp: '2026-03-18T09:48:00.000Z', url: null, caption: 'Wet floor hazard area — food court fountain', uploaderName: 'Marcus Rodriguez', attachmentType: 'image/jpeg', gps: { lat: 29.4241, lng: -98.4936 } },
      { timestamp: '2026-03-18T12:00:00.000Z', url: null, caption: 'Food court incident location — post-incident clear', uploaderName: 'Marcus Rodriguez', attachmentType: 'image/jpeg', gps: { lat: 29.42415, lng: -98.49342 } }
    ]);

    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(darReports).values({
      id: 'dev-dar-marcus-today',
      workspaceId: WS,
      shiftId: 'dev-shift-marcus-today',
      chatroomId: 'dev-chatroom-marcus-today',
      clientId: 'dev-client-downtown-mall',
      employeeId: 'dev-acme-emp-marcus',
      employeeName: 'Marcus Rodriguez',
      title: 'Daily Activity Report — Marcus Rodriguez — March 18, 2026',
      summary: 'Patrol shift completed. 8 activities logged, 2 photos documented, 1 incident report filed (food court altercation at 11:41 — separated without force). Wet floor hazard identified and maintenance notified. Possible theft at Foot Locker — store LP advised. All areas secure at shift end.',
      content: marcusDarContent,
      photoCount: 2,
      messageCount: 15,
      status: 'pending_review',
      shiftStartTime: new Date('2026-03-18T08:00:00+00:00'),
      shiftEndTime: new Date('2026-03-18T20:00:00+00:00'),
      isAuditProtected: true,
      photoManifest: JSON.parse(marcusPhotoManifest),
      flaggedForReview: true,
      forceUseDetected: false,
      reviewNotes: 'AI Quality Review — 1 item flagged: Incident report filed; supervisor review recommended. No use of force detected. 5W1H completeness verified.',
      trinityArticulated: false,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();
    console.log("[AcmeOps] DAR reports: 8 (7 historical + Marcus Phase 0)");
  });

  // ============================================================
  // 10. BOLO ALERTS
  // ============================================================
  await seedTable("bolo_alerts", async () => {
    const bolos = [
      {
        id: "dev-bolo-001",
        name: "John Doe (unidentified)",
        dob: "approx 1985-1990",
        desc: "Male, approx 5'10\", 180 lbs, brown hair, grey hoodie. Last seen at Riverside Mall food court attempting back-of-house access.",
        reason: "Attempted unauthorized back-of-house access twice in 3 days at Riverside Mall. Potential theft/fraud risk.",
        expires: fromNow(72)
      },
      {
        id: "dev-bolo-002",
        name: "Tamika Wells",
        dob: "1991-07-14",
        desc: "Female, 5'5\", medium build, natural hair. Often wears nurse scrubs. Terminated from Lone Star Medical 2026-02-15.",
        reason: "Observed on hospital premises twice since termination. Badge access revoked. Notify security management if sighted.",
        expires: fromNow(168)
      },
      {
        id: "dev-bolo-003",
        name: "Vehicle TX-LMN-7832 (Blue Dodge Charger)",
        dob: null,
        desc: "2019 Dodge Charger, blue, Texas plate LMN-7832. Associated with ATM skimmer installations in DFW metro.",
        reason: "Identified by Heritage Bank after ATM tampering incident 2026-03-05. DFPD case open. Alert all financial institution sites.",
        expires: fromNow(240)
      },
    ];
    for (const b of bolos) {
      const expiresAt = new Date(b.expires);
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(boloAlerts).values({
        id: b.id,
        workspaceId: WS,
        subjectName: b.name,
        subjectDob: b.dob,
        subjectDescription: b.desc,
        reason: b.reason,
        isActive: true,
        expiresAt: expiresAt,
        createdByName: 'Marcus Rivera',
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();
    }
    console.log("[AcmeOps] BOLO alerts: 3");
  });

  // ============================================================
  // 11. SECURITY INCIDENTS
  // ============================================================
  await seedTable("security_incidents", async () => {
    const incidents = [
      { id: "dev-inc-001", eId: "dev-acme-emp-005",
        desc: "Shoplifting at Riverside Mall Anchor Store A. Suspect detained by store LP. DFPD called, report #2026-3042.",
        loc: "Riverside Shopping Center — Anchor Store A (East Wing)", dAgo: 1, rAgo: 1 },
      { id: "dev-inc-002", eId: "dev-acme-emp-007",
        desc: "Disruptive patient in ER bay 3 at Lone Star Medical. Verbal de-escalation successful — no police contact required.",
        loc: "Lone Star Medical Center — Emergency Room Bay 3", dAgo: 2, rAgo: 2 },
      { id: "dev-inc-003", eId: "dev-acme-emp-009",
        desc: "Possible ATM skimmer device detected on ATM-2 at Heritage National Bank parking lot. Device removed, ATM offline. DFPD case open.",
        loc: "Heritage National Bank — Parking Lot ATM-2", dAgo: 3, rAgo: null },
      { id: "dev-inc-004", eId: "dev-acme-emp-004",
        desc: "Unknown male attempted unauthorized back-of-house access at Riverside Mall food court service corridor. Escorted out. Returned next day — BOLO issued.",
        loc: "Riverside Shopping Center — Food Court Service Corridor", dAgo: 5, rAgo: null },
      { id: "dev-inc-005", eId: "dev-acme-emp-006",
        desc: "Visitor denied access at Pinnacle Tower — expired ID. Became verbally confrontational before leaving voluntarily.",
        loc: "Pinnacle Tower — Main Lobby", dAgo: 2, rAgo: 2 },
    ];
    for (const inc of incidents) {
      const reportedAt = new Date();
      reportedAt.setDate(reportedAt.getDate() - inc.dAgo);
      const resolvedAt = inc.rAgo != null
        ? (() => { const d = new Date(); d.setDate(d.getDate() - inc.rAgo!); return d.toISOString(); })()
        : null;
      // CATEGORY C — Genuine schema mismatch: SQL omits type (securityIncidentTypeEnum) and severity (securityIncidentSeverityEnum) which are NOT NULL in securityIncidents Drizzle schema
      await typedExec(sql`
        INSERT INTO security_incidents
          (id, workspace_id, employee_id, description, location, reported_at, resolved_at, created_at, updated_at)
        VALUES (${inc.id}, ${WS}, ${inc.eId}, ${inc.desc}, ${inc.loc}, ${reportedAt.toISOString()}, ${resolvedAt}, ${reportedAt.toISOString()}, ${reportedAt.toISOString()})
        ON CONFLICT (id) DO NOTHING
      `);
    }
    console.log("[AcmeOps] Security incidents: 5");
  });

  // ============================================================
  // 12. RMS CASES
  // ============================================================
  await seedTable("rms_cases", async () => {
    const cases = [
      { id: "dev-rms-001", num: "RMS-2026-0043", type: "theft",      pri: "high",   title: "Shoplifting — Riverside Mall Anchor Store A",
        desc: "Organized retail crime. Suspect apprehended by LP. DFPD involved. Merchandise value ~$840.",
        status: "open",   assignTo: "dev-acme-emp-002", reportBy: "dev-acme-emp-005", cId: "dev-client-001" },
      { id: "dev-rms-002", num: "RMS-2026-0042", type: "fraud",      pri: "high",   title: "ATM Skimmer Device — Heritage Bank Parking Lot",
        desc: "Skimmer device on ATM-2. Removed. DFPD case #2026-1891. Bank forensics requested.",
        status: "open",   assignTo: "dev-acme-emp-001", reportBy: "dev-acme-emp-009", cId: "dev-client-005" },
      { id: "dev-rms-003", num: "RMS-2026-0039", type: "trespass",   pri: "medium", title: "Unauthorized Access Attempts — Riverside Mall",
        desc: "Male subject attempted back-of-house access twice in 3 days. BOLO issued. Mall management notified.",
        status: "open",   assignTo: "dev-acme-emp-002", reportBy: "dev-acme-emp-004", cId: "dev-client-001" },
      { id: "dev-rms-004", num: "RMS-2026-0038", type: "trespass",   pri: "medium", title: "Terminated Employee Trespass — Lone Star Medical",
        desc: "Former employee Tamika Wells observed on premises twice after termination. BOLO issued.",
        status: "open",   assignTo: "dev-acme-emp-003", reportBy: "dev-acme-emp-007", cId: "dev-client-003" },
      { id: "dev-rms-005", num: "RMS-2026-0031", type: "disturbance",pri: "low",    title: "After-Hours Noise Complaint — Oakwood Apartments",
        desc: "Tenant in Unit 312 cited for noise. Resolved via verbal warning. 2 vehicles towed.",
        status: "closed", assignTo: "dev-acme-emp-003", reportBy: "dev-acme-emp-010", cId: "dev-client-006" },
    ];
    for (const c of cases) {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(rmsCases).values({
        id: c.id,
        workspaceId: WS,
        caseNumber: c.num,
        caseType: c.type,
        title: c.title,
        description: c.desc,
        status: c.status,
        priority: c.pri,
        assignedTo: c.assignTo,
        reportedBy: c.reportBy,
        clientId: c.cId,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();
    }
    console.log("[AcmeOps] RMS cases: 5");
  });

  // ============================================================
  // 13. POST ORDER TEMPLATES
  // ============================================================
  await seedTable("post_order_templates", async () => {
    const orders = [
      { id: "dev-po-001", title: "Riverside Mall — Standard Post Orders",
        desc: "All security personnel assigned to Riverside Mall must follow these standing orders for every shift.",
        pri: "high", reqAck: true, reqSig: true, reqPhoto: false, by: "dev-owner-001" },
      { id: "dev-po-002", title: "Lone Star Medical — Hospital Security Protocol",
        desc: "HIPAA-compliant security protocols for all hospital assignments. Patient interaction guidelines and incident escalation paths.",
        pri: "critical", reqAck: true, reqSig: true, reqPhoto: false, by: "dev-owner-001" },
      { id: "dev-po-003", title: "Heritage Bank — Financial Security Standing Orders",
        desc: "Bank-specific orders covering vault inspection, ATM verification, and cash-handling security.",
        pri: "critical", reqAck: true, reqSig: true, reqPhoto: true, by: "dev-manager-001" },
      { id: "dev-po-004", title: "DFW Logistics — Warehouse Access Control SOP",
        desc: "Gate access verification, truck documentation requirements, manifest audit, and emergency lockdown protocol.",
        pri: "high", reqAck: true, reqSig: false, reqPhoto: false, by: "dev-manager-002" },
      { id: "dev-po-005", title: "General Field Operations — All Sites",
        desc: "Universal field operations: lone-worker check-ins, incident reporting, equipment checks, and radio protocol.",
        pri: "normal", reqAck: true, reqSig: false, reqPhoto: false, by: "dev-owner-001" },
    ];
    for (const o of orders) {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(postOrderTemplates).values({
        id: o.id,
        workspaceId: WS,
        title: o.title,
        description: o.desc,
        priority: o.pri as any,
        requiresAcknowledgment: o.reqAck,
        requiresSignature: o.reqSig,
        requiresPhotos: o.reqPhoto,
        isActive: true,
        createdBy: o.by,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();
    }
    console.log("[AcmeOps] Post order templates: 5");
  });

  // ============================================================
  // 14. ESCALATION CHAINS
  // ============================================================
  await seedTable("escalation_chains", async () => {
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(escalationChains).values({
      id: 'dev-esc-001',
      workspaceId: WS,
      currentTier: 2,
      unfilledPositions: 1,
      totalPositions: 3,
      startedAt: new Date(ago(0, 2)),
      lastEscalatedAt: new Date(ago(0, 1)),
      notifiedEmployeeIds: ['dev-acme-emp-010', 'dev-acme-emp-012'],
      notifiedManagerIds: ['dev-acme-emp-003'],
      status: 'active',
    }).onConflictDoNothing();
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(escalationChains).values({
      id: 'dev-esc-002',
      workspaceId: WS,
      currentTier: 1,
      unfilledPositions: 2,
      totalPositions: 4,
      startedAt: new Date(ago(1)),
      lastEscalatedAt: new Date(ago(1)),
      notifiedEmployeeIds: ['dev-acme-emp-004', 'dev-acme-emp-006'],
      notifiedManagerIds: ['dev-acme-emp-002'],
      status: 'resolved',
    }).onConflictDoNothing();
    console.log("[AcmeOps] Escalation chains: 2");
  });

  // ============================================================
  // 15. AUTOMATION EXECUTIONS (Acme workspace job history)
  //     id is uuid auto-generated; use count check for idempotency
  // ============================================================
  await seedTable("automation_executions", async () => {
    // CATEGORY C — Raw SQL retained: Count( | Tables: automation_executions | Verified: 2026-03-23
    const existCount = await typedCount(sql`
      SELECT COUNT(*) as count FROM automation_executions WHERE workspace_id = ${WS}
    `);
    if (existCount >= 15) {
      console.log("[AcmeOps] Automation executions (Acme): already seeded — skipped");
      return;
    }
    const runs = [
      { type: "shift_coverage_scan",      name: "Shift Coverage Scan",          status: "completed", triggeredBy: "system", dAgo: 0, hAgo: 1 },
      { type: "gps_inactivity_check",     name: "GPS Inactivity Check",          status: "completed", triggeredBy: "system", dAgo: 0, hAgo: 1 },
      { type: "compliance_score_refresh", name: "Compliance Score Refresh",      status: "completed", triggeredBy: "trinity-ai", dAgo: 0, hAgo: 2 },
      { type: "lone_worker_checkin_scan", name: "Lone Worker Check-In Scan",     status: "completed", triggeredBy: "system", dAgo: 0, hAgo: 0 },
      { type: "overtime_alert_check",     name: "Overtime Alert Check",          status: "completed", triggeredBy: "system", dAgo: 0, hAgo: 3 },
      { type: "shift_coverage_scan",      name: "Shift Coverage Scan",          status: "completed", triggeredBy: "system", dAgo: 1, hAgo: 0 },
      { type: "gps_inactivity_check",     name: "GPS Inactivity Check",          status: "completed", triggeredBy: "system", dAgo: 1, hAgo: 1 },
      { type: "invoice_auto_generate",    name: "Invoice Auto Generate",         status: "completed", triggeredBy: "trinity-ai", dAgo: 1, hAgo: 6 },
      { type: "scheduling_gap_analysis",  name: "Scheduling Gap Analysis",       status: "completed", triggeredBy: "trinity-ai", dAgo: 2, hAgo: 0 },
      { type: "compliance_score_refresh", name: "Compliance Score Refresh",      status: "completed", triggeredBy: "trinity-ai", dAgo: 2, hAgo: 2 },
      { type: "shift_coverage_scan",      name: "Shift Coverage Scan",          status: "failed",    triggeredBy: "system", dAgo: 2, hAgo: 8 },
      { type: "lone_worker_checkin_scan", name: "Lone Worker Check-In Scan",     status: "completed", triggeredBy: "system", dAgo: 3, hAgo: 0 },
      { type: "payroll_pre_check",        name: "Payroll Pre-Check",             status: "completed", triggeredBy: "trinity-ai", dAgo: 5, hAgo: 0 },
      { type: "overtime_alert_check",     name: "Overtime Alert Check",          status: "completed", triggeredBy: "system", dAgo: 6, hAgo: 0 },
      { type: "scheduling_gap_analysis",  name: "Scheduling Gap Analysis",       status: "completed", triggeredBy: "trinity-ai", dAgo: 7, hAgo: 0 },
    ];
    for (const ae of runs) {
      const runAt = new Date();
      runAt.setDate(runAt.getDate() - ae.dAgo);
      runAt.setHours(runAt.getHours() - ae.hAgo);
      await db.insert(automationExecutions).values({
        workspaceId: WS,
        actionType: ae.type,
        actionName: ae.name,
        status: ae.status,
        triggeredBy: ae.triggeredBy,
        triggerSource: 'scheduled',
        queuedAt: runAt.toISOString(),
        startedAt: runAt.toISOString(),
        completedAt: ae.status === 'failed' ? null : runAt.toISOString(),
      });
    }
    console.log("[AcmeOps] Automation executions (Acme): 15");
  });

  // ============================================================
  // 16. SHIFT OFFERS — marketplace offers for open shifts
  // ============================================================
  await seedTable("shift_offers", async () => {
    // CATEGORY C — Raw SQL retained: IS NULL | Tables: shifts | Verified: 2026-03-23
    const openResult = await typedQuery(sql`
      SELECT id FROM shifts
      WHERE workspace_id = ${WS} AND (status = 'open' OR employee_id IS NULL)
      ORDER BY start_time ASC LIMIT 4
    `);
    const openIds = (openResult as any[]).map(r => r.id);
    if (openIds.length === 0) {
      console.log("[AcmeOps] Shift offers: 0 (no open shifts found)");
      return;
    }
    const offerEmps = ["dev-acme-emp-004", "dev-acme-emp-005", "dev-acme-emp-009", "dev-acme-emp-010"];
    for (let i = 0; i < openIds.length; i++) {
      const offerId = `dev-so-${String(i + 1).padStart(3, "0")}`;
      const srId = `dev-sr-${String(i + 1).padStart(3, "0")}`;
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(shiftOffers).values({
        id: offerId,
        workspaceId: WS,
        shiftId: openIds[i],
        shiftRequestId: srId,
        contractorId: offerEmps[i % offerEmps.length],
        offeredPayRate: '22.50',
        matchScore: '87.5',
        status: 'pending',
        sentAt: sql`now()`,
        expiresAt: new Date(fromNow(24)),
      }).onConflictDoNothing();
    }
    console.log(`[AcmeOps] Shift offers: ${openIds.length}`);
  });

  console.log("[AcmeOps] Acme operational data seed complete!");
  return {
    success: true,
    message: "Acme operational data seeded: guard tours + checkpoints + scans, GPS, DAR reports, BOLOs, incidents, compliance scores, payroll info, RMS cases, post orders, lone worker sessions, escalation chains, automation executions"
  };
}

/**
 * FUTURE SHIFT POOL REPORTER
 * Reports how many future open shifts exist for Trinity to process.
 * DATA SAFETY: Never mutates shift dates or deletes any data.
 * All seeded and user/automation-created shifts persist exactly as stored.
 * Trinity's scheduling daemon will generate new shifts when the pool is low.
 */
export async function ensureFutureOpenShifts(): Promise<void> {
  try {
    // CATEGORY C — Raw SQL retained: Count( | Tables: shifts | Verified: 2026-03-23
    const count = await typedCount(sql`
      SELECT COUNT(*)::int AS cnt
      FROM shifts
      WHERE workspace_id = ${WS}
        AND employee_id IS NULL
        AND status NOT IN ('cancelled', 'draft')
        AND start_time >= NOW()
    `);
    if (count >= 10) {
      console.log(`[AcmeOps] Future open shifts: ${count} — pool healthy`);
    } else {
      console.log(`[AcmeOps] Future open shifts: ${count} — Trinity scheduling daemon will generate more as needed`);
    }
    // No mutations: shift start_time/end_time are never altered by this function.
    // Seeded data and Trinity-created data persist exactly as written to the DB.
  } catch (err) {
    console.error("[AcmeOps] ensureFutureOpenShifts error:", (err as Error).message);
  }
}
