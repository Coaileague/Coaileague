import { cn } from "@/lib/utils";

interface WorkforceOSLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  showText?: boolean;
  className?: string;
}

/**
 * WorkforceOS Wordmark Logo - Fortune 500 Grade
 * Big "WF" letterform with electric blue "OS" superscript
 * WorkForce + OS = WorkforceOS
 */
export function WorkforceOSLogo({ 
  size = "md", 
  showText = true,
  className 
}: WorkforceOSLogoProps) {
  const uniqueId = Math.random().toString(36).substr(2, 9);
  
  const sizes = {
    sm: {
      container: "w-12 h-10",
      text: "text-sm",
      tagline: "text-[8px]"
    },
    md: {
      container: "w-20 h-16",
      text: "text-lg",
      tagline: "text-[10px]"
    },
    lg: {
      container: "w-28 h-24",
      text: "text-2xl",
      tagline: "text-xs"
    },
    xl: {
      container: "w-36 h-32",
      text: "text-3xl",
      tagline: "text-sm"
    },
    hero: {
      container: "w-56 h-48",
      text: "text-5xl",
      tagline: "text-base"
    }
  };

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      {/* WF Logo with OS superscript */}
      <div 
        className={cn(
          "relative flex items-center justify-center",
          sizes[size].container
        )}
        data-testid="logo-icon"
      >
        <svg
          viewBox="0 0 160 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          <defs>
            {/* Fortune-500 Corporate Blue Gradient - Deep Navy */}
            <linearGradient id={`corp-blue-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1e3a8a" />
              <stop offset="50%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
            
            {/* Bright Electric Blue for "OS" - Neon Effect */}
            <linearGradient id={`electric-blue-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="50%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
            
            {/* Realistic white glow - like real neon tube */}
            <filter id={`white-glow-${uniqueId}`}>
              <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="blur1"/>
              <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur2"/>
              <feGaussianBlur in="SourceAlpha" stdDeviation="1" result="blur3"/>
              <feMerge>
                <feMergeNode in="blur1"/>
                <feMergeNode in="blur2"/>
                <feMergeNode in="blur3"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            
            {/* Ultra realistic blue neon glow - multiple layers */}
            <filter id={`neon-glow-${uniqueId}`}>
              <feGaussianBlur in="SourceAlpha" stdDeviation="8" result="blur1"/>
              <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur2"/>
              <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur3"/>
              <feColorMatrix in="blur1" type="matrix" values="
                0 0 0 0 0.2
                0 0 0 0 0.5
                0 0 0 0 1
                0 0 0 0.8 0"/>
              <feMerge>
                <feMergeNode/>
                <feMergeNode in="blur2"/>
                <feMergeNode in="blur3"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            
            {/* Drop shadow for depth */}
            <filter id={`shadow-${uniqueId}`}>
              <feDropShadow dx="0" dy="4" stdDeviation="8" floodOpacity="0.5"/>
            </filter>
          </defs>

          {/* WF + OS Badge - REALISTIC Lit Advertisement */}
          <g>
            {/* Deep shadow layer for depth */}
            <rect
              x="8"
              y="16"
              width="144"
              height="96"
              rx="20"
              fill="black"
              opacity="0.3"
            />
            
            {/* Rounded rectangle badge - deep corporate blue with shadow */}
            <rect
              x="8"
              y="12"
              width="144"
              height="96"
              rx="20"
              fill={`url(#corp-blue-${uniqueId})`}
              filter={`url(#shadow-${uniqueId})`}
            />
            
            {/* Inner highlight for 3D effect */}
            <rect
              x="10"
              y="14"
              width="140"
              height="92"
              rx="18"
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="1"
            />
            
            {/* W - Shadow */}
            <text
              x="45"
              y="84"
              textAnchor="middle"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontSize="58"
              fontWeight="900"
              fill="black"
              opacity="0.4"
              letterSpacing="-2"
            >
              W
            </text>
            
            {/* W - White with realistic neon glow */}
            <text
              x="45"
              y="82"
              textAnchor="middle"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontSize="58"
              fontWeight="900"
              fill="white"
              letterSpacing="-2"
              filter={`url(#white-glow-${uniqueId})`}
            >
              W
            </text>
            
            {/* F - Shadow */}
            <text
              x="105"
              y="84"
              textAnchor="middle"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontSize="58"
              fontWeight="900"
              fill="black"
              opacity="0.4"
              letterSpacing="-2"
            >
              F
            </text>
            
            {/* F - White with realistic neon glow */}
            <text
              x="105"
              y="82"
              textAnchor="middle"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontSize="58"
              fontWeight="900"
              fill="white"
              letterSpacing="-2"
              filter={`url(#white-glow-${uniqueId})`}
            >
              F
            </text>
            
            {/* OS Superscript - Shadow */}
            <text
              x="128"
              y="43"
              textAnchor="start"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontSize="22"
              fontWeight="900"
              fill="black"
              opacity="0.3"
              letterSpacing="1"
            >
              OS
            </text>
            
            {/* OS Superscript - Electric blue neon */}
            <text
              x="128"
              y="42"
              textAnchor="start"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontSize="22"
              fontWeight="900"
              fill={`url(#electric-blue-${uniqueId})`}
              letterSpacing="1"
              filter={`url(#neon-glow-${uniqueId})`}
            >
              OS
            </text>
            
            {/* Bright core of OS for ultra-bright center */}
            <text
              x="128"
              y="42"
              textAnchor="start"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontSize="22"
              fontWeight="900"
              fill="#ffffff"
              opacity="0.6"
              letterSpacing="1"
            >
              OS
            </text>
          </g>
        </svg>
      </div>

      {/* Company Name */}
      {showText && (
        <div className="flex flex-col items-center gap-1">
          <div 
            className={cn(
              "font-black tracking-tight text-center leading-none",
              "bg-gradient-to-br from-blue-600 to-blue-800",
              "bg-clip-text text-transparent",
              sizes[size].text
            )}
            data-testid="logo-text"
          >
            WorkforceOS
          </div>
          {size === "hero" && (
            <div className={cn("font-medium text-slate-400 tracking-wide text-center", sizes[size].tagline)}>
              Elite Workforce Management
            </div>
          )}
        </div>
      )}
    </div>
  );
}
