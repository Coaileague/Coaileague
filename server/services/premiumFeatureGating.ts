/**
 * PREMIUM FEATURE GATING SERVICE
 * ===============================
 * Validates and enforces premium feature access based on subscription tier and credits.
 * 
 * Follows the 7-step Universal Orchestration Step Logger pattern:
 * 1. TRIGGER   -> Feature access request received
 * 2. FETCH     -> Query workspace, credits, and usage data
 * 3. VALIDATE  -> Check tier requirements, credit availability, limits
 * 4. PROCESS   -> Calculate credit costs and access decision
 * 5. MUTATE    -> Deduct credits and log usage (for deductCredits operations)
 * 6. CONFIRM   -> Return access result to caller
 * 7. NOTIFY    -> Emit events for upsell triggers or alerts
 * 
 * Usage:
 * 1. Check access before using premium features
 * 2. Deduct credits after successful use
 * 3. Track usage for limits and billing
 */

import { BILLING } from '../config/platformConfig';
import { db } from '../db';
import { 
  workspaces, 
  featureUsageEvents,
  workspaceAddons,
  billingAddons
} from '@shared/schema';
import { eq, and, sql, gte, lte } from 'drizzle-orm';
import { 
  PREMIUM_FEATURES, 
  canAccessFeature, 
  getFeatureCreditCost,
  isPremiumFeature,
  isEliteFeature,
  mapAddonKeyToFeatureId,
  type SubscriptionTier,
  type PremiumFeatureDefinition
} from '@shared/config/premiumFeatures';
import { 
  universalStepLogger, 
  type OrchestrationContext, 
  type OrchestrationStep, 
  type StepStatus 
} from './orchestration/universalStepLogger';
import { createLogger } from '../lib/logger';
import { creditManager } from './billing/creditManager';
import { calculateEliteCharge } from './billing/eliteFeatureService';
const log = createLogger('premiumFeatureGating');


export interface PremiumAccessResult {
  allowed: boolean;
  reason?: string;
  creditCost?: number;
  remainingCredits?: number;
  usageThisMonth?: number;
  monthlyLimit?: number;
  requiresUpgrade?: boolean;
  suggestedTier?: SubscriptionTier;
  suggestedAddon?: string;
  // Elite per-tier USD surcharge (cents) owed for units beyond the monthly quota.
  // Populated by the elite billing path; `billableUnits` is the slice of `units`
  // that lands outside the included cap. Consumers (e.g. actionRegistry handlers)
  // must charge this via Stripe off-session before running the elite action.
  eliteSurchargeCents?: number;
  eliteBillableUnits?: number;
  eliteSurchargePerUnitCents?: number;
}

export interface CreditDeductionResult {
  success: boolean;
  creditsBefore: number;
  creditsAfter: number;
  creditsDeducted: number;
  error?: string;
}

class PremiumFeatureGatingService {
  
  /**
   * Create orchestration context for step logging with all required fields
   */
  private createOrchestrationContext(
    actionName: string,
    workspaceId: string,
    userId?: string,
    triggeredBy: 'user' | 'cron' | 'event' | 'api' | 'ai_brain' | 'webhook' = 'api'
  ): OrchestrationContext {
    const now = new Date();
    return {
      orchestrationId: `prem-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`,
      domain: 'automation',
      actionName,
      workspaceId,
      userId,
      triggeredBy,
      status: 'in_progress',
      steps: [],
      createdAt: now,
      updatedAt: now,
    } as OrchestrationContext;
  }

  /**
   * Complete all remaining steps in a failed/early-exit scenario
   * Ensures full 7-step compliance even for early returns
   */
  private async logRemainingStepsAsSkipped(
    context: OrchestrationContext,
    completedSteps: OrchestrationStep[],
    reason: string
  ): Promise<void> {
    const allSteps: OrchestrationStep[] = ['TRIGGER', 'FETCH', 'VALIDATE', 'PROCESS', 'MUTATE', 'CONFIRM', 'NOTIFY'];
    const remainingSteps = allSteps.filter(step => !completedSteps.includes(step));
    
    for (const step of remainingSteps) {
      await this.logStep(context, step, 'skipped', {}, { reason });
    }
  }

  /**
   * Log orchestration step to UniversalStepLogger
   */
  private async logStep(
    context: OrchestrationContext,
    step: OrchestrationStep,
    status: StepStatus,
    inputPayload?: Record<string, any>,
    outputPayload?: Record<string, any>,
    error?: string
  ): Promise<void> {
    try {
      await universalStepLogger.logStep(context, step, status, inputPayload, outputPayload, error);
    } catch (e) {
      log.error('[PremiumGating] Failed to log step:', e);
    }
  }
  
