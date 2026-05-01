import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  platformConfigRegistry,
  platformConfigSnapshots,
  platformConfigAudit,
  type InsertPlatformConfigRegistry,
  type PlatformConfigRegistry,
  type PlatformConfigSnapshot,
  type PlatformConfigAudit,
} from '@shared/schema';
import { createLogger } from '../lib/logger';
const log = createLogger('universalConfigRegistry');


export const CONFIG_DOMAINS = {
  THEME: 'theme',
  ROUTE: 'route',
  ASSET: 'asset',
  FEATURE: 'feature',
  SEASONAL: 'seasonal',
  LAYOUT: 'layout',
  BRANDING: 'branding',
  SYSTEM: 'system',
} as const;

export type ConfigDomain = typeof CONFIG_DOMAINS[keyof typeof CONFIG_DOMAINS];

export class UniversalConfigRegistry {
  private static instance: UniversalConfigRegistry;
  private cache: Map<string, { value: any; expiry: number }> = new Map();
  private cacheTTL = 60000;

  static getInstance(): UniversalConfigRegistry {
    if (!this.instance) {
      this.instance = new UniversalConfigRegistry();
    }
    return this.instance;
  }

  private cacheKey(domain: string, key: string, workspaceId?: string): string {
    return `${domain}:${key}:${workspaceId || 'global'}`;
  }

  private getCached(cacheKey: string): any | undefined {
    const entry = this.cache.get(cacheKey);
    if (entry && entry.expiry > Date.now()) {
      return entry.value;
    }
    this.cache.delete(cacheKey);
    return undefined;
  }

  private setCache(cacheKey: string, value: any): void {
    this.cache.set(cacheKey, { value, expiry: Date.now() + this.cacheTTL });
  }

  invalidateCache(domain?: string, key?: string): void {
    if (!domain) {
      this.cache.clear();
      return;
    }
    const prefix = key ? `${domain}:${key}:` : `${domain}:`;
    for (const k of this.cache.keys()) {
      if (k.startsWith(prefix)) {
        this.cache.delete(k);
      }
    }
  }

  async get(domain: string, key: string, workspaceId?: string): Promise<any | null> {
    const ck = this.cacheKey(domain, key, workspaceId);
    const cached = this.getCached(ck);
    if (cached !== undefined) return cached;

    try {
      const conditions = [
        eq(platformConfigRegistry.domain, domain),
        eq(platformConfigRegistry.key, key),
        eq(platformConfigRegistry.isActive, true),
      ];

      if (workspaceId) {
        const results = await db
          .select()
          .from(platformConfigRegistry)
          .where(and(...conditions))
          .orderBy(desc(platformConfigRegistry.priority));

        const wsEntry = results.find(r => r.workspaceId === workspaceId);
        const globalEntry = results.find(r => r.isGlobal);
        const entry = wsEntry || globalEntry;

        if (entry) {
          this.setCache(ck, entry.value);
          return entry.value;
        }
      } else {
        conditions.push(eq(platformConfigRegistry.isGlobal, true));
        const [entry] = await db
          .select()
          .from(platformConfigRegistry)
          .where(and(...conditions))
          .limit(1);

        if (entry) {
          this.setCache(ck, entry.value);
          return entry.value;
        }
      }

      return null;
    } catch (error) {
      log.error(`[ConfigRegistry] Error getting ${domain}:${key}:`, error);
      return null;
    }
  }

