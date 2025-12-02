/**
 * SeasonalEffectsLayer - Unified seasonal visual effects orchestrator
 * 
 * Renders the appropriate effects based on current season:
 * - Winter background overlay for snow visibility on white pages
 * - Snowfall + snow piles for winter/christmas
 * - Real holiday ornament images in corners
 * - Real Christmas lights across top
 * - Real Santa sleigh flyover
 * - Persistent state management for smooth transitions
 */

import { memo, Suspense, lazy, useEffect, useState, useMemo, useRef } from 'react';
import { useSeasonalTheme, useSeasonalEffect, useSeasonalOrnaments, type SeasonId } from '@/context/SeasonalThemeContext';

const SnowfallEngine = lazy(() => import('./SnowfallEngine'));

const STORAGE_KEY = 'coaileague_seasonal_state';

// Holiday images from public folder
const ORNAMENT_IMAGES = [
  '/holiday-images/christmas_ornament_b_b50f768c.jpg',
  '/holiday-images/christmas_ornament_b_949ca0ea.jpg',
  '/holiday-images/christmas_ornament_b_4cb16cb0.jpg',
];
const SNOWFLAKE_IMAGES = [
  '/holiday-images/snowflake_white_ice__738601ce.jpg',
  '/holiday-images/snowflake_white_ice__d03c14d5.jpg',
];
const STAR_IMAGES = [
  '/holiday-images/christmas_star_gold__ed5d8d56.jpg',
  '/holiday-images/christmas_star_gold__4d512ce7.jpg',
];
const LIGHTS_IMAGE = '/holiday-images/christmas_lights_str_4e186913.jpg';
const SANTA_IMAGE = '/holiday-images/santa_claus_sleigh_r_4df10136.jpg';

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

interface ImageOrnamentProps {
  src: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  animationDelay: number;
}

function ImageOrnament({ src, x, y, size, rotation, animationDelay }: ImageOrnamentProps) {
  return (
    <div
      className="absolute pointer-events-none select-none"
      style={{
        left: x,
        top: y,
        width: size,
        height: size,
        transform: `rotate(${rotation}deg)`,
        opacity: 0.9,
        animation: `ornamentFloat 3s ease-in-out ${animationDelay}s infinite alternate`,
        filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))',
      }}
    >
      <img 
        src={src} 
        alt="" 
        className="w-full h-full object-contain rounded-full"
        style={{
          filter: 'brightness(1.1) saturate(1.2)',
        }}
      />
    </div>
  );
}