  /**
   * Check if a workspace can access a premium feature
   * Follows 7-step pattern: TRIGGER -> FETCH -> VALIDATE -> PROCESS -> (skip MUTATE) -> CONFIRM -> NOTIFY
   * @param units - Number of units to validate (e.g., minutes for per-minute features)
   */
  async checkAccess(
    workspaceId: string,
    featureId: string,
    userId?: string,
    units: number = 1
  ): Promise<PremiumAccessResult> {
    // Create orchestration context for 7-step logging
    const orchContext = this.createOrchestrationContext(
      `premium_access_check:${featureId}`,
      workspaceId,
      userId
    );

    try {
      // STEP 1: TRIGGER - Feature access request received
      await this.logStep(orchContext, 'TRIGGER', 'started', { featureId, workspaceId, units });
      
      const feature = PREMIUM_FEATURES[featureId];
      
      // Unknown features are core features - complete all 7 steps
      if (!feature) {
        await this.logStep(orchContext, 'TRIGGER', 'completed', { featureId }, { isCore: true });
        await this.logStep(orchContext, 'FETCH', 'skipped', {}, { reason: 'core_feature_no_fetch_needed' });
        await this.logStep(orchContext, 'VALIDATE', 'skipped', {}, { reason: 'core_feature_always_allowed' });
        await this.logStep(orchContext, 'PROCESS', 'skipped', {}, { reason: 'core_feature_no_processing' });
        await this.logStep(orchContext, 'MUTATE', 'skipped', {}, { reason: 'read_only_check' });
        await this.logStep(orchContext, 'CONFIRM', 'completed', {}, { allowed: true, reason: 'core_feature' });
        await this.logStep(orchContext, 'NOTIFY', 'skipped', {}, { reason: 'no_notification_needed' });
        return { allowed: true };
      }

      // Check if feature is enabled - complete all 7 steps on failure
      if (!feature.enabled) {
        await this.logStep(orchContext, 'TRIGGER', 'failed', { featureId }, { enabled: false }, 'Feature disabled');
        await this.logStep(orchContext, 'FETCH', 'skipped', {}, { reason: 'feature_disabled' });
        await this.logStep(orchContext, 'VALIDATE', 'skipped', {}, { reason: 'feature_disabled' });
        await this.logStep(orchContext, 'PROCESS', 'skipped', {}, { reason: 'feature_disabled' });
        await this.logStep(orchContext, 'MUTATE', 'skipped', {}, { reason: 'feature_disabled' });
        await this.logStep(orchContext, 'CONFIRM', 'completed', {}, { allowed: false, reason: 'feature_disabled' });
        await this.logStep(orchContext, 'NOTIFY', 'completed', {}, { notificationType: 'feature_disabled_alert' });
        return {
          allowed: false,
          reason: 'This feature is currently disabled',
        };
      }
      
      await this.logStep(orchContext, 'TRIGGER', 'completed', { featureId, units }, { featureName: feature.name });

      // STEP 2: FETCH - Query workspace, credits, and usage data
      await this.logStep(orchContext, 'FETCH', 'started', { workspaceId });
      
      const [workspace] = await db.select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId));

      if (!workspace) {
        await this.logStep(orchContext, 'FETCH', 'failed', { workspaceId }, {}, 'Workspace not found');
        await this.logStep(orchContext, 'VALIDATE', 'skipped', {}, { reason: 'workspace_not_found' });
        await this.logStep(orchContext, 'PROCESS', 'skipped', {}, { reason: 'workspace_not_found' });
        await this.logStep(orchContext, 'MUTATE', 'skipped', {}, { reason: 'workspace_not_found' });
        await this.logStep(orchContext, 'CONFIRM', 'completed', {}, { allowed: false, reason: 'workspace_not_found' });
        await this.logStep(orchContext, 'NOTIFY', 'completed', {}, { errorNotification: true, error: 'workspace_not_found' });
        return {
          allowed: false,
          reason: 'Workspace not found',
        };
      }

      const tier = (workspace.subscriptionTier || 'free') as SubscriptionTier;
      const currentUsage = await this.getMonthlyUsage(workspaceId, featureId);
      const credits = await this.getAvailableCredits(workspaceId);
      const purchasedAddons = await this.getPurchasedAddons(workspaceId);
      
