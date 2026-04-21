/**
 * Automation Trigger Service
 * 
 * Links integration connections to automatic platform operations:
 * - Schedule generation after employee import
 * - Invoice creation from time entries synced via QuickBooks
 * - Payroll processing automation
 * 
 * Uses event-driven architecture to trigger automation workflows
 * within Trinity's orchestration framework with 99% automation / 1% oversight
 */

import { db } from '../../db';
import { platformEventBus, PlatformEvent } from '../platformEventBus';
import { createLogger } from '../../lib/logger';
const log = createLogger('automationTriggerService');
import { helpaiOrchestrator } from '../helpai/platformActionHub';
import { approvalGateEnforcementService } from './approvalGateEnforcement';
import { employees, workspaces, timeEntries, invoices, payrollEntries, automationTriggers, thalamiclogs } from '@shared/schema';
import { eq, and, isNull, sql, inArray, isNotNull } from 'drizzle-orm';
import { generateWeeklyInvoices, processDelinquentInvoices } from '../billingAutomation';
import { runOverdueCollectionsSweep } from '../billing/overdueCollectionsService';
import { autonomousSchedulingDaemon } from '../scheduling/autonomousSchedulingDaemon';
import { orchestratedPayroll } from './orchestratedBusinessOps';
import { platformBillService } from '../billing/platformBillService';
import { withDistributedLock, LOCK_KEYS } from '../distributedLock';
import { typedExec, typedQuery } from '../../lib/typedSql';
import { publishEvent } from './pipelineErrorHandler';

// ── payroll_run_paid employee-notification dedup guard ─────────────────────
// payroll_run_paid fires from two independent paths for the same run:
//   1. payrollAutomation.runAutomatedPayouts() — marks run paid after processing
//   2. stripeConnectPayoutService — fires after each Stripe Connect payout settles
// Without this guard, employees receive two "Paycheck Disbursed" notifications.
// 90-second window matches the Trinity-side guard in trinityEventSubscriptions.ts.
const _recentlyNotifiedPayrollRuns = new Map<string, number>();
function _isPayrollRunAlreadyNotified(runId: string): boolean {
  const now = Date.now();
  const last = _recentlyNotifiedPayrollRuns.get(runId);
  if (last && now - last < 90_000) return true; // 90s dedup window
  _recentlyNotifiedPayrollRuns.set(runId, now);
  // Evict entries older than 5 minutes
  for (const [k, t] of _recentlyNotifiedPayrollRuns) {
    if (now - t > 300_000) _recentlyNotifiedPayrollRuns.delete(k);
  }
  return false;
}

export type AutomationType = 
  | 'schedule_generation'
  | 'invoice_creation'
  | 'payroll_processing'
  | 'employee_sync'
  | 'client_sync'
  | 'time_entry_sync';

export type TriggerType =
  | 'integration_connected'
  | 'data_sync_complete'
  | 'employee_import_complete'
  | 'schedule_published'
  | 'time_entries_approved'
  | 'week_end'
  | 'month_end';

