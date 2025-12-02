/**
 * OrnamentSceneRegistry - Declarative scene compositions for page-level integration
 * 
 * Maps scene IDs to ornament compositions that can be mounted at various page locations.
 * Scenes read from SeasonalThemeContext and AI Brain orchestrator directives.
 */

import { memo, useMemo, useEffect, useState, useCallback } from 'react';
import { useSeasonalTheme, useSeasonalOrnaments, useSeasonalEffect, type SeasonId } from '@/context/SeasonalThemeContext';
import { 
  OrnamentBall, 
  FacetedStar, 
  ChristmasLight, 
  Snowflake, 
  SantaSleigh,
  LightString,
  ORNAMENT_PALETTES,
  ORNAMENT_KEYFRAMES,
  type OrnamentPalette,
} from './primitives';

// Scene configuration types (aligned with server/services/ai-brain/skills/seasonalOrchestrator.ts)
export type OrnamentType = 'ball' | 'star' | 'light' | 'snowflake' | 'sleigh' | 'giftBox' | 'candyCane' | 'wreath' | 'bow';
export type OrnamentAnimation = 'twinkle' | 'sway' | 'bounce' | 'glow' | 'spin' | 'float' | 'pulse' | 'shimmer';
export type PlacementZone = 'corners' | 'header' | 'inline' | 'overlay' | 'sidebar' | 'footer' | 'random';

export interface OrnamentProfile {
  type: OrnamentType;
  baseHue: string;
  metallic: boolean;
  sizeRange: { min: number; max: number };
  animationSet: OrnamentAnimation[];
  pattern?: 'solid' | 'stripe' | 'dots' | 'swirl';
}

export interface PlacementRule {
  zone: PlacementZone;
  density: 'sparse' | 'medium' | 'dense';
  maxCount: number;
  avoidZones?: { x: number; y: number; width: number; height: number }[];
}

export interface OrnamentDirective {
  profiles: OrnamentProfile[];
  placements: PlacementRule[];
  spawnRate: number;
  decayRate: number;
  syncWithSantaFlyover: boolean;
  globalIntensity: number;
}

// Scene ID types
export type SceneId = 
  | 'corner-cluster'
  | 'header-garland'
  | 'inline-accent'
  | 'snow-overlay'
  | 'santa-flyover'
  | 'full-festive';

interface SceneProps {
  sceneId: SceneId;
  className?: string;
}

