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
  workspaces,
  type InsertCreditTransaction,
  type WorkspaceCredits 
} from '@shared/schema';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { getUserPlatformRole, hasPlatformWideAccess, getUserWorkspaceRole, type PlatformRole } from '../../rbac';

// ============================================================================
// UNLIMITED CREDITS FOR PRIVILEGED USERS
// ============================================================================

/**
 * Roles that receive unlimited credits:
 * - Platform staff: root_admin, deputy_admin, sysop, support_manager, support_agent
 * - Workspace owners (org_owner role)
 */
const UNLIMITED_CREDIT_ROLES: PlatformRole[] = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];

/**
 * Check if a user has unlimited credits based on:
 * 1. Platform-wide access (support/admin roles) - ALWAYS unlimited
 * 2. Being workspace owner with PAID subscription (not trial) - unlimited
 * 
 * Trial accounts should NOT get unlimited credits - they see their trial allocation
 */
export async function isUnlimitedCreditUser(userId: string, workspaceId: string): Promise<boolean> {
  // Check platform role first (most privileged) - always unlimited
  const platformRole = await getUserPlatformRole(userId);
  if (hasPlatformWideAccess(platformRole)) {
    return true;
  }
  
  // Check if user owns the workspace
  const [workspace] = await db.select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  
  if (!workspace) {
    return false;
  }
  
  // Trial accounts do NOT get unlimited credits - they see their trial allocation
  // Only paid subscriptions get unlimited for owners
  const paidTiers = ['starter', 'professional', 'enterprise', 'unlimited'];
  const isPaidSubscription = paidTiers.includes(workspace.subscriptionTier || '');
  
  // Check if workspace is on active trial - trial users see their trial credits
  const isOnTrial = workspace.status === 'trial' && workspace.trialExpiresAt && new Date(workspace.trialExpiresAt) > new Date();
  
  // Owners only get unlimited if they have a PAID subscription (not trial)
  if (workspace.ownerId === userId && isPaidSubscription && !isOnTrial) {
    return true;
  }
  
  // Check if user has org_owner workspace role with paid subscription
  const { role } = await getUserWorkspaceRole(userId, workspaceId);
  if (role === 'org_owner' && isPaidSubscription && !isOnTrial) {
    return true;
  }
  
  return false;
}

/**
 * Sentinel value for unlimited credits display
 */
export const UNLIMITED_CREDITS_BALANCE = 999999999;

// Credit cost per feature (calibrated to Gemini 3 API costs Jan 2026)
// 1 credit = $0.01 | Gemini 3 Pro: $2/1M input, $12/1M output (thinking tokens at output rate)
// Gemini 3 Flash: $0.50/1M input, $3/1M output
// Thinking mode adds 2K-5K extra output tokens per request
// Pricing: Actual cost × 4x margin = fair credits
// 
// Example: Schedule generation (Gemini 3 Flash with thinking)
//          2K input + 4K thinking + 1.5K response = $0.018 actual
//          With 4x margin = $0.072, so ~7 credits is fair
export const CREDIT_COSTS = {
  // AI Scheduling - Gemini 3 Flash with thinking (~7K output tokens)
  'ai_scheduling': 7,             // Full schedule generation
  'ai_schedule_optimization': 5,  // Optimize existing schedule
  'ai_shift_matching': 2,         // Match employee to single shift
  'ai_open_shift_fill': 3,        // AI-powered open shift auto-fill
  
  // AI Invoicing - Gemini 3 Flash with thinking (~5K output tokens)
  'ai_invoice_generation': 5,     // Generate invoice from timesheet
  'ai_invoice_review': 2,         // Review invoice for errors
  'invoice_gap_analysis': 3,      // Analyze unbilled revenue gaps
  
  // AI Payroll - Gemini 3 Flash with thinking (~6K output tokens)
  'ai_payroll_processing': 6,     // Process payroll run
  'ai_payroll_verification': 2,   // Verify payroll calculations
  'payroll_anomaly_insights': 3,  // Anomaly detection insights
  
  // AI Communications - Gemini 3 Flash (~3K output tokens)
  'ai_chat_query': 2,             // HelpAI or QueryOS chat message
  'ai_email_generation': 3,       // Generate email content
  
  // AI Analytics - Gemini 3 Flash with thinking (~5K output)
  'ai_analytics_report': 5,       // Generate analytics report
  'ai_predictions': 4,            // Predictive analytics
  
  // AI Migration - Gemini 3 Pro Vision (~4K output)
  'ai_migration': 8,              // Gemini Vision data extraction (uses Pro)
  
  // QuickBooks Integration - Gemini 3 Flash (~4K output)
  'quickbooks_error_analysis': 3, // Error analysis and retry strategy
  
  // Scheduling Subagent - Gemini 3 Flash with thinking
  'schedule_optimization': 5,     // Schedule optimization
  'strategic_schedule_optimization': 7, // Strategic scheduling (Pro model)
  
  // Domain Operations - Gemini 3 Flash (~2K output)
  'log_analysis': 2,              // Log analysis
  
  // General AI - Gemini 3 Flash (~2K output)
  'ai_general': 2,                // Generic AI operation
  
  // Trinity Conversations (FREE - no credits charged)
  'trinity_thought': 0,           // Trinity thought bubbles
  'trinity_chat': 0,              // Trinity conversations
  'trinity_insight': 0,           // Trinity insights
  'mascot_ask': 0,                // Mascot ask endpoint
  'mascot_advice': 0,             // Mascot business advice
  'mascot_insight': 0,            // Mascot insights
  'helpai_chat': 0,               // HelpAI conversations
} as const;

