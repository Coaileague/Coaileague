/**
 * Unified Onboarding State Machine
 * 
 * Manages the complete onboarding lifecycle for organizations and workspaces:
 * 1. Organization creation
 * 2. Workspace provisioning
 * 3. RBAC seeding
 * 4. Billing setup
 * 5. Compliance prerequisites
 * 6. Integration connections
 * 7. Employee import
 * 8. First schedule creation
 * 
 * Provides persistent checklist tracking and HelpAI-driven handoff
 */

import { db } from '../../db';
import { workspaceOnboardingStates } from '@shared/schema';
import { sql } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import { helpaiOrchestrator } from '../helpai/platformActionHub';
import { universalAudit, AUDIT_ACTIONS } from '../universalAuditService';
import { typedQuery } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('onboardingStateMachine');


export type OnboardingStep = 
  | 'org_created'
  | 'workspace_provisioned'
  | 'owner_profile_complete'
  | 'rbac_seeded'
  | 'billing_setup'
  | 'payment_method_added'
  | 'compliance_acknowledged'
  | 'integrations_connected'
  | 'employees_imported'
  | 'first_schedule_created'
  | 'onboarding_complete';

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'stalled' | 'abandoned';

export interface OnboardingChecklistItem {
  step: OnboardingStep;
  label: string;
  description: string;
  required: boolean;
  completed: boolean;
  completedAt?: Date;
  completedBy?: string;
  metadata?: Record<string, unknown>;
  order: number;
}

export interface OnboardingState {
  workspaceId: string;
  organizationId: string;
  status: OnboardingStatus;
  currentStep: OnboardingStep;
  checklist: OnboardingChecklistItem[];
  startedAt: Date;
  completedAt?: Date;
  lastActivityAt: Date;
  assignedTo?: string;
  helpaiSessionId?: string;
  stalledReason?: string;
  completionPercentage: number;
}

const DEFAULT_CHECKLIST: Omit<OnboardingChecklistItem, 'completed' | 'completedAt' | 'completedBy'>[] = [
  { step: 'org_created', label: 'Organization Created', description: 'Your organization has been registered', required: true, order: 1 },
  { step: 'workspace_provisioned', label: 'Workspace Ready', description: 'Your workspace environment is set up', required: true, order: 2 },
  { step: 'owner_profile_complete', label: 'Owner Profile', description: 'Complete your admin profile with contact details', required: true, order: 3 },
  { step: 'rbac_seeded', label: 'Roles Configured', description: 'Default roles and permissions are configured', required: true, order: 4 },
  { step: 'billing_setup', label: 'Billing Plan Selected', description: 'Choose your subscription plan', required: true, order: 5 },
  { step: 'payment_method_added', label: 'Payment Method', description: 'Add a payment method for billing', required: true, order: 6 },
  { step: 'compliance_acknowledged', label: 'Terms Accepted', description: 'Review and accept compliance requirements', required: true, order: 7 },
  { step: 'integrations_connected', label: 'Integrations Setup', description: 'Connect payroll, accounting, or HR systems', required: false, order: 8 },
  { step: 'employees_imported', label: 'Team Added', description: 'Import or add your team members', required: false, order: 9 },
  { step: 'first_schedule_created', label: 'First Schedule', description: 'Create your first work schedule', required: false, order: 10 },
  { step: 'onboarding_complete', label: 'All Set!', description: 'Onboarding complete - you\'re ready to go', required: true, order: 11 },
];

class OnboardingStateMachine {
  private states = new Map<string, OnboardingState>();
  private stalledCheckInterval: NodeJS.Timeout | null = null;
  private readonly STALLED_THRESHOLD_HOURS = 24;
  private readonly DEADLINE_DAYS = 15;
  private readonly DEADLINE_WARNING_DAYS = 12;

