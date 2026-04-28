import { db } from "../db";
import { employees, clients, clientRates, workspaces } from "@shared/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { typedQuery } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
const log = createLogger('rateManagement');


const ROLE_RATE_DEFAULTS: Record<string, number> = {
  'field_worker': 18.00,
  'Security Officer': 20.00,
  'Senior Security Officer': 24.00,
  'Access Control Specialist': 24.50,
  'Patrol Officer': 22.50,
  'Dispatch Coordinator': 21.00,
  'Field Supervisor': 35.00,
  'Scheduling Manager': 32.00,
  'Operations Director': 45.00,
};

const CLIENT_BILLING_MARKUP = 1.45;

export async function seedWorkspaceDefaults(workspaceId: string) {
  const defaultHourlyRate = '18.00';
  const defaultBillableRate = '26.00';

  await db.update(workspaces)
    .set({
      defaultHourlyRate: defaultHourlyRate,
      defaultBillableRate: defaultBillableRate,
    })
    .where(eq(workspaces.id, workspaceId));

  return { defaultHourlyRate, defaultBillableRate };
}

export async function seedEmployeeRates(workspaceId: string) {
  const employeesWithoutRates = await db
    .select({ id: employees.id, role: employees.role, firstName: employees.firstName, lastName: employees.lastName })
    .from(employees)
    .where(
      and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.isActive, true),
        isNull(employees.hourlyRate)
      )
    );

  let updated = 0;
  const results: Array<{ id: string; name: string; role: string; rate: number }> = [];

  for (const emp of employeesWithoutRates) {
    const role = emp.role || 'field_worker';
    const baseRate = ROLE_RATE_DEFAULTS[role] || 18.00;
    const variation = (Math.random() * 4) - 2;
    const finalRate = Math.max(15.00, parseFloat((baseRate + variation).toFixed(2)));

    await db.update(employees)
      .set({
        hourlyRate: finalRate.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(employees.id, emp.id));

    results.push({
      id: emp.id,
      name: `${emp.firstName} ${emp.lastName}`,
      role,
      rate: finalRate,
    });
    updated++;
  }

  return { updated, results };
}

export async function seedClientBillingRates(workspaceId: string) {
  const allClients = await db
    .select({
      id: clients.id,
      companyName: clients.companyName,
      contractRate: clients.contractRate,
      contractRateType: clients.contractRateType,
    })
    .from(clients)
    .where(
      and(
        eq(clients.workspaceId, workspaceId),
        eq(clients.isActive, true)
      )
    );

  const existingRates = await db
    .select({ clientId: clientRates.clientId })
    .from(clientRates)
    .where(
      and(
        eq(clientRates.workspaceId, workspaceId),
        eq(clientRates.isActive, true)
      )
    );

  const clientsWithRates = new Set(existingRates.map(r => r.clientId));
  let created = 0;
  const results: Array<{ clientId: string; name: string; billableRate: number; source: string }> = [];

  for (const client of allClients) {
    if (clientsWithRates.has(client.id)) continue;

    let billableRate: number;
    let source: string;

    if (client.contractRate) {
      billableRate = parseFloat(client.contractRate);
      source = 'contract_rate';
    } else {
      billableRate = parseFloat((18.00 * CLIENT_BILLING_MARKUP).toFixed(2));
      source = 'default_markup';
    }

    await db.insert(clientRates).values({
      workspaceId,
      clientId: client.id,
      billableRate: billableRate.toFixed(2),
      description: source === 'contract_rate'
        ? `Standard billing rate (from contract: $${billableRate}/hr)`
        : `Standard billing rate (industry default with ${((CLIENT_BILLING_MARKUP - 1) * 100).toFixed(0)}% markup)`,
      isActive: true,
    });

    results.push({
      clientId: client.id,
      name: client.companyName || 'Unknown',
      billableRate,
      source,
    });
    created++;
  }

  return { created, results };
}

export async function seedAllRates(workspaceId: string) {
  log.info('[RateManagement] Starting comprehensive rate seeding...');

  const workspaceDefaults = await seedWorkspaceDefaults(workspaceId);
  log.info(`[RateManagement] Workspace defaults set: hourly=$${workspaceDefaults.defaultHourlyRate}, billable=$${workspaceDefaults.defaultBillableRate}`);

  const employeeResult = await seedEmployeeRates(workspaceId);
  log.info(`[RateManagement] Updated ${employeeResult.updated} employee rates`);

  const clientResult = await seedClientBillingRates(workspaceId);
  log.info(`[RateManagement] Created ${clientResult.created} client billing rates`);

  const verification = await verifyRateCompleteness(workspaceId);

  return {
    workspaceDefaults,
    employeesUpdated: employeeResult.updated,
    employeeDetails: employeeResult.results,
    clientRatesCreated: clientResult.created,
    clientDetails: clientResult.results,
    verification,
  };
}

