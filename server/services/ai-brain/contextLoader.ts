/**
 * CONTEXT LOADER - Monitoring Context Management
 * 
 * Manages loading, caching, and refreshing monitoring context
 * from the aiContext table with LRU cache optimization
 */

import { db } from '../../db';
import { aiContext, type AiContext, type InsertAiContext } from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';
import type { LoadContextParams, UpsertContextParams, MonitoringContext } from './types';

// Simple LRU cache implementation
class LRUCache<T> {
  private cache = new Map<string, { value: T; timestamp: number }>();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize: number = 100, ttlMinutes: number = 60) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMinutes * 60 * 1000;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recent)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    // Remove if exists to update position
    this.cache.delete(key);

    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { value, timestamp: Date.now() });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

export class ContextLoader {
  private cache: LRUCache<MonitoringContext>;

  constructor() {
    this.cache = new LRUCache<MonitoringContext>(100, 60); // 100 entries, 60min TTL
  }

  /**
   * Load context for a specific feature/scope
   */
  async loadContext(params: LoadContextParams): Promise<MonitoringContext | null> {
    const cacheKey = this.getCacheKey(params);
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log(`🗄️ [ContextLoader] Cache hit for ${cacheKey}`);
      return cached;
    }

    // Load from database
    const conditions = [
      eq(aiContext.monitoringType, params.featureKey as any),
    ];

    if (params.workspaceId !== undefined) {
      if (params.workspaceId === null) {
        conditions.push(isNull(aiContext.workspaceId));
      } else {
        conditions.push(eq(aiContext.workspaceId, params.workspaceId));
      }
    }

    if (params.scope) {
      conditions.push(eq(aiContext.scope, params.scope));
    }

    if (params.entityType) {
      conditions.push(eq(aiContext.entityType, params.entityType));
    }

    if (params.entityId) {
      conditions.push(eq(aiContext.entityId, params.entityId));
    }

    const [result] = await db
      .select()
      .from(aiContext)
      .where(and(...conditions))
      .limit(1);

    if (!result) {
      console.log(`🔍 [ContextLoader] No context found for ${cacheKey}`);
      return null;
    }

    const context = this.mapToMonitoringContext(result);
    
    // Cache the result
    this.cache.set(cacheKey, context);
    console.log(`💾 [ContextLoader] Loaded and cached context for ${cacheKey}`);

    return context;
  }

  /**
   * Refresh a specific context by ID
   */
  async refreshContext(contextId: string): Promise<MonitoringContext | null> {
    const [result] = await db
      .select()
      .from(aiContext)
      .where(eq(aiContext.id, contextId))
      .limit(1);

    if (!result) {
      return null;
    }

    const context = this.mapToMonitoringContext(result);
    
    // Invalidate cache for this context
    const cacheKey = this.getCacheKey({
      featureKey: context.monitoringType,
      workspaceId: context.workspaceId,
      scope: context.scope,
      entityType: context.entityType,
      entityId: context.entityId,
    });
    this.cache.invalidate(cacheKey);

    console.log(`🔄 [ContextLoader] Refreshed context ${contextId}`);
    return context;
  }

  /**
   * Upsert context (create or update)
   */
  async upsertContext(params: UpsertContextParams): Promise<MonitoringContext> {
    const workspaceId = params.workspaceId || null;
    const scope = params.scope || 'workspace';
    const entityId = params.entityId || '';

    // Check if exists
    const existing = await this.loadContext({
      featureKey: params.monitoringType,
      workspaceId,
      scope,
      entityType: params.entityType,
      entityId,
    });

    if (existing) {
      // Update existing
      const [updated] = await db
        .update(aiContext)
        .set({
          contextData: params.contextData,
          metadata: params.metadata || existing.metadata,
          refreshIntervalMinutes: params.refreshIntervalMinutes || existing.refreshIntervalMinutes,
          lastRefreshedAt: new Date(),
          nextRefreshAt: new Date(Date.now() + (params.refreshIntervalMinutes || existing.refreshIntervalMinutes) * 60 * 1000),
          version: existing.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(aiContext.id, existing.id))
        .returning();

      const context = this.mapToMonitoringContext(updated);
      
      // Invalidate cache
      const cacheKey = this.getCacheKey({
        featureKey: params.monitoringType,
        workspaceId,
        scope,
        entityType: params.entityType,
        entityId,
      });
      this.cache.invalidate(cacheKey);

      console.log(`🔼 [ContextLoader] Updated context ${existing.id} (v${context.version})`);
      return context;
    }

    // Create new
    const refreshIntervalMinutes = params.refreshIntervalMinutes || 1440; // 24 hours default
    const [created] = await db
      .insert(aiContext)
      .values({
        workspaceId,
        scope,
        monitoringType: params.monitoringType as any,
        contextKey: params.contextKey,
        entityType: params.entityType,
        entityId,
        contextData: params.contextData,
        metadata: params.metadata || {},
        refreshIntervalMinutes,
        lastRefreshedAt: new Date(),
        nextRefreshAt: new Date(Date.now() + refreshIntervalMinutes * 60 * 1000),
      })
      .returning();

    const context = this.mapToMonitoringContext(created);
    console.log(`🆕 [ContextLoader] Created new context ${context.id}`);

    return context;
  }

  /**
   * Generate cache key from params
   */
  private getCacheKey(params: Partial<LoadContextParams> & { monitoringType?: string }): string {
    return [
      params.workspaceId || 'global',
      params.scope || 'workspace',
      params.featureKey || '',
      params.entityType || '',
      params.entityId || '',
    ].join(':');
  }

  /**
   * Map DB record to MonitoringContext
   */
  private mapToMonitoringContext(record: AiContext): MonitoringContext {
    return {
      id: record.id,
      workspaceId: record.workspaceId,
      scope: record.scope,
      monitoringType: record.monitoringType,
      contextKey: record.contextKey,
      entityType: record.entityType,
      entityId: record.entityId,
      contextData: record.contextData as Record<string, any>,
      metadata: record.metadata as Record<string, any> | undefined,
      refreshIntervalMinutes: record.refreshIntervalMinutes,
      lastRefreshedAt: record.lastRefreshedAt,
      nextRefreshAt: record.nextRefreshAt,
      version: record.version,
    };
  }

  /**
   * Clear all cached contexts
   */
  clearCache(): void {
    this.cache.clear();
    console.log(`🗑️ [ContextLoader] Cache cleared`);
  }
}
