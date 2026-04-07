/**
 * PLATFORM CACHE MANAGER
 * ======================
 * Fortune 500-grade centralized caching system with workspace isolation,
 * TTL management, automatic invalidation, and performance metrics.
 * 
 * Design Principles:
 * - Workspace-scoped caching for multi-tenant isolation
 * - Read-through caching with configurable TTLs
 * - Automatic invalidation on data mutations
 * - Memory-efficient with LRU eviction
 * - Observable metrics for monitoring
 */

import { TTLCache } from '../ai-brain/cacheUtils';
import { db } from '../../db';
import {
  workspaces,
  employees
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
const log = createLogger('cacheManager');


interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  invalidations: number;
}

interface WorkspaceConfig {
  id: string;
  name: string;
  ownerId: string;
  tier: string;
  orgCode: string | null;
  timezone: string | null;
  isActive: boolean; // derived from subscriptionStatus
  settings: Record<string, any>;
}

interface RoleCheckResult {
  role: string | null;
  employeeId: string | null;
  hasAccess: boolean;
}

interface ProviderPrefs {
  invoiceProvider: string;
  payrollProvider: string;
  qbAutoSync: boolean;
}

class PlatformCacheManager {
  private workspaceCache: TTLCache<string, WorkspaceConfig>;
  private roleCache: TTLCache<string, RoleCheckResult>;
  private providerCache: TTLCache<string, ProviderPrefs>;
  private tierCache: TTLCache<string, string>;
  private employeeCountCache: TTLCache<string, number>;
  // Phase 39 — Feature state blob cache: avoid per-check DB hit on featureGate checks
  private featureBlobCache: TTLCache<string, Record<string, any>>;
  
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    evictions: 0,
    invalidations: 0,
  };

  private readonly WORKSPACE_TTL = 5 * 60 * 1000;  // 5 minutes
  private readonly ROLE_TTL = 2 * 60 * 1000;       // 2 minutes (shorter for security)
  private readonly PROVIDER_TTL = 5 * 60 * 1000;   // 5 minutes
  private readonly TIER_TTL = 10 * 60 * 1000;      // 10 minutes (changes rarely)
  private readonly COUNT_TTL = 60 * 1000;          // 1 minute
  private readonly FEATURE_BLOB_TTL = 2 * 60 * 1000; // 2 minutes (matches ROLE_TTL for security)

  constructor() {
    this.workspaceCache = new TTLCache<string, WorkspaceConfig>(this.WORKSPACE_TTL, 500);
    this.roleCache = new TTLCache<string, RoleCheckResult>(this.ROLE_TTL, 2000);
    this.providerCache = new TTLCache<string, ProviderPrefs>(this.PROVIDER_TTL, 500);
    this.tierCache = new TTLCache<string, string>(this.TIER_TTL, 500);
    this.employeeCountCache = new TTLCache<string, number>(this.COUNT_TTL, 500);
    this.featureBlobCache = new TTLCache<string, Record<string, any>>(this.FEATURE_BLOB_TTL, 500);
    
    log.info('[CacheManager] Platform cache manager initialized');
  }

  /**
   * Get workspace configuration with caching
   */
  async getWorkspaceConfig(workspaceId: string): Promise<WorkspaceConfig | null> {
    const cached = this.workspaceCache.get(workspaceId);
    if (cached) {
      this.metrics.hits++;
      return cached;
    }
    
    this.metrics.misses++;
    
    try {
      const [workspace] = await db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          ownerId: workspaces.ownerId,
          tier: workspaces.subscriptionTier,
          orgCode: workspaces.orgCode,
          timezone: workspaces.timezone,
          subscriptionStatus: workspaces.subscriptionStatus,
        })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      
      if (!workspace) return null;
      
      const config: WorkspaceConfig = {
        id: workspace.id,
        name: workspace.name,
        ownerId: workspace.ownerId,
        tier: workspace.tier || 'free',
        orgCode: workspace.orgCode,
        timezone: workspace.timezone,
        isActive: workspace.subscriptionStatus === 'active',
        settings: {},
      };
      
      this.workspaceCache.set(workspaceId, config);
      return config;
    } catch (error) {
      log.error('[CacheManager] Error fetching workspace:', error);
      return null;
    }
  }

  /**
   * Get workspace tier with caching (frequently accessed for billing/features)
   */
  async getWorkspaceTier(workspaceId: string): Promise<string> {
    const cached = this.tierCache.get(workspaceId);
    if (cached) {
      this.metrics.hits++;
      return cached;
    }
    
    this.metrics.misses++;
    const config = await this.getWorkspaceConfig(workspaceId);
    const tier = config?.tier || 'free';
    this.tierCache.set(workspaceId, tier);
    return tier;
  }

  /**
   * Get workspace tier AND subscription status with caching
   * Used by tier guards for optimized requirePlan() checks
   */
  async getWorkspaceTierWithStatus(workspaceId: string): Promise<{ tier: string; status: string } | null> {
    const cacheKey = `tierStatus:${workspaceId}`;
    const cached = this.tierCache.get(cacheKey);
    if (cached) {
      this.metrics.hits++;
      const [tier, status] = cached.split('|');
      return { tier, status };
    }
    
    this.metrics.misses++;
    
    try {
      const [workspace] = await db
        .select({
          tier: workspaces.subscriptionTier,
          status: workspaces.subscriptionStatus,
        })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      
      if (!workspace) return null;
      
      const result = {
        tier: workspace.tier || 'free',
        status: workspace.status || 'active',
      };
      
      this.tierCache.set(cacheKey, `${result.tier}|${result.status}`);
      this.tierCache.set(workspaceId, result.tier);
      
      return result;
    } catch (error) {
      log.error('[CacheManager] Error fetching tier+status:', error);
      return null;
    }
  }

  /**
   * Get user's role in workspace with caching
   */
  async getUserWorkspaceRole(
    userId: string, 
    workspaceId: string
  ): Promise<RoleCheckResult> {
    const cacheKey = `${userId}:${workspaceId}`;
    const cached = this.roleCache.get(cacheKey);
    if (cached) {
      this.metrics.hits++;
      return cached;
    }
    
    this.metrics.misses++;
    
    try {
      const [employee] = await db
        .select({
          id: employees.id,
          role: employees.workspaceRole,
        })
        .from(employees)
        .where(
          and(
            eq(employees.userId, userId),
            eq(employees.workspaceId, workspaceId)
          )
        )
        .limit(1);
      
      const result: RoleCheckResult = {
        role: employee?.role || null,
        employeeId: employee?.id || null,
        hasAccess: !!employee,
      };
      
      this.roleCache.set(cacheKey, result);
      return result;
    } catch (error) {
      log.error('[CacheManager] Error fetching role:', error);
      return { role: null, employeeId: null, hasAccess: false };
    }
  }

  /**
   * Get provider preferences with caching
   */
  async getProviderPreferences(workspaceId: string): Promise<ProviderPrefs> {
    const cached = this.providerCache.get(workspaceId);
    if (cached) {
      this.metrics.hits++;
      return cached;
    }
    
    this.metrics.misses++;
    
    try {
      const [ws] = await db
        .select({ blob: workspaces.billingSettingsBlob })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      const settings = (ws?.blob || {}) as Record<string, any>;
      
      const prefs: ProviderPrefs = {
        invoiceProvider: settings.invoiceProvider || 'stripe',
        payrollProvider: settings.payrollProvider || 'local',
        qbAutoSync: settings.qbAutoSync ?? false,
      };
      
      this.providerCache.set(workspaceId, prefs);
      return prefs;
    } catch (error) {
      log.error('[CacheManager] Error fetching provider prefs:', error);
      return { invoiceProvider: 'stripe', payrollProvider: 'local', qbAutoSync: false };
    }
  }

  /**
   * Get employee count for workspace with caching
   */
  async getEmployeeCount(workspaceId: string): Promise<number> {
    const cached = this.employeeCountCache.get(workspaceId);
    if (cached !== undefined) {
      this.metrics.hits++;
      return cached;
    }
    
    this.metrics.misses++;
    
    try {
      const result = await db
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.workspaceId, workspaceId));
      
      const count = result.length;
      this.employeeCountCache.set(workspaceId, count);
      return count;
    } catch (error) {
      log.error('[CacheManager] Error counting employees:', error);
      return 0;
    }
  }

  /**
   * Check if user has manager-level access (cached)
   */
  async hasManagerAccess(userId: string, workspaceId: string): Promise<boolean> {
    const roleResult = await this.getUserWorkspaceRole(userId, workspaceId);
    if (!roleResult.hasAccess) return false;
    
    const managerRoles = ['org_owner', 'co_owner', 'department_manager', 'supervisor'];
    return managerRoles.includes(roleResult.role || '');
  }

  /**
   * Invalidate workspace-related caches
   */
  invalidateWorkspace(workspaceId: string): void {
    this.workspaceCache.delete(workspaceId);
    this.tierCache.delete(workspaceId);
    this.tierCache.delete(`tierStatus:${workspaceId}`);
    this.providerCache.delete(workspaceId);
    this.employeeCountCache.delete(workspaceId);
    this.metrics.invalidations++;
    log.info(`[CacheManager] Invalidated workspace cache: ${workspaceId}`);
  }

  /**
   * Invalidate user role cache for a workspace
   */
  invalidateUserRole(userId: string, workspaceId: string): void {
    const cacheKey = `${userId}:${workspaceId}`;
    this.roleCache.delete(cacheKey);
    this.metrics.invalidations++;
  }

  // ── Phase 39 — Feature blob cache ──────────────────────────────────────────

  /**
   * Get workspace featureStatesBlob from cache (or DB on first hit).
   * Eliminates per-check DB round-trip in featureGateService.
   * TTL: 2 minutes (same as role cache — short enough for security changes to propagate).
   */
  async getWorkspaceFeatureBlob(workspaceId: string): Promise<Record<string, any>> {
    const cached = this.featureBlobCache.get(workspaceId);
    if (cached !== undefined) {
      this.metrics.hits++;
      return cached;
    }
    this.metrics.misses++;
    try {
      const [ws] = await db
        .select({ blob: workspaces.featureStatesBlob })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      const blob = (ws?.blob || {}) as Record<string, any>;
      this.featureBlobCache.set(workspaceId, blob);
      return blob;
    } catch {
      return {};
    }
  }

  /**
   * Invalidate the feature blob cache for a workspace.
   * Call after any unlockFeature / lockFeature operation.
   */
  invalidateFeatureBlob(workspaceId: string): void {
    this.featureBlobCache.delete(workspaceId);
    this.metrics.invalidations++;
  }

  /**
   * Invalidate all caches for a workspace (use after major changes)
   */
  invalidateAllForWorkspace(workspaceId: string): void {
    this.invalidateWorkspace(workspaceId);
    this.featureBlobCache.delete(workspaceId);
    
    // Clear role cache entries for this workspace
    for (const [key] of this.roleCache.entries()) {
      if (key.endsWith(`:${workspaceId}`)) {
        this.roleCache.delete(key);
      }
    }
    
    this.metrics.invalidations++;
    log.info(`[CacheManager] Full invalidation for workspace: ${workspaceId}`);
  }

  /**
   * Get cache metrics for monitoring
   */
  getMetrics(): CacheMetrics & { sizes: Record<string, number>; hitRate: string } {
    const total = this.metrics.hits + this.metrics.misses;
    const hitRate = total > 0 ? ((this.metrics.hits / total) * 100).toFixed(1) : '0.0';
    
    return {
      ...this.metrics,
      hitRate: `${hitRate}%`,
      sizes: {
        workspace: this.workspaceCache.size,
        role: this.roleCache.size,
        provider: this.providerCache.size,
        tier: this.tierCache.size,
        employeeCount: this.employeeCountCache.size,
        featureBlob: this.featureBlobCache.size,
      },
    };
  }

  /**
   * Clear all caches (use for testing or emergency)
   */
  clearAll(): void {
    this.workspaceCache.clear();
    this.roleCache.clear();
    this.providerCache.clear();
    this.tierCache.clear();
    this.employeeCountCache.clear();
    this.featureBlobCache.clear();
    log.info('[CacheManager] All caches cleared');
  }

  /**
   * Warm up cache for a workspace (call on workspace access)
   */
  async warmup(workspaceId: string): Promise<void> {
    await Promise.all([
      this.getWorkspaceConfig(workspaceId),
      this.getProviderPreferences(workspaceId),
      this.getEmployeeCount(workspaceId),
    ]);
  }
}

export const cacheManager = new PlatformCacheManager();

export type { WorkspaceConfig, RoleCheckResult, ProviderPrefs, CacheMetrics };
