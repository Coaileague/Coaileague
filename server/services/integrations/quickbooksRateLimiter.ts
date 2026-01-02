/**
 * QuickBooks Rate Limiter Service
 * 
 * Enforces Intuit's API rate limits to prevent 429 errors and Terms of Service violations.
 * 
 * QuickBooks Rate Limits (per realm/company):
 * - 500 requests per minute for production apps
 * - 100 requests per minute for sandbox apps
 * - Concurrent request limit: 10 per realm
 * 
 * Features:
 * - Token bucket algorithm for rate limiting
 * - Exponential backoff on 429 responses
 * - Per-realm tracking for multi-tenant isolation
 * - Automatic request queuing when limits approached
 * 
 * @see https://developer.intuit.com/app/developer/qbo/docs/learn/throttling
 */

interface RealmBucket {
  tokens: number;
  lastRefill: number;
  concurrentRequests: number;
  backoffUntil: number;
  consecutiveFailures: number;
}

interface RateLimitConfig {
  requestsPerMinute: number;
  maxConcurrent: number;
  burstBuffer: number; // Reserve capacity for priority requests
}

const PRODUCTION_CONFIG: RateLimitConfig = {
  requestsPerMinute: 500,
  maxConcurrent: 10,
  burstBuffer: 0, // No buffer - use full allocation for accuracy
};

const SANDBOX_CONFIG: RateLimitConfig = {
  requestsPerMinute: 100,
  maxConcurrent: 5,
  burstBuffer: 0, // No buffer - use full allocation for accuracy
};

export interface RateLimitResult {
  allowed: boolean;
  waitMs?: number;
  remainingTokens: number;
  queuePosition?: number;
}

export interface RateLimitStats {
  realmId: string;
  tokensRemaining: number;
  concurrentRequests: number;
  backoffUntil: number | null;
  requestsLastMinute: number;
  isThrottled: boolean;
}

class QuickBooksRateLimiter {
  private buckets: Map<string, RealmBucket> = new Map();
  private requestQueues: Map<string, Array<{ resolve: () => void; priority: number }>> = new Map();
  private requestHistory: Map<string, number[]> = new Map();
  
  private readonly MAX_BACKOFF_MS = 60000; // 1 minute max backoff
  private readonly BASE_BACKOFF_MS = 1000; // Start with 1 second
  private readonly REFILL_INTERVAL_MS = 60000; // 1 minute
  
  private getConfig(environment: 'production' | 'sandbox'): RateLimitConfig {
    return environment === 'production' ? PRODUCTION_CONFIG : SANDBOX_CONFIG;
  }
  
  private getBucket(realmId: string, environment: 'production' | 'sandbox'): RealmBucket {
    const key = `${environment}:${realmId}`;
    
    if (!this.buckets.has(key)) {
      const config = this.getConfig(environment);
      this.buckets.set(key, {
        tokens: config.requestsPerMinute,
        lastRefill: Date.now(),
        concurrentRequests: 0,
        backoffUntil: 0,
        consecutiveFailures: 0,
      });
    }
    
    return this.buckets.get(key)!;
  }
  
