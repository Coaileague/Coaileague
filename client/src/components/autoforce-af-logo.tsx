import { cn } from "@/lib/utils";
import { Zap } from "lucide-react";

interface AutoForceAFLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  variant?: "icon" | "full" | "wordmark";
  animated?: boolean;
  showF?: boolean;
  className?: string;
}

/**
 * AutoForce™ Logo Component
 * AF lightning bolt in circular Emergency Green gradient badge
 */
export function AutoForceAFLogo({
  size = "md",
  variant = "icon",
  animated = false,
  showF = false,
  className
}: AutoForceAFLogoProps) {
  
  // Size mappings for the circular badge
  const badgeSizes = {
    sm: "w-10 h-10 text-sm",
    md: "w-14 h-14 text-lg",
    lg: "w-20 h-20 text-2xl",
    xl: "w-28 h-28 text-4xl",
    hero: "w-40 h-40 text-6xl"
  };

  const textSizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
    xl: "text-xl",
    hero: "text-2xl"
  };

  // Icon only - AF circular badge with AutoForce emerald/cyan branding
  if (variant === "icon") {
    return (
      <div 
        className={cn(
          "relative flex items-center justify-center shrink-0 rounded-full shadow-lg",
          badgeSizes[size],
          animated && "animate-pulse-slow",
          className
        )}
        style={{
          background: 'linear-gradient(135deg, #3b82f6 0%, #22d3ee 100%)',
        }}
        data-testid="autoforce-af-logo-icon"
      >
        {/* Neural ring overlay - subtle concentric circles */}
        <div className="absolute inset-0 rounded-full border-2 border-white/10" />
        <div className="absolute inset-2 rounded-full border border-white/5" />
        
        {/* AF with lightning bolt styling */}
        <div className="relative flex items-center gap-0.5">
          <span className="text-white font-black tracking-tighter">A</span>
          <Zap className="w-3 h-3 text-[#E2E8F0] fill-current" />
          <span className="text-white font-black tracking-tighter">F</span>
        </div>
      </div>
    );
  }

  // Wordmark - just text with AutoForce emerald
  if (variant === "wordmark") {
    return (
      <div 
        className={cn("flex items-center gap-1 flex-wrap", className)}
        data-testid="autoforce-af-logo-wordmark"
      >
        <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          AUTO
        </span>
        <span 
          className="text-2xl sm:text-3xl font-bold tracking-tight"
          style={{ color: '#3b82f6' }}
        >
          FORCE
        </span>
        <span className="text-sm align-super text-slate-900 dark:text-white">™</span>
      </div>
    );
  }

  // Full - AF badge + text with AutoForce emerald/cyan branding
  return (
    <div 
      className={cn("flex items-center gap-3", className)}
      data-testid="autoforce-af-logo-full"
    >
      <div 
        className={cn(
          "relative shrink-0 flex items-center justify-center rounded-full shadow-lg",
          badgeSizes[size],
          animated && "animate-pulse-slow"
        )}
        style={{
          background: 'linear-gradient(135deg, #3b82f6 0%, #22d3ee 100%)',
        }}
      >
        {/* Neural ring overlay */}
        <div className="absolute inset-0 rounded-full border-2 border-white/10" />
        <div className="absolute inset-2 rounded-full border border-white/5" />
        
        {/* AF with lightning bolt */}
        <div className="relative flex items-center gap-0.5">
          <span className="text-white font-black tracking-tighter">A</span>
          <Zap className="w-4 h-4 text-[#E2E8F0] fill-current" />
          <span className="text-white font-black tracking-tighter">F</span>
        </div>
      </div>
      <div className="flex flex-col">
        <div className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight leading-none flex items-baseline gap-1 flex-wrap">
          <span className="text-slate-900 dark:text-white">AUTO</span>
          <span style={{ color: '#3b82f6' }}>FORCE</span>
          <span className="text-xs align-super text-slate-900 dark:text-white">™</span>
        </div>
        <div className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-400 font-medium tracking-wide mt-0.5">
          Autonomous Workforce Management Solutions
        </div>
      </div>
    </div>
  );
}
