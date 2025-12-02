/**
 * SeasonalEffectsLayer - Unified seasonal visual effects orchestrator
 * 
 * Renders the appropriate effects based on current season:
 * - Winter background overlay for snow visibility on white pages
 * - Snowfall + snow piles for winter/christmas
 * - Corner-only ornaments that never block content
 * - Persistent state management for smooth transitions
 */

import { memo, Suspense, lazy, useEffect, useState, useMemo } from 'react';
import { useSeasonalTheme, useSeasonalEffect, useSeasonalOrnaments, type SeasonId } from '@/context/SeasonalThemeContext';

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

interface OrnamentProps {
  type: string;
  x: number;
  y: number;
  size: number;
  color: string;
  rotation: number;
  animationDelay: number;
}

const ORNAMENT_SYMBOLS: Record<string, string> = {
  star: '*',
  ball: 'o',
  candy_cane: '/',
  gift: '+',
  bell: 'A',
  snowflake: '*',
  holly: '~',
  light: '.',
};

function Ornament({ type, x, y, size, color, rotation, animationDelay }: OrnamentProps) {
  const symbol = ORNAMENT_SYMBOLS[type] || '*';
  
  return (
    <div
      className="absolute pointer-events-none select-none animate-pulse"
      style={{
        left: x,
        top: y,
        fontSize: size,
        color: color,
        transform: `rotate(${rotation}deg)`,
        textShadow: `0 0 ${size * 0.4}px ${color}, 0 0 ${size * 0.8}px ${color}50`,
        fontWeight: 'bold',
        opacity: 0.85,
        animationDelay: `${animationDelay}s`,
        animationDuration: '2s',
      }}
    >
      {symbol}
    </div>
  );
}

const CornerOrnaments = memo(function CornerOrnaments() {
  const { enabled, types, colors, density } = useSeasonalOrnaments();
  const [windowSize, setWindowSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  
  useEffect(() => {
    const handleResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const ornaments = useMemo(() => {
    if (!enabled || types.length === 0) return [];
    
    const perCorner = density === 'dense' ? 4 : density === 'medium' ? 3 : 2;
    const result: OrnamentProps[] = [];
    const cornerSize = 80;
    
    const corners = [
      { x: 0, y: 0 },
      { x: windowSize.w - cornerSize, y: 0 },
      { x: 0, y: windowSize.h - cornerSize - 60 },
      { x: windowSize.w - cornerSize, y: windowSize.h - cornerSize - 60 },
    ];
    
    corners.forEach((corner, cornerIndex) => {
      for (let i = 0; i < perCorner; i++) {
        const type = types[(cornerIndex + i) % types.length];
        const color = colors[(cornerIndex + i) % colors.length];
        
        result.push({
          type,
          x: corner.x + 10 + Math.random() * (cornerSize - 30),
          y: corner.y + 10 + Math.random() * (cornerSize - 30),
          size: 18 + Math.random() * 14,
          color,
          rotation: Math.random() * 40 - 20,
          animationDelay: (cornerIndex * 0.3) + (i * 0.2),
        });
      }
    });
    
    return result;
  }, [enabled, types, colors, density, windowSize]);
  
  if (!enabled || ornaments.length === 0) return null;
  
  return (
    <div 
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 9996 }}
      data-testid="corner-ornaments"
    >
      {ornaments.map((ornament, index) => (
        <Ornament key={`ornament-${index}`} {...ornament} />
      ))}
    </div>
  );
});

const WinterBackgroundOverlay = memo(function WinterBackgroundOverlay() {
  const { seasonId, forceDarkMode } = useSeasonalTheme();
  
  const isWinter = seasonId === 'winter' || seasonId === 'christmas' || seasonId === 'newYear';
  
  if (!isWinter) return null;
  
  return (
    <div
      className="fixed inset-0 pointer-events-none transition-opacity duration-1000"
      style={{
        zIndex: 9990,
        background: forceDarkMode 
          ? 'linear-gradient(180deg, rgba(15, 23, 42, 0.3) 0%, rgba(30, 41, 59, 0.2) 50%, rgba(15, 23, 42, 0.4) 100%)'
          : 'linear-gradient(180deg, rgba(100, 130, 170, 0.15) 0%, rgba(70, 100, 140, 0.1) 50%, rgba(100, 130, 170, 0.2) 100%)',
        opacity: 1,
      }}
      data-testid="winter-background"
    />
  );
});

const SeasonalEffectsLayer = memo(function SeasonalEffectsLayer() {
  const { seasonId, effectsEnabled, forceDarkMode } = useSeasonalTheme();
  const { type: effectType } = useSeasonalEffect();
  
  useEffect(() => {
    if (seasonId && seasonId !== 'default') {
      const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      const stored = loadSeasonalState();
      
      if (!stored || stored.seasonId !== seasonId) {
        saveSeasonalState({
          seasonId,
          originalTheme: stored?.originalTheme || (currentTheme as 'light' | 'dark'),
          timestamp: Date.now(),
        });
        console.log('[Seasonal] Saved state for', seasonId);
      }
    }
  }, [seasonId]);
  
  useEffect(() => {
    if (seasonId === 'default') {
      const stored = loadSeasonalState();
      if (stored && stored.originalTheme) {
        const htmlElement = document.documentElement;
        if (stored.originalTheme === 'light') {
          htmlElement.classList.remove('dark');
        } else {
          htmlElement.classList.add('dark');
        }
        localStorage.removeItem(STORAGE_KEY);
        console.log('[Seasonal] Restored original theme:', stored.originalTheme);
      }
    }
  }, [seasonId]);
  
  if (!effectsEnabled) return null;
  
  const showSnow = effectType === 'snowfall' || effectType === 'snowPiles';
  const isWinter = seasonId === 'winter' || seasonId === 'christmas' || seasonId === 'newYear';
  
  return (
    <>
      {isWinter && <WinterBackgroundOverlay />}
      
      {showSnow && (
        <Suspense fallback={null}>
          <SnowfallEngine />
        </Suspense>
      )}
      
      <CornerOrnaments />
    </>
  );
});

export default SeasonalEffectsLayer;
