/**
 * Rate Limiting Enhancement Service - Q2 2026 Infrastructure
 * 
 * Provides per-tenant rate limiting with:
 * - Sliding window rate limiting
 * - Per-tenant quotas with plan-based limits
 * - Burst handling with token bucket
 * - Rate limit headers for clients
 * - Real-time quota monitoring
 * - SOX-compliant audit logging
 */

import { randomUUID } from 'crypto';
import { db } from '../../db';
import { systemAuditLogs } from '@shared/schema';
import { createLogger } from '../../lib/logger';
const log = createLogger('rateLimiting');


export interface RateLimitConfig {
  windowMs: number; // Time window in ms
  maxRequests: number; // Max requests per window
  burstLimit: number; // Max burst requests
  burstRefillRate: number; // Tokens added per second
}

export interface TenantQuota {
  tenantId: string;
  plan: 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic';
  config: RateLimitConfig;
  currentUsage: number;
  burstTokens: number;
  windowStart: number;
  lastRequest: number;
  blocked: boolean;
  blockedUntil?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
  burstRemaining: number;
}

export interface RateLimitStats {
  totalRequests: number;
  blockedRequests: number;
  tenantCount: number;
  topTenants: Array<{ tenantId: string; requests: number }>;
  blockRate: number;
}

// Plan-based default limits
const PLAN_LIMITS: Record<string, RateLimitConfig> = {
  free: {
    windowMs: 60000, // 1 minute
    maxRequests: (!process.env.REPLIT_DEPLOYMENT && process.env.NODE_ENV !== 'production') ? 300 : 60,
    burstLimit: (!process.env.REPLIT_DEPLOYMENT && process.env.NODE_ENV !== 'production') ? 50 : 10,
    burstRefillRate: (!process.env.REPLIT_DEPLOYMENT && process.env.NODE_ENV !== 'production') ? 5 : 1
  },
  starter: {
    windowMs: 60000,
    maxRequests: 300,
    burstLimit: 30,
    burstRefillRate: 5
  },
  professional: {
    windowMs: 60000,
    maxRequests: 1000,
    burstLimit: 100,
    burstRefillRate: 10
  },
  enterprise: {
    windowMs: 60000,
    maxRequests: 5000,
    burstLimit: 500,
    burstRefillRate: 50
  }
};

