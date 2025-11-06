import { cn } from "@/lib/utils";
import autoforceLogoNew from "../../../attached_assets/autoforce-logo-new.png";

interface AutoForceLogoProps {
  variant?: "nav" | "icon" | "full";
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  animated?: boolean;
  className?: string;
  lightMode?: boolean;
}

export function AutoForceLogo({ 
  variant = "nav",
  size = "md",
  animated = false,
  className,
  lightMode = false
}: AutoForceLogoProps) {
  
  // Size mappings for new logo image
  const iconSizeClasses = {
    sm: "w-12 h-12",
    md: "w-16 h-16",
    lg: "w-20 h-20",
    xl: "w-24 h-24",
    hero: "w-32 h-32"
  };
  
  const fullSizeClasses = {
    sm: "w-20 h-20",
    md: "w-28 h-28",
    lg: "w-36 h-36",
    xl: "w-44 h-44",
    hero: "w-56 h-56"
  };
  
  // Full variant with tagline
  if (variant === "full") {
    const titleSizes = {
      sm: "text-2xl",
      md: "text-3xl",
      lg: "text-4xl",
      xl: "text-5xl",
      hero: "text-6xl"
    };
    
    const taglineSizes = {
      sm: "text-xs",
      md: "text-sm",
      lg: "text-base",
      xl: "text-lg",
      hero: "text-xl"
    };
    
    return (
      <div 
        className={cn("flex flex-col items-center justify-center gap-4", className)} 
        data-testid="logo-full"
      >
        <img 
          src={autoforceLogoNew}
          alt="AutoForce Logo"
          className={cn(
            fullSizeClasses[size],
            animated && "animate-pulse-slow"
          )}
        />
        
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-baseline gap-1 justify-center flex-wrap">
            <span 
              className={cn(
                "font-black text-foreground",
                titleSizes[size]
              )}
              data-testid="logo-text-auto"
            >
              Auto
            </span>
            <span 
              className={cn(
                "font-black text-emerald-600 dark:text-emerald-400",
                titleSizes[size]
              )}
              data-testid="logo-text-force"
            >
              Force
            </span>
            <span 
              className={cn(
                "font-black text-xs align-super text-foreground"
              )}
              data-testid="logo-trademark"
            >
              ™
            </span>
          </div>
          
          <p 
            className={cn(
              "tracking-wide uppercase font-medium text-center text-muted-foreground",
              taglineSizes[size]
            )}
            data-testid="logo-tagline"
          >
            Autonomous Workforce Management
          </p>
        </div>
      </div>
    );
  }
  
  // Icon variant (default for nav/icon)
  return (
    <div 
      className={cn("flex items-center justify-center", iconSizeClasses[size], className)} 
      data-testid={`logo-${variant}`}
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

// Export alias for backwards compatibility
export { AutoForceLogo as WorkforceOSLogo };
