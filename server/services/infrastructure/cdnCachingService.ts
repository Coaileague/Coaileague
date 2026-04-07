/**
 * CDN/Edge Caching Service - Q4 2026 Infrastructure
 * ==================================================
 * Static asset delivery optimization and API response caching.
 * 
 * Features:
 * - Static asset caching with fingerprinting
 * - API response caching with TTL
 * - Cache invalidation strategies
 * - Edge location simulation
 * - Cache hit/miss metrics
 */

import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('cdnCachingService');


interface CacheEntry {
  key: string;
  value: any;
  contentType: string;
  size: number;
  hash: string;
  createdAt: Date;
  expiresAt: Date;
  hits: number;
  lastAccessed: Date;
  tags: string[];
}

interface CacheConfig {
  defaultTTL: number;
  maxSize: number; // bytes
  maxEntries: number;
  compressionEnabled: boolean;
}

interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  missRate: number;
  evictions: number;
  hits: number;
  misses: number;
  avgLatency: number;
}

interface EdgeLocation {
  id: string;
  name: string;
  region: string;
  entries: number;
  hitRate: number;
  latency: number; // ms
}

class CDNCachingService {
  private initialized = false;
  private cache: Map<string, CacheEntry> = new Map();
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private latencies: number[] = [];
  
  private config: CacheConfig = {
    defaultTTL: 3600000, // 1 hour
    maxSize: 100 * 1024 * 1024, // 100MB
    maxEntries: 10000,
    compressionEnabled: true,
  };
  
  // Simulated edge locations
  private edgeLocations: Map<string, EdgeLocation> = new Map([
    ['us-east', { id: 'us-east', name: 'US East', region: 'North America', entries: 0, hitRate: 0, latency: 15 }],
    ['us-west', { id: 'us-west', name: 'US West', region: 'North America', entries: 0, hitRate: 0, latency: 25 }],
    ['eu-west', { id: 'eu-west', name: 'EU West', region: 'Europe', entries: 0, hitRate: 0, latency: 80 }],
    ['ap-east', { id: 'ap-east', name: 'Asia Pacific', region: 'Asia', entries: 0, hitRate: 0, latency: 150 }],
  ]);
  
  private cleanupInterval?: NodeJS.Timeout;
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Start cache cleanup
    this.startCacheCleanup();
    
