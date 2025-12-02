/**
 * Ornament Primitives - Procedural SVG/CSS ornament graphics
 * 
 * Pure code-based ornaments with no external images:
 * - OrnamentBall: Glossy spherical ornament with gradient highlights
 * - FacetedStar: Multi-pointed star with crystalline facets
 * - ChristmasLight: Vintage filament bulb on wire
 * - Snowflake: Crystalline ice pattern
 * - SantaSleigh: Stylized SVG Santa and reindeer silhouette
 * - Garland: CSS-based decorative garland/tinsel
 */

import { memo, useMemo } from 'react';

// Animation tokens for reusable effects
export const ANIMATION_TOKENS = {
  twinkle: 'ornamentTwinkle 2s ease-in-out infinite',
  sway: 'ornamentSway 3s ease-in-out infinite',
  bounce: 'ornamentBounce 2s ease-in-out infinite',
  glow: 'ornamentGlow 1.5s ease-in-out infinite alternate',
  spin: 'ornamentSpin 8s linear infinite',
  float: 'ornamentFloat 4s ease-in-out infinite',
} as const;

// Ornament color palettes
export const ORNAMENT_PALETTES = {
  christmas: {
    primary: ['#c41e3a', '#228b22', '#ffd700', '#1e90ff', '#9400d3'],
    metallic: ['#ffd700', '#c0c0c0', '#cd7f32'],
    accent: ['#ff6b6b', '#4ecdc4', '#ffe66d'],
  },
  winter: {
    primary: ['#87ceeb', '#e0ffff', '#b0e0e6', '#add8e6'],
    metallic: ['#c0c0c0', '#e8e8e8', '#b8c5d6'],
    accent: ['#ffffff', '#f0f8ff', '#e6f3ff'],
  },
  newYear: {
    primary: ['#ffd700', '#c0c0c0', '#1e1e1e', '#4a0080'],
    metallic: ['#ffd700', '#e8c547', '#c0a030'],
    accent: ['#ff69b4', '#00ff7f', '#7b68ee'],
  },
} as const;

export type OrnamentPalette = keyof typeof ORNAMENT_PALETTES;

interface OrnamentBallProps {
  hue: string;
  size?: number;
  metallic?: boolean;
  pattern?: 'solid' | 'stripe' | 'dots' | 'swirl';
  animation?: keyof typeof ANIMATION_TOKENS;
  className?: string;
}

export const OrnamentBall = memo(function OrnamentBall({
  hue,
  size = 40,
  metallic = false,
  pattern = 'solid',
  animation,
  className = '',
}: OrnamentBallProps) {
  const id = useMemo(() => `ornament-${Math.random().toString(36).substr(2, 9)}`, []);
  
  const metallicGradient = metallic ? (
    <linearGradient id={`${id}-metallic`} x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="rgba(255,255,255,0.8)" />
      <stop offset="30%" stopColor="rgba(255,255,255,0.3)" />
      <stop offset="70%" stopColor="rgba(0,0,0,0.1)" />
      <stop offset="100%" stopColor="rgba(0,0,0,0.3)" />
    </linearGradient>
  ) : null;

  const patternElement = useMemo(() => {
    switch (pattern) {
      case 'stripe':
        return (
          <pattern id={`${id}-pattern`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255,255,255,0.3)" strokeWidth="4" />
          </pattern>
        );
      case 'dots':
        return (
          <pattern id={`${id}-pattern`} width="10" height="10" patternUnits="userSpaceOnUse">
            <circle cx="5" cy="5" r="2" fill="rgba(255,255,255,0.4)" />
          </pattern>
        );
      case 'swirl':
        return (
          <pattern id={`${id}-pattern`} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M0,10 Q5,0 10,10 Q15,20 20,10" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
          </pattern>
        );
      default:
        return null;
    }
  }, [pattern, id]);

  return (
    <svg
      width={size}
      height={size + 8}
      viewBox="0 0 40 48"
      className={className}
      style={{
        animation: animation ? ANIMATION_TOKENS[animation] : undefined,
        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))',
      }}
    >
      <defs>
        <radialGradient id={`${id}-main`} cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor={hue} stopOpacity="1">
            <animate attributeName="stop-color" values={`${hue};${adjustBrightness(hue, 20)};${hue}`} dur="3s" repeatCount="indefinite" />
          </stop>
          <stop offset="60%" stopColor={adjustBrightness(hue, -20)} stopOpacity="1" />
          <stop offset="100%" stopColor={adjustBrightness(hue, -40)} stopOpacity="1" />
        </radialGradient>
        <radialGradient id={`${id}-highlight`} cx="25%" cy="25%" r="30%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        {metallicGradient}
        {patternElement}
      </defs>
      
      {/* Cap/hanger */}
      <rect x="16" y="0" width="8" height="6" rx="1" fill="#c0a030" />
      <ellipse cx="20" cy="2" rx="4" ry="2" fill="#ffd700" />
      <circle cx="20" cy="1" r="3" fill="none" stroke="#8b7355" strokeWidth="1.5" />
      
      {/* Main ornament body */}
      <circle cx="20" cy="28" r="18" fill={`url(#${id}-main)`} />
      
      {/* Pattern overlay */}
      {pattern !== 'solid' && (
        <circle cx="20" cy="28" r="18" fill={`url(#${id}-pattern)`} />
      )}
      
      {/* Metallic sheen */}
      {metallic && (
        <circle cx="20" cy="28" r="18" fill={`url(#${id}-metallic)`} />
      )}
      
      {/* Highlight reflection */}
      <circle cx="20" cy="28" r="18" fill={`url(#${id}-highlight)`} />
      
      {/* Specular highlight */}
      <ellipse cx="14" cy="22" rx="4" ry="3" fill="rgba(255,255,255,0.7)" />
    </svg>
  );
});

