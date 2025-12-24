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

import { helpaiOrchestrator } from '../helpai/helpaiActionOrchestrator';

import { onboardingStateMachine, registerOnboardingActions } from './onboardingStateMachine';
import { approvalGateEnforcementService, registerApprovalGateActions } from './approvalGateEnforcement';
import { crossDomainExceptionService, registerExceptionActions } from './crossDomainExceptionService';
import { notificationAcknowledgmentService, registerNotificationAckActions } from './notificationAcknowledgmentService';
import { scheduleLifecycleOrchestrator, registerScheduleLifecycleActions } from './scheduleLifecycleOrchestrator';
import { onboardingQuickBooksFlow } from './onboardingQuickBooksFlow';
import { automationTriggerService } from './automationTriggerService';

export {
  onboardingStateMachine,
  approvalGateEnforcementService,
  crossDomainExceptionService,
  notificationAcknowledgmentService,
  scheduleLifecycleOrchestrator,
  onboardingQuickBooksFlow,
  automationTriggerService,
};

export function initializeOrchestrationServices(): void {
  console.log('[Orchestration] Initializing workflow orchestration services...');

  registerOnboardingActions(helpaiOrchestrator);
  registerApprovalGateActions(helpaiOrchestrator);
  registerExceptionActions(helpaiOrchestrator);
  registerNotificationAckActions(helpaiOrchestrator);
  registerScheduleLifecycleActions(helpaiOrchestrator);

  onboardingQuickBooksFlow.loadFlows();
  automationTriggerService.loadTriggers();
  
  console.log('[Orchestration] All orchestration services initialized');
  console.log('[Orchestration] Services: Onboarding, Approval Gates, Exceptions, Notifications, Schedule Lifecycle, QuickBooks Flow, Automation Triggers');
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
  console.log('[Orchestration] Shutting down orchestration services...');
  
  onboardingStateMachine.shutdown();
  approvalGateEnforcementService.shutdown();
  crossDomainExceptionService.shutdown();
  notificationAcknowledgmentService.shutdown();
  scheduleLifecycleOrchestrator.shutdown();
  automationTriggerService.shutdown();
  
  console.log('[Orchestration] All orchestration services shut down');
}
