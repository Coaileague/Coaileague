/**
 * Trial Management Service
 * 
 * Manages free trial signups and expiration
 * - 14-day free trial for new users
 * - Automatic trial expiration
 * - Upgrade prompts before trial ends
 * - Email notifications
 */

import { createLogger } from '../../lib/logger';
import { db } from '../../db';
import { workspaces, users, subscriptions } from '@shared/schema';
import { eq, and, lte, isNotNull, isNull } from 'drizzle-orm';
import { BILLING } from '@shared/billingConfig';
import { TokenManager } from './tokenManager';
import { getAppBaseUrl } from '../../utils/getAppBaseUrl';
import { isBillingExemptByRecord, logExemptedAction } from './founderExemption';
import { PLATFORM } from '../../config/platformConfig';

const log = createLogger('trialManager');
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
  private tokenManager: TokenManager;

  constructor() {
    this.tokenManager = new TokenManager();
  }

  /**
   * Start a free trial for a workspace
   */
  async startTrial(workspaceId: string): Promise<{ success: boolean; trialEndsAt: Date; error?: string }> {
    try {
      const [workspace] = await db
      .select({
        id: workspaces.id,
        subscriptionTier: workspaces.subscriptionTier,
        subscriptionStatus: workspaces.subscriptionStatus,
        billingExempt: workspaces.billingExempt,
        founderExemption: workspaces.founderExemption
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      return { success: false, trialEndsAt: new Date(), error: 'Workspace not found' };
    }

    // FOUNDER EXEMPTION: Never start trial for billing-exempt workspaces (e.g. Statewide Protective Services)
    if (isBillingExemptByRecord(workspace)) {
      log.info(`[TrialManager] EXEMPTED: skipping trial start for founder workspace ${workspaceId}`);
      return { success: true, trialEndsAt: new Date() };
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

      // Token tracking is event-driven — no initialization needed.

      log.info(`[TrialManager] Started trial for workspace ${workspaceId}, ends ${trialEndsAt.toISOString()}`);

      return { success: true, trialEndsAt };
    } catch (error: any) {
      log.error('[TrialManager] Failed to start trial:', error);
      return { success: false, trialEndsAt: new Date(), error: (error instanceof Error ? error.message : String(error)) };
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
    log.info('[TrialManager] Processing expired trials...');

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
        // FOUNDER EXEMPTION: Never suspend billing-exempt workspaces (e.g. Statewide Protective Services)
        const [wsRecord] = await db.select({ billingExempt: workspaces.billingExempt, founderExemption: workspaces.founderExemption })
          .from(workspaces).where(eq(workspaces.id, subscription.workspaceId)).limit(1);
        if (wsRecord && isBillingExemptByRecord(wsRecord)) {
          await logExemptedAction({ workspaceId: subscription.workspaceId, action: 'trial_expiry_suspension_skipped', metadata: { reason: 'founder_exemption' } });
          log.info(`[TrialManager] EXEMPTED: skipping trial suspension for founder workspace ${subscription.workspaceId}`);
          continue;
        }

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
        log.info(`[TrialManager] Expired trial for workspace ${subscription.workspaceId}`);
      } catch (error) {
        log.error(`[TrialManager] Failed to expire trial for ${subscription.workspaceId}:`, error);
      }
    }

    log.info(`[TrialManager] Processed ${expiredTrials.length} trials, expired ${expired}`);
    return { processed: expiredTrials.length, expired };
  }

  /**
   * Send warning emails for trials ending soon
   */
  async sendTrialWarnings(): Promise<{ sent: number }> {
    log.info('[TrialManager] Sending trial warning emails...');

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
        log.error(`[TrialManager] Failed to send warning for ${subscription.workspaceId}:`, error);
      }
    }

    log.info(`[TrialManager] Sent ${sent} trial warning emails`);
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
        subject: `Your ${PLATFORM.name} trial ends in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`,
        templateId: 'trial-warning',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        templateData: {
          recipientName: ownerName,
          daysRemaining,
          workspaceName: workspace.name,
          upgradeUrl: `${getAppBaseUrl()}/billing?tab=subscription`,
        },
      });
    } catch (error) {
      log.error('[TrialManager] Failed to send warning email:', error);
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
        subject: `Your ${PLATFORM.name} trial has ended`,
        templateId: 'trial-expired',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        templateData: {
          recipientName: ownerName,
          workspaceName: workspace.name,
          upgradeUrl: `${getAppBaseUrl()}/billing?tab=subscription`,
        },
      });
    } catch (error) {
      log.error('[TrialManager] Failed to send expired email:', error);
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

      log.info(`[TrialManager] Extended trial for ${workspaceId} by ${days} days to ${newEndsAt.toISOString()}`);

      return { success: true, newEndsAt };
    } catch (error: any) {
      log.error('[TrialManager] Failed to extend trial:', error);
      return { success: false, newEndsAt: new Date(), error: (error instanceof Error ? error.message : String(error)) };
    }
  }
}

export const trialManager = new TrialManager();
