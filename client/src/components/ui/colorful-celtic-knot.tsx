/**
 * Colorful Celtic Trinity Knot - 3-ribbon interwoven design
 * 
 * Features:
 * - 3 flowing interwoven ribbons forming a Celtic triquetra
 * - Vibrant gradient colors: purple, teal, gold/amber
 * - 10 distinctive emotion states with unique animations
 * - Glowing central nexus with state-specific effects
 * - SVG-based for crisp rendering at any size
 * 
 * Emotion States:
 * - idle: Gentle breathing glow (default)
 * - thinking: Rapid ribbon rotation + pulsing core
 * - success: Rainbow color shift + bounce
 * - speaking: Wave-like ribbon flow
 * - listening: Subtle attention pulse with ear-like accent
 * - warning: Orange/amber flash with shake
 * - error: Red flash with intense shake
 * - loading: Smooth continuous spin
 * - happy: Bright sparkle burst + gentle bounce
 * - focused: Intense concentrated glow
 * 
 * This is the official Trinity brand logo throughout the platform.
 */

import { cn } from "@/lib/utils";
import { useId, useState, useEffect } from "react";

export type TrinityEmotionState = 
  | "idle"           // Subtle glow breathing
  | "thinking"       // Fast rotation while processing
  | "success"        // Bright celebratory rainbow
  | "speaking"       // Wave-like rhythmic pulse
  | "listening"      // Subtle attention animation
  | "warning"        // Cautionary orange pulse
  | "error"          // Red flash with shake
  | "loading"        // Smooth spinning
  | "happy"          // Sparkle burst bounce
  | "focused";       // Intense concentrated glow

interface ColorfulCelticKnotProps {
  size?: number | "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
  animated?: boolean;
  animationSpeed?: "slow" | "normal" | "fast" | "instant";
  state?: TrinityEmotionState;
  randomize?: boolean; // Cycle through random states
  randomInterval?: number; // ms between random changes
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
  slow: { glow: "4s", pulse: "3s", spin: "20s", wave: "2.5s" },
  normal: { glow: "2.5s", pulse: "2s", spin: "12s", wave: "1.5s" },
  fast: { glow: "1.2s", pulse: "1s", spin: "6s", wave: "0.8s" },
  instant: { glow: "0.6s", pulse: "0.5s", spin: "3s", wave: "0.4s" },
};

