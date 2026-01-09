import { cn } from "@/lib/utils";
import { useState, useEffect, useMemo, useId } from "react";
import { getCurrentHoliday } from "@/config/mascotConfig";
import { CelticTrinityKnot } from "@/components/ui/celtic-trinity-knot";

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

  // Icon-only mode - Celtic Trinity Knot with 5-fold interwoven pattern
  if (onlyIcon) {
    return (
      <CelticTrinityKnot 
        size={typeof scaledWidth === 'number' ? scaledWidth : 40}
        className={cn("transition-transform duration-200 max-w-full h-auto", className)}
        animated={true}
      />
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

      {/* Celtic Trinity Knot - 5-fold interwoven ribbon pattern */}
      <g transform="translate(5, 5) scale(0.625)">
        <defs>
          <linearGradient id={`weave1-${iconId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6"/>
            <stop offset="50%" stopColor="#8b5cf6"/>
            <stop offset="100%" stopColor="#06b6d4"/>
          </linearGradient>
          <linearGradient id={`weave2-${iconId}`} x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#a78bfa"/>
            <stop offset="50%" stopColor="#60a5fa"/>
            <stop offset="100%" stopColor="#22d3ee"/>
          </linearGradient>
          <linearGradient id={`rib1-${iconId}`}><stop offset="0%" stopColor="#3b82f6"/><stop offset="100%" stopColor="#60a5fa"/></linearGradient>
          <linearGradient id={`rib2-${iconId}`}><stop offset="0%" stopColor="#8b5cf6"/><stop offset="100%" stopColor="#a78bfa"/></linearGradient>
          <linearGradient id={`rib3-${iconId}`}><stop offset="0%" stopColor="#06b6d4"/><stop offset="100%" stopColor="#22d3ee"/></linearGradient>
          <linearGradient id={`rib4-${iconId}`}><stop offset="0%" stopColor="#6366f1"/><stop offset="100%" stopColor="#818cf8"/></linearGradient>
          <linearGradient id={`rib5-${iconId}`}><stop offset="0%" stopColor="#7c3aed"/><stop offset="100%" stopColor="#a78bfa"/></linearGradient>
          <radialGradient id={`nexus-${iconId}`}><stop offset="0%" stopColor="#ffffff"/><stop offset="50%" stopColor="#60a5fa"/><stop offset="100%" stopColor="#3b82f6"/></radialGradient>
        </defs>
        <g strokeWidth="3" strokeLinecap="round">
          <path d="M 32 8 L 54 22 L 48 48 L 16 48 L 10 22 Z" stroke={`url(#weave1-${iconId})`} fill="none" opacity="0.8"/>
          <path d="M 32 14 L 48 26 L 44 44 L 20 44 L 16 26 Z" stroke={`url(#weave2-${iconId})`} fill="none" opacity="0.6"/>
          <path d="M 32 8 Q 40 20 32 32" stroke={`url(#rib1-${iconId})`} fill="none"/>
          <path d="M 54 22 Q 42 28 32 32" stroke={`url(#rib2-${iconId})`} fill="none"/>
          <path d="M 48 48 Q 38 40 32 32" stroke={`url(#rib3-${iconId})`} fill="none"/>
          <path d="M 16 48 Q 26 40 32 32" stroke={`url(#rib4-${iconId})`} fill="none"/>
          <path d="M 10 22 Q 22 28 32 32" stroke={`url(#rib5-${iconId})`} fill="none"/>
          <circle cx="32" cy="32" r="5" fill={`url(#nexus-${iconId})`}/>
          <circle cx="32" cy="8" r="2.5" fill="#60a5fa"/>
          <circle cx="54" cy="22" r="2.5" fill="#8b5cf6"/>
          <circle cx="48" cy="48" r="2.5" fill="#22d3ee"/>
          <circle cx="16" cy="48" r="2.5" fill="#a78bfa"/>
          <circle cx="10" cy="22" r="2.5" fill="#818cf8"/>
        </g>
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
