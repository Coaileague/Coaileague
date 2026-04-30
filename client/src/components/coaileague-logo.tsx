import { cn } from "@/lib/utils";
import { CoAIleagueLogoMark } from "@/components/ui/coaileague-logo-mark";

interface CoAIleagueLogoProps {
  width?: number | string;
  height?: number | string;
  showTagline?: boolean;
  showWordmark?: boolean;
  className?: string;
  onlyIcon?: boolean;
  variant?: "light" | "dark" | "auto";
}

/**
 * CoAIleagueLogo — brand surface logo with CoAIleague triquetra mark.
 *
 * STRICT BRAND RULE (2026-04-08): this component ALWAYS renders the
 * CoAIleague triquetra (CoAIleagueLogoMark). It never renders the
 * Trinity three-arrow splash mark or the deleted TrinityRedesign
 * five-petal ribbon mascot.
 *
 * Per brand separation directive:
 *   - Trinity three-arrow = splash / loading / transition ONLY
 *   - CoAIleague triquetra = header / footer / nav / brand surfaces
 * This file lives in the brand surface bucket, so triquetra only.
 */
export function CoAIleagueLogo({
  width = 200,
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
    const iconSizeMap = { xs: 20, sm: 24, md: 32, lg: 48, xl: 64 };
    const iconSize = iconSizeMap[getKnotSize()];
    return <CoAIleagueLogoMark size={iconSize} />;
  }

  return (
    <div
      className={cn("flex items-center gap-2 md:gap-3", className)}
      style={{ width: typeof width === 'number' ? `${width}px` : width }}
    >
      <CoAIleagueLogoMark size={getKnotSize()} />

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
              Intelligent Workforce Management
            </span>
          )}
        </div>
      )}
    </div>
  );
}
