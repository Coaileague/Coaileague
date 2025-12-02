/**
 * SeasonalEffectsLayer - Unified seasonal visual effects orchestrator
 * 
 * Renders the appropriate effects based on current season:
 * - Winter background overlay for snow visibility on white pages
 * - Snowfall + snow piles for winter/christmas
 * - Corner-only ornaments that never block content
 * - Persistent state management for smooth transitions
 */

import { memo, Suspense, lazy, useEffect, useState, useMemo, useRef } from 'react';
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

interface SparkleParticle {
  id: number;
  x: number;
  y: number;
  opacity: number;
  size: number;
  color: string;
}

const SantaFlyover = memo(function SantaFlyover() {
  const { seasonId } = useSeasonalTheme();
  const [isFlying, setIsFlying] = useState(false);
  const [position, setPosition] = useState({ x: -200, y: 80 });
  const [sparkles, setSparkles] = useState<SparkleParticle[]>([]);
  const [direction, setDirection] = useState<'ltr' | 'rtl'>('ltr');
  const animationRef = useRef<number | null>(null);
  const sparkleIdRef = useRef(0);
  const timeoutsRef = useRef<number[]>([]);
  
  const isChristmas = seasonId === 'christmas';
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const santaSize = isMobile ? 40 : 60;
  
  useEffect(() => {
    if (!isChristmas) return;
    
    const clearAllTimeouts = () => {
      timeoutsRef.current.forEach(t => clearTimeout(t));
      timeoutsRef.current = [];
    };
    
    const scheduleNextFlyover = () => {
      const delay = 20000 + Math.random() * 40000;
      
      const timeout = window.setTimeout(() => {
        setDirection(Math.random() > 0.5 ? 'ltr' : 'rtl');
        setIsFlying(true);
        
        const endTimeout = window.setTimeout(() => {
          setIsFlying(false);
          scheduleNextFlyover();
        }, 8000);
        timeoutsRef.current.push(endTimeout);
      }, delay);
      
      timeoutsRef.current.push(timeout);
    };
    
    setDirection('ltr');
    setIsFlying(true);
    
    const initialTimeout = window.setTimeout(() => {
      setIsFlying(false);
      scheduleNextFlyover();
    }, 8000);
    timeoutsRef.current.push(initialTimeout);
    
    return () => {
      clearAllTimeouts();
    };
  }, [isChristmas]);
  
  useEffect(() => {
    if (!isFlying) {
      setPosition({ x: direction === 'ltr' ? -200 : window.innerWidth + 200, y: 60 + Math.random() * 80 });
      setSparkles([]);
      return;
    }
    
    const startX = direction === 'ltr' ? -200 : window.innerWidth + 200;
    const endX = direction === 'ltr' ? window.innerWidth + 200 : -200;
    const startTime = Date.now();
    const duration = 8000;
    const baseY = 60 + Math.random() * 80;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const eased = 0.5 - 0.5 * Math.cos(progress * Math.PI);
      const currentX = startX + (endX - startX) * eased;
      
      const wave = Math.sin(progress * Math.PI * 6) * 15;
      const currentY = baseY + wave;
      
      setPosition({ x: currentX, y: currentY });
      
      if (Math.random() > 0.6) {
        const sparkleColors = ['#ffd700', '#ff6b6b', '#38bdf8', '#ffffff', '#f4c15d'];
        const newSparkle: SparkleParticle = {
          id: sparkleIdRef.current++,
          x: currentX - (direction === 'ltr' ? 30 : -30) + Math.random() * 20 - 10,
          y: currentY + 10 + Math.random() * 15,
          opacity: 1,
          size: 3 + Math.random() * 4,
          color: sparkleColors[Math.floor(Math.random() * sparkleColors.length)]
        };
        
        setSparkles(prev => [...prev.slice(-30), newSparkle]);
      }
      
      setSparkles(prev => 
        prev
          .map(s => ({ ...s, opacity: s.opacity - 0.02, y: s.y + 0.5 }))
          .filter(s => s.opacity > 0)
      );
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isFlying, direction]);
  
  if (!isChristmas) return null;
  
  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 9997 }}
      data-testid="santa-flyover"
    >
      {sparkles.map(sparkle => (
        <div
          key={sparkle.id}
          className="absolute"
          style={{
            left: sparkle.x,
            top: sparkle.y,
            width: sparkle.size,
            height: sparkle.size,
            opacity: sparkle.opacity,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <span
            style={{
              color: sparkle.color,
              fontSize: sparkle.size * 2,
              textShadow: `0 0 ${sparkle.size}px ${sparkle.color}`
            }}
          >
            *
          </span>
        </div>
      ))}
      
      {isFlying && (
        <div
          className="absolute transition-none"
          style={{
            left: position.x,
            top: position.y,
            transform: `translate(-50%, -50%) scaleX(${direction === 'ltr' ? 1 : -1})`,
            fontSize: santaSize,
            filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))',
            transition: 'none'
          }}
        >
          <div className="relative whitespace-nowrap" style={{ fontFamily: 'monospace' }}>
            <span style={{ color: '#ef4444', textShadow: '0 0 8px #ef4444' }}>o</span>
            <span style={{ color: '#f5f5dc' }}>&lt;</span>
            <span style={{ color: '#8b4513' }}>=</span>
            <span style={{ color: '#ffd700', textShadow: '0 0 6px #ffd700' }}>*</span>
            <span style={{ color: '#654321' }}>~</span>
            <span style={{ color: '#8b4513' }}>{'>'}</span>
            <span style={{ color: '#ffd700', textShadow: '0 0 4px #ffd700' }}>.</span>
          </div>
          <div 
            className="absolute -bottom-2 left-1/2 transform -translate-x-1/2"
            style={{ 
              fontSize: santaSize * 0.3,
              color: '#654321',
              letterSpacing: '2px'
            }}
          >
            ====
          </div>
        </div>
      )}
    </div>
  );
});

