/**
 * Trinity Animated Logo - Chat Interface Star Icon
 * Features: Animated star/sparkle icon with pulse and spin states
 * Used in: Trinity chat messages, thinking indicators
 * 
 * Animation States:
 * - idle: Gentle pulse/glow (slow breathing effect)
 * - thinking: Spinning/shimmering while generating response
 * - responding: Smooth fade-in as text appears
 */

import { cn } from "@/lib/utils";
import { useId } from "react";

type AnimationState = "idle" | "thinking" | "responding";
type TrinityMode = "business" | "personal" | "integrated";

interface TrinityAnimatedLogoProps {
  size?: "sm" | "md" | "lg";
  state?: AnimationState;
  mode?: TrinityMode;
  className?: string;
}

const sizeMap = {
  sm: { width: 24, height: 24 },
  md: { width: 32, height: 32 },
  lg: { width: 48, height: 48 },
};

const modeColors = {
  business: { primary: "#3B82F6", secondary: "#0EA5E9" },
  personal: { primary: "#10B981", secondary: "#14B8A6" },
  integrated: { primary: "#8B5CF6", secondary: "#A855F7" },
};

export function TrinityAnimatedLogo({ 
  size = "md", 
  state = "idle",
  mode = "business",
  className 
}: TrinityAnimatedLogoProps) {
  const { width, height } = sizeMap[size];
  const colors = modeColors[mode];
  const reactId = useId();
  
  const ids = {
    mainGrad: `trinity-main${reactId}`,
    glowFilter: `trinity-glow${reactId}`,
    sparkleGrad: `trinity-sparkle${reactId}`,
  };

  const animationClass = {
    idle: "animate-trinity-pulse",
    thinking: "animate-trinity-spin",
    responding: "animate-trinity-fade",
  }[state];
  
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 transition-all", animationClass, className)}
    >
      <defs>
        <linearGradient id={ids.mainGrad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={colors.primary} />
          <stop offset="100%" stopColor={colors.secondary} />
        </linearGradient>
        <linearGradient id={ids.sparkleGrad} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor={colors.primary} stopOpacity="0.5" />
        </linearGradient>
        <filter id={ids.glowFilter} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.5" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* 4-Point Star Shape - Modern sparkle design */}
      <path 
        d="M24 4 L28 18 L42 24 L28 30 L24 44 L20 30 L6 24 L20 18 Z"
        fill={`url(#${ids.mainGrad})`}
        filter={`url(#${ids.glowFilter})`}
      />
      
      {/* Inner highlight star */}
      <path 
        d="M24 10 L26 20 L36 24 L26 28 L24 38 L22 28 L12 24 L22 20 Z"
        fill={`url(#${ids.sparkleGrad})`}
        opacity="0.6"
      />
      
      {/* Central bright core */}
      <circle cx="24" cy="24" r="4" fill="#ffffff" opacity="0.9"/>
      <circle cx="24" cy="24" r="2" fill={colors.primary} opacity="0.5"/>
      
      {/* Small accent sparkles */}
      <circle cx="36" cy="12" r="1.5" fill={colors.secondary} opacity="0.7"/>
      <circle cx="12" cy="36" r="1" fill={colors.primary} opacity="0.5"/>
    </svg>
  );
}

export function TrinityThinkingIndicator({ 
  mode = "business",
  className 
}: { mode?: TrinityMode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <TrinityAnimatedLogo size="sm" state="thinking" mode={mode} />
      <span className="text-sm text-muted-foreground animate-pulse">
        Trinity is thinking...
      </span>
    </div>
  );
}
