/**
 * Universal Idempotency Service for AI Brain Operations
 * Provides in-memory + optional DB-backed idempotency protection for all AI Brain actions
 * Uses a lightweight approach optimized for high-throughput AI operations
 */

import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('idempotencyService');

export interface IdempotencyResult<T = any> {
  isNew: boolean;
  key: string;
  cachedResult?: T;
  expiresAt?: Date;
}

export interface IdempotencyOptions {
  ttlMs?: number;
  category: 'work_order' | 'action' | 'execution' | 'notification' | 'billing' | 'general';
  workspaceId?: number | string;
  userId?: number | string;
}

const DEFAULT_TTL_MS = 300000; // 5 minutes
const CATEGORY_TTL_MS: Record<string, number> = {
  work_order: 3600000,     // 1 hour - work orders can be retried after an hour
  action: 300000,          // 5 minutes - actions dedupe within 5 mins
  execution: 86400000,     // 24 hours - executions are long-lived
  notification: 300000,    // 5 minutes - notifications dedupe quickly
  billing: 604800000,      // 7 days - billing operations are weekly
  general: 300000,         // 5 minutes default
};

interface CacheEntry<T = any> {
  expiresAt: number;
  result: T;
  status: 'processing' | 'completed' | 'failed';
  createdAt: number;
}

