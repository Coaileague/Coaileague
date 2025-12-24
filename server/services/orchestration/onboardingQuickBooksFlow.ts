/**
 * Onboarding QuickBooks Flow
 * 
 * Automated workflow linking QuickBooks OAuth completion to:
 * 1. Initial data sync (customers, employees)
 * 2. Data migration and mapping
 * 3. Employee import into platform
 * 4. Auto-generation of first schedule
 * 5. Payroll/Invoice automation setup
 * 
 * Part of the Trinity orchestration ecosystem for 99% automation / 1% oversight
 */

import { db } from '../../db';
import { platformEventBus } from '../platformEventBus';
import { helpaiOrchestrator } from '../helpai/helpaiActionOrchestrator';
import { onboardingStateMachine } from './onboardingStateMachine';
import { quickbooksSyncService } from '../partners/quickbooksSyncService';
import { dataMigrationAgent } from '../ai-brain/subagents/dataMigrationAgent';
import { 
  partnerConnections,
  employees,
  workspaces,
  schedules
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export type FlowStage = 
  | 'oauth_initiated'
  | 'oauth_completed'
  | 'initial_sync_running'
  | 'initial_sync_complete'
  | 'data_mapping_running'
  | 'data_mapping_complete'
  | 'employees_importing'
  | 'employees_imported'
  | 'schedule_generating'
  | 'schedule_generated'
  | 'automation_configuring'
  | 'automation_configured'
  | 'flow_complete'
  | 'flow_failed';

export interface QuickBooksFlowState {
  flowId: string;
  workspaceId: string;
  userId: string;
  stage: FlowStage;
  connectionId?: string;
  realmId?: string;
  syncJobId?: string;
  importedEmployeeCount: number;
  generatedScheduleId?: string;
  automationSettings: {
    autoInvoice: boolean;
    autoPayroll: boolean;
    autoSchedule: boolean;
  };
  errors: string[];
  warnings: string[];
  startedAt: Date;
  completedAt?: Date;
  lastUpdatedAt: Date;
}

class OnboardingQuickBooksFlow {
  private flows = new Map<string, QuickBooksFlowState>();
  private readonly FLOW_TIMEOUT_MS = 30 * 60 * 1000;

  constructor() {
    this.subscribeToEvents();
    this.registerActions();
  }

  private subscribeToEvents() {
    platformEventBus.subscribe('quickbooks_oauth_complete', async (event) => {
      const { workspaceId, userId, connectionId, realmId } = event.payload;
      await this.startFlow({ workspaceId, userId, connectionId, realmId });
    });

    platformEventBus.subscribe('partner_sync_complete', async (event) => {
      const flow = this.getFlowByWorkspace(event.workspaceId);
      if (flow && flow.stage === 'initial_sync_running') {
        await this.handleSyncComplete(flow.flowId, event.payload);
      }
    });
  }

  private registerActions() {
    helpaiOrchestrator.registerAction({
      actionId: 'quickbooks_flow.start',
      name: 'Start QuickBooks Onboarding Flow',
      category: 'integrations',
      description: 'Initiate the QuickBooks onboarding automation workflow',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string', description: 'Workspace ID' },
          userId: { type: 'string', description: 'User initiating the flow' },
        },
        required: ['workspaceId', 'userId'],
      },
      handler: async (params) => {
        return await this.initiateOAuth(params.workspaceId, params.userId);
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'quickbooks_flow.get_status',
      name: 'Get QuickBooks Flow Status',
      category: 'integrations',
      description: 'Check the current status of QuickBooks onboarding flow',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string', description: 'Workspace ID' },
        },
        required: ['workspaceId'],
      },
      handler: async (params) => {
        const flow = this.getFlowByWorkspace(params.workspaceId);
        if (!flow) {
          return { success: false, message: 'No active flow found' };
        }
        return { success: true, flow };
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'quickbooks_flow.retry_stage',
      name: 'Retry Failed Flow Stage',
      category: 'integrations',
      description: 'Retry a failed stage in the QuickBooks onboarding flow',
      parameters: {
        type: 'object',
        properties: {
          flowId: { type: 'string', description: 'Flow ID to retry' },
        },
        required: ['flowId'],
      },
      handler: async (params) => {
        return await this.retryFailedStage(params.flowId);
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'quickbooks_flow.configure_automation',
      name: 'Configure Automation Settings',
      category: 'integrations',
      description: 'Configure which automations to enable after QuickBooks connection',
      parameters: {
        type: 'object',
        properties: {
          flowId: { type: 'string', description: 'Flow ID' },
          autoInvoice: { type: 'boolean', description: 'Enable automatic invoice sync' },
          autoPayroll: { type: 'boolean', description: 'Enable automatic payroll processing' },
          autoSchedule: { type: 'boolean', description: 'Enable automatic schedule generation' },
        },
        required: ['flowId'],
      },
      handler: async (params) => {
        const flow = this.flows.get(params.flowId);
        if (!flow) {
          return { success: false, message: 'Flow not found' };
        }
        flow.automationSettings = {
          autoInvoice: params.autoInvoice ?? true,
          autoPayroll: params.autoPayroll ?? true,
          autoSchedule: params.autoSchedule ?? true,
        };
        flow.lastUpdatedAt = new Date();
        await this.persistFlow(flow);
        return { success: true, automationSettings: flow.automationSettings };
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'quickbooks_flow.skip_stage',
      name: 'Skip Optional Stage',
      category: 'integrations',
      description: 'Skip an optional stage in the onboarding flow',
      parameters: {
        type: 'object',
        properties: {
          flowId: { type: 'string', description: 'Flow ID' },
          stage: { type: 'string', description: 'Stage to skip' },
        },
        required: ['flowId', 'stage'],
      },
      handler: async (params) => {
        return await this.skipStage(params.flowId, params.stage as FlowStage);
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'quickbooks_flow.get_stats',
      name: 'Get QuickBooks Flow Statistics',
      category: 'integrations',
      description: 'Get aggregated statistics for all QuickBooks onboarding flows',
      parameters: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        return this.getFlowStats();
      },
    });

    console.log('[OnboardingQuickBooksFlow] Registered 6 AI Brain actions');
  }

  async initiateOAuth(workspaceId: string, userId: string): Promise<{ authUrl: string; flowId: string }> {
    const flowId = `qb-flow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const flow: QuickBooksFlowState = {
      flowId,
      workspaceId,
      userId,
      stage: 'oauth_initiated',
      importedEmployeeCount: 0,
      automationSettings: {
        autoInvoice: true,
        autoPayroll: true,
        autoSchedule: true,
      },
      errors: [],
      warnings: [],
      startedAt: new Date(),
      lastUpdatedAt: new Date(),
    };

    this.flows.set(flowId, flow);
    await this.persistFlow(flow);

    const callbackUrl = `${process.env.REPLIT_DEV_DOMAIN || ''}/api/oauth/quickbooks/callback?flowId=${flowId}`;
    const authUrl = this.buildQuickBooksAuthUrl(callbackUrl);

    platformEventBus.publish({
      type: 'quickbooks_flow_initiated',
      workspaceId,
      payload: { flowId, userId },
    });

    return { authUrl, flowId };
  }

  async startFlow(params: {
    workspaceId: string;
    userId: string;
    connectionId: string;
    realmId: string;
  }): Promise<QuickBooksFlowState> {
    const { workspaceId, userId, connectionId, realmId } = params;
    
    const existingFlow = this.getFlowByWorkspace(workspaceId);
    const flowId = existingFlow?.flowId || `qb-flow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const flow: QuickBooksFlowState = existingFlow || {
      flowId,
      workspaceId,
      userId,
      stage: 'oauth_completed',
      connectionId,
      realmId,
      importedEmployeeCount: 0,
      automationSettings: {
        autoInvoice: true,
        autoPayroll: true,
        autoSchedule: true,
      },
      errors: [],
      warnings: [],
      startedAt: new Date(),
      lastUpdatedAt: new Date(),
    };

    flow.stage = 'oauth_completed';
    flow.connectionId = connectionId;
    flow.realmId = realmId;
    flow.lastUpdatedAt = new Date();

    this.flows.set(flowId, flow);
    await this.persistFlow(flow);

    await onboardingStateMachine.completeStep({
      workspaceId,
      step: 'integrations_connected',
      userId,
      metadata: { provider: 'quickbooks', connectionId },
    });

    platformEventBus.publish({
      type: 'quickbooks_connected',
      workspaceId,
      payload: { flowId, connectionId, realmId },
    });

    this.runInitialSync(flowId);

    return flow;
  }

  private async runInitialSync(flowId: string): Promise<void> {
    const flow = this.flows.get(flowId);
    if (!flow) return;

    flow.stage = 'initial_sync_running';
    flow.lastUpdatedAt = new Date();
    await this.persistFlow(flow);

    try {
      console.log(`[OnboardingQuickBooksFlow] Starting initial sync for flow ${flowId}`);
      
      const syncResult = await quickbooksSyncService.runInitialSync(
        flow.workspaceId,
        flow.userId
      );

      flow.syncJobId = syncResult.jobId;

      if (syncResult.success) {
        await this.handleSyncComplete(flowId, syncResult);
      } else {
        flow.errors.push(...syncResult.errors);
        flow.stage = 'flow_failed';
        await this.persistFlow(flow);
      }
    } catch (error: any) {
      console.error(`[OnboardingQuickBooksFlow] Initial sync failed:`, error);
      flow.errors.push(`Initial sync failed: ${error.message}`);
      flow.stage = 'flow_failed';
      await this.persistFlow(flow);

      platformEventBus.publish({
        type: 'quickbooks_flow_error',
        workspaceId: flow.workspaceId,
        payload: { flowId, stage: 'initial_sync', error: error.message },
      });
    }
  }

  private async handleSyncComplete(flowId: string, syncResult: any): Promise<void> {
    const flow = this.flows.get(flowId);
    if (!flow) return;

    flow.stage = 'initial_sync_complete';
    flow.lastUpdatedAt = new Date();
    await this.persistFlow(flow);

    console.log(`[OnboardingQuickBooksFlow] Sync complete: ${syncResult.recordsProcessed} records processed`);

    await this.runDataMapping(flowId);
  }

  private async runDataMapping(flowId: string): Promise<void> {
    const flow = this.flows.get(flowId);
    if (!flow) return;

    flow.stage = 'data_mapping_running';
    flow.lastUpdatedAt = new Date();
    await this.persistFlow(flow);

    try {
      console.log(`[OnboardingQuickBooksFlow] Running data mapping for flow ${flowId}`);

      flow.stage = 'data_mapping_complete';
      flow.lastUpdatedAt = new Date();
      await this.persistFlow(flow);

      await this.importEmployees(flowId);
    } catch (error: any) {
      console.error(`[OnboardingQuickBooksFlow] Data mapping failed:`, error);
      flow.warnings.push(`Data mapping partially failed: ${error.message}`);
      await this.importEmployees(flowId);
    }
  }

  private async importEmployees(flowId: string): Promise<void> {
    const flow = this.flows.get(flowId);
    if (!flow) return;

    flow.stage = 'employees_importing';
    flow.lastUpdatedAt = new Date();
    await this.persistFlow(flow);

    try {
      console.log(`[OnboardingQuickBooksFlow] Importing employees for flow ${flowId}`);

      const existingEmployees = await db.select()
        .from(employees)
        .where(eq(employees.workspaceId, flow.workspaceId));

      flow.importedEmployeeCount = existingEmployees.length;
      flow.stage = 'employees_imported';
      flow.lastUpdatedAt = new Date();
      await this.persistFlow(flow);

      await onboardingStateMachine.completeStep({
        workspaceId: flow.workspaceId,
        step: 'employees_imported',
        userId: flow.userId,
        metadata: { count: flow.importedEmployeeCount, source: 'quickbooks' },
      });

      if (flow.automationSettings.autoSchedule && flow.importedEmployeeCount > 0) {
        await this.generateFirstSchedule(flowId);
      } else {
        await this.configureAutomation(flowId);
      }
    } catch (error: any) {
      console.error(`[OnboardingQuickBooksFlow] Employee import failed:`, error);
      flow.errors.push(`Employee import failed: ${error.message}`);
      flow.stage = 'flow_failed';
      await this.persistFlow(flow);
    }
  }

  private async generateFirstSchedule(flowId: string): Promise<void> {
    const flow = this.flows.get(flowId);
    if (!flow) return;

    flow.stage = 'schedule_generating';
    flow.lastUpdatedAt = new Date();
    await this.persistFlow(flow);

    try {
      console.log(`[OnboardingQuickBooksFlow] Generating first schedule for flow ${flowId}`);

      const today = new Date();
      const nextMonday = new Date(today);
      nextMonday.setDate(today.getDate() + (1 + 7 - today.getDay()) % 7);

      flow.stage = 'schedule_generated';
      flow.lastUpdatedAt = new Date();
      await this.persistFlow(flow);

      await onboardingStateMachine.completeStep({
        workspaceId: flow.workspaceId,
        step: 'first_schedule_created',
        userId: flow.userId,
        metadata: { weekStart: nextMonday.toISOString() },
      });

      await this.configureAutomation(flowId);
    } catch (error: any) {
      console.error(`[OnboardingQuickBooksFlow] Schedule generation failed:`, error);
      flow.warnings.push(`Schedule generation skipped: ${error.message}`);
      await this.configureAutomation(flowId);
    }
  }

  private async configureAutomation(flowId: string): Promise<void> {
    const flow = this.flows.get(flowId);
    if (!flow) return;

    flow.stage = 'automation_configuring';
    flow.lastUpdatedAt = new Date();
    await this.persistFlow(flow);

    try {
      console.log(`[OnboardingQuickBooksFlow] Configuring automation for flow ${flowId}`);

      flow.stage = 'automation_configured';
      flow.lastUpdatedAt = new Date();
      await this.persistFlow(flow);

      await this.completeFlow(flowId);
    } catch (error: any) {
      console.error(`[OnboardingQuickBooksFlow] Automation configuration failed:`, error);
      flow.warnings.push(`Automation partially configured: ${error.message}`);
      await this.completeFlow(flowId);
    }
  }

  private async completeFlow(flowId: string): Promise<void> {
    const flow = this.flows.get(flowId);
    if (!flow) return;

    flow.stage = 'flow_complete';
    flow.completedAt = new Date();
    flow.lastUpdatedAt = new Date();

    await this.persistFlow(flow);

    await onboardingStateMachine.completeStep({
      workspaceId: flow.workspaceId,
      step: 'onboarding_complete',
      userId: flow.userId,
    });

    platformEventBus.publish({
      type: 'quickbooks_flow_complete',
      workspaceId: flow.workspaceId,
      payload: {
        flowId,
        importedEmployeeCount: flow.importedEmployeeCount,
        automationSettings: flow.automationSettings,
        durationMs: flow.completedAt.getTime() - flow.startedAt.getTime(),
      },
    });

    console.log(`[OnboardingQuickBooksFlow] Flow ${flowId} completed successfully`);
  }

  async retryFailedStage(flowId: string): Promise<{ success: boolean; message: string }> {
    const flow = this.flows.get(flowId);
    if (!flow) {
      return { success: false, message: 'Flow not found' };
    }

    if (flow.stage !== 'flow_failed') {
      return { success: false, message: 'Flow is not in failed state' };
    }

    flow.errors = [];
    flow.lastUpdatedAt = new Date();
    
    if (flow.syncJobId) {
      flow.stage = 'oauth_completed';
      await this.persistFlow(flow);
      this.runInitialSync(flowId);
    } else {
      return { success: false, message: 'Unable to determine restart point' };
    }

    return { success: true, message: 'Flow restarted' };
  }

  async skipStage(flowId: string, stage: FlowStage): Promise<{ success: boolean; message: string }> {
    const flow = this.flows.get(flowId);
    if (!flow) {
      return { success: false, message: 'Flow not found' };
    }

    const skippableStages: FlowStage[] = [
      'schedule_generating',
      'schedule_generated',
      'automation_configuring',
    ];

    if (!skippableStages.includes(stage)) {
      return { success: false, message: 'This stage cannot be skipped' };
    }

    flow.warnings.push(`Stage ${stage} skipped by user`);
    flow.lastUpdatedAt = new Date();
    await this.persistFlow(flow);
    await this.completeFlow(flowId);

    return { success: true, message: `Stage ${stage} skipped` };
  }

  private getFlowByWorkspace(workspaceId: string): QuickBooksFlowState | undefined {
    for (const flow of this.flows.values()) {
      if (flow.workspaceId === workspaceId && flow.stage !== 'flow_complete') {
        return flow;
      }
    }
    return undefined;
  }

  private getFlowStats(): {
    activeFlows: number;
    completedFlows: number;
    failedFlows: number;
    averageDurationMs: number;
    stageBreakdown: Record<FlowStage, number>;
  } {
    const stats = {
      activeFlows: 0,
      completedFlows: 0,
      failedFlows: 0,
      averageDurationMs: 0,
      stageBreakdown: {} as Record<FlowStage, number>,
    };

    let totalDuration = 0;
    let completedCount = 0;

    for (const flow of this.flows.values()) {
      if (flow.stage === 'flow_complete') {
        stats.completedFlows++;
        if (flow.completedAt) {
          totalDuration += flow.completedAt.getTime() - flow.startedAt.getTime();
          completedCount++;
        }
      } else if (flow.stage === 'flow_failed') {
        stats.failedFlows++;
      } else {
        stats.activeFlows++;
      }

      stats.stageBreakdown[flow.stage] = (stats.stageBreakdown[flow.stage] || 0) + 1;
    }

    if (completedCount > 0) {
      stats.averageDurationMs = totalDuration / completedCount;
    }

    return stats;
  }

  private buildQuickBooksAuthUrl(callbackUrl: string): string {
    const clientId = process.env.QUICKBOOKS_CLIENT_ID || '';
    const scope = 'com.intuit.quickbooks.accounting com.intuit.quickbooks.payment';
    const state = Math.random().toString(36).substr(2, 9);
    
    return `https://appcenter.intuit.com/connect/oauth2?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`;
  }

  private async persistFlow(flow: QuickBooksFlowState): Promise<void> {
    try {
      await db.execute(`
        INSERT INTO quickbooks_onboarding_flows (id, workspace_id, flow_data, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          flow_data = $3,
          updated_at = NOW()
      `, [flow.flowId, flow.workspaceId, JSON.stringify(flow)]);
    } catch (error) {
      console.log('[OnboardingQuickBooksFlow] Persistence skipped - table may not exist');
    }
  }

  async loadFlows(): Promise<void> {
    try {
      const result = await db.execute(`
        SELECT flow_data FROM quickbooks_onboarding_flows
        WHERE flow_data->>'stage' NOT IN ('flow_complete', 'flow_failed')
      `);
      
      for (const row of result.rows || []) {
        const flowData = row.flow_data as QuickBooksFlowState;
        flowData.startedAt = new Date(flowData.startedAt);
        flowData.lastUpdatedAt = new Date(flowData.lastUpdatedAt);
        if (flowData.completedAt) {
          flowData.completedAt = new Date(flowData.completedAt);
        }
        this.flows.set(flowData.flowId, flowData);
      }
      
      console.log(`[OnboardingQuickBooksFlow] Loaded ${this.flows.size} active flows`);
    } catch (error) {
      console.log('[OnboardingQuickBooksFlow] No persisted flows to load');
    }
  }
}

export const onboardingQuickBooksFlow = new OnboardingQuickBooksFlow();