// Inject keyframes once
let keyframesInjected = false;
function injectKeyframes() {
  if (keyframesInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = ORNAMENT_KEYFRAMES;
  document.head.appendChild(style);
  keyframesInjected = true;
}

// Palette type with mutable arrays
interface Palette {
  primary: string[];
  metallic: string[];
  accent: string[];
}

// Get palette for current season
function getPalette(seasonId: SeasonId): Palette {
  if (seasonId === 'christmas') return {
    primary: [...ORNAMENT_PALETTES.christmas.primary],
    metallic: [...ORNAMENT_PALETTES.christmas.metallic],
    accent: [...ORNAMENT_PALETTES.christmas.accent],
  };
  if (seasonId === 'newYear') return {
    primary: [...ORNAMENT_PALETTES.newYear.primary],
    metallic: [...ORNAMENT_PALETTES.newYear.metallic],
    accent: [...ORNAMENT_PALETTES.newYear.accent],
  };
  return {
    primary: [...ORNAMENT_PALETTES.winter.primary],
    metallic: [...ORNAMENT_PALETTES.winter.metallic],
    accent: [...ORNAMENT_PALETTES.winter.accent],
  };
}

// Mobile viewport threshold for reduced density
const MOBILE_THRESHOLD = 768;
const TABLET_THRESHOLD = 1024;

// Corner cluster scene - ornaments in corners of the viewport
const CornerClusterScene = memo(function CornerClusterScene() {
  const { seasonId } = useSeasonalTheme();
  const { enabled, density } = useSeasonalOrnaments();
  const [windowSize, setWindowSize] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 1200, h: typeof window !== 'undefined' ? window.innerHeight : 800 });
  
  useEffect(() => {
    injectKeyframes();
    const handleResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Skip dense ornaments on mobile for clean polished look
  const isMobile = windowSize.w < MOBILE_THRESHOLD;
  const isTablet = windowSize.w < TABLET_THRESHOLD;
  
  const ornaments = useMemo(() => {
    // Skip entirely on mobile - too cluttered
    if (!enabled || seasonId === 'default' || isMobile) return [];
    
    const palette = getPalette(seasonId);
    // Reduce count on tablet, normal on desktop
    const baseDensity = isTablet ? Math.max(1, Math.floor((density === 'dense' ? 5 : density === 'medium' ? 3 : 2) * 0.5)) : (density === 'dense' ? 3 : density === 'medium' ? 2 : 1);
    const perCorner = baseDensity;
    const cornerSize = isTablet ? 80 : 100;
    const result: Array<{
      id: string;
      type: 'ball' | 'star';
      x: number;
      y: number;
      color: string;
      size: number;
      metallic: boolean;
      pattern: 'solid' | 'stripe' | 'dots' | 'swirl';
      animation: 'twinkle' | 'sway' | 'bounce' | 'float';
      delay: number;
    }> = [];
    
    const corners = [
      { baseX: 10, baseY: 10 },
      { baseX: windowSize.w - cornerSize - 10, baseY: 10 },
      { baseX: 10, baseY: windowSize.h - cornerSize - 70 },
      { baseX: windowSize.w - cornerSize - 10, baseY: windowSize.h - cornerSize - 70 },
    ];
    
    const patterns: ('solid' | 'stripe' | 'dots' | 'swirl')[] = ['solid', 'stripe', 'dots', 'swirl'];
    const animations: ('twinkle' | 'sway' | 'bounce' | 'float')[] = ['twinkle', 'sway', 'bounce', 'float'];
    
    corners.forEach((corner, cornerIndex) => {
      for (let i = 0; i < perCorner; i++) {
        const isStar = Math.random() > 0.7;
        const colors = [...palette.primary, ...palette.metallic];
        
        result.push({
          id: `corner-${cornerIndex}-${i}`,
          type: isStar ? 'star' : 'ball',
          x: corner.baseX + Math.random() * (cornerSize - 40),
          y: corner.baseY + Math.random() * (cornerSize - 40),
          color: colors[Math.floor(Math.random() * colors.length)],
          size: isTablet ? 20 + Math.random() * 12 : 24 + Math.random() * 14,
          metallic: Math.random() > 0.5,
          pattern: patterns[Math.floor(Math.random() * patterns.length)],
          animation: animations[Math.floor(Math.random() * animations.length)],
          delay: cornerIndex * 0.3 + i * 0.15,
        });
      }
    });
    
    return result;
  }, [enabled, seasonId, density, windowSize, isMobile, isTablet]);
  
  if (!enabled || ornaments.length === 0) return null;
  
  return (
    <div 
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 9996 }}
      data-testid="corner-ornaments"
    >
      {ornaments.map(orn => (
        <div
          key={orn.id}
          className="absolute"
          style={{
            left: orn.x,
            top: orn.y,
            animationDelay: `${orn.delay}s`,
          }}
        >
          {orn.type === 'ball' ? (
            <OrnamentBall
              hue={orn.color}
              size={orn.size}
              metallic={orn.metallic}
              pattern={orn.pattern}
              animation={orn.animation}
            />
          ) : (
            <FacetedStar
              color={orn.color}
              size={orn.size}
              points={Math.random() > 0.5 ? 5 : 6}
              glow
              animation={orn.animation}
            />
          )}
        </div>
      ))}
    </div>
  );
});

