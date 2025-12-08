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
  requiredAction?: 'purchase_credits' | 'upgrade_tier' | 'complete_onboarding' | 'unlock_feature' | 'enter_code';
  creditsRequired?: number;
  currentBalance?: number;
  requiredTier?: string;
  currentTier?: string;
};

export interface FeatureDefinition {
  key: string;
  category: 'ai_brain' | 'automation' | 'addon' | 'core';
  displayName: string;
  description?: string;
  requiresCredits: boolean;
  creditsPerUse: number;
  requiredTier?: string;
  requiresOnboarding: boolean;
  lockMessage?: string;
}

const FEATURE_DEFINITIONS: Record<string, FeatureDefinition> = {
  'trinity_quick_commands': {
    key: 'trinity_quick_commands',
    category: 'ai_brain',
    displayName: 'Trinity Quick Commands',
    description: 'AI-powered quick commands for automation',
    requiresCredits: true,
    creditsPerUse: 1,
    requiresOnboarding: true,
    lockMessage: 'Complete onboarding to unlock Trinity commands'
  },
  'ai_scheduling': {
    key: 'ai_scheduling',
    category: 'automation',
    displayName: 'AI Smart Scheduling',
    description: 'AI-optimized schedule generation',
    requiresCredits: true,
    creditsPerUse: 5,
    requiredTier: 'starter',
    requiresOnboarding: true,
    lockMessage: 'Upgrade to Starter tier for AI scheduling'
  },
  'automation_engine': {
    key: 'automation_engine',
    category: 'automation',
    displayName: 'Automation Engine',
    description: 'Automated workflow execution',
    requiresCredits: true,
    creditsPerUse: 2,
    requiresOnboarding: true,
    lockMessage: 'Complete onboarding to unlock automation'
  },
  'helpai_chat': {
    key: 'helpai_chat',
    category: 'ai_brain',
    displayName: 'HelpAI Chat',
    description: 'AI-powered help assistant',
    requiresCredits: true,
    creditsPerUse: 1,
    requiresOnboarding: false,
    lockMessage: 'Purchase credits to use HelpAI'
  },
  'document_extraction': {
    key: 'document_extraction',
    category: 'ai_brain',
    displayName: 'Document Extraction',
    description: 'AI-powered document data extraction',
    requiresCredits: true,
    creditsPerUse: 3,
    requiredTier: 'professional',
    requiresOnboarding: true,
    lockMessage: 'Upgrade to Professional tier for document extraction'
  },
  'ai_reporting': {
    key: 'ai_reporting',
    category: 'ai_brain',
    displayName: 'AI Reports',
    description: 'AI-generated business reports',
    requiresCredits: true,
    creditsPerUse: 4,
    requiredTier: 'professional',
    requiresOnboarding: true,
    lockMessage: 'Upgrade to Professional tier for AI reports'
  },
  'sentiment_analysis': {
    key: 'sentiment_analysis',
    category: 'ai_brain',
    displayName: 'Sentiment Analysis',
    description: 'AI text sentiment analysis',
    requiresCredits: true,
    creditsPerUse: 2,
    requiredTier: 'starter',
    requiresOnboarding: true,
    lockMessage: 'Upgrade to Starter tier for sentiment analysis'
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

    if (featureDef.requiredTier) {
      const tierCheck = this.checkTierRequirement(
        workspace.subscriptionTier || 'free',
        featureDef.requiredTier
      );
      if (!tierCheck.allowed) {
        return {
          allowed: false,
          reason: featureDef.lockMessage || `Upgrade to ${featureDef.requiredTier} tier`,
          requiredAction: 'upgrade_tier',
          requiredTier: featureDef.requiredTier,
          currentTier: workspace.subscriptionTier || 'free'
        };
      }
    }

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

    if (featureDef.requiresCredits) {
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
    if (!featureDef?.requiresCredits) {
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

    const automationUnlocked = onboarding.automationUnlocked ?? false;
    const progress = onboarding.progressPercentage ?? 0;

    return {
      complete: automationUnlocked || progress >= 100,
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
          featureCategory: featureDef?.category || 'core',
          isUnlocked: true,
          unlockMethod,
          unlockedAt: new Date(),
          unlockedBy: userId,
          expiresAt,
          requiresCredits: featureDef?.requiresCredits ?? false,
          creditsPerUse: featureDef?.creditsPerUse ?? 1,
          requiredTier: featureDef?.requiredTier,
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

    await db.update(organizationOnboarding)
      .set({
        automationUnlocked: true,
        automationUnlockedAt: new Date(),
        automationUnlockedBy: userId
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
