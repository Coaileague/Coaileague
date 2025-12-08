import { db } from '../../db';
import { 
  workspaceFeatureStates,
  workspaces,
  organizationOnboarding,
  users,
  supportSessionElevations,
  type WorkspaceFeatureState
} from '@shared/schema';
import { eq, and, gt, sql, or } from 'drizzle-orm';
import { creditsLedgerService } from './creditsLedgerService';
import { platformEventBus } from '../platformEventBus';

const SUPPORT_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];
const AI_SERVICE_IDS = ['trinity', 'helpai', 'bot', 'subagent'];

export type FeatureGateResult = {
  allowed: boolean;
  reason?: string;
  requiredAction?: 'purchase_credits' | 'complete_onboarding' | 'unlock_feature' | 'enter_code';
  creditsRequired?: number;
  currentBalance?: number;
  featureCategory?: 'trinity_command' | 'automation_action' | 'automation_cycle' | 'staged_publish' | 'ai_brain';
};

export interface FeatureDefinition {
  key: string;
  category: 'trinity_command' | 'automation_action' | 'automation_cycle' | 'staged_publish' | 'ai_brain';
  displayName: string;
  description?: string;
  creditsPerUse: number;
  requiresOnboarding: boolean;
  lockMessage?: string;
}

// Credit-based features - SEPARATE from subscription tiers
// These consume credits per action/cycle/event
const FEATURE_DEFINITIONS: Record<string, FeatureDefinition> = {
  // Trinity Quick Commands (per command execution)
  'trinity_quick_commands': {
    key: 'trinity_quick_commands',
    category: 'trinity_command',
    displayName: 'Trinity Quick Commands',
    description: 'AI-powered quick commands - 1 credit per command',
    creditsPerUse: 1,
    requiresOnboarding: true,
    lockMessage: 'Complete onboarding to unlock Trinity commands'
  },
  'trinity_complex_command': {
    key: 'trinity_complex_command',
    category: 'trinity_command',
    displayName: 'Trinity Complex Commands',
    description: 'Multi-step AI commands - 3 credits per command',
    creditsPerUse: 3,
    requiresOnboarding: true,
    lockMessage: 'Complete onboarding to unlock Trinity commands'
  },
  'trinity_batch_command': {
    key: 'trinity_batch_command',
    category: 'trinity_command',
    displayName: 'Trinity Batch Commands',
    description: 'Bulk operations - 5 credits per batch',
    creditsPerUse: 5,
    requiresOnboarding: true,
    lockMessage: 'Complete onboarding to unlock Trinity commands'
  },
  
  // Automation Actions (per action execution)
  'automation_action': {
    key: 'automation_action',
    category: 'automation_action',
    displayName: 'Automation Action',
    description: 'Single automated action - 1 credit per action',
    creditsPerUse: 1,
    requiresOnboarding: true,
    lockMessage: 'Complete onboarding to unlock automation'
  },
  'automation_scheduled_job': {
    key: 'automation_scheduled_job',
    category: 'automation_action',
    displayName: 'Scheduled Job Execution',
    description: 'Scheduled job run - 2 credits per execution',
    creditsPerUse: 2,
    requiresOnboarding: true,
    lockMessage: 'Complete onboarding to unlock automation'
  },
  'automation_webhook_trigger': {
    key: 'automation_webhook_trigger',
    category: 'automation_action',
    displayName: 'Webhook Trigger',
    description: 'Webhook-triggered automation - 1 credit per trigger',
    creditsPerUse: 1,
    requiresOnboarding: true,
    lockMessage: 'Complete onboarding to unlock automation'
  },
  
  // Automation Cycles (per cycle completion)
  'automation_cycle': {
    key: 'automation_cycle',
    category: 'automation_cycle',
    displayName: 'Automation Cycle',
    description: 'Complete automation cycle - 5 credits per cycle',
    creditsPerUse: 5,
    requiresOnboarding: true,
    lockMessage: 'Complete onboarding to unlock automation'
  },
  'automation_workflow': {
    key: 'automation_workflow',
    category: 'automation_cycle',
    displayName: 'Workflow Execution',
    description: 'Multi-step workflow - 10 credits per workflow',
    creditsPerUse: 10,
    requiresOnboarding: true,
    lockMessage: 'Complete onboarding to unlock automation'
  },
  
  // Staged Publish Events (per publish)
  'staged_code_publish': {
    key: 'staged_code_publish',
    category: 'staged_publish',
    displayName: 'Staged Code Publish',
    description: 'Publish staged code changes - 3 credits per publish',
    creditsPerUse: 3,
    requiresOnboarding: true,
    lockMessage: 'Complete onboarding to unlock code publishing'
  },
  'staged_config_publish': {
    key: 'staged_config_publish',
    category: 'staged_publish',
    displayName: 'Staged Config Publish',
    description: 'Publish configuration changes - 2 credits per publish',
    creditsPerUse: 2,
    requiresOnboarding: true,
    lockMessage: 'Complete onboarding to unlock config publishing'
  },
  
  // AI Brain Features (per use)
  'helpai_chat': {
    key: 'helpai_chat',
    category: 'ai_brain',
    displayName: 'HelpAI Chat',
    description: 'AI chat message - 1 credit per message',
    creditsPerUse: 1,
    requiresOnboarding: false,
    lockMessage: 'Purchase credits to use HelpAI'
  },
  'ai_scheduling': {
    key: 'ai_scheduling',
    category: 'ai_brain',
    displayName: 'AI Smart Scheduling',
    description: 'AI schedule generation - 5 credits per generation',
    creditsPerUse: 5,
    requiresOnboarding: true,
    lockMessage: 'Complete onboarding for AI scheduling'
  },
  'document_extraction': {
    key: 'document_extraction',
    category: 'ai_brain',
    displayName: 'Document Extraction',
    description: 'AI document extraction - 3 credits per document',
    creditsPerUse: 3,
    requiresOnboarding: true,
    lockMessage: 'Complete onboarding for document extraction'
  },
  'ai_reporting': {
    key: 'ai_reporting',
    category: 'ai_brain',
    displayName: 'AI Reports',
    description: 'AI report generation - 4 credits per report',
    creditsPerUse: 4,
    requiresOnboarding: true,
    lockMessage: 'Complete onboarding for AI reports'
  },
  'sentiment_analysis': {
    key: 'sentiment_analysis',
    category: 'ai_brain',
    displayName: 'Sentiment Analysis',
    description: 'AI sentiment analysis - 2 credits per analysis',
    creditsPerUse: 2,
    requiresOnboarding: true,
    lockMessage: 'Complete onboarding for sentiment analysis'
  },
  'expense_categorization': {
    key: 'expense_categorization',
    category: 'ai_brain',
    displayName: 'Expense Categorization',
    description: 'AI expense categorization - 2 credits per batch',
    creditsPerUse: 2,
    requiresOnboarding: true,
    lockMessage: 'Complete onboarding for expense categorization'
  },
  'dynamic_pricing': {
    key: 'dynamic_pricing',
    category: 'ai_brain',
    displayName: 'Dynamic Pricing Analysis',
    description: 'AI pricing analysis - 5 credits per analysis',
    creditsPerUse: 5,
    requiresOnboarding: true,
    lockMessage: 'Complete onboarding for dynamic pricing'
  }
};

