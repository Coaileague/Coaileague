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

  private constructor() {
    this.trialManager = TrialManager.getInstance();
    this.subscriptionManager = SubscriptionManager.getInstance();
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
   * Suspend workspace after grace period expires
   */
  private async suspendWorkspace(trial: TrialExpiryCheck): Promise<void> {
    const { workspaceId, workspaceName } = trial;

    await db.update(subscriptions)
      .set({ status: 'suspended' })
      .where(eq(subscriptions.workspaceId, workspaceId));

    await db.update(workspaces)
      .set({ subscriptionStatus: 'suspended', isActive: false })
      .where(eq(workspaces.id, workspaceId));

    await platformEventBus.publish({
      type: 'workspace_suspended',
      category: 'billing',
      title: 'Workspace Suspended',
      description: `${workspaceName} suspended after trial and grace period expired`,
      metadata: { workspaceId, reason: 'trial_expired' },
      visibility: 'admin',
    });
  }

  /**
   * Register AI Brain actions for trial conversion
   */
  registerActions(): void {
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

    console.log('[TrialConversion] Registered 3 AI Brain actions');
  }
}

export const trialConversionOrchestrator = TrialConversionOrchestrator.getInstance();

export async function initializeTrialConversionOrchestrator(): Promise<void> {
  console.log('[TrialConversion] Initializing Trial Conversion Orchestrator...');
  trialConversionOrchestrator.registerActions();
  console.log('[TrialConversion] Trial Conversion Orchestrator initialized');
}

export { TrialConversionOrchestrator };