class IdempotencyService {
  private cache = new Map<string, CacheEntry>();
  private readonly MAX_CACHE_SIZE = 50000;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start periodic cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanupExpired(), 300000);
  }

  /**
   * Generate a deterministic idempotency key from input parameters
   */
  generateKey(params: {
    category: string;
    actionId?: string;
    workspaceId?: number | string;
    userId?: number | string;
    payload?: any;
    customKey?: string;
  }): string {
    if (params.customKey) {
      return `${params.category}:${params.customKey}`;
    }

    const parts = [
      params.category,
      params.actionId || 'unknown',
      String(params.workspaceId || 'global'),
      String(params.userId || 'system'),
    ];

    // Hash the payload if present to create deterministic key
    if (params.payload) {
      try {
        const payloadStr = JSON.stringify(params.payload, Object.keys(params.payload).sort());
        const payloadHash = crypto.createHash('sha256').update(payloadStr).digest('hex').substring(0, 16);
        parts.push(payloadHash);
      } catch {
        parts.push('payload-hash-error');
      }
    }

    return parts.join(':');
  }

  /**
   * Check if an operation with this key has been processed recently
   * Returns cached result if available, or marks as new if not
   */
  checkAndMark<T = any>(
    key: string,
    options: IdempotencyOptions
  ): IdempotencyResult<T> {
    const ttlMs = options.ttlMs || CATEGORY_TTL_MS[options.category] || DEFAULT_TTL_MS;
    const now = Date.now();

    // Check cache
    const cached = this.cache.get(key);
    if (cached) {
      if (cached.expiresAt > now) {
        // Still valid
        if (cached.status === 'completed') {
          return {
            isNew: false,
            key,
            cachedResult: cached.result,
            expiresAt: new Date(cached.expiresAt),
          };
        } else if (cached.status === 'processing') {
          // Another operation in progress - treat as duplicate
          return {
            isNew: false,
            key,
            expiresAt: new Date(cached.expiresAt),
          };
        }
        // Status is 'failed' - allow retry
      }
      // Expired or failed - remove and allow retry
      this.cache.delete(key);
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldest();
    }

    // Mark as processing
    const expiresAt = now + ttlMs;
    this.cache.set(key, {
      expiresAt,
      result: null,
      status: 'processing',
      createdAt: now,
    });

    return {
      isNew: true,
      key,
      expiresAt: new Date(expiresAt),
    };
  }

  /**
   * Store the result of a completed operation
   */
  storeResult<T = any>(
    key: string,
    result: T,
    success: boolean = true
  ): void {
    const entry = this.cache.get(key);
    if (entry) {
      entry.result = result;
      entry.status = success ? 'completed' : 'failed';
    }
  }

  /**
   * Mark an operation as failed (allows retry on next request)
   */
  markFailed(key: string, _error?: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      entry.status = 'failed';
    }
  }

  /**
   * Delete an idempotency key (force allow retry)
   */
  deleteKey(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Check if a key exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Cleanup expired idempotency keys
   */
  cleanupExpired(): { deleted: number } {
    const now = Date.now();
    let deleted = 0;

    for (const [key, value] of this.cache.entries()) {
      if (value.expiresAt < now) {
        this.cache.delete(key);
        deleted++;
      }
    }

    if (deleted > 0) {
      log.info(`[IdempotencyService] Cleaned up ${deleted} expired keys`);
    }
    return { deleted };
  }

  /**
   * Get stats about idempotency keys
   */
  getStats(): {
    totalKeys: number;
    byCategory: Record<string, number>;
    byStatus: Record<string, number>;
    oldestKey: number | null;
  } {
    const byCategory: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let oldestKey: number | null = null;

    for (const [key, value] of this.cache.entries()) {
      const category = key.split(':')[0] || 'unknown';
      byCategory[category] = (byCategory[category] || 0) + 1;
      byStatus[value.status] = (byStatus[value.status] || 0) + 1;
      
      if (oldestKey === null || value.createdAt < oldestKey) {
        oldestKey = value.createdAt;
      }
    }

    return {
      totalKeys: this.cache.size,
      byCategory,
      byStatus,
      oldestKey,
    };
  }

  private evictOldest(): void {
    const evictCount = Math.max(1, Math.floor(this.cache.size * 0.1));
    const entries: { key: string; createdAt: number }[] = [];
    for (const [key, value] of this.cache.entries()) {
      entries.push({ key, createdAt: value.createdAt });
    }
    entries.sort((a, b) => a.createdAt - b.createdAt);
    for (let i = 0; i < Math.min(evictCount, entries.length); i++) {
      this.cache.delete(entries[i].key);
    }
  }

  /**
   * Shutdown cleanup interval
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton export
export const idempotencyService = new IdempotencyService();

// Helper function for wrapping operations with idempotency
export async function withIdempotency<T>(
  keyParams: {
    category: IdempotencyOptions['category'];
    actionId: string;
    workspaceId?: number | string;
    userId?: number | string;
    payload?: any;
  },
  operation: () => Promise<T>,
  options?: Partial<IdempotencyOptions>
): Promise<{ result: T; wasNew: boolean; idempotencyKey: string }> {
  const key = idempotencyService.generateKey(keyParams);
  const opts: IdempotencyOptions = {
    category: keyParams.category,
    workspaceId: keyParams.workspaceId,
    userId: keyParams.userId,
    ...options,
  };

  const check = idempotencyService.checkAndMark<T>(key, opts);

  if (!check.isNew && check.cachedResult !== undefined) {
    return {
      result: check.cachedResult,
      wasNew: false,
      idempotencyKey: key,
    };
  }

  try {
    const result = await operation();
    idempotencyService.storeResult(key, result, true);
    return {
      result,
      wasNew: true,
      idempotencyKey: key,
    };
  } catch (error) {
    idempotencyService.markFailed(key, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

// Register AI Brain actions for idempotency management
export function registerIdempotencyActions(helpaiOrchestrator: any): void {
  helpaiOrchestrator.registerAction({
    actionId: 'idempotency.get_stats',
    name: 'Get Idempotency Stats',
    description: 'Get statistics about idempotency keys in the system',
    category: 'system',
    requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async () => {
      const stats = idempotencyService.getStats();
      return {
        success: true,
        data: stats,
        message: `${stats.totalKeys} keys tracked across ${Object.keys(stats.byCategory).length} categories`,
      };
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'idempotency.cleanup',
    name: 'Cleanup Expired Idempotency Keys',
    description: 'Remove expired idempotency keys from the cache',
    category: 'system',
    requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async () => {
      const result = idempotencyService.cleanupExpired();
      return {
        success: true,
        data: result,
        message: `Cleaned up ${result.deleted} expired keys`,
      };
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'idempotency.force_retry',
    name: 'Force Retry Operation',
    description: 'Delete an idempotency key to allow operation retry',
    category: 'system',
    requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (request: any) => {
      const { key } = request.payload || {};
      if (!key) {
        return { success: false, message: 'Key is required' };
      }
      idempotencyService.deleteKey(key);
      return {
        success: true,
        message: `Idempotency key deleted, operation can be retried`,
      };
    },
  });

  log.info('[IdempotencyService] Registered 3 AI Brain actions');
}
