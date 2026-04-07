/**
 * Trinity Shift Generator
 * =======================
 * Creates open shifts for the upcoming week based on client contracts.
 *
 * Pipeline position:
 *   [Trinity generates shifts] → [Trinity fills shifts with employees]
 *   → [Time entries approved] → [Invoices created] → [Payroll approved]
 *
 * Key rules:
 * 1. Reads client demand (minimumStaffing, coverage schedule, contract rate)
 * 2. Checks how many shifts ALREADY exist for each client/day/hour slot
 * 3. Creates ONLY the gap (demand - existing) — never exceeds client staffing requirement
 * 4. All new shifts are draft/unassigned — the autonomous scheduler assigns employees
 * 5. Never duplicates — idempotent across multiple runs
 */

import { db } from '../../db';
import { shifts, clients } from '@shared/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityShiftGenerator');


export interface ShiftGenerationResult {
  workspaceId: string;
  weekStart: Date;
  weekEnd: Date;
  shiftsCreated: number;
  clientsScheduled: number;
  skippedClients: Array<{ clientId: string; clientName: string; reason: string }>;
  createdShiftIds: string[];
}

interface ClientCoverageProfile {
  clientId: string;
  clientName: string;
  contractRatePerHour: number;
  guardsPerShift: number;
  shiftsPerDay: number;
  shiftLengthHours: number;
  shiftLengthsBySlot: number[];
  shiftStartHours: number[];
  daysPerWeek: number[];
}

const DEFAULT_SHIFT_LENGTH = 8;
const DEFAULT_GUARDS_PER_SHIFT = 1;
const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];
const DEFAULT_SHIFT_STARTS = [7];
const MAX_SHIFT_DURATION_HOURS = 12;
const MAX_SHIFTS_PER_CLIENT_PER_WEEK = 42; // 3 shifts/day × 7 days × 2 guards = hard safety cap

const DAY_NAME_TO_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function parseHourFromTime(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const [h] = timeStr.split(':').map(Number);
  if (isNaN(h) || h < 0 || h > 23) return null;
  return h;
}

function buildCoverageProfile(client: any): ClientCoverageProfile {
  const contractRate = parseFloat(client.contractRate || '0');
  const clientName = client.companyName || `${client.firstName} ${client.lastName}`;
  const guardsPerShift = Math.max(1, client.minimumStaffing || DEFAULT_GUARDS_PER_SHIFT);

  let shiftsPerDay = 1;
  let shiftStartHours = [...DEFAULT_SHIFT_STARTS];
  let shiftLengthHours = DEFAULT_SHIFT_LENGTH;
  let daysPerWeek: number[];

  const coverageType: string = client.coverageType || 'custom';
  const coverageDays: string[] | null = client.coverageDays;
  const coverageStartTime: string | null = client.coverageStartTime;
  const coverageEndTime: string | null = client.coverageEndTime;

  let shiftLengthsBySlot: number[];

  if (coverageType === '24_7') {
    shiftsPerDay = 3;
    shiftStartHours = [0, 8, 16];
    shiftLengthHours = 8;
    shiftLengthsBySlot = [8, 8, 8];
    daysPerWeek = [0, 1, 2, 3, 4, 5, 6];
  } else if (coverageType === 'business_hours') {
    shiftsPerDay = 1;
    shiftStartHours = [9];
    shiftLengthHours = 8;
    shiftLengthsBySlot = [8];
    daysPerWeek = [1, 2, 3, 4, 5];
  } else {
    const startHour = parseHourFromTime(coverageStartTime);
    const endHour = parseHourFromTime(coverageEndTime);

    if (startHour !== null) {
      let totalHours: number;
      if (endHour !== null) {
        totalHours = endHour > startHour
          ? endHour - startHour
          : (24 - startHour) + endHour;
      } else {
        totalHours = DEFAULT_SHIFT_LENGTH;
      }

      if (totalHours > MAX_SHIFT_DURATION_HOURS) {
        const numShifts = Math.ceil(totalHours / MAX_SHIFT_DURATION_HOURS);
        const baseLength = Math.floor(totalHours / numShifts);
        const extraHours = totalHours - baseLength * numShifts;
        shiftStartHours = [];
        shiftLengthsBySlot = [];
        let cursor = startHour;
        for (let i = 0; i < numShifts; i++) {
          shiftStartHours.push(cursor % 24);
          const thisLen = i < extraHours ? baseLength + 1 : baseLength;
          shiftLengthsBySlot.push(thisLen);
          cursor += thisLen;
        }
        shiftLengthHours = baseLength;
        shiftsPerDay = numShifts;
      } else {
        shiftStartHours = [startHour];
        shiftLengthHours = totalHours;
        shiftLengthsBySlot = [totalHours];
        shiftsPerDay = 1;
      }
    } else {
      shiftsPerDay = 1;
      shiftStartHours = [7];
      shiftLengthHours = DEFAULT_SHIFT_LENGTH;
      shiftLengthsBySlot = [DEFAULT_SHIFT_LENGTH];
    }

    if (coverageDays && coverageDays.length > 0) {
      daysPerWeek = coverageDays
        .map(d => DAY_NAME_TO_INDEX[d.toLowerCase()])
        .filter(n => n !== undefined) as number[];
      if (daysPerWeek.length === 0) daysPerWeek = DEFAULT_WEEKDAYS;
    } else {
      daysPerWeek = DEFAULT_WEEKDAYS;
    }
  }

  return {
    clientId: client.id,
    clientName,
    contractRatePerHour: contractRate,
    guardsPerShift,
    shiftsPerDay,
    shiftLengthHours,
    shiftLengthsBySlot,
    shiftStartHours,
    daysPerWeek,
  };
}

