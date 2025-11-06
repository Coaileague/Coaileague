import { cn } from "@/lib/utils";
import autoforceLogoNew from "../../../attached_assets/autoforce-logo-new.png";

interface AutoForceAFLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  variant?: "icon" | "full" | "wordmark";
  animated?: boolean;
  showF?: boolean;
  className?: string;
}

/**
 * AutoForce™ Logo Component
 * Uses the new logo image provided by the user
 */
export function AutoForceAFLogo({
  size = "md",
  variant = "icon",
  animated = false,
  showF = false,
  className
}: AutoForceAFLogoProps) {
  
  // Size mappings for the logo
  const containerSizes = {
    sm: "w-12 h-12",
    md: "w-20 h-20",
    lg: "w-28 h-28",
    xl: "w-36 h-36",
    hero: "w-48 h-48"
  };

  const textSizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
    xl: "text-xl",
    hero: "text-2xl"
  };

  // Icon only - just the logo image
  if (variant === "icon") {
    return (
      <div 
        className={cn(
          "flex items-center justify-center shrink-0",
          containerSizes[size],
          className
        )}
        data-testid="autoforce-af-logo-icon"
      >
        <img 
          src={autoforceLogoNew}
          alt="AutoForce Logo"
          className={cn(
            "w-full h-full object-contain",
            animated && "animate-pulse-slow"
          )}
        />
      </div>
    );
  }

  // Wordmark - just text
  if (variant === "wordmark") {
    return (
      <div 
        className={cn("flex items-center gap-1 flex-wrap", className)}
        data-testid="autoforce-af-logo-wordmark"
      >
        <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          AUTO
        </span>
        <span 
          className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400"
        >
          FORCE
        </span>
        <span className="text-sm align-super text-foreground">™</span>
      </div>
    );
  }

  // Full - icon + text
  return (
    <div 
      className={cn("flex items-center gap-3", className)}
      data-testid="autoforce-af-logo-full"
    >
      <div className={cn("shrink-0", containerSizes[size])}>
        <img 
          src={autoforceLogoNew}
          alt="AutoForce Logo"
          className={cn(
            "w-full h-full object-contain",
            animated && "animate-pulse-slow"
          )}
        />
      </div>
      <div className="flex flex-col">
        <div className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight leading-none flex items-baseline gap-1 flex-wrap">
          <span className="text-foreground">AUTO</span>
          <span className="text-emerald-600 dark:text-emerald-400">FORCE</span>
          <span className="text-xs align-super text-foreground">™</span>
        </div>
        <div className="text-[10px] sm:text-xs text-muted-foreground font-medium tracking-wide mt-0.5">
          Autonomous Workforce Management Solutions
        </div>
      </div>
    </div>
  );
}
