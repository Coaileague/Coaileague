import { AnimatedAutoForceLogo } from "./animated-autoforce-logo";
import { IsometricLoader } from "./isometric-loader";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface UniversalLoadingProps {
  message?: string;
  fullScreen?: boolean;
  size?: "sm" | "md" | "lg";
  progress?: number;
}

// Desktop loading messages based on progress
function getLoadingMessage(progress: number): string {
  if (progress < 20) {
    return "Initializing AutoForce™...";
  } else if (progress < 40) {
    return "Loading modules...";
  } else if (progress < 60) {
    return "Preparing workspace...";
  } else if (progress < 80) {
    return "Finalizing setup...";
  } else if (progress < 95) {
    return "Almost ready...";
  } else {
    return "Complete!";
  }
}

/**
 * AutoForce™ branded loading component
 * Desktop: Percentage-based progress bar with simulated loading
 * Use for page transitions, data loading, and async operations
 */
export function UniversalLoading({ 
  message, 
  fullScreen = false,
  size = "md",
  progress 
}: UniversalLoadingProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  
  // Responsive logo sizing: smaller on mobile, larger on desktop
  const logoSize = size === "sm" ? "sm" : size === "md" ? "md" : "lg";
  const spinnerSize = size === "sm" ? "h-3 w-3" : size === "md" ? "h-4 w-4" : "h-5 w-5";
  const textSize = size === "sm" ? "text-xs" : size === "md" ? "text-sm sm:text-base" : "text-base sm:text-lg";
  
  useEffect(() => {
    if (progress !== undefined) {
      setAnimatedProgress(progress);
    } else {
      // Simulate loading progress: fast start, slow finish
      const interval = setInterval(() => {
        setAnimatedProgress(prev => {
          const next = prev + Math.random() * 4;
          return next >= 90 ? 90 : next;
        });
      }, 150);
      return () => clearInterval(interval);
    }
  }, [progress]);
  
  const displayMessage = message || getLoadingMessage(animatedProgress);
  
  if (fullScreen) {
    return (
      <div 
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900/95 dark:via-indigo-950/95 dark:to-slate-900/95 backdrop-blur-xl px-4"
        data-testid="universal-loading-fullscreen"
      >
        <div className="flex flex-col items-center gap-6 sm:gap-8 w-full max-w-md">
          {/* Isometric 3D Tech Loading Animation */}
          <IsometricLoader size={logoSize === "lg" ? "lg" : logoSize === "sm" ? "sm" : "md"} />
          
          {/* Progress Bar with Percentage */}
          <div className="w-full space-y-3">
            {/* Horizontal progress bar with animated gradient */}
            <div className="h-2 sm:h-3 bg-gray-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-[length:200%_100%]"
                style={{
                  width: `${animatedProgress}%`,
                  background: 'linear-gradient(90deg, #3b82f6 0%, #22d3ee 25%, #3b82f6 50%, #22d3ee 75%, #3b82f6 100%)',
                }}
                animate={{
                  backgroundPosition: ["0% 0%", "100% 0%"],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "linear",
                }}
              />
            </div>
            
            {/* Percentage and Message */}
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-cyan-400" data-testid="loading-percentage">
                {Math.round(animatedProgress)}%
              </div>
              <div className={`${textSize} text-gray-700 dark:text-white/90 font-medium`} data-testid="loading-message">
                {displayMessage}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-4 sm:p-8 min-h-[200px] w-full" data-testid="universal-loading">
      <div className="flex flex-col items-center gap-4 sm:gap-6 w-full max-w-md">
        {/* Isometric 3D Tech Loading Animation */}
        <IsometricLoader size={logoSize === "lg" ? "lg" : logoSize === "sm" ? "sm" : "md"} />
        
        {/* Progress Bar with Percentage */}
        <div className="w-full space-y-2">
          {/* Horizontal progress bar */}
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-[length:200%_100%]"
              style={{
                width: `${animatedProgress}%`,
                background: 'linear-gradient(90deg, #3b82f6 0%, #22d3ee 25%, #3b82f6 50%, #22d3ee 75%, #3b82f6 100%)',
              }}
              animate={{
                backgroundPosition: ["0% 0%", "100% 0%"],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          </div>
          
          {/* Percentage and Message */}
          <div className="flex flex-col items-center gap-1 text-center">
            <div className="text-xl font-bold text-blue-600 dark:text-cyan-400" data-testid="loading-percentage">
              {Math.round(animatedProgress)}%
            </div>
            <div className={`${textSize} text-muted-foreground`} data-testid="loading-message">
              {displayMessage}
            </div>
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