// State-specific configurations
const stateConfigs: Record<TrinityEmotionState, {
  speed: keyof typeof speedMap;
  wrapperClass: string;
  glowIntensity: number;
  coreColor: string;
  ribbonOpacityRange: [number, number];
  enableSpin: boolean;
  enablePulse: boolean;
  enableWave: boolean;
  enableShake: boolean;
  enableBounce: boolean;
  colorShift: boolean;
}> = {
  idle: {
    speed: "slow",
    wrapperClass: "",
    glowIntensity: 2,
    coreColor: "#ffffff",
    ribbonOpacityRange: [0.85, 1],
    enableSpin: false,
    enablePulse: true,
    enableWave: false,
    enableShake: false,
    enableBounce: false,
    colorShift: false,
  },
  thinking: {
    speed: "fast",
    wrapperClass: "animate-pulse",
    glowIntensity: 4,
    coreColor: "#22d3ee",
    ribbonOpacityRange: [0.7, 1],
    enableSpin: true,
    enablePulse: true,
    enableWave: false,
    enableShake: false,
    enableBounce: false,
    colorShift: false,
  },
  success: {
    speed: "fast",
    wrapperClass: "animate-bounce",
    glowIntensity: 5,
    coreColor: "#4ade80",
    ribbonOpacityRange: [0.9, 1],
    enableSpin: false,
    enablePulse: true,
    enableWave: false,
    enableShake: false,
    enableBounce: true,
    colorShift: true,
  },
  speaking: {
    speed: "normal",
    wrapperClass: "",
    glowIntensity: 3,
    coreColor: "#c084fc",
    ribbonOpacityRange: [0.6, 1],
    enableSpin: false,
    enablePulse: true,
    enableWave: true,
    enableShake: false,
    enableBounce: false,
    colorShift: false,
  },
  listening: {
    speed: "slow",
    wrapperClass: "",
    glowIntensity: 2.5,
    coreColor: "#60a5fa",
    ribbonOpacityRange: [0.8, 1],
    enableSpin: false,
    enablePulse: true,
    enableWave: false,
    enableShake: false,
    enableBounce: false,
    colorShift: false,
  },
  warning: {
    speed: "fast",
    wrapperClass: "",
    glowIntensity: 4,
    coreColor: "#fbbf24",
    ribbonOpacityRange: [0.7, 1],
    enableSpin: false,
    enablePulse: true,
    enableWave: false,
    enableShake: true,
    enableBounce: false,
    colorShift: false,
  },
  error: {
    speed: "instant",
    wrapperClass: "",
    glowIntensity: 5,
    coreColor: "#ef4444",
    ribbonOpacityRange: [0.6, 1],
    enableSpin: false,
    enablePulse: true,
    enableWave: false,
    enableShake: true,
    enableBounce: false,
    colorShift: false,
  },
  loading: {
    speed: "normal",
    wrapperClass: "",
    glowIntensity: 3,
    coreColor: "#a855f7",
    ribbonOpacityRange: [0.8, 1],
    enableSpin: true,
    enablePulse: false,
    enableWave: false,
    enableShake: false,
    enableBounce: false,
    colorShift: false,
  },
  happy: {
    speed: "fast",
    wrapperClass: "",
    glowIntensity: 5,
    coreColor: "#fcd34d",
    ribbonOpacityRange: [0.9, 1],
    enableSpin: false,
    enablePulse: true,
    enableWave: false,
    enableShake: false,
    enableBounce: true,
    colorShift: true,
  },
  focused: {
    speed: "normal",
    wrapperClass: "",
    glowIntensity: 6,
    coreColor: "#818cf8",
    ribbonOpacityRange: [0.95, 1],
    enableSpin: false,
    enablePulse: true,
    enableWave: false,
    enableShake: false,
    enableBounce: false,
    colorShift: false,
  },
};

// Random state selection for variety
const randomizableStates: TrinityEmotionState[] = [
  "idle", "thinking", "listening", "speaking", "focused", "happy"
];

