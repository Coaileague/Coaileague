import { cn } from "@/lib/utils";
import { useState, useEffect, useMemo, useId } from "react";
import { getCurrentHoliday } from "@/config/mascotConfig";

interface CoAIleagueLogoProps {
  width?: number | string;
  height?: number | string;
  showTagline?: boolean;
  showWordmark?: boolean;
  className?: string;
  onlyIcon?: boolean;
  variant?: "light" | "dark" | "auto";
  enableSeasonalEffects?: boolean;
}

/**
 * CoAIleague Logo - Professional interlocking loop design
 * Teal/Cyan gradient brand colors with polished typography
 * Auto-scales to container on mobile
 */
export function CoAIleagueLogo({
  width = 200,
  height = 50,
  showTagline = false,
  showWordmark = true,
  className,
  onlyIcon = false,
  variant = "auto",
  enableSeasonalEffects = true,
}: CoAIleagueLogoProps) {
  const [isChristmas, setIsChristmas] = useState(false);
  const [glowPhase, setGlowPhase] = useState(0);

  // Detect Christmas season
  useEffect(() => {
    if (!enableSeasonalEffects) return;
    
    const holiday = getCurrentHoliday();
    setIsChristmas(holiday?.key === 'christmas');
  }, [enableSeasonalEffects]);

  // Animate glow colors for Christmas - smooth continuous animation
  useEffect(() => {
    if (!isChristmas) return;
    
    const interval = setInterval(() => {
      setGlowPhase(prev => (prev + 1) % 4);
    }, 1800); // Slower, more elegant cycling
    
    return () => clearInterval(interval);
  }, [isChristmas]);

  // Brand-safe seasonal glow colors using teal/cyan palette variations
  // Maintains brand compliance during all seasons
  const christmasGlowA = useMemo(() => {
    const colors = [
      { color: '#2dd4bf', glow: 'drop-shadow(0 0 6px #2dd4bf) drop-shadow(0 0 12px #2dd4bf50)' }, // Teal-400
      { color: '#06b6d4', glow: 'drop-shadow(0 0 6px #06b6d4) drop-shadow(0 0 12px #06b6d450)' }, // Cyan-500
      { color: '#3b82f6', glow: 'drop-shadow(0 0 6px #3b82f6) drop-shadow(0 0 12px #3b82f650)' }, // Blue-500
      { color: '#22d3ee', glow: 'drop-shadow(0 0 6px #22d3ee) drop-shadow(0 0 12px #22d3ee50)' }, // Cyan-400
    ];
    return colors[glowPhase];
  }, [glowPhase]);

  const christmasGlowI = useMemo(() => {
    const colors = [
      { color: '#06b6d4', glow: 'drop-shadow(0 0 6px #06b6d4) drop-shadow(0 0 12px #06b6d450)' }, // Cyan-500
      { color: '#3b82f6', glow: 'drop-shadow(0 0 6px #3b82f6) drop-shadow(0 0 12px #3b82f650)' }, // Blue-500
      { color: '#2dd4bf', glow: 'drop-shadow(0 0 6px #2dd4bf) drop-shadow(0 0 12px #2dd4bf50)' }, // Teal-400
      { color: '#06b6d4', glow: 'drop-shadow(0 0 6px #06b6d4) drop-shadow(0 0 12px #06b6d450)' }, // Cyan-500
    ];
    return colors[glowPhase];
  }, [glowPhase]);

  // Auto-scale logo dimensions for better mobile visibility
  const scaledWidth = typeof width === 'number' ? Math.max(width, 40) : width;
  const scaledHeight = typeof height === 'number' ? Math.max(height, 40) : height;
  // Check if dark mode - for auto variant
  const isDark = variant === "dark" || 
    (variant === "auto" && typeof document !== 'undefined' && 
     document.documentElement.classList.contains('dark'));

  // Brand colors - teal/cyan gradient
  const colors = {
    gradientStart: isDark ? "#2DD4BF" : "#14B8A6", // teal-400 / teal-500
    gradientMid: isDark ? "#22D3EE" : "#06B6D4",   // cyan-400 / cyan-500
    gradientEnd: isDark ? "#60A5FA" : "#3B82F6",   // blue-400 / blue-500
    textPrimary: isDark ? "#F1F5F9" : "#1E293B",   // slate-100 / slate-800
    textAccent: isDark ? "#22D3EE" : "#0891B2",    // cyan-400 / cyan-600
    textSecondary: isDark ? "#94A3B8" : "#64748B", // slate-400 / slate-500
  };

  // Unique ID for this component instance (SSR-safe)
  const iconId = useId();

  // Icon-only mode - Trinity Bow/Knot (STATIC) with brand teal/cyan palette
  if (onlyIcon) {
    return (
      <svg
        width={scaledWidth}
        height={scaledHeight}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("transition-transform duration-200 max-w-full h-auto", className)}
      >
        <defs>
          <linearGradient id={`tealGrad-${iconId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2dd4bf" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
          <linearGradient id={`cyanGrad-${iconId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <radialGradient id={`coreGrad-${iconId}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.4" />
          </radialGradient>
          <filter id={`glowFilter-${iconId}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        {/* Trinity Bow/Knot - Five-pointed interwoven ribbon with brand colors */}
        <path d="M 100 100 Q 100 55 100 35 Q 105 55 100 100" fill={`url(#tealGrad-${iconId})`} filter={`url(#glowFilter-${iconId})`} opacity="0.95"/>
        <path d="M 100 35 Q 95 55 100 100 Q 100 55 100 35" fill={`url(#tealGrad-${iconId})`} opacity="0.9"/>
        <path d="M 100 100 Q 130 75 155 55 Q 130 80 100 100" fill={`url(#cyanGrad-${iconId})`} filter={`url(#glowFilter-${iconId})`} opacity="0.95"/>
        <path d="M 155 55 Q 125 80 100 100 Q 130 75 155 55" fill={`url(#cyanGrad-${iconId})`} opacity="0.9"/>
        <path d="M 100 100 Q 140 115 160 145 Q 135 120 100 100" fill={`url(#tealGrad-${iconId})`} filter={`url(#glowFilter-${iconId})`} opacity="0.95"/>
        <path d="M 160 145 Q 130 115 100 100 Q 140 115 160 145" fill={`url(#tealGrad-${iconId})`} opacity="0.9"/>
        <path d="M 100 100 Q 60 115 40 145 Q 65 120 100 100" fill={`url(#cyanGrad-${iconId})`} filter={`url(#glowFilter-${iconId})`} opacity="0.95"/>
        <path d="M 40 145 Q 70 115 100 100 Q 60 115 40 145" fill={`url(#cyanGrad-${iconId})`} opacity="0.9"/>
        <path d="M 100 100 Q 70 75 45 55 Q 70 80 100 100" fill={`url(#tealGrad-${iconId})`} filter={`url(#glowFilter-${iconId})`} opacity="0.95"/>
        <path d="M 45 55 Q 75 80 100 100 Q 70 75 45 55" fill={`url(#tealGrad-${iconId})`} opacity="0.9"/>
        <circle cx="100" cy="100" r="18" fill={`url(#coreGrad-${iconId})`} filter={`url(#glowFilter-${iconId})`}/>
        <circle cx="100" cy="100" r="12" fill="#ffffff" opacity="0.9"/>
        <circle cx="100" cy="100" r="6" fill="#22d3ee"/>
      </svg>
    );
  }

  return (
    <svg
      width={scaledWidth}
      height={scaledHeight}
      viewBox="0 0 200 50"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("transition-transform duration-200 max-w-full h-auto", className)}
    >
      <defs>
        <linearGradient id={`brandGrad-${iconId}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={colors.gradientStart} />
          <stop offset="50%" stopColor={colors.gradientMid} />
          <stop offset="100%" stopColor={colors.gradientEnd} />
        </linearGradient>
      </defs>

      {/* Trinity Bow/Knot Icon (Static) with brand colors */}
      <g transform="translate(2, 5) scale(0.2)">
        <defs>
          <linearGradient id={`tealGradFull-${iconId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2dd4bf" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
          <linearGradient id={`cyanGradFull-${iconId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <radialGradient id={`coreGradFull-${iconId}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.4" />
          </radialGradient>
        </defs>
        <path d="M 100 100 Q 100 55 100 35 Q 105 55 100 100" fill={`url(#tealGradFull-${iconId})`} opacity="0.95"/>
        <path d="M 100 100 Q 130 75 155 55 Q 130 80 100 100" fill={`url(#cyanGradFull-${iconId})`} opacity="0.95"/>
        <path d="M 100 100 Q 140 115 160 145 Q 135 120 100 100" fill={`url(#tealGradFull-${iconId})`} opacity="0.95"/>
        <path d="M 100 100 Q 60 115 40 145 Q 65 120 100 100" fill={`url(#cyanGradFull-${iconId})`} opacity="0.95"/>
        <path d="M 100 100 Q 70 75 45 55 Q 70 80 100 100" fill={`url(#tealGradFull-${iconId})`} opacity="0.95"/>
        <circle cx="100" cy="100" r="18" fill={`url(#coreGradFull-${iconId})`}/>
        <circle cx="100" cy="100" r="12" fill="#ffffff" opacity="0.9"/>
        <circle cx="100" cy="100" r="6" fill="#22d3ee"/>
      </g>

      {/* Wordmark */}
      {showWordmark && (
        <g>
          <text
            x="48"
            y="32"
            fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            fontWeight="800"
            fontSize="22"
            letterSpacing="-0.5"
          >
            <tspan fill={colors.textAccent}>Co</tspan>
            <tspan 
              fill={isChristmas ? christmasGlowA.color : colors.textPrimary}
              style={{
                filter: isChristmas ? christmasGlowA.glow : 'none',
                transition: 'fill 0.6s ease, filter 0.6s ease',
              }}
            >A</tspan>
            <tspan 
              fill={isChristmas ? christmasGlowI.color : colors.textPrimary}
              style={{
                filter: isChristmas ? christmasGlowI.glow : 'none',
                transition: 'fill 0.6s ease, filter 0.6s ease',
              }}
            >I</tspan>
            <tspan fill={colors.textAccent}>league</tspan>
          </text>
          <text
            x="168"
            y="22"
            fontFamily="system-ui, sans-serif"
            fontWeight="500"
            fontSize="10"
            fill={colors.textSecondary}
          >
            ™
          </text>
        </g>
      )}

      {/* Tagline */}
      {showTagline && showWordmark && (
        <text
          x="48"
          y="45"
          fontFamily="system-ui, sans-serif"
          fontWeight="500"
          fontSize="8"
          fill={colors.textSecondary}
        >
          Autonomous Management Solutions
        </text>
      )}
    </svg>
  );
}