  async set(
    domain: string,
    key: string,
    value: any,
    options: {
      workspaceId?: string;
      description?: string;
      valueType?: string;
      priority?: number;
      metadata?: Record<string, unknown>;
      changedBy?: string;
      changeSource?: string;
      reason?: string;
    } = {}
  ): Promise<PlatformConfigRegistry | null> {
    try {
      const isGlobal = !options.workspaceId;
      const conditions = [
        eq(platformConfigRegistry.domain, domain),
        eq(platformConfigRegistry.key, key),
      ];

      if (options.workspaceId) {
        conditions.push(eq(platformConfigRegistry.workspaceId, options.workspaceId));
      } else {
        conditions.push(eq(platformConfigRegistry.isGlobal, true));
      }

      const [existing] = await db
        .select()
        .from(platformConfigRegistry)
        .where(and(...conditions))
        .limit(1);

      let result: PlatformConfigRegistry;

      if (existing) {
        const [updated] = await db
          .update(platformConfigRegistry)
          .set({
            value,
            valueType: options.valueType || existing.valueType,
            description: options.description || existing.description,
            priority: options.priority ?? existing.priority,
            metadata: options.metadata || existing.metadata,
            updatedAt: new Date(),
            updatedBy: options.changedBy,
          })
          .where(eq(platformConfigRegistry.id, existing.id))
          .returning();
        result = updated;

        await this.logAudit({
          domain,
          key,
          action: 'update',
          previousValue: existing.value,
          newValue: value,
          changedBy: options.changedBy,
          changeSource: options.changeSource || 'manual',
          workspaceId: options.workspaceId,
          reason: options.reason,
        });
      } else {
        const [created] = await db
          .insert(platformConfigRegistry)
          .values({
            domain,
            key,
            value,
            valueType: options.valueType || 'json',
            description: options.description,
            workspaceId: options.workspaceId,
            isGlobal,
            isActive: true,
            priority: options.priority ?? 0,
            metadata: options.metadata,
            updatedBy: options.changedBy,
          })
          .returning();
        result = created;

        await this.logAudit({
          domain,
          key,
          action: 'create',
          previousValue: null,
          newValue: value,
          changedBy: options.changedBy,
          changeSource: options.changeSource || 'manual',
          workspaceId: options.workspaceId,
          reason: options.reason,
        });
      }

      this.invalidateCache(domain, key);
      return result;
    } catch (error) {
      log.error(`[ConfigRegistry] Error setting ${domain}:${key}:`, error);
      return null;
    }
  }

  async delete(
    domain: string,
    key: string,
    options: { workspaceId?: string; changedBy?: string; reason?: string } = {}
  ): Promise<boolean> {
    try {
      const conditions = [
        eq(platformConfigRegistry.domain, domain),
        eq(platformConfigRegistry.key, key),
      ];

      if (options.workspaceId) {
        conditions.push(eq(platformConfigRegistry.workspaceId, options.workspaceId));
      } else {
        conditions.push(eq(platformConfigRegistry.isGlobal, true));
      }

      const [existing] = await db
        .select()
        .from(platformConfigRegistry)
        .where(and(...conditions))
        .limit(1);

      if (!existing) return false;

      await db
        .delete(platformConfigRegistry)
        .where(eq(platformConfigRegistry.id, existing.id));

      await this.logAudit({
        domain,
        key,
        action: 'delete',
        previousValue: existing.value,
        newValue: null,
        changedBy: options.changedBy,
        changeSource: 'manual',
        workspaceId: options.workspaceId,
        reason: options.reason,
      });

      this.invalidateCache(domain, key);
      return true;
    } catch (error) {
      log.error(`[ConfigRegistry] Error deleting ${domain}:${key}:`, error);
      return false;
    }
  }

  async listByDomain(domain: string, workspaceId?: string): Promise<PlatformConfigRegistry[]> {
    try {
      const conditions = [
        eq(platformConfigRegistry.domain, domain),
        eq(platformConfigRegistry.isActive, true),
      ];

      const results = await db
        .select()
        .from(platformConfigRegistry)
        .where(and(...conditions))
        .orderBy(platformConfigRegistry.key);

      if (!workspaceId) {
        return results.filter(r => r.isGlobal);
      }

      const merged = new Map<string, PlatformConfigRegistry>();
      for (const entry of results) {
        if (entry.isGlobal) {
          merged.set(entry.key, entry);
        }
      }
      for (const entry of results) {
        if (entry.workspaceId === workspaceId) {
          merged.set(entry.key, entry);
        }
      }
      return Array.from(merged.values());
    } catch (error) {
      log.error(`[ConfigRegistry] Error listing domain ${domain}:`, error);
      return [];
    }
  }

