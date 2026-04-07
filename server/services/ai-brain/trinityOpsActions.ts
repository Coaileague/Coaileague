import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { db } from '../../db';
import {
  clientContracts,
  employees,
  shifts,
  clients,
  timeEntries,
  payrollRuns,
  payrollEntries,
} from '@shared/schema';
import { eq, and, sql, gte, lte } from 'drizzle-orm';
import { hrisIntegrationService } from '../../services/hris/hrisIntegrationService';
import { contractPipelineService } from '../../services/contracts/contractPipelineService';
import { platformEventBus } from '../platformEventBus';
import { typedQuery } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityOpsActions');

function mkAction(actionId: string, fn: (params: any) => Promise<any>): ActionHandler {
  return {
    actionId,
    name: actionId,
    category: 'automation' as any,
    description: `Trinity action: ${actionId}`,
    requiredRoles: [],
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const data = await fn(req.payload || {});
        return {
          success: true,
          actionId,
          message: `${actionId} completed successfully`,
          data,
          executionTimeMs: Date.now() - start,
        };
      } catch (err: any) {
        return {
          success: false,
          actionId,
          message: err instanceof Error ? err.message : String(err),
          executionTimeMs: Date.now() - start,
        };
      }
    }
  };
}

export function registerOpsActions() {

  helpaiOrchestrator.registerAction(mkAction('contracts.generate_from_template', async (params) => {
    const { workspaceId, templateId, clientId, customTerms, title, userId } = params;
    const client = await db.query.clients.findFirst({
      where: and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId))
    });
    if (!client) return { success: false, error: 'Client not found' };
    const [contract] = await db.insert(clientContracts).values({
      workspaceId,
      clientId,
      templateId,
      title: title || `Contract for ${client.companyName || client.firstName}`,
      content: customTerms || 'Standard contract terms applied.',
      docType: 'contract',
      status: 'draft',
      clientName: client.companyName || `${client.firstName} ${client.lastName}`,
      clientEmail: client.email,
      createdBy: userId,
    }).returning();
    return { contractId: contract.id, status: 'draft', message: 'Contract draft generated successfully' };
  }));

  helpaiOrchestrator.registerAction(mkAction('contracts.send_for_signature', async (params) => {
    const { workspaceId, contractId, userId } = params;
    const result = await contractPipelineService.sendProposal(contractId, {
      actorId: userId || 'trinity',
      actorType: 'user',
    });
    return {
      sent: true,
      contractId: result.contract.id,
      clientEmail: result.contract.clientEmail,
      portalUrl: result.portalUrl,
      message: `Contract sent for signature. Client will receive an email with a secure signing link.`,
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('contracts.mark_executed', async (params) => {
    const { workspaceId, contractId, signedAt, userId } = params;
    const [updated] = await db.update(clientContracts)
      .set({ status: 'executed', executedAt: signedAt ? new Date(signedAt) : new Date(), statusChangedAt: new Date(), statusChangedBy: userId })
      .where(and(eq(clientContracts.id, contractId), eq(clientContracts.workspaceId, workspaceId)))
      .returning();
    if (!updated) return { success: false, error: 'Contract not found' };
    await platformEventBus.publish({
      eventType: 'contract_executed',
      workspaceId,
      title: 'Contract Executed',
      description: `Contract ${contractId} has been marked as executed`,
      data: { contractId: updated.id, clientId: updated.clientId, executedAt: updated.executedAt, executedBy: userId },
    });
    return { contractId: updated.id, status: 'executed', message: 'Contract marked as executed' };
  }));

  helpaiOrchestrator.registerAction(mkAction('hris.push_new_hire', async (params) => {
    const { workspaceId, employeeId, provider, userId } = params;
    const result = await hrisIntegrationService.syncData({
      workspaceId,
      provider: provider || 'quickbooks',
      options: { direction: 'outbound', entities: ['employee'] },
      userId
    });
    return { pushed: result.success && result.recordsProcessed > 0, provider: result.provider, employeeId, message: result.success ? 'Employee pushed to HRIS' : 'Failed to push employee to HRIS' };
  }));

  helpaiOrchestrator.registerAction(mkAction('hris.push_termination', async (params) => {
    const { workspaceId, employeeId, provider, userId } = params;
    await db.update(employees)
      .set({ status: 'terminated', isActive: false })
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)));
    await platformEventBus.publish({
      eventType: 'employee_terminated',
      workspaceId,
      title: 'Employee Terminated',
      description: `Employee ${employeeId} has been terminated and queued for HRIS sync`,
      data: { employeeId, terminatedBy: userId, provider },
    });
    const result = await hrisIntegrationService.syncData({
      workspaceId,
      provider: provider || 'quickbooks',
      options: { direction: 'outbound', entities: ['employee'] },
      userId
    });
    return { pushed: result.success, message: 'Termination record synced to HRIS' };
  }));

  helpaiOrchestrator.registerAction(mkAction('hris.push_employee_update', async (params) => {
    const { workspaceId, provider, userId } = params;
    const result = await hrisIntegrationService.syncData({
      workspaceId,
      provider: provider || 'quickbooks',
      options: { direction: 'outbound', entities: ['employee'] },
      userId
    });
    return { pushed: result.success, message: 'Employee update synced to HRIS' };
  }));

  helpaiOrchestrator.registerAction(mkAction('bulk.import_shifts', async (params) => {
    const { workspaceId, shifts: shiftData } = params;
    if (!Array.isArray(shiftData)) return { success: false, error: 'Invalid shift data' };
    let imported = 0, failed = 0;
    const errors: string[] = [];
    for (const data of shiftData) {
      try {
        await db.insert(shifts).values({ ...data, workspaceId, startTime: new Date(data.startTime), endTime: new Date(data.endTime) });
        imported++;
      } catch (e: any) { failed++; errors.push(e.message); }
    }
    return { imported, failed, errors };
  }));

  helpaiOrchestrator.registerAction(mkAction('bulk.import_clients', async (params) => {
    const { workspaceId, clients: clientData } = params;
    if (!Array.isArray(clientData)) return { success: false, error: 'Invalid client data' };
    let imported = 0, failed = 0;
    const errors: string[] = [];
    for (const data of clientData) {
      try {
        const [newClient] = await db.insert(clients).values({ ...data, workspaceId }).returning();
        imported++;
        await platformEventBus.publish({
          eventType: 'client.created',
          workspaceId,
          title: 'Client Imported',
          description: `Client ${newClient.companyName || newClient.firstName} added via bulk import`,
          data: { clientId: newClient.id, companyName: newClient.companyName, source: 'bulk_import' },
        });
      } catch (e: any) {
        failed++;
        errors.push(e?.message || 'Unknown error');
        log.warn('[TrinityOpsActions] bulk.import_clients: failed to insert client', { workspaceId, data, error: e?.message });
      }
    }
    return { imported, failed, errors };
  }));

  helpaiOrchestrator.registerAction(mkAction('bulk.import_time_entries', async (params) => {
    const { workspaceId, entries } = params;
    if (!Array.isArray(entries)) return { success: false, error: 'Invalid entry data' };
    let imported = 0, failed = 0;
    for (const data of entries) {
      try {
        await db.insert(timeEntries).values({
          ...data, workspaceId,
          date: data.date ? new Date(data.date).toISOString().split('T')[0] : undefined,
          clockIn: data.clockIn ? new Date(data.clockIn) : undefined,
          clockOut: data.clockOut ? new Date(data.clockOut) : undefined,
        });
        imported++;
      } catch (e: any) {
        failed++;
        log.warn('[TrinityOpsActions] bulk.import_time_entries: failed to insert entry', { workspaceId, error: e?.message });
      }
    }
    return { imported, failed };
  }));

  helpaiOrchestrator.registerAction(mkAction('bulk.export_payroll', async (params) => {
    const { workspaceId, periodStart, periodEnd } = params;
    const entries = await db.select({
      employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
      hours: payrollEntries.regularHours,
      gross: payrollEntries.grossPay,
      net: payrollEntries.netPay,
      periodStart: payrollRuns.periodStart,
      periodEnd: payrollRuns.periodEnd,
    })
    .from(payrollEntries)
    .innerJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))
    .innerJoin(employees, eq(payrollEntries.employeeId, employees.id))
    .where(and(
      eq(payrollEntries.workspaceId, workspaceId),
      periodStart ? gte(payrollRuns.periodStart, periodStart) : undefined,
      periodEnd ? lte(payrollRuns.periodEnd, periodEnd) : undefined
    ));
    return { rows: entries, count: entries.length };
  }));

  helpaiOrchestrator.registerAction(mkAction('bulk.export_timesheet', async (params) => {
    const { workspaceId, startDate, endDate } = params;
    const entries = await db.select({
      employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
      date: timeEntries.date,
      clockIn: timeEntries.clockIn,
      clockOut: timeEntries.clockOut,
      hours: timeEntries.totalHours,
      status: timeEntries.status,
    })
    .from(timeEntries)
    .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
    .where(and(
      eq(timeEntries.workspaceId, workspaceId),
      startDate ? gte(timeEntries.date, startDate) : undefined,
      endDate ? lte(timeEntries.date, endDate) : undefined
    ));
    return { rows: entries, count: entries.length, csvAvailable: true };
  }));

  // ── org.data_readiness_check ─────────────────────────────────────────────
  // Checks all 4 automation pipeline data completeness for the workspace.
  // Trinity calls this before running invoice, payroll, or scheduling automations
  // to confirm all required data is in place.
  helpaiOrchestrator.registerAction(mkAction('org.data_readiness_check', async (params) => {
    const { workspaceId } = params;
    if (!workspaceId) return { success: false, error: 'workspaceId required' };

    const { workspaces } = await import('@shared/schema');
    const { eq: eq2, count: drizzleCount, sql: drizzleSql2, and: and2 } = await import('drizzle-orm');

    const [ws] = await db.select().from(workspaces).where(eq2(workspaces.id, workspaceId)).limit(1);
    if (!ws) return { success: false, error: 'Workspace not found' };

    const [clientRows] = await db
      .select({ total: drizzleCount(), missingEmail: drizzleSql2<number>`count(*) filter (where billing_email is null or billing_email = '')`, missingRate: drizzleSql2<number>`count(*) filter (where contract_rate is null or contract_rate = 0)` })
      .from(clients)
      .where(eq2(clients.workspaceId, workspaceId));

    // FIX: bank check now uses canonical employee_bank_accounts table (encrypted ACH storage).
    // Falls back to legacy bank_routing_number on employee_payroll_info for backward compatibility.
    // CATEGORY C — Raw SQL retained: FILTER ( WHERE | Tables: employee_bank_accounts, employees, employee_payroll_info | Verified: 2026-03-23
    const payrollInfoRows = await typedQuery(drizzleSql2`
      SELECT
        COUNT(*) FILTER (
          WHERE (epi.bank_routing_number IS NULL OR epi.bank_routing_number = '')
          AND NOT EXISTS (
            SELECT 1 FROM employee_bank_accounts eba
            WHERE eba.employee_id = e.id AND eba.is_active = true
          )
        ) as missing_bank,
        COUNT(*) FILTER (WHERE epi.w4_completed = false OR epi.w4_completed IS NULL) as missing_w4,
        COUNT(*) FILTER (WHERE epi.i9_completed = false OR epi.i9_completed IS NULL) as missing_i9
      FROM employees e
      LEFT JOIN employee_payroll_info epi ON epi.employee_id = e.id
      WHERE e.workspace_id = ${workspaceId} AND e.status = 'active'
    `);
    const pr = ((payrollInfoRows as any[])[0] || {}) as any;

    const checks = {
      org: {
        ein: !!(ws as any).taxId,
        companyName: !!(ws as any).companyName || !!(ws as any).name,
        address: !!(ws as any).address,
        stateLicense: !!(ws as any).stateLicenseNumber,
      },
      invoice: {
        billingEmail: !!(ws as any).billingEmail,
        invoicePrefix: !!(ws as any).invoicePrefix,
        paymentTerms: !!((ws as any).paymentTermsDays),
        clientsBillingReady: Number((clientRows as any)?.missingEmail || 0) === 0,
        clientsRateReady: Number((clientRows as any)?.missingRate || 0) === 0,
      },
      payroll: {
        payrollSchedule: !!(ws as any).payrollSchedule,
        employeesHaveBank: Number(pr.missing_bank || 0) === 0,
        employeesHaveW4: Number(pr.missing_w4 || 0) === 0,
        employeesHaveI9: Number(pr.missing_i9 || 0) === 0,
      },
    };

    const allValues = Object.values(checks).flatMap(s => Object.values(s));
    const passCount = allValues.filter(Boolean).length;
    const score = Math.round((passCount / allValues.length) * 100);
    const criticalGaps = [
      !checks.org.ein && 'Missing Federal Tax ID (EIN)',
      !checks.org.companyName && 'Missing company name',
      !checks.org.address && 'Missing company address',
      !checks.invoice.billingEmail && 'Missing invoice from email',
      !checks.invoice.clientsBillingReady && `Clients missing billing email`,
      !checks.invoice.clientsRateReady && `Clients missing billable rate`,
      !checks.payroll.employeesHaveBank && `Employees missing bank/ACH data`,
      !checks.payroll.employeesHaveW4 && `Employees missing W-4`,
      !checks.payroll.employeesHaveI9 && `Employees missing I-9`,
    ].filter(Boolean);

    return {
      score,
      automationReady: criticalGaps.length === 0,
      criticalGaps,
      checks,
      recommendation: criticalGaps.length === 0
        ? 'All pipeline data is complete. Automation pipelines can run.'
        : `${criticalGaps.length} critical data gaps found. Complete them in Settings > Financial before running automations.`,
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('equipment.status', async (params) => {
    const { workspaceId, employeeId } = params;
    if (!workspaceId || !employeeId) return { success: false, error: 'workspaceId and employeeId required' };
    const rows = await typedQuery(sql`
      SELECT
        ea.id AS assignment_id,
        ea.checkout_date,
        ea.expected_return_date,
        ea.actual_return_date,
        ea.condition,
        ea.notes AS assignment_notes,
        ea.is_lost,
        ea.damage_notes,
        ea.deduction_amount,
        ei.id AS item_id,
        ei.name AS item_name,
        ei.serial_number,
        ei.category,
        ei.status AS item_status
      FROM equipment_assignments ea
      JOIN equipment_items ei ON ei.id = ea.equipment_item_id
      WHERE ea.workspace_id = ${workspaceId}
        AND ea.employee_id = ${employeeId}
      ORDER BY ea.checkout_date DESC
    `);
    return { employeeId, assignments: rows, count: rows.length };
  }));

  helpaiOrchestrator.registerAction(mkAction('equipment.overdue', async (params) => {
    const { workspaceId } = params;
    if (!workspaceId) return { success: false, error: 'workspaceId required' };
    const rows = await typedQuery(sql`
      SELECT
        ea.id AS assignment_id,
        ea.employee_id,
        ea.checkout_date,
        ea.expected_return_date,
        ea.condition,
        ea.notes AS assignment_notes,
        ei.id AS item_id,
        ei.name AS item_name,
        ei.serial_number,
        ei.category,
        EXTRACT(DAY FROM NOW() - ea.expected_return_date)::int AS days_overdue
      FROM equipment_assignments ea
      JOIN equipment_items ei ON ei.id = ea.equipment_item_id
      WHERE ea.workspace_id = ${workspaceId}
        AND ea.expected_return_date < NOW()
        AND ea.actual_return_date IS NULL
      ORDER BY ea.expected_return_date ASC
    `);
    return { overdueAssignments: rows, count: rows.length };
  }));

  log.info('[Trinity Ops] Registered 14 contract + HRIS + bulk + org data readiness + equipment actions');
}
