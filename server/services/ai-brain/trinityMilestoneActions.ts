/**
 * TRINITY MILESTONE ACTIONS — Anniversary + Milestone Intelligence
 * =============================================================
 * Trinity tracks employee lifecycles and flags important milestones.
 */

import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { db } from '../../db';
import { employees, orchestrationRuns, employeeRateHistory, workspaceMembers } from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { createNotification } from '../notificationService';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityMilestoneActions');

function mkAction(actionId: string, fn: (params: any) => Promise<any>): ActionHandler {
  return {
    actionId,
    name: actionId,
    category: 'automation' as any,
    description: `Trinity milestone intelligence: ${actionId}`,
    inputSchema: { type: 'object' as const, properties: {} },
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      try {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const data = await fn(req.params || {});
        return { success: true, actionId, message: 'Action completed', data, executionTimeMs: 0 };
      } catch (err: any) {
        return { success: false, actionId, message: err?.message || 'Unknown error', executionTimeMs: 0 };
      }
    }
  };
}

async function notifyOwner(workspaceId: string, title: string, message: string) {
  const ownerRows = await db.select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, 'org_owner')))
    .limit(1);
  const owner = ownerRows[0];
  if (owner && owner.userId) {
    await createNotification({
      workspaceId,
      userId: owner.userId,
      type: 'milestone_alert',
      title,
      message,
      priority: 'normal',
      idempotencyKey: `milestone_alert-${String(Date.now())}-${owner.userId}`,
        }).catch(() => null);
  }
}

export function registerMilestoneActions() {

  helpaiOrchestrator.registerAction(mkAction('employees.track_milestones', async (params) => {
    const { workspaceId, employeeId } = params;
    if (!workspaceId) throw new Error('workspaceId required');

    let query = db.select().from(employees).where(eq(employees.workspaceId, workspaceId));
    if (employeeId) {
      query = db.select().from(employees).where(and(eq(employees.workspaceId, workspaceId), eq(employees.id, employeeId))) as any;
    }

    const allEmployees = await query;
    const now = new Date();
    const results = [];

    for (const emp of allEmployees) {
      if (!emp.hireDate) continue;

      const hireDate = new Date(emp.hireDate);
      const diffDays = Math.floor((now.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24));
      
      const milestones = [90, 180, 365, 730]; // 90d, 180d, 1yr, 2yr
      for (const m of milestones) {
        const milestoneDate = new Date(hireDate);
        milestoneDate.setDate(milestoneDate.getDate() + m);
        
        const daysUntil = Math.floor((milestoneDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysUntil <= 30 && daysUntil >= -7) { // Within 30 days upcoming or 7 days past
          results.push({
            employeeId: emp.id,
            employeeName: `${emp.firstName} ${emp.lastName}`,
            milestoneType: m >= 365 ? `${m/365} Year Anniversary` : `${m} Day Milestone`,
            milestoneDate: milestoneDate.toISOString(),
            daysUntil,
            isOverdue: daysUntil < 0,
      idempotencyKey: `milestone_alert-${Date.now()}-${owner.userId}`
          });
        }
      }

      // Check birthday if it exists (using metadata or if dob exists in DB - check schema)
      // For now stick to hireDate as per T005 spec
    }

    return { milestones: results, count: results.length };
  }));

  helpaiOrchestrator.registerAction(mkAction('employees.flag_anniversary', async (params) => {
    const { workspaceId, employeeId, milestone } = params;
    if (!workspaceId || !employeeId || !milestone) throw new Error('workspaceId, employeeId, milestone required');

    const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
    if (!emp) throw new Error('Employee not found');

    const [lastRateChange] = await db.select()
      .from(employeeRateHistory)
      .where(eq(employeeRateHistory.employeeId, employeeId))
      .orderBy(desc(employeeRateHistory.createdAt))
      .limit(1);

    const monthsSincePayChange = lastRateChange 
      ? Math.floor((new Date().getTime() - new Date(lastRateChange.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30))
      : 'N/A';

    const title = `Anniversary Milestone: ${emp.firstName} ${emp.lastName}`;
    const message = `${emp.firstName} hits their ${milestone.milestoneType} on ${new Date(milestone.milestoneDate).toLocaleDateString()}. Performance Score: ${emp.performanceScore || 'N/A'}. Pay hasn't changed in ${monthsSincePayChange} months. Consider acknowledgment.`;

    await db.insert(orchestrationRuns).values({
      workspaceId,
      userId: 'trinity-ai',
      actionId: 'employees.milestone_flag',
      category: 'employee_milestone',
      source: 'trinity',
      status: 'completed',
      inputParams: { employeeId, milestone, performanceScore: emp.performanceScore, monthsSincePayChange },
      createdAt: new Date(),
      updatedAt: new Date()
    } as any);

    await notifyOwner(workspaceId, title, message);

    return { flagged: true, employeeId, milestoneType: milestone.milestoneType };
  }));

  helpaiOrchestrator.registerAction(mkAction('employees.flag_promotion_eligibility', async (params) => {
    const { workspaceId, employeeId } = params;
    if (!workspaceId) throw new Error('workspaceId required');

    let query = db.select().from(employees).where(and(
      eq(employees.workspaceId, workspaceId),
      eq(employees.isActive, true)
    ));
    if (employeeId) {
      query = db.select().from(employees).where(and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.id, employeeId)
      )) as any;
    }

    const eligible = [];
    const allEmployees = await query;
    const now = new Date();

    for (const emp of allEmployees) {
      // Logic: 12+ months at current role, performance score > 75
      if (!emp.hireDate) continue;
      
      const hireDate = new Date(emp.hireDate);
      const monthsInRole = Math.floor((now.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
      const performanceScore = emp.performanceScore || 0;

      if (monthsInRole >= 12 && performanceScore > 75) {
        eligible.push({
          employeeId: emp.id,
          employeeName: `${emp.firstName} ${emp.lastName}`,
          currentRole: emp.role || 'Staff',
          suggestedPromotion: 'Lead/Senior ' + (emp.role || 'Staff'),
          monthsInRole,
          performanceScore,
          reason: `High performance (${performanceScore}) and tenure (${monthsInRole} months)`
        });
      }
    }

    return { eligible, count: eligible.length };
  }));

  log.info('[Trinity Milestone Actions] Registered 3 milestone intelligence actions (employees.* domain)');
}
