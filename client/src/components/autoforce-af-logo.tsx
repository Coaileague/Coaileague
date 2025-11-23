import { cn } from "@/lib/utils";
import { logoConfig, getLogoSize } from "@/config/logoConfig";

interface AutoForceAFLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  variant?: "icon" | "full" | "wordmark";
  animated?: boolean;
  className?: string;
}

/**
 * AutoForce™ Energy-Based Logo
 * 
 * A and F form from pulsing energy, glow while visible, then dissolve back into the energy.
 * Clean cycle: Energy releases → Letters appear & glow → Letters fade → Energy resets
 */
export function AutoForceAFLogo({
  size = "md",
  variant = "icon",
  animated = true,
  className,
}: AutoForceAFLogoProps) {
  const sizeConfig = getLogoSize(size);

  /**
   * Energy-Driven AF Logo - Letters emerge from and dissolve into glowing energy
   */
  const EnergyAFLogo = () => (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: animated ? "drop-shadow(0 6px 20px rgba(255, 193, 7, 0.5))" : "none" }}
    >
      <defs>
        <style>{`
          @keyframes energy-pulse {
            0% {
              r: 2;
              opacity: 1;
              filter: drop-shadow(0 0 3px rgba(255, 193, 7, 0.8));
            }
            50% {
              r: 8;
              opacity: 0.3;
              filter: drop-shadow(0 0 12px rgba(255, 193, 7, 0.4));
            }
            100% {
              r: 2;
              opacity: 1;
              filter: drop-shadow(0 0 3px rgba(255, 193, 7, 0.8));
            }
          }

          @keyframes letter-appear {
            0% {
              opacity: 0;
              filter: drop-shadow(0 0 0px rgba(255, 193, 7, 0));
            }
            25% {
              opacity: 1;
              filter: drop-shadow(0 0 10px rgba(255, 193, 7, 0.9));
            }
            75% {
              opacity: 1;
              filter: drop-shadow(0 0 10px rgba(255, 193, 7, 0.9));
            }
            100% {
              opacity: 0;
              filter: drop-shadow(0 0 0px rgba(255, 193, 7, 0));
            }
          }

          @keyframes energy-flow-a {
            0% { 
              stroke-dashoffset: 60; 
              opacity: 0; 
            }
            15% { 
              opacity: 0.6; 
            }
            50% { 
              stroke-dashoffset: 0; 
              opacity: 0.6; 
            }
            85% {
              opacity: 0.6;
            }
            100% { 
              stroke-dashoffset: -60; 
              opacity: 0; 
            }
          }

          @keyframes energy-flow-f {
            0% { 
              stroke-dashoffset: 60; 
              opacity: 0; 
            }
            20% { 
              opacity: 0.6; 
            }
            55% { 
              stroke-dashoffset: 0; 
              opacity: 0.6; 
            }
            80% {
              opacity: 0.6;
            }
            100% { 
              stroke-dashoffset: -60; 
              opacity: 0; 
            }
          }

          .energy-core {
            animation: energy-pulse 4s ease-in-out infinite;
          }

          .letter-a {
            animation: letter-appear 4s ease-in-out infinite;
          }

          .letter-f {
            animation: letter-appear 4s ease-in-out infinite 0.15s;
          }

          .energy-to-a {
            stroke-dasharray: 60;
            animation: energy-flow-a 4s ease-in-out infinite;
          }

          .energy-to-f {
            stroke-dasharray: 60;
            animation: energy-flow-f 4s ease-in-out infinite 0.15s;
          }
        `}</style>

        {/* Gradients */}
        <radialGradient id="energyGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFD700" stopOpacity="1" />
          <stop offset="100%" stopColor="#FFC107" stopOpacity="0.3" />
        </radialGradient>

        <linearGradient id="whiteStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F0F0F0" />
        </linearGradient>
      </defs>

      {/* ========== CENTRAL ENERGY CORE ========== */}
      <circle cx="50" cy="50" r="2.5" fill="url(#energyGradient)" className="energy-core" />

      {/* ========== ENERGY FLOWS TO LETTERS ========== */}
      {/* Flow to A (left) */}
      <path
        className="energy-to-a"
        d="M 50 50 L 32 28"
        stroke="#FFC107"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />

      {/* Flow to F (right) */}
      <path
        className="energy-to-f"
        d="M 50 50 L 68 28"
        stroke="#FFB300"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />

      {/* ========== LETTER "A" - PROPER TRIANGLE SHAPE ========== */}
      <g className="letter-a">
        {/* Left diagonal stroke of A */}
        <line
          x1="32"
          y1="20"
          x2="18"
          y2="58"
          stroke="url(#whiteStroke)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Right diagonal stroke of A */}
        <line
          x1="32"
          y1="20"
          x2="46"
          y2="58"
          stroke="url(#whiteStroke)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Horizontal crossbar of A */}
        <line
          x1="22"
          y1="38"
          x2="42"
          y2="38"
          stroke="url(#whiteStroke)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* ========== LETTER "F" - PROPER F SHAPE ========== */}
      <g className="letter-f">
        {/* Vertical spine of F */}
        <line
          x1="68"
          y1="20"
          x2="68"
          y2="58"
          stroke="url(#whiteStroke)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Top horizontal bar of F */}
        <line
          x1="68"
          y1="20"
          x2="84"
          y2="20"
          stroke="url(#whiteStroke)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Middle horizontal bar of F */}
        <line
          x1="68"
          y1="39"
          x2="82"
          y2="39"
          stroke="url(#whiteStroke)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* ========== ACCENT RING ========== */}
      <circle cx="50" cy="50" r="48" fill="none" stroke="#FFB300" strokeWidth="0.6" opacity="0.15" />
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
        {/* Shimmer on hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-30 bg-gradient-to-br from-white via-yellow-100 to-transparent transition-opacity duration-500" />

        {/* Icon */}
        <div className="relative z-10 w-3/4 h-3/4 text-white">
          <EnergyAFLogo />
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
        <div className="absolute inset-0 opacity-0 group-hover:opacity-30 bg-gradient-to-br from-white via-yellow-100 to-transparent transition-opacity duration-500" />
        <div className="relative z-10 w-3/4 h-3/4 text-white">
          <EnergyAFLogo />
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
