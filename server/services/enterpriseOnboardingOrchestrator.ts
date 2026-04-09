/**
 * ENTERPRISE ONBOARDING ORCHESTRATOR
 * ====================================
 * Handles the 3-phase enterprise onboarding flow:
 * 
 * Phase 1: Initial Signup & Tier Assignment
 * Phase 2: Feature Selection & À La Carte
 * Phase 3: Payment & Activation
 * 
 * Each phase follows the 7-step ExecutionPipeline pattern.
 */

import { NotificationDeliveryService } from './notificationDeliveryService';
import crypto from 'crypto';
import { BILLING } from '../config/platformConfig';
import { db } from '../db';
import { getAppBaseUrl } from '../utils/getAppBaseUrl';
import {
  workspaces,
  users,
  subscriptionTiers,
  addonFeatures,
  orgSubscriptions,
  orgFeatures,
  pendingConfigurations,
  type InsertOrgSubscription,
  type InsertOrgFeature,
  type InsertPendingConfiguration,
} from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { executionPipeline, type PipelineContext } from './executionPipeline';
import { emailService } from './emailService';
import Stripe from 'stripe';
import { createLogger } from '../lib/logger';
const log = createLogger('enterpriseOnboardingOrchestrator');


// ============================================================================
// TYPES
// ============================================================================

export interface SignupData {
  companyName: string;
  billingEmail: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone?: string;
  selectedTier: 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic';
}

export interface SetupContext {
  orgId: string;
  assignedTier: string;
  coreFeatures: string[];
  includedPremiumFeatures: string[];
  baseMonthlyPrice: number;
  includedCredits: number;
  availableAddons: any[];
}

export interface AddonSelection {
  addonId: string;
  featureKey: string;
}

export interface PricingBreakdown {
  baseMonthlyPrice: number;
  addonsCost: number;
  totalMonthlyFixed: number;
  estimatedCreditUsage: number;
  recommendedCreditPackage: number;
  lineItems: { name: string; type: string; cost: number }[];
}

export interface PhaseResult {
  success: boolean;
  message: string;
  data?: any;
}

// ============================================================================
// STRIPE INTEGRATION
// ============================================================================

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-01-27.acacia' })
  : null;

// ============================================================================
// ENTERPRISE ONBOARDING ORCHESTRATOR
// ============================================================================

export class EnterpriseOnboardingOrchestrator {
  private static instance: EnterpriseOnboardingOrchestrator;
  
  private constructor() {}
  
  static getInstance(): EnterpriseOnboardingOrchestrator {
    if (!EnterpriseOnboardingOrchestrator.instance) {
      EnterpriseOnboardingOrchestrator.instance = new EnterpriseOnboardingOrchestrator();
    }
    return EnterpriseOnboardingOrchestrator.instance;
  }
  
  // ==========================================================================
  // PHASE 1: INITIAL SIGNUP & TIER ASSIGNMENT
  // ==========================================================================
  
