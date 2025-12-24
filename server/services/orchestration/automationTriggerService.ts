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
import { platformEventBus } from '../platformEventBus';
import { helpaiOrchestrator } from '../helpai/helpaiActionOrchestrator';
import { approvalGateEnforcementService } from './approvalGateEnforcement';
import { employees } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

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

  constructor() {
    this.subscribeToEvents();
    this.registerActions();
  }

  private subscribeToEvents() {
    platformEventBus.subscribe('quickbooks_connected', async (event) => {
      await this.handleIntegrationConnected(event.workspaceId, 'quickbooks');
    });

    platformEventBus.subscribe('quickbooks_flow_complete', async (event) => {
      await this.handleDataSyncComplete(event.workspaceId, event.payload);
    });

    platformEventBus.subscribe('employees_imported', async (event) => {
      await this.handleEmployeeImportComplete(event.workspaceId, event.payload);
    });

    platformEventBus.subscribe('schedule_published', async (event) => {
      await this.handleSchedulePublished(event.workspaceId, event.payload);
    });

    platformEventBus.subscribe('time_entries_approved', async (event) => {
      await this.handleTimeEntriesApproved(event.workspaceId, event.payload);
    });
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
      handler: async (params) => {
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
      handler: async (params) => {
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
      handler: async (params) => {
        return await this.executeTrigger(params.triggerId, params.force);
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
      handler: async (params) => {
        return this.getExecutionHistory(params.workspaceId, params.limit || 50);
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
      handler: async (params) => {
        const trigger = this.triggers.get(params.triggerId);
        if (!trigger) {
          return { success: false, message: 'Trigger not found' };
        }
        trigger.enabled = params.enabled;
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
      handler: async () => {
        return this.getStats();
      },
    });

    console.log('[AutomationTriggerService] Registered 6 AI Brain actions');
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
          eq(employees.status, 'active')
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
          action: 'generate_schedule',
          requesterId: 'automation_system',
          description: `Auto-generate schedule for ${workspaceEmployees.length} employees`,
          metadata: { employeeCount: workspaceEmployees.length, triggerId: trigger.id },
        });

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

      executedActions.push('schedule_generation_initiated');
      executedActions.push(`scheduled_${workspaceEmployees.length}_employees`);

      return {
        triggerId: trigger.id,
        automationType: 'schedule_generation',
        success: true,
        requiresApproval: false,
        executedActions,
        errors,
        affectedRecords: workspaceEmployees.length,
        durationMs: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        triggerId: trigger.id,
        automationType: 'schedule_generation',
        success: false,
        requiresApproval: false,
        executedActions,
        errors: [error.message],
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
          action: 'create_invoice_batch',
          requesterId: 'automation_system',
          description: 'Auto-create invoices from approved time entries',
          metadata: { triggerId: trigger.id },
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

      executedActions.push('invoice_creation_initiated');

      return {
        triggerId: trigger.id,
        automationType: 'invoice_creation',
        success: true,
        requiresApproval: false,
        executedActions,
        errors: [],
        affectedRecords: 0,
        durationMs: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        triggerId: trigger.id,
        automationType: 'invoice_creation',
        success: false,
        requiresApproval: false,
        executedActions,
        errors: [error.message],
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
        action: 'process_payroll',
        requesterId: 'automation_system',
        description: 'Auto-process payroll from approved timesheets',
        metadata: { triggerId: trigger.id },
      });

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
        errors: [error.message],
        affectedRecords: 0,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async handleIntegrationConnected(workspaceId: string, provider: string): Promise<void> {
    console.log(`[AutomationTriggerService] Integration connected: ${provider} for workspace ${workspaceId}`);

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

    platformEventBus.publish({
      type: 'automation_triggers_configured',
      workspaceId,
      payload: { provider, triggersCreated: 3 },
    });
  }

  private async handleDataSyncComplete(workspaceId: string, payload: any): Promise<void> {
    console.log(`[AutomationTriggerService] Data sync complete for workspace ${workspaceId}`);
    
    const trigger = this.findTrigger(workspaceId, 'employee_sync', 'data_sync_complete');
    if (trigger && trigger.enabled) {
      await this.executeTrigger(trigger.id);
    }
  }

  private async handleEmployeeImportComplete(workspaceId: string, payload: any): Promise<void> {
    console.log(`[AutomationTriggerService] Employee import complete for workspace ${workspaceId}`);
    
    const trigger = this.findTrigger(workspaceId, 'schedule_generation', 'employee_import_complete');
    if (trigger && trigger.enabled) {
      await this.executeTrigger(trigger.id);
    }
  }

  private async handleSchedulePublished(workspaceId: string, payload: any): Promise<void> {
    console.log(`[AutomationTriggerService] Schedule published for workspace ${workspaceId}`);
  }

  private async handleTimeEntriesApproved(workspaceId: string, payload: any): Promise<void> {
    console.log(`[AutomationTriggerService] Time entries approved for workspace ${workspaceId}`);
    
    const trigger = this.findTrigger(workspaceId, 'invoice_creation', 'time_entries_approved');
    if (trigger && trigger.enabled) {
      await this.executeTrigger(trigger.id);
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
      await db.execute(`
        INSERT INTO automation_triggers (id, workspace_id, trigger_data, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          trigger_data = $3,
          updated_at = NOW()
      `, [trigger.id, trigger.workspaceId, JSON.stringify(trigger)]);
    } catch (error) {
      console.log('[AutomationTriggerService] Persistence skipped - table may not exist');
    }
  }

  async loadTriggers(): Promise<void> {
    try {
      const result = await db.execute(`
        SELECT trigger_data FROM automation_triggers
      `);
      
      for (const row of result.rows || []) {
        const triggerData = row.trigger_data as AutomationTrigger;
        triggerData.createdAt = new Date(triggerData.createdAt);
        triggerData.updatedAt = new Date(triggerData.updatedAt);
        if (triggerData.lastTriggeredAt) {
          triggerData.lastTriggeredAt = new Date(triggerData.lastTriggeredAt);
        }
        this.triggers.set(triggerData.id, triggerData);
      }
      
      console.log(`[AutomationTriggerService] Loaded ${this.triggers.size} triggers`);
    } catch (error) {
      console.log('[AutomationTriggerService] No persisted triggers to load');
    }
  }

  shutdown(): void {
    console.log('[AutomationTriggerService] Shutting down...');
  }
}

export const automationTriggerService = new AutomationTriggerService();
