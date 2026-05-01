/**
 * SubagentBanker - AI Brain Credit Pre-Authorization & Ledger Management
 * 
 * Handles the subscriber-pays-all model by:
 * 1. Simulating workload to estimate credits BEFORE execution
 * 2. Requiring user agreement before proceeding
 * 3. Deducting credits atomically with full ledger tracking
 * 4. Managing credit refills and balance monitoring
 * 
 * Flow: Simulate → Quote → Agree → Reserve → Execute → Finalize
 */

import crypto from 'crypto';
import { db } from '../../db';
import { 
  workspaces,
  users
} from '@shared/schema';
import { tokenManager } from '../../services/billing/tokenManager';
import { eq, and, sql, desc, gte } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import { createLogger } from '../../lib/logger';
const log = createLogger('subagentBanker');

export interface WorkloadSimulation {
  taskType: string;
  complexity: 'simple' | 'standard' | 'complex' | 'enterprise';
  estimatedTokens: number;
  estimatedAgents: number;
  estimatedDurationMs: number;
  baseCredits: number;
  multiplier: number;
  totalCredits: number;
  breakdown: CreditBreakdown;
}

export interface CreditBreakdown {
  aiInference: number;
  agentOrchestration: number;
  dataProcessing: number;
  fastModeBonus: number;
  platformFee: number;
}

export interface CreditQuote {
  quoteId: string;
  workspaceId: string;
  userId: string;
  simulation: WorkloadSimulation;
  currentBalance: number;
  balanceAfter: number;
  canProceed: boolean;
  insufficientBy: number;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreditReservation {
  reservationId: string;
  quoteId: string;
  workspaceId: string;
  userId: string;
  credits: number;
  status: 'reserved' | 'consumed' | 'released' | 'expired';
  taskId?: string;
  reservedAt: Date;
  expiresAt: Date;
}

export interface LedgerEntry {
  id: string;
  workspaceId: string;
  userId: string | null;
  type: 'debit' | 'credit';
  amount: number;
  balanceAfter: number;
  category: string;
  description: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface RefillResult {
  success: boolean;
  creditsAdded: number;
  newBalance: number;
  transactionId?: string;
  error?: string;
}

const COMPLEXITY_MULTIPLIERS = {
  simple: 1.0,
  standard: 1.5,
  complex: 2.5,
  enterprise: 4.0
};

const TASK_BASE_COSTS = {
  chat: 5,
  scheduling: 10,
  payroll: 15,
  compliance: 12,
  analytics: 8,
  billing: 10,
  hr: 12,
  support: 6,
  automation: 20,
  general: 8
};

const FAST_MODE_MULTIPLIERS = {
  normal: 1.0,
  fast: 1.5,
  turbo: 2.0,
  instant: 3.0
};

class SubagentBanker {
  private static instance: SubagentBanker;
  private activeQuotes: Map<string, CreditQuote> = new Map();
  private activeReservations: Map<string, CreditReservation> = new Map();
  
  private constructor() {
    log.info('[SubagentBanker] Initializing AI Brain Credit Management...');
    
    setInterval(() => this.cleanupExpiredQuotes(), 60000).unref();
    setInterval(() => this.cleanupExpiredReservations(), 30000).unref();
  }
  
  static getInstance(): SubagentBanker {
    if (!SubagentBanker.instance) {
      SubagentBanker.instance = new SubagentBanker();
    }
    return SubagentBanker.instance;
  }

