/**
 * STRESS TEST SEED — 30 days of shifts for ACME + Anvil
 * Creates realistic data for Trinity to process:
 * - Past shifts: completed, ready for payroll/invoices
 * - Future shifts: open/assigned for coverage testing
 */

import { db } from '../db';
import { shifts, timeEntries } from '@shared/schema';
import { sql } from 'drizzle-orm';

const DEV_ACME_WS = 'dev-acme-security-ws';
const DEV_ANVIL_WS = 'dev-anvil-security-ws';

function daysOffset(daysAgo: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function dateStr(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysOffset);
  return d.toISOString().split('T')[0];
}

// ACME clients and employees from existing seed
const ACME_CLIENTS = [
  { id: 'dev-client-downtown-mall', name: 'Downtown Mall', billRate: '28.50', payRate: '18.00' },
  { id: 'dev-client-tech-corp', name: 'TechCorp HQ', billRate: '32.00', payRate: '20.00' },
  { id: 'dev-client-hospital', name: 'Memorial Hospital', billRate: '35.00', payRate: '22.00' },
  { id: 'dev-client-airport', name: 'Regional Airport', billRate: '38.00', payRate: '24.00' },
];

const ACME_EMPLOYEES = [
  'dev-acme-emp-marcus', 'dev-manager-001-emp', 'dev-acme-emp-oos',
  'dev-emp-001-emp', 'dev-manager-002-emp', 'dev-emp-002-emp',
];

const ACME_SHIFT_TEMPLATES = [
  { startH: 12, endH: 20, title: 'Day Shift — Security Officer' },     // 7AM CST / 8AM EST
  { startH: 20, endH: 28, title: 'Evening Shift — Security Officer' },  // 3PM CST / 4PM EST
  { startH: 4, endH: 12, title: 'Night Shift — Security Officer' },    // 11PM CST / midnight EST
  { startH: 14, endH: 22, title: 'Business Hours Post' },              // 9AM CST / 10AM EST
];

const ANVIL_CLIENTS = [
  { id: 'anvil-c-001', name: 'SA Medical Center', billRate: '34.00', payRate: '21.00' },
  { id: 'anvil-c-002', name: 'Riverwalk Hotel', billRate: '30.00', payRate: '19.00' },
  { id: 'anvil-c-003', name: 'Pearl District', billRate: '28.00', payRate: '17.50' },
];

const ANVIL_EMPLOYEES = [
  'anvil-e-003', 'anvil-e-004', 'anvil-e-005', 'anvil-e-007',
  'anvil-e-009', 'anvil-e-010', 'anvil-e-011',
];

export async function runStressTestSeed() {
  console.log('[StressTest] Starting 30-day shift seed...');
  let created = 0;
  let skipped = 0;

  // ── ACME: Past 15 days (completed shifts for payroll/invoices) ──────────────
  for (let daysAgo = 15; daysAgo >= 1; daysAgo--) {
    const dayDate = dateStr(daysAgo);
    
    for (let clientIdx = 0; clientIdx < ACME_CLIENTS.length; clientIdx++) {
      const client = ACME_CLIENTS[clientIdx];
      
      for (let tIdx = 0; tIdx < ACME_SHIFT_TEMPLATES.length; tIdx++) {
        const tmpl = ACME_SHIFT_TEMPLATES[tIdx];
        const empIdx = (daysAgo * 4 + tIdx) % ACME_EMPLOYEES.length;
        const empId = ACME_EMPLOYEES[empIdx];
        const shiftId = `stress-acme-past-${daysAgo}-${clientIdx}-${tIdx}`;
        
        // Alternate between assigned and open for realism
        const isOpen = (clientIdx === 0 && tIdx === 2) || (clientIdx === 2 && tIdx === 0);
        
        try {
          await db.insert(shifts).values({
            id: shiftId,
            workspaceId: DEV_ACME_WS,
            employeeId: isOpen ? null : empId,
            clientId: client.id,
            title: `${client.name} — ${tmpl.title}`,
            date: dayDate,
            startTime: sql`${daysOffset(daysAgo, tmpl.startH)}::timestamptz`,
            endTime: sql`${daysOffset(daysAgo, tmpl.endH < tmpl.startH ? tmpl.endH + 24 : tmpl.endH)}::timestamptz`,
            status: isOpen ? 'open' : 'completed',
            billRate: client.billRate,
            payRate: client.payRate,
            billableToClient: true,
            aiGenerated: false,
            createdAt: sql`now()`,
            updatedAt: sql`now()`,
          }).onConflictDoNothing();
          created++;
        } catch (e: any) {
          skipped++;
        }
      }
    }
  }

  // ── ACME: Future 15 days (open shifts for Trinity to fill) ─────────────────
  for (let daysOut = 1; daysOut <= 15; daysOut++) {
    const d = new Date();
    d.setDate(d.getDate() + daysOut);
    const dayDate = d.toISOString().split('T')[0];
    
    function futureTime(daysOut: number, hour: number): string {
      const fd = new Date();
      fd.setDate(fd.getDate() + daysOut);
      fd.setHours(hour, 0, 0, 0);
      return fd.toISOString();
    }
    
    for (let clientIdx = 0; clientIdx < ACME_CLIENTS.length; clientIdx++) {
      const client = ACME_CLIENTS[clientIdx];
      
      for (let tIdx = 0; tIdx < ACME_SHIFT_TEMPLATES.length; tIdx++) {
        const tmpl = ACME_SHIFT_TEMPLATES[tIdx];
        const empIdx = (daysOut * 3 + clientIdx + tIdx) % ACME_EMPLOYEES.length;
        const isOpen = tIdx >= 2 || (daysOut > 10 && tIdx >= 1);
        const shiftId = `stress-acme-future-${daysOut}-${clientIdx}-${tIdx}`;
        
        try {
          await db.insert(shifts).values({
            id: shiftId,
            workspaceId: DEV_ACME_WS,
            employeeId: isOpen ? null : ACME_EMPLOYEES[empIdx],
            clientId: client.id,
            title: `${client.name} — ${tmpl.title}`,
            date: dayDate,
            startTime: sql`${futureTime(daysOut, tmpl.startH)}::timestamptz`,
            endTime: sql`${futureTime(daysOut, tmpl.endH < tmpl.startH ? tmpl.endH + 24 : tmpl.endH)}::timestamptz`,
            status: isOpen ? 'open' : 'assigned',
            billRate: client.billRate,
            payRate: client.payRate,
            billableToClient: true,
            aiGenerated: false,
            createdAt: sql`now()`,
            updatedAt: sql`now()`,
          }).onConflictDoNothing();
          created++;
        } catch (e: any) {
          skipped++;
        }
      }
    }
  }

  console.log(`[StressTest] Done — ${created} shifts created, ${skipped} skipped`);
  return { created, skipped };
}
