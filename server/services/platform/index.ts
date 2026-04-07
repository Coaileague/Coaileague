/**
 * PLATFORM OPTIMIZATION SERVICES
 * ===============================
 * Fortune 500-grade performance optimization layer
 * 
 * Services:
 * - cacheManager: Workspace-scoped configuration caching
 * - aiDeduplicator: AI request de-duplication and result caching  
 * - writeBatchers: Intelligent write batching for notifications/events
 * - lazyInitializer: Deferred service initialization
 */
import { createLogger } from '../../lib/logger';
const log = createLogger('index');

export { cacheManager, type WorkspaceConfig, type RoleCheckResult, type ProviderPrefs, type CacheMetrics } from './cacheManager';
export { aiDeduplicator, type DeduplicationMetrics } from './aiRequestDeduplicator';
export { writeBatchers } from './writeBatcher';
export { lazyInitializer } from './lazyInitializer';

export interface PlatformPerformanceMetrics {
  cache: ReturnType<typeof import('./cacheManager').cacheManager.getMetrics>;
  aiDeduplication: ReturnType<typeof import('./aiRequestDeduplicator').aiDeduplicator.getMetrics>;
  writeBatching: ReturnType<typeof import('./writeBatcher').writeBatchers.getAllMetrics>;
  lazyInit: ReturnType<typeof import('./lazyInitializer').lazyInitializer.getMetrics>;
}

/**
 * Get all platform performance metrics
 */
export async function getPlatformPerformanceMetrics(): Promise<PlatformPerformanceMetrics> {
  const { cacheManager } = await import('./cacheManager');
  const { aiDeduplicator } = await import('./aiRequestDeduplicator');
  const { writeBatchers } = await import('./writeBatcher');
  const { lazyInitializer } = await import('./lazyInitializer');
  
  return {
    cache: cacheManager.getMetrics(),
    aiDeduplication: aiDeduplicator.getMetrics(),
    writeBatching: writeBatchers.getAllMetrics(),
    lazyInit: lazyInitializer.getMetrics(),
  };
}

log.info('[PlatformOptimization] Performance optimization services loaded');
