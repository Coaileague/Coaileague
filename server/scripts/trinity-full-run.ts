import { db } from '../db';
import { shifts, employees, clients } from '@shared/schema';
import { eq, and, isNull, gte, sql } from 'drizzle-orm';

const WORKSPACE_ID = 'dev-acme-security-ws';

function getShiftsPerDay(clientName: string): number {
  const name = clientName.toLowerCase();
  if (name.includes('mall') || name.includes('shopping') || name.includes('campus') || 
      name.includes('university') || name.includes('hospital') || name.includes('medical center') ||
      name.includes('convention') || name.includes('warehouse district') || name.includes('transit') ||
      name.includes('industrial complex') || name.includes('data center')) {
    return Math.random() < 0.3 ? 3 : 2;
  }
  if (name.includes('hotel') || name.includes('resort') || name.includes('bank') ||
      name.includes('tower') || name.includes('plaza') || name.includes('apartments') ||
      name.includes('hoa') || name.includes('tech') || name.includes('energy') ||
      name.includes('distribution') || name.includes('business park') || name.includes('event center')) {
    return 2;
  }
  return 1;
}

function getShiftType(clientName: string, index: number): { start: number; duration: number; name: string } {
  const name = clientName.toLowerCase();
  const is24x7 = name.includes('hospital') || name.includes('medical center') || name.includes('data center') ||
                  name.includes('industrial') || name.includes('transit') || name.includes('energy');

  if (is24x7) {
    const types = [
      { start: 6, duration: 8, name: 'Day Shift' },
      { start: 14, duration: 8, name: 'Swing Shift' },
      { start: 22, duration: 8, name: 'Night Shift' },
    ];
    return types[index % types.length];
  }

  const isRetail = name.includes('mall') || name.includes('shopping') || name.includes('store') ||
                   name.includes('diner') || name.includes('sushi') || name.includes('kookies') ||
                   name.includes('auto group');
  if (isRetail) {
    const types = [
      { start: 8, duration: 10, name: 'Day Shift' },
      { start: 18, duration: 8, name: 'Evening Shift' },
    ];
    return types[index % types.length];
  }

  const isResidential = name.includes('apartments') || name.includes('hoa') || name.includes('country club');
  if (isResidential) {
    const types = [
      { start: 18, duration: 10, name: 'Night Patrol' },
      { start: 6, duration: 10, name: 'Day Patrol' },
    ];
    return types[index % types.length];
  }

  const types = [
    { start: 7, duration: 8, name: 'Day Shift' },
    { start: 15, duration: 8, name: 'Swing Shift' },
    { start: 22, duration: 8, name: 'Night Shift' },
  ];
  return types[index % types.length];
}

async function seedOnly() {
  console.log('=== SEED PHASE ===');
  const now = new Date();

  const deleted = await db.delete(shifts).where(and(
    eq(shifts.workspaceId, WORKSPACE_ID),
    gte(shifts.startTime, now)
  )).returning({ id: shifts.id });
  console.log(`Cleared ${deleted.length} future shifts`);

  const allEmployees = await db.select().from(employees).where(eq(employees.workspaceId, WORKSPACE_ID));
  const allClients = await db.select().from(clients).where(eq(clients.workspaceId, WORKSPACE_ID));
  console.log(`Employees: ${allEmployees.length}, Clients: ${allClients.length}`);

  const shiftRecords: any[] = [];
  const startDate = new Date(now);
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() + 1);

  const DAYS_AHEAD = 30;

  for (let day = 0; day < DAYS_AHEAD; day++) {
    const shiftDate = new Date(startDate);
    shiftDate.setDate(startDate.getDate() + day);
    const dateStr = shiftDate.toISOString().slice(0, 10);

    for (const client of allClients) {
      const guardsPerDay = getShiftsPerDay(client.companyName || '');

      for (let s = 0; s < guardsPerDay; s++) {
        const template = getShiftType(client.companyName || '', s);
        const shiftStart = new Date(shiftDate);
        shiftStart.setHours(template.start, 0, 0, 0);
        const shiftEnd = new Date(shiftStart);
        shiftEnd.setHours(shiftStart.getHours() + template.duration);

        shiftRecords.push({
          workspaceId: WORKSPACE_ID,
          employeeId: null,
          clientId: client.id,
          title: `${client.companyName || 'Client'} - ${template.name}`,
          startTime: shiftStart,
          endTime: shiftEnd,
          date: dateStr,
          status: 'scheduled',
          category: 'general',
          aiGenerated: false,
          isManuallyLocked: false,
        });
      }
    }
  }

  console.log(`Generated ${shiftRecords.length} open shifts`);
  console.log(`Avg shifts/day: ${(shiftRecords.length / DAYS_AHEAD).toFixed(1)}`);
  console.log(`Avg shifts/emp/week: ${((shiftRecords.length / DAYS_AHEAD * 7) / allEmployees.length).toFixed(2)}`);

  const batchSize = 500;
  for (let i = 0; i < shiftRecords.length; i += batchSize) {
    await db.insert(shifts).values(shiftRecords.slice(i, i + batchSize));
  }
  console.log('Shifts inserted.');
  return shiftRecords.length;
}

