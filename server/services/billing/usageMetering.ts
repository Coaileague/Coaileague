import { createLogger } from '../../lib/logger';
import { db } from '../../db';
import { aiUsageEvents, aiUsageDailyRollups, workspaces, workspaceAddons, billingAddons, billingAuditLog, type InsertAiUsageEvent, type AiUsageEvent } from '@shared/schema';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import { creditManager } from './creditManager';
import { platformEventBus } from '../platformEventBus';
import { calculateProviderCostUsd } from './platformAIBudgetService';
import { typedExec } from '../../lib/typedSql';

const log = createLogger('usageMetering');
export interface UsageEventInput {
  workspaceId: string;
  userId?: string;
  featureKey: string; // e.g., 'scheduleos_ai_generation', 'recordos_search', 'insightos_prediction'
  addonId?: string;
  usageType: 'token' | 'session' | 'activity' | 'api_call';
  usageAmount: number;
  usageUnit: string; // 'tokens', 'sessions', 'hours', 'searches', etc.
  unitPrice?: number;
  sessionId?: string;
  activityType?: string;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
  // Control event bus emission - set to false when caller emits its own billing event
  emitEvent?: boolean;
  // Skip credit deduction - set to true when caller already deducted credits (e.g., aiCreditGateway.finalizeBilling)
  skipBillingDeduction?: boolean;
  // AI model tracking — provider cost calculation
  aiModel?: string;           // e.g., 'gemini-2.5-flash', 'gpt-4o', 'claude-sonnet'
  inputTokens?: number;       // Input tokens for raw cost calculation
  outputTokens?: number;      // Output tokens for raw cost calculation
  creditsDeducted?: number;   // Credits deducted from org balance for this event
}

export interface UsageMetrics {
  totalEvents: number;
  totalCost: number;
  totalUsage: number;
  byFeature: Record<string, {
    events: number;
    cost: number;
    usage: number;
  }>;
  byDay: Array<{
    date: string;
    events: number;
    cost: number;
    usage: number;
  }>;
}

export class UsageMeteringService {
  constructor() {
  }