export function ColorfulCelticKnot({ 
  size = "md", 
  className,
  animated = true,
  animationSpeed,
  state = "idle",
  randomize = false,
  randomInterval = 8000,
}: ColorfulCelticKnotProps) {
  const uniqueId = useId().replace(/:/g, '-');
  const numericSize = typeof size === "number" ? size : sizeMap[size] || 32;
  
  const [currentState, setCurrentState] = useState<TrinityEmotionState>(state);
  
  // Random state cycling
  useEffect(() => {
    if (!randomize || !animated) return;
    
    const interval = setInterval(() => {
      const nextState = randomizableStates[
        Math.floor(Math.random() * randomizableStates.length)
      ];
      setCurrentState(nextState);
    }, randomInterval);
    
    return () => clearInterval(interval);
  }, [randomize, randomInterval, animated]);
  
  // Sync with prop changes
  useEffect(() => {
    if (!randomize) {
      setCurrentState(state);
    }
  }, [state, randomize]);
  
  const config = stateConfigs[currentState] || stateConfigs.idle;
  const effectiveSpeedKey = animationSpeed || config.speed;
  const effectiveSpeed = speedMap[effectiveSpeedKey];
  const [minOpacity, maxOpacity] = config.ribbonOpacityRange;

  // Build wrapper classes based on state
  const wrapperClasses = cn(
    "flex-shrink-0 transition-all duration-300",
    config.wrapperClass,
    config.enableShake && "animate-shake",
    config.enableBounce && !config.wrapperClass.includes("bounce") && "animate-gentle-bounce",
    className
  );

  return (
    <svg 
      width={numericSize} 
      height={numericSize} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={wrapperClasses}
      data-state={currentState}
    >
      <defs>
        {/* Gradient for ribbon 1 - Purple to Magenta */}
        <linearGradient id={`ribbon1-grad-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7">
            {animated && config.colorShift && (
              <animate attributeName="stop-color" values="#a855f7;#22d3ee;#f59e0b;#a855f7" dur="3s" repeatCount="indefinite" />
            )}
          </stop>
          <stop offset="50%" stopColor="#c026d3">
            {animated && config.colorShift && (
              <animate attributeName="stop-color" values="#c026d3;#14b8a6;#fbbf24;#c026d3" dur="3s" repeatCount="indefinite" />
            )}
          </stop>
          <stop offset="100%" stopColor="#7c3aed">
            {animated && config.colorShift && (
              <animate attributeName="stop-color" values="#7c3aed;#06b6d4;#f97316;#7c3aed" dur="3s" repeatCount="indefinite" />
            )}
          </stop>
        </linearGradient>
        
        {/* Gradient for ribbon 2 - Teal to Cyan */}
        <linearGradient id={`ribbon2-grad-${uniqueId}`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#14b8a6">
            {animated && config.colorShift && (
              <animate attributeName="stop-color" values="#14b8a6;#f59e0b;#a855f7;#14b8a6" dur="3s" repeatCount="indefinite" />
            )}
          </stop>
          <stop offset="50%" stopColor="#22d3ee">
            {animated && config.colorShift && (
              <animate attributeName="stop-color" values="#22d3ee;#fbbf24;#c026d3;#22d3ee" dur="3s" repeatCount="indefinite" />
            )}
          </stop>
          <stop offset="100%" stopColor="#06b6d4">
            {animated && config.colorShift && (
              <animate attributeName="stop-color" values="#06b6d4;#f97316;#7c3aed;#06b6d4" dur="3s" repeatCount="indefinite" />
            )}
          </stop>
        </linearGradient>
        
        {/* Gradient for ribbon 3 - Gold to Orange */}
        <linearGradient id={`ribbon3-grad-${uniqueId}`} x1="100%" y1="50%" x2="0%" y2="50%">
          <stop offset="0%" stopColor="#f59e0b">
            {animated && config.colorShift && (
              <animate attributeName="stop-color" values="#f59e0b;#a855f7;#14b8a6;#f59e0b" dur="3s" repeatCount="indefinite" />
            )}
          </stop>
          <stop offset="50%" stopColor="#fbbf24">
            {animated && config.colorShift && (
              <animate attributeName="stop-color" values="#fbbf24;#c026d3;#22d3ee;#fbbf24" dur="3s" repeatCount="indefinite" />
            )}
          </stop>
          <stop offset="100%" stopColor="#f97316">
            {animated && config.colorShift && (
              <animate attributeName="stop-color" values="#f97316;#7c3aed;#06b6d4;#f97316" dur="3s" repeatCount="indefinite" />
            )}
          </stop>
        </linearGradient>
        
        {/* Center nexus gradient - state-aware */}
        <radialGradient id={`nexus-grad-${uniqueId}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={config.coreColor} />
          <stop offset="40%" stopColor="#e9d5ff" />
          <stop offset="100%" stopColor="#a855f7" />
        </radialGradient>
        
        {/* Glow filter - intensity based on state */}
        <filter id={`glow-${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={config.glowIntensity} result="blur"/>
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
      
      {/* Main knot group - can spin for loading/thinking states */}
      <g 
        filter={`url(#ribbon-glow-${uniqueId})`} 
        strokeWidth="6" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        fill="none"
      >
        {animated && config.enableSpin && (
          <animateTransform 
            attributeName="transform" 
            type="rotate" 
            from="0 50 50" 
            to="360 50 50" 
            dur={effectiveSpeed.spin} 
            repeatCount="indefinite"
          />
        )}
        
        {/* Loop 1 - Top loop (purple/magenta) */}
        <path 
          d="M 50 15 
             C 25 15, 15 40, 25 55 
             C 32 65, 42 60, 50 50 
             C 58 60, 68 65, 75 55 
             C 85 40, 75 15, 50 15"
          stroke={`url(#ribbon1-grad-${uniqueId})`}
          opacity={maxOpacity}
        >
          {animated && config.enablePulse && (
            <animate 
              attributeName="opacity" 
              values={`${minOpacity};${maxOpacity};${minOpacity}`} 
              dur={effectiveSpeed.glow} 
              repeatCount="indefinite"
            />
          )}
          {animated && config.enableWave && (
            <animate 
              attributeName="stroke-width" 
              values="5;7;5" 
              dur={effectiveSpeed.wave} 
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
          opacity={maxOpacity}
        >
          {animated && config.enablePulse && (
            <animate 
              attributeName="opacity" 
              values={`${minOpacity};${maxOpacity};${minOpacity}`} 
              dur={effectiveSpeed.glow} 
              repeatCount="indefinite"
              begin="0.3s"
            />
          )}
          {animated && config.enableWave && (
            <animate 
              attributeName="stroke-width" 
              values="5;7;5" 
              dur={effectiveSpeed.wave} 
              repeatCount="indefinite"
              begin="0.2s"
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
          opacity={maxOpacity}
        >
          {animated && config.enablePulse && (
            <animate 
              attributeName="opacity" 
              values={`${minOpacity};${maxOpacity};${minOpacity}`} 
              dur={effectiveSpeed.glow} 
              repeatCount="indefinite"
              begin="0.6s"
            />
          )}
          {animated && config.enableWave && (
            <animate 
              attributeName="stroke-width" 
              values="5;7;5" 
              dur={effectiveSpeed.wave} 
              repeatCount="indefinite"
              begin="0.4s"
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
        stroke={`url(#ribbon1-grad-${uniqueId})`}
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
        stroke={`url(#ribbon2-grad-${uniqueId})`}
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
      
      {/* Central glowing nexus - state-aware color */}
      <circle 
        cx="50" 
        cy="50" 
        r="9" 
        fill={`url(#nexus-grad-${uniqueId})`} 
        filter={`url(#glow-${uniqueId})`}
      >
        {animated && config.enablePulse && (
          <>
            <animate attributeName="r" values="8;10;8" dur={effectiveSpeed.pulse} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.9;1;0.9" dur={effectiveSpeed.pulse} repeatCount="indefinite" />
          </>
        )}
      </circle>
      
      {/* Bright inner core - state color */}
      <circle cx="50" cy="50" r="4" fill={config.coreColor} opacity="0.95">
        {animated && config.enablePulse && (
          <animate attributeName="r" values="3.5;5;3.5" dur={effectiveSpeed.pulse} repeatCount="indefinite" />
        )}
      </circle>
      
      {/* Inner sparkle highlight */}
      <circle cx="47" cy="47" r="1.5" fill="#ffffff" opacity="0.8">
        {animated && config.enableBounce && (
          <animate attributeName="opacity" values="0.6;1;0.6" dur="0.8s" repeatCount="indefinite" />
        )}
      </circle>
      
      {/* Extra sparkles for happy/success states */}
      {(currentState === "happy" || currentState === "success") && animated && (
        <>
          <circle cx="30" cy="30" r="1" fill="#fcd34d" opacity="0">
            <animate attributeName="opacity" values="0;1;0" dur="1.5s" repeatCount="indefinite" />
            <animate attributeName="r" values="0.5;2;0.5" dur="1.5s" repeatCount="indefinite" />
          </circle>
          <circle cx="70" cy="35" r="1" fill="#4ade80" opacity="0">
            <animate attributeName="opacity" values="0;1;0" dur="1.2s" repeatCount="indefinite" begin="0.3s" />
            <animate attributeName="r" values="0.5;1.5;0.5" dur="1.2s" repeatCount="indefinite" begin="0.3s" />
          </circle>
          <circle cx="65" cy="70" r="1" fill="#60a5fa" opacity="0">
            <animate attributeName="opacity" values="0;1;0" dur="1.8s" repeatCount="indefinite" begin="0.6s" />
            <animate attributeName="r" values="0.5;2;0.5" dur="1.8s" repeatCount="indefinite" begin="0.6s" />
          </circle>
        </>
      )}
    </svg>
  );
}

export default ColorfulCelticKnot;

// CSS animations to add to index.css:
// .animate-shake { animation: shake 0.5s ease-in-out infinite; }
// @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-2px); } 75% { transform: translateX(2px); } }
// .animate-gentle-bounce { animation: gentle-bounce 1s ease-in-out infinite; }
// @keyframes gentle-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
