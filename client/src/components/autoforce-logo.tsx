import { cn } from "@/lib/utils";

interface AutoForceLogoProps {
  variant?: "nav" | "icon" | "full";
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  animated?: boolean;
  className?: string;
}

export function AutoForceLogo({ 
  variant = "nav",
  size = "md",
  animated = false,
  className 
}: AutoForceLogoProps) {
  
  // Size mappings
  const iconSizeClasses = {
    sm: "w-6 h-6",
    md: "w-8 h-8",
    lg: "w-12 h-12",
    xl: "w-16 h-16",
    hero: "w-32 h-32"
  };
  
  const fullSizeClasses = {
    sm: "w-32 h-32",
    md: "w-48 h-48",
    lg: "w-64 h-64",
    xl: "w-80 h-80",
    hero: "w-96 h-96"
  };
  
  // AutoForce Icon - Lightning bolt + Force symbol
  const AutoForceIcon = ({ iconClassName }: { iconClassName?: string }) => (
    <svg 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-full h-full", iconClassName)}
    >
      {/* Gradient Definition */}
      <defs>
        <linearGradient id="autoforce-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="50%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Circular Background */}
      <circle 
        cx="50" 
        cy="50" 
        r="45" 
        fill="url(#autoforce-gradient)" 
        opacity="0.1"
      />
      
      {/* Lightning Bolt Symbol (representing "Auto") */}
      <path 
        d="M55 20 L35 55 L45 55 L40 80 L65 45 L55 45 Z" 
        fill="url(#autoforce-gradient)"
        filter="url(#glow)"
        className={animated ? "animate-pulse" : ""}
      />
      
      {/* "AF" Monogram overlay */}
      <text 
        x="50" 
        y="90" 
        fontSize="14" 
        fontWeight="900" 
        fill="url(#autoforce-gradient)"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        AF
      </text>
    </svg>
  );
  
  // Full variant with tagline
  if (variant === "full") {
    const iconSizes = {
      sm: "w-16 h-16 sm:w-20 sm:h-20",
      md: "w-20 h-20 sm:w-24 sm:h-24",
      lg: "w-24 h-24 sm:w-32 sm:h-32",
      xl: "w-32 h-32 sm:w-40 sm:h-40",
      hero: "w-40 h-40 sm:w-48 sm:h-48"
    };
    
    const titleSizes = {
      sm: "text-2xl sm:text-3xl",
      md: "text-3xl sm:text-4xl",
      lg: "text-4xl sm:text-5xl",
      xl: "text-5xl sm:text-6xl",
      hero: "text-6xl sm:text-7xl"
    };
    
    const taglineSizes = {
      sm: "text-[10px] sm:text-xs",
      md: "text-xs sm:text-sm",
      lg: "text-sm sm:text-base",
      xl: "text-base sm:text-lg",
      hero: "text-lg sm:text-xl"
    };
    
    return (
      <div 
        className={cn(
          "flex flex-col items-center justify-center gap-3 sm:gap-4 w-full max-w-xs sm:max-w-sm",
          className
        )} 
        data-testid="logo-full"
      >
        {/* Icon */}
        <div className={iconSizes[size]}>
          <AutoForceIcon iconClassName={animated ? "animate-pulse-slow" : ""} />
        </div>
        
        {/* Brand Name */}
        <div className="flex flex-col items-center gap-1 sm:gap-2 w-full px-4">
          <div className="flex items-baseline gap-1 justify-center flex-wrap">
            <span className={cn(
              "font-black bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-400 bg-clip-text text-transparent",
              titleSizes[size]
            )}>
              AutoForce
            </span>
            <span className="text-[10px] font-black text-blue-500 align-super">™</span>
          </div>
          <span className={cn(
            "font-semibold text-muted-foreground text-center leading-tight break-words w-full",
            taglineSizes[size]
          )}>
            Autonomous Workforce<br className="sm:hidden" /> Management Solutions
          </span>
        </div>
      </div>
    );
  }
  
  // Icon only variant
  if (variant === "icon") {
    return (
      <div 
        className={cn(
          "relative flex-shrink-0",
          !className?.match(/[wh]-\d+/) && iconSizeClasses[size],
          className
        )} 
        data-testid="logo-icon"
      >
        <AutoForceIcon iconClassName={animated ? "animate-pulse-slow" : ""} />
      </div>
    );
  }

  // Navigation variant
  return (
    <div 
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg bg-card/30 border border-border/50 backdrop-blur-sm",
        className
      )} 
      data-testid="logo-nav"
    >
      <div className="relative w-8 h-8 flex-shrink-0">
        <AutoForceIcon />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-sm font-black bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-400 bg-clip-text text-transparent">
          AutoForce
        </span>
        <span className="text-[8px] font-black text-blue-500 align-super">™</span>
      </div>
    </div>
  );
}

// Export alias for backwards compatibility during migration
export { AutoForceLogo as WorkforceOSLogo };
