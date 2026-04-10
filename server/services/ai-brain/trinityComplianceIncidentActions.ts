import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { db } from '../../db';
import { employees, workspaceMembers, clients, shifts, employeeDocuments, timeEntries, auditLogs } from '@shared/schema';
import { eq, and, gte, lte, lt, gt, sql, desc, isNull, ne } from 'drizzle-orm';
import { complianceEnforcementService } from '../compliance/complianceEnforcementService';
import { incidentRoutingService } from '../incidentRoutingService';
import { getComplianceReport } from '../timesheetReportService';
import { createNotification } from '../notificationService';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityComplianceIncidentActions');

function mkAction(actionId: string, fn: (params: any) => Promise<any>): ActionHandler {
  return {
    actionId,
    name: actionId,
    category: 'automation' as any,
    description: `Trinity action: ${actionId}`,
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      try {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const data = await fn(req.params || {});
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return { success: true, data };
      } catch (err: any) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return { success: false, error: err?.message || 'Unknown error' };
      }
    }
  };
}

export function registerComplianceIncidentActions() {

  helpaiOrchestrator.registerAction(mkAction('compliance.run_full_scan', async (params) => {
    const { workspaceId } = params;
    const dailyResult = await complianceEnforcementService.runDailyComplianceCheck().catch(e => ({ error: e.message }));
    const expiryResult = await complianceEnforcementService.checkDocumentExpiries().catch(e => ({ error: e.message }));
    return {
      scanned: true,
      workspaceId,
      dailyCheck: dailyResult,
      documentExpiries: expiryResult,
      timestamp: new Date().toISOString(),
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('compliance.check_officer', async (params) => {
    const { officerId, workspaceId } = params;
    if (!officerId) return { error: 'officerId required' };
    const status = await complianceEnforcementService.getComplianceStatus('officer', officerId).catch(() => null);
    const frozen = await complianceEnforcementService.isEntityFrozen('officer', officerId).catch(() => false);
    return { officerId, complianceStatus: status, isFrozen: frozen };
  }));

  helpaiOrchestrator.registerAction(mkAction('compliance.flag_expiring', async (params) => {
    const { workspaceId, daysAhead = 30 } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + daysAhead);
    const expiringDocs = await db.select({
      id: employeeDocuments.id,
      employeeId: employeeDocuments.employeeId,
      documentType: employeeDocuments.documentType,
      expirationDate: employeeDocuments.expirationDate,
      status: employeeDocuments.status,
    })
      .from(employeeDocuments)
      .where(and(
        eq(employeeDocuments.workspaceId, workspaceId),
        eq(employeeDocuments.status as any, 'approved'),
        lte(employeeDocuments.expirationDate, cutoffDate),
        gte(employeeDocuments.expirationDate, new Date())
      ))
      .orderBy(employeeDocuments.expirationDate);
    const byDays: Record<string, typeof expiringDocs> = { week1: [], week2: [], week4: [] };
    const now = new Date();
    for (const doc of expiringDocs) {
      if (!doc.expirationDate) continue;
      const days = Math.ceil((new Date(doc.expirationDate).getTime() - now.getTime()) / 86400000);
      if (days <= 7) byDays.week1.push(doc);
      else if (days <= 14) byDays.week2.push(doc);
      else byDays.week4.push(doc);
    }
    return { expiringDocs, count: expiringDocs.length, byUrgency: byDays };
  }));

  helpaiOrchestrator.registerAction(mkAction('compliance.request_document', async (params) => {
    const { workspaceId, officerId, docType, message } = params;
    if (!workspaceId || !officerId || !docType) return { error: 'workspaceId, officerId, docType required' };
    const emp = await db.query.employees?.findFirst({ where: eq(employees.id, officerId) } as any).catch(() => null);
    if (!emp) return { error: 'Officer not found' };
    const memberId = (emp as any).userId || officerId;
    await createNotification({
      workspaceId,
      userId: memberId,
      type: 'compliance',
      title: `Action Required: Upload ${docType}`,
      message: message || `Please upload your ${docType} to maintain compliance. This is required to continue working scheduled shifts.`,
      priority: 'high',
    } as any).catch(() => null);
    return { requested: true, officerId, docType, notificationSent: true };
  }));

  helpaiOrchestrator.registerAction(mkAction('compliance.auto_remove_noncompliant', async (params) => {
    const { workspaceId, officerId, reason } = params;
    if (!workspaceId || !officerId) return { error: 'workspaceId and officerId required' };
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const futureShifts = await db.select({ id: shifts.id, startTime: shifts.startTime })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.employeeId, officerId),
        gte(shifts.startTime, tomorrow),
        ne(shifts.status, 'cancelled')
      ));
    if (futureShifts.length === 0) return { removed: 0, message: 'No future shifts found for this officer' };
    await db.update(shifts)
      .set({ employeeId: null, status: 'open', updatedAt: new Date(), notes: `[AUTO_REMOVED_NONCOMPLIANT] ${reason || 'Compliance violation'}` } as any)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.employeeId, officerId),
        gte(shifts.startTime, tomorrow)
      ));
    return { removed: futureShifts.length, officerId, reason: reason || 'Compliance violation', shiftsOpenedForReplacement: futureShifts.length };
  }));

  helpaiOrchestrator.registerAction(mkAction('compliance.run_compliance_report', async (params) => {
    const { workspaceId, startDate, endDate } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 86400000);
    const end = endDate ? new Date(endDate) : new Date();
    const report = await getComplianceReport(workspaceId, start, end);
    return report;
  }));

  helpaiOrchestrator.registerAction(mkAction('incident.create', async (params) => {
    const { workspaceId, reportedBy, shiftId, type, severity, description, location } = params;
    if (!workspaceId || !reportedBy || !description) return { error: 'workspaceId, reportedBy, description required' };
    const result = await incidentRoutingService.createAndRouteIncident({
      workspaceId,
      reportedBy,
      shiftId: shiftId || null,
      type: type || 'other',
      severity: severity || 'low',
      description,
      location: location || null,
    } as any);
    return result;
  }));

  helpaiOrchestrator.registerAction(mkAction('incident.escalate', async (params) => {
    const { incidentId, escalatedBy, reason } = params;
    if (!incidentId) return { error: 'incidentId required' };
    const result = await incidentRoutingService.updateIncidentStatus(incidentId, 'escalated' as any, escalatedBy, reason);
    return result;
  }));

  helpaiOrchestrator.registerAction(mkAction('incident.notify_client', async (params) => {
    const { workspaceId, incidentId, clientId, message } = params;
    if (!workspaceId || !incidentId) return { error: 'workspaceId and incidentId required' };
    if (clientId) {
      const client = await db.query.clients?.findFirst({ where: eq(clients.id, clientId) } as any).catch(() => null);
      if (client && (client as any).email) {
        await createNotification({
          workspaceId,
          userId: null,
          type: 'incident',
          title: 'Incident Report Filed at Your Site',
          message: message || `An incident has been filed and routed to your assigned supervisor. Incident ID: ${incidentId}`,
          priority: 'high',
          metadata: { incidentId, clientId, clientEmail: (client as any).email }
        } as any).catch(() => null);
      }
    }
    return { notified: true, incidentId, clientId };
  }));

  helpaiOrchestrator.registerAction(mkAction('incident.flag_compliance', async (params) => {
    const { workspaceId, incidentId, officerId, flagType } = params;
    if (!incidentId) return { error: 'incidentId required' };
    if (officerId) {
      await complianceEnforcementService.initializeWindow({
        entityType: 'officer',
        entityId: officerId,
        workspaceId: workspaceId || '',
        windowType: flagType || 'incident_review',
      } as any).catch(() => null);
    }
    return { flagged: true, incidentId, officerId, complianceWindowCreated: !!officerId };
  }));

  helpaiOrchestrator.registerAction(mkAction('incident.get_history', async (params) => {
    const { workspaceId, employeeId, clientId, limit = 20, severity } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const incidents = await incidentRoutingService.getIncidents({
      workspaceId,
      employeeId,
      clientId,
      limit,
      severity,
    } as any).catch(() => []);
    return { incidents, count: (incidents as any[]).length };
  }));

  helpaiOrchestrator.registerAction(mkAction('client.get_full_profile', async (params) => {
    const { workspaceId, clientId } = params;
    if (!workspaceId || !clientId) return { error: 'workspaceId and clientId required' };
    const client = await db.query.clients?.findFirst({
      where: and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)),
    } as any).catch(() => null);
    if (!client) return { error: 'Client not found' };
    const recentShifts = await db.select({ id: shifts.id, status: shifts.status, startTime: shifts.startTime })
      .from(shifts)
      .where(and(eq(shifts.workspaceId, workspaceId), eq(shifts.clientId, clientId)))
      .orderBy(desc(shifts.startTime))
      .limit(10);
    return { client, recentShifts, shiftsCount: recentShifts.length };
  }));

  helpaiOrchestrator.registerAction(mkAction('client.get_site_details', async (params) => {
    const { workspaceId, clientId } = params;
    if (!clientId) return { error: 'clientId required' };
    const client = await db.query.clients?.findFirst({
      where: eq(clients.id, clientId),
    } as any).catch(() => null);
    if (!client) return { error: 'Client/site not found' };
    return {
      clientId,
      name: (client as any).companyName || `${(client as any).firstName} ${(client as any).lastName}`,
      address: (client as any).address,
      latitude: (client as any).latitude,
      longitude: (client as any).longitude,
      geofenceRadius: (client as any).geofenceRadius || 200,
      billingRate: (client as any).hourlyBillingRate,
      minimumCoverage: (client as any).minimumCoverage,
      postOrders: (client as any).postOrders,
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('client.update_billing_settings', async (params) => {
    const { workspaceId, clientId, hourlyBillingRate, invoiceDueNet, invoiceCycle, poNumber } = params;
    if (!clientId) return { error: 'clientId required' };
    const updates: any = { updatedAt: new Date() };
    if (hourlyBillingRate !== undefined) updates.hourlyBillingRate = hourlyBillingRate;
    if (invoiceDueNet !== undefined) updates.invoiceDueNet = invoiceDueNet;
    if (invoiceCycle !== undefined) updates.invoiceCycle = invoiceCycle;
    if (poNumber !== undefined) updates.poNumber = poNumber;
    await db.update(clients).set(updates).where(eq(clients.id, clientId));
    return { updated: true, clientId, changes: Object.keys(updates).filter(k => k !== 'updatedAt') };
  }));

  helpaiOrchestrator.registerAction(mkAction('client.health_score', async (params) => {
    const { workspaceId, clientId } = params;
    if (!workspaceId || !clientId) return { error: 'workspaceId and clientId required' };
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const recentShifts = await db.select({ status: shifts.status })
      .from(shifts)
      .where(and(eq(shifts.workspaceId, workspaceId), eq(shifts.clientId, clientId), gte(shifts.startTime, thirtyDaysAgo)));
    const total = recentShifts.length;
    const covered = recentShifts.filter(s => s.status === 'completed' || s.status === 'confirmed').length;
    const coverageRate = total > 0 ? (covered / total) * 100 : 100;
    const overdueResult = await db.select({ amount: sql`SUM(amount)` })
      .from(sql`invoices WHERE workspace_id = ${workspaceId} AND client_id = ${clientId} AND status = 'overdue'`)
      .catch(() => [{ amount: 0 }]);
    const overdueAmount = parseFloat(String((overdueResult[0] as any)?.amount || 0));
    const score = Math.round(coverageRate * 0.6 + (overdueAmount === 0 ? 40 : 0));
    return { clientId, score, coverageRate: +coverageRate.toFixed(1), overdueAmount, totalShifts30d: total, health: score >= 80 ? 'healthy' : score >= 60 ? 'at_risk' : 'critical' };
  }));

  helpaiOrchestrator.registerAction(mkAction('client.flag_sla_risk', async (params) => {
    const { workspaceId, clientId, lookAheadDays = 3 } = params;
    if (!workspaceId || !clientId) return { error: 'workspaceId and clientId required' };
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + lookAheadDays);
    const openShifts = await db.select({ id: shifts.id, startTime: shifts.startTime })
      .from(shifts)
      .where(and(
        eq(shifts.workspaceId, workspaceId),
        eq(shifts.clientId, clientId),
        isNull(shifts.employeeId),
        gte(shifts.startTime, from),
        lte(shifts.startTime, to),
        ne(shifts.status, 'cancelled')
      ));
    const atRisk = openShifts.length > 0;
    return { clientId, slaAtRisk: atRisk, openShiftsCount: openShifts.length, openShifts, lookAheadDays, urgency: openShifts.length >= 3 ? 'critical' : openShifts.length >= 1 ? 'warning' : 'ok' };
  }));

  helpaiOrchestrator.registerAction(mkAction('client.get_active_contracts', async (params) => {
    const { workspaceId, clientId } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const { clientContracts } = await import('../../../shared/schema').catch(() => ({ clientContracts: null }));
    if (!clientContracts) return { error: 'Client contracts schema not available' };
    const where = clientId
      ? and(eq((clientContracts as any).workspaceId, workspaceId), eq((clientContracts as any).clientId, clientId))
      : eq((clientContracts as any).workspaceId, workspaceId);
    const contracts = await db.select().from(clientContracts as any).where(where).limit(50).catch(() => []);
    return { clientId: clientId ?? 'all', contractCount: contracts.length, contracts };
  }));

  helpaiOrchestrator.registerAction(mkAction('client.get_billing_history', async (params) => {
    const { workspaceId, clientId, limit = 12 } = params;
    if (!workspaceId || !clientId) return { error: 'workspaceId and clientId required' };
    const { invoices } = await import('../../../shared/schema').catch(() => ({ invoices: null }));
    if (!invoices) return { error: 'Invoices schema not available' };
    const history = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      totalAmount: invoices.total,
      dueDate: invoices.dueDate,
      paidAt: invoices.paidAt,
    }).from(invoices).where(
      and(eq(invoices.workspaceId, workspaceId), eq(invoices.clientId, clientId))
    ).orderBy(invoices.createdAt).limit(Number(limit)).catch(() => []);
    const totalBilled = history.reduce((s: number, i: any) => s + parseFloat(i.totalAmount || '0'), 0);
    return { clientId, historyCount: history.length, totalBilled: Math.round(totalBilled * 100) / 100, history };
  }));

  helpaiOrchestrator.registerAction(mkAction('employee.get_full_profile', async (params) => {
    const { workspaceId, employeeId } = params;
    if (!employeeId) return { error: 'employeeId required' };
    const emp = await db.query.employees?.findFirst({ where: eq(employees.id, employeeId) } as any).catch(() => null);
    if (!emp) return { error: 'Employee not found' };
    const docs = await db.select({ documentType: employeeDocuments.documentType, status: employeeDocuments.status, expirationDate: employeeDocuments.expirationDate })
      .from(employeeDocuments)
      .where(eq(employeeDocuments.employeeId, employeeId))
      .catch(() => []);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const recentHours = await db.select({ total: sql`SUM(total_minutes)` })
      .from(timeEntries)
      .where(and(eq(timeEntries.employeeId, employeeId), gte(timeEntries.clockIn, thirtyDaysAgo)))
      .catch(() => [{ total: 0 }]);
    return {
      employee: emp,
      documents: docs,
      hoursLast30d: Math.round(parseFloat(String((recentHours[0] as any)?.total || 0)) / 60),
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('employee.update_role', async (params) => {
    const { workspaceId, employeeId, newRole, userId } = params;
    if (!workspaceId || !employeeId || !newRole) return { error: 'workspaceId, employeeId, newRole required' };
    await db.update(workspaceMembers)
      .set({ role: newRole as any, updatedAt: new Date() } as any)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.employeeId as any, employeeId)));
    return { updated: true, employeeId, newRole };
  }));

  helpaiOrchestrator.registerAction(mkAction('employee.initiate_onboarding', async (params) => {
    const { workspaceId, employeeId, startDate } = params;
    if (!workspaceId || !employeeId) return { error: 'workspaceId and employeeId required' };
    const emp = await db.query.employees?.findFirst({ where: eq(employees.id, employeeId) } as any).catch(() => null);
    const memberId = (emp as any)?.userId || employeeId;
    await createNotification({
      workspaceId,
      userId: memberId,
      type: 'onboarding',
      title: 'Welcome! Your onboarding checklist is ready',
      message: 'Please complete your onboarding checklist: upload I-9, W-4, guard card, and complete your profile. Your start date is ' + (startDate || 'TBD'),
      priority: 'high',
    } as any).catch(() => null);
    return { initiated: true, employeeId, checklistItems: ['i9', 'w4', 'guard_card', 'profile_photo', 'emergency_contact', 'direct_deposit'] };
  }));

  helpaiOrchestrator.registerAction(mkAction('employee.initiate_offboarding', async (params) => {
    const { workspaceId, employeeId, lastDay, reason } = params;
    if (!workspaceId || !employeeId) return { error: 'workspaceId and employeeId required' };
    if (lastDay) {
      const lastDayDate = new Date(lastDay);
      await db.update(shifts)
        .set({ employeeId: null, status: 'open', updatedAt: new Date(), notes: '[OFFBOARDING] Shift opened due to employee offboarding' } as any)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          eq(shifts.employeeId, employeeId),
          gte(shifts.startTime, lastDayDate)
        ));
    }
    await db.update(employees)
      .set({ status: 'offboarding', updatedAt: new Date() } as any)
      .where(eq(employees.id, employeeId));
    return { initiated: true, employeeId, lastDay, futureShiftsCleared: !!lastDay, checklistItems: ['final_timesheet_approval', 'equipment_return', 'exit_interview', 'final_paycheck', 'benefits_termination'] };
  }));

  helpaiOrchestrator.registerAction(mkAction('employee.flag_performance', async (params) => {
    const { workspaceId, employeeId, flagType, description, severity } = params;
    if (!workspaceId || !employeeId || !description) return { error: 'workspaceId, employeeId, description required' };
    await db.insert(auditLogs).values({
      workspaceId,
      entityType: 'employee',
      entityId: employeeId,
      action: 'performance_flag',
      actionDescription: description,
      metadata: { flagType, severity },
    }).catch(() => null);
    return { flagged: true, employeeId, flagType, severity };
  }));

  helpaiOrchestrator.registerAction(mkAction('employee.disciplinary_log_entry', async (params) => {
    const { workspaceId, employeeId, action, description, issuedBy } = params;
    if (!workspaceId || !employeeId || !description) return { error: 'workspaceId, employeeId, description required' };
    await db.insert(auditLogs).values({
      workspaceId,
      entityType: 'employee',
      entityId: employeeId,
      action: action || 'disciplinary_entry',
      actionDescription: description,
      metadata: { issuedBy },
    }).catch(() => null);
    return { logged: true, employeeId, action: action || 'disciplinary_entry' };
  }));

  // ── Phase 21: Required canonical compliance actions ────────────────────────

  helpaiOrchestrator.registerAction(mkAction('compliance.query', async (params) => {
    const { workspaceId, stateCode, severity, violationType, limit = 50 } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const openViolations = await db.select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      status: employees.status,
      complianceScore: employees.complianceScore,
    })
      .from(employees)
      .where(and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.isActive, true),
      ))
      .orderBy(employees.complianceScore)
      .limit(limit);
    const expiringDocs = await db.select({
      id: employeeDocuments.id,
      employeeId: employeeDocuments.employeeId,
      documentType: employeeDocuments.documentType,
      expirationDate: employeeDocuments.expirationDate,
    })
      .from(employeeDocuments)
      .where(and(
        eq(employeeDocuments.workspaceId, workspaceId),
        lte(employeeDocuments.expirationDate, new Date(Date.now() + 30 * 86400000)),
        gte(employeeDocuments.expirationDate, new Date()),
      ))
      .orderBy(employeeDocuments.expirationDate)
      .limit(20);
    const lowScoreOfficers = openViolations.filter(e => (e.complianceScore ?? 100) < 70);
    return {
      workspaceId,
      stateCode: stateCode || null,
      lowComplianceOfficers: lowScoreOfficers,
      lowComplianceCount: lowScoreOfficers.length,
      expiringDocuments: expiringDocs,
      expiringDocumentCount: expiringDocs.length,
      queriedAt: new Date().toISOString(),
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('compliance.alert', async (params) => {
    const { workspaceId, officerId, violationType, severity = 'high', description, detectedAt } = params;
    if (!workspaceId || !violationType) return { error: 'workspaceId and violationType required' };
    const emp = officerId
      ? await db.select({ firstName: employees.firstName, lastName: employees.lastName }).from(employees).where(eq(employees.id, officerId)).limit(1).then(r => r[0])
      : null;
    const officerLabel = emp ? `${emp.firstName} ${emp.lastName}` : officerId || 'Workspace';
    await createNotification({
      workspaceId,
      userId: null,
      type: 'compliance_violation',
      title: `Compliance Alert: ${violationType}`,
      message: description || `A ${severity} compliance violation (${violationType}) was detected for ${officerLabel}. Immediate review required.`,
      priority: severity === 'critical' ? 'urgent' : 'high',
      targetRole: 'compliance_officer',
      metadata: { violationType, severity, officerId, detectedAt: detectedAt || new Date().toISOString() },
    } as any).catch(() => null);
    await db.insert(auditLogs).values({
      workspaceId,
      userId: officerId || null,
      action: 'compliance_alert_triggered',
      entityType: 'compliance',
      entityId: officerId || workspaceId,
      changes: { violationType, severity, description },
    }).catch(() => null);
    return { alerted: true, workspaceId, officerId, violationType, severity, triggeredAt: new Date().toISOString() };
  }));

  helpaiOrchestrator.registerAction(mkAction('compliance.resolve', async (params) => {
    const { workspaceId, officerId, violationType, resolvedBy, resolutionNotes, entityId } = params;
    if (!workspaceId || !resolvedBy) return { error: 'workspaceId and resolvedBy required' };
    if (!resolutionNotes || resolutionNotes.trim().length < 5) return { error: 'resolutionNotes required (minimum 5 characters)' };
    await db.insert(auditLogs).values({
      workspaceId,
      userId: resolvedBy,
      action: 'compliance_violation_resolved',
      entityType: 'compliance',
      entityId: entityId || officerId || workspaceId,
      changes: { violationType, resolutionNotes, resolvedBy, resolvedAt: new Date().toISOString() },
    }).catch(() => null);
    await createNotification({
      workspaceId,
      userId: resolvedBy,
      type: 'compliance_resolved',
      title: `Compliance Resolved: ${violationType || 'Violation'}`,
      message: resolutionNotes,
      priority: 'normal',
      targetRole: 'compliance_officer',
      metadata: { violationType, officerId, resolvedBy, resolvedAt: new Date().toISOString() },
    } as any).catch(() => null);
    return { resolved: true, workspaceId, officerId, violationType, resolvedBy, resolutionNotes, resolvedAt: new Date().toISOString() };
  }));

  // ── Phase 21B: Multi-state compliance summary action ──────────────────────

  helpaiOrchestrator.registerAction(mkAction('compliance.multi_state_summary', async (params) => {
    const { workspaceId, stateCode } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const { getStateConfig } = await import('../compliance/stateRegulatoryKnowledgeBase');
    const wsRow = await db.select({ operatingStates: sql<string[]>`operating_states`, stateLicenseState: sql<string>`state_license_state` })
      .from(sql`workspaces`)
      .where(sql`id = ${workspaceId}`)
      .limit(1)
      .then(r => r[0] as any)
      .catch(() => null);
    const activeStates: string[] = wsRow?.operatingStates?.length
      ? wsRow.operatingStates
      : wsRow?.stateLicenseState
        ? [wsRow.stateLicenseState]
        : stateCode ? [stateCode] : ['TX'];
    const stateSummaries = await Promise.all(
      activeStates.map(async (sc) => {
        const config = await getStateConfig(sc).catch(() => null);
        const expiringInState = await db.select({ count: sql<number>`count(*)` })
          .from(employeeDocuments)
          .where(and(
            eq(employeeDocuments.workspaceId, workspaceId),
            lte(employeeDocuments.expirationDate, new Date(Date.now() + 60 * 86400000)),
            gte(employeeDocuments.expirationDate, new Date()),
          ))
          .then(r => Number(r[0]?.count || 0))
          .catch(() => 0);
        return {
          stateCode: sc,
          regulatoryBody: config?.regulatoryBody || 'Unknown',
          licenseTypes: config?.licenseTypes?.map((lt: any) => lt.code) || [],
          renewalPeriodMonths: config?.licenseRenewalPeriodMonths || 24,
          expiringDocumentsNext60Days: expiringInState,
          armedRequiresSeparateLicense: config?.licenseTypes?.some((lt: any) => lt.armedAllowed && lt.code !== 'GUARD_CARD') ?? true,
        };
      })
    );
    return {
      workspaceId,
      operatingStates: activeStates,
      stateCount: activeStates.length,
      stateSummaries,
      generatedAt: new Date().toISOString(),
    };
  }));

  log.info('[Trinity Compliance+Incident] Registered 28 compliance, incident, client, employee, multi-state actions');
}
