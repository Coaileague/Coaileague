import { AFCoreScan } from "./loading-indicators";
import { useEffect, useState } from "react";

interface MobileLoadingProps {
  message?: string;
  fullScreen?: boolean;
  progress?: number;
}

/**
 * Mobile-optimized loading screen with AF Core Scan
 * Shows during page transitions and data loading
 */
export function MobileLoading({ message = "Loading AutoForce™...", fullScreen = false, progress }: MobileLoadingProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);

  useEffect(() => {
    if (progress !== undefined) {
      setAnimatedProgress(progress);
    } else {
      // Auto-animate to 90% if no progress provided
      const interval = setInterval(() => {
        setAnimatedProgress(prev => {
          const next = prev + Math.random() * 3;
          return next >= 90 ? 90 : next;
        });
      }, 150);
      return () => clearInterval(interval);
    }
  }, [progress]);

  if (fullScreen) {
    return (
      <div 
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900/95 via-indigo-950/95 to-slate-900/95 backdrop-blur-xl px-4"
        data-testid="mobile-loading-fullscreen"
      >
        <div className="flex flex-col items-center gap-8 w-full max-w-md">
          {/* AF Core Scan - Radial Progress with A→AF */}
          <AFCoreScan progress={animatedProgress} size="xl" />
          
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="text-2xl font-bold text-orange-500">
              {Math.round(animatedProgress)}%
            </div>
            <div className="text-sm text-white/70 font-medium">
              {message}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 min-h-[200px] w-full" data-testid="mobile-loading">
      <div className="flex flex-col items-center gap-6 w-full max-w-md">
        {/* AF Core Scan */}
        <AFCoreScan progress={animatedProgress} size="lg" />
        
        <div className="flex flex-col items-center gap-1 text-center">
          <div className="text-xl font-bold text-orange-500">
            {Math.round(animatedProgress)}%
          </div>
          <div className="text-xs text-muted-foreground">
            {message}
          </div>
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
