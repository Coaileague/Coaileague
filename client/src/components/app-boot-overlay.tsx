/**
 * AppBootOverlay
 * 
 * Unified React-driven boot experience with percentage and blue/cyan gradient
 * Simple inline loading UI matching AutoForce™ branding
 */
import { useState, useEffect } from 'react';

export function AppBootOverlay() {
  const [isBooting, setIsBooting] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Simulate boot progress (0-100%)
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        // Fast progression 0-90%, slow 90-100%
        const next = prev >= 90 
          ? prev + Math.random() * 0.8 
          : prev + Math.random() * 4;
        return Math.min(next, 100);
      });
    }, 150);

    return () => clearInterval(progressInterval);
  }, []);

  useEffect(() => {
    // Dismiss when progress reaches 100%
    if (progress >= 100) {
      // Add small delay to ensure users see "100%" before dismissal
      const timer = setTimeout(() => {
        console.log('[AppBootOverlay] Boot complete - dismissing overlay');
        setIsBooting(false);
      }, 800); // 800ms total: show 100% briefly, then dismiss
      
      return () => clearTimeout(timer);
    }
  }, [progress]);

  if (!isBooting) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-background flex items-center justify-center" data-testid="app-boot-overlay">
      <div className="text-center space-y-4">
        {/* AutoForce™ Logo/Brand */}
        <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
          AutoForce™
        </div>
        
        {/* Progress bar */}
        <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        
        {/* Progress percentage */}
        <div className="text-sm text-muted-foreground">
          {Math.round(progress)}%
        </div>
      </div>
    </div>
  );
}