      await this.logStep(orchContext, 'FETCH', 'completed', { workspaceId }, { 
        tier, 
        credits, 
        currentUsage, 
        addonCount: purchasedAddons.length 
      });

      // STEP 3: VALIDATE - Check tier requirements, credit availability, limits
      await this.logStep(orchContext, 'VALIDATE', 'started', { tier, featureId });
      
      const totalCreditsNeeded = feature.creditCost * units;
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const monthlyLimit = feature.monthlyLimits[tier] || 0;
      
      await this.logStep(orchContext, 'VALIDATE', 'completed', { 
        minimumTier: feature.minimumTier,
        currentTier: tier 
      }, { 
        totalCreditsNeeded, 
        monthlyLimit 
      });

      // STEP 4: PROCESS - Calculate access decision
      await this.logStep(orchContext, 'PROCESS', 'started', { tier, credits, currentUsage, units });

      // Elite per-tier USD surcharge: when a tenant blows past the monthly
      // included quota on an elite feature, charge `eliteSurchargeCents[tier]`
      // per additional use instead of deducting credits. This is the primary
      // monetization path for the Apr-2026 elite pricing matrix.
      const eliteCharge = feature.featureType === 'elite'
        ? calculateEliteCharge({ featureId, tier, currentUsage, requestedUnits: units })
        : null;
      const hasEliteSurcharge = eliteCharge !== null && eliteCharge.billableUnits > 0;

      const accessCheck = canAccessFeature(featureId, tier, currentUsage, credits, units, purchasedAddons);

      await this.logStep(orchContext, 'PROCESS', 'completed', {}, {
        allowed: accessCheck.allowed,
        creditsRequired: accessCheck.creditsRequired,
        tierEligible: accessCheck.tierEligible,
        eliteSurchargeCents: eliteCharge?.totalCents,
        eliteBillableUnits: eliteCharge?.billableUnits,
      });

      // STEP 5: MUTATE - Skip for read-only access check
      await this.logStep(orchContext, 'MUTATE', 'skipped', {}, { reason: 'read_only_check' });

      // STEP 6: CONFIRM - Return access result
      // If the tier is eligible for the elite feature and a per-use USD surcharge
      // is configured for the tier, the request is allowed regardless of credit
      // balance — the caller charges the surcharge via Stripe off-session.
      const eliteAllowsOverage = accessCheck.tierEligible === true && hasEliteSurcharge;

      if (accessCheck.allowed || eliteAllowsOverage) {
        const result: PremiumAccessResult = {
          allowed: true,
          creditCost: accessCheck.creditsRequired || 0,
          remainingCredits: credits - (accessCheck.creditsRequired || 0),
          usageThisMonth: currentUsage,
          monthlyLimit,
          eliteSurchargeCents: eliteCharge?.totalCents ?? 0,
          eliteBillableUnits: eliteCharge?.billableUnits ?? 0,
          eliteSurchargePerUnitCents: eliteCharge?.surchargeCents ?? 0,
        };
        await this.logStep(orchContext, 'CONFIRM', 'completed', {}, {
          allowed: true,
          creditCost: result.creditCost,
          eliteSurchargeCents: result.eliteSurchargeCents,
        });
        await this.logStep(orchContext, 'NOTIFY', 'skipped', {}, { reason: 'access_granted' });
        return result;
      }

      // Access denied - provide helpful suggestions
      const suggestedTier = feature.includedInTiers[0] || feature.minimumTier;
      const result: PremiumAccessResult = {
        allowed: false,
        reason: accessCheck.reason,
        creditCost: accessCheck.creditsRequired || totalCreditsNeeded,
        remainingCredits: credits,
        usageThisMonth: currentUsage,
        monthlyLimit,
        requiresUpgrade: !accessCheck.tierEligible,
        suggestedTier,
        suggestedAddon: feature.availableAsAddon ? featureId : undefined,
      };
      
      await this.logStep(orchContext, 'CONFIRM', 'completed', {}, { allowed: false, reason: accessCheck.reason });
      
      // STEP 7: NOTIFY - Emit upsell trigger if access denied
      await this.logStep(orchContext, 'NOTIFY', 'completed', {}, { 
        upsellTriggered: true, 
        suggestedTier,
        suggestedAddon: result.suggestedAddon 
      });
      
