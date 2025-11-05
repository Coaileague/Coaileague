import { cn } from "@/lib/utils";
import autoforceGearLogo from "@/assets/autoforce-logo-full.png";

interface AnimatedAutoForceLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  variant?: "gear" | "full" | "wordmark";
  animated?: boolean;
  className?: string;
}

/**
 * New AutoForce™ Animated Logo Component
 * Features the professional gear icon with network nodes
 * Supports multiple variants and sizes with smooth animations
 */
export function AnimatedAutoForceLogo({
  size = "md",
  variant = "gear",
  animated = true,
  className
}: AnimatedAutoForceLogoProps) {
  
  // Size mappings for responsive display
  const sizes = {
    sm: {
      gear: "w-16 h-16",
      full: "w-48 h-auto",
      container: "w-20 h-20"
    },
    md: {
      gear: "w-24 h-24",
      full: "w-64 h-auto",
      container: "w-28 h-28"
    },
    lg: {
      gear: "w-32 h-32",
      full: "w-80 h-auto",
      container: "w-36 h-36"
    },
    xl: {
      gear: "w-40 h-40",
      full: "w-96 h-auto",
      container: "w-48 h-48"
    },
    hero: {
      gear: "w-48 h-48 sm:w-64 sm:h-64",
      full: "w-[400px] sm:w-[480px] h-auto",
      container: "w-56 h-56 sm:w-72 sm:h-72"
    }
  };

  // Gear icon only (from top of uploaded image - cyan gear with A)
  if (variant === "gear") {
    return (
      <div 
        className={cn(
          "relative flex items-center justify-center",
          sizes[size].container,
          className
        )}
        data-testid="autoforce-logo-gear"
      >
        {/* Animated glow effects */}
        {animated && (
          <>
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/30 via-blue-500/30 to-purple-500/30 blur-2xl rounded-full scale-150 animate-pulse-slow" />
            <div className="absolute inset-0 bg-cyan-400/20 blur-xl rounded-full scale-125 animate-glow-pulse" />
          </>
        )}
        
        {/* Gear logo with rotation animation */}
        <div className={cn(
          "relative z-10",
          sizes[size].gear,
          animated && "animate-spin-slow"
        )}>
          <div 
            className="w-full h-full bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${autoforceGearLogo})`,
              backgroundPosition: 'center 15%',
              backgroundSize: '200%',
              filter: 'drop-shadow(0 0 20px rgba(6, 182, 212, 0.6))'
            }}
          />
        </div>
      </div>
    );
  }

  // Full wordmark (from bottom of uploaded image)
  if (variant === "wordmark") {
    return (
      <div 
        className={cn(
          "relative flex items-center justify-center",
          className
        )}
        data-testid="autoforce-logo-wordmark"
      >
        {/* Animated glow for wordmark */}
        {animated && (
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 blur-3xl scale-110 animate-pulse-slow" />
        )}
        
        <div className={cn(
          "relative z-10",
          sizes[size].full,
          animated && "animate-float"
        )}>
          <div 
            className="w-full h-24 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${autoforceGearLogo})`,
              backgroundPosition: 'center 85%',
              backgroundSize: '100%',
              filter: 'drop-shadow(0 4px 24px rgba(168, 85, 247, 0.4))'
            }}
          />
        </div>
      </div>
    );
  }

  // Full variant - combines gear + wordmark
  return (
    <div 
      className={cn(
        "relative flex flex-col items-center gap-4",
        className
      )}
      data-testid="autoforce-logo-full"
    >
      {/* Gear logo */}
      <div className={cn(
        "relative",
        sizes[size].container
      )}>
        {animated && (
          <>
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/30 via-blue-500/30 to-purple-500/30 blur-3xl rounded-full scale-150 animate-pulse-slow" />
            <div className="absolute inset-0 bg-cyan-400/20 blur-2xl rounded-full scale-125 animate-glow-pulse" />
          </>
        )}
        
        <div className={cn(
          "relative z-10",
          sizes[size].gear,
          animated && "animate-spin-slow"
        )}>
          <div 
            className="w-full h-full bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${autoforceGearLogo})`,
              backgroundPosition: 'center 15%',
              backgroundSize: '200%',
              filter: 'drop-shadow(0 0 20px rgba(6, 182, 212, 0.6))'
            }}
          />
        </div>
      </div>

      {/* Wordmark */}
      <div className={cn(
        sizes[size].full,
        animated && "animate-float"
      )}>
        <div className="flex flex-col items-center gap-1">
          <div className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
            <span className="text-foreground">AUTO</span>
            <span className="text-primary">FORCE</span>
            <span className="text-foreground">™</span>
          </div>
          <div className="text-xs sm:text-sm text-muted-foreground font-medium tracking-wide">
            Autonomous Workforce Management Solutions
          </div>
        </div>
      </div>
    </div>
  );
}

// Add custom animations to global CSS if not already present
// animate-spin-slow: slow gear rotation (12s)
// animate-pulse-slow: slow pulsing glow (3s)
// animate-glow-pulse: alternating glow intensity (2s)
// animate-float: gentle floating motion (3s)