// Header garland scene - lights across the top
const HeaderGarlandScene = memo(function HeaderGarlandScene() {
  const { seasonId } = useSeasonalTheme();
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  
  useEffect(() => {
    injectKeyframes();
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Skip header garland on mobile for clean look
  const isMobile = windowWidth < MOBILE_THRESHOLD;
  const isChristmas = seasonId === 'christmas';
  if (!isChristmas || isMobile) return null;
  
  const palette = getPalette(seasonId);
  // Reduce light density for polished look
  const lightCount = Math.ceil(windowWidth / 80);
  
  return (
    <div
      className="fixed top-0 left-0 right-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 9995, height: 50 }}
      data-testid="header-garland"
    >
      <LightString
        colors={palette.primary}
        count={lightCount}
        spacing={50}
        droop={12}
        animated
      />
    </div>
  );
});

// Snow overlay scene - falling snowflakes
const SnowOverlayScene = memo(function SnowOverlayScene() {
  const { seasonId } = useSeasonalTheme();
  const { type: effectType } = useSeasonalEffect();
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [flakes, setFlakes] = useState<Array<{
    id: number;
    x: number;
    y: number;
    size: number;
    speed: number;
    complexity: 'simple' | 'medium' | 'complex';
    opacity: number;
    rotation: number;
    rotationSpeed: number;
  }>>([]);
  
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Reduce snow on mobile for polished look
  const isMobile = windowWidth < MOBILE_THRESHOLD;
  const isTablet = windowWidth < TABLET_THRESHOLD;
  const isWinter = seasonId === 'winter' || seasonId === 'christmas' || seasonId === 'newYear';
  const showSnow = effectType === 'snowfall' || effectType === 'snowPiles';
  
  useEffect(() => {
    if (!isWinter || !showSnow) {
      setFlakes([]);
      return;
    }
    
    injectKeyframes();
    
    // Reduce snowflake count and size for mobile/tablet
    const flakeCount = isMobile ? 6 : isTablet ? 12 : 18;
    const baseSize = isMobile ? 8 : isTablet ? 10 : 12;
    const sizeRange = isMobile ? 12 : isTablet ? 16 : 20;
    const complexities: ('simple' | 'medium' | 'complex')[] = isMobile ? ['simple'] : ['simple', 'medium', 'complex'];
    const initialFlakes = Array.from({ length: flakeCount }, (_, i) => ({
      id: i,
      x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1200),
      y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 800),
      size: baseSize + Math.random() * sizeRange,
      speed: 0.2 + Math.random() * 0.5,
      complexity: complexities[Math.floor(Math.random() * complexities.length)],
      opacity: 0.4 + Math.random() * 0.3,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 1.5,
    }));
    setFlakes(initialFlakes);
    
    let animFrame: number;
    const animate = () => {
      setFlakes(prev => prev.map(flake => {
        let newY = flake.y + flake.speed;
        let newX = flake.x + Math.sin(flake.y * 0.02) * 0.3;
        let newRotation = flake.rotation + flake.rotationSpeed;
        
        if (newY > (typeof window !== 'undefined' ? window.innerHeight : 800) + 50) {
          newY = -50;
          newX = Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1200);
        }
        
        return { ...flake, x: newX, y: newY, rotation: newRotation };
      }));
      animFrame = requestAnimationFrame(animate);
    };
    
    animFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrame);
  }, [isWinter, showSnow, isMobile, isTablet]);
  
  if (!isWinter || !showSnow || flakes.length === 0) return null;
  
  return (
    <div 
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 9993 }}
      data-testid="snow-overlay"
    >
      {flakes.map(flake => (
        <div
          key={flake.id}
          className="absolute"
          style={{
            left: flake.x,
            top: flake.y,
            transform: `translate(-50%, -50%) rotate(${flake.rotation}deg)`,
          }}
        >
          <Snowflake
            size={flake.size}
            complexity={flake.complexity}
            opacity={flake.opacity}
          />
        </div>
      ))}
    </div>
  );
});

// Santa flyover scene
interface SparkleParticle {
  id: number;
  x: number;
  y: number;
  opacity: number;
  size: number;
  color: string;
}

