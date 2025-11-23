import { cn } from "@/lib/utils";
import { logoConfig, getLogoSize, isAnimationEnabled, getAnimationConfig } from "@/config/logoConfig";

interface AutoForceAFLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  variant?: "icon" | "full" | "wordmark";
  animated?: boolean;
  className?: string;
}

/**
 * AutoForce™ Premium Modern Logo
 * High-tech geometric design with smooth animations
 * All settings from centralized logoConfig
 */
export function AutoForceAFLogo({
  size = "md",
  variant = "icon",
  animated = true,
  className,
}: AutoForceAFLogoProps) {
  const sizeConfig = getLogoSize(size);
  const glowAnimation = isAnimationEnabled("glow") ? getAnimationConfig("glow") : null;
  const iconPulse = isAnimationEnabled("iconPulse") ? getAnimationConfig("iconPulse") : null;

  // Geometric A icon component
  const GeometricA = () => (
    <svg
      viewBox={logoConfig.geometricA.viewBox}
      className="w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <style>{`
          ${logoConfig.animations.iconPulse.keyframes}
          ${logoConfig.animations.glow.keyframes}
          ${logoConfig.animations.rotateRing.keyframes}
          ${logoConfig.animations.shimmer.keyframes}
          
          .geometric-line {
            animation: ${animated ? `shimmer ${logoConfig.animations.shimmer.duration} ${logoConfig.animations.shimmer.timingFunction} infinite` : "none"};
            transition: stroke-width 0.3s ease;
          }
          
          .geometric-line:hover {
            stroke-width: 7;
          }
        `}</style>
      </defs>

      {/* Left diagonal */}
      <path
        className="geometric-line"
        d="M 30 80 L 50 20"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Right diagonal */}
      <path
        className="geometric-line"
        d="M 70 80 L 50 20"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Horizontal crossbar */}
      <path
        className="geometric-line"
        d="M 38 55 L 62 55"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Tech accent circles at apex */}
      <circle
        cx="50"
        cy="18"
        r="3.5"
        fill="hsl(60, 100%, 50%)"
        opacity={animated ? 0.8 : 1}
        style={{
          animation: animated ? `shimmer ${logoConfig.animations.shimmer.duration} ${logoConfig.animations.shimmer.timingFunction} infinite` : "none",
        }}
      />
    </svg>
  );

  // Wordmark only
  if (variant === "wordmark") {
    return (
      <div className={cn("flex items-center gap-1 flex-wrap", className)}>
        <span className="font-bold tracking-tight text-slate-900 dark:text-white" style={{ fontSize: `${logoConfig.sizes.text[size].match(/\\d+/)?.[0] || 24}px` }}>
          {logoConfig.brand.name}
        </span>
        <span className="text-xs align-super text-slate-900 dark:text-white">
          {logoConfig.brand.trademark}
        </span>
      </div>
    );
  }

  // Icon variant - Premium modern badge
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
        style={{
          animation: animated && iconPulse ? `${iconPulse.duration} ${iconPulse.timingFunction} infinite` : "none",
          animationName: animated ? "icon-pulse" : "none",
        }}
      >
        {/* Background gradient shimmer */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-20 bg-gradient-to-br from-white to-transparent transition-opacity duration-300" />

        {/* Glow effect background */}
        {animated && glowAnimation && (
          <div
            className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              background: `radial-gradient(circle, rgba(59, 130, 246, 0.3), transparent)`,
              animation: `glow-pulse ${glowAnimation.duration} ${glowAnimation.timingFunction} infinite`,
              animationPlayState: animated ? "running" : "paused",
            }}
          />
        )}

        {/* Geometric A icon */}
        <div className="relative z-10 w-3/4 h-3/4 text-white">
          <GeometricA />
        </div>
      </div>
    );
  }

  // Full variant - Icon + text
  return (
    <div className={cn("flex items-center gap-3 sm:gap-4", className)}>
      {/* Premium icon with halo effect */}
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
        style={{
          animation: animated ? `icon-pulse ${getAnimationConfig("iconPulse").duration} ${getAnimationConfig("iconPulse").timingFunction} infinite` : "none",
        }}
      >
        {/* Glow effect */}
        {animated && glowAnimation && (
          <div
            className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              background: `radial-gradient(circle, rgba(59, 130, 246, 0.3), transparent)`,
              animation: `glow-pulse ${glowAnimation.duration} ${glowAnimation.timingFunction} infinite`,
            }}
          />
        )}

        {/* Geometric A */}
        <div className="relative z-10 w-2/3 h-2/3 text-white">
          <GeometricA />
        </div>
      </div>

      {/* Text content */}
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

// Backward compatibility
export { AutoForceAFLogo as AnimatedAutoForceLogo };