class FeatureGateService {
  private static instance: FeatureGateService;
  
  private constructor() {}
  
  public static getInstance(): FeatureGateService {
    if (!FeatureGateService.instance) {
      FeatureGateService.instance = new FeatureGateService();
    }
    return FeatureGateService.instance;
  }

  async canUseFeature(
    featureKey: string,
    workspaceId: string,
    userId: string,
    sessionId?: string
  ): Promise<FeatureGateResult> {
    const isSupportBypass = await this.checkSupportRoleBypass(userId, sessionId);
    if (isSupportBypass) {
      console.log(`[FeatureGate] Support role bypass for ${userId} using ${featureKey}`);
      return { allowed: true, reason: 'support_role_bypass' };
    }

    const isAiService = AI_SERVICE_IDS.some(id => userId.toLowerCase().includes(id));
    if (isAiService) {
      const hasElevation = await this.checkElevatedSession(userId, sessionId);
      if (hasElevation) {
        console.log(`[FeatureGate] AI service bypass for ${userId} using ${featureKey}`);
        return { allowed: true, reason: 'ai_service_bypass' };
      }
    }

    const featureDef = FEATURE_DEFINITIONS[featureKey];
    if (!featureDef) {
      console.log(`[FeatureGate] Unknown feature ${featureKey}, allowing by default`);
      return { allowed: true };
    }

    const [workspace] = await db.select().from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      return { allowed: false, reason: 'Workspace not found' };
    }

    if (featureDef.requiresOnboarding) {
      const onboardingResult = await this.checkOnboardingComplete(workspaceId);
      if (!onboardingResult.complete) {
        return {
          allowed: false,
          reason: featureDef.lockMessage || 'Complete onboarding to unlock this feature',
          requiredAction: 'complete_onboarding'
        };
      }
    }

    // Note: Credits are SEPARATE from subscription tiers
    // Subscription tier controls platform limits (users, storage, etc.)
    // Credits control per-action consumption for Trinity/automation/AI features

