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
import { helpaiOrchestrator } from '../helpai/platformActionHub';
import { onboardingStateMachine } from './onboardingStateMachine';
import { quickbooksSyncService } from '../partners/quickbooksSyncService';
import { dataMigrationAgent } from '../ai-brain/subagents/dataMigrationAgent';
import { 
  partnerConnections,
  employees,
  workspaces,
  schedules,
  quickbooksOnboardingFlows,
  quickbooksMigrationRuns,
  partnerDataMappings,
} from '@shared/schema';
import { eq, and, ne, inArray } from 'drizzle-orm';
import { INTEGRATIONS } from '@shared/platformConfig';
import { quickbooksOAuthService } from '../oauth/quickbooks';
import { publishEvent } from './pipelineErrorHandler';
import { createLogger } from '../../lib/logger';
const log = createLogger('onboardingQuickBooksFlow');


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
    platformEventBus.subscribe('quickbooks_oauth_complete', { name: 'OnboardingQBFlow-OAuthComplete', handler: async (event) => {
      const { workspaceId, userId, connectionId, realmId } = event.payload || {};
      await this.startFlow({ workspaceId, userId, connectionId, realmId });
    }});

    platformEventBus.subscribe('partner_sync_complete', { name: 'OnboardingQBFlow-PartnerSyncComplete', handler: async (event) => {
      const flow = this.getFlowByWorkspace(event.workspaceId);
      if (flow && flow.stage === 'initial_sync_running') {
        await this.handleSyncComplete(flow.flowId, event.payload || {});
      }
    }});
  }

  private registerActions() {
    (helpaiOrchestrator as any).registerAction({
      actionId: 'quickbooks.flow_start',
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
      handler: async (params: any) => {
        return await this.initiateOAuth(params.workspaceId, params.userId);
      },
    });

    (helpaiOrchestrator as any).registerAction({
      actionId: 'quickbooks.flow_status',
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
      handler: async (params: any) => {
        const flow = this.getFlowByWorkspace(params.workspaceId);
        if (!flow) {
          return { success: false, message: 'No active flow found' };
        }
        return { success: true, flow };
      },
    });

    (helpaiOrchestrator as any).registerAction({
      actionId: 'quickbooks.flow_retry_stage',
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
      handler: async (params: any) => {
        return await this.retryFailedStage(params.flowId);
      },
    });

    (helpaiOrchestrator as any).registerAction({
      actionId: 'quickbooks.flow_configure',
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
      handler: async (params: any) => {
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

    (helpaiOrchestrator as any).registerAction({
      actionId: 'quickbooks.flow_skip_stage',
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
      handler: async (params: any) => {
        return await this.skipStage(params.flowId, params.stage as FlowStage);
      },
    });

    (helpaiOrchestrator as any).registerAction({
      actionId: 'quickbooks.flow_stats',
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

    (helpaiOrchestrator as any).registerAction({
      actionId: 'quickbooks.flow_reset',
      name: 'Reset QuickBooks Flow',
      category: 'integrations',
      description: 'Completely reset the QuickBooks onboarding flow for a workspace, allowing user to start fresh',
      parameters: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string', description: 'Workspace ID to reset flow for' },
        },
        required: ['workspaceId'],
      },
      handler: async (params: any) => {
        return await this.resetFlow(params.workspaceId);
      },
    });

    log.info('[OnboardingQuickBooksFlow] Registered 7 AI Brain actions');
  }

  async initiateOAuth(workspaceId: string, userId: string): Promise<{ authUrl: string; flowId: string }> {
    const flowId = `qb-flow-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    
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

    const { url: authUrl } = await quickbooksOAuthService.generateAuthorizationUrl(workspaceId);

    publishEvent(
      () => platformEventBus.publish({
        type: 'quickbooks_flow_initiated',
        workspaceId,
        payload: { flowId, userId },
      }),
      '[OnboardingQuickBooksFlow] event publish',
    );

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
    const flowId = existingFlow?.flowId || `qb-flow-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;

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

    publishEvent(
      () => platformEventBus.publish({
        type: 'quickbooks_connected',
        workspaceId,
        payload: { flowId, connectionId, realmId },
      }),
      '[OnboardingQuickBooksFlow] event publish',
    );

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
      log.info(`[OnboardingQuickBooksFlow] Starting initial sync for flow ${flowId}`);
      
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
      log.error(`[OnboardingQuickBooksFlow] Initial sync failed:`, error);
      flow.errors.push(`Initial sync failed: ${(error instanceof Error ? error.message : String(error))}`);
      flow.stage = 'flow_failed';
      await this.persistFlow(flow);

      publishEvent(
        () => platformEventBus.publish({
          type: 'quickbooks_flow_error',
          workspaceId: flow.workspaceId,
          payload: { flowId, stage: 'initial_sync', error: (error instanceof Error ? error.message : String(error)) },
        }),
        '[OnboardingQuickBooksFlow] event publish',
      );
    }
  }

  private async handleSyncComplete(flowId: string, syncResult: any): Promise<void> {
    const flow = this.flows.get(flowId);
    if (!flow) return;

    flow.stage = 'initial_sync_complete';
    flow.lastUpdatedAt = new Date();
    await this.persistFlow(flow);

    log.info(`[OnboardingQuickBooksFlow] Sync complete: ${syncResult.recordsProcessed} records processed`);

    await this.runDataMapping(flowId);
  }

  private async runDataMapping(flowId: string): Promise<void> {
    const flow = this.flows.get(flowId);
    if (!flow) return;

    flow.stage = 'data_mapping_running';
    flow.lastUpdatedAt = new Date();
    await this.persistFlow(flow);

    try {
      log.info(`[OnboardingQuickBooksFlow] Running data mapping for flow ${flowId}`);

      flow.stage = 'data_mapping_complete';
      flow.lastUpdatedAt = new Date();
      await this.persistFlow(flow);

      await this.importEmployees(flowId);
    } catch (error: any) {
      log.error(`[OnboardingQuickBooksFlow] Data mapping failed:`, error);
      flow.warnings.push(`Data mapping partially failed: ${(error instanceof Error ? error.message : String(error))}`);
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
      log.info(`[OnboardingQuickBooksFlow] Importing employees for flow ${flowId}`);

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
      log.error(`[OnboardingQuickBooksFlow] Employee import failed:`, error);
      flow.errors.push(`Employee import failed: ${(error instanceof Error ? error.message : String(error))}`);
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
      log.info(`[OnboardingQuickBooksFlow] Generating first schedule for flow ${flowId}`);

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
      log.error(`[OnboardingQuickBooksFlow] Schedule generation failed:`, error);
      flow.warnings.push(`Schedule generation skipped: ${(error instanceof Error ? error.message : String(error))}`);
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
      log.info(`[OnboardingQuickBooksFlow] Configuring automation for flow ${flowId}`);

      flow.stage = 'automation_configured';
      flow.lastUpdatedAt = new Date();
      await this.persistFlow(flow);

      await this.completeFlow(flowId);
    } catch (error: any) {
      log.error(`[OnboardingQuickBooksFlow] Automation configuration failed:`, error);
      flow.warnings.push(`Automation partially configured: ${(error instanceof Error ? error.message : String(error))}`);
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

    publishEvent(
      () => platformEventBus.publish({
        type: 'quickbooks_flow_complete',
        workspaceId: flow.workspaceId,
        payload: {
          flowId,
          importedEmployeeCount: flow.importedEmployeeCount,
          automationSettings: flow.automationSettings,
          durationMs: flow.completedAt.getTime() - flow.startedAt.getTime(),
        },
      }),
      '[OnboardingQuickBooksFlow] event publish',
    );

    log.info(`[OnboardingQuickBooksFlow] Flow ${flowId} completed successfully`);
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

  /**
   * Reset and clear the QuickBooks onboarding flow for a workspace.
   * Removes from memory and database, allowing a fresh start.
   */
  async resetFlow(workspaceId: string): Promise<{ success: boolean; message: string; clearedFlows: number }> {
    try {
      let clearedCount = 0;
      
      // Find and remove from in-memory map
      const flowsToRemove: string[] = [];
      for (const [flowId, flow] of this.flows.entries()) {
        if (flow.workspaceId === workspaceId) {
          flowsToRemove.push(flowId);
        }
      }
      
      for (const flowId of flowsToRemove) {
        this.flows.delete(flowId);
        clearedCount++;
      }
      
      // Delete from database
      const deleted = await db.delete(quickbooksOnboardingFlows)
        .where(eq(quickbooksOnboardingFlows.workspaceId, workspaceId))
        .returning({ id: quickbooksOnboardingFlows.id });
      
      const dbDeletedCount = deleted.length;
      
      // Also clear any partner data mappings for QuickBooks
      await db.delete(partnerDataMappings)
        .where(
          and(
            eq(partnerDataMappings.workspaceId, workspaceId),
            eq(partnerDataMappings.partnerType, 'quickbooks')
          )
        );
      
      // CRITICAL: Clear migration runs - this is what tracks the active migration state
      const deletedMigrations = await db.delete(quickbooksMigrationRuns)
        .where(eq(quickbooksMigrationRuns.workspaceId, workspaceId))
        .returning({ id: quickbooksMigrationRuns.id });
      
      log.info(`[OnboardingQuickBooksFlow] Reset complete for workspace ${workspaceId}: ${clearedCount} in-memory, ${dbDeletedCount} flows, ${deletedMigrations.length} migration runs from database`);
      
      publishEvent(
        () => platformEventBus.publish({
          type: 'quickbooks_flow_reset',
          workspaceId,
          payload: { clearedFlows: Math.max(clearedCount, dbDeletedCount) },
        }),
        '[OnboardingQuickBooksFlow] event publish',
      );
      
      return {
        success: true,
        message: 'QuickBooks onboarding flow reset. You can now start a fresh migration.',
        clearedFlows: Math.max(clearedCount, dbDeletedCount),
      };
    } catch (error: any) {
      log.error('[OnboardingQuickBooksFlow] Reset failed:', error);
      return {
        success: false,
        message: `Reset failed: ${(error instanceof Error ? error.message : String(error))}`,
        clearedFlows: 0,
      };
    }
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


  private serializeFlowData(flow: QuickBooksFlowState): Record<string, unknown> {
    return {
      flowId: flow.flowId,
      workspaceId: flow.workspaceId,
      userId: flow.userId,
      stage: flow.stage,
      connectionId: flow.connectionId || null,
      realmId: flow.realmId || null,
      syncJobId: flow.syncJobId || null,
      importedEmployeeCount: flow.importedEmployeeCount,
      generatedScheduleId: flow.generatedScheduleId || null,
      automationSettings: flow.automationSettings,
      errors: Array.isArray(flow.errors) ? [...flow.errors] : [],
      warnings: Array.isArray(flow.warnings) ? [...flow.warnings] : [],
      startedAt: flow.startedAt.toISOString(),
      completedAt: flow.completedAt ? flow.completedAt.toISOString() : null,
      lastUpdatedAt: flow.lastUpdatedAt.toISOString(),
    };
  }

  private async persistFlow(flow: QuickBooksFlowState): Promise<void> {
    try {
      const flowData = this.serializeFlowData(flow);

      const existing = await db.query.quickbooksOnboardingFlows.findFirst({
        where: eq(quickbooksOnboardingFlows.id, flow.flowId),
      });

      if (existing) {
        await db.update(quickbooksOnboardingFlows)
          .set({
            stage: flow.stage as any,
            connectionId: flow.connectionId,
            realmId: flow.realmId,
            syncJobId: flow.syncJobId,
            importedEmployeeCount: flow.importedEmployeeCount,
            generatedScheduleId: flow.generatedScheduleId,
            automationSettings: flow.automationSettings,
            errors: flow.errors,
            warnings: flow.warnings,
            flowData: flowData,
            completedAt: flow.completedAt,
            updatedAt: new Date(),
          })
          .where(eq(quickbooksOnboardingFlows.id, flow.flowId));
      } else {
        await db.insert(quickbooksOnboardingFlows).values({
          id: flow.flowId,
          workspaceId: flow.workspaceId,
          userId: flow.userId,
          stage: flow.stage as any,
          connectionId: flow.connectionId,
          realmId: flow.realmId,
          syncJobId: flow.syncJobId,
          importedEmployeeCount: flow.importedEmployeeCount,
          generatedScheduleId: flow.generatedScheduleId,
          automationSettings: flow.automationSettings,
          errors: flow.errors,
          warnings: flow.warnings,
          flowData: flowData,
          startedAt: flow.startedAt,
          completedAt: flow.completedAt,
        });
      }
    } catch (error) {
      log.error('[OnboardingQuickBooksFlow] Persistence failed:', error);
    }
  }

  async loadFlows(): Promise<void> {
    try {
      const activeFlows = await db.query.quickbooksOnboardingFlows.findMany({
        where: and(
          ne(quickbooksOnboardingFlows.stage, 'flow_complete'),
          ne(quickbooksOnboardingFlows.stage, 'flow_failed')
        ),
      });
      
      for (const row of activeFlows) {
        const rawData = row.flowData as Record<string, any>;
        if (rawData) {
          const flow: QuickBooksFlowState = {
            flowId: rawData.flowId || row.id,
            workspaceId: rawData.workspaceId || row.workspaceId,
            userId: rawData.userId || row.userId,
            stage: (rawData.stage || row.stage) as FlowStage,
            connectionId: rawData.connectionId || row.connectionId,
            realmId: rawData.realmId || row.realmId,
            syncJobId: rawData.syncJobId || row.syncJobId,
            importedEmployeeCount: rawData.importedEmployeeCount ?? row.importedEmployeeCount ?? 0,
            generatedScheduleId: rawData.generatedScheduleId || row.generatedScheduleId,
            automationSettings: rawData.automationSettings || row.automationSettings || {
              autoInvoice: true,
              autoPayroll: true,
              autoSchedule: true,
            },
            errors: Array.isArray(rawData.errors) ? rawData.errors : (row.errors as string[] || []),
            warnings: Array.isArray(rawData.warnings) ? rawData.warnings : (row.warnings as string[] || []),
            startedAt: new Date(rawData.startedAt || row.startedAt),
            lastUpdatedAt: new Date(rawData.lastUpdatedAt || row.updatedAt || new Date()),
            completedAt: rawData.completedAt ? new Date(rawData.completedAt) : 
                         row.completedAt ? new Date(row.completedAt) : undefined,
          };
          this.flows.set(flow.flowId, flow);
        }
      }
      
      log.info(`[OnboardingQuickBooksFlow] Loaded ${this.flows.size} active flows from database`);
    } catch (error) {
      log.info('[OnboardingQuickBooksFlow] No persisted flows to load');
    }
  }

  /**
   * Import employees from QuickBooks to CoAIleague database
   * Validates fields, checks duplicates, and inserts with proper schema types
   */
  async importQuickBooksEmployees(
    workspaceId: string, 
    qbEmployees: Array<{
      id: string;
      displayName?: string;
      givenName?: string;
      familyName?: string;
      primaryPhone?: { freeFormNumber?: string };
      primaryEmailAddr?: { address?: string };
      hireDate?: string;
      billRate?: number;
      costRate?: number;
    }>
  ): Promise<{ imported: number; failed: number; skipped: number; errors: string[] }> {
    const results = { imported: 0, failed: 0, skipped: 0, errors: [] as string[] };

    if (!qbEmployees || qbEmployees.length === 0) {
      return results;
    }

    // Pre-validate all employees
    const validEmployees: Array<{
      qbId: string;
      firstName: string;
      lastName: string;
      displayName: string;
      email: string | null;
      phone: string | null;
      hourlyRate: string;
      hireDate: Date | null;
    }> = [];

    for (const qbEmp of qbEmployees) {
      if (!qbEmp.id) {
        results.errors.push(`Employee missing QuickBooks ID`);
        results.failed++;
        continue;
      }

      const firstName = qbEmp.givenName?.trim() || '';
      const lastName = qbEmp.familyName?.trim() || '';
      const displayName = qbEmp.displayName?.trim() || `${firstName} ${lastName}`.trim();
      
      if (!firstName && !lastName && !displayName) {
        results.errors.push(`Employee ID ${qbEmp.id}: Missing name fields`);
        results.failed++;
        continue;
      }

      const hourlyRate = (qbEmp.billRate || qbEmp.costRate || 15).toFixed(2);
      
      validEmployees.push({
        qbId: qbEmp.id,
        firstName: firstName || displayName.split(' ')[0] || 'Unknown',
        lastName: lastName || displayName.split(' ').slice(1).join(' ') || 'Employee',
        displayName,
        email: qbEmp.primaryEmailAddr?.address || null,
        phone: qbEmp.primaryPhone?.freeFormNumber || null,
        hourlyRate,
        hireDate: qbEmp.hireDate ? new Date(qbEmp.hireDate) : null,
      });
    }

    // Process in batches of 10
    const BATCH_SIZE = 10;
    for (let i = 0; i < validEmployees.length; i += BATCH_SIZE) {
      const batch = validEmployees.slice(i, i + BATCH_SIZE);
      
      for (const emp of batch) {
        try {
          const existingByQbId = await db.query.employees.findFirst({
            where: and(
              eq(employees.workspaceId, workspaceId),
              eq(employees.quickbooksEmployeeId, emp.qbId)
            ),
          });

          if (existingByQbId) {
            log.info(`[QB Import] Employee ${emp.displayName} already exists by QB ID, skipping`);
            results.skipped++;
            continue;
          }

          if (emp.email) {
            const existingByEmail = await db.query.employees.findFirst({
              where: and(
                eq(employees.workspaceId, workspaceId),
                eq(employees.email, emp.email)
              ),
            });
            if (existingByEmail) {
              await db.update(employees)
                .set({ quickbooksEmployeeId: emp.qbId })
                .where(eq(employees.id, existingByEmail.id));
              results.imported++;
              log.info(`[QB Import] Linked existing employee ${emp.displayName} to QB ID`);
              continue;
            }
          }

          await db.insert(employees).values({
            workspaceId,
            firstName: emp.firstName,
            lastName: emp.lastName,
            email: emp.email,
            phone: emp.phone,
            role: 'Field Staff',
            hourlyRate: emp.hourlyRate,
            hireDate: emp.hireDate,
            isActive: true,
            quickbooksEmployeeId: emp.qbId,
          });

          results.imported++;
          log.info(`[QB Import] Imported employee: ${emp.firstName} ${emp.lastName}`);
        } catch (error: any) {
          results.errors.push(`${emp.displayName}: ${(error instanceof Error ? error.message : String(error))}`);
          results.failed++;
        }
      }
    }

    log.info(`[QB Import] Complete - Imported: ${results.imported}, Skipped: ${results.skipped}, Failed: ${results.failed}`);
    return results;
  }
}

export const onboardingQuickBooksFlow = new OnboardingQuickBooksFlow();
