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

const SeasonalThemeContext = createContext<SeasonalThemeContextValue | null>(null);

export function SeasonalThemeProvider({ children }: { children: React.ReactNode }) {
  const [effectsEnabled, setEffectsEnabled] = useState(true);
  const darkModeAppliedRef = useRef(false);
  const previousThemeRef = useRef<'light' | 'dark' | null>(null);
  
  const { data, isLoading, error, refetch } = useQuery<{ success: boolean; profile: SeasonalProfile }>({
    queryKey: ['/api/mascot/seasonal/state'],
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: 2,
  });
  
  const profile = data?.profile || DEFAULT_PROFILE;
  
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
        console.log('[SeasonalTheme] Forced dark mode for', profile.seasonId);
      }
    } else if (!shouldForceDark && darkModeAppliedRef.current) {
      if (previousThemeRef.current === 'light') {
        htmlElement.classList.remove('dark');
      }
      darkModeAppliedRef.current = false;
      previousThemeRef.current = null;
      console.log('[SeasonalTheme] Restored original theme');
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