/**
 * Count how many shifts already exist per client/day/hour slot.
 * Returns a Map where key = "YYYY-M-D-H" and value = count of shifts at that slot.
 * This is the core dedup mechanism — we only create (guardsNeeded - existingCount) shifts.
 */
async function getExistingShiftCounts(
  workspaceId: string,
  clientId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<Map<string, number>> {
  const existing = await db
    .select({ startTime: shifts.startTime })
    .from(shifts)
    .where(
      and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.clientId, clientId),
        gte(shifts.startTime, weekStart),
        lte(shifts.startTime, weekEnd)
      )
    );

  const counts = new Map<string, number>();
  for (const s of existing) {
    if (s.startTime) {
      const d = new Date(s.startTime);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

function getTargetWeekStart(offsetWeeks = 0): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Main entry point: Generate open shifts for the target week.
 * Idempotent — safe to call multiple times; only creates the gap between
 * existing shifts and client demand.
 */
export async function generateWeeklyShifts(
  workspaceId: string,
  offsetWeeks = 0,
  maxClients = 100,
): Promise<ShiftGenerationResult> {
  const weekStart = getTargetWeekStart(offsetWeeks);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  log.info(
    `[TrinityShiftGenerator] Generating shifts for workspace ${workspaceId} | Week: ${weekStart.toDateString()} – ${weekEnd.toDateString()}`
  );

  const allClients = await db
    .select()
    .from(clients)
    .where(and(eq(clients.workspaceId, workspaceId), eq(clients.isActive, true)));

  if (allClients.length === 0) {
    return {
      workspaceId, weekStart, weekEnd,
      shiftsCreated: 0, clientsScheduled: 0,
      skippedClients: [{ clientId: 'none', clientName: 'N/A', reason: 'No clients in workspace' }],
      createdShiftIds: [],
    };
  }

  const clientsToProcess = allClients.slice(0, maxClients);
  const createdShiftIds: string[] = [];
  const skippedClients: ShiftGenerationResult['skippedClients'] = [];
  let clientsScheduled = 0;

  for (const client of clientsToProcess) {
    try {
      const profile = buildCoverageProfile(client);

      if (profile.contractRatePerHour === 0) {
        skippedClients.push({
          clientId: client.id,
          clientName: profile.clientName,
          reason: 'No contract rate configured',
        });
        continue;
      }

      const existingCounts = await getExistingShiftCounts(workspaceId, client.id, weekStart, weekEnd);

      const shiftsToInsert: any[] = [];

      for (const dayOffset of [0, 1, 2, 3, 4, 5, 6]) {
        const shiftDate = new Date(weekStart);
        shiftDate.setDate(weekStart.getDate() + dayOffset);
        const dayOfWeek = shiftDate.getDay();

        if (!profile.daysPerWeek.includes(dayOfWeek)) continue;

        for (let slotIdx = 0; slotIdx < profile.shiftStartHours.length; slotIdx++) {
          const startHour = profile.shiftStartHours[slotIdx];
          const slotLength = profile.shiftLengthsBySlot[slotIdx] ?? profile.shiftLengthHours;
          const key = `${shiftDate.getFullYear()}-${shiftDate.getMonth()}-${shiftDate.getDate()}-${startHour}`;
          const existingCount = existingCounts.get(key) || 0;
          const needed = profile.guardsPerShift - existingCount;

          if (needed <= 0) continue;

          const startTime = new Date(shiftDate);
          startTime.setHours(startHour, 0, 0, 0);
          const endTime = new Date(startTime);
          endTime.setHours(startTime.getHours() + slotLength);

          for (let g = 0; g < needed; g++) {
            shiftsToInsert.push({
              id: randomUUID(),
              workspaceId,
              clientId: client.id,
              employeeId: null,
              title: `${profile.clientName} — ${startHour < 12 ? 'AM' : startHour < 17 ? 'PM' : 'Night'} Shift`,
              description: `Auto-generated by Trinity for ${profile.clientName}`,
              startTime,
              endTime,
              date: `${shiftDate.getFullYear()}-${String(shiftDate.getMonth() + 1).padStart(2, '0')}-${String(shiftDate.getDate()).padStart(2, '0')}`,
              status: 'draft',
              billRate: profile.contractRatePerHour.toString(),
              billableToClient: true,
              aiGenerated: true,
              category: 'security',
            });
          }
        }
      }

      if (shiftsToInsert.length > MAX_SHIFTS_PER_CLIENT_PER_WEEK) {
        log.warn(
          `[TrinityShiftGenerator] Safety cap hit for ${profile.clientName}: ${shiftsToInsert.length} exceeds ${MAX_SHIFTS_PER_CLIENT_PER_WEEK}, truncating`
        );
        shiftsToInsert.length = MAX_SHIFTS_PER_CLIENT_PER_WEEK;
      }

      if (shiftsToInsert.length === 0) {
        skippedClients.push({
          clientId: client.id,
          clientName: profile.clientName,
          reason: 'All shift slots already covered for this week',
        });
        continue;
      }

      await db.insert(shifts).values(shiftsToInsert);
      createdShiftIds.push(...shiftsToInsert.map(s => s.id));
      clientsScheduled++;

      log.info(
        `[TrinityShiftGenerator] Created ${shiftsToInsert.length} shifts for ${profile.clientName} (${profile.guardsPerShift} guard(s) × ${profile.shiftStartHours.length} window(s) × ${profile.daysPerWeek.length} day(s))`
      );
    } catch (err: any) {
      skippedClients.push({
        clientId: client.id,
        clientName: client.companyName || client.firstName,
        reason: `Error: ${(err instanceof Error ? err.message : String(err))}`,
      });
      log.error(`[TrinityShiftGenerator] Failed for client ${client.id}:`, (err instanceof Error ? err.message : String(err)));
    }
  }

  log.info(
    `[TrinityShiftGenerator] Done — ${createdShiftIds.length} shifts across ${clientsScheduled} clients`
  );

  return {
    workspaceId, weekStart, weekEnd,
    shiftsCreated: createdShiftIds.length,
    clientsScheduled,
    skippedClients,
    createdShiftIds,
  };
}
