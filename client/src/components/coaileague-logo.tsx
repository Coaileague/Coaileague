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

  // Icon-only mode - Trinity Triquetra (STATIC) with FILLED brand teal/cyan palette
  if (onlyIcon) {
    return (
      <svg
        width={scaledWidth}
        height={scaledHeight}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("transition-transform duration-200 max-w-full h-auto", className)}
      >
        <defs>
          <linearGradient id={`tealGrad-${iconId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2dd4bf" />
            <stop offset="100%" stopColor="#14b8a6" />
          </linearGradient>
          <linearGradient id={`cyanGrad-${iconId}`} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
          <linearGradient id={`blueGrad-${iconId}`} x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#0ea5e9" />
          </linearGradient>
          <radialGradient id={`coreGrad-${iconId}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#22d3ee" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.5" />
          </radialGradient>
          <filter id={`glowFilter-${iconId}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        {/* Trinity Triquetra - Three interlocking FILLED loops */}
        <path d="M 50 12 C 70 12, 82 30, 82 48 C 82 58, 72 70, 50 50 C 28 70, 18 58, 18 48 C 18 30, 30 12, 50 12 Z" fill={`url(#tealGrad-${iconId})`} opacity="0.9" filter={`url(#glowFilter-${iconId})`}/>
        <path d="M 22 80 C 10 68, 10 48, 22 36 C 32 26, 48 32, 50 50 C 42 64, 30 76, 22 80 C 32 92, 48 90, 50 78 Z" fill={`url(#cyanGrad-${iconId})`} opacity="0.85" filter={`url(#glowFilter-${iconId})`}/>
        <path d="M 78 80 C 90 68, 90 48, 78 36 C 68 26, 52 32, 50 50 C 58 64, 70 76, 78 80 C 68 92, 52 90, 50 78 Z" fill={`url(#blueGrad-${iconId})`} opacity="0.85" filter={`url(#glowFilter-${iconId})`}/>
        <circle cx="50" cy="50" r="10" fill={`url(#coreGrad-${iconId})`} filter={`url(#glowFilter-${iconId})`}/>
        <circle cx="50" cy="50" r="5" fill="#ffffff" opacity="0.95"/>
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

      {/* Trinity Triquetra Icon (Static) with FILLED brand colors */}
      <g transform="translate(5, 5) scale(0.4)">
        <defs>
          <linearGradient id={`tealGradFull-${iconId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2dd4bf" />
            <stop offset="100%" stopColor="#14b8a6" />
          </linearGradient>
          <linearGradient id={`cyanGradFull-${iconId}`} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
          <linearGradient id={`blueGradFull-${iconId}`} x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#0ea5e9" />
          </linearGradient>
          <radialGradient id={`coreGradFull-${iconId}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#22d3ee" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.5" />
          </radialGradient>
        </defs>
        {/* Trinity Triquetra - Three interlocking FILLED loops */}
        <path d="M 50 12 C 70 12, 82 30, 82 48 C 82 58, 72 70, 50 50 C 28 70, 18 58, 18 48 C 18 30, 30 12, 50 12 Z" fill={`url(#tealGradFull-${iconId})`} opacity="0.9"/>
        <path d="M 22 80 C 10 68, 10 48, 22 36 C 32 26, 48 32, 50 50 C 42 64, 30 76, 22 80 C 32 92, 48 90, 50 78 Z" fill={`url(#cyanGradFull-${iconId})`} opacity="0.85"/>
        <path d="M 78 80 C 90 68, 90 48, 78 36 C 68 26, 52 32, 50 50 C 58 64, 70 76, 78 80 C 68 92, 52 90, 50 78 Z" fill={`url(#blueGradFull-${iconId})`} opacity="0.85"/>
        <circle cx="50" cy="50" r="10" fill={`url(#coreGradFull-${iconId})`}/>
        <circle cx="50" cy="50" r="5" fill="#ffffff" opacity="0.95"/>
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