// ============================================================================
// CREDIT-EXEMPT FEATURES
// These features use AI tokens but don't charge workspace credits
// Trinity conversations are free to encourage engagement and showcase value
// ============================================================================
export const CREDIT_EXEMPT_FEATURES = new Set([
  // Trinity mascot features - FREE (tokens used, no credits charged)
  'trinity_thought',
  'trinity_chat', 
  'trinity_insight',
  'mascot_ask',
  'mascot_advice',
  'mascot_insight',
  'helpai_chat',
  // Guest mode features - FREE to showcase platform
  'guest_demo',
  'public_demo',
]);

// Monthly credit allocation by subscription tier
// Rebalanced Jan 2026 for Gemini 3 pricing (1 credit = $0.01)
// Generous allocations so customers don't feel nickel-and-dimed
export const TIER_CREDIT_ALLOCATIONS = {
  'free': 100,          // ~14 schedules or 50 chats - enough to try the platform
  'trial': 300,         // ~42 schedules - generous trial to fully test features
  'starter': 1000,      // ~142 schedules/month ($10 value at cost)
  'professional': 5000, // ~714 schedules/month - feels unlimited
  'enterprise': 25000,  // ~3571 schedules/month - truly unlimited for large orgs
} as const;

export interface CreditCheckResult {
  hasEnoughCredits: boolean;
  currentBalance: number;
  required: number;
  shortfall: number;
  unlimitedCredits?: boolean;
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
   * Get credit account with unlimited status check
   * Returns account info with unlimitedCredits flag
   */
  async getCreditsAccountWithStatus(workspaceId: string, userId?: string): Promise<{
    credits: WorkspaceCredits | null;
    unlimitedCredits: boolean;
    effectiveBalance: number;
  }> {
    // Check if user has unlimited credits
    if (userId) {
      const hasUnlimited = await isUnlimitedCreditUser(userId, workspaceId);
      if (hasUnlimited) {
        return {
          credits: null,
          unlimitedCredits: true,
          effectiveBalance: UNLIMITED_CREDITS_BALANCE,
        };
      }
    }
    
    const credits = await this.getCreditsAccount(workspaceId);
    return {
      credits,
      unlimitedCredits: false,
      effectiveBalance: credits?.currentBalance || 0,
    };
  }

  /**
   * Check if workspace has enough credits for an operation
   * Bypasses credit check for:
   * - Users with unlimited credits (support/owners)
   * - Credit-exempt features (Trinity conversations)
   */
  async checkCredits(
    workspaceId: string,
    featureKey: keyof typeof CREDIT_COSTS,
    userId?: string
  ): Promise<CreditCheckResult> {
    // Check if feature is credit-exempt (Trinity conversations are FREE)
    if (CREDIT_EXEMPT_FEATURES.has(featureKey)) {
      return {
        hasEnoughCredits: true,
        currentBalance: -1, // Sentinel: feature was exempt
        required: 0,
        shortfall: 0,
        unlimitedCredits: false, // Not unlimited, just exempt
      };
    }
    
    // Check if user has unlimited credits
    if (userId) {
      const hasUnlimited = await isUnlimitedCreditUser(userId, workspaceId);
      if (hasUnlimited) {
        return {
          hasEnoughCredits: true,
          currentBalance: UNLIMITED_CREDITS_BALANCE,
          required: 0,
          shortfall: 0,
          unlimitedCredits: true,
        };
      }
    }
    
    const balance = await this.getBalance(workspaceId);
    const required = CREDIT_COSTS[featureKey] || 0;
    const hasEnough = balance >= required;
    
    return {
      hasEnoughCredits: hasEnough,
      currentBalance: balance,
      required,
      shortfall: hasEnough ? 0 : required - balance,
      unlimitedCredits: false,
    };
  }

  /**
   * Deduct credits for an automation operation
   * This is the critical function called before every AI operation
   * Bypasses deduction for:
   * - Users with unlimited credits (support/owners)
   * - Credit-exempt features (Trinity conversations, guest demos)
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
    amountOverride?: number; // For FAST mode multipliers - overrides base cost
  }): Promise<CreditDeductionResult> {
    const { workspaceId, userId, featureKey, featureName, aiUsageEventId, relatedEntityType, relatedEntityId, description, amountOverride } = params;
    
    // Check if feature is credit-exempt (Trinity conversations are FREE)
    if (CREDIT_EXEMPT_FEATURES.has(featureKey)) {
      console.log(`[CreditManager] Feature "${featureKey}" is credit-exempt (Trinity conversations are FREE)`);
      return {
        success: true,
        transactionId: null,
        newBalance: -1, // Sentinel: feature was exempt, balance not queried
      };
    }
    
    // Check if user has unlimited credits - bypass deduction
    if (userId) {
      const hasUnlimited = await isUnlimitedCreditUser(userId, workspaceId);
      if (hasUnlimited) {
        console.log(`[CreditManager] Bypassing credit deduction for unlimited user: ${userId}`);
        return {
          success: true,
          transactionId: null,
          newBalance: UNLIMITED_CREDITS_BALANCE,
        };
      }
    }
    
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
    
    // Check if has enough credits - use amountOverride for FAST mode multipliers
    const baseCost = CREDIT_COSTS[featureKey] || 0;
    const required = amountOverride ?? baseCost;
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
    const transactionData: InsertCreditTransaction = {
      workspaceId,
      userId,
      transactionType: 'purchase',
      amount,
      balanceAfter: newBalance,
      creditPackId,
      stripePaymentIntentId,
      amountPaid: String(amountPaid),
      description: description || `Purchased ${amount} credits for $${amountPaid}`,
      actorType: 'END_USER',
    };
    
    const [transaction] = await db.insert(creditTransactions).values(transactionData).returning();
    
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