async function runScheduler() {
  console.log('\n=== SCHEDULER PHASE ===');
  const { trinityAutonomousScheduler } = await import('../services/scheduling/trinityAutonomousScheduler');

  const t0 = Date.now();
  const result = await trinityAutonomousScheduler.executeAutonomousScheduling({
    workspaceId: WORKSPACE_ID,
    userId: 'trinity-system-runner',
    mode: 'full_month',
    prioritizeBy: 'urgency',
    useContractorFallback: true,
    maxShiftsPerEmployee: 0,
    respectAvailability: true,
  });

  return { result, elapsed: Date.now() - t0 };
}

async function printResults(totalGenerated: number, elapsed: number, result: any) {
  const now = new Date();
  const assigned = result.summary?.totalAssigned || 0;
  const failed = result.summary?.totalFailed || 0;
  const processed = result.summary?.totalProcessed || 0;
  const conf = result.summary?.avgConfidence || 0;

  const [ft] = await db.select({ c: sql<number>`count(*)` }).from(shifts).where(and(eq(shifts.workspaceId, WORKSPACE_ID), gte(shifts.startTime, now)));
  const [fo] = await db.select({ c: sql<number>`count(*)` }).from(shifts).where(and(eq(shifts.workspaceId, WORKSPACE_ID), isNull(shifts.employeeId), gte(shifts.startTime, now)));
  const [ff] = await db.select({ c: sql<number>`count(*)` }).from(shifts).where(and(eq(shifts.workspaceId, WORKSPACE_ID), sql`employee_id IS NOT NULL`, gte(shifts.startTime, now)));

  const fillRate = Number(ft.c) > 0 ? ((Number(ff.c) / Number(ft.c)) * 100).toFixed(1) : '0';

  const thoughtLog: string[] = result.session?.thoughtLog || [];
  const failSamples = thoughtLog.filter((t: string) =>
    t.includes('No qualified') || t.includes('no qualified') || t.includes('OT fallback') || t.includes('Skipped')
  );

  console.log(`\n========================================`);
  console.log(`    TRINITY RESULTS SUMMARY`);
  console.log(`========================================`);
  console.log(`Generated:    ${totalGenerated}`);
  console.log(`Processed:    ${processed}`);
  console.log(`FILLED:       ${assigned}`);
  console.log(`FAILED:       ${failed}`);
  console.log(`Confidence:   ${(conf * 100).toFixed(1)}%`);
  console.log(`Time:         ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`\nDB State:`);
  console.log(`  Total:      ${ft.c}`);
  console.log(`  Filled:     ${ff.c}`);
  console.log(`  Open:       ${fo.c}`);
  console.log(`  FILL RATE:  ${fillRate}%`);
  console.log(`\nCredits:      ${assigned * 3} (${assigned} × 3)`);

  if (failSamples.length > 0) {
    console.log(`\nFail samples (${Math.min(failSamples.length, 5)}):`);
    failSamples.slice(0, 5).forEach((r: string) => console.log(`  ${r}`));
  }

  console.log(`========================================`);
  if (Number(fillRate) >= 100) console.log(`*** 100% STAFFING ACHIEVED ***`);
  else if (Number(fillRate) >= 95) console.log(`*** ${fillRate}% — Near-perfect ***`);
  else console.log(`*** ${fillRate}% — ${fo.c} shifts unfilled ***`);
}

const mode = process.argv[2] || 'full';

if (mode === 'seed') {
  seedOnly().then(() => { console.log('Done seed.'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
} else if (mode === 'run') {
  runScheduler().then(async ({ result, elapsed }) => {
    await printResults(0, elapsed, result);
    process.exit(0);
  }).catch(e => { console.error(e); process.exit(1); });
} else if (mode === 'check') {
  (async () => {
    const now = new Date();
    const [ft] = await db.select({ c: sql<number>`count(*)` }).from(shifts).where(and(eq(shifts.workspaceId, WORKSPACE_ID), gte(shifts.startTime, now)));
    const [fo] = await db.select({ c: sql<number>`count(*)` }).from(shifts).where(and(eq(shifts.workspaceId, WORKSPACE_ID), isNull(shifts.employeeId), gte(shifts.startTime, now)));
    const [ff] = await db.select({ c: sql<number>`count(*)` }).from(shifts).where(and(eq(shifts.workspaceId, WORKSPACE_ID), sql`employee_id IS NOT NULL`, gte(shifts.startTime, now)));
    const rate = Number(ft.c) > 0 ? ((Number(ff.c) / Number(ft.c)) * 100).toFixed(1) : '0';
    console.log(`Total: ${ft.c} | Filled: ${ff.c} | Open: ${fo.c} | Rate: ${rate}%`);
    process.exit(0);
  })();
} else {
  seedOnly().then(async (totalGenerated) => {
    const { result, elapsed } = await runScheduler();
    await printResults(totalGenerated, elapsed, result);
    console.log('\nDone.');
    process.exit(0);
  }).catch(e => { console.error(e); process.exit(1); });
}