  constructor() {
    this.stalledCheckInterval = setInterval(() => {
      this.checkForStalledOnboardings();
      this.enforceOnboardingDeadlines();
    }, 3600000);
  }

  async initializeOnboarding(params: {
    workspaceId: string;
    organizationId: string;
    ownerId: string;
  }): Promise<OnboardingState> {
    const { workspaceId, organizationId, ownerId } = params;

    const checklist: OnboardingChecklistItem[] = DEFAULT_CHECKLIST.map(item => ({
      ...item,
      completed: false,
    }));

    checklist[0].completed = true;
    checklist[0].completedAt = new Date();
    checklist[0].completedBy = ownerId;

    const state: OnboardingState = {
      workspaceId,
      organizationId,
      status: 'in_progress',
      currentStep: 'workspace_provisioned',
      checklist,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      assignedTo: ownerId,
      completionPercentage: this.calculateCompletionPercentage(checklist),
    };

    this.states.set(workspaceId, state);

    await this.persistState(state);

    platformEventBus.publish({
      type: 'onboarding_started',
      workspaceId,
      payload: {
        organizationId,
        ownerId,
        checklist: state.checklist,
      },
      metadata: { source: 'OnboardingStateMachine' },
    }).catch((err) => log.warn('[OnboardingStateMachine] Fire-and-forget notification failed:', err));

    universalAudit.log({
      workspaceId,
      actorId: ownerId,
      actorType: 'user',
      action: AUDIT_ACTIONS.ONBOARDING_INITIALIZED,
      entityType: 'workspace',
      entityId: workspaceId,
      entityName: `Onboarding: ${organizationId}`,
      changeType: 'create',
      metadata: { organizationId, totalSteps: state.checklist.length, requiredSteps: state.checklist.filter(i => i.required).length },
    }).catch((err) => log.warn('[OnboardingStateMachine] Fire-and-forget notification failed:', err));

    log.info(`[OnboardingStateMachine] Initialized onboarding for workspace ${workspaceId}`);
    return state;
  }

  async completeStep(params: {
    workspaceId: string;
    step: OnboardingStep;
    userId: string;
    metadata?: Record<string, unknown>;
  }): Promise<OnboardingState | null> {
    const { workspaceId, step, userId, metadata } = params;

    let state = this.states.get(workspaceId);
    if (!state) {
      state = await this.loadState(workspaceId);
      if (!state) {
        log.warn(`[OnboardingStateMachine] No onboarding state found for workspace ${workspaceId}`);
        return null;
      }
    }

    const itemIndex = state.checklist.findIndex(item => item.step === step);
    if (itemIndex === -1) {
      log.warn(`[OnboardingStateMachine] Unknown step: ${step}`);
      return state;
    }

    if (state.checklist[itemIndex].completed) {
      return state;
    }

    state.checklist[itemIndex].completed = true;
    state.checklist[itemIndex].completedAt = new Date();
    state.checklist[itemIndex].completedBy = userId;
    if (metadata) {
      state.checklist[itemIndex].metadata = metadata;
    }

    state.lastActivityAt = new Date();
    state.completionPercentage = this.calculateCompletionPercentage(state.checklist);

    const nextIncomplete = state.checklist.find(item => !item.completed && item.required);
    if (nextIncomplete) {
      state.currentStep = nextIncomplete.step;
    } else {
      const allRequiredComplete = state.checklist
        .filter(item => item.required)
        .every(item => item.completed);

      if (allRequiredComplete) {
        state.status = 'completed';
        state.completedAt = new Date();
        state.currentStep = 'onboarding_complete';

        const finalItem = state.checklist.find(item => item.step === 'onboarding_complete');
        if (finalItem) {
          finalItem.completed = true;
          finalItem.completedAt = new Date();
          finalItem.completedBy = userId;
        }
      }
    }

    this.states.set(workspaceId, state);
    await this.persistState(state);

    platformEventBus.publish({
      type: 'onboarding_step_completed',
      workspaceId,
      payload: {
        step,
        completedBy: userId,
        completionPercentage: state.completionPercentage,
        isComplete: state.status === 'completed',
      },
      metadata: { source: 'OnboardingStateMachine' },
    }).catch((err) => log.warn('[OnboardingStateMachine] Fire-and-forget notification failed:', err));

    universalAudit.log({
      workspaceId,
      actorId: userId,
      actorType: 'user',
      action: AUDIT_ACTIONS.ONBOARDING_STEP_COMPLETED,
      entityType: 'onboarding_step',
      entityId: step,
      entityName: state.checklist[itemIndex]?.label || step,
      changeType: 'update',
      metadata: { step, completionPercentage: state.completionPercentage, isComplete: state.status === 'completed', ...(metadata || {}) },
    }).catch((err) => log.warn('[OnboardingStateMachine] Fire-and-forget notification failed:', err));

    if (state.status === 'completed') {
      await this.triggerOnboardingComplete(state);
    }

    return state;
  }

