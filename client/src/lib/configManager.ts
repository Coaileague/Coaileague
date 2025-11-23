/**
 * Config Manager - Central service for accessing ALL configurations
 * Type-safe, centralized, single source of truth for config access
 * 
 * Usage:
 * import { configManager } from "@/lib/configManager"
 * const endpoint = configManager.getEndpoint('employees.list')
 * const isEnabled = configManager.isFeatureEnabled('ai.autoScheduling')
 * const config = configManager.getAIConfig('scheduling')
 */

import { API_ENDPOINTS, getEndpoint, buildApiUrl } from "@/config/apiEndpoints";
import { FEATURE_TOGGLES, isFeatureEnabled, allFeaturesEnabled, anyFeatureEnabled } from "@/config/featureToggles";
import { AI_CONFIG, getAIConfig, getAIPrompt, isAIFeatureEnabled } from "@/config/aiConfig";
import { MESSAGES, getMessage, getMessages } from "@/config/messages";
import { DEFAULTS, getDefault, getDefaults } from "@/config/defaults";
import { APP_CONFIG, getAppConfig } from "@/config/appConfig";
import { LOGOUT_CONFIG } from "@/config/logout";

/**
 * Central config manager with all helper functions
 * Provides type-safe, centralized access to all configurations
 */
export const configManager = {
  // App Configuration
  app: () => APP_CONFIG,
  
  // API Endpoints
  getEndpoint,
  buildApiUrl,
  getEndpointGroup: (category: string) => (API_ENDPOINTS as any)[category],
  
  // Feature Toggles
  isFeatureEnabled,
  allFeaturesEnabled,
  anyFeatureEnabled,
  getEnabledFeatures: (category: string) => {
    const group = (FEATURE_TOGGLES as any)[category];
    if (!group) return [];
    return Object.entries(group)
      .filter(([_, value]) => value === true)
      .map(([key]) => key);
  },
  
  // AI Configuration
  getAIConfig,
  getAIPrompt,
  isAIFeatureEnabled,
  getAIModel: (feature: string) => {
    const config = getAIConfig(feature);
    return config.model || AI_CONFIG.global.defaultModel;
  },
  getAITemperature: (feature: string) => {
    const config = getAIConfig(feature);
    return config.temperature || AI_CONFIG.global.defaultTemperature;
  },
  
  // Messages
  getMessage,
  getMessages,
  
  // Defaults
  getDefault,
  getDefaults,
  
  // Logout
  getLogoutConfig: () => LOGOUT_CONFIG,
  
  // Pricing & Tiers (available via hooks)
  // Note: Import pricing.ts separately to avoid circular dependencies
};

/**
 * Type-safe config accessor with autocomplete
 * Prevents accessing non-existent config paths
 */
export function useConfigValue<T = any>(path: string): T {
  const parts = path.split(".");
  let current: any = {
    app: APP_CONFIG,
    api: API_ENDPOINTS,
    features: FEATURE_TOGGLES,
    ai: AI_CONFIG,
    messages: MESSAGES,
  };

  for (const part of parts) {
    current = current[part];
    if (current === undefined) {
      console.warn(`Config path not found: ${path}`);
      return undefined as T;
    }
  }

  return current as T;
}

export type ConfigManager = typeof configManager;
