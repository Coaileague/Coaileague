import { cn } from "@/lib/utils";

interface AnimatedLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  animated?: boolean;
  className?: string;
}

/**
 * CoAIleague Animated Logo - Professional Brand Design
 * Features: Circular AF badge with CoAIleague Blue gradient
 * Animations: Pulsing glow, floating animation
 */
export function WorkforceOSAnimatedLogo({ 
  size = "md", 
  animated = true,
  className 
}: AnimatedLogoProps) {
  const badgeSizes = {
    sm: "w-20 h-20 text-2xl",
    md: "w-32 h-32 text-4xl",
    lg: "w-48 h-48 text-6xl",
    xl: "w-64 h-64 text-8xl",
    hero: "w-80 h-80 text-9xl"
  };

  if (!animated) {
    // Static version - CoAIleague AF badge
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <div 
          className={cn(
            "flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent shadow-xl",
            badgeSizes[size]
          )}
          data-testid="logo-static"
        >
          <span className="text-white font-black">AF</span>
        </div>
      </div>
    );
  }

  // Animated version - CoAIleague AF badge with glow effects
  return (
    <div className={cn("flex items-center justify-center relative", className)} data-testid="logo-animated">
      {/* Multi-layer glow effects */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 blur-3xl rounded-full scale-150 animate-pulse" />
      <div className="absolute inset-0 bg-primary/15 blur-2xl rounded-full scale-125 animate-pulse" style={{ animationDelay: "0.5s" }} />
      
      {/* Main CoAIleague AF badge */}
      <div 
        className={cn(
          "relative z-10 flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent shadow-2xl animate-pulse",
          badgeSizes[size]
        )}
        style={{
          filter: 'drop-shadow(0 8px 24px rgba(37, 99, 235, 0.6))'
        }}
      >
        <span className="text-white font-black">AF</span>
      </div>
    </div>
  );
}