const SantaFlyoverScene = memo(function SantaFlyoverScene() {
  const { seasonId } = useSeasonalTheme();
  const [isFlying, setIsFlying] = useState(false);
  const [position, setPosition] = useState({ x: -200, y: 80 });
  const [sparkles, setSparkles] = useState<SparkleParticle[]>([]);
  const [direction, setDirection] = useState<'ltr' | 'rtl'>('ltr');
  const sparkleIdRef = React.useRef(0);
  const timeoutsRef = React.useRef<number[]>([]);
  
  const isChristmas = seasonId === 'christmas';
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const santaSize = isMobile ? 90 : 140;
  
  useEffect(() => {
    if (!isChristmas) return;
    
    injectKeyframes();
    
    const clearAllTimeouts = () => {
      timeoutsRef.current.forEach(t => clearTimeout(t));
      timeoutsRef.current = [];
    };
    
    const scheduleNextFlyover = () => {
      const delay = 30000 + Math.random() * 60000;
      
      const timeout = window.setTimeout(() => {
        setDirection(Math.random() > 0.5 ? 'ltr' : 'rtl');
        setIsFlying(true);
        
        const endTimeout = window.setTimeout(() => {
          setIsFlying(false);
          scheduleNextFlyover();
        }, 12000);
        timeoutsRef.current.push(endTimeout);
      }, delay);
      
      timeoutsRef.current.push(timeout);
    };
    
    // Initial flyover
    setDirection('ltr');
    setIsFlying(true);
    
    const initialTimeout = window.setTimeout(() => {
      setIsFlying(false);
      scheduleNextFlyover();
    }, 12000);
    timeoutsRef.current.push(initialTimeout);
    
    return () => {
      clearAllTimeouts();
    };
  }, [isChristmas]);
  
  useEffect(() => {
    if (!isFlying) {
      setPosition({ x: direction === 'ltr' ? -200 : (typeof window !== 'undefined' ? window.innerWidth : 1200) + 200, y: 50 + Math.random() * 60 });
      setSparkles([]);
      return;
    }
    
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const startX = direction === 'ltr' ? -200 : windowWidth + 200;
    const endX = direction === 'ltr' ? windowWidth + 200 : -200;
    const startTime = Date.now();
    const duration = 12000;
    const baseY = 50 + Math.random() * 60;
    
    let animFrame: number;
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const eased = 0.5 - 0.5 * Math.cos(progress * Math.PI);
      const currentX = startX + (endX - startX) * eased;
      
      const wave = Math.sin(progress * Math.PI * 4) * 15;
      const currentY = baseY + wave;
      
      setPosition({ x: currentX, y: currentY });
      
      // Create sparkle trail
      if (Math.random() > 0.4) {
        const sparkleColors = ['#ffd700', '#ff6b6b', '#38bdf8', '#ffffff', '#f4c15d', '#a855f7', '#22c55e'];
        const newSparkle: SparkleParticle = {
          id: sparkleIdRef.current++,
          x: currentX - (direction === 'ltr' ? 60 : -60) + Math.random() * 40 - 20,
          y: currentY + 25 + Math.random() * 20,
          opacity: 1,
          size: 4 + Math.random() * 8,
          color: sparkleColors[Math.floor(Math.random() * sparkleColors.length)]
        };
        
        setSparkles(prev => [...prev.slice(-50), newSparkle]);
      }
      
      setSparkles(prev => 
        prev
          .map(s => ({ ...s, opacity: s.opacity - 0.012, y: s.y + 0.6 }))
          .filter(s => s.opacity > 0)
      );
      
      if (progress < 1) {
        animFrame = requestAnimationFrame(animate);
      }
    };
    
    animFrame = requestAnimationFrame(animate);
    
    return () => {
      if (animFrame) {
        cancelAnimationFrame(animFrame);
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
      
      {/* SVG Santa sleigh */}
      {isFlying && (
        <div
          className="absolute"
          style={{
            left: position.x,
            top: position.y,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <SantaSleigh size={santaSize} direction={direction} />
        </div>
      )}
    </div>
  );
});

// Winter background overlay
const WinterBackgroundScene = memo(function WinterBackgroundScene() {
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

// Scene registry mapping
const SCENE_COMPONENTS: Record<SceneId, React.ComponentType> = {
  'corner-cluster': CornerClusterScene,
  'header-garland': HeaderGarlandScene,
  'inline-accent': () => null, // TODO: Implement inline accent scene
  'snow-overlay': SnowOverlayScene,
  'santa-flyover': SantaFlyoverScene,
  'full-festive': () => null, // Composite scene handled separately
};

// Hook to use a specific ornament scene
export function useOrnamentScene(sceneId: SceneId) {
  const { seasonId, effectsEnabled } = useSeasonalTheme();
  const { enabled: ornamentsEnabled, density } = useSeasonalOrnaments();
  
  const SceneComponent = SCENE_COMPONENTS[sceneId];
  
  return {
    Component: SceneComponent,
    isActive: effectsEnabled && (sceneId === 'snow-overlay' || ornamentsEnabled),
    seasonId,
    density,
  };
}

// Hook for seasonal effect controller
export function useSeasonalEffectController() {
  const theme = useSeasonalTheme();
  const { type: effectType } = useSeasonalEffect();
  const ornaments = useSeasonalOrnaments();
  
  return {
    seasonId: theme.seasonId,
    effectsEnabled: theme.effectsEnabled,
    effectType,
    ornamentsConfig: ornaments,
  };
}

// Main orchestrated scene renderer
export const OrnamentSceneRenderer = memo(function OrnamentSceneRenderer({ sceneId, className }: SceneProps) {
  const { Component, isActive } = useOrnamentScene(sceneId);
  
  if (!isActive) return null;
  
  return (
    <div className={className}>
      <Component />
    </div>
  );
});

// Full festive composite scene - renders all seasonal effects
export const FullFestiveScene = memo(function FullFestiveScene() {
  const { seasonId, effectsEnabled } = useSeasonalTheme();
  
  if (!effectsEnabled || seasonId === 'default') return null;
  
  const isWinter = seasonId === 'winter' || seasonId === 'christmas' || seasonId === 'newYear';
  const isChristmas = seasonId === 'christmas';
  
  return (
    <>
      {isWinter && <WinterBackgroundScene />}
      <SnowOverlayScene />
      {isChristmas && <HeaderGarlandScene />}
      {isChristmas && <SantaFlyoverScene />}
      <CornerClusterScene />
    </>
  );
});

// React import for useRef
import * as React from 'react';
