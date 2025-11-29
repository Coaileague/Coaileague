import { cn } from "@/lib/utils";

interface CoAIleagueLogoProps {
  width?: number | string;
  height?: number | string;
  showTagline?: boolean;
  showWordmark?: boolean;
  className?: string;
  onlyIcon?: boolean;
  variant?: "light" | "dark" | "auto";
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
}: CoAIleagueLogoProps) {
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

  // Icon-only mode
  if (onlyIcon) {
    return (
      <svg
        width={scaledWidth}
        height={scaledHeight}
        viewBox="0 0 60 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("transition-transform duration-200 max-w-full h-auto", className)}
      >
        <defs>
          <linearGradient id="iconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors.gradientStart} />
            <stop offset="50%" stopColor={colors.gradientMid} />
            <stop offset="100%" stopColor={colors.gradientEnd} />
          </linearGradient>
        </defs>
        {/* Interlocking C and A loop */}
        <g transform="translate(8, 8)">
          <path
            d="M22 4C12.059 4 4 12.059 4 22s8.059 18 18 18c4.97 0 9.47-2.015 12.728-5.272l-2.828-2.828C29.134 34.666 25.756 36 22 36c-7.732 0-14-6.268-14-14s6.268-14 14-14c3.756 0 7.134 1.334 9.9 3.1l2.828-2.828C31.47 5.015 26.97 4 22 4z"
            fill="url(#iconGrad)"
          />
          <path
            d="M32 18l-6 12h-4l4-8H20l-2 4h-4l6-12h4l-4 8h6l2-4h4z"
            fill="url(#iconGrad)"
          />
          <circle cx="38" cy="22" r="4" fill="url(#iconGrad)" opacity="0.8" />
        </g>
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
        <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={colors.gradientStart} />
          <stop offset="50%" stopColor={colors.gradientMid} />
          <stop offset="100%" stopColor={colors.gradientEnd} />
        </linearGradient>
      </defs>

      {/* Icon - Stylized interlocking loop */}
      <g transform="translate(2, 5)">
        {/* Outer C curve */}
        <path
          d="M20 2C10.059 2 2 10.059 2 20s8.059 18 18 18c4.5 0 8.6-1.8 11.6-4.7l-2.4-2.4C26.6 33.3 23.5 35 20 35c-8.3 0-15-6.7-15-15s6.7-15 15-15c3.5 0 6.6 1.2 9.2 3.4l2.4-2.4C28.6 3.8 24.5 2 20 2z"
          fill="url(#brandGrad)"
        />
        {/* Inner A shape */}
        <path
          d="M28 14l-5 11h-3.5l3.5-7h-5l-1.5 3.5h-3.5l5-11h3.5l-3.5 7h5l1.5-3.5h3.5z"
          fill="url(#brandGrad)"
        />
        {/* Decorative dot */}
        <circle cx="34" cy="20" r="3.5" fill="url(#brandGrad)" opacity="0.7" />
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
            <tspan fill={colors.textPrimary}>AI</tspan>
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
