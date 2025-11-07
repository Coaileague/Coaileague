import { cn } from "@/lib/utils";
import { Zap } from "lucide-react";

interface AutoForceAFLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  variant?: "icon" | "full" | "wordmark";
  animated?: boolean;
  showF?: boolean;
  className?: string;
}

/**
 * AutoForce™ Logo Component
 * AF lightning bolt in circular Emergency Green gradient badge
 */
export function AutoForceAFLogo({
  size = "md",
  variant = "icon",
  animated = false,
  showF = false,
  className
}: AutoForceAFLogoProps) {
  
  // Size mappings for the circular badge
  const badgeSizes = {
    sm: "w-10 h-10 text-sm",
    md: "w-14 h-14 text-lg",
    lg: "w-20 h-20 text-2xl",
    xl: "w-28 h-28 text-4xl",
    hero: "w-40 h-40 text-6xl"
  };

  const textSizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
    xl: "text-xl",
    hero: "text-2xl"
  };

  // Icon only - AF circular badge
  if (variant === "icon") {
    return (
      <div 
        className={cn(
          "flex items-center justify-center shrink-0 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg",
          badgeSizes[size],
          animated && "animate-pulse-slow",
          className
        )}
        data-testid="autoforce-af-logo-icon"
      >
        <span className="text-white font-black">AF</span>
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

  // Full - AF badge + text
  return (
    <div 
      className={cn("flex items-center gap-3", className)}
      data-testid="autoforce-af-logo-full"
    >
      <div 
        className={cn(
          "shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg",
          badgeSizes[size],
          animated && "animate-pulse-slow"
        )}
      >
        <span className="text-white font-black">AF</span>
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
