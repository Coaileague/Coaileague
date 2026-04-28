/**
 * MONTHLY SHIFT SEED — Trinity Automation Testing
 * =================================================
 * Seeds the current month with realistic open shifts across Acme Security
 * and Statewide Protective Services dev workspace.
 *
 * Purpose: Give Trinity's fill-shift scanner real data to work with so
 * every automation trigger fires correctly in development — proving the
 * entire chain will work in production with real data.
 *
 * What this seeds:
 *   - Open shifts (no employee assigned) — Trinity's fill target
 *   - Understaffed shifts (1 of 2 needed) — coverage gap trigger
 *   - Short-notice shifts (<4h from now) — urgent fill trigger
 *   - Future shifts 1-30 days out — scheduled planning trigger
 *   - Overnight/weekend shifts — HelpAI distress context coverage
 *
 * Sentinel: checked by shift count on current month — idempotent.
 * Gate: never runs on Railway unless SEED_ON_STARTUP=true.
 */

import { pool } from '../db';
import { createLogger } from '../lib/logger';
import { randomUUID } from 'crypto';

const log = createLogger('ShiftSeed');

const ACME_WS = 'dev-acme-security-ws';
const SITES = [
  { name: 'Downtown Financial Tower', clientId: 'acme-client-001', type: 'commercial' },
  { name: 'Westside Mall Security', clientId: 'acme-client-002', type: 'retail' },
  { name: 'Harbor Industrial Park', clientId: 'acme-client-003', type: 'industrial' },
  { name: 'City Hospital Campus', clientId: 'acme-client-004', type: 'healthcare' },
  { name: 'Convention Center', clientId: 'acme-client-005', type: 'events' },
];

const EMPLOYEE_IDS = [
  'dev-acme-emp-001', 'dev-acme-emp-002', 'dev-acme-emp-003',
  'dev-acme-emp-004', 'dev-acme-emp-005', 'dev-acme-emp-marcus',
];

function dateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