interface FacetedStarProps {
  color: string;
  size?: number;
  points?: 5 | 6 | 8;
  glow?: boolean;
  animation?: keyof typeof ANIMATION_TOKENS;
  className?: string;
}

export const FacetedStar = memo(function FacetedStar({
  color,
  size = 40,
  points = 5,
  glow = false,
  animation,
  className = '',
}: FacetedStarProps) {
  const id = useMemo(() => `star-${Math.random().toString(36).substr(2, 9)}`, []);
  
  const starPath = useMemo(() => {
    const cx = 20, cy = 20;
    const outerR = 18, innerR = points === 5 ? 8 : points === 6 ? 9 : 10;
    const pathPoints: string[] = [];
    
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (Math.PI / points) * i - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      pathPoints.push(`${i === 0 ? 'M' : 'L'}${x},${y}`);
    }
    pathPoints.push('Z');
    return pathPoints.join(' ');
  }, [points]);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={className}
      style={{
        animation: animation ? ANIMATION_TOKENS[animation] : undefined,
        filter: glow 
          ? `drop-shadow(0 0 8px ${color}) drop-shadow(0 0 16px ${color})`
          : 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
      }}
    >
      <defs>
        <linearGradient id={`${id}-facet`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={adjustBrightness(color, 40)} />
          <stop offset="50%" stopColor={color} />
          <stop offset="100%" stopColor={adjustBrightness(color, -30)} />
        </linearGradient>
        <filter id={`${id}-glow`}>
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      
      <path 
        d={starPath} 
        fill={`url(#${id}-facet)`}
        filter={glow ? `url(#${id}-glow)` : undefined}
      >
        {glow && (
          <animate 
            attributeName="opacity" 
            values="0.8;1;0.8" 
            dur="1.5s" 
            repeatCount="indefinite" 
          />
        )}
      </path>
      
      {/* Highlight facets */}
      <path 
        d={starPath} 
        fill="none" 
        stroke="rgba(255,255,255,0.5)" 
        strokeWidth="0.5"
      />
    </svg>
  );
});

interface ChristmasLightProps {
  color: string;
  size?: number;
  lit?: boolean;
  style?: 'vintage' | 'modern' | 'icicle';
  animation?: keyof typeof ANIMATION_TOKENS;
  className?: string;
}