const HolidayLights = memo(function HolidayLights() {
  const { seasonId } = useSeasonalTheme();
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const isChristmas = seasonId === 'christmas';
  if (!isChristmas) return null;
  
  const lightColors = ['#ef4444', '#22c55e', '#3b82f6', '#fbbf24', '#f472b6', '#a855f7'];
  const lightCount = Math.floor(windowWidth / 40);
  
  return (
    <div
      className="fixed top-0 left-0 right-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 9995, height: 30 }}
      data-testid="holiday-lights"
    >
      <div className="flex justify-between px-2" style={{ marginTop: -5 }}>
        {Array.from({ length: lightCount }).map((_, i) => {
          const color = lightColors[i % lightColors.length];
          const delay = i * 0.15;
          return (
            <div
              key={i}
              className="relative"
              style={{
                animation: `lightGlow 1.5s ease-in-out ${delay}s infinite alternate`,
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  color: '#1a1a1a',
                  display: 'block',
                  textAlign: 'center',
                }}
              >
                |
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: color,
                  display: 'block',
                  textAlign: 'center',
                  marginTop: -2,
                  textShadow: `0 0 6px ${color}, 0 0 12px ${color}`,
                }}
              >
                o
              </span>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes lightGlow {
          0% { opacity: 0.4; filter: brightness(0.6); }
          100% { opacity: 1; filter: brightness(1.3); }
        }
      `}</style>
    </div>
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
  
  const isChristmas = seasonId === 'christmas';
  
  return (
    <>
      {isWinter && <WinterBackgroundOverlay />}
      
      {showSnow && (
        <Suspense fallback={null}>
          <SnowfallEngine />
        </Suspense>
      )}
      
      {isChristmas && <HolidayLights />}
      {isChristmas && <SantaFlyover />}
      
      <CornerOrnaments />
    </>
  );
});

export default SeasonalEffectsLayer;
