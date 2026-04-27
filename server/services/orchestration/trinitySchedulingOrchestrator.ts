/**
 * Trinity Scheduling Orchestrator
 * 
 * Active autonomous scheduling service that Trinity uses to:
 * - Create new shifts based on demand
 * - Edit/optimize existing shifts
 * - Delete unnecessary shifts
 * - Swap employees between shifts
 * - Track all mutations for user verification
 * - Save work payload to Trinity memory
 * 
 * IMPORTANT: This uses a DRY-RUN mode by default.
 * Changes are NOT persisted until user verifies them.
 * Pending mutations are stored with the execution record.
 */

import crypto from 'crypto';
import { db } from '../../db';
import { shifts, employees, clients, workspaces } from '@shared/schema';
import { eq, and, gte, lte, asc } from 'drizzle-orm';
import { automationExecutionTracker, type WorkBreakdown } from './automationExecutionTracker';
import { platformEventBus } from '../platformEventBus';
import { geminiClient } from '../ai-brain/providers/geminiClient';
import { startOfWeek, endOfWeek, addDays, format, differenceInHours } from 'date-fns';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinitySchedulingOrchestrator');


export type SchedulingMutationType = 
  | 'create_shift'
  | 'edit_shift'
  | 'delete_shift'
  | 'swap_employees'
  | 'fill_open_shift'
  | 'reassign_shift';

export interface SchedulingMutation {
  id: string;
  type: SchedulingMutationType;
  description: string;
  beforeState?: Record<string, any>;
  afterState?: Record<string, any>;
  employeeId?: string;
  employeeName?: string;
  shiftId?: string;
  clientId?: string;
  clientName?: string;
  startTime?: Date;
  endTime?: Date;
  estimatedHours?: number;
  estimatedCost?: number;
  reason: string;
  dbOperation?: {
    table: 'shifts';
    action: 'insert' | 'update' | 'delete';
    data?: Record<string, any>;
    where?: Record<string, any>;
  };
}

export interface SchedulingSessionResult {
  success: boolean;
  sessionId: string;
  executionId: string;
  workspaceId: string;
  startedAt: Date;
  completedAt: Date;
  totalShiftsAnalyzed: number;
  totalOpenShifts: number;
  totalMutations: number;
  mutations: SchedulingMutation[];
  summary: {
    shiftsCreated: number;
    shiftsEdited: number;
    shiftsDeleted: number;
    employeesSwapped: number;
    openShiftsFilled: number;
    totalHoursScheduled: number;
    estimatedLaborCost: number;
  };
  aiSummary: string;
  requiresVerification: boolean;
  verificationDeadline?: Date;
}

interface SchedulingContext {
  workspaceId: string;
  weekStart: Date;
  weekEnd: Date;
  employees: any[];
  clients: any[];
  existingShifts: any[];
  openShifts: any[];
}

class TrinitySchedulingOrchestratorService {
  private activeSessionId: string | null = null;
  private pendingSessions: Map<string, SchedulingMutation[]> = new Map();

