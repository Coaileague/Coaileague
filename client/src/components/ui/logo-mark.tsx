/**
 * CoAIleague Logo Mark - Polished modern logo design
 * Features: Gradient ring with AI neural network nodes
 * Used in: Headers, dialogs, sheets, toasts, branded components
 */

import { cn } from "@/lib/utils";

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

export function LogoMark({ size = "md", className, animate = false }: LogoMarkProps) {
  const { width, height } = sizeMap[size];
  
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(
        "shrink-0",
        animate && "animate-pulse",
        className
      )}
    >
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2DD4BF" />
          <stop offset="50%" stopColor="#06B6D4" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id="logoGradDark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5EEAD4" />
          <stop offset="50%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#60A5FA" />
        </linearGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      
      <g filter="url(#glow)">
        <circle 
          cx="24" 
          cy="24" 
          r="20" 
          stroke="url(#logoGrad)" 
          strokeWidth="3"
          fill="none"
          opacity="0.9"
        />
        
        <circle 
          cx="24" 
          cy="24" 
          r="14" 
          stroke="url(#logoGrad)" 
          strokeWidth="2"
          fill="none"
          opacity="0.6"
        />
        
        <circle cx="24" cy="10" r="3" fill="url(#logoGrad)" />
        <circle cx="38" cy="24" r="3" fill="url(#logoGrad)" />
        <circle cx="24" cy="38" r="3" fill="url(#logoGrad)" />
        <circle cx="10" cy="24" r="3" fill="url(#logoGrad)" />
        
        <circle cx="24" cy="24" r="5" fill="url(#logoGrad)" />
        
        <line x1="24" y1="13" x2="24" y2="19" stroke="url(#logoGrad)" strokeWidth="1.5" opacity="0.7" />
        <line x1="35" y1="24" x2="29" y2="24" stroke="url(#logoGrad)" strokeWidth="1.5" opacity="0.7" />
        <line x1="24" y1="35" x2="24" y2="29" stroke="url(#logoGrad)" strokeWidth="1.5" opacity="0.7" />
        <line x1="13" y1="24" x2="19" y2="24" stroke="url(#logoGrad)" strokeWidth="1.5" opacity="0.7" />
      </g>
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
        <linearGradient id="wordGrad" x1="0%" y1="0%" x2="100%" y2="0%">
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
        <tspan fill="url(#wordGrad)">Co</tspan>
        <tspan fill="currentColor" className="text-foreground">AI</tspan>
        <tspan fill="url(#wordGrad)">league</tspan>
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
