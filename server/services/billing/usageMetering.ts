import { db } from '../../db';
import {
  aiUsageEvents,
  aiUsageDailyRollups,
  aiTokenWallets,
  workspaces,
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
   * Record a single usage event and deduct from token wallet
   */
  async recordUsage(input: UsageEventInput): Promise<AiUsageEvent> {
    // Calculate cost if not provided
    const unitPrice = input.unitPrice ?? await this.getUnitPrice(input.featureKey, input.usageType);
    const totalCost = Number(input.usageAmount) * unitPrice;

    // Create usage event
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
      metadata: input.metadata,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    }).returning();

    // Deduct from token wallet if cost > 0
    if (totalCost > 0) {
      try {
        await this.creditLedgerService.deductCredits(
          input.workspaceId,
          totalCost,
          `Usage: ${input.featureKey} - ${input.usageAmount} ${input.usageUnit}`,
          event.id
        );
      } catch (error) {
        // If deduction fails (insufficient balance), log but continue
        // The usage is still tracked for invoicing
        console.error(`Failed to deduct credits for workspace ${input.workspaceId}:`, error);
      }
    }

    // Update daily rollup asynchronously (fire and forget)
    this.updateDailyRollup(input.workspaceId, input.featureKey, event.createdAt!).catch(console.error);

    // Log audit event
    await db.insert(billingAuditLog).values({
      workspaceId: input.workspaceId,
      eventType: 'usage_recorded',
      eventCategory: 'usage',
      actorType: input.userId ? 'user' : 'system',
      actorId: input.userId,
      description: `Recorded ${input.usageAmount} ${input.usageUnit} for ${input.featureKey}`,
      relatedEntityType: 'usage_event',
      relatedEntityId: event.id,
      newState: {
        usageAmount: input.usageAmount,
        usageUnit: input.usageUnit,
        totalCost,
      },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return event;
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
    const defaultPricing: Record<string, number> = {
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