  async startSchedulingSession(params: {
    workspaceId: string;
    triggeredBy: string;
    weekStart?: Date;
    mode: 'optimize' | 'fill_gaps' | 'full_generate';
    dryRun?: boolean;
  }): Promise<SchedulingSessionResult> {
    const sessionId = `sched-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    this.activeSessionId = sessionId;
    const startedAt = new Date();
    const mutations: SchedulingMutation[] = [];
    const dryRun = params.dryRun ?? true;

    log.info(`[TrinitySchedulingOrchestrator] Starting session ${sessionId} for workspace ${params.workspaceId} (dryRun: ${dryRun})`);

    const weekStart = params.weekStart || startOfWeek(new Date(), { weekStartsOn: 0 });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });

    const executionId = await automationExecutionTracker.createExecution({
      workspaceId: params.workspaceId,
      actionType: 'schedule_publish',
      actionName: `Trinity Autonomous Scheduling - ${params.mode}`,
      triggeredBy: params.triggeredBy,
      triggerSource: 'button_click',
      requiresVerification: true,
      inputPayload: {
        mode: params.mode,
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        sessionId,
        dryRun,
      },
    });

    await automationExecutionTracker.startExecution(executionId);

    try {
      const context = await this.gatherSchedulingContext(params.workspaceId, weekStart, weekEnd);
      const totalShiftsAnalyzed = context.existingShifts.length;
      const totalOpenShifts = context.openShifts.length;

      log.info(
        `[TrinitySchedulingOrchestrator] Context ready for ${params.workspaceId}: ${totalOpenShifts} open shifts across ${totalShiftsAnalyzed} scheduled records (${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d')})`
      );
      
      // NOTE: trinity_scheduling_started is already broadcast directly by
      // trinityAutonomousScheduler via broadcastToWorkspace(). Do NOT emit it
      // again here via event bus — that causes duplicate UI notifications.
      
      switch (params.mode) {
        case 'optimize':
          await this.proposeOptimizations(context, mutations, sessionId);
          break;
        case 'fill_gaps':
          await this.proposeOpenShiftFills(context, mutations, sessionId);
          break;
        case 'full_generate':
          await this.proposeFullSchedule(context, mutations, sessionId);
          break;
      }

      this.pendingSessions.set(executionId, mutations);

      const summary = this.calculateSummary(mutations);
      const aiSummary = await this.generateAISummary(params.workspaceId, mutations, summary);
      const completedAt = new Date();

      const workBreakdown: WorkBreakdown = {
        items: [
          { label: 'Shifts Created', value: summary.shiftsCreated, icon: 'plus', category: 'creation' },
          { label: 'Shifts Modified', value: summary.shiftsEdited, icon: 'edit', category: 'modification' },
          { label: 'Shifts Removed', value: summary.shiftsDeleted, icon: 'trash', category: 'deletion' },
          { label: 'Open Shifts Filled', value: summary.openShiftsFilled, icon: 'user-check', category: 'assignment' },
          { label: 'Employee Swaps', value: summary.employeesSwapped, icon: 'refresh', category: 'swap' },
          { label: 'Total Hours', value: `${summary.totalHoursScheduled.toFixed(1)}h`, icon: 'clock', category: 'hours' },
          { label: 'Labor Cost', value: `$${summary.estimatedLaborCost.toFixed(2)}`, icon: 'dollar', category: 'cost' },
        ],
        totalCount: mutations.length,
        totalValue: summary.estimatedLaborCost,
        currency: 'USD',
      };

      await automationExecutionTracker.completeExecution(executionId, {
        outputPayload: {
          sessionId,
          dryRun: true,
          pendingMutations: mutations.map(m => ({
            id: m.id,
            type: m.type,
            description: m.description,
            employeeName: m.employeeName,
            startTime: m.startTime?.toISOString(),
            endTime: m.endTime?.toISOString(),
            dbOperation: m.dbOperation,
          })),
          summary,
        },
        workBreakdown,
        aiSummary,
        processingTimeMs: completedAt.getTime() - startedAt.getTime(),
        itemsProcessed: mutations.length,
        itemsFailed: 0,
        requiresVerification: true,
      });

      // Publish scheduling session completion — Trinity + automation subscribers receive this
      platformEventBus.publish({
        type: 'scheduling_session_complete',
        category: 'automation',
        title: 'Scheduling Session Complete',
        description: `Trinity scheduling session finalized — ${mutations.length} shift mutation(s) awaiting verification`,
        workspaceId: params.workspaceId,
        metadata: {
          sessionId,
          executionId,
          mutationCount: mutations.length,
          summary,
          awaitingVerification: true,
        },
      }).catch((err) => log.warn('[trinitySchedulingOrchestrator] Fire-and-forget failed:', err));
      
      // NOTE: trinity_scheduling_completed is already broadcast directly by
      // trinityAutonomousScheduler via broadcastToWorkspace(). Do NOT emit it
      // again here via event bus — that causes duplicate toast notifications.

      const result: SchedulingSessionResult = {
        success: true,
        sessionId,
        executionId,
        workspaceId: params.workspaceId,
        startedAt,
        completedAt,
        totalShiftsAnalyzed,
        totalOpenShifts,
        totalMutations: mutations.length,
        mutations,
        summary,
        aiSummary,
        requiresVerification: true,
        verificationDeadline: addDays(completedAt, 1),
      };

      log.info(`[TrinitySchedulingOrchestrator] Session ${sessionId} complete (DRY RUN): ${mutations.length} proposed mutations awaiting verification`);
      return result;

    } catch (error: any) {
      log.error(`[TrinitySchedulingOrchestrator] Session ${sessionId} failed:`, error);

      await automationExecutionTracker.failExecution(executionId, {
        failureReason: (error instanceof Error ? error.message : String(error)),
        failureCode: 'SCHEDULING_ERROR',
        remediationSteps: [
          { step: 1, description: 'Check employee availability data is up to date' },
          { step: 2, description: 'Verify client requirements are configured' },
          { step: 3, description: 'Retry the scheduling operation' },
        ],
      });

      throw error;
    } finally {
      this.activeSessionId = null;
    }
  }

