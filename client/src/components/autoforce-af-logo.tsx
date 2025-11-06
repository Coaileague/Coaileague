import { cn } from "@/lib/utils";

interface AutoForceAFLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  variant?: "icon" | "full" | "wordmark";
  animated?: boolean;
  showF?: boolean;
  className?: string;
}

/**
 * Simplified AutoForce™ AF Logo Component
 * Clean lightning bolt design for emergency services branding
 * Features circular badge with emerald green theme
 */
export function AutoForceAFLogo({
  size = "md",
  variant = "icon",
  animated = false,
  showF = false,
  className
}: AutoForceAFLogoProps) {
  
  // Size mappings for the circular badge
  const containerSizes = {
    sm: "w-12 h-12",
    md: "w-20 h-20",
    lg: "w-28 h-28",
    xl: "w-36 h-36",
    hero: "w-48 h-48"
  };

  const textSizes = {
    sm: "text-[8px]",
    md: "text-xs",
    lg: "text-base",
    xl: "text-xl",
    hero: "text-2xl"
  };

  // Icon only - circular badge with lightning bolt
  if (variant === "icon") {
    return (
      <div 
        className={cn(
          "relative flex flex-col items-center justify-center rounded-full shrink-0",
          containerSizes[size],
          className
        )}
        style={{
          background: 'linear-gradient(135deg, #059669 0%, #10b981 50%, #6ee7b7 100%)',
          boxShadow: animated ? '0 0 20px rgba(16, 185, 129, 0.4)' : '0 4px 10px rgba(0, 0, 0, 0.1)'
        }}
        data-testid="autoforce-af-logo-icon"
      >
        {/* Lightning Bolt SVG */}
        <svg 
          className={cn(
            "w-1/2 h-1/2",
            animated && "animate-pulse"
          )}
          viewBox="0 0 24 24" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <path 
            d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" 
            fill="white"
            stroke="white"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>

        {/* "AF" Text */}
        <div 
          className={cn(
            "font-bold text-white",
            textSizes[size]
          )}
          style={{
            letterSpacing: '0.05em',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
          }}
        >
          AF
        </div>
      </div>
    );
  }

  // Wordmark - just text
  if (variant === "wordmark") {
    return (
      <div 
        className={cn("flex items-center gap-1", className)}
        data-testid="autoforce-af-logo-wordmark"
      >
        <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          AUTO
        </span>
        <span 
          className="text-2xl sm:text-3xl font-bold tracking-tight"
          style={{
            background: 'linear-gradient(90deg, #059669 0%, #10b981 50%, #6ee7b7 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}
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
      <AutoForceAFLogo 
        variant="icon" 
        size={size} 
        animated={animated} 
        showF={showF}
      />
      <div className="flex flex-col">
        <div className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight leading-none">
          <span className="text-foreground">AUTO</span>
          <span 
            style={{
              background: 'linear-gradient(90deg, #059669 0%, #10b981 50%, #6ee7b7 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}
          >
            FORCE
          </span>
          <span className="text-xs align-super text-foreground">™</span>
        </div>
        <div className="text-[10px] sm:text-xs text-muted-foreground font-medium tracking-wide mt-0.5">
          Autonomous Workforce Management Solutions
        </div>
      </div>
    </div>
  );
}
