/**
 * Unified Quota Enforcement Service
 * 
 * Prevents end users from exceeding:
 * 1. QuickBooks API rate limits (per-realm)
 * 2. CoAIleague credit usage limits per tier
 * 3. Subscription tier feature restrictions
 * 
 * Legal Caps Enforcement:
 * - QuickBooks: 500 req/min (production), 100 req/min (sandbox)
 * - CoAIleague: Credit-based usage with tier limits
 * 
 * @see shared/billingConfig.ts for tier definitions
 */

import { db } from '../../db';
import { workspaces, quickbooksApiUsage } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { quickbooksRateLimiter, type RateLimitResult } from './quickbooksRateLimiter';
import { platformEventBus } from '../platformEventBus';
import { INTEGRATIONS } from '@shared/platformConfig';
import { typedCount, typedExec, typedQuery } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('quotaEnforcementService');


export type QuotaType = 
  | 'quickbooks_api'
  | 'ai_credits'
  | 'employee_count'
  | 'email_sends'
  | 'sms_sends'
  | 'storage_bytes';

export interface QuotaCheckResult {
  allowed: boolean;
  quotaType: QuotaType;
  reason?: string;
  currentUsage: number;
  limit: number;
  remainingPercentage: number;
  upgradeRequired?: boolean;
  waitMs?: number;
}

export interface TierLimits {
  aiCreditsMonthly: number;
  employeesIncluded: number;
  emailsMonthly: number;
  smsMonthly: number;
  storageGB: number;
  quickbooksSync: boolean;
  advancedReporting: boolean;
}

const TIER_LIMITS: Record<string, TierLimits> = {
  free_trial: {
    aiCreditsMonthly: 500,
    employeesIncluded: 5,
    emailsMonthly: 100,
    smsMonthly: 20,
    storageGB: 1,
    quickbooksSync: false,
    advancedReporting: false,
  },
  starter: {
    aiCreditsMonthly: 2000,
    employeesIncluded: 15,
    emailsMonthly: 1000,
    smsMonthly: 200,
    storageGB: 10,
    quickbooksSync: true,
    advancedReporting: false,
  },
  professional: {
    aiCreditsMonthly: 10000,
    employeesIncluded: 50,
    emailsMonthly: 5000,
    smsMonthly: 1000,
    storageGB: 50,
    quickbooksSync: true,
    advancedReporting: true,
  },
  enterprise: {
    aiCreditsMonthly: -1, // Unlimited
    employeesIncluded: -1, // Custom
    emailsMonthly: -1, // Unlimited
    smsMonthly: -1, // Unlimited
    storageGB: -1, // Custom
    quickbooksSync: true,
    advancedReporting: true,
  },
};

interface UsageRecord {
  aiCreditsUsed: number;
  emailsSent: number;
  smsSent: number;
  storageUsedBytes: number;
  lastReset: Date;
}

class QuotaEnforcementService {
  private usageCache: Map<string, UsageRecord> = new Map();
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache
  private cacheTimestamps: Map<string, number> = new Map();
  
  async checkQuota(
    workspaceId: string,
    quotaType: QuotaType,
    requestedAmount: number = 1,
    realmId?: string
  ): Promise<QuotaCheckResult> {
    const tier = await this.getWorkspaceTier(workspaceId);
    const limits = TIER_LIMITS[tier] || TIER_LIMITS.free_trial;
    
    let result: QuotaCheckResult;
    switch (quotaType) {
      case 'quickbooks_api':
        result = await this.checkQuickBooksQuota(workspaceId, realmId, limits);
        break;
      case 'ai_credits':
        result = await this.checkAICreditsQuota(workspaceId, requestedAmount, limits);
        break;
      case 'employee_count':
        result = await this.checkEmployeeQuota(workspaceId, requestedAmount, limits);
        break;
      case 'email_sends':
        result = await this.checkEmailQuota(workspaceId, requestedAmount, limits);
        break;
      case 'sms_sends':
        result = await this.checkSMSQuota(workspaceId, requestedAmount, limits);
        break;
      case 'storage_bytes':
        result = await this.checkStorageQuota(workspaceId, requestedAmount, limits);
        break;
      default:
        result = {
          allowed: true,
          quotaType,
          currentUsage: 0,
          limit: -1,
          remainingPercentage: 100,
        };
    }

    // Publish quota_exceeded so TrinityOrchestrationGateway can detect
    // resource-limit upsell opportunities and track conversion pressure
    if (!result.allowed && workspaceId) {
      import('../platformEventBus').then(({ platformEventBus }) => {
        platformEventBus.publish({
          type: 'quota_exceeded',
          category: 'automation',
          title: `Quota Exceeded: ${quotaType}`,
          description: `Workspace ${workspaceId} hit ${quotaType} quota (${result.currentUsage}/${result.limit}) — ${result.reason || 'limit reached'}`,
          workspaceId,
          metadata: { quotaType, limit: result.limit, used: result.currentUsage, reason: result.reason, tier, requestedAmount },
        }).catch(() => null);
      }).catch(() => null);
    }

    return result;
  }
  