  async applyVerifiedMutations(executionId: string): Promise<{ success: boolean; appliedCount: number; inserted: number; updated: number; deleted: number; skipped: number; errors: string[] }> {
    const mutations = this.pendingSessions.get(executionId);
    if (!mutations || mutations.length === 0) {
      const execution = await automationExecutionTracker.getExecution(executionId);
      // @ts-expect-error — TS migration: fix in refactoring sprint
      if (execution?.outputPayload?.pendingMutations) {
        const storedMutations = (execution as any).outputPayload.pendingMutations as SchedulingMutation[];
        return this.applyMutationsToDatabase(storedMutations, executionId);
      }
      return { success: true, appliedCount: 0, errors: [] };
    }

    return this.applyMutationsToDatabase(mutations, executionId);
  }

  private async applyMutationsToDatabase(
    mutations: SchedulingMutation[],
    executionId: string,
  ): Promise<{
    success: boolean;
    appliedCount: number;
    inserted: number;
    updated: number;
    deleted: number;
    skipped: number;
    errors: string[];
  }> {
    log.info(`[TrinitySchedulingOrchestrator] Applying ${mutations.length} verified mutations for execution ${executionId}`);

    // ── Resolve workspace once from the execution record ──────────────────────
    // Never trust per-mutation data for the workspace scope — pull it from the
    // authoritative execution record so every write is tenant-locked.
    const execution = await automationExecutionTracker.getExecution(executionId);
    const workspaceId: string | undefined = (execution as any)?.workspaceId;

    if (!workspaceId) {
      const msg = `Cannot apply mutations: workspaceId not found on execution ${executionId}`;
      log.error(`[TrinitySchedulingOrchestrator] ${msg}`);
      return { success: false, appliedCount: 0, inserted: 0, updated: 0, deleted: 0, skipped: 0, errors: [msg] };
    }

    // ── Counters ──────────────────────────────────────────────────────────────
    let inserted = 0;
    let updated = 0;
    let deleted = 0;
    let skipped = 0;
    const errors: string[] = [];

    // ── All mutations in one atomic transaction ───────────────────────────────
    // If any single mutation fails the entire batch rolls back, leaving the DB
    // in a clean state instead of a half-applied ghost schedule.
    try {
      await db.transaction(async (tx) => {
        for (const mutation of mutations) {
          if (!mutation.dbOperation) {
            log.info(`[TrinitySchedulingOrchestrator] Skipping mutation ${mutation.id} — no dbOperation`);
            skipped++;
            continue;
          }

          const { table, action, data, where } = mutation.dbOperation;

          if (table !== 'shifts') {
            log.warn(`[TrinitySchedulingOrchestrator] Unknown table '${table}' in mutation ${mutation.id} — skipped`);
            skipped++;
            continue;
          }

          switch (action) {
            case 'insert': {
              if (!data) { skipped++; break; }
              await tx.insert(shifts).values({
                id: data.id,
                workspaceId,                          // ← always from execution, never from data
                employeeId: data.employeeId ?? null,
                clientId: data.clientId ?? null,
                title: data.title ?? null,
                startTime: new Date(data.startTime),
                endTime: new Date(data.endTime),
                status: data.status ?? 'scheduled',
                aiGenerated: true,
              });
              inserted++;
              break;
            }

            case 'update': {
              if (!data || !where?.id) { skipped++; break; }
              // Scope by BOTH shift id AND workspaceId — prevents cross-tenant mutations
              const setPayload: Record<string, unknown> = {};
              if (data.employeeId !== undefined) setPayload.employeeId = data.employeeId;
              if (data.status     !== undefined) setPayload.status     = data.status;
              if (data.startTime  !== undefined) setPayload.startTime  = new Date(data.startTime);
              if (data.endTime    !== undefined) setPayload.endTime    = new Date(data.endTime);
              if (data.title      !== undefined) setPayload.title      = data.title;
              if (data.clientId   !== undefined) setPayload.clientId   = data.clientId;
              if (Object.keys(setPayload).length === 0) { skipped++; break; }
              await tx.update(shifts)
                .set(setPayload)
                .where(and(eq(shifts.id, where.id), eq(shifts.workspaceId, workspaceId)));
              updated++;
              break;
            }

            case 'delete': {
              if (!where?.id) { skipped++; break; }
              // Scope by BOTH shift id AND workspaceId — prevents cross-tenant deletes
              await tx.delete(shifts)
                .where(and(eq(shifts.id, where.id), eq(shifts.workspaceId, workspaceId)));
              deleted++;
              break;
            }

            default: {
              log.warn(`[TrinitySchedulingOrchestrator] Unknown action '${action}' in mutation ${mutation.id} — skipped`);
              skipped++;
            }
          }

          log.info(`[TrinitySchedulingOrchestrator] ${action} ${mutation.type}: ${mutation.description}`);
        }
      });
    } catch (txError: unknown) {
      // Transaction rolled back — nothing was written
      const msg = `Transaction rolled back: ${txError instanceof Error ? txError.message : String(txError)}`;
      log.error(`[TrinitySchedulingOrchestrator] ${msg}`);
      errors.push(msg);
    }

    const appliedCount = inserted + updated + deleted;
    this.pendingSessions.delete(executionId);

    await automationExecutionTracker.verifyExecution(executionId, {
      verifiedBy: 'trinity-autonomous-scheduler',
      verificationNotes: JSON.stringify({
        applied: errors.length === 0,
        appliedCount,
        inserted,
        updated,
        deleted,
        skipped,
        workspaceId,
        appliedAt: new Date().toISOString(),
        errors,
      }),
    });

    log.info(`[TrinitySchedulingOrchestrator] Mutations complete — inserted:${inserted} updated:${updated} deleted:${deleted} skipped:${skipped} errors:${errors.length}`);

    return { success: errors.length === 0, appliedCount, inserted, updated, deleted, skipped, errors };
  }

