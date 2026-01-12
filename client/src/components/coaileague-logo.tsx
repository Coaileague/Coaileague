import { cn } from "@/lib/utils";
import { ColorfulCelticKnot } from "@/components/ui/colorful-celtic-knot";

interface CoAIleagueLogoProps {
  width?: number | string;
  height?: number | string;
  showTagline?: boolean;
  showWordmark?: boolean;
  className?: string;
  onlyIcon?: boolean;
  variant?: "light" | "dark" | "auto";
  enableSeasonalEffects?: boolean;
}

/**
 * CoAIleague Logo - Unified Celtic Knot branding
 * Uses the colorful 3-ribbon Celtic knot (purple/teal/gold) universally
 * Same branding as Trinity mascot
 */
export function CoAIleagueLogo({
  width = 200,
  height = 50,
  showTagline = false,
  showWordmark = true,
  className,
  onlyIcon = false,
  variant = "auto",
}: CoAIleagueLogoProps) {
  const isDark = variant === "dark" || 
    (variant === "auto" && typeof document !== 'undefined' && 
     document.documentElement.classList.contains('dark'));

  const colors = {
    textPrimary: isDark ? "#F1F5F9" : "#1E293B",
    textAccent: isDark ? "#22D3EE" : "#0891B2",
    textSecondary: isDark ? "#94A3B8" : "#64748B",
  };

  const getKnotSize = (): "xs" | "sm" | "md" | "lg" | "xl" => {
    const w = typeof width === 'number' ? width : 200;
    if (w < 80) return "xs";
    if (w < 120) return "sm";
    if (w < 180) return "md";
    if (w < 250) return "lg";
    return "xl";
  };

  if (onlyIcon) {
    return (
      <ColorfulCelticKnot 
        size={getKnotSize()}
        className={cn("transition-transform duration-200", className)}
        animated={true}
        animationSpeed="slow"
      />
    );
  }

  return (
    <div 
      className={cn("flex items-center gap-2 md:gap-3", className)}
      style={{ width: typeof width === 'number' ? `${width}px` : width }}
    >
      <ColorfulCelticKnot 
        size={getKnotSize()}
        animated={true}
        animationSpeed="slow"
      />

      {showWordmark && (
        <div className="flex flex-col min-w-0">
          <div className="flex items-baseline gap-0.5 whitespace-nowrap flex-nowrap">
            <span 
              className="font-extrabold text-lg md:text-xl tracking-tight whitespace-nowrap"
              style={{ color: colors.textAccent }}
            >
              Co
            </span>
            <span 
              className="font-extrabold text-lg md:text-xl tracking-tight whitespace-nowrap"
              style={{ color: colors.textPrimary }}
            >
              AI
            </span>
            <span 
              className="font-extrabold text-lg md:text-xl tracking-tight whitespace-nowrap"
              style={{ color: colors.textAccent }}
            >
              league
            </span>
            <span 
              className="text-[10px] align-super ml-0.5 whitespace-nowrap"
              style={{ color: colors.textSecondary }}
            >
              ™
            </span>
          </div>

          {showTagline && (
            <span 
              className="text-[10px] md:text-xs font-medium truncate"
              style={{ color: colors.textSecondary }}
            >
              Autonomous Management Solutions
            </span>
          )}
        </div>
      )}
    </div>
  );
}
