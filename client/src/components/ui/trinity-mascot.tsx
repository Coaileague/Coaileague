/**
 * Trinity Mascot - The glowing flower-like mascot with morphing petals
 * 
 * This component recreates Trinity's visual design:
 * - 3 overlapping blob shapes (cyan, purple, gold)
 * - Glowing center core
 * - Sparkle particles emanating outward
 * - Morphing/pulsing animation for loading states
 * 
 * Use Cases:
 * - TrinityMascotIcon: Static version for buttons, cards, menus
 * - TrinityMascotAnimated: Animated version for loading, thinking, transitions
 */

import { cn } from "@/lib/utils";
import { useId, useState, useEffect, useRef, useMemo } from "react";

export type TrinityMascotState = 
  | "idle"
  | "thinking"
  | "loading"
  | "success"
  | "error"
  | "celebrating";

interface TrinityMascotProps {
  size?: number | "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
  animated?: boolean;
  state?: TrinityMascotState;
  showSparkles?: boolean;
}

const sizeMap = {
  xs: 20,
  sm: 24,
  md: 32,
  lg: 48,
  xl: 64,
  "2xl": 96,
};

// Trinity's signature colors
const TRINITY_COLORS = {
  cyan: "#38bdf8",
  purple: "#a855f7", 
  gold: "#f4c15d",
  core: "#fef9c3", // Bright yellow-white center
};

/**
 * Static Trinity Mascot Icon - For buttons, cards, menus
 * Renders the 3-blob overlapping flower design without animation
 */
