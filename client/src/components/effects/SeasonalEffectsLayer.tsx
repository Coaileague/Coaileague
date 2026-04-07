/**
 * SeasonalEffectsLayer - Unified seasonal visual effects orchestrator
 * 
 * Renders code-based SVG/CSS ornament graphics orchestrated by AI Brain:
 * - Winter background overlay for snow visibility on white pages
 * - Snowfall + snow piles via SnowfallEngine
 * - SVG ornament balls and stars in corners
 * - CSS light strings across top
 * - SVG Santa sleigh flyover with sparkle trail
 * - AI Brain awareness for spawning, density, and effect sync
 */

import { memo, Suspense, lazy, useEffect, useState } from 'react';
import { useSeasonalTheme, type SeasonId } from '@/context/SeasonalThemeContext';
import { FullFestiveScene } from '@/lib/ornaments/sceneRegistry';

const SnowfallEngine = lazy(() => import('./SnowfallEngine'));

const STORAGE_KEY = 'coaileague_seasonal_state';

interface StoredSeasonalState {
  seasonId: SeasonId;
  originalTheme: 'light' | 'dark';
  timestamp: number;
}

function saveSeasonalState(state: StoredSeasonalState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[Seasonal] Failed to save state:', e);
  }
}

function loadSeasonalState(): StoredSeasonalState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const state = JSON.parse(stored) as StoredSeasonalState;
      if (Date.now() - state.timestamp < 24 * 60 * 60 * 1000) {
        return state;
      }
    }
  } catch (e) {
    console.warn('[Seasonal] Failed to load state:', e);
  }
  return null;
}

const SeasonalEffectsLayer = memo(function SeasonalEffectsLayer() {
  const { seasonId, effectsEnabled, isLoading } = useSeasonalTheme();
  
  // Clear any cached seasonal state immediately when server returns 'default'
  // This ensures seasonal theming controlled by server is respected
  useEffect(() => {
    if (!isLoading && seasonId === 'default') {
      const stored = loadSeasonalState();
      if (stored) {
        // Server says no seasonal theming - clear localStorage and restore theme
        const htmlElement = document.documentElement;
        if (stored.originalTheme === 'light') {
          htmlElement.classList.remove('dark');
        } else {
          htmlElement.classList.add('dark');
        }
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [seasonId, isLoading]);
  
  // Only persist seasonal state if server explicitly returns a holiday (not during loading)
  useEffect(() => {
    // Don't save during loading - wait for server response
    if (isLoading) return;
    
    if (seasonId && seasonId !== 'default') {
      const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      const stored = loadSeasonalState();
      
      if (!stored || stored.seasonId !== seasonId) {
        saveSeasonalState({
          seasonId,
          originalTheme: stored?.originalTheme || (currentTheme as 'light' | 'dark'),
          timestamp: Date.now(),
        });
      }
    }
  }, [seasonId, isLoading]);
  
  if (!effectsEnabled) return null;
  
  const isWinter = seasonId === 'winter' || seasonId === 'christmas' || seasonId === 'newYear';
  
  return (
    <>
      {/* Canvas-based snowfall engine for performance */}
      {isWinter && (
        <Suspense fallback={null}>
          <SnowfallEngine />
        </Suspense>
      )}
      
      {/* SVG/CSS code-based ornament scenes */}
      <FullFestiveScene />
    </>
  );
});

export default SeasonalEffectsLayer;
