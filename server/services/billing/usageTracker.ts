/**
 * Usage Tracking Service
 * 
 * Tracks employee usage and calculates overages for billing
 * - Daily employee count tracking
 * - Overage detection and billing
 * - Integration with Stripe usage-based billing
 */

import Stripe from 'stripe';
import { db } from '../../db';
import { workspaces, employees } from '@shared/schema';
import { eq, and, count, ne } from 'drizzle-orm';
import { TIER_PRICING, type SubscriptionTier } from './subscriptionManager';
import { BILLING } from '@shared/billingConfig';

const EMPLOYEE_OVERAGE_RATE = BILLING.overages.perEmployee;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
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

    const tier = (workspace.subscriptionTier || 'free') as SubscriptionTier;
    const tierConfig = TIER_PRICING[tier];
    const maxEmployees = tierConfig?.maxEmployees || 5;
    
    const currentCount = await this.getEmployeeCount(workspaceId);
    const overageCount = Math.max(0, currentCount - maxEmployees);
    const overageCost = overageCount * EMPLOYEE_OVERAGE_RATE;

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

      if (!workspace || !workspace.stripeCustomerId) {
        return { success: false, amount: 0, error: 'No Stripe customer found' };
      }

      const usage = await this.getEmployeeUsage(workspaceId);
      
      if (usage.overageCount <= 0) {
        return { success: true, amount: 0 };
      }

      // Create invoice item for overages
      const invoiceItem = await stripe.invoiceItems.create({
        customer: workspace.stripeCustomerId,
        amount: usage.overageCost,
        currency: 'usd',
        description: `Employee overage: ${usage.overageCount} employees beyond ${usage.maxAllowed} limit @ $${(EMPLOYEE_OVERAGE_RATE / 100).toFixed(0)}/employee`,
        metadata: {
          workspaceId,
          type: 'employee_overage',
          overageCount: usage.overageCount.toString(),
          currentCount: usage.currentCount.toString(),
          maxAllowed: usage.maxAllowed.toString(),
          billingDate: new Date().toISOString(),
        },
      });

      console.log(`[UsageTracker] Created overage invoice item for ${workspaceId}: $${usage.overageCost / 100}`);

      return { success: true, amount: usage.overageCost };
    } catch (error: any) {
      console.error(`[UsageTracker] Failed to bill overages for ${workspaceId}:`, error);
      return { success: false, amount: 0, error: error.message };
    }
  }

  /**
   * Process all workspaces for daily usage tracking and overage billing
   */
  async processAllWorkspaces(): Promise<{ processed: number; overages: number; totalOverageCost: number }> {
    console.log('[UsageTracker] Starting daily usage processing...');

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
        console.error(`[UsageTracker] Error processing workspace ${workspace.id}:`, error);
      }
    }

    console.log(`[UsageTracker] Completed: ${processed} processed, ${overages} overages, $${totalOverageCost / 100} billed`);

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
   */
  async canAddEmployee(workspaceId: string): Promise<{ allowed: boolean; current: number; max: number; message?: string }> {
    const usage = await this.getEmployeeUsage(workspaceId);
    
    // Free tier: strict limit
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (workspace?.subscriptionTier === 'free' && usage.currentCount >= usage.maxAllowed) {
      return {
        allowed: false,
        current: usage.currentCount,
        max: usage.maxAllowed,
        message: 'Free tier limit reached. Upgrade to add more employees.',
      };
    }

    // Paid tiers: allow with overage billing
    if (usage.currentCount >= usage.maxAllowed) {
      return {
        allowed: true,
        current: usage.currentCount,
        max: usage.maxAllowed,
        message: `Adding employees beyond your ${usage.maxAllowed} limit will incur an overage charge of $${EMPLOYEE_OVERAGE_RATE / 100}/employee/month.`,
      };
    }

    return {
      allowed: true,
      current: usage.currentCount,
      max: usage.maxAllowed,
    };
  }
}

export const usageTracker = new UsageTracker();