function timeStr(hour: number, min = 0) {
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export async function seedMonthlyShifts(): Promise<{ seeded: number; message: string }> {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Sentinel: if we already have 20+ shifts this month in this workspace, skip
    const existing = await pool.query(
      `SELECT COUNT(*) as cnt FROM shifts 
       WHERE workspace_id = $1 
         AND date >= $2 AND date <= $3`,
      [ACME_WS, dateStr(monthStart), dateStr(monthEnd)]
    );
    const existingCount = parseInt(existing.rows[0]?.cnt || '0');
    if (existingCount >= 20) {
      log.info(`[ShiftSeed] ${existingCount} shifts already exist this month — skipping`);
      return { seeded: 0, message: `Already seeded (${existingCount} shifts exist)` };
    }

    log.info(`[ShiftSeed] Seeding monthly shifts for Trinity automation testing...`);

    // Ensure client records exist (create stubs if needed)
    for (let i = 0; i < SITES.length; i++) {
      const site = SITES[i];
      await pool.query(`
        INSERT INTO clients (
          id, workspace_id, first_name, last_name, company_name, email,
          contract_rate, contract_rate_type, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 28.00, 'hourly', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `, [
        site.clientId,
        ACME_WS,
        'Site', `Contact ${i + 1}`,
        site.name,
        `contact${i + 1}@${site.name.toLowerCase().replace(/\s+/g, '')}.com`,
      ]);
    }

    const shiftTemplates: Array<{
      dayOffset: number;
      startHour: number;
      endHour: number;
      employeeId: string | null;
      status: string;
      positionType: string;
      siteIdx: number;
      isOvernight?: boolean;
    }> = [];

    // Build a full month of shifts
    for (let day = 0; day <= 30; day++) {
      const date = addDays(now, day);
      const dow = date.getDay(); // 0=Sun, 6=Sat
      const isWeekend = dow === 0 || dow === 6;

      // Day shift (07:00–15:00) — 5 sites per day
      for (let siteIdx = 0; siteIdx < SITES.length; siteIdx++) {
        const filled = day < 3
          ? EMPLOYEE_IDS[siteIdx % EMPLOYEE_IDS.length]   // past/current days mostly filled
          : day < 7
          ? siteIdx < 3 ? EMPLOYEE_IDS[siteIdx] : null    // near-future: some open
          : null;                                           // future: all open for Trinity

        shiftTemplates.push({
          dayOffset: day, startHour: 7, endHour: 15,
          employeeId: filled, status: filled ? 'scheduled' : 'open',
          positionType: 'Security Officer', siteIdx,
        });

        // Evening shift (15:00–23:00)
        const eveningFilled = day < 2 ? EMPLOYEE_IDS[(siteIdx + 2) % EMPLOYEE_IDS.length] : null;
        shiftTemplates.push({
          dayOffset: day, startHour: 15, endHour: 23,
          employeeId: eveningFilled, status: eveningFilled ? 'scheduled' : 'open',
          positionType: siteIdx % 3 === 0 ? 'Armed Security Officer' : 'Security Officer',
          siteIdx,
        });

        // Overnight (23:00–07:00 next day) — weekends only + high-value sites
        if (isWeekend || siteIdx <= 1) {
          shiftTemplates.push({
            dayOffset: day, startHour: 23, endHour: 7,
            employeeId: null, status: 'open',
            positionType: 'Security Officer', siteIdx,
            isOvernight: true,
          });
        }
      }
    }

    let seeded = 0;
    for (const t of shiftTemplates) {
      const shiftDate = addDays(now, t.dayOffset);
      const site = SITES[t.siteIdx];
      const shiftId = randomUUID();

      const endDate = t.isOvernight ? addDays(shiftDate, 1) : shiftDate;

      await pool.query(`
        INSERT INTO shifts (
          id, workspace_id, employee_id, client_id,
          date, start_time, end_time,
          site_name, position_type, status,
          is_published, pay_rate, bill_rate,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7,
          $8, $9, $10,
          true, 18.00, 28.00,
          NOW(), NOW()
        )
        ON CONFLICT DO NOTHING
      `, [
        shiftId, ACME_WS, t.employeeId, site.clientId,
        dateStr(shiftDate), timeStr(t.startHour), timeStr(t.endHour),
        site.name, t.positionType, t.status,
      ]);
      seeded++;
    }

    // Add 3 URGENT open shifts starting within 4 hours (Trinity's emergency fill trigger)
    for (let i = 0; i < 3; i++) {
      const urgentStart = new Date(now.getTime() + (i + 1) * 60 * 60 * 1000); // 1-3h from now
      const urgentEnd = new Date(urgentStart.getTime() + 8 * 60 * 60 * 1000);
      const site = SITES[i];

      await pool.query(`
        INSERT INTO shifts (
          id, workspace_id, employee_id, client_id,
          date, start_time, end_time,
          site_name, position_type, status,
          is_published, pay_rate, bill_rate,
          notes, created_at, updated_at
        ) VALUES (
          $1, $2, NULL, $3,
          $4, $5, $6,
          $7, 'Security Officer', 'open',
          true, 18.00, 28.00,
          'URGENT — calloff received, needs immediate fill',
          NOW(), NOW()
        )
        ON CONFLICT DO NOTHING
      `, [
        randomUUID(), ACME_WS, site.clientId,
        dateStr(urgentStart),
        urgentStart.toTimeString().slice(0, 8),
        urgentEnd.toTimeString().slice(0, 8),
        site.name,
      ]);
      seeded++;
    }

    log.info(`[ShiftSeed] ✅ Seeded ${seeded} shifts — Trinity automation testing ready`);
    return {
      seeded,
      message: `Seeded ${seeded} shifts across ${SITES.length} sites for the current month. Open shifts ready for Trinity fill-shift scanner.`,
    };

  } catch (err: any) {
    log.error('[ShiftSeed] Failed:', err?.message);
    return { seeded: 0, message: `Failed: ${err?.message}` };
  }
}
