import { cn } from "@/lib/utils";
import { logoConfig, getLogoSize } from "@/config/logoConfig";
import { TrinityMascotIcon } from "@/components/ui/trinity-mascot";
import TrinityRedesign from "@/components/trinity-redesign";
import { Suspense } from "react";

interface CoAIleagueAFLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  variant?: "icon" | "full" | "wordmark";
  animated?: boolean;
  className?: string;
}

/**
 * CoAIleague Logo - Uses the Trinity Mascot (glowing flower)
 * Unified branding with Trinity mascot
 */
export function CoAIleagueAFLogo({
  size = "md",
  variant = "icon",
  animated = false,
  className,
}: CoAIleagueAFLogoProps) {
  const knotSizeMap: Record<string, "xs" | "sm" | "md" | "lg" | "xl"> = {
    sm: "xs",
    md: "sm",
    lg: "md",
    xl: "lg",
    hero: "xl",
  };

  if (variant === "wordmark") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="font-black text-slate-900 dark:text-white text-xl">
          {logoConfig.brand.name}
        </span>
        <span className="text-xs align-super text-slate-900 dark:text-white">
          {logoConfig.brand.trademark}
        </span>
      </div>
    );
  }

  if (variant === "icon") {
    const iconSizeMap = { xs: 20, sm: 24, md: 32, lg: 48, xl: 64 };
    const iconSize = iconSizeMap[knotSizeMap[size] || "sm"];
    return (
      <div
        className={cn(
          "relative inline-flex items-center justify-center",
          className
        )}
        data-testid="coaileague-logo-icon"
      >
        {animated ? (
          <Suspense fallback={<div style={{ width: iconSize, height: iconSize }} />}>
            <TrinityRedesign size={iconSize} mode="ANALYZING" />
          </Suspense>
        ) : (
          <TrinityMascotIcon 
            size={knotSizeMap[size] || "sm"}
          />
        )}
      </div>
    );
  }

  // Full variant with text
  const iconSizeMap = { xs: 20, sm: 24, md: 32, lg: 48, xl: 64 };
  const iconSize = iconSizeMap[knotSizeMap[size] || "sm"];
  return (
    <div className={cn("flex items-center gap-3 md:gap-4", className)} data-testid="coaileague-logo-full">
      <div className="relative inline-flex items-center justify-center shrink-0">
        {animated ? (
          <Suspense fallback={<div style={{ width: iconSize, height: iconSize }} />}>
            <TrinityRedesign size={iconSize} mode="ANALYZING" />
          </Suspense>
        ) : (
          <TrinityMascotIcon 
            size={knotSizeMap[size] || "sm"}
          />
        )}
      </div>

      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-baseline gap-1 md:gap-2 flex-wrap">
          <span className="font-black text-slate-900 dark:text-white text-lg md:text-2xl truncate">
            {logoConfig.brand.name}
          </span>
          <span className="text-xs text-slate-900 dark:text-white">™</span>
        </div>
        <p className="text-xs md:text-sm font-medium text-slate-600 dark:text-slate-400 truncate">
          {logoConfig.brand.taglineAlt}
        </p>
      </div>
    </div>
  );
}

export { CoAIleagueAFLogo as AnimatedCoAIleagueLogo };
