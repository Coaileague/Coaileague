import { cn } from "@/lib/utils";
import { Zap } from "lucide-react";
import { logoConfig, getLogoSize, isLogoFeatureEnabled } from "@/config/logoConfig";

interface AutoForceAFLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  variant?: "icon" | "full" | "wordmark";
  animated?: boolean;
  showF?: boolean;
  className?: string;
}

/**
 * AutoForce™ Logo Component (Centralized Config)
 * AF lightning bolt in circular gradient badge - all settings from logoConfig
 * Edit logoConfig.ts to update logo everywhere instantly
 */
export function AutoForceAFLogo({
  size = "md",
  variant = "icon",
  animated = false,
  showF = false,
  className,
}: AutoForceAFLogoProps) {
  const sizeConfig = getLogoSize(size);

  // Icon only - AF circular badge with lightning bolt
  if (variant === "icon") {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center shrink-0",
          logoConfig.badge.shape,
          logoConfig.badge.gradient,
          logoConfig.badge.shadow,
          sizeConfig.container,
          animated && logoConfig.animations.pulse.class,
          className
        )}
        data-testid={`${logoConfig.accessibility.testIdPrefix}-icon`}
      >
        {/* Neural ring overlay - subtle concentric circles */}
        <div className="absolute inset-0 rounded-full border-2 border-white/10" />
        <div className="absolute inset-2 rounded-full border border-white/5" />

        {/* AF with lightning bolt */}
        <div className="relative flex items-center gap-0.5">
          <span className={cn("font-black tracking-tighter", logoConfig.badge.text.color)}>A</span>
          <Zap className="w-3 h-3 fill-current" style={{ color: logoConfig.lightningBolt.color }} />
          <span className={cn("font-black tracking-tighter", logoConfig.badge.text.color)}>F</span>
        </div>
      </div>
    );
  }

  // Wordmark - just text
  if (variant === "wordmark") {
    return (
      <div className={cn("flex items-center gap-1 flex-wrap", className)} data-testid={`${logoConfig.accessibility.testIdPrefix}-wordmark`}>
        <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          {logoConfig.brand.name.slice(0, 4)}
        </span>
        <span className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: logoConfig.colors.primary }}>
          {logoConfig.brand.name.slice(4)}
        </span>
        <span className="text-sm align-super text-slate-900 dark:text-white">{logoConfig.brand.trademark}</span>
      </div>
    );
  }

  // Full - AF badge + text
  return (
    <div className={cn("flex items-center gap-3", className)} data-testid={`${logoConfig.accessibility.testIdPrefix}-full`}>
      <div
        className={cn(
          "relative shrink-0 flex items-center justify-center",
          logoConfig.badge.shape,
          logoConfig.badge.gradient,
          logoConfig.badge.shadow,
          sizeConfig.container,
          animated && logoConfig.animations.pulse.class
        )}
      >
        {/* Neural ring overlay */}
        <div className="absolute inset-0 rounded-full border-2 border-white/10" />
        <div className="absolute inset-2 rounded-full border border-white/5" />

        {/* AF with lightning bolt */}
        <div className="relative flex items-center gap-0.5">
          <span className={cn("font-black tracking-tighter", logoConfig.badge.text.color)}>A</span>
          <Zap className="w-4 h-4 fill-current" style={{ color: logoConfig.lightningBolt.color }} />
          <span className={cn("font-black tracking-tighter", logoConfig.badge.text.color)}>F</span>
        </div>
      </div>
      <div className="flex flex-col">
        <div className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight leading-none flex items-baseline gap-1 flex-wrap">
          <span className="text-slate-900 dark:text-white">{logoConfig.brand.name.slice(0, 4)}</span>
          <span style={{ color: logoConfig.colors.primary }}>{logoConfig.brand.name.slice(4)}</span>
          <span className="text-xs align-super text-slate-900 dark:text-white">{logoConfig.brand.trademark}</span>
        </div>
        <div className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-400 font-medium tracking-wide mt-0.5">
          {logoConfig.brand.taglineAlt}
        </div>
      </div>
    </div>
  );
}