  async getAllConfig(workspaceId?: string): Promise<Record<string, Record<string, any>>> {
    try {
      const conditions = [eq(platformConfigRegistry.isActive, true)];
      const results = await db
        .select()
        .from(platformConfigRegistry)
        .where(and(...conditions))
        .orderBy(platformConfigRegistry.domain, platformConfigRegistry.key);

      const config: Record<string, Record<string, any>> = {};

      for (const entry of results) {
        if (!entry.isGlobal && entry.workspaceId !== workspaceId) continue;

        if (!config[entry.domain]) {
          config[entry.domain] = {};
        }

        if (entry.isGlobal && !config[entry.domain][entry.key]) {
          config[entry.domain][entry.key] = entry.value;
        }
        if (entry.workspaceId === workspaceId) {
          config[entry.domain][entry.key] = entry.value;
        }
      }

      return config;
    } catch (error) {
      log.error('[ConfigRegistry] Error getting all config:', error);
      return {};
    }
  }

  async createSnapshot(
    name: string,
    options: { workspaceId?: string; description?: string; createdBy?: string } = {}
  ): Promise<PlatformConfigSnapshot | null> {
    try {
      const config = await this.getAllConfig(options.workspaceId);

      const [maxVersion] = await db
        .select({ maxVer: sql<number>`COALESCE(MAX(version), 0)` })
        .from(platformConfigSnapshots)
        .where(options.workspaceId
          ? eq(platformConfigSnapshots.workspaceId, options.workspaceId)
          : sql`workspace_id IS NULL`
        );

      const [snapshot] = await db
        .insert(platformConfigSnapshots)
        .values({
          name,
          description: options.description,
          workspaceId: options.workspaceId,
          snapshotData: config,
          version: (maxVersion?.maxVer || 0) + 1,
          createdBy: options.createdBy,
        })
        .returning();

      return snapshot;
    } catch (error) {
      log.error('[ConfigRegistry] Error creating snapshot:', error);
      return null;
    }
  }

  async restoreSnapshot(
    snapshotId: string,
    options: { changedBy?: string; reason?: string } = {}
  ): Promise<boolean> {
    try {
      const [snapshot] = await db
        .select()
        .from(platformConfigSnapshots)
        .where(eq(platformConfigSnapshots.id, snapshotId))
        .limit(1);

      if (!snapshot) return false;

      const data = snapshot.snapshotData as Record<string, Record<string, any>>;

      for (const [domain, entries] of Object.entries(data)) {
        for (const [key, value] of Object.entries(entries)) {
          await this.set(domain, key, value, {
            workspaceId: snapshot.workspaceId || undefined,
            changedBy: options.changedBy,
            changeSource: 'snapshot_restore',
            reason: options.reason || `Restored from snapshot: ${snapshot.name} (v${snapshot.version})`,
          });
        }
      }

      this.invalidateCache();
      return true;
    } catch (error) {
      log.error('[ConfigRegistry] Error restoring snapshot:', error);
      return false;
    }
  }

  async getAuditTrail(
    options: { domain?: string; key?: string; workspaceId?: string; limit?: number } = {}
  ): Promise<PlatformConfigAudit[]> {
    try {
      const conditions = [];
      if (options.domain) conditions.push(eq(platformConfigAudit.domain, options.domain));
      if (options.key) conditions.push(eq(platformConfigAudit.key, options.key));
      if (options.workspaceId) conditions.push(eq(platformConfigAudit.workspaceId, options.workspaceId));

      const query = conditions.length > 0
        ? db.select().from(platformConfigAudit).where(and(...conditions))
        : db.select().from(platformConfigAudit);

      return await query
        .orderBy(desc(platformConfigAudit.createdAt))
        .limit(options.limit || 100);
    } catch (error) {
      log.error('[ConfigRegistry] Error getting audit trail:', error);
      return [];
    }
  }

