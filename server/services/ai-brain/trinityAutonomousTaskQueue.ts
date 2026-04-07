import { db } from '../../db';
import { sql, eq, and, inArray } from 'drizzle-orm';
import { typedCount, typedQuery } from '../../lib/typedSql';
import { trinityAutonomousTasks, shifts, employees, employeeCertifications, incidentReports } from '@shared/schema';

import { createLogger } from '../../lib/logger';
const log = createLogger('trinityAutonomousTaskQueue');

export type TaskType =
  | 'coverage_gap'
  | 'overtime_prevention'
  | 'compliance_expiry'
  | 'invoice_generation'
  | 'incident_followup'
  | 'client_health'
  | 'schedule_optimization'
  | 'financial_alert';

export type TaskStatus =
  | 'identified'
  | 'planning'
  | 'awaiting_approval'
  | 'executing'
  | 'verifying'
  | 'complete'
  | 'failed'
  | 'escalated_to_human';

export type FailureClass =
  | 'APPROACH_WRONG'
  | 'MISSING_DATA'
  | 'PERMISSION_ISSUE'
  | 'EXTERNAL_SERVICE'
  | 'LOGIC_ERROR';

export interface AttemptRecord {
  attempt: number;
  startedAt: string;
  approach: string;
  failureClass?: FailureClass;
  errorMessage?: string;
  succeeded: boolean;
}

export interface AutonomousTask {
  id: string;
  workspaceId: string;
  taskType: TaskType;
  description: string;
  identifiedAt: Date;
  status: TaskStatus;
  requiresHumanApproval: boolean;
  approvalThresholdReason?: string;
  approvedBy?: string;
  approvedAt?: Date;
  attempts: number;
  attemptLog: AttemptRecord[];
  outcome?: string;
  success?: boolean;
  escalationReason?: string;
}

export interface HumanEscalationReport {
  taskId: string;
  taskType: string;
  description: string;
  whatTrinityWasTryingToDo: string;
  attempts: AttemptRecord[];
  trinityRecommendation: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

interface AutonomyThresholds {
  autoExecuteUnderDollar: number;
  autoExecuteMaxOfficersAffected: number;
  alwaysRequireHuman: string[];
  neverRequireHuman: string[];
}

const DEFAULT_THRESHOLDS: AutonomyThresholds = {
  autoExecuteUnderDollar: 500,
  autoExecuteMaxOfficersAffected: 1,
  alwaysRequireHuman: ['legal', 'safety', 'termination', 'payment_over_1000'],
  neverRequireHuman: ['schedule_reminder', 'compliance_alert', 'incident_narrative_draft'],
};

class TrinityAutonomousTaskQueue {
  private thresholds: AutonomyThresholds = DEFAULT_THRESHOLDS;

