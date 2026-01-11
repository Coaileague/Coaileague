/**
 * Colorful Celtic Trinity Knot - 3-ribbon interwoven design
 * 
 * Features:
 * - 3 flowing interwoven ribbons forming a Celtic triquetra
 * - Vibrant gradient colors: purple, teal, gold/amber
 * - Phase-based assembly animation (like tech company logos)
 * - Glowing central nexus with subtle pulse
 * - SVG-based for crisp rendering at any size
 * 
 * This is the official Trinity brand logo throughout the platform.
 */

import { cn } from "@/lib/utils";
import { useId } from "react";

export type TrinityEmotionState = 
  | "idle"           // Subtle glow breathing
  | "thinking"       // Fast pulsing while processing
  | "success"        // Bright celebratory glow
  | "speaking"       // Rhythmic pulse while Trinity talks
  | "listening"      // Subtle attention animation
  | "warning"        // Cautionary orange/yellow pulse
  | "error"          // Red flash with shake
  | "loading"        // Smooth spinning flow
  | "happy"          // Bright bouncy animation
  | "focused";       // Intense glow

interface ColorfulCelticKnotProps {
  size?: number | "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
  animated?: boolean;
  animationSpeed?: "slow" | "normal" | "fast" | "instant";
  state?: TrinityEmotionState;
}

const sizeMap = {
  xs: 20,
  sm: 24,
  md: 32,
  lg: 48,
  xl: 64,
  "2xl": 96,
};

const speedMap = {
  slow: { glow: "4s", pulse: "3s", spin: "20s" },
  normal: { glow: "2.5s", pulse: "2s", spin: "12s" },
  fast: { glow: "1.2s", pulse: "1s", spin: "6s" },
  instant: { glow: "0.6s", pulse: "0.5s", spin: "3s" },
};

const stateModifiers: Record<TrinityEmotionState, { 
  speed: keyof typeof speedMap;
  extraClass: string;
  glowIntensity: number;
}> = {
  idle: { speed: "slow", extraClass: "", glowIntensity: 2 },
  thinking: { speed: "fast", extraClass: "animate-pulse", glowIntensity: 4 },
  success: { speed: "instant", extraClass: "animate-bounce", glowIntensity: 5 },
  speaking: { speed: "normal", extraClass: "", glowIntensity: 3 },
  listening: { speed: "slow", extraClass: "", glowIntensity: 2.5 },
  warning: { speed: "fast", extraClass: "animate-pulse", glowIntensity: 4 },
  error: { speed: "instant", extraClass: "animate-shake", glowIntensity: 3 },
  loading: { speed: "normal", extraClass: "animate-spin-slow", glowIntensity: 3 },
  happy: { speed: "fast", extraClass: "animate-bounce", glowIntensity: 4 },
  focused: { speed: "normal", extraClass: "", glowIntensity: 5 },
};

