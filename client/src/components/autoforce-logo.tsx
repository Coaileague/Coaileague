import { cn } from "@/lib/utils";

interface AutoForceLogoProps {
  variant?: "nav" | "icon" | "full";
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  animated?: boolean;
  className?: string;
  lightMode?: boolean; // For dark backgrounds, use light/white logo
}

export function AutoForceLogo({ 
  variant = "nav",
  size = "md",
  animated = false,
  className,
  lightMode = false
}: AutoForceLogoProps) {
  
  // Size mappings
  const iconSizeClasses = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
    xl: "w-16 h-16",
    hero: "w-24 h-24"
  };
  
  const fullSizeClasses = {
    sm: "w-48 h-48",
    md: "w-64 h-64",
    lg: "w-80 h-80",
    xl: "w-96 h-96",
    hero: "w-[480px] h-[480px]"
  };
  
  // AutoForce Icon - Human + AI Network (User's requested design)
  const AutoForceIcon = ({ iconClassName }: { iconClassName?: string }) => {
    // Adaptive colors based on background
    const primaryColor = lightMode ? "#FFFFFF" : "#1F2937";
    const accentColor = lightMode ? "#FCA5A5" : "#DC2626";
    const nodeColor = lightMode ? "#FECACA" : "#EF4444";
    
    return (
      <svg 
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className={cn("w-full h-full", iconClassName)}
      >
        {/* Central Human Figure */}
        <g className={animated ? "animate-pulse-slow" : ""}>
          {/* Head */}
          <circle 
            cx="50" 
            cy="30" 
            r="8" 
            fill={primaryColor}
            opacity="0.9"
          />
          {/* Body */}
          <rect 
            x="45" 
            y="38" 
            width="10" 
            height="18" 
            rx="2"
            fill={primaryColor}
            opacity="0.9"
          />
          {/* Arms */}
          <rect 
            x="38" 
            y="42" 
            width="24" 
            height="4" 
            rx="2"
            fill={primaryColor}
            opacity="0.9"
          />
          {/* Legs */}
          <rect 
            x="45" 
            y="56" 
            width="4" 
            height="12" 
            rx="2"
            fill={primaryColor}
            opacity="0.9"
          />
          <rect 
            x="51" 
            y="56" 
            width="4" 
            height="12" 
            rx="2"
            fill={primaryColor}
            opacity="0.9"
          />
        </g>

        {/* AI Work-Replacement Icons - Orbiting around human */}
        <g className={animated ? "origin-center" : ""}>
          {animated && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 50 50"
              to="360 50 50"
              dur="20s"
              repeatCount="indefinite"
            />
          )}
          
          {/* Calendar/Scheduling Icon - Top */}
          <g transform="translate(50, 8)">
            <rect x="-4" y="-4" width="8" height="8" rx="1" fill={accentColor} opacity="0.9"/>
            <line x1="-3" y1="-2" x2="3" y2="-2" stroke={lightMode ? "#1F2937" : "#FFFFFF"} strokeWidth="0.5"/>
            <line x1="-2" y1="0" x2="-2" y2="2" stroke={lightMode ? "#1F2937" : "#FFFFFF"} strokeWidth="0.5"/>
            <line x1="2" y1="0" x2="2" y2="2" stroke={lightMode ? "#1F2937" : "#FFFFFF"} strokeWidth="0.5"/>
          </g>
          
          {/* Chart/Analytics Icon - Top Right */}
          <g transform="translate(72, 15)">
            <rect x="-4" y="-4" width="8" height="8" rx="1" fill={accentColor} opacity="0.9"/>
            <polyline points="-2,2 -1,0 1,-1 2,1" stroke={lightMode ? "#1F2937" : "#FFFFFF"} strokeWidth="0.5" fill="none"/>
          </g>
          
          {/* Bot/AI Icon - Right */}
          <g transform="translate(85, 40)">
            <circle cx="0" cy="0" r="4" fill={nodeColor} opacity="0.9"/>
            <circle cx="-1" cy="-0.5" r="0.5" fill={lightMode ? "#1F2937" : "#FFFFFF"}/>
            <circle cx="1" cy="-0.5" r="0.5" fill={lightMode ? "#1F2937" : "#FFFFFF"}/>
            <path d="M -1.5 1 Q 0 1.5 1.5 1" stroke={lightMode ? "#1F2937" : "#FFFFFF"} strokeWidth="0.5" fill="none"/>
          </g>
          
          {/* Document/File Icon - Bottom Right */}
          <g transform="translate(72, 70)">
            <rect x="-4" y="-4" width="8" height="8" rx="1" fill={accentColor} opacity="0.9"/>
            <line x1="-2" y1="-1" x2="2" y2="-1" stroke={lightMode ? "#1F2937" : "#FFFFFF"} strokeWidth="0.5"/>
            <line x1="-2" y1="1" x2="2" y2="1" stroke={lightMode ? "#1F2937" : "#FFFFFF"} strokeWidth="0.5"/>
          </g>
          
          {/* Invoice/Money Icon - Bottom */}
          <g transform="translate(50, 85)">
            <rect x="-4" y="-4" width="8" height="8" rx="1" fill={accentColor} opacity="0.9"/>
            <text x="0" y="2" fontSize="6" fill={lightMode ? "#1F2937" : "#FFFFFF"} textAnchor="middle" fontWeight="bold">$</text>
          </g>
          
          {/* Clock/Time Icon - Bottom Left */}
          <g transform="translate(28, 70)">
            <circle cx="0" cy="0" r="4" fill={nodeColor} opacity="0.9"/>
            <line x1="0" y1="0" x2="0" y2="-2" stroke={lightMode ? "#1F2937" : "#FFFFFF"} strokeWidth="0.5"/>
            <line x1="0" y1="0" x2="1.5" y2="0" stroke={lightMode ? "#1F2937" : "#FFFFFF"} strokeWidth="0.5"/>
          </g>
          
          {/* Email/Communication Icon - Left */}
          <g transform="translate(15, 40)">
            <rect x="-4" y="-3" width="8" height="6" rx="1" fill={accentColor} opacity="0.9"/>
            <path d="M -4 -3 L 0 0 L 4 -3" stroke={lightMode ? "#1F2937" : "#FFFFFF"} strokeWidth="0.5" fill="none"/>
          </g>
          
          {/* Team/Users Icon - Top Left */}
          <g transform="translate(28, 15)">
            <circle cx="-1" cy="-1" r="1.5" fill={nodeColor} opacity="0.9"/>
            <circle cx="1" cy="-1" r="1.5" fill={nodeColor} opacity="0.9"/>
            <path d="M -2.5 1.5 Q -1 2 0 1.5 Q 1 2 2.5 1.5" fill={nodeColor} opacity="0.9"/>
          </g>
        </g>

        {/* Connection Lines - AI Network Branches */}
        <g stroke={accentColor} strokeWidth="1.5" opacity="0.4">
          {/* Lines from human to nodes */}
          <line x1="50" y1="30" x2="50" y2="8" />
          <line x1="55" y1="33" x2="72" y2="15" />
          <line x1="60" y1="45" x2="85" y2="40" />
          <line x1="55" y1="60" x2="72" y2="70" />
          <line x1="50" y1="68" x2="50" y2="85" />
          <line x1="45" y1="60" x2="28" y2="70" />
          <line x1="40" y1="45" x2="15" y2="40" />
          <line x1="45" y1="33" x2="28" y2="15" />
        </g>
      </svg>
    );
  };
  
  // Full variant with tagline
  if (variant === "full") {
    const iconSizes = {
      sm: "w-20 h-20",
      md: "w-24 h-24",
      lg: "w-32 h-32",
      xl: "w-40 h-40",
      hero: "w-48 h-48"
    };
    
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
        className={cn("flex flex-col items-center justify-center gap-2", className)} 
        data-testid="logo-full"
      >
        <div className={iconSizes[size]}>
          <AutoForceIcon iconClassName={animated ? "animate-float" : ""} />
        </div>
        
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-baseline gap-1 justify-center">
            <span 
              className={cn(
                "font-black",
                lightMode ? "text-white" : "text-foreground",
                titleSizes[size]
              )}
              data-testid="logo-text-auto"
            >
              Auto
            </span>
            <span 
              className={cn(
                "font-black",
                lightMode ? "text-red-300" : "text-destructive",
                titleSizes[size]
              )}
              data-testid="logo-text-force"
            >
              Force
            </span>
            <span 
              className={cn(
                "font-black text-xs align-super",
                lightMode ? "text-white" : "text-foreground"
              )}
              data-testid="logo-trademark"
            >
              ™
            </span>
          </div>
          
          <p 
            className={cn(
              "tracking-wide uppercase font-medium",
              lightMode ? "text-gray-300" : "text-muted-foreground",
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
      className={cn(iconSizeClasses[size], className)} 
      data-testid={`logo-${variant}`}
    >
      <AutoForceIcon iconClassName={animated ? "animate-float" : ""} />
    </div>
  );
}

// Export alias for backwards compatibility
export { AutoForceLogo as WorkforceOSLogo };