  private refillTokens(bucket: RealmBucket, config: RateLimitConfig): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    
    if (elapsed >= this.REFILL_INTERVAL_MS) {
      bucket.tokens = config.requestsPerMinute;
      bucket.lastRefill = now;
    } else {
      const tokensToAdd = Math.floor((elapsed / this.REFILL_INTERVAL_MS) * config.requestsPerMinute);
      bucket.tokens = Math.min(
        bucket.tokens + tokensToAdd,
        config.requestsPerMinute
      );
      bucket.lastRefill = now;
    }
  }
  
  private recordRequest(realmId: string, environment: 'production' | 'sandbox'): void {
    const key = `${environment}:${realmId}`;
    const now = Date.now();
    const history = this.requestHistory.get(key) || [];
    
    history.push(now);
    
    const oneMinuteAgo = now - 60000;
    const recentHistory = history.filter(t => t > oneMinuteAgo);
    this.requestHistory.set(key, recentHistory);
  }
  
  async checkRateLimit(
    realmId: string,
    environment: 'production' | 'sandbox' = 'production',
    priority: number = 0
  ): Promise<RateLimitResult> {
    const config = this.getConfig(environment);
    const bucket = this.getBucket(realmId, environment);
    const now = Date.now();
    
    if (bucket.backoffUntil > now) {
      return {
        allowed: false,
        waitMs: bucket.backoffUntil - now,
        remainingTokens: bucket.tokens,
      };
    }
    
    this.refillTokens(bucket, config);
    
    if (bucket.concurrentRequests >= config.maxConcurrent) {
      return {
        allowed: false,
        waitMs: 1000,
        remainingTokens: bucket.tokens,
      };
    }
    
    if (bucket.tokens <= 0) {
      const timeUntilRefill = this.REFILL_INTERVAL_MS - (now - bucket.lastRefill);
      return {
        allowed: false,
        waitMs: Math.max(timeUntilRefill, 1000),
        remainingTokens: 0,
      };
    }
    
    bucket.tokens = Math.max(0, bucket.tokens - 1);
    bucket.concurrentRequests++;
    this.recordRequest(realmId, environment);
    
    return {
      allowed: true,
      remainingTokens: Math.max(0, bucket.tokens),
    };
  }
  
  completeRequest(
    realmId: string,
    environment: 'production' | 'sandbox' = 'production',
    success: boolean = true
  ): void {
    const key = `${environment}:${realmId}`;
    const bucket = this.buckets.get(key);
    
    if (bucket) {
      bucket.concurrentRequests = Math.max(0, bucket.concurrentRequests - 1);
      
      if (success) {
        bucket.consecutiveFailures = 0;
      }
    }
    
    this.processQueue(realmId, environment);
  }
  
  recordThrottle(realmId: string, environment: 'production' | 'sandbox' = 'production'): number {
    const key = `${environment}:${realmId}`;
    const bucket = this.getBucket(realmId, environment);
    
    bucket.consecutiveFailures++;
    
    const backoffMs = Math.min(
      this.BASE_BACKOFF_MS * Math.pow(2, bucket.consecutiveFailures - 1),
      this.MAX_BACKOFF_MS
    );
    
    bucket.backoffUntil = Date.now() + backoffMs;
    
    console.warn(`[QB RateLimit] Throttled for realm ${realmId}, backing off for ${backoffMs}ms`);
    
    return backoffMs;
  }
  
  async waitForSlot(
    realmId: string,
    environment: 'production' | 'sandbox' = 'production',
    priority: number = 0,
    timeoutMs: number = 30000
  ): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const result = await this.checkRateLimit(realmId, environment, priority);
      
      if (result.allowed) {
        return true;
      }
      
      const waitTime = Math.min(result.waitMs || 1000, timeoutMs - (Date.now() - startTime));
      if (waitTime <= 0) break;
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    console.warn(`[QB RateLimit] Timeout waiting for slot for realm ${realmId}`);
    return false;
  }
  
  private processQueue(realmId: string, environment: 'production' | 'sandbox'): void {
    const key = `${environment}:${realmId}`;
    const queue = this.requestQueues.get(key);
    
    if (queue && queue.length > 0) {
      queue.sort((a, b) => b.priority - a.priority);
      const next = queue.shift();
      if (next) {
        next.resolve();
      }
    }
  }
  
  getStats(realmId: string, environment: 'production' | 'sandbox' = 'production'): RateLimitStats {
    const key = `${environment}:${realmId}`;
    const bucket = this.getBucket(realmId, environment);
    const history = this.requestHistory.get(key) || [];
    const now = Date.now();
    
    const oneMinuteAgo = now - 60000;
    const requestsLastMinute = history.filter(t => t > oneMinuteAgo).length;
    
    return {
      realmId,
      tokensRemaining: bucket.tokens,
      concurrentRequests: bucket.concurrentRequests,
      backoffUntil: bucket.backoffUntil > now ? bucket.backoffUntil : null,
      requestsLastMinute,
      isThrottled: bucket.backoffUntil > now,
    };
  }
  
  getAllStats(environment: 'production' | 'sandbox' = 'production'): RateLimitStats[] {
    const stats: RateLimitStats[] = [];
    const prefix = `${environment}:`;
    
    for (const key of this.buckets.keys()) {
      if (key.startsWith(prefix)) {
        const realmId = key.substring(prefix.length);
        stats.push(this.getStats(realmId, environment));
      }
    }
    
    return stats;
  }
  
  resetRealm(realmId: string, environment: 'production' | 'sandbox' = 'production'): void {
    const key = `${environment}:${realmId}`;
    this.buckets.delete(key);
    this.requestHistory.delete(key);
    this.requestQueues.delete(key);
    console.log(`[QB RateLimit] Reset rate limit state for realm ${realmId}`);
  }
}

export const quickbooksRateLimiter = new QuickBooksRateLimiter();
