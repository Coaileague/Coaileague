import { cn } from "@/lib/utils";

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
  
  // Size mappings for AF circular badge
  const badgeSizeClasses = {
    sm: "w-10 h-10 text-sm",
    md: "w-14 h-14 text-lg",
    lg: "w-16 h-16 text-xl",
    xl: "w-20 h-20 text-2xl",
    hero: "w-28 h-28 text-4xl"
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
        className={cn("flex flex-col items-center justify-center gap-4", className)} 
        data-testid="logo-full"
      >
        <div 
          className={cn(
            "flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg",
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
                "font-black text-emerald-600 dark:text-emerald-400",
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
        "flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg",
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