  /**
   * Step 1: Simulate workload to estimate credits needed
   */
  async simulateWorkload(params: {
    taskType: string;
    content: string;
    executionMode: 'normal' | 'fast' | 'turbo' | 'instant';
    workspaceId: string;
    userId: string;
  }): Promise<WorkloadSimulation> {
    const { taskType, content, executionMode, workspaceId, userId } = params;
    
    const complexity = this.analyzeComplexity(content);
    const baseCost = TASK_BASE_COSTS[taskType as keyof typeof TASK_BASE_COSTS] || TASK_BASE_COSTS.general;
    const complexityMultiplier = COMPLEXITY_MULTIPLIERS[complexity];
    const modeMultiplier = FAST_MODE_MULTIPLIERS[executionMode];
    
    const estimatedTokens = Math.ceil(content.length / 4);
    const tokenCredits = Math.ceil(estimatedTokens / 100);
    
    const estimatedAgents = this.estimateAgentCount(taskType, complexity, executionMode);
    
    const aiInference = tokenCredits + baseCost;
    const agentOrchestration = Math.ceil(estimatedAgents * 2);
    const dataProcessing = Math.ceil(complexity === 'enterprise' ? 5 : complexity === 'complex' ? 3 : 1);
    const fastModeBonus = executionMode !== 'normal' ? Math.ceil((aiInference + agentOrchestration) * (modeMultiplier - 1)) : 0;
    const platformFee = Math.ceil((aiInference + agentOrchestration + dataProcessing + fastModeBonus) * 0.1);
    
    const baseCredits = aiInference + agentOrchestration + dataProcessing;
    const totalCredits = baseCredits + fastModeBonus + platformFee;
    
    const estimatedDurationMs = this.estimateDuration(complexity, executionMode, estimatedAgents);
    
    log.info(`[SubagentBanker] Simulated workload: ${totalCredits} credits for ${taskType} (${complexity}/${executionMode})`);
    
    return {
      taskType,
      complexity,
      estimatedTokens,
      estimatedAgents,
      estimatedDurationMs,
      baseCredits,
      multiplier: modeMultiplier,
      totalCredits,
      breakdown: {
        aiInference,
        agentOrchestration,
        dataProcessing,
        fastModeBonus,
        platformFee
      }
    };
  }

  /**
   * Step 2: Generate a credit quote for user approval
   */
  async generateQuote(params: {
    workspaceId: string;
    userId: string;
    simulation: WorkloadSimulation;
    validityMinutes?: number;
  }): Promise<CreditQuote> {
    const { workspaceId, userId, simulation, validityMinutes = 5 } = params;
    
    const currentBalance = await tokenManager.getBalance(workspaceId);
    const balanceAfter = currentBalance - simulation.totalCredits;
    const canProceed = balanceAfter >= 0;
    const insufficientBy = canProceed ? 0 : Math.abs(balanceAfter);
    
    const quoteId = `quote_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`;
    const expiresAt = new Date(Date.now() + validityMinutes * 60 * 1000);
    
    const quote: CreditQuote = {
      quoteId,
      workspaceId,
      userId,
      simulation,
      currentBalance,
      balanceAfter,
      canProceed,
      insufficientBy,
      expiresAt,
      createdAt: new Date()
    };
    
    this.activeQuotes.set(quoteId, quote);
    
    log.info(`[SubagentBanker] Generated quote ${quoteId}: ${simulation.totalCredits} credits (can proceed: ${canProceed})`);
    
    return quote;
  }

