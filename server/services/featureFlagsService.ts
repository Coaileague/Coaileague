/**
 * Trinity Feature Flags Service
 * Provides autonomous runtime configuration control for Trinity AI
 * 
 * This service allows Trinity to make live changes to platform behavior
 * without requiring code deployment, while maintaining audit trails
 * and safety guardrails.
 */

import { db } from '../db';
import { featureFlags, featureFlagChanges, type FeatureFlag, type InsertFeatureFlag, type InsertFeatureFlagChange } from '@shared/schema';
import { eq, and, inArray, desc, sql } from 'drizzle-orm';

// In-memory cache for fast flag lookups
const flagCache = new Map<string, { value: any; expiresAt: number; flag: FeatureFlag }>();
const CACHE_TTL_MS = 30000; // 30 second cache

export type SafetyLevel = 'low_risk' | 'medium_risk' | 'high_risk';
export type ActorType = 'trinity' | 'admin' | 'system' | 'diagnostics';
export type FlagType = 'toggle' | 'threshold' | 'config' | 'percentage';
export type ValueType = 'boolean' | 'string' | 'number' | 'json';

interface FlagUpdateResult {
  success: boolean;
  flag?: FeatureFlag;
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
export const featureFlagsService = {
  /**
   * Get all feature flags, optionally filtered
   */
  async listFlags(filters?: {
    category?: string;
    safetyLevel?: SafetyLevel;
    workspaceId?: string | null;
    includeDisabled?: boolean;
  }): Promise<FeatureFlag[]> {
    let query = db.select().from(featureFlags);
    
    const conditions: any[] = [];
    
    if (filters?.category) {
      conditions.push(eq(featureFlags.category, filters.category));
    }
    
    if (filters?.safetyLevel) {
      conditions.push(eq(featureFlags.safetyLevel, filters.safetyLevel));
    }
    
    if (filters?.workspaceId !== undefined) {
      if (filters.workspaceId === null) {
        conditions.push(sql`${featureFlags.workspaceId} IS NULL`);
      } else {
        conditions.push(eq(featureFlags.workspaceId, filters.workspaceId));
      }
    }
    
    if (!filters?.includeDisabled) {
      conditions.push(eq(featureFlags.isEnabled, true));
    }
    
    if (conditions.length > 0) {
      return db.select().from(featureFlags).where(and(...conditions));
    }
    
    return db.select().from(featureFlags);
  },

  /**
   * Get a single flag by key
   */
  async getFlagByKey(key: string, workspaceId?: string): Promise<FeatureFlag | null> {
    const cacheKey = workspaceId ? `${key}:${workspaceId}` : key;
    const cached = flagCache.get(cacheKey);
    
    if (cached && cached.expiresAt > Date.now()) {
      return cached.flag;
    }
    
    const conditions = [eq(featureFlags.key, key)];
    if (workspaceId) {
      conditions.push(eq(featureFlags.workspaceId, workspaceId));
    }
    
    const [flag] = await db.select()
      .from(featureFlags)
      .where(and(...conditions))
      .limit(1);
    
    if (flag) {
      flagCache.set(cacheKey, {
        value: JSON.parse(flag.currentValue),
        expiresAt: Date.now() + CACHE_TTL_MS,
        flag
      });
    }
    
    return flag || null;
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
    const conditions = [inArray(featureFlags.key, keys)];
    
    if (workspaceId) {
      conditions.push(eq(featureFlags.workspaceId, workspaceId));
    }
    
    const flags = await db.select()
      .from(featureFlags)
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
      console.log(`[FeatureFlags] Trinity modification of '${key}' requires approval`);
      return { 
        success: false, 
        requiresApproval: true,
        error: 'This flag requires human approval before modification'
      };
    }
    
    // Safety level check for Trinity
    if (actor.type === 'trinity' && flag.safetyLevel === 'high_risk') {
      console.log(`[FeatureFlags] Trinity blocked from modifying high-risk flag '${key}'`);
      return {
        success: false,
        error: 'Trinity cannot modify high-risk flags autonomously'
      };
    }
    
    const previousValue = flag.currentValue;
    const newValueJson = JSON.stringify(newValue);
    
    try {
      // Update the flag
      const [updated] = await db.update(featureFlags)
        .set({
          currentValue: newValueJson,
          lastModifiedBy: actor.type === 'admin' ? `admin:${actor.id}` : actor.type,
          lastModifiedReason: reason,
          updatedAt: new Date()
        })
        .where(eq(featureFlags.id, flag.id))
        .returning();
      
      // Log the change
      await db.insert(featureFlagChanges).values({
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
      
      console.log(`[FeatureFlags] ${actor.type} updated '${key}': ${previousValue} → ${newValueJson}`);
      
      return { success: true, flag: updated };
    } catch (error: any) {
      // Log failed attempt
      await db.insert(featureFlagChanges).values({
        flagId: flag.id,
        flagKey: key,
        previousValue,
        newValue: newValueJson,
        changeReason: reason,
        actorType: actor.type,
        actorId: actor.id || null,
        source,
        wasSuccessful: false,
        errorMessage: error.message
      });
      
      return { success: false, error: error.message };
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
  }): Promise<FeatureFlag> {
    const valueJson = JSON.stringify(data.defaultValue);
    
    const [flag] = await db.insert(featureFlags).values({
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
    
    console.log(`[FeatureFlags] Created new flag '${data.key}'`);
    return flag;
  },

  /**
   * Get change history for a flag
   */
  async getFlagHistory(key: string, limit = 50): Promise<any[]> {
    return db.select()
      .from(featureFlagChanges)
      .where(eq(featureFlagChanges.flagKey, key))
      .orderBy(desc(featureFlagChanges.createdAt))
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
    
    console.log('[FeatureFlags] Default flags initialized');
  },

  /**
   * Clear the in-memory cache (useful for testing)
   */
  clearCache(): void {
    flagCache.clear();
  }
};

export default featureFlagsService;
