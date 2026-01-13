import { cn } from "@/lib/utils";
import { logoConfig } from "@/config/logoConfig";
import { TrinityMascotIcon } from "@/components/ui/trinity-mascot";
import TrinityRedesign from "@/components/trinity-redesign";
import { Suspense } from "react";

interface CoAIleagueLogoFullProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  animated?: boolean;
}

/**
 * CoAIleague Full Logo with Trinity Mascot Icon
 * Uses the glowing flower mascot (cyan/purple/gold) universally
 */
export function CoAIleagueLogoFull({ 
  size = "md", 
  className,
  animated = true 
}: CoAIleagueLogoFullProps) {
  const knotSizeMap: Record<string, "xs" | "sm" | "md" | "lg" | "xl"> = {
    sm: "xs",
    md: "sm",
    lg: "md",
    xl: "lg",
  };

  const textSizeMap: Record<string, string> = {
    sm: "text-xl",
    md: "text-2xl md:text-3xl",
    lg: "text-3xl md:text-4xl",
    xl: "text-4xl md:text-5xl",
  };

  const taglineSizeMap: Record<string, string> = {
    sm: "text-[10px]",
    md: "text-xs",
    lg: "text-sm",
    xl: "text-base",
  };

  const iconSizeMap = { xs: 20, sm: 24, md: 32, lg: 48, xl: 64 };
  const iconSize = iconSizeMap[knotSizeMap[size] || "sm"];
  
  return (
    <div 
      className={cn("flex items-center gap-3 md:gap-4", className)}
      aria-label={logoConfig.accessibility.ariaLabel}
      data-testid={`${logoConfig.accessibility.testIdPrefix}-full`}
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

      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-baseline gap-1">
          <span className={cn(
            "font-extrabold text-cyan-600 dark:text-cyan-400 tracking-tight",
            textSizeMap[size]
          )}>
            Co
          </span>
          <span className={cn(
            "font-extrabold text-slate-900 dark:text-white tracking-tight",
            textSizeMap[size]
          )}>
            AI
          </span>
          <span className={cn(
            "font-extrabold text-cyan-600 dark:text-cyan-400 tracking-tight",
            textSizeMap[size]
          )}>
            league
          </span>
          <span className="text-xs align-super text-slate-500 dark:text-slate-400 ml-0.5">
            {logoConfig.brand.trademark}
          </span>
        </div>
        
        <p className={cn(
          "font-medium text-slate-500 dark:text-slate-400 tracking-wide uppercase truncate",
          taglineSizeMap[size]
        )}>
          {logoConfig.brand.taglineAlt}
        </p>
      </div>
    </div>
  );
}
