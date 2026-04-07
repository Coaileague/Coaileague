/**
 * AI REQUEST DE-DUPLICATOR
 * =========================
 * Fortune 500-grade AI cost optimization through request de-duplication,
 * result caching, and intelligent batching.
 * 
 * Features:
 * - Identical request de-duplication within time window
 * - Prompt result caching for recurring automation patterns
 * - Request coalescing for concurrent identical calls
 * - Token usage tracking and cost metrics
 */

import { TTLCache } from '../ai-brain/cacheUtils';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('aiRequestDeduplicator');


interface CachedAIResult {
  result: any;
  tokenCount: number;
  timestamp: number;
  promptHash: string;
}

interface PendingRequest {
  promise: Promise<any>;
  timestamp: number;
}

interface DeduplicationMetrics {
  totalRequests: number;
  cacheHits: number;
  coalescedRequests: number;
  tokensSaved: number;
  estimatedCostSaved: number; // in USD
}

class AIRequestDeduplicator {
  private resultCache: TTLCache<string, CachedAIResult>;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private metrics: DeduplicationMetrics = {
    totalRequests: 0,
    cacheHits: 0,
    coalescedRequests: 0,
    tokensSaved: 0,
    estimatedCostSaved: 0,
  };

  private readonly CACHE_TTL = 15 * 60 * 1000; // 15 minutes for AI results
  private readonly PENDING_TIMEOUT = 60 * 1000; // 60 seconds max for pending
  private readonly TOKEN_COST_PER_1K = 0.00025; // Approximate cost per 1k tokens

  constructor() {
    this.resultCache = new TTLCache<string, CachedAIResult>(this.CACHE_TTL, 1000);
    
    // Clean up stale pending requests periodically
    setInterval(() => this.cleanupPendingRequests(), 30000);
    
    log.info('[AIDeduplicator] AI request de-duplication service initialized');
  }

  /**
   * Generate a hash for a prompt to detect duplicates
   */
  private hashPrompt(prompt: string, context?: Record<string, any>): string {
    const data = JSON.stringify({ prompt: prompt.trim(), context: context || {} });
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * Execute an AI request with de-duplication
   * If an identical request is in progress, returns the same promise
   * If a cached result exists, returns it immediately
   */
  async execute<T>(
    key: string,
    prompt: string,
    executor: () => Promise<{ result: T; tokenCount?: number }>,
    options: {
      workspaceId?: string;
      context?: Record<string, any>;
      cacheTTL?: number;
      skipCache?: boolean;
    } = {}
  ): Promise<T> {
    this.metrics.totalRequests++;
    
    const promptHash = this.hashPrompt(prompt, options.context);
    const cacheKey = `${key}:${promptHash}${options.workspaceId ? `:${options.workspaceId}` : ''}`;
    
    // Check cache first (unless explicitly skipped)
    if (!options.skipCache) {
      const cached = this.resultCache.get(cacheKey);
      if (cached) {
        this.metrics.cacheHits++;
        this.metrics.tokensSaved += cached.tokenCount;
        this.metrics.estimatedCostSaved += (cached.tokenCount / 1000) * this.TOKEN_COST_PER_1K;
        return cached.result;
      }
    }
    
    // Check for pending identical request (request coalescing)
    const pending = this.pendingRequests.get(cacheKey);
    if (pending && (Date.now() - pending.timestamp) < this.PENDING_TIMEOUT) {
      this.metrics.coalescedRequests++;
      return pending.promise;
    }
    
    // Execute the request
    const requestPromise = (async () => {
      try {
        const { result, tokenCount = 0 } = await executor();
        
        // Cache the result
        const ttl = options.cacheTTL || this.CACHE_TTL;
        this.resultCache.set(cacheKey, {
          result,
          tokenCount,
          timestamp: Date.now(),
          promptHash,
        }, ttl);
        
        return result;
      } finally {
        this.pendingRequests.delete(cacheKey);
      }
    })();
    
    // Track pending request
    this.pendingRequests.set(cacheKey, {
      promise: requestPromise,
      timestamp: Date.now(),
    });
    
    return requestPromise;
  }

  /**
   * Batch multiple similar requests into one (for entity processing)
   */
  async executeBatch<T, R>(
    key: string,
    items: T[],
    batchExecutor: (items: T[]) => Promise<{ results: R[]; tokenCount?: number }>,
    options: {
      workspaceId?: string;
      maxBatchSize?: number;
      cacheTTL?: number;
    } = {}
  ): Promise<R[]> {
    const maxBatch = options.maxBatchSize || 10;
    const results: R[] = [];
    
    // Process in batches
    for (let i = 0; i < items.length; i += maxBatch) {
      const batch = items.slice(i, i + maxBatch);
      const batchKey = `${key}:batch:${i}`;
      
      const batchResults = await this.execute<R[]>(
        batchKey,
        JSON.stringify(batch),
        async () => batchExecutor(batch),
        {
          workspaceId: options.workspaceId,
          cacheTTL: options.cacheTTL,
        }
      );
      
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Pre-cache a known result (for warming cache with common patterns)
   */
  precache(
    key: string,
    prompt: string,
    result: any,
    tokenCount: number = 0,
    options: {
      workspaceId?: string;
      context?: Record<string, any>;
      ttl?: number;
    } = {}
  ): void {
    const promptHash = this.hashPrompt(prompt, options.context);
    const cacheKey = `${key}:${promptHash}${options.workspaceId ? `:${options.workspaceId}` : ''}`;
    
    this.resultCache.set(cacheKey, {
      result,
      tokenCount,
      timestamp: Date.now(),
      promptHash,
    }, options.ttl || this.CACHE_TTL);
  }

  /**
   * Invalidate cached results for a specific key pattern
   */
  invalidate(keyPattern: string, workspaceId?: string): void {
    const prefix = workspaceId ? `${keyPattern}:` : keyPattern;
    for (const [key] of this.resultCache.entries()) {
      if (key.startsWith(prefix)) {
        this.resultCache.delete(key);
      }
    }
  }

  /**
   * Clean up stale pending requests
   */
  private cleanupPendingRequests(): void {
    const now = Date.now();
    for (const [key, pending] of this.pendingRequests.entries()) {
      if (now - pending.timestamp > this.PENDING_TIMEOUT) {
        this.pendingRequests.delete(key);
      }
    }
  }

  /**
   * Get de-duplication metrics
   */
  getMetrics(): DeduplicationMetrics & { 
    cacheSize: number; 
    hitRate: string;
    pendingRequests: number;
  } {
    const total = this.metrics.totalRequests;
    const hitRate = total > 0 
      ? (((this.metrics.cacheHits + this.metrics.coalescedRequests) / total) * 100).toFixed(1) 
      : '0.0';
    
    return {
      ...this.metrics,
      cacheSize: this.resultCache.size,
      hitRate: `${hitRate}%`,
      pendingRequests: this.pendingRequests.size,
    };
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    this.resultCache.clear();
    this.pendingRequests.clear();
    log.info('[AIDeduplicator] All caches cleared');
  }
}

export const aiDeduplicator = new AIRequestDeduplicator();

export type { DeduplicationMetrics };
