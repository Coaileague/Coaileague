import { cn } from "@/lib/utils";
import { TrinityLogo } from "@/components/trinity-logo";

type LogoSize = "xs" | "sm" | "md" | "lg" | "xl";
type LogoVariant = "full" | "compact" | "icon";

interface UnifiedBrandLogoProps {
  size?: LogoSize;
  variant?: LogoVariant;
  responsive?: boolean;
  showTagline?: boolean;
  className?: string;
  theme?: "light" | "dark" | "auto";
}

const SIZE_CONFIG = {
  xs: { 
    logoSize: 20, 
    text: "text-sm", 
    gap: "gap-1",
    tagline: "text-[8px]"
  },
  sm: { 
    logoSize: 28, 
    text: "text-base", 
    gap: "gap-1.5",
    tagline: "text-[9px]"
  },
  md: { 
    logoSize: 32, 
    text: "text-lg", 
    gap: "gap-2",
    tagline: "text-[10px]"
  },
  lg: { 
    logoSize: 40, 
    text: "text-xl", 
    gap: "gap-2.5",
    tagline: "text-xs"
  },
  xl: { 
    logoSize: 56, 
    text: "text-2xl", 
    gap: "gap-3",
    tagline: "text-sm"
  },
};

export function UnifiedBrandLogo({
  size = "md",
  variant = "full",
  responsive = true,
  showTagline = false,
  className,
  theme = "auto",
}: UnifiedBrandLogoProps) {
  const isDark = theme === "dark" || 
    (theme === "auto" && typeof document !== 'undefined' && 
     document.documentElement.classList.contains('dark'));

  const colors = {
    accent: isDark ? "#22D3EE" : "#0891B2",
    primary: isDark ? "#F1F5F9" : "#1E293B",
    muted: isDark ? "#94A3B8" : "#64748B",
  };

  const config = SIZE_CONFIG[size];
  
  const effectiveVariant = responsive 
    ? variant 
    : variant;

  if (effectiveVariant === "icon") {
    return (
      <TrinityLogo 
        size={config.logoSize}
        className={cn("shrink-0", className)}
      />
    );
  }

  const renderWordmark = () => {
    if (effectiveVariant === "compact") {
      return (
        <span className={cn("font-extrabold tracking-tight whitespace-nowrap", config.text)}>
          <span style={{ color: colors.accent }}>Co</span>
          <span style={{ color: colors.primary }}>AI</span>
        </span>
      );
    }

    return (
      <span className={cn("font-extrabold tracking-tight whitespace-nowrap", config.text)}>
        <span style={{ color: colors.accent }}>Co</span>
        <span style={{ color: colors.primary }}>AI</span>
        <span style={{ color: colors.accent }}>league</span>
        <sup className="text-[0.5em] ml-0.5" style={{ color: colors.muted }}>™</sup>
      </span>
    );
  };

  return (
    <div 
      className={cn(
        "flex items-center shrink-0",
        config.gap,
        className
      )}
      data-testid="brand-logo"
    >
      <TrinityLogo 
        size={config.logoSize}
        className="shrink-0"
      />

      <div className="flex flex-col min-w-0">
        {responsive ? (
          <>
            {/* Desktop: Full logo "CoAIleague™" */}
            <span className={cn("hidden sm:inline", config.text)}>
              {renderWordmark()}
            </span>
            {/* Mobile: Compact "CoAI" with auto-scaling text - truncate to prevent overlap */}
            <span className="sm:hidden font-extrabold tracking-tight whitespace-nowrap text-sm">
              <span style={{ color: colors.accent }}>Co</span>
              <span style={{ color: colors.primary }}>AI</span>
              <span style={{ color: colors.accent }}>league</span>
              <sup className="text-[0.4em] ml-0.5" style={{ color: colors.muted }}>™</sup>
            </span>
          </>
        ) : (
          renderWordmark()
        )}

        {showTagline && effectiveVariant === "full" && (
          <span 
            className={cn("font-medium truncate hidden sm:block", config.tagline)}
            style={{ color: colors.muted }}
          >
            Autonomous Workforce Management
          </span>
        )}
      </div>
    </div>
  );
}

export function HeaderLogo({ className }: { className?: string }) {
  return (
    <UnifiedBrandLogo 
      size="md" 
      variant="full" 
      responsive={true}
      className={className}
    />
  );
}

export function LoginLogo({ className }: { className?: string }) {
  return (
    <UnifiedBrandLogo 
      size="lg" 
      variant="full" 
      responsive={true}
      className={className}
    />
  );
}

export function FooterLogo({ className }: { className?: string }) {
  return (
    <UnifiedBrandLogo 
      size="sm" 
      variant="full" 
      responsive={false}
      showTagline={true}
      className={className}
    />
  );
}

export function IconLogo({ size = "sm", className }: { size?: LogoSize; className?: string }) {
  return (
    <UnifiedBrandLogo 
      size={size} 
      variant="icon" 
      className={className}
    />
  );
}
