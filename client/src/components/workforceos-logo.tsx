import { cn } from "@/lib/utils";
import logoImage from "@assets/image_1761703297679.png";

interface WorkforceOSLogoProps {
  variant?: "nav" | "icon" | "full";
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  animated?: boolean;
  className?: string;
}

export function WorkforceOSLogo({ 
  variant = "nav",
  size = "md",
  animated = false,
  className 
}: WorkforceOSLogoProps) {
  
  // Realistic size mapping for icon variant (matching common UI needs)
  const iconSizeClasses = {
    sm: "w-6 h-6",      // 24px - for compact UI, icons
    md: "w-8 h-8",      // 32px - standard size
    lg: "w-12 h-12",    // 48px - larger contexts
    xl: "w-16 h-16",    // 64px - prominent placements
    hero: "w-32 h-32"   // 128px - hero sections
  };
  
  // Full variant uses larger default sizing
  const fullSizeClasses = {
    sm: "w-16 h-16",    // 64px
    md: "w-24 h-24",    // 96px
    lg: "w-32 h-32",    // 128px
    xl: "w-48 h-48",    // 192px
    hero: "w-64 h-64"   // 256px
  };
  
  // Full logo variant - complete branded image with text
  // Best for: auth pages, hero sections, prominent placements
  if (variant === "full") {
    return (
      <div 
        className={cn(
          "relative flex items-center justify-center",
          fullSizeClasses[size],
          className
        )} 
        data-testid="logo-full"
      >
        <img 
          src={logoImage} 
          alt="WorkforceOS - Full Workforce Optimization Operating System" 
          className={cn(
            "w-full h-full object-contain",
            animated && "animate-pulse-slow"
          )}
          style={{
            filter: 'drop-shadow(0 4px 12px rgba(13, 148, 136, 0.25))'
          }}
        />
      </div>
    );
  }
  
  // Icon only variant - compact size for UI elements
  // Best for: toolbars, modals, compact UI, inline contexts
  // Respects custom sizing via className
  if (variant === "icon") {
    return (
      <div 
        className={cn(
          "relative flex-shrink-0",
          // Only apply default sizing if className doesn't include width/height
          !className?.match(/[wh]-\d+/) && iconSizeClasses[size],
          className
        )} 
        data-testid="logo-icon"
      >
        <img 
          src={logoImage} 
          alt="WorkforceOS" 
          className={cn(
            "w-full h-full object-contain",
            animated && "animate-pulse-slow"
          )}
          style={{
            filter: 'drop-shadow(0 2px 8px rgba(13, 148, 136, 0.2))'
          }}
        />
      </div>
    );
  }

  // Navigation variant - optimized for sidebars/headers
  // Best for: navigation bars, sidebars, headers
  return (
    <div 
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg bg-card/30 border border-border/50 backdrop-blur-sm",
        className
      )} 
      data-testid="logo-nav"
    >
      <div className="relative w-8 h-8 flex-shrink-0">
        <img 
          src={logoImage} 
          alt="" 
          className={cn(
            "w-full h-full object-contain",
            animated && "animate-pulse-slow"
          )}
          style={{
            filter: 'drop-shadow(0 2px 6px rgba(13, 148, 136, 0.25))'
          }}
        />
      </div>
      <span className="text-sm font-bold text-foreground">WorkforceOS</span>
    </div>
  );
}
