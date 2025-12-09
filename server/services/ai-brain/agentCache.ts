interface CacheEntry {
  value: any;
  expiresAt: number;
  accessCount: number;
  lastAccessedAt: number;
}

export class AgentCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private defaultTtlMs: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(defaultTtlMs: number = 5 * 60 * 1000, maxSize: number = 1000) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxSize = maxSize;
    
    // Periodic cleanup every minute
    setInterval(() => this.cleanup(), 60 * 1000);
    
    console.log('[AgentCache] Initialized with TTL:', defaultTtlMs, 'ms, maxSize:', maxSize);
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Update access stats for LRU
    entry.accessCount++;
    entry.lastAccessedAt = Date.now();
    this.hits++;

    return entry.value;
  }

  set(key: string, value: any, ttlMs?: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const entry: CacheEntry = {
      value,
      expiresAt: Date.now() + (ttlMs || this.defaultTtlMs),
      accessCount: 1,
      lastAccessedAt: Date.now(),
    };

    this.cache.set(key, entry);
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      // First, evict expired entries
      if (Date.now() > entry.expiresAt) {
        this.cache.delete(key);
        return;
      }

      // Then find LRU
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log('[AgentCache] Cleaned', cleaned, 'expired entries');
    }
  }

  getStats(): { size: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  getDetailedStats(): {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
    avgAccessCount: number;
  } {
    const total = this.hits + this.misses;
    let totalAccess = 0;

    for (const entry of this.cache.values()) {
      totalAccess += entry.accessCount;
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      avgAccessCount: this.cache.size > 0 ? totalAccess / this.cache.size : 0,
    };
  }
}

let cacheInstance: AgentCache | null = null;

export function getAgentCache(): AgentCache {
  if (!cacheInstance) {
    cacheInstance = new AgentCache();
  }
  return cacheInstance;
}
