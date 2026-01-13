/**
 * Trinity Loading Screen - Universal branded loading experience
 * Uses the REAL Trinity Redesign canvas mascot with full animations
 * 
 * Features:
 * - Premium SaaS loading experience (2.8-3.5 seconds)
 * - Progressive messaging with rotating status updates
 * - Trinity canvas mascot animation
 */

import { Suspense, lazy, useState, useEffect } from "react";
const TrinityRedesign = lazy(() => import("@/components/trinity-redesign"));

const LOADING_MESSAGES = [
  "Trinity is preparing your experience...",
  "Gathering your data...",
  "Optimizing your workspace...",
  "Almost ready...",
];

export function LoadingScreen() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col items-center justify-center z-50">
      {/* Trinity Mascot - Real animated canvas mascot */}
      <div className="relative mb-8">
        <Suspense fallback={<div className="w-24 h-24" />}>
          <TrinityRedesign 
            size={96} 
            mode="THINKING"
          />
        </Suspense>
      </div>

      {/* Brand Text */}
      <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-teal-400 to-amber-400 bg-clip-text text-transparent mb-2 tracking-tight">
        CoAIleague
      </h1>
      
      {/* Progressive Loading Message */}
      <p className="text-slate-400 text-sm mb-8 min-h-[20px] transition-opacity duration-300">
        {LOADING_MESSAGES[messageIndex]}
      </p>

      {/* Loading Bar with Trinity colors */}
      <div className="w-64 h-1 bg-slate-700 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-purple-500 via-teal-500 to-amber-500 rounded-full"
          style={{
            animation: 'shimmer 2s infinite',
            backgroundSize: '200% 100%',
            backgroundPosition: '0% 0%'
          }}
        />
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0%; }
          100% { background-position: -200% 0%; }
        }
      `}</style>
    </div>
  );
}
