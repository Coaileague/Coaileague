/**
 * Colorful Celtic Trinity Knot - 3-ribbon interwoven design
 * 
 * Features:
 * - 3 flowing interwoven ribbons forming a Celtic triquetra
 * - Vibrant gradient colors: purple, teal, gold/amber
 * - Smooth color-flowing animations
 * - Glowing central nexus
 * - SVG-based for crisp rendering at any size
 * 
 * This is the official Trinity brand logo throughout the platform.
 */

import { cn } from "@/lib/utils";
import { useId } from "react";

export type TrinityEmotionState = 
  | "idle"           // Gentle breathing animation
  | "thinking"       // Fast spinning/pulsing while processing
  | "success"        // Celebratory burst
  | "speaking"       // Rhythmic pulse while Trinity talks
  | "listening"      // Subtle attention animation
  | "warning"        // Cautionary orange/yellow pulse
  | "error"          // Red flash with shake
  | "loading"        // Smooth infinite flow
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
  slow: { ribbon: "4s", color: "3s", core: "2.5s" },
  normal: { ribbon: "2.5s", color: "2s", core: "1.5s" },
  fast: { ribbon: "1.2s", color: "1s", core: "0.6s" },
  instant: { ribbon: "0.6s", color: "0.4s", core: "0.3s" },
};

