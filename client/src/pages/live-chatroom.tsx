import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { WorkforceOSLogo } from "@/components/workforceos-logo";
import HelpDeskCab from "./HelpDeskCab";
import HelpDesk5 from "./HelpDesk5";

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
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Show COOL animated mobile redirect screen with 5-second countdown
  if (isMobile && showRedirectInfo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 p-6 overflow-hidden relative">
        {/* Animated Background Particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
        </div>

        {/* WorkForceOS™ Neon Logo with Glow Animation */}
        <div className={`mb-8 transition-all duration-1000 ${stage >= 1 ? 'scale-110' : 'scale-100'} w-full max-w-xs`}>
          <div className="relative px-4 flex items-center justify-center">
            <WorkforceOSLogo className="relative z-10" size="md" showText={true} />
            {/* Pulsing glow ring */}
            <div className="absolute inset-0 animate-ping opacity-20">
              <div className="w-full h-full rounded-full bg-blue-500 blur-xl" />
            </div>
          </div>
        </div>

        {/* Redirect Message Card with Animations - Mobile Optimized */}
        <div className="max-w-sm w-full bg-slate-900/60 backdrop-blur-xl border border-blue-500/30 rounded-lg p-4 sm:p-6 space-y-4 sm:space-y-6 relative z-10 transition-all duration-500">
          {/* Title with Gradient - Smaller for Mobile */}
          <div className="text-center space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent animate-pulse">
              Mobile Device Detected
            </h2>
            <p className={`text-xs sm:text-sm text-slate-300 leading-relaxed transition-opacity duration-500 ${stage >= 1 ? 'opacity-100' : 'opacity-0'}`}>
              Initializing DC360.5 Mobile Chat - your touch-optimized command center
            </p>
          </div>

          {/* Version Transition with Stage Animation */}
          <div className="bg-slate-950/50 rounded-lg p-4 border border-blue-500/20 space-y-3">
            <div className={`flex items-center justify-between transition-all duration-500 ${stage >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
              <span className="text-xs text-slate-400">Desktop Version:</span>
              <span className="text-sm font-semibold text-slate-300">DC360</span>
            </div>
            
            {/* Animated Arrow */}
            <div className="flex items-center justify-center">
              <div className="relative w-full h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent">
                <div 
                  className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full transition-all duration-5000 ease-linear"
                  style={{ left: `${progress}%` }}
                />
              </div>
            </div>
            
            <div className={`flex items-center justify-between transition-all duration-500 ${stage >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
              <span className="text-xs text-slate-400">Mobile Version:</span>
              <span className="text-sm font-semibold text-blue-400">DC360.5</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Loading...</span>
              <span className="text-blue-400 font-mono font-bold">{Math.round(progress)}%</span>
            </div>
            <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-blue-500/20">
              <div 
                className="h-full bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600 transition-all duration-300 ease-out relative"
                style={{ width: `${progress}%` }}
              >
                {/* Shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
              </div>
            </div>
          </div>

          {/* Loading Status Messages */}
          <div className="space-y-1 min-h-[3rem]">
            {stage === 0 && (
              <p className="text-center text-xs text-slate-400 animate-pulse">
                🔍 Detecting device capabilities...
              </p>
            )}
            {stage === 1 && (
              <p className="text-center text-xs text-blue-400 animate-pulse">
                ⚡ Optimizing touch interface...
              </p>
            )}
            {stage === 2 && (
              <p className="text-center text-xs text-cyan-400 animate-pulse">
                🎨 Loading mobile theme...
              </p>
            )}
            {stage === 3 && (
              <p className="text-center text-xs text-emerald-400 animate-pulse">
                🚀 Ready! Redirecting now...
              </p>
            )}
          </div>

          {/* Animated Dots */}
          <div className="flex items-center justify-center space-x-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>

        {/* Manual Override Link (subtle) */}
        <button
          onClick={() => setShowRedirectInfo(false)}
          className="mt-6 text-xs text-slate-600 hover:text-slate-400 underline transition-colors relative z-10"
          data-testid="button-cancel-redirect"
        >
          Cancel and stay on desktop version
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
