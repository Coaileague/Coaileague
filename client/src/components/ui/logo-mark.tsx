/**
 * CoAIleague Logo Mark - Trinity Bow/Knot Icon (Static)
 * Features: Five-pointed interwoven ribbon knot with teal/cyan brand colors
 * Used in: Headers, dialogs, sheets, toasts, branded components
 * 
 * Note: This is a STATIC icon - no animation to maintain recognizability
 * Colors: Uses brand teal/cyan gradient palette per design_guidelines.md
 */

import { cn } from "@/lib/utils";
import { useMemo } from "react";

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

let logoMarkIdCounter = 0;

export function LogoMark({ size = "md", className }: LogoMarkProps) {
  const { width, height } = sizeMap[size];
  
  const ids = useMemo(() => {
    const id = ++logoMarkIdCounter;
    return {
      tealGrad: `logoMark-tealGrad-${id}`,
      cyanGrad: `logoMark-cyanGrad-${id}`,
      coreGrad: `logoMark-coreGrad-${id}`,
      glowFilter: `logoMark-glow-${id}`,
    };
  }, []);
  
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id={ids.tealGrad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <linearGradient id={ids.cyanGrad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <radialGradient id={ids.coreGrad} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.4" />
        </radialGradient>
        <filter id={ids.glowFilter} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Five-pointed interwoven ribbon knot - Trinity Symbol */}
      {/* Petal 1 - Top (Teal) */}
      <path 
        d="M 100 100 Q 100 55 100 35 Q 105 55 100 100" 
        fill={`url(#${ids.tealGrad})`} 
        filter={`url(#${ids.glowFilter})`}
        opacity="0.95"
      />
      <path 
        d="M 100 35 Q 95 55 100 100 Q 100 55 100 35" 
        fill={`url(#${ids.tealGrad})`} 
        opacity="0.9"
      />
      
      {/* Petal 2 - Top Right (Cyan) */}
      <path 
        d="M 100 100 Q 130 75 155 55 Q 130 80 100 100" 
        fill={`url(#${ids.cyanGrad})`} 
        filter={`url(#${ids.glowFilter})`}
        opacity="0.95"
      />
      <path 
        d="M 155 55 Q 125 80 100 100 Q 130 75 155 55" 
        fill={`url(#${ids.cyanGrad})`} 
        opacity="0.9"
      />
      
      {/* Petal 3 - Bottom Right (Teal) */}
      <path 
        d="M 100 100 Q 140 115 160 145 Q 135 120 100 100" 
        fill={`url(#${ids.tealGrad})`} 
        filter={`url(#${ids.glowFilter})`}
        opacity="0.95"
      />
      <path 
        d="M 160 145 Q 130 115 100 100 Q 140 115 160 145" 
        fill={`url(#${ids.tealGrad})`} 
        opacity="0.9"
      />
      
      {/* Petal 4 - Bottom Left (Cyan) */}
      <path 
        d="M 100 100 Q 60 115 40 145 Q 65 120 100 100" 
        fill={`url(#${ids.cyanGrad})`} 
        filter={`url(#${ids.glowFilter})`}
        opacity="0.95"
      />
      <path 
        d="M 40 145 Q 70 115 100 100 Q 60 115 40 145" 
        fill={`url(#${ids.cyanGrad})`} 
        opacity="0.9"
      />
      
      {/* Petal 5 - Top Left (Teal) */}
      <path 
        d="M 100 100 Q 70 75 45 55 Q 70 80 100 100" 
        fill={`url(#${ids.tealGrad})`} 
        filter={`url(#${ids.glowFilter})`}
        opacity="0.95"
      />
      <path 
        d="M 45 55 Q 75 80 100 100 Q 70 75 45 55" 
        fill={`url(#${ids.tealGrad})`} 
        opacity="0.9"
      />
      
      {/* Central crystalline core */}
      <circle cx="100" cy="100" r="18" fill={`url(#${ids.coreGrad})`} filter={`url(#${ids.glowFilter})`}/>
      <circle cx="100" cy="100" r="12" fill="#ffffff" opacity="0.9"/>
      <circle cx="100" cy="100" r="6" fill="#22d3ee"/>
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
  const wordGradId = useMemo(() => `wordGrad-${++logoMarkIdCounter}`, []);
  
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
