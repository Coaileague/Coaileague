import { cn } from "@/lib/utils";
import { logoConfig, getLogoSize } from "@/config/logoConfig";

interface AutoForceStaticLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  variant?: "icon" | "full" | "wordmark";
  className?: string;
}

/**
 * AutoForce™ Static Logo - Non-Animated
 * Use this in forms, dialogs, modals, and places where animation doesn't fit
 */
export function AutoForceStaticLogo({
  size = "md",
  variant = "icon",
  className,
}: AutoForceStaticLogoProps) {
  const sizeConfig = getLogoSize(size);

  const StaticAFLogo = () => (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <linearGradient id="staticWhiteGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F0F0F0" />
        </linearGradient>
      </defs>

      {/* Letter A - Left side - CLEAN & STATIC */}
      <g>
        <line x1="32" y1="25" x2="18" y2="70" stroke="url(#staticWhiteGrad)" strokeWidth="5" strokeLinecap="round" />
        <line x1="32" y1="25" x2="46" y2="70" stroke="url(#staticWhiteGrad)" strokeWidth="5" strokeLinecap="round" />
        <line x1="23" y1="48" x2="41" y2="48" stroke="url(#staticWhiteGrad)" strokeWidth="5" strokeLinecap="round" />
      </g>

      {/* Letter F - Right side - CLEAN & STATIC */}
      <g>
        <line x1="68" y1="25" x2="68" y2="70" stroke="url(#staticWhiteGrad)" strokeWidth="5" strokeLinecap="round" />
        <line x1="68" y1="25" x2="82" y2="25" stroke="url(#staticWhiteGrad)" strokeWidth="5" strokeLinecap="round" />
        <line x1="68" y1="47" x2="80" y2="47" stroke="url(#staticWhiteGrad)" strokeWidth="5" strokeLinecap="round" />
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
          className
        )}
      >
        <div className="relative z-10 w-3/4 h-3/4">
          <StaticAFLogo />
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
          "border border-white/20"
        )}
      >
        <div className="relative z-10 w-3/4 h-3/4">
          <StaticAFLogo />
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