  async getState(workspaceId: string): Promise<OnboardingState | null> {
    let state = this.states.get(workspaceId);
    if (!state) {
      state = await this.loadState(workspaceId);
    }
    return state || null;
  }

  async getChecklist(workspaceId: string): Promise<OnboardingChecklistItem[] | null> {
    const state = await this.getState(workspaceId);
    return state?.checklist || null;
  }

  async requestHelpAIAssistance(params: {
    workspaceId: string;
    userId: string;
    currentStep: OnboardingStep;
    question?: string;
  }): Promise<{ sessionId: string; response: string }> {
    const { workspaceId, userId, currentStep, question } = params;

    const state = await this.getState(workspaceId);
    if (!state) {
      return {
        sessionId: '',
        response: 'No onboarding session found. Please start the onboarding process first.',
      };
    }

    const sessionId = `onboarding-${workspaceId}-${Date.now()}`;
    state.helpaiSessionId = sessionId;
    this.states.set(workspaceId, state);

    const stepInfo = state.checklist.find(item => item.step === currentStep);
    const contextMessage = question || `Help me complete: ${stepInfo?.label || currentStep}`;

    const response = await this.generateOnboardingGuidance(currentStep, contextMessage);

    universalAudit.log({
      workspaceId,
      actorId: userId,
      actorType: 'user',
      action: AUDIT_ACTIONS.ONBOARDING_HELP_REQUESTED,
      entityType: 'onboarding_session',
      entityId: sessionId,
      changeType: 'action',
      metadata: { currentStep, question: question || null },
    }).catch((err) => log.warn('[OnboardingStateMachine] Fire-and-forget notification failed:', err));

    return { sessionId, response };
  }

  private async generateOnboardingGuidance(step: OnboardingStep, context: string): Promise<string> {
    const guidance: Record<OnboardingStep, string> = {
      org_created: 'Your organization has been created successfully! Let\'s move on to setting up your workspace.',
      workspace_provisioned: 'Your workspace is ready. Next, complete your admin profile with your contact information.',
      owner_profile_complete: 'Great! Now let\'s configure the roles and permissions for your team.',
      rbac_seeded: 'Roles are set up. Time to choose your subscription plan.',
      billing_setup: 'You\'ve selected a plan. Please add a payment method to activate your subscription.',
      payment_method_added: 'Payment method added! Please review and accept the compliance requirements.',
      compliance_acknowledged: 'Compliance accepted. Would you like to connect any integrations like QuickBooks or your payroll system?',
      integrations_connected: 'Integrations connected! Now let\'s add your team members.',
      employees_imported: 'Team members added! Create your first schedule to complete onboarding.',
      first_schedule_created: 'Congratulations! Your first schedule is ready. Onboarding is complete!',
      onboarding_complete: 'You\'re all set! Your workspace is fully configured and ready to use.',
    };

    return guidance[step] || `Let me help you with: ${context}`;
  }

