/**
 * Trinity Loading Screen - Universal branded loading experience
 * Uses the Trinity Mascot with spectacular sparkle effects
 */

import { TrinityMascotAnimated } from "@/components/ui/trinity-mascot";

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col items-center justify-center z-50">
      {/* Trinity Mascot - Animated with sparkles */}
      <div className="relative mb-8">
        <TrinityMascotAnimated 
          size="2xl" 
          state="thinking" 
          showSparkles={true}
        />
      </div>

      {/* Brand Text */}
      <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-teal-400 to-amber-400 bg-clip-text text-transparent mb-2 tracking-tight">
        CoAIleague
      </h1>
      <p className="text-slate-400 text-sm mb-8">
        Powered by Trinity
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
