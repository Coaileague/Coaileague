/**
 * TRIAL CONVERSION ORCHESTRATOR
 * ==============================
 * Handles the automated trial-to-paid conversion workflow:
 * 1. Payment method collection prompts before trial expires
 * 2. Automatic subscription activation on trial end
 * 3. Grace period handling for failed payments
 * 4. Email escalations for expired trials
 * 
 * Integrates with:
 * - TrialManager for trial status
 * - SubscriptionManager for Stripe subscriptions
 * - platformEventBus for notifications
 * - helpaiOrchestrator for AI Brain actions
 */

import { db } from '../../db';
import { workspaces, subscriptions, users, notifications } from '@shared/schema';
import { eq, and, lte, gte, isNotNull, isNull } from 'drizzle-orm';
import { TrialManager } from './trialManager';
import { SubscriptionManager, type SubscriptionTier, type BillingCycle } from './subscriptionManager';
import { CreditManager } from './creditManager';
import { platformEventBus, type PlatformEvent } from '../platformEventBus';
import { helpaiOrchestrator } from '../helpai/platformActionHub';
import { BILLING } from '@shared/billingConfig';

const GRACE_PERIOD_DAYS = 7;
const WARNING_DAYS_BEFORE_EXPIRY = [7, 3, 1];

interface ConversionResult {
  success: boolean;
  workspaceId: string;
  action: 'converted' | 'grace_period' | 'suspended' | 'notified' | 'skipped';
  message: string;
  subscriptionId?: string;
  error?: string;
}

interface TrialExpiryCheck {
  workspaceId: string;
  workspaceName: string;
  ownerEmail: string;
  daysRemaining: number;
  hasPaymentMethod: boolean;
  selectedTier?: SubscriptionTier;
}

class TrialConversionOrchestrator {
  private static instance: TrialConversionOrchestrator;
  private trialManager: TrialManager;
  private subscriptionManager: SubscriptionManager;
  private creditManager: CreditManager;

  private constructor() {
    this.trialManager = TrialManager.getInstance();
    this.subscriptionManager = SubscriptionManager.getInstance();
    this.creditManager = new CreditManager();
  }

  static getInstance(): TrialConversionOrchestrator {
    if (!TrialConversionOrchestrator.instance) {
      TrialConversionOrchestrator.instance = new TrialConversionOrchestrator();
    }
    return TrialConversionOrchestrator.instance;
  }

  /**
   * Process all trials approaching expiry
   * Called by autonomous scheduler daily
   */
  async processExpiringTrials(): Promise<{
    processed: number;
    converted: number;
    gracePeriod: number;
    suspended: number;
    notified: number;
    errors: string[];
  }> {
    console.log('[TrialConversion] Processing expiring trials...');
    
    const results = { processed: 0, converted: 0, gracePeriod: 0, suspended: 0, notified: 0, errors: [] as string[] };

    try {
      const expiringWorkspaces = await this.getExpiringTrials();
      
      for (const workspace of expiringWorkspaces) {
        results.processed++;
        
        try {
          const result = await this.processWorkspaceTrial(workspace);
          
          switch (result.action) {
            case 'converted': results.converted++; break;
            case 'grace_period': results.gracePeriod++; break;
            case 'suspended': results.suspended++; break;
            case 'notified': results.notified++; break;
          }
        } catch (error: any) {
          results.errors.push(`${workspace.workspaceId}: ${error.message}`);
        }
      }

      console.log(`[TrialConversion] Processed ${results.processed} workspaces:`, results);
      
      await platformEventBus.publish({
        type: 'trial_processing_complete',
        category: 'billing',
        title: 'Trial Expiry Processing Complete',
        description: `Processed ${results.processed} trials: ${results.converted} converted, ${results.gracePeriod} grace period, ${results.suspended} suspended`,
        metadata: results,
        visibility: 'admin',
      });

      return results;
    } catch (error: any) {
      console.error('[TrialConversion] Processing failed:', error);
      results.errors.push(error.message);
      return results;
    }
  }

  /**
   * Get all workspaces with trials expiring in next 7 days or already expired
   */
  private async getExpiringTrials(): Promise<TrialExpiryCheck[]> {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const expiringSubscriptions = await db.select({
      workspaceId: subscriptions.workspaceId,
      trialEndsAt: subscriptions.trialEndsAt,
      plan: subscriptions.plan,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, 'trial'),
        lte(subscriptions.trialEndsAt, sevenDaysFromNow),
        isNotNull(subscriptions.trialEndsAt)
      )
    );