  async seedFromDefaults(): Promise<{ seeded: number; skipped: number }> {
    let seeded = 0;
    let skipped = 0;

    try {
      const featureDefaults: Record<string, unknown> = {
        'ai.autoScheduling': true,
        'ai.sentimentAnalysis': true,
        'ai.predictiveAnalytics': true,
        'ai.smartMatching': true,
        'ai.aiCopilot': true,
        'core.scheduling': true,
        'core.timeTracking': true,
        'core.payroll': false,
        'core.billing': true,
        'core.invoicing': true,
        'core.employees': true,
        'communications.emailNotifications': true,
        'communications.smsNotifications': true,
        'communications.inAppNotifications': true,
        'communications.chatSupport': true,
        'analytics.basicReports': true,
        'analytics.advancedAnalytics': true,
        'analytics.customReports': true,
        'analytics.dashboards': true,
        'integrations.quickbooks': true,
        'integrations.stripe': true,
        'security.mfa': true,
        'security.auditLogs': true,
        'security.dataEncryption': true,
        'automation.autoTicketCreation': true,
      };

      for (const [key, value] of Object.entries(featureDefaults)) {
        const existing = await this.get(CONFIG_DOMAINS.FEATURE, key);
        if (existing !== null) {
          skipped++;
          continue;
        }
        await this.set(CONFIG_DOMAINS.FEATURE, key, value, {
          valueType: 'boolean',
          description: `Feature toggle: ${key}`,
          changedBy: 'system',
          changeSource: 'seed',
          reason: 'Initial seed from file-based defaults',
        });
        seeded++;
      }

      const seasonalDefaults: Record<string, unknown> = {
        'enabled': false,
        'currentTheme': 'default',
        'autoDetect': true,
      };

      for (const [key, value] of Object.entries(seasonalDefaults)) {
        const existing = await this.get(CONFIG_DOMAINS.SEASONAL, key);
        if (existing !== null) {
          skipped++;
          continue;
        }
        await this.set(CONFIG_DOMAINS.SEASONAL, key, value, {
          valueType: typeof value === 'boolean' ? 'boolean' : 'string',
          description: `Seasonal config: ${key}`,
          changedBy: 'system',
          changeSource: 'seed',
          reason: 'Initial seed from seasonalThemes.ts defaults',
        });
        seeded++;
      }

      const systemDefaults: Record<string, unknown> = {
        'platform.name': process.env.PLATFORM_NAME || 'CoAIleague',
        'platform.tagline': 'AI-Powered Workforce Intelligence',
        'platform.version': '1.0.0',
        'trinity.enabled': true,
        'trinity.autonomy_level': 'supervised',
        'maintenance.mode': false,
      };

      for (const [key, value] of Object.entries(systemDefaults)) {
        const existing = await this.get(CONFIG_DOMAINS.SYSTEM, key);
        if (existing !== null) {
          skipped++;
          continue;
        }
        await this.set(CONFIG_DOMAINS.SYSTEM, key, value, {
          valueType: typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string',
          description: `System config: ${key}`,
          changedBy: 'system',
          changeSource: 'seed',
          reason: 'Initial seed',
        });
        seeded++;
      }

      log.info(`[ConfigRegistry] Seed complete: ${seeded} seeded, ${skipped} skipped`);
      return { seeded, skipped };
    } catch (error) {
      log.error('[ConfigRegistry] Error seeding defaults:', error);
      return { seeded, skipped };
    }
  }