const stateModifiers: Record<TrinityEmotionState, { 
  speed: keyof typeof speedMap;
  extraClass: string;
  coreScale?: string;
}> = {
  idle: { speed: "slow", extraClass: "", coreScale: "7;9;7" },
  thinking: { speed: "fast", extraClass: "animate-pulse", coreScale: "6;12;6" },
  success: { speed: "instant", extraClass: "animate-bounce", coreScale: "8;14;8" },
  speaking: { speed: "normal", extraClass: "", coreScale: "7;11;7" },
  listening: { speed: "slow", extraClass: "", coreScale: "8;10;8" },
  warning: { speed: "fast", extraClass: "animate-pulse", coreScale: "9;12;9" },
  error: { speed: "instant", extraClass: "animate-shake", coreScale: "6;10;6" },
  loading: { speed: "normal", extraClass: "animate-spin-slow", coreScale: "7;10;7" },
  happy: { speed: "fast", extraClass: "animate-bounce", coreScale: "8;13;8" },
  focused: { speed: "normal", extraClass: "", coreScale: "10;12;10" },
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
  
  // Get state-specific modifiers
  const stateConfig = stateModifiers[state] || stateModifiers.idle;
  
  // Animation speed: explicit prop > state default > normal
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
          <stop offset="0%" stopColor="#a855f7">
            {animated && (
              <animate 
                attributeName="stop-color" 
                values="#a855f7;#ec4899;#f59e0b;#a855f7" 
                dur={effectiveSpeed.color} 
                repeatCount="indefinite" 
              />
            )}
          </stop>
          <stop offset="100%" stopColor="#7c3aed">
            {animated && (
              <animate 
                attributeName="stop-color" 
                values="#7c3aed;#db2777;#d97706;#7c3aed" 
                dur={effectiveSpeed.color} 
                repeatCount="indefinite" 
              />
            )}
          </stop>
        </linearGradient>
        
        {/* Gradient for ribbon 2 - Teal to Cyan */}
        <linearGradient id={`ribbon2-grad-${uniqueId}`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#14b8a6">
            {animated && (
              <animate 
                attributeName="stop-color" 
                values="#14b8a6;#06b6d4;#3b82f6;#14b8a6" 
                dur={effectiveSpeed.color} 
                repeatCount="indefinite" 
                begin="0.5s"
              />
            )}
          </stop>
          <stop offset="100%" stopColor="#06b6d4">
            {animated && (
              <animate 
                attributeName="stop-color" 
                values="#06b6d4;#0ea5e9;#6366f1;#06b6d4" 
                dur={effectiveSpeed.color} 
                repeatCount="indefinite" 
                begin="0.5s"
              />
            )}
          </stop>
        </linearGradient>
        
        {/* Gradient for ribbon 3 - Gold to Orange */}
        <linearGradient id={`ribbon3-grad-${uniqueId}`} x1="100%" y1="50%" x2="0%" y2="50%">
          <stop offset="0%" stopColor="#f59e0b">
            {animated && (
              <animate 
                attributeName="stop-color" 
                values="#f59e0b;#eab308;#84cc16;#f59e0b" 
                dur={effectiveSpeed.color} 
                repeatCount="indefinite" 
                begin="1s"
              />
            )}
          </stop>
          <stop offset="100%" stopColor="#f97316">
            {animated && (
              <animate 
                attributeName="stop-color" 
                values="#f97316;#facc15;#22c55e;#f97316" 
                dur={effectiveSpeed.color} 
                repeatCount="indefinite" 
                begin="1s"
              />
            )}
          </stop>
        </linearGradient>
        
        {/* Center nexus gradient */}
        <radialGradient id={`nexus-grad-${uniqueId}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#a855f7" />
        </radialGradient>
        
        {/* Glow filter */}
        <filter id={`glow-${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Celtic Triquetra - Three interwoven loops */}
      <g filter={`url(#glow-${uniqueId})`} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none">
        
        {/* Loop 1 - Top loop (purple/magenta) */}
        <path 
          d="M 50 15 
             C 25 15, 15 40, 25 55 
             C 32 65, 42 60, 50 50 
             C 58 60, 68 65, 75 55 
             C 85 40, 75 15, 50 15"
          stroke={`url(#ribbon1-grad-${uniqueId})`}
          strokeDasharray={animated ? "200" : "none"}
          strokeDashoffset="0"
        >
          {animated && (
            <animate 
              attributeName="stroke-dashoffset" 
              values="0;-200" 
              dur={effectiveSpeed.ribbon} 
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
          strokeDasharray={animated ? "180" : "none"}
          strokeDashoffset="0"
        >
          {animated && (
            <animate 
              attributeName="stroke-dashoffset" 
              values="0;-180" 
              dur={effectiveSpeed.ribbon} 
              repeatCount="indefinite"
              begin="0.8s"
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
          strokeDasharray={animated ? "180" : "none"}
          strokeDashoffset="0"
        >
          {animated && (
            <animate 
              attributeName="stroke-dashoffset" 
              values="0;-180" 
              dur={effectiveSpeed.ribbon} 
              repeatCount="indefinite"
              begin="1.6s"
            />
          )}
        </path>
      </g>
      
      {/* Central glowing nexus */}
      <circle 
        cx="50" 
        cy="50" 
        r="8" 
        fill={`url(#nexus-grad-${uniqueId})`} 
        filter={`url(#glow-${uniqueId})`}
      >
        {animated && (
          <>
            <animate attributeName="r" values={stateConfig.coreScale || "7;10;7"} dur={effectiveSpeed.core} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.9;1;0.9" dur={effectiveSpeed.core} repeatCount="indefinite" />
          </>
        )}
      </circle>
      
      {/* Bright inner core */}
      <circle cx="50" cy="50" r="4" fill="#ffffff" opacity="0.95">
        {animated && (
          <animate attributeName="r" values="3;5;3" dur={effectiveSpeed.core} repeatCount="indefinite" />
        )}
      </circle>
      
      {/* Outer decorative ring (subtle) */}
      <circle 
        cx="50" 
        cy="50" 
        r="44" 
        fill="none" 
        stroke="#a855f7" 
        strokeWidth="0.5" 
        strokeDasharray="6 10"
        opacity="0.25"
      >
        {animated && (
          <animateTransform 
            attributeName="transform" 
            type="rotate" 
            from="0 50 50" 
            to="360 50 50" 
            dur="30s" 
            repeatCount="indefinite"
          />
        )}
      </circle>
    </svg>
  );
}

export default ColorfulCelticKnot;
