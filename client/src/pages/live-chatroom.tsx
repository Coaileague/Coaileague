import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import HelpDeskCab from "./HelpDeskCab";
import HelpDesk5 from "./HelpDesk5";
import { AutoForceLogo } from "@/components/autoforce-logo";

// Device detection wrapper that loads correct chat interface
export default function LiveChatroom() {
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showRedirectInfo, setShowRedirectInfo] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(0); // Animation stages
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Detect mobile device
    const checkDevice = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isSmallScreen = window.innerWidth < 768;
      const isMobileDetected = isMobileDevice || isSmallScreen;
      
      setIsMobile(isMobileDetected);
      setIsLoading(false);
      
      // Show friendly redirect info for mobile users, then auto-redirect
      if (isMobileDetected) {
        setShowRedirectInfo(true);
        
        // Smooth progress animation over 5 seconds
        const progressInterval = setInterval(() => {
          setProgress(prev => {
            if (prev >= 100) {
              clearInterval(progressInterval);
              return 100;
            }
            return prev + 2; // Increment by 2% every 100ms = 5 seconds total
          });
        }, 100);
        
        // Stage animations
        const stage1 = setTimeout(() => setStage(1), 1000);
        const stage2 = setTimeout(() => setStage(2), 2500);
        const stage3 = setTimeout(() => setStage(3), 4000);
        
        // REDIRECT after 5 seconds
        const redirectTimer = setTimeout(() => {
          console.log("📱 Auto-redirecting to DC360.5 Mobile Chat");
          setLocation("/mobile-chat");
        }, 5000);
        
        return () => {
          clearInterval(progressInterval);
          clearTimeout(stage1);
          clearTimeout(stage2);
          clearTimeout(stage3);
          clearTimeout(redirectTimer);
        };
      }
    };

    checkDevice();

    // Re-check on resize
    const handleResize = () => {
      const isSmallScreen = window.innerWidth < 768;
      const isMobileDetected = isSmallScreen || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(isMobileDetected);
      if (isMobileDetected) {
        setShowRedirectInfo(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Show COOL animated mobile redirect screen with 5-second countdown
  if (isMobile && showRedirectInfo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-3 sm:p-6 overflow-hidden relative">
        {/* Animated Background Particles - Smaller on mobile */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-32 sm:w-64 h-32 sm:h-64 bg-muted/30/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-48 sm:w-96 h-48 sm:h-96 bg-muted/30/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        {/* AutoForce™ Neon Logo - Compact for mobile */}
        <div className={`mb-4 sm:mb-8 transition-all duration-1000 ${stage >= 1 ? 'scale-110' : 'scale-100'} w-full max-w-[200px] sm:max-w-xs`}>
          <div className="relative px-2 sm:px-4 flex items-center justify-center">
            <AutoForceLogo className="relative z-10" size="sm" variant="full" />
            {/* Pulsing glow ring */}
            <div className="absolute inset-0 animate-ping opacity-20">
              <div className="w-full h-full rounded-full bg-muted/30 blur-xl" />
            </div>
          </div>
        </div>

        {/* Redirect Message Card - Ultra Compact Mobile */}
        <div className="max-w-[340px] sm:max-w-sm w-full bg-slate-900/60 backdrop-blur-xl border border-primary/30 rounded-lg p-3 sm:p-6 space-y-3 sm:space-y-6 relative z-10 transition-all duration-500">
          {/* Title - Compact Mobile Size */}
          <div className="text-center space-y-1 sm:space-y-2">
            <h2 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-primary via-teal-400 to-accent bg-clip-text text-transparent animate-pulse leading-tight">
              Mobile Device<br className="sm:hidden" /> Detected
            </h2>
            <p className={`text-[10px] sm:text-sm text-slate-300 leading-snug px-2 transition-opacity duration-500 ${stage >= 1 ? 'opacity-100' : 'opacity-0'}`}>
              Initializing DC360.5 Mobile Chat
            </p>
          </div>

          {/* Version Transition - Compact */}
          <div className="bg-slate-950/50 rounded-lg p-2 sm:p-4 border border-primary/20 space-y-2 sm:space-y-3">
            <div className={`flex items-center justify-between transition-all duration-500 ${stage >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
              <span className="text-[10px] sm:text-xs text-slate-400">Desktop:</span>
              <span className="text-xs sm:text-sm font-semibold text-slate-300">DC360</span>
            </div>
            
            {/* Animated Arrow */}
            <div className="flex items-center justify-center py-1">
              <div className="relative w-full h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent">
                <div 
                  className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-muted/30 rounded-full transition-all duration-5000 ease-linear"
                  style={{ left: `${progress}%` }}
                />
              </div>
            </div>
            
            <div className={`flex items-center justify-between transition-all duration-500 ${stage >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
              <span className="text-[10px] sm:text-xs text-slate-400">Mobile:</span>
              <span className="text-xs sm:text-sm font-semibold text-primary">DC360.5</span>
            </div>
          </div>

          {/* Progress Bar - Compact */}
          <div className="space-y-1 sm:space-y-2">
            <div className="flex items-center justify-between text-[10px] sm:text-xs">
              <span className="text-slate-400">Loading...</span>
              <span className="text-primary font-mono font-bold">{Math.round(progress)}%</span>
            </div>
            <div className="w-full h-1.5 sm:h-2 bg-slate-950 rounded-full overflow-hidden border border-primary/20">
              <div 
                className="h-full bg-gradient-to-r from-primary via-teal-500 to-accent transition-all duration-300 ease-out relative"
                style={{ width: `${progress}%` }}
              >
                {/* Shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
              </div>
            </div>
          </div>

          {/* Loading Status - Compact Text */}
          <div className="space-y-1 min-h-[2rem] sm:min-h-[3rem]">
            {stage === 0 && (
              <p className="text-center text-[10px] sm:text-xs text-slate-400 animate-pulse leading-snug">
                🔍 Detecting device...
              </p>
            )}
            {stage === 1 && (
              <p className="text-center text-[10px] sm:text-xs text-primary animate-pulse leading-snug">
                ⚡ Optimizing interface...
              </p>
            )}
            {stage === 2 && (
              <p className="text-center text-[10px] sm:text-xs text-cyan-400 animate-pulse leading-snug">
                🎨 Loading theme...
              </p>
            )}
            {stage === 3 && (
              <p className="text-center text-[10px] sm:text-xs text-primary animate-pulse leading-snug">
                🚀 Redirecting...
              </p>
            )}
          </div>

          {/* Animated Dots - Smaller */}
          <div className="flex items-center justify-center space-x-1.5 sm:space-x-2">
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-muted/30 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-muted/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>

        {/* Manual Override Link - Smaller */}
        <button
          onClick={() => setShowRedirectInfo(false)}
          className="mt-3 sm:mt-6 text-[10px] sm:text-xs text-slate-600 hover:text-slate-400 underline transition-colors relative z-10"
          data-testid="button-cancel-redirect"
        >
          Cancel redirect
        </button>

        {/* Add custom shimmer animation */}
        <style>{`
          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(200%); }
          }
          .animate-shimmer {
            animation: shimmer 2s infinite;
          }
        `}</style>
      </div>
    );
  }

  return isMobile ? <HelpDesk5 /> : <HelpDeskCab />;
}
