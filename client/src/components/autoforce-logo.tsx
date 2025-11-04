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
  
  // New Professional AutoForce Icon - Geometric "A" + Workforce Network
  const AutoForceIcon = ({ iconClassName }: { iconClassName?: string }) => (
    <svg 
      viewBox="0 0 120 120" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-full h-full", iconClassName)}
    >
      <defs>
        {/* Navy to Emerald Gradient */}
        <linearGradient id="af-primary-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0B1D3A" />
          <stop offset="50%" stopColor="#2E8B57" />
          <stop offset="100%" stopColor="#6ee7b7" />
        </linearGradient>
        
        {/* Emerald Glow Gradient */}
        <linearGradient id="af-glow-gradient" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#6ee7b7" stopOpacity="0.8"/>
          <stop offset="100%" stopColor="#2E8B57" stopOpacity="0.3"/>
        </linearGradient>
        
        {/* Glow Filter */}
        <filter id="af-glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        
        {/* Stronger Glow for Animation */}
        <filter id="af-glow-strong">
          <feGaussianBlur stdDeviation="5" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Background Circle */}
      <circle 
        cx="60" 
        cy="60" 
        r="55" 
        fill="url(#af-primary-gradient)" 
        opacity="0.08"
        className={animated ? "animate-pulse-slow" : ""}
      />
      
      {/* Outer Ring - representing workforce connection */}
      <circle 
        cx="60" 
        cy="60" 
        r="48" 
        stroke="url(#af-primary-gradient)"
        strokeWidth="2"
        fill="none"
        opacity="0.3"
        className={animated ? "animate-spin-slow" : ""}
        style={{ transformOrigin: "60px 60px", animation: animated ? "spin 20s linear infinite reverse" : "none" }}
      />
      
      {/* Geometric "A" Shape - Modern & Bold */}
      <g className={animated ? "animate-pulse-slow" : ""}>
        {/* Left side of A */}
        <path 
          d="M 45 75 L 55 35 L 60 35 L 60 75 Z" 
          fill="url(#af-primary-gradient)"
          filter="url(#af-glow)"
        />
        {/* Right side of A */}
        <path 
          d="M 65 35 L 75 75 L 60 75 L 60 35 Z" 
          fill="url(#af-primary-gradient)"
          filter="url(#af-glow)"
        />
        {/* Crossbar of A */}
        <rect 
          x="48" 
          y="52" 
          width="24" 
          height="6" 
          fill="url(#af-glow-gradient)"
          filter="url(#af-glow-strong)"
          rx="3"
        />
      </g>
      
      {/* Workforce Network Nodes - 4 orbiting dots representing people/team */}
      <g className={animated ? "animate-orbit" : ""} style={{ transformOrigin: "60px 60px" }}>
        <circle cx="60" cy="20" r="4" fill="#2E8B57" opacity="0.6">
          {animated && (
            <animate 
              attributeName="opacity" 
              values="0.4;0.8;0.4" 
              dur="3s" 
              repeatCount="indefinite"
            />
          )}
        </circle>
        <circle cx="96" cy="60" r="4" fill="#2E8B57" opacity="0.6">
          {animated && (
            <animate 
              attributeName="opacity" 
              values="0.6;1;0.6" 
              dur="3s" 
              begin="0.75s"
              repeatCount="indefinite"
            />
          )}
        </circle>
        <circle cx="60" cy="100" r="4" fill="#2E8B57" opacity="0.6">
          {animated && (
            <animate 
              attributeName="opacity" 
              values="0.4;0.8;0.4" 
              dur="3s" 
              begin="1.5s"
              repeatCount="indefinite"
            />
          )}
        </circle>
        <circle cx="24" cy="60" r="4" fill="#2E8B57" opacity="0.6">
          {animated && (
            <animate 
              attributeName="opacity" 
              values="0.6;1;0.6" 
              dur="3s" 
              begin="2.25s"
              repeatCount="indefinite"
            />
          )}
        </circle>
      </g>
      
      {/* Connection Lines - subtle network effect */}
      <g opacity="0.15" stroke="url(#af-primary-gradient)" strokeWidth="1">
        <line x1="60" y1="20" x2="60" y2="35" />
        <line x1="96" y1="60" x2="75" y2="60" />
        <line x1="60" y1="100" x2="60" y2="75" />
        <line x1="24" y1="60" x2="45" y2="60" />
      </g>
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
          <AutoForceIcon iconClassName={animated ? "animate-float" : ""} />
        </div>
        
        {/* Brand Name */}
        <div className="flex flex-col items-center gap-1 sm:gap-2 w-full px-4">
          <div className="flex items-baseline gap-1 justify-center flex-wrap">
            <span className={cn(
              "font-black bg-gradient-to-r from-[#0B1D3A] via-[#2E8B57] to-[#6ee7b7] bg-clip-text text-transparent",
              titleSizes[size]
            )}>
              AutoForce
            </span>
            <span className="text-[10px] font-black text-[#2E8B57] align-super">™</span>
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
        <AutoForceIcon iconClassName={animated ? "animate-float" : ""} />
      </div>
    );
  }

  // Navigation variant
  return (
    <div 
      className={cn(
        "flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-card/30 border border-border/50 backdrop-blur-sm max-w-full",
        className
      )} 
      data-testid="logo-nav"
    >
      <div className="relative w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0">
        <AutoForceIcon />
      </div>
      <div className="flex items-center gap-0.5 sm:gap-1 min-w-0">
        <span className="text-xs sm:text-sm font-black bg-gradient-to-r from-[#0B1D3A] via-[#2E8B57] to-[#6ee7b7] bg-clip-text text-transparent truncate">
          AutoForce
        </span>
        <span className="text-[7px] sm:text-[8px] font-black text-[#2E8B57] align-super flex-shrink-0">™</span>
      </div>
    </div>
  );
}

// Export alias for backwards compatibility during migration
export { AutoForceLogo as WorkforceOSLogo };