    const results: TrialExpiryCheck[] = [];

    for (const sub of expiringSubscriptions) {
      const [workspace] = await db.select()
        .from(workspaces)
        .where(eq(workspaces.id, sub.workspaceId))
        .limit(1);

      if (!workspace) continue;

      const [owner] = await db.select()
        .from(users)
        .where(eq(users.id, workspace.ownerId))
        .limit(1);

      const daysRemaining = sub.trialEndsAt 
        ? Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      results.push({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        ownerEmail: owner?.email || '',
        daysRemaining,
        hasPaymentMethod: !!workspace.stripeCustomerId,
        selectedTier: workspace.subscriptionTier as SubscriptionTier || undefined,
      });
    }

    return results;
  }

  /**
   * Process a single workspace's trial status
   */
  private async processWorkspaceTrial(trial: TrialExpiryCheck): Promise<ConversionResult> {
    const { workspaceId, daysRemaining, hasPaymentMethod, selectedTier } = trial;

    if (daysRemaining > 0) {
      if (WARNING_DAYS_BEFORE_EXPIRY.includes(daysRemaining)) {
        await this.sendTrialExpiryWarning(trial);
        return { success: true, workspaceId, action: 'notified', message: `Sent ${daysRemaining}-day warning` };
      }
      return { success: true, workspaceId, action: 'skipped', message: 'Not at warning threshold' };
    }

    if (hasPaymentMethod && selectedTier && selectedTier !== 'free') {
      return this.attemptAutoConversion(trial);
    }

    if (daysRemaining <= 0 && daysRemaining > -GRACE_PERIOD_DAYS) {
      await this.enterGracePeriod(trial);
      return { success: true, workspaceId, action: 'grace_period', message: 'Entered grace period' };
    }

    if (daysRemaining <= -GRACE_PERIOD_DAYS) {
      await this.suspendWorkspace(trial);
      return { success: true, workspaceId, action: 'suspended', message: 'Suspended after grace period' };
    }

    return { success: true, workspaceId, action: 'skipped', message: 'No action needed' };
  }

  /**
   * Attempt automatic conversion to paid plan
   */
  private async attemptAutoConversion(trial: TrialExpiryCheck): Promise<ConversionResult> {
    const { workspaceId, selectedTier } = trial;

    try {
      const result = await this.subscriptionManager.createSubscription({
        workspaceId,
        tier: selectedTier || 'starter',
        billingCycle: 'monthly',
      });

      if (result.success) {
        await db.update(subscriptions)
          .set({ status: 'active', trialEndsAt: null })
          .where(eq(subscriptions.workspaceId, workspaceId));

        await platformEventBus.publish({
          type: 'trial_converted',
          category: 'billing',
          title: 'Trial Converted to Paid',
          description: `Workspace ${trial.workspaceName} converted to ${selectedTier} plan`,
          metadata: { workspaceId, tier: selectedTier },
          visibility: 'admin',
        });

        return {
          success: true,
          workspaceId,
          action: 'converted',
          message: `Converted to ${selectedTier}`,
          subscriptionId: result.subscriptionId,
        };
      }

      return {
        success: false,
        workspaceId,
        action: 'grace_period',
        message: 'Conversion failed, entering grace period',
        error: result.error,
      };
    } catch (error: any) {
      return {
        success: false,
        workspaceId,
        action: 'grace_period',
        message: 'Conversion error',
        error: error.message,
      };
    }
  }

  /**
   * Send trial expiry warning notification and email
   */
  private async sendTrialExpiryWarning(trial: TrialExpiryCheck): Promise<void> {
    const { workspaceId, workspaceName, ownerEmail, daysRemaining, hasPaymentMethod } = trial;

    const [workspace] = await db.select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) return;

    const urgency = daysRemaining === 1 ? 'urgent' : daysRemaining <= 3 ? 'high' : 'normal';
    const paymentPrompt = hasPaymentMethod 
      ? 'Your payment method is on file and you\'ll be charged automatically.'
      : 'Please add a payment method to continue your service.';

    await db.insert(notifications).values({
      userId: workspace.ownerId,
      workspaceId,
      type: 'system',
      title: `Trial expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`,
      message: `Your free trial for ${workspaceName} will expire soon. ${paymentPrompt}`,
      priority: urgency,
      actionUrl: '/settings/billing',
    });

    await platformEventBus.publish({
      type: 'trial_expiry_warning',
      category: 'billing',
      title: `Trial Expiry Warning (${daysRemaining} days)`,
      description: `${workspaceName} trial expires in ${daysRemaining} days`,
      metadata: { workspaceId, daysRemaining, hasPaymentMethod },
      visibility: 'workspace',
    });
  }

  /**
   * Enter grace period for expired trial
   */
  private async enterGracePeriod(trial: TrialExpiryCheck): Promise<void> {
    const { workspaceId, workspaceName, daysRemaining } = trial;

    await db.update(subscriptions)
      .set({ status: 'grace_period' })
      .where(eq(subscriptions.workspaceId, workspaceId));

    await db.update(workspaces)
      .set({ subscriptionStatus: 'grace_period' })
      .where(eq(workspaces.id, workspaceId));

    const graceDaysRemaining = GRACE_PERIOD_DAYS + daysRemaining;

    await platformEventBus.publish({
      type: 'trial_grace_period',
      category: 'billing',
      title: 'Trial Entered Grace Period',
      description: `${workspaceName} has ${graceDaysRemaining} days to add payment method`,
      metadata: { workspaceId, graceDaysRemaining },
      visibility: 'admin',
    });
  }

  /**
   * Suspend workspace after grace period expires or manual action
   * @param trial - Trial check info
   * @param reason - Reason for suspension (default: 'trial_expired')
   */
  private async suspendWorkspace(trial: TrialExpiryCheck, reason: string = 'trial_expired'): Promise<void> {
    const { workspaceId, workspaceName } = trial;

    await db.update(subscriptions)
      .set({ status: 'suspended' })
      .where(eq(subscriptions.workspaceId, workspaceId));

    await db.update(workspaces)
      .set({ subscriptionStatus: 'suspended', isActive: false, isSuspended: true })
      .where(eq(workspaces.id, workspaceId));

    const reasonDescriptions: Record<string, string> = {
      'trial_expired': 'trial and grace period expired',
      'manual_suspend': 'manual suspension by administrator',
      'payment_failed': 'repeated payment failures',
      'policy_violation': 'policy violation',
    };

    await platformEventBus.publish({
      type: 'workspace_suspended',
      category: 'billing',
      title: 'Workspace Suspended',
      description: `${workspaceName} suspended: ${reasonDescriptions[reason] || reason}`,
      metadata: { workspaceId, reason },
      visibility: 'admin',
    });
    
    console.log(`[TrialSubscription] Workspace ${workspaceId} suspended: ${reason}`);
  }

  /**
   * Reactivate a suspended workspace after payment
   * Coordinates with Stripe to resume/create subscription before updating local records
   * IMPORTANT: Aborts local activation if Stripe coordination fails to prevent state divergence
   */
  async reactivateWorkspace(workspaceId: string, newTier?: SubscriptionTier): Promise<{ success: boolean; message: string }> {
    try {
      const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      if (!workspace) {
        return { success: false, message: 'Workspace not found' };
      }

      const tier = newTier || workspace.subscriptionTier as SubscriptionTier || 'starter';
      
      // For paid tiers, Stripe coordination is REQUIRED before local activation
      if (tier !== 'free') {
        if (workspace.stripeSubscriptionId) {
          // Resume existing Stripe subscription
          const stripeResult = await this.subscriptionManager.resumeSubscription(workspaceId, tier);
          
          if (!stripeResult.success) {
            // Stripe resume failed - abort reactivation to prevent state divergence
            const errorMessage = stripeResult.error || 'Stripe subscription resume failed';
            console.error(`[TrialSubscription] Reactivation aborted - Stripe resume failed: ${errorMessage}`);
            
            await platformEventBus.publish({
              type: 'reactivation_failed',
              category: 'billing',
              title: 'Workspace Reactivation Failed',
              description: `${workspace.name} reactivation failed: ${errorMessage}`,
              metadata: { 
                workspaceId, 
                tier, 
                reason: 'stripe_resume_failed', 
                error: errorMessage,
                stripeSubscriptionId: stripeResult.subscriptionId || workspace.stripeSubscriptionId,
              },
              visibility: 'admin',
            });
            
            return { success: false, message: `Stripe resume failed: ${errorMessage}` };
          }
          
          console.log(`[TrialSubscription] Stripe subscription resumed for workspace ${workspaceId}`);
        } else {
          // No existing subscription - create a new one
          const stripeResult = await this.subscriptionManager.createSubscription({
            workspaceId,
            tier,
            billingCycle: 'monthly',
          });
          
          if (!stripeResult.success) {
            // Stripe creation failed - abort reactivation to prevent state divergence
            const errorMessage = stripeResult.error || 'Stripe subscription creation failed';
            console.error(`[TrialSubscription] Reactivation aborted - Stripe creation failed: ${errorMessage}`);
            
            await platformEventBus.publish({
              type: 'reactivation_failed',
              category: 'billing',
              title: 'Workspace Reactivation Failed',
              description: `${workspace.name} reactivation failed: ${errorMessage}`,
              metadata: { 
                workspaceId, 
                tier, 
                reason: 'stripe_creation_failed', 
                error: errorMessage,
                stripeCustomerId: workspace.stripeCustomerId,
              },
              visibility: 'admin',
            });
            
            return { success: false, message: `Stripe subscription creation failed: ${errorMessage}` };
          }
          
          console.log(`[TrialSubscription] New Stripe subscription created for workspace ${workspaceId}`);
        }
      }
      
      // Stripe coordination succeeded (or free tier) - now update local records
      // Note: For paid tiers, resumeSubscription already updated workspace state,
      // but we ensure consistency here
      await db.update(workspaces).set({
        subscriptionStatus: 'active',
        subscriptionTier: tier,
        isActive: true,
        isSuspended: false,
      }).where(eq(workspaces.id, workspaceId));

      await db.update(subscriptions).set({
        status: 'active',
        plan: tier,
      }).where(eq(subscriptions.workspaceId, workspaceId));

      // Initialize credits for the new tier
      await this.creditManager.initializeCredits(workspaceId, tier);

      await platformEventBus.publish({
        type: 'workspace_reactivated',
        category: 'billing',
        title: 'Workspace Reactivated',
        description: `${workspace.name} reactivated with ${tier} plan`,
        metadata: { workspaceId, tier, stripeCoordinated: tier !== 'free' },
        visibility: 'admin',
      });

      console.log(`[TrialSubscription] Workspace ${workspaceId} reactivated with ${tier} tier`);
      return { success: true, message: `Workspace reactivated with ${tier} plan` };
    } catch (error: any) {
      console.error('[TrialSubscription] Reactivation failed:', error);
      
      // Emit failure event for visibility
      await platformEventBus.publish({
        type: 'reactivation_failed',
        category: 'billing',
        title: 'Workspace Reactivation Failed',
        description: `Reactivation failed: ${error.message}`,
        metadata: { workspaceId, reason: 'exception', error: error.message },
        visibility: 'admin',
      });
      
      return { success: false, message: error.message };
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(workspaceId: string, reason?: string): Promise<{ success: boolean; message: string }> {
    try {
      const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      if (!workspace) {
        return { success: false, message: 'Workspace not found' };
      }

      await db.update(workspaces).set({
        subscriptionStatus: 'cancelled',
        isActive: false,
      }).where(eq(workspaces.id, workspaceId));

      await db.update(subscriptions).set({
        status: 'cancelled',
      }).where(eq(subscriptions.workspaceId, workspaceId));

      await platformEventBus.publish({
        type: 'subscription_cancelled',
        category: 'billing',
        title: 'Subscription Cancelled',
        description: `${workspace.name} subscription cancelled${reason ? `: ${reason}` : ''}`,
        metadata: { workspaceId, reason },
        visibility: 'admin',
      });

      console.log(`[TrialConversion] Subscription cancelled for workspace ${workspaceId}`);
      return { success: true, message: 'Subscription cancelled' };
    } catch (error: any) {
      console.error('[TrialConversion] Cancellation failed:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Get status of all subscriptions for monitoring
   */
  async getAllSubscriptionStatuses(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    expiringSoon: number;
    suspended: number;
    recentConversions: number;
  }> {
    const allSubs = await db.select({
      status: subscriptions.status,
      trialEndsAt: subscriptions.trialEndsAt,
    }).from(subscriptions);

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const byStatus: Record<string, number> = {};
    let expiringSoon = 0;
    let suspended = 0;

    for (const sub of allSubs) {
      const status = sub.status || 'unknown';
      byStatus[status] = (byStatus[status] || 0) + 1;
      
      if (status === 'suspended') suspended++;
      if (status === 'trial' && sub.trialEndsAt && sub.trialEndsAt <= sevenDaysFromNow) {
        expiringSoon++;
      }
    }

    return {
      total: allSubs.length,
      byStatus,
      expiringSoon,
      suspended,
      recentConversions: byStatus['active'] || 0,
    };
  }

  /**
   * Register AI Brain actions for trial conversion and subscription management
   */
  registerActions(): void {
    // Trial Actions
    helpaiOrchestrator.registerAction({
      actionId: 'trial.process_expiring',
      name: 'Process Expiring Trials',
      category: 'billing',
      description: 'Process all trials approaching expiry or expired',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request) => {
        const result = await this.processExpiringTrials();
        return { success: true, actionId: request.actionId, message: 'Trial processing complete', data: result };
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'trial.check_status',
      name: 'Check Trial Status',
      category: 'billing',
      description: 'Check trial status for a workspace',
      requiredRoles: ['support', 'admin', 'super_admin'],
      handler: async (request) => {
        const status = await this.trialManager.getTrialStatus(request.payload.workspaceId);
        return { success: true, actionId: request.actionId, message: 'Trial status retrieved', data: status };
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'trial.extend',
      name: 'Extend Trial',
      category: 'billing',
      description: 'Extend trial period for a workspace',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request) => {
        const { workspaceId, days } = request.payload;
        const result = await this.trialManager.extendTrial(workspaceId, days || 7);
        return { success: result.success, actionId: request.actionId, message: result.success ? 'Trial extended' : result.error, data: result };
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'trial.start',
      name: 'Start Trial',
      category: 'billing',
      description: 'Start a new trial for a workspace',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request) => {
        const { workspaceId } = request.payload;
        const result = await this.trialManager.startTrial(workspaceId);
        return { success: result.success, actionId: request.actionId, message: result.success ? 'Trial started' : result.error, data: result };
      },
    });

    // Subscription Lifecycle Actions
    helpaiOrchestrator.registerAction({
      actionId: 'subscription.reactivate',
      name: 'Reactivate Subscription',
      category: 'billing',
      description: 'Reactivate a suspended workspace after payment',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request) => {
        const { workspaceId, tier } = request.payload;
        const result = await this.reactivateWorkspace(workspaceId, tier);
        return { success: result.success, actionId: request.actionId, message: result.message, data: result };
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'subscription.cancel',
      name: 'Cancel Subscription',
      category: 'billing',
      description: 'Cancel a workspace subscription',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request) => {
        const { workspaceId, reason } = request.payload;
        const result = await this.cancelSubscription(workspaceId, reason);
        return { success: result.success, actionId: request.actionId, message: result.message, data: result };
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'subscription.get_all_status',
      name: 'Get All Subscription Statuses',
      category: 'billing',
      description: 'Get status summary of all subscriptions for monitoring',
      requiredRoles: ['support', 'admin', 'super_admin'],
      handler: async (request) => {
        const data = await this.getAllSubscriptionStatuses();
        return { success: true, actionId: request.actionId, message: 'Subscription statuses retrieved', data };
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'subscription.suspend',
      name: 'Suspend Subscription',
      category: 'billing',
      description: 'Manually suspend a workspace subscription',
      requiredRoles: ['admin', 'super_admin'],
      handler: async (request) => {
        const { workspaceId, reason } = request.payload;
        // Fetch workspace name for accurate event logging
        const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        await this.suspendWorkspace({
          workspaceId,
          workspaceName: workspace?.name || 'Unknown Workspace',
          ownerEmail: '',
          daysRemaining: 0,
          hasPaymentMethod: false,
        }, reason || 'manual_suspend');
        return { success: true, actionId: request.actionId, message: `Workspace ${workspaceId} suspended: ${reason || 'manual_suspend'}` };
      },
    });

    console.log('[TrialSubscription] Registered 8 AI Brain actions (4 trial + 4 subscription lifecycle)');
  }
}

export const trialConversionOrchestrator = TrialConversionOrchestrator.getInstance();

export async function initializeTrialConversionOrchestrator(): Promise<void> {
  console.log('[TrialConversion] Initializing Trial Conversion Orchestrator...');
  trialConversionOrchestrator.registerActions();
  console.log('[TrialConversion] Trial Conversion Orchestrator initialized');
}

export { TrialConversionOrchestrator };
