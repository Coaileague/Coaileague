import { db } from '../db';
import { shifts, employees, clients, calendarSubscriptions } from '@shared/schema';
import { eq, and, gte, lte, or } from 'drizzle-orm';
import { format, addDays } from 'date-fns';
import crypto from 'crypto';

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function formatICSDate(date: Date): string {
  return format(date, "yyyyMMdd'T'HHmmss'Z'");
}

export async function generateEmployeeICalFeed(
  employeeId: string,
  workspaceId: string,
  daysAhead: number = 90
): Promise<string> {
  const now = new Date();
  const lookAhead = addDays(now, daysAhead);
  const lookBack = addDays(now, -30);

  const employeeShifts = await db.select({
    shift: shifts,
    client: clients,
    employee: employees,
  })
    .from(shifts)
    .leftJoin(clients, eq(shifts.clientId, clients.id))
    .leftJoin(employees, eq(shifts.employeeId, employees.id))
    .where(
      and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.employeeId, employeeId),
        gte(shifts.startTime, lookBack),
        lte(shifts.startTime, lookAhead),
        or(
          eq(shifts.status, 'published'),
          eq(shifts.status, 'assigned'),
          eq(shifts.status, 'confirmed')
        )
      )
    );

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CoAIleague//Schedule Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:CoAIleague Schedule`,
    'X-WR-TIMEZONE:UTC',
  ];

  for (const row of employeeShifts) {
    const s = row.shift;
    const clientName = row.client
      ? (row.client.companyName || `${row.client.firstName} ${row.client.lastName}`)
      : 'Unassigned';
    const empName = row.employee
      ? `${row.employee.firstName} ${row.employee.lastName}`
      : 'Unknown';
    const location = row.client?.address || '';
    const title = s.title || `Shift - ${clientName}`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:shift-${s.id}@coaileague.com`);
    lines.push(`DTSTART:${formatICSDate(s.startTime)}`);
    lines.push(`DTEND:${formatICSDate(s.endTime)}`);
    lines.push(`SUMMARY:${escapeICSText(title)}`);
    if (location) {
      lines.push(`LOCATION:${escapeICSText(location)}`);
    }
    lines.push(`DESCRIPTION:${escapeICSText(`Employee: ${empName}\\nClient: ${clientName}\\nStatus: ${s.status || 'scheduled'}`)}`);
    lines.push(`STATUS:CONFIRMED`);
    lines.push('BEGIN:VALARM');
    lines.push('TRIGGER:-PT30M');
    lines.push('ACTION:DISPLAY');
    lines.push('DESCRIPTION:Shift starting in 30 minutes');
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export async function generateWorkspaceICalFeed(
  workspaceId: string,
  daysAhead: number = 90
): Promise<string> {
  const now = new Date();
  const lookAhead = addDays(now, daysAhead);
  const lookBack = addDays(now, -7);

  const allShifts = await db.select({
    shift: shifts,
    client: clients,
    employee: employees,
  })
    .from(shifts)
    .leftJoin(clients, eq(shifts.clientId, clients.id))
    .leftJoin(employees, eq(shifts.employeeId, employees.id))
    .where(
      and(
        eq(shifts.workspaceId, workspaceId),
        gte(shifts.startTime, lookBack),
        lte(shifts.startTime, lookAhead),
        or(
          eq(shifts.status, 'published'),
          eq(shifts.status, 'assigned'),
          eq(shifts.status, 'confirmed')
        )
      )
    );

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CoAIleague//Schedule Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:CoAIleague Full Schedule`,
    'X-WR-TIMEZONE:UTC',
  ];

  for (const row of allShifts) {
    const s = row.shift;
    const clientName = row.client
      ? (row.client.companyName || `${row.client.firstName} ${row.client.lastName}`)
      : 'Unassigned';
    const empName = row.employee
      ? `${row.employee.firstName} ${row.employee.lastName}`
      : 'Unassigned';
    const location = row.client?.address || '';
    const title = s.title || `${empName} - ${clientName}`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:shift-${s.id}@coaileague.com`);
    lines.push(`DTSTART:${formatICSDate(s.startTime)}`);
    lines.push(`DTEND:${formatICSDate(s.endTime)}`);
    lines.push(`SUMMARY:${escapeICSText(title)}`);
    if (location) {
      lines.push(`LOCATION:${escapeICSText(location)}`);
    }
    lines.push(`DESCRIPTION:${escapeICSText(`Employee: ${empName}\\nClient: ${clientName}\\nStatus: ${s.status || 'scheduled'}`)}`);
    lines.push(`STATUS:CONFIRMED`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export async function resolveICalToken(token: string): Promise<{
  workspaceId: string;
  employeeId?: string;
  type: string;
} | null> {
  const [subscription] = await db.select()
    .from(calendarSubscriptions)
    .where(
      and(
        eq(calendarSubscriptions.subscriptionToken, token),
        eq(calendarSubscriptions.isActive, true)
      )
    )
    .limit(1);

  if (!subscription) return null;

  await db.update(calendarSubscriptions)
    .set({ lastAccessedAt: new Date() })
    .where(eq(calendarSubscriptions.id, subscription.id));

  return {
    workspaceId: subscription.workspaceId,
    employeeId: subscription.employeeId || undefined,
    type: subscription.subscriptionType || 'shifts',
  };
}

export async function createICalSubscription(
  workspaceId: string,
  userId: string,
  employeeId?: string,
  name?: string
): Promise<{ token: string; id: string }> {
  const token = crypto.randomBytes(32).toString('hex');

  const [subscription] = await db.insert(calendarSubscriptions)
    .values({
      workspaceId,
      userId,
      employeeId: employeeId || null,
      subscriptionToken: token,
      subscriptionType: employeeId ? 'employee' : 'workspace',
      name: name || (employeeId ? 'My Schedule Feed' : 'Full Schedule Feed'),
      isActive: true,
    })
    .returning();

  return { token: subscription.subscriptionToken, id: subscription.id };
}
