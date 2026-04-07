/**
 * SeasonalThemeContext - AI-orchestrated universal seasonal theming
 * 
 * Provides platform-wide seasonal appearance management:
 * - Auto-detects season/holiday from AI Brain
 * - Forces dark mode for winter themes (enables snow visibility)
 * - Orchestrates visual effects (snowfall, ornaments)
 * - Provides mascot positioning hints
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SEASONAL_EFFECTS_CONFIG } from '@/config/seasonalThemes';
import { setGlobalSeasonalState, type HolidayKey } from '@/config/mascotConfig';
import { useAuth } from '@/hooks/useAuth';

export type SeasonId = 
  | 'winter' | 'christmas' | 'newYear' | 'valentines' 
  | 'spring' | 'easter' | 'summer' | 'fall' 
  | 'halloween' | 'thanksgiving' | 'default';

export type EffectType = 
  | 'snowfall' | 'snowPiles' | 'ornaments' | 'lights' 
  | 'fireworks' | 'hearts' | 'flowers' | 'leaves' 
  | 'pumpkins' | 'sunrays' | 'none';

export interface SeasonalProfile {
  seasonId: SeasonId;
  holidayName: string | null;
  isHoliday: boolean;
  
  theme: {
    forceDarkMode: boolean;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    glowColor: string;
  };
  
  effects: {
    primary: EffectType;
    secondary: EffectType | null;
    cadence: 'fast' | 'medium' | 'slow' | 'variable';
    intensity: number;
    accumulation: boolean;
    accumulationCycle: {
      formDuration: number;
      holdDuration: number;
      dissolveDuration: number;
    } | null;
  };
  
  ornaments: {
    enabled: boolean;
    types: string[];
    colors: string[];
    density: 'sparse' | 'medium' | 'dense';
  };
  
  mascotHints: {
    preferredZones: ('corners' | 'edges' | 'floating')[];
    avoidEffectZones: boolean;
    seasonalEmotes: string[];
    seasonalThoughts: string[];
  };
  
  validUntil: string;
  aiGenerated: boolean;
}

interface SeasonalThemeContextValue {
  profile: SeasonalProfile | null;
  isLoading: boolean;
  error: Error | null;
  
  seasonId: SeasonId;
  isHoliday: boolean;
  holidayName: string | null;
  
  forceDarkMode: boolean;
  effectsEnabled: boolean;
  
  primaryEffect: EffectType;
  effectIntensity: number;
  
  seasonalColors: {
    primary: string;
    secondary: string;
    accent: string;
    glow: string;
  };
  
  mascotThoughts: string[];
  mascotEmotes: string[];
  
  refetch: () => void;
}

const DEFAULT_PROFILE: SeasonalProfile = {
  seasonId: 'default',
  holidayName: null,
  isHoliday: false,
  theme: {
    forceDarkMode: false,
    primaryColor: '#38bdf8',
    secondaryColor: '#a855f7',
    accentColor: '#ffffff',
    glowColor: '#38bdf8',
  },
  effects: {
    primary: 'none',
    secondary: null,
    cadence: 'medium',
    intensity: 0.5,
    accumulation: false,
    accumulationCycle: null,
  },
  ornaments: {
    enabled: false,
    types: [],
    colors: [],
    density: 'sparse',
  },
  mascotHints: {
    preferredZones: ['corners'],
    avoidEffectZones: true,
    seasonalEmotes: ['idle', 'curious'],
    seasonalThoughts: ["Let's get to work!"],
  },
  validUntil: new Date().toISOString(),
  aiGenerated: false,
};

// REMOVED: CHRISTMAS_PROFILE, isChristmasSeason(), getDateBasedFallback()
// These calendar-based fallbacks bypass AI Brain orchestration.
// Seasonal themes are now controlled exclusively via SeasonalSubagent on the server.
// If DISABLE_SEASONAL_THEMING env var is set or Trinity issues force_disable,
// the server returns seasonId: 'default' and the client respects that decision.

const SeasonalThemeContext = createContext<SeasonalThemeContextValue | null>(null);

export function SeasonalThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [effectsEnabled, setEffectsEnabled] = useState(true);
  const darkModeAppliedRef = useRef(false);
  const previousThemeRef = useRef<'light' | 'dark' | null>(null);
  
  // Only fetch seasonal state when user is authenticated
  const { data, isLoading, error, refetch } = useQuery<{ success: boolean; profile: SeasonalProfile }>({
    queryKey: ['/api/mascot/seasonal/state'],
    enabled: !!user,
    staleTime: 0, // Always refetch to ensure server-controlled seasonal state
    gcTime: 60 * 1000, // Keep in cache for 1 minute for deduplication
    refetchInterval: 5 * 60 * 1000, // Check every 5 minutes for changes
    retry: 1,
  });
  
  // Use API profile if available
  // CRITICAL: If API returns a profile with seasonId: 'default', respect it (means seasonal is disabled)
  // Only use date-based fallback if API call completely failed (network error, not 401)
  // When seasonal is disabled via DISABLE_SEASONAL_THEMING env var, server returns seasonId: 'default'
  const profile = data?.success && data?.profile 
    ? data.profile 
    : (isLoading ? DEFAULT_PROFILE : DEFAULT_PROFILE); // Use default when loading or on error - no client-side override!
  
  useEffect(() => {
    if (!profile) return;
    
    const shouldForceDark = profile.theme.forceDarkMode;
    const htmlElement = document.documentElement;
    const currentTheme = htmlElement.classList.contains('dark') ? 'dark' : 'light';
    
    if (shouldForceDark && !darkModeAppliedRef.current) {
      previousThemeRef.current = currentTheme;
      if (currentTheme !== 'dark') {
        htmlElement.classList.add('dark');
        darkModeAppliedRef.current = true;
      }
    } else if (!shouldForceDark && darkModeAppliedRef.current) {
      if (previousThemeRef.current === 'light') {
        htmlElement.classList.remove('dark');
      }
      darkModeAppliedRef.current = false;
      previousThemeRef.current = null;
    }
  }, [profile?.theme.forceDarkMode, profile?.seasonId]);
  
  useEffect(() => {
    if (!profile) return;
    
    const root = document.documentElement;
    root.style.setProperty('--seasonal-primary', profile.theme.primaryColor);
    root.style.setProperty('--seasonal-secondary', profile.theme.secondaryColor);
    root.style.setProperty('--seasonal-accent', profile.theme.accentColor);
    root.style.setProperty('--seasonal-glow', profile.theme.glowColor);
  }, [profile?.theme]);
  
  // Synchronize global seasonal state for non-React components (e.g., getCurrentHoliday())
  // This ensures all components respect SeasonalSubagent's orchestration decisions
  useEffect(() => {
    if (!profile) return;
    
    // Map SeasonId to HolidayKey (they're compatible types)
    const holidayKey = profile.seasonId as HolidayKey;
    const isEnabled = profile.isHoliday && profile.seasonId !== 'default';
    
    setGlobalSeasonalState(isEnabled, holidayKey);
    
    // Cleanup: reset to default on unmount
    return () => {
      setGlobalSeasonalState(false, 'default');
    };
  }, [profile?.seasonId, profile?.isHoliday]);
  
  const contextValue: SeasonalThemeContextValue = {
    profile,
    isLoading,
    error: error as Error | null,
    
    seasonId: profile.seasonId,
    isHoliday: profile.isHoliday,
    holidayName: profile.holidayName,
    
    forceDarkMode: profile.theme.forceDarkMode,
    effectsEnabled,
    
    primaryEffect: profile.effects.primary,
    effectIntensity: profile.effects.intensity,
    
    seasonalColors: {
      primary: profile.theme.primaryColor,
      secondary: profile.theme.secondaryColor,
      accent: profile.theme.accentColor,
      glow: profile.theme.glowColor,
    },
    
    mascotThoughts: profile.mascotHints.seasonalThoughts,
    mascotEmotes: profile.mascotHints.seasonalEmotes,
    
    refetch,
  };
  
  return (
    <SeasonalThemeContext.Provider value={contextValue}>
      {children}
    </SeasonalThemeContext.Provider>
  );
}

export function useSeasonalTheme() {
  const context = useContext(SeasonalThemeContext);
  if (!context) {
    return {
      profile: DEFAULT_PROFILE,
      isLoading: false,
      error: null,
      seasonId: 'default' as SeasonId,
      isHoliday: false,
      holidayName: null,
      forceDarkMode: false,
      effectsEnabled: false,
      primaryEffect: 'none' as EffectType,
      effectIntensity: 0,
      seasonalColors: DEFAULT_PROFILE.theme,
      mascotThoughts: [],
      mascotEmotes: [],
      refetch: () => {},
    };
  }
  return context;
}

export function useSeasonalEffect() {
  const { profile, effectsEnabled } = useSeasonalTheme();
  
  return {
    enabled: effectsEnabled && profile?.effects.primary !== 'none',
    type: profile?.effects.primary || 'none',
    intensity: profile?.effects.intensity || 0,
    cadence: profile?.effects.cadence || 'medium',
    accumulation: profile?.effects.accumulation || false,
    accumulationCycle: profile?.effects.accumulationCycle,
  };
}

export function useSeasonalOrnaments() {
  const { profile } = useSeasonalTheme();
  
  return {
    enabled: profile?.ornaments.enabled || false,
    types: profile?.ornaments.types || [],
    colors: profile?.ornaments.colors || [],
    density: profile?.ornaments.density || 'sparse',
  };
}

export function useMascotSeasonalHints() {
  const { profile, mascotThoughts, mascotEmotes } = useSeasonalTheme();
  
  return {
    preferredZones: profile?.mascotHints.preferredZones || ['corners'],
    avoidEffectZones: profile?.mascotHints.avoidEffectZones ?? true,
    thoughts: mascotThoughts,
    emotes: mascotEmotes,
  };
}
