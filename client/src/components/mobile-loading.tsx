import { WorkforceOSLogo } from "./workforceos-logo";
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
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900/95 via-indigo-950/95 to-slate-900/95 backdrop-blur-xl"
        data-testid="mobile-loading-fullscreen"
      >
        <div className="flex flex-col items-center gap-8 px-4">
          {/* Large Animated Logo - No text needed */}
          <div className="relative">
            {/* Soft glow behind logo */}
            <div className="absolute inset-0 bg-teal-500/20 blur-3xl rounded-full scale-150" />
            <WorkforceOSLogo size="lg" animated={true} className="relative z-10" />
          </div>
          
          <div className="flex items-center gap-3 text-base text-white/90 font-medium">
            <Loader2 className="h-5 w-5 animate-spin text-teal-400" />
            <span>{message}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 min-h-[200px]" data-testid="mobile-loading">
      <div className="flex flex-col items-center gap-6">
        {/* Larger Logo - No text */}
        <div className="relative">
          <div className="absolute inset-0 bg-teal-500/10 blur-2xl rounded-full scale-125" />
          <WorkforceOSLogo size="md" animated={true} className="relative z-10" />
        </div>
        
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-teal-500" />
          <span>{message}</span>
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
