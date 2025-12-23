/**
 * Trial Management Service
 * 
 * Manages free trial signups and expiration
 * - 30-day free trial for new users
 * - Automatic trial expiration
 * - Upgrade prompts before trial ends
 * - Email notifications
 */

import { db } from '../../db';
import { workspaces, users, subscriptions } from '@shared/schema';
import { eq, and, lte, isNotNull, isNull } from 'drizzle-orm';
import { BILLING } from '@shared/billingConfig';
import { CreditManager } from './creditManager';

const TRIAL_DAYS = BILLING.tiers.free.trialDays;
const WARNING_DAYS = BILLING.settings.trialWarningDays;

export interface TrialStatus {
  isOnTrial: boolean;
  daysRemaining: number;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  showWarning: boolean;
  tier: string;
}

export class TrialManager {
  private static instance: TrialManager;
  private creditManager: CreditManager;

  constructor() {
    this.creditManager = new CreditManager();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TrialManager {
    if (!TrialManager.instance) {
      TrialManager.instance = new TrialManager();
    }
    return TrialManager.instance;
  }

  /**
   * Start a free trial for a workspace
   */
  async startTrial(workspaceId: string): Promise<{ success: boolean; trialEndsAt: Date; error?: string }> {
    try {
      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      if (!workspace) {
        return { success: false, trialEndsAt: new Date(), error: 'Workspace not found' };
      }

      // Check if already on a paid plan
      if (workspace.subscriptionTier && workspace.subscriptionTier !== 'free') {
        return { success: false, trialEndsAt: new Date(), error: 'Workspace already has a subscription' };
      }

      // Check if subscription record exists
      const [existingSubscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.workspaceId, workspaceId))
        .limit(1);

      if (existingSubscription?.trialStartedAt) {
        return { 
          success: false, 
          trialEndsAt: existingSubscription.trialEndsAt || new Date(), 
          error: 'Trial already started' 
        };
      }

      const trialStartedAt = new Date();
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

      // Create or update subscription record
      if (existingSubscription) {
        await db.update(subscriptions)
          .set({
            status: 'trial',
            trialStartedAt,
            trialEndsAt,
          })
          .where(eq(subscriptions.workspaceId, workspaceId));
      } else {
        await db.insert(subscriptions).values({
          workspaceId,
          plan: 'free',
          status: 'trial',
          trialStartedAt,
          trialEndsAt,
          maxEmployees: BILLING.tiers.free.maxEmployees,
        });
      }

      // Update workspace status
      await db.update(workspaces)
        .set({
          subscriptionTier: 'free',
          subscriptionStatus: 'trial',
        })
        .where(eq(workspaces.id, workspaceId));

      // Initialize free tier credits
      await this.creditManager.initializeCredits(workspaceId, 'free');

      console.log(`[TrialManager] Started trial for workspace ${workspaceId}, ends ${trialEndsAt.toISOString()}`);

      return { success: true, trialEndsAt };
    } catch (error: any) {
      console.error('[TrialManager] Failed to start trial:', error);
      return { success: false, trialEndsAt: new Date(), error: error.message };
    }
  }

  /**
   * Get trial status for a workspace
   */
  async getTrialStatus(workspaceId: string): Promise<TrialStatus> {
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      return {
        isOnTrial: false,
        daysRemaining: 0,
        trialStartedAt: null,
        trialEndsAt: null,
        showWarning: false,
        tier: 'free',
      };
    }