export function TrinityMascotIcon({ 
  size = "md", 
  className 
}: Omit<TrinityMascotProps, 'animated' | 'state' | 'showSparkles'>) {
  const numericSize = typeof size === "number" ? size : sizeMap[size];
  const id = useId();
  
  return (
    <svg
      width={numericSize}
      height={numericSize}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <defs>
        {/* Glow filter */}
        <filter id={`glow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        
        {/* Core radial gradient */}
        <radialGradient id={`core-${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor={TRINITY_COLORS.core} />
          <stop offset="100%" stopColor={TRINITY_COLORS.gold} stopOpacity="0.8" />
        </radialGradient>
        
        {/* Petal gradients */}
        <radialGradient id={`cyan-${id}`} cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor={TRINITY_COLORS.cyan} stopOpacity="0.9" />
          <stop offset="100%" stopColor={TRINITY_COLORS.cyan} stopOpacity="0.3" />
        </radialGradient>
        
        <radialGradient id={`purple-${id}`} cx="70%" cy="30%" r="70%">
          <stop offset="0%" stopColor={TRINITY_COLORS.purple} stopOpacity="0.9" />
          <stop offset="100%" stopColor={TRINITY_COLORS.purple} stopOpacity="0.3" />
        </radialGradient>
        
        <radialGradient id={`gold-${id}`} cx="50%" cy="70%" r="70%">
          <stop offset="0%" stopColor={TRINITY_COLORS.gold} stopOpacity="0.9" />
          <stop offset="100%" stopColor={TRINITY_COLORS.gold} stopOpacity="0.3" />
        </radialGradient>
      </defs>
      
      {/* Outer glow */}
      <circle cx="50" cy="50" r="35" fill={TRINITY_COLORS.cyan} opacity="0.15" filter={`url(#glow-${id})`} />
      
      {/* Three overlapping petal blobs */}
      <ellipse 
        cx="35" cy="40" rx="22" ry="18" 
        fill={`url(#cyan-${id})`}
        transform="rotate(-20 35 40)"
        filter={`url(#glow-${id})`}
      />
      <ellipse 
        cx="65" cy="40" rx="22" ry="18" 
        fill={`url(#purple-${id})`}
        transform="rotate(20 65 40)"
        filter={`url(#glow-${id})`}
      />
      <ellipse 
        cx="50" cy="62" rx="20" ry="16" 
        fill={`url(#gold-${id})`}
        filter={`url(#glow-${id})`}
      />
      
      {/* Central glowing core */}
      <circle cx="50" cy="48" r="14" fill={`url(#core-${id})`} filter={`url(#glow-${id})`} />
      <circle cx="50" cy="48" r="8" fill="#ffffff" opacity="0.9" />
      
      {/* Small sparkle accents */}
      <circle cx="28" cy="32" r="2" fill={TRINITY_COLORS.cyan} opacity="0.8" />
      <circle cx="72" cy="32" r="2" fill={TRINITY_COLORS.purple} opacity="0.8" />
      <circle cx="50" cy="75" r="2" fill={TRINITY_COLORS.gold} opacity="0.8" />
    </svg>
  );
}

/**
 * @deprecated DEPRECATED - Use TrinityRedesign from '@/components/trinity-redesign' instead
 * 
 * TrinityMascotAnimated is deprecated and should NOT be used.
 * The official animated Trinity mascot is TrinityRedesign (canvas-based).
 * 
 * Migration:
 * - Replace: <TrinityMascotAnimated size="xl" state="thinking" />
 * - With: <TrinityRedesign size={64} mode="THINKING" />
 */
export function TrinityMascotAnimated({ 
  size = "lg", 
  className,
  state = "idle",
  showSparkles = true
}: TrinityMascotProps) {
  // DEPRECATED: Log warning in development
  if (import.meta.env.MODE === 'development') {
    console.warn(
      '[DEPRECATED] TrinityMascotAnimated is deprecated. Use TrinityRedesign from "@/components/trinity-redesign" instead.\n' +
      'Migration: <TrinityRedesign size={64} mode="THINKING" />'
    );
  }
  
  const numericSize = typeof size === "number" ? size : sizeMap[size];
  const id = useId();
  const [sparkles, setSparkles] = useState<Array<{ id: number; x: number; y: number; angle: number; delay: number }>>([]);
  
  // Generate sparkles
  useEffect(() => {
    if (!showSparkles) return;
    
    const newSparkles = Array.from({ length: 8 }, (_, i) => ({
      id: i,
      x: 50 + Math.cos((i * Math.PI * 2) / 8) * 40,
      y: 50 + Math.sin((i * Math.PI * 2) / 8) * 40,
      angle: (i * 45),
      delay: i * 0.15,
    }));
    setSparkles(newSparkles);
  }, [showSparkles]);
  
  const animationConfig = useMemo(() => {
    switch (state) {
      case "thinking":
      case "loading":
        return { speed: "1.5s", intensity: 1.2, sparkleSpeed: "0.8s" };
      case "success":
        return { speed: "0.8s", intensity: 1.5, sparkleSpeed: "0.5s" };
      case "error":
        return { speed: "0.3s", intensity: 0.8, sparkleSpeed: "0.3s" };
      case "celebrating":
        return { speed: "0.6s", intensity: 1.8, sparkleSpeed: "0.4s" };
      default:
        return { speed: "3s", intensity: 1, sparkleSpeed: "2s" };
    }
  }, [state]);

  const stateColors = useMemo(() => {
    switch (state) {
      case "success":
        return { primary: "#4ade80", secondary: "#22c55e", core: "#86efac" };
      case "error":
        return { primary: "#f87171", secondary: "#ef4444", core: "#fca5a5" };
      default:
        return { primary: TRINITY_COLORS.cyan, secondary: TRINITY_COLORS.purple, core: TRINITY_COLORS.core };
    }
  }, [state]);
  
  return (
    <div className={cn("relative", className)} style={{ width: numericSize, height: numericSize }}>
      <svg
        width={numericSize}
        height={numericSize}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
        aria-hidden="true"
      >
        <defs>
          <filter id={`glow-anim-${id}`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          
          <radialGradient id={`core-anim-${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff">
              <animate attributeName="stop-color" values="#ffffff;#fef9c3;#ffffff" dur={animationConfig.speed} repeatCount="indefinite" />
            </stop>
            <stop offset="50%" stopColor={stateColors.core} />
            <stop offset="100%" stopColor={TRINITY_COLORS.gold} stopOpacity="0.6" />
          </radialGradient>
          
          <radialGradient id={`cyan-anim-${id}`} cx="30%" cy="30%" r="70%">
            <stop offset="0%" stopColor={stateColors.primary} stopOpacity="0.95" />
            <stop offset="100%" stopColor={stateColors.primary} stopOpacity="0.2" />
          </radialGradient>
          
          <radialGradient id={`purple-anim-${id}`} cx="70%" cy="30%" r="70%">
            <stop offset="0%" stopColor={stateColors.secondary} stopOpacity="0.95" />
            <stop offset="100%" stopColor={stateColors.secondary} stopOpacity="0.2" />
          </radialGradient>
          
          <radialGradient id={`gold-anim-${id}`} cx="50%" cy="70%" r="70%">
            <stop offset="0%" stopColor={TRINITY_COLORS.gold} stopOpacity="0.95" />
            <stop offset="100%" stopColor={TRINITY_COLORS.gold} stopOpacity="0.2" />
          </radialGradient>
        </defs>
        
        {/* Pulsing outer glow */}
        <circle cx="50" cy="50" r="42" fill={stateColors.primary} opacity="0.1" filter={`url(#glow-anim-${id})`}>
          <animate attributeName="r" values="38;45;38" dur={animationConfig.speed} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.1;0.2;0.1" dur={animationConfig.speed} repeatCount="indefinite" />
        </circle>
        
        {/* Morphing cyan petal */}
        <ellipse 
          cx="35" cy="40" 
          fill={`url(#cyan-anim-${id})`}
          filter={`url(#glow-anim-${id})`}
        >
          <animate attributeName="rx" values="20;24;20" dur={animationConfig.speed} repeatCount="indefinite" />
          <animate attributeName="ry" values="16;19;16" dur={animationConfig.speed} repeatCount="indefinite" />
          <animateTransform attributeName="transform" type="rotate" values="-15 35 40;-25 35 40;-15 35 40" dur={animationConfig.speed} repeatCount="indefinite" />
        </ellipse>
        
        {/* Morphing purple petal */}
        <ellipse 
          cx="65" cy="40" 
          fill={`url(#purple-anim-${id})`}
          filter={`url(#glow-anim-${id})`}
        >
          <animate attributeName="rx" values="20;24;20" dur={animationConfig.speed} begin="0.2s" repeatCount="indefinite" />
          <animate attributeName="ry" values="16;19;16" dur={animationConfig.speed} begin="0.2s" repeatCount="indefinite" />
          <animateTransform attributeName="transform" type="rotate" values="15 65 40;25 65 40;15 65 40" dur={animationConfig.speed} begin="0.2s" repeatCount="indefinite" />
        </ellipse>
        
        {/* Morphing gold petal */}
        <ellipse 
          cx="50" cy="62" 
          fill={`url(#gold-anim-${id})`}
          filter={`url(#glow-anim-${id})`}
        >
          <animate attributeName="rx" values="18;22;18" dur={animationConfig.speed} begin="0.4s" repeatCount="indefinite" />
          <animate attributeName="ry" values="14;17;14" dur={animationConfig.speed} begin="0.4s" repeatCount="indefinite" />
        </ellipse>
        
        {/* Pulsing central core */}
        <circle cx="50" cy="48" fill={`url(#core-anim-${id})`} filter={`url(#glow-anim-${id})`}>
          <animate attributeName="r" values="12;16;12" dur={animationConfig.speed} repeatCount="indefinite" />
        </circle>
        <circle cx="50" cy="48" fill="#ffffff">
          <animate attributeName="r" values="6;9;6" dur={animationConfig.speed} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.9;1;0.9" dur={animationConfig.speed} repeatCount="indefinite" />
        </circle>
        
        {/* Animated sparkles */}
        {showSparkles && sparkles.map((sparkle) => (
          <g key={sparkle.id}>
            <circle 
              cx={sparkle.x} 
              cy={sparkle.y} 
              r="2"
              fill={sparkle.id % 3 === 0 ? TRINITY_COLORS.cyan : sparkle.id % 3 === 1 ? TRINITY_COLORS.purple : TRINITY_COLORS.gold}
            >
              <animate 
                attributeName="opacity" 
                values="0;1;0" 
                dur={animationConfig.sparkleSpeed} 
                begin={`${sparkle.delay}s`}
                repeatCount="indefinite" 
              />
              <animate 
                attributeName="r" 
                values="1;3;1" 
                dur={animationConfig.sparkleSpeed} 
                begin={`${sparkle.delay}s`}
                repeatCount="indefinite" 
              />
            </circle>
            {/* Sparkle trail */}
            <line 
              x1={sparkle.x} 
              y1={sparkle.y} 
              x2={sparkle.x + Math.cos(sparkle.angle * Math.PI / 180) * 8} 
              y2={sparkle.y + Math.sin(sparkle.angle * Math.PI / 180) * 8}
              stroke={sparkle.id % 3 === 0 ? TRINITY_COLORS.cyan : sparkle.id % 3 === 1 ? TRINITY_COLORS.purple : TRINITY_COLORS.gold}
              strokeWidth="1"
              strokeLinecap="round"
            >
              <animate 
                attributeName="opacity" 
                values="0;0.6;0" 
                dur={animationConfig.sparkleSpeed} 
                begin={`${sparkle.delay}s`}
                repeatCount="indefinite" 
              />
            </line>
          </g>
        ))}
      </svg>
    </div>
  );
}

/**
 * Trinity Mascot Loader - Full loading screen component with message
 */
export function TrinityMascotLoader({ 
  message = "Trinity is thinking...",
  subMessage,
  size = "xl"
}: { 
  message?: string; 
  subMessage?: string;
  size?: TrinityMascotProps['size'];
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <TrinityMascotAnimated size={size} state="thinking" showSparkles />
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">{message}</p>
        {subMessage && (
          <p className="text-xs text-muted-foreground mt-1">{subMessage}</p>
        )}
      </div>
    </div>
  );
}

export default TrinityMascotIcon;
