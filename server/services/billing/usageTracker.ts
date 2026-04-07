/**
 * Usage Tracking Service
 * 
 * Tracks employee usage and calculates overages for billing
 * - Daily employee count tracking
 * - Overage detection and billing
 * - Integration with Stripe usage-based billing
 */

import { createLogger } from '../../lib/logger';
import Stripe from 'stripe';
import { getStripe } from './stripeClient';
import crypto from 'crypto';
import { db } from '../../db';
import { workspaces, employees } from '@shared/schema';
import { eq, and, count, ne, notInArray } from 'drizzle-orm';
import { TIER_PRICING, type SubscriptionTier } from './subscriptionManager';
import { BILLING, TierKey } from '@shared/billingConfig';
import { isBillingExcluded } from './billingConstants';
import { isBillingExemptByRecord, logExemptedAction } from './founderExemption';

const log = createLogger('usageTracker');
// Get tier-specific overage rate (in cents)
function getOverageRate(tier: TierKey): number {
  const rate = BILLING.overages[tier as keyof typeof BILLING.overages];
  return typeof rate === 'number' ? rate : 0;
}

// GAP-62 FIX: timeout + maxNetworkRetries are configured inside getStripe().
// Lazy proxy avoids module-load crash when STRIPE_SECRET_KEY is missing.
const stripe = new Proxy({} as Stripe, {
  get(_t, prop) {
    return (getStripe() as any)[prop];
  },
});

export interface EmployeeUsage {
  workspaceId: string;
  currentCount: number;
  maxAllowed: number;
  overageCount: number;
  overageCost: number;
}

export interface UsageSnapshot {
  workspaceId: string;
  snapshotDate: Date;
  employeeCount: number;
  maxEmployees: number;
  isOverage: boolean;
  overageAmount: number;
}

export class UsageTracker {
  /**
   * Get current employee count for a workspace
   */
  async getEmployeeCount(workspaceId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(employees)
      .where(
        and(
          eq(employees.workspaceId, workspaceId),
          eq(employees.isActive, true)
        )
      );
    
    return result[0]?.count || 0;
  }

  /**
   * Get employee usage details for a workspace
   * Uses tier-specific limits and overage rates from billingConfig
   */
  async getEmployeeUsage(workspaceId: string): Promise<EmployeeUsage> {
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const tier = (workspace.subscriptionTier || 'free') as TierKey;
    const tierConfig = BILLING.tiers[tier];
    const maxEmployees = tierConfig?.maxEmployees || 5;
    const overageRate = getOverageRate(tier);
    
    const currentCount = await this.getEmployeeCount(workspaceId);
    const overageCount = Math.max(0, currentCount - maxEmployees);
    const overageCost = overageCount * overageRate;

    return {
      workspaceId,
      currentCount,
      maxAllowed: maxEmployees,
      overageCount,
      overageCost,
    };
  }

  /**
   * Record daily usage snapshot for a workspace
   * Returns snapshot data without persisting (persisted via Stripe invoice items)
   */
  async recordDailySnapshot(workspaceId: string): Promise<UsageSnapshot> {
    const usage = await this.getEmployeeUsage(workspaceId);
    const snapshotDate = new Date();

    // Usage snapshots are recorded via Stripe invoice items when billing overages
    // This method just calculates and returns current usage

    return {
      workspaceId,
      snapshotDate,
      employeeCount: usage.currentCount,
      maxEmployees: usage.maxAllowed,
      isOverage: usage.overageCount > 0,
      overageAmount: usage.overageCount,
    };
  }