  /**
   * Process initial enterprise signup
   */
  async processSignup(signupData: SignupData, userId: string): Promise<PhaseResult> {
    const result = await executionPipeline.execute(
      {
        operationType: 'onboarding',
        operationName: 'enterprise_signup_phase1',
        initiator: userId,
        initiatorType: 'user',
        payload: { companyName: signupData.companyName, tier: signupData.selectedTier },
      },
      {
        // STEP 2: FETCH
        fetch: async (ctx) => {
          const [tier] = await db.select()
            .from(subscriptionTiers)
            .where(eq(subscriptionTiers.tierName, signupData.selectedTier))
            .limit(1);
          
          if (!tier) {
            throw new Error(`Tier "${signupData.selectedTier}" not found`);
          }
          
          // Check if company name is unique
          const [existingOrg] = await db.select()
            .from(workspaces)
            .where(eq(workspaces.name, signupData.companyName))
            .limit(1);
          
          return {
            tier,
            companyNameTaken: !!existingOrg,
          };
        },
        
        // STEP 3: VALIDATE
        validate: async (ctx, fetchedData) => {
          const errors: string[] = [];
          
          if (fetchedData.companyNameTaken) {
            errors.push('Company name is already taken');
          }
          
          if (!signupData.billingEmail?.includes('@')) {
            errors.push('Invalid billing email');
          }
          
          if (!signupData.primaryContactName?.trim()) {
            errors.push('Primary contact name is required');
          }
          
          return { valid: errors.length === 0, errors };
        },
        
        // STEP 4: PROCESS
        process: async (ctx, fetchedData) => {
          const tier = fetchedData.tier;
          
          // Calculate starting values from tier
          const coreFeatures = (tier.coreFeatures as string[]) || [];
          const includedPremiumFeatures = (tier.includedPremiumFeatures as string[]) || [];
          const basePrice = parseFloat(tier.basePrice || '0');
          const includedCredits = tier.includedCredits || 0;
          
          return {
            tier,
            coreFeatures,
            includedPremiumFeatures,
            baseMonthlyPrice: basePrice,
            includedCredits,
          };
        },
        
        // STEP 5: MUTATE
        mutate: async (ctx, processResult) => {
          let recordsChanged = 0;
          
          // Create new workspace/organization
          const [newOrg] = await db.insert(workspaces).values({
            name: signupData.companyName,
            ownerId: userId,
            subscriptionStatus: 'active',
            subscriptionTier: signupData.selectedTier,
          }).returning();
          recordsChanged++;
          
          ctx.workspaceId = newOrg.id;
          
          // Initialize credits for the new workspace
          try {
            const { creditManager } = await import('./billing/creditManager');
            await creditManager.initializeCredits(newOrg.id, signupData.selectedTier || 'free');
            log.info(`[Enterprise Onboarding] Credits initialized for workspace ${newOrg.id}`);
          } catch (creditError: any) {
            log.error(`[Enterprise Onboarding] Credit init failed (non-blocking):`, creditError.message);
          }
          
          // Create org subscription
          await db.insert(orgSubscriptions).values({
            workspaceId: newOrg.id,
            tierId: processResult.tier.id,
            status: 'pending_configuration',
            monthlyTotal: processResult.baseMonthlyPrice.toString(),
            creditAllocation: processResult.includedCredits,
          });
          recordsChanged++;
          
          // Create org features for core features
          for (const featureKey of processResult.coreFeatures) {
            await db.insert(orgFeatures).values({
              workspaceId: newOrg.id,
              featureKey,
              status: 'included',
              source: 'tier',
            });
            recordsChanged++;
          }
          
          // Create org features for included premium features (with monitoring)
          for (const featureKey of processResult.includedPremiumFeatures) {
            await db.insert(orgFeatures).values({
              workspaceId: newOrg.id,
              featureKey,
              status: 'included_monitored',
              source: 'tier',
              overageAllowed: true,
            });
            recordsChanged++;
          }
          
          // Create pending configuration for Phase 2
          await db.insert(pendingConfigurations).values({
            workspaceId: newOrg.id,
            tierId: processResult.tier.id,
            selectedAddons: [],
            totalMonthlyBase: processResult.baseMonthlyPrice.toString(),
            status: 'draft',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          });
          recordsChanged++;
          
          return { tables: ['workspaces', 'org_subscriptions', 'org_features', 'pending_configurations'], recordsChanged };
        },
        
        // STEP 6: CONFIRM
        confirm: async (ctx, mutationDetails) => {
          // Verify the org was created
          const [org] = await db.select()
            .from(workspaces)
            .where(eq(workspaces.id, ctx.workspaceId!))
            .limit(1);
          
          return !!org;
        },
        
        // STEP 7: NOTIFY
        notify: async (ctx, processResult) => {
          return [
            'admin:new_enterprise_signup',
            `internal:org_${ctx.workspaceId}_created`,
          ];
        },
      }
    );
    
    if (result.success) {
      // Fetch available addons for the setup context
      const addons = await db.select()
        .from(addonFeatures)
        .where(eq(addonFeatures.isActive, true));
      
      const setupContext: SetupContext = {
        orgId: result.context.workspaceId!,
        assignedTier: signupData.selectedTier,
        coreFeatures: result.result.coreFeatures,
        includedPremiumFeatures: result.result.includedPremiumFeatures,
        baseMonthlyPrice: result.result.baseMonthlyPrice,
        includedCredits: result.result.includedCredits,
        availableAddons: addons,
      };
      
      return {
        success: true,
        message: 'Signup successful. Proceed to customize your package.',
        data: setupContext,
      };
    }
    
    return {
      success: false,
      message: result.error?.message || 'Signup failed',
    };
  }
  
