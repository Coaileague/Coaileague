/**
 * OrnamentSceneRegistry - Declarative scene compositions for page-level integration
 * 
 * Maps scene IDs to ornament compositions that can be mounted at various page locations.
 * Scenes read from SeasonalThemeContext and AI Brain orchestrator directives.
 */

import { memo, useMemo, useEffect, useState, useCallback } from 'react';
import { useSeasonalTheme, useSeasonalOrnaments, useSeasonalEffect, type SeasonId } from '@/context/SeasonalThemeContext';
import { getSantaConfig } from '@/config/seasonalThemes';
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
import { ornamentExclusionScanner, type ExclusionZone } from './OrnamentExclusionScanner';

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

// Grid-aligned corner positions for polished, non-jumbled look
// Uses deterministic placement based on index for consistency
// NOTE: Bottom-right corner is SKIPPED to avoid mascot area
const CORNER_GRID_POSITIONS = [
  // Top-left corner: SKIP - too close to logo area
  [],
  // Top-right corner: SKIP - too close to CTA/login buttons
  [],
  // Bottom-left corner: safe zone for ornaments
  [{ x: 12, y: -12 }, { x: 35, y: -25 }],
  // Bottom-right corner: SKIP - mascot lives here
  [],
];

// Fixed ornament configurations for each position (no randomness in rendering)
const ORNAMENT_CONFIGS = [
  { type: 'ball' as const, pattern: 'stripe' as const, animation: 'sway' as const, points: 5 },
  { type: 'star' as const, pattern: 'solid' as const, animation: 'twinkle' as const, points: 6 },
  { type: 'ball' as const, pattern: 'dots' as const, animation: 'float' as const, points: 5 },
];

// Corner cluster scene - ornaments in corners of the viewport with grid-aligned placement
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
  
  // Skip on mobile for clean polished look
  const isMobile = windowSize.w < MOBILE_THRESHOLD;
  const isTablet = windowSize.w < TABLET_THRESHOLD;
  
  const ornaments = useMemo(() => {
    // Skip on default season only - mobile gets lighter decorations
    if (!enabled || seasonId === 'default') return [];
    
    const palette = getPalette(seasonId);
    // Determine count per corner based on density - mobile gets minimal decorations
    const basePerCorner = density === 'dense' ? 3 : density === 'medium' ? 2 : 1;
    const perCorner = isMobile ? Math.min(1, basePerCorner) : basePerCorner;
    // Scale for mobile/tablet
    const sizeScale = isMobile ? 0.7 : isTablet ? 0.85 : 1;
    const posScale = isMobile ? 0.6 : isTablet ? 0.8 : 1;
    
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
      points: number;
      delay: number;
    }> = [];
    
    const colors = [...palette.primary, ...palette.metallic];
    
    // Process each corner with grid-aligned positions
    CORNER_GRID_POSITIONS.forEach((positions, cornerIndex) => {
      const isRight = cornerIndex === 1 || cornerIndex === 3;
      const isBottom = cornerIndex === 2 || cornerIndex === 3;
      
      for (let i = 0; i < Math.min(perCorner, positions.length); i++) {
        const gridPos = positions[i];
        const config = ORNAMENT_CONFIGS[i % ORNAMENT_CONFIGS.length];
        
        // Calculate absolute position from corner
        const x = isRight 
          ? windowSize.w + (gridPos.x * posScale)
          : (gridPos.x * posScale);
        const y = isBottom
          ? windowSize.h + (gridPos.y * posScale)
          : (gridPos.y * posScale);
        
        // Use deterministic color based on position
        const colorIndex = (cornerIndex + i) % colors.length;
        
        result.push({
          id: `corner-${cornerIndex}-${i}`,
          type: config.type,
          x,
          y,
          color: colors[colorIndex],
          size: (22 + i * 4) * sizeScale,
          metallic: i % 2 === 0,
          pattern: config.pattern,
          animation: config.animation,
          points: config.points,
          delay: cornerIndex * 0.2 + i * 0.1,
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
              points={orn.points as 5 | 6 | 8}
              glow
              animation={orn.animation}
            />
          )}
        </div>
      ))}
    </div>
  );
});

