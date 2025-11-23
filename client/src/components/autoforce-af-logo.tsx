import { cn } from "@/lib/utils";
import { logoConfig, getLogoSize } from "@/config/logoConfig";

interface AutoForceAFLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  variant?: "icon" | "full" | "wordmark";
  animated?: boolean;
  className?: string;
}

/**
 * AutoForce™ Energy-Based AF Logo
 * Letters form from energy, glow, and dissolve back
 */
export function AutoForceAFLogo({
  size = "md",
  variant = "icon",
  animated = true,
  className,
}: AutoForceAFLogoProps) {
  const sizeConfig = getLogoSize(size);

  const EnergyAFLogo = () => (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <style>
          {`
          @keyframes pulse-energy {
            0%, 100% { r: 2.5; opacity: 1; filter: drop-shadow(0 0 4px rgba(255, 193, 7, 1)); }
            50% { r: 8; opacity: 0.3; filter: drop-shadow(0 0 15px rgba(255, 193, 7, 0.5)); }
          }

          @keyframes fade-letters {
            0% { opacity: 0; }
            20% { opacity: 1; }
            80% { opacity: 1; }
            100% { opacity: 0; }
          }

          @keyframes glow-letters {
            0%, 100% { filter: drop-shadow(0 0 0px rgba(255, 193, 7, 0)); }
            20%, 80% { filter: drop-shadow(0 0 10px rgba(255, 193, 7, 0.8)); }
          }

          .energy { animation: pulse-energy 4s ease-in-out infinite; }
          .letter-a { animation: fade-letters 4s ease-in-out infinite, glow-letters 4s ease-in-out infinite; }
          .letter-f { animation: fade-letters 4s ease-in-out infinite 0.15s, glow-letters 4s ease-in-out infinite 0.15s; }
          `}
        </style>
      </defs>

      {/* Energy core */}
      <circle cx="50" cy="50" r="2.5" fill="#FFD700" className="energy" />

      {/* Letter A - Left side */}
      <g className="letter-a">
        <line x1="32" y1="25" x2="18" y2="70" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
        <line x1="32" y1="25" x2="46" y2="70" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
        <line x1="23" y1="48" x2="41" y2="48" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
      </g>

      {/* Letter F - Right side */}
      <g className="letter-f">
        <line x1="68" y1="25" x2="68" y2="70" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
        <line x1="68" y1="25" x2="82" y2="25" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
        <line x1="68" y1="47" x2="80" y2="47" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
      </g>
    </svg>
  );

  if (variant === "wordmark") {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <span className="font-bold text-slate-900 dark:text-white" style={{ fontSize: "24px" }}>
          {logoConfig.brand.name}
        </span>
        <span className="text-xs align-super text-slate-900 dark:text-white">
          {logoConfig.brand.trademark}
        </span>
      </div>
    );
  }

  if (variant === "icon") {
    return (
      <div
        className={cn(
          "relative inline-flex items-center justify-center",
          logoConfig.badge.shape,
          logoConfig.badge.gradient,
          logoConfig.badge.shadow,
          sizeConfig.container,
          "border border-white/20",
          "group",
          className
        )}
      >
        <div className="absolute inset-0 opacity-0 group-hover:opacity-30 bg-gradient-to-br from-white to-transparent transition-opacity duration-500 rounded-full" />
        <div className="relative z-10 w-3/4 h-3/4">
          <EnergyAFLogo />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div
        className={cn(
          "relative inline-flex items-center justify-center shrink-0",
          logoConfig.badge.shape,
          logoConfig.badge.gradient,
          logoConfig.badge.shadow,
          sizeConfig.container,
          "border border-white/20",
          "group"
        )}
      >
        <div className="absolute inset-0 opacity-0 group-hover:opacity-30 bg-gradient-to-br from-white to-transparent transition-opacity duration-500 rounded-full" />
        <div className="relative z-10 w-3/4 h-3/4">
          <EnergyAFLogo />
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <span className="font-black text-slate-900 dark:text-white text-3xl">
            {logoConfig.brand.name}
          </span>
          <span className="text-xs text-slate-900 dark:text-white">™</span>
        </div>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
          {logoConfig.brand.taglineAlt}
        </p>
      </div>
    </div>
  );
}

export { AutoForceAFLogo as AnimatedAutoForceLogo };
