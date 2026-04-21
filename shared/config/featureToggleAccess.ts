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

async function getConfigRegistry() {
  if (!configRegistry) {
    const mod = await import('../../server/services/configRegistry');
    configRegistry = mod.configRegistry;
  }
  return configRegistry;
}

/**
 * Get entire feature toggles object
 * Returns current configuration from ConfigRegistry cache
 */
export async function getFeatureToggles() {
  const registry = await getConfigRegistry();
  return registry.getConfig('featureToggles');
}

/**
 * Get specific toggle by path (e.g., 'automation.autoTicketCreation')
 * Returns boolean value or false if path doesn't exist
 */
export async function getFeatureToggle(path: string): Promise<boolean> {
  try {
    const config = await getFeatureToggles();
    const keys = path.split('.');
    let value: any = config;
    for (const key of keys) {
      value = value?.[key];
    }
    return value ?? false;
  } catch {
    return false; // Safe default — feature off if registry unavailable
  }
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
