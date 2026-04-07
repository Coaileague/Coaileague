import { db } from '../db';
import { employees, clients, shifts } from '@shared/schema';
import { eq, and, isNull, gte, sql } from 'drizzle-orm';

const WS = 'dev-acme-security-ws';

async function check() {
  const now = new Date();
  const [emps] = await db.select({ count: sql<number>`count(*)` }).from(employees).where(eq(employees.workspaceId, WS));
  const [cls] = await db.select({ count: sql<number>`count(*)` }).from(clients).where(eq(clients.workspaceId, WS));
  const [openShifts] = await db.select({ count: sql<number>`count(*)` }).from(shifts).where(and(eq(shifts.workspaceId, WS), isNull(shifts.employeeId), gte(shifts.startTime, now)));
  const [filledShifts] = await db.select({ count: sql<number>`count(*)` }).from(shifts).where(and(eq(shifts.workspaceId, WS), sql`employee_id IS NOT NULL`, gte(shifts.startTime, now)));

  const empCount = Number(emps.count);
  const clientCount = Number(cls.count);
  const openCount = Number(openShifts.count);
  const filledCount = Number(filledShifts.count);
  const totalFuture = openCount + filledCount;

  console.log('=== WORKSPACE STATE ===');
  console.log(`Employees: ${empCount}`);
  console.log(`Clients: ${clientCount}`);
  console.log(`Future shifts total: ${totalFuture}`);
  console.log(`  - Filled: ${filledCount}`);
  console.log(`  - Open: ${openCount}`);
  console.log(`  - Fill rate: ${totalFuture > 0 ? ((filledCount / totalFuture) * 100).toFixed(1) : 0}%`);
  console.log(`\nIf 3 shifts/client/day for 30 days: ${clientCount * 3 * 30} shifts`);
  console.log(`If 2 shifts/client/day for 30 days: ${clientCount * 2 * 30} shifts`);
  console.log(`Max capacity at 5 shifts/week/emp: ${empCount * 5 * 4} shifts/month`);
  console.log(`Max capacity at 6 shifts/week/emp (with OT): ${empCount * 6 * 4} shifts/month`);
  console.log(`\nRatio at 3 shifts/client/day: ${((clientCount * 3) / empCount).toFixed(2)} shifts/emp/day`);
  console.log(`Ratio at 2 shifts/client/day: ${((clientCount * 2) / empCount).toFixed(2)} shifts/emp/day`);
}

check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