export const ChristmasLight = memo(function ChristmasLight({
  color,
  size = 24,
  lit = true,
  style = 'vintage',
  animation,
  className = '',
}: ChristmasLightProps) {
  const id = useMemo(() => `light-${Math.random().toString(36).substr(2, 9)}`, []);
  
  const bulbShape = useMemo(() => {
    switch (style) {
      case 'modern':
        return <ellipse cx="12" cy="18" rx="6" ry="8" />;
      case 'icicle':
        return <path d="M12,10 Q8,16 10,24 L12,28 L14,24 Q16,16 12,10 Z" />;
      default: // vintage
        return <path d="M12,10 Q6,14 6,20 Q6,26 12,26 Q18,26 18,20 Q18,14 12,10 Z" />;
    }
  }, [style]);

  return (
    <svg
      width={size}
      height={size * 1.4}
      viewBox="0 0 24 34"
      className={className}
      style={{
        animation: animation ? ANIMATION_TOKENS[animation] : undefined,
        filter: lit 
          ? `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 12px ${color})`
          : 'none',
      }}
    >
      <defs>
        <radialGradient id={`${id}-glow`} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor={adjustBrightness(color, 60)} stopOpacity={lit ? 1 : 0.3}>
            {lit && (
              <animate 
                attributeName="stop-opacity" 
                values="1;0.7;1" 
                dur="0.8s" 
                repeatCount="indefinite" 
              />
            )}
          </stop>
          <stop offset="60%" stopColor={color} stopOpacity={lit ? 0.9 : 0.5} />
          <stop offset="100%" stopColor={adjustBrightness(color, -20)} stopOpacity={lit ? 0.8 : 0.4} />
        </radialGradient>
      </defs>
      
      {/* Socket/base */}
      <rect x="9" y="2" width="6" height="8" rx="1" fill="#2a2a2a" />
      <rect x="10" y="4" width="4" height="4" rx="0.5" fill="#3a3a3a" />
      
      {/* Wire connection points */}
      <circle cx="6" cy="4" r="2" fill="#1a1a1a" />
      <circle cx="18" cy="4" r="2" fill="#1a1a1a" />
      
      {/* Bulb */}
      <g fill={`url(#${id}-glow)`}>
        {bulbShape}
      </g>
      
      {/* Glass highlight */}
      <ellipse cx="9" cy="16" rx="2" ry="3" fill="rgba(255,255,255,0.4)" />
    </svg>
  );
});

interface SnowflakeProps {
  size?: number;
  complexity?: 'simple' | 'medium' | 'complex';
  opacity?: number;
  animation?: keyof typeof ANIMATION_TOKENS;
  className?: string;
}

export const Snowflake = memo(function Snowflake({
  size = 30,
  complexity = 'medium',
  opacity = 0.9,
  animation,
  className = '',
}: SnowflakeProps) {
  const arms = complexity === 'simple' ? 6 : complexity === 'medium' ? 6 : 8;
  const branches = complexity === 'simple' ? 0 : complexity === 'medium' ? 2 : 3;
  
  const snowflakePath = useMemo(() => {
    const paths: string[] = [];
    const cx = 15, cy = 15, length = 12;
    
    for (let i = 0; i < arms; i++) {
      const angle = (Math.PI * 2 / arms) * i - Math.PI / 2;
      const endX = cx + length * Math.cos(angle);
      const endY = cy + length * Math.sin(angle);
      
      // Main arm
      paths.push(`M${cx},${cy} L${endX},${endY}`);
      
      // Branches
      for (let b = 1; b <= branches; b++) {
        const branchStart = 0.3 + (b * 0.2);
        const branchLength = 4 - b;
        const bx = cx + (length * branchStart) * Math.cos(angle);
        const by = cy + (length * branchStart) * Math.sin(angle);
        
        const leftAngle = angle - Math.PI / 4;
        const rightAngle = angle + Math.PI / 4;
        
        paths.push(`M${bx},${by} L${bx + branchLength * Math.cos(leftAngle)},${by + branchLength * Math.sin(leftAngle)}`);
        paths.push(`M${bx},${by} L${bx + branchLength * Math.cos(rightAngle)},${by + branchLength * Math.sin(rightAngle)}`);
      }
    }
    
    return paths.join(' ');
  }, [arms, branches]);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 30 30"
      className={className}
      style={{
        animation: animation ? ANIMATION_TOKENS[animation] : undefined,
        opacity,
        filter: 'drop-shadow(0 0 3px rgba(255,255,255,0.5))',
      }}
    >
      <path
        d={snowflakePath}
        fill="none"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Center crystal */}
      <circle cx="15" cy="15" r="2" fill="white" opacity="0.8" />
    </svg>
  );
});

interface SantaSleighProps {
  size?: number;
  direction?: 'ltr' | 'rtl';
  className?: string;
}

