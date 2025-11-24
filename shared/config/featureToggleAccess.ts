/**
 * Feature Toggle Accessor Layer
 * Provides runtime access to feature toggles through ConfigRegistry
 * Enables dynamic updates without server restart
 */

import { EventEmitter } from 'events';

// Event emitter for change notifications
const changeEmitter = new EventEmitter();

// Lazy import to avoid circular dependencies
let configRegistry: any = null;

function getConfigRegistry() {
  if (!configRegistry) {
    // Dynamic import to break circular dependency
    // This is safe because configRegistry is accessed at runtime, not at module load time
    configRegistry = require('../../server/services/configRegistry').configRegistry;
  }
  return configRegistry;
}

/**
 * Get entire feature toggles object
 * Returns current configuration from ConfigRegistry cache
 */
export function getFeatureToggles() {
  return getConfigRegistry().getConfig('featureToggles');
}

/**
 * Get specific toggle by path (e.g., 'automation.autoTicketCreation')
 * Returns boolean value or false if path doesn't exist
 */
export function getFeatureToggle(path: string): boolean {
  const config = getFeatureToggles();
  const keys = path.split('.');
  let value: any = config;
  for (const key of keys) {
    value = value?.[key];
  }
  return value ?? false;
}

/**
 * Subscribe to toggle changes
 * Returns unsubscribe function
 */
export function onFeatureToggleChange(callback: () => void) {
  changeEmitter.on('change', callback);
  return () => changeEmitter.off('change', callback);
}

/**
 * Emit change event (called by ConfigRegistry after updates)
 * Notifies all subscribers that feature toggles have changed
 */
export function emitFeatureToggleChange() {
  changeEmitter.emit('change');
}
