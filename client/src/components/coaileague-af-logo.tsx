import { cn } from "@/lib/utils";
import { logoConfig, getLogoSize } from "@/config/logoConfig";

interface CoAIleagueAFLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  variant?: "icon" | "full" | "wordmark";
  animated?: boolean;
  className?: string;
}

/**
 * CoAIleague Gradient Logo - Professional gradient badge with brand text
 */
export function CoAIleagueAFLogo({
  size = "md",
  variant = "icon",
  animated = true,
  className,
}: CoAIleagueAFLogoProps) {
  const sizeConfig = getLogoSize(size);

  // Gradient circle - no AF letters
  const GradientBadge = () => (
    <div className="w-full h-full rounded-full bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
      <div className="absolute inset-0 rounded-full opacity-50 bg-gradient-to-tr from-blue-300 to-transparent blur-xl" />
      <span className="relative text-white font-black text-xs">CO</span>
    </div>
  );

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
    return (
      <div
        className={cn(
          "relative inline-flex items-center justify-center",
          "rounded-full",
          "bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600",
          "shadow-lg border border-blue-300/30",
          "group hover:shadow-xl hover:shadow-blue-500/30 transition-shadow",
          sizeConfig.container,
          className
        )}
      >
        <div className="absolute inset-0 opacity-0 group-hover:opacity-40 bg-gradient-to-tr from-blue-300 to-transparent transition-opacity duration-500 rounded-full blur-lg" />
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/20 to-transparent opacity-40" />
        <span className="relative text-white font-black text-xs md:text-sm z-10">CO</span>
      </div>
    );
  }

  // Full variant with text
  return (
    <div className={cn("flex items-center gap-3 md:gap-4", className)}>
      <div
        className={cn(
          "relative inline-flex items-center justify-center shrink-0",
          "rounded-full",
          "bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600",
          "shadow-lg border border-blue-300/30",
          "group hover:shadow-xl hover:shadow-blue-500/30 transition-all",
          sizeConfig.container,
        )}
      >
        <div className="absolute inset-0 opacity-0 group-hover:opacity-40 bg-gradient-to-tr from-blue-300 to-transparent transition-opacity duration-500 rounded-full blur-lg" />
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/20 to-transparent opacity-40" />
        <span className="relative text-white font-black text-xs md:text-sm z-10">CO</span>
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