export const SantaSleigh = memo(function SantaSleigh({
  size = 120,
  direction = 'ltr',
  className = '',
}: SantaSleighProps) {
  return (
    <svg
      width={size}
      height={size * 0.5}
      viewBox="0 0 120 60"
      className={className}
      style={{
        transform: direction === 'ltr' ? 'scaleX(-1)' : undefined,
        filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))',
      }}
    >
      <defs>
        <style>
          {`
            @keyframes reindeerGallop1 {
              0%, 100% { transform: rotate(0deg); }
              25% { transform: rotate(-15deg); }
              50% { transform: rotate(0deg); }
              75% { transform: rotate(15deg); }
            }
            @keyframes reindeerGallop2 {
              0%, 100% { transform: rotate(0deg); }
              25% { transform: rotate(15deg); }
              50% { transform: rotate(0deg); }
              75% { transform: rotate(-15deg); }
            }
            @keyframes reindeerBob {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-2px); }
            }
            .reindeer-body { animation: reindeerBob 0.3s ease-in-out infinite; }
            .leg-front-1 { transform-origin: 10px 40px; animation: reindeerGallop1 0.3s ease-in-out infinite; }
            .leg-back-1 { transform-origin: 18px 40px; animation: reindeerGallop2 0.3s ease-in-out infinite; }
            .leg-front-2 { transform-origin: 30px 40px; animation: reindeerGallop1 0.3s ease-in-out infinite 0.15s; }
            .leg-back-2 { transform-origin: 38px 40px; animation: reindeerGallop2 0.3s ease-in-out infinite 0.15s; }
          `}
        </style>
      </defs>
      
      {/* Reindeer silhouette with animated legs */}
      <g fill="#4a3728">
        {/* Lead reindeer body */}
        <g className="reindeer-body">
          <ellipse cx="15" cy="35" rx="8" ry="5" />
          <circle cx="10" cy="30" r="4" />
          {/* Antlers */}
          <path d="M6,26 L2,20 M8,26 L6,18 M14,26 L18,20 M12,26 L14,18" stroke="#4a3728" strokeWidth="1.5" fill="none" />
        </g>
        {/* Animated legs - lead reindeer */}
        <g className="leg-front-1">
          <line x1="10" y1="40" x2="8" y2="48" stroke="#4a3728" strokeWidth="2" />
        </g>
        <g className="leg-back-1">
          <line x1="18" y1="40" x2="20" y2="48" stroke="#4a3728" strokeWidth="2" />
        </g>
        
        {/* Second reindeer body */}
        <g className="reindeer-body" style={{ animationDelay: '0.15s' }}>
          <ellipse cx="35" cy="35" rx="8" ry="5" />
          <circle cx="30" cy="30" r="4" />
          <path d="M26,26 L22,20 M28,26 L26,18 M34,26 L38,20 M32,26 L34,18" stroke="#4a3728" strokeWidth="1.5" fill="none" />
        </g>
        {/* Animated legs - second reindeer */}
        <g className="leg-front-2">
          <line x1="30" y1="40" x2="28" y2="48" stroke="#4a3728" strokeWidth="2" />
        </g>
        <g className="leg-back-2">
          <line x1="38" y1="40" x2="40" y2="48" stroke="#4a3728" strokeWidth="2" />
        </g>
      </g>
      
      {/* Reins */}
      <path d="M22,35 Q40,32 55,38" stroke="#8b4513" strokeWidth="1" fill="none" />
      
      {/* Sleigh body */}
      <path 
        d="M50,45 Q45,50 50,55 L105,55 Q115,55 115,45 L115,35 Q115,30 105,30 L60,30 Q50,30 50,40 Z" 
        fill="#c41e3a"
        stroke="#8b0000"
        strokeWidth="2"
      />
      
      {/* Sleigh runners */}
      <path 
        d="M48,56 Q45,58 50,60 L110,60 Q120,58 115,56" 
        fill="none"
        stroke="#ffd700"
        strokeWidth="3"
      />
      
      {/* Santa silhouette - facing travel direction */}
      <g fill="#c41e3a">
        {/* Body */}
        <ellipse cx="80" cy="35" rx="12" ry="15" />
        {/* Head - positioned to face forward */}
        <circle cx="75" cy="18" r="8" fill="#ffd5c8" />
        {/* Hat */}
        <path d="M67,18 Q67,8 75,5 Q83,8 83,18 Z" fill="#c41e3a" />
        <ellipse cx="75" cy="18" rx="10" ry="3" fill="white" />
        <circle cx="75" cy="5" r="3" fill="white" />
        {/* Beard */}
        <ellipse cx="72" cy="24" rx="6" ry="4" fill="white" />
        {/* Arm waving */}
        <ellipse cx="68" cy="30" rx="4" ry="8" fill="#c41e3a" transform="rotate(-30 68 30)">
          <animateTransform 
            attributeName="transform" 
            type="rotate" 
            values="-30 68 30;-45 68 30;-30 68 30" 
            dur="0.5s" 
            repeatCount="indefinite"
          />
        </ellipse>
      </g>
      
      {/* Gift sack */}
      <ellipse cx="100" cy="35" rx="10" ry="12" fill="#8b4513" />
      <path d="M92,28 Q100,20 108,28" stroke="#654321" strokeWidth="2" fill="none" />
      
      {/* Rudolph's nose glow */}
      <circle cx="6" cy="32" r="2" fill="#ff0000">
        <animate attributeName="opacity" values="1;0.5;1" dur="0.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
});