      return result;
      
    } catch (error: any) {
      log.error('[PremiumGating] Error checking access:', error);
      // Complete all 7 steps with failure state for audit compliance
      await this.logStep(orchContext, 'PROCESS', 'failed', {}, {}, (error instanceof Error ? error.message : String(error)));
      await this.logStep(orchContext, 'MUTATE', 'skipped', {}, { reason: 'exception_occurred' });
      await this.logStep(orchContext, 'CONFIRM', 'completed', {}, { allowed: false, reason: 'exception', error: (error instanceof Error ? error.message : String(error)) });
      await this.logStep(orchContext, 'NOTIFY', 'completed', {}, { 
        errorNotification: true, 
        error: (error instanceof Error ? error.message : String(error)),
        orchestrationStatus: 'failed' 
      });
      return {
        allowed: false,
        reason: 'Error checking feature access',
      };
    }
  }

  /**
   * Deduct credits for a premium feature usage
   * Follows full 7-step pattern: TRIGGER -> FETCH -> VALIDATE -> PROCESS -> MUTATE -> CONFIRM -> NOTIFY
   */
  async deductCredits(
    workspaceId: string,
    featureId: string,
    units: number = 1,
    userId?: string,
    metadata?: Record<string, any>
  ): Promise<CreditDeductionResult> {
    // Create orchestration context for 7-step logging
    const orchContext = this.createOrchestrationContext(
      `premium_credit_deduction:${featureId}`,
      workspaceId,
      userId
    );

    try {
      // STEP 1: TRIGGER - Credit deduction request received
      await this.logStep(orchContext, 'TRIGGER', 'started', { featureId, workspaceId, units, metadata });
      
      const feature = PREMIUM_FEATURES[featureId];
      
      if (!feature) {
        await this.logStep(orchContext, 'TRIGGER', 'completed', { featureId }, { isCore: true, noDeduction: true });
        await this.logStep(orchContext, 'FETCH', 'skipped', {}, { reason: 'core_feature_no_credits' });
        await this.logStep(orchContext, 'VALIDATE', 'skipped', {}, { reason: 'core_feature_always_allowed' });
        await this.logStep(orchContext, 'PROCESS', 'skipped', {}, { reason: 'core_feature_no_deduction' });
        await this.logStep(orchContext, 'MUTATE', 'skipped', {}, { reason: 'core_feature_no_mutation' });
        await this.logStep(orchContext, 'CONFIRM', 'completed', {}, { success: true, reason: 'core_feature' });
        await this.logStep(orchContext, 'NOTIFY', 'skipped', {}, { reason: 'no_notification_for_core' });
        return {
          success: true,
          creditsBefore: 0,
          creditsAfter: 0,
          creditsDeducted: 0,
        };
      }

      const creditsToDeduct = feature.creditCost * units;
      await this.logStep(orchContext, 'TRIGGER', 'completed', { featureId, units }, { 
        featureName: feature.name, 
        creditsToDeduct 
      });

      // STEP 2: FETCH - Get current credit balance
      await this.logStep(orchContext, 'FETCH', 'started', { workspaceId });
      const creditsBefore = await this.getAvailableCredits(workspaceId);
      await this.logStep(orchContext, 'FETCH', 'completed', { workspaceId }, { creditsBefore });

      // Handle zero-cost features (included in subscription)
      if (creditsToDeduct === 0) {
        await this.logStep(orchContext, 'VALIDATE', 'completed', {}, { includedInSubscription: true });
        await this.logStep(orchContext, 'PROCESS', 'skipped', {}, { reason: 'no_credits_required' });
        await this.logStep(orchContext, 'MUTATE', 'started', { workspaceId, featureId });
        await this.logUsage(workspaceId, featureId, 0, units, userId, metadata);
        await this.logStep(orchContext, 'MUTATE', 'completed', {}, { usageLogged: true, creditsDeducted: 0 });
        await this.logStep(orchContext, 'CONFIRM', 'completed', {}, { success: true });
        await this.logStep(orchContext, 'NOTIFY', 'skipped', {}, { reason: 'no_credits_deducted' });
        return {
          success: true,
          creditsBefore: 0,
          creditsAfter: 0,
          creditsDeducted: 0,
        };
      }

      // STEP 3: VALIDATE - Check sufficient credits
      await this.logStep(orchContext, 'VALIDATE', 'started', { creditsBefore, creditsToDeduct });
      
      if (creditsBefore < creditsToDeduct) {
        await this.logStep(orchContext, 'VALIDATE', 'failed', { creditsBefore, creditsToDeduct }, {}, 'Insufficient credits');
        await this.logStep(orchContext, 'PROCESS', 'skipped', {}, { reason: 'insufficient_credits' });
        await this.logStep(orchContext, 'MUTATE', 'skipped', {}, { reason: 'insufficient_credits' });
        await this.logStep(orchContext, 'CONFIRM', 'completed', {}, { success: false, reason: 'insufficient_credits' });
        await this.logStep(orchContext, 'NOTIFY', 'completed', {}, { 
          insufficientCredits: true, 
          needed: creditsToDeduct, 
          available: creditsBefore,
          upsellTriggered: true
        });
        return {
          success: false,
          creditsBefore,
          creditsAfter: creditsBefore,
          creditsDeducted: 0,
          error: `Insufficient credits. Need ${creditsToDeduct}, have ${creditsBefore}`,
        };
      }
      
      await this.logStep(orchContext, 'VALIDATE', 'completed', {}, { sufficientCredits: true });

      // STEP 4: PROCESS - Prepare deduction
      await this.logStep(orchContext, 'PROCESS', 'started', { creditsToDeduct, units });
      const creditsAfter = creditsBefore - creditsToDeduct;
      await this.logStep(orchContext, 'PROCESS', 'completed', {}, { creditsAfter });

      // STEP 5: MUTATE - Deduct credits via universal creditManager (ensures WebSocket broadcast + transaction logging)
      await this.logStep(orchContext, 'MUTATE', 'started', { workspaceId, creditsToDeduct });
      
      const { creditManager, CREDIT_COSTS } = await import('./billing/creditManager');
      const featureKeyForManager = (featureId in CREDIT_COSTS) 
        ? featureId as keyof typeof CREDIT_COSTS 
        : 'premium_feature' as keyof typeof CREDIT_COSTS;
      
      const cmResult = await creditManager.deductCredits({
        workspaceId,
        userId,
        featureKey: featureKeyForManager,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        featureName: feature.name,
        amountOverride: creditsToDeduct,
        description: `Premium: ${feature.name} (${units} units)`,
        relatedEntityType: 'premium_feature',
        relatedEntityId: featureId,
      });

      if (!cmResult.success) {
        await this.logStep(orchContext, 'MUTATE', 'failed', {}, { error: cmResult.errorMessage }, cmResult.errorMessage || 'Credit deduction failed');
        await this.logStep(orchContext, 'CONFIRM', 'completed', {}, { success: false, reason: 'deduction_failed' });
        await this.logStep(orchContext, 'NOTIFY', 'completed', {}, { insufficientCredits: true });
        return {
          success: false,
          creditsBefore,
          creditsAfter: creditsBefore,
          creditsDeducted: 0,
          error: cmResult.errorMessage || 'Credit deduction failed',
        };
      }

      await this.logUsage(workspaceId, featureId, creditsToDeduct, units, userId, metadata);
      
      await this.logStep(orchContext, 'MUTATE', 'completed', {}, { 
        creditsDeducted: creditsToDeduct, 
        usageLogged: true,
        transactionId: cmResult.transactionId,
      });

      // STEP 6: CONFIRM - Return success result
      const result: CreditDeductionResult = {
        success: true,
        creditsBefore,
        creditsAfter,
        creditsDeducted: creditsToDeduct,
      };
      await this.logStep(orchContext, 'CONFIRM', 'completed', {}, { 
        success: true, 
        creditsBefore, 
        creditsAfter, 
        creditsDeducted: creditsToDeduct 
      });

      // STEP 7: NOTIFY - Log completion (could trigger alerts for low balance)
      const lowBalanceThreshold = BILLING.lowBalanceThreshold;
      const lowBalance = creditsAfter < lowBalanceThreshold;
      await this.logStep(orchContext, 'NOTIFY', 'completed', {}, { 
        lowBalanceAlert: lowBalance,
        creditsRemaining: creditsAfter 
      });

      return result;
      
    } catch (error: any) {
      log.error('[PremiumGating] Error deducting credits:', error);
      // Complete all 7 steps with failure state for audit compliance
      await this.logStep(orchContext, 'MUTATE', 'failed', {}, {}, (error instanceof Error ? error.message : String(error)));
      await this.logStep(orchContext, 'CONFIRM', 'completed', {}, { success: false, reason: 'exception', error: (error instanceof Error ? error.message : String(error)) });
      await this.logStep(orchContext, 'NOTIFY', 'completed', {}, { 
        errorNotification: true, 
        error: (error instanceof Error ? error.message : String(error)),
        orchestrationStatus: 'failed' 
      });
      return {
        success: false,
        creditsBefore: 0,
        creditsAfter: 0,
        creditsDeducted: 0,
        error: (error instanceof Error ? error.message : String(error)),
      };
    }
  }

  /**
   * Get available credits for a workspace
   */
  async getAvailableCredits(workspaceId: string): Promise<number> {
    try {
      return await creditManager.getBalance(workspaceId);
    } catch (error) {
      log.error('[PremiumGating] Error getting credits:', error);
      return 0;
    }
  }

  /**
   * Get purchased add-ons for a workspace (maps addon keys to premium feature IDs)
   * Uses the ADDON_KEY_TO_FEATURE_MAP to translate billing addon keys to feature IDs
   */
  async getPurchasedAddons(workspaceId: string): Promise<string[]> {
    try {
      const addons = await db.select({
        addonKey: billingAddons.addonKey,
      })
        .from(workspaceAddons)
        .leftJoin(billingAddons, eq(workspaceAddons.addonId, billingAddons.id))
        .where(and(
          eq(workspaceAddons.workspaceId, workspaceId),
          eq(workspaceAddons.status, 'active')
        ));

      // Map addon keys to feature IDs using the centralized mapping
      const featureIds: string[] = [];
      for (const addon of addons) {
        if (addon.addonKey) {
          const featureId = mapAddonKeyToFeatureId(addon.addonKey);
          if (featureId) {
            featureIds.push(featureId);
          }
        }
      }
      
      return featureIds;
    } catch (error) {
      log.error('[PremiumGating] Error getting purchased addons:', error);
      return [];
    }
  }

  /**
   * Get monthly usage for a feature (in units - e.g., minutes for per-minute features)
   */
  async getMonthlyUsage(workspaceId: string, featureId: string): Promise<number> {
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const endOfMonth = new Date(startOfMonth);
      endOfMonth.setMonth(endOfMonth.getMonth() + 1);

      // Sum units from metadata for accurate per-minute/per-use tracking
      const result = await db.select({
        totalUnits: sql<number>`COALESCE(SUM((metadata->>'units')::numeric), COUNT(*))`,
        totalCount: sql<number>`COUNT(*)`
      })
        .from(featureUsageEvents)
        .where(and(
          eq(featureUsageEvents.workspaceId, workspaceId),
          eq(featureUsageEvents.featureKey, featureId),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          gte(featureUsageEvents.triggeredAt, startOfMonth),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          lte(featureUsageEvents.triggeredAt, endOfMonth)
        ));

      // Return total units (for per-minute features) or count (for per-use features)
      return Number(result[0]?.totalUnits) || 0;
    } catch (error) {
      log.error('[PremiumGating] Error getting monthly usage:', error);
      return 0;
    }
  }

  /**
   * Log feature usage
   */
  private async logUsage(
    workspaceId: string,
    featureId: string,
    creditsUsed: number,
    units: number,
    userId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await db.insert(featureUsageEvents).values({
        id: crypto.randomUUID(),
        workspaceId,
        userId: userId || null,
        featureKey: featureId,
        featureCategory: PREMIUM_FEATURES[featureId]?.category || 'other',
        actionType: 'premium_feature_use',
        ingestedAt: new Date(),
        metadata: { ...metadata, creditsUsed, units },
      });
    } catch (error) {
      log.error('[PremiumGating] Error logging usage:', error);
    }
  }

  /**
   * Add credits to a workspace
   */
  async addCredits(
    workspaceId: string,
    _credits: number,
    _source: 'purchase' | 'bonus' | 'refund' | 'subscription' | 'promo',
    _referenceId?: string
  ): Promise<{ success: boolean; newBalance: number }> {
    // Flat seat-fee model: credits are tier-allocated, not purchased individually
    // workspace_credits table dropped (Phase 16)
    const balance = await creditManager.getBalance(workspaceId);
    return { success: true, newBalance: balance };
  }

  /**
   * Get premium feature info for display
   */
  getFeatureInfo(featureId: string): PremiumFeatureDefinition | null {
    return PREMIUM_FEATURES[featureId] || null;
  }

  /**
   * Get all premium features for a category
   */
  getFeaturesByCategory(category: string): PremiumFeatureDefinition[] {
    return Object.values(PREMIUM_FEATURES).filter(f => f.category === category);
  }

  /**
   * Check if feature requires payment
   */
  isPremium(featureId: string): boolean {
    return isPremiumFeature(featureId);
  }

  /**
   * Check if feature is elite tier
   */
  isElite(featureId: string): boolean {
    return isEliteFeature(featureId);
  }
}

export const premiumFeatureGating = new PremiumFeatureGatingService();
