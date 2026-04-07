import { createLogger } from '../../lib/logger';
import { db } from '../../db';
import {
  workspaces,
  organizationOnboarding,
  users,
  supportSessionElevations,
  workspaceUsageTracking,
  type WorkspaceFeatureState
} from '@shared/schema';
import { eq, and, gt, sql, or } from 'drizzle-orm';
import { creditManager, CREDIT_COSTS } from './creditManager';
import { platformEventBus } from '../platformEventBus';
import { BILLING, TierKey } from '@shared/billingConfig';
import { SUPPORT_ROLES } from '@shared/platformConfig';
import { typedExec } from '../../lib/typedSql';
import { cacheManager } from '../platform/cacheManager';
const AI_SERVICE_IDS = ['trinity', 'helpai', 'bot', 'subagent'];
const log = createLogger('featureGateService');

// Tier-based feature key mapping to featureMatrix keys
const FEATURE_TO_MATRIX_KEY: Record<string, keyof typeof BILLING.featureMatrix> = {
  'ai_scheduling': 'ai_scheduling',
  'gps_tracking': 'gps_time_tracking',
  'mobile_app': 'mobile_app',
  'shift_swap': 'shift_swapping',
  'compliance': 'basic_compliance',
  'advanced_compliance': 'advanced_compliance_sox',
  'payroll': 'payroll_automation',
  'billing': 'client_billing',
  'invoicing': 'invoice_generation',
  'quickbooks': 'quickbooks_integration',
  'api_access': 'api_access',
  'pl_dashboard': 'pl_financial_dashboard',
  'cash_flow': 'cash_flow_forecasting',
  'contracts': 'contract_pipeline',
  'esignatures': 'e_signatures',
  'document_vault': 'document_vault',
  'client_profitability': 'client_profitability',
  'predictive_insights': 'predictive_insights',
  'multi_location': 'multi_location',
  'white_label': 'white_label',
  'incident_management': 'incident_management',
  'strategic_insights': 'strategic_insights',
};

