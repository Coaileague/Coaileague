import { cn } from "@/lib/utils";
import { logoConfig, getLogoSize, isAnimationEnabled, getAnimationConfig } from "@/config/logoConfig";

interface AutoForceAFLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  variant?: "icon" | "full" | "wordmark";
  animated?: boolean;
  className?: string;
}

/**
 * AutoForce™ Premium Logo - Autonomous Network with "AF" Integration
 * The "AF" is elegantly integrated into the network nodes and flows
 */
export function AutoForceAFLogo({
  size = "md",
  variant = "icon",
  animated = true,
  className,
}: AutoForceAFLogoProps) {
  const sizeConfig = getLogoSize(size);

  // Professional Autonomous Network Icon with "AF" Integration
  const AutonomousNetworkIcon = () => (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: animated ? "drop-shadow(0 4px 12px rgba(59, 130, 246, 0.25))" : "none" }}
    >
      <defs>
        <style>{`
          ${getAnimationConfig("pulseCore").keyframes}
          ${getAnimationConfig("flowNode").keyframes}
          ${getAnimationConfig("rotateRing").keyframes}
          ${getAnimationConfig("flowEnergy").keyframes}
          ${getAnimationConfig("glowPulse").keyframes}

          .core-node {
            animation: ${animated ? `pulse-core ${getAnimationConfig("pulseCore").duration} ease-in-out infinite` : "none"};
          }

          .orbital-node {
            animation: ${animated ? `flow-node ${getAnimationConfig("flowNode").duration} ease-in-out infinite` : "none"};
          }

          .connection-line {
            stroke-dasharray: 100;
            animation: ${animated ? `flow-energy ${getAnimationConfig("flowEnergy").duration} ease-in-out infinite` : "none"};
          }

          .outer-ring {
            animation: ${animated ? `rotate-ring ${getAnimationConfig("rotateRing").duration} linear infinite` : "none"};
          }

          .af-letter {
            font-family: 'Inter', '-apple-system', 'Segoe UI', sans-serif;
            font-weight: 800;
            font-size: 14;
            fill: white;
            pointer-events: none;
          }

          .af-accent {
            animation: ${animated ? `flow-node ${getAnimationConfig("flowNode").duration} ease-in-out infinite` : "none"};
          }
        `}</style>

        <radialGradient id="coreGradient">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="1" />
          <stop offset="100%" stopColor="hsl(217, 91%, 60%)" stopOpacity="0.8" />
        </radialGradient>

        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer rotating ring */}
      <circle
        className="outer-ring"
        cx="50"
        cy="50"
        r="44"
        fill="none"
        stroke="hsl(217, 91%, 60%)"
        strokeWidth="1"
        opacity="0.2"
        strokeDasharray="8,4"
      />

      {/* Connection lines with flowing energy */}
      <line
        className="connection-line"
        x1="50"
        y1="50"
        x2="50"
        y2="18"
        stroke="hsl(var(--primary))"
        strokeWidth="1.5"
        opacity="0.6"
      />
      <line
        className="connection-line"
        x1="50"
        y1="50"
        x2="73"
        y2="68"
        stroke="hsl(var(--primary))"
        strokeWidth="1.5"
        opacity="0.6"
      />
      <line
        className="connection-line"
        x1="50"
        y1="50"
        x2="27"
        y2="68"
        stroke="hsl(var(--primary))"
        strokeWidth="1.5"
        opacity="0.6"
      />

      {/* Central core - Platform nucleus */}
      <circle
        className="core-node"
        cx="50"
        cy="50"
        r="5.5"
        fill="url(#coreGradient)"
        filter="url(#glow)"
      />

      {/* "A" letter in top-left node (Autonomous) */}
      <g className="af-accent">
        <circle
          cx="50"
          cy="18"
          r="4.5"
          fill="hsl(217, 91%, 60%)"
          opacity="0.85"
          filter="url(#glow)"
        />
        <text x="50" y="21" textAnchor="middle" className="af-letter" fontSize="13">
          A
        </text>
      </g>

      {/* "F" letter in bottom-right node (Force) */}
      <g className="af-accent" style={{ animationDelay: "0.6s" }}>
        <circle
          cx="73"
          cy="68"
          r="4.5"
          fill="hsl(217, 91%, 60%)"
          opacity="0.85"
          filter="url(#glow)"
        />
        <text x="73" y="71" textAnchor="middle" className="af-letter" fontSize="13">
          F
        </text>
      </g>

      {/* Supporting node */}
      <g className="af-accent" style={{ animationDelay: "1.2s" }}>
        <circle
          cx="27"
          cy="68"
          r="4.5"
          fill="hsl(217, 91%, 60%)"
          opacity="0.7"
          filter="url(#glow)"
        />
        {/* Small accent dot instead of letter for balance */}
        <circle cx="27" cy="68" r="1" fill="hsl(60, 100%, 50%)" />
      </g>

      {/* Energy pulse around core */}
      <circle
        cx="50"
        cy="50"
        r="8"
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="0.5"
        opacity={animated ? 0.4 : 0.2}
        style={{
          animation: animated ? `glow-pulse ${getAnimationConfig("glowPulse").duration} ease-in-out infinite` : "none",
        }}
      />
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
        {/* Subtle shimmer on hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-20 bg-gradient-to-br from-white to-transparent transition-opacity duration-300" />

        {/* Icon with embedded AF */}
        <div className="relative z-10 w-2/3 h-2/3 text-white">
          <AutonomousNetworkIcon />
        </div>
      </div>
    );
  }

  // Full variant - Icon + brand text
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
        <div className="absolute inset-0 opacity-0 group-hover:opacity-20 bg-gradient-to-br from-white to-transparent transition-opacity duration-300" />
        <div className="relative z-10 w-2/3 h-2/3 text-white">
          <AutonomousNetworkIcon />
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