    const featureState = await this.getFeatureState(workspaceId, featureKey);
    if (featureState && !featureState.isUnlocked) {
      if (featureState.expiresAt && new Date(featureState.expiresAt) < new Date()) {
        return {
          allowed: false,
          reason: 'Feature access has expired',
          requiredAction: 'unlock_feature'
        };
      }
    }

    // All features in this system consume credits per use
    if (featureDef.creditsPerUse > 0) {
      const creditsNeeded = await creditsLedgerService.getActionCreditCost(
        featureKey,
        workspace.subscriptionTier || 'free'
      ) || featureDef.creditsPerUse;

      const hasCredits = await creditsLedgerService.hasEnoughCredits(workspaceId, creditsNeeded);
      
      if (!hasCredits) {
        const balance = await creditsLedgerService.getBalance(workspaceId);
        return {
          allowed: false,
          reason: `Insufficient credits. Need ${creditsNeeded}, have ${balance}`,
          requiredAction: 'purchase_credits',
          creditsRequired: creditsNeeded,
          currentBalance: balance
        };
      }
    }

    return { allowed: true };
  }

  async consumeCreditsForFeature(
    featureKey: string,
    workspaceId: string,
    userId: string,
    sessionId?: string,
    actionId?: string
  ): Promise<{ success: boolean; creditsUsed: number; error?: string }> {
    const gateResult = await this.canUseFeature(featureKey, workspaceId, userId, sessionId);
    
    if (!gateResult.allowed) {
      return {
        success: false,
        creditsUsed: 0,
        error: gateResult.reason
      };
    }

    if (gateResult.reason === 'support_role_bypass' || gateResult.reason === 'ai_service_bypass') {
      console.log(`[FeatureGate] Bypass active, no credits consumed for ${featureKey}`);
      return { success: true, creditsUsed: 0 };
    }

    const featureDef = FEATURE_DEFINITIONS[featureKey];
    if (!featureDef || featureDef.creditsPerUse <= 0) {
      return { success: true, creditsUsed: 0 };
    }

    const [workspace] = await db.select().from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    const creditsNeeded = await creditsLedgerService.getActionCreditCost(
      featureKey,
      workspace?.subscriptionTier || 'free'
    ) || featureDef.creditsPerUse;

    const deductResult = await creditsLedgerService.deductCredits(
      workspaceId,
      creditsNeeded,
      featureKey,
      userId,
      actionId
    );

    if (!deductResult.success) {
      return {
        success: false,
        creditsUsed: 0,
        error: deductResult.error
      };
    }

    return {
      success: true,
      creditsUsed: deductResult.creditsDeducted
    };
  }

  private async checkSupportRoleBypass(userId: string, sessionId?: string): Promise<boolean> {
    const [user] = await db.select().from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) return false;

    const platformRole = (user as any).platformRole;
    if (platformRole && SUPPORT_ROLES.includes(platformRole)) {
      return true;
    }

    if (sessionId) {
      const [elevation] = await db.select().from(supportSessionElevations)
        .where(and(
          eq(supportSessionElevations.userId, userId),
          eq(supportSessionElevations.sessionId, sessionId),
          eq(supportSessionElevations.isActive, true),
          gt(supportSessionElevations.expiresAt, new Date())
        ))
        .limit(1);

      if (elevation && SUPPORT_ROLES.includes(elevation.platformRole)) {
        return true;
      }
    }

    return false;
  }

  private async checkElevatedSession(userId: string, sessionId?: string): Promise<boolean> {
    if (!sessionId) return false;

    const [elevation] = await db.select().from(supportSessionElevations)
      .where(and(
        eq(supportSessionElevations.userId, userId),
        eq(supportSessionElevations.sessionId, sessionId),
        eq(supportSessionElevations.isActive, true),
        gt(supportSessionElevations.expiresAt, new Date())
      ))
      .limit(1);

    return !!elevation;
  }

  private async checkOnboardingComplete(workspaceId: string): Promise<{ complete: boolean; progress: number }> {
    const [onboarding] = await db.select().from(organizationOnboarding)
      .where(eq(organizationOnboarding.workspaceId, workspaceId))
      .limit(1);

    if (!onboarding) {
      return { complete: false, progress: 0 };
    }

    // Calculate progress based on completed steps
    const completedSteps = [
      onboarding.step1CompanyInfo,
      onboarding.step2BillingInfo,
      onboarding.step3RolesPermissions,
      onboarding.step4InviteEmployees,
      onboarding.step5AddCustomers,
      onboarding.step6ConfigurePayroll,
      onboarding.step7SetupIntegrations,
      onboarding.step8ReviewLaunch
    ].filter(Boolean).length;

    const totalSteps = onboarding.totalSteps ?? 8;
    const progress = Math.round((completedSteps / totalSteps) * 100);

    return {
      complete: onboarding.isCompleted ?? false,
      progress
    };
  }

  private checkTierRequirement(currentTier: string, requiredTier: string): { allowed: boolean } {
    const tierHierarchy = ['free', 'starter', 'professional', 'enterprise'];
    const currentIndex = tierHierarchy.indexOf(currentTier.toLowerCase());
    const requiredIndex = tierHierarchy.indexOf(requiredTier.toLowerCase());

    return { allowed: currentIndex >= requiredIndex };
  }

  private async getFeatureState(workspaceId: string, featureKey: string): Promise<WorkspaceFeatureState | null> {
    const [state] = await db.select().from(workspaceFeatureStates)
      .where(and(
        eq(workspaceFeatureStates.workspaceId, workspaceId),
        eq(workspaceFeatureStates.featureKey, featureKey)
      ))
      .limit(1);

    return state || null;
  }

  async unlockFeature(
    workspaceId: string,
    featureKey: string,
    unlockMethod: 'onboarding' | 'purchase' | 'tier' | 'code' | 'migration' | 'trial',
    userId: string,
    expiresAt?: Date
  ): Promise<boolean> {
    try {
      const existingState = await this.getFeatureState(workspaceId, featureKey);
      const featureDef = FEATURE_DEFINITIONS[featureKey];

      if (existingState) {
        await db.update(workspaceFeatureStates)
          .set({
            isUnlocked: true,
            unlockMethod,
            unlockedAt: new Date(),
            unlockedBy: userId,
            expiresAt,
            updatedAt: new Date()
          })
          .where(eq(workspaceFeatureStates.id, existingState.id));
      } else {
        await db.insert(workspaceFeatureStates).values({
          workspaceId,
          featureKey,
          featureCategory: featureDef?.category || 'ai_brain',
          isUnlocked: true,
          unlockMethod,
          unlockedAt: new Date(),
          unlockedBy: userId,
          expiresAt,
          creditsPerUse: featureDef?.creditsPerUse ?? 1,
          showLockIcon: false,
          lockMessage: featureDef?.lockMessage
        });
      }

      console.log(`[FeatureGate] Unlocked feature ${featureKey} for workspace ${workspaceId} via ${unlockMethod}`);

      platformEventBus.publish({
        type: 'feature_released',
        category: 'feature',
        title: 'Feature Unlocked',
        description: `Feature ${featureKey} has been unlocked`,
        metadata: { workspaceId, featureKey, unlockMethod }
      });

      return true;
    } catch (error) {
      console.error('[FeatureGate] Error unlocking feature:', error);
      return false;
    }
  }

  async lockFeature(workspaceId: string, featureKey: string, reason?: string): Promise<boolean> {
    try {
      const existingState = await this.getFeatureState(workspaceId, featureKey);

      if (existingState) {
        await db.update(workspaceFeatureStates)
          .set({
            isUnlocked: false,
            showLockIcon: true,
            lockMessage: reason,
            updatedAt: new Date()
          })
          .where(eq(workspaceFeatureStates.id, existingState.id));

        console.log(`[FeatureGate] Locked feature ${featureKey} for workspace ${workspaceId}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error('[FeatureGate] Error locking feature:', error);
      return false;
    }
  }

  async getWorkspaceFeatureStates(workspaceId: string): Promise<WorkspaceFeatureState[]> {
    return db.select().from(workspaceFeatureStates)
      .where(eq(workspaceFeatureStates.workspaceId, workspaceId));
  }

  async unlockAllFeaturesForOnboarding(workspaceId: string, userId: string): Promise<void> {
    const featuresToUnlock = Object.values(FEATURE_DEFINITIONS)
      .filter(f => f.requiresOnboarding)
      .map(f => f.key);

    for (const featureKey of featuresToUnlock) {
      await this.unlockFeature(workspaceId, featureKey, 'onboarding', userId);
    }

    // Mark onboarding as completed
    await db.update(organizationOnboarding)
      .set({
        isCompleted: true,
        completedAt: new Date(),
        completedBy: userId,
        updatedAt: new Date()
      })
      .where(eq(organizationOnboarding.workspaceId, workspaceId));

    console.log(`[FeatureGate] Unlocked all onboarding-gated features for workspace ${workspaceId}`);
  }

  getFeatureDefinitions(): Record<string, FeatureDefinition> {
    return FEATURE_DEFINITIONS;
  }

  getFeatureDefinition(key: string): FeatureDefinition | undefined {
    return FEATURE_DEFINITIONS[key];
  }
}

export const featureGateService = FeatureGateService.getInstance();