export type FeatureGateResult = {
  allowed: boolean;
  reason?: string;
  requiredAction?: 'purchase_credits' | 'complete_onboarding' | 'unlock_feature' | 'enter_code' | 'upgrade_tier' | 'purchase_addon';
  creditsRequired?: number;
  currentBalance?: number;
  featureCategory?: 'trinity_command' | 'automation_action' | 'automation_cycle' | 'staged_publish' | 'ai_brain';
  requiredTier?: string;
  addonRequired?: string;
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
    if (process.env.NODE_ENV === 'development') {
      const devBypass = await this.checkDevelopmentBypass(workspaceId);
      if (devBypass) {
        log.info(`[FeatureGate] Development mode bypass for workspace ${workspaceId} using ${featureKey}`);
        return { allowed: true, reason: 'development_mode_bypass' };
      }
    }
    
    const isSupportBypass = await this.checkSupportRoleBypass(userId, sessionId);
    if (isSupportBypass) {
      log.info(`[FeatureGate] Support role bypass for ${userId} using ${featureKey}`);
      return { allowed: true, reason: 'support_role_bypass' };
    }

    const isAiService = AI_SERVICE_IDS.some(id => userId.toLowerCase().includes(id));
    if (isAiService) {
      const hasElevation = await this.checkElevatedSession(userId, sessionId);
      if (hasElevation) {
        log.info(`[FeatureGate] AI service bypass for ${userId} using ${featureKey}`);
        return { allowed: true, reason: 'ai_service_bypass' };
      }
    }

    const featureDef = FEATURE_DEFINITIONS[featureKey];
    if (!featureDef) {
      log.info(`[FeatureGate] Unknown feature ${featureKey}, allowing by default`);
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

    // ── Interaction Limit Check (replaces credit system) ──────────────────
    // Checks the workspace's monthly interaction count against the tier hard cap.
    // Critical operations (panic alerts, incidents, compliance) are NEVER blocked.
    // Non-critical autonomous work is allowed up to the hard cap, then queued.
    // This is a non-blocking check — the platform records usage and flags overages
    // rather than hard-stopping the request. Billing for overages is line-item.
    const criticalFeatures = new Set([
      'panic_alert', 'incident_report', 'compliance_check', 'payroll_run',
      'timesheet_approval', 'officer_alert', 'emergency_dispatch',
    ]);

    if (!criticalFeatures.has(featureKey)) {
      try {
        const TIER_HARD_CAPS: Record<string, number | null> = {
          trial: 500, starter: 15000, professional: 50000, business: 150000, enterprise: null, strategic: null,
        };
        const tier = (workspace.subscriptionTier || 'trial') as string;
        const hardCap = TIER_HARD_CAPS[tier] ?? null;

        if (hardCap !== null) {
          const usageRows = await db.select({ count: workspaceUsageTracking.interactionsUsedCurrentPeriod })
            .from(workspaceUsageTracking)
            .where(eq(workspaceUsageTracking.workspaceId, workspaceId))
            .limit(1);
          const currentUsage = usageRows[0]?.count ?? 0;

          if ((currentUsage ?? 0) >= hardCap) {
            log.warn(`[FeatureGate] Hard cap reached for workspace ${workspaceId}: ${currentUsage}/${hardCap}`);
          }
          // NOTE: We do NOT return allowed: false here. Overages are billed as line-items.
          // The platform flags the workspace for billing review but does not block requests.
        }
      } catch (usageErr: any) {
        // Usage check failure is non-fatal — allow the request, log the error
        log.warn('[FeatureGate] Usage check failed (non-fatal):', usageErr?.message);
      }
    }

    return { allowed: true };
  }

  /**
   * Records an AI interaction in workspace_usage_tracking.
   * Previously deducted credits — now just records usage for billing/analytics.
   * Critical features bypass this entirely. Overages are billed as line-items,
   * never as hard blocks.
   */
  async consumeCreditsForFeature(
    featureKey: string,
    workspaceId: string,
    userId: string,
    sessionId?: string,
    actionId?: string
  ): Promise<{ success: boolean; creditsUsed: number; error?: string }> {
    const gateResult = await this.canUseFeature(featureKey, workspaceId, userId, sessionId);

    if (!gateResult.allowed) {
      return { success: false, creditsUsed: 0, error: gateResult.reason };
    }

    // Bypass roles do not generate usage records
    if (
      gateResult.reason === 'support_role_bypass' ||
      gateResult.reason === 'ai_service_bypass' ||
      gateResult.reason === 'development_mode_bypass'
    ) {
      return { success: true, creditsUsed: 0 };
    }

    // Record the interaction asynchronously — never block on this
    // Upserts to workspace_usage_tracking aggregate row (per-workspace monthly counters)
    try {
      // Converted to Drizzle ORM: CASE WHEN → sql fragment
      await db.insert(workspaceUsageTracking).values({
        workspaceId,
        interactionsUsedCurrentPeriod: 1,
        interactionsRemaining: 499,
        lastUpdated: sql`now()`
      }).onConflictDoUpdate({
        target: workspaceUsageTracking.workspaceId,
        set: {
          interactionsUsedCurrentPeriod: sql`${workspaceUsageTracking.interactionsUsedCurrentPeriod} + 1`,
          interactionsRemaining: sql`greatest(0, ${workspaceUsageTracking.interactionsRemaining} - 1)`,
          overageInteractions: sql`
            case
              when ${workspaceUsageTracking.interactionsRemaining} <= 0
              then ${workspaceUsageTracking.overageInteractions} + 1
              else ${workspaceUsageTracking.overageInteractions}
            end
          `,
          lastUpdated: sql`now()`
        }
      });
    } catch (trackErr: any) {
      // Non-fatal — usage tracking failure must never deny service
      log.warn('[FeatureGate] Usage recording failed (non-fatal):', trackErr?.message);
    }

    return { success: true, creditsUsed: 0 };
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

  /**
   * Development mode bypass - allows all features for testing in development environment
   * This checks if the workspace has DEV_BYPASS enabled or if we're in development mode
   */
  private async checkDevelopmentBypass(workspaceId: string): Promise<boolean> {
    if (process.env.NODE_ENV === 'development') {
      return true;
    }
    return false;
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
    const tierHierarchy = ['trial', 'free', 'starter', 'professional', 'business', 'enterprise', 'strategic'];
    const currentIndex = tierHierarchy.indexOf(currentTier.toLowerCase());
    const requiredIndex = tierHierarchy.indexOf(requiredTier.toLowerCase());

    return { allowed: currentIndex >= requiredIndex };
  }

  /**
   * Check if a feature is allowed based on subscription tier using the feature matrix
   * Returns: true (allowed), false (not allowed), "addon" (requires addon purchase)
   */
  async checkTierFeatureAccess(
    featureKey: string,
    workspaceId: string
  ): Promise<{ allowed: boolean; requiresAddon?: boolean; requiredTier?: string; addonId?: string }> {
    const matrixKey = FEATURE_TO_MATRIX_KEY[featureKey];
    if (!matrixKey) {
      // Feature not in matrix, allow by default
      return { allowed: true };
    }

    const [workspace] = await db.select().from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      return { allowed: false, requiredTier: 'starter' };
    }

    const tier = (workspace.subscriptionTier || 'free') as TierKey;
    const featureAccess = BILLING.featureMatrix[matrixKey];
    
    if (!featureAccess) {
      return { allowed: true };
    }

    const access = featureAccess[tier];

    if (access === true) {
      return { allowed: true };
    } else if (access === false) {
      // Find the minimum tier that allows this feature
      const tierHierarchy: TierKey[] = ['free', 'trial', 'starter', 'professional', 'business', 'enterprise', 'strategic' as TierKey];
      const requiredTier = tierHierarchy.find(t => featureAccess[t] === true);
      return { allowed: false, requiredTier: requiredTier || 'professional' };
    } else if (access === 'addon') {
      // Feature requires an addon - check if workspace has it
      const hasAddon = await this.checkWorkspaceHasAddon(workspaceId, featureKey);
      if (hasAddon) {
        return { allowed: true };
      }
      return { allowed: false, requiresAddon: true, addonId: featureKey };
    }

    return { allowed: true };
  }

  /**
   * Check if workspace has a specific addon active
   */
  private async checkWorkspaceHasAddon(workspaceId: string, addonKey: string): Promise<boolean> {
    // Check workspace addons in metadata or subscription_addons table
    const [workspace] = await db.select().from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) return false;

    // Check if addons are stored in workspace metadata
    const metadata = workspace.metadata as any;
    if (metadata?.activeAddons?.includes(addonKey)) {
      return true;
    }

    // For now, return false - addon table can be added later
    return false;
  }

  /**
   * Check AI credit limits and enforce tier-based restrictions
   */
  async checkCreditLimits(
    workspaceId: string,
    creditsNeeded: number
  ): Promise<{ allowed: boolean; reason?: string; action?: 'purchase_credits' | 'upgrade_tier'; code?: string }> {
    const [workspace] = await db.select().from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      return { allowed: false, reason: 'Workspace not found', code: 'WORKSPACE_NOT_FOUND' };
    }

    const tier = (workspace.subscriptionTier || 'free') as TierKey;
    const tierConfig = BILLING.tiers[tier];
    const balance = await creditManager.getBalance(workspaceId);

    // Hard stop: insufficient credits — block execution, notify owner, return structured error
    if (balance < creditsNeeded) {
      const allowsOverage = tierConfig.allowCreditOverage;
      
      if (!allowsOverage) {
        // Notify org owner of depleted credits — fire-and-forget
        import('../notificationService').then(async ({ createNotification }) => {
          const { db } = await import('../../db');
          const { workspaces } = await import('@shared/schema');
          const { eq } = await import('drizzle-orm');
          const [ws] = await db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
          if (!ws?.ownerId) { log.warn('[FeatureGate] No owner found for workspace', workspaceId); return; }
          createNotification({
            workspaceId,
            userId: ws.ownerId,
            title: 'AI Credits Depleted',
            message: balance <= 0
              ? `Your workspace has zero AI credits remaining. AI features are paused until credits are replenished.`
              : `Your workspace has insufficient credits (${balance} remaining, ${creditsNeeded} needed). AI features are paused.`,
            type: 'error',
            category: 'billing',
            priority: 'high',
            actionUrl: '/billing',
          }).catch((notifErr: Error) => {
            log.warn('[FeatureGate] Failed to send credit-depleted notification:', notifErr?.message);
          });
        }).catch((importErr: Error) => {
          log.warn('[FeatureGate] Failed to import notificationService for credit alert:', importErr?.message);
        });

        if (tier === 'free') {
          return {
            allowed: false,
            code: 'INSUFFICIENT_CREDITS',
            reason: 'Trial credits exhausted. Upgrade to continue using AI features.',
            action: 'upgrade_tier',
          };
        } else if (tier === 'starter') {
          return {
            allowed: false,
            code: 'INSUFFICIENT_CREDITS',
            reason: 'Monthly credits exhausted. Upgrade to Professional or purchase AI credit pack.',
            action: 'purchase_credits',
          };
        } else {
          // Non-overage tier with depleted balance
          return {
            allowed: false,
            code: 'INSUFFICIENT_CREDITS',
            reason: `Credits exhausted (balance: ${balance}, required: ${creditsNeeded}). Please purchase additional credits.`,
            action: 'purchase_credits',
          };
        }
      }
      
      // Professional tier can auto-charge for overage
      if (tier === 'professional' && allowsOverage) {
        log.info(`[FeatureGate] Professional tier credit overage for workspace ${workspaceId}`);
      }
    }

    return { allowed: true };
  }

  /**
   * Check employee limits and return overage info
   */
  async checkEmployeeLimits(
    workspaceId: string,
    employeeCount?: number
  ): Promise<{ 
    allowed: boolean; 
    currentCount: number; 
    limit: number; 
    overage: number; 
    overageRate: number;
    action?: 'upgrade_tier' 
  }> {
    const [workspace] = await db.select().from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      return { allowed: false, currentCount: 0, limit: 0, overage: 0, overageRate: 0 };
    }

    const tier = (workspace.subscriptionTier || 'free') as TierKey;
    const tierConfig = BILLING.tiers[tier];
    const limit = tierConfig.maxEmployees;

    let currentCount = employeeCount ?? 0;
    if (employeeCount === undefined) {
      const { employees } = await import('@shared/schema');
      const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
        .from(employees)
        .where(and(
          eq(employees.workspaceId, workspaceId),
          eq(employees.isActive, true)
        ));
      currentCount = countResult?.count || 0;
    }

    const overage = Math.max(0, currentCount - limit);
    const overageRate = BILLING.overages[tier as keyof typeof BILLING.overages] || 0;

    // Free trial has hard cap
    if (tier === 'free' && currentCount >= limit) {
      return { 
        allowed: false, 
        currentCount, 
        limit, 
        overage, 
        overageRate: 0, 
        action: 'upgrade_tier' 
      };
    }

    // Other tiers allow overage with billing
    return { 
      allowed: true, 
      currentCount, 
      limit, 
      overage, 
      overageRate: typeof overageRate === 'number' ? overageRate : 0 
    };
  }

  private async getFeatureState(workspaceId: string, featureKey: string): Promise<WorkspaceFeatureState | null> {
    // Phase 39 — use CacheManager blob cache (2min TTL) to avoid per-check DB round-trip
    const states = await cacheManager.getWorkspaceFeatureBlob(workspaceId);
    return states[featureKey] ? { ...states[featureKey], workspaceId, featureKey } as WorkspaceFeatureState : null;
  }

  async unlockFeature(
    workspaceId: string,
    featureKey: string,
    unlockMethod: 'onboarding' | 'purchase' | 'tier' | 'code' | 'migration' | 'trial',
    userId: string,
    expiresAt?: Date
  ): Promise<boolean> {
    try {
      const featureDef = FEATURE_DEFINITIONS[featureKey];
      const [ws] = await db.select({ blob: workspaces.featureStatesBlob })
        .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      const states = ((ws?.blob || {}) as Record<string, any>);
      states[featureKey] = {
        ...(states[featureKey] || {}),
        isUnlocked: true,
        unlockMethod,
        unlockedAt: new Date().toISOString(),
        unlockedBy: userId,
        expiresAt: expiresAt?.toISOString() || null,
        featureCategory: featureDef?.category || 'ai_brain',
        creditsPerUse: featureDef?.creditsPerUse ?? 1,
        showLockIcon: false,
      };
      await db.update(workspaces)
        .set({ featureStatesBlob: states })
        .where(eq(workspaces.id, workspaceId));

      // Phase 39 — invalidate feature blob cache so next check fetches fresh state
      cacheManager.invalidateFeatureBlob(workspaceId);

      log.info(`[FeatureGate] Unlocked feature ${featureKey} for workspace ${workspaceId} via ${unlockMethod}`);

      platformEventBus.publish({
        type: 'feature_released',
        category: 'feature',
        title: 'Feature Unlocked',
        description: `Feature ${featureKey} has been unlocked`,
        metadata: { workspaceId, featureKey, unlockMethod }
      }).catch((busErr: Error) => {
        log.warn('[FeatureGate] Failed to publish feature_released event:', busErr?.message);
      });

      return true;
    } catch (error) {
      log.error('[FeatureGate] Error unlocking feature:', error);
      return false;
    }
  }

  async lockFeature(workspaceId: string, featureKey: string, reason?: string): Promise<boolean> {
    try {
      const existingState = await this.getFeatureState(workspaceId, featureKey);
      if (existingState) {
        // Re-read directly from DB to get fresh data for the write (bypass cache for write path)
        const [ws] = await db.select({ blob: workspaces.featureStatesBlob })
          .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        const states = ((ws?.blob || {}) as Record<string, any>);
        states[featureKey] = { ...(states[featureKey] || {}), isUnlocked: false, showLockIcon: true, lockMessage: reason };
        await db.update(workspaces).set({ featureStatesBlob: states }).where(eq(workspaces.id, workspaceId));
        // Phase 39 — invalidate feature blob cache after lock
        cacheManager.invalidateFeatureBlob(workspaceId);
        log.info(`[FeatureGate] Locked feature ${featureKey} for workspace ${workspaceId}`);
        return true;
      }

      return false;
    } catch (error) {
      log.error('[FeatureGate] Error locking feature:', error);
      return false;
    }
  }

  async getWorkspaceFeatureStates(workspaceId: string): Promise<WorkspaceFeatureState[]> {
    // Phase 39 — use cache blob (2 min TTL) instead of direct DB query
    const states = await cacheManager.getWorkspaceFeatureBlob(workspaceId);
    return Object.entries(states).map(([key, val]: [string, any]) => ({
      ...val, workspaceId, featureKey: key
    })) as WorkspaceFeatureState[];
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

    log.info(`[FeatureGate] Unlocked all onboarding-gated features for workspace ${workspaceId}`);
  }

  getFeatureDefinitions(): Record<string, FeatureDefinition> {
    return FEATURE_DEFINITIONS;
  }

  getFeatureDefinition(key: string): FeatureDefinition | undefined {
    return FEATURE_DEFINITIONS[key];
  }
}

export const featureGateService = FeatureGateService.getInstance();
