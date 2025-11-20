/**
 * Credit Management Service
 * 
 * Core service for managing workspace automation credits:
 * - Check credit balance before AI operations
 * - Deduct credits when automations run
 * - Add credits from purchases or monthly allocation
 * - Track all credit transactions with full audit trail
 * 
 * Design: Credits are pre-paid "automation tokens" that users purchase to power AI features.
 * Each automation (scheduling, invoicing, payroll) costs a specific number of credits.
 */

import { db } from '../../db';
import { 
  workspaceCredits, 
  creditTransactions, 
  aiUsageEvents,
  type InsertCreditTransaction,
  type WorkspaceCredits 
} from '@shared/schema';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';

// Credit cost per feature (calibrated to AI token usage)
export const CREDIT_COSTS = {
  // AI Scheduling
  'ai_scheduling': 25,           // Full schedule generation
  'ai_schedule_optimization': 15, // Optimize existing schedule
  'ai_shift_matching': 5,         // Match employee to single shift
  
  // AI Invoicing
  'ai_invoice_generation': 15,    // Generate invoice from timesheet
  'ai_invoice_review': 3,         // Review invoice for errors
  
  // AI Payroll
  'ai_payroll_processing': 15,    // Process payroll run
  'ai_payroll_verification': 5,   // Verify payroll calculations
  
  // AI Communications
  'ai_chat_query': 5,             // HelpOS or QueryOS chat message
  'ai_email_generation': 8,       // Generate email content
  
  // AI Analytics
  'ai_analytics_report': 12,      // Generate analytics report
  'ai_predictions': 10,           // Predictive analytics
  
  // AI Migration
  'ai_migration': 10,             // Gemini Vision data extraction
  
  // General AI
  'ai_general': 3,                // Generic AI operation
} as const;

// Monthly credit allocation by subscription tier
export const TIER_CREDIT_ALLOCATIONS = {
  'free': 100,
  'starter': 500,
  'professional': 2000,
  'enterprise': 10000,
} as const;

export interface CreditCheckResult {
  hasEnoughCredits: boolean;
  currentBalance: number;
  required: number;
  shortfall: number;
}

export interface CreditDeductionResult {
  success: boolean;
  transactionId: string | null;
  newBalance: number;
  errorMessage?: string;
}

export class CreditManager {
  /**
   * Initialize credit account for a new workspace
   */
  async initializeCredits(
    workspaceId: string,
    subscriptionTier: string = 'free'
  ): Promise<WorkspaceCredits> {
    const allocation = TIER_CREDIT_ALLOCATIONS[subscriptionTier as keyof typeof TIER_CREDIT_ALLOCATIONS] || 100;
    
    // Calculate next reset (first day of next month)
    const now = new Date();
    const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
    
    const [credits] = await db.insert(workspaceCredits).values({
      workspaceId,
      currentBalance: allocation,
      monthlyAllocation: allocation,
      lastResetAt: new Date(),
      nextResetAt: nextReset,
      totalCreditsEarned: allocation,
      totalCreditsSpent: 0,
      totalCreditsPurchased: 0,
      isActive: true,
      isSuspended: false,
    }).returning();
    
    // Log initial allocation
    await db.insert(creditTransactions).values({
      workspaceId,
      transactionType: 'monthly_allocation',
      amount: allocation,
      balanceAfter: allocation,
      description: `Initial ${subscriptionTier} tier allocation`,
      actorType: 'SYSTEM',
    });
    
    return credits;
  }

  /**
   * Get current credit balance for workspace
   */
  async getBalance(workspaceId: string): Promise<number> {
    const [credits] = await db
      .select({ currentBalance: workspaceCredits.currentBalance })
      .from(workspaceCredits)
      .where(eq(workspaceCredits.workspaceId, workspaceId))
      .limit(1);
    
    if (!credits) {
      // Initialize if not exists
      const newCredits = await this.initializeCredits(workspaceId);
      return newCredits.currentBalance;
    }
    
    return credits.currentBalance;
  }

  /**
   * Get full credit account details
   */
  async getCreditsAccount(workspaceId: string): Promise<WorkspaceCredits | null> {
    const [credits] = await db
      .select()
      .from(workspaceCredits)
      .where(eq(workspaceCredits.workspaceId, workspaceId))
      .limit(1);
    
    return credits || null;
  }

  /**
   * Check if workspace has enough credits for an operation
   */
  async checkCredits(
    workspaceId: string,
    featureKey: keyof typeof CREDIT_COSTS
  ): Promise<CreditCheckResult> {
    const balance = await this.getBalance(workspaceId);
    const required = CREDIT_COSTS[featureKey] || 0;
    const hasEnough = balance >= required;
    
    return {
      hasEnoughCredits: hasEnough,
      currentBalance: balance,
      required,
      shortfall: hasEnough ? 0 : required - balance,
    };
  }

