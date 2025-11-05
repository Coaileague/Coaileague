import { AnimatedAutoForceLogo } from "./animated-autoforce-logo";
import { Loader2 } from "lucide-react";

interface UniversalLoadingProps {
  message?: string;
  fullScreen?: boolean;
  size?: "sm" | "md" | "lg";
}

/**
 * AutoForce™ branded loading component
 * Works seamlessly across mobile and desktop
 * Use for page transitions, data loading, and async operations
 */
export function UniversalLoading({ 
  message = "Loading AutoForce™...", 
  fullScreen = false,
  size = "md" 
}: UniversalLoadingProps) {
  // Responsive logo sizing: smaller on mobile, larger on desktop
  const logoSize = size === "sm" ? "sm" : size === "md" ? "md" : "lg";
  const spinnerSize = size === "sm" ? "h-3 w-3" : size === "md" ? "h-4 w-4" : "h-5 w-5";
  const textSize = size === "sm" ? "text-xs" : size === "md" ? "text-sm sm:text-base" : "text-base sm:text-lg";
  
  if (fullScreen) {
    return (
      <div 
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900/95 via-indigo-950/95 to-slate-900/95 backdrop-blur-xl px-4"
        data-testid="universal-loading-fullscreen"
      >
        <div className="flex flex-col items-center gap-6 sm:gap-8 w-full max-w-md">
          {/* New Animated AutoForce™ Gear Logo */}
          <AnimatedAutoForceLogo 
            variant="full" 
            size={logoSize} 
            animated={true} 
          />
          
          <div className={`flex items-center gap-2 sm:gap-3 ${textSize} text-white/90 font-medium w-full justify-center px-4`}>
            <Loader2 className={`${spinnerSize} sm:h-5 sm:w-5 animate-spin text-cyan-400 flex-shrink-0`} />
            <span className="text-center break-words">{message}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-4 sm:p-8 min-h-[200px] w-full" data-testid="universal-loading">
      <div className="flex flex-col items-center gap-4 sm:gap-6 w-full max-w-md">
        {/* New Animated AutoForce™ Gear Logo */}
        <AnimatedAutoForceLogo 
          variant="gear" 
          size={logoSize} 
          animated={true} 
        />
        
        <div className={`flex items-center gap-2 sm:gap-3 ${textSize} text-muted-foreground w-full justify-center px-4`}>
          <Loader2 className={`${spinnerSize} animate-spin text-cyan-500 flex-shrink-0`} />
          <span className="text-center break-words">{message}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton loading box for content placeholders
 */
export function LoadingBox({ className = "" }: { className?: string }) {
  return (
    <div 
      className={`animate-pulse bg-muted rounded-lg ${className}`}
      data-testid="loading-box"
    />
  );
}

/**
 * Card skeleton for list items
 */
export function LoadingCard() {
  return (
    <div className="bg-card rounded-lg border p-4 space-y-3" data-testid="loading-card">
      <div className="flex items-start gap-3">
        <LoadingBox className="h-10 w-10 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <LoadingBox className="h-4 w-3/4" />
          <LoadingBox className="h-3 w-1/2" />
        </div>
      </div>
      <LoadingBox className="h-20 w-full" />
    </div>
  );
}

/**
 * Table skeleton for data tables
 */
export function LoadingTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" data-testid="loading-table">
      {/* Header */}
      <div className="flex gap-2 pb-2 border-b">
        <LoadingBox className="h-4 flex-1" />
        <LoadingBox className="h-4 flex-1" />
        <LoadingBox className="h-4 flex-1" />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-2 py-3 border-b">
          <LoadingBox className="h-4 flex-1" />
          <LoadingBox className="h-4 flex-1" />
          <LoadingBox className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}
