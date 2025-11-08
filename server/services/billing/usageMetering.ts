import { db } from '../../db';
import {
  aiUsageEvents,
  aiUsageDailyRollups,
  aiTokenWallets,
  workspaces,
  workspaceAddons,
  billingAddons,
  billingAuditLog,
  type InsertAiUsageEvent,
  type AiUsageEvent,
} from '@shared/schema';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import { CreditLedgerService } from './creditLedger';

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
  private creditLedgerService: CreditLedgerService;

  constructor() {
    this.creditLedgerService = new CreditLedgerService();
  }

  /**
   * Record a single usage event and apply hybrid billing (allowance + overage)
   */
  async recordUsage(input: UsageEventInput): Promise<AiUsageEvent> {
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
        unitPrice = totalCost / input.usageAmount;
        overageAmount = input.usageAmount;
      }

      // Update workspace addon usage tracking
      await db.update(workspaceAddons)
        .set({
          monthlyTokensUsed: needsReset ? input.usageAmount.toString() : (actualCurrentUsage + input.usageAmount).toString(),
          lastUsageResetAt: needsReset ? new Date() : workspaceAddon.lastUsageResetAt,
          updatedAt: new Date(),
        })
        .where(eq(workspaceAddons.id, workspaceAddon.id));
    }

    // Create usage event with overage tracking
    const [event] = await db.insert(aiUsageEvents).values({
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
      },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    }).returning();

    // Deduct from token wallet ONLY if there's overage cost
    if (totalCost > 0) {
      try {
        await this.creditLedgerService.deductCredits(
          input.workspaceId,
          totalCost,
          isOverage 
            ? `Overage: ${input.featureKey} - ${overageAmount.toLocaleString()} tokens beyond allowance`
            : `Usage: ${input.featureKey} - ${input.usageAmount} ${input.usageUnit}`,
          event.id
        );
      } catch (error) {
        // If deduction fails (insufficient balance), log but continue
        // The usage is still tracked for invoicing
        console.error(`Failed to deduct credits for workspace ${input.workspaceId}:`, error);
      }
    }

    // Update daily rollup asynchronously
    this.updateDailyRollup(input.workspaceId, input.featureKey, event.createdAt!).catch(console.error);

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
        console.error('Failed to record usage event:', error);
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
    // Gemini 2.0 Flash: ~$0.35/1K output tokens
    // GPT-4o-mini: ~$0.60/1K output tokens
    // GPT-5: Higher than GPT-4o-mini
    const defaultPricing: Record<string, number> = {
      // HelpDesk AI (Profitable pricing with 50%+ margin)
      'helpdesk_gemini_chat': 0.50, // $0.50 per 1000 tokens (50% margin over Gemini 2.0 Flash)
      'helpdesk_ai_greeting': 0.50, // $0.50 per 1000 tokens (covers GPT-4o-mini/GPT-5 with margin)
      'helpdesk_ai_response': 0.90, // $0.90 per 1000 tokens (GPT-4o-mini responses with margin)
      'helpdesk_ai_analysis': 0.50, // $0.50 per 1000 tokens (sentiment analysis with margin)
      'helpdesk_ai_question': 0.90, // $0.90 per 1000 tokens (GPT-4o-mini Q&A with margin)
      
      // ScheduleOS
      'scheduleos_ai_generation': 0.05, // $0.05 per generation
      'scheduleos_optimization': 0.03,
      
      // RecordOS
      'recordos_search': 0.001, // $0.001 per search
      'recordos_ai_query': 0.01,
      
      // InsightOS
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
    const wallet = await this.creditLedgerService.getWallet(workspaceId);
    if (!wallet) return false;

    const currentBalance = Number(wallet.currentBalance) || 0;
    return currentBalance >= estimatedCost;
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
    return usageAmount * unitPrice;
  }
}

// Singleton instance
export const usageMeteringService = new UsageMeteringService();
