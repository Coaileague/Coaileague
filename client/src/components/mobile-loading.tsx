import { AFCoreScan } from "./loading-indicators";
import { IsometricLoader } from "./isometric-loader";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";

interface MobileLoadingProps {
  message?: string;
  fullScreen?: boolean;
  progress?: number;
}

// Personalized loading messages for mobile users
function getMobileLoadingMessage(progress: number, userName?: string): string {
  const firstName = userName?.split(' ')[0] || userName || 'there';
  
  if (progress < 20) {
    return `Welcome back, ${firstName}...`;
  } else if (progress < 40) {
    return "Securing your connection...";
  } else if (progress < 60) {
    return "Loading your workspace...";
  } else if (progress < 80) {
    return "Preparing your dashboard...";
  } else if (progress < 95) {
    return "Almost ready...";
  } else {
    return "Complete!";
  }
}

/**
 * Mobile-optimized loading screen with AF Core Scan
 * Shows during page transitions and data loading
 * MOBILE: Real progress bar + percentage + personalized messages for user satisfaction
 */
export function MobileLoading({ message, fullScreen = false, progress }: MobileLoadingProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    // Detect mobile viewport
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

  // Get personalized message based on progress
  const userName = user?.firstName || user?.email?.split('@')[0];
  const personalizedMessage = message || getMobileLoadingMessage(animatedProgress, userName);

  if (fullScreen) {
    return (
      <div 
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900/95 via-indigo-950/95 to-slate-900/95 backdrop-blur-xl px-4"
        data-testid="mobile-loading-fullscreen"
      >
        <div className="flex flex-col items-center gap-6 sm:gap-8 w-full max-w-md">
          {/* Isometric 3D Tech Loading Animation */}
          <IsometricLoader size={isMobile ? "md" : "lg"} />
          
          {/* Progress Bar - Visible on BOTH mobile and desktop */}
          <div className="w-full space-y-3">
            {/* Horizontal progress bar */}
            <div className="h-2 sm:h-3 rounded-full overflow-hidden border-2" style={{ backgroundColor: "rgba(59, 130, 246, 0.1)", borderColor: "rgba(59, 130, 246, 0.3)" }}>
              <motion.div
                className="h-full bg-[length:200%_100%]"
                style={{ 
                  width: `${animatedProgress}%`,
                  background: "linear-gradient(90deg, #3b82f6, #22d3ee, #3b82f6)"
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

            {/* Percentage and message - NOW visible on mobile */}
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="text-2xl font-bold" style={{ color: '#3b82f6' }} data-testid="loading-percentage">
                {Math.round(animatedProgress)}%
              </div>
              <div className="text-sm text-white/70 font-medium" data-testid="loading-message">
                {personalizedMessage}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-6 sm:p-8 min-h-[200px] w-full" data-testid="mobile-loading">
      <div className="flex flex-col items-center gap-4 sm:gap-6 w-full max-w-md">
        {/* Isometric 3D Tech Loading Animation */}
        <IsometricLoader size={isMobile ? "md" : "lg"} />
        
        {/* Progress Bar - Visible on BOTH mobile and desktop */}
        <div className="w-full space-y-2">
          {/* Horizontal progress bar */}
          <div className="h-2 sm:h-3 rounded-full overflow-hidden border-2" style={{ backgroundColor: "rgba(59, 130, 246, 0.1)", borderColor: "rgba(59, 130, 246, 0.3)" }}>
            <motion.div
              className="h-full bg-[length:200%_100%]"
              style={{ 
                width: `${animatedProgress}%`,
                background: "linear-gradient(90deg, #3b82f6, #22d3ee, #3b82f6)"
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

          {/* Percentage and message - NOW visible on mobile */}
          <div className="flex flex-col items-center gap-1 text-center">
            <div className="text-xl font-bold" style={{ color: '#3b82f6' }} data-testid="loading-percentage">
              {Math.round(animatedProgress)}%
            </div>
            <div className="text-xs text-muted-foreground" data-testid="loading-message">
              {personalizedMessage}
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