  private calculateCompletionPercentage(checklist: OnboardingChecklistItem[]): number {
    const requiredItems = checklist.filter(item => item.required);
    const completedRequired = requiredItems.filter(item => item.completed);
    return Math.round((completedRequired.length / requiredItems.length) * 100);
  }

  private async checkForStalledOnboardings(): Promise<void> {
    const now = new Date();
    const stalledThreshold = new Date(now.getTime() - this.STALLED_THRESHOLD_HOURS * 3600000);

    for (const [workspaceId, state] of this.states.entries()) {
      if (state.status === 'in_progress' && state.lastActivityAt < stalledThreshold) {
        state.status = 'stalled';
        state.stalledReason = `No activity for ${this.STALLED_THRESHOLD_HOURS} hours`;
        this.states.set(workspaceId, state);

        platformEventBus.publish({
          type: 'onboarding_stalled',
          workspaceId,
          payload: {
            currentStep: state.currentStep,
            completionPercentage: state.completionPercentage,
            lastActivityAt: state.lastActivityAt,
            stalledReason: state.stalledReason,
          },
          metadata: { source: 'OnboardingStateMachine', escalate: true },
        }).catch((err) => log.warn('[OnboardingStateMachine] Fire-and-forget notification failed:', err));

        universalAudit.log({
          workspaceId,
          actorType: 'system',
          action: AUDIT_ACTIONS.ONBOARDING_STALLED,
          entityType: 'workspace',
          entityId: workspaceId,
          changeType: 'update',
          metadata: { currentStep: state.currentStep, completionPercentage: state.completionPercentage, stalledReason: state.stalledReason },
        }).catch((err) => log.warn('[OnboardingStateMachine] Fire-and-forget notification failed:', err));

        log.info(`[OnboardingStateMachine] Onboarding stalled for workspace ${workspaceId}`);
      }
    }
  }

  private async enforceOnboardingDeadlines(): Promise<void> {
    const now = new Date();
    const deadlineMs = this.DEADLINE_DAYS * 24 * 3600000;
    const warningMs = this.DEADLINE_WARNING_DAYS * 24 * 3600000;

    for (const [workspaceId, state] of this.states.entries()) {
      if (state.status === 'completed' || state.status === 'abandoned') continue;

      const elapsed = now.getTime() - state.startedAt.getTime();
      const daysElapsed = Math.floor(elapsed / (24 * 3600000));

      if (elapsed >= deadlineMs) {
        state.status = 'abandoned';
        state.stalledReason = `Onboarding deadline exceeded (${this.DEADLINE_DAYS} days). Started ${daysElapsed} days ago with ${state.completionPercentage}% completion.`;
        this.states.set(workspaceId, state);

        platformEventBus.publish({
          type: 'onboarding_abandoned',
          workspaceId,
          payload: {
            currentStep: state.currentStep,
            completionPercentage: state.completionPercentage,
            startedAt: state.startedAt,
            daysElapsed,
            deadline: this.DEADLINE_DAYS,
          },
          metadata: { source: 'OnboardingStateMachine', escalate: true, priority: 'critical' },
        }).catch((err) => log.warn('[OnboardingStateMachine] Fire-and-forget notification failed:', err));

        universalAudit.log({
          workspaceId,
          actorType: 'system',
          action: AUDIT_ACTIONS.ONBOARDING_ABANDONED,
          entityType: 'workspace',
          entityId: workspaceId,
          changeType: 'update',
          metadata: { currentStep: state.currentStep, completionPercentage: state.completionPercentage, daysElapsed, deadline: this.DEADLINE_DAYS },
        }).catch((err) => log.warn('[OnboardingStateMachine] Fire-and-forget notification failed:', err));

        log.info(`[OnboardingStateMachine] Onboarding ABANDONED for workspace ${workspaceId} - ${daysElapsed} days elapsed, ${state.completionPercentage}% complete`);
      } else if (elapsed >= warningMs && state.status !== 'stalled') {
        const daysRemaining = this.DEADLINE_DAYS - daysElapsed;

        platformEventBus.publish({
          type: 'onboarding_deadline_warning',
          workspaceId,
          payload: {
            currentStep: state.currentStep,
            completionPercentage: state.completionPercentage,
            daysRemaining,
            daysElapsed,
          },
          metadata: { source: 'OnboardingStateMachine', escalate: true },
        }).catch((err) => log.warn('[OnboardingStateMachine] Fire-and-forget notification failed:', err));

        universalAudit.log({
          workspaceId,
          actorType: 'system',
          action: AUDIT_ACTIONS.ONBOARDING_DEADLINE_WARNING,
          entityType: 'workspace',
          entityId: workspaceId,
          changeType: 'action',
          metadata: { currentStep: state.currentStep, completionPercentage: state.completionPercentage, daysRemaining, daysElapsed },
        }).catch((err) => log.warn('[OnboardingStateMachine] Fire-and-forget notification failed:', err));

        log.info(`[OnboardingStateMachine] Onboarding deadline warning for workspace ${workspaceId} - ${daysRemaining} days remaining`);
      }
    }
  }