  // ==========================================================================
  // PHASE 2: FEATURE SELECTION & À LA CARTE
  // ==========================================================================
  
  /**
   * Process addon selection and calculate pricing
   */
  async processAddonSelection(
    workspaceId: string,
    selectedAddons: AddonSelection[],
    userId: string
  ): Promise<PhaseResult> {
    const result = await executionPipeline.execute(
      {
        workspaceId,
        operationType: 'onboarding',
        operationName: 'enterprise_addon_selection_phase2',
        initiator: userId,
        initiatorType: 'user',
        payload: { addonsCount: selectedAddons.length },
      },
      {
        // STEP 2: FETCH
        fetch: async (ctx) => {
          // Get pending config
          const [pendingConfig] = await db.select()
            .from(pendingConfigurations)
            .where(and(
              eq(pendingConfigurations.workspaceId, workspaceId),
              eq(pendingConfigurations.status, 'draft')
            ))
            .limit(1);
          
          if (!pendingConfig) {
            throw new Error('No pending configuration found');
          }
          
          // Get addon details
          const addonIds = selectedAddons.map(a => a.addonId);
          const addons = addonIds.length > 0 
            ? await db.select().from(addonFeatures).where(inArray(addonFeatures.id, addonIds))
            : [];
          
          // Get base tier price
          const [subscription] = await db.select()
            .from(orgSubscriptions)
            .where(eq(orgSubscriptions.workspaceId, workspaceId))
            .limit(1);
          
          return {
            pendingConfig,
            addons,
            subscription,
          };
        },
        
        // STEP 3: VALIDATE
        validate: async (ctx, fetchedData) => {
          const errors: string[] = [];
          
          // Check dependencies
          const selectedFeatureKeys = new Set(selectedAddons.map(a => a.featureKey));
          
          for (const addon of fetchedData.addons) {
            const dependencies = (addon.dependencies as string[]) || [];
            for (const dep of dependencies) {
              if (!selectedFeatureKeys.has(dep)) {
                errors.push(`"${addon.displayName}" requires "${dep}" to be selected`);
              }
            }
          }
          
          return { valid: errors.length === 0, errors };
        },
        
        // STEP 4: PROCESS
        process: async (ctx, fetchedData) => {
          const baseTierPrice = parseFloat(fetchedData.subscription?.monthlyTotal || '0');
          
          let flatMonthlyCost = 0;
          let estimatedCreditUsage = 0;
          const lineItems: { name: string; type: string; cost: number }[] = [];
          
          // Add base tier
          lineItems.push({
            name: 'Base Tier',
            type: 'fixed',
            cost: baseTierPrice,
          });
          
          // Calculate addon costs
          for (const addon of fetchedData.addons) {
            if (addon.pricingType === 'flat_monthly') {
              const cost = parseFloat(addon.monthlyCost || '0');
              flatMonthlyCost += cost;
              lineItems.push({
                name: addon.displayName,
                type: 'fixed',
                cost,
              });
            } else if (addon.pricingType === 'credit_based') {
              const credits = addon.creditsRequiredMonthly || 0;
              estimatedCreditUsage += credits;
              lineItems.push({
                name: addon.displayName,
                type: 'credit_based',
                cost: credits * 0.01, // Estimate based on $0.01/credit
              });
            }
          }
          
          const totalMonthlyFixed = baseTierPrice + flatMonthlyCost;
          
          // Recommend credit package based on usage
          let recommendedCreditPackage = 0;
          if (estimatedCreditUsage > 0) {
            if (estimatedCreditUsage <= 1000) recommendedCreditPackage = 1000;
            else if (estimatedCreditUsage <= 5000) recommendedCreditPackage = 5000;
            else if (estimatedCreditUsage <= 15000) recommendedCreditPackage = 15000;
            else recommendedCreditPackage = 50000;
          }
          
          const breakdown: PricingBreakdown = {
            baseMonthlyPrice: baseTierPrice,
            addonsCost: flatMonthlyCost,
            totalMonthlyFixed,
            estimatedCreditUsage,
            recommendedCreditPackage,
            lineItems,
          };
          
          return breakdown;
        },
        
        // STEP 5: MUTATE (draft only - don't commit until payment)
        mutate: async (ctx, processResult) => {
          await db.update(pendingConfigurations)
            .set({
              selectedAddons: selectedAddons.map(a => a.addonId),
              totalMonthlyBase: processResult.totalMonthlyFixed.toString(),
              estimatedMonthlyCredits: processResult.estimatedCreditUsage,
              recommendedCreditPackage: processResult.recommendedCreditPackage,
              pricingBreakdown: processResult,
              lastActivityAt: new Date(),
              status: 'ready_for_payment',
            })
            .where(eq(pendingConfigurations.workspaceId, workspaceId));
          
          return { tables: ['pending_configurations'], recordsChanged: 1 };
        },
        
        // STEP 7: NOTIFY
        notify: async (ctx, processResult) => {
          return ['dashboard:pricing_calculated'];
        },
      }
    );
    
    if (result.success) {
      return {
        success: true,
        message: 'Package configured. Ready for payment.',
        data: result.result,
      };
    }
    
    return {
      success: false,
      message: result.error?.message || 'Failed to configure package',
    };
  }
  
