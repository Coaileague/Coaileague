/**
 * ConfigRegistry Service
 * Manages dynamic configuration updates at runtime
 * Supports feature toggles with validation and persistence
 */

import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import { featureToggles } from '@shared/config/featureToggles';
import { emitFeatureToggleChange } from '../../shared/config/featureToggleAccess';
import { createLogger } from '../lib/logger';
const log = createLogger('configRegistry');


// ============================================================================
// ZOD SCHEMAS FOR VALIDATION
// ============================================================================

// Schema for feature toggle values (nested boolean structure)
const FeatureToggleValueSchema = z.record(z.boolean());

const FeatureToggleSchema = z.object({
  ai: FeatureToggleValueSchema.optional(),
  workspace: FeatureToggleValueSchema.optional(),
  core: FeatureToggleValueSchema.optional(),
  communications: FeatureToggleValueSchema.optional(),
  analytics: FeatureToggleValueSchema.optional(),
  integrations: FeatureToggleValueSchema.optional(),
  security: FeatureToggleValueSchema.optional(),
  development: FeatureToggleValueSchema.optional(),
  automation: FeatureToggleValueSchema.optional(),
  phase4: FeatureToggleValueSchema.optional(),
});

// Schema for a single config change
const ConfigChangeSchema = z.object({
  scope: z.literal('featureToggles'),
  key: z.string(),
  value: z.boolean(),
});

export type ConfigChange = z.infer<typeof ConfigChangeSchema>;

// ============================================================================
// CONFIG REGISTRY CLASS
// ============================================================================

class ConfigRegistry {
  private cache: typeof featureToggles;
  private configFilePath: string;

  constructor() {
    // Initialize in-memory cache with current config
    this.cache = { ...featureToggles };
    
    // Path to featureToggles.ts file
    this.configFilePath = path.join(process.cwd(), 'shared/config/featureToggles.ts');
  }

  /**
   * Load current config from file (refresh cache)
   */
  async loadConfig(): Promise<typeof featureToggles> {
    try {
      // Re-import to get latest values
      delete require.cache[require.resolve('@shared/config/featureToggles')];
      const { featureToggles: freshConfig } = await import('@shared/config/featureToggles');
      this.cache = { ...freshConfig };
      return this.cache;
    } catch (error) {
      log.error('[ConfigRegistry] Failed to load config:', error);
      throw new Error('Failed to load configuration');
    }
  }

  /**
   * Get current config (from cache)
   */
  getConfig(scope: string): any {
    if (scope !== 'featureToggles') {
      throw new Error(`Unsupported config scope: ${scope}`);
    }
    return this.cache;
  }

  /**
   * Validate a single config change
   */
  validateChange(scope: string, key: string, value: any): void {
    // Validate scope
    if (scope !== 'featureToggles') {
      throw new Error(`Invalid scope: ${scope}. Only 'featureToggles' is supported.`);
    }

    // Validate change structure
    const changeResult = ConfigChangeSchema.safeParse({ scope, key, value });
    if (!changeResult.success) {
      throw new Error(`Invalid change format: ${changeResult.error.message}`);
    }

    // Validate key exists in config structure
    const [category, toggle] = key.split('.');
    
    if (!category || !toggle) {
      throw new Error(`Invalid key format: ${key}. Expected format: 'category.toggle'`);
    }

    const configCategory = (this as any).cache[category];
    if (!configCategory) {
      throw new Error(`Invalid category: ${category}. Must be one of: ${Object.keys(this.cache).join(', ')}`);
    }

    if (!(toggle in configCategory)) {
      throw new Error(`Invalid toggle: ${toggle}. Not found in category '${category}'`);
    }

    // Validate value type (must be boolean)
    if (typeof value !== 'boolean') {
      throw new Error(`Invalid value type: ${typeof value}. Feature toggles must be boolean.`);
    }
  }

  /**
   * Apply a single config change (in-memory)
   */
  applyChange(scope: string, key: string, value: any): void {
    this.validateChange(scope, key, value);

    const [category, toggle] = key.split('.');
    (this as any).cache[category][toggle] = value;
  }

  /**
   * Apply multiple config changes atomically
   */
  async applyChanges(changes: ConfigChange[]): Promise<void> {
    // Validate all changes first (fail fast)
    for (const change of changes) {
      this.validateChange(change.scope, change.key, change.value);
    }

    // Apply all changes to cache
    for (const change of changes) {
      this.applyChange(change.scope, change.key, change.value);
    }

    // Persist changes to file
    await this.persistConfig('featureToggles', this.cache);

    // Clear require.cache and reload config from disk
    // This ensures all consumers get fresh references
    this.clearCache();
    await this.loadConfig();
    
    // Emit change event to notify subscribers
    emitFeatureToggleChange();
    
    log.info(`[ConfigRegistry] Successfully applied ${changes.length} changes`);
  }

  /**
   * Persist config to TypeScript file
   */
  async persistConfig(scope: string, config: any): Promise<void> {
    if (scope !== 'featureToggles') {
      throw new Error(`Unsupported config scope: ${scope}`);
    }

    try {
      // Generate TypeScript file content
      const fileContent = this.generateConfigFileContent(config);

      // Write to file
      await fs.writeFile(this.configFilePath, fileContent, 'utf-8');

      log.info(`[ConfigRegistry] Successfully persisted config to ${this.configFilePath}`);
    } catch (error) {
      log.error('[ConfigRegistry] Failed to persist config:', error);
      throw new Error('Failed to persist configuration changes');
    }
  }

  /**
   * Generate TypeScript file content from config object
   */
  private generateConfigFileContent(config: typeof featureToggles): string {
    // Serialize config object to TypeScript
    const configString = JSON.stringify(config, null, 2)
      .replace(/"([^"]+)":/g, '$1:'); // Remove quotes from keys

    return `/**
 * Feature Toggles Configuration
 * Shared configuration for both client and server
 * Control what features are enabled/disabled without code changes
 */

export const featureToggles = ${configString};
`;
  }

  /**
   * Clear in-memory cache (force reload from file)
   */
  clearCache(): void {
    delete require.cache[require.resolve('@shared/config/featureToggles')];
  }

  /**
   * Get all available config keys for a scope
   */
  getAvailableKeys(scope: string): string[] {
    if (scope !== 'featureToggles') {
      return [];
    }

    const keys: string[] = [];
    for (const [category, toggles] of Object.entries(this.cache)) {
      for (const toggle of Object.keys(toggles as object)) {
        keys.push(`${category}.${toggle}`);
      }
    }
    return keys;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const configRegistry = new ConfigRegistry();
