/**
 * AppBootOverlay
 * 
 * Unified React-driven boot experience with percentage, messages, and blue/cyan gradient
 * Displays ResponsiveLoading until progress reaches 100% and app finishes initializing
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
    <div className="fixed inset-0 z-[99999]" data-testid="app-boot-overlay">
      <ResponsiveLoading 
        progress={Math.round(progress)}
      />
    </div>
  );
}