  /**
   * Deduct credits for an automation operation
   * This is the critical function called before every AI operation
   */
  async deductCredits(params: {
    workspaceId: string;
    userId?: string;
    featureKey: keyof typeof CREDIT_COSTS;
    featureName: string;
    aiUsageEventId?: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
    description?: string;
  }): Promise<CreditDeductionResult> {
    const { workspaceId, userId, featureKey, featureName, aiUsageEventId, relatedEntityType, relatedEntityId, description } = params;
    
    // Get current credits
    const credits = await this.getCreditsAccount(workspaceId);
    if (!credits) {
      return {
        success: false,
        transactionId: null,
        newBalance: 0,
        errorMessage: 'Credit account not initialized',
      };
    }
    
    // Check if suspended
    if (credits.isSuspended) {
      return {
        success: false,
        transactionId: null,
        newBalance: credits.currentBalance,
        errorMessage: credits.suspendedReason || 'Credit account is suspended',
      };
    }
    
    // Check if has enough credits
    const required = CREDIT_COSTS[featureKey] || 0;
    if (credits.currentBalance < required) {
      return {
        success: false,
        transactionId: null,
        newBalance: credits.currentBalance,
        errorMessage: `Insufficient credits. Need ${required}, have ${credits.currentBalance}`,
      };
    }
    
    // Deduct credits atomically
    const newBalance = credits.currentBalance - required;
    
    await db.update(workspaceCredits)
      .set({
        currentBalance: newBalance,
        totalCreditsSpent: credits.totalCreditsSpent + required,
        updatedAt: new Date(),
      })
      .where(eq(workspaceCredits.id, credits.id));
    
    // Log transaction
    const [transaction] = await db.insert(creditTransactions).values({
      workspaceId,
      userId,
      transactionType: 'deduction',
      amount: -required,
      balanceAfter: newBalance,
      featureKey,
      featureName,
      aiUsageEventId,
      relatedEntityType,
      relatedEntityId,
      description: description || `${featureName} - ${required} credits`,
      actorType: userId ? 'END_USER' : 'AI_AGENT',
    }).returning();
    
    return {
      success: true,
      transactionId: transaction.id,
      newBalance,
    };
  }

  /**
   * Add credits from purchase
   */
  async addPurchasedCredits(params: {
    workspaceId: string;
    userId: string;
    amount: number;
    creditPackId: string;
    stripePaymentIntentId: string;
    amountPaid: number;
    description?: string;
  }): Promise<CreditDeductionResult> {
    const { workspaceId, userId, amount, creditPackId, stripePaymentIntentId, amountPaid, description } = params;
    
    const credits = await this.getCreditsAccount(workspaceId);
    if (!credits) {
      return {
        success: false,
        transactionId: null,
        newBalance: 0,
        errorMessage: 'Credit account not initialized',
      };
    }
    
    const newBalance = credits.currentBalance + amount;
    
    // Update balance
    await db.update(workspaceCredits)
      .set({
        currentBalance: newBalance,
        totalCreditsEarned: credits.totalCreditsEarned + amount,
        totalCreditsPurchased: credits.totalCreditsPurchased + amount,
        updatedAt: new Date(),
      })
      .where(eq(workspaceCredits.id, credits.id));
    
    // Log transaction
    const [transaction] = await db.insert(creditTransactions).values({
      workspaceId,
      userId,
      transactionType: 'purchase',
      amount,
      balanceAfter: newBalance,
      creditPackId,
      stripePaymentIntentId,
      amountPaid,
      description: description || `Purchased ${amount} credits for $${amountPaid}`,
      actorType: 'END_USER',
    }).returning();
    
    return {
      success: true,
      transactionId: transaction.id,
      newBalance,
    };
  }

  /**
   * Reset monthly credits (called by cron job)
   */
  async resetMonthlyCredits(workspaceId: string): Promise<void> {
    const credits = await this.getCreditsAccount(workspaceId);
    if (!credits) return;
    
    const allocation = credits.monthlyAllocation;
    let newBalance = allocation;
    
    // Handle rollover for Enterprise tier
    if (credits.rolloverEnabled && (credits.rolloverBalance || 0) > 0) {
      const rollover = Math.min(credits.rolloverBalance || 0, credits.maxRolloverCredits || 0);
      newBalance += rollover;
    }
    
    // Calculate next reset
    const now = new Date();
    const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
    
    // Reset balance
    await db.update(workspaceCredits)
      .set({
        currentBalance: newBalance,
        rolloverBalance: 0,
        lastResetAt: now,
        nextResetAt: nextReset,
        totalCreditsEarned: credits.totalCreditsEarned + allocation,
        updatedAt: now,
      })
      .where(eq(workspaceCredits.id, credits.id));
    
    // Log transaction
    await db.insert(creditTransactions).values({
      workspaceId,
      transactionType: 'monthly_allocation',
      amount: allocation,
      balanceAfter: newBalance,
      description: `Monthly credit reset - ${allocation} credits`,
      actorType: 'SYSTEM',
    });
  }

  /**
   * Get credit transaction history
   */
  async getTransactionHistory(
    workspaceId: string,
    limit: number = 50,
    offset: number = 0
  ) {
    return await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.workspaceId, workspaceId))
      .orderBy(desc(creditTransactions.createdAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Get credit usage breakdown by feature (for current month)
   */
  async getMonthlyUsageBreakdown(workspaceId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    
    const breakdown = await db
      .select({
        featureKey: creditTransactions.featureKey,
        featureName: creditTransactions.featureName,
        totalCredits: sql<number>`SUM(ABS(${creditTransactions.amount}))`,
        operationCount: sql<number>`COUNT(*)`,
      })
      .from(creditTransactions)
      .where(
        and(
          eq(creditTransactions.workspaceId, workspaceId),
          eq(creditTransactions.transactionType, 'deduction'),
          gte(creditTransactions.createdAt, monthStart),
          lte(creditTransactions.createdAt, monthEnd)
        )
      )
      .groupBy(creditTransactions.featureKey, creditTransactions.featureName);
    
    return breakdown;
  }

  /**
   * Update tier allocation when subscription changes
   */
  async updateTierAllocation(workspaceId: string, newTier: string): Promise<void> {
    const allocation = TIER_CREDIT_ALLOCATIONS[newTier as keyof typeof TIER_CREDIT_ALLOCATIONS] || 100;
    
    await db.update(workspaceCredits)
      .set({
        monthlyAllocation: allocation,
        updatedAt: new Date(),
      })
      .where(eq(workspaceCredits.workspaceId, workspaceId));
  }
}

// Export singleton instance
export const creditManager = new CreditManager();
