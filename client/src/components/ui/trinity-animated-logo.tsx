/**
 * Trinity Animated Logo - Chat Interface Bow/Knot Icon
 * Features: Animated ribbon bow with pulse and spin states
 * Uses the authentic 5-petal interwoven ribbon knot design
 * 
 * Animation States:
 * - idle: Gentle pulse/glow (slow breathing effect)
 * - thinking: Spinning while generating response
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
  business: { gold: "#FFD700", teal: "#00BFFF", core: "#00BFFF" },
  personal: { gold: "#10B981", teal: "#14B8A6", core: "#10B981" },
  integrated: { gold: "#A855F7", teal: "#8B5CF6", core: "#8B5CF6" },
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
    core: `trinity-core${reactId}`,
    ribbonGold: `ribbon-gold${reactId}`,
    ribbonTeal: `ribbon-teal${reactId}`,
    glow: `trinity-glow${reactId}`,
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
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 transition-all", animationClass, className)}
      aria-hidden="true"
      focusable="false"
      role="img"
    >
      <defs>
        <radialGradient id={ids.core} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFE0" />
          <stop offset="50%" stopColor={colors.core} />
          <stop offset="100%" stopColor="#006699" />
        </radialGradient>
        <linearGradient id={ids.ribbonGold} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={colors.gold} />
          <stop offset="100%" stopColor="#FFA500" />
        </linearGradient>
        <linearGradient id={ids.ribbonTeal} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={colors.teal} />
          <stop offset="100%" stopColor="#008B8B" />
        </linearGradient>
        <filter id={ids.glow}>
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Interwoven ribbon knot - 5 curved ribbon petals */}
      {[0, 72, 144, 216, 288].map((angle, i) => (
        <g key={i} transform={`rotate(${angle} 50 50)`}>
          {/* Ribbon petal with curved path for knot effect */}
          <path
            d="M50,50 Q42,30 50,15 Q58,30 50,50"
            fill="none"
            stroke={`url(#${i % 2 === 0 ? ids.ribbonGold : ids.ribbonTeal})`}
            strokeWidth="6"
            strokeLinecap="round"
            filter={`url(#${ids.glow})`}
            opacity="0.95"
          />
          {/* Outer ribbon arc for interwoven effect */}
          <path
            d="M45,45 Q35,25 50,12 Q65,25 55,45"
            fill="none"
            stroke={`url(#${i % 2 === 0 ? ids.ribbonTeal : ids.ribbonGold})`}
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.7"
          />
        </g>
      ))}
      
      {/* Central knot core */}
      <circle 
        cx="50" 
        cy="50" 
        r="10" 
        fill={`url(#${ids.core})`}
        filter={`url(#${ids.glow})`}
      />
      
      {/* Inner glow */}
      <circle 
        cx="50" 
        cy="50" 
        r="5" 
        fill="#FFFFE0" 
        opacity="0.9"
      />
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
