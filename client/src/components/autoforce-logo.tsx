import { cn } from "@/lib/utils";
import { logoConfig, getLogoSize } from "@/config/logoConfig";
import { AutoForceAFLogo } from "./autoforce-af-logo";

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
  animated = true,
  className,
  lightMode = false
}: AutoForceLogoProps) {
  // Delegate to the modern AutoForceAFLogo
  return <AutoForceAFLogo size={size} variant={variant as any} animated={animated} className={className} />;
        
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-baseline gap-1 justify-center flex-wrap">
            <span 
              className={cn(
                "font-black text-gray-900 dark:text-foreground",
                logoConfig.sizes.text[size]
              )}
              data-testid={`${logoConfig.accessibility.testIdPrefix}-text-auto`}
            >
              {logoConfig.brand.name.slice(0, 4)}
            </span>
            <span 
              className={cn(
                "font-black text-primary",
                logoConfig.sizes.text[size]
              )}
              data-testid={`${logoConfig.accessibility.testIdPrefix}-text-force`}
            >
              {logoConfig.brand.name.slice(4)}
            </span>
            <span 
              className={cn(
                "font-black text-xs align-super text-gray-900 dark:text-foreground"
              )}
              data-testid={`${logoConfig.accessibility.testIdPrefix}-trademark`}
            >
              {logoConfig.brand.trademark}
            </span>
          </div>
          
          <p 
            className={cn(
              "tracking-wide uppercase font-medium text-center text-gray-700 dark:text-gray-400",
              logoConfig.sizes.tagline[size]
            )}
            data-testid={`${logoConfig.accessibility.testIdPrefix}-tagline`}
          >
            {logoConfig.brand.tagline}
          </p>
        </div>
      </div>
    );
  }
  
  // Icon variant (AF circular badge)
  return (
    <div 
      className={cn(
        "flex items-center justify-center",
        logoConfig.badge.shape,
        logoConfig.badge.gradient,
        logoConfig.badge.shadow,
        sizeConfig.container,
        "group",
        className
      )} 
      data-testid={`${logoConfig.accessibility.testIdPrefix}-${variant}`}
    >
      <span className={cn("font-black", logoConfig.badge.text.color)}>
        {logoConfig.badge.text.content}
      </span>
    </div>
  );
}

// Export alias for backwards compatibility
export { AutoForceLogo as WorkforceOSLogo };
