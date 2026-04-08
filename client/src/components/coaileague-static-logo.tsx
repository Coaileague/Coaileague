import { cn } from "@/lib/utils";
import { logoConfig } from "@/config/logoConfig";
import { TrinityMascotIcon } from "@/components/ui/coaileague-logo-mark";

interface CoAIleagueStaticLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  variant?: "icon" | "full" | "wordmark";
  className?: string;
}

/**
 * CoAIleague Static Logo - Non-Animated
 * Uses the Trinity Mascot (glowing flower) 
 * Use this in forms, dialogs, modals, and places where animation doesn't fit
 */
export function CoAIleagueStaticLogo({
  size = "md",
  variant = "icon",
  className,
}: CoAIleagueStaticLogoProps) {
  const knotSizeMap: Record<string, "xs" | "sm" | "md" | "lg" | "xl"> = {
    sm: "xs",
    md: "sm",
    lg: "md",
    xl: "lg",
    hero: "xl",
  };

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
          className
        )}
        data-testid="coaileague-static-logo-icon"
      >
        <TrinityMascotIcon 
          size={knotSizeMap[size] || "sm"}
        />
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-4", className)} data-testid="coaileague-static-logo-full">
      <div className="relative inline-flex items-center justify-center shrink-0">
        <TrinityMascotIcon 
          size={knotSizeMap[size] || "sm"}
        />
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