  /**
   * Step 3: User agrees to the quote - reserve credits
   */
  async reserveCredits(params: {
    quoteId: string;
    taskId?: string;
  }): Promise<{ success: boolean; reservation?: CreditReservation; error?: string }> {
    const { quoteId, taskId } = params;
    
    const quote = this.activeQuotes.get(quoteId);
    if (!quote) {
      return { success: false, error: 'Quote not found or expired' };
    }
    
    if (new Date() > quote.expiresAt) {
      this.activeQuotes.delete(quoteId);
      return { success: false, error: 'Quote has expired' };
    }
    
    if (!quote.canProceed) {
      return { 
        success: false, 
        error: `Insufficient credits. Need ${quote.simulation.totalCredits}, have ${quote.currentBalance}. Add ${quote.insufficientBy} more credits.` 
      };
    }
    
    const freshBalance = await tokenManager.getBalance(quote.workspaceId);
    
    if (freshBalance < quote.simulation.totalCredits) {
      return { 
        success: false, 
        error: `Balance changed. Current balance: ${freshBalance}, need: ${quote.simulation.totalCredits}` 
      };
    }
    
    const reservationId = `res_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    
    const reservation: CreditReservation = {
      reservationId,
      quoteId,
      workspaceId: quote.workspaceId,
      userId: quote.userId,
      credits: quote.simulation.totalCredits,
      status: 'reserved',
      taskId,
      reservedAt: new Date(),
      expiresAt
    };
    
    this.activeReservations.set(reservationId, reservation);
    this.activeQuotes.delete(quoteId);
    
    log.info(`[SubagentBanker] Reserved ${reservation.credits} credits (${reservationId}) for workspace ${quote.workspaceId}`);
    
    return { success: true, reservation };
  }

  /**
   * Step 4: Consume reserved credits after successful execution
   */
  async consumeReservation(params: {
    reservationId: string;
    actualCredits?: number;
    taskId: string;
    success: boolean;
  }): Promise<{ success: boolean; creditsDeducted: number; newBalance: number; error?: string }> {
    const { reservationId, actualCredits, taskId, success: taskSuccess } = params;
    
    const reservation = this.activeReservations.get(reservationId);
    if (!reservation) {
      return { success: false, creditsDeducted: 0, newBalance: 0, error: 'Reservation not found' };
    }
    
    if (reservation.status !== 'reserved') {
      return { success: false, creditsDeducted: 0, newBalance: 0, error: `Reservation already ${reservation.status}` };
    }
    
    const creditsToDeduct = actualCredits ?? reservation.credits;
    
    if (!taskSuccess) {
      reservation.status = 'released';
      this.activeReservations.delete(reservationId);
      log.info(`[SubagentBanker] Released reservation ${reservationId} due to task failure`);
      return { success: true, creditsDeducted: 0, newBalance: 0 };
    }
    
    const deductResult = await tokenManager.recordUsage({
      workspaceId: reservation.workspaceId,
      userId: reservation.userId,
      featureKey: 'ai_general',
      featureName: 'Task Execution',
      amountOverride: creditsToDeduct,
      relatedEntityType: 'automation_task',
      relatedEntityId: taskId,
      description: `Task execution: ${taskId.substring(0, 8)}`,
    });
    
    if (!deductResult.success) {
      reservation.status = 'released';
      this.activeReservations.delete(reservationId);
      return { 
        success: false, 
        creditsDeducted: 0, 
        newBalance: deductResult.newBalance, 
        error: deductResult.errorMessage || 'Insufficient balance at consumption time' 
      };
    }
    
    reservation.status = 'consumed';
    reservation.taskId = taskId;
    this.activeReservations.delete(reservationId);
    
    if (deductResult.newBalance < 50) {
      this.emitLowBalanceWarning(reservation.workspaceId, deductResult.newBalance);
    }
    
    log.info(`[SubagentBanker] Consumed ${creditsToDeduct} credits from reservation ${reservationId}. New balance: ${deductResult.newBalance}`);
    
    return { success: true, creditsDeducted: creditsToDeduct, newBalance: deductResult.newBalance };
  }

  /**
   * Direct deduction without reservation (for simple operations)
   */
  async directDeduct(params: {
    workspaceId: string;
    userId: string;
    credits: number;
    actionType: string;
    actionId?: string;
    description?: string;
  }): Promise<{ success: boolean; newBalance: number; error?: string }> {
    const { workspaceId, userId, credits, actionType, actionId, description } = params;
    
    const deductResult = await tokenManager.recordUsage({
      workspaceId,
      userId,
      featureKey: 'ai_general',
      featureName: actionType,
      amountOverride: credits,
      relatedEntityType: actionType,
      relatedEntityId: actionId,
      description: description || `${actionType} usage`,
    });
    
    if (!deductResult.success) {
      log.info(`[SubagentBanker] Direct deduction failed: ${deductResult.errorMessage}`);
      return { 
        success: false, 
        newBalance: deductResult.newBalance, 
        error: deductResult.errorMessage || `Insufficient credits for ${actionType}` 
      };
    }
    
    log.info(`[SubagentBanker] Direct deduction: ${credits} credits for ${actionType}. New balance: ${deductResult.newBalance}`);
    
    return { success: true, newBalance: deductResult.newBalance };
  }

  /**
   * Refill credits (purchase or bonus)
   */
  /**
   * Credit-balance refills are retired. CoAIleague does not sell credits
   * or hold a per-workspace purchased-credit balance — AI usage is metered
   * as tokens and overage is billed on the monthly Stripe invoice. The
   * method is kept as a 410-style stub so legacy callers fail loudly.
   */
  async refillCredits(_params: {
    workspaceId: string;
    userId: string;
    credits: number;
    source: 'purchase' | 'bonus' | 'promo' | 'refund';
    stripePaymentId?: string;
    packageId?: string;
    description?: string;
  }): Promise<RefillResult> {
    return {
      success: false,
      creditsAdded: 0,
      newBalance: 0,
      error: 'Credit refills are retired. Apply a Stripe invoice credit instead.',
    };
  }

  /**
   * Get current credit status for a workspace
   */
  async getCreditStatus(workspaceId: string): Promise<{
    balance: number;
    lifetimePurchased: number;
    lifetimeUsed: number;
    lifetimeBonuses: number;
    isActive: boolean;
    lowBalanceWarning: boolean;
    recentTransactions: Array<{
      type: string;
      credits: number;
      description: string;
      createdAt: Date;
    }>;
  }> {
    const creditsAccount = await tokenManager.getWorkspaceState(workspaceId);
    const recentTx = await tokenManager.getUsageHistory(workspaceId, 10);
    
    return {
      balance: creditsAccount?.currentBalance || 0,
      lifetimePurchased: creditsAccount?.monthlyAllocation || 0,
      lifetimeUsed: creditsAccount?.totalTokensUsed || 0,
      lifetimeBonuses: 0,
      isActive: true,
      lowBalanceWarning: (creditsAccount?.currentBalance || 0) < Math.max(50, Math.floor((creditsAccount?.monthlyAllocation || 0) * 0.1)),
      recentTransactions: recentTx.map(tx => ({
        type: 'token_usage',
        credits: tx.tokensUsed,
        description: tx.description || '',
        createdAt: tx.createdAt || new Date()
      }))
    };
  }

  /**
   * Get ledger history for a workspace
   */
  async getLedger(params: {
    workspaceId: string;
    limit?: number;
    offset?: number;
    startDate?: Date;
  }): Promise<{
    entries: LedgerEntry[];
    totalCount: number;
    summary: {
      totalDebits: number;
      totalCredits: number;
      netChange: number;
    };
  }> {
    const { workspaceId, limit = 50, offset = 0, startDate } = params;
    
    const transactions = await tokenManager.getUsageHistory(workspaceId, limit);
    
    let filteredTransactions = transactions;
    if (startDate) {
      filteredTransactions = transactions.filter(tx => tx.createdAt && new Date(tx.createdAt) >= startDate);
    }
    
    const entries: LedgerEntry[] = filteredTransactions.map(tx => ({
      id: tx.id,
      workspaceId: tx.workspaceId,
      userId: (tx as any).userId,
      type: 'debit',
      amount: tx.tokensUsed,
      balanceAfter: 0,
      category: tx.featureKey || tx.featureName || 'token_usage',
      description: tx.description || '',
      taskId: undefined,
      metadata: undefined,
      createdAt: tx.createdAt || new Date()
    }));
    
    const totalDebits = entries.filter(e => e.type === 'debit').reduce((sum, e) => sum + e.amount, 0);
    const totalCredits = entries.filter(e => e.type === 'credit').reduce((sum, e) => sum + e.amount, 0);
    
    return {
      entries,
      totalCount: transactions.length,
      summary: {
        totalDebits,
        totalCredits,
        netChange: totalCredits - totalDebits
      }
    };
  }

  private analyzeComplexity(content: string): 'simple' | 'standard' | 'complex' | 'enterprise' {
    const wordCount = content.split(/\s+/).length;
    const hasMultipleTasks = /\b(and|also|then|after|before|while)\b/gi.test(content);
    const hasDataOperations = /\b(calculate|analyze|compare|report|aggregate|summarize)\b/gi.test(content);
    const hasIntegrations = /\b(sync|integrate|connect|export|import)\b/gi.test(content);
    
    let score = 0;
    if (wordCount > 50) score += 1;
    if (wordCount > 150) score += 1;
    if (hasMultipleTasks) score += 1;
    if (hasDataOperations) score += 1;
    if (hasIntegrations) score += 1;
    
    if (score >= 4) return 'enterprise';
    if (score >= 3) return 'complex';
    if (score >= 1) return 'standard';
    return 'simple';
  }

  private estimateAgentCount(taskType: string, complexity: string, mode: string): number {
    let baseAgents = 1;
    
    if (complexity === 'complex') baseAgents = 2;
    if (complexity === 'enterprise') baseAgents = 3;
    
    if (mode === 'turbo') baseAgents = Math.min(baseAgents + 1, 4);
    if (mode === 'instant') baseAgents = Math.min(baseAgents + 2, 6);
    
    return baseAgents;
  }

  private estimateDuration(complexity: string, mode: string, agentCount: number): number {
    const baseDurations = {
      simple: 5000,
      standard: 15000,
      complex: 30000,
      enterprise: 60000
    };
    
    const baseDuration = baseDurations[complexity as keyof typeof baseDurations] || 15000;
    
    const parallelReduction = Math.max(0.3, 1 - (agentCount - 1) * 0.2);
    
    const modeReductions = {
      normal: 1.0,
      fast: 0.7,
      turbo: 0.5,
      instant: 0.3
    };
    
    const modeReduction = modeReductions[mode as keyof typeof modeReductions] || 1.0;
    
    return Math.ceil(baseDuration * parallelReduction * modeReduction);
  }

  private cleanupExpiredQuotes(): void {
    const now = new Date();
    let cleaned = 0;
    
    this.activeQuotes.forEach((quote, id) => {
      if (now > quote.expiresAt) {
        this.activeQuotes.delete(id);
        cleaned++;
      }
    });
    
    if (cleaned > 0) {
      log.info(`[SubagentBanker] Cleaned up ${cleaned} expired quotes`);
    }
  }

  private cleanupExpiredReservations(): void {
    const now = new Date();
    let cleaned = 0;
    
    this.activeReservations.forEach((res, id) => {
      if (now > res.expiresAt && res.status === 'reserved') {
        res.status = 'expired';
        this.activeReservations.delete(id);
        cleaned++;
      }
    });
    
    if (cleaned > 0) {
      log.info(`[SubagentBanker] Released ${cleaned} expired reservations`);
    }
  }

  private emitLowBalanceWarning(workspaceId: string, balance: number): void {
    platformEventBus.publish({
      type: 'announcement',
      category: 'feature',
      title: 'Low Credit Balance',
      description: `Your credit balance is low (${balance} credits). Add more credits to continue using AI features.`,
      workspaceId,
      metadata: { balance, threshold: 50, alertType: 'low_balance' }
    }).catch((err) => log.warn('[subagentBanker] Fire-and-forget failed:', err));
  }
}

export const subagentBanker = SubagentBanker.getInstance();
export { SubagentBanker };
