/**
 * React Hooks for accessing configuration
 * Type-safe, simple hooks for consuming configs in components
 * 
 * Usage in components:
 * const endpoint = useApiEndpoint('employees.list')
 * const isEnabled = useFeatureToggle('ai.autoScheduling')
 * const aiConfig = useAIConfig('scheduling')
 * const message = useMessage('auth.loginSuccess')
 */

import { useMemo } from "react";
import { configManager } from "@/lib/configManager";
// Pricing imports commented out - will be added when pricing module import is resolved
// import type { PRICING_TIERS, SubscriptionTier } from "@/config/pricing";
// import { getPricingTier, getTierFeatures, isFeatureInTier } from "@/config/pricing";

/**
 * Get API endpoint
 * Usage: const endpoint = useApiEndpoint('employees.list')
 */
export function useApiEndpoint(path: string): string {
  return useMemo(() => configManager.getEndpoint(path), [path]);
}

/**
 * Build API URL with query parameters
 * Usage: const url = useBuildApiUrl('/api/employees', { page: 1, limit: 10 })
 */
export function useBuildApiUrl(endpoint: string, params?: Record<string, any>): string {
  return useMemo(() => configManager.buildApiUrl(endpoint, params), [endpoint, params]);
}

/**
 * Check if feature is enabled
 * Usage: const isEnabled = useFeatureToggle('ai.autoScheduling')
 */
export function useFeatureToggle(path: string): boolean {
  return useMemo(() => configManager.isFeatureEnabled(path), [path]);
}

/**
 * Check multiple features - all must be enabled
 * Usage: const hasAll = useAllFeatures(['ai.autoScheduling', 'scheduling.enabled'])
 */
export function useAllFeatures(paths: string[]): boolean {
  return useMemo(() => configManager.allFeaturesEnabled(paths), [paths.join(",")]);
}

/**
 * Check multiple features - any can be enabled
 * Usage: const hasAny = useAnyFeature(['ai.sentimentAnalysis', 'analytics.advanced'])
 */
export function useAnyFeature(paths: string[]): boolean {
  return useMemo(() => configManager.anyFeatureEnabled(paths), [paths.join(",")]);
}

/**
 * Get AI configuration for a feature
 * Usage: const config = useAIConfig('scheduling')
 */
export function useAIConfig(feature: string) {
  return useMemo(() => configManager.getAIConfig(feature), [feature]);
}

/**
 * Get AI prompt for a feature
 * Usage: const prompt = useAIPrompt('scheduling')
 */
export function useAIPrompt(feature: string): string {
  return useMemo(() => configManager.getAIPrompt(feature), [feature]);
}

/**
 * Check if AI feature is enabled
 * Usage: const isEnabled = useAIFeatureEnabled('scheduling')
 */
export function useAIFeatureEnabled(feature: string): boolean {
  return useMemo(() => configManager.isAIFeatureEnabled(feature), [feature]);
}

/**
 * Get AI model for a feature
 * Usage: const model = useAIModel('scheduling')
 */
export function useAIModel(feature: string): string {
  return useMemo(() => configManager.getAIModel(feature), [feature]);
}

/**
 * Get AI temperature for a feature
 * Usage: const temp = useAITemperature('scheduling')
 */
export function useAITemperature(feature: string): number {
  return useMemo(() => configManager.getAITemperature(feature), [feature]);
}

/**
 * Get message with interpolation
 * Usage: const msg = useMessage('create.success', { entity: 'Employee' })
 */
export function useMessage(path: string, vars?: Record<string, any>): string {
  return useMemo(() => configManager.getMessage(path, vars), [path, JSON.stringify(vars)]);
}

/**
 * Get default value by path
 * Usage: const pageSize = useDefault('pagination.pageSize')
 */
export function useDefault(path: string): any {
  return useMemo(() => configManager.getDefault(path), [path]);
}

/**
 * Get app config
 * Usage: const config = useAppConfig()
 */
export function useAppConfig() {
  return useMemo(() => configManager.app(), []);
}
