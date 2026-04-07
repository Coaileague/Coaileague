/**
 * SEASONAL TOGGLE - Single Control Point
 * =======================================
 * One place to enable/disable ALL seasonal decorations platform-wide.
 * 
 * To enable decorations: Set SEASONAL_ENABLED = true
 * To disable decorations: Set SEASONAL_ENABLED = false
 * 
 * This controls: Snow, Christmas lights, Halloween effects, etc.
 */

export const SEASONAL_ENABLED = false; // Set to true to enable seasonal decorations

export const SEASONAL_CONFIG = {
  enabled: SEASONAL_ENABLED,
  
  // Current active season (only used when enabled = true)
  activeSeason: 'default' as 'default' | 'christmas' | 'winter' | 'halloween' | 'valentine' | 'easter' | 'summer',
  
  // Individual effect toggles (only used when enabled = true)
  effects: {
    snow: false,
    lights: false,
    ornaments: false,
    confetti: false,
    hearts: false,
    pumpkins: false,
  },
  
  // Animation intensity (0 = none, 1 = full)
  intensity: 0.5,
};

export function isSeasonalEnabled(): boolean {
  return SEASONAL_ENABLED;
}

export function getSeasonalConfig() {
  return SEASONAL_CONFIG;
}