const CornerOrnaments = memo(function CornerOrnaments() {
  const { enabled, density } = useSeasonalOrnaments();
  const [windowSize, setWindowSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  
  useEffect(() => {
    const handleResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const ornaments = useMemo(() => {
    if (!enabled) return [];
    
    const perCorner = density === 'dense' ? 4 : density === 'medium' ? 3 : 2;
    const result: ImageOrnamentProps[] = [];
    const cornerSize = 100;
    const allImages = [...ORNAMENT_IMAGES, ...STAR_IMAGES];
    
    const corners = [
      { x: 0, y: 0 },
      { x: windowSize.w - cornerSize, y: 0 },
      { x: 0, y: windowSize.h - cornerSize - 60 },
      { x: windowSize.w - cornerSize, y: windowSize.h - cornerSize - 60 },
    ];
    
    corners.forEach((corner, cornerIndex) => {
      for (let i = 0; i < perCorner; i++) {
        const imgIndex = (cornerIndex + i) % allImages.length;
        
        result.push({
          src: allImages[imgIndex],
          x: corner.x + 5 + Math.random() * (cornerSize - 40),
          y: corner.y + 5 + Math.random() * (cornerSize - 40),
          size: 28 + Math.random() * 20,
          rotation: Math.random() * 30 - 15,
          animationDelay: (cornerIndex * 0.3) + (i * 0.2),
        });
      }
    });
    
    return result;
  }, [enabled, density, windowSize]);
  
  if (!enabled || ornaments.length === 0) return null;
  
  return (
    <div 
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 9996 }}
      data-testid="corner-ornaments"
    >
      <style>{`
        @keyframes ornamentFloat {
          0% { transform: translateY(0) rotate(var(--rotation, 0deg)); }
          100% { transform: translateY(-8px) rotate(calc(var(--rotation, 0deg) + 5deg)); }
        }
      `}</style>
      {ornaments.map((ornament, index) => (
        <ImageOrnament key={`ornament-${index}`} {...ornament} />
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
  const santaSize = isMobile ? 80 : 120;
  
  useEffect(() => {
    if (!isChristmas) return;
    
    const clearAllTimeouts = () => {
      timeoutsRef.current.forEach(t => clearTimeout(t));
      timeoutsRef.current = [];
    };
    
    const scheduleNextFlyover = () => {
      const delay = 25000 + Math.random() * 45000;
      
      const timeout = window.setTimeout(() => {
        setDirection(Math.random() > 0.5 ? 'ltr' : 'rtl');
        setIsFlying(true);
        
        const endTimeout = window.setTimeout(() => {
          setIsFlying(false);
          scheduleNextFlyover();
        }, 10000);
        timeoutsRef.current.push(endTimeout);
      }, delay);
      
      timeoutsRef.current.push(timeout);
    };
    
    setDirection('ltr');
    setIsFlying(true);
    
    const initialTimeout = window.setTimeout(() => {
      setIsFlying(false);
      scheduleNextFlyover();
    }, 10000);
    timeoutsRef.current.push(initialTimeout);
    
    return () => {
      clearAllTimeouts();
    };
  }, [isChristmas]);
  
  useEffect(() => {
    if (!isFlying) {
      setPosition({ x: direction === 'ltr' ? -200 : window.innerWidth + 200, y: 50 + Math.random() * 60 });
      setSparkles([]);
      return;
    }
    
    const startX = direction === 'ltr' ? -200 : window.innerWidth + 200;
    const endX = direction === 'ltr' ? window.innerWidth + 200 : -200;
    const startTime = Date.now();
    const duration = 10000;
    const baseY = 50 + Math.random() * 60;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const eased = 0.5 - 0.5 * Math.cos(progress * Math.PI);
      const currentX = startX + (endX - startX) * eased;
      
      const wave = Math.sin(progress * Math.PI * 4) * 12;
      const currentY = baseY + wave;
      
      setPosition({ x: currentX, y: currentY });
      
      // Create sparkle trail
      if (Math.random() > 0.5) {
        const sparkleColors = ['#ffd700', '#ff6b6b', '#38bdf8', '#ffffff', '#f4c15d', '#a855f7'];
        const newSparkle: SparkleParticle = {
          id: sparkleIdRef.current++,
          x: currentX - (direction === 'ltr' ? 50 : -50) + Math.random() * 30 - 15,
          y: currentY + 20 + Math.random() * 20,
          opacity: 1,
          size: 4 + Math.random() * 6,
          color: sparkleColors[Math.floor(Math.random() * sparkleColors.length)]
        };
        
        setSparkles(prev => [...prev.slice(-40), newSparkle]);
      }
      
      setSparkles(prev => 
        prev
          .map(s => ({ ...s, opacity: s.opacity - 0.015, y: s.y + 0.8 }))
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
      {/* Sparkle trail */}
      {sparkles.map(sparkle => (
        <div
          key={sparkle.id}
          className="absolute rounded-full"
          style={{
            left: sparkle.x,
            top: sparkle.y,
            width: sparkle.size,
            height: sparkle.size,
            opacity: sparkle.opacity,
            transform: 'translate(-50%, -50%)',
            background: `radial-gradient(circle, ${sparkle.color} 0%, transparent 70%)`,
            boxShadow: `0 0 ${sparkle.size * 2}px ${sparkle.color}`,
          }}
        />
      ))}
      
      {/* Real Santa sleigh image */}
      {isFlying && (
        <div
          className="absolute"
          style={{
            left: position.x,
            top: position.y,
            width: santaSize,
            height: santaSize * 0.6,
            transform: `translate(-50%, -50%) scaleX(${direction === 'ltr' ? 1 : -1})`,
            transition: 'none',
          }}
        >
          <img 
            src={SANTA_IMAGE} 
            alt=""
            className="w-full h-full object-contain"
            style={{
              filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.4)) brightness(1.1)',
            }}
          />
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
  
  return (
    <div
      className="fixed top-0 left-0 right-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 9995, height: 60 }}
      data-testid="holiday-lights"
    >
      {/* Real Christmas lights image strip across top */}
      <div 
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${LIGHTS_IMAGE})`,
          backgroundSize: 'auto 100%',
          backgroundRepeat: 'repeat-x',
          backgroundPosition: 'center top',
          opacity: 0.9,
          animation: 'lightsGlow 2s ease-in-out infinite alternate',
          filter: 'brightness(1.2) saturate(1.3)',
        }}
      />
      <style>{`
        @keyframes lightsGlow {
          0% { opacity: 0.7; filter: brightness(1.0) saturate(1.1); }
          100% { opacity: 1; filter: brightness(1.4) saturate(1.4); }
        }
      `}</style>
    </div>
  );
});

// Floating snowflakes with real images
const FloatingSnowflakes = memo(function FloatingSnowflakes() {
  const { seasonId } = useSeasonalTheme();
  const [flakes, setFlakes] = useState<Array<{
    id: number;
    x: number;
    y: number;
    size: number;
    speed: number;
    src: string;
    rotation: number;
    rotationSpeed: number;
  }>>([]);
  
  const isWinter = seasonId === 'winter' || seasonId === 'christmas' || seasonId === 'newYear';
  
  useEffect(() => {
    if (!isWinter) {
      setFlakes([]);
      return;
    }
    
    // Create initial snowflakes
    const initialFlakes = Array.from({ length: 8 }, (_, i) => ({
      id: i,
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: 20 + Math.random() * 30,
      speed: 0.3 + Math.random() * 0.5,
      src: SNOWFLAKE_IMAGES[i % SNOWFLAKE_IMAGES.length],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 2,
    }));
    setFlakes(initialFlakes);
    
    let animFrame: number;
    const animate = () => {
      setFlakes(prev => prev.map(flake => {
        let newY = flake.y + flake.speed;
        let newX = flake.x + Math.sin(flake.y * 0.01) * 0.5;
        let newRotation = flake.rotation + flake.rotationSpeed;
        
        if (newY > window.innerHeight + 50) {
          newY = -50;
          newX = Math.random() * window.innerWidth;
        }
        
        return { ...flake, x: newX, y: newY, rotation: newRotation };
      }));
      animFrame = requestAnimationFrame(animate);
    };
    
    animFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrame);
  }, [isWinter]);
  
  if (!isWinter || flakes.length === 0) return null;
  
  return (
    <div 
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 9993 }}
      data-testid="floating-snowflakes"
    >
      {flakes.map(flake => (
        <div
          key={flake.id}
          className="absolute"
          style={{
            left: flake.x,
            top: flake.y,
            width: flake.size,
            height: flake.size,
            transform: `translate(-50%, -50%) rotate(${flake.rotation}deg)`,
            opacity: 0.7,
          }}
        >
          <img 
            src={flake.src}
            alt=""
            className="w-full h-full object-contain"
            style={{
              filter: 'brightness(1.3) drop-shadow(0 2px 4px rgba(255,255,255,0.5))',
            }}
          />
        </div>
      ))}
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
      
      {isWinter && <FloatingSnowflakes />}
      {isChristmas && <HolidayLights />}
      {isChristmas && <SantaFlyover />}
      
      <CornerOrnaments />
    </>
  );
});

export default SeasonalEffectsLayer;
