/**
 * Master Application Configuration
 * References the centralized platformConfig for consistency
 * Edit shared/platformConfig.ts to change values everywhere instantly
 */

import { PLATFORM, UI, PAGINATION, TIMING, WORKSPACE } from "@shared/platformConfig";

export const APP_CONFIG = {
  // App Identity - from centralized config
  appName: PLATFORM.name,
  appTagline: PLATFORM.tagline,
  version: PLATFORM.version,
  
  // UI Behavior
  ui: {
    defaultTheme: UI.defaultTheme,
    animationDuration: UI.animationDuration,
    transitionDuration: UI.transitionDuration,
    toastDuration: UI.toastDuration,
    notificationDuration: UI.notificationDuration,
  },

  // Pagination & Lists
  pagination: {
    defaultPageSize: PAGINATION.defaultPageSize,
    maxPageSize: PAGINATION.maxPageSize,
    pageSizeOptions: [...PAGINATION.pageSizeOptions],
  },

  // Timeouts & Retries
  timing: {
    requestTimeout: TIMING.requestTimeout,
    maxRetries: TIMING.maxRetries,
    retryDelay: TIMING.retryDelay,
    cacheExpiry: TIMING.cacheExpiry,
  },

  // Workspace defaults
  workspace: {
    defaultTimezone: WORKSPACE.defaultTimezone,
    defaultCurrency: WORKSPACE.defaultCurrency,
    defaultLanguage: WORKSPACE.defaultLanguage,
  },

  // Security
  security: {
    sessionTimeout: TIMING.sessionTimeout,
    requireMfa: false,
    enableCors: true,
  },
};

export function getAppConfig() {
  return APP_CONFIG;
}

// Re-export platform config for convenience
export { PLATFORM, UI, PAGINATION, TIMING, WORKSPACE } from "@shared/platformConfig";