  private async checkQuickBooksQuota(
    workspaceId: string,
    realmId: string | undefined,
    limits: TierLimits
  ): Promise<QuotaCheckResult> {
    if (!limits.quickbooksSync) {
      return {
        allowed: false,
        quotaType: 'quickbooks_api',
        reason: 'QuickBooks sync not available on your current plan',
        currentUsage: 0,
        limit: 0,
        remainingPercentage: 0,
        upgradeRequired: true,
      };
    }
    
    if (!realmId) {
      return {
        allowed: false,
        quotaType: 'quickbooks_api',
        reason: 'QuickBooks realm ID required for API calls',
        currentUsage: 0,
        limit: 0,
        remainingPercentage: 0,
        upgradeRequired: false,
      };
    }
    
    const environment = INTEGRATIONS.quickbooks.getEnvironment();
    const maxRequests = environment === 'production' ? 500 : 100;
    
    let persistedUsage = 0;
    try {
      persistedUsage = await this.getQBApiUsageThisMinute(realmId);
    } catch (error) {
      return {
        allowed: false,
        quotaType: 'quickbooks_api',
        reason: 'Usage tracking unavailable - compliance requires persistence',
        currentUsage: 0,
        limit: maxRequests,
        remainingPercentage: 0,
      };
    }
    
    if (persistedUsage >= maxRequests) {
      const waitMs = 60000 - (Date.now() % 60000);
      return {
        allowed: false,
        quotaType: 'quickbooks_api',
        reason: `QuickBooks rate limit reached (${persistedUsage}/${maxRequests} requests this minute)`,
        currentUsage: persistedUsage,
        limit: maxRequests,
        remainingPercentage: 0,
        waitMs,
      };
    }
    
    const rateLimitResult = await quickbooksRateLimiter.checkRateLimit(realmId, environment);
    
    if (!rateLimitResult.allowed) {
      return {
        allowed: false,
        quotaType: 'quickbooks_api',
        reason: 'QuickBooks rate limit reached',
        currentUsage: persistedUsage,
        limit: maxRequests,
        remainingPercentage: Math.max(0, ((maxRequests - persistedUsage) / maxRequests) * 100),
        waitMs: rateLimitResult.waitMs,
      };
    }
    
    return {
      allowed: true,
      quotaType: 'quickbooks_api',
      currentUsage: persistedUsage,
      limit: maxRequests,
      remainingPercentage: Math.max(0, ((maxRequests - persistedUsage) / maxRequests) * 100),
    };
  }
  
  private async checkAICreditsQuota(
    workspaceId: string,
    requestedAmount: number,
    limits: TierLimits
  ): Promise<QuotaCheckResult> {
    if (limits.aiCreditsMonthly === -1) {
      return {
        allowed: true,
        quotaType: 'ai_credits',
        currentUsage: 0,
        limit: -1,
        remainingPercentage: 100,
      };
    }
    
    const usage = await this.getUsage(workspaceId);
    const wouldExceed = usage.aiCreditsUsed + requestedAmount > limits.aiCreditsMonthly;
    
    if (wouldExceed) {
      this.emitQuotaWarning(workspaceId, 'ai_credits', usage.aiCreditsUsed, limits.aiCreditsMonthly);
    }
    
    return {
      allowed: !wouldExceed,
      quotaType: 'ai_credits',
      reason: wouldExceed ? 'Monthly AI credit limit reached' : undefined,
      currentUsage: usage.aiCreditsUsed,
      limit: limits.aiCreditsMonthly,
      remainingPercentage: Math.max(0, ((limits.aiCreditsMonthly - usage.aiCreditsUsed) / limits.aiCreditsMonthly) * 100),
      upgradeRequired: wouldExceed,
    };
  }
  
