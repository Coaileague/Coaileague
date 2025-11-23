import { cn } from "@/lib/utils";
import { logoConfig, getLogoSize, getAnimationConfig } from "@/config/logoConfig";

interface AutoForceAFLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  variant?: "icon" | "full" | "wordmark";
  animated?: boolean;
  className?: string;
}

/**
 * AutoForce™ Premium Logo - Sophisticated AF Monogram
 * 
 * Bold, high-contrast AF monogram with eye-catching energy flows.
 * White letters with gold/amber animation for premium aesthetic.
 */
export function AutoForceAFLogo({
  size = "md",
  variant = "icon",
  animated = true,
  className,
}: AutoForceAFLogoProps) {
  const sizeConfig = getLogoSize(size);

  /**
   * Premium AF Monogram Icon - High Contrast Design
   */
  const PremiumAFMonogram = () => (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: animated ? "drop-shadow(0 6px 20px rgba(255, 193, 7, 0.4))" : "none" }}
    >
      <defs>
        <style>{`
          ${getAnimationConfig("glowPulse").keyframes}
          ${getAnimationConfig("flowEnergy").keyframes}

          .energy-line {
            stroke-dasharray: 50;
            animation: ${animated ? `flow-energy ${getAnimationConfig("flowEnergy").duration} ease-in-out infinite` : "none"};
          }

          .connection-glow {
            animation: ${animated ? `glow-pulse ${getAnimationConfig("glowPulse").duration} ease-in-out infinite` : "none"};
          }

          .letter-glow {
            animation: ${animated ? `glow-pulse ${getAnimationConfig("glowPulse").duration} ease-in-out infinite 0.3s` : "none"};
          }
        `}</style>

        {/* White gradient for letters - stands out against blue */}
        <linearGradient id="whiteGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#F5F5F5" stopOpacity="1" />
        </linearGradient>

        {/* Gold/Amber for energy flows - eye-catching contrast */}
        <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFC107" stopOpacity="1" />
          <stop offset="100%" stopColor="#FFB300" stopOpacity="1" />
        </linearGradient>

        {/* Premium glow effect */}
        <filter id="premiumGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
        </filter>

        <filter id="energyGlow">
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Accent glow - subtle ring */}
        <filter id="accentGlow">
          <feGaussianBlur stdDeviation="0.8" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background circle for balance - light accent */}
      <circle cx="50" cy="50" r="48" fill="none" stroke="#FFB300" strokeWidth="0.8" opacity="0.15" />

      {/* ========== LETTER "A" (Left) - WHITE, BOLD ========== */}
      {/* A - Top point */}
      <circle cx="32" cy="24" r="3" fill="url(#whiteGradient)" filter="url(#premiumGlow)" className="letter-glow" />

      {/* A - Bottom left corner */}
      <circle cx="20" cy="62" r="3" fill="url(#whiteGradient)" filter="url(#premiumGlow)" className="letter-glow" />

      {/* A - Bottom right corner */}
      <circle cx="44" cy="62" r="3" fill="url(#whiteGradient)" filter="url(#premiumGlow)" className="letter-glow" />

      {/* A - Left edge line - BRIGHT WHITE */}
      <line x1="32" y1="24" x2="20" y2="62" stroke="#FFFFFF" strokeWidth="3" opacity="1" strokeLinecap="round" filter="url(#premiumGlow)" />

      {/* A - Right edge line - BRIGHT WHITE */}
      <line x1="32" y1="24" x2="44" y2="62" stroke="#FFFFFF" strokeWidth="3" opacity="1" strokeLinecap="round" filter="url(#premiumGlow)" />

      {/* A - Horizontal crossbar - BRIGHT WHITE */}
      <line x1="24" y1="42" x2="40" y2="42" stroke="#FFFFFF" strokeWidth="3" opacity="1" strokeLinecap="round" filter="url(#premiumGlow)" />

      {/* A - Connection node - GOLD/AMBER (eye-catching) */}
      <circle cx="32" cy="42" r="2.2" fill="url(#goldGradient)" filter="url(#energyGlow)" className="connection-glow" />

      {/* ========== LETTER "F" (Right) - WHITE, BOLD ========== */}
      {/* F - Top point */}
      <circle cx="68" cy="24" r="3" fill="url(#whiteGradient)" filter="url(#premiumGlow)" className="letter-glow" />

      {/* F - Bottom left corner */}
      <circle cx="56" cy="62" r="3" fill="url(#whiteGradient)" filter="url(#premiumGlow)" className="letter-glow" />

      {/* F - Vertical spine - BRIGHT WHITE */}
      <line x1="68" y1="24" x2="56" y2="62" stroke="#FFFFFF" strokeWidth="3" opacity="1" strokeLinecap="round" filter="url(#premiumGlow)" />

      {/* F - Top horizontal bar - BRIGHT WHITE */}
      <line x1="68" y1="24" x2="80" y2="24" stroke="#FFFFFF" strokeWidth="3" opacity="1" strokeLinecap="round" filter="url(#premiumGlow)" />

      {/* F - Middle horizontal bar - BRIGHT WHITE */}
      <line x1="65" y1="42" x2="77" y2="42" stroke="#FFFFFF" strokeWidth="3" opacity="1" strokeLinecap="round" filter="url(#premiumGlow)" />

      {/* F - Connection node - GOLD/AMBER (eye-catching) */}
      <circle cx="71" cy="42" r="2.2" fill="url(#goldGradient)" filter="url(#energyGlow)" className="connection-glow" />

      {/* ========== CONNECTING ENERGY FLOWS - GOLD/AMBER ========== */}
      {/* Energy flowing from A through center to F - VIBRANT GOLD */}
      <line
        className="energy-line"
        x1="32"
        y1="42"
        x2="71"
        y2="42"
        stroke="url(#goldGradient)"
        strokeWidth="1.8"
        opacity="0.8"
        filter="url(#energyGlow)"
      />

      {/* Accent energy pulse - top arc - GOLD */}
      <path
        className="energy-line"
        d="M 32 24 Q 50 15 68 24"
        stroke="#FFC107"
        strokeWidth="1.2"
        fill="none"
        opacity="0.7"
        filter="url(#accentGlow)"
      />

      {/* Accent energy pulse - bottom arc - GOLD */}
      <path
        className="energy-line"
        d="M 20 62 Q 50 75 80 62"
        stroke="#FFB300"
        strokeWidth="1.2"
        fill="none"
        opacity="0.7"
        filter="url(#accentGlow)"
      />

      {/* Central coordination hub - GOLD accent */}
      <circle cx="50" cy="50" r="3.5" fill="url(#goldGradient)" opacity="0.8" filter="url(#energyGlow)" className="connection-glow" />

      {/* Premium quality accent rings - GOLD accents */}
      <circle cx="50" cy="50" r="6" fill="none" stroke="url(#goldGradient)" strokeWidth="0.8" opacity="0.4" filter="url(#accentGlow)" />
      <circle cx="50" cy="50" r="10" fill="none" stroke="#FFB300" strokeWidth="0.6" opacity="0.2" />
    </svg>
  );

  // Wordmark variant
  if (variant === "wordmark") {
    return (
      <div className={cn("flex items-center gap-1 flex-wrap", className)}>
        <span className="font-bold tracking-tight text-slate-900 dark:text-white" style={{ fontSize: "24px" }}>
          {logoConfig.brand.name}
        </span>
        <span className="text-xs align-super text-slate-900 dark:text-white">
          {logoConfig.brand.trademark}
        </span>
      </div>
    );
  }

  // Icon only
  if (variant === "icon") {
    return (
      <div
        className={cn(
          "relative inline-flex items-center justify-center",
          logoConfig.badge.shape,
          logoConfig.badge.gradient,
          logoConfig.badge.shadow,
          sizeConfig.container,
          "border",
          logoConfig.badge.border.color,
          "group overflow-hidden",
          className
        )}
        data-testid={`${logoConfig.accessibility.testIdPrefix}-icon`}
      >
        {/* Premium shimmer on hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-30 bg-gradient-to-br from-white via-amber-200 to-transparent transition-opacity duration-500" />

        {/* Icon */}
        <div className="relative z-10 w-3/4 h-3/4 text-white">
          <PremiumAFMonogram />
        </div>
      </div>
    );
  }

  // Full variant - Icon + brand name
  return (
    <div className={cn("flex items-center gap-3 sm:gap-4", className)}>
      <div
        className={cn(
          "relative shrink-0 inline-flex items-center justify-center",
          logoConfig.badge.shape,
          logoConfig.badge.gradient,
          logoConfig.badge.shadow,
          sizeConfig.container,
          "border",
          logoConfig.badge.border.color,
          "group"
        )}
      >
        <div className="absolute inset-0 opacity-0 group-hover:opacity-30 bg-gradient-to-br from-white via-amber-200 to-transparent transition-opacity duration-500" />
        <div className="relative z-10 w-3/4 h-3/4 text-white">
          <PremiumAFMonogram />
        </div>
      </div>

      {/* Brand text */}
      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className={cn("font-black tracking-tight text-slate-900 dark:text-white", logoConfig.sizes.text[size])}>
            {logoConfig.brand.name}
          </span>
          <span className="text-xs align-super text-slate-900 dark:text-white">
            {logoConfig.brand.trademark}
          </span>
        </div>
        <p className={cn("font-medium text-slate-600 dark:text-slate-400 tracking-wide", logoConfig.sizes.tagline[size])}>
          {logoConfig.brand.taglineAlt}
        </p>
      </div>
    </div>
  );
}

export { AutoForceAFLogo as AnimatedAutoForceLogo };
