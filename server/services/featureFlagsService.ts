/**
 * Trinity Feature Flags Service
 * Provides autonomous runtime configuration control for Trinity AI
 * 
 * This service allows Trinity to make live changes to platform behavior
 * without requiring code deployment, while maintaining audit trails
 * and safety guardrails.
 */

import { db, withRetry } from '../db';
import { trinityRuntimeFlags, trinityRuntimeFlagChanges, type TrinityRuntimeFlag, type InsertTrinityRuntimeFlag, type InsertTrinityRuntimeFlagChange } from '@shared/schema';
import { eq, and, inArray, desc, sql } from 'drizzle-orm';
import { TIMEOUTS } from '../config/platformConfig';
import { createLogger } from '../lib/logger';
const log = createLogger('featureFlagsService');


// In-memory cache for fast flag lookups - longer TTL for resilience
const flagCache = new Map<string, { value: any; expiresAt: number; flag: TrinityRuntimeFlag }>();
const CACHE_TTL_MS = TIMEOUTS.featureFlagCacheTtlMs;
const STALE_CACHE_TTL_MS = TIMEOUTS.featureFlagStaleTtlMs;

// Track cache state
let cacheWarmed = false;
let lastCacheWarmTime = 0;

export type SafetyLevel = 'low_risk' | 'medium_risk' | 'high_risk';
export type ActorType = 'trinity' | 'admin' | 'system' | 'diagnostics';
export type FlagType = 'toggle' | 'threshold' | 'config' | 'percentage';
export type ValueType = 'boolean' | 'string' | 'number' | 'json';

interface FlagUpdateResult {
  success: boolean;
  flag?: TrinityRuntimeFlag;
  error?: string;
  requiresApproval?: boolean;
}

interface FlagValue {
  key: string;
  value: any;
  valueType: ValueType;
  isEnabled: boolean;
}

/**
 * Feature Flags Service - Core operations for Trinity autonomous control
 */