  /**
   * Record a single usage event and apply hybrid billing (allowance + overage)
   */
  async recordUsage(input: UsageEventInput): Promise<AiUsageEvent> {
    if (!input.featureKey) {
      input.featureKey = 'unknown_feature';
    }
    if (!input.workspaceId) {
      log.warn('[UsageMetering] recordUsage called without workspaceId — attributing to PLATFORM_COST_CENTER', {
        featureKey: input.featureKey,
        userId: input.userId,
        usageType: input.usageType,
      });
      input.workspaceId = 'PLATFORM_COST_CENTER';
    }
    // BILLING-FK FIX (2026-04-08): ai_usage_events.user_id has a FK to
    // users.id. Callers historically passed the sentinel string 'system'
    // for platform-level / autonomous calls, which is NOT a real user row
    // and produces a FK violation on every cycle. Normalize any system
    // sentinel to NULL here — one sanitization point rather than fixing
    // thousands of call sites. The companion DB migration makes user_id
    // nullable (see criticalConstraintsBootstrap.ai_usage_events_user_id_nullable).
    if (
      input.userId === 'system' ||
      input.userId === 'bot-system' ||
      input.userId === 'trinity-service' ||
      input.userId === ''
    ) {
      input.userId = undefined;
    }
    // Get addon details if addonId provided
    let addon = null;
    let workspaceAddon = null;
    
    if (input.addonId) {
      [addon] = await db.select().from(billingAddons).where(eq(billingAddons.id, input.addonId)).limit(1);
      
      if (addon) {
        [workspaceAddon] = await db.select()
          .from(workspaceAddons)
          .where(
            and(
              eq(workspaceAddons.workspaceId, input.workspaceId),
              eq(workspaceAddons.addonId, input.addonId),
              eq(workspaceAddons.status, 'active')
            )
          )
          .limit(1);
      }
    }

    // Calculate cost based on hybrid pricing model
    let unitPrice = input.unitPrice ?? await this.getUnitPrice(input.featureKey, input.usageType);
    let totalCost = Number(input.usageAmount) * unitPrice;
    let isOverage = false;
    let allowanceUsed = 0;
    let overageAmount = 0;

    // For AI-powered OS modules with hybrid pricing, check monthly allowance
    if (addon && addon.pricingType === 'hybrid' && addon.monthlyTokenAllowance && workspaceAddon && input.usageType === 'token') {
      const monthlyAllowance = Number(addon.monthlyTokenAllowance);
      const currentUsage = Number(workspaceAddon.monthlyTokensUsed || 0);
      const newUsage = currentUsage + input.usageAmount;
      
      // Reset monthly usage if billing period reset
      const needsReset = this.shouldResetMonthlyUsage(workspaceAddon.lastUsageResetAt);
      const actualCurrentUsage = needsReset ? 0 : currentUsage;
      
      // Calculate allowance vs overage
      if (actualCurrentUsage < monthlyAllowance) {
        // Some or all usage is covered by monthly allowance
        allowanceUsed = Math.min(input.usageAmount, monthlyAllowance - actualCurrentUsage);
        overageAmount = Math.max(0, input.usageAmount - allowanceUsed);
        
        if (overageAmount > 0) {
          // Charge overage rate for tokens beyond allowance
          isOverage = true;
          const overageRate = Number(addon.overageRatePer1kTokens || 0.03); // Default $0.03 per 1k tokens
          totalCost = (overageAmount / 1000) * overageRate; // Overage cost only
          unitPrice = (overageAmount > 0) ? totalCost / overageAmount : 0;
        } else {
          // All usage covered by allowance - no charge
          totalCost = 0;
          unitPrice = 0;
        }
      } else {
        // Already exceeded monthly allowance - all overage
        isOverage = true;
        const overageRate = Number(addon.overageRatePer1kTokens || 0.03);
        totalCost = (input.usageAmount / 1000) * overageRate;
        // GAP-60 FIX: Guard against division by zero when usageAmount=0.
        // If input.usageAmount is 0 (empty batch), totalCost is also 0, and 0/0=NaN
        // would propagate into billingAuditLog.unitPrice as the string "NaN", corrupting
        // downstream reporting and any downstream multiplications using this field.
        const { multiplyFinancialValues, toFinancialString } = await import('../financialCalculator');
        unitPrice = input.usageAmount > 0 
          ? parseFloat(multiplyFinancialValues(toFinancialString(String(totalCost)), toFinancialString(String(1 / input.usageAmount))))
          : 0;
        overageAmount = input.usageAmount;
      }

      // GAP-71 FIX: Move the addon usage UPDATE inside the upcoming db.transaction
      // so it is atomic with the aiUsageEvents INSERT. Flag for below.
      // (actual UPDATE happens inside the transaction block below)
    }

    // Calculate raw provider API cost (not marked up) for platform spend tracking
    const providerCostUsd = input.aiModel && (input.inputTokens || input.outputTokens)
      ? calculateProviderCostUsd(input.aiModel, input.inputTokens || 0, input.outputTokens || 0)
      : 0;

    // GAP-71 FIX: Wrap the conditional addon UPDATE + aiUsageEvents INSERT in db.transaction().
    // Previously: if (addon hybrid path) { UPDATE workspaceAddons } ; INSERT aiUsageEvents
    // A crash between the two writes leaves the addon balance decremented with no usage event record,
    // causing reconcileCredits to flag ghost deductions and breaking overage invoice generation.
    const [event] = await db.transaction(async (tx) => {
      // Conditionally update addon usage inside the transaction
      if (addon && addon.pricingType === 'hybrid' && addon.monthlyTokenAllowance && workspaceAddon && input.usageType === 'token') {
        const needsReset = this.shouldResetMonthlyUsage(workspaceAddon.lastUsageResetAt);
        const actualCurrentUsage = needsReset ? 0 : Number(workspaceAddon.monthlyTokensUsed || 0);
        await tx.update(workspaceAddons)
          .set({
            monthlyTokensUsed: needsReset ? input.usageAmount.toString() : (actualCurrentUsage + input.usageAmount).toString(),
            lastUsageResetAt: needsReset ? new Date() : workspaceAddon.lastUsageResetAt,
            updatedAt: new Date(),
          })
          .where(eq(workspaceAddons.id, workspaceAddon.id));
      }

      // Always insert the usage event (including new provider cost tracking columns)
      return tx.insert(aiUsageEvents).values({
        workspaceId: input.workspaceId,
        userId: input.userId,
        featureKey: input.featureKey,
        addonId: input.addonId,
        usageType: input.usageType,
        usageAmount: input.usageAmount.toString(),
        usageUnit: input.usageUnit,
        unitPrice: unitPrice.toString(),
        totalCost: totalCost.toString(),
        sessionId: input.sessionId,
        activityType: input.activityType,
        metadata: {
          ...input.metadata,
          isOverage,
          allowanceUsed,
          overageAmount,
          addonName: addon?.name,
          aiModel: input.aiModel,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      }).returning();
    });

    // Store provider cost and model outside transaction (new columns via raw SQL to bypass Drizzle schema mismatch)
    if (event && (providerCostUsd > 0 || input.aiModel || input.creditsDeducted)) {
      await db.update(aiUsageEvents).set({ providerCostUsd: providerCostUsd, aiModel: input.aiModel || null, creditsDeducted: input.creditsDeducted || 0 }).where(eq(aiUsageEvents.id, event.id)).catch(() => {/* non-critical — usage event already recorded */});
    }

    // Phase 16: Credit deduction removed — credit_transactions table dropped.
    // AI usage is now metered via aiMeteringService and workspace_ai_usage only.

    // Update daily rollup asynchronously
    this.updateDailyRollup(input.workspaceId, input.featureKey, event.createdAt!).catch((e: any) => log.error(e instanceof Error ? e.message : String(e)));

    // Emit usage event to Trinity for tracking (unless caller handles its own event emission)
    if (input.emitEvent !== false) {
      platformEventBus.publish({
        type: 'ai_brain_action',
        category: 'ai_brain',
        title: isOverage ? 'AI Overage Recorded' : 'AI Usage Recorded',
        description: `${input.featureKey}: ${input.usageAmount} ${input.usageUnit}${isOverage ? ` (overage: ${overageAmount})` : ''}`,
        workspaceId: input.workspaceId,
        metadata: {
          billingCategory: isOverage ? 'ai_overage_recorded' : 'ai_usage_recorded',
          userId: input.userId,
          featureKey: input.featureKey,
          usageType: input.usageType,
          usageAmount: input.usageAmount,
          totalCost,
          isOverage,
          allowanceUsed,
          overageAmount,
          eventId: event.id,
        },
      }).catch((err) => log.warn('[usageMetering] Fire-and-forget failed:', err));
    }

    // Log audit event
    await db.insert(billingAuditLog).values({
      workspaceId: input.workspaceId,
      eventType: isOverage ? 'overage_usage_recorded' : 'usage_recorded',
      eventCategory: 'usage',
      actorType: input.userId ? 'user' : 'system',
      actorId: input.userId,
      description: isOverage 
        ? `Overage: ${overageAmount.toLocaleString()} tokens (${input.featureKey}) beyond monthly allowance`
        : `Recorded ${input.usageAmount} ${input.usageUnit} for ${input.featureKey}`,
      relatedEntityType: 'usage_event',
      relatedEntityId: event.id,
      newState: {
        usageAmount: input.usageAmount,
        usageUnit: input.usageUnit,
        totalCost,
        isOverage,
        allowanceUsed,
        overageAmount,
      },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return event;
  }

  /**
   * Check if monthly usage should be reset (new billing period)
   */
  private shouldResetMonthlyUsage(lastResetAt: Date | null): boolean {
    if (!lastResetAt) return true;
    
    const now = new Date();
    const daysSinceReset = (now.getTime() - lastResetAt.getTime()) / (1000 * 60 * 60 * 24);
    
    // Reset every 30 days (monthly billing cycle)
    return daysSinceReset >= 30;
  }

  /**
   * Record usage in batch (for bulk operations)
   */
  async recordUsageBatch(events: UsageEventInput[]): Promise<AiUsageEvent[]> {
    const results: AiUsageEvent[] = [];
    
    for (const event of events) {
      try {
        const result = await this.recordUsage(event);
        results.push(result);
      } catch (error) {
        log.error('Failed to record usage event:', error);
        // Continue with other events
      }
    }

    return results;
  }

  /**
   * Get usage metrics for a workspace within a date range
   */
  async getUsageMetrics(
    workspaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<UsageMetrics> {
    const events = await db.select()
      .from(aiUsageEvents)
      .where(
        and(
          eq(aiUsageEvents.workspaceId, workspaceId),
          gte(aiUsageEvents.createdAt, startDate),
          lte(aiUsageEvents.createdAt, endDate)
        )
      )
      .orderBy(desc(aiUsageEvents.createdAt));

    // Aggregate metrics
    const metrics: UsageMetrics = {
      totalEvents: events.length,
      totalCost: 0,
      totalUsage: 0,
      byFeature: {},
      byDay: [],
    };

    const dayMap = new Map<string, { events: number; cost: number; usage: number }>();

    for (const event of events) {
      const cost = Number(event.totalCost) || 0;
      const usage = Number(event.usageAmount) || 0;

      metrics.totalCost += cost;
      metrics.totalUsage += usage;

      // By feature
      if (!metrics.byFeature[event.featureKey]) {
        metrics.byFeature[event.featureKey] = { events: 0, cost: 0, usage: 0 };
      }
      metrics.byFeature[event.featureKey].events++;
      metrics.byFeature[event.featureKey].cost += cost;
      metrics.byFeature[event.featureKey].usage += usage;

      // By day
      const day = event.createdAt!.toISOString().split('T')[0];
      if (!dayMap.has(day)) {
        dayMap.set(day, { events: 0, cost: 0, usage: 0 });
      }
      const dayData = dayMap.get(day)!;
      dayData.events++;
      dayData.cost += cost;
      dayData.usage += usage;
    }

    // Convert day map to array
    metrics.byDay = Array.from(dayMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return metrics;
  }

  /**
   * Get usage for a specific feature
   */
  async getFeatureUsage(
    workspaceId: string,
    featureKey: string,
    startDate: Date,
    endDate: Date
  ): Promise<AiUsageEvent[]> {
    return db.select()
      .from(aiUsageEvents)
      .where(
        and(
          eq(aiUsageEvents.workspaceId, workspaceId),
          eq(aiUsageEvents.featureKey, featureKey),
          gte(aiUsageEvents.createdAt, startDate),
          lte(aiUsageEvents.createdAt, endDate)
        )
      )
      .orderBy(desc(aiUsageEvents.createdAt));
  }

  /**
   * Update daily rollup for a specific date and feature
   */
  private async updateDailyRollup(
    workspaceId: string,
    featureKey: string,
    date: Date
  ): Promise<void> {
    const usageDate = new Date(date);
    usageDate.setUTCHours(0, 0, 0, 0);

    const endDate = new Date(usageDate);
    endDate.setUTCHours(23, 59, 59, 999);

    // Get all events for this day and feature
    const events = await db.select()
      .from(aiUsageEvents)
      .where(
        and(
          eq(aiUsageEvents.workspaceId, workspaceId),
          eq(aiUsageEvents.featureKey, featureKey),
          gte(aiUsageEvents.createdAt, usageDate),
          lte(aiUsageEvents.createdAt, endDate)
        )
      );

    // Calculate aggregates
    const totalEvents = events.length;
    const totalUsageAmount = events.reduce((sum, e) => sum + Number(e.usageAmount || 0), 0);
    const totalCost = events.reduce((sum, e) => sum + Number(e.totalCost || 0), 0);
    const uniqueUsers = new Set(events.filter(e => e.userId).map(e => e.userId)).size;

    // Upsert rollup
    await db.insert(aiUsageDailyRollups)
      .values({
        workspaceId,
        usageDate,
        featureKey,
        totalEvents,
        totalUsageAmount: totalUsageAmount.toString(),
        totalCost: totalCost.toString(),
        uniqueUsers,
      })
      .onConflictDoUpdate({
        target: [
          aiUsageDailyRollups.workspaceId,
          aiUsageDailyRollups.usageDate,
          aiUsageDailyRollups.featureKey,
        ],
        set: {
          totalEvents,
          totalUsageAmount: totalUsageAmount.toString(),
          totalCost: totalCost.toString(),
          uniqueUsers,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Get unit price for a feature/usage type
   * This can be overridden by workspace-specific pricing or addon pricing
   */
  private async getUnitPrice(featureKey: string, usageType: string): Promise<number> {
    // Default pricing (per 1000 tokens/units)
    // CRITICAL: Prices MUST exceed supplier costs to ensure profitability
    // Gemini 2.5 Flash: ~$0.15/1M input, ~$0.60/1M output ($0.0006/1K output)
    // Gemini 2.5 Pro: ~$1.25/1M input, ~$5/1M output ($0.005/1K output)
    // GPT-4o-mini: ~$0.60/1K output tokens
    const defaultPricing: Record<string, number> = {
      // HelpDesk AI (Profitable pricing with 50%+ margin)
      'helpdesk_gemini_chat': 0.50, // $0.50 per 1000 tokens (50% margin over Gemini 2.0 Flash)
      'helpdesk_ai_greeting': 0.50, // $0.50 per 1000 tokens (covers GPT-4o-mini/GPT-5 with margin)
      'helpdesk_ai_response': 0.90, // $0.90 per 1000 tokens (GPT-4o-mini responses with margin)
      'helpdesk_ai_analysis': 0.50, // $0.50 per 1000 tokens (sentiment analysis with margin)
      'helpdesk_ai_question': 0.90, // $0.90 per 1000 tokens (GPT-4o-mini Q&A with margin)
      'helpdesk_ai_embedding': 0.10, // $0.10 per 1000 tokens (text-embedding-3-small with margin)
      
      // AI Scheduling AI (GPT-4 with 100%+ margin for complex scheduling)
      'scheduleos_ai_generation': 3.00, // $3.00 per 1000 tokens (GPT-4 @ ~$0.045/1K + 6500% margin for value)
      'scheduleos_optimization': 0.03,
      
      // DisputeAI (GPT-4-turbo with 100%+ margin for HR compliance analysis)
      'disputeai_analysis': 1.50, // $1.50 per 1000 tokens (GPT-4-turbo @ ~$0.02/1K + 7400% margin for value)
      
      // PredictionOS™ AI (GPT-4o with 100%+ margin for workforce predictions)
      'predictionos_turnover_analysis': 1.00, // $1.00 per 1000 tokens (GPT-4o @ ~$0.00625/1K + 15900% margin for value)
      'predictionos_cost_variance': 1.00, // $1.00 per 1000 tokens (GPT-4o @ ~$0.00625/1K + 15900% margin for value)
      
      // AI Records
      'recordos_search': 0.001, // $0.001 per search
      'recordos_ai_query': 0.01,
      
      // AI Analytics
      'insightos_prediction': 0.10, // $0.10 per prediction
      'insightos_analytics': 0.05,
      
      // Generic AI tokens
      'ai_tokens': 0.00002, // $0.02 per 1000 tokens
    };

    return defaultPricing[featureKey] || 0.01; // Default to $0.01 per unit
  }

  /**
   * Get daily rollups for reporting
   */
  async getDailyRollups(
    workspaceId: string,
    startDate: Date,
    endDate: Date
  ) {
    return db.select()
      .from(aiUsageDailyRollups)
      .where(
        and(
          eq(aiUsageDailyRollups.workspaceId, workspaceId),
          gte(aiUsageDailyRollups.usageDate, startDate),
          lte(aiUsageDailyRollups.usageDate, endDate)
        )
      )
      .orderBy(desc(aiUsageDailyRollups.usageDate));
  }

  /**
   * Check if workspace has sufficient credits for a usage event
   */
  async checkSufficientCredits(
    workspaceId: string,
    estimatedCost: number
  ): Promise<boolean> {
    const balance = await creditManager.getBalance(workspaceId);
    return balance >= estimatedCost;
  }

  /**
   * Estimate cost for a planned usage
   */
  async estimateCost(
    featureKey: string,
    usageAmount: number,
    usageType: string = 'token'
  ): Promise<number> {
    const unitPrice = await this.getUnitPrice(featureKey, usageType);
    const { multiplyFinancialValues, toFinancialString } = await import('../financialCalculator');
    return parseFloat(multiplyFinancialValues(toFinancialString(String(usageAmount)), toFinancialString(String(unitPrice))));
  }
}

// Singleton instance
export const usageMeteringService = new UsageMeteringService();