export function ColorfulCelticKnot({ 
  size = "md", 
  className,
  animated = true,
  animationSpeed,
  state = "idle"
}: ColorfulCelticKnotProps) {
  const uniqueId = useId().replace(/:/g, '-');
  const numericSize = typeof size === "number" ? size : sizeMap[size] || 32;
  
  const stateConfig = stateModifiers[state] || stateModifiers.idle;
  const effectiveSpeedKey = animationSpeed || stateConfig.speed;
  const effectiveSpeed = speedMap[effectiveSpeedKey];

  return (
    <svg 
      width={numericSize} 
      height={numericSize} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={cn("flex-shrink-0", stateConfig.extraClass, className)}
    >
      <defs>
        {/* Gradient for ribbon 1 - Purple to Magenta */}
        <linearGradient id={`ribbon1-grad-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="50%" stopColor="#c026d3" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        
        {/* Gradient for ribbon 2 - Teal to Cyan */}
        <linearGradient id={`ribbon2-grad-${uniqueId}`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#14b8a6" />
          <stop offset="50%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        
        {/* Gradient for ribbon 3 - Gold to Orange */}
        <linearGradient id={`ribbon3-grad-${uniqueId}`} x1="100%" y1="50%" x2="0%" y2="50%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="50%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
        
        {/* Center nexus gradient */}
        <radialGradient id={`nexus-grad-${uniqueId}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#e9d5ff" />
          <stop offset="100%" stopColor="#a855f7" />
        </radialGradient>
        
        {/* Glow filter - adjustable intensity */}
        <filter id={`glow-${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={stateConfig.glowIntensity} result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        
        {/* Outer glow for ribbons */}
        <filter id={`ribbon-glow-${uniqueId}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.5" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Celtic Triquetra - Three fully-formed interwoven loops */}
      <g filter={`url(#ribbon-glow-${uniqueId})`} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none">
        
        {/* Loop 1 - Top loop (purple/magenta) - always fully visible */}
        <path 
          d="M 50 15 
             C 25 15, 15 40, 25 55 
             C 32 65, 42 60, 50 50 
             C 58 60, 68 65, 75 55 
             C 85 40, 75 15, 50 15"
          stroke={`url(#ribbon1-grad-${uniqueId})`}
          opacity="1"
        >
          {animated && (
            <animate 
              attributeName="opacity" 
              values="0.85;1;0.85" 
              dur={effectiveSpeed.glow} 
              repeatCount="indefinite"
            />
          )}
        </path>
        
        {/* Loop 2 - Bottom Left loop (teal/cyan) */}
        <path 
          d="M 30 78 
             C 10 65, 15 35, 35 28 
             C 43 25, 48 35, 50 50 
             C 42 58, 32 70, 30 78 
             C 35 88, 50 85, 50 75"
          stroke={`url(#ribbon2-grad-${uniqueId})`}
          opacity="1"
        >
          {animated && (
            <animate 
              attributeName="opacity" 
              values="0.85;1;0.85" 
              dur={effectiveSpeed.glow} 
              repeatCount="indefinite"
              begin="0.3s"
            />
          )}
        </path>
        
        {/* Loop 3 - Bottom Right loop (gold/orange) */}
        <path 
          d="M 70 78 
             C 90 65, 85 35, 65 28 
             C 57 25, 52 35, 50 50 
             C 58 58, 68 70, 70 78 
             C 65 88, 50 85, 50 75"
          stroke={`url(#ribbon3-grad-${uniqueId})`}
          opacity="1"
        >
          {animated && (
            <animate 
              attributeName="opacity" 
              values="0.85;1;0.85" 
              dur={effectiveSpeed.glow} 
              repeatCount="indefinite"
              begin="0.6s"
            />
          )}
        </path>
      </g>
      
      {/* Outer energy ring - subtle rotating accent */}
      <circle 
        cx="50" 
        cy="50" 
        r="44" 
        fill="none" 
        stroke="url(#ribbon1-grad-${uniqueId})" 
        strokeWidth="1" 
        strokeDasharray="8 16 4 16"
        opacity="0.2"
      >
        {animated && (
          <animateTransform 
            attributeName="transform" 
            type="rotate" 
            from="0 50 50" 
            to="360 50 50" 
            dur={effectiveSpeed.spin} 
            repeatCount="indefinite"
          />
        )}
      </circle>
      
      {/* Secondary energy ring - counter rotation */}
      <circle 
        cx="50" 
        cy="50" 
        r="40" 
        fill="none" 
        stroke="url(#ribbon2-grad-${uniqueId})" 
        strokeWidth="0.5" 
        strokeDasharray="4 20"
        opacity="0.15"
      >
        {animated && (
          <animateTransform 
            attributeName="transform" 
            type="rotate" 
            from="360 50 50" 
            to="0 50 50" 
            dur={effectiveSpeed.spin} 
            repeatCount="indefinite"
          />
        )}
      </circle>
      
      {/* Central glowing nexus - soft pulsing core */}
      <circle 
        cx="50" 
        cy="50" 
        r="9" 
        fill={`url(#nexus-grad-${uniqueId})`} 
        filter={`url(#glow-${uniqueId})`}
      >
        {animated && (
          <>
            <animate attributeName="r" values="8;10;8" dur={effectiveSpeed.pulse} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.9;1;0.9" dur={effectiveSpeed.pulse} repeatCount="indefinite" />
          </>
        )}
      </circle>
      
      {/* Bright inner core - white center */}
      <circle cx="50" cy="50" r="4" fill="#ffffff" opacity="0.95">
        {animated && (
          <animate attributeName="r" values="3.5;5;3.5" dur={effectiveSpeed.pulse} repeatCount="indefinite" />
        )}
      </circle>
      
      {/* Inner sparkle highlight */}
      <circle cx="47" cy="47" r="1.5" fill="#ffffff" opacity="0.8" />
    </svg>
  );
}

export default ColorfulCelticKnot;
