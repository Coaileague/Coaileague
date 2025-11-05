import { AutoForceLogoFull } from "./autoforce-logo-full";
import { AnimatedBootupLogo } from "./animated-bootup-logo";
import { Loader2 } from "lucide-react";

interface MobileLoadingProps {
  message?: string;
  fullScreen?: boolean;
}

/**
 * Mobile-optimized loading screen with branded logo
 * Shows during page transitions and data loading
 */
export function MobileLoading({ message = "Loading...", fullScreen = false }: MobileLoadingProps) {
  if (fullScreen) {
    return (
      <div 
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900/95 via-indigo-950/95 to-slate-900/95 backdrop-blur-xl px-4"
        data-testid="mobile-loading-fullscreen"
      >
        <div className="flex flex-col items-center gap-6 sm:gap-8 w-full max-w-md">
          {/* Animated Boot-Up Logo */}
          <div className="relative w-full max-w-[200px] sm:max-w-[240px]">
            {/* Multi-layer glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/30 via-cyan-500/30 to-blue-500/30 blur-2xl sm:blur-3xl rounded-full scale-150" />
            <div className="absolute inset-0 bg-blue-400/20 blur-xl sm:blur-2xl rounded-full scale-125" />
            
            {/* Animated Boot Logo */}
            <div className="relative z-10 flex items-center justify-center">
              <AnimatedBootupLogo size="xl" />
            </div>
          </div>
          
          <div className="flex flex-col items-center gap-3 w-full">
            <div className="text-2xl font-bold text-white/90 tracking-tight">
              Auto<span className="text-primary">Force</span>™
            </div>
            <div className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base text-white/70 font-medium">
              <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin text-primary flex-shrink-0" />
              <span className="text-center break-words">{message}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-4 sm:p-8 min-h-[200px] w-full" data-testid="mobile-loading">
      <div className="flex flex-col items-center gap-4 sm:gap-6 w-full max-w-md">
        {/* Animated Boot-Up Logo - Inline version */}
        <div className="relative w-full max-w-[160px] sm:max-w-[200px]">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 blur-xl sm:blur-2xl rounded-full scale-110 sm:scale-125" />
          
          {/* Animated Boot Logo */}
          <div className="relative z-10 flex items-center justify-center">
            <AnimatedBootupLogo size="lg" />
          </div>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground w-full justify-center px-4">
          <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin text-primary flex-shrink-0" />
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
