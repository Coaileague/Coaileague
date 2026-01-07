/**
 * CoAIleague Logo Mark - Trinity Triquetra Icon (Static)
 * Features: Celtic Trinity knot with three interlocking filled loops
 * Used in: Headers, dialogs, sheets, toasts, branded components
 * 
 * Note: This is a STATIC icon - no animation to maintain recognizability
 * Colors: Uses brand teal/cyan gradient palette per design_guidelines.md
 */

import { cn } from "@/lib/utils";
import { useId } from "react";

interface LogoMarkProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  animate?: boolean;
}

const sizeMap = {
  xs: { width: 20, height: 20 },
  sm: { width: 28, height: 28 },
  md: { width: 36, height: 36 },
  lg: { width: 48, height: 48 },
  xl: { width: 64, height: 64 },
};

export function LogoMark({ size = "md", className }: LogoMarkProps) {
  const { width, height } = sizeMap[size];
  const reactId = useId();
  
  const ids = {
    tealGrad: `logoMark-tealGrad${reactId}`,
    cyanGrad: `logoMark-cyanGrad${reactId}`,
    blueGrad: `logoMark-blueGrad${reactId}`,
    coreGrad: `logoMark-coreGrad${reactId}`,
    glowFilter: `logoMark-glow${reactId}`,
  };
  
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id={ids.tealGrad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>
        <linearGradient id={ids.cyanGrad} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id={ids.blueGrad} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
        <radialGradient id={ids.coreGrad} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#22d3ee" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.5" />
        </radialGradient>
        <filter id={ids.glowFilter} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Trinity Triquetra - Three interlocking FILLED loops */}
      
      {/* Loop 1 - Top (Teal) - Filled vesica/teardrop */}
      <path 
        d="M 50 12 
           C 70 12, 82 30, 82 48
           C 82 58, 72 70, 50 50
           C 28 70, 18 58, 18 48
           C 18 30, 30 12, 50 12 Z"
        fill={`url(#${ids.tealGrad})`}
        opacity="0.9"
        filter={`url(#${ids.glowFilter})`}
      />
      
      {/* Loop 2 - Bottom Left (Cyan) - Filled vesica/teardrop */}
      <path 
        d="M 22 80 
           C 10 68, 10 48, 22 36
           C 32 26, 48 32, 50 50
           C 42 64, 30 76, 22 80
           C 32 92, 48 90, 50 78 Z"
        fill={`url(#${ids.cyanGrad})`}
        opacity="0.85"
        filter={`url(#${ids.glowFilter})`}
      />
      
      {/* Loop 3 - Bottom Right (Blue) - Filled vesica/teardrop */}
      <path 
        d="M 78 80 
           C 90 68, 90 48, 78 36
           C 68 26, 52 32, 50 50
           C 58 64, 70 76, 78 80
           C 68 92, 52 90, 50 78 Z"
        fill={`url(#${ids.blueGrad})`}
        opacity="0.85"
        filter={`url(#${ids.glowFilter})`}
      />
      
      {/* Central nexus point - glowing core */}
      <circle cx="50" cy="50" r="10" fill={`url(#${ids.coreGrad})`} filter={`url(#${ids.glowFilter})`}/>
      <circle cx="50" cy="50" r="5" fill="#ffffff" opacity="0.95"/>
    </svg>
  );
}

interface LogoWordmarkProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  showTagline?: boolean;
}

const wordmarkSizeMap = {
  sm: { width: 100, height: 24, fontSize: 14, taglineSize: 7 },
  md: { width: 140, height: 32, fontSize: 18, taglineSize: 8 },
  lg: { width: 180, height: 40, fontSize: 22, taglineSize: 9 },
};

export function LogoWordmark({ size = "md", className, showTagline = false }: LogoWordmarkProps) {
  const config = wordmarkSizeMap[size];
  const reactId = useId();
  const wordGradId = `wordGrad${reactId}`;
  
  return (
    <svg
      width={config.width}
      height={showTagline ? config.height + 12 : config.height}
      viewBox={`0 0 ${config.width} ${showTagline ? config.height + 12 : config.height}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id={wordGradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#14B8A6" />
          <stop offset="100%" stopColor="#0891B2" />
        </linearGradient>
      </defs>
      <text
        x="0"
        y={config.height * 0.75}
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="700"
        fontSize={config.fontSize}
        letterSpacing="-0.02em"
      >
        <tspan fill={`url(#${wordGradId})`}>Co</tspan>
        <tspan fill="currentColor" className="text-foreground">AI</tspan>
        <tspan fill={`url(#${wordGradId})`}>league</tspan>
      </text>
      {showTagline && (
        <text
          x="0"
          y={config.height + 10}
          fontFamily="system-ui, sans-serif"
          fontWeight="500"
          fontSize={config.taglineSize}
          fill="#64748B"
        >
          Autonomous Management
        </text>
      )}
    </svg>
  );
}

interface LogoFullProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  showTagline?: boolean;
}

export function LogoFull({ size = "md", className, showTagline = false }: LogoFullProps) {
  const markSize = size === "lg" ? "lg" : size === "sm" ? "sm" : "md";
  const wordmarkSize = size;
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LogoMark size={markSize} />
      <LogoWordmark size={wordmarkSize} showTagline={showTagline} />
    </div>
  );
}