  // ==========================================================================
  // PHASE 3: PAYMENT & ACTIVATION
  // ==========================================================================
  
  /**
   * Process payment and activate subscription
   */
  async processPaymentAndActivation(
    workspaceId: string,
    paymentData: {
      paymentMethodId?: string;
      creditPackage?: number;
      autoTopoffEnabled?: boolean;
      autoTopoffThreshold?: number;
      autoTopoffAmount?: number;
      promoCode?: string;
    },
    userId: string
  ): Promise<PhaseResult> {
    const result = await executionPipeline.execute(
      {
        workspaceId,
        operationType: 'onboarding',
        operationName: 'enterprise_payment_phase3',
        initiator: userId,
        initiatorType: 'user',
        payload: { hasPaymentMethod: !!paymentData.paymentMethodId },
      },
      {
        // STEP 2: FETCH
        fetch: async (ctx) => {
          const [pendingConfig] = await db.select()
            .from(pendingConfigurations)
            .where(and(
              eq(pendingConfigurations.workspaceId, workspaceId),
              eq(pendingConfigurations.status, 'ready_for_payment')
            ))
            .limit(1);
          
          if (!pendingConfig) {
            throw new Error('No pending configuration ready for payment');
          }
          
          const [subscription] = await db.select()
            .from(orgSubscriptions)
            .where(eq(orgSubscriptions.workspaceId, workspaceId))
            .limit(1);
          
          const [org] = await db.select()
            .from(workspaces)
            .where(eq(workspaces.id, workspaceId))
            .limit(1);
          
          return {
            pendingConfig,
            subscription,
            org,
          };
        },
        
        // STEP 3: VALIDATE
        validate: async (ctx, fetchedData) => {
          const errors: string[] = [];
          
          // Check if credit-based features require credits
          const estimatedCredits = fetchedData.pendingConfig.estimatedMonthlyCredits || 0;
          if (estimatedCredits > 0) {
            if (!paymentData.creditPackage && !paymentData.autoTopoffEnabled) {
              errors.push('Your selected features require credits. Please add a credit package or enable auto-topoff.');
            }
          }
          
          if (!paymentData.paymentMethodId && !fetchedData.subscription?.stripeCustomerId) {
            errors.push('Payment method is required');
          }
          
          return { valid: errors.length === 0, errors };
        },
        
        // STEP 4: PROCESS
        process: async (ctx, fetchedData) => {
          let stripeCustomerId = fetchedData.subscription?.stripeCustomerId;
          let stripeSubscriptionId = fetchedData.subscription?.stripeSubscriptionId;
          
          // Process with Stripe if available
          if (stripe && paymentData.paymentMethodId) {
            try {
              // Create or get Stripe customer
              if (!stripeCustomerId) {
                const customer = await stripe.customers.create({
                  email: fetchedData.org.billingEmail || undefined,
                  name: fetchedData.org.name,
                  metadata: {
                    workspaceId,
                    tier: fetchedData.org.subscriptionTier || 'enterprise',
                  },
                // GAP-58 FIX: workspaceId is deterministic — one Stripe customer per workspace.
                }, { idempotencyKey: `cust-create-${workspaceId}` });
                stripeCustomerId = customer.id;
              }
              
              // Attach payment method
              await stripe.paymentMethods.attach(paymentData.paymentMethodId, {
                customer: stripeCustomerId,
              });
              
              // Set as default
              await stripe.customers.update(stripeCustomerId, {
                invoice_settings: {
                  default_payment_method: paymentData.paymentMethodId,
                },
              });
              
              // Create subscription
              const monthlyAmount = parseFloat(fetchedData.pendingConfig.totalMonthlyBase || '0');
              
              // For simplicity, we create a subscription with the total monthly amount
              // In production, you'd create proper price IDs for each line item
              const stripeSubscription = await stripe.subscriptions.create({
                customer: stripeCustomerId,
                items: [
                  {
                    price_data: {
                      currency: 'usd',
                      product_data: {
                        name: `CoAIleague ${fetchedData.org.subscriptionTier} Plan`,
                      },
                      unit_amount: Math.round(monthlyAmount * 100),
                      recurring: {
                        interval: 'month',
                      },
                    },
                  },
                ],
                payment_behavior: 'default_incomplete',
                payment_settings: {
                  save_default_payment_method: 'on_subscription',
                },
                expand: ['latest_invoice.payment_intent'],
              // GAP-58 FIX: Remove random UUID — workspaceId+enterprise is deterministic for this
              // subscription creation attempt. Random suffix caused duplicate enterprise subscriptions on retry.
              }, { idempotencyKey: `sub-create-${workspaceId}-enterprise` });
              
              stripeSubscriptionId = stripeSubscription.id;
              
              // Process credit package purchase if selected
              if (paymentData.creditPackage && paymentData.creditPackage > 0) {
                const creditCost = paymentData.creditPackage * BILLING.creditsToUsdRate;
                await stripe.paymentIntents.create({
                  amount: Math.round(creditCost * 100),
                  currency: 'usd',
                  customer: stripeCustomerId,
                  payment_method: paymentData.paymentMethodId,
                  confirm: true,
                  metadata: {
                    type: 'credit_purchase',
                    workspaceId,
                    credits: paymentData.creditPackage!.toString(),
                  },
                  return_url: `${getAppBaseUrl()}/onboarding/complete`,
                // GAP-58 FIX: Deterministic key (workspaceId + creditPackage) — random UUID suffix
                // would create a duplicate PaymentIntent on retry, charging the customer twice for credits.
                // 24h Stripe idempotency window also prevents accidental double-purchase within the same session.
                }, { idempotencyKey: `pi-credit-${workspaceId}-${paymentData.creditPackage}` });
              }
            } catch (stripeError: any) {
              log.error('[EnterpriseOnboarding] Stripe error:', stripeError.message);
              throw new Error(`Payment processing failed: ${stripeError.message}`);
            }
          }
          
          return {
            stripeCustomerId,
            stripeSubscriptionId,
            creditsPurchased: paymentData.creditPackage || 0,
            autoTopoffEnabled: paymentData.autoTopoffEnabled || false,
          };
        },
        
        // STEP 5: MUTATE
        mutate: async (ctx, processResult) => {
          let recordsChanged = 0;
          
          // Update organization status to active
          await db.update(workspaces)
            .set({
              subscriptionStatus: 'active',
              isSuspended: false,
            })
            .where(eq(workspaces.id, workspaceId));
          recordsChanged++;
          
          // Update subscription
          await db.update(orgSubscriptions)
            .set({
              status: 'active',
              stripeCustomerId: processResult.stripeCustomerId,
              stripeSubscriptionId: processResult.stripeSubscriptionId,
              autoTopoffEnabled: processResult.autoTopoffEnabled,
              autoTopoffThreshold: paymentData.autoTopoffThreshold,
              autoTopoffAmount: paymentData.autoTopoffAmount,
              subscriptionStartedAt: new Date(),
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              updatedAt: new Date(),
            })
            .where(eq(orgSubscriptions.workspaceId, workspaceId));
          recordsChanged++;
          
          // Move pending addons to real org_features
          const [pendingConfig] = await db.select()
            .from(pendingConfigurations)
            .where(eq(pendingConfigurations.workspaceId, workspaceId))
            .limit(1);
          
          if (pendingConfig) {
            const addonIds = (pendingConfig.selectedAddons as string[]) || [];
            
            for (const addonId of addonIds) {
              const [addon] = await db.select()
                .from(addonFeatures)
                .where(eq(addonFeatures.id, addonId))
                .limit(1);
              
              if (addon) {
                await db.insert(orgFeatures).values({
                  workspaceId,
                  featureKey: addon.featureKey,
                  status: 'addon',
                  source: 'addon',
                  addonId,
                });
                recordsChanged++;
              }
            }
            
            // Mark pending config as completed
            await db.update(pendingConfigurations)
              .set({ status: 'completed' })
              .where(eq(pendingConfigurations.id, pendingConfig.id));
            recordsChanged++;
          }
          
          return { 
            tables: ['workspaces', 'org_subscriptions', 'org_features', 'pending_configurations'], 
            recordsChanged 
          };
        },
        
        // STEP 6: CONFIRM
        confirm: async (ctx, mutationDetails) => {
          const [org] = await db.select()
            .from(workspaces)
            .where(eq(workspaces.id, workspaceId))
            .limit(1);
          
          return (org as any)?.status === 'active';
        },
        
        // STEP 7: NOTIFY
        notify: async (ctx, processResult) => {
          return [
            `email:welcome_${workspaceId}`,
            'admin:new_enterprise_activated',
            `internal:workspace_${workspaceId}_active`,
          ];
        },
      }
    );
    
    if (result.success) {
      return {
        success: true,
        message: 'Welcome to CoAIleague! Your account is now active.',
        data: {
          status: 'active',
          workspaceId,
          creditBalance: result.result.creditsPurchased,
          autoTopoffEnabled: result.result.autoTopoffEnabled,
        },
      };
    }
    
    return {
      success: false,
      message: result.error?.message || 'Payment failed',
    };
  }
  
  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================
  