export interface AutomationTrigger {
  id: string;
  workspaceId: string;
  automationType: AutomationType;
  triggerType: TriggerType;
  enabled: boolean;
  lastTriggeredAt?: Date;
  lastResultStatus?: 'success' | 'failed' | 'pending_approval';
  config: {
    autoApprove: boolean;
    thresholdAmount?: number;
    requiresApprovalAbove?: number;
    notifyOnComplete: boolean;
    schedulePattern?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface TriggerExecutionResult {
  triggerId: string;
  automationType: AutomationType;
  success: boolean;
  requiresApproval: boolean;
  approvalGateId?: string;
  executedActions: string[];
  errors: string[];
  affectedRecords: number;
  durationMs: number;
}

class AutomationTriggerService {
  private triggers = new Map<string, AutomationTrigger>();
  private executionHistory: TriggerExecutionResult[] = [];
  // GAP-A FIX: Track payroll approval gates so we can execute payroll when manager approves
  private pendingPayrollGates = new Map<string, { workspaceId: string; triggerId: string }>();
  // GAP-D FIX: Track schedule approval gates so we can run the daemon after manager approves
  private pendingScheduleGates = new Map<string, { workspaceId: string; triggerId: string }>();

  constructor() {
    this.subscribeToEvents();
    this.registerActions();
    this.hydrateTriggers().catch(err => log.error('[AutomationTriggerService] Hydration failed:', err));
  }

  private async hydrateTriggers() {
    await this.loadTriggers();
  }

  private subscribeToEvents() {
    platformEventBus.subscribe('quickbooks_connected', { name: 'AutomationTrigger-QBConnected', handler: async (event) => {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await this.handleIntegrationConnected(event.workspaceId, 'quickbooks');
    }});

    platformEventBus.subscribe('quickbooks_flow_complete', { name: 'AutomationTrigger-QBFlowComplete', handler: async (event) => {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await this.handleDataSyncComplete(event.workspaceId, event.payload);
    }});

    platformEventBus.subscribe('employees_imported', { name: 'AutomationTrigger-EmployeesImported', handler: async (event) => {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await this.handleEmployeeImportComplete(event.workspaceId, event.payload);
    }});

    platformEventBus.subscribe('schedule_published', { name: 'AutomationTrigger-SchedulePublished', handler: async (event) => {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await this.handleSchedulePublished(event.workspaceId, event.payload);
    }});

    platformEventBus.subscribe('time_entries_approved', { name: 'AutomationTrigger-TimeEntriesApproved', handler: async (event) => {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await this.handleTimeEntriesApproved(event.workspaceId, event.payload);
    }});

    // ── Financial lifecycle automation triggers ──────────────────────────────
    // invoice_paid → AR close-out: confirm invoice is marked paid in DB
    platformEventBus.subscribe('invoice_paid', { name: 'AutomationTrigger-InvoicePaid', handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      const invoiceId = metadata?.invoiceId;
      log.info(`[AutomationTrigger] invoice_paid — invoiceId=${invoiceId}, total=${metadata?.total}`);
      if (!invoiceId) return;
      // Confirm invoice status is 'paid' in DB — closes AR cycle.
      // Guard also excludes 'refunded': if a refund was already processed the invoice
      // must remain in 'refunded' state. Forcing it back to 'paid' would erase the
      // refund record and cause the org ledger to overstate revenue.
      await db.update(invoices)
        .set({ status: 'paid', updatedAt: new Date() } as any)
        .where(and(eq(invoices.id, invoiceId), sql`${invoices.status} NOT IN ('void', 'cancelled', 'refunded')`))
        .catch((e: any) => log.warn('[AutomationTrigger] invoice_paid DB update skipped:', e?.message));
      log.info(`[AutomationTrigger] invoice_paid — AR close-out complete for invoice ${invoiceId}`);
    }});

    // payroll_run_paid → notify each employee individually that their paycheck was disbursed
    platformEventBus.subscribe('payroll_run_paid', { name: 'AutomationTrigger-PayrollRunPaid', handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      const payrollRunId = metadata?.payrollRunId;
      log.info(`[AutomationTrigger] payroll_run_paid — runId=${payrollRunId}, disbursementMethod=${metadata?.disbursementMethod}`);
      if (!payrollRunId) return;
      // Dedup: event fires from both runAutomatedPayouts AND stripeConnectPayoutService for the same run.
      // Guard prevents employees receiving two "Paycheck Disbursed" notifications.
      if (_isPayrollRunAlreadyNotified(payrollRunId)) {
        log.info(`[AutomationTrigger] payroll_run_paid — dedup suppressed employee notifications for run ${payrollRunId} (already notified)`);
        return;
      }
      try {
        const { createNotification } = await import('../notificationService');
        const entries = await db.select({
          employeeId: payrollEntries.employeeId,
          netPay:     payrollEntries.netPay,
          grossPay:   payrollEntries.grossPay,
        }).from(payrollEntries)
          .where(eq(payrollEntries.payrollRunId, payrollRunId))
          .catch(() => []);

        let notified = 0;
        for (const entry of entries) {
          const empRow = await db.select({ userId: employees.userId })
            .from(employees)
            .where(eq(employees.id, entry.employeeId))
            .limit(1)
            .catch(() => []);
          const userId = empRow[0]?.userId;
          if (!userId) continue;
          const net   = parseFloat(String(entry.netPay  || 0));
          const gross = parseFloat(String(entry.grossPay || 0));
          await createNotification({
            workspaceId,
            userId,
            type:     'payroll_disbursed',
            title:    'Your Paycheck Has Been Disbursed',
            message:  `Your paycheck has been released. Gross: $${gross.toFixed(2)} | Net (after taxes & deductions): $${net.toFixed(2)}. Check your bank account or pay stub for details.`,
            priority: 'normal',
            actionUrl: '/payroll',
          } as any).catch(() => null);
          notified++;
        }
        log.info(`[AutomationTrigger] payroll_run_paid — notified ${notified}/${entries.length} employee(s)`);
      } catch (e: any) {
        log.warn('[AutomationTrigger] payroll_run_paid employee notification error:', e?.message);
      }
    }});

    // invoice_overdue → update invoice status + trigger automated collections sweep
    platformEventBus.subscribe('invoice_overdue', { name: 'AutomationTrigger-InvoiceOverdue', handler: async (event) => {
      const { workspaceId, metadata } = event;
      if (!workspaceId) return;
      const invoiceId = metadata?.invoiceId;
      log.info(`[AutomationTrigger] invoice_overdue — invoiceId=${invoiceId}, daysOverdue=${metadata?.daysOverdue}`);
      if (!invoiceId) return;
      // Mark invoice status 'overdue' in DB (skip if already paid/void/cancelled)
      await db.update(invoices)
        .set({ status: 'overdue', updatedAt: new Date() } as any)
        .where(and(eq(invoices.id, invoiceId), sql`${invoices.status} NOT IN ('paid', 'void', 'cancelled')`))
        .catch((e: any) => log.warn('[AutomationTrigger] invoice_overdue status update skipped:', e?.message));
      // Trigger the automated collections sweep for this workspace
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await runOverdueCollectionsSweep(workspaceId)
        .catch((e: any) => log.warn('[AutomationTrigger] invoice_overdue collections sweep error:', e?.message));
      log.info(`[AutomationTrigger] invoice_overdue — status updated + collections sweep triggered for ${workspaceId}`);
    }});

    platformEventBus.subscribe('employee_onboarding_completed', {
      name: 'AutomationTrigger-OnboardingComplete',
      handler: async (event) => {
        const workspaceId = event.workspaceId || event.payload?.workspaceId || event.metadata?.workspaceId;
        const employeeId = event.payload?.employeeId || event.metadata?.employeeId;
        const employeeName = event.payload?.employeeName || event.metadata?.employeeName || 'Employee';
        if (!workspaceId || !employeeId) return;

        await db.update(employees)
          .set({
            onboardingStatus: 'completed',
            updatedAt: new Date(),
          } as any)
          .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)));

        const managers = await db.select({
          userId: employees.userId,
        })
          .from(employees)
          .where(and(
            eq(employees.workspaceId, workspaceId),
            inArray(employees.workspaceRole, ['org_owner', 'co_owner', 'org_admin', 'manager', 'department_manager'] as any),
            isNotNull(employees.userId),
          ));

        const { createNotification } = await import('../notificationService');
        for (const mgr of managers) {
          if (!mgr.userId) continue;
          await createNotification({
            userId: mgr.userId,
            workspaceId,
            type: 'system',
            title: `${employeeName} completed onboarding`,
            message: 'They are now eligible to be scheduled. Trinity will include them in auto-scheduling.',
            actionUrl: `/employees/${employeeId}`,
          } as any).catch(() => null);
        }

        await db.insert(thalamiclogs).values({
          signalId: `employee-ready-${employeeId}-${Date.now()}`,
          signalType: 'employee_ready',
          workspaceId,
          priorityScore: 70,
          source: 'automation_trigger_service',
          sourceTrustTier: 'workspace',
          signalPayload: { employeeId, employeeName, readyAt: new Date().toISOString() },
        } as any);
      },
    });

    // GAP-A FIX: When a manager approves a payroll gate, actually execute payroll generation
    // GAP-D FIX: Also route schedule gate approvals to daemon execution
    // SEMANTIC FIX: approvalGateEnforcement publishes 'approval_granted' (gate approvals),
    // while approvalResumeOrchestrator publishes 'approval_approved' (AI resume-approvals).
    // Both must unblock pending payroll/schedule gates — shared handler subscribed to both.
    const gateUnblockHandler = async (event: PlatformEvent) => {
      const gateId = event.metadata?.approvalId || event.payload?.gateId || event.payload?.approvalId;
      if (!gateId) return;

      if (this.pendingPayrollGates.has(gateId)) {
        const { workspaceId, triggerId } = this.pendingPayrollGates.get(gateId)!;
        this.pendingPayrollGates.delete(gateId);
        await this.executeApprovedPayroll(workspaceId, triggerId);
        return;
      }

      if (this.pendingScheduleGates.has(gateId)) {
        const { workspaceId } = this.pendingScheduleGates.get(gateId)!;
        this.pendingScheduleGates.delete(gateId);
        await this.executeApprovedScheduleGeneration(workspaceId);
      }
    };
    // approval_approved — AI/resume pipeline (approvalResumeOrchestrator)
    platformEventBus.subscribe('approval_approved', { name: 'AutomationTrigger-GateApproved', handler: gateUnblockHandler });
    // approval_granted — human approval gates (approvalGateEnforcement.approve())
    platformEventBus.subscribe('approval_granted', { name: 'AutomationTrigger-GateGrantedUnblock', handler: gateUnblockHandler });
  }

  private registerActions() {
    helpaiOrchestrator.registerAction({
      actionId: 'automation_trigger.configure',
      name: 'Configure Automation Trigger',
      category: 'automation',
      description: 'Configure automation triggers for a workspace',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string', description: 'Workspace ID' },
          automationType: { type: 'string', description: 'Type of automation' },
          triggerType: { type: 'string', description: 'Type of trigger' },
          enabled: { type: 'boolean', description: 'Enable or disable' },
          autoApprove: { type: 'boolean', description: 'Auto-approve low-risk actions' },
          thresholdAmount: { type: 'number', description: 'Threshold for auto-approval' },
        },
        required: ['workspaceId', 'automationType', 'triggerType'],
      },
      // @ts-expect-error — TS migration: fix in refactoring sprint
      handler: async (params) => {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return await this.configureTrigger(params);
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'automation_trigger.list',
      name: 'List Automation Triggers',
      category: 'automation',
      description: 'List all automation triggers for a workspace',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string', description: 'Workspace ID' },
        },
        required: ['workspaceId'],
      },
      // @ts-expect-error — TS migration: fix in refactoring sprint
      handler: async (params) => {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return this.getWorkspaceTriggers(params.workspaceId);
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'automation_trigger.execute',
      name: 'Execute Automation Trigger',
      category: 'automation',
      description: 'Manually execute an automation trigger',
      parameters: {
        type: 'object',
        properties: {
          triggerId: { type: 'string', description: 'Trigger ID' },
          force: { type: 'boolean', description: 'Force execution bypassing cooldowns' },
        },
        required: ['triggerId'],
      },
      // @ts-expect-error — TS migration: fix in refactoring sprint
      handler: async (params) => {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return await this.executeTrigger(params.triggerId, (params as any).force);
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'automation_trigger.get_history',
      name: 'Get Trigger Execution History',
      category: 'automation',
      description: 'Get execution history for automation triggers',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string', description: 'Workspace ID (optional)' },
          limit: { type: 'number', description: 'Number of records to return' },
        },
      },
      // @ts-expect-error — TS migration: fix in refactoring sprint
      handler: async (params) => {
        return this.getExecutionHistory(params.workspaceId, (params as any).limit || 50);
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'automation_trigger.toggle',
      name: 'Toggle Automation Trigger',
      category: 'automation',
      description: 'Enable or disable an automation trigger',
      parameters: {
        type: 'object',
        properties: {
          triggerId: { type: 'string', description: 'Trigger ID' },
          enabled: { type: 'boolean', description: 'Enable or disable' },
        },
        required: ['triggerId', 'enabled'],
      },
      // @ts-expect-error — TS migration: fix in refactoring sprint
      handler: async (params) => {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const trigger = this.triggers.get(params.triggerId);
        if (!trigger) {
          return { success: false, message: 'Trigger not found' };
        }
        trigger.enabled = (params as any).enabled;
        trigger.updatedAt = new Date();
        await this.persistTrigger(trigger);
        return { success: true, trigger };
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'automation_trigger.get_stats',
      name: 'Get Automation Statistics',
      category: 'automation',
      description: 'Get aggregated statistics for automation triggers',
      parameters: {
        type: 'object',
        properties: {},
      },
      // @ts-expect-error — TS migration: fix in refactoring sprint
      handler: async () => {
        return this.getStats();
      },
    });

    log.info('[AutomationTriggerService] Registered 6 AI Brain actions');
  }

  async configureTrigger(params: {
    workspaceId: string;
    automationType: AutomationType;
    triggerType: TriggerType;
    enabled?: boolean;
    autoApprove?: boolean;
    thresholdAmount?: number;
    notifyOnComplete?: boolean;
  }): Promise<AutomationTrigger> {
    const triggerId = `trigger-${params.workspaceId}-${params.automationType}-${params.triggerType}`;
    
    const existingTrigger = this.triggers.get(triggerId);
    
    const trigger: AutomationTrigger = {
      id: triggerId,
      workspaceId: params.workspaceId,
      automationType: params.automationType,
      triggerType: params.triggerType,
      enabled: params.enabled ?? true,
      config: {
        autoApprove: params.autoApprove ?? true,
        thresholdAmount: params.thresholdAmount,
        requiresApprovalAbove: params.thresholdAmount ? params.thresholdAmount * 10 : undefined,
        notifyOnComplete: params.notifyOnComplete ?? true,
      },
      createdAt: existingTrigger?.createdAt || new Date(),
      updatedAt: new Date(),
    };

    this.triggers.set(triggerId, trigger);
    await this.persistTrigger(trigger);

    return trigger;
  }

  getWorkspaceTriggers(workspaceId: string): AutomationTrigger[] {
    const triggers: AutomationTrigger[] = [];
    for (const trigger of this.triggers.values()) {
      if (trigger.workspaceId === workspaceId) {
        triggers.push(trigger);
      }
    }
    return triggers;
  }

  async executeTrigger(triggerId: string, force: boolean = false): Promise<TriggerExecutionResult> {
    const startTime = Date.now();
    const trigger = this.triggers.get(triggerId);

    if (!trigger) {
      return {
        triggerId,
        automationType: 'schedule_generation',
        success: false,
        requiresApproval: false,
        executedActions: [],
        errors: ['Trigger not found'],
        affectedRecords: 0,
        durationMs: Date.now() - startTime,
      };
    }

    if (!trigger.enabled && !force) {
      return {
        triggerId,
        automationType: trigger.automationType,
        success: false,
        requiresApproval: false,
        executedActions: [],
        errors: ['Trigger is disabled'],
        affectedRecords: 0,
        durationMs: Date.now() - startTime,
      };
    }

    let result: TriggerExecutionResult;

    switch (trigger.automationType) {
      case 'schedule_generation':
        result = await this.executeScheduleGeneration(trigger);
        break;
      case 'invoice_creation':
        result = await this.executeInvoiceCreation(trigger);
        break;
      case 'payroll_processing':
        result = await this.executePayrollProcessing(trigger);
        break;
      case 'employee_sync':
        // @ts-expect-error — TS migration: fix in refactoring sprint
        result = {
          triggerId,
          automationType: trigger.automationType,
          success: true,
          requiresApproval: false,
          executedActions: ['employee_sync.acknowledged'],
          affectedRecords: 0,
          durationMs: Date.now() - startTime,
        };
        log.info(`[AutomationTriggerService] employee_sync trigger acknowledged for workspace ${trigger.workspaceId} — sync is handled by the HRIS integration service`);
        break;
      case 'client_sync':
        // @ts-expect-error — TS migration: fix in refactoring sprint
        result = {
          triggerId,
          automationType: trigger.automationType,
          success: true,
          requiresApproval: false,
          executedActions: ['client_sync.acknowledged'],
          affectedRecords: 0,
          durationMs: Date.now() - startTime,
        };
        log.info(`[AutomationTriggerService] client_sync trigger acknowledged for workspace ${trigger.workspaceId} — sync is handled by the integration service`);
        break;
      case 'time_entry_sync':
        // @ts-expect-error — TS migration: fix in refactoring sprint
        result = {
          triggerId,
          automationType: trigger.automationType,
          success: true,
          requiresApproval: false,
          executedActions: ['time_entry_sync.acknowledged'],
          affectedRecords: 0,
          durationMs: Date.now() - startTime,
        };
        log.info(`[AutomationTriggerService] time_entry_sync trigger acknowledged for workspace ${trigger.workspaceId} — sync is handled by the integration service`);
        break;
      default:
        result = {
          triggerId,
          automationType: trigger.automationType,
          success: false,
          requiresApproval: false,
          executedActions: [],
          errors: [`Unknown automation type: ${trigger.automationType}`],
          affectedRecords: 0,
          durationMs: Date.now() - startTime,
        };
    }

    trigger.lastTriggeredAt = new Date();
    trigger.lastResultStatus = result.requiresApproval ? 'pending_approval' : (result.success ? 'success' : 'failed');
    trigger.updatedAt = new Date();
    await this.persistTrigger(trigger);

    this.executionHistory.unshift(result);
    if (this.executionHistory.length > 1000) {
      this.executionHistory = this.executionHistory.slice(0, 1000);
    }

    return result;
  }

  private async executeScheduleGeneration(trigger: AutomationTrigger): Promise<TriggerExecutionResult> {
    const startTime = Date.now();
    const executedActions: string[] = [];
    const errors: string[] = [];

    try {
      const workspaceEmployees = await db.select()
        .from(employees)
        .where(and(
          eq(employees.workspaceId, trigger.workspaceId),
          eq(employees.isActive, true)
        ));

      if (workspaceEmployees.length === 0) {
        return {
          triggerId: trigger.id,
          automationType: 'schedule_generation',
          success: false,
          requiresApproval: false,
          executedActions: [],
          errors: ['No active employees to schedule'],
          affectedRecords: 0,
          durationMs: Date.now() - startTime,
        };
      }

      const needsApproval = workspaceEmployees.length > 50 || !trigger.config.autoApprove;

      if (needsApproval) {
        const approvalResult = await approvalGateEnforcementService.requestApproval({
          workspaceId: trigger.workspaceId,
          category: 'scheduling',
          actionId: 'generate_schedule',
          actionName: 'Generate Schedule',
          requestedBy: 'automation_system',
          payload: { employeeCount: workspaceEmployees.length, triggerId: trigger.id },
          impactSummary: `Auto-generate schedule for ${workspaceEmployees.length} employees`,
        });

        // GAP-D FIX: Register the gate so approval_approved can execute the daemon
        if (approvalResult.gateId) {
          this.pendingScheduleGates.set(approvalResult.gateId, {
            workspaceId: trigger.workspaceId,
            triggerId: trigger.id,
          });
          log.info(`[AutomationTriggerService] Schedule approval gate registered: ${approvalResult.gateId} for workspace ${trigger.workspaceId}`);
        }

        return {
          triggerId: trigger.id,
          automationType: 'schedule_generation',
          success: true,
          requiresApproval: true,
          approvalGateId: approvalResult.gateId,
          executedActions: ['approval_requested'],
          errors: [],
          affectedRecords: 0,
          durationMs: Date.now() - startTime,
        };
      }

      // Actually run the scheduling daemon cycle for this workspace
      const daemonResult = await withDistributedLock(LOCK_KEYS.SHIFT_MONITORING, `Shift Monitoring - ${trigger.workspaceId}`, async () => {
        return await autonomousSchedulingDaemon.runCycle();
      });

      if (!daemonResult) {
        return {
          triggerId: trigger.id,
          automationType: 'schedule_generation',
          success: true,
          requiresApproval: false,
          executedActions: ['skipped_lock_held'],
          errors: [],
          affectedRecords: 0,
          durationMs: Date.now() - startTime,
        };
      }
      executedActions.push('schedule_generation_initiated');
      executedActions.push(`shifts_auto_filled:${daemonResult.shiftsAutoFilled}`);
      executedActions.push(`templates_applied:${daemonResult.templatesApplied}`);

      return {
        triggerId: trigger.id,
        automationType: 'schedule_generation',
        success: true,
        requiresApproval: false,
        executedActions,
        errors: [...errors, ...daemonResult.errors],
        affectedRecords: daemonResult.shiftsAutoFilled + daemonResult.templatesApplied,
        durationMs: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        triggerId: trigger.id,
        automationType: 'schedule_generation',
        success: false,
        requiresApproval: false,
        executedActions,
        errors: [(error instanceof Error ? error.message : String(error))],
        affectedRecords: 0,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async executeInvoiceCreation(trigger: AutomationTrigger): Promise<TriggerExecutionResult> {
    const startTime = Date.now();
    const executedActions: string[] = [];

    try {
      const needsApproval = !trigger.config.autoApprove;

      if (needsApproval) {
        const approvalResult = await approvalGateEnforcementService.requestApproval({
          workspaceId: trigger.workspaceId,
          category: 'invoicing',
          actionId: 'create_invoice_batch',
          actionName: 'Create Invoice Batch',
          requestedBy: 'automation_system',
          payload: { triggerId: trigger.id },
          impactSummary: 'Auto-create invoices from approved time entries',
        });

        return {
          triggerId: trigger.id,
          automationType: 'invoice_creation',
          success: true,
          requiresApproval: true,
          approvalGateId: approvalResult.gateId,
          executedActions: ['approval_requested'],
          errors: [],
          affectedRecords: 0,
          durationMs: Date.now() - startTime,
        };
      }

      // Actually run billing automation for this workspace
      const result = await generateWeeklyInvoices(trigger.workspaceId);
      executedActions.push('invoice_creation_initiated');
      executedActions.push(`invoices_generated:${result.invoicesGenerated}`);

      return {
        triggerId: trigger.id,
        automationType: 'invoice_creation',
        success: true,
        requiresApproval: false,
        executedActions,
        errors: result.skippedClients.map(s => `Skipped ${s.clientName}: ${s.reason}`),
        affectedRecords: result.invoicesGenerated,
        durationMs: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        triggerId: trigger.id,
        automationType: 'invoice_creation',
        success: false,
        requiresApproval: false,
        executedActions,
        errors: [(error instanceof Error ? error.message : String(error))],
        affectedRecords: 0,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async executePayrollProcessing(trigger: AutomationTrigger): Promise<TriggerExecutionResult> {
    const startTime = Date.now();
    const executedActions: string[] = [];

    try {
      const approvalResult = await approvalGateEnforcementService.requestApproval({
        workspaceId: trigger.workspaceId,
        category: 'payroll',
        actionId: 'process_payroll',
        actionName: 'Process Payroll Run',
        requestedBy: 'automation_system',
        payload: { triggerId: trigger.id, source: 'time_entries_approved' },
        impactSummary: 'Auto-process payroll from approved timesheets — approve to generate payroll run',
      });

      // GAP-A FIX: Register this gate so approval_approved can execute actual payroll
      if (approvalResult.gateId) {
        this.pendingPayrollGates.set(approvalResult.gateId, {
          workspaceId: trigger.workspaceId,
          triggerId: trigger.id,
        });
        log.info(`[AutomationTriggerService] Payroll approval gate registered: ${approvalResult.gateId} for workspace ${trigger.workspaceId}`);
      }

      return {
        triggerId: trigger.id,
        automationType: 'payroll_processing',
        success: true,
        requiresApproval: true,
        approvalGateId: approvalResult.gateId,
        executedActions: ['approval_requested'],
        errors: [],
        affectedRecords: 0,
        durationMs: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        triggerId: trigger.id,
        automationType: 'payroll_processing',
        success: false,
        requiresApproval: false,
        executedActions,
        errors: [(error instanceof Error ? error.message : String(error))],
        affectedRecords: 0,
        durationMs: Date.now() - startTime,
      };
    }
  }

  // GAP-D FIX: Execute scheduling daemon scoped to the approved workspace (not global runCycle)
  private async executeApprovedScheduleGeneration(workspaceId: string): Promise<void> {
    log.info(`[AutomationTriggerService] Executing approved schedule generation for workspace ${workspaceId}`);
    try {
      const result = await autonomousSchedulingDaemon.triggerManualRun(workspaceId, 'current_week');
      const totalAssigned: number = result.result?.summary?.totalAssigned ?? 0;
      log.info(`[AutomationTriggerService] Schedule generation completed for ${workspaceId}: ${totalAssigned} shifts assigned`);

      if (totalAssigned > 0) {
        await platformEventBus.publish({
          type: 'schedule_published',
          workspaceId,
          payload: { shiftsAutoFilled: totalAssigned, source: 'approved_schedule_gate', timestamp: new Date().toISOString() },
          metadata: { source: 'AutomationTriggerService.executeApprovedScheduleGeneration' },
        });
      }
    } catch (error: any) {
      log.error(`[AutomationTriggerService] Schedule generation failed for ${workspaceId}:`, (error instanceof Error ? error.message : String(error)));
    }
  }

  // GAP-A FIX: Actually execute payroll after manager approves the gate
  private async executeApprovedPayroll(workspaceId: string, triggerId: string): Promise<void> {
    log.info(`[AutomationTriggerService] Executing approved payroll for workspace ${workspaceId}`);
    try {
      const result = await orchestratedPayroll.processPayroll(workspaceId, 'automation_system');
      log.info(`[AutomationTriggerService] Payroll run completed for ${workspaceId}:`, {
        payrollRunId: result?.data?.payrollRunId,
        totalEmployees: result?.data?.totalEmployees,
        totalGrossPay: result?.data?.totalGrossPay,
      });
      publishEvent(
        () => platformEventBus.publish({
          type: 'payroll_run_created',
          workspaceId,
          payload: {
            payrollRunId: result?.data?.payrollRunId,
            totalEmployees: result?.data?.totalEmployees,
            totalGrossPay: result?.data?.totalGrossPay,
            source: 'trinity_automation',
          },
          metadata: { source: 'AutomationTriggerService', triggerId },
        }),
        '[AutomationTriggerService] event publish',
      );
    } catch (error: any) {
      log.error(`[AutomationTriggerService] Payroll execution failed for ${workspaceId}:`, (error instanceof Error ? error.message : String(error)));
    }
  }

  private async handleIntegrationConnected(workspaceId: string, provider: string): Promise<void> {
    log.info(`[AutomationTriggerService] Integration connected: ${provider} for workspace ${workspaceId}`);

    await this.configureTrigger({
      workspaceId,
      automationType: 'employee_sync',
      triggerType: 'integration_connected',
      enabled: true,
      autoApprove: true,
    });

    await this.configureTrigger({
      workspaceId,
      automationType: 'schedule_generation',
      triggerType: 'employee_import_complete',
      enabled: true,
      autoApprove: true,
    });

    await this.configureTrigger({
      workspaceId,
      automationType: 'invoice_creation',
      triggerType: 'time_entries_approved',
      enabled: true,
      autoApprove: true,
    });

    publishEvent(
      () => platformEventBus.publish({
        type: 'automation_triggers_configured',
        workspaceId,
        payload: { provider, triggersCreated: 3 },
      }),
      '[AutomationTriggerService] event publish',
    );
  }

  private async handleDataSyncComplete(workspaceId: string, payload: any): Promise<void> {
    log.info(`[AutomationTriggerService] Data sync complete for workspace ${workspaceId}`);
    
    const trigger = this.findTrigger(workspaceId, 'employee_sync', 'data_sync_complete');
    if (trigger && trigger.enabled) {
      await this.executeTrigger(trigger.id);
    }
  }

  private async handleEmployeeImportComplete(workspaceId: string, payload: any): Promise<void> {
    log.info(`[AutomationTriggerService] Employee import complete for workspace ${workspaceId}`);
    
    const trigger = this.findTrigger(workspaceId, 'schedule_generation', 'employee_import_complete');
    if (trigger && trigger.enabled) {
      await this.executeTrigger(trigger.id);
    }
  }

  private async handleSchedulePublished(workspaceId: string, payload: any): Promise<void> {
    log.info(`[AutomationTriggerService] Schedule published for workspace ${workspaceId}`, payload);

    // GAP-C FIX: Ensure invoice + payroll triggers exist for this workspace
    // so the pipeline fires when time entries are approved later.
    await this.bootstrapWorkspaceTriggers(workspaceId);

    // Check for approved time entries that have not yet been billed or payrolled.
    // This handles the case where time entries were approved BEFORE the schedule
    // was published (e.g. manual approvals or carry-over from a prior period).
    try {
      const unbilledApproved = await db
        .select({ id: timeEntries.id })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.workspaceId, workspaceId),
            eq(timeEntries.status, 'approved'),
            isNull(timeEntries.invoiceId),
          )
        )
        .limit(1);

      if (unbilledApproved.length > 0) {
        log.info(`[AutomationTriggerService] Found unbilled approved time entries after schedule publish — firing invoice creation`);
        // Re-use handleTimeEntriesApproved to run invoice + payroll triggers
        await this.handleTimeEntriesApproved(workspaceId, {
          source: 'schedule_published_catch_up',
          scheduleId: payload?.scheduleId,
        });
      } else {
        log.info(`[AutomationTriggerService] No unbilled approved time entries — triggers are ready for next approval batch`);
      }
    } catch (error: any) {
      log.error(`[AutomationTriggerService] Error checking unbilled entries on schedule publish:`, (error instanceof Error ? error.message : String(error)));
    }
  }

  private async handleTimeEntriesApproved(workspaceId: string, payload: any): Promise<void> {
    log.info(`[AutomationTriggerService] Time entries approved for workspace ${workspaceId}`);
    
    // Trigger invoice creation automation — auto-create trigger if it was never configured
    // (e.g. workspaces that have not connected QuickBooks still need invoices generated)
    let invoiceTrigger = this.findTrigger(workspaceId, 'invoice_creation', 'time_entries_approved');
    if (!invoiceTrigger) {
      invoiceTrigger = await this.configureTrigger({
        workspaceId,
        automationType: 'invoice_creation',
        triggerType: 'time_entries_approved',
        enabled: true,
        autoApprove: true,
      });
    }
    if (invoiceTrigger && invoiceTrigger.enabled) {
      await this.executeTrigger(invoiceTrigger.id);
    }
    
    // Also trigger payroll processing automation (for employee payments)
    // Check if payroll trigger exists, if not create it
    let payrollTrigger = this.findTrigger(workspaceId, 'payroll_processing', 'time_entries_approved');
    if (!payrollTrigger) {
      // Auto-create payroll trigger when time entries are approved
      payrollTrigger = await this.configureTrigger({
        workspaceId,
        automationType: 'payroll_processing',
        triggerType: 'time_entries_approved',
        enabled: true,
        autoApprove: false, // Payroll always requires 1% human QC
      });
    }
    
    if (payrollTrigger && payrollTrigger.enabled) {
      await this.executeTrigger(payrollTrigger.id);
    }
  }

  private findTrigger(workspaceId: string, automationType: AutomationType, triggerType: TriggerType): AutomationTrigger | undefined {
    const triggerId = `trigger-${workspaceId}-${automationType}-${triggerType}`;
    return this.triggers.get(triggerId);
  }

  getExecutionHistory(workspaceId?: string, limit: number = 50): TriggerExecutionResult[] {
    let history = this.executionHistory;
    
    if (workspaceId) {
      history = history.filter(h => {
        const trigger = this.triggers.get(h.triggerId);
        return trigger?.workspaceId === workspaceId;
      });
    }
    
    return history.slice(0, limit);
  }

  getStats(): {
    totalTriggers: number;
    enabledTriggers: number;
    disabledTriggers: number;
    executionsToday: number;
    successRate: number;
    byAutomationType: Record<AutomationType, number>;
  } {
    const stats = {
      totalTriggers: this.triggers.size,
      enabledTriggers: 0,
      disabledTriggers: 0,
      executionsToday: 0,
      successRate: 0,
      byAutomationType: {} as Record<AutomationType, number>,
    };

    for (const trigger of this.triggers.values()) {
      if (trigger.enabled) {
        stats.enabledTriggers++;
      } else {
        stats.disabledTriggers++;
      }
      stats.byAutomationType[trigger.automationType] = (stats.byAutomationType[trigger.automationType] || 0) + 1;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayExecutions = this.executionHistory.filter(h => {
      const trigger = this.triggers.get(h.triggerId);
      return trigger?.lastTriggeredAt && trigger.lastTriggeredAt >= today;
    });

    stats.executionsToday = todayExecutions.length;

    if (this.executionHistory.length > 0) {
      const successCount = this.executionHistory.filter(h => h.success).length;
      stats.successRate = (successCount / this.executionHistory.length) * 100;
    }

    return stats;
  }

  private async persistTrigger(trigger: AutomationTrigger): Promise<void> {
    try {
      const triggerJson = JSON.stringify(trigger);
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(automationTriggers).values({
        id: trigger.id,
        workspaceId: trigger.workspaceId,
        triggerData: triggerJson,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      }).onConflictDoUpdate({
        target: automationTriggers.id,
        set: { triggerData: triggerJson, updatedAt: sql`now()` },
      });
    } catch (error: any) {
      log.error('[AutomationTriggerService] Trigger persistence failed:', (error instanceof Error ? error.message : String(error)));
    }
  }

  async loadTriggers(): Promise<void> {
    try {
      const result = await db.select({ triggerData: automationTriggers.triggerData })
        .from(automationTriggers);
      
      for (const row of result) {
        try {
          const triggerData: AutomationTrigger = typeof row.triggerData === 'string'
            ? JSON.parse(row.triggerData)
            : row.triggerData;
          triggerData.createdAt = new Date(triggerData.createdAt);
          triggerData.updatedAt = new Date(triggerData.updatedAt);
          if (triggerData.lastTriggeredAt) {
            triggerData.lastTriggeredAt = new Date(triggerData.lastTriggeredAt);
          }
          this.triggers.set(triggerData.id, triggerData);
        } catch { /* skip malformed rows */ }
      }
      
      log.info(`[AutomationTriggerService] Loaded ${this.triggers.size} triggers from DB`);
    } catch (error: any) {
      log.warn('[AutomationTriggerService] Failed to load triggers:', (error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * GAP 2 FIX — Bootstrap default triggers for a single workspace.
   * Ensures invoice_creation, payroll_processing, and schedule_generation triggers
   * all exist regardless of whether the workspace has connected QuickBooks.
   * Safe to call multiple times — configureTrigger is idempotent.
   */
  async bootstrapWorkspaceTriggers(workspaceId: string): Promise<void> {
    await this.configureTrigger({
      workspaceId,
      automationType: 'invoice_creation',
      triggerType: 'time_entries_approved',
      enabled: true,
      autoApprove: true,
    });
    await this.configureTrigger({
      workspaceId,
      automationType: 'payroll_processing',
      triggerType: 'time_entries_approved',
      enabled: true,
      autoApprove: false, // payroll always requires 1% human QC
    });
    await this.configureTrigger({
      workspaceId,
      automationType: 'schedule_generation',
      triggerType: 'employee_import_complete',
      enabled: true,
      autoApprove: true,
    });
    log.info(`[AutomationTriggerService] Default triggers bootstrapped for workspace ${workspaceId}`);
  }

  /**
   * GAP 2 FIX — Bootstrap all active workspaces on startup.
   * Runs once after server starts to ensure no workspace is left trigger-less
   * after a deploy/restart.
   */
  async bootstrapAllWorkspaces(): Promise<void> {
    try {
      const activeWorkspaces = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.subscriptionStatus, 'active'));

      log.info(`[AutomationTriggerService] Bootstrapping triggers for ${activeWorkspaces.length} active workspaces`);
      for (const ws of activeWorkspaces) {
        await this.bootstrapWorkspaceTriggers(ws.id);
      }
      log.info('[AutomationTriggerService] Workspace trigger bootstrap complete');

      // GAP-F FIX: Recover pending approval gates from DB in case server restarted
      // while gates were waiting for manager approval.
      await this.recoverPendingApprovalGates();
    } catch (error: any) {
      log.error('[AutomationTriggerService] Bootstrap failed (non-critical):', (error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * GAP-F FIX: Re-populate pendingPayrollGates and pendingScheduleGates from DB-persisted
   * approval gates so that manager approvals still work after a server restart.
   */
  private async recoverPendingApprovalGates(): Promise<void> {
    try {
      const pendingGates = await approvalGateEnforcementService.loadPendingGates();
      let payrollRecovered = 0;
      let scheduleRecovered = 0;

      for (const gate of pendingGates) {
        const triggerId = (gate.payload?.triggerId ?? (gate as any).metadata?.triggerId) as string | undefined;
        if (gate.category === 'payroll' && gate.workspaceId) {
          this.pendingPayrollGates.set(gate.id, { workspaceId: gate.workspaceId, triggerId: triggerId ?? '' });
          payrollRecovered++;
        } else if (gate.category === 'scheduling' && gate.workspaceId) {
          this.pendingScheduleGates.set(gate.id, { workspaceId: gate.workspaceId, triggerId: triggerId ?? '' });
          scheduleRecovered++;
        }
      }

      if (payrollRecovered + scheduleRecovered > 0) {
        log.info(`[AutomationTriggerService] Recovered ${payrollRecovered} payroll gate(s) and ${scheduleRecovered} schedule gate(s) from DB`);
      }
    } catch (error: any) {
      log.warn('[AutomationTriggerService] Gate recovery failed (non-critical):', (error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * GAP 3 + 4 FIX — Daily billing cron.
   * Runs generateWeeklyInvoices for all active workspaces (respects billing cycle
   * isDue checks internally — no double-invoicing). Also runs delinquency sweep.
   */
  async runDailyBillingCycle(): Promise<void> {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    return withDistributedLock(LOCK_KEYS.DAILY_BILLING, 'Daily Billing Cycle', async () => {
      log.info('[AutomationTriggerService] Daily billing cycle starting...');
      try {
        const activeWorkspaces = await db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.subscriptionStatus, 'active'));

        let totalGenerated = 0;
        let totalDelinquencyChecked = 0;
        let platformBillsGenerated = 0;

        const now = new Date();
        const isFirstOfMonth = now.getDate() === 1;

        for (const ws of activeWorkspaces) {
          try {
            const result = await generateWeeklyInvoices(ws.id);
            totalGenerated += result.invoicesGenerated;

            await processDelinquentInvoices(ws.id);
            totalDelinquencyChecked++;

            if (isFirstOfMonth) {
              try {
                const billResult = await platformBillService.generateMonthlyBill(ws.id);
                if (billResult?.isNew) {
                  platformBillsGenerated++;
                  log.info(`[AutomationTriggerService] Platform bill generated for ${ws.id}: $${(billResult.totalCents / 100).toFixed(2)}`);
                }
              } catch (billError: any) {
                log.error(`[AutomationTriggerService] Platform bill failed for ${ws.id}:`, billError.message);
              }
            }
          } catch (wsError: any) {
            log.error(`[AutomationTriggerService] Billing cycle failed for workspace ${ws.id}:`, wsError.message);
          }
        }

        // Run overdue invoice collections escalation sweep (1d/7d/30d tiers)
        try {
          await withDistributedLock(LOCK_KEYS.COLLECTIONS_SWEEP, 'Collections Sweep', async () => {
            const collectionsResult = await runOverdueCollectionsSweep();
            if (collectionsResult.tier1Sent + collectionsResult.tier2Sent + collectionsResult.tier3Sent > 0) {
              log.info(`[AutomationTriggerService] Collections sweep — tier1:${collectionsResult.tier1Sent}, tier2:${collectionsResult.tier2Sent}, tier3:${collectionsResult.tier3Sent}`);
            }
          });
        } catch (collectionsErr: any) {
          log.error('[AutomationTriggerService] Collections sweep failed (non-blocking):', collectionsErr.message);
        }

        // GAP FIX 1+2: Draft invoice notification + 24h review window sweep
        try {
          const { runDraftInvoiceSweep } = await import('../billing/invoiceDraftNotificationService');
          const draftResult = await runDraftInvoiceSweep();
          if (draftResult.autoSent + draftResult.nudgesSent > 0) {
            log.info(`[AutomationTriggerService] Draft invoice sweep — auto-sent:${draftResult.autoSent}, nudges:${draftResult.nudgesSent}`);
          }
        } catch (draftErr: any) {
          log.error('[AutomationTriggerService] Draft invoice sweep failed (non-blocking):', draftErr.message);
        }

        // GAP FIX 4+5: Timesheet submission + approval reminders
        try {
          const { runTimesheetReminderScan } = await import('../billing/timesheetReminderService');
          const timesheetResult = await runTimesheetReminderScan();
          if (timesheetResult.submissionReminders + timesheetResult.approvalReminders > 0) {
            log.info(`[AutomationTriggerService] Timesheet reminders — employee:${timesheetResult.submissionReminders}, manager:${timesheetResult.approvalReminders}`);
          }
        } catch (tsErr: any) {
          log.error('[AutomationTriggerService] Timesheet reminder scan failed (non-blocking):', tsErr.message);
        }

        // GAP FIX 6: Payroll period auto-close + draft generation
        try {
          const { runPayrollAutoClose, detectOrphanedPayrollRuns } = await import('../billing/payrollAutoCloseService');
          const payrollResult = await runPayrollAutoClose();
          if (payrollResult.draftsGenerated > 0) {
            log.info(`[AutomationTriggerService] Payroll auto-close — drafts generated:${payrollResult.draftsGenerated}`);
          }
          await detectOrphanedPayrollRuns();
        } catch (payrollErr: any) {
          log.error('[AutomationTriggerService] Payroll auto-close failed (non-blocking):', payrollErr.message);
        }

        // GAP 12: Trinity Financial Briefing — weekly on Monday
        if (now.getDay() === 1) { // Monday
          try {
            const { runTrinityFinancialBriefings } = await import('../billing/trinityFinancialBriefingService');
            const briefingResult = await runTrinityFinancialBriefings();
            if (briefingResult.briefingsSent > 0) {
              log.info(`[AutomationTriggerService] Trinity financial briefing — sent to ${briefingResult.briefingsSent} org owners`);
            }
          } catch (briefingErr: any) {
            log.error('[AutomationTriggerService] Trinity financial briefing failed (non-blocking):', briefingErr.message);
          }
        }

        // GAP 8+9: Per-employee payment method notifications
        // Run whenever payroll runs are approved/processing (daily check)
        try {
          const { sendEmployeePaymentMethodNotifications } = await import('../billing/employeePaymentNotificationService');
          await sendEmployeePaymentMethodNotifications();
        } catch (pmErr: any) {
          log.error('[AutomationTriggerService] Employee payment method notifications failed (non-blocking):', pmErr.message);
        }

        // GAP 14 FIX: Payroll deadline nudge — notify owners 72h and 24h before cutoff
        try {
          const { runPayrollDeadlineNudge } = await import('../billing/payrollDeadlineNudgeService');
          const nudgeResult = await runPayrollDeadlineNudge();
          if (nudgeResult.nudgesSent > 0) {
            log.info(`[AutomationTriggerService] Payroll deadline nudge — sent ${nudgeResult.nudgesSent} alert(s) across ${nudgeResult.workspacesChecked} workspace(s)`);
          }
        } catch (nudgeErr: any) {
          log.error('[AutomationTriggerService] Payroll deadline nudge failed (non-blocking):', nudgeErr.message);
        }

        // GAP FIX 10: 1099 January automation — flag contractors in January
        if (now.getMonth() === 0) {
          try {
            const { run1099JanuaryScan } = await import('../billing/contractorTaxAutomationService');
            const result1099 = await run1099JanuaryScan(now.getFullYear() - 1);
            if (result1099.flagged > 0) {
              log.info(`[AutomationTriggerService] 1099 January scan — flagged:${result1099.flagged} contractors`);
            }
          } catch (taxErr: any) {
            log.error('[AutomationTriggerService] 1099 January scan failed (non-blocking):', taxErr.message);
          }
        }

        log.info(`[AutomationTriggerService] Daily billing cycle complete — invoices generated: ${totalGenerated}, delinquency checked: ${totalDelinquencyChecked}${isFirstOfMonth ? `, platform bills: ${platformBillsGenerated}` : ''}`);

        await platformEventBus.publish({
          type: 'automation_completed',
          title: 'Daily Billing Cycle Completed',
          payload: { invoicesGenerated: totalGenerated, workspacesProcessed: totalDelinquencyChecked, platformBillsGenerated },
          metadata: { source: 'DailyBillingCron' },
        });
      } catch (error: any) {
        log.error('[AutomationTriggerService] Daily billing cycle error:', (error instanceof Error ? error.message : String(error)));
      }
    });
  }

  shutdown(): void {
    log.info('[AutomationTriggerService] Shutting down...');
    if (this._billingCronTimer) clearInterval(this._billingCronTimer);
  }

  private _billingCronTimer?: ReturnType<typeof setInterval>;
  private _weekEndCronTimer?: ReturnType<typeof setInterval>;
  private _monthEndCronTimer?: ReturnType<typeof setInterval>;

  /**
   * Start the daily billing cron. Runs once immediately at startup
   * (to catch any billing due since the last run), then every 24 hours.
   */
  startDailyBillingCron(): void {
    // Run immediately (catches billing that was due while server was down)
    setTimeout(async () => {
      try {
        await this.runDailyBillingCycle();
      } catch (err) {
        log.error('[AutomationTriggerService] Initial billing run failed:', err);
      }
    }, 5 * 60 * 1000); // 5-min delay so server is fully warm

    // Then every 24 hours
    let isRunning = false;
    this._billingCronTimer = setInterval(async () => {
      if (isRunning) return;
      isRunning = true;
      try {
        await this.runDailyBillingCycle();
      } catch (err) {
        log.error('[AutomationTriggerService] Daily billing cron failed:', err);
      } finally {
        isRunning = false;
      }
    }, 24 * 60 * 60 * 1000);
    log.info('[AutomationTriggerService] Daily billing cron scheduled (24h interval, first run in 5 min)');
  }

  /**
   * Fire all registered week_end triggers across all workspaces.
   * Called by the weekly cron.
   */
  async runWeekEndTriggers(): Promise<void> {
    log.info('[AutomationTriggerService] Firing week_end triggers...');
    for (const trigger of this.triggers.values()) {
      if (trigger.triggerType === 'week_end' && trigger.enabled) {
        try {
          // Check if workspace is still active before firing
          const [ws] = await db.select({ id: workspaces.id, isSuspended: workspaces.isSuspended })
            .from(workspaces)
            .where(eq(workspaces.id, trigger.workspaceId))
            .limit(1);

          if (!ws || ws.isSuspended) continue;

          await this.executeTrigger(trigger.id);
        } catch (err: any) {
          log.error(`[AutomationTriggerService] week_end trigger failed for workspace ${trigger.workspaceId}:`, (err instanceof Error ? err.message : String(err)));
        }
      }
    }
  }

  /**
   * Fire all registered month_end triggers across all workspaces.
   * Called by the monthly cron.
   */
  async runMonthEndTriggers(): Promise<void> {
    log.info('[AutomationTriggerService] Firing month_end triggers...');
    for (const trigger of this.triggers.values()) {
      if (trigger.triggerType === 'month_end' && trigger.enabled) {
        try {
          // Check if workspace is still active before firing
          const [ws] = await db.select({ id: workspaces.id, isSuspended: workspaces.isSuspended })
            .from(workspaces)
            .where(eq(workspaces.id, trigger.workspaceId))
            .limit(1);

          if (!ws || ws.isSuspended) continue;

          await this.executeTrigger(trigger.id);
        } catch (err: any) {
          log.error(`[AutomationTriggerService] month_end trigger failed for workspace ${trigger.workspaceId}:`, (err instanceof Error ? err.message : String(err)));
        }
      }
    }
  }

  /**
   * Schedule weekly (week_end) and monthly (month_end) trigger crons.
   * week_end fires every 7 days; month_end fires on the last calendar day of each month
   * (approximated by checking daily whether tomorrow is a new month).
   */
  startPeriodicTriggerCrons(): void {
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    let isWeekEndRunning = false;
    this._weekEndCronTimer = setInterval(async () => {
      if (isWeekEndRunning) return;
      isWeekEndRunning = true;
      try {
        await this.runWeekEndTriggers();
      } catch (err) {
        log.error('[AutomationTriggerService] Weekly trigger cron failed:', err);
      } finally {
        isWeekEndRunning = false;
      }
    }, WEEK_MS);

    // month_end: run a daily check; fire when today is the last day of the current month
    const DAILY_MS = 24 * 60 * 60 * 1000;
    let isMonthEndRunning = false;
    this._monthEndCronTimer = setInterval(async () => {
      if (isMonthEndRunning) return;
      isMonthEndRunning = true;
      try {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        if (tomorrow.getMonth() !== now.getMonth()) {
          await this.runMonthEndTriggers();
        }
      } catch (err) {
        log.error('[AutomationTriggerService] Monthly trigger cron failed:', err);
      } finally {
        isMonthEndRunning = false;
      }
    }, DAILY_MS);

    log.info('[AutomationTriggerService] Weekly/monthly trigger crons scheduled (7d / last-day-of-month)');
  }
}

export const automationTriggerService = new AutomationTriggerService();