    this.initialized = true;
    log.info('[CDNCaching] Service initialized with 4 edge locations');
  }
  
  /**
   * Get an item from cache
   */
  get<T>(key: string): { value: T; hit: boolean; latency: number } | null {
    const startTime = Date.now();
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      this.recordLatency(Date.now() - startTime);
      return null;
    }
    
    // Check expiration
    if (entry.expiresAt < new Date()) {
      this.cache.delete(key);
      this.misses++;
      this.recordLatency(Date.now() - startTime);
      return null;
    }
    
    // Update stats
    entry.hits++;
    entry.lastAccessed = new Date();
    this.hits++;
    
    const latency = Date.now() - startTime;
    this.recordLatency(latency);
    
    return {
      value: entry.value as T,
      hit: true,
      latency,
    };
  }
  
  /**
   * Set an item in cache
   */
  set(
    key: string,
    value: any,
    options: {
      ttl?: number;
      contentType?: string;
      tags?: string[];
    } = {}
  ): CacheEntry {
    // Check if we need to evict entries
    this.ensureCapacity();
    
    const serialized = JSON.stringify(value);
    const size = Buffer.byteLength(serialized);
    
    const entry: CacheEntry = {
      key,
      value,
      contentType: options.contentType || 'application/json',
      size,
      hash: this.generateHash(serialized),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + (options.ttl || this.config.defaultTTL)),
      hits: 0,
      lastAccessed: new Date(),
      tags: options.tags || [],
    };
    
    this.cache.set(key, entry);
    
    // Update edge location stats (simulate distribution)
    this.updateEdgeStats();
    
    return entry;
  }
  
  /**
   * Invalidate cache entries by key or pattern
   */
  invalidate(pattern: string | RegExp): number {
    let invalidated = 0;
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        invalidated++;
      }
    }
    
    if (invalidated > 0) {
      // Internal event: cache_invalidated
      log.info(`[CDNCaching] Invalidated ${invalidated} entries matching ${pattern}`);
    }
    
    return invalidated;
  }
  
  /**
   * Invalidate cache entries by tag
   */
  invalidateByTag(tag: string): number {
    let invalidated = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.includes(tag)) {
        this.cache.delete(key);
        invalidated++;
      }
    }
    
    if (invalidated > 0) {
      log.info(`[CDNCaching] Invalidated ${invalidated} entries with tag: ${tag}`);
    }
    
    return invalidated;
  }
  
  /**
   * Purge all cache entries
   */
  purge(): number {
    const count = this.cache.size;
    this.cache.clear();
    this.resetStats();
    
    // Internal event: cache_purged
    log.info(`[CDNCaching] Purged all ${count} entries`);
    
    return count;
  }
  
  /**
   * Warm cache with pre-computed values
   */
  async warmCache(entries: Array<{ key: string; value: any; ttl?: number }>): Promise<number> {
    let warmed = 0;
    
    for (const entry of entries) {
      this.set(entry.key, entry.value, { ttl: entry.ttl });
      warmed++;
    }
    
    log.info(`[CDNCaching] Cache warmed with ${warmed} entries`);
    return warmed;
  }
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += entry.size;
    }
    
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;
    const missRate = totalRequests > 0 ? (this.misses / totalRequests) * 100 : 0;
    
    const avgLatency = this.latencies.length > 0
      ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
      : 0;
    
    return {
      totalEntries: this.cache.size,
      totalSize,
      hitRate: Math.round(hitRate * 100) / 100,
      missRate: Math.round(missRate * 100) / 100,
      evictions: this.evictions,
      hits: this.hits,
      misses: this.misses,
      avgLatency: Math.round(avgLatency * 100) / 100,
    };
  }
  
  /**
   * Get edge location statistics
   */
  getEdgeLocations(): EdgeLocation[] {
    return Array.from(this.edgeLocations.values());
  }
  
  /**
   * Get configuration
   */
  getConfig(): CacheConfig {
    return { ...this.config };
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...config };
    log.info('[CDNCaching] Configuration updated');
  }
  
  /**
   * Get health status
   */
  getHealth(): {
    healthy: boolean;
    hitRate: number;
    capacityPercent: number;
    edgeStatus: string;
    issues: string[];
  } {
    const stats = this.getStats();
    const issues: string[] = [];
    
    const capacityPercent = (stats.totalSize / this.config.maxSize) * 100;
    
    if (stats.hitRate < 50 && this.hits + this.misses > 100) {
      issues.push(`Low cache hit rate: ${stats.hitRate}%`);
    }
    
    if (capacityPercent > 90) {
      issues.push(`High cache usage: ${Math.round(capacityPercent)}%`);
    }
    
    if (this.evictions > 1000) {
      issues.push(`High eviction rate: ${this.evictions} evictions`);
    }
    
    const edgeLocations = this.getEdgeLocations();
    const healthyEdges = edgeLocations.filter(e => e.latency < 200).length;
    const edgeStatus = `${healthyEdges}/${edgeLocations.length} healthy`;
    
    return {
      healthy: issues.length === 0,
      hitRate: stats.hitRate,
      capacityPercent: Math.round(capacityPercent),
      edgeStatus,
      issues,
    };
  }
  
  /**
   * Cache middleware for Express routes
   */
  cacheMiddleware(ttl?: number) {
    return (req: any, res: any, next: any) => {
      const cacheKey = `route:${req.method}:${req.originalUrl}`;
      const cached = this.get(cacheKey);
      
      if (cached) {
        return res.json(cached.value);
      }
      
      // Store original json method
      const originalJson = res.json.bind(res);
      
      res.json = (data: any) => {
        this.set(cacheKey, data, { ttl: ttl || this.config.defaultTTL, tags: ['api'] });
        return originalJson(data);
      };
      
      next();
    };
  }
  
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    log.info('[CDNCaching] Service shut down');
  }
  
  // Private methods
  
  private generateHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }
  
  private ensureCapacity(): void {
    // Check entry count
    while (this.cache.size >= this.config.maxEntries) {
      this.evictLRU();
    }
    
    // Check size
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += entry.size;
    }
    
    while (totalSize >= this.config.maxSize && this.cache.size > 0) {
      const evicted = this.evictLRU();
      if (evicted) {
        totalSize -= evicted.size;
      } else {
        break;
      }
    }
  }
  
  private evictLRU(): CacheEntry | null {
    let oldest: CacheEntry | null = null;
    let oldestKey: string | null = null;
    
    for (const [key, entry] of this.cache.entries()) {
      if (!oldest || entry.lastAccessed < oldest.lastAccessed) {
        oldest = entry;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.evictions++;
    }
    
    return oldest;
  }
  
  private recordLatency(latency: number): void {
    this.latencies.push(latency);
    // Keep last 1000 measurements
    if (this.latencies.length > 1000) {
      this.latencies = this.latencies.slice(-1000);
    }
  }
  
  private resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.latencies = [];
  }
  
  private updateEdgeStats(): void {
    const entriesPerEdge = Math.floor(this.cache.size / this.edgeLocations.size);
    const totalRequests = this.hits + this.misses || 1;
    
    for (const edge of this.edgeLocations.values()) {
      edge.entries = entriesPerEdge;
      edge.hitRate = Math.round((this.hits / totalRequests) * 100);
    }
  }
  
  private startCacheCleanup(): void {
    // Clean expired entries every minute
    this.cleanupInterval = setInterval(() => {
      let expired = 0;
      const now = new Date();
      
      for (const [key, entry] of this.cache.entries()) {
        if (entry.expiresAt < now) {
          this.cache.delete(key);
          expired++;
        }
      }
      
      if (expired > 0) {
        log.info(`[CDNCaching] Cleaned up ${expired} expired entries`);
      }
    }, 60000);
  }
}

export const cdnCachingService = new CDNCachingService();