class RateLimitingService {
  private static instance: RateLimitingService;
  private tenantQuotas: Map<string, TenantQuota> = new Map();
  private customLimits: Map<string, RateLimitConfig> = new Map();
  private globalStats = {
    totalRequests: 0,
    blockedRequests: 0
  };
  private isInitialized = false;
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): RateLimitingService {
    if (!RateLimitingService.instance) {
      RateLimitingService.instance = new RateLimitingService();
    }
    return RateLimitingService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.cleanupInterval = setInterval(() => this.cleanupExpiredQuotas(), 60000);

    this.isInitialized = true;
    log.info('[RateLimiting] Service initialized');
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.isInitialized = false;
  }

  /**
   * Check if a request is allowed for a tenant
   */
  checkLimit(tenantId: string, plan: TenantQuota['plan'] = 'free'): RateLimitResult {
    const now = Date.now();
    let quota = this.tenantQuotas.get(tenantId);

    // Initialize quota if not exists
    if (!quota) {
      const config = this.customLimits.get(tenantId) || PLAN_LIMITS[plan];
      quota = {
        tenantId,
        plan,
        config,
        currentUsage: 0,
        burstTokens: config.burstLimit,
        windowStart: now,
        lastRequest: now,
        blocked: false
      };
      this.tenantQuotas.set(tenantId, quota);
    }

    // Check if blocked
    if (quota.blocked && quota.blockedUntil && now < quota.blockedUntil) {
      this.globalStats.blockedRequests++;
      return {
        allowed: false,
        remaining: 0,
        resetAt: quota.blockedUntil,
        retryAfter: Math.ceil((quota.blockedUntil - now) / 1000),
        burstRemaining: 0
      };
    } else if (quota.blocked) {
      quota.blocked = false;
      quota.blockedUntil = undefined;
    }

    // Refill burst tokens based on time elapsed
    const elapsed = (now - quota.lastRequest) / 1000;
    quota.burstTokens = Math.min(
      quota.config.burstLimit,
      quota.burstTokens + (elapsed * quota.config.burstRefillRate)
    );

    // Check if window needs reset
    if (now - quota.windowStart >= quota.config.windowMs) {
      quota.windowStart = now;
      quota.currentUsage = 0;
    }

    this.globalStats.totalRequests++;
    quota.lastRequest = now;

    // Check if over limit
    if (quota.currentUsage >= quota.config.maxRequests) {
      // Try to use burst token
      if (quota.burstTokens >= 1) {
        quota.burstTokens--;
        quota.currentUsage++;
        return {
          allowed: true,
          remaining: Math.max(0, quota.config.maxRequests - quota.currentUsage),
          resetAt: quota.windowStart + quota.config.windowMs,
          burstRemaining: Math.floor(quota.burstTokens)
        };
      }

      // Block the tenant temporarily
      this.globalStats.blockedRequests++;
      const resetAt = quota.windowStart + quota.config.windowMs;
      quota.blocked = true;
      quota.blockedUntil = resetAt;

      this.logRateLimitExceeded(tenantId, quota);

      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.ceil((resetAt - now) / 1000),
        burstRemaining: 0
      };
    }

    // Allow request
    quota.currentUsage++;
    return {
      allowed: true,
      remaining: quota.config.maxRequests - quota.currentUsage,
      resetAt: quota.windowStart + quota.config.windowMs,
      burstRemaining: Math.floor(quota.burstTokens)
    };
  }

  /**
   * Set custom rate limit for a tenant
   */
  setCustomLimit(tenantId: string, config: Partial<RateLimitConfig>): void {
    const existing = this.customLimits.get(tenantId) || PLAN_LIMITS.free;
    const newConfig = { ...existing, ...config };
    this.customLimits.set(tenantId, newConfig);

    // Update existing quota if present
    const quota = this.tenantQuotas.get(tenantId);
    if (quota) {
      quota.config = newConfig;
    }

    log.info(`[RateLimiting] Custom limit set for tenant ${tenantId}`);
  }

  /**
   * Remove custom rate limit (revert to plan-based)
   */
  removeCustomLimit(tenantId: string): void {
    this.customLimits.delete(tenantId);
    
    const quota = this.tenantQuotas.get(tenantId);
    if (quota) {
      quota.config = PLAN_LIMITS[quota.plan];
    }
  }

  /**
   * Get current quota status for a tenant
   */
  getQuotaStatus(tenantId: string): TenantQuota | undefined {
    return this.tenantQuotas.get(tenantId);
  }

  /**
   * Manually unblock a tenant
   */
  unblockTenant(tenantId: string): boolean {
    const quota = this.tenantQuotas.get(tenantId);
    if (quota) {
      quota.blocked = false;
      quota.blockedUntil = undefined;
      quota.currentUsage = 0;
      quota.windowStart = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Get rate limit headers for response
   */
  getHeaders(result: RateLimitResult): Record<string, string> {
    const headers: Record<string, string> = {
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      'X-RateLimit-Burst-Remaining': String(result.burstRemaining)
    };

    if (result.retryAfter) {
      headers['Retry-After'] = String(result.retryAfter);
    }

    return headers;
  }

  /**
   * Get service statistics
   */
  getStats(): RateLimitStats {
    const tenants = Array.from(this.tenantQuotas.values());
    const topTenants = tenants
      .sort((a, b) => b.currentUsage - a.currentUsage)
      .slice(0, 10)
      .map(t => ({ tenantId: t.tenantId, requests: t.currentUsage }));

    return {
      totalRequests: this.globalStats.totalRequests,
      blockedRequests: this.globalStats.blockedRequests,
      tenantCount: tenants.length,
      topTenants,
      blockRate: this.globalStats.totalRequests > 0
        ? this.globalStats.blockedRequests / this.globalStats.totalRequests
        : 0
    };
  }

  /**
   * Get plan limits
   */
  getPlanLimits(): Record<string, RateLimitConfig> {
    return { ...PLAN_LIMITS };
  }

  private async logRateLimitExceeded(tenantId: string, quota: TenantQuota): Promise<void> {
    try {
      const isValidWorkspaceId = tenantId && tenantId.length > 10 && !tenantId.match(/^\d+\.\d+\.\d+\.\d+$/);
      if (!isValidWorkspaceId) {
        log.warn(`[RateLimiting] Rate limit exceeded for non-workspace tenant: ${tenantId} (skipping audit log)`);
        return;
      }
      await db.insert(systemAuditLogs).values({
        id: randomUUID(),
        action: 'rate_limit_exceeded',
        userId: 'system-coaileague',
        workspaceId: tenantId,
        entityType: 'rate_limit',
        entityId: tenantId,
        metadata: {
          source: 'rate_limiting',
          message: `Rate limit exceeded for tenant ${tenantId}`,
          tenantId,
          plan: quota.plan,
          currentUsage: quota.currentUsage,
          maxRequests: quota.config.maxRequests,
          blockedUntil: quota.blockedUntil
        },
      });
    } catch (error) {
      log.error('[RateLimiting] Failed to log rate limit exceeded:', error);
    }
  }

  private cleanupExpiredQuotas(): void {
    const now = Date.now();
    const expireAfter = 10 * 60 * 1000; // 10 minutes of inactivity

    for (const [tenantId, quota] of this.tenantQuotas) {
      if (now - quota.lastRequest > expireAfter) {
        this.tenantQuotas.delete(tenantId);
      }
    }
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.tenantQuotas.clear();
    this.customLimits.clear();
    log.info('[RateLimiting] Service shut down');
  }
}

export const rateLimiting = RateLimitingService.getInstance();

/**
 * Express middleware for rate limiting
 */
export function rateLimitMiddleware(getTenantId: (req: any) => string, getPlan?: (req: any) => TenantQuota['plan']) {
  return (req: any, res: any, next: any) => {
    const tenantId = getTenantId(req);
    const plan = getPlan ? getPlan(req) : 'free';

    const result = rateLimiting.checkLimit(tenantId, plan);

    // Set rate limit headers
    const headers = rateLimiting.getHeaders(result);
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }

    if (!result.allowed) {
      res.status(429).json({
        error: 'Too Many Requests',
        retryAfter: result.retryAfter
      });
      return;
    }

    next();
  };
}
