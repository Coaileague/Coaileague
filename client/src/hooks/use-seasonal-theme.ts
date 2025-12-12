/**
 * useSeasonalTheme - DEPRECATED - Use SeasonalThemeContext instead
 * 
 * @deprecated This hook detects season from calendar date WITHOUT checking AI Brain orchestration.
 * Import { useSeasonalTheme } from '@/context/SeasonalThemeContext' for proper orchestration.
 * 
 * CRITICAL: This client-side detection bypasses Trinity's seasonal control.
 * Any code using this hook will NOT respect:
 * - DISABLE_SEASONAL_THEMING environment variable
 * - Trinity force_disable/force_enable commands
 * - AI Brain orchestration overrides
 */

import { useState, useEffect, useMemo } from 'react';
import { 
  SeasonalTheme, 
  SeasonalThemeConfig, 
  getCurrentSeasonalTheme, 
  getThemeConfig 
} from '@/config/seasonalThemes';

console.warn('[DEPRECATED] use-seasonal-theme.ts is deprecated. Use SeasonalThemeContext instead for AI Brain orchestration.');

interface UseSeasonalThemeOptions {
  override?: SeasonalTheme;
  respectReducedMotion?: boolean;
}

interface UseSeasonalThemeReturn {
  theme: SeasonalTheme;
  config: SeasonalThemeConfig;
  isHoliday: boolean;
  specialMessage?: string;
  setOverride: (theme: SeasonalTheme | null) => void;
  prefersReducedMotion: boolean;
}

export function useSeasonalTheme(options: UseSeasonalThemeOptions = {}): UseSeasonalThemeReturn {
  const { override, respectReducedMotion = true } = options;
  
  const [themeOverride, setThemeOverride] = useState<SeasonalTheme | null>(override || null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  
  // Detect reduced motion preference
  useEffect(() => {
    if (!respectReducedMotion) return;
    
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handler = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };
    
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [respectReducedMotion]);
  
  // Get the current theme
  const currentTheme = useMemo(() => {
    if (themeOverride) return themeOverride;
    return getCurrentSeasonalTheme(new Date());
  }, [themeOverride]);
  
  // Get theme configuration
  const config = useMemo(() => {
    return getThemeConfig(currentTheme);
  }, [currentTheme]);
  
  // Determine if it's a holiday
  const isHoliday = useMemo(() => {
    return ['christmas', 'newYear', 'valentines', 'easter', 'halloween', 'thanksgiving'].includes(currentTheme);
  }, [currentTheme]);
  
  const setOverride = (theme: SeasonalTheme | null) => {
    setThemeOverride(theme);
  };
  
  return {
    theme: currentTheme,
    config,
    isHoliday,
    specialMessage: config.specialMessage,
    setOverride,
    prefersReducedMotion
  };
}

export type { UseSeasonalThemeReturn };
