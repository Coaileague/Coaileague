/**
 * Celtic Trinity Knot - 5-fold interwoven ribbon pattern
 * 
 * A sophisticated pentagonal weave pattern with:
 * - 5 interlaced ribbons with gradient colors
 * - Animated energy points at each vertex
 * - Central glowing nexus
 * - Smooth pulsing animations
 * 
 * Used for:
 * - Static branding and icons throughout the platform
 * - CoAIleague logo mark
 * - Trinity branding elements
 */

import { cn } from "@/lib/utils";
import { useId } from "react";

interface CelticTrinityKnotProps {
  size?: number | "sm" | "md" | "lg" | "xl";
  className?: string;
  animated?: boolean;
}

const sizeMap = {
  sm: 24,
  md: 32,
  lg: 48,
  xl: 64,
};

export function CelticTrinityKnot({ 
  size = "md", 
  className,
  animated = true 
}: CelticTrinityKnotProps) {
  const uniqueId = useId().replace(/:/g, '-');
  const numericSize = typeof size === "number" ? size : sizeMap[size];

  return (
    <svg 
      width={numericSize} 
      height={numericSize} 
      viewBox="0 0 64 64" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={cn("flex-shrink-0", className)}
    >
      <defs>
        <linearGradient id={`weave-gradient-1-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6"/>
          <stop offset="50%" stopColor="#8b5cf6"/>
          <stop offset="100%" stopColor="#06b6d4"/>
        </linearGradient>
        <linearGradient id={`weave-gradient-2-${uniqueId}`} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa"/>
          <stop offset="50%" stopColor="#60a5fa"/>
          <stop offset="100%" stopColor="#22d3ee"/>
        </linearGradient>
        <linearGradient id={`ribbon-1-${uniqueId}`}>
          <stop offset="0%" stopColor="#3b82f6"/>
          <stop offset="100%" stopColor="#60a5fa"/>
        </linearGradient>
        <linearGradient id={`ribbon-2-${uniqueId}`}>
          <stop offset="0%" stopColor="#8b5cf6"/>
          <stop offset="100%" stopColor="#a78bfa"/>
        </linearGradient>
        <linearGradient id={`ribbon-3-${uniqueId}`}>
          <stop offset="0%" stopColor="#06b6d4"/>
          <stop offset="100%" stopColor="#22d3ee"/>
        </linearGradient>
        <linearGradient id={`ribbon-4-${uniqueId}`}>
          <stop offset="0%" stopColor="#6366f1"/>
          <stop offset="100%" stopColor="#818cf8"/>
        </linearGradient>
        <linearGradient id={`ribbon-5-${uniqueId}`}>
          <stop offset="0%" stopColor="#7c3aed"/>
          <stop offset="100%" stopColor="#a78bfa"/>
        </linearGradient>
        <radialGradient id={`center-nexus-${uniqueId}`}>
          <stop offset="0%" stopColor="#ffffff"/>
          <stop offset="50%" stopColor="#60a5fa"/>
          <stop offset="100%" stopColor="#3b82f6"/>
        </radialGradient>
      </defs>
      
      <g id="trinity-weave" strokeWidth="4" strokeLinecap="round">
        {/* Outer pentagonal weave */}
        <path 
          d="M 32 8 L 54 22 L 48 48 L 16 48 L 10 22 Z" 
          stroke={`url(#weave-gradient-1-${uniqueId})`}
          fill="none"
          opacity="0.8"
        />
        
        {/* Inner pentagonal weave (offset) */}
        <path 
          d="M 32 14 L 48 26 L 44 44 L 20 44 L 16 26 Z" 
          stroke={`url(#weave-gradient-2-${uniqueId})`}
          fill="none"
          opacity="0.6"
        />
        
        {/* Interlaced ribbons */}
        <path d="M 32 8 Q 40 20 32 32" stroke={`url(#ribbon-1-${uniqueId})`} fill="none"/>
        <path d="M 54 22 Q 42 28 32 32" stroke={`url(#ribbon-2-${uniqueId})`} fill="none"/>
        <path d="M 48 48 Q 38 40 32 32" stroke={`url(#ribbon-3-${uniqueId})`} fill="none"/>
        <path d="M 16 48 Q 26 40 32 32" stroke={`url(#ribbon-4-${uniqueId})`} fill="none"/>
        <path d="M 10 22 Q 22 28 32 32" stroke={`url(#ribbon-5-${uniqueId})`} fill="none"/>
        
        {/* Center nexus */}
        <circle cx="32" cy="32" r="6" fill={`url(#center-nexus-${uniqueId})`} stroke="none">
          {animated && (
            <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" repeatCount="indefinite"/>
          )}
        </circle>
        
        {/* Energy points at vertices */}
        <circle cx="32" cy="8" r="3" fill="#60a5fa">
          {animated && (
            <animate attributeName="r" values="3;4;3" dur="1.5s" repeatCount="indefinite"/>
          )}
        </circle>
        <circle cx="54" cy="22" r="3" fill="#8b5cf6">
          {animated && (
            <animate attributeName="r" values="3;4;3" dur="1.5s" repeatCount="indefinite" begin="0.3s"/>
          )}
        </circle>
        <circle cx="48" cy="48" r="3" fill="#22d3ee">
          {animated && (
            <animate attributeName="r" values="3;4;3" dur="1.5s" repeatCount="indefinite" begin="0.6s"/>
          )}
        </circle>
        <circle cx="16" cy="48" r="3" fill="#a78bfa">
          {animated && (
            <animate attributeName="r" values="3;4;3" dur="1.5s" repeatCount="indefinite" begin="0.9s"/>
          )}
        </circle>
        <circle cx="10" cy="22" r="3" fill="#818cf8">
          {animated && (
            <animate attributeName="r" values="3;4;3" dur="1.5s" repeatCount="indefinite" begin="1.2s"/>
          )}
        </circle>
      </g>
    </svg>
  );
}

export default CelticTrinityKnot;