  async trinityExecute(action: string, params: Record<string, unknown>): Promise<{ success: boolean; message: string; data?: any }> {
    const source = 'trinity_ai';
    const changedBy = 'trinity';

    try {
      switch (action) {
        case 'get_config': {
          const value = await this.get(params.domain, params.key, params.workspaceId);
          return { success: true, message: `Config value for ${params.domain}:${params.key}`, data: value };
        }
        case 'set_config': {
          const result = await this.set(params.domain, params.key, params.value, {
            workspaceId: params.workspaceId,
            description: params.description,
            valueType: params.valueType,
            changedBy,
            changeSource: source,
            reason: params.reason || 'Trinity autonomous config change',
          });
          return { success: !!result, message: result ? `Set ${params.domain}:${params.key}` : 'Failed to set config', data: result };
        }
        case 'toggle_feature': {
          const current = await this.get(CONFIG_DOMAINS.FEATURE, params.feature, params.workspaceId);
          const newValue = params.enabled !== undefined ? params.enabled : !current;
          const result = await this.set(CONFIG_DOMAINS.FEATURE, params.feature, newValue, {
            workspaceId: params.workspaceId,
            valueType: 'boolean',
            changedBy,
            changeSource: source,
            reason: params.reason || `Trinity toggled feature ${params.feature} to ${newValue}`,
          });
          return { success: !!result, message: `Feature ${params.feature} is now ${newValue ? 'enabled' : 'disabled'}`, data: { feature: params.feature, enabled: newValue } };
        }
        case 'set_seasonal_theme': {
          await this.set(CONFIG_DOMAINS.SEASONAL, 'enabled', true, { changedBy, changeSource: source, reason: 'Trinity enabled seasonal themes' });
          await this.set(CONFIG_DOMAINS.SEASONAL, 'currentTheme', params.theme || 'default', { changedBy, changeSource: source, reason: params.reason || `Trinity set seasonal theme to ${params.theme}` });
          return { success: true, message: `Seasonal theme set to: ${params.theme}`, data: { theme: params.theme, enabled: true } };
        }
        case 'disable_seasonal': {
          await this.set(CONFIG_DOMAINS.SEASONAL, 'enabled', false, { changedBy, changeSource: source, reason: 'Trinity disabled seasonal themes' });
          return { success: true, message: 'Seasonal themes disabled' };
        }
        case 'create_snapshot': {
          const snapshot = await this.createSnapshot(params.name || `trinity-snapshot-${Date.now()}`, {
            workspaceId: params.workspaceId,
            description: params.description || 'Trinity-created config snapshot',
            createdBy: changedBy,
          });
          return { success: !!snapshot, message: snapshot ? `Snapshot created: ${snapshot.name} (v${snapshot.version})` : 'Failed to create snapshot', data: snapshot };
        }
        case 'restore_snapshot': {
          const restored = await this.restoreSnapshot(params.snapshotId, {
            changedBy,
            reason: params.reason || 'Trinity restored config from snapshot',
          });
          return { success: restored, message: restored ? 'Config restored from snapshot' : 'Failed to restore snapshot' };
        }
        case 'list_domain': {
          const entries = await this.listByDomain(params.domain, params.workspaceId);
          return { success: true, message: `Found ${entries.length} entries in domain ${params.domain}`, data: entries };
        }
        case 'get_all': {
          const config = await this.getAllConfig(params.workspaceId);
          return { success: true, message: 'Full config retrieved', data: config };
        }
        case 'set_maintenance_mode': {
          await this.set(CONFIG_DOMAINS.SYSTEM, 'maintenance.mode', Boolean(params.enabled), {
            changedBy,
            changeSource: source,
            reason: params.reason || `Trinity ${params.enabled ? 'enabled' : 'disabled'} maintenance mode`,
          });
          return { success: true, message: `Maintenance mode ${params.enabled ? 'enabled' : 'disabled'}` };
        }
        default:
          return { success: false, message: `Unknown action: ${action}. Available: get_config, set_config, toggle_feature, set_seasonal_theme, disable_seasonal, create_snapshot, restore_snapshot, list_domain, get_all, set_maintenance_mode` };
      }
    } catch (error: any) {
      log.error(`[ConfigRegistry] Trinity execute error (${action}):`, error);
      return { success: false, message: `Error: ${(error instanceof Error ? error.message : String(error))}` };
    }
  }

  private async logAudit(entry: {
    domain: string;
    key: string;
    action: string;
    previousValue: any;
    newValue: any;
    changedBy?: string;
    changeSource?: string;
    workspaceId?: string;
    reason?: string;
  }): Promise<void> {
    try {
      await db.insert(platformConfigAudit).values({
        domain: entry.domain,
        key: entry.key,
        action: entry.action,
        previousValue: entry.previousValue,
        newValue: entry.newValue,
        changedBy: entry.changedBy,
        changeSource: entry.changeSource || 'manual',
        workspaceId: entry.workspaceId,
        reason: entry.reason,
      });
    } catch (error) {
      log.error('[ConfigRegistry] Error logging audit:', error);
    }
  }
}

export const universalConfigRegistry = UniversalConfigRegistry.getInstance();
