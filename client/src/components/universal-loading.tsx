import { AutoForceLogo } from "./workforceos-logo";
import { Loader2 } from "lucide-react";

interface UniversalLoadingProps {
  message?: string;
  fullScreen?: boolean;
  size?: "sm" | "md" | "lg";
}

/**
 * WorkforceOS branded loading component
 * Works seamlessly across mobile and desktop
 * Use for page transitions, data loading, and async operations
 */
export function UniversalLoading({ 
  message = "Loading WorkforceOS...", 
  fullScreen = false,
  size = "md" 
}: UniversalLoadingProps) {
  const logoSize = size === "sm" ? "md" : size === "md" ? "lg" : "xl";
  const spinnerSize = size === "sm" ? "h-3 w-3" : size === "md" ? "h-4 w-4" : "h-5 w-5";
  const textSize = size === "sm" ? "text-xs" : size === "md" ? "text-sm" : "text-base";
  
  if (fullScreen) {
    return (
      <div 
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900/95 via-indigo-950/95 to-slate-900/95 backdrop-blur-xl"
        data-testid="universal-loading-fullscreen"
      >
        <div className="flex flex-col items-center gap-8 px-4">
          {/* Large Animated Logo - Glass morphism design */}
          <div className="relative">
            {/* Multi-layer glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-teal-500/30 via-blue-500/30 to-purple-500/30 blur-3xl rounded-full scale-150" />
            <div className="absolute inset-0 bg-teal-400/20 blur-2xl rounded-full scale-125" />
            
            {/* Glass container with new professional logo */}
            <div className="relative z-10 rounded-2xl bg-gradient-to-br from-slate-900/10 via-slate-800/5 to-slate-900/10 backdrop-blur-sm p-6 border border-white/5">
              <AutoForceLogo variant="full" size={logoSize} animated={true} className="opacity-100" />
            </div>
          </div>
          
          <div className={`flex items-center gap-3 ${textSize} text-white/90 font-medium`}>
            <Loader2 className={`${spinnerSize} animate-spin text-teal-400`} />
            <span>{message}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 min-h-[200px]" data-testid="universal-loading">
      <div className="flex flex-col items-center gap-6">
        {/* Larger Logo - Better blending */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-teal-500/20 to-blue-500/20 blur-2xl rounded-full scale-125" />
          
          {/* Logo container */}
          <div className="relative z-10 rounded-2xl bg-gradient-to-br from-background/40 via-background/20 to-background/40 backdrop-blur-sm p-6 border border-border/30">
            <AutoForceLogo variant="full" size={logoSize} animated={true} className="opacity-100" />
          </div>
        </div>
        
        <div className={`flex items-center gap-3 ${textSize} text-muted-foreground`}>
          <Loader2 className={`${spinnerSize} animate-spin text-teal-500`} />
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
