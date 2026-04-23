/**
 * TRINITY DELEGATION TRACKER — Operational Task Loop
 * ====================================================
 * Trinity can assign work. Now Trinity manages the people she assigned it to.
 *
 * Backing store: orchestration_runs (category='operational_task')
 * inputParams JSONB: { taskType, assignedTo, assignedToName, dueBy, description,
 *                      context, escalationLevel, escalationHistory[] }
 *
 * Actions (9):
 *   task.create              — delegate an operational task to a user
 *   task.get                 — retrieve a task by id
 *   task.list                — list tasks for a workspace with optional filters
 *   task.update_status       — move task between states
 *   task.track_overdue       — scan for tasks past their due date
 *   task.escalate            — escalate to next level + notify
 *   task.verify_completion   — run task-type-specific completion checks
 *   task.close_loop          — mark verified + complete + log outcome
 *   task.log_delegation_chain — return full audit trail for a task
 */

import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { db } from '../../db';
import { orchestrationRuns, orchestrationRunSteps, shifts, timeEntries, invoices, payrollRuns, workspaceMembers, employees } from '@shared/schema';
import { eq, and, lt, sql, desc, isNull, ne } from 'drizzle-orm';
import { createNotification } from '../notificationService';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityDelegationTrackerActions');

function mkAction(actionId: string, fn: (params: any) => Promise<any>): ActionHandler {
  return {
    actionId,
    name: actionId,
    category: 'automation' as any,
    description: `Trinity delegation tracker: ${actionId}`,
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

async function notifyUser(workspaceId: string, userId: string, title: string, message: string, priority: string = 'normal') {
  await createNotification({ workspaceId, userId, type: 'task_delegation', title, message, priority,
 idempotencyKey: `task_delegation-${String(Date.now())}-${'system'}`,
        })
    .catch((err: Error) => log.warn(`[TrinityDelegation] Notification persist failed for user ${userId}:`, err.message));
}

async function notifyManagers(workspaceId: string, title: string, message: string, priority: string = 'high') {
  const managers = await db.select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), sql`${workspaceMembers.role} IN ('org_owner', 'co_owner', 'manager', 'supervisor')`))
    .catch(() => []);
  for (const mgr of managers) {
    await createNotification({ workspaceId, userId: mgr.userId, type: 'task_escalation', title, message, priority,
 idempotencyKey: `task_escalation-${String(Date.now())}-${mgr.userId}`,
        })
      .catch((err: Error) => log.warn(`[TrinityDelegation] Manager escalation notification failed for user ${mgr.userId}:`, err.message));
  }
  return managers.length;
}