    // Get subscription record for trial dates
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId))
      .limit(1);

    const tier = workspace.subscriptionTier || 'free';
    const isOnTrial = workspace.subscriptionStatus === 'trial' && !!subscription?.trialEndsAt;
    
    if (!isOnTrial || !subscription?.trialEndsAt) {
      return {
        isOnTrial: false,
        daysRemaining: 0,
        trialStartedAt: subscription?.trialStartedAt || null,
        trialEndsAt: subscription?.trialEndsAt || null,
        showWarning: false,
        tier,
      };
    }

    const now = new Date();
    const trialEndsAt = new Date(subscription.trialEndsAt);
    const daysRemaining = Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    const showWarning = daysRemaining <= WARNING_DAYS && daysRemaining > 0;

    return {
      isOnTrial: daysRemaining > 0,
      daysRemaining,
      trialStartedAt: subscription.trialStartedAt,
      trialEndsAt: subscription.trialEndsAt,
      showWarning,
      tier,
    };
  }

  /**
   * Process expired trials
   * Called by daily job to expire trials and notify users
   */
  async processExpiredTrials(): Promise<{ processed: number; expired: number }> {
    console.log('[TrialManager] Processing expired trials...');

    const now = new Date();
    
    // Find subscriptions with expired trials
    const expiredTrials = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.status, 'trial'),
          isNotNull(subscriptions.trialEndsAt),
          lte(subscriptions.trialEndsAt, now)
        )
      );

    let expired = 0;

    for (const subscription of expiredTrials) {
      try {
        // Update subscription status
        await db.update(subscriptions)
          .set({
            status: 'suspended',
          })
          .where(eq(subscriptions.id, subscription.id));

        // Update workspace status
        await db.update(workspaces)
          .set({
            subscriptionStatus: 'suspended',
          })
          .where(eq(workspaces.id, subscription.workspaceId));

        // Send trial expired email
        await this.sendTrialExpiredEmail(subscription.workspaceId);

        expired++;
        console.log(`[TrialManager] Expired trial for workspace ${subscription.workspaceId}`);
      } catch (error) {
        console.error(`[TrialManager] Failed to expire trial for ${subscription.workspaceId}:`, error);
      }
    }

    console.log(`[TrialManager] Processed ${expiredTrials.length} trials, expired ${expired}`);
    return { processed: expiredTrials.length, expired };
  }

  /**
   * Send warning emails for trials ending soon
   */
  async sendTrialWarnings(): Promise<{ sent: number }> {
    console.log('[TrialManager] Sending trial warning emails...');

    const now = new Date();
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + WARNING_DAYS);

    // Find subscriptions with trials ending soon
    const expiringTrials = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.status, 'trial'),
          isNotNull(subscriptions.trialEndsAt),
          lte(subscriptions.trialEndsAt, warningDate)
        )
      );

    let sent = 0;

    for (const subscription of expiringTrials) {
      try {
        const status = await this.getTrialStatus(subscription.workspaceId);
        if (status.daysRemaining > 0 && status.daysRemaining <= WARNING_DAYS) {
          await this.sendTrialWarningEmail(subscription.workspaceId, status.daysRemaining);
          sent++;
        }
      } catch (error) {
        console.error(`[TrialManager] Failed to send warning for ${subscription.workspaceId}:`, error);
      }
    }

    console.log(`[TrialManager] Sent ${sent} trial warning emails`);
    return { sent };
  }

  /**
   * Send trial warning email
   */
  private async sendTrialWarningEmail(workspaceId: string, daysRemaining: number): Promise<void> {
    try {
      const { sendBilledEmail } = await import('../emailAutomation');
      const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      if (!workspace) return;

      const [owner] = await db.select().from(users).where(eq(users.id, workspace.ownerId)).limit(1);
      if (!owner?.email) return;

      const ownerName = (owner as any).name || (owner as any).firstName || 'there';
      
      await sendBilledEmail({
        to: owner.email,
        workspaceId,
        subject: `Your CoAIleague trial ends in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`,
        templateId: 'trial-warning',
        templateData: {
          recipientName: ownerName,
          daysRemaining,
          workspaceName: workspace.name,
          upgradeUrl: `${process.env.APP_URL || 'https://coaileague.replit.app'}/billing?tab=subscription`,
        },
      });
    } catch (error) {
      console.error('[TrialManager] Failed to send warning email:', error);
    }
  }

  /**
   * Send trial expired email
   */
  private async sendTrialExpiredEmail(workspaceId: string): Promise<void> {
    try {
      const { sendBilledEmail } = await import('../emailAutomation');
      const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      if (!workspace) return;

      const [owner] = await db.select().from(users).where(eq(users.id, workspace.ownerId)).limit(1);
      if (!owner?.email) return;

      const ownerName = (owner as any).name || (owner as any).firstName || 'there';

      await sendBilledEmail({
        to: owner.email,
        workspaceId,
        subject: 'Your CoAIleague trial has ended',
        templateId: 'trial-expired',
        templateData: {
          recipientName: ownerName,
          workspaceName: workspace.name,
          upgradeUrl: `${process.env.APP_URL || 'https://coaileague.replit.app'}/billing?tab=subscription`,
        },
      });
    } catch (error) {
      console.error('[TrialManager] Failed to send expired email:', error);
    }
  }

  /**
   * Extend trial (for special cases / support)
   */
  async extendTrial(workspaceId: string, days: number): Promise<{ success: boolean; newEndsAt: Date; error?: string }> {
    try {
      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.workspaceId, workspaceId))
        .limit(1);

      if (!subscription) {
        return { success: false, newEndsAt: new Date(), error: 'No subscription found' };
      }

      if (!subscription.trialEndsAt) {
        return { success: false, newEndsAt: new Date(), error: 'No trial to extend' };
      }

      const currentEndsAt = new Date(subscription.trialEndsAt);
      const newEndsAt = new Date(currentEndsAt);
      newEndsAt.setDate(newEndsAt.getDate() + days);

      await db.update(subscriptions)
        .set({
          trialEndsAt: newEndsAt,
          status: 'trial',
        })
        .where(eq(subscriptions.id, subscription.id));

      await db.update(workspaces)
        .set({
          subscriptionStatus: 'trial',
        })
        .where(eq(workspaces.id, workspaceId));

      console.log(`[TrialManager] Extended trial for ${workspaceId} by ${days} days to ${newEndsAt.toISOString()}`);

      return { success: true, newEndsAt };
    } catch (error: any) {
      console.error('[TrialManager] Failed to extend trial:', error);
      return { success: false, newEndsAt: new Date(), error: error.message };
    }
  }
}

export const trialManager = new TrialManager();