  private async checkEmployeeQuota(
    workspaceId: string,
    requestedAmount: number,
    limits: TierLimits
  ): Promise<QuotaCheckResult> {
    if (limits.employeesIncluded === -1) {
      return {
        allowed: true,
        quotaType: 'employee_count',
        currentUsage: 0,
        limit: -1,
        remainingPercentage: 100,
      };
    }
    
    const currentEmployees = await this.getEmployeeCount(workspaceId);
    const wouldExceed = currentEmployees + requestedAmount > limits.employeesIncluded;
    
    return {
      allowed: !wouldExceed,
      quotaType: 'employee_count',
      reason: wouldExceed ? `Employee limit of ${limits.employeesIncluded} reached` : undefined,
      currentUsage: currentEmployees,
      limit: limits.employeesIncluded,
      remainingPercentage: Math.max(0, ((limits.employeesIncluded - currentEmployees) / limits.employeesIncluded) * 100),
      upgradeRequired: wouldExceed,
    };
  }
  
  private async checkEmailQuota(
    workspaceId: string,
    requestedAmount: number,
    limits: TierLimits
  ): Promise<QuotaCheckResult> {
    if (limits.emailsMonthly === -1) {
      return {
        allowed: true,
        quotaType: 'email_sends',
        currentUsage: 0,
        limit: -1,
        remainingPercentage: 100,
      };
    }
    
    const usage = await this.getUsage(workspaceId);
    const wouldExceed = usage.emailsSent + requestedAmount > limits.emailsMonthly;
    
    return {
      allowed: !wouldExceed,
      quotaType: 'email_sends',
      reason: wouldExceed ? 'Monthly email limit reached' : undefined,
      currentUsage: usage.emailsSent,
      limit: limits.emailsMonthly,
      remainingPercentage: Math.max(0, ((limits.emailsMonthly - usage.emailsSent) / limits.emailsMonthly) * 100),
      upgradeRequired: wouldExceed,
    };
  }
  
  private async checkSMSQuota(
    workspaceId: string,
    requestedAmount: number,
    limits: TierLimits
  ): Promise<QuotaCheckResult> {
    if (limits.smsMonthly === -1) {
      return {
        allowed: true,
        quotaType: 'sms_sends',
        currentUsage: 0,
        limit: -1,
        remainingPercentage: 100,
      };
    }
    
    const usage = await this.getUsage(workspaceId);
    const wouldExceed = usage.smsSent + requestedAmount > limits.smsMonthly;
    
    return {
      allowed: !wouldExceed,
      quotaType: 'sms_sends',
      reason: wouldExceed ? 'Monthly SMS limit reached' : undefined,
      currentUsage: usage.smsSent,
      limit: limits.smsMonthly,
      remainingPercentage: Math.max(0, ((limits.smsMonthly - usage.smsSent) / limits.smsMonthly) * 100),
      upgradeRequired: wouldExceed,
    };
  }
  
  private async checkStorageQuota(
    workspaceId: string,
    requestedBytes: number,
    limits: TierLimits
  ): Promise<QuotaCheckResult> {
    if (limits.storageGB === -1) {
      return {
        allowed: true,
        quotaType: 'storage_bytes',
        currentUsage: 0,
        limit: -1,
        remainingPercentage: 100,
      };
    }
    
    const usage = await this.getUsage(workspaceId);
    const limitBytes = limits.storageGB * 1024 * 1024 * 1024;
    const wouldExceed = usage.storageUsedBytes + requestedBytes > limitBytes;
    
    return {
      allowed: !wouldExceed,
      quotaType: 'storage_bytes',
      reason: wouldExceed ? `Storage limit of ${limits.storageGB}GB reached` : undefined,
      currentUsage: usage.storageUsedBytes,
      limit: limitBytes,
      remainingPercentage: Math.max(0, ((limitBytes - usage.storageUsedBytes) / limitBytes) * 100),
      upgradeRequired: wouldExceed,
    };
  }
  
  private async getWorkspaceTier(workspaceId: string): Promise<string> {
    try {
      const [workspace] = await db
        .select({ tier: workspaces.subscriptionTier })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      
      return workspace?.tier || 'free_trial';
    } catch {
      return 'free_trial';
    }
  }
  
  private async getEmployeeCount(workspaceId: string): Promise<number> {
    try {
      // CATEGORY C — Raw SQL retained: Count( | Tables: employees | Verified: 2026-03-23
      const result = await typedCount(
        sql`SELECT COUNT(*) as count FROM employees WHERE workspace_id = ${workspaceId} AND status = 'active'`
      );
      return Number(result);
    } catch {
      return 0;
    }
  }
  
