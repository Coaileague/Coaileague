/**
 * Trinity Arrow Mark — animated 3-arrow indicator for inline Trinity surfaces.
 *
 * Three directional arrows radiate from a central glowing nexus:
 *   - Blue  (#3B82F6 / #60A5FA)  — top (12 o'clock)
 *   - Orange (#F97316 / #FB923C) — bottom-right (4 o'clock)
 *   - Purple (#8B5CF6 / #A78BFA) — bottom-left (8 o'clock)
 *
 * 10 emotion states drive live animations:
 * - idle:      Gentle breathing glow (default)
 * - thinking:  Fast arrow spin + pulsing core
 * - success:   Rainbow color shift + bounce
 * - speaking:  Cascading arrow opacity wave
 * - listening: Subtle attention pulse
 * - warning:   Amber flash with shake
 * - error:     Red flash with intense shake
 * - loading:   Smooth continuous spin
 * - happy:     Bright sparkle burst + gentle bounce
 * - focused:   Intense concentrated glow
 *
 * This is the RICH animated Trinity indicator used on chat/inline surfaces.
 * For static brand mark use `CoAIleagueLogoMark` from coaileague-logo-mark.tsx.
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
    coreColor: "#60a5fa",
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
    coreColor: "#a78bfa",
    ribbonOpacityRange: [0.6, 1],
    enableSpin: false,
    // pulse and wave both target opacity; wave takes priority here to give
    // speaking its distinctive cascading-arrow ripple rather than a
    // synchronised breathing effect.
    enablePulse: false,
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
    coreColor: "#8b5cf6",
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

/** The shared arrow shape used by all three arms. Defined once here so a
 *  future shape update only requires a single edit. Each arm is placed by
 *  rotating the parent group or by a per-element transform. */
const ARROW_PATH = "M 50 5 L 59 15 L 56 15 L 56 42 L 50 50 L 44 42 L 44 15 L 41 15 Z";

/** Wave-cascade delays for the three arrows (0 × interval, 1 × interval,
 *  2 × interval). Derived from index so changing the count stays consistent. */
const WAVE_DELAYS = [0, 1, 2].map(i => `${i * 0.5}s`) as [string, string, string];

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
        {/* Gradient for arrow 1 - Blue (top) */}
        <linearGradient id={`arrow1-grad-${uniqueId}`} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#60A5FA">
            {animated && config.colorShift && (
              <animate attributeName="stop-color" values="#60A5FA;#FB923C;#A78BFA;#60A5FA" dur="3s" repeatCount="indefinite" />
            )}
          </stop>
          <stop offset="50%" stopColor="#3B82F6">
            {animated && config.colorShift && (
              <animate attributeName="stop-color" values="#3B82F6;#F97316;#8B5CF6;#3B82F6" dur="3s" repeatCount="indefinite" />
            )}
          </stop>
          <stop offset="100%" stopColor="#2563EB">
            {animated && config.colorShift && (
              <animate attributeName="stop-color" values="#2563EB;#EA580C;#7C3AED;#2563EB" dur="3s" repeatCount="indefinite" />
            )}
          </stop>
        </linearGradient>
        
        {/* Gradient for arrow 2 - Orange (bottom-right) */}
        <linearGradient id={`arrow2-grad-${uniqueId}`} x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#FB923C">
            {animated && config.colorShift && (
              <animate attributeName="stop-color" values="#FB923C;#A78BFA;#60A5FA;#FB923C" dur="3s" repeatCount="indefinite" />
            )}
          </stop>
          <stop offset="50%" stopColor="#F97316">
            {animated && config.colorShift && (
              <animate attributeName="stop-color" values="#F97316;#8B5CF6;#3B82F6;#F97316" dur="3s" repeatCount="indefinite" />
            )}
          </stop>
          <stop offset="100%" stopColor="#EA580C">
            {animated && config.colorShift && (
              <animate attributeName="stop-color" values="#EA580C;#7C3AED;#2563EB;#EA580C" dur="3s" repeatCount="indefinite" />
            )}
          </stop>
        </linearGradient>
        
        {/* Gradient for arrow 3 - Purple (bottom-left) */}
        <linearGradient id={`arrow3-grad-${uniqueId}`} x1="100%" y1="50%" x2="0%" y2="50%">
          <stop offset="0%" stopColor="#A78BFA">
            {animated && config.colorShift && (
              <animate attributeName="stop-color" values="#A78BFA;#60A5FA;#FB923C;#A78BFA" dur="3s" repeatCount="indefinite" />
            )}
          </stop>
          <stop offset="50%" stopColor="#8B5CF6">
            {animated && config.colorShift && (
              <animate attributeName="stop-color" values="#8B5CF6;#3B82F6;#F97316;#8B5CF6" dur="3s" repeatCount="indefinite" />
            )}
          </stop>
          <stop offset="100%" stopColor="#7C3AED">
            {animated && config.colorShift && (
              <animate attributeName="stop-color" values="#7C3AED;#2563EB;#EA580C;#7C3AED" dur="3s" repeatCount="indefinite" />
            )}
          </stop>
        </linearGradient>
        
        {/* Center nexus gradient - state-aware */}
        <radialGradient id={`nexus-grad-${uniqueId}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={config.coreColor} />
          <stop offset="40%" stopColor="#ddd6fe" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </radialGradient>
        
        {/* Glow filter - intensity based on state */}
        <filter id={`glow-${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={config.glowIntensity} result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        
        {/* Outer glow for arrows */}
        <filter id={`ribbon-glow-${uniqueId}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.5" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Main arrow group - spins for thinking/loading states */}
      <g filter={`url(#ribbon-glow-${uniqueId})`}>
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
        
        {/* Arrow 1 — Blue (top, 12 o'clock) */}
        <path
          d={ARROW_PATH}
          fill={`url(#arrow1-grad-${uniqueId})`}
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
              attributeName="opacity" 
              values={`0.4;${maxOpacity};0.4`} 
              dur={effectiveSpeed.wave} 
              repeatCount="indefinite"
              begin={WAVE_DELAYS[0]}
            />
          )}
        </path>
        
        {/* Arrow 2 — Orange (bottom-right, 4 o'clock) */}
        <path
          d={ARROW_PATH}
          fill={`url(#arrow2-grad-${uniqueId})`}
          opacity={maxOpacity}
          transform="rotate(120, 50, 50)"
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
              attributeName="opacity" 
              values={`0.4;${maxOpacity};0.4`} 
              dur={effectiveSpeed.wave} 
              repeatCount="indefinite"
              begin={WAVE_DELAYS[1]}
            />
          )}
        </path>
        
        {/* Arrow 3 — Purple (bottom-left, 8 o'clock) */}
        <path
          d={ARROW_PATH}
          fill={`url(#arrow3-grad-${uniqueId})`}
          opacity={maxOpacity}
          transform="rotate(240, 50, 50)"
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
              attributeName="opacity" 
              values={`0.4;${maxOpacity};0.4`} 
              dur={effectiveSpeed.wave} 
              repeatCount="indefinite"
              begin={WAVE_DELAYS[2]}
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
        stroke={`url(#arrow1-grad-${uniqueId})`}
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
        stroke={`url(#arrow2-grad-${uniqueId})`}
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
