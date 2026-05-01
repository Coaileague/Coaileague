import { TrinityAnimatedLogo } from "@/components/ui/trinity-animated-logo";
import { cn } from "@/lib/utils";
import { logoConfig } from "@/config/logoConfig";
import { CoAIleagueLogoMark } from "@/components/ui/coaileague-logo-mark";

interface CoAIleagueAFLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  variant?: "icon" | "full" | "wordmark";
  /** @deprecated - no effect. This component always renders the
   *  CoAIleague triquetra brand mark, never an animated variant. */
  animated?: boolean;
  className?: string;
}

/**
 * CoAIleagueAFLogo — branded platform logo wrapper.
 *
 * STRICT BRAND RULE (2026-04-08): this component ALWAYS renders the
 * CoAIleague triquetra (CoAIleagueLogoMark). It never renders the
 * Trinity three-arrow mark and never renders the five-petal ribbon
 * mascot (TrinityRedesign — deleted). The `animated` prop is kept for
 * backward compatibility but has no effect — the component always
 * renders the static triquetra.
 *
 * Per user brand-separation directive:
 *   - Trinity three-arrow = splash / loading / transition ONLY
 *   - CoAIleague triquetra = header / footer / nav / brand surfaces
 * This component lives in the brand surface bucket, so triquetra only.
 */
export function CoAIleagueAFLogo({
  size = "md",
  variant = "icon",
  className,
}: CoAIleagueAFLogoProps) {
  const iconSizeMap = { sm: 20, md: 24, lg: 32, xl: 48, hero: 64 };
  const iconSize = iconSizeMap[size];

  if (variant === "wordmark") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="font-black text-foreground text-xl">
          {logoConfig.brand.name}
        </span>
        <span className="text-xs align-super text-foreground">
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
          className,
        )}
        data-testid="coaileague-logo-icon"
      >
        <TrinityAnimatedLogo size={iconSize} />
      </div>
    );
  }

  // Full variant with text
  return (
    <div
      className={cn("flex items-center gap-3 md:gap-4", className)}
      data-testid="coaileague-logo-full"
    >
      <div className="relative inline-flex items-center justify-center shrink-0">
        <TrinityAnimatedLogo size={iconSize} />
      </div>

      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-baseline gap-1 md:gap-2 flex-wrap">
          <span className="font-black text-foreground text-lg md:text-2xl truncate">
            {logoConfig.brand.name}
          </span>
          <span className="text-xs text-foreground">™</span>
        </div>
        <p className="text-xs md:text-sm font-medium text-muted-foreground truncate">
          {logoConfig.brand.taglineAlt}
        </p>
      </div>
    </div>
  );
}

export { CoAIleagueAFLogo as AnimatedCoAIleagueLogo };