  private async getUsage(workspaceId: string): Promise<UsageRecord> {
    const now = Date.now();
    const cachedTimestamp = this.cacheTimestamps.get(workspaceId);
    
    if (cachedTimestamp && now - cachedTimestamp < this.CACHE_TTL_MS) {
      return this.usageCache.get(workspaceId) || this.getDefaultUsage();
    }
    
    try {
      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      
      const usage: UsageRecord = {
        aiCreditsUsed: (workspace as any)?.aiCreditsUsed || 0,
        emailsSent: (workspace as any)?.emailsSentThisMonth || 0,
        smsSent: (workspace as any)?.smsSentThisMonth || 0,
        storageUsedBytes: (workspace as any)?.storageUsedBytes || 0,
        lastReset: (workspace as any)?.usageResetDate || new Date(),
      };
      
      this.usageCache.set(workspaceId, usage);
      this.cacheTimestamps.set(workspaceId, now);
      
      return usage;
    } catch {
      return this.getDefaultUsage();
    }
  }
  
  private getDefaultUsage(): UsageRecord {
    return {
      aiCreditsUsed: 0,
      emailsSent: 0,
      smsSent: 0,
      storageUsedBytes: 0,
      lastReset: new Date(),
    };
  }
  
  async recordUsage(
    workspaceId: string,
    quotaType: QuotaType,
    amount: number = 1
  ): Promise<void> {
    const cached = this.usageCache.get(workspaceId) || this.getDefaultUsage();
    
    switch (quotaType) {
      case 'quickbooks_api':
        break;
      case 'ai_credits':
        cached.aiCreditsUsed += amount;
        await this.persistUsageIncrement(workspaceId, 'ai_credits_used', amount);
        break;
      case 'email_sends':
        cached.emailsSent += amount;
        await this.persistUsageIncrement(workspaceId, 'emails_sent_this_month', amount);
        break;
      case 'sms_sends':
        cached.smsSent += amount;
        await this.persistUsageIncrement(workspaceId, 'sms_sent_this_month', amount);
        break;
      case 'storage_bytes':
        cached.storageUsedBytes += amount;
        await this.persistUsageIncrement(workspaceId, 'storage_used_bytes', amount);
        break;
    }
    
    this.usageCache.set(workspaceId, cached);
    this.cacheTimestamps.set(workspaceId, Date.now());
    
    // Emit quota usage event for Trinity awareness
    platformEventBus.publish({
      type: 'ai_brain_action',
      category: 'automation',
      title: 'Quota Usage Recorded',
      description: `${quotaType} usage: ${amount} for workspace ${workspaceId}`,
      workspaceId,
      metadata: { quotaType, amount },
    }).catch((err) => log.warn('[quotaEnforcementService] Fire-and-forget failed:', err));
  }
  
  async recordQBApiUsage(
    workspaceId: string,
    realmId: string,
    amount: number = 1
  ): Promise<void> {
    await this.persistQBUsageIncrement(workspaceId, realmId, amount);
    
    // Emit QB API usage event for Trinity awareness
    platformEventBus.publish({
      type: 'ai_brain_action',
      category: 'automation',
      title: 'QuickBooks API Usage',
      description: `QB API usage: ${amount} request(s) for realm ${realmId}`,
      workspaceId,
      metadata: { quotaType: 'quickbooks_api', realmId, amount },
    }).catch((err) => log.warn('[quotaEnforcementService] Fire-and-forget failed:', err));
  }
  
  private static readonly ALLOWED_USAGE_COLUMNS = new Set([
    'qb_api_calls_used', 'qb_sync_calls_used', 'ai_credits_used',
    'email_sends_used', 'sms_sends_used', 'storage_bytes_used',
  ]);

  private async persistUsageIncrement(
    workspaceId: string,
    column: string,
    amount: number
  ): Promise<void> {
    if (!QuotaEnforcementService.ALLOWED_USAGE_COLUMNS.has(column)) {
      log.warn(`[QuotaEnforcement] Rejected unknown column: ${column}`);
      return;
    }
    try {
      // CATEGORY C — Raw SQL retained: COALESCE + self-referencing arithmetic + sql.raw() | Tables: workspaces | Verified: 2026-03-23
      await typedExec(
        sql`UPDATE workspaces 
        SET ${sql.raw(column)} = COALESCE(${sql.raw(column)}, 0) + ${amount}
        WHERE id = ${workspaceId}`
      );
    } catch (error) {
      log.warn(`[QuotaEnforcement] Failed to persist ${column} increment:`, error);
    }
  }
  
