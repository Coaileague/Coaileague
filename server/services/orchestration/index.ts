/**
 * Orchestration Services Index
 * 
 * Central export and initialization for all workflow/pipeline orchestration services:
 * - Onboarding State Machine
 * - Approval Gate Enforcement
 * - Cross-Domain Exception Service
 * - Notification Acknowledgment Service
 * - Schedule Lifecycle Orchestrator
 */

import { helpaiOrchestrator } from '../helpai/platformActionHub';
import { platformEventBus, PlatformEvent } from '../platformEventBus';

import { onboardingStateMachine, registerOnboardingActions } from './onboardingStateMachine';
import { approvalGateEnforcementService, registerApprovalGateActions } from './approvalGateEnforcement';
import { crossDomainExceptionService, registerExceptionActions } from './crossDomainExceptionService';
import { notificationAcknowledgmentService, registerNotificationAckActions } from './notificationAcknowledgmentService';
import { scheduleLifecycleOrchestrator, registerScheduleLifecycleActions } from './scheduleLifecycleOrchestrator';
import { onboardingQuickBooksFlow } from './onboardingQuickBooksFlow';
import { automationTriggerService } from './automationTriggerService';
import { automationExecutionTracker, registerExecutionTrackerActions } from './automationExecutionTracker';
import { policyDecisionPoint } from '../uacp/policyDecisionPoint';

export {
  onboardingStateMachine,
  approvalGateEnforcementService,
  crossDomainExceptionService,
  notificationAcknowledgmentService,
  scheduleLifecycleOrchestrator,
  onboardingQuickBooksFlow,
  automationTriggerService,
  automationExecutionTracker,
};

export { orchestratedPayroll, orchestratedDocumentExtraction, executeWithEscalation } from './orchestratedBusinessOps';
export {
  withRetry,
  withPipelineGuard,
  notifyWorkspaceFailure,
  classifyPipelineError,
  publishEvent,
} from './pipelineErrorHandler';
import { createLogger } from '../../lib/logger';
const log = createLogger('orchestrationIndex');

export type { ClassifiedError, PipelineErrorCode, PipelineGuardContext, PipelineGuardResult, RetryOptions } from './pipelineErrorHandler';

export async function initializeOrchestrationServices(): Promise<void> {
  log.info('[Orchestration] Initializing workflow orchestration services...');

  registerOnboardingActions(helpaiOrchestrator);
  registerApprovalGateActions(helpaiOrchestrator);
  registerExceptionActions(helpaiOrchestrator);
  registerNotificationAckActions(helpaiOrchestrator);
  registerScheduleLifecycleActions(helpaiOrchestrator);
  registerExecutionTrackerActions(helpaiOrchestrator);

  onboardingQuickBooksFlow.loadFlows();
  automationTriggerService.loadTriggers();
  
  await policyDecisionPoint.seedIntegrationPolicies();
  
  // Subscribe to schedule import/analysis events for Trinity processing
  registerScheduleAnalysisSubscribers();
  
  log.info('[Orchestration] All orchestration services initialized');
  log.info('[Orchestration] Services: Onboarding, Approval Gates, Exceptions, Notifications, Schedule Lifecycle, QuickBooks Flow, Automation Triggers, Execution Tracker, ABAC Policies');
}

/**
 * Register subscribers for schedule import and analysis events
 * These events trigger Trinity AI to analyze imported historical data
 */
function registerScheduleAnalysisSubscribers(): void {
  // Handle prior schedules imported event
  platformEventBus.subscribe('prior_schedules_imported', {
    name: 'ScheduleAnalysis-PriorImport',
    handler: async (event: PlatformEvent) => {
      log.info(`[ScheduleAnalysis] Processing prior_schedules_imported event:`, {
        workspaceId: event.workspaceId,
        importedCount: event.metadata?.importedCount,
        dateRange: event.metadata?.dateRange,
      });
      
      // Queue schedule pattern analysis for Trinity
      // This will be picked up by the automation trigger service or scheduled job
      if (!event.workspaceId) {
        log.warn('[ScheduleAnalysis] prior_import event missing workspaceId — skipping pattern analysis');
        return;
      }
      await scheduleLifecycleOrchestrator.queuePatternAnalysis({
        workspaceId: event.workspaceId,
        source: 'prior_import',
        shiftCount: event.metadata?.importedCount || 0,
        dateRange: event.metadata?.dateRange,
        priority: event.metadata?.triggerPreBuild ? 'high' : 'normal',
      });
      
      log.info(`[ScheduleAnalysis] Pattern analysis queued for workspace ${event.workspaceId}`);
    },
  });

  // Handle schedule analysis request event
  platformEventBus.subscribe('schedule_analysis_requested', {
    name: 'ScheduleAnalysis-AnalysisRequest',
    handler: async (event: PlatformEvent) => {
      log.info(`[ScheduleAnalysis] Processing schedule_analysis_requested event:`, {
        workspaceId: event.workspaceId,
        shiftCount: event.metadata?.shiftCount,
        preBuildWeeks: event.metadata?.preBuildWeeks,
      });
      
      // Queue schedule pattern analysis for Trinity
      if (!event.workspaceId) {
        log.warn('[ScheduleAnalysis] manual_request event missing workspaceId — skipping pattern analysis');
        return;
      }
      await scheduleLifecycleOrchestrator.queuePatternAnalysis({
        workspaceId: event.workspaceId,
        source: 'manual_request',
        shiftCount: event.metadata?.shiftCount || 0,
        lookbackDays: event.metadata?.lookbackDays,
        preBuildWeeks: event.metadata?.preBuildWeeks,
        autoGenerateSchedules: event.metadata?.autoGenerateSchedules,
        priority: 'high',
      });
      
      log.info(`[ScheduleAnalysis] Analysis queued for workspace ${event.workspaceId}`);
    },
  });

  log.info('[ScheduleAnalysis] Registered 2 schedule analysis event subscribers');
}

export function getOrchestrationStats(): {
  onboarding: ReturnType<typeof onboardingStateMachine.getStats>;
  approvals: ReturnType<typeof approvalGateEnforcementService.getStats>;
  exceptions: ReturnType<typeof crossDomainExceptionService.getStats>;
  notifications: ReturnType<typeof notificationAcknowledgmentService.getStats>;
  schedules: ReturnType<typeof scheduleLifecycleOrchestrator.getStats>;
} {
  return {
    onboarding: onboardingStateMachine.getStats(),
    approvals: approvalGateEnforcementService.getStats(),
    exceptions: crossDomainExceptionService.getStats(),
    notifications: notificationAcknowledgmentService.getStats(),
    schedules: scheduleLifecycleOrchestrator.getStats(),
  };
}

export function shutdownOrchestrationServices(): void {
  log.info('[Orchestration] Shutting down orchestration services...');
  
  onboardingStateMachine.shutdown();
  approvalGateEnforcementService.shutdown();
  crossDomainExceptionService.shutdown();
  notificationAcknowledgmentService.shutdown();
  scheduleLifecycleOrchestrator.shutdown();
  automationTriggerService.shutdown();
  
  log.info('[Orchestration] All orchestration services shut down');
}