  /**
   * Get onboarding status for a workspace
   */
  async getOnboardingStatus(workspaceId: string): Promise<{
    phase: 'signup' | 'configuration' | 'payment' | 'complete';
    pendingConfig?: any;
    subscription?: any;
    staffingEmail?: string;
    orgCode?: string;
    setupChecklist?: Record<string, boolean>;
  }> {
    const [org] = await db.select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    
    if (!org) {
      return { phase: 'signup' };
    }

    // Build setup checklist and staffing email
    const orgCode = (org as any).orgCode || null;
    const staffingEmail = orgCode ? `staffing-${orgCode.toLowerCase()}@coaileague.com` : null;
    const setupChecklist = {
      profile_complete: !!(org.name && (org as any).licenseNumber),
      staffing_email_known: !!orgCode,
      subscription_active: (org as any).status === 'active',
      qb_connected: false, // populated below if needed
    };
    
    if (org.status === 'active') {
      return {
        phase: 'complete',
        orgCode: orgCode ?? undefined,
        staffingEmail: staffingEmail ?? undefined,
        setupChecklist,
      };
    }
    
    const [pendingConfig] = await db.select()
      .from(pendingConfigurations)
      .where(eq(pendingConfigurations.workspaceId, workspaceId))
      .limit(1);
    
    const [subscription] = await db.select()
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.workspaceId, workspaceId))
      .limit(1);
    
    if (pendingConfig?.status === 'ready_for_payment') {
      return {
        phase: 'payment',
        pendingConfig,
        subscription,
        orgCode: orgCode ?? undefined,
        staffingEmail: staffingEmail ?? undefined,
        setupChecklist,
      };
    }
    
    if (pendingConfig?.status === 'draft') {
      return {
        phase: 'configuration',
        pendingConfig,
        subscription,
        orgCode: orgCode ?? undefined,
        staffingEmail: staffingEmail ?? undefined,
        setupChecklist,
      };
    }
    
    return {
      phase: 'signup',
      orgCode: orgCode ?? undefined,
      staffingEmail: staffingEmail ?? undefined,
      setupChecklist,
    };
  }
  
  /**
   * Get available subscription tiers
   */
  async getAvailableTiers() {
    return db.select()
      .from(subscriptionTiers)
      .where(eq(subscriptionTiers.isActive, true))
      .orderBy(subscriptionTiers.sortOrder);
  }
  
  /**
   * Get available addons
   */
  async getAvailableAddons() {
    return db.select()
      .from(addonFeatures)
      .where(eq(addonFeatures.isActive, true))
      .orderBy(addonFeatures.sortOrder);
  }
  
  /**
   * Handle abandonment tracking (called by cron)
   */
  async processAbandonedOnboardings(): Promise<number> {
    // Find pending configs that have been inactive for 10+ minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const abandoned = await db.select()
      .from(pendingConfigurations)
      .where(and(
        eq(pendingConfigurations.status, 'draft'),
        eq(pendingConfigurations.abandonmentEmailSent, false)
      ));
    
    let processed = 0;
    
    for (const config of abandoned) {
      const lastActivity = config.lastActivityAt ? new Date(config.lastActivityAt) : new Date(0);

      let adminEmail: string | null = null;
      try {
        const ownerUser = await db.query.users.findFirst({
          where: eq(users.currentWorkspaceId, config.workspaceId),
          columns: { email: true },
        });
        adminEmail = ownerUser?.email || null;
      } catch (lookupErr) {
        log.error(`[EnterpriseOnboarding] Failed to look up admin email for workspace ${config.workspaceId}:`, lookupErr);
      }
      
      if (lastActivity < tenMinutesAgo && lastActivity > oneDayAgo) {
        log.info(`[EnterpriseOnboarding] Org ${config.workspaceId} may need assistance`);
        if (adminEmail) {
          try {
            await NotificationDeliveryService.send({ type: 'onboarding_notification', workspaceId: config.workspaceId || 'system', recipientUserId: adminEmail, channel: 'email', body: { to: adminEmail, subject: 'Need help completing your CoAIleague setup?', html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h2 style="color: #2563eb;">We noticed you paused your setup</h2><p>It looks like your CoAIleague onboarding is still in progress. Need a hand?</p><p>Our team is ready to help you get up and running. Simply reply to this email or continue where you left off.</p><p style="color: #6b7280; font-size: 14px; margin-top: 30px;">CoAIleague Workforce Intelligence</p></div>` } });
          } catch (err) {
            log.error(`[EnterpriseOnboarding] Failed to send assistance email for org ${config.workspaceId}:`, err);
          }
        } else {
          log.warn(`[EnterpriseOnboarding] No admin email found for workspace ${config.workspaceId} - cannot send assistance email`);
        }
      }
      
      if (lastActivity < oneDayAgo) {
        await db.update(pendingConfigurations)
          .set({
            abandonmentEmailSent: true,
            status: 'abandoned',
          })
          .where(eq(pendingConfigurations.id, config.id));
        
        if (adminEmail) {
          try {
            await NotificationDeliveryService.send({ type: 'onboarding_notification', workspaceId: config.workspaceId || 'system', recipientUserId: adminEmail, channel: 'email', body: { to: adminEmail, subject: 'Your CoAIleague setup is waiting for you', html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h2 style="color: #2563eb;">Complete your CoAIleague setup</h2><p>You started setting up CoAIleague but haven't finished yet. Your configuration has been saved and is ready for you to continue.</p><p>Log back in to pick up right where you left off. If you have any questions, reply to this email and our team will help.</p><p style="color: #6b7280; font-size: 14px; margin-top: 30px;">CoAIleague Workforce Intelligence</p></div>` } });
            log.info(`[EnterpriseOnboarding] Sent abandonment email for org ${config.workspaceId}`);
          } catch (err) {
            log.error(`[EnterpriseOnboarding] Failed to send abandonment email for org ${config.workspaceId}:`, err);
          }
        } else {
          log.warn(`[EnterpriseOnboarding] No admin email found for workspace ${config.workspaceId} - cannot send abandonment email`);
        }
        processed++;
      }
    }
    
    return processed;
  }
}

// Export singleton instance
export const enterpriseOnboardingOrchestrator = EnterpriseOnboardingOrchestrator.getInstance();
