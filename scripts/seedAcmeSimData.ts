/**
 * Seed script: Create linked user + employee + manager for Acme Security Services
 * Used by the shift bot simulation (T008).
 * Safe to run multiple times (idempotent).
 */

import { db } from '../server/db';
import { employees, users, workspaceMembers } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

const ACME_WS = 'dev-acme-security-ws';

async function upsertUser(email: string, firstName: string, lastName: string) {
  const existing = await db.select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing[0]) {
    console.log(`  [SKIP] User already exists: ${email} → ${existing[0].id}`);
    return existing[0].id;
  }

  const [u] = await db.insert(users).values({
    email,
    firstName,
    lastName,
    emailVerified: true,
    currentWorkspaceId: ACME_WS,
    role: 'employee',
  }).returning({ id: users.id });

  console.log(`  [CREATE] User: ${email} → ${u.id}`);
  return u.id;
}

async function upsertMember(userId: string, role: string) {
  const existing = await db.select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(and(
      eq(workspaceMembers.userId, userId),
      eq(workspaceMembers.workspaceId, ACME_WS),
    ))
    .limit(1);

  if (existing[0]) {
    console.log(`  [SKIP] Workspace member already exists for userId=${userId}`);
    return;
  }

  await db.insert(workspaceMembers).values({
    userId,
    workspaceId: ACME_WS,
    role,
    status: 'active',
  });
  console.log(`  [CREATE] Workspace member: userId=${userId}, role=${role}`);
}

async function upsertLinkedEmployee(userId: string, firstName: string, lastName: string, workspaceRole: 'staff' | 'manager' | 'org_owner') {
  // Check if an employee already linked to this userId exists
  const existing = await db.select({ id: employees.id })
    .from(employees)
    .where(and(
      eq(employees.workspaceId, ACME_WS),
      eq(employees.userId, userId),
    ))
    .limit(1);

  if (existing[0]) {
    console.log(`  [SKIP] Employee linked to userId=${userId}: ${existing[0].id}`);
    return existing[0].id;
  }

  const [emp] = await db.insert(employees).values({
    workspaceId: ACME_WS,
    userId,
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@acmesecurity.sim`,
    workspaceRole,
    isActive: true,
    role: workspaceRole === 'staff' ? 'Security Officer' : 'Operations Manager',
  }).returning({ id: employees.id });

  console.log(`  [CREATE] Employee: ${firstName} ${lastName} (${workspaceRole}) → ${emp.id}`);
  return emp.id;
}

async function main() {
  console.log('\n=== Seeding Acme Security Services simulation data ===\n');

  // --- Officer ---
  console.log('1. Creating sim officer...');
  const officerUserId = await upsertUser(
    'sim.officer@acmesecurity.sim',
    'Sim',
    'Officer',
  );
  await upsertMember(officerUserId, 'employee');
  await upsertLinkedEmployee(officerUserId, 'Sim', 'Officer', 'staff');

  // --- Manager ---
  console.log('\n2. Creating sim manager...');
  const managerUserId = await upsertUser(
    'sim.manager@acmesecurity.sim',
    'Sim',
    'Manager',
  );
  await upsertMember(managerUserId, 'manager');
  await upsertLinkedEmployee(managerUserId, 'Sim', 'Manager', 'manager');

  console.log('\n=== Acme sim data ready ===\n');
  process.exit(0);
}

main().catch(e => {
  console.error('Seed failed:', e);
  process.exit(1);
});
