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
        
        // INSTANT auto-redirect after 1 second
        const redirectTimer = setTimeout(() => {
          console.log("📱 Auto-redirecting to DC360.5 Mobile Chat");
          setLocation("/mobile-chat");
        }, 1000);
        
        return () => clearTimeout(redirectTimer);
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

  // Show friendly mobile redirect info with INSTANT auto-redirect
  if (isMobile && showRedirectInfo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 p-6">
        {/* WorkforceOS Neon Logo */}
        <div className="mb-8">
          <WorkforceOSLogo className="w-32 h-32" />
        </div>

        {/* Redirect Message Card */}
        <div className="max-w-sm w-full bg-slate-900/60 backdrop-blur-xl border border-blue-500/30 rounded-lg p-6 space-y-6">
          {/* Title */}
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-blue-400">
              Mobile Device Detected
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Redirecting you to DC360.5 Mobile Chat - our touch-optimized interface designed for mobile devices
            </p>
          </div>

          {/* Version Info */}
          <div className="bg-slate-950/50 rounded-lg p-4 border border-blue-500/20">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Current Version:</span>
                <span className="text-sm font-semibold text-slate-300">DC360 (Desktop)</span>
              </div>
              <div className="flex items-center justify-center">
                <div className="h-px w-full bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Loading:</span>
                <span className="text-sm font-semibold text-blue-400">DC360.5 (Mobile)</span>
              </div>
            </div>
          </div>

          {/* Loading Animation */}
          <div className="flex items-center justify-center space-x-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '200ms' }} />
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '400ms' }} />
          </div>

          {/* Help Text */}
          <p className="text-center text-xs text-slate-500">
            Automatically redirecting in 1 second...
          </p>
        </div>

        {/* Manual Override Link (subtle) */}
        <button
          onClick={() => setShowRedirectInfo(false)}
          className="mt-4 text-xs text-slate-600 hover:text-slate-400 underline"
          data-testid="button-cancel-redirect"
        >
          Cancel and stay on desktop version
        </button>
      </div>
    );
  }

  return isMobile ? <HelpDesk5 /> : <HelpDeskCab />;
}