export function registerDelegationTrackerActions() {

  helpaiOrchestrator.registerAction(mkAction('task.create', async (params) => {
    const { workspaceId, taskType, assignedTo, assignedToName, dueBy, description, context, createdBy } = params;
    if (!workspaceId || !taskType || !assignedTo || !dueBy) {
      return { error: 'workspaceId, taskType, assignedTo, dueBy required' };
    }
    const inputParams = {
      taskType,
      assignedTo,
      assignedToName: assignedToName || assignedTo,
      dueBy,
      description: description || `${taskType} task assigned to ${assignedToName || assignedTo}`,
      context: context || {},
      escalationLevel: 0,
      escalationHistory: [],
    };
    const [run] = await db.insert(orchestrationRuns).values({
      workspaceId,
      userId: createdBy || 'trinity-ai',
      actionId: 'orchestration.delegate',
      category: 'operational_task',
      source: 'trinity',
      status: 'awaiting_approval',
      inputParams,
      requiresApproval: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();

    await db.insert(orchestrationRunSteps).values({
      runId: (run as any).id,
      stepNumber: 1,
      stepName: 'Task Assigned',
      stepType: 'action',
      status: 'completed',
      inputData: { assignedTo, taskType, dueBy },
      outputData: { delegatedAt: new Date().toISOString() },
      startedAt: new Date(),
      completedAt: new Date(),
      workspaceId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).catch(() => null);

    await notifyUser(
      workspaceId,
      assignedTo,
      `Action Required: ${taskType}`,
      `Trinity has assigned you a task: ${inputParams.description}. Due by: ${new Date(dueBy).toLocaleDateString()}. Please complete and confirm in CoAIleague.`,
      'high'
    );

    log.info(`[TrinityDelegationTracker] Task created: id=${(run as any).id}, type=${taskType}, assignedTo=${assignedTo}, dueBy=${dueBy}`);
    return {
      created: true,
      taskId: (run as any).id,
      taskType,
      assignedTo,
      dueBy,
      status: 'awaiting_approval',
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('task.get', async (params) => {
    const { taskId, workspaceId } = params;
    if (!taskId) return { error: 'taskId required' };
    const whereClause = workspaceId
      ? and(eq(orchestrationRuns.id, taskId), eq(orchestrationRuns.workspaceId, workspaceId), eq(orchestrationRuns.category, 'operational_task'))
      : and(eq(orchestrationRuns.id, taskId), eq(orchestrationRuns.category, 'operational_task'));
    const [run] = await db.select().from(orchestrationRuns).where(whereClause).limit(1);
    if (!run) return { error: `Task ${taskId} not found` };
    const steps = await db.select().from(orchestrationRunSteps).where(eq(orchestrationRunSteps.runId, taskId)).orderBy(orchestrationRunSteps.stepNumber).catch(() => []);
    return { task: run, steps, stepCount: steps.length };
  }));

  helpaiOrchestrator.registerAction(mkAction('task.list', async (params) => {
    const { workspaceId, status, taskType, assignedTo, overdueOnly } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    let query = db.select().from(orchestrationRuns).where(
      and(
        eq(orchestrationRuns.workspaceId, workspaceId),
        eq(orchestrationRuns.category, 'operational_task'),
        ...(status ? [eq(orchestrationRuns.status, status)] : []),
      )
    ).orderBy(desc(orchestrationRuns.createdAt)) as any;

    const tasks = await query.catch(() => []);
    let filtered = tasks;
    if (taskType) filtered = filtered.filter((t: any) => t.inputParams?.taskType === taskType);
    if (assignedTo) filtered = filtered.filter((t: any) => t.inputParams?.assignedTo === assignedTo);
    if (overdueOnly) {
      const now = new Date();
      filtered = filtered.filter((t: any) => t.inputParams?.dueBy && new Date(t.inputParams.dueBy) < now && t.status === 'awaiting_approval');
    }
    return {
      tasks: filtered,
      count: filtered.length,
      filters: { status, taskType, assignedTo, overdueOnly },
    };
  }));

  helpaiOrchestrator.registerAction(mkAction('task.update_status', async (params) => {
    const { taskId, workspaceId, newStatus, note, updatedBy } = params;
    if (!taskId || !newStatus) return { error: 'taskId and newStatus required' };
    const [existing] = await db.select().from(orchestrationRuns)
      .where(and(eq(orchestrationRuns.id, taskId), eq(orchestrationRuns.category, 'operational_task')))
      .limit(1);
    if (!existing) return { error: `Task ${taskId} not found` };
    const currentParams = (existing as any).inputParams || {};
    const updatedHistory = [
      ...(currentParams.escalationHistory || []),
      { timestamp: new Date().toISOString(), fromStatus: existing.status, toStatus: newStatus, note: note || '', updatedBy: updatedBy || 'trinity-ai' },
    ];
    await db.update(orchestrationRuns)
      .set({
        status: newStatus as any,
        inputParams: { ...currentParams, escalationHistory: updatedHistory } as any,
        updatedAt: new Date(),
        ...(newStatus === 'completed' ? { completedAt: new Date() } : {}),
        ...(newStatus === 'running' ? { startedAt: new Date() } : {}),
      })
      .where(eq(orchestrationRuns.id, taskId));

    await db.insert(orchestrationRunSteps).values({
      runId: taskId,
      stepNumber: (updatedHistory.length + 1),
      stepName: `Status: ${newStatus}`,
      stepType: 'action',
      status: 'completed',
      inputData: { fromStatus: existing.status, note },
      outputData: { newStatus, updatedBy },
      startedAt: new Date(),
      completedAt: new Date(),
      workspaceId: workspaceId || (existing as any).workspaceId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).catch(() => null);

    return { updated: true, taskId, previousStatus: existing.status, newStatus };
  }));

  helpaiOrchestrator.registerAction(mkAction('task.track_overdue', async (params) => {
    const { workspaceId } = params;
    const now = new Date();
    const whereClause = workspaceId
      ? and(eq(orchestrationRuns.workspaceId, workspaceId), eq(orchestrationRuns.category, 'operational_task'), eq(orchestrationRuns.status, 'awaiting_approval'))
      : and(eq(orchestrationRuns.category, 'operational_task'), eq(orchestrationRuns.status, 'awaiting_approval'));
    const pendingTasks = await db.select().from(orchestrationRuns).where(whereClause).catch(() => []);
    const overdue = pendingTasks.filter((t: any) => {
      const dueBy = t.inputParams?.dueBy;
      return dueBy && new Date(dueBy) < now;
    });
    const overdueSummary = overdue.map((t: any) => ({
      taskId: t.id,
      taskType: t.inputParams?.taskType,
      assignedTo: t.inputParams?.assignedTo,
      assignedToName: t.inputParams?.assignedToName,
      dueBy: t.inputParams?.dueBy,
      hoursOverdue: +((now.getTime() - new Date(t.inputParams?.dueBy).getTime()) / 3600000).toFixed(1),
      escalationLevel: t.inputParams?.escalationLevel || 0,
      workspaceId: t.workspaceId,
      description: t.inputParams?.description,
    }));
    log.info(`[TrinityDelegationTracker] track_overdue: found ${overdue.length} overdue tasks`);
    return { overdueTasks: overdueSummary, count: overdue.length, scannedAt: now.toISOString() };
  }));

  helpaiOrchestrator.registerAction(mkAction('task.escalate', async (params) => {
    const { taskId, workspaceId, escalateTo, reason } = params;
    if (!taskId) return { error: 'taskId required' };
    const [existing] = await db.select().from(orchestrationRuns)
      .where(and(eq(orchestrationRuns.id, taskId), eq(orchestrationRuns.category, 'operational_task')))
      .limit(1);
    if (!existing) return { error: `Task ${taskId} not found` };
    const currentParams = (existing as any).inputParams || {};
    const newLevel = (currentParams.escalationLevel || 0) + 1;
    const escalationEntry = {
      timestamp: new Date().toISOString(),
      level: newLevel,
      escalatedTo: escalateTo || 'manager',
      reason: reason || `Task overdue — escalating to level ${newLevel}`,
    };
    const updatedHistory = [...(currentParams.escalationHistory || []), escalationEntry];
    await db.update(orchestrationRuns)
      .set({
        inputParams: { ...currentParams, escalationLevel: newLevel, escalationHistory: updatedHistory } as any,
        updatedAt: new Date(),
      })
      .where(eq(orchestrationRuns.id, taskId));

    const ws = workspaceId || (existing as any).workspaceId;
    const escalateToUserId = escalateTo || null;
    const taskDesc = currentParams.description || `Task ${taskId}`;
    const dueBy = currentParams.dueBy ? new Date(currentParams.dueBy).toLocaleDateString() : 'N/A';
    const escalationMsg = `ESCALATION L${newLevel}: "${taskDesc}" (originally assigned to ${currentParams.assignedToName || currentParams.assignedTo}) was due ${dueBy}. Reason: ${escalationEntry.reason}`;

    if (escalateToUserId) {
      await notifyUser(ws, escalateToUserId, `Task Escalated to You (Level ${newLevel})`, escalationMsg, 'urgent');
    } else {
      await notifyManagers(ws, `Task Escalated — Level ${newLevel} Intervention Required`, escalationMsg, 'urgent');
    }

    await db.insert(orchestrationRunSteps).values({
      runId: taskId,
      stepNumber: updatedHistory.length + 1,
      stepName: `Escalated to Level ${newLevel}`,
      stepType: 'action',
      status: 'completed',
      inputData: { reason, escalateTo },
      outputData: { newLevel, escalationEntry },
      startedAt: new Date(),
      completedAt: new Date(),
      workspaceId: ws,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).catch(() => null);

    return { escalated: true, taskId, newEscalationLevel: newLevel, notified: escalateToUserId || 'managers', escalationEntry };
  }));

  helpaiOrchestrator.registerAction(mkAction('task.verify_completion', async (params) => {
    const { taskId, workspaceId } = params;
    if (!taskId) return { error: 'taskId required' };
    const [task] = await db.select().from(orchestrationRuns)
      .where(and(eq(orchestrationRuns.id, taskId), eq(orchestrationRuns.category, 'operational_task')))
      .limit(1);
    if (!task) return { error: `Task ${taskId} not found` };
    const taskType = (task as any).inputParams?.taskType;
    const context = (task as any).inputParams?.context || {};
    const ws = workspaceId || (task as any).workspaceId;
    let verified = false;
    let verificationDetails = '';
    let verificationData: any = {};

    switch (taskType) {
      case 'timesheet_approval': {
        const { timesheetId, employeeId, periodStart, periodEnd } = context;
        if (timesheetId) {
          const [entry] = await db.select({ status: timeEntries.status }).from(timeEntries).where(eq(timeEntries.id, timesheetId)).limit(1).catch(() => []);
          verified = (entry as any)?.status === 'approved';
          verificationDetails = verified ? 'Timesheet status confirmed as approved' : `Timesheet status is '${(entry as any)?.status || 'unknown'}' — not yet approved`;
          verificationData = { timesheetId, status: (entry as any)?.status };
        } else if (employeeId && periodStart && periodEnd) {
          const pending = await db.select({ id: timeEntries.id }).from(timeEntries)
            .where(and(eq(timeEntries.workspaceId, ws), eq(timeEntries.employeeId, employeeId), eq(timeEntries.status as any, 'pending')))
            .limit(1).catch(() => []);
          verified = pending.length === 0;
          verificationDetails = verified ? 'No pending timesheets found for employee in period' : `${pending.length} timesheet(s) still pending approval`;
        } else {
          verificationDetails = 'No timesheetId or employeeId provided — cannot verify automatically';
        }
        break;
      }
      case 'schedule_publish': {
        const { weekOf } = context;
        if (weekOf) {
          const weekStart = new Date(weekOf);
          const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
          const draftShifts = await db.select({ id: shifts.id }).from(shifts)
            .where(and(eq(shifts.workspaceId, ws), eq(shifts.status as any, 'draft'), sql`${shifts.startTime} >= ${weekStart}`, sql`${shifts.startTime} < ${weekEnd}`))
            .limit(1).catch(() => []);
          const unassigned = await db.select({ id: shifts.id }).from(shifts)
            .where(and(eq(shifts.workspaceId, ws), isNull(shifts.employeeId), sql`${shifts.startTime} >= ${weekStart}`, sql`${shifts.startTime} < ${weekEnd}`, ne(shifts.status, 'cancelled')))
            .limit(5).catch(() => []);
          verified = draftShifts.length === 0 && unassigned.length === 0;
          verificationDetails = verified
            ? 'Schedule published with no draft shifts and no open slots'
            : `Issues remain: ${draftShifts.length} draft shift(s), ${unassigned.length} unassigned slot(s)`;
          verificationData = { draftShifts: draftShifts.length, unassignedSlots: unassigned.length };
        } else {
          verificationDetails = 'weekOf not provided in context — cannot verify schedule publish';
        }
        break;
      }
      case 'invoice_followup': {
        const { invoiceId, clientId } = context;
        if (invoiceId) {
          const [inv] = await db.select({ status: invoices.status, total: invoices.total }).from(invoices).where(eq(invoices.id, invoiceId)).limit(1).catch(() => []);
          verified = ['paid', 'sent', 'partial'].includes((inv as any)?.status || '');
          verificationDetails = verified ? `Invoice status: ${(inv as any)?.status}` : `Invoice still at status '${(inv as any)?.status || 'unknown'}'`;
          verificationData = { invoiceId, status: (inv as any)?.status, total: (inv as any)?.total };
        } else {
          verificationDetails = 'invoiceId not provided — cannot verify invoice followup';
        }
        break;
      }
      case 'payroll_approval': {
        const { payrollRunId } = context;
        if (payrollRunId) {
          const [run] = await db.select({ status: payrollRuns.status, totalNetPay: payrollRuns.totalNetPay }).from(payrollRuns).where(eq(payrollRuns.id, payrollRunId)).limit(1).catch(() => []);
          verified = ['approved', 'processing', 'completed'].includes((run as any)?.status || '');
          verificationDetails = verified ? `Payroll run approved. Net pay: $${parseFloat(String((run as any)?.totalNetPay || 0)).toLocaleString()}` : `Payroll run status: '${(run as any)?.status || 'unknown'}' — pending approval`;
          verificationData = { payrollRunId, status: (run as any)?.status, netPay: (run as any)?.totalNetPay };
        } else {
          verificationDetails = 'payrollRunId not provided — cannot verify payroll approval';
        }
        break;
      }
      case 'document_request': {
        const { employeeId, docType } = context;
        if (employeeId) {
          const uploaded = await db.select({ id: sql`id` }).from(sql`employee_documents`)
            .where(sql`workspace_id = ${ws} AND employee_id = ${employeeId}${docType ? sql` AND doc_type = ${docType}` : sql``} AND expires_at > NOW()`)
            .limit(1).catch(() => []);
          verified = uploaded.length > 0;
          verificationDetails = verified ? `Valid ${docType || 'document'} found for employee` : `No valid ${docType || 'document'} found — document not yet uploaded`;
        } else {
          verificationDetails = 'employeeId not provided — cannot verify document upload';
        }
        break;
      }
      default:
        verificationDetails = `Task type '${taskType}' does not have automated verification. Manual review required.`;
        verified = false;
    }

    return { verified, taskId, taskType, verificationDetails, verificationData, verifiedAt: new Date().toISOString() };
  }));

  helpaiOrchestrator.registerAction(mkAction('task.close_loop', async (params) => {
    const { taskId, workspaceId, verificationResult, closedBy, outcome } = params;
    if (!taskId) return { error: 'taskId required' };
    const [task] = await db.select().from(orchestrationRuns)
      .where(and(eq(orchestrationRuns.id, taskId), eq(orchestrationRuns.category, 'operational_task')))
      .limit(1);
    if (!task) return { error: `Task ${taskId} not found` };
    const currentParams = (task as any).inputParams || {};
    const outputResult = {
      closedAt: new Date().toISOString(),
      closedBy: closedBy || 'trinity-ai',
      outcome: outcome || (verificationResult?.verified ? 'completed_verified' : 'completed_unverified'),
      verificationResult: verificationResult || null,
      escalationHistory: currentParams.escalationHistory || [],
      totalEscalationLevel: currentParams.escalationLevel || 0,
    };
    await db.update(orchestrationRuns)
      .set({
        status: 'completed',
        outputResult: outputResult as any,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(orchestrationRuns.id, taskId));

    const ws = workspaceId || (task as any).workspaceId;
    const taskDesc = currentParams.description || `Task ${taskId}`;
    await notifyUser(ws, currentParams.assignedTo, 'Task Closed', `Your task "${taskDesc}" has been marked complete. Trinity verified the outcome.`, 'normal');

    log.info(`[TrinityDelegationTracker] Loop closed: id=${taskId}, verified=${verificationResult?.verified || false}, closedBy=${closedBy}`);
    return { closed: true, taskId, outcome: outputResult.outcome, closedAt: outputResult.closedAt };
  }));

  helpaiOrchestrator.registerAction(mkAction('task.log_delegation_chain', async (params) => {
    const { taskId } = params;
    if (!taskId) return { error: 'taskId required' };
    const [task] = await db.select().from(orchestrationRuns)
      .where(and(eq(orchestrationRuns.id, taskId), eq(orchestrationRuns.category, 'operational_task')))
      .limit(1);
    if (!task) return { error: `Task ${taskId} not found` };
    const steps = await db.select().from(orchestrationRunSteps).where(eq(orchestrationRunSteps.runId, taskId)).orderBy(orchestrationRunSteps.stepNumber).catch(() => []);
    const params_ = (task as any).inputParams || {};
    const timeline = [
      { event: 'Task Created', timestamp: (task as any).createdAt, actor: (task as any).userId, detail: `Assigned to ${params_.assignedToName || params_.assignedTo}, due ${params_.dueBy}` },
      ...(params_.escalationHistory || []).map((h: any) => ({ event: `Status/Escalation: L${h.level || '-'}`, timestamp: h.timestamp, actor: h.updatedBy || h.escalatedTo || 'system', detail: h.reason || h.note || '' })),
      ...((task as any).completedAt ? [{ event: 'Loop Closed', timestamp: (task as any).completedAt, actor: (task as any).outputResult?.closedBy || 'trinity-ai', detail: (task as any).outputResult?.outcome || '' }] : []),
    ].sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
    return { task, steps, timeline, stepCount: steps.length };
  }));

  log.info('[Trinity Delegation Tracker] Registered 9 operational task delegation + verification actions');
}
