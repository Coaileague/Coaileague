import { cn } from "@/lib/utils";

interface WorkforceOSLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  showText?: boolean;
  className?: string;
}

/**
 * WorkforceOS Animated Logo - Elite Grade
 * Transparent background, animated glow, gradient WF letters, electric blue OS
 * Blends seamlessly with any background
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
      {/* Animated WF Logo with OS superscript */}
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
            {/* WF Letters Gradient - Navy to Indigo */}
            <linearGradient id={`wf-gradient-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1e3a8a" />
              <stop offset="50%" stopColor="#3730a3" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
            
            {/* Electric Blue for OS - Bright Neon */}
            <linearGradient id={`os-gradient-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="50%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
            
            {/* Animated Glow Filter - Pulses */}
            <filter id={`animated-glow-${uniqueId}`}>
              <feGaussianBlur in="SourceAlpha" stdDeviation="8" result="blur1"/>
              <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur2"/>
              <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur3"/>
              <feMerge>
                <feMergeNode in="blur1"/>
                <feMergeNode in="blur2"/>
                <feMergeNode in="blur3"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            
            {/* Ultra Bright Neon Glow for OS */}
            <filter id={`neon-os-${uniqueId}`}>
              <feGaussianBlur in="SourceAlpha" stdDeviation="10" result="blur1"/>
              <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="blur2"/>
              <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur3"/>
              <feColorMatrix in="blur1" type="matrix" values="
                0 0 0 0 0.2
                0 0 0 0 0.5
                0 0 0 0 1
                0 0 0 1 0"/>
              <feMerge>
                <feMergeNode/>
                <feMergeNode in="blur2"/>
                <feMergeNode in="blur3"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            
            {/* Soft Shadow for Depth */}
            <filter id={`soft-shadow-${uniqueId}`}>
              <feDropShadow dx="0" dy="6" stdDeviation="12" floodOpacity="0.3"/>
            </filter>
          </defs>

          {/* NO BACKGROUND - Transparent, blends with any color */}
          
          <g>
            {/* W - Shadow Layer */}
            <text
              x="50"
              y="82"
              textAnchor="middle"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontSize="64"
              fontWeight="900"
              fill="black"
              opacity="0.2"
              letterSpacing="-6"
            >
              W
            </text>
            
            {/* W - Gradient Fill with Animated Glow */}
            <text
              x="50"
              y="80"
              textAnchor="middle"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontSize="64"
              fontWeight="900"
              fill={`url(#wf-gradient-${uniqueId})`}
              letterSpacing="-6"
              filter={`url(#animated-glow-${uniqueId})`}
              className="animate-pulse"
              style={{ animationDuration: '3s' }}
            >
              W
            </text>
            
            {/* F - Shadow Layer */}
            <text
              x="100"
              y="82"
              textAnchor="middle"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontSize="64"
              fontWeight="900"
              fill="black"
              opacity="0.2"
              letterSpacing="-6"
            >
              F
            </text>
            
            {/* F - Gradient Fill with Animated Glow */}
            <text
              x="100"
              y="80"
              textAnchor="middle"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontSize="64"
              fontWeight="900"
              fill={`url(#wf-gradient-${uniqueId})`}
              letterSpacing="-6"
              filter={`url(#animated-glow-${uniqueId})`}
              className="animate-pulse"
              style={{ animationDuration: '3s', animationDelay: '0.5s' }}
            >
              F
            </text>
            
            {/* OS Superscript - Shadow */}
            <text
              x="120"
              y="43"
              textAnchor="start"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontSize="26"
              fontWeight="900"
              fill="black"
              opacity="0.2"
              letterSpacing="0"
            >
              OS
            </text>
            
            {/* OS Superscript - Electric Blue Neon with Mega Glow */}
            <text
              x="120"
              y="42"
              textAnchor="start"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontSize="26"
              fontWeight="900"
              fill={`url(#os-gradient-${uniqueId})`}
              letterSpacing="0"
              filter={`url(#neon-os-${uniqueId})`}
              className="animate-pulse"
              style={{ animationDuration: '2s' }}
            >
              OS
            </text>
            
            {/* OS Bright Core - Ultra Bright Center */}
            <text
              x="120"
              y="42"
              textAnchor="start"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontSize="26"
              fontWeight="900"
              fill="#ffffff"
              opacity="0.8"
              letterSpacing="0"
              className="animate-pulse"
              style={{ animationDuration: '2s' }}
            >
              OS
            </text>
          </g>
        </svg>
      </div>

      {/* Company Name with Gradient Animation */}
      {showText && (
        <div className="flex flex-col items-center gap-1">
          <div 
            className={cn(
              "font-black tracking-tight text-center leading-none whitespace-nowrap",
              "bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800",
              "bg-clip-text text-transparent",
              "animate-pulse",
              sizes[size].text
            )}
            style={{ animationDuration: '4s' }}
            data-testid="logo-text"
          >
            WorkForceOS™
          </div>
          {size === "hero" && (
            <div className={cn(
              "font-medium text-slate-400 tracking-wide text-center",
              sizes[size].tagline
            )}>
              Elite Workforce Management
            </div>
          )}
        </div>
      )}
    </div>
  );
}