  private async triggerOnboardingComplete(state: OnboardingState): Promise<void> {
    const durationMs = state.completedAt ? state.completedAt.getTime() - state.startedAt.getTime() : 0;

    platformEventBus.publish({
      type: 'onboarding_completed',
      workspaceId: state.workspaceId,
      payload: {
        organizationId: state.organizationId,
        completedAt: state.completedAt,
        duration: durationMs,
      },
      metadata: { source: 'OnboardingStateMachine' },
    }).catch((err) => log.warn('[OnboardingStateMachine] Fire-and-forget notification failed:', err));

    universalAudit.log({
      workspaceId: state.workspaceId,
      actorId: state.assignedTo || null,
      actorType: 'user',
      action: AUDIT_ACTIONS.ONBOARDING_COMPLETED,
      entityType: 'workspace',
      entityId: state.workspaceId,
      changeType: 'update',
      metadata: { organizationId: state.organizationId, durationMs, completionPercentage: 100 },
    }).catch((err) => log.warn('[OnboardingStateMachine] Fire-and-forget notification failed:', err));

    log.info(`[OnboardingStateMachine] Onboarding completed for workspace ${state.workspaceId}`);
  }

  private async persistState(state: OnboardingState): Promise<void> {
    try {
      // Converted to Drizzle ORM: ON CONFLICT
      const stateJson = JSON.stringify(state);
      await db.insert(workspaceOnboardingStates).values({
        workspaceId: state.workspaceId,
        stateData: stateJson,
        updatedAt: sql`now()`,
      }).onConflictDoUpdate({
        target: workspaceOnboardingStates.workspaceId,
        set: { stateData: stateJson, updatedAt: sql`now()` },
      });
    } catch (error) {
      log.warn('[OnboardingStateMachine] Failed to persist state (table may not exist):', error);
    }
  }

  private async loadState(workspaceId: string): Promise<OnboardingState | null> {
    try {
      // CATEGORY C — Raw SQL retained: Orchestration state loader | Tables: workspace_onboarding_states | Verified: 2026-03-23
      const result = await (typedQuery as any)(`
        SELECT state_data FROM workspace_onboarding_states WHERE workspace_id = $1
      `, [workspaceId]);
      
      if (result && (result as any[]).length > 0) {
        const state = JSON.parse((result as any[])[0].state_data as string) as OnboardingState;
        this.states.set(workspaceId, state);
        return state;
      }
    } catch (error) {
      log.warn('[OnboardingStateMachine] Failed to load state:', error);
    }
    return null;
  }

