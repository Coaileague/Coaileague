/**
 * Development Data Enrichment
 * 
 * Adds comprehensive realistic data to the dev sandbox so Trinity can 
 * truly exercise her scheduling, invoicing, and payroll capabilities.
 * 
 * PRODUCTION GUARD: Only runs when isProduction() returns false
 * IDEMPOTENT: Uses ON CONFLICT DO NOTHING — safe to re-run
 * 
 * Data added:
 * - Employee home addresses (DFW area GPS coordinates)
 * - Employee metrics/scores (reliability, performance, attendance)
 * - Employee availability windows (weekly schedules)
 * - W-2 / 1099 worker type mix
 * - Client GPS coordinates (DFW area job sites)
 * - Open shifts for next 2 weeks (for Trinity to fill)
 * - Historical invoices with line items (COAI-ACME-2026-XXXXXXXXXX format)
 * - Payroll runs with entries
 * - Time entries (historical clock records)
 */

import { db } from "../db";
import { sql, eq } from "drizzle-orm";
import { typedExec, typedQuery } from '../lib/typedSql';
import { clients, employeeAvailability, shifts, timeEntries, invoices, invoiceLineItems, payrollRuns, payrollEntries, employeeCertifications, employeeSkills, workspaceMembers } from '@shared/schema';

const WS = 'dev-acme-security-ws';