  async rejectMutations(executionId: string, reason: string): Promise<void> {
    this.pendingSessions.delete(executionId);

    await automationExecutionTracker.rejectExecution(executionId, {
      rejectedBy: 'trinity-autonomous-scheduler',
      rejectionReason: reason,
    });

    log.info(`[TrinitySchedulingOrchestrator] Mutations rejected for execution ${executionId}: ${reason}`);
  }

  private async gatherSchedulingContext(
    workspaceId: string,
    weekStart: Date,
    weekEnd: Date
  ): Promise<SchedulingContext> {
    const [workspaceEmployees, workspaceClients, existingShifts] = await Promise.all([
      db.select().from(employees).where(
        and(
          eq(employees.workspaceId, workspaceId),
          eq(employees.isActive, true)
        )
      ),
      db.select().from(clients).where(eq(clients.workspaceId, workspaceId)),
      db.select().from(shifts).where(
        and(
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.startTime, weekStart),
          lte(shifts.endTime, weekEnd)
        )
      ).orderBy(asc(shifts.startTime)),
    ]);

    const openShifts = existingShifts.filter(s => !s.employeeId);

    return {
      workspaceId,
      weekStart,
      weekEnd,
      employees: workspaceEmployees,
      clients: workspaceClients,
      existingShifts,
      openShifts,
    };
  }

  private async proposeOptimizations(context: SchedulingContext, mutations: SchedulingMutation[], sessionId?: string): Promise<void> {
    log.info(`[TrinitySchedulingOrchestrator] Proposing optimizations for week of ${format(context.weekStart, 'MMM d')}`);
    
    const employeeWorkload: Map<string, number> = new Map();
    context.existingShifts.forEach(shift => {
      if (shift.employeeId) {
        const hours = differenceInHours(new Date(shift.endTime), new Date(shift.startTime));
        employeeWorkload.set(shift.employeeId, (employeeWorkload.get(shift.employeeId) || 0) + hours);
      }
    });

    const overworkedEmployees = Array.from(employeeWorkload.entries())
      .filter(([_, hours]) => hours > 40)
      .sort((a, b) => b[1] - a[1]);

    const underworkedEmployees = context.employees
      .filter(e => (employeeWorkload.get(e.id) || 0) < 20);

    const totalToProcess = overworkedEmployees.slice(0, 3).length;
    let processedCount = 0;

    for (const [overworkedId, totalHours] of overworkedEmployees.slice(0, 3)) {
      processedCount++;
      const overworkedShifts = context.existingShifts
        .filter(s => s.employeeId === overworkedId)
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

      const overworkedEmp = context.employees.find(e => e.id === overworkedId);

      // Emit progress event for optimization analysis (internal .on() listeners in websocket.ts)
      platformEventBus.emit('trinity_scheduling_progress', {
        workspaceId: context.workspaceId,
        metadata: {
          sessionId,
          currentShiftId: overworkedShifts[0]?.id,
          currentIndex: processedCount,
          totalShifts: totalToProcess,
          status: 'analyzing',
          message: `Analyzing workload for ${overworkedEmp?.firstName || 'Employee'} (${totalHours}h/week)...`,
        },
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      if (overworkedShifts.length > 0 && underworkedEmployees.length > 0) {
        const shiftToReassign = overworkedShifts[0];
        const targetEmployee = underworkedEmployees.find(e => e.id !== overworkedId);

        if (targetEmployee) {
          mutations.push({
            id: `mut-${Date.now()}-${crypto.randomUUID().slice(0, 5)}`,
            type: 'swap_employees',
            description: `Reassign shift from ${overworkedEmp?.firstName} ${overworkedEmp?.lastName} to ${targetEmployee.firstName} ${targetEmployee.lastName} to balance workload`,
            beforeState: { employeeId: overworkedId, employeeName: `${overworkedEmp?.firstName} ${overworkedEmp?.lastName}` },
            afterState: { employeeId: targetEmployee.id, employeeName: `${targetEmployee.firstName} ${targetEmployee.lastName}` },
            employeeId: targetEmployee.id,
            employeeName: `${targetEmployee.firstName} ${targetEmployee.lastName}`,
            shiftId: shiftToReassign.id,
            startTime: new Date(shiftToReassign.startTime),
            endTime: new Date(shiftToReassign.endTime),
            estimatedHours: differenceInHours(new Date(shiftToReassign.endTime), new Date(shiftToReassign.startTime)),
            reason: `${overworkedEmp?.firstName} at ${totalHours}h/week (overworked). ${targetEmployee.firstName} at ${employeeWorkload.get(targetEmployee.id) || 0}h/week (underutilized).`,
            dbOperation: {
              table: 'shifts',
              action: 'update',
              data: { employeeId: targetEmployee.id },
              where: { id: shiftToReassign.id },
            },
          });

          // Emit progress event for swap (internal .on() listeners in websocket.ts)
          platformEventBus.emit('trinity_scheduling_progress', {
            workspaceId: context.workspaceId,
            metadata: {
              sessionId,
              currentShiftId: shiftToReassign.id,
              currentIndex: processedCount,
              totalShifts: totalToProcess,
              status: 'assigned',
              message: `Reassigning to ${targetEmployee.firstName} ${targetEmployee.lastName}`,
              assignedEmployeeId: targetEmployee.id,
              assignedEmployeeName: `${targetEmployee.firstName} ${targetEmployee.lastName}`,
            },
          });
        }
      }
    }
  }

  private async proposeOpenShiftFills(context: SchedulingContext, mutations: SchedulingMutation[], sessionId?: string): Promise<void> {
    log.info(`[TrinitySchedulingOrchestrator] Proposing fills for ${context.openShifts.length} open shifts`);

    const employeeWorkload: Map<string, number> = new Map();
    context.existingShifts.forEach(shift => {
      if (shift.employeeId) {
        const hours = differenceInHours(new Date(shift.endTime), new Date(shift.startTime));
        employeeWorkload.set(shift.employeeId, (employeeWorkload.get(shift.employeeId) || 0) + hours);
      }
    });

    const totalShifts = context.openShifts.length;

    for (let index = 0; index < context.openShifts.length; index++) {
      const openShift = context.openShifts[index];
      const client = context.clients.find(c => c.id === openShift.clientId);
      const shiftHours = differenceInHours(new Date(openShift.endTime), new Date(openShift.startTime));
      
      // Emit progress event - analyzing this shift (internal .on() listeners in websocket.ts)
      platformEventBus.emit('trinity_scheduling_progress', {
        workspaceId: context.workspaceId,
        metadata: {
          sessionId,
          currentShiftId: openShift.id,
          currentIndex: index + 1,
          totalShifts,
          status: 'analyzing',
          message: `Analyzing shift at ${client?.companyName || 'Unknown Location'}...`,
        },
      });

      // Add small delay for visual feedback (50ms per shift)
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const availableEmployees = context.employees
        .filter(e => {
          const currentHours = employeeWorkload.get(e.id) || 0;
          const isContractor = e.is1099Eligible === true;
          const weeklyHoursCap = isContractor ? 60 : 40;
          return currentHours + shiftHours <= weeklyHoursCap;
        })
        .sort((a, b) => (employeeWorkload.get(a.id) || 0) - (employeeWorkload.get(b.id) || 0));

      if (availableEmployees.length > 0) {
        const selectedEmployee = availableEmployees[0];
        
        employeeWorkload.set(
          selectedEmployee.id, 
          (employeeWorkload.get(selectedEmployee.id) || 0) + shiftHours
        );

        mutations.push({
          id: `mut-${Date.now()}-${crypto.randomUUID().slice(0, 5)}`,
          type: 'fill_open_shift',
          description: `Assign ${selectedEmployee.firstName} ${selectedEmployee.lastName} to open shift at ${client?.companyName || 'Unknown Client'}`,
          afterState: { employeeId: selectedEmployee.id },
          employeeId: selectedEmployee.id,
          employeeName: `${selectedEmployee.firstName} ${selectedEmployee.lastName}`,
          shiftId: openShift.id,
          clientId: openShift.clientId,
          clientName: client?.companyName,
          startTime: new Date(openShift.startTime),
          endTime: new Date(openShift.endTime),
          estimatedHours: shiftHours,
          estimatedCost: shiftHours * (selectedEmployee.hourlyRate || (selectedEmployee as any).payRate || 15),
          reason: `${selectedEmployee.firstName} has lowest workload at ${(employeeWorkload.get(selectedEmployee.id) || 0) - shiftHours}h/week`,
          dbOperation: {
            table: 'shifts',
            action: 'update',
            data: { employeeId: selectedEmployee.id },
            where: { id: openShift.id },
          },
        });

        // Emit progress event - shift assigned (internal .on() listeners in websocket.ts)
        platformEventBus.emit('trinity_scheduling_progress', {
          workspaceId: context.workspaceId,
          metadata: {
            sessionId,
            currentShiftId: openShift.id,
            currentIndex: index + 1,
            totalShifts,
            status: 'assigned',
            message: `Assigned ${selectedEmployee.firstName} ${selectedEmployee.lastName}`,
            assignedEmployeeId: selectedEmployee.id,
            assignedEmployeeName: `${selectedEmployee.firstName} ${selectedEmployee.lastName}`,
          },
        });
      } else {
        // Emit progress event - shift skipped (internal .on() listeners in websocket.ts)
        platformEventBus.emit('trinity_scheduling_progress', {
          workspaceId: context.workspaceId,
          metadata: {
            sessionId,
            currentShiftId: openShift.id,
            currentIndex: index + 1,
            totalShifts,
            status: 'skipped',
            message: `No available employees for shift at ${client?.companyName || 'Unknown Location'}`,
          },
        });
      }
    }
  }

  private async proposeFullSchedule(context: SchedulingContext, mutations: SchedulingMutation[], sessionId?: string): Promise<void> {
    log.info(`[TrinitySchedulingOrchestrator] Proposing full schedule for week of ${format(context.weekStart, 'MMM d')}`);

    await this.proposeOpenShiftFills(context, mutations, sessionId);
    await this.proposeOptimizations(context, mutations, sessionId);

    for (const client of context.clients.slice(0, 3)) {
      const clientShifts = context.existingShifts.filter(s => s.clientId === client.id);
      
      if (clientShifts.length === 0) {
        for (let dayOffset = 1; dayOffset <= 5; dayOffset++) {
          const shiftDate = addDays(context.weekStart, dayOffset);
          const startTime = new Date(shiftDate);
          startTime.setHours(9, 0, 0, 0);
          const endTime = new Date(shiftDate);
          endTime.setHours(17, 0, 0, 0);

          const availableEmployee = context.employees.find(e => {
            const existing = context.existingShifts.some(s => 
              s.employeeId === e.id && 
              new Date(s.startTime).toDateString() === shiftDate.toDateString()
            );
            return !existing;
          });

          if (availableEmployee) {
            const newShiftId = `shift-${Date.now()}-${crypto.randomUUID().slice(0, 5)}`;
            
            mutations.push({
              id: `mut-${Date.now()}-${crypto.randomUUID().slice(0, 5)}`,
              type: 'create_shift',
              description: `Create new shift for ${availableEmployee.firstName} ${availableEmployee.lastName} at ${client.companyName}`,
              afterState: { shiftId: newShiftId, employeeId: availableEmployee.id },
              employeeId: availableEmployee.id,
              employeeName: `${availableEmployee.firstName} ${availableEmployee.lastName}`,
              shiftId: newShiftId,
              clientId: client.id,
              clientName: client.companyName,
              startTime,
              endTime,
              estimatedHours: 8,
              estimatedCost: 8 * (availableEmployee.hourlyRate || (availableEmployee as any).payRate || 15),
              reason: `Client ${client.companyName} has no coverage for ${format(shiftDate, 'EEEE')}`,
              dbOperation: {
                table: 'shifts',
                action: 'insert',
                data: {
                  id: newShiftId,
                  workspaceId: context.workspaceId,
                  employeeId: availableEmployee.id,
                  clientId: client.id,
                  title: `${client.companyName} - Standard Shift`,
                  startTime: startTime.toISOString(),
                  endTime: endTime.toISOString(),
                  status: 'scheduled',
                },
              },
            });

            context.existingShifts.push({
              id: newShiftId,
              employeeId: availableEmployee.id,
              startTime,
              endTime,
              clientId: client.id,
            });
          }
        }
      }
    }
  }

  private calculateSummary(mutations: SchedulingMutation[]): SchedulingSessionResult['summary'] {
    let totalHours = 0;
    let totalCost = 0;

    mutations.forEach(m => {
      totalHours += m.estimatedHours || 0;
      totalCost += m.estimatedCost || 0;
    });

    return {
      shiftsCreated: mutations.filter(m => m.type === 'create_shift').length,
      shiftsEdited: mutations.filter(m => m.type === 'edit_shift').length,
      shiftsDeleted: mutations.filter(m => m.type === 'delete_shift').length,
      employeesSwapped: mutations.filter(m => m.type === 'swap_employees').length,
      openShiftsFilled: mutations.filter(m => m.type === 'fill_open_shift').length,
      totalHoursScheduled: totalHours,
      estimatedLaborCost: totalCost,
    };
  }

  private async generateAISummary(
    workspaceId: string,
    mutations: SchedulingMutation[],
    summary: SchedulingSessionResult['summary']
  ): Promise<string> {
    if (mutations.length === 0) {
      return "I reviewed the schedule and everything looks good - no changes needed this time.";
    }

    try {
      const prompt = `Generate a brief, friendly 2-3 sentence summary of what is PROPOSED to optimize a work schedule. These changes are NOT yet applied - they require user approval.
      
      Proposed changes:
      - ${summary.shiftsCreated} new shifts to create
      - ${summary.openShiftsFilled} open shifts to fill
      - ${summary.employeesSwapped} employee reassignments
      - ${summary.shiftsEdited} shifts to modify
      - ${summary.shiftsDeleted} shifts to remove
      - Total: ${summary.totalHoursScheduled.toFixed(1)} hours would be scheduled
      - Estimated cost: $${summary.estimatedLaborCost.toFixed(2)}
      
      Key proposed changes:
      ${mutations.slice(0, 5).map(m => `- ${m.description}`).join('\n')}
      
      Write as Trinity AI assistant speaking to the business owner. Be conversational and professional. Start with "I" not "Trinity". Mention that these changes need approval before being applied.`;

      const result = await geminiClient.generateContent({ // withGemini
        prompt,
        workspaceId,
        purpose: 'scheduling_summary',
      });

      return result.text || "I've proposed some schedule optimizations. Please review and approve the changes above.";
    } catch (error) {
      log.error('[TrinitySchedulingOrchestrator] Failed to generate AI summary:', error);
      return `I'm proposing ${mutations.length} schedule changes: ${summary.shiftsCreated} new shifts, ${summary.openShiftsFilled} gaps filled, ${summary.employeesSwapped} reassignments. Please review and approve these changes.`;
    }
  }

  async getSessionStatus(sessionId: string): Promise<{
    isActive: boolean;
    currentSessionId: string | null;
  }> {
    return {
      isActive: this.activeSessionId === sessionId,
      currentSessionId: this.activeSessionId,
    };
  }
}

export const trinitySchedulingOrchestrator = new TrinitySchedulingOrchestratorService();
