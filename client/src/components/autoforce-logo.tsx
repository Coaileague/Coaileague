import { cn } from "@/lib/utils";
import { logoConfig, getLogoSize } from "@/config/logoConfig";

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
  
  // Use centralized size config
  const sizeConfig = getLogoSize(size);
  const badgeSizeClasses = {
    sm: sizeConfig.container,
    md: sizeConfig.container,
    lg: sizeConfig.container,
    xl: sizeConfig.container,
    hero: sizeConfig.container
  };
  
  // Full variant with AF badge and tagline
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
        className={cn("flex flex-col items-center justify-center gap-4 pointer-events-none", className)} 
        data-testid="logo-full"
      >
        <div 
          className={cn(
            "flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent shadow-lg",
            badgeSizeClasses[size],
            animated && "animate-pulse-slow"
          )}
        >
          <span className="text-white font-black">AF</span>
        </div>
        
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-baseline gap-1 justify-center flex-wrap">
            <span 
              className={cn(
                "font-black text-gray-900 dark:text-foreground",
                titleSizes[size]
              )}
              data-testid="logo-text-auto"
            >
              Auto
            </span>
            <span 
              className={cn(
                "font-black text-primary",
                titleSizes[size]
              )}
              data-testid="logo-text-force"
            >
              Force
            </span>
            <span 
              className={cn(
                "font-black text-xs align-super text-gray-900 dark:text-foreground"
              )}
              data-testid="logo-trademark"
            >
              ™
            </span>
          </div>
          
          <p 
            className={cn(
              "tracking-wide uppercase font-medium text-center text-gray-700 dark:text-gray-400",
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
  
  // Icon variant (AF circular badge)
  return (
    <div 
      className={cn(
        "flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent shadow-lg",
        badgeSizeClasses[size],
        animated && "animate-pulse-slow",
        className
      )} 
      data-testid={`logo-${variant}`}
    >
      <span className="text-white font-black">AF</span>
    </div>
  );
}

// Export alias for backwards compatibility
export { AutoForceLogo as WorkforceOSLogo };