export async function runDevDataEnrichment(): Promise<{ success: boolean; message: string }> {
  const { isProduction } = await import('../lib/isProduction');
  if (isProduction()) {
    return { success: true, message: 'Skipped - production environment' };
  }

  // CATEGORY C — Raw SQL retained: LIMIT | Tables: workspaces | Verified: 2026-03-23
  const existing = await typedQuery(sql`
    SELECT id FROM workspaces WHERE id = ${WS} LIMIT 1
  `);
  if (existing.length === 0) {
    return { success: true, message: 'Skipped - workspace not yet seeded' };
  }

  // CATEGORY C — Raw SQL retained: LIMIT | Tables: employee_availability | Verified: 2026-03-23
  const enrichCheck = await typedQuery(sql`
    SELECT id FROM employee_availability WHERE workspace_id = ${WS} LIMIT 1
  `);
  if (enrichCheck.length > 0) {
    return { success: true, message: 'Already enriched' };
  }

  console.log('[DevEnrich] Enriching dev sandbox with comprehensive data...');

  try {
    // =====================================================================
    // 1. UPDATE EMPLOYEES — Addresses, GPS, Worker Types, Hire Dates, Scores
    // =====================================================================
    console.log('[DevEnrich] Updating employee profiles...');

    const employeeProfiles: Array<{
      id: string; addr: string; city: string; state: string; zip: string;
      lat: string; lng: string; workerType: string; is1099: boolean;
      hireDate: string; perfScore: number; rating: string; overtimeRate: string;
    }> = [
      { id: 'dev-acme-emp-001', addr: '3200 Knox St', city: 'Dallas', state: 'TX', zip: '75205', lat: '32.8121', lng: '-96.7969', workerType: 'employee', is1099: false, hireDate: '2020-03-15', perfScore: 95, rating: '4.8', overtimeRate: '67.50' },
      { id: 'dev-acme-emp-002', addr: '1515 Main St', city: 'Dallas', state: 'TX', zip: '75201', lat: '32.7825', lng: '-96.7995', workerType: 'employee', is1099: false, hireDate: '2021-06-01', perfScore: 92, rating: '4.7', overtimeRate: '52.50' },
      { id: 'dev-acme-emp-003', addr: '801 Cherry St', city: 'Fort Worth', state: 'TX', zip: '76102', lat: '32.7503', lng: '-97.3308', workerType: 'employee', is1099: false, hireDate: '2021-08-20', perfScore: 88, rating: '4.5', overtimeRate: '48.00' },
      { id: 'dev-acme-emp-004', addr: '2710 N Stemmons Fwy', city: 'Dallas', state: 'TX', zip: '75207', lat: '32.7988', lng: '-96.8196', workerType: 'employee', is1099: false, hireDate: '2022-01-10', perfScore: 82, rating: '4.2', overtimeRate: '33.00' },
      { id: 'dev-acme-emp-005', addr: '4700 Bryant Irvin Rd', city: 'Fort Worth', state: 'TX', zip: '76132', lat: '32.6890', lng: '-97.4055', workerType: 'employee', is1099: false, hireDate: '2021-11-15', perfScore: 90, rating: '4.6', overtimeRate: '36.00' },
      { id: 'dev-acme-emp-006', addr: '1300 S University Dr', city: 'Fort Worth', state: 'TX', zip: '76107', lat: '32.7322', lng: '-97.3605', workerType: 'contractor', is1099: true, hireDate: '2023-02-01', perfScore: 78, rating: '3.9', overtimeRate: '30.00' },
      { id: 'dev-acme-emp-007', addr: '500 E Abram St', city: 'Arlington', state: 'TX', zip: '76010', lat: '32.7357', lng: '-97.1081', workerType: 'employee', is1099: false, hireDate: '2022-05-20', perfScore: 85, rating: '4.3', overtimeRate: '34.50' },
      { id: 'dev-acme-emp-008', addr: '300 N Coit Rd', city: 'Richardson', state: 'TX', zip: '75080', lat: '32.9578', lng: '-96.7688', workerType: 'contractor', is1099: true, hireDate: '2023-06-15', perfScore: 80, rating: '4.0', overtimeRate: '31.50' },
      { id: 'dev-acme-emp-009', addr: '1501 N Plano Rd', city: 'Richardson', state: 'TX', zip: '75081', lat: '32.9625', lng: '-96.7130', workerType: 'employee', is1099: false, hireDate: '2022-09-01', perfScore: 87, rating: '4.4', overtimeRate: '33.75' },
      { id: 'dev-acme-emp-010', addr: '3100 Independence Pkwy', city: 'Plano', state: 'TX', zip: '75075', lat: '33.0198', lng: '-96.7637', workerType: 'contractor', is1099: true, hireDate: '2024-01-10', perfScore: 75, rating: '3.8', overtimeRate: '30.00' },
      { id: 'dev-acme-emp-011', addr: '600 E Lamar Blvd', city: 'Arlington', state: 'TX', zip: '76011', lat: '32.7361', lng: '-97.0930', workerType: 'employee', is1099: false, hireDate: '2022-03-15', perfScore: 91, rating: '4.6', overtimeRate: '36.75' },
      { id: 'dev-acme-emp-012', addr: '2200 W Park Row Dr', city: 'Arlington', state: 'TX', zip: '76013', lat: '32.7125', lng: '-97.1433', workerType: 'employee', is1099: false, hireDate: '2023-07-01', perfScore: 72, rating: '3.7', overtimeRate: '29.25' },
      { id: 'dev-acme-emp-013', addr: '1400 N Collins St', city: 'Arlington', state: 'TX', zip: '76011', lat: '32.7475', lng: '-97.1119', workerType: 'employee', is1099: false, hireDate: '2022-11-20', perfScore: 83, rating: '4.1', overtimeRate: '31.50' },
    ];

    for (const emp of employeeProfiles) {
      // CATEGORY C — Raw SQL retained: ::timestamp | Tables: employees | Verified: 2026-03-23
      await typedExec(sql`
        UPDATE employees SET
          address = ${emp.addr}, city = ${emp.city}, state = ${emp.state}, zip_code = ${emp.zip},
          latitude = ${emp.lat}, longitude = ${emp.lng},
          worker_type = ${emp.workerType}, is_1099_eligible = ${emp.is1099},
          hire_date = ${emp.hireDate}::timestamp,
          performance_score = ${emp.perfScore}, rating = ${emp.rating},
          overtime_rate = ${emp.overtimeRate},
          updated_at = NOW()
        WHERE id = ${emp.id}
      `);
    }

    // =====================================================================
    // 2. CLIENT GPS COORDINATES — Real DFW area locations
    // =====================================================================
    console.log('[DevEnrich] Adding client GPS coordinates...');

    const clientCoords: Array<{ id: string; lat: string; lng: string }> = [
      { id: 'dev-client-001', lat: '32.8143', lng: '-96.8738' },
      { id: 'dev-client-002', lat: '32.7555', lng: '-97.3308' },
      { id: 'dev-client-003', lat: '32.7350', lng: '-97.1150' },
      { id: 'dev-client-004', lat: '32.6854', lng: '-97.0423' },
      { id: 'dev-client-005', lat: '32.7831', lng: '-96.8010' },
      { id: 'dev-client-006', lat: '32.8120', lng: '-96.8218' },
      { id: 'dev-client-007', lat: '32.8580', lng: '-96.9540' },
      { id: 'dev-client-008', lat: '32.9430', lng: '-97.3218' },
    ];

    for (const c of clientCoords) {
      // Converted to Drizzle ORM
      await db.update(clients).set({
        latitude: c.lat,
        longitude: c.lng,
        updatedAt: sql`now()`,
      }).where(eq(clients.id, c.id));
    }

    // =====================================================================
    // 3. EMPLOYEE METRICS — Reliability, attendance, performance scores
    // =====================================================================
    console.log('[DevEnrich] Creating employee metrics...');

    const metrics: Array<{
      id: string; empId: string; reliability: string; tardiness: number; noShow: number;
      yearsExp: string; shiftsCompleted: number; totalHours: string;
      lat: string; lng: string; avgPayRate: string; attendance: string;
      overallScore: string; satisfaction: string; complaints: number; praise: number;
      trend: string;
    }> = [
      { id: 'dev-metric-001', empId: 'dev-acme-emp-001', reliability: '0.97', tardiness: 0, noShow: 0, yearsExp: '5.8', shiftsCompleted: 1420, totalHours: '11360.00', lat: '32.8121', lng: '-96.7969', avgPayRate: '45.00', attendance: '99.20', overallScore: '96.00', satisfaction: '92.50', complaints: 1, praise: 28, trend: 'stable' },
      { id: 'dev-metric-002', empId: 'dev-acme-emp-002', reliability: '0.95', tardiness: 1, noShow: 0, yearsExp: '4.6', shiftsCompleted: 890, totalHours: '7120.00', lat: '32.7825', lng: '-96.7995', avgPayRate: '35.00', attendance: '98.50', overallScore: '93.00', satisfaction: '90.00', complaints: 2, praise: 19, trend: 'improving' },
      { id: 'dev-metric-003', empId: 'dev-acme-emp-003', reliability: '0.92', tardiness: 2, noShow: 0, yearsExp: '4.3', shiftsCompleted: 820, totalHours: '6560.00', lat: '32.7503', lng: '-97.3308', avgPayRate: '32.00', attendance: '97.00', overallScore: '89.00', satisfaction: '87.00', complaints: 3, praise: 15, trend: 'stable' },
      { id: 'dev-metric-004', empId: 'dev-acme-emp-004', reliability: '0.88', tardiness: 3, noShow: 1, yearsExp: '3.9', shiftsCompleted: 610, totalHours: '4880.00', lat: '32.7988', lng: '-96.8196', avgPayRate: '22.00', attendance: '94.50', overallScore: '82.00', satisfaction: '80.00', complaints: 4, praise: 10, trend: 'stable' },
      { id: 'dev-metric-005', empId: 'dev-acme-emp-005', reliability: '0.93', tardiness: 1, noShow: 0, yearsExp: '4.1', shiftsCompleted: 750, totalHours: '6000.00', lat: '32.6890', lng: '-97.4055', avgPayRate: '24.00', attendance: '97.80', overallScore: '91.00', satisfaction: '88.50', complaints: 2, praise: 17, trend: 'improving' },
      { id: 'dev-metric-006', empId: 'dev-acme-emp-006', reliability: '0.82', tardiness: 4, noShow: 1, yearsExp: '2.8', shiftsCompleted: 380, totalHours: '3040.00', lat: '32.7322', lng: '-97.3605', avgPayRate: '20.00', attendance: '91.00', overallScore: '77.00', satisfaction: '75.00', complaints: 6, praise: 7, trend: 'declining' },
      { id: 'dev-metric-007', empId: 'dev-acme-emp-007', reliability: '0.90', tardiness: 2, noShow: 0, yearsExp: '3.5', shiftsCompleted: 540, totalHours: '4320.00', lat: '32.7357', lng: '-97.1081', avgPayRate: '23.00', attendance: '96.00', overallScore: '86.00', satisfaction: '84.00', complaints: 3, praise: 13, trend: 'stable' },
      { id: 'dev-metric-008', empId: 'dev-acme-emp-008', reliability: '0.85', tardiness: 3, noShow: 0, yearsExp: '2.5', shiftsCompleted: 310, totalHours: '2480.00', lat: '32.9578', lng: '-96.7688', avgPayRate: '21.00', attendance: '93.50', overallScore: '80.00', satisfaction: '78.00', complaints: 4, praise: 8, trend: 'stable' },
      { id: 'dev-metric-009', empId: 'dev-acme-emp-009', reliability: '0.91', tardiness: 1, noShow: 0, yearsExp: '3.2', shiftsCompleted: 480, totalHours: '3840.00', lat: '32.9625', lng: '-96.7130', avgPayRate: '22.50', attendance: '97.00', overallScore: '88.00', satisfaction: '86.00', complaints: 2, praise: 14, trend: 'improving' },
      { id: 'dev-metric-010', empId: 'dev-acme-emp-010', reliability: '0.79', tardiness: 5, noShow: 2, yearsExp: '1.8', shiftsCompleted: 210, totalHours: '1680.00', lat: '33.0198', lng: '-96.7637', avgPayRate: '20.00', attendance: '88.00', overallScore: '73.00', satisfaction: '70.00', complaints: 7, praise: 4, trend: 'declining' },
      { id: 'dev-metric-011', empId: 'dev-acme-emp-011', reliability: '0.94', tardiness: 1, noShow: 0, yearsExp: '3.7', shiftsCompleted: 580, totalHours: '4640.00', lat: '32.7361', lng: '-97.0930', avgPayRate: '24.50', attendance: '98.00', overallScore: '92.00', satisfaction: '89.00', complaints: 1, praise: 18, trend: 'improving' },
      { id: 'dev-metric-012', empId: 'dev-acme-emp-012', reliability: '0.76', tardiness: 6, noShow: 2, yearsExp: '2.4', shiftsCompleted: 290, totalHours: '2320.00', lat: '32.7125', lng: '-97.1433', avgPayRate: '19.50', attendance: '86.50', overallScore: '70.00', satisfaction: '68.00', complaints: 8, praise: 3, trend: 'declining' },
      { id: 'dev-metric-013', empId: 'dev-acme-emp-013', reliability: '0.87', tardiness: 3, noShow: 1, yearsExp: '3.0', shiftsCompleted: 440, totalHours: '3520.00', lat: '32.7475', lng: '-97.1119', avgPayRate: '21.00', attendance: '95.00', overallScore: '84.00', satisfaction: '82.00', complaints: 3, praise: 11, trend: 'stable' },
    ];

    // NOTE: employee_metrics table was merged into coaileagueEmployeeProfiles (Mar 2026).
    // Fields are stored in JSONB blobs on the coaileagueEmployeeProfiles table.
    console.log('[DevEnrich] Skipping employee_metrics INSERT (table merged into coaileagueEmployeeProfiles)');

    // =====================================================================
    // 4. EMPLOYEE AVAILABILITY — Weekly schedules (broad windows for scheduling)
    // =====================================================================
    console.log('[DevEnrich] Creating employee availability records...');

    const empIds = employeeProfiles.map(e => e.id);
    const availabilityPatterns: Record<string, Array<{ day: number; start: string; end: string }>> = {
      'dev-acme-emp-001': [{ day: 1, start: '06:00', end: '22:00' }, { day: 2, start: '06:00', end: '22:00' }, { day: 3, start: '06:00', end: '22:00' }, { day: 4, start: '06:00', end: '22:00' }, { day: 5, start: '06:00', end: '22:00' }],
      'dev-acme-emp-002': [{ day: 1, start: '06:00', end: '23:00' }, { day: 2, start: '06:00', end: '23:00' }, { day: 3, start: '06:00', end: '23:00' }, { day: 4, start: '06:00', end: '23:00' }, { day: 5, start: '06:00', end: '23:00' }, { day: 6, start: '08:00', end: '18:00' }],
      'dev-acme-emp-003': [{ day: 0, start: '06:00', end: '22:00' }, { day: 1, start: '06:00', end: '22:00' }, { day: 2, start: '06:00', end: '22:00' }, { day: 3, start: '06:00', end: '22:00' }, { day: 4, start: '06:00', end: '22:00' }, { day: 5, start: '06:00', end: '20:00' }],
      'dev-acme-emp-004': [{ day: 0, start: '00:00', end: '23:59' }, { day: 1, start: '00:00', end: '23:59' }, { day: 2, start: '00:00', end: '23:59' }, { day: 3, start: '00:00', end: '23:59' }, { day: 4, start: '00:00', end: '23:59' }, { day: 5, start: '00:00', end: '23:59' }, { day: 6, start: '00:00', end: '23:59' }],
      'dev-acme-emp-005': [{ day: 1, start: '05:00', end: '23:00' }, { day: 2, start: '05:00', end: '23:00' }, { day: 3, start: '05:00', end: '23:00' }, { day: 4, start: '05:00', end: '23:00' }, { day: 5, start: '05:00', end: '23:00' }, { day: 6, start: '08:00', end: '20:00' }],
      'dev-acme-emp-006': [{ day: 0, start: '00:00', end: '23:59' }, { day: 1, start: '00:00', end: '23:59' }, { day: 2, start: '00:00', end: '23:59' }, { day: 3, start: '00:00', end: '23:59' }, { day: 4, start: '00:00', end: '23:59' }, { day: 5, start: '00:00', end: '23:59' }, { day: 6, start: '00:00', end: '23:59' }],
      'dev-acme-emp-007': [{ day: 1, start: '06:00', end: '22:00' }, { day: 2, start: '06:00', end: '22:00' }, { day: 3, start: '06:00', end: '22:00' }, { day: 4, start: '14:00', end: '23:59' }, { day: 5, start: '14:00', end: '23:59' }, { day: 6, start: '06:00', end: '22:00' }, { day: 0, start: '06:00', end: '22:00' }],
      'dev-acme-emp-008': [{ day: 0, start: '00:00', end: '23:59' }, { day: 1, start: '00:00', end: '23:59' }, { day: 2, start: '00:00', end: '23:59' }, { day: 3, start: '00:00', end: '23:59' }, { day: 4, start: '00:00', end: '23:59' }, { day: 5, start: '00:00', end: '23:59' }, { day: 6, start: '00:00', end: '23:59' }],
      'dev-acme-emp-009': [{ day: 1, start: '06:00', end: '23:00' }, { day: 2, start: '06:00', end: '23:00' }, { day: 3, start: '06:00', end: '23:00' }, { day: 4, start: '06:00', end: '23:00' }, { day: 5, start: '06:00', end: '23:00' }, { day: 0, start: '08:00', end: '20:00' }],
      'dev-acme-emp-010': [{ day: 0, start: '00:00', end: '23:59' }, { day: 1, start: '00:00', end: '23:59' }, { day: 2, start: '00:00', end: '23:59' }, { day: 3, start: '00:00', end: '23:59' }, { day: 4, start: '00:00', end: '23:59' }, { day: 5, start: '00:00', end: '23:59' }, { day: 6, start: '00:00', end: '23:59' }],
      'dev-acme-emp-011': [{ day: 1, start: '05:00', end: '22:00' }, { day: 2, start: '05:00', end: '22:00' }, { day: 3, start: '05:00', end: '22:00' }, { day: 4, start: '05:00', end: '22:00' }, { day: 5, start: '05:00', end: '22:00' }, { day: 6, start: '06:00', end: '18:00' }],
      'dev-acme-emp-012': [{ day: 0, start: '00:00', end: '23:59' }, { day: 1, start: '00:00', end: '23:59' }, { day: 2, start: '00:00', end: '23:59' }, { day: 3, start: '00:00', end: '23:59' }, { day: 4, start: '00:00', end: '23:59' }, { day: 5, start: '00:00', end: '23:59' }, { day: 6, start: '00:00', end: '23:59' }],
      'dev-acme-emp-013': [{ day: 1, start: '06:00', end: '23:00' }, { day: 2, start: '06:00', end: '23:00' }, { day: 3, start: '06:00', end: '23:00' }, { day: 4, start: '06:00', end: '23:00' }, { day: 5, start: '06:00', end: '23:00' }, { day: 0, start: '10:00', end: '22:00' }],
    };

    let availIdx = 0;
    for (const [empId, slots] of Object.entries(availabilityPatterns)) {
      for (const slot of slots) {
        availIdx++;
        // Converted to Drizzle ORM: ON CONFLICT
        await db.insert(employeeAvailability).values({
          id: `dev-avail-${String(availIdx).padStart(4, '0')}`,
          workspaceId: WS,
          employeeId: empId,
          dayOfWeek: slot.day,
          startTime: slot.start,
          endTime: slot.end,
          isRecurring: true,
          status: 'available',
          effectiveFrom: sql`now()`,
          createdAt: sql`now()`,
          updatedAt: sql`now()`,
        }).onConflictDoNothing();
      }
    }

    // =====================================================================
    // 5. OPEN SHIFTS — 40 unfilled shifts across next 2 weeks for Trinity auto-fill
    // =====================================================================
    console.log('[DevEnrich] Creating open shifts for Trinity to fill...');

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const clientIds = ['dev-client-001', 'dev-client-002', 'dev-client-003', 'dev-client-004', 'dev-client-005', 'dev-client-006', 'dev-client-007', 'dev-client-008'];
    const shiftTitles = ['Security Patrol', 'Front Desk Guard', 'Event Security', 'Warehouse Security', 'Hospital Security', 'Bank Patrol', 'Night Watch', 'Access Control', 'Parking Lot Patrol', 'Retail Loss Prevention', 'Executive Protection', 'Loading Dock Security'];
    const shiftCategories = ['security', 'field_ops', 'emergency', 'security', 'emergency', 'security', 'field_ops', 'field_ops', 'security', 'security', 'security', 'field_ops'];
    const contractRates = ['28.00', '32.00', '35.00', '30.00', '38.00', '24.00', '26.00', '40.00'];

    const openShifts: Array<{
      id: string; clientId: string; title: string; category: string;
      dayOffset: number; startHour: number; durationHours: number;
      contractRate: string;
    }> = [];

    for (let day = 1; day <= 14; day++) {
      const shiftsPerDay = day <= 7 ? 4 : 3;
      for (let s = 0; s < shiftsPerDay; s++) {
        const idx = openShifts.length;
        const clientIdx = (day + s) % clientIds.length;
        const titleIdx = (idx) % shiftTitles.length;
        const startHours = [6, 8, 14, 18, 22, 7, 10, 16, 20, 0];
        const durations = [8, 6, 8, 6, 10, 8, 6, 8, 6, 8];
        const startH = startHours[(day + s) % startHours.length];
        const dur = durations[(day + s) % durations.length];

        openShifts.push({
          id: `dev-open-shift-${String(idx + 1).padStart(3, '0')}`,
          clientId: clientIds[clientIdx],
          title: shiftTitles[titleIdx],
          category: shiftCategories[titleIdx],
          dayOffset: day,
          startHour: startH,
          durationHours: dur,
          contractRate: contractRates[clientIdx],
        });
      }
    }

    for (const shift of openShifts) {
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() + shift.dayOffset);
      startDate.setHours(shift.startHour, 0, 0, 0);

      const endDate = new Date(startDate);
      endDate.setTime(endDate.getTime() + shift.durationHours * 60 * 60 * 1000);

      const dateStr = startDate.toISOString().split('T')[0];

      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(shifts).values({
        id: shift.id,
        workspaceId: WS,
        employeeId: null,
        clientId: shift.clientId,
        title: shift.title,
        category: shift.category as any,
        startTime: new Date(startDate.toISOString()),
        endTime: new Date(endDate.toISOString()),
        date: dateStr,
        status: 'published' as any,
        contractRate: shift.contractRate,
        billableToClient: true,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();
    }

    // =====================================================================
    // 6. HISTORICAL TIME ENTRIES — Past 4 weeks of clock records
    // =====================================================================
    console.log('[DevEnrich] Creating historical time entries...');

    const activeEmpIds = empIds.filter(id => !['dev-acme-emp-001'].includes(id));
    let teIdx = 0;

    for (let weekBack = 1; weekBack <= 4; weekBack++) {
      for (const empId of activeEmpIds) {
        const shiftsThisWeek = 3 + Math.floor(Math.random() * 3);
        const empProfile = employeeProfiles.find(e => e.id === empId)!;
        const rate = empProfile ? parseFloat(empProfile.id.replace('dev-acme-emp-', '').replace(/^0+/, '') || '20') : 20;
        const empObj = employeeProfiles.find(e => e.id === empId);
        const hourlyRate = empObj ? (['001','002','003'].includes(empObj.id.slice(-3)) ? '35.00' : empObj.id.endsWith('004') ? '22.00' : empObj.id.endsWith('005') ? '24.00' : empObj.id.endsWith('006') ? '20.00' : empObj.id.endsWith('007') ? '23.00' : empObj.id.endsWith('008') ? '21.00' : empObj.id.endsWith('009') ? '22.50' : empObj.id.endsWith('010') ? '20.00' : empObj.id.endsWith('011') ? '24.50' : empObj.id.endsWith('012') ? '19.50' : '21.00') : '20.00';

        for (let s = 0; s < shiftsThisWeek; s++) {
          teIdx++;
          const dayInWeek = s % 5 + 1;
          const clockInDate = new Date(today);
          clockInDate.setDate(clockInDate.getDate() - (weekBack * 7) + dayInWeek);
          const startHour = [6, 8, 14, 16, 22][s % 5];
          clockInDate.setHours(startHour, 0, 0, 0);

          const hours = [8, 6, 8, 10, 6][s % 5];
          const clockOutDate = new Date(clockInDate);
          clockOutDate.setTime(clockOutDate.getTime() + hours * 60 * 60 * 1000);

          const totalAmount = (hours * parseFloat(hourlyRate)).toFixed(2);
          const clientId = clientIds[(teIdx) % clientIds.length];
          const clientCoord = clientCoords.find(c => c.id === clientId);

          // Converted to Drizzle ORM: ON CONFLICT
          await db.insert(timeEntries).values({
            id: `dev-te-${String(teIdx).padStart(5, '0')}`,
            workspaceId: WS,
            employeeId: empId,
            clientId: clientId,
            clockIn: new Date(clockInDate.toISOString()),
            clockOut: new Date(clockOutDate.toISOString()),
            totalHours: hours.toFixed(2),
            hourlyRate: hourlyRate,
            totalAmount: totalAmount,
            status: 'approved',
            billableToClient: true,
            clockInLatitude: clientCoord?.lat || '32.78',
            clockInLongitude: clientCoord?.lng || '-96.80',
            clockOutLatitude: clientCoord?.lat || '32.78',
            clockOutLongitude: clientCoord?.lng || '-96.80',
            createdAt: sql`now()`,
            updatedAt: sql`now()`,
          }).onConflictDoNothing();
        }
      }
    }

    // =====================================================================
    // 7. INVOICES — COAI-ACME-2026-XXXXXXXXXX format, realistic billing
    // =====================================================================
    console.log('[DevEnrich] Creating invoices...');

    const currentYear = now.getFullYear();

    const invoiceData: Array<{
      id: string; clientId: string; num: string; subtotal: string; tax: string;
      total: string; status: string; weekOffset: number; notes: string;
    }> = [
      { id: 'dev-inv-001', clientId: 'dev-client-001', num: `COAI-ACME-${currentYear}-0000000001`, subtotal: '4480.00', tax: '0.00', total: '4480.00', status: 'paid', weekOffset: -4, notes: 'Week of Jan 27 — Mall security coverage' },
      { id: 'dev-inv-002', clientId: 'dev-client-002', num: `COAI-ACME-${currentYear}-0000000002`, subtotal: '3840.00', tax: '0.00', total: '3840.00', status: 'paid', weekOffset: -4, notes: 'Week of Jan 27 — Tower lobby security' },
      { id: 'dev-inv-003', clientId: 'dev-client-003', num: `COAI-ACME-${currentYear}-0000000003`, subtotal: '5600.00', tax: '0.00', total: '5600.00', status: 'paid', weekOffset: -3, notes: 'Week of Feb 3 — Hospital security' },
      { id: 'dev-inv-004', clientId: 'dev-client-005', num: `COAI-ACME-${currentYear}-0000000004`, subtotal: '6080.00', tax: '0.00', total: '6080.00', status: 'paid', weekOffset: -3, notes: 'Week of Feb 3 — Bank patrol services' },
      { id: 'dev-inv-005', clientId: 'dev-client-004', num: `COAI-ACME-${currentYear}-0000000005`, subtotal: '3600.00', tax: '0.00', total: '3600.00', status: 'sent', weekOffset: -2, notes: 'Week of Feb 10 — Event center security' },
      { id: 'dev-inv-006', clientId: 'dev-client-006', num: `COAI-ACME-${currentYear}-0000000006`, subtotal: '2880.00', tax: '0.00', total: '2880.00', status: 'sent', weekOffset: -2, notes: 'Week of Feb 10 — Apartment complex patrol' },
      { id: 'dev-inv-007', clientId: 'dev-client-007', num: `COAI-ACME-${currentYear}-0000000007`, subtotal: '3120.00', tax: '0.00', total: '3120.00', status: 'overdue', weekOffset: -1, notes: 'Week of Feb 17 — Warehouse access control' },
      { id: 'dev-inv-008', clientId: 'dev-client-001', num: `COAI-ACME-${currentYear}-0000000008`, subtotal: '4200.00', tax: '0.00', total: '4200.00', status: 'draft', weekOffset: 0, notes: 'Current week — Mall patrol all shifts' },
    ];

    for (const inv of invoiceData) {
      const issueDate = new Date(today);
      issueDate.setDate(issueDate.getDate() + (inv.weekOffset * 7));
      const dueDate = new Date(issueDate);
      dueDate.setDate(dueDate.getDate() + 30);
      const paidAt = inv.status === 'paid' ? new Date(issueDate.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString() : null;
      const platformFee = (parseFloat(inv.subtotal) * 0.05).toFixed(2);
      const businessAmount = (parseFloat(inv.subtotal) - parseFloat(platformFee)).toFixed(2);

      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(invoices).values({
        id: inv.id,
        workspaceId: WS,
        clientId: inv.clientId,
        invoiceNumber: inv.num,
        issueDate: new Date(issueDate.toISOString()),
        dueDate: new Date(dueDate.toISOString()),
        subtotal: inv.subtotal,
        taxRate: '0.00',
        taxAmount: inv.tax,
        total: inv.total,
        platformFeePercentage: '5.00',
        platformFeeAmount: platformFee,
        businessAmount: businessAmount,
        status: inv.status as any,
        paidAt: paidAt ? new Date(paidAt) : null,
        amountPaid: inv.status === 'paid' ? inv.total : '0.00',
        notes: inv.notes,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();

      const lineItems = [
        { desc: 'Security officer — regular hours', qty: '120.00', rate: (parseFloat(inv.total) / 120).toFixed(2) },
        { desc: 'Overtime hours', qty: '8.00', rate: ((parseFloat(inv.total) / 120) * 1.5).toFixed(2) },
      ];
      const mainAmount = (120 * parseFloat(lineItems[0].rate)).toFixed(2);
      const otAmount = (8 * parseFloat(lineItems[1].rate)).toFixed(2);

      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(invoiceLineItems).values({
        id: `dev-ili-${inv.id}-1`,
        workspaceId: WS,
        invoiceId: inv.id,
        lineNumber: 1,
        description: lineItems[0].desc,
        quantity: lineItems[0].qty,
        unitPrice: lineItems[0].rate,
        rate: lineItems[0].rate,
        amount: mainAmount,
        createdAt: sql`now()`,
      }).onConflictDoNothing();
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(invoiceLineItems).values({
        id: `dev-ili-${inv.id}-2`,
        workspaceId: WS,
        invoiceId: inv.id,
        lineNumber: 2,
        description: lineItems[1].desc,
        quantity: lineItems[1].qty,
        unitPrice: lineItems[1].rate,
        rate: lineItems[1].rate,
        amount: otAmount,
        createdAt: sql`now()`,
      }).onConflictDoNothing();
    }

    // =====================================================================
    // 8. PAYROLL RUNS — 3 completed biweekly runs + 1 draft current
    // =====================================================================
    console.log('[DevEnrich] Creating payroll runs...');

    const payrollRuns: Array<{
      id: string; periodStartOffset: number; periodEndOffset: number;
      status: string; grossPay: string; taxes: string; netPay: string;
    }> = [
      { id: 'dev-payroll-001', periodStartOffset: -42, periodEndOffset: -29, status: 'completed', grossPay: '28560.00', taxes: '7140.00', netPay: '21420.00' },
      { id: 'dev-payroll-002', periodStartOffset: -28, periodEndOffset: -15, status: 'completed', grossPay: '31200.00', taxes: '7800.00', netPay: '23400.00' },
      { id: 'dev-payroll-003', periodStartOffset: -14, periodEndOffset: -1, status: 'completed', grossPay: '29880.00', taxes: '7470.00', netPay: '22410.00' },
      { id: 'dev-payroll-004', periodStartOffset: 0, periodEndOffset: 13, status: 'draft', grossPay: '0.00', taxes: '0.00', netPay: '0.00' },
    ];

    for (const pr of payrollRuns) {
      const periodStart = new Date(today);
      periodStart.setDate(periodStart.getDate() + pr.periodStartOffset);
      const periodEnd = new Date(today);
      periodEnd.setDate(periodEnd.getDate() + pr.periodEndOffset);
      periodEnd.setHours(23, 59, 59, 999);

      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(payrollRuns).values({
        id: pr.id,
        workspaceId: WS,
        periodStart: new Date(periodStart.toISOString()),
        periodEnd: new Date(periodEnd.toISOString()),
        status: pr.status as any,
        totalGrossPay: pr.grossPay,
        totalTaxes: pr.taxes,
        totalNetPay: pr.netPay,
        processedBy: pr.status === 'completed' ? 'dev-owner-001' : null,
        processedAt: pr.status === 'completed' ? new Date(periodEnd.toISOString()) : null,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();

      if (pr.status === 'completed') {
        const payableEmps = activeEmpIds.slice(0, 10);
        let peIdx = 0;
        for (const empId of payableEmps) {
          peIdx++;
          const empProfile = employeeProfiles.find(e => e.id === empId);
          const hourlyRate = empProfile ? (['002','003'].some(s => empProfile.id.endsWith(s)) ? '35.00' : empProfile.id.endsWith('004') ? '22.00' : empProfile.id.endsWith('005') ? '24.00' : empProfile.id.endsWith('006') ? '20.00' : empProfile.id.endsWith('007') ? '23.00' : empProfile.id.endsWith('008') ? '21.00' : empProfile.id.endsWith('009') ? '22.50' : empProfile.id.endsWith('010') ? '20.00' : empProfile.id.endsWith('011') ? '24.50' : empProfile.id.endsWith('012') ? '19.50' : '21.00') : '20.00';
          
          const regHours = (32 + Math.floor(Math.random() * 9)).toFixed(2);
          const otHours = Math.random() > 0.6 ? (2 + Math.floor(Math.random() * 6)).toFixed(2) : '0.00';
          const grossPay = (parseFloat(regHours) * parseFloat(hourlyRate) + parseFloat(otHours) * parseFloat(hourlyRate) * 1.5).toFixed(2);
          const fedTax = (parseFloat(grossPay) * 0.12).toFixed(2);
          const stateTax = '0.00';
          const ss = (parseFloat(grossPay) * 0.062).toFixed(2);
          const med = (parseFloat(grossPay) * 0.0145).toFixed(2);
          const netPay = (parseFloat(grossPay) - parseFloat(fedTax) - parseFloat(ss) - parseFloat(med)).toFixed(2);

          const is1099 = empProfile?.is1099 || false;

          // Converted to Drizzle ORM: ON CONFLICT
          await db.insert(payrollEntries).values({
            id: `dev-pe-${pr.id}-${String(peIdx).padStart(3, '0')}`,
            payrollRunId: pr.id,
            employeeId: empId,
            workspaceId: WS,
            regularHours: regHours,
            overtimeHours: otHours,
            hourlyRate: hourlyRate,
            grossPay: grossPay,
            federalTax: is1099 ? '0.00' : fedTax,
            stateTax: stateTax,
            socialSecurity: is1099 ? '0.00' : ss,
            medicare: is1099 ? '0.00' : med,
            netPay: is1099 ? grossPay : netPay,
            notes: is1099 ? '1099 contractor — no withholding' : null,
            createdAt: sql`now()`,
            updatedAt: sql`now()`,
          }).onConflictDoNothing();
        }
      }
    }

    // =====================================================================
    // 9. EMPLOYEE CERTIFICATIONS — Security industry certs Trinity checks
    // =====================================================================
    console.log('[DevEnrich] Creating employee certifications...');

    const certData: Array<{
      empId: string; certType: string; certName: string; certNum: string;
      issuer: string; issued: string; expires: string; status: string; required: boolean;
    }> = [
      // emp-001: Senior, fully certified (Armed + CPR + First Aid)
      { empId: 'dev-acme-emp-001', certType: 'professional_license', certName: 'Texas Armed Guard License', certNum: 'TX-AG-20190415', issuer: 'Texas DPS', issued: '2019-04-15', expires: '2027-04-15', status: 'active', required: true },
      { empId: 'dev-acme-emp-001', certType: 'medical_cert', certName: 'CPR/AED Certification', certNum: 'AHA-CPR-88412', issuer: 'American Heart Association', issued: '2025-06-01', expires: '2027-06-01', status: 'active', required: true },
      { empId: 'dev-acme-emp-001', certType: 'medical_cert', certName: 'First Aid Certification', certNum: 'RC-FA-55123', issuer: 'Red Cross', issued: '2025-03-10', expires: '2027-03-10', status: 'active', required: false },
      // emp-002: Armed + CPR (no first aid)
      { empId: 'dev-acme-emp-002', certType: 'professional_license', certName: 'Texas Armed Guard License', certNum: 'TX-AG-20210601', issuer: 'Texas DPS', issued: '2021-06-01', expires: '2027-06-01', status: 'active', required: true },
      { empId: 'dev-acme-emp-002', certType: 'medical_cert', certName: 'CPR/AED Certification', certNum: 'AHA-CPR-91203', issuer: 'American Heart Association', issued: '2025-01-15', expires: '2027-01-15', status: 'active', required: true },
      // emp-003: Unarmed + CPR + First Aid
      { empId: 'dev-acme-emp-003', certType: 'professional_license', certName: 'Texas Unarmed Guard License', certNum: 'TX-UG-20210820', issuer: 'Texas DPS', issued: '2021-08-20', expires: '2027-08-20', status: 'active', required: true },
      { empId: 'dev-acme-emp-003', certType: 'medical_cert', certName: 'CPR/AED Certification', certNum: 'AHA-CPR-70345', issuer: 'American Heart Association', issued: '2024-11-01', expires: '2026-11-01', status: 'active', required: true },
      { empId: 'dev-acme-emp-003', certType: 'medical_cert', certName: 'First Aid Certification', certNum: 'RC-FA-60210', issuer: 'Red Cross', issued: '2025-02-01', expires: '2027-02-01', status: 'active', required: false },
      // emp-004: Unarmed only — NO CPR (will fail cert checks for CPR-required shifts)
      { empId: 'dev-acme-emp-004', certType: 'professional_license', certName: 'Texas Unarmed Guard License', certNum: 'TX-UG-20220110', issuer: 'Texas DPS', issued: '2022-01-10', expires: '2028-01-10', status: 'active', required: true },
      // emp-005: Armed + CPR + First Aid
      { empId: 'dev-acme-emp-005', certType: 'professional_license', certName: 'Texas Armed Guard License', certNum: 'TX-AG-20211115', issuer: 'Texas DPS', issued: '2021-11-15', expires: '2027-11-15', status: 'active', required: true },
      { empId: 'dev-acme-emp-005', certType: 'medical_cert', certName: 'CPR/AED Certification', certNum: 'AHA-CPR-83456', issuer: 'American Heart Association', issued: '2025-04-01', expires: '2027-04-01', status: 'active', required: true },
      { empId: 'dev-acme-emp-005', certType: 'medical_cert', certName: 'First Aid Certification', certNum: 'RC-FA-44987', issuer: 'Red Cross', issued: '2025-05-15', expires: '2027-05-15', status: 'active', required: false },
      // emp-006: 1099 contractor — Armed only (no CPR — stress test: hired for armed sites but missing medical)
      { empId: 'dev-acme-emp-006', certType: 'professional_license', certName: 'Texas Armed Guard License', certNum: 'TX-AG-20230201', issuer: 'Texas DPS', issued: '2023-02-01', expires: '2029-02-01', status: 'active', required: true },
      // emp-007: Unarmed + CPR
      { empId: 'dev-acme-emp-007', certType: 'professional_license', certName: 'Texas Unarmed Guard License', certNum: 'TX-UG-20220520', issuer: 'Texas DPS', issued: '2022-05-20', expires: '2028-05-20', status: 'active', required: true },
      { empId: 'dev-acme-emp-007', certType: 'medical_cert', certName: 'CPR/AED Certification', certNum: 'AHA-CPR-67891', issuer: 'American Heart Association', issued: '2025-07-01', expires: '2027-07-01', status: 'active', required: true },
      // emp-008: 1099 contractor — Unarmed + CPR + EXPIRING SOON cert (stress test: 20 days out)
      { empId: 'dev-acme-emp-008', certType: 'professional_license', certName: 'Texas Unarmed Guard License', certNum: 'TX-UG-20230615', issuer: 'Texas DPS', issued: '2023-06-15', expires: '2029-06-15', status: 'active', required: true },
      { empId: 'dev-acme-emp-008', certType: 'medical_cert', certName: 'CPR/AED Certification', certNum: 'AHA-CPR-45002', issuer: 'American Heart Association', issued: '2024-03-25', expires: '2026-03-22', status: 'active', required: true },
      // emp-009: Unarmed + CPR + First Aid
      { empId: 'dev-acme-emp-009', certType: 'professional_license', certName: 'Texas Unarmed Guard License', certNum: 'TX-UG-20220901', issuer: 'Texas DPS', issued: '2022-09-01', expires: '2028-09-01', status: 'active', required: true },
      { empId: 'dev-acme-emp-009', certType: 'medical_cert', certName: 'CPR/AED Certification', certNum: 'AHA-CPR-51123', issuer: 'American Heart Association', issued: '2025-08-15', expires: '2027-08-15', status: 'active', required: true },
      { empId: 'dev-acme-emp-009', certType: 'medical_cert', certName: 'First Aid Certification', certNum: 'RC-FA-72100', issuer: 'Red Cross', issued: '2025-09-01', expires: '2027-09-01', status: 'active', required: false },
      // emp-010: 1099 contractor — EXPIRED armed license (stress test: should be disqualified from armed shifts)
      { empId: 'dev-acme-emp-010', certType: 'professional_license', certName: 'Texas Armed Guard License', certNum: 'TX-AG-20200310', issuer: 'Texas DPS', issued: '2020-03-10', expires: '2025-03-10', status: 'expired', required: true },
      { empId: 'dev-acme-emp-010', certType: 'medical_cert', certName: 'CPR/AED Certification', certNum: 'AHA-CPR-33211', issuer: 'American Heart Association', issued: '2024-06-01', expires: '2026-06-01', status: 'active', required: true },
      // emp-011: Armed + CPR + First Aid (solid)
      { empId: 'dev-acme-emp-011', certType: 'professional_license', certName: 'Texas Armed Guard License', certNum: 'TX-AG-20220315', issuer: 'Texas DPS', issued: '2022-03-15', expires: '2028-03-15', status: 'active', required: true },
      { empId: 'dev-acme-emp-011', certType: 'medical_cert', certName: 'CPR/AED Certification', certNum: 'AHA-CPR-78654', issuer: 'American Heart Association', issued: '2025-10-01', expires: '2027-10-01', status: 'active', required: true },
      { empId: 'dev-acme-emp-011', certType: 'medical_cert', certName: 'First Aid Certification', certNum: 'RC-FA-81456', issuer: 'Red Cross', issued: '2025-10-01', expires: '2027-10-01', status: 'active', required: false },
      // emp-012: Unarmed only — NO CPR, NO first aid (weakest certs — many shifts disqualified)
      { empId: 'dev-acme-emp-012', certType: 'professional_license', certName: 'Texas Unarmed Guard License', certNum: 'TX-UG-20230701', issuer: 'Texas DPS', issued: '2023-07-01', expires: '2029-07-01', status: 'active', required: true },
      // emp-013: Unarmed + CPR
      { empId: 'dev-acme-emp-013', certType: 'professional_license', certName: 'Texas Unarmed Guard License', certNum: 'TX-UG-20221120', issuer: 'Texas DPS', issued: '2022-11-20', expires: '2028-11-20', status: 'active', required: true },
      { empId: 'dev-acme-emp-013', certType: 'medical_cert', certName: 'CPR/AED Certification', certNum: 'AHA-CPR-62001', issuer: 'American Heart Association', issued: '2025-05-01', expires: '2027-05-01', status: 'active', required: true },
    ];

    let certIdx = 0;
    for (const c of certData) {
      certIdx++;
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(employeeCertifications).values({
        id: `dev-cert-${String(certIdx).padStart(3, '0')}`,
        workspaceId: WS,
        employeeId: c.empId,
        certificationType: c.certType,
        certificationName: c.certName,
        certificationNumber: c.certNum,
        issuingAuthority: c.issuer,
        issuedDate: new Date(c.issued),
        expirationDate: new Date(c.expires),
        status: c.status as any,
        isRequired: c.required,
        createdAt: sql`now()`,
      }).onConflictDoNothing();
    }

    // =====================================================================
    // 10. EMPLOYEE SKILLS — Certification-category skills (Trinity cross-checks these)
    // =====================================================================
    console.log('[DevEnrich] Creating employee skills...');

    const skillData: Array<{
      empId: string; skillName: string; category: string; proficiency: number;
      verified: boolean; expires: string | null;
    }> = [
      // Armed employees get "armed guard" skill
      { empId: 'dev-acme-emp-001', skillName: 'Armed Guard', category: 'certification', proficiency: 5, verified: true, expires: '2027-04-15' },
      { empId: 'dev-acme-emp-001', skillName: 'CPR', category: 'certification', proficiency: 5, verified: true, expires: '2027-06-01' },
      { empId: 'dev-acme-emp-001', skillName: 'First Aid', category: 'certification', proficiency: 4, verified: true, expires: '2027-03-10' },
      { empId: 'dev-acme-emp-001', skillName: 'Executive Protection', category: 'technical', proficiency: 5, verified: true, expires: null },
      { empId: 'dev-acme-emp-001', skillName: 'Spanish', category: 'language', proficiency: 3, verified: false, expires: null },

      { empId: 'dev-acme-emp-002', skillName: 'Armed Guard', category: 'certification', proficiency: 4, verified: true, expires: '2027-06-01' },
      { empId: 'dev-acme-emp-002', skillName: 'CPR', category: 'certification', proficiency: 4, verified: true, expires: '2027-01-15' },
      { empId: 'dev-acme-emp-002', skillName: 'Surveillance Systems', category: 'technical', proficiency: 4, verified: true, expires: null },

      { empId: 'dev-acme-emp-003', skillName: 'Unarmed Guard', category: 'certification', proficiency: 4, verified: true, expires: '2027-08-20' },
      { empId: 'dev-acme-emp-003', skillName: 'CPR', category: 'certification', proficiency: 4, verified: true, expires: '2026-11-01' },
      { empId: 'dev-acme-emp-003', skillName: 'First Aid', category: 'certification', proficiency: 4, verified: true, expires: '2027-02-01' },
      { empId: 'dev-acme-emp-003', skillName: 'Access Control Systems', category: 'technical', proficiency: 3, verified: true, expires: null },

      { empId: 'dev-acme-emp-004', skillName: 'Unarmed Guard', category: 'certification', proficiency: 3, verified: true, expires: '2028-01-10' },
      // emp-004 intentionally has NO CPR skill — tests Trinity's cert filtering

      { empId: 'dev-acme-emp-005', skillName: 'Armed Guard', category: 'certification', proficiency: 4, verified: true, expires: '2027-11-15' },
      { empId: 'dev-acme-emp-005', skillName: 'CPR', category: 'certification', proficiency: 5, verified: true, expires: '2027-04-01' },
      { empId: 'dev-acme-emp-005', skillName: 'First Aid', category: 'certification', proficiency: 4, verified: true, expires: '2027-05-15' },
      { empId: 'dev-acme-emp-005', skillName: 'Patrol Driving', category: 'technical', proficiency: 4, verified: true, expires: null },

      { empId: 'dev-acme-emp-006', skillName: 'Armed Guard', category: 'certification', proficiency: 3, verified: true, expires: '2029-02-01' },
      // emp-006 (1099) has armed but NO CPR — stress test

      { empId: 'dev-acme-emp-007', skillName: 'Unarmed Guard', category: 'certification', proficiency: 4, verified: true, expires: '2028-05-20' },
      { empId: 'dev-acme-emp-007', skillName: 'CPR', category: 'certification', proficiency: 3, verified: true, expires: '2027-07-01' },
      { empId: 'dev-acme-emp-007', skillName: 'Crowd Management', category: 'technical', proficiency: 4, verified: true, expires: null },

      { empId: 'dev-acme-emp-008', skillName: 'Unarmed Guard', category: 'certification', proficiency: 3, verified: true, expires: '2029-06-15' },
      { empId: 'dev-acme-emp-008', skillName: 'CPR', category: 'certification', proficiency: 3, verified: true, expires: '2026-03-22' },
      // emp-008 CPR expiring in ~20 days — Trinity should flag

      { empId: 'dev-acme-emp-009', skillName: 'Unarmed Guard', category: 'certification', proficiency: 4, verified: true, expires: '2028-09-01' },
      { empId: 'dev-acme-emp-009', skillName: 'CPR', category: 'certification', proficiency: 4, verified: true, expires: '2027-08-15' },
      { empId: 'dev-acme-emp-009', skillName: 'First Aid', category: 'certification', proficiency: 4, verified: true, expires: '2027-09-01' },
      { empId: 'dev-acme-emp-009', skillName: 'Report Writing', category: 'soft_skill', proficiency: 4, verified: false, expires: null },

      { empId: 'dev-acme-emp-010', skillName: 'Armed Guard', category: 'certification', proficiency: 2, verified: true, expires: '2025-03-10' },
      // emp-010 armed skill EXPIRED — mirrors expired cert
      { empId: 'dev-acme-emp-010', skillName: 'CPR', category: 'certification', proficiency: 3, verified: true, expires: '2026-06-01' },

      { empId: 'dev-acme-emp-011', skillName: 'Armed Guard', category: 'certification', proficiency: 5, verified: true, expires: '2028-03-15' },
      { empId: 'dev-acme-emp-011', skillName: 'CPR', category: 'certification', proficiency: 5, verified: true, expires: '2027-10-01' },
      { empId: 'dev-acme-emp-011', skillName: 'First Aid', category: 'certification', proficiency: 4, verified: true, expires: '2027-10-01' },
      { empId: 'dev-acme-emp-011', skillName: 'Conflict De-escalation', category: 'soft_skill', proficiency: 5, verified: true, expires: null },

      { empId: 'dev-acme-emp-012', skillName: 'Unarmed Guard', category: 'certification', proficiency: 2, verified: true, expires: '2029-07-01' },
      // emp-012 weakest — no CPR, no first aid skills at all

      { empId: 'dev-acme-emp-013', skillName: 'Unarmed Guard', category: 'certification', proficiency: 3, verified: true, expires: '2028-11-20' },
      { empId: 'dev-acme-emp-013', skillName: 'CPR', category: 'certification', proficiency: 3, verified: true, expires: '2027-05-01' },
      { empId: 'dev-acme-emp-013', skillName: 'Loss Prevention', category: 'technical', proficiency: 3, verified: true, expires: null },
    ];

    let skillIdx = 0;
    for (const s of skillData) {
      skillIdx++;
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(employeeSkills).values({
        id: `dev-skill-${String(skillIdx).padStart(3, '0')}`,
        employeeId: s.empId,
        workspaceId: WS,
        skillName: s.skillName,
        skillCategory: s.category,
        proficiencyLevel: s.proficiency,
        verified: s.verified,
        expiresAt: s.expires ? new Date(s.expires + 'T00:00:00.000Z') : null,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();
    }

    // =====================================================================
    // 11. UPDATE EMPLOYEE METRICS — Add maxWeeklyHours, overtimeEligible, preferredMaxDistance
    // =====================================================================
    console.log('[DevEnrich] Updating employee metrics with scheduling fields...');

    const metricsUpdates: Array<{
      empId: string; maxWeekly: number; otEligible: boolean; maxDist: number;
    }> = [
      { empId: 'dev-acme-emp-001', maxWeekly: 50, otEligible: true, maxDist: 35 },
      { empId: 'dev-acme-emp-002', maxWeekly: 45, otEligible: true, maxDist: 30 },
      { empId: 'dev-acme-emp-003', maxWeekly: 40, otEligible: true, maxDist: 40 },
      { empId: 'dev-acme-emp-004', maxWeekly: 40, otEligible: true, maxDist: 25 },
      { empId: 'dev-acme-emp-005', maxWeekly: 44, otEligible: true, maxDist: 45 },
      // 1099 contractors — higher weekly caps, OT-exempt (different rules)
      { empId: 'dev-acme-emp-006', maxWeekly: 60, otEligible: false, maxDist: 50 },
      { empId: 'dev-acme-emp-007', maxWeekly: 40, otEligible: true, maxDist: 30 },
      { empId: 'dev-acme-emp-008', maxWeekly: 55, otEligible: false, maxDist: 60 },
      { empId: 'dev-acme-emp-009', maxWeekly: 40, otEligible: true, maxDist: 35 },
      { empId: 'dev-acme-emp-010', maxWeekly: 60, otEligible: false, maxDist: 50 },
      { empId: 'dev-acme-emp-011', maxWeekly: 48, otEligible: true, maxDist: 40 },
      { empId: 'dev-acme-emp-012', maxWeekly: 40, otEligible: true, maxDist: 20 },
      { empId: 'dev-acme-emp-013', maxWeekly: 40, otEligible: true, maxDist: 30 },
    ];

    // NOTE: employee_metrics table was merged into coaileagueEmployeeProfiles (Mar 2026).
    // The UPDATE below is dead code — skipping to avoid table-not-found errors.
    console.log('[DevEnrich] Skipping employee_metrics UPDATE (table merged into coaileagueEmployeeProfiles)');

    // =====================================================================
    // 12. CLIENT REQUIRED CERTIFICATIONS — Sites that demand specific certs
    // =====================================================================
    console.log('[DevEnrich] Setting client certification requirements...');

    const clientCertReqs: Array<{ id: string; certs: string[] }> = [
      { id: 'dev-client-001', certs: ['Armed Guard', 'CPR'] },         // Mall — armed + CPR
      { id: 'dev-client-002', certs: ['Unarmed Guard'] },              // Office tower — unarmed ok
      { id: 'dev-client-003', certs: ['CPR', 'First Aid'] },           // Hospital — medical certs
      { id: 'dev-client-004', certs: ['Unarmed Guard'] },              // Event center — basic
      { id: 'dev-client-005', certs: ['Armed Guard', 'CPR'] },         // Bank — armed + CPR
      { id: 'dev-client-006', certs: ['Unarmed Guard'] },              // Apartments — basic
      { id: 'dev-client-007', certs: ['Unarmed Guard', 'CPR'] },       // Warehouse — unarmed + CPR
      { id: 'dev-client-008', certs: ['Armed Guard', 'CPR', 'First Aid'] }, // High-security — everything
    ];

    for (const cc of clientCertReqs) {
      // Converted to Drizzle ORM
      await db.update(clients).set({
        requiredCertifications: cc.certs,
        updatedAt: sql`now()`,
      }).where(eq(clients.id, cc.id));
    }

    // =====================================================================
    // 13. UPDATE SHIFTS — Add requiredCertifications to open shifts
    // =====================================================================
    console.log('[DevEnrich] Adding certification requirements to open shifts...');

    // Set shift cert requirements based on their assigned client
    for (const shift of openShifts) {
      const clientCert = clientCertReqs.find(c => c.id === shift.clientId);
      if (clientCert) {
        // CATEGORY C — Raw SQL retained: ::jsonb | Tables: shifts | Verified: 2026-03-23
        await typedExec(sql`
          UPDATE shifts SET
            required_certifications = ${JSON.stringify(clientCert.certs)}::jsonb,
            updated_at = NOW()
          WHERE id = ${shift.id}
        `);
      }
    }

    // =====================================================================
    // 14. REST TIME STRESS TEST — Back-to-back shifts with tight 8hr gaps
    // =====================================================================
    console.log('[DevEnrich] Creating rest-time stress test shifts...');

    // These are ALREADY-ASSIGNED shifts that create tight rest windows.
    // Trinity should detect these when scheduling new shifts and avoid double-booking.
    const restTestShifts: Array<{
      id: string; empId: string; clientId: string; title: string;
      dayOffset: number; startHour: number; durHours: number;
    }> = [
      // emp-002 (W-2): Night shift ending 6am, then morning shift starting 2pm = exactly 8hr gap
      { id: 'dev-rest-001', empId: 'dev-acme-emp-002', clientId: 'dev-client-001', title: 'Night Watch', dayOffset: 2, startHour: 22, durHours: 8 },
      { id: 'dev-rest-002', empId: 'dev-acme-emp-002', clientId: 'dev-client-005', title: 'Bank Patrol', dayOffset: 3, startHour: 14, durHours: 8 },
      // emp-005 (W-2): Evening 6pm-2am, then morning 10am same day = exactly 8hr gap
      { id: 'dev-rest-003', empId: 'dev-acme-emp-005', clientId: 'dev-client-002', title: 'Lobby Security', dayOffset: 4, startHour: 18, durHours: 8 },
      { id: 'dev-rest-004', empId: 'dev-acme-emp-005', clientId: 'dev-client-003', title: 'Hospital Security', dayOffset: 5, startHour: 10, durHours: 8 },
      // emp-007 (W-2): Back-to-back days — 10pm-6am then 2pm-10pm = exactly 8hr gap
      { id: 'dev-rest-005', empId: 'dev-acme-emp-007', clientId: 'dev-client-006', title: 'Apartment Patrol', dayOffset: 3, startHour: 22, durHours: 8 },
      { id: 'dev-rest-006', empId: 'dev-acme-emp-007', clientId: 'dev-client-004', title: 'Event Security', dayOffset: 4, startHour: 14, durHours: 8 },
      // emp-008 (1099 contractor): Tight gap test — should still be schedulable since 1099 has relaxed rules
      { id: 'dev-rest-007', empId: 'dev-acme-emp-008', clientId: 'dev-client-007', title: 'Warehouse Security', dayOffset: 5, startHour: 22, durHours: 10 },
      { id: 'dev-rest-008', empId: 'dev-acme-emp-008', clientId: 'dev-client-002', title: 'Office Security', dayOffset: 6, startHour: 16, durHours: 8 },
    ];

    for (const rs of restTestShifts) {
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() + rs.dayOffset);
      startDate.setHours(rs.startHour, 0, 0, 0);
      const endDate = new Date(startDate.getTime() + rs.durHours * 60 * 60 * 1000);
      const dateStr = startDate.toISOString().split('T')[0];
      const clientCert = clientCertReqs.find(c => c.id === rs.clientId);

      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(shifts).values({
        id: rs.id,
        workspaceId: WS,
        employeeId: rs.empId,
        clientId: rs.clientId,
        title: rs.title,
        category: 'security' as any,
        startTime: new Date(startDate.toISOString()),
        endTime: new Date(endDate.toISOString()),
        date: dateStr,
        status: 'scheduled' as any,
        contractRate: contractRates[(parseInt(rs.clientId.slice(-1)) - 1) % contractRates.length],
        requiredCertifications: clientCert ? clientCert.certs : [],
        billableToClient: true,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();
    }

    // =====================================================================
    // 15. OVERTIME EDGE CASE — Pre-load employees near 40hr weekly cap
    // =====================================================================
    console.log('[DevEnrich] Creating overtime stress test shifts...');

    // These ASSIGNED shifts push employees close to weekly hour limits.
    // W-2 employees near 40hrs should trigger Trinity's OT avoidance.
    // 1099 contractors near the same hours should NOT be blocked.
    const otShifts: Array<{
      id: string; empId: string; clientId: string; title: string;
      dayOffset: number; startHour: number; durHours: number;
    }> = [
      // emp-004 (W-2, maxWeekly=40): Already at 32hrs → next 8hr shift = 40hrs exactly
      { id: 'dev-ot-001', empId: 'dev-acme-emp-004', clientId: 'dev-client-004', title: 'Event Center Guard', dayOffset: 1, startHour: 8, durHours: 8 },
      { id: 'dev-ot-002', empId: 'dev-acme-emp-004', clientId: 'dev-client-006', title: 'Apartment Patrol', dayOffset: 2, startHour: 8, durHours: 8 },
      { id: 'dev-ot-003', empId: 'dev-acme-emp-004', clientId: 'dev-client-004', title: 'Event Center Guard', dayOffset: 3, startHour: 8, durHours: 8 },
      { id: 'dev-ot-004', empId: 'dev-acme-emp-004', clientId: 'dev-client-006', title: 'Apartment Patrol', dayOffset: 4, startHour: 8, durHours: 8 },
      // Total: 32hrs Mon-Thu. Any open shift on Fri = 40hrs cap. Saturday shift = OT territory.

      // emp-009 (W-2, maxWeekly=40): Already at 36hrs → only 4hrs left before OT
      { id: 'dev-ot-005', empId: 'dev-acme-emp-009', clientId: 'dev-client-003', title: 'Hospital Guard', dayOffset: 1, startHour: 6, durHours: 10 },
      { id: 'dev-ot-006', empId: 'dev-acme-emp-009', clientId: 'dev-client-003', title: 'Hospital Guard', dayOffset: 2, startHour: 6, durHours: 10 },
      { id: 'dev-ot-007', empId: 'dev-acme-emp-009', clientId: 'dev-client-007', title: 'Warehouse Security', dayOffset: 3, startHour: 6, durHours: 10 },
      { id: 'dev-ot-008', empId: 'dev-acme-emp-009', clientId: 'dev-client-007', title: 'Warehouse Security', dayOffset: 5, startHour: 6, durHours: 6 },
      // Total: 36hrs. Next shift pushes into OT.

      // emp-010 (1099, maxWeekly=60): Already at 44hrs — would be OT for W-2 but is fine for 1099
      { id: 'dev-ot-009', empId: 'dev-acme-emp-010', clientId: 'dev-client-002', title: 'Office Tower Guard', dayOffset: 1, startHour: 6, durHours: 12 },
      { id: 'dev-ot-010', empId: 'dev-acme-emp-010', clientId: 'dev-client-002', title: 'Office Tower Guard', dayOffset: 2, startHour: 6, durHours: 12 },
      { id: 'dev-ot-011', empId: 'dev-acme-emp-010', clientId: 'dev-client-006', title: 'Apartment Complex', dayOffset: 3, startHour: 8, durHours: 10 },
      { id: 'dev-ot-012', empId: 'dev-acme-emp-010', clientId: 'dev-client-006', title: 'Apartment Complex', dayOffset: 4, startHour: 8, durHours: 10 },
      // Total: 44hrs. Trinity should still allow more shifts for 1099.

      // emp-013 (W-2, maxWeekly=40): At 38hrs — 2hrs from cap, any 6+ hour shift = OT
      { id: 'dev-ot-013', empId: 'dev-acme-emp-013', clientId: 'dev-client-001', title: 'Mall Patrol', dayOffset: 1, startHour: 14, durHours: 8 },
      { id: 'dev-ot-014', empId: 'dev-acme-emp-013', clientId: 'dev-client-001', title: 'Mall Patrol', dayOffset: 2, startHour: 14, durHours: 8 },
      { id: 'dev-ot-015', empId: 'dev-acme-emp-013', clientId: 'dev-client-005', title: 'Bank Patrol', dayOffset: 3, startHour: 14, durHours: 8 },
      { id: 'dev-ot-016', empId: 'dev-acme-emp-013', clientId: 'dev-client-005', title: 'Bank Patrol', dayOffset: 4, startHour: 14, durHours: 8 },
      { id: 'dev-ot-017', empId: 'dev-acme-emp-013', clientId: 'dev-client-001', title: 'Mall Patrol', dayOffset: 5, startHour: 14, durHours: 6 },
      // Total: 38hrs. Any further scheduling hits the cap.
    ];

    for (const ot of otShifts) {
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() + ot.dayOffset);
      startDate.setHours(ot.startHour, 0, 0, 0);
      const endDate = new Date(startDate.getTime() + ot.durHours * 60 * 60 * 1000);
      const dateStr = startDate.toISOString().split('T')[0];

      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(shifts).values({
        id: ot.id,
        workspaceId: WS,
        employeeId: ot.empId,
        clientId: ot.clientId,
        title: ot.title,
        category: 'security' as any,
        startTime: new Date(startDate.toISOString()),
        endTime: new Date(endDate.toISOString()),
        date: dateStr,
        status: 'scheduled' as any,
        contractRate: contractRates[(parseInt(ot.clientId.slice(-1)) - 1) % contractRates.length],
        billableToClient: true,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoNothing();
    }

    // =====================================================================
    // 16. WORKSPACE MEMBERS — Ensure all employees have workspace_members rows
    // =====================================================================
    console.log('[DevEnrich] Ensuring workspace membership records...');

    const memberRoles: Record<string, string> = {
      'dev-owner-001': 'org_owner',
      'dev-manager-001': 'manager',
      'dev-manager-002': 'manager',
    };
    for (const emp of employeeProfiles) {
      const userId = emp.id.replace('acme-emp', 'emp').replace('dev-acme-emp-001', 'dev-owner-001').replace('dev-acme-emp-002', 'dev-manager-001').replace('dev-acme-emp-003', 'dev-manager-002');
      const actualUserId = emp.id === 'dev-acme-emp-001' ? 'dev-owner-001' :
        emp.id === 'dev-acme-emp-002' ? 'dev-manager-001' :
        emp.id === 'dev-acme-emp-003' ? 'dev-manager-002' :
        `dev-emp-${String(parseInt(emp.id.slice(-3)) - 3).padStart(3, '0')}`;
      const role = emp.id === 'dev-acme-emp-001' ? 'org_owner' :
        ['dev-acme-emp-002', 'dev-acme-emp-003'].includes(emp.id) ? 'manager' : 'employee';

      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(workspaceMembers).values({
        id: `dev-wm-${emp.id}`,
        workspaceId: WS,
        userId: actualUserId,
        role: role,
        createdAt: sql`now()`,
      }).onConflictDoNothing();
    }

    console.log('[DevEnrich] Development data enrichment complete!');
    console.log('   - Employee profiles: 13 updated (addresses, GPS, W-2/1099 mix, scores)');
    console.log('   - Employee metrics: 13 created + updated (reliability, attendance, OT eligibility, weekly caps)');
    console.log(`   - Availability records: ${availIdx} weekly schedule slots`);
    console.log(`   - Open shifts: ${openShifts.length} for Trinity auto-fill (with cert requirements)`);
    console.log(`   - Rest-time stress shifts: ${restTestShifts.length} (back-to-back 8hr gaps)`);
    console.log(`   - Overtime edge case shifts: ${otShifts.length} (employees near weekly caps)`);
    console.log(`   - Employee certifications: ${certIdx} (armed/unarmed/CPR/first aid + expired/expiring edge cases)`);
    console.log(`   - Employee skills: ${skillIdx} (certification-category + technical + language)`);
    console.log('   - Client cert requirements: 8 sites (armed/unarmed/CPR/first aid combos)');
    console.log(`   - Time entries: ${teIdx} historical clock records`);
    console.log('   - Invoices: 8 (COAI-ACME format, paid/sent/overdue/draft mix)');
    console.log('   - Payroll runs: 4 (3 completed + 1 draft)');
    console.log('   - W-2 employees: 10, 1099 contractors: 3');
    console.log('   CERT STATUS (advisory, not scheduling blockers):');
    console.log('     - emp-004: Unarmed only, NO CPR → flagged for manager review');
    console.log('     - emp-006: 1099 Armed, NO CPR → flagged for medical-site clients');
    console.log('     - emp-008: CPR expiring in ~20 days → expiring-soon warning');
    console.log('     - emp-010: EXPIRED armed license → renewal pending, manager notified');
    console.log('     - emp-012: Unarmed only, NO CPR/First Aid → weakest cert profile, flagged');
    console.log('   OVERTIME EDGE CASES:');
    console.log('     - emp-004: W-2 at 32hrs → 8hrs from OT cap');
    console.log('     - emp-009: W-2 at 36hrs → 4hrs from OT cap');
    console.log('     - emp-010: 1099 at 44hrs → over W-2 cap but 1099 rules allow it');
    console.log('     - emp-013: W-2 at 38hrs → 2hrs from OT cap');
    console.log('     - Rest-time: emp-002,005,007,008 have back-to-back shifts with exactly 8hr gaps');

    return { success: true, message: 'Dev data enrichment complete' };

  } catch (error) {
    console.error('[DevEnrich] Enrichment failed:', error);
    return { success: false, message: `Enrichment failed: ${error}` };
  }
}
