/**
 * TRINITY DRUG TESTING MANAGEMENT — Operational Testing Loop
 * =========================================================
 * Trinity manages employee drug testing compliance and tracking.
 * 
 * Backing store: orchestration_runs (category='drug_test')
 * inputParams JSONB: { employeeId, employeeName, testType, testId, deadline, result, chainOfCustody, clientRequirements }
 */

import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { db } from '../../db';
import { orchestrationRuns, employees, clients, shifts } from '@shared/schema';
import { eq, and, sql, gte } from 'drizzle-orm';
import { createNotification } from '../notificationService';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityDrugTestingActions');

function mkAction(actionId: string, fn: (params: any, request: ActionRequest) => Promise<any>): ActionHandler {
  return {
    actionId,
    name: actionId,
    category: 'automation' as any,
    description: `Trinity drug testing management: ${actionId}`,
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (req: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const data = await fn(req.payload || {}, req);
        return { 
          success: true, 
          actionId, 
          message: `Success: ${actionId}`, 
          data,
          executionTimeMs: Date.now() - startTime
        };
      } catch (err: any) {
        return { 
          success: false, 
          actionId, 
          message: err?.message || 'Unknown error',
          executionTimeMs: Date.now() - startTime
        };
      }
    }
  };
}

async function notifyUser(
  workspaceId: string,
  userId: string,
  title: string,
  message: string,
  priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal',
) {
  await createNotification({ workspaceId, userId, type: 'drug_test', title, message, priority,
 idempotencyKey: `drug_test-${String(Date.now())}-${'system'}`,
        })
    .catch((err: Error) => log.warn(`[TrinityDrugTesting] Notification persist failed for user ${userId}:`, err.message));
}

export function registerDrugTestingActions() {

  // 1. test.schedule_drug_test
  helpaiOrchestrator.registerAction(mkAction('test.schedule_drug_test', async (params, req) => {
    const { workspaceId, employeeId, testType, deadline, reason } = params;
    if (!workspaceId || !employeeId || !testType || !deadline) {
      throw new Error('workspaceId, employeeId, testType, deadline required');
    }

    const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
    if (!employee) throw new Error(`Employee ${employeeId} not found`);

    const inputParams = {
      employeeId,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      testType,
      deadline,
      reason: reason || `Scheduled ${testType} drug test`,
      status: 'pending'
    };

    const [run] = await db.insert(orchestrationRuns).values({
      workspaceId,
      userId: req.userId || 'trinity-ai',
      actionId: 'test.drug_test',
      category: 'drug_test',
      source: 'trinity',
      status: 'running',
      inputParams,
      requiresApproval: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();

    const testId = (run as any).id;
    if (employee.userId) {
      await notifyUser(
        workspaceId,
        employee.userId,
        `Drug Test Scheduled: ${testType}`,
        `You have been scheduled for a ${testType} drug test. Deadline: ${new Date(deadline).toLocaleDateString()}. Please complete as soon as possible.`,
        'high'
      );
    }

    return {
      success: true,
      testId: (run as any).id,
      employeeName: inputParams.employeeName,
      deadline
    };
  }));

  // 2. test.record_result
  helpaiOrchestrator.registerAction(mkAction('test.record_result', async (params) => {
    const { workspaceId, employeeId, testId, result, chainOfCustody } = params;
    if (!testId || !result) throw new Error('testId and result required');

    const [existing] = await db.select().from(orchestrationRuns)
      .where(and(eq(orchestrationRuns.id, testId), eq(orchestrationRuns.category, 'drug_test')))
      .limit(1);
    
    if (!existing) throw new Error(`Drug test record ${testId} not found`);

    const currentParams = (existing as any).inputParams || {};
    const updatedParams = {
      ...currentParams,
      result,
      chainOfCustody,
      recordedAt: new Date().toISOString()
    };

    await db.update(orchestrationRuns)
      .set({
        status: result === 'passed' ? 'completed' : 'failed',
        inputParams: updatedParams as any,
        updatedAt: new Date(),
        completedAt: new Date()
      })
      .where(eq(orchestrationRuns.id, testId));

    if (result === 'failed') {
      // Trigger flag_failed_test logic or notify
      await helpaiOrchestrator.executeAction({
        actionId: 'test.flag_failed_test',
        category: 'automation',
        name: 'Flag Failed Test',
        userId: 'trinity-ai',
        userRole: 'Bot',
        workspaceId,
        payload: { workspaceId, employeeId: currentParams.employeeId, testId }
      });
    }

    return { success: true, testId, result };
  }));

  // 3. test.flag_failed_test
  helpaiOrchestrator.registerAction(mkAction('test.flag_failed_test', async (params) => {
    const { workspaceId, employeeId, testId } = params;
    if (!employeeId) throw new Error('employeeId required');

    // Update employee status - suspension/compliance issue
    await db.update(employees)
      .set({ 
        isActive: false, 
        notes: sql`COALESCE(notes, '') || '\nFAILED DRUG TEST - SUSPENDED'` 
      } as any)
      .where(eq(employees.id, employeeId));

    // Cancel all future assigned shifts for the suspended employee
    const now = new Date();
    const cancelResult = await db.update(shifts)
      .set({ status: 'cancelled' } as any)
      .where(and(
        eq(shifts.employeeId, employeeId),
        gte(shifts.startTime, now)
      ))
      .returning({ id: shifts.id });

    const cancelledShiftCount = cancelResult.length;
    if (cancelledShiftCount > 0 && workspaceId) {
      log.info(`[DrugTesting] Cancelled ${cancelledShiftCount} future shift(s) for suspended employee ${employeeId}`);
    }

    return { flagged: true, employeeId, action: 'suspended', cancelledShifts: cancelledShiftCount };
  }));

  // 4. test.generate_random_selection
  helpaiOrchestrator.registerAction(mkAction('test.generate_random_selection', async (params) => {
    const { workspaceId, percentage } = params;
    if (!workspaceId || !percentage) throw new Error('workspaceId and percentage required');

    const activeEmployees = await db.select().from(employees)
      .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)));
    
    const countToSelect = Math.max(1, Math.round((activeEmployees.length * percentage) / 100));
    const selected = activeEmployees
      .sort(() => 0.5 - Math.random())
      .slice(0, countToSelect);

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 2); // 48 hour deadline

    const results = [];
    for (const emp of selected) {
      const res = await helpaiOrchestrator.executeAction({
        actionId: 'test.schedule_drug_test',
        category: 'automation',
        name: 'Random Drug Test',
        userId: 'trinity-ai',
        userRole: 'Bot',
        workspaceId,
        payload: { 
          workspaceId, 
          employeeId: emp.id, 
          testType: 'random', 
          deadline: deadline.toISOString(),
          reason: 'Random quarterly selection'
        }
      });
      results.push(res.data);
    }

    return { selectedCount: selected.length, results };
  }));

  // 5. test.check_client_requirements
  helpaiOrchestrator.registerAction(mkAction('test.check_client_requirements', async (params) => {
    const { workspaceId, clientId } = params;
    if (!clientId) throw new Error('clientId required');

    const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
    if (!client) throw new Error(`Client ${clientId} not found`);

    // Assuming client has a requirements or notes field to check
    const requirements = (client as any).notes || (client as any).requirements || '';
    const structured = {
      drugTestingRequired: requirements.toLowerCase().includes('drug test'),
      backgroundCheckRequired: requirements.toLowerCase().includes('background'),
      rawRequirements: requirements
    };

    return { clientId, structured };
  }));

  log.info('[Trinity Drug Testing] Registered 5 drug testing management actions (test.* domain)');
}
