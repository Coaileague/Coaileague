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
import { trialManager } from './trialManager';
import { subscriptionManager, type SubscriptionTier, type BillingCycle } from './subscriptionManager';
import { TokenManager } from './tokenManager';
import { platformEventBus, type PlatformEvent } from '../platformEventBus';
import { helpaiOrchestrator } from '../helpai/platformActionHub';
import { PLATFORM } from '../../config/platformConfig';
import { BILLING } from '@shared/billingConfig';
import { universalNotificationEngine } from '../universalNotificationEngine';
import { createLogger } from '../../lib/logger';
import { isBillingExemptByRecord, logExemptedAction } from './founderExemption';

const log = createLogger('TrialConversionOrchestrator');

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
  private tokenManager: TokenManager;

  private constructor() {
    this.tokenManager = new TokenManager();
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
    log.info('Processing expiring trials');
    
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
          results.errors.push(`${workspace.workspaceId}: ${(error instanceof Error ? error.message : String(error))}`);
        }
      }

      log.info('Processed expiring workspaces', { processed: results.processed, converted: results.converted, gracePeriod: results.gracePeriod, suspended: results.suspended, notified: results.notified });
      
      await platformEventBus.publish({
        type: 'trial_processing_complete',
        category: 'announcement',
        title: 'Trial Expiry Processing Complete',
        description: `Processed ${results.processed} trials: ${results.converted} converted, ${results.gracePeriod} grace period, ${results.suspended} suspended`,
        metadata: results,
        visibility: 'org_leadership',
      });

      return results;
    } catch (error: any) {
      log.error('Processing failed', { error: (error instanceof Error ? error.message : String(error)) });
      results.errors.push((error instanceof Error ? error.message : String(error)));
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

      // FOUNDER EXEMPTION: skip billing-exempt workspaces (e.g. Statewide Protective Services)
      if (isBillingExemptByRecord(workspace)) {
        await logExemptedAction({ workspaceId: workspace.id, action: 'trial_conversion_scan_skipped', metadata: { reason: 'founder_exemption' } });
        log.info('Skipping trial conversion scan for founder-exempt workspace', { workspaceId: workspace.id });
        continue;
      }

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
      await this.downgradeToFreeAfterExpiry(trial);
      return { success: true, workspaceId, action: 'suspended', message: 'Downgraded to free after grace period' };
    }

    return { success: true, workspaceId, action: 'skipped', message: 'No action needed' };
  }

  /**
   * Attempt automatic conversion to paid plan
   */
  private async attemptAutoConversion(trial: TrialExpiryCheck): Promise<ConversionResult> {
    const { workspaceId, selectedTier } = trial;

    try {
      const result = await subscriptionManager.createSubscription({
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
          category: 'announcement',
          title: 'Trial Converted to Paid',
          description: `Workspace ${trial.workspaceName} converted to ${selectedTier} plan`,
          workspaceId,
          metadata: { workspaceId, tier: selectedTier },
          visibility: 'org_leadership',
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
        error: (error instanceof Error ? error.message : String(error)),
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

    // CLASS B FIX: Idempotency guard for trial expiry warnings
    // Check if we've already warned for this specific threshold day
    const lastWarnedAt = (workspace as any).metadata?.last_trial_warning_day;
    if (lastWarnedAt === daysRemaining) {
      log.info(`[TrialConversionOrchestrator] Skipping duplicate ${daysRemaining}-day warning for workspace ${workspaceId}`);
      return;
    }

    // Route through Trinity AI for contextual enrichment
    await universalNotificationEngine.sendNotification({
      workspaceId,
      userId: workspace.ownerId!,
      idempotencyKey: `notif-${Date.now()}`,
          type: 'system',
      title: `Free Trial Ending Soon - ${daysRemaining} Day${daysRemaining === 1 ? '' : 's'} Remaining`,
      message: `Your ${PLATFORM.name} trial for ${workspaceName} expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}. ${paymentPrompt} Upgrade now to keep all your data and continue using the platform.`,
      severity: daysRemaining === 1 ? 'critical' : daysRemaining <= 3 ? 'warning' : 'info',
      actionUrl: '/settings',
      metadata: {
        daysRemaining,
        hasPaymentMethod,
        workspaceName,
        source: 'trial_conversion_orchestrator',
      },
    });

    // Update last warned day in metadata
    await db.update(workspaces)
      .set({ 
        // @ts-expect-error — TS migration: fix in refactoring sprint
        metadata: { 
          // @ts-expect-error — TS migration: fix in refactoring sprint
          ...(workspace.metadata || {}), 
          last_trial_warning_day: daysRemaining 
        } 
      })
      .where(eq(workspaces.id, workspaceId));

    await platformEventBus.publish({
      type: 'trial_expiry_warning',
      category: 'announcement',
      title: `Trial Expiry Warning (${daysRemaining} days)`,
      description: `${workspaceName} trial expires in ${daysRemaining} days`,
      workspaceId,
      metadata: { workspaceId, daysRemaining, hasPaymentMethod },
      // @ts-expect-error — TS migration: fix in refactoring sprint
      visibility: 'workspace',
    });
  }

  /**
   * Enter grace period for expired trial
   */
  private async enterGracePeriod(trial: TrialExpiryCheck): Promise<void> {
    const { workspaceId, workspaceName, daysRemaining } = trial;

    await db.update(subscriptions)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .set({ status: 'grace_period' })
      .where(eq(subscriptions.workspaceId, workspaceId));

    await db.update(workspaces)
      .set({ subscriptionStatus: 'grace_period' })
      .where(eq(workspaces.id, workspaceId));

    const graceDaysRemaining = GRACE_PERIOD_DAYS + daysRemaining;

    await platformEventBus.publish({
      type: 'trial_grace_period',
      category: 'announcement',
      title: 'Trial Entered Grace Period',
      description: `${workspaceName} has ${graceDaysRemaining} days to add payment method`,
      workspaceId,
      metadata: { workspaceId, graceDaysRemaining },
      visibility: 'org_leadership',
    });
  }

  /**
   * Downgrade an expired-trial workspace to the free tier instead of suspending.
   * Keeps the workspace accessible under free-tier limits rather than locking users out.
   */
  private async downgradeToFreeAfterExpiry(trial: TrialExpiryCheck): Promise<void> {
    const { workspaceId, workspaceName } = trial;

    await db.update(subscriptions)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .set({ status: 'active', tier: 'free' as any })
      .where(eq(subscriptions.workspaceId, workspaceId));

    await db.update(workspaces)
      .set({ subscriptionStatus: 'active', subscriptionTier: 'free', isSuspended: false })
      .where(eq(workspaces.id, workspaceId));

    // Free-tier token allowance applies automatically once subscriptionTier is 'free'.

    await platformEventBus.publish({
      type: 'workspace_downgraded',
      category: 'announcement',
      title: 'Workspace Downgraded to Free Tier',
      description: `${workspaceName} trial expired — downgraded to free tier (no payment method on file)`,
      metadata: { workspaceId, reason: 'trial_expired_no_payment' },
      visibility: 'org_leadership',
    });

    log.info('Workspace downgraded to free after trial expiry', { workspaceId });
  }

  private async suspendWorkspace(trial: TrialExpiryCheck, reason: string = 'trial_expired'): Promise<void> {
    const { workspaceId, workspaceName } = trial;

    await db.update(subscriptions)
      .set({ status: 'suspended' })
      .where(eq(subscriptions.workspaceId, workspaceId));

    await db.update(workspaces)
      .set({ subscriptionStatus: 'suspended', isSuspended: true })
      .where(eq(workspaces.id, workspaceId));

    const reasonDescriptions: Record<string, string> = {
      'trial_expired': 'trial and grace period expired',
      'manual_suspend': 'manual suspension by administrator',
      'payment_failed': 'repeated payment failures',
      'policy_violation': 'policy violation',
    };

    await platformEventBus.publish({
      type: 'workspace_suspended',
      category: 'announcement',
      title: 'Workspace Suspended',
      description: `${workspaceName} suspended: ${reasonDescriptions[reason] || reason}`,
      metadata: { workspaceId, reason },
      visibility: 'org_leadership',
    });
    
    log.info('Workspace suspended', { workspaceId, reason });
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
          const stripeResult = await subscriptionManager.resumeSubscription(workspaceId, tier);
          
          if (!stripeResult.success) {
            const errorMessage = stripeResult.error || 'Stripe subscription resume failed';

            // If the subscription is fully cancelled in Stripe (status = canceled /
            // incomplete_expired), resuming is impossible. Fall back to creating a
            // brand-new subscription rather than aborting reactivation entirely.
            const isFullyCancelled =
              errorMessage.includes('fully cancelled') ||
              errorMessage.includes('fully canceled');

            if (isFullyCancelled) {
              log.warn('Subscription fully cancelled in Stripe — falling back to createSubscription', {
                workspaceId,
                staleSubscriptionId: workspace.stripeSubscriptionId,
                tier,
              });

              // Clear the stale subscription reference on the workspace so
              // createSubscription does not attempt another resume internally.
              await db
                .update(workspaces)
                .set({ stripeSubscriptionId: null })
                .where(eq(workspaces.id, workspaceId));

              const createResult = await subscriptionManager.createSubscription({
                workspaceId,
                tier,
                billingCycle: 'monthly',
              });

              if (!createResult.success) {
                const createError = createResult.error || 'Stripe subscription creation failed';
                log.error('Reactivation aborted — create fallback also failed', { workspaceId, createError });

                await platformEventBus.publish({
                  type: 'reactivation_failed',
                  category: 'announcement',
                  title: 'Workspace Reactivation Failed',
                  description: `${workspace.name} reactivation failed (create fallback): ${createError}`,
                  metadata: { workspaceId, tier, reason: 'stripe_create_fallback_failed', error: createError },
                  visibility: 'org_leadership',
                });

                return { success: false, message: `Stripe create fallback failed: ${createError}` };
              }

              log.info('Stripe subscription created via fallback after full cancellation', { workspaceId });
              // Fall through — local activation continues below
            } else {
              // Non-cancellation failure (e.g. payment required) — abort to prevent divergence
              log.error('Reactivation aborted - Stripe resume failed', { workspaceId, errorMessage });

              await platformEventBus.publish({
                type: 'reactivation_failed',
                category: 'announcement',
                title: 'Workspace Reactivation Failed',
                description: `${workspace.name} reactivation failed: ${errorMessage}`,
                metadata: {
                  workspaceId,
                  tier,
                  reason: 'stripe_resume_failed',
                  error: errorMessage,
                  stripeSubscriptionId: stripeResult.subscriptionId || workspace.stripeSubscriptionId,
                },
                visibility: 'org_leadership',
              });

              return { success: false, message: `Stripe resume failed: ${errorMessage}` };
            }
          }
          
          log.info('Stripe subscription resumed', { workspaceId });
        } else {
          // No existing subscription - create a new one
          const stripeResult = await subscriptionManager.createSubscription({
            workspaceId,
            tier,
            billingCycle: 'monthly',
          });
          
          if (!stripeResult.success) {
            // Stripe creation failed - abort reactivation to prevent state divergence
            const errorMessage = stripeResult.error || 'Stripe subscription creation failed';
            log.error('Reactivation aborted - Stripe creation failed', { workspaceId, errorMessage });
            
            await platformEventBus.publish({
              type: 'reactivation_failed',
              category: 'announcement',
              title: 'Workspace Reactivation Failed',
              description: `${workspace.name} reactivation failed: ${errorMessage}`,
              metadata: { 
                workspaceId, 
                tier, 
                reason: 'stripe_creation_failed', 
                error: errorMessage,
                stripeCustomerId: workspace.stripeCustomerId,
              },
              visibility: 'org_leadership',
            });
            
            return { success: false, message: `Stripe subscription creation failed: ${errorMessage}` };
          }
          
          log.info('New Stripe subscription created', { workspaceId });
        }
      }
      
      // Stripe coordination succeeded (or free tier) - now update local records
      // Note: For paid tiers, resumeSubscription already updated workspace state,
      // but we ensure consistency here
      await db.update(workspaces).set({
        subscriptionStatus: 'active',
        subscriptionTier: tier,
        isSuspended: false,
      }).where(eq(workspaces.id, workspaceId));

      await db.update(subscriptions).set({
        status: 'active',
        plan: tier,
      }).where(eq(subscriptions.workspaceId, workspaceId));

      // Token allowance is derived from subscriptionTier; no per-tier init call required.

      await platformEventBus.publish({
        type: 'workspace_reactivated',
        category: 'announcement',
        title: 'Workspace Reactivated',
        description: `${workspace.name} reactivated with ${tier} plan`,
        metadata: { workspaceId, tier, stripeCoordinated: tier !== 'free' },
        visibility: 'org_leadership',
      });

      log.info('Workspace reactivated', { workspaceId, tier });
      return { success: true, message: `Workspace reactivated with ${tier} plan` };
    } catch (error: any) {
      log.error('Reactivation failed', { error: (error instanceof Error ? error.message : String(error)), workspaceId });
      
      // Emit failure event for visibility
      await platformEventBus.publish({
        type: 'reactivation_failed',
        category: 'announcement',
        title: 'Workspace Reactivation Failed',
        description: `Reactivation failed: ${(error instanceof Error ? error.message : String(error))}`,
        metadata: { workspaceId, reason: 'exception', error: (error instanceof Error ? error.message : String(error)) },
        visibility: 'org_leadership',
      });
      
      return { success: false, message: (error instanceof Error ? error.message : String(error)) };
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
        isSuspended: true,
      }).where(eq(workspaces.id, workspaceId));

      await db.update(subscriptions).set({
        status: 'cancelled',
      }).where(eq(subscriptions.workspaceId, workspaceId));

      await platformEventBus.publish({
        type: 'subscription_cancelled',
        category: 'announcement',
        title: 'Subscription Cancelled',
        description: `${workspace.name} subscription cancelled${reason ? `: ${reason}` : ''}`,
        metadata: { workspaceId, reason },
        visibility: 'org_leadership',
      });

      log.info('Subscription cancelled', { workspaceId });
      return { success: true, message: 'Subscription cancelled' };
    } catch (error: any) {
      log.error('Cancellation failed', { error: (error instanceof Error ? error.message : String(error)), workspaceId });
      return { success: false, message: (error instanceof Error ? error.message : String(error)) };
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
      category: 'announcement',
      description: 'Process all trials approaching expiry or expired',
      requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        const result = await this.processExpiringTrials();
        return { success: true, actionId: request.actionId, message: 'Trial processing complete', data: result };
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'trial.check_status',
      name: 'Check Trial Status',
      category: 'announcement',
      description: 'Check trial status for a workspace',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const status = await trialManager.getTrialStatus(request.payload.workspaceId);
        return { success: true, actionId: request.actionId, message: 'Trial status retrieved', data: status };
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'trial.extend',
      name: 'Extend Trial',
      category: 'announcement',
      description: 'Extend trial period for a workspace',
      requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      // @ts-expect-error — TS migration: fix in refactoring sprint
      handler: async (request) => {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const { workspaceId, days } = request.payload;
        const result = await trialManager.extendTrial(workspaceId, days || 7);
        return { success: result.success, actionId: request.actionId, message: result.success ? 'Trial extended' : result.error, data: result };
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'trial.start',
      name: 'Start Trial',
      category: 'announcement',
      description: 'Start a new trial for a workspace',
      requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      // @ts-expect-error — TS migration: fix in refactoring sprint
      handler: async (request) => {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const { workspaceId } = request.payload;
        const result = await trialManager.startTrial(workspaceId);
        return { success: result.success, actionId: request.actionId, message: result.success ? 'Trial started' : result.error, data: result };
      },
    });

    // Subscription Lifecycle Actions
    helpaiOrchestrator.registerAction({
      actionId: 'subscription.reactivate',
      name: 'Reactivate Subscription',
      category: 'announcement',
      description: 'Reactivate a suspended workspace after payment',
      requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const { workspaceId, tier } = request.payload;
        const result = await this.reactivateWorkspace(workspaceId, tier);
        return { success: result.success, actionId: request.actionId, message: result.message, data: result };
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'subscription.cancel',
      name: 'Cancel Subscription',
      category: 'announcement',
      description: 'Cancel a workspace subscription',
      requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const { workspaceId, reason } = request.payload;
        const result = await this.cancelSubscription(workspaceId, reason);
        return { success: result.success, actionId: request.actionId, message: result.message, data: result };
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'subscription.get_all_status',
      name: 'Get All Subscription Statuses',
      category: 'announcement',
      description: 'Get status summary of all subscriptions for monitoring',
      requiredRoles: ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        const data = await this.getAllSubscriptionStatuses();
        return { success: true, actionId: request.actionId, message: 'Subscription statuses retrieved', data };
      },
    });

    helpaiOrchestrator.registerAction({
      actionId: 'subscription.suspend',
      name: 'Suspend Subscription',
      category: 'announcement',
      description: 'Manually suspend a workspace subscription',
      requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
      handler: async (request) => {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const { workspaceId, reason } = request.payload;
        const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
        if (!workspace) return { success: false, actionId: request.actionId, message: `Workspace ${workspaceId} not found` };
        if (isBillingExemptByRecord(workspace)) {
          await logExemptedAction({ workspaceId, action: 'subscription.suspend_trinity_action_blocked', metadata: { reason: 'founder_exemption', requestedReason: reason } });
          return { success: false, actionId: request.actionId, message: `Workspace ${workspaceId} is founder-exempt and cannot be suspended` };
        }
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

    log.info('Registered 8 AI Brain actions (4 trial + 4 subscription lifecycle)');
  }
}

export const trialConversionOrchestrator = TrialConversionOrchestrator.getInstance();

export async function initializeTrialConversionOrchestrator(): Promise<void> {
  log.info('Initializing Trial Conversion Orchestrator');
  trialConversionOrchestrator.registerActions();

  const { withDistributedLock, LOCK_KEYS } = await import('../distributedLock');

  const runDailyCheck = async () => {
    try {
      await withDistributedLock(
        LOCK_KEYS.TRIAL_EXPIRY,
        'TrialExpiryCheck',
        () => trialConversionOrchestrator.processExpiringTrials()
      );
    } catch (err: any) {
      log.error('Daily trial expiry check failed', { error: err?.message });
    }
  };

  setTimeout(runDailyCheck, 30_000).unref();
  setInterval(runDailyCheck, 24 * 60 * 60 * 1000).unref();

  log.info('Trial Conversion Orchestrator initialized — daily expiry scheduler active');
}

export { TrialConversionOrchestrator };
