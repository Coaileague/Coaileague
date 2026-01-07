/**
 * CoAIleague Logo Mark - Trinity Triquetra Icon (Static)
 * Features: Classic Celtic Trinity knot with three interlocking loops
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
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <linearGradient id={ids.cyanGrad} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id={ids.blueGrad} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <radialGradient id={ids.coreGrad} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#22d3ee" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.3" />
        </radialGradient>
        <filter id={ids.glowFilter} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Trinity Triquetra - Three interlocking loops */}
      {/* Each loop is a teardrop/vesica shape that weaves over and under */}
      
      {/* Loop 1 - Top (Teal) */}
      <path 
        d="M 50 15 
           C 65 15, 75 30, 75 45
           C 75 55, 65 65, 50 50
           C 35 65, 25 55, 25 45
           C 25 30, 35 15, 50 15 Z"
        fill="none"
        stroke={`url(#${ids.tealGrad})`}
        strokeWidth="6"
        strokeLinecap="round"
        filter={`url(#${ids.glowFilter})`}
      />
      
      {/* Loop 2 - Bottom Left (Cyan) */}
      <path 
        d="M 25 75 
           C 15 65, 15 50, 25 40
           C 32 32, 45 35, 50 50
           C 45 60, 35 70, 25 75
           C 30 85, 45 85, 50 75 Z"
        fill="none"
        stroke={`url(#${ids.cyanGrad})`}
        strokeWidth="6"
        strokeLinecap="round"
        filter={`url(#${ids.glowFilter})`}
      />
      
      {/* Loop 3 - Bottom Right (Blue) */}
      <path 
        d="M 75 75 
           C 85 65, 85 50, 75 40
           C 68 32, 55 35, 50 50
           C 55 60, 65 70, 75 75
           C 70 85, 55 85, 50 75 Z"
        fill="none"
        stroke={`url(#${ids.blueGrad})`}
        strokeWidth="6"
        strokeLinecap="round"
        filter={`url(#${ids.glowFilter})`}
      />
      
      {/* Central nexus point */}
      <circle cx="50" cy="50" r="8" fill={`url(#${ids.coreGrad})`} filter={`url(#${ids.glowFilter})`}/>
      <circle cx="50" cy="50" r="4" fill="#ffffff" opacity="0.95"/>
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