  /**
   * Bill employee overages for a workspace
   * Uses Stripe usage-based billing or creates an invoice item
   */
  async billEmployeeOverages(workspaceId: string): Promise<{ success: boolean; amount: number; error?: string }> {
    try {
      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      if (!workspace) {
        return { success: false, amount: 0, error: 'Workspace not found' };
      }

      // Founder / billing-exempt workspaces are never charged
      if (isBillingExemptByRecord(workspace)) {
        await logExemptedAction({
          workspaceId,
          action: 'usageTracker.billEmployeeOverages',
          skippedAmount: 0,
          skippedAmountUnit: 'cents',
          metadata: { reason: 'founder_exemption — employee overage billing skipped' },
        });
        return { success: true, amount: 0 };
      }

      if (!workspace.stripeCustomerId) {
        return { success: false, amount: 0, error: 'No Stripe customer found' };
      }

      const usage = await this.getEmployeeUsage(workspaceId);
      
      if (usage.overageCount <= 0) {
        return { success: true, amount: 0 };
      }

      const overageRate = getOverageRate((workspace.subscriptionTier || 'free') as TierKey);

      // Create invoice item for overages
      const invoiceItem = await stripe.invoiceItems.create({
        customer: workspace.stripeCustomerId,
        amount: usage.overageCost,
        currency: 'usd',
        description: `Employee overage: ${usage.overageCount} employees beyond ${usage.maxAllowed} limit @ $${(overageRate / 100).toFixed(0)}/employee`,
        metadata: {
          workspaceId,
          type: 'employee_overage',
          overageCount: usage.overageCount.toString(),
          currentCount: usage.currentCount.toString(),
          maxAllowed: usage.maxAllowed.toString(),
          billingDate: new Date().toISOString(),
        },
      // GAP-58 FIX: Deterministic key scoped to workspaceId + billing month.
      // crypto.randomUUID() caused duplicate overage invoice items if this function was
      // retried in the same billing period (server restart, cron overlap, etc.).
      }, { idempotencyKey: `overage-${workspaceId}-${new Date().toISOString().slice(0, 7)}` });

      log.info(`[UsageTracker] Created overage invoice item for ${workspaceId}: $${usage.overageCost / 100}`);

      return { success: true, amount: usage.overageCost };
    } catch (error: any) {
      log.error(`[UsageTracker] Failed to bill overages for ${workspaceId}:`, error);
      return { success: false, amount: 0, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  /**
   * Process all workspaces for daily usage tracking and overage billing
   */
  async processAllWorkspaces(): Promise<{ processed: number; overages: number; totalOverageCost: number }> {
    log.info('[UsageTracker] Starting daily usage processing...');

    const allWorkspaces = await db
      .select()
      .from(workspaces)
      .where(
        ne(workspaces.subscriptionTier, 'enterprise') // Enterprise has unlimited employees
      );

    let processed = 0;
    let overages = 0;
    let totalOverageCost = 0;

    for (const workspace of allWorkspaces) {
      // Skip platform, system, and support pool workspaces — never billed
      if (isBillingExcluded(workspace.id)) continue;

      try {
        // Record daily snapshot
        const snapshot = await this.recordDailySnapshot(workspace.id);
        processed++;

        // Bill overages for paid tiers only
        if (snapshot.isOverage && workspace.subscriptionTier !== 'free' && workspace.stripeCustomerId) {
          const billingResult = await this.billEmployeeOverages(workspace.id);
          if (billingResult.success && billingResult.amount > 0) {
            overages++;
            totalOverageCost += billingResult.amount;
          }
        }
      } catch (error) {
        log.error(`[UsageTracker] Error processing workspace ${workspace.id}:`, error);
      }
    }

    log.info(`[UsageTracker] Completed: ${processed} processed, ${overages} overages, $${totalOverageCost / 100} billed`);

    return { processed, overages, totalOverageCost };
  }

  /**
   * Get usage history for a workspace
   * Returns current usage as history is tracked via Stripe
   */
  async getUsageHistory(workspaceId: string, days: number = 30): Promise<any[]> {
    // Usage history is available via Stripe invoice items
    // This returns current snapshot for the dashboard
    const usage = await this.getEmployeeUsage(workspaceId);
    
    return [{
      date: new Date(),
      employeeCount: usage.currentCount,
      maxEmployees: usage.maxAllowed,
      overageCount: usage.overageCount,
      overageCost: usage.overageCost,
    }];
  }

  /**
   * Check if workspace can add more employees
   * Enforces tier-based limits with tier-specific overage rates
   */
  async canAddEmployee(workspaceId: string): Promise<{ allowed: boolean; current: number; max: number; overageRate?: number; message?: string }> {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    
    if (!workspace) {
      return { allowed: false, current: 0, max: 0, message: 'Workspace not found' };
    }

    // Founder / billing-exempt workspaces: unlimited employees, no overage
    if (isBillingExemptByRecord(workspace)) {
      const currentCount = await this.getEmployeeCount(workspaceId);
      return { allowed: true, current: currentCount, max: 999999 };
    }

    const tier = (workspace.subscriptionTier || 'free') as TierKey;
    const usage = await this.getEmployeeUsage(workspaceId);
    const overageRate = getOverageRate(tier);
    
    // Free tier: hard cap - no overages allowed
    if (tier === 'free' && usage.currentCount >= usage.maxAllowed) {
      return {
        allowed: false,
        current: usage.currentCount,
        max: usage.maxAllowed,
        message: 'Free trial limit reached (5 employees). Upgrade to add more employees.',
      };
    }

    // Paid tiers: allow with overage billing
    if (usage.currentCount >= usage.maxAllowed) {
      const tierConfig = BILLING.tiers[tier];
      const rateDisplay = overageRate / 100;
      
      return {
        allowed: true,
        current: usage.currentCount,
        max: usage.maxAllowed,
        overageRate,
        message: `Adding employees beyond your ${usage.maxAllowed} limit will incur an overage charge of $${rateDisplay}/employee/month.`,
      };
    }

    return {
      allowed: true,
      current: usage.currentCount,
      max: usage.maxAllowed,
    };
  }

  /**
   * Get AI credit usage for a workspace with tier-based limits
   */
  async getAICreditUsage(workspaceId: string): Promise<{
    balance: number;
    monthlyAllocation: number;
    usedThisMonth: number;
    allowsOverage: boolean;
    overagePackPrice?: number;
    message?: string;
  }> {
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const tier = (workspace.subscriptionTier || 'free') as TierKey;
    const tierConfig = BILLING.tiers[tier];
    const monthlyAllocation = tierConfig.monthlyCredits;
    const allowsOverage = tierConfig.allowCreditOverage ?? false;
    
    // Get credit balance from credits ledger (would integrate with creditsLedgerService)
    // For now, return the monthly allocation as balance
    const balance = monthlyAllocation;
    const usedThisMonth = 0; // Would track from credits ledger
    
    let message: string | undefined;
    if (!allowsOverage && balance <= 0) {
      if (tier === 'free') {
        message = 'Trial credits exhausted. Upgrade to continue using AI features.';
      } else if (tier === 'starter') {
        message = 'Monthly credits exhausted. Upgrade to Professional or purchase an AI credit pack ($59/5,000 credits).';
      }
    }

    return {
      balance,
      monthlyAllocation,
      usedThisMonth,
      allowsOverage,
      overagePackPrice: allowsOverage && tier === 'professional' ? 5900 : undefined,
      message,
    };
  }
}

export const usageTracker = new UsageTracker();