  private qbUsageCache: Map<string, { count: number; resetAt: Date }> = new Map();
  
  private async persistQBUsageIncrement(workspaceId: string, realmId: string, amount: number): Promise<void> {
    if (!realmId) {
      throw new Error('QuickBooks realmId required for usage tracking');
    }
    
    const now = new Date();
    const cacheKey = realmId;
    const cached = this.qbUsageCache.get(cacheKey);
    
    if (cached && cached.resetAt > now) {
      cached.count += amount;
    } else {
      const resetAt = new Date(now.getTime() + 60000);
      this.qbUsageCache.set(cacheKey, { count: amount, resetAt });
    }
    
    try {
      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(quickbooksApiUsage).values({
        realmId,
        workspaceId,
        requestCount: amount,
        periodStart: sql`DATE_TRUNC('minute', NOW())`,
      }).onConflictDoUpdate({
        target: [quickbooksApiUsage.realmId, quickbooksApiUsage.periodStart],
        set: { requestCount: sql`quickbooks_api_usage.request_count + ${amount}` },
      });
    } catch (error) {
      log.error('[QuotaEnforcement] Failed to persist QB API usage:', error);
      throw new Error('QuickBooks usage tracking failed - compliance requires persistence');
    }
  }
  
  async getQBApiUsageThisMinute(realmId: string): Promise<number> {
    if (!realmId) {
      throw new Error('QuickBooks realmId required for usage tracking');
    }
    
    const cacheKey = realmId;
    const cached = this.qbUsageCache.get(cacheKey);
    if (cached && cached.resetAt > new Date()) {
      return cached.count;
    }
    
    try {
      // CATEGORY C — Raw SQL retained: COALESCE(SUM(request_count), 0) as count | Tables: quickbooks_api_usage | Verified: 2026-03-23
      const result = await typedQuery(
        sql`SELECT COALESCE(SUM(request_count), 0) as count
        FROM quickbooks_api_usage
        WHERE realm_id = ${realmId}
          AND period_start >= DATE_TRUNC('minute', NOW())`
      );
      const count = parseInt((result as any[])[0]?.count || '0', 10);
      
      const resetAt = new Date(Date.now() + 60000);
      this.qbUsageCache.set(cacheKey, { count, resetAt });
      
      return count;
    } catch (error) {
      log.error('[QuotaEnforcement] Failed to read QB API usage:', error);
      throw new Error('QuickBooks usage tracking failed - compliance requires persistence');
    }
  }
  
  private emitQuotaWarning(
    workspaceId: string,
    quotaType: QuotaType,
    currentUsage: number,
    limit: number
  ): void {
    const percentage = (currentUsage / limit) * 100;
    
    if (percentage >= 90) {
      platformEventBus.publish({
        type: 'ai_brain_action',
        category: 'automation',
        title: percentage >= 100 ? 'Quota Exceeded' : 'Quota Warning',
        description: `${quotaType} usage at ${Math.round(percentage)}% (${currentUsage}/${limit}). ${percentage >= 100 ? 'Limit exceeded!' : 'Approaching limit.'}`,
        workspaceId,
        metadata: {
          quotaType,
          currentUsage,
          limit,
          percentage,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          severity: percentage >= 100 ? 'critical' : 'warning',
        },
      }).catch((err) => log.warn('[quotaEnforcementService] Fire-and-forget failed:', err));
    }
  }
  
  async getQuotaSummary(workspaceId: string): Promise<Record<QuotaType, QuotaCheckResult>> {
    const quotaTypes: QuotaType[] = [
      'ai_credits',
      'employee_count',
      'email_sends',
      'sms_sends',
      'storage_bytes',
    ];
    
    const results: Partial<Record<QuotaType, QuotaCheckResult>> = {};
    
    for (const quotaType of quotaTypes) {
      results[quotaType] = await this.checkQuota(workspaceId, quotaType);
    }
    
    return results as Record<QuotaType, QuotaCheckResult>;
  }
  
  getTierLimits(tier: string): TierLimits {
    return TIER_LIMITS[tier] || TIER_LIMITS.free_trial;
  }
  
  clearCache(workspaceId?: string): void {
    if (workspaceId) {
      this.usageCache.delete(workspaceId);
      this.cacheTimestamps.delete(workspaceId);
    } else {
      this.usageCache.clear();
      this.cacheTimestamps.clear();
    }
  }
}

export const quotaEnforcementService = new QuotaEnforcementService();