export async function verifyRateCompleteness(workspaceId: string) {
  // CATEGORY C — Raw SQL retained: COUNT( | Tables: employees, clients, client_rates, workspaces | Verified: 2026-03-23
  const result = await typedQuery(sql`
    SELECT
      (SELECT COUNT(*) FROM employees WHERE workspace_id = ${workspaceId} AND is_active = true) as total_employees,
      (SELECT COUNT(*) FROM employees WHERE workspace_id = ${workspaceId} AND is_active = true AND hourly_rate IS NOT NULL) as employees_with_rates,
      (SELECT COUNT(*) FROM clients WHERE workspace_id = ${workspaceId} AND is_active = true) as total_clients,
      (SELECT COUNT(DISTINCT client_id) FROM client_rates WHERE workspace_id = ${workspaceId} AND is_active = true) as clients_with_rates,
      (SELECT default_hourly_rate FROM workspaces WHERE id = ${workspaceId}) as workspace_default_hourly,
      (SELECT default_billable_rate FROM workspaces WHERE id = ${workspaceId}) as workspace_default_billable
  `);

  const rows = result as any;
  const stats = Array.isArray(rows) ? rows[0] : (rows?.rows ? rows.rows[0] : rows);

  const totalEmployees = Number(stats.total_employees);
  const employeesWithRates = Number(stats.employees_with_rates);
  const totalClients = Number(stats.total_clients);
  const clientsWithRates = Number(stats.clients_with_rates);

  return {
    totalEmployees,
    employeesWithRates,
    employeesCoverage: `${((employeesWithRates / totalEmployees) * 100).toFixed(1)}%`,
    totalClients,
    clientsWithRates,
    clientsCoverage: `${((clientsWithRates / totalClients) * 100).toFixed(1)}%`,
    workspaceDefaultHourly: stats.workspace_default_hourly,
    workspaceDefaultBillable: stats.workspace_default_billable,
    isComplete: employeesWithRates === totalEmployees && clientsWithRates === totalClients &&
      stats.workspace_default_hourly !== null && stats.workspace_default_billable !== null,
  };
}

export async function updateEmployeeRate(employeeId: string, hourlyRate: number, workspaceId?: string, changedBy?: string) {
  const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
  if (!employee) throw new Error(`Employee ${employeeId} not found`);
  
  // SECURITY: Validate workspace if provided
  if (workspaceId && employee.workspaceId !== workspaceId) {
    throw new Error(`Unauthorized: Employee ${employeeId} does not belong to workspace ${workspaceId}`);
  }

  await db.update(employees)
    .set({
      hourlyRate: hourlyRate.toFixed(2),
      updatedAt: new Date(),
    })
    .where(eq(employees.id, employeeId));

  // Notify the employee their pay rate was updated
  if (employee.userId && employee.workspaceId) {
    (async () => {
      try {
        const { universalNotificationEngine } = await import('./universalNotificationEngine');
        const direction = parseFloat(hourlyRate.toFixed(2)) > parseFloat(String(employee.hourlyRate || 0)) ? 'increased' : 'updated';
        await universalNotificationEngine.sendNotification({
          workspaceId: employee.workspaceId!,
          userId: employee.userId!,
          idempotencyKey: `notif:pay_rate_change:${employeeId}:updated`,
          type: 'pay_rate_change',
          title: 'Your Pay Rate Has Been Updated',
          message: `Your hourly pay rate has been ${direction} to $${hourlyRate.toFixed(2)}/hr. This will apply to your next pay period.`,
          severity: 'info',
          metadata: { employeeId, previousRate: employee.hourlyRate, newRate: hourlyRate.toFixed(2), changedBy, source: 'rate_management' },
        });
      } catch (_notifErr) { log.warn('[RateManagement] Pay rate change notification failed:', _notifErr instanceof Error ? _notifErr.message : String(_notifErr)); }
    })();
  }

  return { employeeId, previousRate: employee.hourlyRate, newRate: hourlyRate.toFixed(2) };
}

export async function updateClientBillingRate(
  workspaceId: string,
  clientId: string,
  billableRate: number,
  description?: string
) {
  await db.update(clientRates)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(clientRates.workspaceId, workspaceId),
        eq(clientRates.clientId, clientId),
        eq(clientRates.isActive, true)
      )
    );

  const [newRate] = await db.insert(clientRates)
    .values({
      workspaceId,
      clientId,
      billableRate: billableRate.toFixed(2),
      description: description || `Updated billing rate: $${billableRate.toFixed(2)}/hr`,
      isActive: true,
    })
    .returning();

  return newRate;
}

export async function getEmployeeRates(workspaceId: string) {
  return db.select({
    id: employees.id,
    firstName: employees.firstName,
    lastName: employees.lastName,
    role: employees.role,
    hourlyRate: employees.hourlyRate,
  })
  .from(employees)
  .where(
    and(
      eq(employees.workspaceId, workspaceId),
      eq(employees.isActive, true)
    )
  );
}

export async function getClientRates(workspaceId: string) {
  return db.select({
    clientId: clients.id,
    companyName: clients.companyName,
    billableRate: clientRates.billableRate,
    description: clientRates.description,
    contractRate: clients.contractRate,
  })
  .from(clients)
  .leftJoin(clientRates, and(
    eq(clients.id, clientRates.clientId),
    eq(clientRates.isActive, true),
    eq(clientRates.workspaceId, workspaceId)
  ))
  .where(
    and(
      eq(clients.workspaceId, workspaceId),
      eq(clients.isActive, true)
    )
  );
}
