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

        {/* AI Network Nodes - 8 nodes radiating outward */}
        <g>
          {/* Top */}
          <circle cx="50" cy="8" r="3" fill={accentColor} opacity="0.8">
            {animated && (
              <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
            )}
          </circle>
          {/* Top Right */}
          <circle cx="72" cy="15" r="3" fill={accentColor} opacity="0.8">
            {animated && (
              <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" begin="0.25s" repeatCount="indefinite" />
            )}
          </circle>
          {/* Right */}
          <circle cx="85" cy="40" r="3" fill={nodeColor} opacity="0.8">
            {animated && (
              <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" begin="0.5s" repeatCount="indefinite" />
            )}
          </circle>
          {/* Bottom Right */}
          <circle cx="72" cy="70" r="3" fill={accentColor} opacity="0.8">
            {animated && (
              <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" begin="0.75s" repeatCount="indefinite" />
            )}
          </circle>
          {/* Bottom */}
          <circle cx="50" cy="85" r="3" fill={accentColor} opacity="0.8">
            {animated && (
              <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" begin="1s" repeatCount="indefinite" />
            )}
          </circle>
          {/* Bottom Left */}
          <circle cx="28" cy="70" r="3" fill={nodeColor} opacity="0.8">
            {animated && (
              <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" begin="1.25s" repeatCount="indefinite" />
            )}
          </circle>
          {/* Left */}
          <circle cx="15" cy="40" r="3" fill={accentColor} opacity="0.8">
            {animated && (
              <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" begin="1.5s" repeatCount="indefinite" />
            )}
          </circle>
          {/* Top Left */}
          <circle cx="28" cy="15" r="3" fill={nodeColor} opacity="0.8">
            {animated && (
              <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" begin="1.75s" repeatCount="indefinite" />
            )}
          </circle>
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
