/**
 * ANVIL SECURITY GROUP — OPERATIONAL DATA SEED
 * Shifts, time entries, payroll runs, pay stubs, invoices,
 * guard tours, lone worker sessions. Idempotent.
 * Sentinel: guard_tours.id = 'anvil-tour-001'
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { typedExec, typedQuery } from '../lib/typedSql';
import {
  managerAssignments,
  shifts,
  timeEntries,
  payrollRuns,
  payrollEntries,
  payStubs,
  invoices,
  guardTours,
  guardTourCheckpoints,
  loneWorkerSessions,
} from "@shared/schema";

const WS = "dev-anvil-security-ws";

function daysAgo(d: number, h = 0): string {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  dt.setHours(dt.getHours() - h, 0, 0, 0);
  return dt.toISOString();
}
function daysFromNow(d: number, h = 0): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  dt.setHours(h, 0, 0, 0);
  return dt.toISOString();
}

async function seedTable(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[AnvilOps] ERROR seeding ${name}:`, (err as Error).message);
  }
}

export async function runAnvilOperationalSeed(): Promise<{ success: boolean; message: string }> {
  const { isProduction } = await import('../lib/isProduction');
  if (isProduction()) return { success: true, message: "Skipped — production" };

  // CATEGORY C — Raw SQL retained: LIMIT | Tables: guard_tours | Verified: 2026-03-23
  const check = await typedQuery(sql`SELECT id FROM guard_tours WHERE id = 'anvil-tour-001' LIMIT 1`);
  if (check.length > 0) {
    return { success: true, message: "Anvil operational data already seeded — skipped" };
  }

  console.log("[AnvilOps] Seeding Anvil operational data...");

  // =====================================================================
  // 1. MANAGER ASSIGNMENTS
  // =====================================================================
  await seedTable("manager_assignments", async () => {
    const rows = [
      { id: "anvil-ma-001", mgr: "anvil-e-002", emp: "anvil-e-003" },
      { id: "anvil-ma-002", mgr: "anvil-e-002", emp: "anvil-e-004" },
      { id: "anvil-ma-003", mgr: "anvil-e-002", emp: "anvil-e-005" },
      { id: "anvil-ma-004", mgr: "anvil-e-002", emp: "anvil-e-006" },
      { id: "anvil-ma-005", mgr: "anvil-e-002", emp: "anvil-e-007" },
      { id: "anvil-ma-006", mgr: "anvil-e-002", emp: "anvil-e-008" },
      { id: "anvil-ma-007", mgr: "anvil-e-002", emp: "anvil-e-009" },
      { id: "anvil-ma-008", mgr: "anvil-e-002", emp: "anvil-e-010" },
      { id: "anvil-ma-009", mgr: "anvil-e-002", emp: "anvil-e-011" },
      { id: "anvil-ma-010", mgr: "anvil-e-002", emp: "anvil-e-012" },
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
  });

  // =====================================================================
  // 2. PAST SHIFTS (3 weeks historical) — completed
  // =====================================================================
  await seedTable("past_shifts", async () => {
    type Shift = { id: string; emp: string; client: string; title: string; daysAgo: number; startH: number; endH: number };
    const pastShifts: Shift[] = [];
    const schedule = [
      { emp: "anvil-e-003", client: "anvil-c-001", title: "SA Medical Center — Day Patrol",        startH: 6,  endH: 14 },
      { emp: "anvil-e-004", client: "anvil-c-001", title: "SA Medical Center — Evening Patrol",     startH: 14, endH: 22 },
      { emp: "anvil-e-005", client: "anvil-c-002", title: "Riverwalk Hotel — Lobby Security",       startH: 7,  endH: 15 },
      { emp: "anvil-e-006", client: "anvil-c-002", title: "Riverwalk Hotel — Night Security",       startH: 22, endH: 6  },
      { emp: "anvil-e-007", client: "anvil-c-003", title: "Pearl District — Gate Access Control",   startH: 8,  endH: 16 },
      { emp: "anvil-e-008", client: "anvil-c-004", title: "Frost Bank Tower — Lobby Post",          startH: 6,  endH: 14 },
      { emp: "anvil-e-009", client: "anvil-c-004", title: "Frost Bank Tower — Armed Post",          startH: 14, endH: 22 },
      { emp: "anvil-e-010", client: "anvil-c-005", title: "SAT Airport Parking — Day Patrol",       startH: 6,  endH: 14 },
      { emp: "anvil-e-011", client: "anvil-c-006", title: "UTSA Campus — Student Center Post",      startH: 8,  endH: 16 },
      { emp: "anvil-e-012", client: "anvil-c-006", title: "UTSA Campus — Evening Patrol",           startH: 16, endH: 24 },
    ];
    let shiftIdx = 0;
    for (let day = 21; day >= 1; day--) {
      for (const s of schedule) {
        if (Math.random() < 0.85) {
          shiftIdx++;
          pastShifts.push({ id: `anvil-sh-p-${String(shiftIdx).padStart(3,"0")}`, ...s, daysAgo: day });
        }
      }
    }
    for (const s of pastShifts) {
      const start = daysAgo(s.daysAgo, -(s.startH));
      const end   = daysAgo(s.daysAgo, -(s.endH));
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(shifts).values({
        id: s.id,
        workspaceId: WS,
        employeeId: s.emp,
        clientId: s.client,
        title: s.title,
        startTime: sql`${start}::timestamptz`,
        endTime: sql`${end}::timestamptz`,
        status: 'completed',
        billableToClient: true,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();
    }
  });

  // =====================================================================
  // 3. FUTURE SHIFTS (2 weeks) — open and assigned
  // =====================================================================
  await seedTable("future_shifts", async () => {
    const futureSchedule = [
      { emp: "anvil-e-003", client: "anvil-c-001", title: "SA Medical Center — Day Patrol",      startH: 6,  endH: 14 },
      { emp: "anvil-e-004", client: "anvil-c-001", title: "SA Medical Center — Evening Patrol",   startH: 14, endH: 22 },
      { emp: "anvil-e-005", client: "anvil-c-002", title: "Riverwalk Hotel — Lobby Security",     startH: 7,  endH: 15 },
      { emp: null,          client: "anvil-c-002", title: "Riverwalk Hotel — Night Security [OPEN]", startH: 22, endH: 6  },
      { emp: "anvil-e-007", client: "anvil-c-003", title: "Pearl District — Gate Access Control", startH: 8,  endH: 16 },
      { emp: "anvil-e-009", client: "anvil-c-004", title: "Frost Bank Tower — Armed Post",        startH: 14, endH: 22 },
      { emp: null,          client: "anvil-c-004", title: "Frost Bank Tower — Lobby Post [OPEN]", startH: 6,  endH: 14 },
      { emp: "anvil-e-010", client: "anvil-c-005", title: "SAT Airport Parking — Day Patrol",    startH: 6,  endH: 14 },
      { emp: "anvil-e-011", client: "anvil-c-006", title: "UTSA Campus — Student Center Post",   startH: 8,  endH: 16 },
    ];
    let idx = 0;
    for (let day = 1; day <= 14; day++) {
      for (const s of futureSchedule) {
        idx++;
        const id = `anvil-sh-f-${String(idx).padStart(3,"0")}`;
        const start = daysFromNow(day, s.startH);
        const end   = daysFromNow(day, s.endH);
        const status = s.emp ? "assigned" : "open";
        // Converted to Drizzle ORM: ON CONFLICT
        await db.insert(shifts).values({
          id,
          workspaceId: WS,
          employeeId: s.emp,
          clientId: s.client,
          title: s.title,
          startTime: sql`${start}::timestamptz`,
          endTime: sql`${end}::timestamptz`,
          status: status as any,
          billableToClient: true,
          createdAt: sql`now()`,
          updatedAt: sql`now()`,
        }).onConflictDoNothing();
      }
    }
  });

  // =====================================================================
  // 4. TIME ENTRIES (past 3 weeks, matching completed shifts)
  // =====================================================================
  await seedTable("time_entries", async () => {
    const empClientPairs = [
      { emp: "anvil-e-003", client: "anvil-c-001", startH: 6,  endH: 14, hours: 8   },
      { emp: "anvil-e-004", client: "anvil-c-001", startH: 14, endH: 22, hours: 8   },
      { emp: "anvil-e-005", client: "anvil-c-002", startH: 7,  endH: 15, hours: 8   },
      { emp: "anvil-e-007", client: "anvil-c-003", startH: 8,  endH: 16, hours: 8   },
      { emp: "anvil-e-008", client: "anvil-c-004", startH: 6,  endH: 14, hours: 8   },
      { emp: "anvil-e-009", client: "anvil-c-004", startH: 14, endH: 22, hours: 8   },
      { emp: "anvil-e-010", client: "anvil-c-005", startH: 6,  endH: 14, hours: 8   },
      { emp: "anvil-e-011", client: "anvil-c-006", startH: 8,  endH: 16, hours: 8   },
    ];
    let idx = 0;
    for (let day = 21; day >= 1; day--) {
      for (const ec of empClientPairs) {
        if (Math.random() < 0.85) {
          idx++;
          const clockIn  = daysAgo(day, -(ec.startH));
          const clockOut = daysAgo(day, -(ec.endH));
          // Converted to Drizzle ORM: ON CONFLICT
          await db.insert(timeEntries).values({
            id: "anvil-te-" + String(idx).padStart(4,"0"),
            workspaceId: WS,
            employeeId: ec.emp,
            clientId: ec.client,
            clockIn: sql`${clockIn}::timestamptz`,
            clockOut: sql`${clockOut}::timestamptz`,
            totalHours: String(ec.hours),
            billableToClient: true,
            status: 'approved',
            createdAt: sql`now()`,
            updatedAt: sql`now()`,
          }).onConflictDoNothing();
        }
      }
    }
  });

  // =====================================================================
  // 5. PAYROLL RUNS (2 completed + 1 pending)
  // =====================================================================
  await seedTable("payroll_runs", async () => {
    const runs = [
      {
        id: "anvil-pr-001",
        start: daysAgo(35), end: daysAgo(22),
        status: "processed" as const,
        gross: "14320.00", taxes: "2864.00", net: "11456.00",
        processedBy: "anvil-owner-001", approvedBy: "anvil-owner-001",
      },
      {
        id: "anvil-pr-002",
        start: daysAgo(21), end: daysAgo(8),
        status: "processed" as const,
        gross: "13890.00", taxes: "2778.00", net: "11112.00",
        processedBy: "anvil-owner-001", approvedBy: "anvil-owner-001",
      },
      {
        id: "anvil-pr-003",
        start: daysAgo(7),  end: daysAgo(1),
        status: "pending" as const,
        gross: "7420.00",  taxes: "0.00",    net: "0.00",
        processedBy: null, approvedBy: null,
      },
    ];
    for (const r of runs) {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(payrollRuns).values({
        id: r.id,
        workspaceId: WS,
        periodStart: sql`${r.start}::timestamptz`,
        periodEnd: sql`${r.end}::timestamptz`,
        status: r.status,
        totalGrossPay: r.gross,
        totalTaxes: r.taxes,
        totalNetPay: r.net,
        processedBy: r.processedBy,
        processedAt: r.status === "processed" ? sql`${daysAgo(1)}::timestamptz` : null,
        approvedBy: r.approvedBy,
        approvedAt: r.status === "processed" ? sql`${daysAgo(2)}::timestamptz` : null,
        paymentSchedule: 'bi-weekly',
        runType: 'regular',
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();
    }
  });

  // =====================================================================
  // 6. PAYROLL ENTRIES
  // =====================================================================
  await seedTable("payroll_entries", async () => {
    const empRates: Record<string, string> = {
      "anvil-e-003": "22.50",
      "anvil-e-004": "21.00",
      "anvil-e-005": "20.50",
      "anvil-e-006": "24.00",
      "anvil-e-007": "23.00",
      "anvil-e-008": "19.00",
      "anvil-e-009": "28.00",
      "anvil-e-010": "18.00",
      "anvil-e-011": "21.50",
      "anvil-e-012": "20.00",
    };
    let idx = 0;
    for (const runId of ["anvil-pr-001", "anvil-pr-002", "anvil-pr-003"]) {
      for (const [empId, rate] of Object.entries(empRates)) {
        idx++;
        const rateN = parseFloat(rate);
        const regHrs = runId === "anvil-pr-003" ? 40 : 80;
        const otHrs  = Math.random() < 0.3 ? 4 : 0;
        const gross  = +(rateN * regHrs + rateN * 1.5 * otHrs).toFixed(2);
        const fedTax = +(gross * 0.12).toFixed(2);
        const stTax  = +(gross * 0.0625).toFixed(2);
        const ss     = +(gross * 0.062).toFixed(2);
        const med    = +(gross * 0.0145).toFixed(2);
        const net    = +(gross - fedTax - stTax - ss - med).toFixed(2);
        // Converted to Drizzle ORM: ON CONFLICT
        await db.insert(payrollEntries).values({
          id: "anvil-pe-" + String(idx).padStart(4,"0"),
          payrollRunId: runId,
          employeeId: empId,
          workspaceId: WS,
          regularHours: String(regHrs),
          overtimeHours: String(otHrs),
          hourlyRate: rate,
          grossPay: String(gross),
          federalTax: String(fedTax),
          stateTax: String(stTax),
          socialSecurity: String(ss),
          medicare: String(med),
          netPay: String(net),
          createdAt: sql`now()`,
          updatedAt: sql`now()`,
        }).onConflictDoNothing();
      }
    }
  });

  // =====================================================================
  // 7. PAY STUBS (for the two processed payroll runs)
  // =====================================================================
  await seedTable("pay_stubs", async () => {
    const empRates: Record<string, string> = {
      "anvil-e-003": "22.50", "anvil-e-004": "21.00", "anvil-e-005": "20.50",
      "anvil-e-006": "24.00", "anvil-e-007": "23.00", "anvil-e-008": "19.00",
      "anvil-e-009": "28.00", "anvil-e-010": "18.00", "anvil-e-011": "21.50",
      "anvil-e-012": "20.00",
    };
    const processedRuns = [
      { runId: "anvil-pr-001", start: daysAgo(35), end: daysAgo(22), payDate: daysAgo(19) },
      { runId: "anvil-pr-002", start: daysAgo(21), end: daysAgo(8),  payDate: daysAgo(5)  },
    ];
    let idx = 0;
    for (const run of processedRuns) {
      for (const [empId, rate] of Object.entries(empRates)) {
        idx++;
        const rateN   = parseFloat(rate);
        const gross   = +(rateN * 80).toFixed(2);
        const fedTax  = +(gross * 0.12).toFixed(2);
        const stTax   = +(gross * 0.0625).toFixed(2);
        const ss      = +(gross * 0.062).toFixed(2);
        const med     = +(gross * 0.0145).toFixed(2);
        const totalDed= +(fedTax + stTax + ss + med).toFixed(2);
        const net     = +(gross - totalDed).toFixed(2);
        const deductions = { federalTax: fedTax, stateTax: stTax, socialSecurity: ss, medicare: med };
        const earnings   = { regularPay: gross };
        // Converted to Drizzle ORM: ON CONFLICT
        await db.insert(payStubs).values({
          id: "anvil-stub-" + String(idx).padStart(4,"0"),
          workspaceId: WS,
          payrollRunId: run.runId,
          employeeId: empId,
          payPeriodStart: sql`${run.start}::timestamptz`,
          payPeriodEnd: sql`${run.end}::timestamptz`,
          payDate: sql`${run.payDate}::timestamptz`,
          grossPay: String(gross),
          totalDeductions: String(totalDed),
          netPay: String(net),
          deductionsBreakdown: deductions,
          earningsBreakdown: earnings,
          status: 'generated',
          createdAt: sql`now()`,
          updatedAt: sql`now()`,
        }).onConflictDoNothing();
      }
    }
  });

  // =====================================================================
  // 8. INVOICES
  // =====================================================================
  await seedTable("invoices", async () => {
    const invs = [
      { id: "anvil-inv-001", client: "anvil-c-001", num: "INV-ANV-2026-001", subtotal: "9856.00",  total: "9856.00",  status: "paid" as const,  paid: daysAgo(20), due: daysAgo(22), sent: daysAgo(30) },
      { id: "anvil-inv-002", client: "anvil-c-002", num: "INV-ANV-2026-002", subtotal: "7392.00",  total: "7392.00",  status: "paid" as const,  paid: daysAgo(6),  due: daysAgo(8),  sent: daysAgo(15) },
      { id: "anvil-inv-003", client: "anvil-c-004", num: "INV-ANV-2026-003", subtotal: "12480.00", total: "12480.00", status: "sent" as const,  paid: null as string | null,         due: daysFromNow(7),  sent: daysAgo(5) },
      { id: "anvil-inv-004", client: "anvil-c-006", num: "INV-ANV-2026-004", subtotal: "8928.00",  total: "8928.00",  status: "draft" as const, paid: null as string | null,         due: daysFromNow(14), sent: null as string | null },
    ];
    for (const inv of invs) {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(invoices).values({
        id: inv.id,
        workspaceId: WS,
        clientId: inv.client,
        invoiceNumber: inv.num,
        issueDate: sql`now()`,
        dueDate: sql`${inv.due}::timestamptz`,
        subtotal: inv.subtotal,
        taxRate: "0.00",
        taxAmount: "0.00",
        total: inv.total,
        status: inv.status,
        paidAt: inv.paid ? sql`${inv.paid}::timestamptz` : null,
        sentAt: inv.sent ? sql`${inv.sent}::timestamptz` : null,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();
    }
  });

  // =====================================================================
  // 9. GUARD TOURS + CHECKPOINTS
  // =====================================================================
  await seedTable("guard_tours", async () => {
    const tours = [
      { id: "anvil-tour-001", name: "SA Medical Center — Full Perimeter", client: "anvil-c-001", emp: "anvil-e-003", site: "4502 Medical Dr, San Antonio TX", lat: 29.4941, lng: -98.5743 },
      { id: "anvil-tour-002", name: "Frost Bank Tower — Interior Tour",   client: "anvil-c-004", emp: "anvil-e-009", site: "100 W Houston St, San Antonio TX",  lat: 29.4246, lng: -98.4937 },
    ];
    for (const t of tours) {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(guardTours).values({
        id: t.id,
        workspaceId: WS,
        name: t.name,
        clientId: t.client,
        assignedEmployeeId: t.emp,
        siteAddress: t.site,
        status: 'active',
        intervalMinutes: 120,
        startTime: '06:00',
        endTime: '22:00',
        daysOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
        createdBy: 'anvil-e-001',
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();
    }

    const checkpoints = [
      { id: "anvil-cp-001", tour: "anvil-tour-001", name: "Main Entrance",         lat: "29.4943", lng: "-98.5741", ord: 1 },
      { id: "anvil-cp-002", tour: "anvil-tour-001", name: "ER Bay",                lat: "29.4939", lng: "-98.5748", ord: 2 },
      { id: "anvil-cp-003", tour: "anvil-tour-001", name: "Parking Garage Level 1", lat: "29.4936", lng: "-98.5752", ord: 3 },
      { id: "anvil-cp-004", tour: "anvil-tour-001", name: "Back Loading Dock",      lat: "29.4933", lng: "-98.5745", ord: 4 },
      { id: "anvil-cp-005", tour: "anvil-tour-002", name: "Ground Floor Lobby",     lat: "29.4247", lng: "-98.4939", ord: 1 },
      { id: "anvil-cp-006", tour: "anvil-tour-002", name: "Parking Level B1",       lat: "29.4244", lng: "-98.4941", ord: 2 },
      { id: "anvil-cp-007", tour: "anvil-tour-002", name: "Rooftop Access",         lat: "29.4249", lng: "-98.4935", ord: 3 },
    ];
    for (const cp of checkpoints) {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(guardTourCheckpoints).values({
        id: cp.id,
        tourId: cp.tour,
        workspaceId: WS,
        name: cp.name,
        latitude: cp.lat,
        longitude: cp.lng,
        sortOrder: cp.ord,
        qrCode: "QR-" + cp.id.toUpperCase(),
        radiusMeters: 30,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();
    }
  });

  // =====================================================================
  // 10. LONE WORKER SESSIONS
  // =====================================================================
  await seedTable("lone_worker_sessions", async () => {
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(loneWorkerSessions).values({
      id: 'anvil-lw-001',
      workspaceId: WS,
      employeeId: 'anvil-e-010',
      status: 'active',
      checkInInterval: 30,
      lastCheckIn: sql`${daysAgo(0, -1)}::timestamptz`,
      nextCheckInDue: sql`${daysFromNow(0, 1)}::timestamptz`,
      latitude: "29.5341",
      longitude: "-98.4936",
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();
    // Converted to Drizzle ORM: ON CONFLICT
    await db.insert(loneWorkerSessions).values({
      id: 'anvil-lw-002',
      workspaceId: WS,
      employeeId: 'anvil-e-008',
      status: 'completed',
      checkInInterval: 30,
      lastCheckIn: sql`${daysAgo(1, 2)}::timestamptz`,
      nextCheckInDue: sql`${daysAgo(1, 1)}::timestamptz`,
      latitude: "29.4246",
      longitude: "-98.4937",
      endedAt: sql`${daysAgo(1)}::timestamptz`,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    }).onConflictDoNothing();
  });

  console.log("[AnvilOps] Operational data seeded successfully.");
  return { success: true, message: "Anvil operational data seeded" };
}