export const trinityRuntimeFlagsService = {
  /**
   * Get all feature flags, optionally filtered
   */
  async listFlags(filters?: {
    category?: string;
    safetyLevel?: SafetyLevel;
    workspaceId?: string | null;
    includeDisabled?: boolean;
  }): Promise<TrinityRuntimeFlag[]> {
    let query = db.select().from(trinityRuntimeFlags);
    
    const conditions: any[] = [];
    
    if (filters?.category) {
      conditions.push(eq(trinityRuntimeFlags.category, filters.category));
    }
    
    if (filters?.safetyLevel) {
      conditions.push(eq(trinityRuntimeFlags.safetyLevel, filters.safetyLevel));
    }
    
    if (filters?.workspaceId !== undefined) {
      if (filters.workspaceId === null) {
        conditions.push(sql`${trinityRuntimeFlags.workspaceId} IS NULL`);
      } else {
        conditions.push(eq(trinityRuntimeFlags.workspaceId, filters.workspaceId));
      }
    }
    
    if (!filters?.includeDisabled) {
      conditions.push(eq(trinityRuntimeFlags.isEnabled, true));
    }
    
    if (conditions.length > 0) {
      return db.select().from(trinityRuntimeFlags).where(and(...conditions));
    }
    
    return db.select().from(trinityRuntimeFlags);
  },

  /**
   * Get a single flag by key
   * Returns cached value if DB is unavailable (graceful degradation)
   */
  async getFlagByKey(key: string, workspaceId?: string): Promise<TrinityRuntimeFlag | null> {
    const cacheKey = workspaceId ? `${key}:${workspaceId}` : key;
    const cached = flagCache.get(cacheKey);
    
    // Return valid cache
    if (cached && cached.expiresAt > Date.now()) {
      return cached.flag;
    }
    
    try {
      const conditions = [eq(trinityRuntimeFlags.key, key)];
      if (workspaceId) {
        conditions.push(eq(trinityRuntimeFlags.workspaceId, workspaceId));
      }
      
      // Use retry logic for cold-start resilience
      const [flag] = await withRetry(
        () => db.select()
          .from(trinityRuntimeFlags)
          .where(and(...conditions))
          .limit(1),
        { maxRetries: 2, operationName: `getFlagByKey(${key})` }
      );
      
      if (flag) {
        flagCache.set(cacheKey, {
          value: JSON.parse(flag.currentValue),
          expiresAt: Date.now() + CACHE_TTL_MS,
          flag
        });
      }
      
      return flag || null;
    } catch (error) {
      // If DB is unavailable, return stale cache if available
      if (cached) {
        log.warn(`[FeatureFlags] DB unavailable, using stale cache for ${key}`);
        return cached.flag;
      }
      // No cache available, log and return null (will use default value)
      log.warn(`[FeatureFlags] DB unavailable, no cache for ${key}, using default`);
      return null;
    }
  },

  /**
   * Get typed flag value with fallback
   */
  async getFlagValue<T>(key: string, defaultValue: T, workspaceId?: string): Promise<T> {
    const flag = await this.getFlagByKey(key, workspaceId);
    
    if (!flag || !flag.isEnabled) {
      return defaultValue;
    }
    
    try {
      return JSON.parse(flag.currentValue) as T;
    } catch {
      return defaultValue;
    }
  },

  /**
   * Convenience methods for typed flag retrieval
   */
  async getFlagBoolean(key: string, defaultValue = false, workspaceId?: string): Promise<boolean> {
    return this.getFlagValue<boolean>(key, defaultValue, workspaceId);
  },

  async getFlagNumber(key: string, defaultValue = 0, workspaceId?: string): Promise<number> {
    return this.getFlagValue<number>(key, defaultValue, workspaceId);
  },

  async getFlagString(key: string, defaultValue = '', workspaceId?: string): Promise<string> {
    return this.getFlagValue<string>(key, defaultValue, workspaceId);
  },

  /**
   * Get multiple flag values in bulk (efficient for frontend runtime)
   */
  async getRuntimeFlags(keys: string[], workspaceId?: string): Promise<FlagValue[]> {
    const conditions = [inArray(trinityRuntimeFlags.key, keys)];
    
    if (workspaceId) {
      conditions.push(eq(trinityRuntimeFlags.workspaceId, workspaceId));
    }
    
    const flags = await db.select()
      .from(trinityRuntimeFlags)
      .where(and(...conditions));
    
    return flags.map(flag => ({
      key: flag.key,
      value: JSON.parse(flag.currentValue),
      valueType: flag.valueType as ValueType,
      isEnabled: flag.isEnabled
    }));
  },

  /**
   * Update a flag value - core method with safety checks
   */
  async updateFlagValue(
    key: string,
    newValue: any,
    actor: { type: ActorType; id?: string },
    reason: string,
    source: string = 'manual',
    sourceDetails?: any
  ): Promise<FlagUpdateResult> {
    const flag = await this.getFlagByKey(key);
    
    if (!flag) {
      return { success: false, error: `Flag not found: ${key}` };
    }
    
    // Check if actor is allowed
    const allowedActors = flag.allowedActors || ['trinity', 'admin'];
    if (!allowedActors.includes(actor.type)) {
      return { 
        success: false, 
        error: `Actor type '${actor.type}' not allowed to modify flag '${key}'` 
      };
    }
    
    // Check if Trinity needs approval for this flag
    if (actor.type === 'trinity' && flag.requiresApproval) {
      log.info(`[TrinityRuntimeFlags] Trinity modification of '${key}' requires approval`);
      return { 
        success: false, 
        requiresApproval: true,
        error: 'This flag requires human approval before modification'
      };
    }
    
    // Safety level check for Trinity
    if (actor.type === 'trinity' && flag.safetyLevel === 'high_risk') {
      log.info(`[TrinityRuntimeFlags] Trinity blocked from modifying high-risk flag '${key}'`);
      return {
        success: false,
        error: 'I can\'t modify high-risk flags autonomously — a human needs to approve this change'
      };
    }
    
    const previousValue = flag.currentValue;
    const newValueJson = JSON.stringify(newValue);
    
    try {
      // Update the flag
      const [updated] = await db.update(trinityRuntimeFlags)
        .set({
          currentValue: newValueJson,
          lastModifiedBy: actor.type === 'admin' ? `admin:${actor.id}` : actor.type,
          lastModifiedReason: reason,
          updatedAt: new Date()
        })
        .where(eq(trinityRuntimeFlags.id, flag.id))
        .returning();
      
      // Log the change
      await db.insert(trinityRuntimeFlagChanges).values({
        flagId: flag.id,
        flagKey: key,
        previousValue,
        newValue: newValueJson,
        changeReason: reason,
        actorType: actor.type,
        actorId: actor.id || null,
        source,
        sourceDetails: sourceDetails ? JSON.stringify(sourceDetails) : null,
        wasSuccessful: true
      });
      
      // Invalidate cache
      flagCache.delete(key);
      if (flag.workspaceId) {
        flagCache.delete(`${key}:${flag.workspaceId}`);
      }
      
      log.info(`[TrinityRuntimeFlags] ${actor.type} updated '${key}': ${previousValue} → ${newValueJson}`);
      
      return { success: true, flag: updated };
    } catch (error: any) {
      // Log failed attempt
      await db.insert(trinityRuntimeFlagChanges).values({
        flagId: flag.id,
        flagKey: key,
        previousValue,
        newValue: newValueJson,
        changeReason: reason,
        actorType: actor.type,
        actorId: actor.id || null,
        source,
        wasSuccessful: false,
        errorMessage: (error instanceof Error ? error.message : String(error))
      });
      
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  },

  /**
   * Toggle a boolean flag
   */
  async toggleFlag(
    key: string,
    actor: { type: ActorType; id?: string },
    reason: string,
    source: string = 'manual'
  ): Promise<FlagUpdateResult> {
    const flag = await this.getFlagByKey(key);
    
    if (!flag) {
      return { success: false, error: `Flag not found: ${key}` };
    }
    
    if (flag.valueType !== 'boolean') {
      return { success: false, error: `Flag '${key}' is not a boolean toggle` };
    }
    
    const currentValue = JSON.parse(flag.currentValue);
    return this.updateFlagValue(key, !currentValue, actor, reason, source);
  },

  /**
   * Create a new feature flag
   */
  async createFlag(data: {
    key: string;
    label: string;
    description?: string;
    category?: string;
    flagType?: FlagType;
    valueType?: ValueType;
    defaultValue: any;
    safetyLevel?: SafetyLevel;
    allowedActors?: string[];
    requiresApproval?: boolean;
    workspaceId?: string;
  }): Promise<TrinityRuntimeFlag> {
    const valueJson = JSON.stringify(data.defaultValue);
    
    const [flag] = await db.insert(trinityRuntimeFlags).values({
      key: data.key,
      label: data.label,
      description: data.description,
      category: data.category || 'general',
      flagType: data.flagType || 'toggle',
      valueType: data.valueType || 'boolean',
      currentValue: valueJson,
      defaultValue: valueJson,
      safetyLevel: data.safetyLevel || 'low_risk',
      allowedActors: data.allowedActors || ['trinity', 'admin'],
      requiresApproval: data.requiresApproval || false,
      workspaceId: data.workspaceId,
      isEnabled: true,
      lastModifiedBy: 'system'
    }).returning();
    
    log.info(`[TrinityRuntimeFlags] Created new flag '${data.key}'`);
    return flag;
  },

  /**
   * Get change history for a flag
   */
  async getFlagHistory(key: string, limit = 50): Promise<any[]> {
    return db.select()
      .from(trinityRuntimeFlagChanges)
      .where(eq(trinityRuntimeFlagChanges.flagKey, key))
      .orderBy(desc(trinityRuntimeFlagChanges.createdAt))
      .limit(limit);
  },

  /**
   * Rollback a flag to its previous value
   */
  async rollbackFlag(
    key: string,
    actor: { type: ActorType; id?: string }
  ): Promise<FlagUpdateResult> {
    const history = await this.getFlagHistory(key, 2);
    
    if (history.length < 2) {
      return { success: false, error: 'No previous value to rollback to' };
    }
    
    const previousChange = history[1]; // Second most recent change
    const previousValue = JSON.parse(previousChange.previousValue);
    
    return this.updateFlagValue(
      key,
      previousValue,
      actor,
      'Rollback to previous value',
      'rollback'
    );
  },

  /**
   * Initialize default feature flags if they don't exist
   */
  async initializeDefaultFlags(): Promise<void> {
    const defaultFlags = [
      {
        key: 'trinity.autonomous_scheduling',
        label: 'Trinity Autonomous Scheduling',
        description: 'Allow Trinity to create and modify schedules automatically',
        category: 'ai',
        valueType: 'boolean' as ValueType,
        defaultValue: true,
        safetyLevel: 'medium_risk' as SafetyLevel
      },
      {
        key: 'trinity.diagnostics_auto_fix',
        label: 'Trinity Auto-Fix from Diagnostics',
        description: 'Allow Trinity to automatically toggle flags based on diagnostic findings',
        category: 'ai',
        valueType: 'boolean' as ValueType,
        defaultValue: true,
        safetyLevel: 'low_risk' as SafetyLevel
      },
      {
        key: 'ui.maintenance_mode',
        label: 'Maintenance Mode',
        description: 'Show maintenance banner and restrict certain features',
        category: 'ui',
        valueType: 'boolean' as ValueType,
        defaultValue: false,
        safetyLevel: 'low_risk' as SafetyLevel
      },
      {
        key: 'performance.rate_limit_multiplier',
        label: 'Rate Limit Multiplier',
        description: 'Multiply default rate limits (1.0 = normal, 0.5 = stricter)',
        category: 'performance',
        valueType: 'number' as ValueType,
        defaultValue: 1.0,
        safetyLevel: 'medium_risk' as SafetyLevel
      },
      {
        key: 'security.captcha_required',
        label: 'CAPTCHA Required',
        description: 'Require CAPTCHA on sensitive forms',
        category: 'security',
        valueType: 'boolean' as ValueType,
        defaultValue: true,
        safetyLevel: 'high_risk' as SafetyLevel,
        requiresApproval: true
      },
      {
        key: 'integration.quickbooks_sync',
        label: 'QuickBooks Auto-Sync',
        description: 'Enable automatic QuickBooks synchronization',
        category: 'integration',
        valueType: 'boolean' as ValueType,
        defaultValue: true,
        safetyLevel: 'medium_risk' as SafetyLevel
      },
      {
        key: 'ai.thought_rotation_interval',
        label: 'Trinity Thought Rotation Interval',
        description: 'Seconds between Trinity thought rotations',
        category: 'ai',
        valueType: 'number' as ValueType,
        defaultValue: 8,
        safetyLevel: 'low_risk' as SafetyLevel
      },
      {
        key: 'notifications.websocket_enabled',
        label: 'WebSocket Notifications',
        description: 'Enable real-time WebSocket notifications',
        category: 'performance',
        valueType: 'boolean' as ValueType,
        defaultValue: true,
        safetyLevel: 'low_risk' as SafetyLevel
      }
    ];

    for (const flagData of defaultFlags) {
      const existing = await this.getFlagByKey(flagData.key);
      if (!existing) {
        await this.createFlag(flagData);
      }
    }
    
    log.info('[TrinityRuntimeFlags] Default flags initialized');
  },

  /**
   * Clear the in-memory cache (useful for testing)
   */
  clearCache(): void {
    flagCache.clear();
    cacheWarmed = false;
  },

  /**
   * Warm the cache by preloading commonly used flags
   * Call this at startup to reduce cold-start latency
   */
  async warmCache(): Promise<void> {
    // Skip if recently warmed
    if (cacheWarmed && Date.now() - lastCacheWarmTime < CACHE_TTL_MS) {
      return;
    }

    try {
      log.info('[FeatureFlags] Warming cache...');
      
      // Load all enabled flags into cache
      const flags = await db.select()
        .from(trinityRuntimeFlags)
        .where(eq(trinityRuntimeFlags.isEnabled, true));
      
      for (const flag of flags) {
        const cacheKey = flag.workspaceId ? `${flag.key}:${flag.workspaceId}` : flag.key;
        flagCache.set(cacheKey, {
          value: JSON.parse(flag.currentValue),
          expiresAt: Date.now() + CACHE_TTL_MS,
          flag
        });
      }

      cacheWarmed = true;
      lastCacheWarmTime = Date.now();
      log.info(`[FeatureFlags] Cache warmed with ${flags.length} flags`);
    } catch (error) {
      log.warn('[FeatureFlags] Cache warming failed, will use on-demand loading:', error);
    }
  },

  /**
   * Check if cache is warmed and healthy
   */
  isCacheHealthy(): boolean {
    return cacheWarmed && Date.now() - lastCacheWarmTime < STALE_CACHE_TTL_MS;
  }
};

export default trinityRuntimeFlagsService;