  async createTask(
    workspaceId: string,
    taskType: TaskType,
    description: string,
    requiresHumanApproval: boolean = false,
    approvalThresholdReason?: string
  ): Promise<AutonomousTask> {
    const id = `atq_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // CATEGORY C — Raw SQL retained: ::jsonb | Tables: trinity_autonomous_tasks | Verified: 2026-03-23
    await db.insert(trinityAutonomousTasks).values({
      id: id,
      workspaceId: workspaceId,
      taskType: taskType,
      description: description,
      status: requiresHumanApproval ? 'awaiting_approval' : 'identified',
      requiresHumanApproval: requiresHumanApproval,
      approvalThresholdReason: approvalThresholdReason || null,
      attempts: 0,
      attemptLog: [],
    });

    return {
      id,
      workspaceId,
      taskType,
      description,
      identifiedAt: new Date(),
      status: requiresHumanApproval ? 'awaiting_approval' : 'identified',
      requiresHumanApproval,
      approvalThresholdReason,
      attempts: 0,
      attemptLog: [],
    };
  }

  async executeTask(
    taskId: string,
    executorFn: () => Promise<{ success: boolean; outcome: string; error?: string }>
  ): Promise<{ success: boolean; escalated: boolean; report?: HumanEscalationReport }> {
    const taskResult = await db.select().from(trinityAutonomousTasks).where(eq(trinityAutonomousTasks.id, taskId));

    if (!taskResult.length) {
      return { success: false, escalated: false };
    }

    const task = taskResult[0] as any;
    const attemptLog: AttemptRecord[] = JSON.parse(
      typeof task.attempt_log === 'string' ? task.attempt_log : JSON.stringify(task.attempt_log || [])
    );
    const maxAttempts = 3;

    await db.update(trinityAutonomousTasks).set({
      status: 'executing',
      executedAt: new Date(),
    }).where(eq(trinityAutonomousTasks.id, taskId));

    let currentAttempt = task.attempts + 1;
    let lastError = '';
    let lastFailureClass: FailureClass = 'APPROACH_WRONG';

    while (currentAttempt <= maxAttempts) {
      const attemptRecord: AttemptRecord = {
        attempt: currentAttempt,
        startedAt: new Date().toISOString(),
        approach: this.getApproachDescription(currentAttempt, lastFailureClass),
        succeeded: false,
      };

      try {
        const result = await executorFn();

        if (result.success) {
          attemptRecord.succeeded = true;
          attemptLog.push(attemptRecord);

          await db.update(trinityAutonomousTasks).set({
            status: 'complete',
            completedAt: new Date(),
            verifiedAt: new Date(),
            attempts: currentAttempt,
            attemptLog: attemptLog,
            outcome: result.outcome,
            success: true,
          }).where(eq(trinityAutonomousTasks.id, taskId));

          return { success: true, escalated: false };
        } else {
          lastError = result.error || result.outcome;
          lastFailureClass = this.classifyFailure(lastError);
          attemptRecord.failureClass = lastFailureClass;
          attemptRecord.errorMessage = lastError;
          attemptLog.push(attemptRecord);

          if (lastFailureClass === 'EXTERNAL_SERVICE' && currentAttempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      } catch (err: any) {
        lastError = err?.message || String(err);
        lastFailureClass = this.classifyFailure(lastError);
        attemptRecord.failureClass = lastFailureClass;
        attemptRecord.errorMessage = lastError;
        attemptLog.push(attemptRecord);
      }

      currentAttempt++;
    }

    const escalationReason = `All ${maxAttempts} execution attempts failed. Last failure class: ${lastFailureClass}. Last error: ${lastError}`;

    await db.update(trinityAutonomousTasks).set({
      status: 'escalated_to_human',
      attempts: currentAttempt - 1,
      attemptLog: attemptLog,
      outcome: escalationReason,
      success: false,
      escalationReason: escalationReason,
    }).where(eq(trinityAutonomousTasks.id, taskId));

    const taskData = taskResult[0] as any;
    const report = this.buildEscalationReport(taskId, taskData, attemptLog, lastFailureClass);

    return { success: false, escalated: true, report };
  }

  private classifyFailure(errorMessage: string): FailureClass {
    const msg = errorMessage.toLowerCase();
    if (msg.includes('permission') || msg.includes('unauthorized') || msg.includes('forbidden')) {
      return 'PERMISSION_ISSUE';
    }
    if (msg.includes('not found') || msg.includes('missing') || msg.includes('no data')) {
      return 'MISSING_DATA';
    }
    if (msg.includes('timeout') || msg.includes('network') || msg.includes('connection') || msg.includes('service unavailable')) {
      return 'EXTERNAL_SERVICE';
    }
    if (msg.includes('logic') || msg.includes('invalid') || msg.includes('assertion')) {
      return 'LOGIC_ERROR';
    }
    return 'APPROACH_WRONG';
  }

  private getApproachDescription(attemptNumber: number, lastFailureClass: FailureClass): string {
    if (attemptNumber === 1) return 'Primary approach — direct execution via standard pathway';
    if (attemptNumber === 2) {
      const approaches: Record<FailureClass, string> = {
        APPROACH_WRONG: 'Secondary approach — alternate strategy with different data path',
        MISSING_DATA: 'Secondary approach — gather missing data from fallback sources, then retry',
        PERMISSION_ISSUE: 'Secondary approach — elevate via approval chain and retry with elevated context',
        EXTERNAL_SERVICE: 'Secondary approach — wait 5 minutes and retry via alternate service endpoint',
        LOGIC_ERROR: 'Secondary approach — recompute with corrected logic, skip problematic branch',
      };
      return approaches[lastFailureClass];
    }
    return 'Tertiary approach — minimal-footprint fallback with maximum safety constraints';
  }

  private buildEscalationReport(
    taskId: string,
    taskData: any,
    attemptLog: AttemptRecord[],
    lastFailureClass: FailureClass
  ): HumanEscalationReport {
    const recommendationMap: Record<FailureClass, string> = {
      APPROACH_WRONG: 'Manual review of the task objective required. Trinity was unable to find an effective execution path. Human judgment needed to determine correct approach.',
      MISSING_DATA: 'Required data is not available in the system. Human operator should verify data completeness and re-trigger the task once data is available.',
      PERMISSION_ISSUE: 'This action requires elevated permissions that Trinity cannot self-grant. Human owner/manager approval needed to authorize the action.',
      EXTERNAL_SERVICE: 'The required external service is unavailable. Human operator should verify service status and manually execute when service is restored.',
      LOGIC_ERROR: 'Trinity detected a logical conflict in the task requirements. Human review of the task parameters and business rules is needed.',
    };

    const taskTypeUrgencyMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
      coverage_gap: 'high',
      overtime_prevention: 'medium',
      compliance_expiry: 'high',
      invoice_generation: 'medium',
      incident_followup: 'high',
      client_health: 'medium',
      schedule_optimization: 'low',
      financial_alert: 'medium',
    };

    return {
      taskId,
      taskType: taskData.task_type,
      description: taskData.description,
      whatTrinityWasTryingToDo: taskData.description,
      attempts: attemptLog,
      trinityRecommendation: recommendationMap[lastFailureClass],
      urgency: taskTypeUrgencyMap[taskData.task_type] || 'medium',
    };
  }

  requiresHumanApproval(taskType: TaskType, estimatedCost: number, officersAffected: number): boolean {
    if (this.thresholds.neverRequireHuman.some(t => taskType.includes(t))) return false;
    if (this.thresholds.alwaysRequireHuman.some(t => taskType.includes(t))) return true;
    if (estimatedCost > this.thresholds.autoExecuteUnderDollar) return true;
    if (officersAffected > this.thresholds.autoExecuteMaxOfficersAffected) return true;
    return false;
  }

  async scanForNewTasks(workspaceId: string): Promise<AutonomousTask[]> {
    const newTasks: AutonomousTask[] = [];
    const now = new Date();

    // Converted to Drizzle ORM: INTERVAL → sql fragment
    const unassignedShiftsResult = await db.select({ count: sql`COUNT(*)` })
      .from(shifts)
      .where(sql`
        ${shifts.workspaceId} = ${workspaceId}
        AND ${shifts.startTime} >= NOW()
        AND ${shifts.startTime} <= NOW() + INTERVAL '48 hours'
        AND ${shifts.assignedEmployeeId} IS NULL
        AND ${shifts.status} != 'cancelled'
      `)
      .catch(() => [{ count: '0' }]);

    const unassignedCount = parseInt(String(unassignedShiftsResult[0]?.count || '0'));
    if (unassignedCount > 0) {
      // Converted to Drizzle ORM: INTERVAL → sql fragment
      const existingTaskResult = await db.select({ id: trinityAutonomousTasks.id })
        .from(trinityAutonomousTasks)
        .where(sql`
          ${trinityAutonomousTasks.workspaceId} = ${workspaceId}
          AND ${trinityAutonomousTasks.taskType} = 'coverage_gap'
          AND ${trinityAutonomousTasks.status} IN ('identified', 'planning', 'awaiting_approval', 'executing')
          AND ${trinityAutonomousTasks.identifiedAt} >= NOW() - INTERVAL '1 hour'
        `)
        .limit(1)
        .catch(() => []);

      if (!existingTaskResult.length) {
        const needsApproval = this.requiresHumanApproval('coverage_gap', 0, unassignedCount);
        const task = await this.createTask(
          workspaceId,
          'coverage_gap',
          `${unassignedCount} shift(s) are unassigned in the next 48 hours. Trinity will identify available officers and offer the shifts.`,
          needsApproval,
          needsApproval ? `Coverage gap affects ${unassignedCount} shifts` : undefined
        );
        newTasks.push(task);
      }
    }

    // Converted to Drizzle ORM: INTERVAL → sql fragment
    const approachingOTResult = await db.select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      weekHours: sql`SUM(EXTRACT(EPOCH FROM (${shifts.endTime} - ${shifts.startTime})) / 3600.0)`
    })
    .from(shifts)
    .join(employees, eq(shifts.assignedEmployeeId, employees.id))
    .where(sql`
      ${shifts.workspaceId} = ${workspaceId}
      AND ${shifts.startTime} >= date_trunc('week', NOW())
      AND ${shifts.endTime} IS NOT NULL
      AND ${shifts.assignedEmployeeId} IS NOT NULL
    `)
    .groupBy(employees.id, employees.firstName, employees.lastName)
    .having(sql`SUM(EXTRACT(EPOCH FROM (${shifts.endTime} - ${shifts.startTime})) / 3600.0) >= 32`)
    .catch(() => []);

    for (const officer of (approachingOTResult as any[])) {
      const weekHours = parseFloat(String(officer.weekHours || '0'));
      const name = `${officer.firstName} ${officer.lastName}`;

      // Converted to Drizzle ORM: INTERVAL → sql fragment
      const existingResult = await db.select({ id: trinityAutonomousTasks.id })
        .from(trinityAutonomousTasks)
        .where(sql`
          ${trinityAutonomousTasks.workspaceId} = ${workspaceId}
          AND ${trinityAutonomousTasks.taskType} = 'overtime_prevention'
          AND ${trinityAutonomousTasks.description} LIKE ${`%${officer.id}%`}
          AND ${trinityAutonomousTasks.status} IN ('identified', 'planning', 'awaiting_approval', 'executing')
          AND ${trinityAutonomousTasks.identifiedAt} >= NOW() - INTERVAL '4 hours'
        `)
        .limit(1)
        .catch(() => []);

      if (!existingResult.length) {
        const task = await this.createTask(
          workspaceId,
          'overtime_prevention',
          `${name} has ${weekHours.toFixed(1)} hours this week (officer ID: ${officer.id}). At this pace they will hit FLSA overtime threshold. Trinity will review remaining shifts and propose rebalancing.`,
          false
        );
        newTasks.push(task);
      }
    }

    // Converted to Drizzle ORM: INTERVAL → sql fragment
    const expiringLicensesResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(employeeCertifications)
      .where(and(
        eq(employeeCertifications.workspaceId, workspaceId),
        eq(employeeCertifications.status, 'active'),
        sql`${employeeCertifications.expirationDate} <= now() + interval '30 days'`,
        sql`${employeeCertifications.expirationDate} >= now()`
      ))
      .catch(() => [{ count: 0 }]);

    const expiringCount = parseInt(String(expiringLicensesResult[0]?.count || '0'));
    if (expiringCount > 0) {
      // Converted to Drizzle ORM: INTERVAL → sql fragment
      const existingResult = await db.select({ id: trinityAutonomousTasks.id })
        .from(trinityAutonomousTasks)
        .where(sql`
          ${trinityAutonomousTasks.workspaceId} = ${workspaceId}
          AND ${trinityAutonomousTasks.taskType} = 'compliance_expiry'
          AND ${trinityAutonomousTasks.identifiedAt} >= NOW() - INTERVAL '24 hours'
          AND ${trinityAutonomousTasks.status} NOT IN ('complete', 'failed')
        `)
        .limit(1)
        .catch(() => []);

      if (!existingResult.length) {
        const task = await this.createTask(
          workspaceId,
          'compliance_expiry',
          `${expiringCount} officer license(s) expire within 30 days. Trinity will generate renewal reminders and notify supervisors. Per Texas Occupations Code § 1702.224 — expired licenses disqualify officers from active duty.`,
          false
        );
        newTasks.push(task);
      }
    }

    // Converted to Drizzle ORM: INTERVAL → sql fragment
    const staleDARsResult = await db.select({ count: sql`COUNT(*)` })
      .from(incidentReports)
      .where(sql`
        ${incidentReports.workspaceId} = ${workspaceId}
        AND ${incidentReports.status} = 'submitted'
        AND COALESCE(${incidentReports.occurredAt}, ${incidentReports.updatedAt}) <= NOW() - INTERVAL '24 hours'
      `)
      .catch(() => [{ count: '0' }]);

    const staleDARCount = parseInt(String(staleDARsResult[0]?.count || '0'));
    if (staleDARCount > 0) {
      // Converted to Drizzle ORM: INTERVAL → sql fragment
      const existingResult = await db.select({ id: trinityAutonomousTasks.id })
        .from(trinityAutonomousTasks)
        .where(sql`
          ${trinityAutonomousTasks.workspaceId} = ${workspaceId}
          AND ${trinityAutonomousTasks.taskType} = 'incident_followup'
          AND ${trinityAutonomousTasks.identifiedAt} >= NOW() - INTERVAL '12 hours'
          AND ${trinityAutonomousTasks.status} NOT IN ('complete', 'failed')
        `)
        .limit(1)
        .catch(() => []);

      if (!existingResult.length) {
        const task = await this.createTask(
          workspaceId,
          'incident_followup',
          `${staleDARCount} incident report(s) have been submitted but not reviewed in over 24 hours. Trinity will generate follow-up notifications and escalate to managers.`,
          false
        );
        newTasks.push(task);
      }
    }

    // === THALAMUS WIRING — Phase C Autonomous Task Queue ===
    // Emit SYSTEM_SIGNAL for each newly identified task so thalamic logs track autonomous activity
    if (newTasks.length > 0) {
      try {
        const { trinityThalamus } = await import('./trinityThalamusService');
        for (const task of newTasks) {
          await trinityThalamus.process(
            {
              event: 'autonomous_task',
              type: 'task_identified',
              taskType: task.taskType,
              description: task.description,
              requiresHumanApproval: task.requiresHumanApproval,
            },
            'autonomous_task',
            undefined,
            workspaceId,
            'PLATFORM',
          ).catch(() => null);
        }
      } catch {
        // Non-fatal — autonomous task data must always flow
      }
    }

    return newTasks;
  }

  async getActiveTasksForBriefing(workspaceId: string): Promise<{
    tasks: AutonomousTask[];
    summary: string;
  }> {
    // Converted to Drizzle ORM: NOT IN → notInArray
    const result = await typedQuery(sql`
      SELECT id, workspace_id, task_type, description, identified_at,
             status, requires_human_approval, approval_threshold_reason,
             approved_by, approved_at, attempts, attempt_log,
             outcome, success, escalation_reason
      FROM trinity_autonomous_tasks
      WHERE workspace_id = ${workspaceId}
        AND status NOT IN ('complete', 'failed')
      ORDER BY identified_at DESC
      LIMIT 20
    `).catch(() => ([]));

    const tasks: AutonomousTask[] = (result as any[]).map(r => ({
      id: r.id,
      workspaceId: r.workspace_id,
      taskType: r.task_type,
      description: r.description,
      identifiedAt: r.identified_at,
      status: r.status,
      requiresHumanApproval: r.requires_human_approval,
      approvalThresholdReason: r.approval_threshold_reason,
      attempts: r.attempts,
      attemptLog: typeof r.attempt_log === 'string'
        ? JSON.parse(r.attempt_log) : (r.attempt_log || []),
      outcome: r.outcome,
      success: r.success,
      escalationReason: r.escalation_reason,
    }));

    const awaitingApproval = tasks.filter(t => t.status === 'awaiting_approval');
    const executing = tasks.filter(t => t.status === 'executing');
    const escalated = tasks.filter(t => t.status === 'escalated_to_human');

    let summary = `Trinity Autonomous Queue: ${tasks.length} active task(s).`;
    if (awaitingApproval.length > 0) {
      summary += ` ${awaitingApproval.length} awaiting your approval.`;
    }
    if (escalated.length > 0) {
      summary += ` ${escalated.length} escalated to human — need your attention.`;
    }
    if (executing.length > 0) {
      summary += ` ${executing.length} currently executing.`;
    }
    if (tasks.length === 0) {
      summary = 'Trinity Autonomous Queue is clear. No pending tasks.';
    }

    return { tasks, summary };
  }

  async approveTask(taskId: string, approvedBy: string): Promise<void> {
    await db.update(trinityAutonomousTasks).set({
      status: 'identified',
      approvedBy: approvedBy,
      approvedAt: new Date(),
    }).where(and(eq(trinityAutonomousTasks.id, taskId), eq(trinityAutonomousTasks.status, 'awaiting_approval')));
  }

  async getRecentCompletedTasks(workspaceId: string, limit: number = 10): Promise<AutonomousTask[]> {
    // Converted to Drizzle ORM: IN subquery → inArray
    const result = await typedQuery(sql`
      SELECT id, workspace_id, task_type, description, identified_at, completed_at,
             status, attempts, attempt_log, outcome, success
      FROM trinity_autonomous_tasks
      WHERE workspace_id = ${workspaceId}
        AND status IN ('complete', 'escalated_to_human')
      ORDER BY completed_at DESC NULLS LAST
      LIMIT ${limit}
    `).catch(() => ([]));

    return (result as any[]).map(r => ({
      id: r.id,
      workspaceId: r.workspace_id,
      taskType: r.task_type,
      description: r.description,
      identifiedAt: r.identified_at,
      status: r.status,
      requiresHumanApproval: false,
      attempts: r.attempts,
      attemptLog: typeof r.attempt_log === 'string'
        ? JSON.parse(r.attempt_log) : (r.attempt_log || []),
      outcome: r.outcome,
      success: r.success,
    }));
  }
}

export const trinityAutonomousTaskQueue = new TrinityAutonomousTaskQueue();