// Header garland scene - lights across the top with smart exclusion zones
const HeaderGarlandScene = memo(function HeaderGarlandScene() {
  const { seasonId } = useSeasonalTheme();
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [safePositions, setSafePositions] = useState<number[]>([]);
  const [exclusionZones, setExclusionZones] = useState<ExclusionZone[]>([]);
  
  useEffect(() => {
    injectKeyframes();
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Subscribe to exclusion zone updates from the centralized scanner
  useEffect(() => {
    const unsubscribe = ornamentExclusionScanner.subscribe((zones) => {
      setExclusionZones(zones);
    });
    
    // Initial scan
    ornamentExclusionScanner.scan();
    
    return unsubscribe;
  }, []);
  
  // Calculate safe light positions based on exclusion zones
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const lightSpacing = 100;
    const lightSize = 20;
    const safe: number[] = [];
    const viewportWidth = window.innerWidth;
    
    for (let x = 50; x < viewportWidth - 50; x += lightSpacing) {
      // Check if this position overlaps with any exclusion zone
      const isBlocked = exclusionZones.some(zone => {
        const zoneLeft = zone.rect.left - zone.padding;
        const zoneRight = zone.rect.right + zone.padding;
        return x >= zoneLeft - lightSize/2 && x <= zoneRight + lightSize/2;
      });
      
      if (!isBlocked) {
        safe.push(x);
      }
    }
    
    // Limit to max 8 lights for cleaner aesthetic
    setSafePositions(safe.slice(0, 8));
  }, [exclusionZones, windowWidth]);
  
  // Show header garland on all devices (mobile gets fewer lights)
  const isMobile = windowWidth < MOBILE_THRESHOLD;
  const isChristmas = seasonId === 'christmas';
  if (!isChristmas || safePositions.length === 0) return null;
  
  // Limit lights on mobile for performance
  const maxLights = isMobile ? 4 : 8;
  
  const palette = getPalette(seasonId);
  
  return (
    <div
      className="fixed top-0 left-0 right-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 9994, height: 50 }}
      data-testid="header-garland"
    >
      {/* Individual lights at safe positions only - avoiding UI elements */}
      {safePositions.slice(0, maxLights).map((x, i) => (
        <div
          key={`light-${i}`}
          className="absolute"
          style={{
            left: x,
            top: 8,
            transform: 'translateX(-50%)',
          }}
        >
          <ChristmasLight
            color={palette.primary[i % palette.primary.length]}
            size={16}
            lit
            animation="glow"
          />
        </div>
      ))}
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

interface FallingPresent {
  id: number;
  x: number;
  y: number;
  opacity: number;
  rotation: number;
  color: string;
  size: number;
  createdAt: number;
}

const SantaFlyoverScene = memo(function SantaFlyoverScene() {
  const { seasonId } = useSeasonalTheme();
  const santaConfig = getSantaConfig();
  const [isFlying, setIsFlying] = useState(false);
  const [position, setPosition] = useState({ x: -200, y: 80 });
  const [sparkles, setSparkles] = useState<SparkleParticle[]>([]);
  const [presents, setPresents] = useState<FallingPresent[]>([]);
  const [direction, setDirection] = useState<'ltr' | 'rtl'>('ltr');
  const sparkleIdRef = React.useRef(0);
  const presentIdRef = React.useRef(0);
  const timeoutsRef = React.useRef<number[]>([]);
  
  const isChristmas = seasonId === 'christmas';
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const santaSize = isMobile ? santaConfig.size.mobile : santaConfig.size.desktop;
  
  useEffect(() => {
    // Check if Santa is enabled and it's Christmas
    if (!isChristmas || !santaConfig.enabled) return;
    
    injectKeyframes();
    
    const clearAllTimeouts = () => {
      timeoutsRef.current.forEach(t => clearTimeout(t));
      timeoutsRef.current = [];
    };
    
    const scheduleNextFlyover = () => {
      // Use centralized config for timing
      const { min, max } = santaConfig.intervalRange;
      const delay = min + Math.random() * (max - min);
      
      const timeout = window.setTimeout(() => {
        setDirection(Math.random() > 0.5 ? 'ltr' : 'rtl');
        setIsFlying(true);
        
        const endTimeout = window.setTimeout(() => {
          setIsFlying(false);
          scheduleNextFlyover();
        }, santaConfig.flyoverDuration);
        timeoutsRef.current.push(endTimeout);
      }, delay);
      
      timeoutsRef.current.push(timeout);
    };
    
    // Initial flyover (if enabled in config)
    if (santaConfig.showInitialFlyover) {
      setDirection('ltr');
      setIsFlying(true);
      
      const initialTimeout = window.setTimeout(() => {
        setIsFlying(false);
        scheduleNextFlyover();
      }, santaConfig.flyoverDuration);
      timeoutsRef.current.push(initialTimeout);
    } else {
      scheduleNextFlyover();
    }
    
    return () => {
      clearAllTimeouts();
    };
  }, [isChristmas, santaConfig]);
  
  useEffect(() => {
    if (!isFlying) {
      setPosition({ x: direction === 'ltr' ? -200 : (typeof window !== 'undefined' ? window.innerWidth : 1200) + 200, y: 50 + Math.random() * 60 });
      setSparkles([]);
      return;
    }
    
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const startX = direction === 'ltr' ? -200 : windowWidth + 200;
    const endX = direction === 'ltr' ? windowWidth + 200 : -200;
    const startTime = Date.now();
    const duration = santaConfig.flyoverDuration; // Use centralized config
    const baseY = 50 + Math.random() * 60;
    const presentColors = ['#c41e3a', '#228b22', '#1e90ff', '#ffd700', '#9400d3', '#ff6b6b'];
    
    let animFrame: number;
    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
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
      
      // Drop presents occasionally (roughly every 800ms when visible)
      if (Math.random() > 0.985 && currentX > 0 && currentX < windowWidth) {
        const newPresent: FallingPresent = {
          id: presentIdRef.current++,
          x: currentX + (Math.random() * 40 - 20),
          y: currentY + 40,
          opacity: 1,
          rotation: Math.random() * 360,
          color: presentColors[Math.floor(Math.random() * presentColors.length)],
          size: 16 + Math.random() * 12,
          createdAt: now,
        };
        setPresents(prev => [...prev.slice(-20), newPresent]);
      }
      
      setSparkles(prev => 
        prev
          .map(s => ({ ...s, opacity: s.opacity - 0.012, y: s.y + 0.6 }))
          .filter(s => s.opacity > 0)
      );
      
      // Animate presents falling and fade out after 5 seconds
      setPresents(prev => 
        prev
          .map(p => {
            const age = now - p.createdAt;
            const fadeStart = 4000; // Start fading at 4 seconds
            const fadeEnd = 5000; // Fully gone at 5 seconds
            let newOpacity = p.opacity;
            
            if (age > fadeStart) {
              newOpacity = Math.max(0, 1 - (age - fadeStart) / (fadeEnd - fadeStart));
            }
            
            return {
              ...p,
              y: p.y + 1.5, // Fall speed
              rotation: p.rotation + 0.5, // Gentle tumble
              opacity: p.y > windowHeight ? 0 : newOpacity, // Also remove if off screen
            };
          })
          .filter(p => p.opacity > 0)
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
      {/* Falling presents */}
      {presents.map(present => (
        <svg
          key={present.id}
          className="absolute"
          width={present.size}
          height={present.size}
          viewBox="0 0 24 24"
          style={{
            left: present.x,
            top: present.y,
            opacity: present.opacity,
            transform: `translate(-50%, -50%) rotate(${present.rotation}deg)`,
            filter: `drop-shadow(0 2px 4px rgba(0,0,0,0.3))`,
          }}
        >
          {/* Gift box body */}
          <rect x="3" y="10" width="18" height="12" rx="1" fill={present.color} />
          {/* Gift box lid */}
          <rect x="2" y="8" width="20" height="4" rx="1" fill={present.color} />
          {/* Ribbon vertical */}
          <rect x="10.5" y="8" width="3" height="14" fill="#ffd700" />
          {/* Ribbon horizontal */}
          <rect x="2" y="13" width="20" height="3" fill="#ffd700" />
          {/* Bow center */}
          <circle cx="12" cy="6" r="2" fill="#ffd700" />
          {/* Bow loops */}
          <ellipse cx="8" cy="6" rx="3" ry="2" fill="#ffd700" />
          <ellipse cx="16" cy="6" rx="3" ry="2" fill="#ffd700" />
        </svg>
      ))}
      
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