interface LightStringProps {
  colors: string[];
  count?: number;
  spacing?: number;
  droop?: number;
  animated?: boolean;
  className?: string;
}

export const LightString = memo(function LightString({
  colors,
  count = 12,
  spacing = 40,
  droop = 15,
  animated = true,
  className = '',
}: LightStringProps) {
  const width = count * spacing;
  const points = useMemo(() => {
    const pts: Array<{ x: number; y: number; color: string }> = [];
    for (let i = 0; i < count; i++) {
      const x = spacing / 2 + i * spacing;
      const progress = i / (count - 1);
      const y = 10 + droop * Math.sin(progress * Math.PI);
      pts.push({ x, y, color: colors[i % colors.length] });
    }
    return pts;
  }, [count, spacing, droop, colors]);

  const wirePath = useMemo(() => {
    if (points.length < 2) return '';
    let path = `M${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2;
      const midY = Math.max(prev.y, curr.y) + 5;
      path += ` Q${midX},${midY} ${curr.x},${curr.y}`;
    }
    return path;
  }, [points]);

  return (
    <svg
      width={width}
      height={droop + 40}
      viewBox={`0 0 ${width} ${droop + 40}`}
      className={className}
      style={{ overflow: 'visible' }}
    >
      {/* Wire */}
      <path 
        d={wirePath} 
        fill="none" 
        stroke="#1a1a1a" 
        strokeWidth="2"
      />
      
      {/* Light bulbs */}
      {points.map((pt, i) => (
        <g key={i} transform={`translate(${pt.x}, ${pt.y})`}>
          {/* Socket */}
          <rect x="-3" y="-2" width="6" height="6" rx="1" fill="#2a2a2a" />
          {/* Bulb */}
          <ellipse 
            cx="0" 
            cy="12" 
            rx="5" 
            ry="8" 
            fill={pt.color}
            style={{
              filter: `drop-shadow(0 0 6px ${pt.color})`,
            }}
          >
            {animated && (
              <animate 
                attributeName="opacity" 
                values="1;0.6;1" 
                dur={`${0.8 + (i % 3) * 0.3}s`}
                begin={`${i * 0.1}s`}
                repeatCount="indefinite" 
              />
            )}
          </ellipse>
          {/* Highlight */}
          <ellipse cx="-2" cy="10" rx="1.5" ry="2" fill="rgba(255,255,255,0.5)" />
        </g>
      ))}
    </svg>
  );
});

// Helper function to adjust color brightness
function adjustBrightness(color: string, amount: number): string {
  const hex = color.replace('#', '');
  const num = parseInt(hex, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// Global animation keyframes (inject once)
export const ORNAMENT_KEYFRAMES = `
  @keyframes ornamentTwinkle {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(0.95); }
  }
  @keyframes ornamentSway {
    0%, 100% { transform: rotate(-5deg); }
    50% { transform: rotate(5deg); }
  }
  @keyframes ornamentBounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
  }
  @keyframes ornamentGlow {
    0% { filter: drop-shadow(0 0 4px currentColor); }
    100% { filter: drop-shadow(0 0 12px currentColor); }
  }
  @keyframes ornamentSpin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes ornamentFloat {
    0%, 100% { transform: translateY(0) rotate(-2deg); }
    50% { transform: translateY(-10px) rotate(2deg); }
  }
`;
