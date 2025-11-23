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
 * The "AF" is not just text - it IS the design.
 * Modern geometric letterforms with interconnected network flows.
 * Shows premium tech aesthetic (think Stripe, Apple, Airbnb quality).
 */
export function AutoForceAFLogo({
  size = "md",
  variant = "icon",
  animated = true,
  className,
}: AutoForceAFLogoProps) {
  const sizeConfig = getLogoSize(size);

  /**
   * Premium AF Monogram Icon
   * Sophisticated geometric letterforms with flowing network energy
   */
  const PremiumAFMonogram = () => (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: animated ? "drop-shadow(0 4px 16px rgba(59, 130, 246, 0.3))" : "none" }}
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

          .letter-a { fill: url(#afGradient); }
          .letter-f { fill: url(#afGradientReverse); }
        `}</style>

        {/* Primary gradient for A */}
        <linearGradient id="afGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="1" />
          <stop offset="100%" stopColor="hsl(217, 91%, 60%)" stopOpacity="1" />
        </linearGradient>

        {/* Reverse gradient for F */}
        <linearGradient id="afGradientReverse" x1="100%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="hsl(217, 91%, 60%)" stopOpacity="1" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="1" />
        </linearGradient>

        {/* Glow filter for premium effect */}
        <filter id="premiumGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" />
        </filter>

        <filter id="energyGlow">
          <feGaussianBlur stdDeviation="1" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background circle for optical balance */}
      <circle cx="50" cy="50" r="48" fill="none" stroke="hsl(217, 91%, 60%)" strokeWidth="0.5" opacity="0.1" />

      {/* ========== LETTER "A" (Left) ========== */}
      {/* A - Top point (geometric peak) */}
      <circle cx="32" cy="24" r="2.5" fill="url(#afGradient)" filter="url(#premiumGlow)" />

      {/* A - Bottom left corner */}
      <circle cx="20" cy="62" r="2.5" fill="url(#afGradient)" filter="url(#premiumGlow)" />

      {/* A - Bottom right corner */}
      <circle cx="44" cy="62" r="2.5" fill="url(#afGradient)" filter="url(#premiumGlow)" />

      {/* A - Left edge line */}
      <line x1="32" y1="24" x2="20" y2="62" stroke="url(#afGradient)" strokeWidth="2.5" opacity="0.9" strokeLinecap="round" />

      {/* A - Right edge line */}
      <line x1="32" y1="24" x2="44" y2="62" stroke="url(#afGradient)" strokeWidth="2.5" opacity="0.9" strokeLinecap="round" />

      {/* A - Horizontal crossbar with connection point */}
      <line x1="24" y1="42" x2="40" y2="42" stroke="url(#afGradient)" strokeWidth="2.5" opacity="0.9" strokeLinecap="round" />

      {/* A - Connection node (for energy flow) */}
      <circle cx="32" cy="42" r="1.8" fill="hsl(60, 100%, 50%)" filter="url(#energyGlow)" className="connection-glow" />

      {/* ========== LETTER "F" (Right) ========== */}
      {/* F - Top point */}
      <circle cx="68" cy="24" r="2.5" fill="url(#afGradientReverse)" filter="url(#premiumGlow)" />

      {/* F - Bottom left corner */}
      <circle cx="56" cy="62" r="2.5" fill="url(#afGradientReverse)" filter="url(#premiumGlow)" />

      {/* F - Vertical spine */}
      <line x1="68" y1="24" x2="56" y2="62" stroke="url(#afGradientReverse)" strokeWidth="2.5" opacity="0.9" strokeLinecap="round" />

      {/* F - Top horizontal bar */}
      <line x1="68" y1="24" x2="80" y2="24" stroke="url(#afGradientReverse)" strokeWidth="2.5" opacity="0.9" strokeLinecap="round" />

      {/* F - Middle horizontal bar */}
      <line x1="65" y1="42" x2="77" y2="42" stroke="url(#afGradientReverse)" strokeWidth="2.5" opacity="0.9" strokeLinecap="round" />

      {/* F - Connection node (for energy flow) */}
      <circle cx="71" cy="42" r="1.8" fill="hsl(60, 100%, 50%)" filter="url(#energyGlow)" className="connection-glow" />

      {/* ========== CONNECTING ENERGY FLOWS ========== */}
      {/* Energy flowing from A through center to F */}
      <line
        className="energy-line"
        x1="32"
        y1="42"
        x2="71"
        y2="42"
        stroke="hsl(60, 100%, 50%)"
        strokeWidth="1.2"
        opacity="0.6"
        filter="url(#energyGlow)"
      />

      {/* Accent energy pulse - top arc */}
      <path
        className="energy-line"
        d="M 32 24 Q 50 15 68 24"
        stroke="hsl(217, 91%, 60%)"
        strokeWidth="1"
        fill="none"
        opacity="0.4"
      />

      {/* Accent energy pulse - bottom arc */}
      <path
        className="energy-line"
        d="M 20 62 Q 50 75 80 62"
        stroke="hsl(var(--primary))"
        strokeWidth="1"
        fill="none"
        opacity="0.4"
      />

      {/* Central coordination hub - shows A and F work together */}
      <circle cx="50" cy="50" r="3" fill="url(#afGradient)" opacity="0.6" filter="url(#premiumGlow)" />

      {/* Premium quality accent lines */}
      <circle cx="50" cy="50" r="5" fill="none" stroke="url(#afGradient)" strokeWidth="0.6" opacity="0.25" />
      <circle cx="50" cy="50" r="8" fill="none" stroke="url(#afGradientReverse)" strokeWidth="0.6" opacity="0.15" />
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
        <div className="absolute inset-0 opacity-0 group-hover:opacity-25 bg-gradient-to-br from-white via-transparent to-transparent transition-opacity duration-500" />

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
        <div className="absolute inset-0 opacity-0 group-hover:opacity-25 bg-gradient-to-br from-white via-transparent to-transparent transition-opacity duration-500" />
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