  getStats(): {
    total: number;
    inProgress: number;
    completed: number;
    stalled: number;
    averageCompletion: number;
  } {
    const states = Array.from(this.states.values());
    const inProgress = states.filter(s => s.status === 'in_progress').length;
    const completed = states.filter(s => s.status === 'completed').length;
    const stalled = states.filter(s => s.status === 'stalled').length;
    const avgCompletion = states.length > 0
      ? Math.round(states.reduce((sum, s) => sum + s.completionPercentage, 0) / states.length)
      : 0;

    return {
      total: states.length,
      inProgress,
      completed,
      stalled,
      averageCompletion: avgCompletion,
    };
  }

  shutdown(): void {
    if (this.stalledCheckInterval) {
      clearInterval(this.stalledCheckInterval);
      this.stalledCheckInterval = null;
    }
  }
}

export const onboardingStateMachine = new OnboardingStateMachine();

export function registerOnboardingActions(orchestrator: typeof helpaiOrchestrator): void {
  orchestrator.registerAction({
    actionId: 'onboarding.initialize',
    name: 'Initialize Onboarding',
    category: 'automation',
    description: 'Start the onboarding process for a new workspace',
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request) => {
      const { organizationId } = request.payload || {};
      if (!request.workspaceId || !organizationId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'workspaceId and organizationId are required',
          executionTimeMs: 0,
        };
      }

      const state = await onboardingStateMachine.initializeOnboarding({
        workspaceId: request.workspaceId,
        organizationId,
        ownerId: request.userId,
      });

      return {
        success: true,
        actionId: request.actionId,
        message: 'Onboarding initialized',
        data: state,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'onboarding.complete_step',
    name: 'Complete Onboarding Step',
    category: 'automation',
    description: 'Mark an onboarding step as complete',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request) => {
      const { step, metadata } = request.payload || {};
      if (!request.workspaceId || !step) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'workspaceId and step are required',
          executionTimeMs: 0,
        };
      }

      const state = await onboardingStateMachine.completeStep({
        workspaceId: request.workspaceId,
        step,
        userId: request.userId,
        metadata,
      });

      return {
        success: !!state,
        actionId: request.actionId,
        message: state ? `Step ${step} completed` : 'Failed to complete step',
        data: state,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'onboarding.get_state',
    name: 'Get Onboarding State',
    category: 'automation',
    description: 'Get the current onboarding state and checklist',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
    handler: async (request) => {
      if (!request.workspaceId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'workspaceId is required',
          executionTimeMs: 0,
        };
      }

      const state = await onboardingStateMachine.getState(request.workspaceId);

      return {
        success: !!state,
        actionId: request.actionId,
        message: state ? 'Onboarding state retrieved' : 'No onboarding state found',
        data: state,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'onboarding.request_help',
    name: 'Request Onboarding Help',
    category: 'user_assistance',
    description: 'Get AI assistance with onboarding',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request) => {
      const { currentStep, question } = request.payload || {};
      if (!request.workspaceId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'workspaceId is required',
          executionTimeMs: 0,
        };
      }

      const result = await onboardingStateMachine.requestHelpAIAssistance({
        workspaceId: request.workspaceId,
        userId: request.userId,
        currentStep: currentStep || 'org_created',
        question,
      });

      return {
        success: true,
        actionId: request.actionId,
        message: 'Help provided',
        data: result,
        executionTimeMs: 0,
      };
    },
  });

  orchestrator.registerAction({
    actionId: 'onboarding.get_stats',
    name: 'Get Onboarding Stats',
    category: 'analytics',
    description: 'Get platform-wide onboarding statistics',
    requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (request) => {
      const stats = onboardingStateMachine.getStats();
      return {
        success: true,
        actionId: request.actionId,
        message: 'Onboarding stats retrieved',
        data: stats,
        executionTimeMs: 0,
      };
    },
  });

  log.info('[OnboardingStateMachine] Registered 5 AI Brain actions');
}
